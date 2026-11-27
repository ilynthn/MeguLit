// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');
/* E449 RealLive (Key / Visual Arts: リトルバスターズ！ and EX, Little Busters! English Edition, CLANNAD full voice,
   クドわふたー ...). Format and keys from rlvm's libreallive (archive.cc, scenario.cc, compression.cc),
   Copyright (c) 2006, 2007 Peter Jolly, MIT licence (see THIRD-PARTY.md):
   Seen.txt holds 10000 index entries {i32 offset, i32 length} (offset 0: no scenario). A scenario starts with a 0x1d0
   header: i32 0x1d0, i32 compiler version (10002; 110002 and 1110002 add a per-title second XOR), +0x20 offset of the
   compressed bytecode, +0x24 its unpacked length, +0x28 its packed length. The bytecode is LZ with every packed byte
   XOR-ed by a fixed 256-byte mask (position wrapping at 256, starting at 8 after an 8-byte prefix); the second XOR is
   applied to fixed ranges of the unpacked bytecode with a 16-byte key per title.
   Text: Shift-JIS runs of the bytecode (textout, selection strings); commands and expressions are ASCII and dropped.
   A Chinese patch that ships its own Seen.txt (GBK) is read the same way and pairs by scenario number. */
const fs=require('node:fs'),path=require('node:path');
const sj=kit.SJIS,gbk=new TextDecoder('gbk');
const MASK=Buffer.from([
 0x8b,0xe5,0x5d,0xc3,0xa1,0xe0,0x30,0x44,0x00,0x85,0xc0,0x74,0x09,0x5f,0x5e,0x33,0xc0,0x5b,0x8b,0xe5,0x5d,0xc3,0x8b,0x45,
 0x0c,0x85,0xc0,0x75,0x14,0x8b,0x55,0xec,0x83,0xc2,0x20,0x52,0x6a,0x00,0xe8,0xf5,0x28,0x01,0x00,0x83,0xc4,0x08,0x89,0x45,
 0x0c,0x8b,0x45,0xe4,0x6a,0x00,0x6a,0x00,0x50,0x53,0xff,0x15,0x34,0xb1,0x43,0x00,0x8b,0x45,0x10,0x85,0xc0,0x74,0x05,0x8b,
 0x4d,0xec,0x89,0x08,0x8a,0x45,0xf0,0x84,0xc0,0x75,0x78,0xa1,0xe0,0x30,0x44,0x00,0x8b,0x7d,0xe8,0x8b,0x75,0x0c,0x85,0xc0,
 0x75,0x44,0x8b,0x1d,0xd0,0xb0,0x43,0x00,0x85,0xff,0x76,0x37,0x81,0xff,0x00,0x00,0x04,0x00,0x6a,0x00,0x76,0x43,0x8b,0x45,
 0xf8,0x8d,0x55,0xfc,0x52,0x68,0x00,0x00,0x04,0x00,0x56,0x50,0xff,0x15,0x2c,0xb1,0x43,0x00,0x6a,0x05,0xff,0xd3,0xa1,0xe0,
 0x30,0x44,0x00,0x81,0xef,0x00,0x00,0x04,0x00,0x81,0xc6,0x00,0x00,0x04,0x00,0x85,0xc0,0x74,0xc5,0x8b,0x5d,0xf8,0x53,0xe8,
 0xf4,0xfb,0xff,0xff,0x8b,0x45,0x0c,0x83,0xc4,0x04,0x5f,0x5e,0x5b,0x8b,0xe5,0x5d,0xc3,0x8b,0x55,0xf8,0x8d,0x4d,0xfc,0x51,
 0x57,0x56,0x52,0xff,0x15,0x2c,0xb1,0x43,0x00,0xeb,0xd8,0x8b,0x45,0xe8,0x83,0xc0,0x20,0x50,0x6a,0x00,0xe8,0x47,0x28,0x01,
 0x00,0x8b,0x7d,0xe8,0x89,0x45,0xf4,0x8b,0xf0,0xa1,0xe0,0x30,0x44,0x00,0x83,0xc4,0x08,0x85,0xc0,0x75,0x56,0x8b,0x1d,0xd0,
 0xb0,0x43,0x00,0x85,0xff,0x76,0x49,0x81,0xff,0x00,0x00,0x04,0x00,0x6a,0x00,0x76]);
