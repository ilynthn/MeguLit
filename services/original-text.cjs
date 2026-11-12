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
const matchKey=s=>norm(inlineTags(s)).replace(/≪([^≪≫／]*)／[^≪≫]*≫/g,'$1').replace(SPEAKER,'').replace(/[●○◯〇＊*■□]/g,'●');
const japaneseLine=t=>{const k=(t.match(KANA)||[]).length,h=(t.match(HAN)||[]).length;return k>=2&&k>=h*.2;};
// Lines that carry language at all (not file names, labels or numbers): what the Japanese / translated share is measured on.
const prose=t=>/[^\x00-\x7f]/.test(t)&&!!String(t).trim();
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
function mtXor(src,seed){const b=Buffer.from(src),N=624,M=397,st=new Uint32Array(N);st[0]=seed>>>0;for(let i=1;i<N;i++)st[i]=Math.imul(69069,st[i-1])>>>0;let k=N;
 for(let i=0;i<b.length;i++){if(k>=N){for(let j=0;j<N;j++){const y=(st[j]&0x80000000)|(st[(j+1)%N]&0x7fffffff);st[j]=st[(j+M)%N]^(y>>>1)^(y&1?0x9908b0df:0);}k=0;}
  let y=st[k++];y^=y>>>11;y^=(y<<7)&0x9d2c5680;y^=(y<<15)&0xefc60000;y^=y>>>18;b[i]^=y&255;}
 return b;}
const AIN_SEED=0x5D3E3;
function plainAin(b){if(b.length<8)return null;const h=mtXor(b.subarray(0,8),AIN_SEED);if(h.toString('latin1',0,4)!=='VERS'||h[5]||h[6]||h[7])return null;return mtXor(b,AIN_SEED);}
function inflateAin(file){const b=Buffer.isBuffer(file)?file:fs.readFileSync(file);if(b.subarray(0,4).toString('latin1')==='VERS')return b;if(b.subarray(0,4).toString('latin1')!=='AI2\0'){const p=plainAin(b);if(p)return p;throw Error('UNSUPPORTED_AIN_CONTAINER');}const size=b.readUInt32LE(8),packed=b.readUInt32LE(12),d=zlib.inflateSync(b.subarray(16,16+packed));if(d.length!==size)throw Error('AIN_SIZE_MISMATCH');return d;}
/* A tag can also occur inside the code or another table: take the first occurrence whose table reads to its end. */
function section(d,tag,read){let last=null;for(let at=d.indexOf(tag);at>=0;at=d.indexOf(tag,at+1)){if(at+8>d.length)break;try{const out=read(at);if(out)return out;}catch(e){last=e;}}if(last)throw last;return null;}
function strings(d,tag){return section(d,tag,at=>{let p=at+4;const n=d.readUInt32LE(p);p+=4;if(n>4e6)return null;const out=[];for(let i=0;i<n;i++){const e=d.indexOf(0,p);if(e<0)throw Error('AIN_TRUNCATED_'+tag);out.push(d.subarray(p,e));p=e+1;}return out;});}
// One code page per file: a Chinese patch stores everything (its leftover Japanese too) as GBK, an original as Shift-JIS.
function codepage(buffers){const sample=buffers.filter(b=>b.length>3).slice(0,4000),score=enc=>{const dec=new TextDecoder(enc);let bad=0,kana=0;for(const b of sample){const t=dec.decode(b);bad+=(t.match(/�/g)||[]).length;kana+=(t.match(KANA)||[]).length;}return {enc,bad,kana};};const [sj,gbk]=[score('shift_jis'),score('gbk')];return sj.bad<gbk.bad||sj.bad===gbk.bad&&sj.kana>=gbk.kana?'shift_jis':'gbk';}
function msg1(d){return section(d,'MSG1',at=>{let p=at+4;const n=d.readUInt32LE(p);p+=8;if(n>4e6)return null;const out=[];for(let i=0;i<n;i++){if(p+4>d.length)throw Error('AIN_TRUNCATED_MSG1');const len=d.readUInt32LE(p);p+=4;if(p+len>d.length)throw Error('AIN_TRUNCATED_MSG1');const b=Buffer.from(d.subarray(p,p+len));for(let k=0;k<len;k++)b[k]=(b[k]-k-0x60)&255;out.push(b);p+=len;}return out;});}
function readAin(file){
 const d=inflateAin(file),version=d.subarray(0,4).toString('latin1')==='VERS'?d.readUInt32LE(4):0,raw=strings(d,'MSG0')||msg1(d);if(!raw)throw Error('AIN_MESSAGES_MISSING');
 const enc=codepage(raw),dec=new TextDecoder(enc),lines=raw.map(b=>dec.decode(b)),names=(strings(d,'FNAM')||[]).map(b=>b.toString('latin1'));
 return {engine:'system4',version,codepage:enc,lines,structure:{messages:lines.length,functions:names.length,functionHash:crypto.createHash('sha256').update(names.join('\0')).digest('hex').slice(0,16)}};
}
// ---- Paths and state --------------------------------------------------------------------------
const stateFile=root=>path.join(root,'data/config/original-text.json');
const indexDir=(root,id)=>path.join(root,'data/original-text',crypto.createHash('sha256').update(String(id)).digest('hex').slice(0,16));
function readState(root){try{return JSON.parse(fs.readFileSync(stateFile(root),'utf8'))||{};}catch{return {};}}
function writeState(root,id,patch){const all=readState(root);all[id]={...all[id],...patch,updatedAt:Date.now()};fs.mkdirSync(path.dirname(stateFile(root)),{recursive:true});fs.writeFileSync(stateFile(root)+'.tmp',JSON.stringify(all,null,1));fs.renameSync(stateFile(root)+'.tmp',stateFile(root));return all[id];}
function writeIndex(root,id,name,value){const dir=indexDir(root,id);fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,name);fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);return file;}
function readIndex(file){const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.schema!==SCHEMA)throw Error('ORIGINAL_INDEX_SCHEMA');return value;}
function ainOf(dir,base){const files=fs.readdirSync(dir).filter(f=>/\.ain$/i.test(f)&&!/beifen|backup|\.bak/i.test(f));const preferred=files.find(f=>path.parse(f).name.toLowerCase()===String(base||'').toLowerCase());return preferred?path.join(dir,preferred):files.length===1?path.join(dir,files[0]):'';}
const bgi=require('./original-engines/bgi.cjs');
const ADAPTERS={
 system4:{marker:base=>base+'.ain',locate:(dir,base)=>{const file=ainOf(dir,base);return file?{engine:'system4',target:file}:null;},read:target=>readAin(target),fingerprint:target=>sha256(target)},
 bgi:{folder:true,marker:()=>'data01000.arc',locate:dir=>{try{const arcs=fs.readdirSync(dir).filter(f=>/^data0\d{4}\.arc$/i.test(f));if(!arcs.length)return null;const head=Buffer.alloc(12),fd=fs.openSync(path.join(dir,arcs[0]),'r');try{fs.readSync(fd,head,0,12,0);}finally{fs.closeSync(fd);}return ['BURIKO ARC20','PackFile    '].includes(head.toString('latin1'))?{engine:'bgi',target:dir}:null;}catch{return null;}},
  read:dir=>{const scenes=bgi.scan(dir),lines=scenes.flatMap(x=>x.lines),ruby=scenes.some(x=>x.ruby?.some(Boolean))?scenes.flatMap(x=>x.ruby||x.lines.map(()=>null)):undefined;return {engine:'bgi',version:0,codepage:'shift_jis',lines,ruby,sizes:scenes.map(x=>x.lines.length),structure:{messages:lines.length,functions:scenes.length,functionHash:crypto.createHash('sha256').update(scenes.map(x=>x.name+':'+x.lines.length).join('\n')).digest('hex').slice(0,16)}};},
  fingerprint:dir=>crypto.createHash('sha256').update('bgi-code-order\n'+fs.readdirSync(dir).filter(f=>/^data0\d{4}\.arc$/i.test(f)).sort().map(f=>{const st=fs.statSync(path.join(dir,f));return f+'|'+st.size+'|'+st.mtimeMs;}).join('\n')).digest('hex')}};
