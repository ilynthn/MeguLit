/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 学习 → 奖励 (2026-11-11, user: 多给点正向反馈，惠惠的夸奖要真实出现过): 惠惠's stamp when a lesson is learned or a stage
   is cleared, floating +魔力 on every right answer, a title bar, and the 战利品. The quoted lines are short lines
   Megumin says in この素晴らしい世界に祝福を！ (TV series and the film 紅伝説), each with where it is from, drawn at
   random so they do not repeat often. */
import {exAttr} from './example-ruby.js';
export const QUOTES={
 praise:[['ナイス爆裂','TV 1期 4話'],['最高…です','TV 1期 4話'],['カズマも爆裂道が分かってきましたね','TV 1期 4話'],['やる時はやる人だと思ってましたよ！','TV 3期 10話'],['任せて下さい！','TV 3期 5話'],['見ましたか、我が奥義・爆裂魔法を！','映画 紅伝説'],['真打ち登場！','映画 紅伝説'],['み・な・ぎ・る、フォー！','映画 紅伝説'],['少なく見積もっても120点でしたよ、今日の爆裂は！','映画 紅伝説'],['竜殺しの二つ名はいただきです！','TV 3期 7話']],
 clear:[['エクスプロージョン！','TV 1期 2話'],['我が名はめぐみん！','映画 紅伝説'],['紅魔族随一にして、最強の魔法使い！','映画 紅伝説'],['私が、真の爆裂魔法を見せてあげましょう！','TV 1期 10話'],['どんな不可能も可能にする、最強の魔法なんです','映画 紅伝説'],['我々は、魔王も恐れる紅魔族ですよ','映画 紅伝説'],['吹けよ嵐、響けよ爆炎','映画 紅伝説'],['本物の爆裂魔法を！','TV 1期 10話']],
 cheer:[['私は誰にも負けたくないのです！','TV 1期 10話'],['さあ、私と一緒に爆裂道を歩もうじゃないですか！','TV 1期 3話'],['いつか…200点満点の爆裂魔法を','TV 3期 1話'],['私達は、仲間じゃないですか','TV 1期 8話'],['友人というものは、苦難も分かち合うものだと思います','TV 2期 2話'],['ネタ魔法の破壊力を久しぶりに見せつけてあげます','映画 紅伝説']]
};
let last='';
export function quote(kind){const list=QUOTES[kind]||QUOTES.praise;let q;for(let i=0;i<4;i++){q=list[Math.floor(Math.random()*list.length)];if(q[0]!==last)break;}last=q[0];return q;}
const calm=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE='cubic-bezier(.16,1,.3,1)';
/* +N 魔力 floating up from where it was earned */
export function floatGain(anchor,r){if(!anchor||!r?.gained)return;const box=anchor.getBoundingClientRect(),el=document.createElement('span');el.className='rw-float';el.textContent=`+${r.gained} 魔力${r.bonus?` · 连对 +${r.bonus}`:''}`;el.style.left=`${box.left+box.width/2}px`;el.style.top=`${box.top}px`;document.body.appendChild(el);
 if(calm()){setTimeout(()=>el.remove(),900);return;}el.animate([{opacity:0,transform:'translate(-50%,0) scale(.8)'},{opacity:1,transform:'translate(-50%,-18px) scale(1)',offset:.25},{opacity:0,transform:'translate(-50%,-56px)'}],{duration:1100,easing:EASE}).finished.then(()=>el.remove(),()=>el.remove());}
