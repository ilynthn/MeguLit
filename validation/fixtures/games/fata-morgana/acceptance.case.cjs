// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* ファタモルガーナの館 acceptance (2026-11-21, owner: one owner, a real DOM-level replay, everything green before a test package).
   The owner's own logs of 2026-11-21 (owner-20261121/logs: engine-draw / hook-events / reader-host excerpts, 02:56-02:58 and
   03:31-03:36 UTC; recordings 11.57.19, 12.35.41 local) replayed through the whole chain the owner's PC runs
   (Cardinal: services/cardinal/driver.cjs, runtime -> reader service -> GalNative -> HookNative -> placement / engine-draw ->
   the real reader page with every module, in Cardinal's hidden reader), with the owner's own settings (owner-20261121/data).
   2026-11-21 Cardinal: the checks every game must pass (1 2 3 4 5 8 9 10) are core/cardinal/checks.cjs, the same code that scores
   every player's sessions; this file keeps the game's own (6 7 11 12) and also writes the Cardinal scores of the three runs.
   Every symptom the owner reported is one check:
     1 every Japanese line is drawn on the game's place by the engine-coordinate path and can be clicked
     2 the Chinese sits under the Japanese; the Japanese does not move when the translation arrives
     3 no flash when advancing (no line comes back, nothing drawn from the orphan / glyph fallback)
     4 20 lines in a row keep all of it, the hide is never given up (no disable, no give way)
     5 never read mode
     6 the maid page's options are drawn (the choice frame reaches the script), no OCR noise becomes the reader's line
     7 「聖なるかな」 is one bilingual line, no table of OCR rows
     8 after 校准当前句 the Japanese stays, back within 1 s, the hook is not restarted or switched
     9 one render owner: a line's Japanese is drawn by one path only
    10 no white Japanese that cannot be clicked (every Japanese glyph drawn is inside a hit region)
    11 the control file end to end: profile -> hook-native with the game's real pid -> %TEMP%\MeguLit\draw\<pid>.txt -> the
       script's own reader (native/krkrtext/script.inc st.ctl, through tools/reader-replay/krkr-model.cjs)
   Models used where the logs cannot carry what a newer build would make the game do (each named in driver.cjs): the script
   reports hidden=1 while core keeps the hide on; the game clears its layer at the click ([cm]) and the script reports it
   (st.clearSent, only with #clearline). MEGULIT_FATA_ACCEPT_OUT=<file> writes the per-check table and the Cardinal scores. */
const fs=require('node:fs'),path=require('node:path');
module.exports=async ({assert,root,fixture})=>{
 if(process.env.MEGULIT_FATA_ACCEPT==='0')return;
 if(!require(path.join(root,'services','cardinal','cdp.cjs')).findBrowser()){console.log('# fata acceptance skipped: no Edge / Chrome for the hidden reader');return;}
 const L=require(path.join(root,'core','cardinal','timeline.cjs')),C=require(path.join(root,'core','cardinal','checks.cjs')),S=require(path.join(root,'core','cardinal','score.cjs'));
 const rules=require(path.join(root,'core','profiles','defaults.cjs')).cardinal,t=rules.thresholds;
 const logs=path.join(fixture,'owner-20261121','logs'),data=path.join(fixture,'owner-20261121','data');
 const work=fs.mkdtempSync(path.join(process.env.MEGULIT_REPLAY_WORK||require('node:os').tmpdir(),'fata-accept-'));
 const game=(pid,started)=>({pid,started,hwnd:'2107056',sha:'17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42',title:'ファタモルガーナの館',process:'fata_jp',exe:'D:\\Games\\Fata\\fata_jp.exe',
  /* reader-host.log: pointer x - gameX = 462, y - gameY = 264 (dpr 1); the reader box = the owner's x 9.08 % / y 85.76 % of the 804x604 client */
  layout:{clientWidth:804,clientHeight:604,clientX:462,clientY:264,magpie:false,readerX:535,readerY:782,readerWidth:731,readerHeight:163,workBottom:1040,surfaceWidth:1920,surfaceHeight:1079,maskX:0,maskY:0},
  stream:{id:'575310:0:0',name:'Krkr2wcs',code:'EXHQXN8@175310:fata_jp.exe'}});
 // Acknowledge the CDP step before opening Alt+T; the driver still reports uncaught errors from the page task.
 const calib=t=>({t:Date.parse(t),mark:'calibrate',settle:0,pageTimeoutMs:30000,page:String(()=>{
  setTimeout(()=>{
   if(!document.querySelector('[data-game-style-sync]'))window.__tomoyoChinese?.toggleGalMenu?.();
   setTimeout(()=>{
    const button=document.querySelector('[data-game-style-sync]');
    if(!button||button.disabled)throw Error('calibration button unavailable');
    button.click();
    setTimeout(()=>{if(document.querySelector('[data-game-style-sync]'))window.__tomoyoChinese?.toggleGalMenu?.();},400);
   },200);
  },0);
 })});
 function scenario(name,from,to,g,{actions=[],choice=[]}={}){
  const ex=L.extract(logs,from,to);const t0=Date.parse(from);
  const steps=[...L.attachSteps(g,t0),...L.timeline(ex,g,{actions:[...actions,...choice.map(t=>({t:Date.parse(t),choicePage:t}))]}),{t:Date.parse(to),mark:'end'}];
  return {name,ex,steps,scenario:{game:g,steps,maxGap:1500,sampleEvery:90}};}
 const runs=[
  scenario('dialogue',  '2026-11-21T03:35:30.000Z','2026-11-21T03:36:45.000Z',game(42452,'638994198000000000'),{actions:[calib('2026-11-21T03:35:49.300Z')],choice:['2026-11-21T03:36:30.000Z']}),
  scenario('art',       '2026-11-21T03:31:50.000Z','2026-11-21T03:32:32.000Z',game(42452,'638994198000000000')),
  scenario('advance',   '2026-11-21T02:56:30.000Z','2026-11-21T02:58:20.000Z',game(39016,'638994190000000000'))];
 const {replay}=require(path.join(root,'services','cardinal','run.cjs'));
 // Frame deadlines and browser cleanup are measured in wall time. Run one reader at a time.
 const outs=[];
 /* 2026-11-28 (CI, 31 runs failed on this file since 11-26, every time with another symptom: line 36 of the dialogue run never completing
    its text or shown in 3/5 samples, CARDINAL_BROWSER_EXIT_TIMEOUT, a CDP timeout, CARDINAL_BROWSER_TARGET). Line 36 is the owner's
    quick click: the game's line is on screen 0.92 s in the recording and its Japanese is typed out in the first 0.6 s of that, so
    what is measured is a handful of 90 ms samples. On a runner that is busy with two other shards the browser answers 300-1000 ms
    late, the replay's own clock falls behind (timing.cjs: step / sample lag past maxLagMs) and the few samples there are miss the
    typed-out line. That is the run's measurement being bad, not the reader being wrong, and the timing proof was written to say so.
    A run whose browser could not be driven (an error from the driver) or whose timing proof is not reliable is played again, up to
    three times, and each retry is named in the log; the checks below are exactly the same and judge the last run. A run that
    was driven on time and fails a check fails the test at once. */
 const Timing=require(path.join(root,'core','cardinal','timing.cjs'));
 for(const r of runs){let o,why='';
  for(let attempt=1;attempt<=3;attempt++){
   o=await replay(r.scenario,{data,work,name:r.name,keep:!!process.env.MEGULIT_REPLAY_KEEP});
   const driven=o&&Array.isArray(o.errors)&&!o.errors.length;
   const proof=driven?Timing.check({steps:r.steps,o,rules}):null;
   why=!o||!Array.isArray(o.errors)?'no output':o.errors.length?'driver: '+String(o.errors[0]).slice(0,120):!proof.reliable?'timing: '+proof.why+' (step p95 '+Math.round(proof.stepP95||0)+' ms, sample p95 '+Math.round(proof.sampleP95||0)+' ms, gap max '+Math.round(proof.sampleGapMax||0)+' ms)':'';
   if(!why)break;
   console.log('# fata acceptance FLAKY-RETRY: '+r.name+' run '+attempt+'/3 was not a fair measurement ('+why+')'+(attempt<3?'; playing it again':'; judged as it is'));
  }
  outs.push({...r,o});}
 const res={},put=(k,ok,why)=>{res[k]={ok:!!ok,why:String(why||'').slice(0,600)};};
 for(const r of outs)assert.ok(r.o&&!r.o.errors.length,r.name+' replay ran: '+JSON.stringify(r.o?.errors||'no output').slice(0,600));
 const by=Object.fromEntries(outs.map(r=>[r.name,r]));
 const {jpGlyphs,inside,norm}=C;
 /* 1 + 10 + 9 + 2 on every line of every run (core/cardinal/checks.cjs perLine, white) */
 {const bad1=[],bad2=[],bad9=[],bad10=[];
  for(const r of outs){const pl=C.perLine(r,t);bad1.push(...pl.row);bad2.push(...pl.stable);bad9.push(...pl.owner);if(bad10.length<=6)bad10.push(...C.white(r).bad);}
  put('1',!bad1.length,bad1.slice(0,8).join(' | '));put('2',!bad2.length,bad2.slice(0,8).join(' | '));put('9',!bad9.length,bad9.slice(0,6).join(' | '));put('10',!bad10.length,bad10.slice(0,6).join(' | '));}
 /* 3 flashes: nothing from the orphan / glyph fallback, and a line the reader left never comes back */
 {const bad=[];for(const r of outs)bad.push(...C.flashes(r).bad);put('3',!bad.length,[...new Set(bad)].slice(0,6).join(' | '));}
 /* 4: 20 lines in a row on the dialogue run keep 1/10, and the hide is never given up */
 {const r=by.dialogue,ls=C.lines(r,t),h=C.hold(r);
  put('4',ls.length>=20&&!h.off&&!h.giveWay&&res['1'].ok&&res['10'].ok,'lines '+ls.length+', disable '+h.off+', give way '+h.giveWay+(res['1'].ok?'':', check 1 failed')+(res['10'].ok?'':', check 10 failed'));}
 /* 5: never read mode (core route, text-effects switch, the page's hide) */
 {const bad=[];for(const r of outs)bad.push(...C.readMode(r).bad);put('5',!bad.length,bad.slice(0,6).join(' | '));}
 /* 6: the choice frame reaches the script (the game draws the options), no OCR noise becomes the line meanwhile */
 {const r=by.dialogue,c=r.o.krkr.choice[0],noise=r.o.samples.filter(s=>/ノ気ゞ亠/.test(s.hookSource||''));
  put('6',c&&c.ui==='choice'&&!noise.length,'script on the 選択肢 frame: '+JSON.stringify(c||null)+(noise.length?' | OCR noise shown as the line':''));}
 /* 7: 聖なるかな one bilingual line, no rows of OCR copies */
 {const r=by.art,ss=r.o.samples.filter(s=>norm(s.hookSource)==='聖なるかな');const bad=[];
  /* 2026-11-24: judged from 1 s after the line appears, not 400 ms. Locally the Chinese arrives at about 290 ms; a busy CI
     runner once missed 400 ms by one sample (run 45360903343). The line stays about 2.5 s, so 15+ samples are still checked */
  const late=ss.filter(s=>s.at-ss[0].at>=1000);
  if(!ss.length)bad.push('never the reader line');else if(!late.length)bad.push('shown under 1 s, nothing left to judge');
  for(const s of late){const g=jpGlyphs(s),t=norm(g.map(x=>x.text).join(''));if(t.split('聖なるかな').length-1>1||g.some(x=>x.kind==='art'))bad.push('@'+s.at+' '+t.slice(0,40)+' kinds '+[...new Set(g.map(x=>x.kind))].join('+'));if(!s.cn.length||s.cn.length>1)bad.push('@'+s.at+' Chinese rows '+s.cn.length);if(bad.length>4)break;}
  put('7',!bad.length,bad.join(' | '));}
 /* 8: calibration: the Japanese stays, the hook is not restarted, switched or released */
 {const c=C.calibration(by.dialogue,t);put('8',!c.bad.length,c.bad.slice(0,6).join(' | '));}
 /* 12: the two-row page of 03:36:18 (line 38 on the first row y485, line 39 under it y514, no clear between): both drawn, each on its
    own row (game y + client 264), clickable; once the game clears the page (the next line starts on the first row) both are gone */
 {const r=by.dialogue,o=r.o,A='「あなた」に声をかける人物がいる。',B='「あなた」は周囲を見渡そうとするが、その必要はなかった。',bad=[];
  const rowOf=(s,t)=>{const g=jpGlyphs(s).filter(x=>x.kind==='line');const want=norm(t);let hit=null;for(const y of [...new Set(g.map(x=>Math.round(x.rect.y)))]){const row=g.filter(x=>Math.abs(x.rect.y-y)<=3);if(want.startsWith(norm(row.map(x=>x.text).join('')).slice(0,6))&&norm(row.map(x=>x.text).join('')).length>=6)hit={y,row};}return hit;};
  const during=o.samples.filter(s=>norm(s.hookSource)===norm(B)&&!s.body.includes('megulit-menu-open'));const settled=during.filter(s=>s.at-during[0]?.at>=600);
  if(!settled.length)bad.push('line 39 never shown long enough');
  for(const s of settled){const a=rowOf(s,A),b=rowOf(s,B);if(!a)bad.push('@'+s.at+' line 38 (the row above) not drawn');else if(Math.abs(a.y-(264+485))>6)bad.push('@'+s.at+' line 38 at y '+a.y+' (its row 749)');
   if(!b)bad.push('@'+s.at+' line 39 not drawn');else if(Math.abs(b.y-(264+514))>6)bad.push('@'+s.at+' line 39 at y '+b.y+' (its row 778)');
   for(const x of [a,b])if(x&&x.row.some(g=>!inside(g,s.hitRegions)))bad.push('@'+s.at+' a row not clickable');if(bad.length>4)break;}
  const after=o.samples.filter(s=>during.length&&s.at>during.at(-1).at+600&&s.hookSource&&norm(s.hookSource)!==norm(B)).slice(0,20);
  for(const s of after){if(rowOf(s,A)||rowOf(s,B)){bad.push('@'+s.at+' the cleared page still drawn under 「'+String(s.hookSource).slice(0,10)+'」');break;}}
  put('12',!bad.length,[...new Set(bad)].slice(0,6).join(' | '));}
 /* 11: profile -> hook-native (real pid) -> control file -> the script's reader */
 {const r=by.dialogue,o=r.o,f=(o.control.at(-1)?.files||[]).find(x=>x.name==='42452.txt'),cfg=o.krkr.cfg||{};
  const ok=!!f&&/#clearline/.test(f.text)&&/#choiceframe \^選択肢\$/.test(f.text)&&cfg.clear===1&&Array.isArray(cfg.choiceFrames)&&cfg.choiceFrames.length===1&&o.krkr.clears>0;
  put('11',ok,'file '+(f?JSON.stringify(f.text.slice(0,120)):'missing (files: '+JSON.stringify((o.control.at(-1)?.files||[]).map(x=>x.name))+')')+' script cfg '+JSON.stringify(cfg)+' clears '+o.krkr.clears);}
 /* the Cardinal scores of the three runs (what a player's MeguLit would report for this session) */
 const scored=outs.map(r=>({name:r.name,...S.score(r,rules)}));const all=S.combine(scored,rules);
 if(process.env.MEGULIT_FATA_ACCEPT_OUT)fs.writeFileSync(process.env.MEGULIT_FATA_ACCEPT_OUT,JSON.stringify({res,cardinal:{runs:scored.map(x=>({name:x.name,lines:x.lines,scores:x.scores,total:x.total,detail:x.detail})),all},work},null,1));
 if(!process.env.MEGULIT_REPLAY_KEEP)try{fs.rmSync(work,{recursive:true,force:true});}catch{}
 const failed=Object.entries(res).filter(([,v])=>!v.ok);
 assert.deepEqual(failed.map(([k,v])=>k+': '+v.why),[],'ファタ acceptance');
};
