// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
// E280 script engines read as a set of scene files (user, 2026-11-10: zero-latency bilingual for more engines).
// Each engine lists the running game's scene files and turns one file into text lines plus anchors (the parts a
// translation keeps unchanged: commands, file names, labels). A patch file with the same name lines up with the running
// one when it has as many lines and the same anchors.
//   kirikiri  plain XP3 archives and loose .ks files (encrypted archives are skipped: their filters are per game)
//   artemis   PFS archives (pf6 plain, pf8 XOR with the SHA-1 of the index) and loose .ast files
//   renpy     game/*.rpy; a patch is a tl/<language> folder of old/new pairs, matched by the original text
//   siglus    Steam dat/*.dbs language tables (Summer Pockets): Japanese column + the Chinese column
//   yuris     YU-RIS YPF archives (pac/ysbin.ypf + update*.ypf), YSTB scene files (yuris.cjs)
//   aquaplus  AQUAPLUS / Leaf KCAP script.pak string tables (aquaplus.cjs)
//   nscripter NScripter / ONScripter 0.txt or nscript.dat, one scene per label block (nscripter.cjs)
//   unity-text Unity TextAssets whose lines carry every language (unity-text.cjs)
//   higurashi 07th Expansion Unity StreamingAssets/Scripts/*.txt (higurashi.cjs)
//   mages     MAGES. USRDIR/script.mpk SC3 scenes, Japanese releases only; voices from voice.mpk (mages.cjs)
//   spike-wad Spike Chunsoft SDL2 ports (Steam ダンガンロンパ 1・2): *.wad .lin scripts, Japanese + a Chinese set (spike-wad.cjs)
//   rpgmaker  RPG Maker MV/MZ www/data JSON maps, common events, troops (rpgmaker.cjs)
//   wolf      WOLF RPG Editor Data/MapData/*.mps + BasicData/CommonEvent.dat, loose or in plain .wolf (wolf.cjs)
//   avg32      AVG32 TXT/SEEN.TXT PACL archives (ZERO 涙, avg32.cjs)
//   capcom-msg Capcom Unity Ace Attorney scriptmessage bundles, Japanese + the Chinese bundle (capcom-msg.cjs)
//   vgprompter Doki Doki Literature Club Plus! XOR'd language bundles, Japanese + Chinese by line hash (vgprompter.cjs)
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const xp3=require('./xp3.cjs');
const KANA=/[ぁ-ゖァ-ヺ]/g;
/* E577 kit.decodeText: BOM, strict UTF-8, then Shift-JIS / GBK */
const decode=kit.decodeText;
const ascii=t=>/^[\x20-\x7e]*$/.test(t);
const {stat}=require('./file-key.cjs');
/* E577 kit.walk (same folders skipped) */
const walk=(dir,depth,test,out=[])=>kit.walk(dir,depth,test,out);

