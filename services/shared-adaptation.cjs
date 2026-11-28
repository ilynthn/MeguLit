// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E370 shared adaptation records. One person's working setup for a game (the hook stream that embedded, the embed result,
   the calibrated box / scan area / game colours, the zero-latency adapter, the locale mode) is kept as a small anonymous
   record keyed by a game fingerprint, so another PC with the same game starts from it.

   Record (version 1), everything else is dropped by clean():
   {schema:'megulit.adaptation',version:1,key:'<64 hex>',
    fingerprint:{exe:'game.exe',size:123,head:'<sha256 of the first MiB, 64 hex>',engine:'kirikiri'},
    hook:{stream:{name,code,addr,ctx,ctx2}|null,embed:'verified'|'readonly'|'',profile:'embed'|'read'|'euphoria474'|'off'|''},
    flowPage:false,
    layout:{box:{x,y,width,height}|null,scan:{x,y,width,height}|null,colors:{textColor:'#rrggbb',...}|null},
    zeroLatency:{adapter:'bgi',patchKind:'patch'|'original'|'native'|''}|null,
    localeMode:'japanese'|'off'|'',appVersion:'1.2.8d',updatedAt:'YYYY-MM-DD'}
   No paths, user names, save data or game text: the exe is a bare file name, strings are checked against path and user
   name patterns, and a field that fails is left empty (a fingerprint that fails drops the whole record).

   Local store data/config/shared-adaptation.json: {version:1,records:{key:record+origin},applied:{key:{at,parts}},notice:{key:1}} */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const SCHEMA='megulit.adaptation',VERSION=1,HEAD=1024*1024;
const HEX64=/^[a-f0-9]{64}$/,COLOR=/^#[0-9a-f]{3,8}$/i;
const COLOR_KEYS=['textColor','readTextColor','textGradientTop','textGradientBottom','readTextGradientTop','readTextGradientBottom','japaneseOutlineColor','chineseOutlineColor','rubyOutlineColor'];
const GRADIENT_KEYS=['textGradient','readTextGradient'];
const BOX={x:'x',y:'y',width:'width',height:'height'},SCAN={x:'scanX',y:'scanY',width:'scanWidth',height:'scanHeight'};
const PROFILES=['embed','read','euphoria474','off'];

const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const storeFile=root=>path.join(root,'data','config','shared-adaptation.json');
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,1));fs.renameSync(tmp,file);}
function readJSON(file){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:{};}catch{return {};}}

/* ---- privacy -------------------------------------------------------------------------------------------------- */
function userNames(){const out=new Set();for(const v of [os.userInfo?.().username,process.env.USERNAME,process.env.USER,path.basename(os.homedir()||'')])if(typeof v==='string'&&v.trim().length>=3)out.add(v.trim().toLowerCase());return [...out];}
/* A string that could carry a path or the user's name is not shared. */
function safe(value,max=200,names=userNames()){
 if(typeof value!=='string')return '';const v=value.trim();if(!v||v.length>max)return '';
 if(/[\\/]|^[a-z]:|%[a-z]+%|[\u0000-\u001f]/i.test(v))return '';
 const low=v.toLowerCase();if(names.some(n=>low.includes(n)))return '';return v;
}
const pct=v=>Number.isFinite(v)&&v>=0&&v<=100?Math.round(v*100)/100:null;
function area(source,keys){if(!source)return null;const out={};for(const[k,from]of Object.entries(keys)){const v=pct(Number(source[from]));if(v===null)return null;out[k]=v;}return out;}
function areaClean(v){if(!v||typeof v!=='object')return null;return area(v,BOX);}

/* ---- fingerprint ---------------------------------------------------------------------------------------------- */
/* exe file name (lower case) + size + sha256 of its first MiB + engine id. The key hashes all four. */
function fingerprint(executable,engine=''){
 const stat=fs.statSync(executable);if(!stat.isFile())throw Error('NOT_A_FILE');
 const fd=fs.openSync(executable,'r');let head;try{const buf=Buffer.alloc(Math.min(HEAD,stat.size));const n=fs.readSync(fd,buf,0,buf.length,0);head=sha(buf.subarray(0,n));}finally{fs.closeSync(fd);}
 return withKey({exe:path.win32.basename(String(executable)).toLowerCase(),size:stat.size,head,engine:String(engine||'').toLowerCase()});
}
function withKey(fp){const clean=cleanFingerprint(fp);if(!clean)return null;return {...clean,key:sha([clean.exe,clean.size,clean.head,clean.engine].join('|'))};}
function cleanFingerprint(fp,names){if(!fp||typeof fp!=='object')return null;const exe=safe(String(fp.exe||'').toLowerCase(),120,names);const engine=/^[a-z0-9._ -]{0,40}$/.test(String(fp.engine||''))?String(fp.engine||''):'';
 if(!exe||!/\.exe$/.test(exe)||!Number.isSafeInteger(fp.size)||fp.size<=0||!HEX64.test(String(fp.head||'')))return null;return {exe,size:fp.size,head:fp.head,engine};}

