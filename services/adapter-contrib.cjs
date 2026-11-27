// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-15 crowd adaptation contribution (适配贡献). With the player's informed consent, the scripts and the main
   program's code of a library game that MeguLit cannot read well go to the maintainer, who writes an adapter pack (signed
   JSON, live within 6 h) or a JS hot update from them and sends it back. Three rules hold in code; none of them may be
   dropped, they are what makes the feature acceptable:

   1. Informed consent (consentState / setConsent)
      library.json adapterContrib true|false. 2026-11-28 (user: over a thousand players agreed; asked, players found any
      note a bother — 默认开着就行): on by default in every build with no question and no note, and the first start of
      every new version turns it on again for everyone. Settings → 游戏库 turns it off until the next update. Off =
      nothing is collected or sent.
   2. Only the game, nothing else (collect)
      only a game registered in the MeguLit library AND listed by the probe as not reading well; only files inside that
      game's own folder (real paths checked, links that leave the folder are refused); a folder that is a drive root, the
      user's home, Desktop, Documents or Downloads (a game registered from there) is refused as a whole. Taken: script
      entries (archive entries and loose files with a script extension), the main program's PE header, code and read-only
      / initialized data sections (hook points, decrypt keys), KiriKiri .tpm plugin code, the index window of a script
      archive no reader can open, and the size / hash of the game's top-level files. Never: images, audio, video, fonts,
      saves, screenshots, .rsrc, files outside the folder (MEDIA_EXT / media magic / SAVE_PATH, checked once more on the
      bytes). Names are relative to the game folder; the user's home path, user name and computer name are masked in the
      manifest and in every blob.
   3. Deleted after use
      the gzip package lives in data/adapter-contrib/outbox only until the relay has every part, then it is deleted (also
      when the switch is turned off, and anything older than 7 days). The relay deletes a package when the maintainer marks
      the game adapted, and on its own after 30 days (relay/src/contrib.js).

   Package (.mgct.gz, schema megulit.contrib v1): gzip( "MGCT" 0x01, u32le manifest length, manifest JSON, blobs ).
   manifest {schema,version,app,createdAt,identity,game:{title,step,detected,exe:{name,size,sha256}},files:[{name,role,size,
   sha256,offset,length,archive?}],versionInfo:[{name,size}],dropped:{media,save,outside,budget}}
   Upload: PUT-like chunks of CHUNK bytes to <relay>/api/contrib/chunk, resumable (GET /api/contrib/status lists the parts
   the relay holds), one package per game identity (GET /api/contrib/has). */
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib'),{promisify}=require('node:util');
const gzip=promisify(zlib.gzip),deflateRaw=promisify(zlib.deflateRaw);

const CHUNK=4<<20,MAX_PACKED=24<<20,MAX_RAW=128<<20,ENTRY_MAX=16<<20,EXE_MAX=96<<20,INDEX_WINDOW=2<<20,WALK_MAX=20000,WALK_DEPTH=5,KEEP_DAYS=7;
const RETRY_MIN=15*60000,RETRY_MAX=24*3600000;
const SCHEMA='megulit.contrib',MAGIC=Buffer.from('MGCT\x01','latin1');

/* ---- rule 1: consent ------------------------------------------------------------------------------------------- */
const libFile=root=>path.join(root,'data','config','library.json');
function readJSON(file,fallback={}){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:fallback;}catch{return fallback;}}
function atomic(file,v){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v));fs.renameSync(tmp,file);}
function appVersion(root){try{return require('./shared-adaptation.cjs').appVersion(root)||'';}catch{return '';}}
const isBeta=v=>/^\d+\.\d+\.\d+-beta\.\d+$/i.test(String(v||'').replace(/^v/,''));
/* consentState(root) → {enabled, decided, beta, ask, notice}
   ask, notice: always false since 2026-11-28 (nothing asks or notes any more; kept for older callers) */
