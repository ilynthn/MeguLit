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
 /* target: selectors tried in order, the first one on screen is lit (the hole in the dimmed screen).
    act: what the user has to do before the tour moves on: 'open' (open the Alt+T menu by clicking the lit capsule),
    'hotkey' (close and open the menu with the menu hotkey), 'tab' (click the lit tab); without act, 下一步 moves on.
    after: where the hole moves once the act is done (the step then waits for 下一步).
    menu: open / close the Alt+T menu on entering; tab: the page to show; capsule: hold the capsule open meanwhile. */
 const STEPS=[
  {id:'capsule',image:'capsule',target:[['#mg-cap']],menu:'close',capsule:'open',act:'open'},
  {id:'hotkey',image:'hotkey',target:[['#mg-cap .mg-cap-brand','#mg-cap .mg-cap-dot','#mg-cap']],capsule:'open',act:'hotkey'},
  {id:'pages',image:'pages',target:[['.tomoyo-cn-dialog[open] .tomoyo-menu-tabs']],menu:'open'},
  {id:'text',image:'text',target:[['.tomoyo-cn-dialog[open] .tomoyo-menu-tabs [data-menu-key="text"]']],menu:'open',act:'tab',actTab:'text',
   after:[['.tomoyo-cn-dialog[open] .tomoyo-menu-content .mg-subtabs','.tomoyo-cn-dialog[open] .tomoyo-menu-content']]},
  {id:'lookup',image:'lookup',target:[['.sentence-window .sentence-text']],menu:'close'},
  {id:'help',image:'help',target:[['.tomoyo-cn-dialog[open] .tomoyo-menu-tabs [data-menu-key="calibrate"]']],menu:'open',tab:'calibrate'}];
 const TEXT={
  zh:{kicker:'新手引导',finish:'完成',skip:'跳过教程',prev:'上一步',next:'下一步',done:'开始玩',never:'不再显示',close:'关闭',replay:'进游戏后再带我走一遍',replayDone:'好的，下次进游戏会再带你走一遍',
   replayNow:'已在游戏里打开引导',count:'前 {limit} 次进游戏会自动出现，点「跳过教程」就不再出现',again:'教程',act:{open:'点亮着的胶囊继续',hotkey:'按 {menu} 两次继续',tab:'点亮着的页签继续'},againTip:'重看新手引导',more:'详细说明',
   steps:{
    capsule:['这是小胶囊','MeguLit 在游戏里的入口，指上去展开快捷键，按住能拖走。现在点一下中间的 MeguLit，打开菜单。'],
    hotkey:['用热键开关菜单','不找胶囊也行：按 {menu} 把菜单收起来，再按一次打开。想看原版画面时按 {cover}。'],
    pages:['菜单里的各页','左边一列是各页：翻译选译法，文字改样式，校准对位置，内嵌管原文替换；学习、语音、记录、外观各管一摊。'],
    text:['把字调成喜欢的样子','点亮着的「文字」页签。这页拖「字号」滑块改大小，切到「颜色」换颜色，改了马上看得到；挪位置去「校准」点「拖动文本框」。'],
    lookup:['点一下就查词','在台词上点一个词，弹出读音和释义；拖选一整句，可以收藏或加进 Anki。'],
    help:['出问题看这里','字没对上原文：进亮着的「校准」点「校准当前句」。想再看这套引导，点菜单右上角「教程」，或主界面顶栏「教程」。']}},
  en:{kicker:'Quick tour',finish:'Done',skip:'Skip tutorial',prev:'Back',next:'Next',done:'Start playing',never:'Don’t show again',close:'Close',replay:'Walk me through it in the game again',replayDone:'Got it — the tour runs again next time you start a game',
   replayNow:'The tour is open in the game',count:'Shows up for your first {limit} games. Skip tutorial turns it off for good',again:'Tutorial',act:{open:'Click the lit capsule to go on',hotkey:'Press {menu} twice to go on',tab:'Click the lit tab to go on'},againTip:'Replay the quick tour',more:'More details',
   steps:{
    capsule:['This is the capsule','MeguLit’s handle in the game: point at it for the shortcuts, hold and drag to move it. Now click MeguLit in the middle to open the menu.'],
    hotkey:['Toggle the menu with a hotkey','No need to find the capsule: press {menu} to close the menu, then once more to open it. {cover} shows the original screen.'],
    pages:['What each page does','The pages run down the left: Translate picks the translator, Text styles the lines, Calibration lines them up, Embedding replaces the original text; Study, Voice, Log and Appearance do what they say.'],
    text:['Make the text yours','Click the lit Text tab. There the size slider changes the size and Colour the colour, live; to move the text, use Drag text box on Calibration.'],
    lookup:['Click a word to look it up','Click a word in the line for its reading and meaning. Drag across a whole sentence to save it or send it to Anki.'],
    help:['When something is off','Text not lined up with the original: open Calibration and click Calibrate current line. To see this tour again, click Tutorial at the top right of the menu, or Tutorial in the main window’s top bar.']}},
  ja:{kicker:'はじめてガイド',finish:'完了',skip:'チュートリアルをスキップ',prev:'戻る',next:'次へ',done:'プレイを始める',never:'今後表示しない',close:'閉じる',replay:'次のゲームでもう一度案内する',replayDone:'次にゲームを起動したとき、もう一度案内します',
   replayNow:'ゲーム内でガイドを開きました',count:'最初の {limit} 回の起動で表示されます。スキップすると以後は出ません',again:'チュートリアル',act:{open:'光っているカプセルをクリック',hotkey:'{menu} を 2 回押して次へ',tab:'光っているタブをクリック'},againTip:'はじめてガイドをもう一度',more:'詳しい説明',
   steps:{
    capsule:['これがカプセル','ゲーム内の MeguLit の入口。ポインタでショートカット、ドラッグで移動できます。中央の MeguLit をクリックしてメニューを開いてみましょう。'],
    hotkey:['ホットキーでメニューを開閉','カプセルを探さなくても大丈夫。{menu} でメニューを閉じ、もう一度押して開きます。元の画面は {cover} で。'],
    pages:['メニューの各ページ','左の列が各ページです。翻訳は訳し方、文字は見た目、調整は位置合わせ、埋め込みは原文の置き換え。学習・音声・ログ・外観はその名のとおり。'],
    text:['文字を好みの見た目に','光っている「文字」タブをクリック。サイズのスライダーで大きさ、「色」で色がすぐ変わります。位置は「調整」の「テキスト枠をドラッグ」で。'],
    lookup:['クリックで辞書','台詞の単語をクリックすると読みと意味が出ます。一文をドラッグで選ぶと、保存や Anki 追加ができます。'],
    help:['困ったときは','原文と位置がずれたら「調整」で「現在の文を調整」。このガイドをもう一度見るには、メニュー右上の「チュートリアル」か、メイン画面上部の「チュートリアル」を。']}}};
 const words=locale=>TEXT[locale]||TEXT.zh;
 /* pictures are taken in each interface language (tools/onboarding-shots.cjs): capsule.webp, capsule-en.webp, capsule-ja.webp */
 const image=(name,locale)=>name+(locale==='en'||locale==='ja'?'-'+locale:'')+'.webp';
 const hotkey=action=>{try{const fn=(typeof window==='object'&&window.MeguLitHotkeys&&window.MeguLitHotkeys.label)||(typeof require==='function'&&require('./hotkey-label.js').label);return String(fn(action)||'');}catch{return '';}};
 /* {menu} {cover} {bind} {log} become the user's current hotkeys; {n} {i} {limit} plain numbers */
 const fill=(text,vars={})=>String(text).replace(/\{(\w+)\}/g,(m,k)=>k in vars?String(vars[k]):['menu','cover','bind','log'].includes(k)?hotkey(k):m);
 const step=(locale,i)=>{const s=STEPS[i];if(!s)return null;const [title,body]=words(locale).steps[s.id];return {...s,index:i,title:fill(title),body:fill(body)};};
 function clean(value){
  let o=value;if(typeof o==='string'){try{o=JSON.parse(o);}catch{o=null;}}if(!o||typeof o!=='object'||Array.isArray(o))o={};
  const shown=Number.isFinite(Number(o.shown))?Math.min(LIMIT,Math.max(0,Math.floor(Number(o.shown)))):0;
  return {shown,stopped:o.stopped===true,last:typeof o.last==='string'?o.last.slice(0,120):'',replay:o.replay===true,seen:o.seen===true};
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
 const stop=value=>({...clean(value),stopped:true,replay:false,seen:true});
 /* the red dot on the 教程 buttons goes once the tour has been on screen */
 const seen=value=>({...clean(value),seen:true});
 const replay=value=>({...clean(value),replay:true});
 return {KEY,LIMIT,STEPS,TEXT,words,image,fill,step,clean,launch,stop,replay,seen,hotkey};
});
