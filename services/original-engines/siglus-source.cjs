// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* E450 SiglusEngine Scene.pck original sources (the .ss scripts a release keeps after its compiled scenes), as in
   siglus-ssu (Jirehlov, Unlicense OR 0BSD; pck.py source_angou_decrypt, native_ops.py): after the scene data comes an
   "OS" section, a size table and one chunk per source file. A chunk is XOR-ed with last_code; it holds a version, a
   64-byte code (its MD5-like digest and sizes), the UTF-16 name (XOR name_code), then the LZSS stream split into two
   halves and scrambled tile by tile under a mask built from the code; unscrambled it is XOR easy_code, then LZSS.
   No key from the game's exe is needed for these. The sources name each voice before its line:
   @KOE(000100000,008) then @mes(16000020,【美佐枝】,「おのれはっ…」), so a voice number goes with the line's text. */
const fs=require('node:fs'),path=require('node:path');
const H=s=>Buffer.from(s,'hex');
const SA={
 easy:H('a9190f282d1b52395c36229f91736a35676a6f74ec7a6f26740edb274ca5f10e2d70c4405d4fda9ec5497bbde8dfeecaf492dee47610dd2a52dc734e548c303d9ab29bb8932955fa7ac9da1097e5b62302dd384c2cc42d7f9b1f9ad549e9348956a79614be2ec5b17ed1b5e7e6d5f506d6babff3453ff161dd4c3e085f47a9df889fd4cc691f309fe7cd8045f3e72a1d16b2f154c86c2b0dd465f7e336d4a53bd1794c54f02ab4b256452eab7b88c5fa74ad03b89ed5f56fdcfa4422aad829b9163d1a76d0879b2d0c7bd1e1ada9190f282d1b52395c36229f4931f68332ffc2b1e9e1983d6f310dacb108839d0d10d141f900ba1acf1371e486212f2365c345'),easyIndex:173,
 mask:H('6a35b17ed1b5e7e6d5a9190f282df4c392489deadd312ce9e21091734c3e085f47a9df889fd4cc691f309fe7cd8045f3e72a1d16b2f16a35676a6f74ec7a6f267492dee47610dd2a52dc734e548c303d9ab29bb8932955fa7ac9da1097e5b62302dd384c2cc42d395c36229f9173f506d6babff3453ff161dd4c7f9b1f9ad549e9348956a79614be2ec53e085f47a9df889fd4cc691f309fe7cd8045f3e72a1d16b2f154c86c2b0dd465f7e336d4a53bd1794c54f02ab4b256452ecaf492dee47610dd2a52dc734e548c303d9ab29bb8932955fa7ac9da1097ab2365c345a0c392489deadd312ce9e2107b88c5fa74ad03b89ed5f56fdcfa444931f68332ffc2'),maskIndex:96,
 maskWi:20,maskWsur:16,maskWadd:16,maskHi:32,maskHsur:16,maskHadd:16,maskMd5:11,
 last:H('0edb274ca5f10e2d70c4405d4fdaa0c392489deadd312ce9e21022aad829b9163d1a76d0879b2d0c7bd1e1ad9ec5497bbde8dfeecaf492dee47610dd2a52dc734e548c303d9ab29bb8932955fa7ac9da1097e5b62302dd384c2cc42d7f9b1f9ad549e9348956a79614be2ec5b17ed1b5e7e6d5f506d6babff3453ff161dd54c82eab7b88c5fa74ad03b89ed5f56f6c2b0dd465f7e336d4a53bd1794c54f02ab4b25645dcfa444931f68332ffc2b1e9e1983d6f310dacb108839d0d10d141f900ba1acf1371e486212f2365c345a01b52676a6f74ec7a6f26740edb274ca5f10e2d70c4405d4fda9ec5497bbde8dfd829b9163d1a76d0879b2d0c7bd1e1adeeca'),lastIndex:13,
 name:H('282d9173f506d6babff3453ff161b1e9e1983d6f310dacb108839d0d10d141f900ba1acf1371e486212f22aadd4c7f9b1f9ad549e9348956a7961b52676a6f74cd8045f3e72a1d16b2f154c86c2b0dd465f7e336d4a53bd1794c54f02ab4b256452eab2365c345a0c392489deadd312ce9e2107b88c5fa74ad03b89ed5f56fdcfa444931f68332ffc2b1e9e1983d6f310dacb108839d0d10d141f900ba1acf1371e486212f22aa6a35b17ed1b5e7ec7a6f26740edb274ca5f10e2d70c4405d4fda9ec5497bbde8dfd829b9163d1ababfdfd829b9163d1a76d0879b2d0c7bd1e1adeecaf492dee47610dd2a52dc734e548c303d9ab29bb8932955fa7ac9da1097'),nameIndex:59,
 mapWi:36,mapWsur:32,mapWadd:32,repx:111,repy:37,limit:128,header:72,
};
const xor=(b,code,st=0)=>{const n=code.length;for(let i=0;i<b.length;i++)b[i]^=code[(st+i)%n];return b;};
const u32=(b,o)=>o+4<=b.length?b.readUInt32LE(o):0;
/* E577 kit.lzDistance (references measured back from the output) */
function lzss(src){if(src.length<8)throw Error('SIGLUS_LZSS');try{return kit.lzDistance(src,src.readUInt32LE(4),{at:8,strict:true});}catch{throw Error('SIGLUS_LZSS');}}
const S=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
const K=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*2**32)>>>0);
// The engine's MD5 variant: standard rounds, its own tail padding.
function smd5(data){const total=data.length,alpha=(total+1)&63,addCnt=alpha<=56?1+(56-alpha)+8:1+(56+(64-alpha))+8,add=Buffer.alloc(73);add[0]=0x80;add.writeUInt32LE((total*8)>>>0,addCnt-8);
 let st=[0x67452301,0xefcdab89,0x98badcfe,0x10325476],left=total,off=0,cnt=total;
 for(;;){let blk;if(left>=64){blk=data.subarray(off,off+64);off+=64;left-=64;cnt-=64;}else if(left>0){blk=Buffer.alloc(64);data.copy(blk,0,off,off+left);add.copy(blk,left,0,64-left);left=0;cnt=0;}else blk=add.subarray(0,64);
  const X=[];for(let i=0;i<16;i++)X.push(blk.readUInt32LE(i*4));let [a,b,c,d]=st;
  for(let i=0;i<64;i++){let f,g;if(i<16){f=(b&c)|(~b&d);g=i;}else if(i<32){f=(b&d)|(c&~d);g=(5*i+1)%16;}else if(i<48){f=b^c^d;g=(3*i+5)%16;}else{f=c^(b|~d);g=(7*i)%16;}
   const tmp=(a+(f>>>0)+K[i]+X[g])>>>0;a=d;d=c;c=b;b=(b+(((tmp<<S[i])|(tmp>>>(32-S[i])))>>>0))>>>0;}
  st=[(st[0]+a)>>>0,(st[1]+b)>>>0,(st[2]+c)>>>0,(st[3]+d)>>>0];if(cnt===0)break;}
 const out=Buffer.alloc(16);st.forEach((v,i)=>out.writeUInt32LE(v,i*4));return out;}