// ---- KiriKiri -------------------------------------------------------------------------------------------------
// Text lines are what is left of a line after its tags; command lines (@...), labels (*...) and tag-only lines are
// anchors when they hold no text a translation would change.
function parseKs(buf){
 const lines=[],anchors=[],ruby=[],voices=[],vt=voiceRef.tracker();let script=false,cont=false;
 for(const raw of decode(buf).split(/\r?\n/)){const t=raw.trim();if(!t||t[0]===';')continue;
  // a command whose line ends in "\" goes on to the next line (女王蜂の王房 window positions)
  if(cont){vt.see(t);cont=t.endsWith('\\');continue;}if((t[0]==='@'||t[0]==='[')&&t.endsWith('\\')){vt.see(t);cont=true;continue;}
  // TJS between [iscript] and [endscript] is code, not text (女王蜂の王房 staff roll)
  if(/^[@[]iscript\b/i.test(t)){script=true;continue;}if(script){if(/^[@[]endscript\b/i.test(t))script=false;continue;}
  if(t[0]==='@'||t[0]==='*'){vt.see(t);if(ascii(t))anchors.push(t);continue;}
  // A tag whose name is Japanese is a macro that prints that word (女王蜂の王房: [輝夜] [めのう] for character names,
  // [輝夜ruby] with its reading, [漢字'よみ] for ruby); keep the word, drop the reading.
  const text=t.replace(/\[([぀-ヿ一-鿿々ー]+)(?:ruby|'[^\]]*)?\]/g,'$1').replace(/\[[^\]]*\]/g,'').trim();
  if(!text){vt.see(t);if(ascii(t))anchors.push(t);continue;}vt.see(t);/* E450 a speaker label line (【名前】) passes its voice on to the speech after it */if(!/^【[^】]*】$/.test(text))voices[lines.length]=vt.take();
  const pairs=[...t.matchAll(/\[([぀-ヿ一-鿿々ー]+)'([^\]]+)\]/g)].map(m=>[m[1],m[2]]);if(pairs.length)ruby[lines.length]=pairs;
  lines.push(text);}
 // the game's own readings ([漢字'よみ]), only when the script has any
 const out=ruby.length?{lines,anchors,ruby:lines.map((_,i)=>ruby[i]||null)}:{lines,anchors};const v=voiceRef.keep(lines.map((_,i)=>voices[i]||null));if(v)out.voices=v;return out;
}
function xp3Scenes(file,test){let t;try{t=xp3.list(file);}catch{return [];}if(!t)return [];
 // An entry flagged "protected" can still be stored as plain text (女王蜂の王房): try the first one and keep the
 // flagged ones when it reads as a script (UTF-16 BOM, or no control bytes at the start).
 const plain=e=>{try{const d=xp3.read(file,e);if(d[0]===0xff&&d[1]===0xfe)return true;for(let i=0;i<Math.min(d.length,512);i++)if(d[i]<9||(d[i]>13&&d[i]<32&&d[i]!==27))return false;return d.length>0;}catch{return false;}};
 const flagged=t.files.filter(e=>e.encrypted&&test(e.name)),open=flagged.length>0&&plain(flagged[0]);
 // E449 a cx archive of a title GARbro knows is decrypted with that title's filter (cx-filter.cjs).
 const cx=flagged.length&&!open?require('./cx-filter.cjs').forArchive(file):null;
 return t.files.filter(e=>(!e.encrypted||open||cx)&&test(e.name)).map(e=>({name:path.basename(e.name.replace(/\\/g,'/')),read:()=>xp3.read(file,e,open?null:cx)}));}
// E449 KAG scenarios kept as .txt under a scenario folder (赤ずきんと迷いの森: scenario/<route>/r04_23.txt); "!" files are lists.
const KS=n=>/\.ks$/i.test(n)||/(?:^|[\\/])scenario[\\/](?:[^\\/]+[\\/])*[^!\\/][^\\/]*\.txt$/i.test(n);
const kirikiri={
 id:'kirikiri',hint:'*.ks（或 patch.xp3）',
 // Later archives override earlier ones, as the engine loads them (data < patch < patch2 ...).
 scenes(dir){const out=new Map();
  for(const a of ksArchives(dir))for(const s of xp3Scenes(a,KS))out.set(s.name.toLowerCase(),s);
  for(const file of walk(dir,2,KS))out.set(path.basename(file).toLowerCase(),{name:path.basename(file),read:()=>fs.readFileSync(file)});
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:dir=>ksArchives(dir).flatMap(a=>xp3Scenes(a,KS)),
 sources:dir=>[...ksArchives(dir),...walk(dir,2,KS)],
 parse:parseKs,test:KS,
};
// Archives next to the game, then those in arc/ (女王蜂の王房 keeps scenario.xp3 there), later ones overriding.
function ksArchives(dir){const xp3=d=>{try{return fs.readdirSync(d).filter(f=>/\.xp3$/i.test(f)).sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b)).map(f=>path.join(d,f));}catch{return [];}};return [...xp3(path.join(dir,'arc')),...xp3(dir)];}
function rank(name){const m=name.toLowerCase().match(/^patch(\d*)\.xp3$/);return m?1+(+m[1]||0):0;}

// ---- Artemis --------------------------------------------------------------------------------------------------
function pfsList(file){
 const fd=fs.openSync(file,'r');
 try{const head=Buffer.alloc(7);fs.readSync(fd,head,0,7,0);if(head.toString('latin1',0,2)!=='pf'||!'68'.includes(String.fromCharCode(head[2])))return null;
  const size=head.readUInt32LE(3),index=Buffer.alloc(size);fs.readSync(fd,index,0,size,7);
  const pf8=head[2]===0x38,key=pf8?crypto.createHash('sha1').update(index).digest():null,count=index.readUInt32LE(0),files=[];let p=4;
  for(let i=0;i<count&&p+4<=index.length;i++){const len=index.readUInt32LE(p);p+=4;const name=new TextDecoder('utf-8').decode(index.subarray(p,p+len));p+=len;p+=4;const offset=index.readUInt32LE(p),length=index.readUInt32LE(p+4);p+=8;files.push({name,offset,size:length});}
  return {files,key};
 }finally{fs.closeSync(fd);}
}
function pfsRead(file,entry,key){const b=kit.readAt(file,entry.offset,entry.size);return key?kit.xor(b,key):b;}
const AST=n=>/\.ast$/i.test(n);
function pfsScenes(file){let t;try{t=pfsList(file);}catch{return [];}if(!t)return [];return t.files.filter(e=>AST(e.name)).map(e=>({name:path.basename(e.name.replace(/\\/g,'/')),read:()=>pfsRead(file,e,t.key)}));}
// Quoted strings in file order: the ones with any non-ASCII character are text, the rest are anchors.
/* E352 multilingual Artemis (Steam The Shell: every message is text = { ja = {...}, en = {...}, tw = {...}, cn = {...} }):
   the Japanese table is the line, the release's own Simplified (else Traditional) Chinese is its translation, and
   {"ruby", text="よみ"} before a base string is the game's own reading. Pages of one message are joined by a newline. */
function luaBlock(text,open){let depth=0,q=false;for(let i=open;i<text.length;i++){const c=text[i];if(q){if(c==='\\'){i++;continue;}if(c==='"')q=false;continue;}if(c==='"'){q=true;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return i;}return -1;}
function luaLang(block){/* {{ "text", {"ruby", text="よみ"}, "base", {"/ruby"}, ... }, {...next page} } */
 const pages=[],ruby=[];let depth=0,page='',pending=null,i=0;
 while(i<block.length){const c=block[i];
  if(c==='"'){let j=i+1,s='';while(j<block.length&&block[j]!=='"'){if(block[j]==='\\'){s+=block[j+1];j+=2;continue;}s+=block[j++];}
   if(depth===2){page+=s;if(pending){ruby.push([s,pending]);pending=null;}}i=j+1;continue;}
  if(c==='{'){if(depth===2){const end=luaBlock(block,i),tag=block.slice(i,end+1),r=/^\{\s*"ruby"\s*,\s*text\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(tag);if(r)pending=r[1];i=end+1;continue;}depth++;if(depth===2)page='';}
  else if(c==='}'){if(depth===2&&page)pages.push(page);depth--;}
  i++;}
 return {text:pages.join('\n'),ruby};}
function parseAstMulti(text){const lines=[],zh=[],ruby=[],anchors=[],re=/\btext\s*=\s*\{/g;let m,last=0;
 while((m=re.exec(text))){const open=text.indexOf('{',m.index),end=luaBlock(text,open);if(end<0)break;
  for(const a of text.slice(last,m.index).matchAll(/"((?:[^"\\]|\\.)*)"/g))if(ascii(a[1]))anchors.push(a[1]);
  const block=text.slice(open,end+1),langs={};for(const k of block.matchAll(/\b(ja|cn|tw|en)\s*=\s*\{/g)){const o=k.index+k[0].length-1,e=luaBlock(block,o);if(e>0&&!(k[1] in langs))langs[k[1]]=luaLang(block.slice(o,e+1));}
  if(langs.ja){lines.push(langs.ja.text);zh.push((langs.cn||langs.tw)?.text||'');ruby.push(langs.ja.ruby.length?langs.ja.ruby:null);}
  last=end+1;re.lastIndex=end+1;}
 return {lines,anchors,zh,ruby};}
function parseAst(buf){const lines=[],anchors=[],text=decode(buf),re=/"((?:[^"\\]|\\.)*)"/g;let m;
 if(/\btext\s*=\s*\{\s*ja\s*=\s*\{/.test(text))return parseAstMulti(text);
 while((m=re.exec(text))){const s=m[1].replace(/\\(.)/g,'$1');if(ascii(s))anchors.push(s);else lines.push(s);}
 return {lines,anchors};}
const isPfs=f=>/\.pfs(?:\.\d+)?$/i.test(f);
const artemis={
 id:'artemis',hint:'*.ast（或 .pfs）',
 scenes(dir){const out=new Map();for(const a of fs.readdirSync(dir).filter(isPfs).sort())for(const s of pfsScenes(path.join(dir,a)))out.set(s.name.toLowerCase(),s);
  for(const file of walk(dir,3,AST))out.set(path.basename(file).toLowerCase(),{name:path.basename(file),read:()=>fs.readFileSync(file)});
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:dir=>fs.readdirSync(dir).filter(isPfs).flatMap(a=>pfsScenes(path.join(dir,a))),
 sources:dir=>[...fs.readdirSync(dir).filter(isPfs).map(f=>path.join(dir,f)),...walk(dir,3,AST)],
 parse:parseAst,test:AST,
 // E352: a multilingual release carries its own Chinese; other games fall back to the usual patch overlay.
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
};

// ---- Ren'Py ---------------------------------------------------------------------------------------------------
const RPY=n=>/\.rpy$/i.test(n);
const SAY=/^\s*(?:[A-Za-z_][\w.]*\s+)?(?:[A-Za-z_][\w.]*\s+)*"((?:[^"\\]|\\.)*)"\s*(?:with\s+\w+)?\s*$/;
const unq=s=>s.replace(/\\n/g,'\n').replace(/\\(.)/g,'$1');
function parseRpy(buf){const lines=[],anchors=[];let skip=false;
 for(const raw of decode(buf).split(/\r?\n/)){
  if(/^translate\s/.test(raw)){skip=true;continue;}if(skip&&/^\S/.test(raw))skip=false;if(skip)continue;
  const t=raw.trim();if(!t||t[0]==='#')continue;
  const m=raw.match(SAY);if(m&&!/^\s*(?:old|new|define|default|\$|image|play|show|scene|jump|call)\b/.test(raw)){lines.push(unq(m[1]));continue;}
  if(ascii(t))anchors.push(t);}
 return {lines,anchors};}
const gameDir=dir=>fs.existsSync(path.join(dir,'game'))?path.join(dir,'game'):dir;
const outsideTl=file=>!/[\\/]tl[\\/]/i.test(file);
// Old/new pairs of every language folder under tl/: dialogue blocks (# who "old" then who "new") and string blocks.
function tlPairs(files){const langs=new Map();
 for(const file of files){const m=file.match(/[\\/]tl[\\/]([^\\/]+)[\\/]/i);if(!m||/^none$/i.test(m[1]))continue;const pairs=langs.get(m[1])||new Map();langs.set(m[1],pairs);
  let text;try{text=decode(fs.readFileSync(file));}catch{continue;}let old=null;
  for(const raw of text.split(/\r?\n/)){const t=raw.trim();
   let m2=t.match(/^#\s*(?:[A-Za-z_][\w.]*\s+)*"((?:[^"\\]|\\.)*)"/);if(m2){old=unq(m2[1]);continue;}
   m2=t.match(/^old\s+"((?:[^"\\]|\\.)*)"/);if(m2){old=unq(m2[1]);continue;}
   m2=t.match(/^(?:new\s+|(?:[A-Za-z_][\w.]*\s+)*)"((?:[^"\\]|\\.)*)"/);if(m2&&old!==null){pairs.set(old,unq(m2[1]));old=null;}}}
 return langs;}
/* E566 compiled scripts: a game without .rpy sources is read from its .rpyc files (loose or in .rpa archives), and a
   compiled tl/<language> translation pairs by the translate identifier of each line (renpy-rpyc.cjs). */
const rpyc=require('./renpy-rpyc.cjs');
function renpyScenes(dir){const g=gameDir(dir),out=new Map();
 for(const [key,s] of rpyc.scripts(g))out.set(key,{name:key,read:s.read});
 for(const file of walk(g,4,RPY).filter(outsideTl)){const name=path.relative(g,file).replace(/\\/g,'/').toLowerCase();out.set(name,{name,read:()=>fs.readFileSync(file)});}
 return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));}
/* compiled tl files of a patch (or of the game's own tl folders): per language, id -> text and old -> new */
function rpycTl(dirs){const langs=new Map(),add=buf=>{const t=rpyc.translations(buf);if(!t.lang||/^none$/i.test(t.lang))return;const l=langs.get(t.lang)||{ids:new Map(),strings:new Map()};langs.set(t.lang,l);for(const [k,v] of t.ids)if(!l.ids.has(k))l.ids.set(k,v);for(const [k,v] of t.strings)if(!l.strings.has(k))l.strings.set(k,v);};
 const seen=new Set();for(const d of dirs){let names;try{names=fs.readdirSync(d);}catch{continue;}
  for(const n of names){const f=path.join(d,n),k=f.toLowerCase();if(seen.has(k))continue;seen.add(k);
   if(/\.rpyc$/i.test(n)&&/[\\/]tl[\\/]/i.test(f)){try{add(fs.readFileSync(f));}catch{}}
   else if(/\.rpa$/i.test(n)){let idx;try{idx=rpyc.rpaIndex(f);}catch{continue;}if(!idx)continue;for(const [name,e] of idx)if(/(^|\/)tl\/[^/]+\/.*\.rpyc$/i.test(name))try{add(rpyc.rpaRead(f,e));}catch{}}}}
 return langs;}
const chineseScore=values=>{let score=0;for(const v of values)if(/[一-鿿]/.test(v)&&!(v.match(KANA)||[]).length)score++;return score;};
const renpy={
 id:'renpy',hint:'game\\tl\\<语言> 文件夹',
 scenes:renpyScenes,
 archives:()=>[],sources:dir=>{const g=gameDir(dir);return [...walk(g,4,RPY).filter(outsideTl),...walk(g,4,n=>/\.rpyc$/i.test(n)).filter(outsideTl),...walk(g,3,n=>/\.rpa$/i.test(n))];},
 parse:buf=>rpyc.isRpyc(buf)?rpyc.parse(buf):parseRpy(buf),test:n=>RPY(n)||/\.rpyc$/i.test(n),
 // The patch: the tl language whose translations are most Chinese. A source line is looked up by its text (.rpy tl,
 // old/new string tables) and, for compiled scripts, by its translate identifier (E566).
 patchLines(base,found){
  const files=found.dirs.flatMap(d=>{try{return fs.readdirSync(d).filter(RPY).map(f=>path.join(d,f));}catch{return [];}});
  let best=null,bestScore=0;
  for(const [,pairs] of tlPairs(files)){const score=chineseScore(pairs.values());if(score>bestScore){best=pairs;bestScore=score;}}
  let comp=null,compScore=0;
  for(const [,l] of rpycTl(found.dirs)){const score=chineseScore([...l.ids.values(),...l.strings.values()]);if(score>compScore){comp=l;compScore=score;}}
  if(!best&&!comp)return null;
  const lookup=(t,id)=>{if(comp&&id&&comp.ids.has(id))return comp.ids.get(id);if(best&&best.has(t))return best.get(t);if(comp&&comp.strings.has(t))return comp.strings.get(t);return null;};
  return base.map(scene=>{let hit=false;const lines=scene.lines.map((t,k)=>{const v=lookup(t,scene.ids?.[k]);if(v==null)return t;hit=true;return v;});return {...scene,patched:hit,lines};});
 },
};

// ---- Siglus (Steam multi-language) ---------------------------------------------------------------------------
// Steam releases keep every line in dat/*.dbs tables with one column per language. The running table's Japanese column
// gives the lines; the Chinese column comes from the same table before MeguLit's Japanese restore (its backup in
// .megulit-japanese), from the table itself when it was never restored, or from a <name>_zh.dbs twin.
const siglusTables=()=>require('../../core/japanese-restore.cjs')._internal;
const DBS=n=>/\.dbs$/i.test(n)&&!/_(?:en|zh|cn|tw|ko|ru)\.dbs$/i.test(n);
const HAN=/[\u4e00-\u9fff]/,KANA1=/[\u3040-\u30ff]/;
function dbsTable(buf){const t=siglusTables(),d=t.decrypt(buf);return t.parse(d.raw,d.marker);}
function columnShares(table){return table.columns.map((c,i)=>{if(c.type!==0x53)return null;let filled=0,kana=0,han=0;for(const r of table.cells){const v=r[i];if(!v)continue;filled++;if(KANA1.test(v))kana++;else if(HAN.test(v))han++;}return {index:i,filled,kana:filled?kana/filled:0,han:filled?han/filled:0};}).filter(Boolean);}
function parseDbs(buf){const table=dbsTable(buf),cols=columnShares(table).filter(c=>c.filled);const jp=cols.sort((a,b)=>b.kana-a.kana)[0];
 if(!jp||jp.kana<.3)return {lines:[],anchors:[],rows:table.rows};return {lines:table.cells.map(r=>String(r[jp.index]||'')),anchors:[],rows:table.rows};}
/* E286 (user report 2026-11-10, CLANNAD: the speaker name was given as each line's translation and drawn into the
   game): a name column (【朋也】) is all kanji too. A translation column is filled on most rows the Japanese is filled,
   and its values are mostly different from each other; names repeat. */
function chineseColumn(table,jp){if(table.rows!==jp.length)return null;
 const rowsJp=jp.map((t,r)=>t?r:-1).filter(r=>r>=0);if(!rowsJp.length)return null;
 const c=columnShares(table).filter(c=>{if(c.filled<table.rows*.3||c.kana>=.1||c.han<=.5)return false;
  let paired=0;const distinct=new Set();for(const r of rowsJp){const v=table.cells[r][c.index];if(!v)continue;paired++;distinct.add(v);}
  return paired>=rowsJp.length*.6&&distinct.size>=paired*.5;}).sort((a,b)=>b.han-a.han)[0];
 return c?table.cells.map(r=>String(r[c.index]||'')):null;}
const siglusDat=dir=>{const d=path.join(dir,'dat');try{return fs.readdirSync(d).some(DBS)?d:'';}catch{return '';}};
const siglus={
 id:'siglus',hint:'dat\*.dbs',
 scenes(dir){const d=siglusDat(dir);if(!d)return [];return fs.readdirSync(d).filter(DBS).sort().map(f=>({name:f,read:()=>fs.readFileSync(path.join(d,f))}));},
 archives:()=>[],sources:dir=>{const d=siglusDat(dir);return d?fs.readdirSync(d).filter(DBS).map(f=>path.join(d,f)):[];},
 parse:parseDbs,test:DBS,
 // E450 voices: the release's Scene.pck keeps its original sources, where a KOE call comes before each spoken line
 voiceLines:dir=>require('./siglus-source.cjs').voiceLines(dir),
 /* 2026-11-13 (Summer Pockets Steam, Chinese install: the opening poem is a picture of the Chinese column's text): every other
    language column of a table gives back the row's Japanese line. Read from the tables as shipped (MeguLit's Japanese
    restore keeps them in .megulit-japanese), so restored tables still know their other languages. */
 foreign(dir){const key=require('../original-text.cjs').foreignKey,out=new Map(),seq=[],d=siglusDat(dir);out.seq=seq;if(!d)return out;
  for(const f of fs.readdirSync(d).filter(DBS)){let buf;for(const p of [path.join(dir,'.megulit-japanese','dat',f),path.join(d,f)]){try{buf=fs.readFileSync(p);break;}catch{}}if(!buf)continue;
   let table;try{table=dbsTable(buf);}catch{continue;}const cols=columnShares(table).filter(c=>c.filled);const jp=cols.slice().sort((a,b)=>b.kana-a.kana)[0];if(!jp||jp.kana<.3)continue;
   for(const c of cols){if(c.index===jp.index||c.kana>=.1)continue;for(const r of table.cells){const ja=String(r[jp.index]||''),v=String(r[c.index]||'');if(!ja||!v||!KANA1.test(ja)&&!HAN.test(ja))continue;const k=key(v);if(k.length<2)continue;seq.push([k,ja,v]);const had=out.get(k);/* one translation for several lines: narration before a quoted line (art text is narration) */if(!had||/^[「『（(]/.test(had)&&!/^[「『（(]/.test(ja))out.set(k,ja);}}}
  return out;},
 patchLines(base,found){
  const dirs=[...new Set(found.dirs.flatMap(d=>[d,path.join(d,'.megulit-japanese','dat'),path.join(d,'dat')]))];let any=false;
  const list=base.map(scene=>{const stem=scene.name.replace(/\.dbs$/i,'');
   for(const d of dirs)for(const name of [scene.name,stem+'_zh.dbs',stem+'_cn.dbs',stem+'_tw.dbs']){const file=path.join(d,name);let buf;try{buf=fs.readFileSync(file);}catch{continue;}
    let lines;try{lines=chineseColumn(dbsTable(buf),scene.lines);}catch{continue;}if(!lines)continue;any=true;
    return {...scene,patched:true,lines:lines.map((t,k)=>t||scene.lines[k])};}
   return scene;});
  // Partial translations count (user, 2026-11-10: CLANNAD's ZH-TW system menu table is a real translation; use what is there).
  return any?list:null;
 },
};

// ---- KiriKiri Z, cx-encrypted (Steam releases: 千恋＊万花, サノバウィッチ, ATRI ...) ---------------------------------
// The scene files (.scn PSB) carry every line in all the release's languages: Japanese, English, Simplified and
// Traditional Chinese. They are decrypted once in a worker (psb.cjs, cx-worker.cjs) and cached; until the cache is
// ready the game reads as not yet readable and the next check picks it up.
const os=require('node:os');
const MEDIA_XP3=/^(?:bg|fg|ev|sd)?image|^(?:bgm|voice|sound|se|movie|video|thum|emote|font|sysse)/i;
const cxArchives=dir=>{try{return fs.readdirSync(dir).filter(f=>/\.xp3$/i.test(f)&&!MEDIA_XP3.test(f)).map(f=>path.join(dir,f));}catch{return [];}};
const cxCache=file=>{const st=fs.statSync(file);return path.join(os.tmpdir(),'megulit-cx',crypto.createHash('sha256').update(path.resolve(file).toLowerCase()+'|'+st.size+'|'+st.mtimeMs+'|4').digest('hex').slice(0,24)+'.json');};
const cxBuilds=new Map(),cxMemo=new Map(),cxQueue=[],cxStarted=new Map();let cxRunning=false;
function cxDocs(file){
 let out;try{out=cxCache(file);}catch{return null;}
 try{const st=fs.statSync(out),hit=cxMemo.get(out);if(hit&&hit.at===st.mtimeMs)return hit.docs;const docs=JSON.parse(fs.readFileSync(out,'utf8')).docs||[];cxMemo.set(out,{at:st.mtimeMs,docs});return docs;}catch{}
 if(!cxBuilds.has(out)){
  // Only archives that look like cx KiriKiri (encrypted entries) are worth a worker; one worker at a time.
  let list;try{list=xp3.list(file);}catch{list=null;}if(!list||!list.files.some(e=>e.encrypted))return [];
  cxBuilds.set(out,null);cxStarted.set(out,Date.now());cxQueue.push({file,out});cxNext();
 }
 return null;
}
function cxNext(){
 if(cxRunning||!cxQueue.length)return;const {file,out}=cxQueue.shift();cxRunning=true;
 const {Worker}=require('node:worker_threads');let w;try{w=new Worker(path.join(__dirname,'cx-worker.cjs'),{workerData:{file,out}});}catch{cxRunning=false;cxBuilds.delete(out);return cxNext();}
 cxBuilds.set(out,w);let finished=false;const done=()=>{if(finished)return;finished=true;cxBuilds.delete(out);cxRunning=false;cxNext();};
 w.once('message',done);w.once('error',done);w.once('exit',done);w.unref?.();
}
/* A translation slot that marks speech with ASCII quotes ("救救我——" for 「誰か助けて――」; ATRI: 6766 of 11205 Chinese
   lines) takes the Japanese line's own brackets instead; "" inside is one quote. A slot already holding the bracket
   ("（虽然…）") only loses the quotes. */
const PAIRS={'「':'」','『':'』','（':'）','(':')'};
function unquoteSlot(t,ja){if(t.length<2||!/^"[\s\S]*"$/.test(t)||/^"/.test(ja))return t;const inner=t.slice(1,-1).replace(/""/g,'"'),open=ja.charAt(0),close=PAIRS[open];
 if(!close||!ja.trimEnd().endsWith(close)||inner.startsWith(open))return inner;return open+inner+close;}
const kirikiriCx={
 id:'kirikiri-cx',hint:'scn.xp3 / data.xp3',
 // One copy per scene file: patch archives override the rest, as the engine loads them (patch < patch2 < ...).
 scenes(dir){const byName=new Map();
  for(const file of cxArchives(dir)){const docs=cxDocs(file);if(!docs)continue;const r=rank(path.basename(file));
   for(const d of docs){const key=(d.name||d.entry).toLowerCase(),seen=byName.get(key);if(!seen||r>seen.r)byName.set(key,{r,name:d.name||d.entry,d});}}
  return [...byName.values()].map(x=>({name:x.name,read:()=>Buffer.from(JSON.stringify(x.d))})).sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:dir=>cxArchives(dir).flatMap(f=>{let c='';try{c=cxCache(f);}catch{}return c?[f,c]:[f];}),
 // ruby: the game's own readings for each Japanese line ([base, reading] pairs), used before any dictionary reading.
 parse(buf){const doc=JSON.parse(buf.toString('utf8')),lines=[],zh=[],ruby=[],voices=[];
  /* the Chinese slot is found by its text (ATRI: ja/en/zh-Hans/zh-Hant; PureStation: ja/zh-Hans/zh-Hant; 9-nine-: ja/en/zh-Hant) */
  const slot=chineseSlot(doc.scenes.flatMap(s=>s.rows)),order=slot>0?[slot]:[2,3];
  for(const scene of doc.scenes)scene.rows.forEach((row,k)=>{lines.push(row[0]||'');zh.push(unquoteSlot(order.map(i=>row[i]).find(Boolean)||'',row[0]||''));ruby.push(scene.ruby?.[k]?.length?scene.ruby[k]:null);voices.push(scene.voices?.[k]||null);});
  const v=voiceRef.keep(voices);return v?{lines,anchors:[],zh,ruby,voices:v}:{lines,anchors:[],zh,ruby};},
 test:()=>false,
 // The release's own Simplified (else Traditional) Chinese slot is the translation of each Japanese line.
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
};

// ---- KiriKiri Z with strong archive encryption (E293: サノバウィッチ): scene files the game decrypts itself ------------
// The archives cannot be read from disk, so MeguLitScn32/64.dll (native/scncapture, loaded with the hook) saves every
// .scn the engine opens, already decrypted, to cache/kirikiri-scn/<key>/ (key: FNV-1a of the lower-case game folder;
// game.txt there names the folder). The scenes those files lead to and the game has not opened yet go to want.txt in
// the same folder, and the DLL opens them once. Until the first scene is saved the game is not readable yet; the
// provider (original-text.cjs) picks new scenes up while the game runs. Same language slots as kirikiri-cx.
const cxText=()=>require('./cx-worker.cjs'),psb=require('./psb.cjs');
const captureRoot=()=>process.env.MEGULIT_SCN_CAPTURE||path.join(__dirname,'..','..','cache','kirikiri-scn');
function captureKey(dir){const s=path.resolve(dir).replace(/[\\/]+$/,'');let h=0x811c9dc5;
 for(let i=0;i<s.length;i++){let c=s.charCodeAt(i);if(c>=65&&c<=90)c+=32;h=Math.imul(h^c,16777619)>>>0;}return h.toString(16).padStart(8,'0');}
// The folder for this game: by key, else the one whose game.txt names it (another spelling of the same path).
function captureDir(dir){const root=captureRoot(),own=path.join(root,captureKey(dir));if(fs.existsSync(own))return own;
 let names=[];try{names=fs.readdirSync(root);}catch{return own;}const want=path.resolve(dir).toLowerCase();
 for(const n of names){try{if(path.resolve(fs.readFileSync(path.join(root,n,'game.txt'),'utf8').trim()).toLowerCase()===want)return path.join(root,n);}catch{}}
 return own;}
const SCN=n=>/\.scn$/i.test(n);
// Changes whenever the DLL saves a file (it writes by rename, which touches the folder it writes to).
function captureStamp(dir){const d=captureDir(dir);let out='';try{out=String(fs.statSync(d).mtimeMs);for(const e of fs.readdirSync(d,{withFileTypes:true}))if(e.isDirectory())out+='|'+fs.statSync(path.join(d,e.name)).mtimeMs;}catch{}return out;}
const dumpMemo=new Map();
// One saved file: its text (as kirikiri-cx stores it) and the scene files it names (nexts, storage references).
function dumpDoc(file){
 let st;try{st=fs.statSync(file);}catch{return null;}const key=st.size+'|'+st.mtimeMs,hit=dumpMemo.get(file);if(hit&&hit.key===key)return hit.doc;
 let doc=null;
 try{const raw=fs.readFileSync(file);let psbDoc=null;try{psbDoc=psb.parse(raw);}catch{psbDoc=psb.openCx(raw);}
  if(psbDoc?.root&&typeof psbDoc.root==='object'){const refs=new Set();let seen=0;
   (function walk(v,depth){if(seen++>200000||depth>40)return;if(typeof v==='string'){if(/\.(?:ks|scn)$/i.test(v)&&v.length<300)refs.add(v);}else if(v&&typeof v==='object')for(const k in v)walk(v[k],depth+1);})(psbDoc.root,0);
   doc={name:typeof psbDoc.root.name==='string'&&psbDoc.root.name?psbDoc.root.name:path.basename(file),file:path.basename(file),scenes:cxText().textsOf(psbDoc),refs:[...refs]};}
 }catch{}
 dumpMemo.set(file,{key,doc});if(dumpMemo.size>4000)dumpMemo.delete(dumpMemo.keys().next().value);return doc;
}
function dumpFiles(dir){const d=captureDir(dir);try{return fs.readdirSync(d).filter(SCN).sort().map(f=>path.join(d,f));}catch{return [];}}
function dumpDocs(dir){const byName=new Map();for(const f of dumpFiles(dir)){const doc=dumpDoc(f);if(doc&&!byName.has(doc.name.toLowerCase()))byName.set(doc.name.toLowerCase(),doc);}return [...byName.values()];}
// want.txt: storage names the saved scenes refer to and nobody has saved yet, spelled the way the game opens them
// (the saved file name is the scene's own name plus the suffix the engine adds, usually ".scn").
function wantedScenes(docs){
 const have=new Set(),suffixes=new Map();
 for(const d of docs){have.add(d.name.toLowerCase());have.add(d.file.toLowerCase());
  if(d.file.toLowerCase().startsWith(d.name.toLowerCase())&&d.file.length>d.name.length){const sfx=d.file.slice(d.name.length);suffixes.set(sfx,(suffixes.get(sfx)||0)+1);}}
 const suffix=[...suffixes].sort((a,b)=>b[1]-a[1])[0]?.[0]||'.scn',out=new Set();
 for(const d of docs)for(const ref of d.refs){const base=ref.replace(/^.*[\\/>]/,'');if(!base||have.has(base.toLowerCase()))continue;
  const name=SCN(base)?base:base+suffix;if(!have.has(name.toLowerCase()))out.add(name);}
 return [...out].sort();
}
function syncWants(dir,docs){if(!docs.length)return;const d=captureDir(dir),file=path.join(d,'want.txt'),text=wantedScenes(docs).join('\r\n');
 let old=null;try{old=fs.readFileSync(file,'utf8');}catch{}if(old===text||!text&&old===null)return;
 try{fs.writeFileSync(file+'.tmp',text);fs.renameSync(file+'.tmp',file);}catch{}}
const HANS=/[们这说话时个来对没还让门见问题电车为样边过东华爱头间学认长听写书钱后于]/g,HANT=/[們這說話時個來對沒還讓門見問題電車為樣邊過東華愛頭間學認長聽寫書錢後於]/g,KANA_ANY=/[ぁ-ゖァ-ヺ]/;
function chineseSlot(rows){const width=Math.max(0,...rows.slice(0,4000).map(r=>r.length)),score=[];
 for(let i=1;i<width;i++){let chinese=0,hans=0,hant=0;for(const r of rows.slice(0,4000)){const t=r[i]||'';if(!t||KANA_ANY.test(t)||!/[一-鿿]/.test(t))continue;chinese++;hans+=(t.match(HANS)||[]).length;hant+=(t.match(HANT)||[]).length;}
  score.push({i,chinese,simplified:hans>hant});}
 const usable=score.filter(x=>x.chinese>=Math.max(3,rows.filter(r=>r[0]).length*.3));
 return (usable.find(x=>x.simplified)||usable[0])?.i||-1;}
const kirikiriDump={
 id:'kirikiri-dump',hint:'scn.xp3（运行中由游戏读出）',live:true,
 scenes(dir){const docs=dumpDocs(dir);syncWants(dir,docs);
  return docs.filter(d=>d.scenes.length).map(d=>({name:d.name,read:()=>Buffer.from(JSON.stringify({name:d.name,scenes:d.scenes}))})).sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:dir=>dumpFiles(dir),
 // The Chinese slot is found by its text, not assumed: Simplified first, else Traditional (slot 0 is Japanese).
 parse(buf){const doc=JSON.parse(buf.toString('utf8')),rows=[],ruby=[];
  for(const scene of doc.scenes)scene.rows.forEach((row,k)=>{rows.push(row);ruby.push(scene.ruby?.[k]?.length?scene.ruby[k]:null);});
  const slot=chineseSlot(rows);
  return {lines:rows.map(r=>r[0]||''),anchors:[],zh:rows.map(r=>slot>0?r[slot]||'':''),ruby};},
 test:()=>false,
 patchLines:(base,found)=>kirikiriCx.patchLines(base,found),
 // KiriKiri Z with the PSB plug-in: worth a live provider before its first scene is saved.
 eligible(dir){try{return fs.existsSync(captureDir(dir))||fs.existsSync(path.join(dir,'plugin','psbfile.dll'))&&fs.readdirSync(dir).some(f=>/\.xp3$/i.test(f));}catch{return false;}},
 // Changes whenever the DLL saves a file (it writes by rename, which touches the folder).
 stamp:dir=>captureStamp(dir),
 captureDir,captureKey,wantedScenes,
};

// ---- KiriKiri 2 with cx-style text encryption, played through a packed Chinese build (E296: 魔法使いの夜) ---------------
// The Japanese scripts in data.xp3 are decrypted from their own text (ks-cx.cjs). The Chinese build is one packed program
// whose scripts exist only in memory, so MeguLitScn32.dll asks the running game for every scenario file by name (want.txt
// lists them) and saves what the engine returns to run-<program>/ in the capture folder. The running (Chinese) script is
// that folder; the Japanese one lines up with it file by file and is the original (original-text.cjs, original mode).
const ksCx=require('./ks-cx.cjs'),ksMemo=new Map();
function encryptedKs(dir){const out=new Map();
 for(const a of cxArchives(dir).sort((x,y)=>rank(path.basename(x))-rank(path.basename(y)))){let t;const k=a+'|'+stat(a),hit=ksMemo.get(k);
  if(hit)t=hit;else{try{t=xp3.list(a);}catch{t=null;}ksMemo.set(k,t);}
  if(!t)continue;for(const e of t.files)if(e.encrypted&&KS(e.name)){const name=path.basename(e.name.replace(/\\/g,'/'));out.set(name.toLowerCase(),{name,entry:e,archive:a});}}
 return out;}
const ksText=new Map();
function japaneseKs(item){const k=item.archive+'|'+item.entry.name+'|'+stat(item.archive);if(ksText.has(k))return ksText.get(k);
 let text=null;try{text=ksCx.decryptText(xp3.read(item.archive,item.entry))?.text??null;}catch{}ksText.set(k,text);if(ksText.size>3000)ksText.delete(ksText.keys().next().value);return text;}
// The run folder holding the Chinese build's scripts (most lines Chinese), newest first when there are several.
function chineseRun(dir){const d=captureDir(dir);let runs=[];try{runs=fs.readdirSync(d,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^run-/i.test(e.name)).map(e=>path.join(d,e.name));}catch{return null;}
 const scored=runs.map(r=>{let zh=0,ja=0,at=0;try{at=fs.statSync(r).mtimeMs;for(const f of fs.readdirSync(r).filter(KS).slice(0,40)){const {lines}=parseKs(fs.readFileSync(path.join(r,f)));for(const t of lines){const k=(t.match(KANA)||[]).length;if(k>=2)ja++;else if(/[一-鿿]{2}/.test(t))zh++;}}}catch{}return {r,zh,ja,at};});
 return scored.filter(x=>x.zh>x.ja).sort((a,b)=>b.at-a.at)[0]?.r||null;}
function syncKsWants(dir,names){if(!names.length)return;const d=captureDir(dir),file=path.join(d,'want.txt'),text=names.sort().join('\r\n');
 let old=null;try{old=fs.readFileSync(file,'utf8');}catch{}if(old===text)return;
 try{fs.mkdirSync(d,{recursive:true});fs.writeFileSync(file+'.tmp',text);fs.renameSync(file+'.tmp',file);}catch{}}
const kirikiriKs={
 id:'kirikiri-ks',hint:'data.xp3（汉化版运行中读出）',live:true,
 scenes(dir){const enc=encryptedKs(dir);syncKsWants(dir,[...enc.values()].map(x=>x.name));const run=chineseRun(dir);if(!run)return [];
  let files=[];try{files=fs.readdirSync(run).filter(KS);}catch{}
  return files.map(f=>({name:f,read:()=>fs.readFileSync(path.join(run,f))})).sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:dir=>{const run=chineseRun(dir);try{return run?fs.readdirSync(run).filter(KS).map(f=>path.join(run,f)):[];}catch{return [];}},
 parse:parseKs,test:()=>false,
 // Japanese lines in the running script's order: a file lines up when it has as many text lines and the same anchors.
 originalLines(dir){const enc=encryptedKs(dir);
  return this.scenes(dir).flatMap(s=>{let own;try{own=parseKs(s.read());}catch{return [];}const item=enc.get(s.name.toLowerCase()),text=item&&japaneseKs(item);
   if(!text)return own.lines.map(()=>'');const ja=parseKs(Buffer.from('\ufeff'+text,'utf16le'));
   const n=Math.min(ja.anchors.length,own.anchors.length);let same=0;for(let k=0;k<n;k++)if(ja.anchors[k]===own.anchors[k])same++;
   if(ja.lines.length!==own.lines.length||own.anchors.length>=5&&same<own.anchors.length*.9)return own.lines.map(()=>'');
   return ja.lines;});},
 /* E414: a multilingual release keeps plain scripts under the encrypted flag; kirikiri-lang reads them. */
 eligible(dir){if(krkrLang.archives(dir))return false;const enc=encryptedKs(dir);if(!enc.size)return false;const first=[...enc.values()].find(x=>x.entry.size>2000)||enc.values().next().value;return !!japaneseKs(first);},
 stamp:dir=>captureStamp(dir),
 japaneseKs,encryptedKs,
};

// ---- HuneX (E304: 魔法使いの夜 / WITCH ON THE HOLY NIGHT, Steam) ------------------------------------------------------
// Every line lives in per-language text tables inside the HFA archives (hunex.cjs); line i is the same line in each.
// The whole table is one scene: Japanese lines, the release's Simplified (else Traditional) Chinese, and the game's ruby.
const hunexLib=()=>require('./hunex.cjs');
const hunex={
 id:'hunex',hint:'data00200.hfa（script_text_ja.ctd）',
 scenes(dir){const lib=hunexLib(),t=lib.tables(dir);if(!t.ja)return [];
  return [{name:'script_text',read:()=>{const ja=lib.tableLines(t.ja)||[],zh=(t.zc&&lib.tableLines(t.zc))||(t.zt&&lib.tableLines(t.zt))||[];return Buffer.from(JSON.stringify({ja,zh:zh.length===ja.length?zh:[]}));}}];},
 archives:()=>[],
 sources(dir){const t=hunexLib().tables(dir);return [...new Set([t.ja,t.zc,t.zt].filter(Boolean).map(x=>x.file))];},
 parse(buf){const lib=hunexLib(),doc=JSON.parse(buf.toString('utf8'));
  return {lines:doc.ja.map(lib.clean),anchors:[],zh:doc.ja.map((_,i)=>lib.clean(doc.zh[i]||'')),ruby:doc.ja.map(t=>{const r=lib.rubyOf(t);return r.length?r:null;})};},
 test:()=>false,
 patchLines:(base,found)=>kirikiriCx.patchLines(base,found),
 /* E358: the characters the Japanese game's text font can draw (a translation written back into the game must use only these). */
 glyphs:dir=>hunexLib().glyphs(dir,'ja'),
 /* E410: which table lines start a page (the script clears it) and which continue the row the last line ended on. */
 pages:dir=>hunexLib().pages(dir),
};

// E414 multilingual KiriKiri (data_jp.xp3 + data_zh.xp3, plain scripts under the encrypted flag; ファタモルガーナの館): krkr-lang.cjs.
const krkrLang=require('./krkr-lang.cjs');
const kirikiriLang={
 id:'kirikiri-lang',hint:'data_jp.xp3（+ data_zh.xp3）',
 scenes:dir=>krkrLang.scenes(dir),archives:()=>[],
 sources(dir){const a=krkrLang.archives(dir);return a?[a.ja,a.zh].filter(Boolean):[];},
 parse:buf=>krkrLang.parse(buf),test:()=>false,
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 /* page starts and row continuations, from the script's own [cm] and [l] */
 pages:dir=>krkrLang.pages(dir),
};

// E329 YU-RIS (ysbin.ypf + update*.ypf, YSTB scenes): yuris.cjs.
const yuris=require('./yuris.cjs');
// E330 AQUAPLUS / Leaf KCAP (script.pak, WHITE ALBUM2): aquaplus.cjs.
const aquaplus=require('./aquaplus.cjs');
// E331 NScripter / ONScripter (0.txt or nscript.dat, blocks by label): nscripter.cjs.
const nscripter=require('./nscripter.cjs');
// E340 Unity TextAssets with 日本語※简体※繁體 lines (月に寄りそう乙女の作法): unity-text.cjs. E341 07th Expansion Unity
// (ひぐらし 奉, StreamingAssets/Scripts OutputLine): higurashi.cjs. E342 MAGES. script.mpk SC3 (STEINS;GATE): mages.cjs.
// E343 Capcom Unity Ace Attorney collections (逆転検事 1&2, scriptmessage bundles): capcom-msg.cjs.
// E451 Capcom Unity Ace Attorney Trilogy (逆転裁判123, encrypted GS<n>/scenario/*.mdt): pwaat.cjs.
const pwaat=require('./pwaat.cjs');
// E375 RPG Maker MV/MZ (www/data JSON) and WOLF RPG Editor (Data/*.mps, CommonEvent.dat, plain .wolf): rpgmaker.cjs, wolf.cjs.
const rpgmaker=require('./rpgmaker.cjs'),wolf=require('./wolf.cjs');
// E403 DDLC Plus (StreamingAssets/AssetBundles/Windows/lang*.cy): vgprompter.cjs.
const vgprompter=require('./vgprompter.cjs');
const fill=require('./fill.cjs'),avg32=require('./avg32.cjs'),nitroNpk=require('./npk.cjs').engine,nitroPak=require('./nitro-pak.cjs').engine,iga=require('./iga.cjs').engine,paz=require('./paz.cjs').engine,bruns=require('./bruns.cjs').engine,rePak=require('./re-pak.cjs').engine,fvp=require('./fvp.cjs').engine,advhd=require('./advhd.cjs').engine,reallive=require('./reallive.cjs').engine;
const voiceRef=require('./voice-ref.cjs');
const catsystem2=require('./catsystem2.cjs'),naninovel=require('./naninovel.cjs'),unityText=require('./unity-text.cjs'),higurashi=require('./higurashi.cjs'),mages=require('./mages.cjs'),capcomMsg=require('./capcom-msg.cjs'),spikeWad=require('./spike-wad.cjs');
// E409 Nitroplus N4 (Steam The Song of Saya, script.npk NPK2): nitroplus-n4.cjs.
const nitroplusN4=require('./nitroplus-n4.cjs');
// E470 GARbro on-demand pack, tried after every reader of MeguLit's own (garbro.cjs).
const garbro=require('./garbro.cjs').engine;
/* E561 signed adapter packs (services/adapter-packs.cjs) go first: a pack exists for a folder only because the readers below
   did not read it well; a pack that makes a game worse is turned off for that game by adapter-feed.cjs */
const adapterPack=(()=>{try{return require('../adapter-packs.cjs').engine;}catch{return {id:'adapter-pack',scenes:()=>[],parse:()=>({lines:[],anchors:[]}),sources:()=>[]};}})();
/* E565 Majiro scenario.arc (.mjo bytecode), E567 TyranoScript (loose / app.asar / NW.js zip; before kirikiri, which would
   otherwise read its data/scenario/*.ks as plain KAG and keep the #name lines as text): majiro.cjs, tyrano.cjs. */
/* E568 Softpal ADV (data.pac: SCRIPT.SRC + TEXT.DAT): softpal.cjs. */
const majiro=require('./majiro.cjs').engine,tyrano=require('./tyrano.cjs').engine,softpal=require('./softpal.cjs').engine;
/* E570 System-NNN (spt\*.spt), E571 codeX RScript / Liar-soft (scr.xfl .gsc), E572 AST (ARC1/ARC2, generic text scan:
   last before GARbro): systemnnn.cjs, liar.cjs, ast.cjs. */
const cmvs=require('./cmvs.cjs').engine,lucifen=require('./lucifen.cjs').engine,kaguya=require('./kaguya.cjs').engine,lcse=require('./lcse.cjs').engine,yuka=require('./yuka.cjs').engine;
const systemnnn=require('./systemnnn.cjs').engine,liar=require('./liar.cjs').engine,ast=require('./ast.cjs').engine;
/* E581–E584 group 3: QLIE packs, Entis GLS (NOA + Cotopha .csx), AliceSoft System 3.x (ALD + SCO, System39.ain), Marble (.mbl) */
const qlie=require('./qlie.cjs').engine,entis=require('./entis.cjs').engine,alicesoft=require('./alicesoft.cjs').engine,marble=require('./marble.cjs').engine;
/* E585 record-stream family (kit): Tmr-Hiro, NekoSDK, Ikura, ExHIBIT, EAGLS; archive layer + generic scan: Seraph, Interheart */
const tmrhiro=require('./tmrhiro.cjs').engine,nekosdk=require('./nekosdk.cjs').engine,ikura=require('./ikura.cjs').engine,exhibit=require('./exhibit.cjs').engine,eagls=require('./eagls.cjs').engine,seraph=require('./seraph.cjs').engine,interheart=require('./interheart.cjs').engine;
const circus=require('./circus.cjs').engine,whale=require('./whale.cjs').engine,ddsystem=require('./ddsystem.cjs').engine,aoi=require('./aoi.cjs').engine,kid=require('./kid.cjs').engine;/* E660–E664 F4b */
/* E574 RPG Maker XP / VX / VX Ace (RGSSAD + Ruby Marshal, messages through rpgmaker.cjs): rgss.cjs */
const rgss=require('./rgss.cjs').engine;
/* E576 Silky's family (Silky Engine, AI6WIN, AI5WIN): silky.cjs */
const silky=require('./silky.cjs').engine;
/* E577–E579 group 2: NeXAS (script.pac *.bin), Malie (LIB/LIBU/LIBP + EXEC, per-title keys), ShiinaRio (WARC 1.1 here,
   keyed WARC through GARbro's scheme database, scenario *.TXT parsed here) */
const nexas=require('./nexas.cjs').engine,malie=require('./malie.cjs').engine,shiinario=require('./shiinario.cjs').engine;
/* E610 F1 bundled-asset family (web / NW.js / Electron / zip): webbundle.cjs */
const webbundle=require('./webbundle.cjs').engines;
/* E630 F3 game-maker binaries */
const makers=require('./makers.cjs').ENGINES;
/* E640–E654 family F4a: Escude, PJADV, Luca System, Stuff (Propeller .msc), STCM2L; archive + generic scan engines */
const escude=require('./escude.cjs').engine,pjadv=require('./pjadv.cjs').engine,luca=require('./luca.cjs').engine,stuff=require('./stuff.cjs').engine,stcm2=require('./stcm2.cjs').engine;
const F4A_SCAN=require('./archive-scan.cjs').ENGINES;
const ENGINES={'adapter-pack':adapterPack,'nitroplus-n4':nitroplusN4,'kirikiri-lang':kirikiriLang,tyrano,kirikiri,artemis,renpy,siglus,'kirikiri-cx':kirikiriCx,'kirikiri-dump':kirikiriDump,'kirikiri-ks':kirikiriKs,hunex,yuris,aquaplus,nscripter,'unity-text':unityText,higurashi,mages,'capcom-msg':capcomMsg,'spike-wad':spikeWad,pwaat,naninovel,catsystem2,rpgmaker,wolf,avg32,'nitro-npk':nitroNpk,'nitro-pak':nitroPak,iga,paz,bruns,'re-pak':rePak,fvp,advhd,reallive,vgprompter,majiro,softpal,systemnnn,liar,rgss,silky,tmrhiro,nekosdk,ikura,exhibit,eagls,ast,seraph,interheart,nexas,malie,shiinario,cmvs,lucifen,kaguya,lcse,yuka,qlie,entis,alicesoft,marble,...webbundle,plaintext:require('./plaintext.cjs').engine,circus,whale,ddsystem,aoi,kid,...makers,escude,pjadv,luca,stuff,stcm2,slg:F4A_SCAN.slg,ism:F4A_SCAN.ism,glib2:F4A_SCAN.glib2,tanuki:F4A_SCAN.tanuki,yaneurao:F4A_SCAN.yaneurao,rits:F4A_SCAN.rits,bluegale:F4A_SCAN.bluegale,cyberworks:F4A_SCAN.cyberworks,dxlib:F4A_SCAN.dxlib,garbro};
// The engine whose running scripts this folder holds, if any can be read.
function readable(id,dir){let scenes;try{scenes=ENGINES[id].scenes(dir);}catch{return false;}
 for(const s of scenes.slice(0,64)){try{if(ENGINES[id].parse(s.read()).lines.length)return true;}catch{}}return false;} /* 64: a game may open with many code-only scenes (女王蜂の王房 endings, first.ks) */
/* GARbro is the last resort: a folder MeguLit's own cx reader owns (encrypted KiriKiri Z xp3, cache still decrypting)
   stays unread until that cache is ready instead of going to GARbro (9-nine- Ep4 / ATRI read as garbro). */
function ownCx(dir){return cxArchives(dir).some(f=>{try{return xp3.list(f)?.files.some(e=>e.encrypted);}catch{return false;}});}
/* E601 the readers of the engine the registry's fingerprints name are tried first (after an adapter pack), then every
   reader in order as before, so a folder the fingerprints miss reads exactly as it did */
function detect(dir){if(readable('adapter-pack',dir))return 'adapter-pack';
 let hint=[];try{hint=require('./registry.cjs').readersFor(dir).filter(id=>ENGINES[id]&&id!=='garbro');}catch{}
 for(const id of hint)if(readable(id,dir))return id;
 for(const id of Object.keys(ENGINES)){if(id==='adapter-pack'||hint.includes(id))continue;if(id==='garbro'&&ownCx(dir))continue;if(readable(id,dir))return id;}return null;}
function read(id,dir,overlay){const engine=ENGINES[id];
 // E449 a release's Chinese column gets the filled translations of the lines it leaves empty (fill.cjs).
 return engine.scenes(dir).map(s=>{const replaced=overlay?.get(s.name.toLowerCase());let parsed={lines:[],anchors:[]};try{parsed=engine.parse(replaced||s.read());}catch{}return fill.scene({name:s.name,...parsed,patched:!!replaced});});}
function fingerprint(id,dir){return crypto.createHash('sha256').update(id+'\n'+ENGINES[id].sources(dir).sort().map(f=>path.basename(f)+'|'+stat(f)).join('\n')).digest('hex');}
/* E294 (user: say that the first use needs 30-90 s of unpacking instead of "not supported"): what a game that cannot
   be read yet is waiting for. 'unpack': its cx archives are being decrypted in the background (started: when);
   'capture': strongly encrypted KiriKiri archives, read while the game runs (kirikiri-dump), nothing saved yet. */
function preparing(dir){
 const viaGarbro=(()=>{try{return garbro.preparing(dir);}catch{return null;}})();if(viaGarbro)return viaGarbro;
 let started=0;for(const file of cxArchives(dir)){let out;try{out=cxCache(file);}catch{continue;}if(cxBuilds.has(out))started=Math.min(started||Infinity,cxStarted.get(out)||Date.now());}
 if(started)return {kind:'unpack',startedAt:started};
 const archives=cxArchives(dir);if(!archives.length)return null;
 let encrypted=false;for(const file of archives){try{if(xp3.list(file)?.files.some(e=>e.encrypted)){encrypted=true;break;}}catch{}}
 return encrypted?{kind:'capture'}:null;
}
/* E375 why a recognised game cannot be read (an engine's own check, e.g. encrypted WOLF archives), or null. */
function unsupportedReason(dir){for(const e of Object.values(ENGINES)){if(typeof e.unsupported!=='function')continue;let code='';try{code=e.unsupported(dir);}catch{}if(code)return {engine:e.id,code,detail:e.REASONS?.[code]||''};}return null;}
module.exports={unquoteSlot,unsupportedReason,preparing,cxBuilds,chineseColumn,ENGINES,detect,readable,read,fingerprint,parseKs,parseAst,parseRpy,pfsList,pfsRead,tlPairs,decode};
