// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E596 runtime harvest worker: native/RuntimeHarvest.exe + the analysis, in a child process at low priority, so a long
   scan never blocks the service. The service kills this process to cancel; it sends back public findings only (the
   local ones, with raw windows, never leave this process). */
process.on('message',async m=>{if(m?.type!=='harvest')return;
 let result;try{const rh=require('./runtime-harvest.cjs');const ctx=rh.dumpContext(m.dir);
  const local=await rh.scan({pid:m.pid,archives:rh.archivesOf(m.dir),pairs:ctx.pairs,budgetMs:m.budgetMs,budgetMb:m.budgetMb});
  result=rh.publicize(local,{dumps:ctx.dumps});}catch(e){result={error:String(e?.message||e).slice(0,40)};}
 try{process.send({type:'result',result},()=>process.exit(0));}catch{process.exit(0);}});
process.on('disconnect',()=>process.exit(0));
