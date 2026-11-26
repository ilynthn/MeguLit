// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Cardinal scores (2026-11-21): one replay run of the reader -> seven scores 0..1 and their weighted total. Pure.
     row     1 the Japanese row is there and can be clicked                      lines passing / lines
     stable  2 the row keeps its place (y jitter, pushed by the translation)     lines passing / lines
     clean   3 no white / unclickable Japanese, no fallback draw, a line never comes back, one render owner
     clear   4 the page is cleared when the game clears it (no stale line)      line changes passing / line changes
     choice  5 offered options are visible and clickable (or drawn by the game) choices passing / choices
     pair    6 a shown Japanese line gets its Chinese row                        paired / shown
     leak    7 no original text showing through (hide check, visible records, hide given up, read mode)   1 - rate
   A score with nothing to look at (no choices, a single line) is 1 and leaves the total: its weight is not counted.
   Weights and thresholds are the profile's cardinal.* (core/profiles/defaults.cjs), so a signed diff can retune them (hot update). */
const C=require('./checks.cjs');
const KEYS=['row','stable','clean','clear','choice','pair','leak'];
const r3=x=>Math.round(Math.max(0,Math.min(1,x))*1000)/1000;
/* the start-up segment before the kernel leaves its initial read mode is not scored (core/cardinal/warmup.cjs; result.warmup says what was left out) */
function score(run,rules={}){const cut=require('./warmup.cjs').cut(run);run=cut.run;const t={...C.T0,...(rules.thresholds||{})},w=rules.weights||{};
 /* the Ctrl fast-forward spans of a cold-test tape leave the line scores (core/cardinal/fast-forward.cjs); leak and choice keep the whole run */
 const ff=require('./fast-forward.cjs').cut(run),full=run;run=ff.run;
 const pl=C.perLine(run,t),ls=pl.lines,n=ls.length,expectedList=C.expectedLines(run,t),expected=expectedList.length;
 /* the expected lines the reader never held for lineMs: the row coverage loss, by line */
 const seenLines=new Set(ls.map(l=>l.line)),unseen=expectedList.filter(st=>!seenLines.has(st.line)).slice(0,6).map(st=>(run.name||'run')+' line '+st.line+' 「'+String(st.text).slice(0,24)+'」 never the reader line for '+t.lineMs+' ms'+(require('./responsive.cjs').during(require('./responsive.cjs').spans(run.o),(run.o.sourceEpisodes||[]).find(e=>e.line===st.line)?.at??NaN)?' (the reader page did not answer)':''));
 const sourceCoverage={expected,observed:n,rate:expected?Math.min(1,n/expected):0};
 const contentCoverage={expected,complete:pl.complete.lines,rate:expected?Math.min(1,pl.complete.lines/expected):0};
 /* Replay providers are synthetic; session pairing comes only from the live reader's actual translations. */
 const pairs=run.livePairing?(run.livePairing.source==='live-display'?run.livePairing:{source:'unobserved',shown:expected,paired:0,unobserved:expected,reliable:false}):pl.pairs;
 const wh=C.white(run),fl=C.flashes(run),cl=C.clears(run,t,ls),ch=C.choices(full,t),lk=C.leaks(full,t,ff.fast?C.lines(full,t):ls);
 const applies={row:expected>0,stable:n>0,clean:(wh.n||0)>0,clear:cl.n>0,choice:ch.n>0,pair:pairs.source==='live-display'?pairs.shown>0:pairs.shown>0||n>0,leak:true};
 const lineRate=(bad)=>n?(n-bad)/n:1;
 const ownerLines=new Set([...pl.owner.map(m=>m.split(' drawn by ')[0]),...ls.filter(l=>l.dupBad).map(l=>(run.name||'run')+' line '+l.line)]).size;
 const s={
  row:sourceCoverage.rate*lineRate(ls.filter(l=>l.rowBad).length),
  stable:lineRate(ls.filter(l=>l.stableBad).length),
  clean:contentCoverage.rate*(pl.visibility.expected?pl.visibility.shown/pl.visibility.expected:1)*(wh.n?1-wh.badN/wh.n:1)*(n?1-Math.min(1,(fl.comebacks+ownerLines)/n):fl.comebacks+ownerLines?0:1),
  clear:cl.n?1-cl.stale/cl.n:1,
  choice:ch.n?ch.ok/ch.n:1,
  pair:pairs.shown?pairs.paired/pairs.shown:pairs.source==='live-display'?0:n?0:1,
  leak:1-lk.rate};
 const scores={};for(const k of KEYS)scores[k]=r3(s[k]);
 let sum=0,wsum=0;for(const k of KEYS){const wk=Number(w[k]);if(!applies[k]||!(wk>0))continue;sum+=wk*scores[k];wsum+=wk;}
 /* An absent row cannot earn cleanliness or a stable/clear bonus from having nothing to inspect. */
 const visibility={...pl.visibility,rate:r3(Math.min(sourceCoverage.rate,contentCoverage.rate,pl.visibility.expected?pl.visibility.shown/pl.visibility.expected:1))};
 const total=wsum?r3(Math.min(sum/wsum,visibility.rate)):0;
 const below=KEYS.filter(k=>applies[k]&&Number.isFinite(rules.floor?.[k])&&scores[k]<rules.floor[k]);
 const result={scores,total,lines:n,applies,below,warmup:cut.warmup,fastForward:ff.fast,detail:{model:run.o?.model&&typeof run.o.model==='object'?{name:String(run.o.model.name||''),label:String(run.o.model.label||''),bad:Array.isArray(run.o.model.bad)?run.o.model.bad.slice(0,12):[]}:null,pair:{...pairs},pairObservation:{reliable:pairs.source==='live-display'&&pairs.reliable===true,source:pairs.source||'replay-layout'},timeline:C.deliveryClock(run),sourceCoverage,contentCoverage,visibility,row:pl.row.slice(0,6),unseen,stable:pl.stable.slice(0,6),owner:pl.owner.slice(0,6),dup:pl.dup.slice(0,6),white:wh.bad.slice(0,6),flash:fl.bad.slice(0,6),clear:cl.bad,choice:ch.bad,choiceObservation:{reliable:ch.reliable,unobserved:ch.unobserved,unanswered:ch.unanswered},readerUnresponsive:(()=>{const q=require('./responsive.cjs').spans(full.o);return q.length?{spans:q.map(s=>({from:Math.round(s.from),to:Number.isFinite(s.to)?Math.round(s.to):null,failed:s.failed})),failedProbes:q.reduce((a,s)=>a+s.failed,0)}:null;})(),leak:lk.bad,leakObservation:{state:lk.state,hideConfirmed:lk.hideConfirmed,screen:lk.screen,observed:lk.observed,checked:lk.checked,native:lk.nativeObserved,read:lk.readObserved}}};
 /* every deduction with its samples (core/cardinal/explain.cjs) */
 /* 2026-11-26 nothing to score: not one dialogue line on the tape (a hook that only caught paths or resource names, Adobe AIR's
    TrickOrAlice: '…\\Local Store'). The total stays 0, and the result says why instead of an unexplained 0 */
 if(!expected){const isFed=st=>st?.hb?.type==='hookSource'||st?.hb?.type==='hookSourceWarmup',warm=(run.steps||[]).filter(st=>st?.hb?.type==='hookSourceWarmup').length;const fedText=(run.steps||[]).filter(isFed).map(st=>String(st.hb.text||''));const streams=[...new Set((run.steps||[]).filter(isFed).map(st=>String(st.hb.sourceName||'')).filter(Boolean))].slice(0,4);
  const generic=!result.detail.model||result.detail.model.name==='generic';
  if(ff.fast?.droppedLines)result.unscorable={reason:'fast-forward-only',hookLines:fedText.length+ff.fast.droppedLines,fastLines:ff.fast.droppedLines,streams,text:'没有阅读速度的台词可评：'+ff.fast.droppedLines+' 句都在 Ctrl 快进段（不计分）'};else
  result.unscorable={reason:generic?'no-engine-hook':'no-dialogue',hookLines:fedText.length,warmupLines:warm,streams,sample:(fedText[0]||'').replace(/\s+/g,' ').slice(0,60),
   text:(generic?'无引擎钩子（通用模型）：':'没有台词可评：')+'磁带里没有一句日文台词'+(fedText.length?'（收到 '+fedText.length+' 段文本，来自 '+(streams.join('、')||'未知文本流')+'，例如「'+(fedText[0]||'').replace(/\s+/g,' ').slice(0,60)+'」'+(warm?'，其中 '+warm+' 段在启动段不计分':'')+'，不是可评的对白）':'（钩子没有给出任何文本）')};}
 result.explain=require('./explain.cjs').explain(result);return result;}
