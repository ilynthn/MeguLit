// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E596 runtime harvest: the part of an adapter probe that only exists while the game runs (user 2026-11-14).

   When the user plays a game MeguLit has bound, the game has already decrypted its own archives: the key schedule, the
   unpacked index and the decoded script buffers sit in its memory. With the user's opt-in, MeguLit reads that memory
   once, read-only, and keeps only structure: keys and parameters, archive offsets / sizes / layouts, opcode tables and
   script layouts with every character of text replaced. The result joins the probe bundle (adapter-sample.cjs), which the
   user sees item by item and uploads only after confirming; a pack built from it comes back through the feed
   (adapter-feed.cjs) and the game is read again offline.

   Pieces
     native/RuntimeHarvest.exe        read-only reader (no injection, no write right on the game; budgeted, cancellable)
     runtime-harvest-scan.cjs         analysis of the streamed memory (detectors, locators)
     runtime-harvest-worker.cjs       runs reader + analysis in a child process at low priority, never in the service
     this module                      opt-in, triggers, the privacy gate, the store, service actions
   Sources it builds on: the pid of the game the hook already bound (reader.cjs) and the buffers the runtime-dump DLL
   already saves (runtime-dump.cjs) — those give known plaintext (the game's own decryption next to the archive bytes).

   Privacy (hard line): no natural-language text leaves the PC. Text samples go through desensitize.sample(), whose
   verify() drops anything that still reads as text; names go through maskString(); every byte field of every finding
   (keys included) is checked by naturalLanguage() and the finding is dropped when it reads as language; the bundle is
   checked once more as a whole (adapter-sample.cjs clean()). Raw memory is never written to disk.

   Opt-in: off until the user turns it on (data/config/runtime-harvest.json {enabled, off:{gameId:true}}); per game off;
   explain(locale) is what the switch shows. Store: data/adapter-probe/runtime/<gameId>.json (public findings only). */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{fork,spawn}=require('node:child_process'),os=require('node:os');
const d=require('./desensitize.cjs');
const SCHEMA='megulit.runtime-findings',VERSION=1;
const PROBLEM=['decrypt-failed','unknown-pack','parse-failed','timeout'];
const DEFAULTS={budgetMs:90000,budgetMb:768,delayMs:4*60000,freshDays:7};

/* ---- settings ------------------------------------------------------------------------------------------------------- */
const settingsFile=root=>path.join(root,'data','config','runtime-harvest.json');
const storeDir=root=>path.join(root,'data','adapter-probe','runtime');
function readJSON(file,fallback){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:fallback;}catch{return fallback;}}
function atomic(file,v){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v));fs.renameSync(tmp,file);}
/* the global switch is the Settings field library.runtimeHarvest (library.json, off unless true); per-game off lives here */
const libraryFile=root=>path.join(root,'data','config','library.json');
function settings(root){const v=readJSON(settingsFile(root),{});return {enabled:readJSON(libraryFile(root),{}).runtimeHarvest===true,off:v.off&&typeof v.off==='object'?v.off:{}};}
function setEnabled(root,enabled){atomic(libraryFile(root),{...readJSON(libraryFile(root),{}),runtimeHarvest:enabled===true});if(enabled!==true)cancel(root);return settings(root);}
function setGame(root,gameId,enabled){const v=readJSON(settingsFile(root),{}),off=v.off&&typeof v.off==='object'?v.off:{},id=String(gameId);if(enabled)delete off[id];else off[id]=true;atomic(settingsFile(root),{version:1,off});if(!enabled&&jobs.get(path.resolve(root))?.gameId===id)cancel(root);return settings(root);}
const allowed=(root,gameId)=>{const s=settings(root);return s.enabled&&!s.off[String(gameId)];};

