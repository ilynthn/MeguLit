// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 文库内置书源（店主：默认内置 syosetu 和 linovelib，日中对照逐段对上，国内访问有回退）。
   fixtures/novel-web/ 是 2026-11-28 从两站录下来的页面，正文只留开头几段：
     syosetu-*：本好きの下剋上（小书痴的下克上）网络版 n4830bu；linovelib-*：同一作品的书籍版译文 /novel/73，
     其中正文页末尾带站点对脚本请求给的「（內容加載失敗！請刷新或更換瀏覽器）」截断占位，search-captcha 是站内搜索的验证页。
   全部离线：传输层换成读 fixture 的假实现，不连网，临时目录结束时删除。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'novel-web');
const read = name => fs.readFileSync(path.join(FIX, name), 'utf8');
const { createFetcher, judge } = require('../services/novel/webnovel/fetch.cjs');
const syosetu = require('../services/novel/webnovel/syosetu.cjs');
const linovelib = require('../services/novel/webnovel/linovelib.cjs');
const { rankWorks, matchChapters } = require('../services/novel/webnovel/match.cjs');
const { alignChapter } = require('../services/novel/webnovel/align.cjs');
const webnovel = require('../services/novel/webnovel/index.cjs');

const tempRoot = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-novel-web-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const PAGES = {
  'https://ncode.syosetu.com/n4830bu/': 'syosetu-toc.html',
  'https://ncode.syosetu.com/n4830bu/1/': 'syosetu-chapter-1.html',
  [`https://www.linovelib.com/authorarticle/${encodeURIComponent('香月美夜')}.html`]: 'linovelib-author.html',
  'https://www.linovelib.com/novel/73.html': 'linovelib-book-73.html',
  'https://www.linovelib.com/novel/73/catalog': 'linovelib-catalog-73.html',
  'https://www.linovelib.com/novel/73/10686.html': 'linovelib-chapter-10686.html',
};
/* 录下来的站点：目录第 2–7 页用第 1 页去掉翻页代替 */
function siteTransport(log = []) {
  return async (url, options) => {
    log.push({ url, proxy: options.proxy });
    if (url.startsWith('https://api.syosetu.com/')) return { status: 200, body: read('syosetu-api-search.json') };
    const page = /^(https:\/\/ncode\.syosetu\.com\/n4830bu\/)\?p=\d+$/.exec(url);
    if (page) return { status: 200, body: read('syosetu-toc.html').replace(/<a [^>]*c-pager__item--last[^>]*>[^<]*<\/a>/, '') };
    return PAGES[url] ? { status: 200, body: read(PAGES[url]) } : { status: 404, body: 'not found' };
  };
}
const offline = (log, extra = {}) => ({ fetcher: createFetcher({ transport: siteTransport(log), sleep: async () => {}, ...extra }), proxy: '' });

/* ---------------- 解析 ---------------- */

test('syosetu: search API, table of contents with volumes and paging, chapter text keeps ruby and blank lines', () => {
  const found = syosetu.parseSearch(read('syosetu-api-search.json'));
  assert.ok(found.length >= 2);
  assert.ok(found.every(item => /^n\d{4}[a-z]+$/.test(item.id) && item.title && item.author));
  const toc = syosetu.parseToc(read('syosetu-toc.html'), 'n4830bu');
  assert.equal(toc.title, '本好きの下剋上　～司書になるためには手段を選んでいられません～');
  assert.equal(toc.author, '香月　美夜');
  assert.equal(toc.last, 7);
  assert.deepEqual(toc.chapters.slice(0, 2), [
    { id: '1', title: 'プロローグ', volume: '第一部　兵士の娘' }, { id: '2', title: '新しい生活', volume: '第一部　兵士の娘' }]);
  assert.equal(toc.chapters[5].title, '閑話　変になった妹');
  const chapter = syosetu.parseChapter(read('syosetu-chapter-1.html'));
  assert.equal(chapter.title, 'プロローグ');
  assert.deepEqual(chapter.blocks[0], { t: 'p', text: '　本須　麗乃、22歳。', ruby: [{ text: '　' }, { text: '本須　麗乃', rt: 'もとすうらの' }, { text: '、22歳。' }] });
  assert.equal(chapter.blocks[1].text, '　わたしは本が好きだ。大好きだ。');
  assert.deepEqual(chapter.blocks[3], { t: 'br' }, '<p><br /></p> stays a blank line');
  assert.ok(!chapter.blocks.some(block => /もとすうらの|（/.test(block.text || '') && !block.ruby), 'reading only lives in ruby segments');
  assert.equal(syosetu.ncodeOf('https://ncode.syosetu.com/N4830BU/1/'), 'n4830bu');
  assert.equal(syosetu.ncodeOf('本好き'), '');
});