/* ---- record --------------------------------------------------------------------------------------------------- */
function cleanStream(s,names){if(!s||typeof s!=='object')return null;const code=safe(s.code,300,names);if(!code)return null;const hex=v=>/^[0-9a-f]{1,16}$/i.test(String(v??''))?String(v).toLowerCase():'0';
 return {name:safe(s.name,120,names),code,addr:hex(s.addr),ctx:hex(s.ctx),ctx2:hex(s.ctx2)};}
function cleanColors(c){if(!c||typeof c!=='object')return null;const out={};for(const k of COLOR_KEYS)if(typeof c[k]==='string'&&COLOR.test(c[k]))out[k]=c[k].toLowerCase();for(const k of GRADIENT_KEYS)if(typeof c[k]==='boolean')out[k]=c[k];return Object.keys(out).length?out:null;}
/* Whitelist copy of a record; null when it cannot be keyed. */
function clean(record,names=userNames()){
 if(!record||typeof record!=='object'||record.schema!==SCHEMA||record.version!==VERSION)return null;
 const fp=withKey(cleanFingerprint(record.fingerprint,names)||{});if(!fp||record.key&&record.key!==fp.key)return null;const {key,...fingerprint}=fp;
 const hook=record.hook||{},layout=record.layout||{},z=record.zeroLatency;
 return {schema:SCHEMA,version:VERSION,key,fingerprint,
  hook:{stream:cleanStream(hook.stream,names),embed:['verified','readonly'].includes(hook.embed)?hook.embed:'',profile:PROFILES.includes(hook.profile)?hook.profile:''},
  flowPage:record.flowPage===true,
  layout:{box:areaClean(layout.box),scan:areaClean(layout.scan),colors:cleanColors(layout.colors)},
  zeroLatency:z&&typeof z==='object'&&/^[a-z0-9_-]{1,30}$/i.test(String(z.adapter||''))?{adapter:String(z.adapter).toLowerCase(),patchKind:['patch','original','native'].includes(z.patchKind)?z.patchKind:''}:null,
  localeMode:['japanese','off'].includes(record.localeMode)?record.localeMode:'',
  appVersion:/^\d+\.\d+\.\d+[a-z]?$/.test(String(record.appVersion||''))?record.appVersion:'',
  updatedAt:/^\d{4}-\d{2}-\d{2}$/.test(String(record.updatedAt||''))?record.updatedAt:new Date().toISOString().slice(0,10)};
}
/* Builds a record from what this PC knows about the running game. `profile` is the game-style profile entry
   ({prefs,textSavedAt,positionSavedAt}), `stream` the HookBridge stream memory, `library` original.library. */
function build({fingerprint:fp,stream,embed,hookProfile,flowPage,profile,zeroLatency,localeMode,appVersion}){
 const prefs=profile?.prefs||{},calibratedText=!!profile?.textSavedAt,calibratedBox=!!profile?.positionSavedAt;
 const scanKeys=Object.values(SCAN).every(k=>k in prefs);
 return clean({schema:SCHEMA,version:VERSION,fingerprint:fp,hook:{stream,embed,profile:hookProfile||prefs.hookProfile},flowPage:flowPage===true,
  layout:{box:calibratedBox?area(prefs,BOX):null,scan:scanKeys?area(prefs,SCAN):null,colors:calibratedText&&prefs.colorSource!=='user'/* colours the user picked are a taste, not the game's */?Object.fromEntries([...COLOR_KEYS,...GRADIENT_KEYS].filter(k=>k in prefs).map(k=>[k,prefs[k]])):null},
  zeroLatency,localeMode,appVersion});
}
const empty=r=>!r||!r.hook.stream&&!r.hook.embed&&!r.layout.box&&!r.layout.scan&&!r.layout.colors&&!r.zeroLatency&&!r.flowPage&&!r.localeMode;

