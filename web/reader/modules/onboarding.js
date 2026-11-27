/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 2026-11-27 新手引导 in the game: six steps that dim the game, light the part of MeguLit being explained (the capsule, the
   hotkey on it, the Alt+T pages, the 文字 page, a line of dialogue, 校准 and the 教程 button) and put a card with a picture
   and two sentences beside it. Steps, words, pictures and the launch count live in web/onboarding-steps.js.
   Shown at the first five game launches (a launch = the identity in the 'profile' status, game-style-sync-ui.js); 跳过教程
   stops it for good; 教程 in the Alt+T header and in the main window's top bar bring it back. While it is open the whole
   window is part of the overlay region, so a click meant for the card never reaches the game; it closes before a
   calibration capture (body.tome-style-probing) so the screen reader never measures it. */
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
 const write=s=>{try{store.setItem(O.KEY,JSON.stringify(s));}catch{}try{window.__tomoyoTranslateRequest?.(JSON.stringify({type:'uiState'}));}catch{}};
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const IMG=name=>new URL('../assets/onboarding/'+O.image(name,lang()),document.baseURI).href;
 const css=document.createElement('style');css.id='mg-tour-style';css.textContent=`
.mg-tour{position:fixed;inset:0;z-index:2147482600;pointer-events:auto;font-family:var(--mgc-ui,"Microsoft YaHei UI",sans-serif);color:var(--mgc-ink,#f0e5da)}
.mg-tour-dim{position:absolute;inset:0;width:100%;height:100%;display:block}
.mg-tour-dim path{fill:rgba(8,4,6,.58)}
.mg-tour-ring{position:absolute;box-sizing:border-box;border-radius:12px;pointer-events:none;border:1.5px solid rgba(255,190,170,.85);
 box-shadow:0 0 0 4px rgba(200,50,60,.28),0 0 26px 4px rgba(200,50,60,.45);transition:left .38s var(--mgc-ease,ease),top .38s var(--mgc-ease,ease),width .38s var(--mgc-ease,ease),height .38s var(--mgc-ease,ease)}
.mg-tour-card{position:absolute;box-sizing:border-box;width:min(380px,calc(100vw - 32px));padding:16px 18px 14px;border-radius:16px;
 background:linear-gradient(160deg,rgba(46,28,30,.94),rgba(22,14,16,.95));border:1px solid rgba(255,225,205,.13);
 box-shadow:0 24px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,235,220,.06);backdrop-filter:blur(18px) saturate(1.15);
 transition:left .38s var(--mgc-ease,ease),top .38s var(--mgc-ease,ease),opacity .2s ease}
.mg-tour-card header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.mg-tour-kicker{font-size:12px;letter-spacing:.12em;color:var(--mgc-gold,#d6a434)}
.mg-tour-skip{appearance:none;border:1px solid rgba(240,229,218,.16);background:rgba(255,255,255,.03);color:var(--mgc-ink-2,#b8a69a);font:inherit;font-size:12px;
 padding:4px 11px;border-radius:999px;cursor:pointer;transition:color .16s ease,border-color .16s ease,background-color .16s ease}
.mg-tour-skip:hover{color:var(--mgc-ink,#f0e5da);border-color:rgba(240,229,218,.32);background:rgba(255,255,255,.06)}
.mg-tour-shot{margin:0 0 12px;border-radius:10px;overflow:hidden;aspect-ratio:16/9;background:#140d0f;outline:1px solid rgba(255,225,205,.1);outline-offset:-1px}
.mg-tour-shot img{display:block;width:100%;height:100%;object-fit:cover}
.mg-tour-title{margin:0 0 6px;font:600 18px/1.35 var(--mgc-serif,serif);letter-spacing:.02em;color:var(--mgc-ink,#f0e5da)}
.mg-tour-body{margin:0;font-size:13.5px;line-height:1.7;color:var(--mgc-ink-2,#cbb9ad)}
.mg-tour-body kbd{font:600 12px/1 var(--mgc-ui,sans-serif);padding:2px 6px;border-radius:5px;border:1px solid rgba(255,225,205,.22);background:rgba(255,255,255,.06);color:var(--mgc-ink,#f0e5da)}
.mg-tour-note{margin:8px 0 0;font-size:12px;color:var(--mgc-ink-3,#8f8178)}
.mg-tour-card footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}
.mg-tour-dots{display:flex;gap:6px;align-items:center}
.mg-tour-dots i{display:block;width:6px;height:6px;border-radius:3px;background:rgba(240,229,218,.22);transition:width .3s var(--mgc-ease,ease),background-color .3s ease}
.mg-tour-dots i[data-on]{width:18px;background:var(--mgc-red,#c8323c)}
.mg-tour-nav{display:flex;gap:8px}
.mg-tour-nav button{appearance:none;font:inherit;font-size:13px;height:32px;padding:0 14px;border-radius:999px;cursor:pointer;transition:filter .16s ease,background-color .16s ease,transform .12s ease}
.mg-tour-nav button:active{transform:scale(.97)}
.mg-tour-prev{border:1px solid rgba(240,229,218,.16);background:transparent;color:var(--mgc-ink-2,#b8a69a)}
.mg-tour-prev:hover{background:rgba(255,255,255,.05);color:var(--mgc-ink,#f0e5da)}
.mg-tour-prev[hidden]{display:none}
.mg-tour-next{border:0;color:#fff;background:linear-gradient(180deg,var(--mgc-red-hi,#d94550),var(--mgc-red,#c8323c));box-shadow:0 0 18px rgba(200,50,60,.45),inset 0 1px 0 rgba(255,255,255,.18)}
.mg-tour-next:hover{filter:brightness(1.08)}
.mg-tour-next::after{content:" ✦";font-size:11px}
.mg-tour :focus-visible{outline:var(--mgc-focus,2px solid #d6a434);outline-offset:2px}
@media (prefers-reduced-motion: reduce){.mg-tour-ring,.mg-tour-card,.mg-tour-dots i{transition:none}}`;
 document.head.append(css);
 const PAD=6;
 let cur=null;
 const dialog=()=>document.querySelector('.tomoyo-cn-dialog[open]');
 const visible=el=>{if(!el||el.closest('[hidden]'))return null;
  /* the capsule is laid out at its open size and clipped: light the shape that is drawn */
  if(el.id==='mg-cap'){const c=window.__megulitCapsule?.rect?.();if(!c||c.w<4||c.h<4)return null;return {left:c.x,top:c.y,width:c.w,height:c.h,right:c.x+c.w,bottom:c.y+c.h};}
  const r=el.getBoundingClientRect();if(r.width<4||r.height<4)return null;
  const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none'||Number(cs.opacity)===0)return null;return r;};
 /* each target group: the first selector that is on screen */
 const findTargets=s=>s.target.map(group=>{for(const sel of group)for(const el of document.querySelectorAll(sel)){const r=visible(el);if(r)return {sel,el,r};}return null;}).filter(Boolean);
 function setMenu(s){
  const open=!!dialog();
  if(s.menu==='open'&&!open){bridge().toggleGalMenu?.();cur.opened=true;}
  else if(s.menu==='close'&&open&&cur.opened){bridge().toggleGalMenu?.();cur.opened=false;}
  if(s.tab)setTimeout(()=>{const b=dialog()?.querySelector('.tomoyo-menu-tabs [data-menu-key="'+s.tab+'"]');if(b&&b.getAttribute('aria-selected')!=='true')b.click();},s.menu==='open'&&!open?260:0);
 }
 function build(){
  const root=document.createElement('div');root.className='mg-tour';root.dataset.noI18n='';
  root.innerHTML='<svg class="mg-tour-dim" aria-hidden="true"><path fill-rule="evenodd"/></svg><div class="mg-tour-rings"></div>'+
   '<section class="mg-tour-card" role="dialog" aria-live="polite"><header><span class="mg-tour-kicker"></span><button type="button" class="mg-tour-skip"></button></header>'+
   '<figure class="mg-tour-shot"><img alt="" decoding="async"></figure><h4 class="mg-tour-title"></h4><p class="mg-tour-body"></p><p class="mg-tour-note" hidden></p>'+
   '<footer><div class="mg-tour-dots" aria-hidden="true">'+O.STEPS.map(()=>'<i></i>').join('')+'</div><div class="mg-tour-nav"><button type="button" class="mg-tour-prev"></button><button type="button" class="mg-tour-next"></button></div></footer></section>';
  root.querySelector('.mg-tour-skip').onclick=()=>{if(cur?.index===O.STEPS.length-1&&!cur.auto)end();else{write(O.stop(read()));end();}};
  root.querySelector('.mg-tour-prev').onclick=()=>go(cur.index-1);
  root.querySelector('.mg-tour-next').onclick=()=>cur.index>=O.STEPS.length-1?end():go(cur.index+1);
  root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();end();}else if(e.key==='ArrowRight')go(cur.index+1);else if(e.key==='ArrowLeft')go(cur.index-1);});
  document.body.append(root);return root;
 }
 function paint(){
  if(!cur)return;const s=O.step(lang(),cur.index),root=cur.root,card=root.querySelector('.mg-tour-card'),last=cur.index===O.STEPS.length-1;
  card.dataset.step=s.id;card.setAttribute('aria-label',s.title);
  root.querySelector('.mg-tour-kicker').textContent='✦ '+w('kicker');
  /* on the last step the top button is 不再显示 for a tour that came by itself, and 关闭 for one the user opened */
  root.querySelector('.mg-tour-skip').textContent=last?(cur.auto?w('never'):w('close')):w('skip');
  const img=root.querySelector('.mg-tour-shot img');if(img.getAttribute('src')!==IMG(s.image))img.setAttribute('src',IMG(s.image));
  root.querySelector('.mg-tour-title').textContent=s.title;
  const keys=['menu','cover'].map(k=>O.hotkey(k)).filter(Boolean);
  root.querySelector('.mg-tour-body').innerHTML=keys.reduce((h,k)=>h.split(esc(k)).join('<kbd>'+esc(k)+'</kbd>'),esc(s.body));
  const note=root.querySelector('.mg-tour-note');note.hidden=!(cur.auto&&cur.index===0);note.textContent=O.fill(w('count'),{limit:O.LIMIT});
  root.querySelectorAll('.mg-tour-dots i').forEach((d,i)=>{if(i===cur.index)d.dataset.on='';else delete d.dataset.on;});
  const prev=root.querySelector('.mg-tour-prev');prev.textContent=w('prev');prev.hidden=cur.index===0;
  root.querySelector('.mg-tour-next').textContent=last?w('done'):w('next');
  place();
 }
 function place(){
  if(!cur)return;const s=O.STEPS[cur.index],root=cur.root,W=innerWidth,H=innerHeight,found=findTargets(s);
  const rects=found.map(t=>({sel:t.sel,x:t.r.left-PAD,y:t.r.top-PAD,w:t.r.width+PAD*2,h:t.r.height+PAD*2}));
  const svg=root.querySelector('.mg-tour-dim');svg.setAttribute('viewBox','0 0 '+W+' '+H);
  const hole=r=>{const k=Math.min(12,r.w/2,r.h/2);return 'M'+(r.x+k)+' '+r.y+'H'+(r.x+r.w-k)+'Q'+(r.x+r.w)+' '+r.y+' '+(r.x+r.w)+' '+(r.y+k)+'V'+(r.y+r.h-k)+'Q'+(r.x+r.w)+' '+(r.y+r.h)+' '+(r.x+r.w-k)+' '+(r.y+r.h)+
   'H'+(r.x+k)+'Q'+r.x+' '+(r.y+r.h)+' '+r.x+' '+(r.y+r.h-k)+'V'+(r.y+k)+'Q'+r.x+' '+r.y+' '+(r.x+k)+' '+r.y+'Z';};
  svg.querySelector('path').setAttribute('d','M0 0H'+W+'V'+H+'H0Z'+rects.map(hole).join(''));
  const box=root.querySelector('.mg-tour-rings');
  while(box.children.length>rects.length)box.lastChild.remove();while(box.children.length<rects.length){const d=document.createElement('div');d.className='mg-tour-ring';box.append(d);}
  rects.forEach((r,i)=>{const d=box.children[i];d.dataset.target=r.sel;Object.assign(d.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});});
  /* the card goes beside the first lit place: below, above, left, right, whichever fits; centred when nothing is lit */
  const card=root.querySelector('.mg-tour-card'),cw=card.offsetWidth,ch=card.offsetHeight,G=16,M=16;
  const clampX=x=>Math.min(Math.max(M,x),W-cw-M),clampY=y=>Math.min(Math.max(M,y),H-ch-M);
  let x=(W-cw)/2,y=(H-ch)/2;
  if(rects.length){const all=rects.reduce((a,r)=>({x:Math.min(a.x,r.x),y:Math.min(a.y,r.y),r:Math.max(a.r,r.x+r.w),b:Math.max(a.b,r.y+r.h)}),{x:1e9,y:1e9,r:-1e9,b:-1e9});
   const t=rects[0],cx=t.x+t.w/2,cy=t.y+t.h/2;
   const options=[[clampX(cx-cw/2),all.b+G,H-all.b-G>=ch+M],[clampX(cx-cw/2),all.y-G-ch,all.y-G-ch>=M],[all.x-G-cw,clampY(cy-ch/2),all.x-G-cw>=M],[all.r+G,clampY(cy-ch/2),W-all.r-G-cw>=M]];
   /* with the menu open the card sits beside the menu, never over it */
   const d=dialog()?.getBoundingClientRect();if(d&&d.width)options.unshift([d.left-G-cw,clampY(cy-ch/2),d.left-G-cw>=M],[d.right+G,clampY(cy-ch/2),W-d.right-G-cw>=M]);
   const fit=options.find(o=>o[2]);if(fit){x=fit[0];y=fit[1];}else{x=clampX(x);y=clampY(y);}}
  card.style.left=Math.round(x)+'px';card.style.top=Math.round(y)+'px';
 }
 function go(i){
  if(!cur||i<0||i>=O.STEPS.length)return;cur.index=i;setMenu(O.STEPS[i]);window.__megulitCapsule?.hold?.(O.STEPS[i].capsule||'');paint();
  /* the menu opens with a short animation: follow it for a moment */
  clearInterval(cur.follow);let n=0;cur.follow=setInterval(()=>{place();if(++n>12)clearInterval(cur.follow);},60);
 }
 function start({auto=false}={}){
  if(document.body.classList.contains('tome-style-probing'))return false;
  if(cur)end({keepMenu:true});
  cur={index:0,auto,opened:false,root:build(),tick:setInterval(()=>{place();if(document.body.classList.contains('tome-style-probing'))end();},400)};
  if(!reduce?.matches){cur.root.animate?.([{opacity:0},{opacity:1}],{duration:220,easing:'ease-out'});}
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
 function headerButton(){const head=document.querySelector('.tomoyo-cn-dialog .tomoyo-menu-header');if(!head||head.querySelector('.tome-menu-tour'))return;
  const b=document.createElement('button');b.type='button';b.className='tome-menu-tour';b.dataset.noI18n='';b.textContent=w('again');b.title=w('againTip');b.setAttribute('aria-label',w('againTip'));
  b.onclick=e=>{e.preventDefault();start();};head.insertBefore(b,head.querySelector('.tome-menu-close'));}
 const hs=document.createElement('style');hs.textContent='.tome-menu-tour{appearance:none;position:absolute;top:14px;right:56px;z-index:1;font:inherit;font-size:12px;line-height:1;padding:5px 11px;border-radius:999px;border:1px solid rgba(240,229,218,.16);background:transparent;color:var(--mgc-ink-2,#b8a69a);cursor:pointer;transition:color .16s ease,border-color .16s ease}.tome-menu-tour:hover{color:var(--mgc-ink,#f0e5da);border-color:rgba(240,229,218,.34)}';document.head.append(hs);
 new MutationObserver(headerButton).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});headerButton();
 window.addEventListener('tome-language-change',()=>{const b=document.querySelector('.tome-menu-tour');if(b){b.textContent=w('again');b.title=w('againTip');}if(cur)paint();});
 window.addEventListener('megulit-hotkeys-changed',()=>{if(cur)paint();});
 window.addEventListener('resize',()=>place());
 window.__megulitTour={start,end,state:()=>cur?{index:cur.index,step:O.STEPS[cur.index].id,auto:cur.auto}:null};
})();
