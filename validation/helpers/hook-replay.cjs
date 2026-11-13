// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 replays a recording made with MEGULIT_HOOK_RECORD=<file.jsonl> (every HookBridge message and every OCR choice
   answer, with its time) through HookNative on a fake clock. Returns what the reader would have been told. */
const fs=require('fs'),{HookNative}=require('../../core/hook-native.cjs');
function replay(file,{name='game.exe'}={}){
 const rows=fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l));
 let now=rows.length?rows[0].t:0;const timers=[];
 const events=[],locates=[],traces=[];
 const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},m=>events.push(m),()=>{},()=>now);
 h.trace=s=>traces.push(s);h.send=()=>{};h.locateChoices=options=>locates.push({t:now,options});
 const realSet=global.setTimeout,realClear=global.clearTimeout;
 global.setTimeout=(fn,ms)=>{const t={at:now+(ms||0),fn,unref(){}};timers.push(t);return t;};
 global.clearTimeout=t=>{const i=timers.indexOf(t);if(i>=0)timers.splice(i,1);};
 const runUntil=t=>{for(;;){timers.sort((a,b)=>a.at-b.at);const next=timers[0];if(!next||next.at>t)break;timers.shift();now=next.at;try{next.fn();}catch{}}now=Math.max(now,t);};
 try{
  for(const {t,m} of rows){runUntil(t);
   if(m.type==='hookSource')h.source(m,name);
   else if(m.type==='hookAuxText')h.auxText(m);
   else if(m.type==='hookName'){const n=String(m.text||'').trim();if(n)h.speaker={text:n,at:now};}
   else if(m.type==='hookChoiceBoxes')h.choiceBoxes(m);
   else if(m.type==='hookEngineLine')try{h.pageLine(m);}catch{}
  }
  runUntil(now+5000);
 }finally{global.setTimeout=realSet;global.clearTimeout=realClear;}
 const shown=events.filter(e=>e&&Object.prototype.hasOwnProperty.call(e,'hookChoices')).map(e=>e.hookChoices);
 return {events,locates,traces,shown};
}
module.exports={replay};