function tileCopy(d,s,bx,by,t,tx,ty,repx,repy,rev,lim){if(!d.length||!s.length||tx<=0||ty<=0)return;
 const x0=repx<=0?((-repx)%tx+tx)%tx:(tx-(repx%tx))%tx,y0=repy<=0?((-repy)%ty+ty)%ty:(ty-(repy%ty))%ty,pixels=Math.floor(Math.min(d.length,s.length)/4);
 for(let y=0;y<by;y++){const row=y*bx,width=Math.min(bx,pixels-row);if(width<=0)break;const mr=((y0+y)%ty)*tx;
  for(let x=0;x<width;x++){const mi=mr+((x0+x)%tx);if(mi>=t.length)continue;const v=t[mi];if(rev?v<lim:v>=lim){const i=(row+x)*4;s.copy(d,i,i,i+4);}}}}
// One OS chunk -> {name, raw}.
function chunk(enc){const hs=SA.header;if(enc.length<hs+4)throw Error('SIGLUS_OS');const dec=xor(Buffer.from(enc),SA.last,SA.lastIndex);
 if(dec.readUInt32LE(0)!==1)throw Error('SIGLUS_OS_VERSION');const code=dec.subarray(4,hs),nl=dec.readUInt32LE(hs);let p=hs+4;if(!nl||nl%2||nl>enc.length-p)throw Error('SIGLUS_OS_NAME');
 const name=xor(Buffer.from(dec.subarray(p,p+nl)),SA.name,SA.nameIndex).toString('utf16le');p+=nl;const lzsz=u32(code,64);
 const mw=(u32(code,SA.maskWi)%SA.maskWsur)+SA.maskWadd,mh=(u32(code,SA.maskHi)%SA.maskHsur)+SA.maskHadd,mask=Buffer.alloc(mw*mh);
 let ind=SA.maskIndex,mi=SA.maskMd5;for(let i=0;i<mask.length;i++){mask[i]=SA.mask[ind%SA.mask.length]^code[(mi%16)*4];ind++;mi=(mi+1)%16;}
 const mapw=(u32(code,SA.mapWi)%SA.mapWsur)+SA.mapWadd,bh=Math.floor((lzsz+1)/2),dh=Math.floor((bh+3)/4),maph=Math.floor((dh+mapw-1)/mapw),mapt=mapw*maph*4;
 if(mapt*2!==enc.length-p)throw Error('SIGLUS_OS_SIZE');
 const dp1=dec.subarray(p,p+mapt),dp2=dec.subarray(p+mapt,p+mapt*2),lzb=Buffer.alloc(mapt*2),sp1=lzb.subarray(0,mapt),sp2=lzb.subarray(bh,bh+mapt);
 tileCopy(sp1,dp1,mapw,maph,mask,mw,mh,SA.repx,SA.repy,0,SA.limit);tileCopy(sp1,dp2,mapw,maph,mask,mw,mh,SA.repx,SA.repy,1,SA.limit);
 tileCopy(sp2,dp2,mapw,maph,mask,mw,mh,SA.repx,SA.repy,0,SA.limit);tileCopy(sp2,dp1,mapw,maph,mask,mw,mh,SA.repx,SA.repy,1,SA.limit);
 let packed=Buffer.from(lzb.subarray(0,lzsz));if(!smd5(packed).equals(code.subarray(0,16))){packed=Buffer.concat([dp1.subarray(0,bh),dp2.subarray(0,lzsz-bh)]);if(!smd5(packed).equals(code.subarray(0,16)))throw Error('SIGLUS_OS_CHECKSUM');}
 return {name,raw:lzss(xor(Buffer.from(packed),SA.easy,SA.easyIndex))};}