test('linovelib: book meta, catalog with broken links and illustration pages, truncated page, author works, captcha page', () => {
  const book = linovelib.parseBook(read('linovelib-book-73.html'), '73');
  assert.equal(book.title, '小书痴的下克上 ～为了成为图书管理员不择手段～');
  assert.equal(book.author, '香月美夜');
  const catalog = linovelib.parseCatalog(read('linovelib-catalog-73.html'), '73');
  assert.deepEqual(catalog.slice(0, 2).map(({ id, title, extra }) => ({ id, title, extra })),
    [{ id: '122736', title: '插图', extra: true }, { id: '10686', title: '序章', extra: false }]);
  assert.ok(catalog[0].volume.startsWith('小书痴的下克上'));
  const broken = catalog.find(chapter => chapter.title === '木简与不可思议的热');
  assert.ok(broken && broken.id === '', 'javascript:cid(0) links have no id and are resolved later');
  const page = linovelib.parsePage(read('linovelib-chapter-10686.html'), '73', '10686');
  assert.equal(page.title, '序章');
  assert.equal(page.blocks.length, 8);
  assert.equal(page.blocks[0].text, '本须丽乃爱书。');
  assert.equal(page.truncated, true);
  assert.equal(page.blocks.at(-1).text, '从童年一直到快要大学毕业的现在，丽乃都过着这样的生活。身边');
  assert.ok(!page.blocks.some(block => /加載失敗/.test(block.text)), 'the site placeholder never reaches the reader');
  assert.equal(page.nextPage, 0);
  assert.equal(page.nextChapter, '10687');
  const works = linovelib.parseAuthor(read('linovelib-author.html'));
  assert.deepEqual(works.map(item => item.id), ['2835', '4828', '73']);
  assert.equal(judge({ status: 200, body: read('linovelib-search-captcha.html') }), 'challenge', 'search captcha is reported, not bypassed');
  assert.equal(judge({ status: 200, body: read('linovelib-chapter-10686.html') }), null);
  assert.equal(linovelib.bookIdOf('https://www.linovelib.com/novel/73/catalog'), '73');
});

/* ---------------- 日中匹配 ---------------- */

test('work matching: the main Chinese edition wins over its spin-offs by author page and title', () => {
  const works = linovelib.parseAuthor(read('linovelib-author.html')).map(item => ({ ...item, author: '香月美夜' }));
  const main = rankWorks({ title: '本好きの下剋上　～司書になるためには手段を選んでいられません～', author: '香月　美夜' }, works);
  assert.equal(main[0].id, '73');
  assert.equal(main[0].match.sure, true);
  assert.ok(main.slice(1).every(item => !item.match.sure));
  /* 番外篇对番外篇 */
  const spin = rankWorks({ title: 'ハンネローレの貴族院五年生', author: '香月　美夜' }, works);
  assert.equal(spin[0].id, '4828');
  /* 作者对、书名完全不像：不自动配 */
  const none = rankWorks({ title: '全く別の物語', author: '香月　美夜' }, works);
  assert.ok(none.every(item => !item.match.sure));
  /* 作者是日文写法、中文站用简体：白石定規 ↔ 白石定规 */
  const majo = rankWorks({ title: '魔女の旅々', author: '白石定規' }, [{ id: '2356', title: '魔女之旅', author: '白石定规' }]);
  assert.equal(majo[0].match.author, 1);
  assert.equal(majo[0].match.sure, true);
});

