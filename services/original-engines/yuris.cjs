// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* E329 YU-RIS scenes for zero-latency translation (女装山脈, YU-RIS 0x1C2/0x1C3).
   The scripts are ysbin\yst?????.ybn (YSTB) inside YPF archives: pac/ysbin.ypf, overlaid by update*.ypf next to the
   program in load order. A YSTB has four segments (instructions, arguments, resource strings, line numbers), each XOR
   encrypted with the same 4-byte key; the key is read back from the argument segment, whose bytes are mostly zero.
   The text command (WORD) is the instruction that takes one raw text argument; its argument is the line as drawn.
   Chinese patches made with the rioLoader (萌空 / 罗莊: 女装山脉cn1.1.exe) keep Shift-JIS-looking codes in the script.
   The loader carries a 65536-entry table (code -> code point of its own font) and that font, XOR encrypted with the
   readme next to it; the font's glyphs are SimHei's, so font-unmap gives the real character for each code point. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const fontUnmap=require('./font-unmap.cjs');
const {stat}=require('./file-key.cjs');
const memo=(map,key,make)=>{if(map.has(key))return map.get(key);const v=make();map.set(key,v);if(map.size>64)map.delete(map.keys().next().value);return v;};

// ---- YPF --------------------------------------------------------------------------------------------------------
// The length byte is NOT-ed and then swapped through this table.
const SWAP=[0x03,0x48,0x06,0x35,0x0C,0x10,0x11,0x19,0x1C,0x1E,0x09,0x0B,0x0D,0x13,0x15,0x1B,0x20,0x23,0x26,0x29,0x2C,0x2F,0x2E,0x32];
const swapLen=new Map();for(let i=0;i<SWAP.length;i+=2){swapLen.set(SWAP[i],SWAP[i+1]);swapLen.set(SWAP[i+1],SWAP[i]);}
const sjis=kit.SJIS;
// The whole directory shares one name mask. A numbered scene has a known stem and extension.
function scriptNameMask(raw){
 if(raw.length<8)return;
 const mask=raw.at(-4)^0x2e;
 if(((raw.at(-3)^mask)|32)!==0x79||((raw.at(-2)^mask)|32)!==0x62||((raw.at(-1)^mask)|32)!==0x6e)return;
 if(/^(?:ysbin\\)?yst\d+\.ybn$/i.test(raw.map(c=>c^mask).toString('latin1')))return mask;
}
function hasSceneHeader(read,offset,packed,compressed){
 try{
  const prefix=read(offset,Math.min(packed,compressed?1024:4));
  const data=compressed?zlib.inflateSync(prefix,{finishFlush:zlib.constants.Z_SYNC_FLUSH}):prefix;
  return data.toString('latin1',0,4)==='YSTB';
 }catch{return false;}
}
function ypfIndex(buf,size,wide,swap,read){const count=buf.readUInt32LE(8),files=[];let p=32,nameMask;
 for(let i=0;i<count;i++){if(p+5>buf.length)return null;let len=buf[p+4]^0xff;if(swap)len=swapLen.get(len)??len;p+=5;
  if(!len||p+len+(wide?22:18)>buf.length)return null;const name=buf.subarray(p,p+len);p+=len;
  const compressed=buf[p+1],unpacked=buf.readUInt32LE(p+2),packed=buf.readUInt32LE(p+6),offset=wide?Number(buf.readBigUInt64LE(p+10)):buf.readUInt32LE(p+10);p+=wide?22:18;
  if(offset+packed>size)return null;
  if(nameMask===undefined){
   const mask=scriptNameMask(name);
   if(mask===0xff||(mask!==undefined&&hasSceneHeader(read,offset,packed,compressed)))nameMask=mask;
  }
  files.push({name,compressed,unpacked,packed,offset});}
 for(const entry of files){
  const raw=entry.name.map(c=>c^(nameMask??0xff));
  // Shift-JIS patch names can contain undefined codes. Only control bytes rule out this layout.
  if(raw.some(c=>c<0x20))return null;
  entry.name=sjis.decode(raw);
 }
 return files;}
const ypfMemo=new Map();
function ypfList(file){return memo(ypfMemo,file+'|'+stat(file),()=>{let fd;
 try{fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size,head=Buffer.alloc(32);fs.readSync(fd,head,0,32,0);if(head.toString('latin1',0,4)!=='YPF\0')return null;
  const indexSize=head.readUInt32LE(12),buf=Buffer.alloc(Math.min(size,32+indexSize));fs.readSync(fd,buf,0,buf.length,0);
  const read=(offset,length)=>{const b=Buffer.alloc(length);return b.subarray(0,fs.readSync(fd,b,0,length,offset));};
  for(const wide of [false,true])for(const swap of [true,false]){const files=ypfIndex(buf,size,wide,swap,read);if(files)return files;}
  return null;
 }catch{return null;}finally{if(fd!==undefined)fs.closeSync(fd);}});}
function ypfRead(file,e){const b=kit.readAt(file,e.offset,e.packed);return e.compressed?zlib.inflateSync(b):b;}
const YST=n=>/^yst\d+\.ybn$/i.test(n);
// Scene files of one archive, first copy of each name (a patch archive can hold a name twice; the engine takes the first).
function ypfScenes(file){const files=ypfList(file);if(!files)return [];const seen=new Set(),out=[];
 for(const e of files){const name=e.name.replace(/^.*\\/,'');if(!YST(name)||seen.has(name.toLowerCase()))continue;seen.add(name.toLowerCase());out.push({name,read:()=>ypfRead(file,e)});}
 return out;}