// Every original source in a Scene.pck: [{name, raw}] (empty when the release has none).
function sources(file){const b=fs.readFileSync(file);if(b.length<96)return [];const hs=b.readUInt32LE(0);if(hs<92||hs>b.length)return [];const v=i=>b.readUInt32LE(i*4);
 const idxOfs=v(17),idxCnt=v(18),base=v(19),osh=v(22);if(!osh||idxOfs+idxCnt*8>b.length)return [];let end=0;for(let i=0;i<idxCnt;i++){const a=b.readInt32LE(idxOfs+i*8),s=b.readInt32LE(idxOfs+i*8+4);end=Math.max(end,a+s);}
 let pos=base+end;if(pos+osh>b.length)return [];const sizes=chunk(b.subarray(pos,pos+osh)).raw;pos+=osh;const out=[];
 for(let i=0;i+4<=sizes.length;i+=4){const sz=sizes.readUInt32LE(i);if(!sz||pos+sz>b.length)break;try{out.push(chunk(b.subarray(pos,pos+sz)));}catch{}pos+=sz;}
 return out;}
const decode=raw=>{if(raw[0]===0xff&&raw[1]===0xfe)return raw.toString('utf16le',2);if(raw[0]===0xef&&raw[1]===0xbb)return raw.toString('utf8',3);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{return kit.SJIS.decode(raw);}};
/* Lines with their voice from source text: a KOE / koe / exkoe call sets the voice of the next message
   (@mes(id,name,text), or a plain 「…」 line). Comment lines (;) are skipped. */
// The text argument of @mes(id,name,text) anywhere on a line (other tags may wrap it: @SIZE(20)@mes(...)@SIZE@RET).
// E461 Summer Pockets writes the speaker before the call: 【しろは】@mes(id,「…」), two arguments, the text second.
function mesText(t){const at=t.search(/@mes\s*\(/i);if(at<0)return null;let i=t.indexOf('(',at)+1,depth=1,commas=0,first=-1,start=-1;
 for(;i<t.length;i++){const c=t[i];if(c==='(')depth++;else if(c===')'){if(--depth===0)break;}else if(c===','&&depth===1&&commas<2){commas++;if(commas===1)first=i+1;if(commas===2)start=i+1;}}
 return start>0?t.slice(start,i).trim():first>0?t.slice(first,i).trim():null;}
/* Every voice call since the last message goes with the next one: if/else branches give one line two voices
   (@KOE(…060) in one branch, @KOE(…080) in the other, one shared @mes after). */
// E461 a /* … */ block is a comment (Summer Pockets keeps staff notes with 「…」 lines in them): no line, no voice.
function voiced(text){const out=[];let pending=[];
 for(const raw of String(text).replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,'')).split(/\r?\n/)){const t=raw.replace(/\/\/.*$/,'').trim();if(!t||t[0]===';')continue;
  for(const k of t.matchAll(/(?:^|[^\w])(?:ex)?koe\s*\(\s*0*(\d+)/gi))pending.push(Number(k[1]));
  const m=mesText(t)??(/^[「『（]/.test(t)?t:null);
  if(m){if(pending.length)for(const koe of pending)out.push({text:m,koe});else out.push({text:m,koe:null});pending=[];}}
 return out;}
// The release's scene package: Scene.pck first (the original), else another Scene*.pck.
function scenePck(dir){let names=[];try{names=fs.readdirSync(dir).filter(n=>/^scene.*\.pck$/i.test(n));}catch{}names.sort((a,b)=>(/^scene\.pck$/i.test(b)?1:0)-(/^scene\.pck$/i.test(a)?1:0));return names.length?path.join(dir,names[0]):null;}
// Lines with a voice number in a game folder: [{text, ref:'koe:<n>'}].
function voiceLines(dir){const f=scenePck(dir);if(!f)return [];let list=[];try{list=sources(f);}catch{return [];}
 return list.filter(s=>/\.ss$/i.test(s.name)).flatMap(s=>voiced(decode(s.raw))).filter(x=>x.koe!==null).map(x=>({text:x.text,ref:'koe:'+x.koe}));}
module.exports={sources,voiced,voiceLines,scenePck,_internal:{smd5,lzss,tileCopy,chunk}};