test('chapter matching: titles pair in order, unsure ones are flagged, extras are skipped', () => {
  const ja = syosetu.parseToc(read('syosetu-toc.html'), 'n4830bu').chapters;
  const zh = linovelib.parseCatalog(read('linovelib-catalog-73.html'), '73');
  const result = matchChapters(ja, zh);
  assert.equal(result.length, ja.length);
  const title = index => result[index].zh === null ? null : zh[result[index].zh].title;
  assert.equal(title(0), '序章');
  assert.equal(result[0].sure, true);
  assert.equal(title(1), '新生活');
  assert.equal(title(2), '屋内探险');
  assert.ok(result.every(entry => entry.zh === null || !zh[entry.zh].extra), 'illustration pages are never paired');
  const used = result.filter(entry => entry.zh !== null).map(entry => entry.zh);
  assert.deepEqual(used, [...used].sort((a, b) => a - b), 'order is kept');
  assert.equal(new Set(used).size, used.length);
});

test('work(): finds the Chinese edition offline, honours a manual pairing and "Japanese only"', async t => {
  const root = tempRoot(t);
  const log = [];
  const options = offline(log);
  const found = await webnovel.work(root, { id: 'n4830bu' }, options);
  assert.equal(found.error, undefined);
  assert.equal(found.ja.chapters.length, 42, 'all seven contents pages are read');
  assert.equal(found.zh.id, '73');
  assert.equal(found.chapters[0].zh, 1);
  assert.ok(log.some(entry => entry.url.includes('/authorarticle/')), 'matched through the author page, not the captcha search');
  assert.ok(!log.some(entry => entry.url.includes('/S6/')));
  webnovel.pair(root, { id: 'n4830bu', chapter: '1', zhChapter: '10687' });
  const forced = await webnovel.work(root, { id: 'n4830bu' }, options);
  assert.equal(forced.zh.chapters[forced.chapters[0].zh].id, '10687');
  assert.equal(forced.chapters[0].manual, true);
  webnovel.pair(root, { id: 'n4830bu', zh: null });
  const alone = await webnovel.work(root, { id: 'n4830bu' }, options);
  assert.equal(alone.zh, null);
  assert.equal(alone.manual, true);
  webnovel.pair(root, { id: 'n4830bu', zh: '' });
  assert.equal((await webnovel.work(root, { id: 'n4830bu' }, options)).zh.id, '73', 'back to automatic matching');
});

/* ---------------- 段落对齐 ---------------- */

test('alignment on the recorded chapter: real pairs found, rewritten paragraphs not forced, truncation marked, nothing lost', async t => {
  const root = tempRoot(t);
  const result = await webnovel.chapter(root, { id: 'n4830bu', chapter: '1', zh: '73', zhChapter: '10686' }, offline([]));
  assert.equal(result.zh.complete, false, 'Linovelib sent a truncated page');
  const rows = result.align.rows;
  const pairOf = start => rows.find(row => row.ja?.text.includes(start));
  assert.equal(pairOf('本須　麗乃').zh[0], '本须丽乃爱书。');
  assert.equal(pairOf('本須　麗乃').state, 'ok');
  assert.match(pairOf('それから、図書館の古い本').zh[0], /^丽乃喜欢图书馆/);
  assert.match(pairOf('もちろん、新しい紙とインク').zh[0], /^当然，她也对新纸和墨水/);
  assert.equal(pairOf('様々な知識').state, 'ok');
  /* 书籍版改写过的段落不硬配：「三度のご飯」没有中文对应 */
  assert.equal(pairOf('三度のご飯').state, 'missing');
  assert.deepEqual(pairOf('三度のご飯').zh, []);
  assert.ok(rows.some(row => row.reason === 'truncated'), 'paragraphs after the cut are marked as not sent by Linovelib');
  const zhUsed = rows.flatMap(row => row.zh || []);
  const zhSource = result.zh.blocks.filter(block => block.t === 'p').map(block => block.text);
  assert.deepEqual([...zhUsed].sort(), [...zhSource].sort(), 'every Chinese paragraph shows up exactly once');
  const ja = rows.filter(row => row.ja).map(row => row.ja.text);
  assert.deepEqual(ja, result.ja.blocks.filter(block => block.t === 'p').map(block => block.text), 'Japanese order kept');
  assert.equal(rows.filter(row => row.t === 'br').length, result.ja.blocks.filter(block => block.t === 'br').length);
});

