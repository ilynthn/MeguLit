/* SPDX-License-Identifier: GPL-3.0-or-later */
/* E394/E395 Problem reports inside MeguLit, never a GitHub link (GitHub does not open for many users in mainland China):
   - openFeedback: 一键上传问题反馈. The reader must say what went wrong (short or long both fine); the reason and a
     whole-app log package go up together through MeguLit's relay (POST /api/diagnostics with meta.note). If the log
     upload fails, the reason alone is still sent through /api/feedback so it is never lost.
   - mountDevNotice: the "MeguLit 还在开发中" notice from the website, every start on the home page, with its recent adaptations, with a
     "想玩的游戏" box and the same report button. */

import { successHTML, guideHTML, GUIDE } from './guide-content.js';
import { fillGuideLevel } from './guide-levels.js';

const T = {
  zh: {
    kicker: '一键上传问题反馈', title: '遇到什么问题了？', hint: '写一下原因，简短或详细都可以。会和最近的日志一起直接发给作者，不需要打开 GitHub',
    placeholder: '请写清楚完整的游戏名（不要缩写），再写遇到的问题。比如：打开《サクラノ詩》后没有翻译 / 点了某个按钮没反应 / 启动很慢……', contact: '联系方式（选填，QQ 或邮箱，方便回复你）',
    privacy: '日志里的 Windows 用户名和邮箱会先去掉', send: '上传', sending: '正在打包日志并上传…', sent: '已收到，谢谢！作者会尽快看',
    sentTextOnly: '日志没传上去，但你写的原因已经收到了，谢谢！', failed: '上传失败，请稍后再试', cancel: '取消', empty: '请先写一下原因，一句话也可以',
    noticeKicker: 'notice', noticeTag: 'megulit · in development', noticeTitle: 'MeguLit 还在开发中', noticeTitle2: '大部分引擎都已经适配好啦，提交游戏名之后可以先直接开玩试试',
    noticeText: '有些游戏现在还没适配好。想玩什么游戏，把名字写在下面点提交，快的话半天，最晚一周内就能支持',
    upd: (y, m, d, title) => `${y}年${m}月${d}日 完善了《${title}》的内嵌使用`, updNote: '以上游戏只在作者本地做过部分测试，实际游玩中如果还有问题，欢迎继续反馈，会跟进修复',
    gamePlaceholder: '完整的游戏名（日文原名或商店里的名字）', gameRule: '请写完整、准确的游戏名：日文原名，或 Steam、DLsite 商店里的名字都可以。不要写缩写、简称或昵称（比如「夏天」「GG」），缩写很难找到是哪部游戏', gameShort: '这个名字很短，可能是缩写或简称。请写完整的游戏名；确定这就是全名的话，再点一次提交', submit: '提交', gameSent: '收到了，会尽快适配',
    noticeMore: '遇到问题了，可以在「关于」页点「一键上传问题反馈」，写一下原因，简短或详细都可以，日志会一起发过来。有什么建议，或者只是想留句话，也都很欢迎。谢谢支持！',
    report: '一键上传问题反馈', ok: '知道了', next: '下一步：使用教程', back: '上一步', done: '完成', guideKicker: 'guide', guide: '教程',
    tabUpdates: '更新日志', tabGuide: '使用教程', tabReport: '问题反馈', tabGame: '想玩的游戏', reportText: '写一下原因，简短或详细都可以，最近的日志会一起发给作者。', gameText: '想玩什么游戏，把名字写在下面点提交，快的话半天，最晚一周内就能支持', close: '关闭', noUpdates: '暂时读不到更新日志，联网后再试',
  },
  ja: {
    kicker: '不具合をまとめて送る', title: 'どんな問題がありましたか？', hint: '原因をひとこと書いてください（短くても詳しくても OK）。最近のログと一緒に作者へ直接届きます。GitHub は不要です',
    placeholder: 'ゲームは正式名で書いてください（略称は不可）。例：『サクラノ詩』を開いても翻訳が出ない／ボタンを押しても反応しない／起動が遅い…', contact: '連絡先（任意・返信用の QQ やメール）',
    privacy: 'ログの Windows ユーザー名とメールアドレスは先に取り除きます', send: '送信', sending: 'ログをまとめて送信中…', sent: '受け取りました。ありがとうございます！',
    sentTextOnly: 'ログは送れませんでしたが、書いていただいた内容は届きました。ありがとうございます！', failed: '送信できませんでした。少し待ってからもう一度お試しください', cancel: 'キャンセル', empty: '原因をひとこと書いてください',
    noticeKicker: 'notice', noticeTag: 'megulit · in development', noticeTitle: 'MeguLit は開発中です', noticeTitle2: 'ほとんどのエンジンはもう対応済み！ゲーム名を送ったら、まずはそのまま遊んでみてね',
    noticeText: 'まだ対応できていないゲームもあります。遊びたいゲームの名前を下に入れて送信してください。早ければ半日、遅くとも一週間以内に対応します',
    upd: (y, m, d, title) => `${y}年${m}月${d}日 「${title}」の埋め込み表示を改善しました`, updNote: '上のゲームは作者の手元で一部しか確認していません。実際に遊んで問題があれば、引き続き知らせてください。修正していきます',
    gamePlaceholder: '正式なゲーム名（原題やストアの表記）', gameRule: '正式なゲーム名をそのまま書いてください。原題や Steam・DLsite のストア表記がおすすめです。略称やあだ名だと、どの作品か特定できないことがあります', gameShort: '名前が短く、略称かもしれません。正式なタイトルを書いてください。これが正式名なら、もう一度送信してください', submit: '送信', gameSent: '受け取りました。できるだけ早く対応します',
    noticeMore: '困ったときは「について」ページの「不具合をまとめて送る」から、原因をひとこと書いて送ってください（短くても詳しくても OK）。ログも一緒に届きます。ご意見やひとことも大歓迎です',
    report: '不具合をまとめて送る', ok: 'わかった', next: '次へ：使い方', back: '戻る', done: '完了', guideKicker: 'guide', guide: 'チュートリアル',
    tabUpdates: '更新履歴', tabGuide: '使い方', tabReport: '不具合を送る', tabGame: '遊びたいゲーム', reportText: '原因をひとこと書いてください。最近のログも一緒に作者へ届きます。', gameText: '遊びたいゲームの名前を入れて送信してください。早ければ半日、遅くとも一週間以内に対応します', close: '閉じる', noUpdates: '更新履歴を読み込めません。オンラインで再度お試しください',
  },
  en: {
    kicker: 'Report a problem', title: 'What went wrong?', hint: 'Say what happened, briefly or in detail. It goes to the author together with recent logs; no GitHub needed',
    placeholder: 'Name the game by its full title (no abbreviations), then the problem. For example: no translation after opening Sakura no Uta / a button does nothing / startup is slow…', contact: 'Contact (optional, QQ or e-mail, so we can reply)',
    privacy: 'The Windows user name and e-mail addresses are removed from the logs first', send: 'Upload', sending: 'Packing logs and uploading…', sent: 'Got it, thank you!',
    sentTextOnly: 'The logs did not go through, but what you wrote arrived. Thank you!', failed: 'Could not upload; please try again later', cancel: 'Cancel', empty: 'Please say what went wrong; one sentence is fine',
    noticeKicker: 'notice', noticeTag: 'megulit · in development', noticeTitle: 'MeguLit is still in development', noticeTitle2: 'Most engines already work. After you submit a game, feel free to just start playing it',
    noticeText: 'Some games are not supported yet. Type the name of a game you want to play and submit it; it usually takes half a day, a week at most',
    upd: (y, m, d, title) => `${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })} · embedded mode for ${title} improved`, updNote: 'These were only partly tested on the author’s own machine. If anything still goes wrong when you play, please keep telling us and we’ll fix it',
    gamePlaceholder: 'Full game title (original or store name)', gameRule: 'Please write the full, exact title: the original Japanese title or the name on Steam or DLsite. Avoid abbreviations and nicknames, they make it hard to find the right game', gameShort: 'This name is very short and may be an abbreviation. Please write the full title; if this is the full title, press Submit again', submit: 'Submit', gameSent: 'Got it; support is on the way',
    noticeMore: 'If something goes wrong, open About and use Report a problem: say what happened, briefly or in detail, and the logs come along. Ideas or just a hello are welcome too. Thanks for the support!',
    report: 'Report a problem', ok: 'Got it', next: 'Next: how to use', back: 'Back', done: 'Done', guideKicker: 'guide', guide: 'Tutorial',
    tabUpdates: 'Updates', tabGuide: 'How to use', tabReport: 'Report', tabGame: 'Request a game', reportText: 'Say what went wrong, briefly or in detail; recent logs go to the author with it.', gameText: 'Type a game you want to play and submit it; it usually takes half a day, a week at most', close: 'Close', noUpdates: 'Could not load the updates; try again when online',
  },
};
const words = locale => T[locale] || T.zh;

