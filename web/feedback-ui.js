/* SPDX-License-Identifier: GPL-3.0-or-later */
/* E394/E395 Problem reports inside MeguLit, never a GitHub link (GitHub does not open for many users in mainland China):
   - openFeedback: 一键上传问题反馈. The reader must say what went wrong (short or long both fine); the reason and a
     whole-app log package go up together through MeguLit's relay (POST /api/diagnostics with meta.note). If the log
     upload fails, the reason alone is still sent through /api/feedback so it is never lost.
   - mountDevNotice: the "MeguLit 还在开发中" notice from the website, every start on the home page, with its recent adaptations, with a
     "想玩的游戏" box and the same report button. */

import { successHTML, guideHTML, GUIDE } from './guide-content.js';
import { fillGuideLevel } from './guide-levels.js';
import { seedPageHTML, seedWords, seedSeen, markSeedSeen, fillSeedCount } from './the-seed.js';
import { feedbackIssueLabels } from './first-player.js';

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
    report: '一键上传问题反馈', noticeOff: '当前版本不再提示', noticeOffTip: '勾上后，这个版本启动时不再弹出这个窗口；更新到新版本会再提示一次。更新日志和使用教程随时可以在顶栏「教程」里看', ok: '知道了', next: '下一步：使用教程', back: '上一步', done: '完成', guideKicker: 'guide', guide: '教程',
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
    report: '不具合をまとめて送る', noticeOff: 'このバージョンでは表示しない', noticeOffTip: 'チェックすると起動時にこの画面を出しません。更新履歴と使い方は上のバーの「チュートリアル」からいつでも見られます', ok: 'わかった', next: '次へ：使い方', back: '戻る', done: '完了', guideKicker: 'guide', guide: 'チュートリアル',
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
    gamePlaceholder: 'Full game title (original or store name)', gameRule: 'Please write the full, exact title: the original Japanese title or the name on Steam or DLsite. Avoid abbreviations and nicknames, they make it hard to find the right game. For an exact build, use VNDB ID | engine | source language | EXE SHA-256 | script SHA-256', gameShort: 'This name is very short and may be an abbreviation. Please write the full title; if this is the full title, press Submit again', submit: 'Submit', gameSent: 'Got it; support is on the way',
    noticeMore: 'If something goes wrong, open About and use Report a problem: say what happened, briefly or in detail, and the logs come along. Ideas or just a hello are welcome too. Thanks for the support!',
    report: 'Report a problem', noticeOff: "Don't show again for this version", noticeOffTip: 'When ticked, this window no longer opens at start-up. Updates and the tutorial stay under Tutorial in the top bar', ok: 'Got it', next: 'Next: how to use', back: 'Back', done: 'Done', guideKicker: 'guide', guide: 'Tutorial',
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

/* 2026-11-27 (user: 就单纯加个提取日志的按钮吧 说明是 针对修复 QQ群内专用) 提取日志: the same scrubbed whole-app package,
   saved on the desktop (services/log-export.cjs) for the reader to send to the QQ group by hand; nothing is uploaded */
