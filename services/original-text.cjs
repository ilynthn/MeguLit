// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Japanese original text for translated (Chinese-patched) games, without touching game files.
// Supported now: AliceSoft System4 AIN v4+ in the uncompressed "AI2" zlib container (verified on
// Rance01 光をもとめて, AIN v6). Each line of the message table (MSG0) has a stable index that the
// script code refers to, so a patched build that keeps the table layout maps line i to original line i.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const SCHEMA=1,KANA=/[ぁ-ゖァ-ヺ]/g,HAN=/[一-鿿]/g;
const sha256=file=>{const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buf=Buffer.alloc(1<<20);try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)hash.update(buf.subarray(0,n));}finally{fs.closeSync(fd);}return hash.digest('hex');};
const norm=s=>String(s||'').replace(/[\s　]+/g,'');
/* E408: scripts (YU-RIS 女装山脈, 9 043 of 13 696 lines) keep the speaker in the line, 行人「…」, while the game shows the name
   in its own box and the hook captures only 「…」. Lines match without the leading name and with ruby ≪何処／どこ≫ read as its base text; masked letters (●○◯＊) fold together. */
const SPEAKER=/^[^「『（(\s。、…―]{1,16}(?=[「『（(])/u;
/* KiriKiri scripts keep inline text commands the game never shows: font and pitch for a dash (%p-1;%fＭＳ ゴシック;――%p;%fuser;,
   9-nine, 351 lines) and voice sync (%D$vl1;). Lines match, and pair, without them. */
const inlineTags=s=>String(s||'').replace(/%[A-Za-z][^;%\n「」]{0,24};/g,'');
const plainKey=s=>norm(inlineTags(s)).replace(/≪([^≪≫／]*)／[^≪≫]*≫/g,'$1').replace(/[●○◯〇＊*■□]/g,'●');
const RESOURCE_LINE=/^[!-~]{1,64}$/;
/* 2026-11-21 (pairing self-test over every patched game): every ruby / markup form the engines write folds to its base text on both sides
   (｜base《reading》, base《かな》, <r…>base</r> and other short tags, {base:reading}, short [tags] such as CatSystem2's [/・]), and full-width
   digits and letters fold to half-width; a 《title》 that is no ruby (a kanji-less run) is kept */
const rubyFold=s=>String(s||'').replace(/[｜|]([^《｜|\n]+)《[^》\n]*》/g,'$1').replace(/([一-龯々〆ヶ]+)《[ぁ-ゖァ-ヺー・]+》/g,'$1').replace(/<\/?[A-Za-z][^<>\n]{0,24}>/g,'').replace(/\{([^:{}\n]+):[^{}\n]*\}/g,'$1').replace(/\[[^\]\n]{0,12}\]/g,'').replace(/[０-９Ａ-Ｚａ-ｚ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));
const matchKey=s=>norm(rubyFold(inlineTags(s))).replace(/≪([^≪≫／]*)／[^≪≫]*≫/g,'$1').replace(SPEAKER,'').replace(/[●○◯〇＊*■□]/g,'●');
const japaneseLine=t=>{const k=(t.match(KANA)||[]).length,h=(t.match(HAN)||[]).length;return k>=2&&k>=h*.2;};
// Lines that carry language at all (not file names, labels or numbers): what the Japanese / translated share is measured on.
const prose=t=>/[^\x00-\x7f]/.test(t)&&!!String(t).trim();
/* OZMAFIA!! (夜鸮汉化) keeps the speaker's katakana name in front of the translated line, フーカ「天气真好……」, as the
   running line has it: whether the patch left a line in Japanese is judged on what follows a name both lines share. */
const spokenPart=(t,own)=>{const m=/^([^「『（(\s]{1,16})[「『（(]/.exec(String(own||''));return m&&String(t).startsWith(m[1])?String(t).slice(m[1].length):t;};
const SCRIPT_ASCII=/^[@#\[<*;%$&]|^\/\/|^[A-Za-z_][\w.]*\s*[(=]|\.(png|jpe?g|bmp|ogg|wav|mp3|ks|tjs|txt|ws2|scr|mjo|bsc|ybn|dat|arc|xp3)\b/i;
const latinDialogue=t=>{const s=String(t).trim();return !!s&&!SCRIPT_ASCII.test(s)&&!/[ぁ-ゖァ-ヺ一-鿿]/.test(s)&&/[A-Za-z]+\s+[A-Za-z]+/.test(s);};
/* E452 (#108 小红帽与迷失森林 Kirikiroid2 package): a translation group can replace the script text outright, leaving
   Japanese only in speaker tags (【ティアナ】), stage names and system screens. Per line such a script still looks a
   quarter Japanese, so the whole script is measured instead: kana as a share of kana + Han over the prose lines that
   are not a bare speaker name. Below 5 % (with enough Han to judge) the script is Chinese only, for every engine:
   小红帽 0.6 %, Japanese scripts far above (逆転裁判123 81 %). */
const NAME_LINE=/^[【\[［(（]?[^「『（(\s。、]{1,16}[】\]］)）]$/;
function chineseOnly(lines){let k=0,h=0;for(const t of lines){if(!prose(t)||NAME_LINE.test(String(t).trim()))continue;k+=(t.match(KANA)||[]).length;h+=(t.match(HAN)||[]).length;}return h>=200&&k<(k+h)*.05;}

// ---- System4 AIN -----------------------------------------------------------------------------
/* #136 older System4 games (戦国ランス, ランス・クエスト and others of that era) store the AIN without the "AI2" zlib
   wrapper: the whole file is XORed with the low byte of each MT19937 output (Knuth 69069 seeding, seed 0x5D3E3) and
   decrypts to "VERS" + version (as libsys4's ain_decrypt). */
const AIN_SEED=0x5D3E3;
let ainKey=null,ainKeyTimer=null;
function mtXorRaw(b,seed){const N=624,st=new Uint32Array(N);st[0]=seed>>>0;for(let i=1;i<N;i++)st[i]=Math.imul(69069,st[i-1])>>>0;
 const len=b.length;let p=0;
 while(p<len){
  for(let j=0;j<227;j++){const y=(st[j]&0x80000000)|(st[j+1]&0x7fffffff);st[j]=st[j+397]^(y>>>1)^(y&1?0x9908b0df:0);}
  for(let j=227;j<623;j++){const y=(st[j]&0x80000000)|(st[j+1]&0x7fffffff);st[j]=st[j-227]^(y>>>1)^(y&1?0x9908b0df:0);}
  {const y=(st[623]&0x80000000)|(st[0]&0x7fffffff);st[623]=st[396]^(y>>>1)^(y&1?0x9908b0df:0);}
  const end=p+624<len?p+624:len;
  for(let k=0;p<end;p++,k++){let y=st[k];y^=y>>>11;y^=(y<<7)&0x9d2c5680;y^=(y<<15)&0xefc60000;y^=y>>>18;b[p]^=y&255;}
 }
 return b;}
function mtXor(src,seed){const b=Buffer.from(src);
 if(seed!==AIN_SEED||b.length<64||b.length>(64<<20))return mtXorRaw(b,seed);
 if(!ainKey||ainKey.length<b.length)ainKey=mtXorRaw(Buffer.alloc(b.length),AIN_SEED);
 if(ainKeyTimer)clearTimeout(ainKeyTimer);ainKeyTimer=setTimeout(()=>{ainKey=null;ainKeyTimer=null;},5000);ainKeyTimer.unref?.();
 if(!(b.byteOffset&3)&&!(ainKey.byteOffset&3)){
  const n4=b.length>>>2,u=new Uint32Array(b.buffer,b.byteOffset,n4),k=new Uint32Array(ainKey.buffer,ainKey.byteOffset,n4);
  for(let i=0;i<n4;i++)u[i]^=k[i];
  for(let i=n4<<2;i<b.length;i++)b[i]^=ainKey[i];
 }else for(let i=0;i<b.length;i++)b[i]^=ainKey[i];
 return b;}
function plainAin(b){if(b.length<8)return null;const h=mtXor(b.subarray(0,8),AIN_SEED);if(h.toString('latin1',0,4)!=='VERS'||h[5]||h[6]||h[7])return null;return mtXor(b,AIN_SEED);}
function inflateAin(file){const b=Buffer.isBuffer(file)?file:fs.readFileSync(file);if(b.subarray(0,4).toString('latin1')==='VERS')return b;if(b.subarray(0,4).toString('latin1')!=='AI2\0'){const p=plainAin(b);if(p)return p;throw Error('UNSUPPORTED_AIN_CONTAINER');}const size=b.readUInt32LE(8),packed=b.readUInt32LE(12),d=zlib.inflateSync(b.subarray(16,16+packed));if(d.length!==size)throw Error('AIN_SIZE_MISMATCH');return d;}
/* A tag can also occur inside the code or another table: take the first occurrence whose table reads to its end. */
function section(d,tag,read){let last=null;for(let at=d.indexOf(tag);at>=0;at=d.indexOf(tag,at+1)){if(at+8>d.length)break;try{const out=read(at);if(out)return out;}catch(e){last=e;}}if(last)throw last;return null;}
function strings(d,tag){return section(d,tag,at=>{let p=at+4;const n=d.readUInt32LE(p);p+=4;if(n>4e6)return null;const out=[];for(let i=0;i<n;i++){const e=d.indexOf(0,p);if(e<0)throw Error('AIN_TRUNCATED_'+tag);out.push(d.subarray(p,e));p=e+1;}return out;});}
// One code page per file: a Chinese patch stores everything (its leftover Japanese too) as GBK, an original as Shift-JIS.
function codepage(buffers){const sample=buffers.filter(b=>b.length>3).slice(0,4000),score=enc=>{const dec=new TextDecoder(enc);let bad=0,kana=0;for(const b of sample){const t=dec.decode(b);bad+=(t.match(/�/g)||[]).length;kana+=(t.match(KANA)||[]).length;}return {enc,bad,kana};};const [sj,gbk]=[score('shift_jis'),score('gbk')];const u8=score('utf-8');/* newer System4 titles (ランス03 / 妻みぐい3 / ランス10 …) keep the tables as UTF-8: clean UTF-8 with kana or where both legacy pages break */
 if(u8.bad===0&&sample.some(b=>b.some(x=>x>0x7f))&&(u8.kana>sj.kana||sj.bad>0&&gbk.bad>0))return 'utf-8';
 return sj.bad<gbk.bad||sj.bad===gbk.bad&&sj.kana>=gbk.kana?'shift_jis':'gbk';}
function msg1(d){return section(d,'MSG1',at=>{let p=at+4;const n=d.readUInt32LE(p);p+=8;if(n>4e6)return null;const out=[];for(let i=0;i<n;i++){if(p+4>d.length)throw Error('AIN_TRUNCATED_MSG1');const len=d.readUInt32LE(p);p+=4;if(p+len>d.length)throw Error('AIN_TRUNCATED_MSG1');const b=Buffer.from(d.subarray(p,p+len));for(let k=0;k<len;k++)b[k]=(b[k]-k-0x60)&255;out.push(b);p+=len;}return out;});}
const ainCache=new Map();let ainCacheTimer=null;
function ainStamp(file){const st=fs.statSync(file,{bigint:true});return [st.ino,st.size,st.mtimeNs,st.ctimeNs].join('|');}
function readAin(file,expect){
 let key='',stamp='';
 if(typeof file==='string'){
  key=path.resolve(file).toLowerCase();
  try{stamp=ainStamp(file);}catch{}
  const hit=stamp&&ainCache.get(key);
  if(hit&&hit.stamp===stamp){
   const v=hit.value;
   if(expect&&(!v.structure.functions||v.structure.messages!==expect.messages||v.structure.functionHash!==expect.functionHash))return null;
   return {...v,lines:v.lines.slice(),structure:{...v.structure}};
  }
 }
 const d=inflateAin(file),version=d.subarray(0,4).toString('latin1')==='VERS'?d.readUInt32LE(4):0;
 let names=null,functionHash='';
 if(expect){
  names=(strings(d,'FNAM')||[]).map(b=>b.toString('latin1'));
  functionHash=crypto.createHash('sha256').update(names.join('\0')).digest('hex').slice(0,16);
  if(!names.length||functionHash!==expect.functionHash)return null;
 }
 const raw=strings(d,'MSG0')||msg1(d);if(!raw)throw Error('AIN_MESSAGES_MISSING');
 if(!names){names=(strings(d,'FNAM')||[]).map(b=>b.toString('latin1'));functionHash=crypto.createHash('sha256').update(names.join('\0')).digest('hex').slice(0,16);}
 const structure={messages:raw.length,functions:names.length,functionHash};
 if(expect&&structure.messages!==expect.messages)return null;
 const enc=codepage(raw),dec=new TextDecoder(enc),lines=raw.map(b=>dec.decode(b));
 const value={engine:'system4',version,codepage:enc,lines,structure};
 if(key&&stamp){if(ainCache.size>=8)ainCache.delete(ainCache.keys().next().value);ainCache.set(key,{stamp,value});
  if(ainCacheTimer)clearTimeout(ainCacheTimer);ainCacheTimer=setTimeout(()=>{ainCache.clear();ainCacheTimer=null;},5000);ainCacheTimer.unref?.();}
 return {...value,lines:value.lines.slice(),structure:{...value.structure}};
}
// ---- Paths and state --------------------------------------------------------------------------
const stateFile=root=>path.join(root,'data/config/original-text.json');
const indexDir=(root,id)=>path.join(root,'data/original-text',crypto.createHash('sha256').update(String(id)).digest('hex').slice(0,16));
function readState(root){try{return JSON.parse(fs.readFileSync(stateFile(root),'utf8'))||{};}catch{return {};}}
function writeState(root,id,patch){const all=readState(root);all[id]={...all[id],...patch,updatedAt:Date.now()};fs.mkdirSync(path.dirname(stateFile(root)),{recursive:true});fs.writeFileSync(stateFile(root)+'.tmp',JSON.stringify(all,null,1));fs.renameSync(stateFile(root)+'.tmp',stateFile(root));return all[id];}
function writeIndex(root,id,name,value){const dir=indexDir(root,id);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,name);fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);return file;}
function readIndex(file){const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.schema!==SCHEMA)throw Error('ORIGINAL_INDEX_SCHEMA');return value;}
/* E-S4 a folder can hold several .ain (a Chinese and a Japanese one, a System 3.9 AINI next to it): when the exe name picks none, the System4 ones are kept and the biggest wins */
function isSystem4Ain(f){try{const h=Buffer.alloc(8),fd=fs.openSync(f,'r');try{fs.readSync(fd,h,0,8,0);}finally{fs.closeSync(fd);}const m=h.toString('latin1',0,4);return m==='AI2 '||m==='VERS'||!!plainAin(h);}catch{return false;}}
function ainOf(dir,base){const files=fs.readdirSync(dir).filter(f=>/\.ain$/i.test(f)&&!/beifen|backup|\.bak/i.test(f));const preferred=files.find(f=>path.parse(f).name.toLowerCase()===String(base||'').toLowerCase());if(preferred)return path.join(dir,preferred);if(files.length===1)return path.join(dir,files[0]);
 const ok=files.map(f=>path.join(dir,f)).filter(isSystem4Ain).sort((a,b)=>fs.statSync(b).size-fs.statSync(a).size);return ok[0]||'';}
const bgi=require('./original-engines/bgi.cjs');
const ADAPTERS={
 system4:{marker:base=>base+'.ain',locate:(dir,base)=>{const file=ainOf(dir,base);return file?{engine:'system4',target:file}:null;},read:target=>readAin(target),fingerprint:target=>sha256(target)},
 bgi:{folder:true,marker:()=>'data01000.arc',locate:dir=>{try{const arcs=bgi.arcFiles(dir);if(!arcs.length)return null;const head=Buffer.alloc(12),fd=fs.openSync(arcs[0],'r');try{fs.readSync(fd,head,0,12,0);}finally{fs.closeSync(fd);}return ['BURIKO ARC20','PackFile    '].includes(head.toString('latin1'))?{engine:'bgi',target:dir}:null;}catch{return null;}},
  read:dir=>{const scenes=bgi.scan(dir),lines=scenes.flatMap(x=>x.lines),ruby=scenes.some(x=>x.ruby?.some(Boolean))?scenes.flatMap(x=>x.ruby||x.lines.map(()=>null)):undefined;return {engine:'bgi',version:0,codepage:'shift_jis',lines,ruby,sizes:scenes.map(x=>x.lines.length),structure:{messages:lines.length,functions:scenes.length,functionHash:crypto.createHash('sha256').update(scenes.map(x=>x.name+':'+x.lines.length).join('\n')).digest('hex').slice(0,16)}};},
  fingerprint:dir=>crypto.createHash('sha256').update('bgi-code-order\n'+bgi.arcFiles(dir).map(p=>{const st=fs.statSync(p);return path.basename(p)+'|'+st.size+'|'+st.mtimeMs;}).join('\n')).digest('hex')}};
// E280: engines read as scene files (KiriKiri, Artemis, Ren'Py); their script is the game folder like BGI's.
const scenes=require('./original-engines/scenes.cjs'),fillLines=require('./original-engines/fill.cjs');
/* 2026-11-28 per-speaker colours: the speaker of each line where the script names one (NeXAS (0,name)(5,1)(0,message)), parallel to
   lines like ruby; undefined when no scene names any. Old indexes without it stay valid: no speaker from the script. */
const whoOf=list=>list.some(x=>Array.isArray(x.who)&&x.who.length===x.lines.length&&x.who.some(Boolean))?list.flatMap(x=>Array.isArray(x.who)&&x.who.length===x.lines.length?x.who.map(n=>String(n||'').slice(0,24)):x.lines.map(()=>'')):undefined;
const whoFits=ain=>Array.isArray(ain?.who)&&Array.isArray(ain.lines)&&ain.who.length===ain.lines.length;
const {isGameExecutable:isSiaExecutable}=require('./original-engines/sia.cjs');
for(const id of Object.keys(scenes.ENGINES))ADAPTERS[id]={folder:true,scene:true,locate:dir=>scenes.readable(id,dir)?{engine:id,target:dir}:null,
 read:dir=>{const list=scenes.read(id,dir),lines=list.flatMap(x=>x.lines),ruby=list.some(x=>x.ruby)?list.flatMap(x=>x.ruby||x.lines.map(()=>null)):undefined,who=whoOf(list);const roles=list.some(scene=>scene.roles||scene.scope==='interface')?list.map(scene=>scene.roles||(scene.scope==='interface'?'i':'?').repeat(scene.lines.length)).join(''):undefined;
  return {engine:id,version:0,codepage:'text',lines,ruby,...(who?{who}:{}),roles,sizes:list.map(x=>x.lines.length),structure:{messages:lines.length,functions:list.length,functionHash:crypto.createHash('sha256').update(list.map(x=>x.name+':'+x.lines.length).join('\n')).digest('hex').slice(0,16)}};},
 fingerprint:dir=>scenes.fingerprint(id,dir)};
const runningDirOf=runtime=>ADAPTERS[runtime.engine||'system4']?.folder?runtime.file:path.dirname(runtime.file);
// Switching to or from 1055.exe can change the reader without changing files in the folder.
const runtimeMatchesExecutable=(runtime,executable)=>(runtime.siaExecutable??(runtime.engine==='sia'))===isSiaExecutable(executable);
/* 2026-11-21 (DDLC Plus pairing self-test: the generic Unity reader took the folder before vgprompter, so the runtime became its 53 poem lines and the
   group's 16177-line table no longer belonged to it): scene engines are chosen the way scenes.detect chooses them, the readers the engine registry
   names first; the plain registration order (generic readers among the dedicated ones) is no longer used for them */
function locate(dir,base,executable){for(const adapter of Object.values(ADAPTERS)){if(adapter.scene)continue;const found=adapter.locate(dir,base);if(found)return found;}let id=null;try{id=scenes.detect(dir,executable);}catch{}return id&&ADAPTERS[id]?{engine:id,target:dir}:null;}
const ARCHIVE_BAK_ENGINES=new Set(['silky']);
function readSceneArchive(id,file){
 if(!ARCHIVE_BAK_ENGINES.has(id))return null;
 const eng=scenes.ENGINES[id];if(!eng?.archiveEntries)return null;
 const entries=eng.archiveEntries(file);if(!entries?.length)return null;
 const byName=new Map();for(const s of entries)byName.set(s.name.toLowerCase(),s);
 const ordered=[...byName.values()].sort((a,b)=>a.name.localeCompare(b.name));
 const list=ordered.map(s=>{let parsed={lines:[],anchors:[]};try{parsed=s.parse?s.parse():eng.parse(s.read());}catch{}return fillLines.scene({name:s.name,...parsed,patched:false});});
 const lines=list.flatMap(x=>x.lines),ruby=list.some(x=>x.ruby)?list.flatMap(x=>x.ruby||x.lines.map(()=>null)):undefined,who=whoOf(list);
 const roles=list.some(scene=>scene.roles||scene.scope==='interface')?list.map(scene=>scene.roles||(scene.scope==='interface'?'i':'?').repeat(scene.lines.length)).join(''):undefined;
 return {engine:id,version:0,codepage:'text',lines,ruby,...(who?{who}:{}),roles,sizes:list.map(x=>x.lines.length),sceneNames:list.map(x=>x.name.toLowerCase()),
  structure:{messages:lines.length,functions:list.length,functionHash:crypto.createHash('sha256').update(list.map(x=>x.name+':'+x.lines.length).join('\n')).digest('hex').slice(0,16)}};
}
function locateBackup(engine,target,base){
 const st=fs.statSync(target,{throwIfNoEntry:false});if(!st)return null;
 if(st.isDirectory())return ADAPTERS[engine]?.locate(target,base)||null;
 if(!st.isFile())return null;
 if(engine==='system4')return isSystem4Ain(target)?{engine:'system4',target}:null;
 if(ARCHIVE_BAK_ENGINES.has(engine)&&ADAPTERS[engine]?.scene&&scenes.ENGINES[engine]?.archiveEntries){
  try{return scenes.ENGINES[engine].archiveEntries(target)?.length?{engine,target,archiveFile:true}:null;}catch{return null;}
 }
 return null;
}
const readScript=loc=>loc.archiveFile?readSceneArchive(loc.engine,loc.target):ADAPTERS[loc.engine].read(loc.target);
const fingerprint=loc=>loc.archiveFile?sha256(loc.target):ADAPTERS[loc.engine].fingerprint(loc.target);
function gameRow(db,id){const row=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(String(id));if(!row)throw Error('GAME_NOT_FOUND');return row;}

// ---- Running build: what the installed (patched) game still contains ---------------------------
function scanRunning(root,id,executable,opts={}){
 const dir=path.dirname(executable),loc=locate(dir,path.parse(executable).name,executable);if(!loc){const waiting=scenes.preparing(dir);return writeState(root,id,waiting?{status:'preparing',error:'SCRIPT_PREPARING',preparing:waiting,runtime:null,gameDir:dir}:(()=>{const why=scenes.unsupportedReason(dir);return why?{status:'unsupported',error:why.code,detail:why.detail,engine:why.engine,preparing:null,runtime:null,gameDir:dir}:{status:'unsupported',error:'NO_SUPPORTED_SCRIPT',detail:'',preparing:null,runtime:null,gameDir:dir};})());}const file=loc.target;
 const hash=fingerprint(loc),current=readState(root)[id];if(current?.runtime?.sha256===hash&&(current.runtime.reader||'')===READER&&runtimeMatchesExecutable(current.runtime,executable)&&current.runtime.index&&fs.existsSync(current.runtime.index))return current;
 const ain=readScript(loc),japanese=ain.lines.filter(t=>prose(t)&&japaneseLine(t)).length,nonEmpty=ain.lines.filter(prose).length,zhOnly=chineseOnly(ain.lines);
 // An English (or other) original read by a scene engine is neither the Japanese game nor a Chinese build: nothing to do.
 if(ADAPTERS[loc.engine].scene&&!zhOnly){const chinese=ain.lines.filter(t=>prose(t)&&!japaneseLine(t)&&/[一-鿿]{2}/.test(t)).length,latin=ain.lines.filter(latinDialogue).length;if(!nonEmpty||(japanese<nonEmpty*.5||latin>=Math.max(100,japanese*2,chinese*2))&&chinese<nonEmpty*.3)return writeState(root,id,{status:'unsupported',error:'SCRIPT_NOT_JAPANESE',runtime:null,gameDir:dir});}
 const index=writeIndex(root,id,'runtime-'+hash.slice(0,16)+'.json',{schema:SCHEMA,role:'runtime',engine:ain.engine,version:ain.version,codepage:ain.codepage,source:{file,sha256:hash},structure:ain.structure,lines:ain.lines,...(ain.roles?{roles:ain.roles}:{}),...(ain.ruby?{ruby:ain.ruby}:{}),...(whoFits(ain)?{who:ain.who}:{}),...(ain.sizes?{sizes:ain.sizes}:{})});
 const original=current?.original;const runtime={file,engine:loc.engine,sha256:hash,reader:READER,index,codepage:ain.codepage,version:ain.version,structure:ain.structure,lines:nonEmpty,japaneseLines:japanese};
 if(isSiaExecutable(executable))runtime.siaExecutable=true;
 // A changed game build invalidates the earlier alignment; the original index itself stays.
 const state=writeState(root,id,{engine:loc.engine,runtime,status:zhOnly&&!original?.index?'chinese-only':!zhOnly&&japanese>=nonEmpty*.5?'native-japanese':original?.index&&current?.runtime?.sha256===hash?current.status:original?.index?'needs-recheck':'awaiting-original'});
 /* A scene engine that reads the Japanese lines behind the running ones from this same folder (CMVS official Chinese:
    FileHook\ over the archives) adopts them as the original, as the live engines do while the game runs. A copy the
    user imported stays theirs. */
 const eng=scenes.ENGINES[loc.engine];
 if(ADAPTERS[loc.engine].scene&&eng?.originalLines&&!eng.live&&state.status!=='native-japanese'&&(!original||original.auto))try{const adopted=adoptOriginal(root,id,state,dir);if(adopted?.original?.index)return adopted;}catch{}
 /* S9 the Japanese release kept in a subfolder by the translation's installer (backupOriginal) is imported by itself */
 if(!opts.noBackup&&(state.status==='chinese-only'||state.status==='awaiting-original')&&!original?.index)try{const b=backupOriginal(dir,loc.engine,path.parse(executable).name);if(b)return importInto(root,id,state,b,path.parse(executable).name,true);}catch{}
 return state;
}
// ---- Original import and alignment -------------------------------------------------------------
function sharedKanaAside(translated,original){
 const aside=/（[ぁ-ゖァ-ヺー]+）/gu,notes=translated.match(aside);
 if(!notes)return false;
 const sourceNotes=original?.match(aside);
 if(!sourceNotes||notes.length!==sourceNotes.length||!notes.every((note,i)=>note===sourceNotes[i]))return false;
 const rest=translated.replace(aside,'');
 return /[一-鿿]/u.test(rest)&&!/[ぁ-ゖァ-ヺ]/u.test(rest)&&japaneseLine(original.replace(aside,''));
}
// Test the surrounding script's language once, only when a line has a shared kana annotation.
function untranslatedJapanese(lines){
 let chinese;
 return (text,original)=>japaneseLine(spokenPart(text,original))&&!(sharedKanaAside(text,original)&&(chinese??=chineseOnly(lines)));
}
function align(runtime,original){
 const sameStructure=runtime.structure.messages===original.structure.messages&&runtime.structure.functionHash===original.structure.functionHash;
 let kept=0,equal=0;const n=Math.min(runtime.lines.length,original.lines.length);
 // Lines the patch left in Japanese must equal the original at the same index; this measures the layout empirically.
 const isUntranslated=untranslatedJapanese(runtime.lines);
 for(let i=0;i<n;i++){
  const t=runtime.lines[i],source=original.lines[i];if(!isUntranslated(t,source))continue;
  kept++;if(norm(t)===norm(source))equal++;
 }
 /* Kana lines under 0.01 % of a translated script are translator notes quoting the original (CLANNAD's 「原文：「ネコ」（猫）」,
    5 of 102k lines), not lines the patch kept: too few to measure the layout, so the pairing sample (pairCheck) decides */
 const rate=kept?equal/kept:null,reliable=sameStructure&&(rate===null||rate>=.98||kept<n*.0001);
 return {sameStructure,keptJapanese:kept,keptEqual:equal,keptRate:rate,reliable};
}
// BGI builds that differ by a few lines per scene (E3xx 穢翼のユースティア) are lined up scene by scene (bgi.alignLines).
function realign(loc,ain,runtime,runningDir){if(loc.engine!=='bgi'||align(runtime,ain).sameStructure)return ain;
 const run=bgi.scan(runningDir),own=bgi.scan(loc.target),lines=bgi.alignLines(run,own),ruby=bgi.alignLines(run,own,'ruby');
 return lines.length===runtime.lines.length?{...ain,lines,ruby:ruby.some(Boolean)?ruby:undefined,structure:runtime.structure}:ain;}
/* E496 (user, 2026-11-12: translated games must pair 100%, always say total/paired/unpaired and why): the structure check
   above proves the layout; align-sample.cjs samples ~100 translated lines over the whole script and checks that each
   Chinese line says what its Japanese line says and that the timeline holds. A failing sample is lined up again scene by
   scene and sampled again; only a passing pairing is reliable. zh/ja are the two line lists, into says which list's order
   the realigned lines follow ('zh': Japanese lines for the Chinese build, 'ja': Chinese lines for the Japanese build). */
const sampler=require('./align-sample.cjs');
function pairCheck(zh,ja,{into='zh',zhSizes,jaSizes,ruby,keyed,structureOk=true}={}){
 const v=sampler.verify(zh,ja,{into,zhSizes,jaSizes,ruby,keyed,force:!structureOk,added:into==='zh'?ja.added:null,rewritten:into==='zh'?ja.rewritten:null});
 return {verdict:v,report:sampler.report(v)};
}
function importOriginal(root,db,id,dir,{activate=false}={}){
 const row=gameRow(db,id);if(typeof dir!=='string'||!path.isAbsolute(dir)||!fs.statSync(dir,{throwIfNoEntry:false})?.isDirectory())throw Error('INVALID_ORIGINAL_DIRECTORY');
 if(path.resolve(dir).toLowerCase()===path.dirname(row.executable).toLowerCase())throw Error('ORIGINAL_IS_RUNNING_COPY');
 writeState(root,id,{status:'scanning',error:''});
 try{
  const state=scanRunning(root,id,row.executable,{noBackup:true});if(!state.runtime)throw Error(state.error||'NO_SUPPORTED_SCRIPT');
  const result=importInto(root,id,state,dir,path.parse(row.executable).name,false);
  return activate&&result.status==='ready'?setMode(root,id,'original'):result;
 }catch(error){writeState(root,id,{status:'failed',error:String(error.message||error)});throw error;}
}
/* the import itself: the user's folder (importOriginal) or a Japanese release found inside the game folder (auto) */
function importInto(root,id,state,dir,exeBase,auto){
 {
  const engineId=state.runtime.engine||'system4';
  const isFile=auto&&!!fs.statSync(dir,{throwIfNoEntry:false})?.isFile();
  const loc=isFile?locateBackup(engineId,dir,path.parse(state.runtime.file).name):locate(dir,path.parse(state.runtime.file).name);
  if(!loc||loc.engine!==engineId)throw Error('ORIGINAL_SCRIPT_NOT_FOUND');
  const file=loc.target,origDir=isFile?path.dirname(dir):dir;
  const hash=fingerprint(loc);if(hash===state.runtime.sha256)throw Error('ORIGINAL_SAME_AS_RUNNING');
  const runtime=readIndex(state.runtime.index);const raw=readScript(loc);if(!raw)throw Error('ORIGINAL_SCRIPT_NOT_FOUND');let ain=realign(loc,raw,runtime,runningDirOf(state.runtime));const japanese=ain.lines.filter(t=>prose(t)&&japaneseLine(t)).length;
  // Never accept a translated file as the original: most of its lines must be Japanese.
  if(japanese<ain.lines.filter(prose).length*.5)throw Error('ORIGINAL_NOT_JAPANESE');
  let alignment=align(runtime,{...ain,structure:ain.structure});
  const pc=pairCheck(runtime.lines,ain.lines,{zhSizes:runtime.sizes,jaSizes:ain.sizes,ruby:ain.ruby,structureOk:alignment.sameStructure});
  if(pc.verdict.lines){ain={...ain,lines:pc.verdict.lines,ruby:pc.verdict.ruby?.some(Boolean)?pc.verdict.ruby:undefined,structure:runtime.structure,sizes:runtime.sizes};alignment=align(runtime,ain);}
  alignment={...alignment,reliable:alignment.reliable&&pc.verdict.ok,pairing:pc.report};
  if(isFile&&!alignment.reliable)return state;
  const index=writeIndex(root,id,'original-'+hash.slice(0,16)+'.json',{schema:SCHEMA,role:'original',engine:ain.engine,version:ain.version,codepage:ain.codepage,source:{file,sha256:hash,dir:origDir},structure:ain.structure,lines:ain.lines,...(Array.isArray(ain.ruby)?{ruby:ain.ruby}:{}),...(whoFits(ain)?{who:ain.who}:{})});
  const exe=isFile?null:fs.readdirSync(origDir).find(f=>/\.exe$/i.test(f)&&path.parse(f).name.toLowerCase()===String(exeBase).toLowerCase());
  return writeState(root,id,{original:{dir:origDir,file,sha256:hash,index,codepage:ain.codepage,lines:ain.lines.length,executable:exe?path.join(origDir,exe):'',...(auto?{auto:true,backup:true}:{})},alignment,status:alignment.reliable?'ready':'unreliable',mode:readState(root)[id]?.mode||(alignment.reliable?'original':'off'),error:''});
 }
}
/* S9 (2026-11-19) a Chinese build that replaced the script archive in place and kept the Japanese one in a subfolder
   (穢翼のユースティア 汉化版: data01000.arc is Chinese, backup/备份/data01000.arc is the 2011 Japanese release). Folders up to
   three levels down that hold a file named like one of the running script's sources are read with the same reader; the
   one with most Japanese lines, at least half its prose, is the original. Also checks <source>.bak archive backups
   (same folder and backup subfolders) via single-file reading and System4 sibling .ain / <stem>.bak files. → folder/file or null */
function sourceNames(engine,dir){if(engine==='bgi')return bgi.arcFiles(dir).map(f=>path.basename(f));const e=scenes.ENGINES[engine];if(!e?.sources)return [];return e.sources(dir).filter(f=>path.dirname(path.resolve(f)).toLowerCase()===path.resolve(dir).toLowerCase()).map(f=>path.basename(f));}
function japaneseBackupCount(lines){const prose_=lines.filter(prose),ja=prose_.filter(japaneseLine).length;return ja>=prose_.length*.5&&ja>=50?ja:0;}
function backupSystem4(dir,base){
 const running=ainOf(dir,base);if(!running)return null;
 let runAin;try{runAin=readAin(running);}catch{return null;}
 if(!runAin.structure.functions)return null;
 const runKey=path.resolve(running).toLowerCase(),runName=path.basename(running).toLowerCase(),runStem=path.parse(running).name.toLowerCase();
 let best=null,seen=0;
 const check=full=>{
  if(path.resolve(full).toLowerCase()===runKey||!isSystem4Ain(full))return;
  let r;try{r=readAin(full,runAin.structure);}catch{return;}
  if(!r||!align(runAin,r).sameStructure)return;
  const ja=japaneseBackupCount(r.lines);if(!ja)return;
  if(!best||ja>best.ja)best={target:full,ja};
 };
 const visit=(d,level)=>{let list;try{list=fs.readdirSync(d,{withFileTypes:true});}catch{return;}
  for(const e of list){if(!e.isFile())continue;const lower=e.name.toLowerCase(),full=path.join(d,e.name);
   if(lower===runName||lower===runName+'.bak'||lower===runStem+'.bak'||/\.ain$/i.test(lower))check(full);}
  if(level<3)for(const e of list)if(e.isDirectory()&&!/^\.megulit/i.test(e.name)&&++seen<400)visit(path.join(d,e.name),level+1);};
 visit(dir,0);return best?best.target:null;
}
function backupOriginal(dir,engine,base){
 if(engine==='system4')return backupSystem4(dir,base);
 if(engine!=='bgi'&&!ADAPTERS[engine]?.scene)return null;
 const names=new Set(sourceNames(engine,dir).map(n=>n.toLowerCase()));if(!names.size)return null;
 const bakNames=new Set([...names].map(n=>n+'.bak'));
 const canArchiveBak=ARCHIVE_BAK_ENGINES.has(engine)&&!!(ADAPTERS[engine]?.scene&&scenes.ENGINES[engine]?.archiveEntries);
 let runScenes=null;
 const scenesMatch=candNames=>{
  if(!runScenes){try{runScenes=new Set(scenes.ENGINES[engine].scenes(dir).map(s=>s.name.toLowerCase()));}catch{runScenes=new Set();}}
  if(!runScenes.size||!candNames?.length)return false;
  let overlap=0;for(const n of candNames)if(runScenes.has(n))overlap++;
  return overlap>=Math.max(1,Math.ceil(runScenes.size*.5));
 };
 /* the running archives' own folder (Archive) is not a backup of them */
 const own=engine==='bgi'?path.resolve(path.dirname(bgi.arcFiles(dir)[0]||dir)).toLowerCase():'';
 let best=null,seen=0;const visit=(d,level)=>{let list;try{list=fs.readdirSync(d,{withFileTypes:true});}catch{return;}if(level>0&&path.resolve(d).toLowerCase()===own)return;
  if(level>0&&list.some(e=>e.isFile()&&names.has(e.name.toLowerCase())))try{const loc=ADAPTERS[engine].locate(d,base);if(loc&&loc.engine===engine){const r=readScript(loc),ja=japaneseBackupCount(r.lines);if(ja&&(!best||ja>best.ja))best={target:d,ja};}}catch{}
  if(canArchiveBak)for(const e of list){if(!e.isFile()||!bakNames.has(e.name.toLowerCase()))continue;
   try{const full=path.join(d,e.name),r=readSceneArchive(engine,full);if(!r)continue;const ja=japaneseBackupCount(r.lines);if(ja&&scenesMatch(r.sceneNames)&&(!best||ja>best.ja))best={target:full,ja};}catch{}}
  if(level<3)for(const e of list)if(e.isDirectory()&&!/^\.megulit/i.test(e.name)&&++seen<400)visit(path.join(d,e.name),level+1);};
 visit(dir,0);return best?best.target:null;}
// ---- Chinese patch import (user, 2026-11-09): the game runs in Japanese and a translation group's patch is imported --
// The patch's script is read with the same engine adapter and lined up with the running Japanese script; the patch's
// line i then is the translation of Japanese line i (zero-latency bilingual, the group's own wording).
// E280 (user, 2026-11-10: no manual import): a patch can be a folder (the patch itself, an unpacked archive, a whole
// Chinese install), loose scene files next to the game, or one program with everything packed inside by Enigma Virtual
// Box (素晴らしき日々's BGI-CHS.exe). Ports that keep the Japanese code page and draw Chinese through a remapped font
// are decoded with that font (font-unmap.cjs). autoPatch looks for all of these by itself.
const evb=require('./original-engines/evb.cjs'),fontUnmap=require('./original-engines/font-unmap.cjs');
const FONT=/\.(?:ttf|ttc|otf)$/i,SKIP_DIR=/^(?:save|savedata|userdata)(?:$|[_.-])|^\.megulit(?:$|-)|^megulit-original-backup$/i;
const sameDir=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
function isEvb(file){
 try{const fd=fs.openSync(file,'r');
  try{const b=Buffer.alloc(4096);fs.readSync(fd,b,0,4096,0);if(b.readUInt16LE(0)!==0x5a4d)return false;const pe=b.readUInt32LE(0x3c);if(pe+24>4000)return false;
   const n=b.readUInt16LE(pe+6),opt=b.readUInt16LE(pe+20);
   for(let k=0;k<n;k++){const at=pe+24+opt+k*40;if(at+8>4096)break;if(b.toString('latin1',at,at+8).startsWith('.enigma'))return true;}
   return false;}finally{fs.closeSync(fd);}
 }catch{return false;}
}
function evbData(file){try{const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(4);return fs.readSync(fd,b,0,4,0)===4&&b.toString('latin1')==='EVB\0';}finally{fs.closeSync(fd);}}catch{return false;}}
// Everything a patch offers: loose files by lower-case name (read lazily), fonts, folders, packed programs.
function collect(source,depth=3){
 const out={files:new Map(),fonts:[],dirs:[],sources:[]};
 const addEvb=file=>{let t;try{t=evb.list(file);}catch{return;}if(!t?.files.length)return;out.sources.push(file);
  for(const e of t.files){const key=e.name.toLowerCase();if(FONT.test(e.name)){if(e.original<64<<20)try{out.fonts.push(evb.read(file,e));}catch{}}else if(!out.files.has(key))out.files.set(key,{name:e.name,packed:file,read:()=>evb.read(file,e)});}};
 const walk=(dir,d)=>{let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}out.dirs.push(dir);
  for(const e of entries){const full=path.join(dir,e.name);
   if(e.isDirectory()){if(d>0&&!SKIP_DIR.test(e.name))walk(full,d-1);continue;}
   if(!e.isFile())continue;
   if(/\.exe$/i.test(e.name)){if(isEvb(full))addEvb(full);continue;}
   // E449 a bare Enigma Virtual Box container next to the game (2030汉化组's 2030.xp, loaded by its own exe).
   if(evbData(full)){addEvb(full);continue;}
   if(FONT.test(e.name)){try{if(fs.statSync(full).size<64<<20)out.fonts.push(fs.readFileSync(full));}catch{}continue;}
   const key=e.name.toLowerCase();if(!out.files.has(key))out.files.set(key,{name:e.name,path:full,read:()=>fs.readFileSync(full)});}};
 const st=fs.statSync(source,{throwIfNoEntry:false});
 /* 2026-11-14 a picked program stands for its whole folder, subfolders included: a patched copy keeps its scripts in
    scene\ or data\ beside the launcher, which a top-level-only walk never saw (PATCH_SCRIPT_NOT_FOUND). */
 if(st?.isFile()){if(/\.exe$/i.test(source)&&isEvb(source))addEvb(source);walk(path.dirname(source),depth);}
 else if(st?.isDirectory())walk(source,depth);
 return out;
}
const sha256Buffer=b=>crypto.createHash('sha256').update(b).digest('hex');
const patchFingerprint=source=>{const st=fs.statSync(source,{throwIfNoEntry:false});return sha256Buffer('patch\n'+path.resolve(source).toLowerCase()+'|'+(st?.size||0)+'|'+(st?.mtimeMs||0));};
// What to pick by hand: the script file a patch must contain for this engine.
function patchHint(runtime){if(!runtime?.file)return '';return runtime.engine==='bgi'?'data01000.arc':scenes.ENGINES[runtime.engine]?scenes.ENGINES[runtime.engine].hint:path.basename(runtime.file);}
// The patch's line list for the running script, or a PATCH_* error.
function buildPatch(runningState,source){
 const engine=runningState.runtime.engine||'system4',runningFile=runningState.runtime.file,runningDir=runningDirOf(runningState.runtime);
 const found=collect(source);let script,patched=0,translated=null,sections=null,patchFiles=[];
 if(engine==='system4'){
  const want=path.basename(runningFile).toLowerCase(),files=[...found.files.values()].filter(f=>/\.ain$/i.test(f.name)&&!(f.path&&sameDir(path.dirname(f.path),runningDir)));
  const file=files.find(f=>f.name.toLowerCase()===want)||(files.length===1?files[0]:null);
  if(!file)throw Error('PATCH_SCRIPT_NOT_FOUND');
  const data=file.read();if(sha256Buffer(data)===runningState.runtime.sha256)throw Error('PATCH_SAME_AS_RUNNING');
  script=readAin(data);patched=1;if(file.path)patchFiles=[file.path];
 }else if(engine==='bgi'){
  const base=bgi.scan(runningDir),names=new Set(base.map(x=>x.name.toLowerCase())),overlay=new Map();
  for(const [key,f] of found.files){if(!names.has(key))continue;let data;try{data=f.read();}catch{continue;}if(bgi.isScript(data))overlay.set(key,data);}
  for(const dir of found.dirs){if(sameDir(dir,runningDir))continue;const arcs=bgi.arcFiles(dir);
   for(const file of arcs){let entries;try{entries=bgi.readArc(file);}catch{continue;}for(const e of entries||[]){const key=e.name.toLowerCase();if(names.has(key)&&!overlay.has(key)&&bgi.isScript(e.data))overlay.set(key,Buffer.from(e.data));}}}
  if(!overlay.size)throw Error('PATCH_SCRIPT_NOT_FOUND');
  // Scene by scene: a patched scene is used only when it has the same operands as the running one, checked on the
  // identifiers both keep (bgm004, daynt0001, voice names). Patches ported from another edition differ in a few scenes;
  // those, and lines the patch left in (that edition's) Japanese, fall back to the running text.
  const scenes=bgi.scan(runningDir,overlay).map((scene,i)=>{const own=base[i];if(!scene.patched||!own||own.name!==scene.name)return own||scene;
   if(scene.lines.length!==own.lines.length)return {...own,patched:false,skipped:'count'};
   let ids=0,same=0;own.lines.forEach((t,k)=>{if(t&&/^[!-~]+$/.test(t)){ids++;if(scene.lines[k]===t)same++;}});
   if(ids>=5&&same<ids*.9)return {...own,patched:false,skipped:'operands'};
   return {...scene,lines:scene.lines.map((t,k)=>japaneseLine(t)?own.lines[k]:t)};});
  const lines=scenes.flatMap(x=>x.lines);patched=scenes.filter(x=>x.patched).length;if(!patched)throw Error('PATCH_SCRIPT_NOT_FOUND');
  translated=scenes.filter(x=>x.patched).flatMap(x=>x.lines);
  script={engine:'bgi',version:0,codepage:'mixed',lines,sizes:scenes.map(x=>x.lines.length),structure:{messages:lines.length,functions:scenes.length,functionHash:crypto.createHash('sha256').update(scenes.map(x=>x.name+':'+x.lines.length).join('\n')).digest('hex').slice(0,16)}};
 }else if(scenes.ENGINES[engine]){
  const eng=scenes.ENGINES[engine],base=scenes.read(engine,runningDir);let list;
  found.running=runningDir;if(eng.patchLines)list=eng.patchLines(base,found);
  if(!list&&eng.patchLines&&(!eng.archives||engine==='siglus'))throw Error('PATCH_SCRIPT_NOT_FOUND');
  if(!list){
   const names=new Set(base.map(x=>x.name.toLowerCase())),overlay=new Map();
   /* 2026-11-14 the running game's own script files are never the patch, wherever they sit under its folder (BRUNS keeps
      them in scene\, below the folder a picked launcher stands for) */
   let own=[];try{own=(eng.sources?.(runningDir)||[]).map(f=>path.resolve(f).toLowerCase());}catch{}
   const ownFiles=new Set(own),ownDirs=new Set(own.map(f=>path.dirname(f)));
   for(const [key,f] of found.files){if(!names.has(key)||!eng.test(f.name)||f.path&&(sameDir(path.dirname(f.path),runningDir)||ownFiles.has(path.resolve(f.path).toLowerCase())))continue;try{overlay.set(key,f.read());}catch{}}
   for(const dir of found.dirs){if(sameDir(dir,runningDir)||ownDirs.has(path.resolve(dir).toLowerCase()))continue;let items=[];try{items=eng.archives(dir);}catch{}for(const item of items){const key=item.name.toLowerCase();if(names.has(key)&&!overlay.has(key))try{overlay.set(key,item.read());}catch{}}}
   /* E594 (user: picked 丑小鸭与文字祸.exe and was told nothing was found) the patch carries an archive of this engine under
      its own name, here patch.npk inside the EVB package mojika_cn.mys: open any file with the script archive's extension
      that is not the game's own; one packed in EVB is copied to a temp file first */
   if(!overlay.size&&eng.archiveEntries&&eng.hint){const ext=path.extname(eng.hint).toLowerCase();
    for(const f of found.files.values()){if(!ext||path.extname(f.name).toLowerCase()!==ext)continue;if(f.path&&ownFiles.has(path.resolve(f.path).toLowerCase()))continue;
     let file=f.path,tmp='';try{if(!file){tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'megulit-patch-'));file=path.join(tmp,path.basename(f.name));fs.writeFileSync(file,f.read());}
      for(const e of eng.archiveEntries(file)||[]){const key=e.name.toLowerCase();if(names.has(key)&&!overlay.has(key))try{overlay.set(key,e.read());}catch{}}}catch{}finally{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});}}}
   if(!overlay.size)throw Error('PATCH_SCRIPT_NOT_FOUND');
   // File by file: same number of text lines and the same anchors (commands, labels, file names), else the running text.
   list=scenes.read(engine,runningDir,overlay).map((scene,i)=>{const own=base[i];if(!scene.patched||!own||own.name!==scene.name)return own||scene;
    if(scene.lines.length!==own.lines.length)return {...own,patched:false,skipped:'count'};
    const n=Math.min(scene.anchors.length,own.anchors.length);let same=0;for(let k=0;k<n;k++)if(scene.anchors[k]===own.anchors[k])same++;
    if(own.anchors.length>=5&&(Math.abs(scene.anchors.length-own.anchors.length)>own.anchors.length*.1||same<own.anchors.length*.9))return {...own,patched:false,skipped:'anchors'};
    return scene;});
  }
  list=list.map((scene,i)=>scene.patched?{...scene,lines:scene.lines.map((t,k)=>japaneseLine(spokenPart(t,base[i].lines[k]))||base[i].zhSource?.[k]==='filled'&&base[i].zh[k]===t?base[i].lines[k]:t)}:scene);
  const lines=list.flatMap(x=>x.lines);patched=list.filter(x=>x.patched).length;if(!patched)throw Error('PATCH_SCRIPT_NOT_FOUND');
  translated=list.flatMap((scene,i)=>!scene.patched?[]:scene.keyed?scene.lines.filter((t,k)=>sampler.translated(t,base[i].lines[k])):scene.lines.map((t,k)=>spokenPart(t,base[i].lines[k])));
  sections=list.map(scene=>({scope:scene.scope==='interface'?'interface':'script',length:scene.lines.length,keyed:scene.keyed===true}));
  patchFiles=list.flatMap(scene=>scene.patchFiles||(scene.patchFile?[scene.patchFile]:[]));
  script={engine,version:0,codepage:'text',lines,sizes:list.map(x=>x.lines.length),structure:{messages:lines.length,functions:list.length,functionHash:crypto.createHash('sha256').update(list.map(x=>x.name+':'+x.lines.length).join('\n')).digest('hex').slice(0,16)}};
 }else throw Error('NO_SUPPORTED_SCRIPT');
 // Remapped-font ports: decode with the fonts the patch ships, or the ones it put next to the game.
 const fonts=[...found.fonts];if(!fonts.length){try{for(const f of fs.readdirSync(runningDir))if(FONT.test(f))fonts.push(fs.readFileSync(path.join(runningDir,f)));}catch{}}
 const sample=(translated||script.lines).filter(t=>t.trim()&&!japaneseLine(t)).slice(0,3000).join('').replace(/[\x00-\x7f\s　]/g,'');
 const map=sample&&fonts.length?fontUnmap.unmapping(fonts):null;
 if(map){let hits=0;for(const ch of sample)if(map.has(ch))hits++;
  if(hits>=sample.length*.3){const fix=t=>japaneseLine(t)?t:fontUnmap.apply(map,t);script.lines=script.lines.map(fix);if(translated)translated=translated.map(fix);script.fontMapped=true;}}
 const check=translated||script.lines,nonEmpty=check.filter(prose).length,japanese=check.filter(t=>prose(t)&&japaneseLine(t)).length;
 if(!nonEmpty||japanese>=nonEmpty*.5)throw Error('PATCH_NOT_TRANSLATED');
 return {script,patched,sections,sources:[...new Set([...patchFiles,...found.sources])]};
}
function patchCoverage(ja,zh,sections,reliable){
 const script={originalEntries:0,translations:0,paired:0},interfaceText={...script};
 if(sections?.reduce((sum,section)=>sum+section.length,0)!==ja.length)sections=null;
 let offset=0;
 for(const section of sections||[{scope:'script',length:ja.length}]){
  const counts=section.scope==='interface'?interfaceText:script;
  const end=offset+section.length,c=sampler.census(zh.slice(offset,end),ja.slice(offset,end));
  counts.originalEntries+=section.length;counts.translations+=c.total;counts.paired+=reliable?c.paired:0;
  offset=end;
 }
 return {originalEntries:ja.length,script,interface:interfaceText};
}
// A program next to (or in a copy of) the game that is not the game itself and not an Enigma container.
function packedLauncher(source,executable){
 if(!/\.exe$/i.test(source)||isEvb(source))return false;
 if(path.resolve(source).toLowerCase()===path.resolve(executable).toLowerCase())return false;
 return sameDir(path.dirname(source),path.dirname(executable));
}
function importPatch(root,db,id,source,{auto=false,executable,imageSource}={}){
 const row=executable?{executable}:gameRow(db,id);if(typeof source!=='string'||!path.isAbsolute(source)||!fs.statSync(source,{throwIfNoEntry:false}))throw Error('INVALID_PATCH_DIRECTORY');
 // A picked script file stands for its folder (the folder may hold more than that one file).
 const picked=source;if(fs.statSync(source).isFile()&&!/\.exe$/i.test(source))source=path.dirname(source);
 const state=scanRunning(root,id,row.executable);if(!state.runtime)throw Error(state.error||'NO_SUPPORTED_SCRIPT');
 let built;try{built=buildPatch(state,source);}catch(error){
  // Nothing besides the game itself in its own folder: say that the game's folder was picked.
  if(error.message==='PATCH_SCRIPT_NOT_FOUND'&&fs.statSync(source).isDirectory()&&sameDir(source,path.dirname(row.executable)))throw Error('PATCH_IS_RUNNING_COPY');
  /* 2026-11-14 (ダストマニア・グロテスク: 解体插入新书中文版.exe beside gameplay.exe): a Chinese launcher whose folder holds only
     the running Japanese scripts keeps its translation inside the program, packed or encrypted (that one: a packed exe
     with an encrypted overlay, libchs.dll only switches the charset). It is the right file, so it is remembered and the
     dialog says why its text cannot be read, instead of calling the pick wrong. */
  // A script file of the running game itself (sceneruns0100.bso picked in the Japanese install).
  if(error.message==='PATCH_SCRIPT_NOT_FOUND'&&picked!==source&&path.resolve(picked).toLowerCase().startsWith(path.resolve(path.dirname(row.executable)).toLowerCase()+path.sep))throw Error('PATCH_SAME_AS_RUNNING');
  if(error.message==='PATCH_SCRIPT_NOT_FOUND'&&packedLauncher(source,row.executable)){writeState(root,id,{patchLauncher:{file:source,at:Date.now()}});throw Error('PATCH_PACKED_LAUNCHER');}
  throw error;}
 let {script}=built;const {patched,sources,sections}=built,runtime=readIndex(state.runtime.index);
 // Lines the patch left in Japanese must equal the running script at the same index (same measure as the original import).
 let alignment=align({...script,structure:script.structure},runtime);
 const keyed=sections?.some(section=>section.keyed)?sections.flatMap(section=>Array(section.length).fill(section.keyed)):undefined;
 const pc=pairCheck(script.lines,runtime.lines,{into:'ja',keyed,zhSizes:script.sizes,jaSizes:runtime.sizes,structureOk:alignment.sameStructure});
 if(pc.verdict.lines){script={...script,lines:pc.verdict.lines};alignment=align({...script,structure:script.structure},runtime);}
 alignment={...alignment,reliable:alignment.reliable&&pc.verdict.ok,pairing:pc.report};
 if(!pc.report.total)throw Error('PATCH_NOT_TRANSLATED');
 const coverage=patchCoverage(runtime.lines,script.lines,sections,alignment.reliable);
 const quality=require('./script-translation-quality.cjs').translationQuality(runtime,alignment.reliable?script.lines:null);
 if(quality)coverage.translationQuality=quality;
 const patchStatus=!alignment.reliable?'unreliable':coverage.script.paired?'ready':coverage.interface.paired?'interface-only':'unreliable';
 const persistedSource=imageSource||source,hash=patchFingerprint(persistedSource),isDir=fs.statSync(persistedSource).isDirectory();
 const index=writeIndex(root,id,'patch-'+hash.slice(0,16)+'.json',{schema:SCHEMA,role:'patch',engine:script.engine,version:script.version,codepage:script.codepage,source:{file:source,sha256:hash,sources},structure:script.structure,lines:script.lines});
 return writeState(root,id,{patch:{dir:isDir?persistedSource:path.dirname(persistedSource),source:persistedSource,file:persistedSource,sha256:hash,index,lines:script.lines.length,scenes:patched,fontMapped:!!script.fontMapped,auto,coverage,sources,runtimeSha:state.runtime.sha256,reader:state.runtime.reader||'',version:PATCH_VERSION},patchAlignment:alignment,patchStatus,patchSearch:{...state.patchSearch,running:false,declined:false},error:''});
}

