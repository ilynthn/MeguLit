/* 2026-11-13 (user) the embed badge explains itself in a house panel instead of the browser's plain title tooltip:
   status line with a dot, then 引擎 / 原理 / 确认方法 rows. The badge sits right above the game title, so the floating
   panel is placed under the title (never over it) and points back up to the badge. Hover or keyboard focus opens it;
   leaving, blur, Esc or scrolling closes it. */
export function attachEmbedPopover(badge,embed,esc){if(!badge||!embed?.parts)return;const p=embed.parts;
 badge.removeAttribute('title');document.getElementById('embed-pop')?.remove();
 const pop=document.createElement('div');pop.id='embed-pop';pop.className='embed-pop';pop.setAttribute('role','tooltip');pop.dataset.kind=embed.kind;pop.hidden=true;
 pop.innerHTML=`<p class="embed-pop-title"><i aria-hidden="true"></i>${esc(embed.label)}</p><p class="embed-pop-status">${esc(p.status)}</p>`+
  `<dl><dt>${esc(p.engineLabel)}</dt><dd>${esc(p.engine)}</dd><dt>${esc(p.howLabel)}</dt><dd>${esc(p.how)}</dd><dt>${esc(p.checkLabel)}</dt><dd>${esc(p.check)}</dd></dl>`;
 document.body.append(pop);
 const title=()=>badge.closest('.detail-title')?.querySelector('h1');
 const place=()=>{const r=badge.getBoundingClientRect(),h=title()?.getBoundingClientRect(),w=pop.offsetWidth,left=Math.max(12,Math.min(r.left,innerWidth-w-12));
  pop.style.left=left+'px';pop.style.top=Math.round((h&&h.bottom>r.bottom?h.bottom:r.bottom)+10)+'px';};
 let timer=0;const open=()=>{clearTimeout(timer);if(!pop.isConnected)return;pop.hidden=false;place();badge.classList.add('is-explained');requestAnimationFrame(()=>pop.classList.add('is-open'));};
 const close=(now=false)=>{clearTimeout(timer);const done=()=>{pop.classList.remove('is-open');badge.classList.remove('is-explained');setTimeout(()=>{if(!pop.classList.contains('is-open'))pop.hidden=true;},200);};now?done():timer=setTimeout(done,160);};
 badge.addEventListener('mouseenter',()=>{clearTimeout(timer);timer=setTimeout(open,120);});badge.addEventListener('mouseleave',()=>close());
 pop.addEventListener('mouseenter',()=>clearTimeout(timer));pop.addEventListener('mouseleave',()=>close());
 badge.addEventListener('focus',open);badge.addEventListener('blur',()=>close(true));badge.addEventListener('keydown',e=>{if(e.key==='Escape')close(true);});
 (badge.closest('#main')||window).addEventListener('scroll',()=>close(true),{passive:true});
 /* the page is replaced on navigation: drop the floating panel with it */
 new MutationObserver((_,obs)=>{if(!badge.isConnected){pop.remove();obs.disconnect();}}).observe(document.body,{childList:true,subtree:true});}
