// SPDX-License-Identifier: GPL-3.0-or-later
/* E542 (user, CLANNAD HD prologue, embed mode): a narration page of eight sentences (the game queues them all before one
   click wait, so they arrive as one line) was drawn at the game's own size from the message box down: four lines, the
   last on the window border, and the translation under it on the desktop above the taskbar. Every engine: the dialogue
   that MeguLit draws over a bound game stays inside the game's client area. When it would cross the bottom edge, the
   text (Japanese and translation together, so they keep the game's proportions) is made smaller, down to 60 %; if that
   is not enough the block moves up, never above the client top; what still does not fit is the translation, which then
   scrolls inside the room that is left. A new line starts again at full size, so a page turn clears the shrink with the
   text. Coordinates: layout clientX/Y/Width/Height are physical pixels of the overlay surface (GalWindowBridge). */
(function(root){
 'use strict';
 const MIN=.6,MARGIN=4;
 /* win: {top,bottom} of the drawn block (CSS px); client: {top,bottom}; fit: current scale.
    Returns {fit, shift, room}: the next scale, how far to move the block up (<= 0) and, when the block still does not
    fit at the smallest scale and moved up to the client top, the height left for the translation (else 0). */
 function plan(win,client,fit){
  const limit=client.bottom-MARGIN,over=win.bottom-limit;
  if(!(over>0))return {fit,shift:0,room:0};
  const height=win.bottom-win.top,avail=limit-win.top;
  if(fit>MIN+.005&&height>0&&avail>0){const next=Math.max(MIN,Math.floor(fit*avail/height*100)/100);if(next<fit-.005)return {fit:next,shift:0,room:0};}
  const up=Math.min(over,Math.max(0,win.top-(client.top+MARGIN)));
  return {fit,shift:-up,room:over>up?over-up:0};
 }
 function install(w){
  const d=w.document,b=w.__tomoyoChinese;
  if(!b){d.addEventListener('DOMContentLoaded',()=>install(w),{once:true});return;}
  if(b.gameFit)return;
  const css=d.createElement('style');css.id='megulit-game-fit-style';
  css.textContent='html body.tomoyo-gal-bound.megulit-fit-on .sentence-window:not(.tome-island-page) .sentence-text{font-size:calc(var(--tomoyo-gal-jp-size,26px) * var(--megulit-fit,1))!important}'+
   'html body.tomoyo-gal-bound.megulit-fit-on .sentence-window:not(.tome-island-page) .tomoyo-cn-output{font-size:calc(var(--tomoyo-gal-cn-size,24px) * var(--megulit-fit,1))!important}'+
   'html body.tomoyo-gal-bound.megulit-fit-up .sentence-window:not(.tome-island-page){top:calc(var(--tomoyo-reader-y,0px) + var(--megulit-fit-shift,0px))!important}'+
   'html body.tomoyo-gal-bound.megulit-fit-room .sentence-window:not(.tome-island-page) .tomoyo-cn-output{max-height:var(--megulit-fit-room,4em)!important;overflow-y:auto!important;overscroll-behavior:contain}';
  (d.head||d.documentElement).append(css);
  let fit=1,shift=0,room=0,line='',frame=0;
  const main=()=>[...d.querySelectorAll('.sentence-window')].find(n=>!n.classList.contains('tome-island-page'));
  function set(){const r=d.documentElement.style,c=d.body.classList;
   r.setProperty('--megulit-fit',String(fit));r.setProperty('--megulit-fit-shift',shift+'px');r.setProperty('--megulit-fit-room',Math.max(0,room)+'px');
   c.toggle('megulit-fit-on',fit<1);c.toggle('megulit-fit-up',shift<0);c.toggle('megulit-fit-room',room>0);w.__tomoyoHitRegionsRefresh?.();}
  function reset(){if(fit===1&&shift===0&&room===0)return;fit=1;shift=0;room=0;set();}
  function measure(win){let top=Infinity,bottom=-Infinity;
   for(const n of [win,...win.querySelectorAll('.sentence-text,.tomoyo-cn-output')]){if(n.hidden)continue;const r=n.getBoundingClientRect();if(!(r.height>0))continue;top=Math.min(top,r.top);bottom=Math.max(bottom,r.bottom);}
   return Number.isFinite(top)?{top,bottom}:null;}
  function check(){frame=0;
   if(!d.body?.classList.contains('tomoyo-gal-bound')){reset();return;}
   const info=b.galLayoutInfo?.(),win=main();if(!win||!info||!(info.clientHeight>0))return;
   const dpr=Math.max(.5,Number(w.devicePixelRatio)||1),client={top:info.clientY/dpr,bottom:(info.clientY+info.clientHeight)/dpr};
   /* measured with the current shift taken out, so moving up is decided again from the real place */
   const m=measure(win);if(!m)return;const box={top:m.top-shift,bottom:m.bottom-shift};
   const roomNow=room;if(roomNow>0){/* the translation was cut to roomNow: its full height decides */const cn=win.querySelector('.tomoyo-cn-output');if(cn&&cn.scrollHeight>cn.clientHeight)box.bottom+=cn.scrollHeight-cn.clientHeight;}
   const p=plan(box,client,fit);
   let nextRoom=0;if(p.room>0){const cn=win.querySelector('.tomoyo-cn-output');if(cn){const full=cn.scrollHeight||cn.getBoundingClientRect().height;nextRoom=Math.max(0,Math.floor(full-p.room));}}
   if(p.fit!==fit||p.shift!==shift||nextRoom!==room){fit=p.fit;shift=p.shift;room=nextRoom;set();schedule();}
  }
  function schedule(){if(!frame)frame=(w.requestAnimationFrame||(f=>setTimeout(f,16)))(check);}
  const ro=w.ResizeObserver?new w.ResizeObserver(schedule):null;let watched=null;
  const watch=()=>{const win=main();if(win&&win!==watched&&ro){if(watched)ro.unobserve(watched);ro.observe(win);for(const n of win.querySelectorAll('.sentence-text,.tomoyo-cn-output'))ro.observe(n);watched=win;}};
  const before=b.galStatus;
  b.galStatus=m=>{before?.(m);if(!m||typeof m!=='object')return;
   if(typeof m.hookSource==='string'&&m.hookSource!==line){line=m.hookSource;reset();}
   watch();schedule();};
  const layoutBefore=b.galLayout;
  if(typeof layoutBefore==='function')b.galLayout=layout=>{const r=layoutBefore(layout);watch();schedule();return r;};
  w.addEventListener('resize',schedule);
  if(w.MutationObserver)new w.MutationObserver(()=>{watch();schedule();}).observe(d.body||d.documentElement,{childList:true});
  b.gameFit={check,state:()=>({fit,shift,room})};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={plan,MIN,MARGIN,install};
 if(root&&root.document)install(root);
})(typeof window!=='undefined'?window:null);
