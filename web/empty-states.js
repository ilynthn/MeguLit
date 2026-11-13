// SPDX-License-Identifier: GPL-3.0-or-later
// Empty states for History, Sentences, Recycle bin and Review (2026-11-13, AI-feel review: the four pages shared one
// blank template and read as generated). Each page says what will appear there, in the shape the filled page has,
// and offers the one next step that makes it appear. Buttons use data-blank-go (library / words / kana / dictionary / game:<id>).
const T={
 zh:{lang:'zh-CN',today:'今天还没有读过',sessionsLead:'打开一部作品读一会儿，阅读时间、字数和句数会记在这一天下面，同一部作品连着读会合成一行。',
  dialogueLead:'读游戏时，每一句原文会按时间排在这里，译文跟在下面，之后可以回来查。',
  pick:'从游戏库接着读',never:'还没开始读',last:'上次 ',noGames:'游戏库还是空的，先添加一部游戏。',addGame:'添加第一部游戏',library:'打开游戏库',
  sTitle:'收藏的台词会留在这里',sLead:'在游戏里点一个词，查词卡底部有「收藏句子」。整句原文、译文和作品名会一起存下，以后能做成 Anki 卡片。',
  sAuto:'把词加入 Anki 时，它所在的句子也会自动收进来。',sContinue:'继续读《{t}》',sWords:'看看单词本',
  demoLine:['星が降る夜には、','願い','をひとつだけ'],demoWord:'願い',demoKana:'ねがい',demoDef:'愿望；心愿',demoAnki:'加入 Anki',demoSave:'收藏句子',demoCap:'游戏里的查词卡',
  trash:'回收站是空的。从单词本删掉的词会先放在这里，可以恢复。',back:'回到单词本',
  rest:'今天的复习做完了',restPractice:'这一轮练习结束了',restEmpty:'这个牌组现在没有要复习的卡片',reviewed:'今日已复习',next:'下次到期',deckSize:'牌组共',
  card:'张',none:'一个月内没有',tomorrow:'明天',days:'{n} 天后',later:'一周以后',reviewedUnit:'张 · 今天复习过的卡',dueUnit:'有 {c} 到期',note:'还想多学一点：去单词本挑几个新词，或者回到游戏里接着读。',learn:'去学新词',localDeck:'本地单词本'},
 ja:{lang:'ja-JP',today:'今日はまだ読んでいません',sessionsLead:'作品を開いて少し読むと、読書時間・文字数・文数がこの日の下に記録されます。同じ作品を続けて読むと 1 行にまとまります。',
  dialogueLead:'ゲームを読むと、原文が時間順にここへ並び、訳文がその下に付きます。あとから見返せます。',
  pick:'ライブラリから続きを読む',never:'まだ読んでいません',last:'前回 ',noGames:'ライブラリはまだ空です。まずゲームを追加してください。',addGame:'最初のゲームを追加',library:'ライブラリを開く',
  sTitle:'保存した台詞はここに残ります',sLead:'ゲーム中に語をクリックすると、辞書カードの下に「文を保存」があります。原文・訳文・作品名が一緒に保存され、Anki カードにもできます。',
  sAuto:'語を Anki に追加すると、その文も自動で保存されます。',sContinue:'『{t}』の続きを読む',sWords:'単語帳を見る',
  demoLine:['星が降る夜には、','願い','をひとつだけ'],demoWord:'願い',demoKana:'ねがい',demoDef:'願うこと。望み',demoAnki:'Anki に追加',demoSave:'文を保存',demoCap:'ゲーム内の辞書カード',
  trash:'ごみ箱は空です。単語帳から削除した語はいったんここに入り、復元できます。',back:'単語帳へ戻る',
  rest:'今日の復習は終わりました',restPractice:'今回の練習は終わりました',restEmpty:'このデッキに今復習するカードはありません',reviewed:'今日の復習',next:'次の期限',deckSize:'デッキ',
  card:'枚',none:'1 か月以内はなし',tomorrow:'明日',days:'{n} 日後',later:'1 週間以降',reviewedUnit:'枚を今日復習しました',dueUnit:'に {c} が期限',note:'もう少し続けるなら、単語帳から新しい語を選ぶか、ゲームの続きを読みましょう。',learn:'新しい語を学ぶ',localDeck:'ローカル単語帳'},
 en:{lang:'en-US',today:'Nothing read today',sessionsLead:'Open a game and read for a while. Reading time, characters and lines land under this day; back-to-back sessions of one game merge into one row.',
  dialogueLead:'While you read, every line of the game is listed here in order with its translation underneath, so you can come back to it.',
  pick:'Continue from your library',never:'Not started',last:'Last ',noGames:'Your library is empty. Add a game first.',addGame:'Add your first game',library:'Open library',
  sTitle:'Saved lines end up here',sLead:'Click a word in the game: the lookup card has “Save sentence” at the bottom. The line, its translation and the game are kept together and can become an Anki card.',
  sAuto:'Adding a word to Anki keeps its line here too.',sContinue:'Continue {t}',sWords:'Open word list',
  demoLine:['星が降る夜には、','願い','をひとつだけ'],demoWord:'願い',demoKana:'ねがい',demoDef:'wish; desire',demoAnki:'Add to Anki',demoSave:'Save sentence',demoCap:'The lookup card in a game',
  trash:'The recycle bin is empty. Words you delete wait here first and can be restored.',back:'Back to words',
  rest:'Today’s review is done',restPractice:'This practice round is over',restEmpty:'Nothing to review in this deck right now',reviewed:'Reviewed today',next:'Next due',deckSize:'Deck size',
  card:'cards',none:'Not within a month',tomorrow:'Tomorrow',days:'In {n} days',later:'After a week',reviewedUnit:'cards reviewed today',dueUnit:'{c} due',note:'Want a little more? Pick a few new words from your list, or go back to the game.',learn:'Learn new words',localDeck:'Local word list'}
};
const t=locale=>T[locale]||T.zh;
const short=s=>String(s||'').replace(/^(\s*\[[^\]]*\])+\s*/,'');
const thumb=(g,esc)=>g.cover?`<img src="${esc(g.cover)}" alt="" loading="lazy">`:`<span class="es-noart" lang="ja">${esc(short(g.title).slice(0,1))}</span>`;

