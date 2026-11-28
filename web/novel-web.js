// SPDX-License-Identifier: GPL-3.0-or-later
/* 内置网文书源（syosetu 日文原文 + linovelib 中文汉化）：书源设置的一组行、网文搜索与配对页、日中对照阅读器。
   服务端在 services/novel/webnovel/。阅读设置参考 Novelia（auto-novel，GPL-3.0）的 ReaderSetting / BuildParagraphs：
   语言 日 / 中 / 日中 / 中日，译文 优先 / 并列，翻页 章节 / 滚动，折叠插图，缩进修正，方向键切章、数字键切译文。 */

import { bindLookup, paragraphHTML } from './daily-view.js';

const PREFS_KEY = 'megulit-novel-web';
const RECENT_KEY = 'megulit-novel-web-recent';
const DEFAULTS = { lang: 'jazh', mode: 'priority', translators: ['linovelib', 'megulit'], page: 'chapter', foldImages: false,
  indent: true, showSource: true, fill: true };

const messages = {
  zh: {
    sources: '内置书源', sourcesHelp: '打开就能用。日文原文来自成为小说家吧，中文汉化来自哩哩轻小说，同一部作品会自动配成日中对照。',
    syosetu: '成为小说家吧（syosetu.com）', syosetuHelp: '日文网络小说原文。国内网络和部分海外地区连不上，需要在下方填 HTTP 代理，或开全局代理。',
    linovelib: '哩哩轻小说（linovelib.com）', linovelibHelp: '中文汉化，多为书籍版译文，国内可直连。站点只给脚本每页前几段，缺的段落会标出来，可以用 MeguLit 翻译补上。',
    enabled: '启用', test: '测试连接', testing: '正在测试…', ok: (route, ms) => `可以连接 · ${route} · ${ms} 毫秒`,
    proxyHelp: '连不上成为小说家吧时再填：填你本机代理软件的 HTTP 端口，例如 http://127.0.0.1:7890（Clash 默认端口）。国内直连的哩哩轻小说不受影响。保存后点上面的「测试连接」确认。',
    siteHelp: '可选：电子书下载站的网址（用于「发现」里的 PDF / EPUB 下载），不用于网文。',
    route: { proxy: 'HTTP 代理', direct: '直连', relay: 'MeguLit 中转', mirror: '第三方反代' },
    reason: { unset: '未填写', 'not-deployed': '未开通', 'none-approved': '没有可用的', timeout: '超时', network: '连不上', blocked: '被拒绝',
      challenge: '要求人机验证', rate: '请求太频繁', server: '站点出错', missing: '不存在', http: '异常响应', redirect: '被重定向' },
    errors: {
      WEBNOVEL_UNREACHABLE: '连不上书源。', WEBNOVEL_RATE_LIMIT: '书源说请求太频繁，等一会儿再试。', WEBNOVEL_CHALLENGE: '书源要求在浏览器里完成人机验证，MeguLit 不会替你过验证。',
      WEBNOVEL_NOT_FOUND: '书源上没有这部作品或这一话。', WEBNOVEL_BAD_ID: '没认出这个作品号或链接。', WEBNOVEL_SOURCE_DISABLED: '这个书源在书源设置里关掉了。',
      WEBNOVEL_RESPONSE: '书源返回的页面看不懂，站点可能改版了。', WEBNOVEL_INTERNAL: '出了点问题，请把日志发给我们。' },
    unreachableHint: '所有线路都不通：可在 设置 → 书源设置 填 HTTP 代理，或开启系统全局代理后重试。',
    title: '网文对照', go: '搜索', back: '返回', search: '搜索成为小说家吧：书名、作者或作品号（n0000aa）', searching: '正在搜索…', empty: '没有找到作品',
    recent: '最近读过', episodes: n => `${n} 话`, finished: '完结', ongoing: '连载中', short: '短篇',
    loadingWork: '正在读取目录并寻找中文版…', zhFound: '中文版', zhNone: '还没有配上中文版', zhOff: '哩哩轻小说已关闭，只读日文',
    change: '更换', pick: '选这个', candidates: '可能是这些，选一个：', paste: '粘贴哩哩轻小说的书页链接或书号', confirm: '配对', browser: '在浏览器里搜',
    jaOnly: '只读日文', unpair: '解除配对', auto: '自动匹配', chapters: '目录', zhChapter: '中文章节', noZhChapter: '没有对应章节', unsure: '不确定',
    edition: '提示：中文多为书籍版译文，和网络连载版的章节、段落不一定一一对应，对不上的地方会标出来。',
    loadingChapter: '正在读取这一话…', prev: '上一话', next: '下一话', settings: '阅读设置', openJa: '打开原网页', openZh: '打开汉化网页',
    stats: s => `已对齐 ${s.ok} 段 · 可能 ${s.weak} · 无汉化 ${s.missing} · 原文无对应 ${s.extra}`,
    mark: { weak: '可能不对应', missing: '无对应汉化', truncated: '哩哩未提供这一段', extra: '原文无对应', merged: '与上一段合并' },
    from: { linovelib: '哩哩汉化', megulit: 'MeguLit 翻译' }, translating: '正在翻译…', partial: '哩哩轻小说只给了这一话的前几段，后面的段落标成「无对应汉化」。',
    zhError: '中文版没读到：', foldImage: '插图（点击展开）',
    prefs: { lang: '语言', ja: '日文', zh: '中文', jazh: '日中', zhja: '中日', mode: '译文', priority: '优先', parallel: '并列',
      translators: '译文来源', linovelib: '哩哩汉化', megulit: 'MeguLit 翻译', page: '翻页', chapter: '章节', scroll: '滚动',
      foldImages: '折叠插图', indent: '缩进修正', showSource: '显示译文来源', fill: '汉化缺失时用 MeguLit 翻译补',
      keys: '← → 切换上一话 / 下一话，1 / 2 切换译文来源' },
  },
  ja: {
    sources: '内蔵ソース', sourcesHelp: 'すぐ使えます。原文は小説家になろう、中国語訳は哩哩軽小説から取得し、同じ作品を日中対訳にします。',
    syosetu: '小説家になろう（syosetu.com）', syosetuHelp: '日本語の Web 小説原文。中国本土や一部の地域からは接続できないため、下の HTTP プロキシかシステム全体のプロキシが必要です。',
    linovelib: '哩哩軽小説（linovelib.com）', linovelibHelp: '中国語訳（主に書籍版）。中国本土から直接接続できます。スクリプトには各ページの冒頭しか返さないため、欠けた段落は表示で区別し、MeguLit の翻訳で補えます。',
    enabled: '有効', test: '接続テスト', testing: 'テスト中…', ok: (route, ms) => `接続できます · ${route} · ${ms} ms`,
    proxyHelp: '小説家になろうに接続できないときだけ入力します。プロキシソフトの HTTP ポート（例: http://127.0.0.1:7890）を入れ、保存後に「接続テスト」で確認してください。',
    siteHelp: '任意：電子書籍ダウンロードサイトのアドレス（「発見」の PDF / EPUB 用）。Web 小説には使いません。',
    route: { proxy: 'HTTP プロキシ', direct: '直接接続', relay: 'MeguLit 中継', mirror: '外部ミラー' },
    reason: { unset: '未設定', 'not-deployed': '未開通', 'none-approved': 'なし', timeout: 'タイムアウト', network: '接続不可', blocked: '拒否',
      challenge: '認証が必要', rate: 'リクエスト過多', server: 'サイトのエラー', missing: '見つからない', http: '異常な応答', redirect: 'リダイレクト' },
    errors: {
      WEBNOVEL_UNREACHABLE: 'ソースに接続できません。', WEBNOVEL_RATE_LIMIT: 'リクエストが多すぎます。しばらくしてからお試しください。', WEBNOVEL_CHALLENGE: 'ブラウザーでの認証が求められています。MeguLit は認証を代行しません。',
      WEBNOVEL_NOT_FOUND: '作品または話が見つかりません。', WEBNOVEL_BAD_ID: '作品番号またはリンクを認識できません。', WEBNOVEL_SOURCE_DISABLED: 'このソースは設定でオフになっています。',
      WEBNOVEL_RESPONSE: 'ページを読み取れません。サイトが変更された可能性があります。', WEBNOVEL_INTERNAL: '問題が発生しました。ログを送ってください。' },
    unreachableHint: 'どの経路もつながりません。設定 → 書籍ソース設定で HTTP プロキシを入れるか、システムのプロキシを有効にしてください。',
    title: '日中対訳', go: '検索', back: '戻る', search: '小説家になろうを検索：書名・作者・N コード', searching: '検索中…', empty: '作品が見つかりません',
    recent: '最近読んだ作品', episodes: n => `${n} 話`, finished: '完結', ongoing: '連載中', short: '短編',
    loadingWork: '目次を読み込み、中国語版を探しています…', zhFound: '中国語版', zhNone: '中国語版はまだ対応付けられていません', zhOff: '哩哩軽小説はオフです（日本語のみ）',
    change: '変更', pick: 'これにする', candidates: '候補から選んでください：', paste: '哩哩軽小説の作品ページのリンクか番号を貼り付け', confirm: '対応付け', browser: 'ブラウザーで検索',
    jaOnly: '日本語だけ読む', unpair: '対応を解除', auto: '自動で探す', chapters: '目次', zhChapter: '中国語の章', noZhChapter: '対応する章なし', unsure: '不確か',
    edition: '注意：中国語訳の多くは書籍版で、Web 版と章や段落が一致しないことがあります。一致しない箇所は表示で区別します。',
    loadingChapter: 'この話を読み込んでいます…', prev: '前の話', next: '次の話', settings: '表示設定', openJa: '原文ページ', openZh: '訳文ページ',
    stats: s => `対応 ${s.ok} · 不確か ${s.weak} · 訳なし ${s.missing} · 原文なし ${s.extra}`,
    mark: { weak: '対応が不確か', missing: '対応する訳なし', truncated: '哩哩が返さなかった段落', extra: '対応する原文なし', merged: '前の段落とまとめて訳出' },
    from: { linovelib: '哩哩訳', megulit: 'MeguLit 翻訳' }, translating: '翻訳中…', partial: '哩哩軽小説はこの話の冒頭しか返さないため、以降の段落は「対応する訳なし」になります。',
    zhError: '中国語版を読み込めません：', foldImage: '挿絵（クリックで表示）',
    prefs: { lang: '言語', ja: '日本語', zh: '中国語', jazh: '日中', zhja: '中日', mode: '訳文', priority: '優先', parallel: '並列',
      translators: '訳文ソース', linovelib: '哩哩訳', megulit: 'MeguLit 翻訳', page: 'ページ送り', chapter: '話ごと', scroll: 'スクロール',
      foldImages: '挿絵をたたむ', indent: '字下げをそろえる', showSource: '訳文の出典を表示', fill: '訳がない段落を MeguLit で翻訳',
      keys: '← → で前後の話、1 / 2 で訳文ソースを切り替え' },
  },
  en: {
    sources: 'Built-in sources', sourcesHelp: 'Ready to use. Japanese originals come from Syosetu, Chinese translations from Linovelib, and the same work is paired for side-by-side reading.',
    syosetu: 'Syosetu (syosetu.com)', syosetuHelp: 'Japanese web novel originals. Not reachable from mainland China and some regions; set an HTTP proxy below or use a system-wide proxy.',
    linovelib: 'Linovelib (linovelib.com)', linovelibHelp: 'Chinese translations, mostly of the published edition; reachable from China. The site only gives scripts the first paragraphs of each page, so missing paragraphs are marked and can be filled by MeguLit translation.',
    enabled: 'Enabled', test: 'Test connection', testing: 'Testing…', ok: (route, ms) => `Reachable · ${route} · ${ms} ms`,
    proxyHelp: 'Only needed when Syosetu cannot be reached: enter your proxy app\'s HTTP port, e.g. http://127.0.0.1:7890, save, then use Test connection above.',
    siteHelp: 'Optional: an e-book download site (for PDF / EPUB in Discover). Not used for web novels.',
    route: { proxy: 'HTTP proxy', direct: 'Direct', relay: 'MeguLit relay', mirror: 'Third-party mirror' },
    reason: { unset: 'not set', 'not-deployed': 'not available yet', 'none-approved': 'none', timeout: 'timed out', network: 'unreachable', blocked: 'refused',
      challenge: 'needs a human check', rate: 'too many requests', server: 'site error', missing: 'not found', http: 'bad response', redirect: 'redirected' },
    errors: {
      WEBNOVEL_UNREACHABLE: 'The source cannot be reached.', WEBNOVEL_RATE_LIMIT: 'The source says too many requests. Try again later.', WEBNOVEL_CHALLENGE: 'The source wants a human check in a browser. MeguLit will not solve it for you.',
      WEBNOVEL_NOT_FOUND: 'The work or episode does not exist on the source.', WEBNOVEL_BAD_ID: 'That work ID or link was not recognised.', WEBNOVEL_SOURCE_DISABLED: 'This source is turned off in source settings.',
      WEBNOVEL_RESPONSE: 'The page could not be read. The site may have changed.', WEBNOVEL_INTERNAL: 'Something went wrong. Please send us the log.' },
    unreachableHint: 'No route worked. Set an HTTP proxy in Settings → Book sources, or turn on a system-wide proxy, then try again.',
    title: 'Bilingual reading', go: 'Search', back: 'Back', search: 'Search Syosetu: title, author or N-code', searching: 'Searching…', empty: 'No works found',
    recent: 'Recently read', episodes: n => `${n} episodes`, finished: 'Finished', ongoing: 'Ongoing', short: 'Short story',
    loadingWork: 'Reading the contents and looking for the Chinese edition…', zhFound: 'Chinese edition', zhNone: 'No Chinese edition paired yet', zhOff: 'Linovelib is off; Japanese only',
    change: 'Change', pick: 'Use this', candidates: 'It may be one of these:', paste: 'Paste a Linovelib book link or number', confirm: 'Pair', browser: 'Search in browser',
    jaOnly: 'Japanese only', unpair: 'Unpair', auto: 'Find automatically', chapters: 'Contents', zhChapter: 'Chinese chapter', noZhChapter: 'No matching chapter', unsure: 'unsure',
    edition: 'Note: the Chinese text is usually the published edition, so chapters and paragraphs may not line up with the web version. Places that do not line up are marked.',
    loadingChapter: 'Loading this episode…', prev: 'Previous', next: 'Next', settings: 'Reading settings', openJa: 'Original page', openZh: 'Translation page',
    stats: s => `${s.ok} aligned · ${s.weak} unsure · ${s.missing} untranslated · ${s.extra} without original`,
    mark: { weak: 'May not match', missing: 'No matching translation', truncated: 'Linovelib did not send this paragraph', extra: 'No matching original', merged: 'Translated together with the previous paragraph' },
    from: { linovelib: 'Linovelib', megulit: 'MeguLit translation' }, translating: 'Translating…', partial: 'Linovelib only sent the first paragraphs of this episode; the rest are marked as untranslated.',
    zhError: 'Chinese edition not loaded: ', foldImage: 'Illustration (click to show)',
    prefs: { lang: 'Language', ja: 'Japanese', zh: 'Chinese', jazh: 'JA + ZH', zhja: 'ZH + JA', mode: 'Translations', priority: 'Preferred', parallel: 'Side by side',
      translators: 'Translation sources', linovelib: 'Linovelib', megulit: 'MeguLit translation', page: 'Paging', chapter: 'By episode', scroll: 'Scroll',
      foldImages: 'Fold illustrations', indent: 'Even indentation', showSource: 'Show translation source', fill: 'Fill missing paragraphs with MeguLit translation',
      keys: '← → previous / next episode, 1 / 2 switch translation source' },
  },
};
export const webMessages = locale => messages[locale] || messages.zh;