const EXPORT = {
  zh: { button: '提取日志', note: '针对修复 · QQ群内专用', working: '正在提取日志…', ask: '遇到了什么问题？', askHint: '会写进压缩包里的「问题说明.txt」，也会加进文件名', askPlaceholder: '例：点读层不显示 / 读音错了', askEmpty: '请先写一下遇到的问题，一句话也可以', go: '提取', cancel: '取消', saved: name => `日志已保存到桌面：${name}，发到 QQ 群里给作者，发完可以删掉`, reveal: '打开所在文件夹',
    failed: why => `提取日志失败：${why}`, reasons: { desktop: '找不到桌面文件夹', denied: '没有权限写入桌面（可能被安全软件拦住了）', full: '磁盘空间不足', busy: '桌面上的文件正被占用，请稍后再试', build: '打包日志时出错', other: '未知错误' } },
  ja: { button: 'ログを書き出す', note: '修正用・QQグループ専用', working: 'ログを書き出しています…', ask: 'どんな問題がありましたか？', askHint: 'ZIP の中の「问题说明.txt」とファイル名に入ります', askPlaceholder: '例：タップ読みレイヤーが出ない／読みが間違っている', askEmpty: '問題をひとこと書いてください', go: '書き出す', cancel: 'キャンセル', saved: name => `ログをデスクトップに保存しました：${name}。QQ グループで作者に送ってください。送ったら削除して大丈夫です`, reveal: 'フォルダーを開く',
    failed: why => `ログを書き出せませんでした：${why}`, reasons: { desktop: 'デスクトップのフォルダーが見つかりません', denied: 'デスクトップに書き込む権限がありません（セキュリティソフトにブロックされた可能性があります）', full: 'ディスクの空き容量が足りません', busy: 'デスクトップのファイルが使用中です。少し待ってからお試しください', build: 'ログをまとめる途中でエラーが起きました', other: '不明なエラー' } },
  en: { button: 'Export logs', note: 'For fixes · QQ group only', working: 'Exporting logs…', ask: 'What went wrong?', askHint: 'It goes into the note file inside the zip and into the file name', askPlaceholder: 'e.g. the lookup layer does not show / wrong reading', askEmpty: 'Please say what went wrong; one sentence is fine', go: 'Export', cancel: 'Cancel', saved: name => `Logs saved to the desktop: ${name}. Send it to the author in the QQ group; you can delete it afterwards`, reveal: 'Open folder',
    failed: why => `Could not export the logs: ${why}`, reasons: { desktop: 'the Desktop folder was not found', denied: 'no permission to write to the Desktop (security software may have blocked it)', full: 'the disk is full', busy: 'a file on the Desktop is in use; try again shortly', build: 'packing the logs failed', other: 'unknown error' } },
};
export const exportWords = locale => EXPORT[locale] || EXPORT.zh;
/* the service error (a code, sometimes with a short detail) → why, in the reader's language */
export function exportReason(error, locale = 'zh') {
  const raw = String(error?.message || error || ''), r = exportWords(locale).reasons;
  const why = /DESKTOP_NOT_FOUND|ENOENT/.test(raw) ? r.desktop : /EACCES|EPERM/.test(raw) ? r.denied : /ENOSPC/.test(raw) ? r.full : /EBUSY|DESKTOP_NAME_TAKEN/.test(raw) ? r.busy : /LOG_BUILD_FAILED/.test(raw) ? r.build : r.other;
  const code = (/[A-Z][A-Z_]{3,}/.exec(raw) || [''])[0];
  return code && why === r.other ? `${why}（${code}）` : why;
}
/* asks for the problem (required); resolves the trimmed text, or '' when cancelled */
export function askProblem({ locale = 'zh', esc, initial = '' }) {
  const w = exportWords(locale), ask = document.createElement('dialog');
  ask.className = 'game-dialog feedback-dialog feedback-export-ask';
  ask.innerHTML = `<div class="game-dialog-head"><span class="game-dialog-kicker">${esc(w.note)}</span><h2>${esc(w.ask)}</h2><p>${esc(w.askHint)}</p></div>
<input class="feedback-contact" data-problem maxlength="300" placeholder="${esc(w.askPlaceholder)}">
<p class="feedback-status" role="status" aria-live="polite"></p>
<div class="dialog-actions"><button type="button" class="text-button" data-ask-cancel>${esc(w.cancel)}</button><button type="button" class="primary" data-ask-go>${esc(w.go)}</button></div>`;
  document.body.append(ask);
  const input = ask.querySelector('[data-problem]'), status = ask.querySelector('.feedback-status');
  input.value = initial;
  return new Promise(resolve => {
    let answer = '';
    ask.addEventListener('close', () => { ask.remove(); resolve(answer); }, { once: true });
    const go = () => { const value = input.value.trim(); if (!value) { status.textContent = w.askEmpty; status.dataset.state = 'bad'; input.focus(); return; } answer = value; ask.close(); };
    ask.querySelector('[data-ask-go]').onclick = go;
    ask.querySelector('[data-ask-cancel]').onclick = () => ask.close();
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); go(); } });
    ask.showModal(); input.focus();
  });
}
export async function exportLogs({ api, locale = 'zh', version = '', problem = '' }) {
  const w = exportWords(locale);
  try { const result = await api('logs_export_desktop', { problem, version }); return { ok: true, name: result.name, path: result.path, text: w.saved(result.name) }; }
  catch (error) { return { ok: false, text: w.failed(exportReason(error, locale)) }; }
}

