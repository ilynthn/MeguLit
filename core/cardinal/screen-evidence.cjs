// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 Cardinal's second hide evidence: pictures of the real screen (adapt-auto --foreground screen/*.png, the cold test's
   run/shot-*.jpg, or any capture) read by Windows OCR (services/cold-ocr.ps1), against the dialogue line the hook had at that moment.
   Everything here is pure: frames come in already read, each {at (epoch ms, the tape's clock), ocr:[{text,x,y,w,h}], exclude?:[rects]}.
     exclude  rectangles on the picture that are MeguLit's own reader rows (its Japanese row is drawn where the original was); OCR
              text inside them is never the game's original. A capture without MeguLit running (the cold test) has none
   A frame is
     visible    an OCR line outside exclude reads like the current (or the previous) dialogue line: the original is on screen
     hidden     OCR read the picture (at least MIN_READ other lines of text) and nothing reads like the line
     unusable   no dialogue line yet, a line too short to tell, OCR read too little of the picture, or (for a miss) the line
              came over MAX_AGE before the picture (the screen may show a choice or a menu by then)
   The run is observed only with MIN_FRAMES usable frames (like the four distinct hide checks of checks.cjs leaks); fewer stay
   unconfirmed. A match needs MIN_SHARED shared character pairs and a Dice ratio of MATCH; nothing here is tuned to pass a game. */
const MIN_FRAMES=4,MIN_READ=3,MAX_AGE=10000,MIN_CHARS=6,MIN_SHARED=3,MATCH=0.5;
const norm=t=>String(t||'').normalize('NFKC').replace(/[^぀-ヿ㐀-鿿]/g,'');
const pairs=t=>{const s=[...norm(t)],out=new Map();for(let i=0;i+1<s.length;i++){const k=s[i]+s[i+1];out.set(k,(out.get(k)||0)+1);}return out;};
/* how much of the line b the OCR text a reads: shared pairs and their Dice ratio against the shorter side (OCR splits a line into rows) */
function likeness(a,b){const A=pairs(a),B=pairs(b);let shared=0;for(const [k,n] of A)shared+=Math.min(n,B.get(k)||0);
 const na=[...A.values()].reduce((x,y)=>x+y,0),nb=[...B.values()].reduce((x,y)=>x+y,0);return {shared,ratio:Math.min(na,nb)?shared/Math.min(na,nb):0};}
const inside=(o,rects)=>(rects||[]).some(r=>{const cx=o.x+o.w/2,cy=o.y+o.h/2;return cx>=r.x&&cx<=r.x+r.w&&cy>=r.y&&cy<=r.y+r.h;});
/* steps: the tape's rows or timeline steps; -> [{t, text}] of the dialogue lines, oldest first */
function dialogue(steps){return (steps||[]).map(s=>s?.hb||s?.m).map((m,i)=>({m,t:steps[i]?.t})).filter(x=>x.m?.type==='hookSource'&&typeof x.m.text==='string'&&Number.isFinite(x.t)).map(x=>({t:x.t,text:x.m.text})).sort((a,b)=>a.t-b.t);}
function judge(frame,lines){const at=frame?.at;if(!Number.isFinite(at))return {verdict:'unusable',why:'no time'};
 let k=-1;for(let i=0;i<lines.length;i++)if(lines[i].t<=at)k=i;if(k<0)return {verdict:'unusable',why:'before the first line'};
 const cands=[lines[k],lines[k-1]].filter(Boolean).filter(l=>norm(l.text).length>=MIN_CHARS);if(!cands.length)return {verdict:'unusable',line:k,why:'line too short'};
 const ocr=(Array.isArray(frame.ocr)?frame.ocr:[]).filter(o=>o&&typeof o.text==='string'&&[o.x,o.y,o.w,o.h].every(Number.isFinite)&&!inside(o,frame.exclude));
 let best=null;for(const o of ocr)for(const l of cands){const m=likeness(o.text,l.text);if(m.shared>=MIN_SHARED&&m.ratio>=MATCH&&(!best||m.ratio>best.ratio))best={...m,ocr:o.text,box:[o.x,o.y,o.w,o.h],text:l.text};}
 if(best)return {verdict:'visible',line:k,text:best.text,read:best.ocr,box:best.box,ratio:Math.round(best.ratio*100)/100,why:'OCR reads the line on the screen'};
 const read=ocr.filter(o=>norm(o.text).length>=2||/[A-Za-z]{3}/.test(o.text)).length;
 if(read<MIN_READ)return {verdict:'unusable',line:k,why:'OCR read '+read+' lines of the picture'};
 /* a miss long after the line came says nothing (a choice screen, a menu, a transition may be up): only a fresh line can be missed */
 if(at-lines[k].t>MAX_AGE)return {verdict:'unusable',line:k,why:'the line is '+Math.round((at-lines[k].t)/1000)+' s old'};
 return {verdict:'hidden',line:k,text:cands[0].text,why:'OCR read '+read+' lines, none like the dialogue line'};}
/* -> {source:'screen-ocr', frames, usable, visible, hidden, state:'visible'|'hidden'|'unconfirmed', items:[per frame]} */
function evidence(frames,steps){const lines=dialogue(steps),items=(frames||[]).map(f=>({at:f?.at,name:f?.name||'',...judge(f,lines)}));
 const visible=items.filter(i=>i.verdict==='visible').length,hidden=items.filter(i=>i.verdict==='hidden').length,usable=visible+hidden;
 return {source:'screen-ocr',frames:items.length,usable,visible,hidden,state:visible?'visible':usable>=MIN_FRAMES?'hidden':'unconfirmed',items};}
/* a checks.cjs leaks() reading of it: only a well-formed summary counts */
function valid(e){return !!e&&e.source==='screen-ocr'&&['visible','hidden','unconfirmed'].includes(e.state)&&[e.usable,e.visible,e.hidden].every(Number.isSafeInteger)&&e.usable===e.visible+e.hidden&&(e.state!=='visible'||e.visible>0)&&(e.state!=='hidden'||e.visible===0&&e.usable>=MIN_FRAMES);}
module.exports={evidence,judge,likeness,dialogue,valid,MIN_FRAMES,MIN_READ,MATCH,MAX_AGE};
