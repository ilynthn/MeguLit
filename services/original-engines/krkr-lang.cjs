// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E414 multilingual KiriKiri releases (user, 2026-11-11: ファタモルガーナの館 / The House in Fata Morgana, Steam 中日英):
// one program per language (fata_jp.exe / fata_cn.exe / fata_en.exe) and one archive per language next to the shared
// data.xp3: data_jp.xp3, data_zh.xp3, data_en.xp3. Their entries carry the archive's "encrypted" flag, but the scripts
// inside are plain UTF-16 text (BOM), so they are read as they are; an entry that is really encrypted is skipped.
// The Japanese and Chinese scripts are the same scenario with the text swapped; every message block ends with
// "text[p]", a unique label "*scenario_<GUID>|" and "[cm]" (clear). Blocks are paired by that label, line by line:
// 34250 of 34405 labelled blocks pair, 34073 with the same number of lines.
// Lines are the text between tags; "[l]" inside a physical line splits it into sentences on one row (the second one
// continues the row), a new physical line ("[r]") is a new row, and the first line of each block starts a page.
// "[if exp=…]A[endif][if exp=…]B[endif]" inside a line (a name the player sees one of) keeps the first branch.
const fs=require('node:fs'),path=require('node:path'),xp3=require('./xp3.cjs'),{choiceScan}=require('./ks-choice.cjs');
const JA=/^data_(?:jp|ja|jpn|japanese)\.xp3$/i,ZH=/^data_(?:zh|cn|chs|sc|zhs|schinese)\.xp3$/i,ZT=/^data_(?:tw|zt|cht|tc|tchinese)\.xp3$/i;
const KS=n=>/\.ks$/i.test(n);
const listMemo=new Map();
function stamp(file){try{const s=fs.statSync(file);return s.size+'|'+s.mtimeMs;}catch{return '';}}
function list(file){const k=file+'|'+stamp(file);if(listMemo.has(k))return listMemo.get(k);let t=null;try{t=xp3.list(file);}catch{}listMemo.set(k,t);if(listMemo.size>16)listMemo.delete(listMemo.keys().next().value);return t;}
/* 2026-11-28 (owner: 汉化和日文在一个文件夹里的类型非常常见，一定要做好) other official multilingual releases name the per-language
   archive differently: scenario_ja.xp3 + scenario_chs.xp3, data-jp.xp3 + data-sc.xp3, datajp.xp3 + datacn.xp3. Any
   <base>[_-]<lang>.xp3 / <base><lang>.xp3 pair counts when the Japanese one of the same base holds .ks scenes and a Chinese
   one sits beside it; data_<lang>.xp3 keeps its own rule above (Fata: the Japanese archive alone is enough). */
const LANG_TAIL=/^(.*?)[_-]?(jp|ja|jpn|japanese|zh|cn|chs|sc|zhs|schinese|tw|zt|cht|tc|tchinese)\.xp3$/i;
const langOf=tag=>/^(?:jp|ja|jpn|japanese)$/i.test(tag)?'ja':/^(?:tw|zt|cht|tc|tchinese)$/i.test(tag)?'zt':'zh';
function anyBase(dir,files){const byBase=new Map();
 for(const n of files){const m=LANG_TAIL.exec(n);if(!m||!m[1]||/^patch\d*$/i.test(m[1]))continue;const base=m[1].replace(/[_-]$/,'').toLowerCase(),lang=langOf(m[2]);
  if(!byBase.has(base))byBase.set(base,{});const g=byBase.get(base);if(!g[lang])g[lang]=path.join(dir,n);}
 for(const g of byBase.values()){if(!g.ja||!(g.zh||g.zt))continue;if(scripts(g.ja).length)return {ja:g.ja,zh:g.zh||g.zt};}
 return null;}
function archives(dir){let files=[];try{files=fs.readdirSync(dir);}catch{return null;}const find=re=>{const f=files.find(n=>re.test(n));return f?path.join(dir,f):null;};
 const ja=find(JA);if(!ja)return anyBase(dir,files);return {ja,zh:find(ZH)||find(ZT)};}
