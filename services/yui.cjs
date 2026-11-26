// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const relay=require('./relay-config.cjs');
const faults=new Set(['instance-failed','runtime-unavailable','hot-reload-failed','desktop-failed','webview-failed','service-failed','service-timeout','service-disconnected','startup-failed','route-failed','frontend-error','frontend-rejection','frontend-rejection-service','frontend-rejection-abort','native-panic','document-timeout','reveal-timeout','game-hook-failed','game-hook-stopped','hook-components-missing']);
const stages=new Set([...faults,'native-entry','process-start','runtime-ready','splash-start','webview-build-start','webview-built','service-start','service-replied','document','home-ready','content-painted','notice-open','notice-painted','notice-closed','hot-reload','first-window-ready','window-revealed','closed','service-home-start','service-home-done']);
const sessionPattern=/^\d{13}-\d{1,10}$/;
const stateFile=root=>path.join(root,'data/config/yui.json');
const queueFile=root=>path.join(root,'logs/yui-outbox.json');
function read(file){
 try{
  if(fs.statSync(file).size>512*1024)return {};
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  return value && typeof value==='object' && !Array.isArray(value)?value:{};
 }catch{return {};}
}
function save(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,file);}
function consent(root){const v=read(stateFile(root));return v.enabled===true && /^[a-f0-9]{64}$/.test(v.key) && Number.isSafeInteger(v.since)?v:null;}
const active=new Map();
function setEnabled(root,on){
 if(typeof on!=='boolean')throw Error('INVALID_CHOICE');
 if(on && !consent(root))save(stateFile(root),{enabled:true,since:Date.now(),key:crypto.randomBytes(32).toString('hex')});
 if(!on){save(stateFile(root),{enabled:false});active.get(root)?.abort();fs.rmSync(queueFile(root),{force:true});}
 return {enabled:on};
}
function sessions(root,current=process.env.MEGULIT_YUI_SESSION){
 const dir=path.join(root,'logs/yui');let names;try{names=fs.readdirSync(dir);}catch{return [];}
 return names.filter(n=>n.endsWith('.log')&&sessionPattern.test(n.slice(0,-4))).sort().slice(-12).flatMap(name=>{
  const session=name.slice(0,-4),file=path.join(dir,name);let data;
  try{if(fs.statSync(file).size>65536)return [];data=fs.readFileSync(file,'utf8');}catch{return [];}
  /* 2026-11-26 "<ms> ~<stage> <detail>" (desktop yui_detail): the local cause of a frontend fault, for this PC's diagnostics only; flush() reads events, never details */
  const details=data.split('\n').flatMap(line=>{const m=/^(\d{1,12}) ~([a-z-]+) (.{0,240})$/.exec(line.replace(/\r$/,''));return m&&faults.has(m[2])?[{ms:Number(m[1]),stage:m[2],detail:m[3]}]:[];}).slice(0,64);
  const events=data.split('\n').flatMap(line=>{const m=/^(\d{1,12}) ([a-z-]+)$/.exec(line.replace(/\r$/,''));return m && stages.has(m[2])?[{ms:Number(m[1]),stage:m[2]}]:[];}).slice(0,256);
  if(!events.length)return [];
  const terminal=events.at(-1).stage,state=terminal==='closed'?'closed':['desktop-failed','webview-failed','runtime-unavailable','instance-failed','native-panic'].includes(terminal)?'failed':session===current?'running':'interrupted';
  const firstPaint=events.find(e=>e.stage==='content-painted');
  const notice=events.find(e=>e.stage==='notice-open'),noticePaint=events.find(e=>e.stage==='notice-painted');
  const reveal=events.find(e=>e.stage==='window-revealed');
  const slow=!!(firstPaint && firstPaint.ms>=10000 || reveal && reveal.ms>=10000 || notice && noticePaint && noticePaint.ms-notice.ms>=2000);
  return [{session,state,slow,events,...(details.length?{details}:{})}];
 });
}
async function flush(root,{fetcher=globalThis.fetch,urls}={}){
 const grant=consent(root);if(!grant || active.has(root))return;
 const controller=new AbortController();active.set(root,controller);
 try{
  const saved=read(queueFile(root)),previous=saved.since===grant.since?saved:{},pending=new Map(),seen=new Set(Array.isArray(previous.seen)?previous.seen.slice(-4096):[]);
  function accept(v){if(v && /^[a-f0-9]{64}$/.test(v.id)&&faults.has(v.stage)&&stages.has(v.previous)&&Number.isSafeInteger(v.ms)&&v.ms>=0&&v.ms<=86400000)pending.set(v.id,{id:v.id,stage:v.stage,previous:v.previous,ms:v.ms});}
  for(const v of Array.isArray(previous.pending)?previous.pending.slice(-64):[])accept(v);
  for(const {session,events} of sessions(root))for(const [index,e] of events.entries()){
   if(!faults.has(e.stage)||Number(session.split('-')[0])+e.ms<grant.since)continue;
   const id=crypto.createHmac('sha256',grant.key).update(session+'/'+index+'/'+e.stage).digest('hex');
   if(!seen.has(id)){accept({id,stage:e.stage,previous:events[index-1]?.stage||'native-entry',ms:Math.min(e.ms,86400000)});seen.add(id);}
  }
  const records=[...pending.values()].slice(-64);
  const persist=()=>save(queueFile(root),{since:grant.since,pending:records,seen:[...seen].slice(-4096)});
  if(!records.length)return;
  persist();
  const targets=urls??relay.endpoints(root,'/api/yui');
  while(records.length && !controller.signal.aborted && consent(root)?.key===grant.key){
   let ok=false;
   for(const url of targets){try{const r=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(records[0]),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});if(r.ok&&(await r.json()).ok===true){ok=true;break;}}catch{}if(controller.signal.aborted)break;}
   if(!ok||controller.signal.aborted||consent(root)?.key!==grant.key)break;
   records.shift();persist();
  }
 }finally{active.delete(root);}
}
function start(root){const run=()=>flush(root).catch(()=>{});setTimeout(run,1000).unref();setInterval(run,60000).unref();}
module.exports={sessions,setEnabled,enabled:root=>!!consent(root),flush,start,faults};