/* 惠惠's stamp: a lesson learned (kind praise) or a stage cleared (kind clear, with STAGE CLEAR) */
export function stamp({kind='praise',title='',sub='',r=null,esc=s=>String(s)}={}){
 const q=quote(kind),big=kind==='clear';const fx=document.createElement('div');fx.className='rw-fx'+(big?' big':'');
 fx.innerHTML=`<div class="rw-bg"></div>${big?'<div class="rw-lines"></div>':''}<div class="rw-core">${title?`<span class="rw-no">${esc(title)}</span>`:''}${big?'<div class="rw-big">STAGE <em>CLEAR</em></div>':''}<span class="rw-stamp">${big?'爆裂':'掌握'}</span><div class="rw-quote"><span data-q></span><small>めぐみん · ${esc(q[1])}</small></div>${r?`<div class="rw-gain">魔力 <b>+${r.gained}</b> · ${esc(r.title)}${r.levelUp?` · <b>称号升级！</b>`:''}${r.next?` · 距「${esc(r.nextTitle)}」还差 ${r.next-r.mana}`:''}</div>`:''}${sub?`<div class="rw-sub">${esc(sub)}</div>`:''}</div><span class="rw-hint">点击继续</span>`;
 document.body.appendChild(fx);const $=s=>fx.querySelector(s),qt=$('[data-q]');
 const close=()=>{removeEventListener('keydown',key);if(calm()){fx.remove();return;}fx.animate([{opacity:1},{opacity:0}],{duration:200}).finished.then(()=>fx.remove());},key=e=>{if(e.key==='Escape'||e.key==='Enter')close();};
 fx.onclick=close;addEventListener('keydown',key);setTimeout(()=>{if(fx.isConnected&&!big)close();},4200);
 if(calm()){qt.textContent=q[0];return;}
 $('.rw-bg').animate([{opacity:0},{opacity:1}],{duration:180,fill:'forwards'});
 /* 2026-11-13 user: no full-screen white flash (photosensitive, sudden) — the page settles in with a soft zoom instead */$('.rw-core').animate([{opacity:0,transform:'scale(1.06)'},{opacity:1,transform:'none'}],{duration:420,delay:120,easing:EASE,fill:'backwards'});
 if(big){$('.rw-lines').animate([{opacity:0,transform:'translate(-50%,-50%) scale(.3)'},{opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(12deg)',offset:.4},{opacity:.25,transform:'translate(-50%,-50%) scale(1.1) rotate(20deg)'}],{duration:1500,delay:150,easing:EASE,fill:'forwards'});
  $('.rw-big').animate([{opacity:0,transform:'scale(2.4)',filter:'blur(18px)'},{opacity:1,transform:'scale(.96)',filter:'none',offset:.7},{transform:'none'}],{duration:600,delay:200,easing:EASE,fill:'backwards'});}
 $('.rw-stamp').animate([{opacity:0,transform:'rotate(-14deg) scale(3)'},{opacity:1,transform:'rotate(-14deg) scale(.9)',offset:.75},{transform:'rotate(-14deg) scale(1)'}],{duration:360,delay:big?900:200,easing:'cubic-bezier(.5,0,.75,0)',fill:'backwards'});
 $('.rw-core').animate([{transform:'none'},{transform:'translate(-7px,5px)'},{transform:'translate(5px,-3px)'},{transform:'none'}],{duration:200,delay:big?1180:480});
 $('.rw-quote').animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:400,delay:big?1300:560,easing:EASE,fill:'backwards'});
 const full=[...q[0]];qt.textContent='▮';setTimeout(()=>{let n=0;const tick=()=>{n++;qt.textContent=full.slice(0,n).join('')+(n<full.length?'▮':'');if(n<full.length)setTimeout(tick,50);};tick();},big?1400:640);
}
/* the title bar under the HUD */
export function manaHTML(r,esc){if(!r)return '';const span=r.next?Math.max(1,r.next-r.floor):1,pct=r.next?Math.min(100,Math.round((r.mana-r.floor)/span*100)):100;
 return `<div class="rw-bar"><span class="rw-rank">RANK ${String(r.rank).padStart(2,'0')}</span><b class="rw-title">${esc(r.title)}</b><span class="rw-meter"><i style="width:${pct}%"></i></span><span class="rw-mana">${r.mana}${r.next?` / ${r.next}`:''} 魔力</span><button type="button" class="rw-album-btn" data-album>战利品 <b>${r.album}</b></button></div>`;}
export function albumHTML(rows,{esc,readTime}){
 return `<button type="button" class="gm-link gm-back" data-back>← 课程列表</button><section class="rw-album"><header><span class="gm-tag"><i></i>megulit · line collection</span><h2>战利品</h2><p class="gm-cap">你在练习里答对过的、来自自己游戏的台词。每一句都是你亲手拿下的战利品。</p></header>${rows.length?`<ol class="rw-cards">${rows.map((x,i)=>`<li class="rw-card" style="--i:${i}"><span class="rw-card-no">No.${String(rows.length-i).padStart(3,'0')}</span><p class="gm-ja" lang="ja"${exAttr(x.text,x.ruby,esc)}>${esc(x.text)}</p>${x.translation?`<p class="gm-tr">${esc(x.translation)}</p>`:''}<span class="rw-card-meta">${esc(x.title||'')}${x.readAt?` · ${esc(readTime(x.readAt,'zh'))}`:''}</span></li>`).join('')}</ol>`:'<p class="rw-empty">还没有收藏。练习里答对一句来自你游戏的台词，它就会出现在这里。</p>'}</section>`;}