/* several runs of one game: the scores weighted by each run's lines */
function combine(results,rules={}){const w=rules.weights||{};const tot=results.reduce((a,r)=>a+Math.max(1,r.lines),0)||1;const scores={},applies={};
 for(const k of KEYS){const rs=results.filter(r=>r.applies[k]);applies[k]=rs.length>0;const d=rs.reduce((a,r)=>a+Math.max(1,r.lines),0);scores[k]=rs.length?r3(rs.reduce((a,r)=>a+r.scores[k]*Math.max(1,r.lines),0)/d):1;}
 let sum=0,wsum=0;for(const k of KEYS){const wk=Number(w[k]);if(!applies[k]||!(wk>0))continue;sum+=wk*scores[k];wsum+=wk;}
 const visibilityRate=results.reduce((a,r)=>a+Math.max(1,r.lines)*(r.detail?.visibility?.rate??1),0)/tot;
 return {scores,total:wsum?r3(Math.min(sum/wsum,visibilityRate)):0,lines:results.reduce((a,r)=>a+r.lines,0),applies,runs:results.length};}
/* the record the relay takes (POST /api/cardinal/score; relay/src/cardinal.js checks every field, never rename one). No identity:
   the exe hash, the seed revision, the app version and the scores only */
function record({key,seedRev=null,source='none',app,result,cardinalRev,at=new Date()}){
 return {schema:'megulit.cardinal-score',version:1,key:String(key),seedRev:seedRev==null||seedRev===''?null:String(seedRev),source:['official','auto','none'].includes(source)?source:'none',
  app:String(app||'0.0.0'),lines:result.lines|0,scores:Object.fromEntries(KEYS.map(k=>[k,result.scores[k]])),total:result.total,cardinalRev:String(cardinalRev||'1'),at:(at instanceof Date?at:new Date(at)).toISOString()};}
module.exports={KEYS,score,combine,record};
