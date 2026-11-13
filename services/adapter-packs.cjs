// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E561 adapter packs: declarative, signed adaptations that ship without an app release (user 2026-11-13: 做完美，以后更新也能
   适配不会出问题). Format reference: docs/ADAPTER-PACKS.md, schema: docs/adapter-pack.schema.json.

   A pack is data, never code. It says which game folders it is for (match), where the script entries are (source:
   loose files, a declared index table, XP3 or PFS archives), how to turn the stored bytes into plain script (transforms:
   xor, xor-index, add/sub, not, rotate, zlib, raw deflate, LZSS, skip/take), how to cut that script into lines (grammar:
   text lines with safe regular expressions, or length-prefixed / NUL-terminated strings in bytecode), how to pair it
   (pairing hints) and extra decrypt parameters for readers MeguLit already has (params: cx-scheme, paz-scheme, malie-scheme, and the per-title keys qlie-key / entis-key / marble-key, and warc-scheme).

   Safety. Every pack is signed (Ed25519 over its canonical JSON) with a key listed in services/adapter-pack-keys.json;
   a pack that is unsigned, signed by an unknown key, altered, invalid, or needs a capability this app lacks is skipped,
   never loaded. Regular expressions are limited to forms that cannot backtrack exponentially and run on lines of at
   most 4096 characters; every read is capped (files, bytes, inflated size). The engine below catches everything: a
   broken pack yields no scenes, it never throws into a reader.

   Compatibility. `format` is the pack format (this app reads FORMATS, migrating older ones up), `requires` lists the
   capabilities it uses (a pack needing one this app does not know is skipped, so new packs never break old apps),
   `minApp` / `maxApp` bound the app versions. Store: data/adapter-packs/ (packs/<id>/<version>.json + state.json). */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');

const SCHEMA='megulit.adapter-pack',FORMAT=1,FORMATS=[1];
/* Every capability a format-1 pack may require. Adding one is fine; removing or changing one is a new format. */
const CAPABILITIES=Object.freeze(['container:loose','container:table','container:xp3','container:pfs',
 'transform:xor','transform:xor-index','transform:add','transform:sub','transform:not','transform:rol','transform:ror','transform:zlib','transform:deflate-raw','transform:lzss','transform:skip','transform:take',
 'grammar:lines','grammar:strings','params:cx-scheme','params:paz-scheme','match:exe','match:files',
 /* E578 per-title keys for the Malie reader (malie.cjs) */
 'params:malie-scheme',
 /* E581–E584 per-title keys for QLIE 3.0 game keys, Entis NOA passwords, Marble passphrases */
 'params:qlie-key','params:entis-key','params:marble-key',
 /* E596 runtime findings: an index recovered from the running game, the block ciphers whose keys it held, xor keys
    that line up with the file offset */
 'container:index','transform:blowfish','transform:tea','transform:xtea','transform:camellia','transform:xor-file',
 /* E602 per-title keys for the ShiinaRio WARC reader (shiinario.cjs / shiinario-crypt.cjs) */
 'params:warc-scheme']);
const LIMITS=Object.freeze({packBytes:256*1024,files:20000,fileBytes:64<<20,totalBytes:512<<20,inflated:64<<20,lineChars:4096,regex:300,strip:16,entries:200000,scenes:20000});
const ID=/^[a-z0-9][a-z0-9-]{2,63}$/,HEX=/^(?:[0-9a-f]{2})+$/i,SEMVER=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ENCODINGS=['shift_jis','utf-8','utf-16le','gbk','euc-jp','big5'];

/* ---- versions / canonical JSON ---------------------------------------------------------------------------------- */
function semverCompare(a,b){const pa=String(a).split('-'),pb=String(b).split('-'),na=pa[0].split('.').map(Number),nb=pb[0].split('.').map(Number);
 for(let i=0;i<3;i++){if((na[i]||0)!==(nb[i]||0))return (na[i]||0)<(nb[i]||0)?-1:1;}
 const ra=pa.slice(1).join('-'),rb=pb.slice(1).join('-');if(ra===rb)return 0;if(!ra)return 1;if(!rb)return -1;
 const xa=ra.split('.'),xb=rb.split('.');for(let i=0;i<Math.max(xa.length,xb.length);i++){if(xa[i]===undefined)return -1;if(xb[i]===undefined)return 1;const a1=/^\d+$/.test(xa[i]),b1=/^\d+$/.test(xb[i]);
  if(a1&&b1){const d=Number(xa[i])-Number(xb[i]);if(d)return d<0?-1:1;}else if(xa[i]!==xb[i])return a1?-1:b1?1:xa[i]<xb[i]?-1:1;}return 0;}
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
const unsigned=p=>{const {signature,...rest}=p||{};return rest;};
const digest=p=>crypto.createHash('sha256').update(canonical(unsigned(p))).digest('hex');

/* ---- keys / signatures ------------------------------------------------------------------------------------------ */
let trusted=null;
function keys(){if(trusted)return trusted;let raw={};try{raw=JSON.parse(fs.readFileSync(path.join(__dirname,'adapter-pack-keys.json'),'utf8'));}catch{}
 return (Array.isArray(raw.keys)?raw.keys:[]).filter(k=>k&&k.alg==='ed25519'&&typeof k.id==='string'&&typeof k.publicKey==='string'&&!k.revoked);}
