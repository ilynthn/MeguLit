/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 2026-11-12 (user: after choosing a level, give the advice and the way of using MeguLit that fits it). One short plan per
   level, shown in the guide (top bar 指南 and the start notice) for the level chosen on the Learning page, and right
   after the level is picked. Levels as in services/learning-level.cjs. [[...]] becomes a <kbd>. */
export const LEVEL_IDS=['none','kana','N5','N4','N3','N2','N1','N0'];
export const LEVEL_TIPS={
 zh:{head:l=>`你的水平：${l}`,unset:'还没选水平：去「学习 → 语法」选一下，这里会换成适合你的用法',change:'水平变了随时去「学习 → 语法」改',names:{none:'完全零基础',kana:'认识部分五十音',N5:'N5',N4:'N4',N3:'N3',N2:'N2',N1:'N1',N0:'N0 · 母语级'},
  tips:{
   none:['第一周只做一件事：「五十音」每天两三课，把平假名、片假名认全','然后「语法」从 N5 第 1 课开始，每天一课','玩游戏时一直开着中文译文，先挑配音多、句子短的作品','只查反复出现的词，Anki 新卡每天 5–10 张就够'],
   kana:['先在「五十音」图里把已经认识的点成「掌握」，剩下的按课补完','「语法」从 N5 开始，每天一课','玩游戏开着译文，有配音的句子先听原声再看字','每天收藏 5–10 个常见词，第二天在「复习」里刷'],
   N5:['「语法」从 N4 开始，每天一课','玩游戏先读一遍日文，再看译文对照','「读过的词」里出现次数前 200 的词优先学，会的标「已掌握」','Anki 新卡每天 10–15 张，翻面自动播放读音'],
   N4:['「语法」从 N3 开始','试着先只看日文，读不懂再看译文；整句不懂就拖选看「上下文解释」','「读过的词」前 500 里还没掌握的，挑常见的加卡','「句子」页每天跟着原声读两三句'],
   N3:['「语法」从 N2 开始','在 [[Alt+T]] 菜单打开「译文模糊（悬停显示）」，卡住了再把鼠标移上去','难句拖选看「上下文解释」，比查单个词更有用','Anki 改为以句子卡为主：例句加原声，比单词卡记得牢'],
   N2:['「语法」从 N1 开始','译文保持模糊，或者在 [[Alt+T]] 菜单里关掉，只靠查词','重点收藏口语、俗语、角色口癖这些教材里少见的说法','每周看一次「学习统计」的阅读量，挑文本量大的作品'],
   N1:['「语法」看 N0：流行语、口语缩约、网络用语','关掉译文，只在卡住时看「上下文解释」','在「读过的词」里找生僻词、古风说法和作者的用词习惯','用 MeguLit 的原声跟读练听力和语感'],
   N0:['基本不用译文：MeguLit 主要用来收藏好句、跟读原声','「读过的词」里找方言、古语和考级不考的说法','「语法」N0 里看看你不熟的新说法','在「广场 → 交流」帮其他玩家解答问题']}},
 ja:{head:l=>`あなたのレベル：${l}`,unset:'レベルがまだです：「学習 → 文法」で選ぶと、ここが合った使い方に変わります',change:'レベルが変わったら「学習 → 文法」でいつでも変更',names:{none:'まったくの初心者',kana:'五十音を少し',N5:'N5',N4:'N4',N3:'N3',N2:'N2',N1:'N1',N0:'N0 · ネイティブ級'},
  tips:{
   none:['最初の一週間はこれだけ：「五十音」を毎日二、三課、ひらがなとカタカナを全部覚える','そのあと「文法」N5 の第 1 課から一日一課','ゲームは訳文を表示したまま。ボイスが多く文が短い作品から','何度も出てくる語だけ調べ、Anki の新規は一日 5〜10 枚で十分'],
   kana:['「五十音」の表で知っている仮名を「習得」にして、残りを課ごとに','「文法」は N5 から一日一課','ゲームは訳文を表示。ボイスのある文はまず声を聞いてから文字を見る','よく出る語を一日 5〜10 個保存して、翌日「復習」で回す'],
   N5:['「文法」は N4 から一日一課','ゲームはまず日本語を一度読んで、それから訳文で確認','「読んだ単語」で回数上位 200 語を優先し、知っているものは「習得済み」に','Anki の新規は一日 10〜15 枚、裏面で読みを自動再生'],
   N4:['「文法」は N3 から','まず日本語だけで読み、わからないときに訳文。文全体がわからなければドラッグして「文脈の説明」','「読んだ単語」上位 500 語のうち未習得でよく出る語をカードに','「文」ページで毎日二、三文、ボイスについて読む'],
   N3:['「文法」は N2 から','[[Alt+T]] メニューで訳文のぼかし（ホバーで表示）をオンにし、詰まったらマウスを','難しい文はドラッグして「文脈の説明」。単語ひとつより役に立ちます','Anki は文カード中心に：例文とボイスのほうが単語カードより残る'],
   N2:['「文法」は N1 から','訳文はぼかしたまま、または [[Alt+T]] メニューで消して辞書だけで','口語・俗語・キャラの口癖など教材にない言い回しを重点的に保存','週に一度「学習統計」で読書量を確認し、文章量の多い作品を選ぶ'],
   N1:['「文法」は N0：流行語、口語の縮約、ネットスラング','訳文を消し、詰まったときだけ「文脈の説明」','「読んだ単語」で珍しい語、古風な言い方、作者の言葉づかいを探す','ボイスのシャドーイングで聞き取りと語感を'],
   N0:['訳文はほぼ不要：好きな文の保存とボイスのシャドーイングに','「読んだ単語」で方言や古語、試験に出ない言い回しを','「文法」N0 で知らない新しい言い方を確認','「広場 → 交流」でほかのプレイヤーの質問に答える']}},
 en:{head:l=>`Your level: ${l}`,unset:'No level yet: choose one under Learning → Grammar and this turns into the plan for you',change:'Change your level any time under Learning → Grammar',names:{none:'Complete beginner',kana:'Some kana',N5:'N5',N4:'N4',N3:'N3',N2:'N2',N1:'N1',N0:'N0 · Native-like'},
  tips:{
   none:['First week, one job: two or three Kana lessons a day until you know hiragana and katakana','Then Grammar from N5 lesson 1, one lesson a day','Keep the translation on while you play; start with games that have lots of voice and short lines','Look up only words that keep coming back; 5–10 new Anki cards a day is plenty'],
   kana:['Mark the kana you already know on the Kana chart, then take the rest lesson by lesson','Grammar from N5, one lesson a day','Play with the translation on; for voiced lines, listen before you read','Save 5–10 common words a day and review them the next day'],
   N5:['Grammar from N4, one lesson a day','Read each line in Japanese first, then check the translation','Learn the top 200 of Words read first and mark the ones you know as mastered','10–15 new Anki cards a day, with the reading auto-played on the back'],
   N4:['Grammar from N3','Read Japanese only and look at the translation when stuck; drag over a whole line for Context explanation','Add cards for common words in the top 500 of Words read that you do not know yet','Read two or three lines a day along with the voice on Sentences'],
   N3:['Grammar from N2','Turn on the blurred translation (shown on hover) in the [[Alt+T]] menu and hover only when stuck','On hard lines drag and read Context explanation: it helps more than single words','Move Anki to sentence cards: an example with its voice sticks better than a word card'],
   N2:['Grammar from N1','Keep the translation blurred or turn it off in the [[Alt+T]] menu and rely on look-up','Save spoken language, slang and characters’ verbal tics that textbooks skip','Check Statistics once a week and pick games with lots of text'],
   N1:['Grammar at N0: current slang, spoken contractions, net speak','Turn the translation off; open Context explanation only when stuck','Look in Words read for rare words, old-fashioned phrasing and the writer’s habits','Shadow the voices for listening and feel'],
   N0:['You hardly need the translation: use MeguLit to keep good lines and shadow the voices','Look in Words read for dialects, archaic words and phrasing the tests never cover','Browse Grammar N0 for new expressions','Help other players in Plaza → Community']}}
};
const kbd=(text,esc)=>esc(text).replace(/\[\[(.+?)\]\]/g,'<kbd>$1</kbd>');
/* the guide section for one level; unset shows how to choose one */
export function levelSectionHTML(locale,level,esc,number=''){
 const t=LEVEL_TIPS[locale]||LEVEL_TIPS.zh,known=LEVEL_IDS.includes(level);
 const head=known?t.head(t.names[level]):t.head('—');
 const body=known?`<ol>${t.tips[level].map(x=>`<li>${kbd(x,esc)}</li>`).join('')}</ol><p class="guide-level-note">${esc(t.change)}</p>`:`<p class="guide-level-note">${esc(t.unset)}</p>`;
 return `<section class="guide-section guide-level" data-guide-level="${known?level:''}"><h3>${number?`<span class="guide-no">${number}</span>`:''}${esc(head)}</h3>${body}</section>`;
}
/* fills the level section of a rendered guide once the chosen level is known */
export async function fillGuideLevel(root,{api,locale,esc}){
 const slot=root?.querySelector?.('[data-guide-level]');if(!slot)return;
 let level=null;try{level=(await api('learning_level'))?.level||null;}catch{}
 const number=slot.querySelector('.guide-no')?.textContent||'';slot.outerHTML=levelSectionHTML(locale,level,esc,number);
}
