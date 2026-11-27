/* SPDX-License-Identifier: GPL-3.0-or-later */
/* E458 使用教程: the steps shown in the start notice (page 2) and in the top bar 指南 panel.
   Hotkeys follow web/reader/modules/settings.js (Alt+T menu, Alt+H overlay on/off, Alt+M bind the window in front). [[...]] becomes a <kbd>. */

export const SUCCESS = {
  zh: { head: '怎样才算适配成功？', steps: ['开游戏，推进到有对话的地方，MeguLit 会自动校准', '正常情况下，游戏原文会自动藏起来，出来的字可以点击查词，这就是适配成功了', '如果原文没被藏住，或者点读查词的字没出来：按 [[Alt+T]] 或点屏幕上的小胶囊，进设置找到「校准」，点「校准当前句」，再推进几句。还是不行，说明这部游戏暂时还没适配'] },
  ja: { head: '対応できたかどうかの目安', steps: ['ゲームを起動して、会話のある場面まで進める。MeguLit が自動で位置を合わせます', 'ふだんは原文が自動で隠れ、出てきた文字をクリックして辞書を引ければ、対応できています', '原文が隠れない、またはクリックで引ける文字が出ないとき：[[Alt+T]] を押すか画面の小さなカプセルを押し、設定の「調整」で「現在の文を調整」を押して、数行進める。それでもだめなら、このゲームはまだ未対応です'] },
  en: { head: 'How do you know it works?', steps: ['Start the game and play until there is dialogue. MeguLit calibrates on its own', 'Normally the game’s own text hides by itself and the words that appear can be clicked to look up: that means it works', 'If the original text stays, or no clickable words appear: press [[Alt+T]] or click the small capsule, open Calibration in the settings, press Calibrate current line and advance a few lines. If it still does not work, this game is not supported yet'] },
};

