// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E297 cold run (user, 2026-11-11): KiriKiri Z games whose archives carry an "Hxv4" index (cxdec v2, サノバウィッチ) can
// only be read by the game itself. When the library finds one, MeguLit starts it once in the background — minimised,
// without focus, muted — through native/ColdCapture<bit>.exe, which loads MeguLitScn<bit>.dll; the DLL has the game's own
// plug-in read every scene file into the capture folder (kirikiri-dump reads it) and the game is closed at once.
// One game at a time, once per game (a failure is recorded, not retried by itself), only while the setting is on.
const fs=require('node:fs'),path=require('node:path'),{execFile,execFileSync}=require('node:child_process');
const xp3=require('./original-engines/xp3.cjs');
// Same rule as the DLL (ScnCapture.cpp MediaArchive / DumpHx): media archives are skipped, and when scn*.xp3 exist only
// they are read (the scene files live there).
const MEDIA=['bgimage','fgimage','evimage','image','bgm','voice','sound','se.','movie','video','thum','emote','font','sysse'];
const media=f=>MEDIA.some(m=>f.toLowerCase().includes(m));
const nativeDir=()=>path.join(__dirname,'..','native');
const stateFile=root=>path.join(root,'data','config','kirikiri-cold.json');
function readState(root){try{return JSON.parse(fs.readFileSync(stateFile(root),'utf8'))||{};}catch{return {};}}
function writeState(root,key,value){const all=readState(root);all[key]={...value,at:Date.now()};try{fs.mkdirSync(path.dirname(stateFile(root)),{recursive:true});fs.writeFileSync(stateFile(root)+'.tmp',JSON.stringify(all,null,1));fs.renameSync(stateFile(root)+'.tmp',stateFile(root));}catch{}}
const dump=()=>require('./original-engines/scenes.cjs').ENGINES['kirikiri-dump'];
// The game's non-media archives with an Hxv4 index.
function hxArchives(dir){let names=[];try{names=fs.readdirSync(dir).filter(f=>/\.xp3$/i.test(f)&&!media(f));}catch{return [];}const scn=names.filter(f=>/^scn/i.test(f));return (scn.length?scn:names).filter(f=>xp3.indexTags(path.join(dir,f)).includes('Hxv4'));}
// Already read: the DLL leaves hx-done-<archive>.txt for every archive it went through.
function prepared(dir,archives=hxArchives(dir)){const d=dump().captureDir(dir);return archives.length>0&&archives.every(a=>fs.existsSync(path.join(d,'hx-done-'+a.toLowerCase()+'.txt')));}
/* E580 kit.peInfo */
function bitness(exe){const i=require('./original-engines/kit.cjs').peInfo(exe);return i?(i.machine===0x14c?'32':'64'):'';}
function running(exe){try{const out=execFileSync('tasklist',['/FI','IMAGENAME eq '+path.basename(exe),'/FO','CSV','/NH'],{windowsHide:true,encoding:'utf8',timeout:8000});return out.toLowerCase().includes('"'+path.basename(exe).toLowerCase()+'"');}catch{return false;}}
const queue=[],active=new Set();let busy=false;const listeners=new Set();
// What the game detail / text source dialog shows: 'preparing' while this game's cold run is queued or running.
function status(root,exe){const dir=path.dirname(String(exe||'')),key=dump().captureKey(dir);if(active.has(key)||queue.some(j=>j.key===key))return {state:'preparing'};const s=readState(root)[key];return s?{state:s.result==='done'?'ready':'failed',result:s.result,at:s.at}:{state:'none'};}
// Queue one game if it needs a cold run. force: the user asked again (the dialog's 重新查找), so an earlier failure is retried.
function consider(root,game,{enabled=true,force=false}={}){
 if(!enabled||!game?.executable||process.platform!=='win32')return false;
 const exe=game.executable,dir=path.dirname(exe),archives=hxArchives(dir);if(!archives.length||prepared(dir,archives))return false;
 const key=dump().captureKey(dir);if(active.has(key)||queue.some(j=>j.key===key))return true;
 if(readState(root)[key]&&!force)return false;
 const bit=bitness(exe),helper=path.join(nativeDir(),'ColdCapture'+bit+'.exe'),dll=path.join(nativeDir(),'MeguLitScn'+bit+'.dll');
 if(!bit||!fs.existsSync(helper)||!fs.existsSync(dll))return false;
 queue.push({root,key,exe,dir,helper,dll,id:game.id});next();return true;
}
function next(){
 if(busy||!queue.length)return;const job=queue.shift();busy=true;active.add(job.key);
 const finish=result=>{writeState(job.root,job.key,{result,exe:job.exe});active.delete(job.key);busy=false;log(job.root,job.exe+' '+result);for(const f of listeners)try{f(job,result);}catch{}next();};
 // The player has the game open: its own hook reads the archives, nothing to start.
 if(isRunning(job.exe))return finish('running');
 const d=dump().captureDir(job.dir);try{fs.mkdirSync(d,{recursive:true});}catch{}
 runner(job,path.join(d,'cold-done.txt'),word=>finish(word==='done'&&prepared(job.dir)?'done':word==='done'?'empty':word||'failed'));
}
// The helper process; tests replace it.
let runner=(job,report,done)=>execFile(job.helper,[job.exe,job.dll,report,'45'],{windowsHide:true,timeout:120000},(error,stdout)=>done(String(stdout||'').trim().split(/\s+/).pop()||(error?'failed':'')));
let isRunning=running;
function log(root,line){try{fs.mkdirSync(path.join(root,'logs'),{recursive:true});fs.appendFileSync(path.join(root,'logs','kirikiri-cold.log'),new Date().toISOString()+' '+line+'\n');}catch{}}
// After a library scan: every game that needs it, one after another.
function considerLibrary(root,games,options){let n=0;for(const g of games||[])if(consider(root,g,options))n++;return n;}
const onDone=f=>{listeners.add(f);return ()=>listeners.delete(f);};
module.exports={_setRunner:(f,r)=>{runner=f;if(r)isRunning=r;},consider,considerLibrary,status,prepared,hxArchives,bitness,onDone,_queue:queue};
