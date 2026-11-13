// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');
/* E449 FVP (FAVORITE View Point: いろとりどりのセカイ / ヒカリ and the other FAVORITE titles). The whole scenario is
   one <name>.hcb next to the exe: a u32 at 0 is the offset of the system description, the bytecode runs from 4 up to it.
   Text is pushed with opcode 0x0E: one length byte (the NUL included), then the bytes (Shift-JIS). Every push that ends
   in its NUL and reads as Japanese prose is a line; names, file names and commands (ASCII, no kana) are dropped.
   Chinese patches (いろとりどりのヒカリHD: a second, hidden .irohika.hcb next to irohika.hcb) keep the bytecode and
   rewrite each string in place in GBK, padded with NULs to the original length, so the push at the same offset in the
   other file is the translation of each Japanese line (checked on the HD release: same header, same code). */
const fs=require('node:fs'),path=require('node:path');
const sj=kit.SJIS,gbk=new TextDecoder('gbk');
const PROSE=/[ぁ-ゖァ-ヺ]/,HAN=/[一-鿿]/;
const MAGIC=Buffer.from('FVP+ZH\0\0','latin1');
// Each 0x0E push of the code: {at, n} (n counts the NUL).
function pushes(b){const out=[];if(b.length<8)return out;const end=Math.min(b.readUInt32LE(0),b.length);
 for(let i=4;i+2<end;i++){if(b[i]!==0x0E)continue;const n=b[i+1];if(n<3||i+2+n>end||b[i+1+n]!==0)continue;
  const raw=b.subarray(i+2,i+1+n);if(raw.includes(0))continue;out.push({at:i,n});i+=1+n;}
 return out;}
const tidy=s=>s.replace(/\r?\n/g,'\n').replace(/^[\s　]+|[\s　]+$/g,'');
// The translated string at the same place in the patched file (up to its first NUL), or ''.
// A string too long for its place is moved: the push is replaced by a jump (0x06, u32 target) into code the patch
// appends after the original, which pushes the translation and jumps back.
function twin(z,p){if(!z||p.at+6>z.length)return '';let at=p.at;
 if(z[at]===0x06){const to=z.readUInt32LE(at+1);at=-1;for(let i=to;i<Math.min(z.length-2,to+48);i++)if(z[i]===0x0E){const n=z[i+1];if(n>=2&&i+2+n<=z.length&&z[i+1+n]===0){at=i;break;}}if(at<0)return '';}
 else if(z[at]!==0x0E||z[at+1]!==p.n)return '';
 const n=z[at+1],raw=z.subarray(at+2,at+1+n),cut=raw.indexOf(0);
 // What the patched game shows, kana and all (speaker labels it kept, a line left in Japanese): it is the translation.
 const s=tidy(gbk.decode(cut>=0?raw.subarray(0,cut):raw));return s&&!s.includes('�')?s:'';}
/* E449 Chinese patches that leave the .hcb alone and serve the text from a "cnpack" next to it (五彩斑斓的曙光,
   loaded by its chn.dll): u32 count, then records {u32 key, u16 size, bytes}. A record is AES-128-ECB (zero padded);
   the key is picked by bits 16-17 of the record key k: MD5 of String(k) (raw), the first 16 hex digits of that MD5,
   ((k % 97) * (i+1)) & 255, or (byte(k, i&3)^2 * (i+7)) & 255 for i < 16. The text (GBK) follows 4 leading bytes.
   The record key is the address the game hands the patch, byte-swapped: the length byte of a 0x0E push, or the operand
   of the call before one (the push follows within a few bytes). */
// Image and sprite names pushed for the engine ("_エプロン_吹出L", "graph_bs/CHR_あ", one-letter ids), not text.
const ASSET=s=>/^[_A-Za-z0-9]/.test(s)||s.includes('/')||[...s].length===1;
const CN=Buffer.from('FVP+CN\0\0','latin1');
function cnpack(pack,b){const crypto=require('node:crypto'),out=new Map();if(pack.length<4)return out;const cnt=pack.readUInt32LE(0);let p=4;
 const md5=s=>crypto.createHash('md5').update(s).digest();
 const keyOf=k=>{const a=(k&0x30000)>>>16;if(a===0)return md5(String(k));if(a===1)return Buffer.from(md5(String(k)).toString('hex').slice(0,16),'latin1');
  const c=Buffer.alloc(16);for(let i=0;i<16;i++){if(a===2)c[i]=((k%97)*(i+1))&255;else{const q=(k>>>((i&3)*8))&255;c[i]=(q*q*(i+7))&255;}}return c;};
 const swap=v=>(((v&255)<<24)|((v>>>8&255)<<16)|((v>>>16&255)<<8)|(v>>>24))>>>0;
 const end=Math.min(b.readUInt32LE(0),b.length);
 const pushAt=x=>{if(x>=1&&x<end&&b[x-1]===0x0E)return x-1;for(let i=x;i<Math.min(end-2,x+16);i++)if(b[i]===0x0E){const n=b[i+1];if(n>=2&&i+2+n<=end&&b[i+1+n]===0)return i;}return -1;};
 for(let i=0;i<cnt&&p+6<=pack.length;i++){const k=pack.readUInt32LE(p),size=pack.readUInt16LE(p+4),data=pack.subarray(p+6,p+6+size);p+=6+size;
  const at=pushAt(swap(k));if(at<0||out.has(at))continue;
  try{const d=crypto.createDecipheriv('aes-128-ecb',keyOf(k),null);d.setAutoPadding(false);const n=data.length&~15;const plain=Buffer.concat([d.update(data.subarray(0,n)),d.final()]);
   let e=plain.length;while(e>4&&plain[e-1]===0)e--;const cut=plain.indexOf(0,4);const s=tidy(gbk.decode(plain.subarray(4,cut>=4&&cut<e?cut:e)));if(s&&!s.includes('�'))out.set(at,s);}catch{}}
 return out;}