// ---- YSTB -------------------------------------------------------------------------------------------------------
// The key: per byte position, the most common byte of the argument segment (argument records are mostly zero bytes).
/* The lowest byte is the low byte of ids, sizes and offsets, which are seldom zero (euphoria: 57 of 576 scenes guessed
   wrong), so it is the value under which the most records point at the resource bytes right after the previous one. */
function ystbKey(seg,resLen){const key=[0,0,0,0];for(let j=0;j<4;j++){const c=new Uint32Array(256);for(let i=j;i<seg.length;i+=4)c[seg[i]]++;let best=0;for(let v=1;v<256;v++)if(c[v]>c[best])best=v;key[j]=best;}
 if(resLen===undefined)return key;
 const high=(key[3]<<24|key[2]<<16|key[1]<<8)>>>0,score=v=>{const k=(high|v)>>>0;let ok=0,end=-1;
  for(let q=0;q+12<=seg.length;q+=12){const size=(seg.readUInt32LE(q+4)^k)>>>0,off=(seg.readUInt32LE(q+8)^k)>>>0;if(off+size<=resLen&&(!size||end<0||off===end))ok++;if(size)end=off+size;}return ok;};
 // Candidates first: the guess, and the value that puts the first argument at offset 0; all 256 only if neither fits.
 const n=Math.floor(seg.length/12);let best=key[0],top=score(best);
 if(n&&top<n){const v=seg[8],s=score(v);if(s>top){top=s;best=v;}}
 if(top<n*.5)for(let v=0;v<256;v++){const s=score(v);if(s>top){top=s;best=v;}}
 key[0]=best;return key;}
function ystb(buf){
 if(!buf||buf.length<32||buf.toString('latin1',0,4)!=='YSTB')return null;const sizes=[12,16,20,24].map(k=>buf.readUInt32LE(k));
 const total=32+sizes.reduce((a,b)=>a+b,0);
 if(total>buf.length||sizes[0]%4||sizes[1]%12)return null;
 if(sizes[1]===0)return sizes[2]===0&&total===buf.length?[]:null;
 const key=ystbKey(buf.subarray(32+sizes[0],32+sizes[0]+sizes[1]),sizes[2]);let p=32;
 const [code,args,res]=sizes.slice(0,3).map(n=>{const s=Buffer.from(buf.subarray(p,p+n));for(let i=0;i<s.length;i++)s[i]^=key[i&3];p+=n;return s;});
 const insts=[];let a=0;
 for(let i=0;i<code.length;i+=4){const op=code[i],argc=code[i+1],list=[];
  for(let k=0;k<argc;k++,a++){const q=a*12;if(q+12>args.length)return null;const type=args.readUInt16LE(q+2),size=args.readUInt32LE(q+4),off=args.readUInt32LE(q+8);
   list.push({id:args.readUInt16LE(q),type,data:off+size<=res.length?res.subarray(off,off+size):Buffer.alloc(0)});}
  insts.push({op,args:list});}
 return insts;}
// The text command: one argument of type 0 holding raw text (its first byte a double-byte lead), the most frequent such op.
function textOp(insts){const count=new Map();
 for(const x of insts)if(x.args.length===1&&x.args[0].type===0&&x.args[0].data.length&&x.args[0].data[0]>=0x81)count.set(x.op,(count.get(x.op)||0)+1);
 let best=-1,n=0;for(const [op,c] of count)if(c>n){best=op;n=c;}return best;}
// Raw text lines in order, plus the anchors a translation keeps: ASCII string literals of the other commands.
/* E450 a sound command's file name (es.SND "NEM_M03_0390") before a text command is that line's voice; sound effects and
   music (SE_*, BGM_*) are not voices. */
const VOICE_NAME=/^(?!(?:se|bgm?|sys|me)(?:_|\d))(?:[A-Za-z]{2,6}_[A-Za-z0-9]+_\d{3,6}|[A-Za-z]{1,4}\d{3,6})$/i;
function words(buf){const insts=ystb(buf);if(!insts)return {raw:[],anchors:[],voices:[]};const op=textOp(insts),raw=[],anchors=[],voices=[];let pending=null;
 for(const x of insts){if(x.op===op&&x.args.length===1){raw.push(x.args[0].data);voices.push(pending);pending=null;continue;}
  const strs=[];for(const arg of x.args){const s=arg.data.toString('latin1'),re=/"([\x20-\x21\x23-\x7e]*)"/g;let m;while((m=re.exec(s)))if(m[1]){anchors.push(m[1]);strs.push(m[1]);}}
  if(strs.length>1&&/snd|voice|^vo$|koe/i.test(strs[0])&&VOICE_NAME.test(strs[1]))pending=strs[1];}
 return {raw,anchors,voices};}
const parse=buf=>{const w=words(buf),v=require('./voice-ref.cjs').keep(w.voices);return v?{lines:w.raw.map(b=>sjis.decode(b)),anchors:w.anchors,voices:v}:{lines:w.raw.map(b=>sjis.decode(b)),anchors:w.anchors};};

