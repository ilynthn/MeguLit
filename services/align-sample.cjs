// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E496 (user, 2026-11-12: "from the old/original version we only want a Japanese script that lines up with the Chinese one,
   aligned automatically; translated games must pair 100%"). The structure check in original-text.cjs (same line count,
   same scenes, the lines a patch left in Japanese equal) proves the layout, not that Chinese line i says what Japanese
   line i says. This samples about 100 translated lines spread over the whole script and checks each pair on what a
   translation keeps: the kanji/hanzi both share, numbers and Latin words, ?!…「」 and the like, a speaker name in front,
   whether the line is a bare name, ruby folded to its base text, voice ids when the engine has them, and a length ratio.
   A pair is right when it scores better at its own place than one to three lines up or down (the timeline holds); a
   script whose samples prefer a shifted place has drifted. Then it is lined up again, scene by scene, by a banded
   anchor DP, sampled again and only then accepted; otherwise the import is refused as unreliable with the reason.
   Generic for every engine: it only reads the two line lists (and scene sizes when the reader knows them). */
const KANA=/[ぁ-ゖァ-ヺ]/g,HAN=/[一-鿿㐀-䶿豈-﫿]/g;
const japaneseLine=t=>{const k=(String(t).match(KANA)||[]).length,h=(String(t).match(HAN)||[]).length;return k>=2&&k>=h*.2;};
const prose=t=>/[^\x00-\x7f]/.test(t)&&!!String(t).trim();
const NAME_LINE=/^[【\[［(（]?[^「『（(\s。、]{1,16}[】\]］)）]$/;
const SPEAKER=/^[^「『（(\s。、…―]{1,16}(?=[「『（(])/u;
const SHIFTS=[-3,-2,-1,1,2,3];
/* ruby to its base text (≪base／reading≫, |base《reading》, [ruby text=…]base, <R reading>base</R>), tags and markup out */
function plain(t){return String(t||'').replace(/≪([^≪≫／]*)／[^≪≫]*≫/g,'$1').replace(/[|｜]([^《|｜]+)《[^》]*》/g,'$1').replace(/《[^》]*》/g,'')
 .replace(/<R[^>]*>([^<]*)<\/R>/gi,'$1').replace(/\[ruby[^\]]*\]/gi,'').replace(/<[^>]{0,40}>/g,'').replace(/\[[a-z_]+(?:\s[^\]]*)?\]/gi,'').replace(/\\[a-z]+/gi,'').replace(/%[a-zA-Z][^;%\n]{0,30};/g,'');}
const FW=s=>s.replace(/[０-９Ａ-Ｚａ-ｚ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0));
const PUNCT=[['q',/[?？]/],['e',/[!！]/],['ell',/[…‥]|\.\.\./],['quote',/[「『“"]/],['paren',/[（(]/],['dash',/[―—]{2}|ー{3}/],['tilde',/[～~〜]/]];
function features(raw,voice){
 const t=FW(plain(raw)).trim(),body=t.replace(/[\s　]+/g,'');
 const nameLine=NAME_LINE.test(t),speaker=(t.match(SPEAKER)||[''])[0];
 const han=new Set(body.replace(SPEAKER,'').match(HAN)||[]),nums=(body.match(/\d+/g)||[]).sort().join(','),latin=(t.match(/[A-Za-z]{2,}/g)||[]).map(s=>s.toLowerCase()).sort().join(',');
 const punct={};for(const [k,re] of PUNCT)punct[k]=re.test(body);
 const len=body.replace(/[「」『』（）()【】\[\]、。，．,.!！?？…‥―—ー～~〜♪♥☆★\s]/g,'').length;
 return {t,len,nameLine,speaker:!!speaker,han,nums,latin,punct,voice:voice||''};
}
const LN_RATIO=Math.log(.75);
/* How well a Chinese line (z) translates a Japanese line (j). Higher is better; about 0 means "no evidence either way". */
function score(z,j){
 if(!z||!j)return -2;
 if(z.voice&&j.voice)return z.voice===j.voice?4:-4;
 let s=0;
 if(z.nameLine!==j.nameLine)s-=1.5;else if(z.nameLine)s+=.5;
 if(z.speaker!==j.speaker)s-=.5;else if(z.speaker)s+=.2;
 if(z.han.size&&j.han.size){let both=0;for(const c of z.han)if(j.han.has(c))both++;s+=2.4*both/Math.min(z.han.size,j.han.size)-.3;}
 if(z.nums||j.nums)s+=z.nums===j.nums?1.2:-1;
 if(z.latin||j.latin)s+=z.latin===j.latin?1:-.8;
 for(const [k] of PUNCT){if(z.punct[k]&&j.punct[k])s+=k==='quote'?.4:.35;else if(z.punct[k]!==j.punct[k])s-=k==='quote'?.4:.25;}
 if(z.len&&j.len){const d=Math.abs(Math.log(z.len/j.len)-LN_RATIO);s+=.8-Math.min(1.6,d*1.1);}
 else if(z.len!==j.len)s-=.8;
 return s;
}
/* A Chinese line that is a translation: prose, not Japanese, not just the Japanese line again. */
const wording=t=>String(t||'').normalize('NFKC').replace(/[\p{P}\s]/gu,'');
/* OZMAFIA!! (夜鸮汉化) keeps the speaker's katakana name in front of the translated line, as the Japanese line has it
   (フーカ「天气真好……」 for フーカ「いいお天気……」): the Japanese test reads what follows a name both lines share. */
const spoken=(z,j)=>{const m=/^([^「『（(\s]{1,16})[「『（(]/.exec(typeof j==='string'?j:'');return m&&z.startsWith(m[1])?z.slice(m[1].length):z;};
const translated=(z,j)=>typeof z==='string'&&prose(z)&&!japaneseLine(spoken(z,j))&&/[一-鿿]/.test(z)&&wording(z)!==wording(j);
/* S9 a sound effect written out as a line: Chinese onomatopoeia characters only (咚, 喀啷喀啷, 啪唧, 喀啦啦啦……) or Japanese
   katakana only (ガチャ; not またか), no quote, at most 8 characters. A name (奥兹, 若い男) or a sentence (再一次——) is not one. */
const ONOMATOPOEIA=/^[咚咣喀啷哧扑啪唧嘎咯咔嚓唰叽磅刹啦呼砰嗖哗咕噗嘭轰叮当铃嘀哒嘟呜吱咻哐锵噔噼啵嗒咂沙哒呱嘶咻]+$/,KANA_ONLY=/^[ァ-ヺーッ]+$/;
const soundLike=f=>{if(!f||!f.len||f.len>8||f.punct.quote)return false;const b=f.t.replace(/[\s　、。，．,.!！?？…‥―—～~〜]/g,'');return ONOMATOPOEIA.test(b)||KANA_ONLY.test(b);};
const addedSound=z=>soundLike(features(z));
/* total / paired / unpaired with reasons over every translated line. S9: a line with no Japanese line that is a sound effect
   the translation spelled out, or that the aligner proved the translation added (added: indices), is the translation's
   own: counted in added {count,sound,line}, not in total / unpaired. */
function census(zh,ja,addedIdx,rewrittenIdx){
 let total=0,paired=0;const reasons={},own=new Set(addedIdx||[]),rewritten=new Set(rewrittenIdx||[]),added={count:0,sound:0,line:0,rewritten:0};
 for(let i=0;i<zh.length;i++){if(!translated(zh[i],ja[i]))continue;total++;const j=ja[i];
  /* an original line in Latin letters ("OK", "Hello World") is still that line's original */
  /* S9 a sound effect the translation spells out (咚, 喀啷喀啷) where the Japanese only plays a sound has no line to pair */
  const none=typeof j!=='string'||!j.trim();if(none&&(addedSound(zh[i])||own.has(i)||rewritten.has(i))){total--;added.count++;added[addedSound(zh[i])?'sound':own.has(i)?'line':'rewritten']++;continue;}
  /* rewritten (in added): a Chinese line beside Japanese lines the translation dropped or rewrote, its own content */
  const why=none?'no-japanese-line':'';
  if(why)reasons[why]=(reasons[why]||0)+1;else paired++;}
 return {total,paired,unpaired:total-paired,reasons,added};
}
/* Up to n sample positions spread evenly over the translated lines, deterministic (same script, same sample). */
function pick(zh,ja,n,keyed){
 const cand=[];for(let i=0;i<zh.length;i++)if(!keyed?.[i]&&translated(zh[i],ja[i])&&typeof ja[i]==='string'&&prose(ja[i]))cand.push(i);
 if(cand.length<=n)return cand;const out=[];for(let k=0;k<n;k++){const lo=Math.floor(k*cand.length/n),hi=Math.floor((k+1)*cand.length/n);let h=2166136261;for(const c of String(zh[cand[lo]]))h=Math.imul(h^c.charCodeAt(0),16777619);out.push(cand[lo+((h>>>0)%Math.max(1,hi-lo))]);}
 return out;
}
/* Sample n pairs and judge the pairing. */
function sample(zh,ja,{n=100,voice,keyed}={}){
 const at=pick(zh,ja,n,keyed),F=new Map(),f=(side,i)=>{const key=side+i;if(!F.has(key)){const lines=side==='z'?zh:ja;F.set(key,i<0||i>=lines.length||typeof lines[i]!=='string'||!lines[i].trim()?null:features(lines[i],voice?.[side==='z'?'zh':'ja']?.[i]));}return F.get(key);};
 let matched=0,mismatched=0,weak=0,own=0,shifted=0;const drift={},bad=[];
 for(const i of at){const z=f('z',i),s0=score(z,f('j',i));let best=-Infinity,bestK=0;
  for(const k of SHIFTS){const s=score(z,f('j',i+k));if(s>best){best=s;bestK=k;}}
  own+=s0;shifted+=SHIFTS.reduce((a,k)=>a+Math.max(-2,score(z,f('j',i+k))),0)/SHIFTS.length;
  if(best>s0+.8&&best>.6){mismatched++;drift[bestK]=(drift[bestK]||0)+1;if(bad.length<8)bad.push({index:i,zh:zh[i],ja:ja[i],better:bestK,shiftedJa:ja[i+bestK]});}
  else if(s0<-.5&&best<.4){weak++;if(bad.length<8)bad.push({index:i,zh:zh[i],ja:ja[i],better:0});}
  else matched++;}
 const sampled=at.length,rate=sampled?matched/sampled:null,contrast=sampled?(own-shifted)/sampled:0;
 const top=Object.entries(drift).sort((a,b)=>b[1]-a[1])[0],driftShift=top&&top[1]>=Math.max(4,sampled*.1)&&top[1]>=mismatched*.5?Number(top[0]):0;
 /* Calibrated on 22 real patch/original pairs (siglus, bgi, kirikiri, hunex, yuris, artemis, naninovel, …): right ones
    0.89–1.00 / contrast 1.1–2.7; one line shifted 0.23–0.49; another game's script 0.16–0.41 / contrast below 0.3.
    Loose translations make a few samples look better one line off, in no particular direction; drift is one direction.
    Fewer than 10 translated lines: nothing to judge on, the structure check alone decides. */
 const ok=sampled<10||rate>=.8&&contrast>=.5&&!driftShift;
 const reason=ok?'':driftShift?'offset-drift':contrast<.5?'unrelated-text':'pairs-mismatch';
 return {ok,reason,sampled,matched,mismatched,unrelated:weak,rate:rate===null?null:Math.round(rate*1000)/1000,contrast:Math.round(contrast*100)/100,driftShift,examples:bad};
}
/* Scene boundaries: given sizes, else windows of 400 lines (a flat table with no scenes, System4 MSG0). */
function segments(length,sizes){
 if(Array.isArray(sizes)&&sizes.reduce((a,b)=>a+b,0)===length){const out=[];let s=0;for(const n of sizes){out.push([s,s+n]);s+=n;}return out;}
 const out=[];for(let s=0;s<length;s+=400)out.push([s,Math.min(length,s+400)]);return out;
}
/* Line the two lists up again. zhSizes/jaSizes are the per-scene line counts on each side (same scenes in the same order);
   without them both lists must have the same length and fixed windows are used. In each scene a banded DP (|i-j| <= band)
   maps Chinese line i to Japanese line j or to nothing; a scene is changed only when the new mapping scores clearly better
   than the old one and runs along the diagonal. into:'zh' (default) gives the Japanese lines in Chinese order ('' where
   none) with their ruby moved the same way; into:'ja' gives the Chinese lines in Japanese order (the Japanese line itself,
   i.e. untranslated, where none). */
function realign(zh,ja,{zhSizes,jaSizes,ruby,band=6,voice,into='zh'}={}){
 let zs,js;
 if(Array.isArray(zhSizes)&&Array.isArray(jaSizes)&&zhSizes.length===jaSizes.length&&zhSizes.reduce((a,b)=>a+b,0)===zh.length&&jaSizes.reduce((a,b)=>a+b,0)===ja.length){zs=segments(zh.length,zhSizes);js=segments(ja.length,jaSizes);}
 else if(zh.length===ja.length){zs=js=segments(zh.length);}
 else return null;
 const toJa=new Int32Array(zh.length).fill(-1);let scenes=0,moved=0,dropped=0;
 const fz=zh.map((t,i)=>typeof t==='string'&&t.trim()?features(t,voice?.zh?.[i]):null),fj=ja.map((t,i)=>typeof t==='string'&&t.trim()?features(t,voice?.ja?.[i]):null);
 /* score of one Chinese line against one Japanese line; non-text lines (commands, file names) count when they are equal */
 const pair=(a,b)=>{const z=zh[a],j=ja[b];if(!fz[a]||!fj[b])return fz[a]||fj[b]?-1:.5;
  if(!translated(z,j))return String(z).replace(/\s/g,'')===String(j).replace(/\s/g,'')?3:japaneseLine(z)?-1.5:score(fz[a],fj[b]);return score(fz[a],fj[b]);};
 const GAP=-.9;
 for(let s=0;s<zs.length;s++){const [z0,z1]=zs[s],[j0,j1]=js[s],n=z1-z0,m=j1-j0,w=Math.max(band,Math.abs(n-m)+band);
  const keep=()=>{for(let i=0;i<n&&j0+i<j1;i++)toJa[z0+i]=j0+i;};
  if(n>4000||m>4000||w>60){keep();continue;}
  /* identity score: line i with line i (what the structure check assumed) */
  let base=0;for(let i=0;i<n;i++)base+=i<m?pair(z0+i,j0+i):GAP;
  /* DP over (i,j) with |i-j|<=w */
  const W=2*w+1,D=new Float64Array((n+1)*W).fill(-Infinity),B=new Int8Array((n+1)*W),idx=(i,j)=>i*W+(j-i+w);
  D[idx(0,0)]=0;
  for(let i=0;i<=n;i++)for(let j=Math.max(0,i-w);j<=Math.min(m,i+w);j++){const here=D[idx(i,j)];if(here===-Infinity)continue;
   if(i<n&&j<m){const v=here+pair(z0+i,j0+j),k=idx(i+1,j+1);if(v>D[k]){D[k]=v;B[k]=1;}}
   if(i<n&&Math.abs(j-(i+1))<=w){const v=here+GAP,k=idx(i+1,j);if(v>D[k]){D[k]=v;B[k]=2;}}
   if(j<m&&Math.abs(j+1-i)<=w){const v=here+GAP*.5,k=idx(i,j+1);if(v>D[k]){D[k]=v;B[k]=3;}}}
  const end=Math.abs(m-n)<=w?D[idx(n,m)]:-Infinity;
  if(!(end>base+1.5)){keep();continue;}
  const map=new Array(n).fill(-1);let i=n,j=m;while(i>0||j>0){const b=B[idx(i,j)];if(b===1){map[i-1]=j-1;i--;j--;}else if(b===2)i--;else j--;}
  /* A real shift is a few inserted or missing lines and long diagonal runs between them; a mapping that jumps around is
     the DP fitting noise (another version's script), and the scene keeps its order. */
  let jumps=0,prev=-2;for(let k=0;k<n;k++){const t=map[k];if(t<0){if(translated(zh[z0+k],''))jumps++;continue;}if(prev>=0&&t!==prev+1)jumps++;prev=t;}
  if(jumps>3+n*.02){keep();continue;}
  scenes++;for(let k=0;k<n;k++){const t=map[k];if(t!==k)moved++;if(t<0){if(translated(zh[z0+k],''))dropped++;}else toJa[z0+k]=j0+t;}}
 if(into==='ja'){const lines=ja.slice();for(let k=0;k<zh.length;k++)if(toJa[k]>=0)lines[toJa[k]]=zh[k];return {lines,ruby:null,scenes,moved,dropped};}
 const lines=Array.from(toJa,t=>t>=0?ja[t]:''),out=ruby?Array.from(toJa,t=>t>=0?ruby[t]??null:null):null;
 return {lines,ruby:out,scenes,moved,dropped};
}
/* The whole check for one pairing: census, sample, and when the sample fails a realignment and a second sample.
   Returns {ok, reason, total, paired, unpaired, reasons, sample, realigned, lines?, ruby?}; lines/ruby are set only when the
   realignment was accepted (into:'zh' the Japanese lines in Chinese order, into:'ja' the Chinese lines in Japanese order). */
function verify(zh,ja,options={}){
 const first=sample(zh,ja,options);let lines=null,ruby=null,realigned=null,final=first;
 /* force: the structure check already failed (scenes of different lengths), so the index pairing is not trusted at all */
 if(!options.keyed&&(!first.ok||options.force)){const r=realign(zh,ja,options);
  if(r&&r.scenes){const [z,j]=options.into==='ja'?[r.lines,ja]:[zh,r.lines],again=sample(z,j,options);
   realigned={scenes:r.scenes,moved:r.moved,dropped:r.dropped,accepted:again.ok,before:summary(first)};if(again.ok){lines=r.lines;ruby=r.ruby;}final=again;}}
 const c=options.into==='ja'?census(lines||zh,ja):census(zh,lines||ja,lines?null:options.added,lines?null:options.rewritten);
 /* a script that still fails after realignment is another version (or another game) */
 const reason=final.ok?'':realigned?'different-version':final.reason;
 return {ok:final.ok,reason,total:c.total,paired:c.paired,unpaired:c.unpaired,reasons:c.reasons,added:c.added,sample:final,realigned,...(lines?{lines,ruby}:{})};
}
const summary=s=>({sampled:s.sampled,matched:s.matched,rate:s.rate,contrast:s.contrast,driftShift:s.driftShift,reason:s.reason});
/* What is kept in the game's state and shown: counts and the sample, a few examples cut short. */
function report(v){const cut=t=>String(t??'').slice(0,60);
 return {ok:v.ok,reason:v.reason,total:v.total,paired:v.paired,unpaired:v.unpaired,reasons:v.reasons,added:v.added,sample:{...summary(v.sample),examples:(v.sample.examples||[]).slice(0,3).map(e=>({index:e.index,zh:cut(e.zh),ja:cut(e.ja),better:e.better}))},realigned:v.realigned};}
module.exports={verify,report,sample,realign,census,score,features,plain,translated,soundLike};