/* ---- local store ---------------------------------------------------------------------------------------------- */
function read(root){const v=readJSON(storeFile(root));return {version:1,records:v.records&&typeof v.records==='object'?v.records:{},applied:v.applied&&typeof v.applied==='object'?v.applied:{},notice:v.notice&&typeof v.notice==='object'?v.notice:{}};}
function write(root,doc){atomic(storeFile(root),doc);}
/* The user's switch (Settings → 游戏库 → 共享适配数据（匿名）); on unless turned off. */
function enabled(root){if(require('../core/owner-tests.cjs').privateMode(root))return false;return readJSON(path.join(root,'data','config','library.json')).sharedAdaptation!==false;}
/* Keeps this PC's record for the game. A remote record never replaces a local one. */
function save(root,record,origin='local'){
 const r=clean(record);if(!r||empty(r))return null;const doc=read(root),old=doc.records[r.key];
 if(origin==='remote'&&old&&old.origin==='local')return null;
 if(origin==='local'&&old){/* keep fields the new run did not see (a calibration save knows no stream) */for(const k of ['stream'])if(!r.hook[k]&&old.hook?.[k])r.hook[k]=old.hook[k];if(!r.hook.embed&&old.hook?.embed)r.hook.embed=old.hook.embed;for(const k of ['box','scan','colors'])if(!r.layout[k]&&old.layout?.[k])r.layout[k]=old.layout[k];if(!r.zeroLatency&&old.zeroLatency)r.zeroLatency=old.zeroLatency;if(!r.localeMode&&old.localeMode)r.localeMode=old.localeMode;}
 doc.records[r.key]={...r,origin};write(root,doc);return r;
}
function find(root,fp){if(!fp?.key)return null;const r=read(root).records[fp.key];return r?clean(r):null;}

/* ---- game-side files ------------------------------------------------------------------------------------------ */
/* Same key as HookBridge.MemoryFile (E244): file name with unsafe characters replaced, then the size. */
function streamFile(root,executable,size){const name=path.win32.basename(String(executable)).replace(/[^A-Za-z0-9._-]/g,'_');return path.join(root,'data','hook-streams',name+'-'+size+'.json');}
// Hook code and contexts identify a stream without publishing labels or process addresses.
function streamDigest(stream) {
 if (!stream?.code) return null;
 return sha(JSON.stringify([String(stream.code),...['ctx','ctx2'].map(k=>String(stream[k]??'0').toLowerCase().replace(/^0x|^0+(?=.)/g,''))]));
}
function readStream(root,executable){try{const st=fs.statSync(executable);const v=readJSON(streamFile(root,executable,st.size));return v.code?{name:v.name,code:v.code,addr:v.addr,ctx:v.ctx,ctx2:v.ctx2}:null;}catch{return null;}}
/* Zero-latency adapter for the game folder (data/config/original-text.json). */
function zeroLatencyOf(root,executable){try{const dir=path.dirname(String(executable)).toLowerCase(),all=readJSON(path.join(root,'data','config','original-text.json'));
 for(const s of Object.values(all)){const rt=s?.runtime;if(!rt?.engine)continue;const file=String(rt.file||'').toLowerCase(),gd=String(s.gameDir||'').toLowerCase();if(file!==dir&&path.dirname(file)!==dir&&gd!==dir)continue;
  return {adapter:rt.engine,patchKind:s.mode==='original'?'original':s.patchStatus==='ready'?'patch':s.status==='native-japanese'?'native':''};}}catch{}return null;}
function profileKeyOf(executable){return sha(fs.readFileSync(executable));}

/* ---- import --------------------------------------------------------------------------------------------------- */
/* Applies a matching record as this game's defaults. Every part is applied only where this PC has nothing saved:
   the stream memory file, the game-style profile entry (box, scan area, colours, Hook mode), the locale mode.
   `cheap` skips the profile entry (it needs a hash of the whole executable), for library scans.
   Returns {applied:[parts]} and leaves a one-time notice for the reader status. */
