// SPDX-License-Identifier: GPL-3.0-or-later
/* A line is drawn once (user, 2026-11-19: 「所有游戏都禁止复读」). Shared by the hook source path (core/hook-native.cjs) and the
   reader (web/reader/modules/hook-reader.js); the two files are kept byte-identical (validation/line-once.test.cjs).
   2026-11-19 (千恋＊万花 CHAPTER 1-1): KiriKiri TextRender sent 「志那都荘まで行って欲しいんですけど」 as one frame holding the
   sentence six times, base text and ruby-reading text (「しなつ荘…」) alternating, and the reader drew all six.
   - variant(a,b): the same sentence, equal or differing only where one side has kanji and the other the kana reading
     (ruby base vs ruby reading; one or more places).
   - collapse(text): a frame of whole sentences in which runs of the same sentence (or the whole run of sentences repeated)
     become one copy; the kanji form wins and every kanji/kana difference becomes a ruby pair.
   - stripStageNotes(text): script stage notes (■自動車（車内／走行）) that come through the dialogue stream. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TomeLineOnce=api;})(typeof window==='object'?window:this,function(){
 'use strict';
 const KANJI=/[々〆〻㐀-䶿一-鿿豈-﫿]/;
 const KANA=/[ぁ-ゖァ-ヺーゝゞヽヾ]/;
 const key=s=>String(s||'').replace(/[\s　]+/g,'');
 /* align a against b; a kanji run (1..n characters) on one side may stand for a kana run (1..4n+2) on the other */
 function align(a,b){
  const A=[...a],B=[...b],memo=new Map(),pairs=[];
  const go=(i,j)=>{
   if(i===A.length&&j===B.length)return [];if(i===A.length||j===B.length)return null;
   const k=i*4096+j;if(memo.has(k))return memo.get(k);let out=null;
   if(A[i]===B[j]){const r=go(i+1,j+1);if(r)out=r;}
   if(!out)for(const [X,Y,x,y,flip] of [[A,B,i,j,false],[B,A,j,i,true]]){
    if(!KANJI.test(X[x])||!KANA.test(Y[y]))continue;
    let kn=0;while(x+kn<X.length&&KANJI.test(X[x+kn]))kn++;let rn=0;while(y+rn<Y.length&&KANA.test(Y[y+rn]))rn++;
    for(let n=kn;n>=1&&!out;n--)for(let m=Math.min(rn,4*n+2);m>=1&&!out;m--){
     const r=flip?go(i+m,j+n):go(i+n,j+m);if(r)out=[[X.slice(x,x+n).join(''),Y.slice(y,y+m).join('')],...r];}
    if(out)break;}
   memo.set(k,out);return out;};
  const r=go(0,0);if(r)pairs.push(...r);return r?pairs:null;}
 function variant(a,b){const x=key(a),y=key(b);if(!x||!y)return false;if(x===y)return true;if(Math.abs(x.length-y.length)>Math.max(x.length,y.length)*0.75)return false;const p=align(x,y);return !!p&&p.length>0&&p.length*2<=Math.max(x.length,y.length);}
 /* the copy to keep: most kanji (the base text); readings it covers become ruby pairs */
 function pick(units){let best=units[0],score=-1;for(const u of units){const s=[...u].filter(c=>KANJI.test(c)).length;if(s>score){score=s;best=u;}}const ruby=[];for(const u of units){if(key(u)===key(best))continue;const p=align(key(best),key(u));if(p)for(const [base,reading] of p)if(KANJI.test(base)&&!KANJI.test(reading)&&!ruby.some(q=>q[0]===base))ruby.push([base,reading]);}return {text:best,ruby};}
 /* whole sentences: up to and including a closing bracket or sentence stop (with what follows it of the same kind) */
 function units(text){const out=[];const re=/[^」』）)。！？!?…]*(?:[」』）)。！？!?…]+|$)/gu;let m;while((m=re.exec(text))&&m[0]){out.push(m[0]);if(re.lastIndex>=text.length)break;}return out;}
 const real=u=>key(u).replace(/[「『」』（）()。、！？!?…‥・～〜ー―\-]/g,'').length;
 /* 2026-11-19 (千恋＊万花 【芦花】「で？　１人？」: the frame held the line twice and the start of a third; split at its inner ？ the
    pieces 「で？」 were too short to count as a repeat and the reader drew 「で？　１人？」「で？): one whole sentence (ending in a
    closing bracket or stop, 3+ letters) drawn two or more times, character for character, maybe followed by the start of
    another copy, is that sentence once */
 function period(text){const c=[...text];for(let p=1;p*2<=c.length;p++){if(!/[」』）)。！？!?…]/.test(c[p-1])||/[」』）)。！？!?…]/.test(c[p]))continue;let ok=true;for(let i=p;i<c.length&&ok;i++)ok=c[i]===c[i%p];if(!ok)continue;const one=c.slice(0,p).join('');if(real(one)>=3)return one;}return '';}
 function collapse(input,{min=3}={}){
  const text=String(input||''),one=period(text.replace(/[\s　]+$/,''));if(one){const r=collapse(one,{min});return {text:r.text,ruby:r.ruby,collapsed:true,doubled:real(one)>=3||r.doubled};}const u=units(text);if(u.length<2)return {text,ruby:[],collapsed:false};
  /* a run of one sentence (redraw, base/reading pair) is one copy; a short exact repeat (「うん」「うん」) needs 3+ letters */
  const same=(a,b)=>variant(a,b)&&(key(a)!==key(b)||real(b)>=3);
  const runs=[];for(const s of u){const last=runs[runs.length-1];if(last&&same(last[0],s))last.push(s);else runs.push([s]);}
  let groups=runs;
  /* the whole run of sentences drawn again (A B A B) */
  for(let p=1;p<=groups.length/2;p++){if(groups.length%p)continue;let ok=true;for(let i=p;i<groups.length&&ok;i++)ok=same(groups[i%p][0],groups[i][0]);if(ok){const merged=groups.slice(0,p).map(g=>g.slice());for(let i=p;i<groups.length;i++)merged[i%p].push(...groups[i]);groups=merged;break;}}
  /* #1128 (死に逝く君、館に芽吹く憎悪, skip: 「……焼き過ぎたか」「……焼き過ぎたか」消し炭に…): a group of sentences drawn twice in a row inside a
     longer frame is one copy. The quote splits at its 「…」 into a piece with no letters, so the 3-letter rule counts the whole group.
     A frame that holds a sentence of 3+ letters drawn twice is a redraw frame: its short doubled groups (「んっ……？」, 「……」) are redraws
     too. min: core/hook-native.cjs lowers it to 0 for a stream that has been drawing its lines twice; doubled tells it this frame did */
  let doubled=runs.some(r=>r.length>1&&real(r[0])>=3);
  const fold=lim=>{for(let i=0;i<groups.length;i++)for(let p=1;i+2*p<=groups.length;p++){let ok=true;for(let k=0;k<p&&ok;k++)ok=variant(groups[i+k][0],groups[i+p+k][0]);
   const n=real(groups.slice(i,i+p).map(g=>g[0]).join(''));if(!ok||n<lim)continue;if(n>=3)doubled=true;groups=groups.map(g=>g.slice());for(let k=0;k<p;k++)groups[i+k].push(...groups[i+p+k]);groups.splice(i+p,p);p=0;}};
  fold(min);if(doubled&&min>0)fold(0);
  /* a trailing piece that is only the start of a sentence already there (typewriter frame) */
  {const last=groups[groups.length-1];if(groups.length>1&&last.length===1){const t=key(last[0]);if(t&&u.slice(0,-1).some(s=>{const k=key(s);if(k.length>t.length&&k.startsWith(t))return true;if(/[」』）)。！？!?…]$/.test(t))return false;for(let n=Math.max(1,t.length-4);n<=Math.min(k.length-1,t.length+4);n++)if(k.slice(0,n)===t||variant(k.slice(0,n),t))return true;return false;}))groups=groups.slice(0,-1);}}
  if(groups.length===u.length)return {text,ruby:[],collapsed:false,doubled:false};
  const ruby=[];const parts=groups.map(g=>{const r=pick(g);for(const q of r.ruby)if(!ruby.some(x=>x[0]===q[0]))ruby.push(q);return r.text;});
  return {text:parts.join(''),ruby,collapsed:true,doubled};}
 /* ■ stage notes of the script (scene / sound cues): ■label（detail） or ■label before a quote, another note or the end; a
    note cut at the frame start (車／ドア開ける（車内）) goes when the frame also held a whole one */
 function stripStageNotes(input){const text=String(input||'');if(!/[■□◆]/.test(text))return text;
  let found=false;let out=text.replace(/[■□◆][^「『」』。、！？!?…■□◆\n（）()]{1,24}(?:（[^（）\n]{0,30}(?:）|$)|(?=[■□◆「『]|$))/gu,()=>{found=true;return '';});
  if(found)out=out.replace(/^[^「『」』。、！？!?…\s（）]{1,24}（[^（）\n]{0,30}）/u,'');
  return found?out.replace(/^[\s　]+/,''):text;}
 /* 2026-11-19 (死に逝く君、館に芽吹く憎悪, Ctrl skip: 「謎の男謎の男謎の男謎の男美亜美亜」): name frames glued while skipping. A frame made
    only of two or more runs of different short names (2-8 characters, each with kanji or katakana), every run drawn two or
    more times, stands for its last name; '' when it is not one (「うんうん」「そうそうだね」 stay lines). */
 function nameStack(input){const t=key(input);if(!t||t.length>64||/[「『」』（）()。、！？!?…‥・ー―]/.test(t))return '';
  const named=u=>/[ァ-ヺ々〆一-鿿]/.test(u);
  const go=(i,runs)=>{if(i===t.length)return runs.length>=2?runs:null;
   for(let L=2;L<=Math.min(8,t.length-i);L++){const u=t.slice(i,i+L);if(!named(u))continue;let k=1;while(t.startsWith(u,i+k*L))k++;if(k<2)continue;
    if(runs.length&&runs[runs.length-1][0]===u)continue;const r=go(i+k*L,[...runs,[u,k]]);if(r)return r;}
   return null;};
  const runs=go(0,[]);return runs?runs[runs.length-1][0]:'';}
 return {variant,collapse,stripStageNotes,key,nameStack};
});