test('alignment: a faithful 1:1 translation stays 1:1, and unrelated text is never called aligned', () => {
  const ja = ['「おはよう」と彼女は言った。', '魔法の国へ行く。', '旅人は空を飛んで城門の前に降りた。', '「ようこそ、魔女様」'].map(text => ({ t: 'p', text }));
  const zh = ['「早安」她说。', '前往魔法之国。', '旅人飞过天空，降落在城门前。', '「欢迎，魔女大人」'].map(text => ({ t: 'p', text }));
  const good = alignChapter(ja, zh);
  assert.deepEqual(good.rows.map(row => row.zh[0]), zh.map(block => block.text));
  assert.ok(good.rows.every(row => ['ok', 'weak'].includes(row.state)), good.rows.map(row => row.state + row.conf).join());
  assert.ok(good.rows.filter(row => row.state === 'ok').length >= 3, 'lines that share kanji are sure');
  const bad = alignChapter(ja, ['今天的天气很好，我们一起去公园散步吧，顺便买点水果回来。'].map(text => ({ t: 'p', text })));
  assert.ok(!bad.rows.some(row => row.state === 'ok'));
  assert.ok(bad.rows.some(row => row.state === 'extra'), 'the unmatched Chinese paragraph is still shown, on its own');
  const empty = alignChapter(ja, []);
  assert.ok(empty.rows.every(row => row.state === 'missing'));
});

/* 店主 11-28：「注音和点读拖动之类的查询依旧用我们读新闻的接口就可以了」 */
test('Japanese paragraphs get the same tokens and settled readings as the 日报 reader', async t => {
  const root = tempRoot(t);
  /* 学习组件的替身：按「本須」「麗乃」切词，词典给出读音 */
  const learning = {
    installed: () => true,
    tokenize: async text => text.split(/(本須|麗乃)/).filter(Boolean).map(surface => ({ surface, base_form: surface,
      reading: surface === '本須' ? 'もとす' : surface === '麗乃' ? 'うらの' : '', readingSource: /本須|麗乃/.test(surface) ? 'dictionary' : 'guess' })),
    readings: { resolve: list => list },
  };
  const runtime = { learning: () => learning };
  const result = await webnovel.chapter(root, { id: 'n4830bu', chapter: '1' }, { ...offline([]), runtime });
  const first = result.align.rows.find(row => row.ja).ja;
  assert.deepEqual(first.tokens.filter(token => token.r), [{ s: '本須', b: '本須', r: 'もとす' }, { s: '麗乃', b: '麗乃', r: 'うらの' }]);
  const daily = require('../services/daily.cjs');
  assert.deepEqual((await daily.paragraphTokens(runtime, [first.text]))[0].tokens, first.tokens, 'one tokenizer for both readers');
  /* 没装学习组件：照常能读，只是没有分词 */
  const plain = await webnovel.chapter(root, { id: 'n4830bu', chapter: '1' }, offline([]));
  assert.equal(plain.align.rows.find(row => row.ja).ja.tokens, undefined);
});

/* ---------------- 网络回退 ---------------- */

