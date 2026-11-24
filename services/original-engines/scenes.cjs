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
//   aquaplus-pck AQUAPLUS big-endian "Filename" PCK, Data/Game/Script.sdat MES.BIN scenes (WHITE ALBUM, aquaplus-pck.cjs)
//   leaf-pak  Leaf PAK of the 1998 WHITE ALBUM: WAMES.PAK (LZSS) and the Chinese build's CNMES.PAK (leaf-pak.cjs)
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
  const text=t.replace(/\[\[|\[([぀-ヿ一-鿿々ー]+)(?:ruby|'[^\]]*)?\]/g,(m,jp)=>m==='[['?'\x01':jp).replace(/\[[^\]]*\]/g,'').replace(/\x01/g,'[').trim();
  if(!text){vt.see(t);if(ascii(t))anchors.push(t);continue;}vt.see(t);/* E450 a speaker label line (【名前】) passes its voice on to the speech after it */if(!/^【[^】]*】$/.test(text))voices[lines.length]=vt.take();
  const pairs=[];for(const m of t.matchAll(/\[\[|\[([぀-ヿ一-鿿々ー]+)'([^\]]+)\]/g))if(m[1])pairs.push([m[1],m[2]]);if(pairs.length)ruby[lines.length]=pairs;
  lines.push(text);}
 // the game's own readings ([漢字'よみ]), only when the script has any
 const out=ruby.length?{lines,anchors,ruby:lines.map((_,i)=>ruby[i]||null)}:{lines,anchors};const v=voiceRef.keep(lines.map((_,i)=>voices[i]||null));if(v)out.voices=v;return out;
}
function xp3Scenes(file,test){let t;try{t=xp3.list(file);}catch{return [];}if(!t)return [];
 // An entry flagged "protected" can still be stored as plain text (女王蜂の王房): try the first one and keep the
 // flagged ones when it reads as a script (UTF-16 BOM, or no control bytes at the start).
 const plain=e=>{try{const d=xp3.read(file,e);if(d[0]===0xff&&d[1]===0xfe)return true;for(let i=0;i<Math.min(d.length,512);i++)if(d[i]<9||(d[i]>13&&d[i]<32&&d[i]!==27))return false;
  /* E595 an encrypted script can avoid control bytes too (死に逝く君、館に芽吹く憎悪 read as 989 lines of noise): a KAG
     script has line breaks and ASCII markup ([tag], @cmd, *label, ;comment) */
  const head=d.subarray(0,2048);let ascii=0,nl=0;for(const b of head){if(b===10)nl++;if(b>=32&&b<127)ascii++;}return d.length>0&&nl>0&&ascii>=head.length*.15;}catch{return false;}};
 const flagged=t.files.filter(e=>e.encrypted&&test(e.name)),open=flagged.length>0&&plain(flagged[0]);
 // E449 a cx archive of a title GARbro knows is decrypted with that title's filter (cx-filter.cjs).
 const cx=flagged.length&&!open?require('./cx-filter.cjs').forArchive(file):null;
 return t.files.filter(e=>(!e.encrypted||open||cx)&&test(e.name)).map(e=>({name:path.basename(e.name.replace(/\\/g,'/')),read:()=>e.encrypted?xp3.read(file,e,open?null:cx):readUnflagged(xp3.read(file,e),e.hash)}));}
/* Unflagged XP3 scripts can use the low byte of their original Adler-32 as a mask. */
function readUnflagged(data,hash){
 if(hash===undefined)return unscramble(data);
 const key=hash&0xff;
 const {adler32}=require('./shiinario-crypt.cjs');
 if(adler32(data,0,data.length)!==hash){
  if(key){
   const plain=kit.xor(data,key);
   if(adler32(plain,0,plain.length)===hash&&!/[\x00-\x08\x0e-\x1f]/.test(decode(plain)))return plain;
  }
  return unscramble(data);
 }
 // An ordinary XP3 stores the checksum of the script as-is, regardless of its low byte.
 const legacy=unscramble(data);
 if(legacy.length||data.some(b=>b<9||(b>13&&b<32)))return legacy;
 const text=decode(data);
 return !text.includes('\ufffd')&&/(?:\[[a-z_]\w*[\s\]]|^[@*]\w)/im.test(text)?data:legacy;
}
/* E595 a translation's patch.xp3 can XOR its scripts (死に逝く君 汉化硬盘版: UTF-16 text whose BOM reads 2B 2A): undone when
   the BOM gives a two-byte key under which the whole file reads as UTF-16 text. A file that does not, or is plainly not
   text, is dropped instead of being read as lines of noise. */
function unscramble(d){if(d.length<4)return d;if(d[0]===0xff&&d[1]===0xfe||d[0]===0xef&&d[1]===0xbb)return d;const k0=d[0]^0xff,k1=d[1]^0xfe;
 /* the key repeats every two bytes (one byte when both match); kept only when the result reads as UTF-16 text */
 if(k0||k1){const o=Buffer.from(d);for(let i=0;i<o.length;i++)o[i]^=i&1?k1:k0;let ok=0,n=0;for(let i=2;i+1<o.length;i+=2){n++;const c=o.readUInt16LE(i);if(c===10||c===13||c===9||c>=32&&c<127||c>=0x3000&&c<0xa000||c>=0xff00&&c<0xfff0)ok++;}if(n&&ok>=n*.98)return o;return Buffer.alloc(0);}
 const head=d.subarray(0,2048);let ascii=0;for(const b of head)if(b>=32&&b<127||b===10||b===13||b===9)ascii++;return ascii>=head.length*.15?d:Buffer.alloc(0);}
// E449 KAG scenarios kept as .txt under a scenario folder (赤ずきんと迷いの森: scenario/<route>/r04_23.txt); "!" files are lists.
const KS=n=>/\.ks$/i.test(n)||/(?:^|[\\/])scenario[\\/](?:[^\\/]+[\\/])*[^!\\/][^\\/]*\.txt$/i.test(n);
const kirikiri={
 id:'kirikiri',hint:'*.ks（或 patch.xp3）',
 // Later archives override earlier ones, as the engine loads them (data < patch < patch2 ...).
 scenes(dir){const out=new Map();
  /* E595 KiriKiri Z keeps the story in encrypted .scn scene files (read by kirikiri-cx); its .ks are system scripts only,
     which read as noise when the cipher is not known exactly (死に逝く君、館に芽吹く憎悪) */
  if(cxArchives(dir).some(f=>{try{const l=xp3.list(f);return l?.files.some(e=>e.encrypted&&/\.scn$/i.test(e.name));}catch{return false;}}))return [];
  for(const a of ksArchives(dir))for(const s of xp3Scenes(a,KS))out.set(s.name.toLowerCase(),s);
  for(const file of walk(dir,2,KS))out.set(path.basename(file).toLowerCase(),{name:path.basename(file),read:()=>fs.readFileSync(file)});
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:dir=>ksArchives(dir).flatMap(a=>xp3Scenes(a,KS)),
 sources:dir=>[...ksArchives(dir),...walk(dir,2,KS)],
 parse:parseKs,test:KS,
 /* S9 a Chinese patch.xp3 over the Japanese data.xp3: the Japanese scene under each patched one (layerOriginal) */
 originalLines(dir){if(!this.scenes(dir).length)return null;const layers=new Map();for(const a of ksArchives(dir))for(const s of xp3Scenes(a,KS))addLayer(layers,s);
  for(const file of walk(dir,2,KS))addLayer(layers,{name:path.basename(file),read:()=>fs.readFileSync(file)});return layerOriginal(this.scenes(dir),layers,parseKs);},
};
// Archives next to the game, then those in arc/ (女王蜂の王房 keeps scenario.xp3 there), later ones overriding.
function ksArchives(dir){const xp3=d=>{try{return fs.readdirSync(d).filter(f=>/\.xp3$/i.test(f)).sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b)).map(f=>path.join(d,f));}catch{return [];}};return [...xp3(path.join(dir,'arc')),...xp3(dir)];}
function rank(name){const m=name.toLowerCase().match(/^patch(\d*)\.xp3$/);return m?1+(+m[1]||0):0;}
/* S9 (2026-11-19, 27 probes of Chinese builds): a translation laid over the Japanese release in the same folder (patch.xp3
   over data.xp3, root.pfs.010 over root.pfs.000) leaves the Japanese scene under the Chinese one. The game runs the patch's
   scene; its Japanese lines are the same scene in an earlier layer, lined up 1:1 when the counts match, else by anchors
   (bgi.alignLines). Unpatched Japanese scenes are their own original; a Chinese scene with nothing Japanese under it stays
   ''. null when no Chinese scene has a Japanese one under it (the adoption in original-text.cjs then does nothing). */
const KANA_LINE=/[ぁ-ゖァ-ヺ]/,HAN_LINE=/[一-鿿]/;
function sceneLanguage(lines){let ja=0,zh=0;for(const t of lines||[]){if(KANA_LINE.test(t))ja++;else if(HAN_LINE.test(t))zh++;}return zh>=5&&zh>ja*3?'zh':ja>0&&ja>=zh?'ja':'';}
function layerOriginal(running,layers,parse){let swapped=0,at=0;const align=require('./bgi.cjs').alignLines,added=[],rewritten=[];
 const out=running.flatMap(s=>{const r=scene(s);at+=r.length;return r;});
 function scene(s){let own;try{own=parse(s.read());}catch{return [];}const lines=own.lines||[];if(sceneLanguage(lines)!=='zh')return lines;
  const under=(layers.get(s.name.toLowerCase())||[]).slice(0,-1).reverse();
  for(const u of under){let ja;try{ja=parse(u.read());}catch{continue;}if(sceneLanguage(ja.lines)!=='ja')continue;swapped++;const r=align([{name:s.name,lines}],[{name:s.name,lines:ja.lines}]);for(const i of r.added||[])added.push(at+i);for(const i of r.rewritten||[])rewritten.push(at+i);return r;}
  return lines.map(()=>'');}
 if(swapped)Object.defineProperties(out,{added:{value:added},rewritten:{value:rewritten}});return swapped?out:null;}
const addLayer=(layers,s)=>{const k=s.name.toLowerCase();if(!layers.has(k))layers.set(k,[]);layers.get(k).push(s);};

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
/* S5 Artemis keeps its scenario as Lua .ast, compiled .asb, or the plain-text form scenario/*.txt (恋生恋逝恋相随's pf8: 20 scenario\sNN.txt, no .ast) */
const ARTEMIS_SCRIPT=(n,f)=>/\.(ast|asb)$/i.test(n)||/\.txt$/i.test(n)&&/(^|[\\/])scenario[\\/]/i.test(String(f||n));
function pfsScenes(file){let t;try{t=pfsList(file);}catch{return [];}if(!t)return [];return t.files.filter(e=>ARTEMIS_SCRIPT(e.name)).map(e=>({name:path.basename(e.name.replace(/\\/g,'/')),read:()=>pfsRead(file,e,t.key)}));}
/* Artemis compiled .asb and plain-text .txt scenarios, after VNTranslationTools ArtemisAsbScript.cs / ArtemisTxtScript.cs (MIT, arcusmaximus).
   asb: "ASB\0\0", u32 count, items: u32 type (0 command: str name, u32 line, u32 n, n×(str key, str value); 1 label: str), str = u32 len + utf8 + NUL.
   Text = runs of print/ruby commands joined (ruby base kept), plus name / sel_text / RegisterTextToHistory attributes. */
function parseAsb(buf){let p=9;const lines=[],anchors=[],u32=()=>{if(p+4>buf.length)throw Error('ASB_EOF');const v=buf.readUInt32LE(p);p+=4;return v;};
 const str=()=>{const n=u32();if(p+n>buf.length)throw Error('ASB_EOF');const s=buf.toString('utf8',p,p+n);p+=n+1;return s;};
 const count=buf.readUInt32LE(5);let run='',inRuby=false;const flush=()=>{if(run.trim())lines.push(run);run='';};
 for(let i=0;i<count&&p<buf.length;i++){const type=u32();if(type===1){flush();anchors.push(str());continue;}if(type!==0)throw Error('ASB_ITEM');
  const name=str();u32();const n=u32(),a={};for(let k=0;k<n;k++){const key=str();a[key]=str();}
  if(name==='print'){run+=a.data||'';continue;}if(name==='ruby'){inRuby=true;continue;}if(name==='/ruby'){inRuby=false;continue;}
  flush();if(name==='sel_text'&&a.text)lines.push(a.text);else if(name==='RegisterTextToHistory'&&a['1'])lines.push(a['1']);}
 flush();return {lines,anchors};}
function parseArtemisTxt(text){const lines=[],anchors=[];let msg=[];const flush=()=>{if(msg.length)lines.push(msg.join('\n'));msg=[];};
 for(const raw of text.split(/\r?\n/)){const l=raw.replace(/\0/g,'').replace(/(\/\/|;).*/,'');if(l.startsWith('*')){flush();anchors.push(l.slice(1).trim());continue;}
  const cmd=/^\s*\[([^\]' ]+)((?:[^\]"']|"(?:\\"|[^"])*"|'(?:\\'|[^'])*')*)\]\s*$/.exec(l);
  if(cmd){const sel=cmd[1]==='sel_text'&&/\btext\s*=\s*("(?:\\"|[^"])*"|'(?:\\'|[^'])*'|[^\]"' ]*)/.exec(cmd[2]);if(sel){flush();lines.push(sel[1].replace(/^["']|["']$/g,''));}continue;}
  if(l.trim()){msg.push(l.trim().replace(/\[[^\]]*\]/g,''));continue;}flush();}
 flush();return {lines:lines.filter(t=>t.trim()),anchors};}
function parseArtemis(buf){if(buf.length>=9&&buf.toString('latin1',0,5)==='ASB\0\0')return parseAsb(buf);const text=decode(buf);
 if(/=\s*\{/.test(text)||/^\s*astver\b/m.test(text))return parseAst(buf);return parseArtemisTxt(text);}
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
  /* name = {"name", name="…"}: the speaker tag some patch builds put in each language table, not a page */
  if(c==='{'&&depth===1&&/\bname\s*=\s*$/.test(block.slice(Math.max(0,i-16),i))){const end=luaBlock(block,i);if(end<0)break;i=end+1;continue;}
  if(c==='{'){if(depth===2){const end=luaBlock(block,i);if(end<0)break;const tag=block.slice(i,end+1),r=/^\{\s*"ruby"\s*,\s*text\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(tag);if(r)pending=r[1];i=end+1;continue;}depth++;if(depth===2)page='';}
  else if(c==='}'){if(depth===2&&page)pages.push(page);depth--;}
  i++;}
 return {text:pages.join('\n'),ruby};}
const AST_PLACEHOLDER=/^\s*(?:\*[^*\r\n]+\*\s*)+$/;
function parseAstMulti(text){const rows=[],anchors=[],re=/\btext\s*=\s*\{/g;let m,last=0,matched=false;
 while((m=re.exec(text))){const open=text.indexOf('{',m.index),end=luaBlock(text,open);if(end<0)break;
  for(const a of text.slice(last,m.index).matchAll(/"((?:[^"\\]|\\.)*)"/g))if(ascii(a[1]))anchors.push(a[1]);
  /* Most builds give each message its own text = { ja = …, cn = … }. A Chinese patch build of 美少女万華鏡 keeps one table
     for the whole file instead, text = { [1] = { ja = …, cn = … }, [2] = … }: each [n] is one message. */
  const whole=text.slice(open,end+1),messages=[];
  if(/^\{\s*\[\d+\]\s*=\s*\{/.test(whole)){const item=/\s*,?\s*\[\d+\]\s*=\s*\{/y;let i=1;
   while(i<whole.length){item.lastIndex=i;const it=item.exec(whole);if(!it)break;const o=it.index+it[0].length-1,e=luaBlock(whole,o);if(e<0)break;messages.push(whole.slice(o,e+1));i=e+1;}}
  else messages.push(whole);
  for(const block of messages){const langs={};for(const k of block.matchAll(/\b(ja|cn|tw|en)\s*=\s*\{/g)){const o=k.index+k[0].length-1,e=luaBlock(block,o);if(e>0&&!(k[1] in langs))langs[k[1]]=luaLang(block.slice(o,e+1));}
   if(langs.ja){matched=true;rows.push(langs);}}
  last=end+1;re.lastIndex=end+1;}
 if(!matched)return null;
 const jaNonEmpty=rows.map(r=>r.ja.text).filter(Boolean);
 /* Releases without Japanese (Steam HENPRI) keep "*テキスト*" placeholders in every ja slot: fall back to the release's real language so placeholders are not counted as Japanese. */
 if(jaNonEmpty.length&&jaNonEmpty.every(t=>AST_PLACEHOLDER.test(t))){
  const pick=rows.some(r=>r.en?.text)?'en':rows.some(r=>r.cn?.text)?'cn':rows.some(r=>r.tw?.text)?'tw':'';
  return {lines:pick?rows.map(r=>pick==='cn'?(r.cn||r.tw)?.text||'':r[pick]?.text||''):[],anchors,zh:[],ruby:[]};}
 return {lines:rows.map(r=>r.ja.text),anchors,zh:rows.map(r=>(r.cn||r.tw)?.text||''),ruby:rows.map(r=>r.ja.ruby.length?r.ja.ruby:null)};}
function parseAst(buf){const lines=[],anchors=[],text=decode(buf),re=/"((?:[^"\\]|\\.)*)"/g;let m;
 if(/\bja\s*=\s*\{/.test(text)&&/\btext\s*=\s*\{/.test(text)){const multi=parseAstMulti(text);if(multi)return multi;}
 while((m=re.exec(text))){const s=m[1].replace(/\\(.)/g,'$1');if(ascii(s))anchors.push(s);else lines.push(s);}
 return {lines,anchors};}
const isPfs=f=>/\.pfs(?:\.\d+)?$/i.test(f);
const artemis={
 id:'artemis',hint:'*.ast（或 .pfs）',
 scenes(dir){const out=new Map(),pfs=fs.readdirSync(dir).filter(isPfs).sort();for(const a of pfs)for(const s of pfsScenes(path.join(dir,a)))out.set(s.name.toLowerCase(),s);
  /* loose scenario/*.txt only next to Artemis evidence (a .pfs or an .iet entry script): other engines keep scenario/*.txt too */
  const txtOk=pfs.length>0||walk(dir,3,n=>/\.iet$/i.test(n)).length>0;
  for(const file of walk(dir,3,(n,f)=>AST(n)||/\.asb$/i.test(n)||txtOk&&ARTEMIS_SCRIPT(n,f)))out.set(path.basename(file).toLowerCase(),{name:path.basename(file),read:()=>fs.readFileSync(file)});
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:dir=>fs.readdirSync(dir).filter(isPfs).flatMap(a=>pfsScenes(path.join(dir,a))),
 sources:dir=>[...fs.readdirSync(dir).filter(isPfs).map(f=>path.join(dir,f)),...walk(dir,3,AST)],
 parse:parseArtemis,test:AST,
 // E352: a multilingual release carries its own Chinese; other games fall back to the usual patch overlay.
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 /* S9 a Chinese root.pfs.010 (or loose .ast) over the Japanese root.pfs.000: the Japanese scene under each patched one */
 originalLines(dir){const layers=new Map();for(const a of fs.readdirSync(dir).filter(isPfs).sort())for(const s of pfsScenes(path.join(dir,a)))addLayer(layers,s);
  for(const file of walk(dir,3,AST))addLayer(layers,{name:path.basename(file),read:()=>fs.readFileSync(file)});return layerOriginal(this.scenes(dir),layers,parseAst);},
};

// ---- Ren'Py ---------------------------------------------------------------------------------------------------
const RPY=n=>/\.rpy$/i.test(n);
const SAY=/^\s*(?:[A-Za-z_][\w.]*\s+)?(?:[A-Za-z_][\w.]*\s+)*"((?:[^"\\]|\\.)*)"\s*(?:with\s+\w+)?\s*$/;
const unq=s=>s.replace(/\\n/g,'\n').replace(/\\(.)/g,'$1');
function parseRpy(buf){const lines=[],anchors=[],roles=[],menus=[];let skip=false;
 for(const raw of decode(buf).split(/\r?\n/)){
  if(/^translate\s/.test(raw)){skip=true;continue;}if(skip&&/^\S/.test(raw))skip=false;if(skip)continue;
  const t=raw.trim();if(!t||t[0]==='#')continue;
  const indent=raw.match(/^\s*/)[0].replace(/\t/g,'        ').length;
  while(menus.length&&indent<=menus.at(-1).indent)menus.pop();
  if(/^menu(?:\s+\w+)?\s*:\s*(?:#.*)?$/.test(t))menus.push({indent,child:null});
  else if(menus.length){
   const menu=menus.at(-1);menu.child??=indent;
   const option=indent===menu.child&&/^"((?:[^"\\]|\\.)*)"(?:\s+if\s+.+?)?\s*:\s*(?:#.*)?$/.exec(t);
   if(option){lines.push(unq(option[1]));roles.push('c');continue;}
  }
  const m=raw.match(SAY);if(m&&!/^\s*(?:old|new|define|default|\$|image|play|show|scene|jump|call)\b/.test(raw)){lines.push(unq(m[1]));roles.push('b');continue;}
  if(ascii(t))anchors.push(t);}
 return {lines,anchors,roles:roles.join('')};}
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
const parseRenpyRaw=buf=>rpyc.isRpyc(buf)?rpyc.parse(buf):parseRpy(buf);
const japaneseLangStats=values=>{let total=0,ja=0,zh=0;for(const v of values){if(!v)continue;total++;if(KANA_LINE.test(v))ja++;else if(HAN_LINE.test(v))zh++;}return {total,ja,zh};};
function renpyBaseScenes(g){const out=new Map();
 for(const [key,s] of rpyc.scripts(g))out.set(key,{name:key,read:s.read});
 for(const file of walk(g,4,RPY).filter(outsideTl)){const name=path.relative(g,file).replace(/\\/g,'/').toLowerCase();out.set(name,{name,read:()=>fs.readFileSync(file)});}
 return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));}
function renpyJapaneseTl(g,base,{deadline=Infinity}={}){
 if(!base.length||Date.now()>deadline)return null;
 let baseJp=0,nonEmpty=0;
 for(const s of base.slice(0,64)){if(Date.now()>deadline)return null;let parsed;try{parsed=parseRenpyRaw(s.read());}catch{continue;}
  if(!parsed.lines.length)continue;
  nonEmpty++;
  for(const line of parsed.lines)if(KANA_LINE.test(line))baseJp++;
  if(baseJp>=5)return null;
  if(nonEmpty>=8)break;}
 const langs=new Map(),get=lang=>{const k=String(lang||'').toLowerCase();let l=langs.get(k);if(!l){l={pairs:new Map(),ids:new Map(),strings:new Map(),files:new Set()};langs.set(k,l);}return l;};
 for(const file of walk(g,5,RPY).filter(f=>!outsideTl(f))){if(Date.now()>deadline)return null;
  for(const [lang,pairs] of tlPairs([file])){const l=get(lang);l.files.add(file);for(const [k,v] of pairs)if(v&&!l.pairs.has(k))l.pairs.set(k,v);}}
 if(Date.now()>deadline)return null;
 for(const [,s] of rpyc.scripts(g,{tl:true})){if(Date.now()>deadline)return null;let t;try{t=rpyc.translations(s.read());}catch{continue;}
  if(!t.lang||/^none$/i.test(t.lang))continue;const l=get(t.lang);if(/\.rpyc$/i.test(s.source||''))l.files.add(s.source);
  for(const [k,v] of t.ids)if(v&&!l.ids.has(k))l.ids.set(k,v);for(const [k,v] of t.strings)if(v&&!l.strings.has(k))l.strings.set(k,v);}
 let best=null,bestScore=0;
 for(const l of langs.values()){
  const a=japaneseLangStats([...l.ids.values(),...l.strings.values()]),b=japaneseLangStats(l.pairs.values());
  const st=a.ja>=b.ja?a:b;
  if(st.ja>0&&st.ja>=st.zh&&st.ja>=st.total*0.25&&st.ja>bestScore){best=l;bestScore=st.ja;}
 }
 return best&&bestScore>baseJp*2?{...best,score:bestScore}:null;}
function renpyScenes(dir,{deadline=Infinity}={}){const g=gameDir(dir),base=renpyBaseScenes(g),jp=renpyJapaneseTl(g,base,{deadline});
 if(!jp)return base;
 return base.map(s=>({name:s.name,read:s.read,parse(){
  const raw=s.read(),parsed=parseRenpyRaw(raw),src=parsed.lines;
  let ids=parsed.ids;
  // Older Ren'Py puts generated dialogue IDs in the restructured slot. Keep slot 1's line order and roles.
  if(jp.ids.size&&rpyc.isRpyc(raw)&&src.some((_,i)=>parsed.roles?.[i]==='b'&&!ids?.[i])){
   const restructured=rpyc.parse(raw,{slot:2});
   if(restructured.ids&&restructured.roles===parsed.roles&&src.every((text,i)=>text===restructured.lines[i]))
    ids=src.map((_,i)=>ids?.[i]||restructured.ids[i]);
  }
  let hit=false;
  const lines=src.map((t,k)=>{const id=ids?.[k],v=(id&&jp.ids.get(id))||jp.pairs.get(t)||jp.strings.get(t)||'';if(!v)return t;hit=true;return v;});
  const withIds=ids===parsed.ids?parsed:{...parsed,ids};
  return hit?{...withIds,lines,sourceLines:src}:withIds;}}));}
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
 archives:()=>[],sources:dir=>{const g=gameDir(dir),base=renpyBaseScenes(g),jp=renpyJapaneseTl(g,base);return [...walk(g,4,RPY).filter(outsideTl),...walk(g,4,n=>/\.rpyc$/i.test(n)).filter(outsideTl),...walk(g,3,n=>/\.rpa$/i.test(n)),...(jp?[...jp.files]:[])];},
 parse:parseRenpyRaw,test:n=>RPY(n)||/\.rpyc$/i.test(n),
 // The patch: the tl language whose translations are most Chinese. A source line is looked up by its text (.rpy tl,
 // old/new string tables) and, for compiled scripts, by its translate identifier (E566).
 patchLines(base,found){
  const files=found.dirs.flatMap(d=>{try{return fs.readdirSync(d).filter(RPY).map(f=>path.join(d,f));}catch{return [];}});
  let best=null,bestScore=0;
  for(const [,pairs] of tlPairs(files)){const score=chineseScore(pairs.values());if(score>bestScore){best=pairs;bestScore=score;}}
  let comp=null,compScore=0;
  for(const [,l] of rpycTl(found.dirs)){const score=chineseScore([...l.ids.values(),...l.strings.values()]);if(score>compScore){comp=l;compScore=score;}}
  if(!best&&!comp)return null;
  const lookup=(t,id,src)=>{if(comp&&id&&comp.ids.has(id))return comp.ids.get(id);if(best&&best.has(t))return best.get(t);if(best&&src!=null&&best.has(src))return best.get(src);if(comp&&comp.strings.has(t))return comp.strings.get(t);if(comp&&src!=null&&comp.strings.has(src))return comp.strings.get(src);return null;};
  return base.map(scene=>{let hit=false;const lines=scene.lines.map((t,k)=>{const v=lookup(t,scene.ids?.[k],scene.sourceLines?.[k]);if(v==null)return t;hit=true;return v;});return {...scene,patched:hit,lines};});
 },
};

// ---- Siglus (Steam multi-language) ---------------------------------------------------------------------------
// Steam releases keep every line in dat/*.dbs tables with one column per language. The running table's Japanese column
// gives the lines; the Chinese column comes from the same table before MeguLit's Japanese restore (its backup in
// .megulit-japanese), from the table itself when it was never restored, or from a <name>_zh.dbs twin.
const siglusTables=()=>require('../../core/japanese-restore.cjs')._internal;
const DBS=n=>/\.dbs$/i.test(n)&&!/_(?:en|eng|zh|cn|ch|chs|cht|sc|tc|tw|ko|kr|ru)\.dbs$/i.test(n);
const CHINESE_DBS_TWINS=['zh','cn','ch','chs','cht','sc','tc','tw'];
const HAN=/[\u4e00-\u9fff]/,KANA1=/[\u3040-\u30ff]/;
function dbsTable(buf,limits){const t=siglusTables(),d=t.decrypt(buf,limits);limits?.consume?.(d.raw.length);return t.parse(d.raw,d.marker,limits);}
function columnShares(table){return table.columns.map((c,i)=>{if(c.type!==0x53)return null;let filled=0,kana=0,han=0;for(const r of table.cells){const v=r[i];if(!v)continue;filled++;if(KANA1.test(v))kana++;else if(HAN.test(v))han++;}return {index:i,filled,kana:filled?kana/filled:0,han:filled?han/filled:0};}).filter(Boolean);}
const serialIndex=table=>table.columns.findIndex(c=>c.id===500&&c.type!==0x53);
const speakerColumn=(table,i)=>serialIndex(table)>=0&&table.columns[i].id===50;
const rowIds=table=>{const i=serialIndex(table);return i<0?null:table.cells.map(row=>row[i]);};
const interfaceDbsName=name=>/^(?:config(?:[_.-]|$)|settings?(?:[_.-]|$)|name_replace\.dbs$)/i.test(name||'');
function dbsScope(table,name){
 if(interfaceDbsName(name))return 'interface';
 const locales=new Set();
 for(const row of table.cells.slice(0,32))for(const value of row){
  const match=typeof value==='string'&&/^.{1,28}\(([A-Z]{2}(?:-[A-Z]{2})?)\)$/.exec(value);
  if(match)locales.add(match[1]);
 }
 return locales.has('JP')&&locales.size>=3?'interface':'script';
}
function readDbs(buf,name,limits){
 const table=dbsTable(buf,limits),cols=columnShares(table).filter(c=>c.filled&&!speakerColumn(table,c.index)),jp=cols.sort((a,b)=>b.kana-a.kana)[0];
 const scope=dbsScope(table,name),ids=rowIds(table);
 const lines=!jp||jp.kana<.3?[]:table.cells.map(r=>String(r[jp.index]||''));
 return {table,lines,scope,rowIds:ids};
}
function parseDbs(buf){const {table,lines,scope,rowIds}=readDbs(buf);return {lines,anchors:[],rows:table.rows,scope,rowIds};}
/* E286 (user report 2026-11-10, CLANNAD: the speaker name was given as each line's translation and drawn into the
   game): a name column (【朋也】) is all kanji too. A translation column is filled on most rows the Japanese is filled,
   and its values are mostly different from each other; names repeat. */
function chineseColumn(table,jp){if(table.rows!==jp.length)return null;
 const rowsJp=jp.map((t,r)=>t?r:-1).filter(r=>r>=0);if(!rowsJp.length)return null;
 const {translated}=require('../align-sample.cjs');
 const c=columnShares(table).filter(c=>{if(c.filled<table.rows*.3||c.kana>=.1||c.han<=.5||speakerColumn(table,c.index))return false;
  let filled=0,changed=0;const distinct=new Set();for(const r of rowsJp){const v=table.cells[r][c.index];if(!v)continue;filled++;distinct.add(v);if(translated(v,jp[r]))changed++;}
  if(filled<rowsJp.length*.6||distinct.size<filled*.5||changed<filled*.2)return false;
  c.changed=changed;return true;}).sort((a,b)=>b.changed-a.changed||b.han-a.han)[0];
 return c?table.cells.map(r=>String(r[c.index]||'')):null;}
const siglusDat=dir=>{const d=path.join(dir,'dat');try{return fs.readdirSync(d).some(DBS)?d:'';}catch{return '';}};
function dbsSceneFile(dir){
 const packs=fs.readdirSync(dir).filter(n=>/^scene.*\.pck$/i.test(n));
 if(packs.length===1)return path.join(dir,packs[0]);
 if(packs.length>1)try{
  const language=/^\s*Language\s*=\s*(\w+)\s*$/im.exec(fs.readFileSync(path.join(dir,'ds.ini'),'utf8'))?.[1]?.toLowerCase();
  const name={schinese:'scenezh.pck',english:'sceneen.pck',japanese:'scenejp.pck'}[language];
  const match=packs.find(n=>n.toLowerCase()===name);
  if(match)return path.join(dir,match);
 }catch{}
 return null;
}
let lastSlotLayout;
function slotLayout(file){
 const key=file+'|'+stat(file);
 if(lastSlotLayout?.key===key)return lastSlotLayout;
 const src=require('./siglus-source.cjs'),files=src.sources(file);
 const declarations=files.find(s=>/^_system_language\.inc$/i.test(s.name));
 const defines=declarations?src.decode(declarations.raw):'';
 const column=lang=>defines.match(new RegExp('^\\s*#define\\s+\\$lang_'+lang+'\\s+(\\d+)\\b','im'))?.[1];
 const ja=column('jp'),zh=column('ch'),layout=ja!=null&&zh!=null&&ja!==zh?{ja:Number(ja),zh:Number(zh)}:null;
 return lastSlotLayout={key,slots:src.messageSlots(files),layout};
}
// A serial-keyed bilingual patch may omit or reorder rows. In this format both
// the serial and the Japanese cell must match before accepting its Chinese cell.
function serialTranslations(scene,table,layout){
 if(!layout||!scene.rowIds||!/[bc]/.test(scene.roles||''))return null;
 const serial=serialIndex(table),ja=table.columns.findIndex(c=>c.id===layout.ja&&c.type===0x53);
 const zh=table.columns.findIndex(c=>c.id===layout.zh&&c.type===0x53);
 if(serial<0||ja<0||zh<0)return null;
 const byId=new Map(),duplicates=new Set();
 for(const row of table.cells){
  if(byId.has(row[serial]))duplicates.add(row[serial]);
  byId.set(row[serial],row);
 }
 const seen=new Set();
 for(const id of scene.rowIds){
  if(seen.has(id))duplicates.add(id);
  seen.add(id);
 }
 const {translated}=require('../align-sample.cjs');
 return scene.lines.map((text,i)=>{
  const id=scene.rowIds[i],row=byId.get(id);
  return text&&!duplicates.has(id)&&row?.[ja]===text&&translated(row[zh],text)?row[zh]:'';
 });
}
const siglus={
 id:'siglus',hint:'dat\*.dbs',
 scenes(dir){const d=siglusDat(dir);if(!d)return [];return fs.readdirSync(d).filter(DBS).sort().map(f=>({name:f,read:()=>fs.readFileSync(path.join(d,f))}));},
 archives:()=>[],sources:dir=>{const d=siglusDat(dir);if(!d)return [];const pck=dbsSceneFile(dir);return [...fs.readdirSync(d).filter(DBS).map(f=>path.join(d,f)),...(pck?[pck]:[])];},
 annotate(dir,list){
  list=list.map(scene=>interfaceDbsName(scene.name)?{...scene,scope:'interface'}:scene);
  const file=dbsSceneFile(dir);
  if(!file)return list;
  let info;try{info=slotLayout(file);}catch{return list;}
  const {slots,layout}=info;
  if(!slots.size)return list;
  return list.map(scene=>{
   if(scene.scope==='interface'||!scene.rowIds||!scene.lines.length)return scene;
   const roles=scene.lines.map((text,i)=>{const slot=slots.get(scene.rowIds[i]);return text&&slot?.text===text?slot.role:'?';}).join('');
   return {...scene,roles,layout};
  });
 },
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
  const dirs=[...new Set(found.dirs.flatMap(d=>[d,path.join(d,'dat'),path.join(d,'.megulit-japanese','dat')]))];let any=false;
  const list=base.map(item=>{
   const scene=interfaceDbsName(item.name)?{...item,scope:'interface'}:item,stem=scene.name.replace(/\.dbs$/i,'');
   let keyedLines;
   const patchFiles=[];
   for(const d of dirs)for(const name of [scene.name,...CHINESE_DBS_TWINS.map(suffix=>stem+'_'+suffix+'.dbs')]){
    const patchFile=path.join(d,name);let table;try{table=dbsTable(fs.readFileSync(patchFile));}catch{continue;}
    const verified=serialTranslations(scene,table,scene.layout);
    if(verified){
     // A partially restored table and its backup can contain different surviving slots.
     // Keep the first verified translation of each serial, and record only files that contribute.
     if(!verified.some((text,i)=>text&&!keyedLines?.[i])||dbsScope(table,name)==='interface')continue;
     keyedLines=keyedLines?keyedLines.map((text,i)=>text||verified[i]):verified;
     patchFiles.push(patchFile);
     continue;
    }
    if(keyedLines)continue;
    const ids=rowIds(table);
    if((ids||scene.rowIds)&&(!ids||!scene.rowIds||ids.length!==scene.rowIds.length||ids.some((id,i)=>id!==scene.rowIds[i])))continue;
    const lines=chineseColumn(table,scene.lines);
    if(!lines)continue;any=true;
    return {...scene,scope:scene.scope==='interface'||dbsScope(table,name)==='interface'?'interface':'script',patchFile,
     patched:true,keyed:false,lines:lines.map((t,k)=>t||scene.lines[k])};}
   if(keyedLines){
    any=true;
    return {...scene,patched:true,keyed:true,patchFiles,lines:keyedLines.map((text,i)=>text||scene.lines[i])};
   }
   return scene;});
  return any?list:null;
 },
 // Count only instructions whose serial and Japanese cell agree with the Chinese release.
 storyProof(dir,tables){
  const proof={body:0,choice:0,bodyTotal:0,choiceTotal:0,files:[]};
  for(const scene of this.annotate(dir,tables)){
   if(!scene.roles)continue;
   const zh=serialTranslations(scene,scene.table,scene.layout);
   let paired=false;
   for(let i=0;i<scene.roles.length;i++){
    const role=scene.roles[i]==='b'?'body':scene.roles[i]==='c'?'choice':'';
    if(!role)continue;
    proof[role+'Total']++;
    if(zh?.[i]){proof[role]++;paired=true;}
   }
   if(paired)proof.files.push(scene.name);
  }
  return proof;
 },
 readDbs,dbsName:DBS,
};

// ---- KiriKiri Z, cx-encrypted (Steam releases: 千恋＊万花, サノバウィッチ, ATRI ...) ---------------------------------
// The scene files (.scn PSB) carry every line in all the release's languages: Japanese, English, Simplified and
// Traditional Chinese. They are decrypted once in a worker (psb.cjs, cx-worker.cjs) and cached; until the cache is
// ready the game reads as not yet readable and the next check picks it up.
const os=require('node:os');
const MEDIA_XP3=/^(?:bg|fg|ev|sd)?image|^(?:bgm|voice|sound|se|movie|video|thum|emote|font|sysse)/i;
const cxArchives=dir=>{try{return fs.readdirSync(dir).filter(f=>/\.xp3$/i.test(f)&&!MEDIA_XP3.test(f)).map(f=>path.join(dir,f));}catch{return [];}};
const cxCache=(file,version=7)=>{const st=fs.statSync(file);return path.join(os.tmpdir(),'megulit-cx',crypto.createHash('sha256').update(path.resolve(file).toLowerCase()+'|'+st.size+'|'+st.mtimeMs+'|'+version).digest('hex').slice(0,24)+'.json');};
const cxBuilds=new Map(),cxMemo=new Map(),cxQueue=[],cxStarted=new Map();let cxRunning=false;
const finishedCxWorkers=new WeakSet();
let cxProbe=null;
function withCxProbe(fn){const previous=cxProbe;cxProbe={deferred:false};try{return fn();}finally{cxProbe=previous;}}
function cxCachedDocs(out){
 try{const st=fs.statSync(out),hit=cxMemo.get(out);if(hit&&hit.at===st.mtimeMs)return hit.docs;const docs=JSON.parse(fs.readFileSync(out,'utf8')).docs||[];cxMemo.set(out,{at:st.mtimeMs,docs});return docs;}catch{}
 return null;
}
function cxDocs(file){
 let out;try{out=cxCache(file);}catch{return null;}
 const docs=cxCachedDocs(out);if(docs)return docs;
 // Keep the earlier scenes available while rebuilding caches that omitted Riddle PSB files.
 let legacy=null;try{legacy=cxCachedDocs(cxCache(file,6));}catch{}
 if(cxProbe)return legacy;
 if(!cxBuilds.has(out)){
  // Only archives that look like cx KiriKiri (encrypted entries) are worth a worker; one worker at a time.
  /* E595 a translation's patch.xp3 keeps its scene files unencrypted (each byte XOR-ed, which the worker undoes) */
  let list;try{list=xp3.list(file);}catch{list=null;}if(!list||!list.files.some(e=>e.encrypted||/\.scn$/i.test(e.name)))return legacy||[];
  cxBuilds.set(out,null);cxStarted.set(out,Date.now());cxQueue.push({file,out});cxNext();
 }
 return legacy;
}
/* 2026-11-16 probe (#184 #194 #275 #276 #291): the probe worker returns before the background cx build ends (the worker is
   unref'd), so a first probe of a cx game always read 0 lines and "decrypt-failed encrypted-archive". cxPrepareSync builds
   the missing caches in this thread, within a deadline; the probe calls it before reading. */
function cxPrepareSync(dir,{deadline=Infinity}={}){let built=0;
 const size=f=>{try{return fs.statSync(f).size;}catch{return 0;}},order=cxArchives(dir).sort((a,b)=>(/^scn/i.test(path.basename(b))-/^scn/i.test(path.basename(a)))||size(a)-size(b));
 for(const file of order){let out;try{out=cxCache(file);}catch{continue;}if(fs.existsSync(out)||cxBuilds.has(out))continue;
  if(Date.now()>=deadline){if(cxProbe)cxProbe.deferred=true;break;}
  const attempt=out+'.'+process.pid+'.'+crypto.randomUUID()+'.tmp';
  if(Number.isFinite(deadline)){
   const left=Math.floor(deadline-Date.now());if(left<=0){if(cxProbe)cxProbe.deferred=true;break;}
   const signal=new Int32Array(new SharedArrayBuffer(4));let worker,cleanExited;
   try{
    const {Worker}=require('node:worker_threads');worker=new Worker(path.join(__dirname,'cx-worker.cjs'),{workerData:{prepare:true,file,attempt,signal:signal.buffer}});worker.on('error',()=>{});worker.unref();cxBuilds.set(out,worker);cxStarted.set(out,Date.now());
    const owned=worker;cleanExited=()=>{if(cxBuilds.get(out)===owned)cxBuilds.delete(out);try{fs.rmSync(attempt,{force:true});}catch{}};worker.once('exit',cleanExited);
    const remaining=Math.floor(deadline-Date.now());if(remaining>0&&Atomics.load(signal,0)===0)Atomics.wait(signal,0,0,remaining);
    const status=Atomics.load(signal,0);
    if(Date.now()>=deadline||status===0){if(cxProbe)cxProbe.deferred=true;break;}
    // The worker has finished its attempt; only teardown is still pending.
    finishedCxWorkers.add(worker);
    if(status===1){if(cxCache(file)!==out||Date.now()>=deadline){if(cxProbe)cxProbe.deferred=true;break;}fs.renameSync(attempt,out);built++;}
   }catch{}finally{if(worker)try{worker.terminate().then(cleanExited,()=>{});}catch{}}
  }else try{if(require('./cx-worker.cjs').prepare(file,attempt)){fs.renameSync(attempt,out);built++;}}catch{}finally{try{fs.rmSync(attempt,{force:true});}catch{}}
 }
 return built;}
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
/* the Japanese slot of most lines has no kana but Han: a Chinese translation's own scene files */
function chineseDocs(docs){let han=0,kana=0;for(const d of docs)for(const sc of d.scenes||[])for(const r of sc.rows.slice(0,40)){const t=r[0]||'';if(/[ぁ-ゖァ-ヺ]/.test(t))kana++;else if(/[一-鿿]/.test(t))han++;}return han>=20&&han>kana*3;}
/* E610 a folder whose only readable cx scene files are a Chinese translation patch (the Japanese original stays encrypted): {lines} of the patch, or null. The probe reports it as a Chinese build instead of decrypt-failed. */
function cxChineseOnly(dir){let lines=0,docsAny=false;for(const file of cxArchives(dir)){const docs=cxDocs(file);if(!docs||!docs.length)continue;docsAny=true;if(!chineseDocs(docs))return null;for(const d of docs)for(const sc of d.scenes||[])lines+=sc.rows.length;}return docsAny&&lines?{lines}:null;}
const kirikiriCx={
 id:'kirikiri-cx',hint:'scn.xp3 / data.xp3',
 // One copy per scene file: patch archives override the rest, as the engine loads them (patch < patch2 < ...).
 scenes(dir){const byName=new Map();
  /* E595 an archive whose Japanese slot holds Chinese is a translation laid over the release: a patch, not the original */
  for(const file of cxArchives(dir)){const docs=cxDocs(file);if(!docs||chineseDocs(docs))continue;const r=rank(path.basename(file));
   for(const d of docs){const key=(d.name||d.entry).toLowerCase(),seen=byName.get(key);if(!seen||r>seen.r)byName.set(key,{r,name:d.name||d.entry,d});}}
  return [...byName.values()].map(x=>({name:x.name,read:()=>Buffer.from(JSON.stringify(x.d))})).sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 // Keep the previous source fingerprint until the replacement cache is published.
 sources:dir=>cxArchives(dir).flatMap(f=>{let c='';try{c=cxCache(f);if(!fs.existsSync(c))c=cxCache(f,6);}catch{}return c?[f,c]:[f];}),
 // ruby: the game's own readings for each Japanese line ([base, reading] pairs), used before any dictionary reading.
 parse(buf){const doc=JSON.parse(buf.toString('utf8')),lines=[],zh=[],ruby=[],voices=[];
  /* the Chinese slot is found by its text (ATRI: ja/en/zh-Hans/zh-Hant; PureStation: ja/zh-Hans/zh-Hant; 9-nine-: ja/en/zh-Hant) */
  const slot=chineseSlot(doc.scenes.flatMap(s=>s.rows)),order=slot>0?[slot]:[2,3];
  for(const scene of doc.scenes)scene.rows.forEach((row,k)=>{lines.push(row[0]||'');zh.push(unquoteSlot(order.map(i=>row[i]).find(Boolean)||'',row[0]||''));ruby.push(scene.ruby?.[k]?.length?scene.ruby[k]:null);voices.push(scene.voices?.[k]||null);});
  const v=voiceRef.keep(voices);return v?{lines,anchors:[],zh,ruby,voices:v}:{lines,anchors:[],zh,ruby};},
 test:()=>false,
 // The release's own Simplified (else Traditional) Chinese slot is the translation of each Japanese line.
 patchLines(base,found){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});if(any)return list;
  /* E595 else a translation archive beside the release (patch.xp3 of a 汉化硬盘版): its scenes by name, line for line */
  const over=new Map();for(const dir of found?.dirs||[])for(const file of cxArchives(dir)){const docs=cxDocs(file);if(!docs||!chineseDocs(docs))continue;for(const d of docs)over.set((d.name||d.entry).toLowerCase(),d.scenes.flatMap(x=>x.rows.map(r=>r[0]||'')));}
  if(!over.size)return null;
  const out=base.map(scene=>{const zh=over.get(String(scene.name).toLowerCase());if(!zh||zh.length!==scene.lines.length)return scene;any=true;return {...scene,patched:true,lines:zh.map((t,k)=>t||scene.lines[k])};});return any?out:null;},
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
 try{const raw=fs.readFileSync(file);let psbDoc=null;try{psbDoc=psb.parse(raw);}catch{/* a stray byte only costs the values it sits in (ambision: 1 of 54 saved scenes read as nothing) */try{psbDoc=psb.parse(raw,{tolerant:true});}catch{psbDoc=psb.openCx(raw);}}
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

// ---- FPD containers (E700: Fate/stay night REMASTERED obb/pack*.bin, #396) ------------------------------------------------
// fpd.cjs opens the archives with the key the program builds; scenario entries are KAG (.ks, parsed like KiriKiri) and
// per-scene text lists (.tl, read as plain text lines). Both formats are unverified against real scenario bytes.
const fpdLib=()=>require('./fpd.cjs');
function fpdScenes(dir){const g=fpdLib().open(dir);if(!g)return [];
 return [...g.files.entries()].filter(([n])=>/\.(ks|tl)$/i.test(n)).sort((a,b)=>a[0].localeCompare(b[0])).map(([name,x])=>({name,read:()=>fpdLib().read(x.file,x.entry,g.key.key)}));}
function parseTl(buf){const lines=[],kana=/[ぁ-ゖァ-ヺ]/;for(const raw of decode(buf).split(/\r?\n/)){const t=raw.replace(/\[[^\]]*\]/g,'').trim();if(t&&kana.test(t))lines.push(t);}return {lines,anchors:[]};}
const fpd={
 id:'fpd',hint:'obb/pack*.bin（FPD）',
 scenes:fpdScenes,
 archives:()=>[],
 sources:dir=>{const l=fpdLib();return [...l.archives(dir),...l.programs(dir).slice(0,1)];},
 parse(buf){const ks=parseKs(buf);if(ks.lines.length)return ks;return parseTl(buf);},
 test:()=>false,
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
// #303 AQUAPLUS "Filename" PCK (Data/Game/Script.sdat, WHITE ALBUM -綴られる冬の想い出- PC): aquaplus-pck.cjs.
const aquaplusPck=require('./aquaplus-pck.cjs').engine;
const leafPak=require('./leaf-pak.cjs').engine;
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
const fill=require('./fill.cjs'),avg32=require('./avg32.cjs'),nitroNpk=require('./npk.cjs').engine,nitroPak=require('./nitro-pak.cjs').engine,nitroNpa=require('./nitro-npa.cjs').engine,iga=require('./iga.cjs').engine,paz=require('./paz.cjs').engine,bruns=require('./bruns.cjs').engine,rePak=require('./re-pak.cjs').engine,fvp=require('./fvp.cjs').engine,advhd=require('./advhd.cjs').engine,reallive=require('./reallive.cjs').engine;
const voiceRef=require('./voice-ref.cjs');
const unityAssets=require('./unity-assets.cjs'),drv3=require('./drv3.cjs').engine,magesCpk=require('./mages-cpk.cjs').engine;/* E700 generic Unity */
const catsystem2=require('./catsystem2.cjs'),naninovel=require('./naninovel.cjs'),yarnspinner=require('./yarnspinner.cjs'),utage=require('./utage.cjs'),unityText=require('./unity-text.cjs'),higurashi=require('./higurashi.cjs'),mages=require('./mages.cjs'),capcomMsg=require('./capcom-msg.cjs'),spikeWad=require('./spike-wad.cjs'),aokana=require('./aokana.cjs').engine;
// E409 Nitroplus N4 (Steam The Song of Saya, script.npk NPK2): nitroplus-n4.cjs.
const nitroplusN4=require('./nitroplus-n4.cjs');
// E470 GARbro on-demand pack, tried after every reader of MeguLit's own (garbro.cjs).
const garbro=require('./garbro.cjs').engine;
/* S5 Kogado / Hypatia HyPack (kogado.cjs) */
const kogado=require('./kogado.cjs').engine;
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
const eushully=require('./eushully.cjs').engine;
const rugp=require('./rugp.cjs').engine;
const F4A_SCAN=require('./archive-scan.cjs').ENGINES;
const siglusPck=require('./siglus-pck.cjs').engine;
const ENGINES={'adapter-pack':adapterPack,'nitroplus-n4':nitroplusN4,'kirikiri-lang':kirikiriLang,tyrano,kirikiri,artemis,renpy,siglus,'siglus-pck':siglusPck,'kirikiri-cx':kirikiriCx,'kirikiri-dump':kirikiriDump,'kirikiri-ks':kirikiriKs,hunex,fpd,yuris,aquaplus,'aquaplus-pck':aquaplusPck,'leaf-pak':leafPak,nscripter,'unity-text':unityText,higurashi,mages,'capcom-msg':capcomMsg,'spike-wad':spikeWad,pwaat,naninovel,yarnspinner,utage,'mages-cpk':magesCpk,aokana,'unity-assets':unityAssets,drv3,catsystem2,rpgmaker,wolf,avg32,'nitro-npk':nitroNpk,'nitro-pak':nitroPak,'nitro-npa':nitroNpa,iga,paz,bruns,'re-pak':rePak,fvp,advhd,kogado,reallive,vgprompter,majiro,softpal,systemnnn,liar,rgss,silky,tmrhiro,nekosdk,ikura,exhibit,eagls,ast,seraph,interheart,nexas,malie,shiinario,cmvs,lucifen,kaguya,lcse,yuka,qlie,entis,alicesoft,marble,rugp,...webbundle,plaintext:require('./plaintext.cjs').engine,circus,whale,ddsystem,aoi,kid,...makers,escude,eushully,pjadv,luca,stuff,stcm2,slg:F4A_SCAN.slg,cpk:F4A_SCAN.cpk,evbox:F4A_SCAN.evbox,ism:F4A_SCAN.ism,glib2:F4A_SCAN.glib2,tanuki:F4A_SCAN.tanuki,yaneurao:F4A_SCAN.yaneurao,rits:F4A_SCAN.rits,bluegale:F4A_SCAN.bluegale,cyberworks:F4A_SCAN.cyberworks,dxlib:F4A_SCAN.dxlib,garbro};
// The engine whose running scripts this folder holds, if any can be read.
function readable(id,dir){let scenes;try{scenes=ENGINES[id].scenes(dir);}catch{return false;}
 for(const s of scenes.slice(0,64)){try{if((s.parse?s.parse():ENGINES[id].parse(s.read())).lines.length)return true;}catch{}}return false;} /* 64: a game may open with many code-only scenes (女王蜂の王房 endings, first.ks) */
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
 const list=engine.scenes(dir).map(s=>{const replaced=overlay?.get(s.name.toLowerCase());let parsed={lines:[],anchors:[]};try{parsed=replaced?engine.parse(replaced):(s.parse?s.parse():engine.parse(s.read()));}catch{}return fill.scene({name:s.name,...parsed,patched:!!replaced});});
 return engine.annotate?engine.annotate(dir,list):list;}
function fingerprint(id,dir){
 // Rebuild multilingual KiriKiri indexes that omitted captions in tag arguments.
 const format=id==='kirikiri-lang'?'caption-text-v1\n':'';
 const sources=ENGINES[id].sources(dir).sort().map(f=>path.basename(f)+'|'+stat(f)).join('\n');
 return crypto.createHash('sha256').update(id+'\n'+format+sources).digest('hex');
}
/* E294 (user: say that the first use needs 30-90 s of unpacking instead of "not supported"): what a game that cannot
   be read yet is waiting for. 'unpack': its cx archives are being decrypted in the background (started: when);
   'capture': strongly encrypted KiriKiri archives, read while the game runs (kirikiri-dump), nothing saved yet. */
function preparing(dir){
 if(cxProbe?.deferred)return {kind:'budget'};
 const viaGarbro=(()=>{try{return garbro.preparing(dir);}catch{return null;}})();if(viaGarbro)return viaGarbro;
 let started=0;for(const file of cxArchives(dir)){let out;try{out=cxCache(file);}catch{continue;}if(cxBuilds.has(out)&&!finishedCxWorkers.has(cxBuilds.get(out)))started=Math.min(started||Infinity,cxStarted.get(out)||Date.now());}
 if(started)return {kind:'unpack',startedAt:started};
 const archives=cxArchives(dir);if(!archives.length)return null;
 let encrypted=false;for(const file of archives){try{if(xp3.list(file)?.files.some(e=>e.encrypted)){encrypted=true;break;}}catch{}}
 return encrypted?{kind:'capture'}:null;
}
/* E375 why a recognised game cannot be read (an engine's own check, e.g. encrypted WOLF archives), or null. */
function unsupportedReason(dir){for(const e of Object.values(ENGINES)){if(typeof e.unsupported!=='function')continue;let code='';try{code=e.unsupported(dir);}catch{}if(code)return {engine:e.id,code,detail:e.REASONS?.[code]||''};}return null;}
module.exports={layerOriginal,sceneLanguage,cxChineseOnly,cxPrepareSync,withCxProbe,ownCx,unquoteSlot,unsupportedReason,preparing,cxBuilds,chineseColumn,ENGINES,detect,readable,read,fingerprint,parseKs,parseAst,parseRpy,pfsList,pfsRead,tlPairs,decode};
