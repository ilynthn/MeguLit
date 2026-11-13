// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
// E304 (user, 2026-11-10: 魔法使いの夜 / WITCH ON THE HOLY NIGHT, Steam): HuneX engine releases keep every line of the
// game in per-language text tables (script_text_ja.ctd, _zc Simplified, _zt Traditional, _en) inside HFA archives
// ("HUNEXGGEFA10": a count, then 0x80-byte entries with name, offset, size). Line i of one table is line i of every
// other, so the Japanese line the game shows is paired with the release's own Chinese at once.
// Tables are LenZu-compressed ("LenZuCompressor"): a Huffman table of 2^n symbols, then MSB-first bits: a flag picks a
// literal run (symbol + 1 raw bytes) or a back-reference (length = symbol + base, distance = symbol << low | low bits,
// plus base). Format as described by the community project loicfrance/mahoyo_tools; this is an independent implementation.
const fs=require('node:fs'),path=require('node:path');
const HFA=Buffer.from('HUNEXGGEFA10','latin1'),LENZU=Buffer.from('LenZuCompressor\0','latin1');
/* E577 the HFA index is a kit table: 0x80-byte entries {UTF-8 name[0x60], u32 offset (after the index), u32 size} */
const HFA_TABLE={magic:'HUNEXGGEFA10',count:{at:12,type:'u32le'},entries:16,encoding:'utf-8',base:'after-index',
 fields:[{name:'name',type:'cstr',size:0x60},{name:'offset',type:'u32le'},{name:'size',type:'u32le'},{type:'skip',size:0x18}]};
function hfaList(file){const l=kit.table(file,HFA_TABLE);return l?l.map(e=>({name:e.name,offset:e.offset,size:e.size})):null;}
const hfaRead=(file,entry)=>kit.readAt(file,entry.offset,entry.size);
function lenzu(src){
 if(src.length<0x40||!src.subarray(0,16).equals(LENZU))throw Error('LENZU_MAGIC');
 const size=src.readUInt32LE(0x20);let p=0x30;
 const bits=Math.max(src[p+1],src[p+2]),lowBits=src[p+4],baseDist=src[p+5];p+=6;
 if(bits<3||bits>15||lowBits>15||baseDist<2||baseDist>8||size>256<<20)throw Error('LENZU_OPTIONS');
 const leaves=1<<bits,indexBytes=Math.ceil(Math.ceil(bits/8)/8);
 let fill=src.readUIntLE(p,indexBytes);p+=indexBytes;if(!fill)fill=leaves;
 const weight=new Array(leaves).fill(0),value=[],kids=[],parent=[];
 for(let i=0;i<leaves;i++){value.push(i);kids.push(null);parent.push(-1);}
 if(leaves*4<(Math.ceil(bits/8)+4)*fill){for(let i=0;i<leaves;i++){weight[i]=src.readUInt32LE(p);p+=4;}}
 else for(let k=0;k<fill;k++){const i=src.readUIntLE(p,indexBytes);p+=indexBytes;weight[i]=src.readUInt32LE(p);p+=4;}
 let total=0;for(const w of weight)total+=w;
 // Join the two lightest free nodes until one holds the whole weight; the lighter one sits on the 1 branch.
 const max=((leaves+1)*leaves)>>1;
 for(let i=leaves;i<max;i++){
  let a=-1,b=-1;
  for(let j=0;j<i;j++){if(!weight[j]||parent[j]>=0)continue;if(a<0||weight[j]<weight[a]){b=a;a=j;}else if(b<0||weight[j]<weight[b])b=j;}
  if(a<0)throw Error('LENZU_TREE');
  weight.push((b>=0?weight[b]:0)+weight[a]);value.push(-1);kids.push([b,a]);parent.push(-1);if(b>=0)parent[b]=i;parent[a]=i;
  if(weight[i]>=total)break;
 }
 const root=weight.length-1,end=src.length*8;let bp=p*8;
 const bit=()=>{if(bp>=end)throw Error('LENZU_TRUNCATED');const v=(src[bp>>3]>>(7-(bp&7)))&1;bp++;return v;};
 const read=n=>{let v=0;for(let k=0;k<n;k++)v=v*2+bit();return v;};
 const sym=()=>{let n=root;while(value[n]<0){n=kids[n][bit()];if(n<0)throw Error('LENZU_CODE');}return value[n];};
 const out=Buffer.alloc(size);let o=0;
 while(o<size){
  if(bit()){const len=sym()+baseDist,hi=sym(),lo=lowBits?read(lowBits):0,dist=hi*(1<<lowBits)+lo+baseDist;if(dist>o)throw Error('LENZU_DISTANCE');
   for(let k=0;k<len&&o<size;k++,o++)out[o]=out[o-dist];}
  else{const len=sym();for(let k=0;k<=len&&o<size;k++)out[o++]=read(8);}
 }
 return out;
}
// Displayed text: <base|reading> ruby keeps its base (Latin incantations keep the Latin with a gloss: base too); the
// leading @x command and ^ markers are layout, not text.
const RUBY=/<([^<>|]*)\|([^<>]*)>/g;
const clean=t=>String(t||'').replace(/^@[a-z]/i,'').replace(RUBY,'$1').replace(/\^/g,'').replace(/@[a-z]/gi,'');
function rubyOf(t){const out=[];for(const m of String(t||'').matchAll(RUBY)){const reading=m[2];if(/^[ぁ-ゖァ-ヺー]+$/.test(reading)&&m[1])out.push([m[1],reading]);}return out;}
// The text tables of a game folder: {ja, zc, zt, en} → archive and entry.
function tables(dir){const out={};let files=[];try{files=fs.readdirSync(dir).filter(f=>/\.hfa$/i.test(f)).sort();}catch{return out;}
 for(const f of files){let list=null;try{list=hfaList(path.join(dir,f));}catch{}if(!list)continue;
  for(const e of list){const m=e.name.match(/^script_text_([a-z]+)\.ctd$/i);if(m)out[m[1].toLowerCase()]={file:path.join(dir,f),entry:e};}}
 return out;}