function importFor(root,{executable,engine='',library=null,styleSync=null,cheap=false}={}){
 if(!executable||!enabled(root))return {applied:[]};
 const doc=read(root);if(cheap&&!Object.keys(doc.records).length)return {applied:[]};
 let fp;try{fp=fingerprint(executable,engine);}catch{return {applied:[]};}if(!fp)return {applied:[]};
 const record=doc.records[fp.key]?clean(doc.records[fp.key]):null;if(!record)return {applied:[],fingerprint:fp};
 const done=new Set(doc.applied[fp.key]?.parts||[]),applied=[];
 if(record.hook.stream&&!done.has('stream')){const file=streamFile(root,executable,fp.size);if(!fs.existsSync(file)){try{atomic(file,{...record.hook.stream,embeddable:record.hook.embed!=='readonly',shared:true,at:new Date().toISOString()});applied.push('stream');}catch{}}else done.add('stream');}
 if(library&&record.localeMode&&!library.localeMode&&!done.has('locale')&&!(record.localeMode==='japanese'&&require('../core/locale-emulator.cjs').steamApi(executable))){library.localeMode=record.localeMode;applied.push('locale');}
 if(!cheap&&!done.has('profile')){const prefs={};if(record.layout.box)for(const[k,v]of Object.entries(BOX))prefs[v]=record.layout.box[k];if(record.layout.scan)for(const[k,v]of Object.entries(SCAN))prefs[v]=record.layout.scan[k];if(record.layout.colors)Object.assign(prefs,record.layout.colors);if(record.hook.profile)prefs.hookProfile=record.hook.profile;
  if(Object.keys(prefs).length){try{const key=profileKeyOf(executable),file=path.join(root,'data','config','game-style-profiles.json'),docP=readJSON(file),entries=docP.entries&&typeof docP.entries==='object'?docP.entries:{};
   if(!entries[key]&&!styleSync?.profiles?.[key]){const now=Date.now(),entry={name:'',prefs,savedAt:now,textSavedAt:record.layout.colors?now:0,positionSavedAt:record.layout.box?now:0,shared:true,history:[]};
    atomic(file,{version:3,entries:{...entries,[key]:entry}});if(styleSync){styleSync.profiles={...styleSync.profiles,[key]:require('../core/game-profile.js').normalize(entry)};if(styleSync.profileKey===key)styleSync.replay?.();}applied.push('profile');}
   else done.add('profile');}catch{}}}
 if(applied.length){const d=read(root);d.applied[fp.key]={at:Date.now(),parts:[...new Set([...done,...applied])]};d.notice[fp.key]=1;write(root,d);}
 else if(done.size>(doc.applied[fp.key]?.parts||[]).length){const d=read(root);d.applied[fp.key]={at:Date.now(),parts:[...done]};write(root,d);}
 return {applied,fingerprint:fp};
}
/* True once per applied game: the reader says 已套用共享适配设置. */
function takeNotice(root,fp){if(!fp?.key)return false;const doc=read(root);if(!doc.notice[fp.key])return false;delete doc.notice[fp.key];write(root,doc);return true;}

/* ---- export --------------------------------------------------------------------------------------------------- */
/* Writes the running game's record after a verified embed or a calibration save, then hands it to the relay. */
/* the installed build (the appVersion option of exportFor shadows appVersion below) */
function installedVersion(root){return appVersion(root);}
function exportFor(root,{executable,engine='',library=null,hooks=null,styleSync=null,hookProfile='',appVersion='',sync=require('./shared-adaptation-sync.cjs')}={}){
 if(!executable||!enabled(root))return null;let fp;try{fp=fingerprint(executable,engine);}catch{return null;}if(!fp)return null;
 const profile=styleSync?.profile||null;
 const record=build({fingerprint:fp,stream:readStream(root,executable),embed:library?require('./hook-verdict.cjs').shown(library,installedVersion(root),''):undefined,hookProfile,flowPage:hooks?.flowPage===true,profile,zeroLatency:zeroLatencyOf(root,executable),localeMode:library?.localeMode,appVersion});
 const saved=save(root,record,'local');if(saved&&sync)Promise.resolve().then(()=>sync.push([saved],{root})).catch(()=>{});return saved;
}
function appVersion(root){try{const v=readJSON(path.join(root,'data','update-installed.json')).version;if(v)return String(v);}catch{}try{const m=/^version\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(root,'desktop','Cargo.toml'),'utf8'));if(m)return m[1];}catch{}return '';}

module.exports={streamDigest,SCHEMA,VERSION,fingerprint,clean,build,save,find,read,enabled,importFor,exportFor,takeNotice,streamFile,readStream,zeroLatencyOf,appVersion,storeFile,safe,empty};