export function historyEmpty({locale,esc,games=[],mode='sessions'}){
 const s=t(locale),d=new Date(),list=games.filter(g=>!g.hidden).slice(0,4),day=x=>new Date(x*1000).toLocaleDateString(s.lang,{month:'numeric',day:'numeric'});
 const pick=list.length?`<h3 class="es-label">${esc(s.pick)}</h3><div class="es-games">${list.map(g=>`<button type="button" class="es-game" data-blank-go="game:${esc(g.id)}">${thumb(g,esc)}<span><b lang="ja">${esc(short(g.title))}</b><small>${g.lastPlayedAt?esc(s.last+day(g.lastPlayedAt)):esc(s.never)}</small></span></button>`).join('')}</div><button type="button" class="text-button es-more" data-blank-go="library">${esc(s.library)} →</button>`
  :`<p class="es-lead">${esc(s.noGames)}</p><div class="es-acts"><button type="button" class="primary" data-blank-go="library">${esc(s.addGame)}</button></div>`;
 return `<section class="es-history"><div class="es-day" aria-hidden="true"><b>${String(d.getDate()).padStart(2,'0')}</b><span>${esc(d.toLocaleDateString(s.lang,{year:'numeric',month:'long'}))}</span><small>${esc(d.toLocaleDateString(s.lang,{weekday:'long'}))}</small></div><div class="es-hbody"><h2>${esc(s.today)}</h2><p class="es-lead">${esc(mode==='sessions'?s.sessionsLead:s.dialogueLead)}</p>${pick}</div></section>`;
}

export function sentencesEmpty({locale,esc,games=[]}){
 const s=t(locale),recent=games.filter(g=>!g.hidden&&g.lastPlayedAt).sort((a,b)=>b.lastPlayedAt-a.lastPlayedAt)[0];
 const go=recent?`<button type="button" class="primary" data-blank-go="game:${esc(recent.id)}">${esc(s.sContinue.replace('{t}',short(recent.title)))}</button><button type="button" class="text-button" data-blank-go="library">${esc(s.library)}</button>`
  :`<button type="button" class="primary" data-blank-go="library">${esc(s.library)}</button><button type="button" class="text-button" data-blank-go="words">${esc(s.sWords)}</button>`;
 const [a,w,b]=s.demoLine;
 return `<section class="es-sent"><div class="es-sent-copy"><h2>${esc(s.sTitle)}</h2><p class="es-lead">${esc(s.sLead)}</p><p class="es-aside">${esc(s.sAuto)}</p><div class="es-acts">${go}</div></div><figure class="es-demo" aria-hidden="true"><p class="es-demo-line" lang="ja">${esc(a)}<mark>${esc(w)}</mark>${esc(b)}</p><div class="es-demo-card"><div class="es-demo-word"><b lang="ja">${esc(s.demoWord)}</b><small lang="ja">${esc(s.demoKana)}</small></div><p>${esc(s.demoDef)}</p><div class="es-demo-bar"><span>${esc(s.demoAnki)}</span><span class="on">${esc(s.demoSave)}</span></div></div><figcaption>${esc(s.demoCap)}</figcaption></figure></section>`;
}

export function trashEmpty({locale,esc}){const s=t(locale);
 return `<p class="es-trash">${esc(s.trash)} <button type="button" class="text-button" data-blank-go="words">${esc(s.back)}</button></p>`;}

/* Review finished: what was done today, when the next cards are due, and where to go for more. kind: rest / practice / empty */
export function reviewRest({locale,esc,kind='rest',deck='',reviewed=null,nextDue,total=null,local=false,extra=''}){
 const s=t(locale),n=x=>Number(x).toLocaleString(s.lang);
 const due=nextDue===undefined?null:!nextDue||!nextDue.count?[s.none,'']:[nextDue.days===1?s.tomorrow:nextDue.days>7?s.later:s.days.replace('{n}',nextDue.days),n(nextDue.count)+' '+s.card];
 /* one number leads: today's count when there is one, otherwise when cards come back; the rest is a plain line */
 const did=reviewed>0,hero=did?[n(reviewed),s.reviewedUnit]:due?[due[0],due[1]?s.dueUnit.replace('{c}',due[1]):'']:null;
 const line=[did&&due&&`${s.next} ${due[0]}${due[1]?' · '+due[1]:''}`,(local?s.localDeck:deck)+(total?` · ${s.deckSize} ${n(total)} ${s.card}`:'')].filter(Boolean);
 return `<section class="es-rest"><h2>${esc(kind==='practice'?s.restPractice:kind==='empty'?s.restEmpty:s.rest)}</h2>${hero?`<p class="es-hero${did?' is-done':''}"><b>${esc(hero[0])}</b><span>${esc(hero[1])}</span></p>`:''}<p class="es-meta">${line.map(esc).join('<i aria-hidden="true"></i>')}</p><p class="es-lead">${esc(s.note)}</p><div class="es-acts"><button type="button" class="primary" data-blank-go="words">${esc(s.learn)}</button>${extra}</div></section>`;
}