/* tests trust their own key; nothing outside this process can call it */
function _trust(list){trusted=list?list.slice():null;}
function verifySignature(pack,list=keys()){
 const s=pack?.signature;if(!s||s.alg!=='ed25519'||typeof s.keyId!=='string'||typeof s.value!=='string')return {ok:false,error:'UNSIGNED'};
 const key=list.find(k=>k.id===s.keyId);if(!key)return {ok:false,error:'UNKNOWN_KEY'};
 try{const pub=crypto.createPublicKey({key:Buffer.from(key.publicKey,'base64'),format:'der',type:'spki'});
  return crypto.verify(null,Buffer.from(canonical(unsigned(pack))),pub,Buffer.from(s.value,'base64'))?{ok:true,keyId:key.id}:{ok:false,error:'BAD_SIGNATURE'};}
 catch{return {ok:false,error:'BAD_SIGNATURE'};}}
/* for tools/adapter-pack.cjs and tests: sign with a PKCS#8 private key (PEM or KeyObject) */
function sign(pack,privateKey,keyId){const body=unsigned(pack);const key=typeof privateKey==='string'?crypto.createPrivateKey(privateKey):privateKey;
 return {...body,signature:{alg:'ed25519',keyId,value:crypto.sign(null,Buffer.from(canonical(body)),key).toString('base64')}};}

/* ---- regex safety ----------------------------------------------------------------------------------------------- */
/* Allowed: no backreferences, no lookbehind, no quantified group that itself holds a quantifier or an alternation
   ((a+)+, (a|aa)* are refused), at most LIMITS.regex characters, flags from "imsu". */
