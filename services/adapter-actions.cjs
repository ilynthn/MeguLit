// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E563 service actions of the probe → desensitized upload → adapter pack pipeline (bridge.cjs hands every "adapter_*"
   action here). The UI hook is web/adapter-probe-ui.js; the 适配总览 dialog and the one-click problem upload call it.
     adapter_probe_start   {ids?,reason?,force?}  scan the library (or ids) in the background → status
     adapter_probe_status                          → status (+ problems when done)
     adapter_probe_cancel                          → status (the queue is kept; start again resumes)
     adapter_probe_results                         → {games:{id:brief}}
     adapter_upload_prepare {ids?}                 desensitized bundle of the problem games → {hash,bytes,chunks,manifest}
     adapter_upload_manifest {hash}                the stored bundle's manifest again
     adapter_upload        {hash,followUp?}        upload exactly that bundle (the manual path, Settings probeUpload off)
     adapter_auto_status                           automatic upload (probe-auto.cjs): switch, per-game state, log of sent
     adapter_auto_run      {ids?}                  probe-auto run now for those problem games (quiet, deduped) → results
     adapter_consent_revoke                        stop automatic follow-up probes
     adapter_packs_status                          installed packs, per-game results, waiting probe requests
     adapter_packs_sync                            fetch the feed now (worker thread)
     adapter_pack_rollback {id}                    block the active version of a pack and read its games again
   E596 runtime harvest (services/runtime-harvest.cjs; on unless turned off since 2026-11-14):
     adapter_runtime_status                        switch, per-game off list, running job, per-game finding counts
     adapter_runtime_explain {locale}              what is read, why, what may leave the PC, what never does
     adapter_runtime_enable {enabled}              the global switch (Settings: library.runtimeHarvest)
     adapter_runtime_game {gameId,enabled}         on / off for one game
     adapter_runtime_harvest {gameId,pid}          harvest a running game now (still only if allowed)
     adapter_runtime_cancel                        stop the running harvest
     adapter_runtime_findings {gameId}             the stored public findings (what an upload would carry)
     adapter_runtime_forget {gameId}               delete them */
const probe=require('./adapter-probe.cjs');
async function handle(db,root,request,runtime=null){
 const emit=(event,data)=>{try{runtime?.emit?.(event,data);}catch{}};
 const ids=Array.isArray(request.ids)?request.ids.map(String).slice(0,2000):null;
 switch(request.action){
  case 'adapter_probe_start':return probe.start(root,db,{ids,reason:String(request.reason||'manual').slice(0,30),force:request.force===true,budgetMs:Number.isFinite(request.budgetMs)?Math.max(60000,Math.min(2*3600000,request.budgetMs)):undefined,emit});
  case 'adapter_probe_status':{const s=probe.status(root);return s.state==='running'?s:{...s,problems:probe.problems(root)};}
  case 'adapter_probe_cancel':return probe.cancel(root);
  case 'adapter_probe_results':{const r=probe.results(root),out={};for(const id of Object.keys(r))out[id]=probe.brief(root,id);return {games:out};}
  case 'adapter_upload_prepare':return require('./adapter-sample.cjs').prepare(root,db,{ids,sampler:probe.sampleInWorker,titles:request.titles!==false});
  case 'adapter_upload_manifest':return require('./adapter-sample.cjs').manifest(root,String(request.hash||''))||{error:'NOT_PREPARED'};
  case 'adapter_upload':return require('./adapter-sample.cjs').upload(root,{hash:String(request.hash||''),followUp:request.followUp===true});
  case 'adapter_auto_status':return require('./probe-auto.cjs').status(root);
  case 'adapter_auto_run':return require('./probe-auto.cjs').run(root,db,{ids,probeFirst:false});
  case 'adapter_consent_revoke':return require('./adapter-sample.cjs').revoke(root);
  case 'adapter_packs_status':return require('./adapter-feed.cjs').status(root);
  case 'adapter_packs_sync':return require('./adapter-feed.cjs').syncNow(root);
  case 'adapter_runtime_status':case 'adapter_runtime_explain':case 'adapter_runtime_enable':case 'adapter_runtime_game':case 'adapter_runtime_harvest':case 'adapter_runtime_cancel':case 'adapter_runtime_findings':case 'adapter_runtime_forget':
   return require('./runtime-harvest.cjs').handle(db,root,request,emit);
  case 'adapter_pack_rollback':{const id=String(request.id||'');if(!/^[a-z0-9][a-z0-9-]{2,63}$/.test(id))throw Error('INVALID_PACK_ID');return require('./adapter-feed.cjs').rollbackNow(root,id);}
  default:throw Error('UNKNOWN_ACTION');}
}
module.exports={handle};