// ---- rioLoader code table + font --------------------------------------------------------------------------------
// UPX (NRV2E, the method rioLoader builds use) unpacking of the program image.
function nrv2e(src,ip,outLen){const dst=Buffer.alloc(outLen+8);let op=0,bb=0,bc=0,last=1;
 const bit=()=>{if(bc>0)return (bb>>>--bc)&1;if(ip+4>src.length)throw Error('UPX_TRUNCATED');bc=31;bb=src.readUInt32LE(ip);ip+=4;return (bb>>>31)&1;};
 for(;;){while(bit()){if(op>=outLen)throw Error('UPX_OVERRUN');dst[op++]=src[ip++];}
  let off=1,len;for(;;){off=off*2+bit();if(bit())break;off=(off-1)*2+bit();}
  if(off===2){off=last;len=bit();}else{off=((off-3)*256+src[ip++])>>>0;if(off===0xffffffff)break;len=(off^0xffffffff)&1;off>>>=1;last=++off;}
  if(len)len=1+bit();else if(bit())len=3+bit();else{len++;do{len=len*2+bit();}while(!bit());len+=3;}
  len+=off>0x500?1:0;if(off>op||op+len+1>outLen+8)throw Error('UPX_BAD');let mp=op-off;dst[op++]=dst[mp++];do{dst[op++]=dst[mp++];}while(--len>0);}
 return dst.subarray(0,op);}
function unpackUpx(exe){const at=exe.indexOf('UPX!',0,'latin1');if(at<0||at>0x1000||exe[at+6]!==8)return null;
 try{const pe=exe.readUInt32LE(0x3c),opt=exe.readUInt16LE(pe+20),sec=pe+24+opt+40;return nrv2e(exe,exe.readUInt32LE(sec+20),exe.readUInt32LE(at+16));}catch{return null;}}
const TABLE_MARK=Buffer.concat([Buffer.alloc(64),Buffer.from(' !"#$%&\'()*+,-./0123456789','utf16le')]);
const ttfHead=b=>b.length>=12&&b.readUInt32BE(0)===0x00010000&&b.readUInt16BE(4)>=8&&b.readUInt16BE(4)<=40;
function fontAt(image,at,keys){const plain=image.subarray(at,at+4096);
 for(const key of [null,...keys]){const h=Buffer.from(plain);if(key)for(let i=0;i<key.length&&i<h.length;i++)h[i]^=key[i];if(!ttfHead(h))continue;
  let end=0;const n=h.readUInt16BE(4);for(let i=0;i<n;i++){const r=12+i*16;end=Math.max(end,h.readUInt32BE(r+8)+h.readUInt32BE(r+12));}
  if(at+end>image.length)continue;const font=Buffer.from(image.subarray(at,at+end));if(key)for(let i=0;i<key.length&&i<font.length;i++)font[i]^=key[i];return font;}
 return null;}
const codecMemo=new Map();
// The loader program in a folder (a smallish exe with the table), as a decoder for the patch's bytes, or null.
function loaderCodec(exeFile){return memo(codecMemo,exeFile+'|'+stat(exeFile),()=>{
 let exe;try{if(fs.statSync(exeFile).size>8<<20)return null;exe=fs.readFileSync(exeFile);}catch{return null;}
 for(const image of [exe,unpackUpx(exe)].filter(Boolean)){const t=image.indexOf(TABLE_MARK);if(t<0||t+64+0x20000>image.length)continue;
  const table=image.subarray(t,t+0x20000),dir=path.dirname(exeFile);let keys=[];
  try{keys=fs.readdirSync(dir).filter(f=>/\.(?:ini|txt)$/i.test(f)).map(f=>path.join(dir,f)).filter(f=>fs.statSync(f).size<1<<20).map(f=>fs.readFileSync(f));}catch{}
  const font=fontAt(image,t+0x20000,keys),map=font&&fontUnmap.unmapping([font],{anyCode:true});if(!map)continue;
  // A code point whose glyph draws nothing is the patch's full-width space.
  let inked=new Set();try{inked=new Set(fontUnmap.glyphHashes(font,0)?.keys()||[]);}catch{}
  const glyph=code=>{const cp=table.readUInt16LE(code*2);if(!cp)return null;const ch=String.fromCharCode(cp);return map.get(ch)??(cp>=0x80&&!inked.has(cp)?'　':ch);};
  return {file:exeFile,decode(b){let out='';
   for(let i=0;i<b.length;i++){const c=b[i];
    if((c>=0x81&&c<=0x9f||c>=0xe0&&c<=0xfc)&&i+1<b.length){out+=glyph(c<<8|b[i+1])??sjis.decode(b.subarray(i,i+2));i++;}
    else out+=glyph(c)??String.fromCharCode(c);}
   return out;}};}
 return null;});}
// ---- Amano pack (euphoria 萌你妹 patch: euphoria_sc.exe + euphoria_sc.dll + euphoria_sc.pack) ---------------------
/* E333 The dll hooks the game's archive reads and serves files by archive path from the pack. Everything is AES-128-CFB.
   Header (0x18): 'FUCK', header size, u64 index offset, u32 index size; key and IV are the two halves of SHA-256 of the
   dll's first section name (".Amano\0\0"), each digest word stored little-endian. Index: 32-byte records sorted by their
   first half. For a file name h = SHA-256(name): the record key is h[0..16] xor h[16..32] (as words); the second half,
   each word xor rol(key word, 13), is u64 offset, u32 size, u32 flags. A file is decrypted with key h[16..32], IV
   h[0..16] (from its offset, fresh for each read); flags bit 0: it starts with a 0x1c header ('SPCM', u32 0, u32 stored,
   u32 packed, u32 0, u32 size, u32 0) and the body after it is NRV2E (UCL) unless stored. The scripts are plain GBK. */
