// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E560 local probe of one game folder: every reader and unpacker MeguLit has, run against the folder, and one structured
   result. Runs in the probe worker (adapter-probe-worker.cjs), never in the service: a reader that hangs only costs the
   worker, which the service kills and restarts after the per-game budget.

   probeGame({dir,executable}) → {
     schema:'megulit.probe-result', version:1, reader:'<12 hex of the reader code>', ms,
     fingerprint:{key,exe,size,engine} | null          shared-adaptation key: the same game on any PC, no path in it
     inventory:{files,bytes,ext:{'.xp3':3,...},archives:[{name,size,magic,format}]}   names desensitized
     engines:[{id,scenes,lines,error,ms}]               every reader that recognised something (or failed trying)
     detected:'<engine id>'|null, lines, japaneseLines, sizes:[lines per scene]
     step:'ok'|'unknown-pack'|'unsupported-engine'|'decrypt-failed'|'parse-failed'|'not-japanese'|'chinese-build'|'decode-suspect'|'no-script'|'low-pairing'|'timeout',
     detail:'<code>', unsupported:{engine,code}|null, preparing:'unpack'|'capture'|null }
   No line of text leaves this function: only counts. The pairing part (low-pairing) is added by adapter-probe.cjs from
   the zero-latency state. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {maskString}=require('./desensitize.cjs');

/* Known archive magics (format names only; the bytes that follow are never kept). */
const MAGICS=[['xp3','58503333'.slice(0,6)],['xp3','5850330d0a'],['pfs-pf8','706638'],['pfs-pf6','706636'],['bgi-arc20','4255524b4f20415243'],['bgi-packfile','5061636b46696c6520'],['ypf','59504600'],['kcap','4b434150'],['npk2','4e504b32'],['npa','4e504101'],['npk3','4e504b33'],
 ['iga','49474130'],['mpk','4d504b00'],['cpk','43504b20'],['afs','41465300'],['psb','50534200'],['mdf','6d646600'],['zip','504b0304'],['rar','52617221'],['7z','377abcaf'],['unityfs','556e69747946532000'],['wolf','574f4c46'],
 ['ain','56455253'],['aar','41415200'],['afa','41464148'],['alk','414c4b30'],['qnt','514e5400'],['ai2','41493200'],['gpk','47504b'],['lpk','4c504b'],['ykc','594b433030'],['dxa','4458'],['pac-nep','5041430000'],['arc-advhd','41524332'],['cat2-int','4b494600'],['ogg','4f676753'],['png','89504e47'],['riff','52494646']];
const ARCHIVE=/\.(xp3|pfs|pf8|arc|pac|pak|dat|ypf|int|mpk|nsa|sar|ns2|gpk|ykc|lpk|mrg|fpk|afs|vfs|dxa|bin|cpz|hxp|lib|lac|pck|epk|vff|isa|nnk|ar2|psb|npk|npa|iga|cpk|wolf|ain|dbs|wad|assets|bundle)$/i;
/* anything else of some size near the top of the game folder may be an archive in a format no reader knows */
const NOT_ARCHIVE=/\.(g0[0-2]|g[ia]n|tcr|cgm|exe|dll|ini|cfg|log|url|html?|pdf|ico|png|jpe?g|bmp|gif|webp|ogg|wav|mp3|m4a|flac|opus|mp4|webm|avi|wmv|mpe?g|mkv|ttf|otf|ttc|fon|xml|md|bat|cmd|lnk|sav|sys|reg|manifest|config|txt|ks|tjs|json|rpy|rpyc|lua|cs|js|css|vdf|acf|dmp)$/i;
const SCRIPTISH=/\.(ks|tjs|ast|txt|scr|ss|s|sc|scn|ws2|ybn|bsc|ain|rpy|json|lua|nut|asb|mjo|hcb|dbs|lin)$/i;
const SKIP_DIR=/^(save|savedata|movie|movies|video|bgm|sound|voice|se|logs?|\.megulit|_commonredist|directx|redist)$/i;