/* E563 after a problem report: check the library on this PC; anything found is uploaded only after the user confirms it */
const probeAfterReport = ({ api, locale, esc, toast }) => import('./adapter-probe-ui.js').then(m => m.openProbeUpload({ api, locale, esc, toast, reason: 'feedback' })).catch(() => {});

export function openFeedback({ api, locale = 'zh', esc, toast, version = '' }) {
  const t = words(locale), dialog = document.createElement('dialog');
  const [issueLabel, issueHint, issueEmpty] = ({
    zh: ['遇到的问题（可多选）', '选择问题类型，或在下方补充说明。提交时会附上最近的日志', '请至少选一个问题，或写一句说明'],
    ja: ['不具合の種類（複数選択可）', '該当する不具合を選ぶか、下に詳しく書いてください。最近のログも一緒に送られます', '不具合を選ぶか、状況をひとこと書いてください'],
    en: ['What went wrong? Select all that apply', 'Select the problems you encountered or add details below. Recent logs are included with your report.', 'Select at least one problem or tell us what happened.'],
  })[locale] || ['遇到的问题（可多选）', t.hint, t.empty];
  dialog.className = 'game-dialog feedback-dialog';
  dialog.innerHTML = `<div class="game-dialog-head"><span class="game-dialog-kicker">${esc(t.kicker)}</span><h2>${esc(t.title)}</h2><p>${esc(issueHint)}</p></div>
<fieldset class="feedback-issues"><legend>${esc(issueLabel)}</legend><div class="feedback-issue-options">${feedbackIssueLabels(locale).map(label=>`<button type="button" class="feedback-issue" aria-pressed="false">${esc(label)}</button>`).join('')}</div></fieldset>
<label><input type="checkbox" data-yui disabled> ${esc(({zh:'允许 Yui 自动发送故障类型、上一阶段、启动耗时和匿名去重编号，同类故障会汇总到 GitHub',ja:'Yui に障害の種類、直前の処理、起動からの経過時間、匿名の重複防止 ID の自動送信を許可する（GitHub に種類別に集計）',en:'Allow Yui to send failure types, preceding stages, elapsed startup time and anonymous report IDs for automatic summaries on GitHub'})[locale])}</label>
<textarea class="feedback-text" rows="6" maxlength="1800" placeholder="${esc(t.placeholder)}"></textarea>
<input class="feedback-contact" maxlength="120" placeholder="${esc(t.contact)}">
<p class="feedback-privacy">${esc(t.privacy)}</p>
<p class="feedback-status" role="status" aria-live="polite"></p>
<p class="feedback-export-result" role="status" aria-live="polite" hidden><span></span> <button type="button" class="text-button" data-export-reveal hidden>${esc(exportWords(locale).reveal)}</button></p>
<div class="dialog-actions"><span class="feedback-export"><button type="button" class="text-button" data-export>${esc(exportWords(locale).button)}</button><small>${esc(exportWords(locale).note)}</small></span><button type="button" class="text-button" data-cancel>${esc(t.cancel)}</button><button type="button" class="primary" data-send>${esc(t.send)}</button></div>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
  const text = dialog.querySelector('.feedback-text'), contact = dialog.querySelector('.feedback-contact'), status = dialog.querySelector('.feedback-status'), send = dialog.querySelector('[data-send]');
  const toggle=dialog.querySelector('[data-yui]');
  Promise.resolve().then(()=>api('yui_consent')).then(v=>{toggle.checked=v.enabled===true;toggle.disabled=false;}).catch(()=>{});
  toggle.onchange=async()=>{const enabled=toggle.checked;toggle.disabled=true;try{await api('yui_consent_set',{enabled});}catch{toggle.checked=!enabled;toast?.(t.failed);}finally{toggle.disabled=false;}};
  const issues = [...dialog.querySelectorAll('.feedback-issue')];
  for (const issue of issues) issue.onclick = () => issue.setAttribute('aria-pressed', String(issue.getAttribute('aria-pressed') !== 'true'));
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  const exportButton = dialog.querySelector('[data-export]'), exportResult = dialog.querySelector('.feedback-export-result'), reveal = dialog.querySelector('[data-export-reveal]');
  exportButton.onclick = async () => {
    const w = exportWords(locale);
    const typed = [issues.filter(issue => issue.getAttribute('aria-pressed') === 'true').map(issue => issue.textContent).join(' / '), text.value.trim()].filter(Boolean).join(' / ');
    const problem = await askProblem({ locale, esc, initial: typed.slice(0, 300) });
    if (!problem || !dialog.isConnected) return;
    exportButton.disabled = true; exportButton.textContent = w.working; reveal.hidden = true;
    const result = await exportLogs({ api, locale, version, problem });
    if (!dialog.isConnected) return;
    exportButton.disabled = false; exportButton.textContent = w.button;
    exportResult.hidden = false; exportResult.dataset.state = result.ok ? 'ok' : 'bad'; exportResult.firstElementChild.textContent = result.text;
    reveal.hidden = !result.ok;
    reveal.onclick = () => api('logs_export_reveal', { path: result.path }).catch(() => {});
  };
  send.onclick = async () => {
    const selected = issues.filter(issue => issue.getAttribute('aria-pressed') === 'true').map(issue => issue.textContent);
    const reason = [selected.join(' / '), text.value.trim()].filter(Boolean).join('\n\n');
    if (!reason) { status.textContent = issueEmpty; status.dataset.state = 'bad'; text.focus(); return; }
    send.disabled = true; for (const issue of issues) issue.disabled = true;
    send.textContent = t.sending; status.textContent = ''; delete status.dataset.state;
    const outcome = await report({ api, reason, contact: contact.value.trim(), locale, version });
    if (!dialog.isConnected) return;
    send.textContent = t.send;
    if (outcome) { toast && toast(outcome === 'full' ? t.sent : t.sentTextOnly); dialog.close(); probeAfterReport({ api, locale, esc, toast }); return; }
    send.disabled = false; for (const issue of issues) issue.disabled = false;
    status.textContent = t.failed; status.dataset.state = 'bad';
  };
  text.focus();
}

/* E416 every start (once per launch), with the website's recent adaptations (megulit.com/assets/updates.json) */
let shownThisLaunch = false;
const launchNoticeKey = 'megulit.startupNoticeShown';
/* the reader ticked 以后不再提示 on the start notice: it no longer opens by itself (the top-bar guide still has everything) */
const noticeOffKey = 'megulit.startupNoticeOff';
/* 2026-11-26 (user: 显示的是当前版本不再提示): the box remembers the version it was ticked on, so a new version shows the notice once more */
let noticeVersion = '';
export const noticeOff = (store = globalThis.localStorage, version = noticeVersion) => { try { const v = store?.getItem(noticeOffKey); return !!v && v === (version || '1'); } catch { return false; } };
const setNoticeOff = on => { try { if (on) globalThis.localStorage?.setItem(noticeOffKey, noticeVersion || '1'); else globalThis.localStorage?.removeItem(noticeOffKey); } catch { /* storage blocked: the box just does not stick */ } };
try { shownThisLaunch = globalThis.sessionStorage?.getItem(launchNoticeKey) === '1'; } catch { /* storage disabled */ }
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
async function fillUpdates(dialog, locale, api, cached = cachedUpdates()) {
  const first = cached ? JSON.stringify(cached.slice(0, 300)) : "";
  if (cached) drawUpdates(dialog, locale, cached);
  try {
    const items = await api('site_updates', { cachedHead: cached?.[0], cachedRelease: cached?.find(row => /^\d+\.\d+\.\d+\s*[:：]/.test(row?.text)) });
    if (!Array.isArray(items) || !items.length || !dialog.isConnected) return;
    const fresh = JSON.stringify(items.slice(0, 300));
    try { globalThis.localStorage?.setItem(UPDATES_KEY, fresh); } catch { /* storage full or blocked: fine */ }
    if (fresh !== first) drawUpdates(dialog, locale, items);
  } catch { /* offline: the cached list (or none) stays */ }
}

export function mountDevNotice({ api, locale = 'zh', esc, toast, version = '', force = false, canShow = () => true }) {
  noticeVersion = String(version || '');
  if (((shownThisLaunch || noticeOff()) && !force) || document.querySelector('.dev-notice') || !canShow()) return;
  const t = words(locale), dialog = document.createElement('dialog');
  const loadingUpdates = { zh: '正在读取更新日志…', ja: '更新履歴を読み込み中…', en: 'Loading update notes…' };
  dialog.className = 'game-dialog dev-notice seed-flow startup-notice';
  dialog.setAttribute('aria-label', t.noticeTitle);
  dialog.innerHTML = `<button type="button" class="startup-notice-close" data-notice-close autofocus title="${esc(t.close)} (Esc)" aria-label="${esc(t.close)}">×</button>
<div class="dev-notice-page" data-page="1"><div class="dev-notice-top"><span>${esc(t.noticeKicker)}</span><span>${esc(t.noticeTag)}</span></div>
<h2>${esc(t.noticeTitle)}</h2><h2 class="dev-notice-title2">${esc(t.noticeTitle2)}</h2>${successHTML(locale, esc)}<p class="dev-notice-text">${esc(t.noticeText)}</p>
<form class="dev-notice-form"><input class="dev-notice-game" maxlength="256" placeholder="${esc(t.gamePlaceholder)}"><button type="submit" class="secondary">${esc(t.submit)}</button></form><p class="dev-notice-rule">${esc(t.gameRule)}</p>
<p class="feedback-status" role="status" aria-live="polite"></p>
<ul class="dev-notice-updates" tabindex="0" aria-label="${esc(t.tabUpdates)}" hidden></ul><p class="dev-notice-updates-note" hidden></p>
<p class="startup-updates-empty" role="status">${esc(loadingUpdates[locale] || loadingUpdates.zh)}</p>
<p class="dev-notice-more">${esc(t.noticeMore)}</p>
<div class="dev-notice-offbar"><label class="dev-notice-off" title="${esc(t.noticeOffTip)}"><input type="checkbox" data-notice-off${noticeOff() ? ' checked' : ''}><span>${esc(t.noticeOff)}</span></label></div>
<div class="dev-notice-actions"><button type="button" class="text-button" data-report>${esc(t.report)}</button><button type="button" class="primary" data-next>${esc(seedWords(locale).next)}</button></div></div>
<div class="dev-notice-page" data-page="seed" hidden>${seedPageHTML(locale, esc, { left: `<button type="button" class="text-button" data-back>${esc(t.back)}</button>`, right: `<button type="button" class="primary" data-next-guide>${esc(t.next)}</button>` })}</div>
<div class="dev-notice-page" data-page="2" hidden><div class="dev-notice-top"><span>${esc(t.guideKicker)}</span><span data-page-no>3 / 3</span></div>
<h2>${esc((GUIDE[locale] || GUIDE.zh).title)}</h2><div class="dev-notice-scroll">${guideHTML(locale, esc)}</div>
<div class="dev-notice-actions"><button type="button" class="text-button" data-back>${esc(t.back)}</button><button type="button" class="secondary" data-ok>${esc(t.done)}</button></div></div>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
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
  /* the start flow: notice -> The Seed (once, then remembered) -> tutorial; Back returns to the page you came from */
  const [one, seed, two] = dialog.querySelectorAll('.dev-notice-page'), trail = [1];
  const page = n => {
    one.hidden = n !== 1; seed.hidden = n !== 'seed'; two.hidden = n !== 2;
    const shown = n === 1 ? one : n === 'seed' ? seed : two;
    const total = seedSeen() || n === 'seed' || trail.includes('seed') ? 3 : 2;
    if (n === 'seed') seed.querySelector('[data-page-no]').textContent = '2 / 3';
    if (n === 2) two.querySelector('[data-page-no]').textContent = total === 3 ? '3 / 3' : '2 / 2';
    shown.querySelector('.secondary, .primary').focus();
  };
  dialog.querySelector('[data-next]').onclick = () => { if (seedSeen()) { trail.push(2); page(2); } else { markSeedSeen(); trail.push('seed'); page('seed'); } };
  dialog.querySelector('[data-next-guide]').onclick = () => { trail.push(2); page(2); };
  dialog.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => { trail.pop(); page(trail[trail.length - 1] || 1); }; });
  dialog.querySelector('[data-ok]').onclick = () => dialog.close();
  dialog.querySelector('[data-notice-close]').onclick = () => dialog.close();
  dialog.querySelector('[data-notice-off]').onchange = event => setNoticeOff(event.target.checked);
  dialog.querySelector('[data-report]').onclick = () => { dialog.close(); openFeedback({ api, locale, esc, toast, version }); };
  dialog.showModal();
  window.megulitYuiStage?.('notice-open');
  const markVisible=()=>{
    if(!dialog.open)return;
    const title=dialog.querySelector('h2');
    if(title?.getBoundingClientRect().height>0 && title.checkVisibility({opacityProperty:true,visibilityProperty:true})){
      window.megulitYuiStage?.('notice-painted');
    }else if(dialog.isConnected && performance.now()<deadline){requestAnimationFrame(markVisible);}
  };
  const deadline=performance.now()+15000;
  if(window.megulitYuiStage)requestAnimationFrame(()=>requestAnimationFrame(markVisible));
  dialog.addEventListener('close',()=>window.megulitYuiStage?.('notice-closed'),{once:true});
  shownThisLaunch = true;
  try { globalThis.sessionStorage?.setItem(launchNoticeKey, '1'); } catch { /* in-memory guard still applies */ }
  const empty = dialog.querySelector('.startup-updates-empty'), list = dialog.querySelector('.dev-notice-updates');
  fillUpdates(dialog, locale, api).then(() => {
    if (!dialog.open) return;
    empty.hidden = !list.hidden;
    empty.textContent = t.noUpdates;
  });
  empty.hidden = !list.hidden; /* fillUpdates draws the browser cache before its first await */
  fillSeedCount(seed, locale, api);
  fillGuideLevel(dialog, { api, locale, esc }); /* the by-level part of the guide follows the chosen level */
  return dialog;
}

