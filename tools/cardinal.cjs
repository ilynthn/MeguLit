// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Cardinal from the command line (2026-11-21): replay a session into the hidden reader and print its scores, the same code the app
   runs after a session (services/cardinal.cjs). Sources:
     --tape <file.jsonl>          a tape ({t, gwb|hb} rows; also MEGULIT_HOOK_RECORD recordings {t, m})
     --logs <dir> --from <ISO> --to <ISO>   the owner's logs or a runtime sample folder (engine-draw.log + hook-events.log + reader-host.log)
   Options: --game <json>  the game (pid, sha, title, exe, layout ...) when the source has no attach records
            --data <dir>   a data folder whose config/ the hidden reader uses (default: none, the kernel's defaults)
            --lines <n>    the last n dialogue lines (default: cardinal.lines of the profile)
            --rules <json> cardinal.* overrides;  --out <file> the run and its scores as JSON;  --keep  keep the replay folder
            --run <run.json>  a cold-test run: the options it saw on the game screen are scored (core/cardinal/screen-run.cjs)
            --shots <dir>     pictures of the real screen, read by Windows OCR: a second hide evidence (core/cardinal/screen-evidence.cjs)
            --screen <json>   that evidence already read (screen-evidence.cjs evidence() output)
   A tape that cannot be used stops with its TapeError code (core/cardinal/tape-file.cjs), exit code 3 */
const fs=require('node:fs'),path=require('node:path');
const Display=require('../core/cardinal/display.cjs');
const REPO=path.join(__dirname,'..');
const L=require(path.join(REPO,'core','cardinal','timeline.cjs')),S=require(path.join(REPO,'core','cardinal','score.cjs')),Profiles=require(path.join(REPO,'core','profiles','index.cjs'));
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?process.argv[i+1]:d;},flag=k=>process.argv.includes('--'+k);
(async()=>{
 const game=JSON.parse(arg('game','{}'));
 const profile=Profiles.profileFor({exe:game.exe||'',title:game.title||'',exeSha256:game.sha||'',engine:game.engine||''});
 const rules={...Profiles.DEFAULTS.cardinal,...(profile.cardinal||{}),...JSON.parse(arg('rules','{}'))};const n=+arg('lines',rules.lines);
 let steps,models=true;
 let tapeRows=null;
 if(arg('tape')){let tape;try{tape=require('../core/cardinal/tape-file.cjs').parse(fs.readFileSync(arg('tape'),'utf8'));}catch(e){console.error('# tape: '+(e.code?e.message:'unreadable: '+e.message));process.exit(3);}
  const rows=tape.rows;tapeRows=rows;if(tape.skipped.bad||tape.skipped.records||tape.skipped.untimed)console.log('# tape v'+tape.version+': skipped '+JSON.stringify(tape.skipped));
  /* rows of the kinds the tape does not carry yet (a newer cold test writes them into the tape itself) */
  if(arg('run')){const R=require('../core/cardinal/screen-run.cjs'),runInfo=JSON.parse(fs.readFileSync(arg('run'),'utf8'));if(!rows.some(r=>r.screen))rows.push(...R.choiceRows(runInfo));if(!rows.some(r=>r.phase))rows.push(...R.phaseRows(runInfo));}
  /* the last n dialogue lines, like the app's snapshot */
  const all=L.fromTape(rows,game);const idx=all.map((s,i)=>s.hb?.type==='hookSource'?i:-1).filter(i=>i>=0);const cut=idx.length>n?idx[idx.length-n]:0;
  const head=all.slice(0,cut).filter(s=>s.gwb&&['ready','bound','layout'].includes(s.gwb.type)||s.hb&&['hookProcess','hookThreads','hookStatus'].includes(s.hb.type));
  /* the pace the body starts in: the last phase before the cut opens it */
  const lastPhase=all.slice(0,cut).filter(s=>typeof s.phase==='string').at(-1);if(lastPhase&&all[cut])all.splice(cut,0,{...lastPhase,t:all[cut].t-1});
  const body=all.slice(cut);steps=[...head.map((s,i)=>({...s,t:(body[0]?.t||0)-300+i*20})),...body];models=false;}
 else if(arg('logs')){const ex=L.extract(arg('logs'),arg('from'),arg('to'));steps=[...L.attachSteps(game,Date.parse(arg('from'))),...L.timeline(ex,game),{t:Date.parse(arg('to')),mark:'end'}];}
 else{console.error('usage: node tools/cardinal.cjs --tape <file> | --logs <dir> --from <ISO> --to <ISO> [--game <json>] [--data <dir>] [--out <file>]');process.exit(2);}
 const lines=steps.filter(s=>s.hb?.type==='hookSource').length;console.log('# cardinal: '+lines+' dialogue lines, '+steps.length+' records, profile '+profile.gameKey+' ('+profile.layers+')');
 const scenario={game:{...game,sha:game.sha||''},steps,maxGap:rules.maxGapMs,sampleEvery:rules.sampleMs,models,tailMs:1200,attachSettleMs:models?0:2000};
 const o=await require(path.join(REPO,'services','cardinal','run.cjs')).replay(scenario,{data:arg('data',''),keep:flag('keep'),name:'cli'});
 if((o.errors||[]).length)console.log('# replay errors: '+JSON.stringify(o.errors).slice(0,800));
 /* the real screen: a second hide evidence beside the tape's own */
 if(arg('screen'))o.screen=JSON.parse(fs.readFileSync(arg('screen'),'utf8'));
 else if(arg('shots')){const frames=await require(path.join(REPO,'services','cardinal','screen-ocr.cjs')).frames(arg('shots'));o.screen=require(path.join(REPO,'core','cardinal','screen-evidence.cjs')).evidence(frames,tapeRows||steps);}
 if(o.screen)console.log('# screen: '+o.screen.state+' usable '+o.screen.usable+'/'+o.screen.frames+' visible '+o.screen.visible);
 const r=S.score({name:'session',steps,o},rules);
 console.log(JSON.stringify({lines:r.lines,...Display.summary(r),applies:r.applies,lag:o.lag},null,1));
 console.log('# hide: '+r.detail.leakObservation.state+(r.detail.leakObservation.state==='unconfirmed'?' (隐藏未确认)':''));
 for(const l of require('../core/cardinal/explain.cjs').lines(r))console.log('# '+l);
 if(flag('verbose'))for(const [k,v] of Object.entries(r.detail))if(v?.length)console.log('# '+k+': '+v.slice(0,4).join(' | ').slice(0,600));
 if(arg('out'))fs.writeFileSync(arg('out'),JSON.stringify({scenario,result:r,out:o},null,1));
})();
