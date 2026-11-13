// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E642 Luca System (Prototype's PC ports of Key / Visual Arts titles: files\SCRIPT.PAK). Family F4a.
   Format reference (read, not copied): wetor/LuckSystem (MIT) pak/pak.go, script/script.go, game/operator/{LB_EN,SP,util}.go.
     *.PAK   u32 header length, u32 file count, u32 id start, u32 block size, 4 × u32, u32 flags @0x20; the entry table
             starts at the first dword (from 0x20 on) equal to header length / block size (the first entry's offset in
             blocks): count × {u32 offset in blocks, u32 length}. Flag 0x200: names, NUL-separated, from the offset in
             the dword just before the table
     script  a list of code lines until the end: u16 length (with these 4 bytes), u8 opcode, u8 fixed-parameter flag,
             then length - 4 bytes (plus one pad byte when the length is odd). Flag 1 / 2: one / two u16 fixed params
             come first. The opcode numbers differ per title (LuckSystem loads them from a per-game OPCODE list), so the
             reader does not depend on them: MESSAGE is u16 voice id + the text, SELECT u16 × 4 + the text, and the text
             is, by title, a u16 character count + UTF-16LE (SP), a NUL-terminated UTF-8 / Shift-JIS string, or two of
             them (Japanese, then English: LB_EN). A code line whose first string after its leading u16s reads as
             Japanese or Chinese text is a shown line; the first such string is taken, in code order. */
const kit=require('./kit.cjs');

function list(file){const h=kit.head(file,0x400);if(h.length<0x28)return null;const hl=h.readUInt32LE(0),count=h.readUInt32LE(4),bs=h.readUInt32LE(12),flags=h.readUInt32LE(32);
 if(hl<0x28||hl>64<<20||!count||count>200000||!bs||hl%bs)return null;const size=kit.size(file),head=kit.readAt(file,0,hl);if(head.length<hl)return null;
 let p=32;while(p+4<=hl&&head.readUInt32LE(p)!==hl/bs)p+=4;if(p+count*8>hl)return null;
 const out=[];for(let i=0;i<count;i++){const offset=head.readUInt32LE(p+i*8)*bs,len=head.readUInt32LE(p+i*8+4);if(offset+len>size)return null;out.push({name:String(i),offset,size:len});}
 if(flags&0x200){let q=head.readUInt32LE(p-4);for(const e of out){const z=head.indexOf(0,q);if(z<0||z>hl)break;e.name=head.toString('latin1',q,z);q=z+1;}}
 return out;}
function codes(b){const out=[];let p=0;while(p+4<=b.length){const len=b.readUInt16LE(p);if(len<4||p+len>b.length)return null;out.push({op:b[p+2],fixed:b[p+3],raw:b.subarray(p+4,p+len)});p+=(len+1)&~1;}return p>=b.length-1?out:null;}
const TEXTY=/[ぁ-ゖァ-ヺ一-鿿]/,BAD=/[\u0000-\u0008\u000b\u000c\u000e-\u001f�]/;
/* the first string of a code line's parameters, if it is shown text: {bytes, enc} */
/* a byte string that reads as text in UTF-8, Shift-JIS or GBK */
const ok=t=>TEXTY.test(t)&&!BAD.test(t);
const readable=b=>{try{if(ok(new TextDecoder('utf-8',{fatal:true}).decode(b)))return true;}catch{}return ['shift_jis','gbk'].some(e=>ok(new TextDecoder(e).decode(b)));};
/* three passes over the parameter start (after the fixed params and up to four u16s): a u16-counted UTF-16 string that
   ends near the end of the line, then a C string that reads as UTF-8 / Shift-JIS / GBK text, then a NUL-terminated
   UTF-16 string */
function textOf(c){const r=c.raw,skip=c.fixed>=2?4:c.fixed?2:0,last=Math.min(skip+8,r.length-2);
 for(let s=skip;s<=last;s+=2){const L=r.readUInt16LE(s);if(L&&s+2+L*2<=r.length&&r.length-(s+2+L*2)<=12){const t=r.toString('utf16le',s+2,s+2+L*2);if(ok(t))return {text:t};}}
 for(let s=skip;s<=last;s+=2){const z=r.indexOf(0,s),bytes=r.subarray(s,z<0?r.length:z);if(bytes.length>=2&&bytes.some(x=>x>=0x80)&&!bytes.some(x=>x<0x20&&x!==0x0a)&&readable(bytes))return {bytes};}
 /* an ASCII name ("bg01") also reads as two CJK characters in UTF-16: such a string needs kana or a byte above 0x7F */
 for(let s=skip;s<=last;s+=2){let e=s;while(e+1<r.length&&!(r[e]===0&&r[e+1]===0))e+=2;if(e>s){const t=r.toString('utf16le',s,e);if(ok(t)&&(/[ぁ-ゖァ-ヺ]/.test(t)||r.subarray(s,e).some(x=>x>=0x80)))return {text:t};}}
 return null;}
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf),cs=codes(b);if(!cs||!cs.length)return {lines:[],anchors:[]};const found=[];
 for(const c of cs){const t=textOf(c);if(t)found.push(t);}
 let dec=null;const raw=found.filter(x=>x.bytes).map(x=>x.bytes);if(raw.length){try{new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(raw.slice(0,4000)));dec=new TextDecoder('utf-8');}catch{dec=kit.decoder(raw);}}
 const lines=[];for(const x of found){let t=x.text??dec.decode(x.bytes);if(!TEXTY.test(t)||BAD.test(t))continue;t=kit.trimBoth(t.replace(/\$[A-Za-z]/g,''));if(t)lines.push(t);}
 return {lines,anchors:[]};}
const isScriptName=n=>!/^(_?varstr|_?varnum|_?cgmode|_?scrcnt|_?scenario|_?buildver|_?taskscr|_?tips)$/i.test(n);
const engine=kit.engine({id:'luca',hint:'files\\SCRIPT.PAK',
 archives:{name:/^script\.pak$/i,subs:['files',''],list:f=>{const l=list(f);return l&&l.length?l.filter(e=>isScriptName(e.name)):null;}},
 loose:{name:/^[A-Z0-9_]+$/,subs:['files/script']},parse,test:n=>/^[A-Z0-9_]+$/.test(n)});
module.exports={engine,parse,list,codes};