const K=a=>Buffer.from(a);
// Second-level keys: [key, offset, length] per range (rlvm compression.cc).
const KEYS={
 'little-busters':[[K([0xa8,0x28,0xfd,0x66,0xa0,0x23,0x77,0x69,0xf9,0x45,0xf8,0x2c,0x7c,0x00,0xad,0xf4]),256,257]],
 'little-busters-ex':[[K([0xa8,0x28,0xfd,0x71,0xb4,0x23,0x64,0x15,0x96,0x48,0x8a,0x43,0x62,0x0e,0xad,0xf0]),256,128],
  [K([0xde,0xd9,0x4a,0x18,0xaf,0x23,0x1d,0x9a,0xac,0x23,0x25,0x48,0xd8,0xd4,0x8f,0xa7]),384,128],
  [K([0xde,0xf1,0xb7,0x69,0x1b,0x00,0x79,0x8f,0x3a,0x6b,0xaf,0x0b,0xba,0xda,0x22,0x57]),512,16],
  [K([0x76,0xf1,0xb7,0x69,0x1b,0x00,0x79,0x8f,0x3a,0x6b,0xaf,0x0b,0xba,0xda,0x22,0x57]),528,113]],
 'clannad-full-voice':[[K([0xaf,0x2f,0xfb,0x6b,0xaf,0x30,0x77,0x17,0x87,0x48,0xfe,0x2c,0x68,0x1a,0xb9,0xf0]),256,257]],
 'snow-se':[[K([0xe4,0xab,0xa2,0xc9,0xec,0x39,0x36,0x62,0xc9,0x03,0xba,0x6d,0x2e,0x9c,0xf2,0x64]),256,257]],
 'kud-wafter':[[K([0x67,0x1c,0x21,0xbe,0x6f,0xef,0xb5,0x16,0x4a,0x82,0x39,0x2b,0xad,0x3a,0x71,0x3f]),256,257]],
 'kud-wafter-all-ages':[[K([0xaf,0x3f,0xe6,0x63,0xad,0x3a,0x69,0x18,0x85,0x45,0xe5,0x40,0x1e,0x7e,0xb9,0xe0]),256,257]],
};
function decompress(src,dlen,key){const dst=Buffer.alloc(dlen);let s=8,d=0,m=8,bit=1;if(s>=src.length)return dst;let flag=src[s++]^MASK[m++&255];
 while(s<src.length&&d<dlen){if(bit===256){bit=1;flag=src[s++]^MASK[m++&255];}
  if(flag&bit)dst[d++]=src[s++]^MASK[m++&255];
  else{let c=src[s++]^MASK[m++&255];c|=(src[s++]^MASK[m++&255])<<8;const from=d-((c>>4)-1)-1,n=(c&15)+2;if(from<0||from>=d)throw Error('REALLIVE_CORRUPT');for(let i=0;i<n&&d<dlen;i++)dst[d++]=dst[from+i];}
  bit<<=1;}
 if(key)for(const [k,off,len] of key)for(let i=0;i<len&&off+i<dlen;i++)dst[off+i]^=k[i%16];
 return dst;}
function index(b){const out=[];if(b.length<80000)return out;for(let i=0;i<10000;i++){const o=b.readInt32LE(i*8),n=b.readInt32LE(i*8+4);if(o>0&&n>0&&o+n<=b.length)out.push({id:i,offset:o,length:n});}return out;}
function header(d){if(d.length<0x1d0||d.readInt32LE(0)!==0x1d0)return null;const v=d.readInt32LE(4);if(v!==10002&&v!==110002&&v!==1110002)return null;
 return {version:v,xor2:v!==10002,at:d.readInt32LE(0x20),dlen:d.readInt32LE(0x24),clen:d.readInt32LE(0x28)};}
// Text runs: double-byte Shift-JIS (or GBK) characters; quoted pieces ("…") also keep ASCII and single-char tokens.
const lead=c=>(c>=0x81&&c<=0x9f)||(c>=0xe0&&c<=0xfc);
const dblChar=(code,j)=>j+1<code.length&&(lead(code[j])||(code[j]>=0xa1&&code[j]<=0xfe))&&code[j+1]>=0x40&&code[j+1]!==0x7f;
/* Base double-byte scan kept for key scoring so auto-picking second-level keys is unaffected by quoted-text rules. */
function keyRuns(code){const out=[];let i=0;
 while(i<code.length){if(!lead(code[i])&&!(code[i]>=0xa1&&code[i]<=0xfe)){i++;continue;}const st=i;let dbl=0,quoted=false;
  for(;;){if(dblChar(code,i)){i+=2;dbl++;continue;}if(code[i]===0x22){let j=i;while(code[j]===0x22)j++;if(dblChar(code,j)){i=j;quoted=true;continue;}}break;}
  if(dbl>=2)out.push(quoted?Buffer.from(code.subarray(st,i).filter(b=>b!==0x22)):code.subarray(st,i));if(i===st)i++;}
 return out;}
/* Quoted pieces ("…""【""名前""】""「…」") are one text token (rlvm: the quotes are not printed). Check double-byte first
   inside quotes so Shift-JIS 0x5c trail bytes never escape '"'; unquoted runs stay double-byte only as before. */