test('fetch routes: proxy → direct → relay → mirror, every attempt reported, clear failure when none works', async () => {
  const site = { id: 'syosetu', routes: ['proxy', 'direct', 'relay', 'mirror'], gap: 1000 };
  const calls = [];
  const timeout = async (url, options) => { calls.push(options.proxy || 'direct'); throw Object.assign(Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); };
  const none = createFetcher({ transport: timeout, sleep: async () => {} });
  await assert.rejects(none.get('https://ncode.syosetu.com/n4830bu/', { site }), error => {
    assert.equal(error.message, 'WEBNOVEL_UNREACHABLE');
    assert.deepEqual(error.attempts, [
      { route: 'proxy', state: 'skipped', reason: 'unset' }, { route: 'direct', state: 'failed', reason: 'timeout' },
      { route: 'relay', state: 'skipped', reason: 'not-deployed' }, { route: 'mirror', state: 'skipped', reason: 'none-approved' }]);
    return true;
  });
  assert.deepEqual(calls, ['direct'], 'the relay and third-party mirrors are not contacted while they are not approved');

  /* 用户填了代理：先走代理 */
  const viaProxy = createFetcher({ proxy: 'http://127.0.0.1:7890', sleep: async () => {},
    transport: async (url, options) => options.proxy ? { status: 200, body: 'ok' } : { status: 403, body: '' } });
  assert.equal((await viaProxy.get('https://ncode.syosetu.com/x/', { site })).route, 'proxy');

  /* 代理坏了：退到直连 */
  const fallback = createFetcher({ proxy: 'http://127.0.0.1:9', sleep: async () => {},
    transport: async (url, options) => { if (options.proxy) throw Error('connect ECONNREFUSED'); return { status: 200, body: 'ok' }; } });
  const got = await fallback.get('https://ncode.syosetu.com/x/', { site });
  assert.equal(got.route, 'direct');

  /* 开通后的中转站：只把目标地址作为参数交给它 */
  const relayed = [];
  const relay = createFetcher({ relay: { enabled: true, url: 'https://relay.test/novel/fetch' }, sleep: async () => {},
    transport: async url => { relayed.push(url); return url.startsWith('https://relay.test/') ? { status: 200, body: 'ok' } : { status: 403, body: '' }; } });
  assert.equal((await relay.get('https://ncode.syosetu.com/n1/', { site })).route, 'relay');
  assert.equal(relayed.at(-1), 'https://relay.test/novel/fetch?url=' + encodeURIComponent('https://ncode.syosetu.com/n1/'));
});

test('fetch: rate limits and challenges stop at once, a working route is remembered, cache and spacing are polite', async t => {
  const site = { id: 'linovelib', routes: ['direct', 'proxy'], gap: 3000 };
  let tries = 0;
  const limited = createFetcher({ proxy: 'http://127.0.0.1:7890', sleep: async () => {}, transport: async () => { tries++; return { status: 429, body: '' }; } });
  await assert.rejects(limited.get('https://www.linovelib.com/novel/73.html', { site }), /WEBNOVEL_RATE_LIMIT/);
  assert.equal(tries, 1, 'no second route after the site says slow down');
  const captcha = createFetcher({ sleep: async () => {}, transport: async () => ({ status: 200, body: read('linovelib-search-captcha.html') }) });
  await assert.rejects(captcha.get('https://www.linovelib.com/S6/', { site }), /WEBNOVEL_CHALLENGE/);

  const order = [];
  const sleeps = [];
  let clock = 0;
  const root = tempRoot(t);
  const remember = createFetcher({ root, proxy: 'http://127.0.0.1:7890', now: () => clock, sleep: async ms => { sleeps.push(ms); clock += ms; },
    transport: async (url, options) => { order.push(options.proxy ? 'proxy' : 'direct'); if (!options.proxy) throw Error('ECONNRESET'); return { status: 200, body: url }; } });
  await remember.get('https://www.linovelib.com/a.html', { site });
  await remember.get('https://www.linovelib.com/b.html', { site, ttl: 60000 });
  assert.deepEqual(order, ['direct', 'proxy', 'proxy'], 'the second request goes straight to the route that worked');
  assert.deepEqual(sleeps, [3000], 'requests to one site are spaced');
  const cached = await remember.get('https://www.linovelib.com/b.html', { site, ttl: 60000 });
  assert.equal(cached.cached, true);
  assert.equal(order.length, 3, 'a cached page is not fetched again');
  assert.ok(fs.readdirSync(path.join(root, 'cache', 'novel-web')).length >= 1);
});