/* A drive already mounted by the user is a directory. Image files go through the local
   ISO reader, so even a disc containing setup.exe is only inspected as data. */
async function importPatchSource(root,db,id,source,options={}){
 const st=path.isAbsolute(source)&&fs.statSync(source,{throwIfNoEntry:false});
 if(!st||!st.isFile()&&!st.isDirectory())throw Error('INVALID_PATCH_DIRECTORY');
 if(st.isDirectory()||/\.exe$/i.test(source))return importPatch(root,db,id,source,options);
 const disc=require('../core/disc-image.cjs');
 if(!disc.IMAGE.test(source)){
  const row=gameRow(db,id),state=scanRunning(root,id,row.executable);
  const engine=state.runtime?.engine,name=path.basename(source),adapter=scenes.ENGINES[engine],hintExt=path.extname(patchHint(state.runtime)).toLowerCase();
  const matchesHint=hintExt&&path.extname(source).toLowerCase()===hintExt;
  let looseBgi=false;
  if(engine==='bgi'&&!matchesHint){
   const fd=fs.openSync(source,'r'),header=Buffer.alloc(32);
   try{fs.readSync(fd,header,0,header.length,0);looseBgi=bgi.isScript(header);}finally{fs.closeSync(fd);}
  }
  if(!(matchesHint||looseBgi||adapter?.test?.(name)||evbData(source)))throw Error('PATCH_SOURCE_TYPE');
  return importPatch(root,db,id,source,options);
 }
 const cue=/\.cue$/i.test(source);
 if(cue&&st.size>1024*1024)throw Error('PATCH_DISC_UNREADABLE');
 const data=disc.imageOf(source);
 if(cue&&(data===source||!sameDir(path.dirname(data),path.dirname(source))))throw Error('PATCH_DISC_DATA_MISSING');
 const cache=path.join(root,'cache');
 fs.mkdirSync(cache,{recursive:true});
 const dir=fs.mkdtempSync(path.join(cache,'translation-disc-'));
 try{
  try{if(!await disc.extract(data,dir,{bounded:true}))throw Error('EMPTY_DISC');}catch{throw Error('PATCH_DISC_UNREADABLE');}
  try{return importPatch(root,db,id,dir,{...options,imageSource:source});}catch(error){
   if(error.message==='PATCH_SCRIPT_NOT_FOUND')throw Error('PATCH_DISC_NO_SCRIPT');
   throw error;
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
// Where a patch may already be on this computer, nearest first: the game folder (packed programs, loose scenes, patch
// subfolders), the other folders next to it, then the same script elsewhere on local drives.
function nearbyPatchSources(executable,engine){
 const dir=path.dirname(executable),parent=path.dirname(dir),out=[];
 /* E328 a game switched to Japanese by MeguLit keeps the files it replaced (the translation patch) in its backup
    folders; those are the patch, so they are tried first and zero-latency translation follows the Japanese import. */
 if(engine==='siglus')out.push(dir);
 for(const rel of ['.megulit-japanese-import/files','.megulit-japanese/yuris','.megulit-japanese/dat']){const b=path.join(dir,rel);try{if(fs.statSync(b).isDirectory())out.push(b);}catch{}}
 if(engine!=='siglus')out.push(dir);
 try{for(const e of fs.readdirSync(parent,{withFileTypes:true}))if(e.isDirectory()&&!sameDir(path.join(parent,e.name),dir)&&!SKIP_DIR.test(e.name))out.push(path.join(parent,e.name));}catch{}
 return out;
}
// Bumped when the way patches are read changes; older stored patches are rebuilt before use.
/* 3: KiriKiri cx Chinese slot found by its text, ASCII-quoted slots take the Japanese brackets (2026-11-13) */
/* 4: store source coverage and recheck Siglus indexes that counted settings as dialogue */
const PATCH_VERSION=5;
function patchCurrent(state){
 const patch=state?.patch;
 if(!patch||patch.runtimeSha&&patch.runtimeSha!==state.runtime?.sha256)return false;
 if(state.patchStatus==='ready'&&patch.coverage&&!(patch.coverage.script?.paired>0))return false;
 return patch.version===PATCH_VERSION||[3,4].includes(patch.version)&&state.runtime?.engine!=='siglus'&&state.patchAlignment?.pairing?.paired>0;
}
function refreshCachedPatchReport(root,id,state){
 const patch=state?.patch,rt=state?.runtime;
 if(!patch?.index||!rt?.index||!rt.engine||rt.engine==='siglus'||patch.version===PATCH_VERSION)return state;
 if(patch.version!=null&&![3,4].includes(patch.version))return state;
 if(patch.runtimeSha&&patch.runtimeSha!==rt.sha256)return state;
 if(patch.coverage&&!(patch.coverage.script?.paired>0))return state;
 if(!patchCurrent(state)&&(state.patchStatus!=='ready'||!state.patchAlignment?.reliable))return state;
 const source=readIndex(state.patch.index),runtime=readIndex(state.runtime.index);
 if(source.lines.length!==runtime.lines.length||runtime.roles?.includes('i'))return state;
 const check=pairCheck(source.lines,runtime.lines,{into:'ja',zhSizes:source.sizes,jaSizes:runtime.sizes,structureOk:state.patchAlignment?.sameStructure===true});
 const reliable=state.patchStatus==='ready'&&state.patchAlignment?.reliable===true&&check.verdict.ok&&!check.verdict.lines;
 const coverage=patchCoverage(runtime.lines,source.lines,null,reliable);
 return writeState(root,id,{patchAlignment:{...state.patchAlignment,reliable,pairing:check.report},patch:{...patch,coverage,runtimeSha:rt.sha256,version:PATCH_VERSION},
  patchStatus:reliable&&coverage.script.paired?'ready':'unreliable'});
}
/* 2026-11-13 (ファタモルガーナの館: a good Chinese patch fell back to 提前机翻): the running script's index was kept while the game
   files were unchanged, so a reader fix (E449 skips [iscript] code) never reached it. The old 55783-line index (code comments
   included) met a 42420-line patch from the fixed reader, pairing called it unrelated text and the patch was dropped. The
   index now also carries a stamp of the reader code; another stamp reads the script again and rebuilds the patch. */
const READER=(()=>{try{const h=require('node:crypto').createHash('sha256');const dir=path.join(__dirname,'original-engines');
 for(const f of fs.readdirSync(dir).filter(n=>n.endsWith('.cjs')).sort())h.update(f+'|').update(fs.readFileSync(path.join(dir,f)));
 /* E561 the adapter-pack runtime reads scripts too: a fix to it reads the games it serves again */
 try{h.update('adapter-packs|').update(fs.readFileSync(path.join(__dirname,'adapter-packs.cjs')));}catch{}
 return h.digest('hex').slice(0,12);}catch{return '';}})();
const autoRuns=new Map();
// Fire and forget, with its own database handle (callers' handles close when their request ends).
/* 2026-11-14 the search runs in a worker thread (services/text-source-worker.cjs): on the service thread it held every other
   request while it walked the folders next to the game. One search per game at a time; later calls share it. */
const laterRuns=new Map();
function autoPatchLater(root,id,done,options={}){
 id=String(id);if(laterRuns.has(id))return laterRuns.get(id).then(done,()=>{});
 const {roots,...rest}=options,run=require('./text-source-worker.cjs').run(root,'autoPatch',[id,{...rest,...(Array.isArray(roots)?{roots}:{})}]).finally(()=>laterRuns.delete(id));
 laterRuns.set(id,run);return run.then(done,()=>{});
}
function autoPatch(root,db,id,options={}){
 id=String(id);if(autoRuns.has(id))return autoRuns.get(id);
 const run=(async()=>{
  const row=gameRow(db,id);let state=scanRunning(root,id,row.executable);if(!state.runtime||state.status!=='native-japanese')return {skipped:'not-japanese'};
  if(state.patch?.source&&!fs.existsSync(state.patch.source))try{state=refreshCachedPatchReport(root,id,state);}catch{}
  // A stored patch whose running script changed (game update, new line order) is rebuilt from where it was found.
  // A stored patch built by an older reader (E286: a name column taken for the translation) is rebuilt the same way.
  /* A pairing made for another running script (the game's files restored or updated: Summer Pockets after its Japanese
     restore was undone, 2026-11-13) pairs nothing; when its source folder is gone too it is searched for again. */
  const stale=state.patch&&state.patch.version!==PATCH_VERSION,outdated=!!state.patch&&(state.patch.runtimeSha!==state.runtime.sha256||(state.patch.reader?state.patch.reader!==(state.runtime.reader||''):!!state.patch.source&&fs.existsSync(state.patch.source)));
  const settled=state.patchStatus==='ready'||state.patchStatus==='interface-only';
  if(state.patch?.source&&(stale||!settled||outdated)&&fs.existsSync(state.patch.source)&&!(stale&&state.patch.auto&&state.runtime.engine==='siglus')){
   try{const r=await importPatchSource(root,db,id,state.patch.source,{auto:!!state.patch.auto});if(r.patchStatus==='ready')return {found:state.patch.source,rebuilt:true};}catch{}
   if((stale||state.patchStatus==='ready')&&state.patch.auto){state=writeState(root,id,{patch:null,patchAlignment:null,patchStatus:'none',patchSearch:{...state.patchSearch,at:0}});options={...options,force:true};}}
  else if(state.patch?.auto&&(stale||outdated)&&settled){state=writeState(root,id,{patch:null,patchAlignment:null,patchStatus:'none',patchSearch:{...state.patchSearch,at:0}});options={...options,force:true};}
  if(state.patchStatus==='ready'&&patchCurrent(state))return {kept:true};
  /* A script the user picked is theirs: the drive search below tries other games' scripts (SenrenBanka's for Fata Morgana)
     and every try rewrote the stored patch, so a failed search left a stranger's pairing and no patch. */
  state=readState(root)[id]||state;if(state.patch&&!state.patch.auto&&!options.force)return {manual:true};
  if(state.patchSearch?.declined&&!options.force)return {declined:true};
  const recent=state.patchSearch?.at&&Date.now()-state.patchSearch.at<(options.maxAge??864e5)&&state.patchSearch.runtimeSha===state.runtime.sha256&&(state.patchSearch.reader||'')===(state.runtime.reader||'');
  if(recent&&!options.force)return {cached:true};
  writeState(root,id,{patchSearch:{...state.patchSearch,running:true,declined:false,at:Date.now()}});
  const before=readState(root)[id]||{},tried=new Set();let found=null,diagnostic=null;
  const attempt=source=>{
   const key=path.resolve(source).toLowerCase();if(found||tried.has(key))return;
   tried.add(key);
   try{
    const r=importPatch(root,db,id,source,{auto:true});
    if(r.patchStatus==='ready')found=source;
    if(r.patchStatus==='interface-only'&&(!diagnostic||r.patch.coverage.interface.paired>diagnostic.patch.coverage.interface.paired))diagnostic=r;
   }catch{}
  };
  try{
   for(const source of nearbyPatchSources(row.executable,state.runtime.engine))attempt(source);
   if(!found&&options.drives!==false&&ADAPTERS[state.runtime.engine||'system4'].marker){
    const engine=state.runtime.engine||'system4',marker=engine==='system4'?path.basename(state.runtime.file):'sysprg.arc';
    const search=await findCandidates(path.parse(marker).name,path.dirname(row.executable).toLowerCase(),{ext:path.extname(marker),roots:options.roots||localRoots(),deadline:Date.now()+(options.timeout||30000)});
    for(const file of search.found)attempt(path.dirname(file));
   }
  }finally{
   const now=readState(root)[id]||{};
   const fallback=before.patch&&!before.patch.auto?before:diagnostic||before;
   writeState(root,id,{patchSearch:{at:Date.now(),running:false,declined:false,found:!!found,source:found||'',tried:tried.size,runtimeSha:now.runtime?.sha256||'',reader:now.runtime?.reader||''},...(found||now.patchStatus==='ready'?{}:{patchStatus:fallback.patch?fallback.patchStatus||'none':'none',patch:fallback.patch||null,patchAlignment:fallback.patch?fallback.patchAlignment||null:null})});
  }
  return found?{found}:{notFound:true,tried:tried.size};
 })().finally(()=>autoRuns.delete(id));
 autoRuns.set(id,run);return run;
}
// Removing a patch the search found also stops the search from bringing it back.
function clearPatch(root,id){const s=readState(root)[id];return writeState(root,id,{patch:null,patchAlignment:null,patchStatus:'none',patchSearch:{...s?.patchSearch,running:false,declined:!!s?.patch?.auto}});}
/* E360 one word for the game page and the library, from the saved state only (no scan): patch = the translation
   group's / release's own Chinese is ready, machine = Japanese script read, the next lines are machine-translated ahead,
   needs-japanese = a Chinese build (restore or import the Japanese release), preparing, none, unknown (not checked yet). */
function brief(root,id){const s=readState(root)[String(id)];if(!s)return 'unknown';
 /* patch-unreliable: a Chinese script is set but failed pairing, so it is not used; patch-removed: the user removed the found one */
 if(s.status==='native-japanese')return s.patchStatus==='ready'&&patchCurrent(s)?'patch':s.patch&&s.patchStatus==='unreliable'?'patch-unreliable':s.patchSearch?.declined?'patch-removed':'machine';
 if(s.status==='ready')return 'patch';if(s.status==='awaiting-original'||s.status==='chinese-only'||s.status==='needs-recheck')return 'needs-japanese';
 if(s.status==='preparing')return 'preparing';return 'none';}
function status(root,db,id){
 const row=gameRow(db,id),saved=readState(root)[id];let state=saved;
 const runtimeMatches=saved?.runtime&&runtimeMatchesExecutable(saved.runtime,row.executable);
 try{if(!runtimeMatches||!sameDir(runningDirOf(saved.runtime),path.dirname(row.executable))||!fs.existsSync(saved.runtime.file)||saved.runtime.sha256!==fingerprint({engine:saved.runtime.engine||'system4',target:saved.runtime.file}))state=scanRunning(root,id,row.executable);}catch(error){state={...saved,runtime:runtimeMatches?saved.runtime:null,status:'failed',error:String(error.message||error)};}
 try{state=refreshCachedPatchReport(root,id,state);}catch{}
 /* Live test 2026-11-13 (Summer Pockets, 魔法少女ノ魔女裁判, DDLC Plus): patches aligned before E496 had no pairing report, so the
    game page could not say total/paired/unpaired. Sample it once from the saved indexes; the verdict is reported, the state kept. */
 try{if(state?.patchStatus==='ready'&&patchCurrent(state)&&state.patch?.index&&state.runtime?.index&&state.patchAlignment&&!state.patchAlignment.pairing){const z=readIndex(state.patch.index),j=readIndex(state.runtime.index);if(z.lines.length===j.lines.length){const pc=pairCheck(z.lines,j.lines,{into:'ja',zhSizes:z.sizes,jaSizes:j.sizes,structureOk:state.patchAlignment.sameStructure!==false});state=writeState(root,id,{patchAlignment:{...state.patchAlignment,pairing:pc.report}});}}}catch{}
 const {index:_a,...runtime}=state?.runtime||{},{index:_b,...original}=state?.original||{};
 const patchInfo=patchCurrent(state)?{dir:state.patch.dir,file:state.patch.file,source:state.patch.source||state.patch.file,lines:state.patch.lines,auto:!!state.patch.auto,fontMapped:!!state.patch.fontMapped,coverage:state.patch.coverage,sources:state.patch.sources}:null;
 /* E288 (user: the dialog stayed on 正在查找 for good after removing a patch): every status poll starts autoPatchLater, so
    an entry in autoRuns says nothing; only a search that really scans (it records running) counts, for two minutes at most. */
 const searching=!!state?.patchSearch?.running&&Date.now()-(state.patchSearch.at||0)<120000,patchSearch=state?.patchSearch||searching?{running:searching,found:!!state?.patchSearch?.found,at:state?.patchSearch?.at||0,declined:!!state?.patchSearch?.declined}:null;
 const engine=scenes.acceptsExecutable(state?.engine,row.executable)?state?.engine||'':'';
 return {preparing:state?.status==='preparing'?state.preparing||null:null,patchSearch,patchHint:patchHint(state?.runtime),patchLauncher:state?.patchLauncher?.file&&fs.existsSync(state.patchLauncher.file)?{file:state.patchLauncher.file}:null,gameDir:path.dirname(row.executable),patch:patchInfo,patchStatus:patchInfo?state.patchStatus||'none':'none',patchAlignment:patchInfo?state.patchAlignment||null:null,engine,status:state?.status||'unsupported',mode:state?.mode||'off',error:state?.error||'',lastSearch:state?.lastSearch?{at:state.lastSearch.at,found:state.lastSearch.found,searched:state.lastSearch.searched,complete:state.lastSearch.complete}:null,runtime:state?.runtime?runtime:null,original:state?.original?original:null,alignment:state?.alignment||null};
}
function setMode(root,id,mode){if(!['off','original'].includes(mode))throw Error('INVALID_TEXT_MODE');const s=readState(root)[id];if(mode==='original'&&s?.status!=='ready')throw Error('ORIGINAL_NOT_READY');return writeState(root,id,{mode});}

// ---- Matching captured text to original lines --------------------------------------------------
// Captured text is one or more consecutive message lines. Exact cover of the text by consecutive runtime lines is
// required; repeated lines ("はい", "……") are resolved by the reading position, never by content alone.
class Matcher{
 /* 2026-11-13 (STEINS;GATE prologue read by OCR: 「調べるのた」 for 「調べるのだ」, so the line never met the script and the
    translation was a machine one): the script line an OCR row stands for. Bigram overlap (Dice) of the row against the same
    length of each line near the reading position (or anywhere before the first match); a row that is most of a line and
    agrees at 0.8 or more gives the whole script line. '' when nothing is that close. */
 near(text){const s=matchKey(text);if(s.length<6)return -1;const grams=t=>{const m=new Map();for(let i=0;i+1<t.length;i++){const g=t.slice(i,i+2);m.set(g,(m.get(g)||0)+1);}return m;};const a=grams(s);
  const dice=t=>{const b=grams(t);let both=0;for(const [g,n] of a)both+=Math.min(n,b.get(g)||0);return 2*both/Math.max(1,s.length-1+t.length-1);};
  const from=this.last>=0?Math.max(0,this.last-40):0,to=this.last>=0?Math.min(this.normalized.length,this.last+600):this.normalized.length;let best=-1,score=0;
  for(let i=from;i<to;i++){const t=this.normalized[i];if(!t||t.length<s.length*.6||s.length<t.length*.6&&t.length-s.length>12)continue;const d=dice(t.slice(0,s.length+2));if(d>score){score=d;best=i;}}
  if(best<0||score<.8||s.length<this.normalized[best].length*.6)return -1;this.moveTo(best);return best;}
 // A vanished OCR group can contain just the end of a line being replaced.
 // A complete short line anywhere in the script takes precedence. Keep the reading position intact.
 ocrSuffix(text){
  const raw=matchKey(text),tail=raw.replace(/^[・…]+/u,'');
  if(!/^[ぁ-ヺ一-龯々ー]{3,10}[。！？]$/u.test(tail))return false;
  for(const key of [raw,tail]){
   if(this.heads.get(key.slice(0,4))?.some(i=>this.normalized[i]===key))return false;
  }
  return this.normalized.some(line=>line.length>=tail.length+2&&line.endsWith(tail));
 }
 constructor(runtimeLines,originalLines){this.isUntranslated=untranslatedJapanese(runtimeLines);this.rt=runtimeLines;this.og=originalLines;this.normalized=runtimeLines.map(matchKey);this.heads=new Map();this.normalized.forEach((t,i)=>{if(!t)return;const k=t.slice(0,4);if(!this.heads.has(k))this.heads.set(k,[]);this.heads.get(k).push(i);});this.last=-1;}
 /* 2026-11-13 (涙 name screen: 「あなたの現在の名前は『春日　光一』、」 lost its head as if it were a speaker): a line after the
    first of a joined text is also tried whole, without the speaker cut */
 /* 2026-11-19 (素晴らしき日々, BGI: 「……そして」 and 「ヒラヒラ服だわね……」」 are two messages with the resource line ev0001_l between
    them; the bridge hands them over as one line): after the first line, a script line that is only a resource name (ASCII, no
    space: ev0001_l, yuki_000002_d, bgm017) and does not continue the text is stepped over, up to 3 in a row; it is no part of the cover */
 cover(start,s,captured){
  let at=0,i=start,skipped=0;const used=[];
  while(at<s.length&&i<this.normalized.length){
   let t=this.normalized[i];if(!t){i++;continue;}
   // A Han phrase before an inline aside can look like a speaker. Verify that row's full text.
   if(t.startsWith('（')&&japaneseLine(this.rt[i])&&!this.isUntranslated(this.rt[i],this.og[i])){
    const whole=plainKey(this.rt[i]);
    if(i===start){if(!plainKey(captured).startsWith(whole))return null;}
    else t=whole;
   }
   if(!s.startsWith(t,at)){
    const whole=i>start?plainKey(this.rt[i]):'';
    if(whole&&s.startsWith(whole,at))t=whole;
    else if(i>start&&skipped<3&&RESOURCE_LINE.test(t)){i++;skipped++;continue;}
    else return null;
   }
   used.push(i);at+=t.length;i++;skipped=0;
  }
  return at===s.length?used:null;
 }
 /* 2026-11-19 (素晴らしき日々, user test: lines read from the game's LOG screen, たとえば……。 #13845 and 「まだ作り途中…」 #13774, moved the
    reading position 600 lines back; the story lines after it, 700 ahead, were taken for repeated lines and had no translation):
    the last positions read are kept; with no line ahead of the current one, a line ahead of a recent one is taken, then a line
    at most 60 before the current one (a LOG line just read) */
 /* the reading state, kept and put back by a lookup that tries another form of a line (core/hook-native.cjs resolveSource) */
 save(){return [this.last,this.recent?this.recent.slice():null,this.maybe];}
 load(v){if(Array.isArray(v)){[this.last,this.recent,this.maybe]=v;}}
 // Identify the original script entries in a hook packet without advancing the translation lookup cursor.
 pageParts(text){const flat=plainKey(text),key=matchKey(text);if(!flat||!key)return [];
  // A whole authored row wins over a possible split, even if its translation is ambiguous at this position.
  const row=this.heads.get(key.slice(0,4))?.find(i=>plainKey(this.rt[i])===flat);
  if(row!==undefined)return [inlineTags(this.rt[row])];
  const before=this.save();try{
  const result=this.match(text);
  if(!['exact','high'].includes(result.status)||result.method==='guess'||!result.indices?.length)return [];
  return result.indices.map(i=>inlineTags(this.rt[i]));
 }finally{this.load(before);}}
 // Recover a dialogue callback from a secondary stream only when it is the following authored row.
 pageNext(previous,text){
  const tail=plainKey(text);if(!tail)return false;
  const before=this.save();try{
   const r=this.match(previous);
   return ['exact','high'].includes(r.status)&&r.method!=='guess'&&r.method!=='same-text'&&r.indices?.length>0&&plainKey(this.rt[r.indices.at(-1)+1])===tail;
  }finally{this.load(before);}
 }
 // A packet bounded by two drawn rows proves that its entries took place between them.
 pageBetween(previous,packet,next){
  const before=plainKey(previous),after=plainKey(next),key=matchKey(packet);
  if(!before||!key||!after)return [];
  const candidates=this.heads.get(matchKey(previous).slice(0,4))||[];
  for(const i of candidates){
   if(plainKey(this.rt[i])!==before)continue;
   const indices=this.cover(i+1,key,packet);
   if(!indices?.length||plainKey(this.rt[indices.at(-1)+1])!==after)continue;
   const rows=indices.map(j=>inlineTags(this.rt[j]));
   if(rows.map(plainKey).join('')===plainKey(packet))return rows;
  }
  return [];
 }
 /* sure=false: a guessed place, the other places stay open (maybe) */
 moveTo(i,sure=true){this.last=i;if(sure)this.maybe=null;(this.recent||(this.recent=[])).push(i);if(this.recent.length>8)this.recent.shift();}
 recentPick(found){for(const a of [...(this.recent||[])].reverse()){if(a===this.last)continue;const c=found.filter(c=>c[0]>a&&c[0]-a<=400).sort((x,y)=>x[0]-y[0]);if(c.length)return {c:c[0],method:'recent'};}
  const near=found.filter(c=>c[0]<this.last&&this.last-c.at(-1)<=60).sort((x,y)=>y[0]-x[0]);return near.length?{c:near[0],method:'near-back'}:null;}
 match(text){
  const s=matchKey(text);if(!s)return {status:'none',method:'empty'};const starts=new Set();for(let k=Math.min(4,s.length);k>=1;k--)for(const i of this.heads.get(s.slice(0,k))||[])if(s.startsWith(this.normalized[i]))starts.add(i);
  const found=[...starts].map(i=>this.cover(i,s,text)).filter(Boolean);if(!found.length)return {status:'none',method:'no-cover'};
  let pick,method,status,alt,cont=[],open=false;
  if(found.length===1){pick=found[0];method='unique';status='exact';}
  else{/* a line that grew (core/sentence-pieces.cjs) starts before the reading position and ends on or past it: the piece's own
     lookup (the embed request comes before the source line) has already moved the position to the piece. It comes first;
     a one-line re-read of the line just read comes after the lines ahead. */const fwd=c=>c[0]>this.last&&c[0]-this.last<=400,back=c=>c[0]<=this.last&&c.at(-1)>=this.last&&this.last-c[0]<=12;/* 2026-11-21 (みにくいモジカの子 「狙って、」「狙って、狙って、」「狙って、狙って、狙って、」: the two lines just read joined are the next line
     word for word) the very next line, whole, goes before a grown line */const next=found.filter(c=>c.length===1&&c[0]===this.last+1);const ahead=[...next,...found.filter(c=>back(c)&&c.length>1),...found.filter(fwd).sort((a,b)=>a[0]-b[0]).filter(c=>!next.includes(c)),...found.filter(c=>back(c)&&c.length===1)];
   /* 2026-11-21 (pairing self-test read in script order: PureStation's and みにくいモジカの子's first lines, 「くらい。」「どこ？」, stood in two
      places translated differently and stayed unpaired): while the place is not known (no line read yet, or a guess), every place the
      lines so far can be at is kept (maybe); a line that goes on from exactly one of them fixes the place (anchored) */
   cont=this.maybe?found.filter(c=>this.maybe.some(e=>c[0]>e&&c[0]-e<=12)):[];
   if(cont.length===1){pick=cont[0];method='anchored';status='high';}
   else if(this.last>=0&&ahead.length){pick=(cont.length?ahead.filter(c=>cont.includes(c)):[])[0]||ahead[0];method='position';status='high';}
   else if(this.last>=0&&(alt=this.recentPick(found))){pick=alt.c;method=alt.method;status='high';}
   else{const pool=cont.length?cont:found;/* E520 (first line after a restart or a load: no reading position yet): a repeated line whose every occurrence has the same original and translation gives the same answer wherever it is, so it is used; the reading position stays unknown */const same=c=>c.map(i=>(this.rt[i]??'')+''+(this.og[i]??'')).join('');
    if(this.last<0&&pool.every(c=>same(c)===same(pool[0]))){pick=pool[0];method='same-text';status='high';this.maybe=pool.map(c=>c.at(-1));}
    else{/* 2026-11-21 the place is not known and the places differ. With a reading position (no place within 400 lines): the nearest place ahead
       however far, else the nearest behind (7673cca9). With none (a new game, a load): the translation most places have (「………」 is 「………」 in
       most places), at a tie the first in the script (a game starts at its start). Either way the places stay open for the lines after it */const votes=new Map();for(const c of pool)votes.set(same(c),(votes.get(same(c))||0)+1);const top=Math.max(...votes.values()),best=pool.filter(c=>votes.get(same(c))===top);
     pick=this.last>=0?(pool.filter(c=>c[0]>this.last).sort((x,y)=>x[0]-y[0])[0]||pool.filter(c=>c[0]<=this.last).sort((x,y)=>y[0]-x[0])[0]):best.slice().sort((x,y)=>x[0]-y[0])[0];method='guess';status='high';}}
   open=method==='guess'||method==='position'&&cont.length>1;}
  if(open){this.moveTo(pick.at(-1),false);this.maybe=(method==='guess'&&!cont.length?found:cont).map(c=>c.at(-1));}else if(method!=='same-text')this.moveTo(pick.at(-1));const named=SPEAKER.test(norm(text)),original=pick.map((i,k)=>{const o=inlineTags(this.og[i]??'');return k||named||!SPEAKER.test(norm(this.rt[i]))?o:o.replace(/^[\s　]*/,'').replace(SPEAKER,'');}),already=pick.every(i=>this.isUntranslated(this.rt[i],this.og[i]));
  if(original.some(t=>!t.trim()))return {status:'uncertain',method:'empty-original',indices:pick};
  return {status,method,indices:pick,japanese:original.join('\n'),captured:text,alreadyJapanese:already};
 }
}
// The provider the hook pipeline consults for one running executable, or null when nothing reliable is set up.
// ---- Filling the gaps (user, 2026-11-10: complete a partial patch, and give every line zero latency) ----------------
// Lines the patch does not translate (or every line, when there is no patch) are translated a few lines ahead of the
// reading position by services/script-prefetch.cjs and kept per game and script version, so they are ready when shown
// and free the next time. They are machine translations and are marked so (machine:true).
const fillFile=(root,id,sha)=>path.join(indexDir(root,id),'fill-'+String(sha).slice(0,16)+'.json');
// One store per file, so a provider rebuilt while the game runs keeps the lines its predecessor had not saved yet.
const fillStores=new Map();
function fillStore(root,id,sha){const file=fillFile(root,id,sha);if(!fillStores.has(file))fillStores.set(file,openFill(file));return fillStores.get(file);}
function openFill(file){let map=new Map(),timer=null;
 try{const v=JSON.parse(fs.readFileSync(file,'utf8'));if(v.schema===SCHEMA&&v.lines)map=new Map(Object.entries(v.lines));}catch{}
 const save=()=>{timer=null;try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify({schema:SCHEMA,lines:Object.fromEntries(map)}));fs.renameSync(file+'.tmp',file);}catch{}};
 /* 2026-11-16 a stored line kept from before engine tags were stripped is read without them */const clean=v=>v==null?v:require('../core/language-tracks.cjs').engineMarkup(v);
 return {get:text=>clean(map.get(norm(text))),has:text=>map.has(norm(text)),set(text,value){map.set(norm(text),clean(String(value)));if(!timer)timer=setTimeout(save,2000);timer.unref?.();},flush(){if(timer){clearTimeout(timer);save();}},size:()=>map.size};
}
// E293/E296 scripts the game hands over while it runs (kirikiri-dump: KiriKiri Z scene files with the game's own Chinese;
// kirikiri-ks: a packed Chinese build's scripts, with the Japanese ones as the original): the provider rebuilds the
// running script and its counterpart when the capture folder changes, so a new scene reads from its first line. A miss
// re-checks at once; otherwise the rebuild runs between lines. Until something is saved every line goes the usual way.
const liveEngines=()=>Object.values(scenes.ENGINES).filter(e=>e.live);
const foreignKey=t=>String(t||'').replace(/<[^>]*>/g,'').replace(/[\s\u3000"'“”‘’.,!?…—–\-\u3001\u3002\u300c-\u300f\u3010\u3011\uff01\uff08\uff09\uff0c\uff1a\uff1b\uff1f\uff5e\u301c\u30fb]+/g,'').toLowerCase();
/* 2026-11-13 openings: a line the game draws as a picture in another language (Summer Pockets' Steam Chinese poem) is read
   by OCR with slips and without its punctuation; the closest table line of about the same length stands for it (bigram Dice) */
const bigrams=s=>{const a=[...s],m=new Map();for(let i=0;i+1<a.length;i++){const g=a[i]+a[i+1];m.set(g,(m.get(g)||0)+1);}return m;};
const dice=(A,n,key)=>{const L=[...key].length,B=bigrams(key);let hit=0;for(const [g,c] of A)hit+=Math.min(c,B.get(g)||0);return 2*hit/Math.max(1,n-1+L-1);};
function foreignNear(map,text){const k=foreignKey(text),n=[...k].length;if(n<4||!map||!map.size)return '';const A=bigrams(k);let best='',score=0;
 for(const [key,ja] of map){const L=[...key].length;if(Math.abs(L-n)>Math.max(2,n*.25))continue;const s=dice(A,n,key);if(s>score){score=s;best=ja;}}
 return score>=.6?best:'';}
/* A sequence of art lines (an opening poem) follows its table: after a line is found, the next one is looked for in the few
   rows after it first, where a picture's own wording of the translation (different from the table's) still finds its row;
   with nothing alike there, the very next row stands for it while the last find is recent (15 s). */
function foreignSeq(map,now=()=>Date.now()){const seq=Array.isArray(map.seq)&&map.seq.length?map.seq:[...map.entries()],pos=new Map();seq.forEach(([k],i)=>{if(!pos.has(k))pos.set(k,[]);pos.get(k).push(i);});let cands=[],lastAt=0;const jaKey=v=>foreignKey(v),byJa=new Map();seq.forEach(([,v],i)=>{const k=jaKey(v);if(!byJa.has(k))byJa.set(k,[]);byJa.get(k).push(i);});
 /* the same Japanese line in several tables (a poem reused from a chapter): every copy is a place the sequence can be at */
 const take=(list,i)=>{const all=new Set(list);for(const x of list)for(const y of byJa.get(jaKey(seq[x][1]))||[])all.add(y);cands=[...all];lastAt=now();return seq[i][1];};
 return text=>{const k=foreignKey(text),n=[...k].length;if(n<2)return '';const recent=cands.length&&now()-lastAt<15000,P=pos.get(k)||[];
  if(P.length){/* the same words in several tables: the row written exactly as drawn (punctuation too) first */const raw=String(text).replace(/\s+/g,''),same=i=>seq[i][2]!=null&&String(seq[i][2]).replace(/\s+/g,'')===raw,order=l=>{const s=l.filter(same);return s.length?s:l;};const near=order(recent?P.filter(i=>cands.some(c=>i>c&&i<=c+5)):[]);if(near.length)return take(near,near[0]);const all=order(P);return take(all,all[0]);}
  if(recent){const A=bigrams(k);let bi=-1,bs=0;for(const c of cands)for(let i=c+1;i<=c+4&&i<seq.length;i++){const s=dice(A,n,seq[i][0]);if(s>bs){bs=s;bi=i;}}
   if(bi>=0&&bs>=.1)return take([bi],bi);
   /* the picture's own wording: the next row, when it shares a word with the read and is about as long */let ni=-1,nd=0;for(const c of cands){const i=c+1;if(i>=seq.length)continue;const s=dice(A,n,seq[i][0]),L=[...seq[i][0]].length;if(s>nd&&n>=L*.6&&n<=L*1.6){nd=s;ni=i;}}if(ni>=0)return take([ni],ni);}
  const ja=foreignNear(map,text);if(ja){const list=[];seq.forEach(([x,v],i)=>{if(v===ja&&Math.abs([...x].length-n)<=Math.max(2,n*.25))list.push(i);});if(list.length)return take(list,list[0]);}return ja;};}
function liveProvider(root,id,executable){
 const engine=liveEngines()[0],dir=path.dirname(String(executable));let inner=null,stamp=null,checked=0,timer=null;
 const rebuild=()=>{const now=engine.stamp(dir);if(now===stamp)return false;stamp=now;
  try{let state=scanRunning(root,id,executable);const eng=scenes.ENGINES[state.runtime?.engine];
   if(state.runtime&&eng?.live){
    const fresh=state.patchStatus==='ready'&&state.patch?.runtimeSha===state.runtime.sha256&&state.patch.version===PATCH_VERSION;
    if(eng.patchLines&&state.status==='native-japanese'&&!fresh)try{importPatch(root,null,id,dir,{auto:true,executable});}catch{}
    if(eng.originalLines&&state.status!=='native-japanese')try{state=adoptOriginal(root,id,state,dir);}catch{}
    pruneIndexes(root,id);}
   inner=staticProvider(root,executable,{id});}catch{inner=null;}
  return true;};
 const later=()=>{if(timer)return;timer=setTimeout(()=>{timer=null;rebuild();},400);timer.unref?.();};
 const changed=()=>{checked=Date.now();return engine.stamp(dir)!==stamp;};
 rebuild();
 return {live:true,get kind(){return inner?.kind||'patch';},get patch(){return !!inner?.patch;},get fill(){return inner?.fill;},
  resolve(text){if(Date.now()-checked>300&&changed())later();let r=inner?inner.resolve(text):{status:'none',method:'no-scenes'};
   if(r.status==='none'&&r.method!=='empty'&&changed()&&rebuild()&&inner)r=inner.resolve(text);return r;},
  foreign(text,opt){return inner?.foreign?inner.foreign(text,opt):'';},
  near(text){return inner?.near?inner.near(text):'';},
  ocrSuffix(text){return inner?.ocrSuffix?.(text)===true;},
  pageParts(text){return inner?.pageParts?.(text)||[];},
  pageNext(previous,text){return inner?.pageNext?.(previous,text)===true;},
  pageBetween(previous,packet,next){return inner?.pageBetween?.(previous,packet,next)||[];},
  position(){return inner?.position?inner.position():-1;},
  save(){return inner?.save?{inner,v:inner.save()}:null;},
  load(x){if(x&&x.inner===inner)inner.load(x.v);},
  upcoming(count){return inner?.upcoming?inner.upcoming(count):[];}};
}
// Each rebuild writes indexes under new names; only the ones in use are kept.
function pruneIndexes(root,id){const s=readState(root)[id],keep=new Set([s?.runtime?.index,s?.original?.index,s?.patch?.index].filter(Boolean)),dir=indexDir(root,id);if(!s?.runtime?.index)return;
 try{for(const f of fs.readdirSync(dir))if(/^(?:runtime|original)-[0-9a-f]+\.json$/.test(f)&&!keep.has(path.join(dir,f)))fs.rmSync(path.join(dir,f),{force:true});}catch{}}
// The Japanese script the engine lines up with the running (translated) one, kept as the original: the same import as a
// picked Japanese copy (importOriginal), from what the engine read. Original mode is chosen unless it was turned off.
function adoptOriginal(root,id,state,dir){
 const eng=scenes.ENGINES[state.runtime.engine],runtime=readIndex(state.runtime.index);let lines=eng.originalLines(dir);
 if(!Array.isArray(lines)||lines.length!==runtime.lines.length||!lines.some(t=>t&&japaneseLine(t)))return state;
 const hash=crypto.createHash('sha256').update('original\n'+state.runtime.sha256).digest('hex');
 if(state.original?.sha256===hash&&state.original.index&&fs.existsSync(state.original.index)&&state.status==='ready')return state;
 let alignment=align(runtime,{lines,structure:runtime.structure});
 const pc=pairCheck(runtime.lines,lines,{zhSizes:runtime.sizes,jaSizes:runtime.sizes});
 if(pc.verdict.lines){lines=pc.verdict.lines;alignment=align(runtime,{lines,structure:runtime.structure});}
 alignment={...alignment,reliable:alignment.reliable&&pc.verdict.ok,pairing:pc.report};
 const index=writeIndex(root,id,'original-'+hash.slice(0,16)+'.json',{schema:SCHEMA,role:'original',engine:runtime.engine,version:0,codepage:'text',source:{file:dir,sha256:hash,dir},structure:runtime.structure,lines});
 return writeState(root,id,{original:{dir,file:dir,sha256:hash,index,codepage:'text',lines:lines.length,executable:'',auto:true},alignment,status:alignment.reliable?'ready':'unreliable',mode:state.mode||(alignment.reliable?'original':'off'),error:''});
}
/* E545 what the provider for this program is built from: the reader keeps a provider whose key has not changed (its reading position too) and rebuilds one whose script, patch or mode changed while the game runs */
function providerEntry(root,executable,id,{runtimeOnly=false}={}){
 const program=String(executable||''),dir=path.dirname(program).toLowerCase();
 return Object.entries(readState(root)).find(([key,s])=>(id===undefined||id===key)&&
  (s?.runtime?.file?runningDirOf(s.runtime).toLowerCase()===dir&&runtimeMatchesExecutable(s.runtime,program):!runtimeOnly&&String(s?.gameDir||'').toLowerCase()===dir));
}
const indexDigests=new Map();
function scriptDigest(file){
 const stat=fs.statSync(file,{bigint:true}),stamp=[stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join('|');
 const prior=indexDigests.get(file);if(prior?.stamp===stamp)return prior.digest;
 const index=readIndex(file);if(!Array.isArray(index.lines)||!index.lines.length)throw Error('EMPTY_SCRIPT');
 const digest=crypto.createHash('sha256').update(JSON.stringify(index.lines)).digest('hex');
 indexDigests.set(file,{stamp,digest});if(indexDigests.size>32)indexDigests.delete(indexDigests.keys().next().value);
 return digest;
}
function contributionScript(root,exe,id){
 if(!exe)return '';
 const dir=path.dirname(exe),archive=require('../core/japanese-import-original.cjs'),manifest=archive.archiveManifest(dir);
 if(manifest)return archive.localArchive(exe,manifest)?.valid()?manifest.indexSha256:'';
 const embedded=require('./embedded-japanese.cjs'),em=embedded.manifest(dir);
 if(em)return embedded._internal.valid(dir,em)?em.indexSha256:'';
 const entry=providerEntry(root,exe,id==null?undefined:String(id)),state=entry?.[1];
 if(!state?.runtime?.sha256){
  // A loose compiled Ren'Py entry script can identify the installed variant before any original-text index exists.
  try{
   if(!fs.statSync(path.join(dir,'renpy','__init__.py')).isFile())return '';
   const file=require('./torch-receive.cjs').scriptPath(exe,'game/script.rpyc');
   const stat=fs.statSync(file);
   if(!stat.isFile()||stat.size<11||stat.size>16*1024*1024)return '';
   const bytes=fs.readFileSync(file);
   return bytes.toString('latin1',0,10)==='RENPY RPC2'?crypto.createHash('sha256').update(bytes).digest('hex'):'';
  }catch{return '';}
 }
 try{if(fingerprint({engine:state.runtime.engine||'system4',target:state.runtime.file})!==state.runtime.sha256)return '';}catch{return '';}
 try{
  const hashes=[scriptDigest(state.runtime.index)];
  if(state.patchStatus==='ready'&&patchCurrent(state))hashes.push('patch',scriptDigest(state.patch.index));
  if(state.mode==='original'&&state.status==='ready')hashes.push('original',scriptDigest(state.original.index));
  return crypto.createHash('sha256').update(hashes.join('|')).digest('hex');
 }catch{return '';}
}
function providerKey(root,executable,id){const folder=path.dirname(String(executable||'')),dir=folder.toLowerCase();if(!dir||dir==='.')return '';
 const imported=require('../core/japanese-import-original.cjs'),archive=imported.archiveManifest(folder);
 if(archive)return 'archive|'+imported.archiveStamp(executable,archive);
 const embedded=require('./embedded-japanese.cjs').stamp(folder);if(embedded)return 'embedded|'+embedded;const entry=providerEntry(root,executable,id);if(!entry)return 'none|'+dir;const [entryId,s]=entry;return JSON.stringify([entryId,s.status||'',s.mode||'',s.runtime?.sha256||'',s.runtime?.index||'',s.patchStatus||'',s.patch?.index||'',s.patch?.version??'',s.patch?.runtimeSha||'',s.original?.index||'']);}
function archiveProvider(imported,executable,manifest){
 const index=imported.localArchive(executable,manifest);
 if(!index)return null;
 const matcher=new Matcher(index.rows.map(row=>row[0]),index.rows.map(row=>row[1]));
 return {kind:'patch',archiveImport:true,isCurrent:index.valid,hasLocalPairs:()=>index.valid()&&index.coverage.paired>0,
  position:()=>matcher.last,save:()=>matcher.save(),load:value=>matcher.load(value),resolve(text){
   if(!index.valid())return {status:'none',method:'source-changed'};
   const result=matcher.match(text);
   if(['guess','position','recent','near-back'].includes(result.method))return {status:'uncertain',method:'ambiguous',indices:result.indices};
   return result.japanese!==undefined?{...result,japanese:undefined,translation:result.japanese,source:'archive-local'}:result;
  }};
}
/* opts.indexOnly (tools/patch-pair-selftest.cjs): the stored script alone, without checking the game files against it (a game since
   removed or moved); the running game never uses it */
function provider(root,executable,opts={}){
 const embedded=require('./embedded-japanese.cjs'),embeddedDir=path.dirname(String(executable));
 const imported=require('../core/japanese-import-original.cjs'),archive=imported.archiveManifest(embeddedDir);
 if(archive)return archiveProvider(imported,executable,archive);
 if(embedded.manifest(embeddedDir))return embedded.provider(embeddedDir);
 const entry=providerEntry(root,executable,opts.id);
 /* 2026-11-13 no imported script: the script harvested at run time (services/script-harvest.cjs), when there is one */
 if(!entry){try{const h=require('./script-harvest.cjs');return h.report(path.dirname(String(executable)))?.total?h.provider(path.dirname(String(executable))):null;}catch{return null;}}
 const gameDir=path.dirname(String(executable));
 if(!opts.indexOnly&&(scenes.ENGINES[entry[1].runtime?.engine]?.live||!entry[1].runtime&&liveEngines().some(e=>e.eligible(gameDir))))return liveProvider(root,entry[0],executable);
 return staticProvider(root,executable,opts);
}
/* Learning (grammar examples, 2026-11-11): the imported script as index-aligned pairs, read-only (no import, no
   rebuild). ja[i] is the Japanese line, tr[i] its human translation or '' (a patch line left in Japanese is none);
   source is 'official' for a Chinese release with its Japanese original, 'group' for a translation group's patch. */
function scriptPairs(root,executable){
 const entry=providerEntry(root,executable,undefined,{runtimeOnly:true});if(!entry)return null;const state=entry[1];
 try{
  if(state.status==='ready'&&state.original?.index){const tr=readIndex(state.runtime.index).lines,ja=readIndex(state.original.index).lines;return {source:'official',ja,tr:ja.map((_,i)=>typeof tr[i]==='string'&&!japaneseLine(tr[i])?tr[i]:'')};}
  if(state.status!=='native-japanese'||!state.runtime.index)return null;const ja=readIndex(state.runtime.index).lines;
  const patched=state.patchStatus==='ready'&&state.patch?.index&&patchCurrent(state);
  if(!patched)return {source:'',ja,tr:[]};const og=readIndex(state.patch.index).lines;
  return {source:'group',ja,tr:ja.map((t,i)=>{const o=inlineTags(og[i]);return sampler.translated(o,inlineTags(t))?o:'';})};
 }catch{return null;}
}
/* Reading (core/game-reading.cjs, #1134): the ruby of the whole stored script, one entry per line (null or [[base,reading],…]),
   from the Japanese original when it replaces the running script, else from the running script; null when there is none. */
function scriptRuby(root,executable,id){
 const entry=providerEntry(root,executable,id,{runtimeOnly:true});if(!entry)return null;const state=entry[1];
 try{const file=state.mode==='original'&&state.status==='ready'&&state.original?.index?state.original.index:state.runtime?.index;if(!file)return null;
  const index=readIndex(file);return Array.isArray(index.ruby)&&index.ruby.some(Boolean)?index.ruby:null;}catch{return null;}
}
/* the script's speaker of a resolved line (index who, parallel to lines): speaker '' when the script names none */
const withSpeaker=(r,who)=>{if(!r||!Array.isArray(who)||!Array.isArray(r.indices)||!r.indices.length)return r;const n=who[r.indices[0]];return typeof n==='string'&&n?{...r,speaker:n}:r;};
function staticProvider(root,executable,opts={}){
 // BGI's and scene engines' script is the whole game folder, AIN is a file in it.
 const entry=providerEntry(root,executable,opts.id,{runtimeOnly:true});
 if(!entry?.[1]?.runtime?.file)return null;const [id,state]=entry;
 try{if(!opts.indexOnly&&fingerprint({engine:state.runtime.engine||'system4',target:state.runtime.file})!==state.runtime.sha256)return null;
  if(state.mode==='original'&&state.status==='ready'&&state.original?.index){const og=readIndex(state.original.index),m=new Matcher(readIndex(state.runtime.index).lines,og.lines);
   // The original's own ruby (BGI <R よみ>漢字</R>) for the restored lines: game readings before dictionary ones.
   const readings=Array.isArray(og.ruby)?og.ruby:null,withRuby=r=>{if(!r||!readings||!Array.isArray(r.indices))return r;const pairs=r.indices.flatMap(i=>Array.isArray(readings[i])?readings[i]:[]);return pairs.length?{...r,ruby:pairs}:r;};
   // A patched game shown in Japanese: the patched line itself is the group's translation of the restored line.
   return {kind:'original',resolveJapanese:require('./script-translation-quality.cjs').choiceLookup(og.lines,m.rt),resolveChoice:require('./script-translation-quality.cjs').choiceLookup(og.lines,m.rt,og.roles),hasLocalPairs:()=>og.lines.some((ja,i)=>japaneseLine(ja)&&localTranslation(m.rt[i])),position:()=>m.last,save:()=>m.save(),load:v=>m.load(v),resolve:text=>withSpeaker(withRuby(m.match(text)),og.who)};}
  const patched=state.patchStatus==='ready'&&state.patch?.index&&patchCurrent(state);
  if(!patched&&state.status!=='native-japanese')return null;
  // The Japanese game, with an imported patch or with none: the line stays Japanese; the patch's line at the same place is
  // its translation, and a line the patch leaves as it is (or every line, without a patch) takes the filled translation.
  const rtIndex=readIndex(state.runtime.index),rt=rtIndex.lines,m=new Matcher(rt,patched?readIndex(state.patch.index).lines:rt),fill=fillStore(root,id,scenes.ENGINES[state.runtime.engine]?.live?'live':state.runtime.sha256);
  // The script's own ruby for the matched lines (KiriKiri Z scene files): game readings come before dictionary ones.
  const readings=Array.isArray(rtIndex.ruby)?rtIndex.ruby:null,withRuby=r=>{if(!readings||!Array.isArray(r.indices))return r;const pairs=r.indices.flatMap(i=>Array.isArray(readings[i])?readings[i]:[]);return pairs.length?{...r,ruby:pairs}:r;};
  const untranslated=i=>!patched||rtIndex.roles?.[i]==='i'||!sampler.translated(inlineTags(m.og[i]),inlineTags(rt[i]));
  /* E358: an engine that draws from a fixed glyph set (HuneX bitmap fonts) says which characters it has. drawable(text) is
     null when unknown; tableDrawable() is false when the game cannot draw its own translation table (WoH in Japanese draws
     4.9 % of the official Chinese lines in full), so the game is not asked to draw translations it would leave with holes. */
  let glyphSet,tableOk;const glyphs=()=>{if(glyphSet===undefined){glyphSet=null;try{const g=scenes.ENGINES[state.runtime.engine]?.glyphs?.(path.dirname(String(executable)));if(g&&g.size)glyphSet=g;}catch{}}return glyphSet;};
  const drawable=text=>{const g=glyphs();if(!g)return null;for(const c of String(text||'').replace(/</g,'〈').replace(/>/g,'〉'))if(!/\s/.test(c)&&!g.has(c))return false;return true;};
  const tableDrawable=()=>{if(tableOk===undefined){tableOk=null;if(glyphs()&&patched){let n=0,ok=0;for(let i=0;i<rt.length;i++){const o=m.og[i];if(!o||norm(o)===norm(rt[i]))continue;n++;if(drawable(o))ok++;}tableOk=n===0||ok/n>=.995;}}return tableOk;};
  /* E410: an engine that knows its scripts' page breaks (HuneX) says, per table line, whether it starts a page and whether it
     continues the row the last line ended on. null when unknown (other engines, a line no script shows). */
  let pageSet;const pageInfo=()=>{if(pageSet===undefined){pageSet=null;try{pageSet=scenes.ENGINES[state.runtime.engine]?.pages?.(path.dirname(String(executable)))||null;}catch{}}return pageSet;};
  const flowLayout=indices=>{const P=pageInfo(),i=Array.isArray(indices)?indices[0]:undefined;if(!P||!Number.isSafeInteger(i)||!P.known.has(i))return null;return {index:i,pageStart:P.starts.has(i),row:P.cont.has(i)?'continue':'new'};};
  /* E414: a page game by its own script: at least 15 % of its pages hold more than one line (WoH 70 %, Fata Morgana 20 %). */
  let flowOk;const flowGame=()=>{if(flowOk===undefined){const P=pageInfo();if(!P||!P.starts.size)flowOk=false;else{let multi=0;for(const i of P.starts)if(P.known.has(i+1)&&!P.starts.has(i+1))multi++;flowOk=multi/P.starts.size>=.15;}}return flowOk;};
  /* 2026-11-13 the same script in the game's other languages (scene engines with parallel tables): a captured line in one
     of them gives back its Japanese line; built on first use, never when the engine has none */
  let foreignMap,foreignSeqFn;const foreign=(text,opt)=>{if(foreignMap===undefined){foreignMap=null;try{const f=scenes.ENGINES[state.runtime.engine]?.foreign;if(f){const map=f(path.dirname(String(executable)));if(map&&map.size)foreignMap=map;}}catch{}}if(!foreignMap)return '';const k=foreignKey(text),hit=foreignMap.get(k);if(opt?.fuzzy)return (foreignSeqFn||(foreignSeqFn=foreignSeq(foreignMap)))(text);if(hit||!opt?.prefix||k.length<40)return hit||'';/* a truncated stream sample (thread list keeps 110 chars): the one line it starts */let one='';for(const [key,ja] of foreignMap)if(key.startsWith(k)){if(one&&one!==ja)return '';one=ja;}return one;};
  /* position(): the script line read last (core/hook-native.cjs keeps a repeated line's answer only while it is there) */const api={kind:'patch',patch:!!patched,hasLocalPairs:()=>!!patched&&rt.some((ja,i)=>japaneseLine(ja)&&!untranslated(i)&&localTranslation(m.og[i])),fill,drawable,tableDrawable,position:()=>m.last,save:()=>m.save(),load:v=>m.load(v),flowLayout,flowGame,foreign,ocrSuffix:text=>m.ocrSuffix(text),near:text=>{const i=m.near(text);return i>=0?inlineTags(rt[i]):'';},
   translationIndex:{runtime:state.runtime.sha256,patch:patchCurrent(state)?state.patch.sha256:null},
   // A live hook burst can identify controls before OCR has measured the native glyphs.
   // Only an exact body anchor followed by the whole recorded choice group qualifies.
   choiceGroupAfter(body,options){
    if(!rtIndex.roles||!body||!Array.isArray(options)||options.length<2)return null;
    const key=matchKey(body);
    const anchors=(m.heads.get(key.slice(0,4))||[]).filter(i=>rtIndex.roles[i]==='b'&&norm(rt[i])===norm(body));
    const anchor=anchors.includes(m.last)?m.last:anchors.length===1?anchors[0]:-1;
    if(anchor<0)return null;
    let i=anchor+1;
    while(i<rt.length&&!rt[i]&&rtIndex.roles[i]==='?')i++;
    const group=[];
    while(rtIndex.roles[i]==='c')group.push(rt[i++]);
    const live=new Set(options);
    return group.length===options.length&&new Set(group).size===group.length&&group.every(text=>live.has(text))?group:null;
   },
   matchedBody:text=>rtIndex.roles?.[m.last]==='b'&&norm(rt[m.last])===norm(text),
   resolveChoice:require('./script-translation-quality.cjs').choiceLookup(rt,patched?m.og:[],rtIndex.roles),pageParts:text=>m.pageParts(text),pageNext:(previous,text)=>m.pageNext(previous,text),pageBetween:(previous,packet,next)=>m.pageBetween(previous,packet,next),resolve:text=>withSpeaker(withRuby(resolveLine(text)),rtIndex.who)};
  if(state.runtime.engine==='nitro-pak'&&require('../core/saya-page-ocr.cjs').legacyExe(path.basename(executable))){
   let lookup;
   api.sayaPageLine=(text,mode)=>(lookup??=require('../core/saya-page-ocr.cjs').scriptLookup(rt))(text,mode);
  }
  function resolveLine(text){const r=m.match(text);if(r.japanese===undefined)return r;
    // E449 lines the release leaves in Japanese take the filled translation written for them (fill.cjs), marked filled.
    /* line by line: the patch's line, else its filled translation, else the line translated ahead (script-prefetch keeps
       each script line on its own, so a capture of two lines in one box finds them; a patched line keeps its wording) */
    if(r.indices.some(untranslated)){let machine=false;const parts=r.indices.map(i=>{if(!untranslated(i))return m.og[i];const f=fillLines.lookup(rt[i]);if(f&&f.zh)return f.zh;const t=fill.get(rt[i]);if(t)machine=true;return t||null;});
     if(parts.every(p=>p!=null))return machine?{...r,translation:parts.join(''),japanese:undefined,machine:true}:{...r,translation:parts.join(''),japanese:undefined,filled:true,source:'filled'};
     const t=fill.get(r.indices.map(i=>rt[i]).join(''));return t?{...r,translation:t,japanese:undefined,machine:true}:{status:'none',method:'untranslated',indices:r.indices};}
    return {...r,translation:r.japanese,japanese:undefined,source:'local-script'};}
  return {...api,
   // The next lines after the reading position that still need a translation, each with the lines before it as context.
   upcoming(count=8){if(m.last<0)return [];const out=[];
    for(let i=m.last+1;i<rt.length&&i<=m.last+200&&out.length<count;i++){const t=rt[i];if(!t||!prose(t)||!japaneseLine(t)||!untranslated(i)||fill.has(t))continue;
     const context=[];for(let k=i-1;k>=0&&k>=i-12&&context.length<4;k--)if(rt[k]&&prose(rt[k]))context.unshift(rt[k]);out.push({text:t,context});}
    return out;}};
 }catch{return null;}
}
// ---- Automatic search for the user's own Japanese copy ------------------------------------------
// Looks on local drives for a script with the same name as the running one (another install, a store library,
// a backup disk), then accepts it only if it is Japanese and lines up with the running build. Nothing is downloaded.
const SKIP=/^(windows|\$recycle\.bin|system volume information|programdata|appdata|node_modules|\.git|msocache|recovery|perflogs|winsxs|drivers?store)$/i;
async function findCandidates(base,exclude,{ext='.ain',roots,deadline,maxDirs=250000}){
 const want=(base+ext).toLowerCase(),found=[];let seen=0;const queue=roots.map(dir=>({dir,depth:0}));
 while(queue.length&&Date.now()<deadline&&seen<maxDirs){const {dir,depth}=queue.shift();seen++;let handle;try{handle=await fs.promises.opendir(dir);}catch{continue;}
  try{for await(const entry of handle){const full=path.join(dir,entry.name);if(entry.isDirectory()){if(depth<6&&!SKIP.test(entry.name)&&!entry.name.startsWith('.'))queue.push({dir:full,depth:depth+1});}else if(entry.isFile()&&entry.name.toLowerCase()===want&&path.resolve(dir).toLowerCase()!==exclude)found.push(full);}}catch{}}
 return {found,complete:!queue.length,searched:seen};
}
function localRoots(){const roots=[];for(const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ'){const root=letter+':\\';try{if(fs.statSync(root).isDirectory())roots.push(root);}catch{}}return roots;}
async function discover(root,db,id,options={}){
 const row=gameRow(db,id),state=scanRunning(root,id,row.executable);if(!state.runtime)throw Error(state.error||'NO_SUPPORTED_SCRIPT');
 if(!ADAPTERS[state.runtime.engine||'system4'].marker)return {notFound:true,search:{found:0,complete:true,searched:0,checked:[]}}; // scene engines have no single file to look for
 const engine=state.runtime.engine||'system4',runningDir=runningDirOf(state.runtime),base=ADAPTERS[engine].marker(path.parse(state.runtime.file).name).replace(/\.[^.]+$/,''),exclude=path.resolve(engine==='bgi'&&bgi.arcFiles(runningDir).length?path.dirname(bgi.arcFiles(runningDir)[0]):runningDir).toLowerCase(),runtime=readIndex(state.runtime.index);
 writeState(root,id,{status:'scanning',error:''});
 const search=await findCandidates(base,exclude,{ext:path.extname(ADAPTERS[engine].marker(path.parse(state.runtime.file).name)),roots:options.roots||[runningDir,...localRoots()],deadline:Date.now()+(options.timeout||30000)}),checked=[];
 for(const file of search.found){try{const loc=locate(path.dirname(file),path.parse(state.runtime.file).name);if(!loc||loc.engine!==engine){checked.push({file,result:'other-engine'});continue;}const ain=realign(loc,readScript(loc),runtime,runningDir),japanese=ain.lines.filter(t=>prose(t)&&japaneseLine(t)).length;if(japanese<ain.lines.filter(prose).length*.5){checked.push({file,result:'not-japanese'});continue;}const a=align(runtime,ain);checked.push({file,result:a.reliable?'match':'different-version'});if(a.reliable)return {...importOriginal(root,db,id,path.dirname(file)),search:{...search,found:search.found.length,checked}};}catch(error){checked.push({file,result:String(error.message||error)});}}
 const status=state.original?.index?(readState(root)[id]?.status==='scanning'?'ready':readState(root)[id].status):state.status==='chinese-only'?'chinese-only':'awaiting-original';
 writeState(root,id,{status:state.original?.index?(state.alignment?.reliable?'ready':'unreliable'):status,lastSearch:{at:Date.now(),found:search.found.length,complete:search.complete,searched:search.searched,checked}});
 return {notFound:true,search:{found:search.found.length,complete:search.complete,searched:search.searched,checked}};
}
const localTranslation=text=>typeof text==='string'&&prose(text)&&!japaneseLine(text);
function localPairs(root,db,id){
 const {executable}=gameRow(db,id);
 if(!executable||!fs.existsSync(executable))return {hasPairs:false,embedded:false};
 const embedded=require('./embedded-japanese.cjs'),dir=path.dirname(executable);
 const imported=require('../core/japanese-import-original.cjs'),archive=imported.archiveManifest(dir);
 if(archive){const index=imported.localArchive(executable,archive);return {hasPairs:index?.coverage.paired>0,embedded:false,perGame:!!index};}
 if(embedded.manifest(dir))return {hasPairs:embedded.provider(dir)?.hasLocalPairs?.()===true,embedded:true};
 return {hasPairs:staticProvider(root,executable,{id:String(id)})?.hasLocalPairs?.()===true,embedded:false};
}
module.exports={scriptRuby,contributionScript,backupOriginal,locateBackup,_fillStore:fillStore,providerKey,foreignKey,foreignNear,foreignSeq,scriptPairs,brief,autoPatchLater,autoPatch,buildPatch,collect,nearbyPatchSources,patchHint,importPatch,importPatchSource,clearPatch,locate,readScript,ADAPTERS,readAin,_ain:{mtXor,inflateAin},align,Matcher,importOriginal,status,setMode,provider,localPairs,scanRunning,japaneseLine,chineseOnly,norm,discover,findCandidates};