function consentState(root,{version=appVersion(root)}={}){
 const f=libFile(root);let lib=readJSON(f);const beta=isBeta(version);
 /* 2026-11-28 (user: 更新了新版就自动打开 防止bug 所有人都这样): the first start of every new version turns it on for
    everyone, also for players who turned it off before */
 if(version&&lib.adapterContribVersion!==version){lib={...lib,adapterContrib:true,adapterContribAt:Date.now(),adapterContribSource:'update',adapterContribVersion:version};try{atomic(f,lib);}catch{}}
 const decided=typeof lib.adapterContrib==='boolean';
 return {enabled:decided?lib.adapterContrib:true,decided,beta,ask:false,notice:false};}
const enabled=(root,o)=>consentState(root,o).enabled;
/* the player's decision (the update card or Settings). Turning it off also deletes whatever is waiting locally. */
function setConsent(root,on,{source='settings',version=appVersion(root)}={}){const f=libFile(root);atomic(f,{...readJSON(f),adapterContrib:on===true,adapterContribAt:Date.now(),adapterContribSource:String(source).slice(0,20),adapterContribVersion:version});
 if(on!==true)purgeOutbox(root);return consentState(root);}
function noticeSeen(root){const f=libFile(root),lib=readJSON(f);if(!(Number(lib.adapterContribNoticeAt)>0))atomic(f,{...lib,adapterContribNoticeAt:Date.now()});return consentState(root);}

/* ---- rule 2: only the game ------------------------------------------------------------------------------------- */
const MEDIA_EXT=new Set('png jpg jpeg jfif bmp gif tlg tlg5 tlg6 tga webp dds psd ico cur ani avif heic jxr pna eri hg2 hg3 cbg g00 pb3 ogg oga wav mp3 opus flac m4a aac wma at3 at9 vag hca adx awb acb bnk fsb xwb xwma mid midi mp4 m4v webm avi wmv mpg mpeg mkv ogv mov flv usm bik bk2 mpv amv ttf otf ttc woff woff2 fon fnt pfb'.split(' '));
const SAVE_EXT=new Set('sav ksd kdt bak sav2 sv dat2 tmp log dmp'.split(' '));
const SAVE_PATH=/(^|[\\/])(save|saves|savedata|save_data|savefile|userdata|screenshots?|スクショ|セーブ|存档|截图)([\\/]|$)/i;
const SCRIPT_EXT=new Set('ks tjs scn ss scr sc s ws2 ws mjo hcb ybn snr bsc asb mes msg nut lua rpy rpyc txt csv json ast sco scb bsxx sdat'.split(' '));
const ARCHIVE_EXT=new Set('xp3 pak pac arc npk pfs int ypf mpk dat bin cpk rio arc4 nsa sar ar2 gxp lpk iar war'.split(' '));
const MEDIA_NAME=/(^|[\\/_.-])(bgm|bgv|voice|vo|se|sound|sfx|movie|video|image|images|img|bg|cg|ev|chara|char|fg|stand|face|sprite|font|fonts|evimage|graphic|graphics|thumbnail|thum)([\\/_.\d-]|$)/i;
const SCRIPTY=/script|scenario|scene|scn|story|text|msg|mes|data|sys|main|game|patch/i;
const PATCHY=/patch|chs|cht|chn|cn|zh|汉化|漢化|中文/i;
const ext=n=>path.extname(String(n)).slice(1).toLowerCase();
/* media by content: images, audio, video, fonts. Checked on every blob before it goes into a package. */
function isMediaBytes(b){if(!b||b.length<4)return false;const h=b.subarray(0,16),s=h.toString('latin1');
 return h[0]===0x89&&s.startsWith('\x89PNG')||h[0]===0xff&&h[1]===0xd8&&h[2]===0xff||s.startsWith('GIF8')||s.startsWith('BM')&&b.length>26&&b.readUInt32LE(2)===b.length||s.startsWith('OggS')||s.startsWith('RIFF')||s.startsWith('ID3')||s.startsWith('fLaC')||
  s.startsWith('TLG')||s.startsWith('DDS ')||s.startsWith('8BPS')||s.startsWith('OTTO')||s.startsWith('wOFF')||s.startsWith('ttcf')||h.readUInt32BE(0)===0x00010000&&b.length>12&&h.readUInt16BE(4)<64||h[0]===0x1a&&h[1]===0x45&&h[2]===0xdf&&h[3]===0xa3||
  s.slice(4,8)==='ftyp'||s.startsWith('FWS')||s.startsWith('CWS')||s.startsWith('BIKi')||s.startsWith('KB2')||s.startsWith('CRID')||s.startsWith('@UTF')||s.startsWith('AFS2')||s.startsWith('FSB5')||s.startsWith('HCA')||s.startsWith('\x30\x26\xb2\x75');}