export const GUIDE = {
  zh: { title: '使用教程', sections: [
    { h: '第一次玩', steps: ['在「游戏库」里启动游戏（还没有就先添加）', '从「新游戏」开始，别直接读档', '推进几句对话，让 MeguLit 抓到文本'] },
    { h: '校准', steps: ['按 [[Alt+T]] 打开菜单，进入「校准」页', '按提示点「校准当前句」，等它对上当前这句', '关掉菜单再推进几句，确认游戏原文被替换', '对不上：在菜单里重新选文本流，或拖动文本框到原文位置；想暂时看原版画面按 [[Alt+H]]'] },
    { h: '翻译', steps: ['去「设置 → 翻译」选一种', '零延迟翻译：有汉化补丁的游戏会自动对上，最快', '免费机翻：不用配置，联网即可', 'API 翻译：填 DeepSeek 等的密钥，质量更好', '本地模型：下载后离线使用'] },
    { h: '学习的节奏：开始前（一次就好）', steps: ['在「学习」页定一个目标（JLPT、EJU、看懂 gal、交流），课程会按目标排序', '在「语法」页选自己的水平；完全零基础先去「五十音」把假名认全', '「设置 → Anki」连上 Anki，想记的词句一键成卡'] },
    { h: '边玩边学', steps: ['先读，读不懂再查：右键单词看查词卡，喇叭听读音', '这句话整体没懂，拖选整句，看「上下文解释」', '只收藏「这周还会再见到」的词：主线常用词、角色口癖、反复出现的语法；不用每个生词都加卡', '有配音的句子，先听原声再看字，耳朵和眼睛一起记'] },
    { h: '玩完之后（10 分钟）', steps: ['「复习」页刷今天到期的卡；右上角「Anki 设置」打开翻面自动播放，听着复习更快', '「句子」页挑两三句点 ▶，跟着角色原声读一遍', '「读过的词」按出现次数排，排在前面又已经会的标「已掌握」，剩下的就是最值得学的'] },
    { h: '每周一次', steps: ['「语法」页学一两课：例句就是你读过的台词，下次在游戏里遇到会一眼认出', '「学习统计」看这周读了多少字、学了多少词', '回收站里有误删的词可以找回'] },
    { h: '按水平怎么用', level: true },
    { h: '常用快捷键', keys: [['Alt+T', '开关菜单（校准、翻译、外观）'], ['Alt+H', '一键开关内嵌和全部 MeguLit 覆盖'], ['Alt+M', '把当前在前面的游戏窗口绑定给 MeguLit（自动没接上时用）']] },
    { h: '遇到问题', steps: ['去「关于」页点「一键上传问题反馈」，写一句原因，日志会一起发过来'] },
  ] },
  ja: { title: '使い方', sections: [
    { h: 'はじめて遊ぶとき', steps: ['「ライブラリ」からゲームを起動（なければ先に追加）', 'セーブをロードせず「はじめから」で始める', '数行進めて、MeguLit にテキストを拾わせる'] },
    { h: '校正', steps: ['[[Alt+T]] でメニューを開き、「校正」ページへ', '案内どおり「現在の文を校正」を押して、今の文に合うのを待つ', 'メニューを閉じて数行進め、原文が置き換わるか確認', '合わないとき：メニューでテキストストリームを選び直すか、テキスト枠を原文の位置へドラッグ。元の画面を見たいときは [[Alt+H]]'] },
    { h: '翻訳', steps: ['「設定 → 翻訳」で選ぶ', 'ゼロ遅延翻訳：翻訳パッチがあれば自動で対応、いちばん速い', '無料機械翻訳：設定不要、ネット接続だけ', 'API 翻訳：DeepSeek などのキーを入れる、品質が高い', 'ローカルモデル：ダウンロード後はオフラインで使える'] },
    { h: '学習の流れ：はじめに（一度だけ）', steps: ['「学習」ページで目標（JLPT・EJU・ギャルゲーを読む・会話）を決めると、課の順番が目標に合わせて並びます', '「文法」ページで自分のレベルを選ぶ。まったくの初心者はまず「五十音」で仮名を覚える', '「設定 → Anki」で Anki とつなぐと、覚えたい単語や文をワンクリックでカードに'] },
    { h: '遊びながら学ぶ', steps: ['まず読んで、わからないときだけ調べる：単語を右クリックで辞書カード、スピーカーで読み', '文全体がわからないときは文をドラッグして「文脈の説明」', '保存するのは「今週また出てきそうな」ものだけ：本編でよく出る語、キャラの口癖、何度も出る文法。新出語を全部カードにしなくていい', 'ボイスのある文は、まず声を聞いてから文字を見る。耳と目で一緒に覚える'] },
    { h: '遊んだあと（10 分）', steps: ['「復習」で今日のカードを。右上の「Anki 設定」で裏面の自動再生をオンにすると聞きながら速く回せる', '「文」ページで二、三文を ▶、キャラの声について読む', '「読んだ単語」は出てきた回数順。上位でもう知っているものを「習得済み」にすると、残りがいちばん覚える価値のある語'] },
    { h: '週に一度', steps: ['「文法」で一、二課：例文は読んだセリフなので、次にゲームで出たらすぐわかる', '「学習統計」で今週の文字数と覚えた単語を確認', '間違えて消した単語はゴミ箱から戻せます'] },
    { h: 'レベル別の使い方', level: true },
    { h: 'よく使うショートカット', keys: [['Alt+T', 'メニューの開閉（校正・翻訳・外観）'], ['Alt+H', '埋め込みと MeguLit の表示をまとめてオン／オフ'], ['Alt+M', '前面のゲームウィンドウを MeguLit に割り当て（自動でつながらないとき）']] },
    { h: '困ったときは', steps: ['「について」ページの「不具合をまとめて送る」から、原因をひとこと。ログも一緒に届きます'] },
  ] },
  en: { title: 'How to use', sections: [
    { h: 'First time', steps: ['Start the game from the Library (add it first if needed)', 'Begin with New Game rather than loading a save', 'Advance a few lines so MeguLit can pick up the text'] },
    { h: 'Calibrate', steps: ['Press [[Alt+T]] and open the Calibrate page', 'Follow the hint and calibrate the current line', 'Close the menu, advance a few lines and check the game text is replaced', 'Not lining up? Pick another text stream in the menu, or drag the text box onto the original; press [[Alt+H]] to see the untouched game'] },
    { h: 'Translation', steps: ['Choose one in Settings → Translation', 'Zero-latency: lines up automatically when the game has a translation patch; fastest', 'Free machine translation: no setup, just online', 'API translation: add a DeepSeek (or similar) key for better quality', 'Local model: download once, then works offline'] },
    { h: 'Learning: before you start (once)', steps: ['Set a goal on the Learning page (JLPT, EJU, reading visual novels, conversation); lessons are ordered for it', 'Pick your level on the Grammar page; complete beginners learn the kana first on the Kana page', 'Connect Anki in Settings → Anki so a word or sentence becomes a card in one click'] },
    { h: 'While you play', steps: ['Read first and look up only what stops you: right-click a word for its card, the speaker plays the reading', 'When a whole line does not make sense, drag over it and read Context explanation', 'Save only what you will meet again this week: common words of the story, a character\u2019s habits of speech, grammar that keeps coming back; not every new word needs a card', 'For voiced lines, listen first, then read: ears and eyes remember together'] },
    { h: 'After playing (10 minutes)', steps: ['Do today\u2019s cards on Review; turn on auto-play in Anki settings (top right) to go faster by ear', 'On Sentences, play two or three lines with ▶ and read along with the character', 'Words read lists words by how often they appeared; mark the ones near the top you already know as mastered, and what is left is what is most worth learning'] },
    { h: 'Once a week', steps: ['One or two Grammar lessons: the examples are lines you have read, so you will spot them next time in the game', 'Statistics shows how much you read and learned this week', 'Words deleted by mistake can be restored from Trash'] },
    { h: 'By level', level: true },
    { h: 'Shortcuts', keys: [['Alt+T', 'Open or close the menu (calibrate, translation, look)'], ['Alt+H', 'Turn embedding and every MeguLit overlay on or off'], ['Alt+M', 'Bind the game window in front to MeguLit (when it did not attach by itself)']] },
    { h: 'Something wrong?', steps: ['Open About and use Report a problem: one sentence is fine, the logs come along'] },
  ] },
};

import { levelSectionHTML } from './guide-levels.js';
const pick = (table, locale) => table[locale] || table.zh;
const kbd = (text, esc) => esc(text).replace(/\[\[(.+?)\]\]/g, '<kbd>$1</kbd>');

export function successHTML(locale, esc) {
  const s = pick(SUCCESS, locale);
  return `<section class="guide-success"><h3>${esc(s.head)}</h3><ol>${s.steps.map(x => `<li>${kbd(x, esc)}</li>`).join('')}</ol>${s.tail ? `<p>${esc(s.tail)}</p>` : ''}</section>`;
}

export function guideHTML(locale, esc) {
  const g = pick(GUIDE, locale);
  /* the by-level section shows the plan for the level chosen on the Learning page (filled in by fillGuideLevel) */
  return `<div class="guide-steps">${g.sections.map(s => s.level ? levelSectionHTML(locale, null, esc, '') : `<section class="guide-section"><h3>${esc(s.h)}</h3>${s.keys
    ? `<dl class="guide-keys">${s.keys.map(([k, v]) => `<div><dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
    : `<ol>${s.steps.map(x => `<li>${kbd(x, esc)}</li>`).join('')}</ol>`}</section>`).join('')}</div>`;
}