function safeRegex(src,flags=''){
 if(typeof src!=='string'||!src||src.length>LIMITS.regex||!/^[gimsu]*$/.test(flags))return null;
 if(/\\[1-9]|\\k<|\(\?<[=!]/.test(src))return null;
 /* every group: its body and what follows it */
 const stack=[];let esc=false,cls=false;
 for(let i=0;i<src.length;i++){const ch=src[i];if(esc){esc=false;continue;}if(ch==='\\'){esc=true;continue;}if(cls){if(ch===']')cls=false;continue;}if(ch==='['){cls=true;continue;}
  if(ch==='(')stack.push({at:i,inner:false});
  else if(ch===')'){const g=stack.pop();if(!g)return null;const next=src[i+1];const quantified=next==='*'||next==='+'||next==='?'||next==='{';
   if(quantified&&g.inner&&next!=='?')return null;if(stack.length&&(g.inner||quantified))stack[stack.length-1].inner=true;}
  else if('*+{|'.includes(ch)||ch==='?'&&src[i-1]!=='('){if(stack.length)stack[stack.length-1].inner=true;}}
 if(stack.length||cls)return null;
 try{return new RegExp(src,flags);}catch{return null;}}

/* ---- validation ------------------------------------------------------------------------------------------------- */
const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const TRANSFORMS={
 xor:t=>typeof t.key==='string'&&HEX.test(t.key)&&t.key.length<=512&&(t.start===undefined||int(t.start,0,1<<30))&&(t.phase===undefined||['entry','file'].includes(t.phase)),
 blowfish:t=>(typeof t.key==='string'&&HEX.test(t.key)&&t.key.length>=8&&t.key.length<=112&&t.state===undefined||t.key===undefined&&typeof t.state==='string'&&/^[A-Za-z0-9+/]+=*$/.test(t.state)&&Buffer.from(t.state,'base64').length===4168)&&(t.words===undefined||['le','be'].includes(t.words)),
 tea:t=>typeof t.key==='string'&&/^[0-9a-f]{32}$/i.test(t.key)&&(t.rounds===undefined||[16,32,64].includes(t.rounds))&&(t.words===undefined||['le','be'].includes(t.words)),
 xtea:t=>TRANSFORMS.tea(t),
 camellia:t=>typeof t.key==='string'&&/^[0-9a-f]{32}$/i.test(t.key),
 'xor-index':t=>int(t.base,0,255)&&int(t.step,0,255)&&(t.mult===undefined||int(t.mult,0,255)),
 add:t=>int(t.value,0,255),sub:t=>int(t.value,0,255),not:()=>true,rol:t=>int(t.bits,1,7),ror:t=>int(t.bits,1,7),
 zlib:()=>true,'deflate-raw':()=>true,lzss:t=>t.window===undefined||[4096].includes(t.window),
 skip:t=>int(t.bytes,0,1<<20),take:t=>int(t.bytes,1,LIMITS.fileBytes)};
const FIELD_TYPES=['u8','u16le','u16be','u32le','u32be','cstr','pstr8','pstr16','skip'];
function validTable(t){if(!isObj(t))return false;
 if(t.count&&!(isObj(t.count)&&int(t.count.at,0,1<<30)&&['u8','u16le','u32le','u32be'].includes(t.count.type)))return false;
 if(t.indexTransforms!==undefined&&!(Array.isArray(t.indexTransforms)&&t.indexTransforms.length<=8&&t.indexTransforms.every(validTransform)))return false;
 if(!(int(t.entriesAt,0,1<<30)&&Array.isArray(t.fields)&&t.fields.length>=3&&t.fields.length<=16))return false;
 const names=new Set();for(const f of t.fields){if(!isObj(f)||!FIELD_TYPES.includes(f.type))return false;if(['cstr','skip'].includes(f.type)&&!int(f.size,1,1024))return false;if(f.name!==undefined){if(!['name','offset','size','packed','flags'].includes(f.name)||names.has(f.name))return false;names.add(f.name);}}
 if(!names.has('name')||!names.has('offset')||!names.has('size'))return false;
 if(t.offsetBase!==undefined&&!['file','after-index'].includes(t.offsetBase))return false;
 if(t.nameEncoding!==undefined&&!ENCODINGS.includes(t.nameEncoding))return false;
 return true;}
function validTransform(t){return isObj(t)&&Object.hasOwn(TRANSFORMS,t.op)&&TRANSFORMS[t.op](t);}
const glob=g=>typeof g==='string'&&g.length>0&&g.length<=120&&!/(^|[\\/])\.\.([\\/]|$)|^[\\/]|:/.test(g);
function validMatch(m){if(!isObj(m))return false;const files=m.files||[];
 if(!Array.isArray(files)||files.length>16||!files.every(f=>isObj(f)&&glob(f.path)&&(f.minSize===undefined||int(f.minSize,0,2**40))&&(f.magic===undefined||isObj(f.magic)&&int(f.magic.offset||0,0,1<<20)&&HEX.test(String(f.magic.hex||''))&&f.magic.hex.length<=64)))return false;
 if(m.exe!==undefined&&!(isObj(m.exe)&&(m.exe.name===undefined||typeof m.exe.name==='string'&&/^[^\\/:]{1,120}\.exe$/i.test(m.exe.name))&&(m.exe.size===undefined||int(m.exe.size,1,2**40))&&(m.exe.head===undefined||/^[a-f0-9]{64}$/.test(m.exe.head))))return false;
 return files.length>0||!!m.exe;}
/* an index the running game held (E596): three u32 words per entry (offset, size, unpacked), base64; select: the entries
   that are scripts (u32 numbers, base64); trim: cut each entry to its unpacked size after the transforms; size: the
   archive's exact size (an archive of any other size is not read) */
function validIndex(x){if(!isObj(x)||!int(x.size,1,2**40)||!int(x.count,1,65536)||x.words!==3||typeof x.entries!=='string'||x.entries.length>360000||!/^[A-Za-z0-9+/]*=*$/.test(x.entries))return false;
 if(Buffer.from(x.entries,'base64').length!==x.count*12)return false;
 if(x.select!==undefined&&!(typeof x.select==='string'&&/^[A-Za-z0-9+/]*=*$/.test(x.select)&&Buffer.from(x.select,'base64').length%4===0&&Buffer.from(x.select,'base64').length/4<=x.count))return false;
 return x.trim===undefined||x.trim==='unpacked';}
function validSource(s){if(!isObj(s)||!['loose','table','xp3','pfs','index'].includes(s.container))return false;
 const list=s.container==='loose'?s.files:s.archives;if(!Array.isArray(list)||!list.length||list.length>32||!list.every(glob))return false;
 if(s.entries!==undefined&&!(typeof s.entries==='string'&&s.entries.length<=120))return false;
 if(s.container==='table'&&!validTable(s.table))return false;
 if(s.container==='index'&&!validIndex(s.index))return false;
 if(s.maxFiles!==undefined&&!int(s.maxFiles,1,LIMITS.files))return false;return true;}
function validGrammar(g){if(!isObj(g)||!['lines','strings'].includes(g.mode))return false;if(g.flags!==undefined&&!(typeof g.flags==='string'&&/^[imsu]{0,4}$/.test(g.flags)))return false;
 if(g.encoding!==undefined&&!ENCODINGS.includes(g.encoding)&&g.encoding!=='auto')return false;
 const re=v=>v===undefined||!!safeRegex(v,g.flags||'');
 if(g.mode==='lines'){if(!re(g.text)||!re(g.skip)||!re(g.anchor)||!re(g.name)||!re(g.join))return false;if(g.strip!==undefined&&!(Array.isArray(g.strip)&&g.strip.length<=LIMITS.strip&&g.strip.every(r=>!!safeRegex(r,'g'))))return false;}
 else{if(!(typeof g.opcode==='string'&&HEX.test(g.opcode)&&g.opcode.length<=16))return false;if(!['u8','u16le','u32le','zero'].includes(g.length))return false;}
 if(g.minChars!==undefined&&!int(g.minChars,1,64))return false;return true;}
function validPairing(p){return p===undefined||isObj(p)&&(p.by===undefined||['order','text'].includes(p.by))&&(p.dropNames===undefined||typeof p.dropNames==='boolean')&&(p.minChars===undefined||int(p.minChars,1,64));}
const PARAM_TARGETS=['cx-scheme','paz-scheme','malie-scheme','qlie-key','entis-key','marble-key','warc-scheme'];
function validParams(list){return list===undefined||Array.isArray(list)&&list.length<=16&&list.every(p=>isObj(p)&&PARAM_TARGETS.includes(p.target)&&isObj(p.value)&&JSON.stringify(p.value).length<=64*1024);}
/* what a pack needs, computed from its content (its `requires` must list at least these) */
function needs(p){const out=new Set();if(p.match?.exe)out.add('match:exe');if(p.match?.files?.length)out.add('match:files');
 if(p.source)out.add('container:'+p.source.container);for(const t of [...(p.transforms||[]),...(p.source?.table?.indexTransforms||[])]){out.add('transform:'+t.op);if(t.op==='xor'&&t.phase==='file')out.add('transform:xor-file');}
 if(p.grammar)out.add('grammar:'+p.grammar.mode);for(const x of p.params||[])out.add('params:'+x.target);return [...out].sort();}
const TOP=new Set(['schema','format','id','version','minApp','maxApp','requires','title','engine','note','match','source','transforms','grammar','pairing','params','signature','createdAt']);
/* validate(pack) → {ok:true,pack} | {ok:false,error}. Unknown top-level fields are refused unless they start with "x-". */
function validate(pack){
 if(!isObj(pack)||pack.schema!==SCHEMA)return {ok:false,error:'SCHEMA'};
 if(!int(pack.format,1,1000))return {ok:false,error:'FORMAT'};
 if(!FORMATS.includes(pack.format))return {ok:false,error:pack.format>FORMAT?'FORMAT_NEWER':'FORMAT_UNKNOWN'};
 for(const k of Object.keys(pack))if(!TOP.has(k)&&!k.startsWith('x-'))return {ok:false,error:'UNKNOWN_FIELD'};
 if(!ID.test(String(pack.id||'')))return {ok:false,error:'ID'};
 if(!int(pack.version,1,1e9))return {ok:false,error:'VERSION'};
 if(!SEMVER.test(String(pack.minApp||'')))return {ok:false,error:'MIN_APP'};
 if(pack.maxApp!==undefined&&!SEMVER.test(String(pack.maxApp)))return {ok:false,error:'MAX_APP'};
 if(!Array.isArray(pack.requires)||!pack.requires.every(r=>typeof r==='string'&&r.length<=60))return {ok:false,error:'REQUIRES'};
 if(!validMatch(pack.match))return {ok:false,error:'MATCH'};
 const reads=!!(pack.source||pack.grammar);
 if(reads&&!(validSource(pack.source)&&validGrammar(pack.grammar)))return {ok:false,error:!validSource(pack.source)?'SOURCE':'GRAMMAR'};
 if(pack.transforms!==undefined&&!(Array.isArray(pack.transforms)&&pack.transforms.length<=8&&pack.transforms.every(validTransform)))return {ok:false,error:'TRANSFORMS'};
 if(!validPairing(pack.pairing))return {ok:false,error:'PAIRING'};
 if(!validParams(pack.params))return {ok:false,error:'PARAMS'};
 if(!reads&&!pack.params?.length)return {ok:false,error:'EMPTY'};
 for(const k of ['title','engine','note'])if(pack[k]!==undefined&&!(typeof pack[k]==='string'&&pack[k].length<=200))return {ok:false,error:'TEXT_FIELD'};
 const missing=needs(pack).filter(n=>!pack.requires.includes(n));if(missing.length)return {ok:false,error:'REQUIRES_INCOMPLETE'};
 if(Buffer.byteLength(canonical(pack))>LIMITS.packBytes)return {ok:false,error:'TOO_LARGE'};
 return {ok:true,pack};}
/* Older formats are lifted to the current one here, one step at a time. Format 1 is the first, so there is nothing to
   migrate yet; a format-2 app adds MIGRATIONS[1]=pack=>({...pack,format:2,...}) and keeps format-1 packs working. */
const MIGRATIONS={};
function migrate(pack){let p=pack;for(let guard=0;p&&p.format<FORMAT&&guard<16;guard++){const step=MIGRATIONS[p.format];if(!step)return null;p=step(p);}return p;}
/* compatible(pack,{app}) → {ok} | {ok:false,reason}: skipped, never an error */
function compatible(pack,{app='',capabilities=CAPABILITIES}={}){
 if(!isObj(pack))return {ok:false,reason:'INVALID'};
 if(int(pack.format,1,1000)&&pack.format>FORMAT)return {ok:false,reason:'FORMAT_NEWER'};
 const missing=(Array.isArray(pack.requires)?pack.requires:[]).filter(r=>!capabilities.includes(r));if(missing.length)return {ok:false,reason:'CAPABILITY',missing};
 if(app&&SEMVER.test(app)){if(SEMVER.test(String(pack.minApp||''))&&semverCompare(app,pack.minApp)<0)return {ok:false,reason:'APP_TOO_OLD'};if(pack.maxApp&&SEMVER.test(pack.maxApp)&&semverCompare(app,pack.maxApp)>0)return {ok:false,reason:'APP_TOO_NEW'};}
 return {ok:true};}
/* the whole gate: compatible, migrated, valid, signed */
function admit(raw,{app='',keyList=keys()}={}){
 let pack=raw;if(typeof raw==='string'||Buffer.isBuffer(raw)){if(Buffer.byteLength(raw)>LIMITS.packBytes*2)return {ok:false,reason:'TOO_LARGE'};try{pack=JSON.parse(String(raw));}catch{return {ok:false,reason:'JSON'};}}
 const c=compatible(pack,{app});if(!c.ok)return c;
 const sig=verifySignature(pack,keyList);if(!sig.ok)return {ok:false,reason:sig.error};
 const migrated=migrate(pack);if(!migrated)return {ok:false,reason:'MIGRATION'};
 const v=validate(migrated);if(!v.ok)return {ok:false,reason:v.error};
 return {ok:true,pack:migrated,sha256:digest(pack),keyId:sig.keyId};}

/* ---- store ------------------------------------------------------------------------------------------------------ */
const ROOT=()=>process.env.MEGULIT_ROOT||process.env.TOME_FINAL_ROOT||path.join(__dirname,'..');
const storeDir=(root=ROOT())=>process.env.MEGULIT_ADAPTER_PACKS_DIR||path.join(root,'data','adapter-packs');
function readJSON(file){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:null;}catch{return null;}}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,typeof value==='string'?value:JSON.stringify(value,null,1));fs.renameSync(tmp,file);}
/* state.json: {version:1, active:{id:version}, blocked:{"id@v":{reason,at}}, dirs:{dirKey:{off:["id@v"]}}, errors:{"id@v":n}} */
function readState(root){const v=readJSON(path.join(storeDir(root),'state.json'))||{};return {version:1,active:isObj(v.active)?v.active:{},blocked:isObj(v.blocked)?v.blocked:{},dirs:isObj(v.dirs)?v.dirs:{},errors:isObj(v.errors)?v.errors:{},sync:isObj(v.sync)?v.sync:{}};}
function writeState(root,s){atomic(path.join(storeDir(root),'state.json'),s);generation++;}
let generation=0;
const packFile=(root,id,version)=>path.join(storeDir(root),'packs',id,version+'.json');
function installedVersions(root,id){try{return fs.readdirSync(path.join(storeDir(root),'packs',id)).map(f=>/^(\d+)\.json$/.exec(f)?.[1]).filter(Boolean).map(Number).sort((a,b)=>a-b);}catch{return [];}}
/* install(raw) after admit(): keeps the signed body as received; activates it unless that version is blocked or older */
function install(root,raw,{app=appVersion(root),keyList}={}){
 const a=admit(raw,{app,keyList});if(!a.ok)return a;const p=a.pack,tag=p.id+'@'+p.version,s=readState(root);
 if(s.blocked[tag])return {ok:false,reason:'BLOCKED'};
 atomic(packFile(root,p.id,p.version),typeof raw==='string'?raw:JSON.stringify(raw));
 if(!s.active[p.id]||s.active[p.id]<p.version)s.active[p.id]=p.version;writeState(root,s);return {ok:true,id:p.id,version:p.version,sha256:a.sha256};}