const sha256le=b=>{const d=crypto.createHash('sha256').update(b).digest(),h=Buffer.alloc(32);for(let i=0;i<8;i++)h.writeUInt32LE(d.readUInt32BE(i*4),i*4);return h;};
const cfb=(h,b)=>crypto.createDecipheriv('aes-128-cfb',h.subarray(16,32),h.subarray(0,16)).update(b);
const rol13=x=>((x<<13)|(x>>>19))>>>0;
function sectionName(dll){try{const b=fs.readFileSync(dll);const pe=b.readUInt32LE(0x3c);if(b.readUInt32LE(pe)!==0x4550)return null;return b.subarray(pe+24+b.readUInt16LE(pe+20),pe+32+b.readUInt16LE(pe+20));}catch{return null;}}
const packMemo=new Map();
function amanoPack(file){return memo(packMemo,file+'|'+stat(file),()=>{let fd;
 try{fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size,raw=Buffer.alloc(0x18);if(fs.readSync(fd,raw,0,0x18,0)<0x18)return null;
  const dll=file.replace(/\.pack$/i,'.dll'),names=[sectionName(dll),Buffer.from('.Amano\0\0','latin1')].filter(Boolean);
  for(const name of names){const k=sha256le(name),dk=Buffer.from([...k.subarray(16,32),...k.subarray(0,16)]),head=cfb(dk,raw);
   if(head.toString('latin1',0,4)!=='FUCK'||head.readUInt32LE(4)<0x18)continue;
   const at=Number(head.readBigUInt64LE(8)),len=head.readUInt32LE(16);if(at+len>size||len%32)continue;
   const index=Buffer.alloc(len);fs.readSync(fd,index,0,len,at);const recs=new Map();
   for(let p=0;p<len;p+=32)recs.set(index.toString('hex',p,p+16),index.subarray(p+16,p+32));
   return {file,read(entry){const h=sha256le(Buffer.from(entry,'latin1')),key=Buffer.alloc(16);
    for(let i=0;i<4;i++)key.writeUInt32LE((h.readUInt32LE(i*4)^h.readUInt32LE(16+i*4))>>>0,i*4);
    const rec=recs.get(key.toString('hex'));if(!rec)return null;const w=i=>(rec.readUInt32LE(i*4)^rol13(key.readUInt32LE(i*4)))>>>0;
    const off=w(0)+w(1)*2**32,len=w(2),flags=w(3);if(off+len>size)return null;
    const read=(n,pos)=>{const b=Buffer.alloc(n);const fd2=fs.openSync(file,'r');try{fs.readSync(fd2,b,0,n,pos);}finally{fs.closeSync(fd2);}return b;};
    if(flags&1){const head=cfb(h,read(0x1c,off));
     if(head.toString('latin1',0,4)==='SPCM'){const packed=head.readUInt32LE(12),unpacked=head.readUInt32LE(20);if(off+0x1c+packed>size)return null;
      const body=cfb(h,read(0x1c+packed,off)).subarray(0x1c);return head.readUInt32LE(8)?body:nrv2e(body,0,unpacked);}}
    return cfb(h,read(len,off));}};}
  return null;
 }catch{return null;}finally{if(fd!==undefined)fs.closeSync(fd);}});}
const packsIn=dir=>{try{return fs.readdirSync(dir).filter(f=>/\.pack$/i.test(f)).map(f=>amanoPack(path.join(dir,f))).filter(Boolean);}catch{return [];}};

// ---- MoleBox program (euphoria HD 萌你妹 patch: 乐园_高清版.exe) --------------------------------------------------
/* E334 The patch is one MoleBox-packed program; the Chinese scripts are a YPF among the files it serves to the game.
   1. Loader: the overlay (after the last section) starts with two words whose xor, xor 'MANJ', is 'XOJU'; then a 0x1f0
      header in an 8-byte block cipher (8 rounds of 7 key bytes + 4, all xor through one byte table; CBC, zero IV). The
      key is header+0x170 (16 bytes, left plain), expanded from position 11 modulo 15; the table is a 256-byte
      permutation in the loader's .data, shuffled by drawing with the LCG x*0x19660D+0x3C6EF35F from seed 1.
   2. header+0x20/+0x24: offset and size of the MoleBox core (same cipher; u32 size, then an LZ: 0x80 b = literal,
      0 n = n+1 literals, else u16 w = copy w&15 bytes from w>>4 + 15 back). The core ("STEELBOX") holds the Blowfish
      tables (standard pi values) used next; its words are read little-endian.
   3. Package: the last 8 bytes, Blowfish with MD5 of the MoleBox constant below (first 15 bytes as the key): catalog
      size and checksum. The catalog before them (CBC, zero IV) gives at 0x2a the STELPACK footer offset and at 0x3a the
      package key (MD5 of its password). Footer (0x30, ends 'STELPACK'): u32 catalog offset, u32 catalog size.
   4. Catalog records: 16 zero bytes, 20-byte name hash, u32 0, u32 7, u32 size, u32 chunks, then per chunk u16 packed
      (encrypted chunks padded to 8, stored back to back),
      u16 size, u16 flags (4 = encrypted, 2 = zlib), u16 crc, u32 offset from the data start (the data ends where the
      catalog begins). Names are hashed, so files are told apart by content: a YPF with ysbin\ entries is the scripts. */
