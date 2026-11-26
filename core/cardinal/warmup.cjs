// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 (owner via 261126总指挥: 内核从 read 切到 hide 之前的启动段不计 leak/row，只算切换后的稳定段，并写明丢掉多少采样；不许放宽阈值)
   A replay whose kernel starts in read mode (a cold-test tape has no GalWindowBridge records: オルフレール switched read -> custom ->
   read -> custom -> embed in its first 2.8 s) is scored from the moment it leaves read mode for good: the first switch away from read
   that is not followed by a switch back to read within STABLE_MS. Samples, sent messages, hook events and dialogue lines before that
   moment are left out, and the result says how many. A run that never leaves read mode, or does not start in it, is not cut, so a
   game that really reads keeps its leak. Thresholds and weights are untouched. */
const STABLE_MS=5000;
const atOf=(o,l)=>Date.parse(String(l).slice(0,24))-(o.t0||0);

/* -> the replay-clock ms where the start-up segment ends, or 0 (no cut) */
function until(run){const o=run?.o||{},sw=[];
 for(const l of o.hookEvents||[]){const m=/render mode switched in place (\S+) -> (\S+)/.exec(String(l));if(!m)continue;const at=atOf(o,l);if(Number.isFinite(at))sw.push({at,from:m[1],to:m[2]});}
 sw.sort((a,b)=>a.at-b.at);if(!sw.length||sw[0].from!=='read')return 0;
 for(let i=0;i<sw.length;i++){if(sw[i].to==='read')continue;const back=sw.slice(i+1).find(s=>s.to==='read');if(!back||back.at-sw[i].at>=STABLE_MS)return sw[i].at;}
 return 0;}

/* -> {run, warmup:{until, droppedSamples, keptSamples, droppedLines} | null}; run is a new object, the input is not changed */
function cut(run){const at=until(run);if(!(at>0))return {run,warmup:null};const o=run.o;
 const samples=Array.isArray(o.samples)?o.samples:[],kept=samples.filter(s=>!(Number.isFinite(s?.at)&&s.at<at));
 const eps=Array.isArray(o.sourceEpisodes)?o.sourceEpisodes:null,drop=new Set(eps?eps.filter(e=>Number.isFinite(e?.at)&&e.at<at).map(e=>e.step):[]);
 /* a dropped line stays in the step list (delivery records point at step indexes) but is no dialogue line any more */
 const steps=(run.steps||[]).map((st,i)=>drop.has(i)&&st?.hb?.type==='hookSource'?{...st,line:undefined,hb:{...st.hb,type:'hookSourceWarmup'}}:st);
 const out={...o,samples:kept,
  hbSent:(o.hbSent||[]).filter(m=>!(Number.isFinite(m?.at)&&m.at<at)),
  ...(Array.isArray(o.screenChoices)?{screenChoices:o.screenChoices.filter(c=>!(Number.isFinite(c?.at)&&c.at<at))}:{}),
  hookEvents:(o.hookEvents||[]).filter(l=>{const t=atOf(o,l);return !(Number.isFinite(t)&&t<at);}),
  ...(eps?{sourceEpisodes:eps.filter(e=>!drop.has(e.step))}:{})};
 return {run:{...run,steps,o:out},warmup:{until:Math.round(at),droppedSamples:samples.length-kept.length,keptSamples:kept.length,droppedLines:drop.size}};}

module.exports={until,cut,STABLE_MS};