/* what the switch explains: what is read, why, what may leave the PC, what never does */
const TEXT={
 zh:{title:'运行时读取游戏结构',why:'有些游戏的封包用只有游戏自己知道的密钥加密，离线探测打不开。游戏运行时已经把它们解开了。开启后，MeguLit 会在你玩这类游戏时只读地看一次游戏内存，找出解开封包所需的结构，好让以后不用游戏也能读出脚本。',
  reads:['游戏内存（只读：不注入、不写入、不暂停游戏，限时限量，随时可停）','游戏目录里的封包文件头和索引位置','运行时读出（runtime-dump）已在本机保存的解密片段'],
  uploads:['解密密钥和参数（Blowfish / Camellia / TEA 密钥、XOR 参数）','封包索引的数字：偏移、大小、字段布局','脚本的结构：操作码、长度字段、记录布局（所有文字已在本机替换成占位符）','这些东西在游戏模块里的位置和特征码'],
  never:['任何台词、文本、人名或文件名中的文字（在本机替换并逐项校验）','游戏文件本身、截图、存档、你的路径和用户名'],
  consent:'不会自动上传：上传前会列出每一项给你确认。可以全局关闭，也可以对单个游戏关闭。'},
 en:{title:'Runtime structure harvest',why:'Some games encrypt their archives with keys only the game itself knows, so the offline probe cannot open them. While the game runs it has already decrypted them. With this on, MeguLit looks at the game\'s memory once, read-only, while you play such a game, and keeps the structure needed to read its scripts later without the game.',
  reads:['The game\'s memory (read-only: no injection, no writes, never pauses the game; time- and size-limited, stoppable)','Archive headers and index positions in the game folder','Decrypted pieces runtime-dump already saved on this PC'],
  uploads:['Decrypt keys and parameters (Blowfish / Camellia / TEA keys, XOR parameters)','Archive index numbers: offsets, sizes, field layout','Script structure: opcodes, length fields, record layout (all text replaced by placeholders on this PC)','Where those live in the game\'s modules, and byte patterns to find them again'],
  never:['Any line, text, name or file-name wording (replaced and checked item by item on this PC)','Game files, screenshots, saves, your paths or user name'],
  consent:'Nothing uploads by itself: every item is listed for you to confirm first. Turn it off globally or per game.'}};
TEXT.ja={...TEXT.en};
const explain=(locale='zh')=>TEXT[String(locale).slice(0,2)]||TEXT.en;

/* ---- natural-language detector (the gate for byte fields) --------------------------------------------------------- */
const isKana=c=>c>=0x3041&&c<=0x30ff&&c!==0x30fb;
const isHan=c=>c>=0x4e00&&c<=0x9fff||c>=0x3400&&c<=0x4dbf;
/* true when bytes read as language in any encoding. Real Japanese has kana next to kana; random bytes almost never do,
   while a random byte pair is a "character" in GBK a third of the time and a random UTF-16 unit a CJK one even more often,
   so single scattered characters prove nothing. Language is:
     three kana in a row (any encoding)                                  ですか, ってもいい, カズマさん
     eight kanji in a row in Shift-JIS or UTF-8                          kanji-only lines
     six kanji / kana in a row with a kana among them (Shift-JIS, UTF-8)  紅魔族随一の魔法の使い手
     twelve GB2312 hanzi in a row in GBK                                 Chinese (patch) lines
     twelve CJK units in a row with two kana among them in UTF-16
   A kept punctuation mark (、。「」…) between characters does not end a run.
     English prose (five or more words, not the x / X of a masked line)
   Placeholders (あ ア 亜 …) are not language. Random key material passes (validation: 300 random 4 KiB states). */