// E280: engines read as scene files (KiriKiri, Artemis, Ren'Py); their script is the game folder like BGI's.
const scenes=require('./original-engines/scenes.cjs'),fillLines=require('./original-engines/fill.cjs');
for(const id of Object.keys(scenes.ENGINES))ADAPTERS[id]={folder:true,scene:true,locate:dir=>scenes.readable(id,dir)?{engine:id,target:dir}:null,
 read:dir=>{const list=scenes.read(id,dir),lines=list.flatMap(x=>x.lines),ruby=list.some(x=>x.ruby)?list.flatMap(x=>x.ruby||x.lines.map(()=>null)):undefined;return {engine:id,version:0,codepage:'text',lines,ruby,sizes:list.map(x=>x.lines.length),structure:{messages:lines.length,functions:list.length,functionHash:crypto.createHash('sha256').update(list.map(x=>x.name+':'+x.lines.length).join('\n')).digest('hex').slice(0,16)}};},
 fingerprint:dir=>scenes.fingerprint(id,dir)};
const runningDirOf=runtime=>ADAPTERS[runtime.engine||'system4']?.folder?runtime.file:path.dirname(runtime.file);
function locate(dir,base){for(const adapter of Object.values(ADAPTERS)){const found=adapter.locate(dir,base);if(found)return found;}return null;}
const readScript=loc=>ADAPTERS[loc.engine].read(loc.target),fingerprint=loc=>ADAPTERS[loc.engine].fingerprint(loc.target);
function gameRow(db,id){const row=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(String(id));if(!row)throw Error('GAME_NOT_FOUND');return row;}

