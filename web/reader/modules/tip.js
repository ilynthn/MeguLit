/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 2026-11-28 (owner, beta test on ISLAND: the capsule's 「打开 / 收起 Alt+T 菜单（可拖动）」 popped up as the system's black box
   with a white frame): one tooltip for the whole reading layer. Every title attribute in the overlay (the capsule, the Alt+T
   menu, the lookup card, the backlog, settings) is taken over: the text moves to data-mg-tip as soon as it is set, so the
   native box never shows, and this component draws it instead: MeguLit's warm dark glass, round corners, a soft shadow, a short
   fade, shortcuts as small key caps (Alt+T → [Alt] [T], （L） → [L]). It opens on the side the anchor asks for
   (data-mg-tip-side on it or an ancestor, default top), flips to the other sides when the screen edge is in the way, slides
   along the edge to stay on screen, and never covers the element being pointed at.
   The overlay window only paints inside its region (interaction.js), so the tip is a region node while it is shown. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api.core;else try{api.install(root);}catch(error){console.error('tip',error);}})(typeof window==='object'?window:this,function(){
 'use strict';
 const SIDES=['top','bottom','left','right'],OPPOSITE={top:'bottom',bottom:'top',left:'right',right:'left'};
 const clamp=(v,lo,hi)=>Math.min(Math.max(lo,hi),Math.max(lo,v));
 /* a = anchor rect, t = tip size, v = visible area; first side in order that fits whole, else the side with the most room */
 function placeTip(a,t,v,opt={}){
  const gap=opt.gap??8,m=opt.margin??6,want=SIDES.includes(opt.side)?opt.side:'top';
  const order=[want,OPPOSITE[want],...SIDES.filter(s=>s!==want&&s!==OPPOSITE[want])];
  const lo={x:v.x+m,y:v.y+m},hi={x:v.x+v.w-m-t.w,y:v.y+v.h-m-t.h};
  const at=side=>side==='top'?{x:clamp(a.x+a.w/2-t.w/2,lo.x,hi.x),y:a.y-gap-t.h}:side==='bottom'?{x:clamp(a.x+a.w/2-t.w/2,lo.x,hi.x),y:a.y+a.h+gap}
   :side==='left'?{x:a.x-gap-t.w,y:clamp(a.y+a.h/2-t.h/2,lo.y,hi.y)}:{x:a.x+a.w+gap,y:clamp(a.y+a.h/2-t.h/2,lo.y,hi.y)};
  const room={top:a.y-gap-v.y-m,bottom:v.y+v.h-m-(a.y+a.h+gap),left:a.x-gap-v.x-m,right:v.x+v.w-m-(a.x+a.w+gap)};
  for(const side of order){const need=side==='top'||side==='bottom'?t.h:t.w;if(room[side]>=need)return {...at(side),side,fits:true};}
  const side=[...order].sort((p,q)=>room[q]-room[p])[0],p=at(side);
  return {x:clamp(p.x,lo.x,hi.x),y:clamp(p.y,lo.y,hi.y),side,fits:false};
 }
 const KEYNAME='(?:Ctrl|Alt|Shift|Win|Esc|Enter|Space|Tab|Del|Home|End|PgUp|PgDn|F\\d{1,2}|[A-Z0-9]|←|→|↑|↓)';
 const COMBO=new RegExp('(?:Ctrl|Alt|Shift|Win)(?:\\s*\\+\\s*'+KEYNAME+')+','g'),SOLO=new RegExp('[（(]\\s*('+KEYNAME+')\\s*[)）]','g');
 /* text → lines of parts: {text} or {keys:[...]}; key combos become caps, a lone key in brackets loses its brackets */
 function parseTip(text){
  return String(text??'').replace(/\r/g,'').split('\n').map(line=>{
   const marks=[];
   for(const m of line.matchAll(COMBO))marks.push({at:m.index,end:m.index+m[0].length,keys:m[0].split('+').map(k=>k.trim())});
   for(const m of line.matchAll(SOLO))if(!marks.some(k=>m.index<k.end&&m.index+m[0].length>k.at))marks.push({at:m.index,end:m.index+m[0].length,keys:[m[1]]});
   marks.sort((p,q)=>p.at-q.at);const parts=[];let i=0;
   for(const k of marks){if(k.at>i)parts.push({text:line.slice(i,k.at)});parts.push({keys:k.keys});i=k.end;}
   if(i<line.length)parts.push({text:line.slice(i)});
   return parts.filter(p=>p.keys||p.text);
  }).filter(line=>line.length);
 }
 const core={placeTip,parseTip};

 function install(window){
  const document=window.document;
  if(!document.documentElement||!document.body){document.addEventListener('DOMContentLoaded',()=>install(window),{once:true});return;}
  if(window.__megulitTip)return;
  const SHOW_MS=420,WARM_MS=60,COOL_MS=600;
  const css=String.raw`
.mg-tip{position:fixed;left:0;top:0;z-index:2147483000;padding:8px;box-sizing:border-box;pointer-events:none;max-width:min(340px,calc(100vw - 12px))}
.mg-tip[hidden]{display:none!important}
.mg-tip-b{--tip-ink:#f0e5da;--tip-ink2:#b8a69a;position:relative;padding:7px 11px 8px;border-radius:10px;color:var(--tip-ink);
 background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,0) 60%),rgba(30,22,25,.95);
 box-shadow:0 0 0 1px rgba(240,229,218,.10),0 6px 14px -4px rgba(0,0,0,.5),0 2px 4px rgba(0,0,0,.28);
 font:500 12.5px/1.55 "Microsoft YaHei UI","Yu Gothic UI","Segoe UI",sans-serif;letter-spacing:.03em;-webkit-font-smoothing:antialiased;
 text-wrap:pretty;overflow-wrap:anywhere;opacity:0;transform:translate(var(--tip-dx,0),var(--tip-dy,3px));
 transition:opacity .14s ease-out,transform .18s cubic-bezier(.19,1,.22,1)}
.mg-tip[data-side=top] .mg-tip-b{--tip-dy:3px}.mg-tip[data-side=bottom] .mg-tip-b{--tip-dy:-3px}
.mg-tip[data-side=left] .mg-tip-b{--tip-dx:3px;--tip-dy:0}.mg-tip[data-side=right] .mg-tip-b{--tip-dx:-3px;--tip-dy:0}
.mg-tip[data-in] .mg-tip-b{opacity:1;transform:none}
.mg-tip-l{display:block}
.mg-tip-l+.mg-tip-l{margin-top:2px;color:var(--tip-ink2);font-size:12px}
.mg-tip kbd{display:inline-block;min-width:18px;height:18px;box-sizing:border-box;padding:0 5px;margin:0 1px;border-radius:5px;vertical-align:1px;text-align:center;
 font:600 10.5px/17px "Segoe UI","Microsoft YaHei UI",sans-serif;letter-spacing:.02em;color:var(--tip-ink);
 background:rgba(240,229,218,.10);box-shadow:inset 0 0 0 1px rgba(240,229,218,.14),inset 0 -1.5px 0 rgba(0,0,0,.35)}
.mg-tip kbd+kbd{margin-left:3px}
@media (prefers-reduced-motion:reduce){.mg-tip-b{transition:opacity .1s linear;transform:none!important}}
`;
  const style=document.createElement('style');style.id='megulit-tip-style';style.textContent=css;document.head.append(style);
  const tip=document.createElement('div');tip.className='mg-tip';tip.id='mg-tip';tip.setAttribute('role','tooltip');tip.hidden=true;tip.dataset.noI18n='';
  const body=document.createElement('div');body.className='mg-tip-b';tip.append(body);document.body.append(tip);

  let anchor=null,timer=0,shownAt=0,hiddenAt=0;
  /* every title in the page becomes data-mg-tip the moment it is set; an emptied title clears the tip */
  const adopt=el=>{
   if(!(el instanceof window.Element)||!el.hasAttribute('title')||el.closest('svg'))return;
   const v=el.getAttribute('title');el.removeAttribute('title');
   if(v){el.dataset.mgTip=v;if(!el.hasAttribute('aria-label')&&!el.textContent.trim())el.setAttribute('aria-label',v.split('\n')[0]);}
   else delete el.dataset.mgTip;
   if(el===anchor){if(v)paint();else hide();}
  };
  for(const el of document.querySelectorAll('[title]'))adopt(el);
  new window.MutationObserver(records=>{for(const r of records){if(r.type==='attributes')adopt(r.target);else for(const n of r.addedNodes)if(n.nodeType===1){adopt(n);for(const el of n.querySelectorAll?.('[title]')||[])adopt(el);}}})
   .observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['title']});

  const text=el=>el?.dataset?.mgTip||'';
  const sideFor=el=>el.closest('[data-mg-tip-side]')?.dataset.mgTipSide||'top';
  function render(){
   const lines=parseTip(text(anchor));body.replaceChildren();
   for(const parts of lines){const l=document.createElement('span');l.className='mg-tip-l';
    for(const p of parts){if(p.text)l.append(p.text);else for(const k of p.keys){const kbd=document.createElement('kbd');kbd.textContent=k;l.append(kbd);}}
    body.append(l);}
  }
  function paint(){
   if(!anchor)return;const r=anchor.getBoundingClientRect();if(!r.width&&!r.height){hide();return;}
   render();tip.hidden=false;
   const pad=8,size={w:tip.offsetWidth-2*pad,h:tip.offsetHeight-2*pad};
   const p=placeTip({x:r.left,y:r.top,w:r.width,h:r.height},size,{x:0,y:0,w:window.innerWidth,h:window.innerHeight},{side:sideFor(anchor)});
   tip.style.left=Math.round(p.x-pad)+'px';tip.style.top=Math.round(p.y-pad)+'px';tip.dataset.side=p.side;
   anchor.setAttribute('aria-describedby','mg-tip');
  }
  function show(el){
   anchor=el;paint();if(tip.hidden)return;shownAt=Date.now();
   tip.removeAttribute('data-in');void tip.offsetWidth;window.requestAnimationFrame(()=>{if(anchor===el)tip.setAttribute('data-in','');});
  }
  function hide(){
   window.clearTimeout(timer);timer=0;if(!anchor&&tip.hidden)return;
   if(anchor?.getAttribute('aria-describedby')==='mg-tip')anchor.removeAttribute('aria-describedby');
   anchor=null;if(!tip.hidden)hiddenAt=Date.now();tip.removeAttribute('data-in');tip.hidden=true;
  }
  function want(el){
   if(el===anchor)return;window.clearTimeout(timer);
   const warm=!tip.hidden||Date.now()-hiddenAt<COOL_MS;if(!tip.hidden)hide();
   timer=window.setTimeout(()=>{timer=0;if(el.isConnected)show(el);},warm?WARM_MS:SHOW_MS);
  }
  const target=e=>e.target instanceof window.Element?e.target.closest('[data-mg-tip],[title]'):null;
  document.addEventListener('pointerover',e=>{const el=target(e);if(el)adopt(el);if(el&&text(el)&&!el.closest('.mg-cap-dragging'))want(el);else if(!el){window.clearTimeout(timer);timer=0;}},true);
  document.addEventListener('pointerout',e=>{const el=target(e);if(!el)return;if(e.relatedTarget instanceof window.Node&&el.contains(e.relatedTarget))return;if(el===anchor)hide();else if(timer){window.clearTimeout(timer);timer=0;}},true);
  document.addEventListener('focusin',e=>{const el=target(e);if(!el)return;adopt(el);let visible=false;try{visible=el.matches(':focus-visible');}catch{}if(visible&&text(el)){window.clearTimeout(timer);show(el);}},true);
  document.addEventListener('focusout',e=>{if(target(e)===anchor)hide();},true);
  for(const type of ['pointerdown','wheel','scroll'])document.addEventListener(type,()=>hide(),true);
  window.addEventListener('keydown',e=>{if(e.key==='Escape'||e.key==='Alt'||e.ctrlKey||e.altKey)hide();},true);
  window.addEventListener('blur',()=>hide());
  /* the anchor can be rebuilt or hidden under the pointer (language switch, menu closing) */
  window.setInterval(()=>{if(anchor&&(!anchor.isConnected||!text(anchor)))hide();},400);
  window.__megulitTip={hide,show:el=>{adopt(el);if(text(el))show(el);},state:()=>({shown:!tip.hidden,anchor,since:shownAt}),core};
 }
 return {core,install};
});
