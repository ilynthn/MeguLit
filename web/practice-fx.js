// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user): in every practice, a wrong answer is hit by Explosion (爆裂魔法) — the page is blown into a pit,
   chips fall out of it and fine cracks run from it — and a right answer brings Aqua's 花鳥風月 fountain, which mends the
   oldest pit. It only watches what the practices already show (the right / wrong marks on kana and grammar answers, the
   Again / Good / Easy buttons of the review) and only reacts within a moment of the learner's own click or key. */
import {fxPref} from './fx-prefs.js';
import {calm,NS,scarMarkup,debris,explosion,fountain} from './burst-fx.js';
const WRONG='.wrong,.miss,.gm-blank.bad',RIGHT='.right,.hit,.gm-blank.ok',MAX=6;
let lastInput=0,queued=null,lastPoint=null;
const recent=()=>performance.now()-lastInput<1600;
addEventListener('pointerdown',e=>{lastInput=performance.now();lastPoint={x:e.clientX,y:e.clientY};},true);
addEventListener('keydown',()=>{lastInput=performance.now();},true);

const hostOf=el=>{const root=el.getRootNode();return root instanceof ShadowRoot?root.host:el;};
const scope=el=>hostOf(el).closest('#learning-content')||hostOf(el).closest('.main')||document.body;
const inPractice=el=>el.getRootNode() instanceof ShadowRoot?!!hostOf(el).closest('.kana-host')||hostOf(el).classList.contains('kana-host'):/(^|\s)gm-/.test(el.className||'')||!!el.closest?.('[class*="gm-"]');
function scarsOf(box){
 let svg=box.querySelector(':scope>svg.fx-scars');
 if(!svg){svg=document.createElementNS(NS,'svg');svg.setAttribute('class','fx-scars');svg.setAttribute('aria-hidden','true');box.classList.add('has-fx-scars');box.append(svg);}
 svg.setAttribute('width',box.scrollWidth);svg.setAttribute('height',box.scrollHeight);svg.setAttribute('viewBox',`0 0 ${box.scrollWidth} ${box.scrollHeight}`);
 return svg;
}
function center(el){const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}
async function blast(el){
 const pref=fxPref('explosion');if(!pref.on)return;
 const box=scope(el),c0=center(el),er0=el.getBoundingClientRect(),hitP=lastPoint&&lastPoint.x>=er0.left-4&&lastPoint.x<=er0.right+4&&lastPoint.y>=er0.top-4&&lastPoint.y<=er0.bottom+4?lastPoint:c0,{x,y}=hitP;
 await explosion(x,y,{shake:box,bar:document.querySelector('header.titlebar'),k:pref.k});
 if(!box.isConnected)return;
 const svg=scarsOf(box),b=box.getBoundingClientRect(),seed=Math.floor(Math.random()*2147483646)+1;
 const g=document.createElementNS(NS,'g');g.setAttribute('class','fx-scar');
 const R=18+Math.random()*10;
 const cx=(x-b.left).toFixed(1),cy=(y-b.top).toFixed(1),gid='sc'+seed;
 g.innerHTML=scarMarkup(seed,x-b.left,y-b.top,R,R*1.6+Math.random()*30,6+Math.floor(Math.random()*3))+`<circle class="fx-water" cx="${cx}" cy="${cy}" r="0"/>`;g.classList.add('is-hot');setTimeout(()=>g.classList.remove('is-hot'),2600);
 svg.append(g);
 const all=[...svg.querySelectorAll('g.fx-scar:not(.is-gone)')];while(all.length>MAX)mend(all.shift(),true);
 debris(x,y+R*.4,{n:16,spread:1.3,up:.9,tint:'ash'});
}
/* 2026-11-12 (user: the healing must fill the pit and every crack, not a circle): water runs along each crack from the
   pit outward, segment after segment; the pit fills to its own ragged outline from the centre; petals settle along the
   cracks; then pit, cracks and water fade together and the surface is whole again */