/* the packs in use: the active version of each id, admitted again on load (a file changed on disk is dropped) */
let cache={key:'',packs:[]};
function active(root=ROOT(),{app}={}){
 const dir=storeDir(root);let key='';try{const st=fs.statSync(path.join(dir,'state.json'));key=dir+'|'+st.mtimeMs+'|'+st.size+'|'+generation;}catch{return [];}
 if(cache.key===key)return cache.packs;
 const s=readState(root),list=[],ver=app??appVersion(root);
 for(const [id,version] of Object.entries(s.active)){if(!ID.test(id)||!int(version,1,1e9)||s.blocked[id+'@'+version])continue;let raw;try{raw=fs.readFileSync(packFile(root,id,version),'utf8');}catch{continue;}
  const a=admit(raw,{app:ver});if(!a.ok)continue;list.push({...a.pack,_file:packFile(root,id,version),_tag:id+'@'+version});
  /* the older versions still installed: a game that turned the active one off falls back to them (adapter-feed.cjs) */
  const older=[];for(const v of installedVersions(root,id).filter(x=>x<version&&!s.blocked[id+'@'+x]).reverse().slice(0,4)){try{const b=admit(fs.readFileSync(packFile(root,id,v),'utf8'),{app:ver});if(b.ok)older.push({...b.pack,_file:packFile(root,id,v),_tag:id+'@'+v});}catch{}}
  list[list.length-1]._older=older;}
 cache={key,packs:list};return list;}