const STYLE = `
.nw-source{align-items:flex-start}.nw-source-text{flex:1;min-width:0}.nw-source-text .settings-help{margin:4px 0 0;color:var(--muted)}
.nw-source-actions{display:flex;align-items:center;gap:12px;flex-shrink:0}.nw-source-actions label{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px}
.nw-status{margin:6px 0 0;font-size:12px;line-height:1.7;color:var(--muted);white-space:pre-line}
.nw-field{display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:4px;min-width:0;flex:1}.nw-field .settings-help{color:var(--muted)}.nw-status[data-state=ok]{color:#8fd1b4}.nw-status[data-state=fail]{color:var(--accent-light)}
.nw-hint{margin:-6px 0 14px;font-size:12px;line-height:1.7;color:var(--muted)}
.nw-page{max-width:880px;margin:0 auto;padding:4px 4px 48px}.nw-head{display:flex;align-items:center;gap:12px;margin:0 0 18px}.nw-head h1{font-size:22px;margin:0;font-weight:600;min-width:0;overflow-wrap:anywhere}
.nw-back{display:inline-flex;align-items:center;gap:6px;color:var(--muted);padding:6px 10px;border-radius:10px;background:var(--surface);flex-shrink:0}.nw-back:hover{color:var(--text)}
.nw-search{display:flex;gap:8px;margin:0 0 16px}.nw-search input{flex:1;min-width:0}
.nw-list{display:grid;gap:8px;margin:0 0 20px;padding:0;list-style:none}.nw-item{display:block;width:100%;text-align:left;background:var(--surface);border-radius:14px;padding:14px 16px;color:var(--text)}
.nw-item:hover{background:var(--surface-hover)}.nw-item b{display:block;font-weight:600;font-family:var(--t-serif,serif);font-size:15px}.nw-item small{display:block;color:var(--muted);margin-top:4px;line-height:1.6}
.nw-muted{color:var(--muted);font-size:12px;line-height:1.8}.nw-error{color:var(--accent-light);font-size:13px;line-height:1.8;white-space:pre-line}
.nw-pair{background:var(--surface);border-radius:16px;padding:16px 18px;margin:0 0 16px;display:grid;gap:10px}.nw-pair-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.nw-pair-row input{flex:1;min-width:200px}.nw-tag{display:inline-block;font-size:11px;padding:1px 8px;border-radius:99px;border:1px solid #c9a24a66;color:#d8bd78}
.nw-toc{display:grid;gap:2px;margin:0;padding:0;list-style:none}.nw-toc li>button{display:flex;gap:12px;width:100%;text-align:left;padding:9px 12px;border-radius:10px;color:var(--text);align-items:baseline}
.nw-toc li>button:hover{background:var(--surface)}.nw-toc .nw-vol{margin:14px 0 4px;color:#d8bd78;font-size:12px}.nw-toc span{flex:1;min-width:0}.nw-toc em{font-style:normal;color:var(--muted);font-size:12px;max-width:45%;text-align:right}
.nw-reader{--nw-size:18px;position:relative;--dl-gold:var(--g-gold,#edb56e);--dl-rule:var(--g-rule-strong,rgba(237,181,110,.24));--dl-hair:var(--g-rule,rgba(237,181,110,.11));--dl-ease:var(--g-ease,cubic-bezier(.2,.7,.2,1))}.nw-bar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 0 10px;background:var(--bg)}
.nw-bar h1{flex:1;font-size:16px;margin:0;font-weight:600;min-width:160px}.nw-bar select{max-width:260px}
.nw-prefs{flex-basis:100%;background:var(--surface);border-radius:16px;padding:14px 18px;margin:4px 0 0;box-shadow:0 10px 30px #0006;display:grid;gap:10px;font-size:13px}.nw-prefs[hidden]{display:none}
.nw-prefs fieldset{border:0;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}.nw-prefs legend{float:left;width:96px;color:var(--muted)}
.nw-prefs label{display:inline-flex;gap:6px;align-items:center;cursor:pointer}
.nw-text{font-family:var(--t-serif,"Noto Serif JP","Noto Serif SC",serif);font-size:var(--nw-size);line-height:1.9;padding:6px 0 0}
.nw-row{margin:0 0 .9em}.nw-row p{margin:0}.nw-row .nw-ja{color:var(--text)}.nw-row .nw-zh{color:var(--muted);font-size:.9em;margin-top:.15em}
.nw-reader[data-indent=on] .nw-row p{text-indent:1em}.nw-br{height:.9em}
.nw-row[data-state=weak] .nw-zh{text-decoration:underline dotted #c9a24a88;text-underline-offset:.3em}
.nw-mark{font-family:var(--ui-font,inherit);font-size:11px;color:#d8bd78;margin-left:.6em;text-indent:0;white-space:nowrap}
.nw-row[data-state=missing] .nw-mark,.nw-row[data-state=extra] .nw-mark{color:var(--accent-light)}
.nw-from{font-family:var(--ui-font,inherit);font-size:10px;color:var(--muted);margin-right:.5em;opacity:.8}
.nw-img img{max-width:100%;border-radius:10px;display:block;margin:8px auto}.nw-img summary{cursor:pointer;color:var(--muted);font-size:13px}
.nw-foot{display:flex;justify-content:space-between;gap:8px;margin:28px 0 0}
`;
function ensureStyle() {
  if (document.querySelector('style[data-novel-web]')) return;
  const style = document.createElement('style');
  style.dataset.novelWeb = '';
  style.textContent = STYLE;
  document.head.append(style);
}

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    const prefs = { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
    if (!['ja', 'zh', 'jazh', 'zhja'].includes(prefs.lang)) prefs.lang = DEFAULTS.lang;
    if (!Array.isArray(prefs.translators)) prefs.translators = DEFAULTS.translators.slice();
    prefs.translators = prefs.translators.filter(id => DEFAULTS.translators.includes(id));
    return prefs;
  } catch { return { ...DEFAULTS, translators: DEFAULTS.translators.slice() }; }
}
const savePrefs = prefs => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* 隐私模式 */ } };
function readRecent() { try { const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(list) ? list.slice(0, 8) : []; } catch { return []; } }
function remember(item) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...readRecent().filter(entry => entry.id !== item.id)].slice(0, 8))); } catch { /* 隐私模式 */ }
}