const MOLEBOX_KEY='7233DA04FCF24B388408701CB1F874F3';
function peSections(b){const p=b.readUInt32LE(0x3c);if(p+24>b.length||b.readUInt32LE(p)!==0x4550)return null;const n=b.readUInt16LE(p+6),opt=b.readUInt16LE(p+20),out=[];
 for(let i=0;i<n;i++){const s=p+24+opt+i*40;if(s+40>b.length)return null;out.push({name:b.toString('latin1',s,s+8).replace(/\0+$/,''),raw:b.readUInt32LE(s+20),rawSize:b.readUInt32LE(s+16)});}return out;}
function mbSbox(seed){const src=[...seed],out=[];let x=1;while(src.length){x=(Math.imul(x,0x19660d)+0x3c6ef35f)>>>0;out.push(src.splice(x%src.length,1)[0]);}return Buffer.from(out);}
function mbSchedule(key){const out=[];for(let n=11;;){out.push(key[n%15],key[(n+1)%15],key[(n+2)%15]);const b=(n+3)%15;out.push(key[b]);let d=(b+9)%15;if(d===12)return Buffer.from(out);out.push(key[d],key[d+1],key[d+2]);d+=2;n=(d+9)%15;}}
const mbBlock=(S,K)=>B=>{let k=0;for(let r=0;r<8;r++,k+=7){B[7]^=S[K[k+3]^B[3]];B[4]^=S[K[k]^B[0]];B[6]^=S[K[k+2]^B[2]];B[5]^=S[K[k+1]^B[1]];
 B[1]^=S[K[k+4]^B[4]];B[2]^=S[B[5]^B[4]];B[3]^=S[K[k+5]^B[6]];B[0]^=S[K[k+6]^B[7]];}for(let j=0;j<4;j++)B[j+4]^=S[K[k+j]^B[j]];};
function cbc8(buf,block){const iv=Buffer.alloc(8),c=Buffer.alloc(8);for(let p=0;p+8<=buf.length;p+=8){const b=buf.subarray(p,p+8);b.copy(c);block(b);for(let i=0;i<8;i++)b[i]^=iv[i];c.copy(iv);}return buf;}
function mbLz(src,max){const out=Buffer.alloc(max);let o=0,i=0;
 while(i+1<src.length&&o<max){const c=src[i];if(c===0x80){out[o++]=src[i+1];i+=2;}else if(c===0){const n=src[i+1]+1;src.copy(out,o,i+2,i+2+n);o+=n;i+=2+n;}
  else{const w=c|src[i+1]<<8,from=o-(w>>4)-15;if(from<0)break;for(let k=0;k<(w&15);k++)out[o+k]=out[from+k];o+=w&15;i+=2;}}
 return out.subarray(0,Math.min(o,max));}
// Blowfish decryption with little-endian block words.
function blowfish(P0,S0,key){const P=Uint32Array.from(P0),S=Uint32Array.from(S0);
 for(let i=0,j=0;i<18;i++){let d=0;for(let k=0;k<4;k++,j=(j+1)%key.length)d=(d<<8|key[j])>>>0;P[i]=(P[i]^d)>>>0;}
 const F=x=>((((S[x>>>24]+S[256|x>>>16&255])>>>0)^S[512|x>>>8&255])+S[768|x&255])>>>0;
 const enc=(l,r)=>{for(let i=0;i<16;i++){l=(l^P[i])>>>0;[l,r]=[(r^F(l))>>>0,l];}return [(r^P[17])>>>0,(l^P[16])>>>0];};
 let l=0,r=0;for(let i=0;i<18;i+=2){[l,r]=enc(l,r);P[i]=l;P[i+1]=r;}for(let i=0;i<1024;i+=2){[l,r]=enc(l,r);S[i]=l;S[i+1]=r;}
 return b=>{let l=b.readUInt32LE(0),r=b.readUInt32LE(4);for(let i=17;i>1;i--){l=(l^P[i])>>>0;[l,r]=[(r^F(l))>>>0,l];}b.writeUInt32LE((r^P[0])>>>0,0);b.writeUInt32LE((l^P[1])>>>0,4);};}
