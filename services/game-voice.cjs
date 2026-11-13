// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E450 The game's own voice for a line (user: example sentences from a voiced game played an AI voice).
   Two sources, both kept on this computer under data/voice-cache (never in the repository):
   - scan: the engine readers give each line the voice its script plays (scene.voices, voice-ref.cjs); the voice is
     found in the game's folder or archives (loose files, .xp3, AdvHD .arc, RealLive/Siglus .ovk) and copied out the
     first time it is asked for;
   - runtime: while the game runs, the clip recorded for a shown line (gal-native gameMedia) is kept for that line.
   A line is found by its text alone, so the learning page, saved sentences, grammar examples and Anki cards all
   reach it without knowing which game it came from. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PROVIDERS=['./original-engines/npk.cjs','./original-engines/catsystem2.cjs','./original-engines/yuris.cjs','./original-engines/fvp.cjs','./original-engines/iga.cjs','./original-engines/paz.cjs','./original-engines/aquaplus.cjs','./original-engines/mages.cjs'];
const DIR_PROVIDERS=['./original-engines/naninovel-voice.cjs'];
const AUDIO=/\.(?:ogg|opus|wav|mp3|m4a)$/i;
const sha1=s=>crypto.createHash('sha1').update(s).digest('hex');
// The text key: NFKC, no spaces or markup, no speaker name before a quote, no outer quote marks.
function norm(text){let t=String(text||'').replace(/<[^>]*>/g,'').normalize('NFKC').replace(/[\s　]+/g,'');
 const q=/^[^「『（(]{1,16}?[「『（(](.+)[」』）)]$/.exec(t);if(q)t=q[1];else{const w=/^[「『（(](.+)[」』）)]$/.exec(t);if(w)t=w[1];}
 t=t.replace(/^[^「『（(]{1,16}?[「『](?!.*[」』])/,'').replace(/^[「『（(]/,'').replace(/[」』）)]$/,'');
 return t.replace(/[。、！？!?…‥・〜～ー―─\-♪☆★.]+$/,'');}
const keyOf=text=>{const n=norm(text);return n.length>=1?sha1(n):null;};
// E461 raised when readers pair voices differently: every game is scanned again on its next start
const SCAN_VERSION=2;
const cacheDir=root=>path.join(root,'data','voice-cache');
function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}
const gameKey=dir=>sha1(path.resolve(String(dir)).toLowerCase()).slice(0,16);
// The content type of a clip from its first bytes; null when a browser could not play it.
function kind(b){if(!b||b.length<12)return null;const h=b.toString('latin1',0,4);
 if(h==='OggS')return {ext:'.ogg',mime:'audio/ogg'};if(h==='RIFF'&&b.toString('latin1',8,12)==='WAVE')return {ext:'.wav',mime:'audio/wav'};
 if(h.startsWith('ID3')||(b[0]===0xff&&(b[1]&0xe0)===0xe0))return {ext:'.mp3',mime:'audio/mpeg'};if(b.toString('latin1',4,8)==='ftyp')return {ext:'.m4a',mime:'audio/mp4'};return null;}

/* ---- where a voice name is stored in a game folder ---- */
/* E580 kit.walk: every file, these folders skipped */
const walk=(dir,depth=4,out=[])=>require('./original-engines/kit.cjs').walk(dir,depth,()=>true,out,/^(?:\.git|node_modules|savedata|save)$/i);
const base=name=>path.basename(String(name).replace(/\\/g,'/')).replace(/\.[^.]+$/,'').toLowerCase();
// AdvHD .arc: the AdvHD reader's index parser (E580)
const arcList=file=>{try{return require('./original-engines/advhd.cjs').listFile(file);}catch{return null;}};
// RealLive / Siglus .ovk: count, then {size, offset, id, samples} per clip; every clip is an Ogg stream.
function ovkList(file){let fd;try{fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size,h=Buffer.alloc(4);fs.readSync(fd,h,0,4,0);const n=h.readUInt32LE(0);if(!n||n>100000||4+n*16>size)return null;
 const t=Buffer.alloc(n*16);fs.readSync(fd,t,0,t.length,4);const out=[];for(let i=0;i<n;i++){const s=t.readUInt32LE(i*16),o=t.readUInt32LE(i*16+4),id=t.readUInt32LE(i*16+8);if(o+s>size)return null;out.push({id,size:s,offset:o});}return out;}catch{return null;}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}}
const slice=(file,offset,size)=>require('./original-engines/kit.cjs').readAt(file,offset,size);/* E580 */
// Every voice clip a folder holds: name (no extension, lower case) -> a reader. Archives are listed once.
/* E461 a clip is listed under its name and under "folder/name" (its last folder): scripts that name a folder find that
   folder's clip even when another folder holds a file of the same name; a bare name still finds the first one. */
