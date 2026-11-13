// SPDX-License-Identifier: GPL-3.0-or-later
// dl.megulit.com: mirrors the latest MeguLit installer from GitHub Releases into R2, so downloads work where GitHub
// is slow or blocked. A cron trigger checks GitHub; the fetch handler serves the file and latest.json.
import { REPO, syncDecision, shapeLatest, shapeReleases, objectKey } from './release.mjs';

const UA = 'megulit-download-mirror';
const SITE = 'https://megulit.com';
const KEEP_FILES = 3; // the current installer and two before it, for visitors mid-download during a hotfix

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sync(env).then(r => console.log('sync', JSON.stringify(r)), e => console.error('sync failed', e?.stack || e)));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

    if (path === '/sync' && request.method === 'POST') {
      if (!env.SYNC_TOKEN || request.headers.get('authorization') !== `Bearer ${env.SYNC_TOKEN}`)
        return new Response('forbidden', { status: 403 });
      try { return json(await sync(env, { force: url.searchParams.has('force') }), 0); }
      catch (e) { return json({ error: String(e?.message || e) }, 0, 500); }
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405 });

    if (path === '/latest.json' || path === '/releases.json') {
      const obj = await env.BUCKET.get(path.slice(1));
      if (!obj) return json({ error: 'not synced yet' }, 0, 503);
      return new Response(request.method === 'HEAD' ? null : obj.body, {
        headers: { ...cors(), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60', etag: obj.httpEtag },
      });
    }

    if (path === '/latest' || /^\/MeguLit-v[\d.]+-win-x64\.zip$/.test(path)) {
      const latest = await readJson(env, 'latest.json');
      if (!latest?.key) return Response.redirect(`https://github.com/${REPO}/releases/latest`, 302);
      return new Response(null, {
        status: 302,
        headers: { location: `${url.origin}/${latest.key}`, 'cache-control': 'public, max-age=60', ...cors() },
      });
    }

    /* E443 Hugging Face model files (speech model) for networks that reach neither huggingface.co nor hf-mirror.com:
       /hf/<owner>/<repo>/resolve/<40-hex revision>/<file> is served from R2, filled from Hugging Face on the first miss.
       Only the allow-listed repositories; the client still checks every byte against its SHA-256. */
    /* E??? (user, 2026-11-13: "不能全走 r2 镜像吗"): the third-party tools MeguLit downloads (Locale Emulator, the
       llama.cpp build) also go through the mirror instead of GitHub:
       /gh/<owner>/<repo>/releases/download/<tag>/<file>, filled from GitHub on the first miss, Range supported.
       Only the allow-listed repositories; the app still checks every byte against its own SHA-256. */
    if (path.startsWith('/gh/')) return serveGh(request, env, ctx, path.slice(4));
    if (path.startsWith('/hf/')) return serveModel(request, env, ctx, path.slice(4));
    if (path.startsWith('/files/')) return serveFile(request, env, ctx, path.slice(1));
    if (path === '/') return Response.redirect(`${SITE}/#download`, 302);
    return new Response('not found', { status: 404 });
  },
};