const memo=new Map();
function tableLines(t){let st;try{st=fs.statSync(t.file);}catch{return null;}const key=t.file+'|'+t.entry.name+'|'+st.size+'|'+st.mtimeMs;
 if(memo.has(key))return memo.get(key);let lines=null;try{lines=lenzu(hfaRead(t.file,t.entry)).toString('utf8').split(/\r?\n/);}catch{}memo.set(key,lines);if(memo.size>12)memo.delete(memo.keys().next().value);return lines;}
// E358 (user report, WoH 1.2.8: the Chinese the game drew had a blank for every third character). HuneX draws text from
// prebuilt bitmap fonts, one set per game language (FONT_ja_*.mzp, FONT_zc_*.mzp ...), and FontLLTTSS.ccit lists the
// characters of each: LL the language (00 ja, 01 en, 02 zc, 03 zt), TT the face, SS 00 ASCII / 01 the rest. Entries are
// 8 bytes after a count and entry size: the UTF-8 bytes of the character as a big-endian number, then its glyph index.
// The Japanese game's body face (Font000000 + Font000001) holds 2800 characters: it draws 4.9 % of the official Chinese lines.
const LANGS={ja:'00',en:'01',zc:'02',zt:'03'},glyphMemo=new Map();
function ccit(buf){const d=lenzu(buf),n=d.readUInt32LE(0),size=d.readUInt32LE(4)||8,out=[];if(size<8||8+n*size>d.length)return out;
 for(let i=0;i<n;i++){const v=d.readUInt32LE(8+i*size),bytes=[v>>>24,(v>>>16)&255,(v>>>8)&255,v&255];while(bytes.length>1&&!bytes[0])bytes.shift();out.push(Buffer.from(bytes).toString('utf8'));}return out;}
function glyphs(dir,lang='ja'){const code=LANGS[lang];if(!code)return null;const key=String(dir).toLowerCase()+'|'+code;if(glyphMemo.has(key))return glyphMemo.get(key);let set=null;
 try{const want=new Set(['Font'+code+'0000.ccit','Font'+code+'0001.ccit']);for(const f of fs.readdirSync(dir).filter(f=>/\.hfa$/i.test(f)).sort()){const file=path.join(dir,f);let list=null;try{list=hfaList(file);}catch{}if(!list)continue;
  for(const e of list)if(want.has(e.name)){set??=new Set();for(const c of ccit(hfaRead(file,e)))set.add(c);}}}catch{set=null;}
 if(set&&set.size<100)set=null;glyphMemo.set(key,set);return set;}
// E410 (user: WoH kept the previous page's lines on the next page). The page breaks are not in the text table but in the
// compiled scripts (*.chs, "HunexCompiledScriptVer1.00", LenZu): 32-bit words, string pointers are file offsets - 0x30.
// A text command is 123, 0x12345678, n, ptr, 0, wait, 0,1,0,0,0,0, 3, ptr, 320[, 321]; the string names the table lines it
// shows ("$000008\n$000009", an @x prefix continues the row the last line ended on). wait 2 followed by 321 waits for the
// click and clears the page (7122 of 7163 such commands): the next text command starts a page, as the first of each script.
// starts/cont/known hold table line numbers (WoH: 250 scripts, 23093 text commands, 23807 lines).
const TEXT_OP=123,TEXT_TAG=0x12345678,CLEAR_OP=321,pageMemo=new Map();
function scriptPages(x,out){if(x.length<0x30||x.toString('latin1',0,19)!=='HunexCompiledScript')return;const n=x.length>>2,word=i=>x.readUInt32LE(i*4);
 const str=v=>{const p=v+0x30;if(p<0x30||p>=x.length)return null;const e=x.indexOf(0,p);return x.toString('utf8',p,e<0?x.length:e);};let first=true,clear=false;
 for(let i=0;i+15<n;i++){if(word(i)!==TEXT_OP||word(i+1)!==TEXT_TAG)continue;const s=str(word(i+3));if(!s||s.includes('＆')||!/^(?:@[a-z]\d*|\n)*\$\d{6}/.test(s))continue;
  const ids=[...s.matchAll(/\$(\d{6})/g)].map(m=>+m[1]);for(const id of ids)out.known.add(id);if(first||clear)out.starts.add(ids[0]);if(/^@x/.test(s))out.cont.add(ids[0]);
  first=false;clear=word(i+5)===2&&word(i+15)===CLEAR_OP;}}
function pages(dir){const key=String(dir).toLowerCase();if(pageMemo.has(key))return pageMemo.get(key);const out={starts:new Set(),cont:new Set(),known:new Set()};
 try{for(const f of fs.readdirSync(dir).filter(f=>/\.hfa$/i.test(f)).sort()){const file=path.join(dir,f);let list=null;try{list=hfaList(file);}catch{}if(!list)continue;
  for(const e of list)if(/\.chs$/i.test(e.name)){try{scriptPages(lenzu(hfaRead(file,e)),out);}catch{}}}}catch{}
 const result=out.known.size?out:null;pageMemo.set(key,result);return result;}
module.exports={hfaList,hfaRead,lenzu,clean,rubyOf,tables,tableLines,ccit,glyphs,pages,scriptPages};