const isPermutation=b=>{const s=new Uint8Array(256);for(const x of b){if(s[x])return false;s[x]=1;}return true;};
const moleMemo=new Map();
// The MoleBox program's files as {size, read()}, or null when the program is not one.
function moleBox(exeFile){return memo(moleMemo,exeFile+'|'+stat(exeFile),()=>{let fd;
 try{fd=fs.openSync(exeFile,'r');const size=fs.fstatSync(fd).size,read=(n,pos)=>{const b=Buffer.alloc(n);if(fs.readSync(fd,b,0,n,pos)<n)throw Error('SHORT');return b;};
  const secs=peSections(read(Math.min(size,0x1000),0));if(!secs?.length)return null;
  const ov=Math.max(...secs.map(s=>s.raw+s.rawSize));if(ov+0x1f8>size)return null;const mark=read(8,ov);
  if(((mark.readUInt32LE(0)^mark.readUInt32LE(4)^0x4a4e414d)>>>0)!==0x554a4f58)return null;
  const data=secs.find(s=>s.name==='.data');if(!data||data.rawSize>1<<20)return null;const dbuf=read(data.rawSize,data.raw);let seed=null;
  for(let p=0;p+256<=dbuf.length&&!seed;p+=4)if(isPermutation(dbuf.subarray(p,p+256)))seed=dbuf.subarray(p,p+256);if(!seed)return null;
  const hdr=read(0x1f0,ov+8),nd=mbBlock(mbSbox(seed),mbSchedule(hdr.subarray(0x170,0x180)));cbc8(hdr.subarray(0,0x170),nd);cbc8(hdr.subarray(0x180),nd);
  const at=hdr.readUInt32LE(0x20),len=hdr.readUInt32LE(0x24);if(at+len>size||len>16<<20)return null;
  const blob=cbc8(read(len&~7,at),nd),core=mbLz(blob.subarray(4),blob.readUInt32LE(0));if(core.toString('latin1',0,8)!=='STEELBOX')return null;
  const pi=core.indexOf(Buffer.from('886a3f24d308a385','hex'));if(pi<0||pi+72+4096>core.length)return null;
  const P0=[],S0=[];for(let i=0;i<18;i++)P0.push(core.readUInt32LE(pi+i*4));for(let i=0;i<1024;i++)S0.push(core.readUInt32LE(pi+72+i*4));
  const bf=key=>blowfish(P0,S0,key.subarray(0,15)),outer=bf(crypto.createHash('md5').update(MOLEBOX_KEY).digest());
  const tail=read(8,size-8);outer(tail);const catLen=tail.readUInt32LE(0);if(!catLen||catLen>0x10000||catLen%8)return null;
  const cat0=cbc8(read(catLen,size-8-catLen),outer);if(cat0.length<0x4a)return null;
  const inner=bf(cat0.subarray(0x3a,0x4a)),footAt=cat0.readUInt32LE(0x2a);if(footAt+0x30>size)return null;
  const foot=cbc8(read(0x30,footAt),inner);if(foot.toString('latin1',0x28,0x30)!=='STELPACK')return null;
  const catAt=foot.readUInt32LE(0),catSize=foot.readUInt32LE(4);if(catAt+catSize>size||catSize%8)return null;
  const cat=cbc8(read(catSize,catAt),inner),files=[];
  for(let p=0;p+0x34<=cat.length;){const n=cat.readUInt32LE(p+48),len=cat.readUInt32LE(p+44);
   if(cat.readUInt32LE(p+36)===0&&cat.readUInt32LE(p+40)===7&&n&&n<1<<16&&len<=n*0xc000&&len>(n-1)*0xc000&&p+0x34+12*n<=cat.length&&!cat.subarray(p,p+16).some(x=>x)){
    const chunks=[];for(let k=0;k<n;k++){const q=p+0x34+12*k;chunks.push({packed:cat.readUInt16LE(q)||0x10000,flags:cat.readUInt16LE(q+4),off:cat.readUInt32LE(q+8)});}
    files.push({size:len,chunks});p+=0x34+12*n;}else p++;}
  if(!files.length)return null;const base=catAt-Math.max(...files.flatMap(f=>f.chunks.map(c=>c.off+c.packed)));if(base<ov)return null;
  const chunk=(fd2,c)=>{const b=Buffer.alloc((c.packed+7)&~7);fs.readSync(fd2,b,0,b.length,base+c.off);if(c.flags&4)cbc8(b,inner);const d=b.subarray(0,c.packed);return c.flags&2?zlib.inflateSync(d):d;};
  const withFd=f=>{const fd2=fs.openSync(exeFile,'r');try{return f(fd2);}finally{fs.closeSync(fd2);}};
  return files.map(f=>({size:f.size,head:()=>withFd(fd2=>chunk(fd2,f.chunks[0]).subarray(0,16)),read:()=>withFd(fd2=>Buffer.concat(f.chunks.map(c=>chunk(fd2,c))).subarray(0,f.size))}));
 }catch{return null;}finally{if(fd!==undefined)fs.closeSync(fd);}});}
// Scene files of a YPF held in memory, first copy of each name.
function ypfBufferScenes(buf){if(buf.length<32||buf.toString('latin1',0,4)!=='YPF\0')return [];const indexSize=buf.readUInt32LE(12);let files=null;
 const read=(offset,length)=>buf.subarray(offset,offset+length);
 for(const wide of [false,true])for(const swap of [true,false])if(!files)files=ypfIndex(buf.subarray(0,Math.min(buf.length,32+indexSize)),buf.length,wide,swap,read);
 const seen=new Set(),out=[];for(const e of files||[]){const name=e.name.replace(/^.*\\/,'');if(!YST(name)||seen.has(name.toLowerCase()))continue;seen.add(name.toLowerCase());
  const data=buf.subarray(e.offset,e.offset+e.packed);out.push({name,read:()=>e.compressed?zlib.inflateSync(data):data});}
 return out;}
// The scenes inside the MoleBox programs of a folder.
function moleScenes(dir){return exesIn(dir).flatMap(exe=>{const files=moleBox(exe);if(!files)return [];
 return files.filter(f=>f.size>=32&&f.size<256<<20).flatMap(f=>{try{return f.head().toString('latin1',0,4)==='YPF\0'?ypfBufferScenes(f.read()):[];}catch{return [];}});});}