function naturalLanguage(input){const buf=Buffer.from(input);if(buf.length<4)return false;
 const found=d.detect(buf).filter(c=>!d.PLACEHOLDER_CPS.has(c.cp));const by={};for(const c of found)(by[c.enc+(c.align??'')]||=[]).push(c);
 for(const [enc,list] of Object.entries(by)){const wide=enc.startsWith('utf16');list.sort((a,b)=>a.at-b.at);
  let kana=0,han=0,cjk=0,cjkKana=0,gb=0,prev=null;
  for(const c of list){const next=prev&&c.at===prev.at+prev.len,bridged=!next&&prev&&keptBetween(enc,buf,prev.at+prev.len,c.at);
   if(!next&&!bridged){han=0;cjk=0;cjkKana=0;gb=0;}if(!next)kana=0;prev=c;
   kana=isKana(c.cp)?kana+1:0;if(kana>=3)return true;
   han=isHan(c.cp)?han+1:0;if(!wide&&enc!=='gbk'&&han>=8)return true;
   if(enc==='gbk'){const l=buf[c.at],t=buf[c.at+1];gb=c.len===2&&l>=0xb0&&l<=0xf7&&t>=0xa1&&t<=0xfe?gb+1:0;if(gb>=12)return true;}
   if(enc!=='gbk'){if(isHan(c.cp)||isKana(c.cp)){cjk++;if(isKana(c.cp))cjkKana++;if(wide?cjk>=12&&cjkKana>=2:cjk>=6&&cjkKana>=1)return true;}else{cjk=0;cjkKana=0;}}}}
 return englishProse(buf);}
/* English: five or more words in a row, not the x / X a desensitized line is made of */
/* the bytes between two characters are one kept punctuation mark of that encoding */
function keptBetween(enc,buf,from,to){const n=to-from;if(n<1||n>3)return false;const b=buf.subarray(from,to);let t='';
 try{t=enc.startsWith('utf16')?(n===2?b.toString('utf16le'):''):enc==='utf8'?b.toString('utf8'):new TextDecoder(enc==='sjis'?'shift_jis':'gbk').decode(b);}catch{return false;}
 return [...t].length===1&&d.KEPT.has(t);}