// ---- Running build: what the installed (patched) game still contains ---------------------------
function scanRunning(root,id,executable){
 const dir=path.dirname(executable),loc=locate(dir,path.parse(executable).name);if(!loc){const waiting=scenes.preparing(dir);return writeState(root,id,waiting?{status:'preparing',error:'SCRIPT_PREPARING',preparing:waiting,runtime:null,gameDir:dir}:(()=>{const why=scenes.unsupportedReason(dir);return why?{status:'unsupported',error:why.code,detail:why.detail,engine:why.engine,preparing:null,runtime:null,gameDir:dir}:{status:'unsupported',error:'NO_SUPPORTED_SCRIPT',detail:'',preparing:null,runtime:null,gameDir:dir};})());}const file=loc.target;
 const hash=fingerprint(loc),current=readState(root)[id];if(current?.runtime?.sha256===hash&&current.runtime.index&&fs.existsSync(current.runtime.index))return current;
 const ain=readScript(loc),japanese=ain.lines.filter(t=>prose(t)&&japaneseLine(t)).length,nonEmpty=ain.lines.filter(prose).length,zhOnly=chineseOnly(ain.lines);
 // An English (or other) original read by a scene engine is neither the Japanese game nor a Chinese build: nothing to do.
 if(ADAPTERS[loc.engine].scene&&!zhOnly){const chinese=ain.lines.filter(t=>prose(t)&&!japaneseLine(t)&&/[一-鿿]{2}/.test(t)).length;if(!nonEmpty||japanese<nonEmpty*.5&&chinese<nonEmpty*.3)return writeState(root,id,{status:'unsupported',error:'SCRIPT_NOT_JAPANESE',runtime:null,gameDir:dir});}
 const index=writeIndex(root,id,'runtime-'+hash.slice(0,16)+'.json',{schema:SCHEMA,role:'runtime',engine:ain.engine,version:ain.version,codepage:ain.codepage,source:{file,sha256:hash},structure:ain.structure,lines:ain.lines,...(ain.ruby?{ruby:ain.ruby}:{}),...(ain.sizes?{sizes:ain.sizes}:{})});
 const original=current?.original;const runtime={file,engine:loc.engine,sha256:hash,index,codepage:ain.codepage,version:ain.version,structure:ain.structure,lines:nonEmpty,japaneseLines:japanese};
 // A changed game build invalidates the earlier alignment; the original index itself stays.
 return writeState(root,id,{engine:loc.engine,runtime,status:zhOnly&&!original?.index?'chinese-only':!zhOnly&&japanese>=nonEmpty*.5?'native-japanese':original?.index&&current?.runtime?.sha256===hash?current.status:original?.index?'needs-recheck':'awaiting-original'});
}
// ---- Original import and alignment -------------------------------------------------------------
function align(runtime,original){
 const sameStructure=runtime.structure.messages===original.structure.messages&&runtime.structure.functionHash===original.structure.functionHash;
 let kept=0,equal=0;const n=Math.min(runtime.lines.length,original.lines.length);
 // Lines the patch left in Japanese must equal the original at the same index; this measures the layout empirically.
 for(let i=0;i<n;i++){const t=runtime.lines[i];if(!t.trim()||!japaneseLine(t))continue;kept++;if(norm(t)===norm(original.lines[i]))equal++;}
 const rate=kept?equal/kept:null,reliable=sameStructure&&(rate===null||rate>=.98);
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
function pairCheck(zh,ja,{into='zh',zhSizes,jaSizes,ruby,structureOk=true}={}){
 const v=sampler.verify(zh,ja,{into,zhSizes,jaSizes,ruby,force:!structureOk});
 return {verdict:v,report:sampler.report(v)};
}
function importOriginal(root,db,id,dir){
 const row=gameRow(db,id);if(typeof dir!=='string'||!path.isAbsolute(dir)||!fs.statSync(dir,{throwIfNoEntry:false})?.isDirectory())throw Error('INVALID_ORIGINAL_DIRECTORY');
 if(path.resolve(dir).toLowerCase()===path.dirname(row.executable).toLowerCase())throw Error('ORIGINAL_IS_RUNNING_COPY');
 writeState(root,id,{status:'scanning',error:''});
 try{
  const state=scanRunning(root,id,row.executable);if(!state.runtime)throw Error(state.error||'NO_SUPPORTED_SCRIPT');
  const loc=locate(dir,path.parse(state.runtime.file).name);if(!loc||loc.engine!==(state.runtime.engine||'system4'))throw Error('ORIGINAL_SCRIPT_NOT_FOUND');const file=loc.target;
  const hash=fingerprint(loc);if(hash===state.runtime.sha256)throw Error('ORIGINAL_SAME_AS_RUNNING');
  const runtime=readIndex(state.runtime.index);let ain=realign(loc,readScript(loc),runtime,runningDirOf(state.runtime));const japanese=ain.lines.filter(t=>prose(t)&&japaneseLine(t)).length;
  // Never accept a translated file as the original: most of its lines must be Japanese.
  if(japanese<ain.lines.filter(prose).length*.5)throw Error('ORIGINAL_NOT_JAPANESE');
  let alignment=align(runtime,{...ain,structure:ain.structure});
  const pc=pairCheck(runtime.lines,ain.lines,{zhSizes:runtime.sizes,jaSizes:ain.sizes,ruby:ain.ruby,structureOk:alignment.sameStructure});
  if(pc.verdict.lines){ain={...ain,lines:pc.verdict.lines,ruby:pc.verdict.ruby?.some(Boolean)?pc.verdict.ruby:undefined,structure:runtime.structure,sizes:runtime.sizes};alignment=align(runtime,ain);}
  alignment={...alignment,reliable:alignment.reliable&&pc.verdict.ok,pairing:pc.report};
  const index=writeIndex(root,id,'original-'+hash.slice(0,16)+'.json',{schema:SCHEMA,role:'original',engine:ain.engine,version:ain.version,codepage:ain.codepage,source:{file,sha256:hash,dir},structure:ain.structure,lines:ain.lines,...(Array.isArray(ain.ruby)?{ruby:ain.ruby}:{})});
  const exe=fs.readdirSync(dir).find(f=>/\.exe$/i.test(f)&&path.parse(f).name.toLowerCase()===path.parse(row.executable).name.toLowerCase());
  return writeState(root,id,{original:{dir,file,sha256:hash,index,codepage:ain.codepage,lines:ain.lines.length,executable:exe?path.join(dir,exe):''},alignment,status:alignment.reliable?'ready':'unreliable',mode:readState(root)[id]?.mode||(alignment.reliable?'original':'off'),error:''});
 }catch(error){writeState(root,id,{status:'failed',error:String(error.message||error)});throw error;}
}
// ---- Chinese patch import (user, 2026-11-09): the game runs in Japanese and a translation group's patch is imported --
// The patch's script is read with the same engine adapter and lined up with the running Japanese script; the patch's
// line i then is the translation of Japanese line i (zero-latency bilingual, the group's own wording).
// E280 (user, 2026-11-10: no manual import): a patch can be a folder (the patch itself, an unpacked archive, a whole
// Chinese install), loose scene files next to the game, or one program with everything packed inside by Enigma Virtual
// Box (素晴らしき日々's BGI-CHS.exe). Ports that keep the Japanese code page and draw Chinese through a remapped font
// are decoded with that font (font-unmap.cjs). autoPatch looks for all of these by itself.
const evb=require('./original-engines/evb.cjs'),fontUnmap=require('./original-engines/font-unmap.cjs');
const FONT=/\.(?:ttf|ttc|otf)$/i,SKIP_DIR=/^(save|savedata|userdata|\.megulit|megulit-original-backup)$/i;
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
 if(st?.isFile()){if(/\.exe$/i.test(source)&&isEvb(source))addEvb(source);walk(path.dirname(source),/\.exe$/i.test(source)?0:depth);}
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
 const found=collect(source);let script,patched=0,translated=null;
 if(engine==='system4'){
  const want=path.basename(runningFile).toLowerCase(),files=[...found.files.values()].filter(f=>/\.ain$/i.test(f.name)&&!(f.path&&sameDir(path.dirname(f.path),runningDir)));
  const file=files.find(f=>f.name.toLowerCase()===want)||(files.length===1?files[0]:null);
  if(!file)throw Error('PATCH_SCRIPT_NOT_FOUND');
  const data=file.read();if(sha256Buffer(data)===runningState.runtime.sha256)throw Error('PATCH_SAME_AS_RUNNING');
  script=readAin(data);patched=1;
 }else if(engine==='bgi'){
  const base=bgi.scan(runningDir),names=new Set(base.map(x=>x.name.toLowerCase())),overlay=new Map();
  for(const [key,f] of found.files){if(!names.has(key))continue;let data;try{data=f.read();}catch{continue;}if(bgi.isScript(data))overlay.set(key,data);}
  for(const dir of found.dirs){if(sameDir(dir,runningDir))continue;let arcs=[];try{arcs=fs.readdirSync(dir).filter(f=>/^data0\d{4}\.arc$/i.test(f));}catch{}
   for(const name of arcs){let entries;try{entries=bgi.readArc(path.join(dir,name));}catch{continue;}for(const e of entries||[]){const key=e.name.toLowerCase();if(names.has(key)&&!overlay.has(key)&&bgi.isScript(e.data))overlay.set(key,Buffer.from(e.data));}}}
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
  if(eng.patchLines)list=eng.patchLines(base,found);
  if(!list&&eng.patchLines&&!eng.archives)throw Error('PATCH_SCRIPT_NOT_FOUND');
  if(!list){
   const names=new Set(base.map(x=>x.name.toLowerCase())),overlay=new Map();
   for(const [key,f] of found.files){if(!names.has(key)||!eng.test(f.name)||f.path&&sameDir(path.dirname(f.path),runningDir))continue;try{overlay.set(key,f.read());}catch{}}
   for(const dir of found.dirs){if(sameDir(dir,runningDir))continue;let items=[];try{items=eng.archives(dir);}catch{}for(const item of items){const key=item.name.toLowerCase();if(names.has(key)&&!overlay.has(key))try{overlay.set(key,item.read());}catch{}}}
   if(!overlay.size)throw Error('PATCH_SCRIPT_NOT_FOUND');
   // File by file: same number of text lines and the same anchors (commands, labels, file names), else the running text.
   list=scenes.read(engine,runningDir,overlay).map((scene,i)=>{const own=base[i];if(!scene.patched||!own||own.name!==scene.name)return own||scene;
    if(scene.lines.length!==own.lines.length)return {...own,patched:false,skipped:'count'};
    const n=Math.min(scene.anchors.length,own.anchors.length);let same=0;for(let k=0;k<n;k++)if(scene.anchors[k]===own.anchors[k])same++;
    if(own.anchors.length>=5&&(Math.abs(scene.anchors.length-own.anchors.length)>own.anchors.length*.1||same<own.anchors.length*.9))return {...own,patched:false,skipped:'anchors'};
    return scene;});
  }
  list=list.map((scene,i)=>scene.patched?{...scene,lines:scene.lines.map((t,k)=>japaneseLine(t)?base[i].lines[k]:t)}:scene);
  const lines=list.flatMap(x=>x.lines);patched=list.filter(x=>x.patched).length;if(!patched)throw Error('PATCH_SCRIPT_NOT_FOUND');
  translated=list.filter(x=>x.patched).flatMap(x=>x.lines);
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
 return {script,patched,sources:found.sources};
}
function importPatch(root,db,id,source,{auto=false,executable}={}){
 const row=executable?{executable}:gameRow(db,id);if(typeof source!=='string'||!path.isAbsolute(source)||!fs.statSync(source,{throwIfNoEntry:false}))throw Error('INVALID_PATCH_DIRECTORY');
 // A picked script file stands for its folder (the folder may hold more than that one file).
 if(fs.statSync(source).isFile()&&!/\.exe$/i.test(source))source=path.dirname(source);
 const state=scanRunning(root,id,row.executable);if(!state.runtime)throw Error(state.error||'NO_SUPPORTED_SCRIPT');
 let built;try{built=buildPatch(state,source);}catch(error){
  // Nothing besides the game itself in its own folder: say that the game's folder was picked.
  if(error.message==='PATCH_SCRIPT_NOT_FOUND'&&fs.statSync(source).isDirectory()&&sameDir(source,path.dirname(row.executable)))throw Error('PATCH_IS_RUNNING_COPY');throw error;}
 let {script}=built;const {patched,sources}=built,runtime=readIndex(state.runtime.index);
 // Lines the patch left in Japanese must equal the running script at the same index (same measure as the original import).
 let alignment=align({...script,structure:script.structure},runtime);
 const pc=pairCheck(script.lines,runtime.lines,{into:'ja',zhSizes:script.sizes,jaSizes:runtime.sizes,structureOk:alignment.sameStructure});
 if(pc.verdict.lines){script={...script,lines:pc.verdict.lines};alignment=align({...script,structure:script.structure},runtime);}
 alignment={...alignment,reliable:alignment.reliable&&pc.verdict.ok,pairing:pc.report};
 const hash=patchFingerprint(source),isDir=fs.statSync(source).isDirectory();
 const index=writeIndex(root,id,'patch-'+hash.slice(0,16)+'.json',{schema:SCHEMA,role:'patch',engine:script.engine,version:script.version,codepage:script.codepage,source:{file:source,sha256:hash,sources},structure:script.structure,lines:script.lines});
 return writeState(root,id,{patch:{dir:isDir?source:path.dirname(source),source,file:source,sha256:hash,index,lines:script.lines.length,scenes:patched,fontMapped:!!script.fontMapped,auto,runtimeSha:state.runtime.sha256,version:PATCH_VERSION},patchAlignment:alignment,patchStatus:alignment.reliable?'ready':'unreliable',patchSearch:{...state.patchSearch,running:false,declined:false},error:''});
}
// Where a patch may already be on this computer, nearest first: the game folder (packed programs, loose scenes, patch
// subfolders), the other folders next to it, then the same script elsewhere on local drives.
function nearbyPatchSources(executable){
 const dir=path.dirname(executable),parent=path.dirname(dir),out=[];
 /* E328 a game switched to Japanese by MeguLit keeps the files it replaced (the translation patch) in its backup
    folders; those are the patch, so they are tried first and zero-latency translation follows the Japanese import. */
 for(const rel of ['.megulit-japanese-import/files','.megulit-japanese/yuris','.megulit-japanese/dat']){const b=path.join(dir,rel);try{if(fs.statSync(b).isDirectory())out.push(b);}catch{}}
 out.push(dir);
 try{for(const e of fs.readdirSync(parent,{withFileTypes:true}))if(e.isDirectory()&&!sameDir(path.join(parent,e.name),dir)&&!SKIP_DIR.test(e.name))out.push(path.join(parent,e.name));}catch{}
 return out;
}
// Bumped when the way patches are read changes; older stored patches are rebuilt before use.
/* 3: KiriKiri cx Chinese slot found by its text, ASCII-quoted slots take the Japanese brackets (2026-11-13) */
const PATCH_VERSION=3;
const autoRuns=new Map();
// Fire and forget, with its own database handle (callers' handles close when their request ends).
function autoPatchLater(root,id,done,options={}){
 id=String(id);if(autoRuns.has(id))return autoRuns.get(id).then(done,()=>{});
 let db;try{db=require('./store.cjs').openStore(root);}catch{return Promise.resolve();}
 return autoPatch(root,db,id,options).then(done,()=>{}).finally(()=>{try{db.close();}catch{}});
}
function autoPatch(root,db,id,options={}){
 id=String(id);if(autoRuns.has(id))return autoRuns.get(id);
 const run=(async()=>{
  const row=gameRow(db,id);let state=scanRunning(root,id,row.executable);if(!state.runtime||state.status!=='native-japanese')return {skipped:'not-japanese'};
  // A stored patch whose running script changed (game update, new line order) is rebuilt from where it was found.
  // A stored patch built by an older reader (E286: a name column taken for the translation) is rebuilt the same way.
  /* A pairing made for another running script (the game's files restored or updated: Summer Pockets after its Japanese
     restore was undone, 2026-11-13) pairs nothing; when its source folder is gone too it is searched for again. */
  const stale=state.patch&&state.patch.version!==PATCH_VERSION,outdated=!!state.patch&&state.patch.runtimeSha!==state.runtime.sha256;
  if(state.patch?.source&&(stale||state.patchStatus!=='ready'||outdated)&&fs.existsSync(state.patch.source)){
   try{const r=importPatch(root,db,id,state.patch.source,{auto:!!state.patch.auto});if(r.patchStatus==='ready')return {found:state.patch.source,rebuilt:true};}catch{}
   if(stale||state.patchStatus==='ready'){state=writeState(root,id,{patch:null,patchAlignment:null,patchStatus:'none',patchSearch:{...state.patchSearch,at:0}});options={...options,force:true};}}
  else if(state.patch&&(stale||outdated)&&state.patchStatus==='ready'){state=writeState(root,id,{patch:null,patchAlignment:null,patchStatus:'none',patchSearch:{...state.patchSearch,at:0}});options={...options,force:true};}
  if(state.patchStatus==='ready')return {kept:true};
  if(state.patchSearch?.declined&&!options.force)return {declined:true};
  const recent=state.patchSearch?.at&&Date.now()-state.patchSearch.at<(options.maxAge??864e5)&&state.patchSearch.runtimeSha===state.runtime.sha256;
  if(recent&&!options.force)return {cached:true};
  writeState(root,id,{patchSearch:{...state.patchSearch,running:true,declined:false,at:Date.now()}});
  const tried=new Set();let found=null;
  const attempt=source=>{const key=path.resolve(source).toLowerCase();if(found||tried.has(key))return;tried.add(key);try{const r=importPatch(root,db,id,source,{auto:true});if(r.patchStatus==='ready')found=source;}catch{}};
  try{
   for(const source of nearbyPatchSources(row.executable))attempt(source);
   if(!found&&options.drives!==false&&ADAPTERS[state.runtime.engine||'system4'].marker){
    const engine=state.runtime.engine||'system4',marker=engine==='system4'?path.basename(state.runtime.file):'sysprg.arc';
    const search=await findCandidates(path.parse(marker).name,path.dirname(row.executable).toLowerCase(),{ext:path.extname(marker),roots:options.roots||localRoots(),deadline:Date.now()+(options.timeout||30000)});
    for(const file of search.found)attempt(path.dirname(file));
   }
  }finally{
   const now=readState(root)[id]||{};
   writeState(root,id,{patchSearch:{at:Date.now(),running:false,declined:false,found:!!found,source:found||'',tried:tried.size,runtimeSha:now.runtime?.sha256||''},...(found||now.patchStatus==='ready'?{}:{patchStatus:'none',patch:null})});
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
 if(s.status==='native-japanese')return s.patchStatus==='ready'?'patch':'machine';
 if(s.status==='ready')return 'patch';if(s.status==='awaiting-original'||s.status==='chinese-only'||s.status==='needs-recheck')return 'needs-japanese';
 if(s.status==='preparing')return 'preparing';return 'none';}
function status(root,db,id){
 const row=gameRow(db,id),saved=readState(root)[id];let state=saved;
 try{if(!saved?.runtime||!fs.existsSync(saved.runtime.file)||saved.runtime.sha256!==fingerprint({engine:saved.runtime.engine||'system4',target:saved.runtime.file}))state=scanRunning(root,id,row.executable);}catch(error){state={...saved,status:'failed',error:String(error.message||error)};}
 /* Live test 2026-11-13 (Summer Pockets, 魔法少女ノ魔女裁判, DDLC Plus): patches aligned before E496 had no pairing report, so the
    game page could not say total/paired/unpaired. Sample it once from the saved indexes; the verdict is reported, the state kept. */
 try{if(state?.patchStatus==='ready'&&state.patch?.index&&state.runtime?.index&&state.patchAlignment&&!state.patchAlignment.pairing){const z=readIndex(state.patch.index),j=readIndex(state.runtime.index);if(z.lines.length===j.lines.length){const pc=pairCheck(z.lines,j.lines,{into:'ja',zhSizes:z.sizes,jaSizes:j.sizes,structureOk:state.patchAlignment.sameStructure!==false});state=writeState(root,id,{patchAlignment:{...state.patchAlignment,pairing:pc.report}});}}}catch{}
 const {index:_a,...runtime}=state?.runtime||{},{index:_b,...original}=state?.original||{};
 const patchInfo=state?.patch?{dir:state.patch.dir,file:state.patch.file,source:state.patch.source||state.patch.file,lines:state.patch.lines,auto:!!state.patch.auto,fontMapped:!!state.patch.fontMapped}:null;
 /* E288 (user: the dialog stayed on 正在查找 for good after removing a patch): every status poll starts autoPatchLater, so
    an entry in autoRuns says nothing; only a search that really scans (it records running) counts, for two minutes at most. */
 const searching=!!state?.patchSearch?.running&&Date.now()-(state.patchSearch.at||0)<120000,patchSearch=state?.patchSearch||searching?{running:searching,found:!!state?.patchSearch?.found,at:state?.patchSearch?.at||0,declined:!!state?.patchSearch?.declined}:null;
 return {preparing:state?.status==='preparing'?state.preparing||null:null,patchSearch,patchHint:patchHint(state?.runtime),gameDir:path.dirname(row.executable),patch:patchInfo,patchStatus:state?.patchStatus||'none',patchAlignment:state?.patchAlignment||null,engine:state?.engine||'',status:state?.status||'unsupported',mode:state?.mode||'off',error:state?.error||'',lastSearch:state?.lastSearch?{at:state.lastSearch.at,found:state.lastSearch.found,searched:state.lastSearch.searched,complete:state.lastSearch.complete}:null,runtime:state?.runtime?runtime:null,original:state?.original?original:null,alignment:state?.alignment||null};
}
function setMode(root,id,mode){if(!['off','original'].includes(mode))throw Error('INVALID_TEXT_MODE');const s=readState(root)[id];if(mode==='original'&&s?.status!=='ready')throw Error('ORIGINAL_NOT_READY');return writeState(root,id,{mode});}

// ---- Matching captured text to original lines --------------------------------------------------
// Captured text is one or more consecutive message lines. Exact cover of the text by consecutive runtime lines is
// required; repeated lines ("はい", "……") are resolved by the reading position, never by content alone.
class Matcher{
 constructor(runtimeLines,originalLines){this.rt=runtimeLines;this.og=originalLines;this.normalized=runtimeLines.map(matchKey);this.heads=new Map();this.normalized.forEach((t,i)=>{if(!t)return;const k=t.slice(0,4);if(!this.heads.has(k))this.heads.set(k,[]);this.heads.get(k).push(i);});this.last=-1;}
 cover(start,s){let at=0,i=start;const used=[];while(at<s.length&&i<this.normalized.length){const t=this.normalized[i];if(!t){i++;continue;}if(!s.startsWith(t,at))return null;used.push(i);at+=t.length;i++;}return at===s.length?used:null;}
 match(text){
  const s=matchKey(text);if(!s)return {status:'none',method:'empty'};const starts=new Set();for(let k=Math.min(4,s.length);k>=1;k--)for(const i of this.heads.get(s.slice(0,k))||[])if(s.startsWith(this.normalized[i]))starts.add(i);
  const found=[...starts].map(i=>this.cover(i,s)).filter(Boolean);if(!found.length)return {status:'none',method:'no-cover'};
  let pick,method,status;
  if(found.length===1){pick=found[0];method='unique';status='exact';}
  else{const ahead=found.filter(c=>c[0]>this.last&&c[0]-this.last<=400).sort((a,b)=>a[0]-b[0]);if(this.last>=0&&ahead.length){pick=ahead[0];method='position';status='high';}else return {status:'uncertain',method:'repeated',candidates:found.length};}
  this.last=pick.at(-1);const named=SPEAKER.test(norm(text)),original=pick.map((i,k)=>{const o=inlineTags(this.og[i]??'');return k||named||!SPEAKER.test(norm(this.rt[i]))?o:o.replace(/^s*/,'').replace(SPEAKER,'');}),already=pick.every(i=>japaneseLine(this.rt[i]));
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
 return {get:text=>map.get(norm(text)),has:text=>map.has(norm(text)),set(text,value){map.set(norm(text),String(value));if(!timer)timer=setTimeout(save,2000);timer.unref?.();},flush(){if(timer){clearTimeout(timer);save();}},size:()=>map.size};
}
// E293/E296 scripts the game hands over while it runs (kirikiri-dump: KiriKiri Z scene files with the game's own Chinese;
// kirikiri-ks: a packed Chinese build's scripts, with the Japanese ones as the original): the provider rebuilds the
// running script and its counterpart when the capture folder changes, so a new scene reads from its first line. A miss
// re-checks at once; otherwise the rebuild runs between lines. Until something is saved every line goes the usual way.
const liveEngines=()=>Object.values(scenes.ENGINES).filter(e=>e.live);
const foreignKey=t=>String(t||'').replace(/<[^>]*>/g,'').replace(/[\s\u3000"'“”‘’.,!?…—–-]+/g,'').toLowerCase();
function liveProvider(root,id,executable){
 const engine=liveEngines()[0],dir=path.dirname(String(executable));let inner=null,stamp=null,checked=0,timer=null;
 const rebuild=()=>{const now=engine.stamp(dir);if(now===stamp)return false;stamp=now;
  try{let state=scanRunning(root,id,executable);const eng=scenes.ENGINES[state.runtime?.engine];
   if(state.runtime&&eng?.live){
    const fresh=state.patchStatus==='ready'&&state.patch?.runtimeSha===state.runtime.sha256&&state.patch.version===PATCH_VERSION;
    if(eng.patchLines&&state.status==='native-japanese'&&!fresh)try{importPatch(root,null,id,dir,{auto:true,executable});}catch{}
    if(eng.originalLines&&state.status!=='native-japanese')try{state=adoptOriginal(root,id,state,dir);}catch{}
    pruneIndexes(root,id);}
   inner=staticProvider(root,executable);}catch{inner=null;}
  return true;};
 const later=()=>{if(timer)return;timer=setTimeout(()=>{timer=null;rebuild();},400);timer.unref?.();};
 const changed=()=>{checked=Date.now();return engine.stamp(dir)!==stamp;};
 rebuild();
 return {live:true,get kind(){return inner?.kind||'patch';},get patch(){return !!inner?.patch;},get fill(){return inner?.fill;},
  resolve(text){if(Date.now()-checked>300&&changed())later();let r=inner?inner.resolve(text):{status:'none',method:'no-scenes'};
   if(r.status==='none'&&r.method!=='empty'&&changed()&&rebuild()&&inner)r=inner.resolve(text);return r;},
  foreign(text,opt){return inner?.foreign?inner.foreign(text,opt):'';},
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
function provider(root,executable){
 const dir=path.dirname(String(executable)).toLowerCase(),entry=Object.entries(readState(root)).find(([,s])=>s?.runtime?.file?runningDirOf(s.runtime).toLowerCase()===dir:String(s?.gameDir||'').toLowerCase()===dir);
 if(!entry)return null;
 const gameDir=path.dirname(String(executable));
 if(scenes.ENGINES[entry[1].runtime?.engine]?.live||!entry[1].runtime&&liveEngines().some(e=>e.eligible(gameDir)))return liveProvider(root,entry[0],executable);
 return staticProvider(root,executable);
}
/* Learning (grammar examples, 2026-11-11): the imported script as index-aligned pairs, read-only (no import, no
   rebuild). ja[i] is the Japanese line, tr[i] its human translation or '' (a patch line left in Japanese is none);
   source is 'official' for a Chinese release with its Japanese original, 'group' for a translation group's patch. */
function scriptPairs(root,executable){
 const dir=path.dirname(String(executable||'')).toLowerCase();if(!dir)return null;
 const entry=Object.entries(readState(root)).find(([,s])=>s?.runtime?.file&&runningDirOf(s.runtime).toLowerCase()===dir);if(!entry)return null;const state=entry[1];
 try{
  if(state.status==='ready'&&state.original?.index){const tr=readIndex(state.runtime.index).lines,ja=readIndex(state.original.index).lines;return {source:'official',ja,tr:ja.map((_,i)=>typeof tr[i]==='string'&&!japaneseLine(tr[i])?tr[i]:'')};}
  if(state.status!=='native-japanese'||!state.runtime.index)return null;const ja=readIndex(state.runtime.index).lines;
  const patched=state.patchStatus==='ready'&&state.patch?.index&&state.patch.version===PATCH_VERSION&&(!state.patch.runtimeSha||state.patch.runtimeSha===state.runtime.sha256);
  if(!patched)return {source:'',ja,tr:[]};const og=readIndex(state.patch.index).lines;
  return {source:'group',ja,tr:ja.map((t,i)=>{const o=inlineTags(og[i]);return o&&norm(o)!==norm(inlineTags(t))&&!japaneseLine(o)?o:'';})};
 }catch{return null;}
}
function staticProvider(root,executable){
 // BGI's and scene engines' script is the whole game folder, AIN is a file in it.
 const entry=Object.entries(readState(root)).find(([,s])=>s?.runtime?.file&&runningDirOf(s.runtime).toLowerCase()===path.dirname(String(executable)).toLowerCase());
 if(!entry)return null;const [id,state]=entry;
 try{if(fingerprint({engine:state.runtime.engine||'system4',target:state.runtime.file})!==state.runtime.sha256)return null;
  if(state.mode==='original'&&state.status==='ready'&&state.original?.index){const og=readIndex(state.original.index),m=new Matcher(readIndex(state.runtime.index).lines,og.lines);
   // The original's own ruby (BGI <R よみ>漢字</R>) for the restored lines: game readings before dictionary ones.
   const readings=Array.isArray(og.ruby)?og.ruby:null,withRuby=r=>{if(!r||!readings||!Array.isArray(r.indices))return r;const pairs=r.indices.flatMap(i=>Array.isArray(readings[i])?readings[i]:[]);return pairs.length?{...r,ruby:pairs}:r;};
   // A patched game shown in Japanese: the patched line itself is the group's translation of the restored line.
   return {kind:'original',resolve:text=>withRuby(m.match(text))};}
  const patched=state.patchStatus==='ready'&&state.patch?.index&&state.patch.version===PATCH_VERSION&&(!state.patch.runtimeSha||state.patch.runtimeSha===state.runtime.sha256);
  if(!patched&&state.status!=='native-japanese')return null;
  // The Japanese game, with an imported patch or with none: the line stays Japanese; the patch's line at the same place is
  // its translation, and a line the patch leaves as it is (or every line, without a patch) takes the filled translation.
  const rtIndex=readIndex(state.runtime.index),rt=rtIndex.lines,m=new Matcher(rt,patched?readIndex(state.patch.index).lines:rt),fill=fillStore(root,id,scenes.ENGINES[state.runtime.engine]?.live?'live':state.runtime.sha256);
  // The script's own ruby for the matched lines (KiriKiri Z scene files): game readings come before dictionary ones.
  const readings=Array.isArray(rtIndex.ruby)?rtIndex.ruby:null,withRuby=r=>{if(!readings||!Array.isArray(r.indices))return r;const pairs=r.indices.flatMap(i=>Array.isArray(readings[i])?readings[i]:[]);return pairs.length?{...r,ruby:pairs}:r;};
  const untranslated=i=>{const o=m.og[i];return !o||norm(o)===norm(rt[i]);};
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
  let foreignMap;const foreign=(text,opt)=>{if(foreignMap===undefined){foreignMap=null;try{const f=scenes.ENGINES[state.runtime.engine]?.foreign;if(f){const map=f(path.dirname(String(executable)));if(map&&map.size)foreignMap=map;}}catch{}}if(!foreignMap)return '';const k=foreignKey(text),hit=foreignMap.get(k);if(hit||!opt?.prefix||k.length<40)return hit||'';/* a truncated stream sample (thread list keeps 110 chars): the one line it starts */let one='';for(const [key,ja] of foreignMap)if(key.startsWith(k)){if(one&&one!==ja)return '';one=ja;}return one;};
  const api={kind:'patch',patch:!!patched,fill,drawable,tableDrawable,flowLayout,flowGame,foreign,
   resolve:text=>withRuby(resolveLine(text))};
  function resolveLine(text){const r=m.match(text);if(r.japanese===undefined)return r;
    // E449 lines the release leaves in Japanese take the filled translation written for them (fill.cjs), marked filled.
    if(r.indices.some(untranslated)){const parts=r.indices.map(i=>{if(!untranslated(i))return m.og[i];const f=fillLines.lookup(rt[i]);return f&&f.zh?f.zh:null;});
     if(parts.every(p=>p!=null))return {...r,translation:parts.join(''),japanese:undefined,filled:true,source:'filled'};}
    if(r.indices.some(untranslated)){const t=fill.get(r.indices.map(i=>rt[i]).join(''));return t?{...r,translation:t,japanese:undefined,machine:true}:{status:'none',method:'untranslated',indices:r.indices};}
    return {...r,translation:r.japanese,japanese:undefined};}
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
 const engine=state.runtime.engine||'system4',runningDir=runningDirOf(state.runtime),base=ADAPTERS[engine].marker(path.parse(state.runtime.file).name).replace(/\.[^.]+$/,''),exclude=runningDir.toLowerCase(),runtime=readIndex(state.runtime.index);
 writeState(root,id,{status:'scanning',error:''});
 const search=await findCandidates(base,exclude,{ext:path.extname(ADAPTERS[engine].marker(path.parse(state.runtime.file).name)),roots:options.roots||[runningDir,...localRoots()],deadline:Date.now()+(options.timeout||30000)}),checked=[];
 for(const file of search.found){try{const loc=locate(path.dirname(file),path.parse(state.runtime.file).name);if(!loc||loc.engine!==engine){checked.push({file,result:'other-engine'});continue;}const ain=realign(loc,readScript(loc),runtime,runningDir),japanese=ain.lines.filter(t=>prose(t)&&japaneseLine(t)).length;if(japanese<ain.lines.filter(prose).length*.5){checked.push({file,result:'not-japanese'});continue;}const a=align(runtime,ain);checked.push({file,result:a.reliable?'match':'different-version'});if(a.reliable)return {...importOriginal(root,db,id,path.dirname(file)),search:{...search,found:search.found.length,checked}};}catch(error){checked.push({file,result:String(error.message||error)});}}
 const status=state.original?.index?(readState(root)[id]?.status==='scanning'?'ready':readState(root)[id].status):state.status==='chinese-only'?'chinese-only':'awaiting-original';
 writeState(root,id,{status:state.original?.index?(state.alignment?.reliable?'ready':'unreliable'):status,lastSearch:{at:Date.now(),found:search.found.length,complete:search.complete,searched:search.searched,checked}});
 return {notFound:true,search:{found:search.found.length,complete:search.complete,searched:search.searched,checked}};
}
module.exports={foreignKey,scriptPairs,brief,autoPatchLater,autoPatch,buildPatch,collect,nearbyPatchSources,patchHint,importPatch,clearPatch,locate,readScript,ADAPTERS,readAin,_ain:{mtXor,inflateAin},align,Matcher,importOriginal,status,setMode,provider,scanRunning,japaneseLine,chineseOnly,norm,discover,findCandidates};