// Content-addressed files never change, so they cache forever at the edge. Range requests resume broken downloads.
// E383 runtime packs and the llama.cpp build are mirrored by hand (Release / docs); prune never touches them.
const INSTALLER = /^files\/[0-9a-f]{64}\/MeguLit-v[\d.]+-win-x64\.zip$/;
const RUNTIME_FILE = /^files\/(runtime-v[\d.]+\/MeguLit-runtime-(base|reading|voice)-v[\d.]+\.zip|b\d+\/llama-b\d+-bin-win-vulkan-x64\.zip|anki\/anki-[\d.]+-win-x64\.msi)$/; // anki: the official installer (ankitects/anki, GitHub release digest checked), for one-click install
async function serveFile(request, env, ctx, key) {
  if (!INSTALLER.test(key) && !RUNTIME_FILE.test(key)) return new Response('not found', { status: 404 });
  const cache = caches.default;
  const ranged = request.headers.has('range');
  if (!ranged && request.method === 'GET') {
    const hit = await cache.match(request);
    if (hit) return hit;
  }
  const obj = await env.BUCKET.get(key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response('not found', { status: 404 });
  const headers = new Headers(cors());
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('content-disposition', `attachment; filename="${key.split('/').pop()}"`);
  if (!('body' in obj)) return new Response(null, { status: 304, headers });
  let status = 200;
  if (obj.range && ranged) {
    const { offset = 0, length = obj.size - offset } = obj.range;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    status = 206;
  } else headers.set('content-length', String(obj.size));
  const res = new Response(request.method === 'HEAD' ? null : obj.body, { status, headers });
  if (status === 200 && request.method === 'GET') ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

async function sync(env, { force = false } = {}) {
  const state = (await readJson(env, 'state.json')) || {};
  const gh = await github(env, `/repos/${REPO}/releases/latest`, force ? null : state.etag);
  if (gh.status === 304) return { changed: false, reason: 'not-modified' };
  if (!gh.ok) throw new Error(`GitHub API ${gh.status}`);
  const release = await gh.json();
  const prev = force ? null : await readJson(env, 'latest.json');
  const decision = syncDecision(prev, release);
  const now = new Date().toISOString();

  if (decision.sync) {
    const { asset, sha256 } = decision;
    const key = objectKey(sha256, asset.name);
    const existing = await env.BUCKET.head(key);
    if (!existing || existing.size !== asset.size) await mirrorAsset(env, asset, key, sha256, release);
  }
  if (decision.sync || decision.metaOnly) {
    const latest = shapeLatest(release, decision.asset, decision.sha256, { base: env.PUBLIC_BASE || 'https://dl.megulit.com', syncedAt: now });
    await putJson(env, 'releases.json', shapeReleases(await releasesList(env)));
    // latest.json moves last: until here visitors keep getting the previous, verified installer.
    await putJson(env, 'latest.json', latest);
    const files = [latest.key, ...(state.files || []).filter(k => k !== latest.key)].slice(0, KEEP_FILES);
    await prune(env, files);
    state.files = files;
  }
  state.etag = gh.headers.get('etag') || null;
  state.checkedAt = now;
  await putJson(env, 'state.json', state);
  return { changed: Boolean(decision.sync || decision.metaOnly), reason: decision.reason, label: decision.label || null };
}

// Streams the asset from GitHub into R2. R2 itself rejects the upload when the bytes do not match the digest GitHub
// published (the sha256 put option), so nothing unverified is ever stored. With VERIFY_IN_WORKER (default on) the
// Worker also hashes the stream as a second check; set it to "0" on the free plan if the 10 ms CPU limit is hit.
async function mirrorAsset(env, asset, key, sha256, release) {
  const res = await fetch(asset.browser_download_url, { headers: { 'user-agent': UA, accept: 'application/octet-stream' }, redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
  const selfCheck = env.VERIFY_IN_WORKER !== '0';
  let toStore = res.body, hashing = null, digest = null;
  if (selfCheck) {
    let toHash;
    [toStore, toHash] = res.body.tee();
    digest = new crypto.DigestStream('SHA-256');
    hashing = toHash.pipeTo(digest);
  }
  const fixed = new FixedLengthStream(asset.size);
  const piping = toStore.pipeTo(fixed.writable);
  const putting = env.BUCKET.put(key, fixed.readable, {
    sha256,
    httpMetadata: { contentType: 'application/zip' },
    customMetadata: { tag: release.tag_name, title: release.name || '' },
  });
  try {
    await Promise.all([hashing, piping, putting]);
    if (selfCheck) {
      const got = hex(await digest.digest);
      if (got !== sha256) throw new Error(`sha256 mismatch: expected ${sha256}, got ${got}`);
    }
  } catch (e) {
    await env.BUCKET.delete(key).catch(() => {});
    throw e;
  }
}

async function releasesList(env) {
  const res = await github(env, `/repos/${REPO}/releases?per_page=60`);
  return res.ok ? res.json() : [];
}

async function prune(env, keep) {
  const listed = await env.BUCKET.list({ prefix: 'files/' });
  const stale = listed.objects.map(o => o.key).filter(k => INSTALLER.test(k) && !keep.includes(k));
  if (stale.length) await env.BUCKET.delete(stale);
}

function github(env, path, etag) {
  const headers = { 'user-agent': UA, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  if (etag) headers['if-none-match'] = etag;
  return fetch(`https://api.github.com${path}`, { headers });
}

async function readJson(env, key) {
  const obj = await env.BUCKET.get(key);
  if (!obj) return null;
  try { return await obj.json(); } catch { return null; }
}

function putJson(env, key, value) {
  return env.BUCKET.put(key, JSON.stringify(value), { httpMetadata: { contentType: 'application/json; charset=utf-8' } });
}

function json(value, maxAge = 60, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...cors(), 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${maxAge}` },
  });
}

function cors() {
  return { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, HEAD, OPTIONS', 'access-control-expose-headers': 'content-length, content-range, etag' };
}

function hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const HF_REPOS = new Set(['tsukumijima/deberta-v2-large-japanese-char-wwm-onnx', 'LeeAeron/uvr_mdx-net', 'deepghs/anime_rating']);
/* E448 offline translation models (GGUF, up to ~8 GB, too large to keep in R2): streamed straight from Hugging Face,
   Range passed through so the app can resume. Only these repositories. */
const HF_PROXY = new Set(['SakuraLLM/GalTransl-v4-4B-2601','SakuraLLM/Sakura-GalTransl-7B-v3.7','SakuraLLM/Sakura-7B-Qwen2.5-v1.0-GGUF','SakuraLLM/Sakura-GalTransl-14B-v3.8','SakuraLLM/Sakura-14B-Qwen2.5-v1.0-GGUF','Qwen/Qwen3-8B-GGUF']);
async function serveModel(request, env, ctx, rest) {
  const p = /^([\w.-]+\/[\w.-]+)\/resolve\/main\/([\w.%-]+\.gguf)$/.exec(rest);
  if (p && HF_PROXY.has(p[1])) {
    const headers = new Headers();
    const range = request.headers.get('range'); if (range) headers.set('range', range);
    const up = await fetch(`https://huggingface.co/${p[1]}/resolve/main/${p[2]}?download=true`, { headers, redirect: 'follow' });
    const out = new Headers(cors());
    for (const h of ['content-length', 'content-range', 'accept-ranges', 'content-type', 'etag']) { const v = up.headers.get(h); if (v) out.set(h, v); }
    return new Response(request.method === 'HEAD' ? null : up.body, { status: up.status, headers: out });
  }
  // files may sit in a folder of the repository (deepghs/anime_rating: <model>/model.onnx); no '..' segment
  const m = /^([\w.-]+\/[\w.-]+)\/resolve\/([0-9a-f]{40})\/([\w.-]+(?:\/[\w.-]+){0,3})$/.exec(rest);
  if (!m || !HF_REPOS.has(m[1]) || m[3].split('/').some(part => part === '..' || part === '.')) return new Response('not found', { status: 404 });
  const key = `files/hf/${m[1]}/${m[2]}/${m[3]}`;
  let obj = await env.BUCKET.head(key);
  if (!obj) {
    const up = await fetch(`https://huggingface.co/${m[1]}/resolve/${m[2]}/${m[3]}`, { redirect: 'follow' });
    if (!up.ok || !up.body) return new Response('upstream ' + up.status, { status: 502 });
    const len = Number(up.headers.get('content-length') || 0), encoded = up.headers.has('content-encoding');
    const body = len > 8e6 && !encoded ? up.body.pipeThrough(new FixedLengthStream(len)) : await up.arrayBuffer();
    await env.BUCKET.put(key, body, { httpMetadata: { contentType: 'application/octet-stream' } });
  }
  const ranged = request.headers.has('range');
  obj = await env.BUCKET.get(key, ranged ? { range: request.headers } : {});
  if (!obj) return new Response('missing', { status: 404 });
  const headers = new Headers(cors());
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  const status = ranged && obj.range ? 206 : 200;
  if (status === 206) headers.set('content-range', `bytes ${obj.range.offset}-${obj.range.offset + obj.range.length - 1}/${obj.size}`);
  return new Response(request.method === 'HEAD' ? null : obj.body, { status, headers });
}

const GH_REPOS = new Set(['xupefei/Locale-Emulator', 'ggml-org/llama.cpp', 'ankitects/anki']);
async function serveGh(request, env, ctx, rest) {
  const m = /^([\w.-]+\/[\w.-]+)\/releases\/download\/([\w.-]+)\/([\w.%-]+)$/.exec(rest);
  if (!m || !GH_REPOS.has(m[1]) || [m[2], m[3]].some(p => p === '..' || p === '.')) return new Response('not found', { status: 404 });
  const key = `files/gh/${m[1]}/${m[2]}/${m[3]}`;
  if (!(await env.BUCKET.head(key))) {
    const up = await fetch(`https://github.com/${m[1]}/releases/download/${m[2]}/${m[3]}`, { redirect: 'follow' });
    if (!up.ok || !up.body) return new Response('upstream ' + up.status, { status: 502 });
    const len = Number(up.headers.get('content-length') || 0), encoded = up.headers.has('content-encoding');
    const body = len > 8e6 && !encoded ? up.body.pipeThrough(new FixedLengthStream(len)) : await up.arrayBuffer();
    await env.BUCKET.put(key, body, { httpMetadata: { contentType: 'application/octet-stream' } });
  }
  const ranged = request.headers.has('range');
  const obj = await env.BUCKET.get(key, ranged ? { range: request.headers } : {});
  if (!obj) return new Response('missing', { status: 404 });
  const headers = new Headers(cors());
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  const status = ranged && obj.range ? 206 : 200;
  if (status === 206) headers.set('content-range', `bytes ${obj.range.offset}-${obj.range.offset + obj.range.length - 1}/${obj.size}`);
  return new Response(request.method === 'HEAD' ? null : obj.body, { status, headers });
}