/* 出错说明：错误码 + 每条线路的结果 */
export function explain(w, result) {
  const base = w.errors[result?.error] || w.errors.WEBNOVEL_UNREACHABLE;
  const attempts = (result?.attempts || []).map(entry => `${w.route[entry.route] || entry.route}：${w.reason[entry.reason] || entry.reason}`);
  const unreachable = result?.error === 'WEBNOVEL_UNREACHABLE' && attempts.length;
  return [base, attempts.join(' · '), unreachable ? w.unreachableHint : ''].filter(Boolean).join('\n');
}

/* ---------------- 书源设置 ---------------- */

export async function mountWebSourceSettings(host, { api, locale, esc, toast }) {
  ensureStyle();
  const w = webMessages(locale);
  host.innerHTML = `<form class="panel" data-web-sources>
      <h3 class="panel-title">${esc(w.sources)}</h3>
      <p class="nw-hint">${esc(w.sourcesHelp)}</p>
      ${['syosetu', 'linovelib'].map(id => `<div class="settings-row nw-source" data-source="${id}">
        <div class="nw-source-text"><span class="settings-label">${esc(w[id])}</span>
          <p class="settings-help">${esc(w[id + 'Help'])}</p><p class="nw-status" data-status role="status"></p></div>
        <div class="nw-source-actions"><label>${esc(w.enabled)}<input type="checkbox" class="switch" name="${id}" checked></label>
          <button type="button" class="secondary" data-test="${id}">${esc(w.test)}</button></div>
      </div>`).join('')}
    </form>`;
  const form = host.querySelector('[data-web-sources]');
  const statusOf = id => form.querySelector(`[data-source="${id}"] [data-status]`);
  const show = state => {
    for (const source of state.sources || []) {
      form.elements[source.id].checked = source.enabled;
      const routes = source.routes.map(route => `${w.route[route.name]}：${route.state === 'ready' ? '✓' : w.reason[route.state] || route.state}`);
      const status = statusOf(source.id);
      if (!status.dataset.state) status.textContent = routes.join(' · ');
    }
  };
  form.onchange = async event => {
    if (event.target.type !== 'checkbox') return;
    try { show(await api('novel_web_config', { operation: 'save', enabled: { [event.target.name]: event.target.checked } })); }
    catch { toast(w.errors.WEBNOVEL_INTERNAL); }
  };
  form.onclick = async event => {
    const button = event.target.closest('[data-test]');
    if (!button) return;
    const id = button.dataset.test;
    const status = statusOf(id);
    button.disabled = true;
    status.dataset.state = 'busy';
    status.textContent = w.testing;
    try {
      const result = await api('novel_web_test', { source: id });
      status.dataset.state = result.ok ? 'ok' : 'fail';
      status.textContent = result.ok ? w.ok(w.route[result.route] || result.route, result.ms) : explain(w, result);
    } catch {
      status.dataset.state = 'fail';
      status.textContent = w.errors.WEBNOVEL_INTERNAL;
    } finally { button.disabled = false; }
  };
  try { show(await api('novel_web_config', { operation: 'get' })); } catch { /* 旧服务端：不显示状态 */ }
}

