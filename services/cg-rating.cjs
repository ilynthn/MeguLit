// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 (user: no per-game rule, a switch that filters R18 pictures off the card back). With the switch on, the card
   back shows only CGs a local anime rating model has called safe (services/cg-rating.py: deepghs/anime_rating, MIT,
   mobilenetv3 then caformer_s36_plus, on the CPU). Pictures are rated in the background, one at a time at below-normal
   priority, and remembered per game (data/cg-cache/<game>/ratings.json); until a picture is rated it is not shown.
   The models (17 MB + 150 MB) and the Python packages are fetched the first time the switch needs them; nothing is
   sent anywhere, the pictures never leave the computer. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto'),{execFile,spawn}=require('node:child_process'),{Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const REVISION='46be80bfe01a415efa5aa7c025528cac82a8b88a',REPOSITORY='deepghs/anime_rating';
const MODELS=[
 {name:'rating-small.onnx',file:'mobilenetv3_v1_pruned_ls0.1/model.onnx',size:16827558,sha256:'76e5c44704421e2b6431a2dbb395f8943e205e59f415a5614b16f0601b55544d'},
 {name:'rating-large.onnx',file:'caformer_s36_plus/model.onnx',size:149582900,sha256:'fd5fdea9a8b610aa26a513df7e2e588a3fa0f641ba3408e5c67501663f501287'}];
const PACKAGES=['numpy==2.5.4','onnxruntime==1.31.1','pillow==12.3.0'];
const HF=['https://huggingface.co','https://hf-mirror.com','https://dl.megulit.com/hf','https://cn-dl.megulit.com/hf'];
const PYPI=[null,'https://pypi.tuna.tsinghua.edu.cn/simple','https://mirrors.aliyun.com/pypi/simple/'];
const dir=root=>path.join(root,'data','cg-rating'),pylib=root=>path.join(dir(root),'pylib'),modelPath=(root,m)=>path.join(dir(root),m.name);
const pythonExe=()=>{if(process.env.MEGULIT_RATING_PYTHON)return process.env.MEGULIT_RATING_PYTHON;try{const own=require('../core/layout.cjs').python;if(fs.existsSync(own))return own;}catch{}return null;};
const script=path.join(__dirname,'cg-rating.py');
const log=(root,m)=>{try{fs.appendFileSync(path.join(root,'logs','cg-rating.log'),new Date().toISOString()+' '+m+'\n');}catch{}};
function ready(root){try{return MODELS.every(m=>fs.statSync(modelPath(root,m)).size===m.size)&&['onnxruntime','numpy','PIL'].every(p=>fs.existsSync(path.join(pylib(root),p)))&&!!pythonExe();}catch{return false;}}
function run(file,args,timeout){return new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout,maxBuffer:8<<20},(e,out,err)=>e?reject(Object.assign(e,{stderr:String(err||'')})):resolve(String(out||''))));}
async function fetchModel(root,m){
 const file=modelPath(root,m),tmp=file+'.part';if(fs.existsSync(file)&&fs.statSync(file).size===m.size)return;let last;
 for(const source of HF){const url=source+'/'+REPOSITORY+'/resolve/'+REVISION+'/'+m.file,controller=new AbortController();let idle=setTimeout(()=>controller.abort(),30000);
  try{log(root,m.name+' from '+source);const response=await fetch(url,{signal:controller.signal});if(!response.ok||!response.body)throw Error('HTTP '+response.status);
   const hash=createHash('sha256');let size=0;const check=new Transform({transform(chunk,enc,done){clearTimeout(idle);idle=setTimeout(()=>controller.abort(),30000);size+=chunk.length;if(size>m.size)return done(Error('too large'));hash.update(chunk);done(null,chunk);}});
   await pipeline(Readable.fromWeb(response.body),check,fs.createWriteStream(tmp));
   if(size!==m.size||hash.digest('hex')!==m.sha256){fs.rmSync(tmp,{force:true});throw Error('checksum');}
   fs.renameSync(tmp,file);return;
  }catch(e){last=e;log(root,'model source failed '+source+' '+(controller.signal.aborted?'stalled':e.message));}finally{clearTimeout(idle);}}
 throw Error('MODEL_DOWNLOAD_FAILED '+(last?.message||''));}
async function installPackages(root){
 const py=pythonExe();if(!py)throw Error('PYTHON_MISSING');const target=pylib(root);if(['onnxruntime','numpy','PIL'].every(p=>fs.existsSync(path.join(target,p))))return;let last;
 for(const index of PYPI){try{log(root,'pip '+(index||'pypi.org'));fs.rmSync(target,{recursive:true,force:true});
   await run(py,['-I','-m','pip','install','--disable-pip-version-check','--no-warn-script-location','--only-binary=:all:','--target',target,...(index?['--index-url',index]:[]),...PACKAGES],600000);return;
  }catch(e){last=e;log(root,'pip failed '+(index||'pypi.org')+' '+String(e.stderr||e.message).slice(-300));}}
 throw Error('PACKAGES_FAILED '+(last?.message||''));}
