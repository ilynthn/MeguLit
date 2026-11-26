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
const PROVIDERS=['./original-engines/npk.cjs','./original-engines/catsystem2.cjs','./original-engines/yuris.cjs','./original-engines/fvp.cjs','./original-engines/iga.cjs','./original-engines/paz.cjs','./original-engines/aquaplus.cjs','./original-engines/mages.cjs','./original-engines/aokana.cjs'];
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
/* 2026-11-15 saved-line voice (user: a CV line of 沙耶の唄 played an AI voice): an engine reader that learned to pair
   voices after its games were scanned raises its revision here; only those games are scanned again (on their next
   start, or when one of their saved lines is played). Hits of an older revision stay valid. */
const ENGINE_REV={'nitroplus-n4':1};
/* 2026-11-15 (user: 有的例句和原配音不一致) quiet keys: the lines a game's script plays no voice for, and the pieces of a
   voiced line that the game shows one at a time (沙耶の唄 sy010: 「俺だって解らない。…思う。<k>お前だって…わけないよ」 is one
   clip, 3/003002; the second piece arrived as its own line and a card cut the game sound after it, music and no voice).
   A clip recorded from the game's sound is never kept or played for a quiet key: the script knows better. Kept in
   quiet/<game>.bin (6 bytes of each key, sorted), only for games whose script names voices. QUIET_REV raised = scan again. */
/* 2026-11-15 (user: 游戏里明明有配音，例句却是 AI 合成) a piece of a voiced line plays the clip of the whole line: that is the
   CV the game plays while the piece is on screen (QUIET_REV 2) */
const QUIET_REV=2;
const stale=g=>!g||g.v!==SCAN_VERSION||(g.rev||0)<(ENGINE_REV[g.engine]||0)||(g.voiced>0&&(g.q||0)<QUIET_REV);
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
const short=k=>Buffer.from(String(k).slice(0,12),'hex');/* 6 bytes of the key */
/* quiet/<game>.bin: the sorted 6-byte keys of one game (a large library holds ~1 M lines; a Set of strings would be tens of MB) */
const quietDir=root=>path.join(cacheDir(root),'quiet');
let quietMemo=null;
function quiet(root){if(!quietMemo||quietMemo.root!==root){const lists=[];let names=[];try{names=fs.readdirSync(quietDir(root)).filter(n=>/^[0-9a-f]{16}\.bin$/.test(n));}catch{}
  for(const n of names){try{const b=fs.readFileSync(path.join(quietDir(root),n));if(b.length%6===0)lists.push(b);}catch{}}
  quietMemo={root,has(key){const k=short(key);for(const b of lists){let lo=0,hi=b.length/6-1;while(lo<=hi){const mid=(lo+hi)>>1,c=b.compare(k,0,6,mid*6,mid*6+6);if(c===0)return true;if(c<0)lo=mid+1;else hi=mid-1;}}return false;}};}return quietMemo;}
function writeQuiet(root,g,keys){const file=path.join(quietDir(root),g+'.bin');if(!keys.size){try{fs.unlinkSync(file);}catch{}return;}
 const list=[...keys].map(k=>short(k)).sort(Buffer.compare),out=Buffer.alloc(list.length*6);list.forEach((b,i)=>b.copy(out,i*6));fs.mkdirSync(quietDir(root),{recursive:true});fs.writeFileSync(file+'.tmp',out);fs.renameSync(file+'.tmp',file);}
// Keys of the pieces a line may be shown as: split after a sentence end (。？！…」), every prefix and suffix.
const PIECE_END=/[。？！?!…‥」』）)]/;
function pieceKeys(text){const t=String(text||'').replace(/<[^>]*>/g,''),out=[];for(let i=1;i<t.length-1;i++){if(!PIECE_END.test(t[i])||PIECE_END.test(t[i+1]))continue;for(const part of [t.slice(0,i+1),t.slice(i+1)]){if(norm(part).length<4)continue;const k=keyOf(part);if(k)out.push(k);}}return out;}
const JAPANESE=/[\u3040-\u30ff\u3400-\u9fff]/;
/* What MeguLit knows about a line's voice: 'script' (the script names a clip MeguLit holds), 'quiet' (the script plays
   none for it, or it is a piece of a voiced line), else 'unknown'. */
function verdict(root,text){const k=keyOf(text);if(!k)return 'unknown';const hit=lines(root).lines[k];if(hit&&hit[1]!=='runtime')return 'script';return quiet(root).has(k)?'quiet':'unknown';}
// Seconds of a WAV clip, or null.
function seconds(b){if(!b||b.length<44||b.toString('latin1',0,4)!=='RIFF')return null;const rate=b.readUInt32LE(28);let o=12;while(o+8<=b.length){const id=b.toString('latin1',o,o+4),n=b.readUInt32LE(o+4);if(id==='data')return rate>0?Math.min(n,b.length-o-8)/rate:null;o+=8+n+(n&1);}return null;}
/* A clip cut from the game's sound may stand for a line only when the script does not say otherwise and its length fits
   the text (Japanese speech runs about 4-12 characters a second; very slow lines and pauses get room). */
