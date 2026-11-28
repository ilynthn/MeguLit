// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 网文抓取层：每个书源一条「线路」清单，按顺序试，第一条通的记下来下次先用。
     proxy  用户在书源设置里填的 HTTP 代理
     direct 本机直连（国内直连 linovelib；在日本或开了全局代理的机器上 syosetu 也能直连）
     relay  MeguLit 自家只读抓取代理（api.megulit.com/novel/fetch，方案见 docs/novel-relay-proxy.md，店主同意部署前关闭）
     mirror 评估过、对方同意的第三方反代（目前一个都没有，Novelia 的接口不是公开反代，见 PR 说明）
   礼貌访问：同一站点串行、两次请求之间留间隔，结果落盘缓存，同一章不重复抓；遇到 429 / 验证页立即停下并提示。 */
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 MeguLit';
const MAX_BODY = 6 * 1024 * 1024;

/* 店主同意部署前保持 enabled:false；同意后只改这里 */
const RELAY = { enabled: false, url: 'https://api.megulit.com/novel/fetch' };
/* 第三方反代：须对方书面同意后才登记在这里 */
const MIRRORS = [];

class RouteError extends Error {
  constructor(code, detail = {}) {
    super(code);
    Object.assign(this, detail);
  }
}

function httpsTransport(url, { proxy, headers = {}, timeout = 12000 } = {}) {
  const agent = proxy ? new https.Agent({ proxyEnv: { HTTPS_PROXY: proxy } }) : undefined;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET', agent, signal: AbortSignal.timeout(timeout),
      headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity', 'Accept-Language': 'ja,zh-CN;q=0.8,en;q=0.5', ...headers },
    }, res => {
      const parts = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY) { res.destroy(Error('WEBNOVEL_RESPONSE_TOO_LARGE')); return; }
        parts.push(chunk);
      });
      res.on('end', () => { agent?.destroy(); resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts).toString('utf8') }); });
      res.on('error', error => { agent?.destroy(); reject(error); });
    });
    req.once('error', error => { agent?.destroy(); reject(error); });
    req.end();
  });
}

/* 返回 null 表示内容可用，否则是失败原因 */
function judge(response) {
  const { status, body = '' } = response;
  if (status === 429) return 'rate';
  if (/<title>\s*(?:Just a moment|Attention Required|搜索验证)/i.test(body) || /cf-chl-|challenge-platform\/h\//.test(body)) return 'challenge';
  if (status === 403 || status === 451) return 'blocked';
  if (status === 404) return 'missing';
  if (status >= 500) return 'server';
  if (status >= 300 && status < 400) return 'redirect';
  if (status !== 200) return 'http';
  return null;
}

function createFetcher({ root, transport = httpsTransport, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)),
  relay = RELAY, mirrors = MIRRORS, proxy = '' } = {}) {
  const cacheDir = root ? path.join(root, 'cache', 'novel-web') : '';
  const queues = new Map();
  const lastAt = new Map();
  const preferred = new Map();

  const cacheFile = url => path.join(cacheDir, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  function readCache(url, ttl) {
    if (!cacheDir || !ttl) return null;
    try {
      const saved = JSON.parse(fs.readFileSync(cacheFile(url), 'utf8'));
      return saved.url === url && now() - saved.at < ttl ? saved : null;
    } catch { return null; }
  }
  function writeCache(url, body, route) {
    if (!cacheDir) return;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      const file = cacheFile(url);
      fs.writeFileSync(file + '.tmp', JSON.stringify({ url, at: now(), route, body }));
      fs.renameSync(file + '.tmp', file);
    } catch { /* 缓存写不进去不影响阅读 */ }
  }

  /* 同一 host 串行并保持最小间隔 */
  function polite(host, gap, task) {
    const previous = queues.get(host) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const wait = lastAt.has(host) ? lastAt.get(host) + gap - now() : 0;
      if (wait > 0) await sleep(wait);
      try { return await task(); } finally { lastAt.set(host, now()); }
    });
    queues.set(host, next);
    return next;
  }

  function routesFor(site, url) {
    const host = new URL(url).hostname;
    const list = [];
    for (const name of site.routes) {
      if (name === 'proxy') list.push(proxy ? { name, proxy } : { name, skip: 'unset' });
      else if (name === 'direct') list.push({ name });
      else if (name === 'relay') list.push(relay.enabled && relay.url ? { name, via: relay.url } : { name, skip: 'not-deployed' });
      else if (name === 'mirror') {
        const mirror = mirrors.find(entry => entry.hosts.includes(host));
        list.push(mirror ? { name, via: mirror.url } : { name, skip: 'none-approved' });
      }
    }
    const first = preferred.get(site.id);
    return first ? [...list.filter(route => route.name === first), ...list.filter(route => route.name !== first)] : list;
  }

  async function attempt(route, url, options) {
    const target = route.via ? `${route.via}?url=${encodeURIComponent(url)}` : url;
    const timeout = route.name === 'direct' && options.site.routes[0] !== 'direct' ? 8000 : 15000;
    return transport(target, { proxy: route.proxy || '', headers: options.headers, timeout });
  }

  /* site: { id, routes, gap }。返回 { body, route, cached } */
  async function get(url, { site, ttl = 0, headers = {} } = {}) {
    const hit = readCache(url, ttl);
    if (hit) return { body: hit.body, route: hit.route, cached: true };
    const host = new URL(url).hostname;
    return polite(host, site.gap || 1000, async () => {
      const attempts = [];
      for (const route of routesFor(site, url)) {
        if (route.skip) { attempts.push({ route: route.name, state: 'skipped', reason: route.skip }); continue; }
        let response;
        try { response = await attempt(route, url, { site, headers }); }
        catch (error) {
          attempts.push({ route: route.name, state: 'failed', reason: /timeout|abort/i.test(String(error?.name) + error?.message) ? 'timeout' : 'network' });
          continue;
        }
        const reason = judge(response);
        if (!reason) {
          preferred.set(site.id, route.name);
          writeCache(url, response.body, route.name);
          return { body: response.body, route: route.name, cached: false };
        }
        attempts.push({ route: route.name, state: 'failed', reason, status: response.status });
        /* 站点明确拒绝时不换线路硬闯：限流、验证页、作品不存在都直接告诉用户 */
        if (reason === 'rate') throw new RouteError('WEBNOVEL_RATE_LIMIT', { attempts });
        if (reason === 'challenge') throw new RouteError('WEBNOVEL_CHALLENGE', { attempts, url });
        if (reason === 'missing') throw new RouteError('WEBNOVEL_NOT_FOUND', { attempts });
      }
      throw new RouteError('WEBNOVEL_UNREACHABLE', { attempts });
    });
  }

  return { get, routesFor, preferred };
}

module.exports = { createFetcher, httpsTransport, judge, RouteError, RELAY, MIRRORS, USER_AGENT };