/* Takes a pack version out of use everywhere and goes back to the newest older version still installed (or none). */
function rollback(root,id,{reason='manual'}={}){const s=readState(root),v=s.active[id];if(!v)return {ok:false,reason:'NOT_ACTIVE'};
 s.blocked[id+'@'+v]={reason:String(reason).slice(0,60),at:Date.now()};const older=installedVersions(root,id).filter(x=>x<v&&!s.blocked[id+'@'+x]).pop();
 if(older)s.active[id]=older;else delete s.active[id];writeState(root,s);return {ok:true,id,from:v,to:older||null};}
/* Turns a pack version off for one game folder only (it made that game worse); other games keep it. */
const dirKey=dir=>crypto.createHash('sha256').update(path.resolve(String(dir)).toLowerCase()).digest('hex').slice(0,24);
function disableFor(root,dir,tag){const s=readState(root),k=dirKey(dir),d=s.dirs[k]||{off:[]};if(!d.off.includes(tag))d.off.push(tag);s.dirs[k]=d;writeState(root,s);}
function enableFor(root,dir,tag){const s=readState(root),k=dirKey(dir),d=s.dirs[k];if(!d)return;d.off=d.off.filter(t=>t!==tag);writeState(root,s);}
function noteSync(root,info){const s=readState(root);s.sync=info;writeState(root,s);}
/* a pack that keeps failing at run time is taken out after 3 errors */
function noteError(root,tag){try{const s=readState(root);s.errors[tag]=(s.errors[tag]||0)+1;if(s.errors[tag]>=3){const [id,v]=tag.split('@');if(s.active[id]===Number(v)){writeState(root,s);rollback(root,id,{reason:'errors'});return;}}writeState(root,s);}catch{}}
function appVersion(root){try{return require('./shared-adaptation.cjs').appVersion(root)||'';}catch{return '';}}

/* ---- matching --------------------------------------------------------------------------------------------------- */
function globRe(g){return new RegExp('^'+g.replace(/\\/g,'/').split('/').map(part=>part.replace(/[.+^${}()|[\]]/g,'\\$&').replace(/\*/g,'[^/]*').replace(/\?/g,'[^/]')).join('/')+'$','i');}
/* files under dir matching a glob (a "/" in it walks down; at most 2 levels and LIMITS.files names) */
function expand(dir,g,limit=LIMITS.files){const parts=g.replace(/\\/g,'/').split('/'),out=[];
 const walk=(base,i)=>{if(out.length>=limit)return;const last=i===parts.length-1,re=globRe(parts[i]);let list;try{list=fs.readdirSync(base,{withFileTypes:true});}catch{return;}
  for(const e of list){if(out.length>=limit)return;if(!re.test(e.name))continue;const full=path.join(base,e.name);if(last){if(e.isFile())out.push(full);}else if(e.isDirectory())walk(full,i+1);}};
 if(parts.length>3)return out;walk(dir,0);return out.sort();}