/* E458 top bar 指南: everything from the start notice, any time (updates, the tutorial, a report, a game request) */
export function openGuide({ api, locale = 'zh', esc, toast, version = '', tab = 'guide' }) {
  document.querySelector('dialog.guide-panel')?.close();
  const t = words(locale), dialog = document.createElement('dialog'), tabs = [['updates', t.tabUpdates], ['guide', t.tabGuide], ['report', t.tabReport], ['game', t.tabGame]];
  dialog.className = 'game-dialog dev-notice seed-flow guide-panel';
  dialog.innerHTML = `<div class="dev-notice-top"><span>${esc(t.guideKicker)}</span><span>megulit</span></div>
<h2>${esc(t.guide)}</h2>
<nav class="guide-tabs" role="tablist">${tabs.map(([k, v]) => `<button type="button" role="tab" data-tab="${k}">${esc(v)}</button>`).join('')}</nav>
<div class="dev-notice-scroll" data-pane="updates"><ul class="dev-notice-updates" hidden></ul><p class="dev-notice-updates-note" hidden></p><p class="guide-empty">${esc(t.noUpdates)}</p></div>
<div class="dev-notice-scroll" data-pane="guide">${guideHTML(locale, esc)}</div>
<div class="dev-notice-scroll" data-pane="report"><p class="dev-notice-text">${esc(t.reportText)}</p><textarea class="feedback-text" rows="6" maxlength="1800" placeholder="${esc(t.placeholder)}"></textarea><input class="feedback-contact" maxlength="120" placeholder="${esc(t.contact)}"><p class="feedback-privacy">${esc(t.privacy)}</p><p class="feedback-status" role="status" aria-live="polite"></p><div class="dev-notice-actions"><button type="button" class="primary" data-report>${esc(t.send)}</button></div></div>
<div class="dev-notice-scroll" data-pane="game"><p class="dev-notice-text">${esc(t.gameText)}</p><form class="dev-notice-form"><input class="dev-notice-game" maxlength="256" placeholder="${esc(t.gamePlaceholder)}"><button type="submit" class="primary">${esc(t.submit)}</button></form><p class="dev-notice-rule">${esc(t.gameRule)}</p><p class="feedback-status" role="status" aria-live="polite"></p></div>
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
