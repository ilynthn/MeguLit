// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const path=require('node:path'),readline=require('node:readline');
const {dispatch}=require('./bridge.cjs'),{Runtime}=require('./runtime.cjs');
const root=(process.env.MEGULIT_ROOT||process.env.TOME_FINAL_ROOT)?path.resolve(process.env.MEGULIT_ROOT||process.env.TOME_FINAL_ROOT):path.resolve(__dirname,'..');
const reply=value=>process.stdout.write(JSON.stringify(value)+'\n');
const runtime=new Runtime(root,(event,data)=>reply({event,data}));let closing=false,active=0,maintenance=false;
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
async function handle(line){
 let id=null,counted=false,exclusive=false;
 try{if(line.length>512*1024)throw Error('REQUEST_TOO_LARGE');const envelope=JSON.parse(line);id=envelope.id;const request=envelope.request;
  if(!Number.isSafeInteger(id)||!request||typeof request.action!=='string')throw Error('INVALID_REQUEST');
  if(request.action==='__shutdown'){closing=true;await runtime.stop();reply({id,ok:true,data:{stopped:true}});input.close();return;}
  if(closing)throw Error('RUNTIME_STOPPED');if(maintenance)throw Error('BACKUP_BUSY');if(request.action==='backup_apply'){if(active)throw Error('BACKUP_BUSY');maintenance=true;exclusive=true;}active++;counted=true;const data=await dispatch(request,runtime);reply({id,ok:true,data});
 }catch(error){const code=/^[A-Z_]+$/.test(error?.message)?error.message:'SERVICE_FAILED';
  /* E405 an unexpected exception used to vanish behind SERVICE_FAILED; its action, message and first stack lines go to
     logs/service-errors.log (request data never does) */
  if(code==='SERVICE_FAILED')try{const fs=require('node:fs'),file=path.join(root,'logs','service-errors.log');fs.mkdirSync(path.dirname(file),{recursive:true});if((fs.statSync(file,{throwIfNoEntry:false})?.size||0)>512*1024)fs.renameSync(file,file+'.previous');let action='';try{action=String(JSON.parse(line)?.request?.action||'').slice(0,60);}catch{}fs.appendFileSync(file,new Date().toISOString()+' '+action+' '+String(error?.stack||error).split(/\r?\n/).slice(0,6).join(' | ')+'\n');}catch{}
  reply({id,ok:false,error:code});}finally{if(counted)active--;if(exclusive)maintenance=false;}
}
setTimeout(()=>{if(!closing)runtime.ankiProcess().auto().catch(()=>{});},1500).unref();
/* E361 read library games' scripts in a worker thread, a while after start */
try{require('./script-prewarm.cjs').start(root,{onDone:()=>{/* E545 scripts read by the prewarm reach a running game */try{runtime.reader?.refreshTextSource?.({force:false});}catch{}if(!closing)reply({event:'library-updated',data:{}});}});}catch{}
/* E562 adapter packs between releases (feed sync in a worker thread, 3 min after start, then every 6 h); E560 a library
   probe the app was closed in the middle of goes on later */
try{require('./adapter-feed.cjs').start(root);}catch{}
try{require('./adapter-probe.cjs').resumeLater(root,()=>require('./store.cjs').openStore(root));}catch{}
input.on('line',line=>{handle(line).catch(()=>{});});
/* E426 the host is gone once stdin closes: a stop that never settles must not leave node.exe and its bridges behind */
input.on('close',()=>{closing=true;setTimeout(()=>process.exit(0),6000).unref();runtime.stop().finally(()=>process.exit(0));});