const headMemo=new Map();
function exeHead(file){const st=fs.statSync(file);const k=file+'|'+st.size+'|'+st.mtimeMs;if(headMemo.has(k))return headMemo.get(k);const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(Math.min(1<<20,st.size));fs.readSync(fd,b,0,b.length,0);const h=crypto.createHash('sha256').update(b).digest('hex');headMemo.set(k,h);return h;}finally{fs.closeSync(fd);}}
/* E573 packs and built-in readers share one runtime for file reads and LZSS (original-engines/kit.cjs) */
const kit=require('./original-engines/kit.cjs'),readAt=kit.readAt;
/* match(pack,dir) → specificity score (0 = no match): exe head 100, exe size 40, exe name 10, each file 5, magic 10 */
function match(pack,dir){try{const m=pack.match;let score=0;
 if(m.exe){const exes=m.exe.name?[path.join(dir,m.exe.name)].filter(f=>fs.existsSync(f)):fs.readdirSync(dir).filter(f=>/\.exe$/i.test(f)).map(f=>path.join(dir,f));
  const hit=exes.find(f=>{const st=fs.statSync(f);if(m.exe.size&&st.size!==m.exe.size)return false;if(m.exe.head&&exeHead(f)!==m.exe.head)return false;return true;});if(!hit)return 0;score+=(m.exe.head?100:0)+(m.exe.size?40:0)+(m.exe.name?10:0);}
 for(const f of m.files||[]){const found=expand(dir,f.path,64);const ok=found.find(file=>{const st=fs.statSync(file);if(f.minSize&&st.size<f.minSize)return false;if(f.magic){const want=Buffer.from(f.magic.hex,'hex');if(!readAt(file,f.magic.offset||0,want.length).equals(want))return false;}return true;});if(!ok)return 0;score+=5+(f.magic?10:0);}
 return score;}catch{return 0;}}
/* the pack that reads this folder: the most specific active match not turned off for it */
function forDir(dir,root=ROOT()){const list=active(root).filter(p=>p.source&&p.grammar);if(!list.length)return null;const off=new Set(readState(root).dirs[dirKey(dir)]?.off||[]);
 let best=null,score=0;for(const top of list){/* the newest version of each pack this folder has not turned off */const p=[top,...(top._older||[])].find(x=>!off.has(x._tag));if(!p)continue;const s=match(p,dir);if(s>score||s===score&&s&&best&&p.version>best.version){best=p;score=s;}}return best;}
/* params(target) → [{value, pack}] from active packs: extra cx / paz schemes for the readers that already exist */
const paramMemo=new Map(),NONE=Object.freeze([]);
function params(target,root=ROOT()){try{const list=active(root);if(!list.length)return NONE;const k=cache.key+'|'+target;if(paramMemo.has(k))return paramMemo.get(k);
 const out=list.flatMap(p=>(p.params||[]).filter(x=>x.target===target).map(x=>({value:x.value,pack:p._tag})));paramMemo.clear();paramMemo.set(k,out.length?out:NONE);return paramMemo.get(k);}catch{return NONE;}}
/* the same array while nothing changed: callers memoise on its identity */

/* ---- runtime: transforms ---------------------------------------------------------------------------------------- */
const lzss=(src,cap=LIMITS.inflated)=>kit.lzss(src,undefined,{cap});
/* ctx.offset: where the entry starts in its archive (an xor key with phase "file" lines up with that) */
function transform(buf,list,ctx={}){let b=Buffer.from(buf);
 for(const t of list||[]){switch(t.op){
  case 'xor':{const k=Buffer.from(t.key,'hex'),s=(t.start||0)+(t.phase==='file'?(ctx.offset||0)%k.length:0);for(let i=0;i<b.length;i++)b[i]^=k[(i+s)%k.length];break;}
  case 'blowfish':{const S=require('./runtime-harvest-scan.cjs');b=S.blowfishStateDecrypt(b,t.state?Buffer.from(t.state,'base64'):S.blowfishState(Buffer.from(t.key,'hex')),{words:t.words||'le'});break;}
  case 'tea':case 'xtea':b=require('./runtime-harvest-scan.cjs').teaDecrypt(b,{key:t.key,variant:t.op,rounds:t.rounds||32,words:t.words||'le'});break;
  case 'camellia':{const n=b.length&~15,dc=crypto.createDecipheriv('camellia-128-ecb',Buffer.from(t.key,'hex'),null);dc.setAutoPadding(false);b=Buffer.concat([dc.update(b.subarray(0,n)),dc.final(),b.subarray(n)]);break;}
  case 'xor-index':{const m=t.mult??1;for(let i=0;i<b.length;i++)b[i]^=(t.base+Math.imul(i,t.step)*m)&255;break;}
  case 'add':for(let i=0;i<b.length;i++)b[i]=(b[i]+t.value)&255;break;
  case 'sub':for(let i=0;i<b.length;i++)b[i]=(b[i]-t.value)&255;break;
  case 'not':for(let i=0;i<b.length;i++)b[i]=~b[i]&255;break;
  case 'rol':for(let i=0;i<b.length;i++)b[i]=((b[i]<<t.bits)|(b[i]>>(8-t.bits)))&255;break;
  case 'ror':for(let i=0;i<b.length;i++)b[i]=((b[i]>>t.bits)|(b[i]<<(8-t.bits)))&255;break;
  case 'zlib':b=zlib.inflateSync(b,{maxOutputLength:LIMITS.inflated});break;
  case 'deflate-raw':b=zlib.inflateRawSync(b,{maxOutputLength:LIMITS.inflated});break;
  case 'lzss':b=lzss(b);break;
  case 'skip':b=b.subarray(Math.min(t.bytes,b.length));break;
  case 'take':b=b.subarray(0,t.bytes);break;
  default:throw Error('PACK_TRANSFORM');}}
 return b;}