function englishProse(buf){const ascii=Buffer.from(buf).toString('latin1');for(const m of ascii.matchAll(/(?:[A-Za-z]{2,}[ ,.'!?]+){4,}[A-Za-z]{2,}/g))if(/[a-wyzA-WYZ]/.test(m[0])&&/[a-z]{2,} [a-z]{2,} [a-z]{2,}/.test(m[0]))return true;
 return false;}

/* ---- public findings ---------------------------------------------------------------------------------------------- */
const hex=b=>Buffer.from(b).toString('hex');
const b64u32=list=>{const b=Buffer.alloc(list.length*4);list.forEach((v,i)=>b.writeUInt32LE(v>>>0,i*4));return b.toString('base64');};
const magicHex=h=>Buffer.from(h.subarray(0,8).map(b=>b>=0x80?0x3f:b)).toString('hex');
const readHead=(file,n)=>require('./original-engines/kit.cjs').head(file,n);/* E580 */
const KIND_CODES={opaque:'o',text:'t',data:'d',png:'p',ogg:'g',riff:'w',jpeg:'j',bmp:'b',zip:'z',psb:'s',tjs2:'c',zlib:'l',utf16:'u',utf8:'8'};
/* local findings (runtime-harvest-scan finish()) → the uploadable form + what was dropped */
function publicize(local,{dumps=[]}={}){
 const dropped={language:0,verify:0};const used=new Set(),mod=i=>{if(i>=0)used.add(i);return i;};
 const where=w=>w?(w.heap?{heap:true}:{module:mod(w.module),rva:w.rva}):null;
 const loc=l=>l?{module:mod(l.module),rva:l.rva,deref:l.deref,add:l.add||0}:null;
 const sig=list=>(list||[]).filter(s=>/^[0-9a-f?]{8,64}$/.test(s.pattern)).map(s=>({module:mod(s.module),rva:s.rva,kind:s.kind,pattern:s.pattern}));
 const safeBytes=b=>{if(naturalLanguage(b)){dropped.language++;return false;}return true;};
 const constants=(local.constants||[]).map(c=>({algo:c.algo,where:where(c.where),sig:sig(c.sig)}));
 const keys=[];for(const k of local.keys||[]){const base={algo:k.algo,verified:String(k.verified||''),...(k.mode?{mode:k.mode}:{}),where:where(k.where),locator:loc(k.locator),slotSig:sig(k.slotSig)};
  if(k.algo==='blowfish'){if(k.key){const kb=Buffer.from(k.key,'hex');if(!safeBytes(kb))continue;keys.push({...base,form:'key',key:k.key});}else{if(!safeBytes(k.state))continue;keys.push({...base,form:'state',layout:k.layout,state:k.state.toString('base64')});}}
  else if(k.algo==='camellia'){if(!safeBytes(Buffer.from(k.key,'hex')))continue;keys.push({...base,form:'key',bits:128,key:k.key,words:k.words,alternates:(k.alternates||[]).filter(a=>safeBytes(Buffer.from(a,'hex')))});}
  else if(k.algo==='tea'||k.algo==='xtea'){if(!safeBytes(Buffer.from(k.key,'hex')))continue;keys.push({...base,form:'key',key:k.key,rounds:k.rounds,words:k.words});}
  else if(['xor','sub','xor-index'].includes(k.algo)){if(k.key&&!safeBytes(Buffer.from(k.key,'hex')))continue;keys.push({algo:k.algo,form:'params',verified:k.verified,...(k.key?{key:k.key,period:k.period,filePhase:k.filePhase}:{}),...(k.value!==undefined?{value:k.value}:{}),...(k.base!==undefined?{base:k.base,step:k.step}:{})});}}
 const indexes=[];for(const ix of local.indexes||[]){const names=ix.names?.list?ix.names.list.slice(0,4096).map(n=>{const s=decodeName(n);return d.maskString(s).slice(0,64);}):null;
  const entries=[];for(const e of ix.entries.slice(0,65536))entries.push(e[0],e[1],e[2]||0);
  const ext={};for(const n of names||[]){const m=/\.([A-Za-z0-9]{1,8})$/.exec(n);const k=m?m[1].toLowerCase():'(none)';ext[k]=(ext[k]||0)+1;}
  const kinds=ix.kinds?ix.kinds.map(([k])=>KIND_CODES[k]||'o').join(''):null;const via=ix.kinds?[...new Set(ix.kinds.map(([,v])=>v).filter(Boolean))]:[];
  /* the table region itself, desensitized like a file sample (record layout, name fields as placeholders) */
  const region=ix.region?d.sample(ix.region.bytes,{max:ix.region.bytes.length,compress:true}):null;if(ix.region&&!region)dropped.verify++;
  const item={...(region?{region:{at:ix.region.at,sample:region}}:{}),archive:{name:d.maskString(ix.archive.name).slice(0,120),size:ix.archive.size,magic:ix.archive.file?magicHex(readHead(ix.archive.file,8)):''},where:where(ix.where),locator:loc(ix.locator),slotSig:sig(ix.slotSig),stride:ix.stride,fields:ix.fields,countAt:ix.countAt,count:ix.count,coverage:ix.coverage,
   entries:b64u32(entries),entryWords:3,...(names?{names:{at:ix.names.at,form:ix.names.form,list:names},ext}:{}),...(kinds?{kinds,via}:{})};
  if(names&&names.some(n=>naturalLanguage(Buffer.from(n,'utf8'))||naturalLanguage(Buffer.from(n,'utf16le')))){dropped.language++;delete item.names;}
  indexes.push(item);}
 const dispatch=(local.dispatch||[]).map(t=>({where:where(t.where),count:t.count,ptr:t.ptr,targets:b64u32(t.targets),sig:sig(t.sig)}));
 const scripts=[];for(const s of local.scripts||[]){const sm=d.sample(s.window,{max:s.window.length,compress:true});if(!sm){dropped.verify++;continue;}scripts.push({where:where(s.where),locator:loc(s.locator),encoding:s.encoding,runs:s.runs,textShare:s.textShare,before:s.before,opcodes:s.opcodes,lengthPrefix:s.lengthPrefix,terminator:s.terminator,sample:sm});}
 for(const x of dumps.slice(0,4)){const whole=x.bytes.subarray(0,8<<20),sm=d.sample(whole,{max:whole.length,compress:true});if(!sm){dropped.verify++;continue;}const shape=require('./runtime-harvest-scan.cjs').bytecodeShape(x.bytes.subarray(0,65536));
  scripts.push({where:{dump:true},source:d.maskString(path.basename(String(x.source||'memory').replace(/\\/g,'/'))).slice(0,80),how:x.how,size:x.bytes.length,...(shape||{}),sample:sm});}
 const modules=(local.modules||[]).map((m,i)=>used.has(i)||m.main?{id:i,name:d.maskString(m.name).slice(0,80),size:m.size,main:!!m.main}:null).filter(Boolean);
 return {schema:SCHEMA,version:VERSION,collector:{scan:scanStamp(),native:'RuntimeHarvest',bits:local.bits||0},stats:local.stats||{},modules,constants,keys,indexes,dispatch,scripts,dropped};}
function decodeName(b){const buf=Buffer.from(b);try{return new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch{}try{return new TextDecoder('shift_jis').decode(buf);}catch{return buf.toString('latin1');}}
let stampMemo=null;function scanStamp(){if(stampMemo)return stampMemo;try{stampMemo=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'runtime-harvest-scan.cjs'))).update(fs.readFileSync(__filename)).digest('hex').slice(0,12);}catch{stampMemo='';}return stampMemo;}

/* the whole public object once more: every string ASCII / placeholder, every base64 field free of language, every sample
   verified; returns the object with offending findings removed (never throws) */
const TEXTISH=/[぀-ヿ㐀-鿿가-힯０-ｚ]/g;
function gate(pub){if(!pub||pub.schema!==SCHEMA)return null;const out=JSON.parse(JSON.stringify(pub));out.dropped={...(out.dropped||{}),gate:0};
 const textIn=s=>(String(s).match(TEXTISH)||[]).some(c=>!d.PLACEHOLDER_CPS.has(c.codePointAt(0))&&!d.KEPT.has(c));
 /* byte fields by name: base64 (state, entries, targets) and hex (key, alternates); everything else is a number or ASCII */
 const B64=new Set(['state','entries','targets']),HEXF=new Set(['key','alternates','filePhase']);
 const bytesOk=b=>!naturalLanguage(b);
 const fieldOk=(v,k='')=>{if(typeof v==='string'){if(textIn(v))return false;if(B64.has(k))return /^[A-Za-z0-9+/]*=*$/.test(v)&&bytesOk(Buffer.from(v,'base64'));if(HEXF.has(k))return /^(?:[0-9a-f]{2})*$/.test(v)&&bytesOk(Buffer.from(v,'hex'));return true;}
  if(Array.isArray(v))return v.every(x=>fieldOk(x,k));if(v&&typeof v==='object')return Object.entries(v).every(([kk,x])=>kk==='sample'?sampleOk(x):fieldOk(x,kk));return true;};
 /* a text sample: the same rule verify() applied (no text run in the file's own encoding, no long kana run in another),
    and no English prose left */
 const sampleOk=s=>!!s&&Array.isArray(s.parts)&&s.parts.every(p=>{const b=d.partBytes(p);return b.length===(p.len|0)&&d.textRuns(b).length===0&&!englishProse(b);});
 for(const k of ['constants','keys','indexes','dispatch','scripts'])out[k]=(out[k]||[]).filter(f=>{const ok=fieldOk(f);if(!ok)out.dropped.gate++;return ok;});
 out.modules=(out.modules||[]).map(m=>({...m,name:textIn(m.name)?d.maskString(m.name):m.name}));
 return out;}

/* ---- local context: archives and known-plaintext pairs ------------------------------------------------------------ */
function archivesOf(dir){try{const inv=require('./adapter-probe-core.cjs').inventory(dir);return inv.archives.filter(a=>a._path).map(a=>({name:a.name,file:a._path,size:a.size}));}catch{return [];}}
/* runtime-dump buffers (decrypted by the game) next to the bytes of the file they came from */
function dumpContext(dir){const out={pairs:[],dumps:[]};let rd;try{rd=require('./runtime-dump.cjs');}catch{return out;}
 let list=[];try{list=rd.entries(dir);}catch{return out;}
 for(const e of list.filter(x=>x.how&&x.how!=='plain'&&x.how!=='seed').slice(-200)){let plain;try{plain=fs.readFileSync(e.path);}catch{continue;}
  if(out.dumps.length<4&&plain.length>=256)out.dumps.push({source:e.source,how:e.how,bytes:plain});
  if(out.pairs.length>=64)continue;const src=String(e.source||'');const file=[src,path.join(dir,src)].find(f=>{try{return path.isAbsolute(f)&&fs.statSync(f).isFile();}catch{return false;}});if(!file)continue;
  const at=Number(e.offset)||0,n=Math.min(plain.length,65536);let cipher;try{const fd=fs.openSync(file,'r');try{cipher=Buffer.alloc(n);const k=fs.readSync(fd,cipher,0,n,at);cipher=cipher.subarray(0,k);}finally{fs.closeSync(fd);}}catch{continue;}
  if(cipher.length>=16&&!cipher.equals(plain.subarray(0,cipher.length)))out.pairs.push({plain:plain.subarray(0,n),cipher,offset:at,source:path.basename(file)});}
 return out;}

/* ---- the harvest ---------------------------------------------------------------------------------------------------- */
const nativeExe=()=>process.env.MEGULIT_RUNTIME_HARVEST_EXE||path.join(__dirname,'..','native','RuntimeHarvest.exe');
/* scan(options) → Promise<local findings> — runs the reader and the analysis in this process (the worker calls it) */
function scan({pid,exe=nativeExe(),archives=[],pairs=[],budgetMs=DEFAULTS.budgetMs,budgetMb=DEFAULTS.budgetMb,signal}={}){
 return new Promise(resolve=>{const S=require('./runtime-harvest-scan.cjs');const scanner=S.createScanner({archives,pairs,budgetMs});let bits=0,summary={},failed='',child;
  const done=()=>{let r;try{r=scanner.finish();}catch{r={constants:[],keys:[],indexes:[],dispatch:[],scripts:[],stats:{}};}r.bits=bits;r.stats={...r.stats,native:summary,...(failed?{error:failed}:{})};resolve(r);};
  if(!pid||!fs.existsSync(exe)){failed=!pid?'NO_PID':'NO_READER';return done();}
  try{child=spawn(exe,['--pid',String(pid),'--budget-mb',String(budgetMb),'--seconds',String(Math.max(5,Math.round(budgetMs/1000))),'--max-region-mb','512'],{windowsHide:true,stdio:['ignore','pipe','ignore']});}catch{failed='SPAWN';return done();}
  const parser=S.streamParser({onHeader:h=>{bits=h.bits||0;if(h.error)failed=String(h.error).slice(0,20);scanner.header(h);},onRegion:r=>scanner.region(r),onSummary:s=>{summary=s;}});
  const kill=()=>{try{child.kill();}catch{}};const timer=setTimeout(()=>{failed=failed||'TIMEOUT';kill();},budgetMs+15000);signal?.addEventListener?.('abort',()=>{failed='CANCELLED';kill();});
  child.stdout.on('data',c=>{try{parser.push(c);}catch(e){failed=String(e.message||e).slice(0,20);kill();}});
  child.on('error',()=>{failed=failed||'SPAWN';});
  child.on('close',()=>{clearTimeout(timer);try{parser.end();}catch{}done();});});}

/* harvest(root,{gameId,executable,pid}) → Promise<public findings|{error}> in a low-priority child process */
const jobs=new Map();
function harvest(root,{gameId,executable,pid,budgetMs=DEFAULTS.budgetMs,budgetMb=DEFAULTS.budgetMb,inProcess=false,emit=()=>{}}={}){
 const key=path.resolve(root);if(jobs.has(key))return Promise.resolve({error:'BUSY'});
 const dir=path.dirname(String(executable||''));const job={gameId:String(gameId),pid,startedAt:Date.now(),child:null,abort:new AbortController()};jobs.set(key,job);try{emit('adapter-runtime',status(root));}catch{}
 const finish=pub=>{jobs.delete(key);const r=save(root,gameId,executable,pub);try{emit('adapter-runtime',status(root));}catch{}return r;};
 if(inProcess){const ctx=dumpContext(dir);return scan({pid,archives:archivesOf(dir),pairs:ctx.pairs,budgetMs,budgetMb,signal:job.abort.signal}).then(local=>finish(publicize(local,{dumps:ctx.dumps})),()=>finish({error:'FAILED'}));}
 return new Promise(resolve=>{let child;try{child=fork(path.join(__dirname,'runtime-harvest-worker.cjs'),[],{execPath:process.execPath,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,env:{...process.env,MEGULIT_RUNTIME_HARVEST_WORKER:'1'}});}catch{return resolve(finish({error:'WORKER'}));}
  job.child=child;try{os.setPriority(child.pid,os.constants.priority.PRIORITY_LOW);}catch{}
  let settled=false;const end=v=>{if(settled)return;settled=true;clearTimeout(t);try{child.kill();}catch{}resolve(finish(v));};
  const t=setTimeout(()=>end({error:'TIMEOUT'}),budgetMs+60000);
  child.on('message',m=>{if(m?.type==='result')end(m.result);});child.once('exit',()=>end(job.cancelled?{error:'CANCELLED'}:{error:'WORKER_EXIT'}));child.on('error',()=>{});
  try{child.send({type:'harvest',pid,dir,budgetMs,budgetMb});}catch{end({error:'WORKER'});}});}
/* save(root,gameId,executable,public findings) → what was stored: the gated findings, or the error */
function save(root,gameId,executable,pub){if(pub&&!pub.error){const g=gate(pub);if(g){g.game={stamp:stamp(executable)};g.at=Date.now();atomic(path.join(storeDir(root),safeId(gameId)+'.json'),g);return g;}}
 const e={schema:SCHEMA,version:VERSION,error:pub?.error||'FAILED',at:Date.now(),game:{stamp:stamp(executable)}};try{atomic(path.join(storeDir(root),safeId(gameId)+'.json'),e);}catch{}return e;}
function cancel(root){const job=jobs.get(path.resolve(root));if(!job)return {state:'idle'};job.cancelled=true;try{job.abort.abort();}catch{}try{job.child?.kill();}catch{}return {state:'cancelled'};}
const safeId=id=>String(id).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80)||'game';
function stamp(executable){try{const st=fs.statSync(executable);return st.size+'-'+Math.floor(st.mtimeMs)+'-'+scanStamp();}catch{return '';}}
function load(root,gameId){const v=readJSON(path.join(storeDir(root),safeId(gameId)+'.json'),null);return v&&v.schema===SCHEMA&&!v.error?v:null;}
function forget(root,gameId){try{fs.rmSync(path.join(storeDir(root),safeId(gameId)+'.json'),{force:true});}catch{}return {ok:true};}
function status(root){const job=jobs.get(path.resolve(root));let games={};try{for(const f of fs.readdirSync(storeDir(root)).filter(n=>n.endsWith('.json'))){const v=readJSON(path.join(storeDir(root),f),null);if(!v)continue;games[f.slice(0,-5)]=v.error?{error:v.error,at:v.at}:{at:v.at,keys:v.keys.length,indexes:v.indexes.length,dispatch:v.dispatch.length,scripts:v.scripts.length,constants:v.constants.length,stop:v.stats?.stop||'',outcome:v.outcome||null};}}catch{}
 const s=settings(root);return {enabled:s.enabled,off:Object.keys(s.off),running:job?{gameId:job.gameId,startedAt:job.startedAt}:null,games,reader:fs.existsSync(nativeExe())};}

/* ---- triggers ------------------------------------------------------------------------------------------------------- */
const timers=new Map();
/* needed(root,gameId,executable) → why not ('' = go): only games the offline probe could not read, once per stamp */
function needed(root,gameId,executable,{force=false}={}){
 if(process.platform!=='win32')return 'PLATFORM';if(!allowed(root,gameId))return 'OFF';if(!fs.existsSync(nativeExe()))return 'NO_READER';
 if(force)return '';let r=null;try{r=require('./adapter-probe.cjs').results(root)[String(gameId)];}catch{}
 if(!r||!PROBLEM.includes(r.step))return 'NOT_NEEDED';
 const prev=readJSON(path.join(storeDir(root),safeId(gameId)+'.json'),null);if(prev&&prev.game?.stamp===stamp(executable)&&Date.now()-(prev.at||0)<DEFAULTS.freshDays*86400000&&!['exited','TIMEOUT'].includes(prev.stats?.stop||prev.error))return 'FRESH';
 return '';}
/* reader.cjs calls this when the hook has bound a library game: after a few minutes of play (the game has loaded and
   decrypted its scripts by then) one harvest runs, if allowed and needed */
function onGameBound(root,{gameId,executable,pid},{delayMs=DEFAULTS.delayMs,emit=()=>{}}={}){
 if(!gameId||!pid||!executable)return null;const key=path.resolve(root);clearTimeout(timers.get(key));
 if(needed(root,gameId,executable))return null;
 const t=setTimeout(()=>{timers.delete(key);try{process.kill(pid,0);}catch{return;}if(needed(root,gameId,executable))return;harvest(root,{gameId,executable,pid,emit}).catch(()=>{});},delayMs);t.unref?.();timers.set(key,t);return t;}
function onGameClosed(root){const key=path.resolve(root);clearTimeout(timers.get(key));timers.delete(key);cancel(root);}

/* the pack that came back from these findings: its outcome after the offline rebuild (adapter-feed.cjs) */
function noteOutcome(root,gameId,outcome){const file=path.join(storeDir(root),safeId(gameId)+'.json'),v=readJSON(file,null);if(!v||v.schema!==SCHEMA)return;v.outcome={...outcome,at:Date.now()};atomic(file,v);}

/* ---- service actions (adapter-actions.cjs forwards adapter_runtime_*) ---------------------------------------------- */
async function handle(db,root,request,emit=()=>{}){
 const id=String(request.gameId||'');
 switch(request.action){
  case 'adapter_runtime_status':return status(root);
  case 'adapter_runtime_explain':return explain(request.locale);
  case 'adapter_runtime_enable':return setEnabled(root,request.enabled===true);
  case 'adapter_runtime_game':{if(!id)throw Error('GAME_ID');return setGame(root,id,request.enabled!==false);}
  case 'adapter_runtime_cancel':return cancel(root);
  case 'adapter_runtime_forget':{if(!id)throw Error('GAME_ID');return forget(root,id);}
  case 'adapter_runtime_findings':{if(!id)throw Error('GAME_ID');return load(root,id)||{empty:true};}
  case 'adapter_runtime_harvest':{if(!id)throw Error('GAME_ID');const pid=Number(request.pid);if(!Number.isSafeInteger(pid)||pid<=0)throw Error('PID');
   const row=require('./adapter-probe.cjs').libraryGames(db).find(g=>g.id===id);if(!row)throw Error('GAME_NOT_FOUND');
   const why=needed(root,id,row.executable,{force:true});if(why)return {state:'skipped',reason:why};
   harvest(root,{gameId:id,executable:row.executable,pid,emit}).catch(()=>{});return {state:'started'};}
  default:throw Error('UNKNOWN_ACTION');}}

module.exports={SCHEMA,VERSION,DEFAULTS,settings,setEnabled,setGame,allowed,explain,naturalLanguage,englishProse,publicize,gate,archivesOf,dumpContext,scan,harvest,save,cancel,load,forget,status,needed,onGameBound,onGameClosed,noteOutcome,handle,storeDir,nativeExe};
