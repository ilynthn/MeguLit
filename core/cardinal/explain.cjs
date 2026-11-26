// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 why a score is what it is: score.cjs result -> per key {points, lost, factors, items}. Pure, reads only the result.
     points   the key on the 10 scale (display.cjs), null when it does not apply
     lost     10 - points
     factors  the parts the score multiplies (coverage, visibility, rates) with their counts, so a low score with no sample still says why
     items    the samples behind the deduction: {line?, at? (ms on the replay clock), text?, reason}, the checks' own messages, first ones only
   Nothing is recomputed here: the checks (checks.cjs) keep their messages, this only sorts them under the key they cost. */
const Display=require('./display.cjs');
const LIMIT=8;
function item(message){const m=String(message||''),line=/ line (\d+)/.exec(m),at=/ @(\d+(?:\.\d+)?)/.exec(m),text=/「([^」]*)」/.exec(m);
 return {...(line?{line:+line[1]}:{}),...(at?{at:Math.round(+at[1])}:{}),...(text?{text:text[1]}:{}),reason:m.replace(/^\S+ /,'').replace(/^line \d+ /,'').replace(/^@\S+ /,'')};}
const items=(...lists)=>lists.flat().filter(Boolean).slice(0,LIMIT).map(item);
const pct=(a,b)=>b?a+'/'+b:'0/0';
function explain(result){const d=result?.detail||{},sc=result?.scores||{},ap=result?.applies||{},out={};
 const factors={
  row:[['dialogue lines observed',pct(d.sourceCoverage?.observed,d.sourceCoverage?.expected)]],
  stable:[],
  clean:[['lines completed',pct(d.contentCoverage?.complete,d.contentCoverage?.expected)],['samples showing the line',pct(d.visibility?.shown,d.visibility?.expected)]],
  clear:[],
  choice:[['choice observation',d.choiceObservation?.reliable===false?'unreliable ('+d.choiceObservation.unobserved+' unobserved)':'reliable']],
  pair:[['lines with their translation',pct(d.pair?.paired,d.pair?.shown)],['source',d.pairObservation?.source||'']],
  leak:[['hide',d.leakObservation?.state||''],...(d.leakObservation?.hideConfirmed?[['stream confirmed hide-only','yes']]:[]),...(d.leakObservation?.screen?[['screen pictures',d.leakObservation.screen.state+' (visible '+d.leakObservation.screen.visible+', hidden '+d.leakObservation.screen.hidden+')']]:[])]};
 const done=(d.row||[]).filter(x=>/never completes/.test(x));
 const why={row:items(d.unseen,d.row),stable:items(d.stable),clean:items(done,d.white,d.flash,d.owner,d.dup),clear:items(d.clear),choice:items(d.choice),pair:[],leak:items(d.leak)};
 for(const k of Object.keys(factors)){const points=ap[k]===false?null:Display.toPoints(sc[k]);
  out[k]={points,lost:points==null?null:Math.round((10-points)*100)/100,factors:Object.fromEntries(factors[k]),items:points===10?[]:why[k]};}
 if(result?.unscorable)out.unscorable={...result.unscorable};
 if(d.model)out.model={name:d.model.name,label:d.model.label,bad:d.model.bad};
 if(d.readerUnresponsive)out.readerUnresponsive={left:'the reader page did not answer '+d.readerUnresponsive.failedProbes+' probe(s): '+d.readerUnresponsive.spans.map(s=>'from '+s.from+' ms'+(s.to==null?' to the end':' to '+s.to+' ms')).join(', ')+'; lines and options of that time have no sample'};
 if(result?.fastForward)out.fastForward={left:result.fastForward.droppedLines+' lines, '+result.fastForward.droppedSamples+' samples in '+result.fastForward.spans+' Ctrl fast-forward span(s) not scored for row / stable / clean / pair / clear',why:result.fastForward.why};
 if(result?.warmup)out.warmup={left:result.warmup.droppedSamples+' samples, '+result.warmup.droppedLines+' lines before '+result.warmup.until+' ms (start-up, not scored)'};
 return out;}
/* the lines a terminal or a report shows: one per key that lost points, its factors, then its first samples */
function lines(result,{per=3}={}){const e=explain(result),out=[];
 for(const [k,v] of Object.entries(e)){if(k==='warmup'){out.push('warmup: '+v.left);continue;}if(k==='unscorable'){out.unshift('unscorable: '+v.text);continue;}if(k==='readerUnresponsive'){out.push('reader unresponsive: '+v.left);continue;}if(k==='fastForward'){out.push('fast-forward: '+v.left+' ('+v.why+')');continue;}if(k==='model'){out.push('model: '+v.label+' ('+v.name+')'+(v.bad.length?' — '+v.bad.slice(0,3).join(' | '):''));continue;}if(v.points==null||v.points===10)continue;
  out.push(k+' '+v.points+'/10 (-'+v.lost+') '+Object.entries(v.factors).map(([a,b])=>a+' '+b).join(', '));
  for(const i of v.items.slice(0,per))out.push('  '+(i.line!=null?'line '+i.line+' ':'')+(i.at!=null?'@'+i.at+'ms ':'')+i.reason.slice(0,200));}
 return out;}
module.exports={explain,lines,item};
