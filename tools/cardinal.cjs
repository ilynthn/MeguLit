// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Cardinal from the command line (2026-11-21): replay a session into the hidden reader and print its scores, the same code the app
   runs after a session (services/cardinal.cjs). Sources:
     --tape <file.jsonl>          a tape ({t, gwb|hb} rows; also MEGULIT_HOOK_RECORD recordings {t, m})
     --logs <dir> --from <ISO> --to <ISO>   the owner's logs or a runtime sample folder (engine-draw.log + hook-events.log + reader-host.log)
   Options: --game <json>  the game (pid, sha, title, exe, layout ...) when the source has no attach records
            --data <dir>   a data folder whose config/ the hidden reader uses (default: none, the kernel's defaults)
            --lines <n>    the last n dialogue lines (default: cardinal.lines of the profile)
            --rules <json> cardinal.* overrides;  --out <file> the run and its scores as JSON;  --keep  keep the replay folder */
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
 if(arg('tape')){const rows=fs.readFileSync(arg('tape'),'utf8').split(/\r?\n/).filter(Boolean).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean);
  if(arg('run'))rows.push(...require('../core/cardinal/screen-run.cjs').screenRows(JSON.parse(fs.readFileSync(arg('run'),'utf8'))));
  /* the last n dialogue lines, like the app's snapshot */
  const all=L.fromTape(rows,game);const idx=all.map((s,i)=>s.hb?.type==='hookSource'?i:-1).filter(i=>i>=0);const cut=idx.length>n?idx[idx.length-n]:0;
  const head=all.slice(0,cut).filter(s=>s.gwb&&['ready','bound','layout'].includes(s.gwb.type)||s.hb&&['hookProcess','hookThreads'].includes(s.hb.type));
  const body=all.slice(cut);steps=[...head.map((s,i)=>({...s,t:(body[0]?.t||0)-300+i*20})),...body];models=false;}
 else if(arg('logs')){const ex=L.extract(arg('logs'),arg('from'),arg('to'));steps=[...L.attachSteps(game,Date.parse(arg('from'))),...L.timeline(ex,game),{t:Date.parse(arg('to')),mark:'end'}];}
 else{console.error('usage: node tools/cardinal.cjs --tape <file> | --logs <dir> --from <ISO> --to <ISO> [--game <json>] [--data <dir>] [--out <file>]');process.exit(2);}
 const lines=steps.filter(s=>s.hb?.type==='hookSource').length;console.log('# cardinal: '+lines+' dialogue lines, '+steps.length+' records, profile '+profile.gameKey+' ('+profile.layers+')');
 const scenario={game:{...game,sha:game.sha||''},steps,maxGap:rules.maxGapMs,sampleEvery:rules.sampleMs,models,tailMs:1200,attachSettleMs:models?0:2000};
 const o=await require(path.join(REPO,'services','cardinal','run.cjs')).replay(scenario,{data:arg('data',''),keep:flag('keep'),name:'cli'});
 if((o.errors||[]).length)console.log('# replay errors: '+JSON.stringify(o.errors).slice(0,800));
 const r=S.score({name:'session',steps,o},rules);
 console.log(JSON.stringify({lines:r.lines,...Display.summary(r),applies:r.applies,lag:o.lag},null,1));
 console.log('# hide: '+r.detail.leakObservation.state+(r.detail.leakObservation.state==='unconfirmed'?' (隐藏未确认)':''));
 for(const [k,v] of Object.entries(r.detail))if(v.length)console.log('# '+k+': '+v.slice(0,4).join(' | ').slice(0,600));
 if(arg('out'))fs.writeFileSync(arg('out'),JSON.stringify({scenario,result:r,out:o},null,1));
})();
