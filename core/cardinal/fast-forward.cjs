// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 (owner via 总指挥) a cold-test tape runs at reading pace (the first lines), then fast-forwards with Ctrl, then slows down
   again near the choice. While Ctrl is held LunaHook hands over whole pages at once and joins lines across sentences (オルフレール
   line 39 「なります」た」力が及ばず…」): not what a player reading the game sees. The tape's phase steps say when ('fast' starts it,
   any other phase, e.g. 'choice', ends it); the dialogue lines and samples of those spans are left out of the line scores
   (row / stable / clean / pair / clear), and the result says how many. Leak and choice keep the whole run: an original that showed
   or an option that was missed counts whatever the pace. A run without phase steps (every tape before this) is not cut.
   Thresholds and weights are untouched. */
/* -> [{fromStep, toStep}] step indexes of the fast spans (toStep exclusive; the end of the steps when it never slowed down) */
function spans(steps){const out=[];let open=null;
 for(const [i,st] of (steps||[]).entries()){if(typeof st?.phase!=='string')continue;
  if(st.phase==='fast'){if(open==null)open=i;}else if(open!=null){out.push({fromStep:open,toStep:i});open=null;}}
 if(open!=null)out.push({fromStep:open,toStep:(steps||[]).length});return out;}
/* the replay-clock moment of a step: the delivery time of the first dialogue line at or after it (o.sourceEpisodes) */
function clockAt(o,step){const e=(o.sourceEpisodes||[]).find(x=>Number.isSafeInteger(x?.step)&&x.step>=step&&Number.isFinite(x.at));return e?e.at:Infinity;}
/* -> {run (line checks only), fast:{spans, droppedLines, droppedSamples, why} | null}; the input is not changed */
function cut(run){const steps=run?.steps||[],sp=spans(steps);if(!sp.length)return {run,fast:null};const o=run.o||{};
 const inSpan=i=>sp.some(s=>i>s.fromStep&&i<s.toStep);
 const clocks=sp.map(s=>({from:clockAt(o,s.fromStep),to:s.toStep>=steps.length?Infinity:clockAt(o,s.toStep)}));
 const drop=new Set();steps.forEach((st,i)=>{if(st?.hb?.type==='hookSource'&&inSpan(i))drop.add(i);});
 const samples=Array.isArray(o.samples)?o.samples:[],kept=samples.filter(s=>!clocks.some(c=>Number.isFinite(s?.at)&&s.at>=c.from&&s.at<c.to));
 const out={...o,fastFrom:Math.min(...clocks.map(c=>c.from)),samples:kept,...(Array.isArray(o.sourceEpisodes)?{sourceEpisodes:o.sourceEpisodes.filter(e=>!drop.has(e.step))}:{})};
 const st2=steps.map((st,i)=>drop.has(i)?{...st,line:undefined,hb:{...st.hb,type:'hookSourceFast'}}:st);
 return {run:{...run,steps:st2,o:out},fast:{spans:sp.length,droppedLines:drop.size,droppedSamples:samples.length-kept.length,
  why:'Ctrl 快进段不计分：快进时钩子整段吐字、跨句拼接，不代表玩家阅读时看到的样子'}};}
module.exports={spans,cut,clockAt};