function readerStamp(){try{const h=crypto.createHash('sha256'),dir=path.join(__dirname,'original-engines');for(const f of fs.readdirSync(dir).filter(n=>n.endsWith('.cjs')).sort())h.update(f+'|').update(fs.readFileSync(path.join(dir,f)));
 for(const f of ['adapter-packs.cjs','adapter-probe-core.cjs'])try{h.update(f).update(fs.readFileSync(path.join(__dirname,f)));}catch{}return h.digest('hex').slice(0,12);}catch{return '';}}
let stampMemo=null;const reader=()=>stampMemo??=readerStamp();

const head=(file,n=16)=>require('./original-engines/kit.cjs').head(file,n);/* E580 */
function format(h){const hex=h.toString('hex');for(const [name,m] of MAGICS)if(m.length>=6&&hex.startsWith(m))return name;return '';}
/* the magic of an archive: its first 8 raw bytes as hex. Never masked (E-probe 2026-11-16): masking bytes >= 0x80 to '?'
   erased the fingerprint of every binary header (âge rio, Unity .resS), and 8 header bytes carry no readable text */
const magicHex=h=>Buffer.from(h.subarray(0,8)).toString('hex');
const fp=require('./engine-fingerprint.cjs');
function inventory(dir,{depth=2,limit=6000,deadline=Infinity}={}){
 const inv={files:0,bytes:0,ext:{},archives:[],scripts:0,markers:[]};const mark=n=>{const m=fp.markerOf(n);if(m&&!inv.markers.includes(m)&&inv.markers.length<8)inv.markers.push(m);};const walk=(d,level)=>{let list;try{list=fs.readdirSync(d,{withFileTypes:true});}catch{return;}
  for(const e of list){if(inv.files>=limit||Date.now()>deadline){inv.truncated=true;return;}const full=path.join(d,e.name);
   mark(e.name);if(e.isDirectory()){if(level<depth&&!SKIP_DIR.test(e.name))walk(full,level+1);continue;}if(!e.isFile())continue;
   let size=0;try{size=fs.statSync(full).size;}catch{}inv.files++;inv.bytes+=size;const ext=(path.extname(e.name).toLowerCase()||'(none)').slice(0,12);inv.ext[ext]=(inv.ext[ext]||0)+1;
   if(fp.DOCUMENT.test(e.name))continue;
   if(SCRIPTISH.test(e.name))inv.scripts++;
   if((ARCHIVE.test(e.name)&&size>=4096||!NOT_ARCHIVE.test(e.name)&&size>=512&&level<=1)&&inv.archives.length<48){const h=head(full);inv.archives.push({name:maskString(path.relative(dir,full).replace(/\\/g,'/')).slice(0,120),size,magic:magicHex(h),format:format(h)||fp.archiveInfo(e.name,magicHex(h)).format,_path:full});}}};
 walk(dir,0);inv.archives.sort((a,b)=>b.size-a.size);return inv;}

/* readers that scan whole folders for anything text-like: they must never outrank or delay a dedicated reader */
const GENERIC=new Set(['html5','garbro','unity-assets','cpk']),DEDICATED_JP=30,GENERIC_MS=30000;
const DECRYPT=/decrypt|encrypt|cipher|key|filter|scheme|CX|PROTECT|TPM|^IKURA_SECRET$/i;
const KANA=/[ぁ-ゖァ-ヺ]/;
/* reader outcomes that are not failures of the reader: it ran and the folder had nothing for it */
const SOFT_ERROR=/^(NO_SCENES|BUDGET)$/;
const HAN=/[㐀-鿿]/;
/* E600 language counting. dialogue = a line that can be spoken text: script commands, identifiers, file names and
   resource paths are not (they would drown the ratio of games with many of them). chinese = Han and no kana. */