const exesIn=dir=>{try{return fs.readdirSync(dir).filter(f=>/\.exe$/i.test(f)).map(f=>path.join(dir,f));}catch{return [];}};
// The game folder a MeguLit backup folder belongs to (<game>\.megulit-japanese\yuris).
const ownerOf=dir=>/[\\/]\.megulit-japanese[^\\/]*[\\/]/i.test(dir+path.sep)?path.resolve(dir.replace(/[\\/]\.megulit-japanese[^\\/]*(?:[\\/].*)?$/i,'')):null;
function codecFor(dirs){for(const d of [...new Set(dirs.flatMap(d=>[d,ownerOf(d)]).filter(Boolean))])for(const exe of exesIn(d)){const c=loaderCodec(exe);if(c)return c;}return null;}
// Without a loader: Shift-JIS, else GBK, whichever reads with fewer broken characters.
const gbk=new TextDecoder('gbk'),KANA=/[ぁ-ゖァ-ヺ]/g;
/* E577 kit.codepageOf */
function plainCodec(raws){const dec=kit.codepageOf(raws.slice(0,3000))==='gbk'?gbk:sjis;return {decode:b=>dec.decode(b)};}
/* OZMAFIA!! (夜鸮汉化, mai.dll + mai\word.mai): the patch writes Chinese as Shift-JIS, and every character Shift-JIS lacks
   in a borrowed code. word.mai flags (one byte per UTF-16 code unit) the characters the translation uses; mai.dll keeps
   the ones cp932 has at their own code and hands the rest, in code-unit order, the free codes in order (lead 81-9F and
   E0-EF; trail 40-7E, 80-9E, A0-FC), skipping the codes the kept characters use. The same table decodes the scripts. */
let cp932Table=null;
function cp932(){if(cp932Table)return cp932Table;const u2s=new Uint16Array(0x10000).fill(0x3f);
 const put=(k,bytes)=>{const ch=sjis.decode(Buffer.from(bytes));if(ch.length===1&&ch!=='\ufffd'&&u2s[ch.charCodeAt(0)]===0x3f)u2s[ch.charCodeAt(0)]=k;};
 for(let x=0xa1;x<=0xdf;x++)put(x,[x]);
 // Windows picks the IBM extension (FA-FC) over its NEC-selected copy (ED-EE) for the same character.
 const leads=[];for(let h=0x81;h<=0xfc;h++)if((h<0xa0||h>=0xe0)&&h!==0xed&&h!==0xee)leads.push(h);leads.push(0xed,0xee);
 for(const h of leads)for(let l=0x40;l<=0xfc;l++)if(l!==0x7f)put(h<<8|l,[h,l]);
 return cp932Table=u2s;}
function maiCodec(word){if(!word||word.length!==0x10000)return null;const u2s=cp932(),flags=Uint8Array.from(word),free=new Uint8Array(0x10000);
 for(const [a,z] of [[0x81,0xa0],[0xe0,0xf0]])for(let h=a;h<z;h++)for(const [l0,l1] of [[0x40,0x7f],[0x80,0x9f],[0xa0,0xfd]])for(let l=l0;l<l1;l++)free[h<<8|l]=1;
 for(let u=0x80;u<0x10000;u++)if(flags[u]&&u2s[u]!==0x3f){free[u2s[u]]=0;flags[u]=0;}
 const borrowed=new Map();let c=0;for(let u=0x80;u<0x10000;u++)if(flags[u]){while(c<0x10000&&!free[c])c++;if(c>=0x10000)break;borrowed.set(c++,String.fromCharCode(u));}
 if(!borrowed.size)return null;
 return {decode(b){let out='';for(let i=0;i<b.length;i++){const x=b[i];
  if((x>=0x81&&x<=0x9f||x>=0xe0&&x<=0xfc)&&i+1<b.length){const k=x<<8|b[i+1];out+=borrowed.get(k)??sjis.decode(b.subarray(i,i+2));i++;}
  else out+=sjis.decode(b.subarray(i,i+1));}return out;}};}
const maiWord=found=>{const f=found.files?.get('word.mai');if(!f)return null;try{return maiCodec(f.read());}catch{return null;}};

// Longest common subsequence length of two anchor lists.
function inOrder(a,b){let prev=new Uint32Array(b.length+1),cur=new Uint32Array(b.length+1);
 for(let i=1;i<=a.length;i++){for(let j=1;j<=b.length;j++)cur[j]=a[i-1]===b[j-1]?prev[j-1]+1:Math.max(prev[j],cur[j-1]);[prev,cur]=[cur,prev];}
 return prev[b.length];}
// ---- Engine -----------------------------------------------------------------------------------------------------
const UPDATE=n=>/^update\d*\.ypf$/i.test(n);
const updateRank=n=>+(n.match(/(\d+)\.ypf$/i)?.[1]||0);
const ypfsIn=(dir,test)=>{try{return fs.readdirSync(dir).filter(f=>/\.ypf$/i.test(f)&&test(f)).map(f=>path.join(dir,f));}catch{return [];}};
// update*.ypf next to the program and in pac\ (euphoria HD keeps them there), in load order.
const updates=dir=>[...ypfsIn(dir,UPDATE),...ypfsIn(path.join(dir,'pac'),UPDATE)].sort((a,b)=>updateRank(path.basename(a))-updateRank(path.basename(b)));
/* The archive holding the scripts: ysbin.ypf, else any other archive with ysbin\ entries (euphoria: pac\bn.ypf). The
   media archives are listed too (their index is read once and cached), so a large voice archive costs one index read. */
