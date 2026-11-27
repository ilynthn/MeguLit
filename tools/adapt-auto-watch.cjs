#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 the watch behind the scheduled task \MeguLit\Adapt-Auto (every 15 minutes): every game order the DeepSeek download
   queue finished (<queue>\done\*.json, result ok / partial, an issue number) that this watch has not handled yet is run once through
   `node tools/megulit-adapter.cjs auto <root>\<name> --name <name> --issue <n>`. No LLM anywhere (owner: 「以后新游戏来了你让脚本自动跑
   你自己不要消费token」); the main session only reads <requests>\cards (the local test bench page shows them) and
   <requests>\stuck. The runs' TEMP / TMP point at <auto root>\tmp: the scheduled task writes nothing on C:.

     node tools/adapt-auto-watch.cjs [--queue <done dir>] [--state <file>] [--dry] [--follow-main]
     node tools/adapt-auto-watch.cjs --baseline          mark every order already done as handled (no run): the first install
     node tools/adapt-auto-watch.cjs --install-task      register \MeguLit\Adapt-Auto (schtasks, every 15 minutes, this checkout)

   State <auto root>\watch-state.json {orders:{<name>:{at, exit, dir, why}}}: an order is run once; a stuck one (exit 3) is not
   retried by the watch (a person decides, then reruns auto by hand). A second watch while one runs exits at once (watch.lock).
   --follow-main moves this checkout (a dedicated worktree, never a working branch) to origin/main first when origin/main has this
   watch, so a merged fix reaches the next run. Orders: name and root from the order file (root default E:\gal\adapt); orders
   without an issue (experiments, tools) are skipped. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const REPO=path.join(__dirname,'..');
const AUTO_ROOT=()=>process.env.MEGULIT_AUTO_ROOT||'F:\\Agent\\work\\adapt-auto';
const QUEUE=()=>process.env.MEGULIT_AUTO_QUEUE||'F:\\Agent\\deepseek\\queue\\done';
const DEFAULT_ROOT='E:\\gal\\adapt',TASK='\\MeguLit\\Adapt-Auto';

const readJson=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));}catch{return null;}};
function parse(argv){const o={queue:QUEUE(),state:path.join(AUTO_ROOT(),'watch-state.json'),dry:false,baseline:false,followMain:false,installTask:false};
 for(let i=0;i<argv.length;i++){const k=argv[i],v=()=>argv[++i];
  if(k==='--queue')o.queue=v();else if(k==='--state')o.state=v();else if(k==='--dry')o.dry=true;else if(k==='--baseline')o.baseline=true;
  else if(k==='--follow-main')o.followMain=true;else if(k==='--install-task')o.installTask=true;else throw Error('unknown argument: '+k);}
 return o;}

/* -> [{name, dir, issue, file}] the orders a run is due for, oldest first; each other order with why it is skipped */
function orders(queue,state){let files=[];try{files=fs.readdirSync(queue).filter(f=>/\.json$/i.test(f));}catch{}
 const due=[],skipped=[];
 for(const f of files.map(f=>path.join(queue,f)).sort((a,b)=>fs.statSync(a).mtimeMs-fs.statSync(b).mtimeMs)){const j=readJson(f);
  if(!j||!j.name){skipped.push({file:f,why:'读不了'});continue;}
  if(state.orders[j.name]&&!state.orders[j.name].running)continue;
  const issue=Number(j.issue)||0;
  if(!['ok','partial'].includes(String(j.result||'').toLowerCase())){skipped.push({name:j.name,why:'下载结果 '+(j.result||'无')});continue;}
  if(!issue){skipped.push({name:j.name,why:'没有 issue 号（实验/工具单）'});continue;}
  due.push({name:j.name,dir:path.join(j.root||DEFAULT_ROOT,j.name),issue,file:f});}
 return {due,skipped};}

/* one watch at a time: watch.lock holds the pid; a dead pid's lock is taken over */
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
function lock(file){fs.mkdirSync(path.dirname(file),{recursive:true});
 for(let i=0;i<2;i++){try{const fd=fs.openSync(file,'wx');fs.writeSync(fd,String(process.pid));fs.closeSync(fd);return ()=>{try{fs.rmSync(file,{force:true});}catch{}};}
  catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(fs.readFileSync(file,'utf8'))||0;if(pid&&alive(pid))return null;fs.rmSync(file,{force:true});}}
 return null;}

