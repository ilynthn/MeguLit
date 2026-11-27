/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 2026-11-27 新手引导 (user: 「用户第一次使用的话 进游戏之后先像其他游戏教程那样分几步去教用户胶囊/alt+t菜单是怎么使用 并且如何个性化文本的几步教程
   每一步都附带简洁高效的介绍文本… 也加入一个跳过教程按钮… 一共显示五次… 以后就配图就行了」).
   One owner for the tour: its six steps (text, picture, what each step points at in the game) and the launch count.
   Read by the in-game tour (web/reader/modules/onboarding.js) and the illustrated tutorial page (web/onboarding-gallery.js).
   Hotkey names come from window.MeguLitHotkeys.label (web/hotkey-label.js), never written into the text. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else if(root)root.MeguLitOnboarding=api;})(typeof window==='object'?window:typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 /* localStorage key in the reader; tomoyo- keys are mirrored to data/ui-state.json, the user's reader settings */
 const KEY='tomoyo-onboarding',LIMIT=5;
 /* target: selectors tried in order, the first one on screen is lit; several groups light several places.
    menu: open / close the Alt+T menu for this step; tab: the menu page to show; capsule: hold the capsule open meanwhile. */
 const STEPS=[
  {id:'capsule',image:'capsule',target:[['#mg-cap']],menu:'close',capsule:'open'},
  {id:'hotkey',image:'hotkey',target:[['#mg-cap .mg-cap-brand','#mg-cap .mg-cap-dot','#mg-cap']],menu:'close',capsule:'open'},
  {id:'pages',image:'pages',target:[['.tomoyo-cn-dialog[open] .tomoyo-menu-tabs']],menu:'open'},
  {id:'text',image:'text',target:[['.tomoyo-cn-dialog[open] [data-menu-key="text"]'],['.tomoyo-cn-dialog[open] .tomoyo-menu-content .mg-subtabs','.tomoyo-cn-dialog[open] .tomoyo-menu-content']],menu:'open',tab:'text'},
  {id:'lookup',image:'lookup',target:[['.sentence-window .sentence-text']],menu:'close'},
  {id:'help',image:'help',target:[['.tomoyo-cn-dialog[open] [data-menu-key="calibrate"]'],['.tomoyo-cn-dialog[open] .tome-menu-tour']],menu:'open',tab:'calibrate'}];
 const TEXT={
  zh:{kicker:'新手引导',skip:'跳过教程',prev:'上一步',next:'下一步',done:'开始玩',never:'不再显示',close:'关闭',replay:'进游戏后再带我走一遍',replayDone:'好的，下次进游戏会再带你走一遍',
   replayNow:'已在游戏里打开引导',count:'前 {limit} 次进游戏会自动出现，点「跳过教程」就不再出现',again:'教程',againTip:'重看新手引导',more:'详细说明',
   steps:{
    capsule:['这是小胶囊','MeguLit 在游戏画面上的入口。指上去展开快捷键，点中间的 MeguLit 打开菜单；按住能拖到别处，它会自己躲开台词。'],
    hotkey:['用热键打开菜单','随时按 {menu} 打开或收起菜单，不用找胶囊。想看原版画面时按 {cover} 隐藏全部覆盖，再按一次回来。'],
    pages:['菜单里的各页','左边一列是各页：翻译选译法，文字改样式，校准对位置，内嵌管原文替换；学习、语音、记录、外观各管一摊。'],
    text:['把字调成喜欢的样子','在「文字」页先选日文或中文，拖「字号」滑块改大小，切到「颜色」换颜色，改了马上看得到。想挪位置，去「校准」页点「拖动文本框」。'],
    lookup:['点一下就查词','在台词上点一个词，弹出读音和释义；拖选一整句，可以收藏或加进 Anki。'],
    help:['出问题看这里','字没对上原文：进「校准」点「校准当前句」。想再看这套引导，点菜单右上角「教程」，或主界面顶栏「教程」。']}},
  en:{kicker:'Quick tour',skip:'Skip tutorial',prev:'Back',next:'Next',done:'Start playing',never:'Don’t show again',close:'Close',replay:'Walk me through it in the game again',replayDone:'Got it — the tour runs again next time you start a game',
   replayNow:'The tour is open in the game',count:'Shows up for your first {limit} games. Skip tutorial turns it off for good',again:'Tutorial',againTip:'Replay the quick tour',more:'More details',
   steps:{
    capsule:['This is the capsule','MeguLit’s handle on the game screen. Point at it for the shortcuts, click MeguLit in the middle for the menu, hold and drag to move it. It keeps clear of the dialogue.'],
    hotkey:['Open the menu with a hotkey','Press {menu} any time to open or close the menu. Press {cover} to hide every overlay and see the original screen, again to bring it back.'],
    pages:['What each page does','The pages run down the left: Translate picks the translator, Text styles the lines, Calibrate lines them up, Embed handles replacing the original; Learn, Voice, Log and Look do what they say.'],
    text:['Make the text yours','On Text, pick Japanese or Chinese, drag the size slider, and switch to Colour to recolour it; you see it at once. To move the text, go to Calibrate and use Drag text box.'],
    lookup:['Click a word to look it up','Click a word in the line for its reading and meaning. Drag across a whole sentence to save it or send it to Anki.'],
    help:['When something is off','Text not lined up with the original: open Calibrate and click Calibrate this line. To see this tour again, click Tutorial at the top right of the menu, or Tutorial in the main window’s top bar.']}},
  ja:{kicker:'はじめてガイド',skip:'チュートリアルをスキップ',prev:'戻る',next:'次へ',done:'プレイを始める',never:'今後表示しない',close:'閉じる',replay:'次のゲームでもう一度案内する',replayDone:'次にゲームを起動したとき、もう一度案内します',
   replayNow:'ゲーム内でガイドを開きました',count:'最初の {limit} 回の起動で表示されます。スキップすると以後は出ません',again:'チュートリアル',againTip:'はじめてガイドをもう一度',more:'詳しい説明',
   steps:{
    capsule:['これがカプセル','ゲーム画面上の MeguLit の入口。ポインタを合わせるとショートカット、中央の MeguLit をクリックでメニュー。ドラッグで移動でき、台詞は自動で避けます。'],
    hotkey:['ホットキーでメニュー','{menu} でいつでもメニューを開閉。元の画面を見たいときは {cover} で全表示を隠し、もう一度押すと戻ります。'],
    pages:['メニューの各ページ','左の列が各ページです。翻訳は訳し方、文字は見た目、校正は位置合わせ、埋め込みは原文の置き換え。学習・音声・履歴・外観はその名のとおり。'],
    text:['文字を好みの見た目に','「文字」ページで日本語か中国語を選び、サイズのスライダーで大きさ、「色」で色を変えるとすぐ反映されます。位置は「校正」ページの「テキスト枠をドラッグ」で。'],
    lookup:['クリックで辞書','台詞の単語をクリックすると読みと意味が出ます。一文をドラッグで選ぶと、保存や Anki 追加ができます。'],
    help:['困ったときは','原文と位置がずれたら「校正」で「この行を校正」。このガイドをもう一度見るには、メニュー右上の「チュートリアル」か、メイン画面上部の「チュートリアル」を。']}}};
 const words=locale=>TEXT[locale]||TEXT.zh;
 const hotkey=action=>{try{const fn=(typeof window==='object'&&window.MeguLitHotkeys&&window.MeguLitHotkeys.label)||(typeof require==='function'&&require('./hotkey-label.js').label);return String(fn(action)||'');}catch{return '';}};
 /* {menu} {cover} {bind} {log} become the user's current hotkeys; {n} {i} {limit} plain numbers */
 const fill=(text,vars={})=>String(text).replace(/\{(\w+)\}/g,(m,k)=>k in vars?String(vars[k]):['menu','cover','bind','log'].includes(k)?hotkey(k):m);
 const step=(locale,i)=>{const s=STEPS[i];if(!s)return null;const [title,body]=words(locale).steps[s.id];return {...s,index:i,title:fill(title),body:fill(body)};};
 function clean(value){
  let o=value;if(typeof o==='string'){try{o=JSON.parse(o);}catch{o=null;}}if(!o||typeof o!=='object'||Array.isArray(o))o={};
  const shown=Number.isFinite(Number(o.shown))?Math.min(LIMIT,Math.max(0,Math.floor(Number(o.shown)))):0;
  return {shown,stopped:o.stopped===true,last:typeof o.last==='string'?o.last.slice(0,120):'',replay:o.replay===true};
 }
 /* A launch counts once however many status updates carry it (identity = game process id + start time, game-style-sync.cjs).
    The first LIMIT launches show the tour; skipping stops it at once; a replay asked for from the menu or the main window
    shows it at the next launch without counting. */
 function launch(value,identity){
  const state=clean(value),id=String(identity||'');
  if(!id||id===state.last)return {state,show:false};
  const next={...state,last:id.slice(0,120)};
  if(state.replay)return {state:{...next,replay:false},show:true,counted:false};
  if(state.stopped||state.shown>=LIMIT)return {state:next,show:false};
  return {state:{...next,shown:state.shown+1},show:true,counted:true};
 }
 const stop=value=>({...clean(value),stopped:true,replay:false});
 const replay=value=>({...clean(value),replay:true});
 return {KEY,LIMIT,STEPS,TEXT,words,fill,step,clean,launch,stop,replay,hotkey};
});