function catalog(dir){const map=new Map(),koe=new Map(),hashed=new Map(),add=(name,read)=>{const k=base(name);if(!k)return;if(!map.has(k))map.set(k,read);
  const parts=String(name).replace(/\\/g,'/').split('/');if(parts.length>1){const fk=parts[parts.length-2].toLowerCase()+'/'+k;if(!map.has(fk))map.set(fk,read);}};
 const xp3=require('./original-engines/xp3.cjs');
 // clips a cold run read through the game (voice-cold.cjs) come first: they are what the game itself plays
 let cold=[];try{cold=require('./voice-cold.cjs').outDirs(dir);}catch{}
 for(const d of cold)for(const file of walk(d,0))if(AUDIO.test(file))add(file,()=>fs.readFileSync(file));
 /* engines whose clips are found per folder rather than per archive (Unity bundles): {key, read} */
 for(const m of DIR_PROVIDERS){let l=null;try{l=require(m).audioDir?.(dir);}catch{}if(l)for(const e of l){const k=String(e.key).toLowerCase();if(!map.has(k))map.set(k,e.read);}}
 for(const file of walk(dir)){const low=file.toLowerCase();
  if(AUDIO.test(low)){add(file,()=>fs.readFileSync(file));continue;}
  if(low.endsWith('.xp3')){let t;try{t=xp3.list(file);}catch{}if(!t)continue;
   /* KiriKiri Z Steam releases (9-nine-, ATRI) name each entry by the MD5 of its lower-case UTF-16LE path (sf/sf0001.ogg,
      CAT_b101_001.opus); the script's voice names are looked up through that hash in get() */
   const named=t.files.filter(e=>/^[0-9a-f]{32}$/.test(e.name));if(named.length){let cx;const filter=()=>{if(cx===undefined){cx=null;try{cx=require('./original-engines/cx-filter.cjs').forArchive(file);}catch{}}return cx;};
    for(const e of named)if(!hashed.has(e.name))hashed.set(e.name,()=>xp3.read(file,e,e.encrypted?filter():null));}
   const audio=t.files.filter(e=>AUDIO.test(e.name));if(!audio.length)continue;
   /* an entry flagged protected can still be stored plain (女王蜂の王房, 赤ずきん): read one and look */
   const flagged=audio.find(e=>e.encrypted);let open=false;if(flagged){try{open=!!kind(xp3.read(file,flagged));}catch{}}
   let cx=null;if(flagged&&!open){try{cx=require('./original-engines/cx-filter.cjs').forArchive(file);}catch{}}
   for(const e of audio)if(!e.encrypted||open||cx)add(e.name,()=>xp3.read(file,e,open?null:cx));continue;}
  if(low.endsWith('.arc')){const l=arcList(file);if(l)for(const e of l)if(AUDIO.test(e.name))add(e.name,()=>slice(file,e.offset,e.size));continue;}
  /* archives an engine reader knows: each lists its clips as {name, read} */
  if(/[.](?:npk|ypf|int|bin|pak|dat|pck|iga|mpk|paz)$/.test(low)){let l=null;for(const m of PROVIDERS){try{l=require(m).audio?.(file);}catch{}if(l&&l.length)break;}if(l)for(const e of l)add(e.name,e.read);continue;}
  if(low.endsWith('.ovk')){const m=/(\d+)\.ovk$/.exec(low),l=ovkList(file);if(m&&l)for(const e of l){const id=Number(m[1])*100000+e.id;koe.set(id,()=>slice(file,e.offset,e.size));}continue;}}
 return {map,koe,hashed,get(ref){if(/^koe:\d+$/.test(ref))return koe.get(Number(ref.slice(4)))||null;const r=String(ref).toLowerCase();return map.get(r)||(r.includes('/')?map.get(r.slice(r.lastIndexOf('/')+1)):null)||(hashed.size?hashedClip(hashed,r):null)||null;}};}
/* the paths a voice name may be stored under: as written, or in a folder named by its prefix (sf0001 -> sf/sf0001,
   CAT_b101_001 -> cat/CAT_b101_001, kr0085_ep1 -> ep1/kr0085_ep1), with or without its audio extension */