const PATHISH=/^[\w.\-\/\\:$%]+$/,SCRIPTISH_LINE=/^[@#\[<*;%$&]|^[A-Za-z_][\w.]*\s*[(=]|\.(png|jpe?g|bmp|ogg|wav|mp3|ks|tjs|txt|ws2|scr|mjo|bsc|ybn|dat|arc|xp3)\b/i;
const NON_CJK_PROSE=/(?:[A-Za-z]+|[\u0400-\u04FF]+|[\uAC00-\uD7AF]+)\s+(?:[A-Za-z]+|[\u0400-\u04FF]+|[\uAC00-\uD7AF]+)/;
function lineKind(l){const t=String(l).trim();if(!t||PATHISH.test(t)||SCRIPTISH_LINE.test(t)&&!KANA.test(t))return 0;
 if(KANA.test(t))return 3;if(HAN.test(t))return 2;return NON_CJK_PROSE.test(t)?1:0;}
/* → {dialogue,japanese,chinese} over a list of lines; japanese keeps the old meaning (any kana, whole list) */
function countLines(lines){let dialogue=0,japanese=0,chinese=0;for(const l of lines||[]){if(KANA.test(l))japanese++;const k=lineKind(l);if(k)dialogue++;if(k===2)chinese++;}return {dialogue,japanese,chinese};}
/* every engine of scenes.cjs, plus System4 / BGI from original-text.cjs, with a per-engine time cap */
function runEngines(dir,{deadline,routed=[],progress=()=>{},only=null}){
 const scenes=require('./original-engines/scenes.cjs'),out=[];
 /* the GARbro last resort never runs over a folder whose KiriKiri cx archives MeguLit decrypts itself (detect() skips it the same way): on a cold cache it spent 20-80 s unpacking them for nothing and the probe timed out (ATRI) */
 let skipGarbro=false;try{skipGarbro=scenes.ownCx(dir);}catch{}
 /* E610 dedicated readers first, in scenes.detect order; the generic scans (HTML5, garbro, unity-assets, cpk) only when no dedicated reader read a sizeable amount of Japanese, and each with its own time cap */
 const ids=Object.keys(scenes.ENGINES),first=routed.filter(i=>ids.includes(i)),rest=ids.filter(i=>!first.includes(i)),order=[...first.filter(i=>!GENERIC.has(i)),...rest.filter(i=>!GENERIC.has(i)),...first.filter(i=>GENERIC.has(i)),...rest.filter(i=>GENERIC.has(i))];let dedicatedJp=0;
 /* S5 routing: the readers the fingerprint / registry name run first (never starved by the budget) and are always listed, a reader that found nothing as NO_SCENES */
 const isRouted=new Set(first);
 for(const id of only?order.filter(i=>only.includes(i)):order){const generic=GENERIC.has(id);if(generic&&dedicatedJp>=DEDICATED_JP)continue;progress({stage:'engine:'+id,engines:out});if(id==='garbro'&&skipGarbro)continue;if(Date.now()>deadline){out.push({id,scenes:-1,lines:0,error:'BUDGET',ms:0});continue;}
  const engine=scenes.ENGINES[id],t=Date.now(),limit=generic?Math.min(deadline,t+GENERIC_MS):deadline;let list=null,error='',lines=0,sizes=[],japanese=0,parsed=0,dialogue=0,chinese=0;
  try{list=engine.scenes(dir,{deadline:limit})||[];}catch(e){error=String(e?.code||e?.message||e).slice(0,60);}
  if(list&&list.length){for(const s of list){if(Date.now()>limit){error=error||'BUDGET';break;}let p;try{p=s.parse?s.parse():engine.parse(s.read());parsed++;}catch(e){if(!error)error=String(e?.code||e?.message||e).slice(0,60);sizes.push(0);continue;}
    const n=p?.lines?.length||0;lines+=n;sizes.push(n);const c=countLines(p?.lines);japanese+=c.japanese;dialogue+=c.dialogue;chinese+=c.chinese;}}
  if(!generic)dedicatedJp=Math.max(dedicatedJp,japanese);
  if(!list?.length&&!error&&isRouted.has(id))error='NO_SCENES';
  if(list?.length||error)out.push({id,scenes:list?list.length:-1,parsed,lines,japaneseLines:japanese,dialogueLines:dialogue,chineseLines:chinese,sizes:sizes.slice(0,4000),error,ms:Date.now()-t,...isRouted.has(id)?{routed:true}:{}});}
 return out;}
function nativeEngines(dir,executable){const out=[];let ot;try{ot=require('./original-text.cjs');}catch{return out;}
 for(const id of ['system4','bgi']){const a=ot.ADAPTERS?.[id];if(!a)continue;const t=Date.now();let loc=null,error='';try{loc=a.locate(dir,path.parse(String(executable||'')).name);}catch(e){error=String(e?.message||e).slice(0,60);}
  if(!loc&&!error)continue;let lines=0,japanese=0,dialogue=0,chinese=0,sizes=[];if(loc)try{const r=a.read(loc.target);lines=r.lines.length;const c=countLines(r.lines);japanese=c.japanese;dialogue=c.dialogue;chinese=c.chinese;sizes=(r.sizes||[]).slice(0,4000);}catch(e){error=String(e?.message||e).slice(0,60);}
  out.push({id,scenes:loc?1:-1,parsed:loc?1:0,lines,japaneseLines:japanese,dialogueLines:dialogue,chineseLines:chinese,sizes,error,ms:Date.now()-t});}
 return out;}

/* Language of a reader's text, from counts only (no text). → 'japanese' | 'chinese-build' | 'decode-suspect' | 'not-japanese'
   - denominator is the dialogue-line count when the probe has it (E600+), else every line;
   - a big absolute number of Japanese lines is Japanese whatever the ratio (a 160k-line script with 2.6k kana lines
     is a Japanese game whose rest is commands);
   - Chinese lines in the majority, or (old probes without chineseLines) a Chinese-build title → 'chinese-build';
   - almost no Japanese in a big script → 'decode-suspect': the reader most likely mis-decoded it, not a language fact. */
const CHINESE_TITLE=/汉化|漢化|简体|簡體|繁体|繁體|中文|官中|国语|國語|翻译|翻譯|和谐|和諧|AI\s*翻|机翻|機翻|Chinese|CHS|CHT/i;
const SIMPLIFIED_ONLY=/[华镜诅传说汉兰寻译为这个们对时开关与东发见现过还进动机实队网图书写读语终贝车电马鱼鸟龙长门风飞饭给结经红绿纪约级维线细织统缘继续]/;
const chineseTitle=t=>{const s=String(t||'');return !!s&&(CHINESE_TITLE.test(s)||!KANA.test(s)&&SIMPLIFIED_ONLY.test(s));};
function judgeLanguage({lines=0,japaneseLines=0,dialogueLines,chineseLines,title}={}){
 const base=dialogueLines>0?Math.max(Math.min(dialogueLines,lines),lines*.05):lines,jp=japaneseLines;/* floor: a handful of dialogue-looking lines in a big script is a mis-read, not a tiny game */
 if(lines<50)return 'japanese';
 const knownChinese=Number.isFinite(chineseLines);
 if(knownChinese&&chineseLines>=base*.5&&chineseLines>=jp*2)return 'chinese-build';
 if(!knownChinese&&jp<base*.1&&chineseTitle(title))return 'chinese-build';/* old probe: the title says Chinese build, and kana lines are a sliver */
 if(jp>=base*.3)return 'japanese';
 /* an English (Latin-script) release read correctly: dialogue lines that are neither kana nor Han are Latin text, so the script was decoded fine and the build just is not Japanese */
 if(dialogueLines>0){const latin=Math.max(0,dialogueLines-jp-(chineseLines||0));if(latin>=base*.5&&latin>=jp*2&&latin>=100)return 'not-japanese';}
 if(jp>=1000)return 'japanese';
 if(jp<Math.max(10,lines*.001)&&lines>=100)return 'decode-suspect';
 return jp>=Math.min(300,base*.05)?'japanese':'not-japanese';}

/* which step failed, from the evidence */
function classify({engines,inventory:inv,unsupported,preparing,title,garbroNeed=0}){
 /* S5 a reader whose lines hold no dialogue at all (no kana, no Han, no Latin prose: file lists, commands) has read no text;
    judging its language said not-japanese for an encrypted KiriKiri game whose dump was 254 command lines (otomeki #324) */
 const readers=engines.filter(e=>e.lines>0&&!(e.dialogueLines===0&&!e.japaneseLines&&!e.chineseLines)).sort((a,b)=>b.lines-a.lines);
 const read=readers.find(e=>!GENERIC.has(e.id)&&e.japaneseLines>=DEDICATED_JP)||readers[0];
 if(read){const lang=judgeLanguage({...read,title});if(lang==='chinese-build'||lang==='decode-suspect'||lang==='not-japanese')return {step:lang,detail:read.id,detected:read.id};return {step:'ok',detail:read.id,detected:read.id};}
 if(preparing==='budget')return {step:'preparing',detail:'cx-budget-deferred',detected:null};
 if(unsupported?.code==='SCRIPT_NOT_JAPANESE')return {step:'not-japanese',detail:unsupported.engine,detected:unsupported.engine};
 if(unsupported)return {step:DECRYPT.test(unsupported.code)?'decrypt-failed':'parse-failed',detail:(unsupported.engine+':'+unsupported.code).slice(0,60),detected:null};
 const failedDecrypt=engines.find(e=>e.error&&!SOFT_ERROR.test(e.error)&&DECRYPT.test(e.error));if(failedDecrypt)return {step:'decrypt-failed',detail:failedDecrypt.id+':'+failedDecrypt.error,detected:null};
 if(preparing==='unpack')return {step:'preparing',detail:'cx-unpack',detected:null};
 if(preparing==='capture')return {step:'decrypt-failed',detail:'encrypted-archive',detected:null};
 const opened=engines.find(e=>e.scenes>0);if(opened)return {step:'parse-failed',detail:opened.id,detected:null};
 const errored=engines.find(e=>e.error&&e.error!=='BUDGET'&&!SOFT_ERROR.test(e.error));if(errored)return {step:'parse-failed',detail:errored.id+':'+errored.error,detected:null};
 const unknown=inv.archives.filter(a=>!fp.DOCUMENT.test(a.name)&&!fp.MEDIA.has(a.format)&&!fp.archiveInfo(a.name,a.magic).resource);
 /* S5 an archive that starts with zeros is not there yet (a Steam download preallocates, a copy stopped half way): say so, the reader is not the problem */
 const blank=inv.archives.find(a=>a.size>=4096&&/^0{16}$/.test(a.magic||'')&&/script|scenario|scene|scn|story|text|msg|nss/i.test(a.name));
 if(blank)return {step:'parse-failed',detail:'incomplete-file:'+String(blank.name).split('/').pop().slice(0,40),detected:null};
 const scenePck=unknown.find(a=>/(^|\/)scene\.pck$/i.test(a.name));if(scenePck)return {step:'unknown-pack',detail:'siglus-scene-pck',detected:null};
 /* an engine MeguLit can name but has no reader for: say which, not a bare unknown-pack */
 const known=fp.fingerprint(inv);if(known&&(unknown.length||(inv.markers||[]).length))return {step:'unsupported-engine',detail:known.engine,detected:null};if(unknown.length)return {step:'unknown-pack',detail:(garbroNeed?'needs-garbro:':'')+(unknown[0].format||'magic:'+unknown[0].magic.slice(0,8)),detected:null};
 if(inv.scripts)return {step:'parse-failed',detail:'loose-scripts',detected:null};
 return {step:'no-script',detail:'',detected:null};}

/* S5 the per-game budget grows with the game: big folders and many archives (8 GB KiriKiri, Unity with hundreds of
   bundles) ran out of the flat 90 s before a reader got to them. Never more than 4x the base. */
function scaledBudget(budgetMs,inv){const gb=(inv?.bytes||0)/2**30,n=(inv?.archives||[]).length;return Math.round(Math.min(budgetMs*4,budgetMs+gb*8000+n*1500));}
/* S5 the readers the evidence names: registry folder tests plus the inventory fingerprint, as scenes.cjs reader ids */
const norm=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function routedReaders(dir,inv){const out=[],add=ids=>{for(const i of ids||[])if(!out.includes(i))out.push(i);};let reg;try{reg=require('./original-engines/registry.cjs');}catch{}
 const known=fp.fingerprint(inv)?.engine;
 if(known&&reg){const k=norm(known);for(const [name,ids] of Object.entries(reg.READERS)){const n=norm(name),tokens=String(name).toLowerCase().split(/[^a-z0-9'-]+/).map(norm);if(n.startsWith(k)||tokens.includes(k))add(ids);}}
 if(known)try{add(Object.keys(require('./original-engines/scenes.cjs').ENGINES).filter(i=>norm(i)===norm(known)||i.startsWith(known+'-')));}catch{}
 try{add(reg?.readersFor(dir));}catch{}
 return {engine:known||null,readers:out};}
/* the Japanese lines under a Chinese build: {kind:'layer'|'backup',lines} or null (S9) */
function underlay(dir,id,executable){const scenes=require('./original-engines/scenes.cjs'),eng=scenes.ENGINES[id];
 if(eng?.originalLines){const lines=eng.originalLines(dir);if(Array.isArray(lines)&&lines.some(Boolean))return {kind:'layer',lines:lines.filter(Boolean)};}
 const ot=require('./original-text.cjs'),base=path.parse(String(executable||'')).name,b=ot.backupOriginal(dir,id,base);if(!b)return null;
 const loc=ot.locateBackup(id,b,base),r=loc?ot.readScript(loc):null;return r?.lines?{kind:'backup',lines:r.lines.filter(Boolean)}:null;}
function isWindowsDirectory(dir){
 const system=process.env.SystemRoot||process.env.windir;
 return !!(system&&dir&&path.isAbsolute(system)&&path.relative(path.toNamespacedPath(system),path.toNamespacedPath(dir))==='');
}
function probeInScope({dir,executable,title},{budgetMs=60000,progress=null}={}){
 if(isWindowsDirectory(dir))return {schema:'megulit.probe-result',version:1,step:'no-script',detail:'WINDOWS_DIRECTORY',fingerprint:null,
  inventory:{files:0,bytes:0,ext:{},archives:[]},engines:[],lines:0,japaneseLines:0};
 const t=Date.now();let fingerprint=null,deadline=t+budgetMs;
 /* S5 stages written as they finish: a worker killed on the budget still reports the inventory, the readers that
    ran and the stage it was in (the service reads this back, adapter-probe.cjs probeOne). #479 (2026-11-20, a probe that
    timed out with 0 files and no stage): the first report is written before anything touches the disk, and the folder
    walk itself stops at half the budget, so a huge or slow game folder still hands back what was counted. */
 let inv={files:0,bytes:0,ext:{},archives:[],scripts:0,markers:[]},route={readers:[]};
 const report=p=>{if(!progress)return;try{progress({at:Date.now(),budgetMs,inventory:{files:inv.files,bytes:inv.bytes,ext:inv.ext,scripts:inv.scripts,markers:inv.markers,archives:fp.tidy(inv.archives.map(({_path,...a})=>a))},routed:route.readers,...p,engines:(p.engines||[]).map(({sizes,...e})=>e)});}catch{}};
 report({stage:'fingerprint'});
 try{if(executable)fingerprint=require('./shared-adaptation.cjs').fingerprint(executable);}catch{}
 report({stage:'inventory'});
 inv=inventory(dir,{deadline:t+budgetMs/2});let unsupported=null,preparing=null;
 budgetMs=scaledBudget(budgetMs,inv);deadline=t+budgetMs;
 report({stage:'route'});
 route=routedReaders(dir,inv);
 report({stage:'cx-prepare'});
 /* cx archives are decrypted here, not by a background worker the probe would not wait for */
 try{require('./original-engines/scenes.cjs').cxPrepareSync(dir,{deadline:t+budgetMs/2});}catch{}
 try{const scenes=require('./original-engines/scenes.cjs');unsupported=scenes.unsupportedReason(dir);preparing=scenes.preparing(dir)?.kind||null;}catch{}
 report({stage:'native'});
 const native=nativeEngines(dir,executable),engines=[...native,...runEngines(dir,{deadline,routed:route.readers,progress:p=>report({...p,engines:[...native,...p.engines]})})];
 if(!unsupported&&engines.some(e=>e.id==='kogado'&&!e.lines&&e.error==='HYPACK_COCOTTE'))unsupported={engine:'kogado',code:'HYPACK_COCOTTE'};
 /* the engine that named the unsupported code is a reader that tried: list it (issue showed 'engines tried: -' next to cmvs:CMVS_CPZ7) */
 /* S5 GARbro fallback: no native reader found lines, and the GARbro pack supports the archives.
    unpack them now when the pack is installed (a probe never downloads it), else say the pack is what is missing */
 let garbroNeed=0;
 if(!engines.some(e=>e.lines>0))try{const g=require('./original-engines/garbro.cjs'),scenes=require('./original-engines/scenes.cjs');
  const files=scenes.ownCx(dir)?[]:g.archives(dir).filter(f=>{const c=g.cacheDir(f);return !g.readJson(path.join(c,'done.json'))&&g.readJson(path.join(c,'failed.json'))?.version!==g.version();});
  if(files.length&&g.installed()){report({stage:'garbro-unpack',engines});for(const f of files){const left=deadline-Date.now()-3000;if(left<5000)break;try{g.unpackSync(f,{timeout:left});}catch{}}
   const again=runEngines(dir,{deadline:Math.max(deadline,Date.now()+GENERIC_MS),only:['garbro']}).find(e=>e.id==='garbro');if(again){const i=engines.findIndex(e=>e.id==='garbro');if(i>=0)engines[i]=again;else engines.push(again);}}
  else if(files.length)garbroNeed=files.length;}catch{}
 {const named=unsupported?.engine&&engines.find(e=>e.id===unsupported.engine&&e.error==='NO_SCENES');if(named){named.error=String(unsupported.code||'').slice(0,60);named.scenes=-1;}}
 if(unsupported?.engine&&!engines.some(e=>e.id===unsupported.engine))engines.push({id:String(unsupported.engine),scenes:-1,parsed:0,lines:0,japaneseLines:0,dialogueLines:0,chineseLines:0,sizes:[],error:String(unsupported.code||'').slice(0,60),ms:0});
 if(!engines.some(e=>e.lines>0))try{const z=require('./original-engines/scenes.cjs').cxChineseOnly(dir);if(z)engines.push({id:'kirikiri-cx',scenes:1,parsed:1,lines:z.lines,japaneseLines:0,dialogueLines:z.lines,chineseLines:z.lines,error:'zh-patch-only',ms:0});}catch{}
 let c=classify({engines,inventory:inv,unsupported,preparing,title,garbroNeed}),original=null,restore=null;
 /* S9 (2026-11-19) a Chinese build that still holds the Japanese release (a patch layer over it, or the installer's backup
    folder) is read through the Japanese lines MeguLit adopts as the original (original-text.cjs), not the Chinese ones the
    game shows. Still Chinese: say whether the 日文原版恢复 tool can switch it (restore: state:adapter). */
 if(c.step==='chinese-build'&&c.detected)try{const u=underlay(dir,c.detected,executable),e=engines.find(x=>x.id===c.detected);if(u&&e){const k=countLines(u.lines);Object.assign(e,{lines:u.lines.length,japaneseLines:k.japanese,dialogueLines:k.dialogue,chineseLines:k.chinese,original:u.kind});original=u.kind;c=classify({engines,inventory:inv,unsupported,preparing,title,garbroNeed});}}catch{}
 if(c.step==='chinese-build')try{const r=require('../core/japanese-restore.cjs').detect(dir);restore=String(r.state||'')+(r.adapter?':'+r.adapter:'');}catch{}
 const best=engines.find(e=>e.id===c.detected);
 return {schema:'megulit.probe-result',version:1,reader:reader(),ms:Date.now()-t,fingerprint:fingerprint?{key:fingerprint.key,exe:maskString(fingerprint.exe),size:fingerprint.size}:null,
  inventory:{files:inv.files,bytes:inv.bytes,ext:inv.ext,scripts:inv.scripts,markers:inv.markers,engine:c.step==='unsupported-engine'?c.detail:'',archives:fp.tidy(inv.archives.map(({_path,...a})=>a))},
  engines:engines.map(({sizes,...e})=>e),detected:c.detected,lines:best?.lines||0,japaneseLines:best?.japaneseLines||0,dialogueLines:best?.dialogueLines||0,chineseLines:best?.chineseLines||0,sizes:best?.sizes||[],
  tried:engines.filter(e=>e.routed||e.scenes!==0).map(e=>e.id).slice(0,24),budgetMs,...garbroNeed&&c.step!=='not-japanese'?{needs:'garbro'}:{},step:c.step,detail:c.detail,original,restore,unsupported:unsupported?{engine:unsupported.engine,code:unsupported.code}:null,preparing,_archives:inv.archives.map(a=>a._path)};
}
function probeGame(game,options){return require('./original-engines/scenes.cjs').withCxProbe(()=>probeInScope(game,options));}
module.exports={probeGame,isWindowsDirectory,routedReaders,scaledBudget,classify,judgeLanguage,countLines,inventory,reader,MAGICS};