/* ---------------- 网文页 ---------------- */

export function mountWebNovel(host, { api, locale = 'zh', esc, toast, onBack, lookup }) {
  ensureStyle();
  const w = webMessages(locale);
  const prefs = loadPrefs();
  let alive = true;
  let view = 'home';
  let work = null;
  let reading = null;
  let request = 0;
  const translations = new Map();
  const back = label => `<button type="button" class="nw-back" data-nw-back>‹ ${esc(label || w.back)}</button>`;

  function home(results, note = '') {
    view = 'home';
    const recent = readRecent();
    host.innerHTML = `<div class="nw-page">
      <div class="nw-head">${back()}<h1>${esc(w.title)}</h1></div>
      <form class="nw-search" data-nw-search><input name="q" type="search" autocomplete="off" spellcheck="false" placeholder="${esc(w.search)}" aria-label="${esc(w.search)}"><button class="secondary">${esc(w.go)}</button></form>
      <div data-nw-results>${note ? `<p class="nw-muted">${esc(note)}</p>` : results ? resultList(results) : ''}</div>
      ${recent.length && !results ? `<p class="nw-muted">${esc(w.recent)}</p><ul class="nw-list">${recent.map(item => `<li><button type="button" class="nw-item" data-nw-work="${esc(item.id)}"><b>${esc(item.title)}</b><small>${esc(item.author || '')}</small></button></li>`).join('')}</ul>` : ''}
      <p class="nw-muted">${esc(w.edition)}</p>
    </div>`;
    host.querySelector('[data-nw-search] input').focus({ preventScroll: true });
  }
  const resultList = items => items.length ? `<ul class="nw-list">${items.map(item => `<li><button type="button" class="nw-item" data-nw-work="${esc(item.id)}">
      <b>${esc(item.title)}</b><small>${esc([item.author, item.short ? w.short : w.episodes(item.episodes), item.finished === true ? w.finished : item.finished === false ? w.ongoing : ''].filter(Boolean).join(' · '))}</small>
      ${item.intro ? `<small>${esc(item.intro.slice(0, 120))}</small>` : ''}</button></li>`).join('')}</ul>` : `<p class="nw-muted">${esc(w.empty)}</p>`;

  async function searchFor(keyword) {
    const ticket = ++request;
    host.querySelector('[data-nw-results]').innerHTML = `<p class="nw-muted">${esc(w.searching)}</p>`;
    const result = await api('novel_web_search', { keyword }).catch(() => ({ error: 'WEBNOVEL_INTERNAL', items: [] }));
    if (!alive || ticket !== request || view !== 'home') return;
    host.querySelector('[data-nw-results]').innerHTML = result.error ? `<p class="nw-error">${esc(explain(w, result))}</p>` : resultList(result.items);
  }

  async function openWork(id) {
    const ticket = ++request;
    view = 'work';
    host.innerHTML = `<div class="nw-page"><div class="nw-head">${back()}<h1>…</h1></div><p class="nw-muted">${esc(w.loadingWork)}</p></div>`;
    const result = await api('novel_web_work', { id }).catch(() => ({ error: 'WEBNOVEL_INTERNAL' }));
    if (!alive || ticket !== request) return;
    if (result.error) {
      host.innerHTML = `<div class="nw-page"><div class="nw-head">${back()}<h1>${esc(w.title)}</h1></div><p class="nw-error">${esc(explain(w, result))}</p></div>`;
      return;
    }
    work = result;
    remember({ id: result.ja.id, title: result.ja.title, author: result.ja.author });
    paintWork();
  }

  function pairPanel() {
    if (work.zhDisabled) return `<div class="nw-pair"><p class="nw-muted">${esc(w.zhOff)}</p></div>`;
    if (work.zh) {
      return `<div class="nw-pair"><div class="nw-pair-row"><span class="nw-tag">${esc(w.zhFound)}</span><b>${esc(work.zh.title)}</b>
        <span class="nw-muted">${esc(work.zh.author || '')}</span>
        <button type="button" class="secondary" data-nw-change>${esc(w.change)}</button></div></div>`;
    }
    const candidates = (work.candidates || []).filter(item => item.match.score > 0.25);
    return `<div class="nw-pair">
      <p class="nw-muted">${esc(work.zhError ? w.zhError + explain(w, work.zhError) : w.zhNone)}</p>
      ${candidates.length ? `<p class="nw-muted">${esc(w.candidates)}</p><div class="nw-pair-row">${candidates.map(item =>
        `<button type="button" class="secondary" data-nw-pick="${esc(item.id)}">${esc(item.title)}</button>`).join('')}</div>` : ''}
      <form class="nw-pair-row" data-nw-paste><input name="zh" autocomplete="off" spellcheck="false" placeholder="${esc(w.paste)}" aria-label="${esc(w.paste)}">
        <button class="secondary">${esc(w.confirm)}</button>
        ${work.searchUrl ? `<button type="button" class="secondary" data-nw-browser>${esc(w.browser)}</button>` : ''}</form>
      <div class="nw-pair-row">${work.manual ? `<button type="button" class="secondary" data-nw-auto>${esc(w.auto)}</button>` : `<button type="button" class="secondary" data-nw-jaonly>${esc(w.jaOnly)}</button>`}</div>
    </div>`;
  }

  function paintWork() {
    view = 'work';
    let volume = null;
    const rows = work.ja.chapters.map((chapter, index) => {
      const head = chapter.volume && chapter.volume !== volume ? `<li class="nw-vol">${esc(chapter.volume)}</li>` : '';
      volume = chapter.volume;
      const match = work.chapters?.[index];
      const zh = match && match.zh !== null ? work.zh.chapters[match.zh] : null;
      const note = !work.zh ? '' : zh ? `${zh.title}${match.sure ? '' : ' · ' + w.unsure}` : w.noZhChapter;
      return `${head}<li><button type="button" data-nw-read="${index}"><span>${esc(chapter.title)}</span><em>${esc(note)}</em></button></li>`;
    }).join('');
    host.innerHTML = `<div class="nw-page">
      <div class="nw-head">${back()}<h1>${esc(work.ja.title)}</h1></div>
      <p class="nw-muted">${esc(work.ja.author)}</p>
      ${pairPanel()}
      <p class="nw-muted">${esc(w.chapters)} · ${esc(w.episodes(work.ja.chapters.length))}</p>
      <ul class="nw-toc">${rows}</ul>
    </div>`;
  }

  async function savePair(payload) {
    try {
      await api('novel_web_pair', { id: work.ja.id, ...payload });
      await openWork(work.ja.id);
    } catch (error) { toast(w.errors[error.message] || w.errors.WEBNOVEL_BAD_ID); }
  }

  /* ---------------- 对照阅读 ---------------- */

  async function openChapter(index, { keepScroll = false, append = false } = {}) {
    const chapter = work.ja.chapters[index];
    if (!chapter) return;
    const ticket = ++request;
    const match = work.chapters?.[index];
    const zhChapter = work.zh && match && match.zh !== null ? work.zh.chapters[match.zh] : null;
    if (!append) {
      view = 'read';
      reading = { index, parts: [] };
      host.innerHTML = readerShell(chapter);
      bindPrefs();
      bindReaderLookup();
    }
    const body = host.querySelector('[data-nw-text]');
    const loading = document.createElement('p');
    loading.className = 'nw-muted';
    loading.textContent = w.loadingChapter;
    body.append(loading);
    const result = await api('novel_web_chapter', {
      id: work.ja.id, chapter: chapter.id, zh: zhChapter ? work.zh.id : undefined,
      zhChapter: zhChapter?.id || undefined, zhIndex: zhChapter && !zhChapter.id ? match.zh : undefined,
    }).catch(() => ({ error: 'WEBNOVEL_INTERNAL' }));
    if (!alive || ticket !== request || view !== 'read') return;
    loading.remove();
    if (result.error) {
      const error = document.createElement('p');
      error.className = 'nw-error';
      error.textContent = explain(w, result);
      body.append(error);
      return;
    }
    reading.parts.push({ index, result });
    reading.index = index;
    body.insertAdjacentHTML('beforeend', chapterHtml(index, result));
    if (!keepScroll && !append) host.scrollIntoView?.({ block: 'start' });
    syncBar();
    fillMissing();
  }

  function readerShell(chapter) {
    const option = (name, value) => `<label><input type="radio" name="${name}" value="${value}" ${prefs[name] === value ? 'checked' : ''}>${esc(w.prefs[value])}</label>`;
    const check = name => `<label><input type="checkbox" name="${name}" ${prefs[name] ? 'checked' : ''}>${esc(w.prefs[name])}</label>`;
    return `<div class="nw-page nw-reader" data-lang="${prefs.lang}" data-indent="${prefs.indent ? 'on' : 'off'}">
      <div class="nw-bar">${back(w.chapters)}<h1 data-nw-title>${esc(chapter.title)}</h1>
        ${work.zh ? `<select data-nw-zhpick aria-label="${esc(w.zhChapter)}"></select>` : ''}
        <button type="button" class="secondary" data-nw-prefs aria-expanded="false">${esc(w.settings)}</button>
      <form class="nw-prefs" data-nw-prefform hidden>
        <fieldset><legend>${esc(w.prefs.lang)}</legend>${['ja', 'zh', 'jazh', 'zhja'].map(value => option('lang', value)).join('')}</fieldset>
        <fieldset><legend>${esc(w.prefs.mode)}</legend>${['priority', 'parallel'].map(value => option('mode', value)).join('')}</fieldset>
        <fieldset><legend>${esc(w.prefs.translators)}</legend>${DEFAULTS.translators.map((id, i) => `<label><input type="checkbox" name="tr-${id}" ${prefs.translators.includes(id) ? 'checked' : ''}>${i + 1} · ${esc(w.prefs[id])}</label>`).join('')}</fieldset>
        <fieldset><legend>${esc(w.prefs.page)}</legend>${['chapter', 'scroll'].map(value => option('page', value)).join('')}</fieldset>
        <fieldset><legend></legend>${['foldImages', 'indent', 'showSource', 'fill'].map(check).join('')}</fieldset>
        <p class="nw-muted">${esc(w.prefs.keys)}</p>
      </form></div>
      <div class="nw-text" data-nw-text></div>
      <div class="rd-pop" hidden></div>
      <div class="nw-foot" data-nw-foot><button type="button" class="secondary" data-nw-prev>‹ ${esc(w.prev)}</button>
        <span><button type="button" class="text-button" data-nw-open="ja">${esc(w.openJa)}</button>${work.zh ? ` <button type="button" class="text-button" data-nw-open="zh">${esc(w.openZh)}</button>` : ''}</span>
        <button type="button" class="secondary" data-nw-next>${esc(w.next)} ›</button></div>
    </div>`;
  }

  /* 点读、拖选查词、加 Anki：直接用日报阅读器的那一份（web/daily-view.js bindLookup） */
  function bindReaderLookup() {
    const sheet = host.querySelector('.nw-reader');
    bindLookup({
      text: host.querySelector('[data-nw-text]'), sheet, pop: sheet.querySelector('.rd-pop'), api, locale, esc, toast, lookup,
      sentenceOf: node => {
        const [part, index] = String(node?.closest?.('[data-key]')?.dataset.key || '').split(':').map(Number);
        return reading?.parts.find(entry => entry.index === part)?.result.align.rows[index]?.ja?.text || '';
      },
      source: { get link() { return reading?.parts.at(-1)?.result.ja?.url || ''; }, get title() { return work?.ja.title || ''; } },
    });
  }

  function syncBar() {
    const chapter = work.ja.chapters[reading.index];
    const title = host.querySelector('[data-nw-title]');
    if (title) title.textContent = chapter.title;
    host.querySelector('[data-nw-prev]').disabled = reading.parts[0].index <= 0;
    host.querySelector('[data-nw-next]').disabled = reading.index >= work.ja.chapters.length - 1;
    host.querySelector('[data-nw-foot]').hidden = prefs.page === 'scroll' && reading.index < work.ja.chapters.length - 1;
    const select = host.querySelector('[data-nw-zhpick]');
    if (select) {
      const current = work.chapters?.[reading.index]?.zh;
      select.innerHTML = `<option value="">${esc(w.noZhChapter)}</option>` + work.zh.chapters.map((entry, i) => entry.extra ? '' :
        `<option value="${i}" ${i === current ? 'selected' : ''}>${esc((entry.volume ? entry.volume.slice(-14) + ' · ' : '') + entry.title)}</option>`).join('');
    }
    if (prefs.page === 'scroll') watchEnd();
  }

  /* 一行译文：按偏好挑来源（优先：第一个有的；并列：都列） */
  function zhLines(row, key) {
    const out = [];
    for (const id of prefs.translators) {
      const text = id === 'linovelib' ? (row.zh || []).join('') : translations.get(key);
      if (id === 'megulit' && !prefs.fill) continue;
      if (id === 'megulit' && text === undefined && row.ja && (!row.zh?.length || row.state === 'weak')) out.push({ id, text: '', pending: true });
      else if (text) out.push({ id, text });
      if (prefs.mode === 'priority' && out.length && !out.at(-1).pending) break;
    }
    return prefs.mode === 'priority' ? out.slice(0, 1) : out;
  }

  const lead = /^[\s　]+/;
  /* 有分词结果（服务端走日报的 paragraphTokens）时用日报的 paragraphHTML：注音 + 可点的 .rd-t 词 */
  const jaHtml = block => {
    if (block.tokens?.length) {
      let tokens = block.tokens;
      if (prefs.indent) {
        const first = tokens.findIndex(token => token.s.replace(lead, ''));
        tokens = first < 0 ? [] : [{ ...tokens[first], s: tokens[first].s.replace(lead, '') }, ...tokens.slice(first + 1)];
      }
      return paragraphHTML({ text: block.text, tokens }, esc);
    }
    return plainJaHtml(block);
  };
  const plainJaHtml = block => {
    const plain = prefs.indent ? block.text.replace(lead, '') : block.text;
    if (!block.ruby) return esc(plain);
    let trimmed = !prefs.indent;
    return block.ruby.map(seg => {
      let text = seg.text;
      if (!trimmed) { text = text.replace(lead, ''); trimmed = Boolean(text); }
      return seg.rt ? `<ruby>${esc(text)}<rt>${esc(seg.rt)}</rt></ruby>` : esc(text);
    }).join('');
  };

  function chapterHtml(index, result) {
    const parts = [];
    if (reading.parts.length > 1) parts.push(`<h2 class="nw-muted">${esc(work.ja.chapters[index].title)}</h2>`);
    const s = result.align?.stats;
    if (result.zh) parts.push(`<p class="nw-muted">${esc(w.stats(s))}${result.zh.complete ? '' : ' · ' + esc(w.partial)}</p>`);
    else if (result.zhError) parts.push(`<p class="nw-error">${esc(w.zhError + explain(w, result.zhError))}</p>`);
    result.align.rows.forEach((row, i) => {
      if (row.t === 'br') { parts.push('<div class="nw-br"></div>'); return; }
      if (row.t === 'img') {
        const img = `<img src="${esc(row.src)}" loading="lazy" referrerpolicy="no-referrer" alt="">`;
        parts.push(`<div class="nw-img">${prefs.foldImages ? `<details><summary>${esc(w.foldImage)}</summary>${img}</details>` : img}</div>`);
        return;
      }
      const key = `${index}:${i}`;
      const mark = state => prefs.showSource && result.zh && state !== 'ok' ? `<span class="nw-mark">${esc(row.reason === 'truncated' ? w.mark.truncated : w.mark[state] || '')}</span>` : '';
      const ja = row.ja && prefs.lang !== 'zh' ? `<p class="nw-ja" lang="ja">${jaHtml(row.ja)}${prefs.lang === 'ja' ? '' : mark(row.state)}</p>` : '';
      const zh = prefs.lang === 'ja' ? '' : zhLines(row, key).map(line => `<p class="nw-zh" lang="zh-CN" data-from="${line.id}">${prefs.showSource ? `<span class="nw-from">${esc(w.from[line.id])}</span>` : ''}${esc(line.pending ? w.translating : line.text)}${!row.ja ? mark(row.state) : ''}</p>`).join('');
      if (!ja && !zh) return;
      const ordered = prefs.lang === 'zhja' || prefs.lang === 'zh' ? zh + ja : ja + zh;
      parts.push(`<div class="nw-row" data-state="${row.state}" data-key="${key}">${ordered}</div>`);
    });
    return `<section data-part="${index}">${parts.join('')}</section>`;
  }

  /* MeguLit 翻译补缺：只翻还没有汉化（或汉化可能不对应）的日文段落，按批走现有 daily_translate 通道 */
  async function fillMissing() {
    if (!prefs.fill || !prefs.translators.includes('megulit') || prefs.lang === 'ja') return;
    const ticket = request;
    for (const part of reading.parts) {
      const todo = part.result.align.rows.map((row, i) => ({ row, key: `${part.index}:${i}` }))
        .filter(({ row, key }) => row.ja && (!row.zh?.length || row.state === 'weak') && !translations.has(key));
      for (let start = 0; start < todo.length; start += 18) {
        const batch = todo.slice(start, start + 18);
        let texts = [];
        try {
          const result = await api('daily_translate', { texts: batch.map(entry => entry.row.ja.text), target: 'zh' });
          texts = Array.isArray(result) ? result : result?.texts || [];
        } catch { texts = []; }
        if (!alive || ticket !== request) return;
        batch.forEach((entry, i) => translations.set(entry.key, String(texts[i] || '')));
        rerender();
      }
    }
  }

  function rerender() {
    const body = host.querySelector('[data-nw-text]');
    if (!body || !reading) return;
    const root = host.querySelector('.nw-reader');
    root.dataset.lang = prefs.lang;
    root.dataset.indent = prefs.indent ? 'on' : 'off';
    const scroll = document.scrollingElement?.scrollTop;
    body.innerHTML = reading.parts.map(part => chapterHtml(part.index, part.result)).join('');
    if (scroll != null) document.scrollingElement.scrollTop = scroll;
  }

  function bindPrefs() {
    const form = host.querySelector('[data-nw-prefform]');
    host.querySelector('[data-nw-prefs]').onclick = event => {
      form.hidden = !form.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!form.hidden));
    };
    form.onchange = event => {
      const input = event.target;
      if (input.name.startsWith('tr-')) {
        const id = input.name.slice(3);
        prefs.translators = DEFAULTS.translators.filter(entry => entry === id ? input.checked : prefs.translators.includes(entry));
      } else if (input.type === 'radio') prefs[input.name] = input.value;
      else prefs[input.name] = input.checked;
      savePrefs(prefs);
      rerender();
      syncBar();
      fillMissing();
    };
  }

  let endObserver;
  function watchEnd() {
    endObserver?.disconnect();
    if (!('IntersectionObserver' in window)) return;
    const foot = host.querySelector('[data-nw-text]');
    const sentinel = document.createElement('div');
    foot.append(sentinel);
    endObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || prefs.page !== 'scroll' || reading.loading) return;
      endObserver.disconnect();
      sentinel.remove();
      if (reading.index < work.ja.chapters.length - 1) openChapter(reading.index + 1, { append: true });
    }, { rootMargin: '600px' });
    endObserver.observe(sentinel);
  }

  function step(delta) {
    if (view !== 'read') return;
    const next = (delta < 0 ? reading.parts[0].index : reading.index) + delta;
    if (next >= 0 && next < work.ja.chapters.length) openChapter(next);
  }

  function onKey(event) {
    if (!alive || view !== 'read' || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    if (/^(?:INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && document.activeElement.type !== 'radio' && document.activeElement.type !== 'checkbox') return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    else if (/^[12]$/.test(event.key)) {
      const id = DEFAULTS.translators[Number(event.key) - 1];
      if (prefs.mode === 'priority') prefs.translators = [id, ...DEFAULTS.translators.filter(entry => entry !== id)];
      else prefs.translators = prefs.translators.includes(id) ? prefs.translators.filter(entry => entry !== id) : DEFAULTS.translators.filter(entry => entry === id || prefs.translators.includes(entry));
      savePrefs(prefs);
      const form = host.querySelector('[data-nw-prefform]');
      for (const entry of DEFAULTS.translators) if (form) form.elements['tr-' + entry].checked = prefs.translators.includes(entry);
      rerender();
      fillMissing();
    }
  }
  addEventListener('keydown', onKey);

  host.onclick = event => {
    const target = event.target.closest('button, [data-nw-work]');
    if (!target) return;
    if (target.matches('[data-nw-back]')) {
      if (view === 'read') { ++request; endObserver?.disconnect(); paintWork(); }
      else if (view === 'work') { ++request; home(); }
      else onBack?.();
    } else if (target.dataset.nwWork) openWork(target.dataset.nwWork);
    else if (target.dataset.nwRead) openChapter(Number(target.dataset.nwRead));
    else if (target.dataset.nwPick) savePair({ zh: target.dataset.nwPick });
    else if (target.matches('[data-nw-change]')) { work = { ...work, zh: null, manual: true }; paintWork(); }
    else if (target.matches('[data-nw-jaonly]')) savePair({ zh: null });
    else if (target.matches('[data-nw-auto]')) savePair({ zh: '' });
    else if (target.matches('[data-nw-browser]')) api('novel_web_open', { url: work.searchUrl }).catch(() => toast(w.errors.WEBNOVEL_INTERNAL));
    else if (target.dataset.nwOpen) {
      const part = reading?.parts.at(-1)?.result;
      const url = target.dataset.nwOpen === 'ja' ? part?.ja?.url : part?.zh?.url || work.zh?.url;
      if (url) api('novel_web_open', { url }).catch(() => toast(w.errors.WEBNOVEL_INTERNAL));
    }
    else if (target.matches('[data-nw-prev]')) step(-1);
    else if (target.matches('[data-nw-next]')) step(1);
  };
  host.onsubmit = event => {
    event.preventDefault();
    const form = event.target;
    if (form.matches('[data-nw-search]')) { const q = form.elements.q.value.trim(); if (q) searchFor(q); }
    else if (form.matches('[data-nw-paste]')) { const zh = form.elements.zh.value.trim(); if (zh) savePair({ zh }); }
  };
  host.onchange = async event => {
    if (!event.target.matches('[data-nw-zhpick]')) return;
    const value = event.target.value;
    const chapter = work.ja.chapters[reading.index];
    const zhChapter = value === '' ? null : work.zh.chapters[Number(value)];
    try {
      await api('novel_web_pair', { id: work.ja.id, chapter: chapter.id, zhChapter: zhChapter ? (zhChapter.id || '#' + value) : null });
      work.chapters[reading.index] = { zh: zhChapter ? Number(value) : null, score: 1, sure: true, manual: true };
      openChapter(reading.index);
    } catch { toast(w.errors.WEBNOVEL_INTERNAL); }
  };

  home();
  return {
    destroy() { alive = false; ++request; endObserver?.disconnect(); removeEventListener('keydown', onKey); },
    _state: () => ({ view, work, reading, prefs }),
  };
}