function mend(g,fast=false){
 if(g.classList.contains('is-gone'))return;g.classList.add('is-gone');
 const ns='http://www.w3.org/2000/svg',flow=document.createElementNS(ns,'g');flow.setAttribute('class','fx-heal');g.append(flow);
 const pit=g.querySelector('.fx-pit'),cracks=[...g.querySelectorAll('.fx-crack')],T=fast?260:1;
 if(pit){const fill=pit.cloneNode();fill.setAttribute('class','fx-heal-pit');flow.append(fill);const bb=pit.getBBox(),ox=bb.x+bb.width/2,oy=bb.y+bb.height/2;fill.style.transformOrigin=`${ox}px ${oy}px`;
  fill.animate([{transform:'scale(0)',opacity:.95},{transform:'scale(1)',opacity:.95}],{duration:fast?T:520,easing:'cubic-bezier(.3,.7,.2,1)',fill:'forwards'});}
 cracks.forEach((c,i)=>{const w=c.cloneNode();w.setAttribute('class','fx-heal-crack');w.setAttribute('stroke-width',String(Math.max(1.4,+c.getAttribute('stroke-width')*1.6)));flow.append(w);
  w.animate([{strokeDashoffset:1},{strokeDashoffset:0}],{duration:fast?T:220,delay:fast?0:120+(i%6)*70+Math.floor(i/6)*40,easing:'ease-out',fill:'both'});});
 if(!fast){const pts=cracks.filter((_,i)=>i%3===0).slice(0,8);for(const c of pts){const b=c.getBBox(),r=g.ownerSVGElement.getBoundingClientRect();petal(r.left+b.x+b.width,r.top+b.y+b.height);}}
 setTimeout(()=>{g.animate([{opacity:1},{opacity:0}],{duration:fast?160:700,fill:'forwards'});setTimeout(()=>g.remove(),fast?180:720);},fast?T:1100);
}
function petal(x,y){if(document.querySelectorAll('.fx-petal').length>60)return;const p=document.createElement('i');p.className='fx-petal fx-heal-petal';p.textContent=['✿','❀','✾'][Math.floor(Math.random()*3)];p.style.cssText=`left:${x}px;top:${y}px`;
 let l=document.querySelector('body>.fx-layer');if(!l){l=document.createElement('div');l.className='fx-layer';document.body.append(l);}l.append(p);
 p.animate([{transform:'translate(-50%,-50%) scale(0) rotate(0)',opacity:0},{transform:'translate(-50%,-50%) scale(1) rotate(40deg)',opacity:1,offset:.4},{transform:`translate(calc(-50% + ${((Math.random()-.5)*30).toFixed(0)}px),calc(-50% - 18px)) scale(.7) rotate(90deg)`,opacity:0}],{duration:1200,delay:300+Math.random()*400,easing:'ease-out',fill:'both'});setTimeout(()=>p.remove(),1950);}
function bloom(el){
 const pref=fxPref('heal');if(!pref.on)return;
 const box=scope(el),{x,y}=center(el);
 fountain(x,y,pref.k);
 /* (user: one right answer mends every pit at once) all pits heal together, starting a little later the farther they
    are from the answer (a ripple, at most 300 ms apart) */
 const scars=[...box.querySelectorAll(':scope>svg.fx-scars g.fx-scar:not(.is-gone)')];if(!scars.length)return;
 const far=scars.map(g=>{const r=g.getBoundingClientRect();return Math.hypot(r.left+r.width/2-x,r.top+r.height/2-y);}),max=Math.max(1,...far);
 scars.forEach((g,i)=>setTimeout(()=>mend(g),300+far[i]/max*300));
}
function react(kind,el){
 if(!queued){queued={};requestAnimationFrame(()=>{const q=queued;queued=null;if(q.wrong)blast(q.wrong);else if(q.right)bloom(q.right);});}
 if(!queued[kind])queued[kind]=el;
}
function check(el,old){
 if(!(el instanceof Element)||!recent()||!inPractice(el))return;
 if(el.matches(WRONG)&&!(old&&/(^|\s)(wrong|miss|bad)(\s|$)/.test(old)))react('wrong',el);
 else if(el.matches(RIGHT)&&!(old&&/(^|\s)(right|hit|ok)(\s|$)/.test(old)))react('right',el);
}
function onMut(list){
 if(calm)return;
 for(const m of list){
  if(m.type==='attributes')check(m.target,m.oldValue||'');
  else for(const n of m.addedNodes){if(!(n instanceof Element))continue;check(n,'');if(recent())for(const c of n.querySelectorAll(`${WRONG},${RIGHT}`))check(c,'');watchShadows(n);}
 }
}
const OPTS={subtree:true,childList:true,attributes:true,attributeFilter:['class'],attributeOldValue:true};
const seen=new WeakSet();
function watchShadows(root){for(const h of (root.matches?.('.kana-host')?[root]:[]).concat([...(root.querySelectorAll?.('.kana-host')||[])]))if(h.shadowRoot&&!seen.has(h.shadowRoot)){seen.add(h.shadowRoot);new MutationObserver(onMut).observe(h.shadowRoot,OPTS);}}
new MutationObserver(onMut).observe(document.body,OPTS);
watchShadows(document.body);
/* the review: Again is a miss, Good and Easy are hits */
document.addEventListener('click',e=>{if(calm)return;const b=e.target.closest?.('.anki-rating');if(!b)return;if(b.classList.contains('rating-1'))blast(b);else if(b.matches('.rating-3,.rating-4'))bloom(b);},true);
