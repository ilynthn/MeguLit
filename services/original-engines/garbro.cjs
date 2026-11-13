// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E470 last-resort reader: archives none of MeguLit's own readers can open go through GARbro (morkt, MIT), which brings
// its own format list and per-game key database (GameData/Formats.dat): Nitro+ NPK2 AES, Innocent Grey IGA, Palette
// .dat and the other ~500 formats it knows. GARbro is the on-demand "archives" runtime pack (runtime/garbro), fetched
// the first time a game needs it. services/garbro-host.ps1 drives GameRes.dll in Windows PowerShell (.NET Framework,
// part of Windows), extracts the script entries once into cache/garbro/<archive key>/, and this file turns them into
// Japanese lines with a generic text scan (Shift-JIS, UTF-8, UTF-16). Results, and failures, are cached per archive
// size + mtime + GARbro version, so a game is unpacked once and an archive GARbro cannot open is not retried.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const ROOT=()=>process.env.MEGULIT_GARBRO_ROOT||path.join(__dirname,'..','..');
const HOST=path.join(__dirname,'..','garbro-host.ps1');
const PACK='archives',DIR=()=>path.join(ROOT(),'runtime','garbro'),CACHE=()=>process.env.MEGULIT_GARBRO_CACHE||path.join(ROOT(),'cache','garbro');
/* Archive extensions that are visual-novel containers in GARbro's list; generic game formats (.pak/.cpk of Unreal, Unity
   .assets/.bundle) are left out so a non-VN game in the library never pulls the pack in.
   E569 (engine survey): QLIE GameData/*.pack, ShiinaRio .war, Entis GLS .noa, AliceSoft .ald/.afa, Marble .mbl and rUGP
   .rio are containers GARbro opens that were missing here, so those engines never reached even this fallback. */
const ARCHIVE=/\.(npk|iga|arc|pac|pak|dat|xp3|ypf|int|pfs|pf8|mpk|nsa|sar|ns2|gpk|ykc|lpk|mrg|fpk|afs|vfs|dxa|bin|cpz|hxp|lib|lac|pck|epk|vff|isa|nnk|ar2|psb|ttd|ifl|aos|tac|cmp|wag|fcb|cab|pack|war|noa|ald|afa|mbl|rio|box|snn|bdt|alf|gsp|med)$/i;
/* E665 F4b engines whose archives GARbro opens but this list missed: SystemAoi .box, BlueGale .snn, Fairytale
   .bdt, Eushully .alf, GSD .gsp, Triangle .med */
const SCRIPTY=/script|scenario|scene|scn|story|text|txt|data|system|sys|main|game|msg/i;
/* media entries never hold dialogue: skip them so a 4 GB CG archive is not written to disk */
const MEDIA='png|bmp|jpe?g|gif|tga|dds|webp|psd|tlg\\d?|pna|bmx|g00|pic|ani|eri|mio|cps|hg[23]|ogg|wav|mp3|m4a|opus|flac|ahx|hca|at3|wma|mp4|wmv|avi|mpe?g|webm|ogv|mov|ttf|otf|ttc|fnt|pmx|x|fbx';
const MATCH='^(?!.*\\.('+MEDIA+')$).+';
const LIMIT_BYTES=512*1048576,LIMIT_FILES=20000,MAX_ARCHIVES=12,MIN_SIZE=16384;

const jobs=new Map();/* archive path → {state,startedAt,error} for archives being unpacked in this process */
let packsRef=null;
function packs(){if(!packsRef){const {RuntimePacks}=require('../../core/runtime-packs.cjs');packsRef=RuntimePacks.shared(ROOT());}return packsRef;}
function installed(){try{return packs().installed(PACK);}catch{return false;}}
function version(){try{return String(fs.statSync(path.join(DIR(),'ArcFormats.dll')).size);}catch{return '0';}}
function key(file){const st=fs.statSync(file);return crypto.createHash('sha256').update(path.resolve(file).toLowerCase()+'|'+st.size+'|'+st.mtimeMs).digest('hex').slice(0,24);}
function cacheDir(file){return path.join(CACHE(),key(file));}
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}

// Archives in the game folder (and one level down) worth handing to GARbro, script-looking names first.
function archives(dir){
 /* E583 a System4 folder (its script is the .ain) keeps only CG / sound in .afa / .ald: never worth unpacking */
 const sys4=(()=>{try{return require('./alicesoft.cjs').system4(dir);}catch{return false;}})();
 const out=[];const scan=(d,depth)=>{let list;try{list=fs.readdirSync(d,{withFileTypes:true});}catch{return;}
  for(const e of list){const p=path.join(d,e.name);if(e.isDirectory()){if(depth<1&&!/^(save|savedata|movie|movies|video|bgm|sound|voice|se|cg|image|images|logs?)$/i.test(e.name))scan(p,depth+1);continue;}
   if(!ARCHIVE.test(e.name))continue;if(sys4&&/\.(afa|ald)$/i.test(e.name))continue;if(/^(unins\d*|setup|config|savedata|save\d*|global|sysdata)\./i.test(e.name))continue;
   let size=0;try{size=fs.statSync(p).size;}catch{}if(size>=MIN_SIZE)out.push({file:p,size,scripty:SCRIPTY.test(e.name)});}};
 scan(dir,0);
 return out.sort((a,b)=>b.scripty-a.scripty||a.size-b.size).slice(0,MAX_ARCHIVES).map(a=>a.file);
}