/* Some multilingual Fata releases ship small language launchers that exit after starting the shared KiriKiri engine. */
function launchTarget(executable){
 if(!executable||!/^fata_(?:jp|ja|zh|cn|chs|cht|tw|en|ru)\.exe$/i.test(path.basename(executable)))return null;
 const dir=path.dirname(executable),target=path.join(dir,'fata.exe');
 try{
  const launcher=fs.statSync(executable);
  if(!launcher.isFile()||launcher.size>1024*1024||!fs.statSync(target).isFile()||
     !fs.statSync(path.join(dir,'data.xp3')).isFile()||!archives(dir))return null;
  const bytes=fs.readFileSync(executable);
  if(bytes.toString('ascii',0,2)!=='MZ')return null;
  const encodings=['latin1','utf16le'].filter(encoding=>bytes.includes(Buffer.from('fata.exe\0',encoding)));
  return encodings.length?{executable:target,bytes,encodings}:null;
 }catch{return null;}
}
// Plain text of one entry (UTF-16 or UTF-8 with BOM), else null.
function entryText(file,entry){try{const t=xp3.decodeText(xp3.read(file,entry));return t&&typeof t.text==='string'?t.text:null;}catch{return null;}}
function scripts(file){const t=list(file);if(!t)return [];return t.files.filter(e=>KS(e.name)&&e.size>0).map(e=>({name:e.name.replace(/\\/g,'/'),entry:e})).sort((a,b)=>a.name.localeCompare(b.name));}
const INLINE_IF=/\[if exp="[^"]*"\]([^\[]*)\[endif\](?:\[if exp="[^"]*"\][^\[]*\[endif\])+/gi;
const ascii=t=>/^[\x20-\x7e]*$/.test(t);
// The multilingual prologue also draws captions from literal [c text="…"] commands.
const INLINE_TAG=/\[\[|\[c\s+text\s*=\s*(?:"([^"]*)"|'([^']*)')\s*\]|\[(?:[^\]"']|"[^"]*"|'[^']*')*\]/gi;
function parseRow(line){
 const parts=[];let text='',at=0,clear=false;
 for(const match of line.matchAll(INLINE_TAG)){
  const [tag,doubleQuoted,singleQuoted]=match;
  text+=line.slice(at,match.index);
  at=match.index+tag.length;
  if(tag==='[[')text+='[';
  else if(/^\[l\]$/i.test(tag)){parts.push(text);text='';}
  else if(/^\[(?:cm|er|ct)(?:\s|\])/i.test(tag))clear=true;
  else text+=doubleQuoted??singleQuoted??'';
 }
 parts.push(text+line.slice(at));
 return {parts:parts.map(t=>t.trim()).filter(Boolean),clear};
}
// Blocks of one script: {key, rows:[[sentence,…],…]}; anchors: ASCII command/label lines.
function blocks(text){const out=[],anchors=[],chs=[],cs=choiceScan();let rows=[],code=false;
 // a choice set sits after the block holding the rows read so far (open: not closed yet), else after the last closed one
 const close=key=>{if(rows.length){const b={key,rows};out.push(b);for(const c of chs)if(c.open&&!c.block)c.block=b;}rows=[];};
 const flush=()=>{const o=cs.take();if(o)chs.push({options:o,open:rows.length>0,prev:out[out.length-1]||null,block:null});};
 for(const raw of String(text||'').split(/\r?\n/)){if(cs.stop)flush();const t=raw.trim();
  // E449 TJS between [iscript] / @iscript and [endscript] / @endscript is code, not text (config.ks).
  if(/^(?:@iscript\b|\[iscript\])/i.test(t)){code=true;continue;}if(code){if(/^(?:@endscript\b|\[endscript\])/i.test(t))code=false;continue;}
  if(!t||t[0]===';')continue;
  if(t[0]==='*'){if(ascii(t))anchors.push(t);close(t.includes('|')?t:null);continue;}
  if(t[0]!=='*')cs.feed(t[0]==='@'?'['+t.slice(1)+']':t.replace(INLINE_IF,'$1'));
  if(t[0]==='@'){if(ascii(t))anchors.push(t);if(/^@(?:cm|er|ct)(?:\s|$)/i.test(t))close(null);continue;}
  const {parts,clear}=parseRow(t.replace(INLINE_IF,'$1'));
  if(parts.length)rows.push(parts);else if(ascii(t))anchors.push(t);
  if(clear)close(null);}
 flush();close(null);return {blocks:out,anchors,choices:chs};}
// One scenario: Japanese lines with the Chinese of the same label, page starts and row continuations (local indices).
/* Blocks without a label both languages share (unlabelled blocks: choices, whole scenes such as badend4.ks; labels
   regenerated in one language, memory1.ks) pair in order within the stretch between two shared labels, when that
   stretch holds as many of them on both sides (user, 2026-11-11: "and the remaining 0.7%?"). */
function byOrder(ja,zh,byKey){const out=new Map(),jaKeys=new Set(ja.map(b=>b.key).filter(Boolean));
 const runs=(list,shared)=>{const m=new Map();let seg='';for(const b of list){if(b.key&&shared(b.key)){seg=b.key;continue;}if(!m.has(seg))m.set(seg,[]);m.get(seg).push(b);}return m;};
 const a=runs(ja,k=>byKey.has(k)),z=runs(zh,k=>jaKeys.has(k));
 for(const [seg,list] of a){const other=z.get(seg);if(other&&other.length===list.length)list.forEach((b,i)=>out.set(b,other[i]));}
 return out;}
function pair(jaText,zhText){const ja=blocks(jaText),zh=zhText?blocks(zhText):{blocks:[]},byKey=new Map();for(const b of zh.blocks)if(b.key&&!byKey.has(b.key))byKey.set(b.key,b);
 const lines=[],trans=[],starts=[],cont=[],ordered=byOrder(ja.blocks,zh.blocks,byKey),ends=new Map();let last=null;
 for(const b of ja.blocks){if(last)ends.set(last,lines.length-1);last=b;const z=(b.key&&byKey.get(b.key))||ordered.get(b)||null,jaFlat=b.rows.flat(),zhFlat=z?z.rows.flat():[];
  if(z&&zhFlat.length===jaFlat.length){let k=0;b.rows.forEach(row=>row.forEach((s,i)=>{const at=lines.length;if(!k)starts.push(at);if(i)cont.push(at);lines.push(s);trans.push(zhFlat[k++]);}));continue;}
  if(z&&z.rows.length===b.rows.length){b.rows.forEach((row,r)=>{const at=lines.length;if(!r)starts.push(at);lines.push(row.join(''));trans.push(z.rows[r].join(''));});continue;}
  /* Different shape (or no Chinese block): one line for the block, the Chinese block whole. */
  starts.push(lines.length);lines.push(b.rows.map(r=>r.join('')).join('\n'));trans.push(z?z.rows.map(r=>r.join('')).join('\n'):'');}
 if(last)ends.set(last,lines.length-1);
 // choices come from the Japanese script; `after` is the last line of the block they follow (-1: before the first line)
 const choices=ja.choices.map(c=>({after:(c.block||c.prev)?ends.get(c.block||c.prev):-1,options:c.options}));
 return {lines,zh:trans,anchors:ja.anchors,starts,cont,choices};}
// Scenes as the scene reader lists them (sorted by name); each one carries both languages.
function scenes(dir){const a=archives(dir);if(!a)return [];const zhList=a.zh?new Map(scripts(a.zh).map(s=>[s.name.toLowerCase(),s])):new Map();
 return scripts(a.ja).map(s=>({name:s.name,read:()=>{const ja=entryText(a.ja,s.entry);if(ja==null)return Buffer.from('null');const z=zhList.get(s.name.toLowerCase());return Buffer.from(JSON.stringify({ja,zh:z?entryText(a.zh,z.entry):null}));}}));}
function parse(buf){const doc=JSON.parse(buf.toString('utf8'));if(!doc||typeof doc.ja!=='string')return {lines:[],anchors:[]};const p=pair(doc.ja,doc.zh),out={lines:p.lines,anchors:p.anchors,zh:p.zh,starts:p.starts,cont:p.cont};if(p.choices.length)out.choices=p.choices;return out;}
// Page structure over the whole script, in the scene reader's line order (scenes concatenated by name).
const pageMemo=new Map();
function pages(dir){const a=archives(dir);if(!a)return null;const key=a.ja+'|'+stamp(a.ja)+'|'+(a.zh?stamp(a.zh):'');if(pageMemo.has(key))return pageMemo.get(key);
 const out={starts:new Set(),cont:new Set(),known:new Set()};let base=0;
 for(const s of scenes(dir)){let p;try{p=parse(s.read());}catch{continue;}for(const i of p.starts||[])out.starts.add(base+i);for(const i of p.cont||[])out.cont.add(base+i);for(let i=0;i<p.lines.length;i++)out.known.add(base+i);base+=p.lines.length;}
 const result=out.known.size?out:null;pageMemo.set(key,result);return result;}
module.exports={archives,launchTarget,scenes,parse,pages,pair,blocks};
