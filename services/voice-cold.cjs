// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E450 Voices a scan names but cannot open (archives whose names are hashed or whose key is not known: 千恋＊万花's
   voice.xp3) are read by the game itself, the way the cold run reads Hxv4 scenes (kirikiri-cold.cjs): MeguLit starts the
   game once in the background (minimised, no focus, muted) through native/ColdCapture<bit>.exe with the engine's capture
   DLL, hands it the wanted voice names, the DLL opens each one through the engine's own storage (its archives, its
   decryption) and saves the bytes, and the game is closed when every name was tried.
   Per engine: HOOKS says which helper and DLL read that engine, how a script's voice name becomes a storage name and where
   the DLL leaves the clips. An engine without an entry is never started. One game at a time, once per game unless a
   later scan finds more voices missing; only while the cold-run setting is on. */
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
const nativeDir=()=>path.join(__dirname,'..','native');
const dump=()=>require('./original-engines/scenes.cjs').ENGINES['kirikiri-dump'];
const HOOKS={
 kirikiri:{engines:/^kirikiri(?!-cg)/,helper:'ColdCapture',dll:'MeguLitScn',
  want:ref=>[ref+'.ogg',ref+'.opus'],
  wantFile:dir=>path.join(dump().captureDir(dir),'want.txt'),
  report:dir=>path.join(dump().captureDir(dir),'cold-done.txt'),
  outDir:dir=>path.join(dump().captureDir(dir),'voice')},
 /* 2026-11-12 card back CGs (game-cg.cjs): pictures the game's save records as seen but MeguLit cannot open (an
    archive only the game can decrypt) are read the same way and land in cg\ */
 'kirikiri-cg':{engines:/^kirikiri-cg$/,kind:'cg',helper:'ColdCapture',dll:'MeguLitScn',
  want:ref=>[ref+'.png',ref+'.tlg',ref+'.jpg'],
  wantFile:dir=>path.join(dump().captureDir(dir),'want.txt'),
  report:dir=>path.join(dump().captureDir(dir),'cold-done.txt'),
  outDir:dir=>path.join(dump().captureDir(dir),'cg')},
};
const hookFor=engine=>Object.values(HOOKS).find(h=>h.engines.test(String(engine||'')))||null;
// Folders where a cold run left clips for a game folder (game-voice.cjs adds them to the catalog).
function outDirs(dir){const out=[];for(const h of Object.values(HOOKS)){if(h.kind)continue;try{const d=h.outDir(dir);if(fs.existsSync(d))out.push(d);}catch{}}return out;}
const stateFile=root=>path.join(root,'data','voice-cache','cold.json');
function readState(root){try{return JSON.parse(fs.readFileSync(stateFile(root),'utf8'))||{};}catch{return {};}}
function writeState(root,key,value){const all=readState(root);all[key]={...value,at:Date.now()};try{fs.mkdirSync(path.dirname(stateFile(root)),{recursive:true});fs.writeFileSync(stateFile(root)+'.tmp',JSON.stringify(all,null,1));fs.renameSync(stateFile(root)+'.tmp',stateFile(root));}catch{}}
/* E580 kit.peInfo */
function bitness(exe){const i=require('./original-engines/kit.cjs').peInfo(exe);return i?(i.machine===0x14c?'32':'64'):'';}
const queue=[],listeners=new Set();let busy=false;
// Seconds the helper waits: about 50 voices a message tick, with room for start-up.
const secondsFor=n=>Math.min(1200,60+Math.ceil(n/40));
// game: {executable, dir, engine}; missing: script voice names the scan could not open.
function consider(root,game,missing,{enabled=true,force=false}={}){
 if(!enabled||!game?.executable||!missing?.length||process.platform!=='win32'&&!consider.anyPlatform)return false;
 const hook=hookFor(game.engine);if(!hook)return false;
 const key=String(path.resolve(game.dir)).toLowerCase()+(hook.kind?'|'+hook.kind:''),prior=readState(root)[key];
 if(queue.some(j=>j.key===key))return true;
 if(prior&&!force&&prior.missing<=missing.length)return false;
 const bit=bitness(game.executable),helper=path.join(nativeDir(),hook.helper+bit+'.exe'),dll=path.join(nativeDir(),hook.dll+bit+'.dll');
 if(!bit||(!consider.anyPlatform&&(!fs.existsSync(helper)||!fs.existsSync(dll))))return false;
 queue.push({root,key,game,hook,helper,dll,missing:[...missing]});next();return true;}
function next(){
 if(busy||!queue.length)return;const job=queue.shift();busy=true;
 const finish=result=>{let saved=0;try{saved=fs.readdirSync(job.hook.outDir(job.game.dir)).length;}catch{}writeState(job.root,job.key,{result,missing:job.missing.length,saved});busy=false;for(const f of listeners)try{f(job,result);}catch{}next();};
 try{const file=job.hook.wantFile(job.game.dir);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,job.missing.flatMap(job.hook.want).join('\n')+'\n');}catch{return finish('failed');}
 // The player has the game open: the capture DLL already in it reads want.txt, nothing to start.
 if(isRunning(job.game.executable))return finish('running');
 runner(job,secondsFor(job.missing.length),word=>finish(word||'failed'));}
let isRunning=exe=>{try{const out=require('node:child_process').execFileSync('tasklist',['/FI','IMAGENAME eq '+path.basename(exe),'/FO','CSV','/NH'],{windowsHide:true,encoding:'utf8',timeout:8000});return out.toLowerCase().includes('"'+path.basename(exe).toLowerCase()+'"');}catch{return false;}};
let runner=(job,seconds,done)=>execFile(job.helper,[job.game.executable,job.dll,job.hook.report(job.game.dir),String(seconds)],{windowsHide:true,timeout:(seconds+30)*1000},(error,stdout)=>done(String(stdout||'').trim().split(/\s+/).pop()||(error?'failed':'')));
function onDone(f){listeners.add(f);return ()=>listeners.delete(f);}
module.exports={HOOKS,hookFor,outDirs,consider,onDone,secondsFor,_setRunner:(f,r)=>{runner=f;if(r)isRunning=r;},_queue:queue,_state:readState};
