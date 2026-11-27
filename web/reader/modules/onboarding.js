/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 2026-11-27 新手引导 in the game, spotlight style (user: 「背景变暗 然后需要点击的地方高亮 然后一步步引导」): the whole screen
   is dimmed except one hole over the part of MeguLit being explained. The hole follows the target's rounded corners, has a
   soft glow that breathes, and glides to the next target (no motion under prefers-reduced-motion). A card beside it has a
   picture, two sentences, 上一步 / 下一步 and progress dots; 跳过教程 sits in the corner.
   Steps with an act wait for the real thing: the capsule clicked (the menu opens), the menu hotkey pressed (the menu closes
   and opens again), the 文字 tab clicked. Only the hole of a click step lets a click through, and only to MeguLit's own
   element under it; everywhere else a click lands on the tour's blockers, never in the game (the whole window is part of
   the overlay region while the tour is open, interaction.js). Steps without an act move on with 下一步.
   Steps, words, pictures and the launch count: web/onboarding-steps.js. Shown at the first five game launches (a launch =
   the identity in the 'profile' status, game-style-sync-ui.js); 跳过教程 stops it for good; 教程 in the Alt+T header and in
   the main window's top bar bring it back. It closes before a calibration capture (body.tome-style-probing). */
(function(){
 'use strict';
 if(window.__megulitTour)return;
 const O=window.MeguLitOnboarding;if(!O||!document.body)return;
 let store;try{store=window.localStorage;}catch{const m=new Map();store={getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(k,String(v));}};}
 const bridge=()=>window.__tomoyoChinese||{};
 const lang=()=>{const l=window.__tomeI18n?.get?.()||'zh';return O.TEXT[l]?l:'zh';};
 const w=k=>O.words(lang())[k];
 const read=()=>O.clean(store.getItem(O.KEY));
 /* bootstrap mirrors tomoyo- keys to ui-state.json on change; ask for it now too, the mirror is only installed once loading ends */
 const write=s=>{try{store.setItem(O.KEY,JSON.stringify(s));}catch{}try{window.__tomoyoTranslateRequest?.(JSON.stringify({type:'uiState'}));}catch{}paintDot();};
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const IMG=name=>new URL('../assets/onboarding/'+O.image(name,lang()),document.baseURI).href;
 const BOOK='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.2c1.9-.6 3.8-.4 5.5.8v9c-1.7-1.2-3.6-1.4-5.5-.8zM13.5 3.2c-1.9-.6-3.8-.4-5.5.8v9c1.7-1.2 3.6-1.4 5.5-.8z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>';
 const css=document.createElement('style');css.id='mg-tour-style';css.textContent=`
.mg-tour{position:fixed;inset:0;z-index:2147482600;pointer-events:none;font-family:var(--mgc-ui,"Microsoft YaHei UI",sans-serif);color:var(--mgc-ink,#f0e5da)}
.mg-tour-block{position:absolute;pointer-events:auto;background:transparent}
.mg-tour-hole{position:absolute;box-sizing:border-box;pointer-events:none;border-radius:12px;
 box-shadow:0 0 0 200vmax rgba(8,4,6,.6),0 0 0 1.5px rgba(255,196,178,.9),0 0 18px 3px rgba(200,50,60,.55);
 transition:left .32s var(--mgc-ease,cubic-bezier(.19,1,.22,1)),top .32s var(--mgc-ease,cubic-bezier(.19,1,.22,1)),width .32s var(--mgc-ease,cubic-bezier(.19,1,.22,1)),height .32s var(--mgc-ease,cubic-bezier(.19,1,.22,1)),border-radius .32s ease}
.mg-tour-hole::after{content:"";position:absolute;inset:-1px;border-radius:inherit;box-shadow:0 0 0 2px rgba(220,70,80,.55),0 0 24px 6px rgba(200,50,60,.35);animation:mg-tour-breathe 2.2s ease-in-out infinite}
.mg-tour-hole[data-act]::after{animation-duration:1.4s}
.mg-tour-hole[hidden]{display:none}
@keyframes mg-tour-breathe{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:1;transform:scale(1.015)}}
.mg-tour-card{position:absolute;pointer-events:auto;box-sizing:border-box;width:min(380px,calc(100vw - 32px));padding:16px 18px 14px;border-radius:16px;
 background:linear-gradient(160deg,rgba(46,28,30,.95),rgba(22,14,16,.96));border:1px solid rgba(255,225,205,.13);
 box-shadow:0 24px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,235,220,.06);backdrop-filter:blur(18px) saturate(1.15);
 transition:left .32s var(--mgc-ease,ease),top .32s var(--mgc-ease,ease)}
.mg-tour-kicker{display:block;margin-bottom:10px;font-size:12px;letter-spacing:.12em;color:var(--mgc-gold,#d6a434)}
.mg-tour-skip{position:absolute;right:24px;bottom:22px;pointer-events:auto;appearance:none;border:1px solid rgba(240,229,218,.2);background:rgba(20,12,14,.72);color:var(--mgc-ink-2,#b8a69a);
 font:inherit;font-size:12.5px;height:30px;padding:0 14px;border-radius:999px;cursor:pointer;backdrop-filter:blur(10px);transition:color .16s ease,border-color .16s ease,background-color .16s ease}
.mg-tour-skip:hover{color:var(--mgc-ink,#f0e5da);border-color:rgba(220,70,80,.6);background:rgba(60,20,26,.8)}
.mg-tour-shot{margin:0 0 12px;border-radius:10px;overflow:hidden;aspect-ratio:16/9;background:#140d0f;outline:1px solid rgba(255,225,205,.1);outline-offset:-1px}
.mg-tour-shot img{display:block;width:100%;height:100%;object-fit:cover}
.mg-tour-title{margin:0 0 6px;font:600 18px/1.35 var(--mgc-serif,serif);letter-spacing:.02em;color:var(--mgc-ink,#f0e5da)}
.mg-tour-body{margin:0;font-size:13.5px;line-height:1.7;color:var(--mgc-ink-2,#cbb9ad)}
.mg-tour-body kbd,.mg-tour-wait kbd{font:600 12px/1 var(--mgc-ui,sans-serif);padding:2px 6px;border-radius:5px;border:1px solid rgba(255,225,205,.22);background:rgba(255,255,255,.06);color:var(--mgc-ink,#f0e5da)}
.mg-tour-note{margin:8px 0 0;font-size:12px;color:var(--mgc-ink-3,#8f8178)}
.mg-tour-card footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;min-height:32px}
.mg-tour-dots{display:flex;gap:6px;align-items:center}
.mg-tour-dots i{display:block;width:6px;height:6px;border-radius:3px;background:rgba(240,229,218,.22);transition:width .3s var(--mgc-ease,ease),background-color .3s ease}
.mg-tour-dots i[data-on]{width:18px;background:var(--mgc-red,#c8323c)}
.mg-tour-nav{display:flex;gap:8px;align-items:center}
.mg-tour-nav button{appearance:none;font:inherit;font-size:13px;height:32px;padding:0 14px;border-radius:999px;cursor:pointer;transition:filter .16s ease,background-color .16s ease,transform .12s ease}
.mg-tour-nav button:active{transform:scale(.97)}
.mg-tour-nav [hidden]{display:none}
.mg-tour-prev{border:1px solid rgba(240,229,218,.16);background:transparent;color:var(--mgc-ink-2,#b8a69a)}
.mg-tour-prev:hover{background:rgba(255,255,255,.05);color:var(--mgc-ink,#f0e5da)}
.mg-tour-next{border:0;color:#fff;background:linear-gradient(180deg,var(--mgc-red-hi,#d94550),var(--mgc-red,#c8323c));box-shadow:0 0 18px rgba(200,50,60,.45),inset 0 1px 0 rgba(255,255,255,.18)}
.mg-tour-next:hover{filter:brightness(1.08)}
.mg-tour-next::after{content:" ✦";font-size:11px}
.mg-tour-wait{font-size:12.5px;color:#f3b9b4;display:flex;align-items:center;gap:7px}
.mg-tour-wait::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--mgc-red,#c8323c);box-shadow:0 0 0 0 rgba(200,50,60,.6);animation:mg-tour-ping 1.4s ease-out infinite}
@keyframes mg-tour-ping{0%{box-shadow:0 0 0 0 rgba(200,50,60,.6)}100%{box-shadow:0 0 0 8px rgba(200,50,60,0)}}
.mg-tour :focus-visible{outline:var(--mgc-focus,2px solid #d6a434);outline-offset:2px}
@media (prefers-reduced-motion: reduce){.mg-tour-hole,.mg-tour-card,.mg-tour-dots i{transition:none!important}.mg-tour-hole::after,.mg-tour-wait::before{animation:none}}
/* 教程 in the Alt+T header: quiet, sized to the × beside it; a red dot until the tour has been seen once */
#mg-menu-tour{appearance:none;position:absolute;top:15px;right:44px;z-index:1;display:inline-flex;align-items:center;gap:5px;height:24px!important;min-height:0!important;max-height:24px!important;box-sizing:border-box!important;padding:0 8px!important;margin:0;
 border:1px solid transparent!important;border-radius:6px!important;background:transparent!important;box-shadow:none!important;color:var(--mgc-ink-3,#8f8178)!important;
 font:500 12px/1 var(--mgc-ui,sans-serif)!important;letter-spacing:.04em;cursor:pointer;transition:color .16s ease,border-color .16s ease,background-color .16s ease!important}
#mg-menu-tour svg{width:14px;height:14px;flex:none}
#mg-menu-tour:hover{color:var(--mgc-ink,#f0e5da)!important;border-color:color-mix(in srgb,var(--mgc-red,#c8323c) 70%,transparent)!important;background:color-mix(in srgb,var(--mgc-red,#c8323c) 12%,transparent)!important}
#mg-menu-tour:active{background:color-mix(in srgb,var(--mgc-red,#c8323c) 22%,transparent)!important}
#mg-menu-tour[data-new]::after{content:"";position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;background:var(--mgc-red-hi,#d94550);box-shadow:0 0 0 2px var(--mgc-plate,#191315),0 0 8px rgba(217,69,80,.8)}`;
 document.head.append(css);
 const PAD=6;
 let cur=null;
 const dialog=()=>document.querySelector('.tomoyo-cn-dialog[open]');
 const menuTab=()=>dialog()?.querySelector('.tomoyo-menu-tabs [aria-selected="true"]')?.dataset.menuKey||'';
 const visible=el=>{if(!el||el.closest('[hidden]'))return null;
  /* the capsule is laid out at its open size and clipped: light the shape that is drawn */
  if(el.id==='mg-cap'){const c=window.__megulitCapsule?.rect?.();if(!c||c.w<4||c.h<4)return null;return {left:c.x,top:c.y,width:c.w,height:c.h,right:c.x+c.w,bottom:c.y+c.h,radius:c.h/2};}
  const r=el.getBoundingClientRect();if(r.width<4||r.height<4)return null;
  const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none'||Number(cs.opacity)===0)return null;
  return {left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom,radius:Math.min(parseFloat(cs.borderTopLeftRadius)||0,r.height/2)};};
 const findTarget=groups=>{for(const group of groups||[])for(const sel of group)for(const el of document.querySelectorAll(sel)){const r=visible(el);if(r)return {sel,el,r};}return null;};
 function setMenu(s){
  const open=!!dialog();
  if(s.menu==='open'&&!open){bridge().toggleGalMenu?.();cur.opened=true;}
  else if(s.menu==='close'&&open&&cur.opened){bridge().toggleGalMenu?.();cur.opened=false;}
  if(s.tab)setTimeout(()=>{const b=dialog()?.querySelector('.tomoyo-menu-tabs [data-menu-key="'+s.tab+'"]');if(b&&b.getAttribute('aria-selected')!=='true')b.click();},s.menu==='open'&&!open?260:0);
 }
 function build(){
  const root=document.createElement('div');root.className='mg-tour';root.dataset.noI18n='';
  root.innerHTML='<div class="mg-tour-block" data-side="t"></div><div class="mg-tour-block" data-side="b"></div><div class="mg-tour-block" data-side="l"></div><div class="mg-tour-block" data-side="r"></div><div class="mg-tour-block" data-side="hole"></div>'+
   '<div class="mg-tour-hole"></div><button type="button" class="mg-tour-skip"></button>'+
   '<section class="mg-tour-card" role="dialog" aria-live="polite"><span class="mg-tour-kicker"></span>'+
   '<figure class="mg-tour-shot"><img alt="" decoding="async"></figure><h4 class="mg-tour-title"></h4><p class="mg-tour-body"></p><p class="mg-tour-note" hidden></p>'+
   '<footer><div class="mg-tour-dots" aria-hidden="true">'+O.STEPS.map(()=>'<i></i>').join('')+'</div><div class="mg-tour-nav"><span class="mg-tour-wait" role="status" hidden></span><button type="button" class="mg-tour-prev"></button><button type="button" class="mg-tour-next"></button></div></footer></section>';
  root.querySelector('.mg-tour-skip').onclick=()=>{if(cur?.index===O.STEPS.length-1&&!cur.auto)end();else{write(O.stop(read()));end();}};
  root.querySelector('.mg-tour-prev').onclick=()=>go(cur.index-1);
  root.querySelector('.mg-tour-next').onclick=()=>{if(!ready())return;cur.index>=O.STEPS.length-1?end():go(cur.index+1);};
  root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();end();}});
  /* a click on the dim never reaches anything */
  for(const b of root.querySelectorAll('.mg-tour-block'))for(const type of ['pointerdown','mousedown','click','contextmenu','dblclick'])b.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();},true);
  document.body.append(root);return root;
 }
 const ready=()=>!O.STEPS[cur.index].act||cur.done;
 function paint(){
  if(!cur)return;const s=O.step(lang(),cur.index),root=cur.root,card=root.querySelector('.mg-tour-card'),last=cur.index===O.STEPS.length-1;
  card.dataset.step=s.id;card.dataset.act=s.act&&!cur.done?s.act:'';card.setAttribute('aria-label',s.title);
  root.querySelector('.mg-tour-kicker').textContent='✦ '+w('kicker');
  /* on the last step the corner button is 不再显示 for a tour that came by itself, and 关闭 for one the user opened */
  root.querySelector('.mg-tour-skip').textContent=last?(cur.auto?w('never'):w('close')):w('skip');
  const img=root.querySelector('.mg-tour-shot img');if(img.getAttribute('src')!==IMG(s.image))img.setAttribute('src',IMG(s.image));
  root.querySelector('.mg-tour-title').textContent=s.title;
  const keys=['menu','cover'].map(k=>O.hotkey(k)).filter(Boolean),kb=h=>keys.reduce((x,k)=>x.split(esc(k)).join('<kbd>'+esc(k)+'</kbd>'),h);
  root.querySelector('.mg-tour-body').innerHTML=kb(esc(s.body));
  const note=root.querySelector('.mg-tour-note');note.hidden=!(cur.auto&&cur.index===0);note.textContent=O.fill(w('count'),{limit:O.LIMIT});
  root.querySelectorAll('.mg-tour-dots i').forEach((d,i)=>{if(i===cur.index)d.dataset.on='';else delete d.dataset.on;});
  const prev=root.querySelector('.mg-tour-prev');prev.textContent=w('prev');prev.hidden=cur.index===0;
  const next=root.querySelector('.mg-tour-next'),wait=root.querySelector('.mg-tour-wait');
  next.textContent=last?w('done'):w('next');next.hidden=!ready();wait.hidden=ready();if(!ready())wait.innerHTML=kb(esc(O.fill(w('act')[s.act])));
  place();
 }
 function place(){
  if(!cur)return;const s=O.STEPS[cur.index],root=cur.root,W=innerWidth,H=innerHeight;
  const t=findTarget(cur.done&&s.after?s.after:s.target),hole=root.querySelector('.mg-tour-hole');
  const r=t?{x:t.r.left-PAD,y:t.r.top-PAD,w:t.r.width+PAD*2,h:t.r.height+PAD*2,k:Math.max(8,(t.r.radius||0)+PAD)}:null;
  hole.hidden=!r;if(r){hole.dataset.target=t.sel;if(s.act&&!cur.done)hole.dataset.act='';else delete hole.dataset.act;
   Object.assign(hole.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px',borderRadius:Math.min(r.k,r.h/2)+'px'});}
  /* blockers around the hole; the hole itself is open only while a click step waits for that click */
  const open=!!r&&s.act&&s.act!=='hotkey'&&!cur.done,box=r||{x:W/2,y:H/2,w:0,h:0};
  const set=(side,x,y,wd,ht)=>Object.assign(root.querySelector('.mg-tour-block[data-side="'+side+'"]').style,{left:x+'px',top:y+'px',width:Math.max(0,wd)+'px',height:Math.max(0,ht)+'px'});
  set('t',0,0,W,box.y);set('b',0,box.y+box.h,W,H-box.y-box.h);set('l',0,box.y,box.x,box.h);set('r',box.x+box.w,box.y,W-box.x-box.w,box.h);
  set('hole',box.x,box.y,open?0:box.w,open?0:box.h);
  /* the card goes beside the lit place: beside the menu when it is open, else below, above, left, right; centred when nothing is lit */
  const card=root.querySelector('.mg-tour-card'),cw=card.offsetWidth,ch=card.offsetHeight,G=18,M=16;
  const clampX=x=>Math.min(Math.max(M,x),W-cw-M),clampY=y=>Math.min(Math.max(M,y),H-ch-M);
  let x=(W-cw)/2,y=(H-ch)/2;
  if(r){const cx=r.x+r.w/2,cy=r.y+r.h/2;
   const options=[[clampX(cx-cw/2),r.y+r.h+G,H-r.y-r.h-G>=ch+M],[clampX(cx-cw/2),r.y-G-ch,r.y-G-ch>=M],[r.x-G-cw,clampY(cy-ch/2),r.x-G-cw>=M],[r.x+r.w+G,clampY(cy-ch/2),W-r.x-r.w-G-cw>=M]];
   const d=dialog()?.getBoundingClientRect();if(d&&d.width)options.unshift([d.left-G-cw,clampY(cy-ch/2),d.left-G-cw>=M],[d.right+G,clampY(cy-ch/2),W-d.right-G-cw>=M]);
   const fit=options.find(o=>o[2]);if(fit){x=fit[0];y=fit[1];}else{x=clampX(x);y=clampY(y);}}
  card.style.left=Math.round(x)+'px';card.style.top=Math.round(y)+'px';
 }
 /* has the user done what this step asks? */
 function check(){
  if(!cur)return;const s=O.STEPS[cur.index];if(!s.act||cur.done)return;
  const open=!!dialog();let done=false;
  if(s.act==='open')done=open;
  else if(s.act==='hotkey'){if(!open)cur.closed=true;done=cur.closed&&open&&cur.byKey>=2;}
  else if(s.act==='tab')done=menuTab()===s.actTab;
  if(!done)return;
  cur.done=true;cur.doneSteps.add(cur.index);if(s.act==='open')cur.opened=true;
  if(s.after){paint();return;}
  setTimeout(()=>{if(cur&&O.STEPS[cur.index]===s)go(cur.index+1);},reduce?.matches?0:260);
 }
 function go(i){
  if(!cur||i<0||i>=O.STEPS.length)return;const s=O.STEPS[i];cur.index=i;cur.done=false;cur.closed=false;cur.byKey=0;
  setMenu(s);window.__megulitCapsule?.hold?.(s.capsule||'');
  /* a step already done (back to it) waits for 下一步 instead of asking again */
  if(cur.doneSteps.has(i)||s.act==='open'&&dialog()||s.act==='tab'&&menuTab()===s.actTab)cur.done=true;
  paint();
  clearInterval(cur.follow);let n=0;cur.follow=setInterval(()=>{place();if(++n>12)clearInterval(cur.follow);},60);
 }
 /* the menu hotkey: the native bridge sends 'hotkey' (bootstrap.js calls this), or the page sees the key itself when the bridge does not hold it */
 window.__megulitTourHotkey=()=>{if(cur)cur.byKey++;};
 addEventListener('keydown',e=>{if(!cur||e.repeat)return;const want=O.hotkey('menu').toLowerCase().split('+'),key=want.pop(),mods={alt:e.altKey,ctrl:e.ctrlKey,shift:e.shiftKey};
  if(want.every(m=>mods[m])&&String(e.code).toLowerCase()==='key'+key)cur.byKey++;},true);
 function start({auto=false}={}){
  if(document.body.classList.contains('tome-style-probing'))return false;
  if(cur)end({keepMenu:true});
  cur={index:0,auto,opened:false,done:false,byKey:0,doneSteps:new Set(),root:build(),tick:setInterval(()=>{check();place();if(document.body.classList.contains('tome-style-probing'))end();},120)};
  if(!reduce?.matches){cur.root.animate?.([{opacity:0},{opacity:1}],{duration:220,easing:'ease-out'});}
  if(!read().seen)write(O.seen(read()));
  go(0);window.__tomoyoHitRegionsRefresh?.(true);return true;
 }
 function end({keepMenu=false}={}){
  if(!cur)return;const c=cur;cur=null;clearInterval(c.tick);clearInterval(c.follow);c.root.remove();window.__megulitCapsule?.hold?.('');
  if(!keepMenu&&c.opened&&dialog())bridge().toggleGalMenu?.();
  window.__tomoyoHitRegionsRefresh?.(true);
 }
 /* the per-work first-run tip (game-style-sync-ui.js) speaks first; the tour waits until it is gone */
 function whenClear(fn,tries=0){if(document.querySelector('.tome-first-run')&&tries<80){setTimeout(()=>whenClear(fn,tries+1),500);return;}fn();}
 let live=false;
 window.addEventListener('megulit-game-launch',e=>{
  live=true;const r=O.launch(read(),e.detail?.identity);if(r.state.last!==read().last||r.show)write(r.state);
  if(r.show)setTimeout(()=>whenClear(()=>start({auto:r.counted!==false})),900);
 });
 /* 再带我走一遍 from the main window (services/bridge.cjs onboarding_replay): now when a game is on, else at the next launch */
 bridge().onboardingReplay=()=>{if(live&&start())return;write(O.replay(read()));};
 /* 教程 in the Alt+T header */
 function paintDot(){const b=document.getElementById('mg-menu-tour');if(!b)return;if(read().seen)delete b.dataset.new;else b.dataset.new='';}
 function headerButton(){const head=document.querySelector('.tomoyo-cn-dialog .tomoyo-menu-header');if(!head||head.querySelector('#mg-menu-tour'))return;
  const b=document.createElement('button');b.type='button';b.id='mg-menu-tour';b.className='tome-menu-tour';b.dataset.noI18n='';
  b.innerHTML=BOOK+'<span></span>';b.querySelector('span').textContent=w('again');b.title=w('againTip');b.setAttribute('aria-label',w('againTip'));
  b.onclick=e=>{e.preventDefault();e.stopPropagation();start();};head.insertBefore(b,head.querySelector('.tome-menu-close'));paintDot();}
 new MutationObserver(headerButton).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});headerButton();
 window.addEventListener('tome-language-change',()=>{const b=document.getElementById('mg-menu-tour');if(b){b.querySelector('span').textContent=w('again');b.title=w('againTip');b.setAttribute('aria-label',w('againTip'));}if(cur)paint();});
 window.addEventListener('megulit-hotkeys-changed',()=>{if(cur)paint();});
 window.addEventListener('resize',()=>place());
 window.__megulitTour={start,end,state:()=>cur?{index:cur.index,step:O.STEPS[cur.index].id,auto:cur.auto,done:cur.done}:null};
})();