function runs(code){const out=[];let i=0;
 const ch=j=>dblChar(code,j);
 const readQuoted=at=>{const raw=[],dbl=[];let j=at+1,n=0;while(j<code.length){
   if(ch(j)){raw.push(code[j],code[j+1]);dbl.push(code[j],code[j+1]);n++;j+=2;continue;}
   const c=code[j];if(c===0x22)return {next:j+1,raw,dbl,n};
   if(c===0x5c&&j+1<code.length&&code[j+1]===0x22){raw.push(code[j+1]);j+=2;continue;}
   if(c>=0x20&&c<=0x7e){raw.push(c);j++;continue;}
   return null;}return null;};
 while(i<code.length){if(code[i]!==0x22&&!lead(code[i])&&!(code[i]>=0xa1&&code[i]<=0xfe)){i++;continue;}
  const st=i,raw=[],dbl=[];let n=0,quoted=false;
  for(;;){if(ch(i)){raw.push(code[i],code[i+1]);dbl.push(code[i],code[i+1]);n++;i+=2;continue;}
   if(code[i]===0x22){const q=readQuoted(i);if(q&&(q.n>0||n>0)){for(const x of q.raw)raw.push(x);for(const x of q.dbl)dbl.push(x);n+=q.n;quoted=true;i=q.next;continue;}}break;}
  if(n>=2||(quoted&&n>=1)){const b=Buffer.from(raw);if(quoted&&raw.length!==dbl.length)b._dbl=Buffer.from(dbl);b._at=st;out.push(b);}
  if(i===st)i++;}
 return out;}