function parse(buf){let b=Buffer.isBuffer(buf)?buf:Buffer.from(buf),z=null,cn=null;
 if(b.subarray(0,8).equals(MAGIC)){const n=b.readUInt32LE(8);z=b.subarray(12+n);b=b.subarray(12,12+n);}
 else if(b.subarray(0,8).equals(CN)){const n=b.readUInt32LE(8);const pack=b.subarray(12+n);b=b.subarray(12,12+n);cn=cnpack(pack,b);}
 const lines=[],zh=[],voices=[];let prevEnd=0;
 for(const p of pushes(b)){const s=tidy(sj.decode(b.subarray(p.at+2,p.at+1+p.n)));const from=prevEnd;prevEnd=p.at+2+p.n;if(!s||!PROSE.test(s)||s.includes('�')||ASSET(s))continue;lines.push(s);zh.push(cn?cn.get(p.at)||'':twin(z,p));voices.push(voiceAt(b,p.at,from));}
 const v=require('./voice-ref.cjs').keep(voices),out=z||cn?{lines,anchors:[],zh}:{lines,anchors:[]};if(v)out.voices=v;return out;}
/* E450 a spoken line's voice: the int the script pushes (0x0A, u32) just before the text, then the voice call's
   argument shuffles (0x08); voice.bin names the clip with that number in nine digits (10024540 -> 010024540). */
/* A number whose low byte is itself 0x0A (20000010 = 0a 2d 31 01) reads "0a 0a 2d 31 01 08": the push is the first 0x0A,
   the second is the number's own byte (いろとりどりのヒカリ: 94 lines were read as 134295853 before). */
/* A 0x0A that is an operand byte is not a push: the address of a call (02 0a0b0200), the operand of a 0x0C
   (0c 0a). */
function operand(b,q,from){if(q-1>=from&&(b[q-1]===0x02||b[q-1]===0x0C))return true;return false;}
function voiceAt(b,at,from){for(let q=at-6;q>=Math.max(from,at-32);q--)if(b[q]===0x0A&&b[q+5]===0x08){while(q-1>=from&&b[q-1]===0x0A&&b[q+4]===0x08)q--;if(operand(b,q,from))continue;const id=b.readUInt32LE(q+1);return id>0&&id<1e9?String(id).padStart(9,'0'):null;}return null;}
// E450 the clips of an FVP .bin archive (voice.bin): u32 count, u32 name bytes, {name offset, offset, size} per entry, names.
function audio(file){if(!/\.bin$/i.test(file))return null;let fd;try{fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size,h=Buffer.alloc(8);fs.readSync(fd,h,0,8,0);const n=h.readUInt32LE(0),ns=h.readUInt32LE(4);if(!n||n>200000||8+n*12+ns>size)return null;
 const t=Buffer.alloc(n*12+ns);fs.readSync(fd,t,0,t.length,8);const out=[];for(let i=0;i<n;i++){const no=t.readUInt32LE(i*12),o=t.readUInt32LE(i*12+4),s=t.readUInt32LE(i*12+8),at=n*12+no,z=t.indexOf(0,at);if(z<0||o+s>size)return null;
  const name=t.toString('latin1',at,z);out.push({name:/\.\w{2,4}$/.test(name)?name:name+'.ogg',read:()=>{const g=fs.openSync(file,'r');try{const d=Buffer.alloc(s);fs.readSync(g,d,0,s,o);return d;}finally{fs.closeSync(g);}}});}
 return out;}catch{return null;}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}}
// The scenario (the .hcb with the most Japanese) and a Chinese twin with the same header, if any.
function files(dir){let names;try{names=fs.readdirSync(dir).filter(f=>/\.hcb$/i.test(f));}catch{return null;}if(!names.length)return null;
 const info=names.map(f=>{const file=path.join(dir,f);let b;try{b=fs.readFileSync(file);}catch{return null;}const ps=pushes(b);
  let jp=0,cn=0;for(const p of ps.slice(0,4000)){const raw=b.subarray(p.at+2,p.at+1+p.n);if(!raw.some(c=>c>=0x80))continue;if(PROSE.test(sj.decode(raw)))jp++;else if(HAN.test(gbk.decode(raw)))cn++;}
  return {file,b,head:b.length>=4?b.readUInt32LE(0):-1,jp,cn};}).filter(Boolean);
 const main=info.filter(x=>x.jp>0).sort((a,b)=>b.jp-a.jp)[0];if(!main)return null;
 const twinFile=info.filter(x=>x!==main&&x.head===main.head&&x.cn>x.jp).sort((a,b)=>b.cn-a.cn)[0];
 const pack=path.join(dir,'cnpack');
 return {main:main.file,zh:twinFile?twinFile.file:null,pack:!twinFile&&fs.existsSync(pack)?pack:null};}
function read(f){const b=fs.readFileSync(f.main),n=Buffer.alloc(4);n.writeUInt32LE(b.length);
 if(f.zh)return Buffer.concat([MAGIC,n,b,fs.readFileSync(f.zh)]);
 if(f.pack)return Buffer.concat([CN,n,b,fs.readFileSync(f.pack)]);
 return b;}
const engine={
 id:'fvp',hint:'<游戏>.hcb',
 scenes(dir){const f=files(dir);return f?[{name:path.basename(f.main),read:()=>read(f)}]:[];},
 archives:()=>[],sources:dir=>{const f=files(dir);return f?[f.main,f.zh,f.pack].filter(Boolean):[];},
 parse,test:n=>/\.hcb$/i.test(n),
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
};
module.exports={parse,engine,pushes,files,audio};