test('service actions: config, test connection and search report routes and failures instead of throwing', async t => {
  const root = tempRoot(t);
  const config = webnovel.config(root, { operation: 'get' });
  assert.deepEqual(config.sources.map(source => [source.id, source.enabled]), [['syosetu', true], ['linovelib', true]], 'both built in and on by default');
  assert.deepEqual(config.sources[0].routes.map(route => route.name), ['proxy', 'direct', 'relay', 'mirror']);
  const saved = webnovel.config(root, { operation: 'save', enabled: { linovelib: false } });
  assert.equal(saved.sources[1].enabled, false);
  const ok = await webnovel.test(root, { source: 'syosetu' }, offline([]));
  assert.equal(ok.ok, true);
  assert.equal(ok.route, 'direct');
  const down = { fetcher: createFetcher({ sleep: async () => {}, transport: async () => { throw Error('ENOTFOUND'); } }), proxy: '' };
  const failed = await webnovel.test(root, { source: 'syosetu' }, down);
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'WEBNOVEL_UNREACHABLE');
  assert.ok(failed.attempts.length === 4);
  const search = await webnovel.search(root, { keyword: '本好きの下剋上' }, offline([]));
  assert.ok(search.items.length >= 2);
  const disabled = await webnovel.work(root, { id: 'n4830bu' }, offline([]));
  assert.equal(disabled.zhDisabled, true, 'a turned-off source is not contacted');
  assert.throws(() => webnovel.open({ url: 'https://example.com/' }), /URL_NOT_ALLOWED/);
});

test('the novel service and the desktop bridge route the new actions', async t => {
  const root = tempRoot(t);
  const { dispatch } = require('../services/novel/index.cjs');
  const result = await dispatch({ action: 'novel_web_config', operation: 'get' }, { db: null, root, runtime: null });
  assert.equal(result.sources.length, 2);
  /* bridge.cjs 的白名单是一长串 case，起整个 bridge 要数据库和运行时；这里只核对每个动作都在白名单里 */
  const bridge = fs.readFileSync(path.join(ROOT, 'services', 'bridge.cjs'), 'utf8');
  for (const action of ['novel_web_config', 'novel_web_test', 'novel_web_search', 'novel_web_work', 'novel_web_pair', 'novel_web_chapter', 'novel_web_open']) {
    assert.ok(bridge.includes(`case '${action}':`), action);
  }
});

/* ---------------- 致谢 ---------------- */

test('credits: the projects this feature learned from are in THIRD-PARTY.md and the credits roll', () => {
  const md = fs.readFileSync(path.join(ROOT, 'THIRD-PARTY.md'), 'utf8');
  const credits = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'credits.json'), 'utf8'));
  const items = credits.groups.flatMap(group => group.items);
  for (const name of ['Novelia', 'Light-Novel-Yuedu-Source', 'linovelib2epub', 'Built-in web novel sources']) {
    assert.ok(md.includes(name), name + ' in THIRD-PARTY.md');
    assert.ok(items.some(item => (item.match || []).some(match => match === name || name.includes(match) || match.includes(name))), name + ' credited');
  }
  assert.match(md, /auto-novel[^\n]*GPL-3\.0[^\n]*54bad223/);
  assert.match(md, /linovelib2epub[^\n]*AGPL-3\.0[^\n]*no code taken/);
});