/* 2026-11-15 when the script names a clip for the line (or for the voiced line a piece belongs to), that clip is the voice:
   a recording cut from the game sound does not stand in for it */
function recordedFits(root,text,audio){if(typeof audio==='string')audio=Buffer.from(audio,'base64');const v=verdict(root,text);if(v==='quiet'||v==='script')return false;
 const sec=seconds(audio),n=norm(text).length;if(sec===null||!n)return sec!==null||!!kind(audio);return sec>=Math.min(0.6,n*0.05)&&sec<=2.5+n*0.45;}
// Scan one game: every line whose script names a voice that the folder really holds. Returns counts per engine.
function scan(root,dir,{engine,scenes}={}){const sc=require('./original-engines/scenes.cjs');
 const id=engine||sc.detect(dir);if(!id)return {engine:null,lines:0,voiced:0,found:0};
 const list=scenes||sc.read(id,dir),cat=catalogFor(dir),g=gameKey(dir),data=lines(root),missing=new Set();
 /* E461 a scan replaces what an earlier scan of this game gave (a reader fixed since may pair lines differently); clips
    kept while the game ran stay */
 for(const [k,v] of Object.entries(data.lines))if(v[0]===g&&v[1]!=='runtime')delete data.lines[k];let total=0,voiced=0,found=0;
 const said=new Set(),silent=new Set(),parts=new Set(),partRef=new Map();
 for(const s of list){const v=s.voices||[];for(let i=0;i<(s.lines||[]).length;i++){total++;{const kl=keyOf(s.lines[i]);if(kl){if(v[i]){said.add(kl);for(const pk of pieceKeys(s.lines[i])){parts.add(pk);if(!partRef.has(pk)&&cat.get(v[i]))partRef.set(pk,v[i]);}}else if(JAPANESE.test(s.lines[i]))silent.add(kl);}}if(!v[i])continue;voiced++;if(!cat.get(v[i])){if(!/^koe:/.test(v[i]))missing.add(v[i].slice(v[i].lastIndexOf('/')+1)); /* E461 a cold run looks files up by name */continue;}found++;const k=keyOf(s.lines[i]);if(!k)continue;/* 2026-11-15 the script's own clip replaces a clip cut from the game sound */if(!data.lines[k]||data.lines[k][1]==='runtime')data.lines[k]=[g,v[i]];
  /* a speech spread over several script lines (an open 「 closed later) is shown as one: key the whole of it too */
  let whole=s.lines[i];for(let j=i+1;j<s.lines.length&&j<i+8&&!v[j]&&/^[「『]/.test(whole)&&!/[」』]$/.test(whole);j++)whole+=s.lines[j];if(whole!==s.lines[i]){const kw=keyOf(whole);if(kw&&!data.lines[kw])data.lines[kw]=[g,v[i]];}}}
 /* engines whose voices are numbered in a separate source (Siglus Scene.pck) give text and voice pairs directly */
 let extra=[];try{extra=sc.ENGINES[id]?.voiceLines?.(dir)||[];}catch{}
 for(const x of extra){voiced++;{const kx=keyOf(x.text);if(kx){said.add(kx);for(const pk of pieceKeys(x.text))parts.add(pk);}}if(!cat.get(x.ref)){missing.add(x.ref);continue;}found++;const k=keyOf(x.text);if(k&&!data.lines[k])data.lines[k]=x.estimated?[g,x.ref,null,'estimated']:[g,x.ref];}
 for(const [pk,ref] of partRef)if(!said.has(pk)&&(!data.lines[pk]||data.lines[pk][1]==='runtime')){const old=data.lines[pk];if(old){try{fs.unlinkSync(path.join(cacheDir(root),'runtime',pk+(old[2]||'.wav')));}catch{}}data.lines[pk]=[g,ref,null,'piece'];}
 /* quiet keys of this game (only when its script names voices for a fair share of its lines) */
{const keep=voiced>0&&voiced>=total*0.05,set=new Set();if(keep){for(const k of [...silent,...parts])if(!said.has(k))set.add(k);}
  writeQuiet(root,g,set);quietMemo=null;
  /* clips cut from the game sound for a quiet line go */
  if(set.size)for(const [k,v] of Object.entries(data.lines))if(v[1]==='runtime'&&set.has(k)){delete data.lines[k];try{fs.unlinkSync(path.join(cacheDir(root),'runtime',k+(v[2]||'.wav')));}catch{}}}
 data.games[g]={...data.games[g],v:SCAN_VERSION,rev:ENGINE_REV[id]||0,q:QUIET_REV,dir:path.resolve(dir),engine:id,scanned:Date.now(),lines:total,voiced,found,missing:missing.size};save(root);return {engine:id,lines:total,voiced,found,missing:[...missing]};}