export async function sendFeedback({ api, kind, text, contact = '', locale = 'zh', version = '' }) {
  try { return await api('feedback_send', { kind, text, contact, lang: locale, version }); } catch { return { ok: false, error: 'NETWORK' }; }
}

/* reason + whole-app logs; resolves 'full', 'text' (logs failed, reason sent) or '' (nothing sent) */
async function report({ api, reason, contact, locale, version }) {
  const note = (contact ? `${reason}\n\n联系方式：${contact}` : reason).slice(0, 2000);
  let why = '';
  try {
    const pack = await api('diagnostics_build_all', { version });
    const result = await api('diagnostics_upload', { path: pack.path, meta: { version, game: { id: '', title: 'MeguLit', engine: '' }, note } });
    if (result?.state === 'uploaded') return 'full';
    why = 'upload ' + String(result?.state || '') + ' ' + String(result?.error || '');
  } catch (error) { why = 'build ' + String(error?.message || error || '').slice(0, 120); /* fall through to the text-only report */ }
  /* E423 say why the logs did not go up, so a text-only report can still be diagnosed */
  const text = await sendFeedback({ api, kind: 'feedback', text: `${reason}

[日志未上传：${why.trim()}]`, contact, locale, version });
  return text?.ok ? 'text' : '';
}