let preparing=null,failedAt=0,lastError='';
/* fetch the models and packages once; a failure waits ten minutes before another try */
function prepare(root){if(ready(root))return Promise.resolve(true);if(process.env.MEGULIT_RATING_NO_FETCH)return Promise.resolve(false);if(preparing)return preparing;if(Date.now()-failedAt<600000)return Promise.resolve(false);
 fs.mkdirSync(dir(root),{recursive:true});preparing=(async()=>{try{await Promise.all([...MODELS.map(m=>fetchModel(root,m)),installPackages(root)]);log(root,'ready');return ready(root);}catch(e){failedAt=Date.now();lastError=e.message;log(root,'prepare failed '+e.message);return false;}finally{preparing=null;}})();return preparing;}

/* ---- the rating worker: one Python process, kept while there is work, ended a minute after the last picture ---- */
let worker=null;
function startWorker(root){
 const py=spawn(pythonExe(),['-I',script,pylib(root),...MODELS.map(m=>modelPath(root,m))],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 try{os.setPriority(py.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
 const w={py,buf:'',waiting:[],ready:false,timer:null};
 py.stdout.setEncoding('utf8');py.stdout.on('data',d=>{w.buf+=d;let i;while((i=w.buf.indexOf('\n'))>=0){const line=w.buf.slice(0,i);w.buf=w.buf.slice(i+1);let msg;try{msg=JSON.parse(line);}catch{continue;}if(msg.ready){w.ready=true;continue;}const cb=w.waiting.shift();if(cb)cb(msg);}});
 py.stderr.on('data',d=>log(root,'py '+String(d).slice(0,300)));
 py.on('exit',()=>{for(const cb of w.waiting.splice(0))cb({error:'exited'});if(worker===w)worker=null;});const fail=()=>{for(const cb of w.waiting.splice(0))cb({error:'exited'});if(worker===w)worker=null;};py.on('error',fail);py.stdin.on('error',()=>{});
 return w;}
function ask(root,file){return new Promise(resolve=>{if(!worker)worker=startWorker(root);const w=worker;clearTimeout(w.timer);w.waiting.push(msg=>{clearTimeout(w.timer);w.timer=setTimeout(()=>{if(worker===w)worker=null;try{w.py.stdin.end();}catch{}},60000);w.timer.unref?.();resolve(msg);});try{w.py.stdin.write(file+'\n');}catch{resolve({error:'write'});}});}

/* ---- ratings per game ---- */
const ratingsFile=cacheDir=>path.join(cacheDir,'ratings.json');
function ratings(cacheDir){try{return JSON.parse(fs.readFileSync(ratingsFile(cacheDir),'utf8'))||{};}catch{return {};}}
function remember(cacheDir,name,value){const all=ratings(cacheDir);all[name]=value;try{fs.mkdirSync(cacheDir,{recursive:true});fs.writeFileSync(ratingsFile(cacheDir)+'.tmp',JSON.stringify(all));fs.renameSync(ratingsFile(cacheDir)+'.tmp',ratingsFile(cacheDir));}catch{}}
/* a picture is shown only when the model's answer is safe */
const isSafe=v=>!!v&&v.label==='safe';
const queue=[],queued=new Set();let busy=false;
/* names to rate for one game; picture(name) gives the cached picture file (the card back's own cache) */
function rateLater(root,cacheDir,names,picture){
 const fresh=names.filter(n=>!queued.has(cacheDir+'|'+n));if(!fresh.length)return;
 for(let i=fresh.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[fresh[i],fresh[j]]=[fresh[j],fresh[i]];}/* a random order: the first rated are a varied few */
 for(const n of fresh){queued.add(cacheDir+'|'+n);queue.push({root,cacheDir,name:n,picture});}pump();}
async function pump(){
 if(busy||!queue.length)return;busy=true;
 try{const root=queue[0].root;if(!ready(root)&&!(await prepare(root))){for(const j of queue.splice(0))queued.delete(j.cacheDir+'|'+j.name);return;}
  while(queue.length){const job=queue.shift();let file='';try{file=job.picture(job.name);}catch(e){log(job.root,'picture failed '+job.name+' '+e.message);}
   if(file){const r=await ask(job.root,file);if(r&&!r.error)remember(job.cacheDir,job.name,{label:r.label,safe:r.safe,r15:r.r15,r18:r.r18,model:r.model});else log(job.root,'rate failed '+job.name+' '+(r&&r.error));}
   queued.delete(job.cacheDir+'|'+job.name);}
 }finally{busy=false;}}
const status=root=>({ready:ready(root),preparing:!!preparing,error:lastError,queued:queue.length});
module.exports={MODELS,PACKAGES,ready,prepare,ratings,isSafe,rateLater,status,_ask:ask};