const mediaName=n=>MEDIA_EXT.has(ext(n));
const saveName=n=>SAVE_PATH.test(String(n))||SAVE_EXT.has(ext(n));
/* the folder may be the game's: not a drive root, not the user's home or one of its everyday folders, not a parent of
   them, and it must hold the program */
function gameFolderOk(dir,exe){let real;try{real=fs.realpathSync(dir);}catch{return false;}const r=path.resolve(real),parsed=path.parse(r);if(r===parsed.root)return false;
 const home=path.resolve(os.homedir()),norm=p=>process.platform==='win32'?p.toLowerCase():p;
 for(const p of [home,...['Desktop','Documents','Downloads','Pictures','Videos','Music','OneDrive'].map(n=>path.join(home,n))]){const rel=path.relative(norm(r),norm(p));if(norm(r)===norm(p)||!rel.startsWith('..')&&!path.isAbsolute(rel))return false;}
 if(['windows','program files','program files (x86)','programdata','users'].includes(path.basename(r).toLowerCase())&&path.dirname(r)===parsed.root)return false;
 try{return fs.statSync(exe).isFile()&&inside(r,exe);}catch{return false;}}
/* file is inside dir after resolving links */
function inside(dir,file){try{const a=fs.realpathSync(dir),b=fs.realpathSync(file);const rel=path.relative(a,b);return !!rel&&!rel.startsWith('..')&&!path.isAbsolute(rel);}catch{return false;}}

/* masking: the user's home path, user name and computer name, in strings and in bytes (same length, so offsets stay) */
function needles(){const out=new Set();let user='';try{user=os.userInfo().username||'';}catch{}const home=os.homedir();
 for(const h of [home,home.replace(/\\/g,'/')])if(h&&h.length>=4)out.add(h);
 if(user.length>=3)out.add(user);const host=os.hostname();if(host&&host.length>=3)out.add(host);return [...out].sort((a,b)=>b.length-a.length);}