function hashedPaths(ref){const r=String(ref).replace(/\\/g,'/').toLowerCase(),name=r.slice(r.lastIndexOf('/')+1),stem=AUDIO.test(name)?name.replace(/\.[^.]+$/,''):name;
 const dirs=new Set([r.includes('/')?r.slice(0,r.lastIndexOf('/')+1):'','']);const letters=/^[a-z]+/.exec(stem),head=/^([^_]+)_/.exec(stem);if(letters)dirs.add(letters[0]+'/');const tail=/_([^_]+)$/.exec(stem);if(head)dirs.add(head[1]+'/');if(tail)dirs.add(tail[1]+'/');dirs.add('voice/');
 const exts=AUDIO.test(name)?[name.slice(stem.length)]:['.ogg','.opus','.wav','.m4a','.mp3'];const out=[];for(const d of dirs)for(const x of exts)out.push(d+stem+x);return out;}
function hashedClip(hashed,ref){const crypto=require('node:crypto');for(const p of hashedPaths(ref)){const k=crypto.createHash('md5').update(Buffer.from(p,'utf16le')).digest('hex');const read=hashed.get(k);if(read)return read;}return null;}

/* ---- the line index ---- */
const catalogs=new Map();
function catalogFor(dir){const k=gameKey(dir);let c=catalogs.get(k);if(!c){c=catalog(dir);catalogs.set(k,c);if(catalogs.size>4)catalogs.delete(catalogs.keys().next().value);}return c;}
function linesFile(root){return path.join(cacheDir(root),'lines.json');}
let memo=null;
function lines(root){if(!memo||memo.root!==root)memo={root,data:readJSON(linesFile(root),{schema:1,games:{},lines:{}})};return memo.data;}
function save(root){writeJSON(linesFile(root),lines(root));}
// Scan one game: every line whose script names a voice that the folder really holds. Returns counts per engine.
function scan(root,dir,{engine,scenes}={}){const sc=require('./original-engines/scenes.cjs');
 const id=engine||sc.detect(dir);if(!id)return {engine:null,lines:0,voiced:0,found:0};
 const list=scenes||sc.read(id,dir),cat=catalogFor(dir),g=gameKey(dir),data=lines(root),missing=new Set();
 /* E461 a scan replaces what an earlier scan of this game gave (a reader fixed since may pair lines differently); clips
    kept while the game ran stay */
 for(const [k,v] of Object.entries(data.lines))if(v[0]===g&&v[1]!=='runtime')delete data.lines[k];let total=0,voiced=0,found=0;
 for(const s of list){const v=s.voices||[];for(let i=0;i<(s.lines||[]).length;i++){total++;if(!v[i])continue;voiced++;if(!cat.get(v[i])){if(!/^koe:/.test(v[i]))missing.add(v[i].slice(v[i].lastIndexOf('/')+1)); /* E461 a cold run looks files up by name */continue;}found++;const k=keyOf(s.lines[i]);if(!k)continue;if(!data.lines[k])data.lines[k]=[g,v[i]];
  /* a speech spread over several script lines (an open 「 closed later) is shown as one: key the whole of it too */
  let whole=s.lines[i];for(let j=i+1;j<s.lines.length&&j<i+8&&!v[j]&&/^[「『]/.test(whole)&&!/[」』]$/.test(whole);j++)whole+=s.lines[j];if(whole!==s.lines[i]){const kw=keyOf(whole);if(kw&&!data.lines[kw])data.lines[kw]=[g,v[i]];}}}
 /* engines whose voices are numbered in a separate source (Siglus Scene.pck) give text and voice pairs directly */
 let extra=[];try{extra=sc.ENGINES[id]?.voiceLines?.(dir)||[];}catch{}
 for(const x of extra){voiced++;if(!cat.get(x.ref)){missing.add(x.ref);continue;}found++;const k=keyOf(x.text);if(k&&!data.lines[k])data.lines[k]=x.estimated?[g,x.ref,null,'estimated']:[g,x.ref];}
 data.games[g]={...data.games[g],v:SCAN_VERSION,dir:path.resolve(dir),engine:id,scanned:Date.now(),lines:total,voiced,found,missing:missing.size};save(root);return {engine:id,lines:total,voiced,found,missing:[...missing]};}
// A game folder as the player picks it: the game may sit one or two folders down (an unpacked release).
function gameDir(dir,depth=2){const sc=require('./original-engines/scenes.cjs');let id=null;try{id=sc.detect(dir);}catch{}if(id)return {dir,engine:id};if(depth<=0)return null;
 let list=[];try{list=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&!/^(?:savedata|save|\.megulit)/i.test(e.name));}catch{}
 for(const e of list){const hit=gameDir(path.join(dir,e.name),depth-1);if(hit)return hit;}return null;}