function run(args,{timeout=10*60000}={}){
 return new Promise((resolve,reject)=>{
  const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const p=spawn(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',HOST,'-GarbroDir',DIR(),...args],{windowsHide:true});
  let out='',err='';const timer=setTimeout(()=>{try{p.kill();}catch{}reject(Error('GARBRO_TIMEOUT'));},timeout);
  /* one decoder per stream: a Japanese file name split across two chunks stays whole */p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',e=>{clearTimeout(timer);reject(e);});
  p.on('exit',()=>{clearTimeout(timer);const line=out.trim().split(/\r?\n/).pop()||'';let json=null;try{json=JSON.parse(line);}catch{}
   if(!json)return reject(Error('GARBRO_BAD_OUTPUT '+(err||out).slice(0,300)));if(json.error)return reject(Error(json.error));resolve(json);});
 });
}

/* Unpack one archive's script entries into the cache; downloads the pack first if allowed. Resolves with done.json. */
async function unpack(file,{download=true}={}){
 const out=cacheDir(file),done=path.join(out,'done.json'),failed=path.join(out,'failed.json');
 const ready=readJson(done);if(ready)return ready;
 if(!installed()){if(!download)throw Error('PACK_NOT_INSTALLED');await packs().ensure(PACK);}
 const v=version(),bad=readJson(failed);if(bad&&bad.version===v)throw Error(bad.error||'GARBRO_FAILED');
 const tmp=out+'.part';fs.rmSync(tmp,{recursive:true,force:true});
 try{
  const r=await run(['-Mode','extract','-Archive',file,'-Out',tmp,'-Match',MATCH,'-Limit',String(LIMIT_FILES),'-MaxBytes',String(LIMIT_BYTES)]);
  if(!r.files?.length)throw Error('GARBRO_NO_SCRIPTS');
  fs.rmSync(out,{recursive:true,force:true});fs.renameSync(tmp,out);
  const info={archive:file,format:r.format,files:r.files,bytes:r.bytes,version:v,at:Date.now()};fs.writeFileSync(done,JSON.stringify(info));return info;
 }catch(error){fs.rmSync(tmp,{recursive:true,force:true});
  if(!/GARBRO_TIMEOUT|PACK_/.test(error.message)){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(failed,JSON.stringify({archive:file,version:v,error:error.message,at:Date.now()}));}
  throw error;}
}
const queue=[];let busy=false;
function schedule(file){if(jobs.has(file))return;jobs.set(file,{state:'queued',startedAt:Date.now(),error:''});queue.push(file);pump();}
async function pump(){if(busy)return;busy=true;try{while(queue.length){const file=queue.shift(),job=jobs.get(file);job.state='running';
  try{await unpack(file);job.state='done';}catch(error){job.state='error';job.error=error.message;}}}finally{busy=false;}}

/* E573 the generic kana scan is shared with every reader whose grammar is unknown (kit.cjs) */
const decodeRuns=require('./kit.cjs').decodeRuns;
// Engine interface used by scenes.cjs.
const engine={id:'garbro',
 sources:dir=>archives(dir),
 scenes(dir){
  const out=[];
  for(const file of archives(dir)){let c;try{c=cacheDir(file);}catch{continue;}const info=readJson(path.join(c,'done.json'));
   if(info){for(const rel of info.files)out.push({name:path.basename(file)+'/'+rel.replace(/\\/g,'/'),read:()=>fs.readFileSync(path.join(c,rel))});continue;}
   if(readJson(path.join(c,'failed.json'))?.version===version())continue;
   schedule(file);
  }
  return out;
 },
 parse:buf=>({lines:decodeRuns(buf),anchors:[]}),
 /* what a folder waiting on GARbro is doing: the pack download (with progress) or the unpack */
 preparing(dir){const files=archives(dir).filter(f=>jobs.has(f)&&['queued','running'].includes(jobs.get(f).state));if(!files.length)return null;
  const startedAt=Math.min(...files.map(f=>jobs.get(f).startedAt)),pj=installed()?null:packs().status().packs.find(p=>p.id===PACK)?.job;
  return pj?{kind:'garbro',stage:'download',startedAt,received:pj.received,total:pj.total}:{kind:'garbro',stage:'unpack',startedAt};},
};
module.exports={engine,archives,unpack,run,decodeRuns,cacheDir,schedule,installed,version,readJson,MATCH,PACK,jobs};
