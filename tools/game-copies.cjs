// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Own game copies and per-copy locks, so several test / adaptation runs can play different games (or different copies of
   one game) at the same time.

   Before: every run took one machine-wide lock file (".game.lock"), so only one game ran at a time and the rest queued.
   Now a lock belongs to one game folder (normally an agent's own copy): different folders run in parallel, one folder has
   one owner at a time. A named slot ("slot:foreground") is the same kind of lock for something that is not a folder, such
   as the visible desktop's mouse and keyboard.

   Lock file: <locks dir>/<folder name>-<hash of the folder path>.lock, one JSON line {owner,pid,started,target,host}.
   It is created with O_EXCL, so two takers never both win. A lock whose pid is dead (on this host) is taken over; a live
   owner's lock is never overwritten or removed by anyone else. Locks dir: MEGULIT_GAME_LOCKS, default
   <os.tmpdir()>/megulit-game-locks (one per Windows user, shared by every agent of that user).

   Copy: prepareCopy(<game folder>, {owner}) makes <copies root>/<name>-<owner>. Large resource archives and media are
   hard-linked when the copy is on the same volume (they are only read); executables, DLLs, saves, settings and everything
   else are real copies, so a game writing into its copy never reaches the original (a hard link is the same file: only archive
   and media types that games read are linked, never anything in a save or config folder, never a file reached through a link). Folders are always real folders: a
   junction or symlink inside the source is followed and its files are copied, never recreated as a link (a game once wrote
   through a junction mirror and broke the original). Nothing is written to the source folder. Copies root:
   MEGULIT_COPIES_ROOT (then MEGULIT_ADAPTER_GAMES); copies never go to C: or E: (MEGULIT_COPIES_NO_DRIVES, default "C,E")
   and 15 GB must stay free on the volume the copies root really lives on (a junction is resolved first).

   The old machine-wide lock stays available as gameLock(owner, game, {file}) with the old text format and staleness rules;
   given {dir} it takes that folder's lock instead.

   CLI (node tools/game-copies.cjs ...):
     copy <game folder> --owner <me> [--name <name>] [--root <dir>] [--min-free-gb 15]   prints {"dir":...} of the copy
     run <folder> | --slot <name>  --owner <me> [--wait-min 60] -- <command> [args]   holds the lock while the command runs
     lock <folder> | --slot <name> --owner <me> --pid <windows pid> [--wait-min 0]   for a long-lived owner process
     release <folder> | --slot <name> --owner <me>
     status                                                               every lock, its owner and whether its pid lives */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');

const GB=2**30,MIN_FREE=15*GB,LINK_MIN=1<<20,DAT_LINK_MIN=32<<20;
const locksDir=(env=process.env)=>env.MEGULIT_GAME_LOCKS||path.join(os.tmpdir(),'megulit-game-locks');
const copiesRoot=(env=process.env)=>env.MEGULIT_COPIES_ROOT||env.MEGULIT_ADAPTER_GAMES||'';
const safeName=s=>String(s).replace(/[<>:"/\\|?*\x00-\x1f\s]+/g,'_').replace(/[._]+$/,'').slice(0,60)||'game';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const alive=pid=>{pid=Number(pid);if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};

/* ---- locks ---------------------------------------------------------------------------------------------------------------- */
function realDir(p){try{return fs.realpathSync.native(p);}catch{return path.resolve(p);}}
function lockTarget(target){const s=String(target||'');if(!s)throw Error('lock target missing');
 if(s.startsWith('slot:'))return {key:s.toLowerCase(),name:safeName(s.slice(5)),label:s};
 const dir=realDir(s);const key=(process.platform==='win32'?dir.toLowerCase():dir).replace(/[\\/]+$/,'');
 return {key,name:safeName(path.basename(dir)),label:dir};}
function lockFile(target,dir=locksDir()){const t=lockTarget(target);return path.join(dir,t.name+'-'+crypto.createHash('sha1').update(t.key).digest('hex').slice(0,12)+'.lock');}
function readLock(file){let raw;try{raw=fs.readFileSync(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}
 try{return JSON.parse(raw);}catch{return {owner:'?',pid:0,raw:raw.trim()};}}
const heldBy=(h,owner,pid)=>h&&h.owner===owner&&Number(h.pid)===Number(pid);
const isDead=h=>!!h&&(h.host||os.hostname())===os.hostname()&&!alive(h.pid);

/* Taking over a dead lock: the check and the unlink run under a mutex folder (mkdir is atomic), so a second taker cannot
   remove a lock the first one has just created. A mutex left behind by a crashed taker is ignored after 30 s. */
function reclaimDead(file){const mutex=file+'.reclaim';
 try{fs.mkdirSync(mutex);}catch(e){if(e.code!=='EEXIST')throw e;try{if(Date.now()-fs.statSync(mutex).mtimeMs>30000)fs.rmSync(mutex,{recursive:true,force:true});}catch{}return false;}
 try{const h=readLock(file);if(!h)return true;if(!isDead(h))return false;fs.unlinkSync(file);return true;}
 catch(e){if(e.code==='ENOENT')return true;throw e;}finally{try{fs.rmdirSync(mutex);}catch{}}}

/* One try. {ok:true, release, file, reclaimed} or {ok:false, holder, file}. The same owner and pid taking it again is fine. */
function tryAcquire(target,{owner,pid=process.pid,dir=locksDir()}={}){if(!owner)throw Error('owner missing');
 const file=lockFile(target,dir),t=lockTarget(target);fs.mkdirSync(dir,{recursive:true});
 const body=JSON.stringify({owner,pid:Number(pid),started:new Date().toISOString(),target:t.label,host:os.hostname()})+'\n';let reclaimed=null;
 for(let i=0;i<3;i++){
  try{fs.writeFileSync(file,body,{flag:'wx'});return {ok:true,file,reclaimed,release:()=>release(target,{owner,pid,dir})};}
  catch(e){if(e.code!=='EEXIST')throw e;}
  const h=readLock(file);if(!h)continue;
  if(heldBy(h,owner,pid))return {ok:true,file,reclaimed,again:true,release:()=>false};/* the outer holder releases it */
  if(!isDead(h))return {ok:false,file,holder:h};
  if(reclaimDead(file))reclaimed=h;}
 const h=readLock(file);return {ok:false,file,holder:h};}

async function acquire(target,{owner,pid=process.pid,dir=locksDir(),waitMs=0,pollMs=5000,log=()=>{}}={}){const t0=Date.now();let said=false;
 for(;;){const r=tryAcquire(target,{owner,pid,dir});
  if(r.ok){if(r.reclaimed)log('# took over a dead lock: '+describe(r.reclaimed));return r.release;}
  if(Date.now()-t0>=waitMs)return null;
  if(!said){log('# waiting for '+lockTarget(target).label+': '+describe(r.holder));said=true;}
  await sleep(Math.min(pollMs,Math.max(1,waitMs-(Date.now()-t0))));}}

/* Removes the lock only when this owner (and pid, when given) holds it. */
function release(target,{owner,pid=null,dir=locksDir()}={}){const file=lockFile(target,dir),h=readLock(file);
 if(!h||h.owner!==owner||(pid!=null&&Number(h.pid)!==Number(pid)))return false;try{fs.unlinkSync(file);return true;}catch{return false;}}

const describe=h=>!h?'(gone)':h.raw?h.raw:'owner='+h.owner+' pid='+h.pid+' started='+h.started;
function status({dir=locksDir()}={}){let names=[];try{names=fs.readdirSync(dir).filter(n=>n.endsWith('.lock'));}catch{}
 return names.map(n=>{const h=readLock(path.join(dir,n))||{};return {file:n,owner:h.owner,pid:h.pid,started:h.started,target:h.target,alive:alive(h.pid)};});}

/* ---- the old machine-wide lock (kept for callers that have not moved yet) ---------------------------------------------------
   Same format and rules as before: "owner=… game=… refreshed=…", refreshed every minute, taken over after 20 minutes without a
   refresh (3 hours for a holder that never wrote refreshed=). With {dir} it takes that folder's own lock instead. */
const STALE_MS=20*60000,STALE_ONCE_MS=180*60000;
async function gameLock(owner,game,{waitMs=3600000,file,dir:gameDir,locks,pollMs=15000,log=()=>{}}={}){
 if(gameDir)return acquire(gameDir,{owner,waitMs,pollMs,log,dir:locks||locksDir()});
 if(!file)throw Error('gameLock: file or dir needed');
 const line=()=>'owner='+owner+' game='+game+' refreshed='+new Date().toISOString();const t0=Date.now();let said=false;
 for(;;){try{fs.writeFileSync(file,line(),{flag:'wx'});break;}catch(e){if(e.code!=='EEXIST')throw e;}
  let age=0,held='';try{age=Date.now()-fs.statSync(file).mtimeMs;held=String(fs.readFileSync(file,'utf8'));}catch{continue;}
  if(age>(/refreshed=/.test(held)?STALE_MS:STALE_ONCE_MS)){try{fs.unlinkSync(file);}catch{}continue;}
  if(Date.now()-t0>=waitMs)return null;if(!said){log('# waiting for the game lock: '+held.trim());said=true;}await sleep(pollMs);}
 const mine=line().split(' refreshed=')[0];const timer=setInterval(()=>{try{if(String(fs.readFileSync(file,'utf8')).startsWith(mine))fs.writeFileSync(file,line());}catch{}},60000);timer.unref?.();
 return ()=>{clearInterval(timer);try{if(String(fs.readFileSync(file,'utf8')).startsWith(mine))fs.unlinkSync(file);}catch{}};}

/* ---- own copies ----------------------------------------------------------------------------------------------------------- */
/* Read-only data that may be shared with the original through a hard link. Anything not listed is copied. */
const SHARED=new Set(('xp3 arc pac pak pck ovk ypf npa nsa sar ns2 int pfs rpa rgss3a rgss2a rgssad wolf cpk afs mpk xfl dx noa iar war bpk gxp '
 +'ogg mp3 wav flac opus m4a wma aac mp4 mpg mpeg m1v wmv avi webm mkv mov bik bk2 usm ttf otf ttc assets ress resource bundle').split(' '));
const PRIVATE_DIR=/^(save|saves|savedata|save_data|userdata|config|セーブ|セーブデータ)$/i;
const MUTABLE=/\.(exe|dll|ini|cfg|conf|json|xml|txt|sav|sys|ksd|kdt|bak|log|reg|dat\d*)$/i;
function shareable(rel,size){const name=path.basename(rel),ext=path.extname(name).slice(1).toLowerCase();
 if(rel.split(/[\\/]/).slice(0,-1).some(d=>PRIVATE_DIR.test(d)))return false;
 if(ext==='dat')return size>=DAT_LINK_MIN;
 if(MUTABLE.test(name))return false;
 return size>=LINK_MIN&&SHARED.has(ext);}

/* Every file under src as {rel, abs, size, via}. Links (junctions, symlinks) are followed as plain folders/files; a folder
   seen twice (a link loop) is skipped. via: reached through a link; such files are always copied, never hard-linked, since
   what the link points at may be another copy or the original of something else. */
function listFiles(src){const out=[],seen=new Set(),followed=[];
 const walk=(abs,rel,via)=>{const real=realDir(abs).toLowerCase();if(seen.has(real))return;seen.add(real);
  for(const e of fs.readdirSync(abs,{withFileTypes:true})){const a=path.join(abs,e.name),r=rel?path.join(rel,e.name):e.name;let st;
   const link=e.isSymbolicLink();if(link){followed.push(r);try{st=fs.statSync(a);}catch{continue;}}else st=e.isDirectory()?null:fs.statSync(a);
   if(st?st.isDirectory():e.isDirectory())walk(a,r,via||link);else if(!st||st.isFile())out.push({rel:r,abs:a,size:(st||fs.statSync(a)).size,via:via||link});}};
 walk(src,'',false);return {files:out,followed};}

function hasLinks(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const a=path.join(dir,e.name);
  if(e.isSymbolicLink())return a;if(e.isDirectory()){const x=hasLinks(a);if(x)return x;}}return '';}

const MARK='.megulit-copy.json';
function prepareCopy(src,{owner,name,root=copiesRoot(),noDrives=process.env.MEGULIT_COPIES_NO_DRIVES??'C,E',minFree=MIN_FREE,statfs=fs.statfsSync,link=fs.linkSync,log=()=>{}}={}){
 if(!owner)throw Error('owner missing');if(!root)throw Error('no copies root: set MEGULIT_COPIES_ROOT');
 const from=realDir(src);if(!fs.statSync(from).isDirectory())throw Error('not a folder: '+src);
 const dir=path.join(path.resolve(root),safeName(name||path.basename(from))+'-'+safeName(owner));
 fs.mkdirSync(path.resolve(root),{recursive:true});const realRoot=realDir(root);
 const drive=(/^([A-Za-z]):/.exec(realRoot)||[])[1]||'';
 if(drive&&String(noDrives).toUpperCase().split(/[,\s]+/).includes(drive.toUpperCase()))throw Error('copies never go to '+drive.toUpperCase()+': ('+realRoot+'); set MEGULIT_COPIES_ROOT');
 const inside=(a,b)=>{const r=path.relative(b,a);return !r||(!r.startsWith('..')&&!path.isAbsolute(r));};
 const realDest=path.join(realRoot,path.basename(dir));
 if(inside(realDest,from)||inside(from,realDest))throw Error('the copy and the original overlap: '+from+' / '+realDest);
 if(fs.existsSync(dir)){const st=fs.lstatSync(dir);if(st.isSymbolicLink())throw Error('the copy folder is a link: '+dir);
  let mark=null;try{mark=JSON.parse(fs.readFileSync(path.join(dir,MARK),'utf8'));}catch{}
  if(mark&&realDir(mark.source).toLowerCase()===from.toLowerCase()&&mark.complete){log('# own copy kept: '+dir);return {dir,reused:true,...mark};}
  if(fs.readdirSync(dir).length&&!(mark&&realDir(mark.source).toLowerCase()===from.toLowerCase()))throw Error('folder exists and is not a copy of this game: '+dir);}
 const {files,followed}=listFiles(from);
 const sameVolume=fs.statSync(from).dev===fs.statSync(realRoot).dev;
 const linkable=f=>sameVolume&&!f.via&&shareable(f.rel,f.size);
 const need=files.reduce((n,f)=>n+(linkable(f)?0:f.size),0);
 const st=statfs(realRoot),free=Number(st.bavail)*Number(st.bsize);
 if(free-need<minFree)throw Error('not enough space on '+realRoot+': '+Math.round(free/GB)+' GB free, the copy needs '+Math.round(need/GB)+' GB and '+Math.round(minFree/GB)+' GB must stay free');
 fs.mkdirSync(dir,{recursive:true});
 const mark={source:from,owner,created:new Date().toISOString(),linked:0,copied:0,linkedBytes:0,copiedBytes:0,followedLinks:followed,complete:false};
 fs.writeFileSync(path.join(dir,MARK),JSON.stringify(mark,null,1));
 for(const f of files){const to=path.join(dir,f.rel);fs.mkdirSync(path.dirname(to),{recursive:true});try{fs.rmSync(to,{force:true});}catch{}
  let linked=false;if(linkable(f)){try{link(f.abs,to);linked=true;}catch{}}
  if(!linked)fs.copyFileSync(f.abs,to);
  if(linked){mark.linked++;mark.linkedBytes+=f.size;}else{mark.copied++;mark.copiedBytes+=f.size;}}
 const bad=hasLinks(dir);if(bad)throw Error('a link ended up in the copy: '+bad);
 mark.complete=true;fs.writeFileSync(path.join(dir,MARK),JSON.stringify(mark,null,1));
 if(followed.length)log('# followed '+followed.length+' link(s) in the original and copied their files: '+followed.slice(0,3).join(', '));
 log('# own copy '+dir+': '+mark.copied+' copied ('+Math.round(mark.copiedBytes/1048576)+' MB), '+mark.linked+' hard-linked ('+Math.round(mark.linkedBytes/1048576)+' MB)');
 return {dir,reused:false,...mark};}

/* ---- CLI ------------------------------------------------------------------------------------------------------------------ */
function parseArgs(argv){const o={cmd:argv[0],target:'',owner:'',pid:0,waitMin:null,name:'',root:'',minFreeGb:null,rest:[]};
 for(let i=1;i<argv.length;i++){const k=argv[i],v=()=>{if(i+1>=argv.length)throw Error(k+' needs a value');return argv[++i];};
  if(k==='--'){o.rest=argv.slice(i+1);break;}
  if(k==='--owner')o.owner=v();else if(k==='--pid')o.pid=Number(v());else if(k==='--wait-min')o.waitMin=Number(v());else if(k==='--name')o.name=v();else if(k==='--root')o.root=v();else if(k==='--min-free-gb')o.minFreeGb=Number(v());
  else if(k==='--slot')o.target='slot:'+v();else if(!k.startsWith('--')&&!o.target)o.target=k;else throw Error('unknown argument: '+k);}
 return o;}

async function main(argv=process.argv.slice(2)){const o=parseArgs(argv),log=m=>console.error(m);
 if(o.cmd==='status'){console.log(JSON.stringify(status(),null,1));return 0;}
 if(o.cmd==='copy'){const r=prepareCopy(o.target,{owner:o.owner,name:o.name||undefined,root:o.root||copiesRoot(),log,...(o.minFreeGb>=0&&o.minFreeGb!==null?{minFree:o.minFreeGb*GB}:{})});console.log(JSON.stringify(r));return 0;}
 if(o.cmd==='release'){const ok=release(o.target,{owner:o.owner});console.log(ok?'released':'not held by '+o.owner);return ok?0:3;}
 if(o.cmd==='lock'){if(!(o.pid>0))throw Error('lock needs --pid of the process that owns it (a Windows pid; bash $$ is not one)');
  const r=await acquire(o.target,{owner:o.owner,pid:o.pid,waitMs:(o.waitMin??0)*60000,log});console.log(r?'locked '+lockFile(o.target):'busy');return r?0:3;}
 if(o.cmd==='run'){if(!o.rest.length)throw Error('run needs -- <command>');
  const r=await acquire(o.target,{owner:o.owner,waitMs:(o.waitMin??60)*60000,log});if(!r){log('# busy: '+describe(readLock(lockFile(o.target))));return 3;}
  log('# locked '+lockTarget(o.target).label+' for '+o.owner+' pid='+process.pid);
  try{return await new Promise(res=>{const c=spawn(o.rest[0],o.rest.slice(1),{stdio:'inherit',windowsHide:true});c.on('error',e=>{log(String(e.message));res(1);});c.on('exit',code=>res(code??1));});}
  finally{r();}}
 console.error('usage: node tools/game-copies.cjs copy|run|lock|release|status (see the top of this file)');return 2;}

if(require.main===module)main().then(c=>{process.exitCode=c;},e=>{console.error(e.message);process.exitCode=2;});
module.exports={locksDir,copiesRoot,lockFile,lockTarget,tryAcquire,acquire,release,status,gameLock,prepareCopy,shareable,listFiles,alive,parseArgs,main,MIN_FREE};