function followMain(log){const g=(...a)=>spawnSync('git',a,{cwd:REPO,encoding:'utf8',windowsHide:true,timeout:300000});
 if(g('fetch','-q','origin','main').status!==0){log('# git fetch 失败，用当前检出');return;}
 if(g('cat-file','-e','origin/main:tools/adapt-auto-watch.cjs').status!==0){log('# origin/main 还没有 auto，留在当前检出');return;}
 if(String(g('status','--porcelain','--untracked-files=no').stdout).trim()){log('# 检出有改动，不跟 main');return;}
 const r=g('checkout','-q','--detach','origin/main');log(r.status===0?'# 检出跟到 origin/main':'# 跟 main 失败：'+String(r.stderr).trim());}

function runAuto(order){const tmp=path.join(AUTO_ROOT(),'tmp');fs.mkdirSync(tmp,{recursive:true});
 const r=spawnSync(process.execPath,[path.join(REPO,'tools','megulit-adapter.cjs'),'auto',order.dir,'--name',order.name,'--issue',String(order.issue)],{env:{...process.env,TEMP:tmp,TMP:tmp,MEGULIT_GAME_LOCKS:process.env.MEGULIT_GAME_LOCKS||path.join(tmp,'locks')},encoding:'utf8',windowsHide:true,timeout:6*3600000,maxBuffer:64<<20});
 return {exit:r.status===null?1:r.status,out:String(r.stdout||'')+String(r.stderr||'')};}

function installTask({node=process.execPath,run=spawnSync}={}){const tr='"'+node+'" "'+path.join(REPO,'tools','adapt-auto-watch.cjs')+'" --follow-main';
 const r=run('schtasks.exe',['/Create','/F','/TN',TASK,'/SC','MINUTE','/MO','15','/TR',tr],{encoding:'utf8',windowsHide:true});
 return {ok:r.status===0,out:String(r.stdout||'')+String(r.stderr||''),tr};}

async function main(argv,{log=console.log,run=runAuto}={}){let o;try{o=parse(argv);}catch(e){console.error('adapt-auto-watch: '+e.message);return 2;}
 if(o.installTask){const r=installTask();log(r.out.trim());return r.ok?0:1;}
 const state=readJson(o.state)||{orders:{}};state.orders=state.orders||{};
 const save=()=>{fs.mkdirSync(path.dirname(o.state),{recursive:true});fs.writeFileSync(o.state,JSON.stringify(state,null,1)+'\n');};
 const release=lock(path.join(path.dirname(o.state),'watch.lock'));if(!release){log('# 另一个 watch 在跑');return 0;}
 try{if(o.followMain)followMain(log);
  const {due,skipped}=orders(o.queue,state);for(const s of skipped)if(s.name&&!state.orders[s.name]){state.orders[s.name]={at:new Date().toISOString(),skipped:s.why};}
  if(o.baseline){for(const d of due)state.orders[d.name]={at:new Date().toISOString(),baseline:true,dir:d.dir};save();log('# baseline：'+due.length+' 单记为已处理');return 0;}
  save();if(!due.length){log('# 没有新下载');return 0;}
  for(const d of due){log('# auto '+d.name+' '+d.dir);if(o.dry)continue;
   if(!fs.existsSync(d.dir)){state.orders[d.name]={at:new Date().toISOString(),exit:3,dir:d.dir,why:'下载目录不存在'};save();continue;}
   state.orders[d.name]={at:new Date().toISOString(),running:true,dir:d.dir};save();
   const r=run(d);state.orders[d.name]={at:new Date().toISOString(),exit:r.exit,dir:d.dir,tail:String(r.out||'').trim().split('\n').slice(-4).join('\n')};save();log('#   exit '+r.exit);}
  return 0;}
 finally{release();}}
if(require.main===module)main(process.argv.slice(2)).then(c=>{process.exitCode=c;});
module.exports={main,orders,lock,parse,installTask,TASK};