// A game folder as the player picks it: the game may sit one or two folders down (an unpacked release).
function gameDir(dir,depth=2){const sc=require('./original-engines/scenes.cjs');let id=null;try{id=sc.detect(dir);}catch{}if(id)return {dir,engine:id};if(depth<=0)return null;
 let list=[];try{list=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&!/^(?:savedata|save|\.megulit)/i.test(e.name));}catch{}
 for(const e of list){const hit=gameDir(path.join(dir,e.name),depth-1);if(hit)return hit;}return null;}
// Keep a clip recorded while the game ran for this line (runtime source). Never replaces a scanned voice.
function remember(root,text,audio,{game='runtime',save:keep=true}={}){if(typeof audio==='string')audio=Buffer.from(audio,'base64');const k=keyOf(text),t=kind(audio);if(!k||!t)return false;const data=lines(root);if(data.lines[k]&&data.lines[k][1]!=='runtime')return false;if(!recordedFits(root,text,audio))return false;
 const file=path.join(cacheDir(root),'runtime',k+t.ext);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,audio);data.lines[k]=[game,'runtime',t.ext];if(keep)save(root);return true;}
// After remember(..., {save:false}) calls: writes the index once.
function flush(root){save(root);}
// The voice for a line: {data, mime, source:'scan'|'runtime'} or null. A scanned clip is copied to the cache the first time.
/* E461 a voice from a scan older than SCAN_VERSION may belong to another line: not played; that game is scanned again
   in the background (once) and the line has its voice when that is done */
const REFRESH_COOLDOWN_MS=10*60*1000;
const refreshing=new Map();
function refresh(root,game){const k=gameKey(game.dir),until=refreshing.get(k)||0;if(until===Infinity||Date.now()<until||!fs.existsSync(game.dir))return;refreshing.set(k,Infinity);scanInWorker(root,game.dir,msg=>{if(msg?.g&&msg?.r)refreshing.delete(k);else refreshing.set(k,Date.now()+REFRESH_COOLDOWN_MS);});}
function find(root,text){const k=keyOf(text);if(!k)return null;const hit=lines(root).lines[k];if(!hit)return null;const [g,ref,ext]=hit;
 if(ref!=='runtime'){const game=lines(root).games[g];if(game&&game.v!==SCAN_VERSION){try{refresh(root,game);}catch{}return null;}}
 if(ref==='runtime'&&quiet(root).has(k)){delete lines(root).lines[k];try{save(root);fs.unlinkSync(runtimeFile(root,k,ext));}catch{}return null;}
 if(ref==='runtime'){try{const data=fs.readFileSync(path.join(cacheDir(root),'runtime',k+(ext||'.wav')));const t=kind(data);return t?{data,mime:t.mime,source:'runtime'}:null;}catch{return null;}}
 return clip(root,g,ref,hit[3]==='estimated');}
/* 2026-11-15 one scanned clip by its game key and script reference (a saved line keeps these): from the cache, else read
   out of the game's archive and cached */
function clip(root,g,ref,estimated=false){const more=estimated?{estimated:true}:{};
 const dir=path.join(cacheDir(root),g);for(const e of ['.ogg','.wav','.mp3','.m4a']){try{const data=fs.readFileSync(path.join(dir,sha1(ref)+e));const t=kind(data);if(t)return {data,mime:t.mime,source:'scan',...more};}catch{}}
 const game=lines(root).games[g];if(!game)return null;let data;try{data=catalogFor(game.dir).get(ref)?.();}catch{}const t=kind(data);if(!t)return null;
 try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,sha1(ref)+t.ext),data);}catch{}return {data,mime:t.mime,source:'scan',...more};}
// The index entry for a line: {key, game, ref, ext, estimated} or null (no clip read).
function entry(root,text){const k=keyOf(text);if(!k)return null;const hit=lines(root).lines[k];if(!hit)return null;return {key:k,game:hit[0],ref:hit[1],ext:hit[2]||null,estimated:hit[3]==='estimated'};}
// The kept runtime clip file of a line key (game-voice remember), or null.
const runtimeFile=(root,key,ext)=>path.join(cacheDir(root),'runtime',key+(ext||'.wav'));
// The index entry of the game an executable starts (scanLater's from key, or the folder itself), or null.
function gameFor(root,executable){if(!executable)return null;const start=path.dirname(String(executable)),k=gameKey(start);const games=lines(root).games;return games[k]||Object.values(games).find(g=>g.from===k)||null;}
// Scan the game of an executable now (worker thread) unless its index is current; resolves when done.
function ensureScanned(root,executable){const g=gameFor(root,executable);if(g&&!stale(g))return Promise.resolve(false);const start=path.dirname(String(executable||''));if(!start||!fs.existsSync(start))return Promise.resolve(false);
 return new Promise(resolve=>scanInWorker(root,start,({g:found})=>{if(found){const e=lines(root).games[gameKey(found.dir)];if(e&&!e.from){e.from=gameKey(start);save(root);}}resolve(!!found);},true));}