// Keep a clip recorded while the game ran for this line (runtime source). Never replaces a scanned voice.
function remember(root,text,audio,{game='runtime',save:keep=true}={}){if(typeof audio==='string')audio=Buffer.from(audio,'base64');const k=keyOf(text),t=kind(audio);if(!k||!t)return false;const data=lines(root);if(data.lines[k]&&data.lines[k][1]!=='runtime')return false;
 const file=path.join(cacheDir(root),'runtime',k+t.ext);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,audio);data.lines[k]=[game,'runtime',t.ext];if(keep)save(root);return true;}
// After remember(..., {save:false}) calls: writes the index once.
function flush(root){save(root);}
// The voice for a line: {data, mime, source:'scan'|'runtime'} or null. A scanned clip is copied to the cache the first time.
/* E461 a voice from a scan older than SCAN_VERSION may belong to another line: not played; that game is scanned again
   in the background (once) and the line has its voice when that is done */
const refreshing=new Set();
function refresh(root,game){const k=gameKey(game.dir);if(refreshing.has(k)||!fs.existsSync(game.dir))return;refreshing.add(k);scanInWorker(root,game.dir,()=>{});}
function find(root,text){const k=keyOf(text);if(!k)return null;const hit=lines(root).lines[k];if(!hit)return null;const [g,ref,ext]=hit;
 if(ref!=='runtime'){const game=lines(root).games[g];if(game&&game.v!==SCAN_VERSION){try{refresh(root,game);}catch{}return null;}}
 if(ref==='runtime'){try{const data=fs.readFileSync(path.join(cacheDir(root),'runtime',k+(ext||'.wav')));const t=kind(data);return t?{data,mime:t.mime,source:'runtime'}:null;}catch{return null;}}
 const dir=path.join(cacheDir(root),g);for(const e of ['.ogg','.wav','.mp3','.m4a']){try{const data=fs.readFileSync(path.join(dir,sha1(ref)+e));return {data,mime:kind(data).mime,source:'scan',...(hit[3]==='estimated'?{estimated:true}:{})};}catch{}}
 const game=lines(root).games[g];if(!game)return null;let data;try{data=catalogFor(game.dir).get(ref)?.();}catch{}const t=kind(data);if(!t)return null;
 try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,sha1(ref)+t.ext),data);}catch{}return {data,mime:t.mime,source:'scan',...(hit[3]==='estimated'?{estimated:true}:{})};}
// Scan a game when it starts (its folder from the executable), once a week at most, off the start-up path.
const running=new Set();
/* Voices the scan could not open go to a cold run (voice-cold.cjs) when the setting allows it; the game is scanned again
   once that run ends, so the clips it read count. */
// One scan at a time in a worker thread (game-voice-worker.cjs); the line index is reloaded when it is done.
const scanQueue=[];let scanBusy=false;
function scanInWorker(root,start,done){scanQueue.push({root,start,done});pump();}
function pump(){if(scanBusy||!scanQueue.length)return;const job=scanQueue.shift();scanBusy=true;let w;
 const finish=msg=>{scanBusy=false;memo=null;if(msg?.g)catalogs.delete(gameKey(msg.g.dir));try{job.done(msg||{});}catch{}pump();};
 try{w=new (require('node:worker_threads').Worker)(path.join(__dirname,'game-voice-worker.cjs'),{workerData:{root:job.root,start:job.start}});}catch{return finish(null);}
 w.once('message',finish);w.once('error',()=>finish(null));w.unref?.();}
function scanLater(root,executable,delay=8000,{cold=false}={}){if(!executable)return;const start=path.dirname(String(executable)),k=gameKey(start);if(running.has(k))return;const seen=Object.values(lines(root).games).find(g=>g.from===k);if(seen&&seen.v===SCAN_VERSION&&Date.now()-seen.scanned<7*864e5)return;running.add(k);
 const t=setTimeout(()=>scanInWorker(root,start,({g,r})=>{running.delete(k);if(!g||!r)return;const e=lines(root).games[gameKey(g.dir)];if(e){e.from=k;save(root);}
   if(cold&&r.missing?.length){const vc=require('./voice-cold.cjs');const off=vc.onDone(job=>{if(job.game.dir===g.dir){off();scanInWorker(root,g.dir,()=>{});}});vc.consider(root,{executable:String(executable),dir:g.dir,engine:g.engine},r.missing);}}),delay);t.unref?.();}
const has=(root,text)=>{const k=keyOf(text);return !!(k&&lines(root).lines[k]);};
module.exports={flush,hashedPaths,scanLater,norm,keyOf,kind,catalog,arcList,ovkList,scan,gameDir,remember,find,has,gameKey,_reset(){memo=null;catalogs.clear();}};