/* ---- runtime: containers ---------------------------------------------------------------------------------------- */
function decodeName(bytes,enc){try{return new TextDecoder(enc||'shift_jis').decode(bytes).replace(/\0.*$/s,'');}catch{return '';}}
/* a declared index table: count, then fixed or length-prefixed fields per entry */
function tableList(file,t){const size=fs.statSync(file).size;const head=readAt(file,0,Math.min(size,64<<20));let idx=head;
 if(t.indexTransforms?.length){const from=t.count?t.count.at:t.entriesAt;idx=Buffer.concat([head.subarray(0,from),transform(head.subarray(from),t.indexTransforms)]);}
 const rd=(type,at)=>type==='u8'?idx.readUInt8(at):type==='u16le'?idx.readUInt16LE(at):type==='u16be'?idx.readUInt16BE(at):type==='u32le'?idx.readUInt32LE(at):idx.readUInt32BE(at);
 const count=t.count?rd(t.count.type,t.count.at):Infinity,files=[];let p=t.entriesAt;
 for(let n=0;n<count&&n<LIMITS.entries&&p<idx.length;n++){const e={};try{
  for(const f of t.fields){if(f.type==='skip'){p+=f.size;continue;}
   if(f.type==='cstr'){const raw=idx.subarray(p,p+f.size);p+=f.size;if(f.name)e[f.name]=decodeName(raw,t.nameEncoding);continue;}
   if(f.type==='pstr8'||f.type==='pstr16'){const len=f.type==='pstr8'?idx.readUInt8(p):idx.readUInt16LE(p);p+=f.type==='pstr8'?1:2;const raw=idx.subarray(p,p+len);p+=len;if(f.name)e[f.name]=decodeName(raw,t.nameEncoding);continue;}
   const v=rd(f.type,p);p+=f.type==='u8'?1:f.type.startsWith('u16')?2:4;if(f.name)e[f.name]=v;}
  }catch{break;}/* a table that runs past the file ends there */
  if(t.count===undefined&&!e.name)break;
  files.push(e);}
 const base=t.offsetBase==='after-index'?p:0;
 return files.filter(e=>e.name&&Number.isSafeInteger(e.offset)&&Number.isSafeInteger(e.size)&&e.size>=0&&e.size<=LIMITS.fileBytes&&base+e.offset+e.size<=size).map(e=>({name:e.name,offset:base+e.offset,size:e.size}));}
/* scenes of a pack in dir: [{name,read()}] in a stable order */
function scenesOf(pack,dir){const s=pack.source,entryRe=s.entries?globRe(path.posix.basename(s.entries)):null,limit=Math.min(s.maxFiles||LIMITS.files,LIMITS.scenes),out=[];let total=0;
 const guard=b=>{total+=b.length;if(b.length>LIMITS.fileBytes||total>LIMITS.totalBytes)throw Error('PACK_LIMIT');return b;};
 const nameOk=n=>!entryRe||entryRe.test(path.basename(String(n).replace(/\\/g,'/')));
 if(s.container==='loose'){for(const g of s.files)for(const f of expand(dir,g,limit)){if(out.length>=limit)break;const rel=path.relative(dir,f).replace(/\\/g,'/');out.push({name:rel,read:()=>guard(transform(fs.readFileSync(f),pack.transforms))});}}
 else if(s.container==='index'){const x=s.index,e=Buffer.from(x.entries,'base64'),sel=x.select?Buffer.from(x.select,'base64'):null;
  for(const g of s.archives)for(const file of expand(dir,g,32)){let size=0;try{size=fs.statSync(file).size;}catch{}if(size!==x.size)continue;
   const list=sel?Array.from({length:sel.length/4},(_,i)=>sel.readUInt32LE(i*4)).filter(i=>i<x.count):Array.from({length:x.count},(_,i)=>i);
   for(const i of list){if(out.length>=limit)break;const offset=e.readUInt32LE(i*12),length=e.readUInt32LE(i*12+4),unpacked=e.readUInt32LE(i*12+8);if(!length||offset+length>size||length>LIMITS.fileBytes)continue;
    out.push({name:'#'+String(i).padStart(5,'0'),read:()=>{let b=transform(readAt(file,offset,length),pack.transforms,{offset});if(x.trim==='unpacked'&&unpacked&&unpacked<=b.length)b=b.subarray(0,unpacked);return guard(b);}});}}}
 else for(const g of s.archives)for(const file of expand(dir,g,32)){
  if(s.container==='table'){for(const e of tableList(file,s.table)){if(out.length>=limit)break;if(!nameOk(e.name))continue;out.push({name:e.name,read:()=>guard(transform(readAt(file,e.offset,e.size),pack.transforms,{offset:e.offset}))});}}
  else if(s.container==='xp3'){const t=require('./original-engines/xp3.cjs').list(file);for(const e of t?.files||[]){if(out.length>=limit)break;if(!nameOk(e.name))continue;out.push({name:e.name,read:()=>guard(transform(require('./original-engines/xp3.cjs').read(file,e),pack.transforms))});}}
  else if(s.container==='pfs'){const sc=require('./original-engines/scenes.cjs'),t=sc.pfsList(file);for(const e of t?.files||[]){if(out.length>=limit)break;if(!nameOk(e.name))continue;out.push({name:e.name,read:()=>guard(transform(sc.pfsRead(file,e,t.key),pack.transforms))});}}}
 return out;}