// Scan a game when it starts (its folder from the executable), once a week at most, off the start-up path.
const running=new Set();
/* Voices the scan could not open go to a cold run (voice-cold.cjs) when the setting allows it; the game is scanned again
   once that run ends, so the clips it read count. */
// One scan at a time in a worker thread (game-voice-worker.cjs); the line index is reloaded when it is done.
const scanQueue=[];let scanBusy=false,scanRetry=null;
function scanInWorker(root,start,done,hold=false){scanQueue.push({root,start,done,hold});pump();}
async function pump(){if(scanBusy||!scanQueue.length)return;clearTimeout(scanRetry);scanRetry=null;const manual=scanQueue.findIndex(job=>job.hold),job=scanQueue.splice(manual<0?0:manual,1)[0];scanBusy=true;let w;
 let idle=job.hold;try{if(!idle)idle=await require('./background-games.cjs').idle(job.root);}catch{}
 if(!idle){scanBusy=false;scanQueue.push(job);if(scanQueue.some(next=>next.hold))pump();else{scanRetry=setTimeout(pump,30000);scanRetry.unref?.();}return;}
 let settled=false;const finish=msg=>{if(settled)return;settled=true;scanBusy=false;memo=null;if(msg?.g)catalogs.delete(gameKey(msg.g.dir));try{job.done(msg||{});}catch{}pump();};
 try{w=new (require('node:worker_threads').Worker)(path.join(__dirname,'game-voice-worker.cjs'),{workerData:{root:job.root,start:job.start}});}catch{return finish(null);}
 w.once('message',finish);w.once('error',()=>finish(null));w.once('exit',()=>finish(null));/* a scan someone awaits (ensureScanned) keeps the process alive */if(!job.hold)w.unref?.();}
function scanLater(root,executable,delay=8000,{cold=false}={}){if(!executable)return;const start=path.dirname(String(executable)),k=gameKey(start);if(running.has(k))return;const seen=Object.values(lines(root).games).find(g=>g.from===k);if(seen&&!stale(seen)&&Date.now()-seen.scanned<7*864e5)return;running.add(k);
 const t=require('./background-budget.cjs').schedule(root,()=>scanInWorker(root,start,({g,r})=>{running.delete(k);if(!g||!r)return;const e=lines(root).games[gameKey(g.dir)];if(e){e.from=k;save(root);}
   if(cold&&r.missing?.length){const vc=require('./voice-cold.cjs');const off=vc.onDone(job=>{if(job.game.dir===g.dir){off();scanInWorker(root,g.dir,()=>{});}});vc.consider(root,{executable:String(executable),dir:g.dir,engine:g.engine},r.missing);}}),{delay});t.unref?.();}
/* 2026-11-15 every indexed game whose index is out of date (an engine reader or the quiet keys changed) is scanned again,
   once per process, one at a time in the worker; resolves when all are done. Anki review and saved lines wait for it
   briefly, so a card of a game not started since still gets its clips checked. */
const staleRuns=new Map();
function refreshStale(root){if(staleRuns.has(root))return staleRuns.get(root);const games=Object.values(lines(root).games).filter(g=>stale(g)&&g.dir&&fs.existsSync(g.dir)).sort((a,b)=>(a.lines||0)-(b.lines||0));
 const run=Promise.all(games.map(g=>new Promise(resolve=>scanInWorker(root,g.dir,()=>resolve(),true)))).then(()=>games.length);staleRuns.set(root,run);return run;}
function recordingExists(file){try{const s=fs.statSync(file);return s.isFile()&&s.size>=12;}catch{return false;}}
function has(root,text){const hit=entry(root,text);if(!hit)return false;
 if(hit.ref==='runtime')return !quiet(root).has(hit.key)&&recordingExists(runtimeFile(root,hit.key,hit.ext));
 return true;}
module.exports={refreshStale,verdict,recordedFits,recordingExists,seconds,pieceKeys,QUIET_REV,flush,hashedPaths,scanLater,norm,keyOf,kind,catalog,arcList,ovkList,scan,gameDir,remember,find,has,gameKey,clip,entry,runtimeFile,gameFor,ensureScanned,stale,ENGINE_REV,_reset(){memo=null;quietMemo=null;catalogs.clear();}};
