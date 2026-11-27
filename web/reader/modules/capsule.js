/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 2026-11-26 (issue #1138, user: 「alt+t菜单优先屏幕上面居中的灵动设计 并且三个风格可以自选 三个全部继续深度优化」): a resident
   capsule over the game that opens and closes the Alt+T menu and its quick area. Three styles, chosen in Alt+T 外观, default A:
   A  顶部灵动岛  top centre; the brand pill grows sideways into the quick bar under the pointer and shrinks back; drag along the top
   B  侧边竖条    a rail on the left or right edge with the quick keys; it widens to show labels; drag up/down, drop on the other half to switch side
   C  角落圆点    a faint dot in a corner; click unfolds a card of shortcuts and the 常驻 switch; drops snap to the nearest corner
   One mechanism for all three: the surface is laid out at its open size once and a clip-path morphs between the open shape, the
   resting shape and the idle shape (transform/opacity/clip only, never layout). The painted and clickable area (the overlay window
   region, interaction.js) follows the state: it grows before an opening animation and shrinks after a closing one, so nothing is clipped.
   Positions avoid the reading layer and the game's dialogue (no overlap with Japanese/Chinese lines, choices, the lookup card or the
   menu) and only move back to the chosen spot after it has stayed free for a while, so the capsule does not jump line by line.
   Preferences live in localStorage 'tomoyo-capsule' (mirrored to ui-state.json): personal, never part of a seed or a shared diff.
   Mouse-hiding games (#1144): the capsule is a normal hit region, so the pointer gate relays its clicks and does not let them
   advance the game; opening the menu from it frees the clipped cursor like Alt+T does.
   2026-11-28 (owner, beta test on ISLAND: 「胶囊要能拖出去，放在游戏窗口外面」): dropping the capsule with its handle outside the
   game's client area floats it there (prefs.out, overlay px). It uses the mechanism the Alt+T menu already uses to sit beyond the
   game: the overlay spans the desktop while bound and only its region follows what is painted, so no extra window, no focus
   change. A floating capsule keeps its desktop spot when the game moves, hides and comes back with the overlay (game minimised,
   another app in front), and docks again when dragged back onto the game or via Alt+T → 外观 → 收回游戏窗口. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api.core;else try{api.install(root);}catch(error){console.error('capsule',error);}})(typeof window==='object'?window:this,function(){
 'use strict';
 const KEY='tomoyo-capsule',STYLES=['a','b','c'],CORNERS=['tl','tr','br','bl'];
 const TOP=10,EDGE=10,PAD=10,STEP=8;
 const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
 const num=(v,d,lo,hi)=>v===null||v===''||v===undefined||!Number.isFinite(Number(v))?d:clamp(Number(v),lo,hi);
 function clean(value){
  const o=value&&typeof value==='object'?value:{};
  return {on:o.on!==false,style:STYLES.includes(o.style)?o.style:'a',a:{x:num(o.a?.x,.5,0,1)},b:{side:o.b?.side==='left'?'left':'right',y:num(o.b?.y,.42,0,1)},c:{corner:CORNERS.includes(o.c?.corner)?o.c.corner:'tl'},
   out:{on:o.out?.on===true,x:num(o.out?.x,0,0,1e5),y:num(o.out?.y,0,0,1e5)}};
 }
 /* the handle counts as outside the game once its centre leaves the game's client area */
 const outside=(r,game)=>{const cx=r.x+r.w/2,cy=r.y+r.h/2;return cx<game.x||cy<game.y||cx>game.x+game.w||cy>game.y+game.h;};
 /* floating: the wanted top-left of the handle, kept on the overlay (the desktop); the open shape {w,h,ax,ay} stays on it too */
 function placeOut(want,size,screen,open){
  const fit=(v,lo,hi)=>clamp(v,lo,Math.max(lo,hi));
  let x=fit(want.x,EDGE,screen.w-EDGE-size.w),y=fit(want.y,EDGE,screen.h-EDGE-size.h);
  if(open){x=fit(x-open.ax,EDGE,screen.w-EDGE-open.w)+open.ax;y=fit(y-open.ay,EDGE,screen.h-EDGE-open.h)+open.ay;}
  return {x,y,fits:true,out:true};
 }
 const overlaps=(r,obs)=>obs.some(o=>r.x<o.x+o.w&&r.x+r.w>o.x&&r.y<o.y+o.h&&r.y+r.h>o.y);
 /* nearest free spot along one axis, scanning outward from the wanted one in STEP px */
 function scan(want,lo,hi,rectAt,obs){
  if(hi<lo)return null;const start=clamp(want,lo,hi);
  for(let d=0;d<=hi-lo+STEP;d+=STEP)for(const c of d?[start-d,start+d]:[start]){if(c<lo-.5||c>hi+.5)continue;const v=clamp(c,lo,hi);if(!overlaps(rectAt(v),obs))return v;}
  return null;
 }
 /* A: x = wanted centre of the resting pill; returns the pill's top-left */
 function placeA(want,size,view,obs){
  const lo=EDGE+size.w/2,hi=view.w-EDGE-size.w/2,rect=c=>({x:c-size.w/2,y:size.y,w:size.w,h:size.h});
  const c=scan(want,lo,hi,rect,obs);const x=(c===null?clamp(want,lo,Math.max(lo,hi)):c)-size.w/2;
  return {x,y:size.y,fits:c!==null};
 }
 /* B: the rail sits EDGE px from its side; y = wanted centre; tries the other side before giving up */
 function placeB(side,want,size,view,obs){
  for(const s of [side,side==='left'?'right':'left']){
   const x=s==='left'?EDGE:view.w-EDGE-size.w,lo=EDGE+size.h/2,hi=view.h-EDGE-size.h/2;
   const c=scan(want,lo,hi,v=>({x,y:v-size.h/2,w:size.w,h:size.h}),obs);
   if(c!==null)return {side:s,x,y:c-size.h/2,fits:true};
  }
  return {side,x:side==='left'?EDGE:view.w-EDGE-size.w,y:clamp(want,EDGE+size.h/2,Math.max(EDGE+size.h/2,view.h-EDGE-size.h/2))-size.h/2,fits:false};
 }
 const cornerXY=(corner,size,view)=>({x:corner[1]==='l'?EDGE:view.w-EDGE-size.w,y:corner[0]==='t'?EDGE:view.h-EDGE-size.h});
 /* C: the chosen corner, then the corners next to it, the opposite one last */
 function placeC(corner,size,view,obs){
  const i=CORNERS.indexOf(corner),order=[corner,CORNERS[(i+1)%4],CORNERS[(i+3)%4],CORNERS[(i+2)%4]];
  for(const c of order){const p=cornerXY(c,size,view);if(!overlaps({...p,...size},obs))return {corner:c,...p,fits:true};}
  return {corner,...cornerXY(corner,size,view),fits:false};
 }
 const snapCorner=(cx,cy,view)=>(cy<view.h/2?'t':'b')+(cx<view.w/2?'l':'r');
 const sideOf=(cx,view)=>cx<view.w/2?'left':'right';
 const clip=(g,r)=>`inset(${r.y}px ${g.w-r.x-r.w}px ${g.h-r.y-r.h}px ${r.x}px round ${r.r}px)`;
 /* where a drag ends: back into the game (style rules apply) or floating at the dropped spot */
 function dropAt(r,game,screen){
  if(!outside(r,game))return {out:false};
  const p=placeOut({x:r.x,y:r.y},{w:r.w,h:r.h},screen);return {out:true,x:Math.round(p.x),y:Math.round(p.y)};
 }
 /* 2026-11-28 (owner, P0: 「隐藏了alt+t胶囊所有功能就全部隐藏了」, 「常驻显示开关也无法打开」): the capsule's own button used to
    toggle the whole overlay cover (Alt+H), which also took the hook out of the translation route, and 常驻 could not bring it back
    while the cover was off. Now prefs.on is the one state behind 常驻 and the tuck button: tucking only folds the capsule into a
    faint handle, the whole-layer hide stays on Alt+H (and the labelled row in the corner card), and turning the capsule on
    also brings a hidden cover back so it is really seen. */
 function press(prefs,act,ctx={}){
  if(act==='fold')return {prefs:{...prefs,on:false},send:null};
  if(act==='unfold')return {prefs:{...prefs,on:true},send:ctx.coverHidden?{type:'galToggleCover'}:null};
  if(act==='cover')return {prefs,send:{type:'galToggleCover'}};
  return {prefs,send:null};
 }
 const shownAs=(prefs,ctx={})=>prefs.on||ctx.menu||ctx.held?'capsule':'handle';
 const core={KEY,STYLES,CORNERS,TOP,EDGE,PAD,clean,press,shownAs,overlaps,placeA,placeB,placeC,placeOut,outside,dropAt,snapCorner,sideOf,clip};

 function install(window){
  const document=window.document;
  if(!document.documentElement||!document.body){document.addEventListener('DOMContentLoaded',()=>install(window),{once:true});return;}
  if(window.__megulitCapsule)return;
  let localStorage;try{localStorage=window.localStorage;}catch{const m=new Map();localStorage={getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v));}};}
  const bridge=()=>window.__tomoyoChinese||{};
  const IDLE_MS=2600,FIRST_IDLE_MS=4200,INTENT_MS=110,GRACE_MS=380,CARD_GRACE_MS=1400,DRAG_PX=5,TICK_MS=500,SETTLE_TICKS=3;
  const MOTION={open:{duration:.42,ease:'expo.out'},close:{duration:.28,ease:'power3.out'},idle:{duration:.5,ease:'power2.out'},
   show:{duration:.22,ease:'power2.out',stagger:.026},hide:{duration:.1,ease:'power1.in'},snap:{duration:.4,ease:'expo.out'},slip:{duration:.14,ease:'power1.out'}};
  const IDLE_ALPHA={a:.62,b:.55,c:.5};
  const T={
   zh:{brand:'MeguLit',menuTip:'打开 / 收起 Alt+T 菜单\n按住拖动换位置，拖到游戏窗口外即外置',menuTipOut:'打开 / 收起 Alt+T 菜单\n已外置；拖回游戏画面即收回',translate:'翻译',text:'文字',calibrate:'校准',log:'记录',look:'外观',hide:'收起',
    logTip:'对话记录（L）',hideTip:'收起胶囊，只留一个半透明小把手；原文、注音、译文和点读照常工作。隐藏全部覆盖用 Alt+H',lookTip:'外观与胶囊设置',
    cardTitle:'快捷键',rowMenu:'打开设置菜单',rowHide:'显示 / 隐藏全部覆盖',rowLog:'对话记录',rowText:'文字设置',rowCal:'校准位置',pin:'常驻显示',
    pinOff:'已收起成小把手：指上去变清楚，点一下展开',handleTip:'MeguLit 胶囊已收起：点一下展开',
    setTitle:'快捷胶囊',setHint:'游戏画面上的 MeguLit 入口：点它开关 Alt+T 菜单，按住拖动换位置，不会挡住台词；拖出游戏窗口可外置',setOut:'已外置到游戏窗口外',setOutHint:'位置会记住；游戏最小化时一起隐藏，恢复时回来',dock:'收回游戏窗口',setOn:'常驻显示',setOnHint:'关闭后收成一个半透明小把手，指上去变清楚，点一下展开；原文、注音、译文和点读照常工作',
    setStyle:'样式',styleA:'顶部灵动岛',styleB:'侧边竖条',styleC:'角落圆点',
    descA:'屏幕顶部居中，平时缩成一条细线；指上去展开成快捷区，可左右拖动',descB:'贴在左右边缘，常驻几个快捷键；指上去显示名字，可上下拖动，拖过中线换边',
    descC:'角落半透明小圆点，几乎不挡画面；点开看快捷键和常驻开关，拖到四个角之一',reset:'位置复原'},
   en:{brand:'MeguLit',menuTip:'Open / close the Alt+T menu\nDrag to move; drop it outside the game window to float it there',menuTipOut:'Open / close the Alt+T menu\nFloating; drag it back onto the game to dock it',translate:'Translate',text:'Text',calibrate:'Calibrate',log:'Log',look:'Look',hide:'Tuck',
    logTip:'Dialogue log (L)',hideTip:'Tuck the capsule into a faint handle; text, readings, translation and lookup keep working. Alt+H hides every overlay',lookTip:'Appearance and capsule settings',
    cardTitle:'Shortcuts',rowMenu:'Open the settings menu',rowHide:'Show / hide all overlays',rowLog:'Dialogue log',rowText:'Text settings',rowCal:'Calibrate position',pin:'Always show',
    pinOff:'Tucked into a small handle: point at it to see it, click to open',handleTip:'MeguLit capsule tucked away: click to open',
    setTitle:'Quick capsule',setHint:'MeguLit’s handle on the game screen: click it for the Alt+T menu, drag it to move. It keeps clear of the dialogue; drag it out of the game window to float it',setOut:'Floating outside the game window',setOutHint:'The spot is remembered. It hides while the game is minimised and comes back with it',dock:'Dock in the game',setOn:'Always show',setOnHint:'When off it tucks into a faint handle: point at it to see it, click to open. Text, readings, translation and lookup keep working',
    setStyle:'Style',styleA:'Top island',styleB:'Side rail',styleC:'Corner dot',
    descA:'Top centre, a thin line while unused; point at it and it opens into a quick bar. Drag sideways',descB:'Docked to the left or right edge with the main keys; names show on hover. Drag up or down, across the middle to switch sides',
    descC:'A faint dot in a corner; click for the shortcuts and the always-show switch. Drops into any of the four corners',reset:'Reset position'},
   ja:{brand:'MeguLit',menuTip:'Alt+T メニューを開く / 閉じる\nドラッグで移動。ゲーム画面の外に置くと独立表示',menuTipOut:'Alt+T メニューを開く / 閉じる\n独立表示中。ゲーム画面へ戻すと格納',translate:'翻訳',text:'文字',calibrate:'校正',log:'履歴',look:'外観',hide:'しまう',
    logTip:'バックログ（L）',hideTip:'カプセルを半透明の小さなつまみにしまいます。原文・ルビ・訳文・タップ辞書はそのまま使えます。全体を隠すのは Alt+H',lookTip:'外観とカプセルの設定',
    cardTitle:'ショートカット',rowMenu:'設定メニューを開く',rowHide:'表示 / 非表示を切り替え',rowLog:'バックログ',rowText:'文字の設定',rowCal:'位置の校正',pin:'常に表示',
    pinOff:'小さなつまみにしまいました。ポインタを合わせると表示、クリックで展開',handleTip:'MeguLit カプセル（しまい中）：クリックで展開',
    setTitle:'クイックカプセル',setHint:'ゲーム画面上の MeguLit の入口。クリックで Alt+T メニュー、ドラッグで移動。台詞には重なりません。ゲームウィンドウの外へ出すと独立表示',setOut:'ゲームウィンドウの外に表示中',setOutHint:'位置は記憶されます。ゲームを最小化すると一緒に隠れ、戻すと再表示',dock:'ゲーム画面に戻す',setOn:'常に表示',setOnHint:'オフにすると半透明の小さなつまみになり、ポインタで表示、クリックで展開。原文・ルビ・訳文・タップ辞書はそのまま使えます',
    setStyle:'スタイル',styleA:'トップアイランド',styleB:'サイドレール',styleC:'コーナードット',
    descA:'画面上部中央。普段は細い線、ポインタを合わせるとクイックバーに。左右にドラッグ',descB:'左右の端に寄せて主なキーを常駐。ホバーで名前を表示。上下にドラッグ、中央を越えると反対側へ',
    descC:'隅の半透明の小さな点。クリックでショートカットと常駐スイッチ。四隅のどこかへ吸着',reset:'位置を戻す'}};
  /* 2026-11-27 the words name the default keys (Alt+T, Alt+H, L for the log); shown with the keys chosen in 热键 (web/hotkeys.js) */
  const t=k=>{const v=(T[window.__tomeI18n?.get?.()]||T.zh)[k]??T.zh[k];return typeof v==='string'&&window.MeguHotkeys?window.MeguHotkeys.localize(v.replace(/（L）|\(L\)/,m=>m.replace('L','Alt+L'))):v;};
  /* the key of an action as the capsule writes it: 'Alt T'; '' when the action has no key */
  const keyOf=(action,fallback)=>{const H=window.MeguHotkeys;if(!H)return fallback;return H.get(action)?H.display(action).replace(/\+/g,' '):'';};
  const GLYPH={zh:{translate:'译',text:'字',calibrate:'校',log:'记',hide:'收'},ja:{translate:'訳',text:'字',calibrate:'校',log:'履',hide:'収'},en:{translate:'Tr',text:'Aa',calibrate:'Ca',log:'Lg',hide:'Tk'}};
  const glyph=k=>(GLYPH[window.__tomeI18n?.get?.()]||GLYPH.zh)[k];
  let gsap=window.gsap||null;const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const loadGsap=()=>{if(gsap||loadGsap.p)return;loadGsap.p=1;const s=document.createElement('script');s.src=new URL('../vendor/gsap.min.js',document.baseURI).href;s.async=true;
   s.onload=()=>{gsap=window.gsap||null;};s.onerror=()=>{loadGsap.p=0;};document.head.append(s);};
  const animated=()=>!!gsap&&!reduce.matches;

  let prefs;try{prefs=clean(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{prefs=clean({});}
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch{}};

  const DIAMOND='<svg class="mg-cap-sigil" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .8 11.2 6 6 11.2.8 6Z"/></svg>';
  const css=String.raw`
#mg-cap{--ink:#f0e5da;--ink2:#b8a69a;--ink3:#8f8178;--plate:rgba(22,16,18,.93);--tint:rgba(240,229,218,.09);--tint2:rgba(240,229,218,.16);--red:#c8323c;--red-ink:#ff8a90;--gold:#d6a434;--cap-fast:.15s;--cap-mid:.22s;--cap-ease-out:cubic-bezier(.19,1,.22,1);
 position:fixed;left:0;top:0;width:0;height:0;z-index:2147481500;font:500 12.5px/1 "Microsoft YaHei UI","Yu Gothic UI","Segoe UI",sans-serif;color:var(--ink);
 -webkit-font-smoothing:antialiased;letter-spacing:.04em;font-variant-numeric:tabular-nums;user-select:none;-webkit-user-select:none;-webkit-app-region:no-drag}
#mg-cap[hidden]{display:none!important}
#mg-cap .mg-cap-hit{position:fixed;left:0;top:0;width:0;height:0;background:transparent;pointer-events:auto}
#mg-cap .mg-cap-b{position:fixed;left:0;top:0;pointer-events:none;filter:drop-shadow(0 0 .6px rgba(240,229,218,.34)) drop-shadow(0 3px 7px rgba(0,0,0,.46))}
#mg-cap .mg-cap-s{position:relative;pointer-events:auto;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,0) 58%),var(--plate);touch-action:none}
#mg-cap :is(button,label){font:inherit;color:inherit;letter-spacing:inherit}
#mg-cap button{appearance:none;border:0;margin:0;background:transparent;cursor:var(--mg-cursor-pointer,pointer);position:relative;display:inline-flex;align-items:center;gap:7px;white-space:nowrap;
 transition-property:background-color,color,transform;transition-duration:var(--cap-fast);transition-timing-function:ease-out}
#mg-cap button:not(.mg-cap-brand):hover{background:var(--tint)}
#mg-cap button:active{transform:scale(.96)}
#mg-cap button:focus-visible,#mg-cap input:focus-visible{outline:1px solid rgba(214,164,52,.55);outline-offset:1px}
#mg-cap.mg-cap-dragging button:active{transform:none}
#mg-cap.mg-cap-dragging,#mg-cap.mg-cap-dragging *{cursor:var(--mg-cursor-grabbing,grabbing)!important}
#mg-cap[data-folded] .mg-cap-b{transition:opacity .18s ease-out}
#mg-cap[data-folded]:hover .mg-cap-b{opacity:1!important}
#mg-cap[data-folded] .mg-cap-hit{cursor:var(--mg-cursor-pointer,pointer)}
#mg-cap.mg-cap-outside .mg-cap-s{box-shadow:inset 0 0 0 1px rgba(214,164,52,.55)}
#mg-cap .mg-cap-sigil{width:9px;height:9px;flex:none;fill:var(--red)}
#mg-cap kbd{font:600 10.5px/1 "Cascadia Mono",Consolas,"Microsoft YaHei UI",monospace;letter-spacing:0;padding:3px 5px 2px;border-radius:5px;background:var(--tint);color:var(--ink2);box-shadow:inset 0 -1px 0 rgba(0,0,0,.35)}
#mg-cap [data-active]{color:var(--red-ink)}
#mg-cap :is(.mg-cap-g,[data-style=b] .mg-cap-s)>[data-active]::before{content:'';position:absolute;left:50%;bottom:3px;width:4px;height:4px;margin-left:-2px;background:var(--red);transform:rotate(45deg)}
#mg-cap:not([data-state=open]) [data-show=open]{pointer-events:none}
#mg-cap[data-state=idle] [data-show]:not([data-show~=idle]){pointer-events:none}
/* A: brand centred between two equal groups, so the pill stays put while the island grows to both sides */
#mg-cap[data-style=a] .mg-cap-s{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;height:44px;padding:0 6px;box-sizing:border-box}
#mg-cap[data-style=a] .mg-cap-g{display:flex;gap:2px}
#mg-cap[data-style=a] .mg-cap-g:first-child{justify-content:flex-end;padding-right:4px}
#mg-cap[data-style=a] .mg-cap-g:last-child{justify-content:flex-start;padding-left:4px}
#mg-cap[data-style=a] .mg-cap-g button{height:32px;padding:0 11px;border-radius:16px;color:var(--ink2)}
#mg-cap[data-style=a] .mg-cap-g button:hover{color:var(--ink)}
#mg-cap[data-style=a] :is(.mg-cap-g button,.mg-cap-brand)::after{content:'';position:absolute;inset:-6px 0}
#mg-cap[data-style=a] .mg-cap-brand{height:32px;padding:0 6px 0 13px;border-radius:16px;gap:8px;font-weight:600;letter-spacing:.06em;cursor:var(--mg-cursor-grab,grab)}
#mg-cap[data-style=a] .mg-cap-brand[data-active] kbd{background:rgba(200,50,60,.28);color:var(--ink)}
#mg-cap[data-style=a] .mg-cap-sep{width:1px;height:14px;align-self:center;background:var(--tint2);margin:0 4px}
/* B: one column of 40 px keys; labels sit on the inner side and only show while it is open */
#mg-cap[data-style=b] .mg-cap-s{display:flex;flex-direction:column;gap:2px;padding:4px;border-radius:24px;box-sizing:border-box}
#mg-cap[data-style=b] .mg-cap-s button{height:40px;padding:0;border-radius:20px;display:grid;grid-template-columns:40px auto;align-items:center;justify-items:start;gap:0;color:var(--ink2)}
#mg-cap[data-style=b][data-side=right] .mg-cap-s button{grid-template-columns:auto 40px;justify-items:end}
#mg-cap[data-style=b] .mg-cap-s button:hover{color:var(--ink)}
#mg-cap[data-style=b] .mg-cap-k{width:40px;height:40px;display:grid;place-items:center;font-size:14px;font-weight:600;letter-spacing:0}
#mg-cap[data-style=b] .mg-cap-l{padding:0 14px 0 2px;font-size:12.5px}
#mg-cap[data-style=b][data-side=right] .mg-cap-l{order:-1;padding:0 2px 0 14px}
#mg-cap[data-style=b] .mg-cap-l kbd{margin-left:6px}
#mg-cap[data-style=b] .mg-cap-brand{cursor:var(--mg-cursor-grab,grab)}
#mg-cap[data-style=b] .mg-cap-brand .mg-cap-sigil{width:12px;height:12px}
#mg-cap[data-style=b] [data-active]::before{left:auto;right:6px;bottom:auto;top:50%;margin:-2px 0 0}
#mg-cap[data-style=b][data-side=right] [data-active]::before{right:auto;left:6px}
#mg-cap[data-style=b] .mg-cap-sep{height:1px;margin:2px 10px;background:var(--tint2)}
/* C: a 32 px dot that unfolds into a card from its own corner */
#mg-cap[data-style=c] .mg-cap-s{width:264px;border-radius:16px;box-sizing:border-box;padding:6px}
#mg-cap[data-style=c] .mg-cap-dot{position:absolute;width:32px;height:32px;display:grid;place-items:center;z-index:2;border-radius:16px;cursor:var(--mg-cursor-grab,grab)}
#mg-cap[data-style=c] .mg-cap-dot .mg-cap-sigil{width:11px;height:11px}
#mg-cap[data-style=c][data-v=t] .mg-cap-dot{top:0}#mg-cap[data-style=c][data-v=b] .mg-cap-dot{bottom:0}
#mg-cap[data-style=c][data-h=l] .mg-cap-dot{left:0}#mg-cap[data-style=c][data-h=r] .mg-cap-dot{right:0}
#mg-cap[data-style=c] .mg-cap-card{display:flex;flex-direction:column;gap:1px}
#mg-cap[data-style=c][data-v=b] .mg-cap-card{flex-direction:column-reverse}
#mg-cap[data-style=c] .mg-cap-head{height:32px;margin:-6px 0 0;display:flex;align-items:center;gap:8px;font-weight:600;letter-spacing:.06em;padding:0 8px}
#mg-cap[data-style=c][data-v=b] .mg-cap-head{margin:0 0 -6px}
#mg-cap[data-style=c][data-h=l] .mg-cap-head{padding-left:32px}#mg-cap[data-style=c][data-h=r] .mg-cap-head{padding-right:32px;flex-direction:row-reverse}
#mg-cap[data-style=c] .mg-cap-head small{font:inherit;font-weight:400;color:var(--ink3);letter-spacing:.04em}
#mg-cap[data-style=c] .mg-cap-card button{height:38px;width:100%;padding:0 10px;border-radius:10px;justify-content:flex-start;gap:10px;color:var(--ink)}
#mg-cap[data-style=c] .mg-cap-card button :is(kbd,.mg-cap-go){width:48px;flex:none;text-align:center;box-sizing:border-box}
#mg-cap[data-style=c] .mg-cap-card button .mg-cap-go{color:var(--ink3);font-size:15px;line-height:1}
#mg-cap[data-style=c] .mg-cap-pin{height:38px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;margin-top:3px;border-top:1px solid var(--tint);color:var(--ink2);cursor:var(--mg-cursor-pointer,pointer)}
#mg-cap[data-style=c][data-v=b] .mg-cap-pin{margin:0 0 3px;border-top:0;border-bottom:1px solid var(--tint)}
#mg-cap[data-style=c] .mg-cap-note{padding:2px 10px 6px;color:var(--red-ink);font-size:11.5px;line-height:1.5;text-wrap:pretty}
#mg-cap[data-style=c] .mg-cap-note:empty{display:none}
#mg-cap .mg-cap-switch,.mg-cap-set .mg-cap-switch{appearance:none;-webkit-appearance:none;flex:none;width:34px;height:20px;margin:0;border-radius:10px;background:rgba(240,229,218,.18);position:relative;
 cursor:var(--mg-cursor-pointer,pointer);transition:background-color var(--cap-mid,.22s) ease-out}
:is(#mg-cap,.mg-cap-set) .mg-cap-switch::after{content:'';position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:7px;background:#f0e5da;transition:transform var(--cap-mid,.22s) var(--cap-ease-out,ease-out)}
:is(#mg-cap,.mg-cap-set) .mg-cap-switch:checked{background:#c8323c}
:is(#mg-cap,.mg-cap-set) .mg-cap-switch:checked::after{transform:translateX(14px)}
.mg-cap-set{--cap-mid:.22s;--cap-ease-out:cubic-bezier(.19,1,.22,1);padding:4px 0 14px;margin-bottom:12px;border-bottom:1px solid color-mix(in srgb,var(--theme-text,#eee) 9%,transparent)}
.mg-cap-set h4{margin:0 0 4px;font-size:15px;text-wrap:balance}
.mg-cap-set>small{display:block;margin:0 0 10px;color:var(--tome-picture-muted,#b5b9c9);line-height:1.6;text-wrap:pretty}
.mg-cap-set .mg-cap-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:40px}
.mg-cap-set .mg-cap-row>span{display:flex;flex-direction:column;gap:3px}
.mg-cap-set .mg-cap-row>span>small{color:var(--tome-picture-muted,#b5b9c9);font-size:12px}
.mg-cap-set .mg-subtabs{--mg-seg-cols:3}
.mg-cap-set .mg-subtabs>button{display:flex!important;flex-direction:column;align-items:center;gap:6px;padding:9px 4px 8px!important}
.mg-cap-set .mg-subtabs>button svg{width:42px;height:26px;flex:none}
.mg-cap-set .mg-subtabs>button svg .scr{fill:none;stroke:currentColor;stroke-opacity:.45}
.mg-cap-set .mg-subtabs>button svg .cap{fill:currentColor}
.mg-cap-set .mg-subtabs>button svg .txt{fill:currentColor;opacity:.25}
.mg-cap-set .mg-subtabs>button[aria-selected=true] svg .cap{fill:var(--menu-accent,#e0495a)}
.mg-cap-set .mg-cap-desc{display:block;min-height:3.2em;margin:2px 0 6px;color:var(--tome-picture-muted,#b5b9c9);line-height:1.6;text-wrap:pretty}
.mg-cap-set .mg-cap-reset{margin:0!important;padding:5px 12px!important;height:30px;border-radius:6px;cursor:pointer}
@media (prefers-reduced-motion:reduce){#mg-cap button,:is(#mg-cap,.mg-cap-set) .mg-cap-switch,:is(#mg-cap,.mg-cap-set) .mg-cap-switch::after{transition:none}#mg-cap button:active{transform:none}}
`;
  const style=document.createElement('style');style.id='megulit-capsule-style';style.textContent=css;document.head.append(style);
  /* geometry lives in a rule of its own: moving the capsule edits the CSSOM, not an attribute, so the page's mutation observers
     (hit regions, reader refresh) are not woken on every frame of a drag */
  const dyn=document.createElement('style');dyn.id='megulit-capsule-geometry';dyn.textContent='#mg-cap .mg-cap-b{}#mg-cap .mg-cap-hit{}';document.head.append(dyn);
  const [bodyRule,hitRule]=dyn.sheet.cssRules;
  const setBox=(rule,r)=>{rule.style.setProperty('left',Math.round(r.x)+'px');rule.style.setProperty('top',Math.round(r.y)+'px');if('w' in r){rule.style.setProperty('width',Math.round(r.w)+'px');rule.style.setProperty('height',Math.round(r.h)+'px');}};

  const rootEl=document.createElement('div');rootEl.id='mg-cap';rootEl.className='mg-cap';rootEl.hidden=true;rootEl.dataset.noI18n='';rootEl.setAttribute('role','toolbar');
  const hit=document.createElement('div');hit.className='mg-cap-hit';hit.setAttribute('aria-hidden','true');
  const wrap=document.createElement('div');wrap.className='mg-cap-b';
  const surface=document.createElement('div');surface.className='mg-cap-s';wrap.append(surface);rootEl.append(hit,wrap);document.body.append(rootEl);

  const cur={state:'',style:'',g:null,pos:null,place:null,want:null,settle:0,visible:false,hovered:false,tucked:false};
  let tl=null,timers={},drag=null,suppressClick=false,note='';
  const timer=(k,ms,fn)=>{clearTimeout(timers[k]);timers[k]=ms===null?0:setTimeout(()=>{timers[k]=0;fn();},ms);};
  /* the game's client area inside the overlay (the overlay covers the whole screen, a windowed game does not); the whole overlay when the host has not said yet */
  function view(){
   const W=window.innerWidth,H=window.innerHeight,i=bridge().galLayoutInfo?.(),dpr=window.devicePixelRatio||1,w=(Number(i?.clientWidth)||0)/dpr,h=(Number(i?.clientHeight)||0)/dpr;
   if(!(w>=320&&h>=240))return {x:0,y:0,w:W,h:H};
   const x=clamp((Number(i.clientX)||0)/dpr,0,W-1),y=clamp((Number(i.clientY)||0)/dpr,0,H-1);return {x,y,w:Math.min(w,W-x),h:Math.min(h,H-y)};
  }
  const openDialog=()=>document.querySelector('.tomoyo-cn-dialog[open]:not([data-leaving])');
  const send=m=>{try{window.__tomoyoTranslateRequest(JSON.stringify(m));}catch{}};

  const button=(act,html,title)=>{const b=document.createElement('button');b.type='button';b.dataset.act=act;b.innerHTML=html;if(title)b.dataset.mgTip=title;return b;};
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
  function build(){
   const s=prefs.style;cur.style=s;rootEl.dataset.style=s;surface.replaceChildren();
   rootEl.dataset.side=prefs.b.side;rootEl.dataset.v=prefs.c.corner[0];rootEl.dataset.h=prefs.c.corner[1];
   if(s==='a'){
    const left=document.createElement('div');left.className='mg-cap-g';left.dataset.show='open';
    const right=left.cloneNode();
    left.append(button('tab:translate',esc(t('translate'))),button('tab:text',esc(t('text'))),button('tab:calibrate',esc(t('calibrate'))));
    right.append(button('log',esc(t('log')),t('logTip')),button('tab:misc',esc(t('look')),t('lookTip')),Object.assign(document.createElement('i'),{className:'mg-cap-sep'}),button('fold',esc(t('hide')),t('hideTip')));
    const brand=button('menu',DIAMOND+'<span>'+esc(t('brand'))+'</span>'+(keyOf('menu','Alt T')?'<kbd>'+esc(keyOf('menu','Alt T'))+'</kbd>':''),t('menuTip'));brand.classList.add('mg-cap-brand');brand.dataset.show='rest open';
    surface.append(left,brand,right);
   }else if(s==='b'){
    const key=(act,glyph,label,k,title,show)=>{const b=button(act,'<span class="mg-cap-k">'+glyph+'</span><span class="mg-cap-l" data-show="open">'+esc(label)+(k?'<kbd>'+esc(k)+'</kbd>':'')+'</span>',title);b.dataset.show='rest open';return b;};
    const brand=key('menu',DIAMOND,t('brand'),keyOf('menu','Alt T'),t('menuTip'));brand.classList.add('mg-cap-brand');
    const sep=()=>{const i=document.createElement('i');i.className='mg-cap-sep';i.dataset.show='rest open';return i;};
    surface.append(brand,sep(),key('tab:translate',esc(glyph('translate')),t('translate')),key('tab:text',esc(glyph('text')),t('text')),key('tab:calibrate',esc(glyph('calibrate')),t('calibrate')),sep(),
     key('log',esc(glyph('log')),t('log'),keyOf('log','L'),t('logTip')),key('fold',esc(glyph('hide')),t('hide'),'',t('hideTip')));
   }else{
    const dot=button('card',DIAMOND,t('menuTip'));dot.className='mg-cap-dot';dot.dataset.show='idle rest open';dot.setAttribute('aria-expanded','false');
    const card=document.createElement('div');card.className='mg-cap-card';card.dataset.show='open';
    const head=document.createElement('div');head.className='mg-cap-head';head.innerHTML='<span>'+esc(t('brand'))+'</span><small>'+esc(t('cardTitle'))+'</small>';
    const row=(act,key,label,go)=>{/* the default key is the marker: menu / cover / log show the key the user set (web/hotkeys.js) */if(key&&(act==='menu'||act==='cover'||act==='log'))key=keyOf(act,key).replace(/ /g,'+');return button(act,(go?'<span class="mg-cap-go">›</span>':key?'<kbd>'+esc(key)+'</kbd>':'')+'<span>'+esc(label)+'</span>');};
    const pin=document.createElement('label');pin.className='mg-cap-pin';pin.innerHTML='<span>'+esc(t('pin'))+'</span>';
    const sw=document.createElement('input');sw.type='checkbox';sw.className='mg-cap-switch';sw.setAttribute('role','switch');sw.checked=prefs.on;sw.dataset.capPin='';pin.append(sw);
    const msg=document.createElement('div');msg.className='mg-cap-note';msg.setAttribute('role','status');msg.textContent=note;
    card.append(head,row('menu','Alt+T',t('rowMenu')),row('cover','Alt+H',t('rowHide')),row('log','L',t('rowLog')),row('tab:text','',t('rowText'),true),row('tab:calibrate','',t('rowCal'),true),pin,msg);
    surface.append(dot,card);
   }
   cur.g=null;cur.state='';paintTips();
  }
  /* the handle's tip says how to float or dock it; tips open toward the game, away from the edge the capsule sits on */
  function paintTips(){
   const tip=t(prefs.out.on?'menuTipOut':'menuTip');for(const b of surface.querySelectorAll('[data-act=menu].mg-cap-brand,[data-act=card]'))b.dataset.mgTip=tip;
   const s=cur.style,side=s==='a'?'bottom':s==='b'?(rootEl.dataset.side==='right'?'left':'right'):(rootEl.dataset.h==='r'?'left':'right');
   rootEl.dataset.mgTipSide=side;rootEl.toggleAttribute('data-out',prefs.out.on);
  }
  /* the open shape is the surface itself; rest and idle are rectangles inside it */
  function measure(){
   const s=cur.style,w=surface.offsetWidth,h=surface.offsetHeight;if(!w||!h)return null;const g={w,h,full:{x:0,y:0,w,h,r:s==='a'?22:s==='b'?24:16}};
   if(s==='a'){const b=surface.querySelector('.mg-cap-brand');g.rest={x:b.offsetLeft,y:b.offsetTop,w:b.offsetWidth,h:b.offsetHeight,r:b.offsetHeight/2};
    g.idle={x:Math.round((w-40)/2),y:2,w:40,h:5,r:2.5};g.anchor=g.rest;g.hitIdle=g.rest;}
   else if(s==='b'){const right=rootEl.dataset.side==='right',rw=48;g.rest={x:right?w-rw:0,y:0,w:rw,h,r:24};
    g.idle={x:right?w-6:1,y:Math.round((h-56)/2),w:5,h:56,r:2.5};g.anchor=g.rest;g.hitIdle={x:right?w-16:0,y:g.idle.y-4,w:16,h:64};}
   else{const right=rootEl.dataset.h==='r',bottom=rootEl.dataset.v==='b';g.rest={x:right?w-32:0,y:bottom?h-32:0,w:32,h:32,r:16};
    g.idle={x:g.rest.x+6,y:g.rest.y+6,w:20,h:20,r:10};g.anchor=g.rest;g.hitIdle=g.rest;}
   return g;
  }
  const geom=()=>cur.g||(cur.g=measure());
  const shape=(g,state)=>state==='open'?g.full:state==='idle'?g.idle:g.rest;
  const vp=(r)=>({x:cur.pos.x+r.x,y:cur.pos.y+r.y,w:r.w,h:r.h});
  const grow=(r,p=PAD)=>({x:r.x-p,y:r.y-p,w:r.w+2*p,h:r.h+2*p});
  const union=(a,b)=>{const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);return {x,y,w:Math.max(a.x+a.w,b.x+b.w)-x,h:Math.max(a.y+a.h,b.y+b.h)-y};};
  function setHit(r){setBox(hitRule,r);window.__tomoyoHitRegionsRefresh?.();}
  const hitFor=(g,state)=>grow(vp(state==='idle'?g.hitIdle:shape(g,state)));

  const OBST='.sentence-window .sentence-text,.tomoyo-cn-output,.tome-page-lines>div,.megulit-dialogue-band,.tomoyo-selection-card,.tome-backlog[data-open],.megulit-choice,.megulit-choice-cn,#megulit-place-extras span,.tome-box-deco,.tomoyo-learning-notice,.tome-first-run';
  function obstacles(){
   const out=[],range=document.createRange();
   for(const n of document.querySelectorAll(OBST)){
    if(rootEl.contains(n))continue;const st=window.getComputedStyle(n);if(st.display==='none'||st.visibility==='hidden'||Number(st.opacity)===0||n.closest('[hidden]'))continue;
    let r;if(n.matches('.sentence-text,.tomoyo-cn-output,.tome-page-lines>div')){if(!n.textContent.trim())continue;range.selectNodeContents(n);r=range.getBoundingClientRect();}else r=n.getBoundingClientRect();
    if(r.width>2&&r.height>2)out.push({x:r.left-8,y:r.top-8,w:r.width+16,h:r.height+16});
   }
   const d=openDialog();if(d)out.push({x:d.offsetLeft-8,y:d.offsetTop-8,w:d.offsetWidth+16,h:d.offsetHeight+16});
   return out;
  }
  /* where the resting shape goes now; moves back to the chosen spot only after it stayed free for SETTLE_TICKS checks */
  const screen=()=>({x:0,y:0,w:window.innerWidth,h:window.innerHeight});
  function target(g){
   if(prefs.out.on){
    const sc=screen(),r=g.anchor,p=placeOut({x:prefs.out.x,y:prefs.out.y},{w:r.w,h:r.h},sc,{w:g.w,h:g.h,ax:r.x,ay:r.y}),cx=p.x+r.w/2,cy=p.y+r.h/2;
    return {...p,side:sideOf(cx,sc),corner:snapCorner(cx,cy,sc),obs:[]};
   }
   const f=view(),v={w:f.w,h:f.h},obs=obstacles(),local=obs.map(o=>({...o,x:o.x-f.x,y:o.y-f.y})),r=g.anchor;
   const p=cur.style==='a'?placeA(prefs.a.x*v.w,{w:r.w,h:r.h,y:TOP+r.y},v,local):cur.style==='b'?placeB(prefs.b.side,prefs.b.y*v.h,{w:r.w,h:r.h},v,local):placeC(prefs.c.corner,{w:r.w,h:r.h},v,local);
   let px=p.x+f.x;
   /* A grows sideways into the quick bar: the open shape, not only the resting pill, has to stay inside the game's area */
   if(cur.style==='a'&&g.w<=f.w-2*EDGE)px=clamp(px-g.anchor.x,f.x+EDGE,f.x+f.w-EDGE-g.w)+g.anchor.x;
   return {...p,x:px,y:p.y+f.y,obs};
  }
  function applyOrientation(p){
   let changed=false;
   if(cur.style==='b'&&rootEl.dataset.side!==p.side){rootEl.dataset.side=p.side;changed=true;}
   if(cur.style==='c'){const v=p.corner[0],h=p.corner[1];if(rootEl.dataset.v!==v||rootEl.dataset.h!==h){rootEl.dataset.v=v;rootEl.dataset.h=h;changed=true;}}
   if(changed){cur.g=null;paintTips();}return changed;
  }
  function layout(force){
   if(!cur.visible||drag)return;let g=geom();if(!g)return;
   let p=target(g);if(applyOrientation(p)){g=geom();p=target(g);}
   const pos={x:p.x-g.anchor.x,y:p.y-g.anchor.y},here=cur.pos;
   cur.tucked=!p.fits;
   const moved=!here||Math.abs(here.x-pos.x)>.5||Math.abs(here.y-pos.y)>.5;
   if(!moved){cur.settle=0;return;}
   if(here&&!force&&!p.out){const now=vp(g.anchor);if(!overlaps(now,p.obs)&&!(cur.place&&cur.place.fits===false)){if(++cur.settle<SETTLE_TICKS)return;}}
   cur.settle=0;cur.place=p;move(pos,!!here&&!force);
  }
  function move(pos,slip){
   const apply=()=>{cur.pos=pos;setBox(bodyRule,pos);if(cur.g&&cur.state)setHit(hitFor(cur.g,cur.state));};
   if(!slip||!animated()||cur.state==='idle'){apply();if(cur.tucked&&cur.state&&cur.state!=='idle'&&!cur.hovered&&!menuOpen())go('idle');return;}
   gsap.to(wrap,{opacity:0,duration:MOTION.slip.duration,ease:MOTION.slip.ease,onComplete:()=>{apply();gsap.to(wrap,{opacity:alpha(cur.state),duration:MOTION.slip.duration*1.6,ease:MOTION.slip.ease});}});
  }
  const alpha=state=>state==='idle'?IDLE_ALPHA[cur.style]*(folded()?.6:1):1;
  const shown=(el,state)=>(el.dataset.show||'').split(' ').includes(state);
  /* the clip is tweened through plain numbers: a computed clip-path folds equal sides together, which string tweening cannot follow */
  const clipNow={t:0,r:0,b:0,l:0,rad:0};
  const clipTo=(g,r)=>({t:r.y,r:g.w-r.x-r.w,b:g.h-r.y-r.h,l:r.x,rad:r.r});
  const paintClip=()=>{surface.style.clipPath='inset('+clipNow.t+'px '+clipNow.r+'px '+clipNow.b+'px '+clipNow.l+'px round '+clipNow.rad+'px)';};

  function go(next,opt={}){
   const g=geom();if(!g||!cur.pos)return;
   if(next===cur.state&&!opt.force)return;
   const prev=cur.state;cur.state=next;rootEl.dataset.state=next;
   const before=prev?hitFor(g,prev):null,after=hitFor(g,next);
   setHit(before?union(before,after):after);
   const items=[...surface.querySelectorAll('[data-show]')],on=items.filter(n=>shown(n,next)),off=items.filter(n=>!shown(n,next));
   const dot=surface.querySelector('.mg-cap-dot');if(dot)dot.setAttribute('aria-expanded',String(next==='open'));
   if(tl){tl.kill();tl=null;}
   const finish=()=>{tl=null;if(cur.state===next)setHit(after);};
   if(!animated()||opt.instant||!prev){
    Object.assign(clipNow,clipTo(g,shape(g,next)));paintClip();wrap.style.opacity=String(alpha(next));for(const n of on)n.style.opacity='1';for(const n of off)n.style.opacity='0';
    if(gsap)gsap.set([surface,wrap,...items],{clearProps:'transform'});finish();return;
   }
   const m=next==='open'?MOTION.open:next==='idle'?MOTION.idle:MOTION.close;
   const fresh=on.filter(n=>!prev||!shown(n,prev)),axis=cur.style==='b'?'x':'y',from=cur.style==='b'?(rootEl.dataset.side==='right'?6:-6):cur.style==='c'?(rootEl.dataset.v==='b'?4:-4):-3;
   tl=gsap.timeline({onComplete:()=>{finish();}});
   tl.to(clipNow,{...clipTo(g,shape(g,next)),duration:m.duration,ease:m.ease,onUpdate:paintClip},0)
    .to(wrap,{opacity:alpha(next),duration:m.duration*.7,ease:'power1.out'},0)
    .to(off,{opacity:0,[axis]:-from/2,duration:MOTION.hide.duration,ease:MOTION.hide.ease},0);
   if(fresh.length)tl.fromTo(fresh,{opacity:0,[axis]:from},{opacity:1,[axis]:0,duration:MOTION.show.duration,ease:MOTION.show.ease,stagger:next==='open'?MOTION.show.stagger:0,clearProps:'transform'},next==='open'?.07:.1);
   const stay=on.filter(n=>!fresh.includes(n));if(stay.length)tl.to(stay,{opacity:1,duration:MOTION.show.duration},0);
  }
  /* what the capsule should show when nobody is pointing at it */
  const menuOpen=()=>!!openDialog();
  const folded=()=>shownAs(prefs,{menu:menuOpen(),held:!!cur.held||!!note})==='handle';
  function paintFold(){const on=folded();if(rootEl.hasAttribute('data-folded')!==on){rootEl.toggleAttribute('data-folded',on);if(on)hit.dataset.mgTip=t('handleTip');else delete hit.dataset.mgTip;}}
  function unfold(){setPrefs({on:true});if(cur.visible){timer('idle',null);go('rest');settle();}}
  function settle(){
   if(!cur.visible||drag)return;
   paintFold();if(folded()){timer('idle',null);timer('intent',null);go('idle');return;}
   /* pointed at while it comes back from the handle (常驻 switched on, menu opened over it): show it, do not stay a line */
   if(cur.hovered){if(cur.state==='idle'||cur.state==='')go(cur.style==='c'?'rest':'open');if(cur.style==='c'&&cur.state==='open')timer('leave',null);return;}
   /* 2026-11-27 the 新手引导 holds the capsule open while it explains it (onboarding.js), so it does not fade to idle under the light */
   if(cur.held){go(cur.held);timer('idle',null);return;}
   if(menuOpen()&&cur.style!=='c'){go(fitsOpen()?'open':'rest');timer('idle',null);return;}
   if(cur.state==='open'||cur.state===''){go('rest');}
   if(cur.tucked){go('idle');return;}
   if(cur.state!=='idle')timer('idle',cur.firstShow?FIRST_IDLE_MS:IDLE_MS,()=>{cur.firstShow=false;if(!cur.hovered&&!drag&&!(menuOpen()&&cur.style!=='c'))go('idle');});
  }
  function fitsOpen(){const g=geom();if(!g||!cur.pos)return false;const d=openDialog();if(!d)return true;
   const box={x:d.offsetLeft,y:d.offsetTop,w:d.offsetWidth,h:d.offsetHeight};return !overlaps(vp(g.full),[box]);}

  function syncActive(){
   const d=openDialog(),tab=d?.dataset.menuTab||'',log=!!document.querySelector('.tome-backlog[data-open]');
   for(const b of surface.querySelectorAll('[data-act]')){const a=b.dataset.act,on=a==='menu'?!!d:a==='log'?log:a.startsWith('tab:')?!!d&&tab===a.slice(4):false;
    if(on!==b.hasAttribute('data-active')){b.toggleAttribute('data-active',on);if(a!=='card')b.setAttribute('aria-pressed',String(on));}}
  }
  function toggleMenu(){const b=bridge();if(b.toggleGalMenu)b.toggleGalMenu();else if(b.openSettings)b.openSettings();}
  function act(name){
   const b=bridge();
   if(name==='menu'){toggleMenu();return;}
   if(name==='log'){b.toggleBacklog?.();return;}
   if(name==='fold'||name==='cover'){const r=press(prefs,name);if(r.send)send(r.send);if(name==='fold')setPrefs({on:false});return;}
   if(name==='card'){if(cur.state==='open'){go('rest');settle();}else{timer('idle',null);go('open');}return;}
   if(name.startsWith('tab:')){const key=name.slice(4),d=openDialog();
    if(d){if(d.dataset.menuTab===key){toggleMenu();return;}const tab=d.querySelector('.tomoyo-menu-tabs [data-menu-key="'+key+'"]');if(tab){tab.click();return;}}
    try{localStorage.setItem('tomoyo-menu-tab',key);}catch{}toggleMenu();}
  }
  surface.addEventListener('click',e=>{
   if(suppressClick){suppressClick=false;e.preventDefault();e.stopPropagation();return;}
   if(folded()){e.stopPropagation();unfold();return;}
   const btn=e.target.closest('[data-act]');
   if(!btn){if(e.target.closest('.mg-cap-pin,.mg-cap-head'))return;if(cur.style==='a')act('menu');return;}
   e.stopPropagation();act(btn.dataset.act);
   if(cur.style==='c'&&btn.dataset.act!=='card'){go('rest');settle();}
   requestAnimationFrame(syncActive);
  });
  hit.addEventListener('click',()=>{if(suppressClick){suppressClick=false;return;}if(folded()){unfold();return;}if(cur.style==='a')act('menu');else if(cur.style==='b')go('open');else act('card');requestAnimationFrame(syncActive);});
  surface.addEventListener('change',e=>{if(e.target.matches('[data-cap-pin]'))setPrefs({on:e.target.checked},{from:'card'});});

  /* hover: A and B open after a short intent delay; C only brightens and opens on click */
  rootEl.addEventListener('pointerover',e=>{if(rootEl.contains(e.relatedTarget)||drag)return;cur.hovered=true;cur.firstShow=false;timer('idle',null);timer('leave',null);
   if(folded())return;
   if(cur.style==='c'){if(cur.state==='idle')go('rest');return;}
   if(cur.state!=='open')timer('intent',cur.state==='idle'?INTENT_MS+60:INTENT_MS,()=>{if(cur.hovered&&!drag)go('open');});});
  rootEl.addEventListener('pointerout',e=>{if(rootEl.contains(e.relatedTarget)||drag)return;cur.hovered=false;timer('intent',null);if(folded())return;
   timer('leave',cur.style==='c'&&cur.state==='open'?CARD_GRACE_MS:GRACE_MS,()=>{if(!cur.hovered)settle();});});

  /* drag: A along the top, B anywhere then onto the nearer edge, C anywhere then into the nearest corner */
  surface.addEventListener('pointerdown',e=>{
   if(e.button!==0||!cur.pos||e.target.closest('input,.mg-cap-pin'))return;
   if(cur.style==='c'&&!e.target.closest('.mg-cap-dot'))return;
   drag={x0:e.clientX,y0:e.clientY,pos:{...cur.pos},moved:false,id:e.pointerId};
   window.addEventListener('pointermove',dragMove,true);window.addEventListener('pointerup',dragEnd,true);window.addEventListener('pointercancel',dragEnd,true);
  });
  let dragFrame=0,dragLast=null;
  function dragMove(e){
   if(!drag)return;const dx=e.clientX-drag.x0,dy=e.clientY-drag.y0;
   if(!drag.moved){if(Math.hypot(dx,dy)<DRAG_PX)return;drag.moved=true;startDrag();}
   dragLast={dx,dy};if(!dragFrame)dragFrame=requestAnimationFrame(paintDrag);
  }
  function startDrag(){
   timer('intent',null);timer('idle',null);timer('leave',null);
   if(cur.style!=='a'&&cur.state!=='rest')go('rest',{instant:cur.style==='c'});
   rootEl.classList.add('mg-cap-dragging');window.__megulitTip?.hide?.();
   setHit({x:0,y:0,w:window.innerWidth,h:window.innerHeight});
  }
  function paintDrag(){
   dragFrame=0;if(!drag||!dragLast)return;const g=geom(),v=view(),a=g.anchor;
   const W=window.innerWidth,H=window.innerHeight;
   let x=clamp(drag.pos.x+dragLast.dx,EDGE-a.x,W-EDGE-a.x-a.w),y=clamp(drag.pos.y+dragLast.dy,EDGE-a.y,H-EDGE-a.y-a.h);
   const out=outside({x:x+a.x,y:y+a.y,w:a.w,h:a.h},v);
   if(!out&&cur.style==='a'){y=v.y+TOP;if(g.w<=v.w-2*EDGE)x=clamp(x,v.x+EDGE,v.x+v.w-EDGE-g.w);}
   rootEl.classList.toggle('mg-cap-outside',out);
   cur.pos={x,y};setBox(bodyRule,cur.pos);
  }
  function dragEnd(){
   window.removeEventListener('pointermove',dragMove,true);window.removeEventListener('pointerup',dragEnd,true);window.removeEventListener('pointercancel',dragEnd,true);
   const d=drag;if(!d||!d.moved){drag=null;return;}
   cancelAnimationFrame(dragFrame);paintDrag();drag=null;
   suppressClick=true;setTimeout(()=>{suppressClick=false;},0);
   rootEl.classList.remove('mg-cap-dragging','mg-cap-outside');
   const g=geom(),v=view(),r=vp(g.anchor),cx=r.x+r.w/2-v.x,cy=r.y+r.h/2-v.y,drop=dropAt(r,v,screen());
   if(drop.out)prefs={...prefs,out:{on:true,x:drop.x,y:drop.y}};
   else{if(prefs.out.on)prefs={...prefs,out:{...prefs.out,on:false}};
   if(cur.style==='a')prefs={...prefs,a:{x:clamp(cx/v.w,0,1)}};
   else if(cur.style==='b')prefs={...prefs,b:{side:sideOf(cx,v),y:clamp(cy/v.h,0,1)}};
   else prefs={...prefs,c:{corner:snapCorner(cx,cy,v)}};}
   save();paintTips();paintSettings();
   const fromAnchor=r;
   cur.pos=null;cur.place=null;layout(true);if(cur.state)go(cur.state,{force:true,instant:true});
   if(animated()&&cur.pos){const g2=geom(),to=vp(g2.anchor);gsap.fromTo(wrap,{x:fromAnchor.x-to.x,y:fromAnchor.y-to.y},{x:0,y:0,duration:MOTION.snap.duration,ease:MOTION.snap.ease,clearProps:'transform',onComplete:()=>setHit(hitFor(geom(),cur.state))});}
   if(cur.g&&cur.state)setHit(animated()&&cur.pos?union(hitFor(cur.g,cur.state),grow(fromAnchor)):hitFor(cur.g,cur.state));
   if(cur.style!=='a'||!cur.hovered)settle();
  }

  /* visibility: bound to a game; the capsule, or the handle it is tucked into (never nothing, so it can always be found again) */
  function wanted(){const body=document.body;return body.classList.contains('tomoyo-ui-translation')&&body.classList.contains('tomoyo-gal-bound');}
  let tick=0;
  function refresh(){
   const want=wanted();
   if(want!==cur.visible){
    cur.visible=want;rootEl.hidden=!want;
    if(want){loadGsap();if(cur.style!==prefs.style)build();cur.g=null;cur.pos=null;cur.state='';cur.firstShow=true;layout(true);go('rest',{instant:true});settle();if(!tick)tick=setInterval(()=>{layout(false);syncActive();},TICK_MS);}
    else{clearInterval(tick);tick=0;for(const k of Object.keys(timers))timer(k,null);if(tl){tl.kill();tl=null;}cur.state='';cur.pos=null;window.__tomoyoHitRegionsRefresh?.();}
   }
   if(!cur.visible)return;
   syncActive();layout(false);settle();
  }
  /* back into the game at the style's own spot; the floating spot stays remembered for the next time it is dragged out */
  function dock(){if(prefs.out.on)setPrefs({out:{...prefs.out,on:false}});}
  function setPrefs(patch,opt={}){
   const was=prefs;prefs=clean({...prefs,...patch});save();
   if(!was.on&&prefs.on){const r=press(was,'unfold',{coverHidden:document.body.classList.contains('tomoyo-cover-hidden')});if(r.send)send(r.send);}
   if(was.out.on!==prefs.out.on||was.out.x!==prefs.out.x||was.out.y!==prefs.out.y){paintTips();if(!opt.rebuild&&prefs.style===cur.style)opt={...opt,relayout:true};}
   if(opt.from==='card'&&was.on&&!prefs.on){note=t('pinOff');const msg=surface.querySelector('.mg-cap-note');if(msg)msg.textContent=note;timer('note',2200,()=>{note='';const m=surface.querySelector('.mg-cap-note');if(m)m.textContent='';refresh();});}
   if(prefs.style!==cur.style||opt.rebuild){if(tl){tl.kill();tl=null;}build();cur.pos=null;cur.place=null;if(cur.visible){layout(true);go('rest',{instant:true});cur.firstShow=true;settle();}}
   else if(opt.relayout){cur.pos=null;cur.place=null;layout(true);if(cur.state)go(cur.state,{force:true,instant:true});}
   const pin=surface.querySelector('[data-cap-pin]');if(pin)pin.checked=prefs.on;
   refresh();paintSettings();
  }

  /* Alt+T → 外观: the switch, the three styles with a small picture each, and a reset of the current style's position */
  const PIC={a:'<svg viewBox="0 0 42 26" aria-hidden="true"><rect class="scr" x=".5" y=".5" width="41" height="25" rx="3"/><rect class="txt" x="6" y="17" width="30" height="5" rx="1"/><rect class="cap" x="15" y="3" width="12" height="3.4" rx="1.7"/></svg>',
   b:'<svg viewBox="0 0 42 26" aria-hidden="true"><rect class="scr" x=".5" y=".5" width="41" height="25" rx="3"/><rect class="txt" x="6" y="17" width="26" height="5" rx="1"/><rect class="cap" x="35" y="5" width="3.6" height="12" rx="1.8"/></svg>',
   c:'<svg viewBox="0 0 42 26" aria-hidden="true"><rect class="scr" x=".5" y=".5" width="41" height="25" rx="3"/><rect class="txt" x="6" y="17" width="30" height="5" rx="1"/><circle class="cap" cx="5.5" cy="5.5" r="2.4"/></svg>'};
  function buildSettings(panel){
   const box=document.createElement('section');box.className='mg-cap-set';box.dataset.noI18n='';
   box.innerHTML='<h4 data-cap-copy="setTitle"></h4><small data-cap-copy="setHint"></small>'+
    '<label class="mg-cap-row"><span><b data-cap-copy="setOn"></b><small data-cap-copy="setOnHint"></small></span><input type="checkbox" class="mg-cap-switch" role="switch" data-cap-on></label>'+
    '<div class="mg-cap-row" data-cap-outrow hidden><span><b data-cap-copy="setOut"></b><small data-cap-copy="setOutHint"></small></span><button type="button" class="mg-cap-reset" data-cap-dock data-cap-copy="dock"></button></div>'+
    '<div class="mg-cap-row"><span><b data-cap-copy="setStyle"></b></span><button type="button" class="mg-cap-reset" data-cap-reset data-cap-copy="reset"></button></div>'+
    '<div class="mg-subtabs" role="tablist">'+STYLES.map(s=>'<button type="button" role="tab" data-cap-style="'+s+'">'+PIC[s]+'<span data-cap-copy="style'+s.toUpperCase()+'"></span></button>').join('')+'</div>'+
    '<small class="mg-cap-desc" data-cap-desc></small>';
   box.querySelector('[data-cap-on]').addEventListener('change',e=>setPrefs({on:e.target.checked}));
   for(const b of box.querySelectorAll('[data-cap-style]'))b.addEventListener('click',()=>setPrefs({style:b.dataset.capStyle}));
   box.querySelector('[data-cap-reset]').addEventListener('click',()=>{const s=prefs.style,d=clean({});setPrefs({[s]:d[s],out:{...prefs.out,on:false}},{relayout:true});});
   box.querySelector('[data-cap-dock]').addEventListener('click',()=>dock());
   panel.prepend(box);paintSettings();
  }
  function paintSettings(){
   for(const box of document.querySelectorAll('.mg-cap-set')){
    for(const n of box.querySelectorAll('[data-cap-copy]')){const v=t(n.dataset.capCopy);if(n.textContent!==v)n.textContent=v;}
    const on=box.querySelector('[data-cap-on]');if(on.checked!==prefs.on)on.checked=prefs.on;
    for(const b of box.querySelectorAll('[data-cap-style]')){const sel=String(b.dataset.capStyle===prefs.style);if(b.getAttribute('aria-selected')!==sel)b.setAttribute('aria-selected',sel);}
    const row=box.querySelector('[data-cap-outrow]');if(row.hidden===prefs.out.on)row.hidden=!prefs.out.on;
    const desc=box.querySelector('[data-cap-desc]'),dv=t('desc'+prefs.style.toUpperCase());if(desc.textContent!==dv)desc.textContent=dv;
   }
  }
  function mountSettings(){const d=openDialog(),panel=d?.querySelector('[data-menu-category=misc]');if(panel&&!panel.querySelector(':scope>.mg-cap-set'))buildSettings(panel);}

  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mountSettings();refresh();});};
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
  new MutationObserver(records=>{if(records.some(r=>!rootEl.contains(r.target)))schedule();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','data-menu-tab','data-open','data-leaving']});
  window.addEventListener('resize',()=>{if(!cur.visible)return;cur.g=null;layout(true);if(cur.state)go(cur.state,{force:true,instant:true});});
  window.addEventListener('tome-language-change',()=>{if(cur.visible)setPrefs({},{rebuild:true});else build();paintSettings();});
  window.MeguHotkeys?.onChange(()=>{if(cur.visible)setPrefs({},{rebuild:true});else build();paintSettings();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&cur.style==='c'&&cur.state==='open'){go('rest');settle();}});
  document.fonts?.ready.then(()=>{if(cur.visible){cur.g=null;layout(true);if(cur.state)go(cur.state,{force:true,instant:true});}});
  build();
  window.__megulitCapsule={prefs:()=>({...prefs}),set:(p,o)=>setPrefs(p,o||{}),state:()=>({state:cur.state,style:cur.style,visible:cur.visible,tucked:cur.tucked,out:prefs.out.on,folded:folded(),side:rootEl.dataset.side||'',corner:(rootEl.dataset.v||'')+(rootEl.dataset.h||'')}),
   rect:()=>{const g=geom();return g&&cur.pos?vp(shape(g,cur.state||'rest')):null;},refresh:()=>{cur.g=null;layout(true);refresh();},hold:state=>{cur.held=['open','rest'].includes(state)?state:'';settle();},dock,core};
  schedule();
 }
 return {core,install};
});