/* ---- runtime: grammar ------------------------------------------------------------------------------------------- */
function decodeWith(buf,enc){if(buf[0]===0xff&&buf[1]===0xfe)return buf.toString('utf16le',2);if(buf[0]===0xef&&buf[1]===0xbb&&buf[2]===0xbf)return buf.toString('utf8',3);
 if(!enc||enc==='auto'){try{return new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch{}enc='shift_jis';}
 return enc==='utf-16le'?buf.toString('utf16le'):new TextDecoder(enc).decode(buf);}
const compiled=new WeakMap();
function grammarOf(pack){if(compiled.has(pack))return compiled.get(pack);const g=pack.grammar,f=g.flags||'';
 const c={...g,text:g.text?safeRegex(g.text,f):null,skip:g.skip?safeRegex(g.skip,f):null,anchor:g.anchor?safeRegex(g.anchor,f):null,name:g.name?safeRegex(g.name,f):null,join:g.join?safeRegex(g.join,f):null,strip:(g.strip||[]).map(r=>safeRegex(r,'g'+f)),opcode:g.opcode?Buffer.from(g.opcode,'hex'):null,minChars:pack.pairing?.minChars||g.minChars||1,dropNames:!!pack.pairing?.dropNames};
 compiled.set(pack,c);return c;}
const chars=t=>[...t].length;
function parseLines(text,g){const lines=[],anchors=[];let pending='';
 for(const raw of text.split(/\r?\n/)){let t=raw.length>LIMITS.lineChars?raw.slice(0,LIMITS.lineChars):raw;t=t.trim();if(!t)continue;
  if(g.skip&&g.skip.test(t)){if(g.anchor?g.anchor.test(t):/^[\x20-\x7e]*$/.test(t))anchors.push(t);continue;}
  if(g.anchor&&g.anchor.test(t)){anchors.push(t);continue;}
  let s=t;for(const r of g.strip){r.lastIndex=0;s=s.replace(r,'');}
  if(g.text){const m=g.text.exec(s);if(!m)continue;s=(m[1]??m[0]);}s=s.trim();
  if(!s)continue;
  if(g.dropNames&&g.name&&g.name.test(s))continue;
  if(g.join&&g.join.test(t)){pending+=s;continue;}
  s=pending+s;pending='';if(chars(s)>=g.minChars)lines.push(s);}
 if(pending&&chars(pending)>=g.minChars)lines.push(pending);
 return {lines,anchors};}
function parseStrings(buf,g){const lines=[],anchors=[];const op=g.opcode,enc=g.encoding&&g.encoding!=='auto'?g.encoding:'shift_jis';let at=buf.indexOf(op);
 while(at>=0&&lines.length<LIMITS.entries){let p=at+op.length,len=0,end=0;
  if(g.length==='u8'){len=buf[p];p+=1;}else if(g.length==='u16le'){if(p+2>buf.length)break;len=buf.readUInt16LE(p);p+=2;}else if(g.length==='u32le'){if(p+4>buf.length)break;len=buf.readUInt32LE(p);p+=4;}else{end=buf.indexOf(0,p);if(end<0)break;len=end-p;}
  if(len>0&&len<=LIMITS.lineChars*4&&p+len<=buf.length){let s=decodeWith(buf.subarray(p,p+len),enc).replace(/\0+$/,'');for(const r of g.strip){r.lastIndex=0;s=s.replace(r,'');}s=s.trim();
   if(s&&/[^\x00-\x7f]/.test(s)&&chars(s)>=g.minChars&&!(g.dropNames&&g.name&&g.name.test(s)))lines.push(s);at=buf.indexOf(op,p+len);}
  else at=buf.indexOf(op,at+1);}
 return {lines,anchors};}
function parse(pack,buf){const g=grammarOf(pack);if(g.mode==='strings')return parseStrings(buf,g);return parseLines(decodeWith(buf,g.encoding),g);}

/* ---- the scene engine (services/original-engines/scenes.cjs ENGINES['adapter-pack']) ----------------------------
   scenes(dir) picks the pack for the folder; parse(buf) uses the pack that scenes() or sources() picked last (every
   caller in scenes.cjs asks for the scenes of a folder and parses them right after, synchronously). Nothing throws. */
let current=null;
const engine={id:'adapter-pack',hint:'适配包',
 scenes(dir){current=null;let p=null;try{p=forDir(dir);}catch{}if(!p)return [];current=p;try{return scenesOf(p,dir).map(s=>({name:s.name,read:()=>{try{return s.read();}catch(e){noteError(ROOT(),p._tag);throw e;}}}));}catch{noteError(ROOT(),p._tag);return [];}},
 parse(buf){const p=current;if(!p)return {lines:[],anchors:[]};try{return parse(p,Buffer.from(buf));}catch{return {lines:[],anchors:[]};}},
 /* the pack file is one of the sources: a new pack version changes the fingerprint, so the index is read again */
 sources(dir){let p=null;try{p=forDir(dir);}catch{}if(!p)return [];current=p;let list=[];try{list=p.source.container==='loose'?p.source.files.flatMap(g=>expand(dir,g,2000)):p.source.archives.flatMap(g=>expand(dir,g,32));}catch{}return [p._file,...list];},
 pack(dir){try{return forDir(dir);}catch{return null;}}};

module.exports={SCHEMA,FORMAT,FORMATS,CAPABILITIES,LIMITS,MIGRATIONS,semverCompare,canonical,digest,verifySignature,sign,_trust,keys,safeRegex,validate,needs,migrate,compatible,admit,
 storeDir,readState,noteSync,install,installedVersions,active,rollback,disableFor,enableFor,dirKey,noteError,match,forDir,params,transform,lzss,tableList,scenesOf,parse,engine,appVersion,expand};