const KANA=/[ぁ-ゖァ-ヺ]/,HAN=/[一-鿿]/;
// Japanese if Shift-JIS reads it with kana; else GBK when that is clean Chinese (a patched Seen.txt).
// Bytes a wrong key leaves behind read as half-width katakana and stray Latin letters: not text.
const JUNK=/[｡-ﾟ�]|[A-Za-z`^~|\\]/;
function text(raw){const d=raw._dbl||raw,a=sj.decode(d);if(KANA.test(a)&&!JUNK.test(a))return sj.decode(raw);const b=gbk.decode(d);if(HAN.test(b)&&!JUNK.test(b)&&!/[ぁ-ゖ]/.test(b))return gbk.decode(raw);return '';}
const score=code=>{let n=0;for(const r of keyRuns(code)){const t=text(r);if(t&&KANA.test(t))n++;else if(JUNK.test(sj.decode(r)))n--;}return n;};
// One scenario's bytecode: the second key named by the archive (REGNAME), else the one that gives the most Japanese.
function bytecode(raw,keyName){const h=header(raw);if(!h||h.at<=0||h.at+h.clen>raw.length||h.dlen<=0||h.dlen>64<<20)return null;const src=raw.subarray(h.at,h.at+h.clen);
 if(!h.xor2)return decompress(src,h.dlen,null);
 /* The key REGNAME names is used as is: a Chinese patch's GBK text has no kana, so scoring it threw every scenario away */
 if(keyName&&KEYS[keyName]){try{return decompress(src,h.dlen,KEYS[keyName]);}catch{return null;}}
 let best=null,top=-1;
 for(const n of Object.keys(KEYS)){let d;try{d=decompress(src,h.dlen,KEYS[n]);}catch{continue;}const s=score(d);if(s>top){top=s;best=d;}}
 return best;}
const tidy=t=>t.replace(/^[\s　]+|[\s　]+$/g,'');
/* The language is decided per scenario: in a Japanese one a line without kana (「４月１５日（火）」, 「声…」) is still
   Shift-JIS, not GBK (it came out as 「係寧侾俆擔」) */
/* Selections (rlvm module_sel.cc, libreallive command.cc SelectElement; RLDev/Kepago docs): a command is
   '#' type module opcode(u16) argc(u16) overload(u8); select_w/select/select_s2/select_s are type 0, module 2,
   opcode 0..3, then an optional '(' window arg ')' and '{' element* '}'. An element is a 0x0a+u16 line marker, a ','
   or a '(' condition ')' group (expressions: '$' 0xff i32, '$' t '[' expr ']', backslash op, nested parens, 0x30.. kind
   bytes) before the option's text, which is raw Shift-JIS up to the next marker. */
function skipGroup(code,p){let depth=0;for(let n=0;n<4000&&p<code.length;n++){const b=code[p];
 if(b===0x28){depth++;p++;}else if(b===0x29){depth--;p++;if(depth===0)return p;}
 else if(b===0x24){p+=code[p+1]===0xff?6:code[p+2]===0x5b?3:2;}else if(b===0x5c)p+=2;else p++;}
 return -1;}
function selects(code){const out=[];
 for(let i=0;i+9<code.length;i++){if(code[i]!==0x23||code[i+1]!==0||code[i+2]!==2||code[i+3]>3||code[i+4]!==0||code[i+6]!==0)continue;
  let p=i+8;if(code[p]===0x28){p=skipGroup(code,p);if(p<0)continue;}
  if(code[p]!==0x7b)continue;p++;const opts=[];let ok=false;
  for(let n=0;n<512&&p<code.length;n++){const b=code[p];
   if(b===0x7d){ok=true;break;}
   if(b===0x0a){p+=3;continue;}if(b===0x2c){p++;continue;}
   if(b===0x28){p=skipGroup(code,p);if(p<0)break;continue;}
   const st=p;while(p<code.length&&p-st<600){if(dblChar(code,p))p+=2;else if(code[p]===0x0a||code[p]===0x7d)break;else p++;}
   if(p-st>=600)break;opts.push(code.subarray(st,p));}
  if(ok&&opts.length){out.push({at:i,opts});i=p;}}
 return out;}
// An option as shown: quotes are not printed (an escaped quote is), then decoded like the scene's other lines.
function optionBytes(raw){const o=[];for(let j=0;j<raw.length;){if(dblChar(raw,j)){o.push(raw[j],raw[j+1]);j+=2;continue;}
 if(raw[j]===0x5c&&raw[j+1]===0x22){o.push(0x22);j+=2;continue;}if(raw[j]!==0x22)o.push(raw[j]);j++;}return Buffer.from(o);}
function parse(buf){const lines=[],starts=[];const code=Buffer.isBuffer(buf)?buf:Buffer.from(buf),list=runs(code);
 let ja=0,zh=0;for(const r of list){if((r._dbl||r).length<=2)continue;const t=text(r);if(!t)continue;if(KANA.test(t))ja++;else zh++;}
 const sjis=r=>JUNK.test(sj.decode(r._dbl||r))?'':sj.decode(r);
 for(const r of list){const t=tidy(ja>zh?sjis(r):text(r));if(t&&(KANA.test(t)||HAN.test(t))){lines.push(t);starts.push(r._at);}}
 const result={lines,anchors:[]},choices=[];
 for(const s of selects(code)){const options=s.opts.map(o=>{const b=optionBytes(o);return tidy(ja>zh?sj.decode(b):(text(b)||sj.decode(b)));}).filter(Boolean);
  if(!options.length)continue;let after=-1;for(let k=0;k<starts.length&&starts[k]<s.at;k++)after=k;choices.push({after,options});}
 if(choices.length)result.choices=choices;
 return result;}
// REGNAME in Gameexe.ini picks the second key (rlvm archive.cc), when the folder has one.
function keyFor(dir){let ini;for(const n of ['Gameexe.ini','GAMEEXE.INI','gameexe.ini']){try{ini=fs.readFileSync(path.join(dir,n));break;}catch{}}if(!ini)return null;
 const m=/#REGNAME\s*=\s*"([^"]*)"/.exec(sj.decode(ini));if(!m)return null;const r=m[1];
 if(/CLANNAD_FV/i.test(r))return 'clannad-full-voice';if(/リトルバスターズ！?ＥＸ|ＥＸ$|EX$/.test(r)&&/リトルバスターズ/.test(r))return 'little-busters-ex';
 if(/リトルバスターズ/.test(r))return 'little-busters';if(/SNOWSE/i.test(r))return 'snow-se';if(/くどわふたー/.test(r))return /全年齢|ALL/i.test(r)?'kud-wafter-all-ages':'kud-wafter';return null;}
function seenFile(dir){let names;try{names=fs.readdirSync(dir);}catch{return null;}const n=names.find(f=>/^seen\.txt$/i.test(f));return n?path.join(dir,n):null;}
function scenesIn(file,keyName){let b;try{b=fs.readFileSync(file);}catch{return [];}
 return index(b).map(e=>({name:'SEEN'+String(e.id).padStart(4,'0'),read:()=>{const d=bytecode(b.subarray(e.offset,e.offset+e.length),keyName);return d||Buffer.alloc(0);}}));}
const engine={
 id:'reallive',hint:'Seen.txt',
 scenes(dir){const f=seenFile(dir);return f?scenesIn(f,keyFor(dir)):[];},
 archives(dir){const f=seenFile(dir);return f?scenesIn(f,keyFor(dir)):[];},
 sources:dir=>{const f=seenFile(dir);return f?[f]:[];},
 parse,test:n=>/^seen\d{4}$/i.test(n),
};
module.exports={engine,parse,decompress,index,header,bytecode,keyFor,KEYS,MASK};
