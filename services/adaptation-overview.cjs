// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E362 adaptation overview: one row per library game with three states and the evidence behind them.
   reading     reads | no-text | untested   can the hook read text? (text read in a session, or an embed/readonly verdict)
   embed       the raw hookSupport; the UI turns it into web/embed-status.js kinds (verified/supported/pending/readonly/unsupported/unknown)
   zeroLatency original-text.cjs brief(): patch | machine | needs-japanese | preparing | none | unknown
   Nothing here scans or launches: it only reads the library, the original-text state and the launch log. */
const fs=require('node:fs');
function readingState({characters,hook,hookVerifiedStream,launched}){
 if(characters>0||hook==='verified'||hook==='readonly'||hookVerifiedStream)return 'reads';
 return launched?'no-text':'untested';
}
function overview(db,root,{entries=null}={}){
 const store=require('./store.cjs'),diagnostics=require('./diagnostics.cjs');let brief=()=>'unknown';try{const ot=require('./original-text.cjs');brief=id=>ot.brief(root,id);}catch{}
 const log=entries||diagnostics.launchEntries(root),originals=new Map(db.prepare('SELECT id,original FROM games WHERE removed_at IS NULL').all().map(r=>[r.id,r.original]));
 let probeBrief=()=>null,packResults=null;try{const p=require('./adapter-probe.cjs');probeBrief=id=>p.brief(root,id);}catch{}try{packResults=require('./adapter-feed.cjs').status(root).games;}catch{}
 const games=store.games(db,root).map(g=>{
  let library={};try{library=JSON.parse(originals.get(g.id)||'{}').library||{};}catch{}
  const hook=String(library.hook||g.hookSupport||'unknown'),last=diagnostics.lastLaunch(log,g.id),streams=g.executable?diagnostics.hookStreams(root,g.executable):null;
  const ms=diagnostics.ms,launched=!!(g.lastLaunchedAt||last),evidence={lastLaunchedAt:ms(g.lastLaunchedAt),lastPlayedAt:ms(g.lastPlayedAt),characters:g.characters||0,readingSeconds:g.readingSeconds||0,hookVerifiedAt:ms(library.hookVerifiedAt),hookVerifiedStream:library.hookVerifiedStream||null,hookReadonlyAt:ms(library.hookReadonlyAt),hookStream:streams?{name:streams.name||null,embeddable:streams.embeddable??null,at:streams.at||null}:null,launch:last};
  const seen=Math.max(evidence.lastPlayedAt||0,evidence.hookVerifiedAt||0,evidence.hookReadonlyAt||0,last?.at||0,Date.parse(streams?.at||'')||0)||null;
  /* E563 hook for the probe pipeline: the last local probe (step, reader, lines, pairing) and the adapter pack in use */
  const probe=safe(()=>probeBrief(g.id),null),adapter=packResults?.[g.id]?{tag:packResults[g.id].tag,state:packResults[g.id].state}:null;
  return {probe,adapter,id:g.id,title:g.title,engine:g.engine||'',hidden:!!g.hidden,available:!!g.available,hookSupport:hook,reading:readingState({characters:g.characters||0,hook,hookVerifiedStream:library.hookVerifiedStream,launched}),zeroLatency:safe(()=>brief(g.id),'unknown'),scriptHarvest:safe(()=>g.executable?require('./script-harvest.cjs').brief(require('node:path').dirname(g.executable)):null,null),lastSeenAt:seen,evidence};
 });
 return {generatedAt:Date.now(),games};
}
const safe=(fn,fallback)=>{try{return fn();}catch{return fallback;}};
module.exports={overview,readingState};