function maskText(s,list=needles()){let out=String(s);for(const n of list){const re=new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');out=out.replace(re,'<masked>');}return out;}
function maskBytes(buf,list=needles()){let hits=0;for(const n of list)for(const enc of ['utf8','utf16le']){const needle=Buffer.from(n,enc),low=Buffer.from(n.toLowerCase(),enc);
  for(const nb of needle.equals(low)?[needle]:[needle,low]){let at=buf.indexOf(nb);while(at>=0){const fill=enc==='utf16le'?Buffer.from('*'.repeat(n.length),'utf16le'):Buffer.alloc(nb.length,0x2a);fill.copy(buf,at);hits++;at=buf.indexOf(nb,at+nb.length);}}}
 return hits;}

/* ---- PE sections ------------------------------------------------------------------------------------------------ */
/* the header, code sections, .rdata / .data (keys and tables); never .rsrc (icons, images) or anything not mapped */
function peSections(file){let fd;try{fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size;if(size<512||size>EXE_MAX)return null;const head=Buffer.alloc(Math.min(size,4096));fs.readSync(fd,head,0,head.length,0);
  if(head.toString('latin1',0,2)!=='MZ')return null;const pe=head.readUInt32LE(0x3c);if(pe+24>head.length||head.toString('latin1',pe,pe+4)!=='PE\0\0')return null;
  const n=head.readUInt16LE(pe+6),opt=head.readUInt16LE(pe+20),table=pe+24+opt,out=[{name:'header',role:'exe-header',at:0,size:Math.min(size,Math.max(1024,table+n*40))}];
  for(let i=0;i<n&&table+i*40+40<=head.length;i++){const p=table+i*40,name=head.toString('latin1',p,p+8).replace(/\0.*$/s,''),rawSize=head.readUInt32LE(p+16),rawAt=head.readUInt32LE(p+20),ch=head.readUInt32LE(p+36);
   if(!rawSize||rawAt+rawSize>size)continue;const code=(ch&0x20)||(ch&0x20000000),data=/^\.(rdata|data|idata|tls|edata)$|^\.?(CRT|DATA|rodata)$/i.test(name)||(ch&0x40)&&!(ch&0x20)&&!/rsrc|reloc/i.test(name);
   if(/rsrc|reloc/i.test(name))continue;if(code)out.push({name,role:'exe-code',at:rawAt,size:rawSize});else if(data)out.push({name,role:'exe-data',at:rawAt,size:rawSize});}
  return out.map(s=>{const b=Buffer.alloc(s.size);fs.readSync(fd,b,0,s.size,s.at);return {...s,data:b};});}catch{return null;}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}}

/* ---- walking the game folder --------------------------------------------------------------------------------------- */
function walk(dir){const out=[],stack=[[dir,0]];let seen=0;
 while(stack.length&&seen<WALK_MAX){const [d,depth]=stack.pop();let list;try{list=fs.readdirSync(d,{withFileTypes:true});}catch{continue;}
  for(const e of list){if(++seen>WALK_MAX)break;const f=path.join(d,e.name),rel=path.relative(dir,f).replace(/\\/g,'/');
   if(e.isSymbolicLink())continue;/* links never followed */
   if(e.isDirectory()){if(depth<WALK_DEPTH&&!SAVE_PATH.test('/'+rel+'/'))stack.push([f,depth+1]);continue;}
   if(e.isFile())out.push({file:f,rel});}}
 return out;}
const readFile=f=>{try{return fs.readFileSync(f);}catch{return null;}};
const readRange=(f,at,n)=>{try{return require('./original-engines/kit.cjs').readAt(f,at,n);}catch{return null;}};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

/* collect(root,db,gameId,{result}) → {ok:true,file,sha256,size,raw,manifest} | {ok:false,reason}
   rule 2 is checked here, not by the caller: library + probe problem + folder checks */
async function collect(root,db,gameId,{result=null,outDir=outbox(root),now=Date.now()}={}){
 if(!enabled(root))return {ok:false,reason:'OFF'};
 const probe=require('./adapter-probe.cjs'),game=probe.libraryGames(db).find(g=>g.id===String(gameId));if(!game)return {ok:false,reason:'NOT_IN_LIBRARY'};
 const problem=probe.problems(root).find(p=>p.id===game.id);if(!problem)return {ok:false,reason:'READS_WELL'};
 result=result||probe.results(root)[game.id]||{};const dir=path.dirname(game.executable);
 if(!gameFolderOk(dir,game.executable))return {ok:false,reason:'FOLDER_REFUSED'};
 const list=needles(),files=[],blobs=[],dropped={media:0,save:0,outside:0,budget:0,encrypted:0};let raw=0;
 const add=(name,role,data,extra={})=>{if(!data||!data.length)return false;if(isMediaBytes(data)&&!/^exe-/.test(role)){dropped.media++;return false;}if(raw+data.length>MAX_RAW){dropped.budget++;return false;}
  const b=Buffer.from(data);maskBytes(b,list);files.push({name:maskText(name,list).slice(0,240),role,size:data.length,sha256:sha(data),...extra});blobs.push(b);raw+=b.length;return true;};
 /* the main program, and KiriKiri plugins (.tpm: the cxdec filter and its keys live there) */
 const exeName=path.basename(game.executable);let exeInfo={name:maskText(exeName,list),size:0,sha256:''};
 try{const st=fs.statSync(game.executable);exeInfo.size=st.size;if(st.size<=EXE_MAX)exeInfo.sha256=sha(fs.readFileSync(game.executable));}catch{}
 for(const s of peSections(game.executable)||[])add(exeName+'#'+s.name,s.role,s.data,{at:s.at});
 const all=walk(dir).filter(x=>inside(dir,x.file)),versionInfo=[];
 for(const x of all.filter(x=>!x.rel.includes('/')))try{versionInfo.push({name:maskText(x.rel,list),size:fs.statSync(x.file).size});}catch{}
 for(const x of all.filter(x=>x.rel.includes('/')).slice(0,400))try{versionInfo.push({name:maskText(x.rel,list),size:fs.statSync(x.file).size});}catch{}
 for(const x of all.filter(x=>ext(x.rel)==='tpm'&&!x.rel.includes('/')).slice(0,8))for(const s of peSections(x.file)||[])if(s.role!=='exe-data'||s.size<(4<<20))add(x.rel+'#'+s.name,s.role.replace('exe-','plugin-'),s.data,{at:s.at});
 /* archives: script entries (readers with a raw-bytes outlet), else the index window of a script-looking archive */
 const archives=[...new Set([...(result._archives||[]).filter(f=>{try{return inside(dir,f);}catch{return false;}}).map(f=>path.resolve(f)),...all.filter(x=>ARCHIVE_EXT.has(ext(x.rel))).map(x=>path.resolve(x.file))])];
 const order=f=>(PATCHY.test(path.basename(f))?0:SCRIPTY.test(path.basename(f))?1:2);
 for(const f of archives.sort((a,b)=>order(a)-order(b))){const rel=path.relative(dir,f).replace(/\\/g,'/');if(saveName(rel)){dropped.save++;continue;}if(mediaName(rel)){dropped.media++;continue;}
  const patch=PATCHY.test(path.basename(f)),entries=scriptEntries(f);
  if(entries){for(const e of entries){if(e.skip){dropped[e.skip]++;continue;}add(rel+'::'+e.name,patch?'patch-script':'script',e.data,{archive:rel,...(e.encrypted?{encrypted:true}:{})});}continue;}
  if(MEDIA_NAME.test(path.basename(f,path.extname(f)))){dropped.media++;continue;}
  if(!SCRIPTY.test(path.basename(f)))continue;
  let size=0;try{size=fs.statSync(f).size;}catch{continue;}
  if(size<=2*INDEX_WINDOW){add(rel,'archive-whole',readRange(f,0,size));continue;}
  add(rel+'#head','archive-index',readRange(f,0,INDEX_WINDOW),{at:0});add(rel+'#tail','archive-index',readRange(f,size-INDEX_WINDOW,INDEX_WINDOW),{at:size-INDEX_WINDOW});}
 /* loose script files */
 for(const x of all){const e=ext(x.rel);if(!SCRIPT_EXT.has(e))continue;if(saveName(x.rel)){dropped.save++;continue;}
  let st;try{st=fs.statSync(x.file);}catch{continue;}if(st.size>ENTRY_MAX||!st.size)continue;if(['txt','json','csv'].includes(e)&&/readme|license|licence|manual|eula|お読み|はじめに/i.test(x.rel))continue;
  add(x.rel,PATCHY.test(x.rel)?'patch-script':'script',readFile(x.file));}
 if(!files.some(f=>f.role!=='exe-header'))return {ok:false,reason:'NOTHING'};
 /* fit: estimate each blob's packed size, keep in priority order until MAX_PACKED */
 const prio={'exe-header':0,'exe-code':1,'plugin-code':1,'exe-data':2,'plugin-header':2,'plugin-data':3,'patch-script':4,script:5,'archive-index':6,'archive-whole':6};
 const est=await Promise.all(blobs.map(b=>deflateRaw(b,{level:1}).then(z=>z.length)));
 const idx=files.map((f,i)=>i).sort((a,b)=>(prio[files[a].role]??9)-(prio[files[b].role]??9)||est[a]-est[b]);let budget=MAX_PACKED*0.92,keep=new Set();
 for(const i of idx){if(est[i]*1.05<=budget){keep.add(i);budget-=est[i]*1.05;}else dropped.budget++;}
 let at=0;const outFiles=[],outBlobs=[];for(const i of files.map((f,i)=>i).filter(i=>keep.has(i))){outFiles.push({...files[i],offset:at,length:blobs[i].length});outBlobs.push(blobs[i]);at+=blobs[i].length;}
 let identity='';try{const pi=require('./probe-identity.cjs');identity=pi.identity({executable:game.executable,result,vndb:pi.vndbOf(db,game.id)}).id||'';}catch{}
 const manifest={schema:SCHEMA,version:1,app:appVersion(root),createdAt:new Date(now).toISOString(),identity,
  game:{title:maskText(String(game.title||'').slice(0,120),list),step:String(result.step||problem.step||''),detected:result.detected||null,exe:exeInfo},files:outFiles,versionInfo:versionInfo.slice(0,600),dropped};
 const mj=Buffer.from(JSON.stringify(manifest)),len=Buffer.alloc(4);len.writeUInt32LE(mj.length);
 const body=Buffer.concat([MAGIC,len,mj,...outBlobs]);let packed=await gzip(body,{level:9});
 for(let guard=0;packed.length>MAX_PACKED&&manifest.files.length>1&&guard<6;guard++){/* the estimate was low: drop the last tenth */
  const cut=Math.max(1,Math.ceil(manifest.files.length/10));manifest.files.splice(-cut);dropped.budget+=cut;const end=manifest.files.length?manifest.files.at(-1).offset+manifest.files.at(-1).length:0;
  const mj2=Buffer.from(JSON.stringify(manifest));len.writeUInt32LE(mj2.length);packed=await gzip(Buffer.concat([MAGIC,len,mj2,Buffer.concat(outBlobs).subarray(0,end)]),{level:9});}
 if(packed.length>MAX_PACKED)return {ok:false,reason:'TOO_LARGE'};
 const hash=sha(packed);fs.mkdirSync(outDir,{recursive:true});const file=path.join(outDir,hash+'.mgct.gz');fs.writeFileSync(file,packed);
 return {ok:true,file,sha256:hash,size:packed.length,raw:body.length,identity,manifest};}

/* script entries of an archive a reader can list: [{name,data,encrypted?}|{skip:'media'|'save'}] or null */
function scriptEntries(file){const e=ext(file);
 if(e==='xp3'){const skips=[];const keep=n=>{if(mediaName(n)){skips.push({skip:'media'});return false;}if(saveName(n)){skips.push({skip:'save'});return false;}return SCRIPT_EXT.has(ext(n))||/\.(scn|ks|tjs)\./i.test(n);};
  try{const got=require('./original-engines/xp3.cjs').rawEntries(file,{filter:keep,max:ENTRY_MAX});return got?[...skips,...got]:null;}catch{return null;}}
 return null;}

/* parse a package (the workbench and the tests): {manifest, files:[{...entry,data}]} */
function unpack(buf){const body=buf[0]===0x1f&&buf[1]===0x8b?zlib.gunzipSync(buf,{maxOutputLength:512<<20}):buf;if(!body.subarray(0,5).equals(MAGIC))throw Error('NOT_A_CONTRIB_PACKAGE');
 const n=body.readUInt32LE(5),manifest=JSON.parse(body.toString('utf8',9,9+n)),base=9+n;
 return {manifest,files:manifest.files.map(f=>({...f,data:body.subarray(base+f.offset,base+f.offset+f.length)}))};}

/* ---- rule 3 + upload ---------------------------------------------------------------------------------------------- */
const outbox=root=>path.join(root,'data','adapter-contrib','outbox');
const stateFile=root=>path.join(root,'data','adapter-contrib','state.json');
const loadState=root=>{const v=readJSON(stateFile(root));return {version:1,games:v.games&&typeof v.games==='object'?v.games:{},log:Array.isArray(v.log)?v.log.slice(0,40):[]};};
const saveState=(root,s)=>atomic(stateFile(root),s);
/* every local package goes: after a switch-off, or (keep) when older than KEEP_DAYS */
function purgeOutbox(root,{olderThan=0}={}){let n=0;try{for(const f of fs.readdirSync(outbox(root))){const p=path.join(outbox(root),f);try{if(olderThan&&Date.now()-fs.statSync(p).mtimeMs<olderThan)continue;fs.rmSync(p,{force:true});n++;}catch{}}}catch{}return n;}
function base(root){try{return require('./relay-config.cjs').relayBase(root);}catch{return '';}}
async function getJSON(url,fetcher){const r=await fetcher(url,{headers:{'user-agent':'MeguLit'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP_'+r.status);return r.json();}
/* has(root,identity) → 'none'|'receiving'|'complete'|'done'|'expired' | null (offline) */
async function has(root,identity,{fetcher=globalThis.fetch,relay=base(root)}={}){if(!relay||!/^[a-f0-9]{64}$/.test(identity))return null;try{const j=await getJSON(relay+'/api/contrib/has?id='+identity,fetcher);return ['receiving','complete','done','expired'].includes(j.state)?j.state:'none';}catch{return null;}}
/* upload(root,{file,sha256,size,identity,title,upload}) → {state:'uploaded'|'failed'|'off'|'not-configured',upload,sent}
   resumable: the relay says which parts it holds; only the missing ones are sent. The local file is deleted when the
   relay has every part (rule 3). */
async function upload(root,{file,sha256:hash,identity='',title='',upload:id=crypto.randomUUID(),fetcher=globalThis.fetch,relay=base(root),onPart=()=>{}}={}){
 if(!enabled(root))return {state:'off'};if(!relay)return {state:'not-configured'};
 let body;try{body=fs.readFileSync(file);}catch{return {state:'failed',error:'NOT_PREPARED'};}if(sha(body)!==hash)return {state:'failed',error:'HASH_MISMATCH'};
 const parts=Math.ceil(body.length/CHUNK);let have=new Set();
 try{const j=await getJSON(relay+'/api/contrib/status?upload='+id+'&sha256='+hash,fetcher);if(j.state==='complete'){fs.rmSync(file,{force:true});return {state:'uploaded',upload:id,sent:0};}have=new Set((j.received||[]).map(Number));}catch{}
 let sent=0;
 for(let i=0;i<parts;i++){if(have.has(i))continue;if(!enabled(root))return {state:'off'};/* switched off mid-way: stop at once */
  const data=body.subarray(i*CHUNK,(i+1)*CHUNK);let r=null,err='';
  for(let attempt=0;attempt<3;attempt++){try{r=await fetcher(relay+'/api/contrib/chunk',{method:'POST',headers:{'content-type':'application/octet-stream','user-agent':'MeguLit','x-megulit-version':appVersion(root),'x-contrib-upload':id,'x-contrib-part':String(i),'x-contrib-parts':String(parts),'x-contrib-size':String(body.length),'x-contrib-sha256':hash,'x-contrib-identity':identity,...(i===0&&title?{'x-contrib-title':encodeURIComponent(String(title).slice(0,120))}:{})},body:data,signal:AbortSignal.timeout(120000)});if(r.ok||r.status<500)break;}
   catch(e){r=null;err=e?.name==='TimeoutError'?'TIMEOUT':'NETWORK';}await new Promise(res=>setTimeout(res,process.env.NODE_TEST_CONTEXT?1:1000*(attempt+1)));}
  if(!r)return {state:'failed',error:err||'NETWORK',upload:id,sent};let j={};try{j=await r.json();}catch{}
  if(!r.ok||j.ok===false)return {state:'failed',error:String(j.error||'HTTP_'+r.status).slice(0,60),upload:id,sent};
  sent++;onPart(i,parts);if(j.duplicate){fs.rmSync(file,{force:true});return {state:'duplicate',upload:id,sent};}}
 fs.rmSync(file,{force:true});/* rule 3: the relay has it all, the local copy goes */
 return {state:'uploaded',upload:id,sent};}

/* forGame(root,db,game,result) — the probe-auto step for one problem game: one package per identity, resumed after a
   failure, never again once the relay has it. → 'off'|'sent'|'known'|'waiting'|'failed'|'nothing'|'offline'|'refused' */
async function forGame(root,db,game,result,{fetcher=globalThis.fetch,relay=base(root),now=Date.now()}={}){
 if(!enabled(root))return 'off';const s=loadState(root),rec=s.games[game.id]||{};
 if(rec.nextAt&&rec.nextAt>now)return 'waiting';
 if(['sent','known','refused','nothing'].includes(rec.state)&&rec.step===String(result?.step||''))return rec.state==='sent'?'known':rec.state;
 let ident='';try{const pi=require('./probe-identity.cjs');ident=pi.identity({executable:game.executable,result,vndb:pi.vndbOf(db,game.id)}).id||'';}catch{}
 const remote=ident?await has(root,ident,{fetcher,relay}):null;if(ident&&remote===null){return 'offline';}
 if(remote==='complete'||remote==='done'){s.games[game.id]={state:'known',identity:ident,step:String(result?.step||''),at:now};saveState(root,s);return 'known';}
 /* a package from an earlier try: resume it */
 let pkg=rec.file&&rec.sha256&&fs.existsSync(rec.file)?{file:rec.file,sha256:rec.sha256,size:rec.size,identity:rec.identity}:null;
 if(!pkg){const c=await collect(root,db,game.id,{result,now});if(!c.ok){const st=['FOLDER_REFUSED','NOT_IN_LIBRARY','READS_WELL'].includes(c.reason)?'refused':c.reason==='NOTHING'?'nothing':c.reason==='OFF'?'off':'failed';
   s.games[game.id]={state:st,reason:c.reason,step:String(result?.step||''),at:now,...(st==='failed'?{attempts:(rec.attempts|0)+1,nextAt:now+RETRY_MAX}:{})};saveState(root,s);return st;}
  pkg={file:c.file,sha256:c.sha256,size:c.size,identity:c.identity||ident};s.games[game.id]={...pkg,state:'pending',upload:crypto.randomUUID(),step:String(result?.step||''),at:now};saveState(root,s);}
 const cur=s.games[game.id]||{...pkg,upload:crypto.randomUUID()};
 const u=await upload(root,{file:pkg.file,sha256:pkg.sha256,identity:pkg.identity,title:game.title,upload:cur.upload||crypto.randomUUID(),fetcher,relay});
 if(u.state==='uploaded'||u.state==='duplicate'){s.games[game.id]={state:'sent',identity:pkg.identity,step:String(result?.step||''),size:pkg.size,at:now};
  s.log=[{at:now,gameId:game.id,title:String(game.title||'').slice(0,80),bytes:pkg.size,state:u.state},...s.log].slice(0,40);saveState(root,s);return 'sent';}
 if(u.state==='off'){purgeOutbox(root);delete s.games[game.id];saveState(root,s);return 'off';}
 if(u.state==='not-configured')return 'offline';
 const attempts=(cur.attempts|0)+1;s.games[game.id]={...cur,...pkg,state:'pending',error:String(u.error||'').slice(0,40),attempts,nextAt:now+Math.min(RETRY_MAX,RETRY_MIN*2**Math.min(6,attempts-1))};saveState(root,s);return 'failed';}

/* status for the Settings / probe dialog: consent, what was sent, what waits */
function status(root){const s=loadState(root);return {...consentState(root),games:s.games,log:s.log};}

module.exports={consentState,enabled,setConsent,noticeSeen,collect,unpack,upload,has,forGame,status,purgeOutbox,outbox,stateFile,
 peSections,isMediaBytes,maskText,maskBytes,needles,gameFolderOk,inside,isBeta,CHUNK,MAX_PACKED,KEEP_DAYS,SCHEMA};