/* E563 after a problem report: check the library on this PC; anything found is uploaded only after the user confirms it */
const probeAfterReport = ({ api, locale, esc, toast }) => import('./adapter-probe-ui.js').then(m => m.openProbeUpload({ api, locale, esc, toast, reason: 'feedback' })).catch(() => {});

export function openFeedback({ api, locale = 'zh', esc, toast, version = '' }) {
  const t = words(locale), dialog = document.createElement('dialog');
  dialog.className = 'game-dialog feedback-dialog';
  dialog.innerHTML = `<div class="game-dialog-head"><span class="game-dialog-kicker">${esc(t.kicker)}</span><h2>${esc(t.title)}</h2><p>${esc(t.hint)}</p></div>
<textarea class="feedback-text" rows="6" maxlength="1800" placeholder="${esc(t.placeholder)}"></textarea>
<input class="feedback-contact" maxlength="120" placeholder="${esc(t.contact)}">
<p class="feedback-privacy">${esc(t.privacy)}</p>
<p class="feedback-status" role="status" aria-live="polite"></p>
<div class="dialog-actions"><button type="button" class="text-button" data-cancel>${esc(t.cancel)}</button><button type="button" class="primary" data-send>${esc(t.send)}</button></div>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
  const text = dialog.querySelector('.feedback-text'), contact = dialog.querySelector('.feedback-contact'), status = dialog.querySelector('.feedback-status'), send = dialog.querySelector('[data-send]');
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  send.onclick = async () => {
    const reason = text.value.trim();
    if (!reason) { status.textContent = t.empty; status.dataset.state = 'bad'; text.focus(); return; }
    send.disabled = true; send.textContent = t.sending; status.textContent = ''; delete status.dataset.state;
    const outcome = await report({ api, reason, contact: contact.value.trim(), locale, version });
    if (!dialog.isConnected) return;
    send.textContent = t.send;
    if (outcome) { toast && toast(outcome === 'full' ? t.sent : t.sentTextOnly); dialog.close(); probeAfterReport({ api, locale, esc, toast }); return; }
    send.disabled = false; status.textContent = t.failed; status.dataset.state = 'bad';
  };
  text.focus();
}

/* E416 every start (once per launch), with the website's recent adaptations (megulit.com/assets/updates.json) */
let shownThisLaunch = false;
/* (user 2026-11-13: the list appeared only after a while and opening the notice stuttered) the last list is kept in
   localStorage and drawn in the first frame; the service answer (its own cache, then the site) replaces it only when it differs.
   Only the first rows are built at once, the rest when the browser is idle, so opening never builds 300 rows in one go */
const UPDATES_KEY = "megulit.siteUpdates", FIRST_ROWS = 12;
export function cachedUpdates(store = globalThis.localStorage) { try { const v = JSON.parse(store?.getItem(UPDATES_KEY) || "null"); return Array.isArray(v) ? v : null; } catch { return null; } }
function updateRow(it, locale, t) {
  const [y, m, d] = String(it.date || "").split("-").map(Number), li = document.createElement("li");
  const line = ((locale !== "zh" && it["text_" + locale]) || it.text) || t.upd(y, m, d, (locale !== "zh" && it["title_" + locale]) || it.title || "");
  /* 2026-11-12 a ledger line: the date in its own column, then what changed */
  if (y && m && d) { const when = document.createElement("time"), what = document.createElement("span"); when.textContent = `${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`; what.textContent = line.replace(/^d{4}年d{1,2}月d{1,2}日s*|^[A-Z][a-z]{2} d{1,2}, d{4} · /, ""); li.append(when, what); } else li.textContent = line;
  return li;
}
export function drawUpdates(dialog, locale, items) {
  const t = words(locale), list = dialog.querySelector(".dev-notice-updates"), note = dialog.querySelector(".dev-notice-updates-note");
  const rows = (Array.isArray(items) ? items : []).slice(0, 300); /* E425 keep every update; the list scrolls */
  const token = list.dataset.draw = String((Number(list.dataset.draw) || 0) + 1);
  list.replaceChildren(...rows.slice(0, FIRST_ROWS).map(it => updateRow(it, locale, t)));
  const idle = globalThis.requestIdleCallback || (fn => setTimeout(fn, 32));
  const more = from => { if (from >= rows.length || list.dataset.draw !== token || !list.isConnected) return; idle(() => { if (list.dataset.draw !== token) return; const part = document.createDocumentFragment(); rows.slice(from, from + 40).forEach(it => part.append(updateRow(it, locale, t))); list.append(part); more(from + 40); }); };
  more(FIRST_ROWS);
  note.textContent = t.updNote;
  list.hidden = note.hidden = !rows.length;
  return rows.length;
}
async function fillUpdates(dialog, locale, api) {
  const cached = cachedUpdates(), first = cached ? JSON.stringify(cached.slice(0, 300)) : "";
  if (cached) drawUpdates(dialog, locale, cached);
  try {
    const items = await api('site_updates', {});
    if (!Array.isArray(items) || !items.length || !dialog.isConnected) return;
    const fresh = JSON.stringify(items.slice(0, 300));
    try { globalThis.localStorage?.setItem(UPDATES_KEY, fresh); } catch { /* storage full or blocked: fine */ }
    if (fresh !== first) drawUpdates(dialog, locale, items);
  } catch { /* offline: the cached list (or none) stays */ }
}

export function mountDevNotice({ api, locale = 'zh', esc, toast, version = '', force = false }) {
  if ((shownThisLaunch && !force) || document.querySelector('.dev-notice')) return;
  shownThisLaunch = true;
  const t = words(locale), dialog = document.createElement('dialog');
  dialog.className = 'game-dialog dev-notice';
  dialog.innerHTML = `<div class="dev-notice-page" data-page="1"><div class="dev-notice-top"><span>${esc(t.noticeKicker)}</span><span>${esc(t.noticeTag)}</span></div>
<h2>${esc(t.noticeTitle)}</h2><h2 class="dev-notice-title2">${esc(t.noticeTitle2)}</h2>${successHTML(locale, esc)}<p class="dev-notice-text">${esc(t.noticeText)}</p>
<form class="dev-notice-form"><input class="dev-notice-game" maxlength="200" placeholder="${esc(t.gamePlaceholder)}"><button type="submit" class="secondary">${esc(t.submit)}</button></form><p class="dev-notice-rule">${esc(t.gameRule)}</p>
<p class="feedback-status" role="status" aria-live="polite"></p>
<ul class="dev-notice-updates" hidden></ul><p class="dev-notice-updates-note" hidden></p>
<p class="dev-notice-more">${esc(t.noticeMore)}</p>
<div class="dev-notice-actions"><button type="button" class="text-button" data-report>${esc(t.report)}</button><button type="button" class="primary" data-next>${esc(t.next)}</button></div></div>
<div class="dev-notice-page" data-page="2" hidden><div class="dev-notice-top"><span>${esc(t.guideKicker)}</span><span>2 / 2</span></div>
<h2>${esc((GUIDE[locale] || GUIDE.zh).title)}</h2><div class="dev-notice-scroll">${guideHTML(locale, esc)}</div>
<div class="dev-notice-actions"><button type="button" class="text-button" data-back>${esc(t.back)}</button><button type="button" class="secondary" data-ok>${esc(t.done)}</button></div></div>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  fillUpdates(dialog, locale, api);
  const form = dialog.querySelector('form'), game = dialog.querySelector('.dev-notice-game'), status = dialog.querySelector('.feedback-status');
  form.onsubmit = async event => {
    event.preventDefault();
    if (!game.value.trim()) { game.focus(); return; }
    /* E456 (user: players wrote 夏天 / GG and the game could not be found): a very short name may be an abbreviation; ask once */
    if ([...game.value.trim()].length <= 3 && game.dataset.shortOk !== game.value.trim()) { game.dataset.shortOk = game.value.trim(); status.dataset.state = 'bad'; status.textContent = t.gameShort; game.focus(); return; }
    const button = form.querySelector('button'); button.disabled = true;
    const result = await sendFeedback({ api, kind: 'game', text: game.value, locale, version });
    button.disabled = false;
    if (!dialog.isConnected) return;
    status.dataset.state = result?.ok ? 'ok' : 'bad'; status.textContent = result?.ok ? t.gameSent : t.failed;
    if (result?.ok) game.value = '';
  };
  const [one, two] = dialog.querySelectorAll('.dev-notice-page');
  const page = n => { one.hidden = n !== 1; two.hidden = n !== 2; (n === 1 ? one : two).querySelector('.secondary').focus(); };
  dialog.querySelector('[data-next]').onclick = () => page(2);
  dialog.querySelector('[data-back]').onclick = () => page(1);
  dialog.querySelector('[data-ok]').onclick = () => dialog.close();
  dialog.querySelector('[data-report]').onclick = () => { dialog.close(); openFeedback({ api, locale, esc, toast, version }); };
  dialog.showModal();
  fillGuideLevel(dialog, { api, locale, esc }); /* the by-level part of the guide follows the chosen level */
}

/* E458 top bar 指南: everything from the start notice, any time (updates, the tutorial, a report, a game request) */
export function openGuide({ api, locale = 'zh', esc, toast, version = '', tab = 'guide' }) {
  document.querySelector('dialog.guide-panel')?.close();
  const t = words(locale), dialog = document.createElement('dialog'), tabs = [['updates', t.tabUpdates], ['guide', t.tabGuide], ['report', t.tabReport], ['game', t.tabGame]];
  dialog.className = 'game-dialog dev-notice guide-panel';
  dialog.innerHTML = `<div class="dev-notice-top"><span>${esc(t.guideKicker)}</span><span>megulit</span></div>
<h2>${esc(t.guide)}</h2>
<nav class="guide-tabs" role="tablist">${tabs.map(([k, v]) => `<button type="button" role="tab" data-tab="${k}">${esc(v)}</button>`).join('')}</nav>
<div class="dev-notice-scroll" data-pane="updates"><ul class="dev-notice-updates" hidden></ul><p class="dev-notice-updates-note" hidden></p><p class="guide-empty">${esc(t.noUpdates)}</p></div>
<div class="dev-notice-scroll" data-pane="guide">${guideHTML(locale, esc)}</div>
<div class="dev-notice-scroll" data-pane="report"><p class="dev-notice-text">${esc(t.reportText)}</p><textarea class="feedback-text" rows="6" maxlength="1800" placeholder="${esc(t.placeholder)}"></textarea><input class="feedback-contact" maxlength="120" placeholder="${esc(t.contact)}"><p class="feedback-privacy">${esc(t.privacy)}</p><p class="feedback-status" role="status" aria-live="polite"></p><div class="dev-notice-actions"><button type="button" class="primary" data-report>${esc(t.send)}</button></div></div>
<div class="dev-notice-scroll" data-pane="game"><p class="dev-notice-text">${esc(t.gameText)}</p><form class="dev-notice-form"><input class="dev-notice-game" maxlength="200" placeholder="${esc(t.gamePlaceholder)}"><button type="submit" class="primary">${esc(t.submit)}</button></form><p class="dev-notice-rule">${esc(t.gameRule)}</p><p class="feedback-status" role="status" aria-live="polite"></p></div>
<div class="dev-notice-actions"><button type="button" class="secondary" data-ok>${esc(t.close)}</button></div>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  const show = key => {
    dialog.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === key)));
    dialog.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== key; });
  };
  dialog.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => show(b.dataset.tab); });
  show(tabs.some(([k]) => k === tab) ? tab : 'guide');
  fillUpdates(dialog, locale, api).then(() => { dialog.querySelector('.guide-empty').hidden = !dialog.querySelector('.dev-notice-updates').hidden; });
  const form = dialog.querySelector('[data-pane="game"] form'), game = dialog.querySelector('.dev-notice-game'), status = dialog.querySelector('[data-pane="game"] .feedback-status');
  form.onsubmit = async event => {
    event.preventDefault();
    if (!game.value.trim()) { game.focus(); return; }
    /* E456 (user: players wrote 夏天 / GG and the game could not be found): a very short name may be an abbreviation; ask once */
    if ([...game.value.trim()].length <= 3 && game.dataset.shortOk !== game.value.trim()) { game.dataset.shortOk = game.value.trim(); status.dataset.state = 'bad'; status.textContent = t.gameShort; game.focus(); return; }
    const button = form.querySelector('button'); button.disabled = true;
    const result = await sendFeedback({ api, kind: 'game', text: game.value, locale, version });
    button.disabled = false;
    if (!dialog.isConnected) return;
    status.dataset.state = result?.ok ? 'ok' : 'bad'; status.textContent = result?.ok ? t.gameSent : t.failed;
    if (result?.ok) game.value = '';
  };
  dialog.querySelector('[data-ok]').onclick = () => dialog.close();
  /* 2026-11-12 (user: "我这里的输入栏呢") the report tab has its own text box and sends from here, no second dialog */
  const pane = dialog.querySelector('[data-pane="report"]'), reason = pane.querySelector('.feedback-text'), reach = pane.querySelector('.feedback-contact'), said = pane.querySelector('.feedback-status'), send = pane.querySelector('[data-report]');
  send.onclick = async () => {
    const value = reason.value.trim();
    if (!value) { said.textContent = t.empty; said.dataset.state = 'bad'; reason.focus(); return; }
    send.disabled = true; send.textContent = t.sending; said.textContent = ''; delete said.dataset.state;
    const outcome = await report({ api, reason: value, contact: reach.value.trim(), locale, version });
    if (!dialog.isConnected) return;
    send.disabled = false; send.textContent = t.send;
    if (outcome) { said.dataset.state = 'ok'; said.textContent = outcome === 'full' ? t.sent : t.sentTextOnly; reason.value = ''; toast && toast(said.textContent); probeAfterReport({ api, locale, esc, toast }); return; }
    said.textContent = t.failed; said.dataset.state = 'bad';
  };
  dialog.showModal();
  fillGuideLevel(dialog, { api, locale, esc }); /* the by-level part of the guide follows the chosen level */
  return dialog;
}