const ysbinOf=dir=>{const named=[path.join(dir,'pac','ysbin.ypf'),path.join(dir,'ysbin.ypf')].find(f=>fs.existsSync(f));if(named)return named;
 return [...ypfsIn(path.join(dir,'pac'),f=>!UPDATE(f)),...ypfsIn(dir,f=>!UPDATE(f))].find(f=>ypfScenes(f).length)||null;};
// Scenes with text only (the system scripts have none), so the first ones read already show the game is readable.
// Conservative trade-off: a parsed script with textOp < 0 that still carries a single non-empty type-0 arg
// (e.g. pure-ASCII dialogue or op=79 'H') is treated as 'unreadable' so an update never drops a readable base scene.
const textMemo=new Map();
function sceneState(file,s){return memo(textMemo,file+'|'+stat(file)+'|'+s.name,()=>{
 try{
  const insts=ystb(s.read());if(!insts)return 'unreadable';
  if(textOp(insts)>=0)return 'text';
  if(insts.some(x=>x.args.length===1&&x.args[0].type===0&&x.args[0].data.length))return 'unreadable';
  return 'empty';
 }catch{return 'unreadable';}
});}
const yuris={
 id:'yuris',hint:'update1.ypf（或 pac\\ysbin.ypf）',
 scenes(dir){const base=ysbinOf(dir);if(!base)return [];const out=new Map();
  for(const file of [base,...updates(dir)])for(const s of ypfScenes(file)){
   const key=s.name.toLowerCase(),st=sceneState(file,s);
   if(st==='text')out.set(key,s);else if(st==='empty')out.delete(key);
  }
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:dir=>updates(dir).reverse().flatMap(ypfScenes),
 sources:dir=>{const base=ysbinOf(dir);return base?[base,...updates(dir)]:[];},
 parse,test:()=>false,
 // The patch: update*.ypf in the patch folders (the latest update first), decoded with the loader's table when there is one.
 // A patched scene counts when it has as many text lines and the same anchors as the running one.
 patchLines(base,found){
  const byName=new Map(),dirs=[...new Set(found.dirs.flatMap(d=>[d,ownerOf(d)]).filter(Boolean))];
  // Amano serves its plain GBK scripts over every archive, so its scenes come first.
  for(const pack of dirs.flatMap(packsIn))for(const scene of base){const key=scene.name.toLowerCase();if(byName.has(key))continue;
   let data=null;try{data=pack.read('ysbin\\'+scene.name);}catch{}if(data)byName.set(key,{name:scene.name,read:()=>data,codec:gbk});}
  // So does a MoleBox program's own file system.
  for(const s of dirs.flatMap(moleScenes))if(!byName.has(s.name.toLowerCase()))byName.set(s.name.toLowerCase(),s);
  /* OZMAFIA!! (夜鸮汉化: Chinese .ybn in mai\ysbin beside the untouched Japanese release) the running game's own archives,
     its official Japanese update1.ypf among them, are never the patch */
  const ownDir=found.running?path.resolve(found.running).toLowerCase():'',own=new Set(found.running?yuris.sources(found.running).map(x=>path.resolve(x).toLowerCase()):[]);
  for(const d of found.dirs)for(const file of updates(d).reverse()){if(own.has(path.resolve(file).toLowerCase()))continue;for(const s of ypfScenes(file))if(!byName.has(s.name.toLowerCase()))byName.set(s.name.toLowerCase(),s);}
  // E449 loose .ybn files a patch carries, also inside an Enigma pack (2030汉化组's 2030.xp), never the running game's own.
  for(const [key,f] of found.files||[]){if(!/\.ybn$/i.test(key)||byName.has(key)||!base.some(s=>s.name.toLowerCase()===key))continue;if(f.path&&ownDir&&path.dirname(path.resolve(f.path)).toLowerCase()===ownDir)continue;byName.set(key,{name:f.name,read:f.read});}
  if(!byName.size)return null;
  const parsed=new Map();for(const scene of base){const s=byName.get(scene.name.toLowerCase());if(!s)continue;try{parsed.set(scene.name.toLowerCase(),{...words(s.read()),codec:s.codec});}catch{}}
  if(!parsed.size)return null;
  const loader=codecFor(found.dirs),defaultCodec=loader||maiWord(found)||plainCodec([...parsed.values()].flatMap(w=>w.raw));let any=false;
  const list=base.map(scene=>{const w=parsed.get(scene.name.toLowerCase());if(!w)return scene;
   if(w.raw.length!==scene.lines.length)return {...scene,skipped:'count'};
   // In order, not by position: a patch may add a few commands of its own (euphoria: extra POSDATA / voice calls).
   if(scene.anchors.length>=5&&(w.anchors.length>scene.anchors.length*1.5||inOrder(scene.anchors,w.anchors)<scene.anchors.length*.9))return {...scene,skipped:'anchors'};
   const codec=(loader&&w.codec)||defaultCodec;
   any=true;return {...scene,patched:true,lines:w.raw.map(b=>codec.decode(b))};});
  return any?list:null;
 },
 _internal:{maiCodec,ypfList,ypfRead,ypfScenes,ystb,words,loaderCodec,codecFor,unpackUpx,amanoPack,moleBox},
};
// E450 the voice clips of a YPF archive (vo.ypf), for game-voice.cjs.
yuris.audio=file=>{if(!/\.ypf$/i.test(file))return null;const l=ypfList(file);return l?l.filter(e=>/\.(?:ogg|wav)$/i.test(e.name)).map(e=>({name:e.name,read:()=>ypfRead(file,e)})):null;};
module.exports=yuris;
