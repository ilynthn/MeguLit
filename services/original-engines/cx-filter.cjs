// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E449 KiriKiri "cx" archive filter (the per-title xp3 encryption of Steam / DL KiriKiri Z releases: サノバウィッチ,
   千恋＊万花 ...). Ported from GARbro (ArcFormats/KiriKiri/KiriKiriCx.cs, YuzCrypt.cs), Copyright (C) 2014-2018 by
   morkt, MIT licence (see THIRD-PARTY.md):
   Each entry is XOR-ed with keys from a tiny generated program. The program is picked by the low 7 bits of the entry's
   adlr hash and generated from a seed by the title's parameters (mask/offset, prolog/odd/even branch orders and a
   4 KiB control block); it runs on the hash (>>7) and on its complement. Bytes before (hash & mask) + offset use the
   hash itself, later bytes use hash ^ (hash >> 16). Cabbage/Nana schemes swap the random generator, Riddle schemes also
   XOR the first 8 bytes with a key from the hash.
   The parameters of every title GARbro knows are in cx-schemes.json (taken from GARbro's Formats.dat); a game folder
   is matched to a scheme by trying them on one entry and keeping the one whose output is a known file header. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {isRiddlePsb}=require('./psb.cjs');
const OP={NOP:0,RETN:1,MOV_EDI_ARG:2,PUSH_EBX:3,POP_EBX:4,PUSH_ECX:5,POP_ECX:6,MOV_EAX_EBX:7,MOV_EBX_EAX:8,MOV_ECX_EBX:9,MOV_EAX_EDI:11,MOV_EAX_INDIRECT:12,ADD_EAX_EBX:13,SUB_EAX_EBX:14,IMUL_EAX_EBX:15,AND_ECX_0F:16,SHR_EBX_1:17,SHL_EAX_1:18,SHR_EAX_CL:19,SHL_EAX_CL:20,OR_EAX_EBX:21,NOT_EAX:22,NEG_EAX:23,DEC_EAX:24,INC_EAX:25,IMMED:0x100,MOV_EAX_IMMED:0x101,AND_EBX_IMMED:0x102,AND_EAX_IMMED:0x103,XOR_EAX_IMMED:0x104,ADD_EAX_IMMED:0x105,SUB_EAX_IMMED:0x106};
const LIMIT=0x80,M64=0xffffffffffffffffn,M32=0xffffffffn;
function lcg(seed){let s=seed>>>0;return ()=>{const old=s;s=(Math.imul(1103515245,old)+12345)>>>0;return (s^(old<<16)^(old>>>16))>>>0;};}
function nana(seed,random){let s=seed>>>0,r=random>>>0;return ()=>{let x=(s^(s<<17))>>>0;x=(x^((x<<18)|(x>>>15)))>>>0;s=(~x)>>>0;let y=(r^(r<<13))>>>0;y=(y^(y>>>17))>>>0;r=(y^(y<<5))>>>0;return (s^r)>>>0;};}
/* HxCrypt (GARbro HxCrypt.cs, MIT): 64-bit SplitMix64 seeding + 128-bit old/new PRNG for HxProgram. */
function hxRandom(seed,type){
 const s=BigInt(seed>>>0);let st=(s|((~s&M32)<<32n))&M64;
 const next64=()=>{st=(st+0x9e3779b97f4a7c15n)&M64;let z=st;z=(z^(z>>30n))&M64;z=(z*0xbf58476d1ce4e5b9n)&M64;z=(z^(z>>27n))&M64;z=(z*0x94d049bb133111ebn)&M64;return (z^(z>>31n))&M64;};
 let m0=next64(),m1=next64();
 return ()=>{
  const a=m0,b=m1,aLo=a&M32,aHi=a>>32n,bLo=b&M32,bHi=b>>32n;
  if(!type){
   const cLo=aHi^bHi,cHi=aLo^bLo,c=cLo|(cHi<<32n),e=cHi|(cLo<<32n);
   m0=((((cHi<<21n)^(a>>15n))^cHi)&M32)|(((((aHi>>15n)|(aLo<<17n))^(e>>11n))^cLo)&M32)<<32n;
   m1=((c>>4n)&M32)|(((e>>4n)&M32)<<32n);
   const d=(a+b)&M64;return Number(((((d<<17n)&M64)|(d>>47n))+a)&M32);
  }
  const cLo=aLo^bLo,cHi=aHi^bHi,c=cLo|(cHi<<32n);
  m0=(((((aLo<<24n)|(aHi>>8n))^(cLo<<16n))^cLo)&M32)|((((c>>16n)^(a>>8n))^cHi)&M32)<<32n;
  m1=((c>>27n)&M32)|((((cHi>>27n)|(cLo<<5n))&M32)<<32n);
  const d=(5n*a)&M64;return Number(((((d<<7n)&M64)|(d>>57n))*9n)&M32);
 };
}
function generate(scheme,seed){
 /* the generator keeps its state across stages, as GARbro's CxProgram.Clear() keeps m_seed: a seed whose stage-5
    program is too long goes on with the numbers after it (restarting it decoded about half of the entries wrong:
    9-nine- Episode 4 / ATRI voices) */
 const random=scheme.type==='HxCrypt'?hxRandom(seed,scheme.randomType||0):scheme.random==null?lcg(seed):nana(seed,scheme.random);
 for(let stage=5;stage>0;stage--){
  const code=[];let len=0;
  const nop=n=>{if(len+n>LIMIT)return false;len+=n;return true;};
  const emit=(c,n=1)=>{if(len+n>LIMIT)return false;len+=n;code.push(c);return true;};
  const u32=x=>{if(len+4>LIMIT)return false;len+=4;code.push(x>>>0);return true;};
  const prolog=()=>{switch(scheme.prolog[random()%3]){
   case 2:return nop(5)&&emit(OP.MOV_EAX_IMMED,2)&&u32(random()&0x3ff)&&emit(OP.MOV_EAX_INDIRECT,0);
   case 1:return emit(OP.MOV_EAX_EDI,2);
   default:return emit(OP.MOV_EAX_IMMED)&&u32(random());}};
  const even=()=>{switch(scheme.even[random()&7]){
   case 0:return emit(OP.NOT_EAX,2);case 1:return emit(OP.DEC_EAX);case 2:return emit(OP.NEG_EAX,2);case 3:return emit(OP.INC_EAX);
   case 4:return nop(5)&&emit(OP.AND_EAX_IMMED)&&u32(0x3ff)&&emit(OP.MOV_EAX_INDIRECT,3);
   case 5:return emit(OP.PUSH_EBX)&&emit(OP.MOV_EBX_EAX,2)&&emit(OP.AND_EBX_IMMED,2)&&u32(0xaaaaaaaa)&&emit(OP.AND_EAX_IMMED)&&u32(0x55555555)&&emit(OP.SHR_EBX_1,2)&&emit(OP.SHL_EAX_1,2)&&emit(OP.OR_EAX_EBX,2)&&emit(OP.POP_EBX);
   case 6:return emit(OP.XOR_EAX_IMMED)&&u32(random());
   default:return (random()&1?emit(OP.ADD_EAX_IMMED):emit(OP.SUB_EAX_IMMED))&&u32(random());}};
  const odd=()=>{switch(scheme.odd[random()%6]){
   case 0:return emit(OP.PUSH_ECX)&&emit(OP.MOV_ECX_EBX,2)&&emit(OP.AND_ECX_0F,3)&&emit(OP.SHR_EAX_CL,2)&&emit(OP.POP_ECX);
   case 1:return emit(OP.PUSH_ECX)&&emit(OP.MOV_ECX_EBX,2)&&emit(OP.AND_ECX_0F,3)&&emit(OP.SHL_EAX_CL,2)&&emit(OP.POP_ECX);
   case 2:return emit(OP.ADD_EAX_EBX,2);case 3:return emit(OP.NEG_EAX,2)&&emit(OP.ADD_EAX_EBX,2);
   case 4:return emit(OP.IMUL_EAX_EBX,3);default:return emit(OP.SUB_EAX_EBX,2);}};
  const body=n=>{if(n===1)return prolog();if(!emit(OP.PUSH_EBX))return false;if(!(random()&1?body(n-1):body2(n-1)))return false;if(!emit(OP.MOV_EBX_EAX,2))return false;if(!(random()&1?body(n-1):body2(n-1)))return false;return odd()&&emit(OP.POP_EBX);};
  const body2=n=>{if(n===1)return prolog();return (random()&1?body(n-1):body2(n-1))&&even();};
  if(nop(5)&&emit(OP.MOV_EDI_ARG,4)&&body(stage)&&nop(5)&&emit(OP.RETN))return code;
 }
 throw new Error('CX_PROGRAM_TOO_LARGE');
}
function run(code,cb,arg){let eax=0,ebx=0,ecx=0,edi=0;const st=[];
 for(let i=0;i<code.length;i++){const op=code[i];let imm=0;if(op&OP.IMMED)imm=code[++i];
  switch(op){
  case OP.MOV_EDI_ARG:edi=arg;break;case OP.PUSH_EBX:st.push(ebx);break;case OP.POP_EBX:ebx=st.pop();break;
  case OP.PUSH_ECX:st.push(ecx);break;case OP.POP_ECX:ecx=st.pop();break;case OP.MOV_EBX_EAX:ebx=eax;break;
  case OP.MOV_EAX_EDI:eax=edi;break;case OP.MOV_ECX_EBX:ecx=ebx;break;case OP.MOV_EAX_EBX:eax=ebx;break;
  case OP.AND_ECX_0F:ecx&=15;break;case OP.SHR_EBX_1:ebx>>>=1;break;case OP.SHL_EAX_1:eax=(eax<<1)>>>0;break;
  case OP.SHR_EAX_CL:eax>>>=ecx;break;case OP.SHL_EAX_CL:eax=(eax<<ecx)>>>0;break;case OP.OR_EAX_EBX:eax=(eax|ebx)>>>0;break;
  case OP.NOT_EAX:eax=(~eax)>>>0;break;case OP.NEG_EAX:eax=(-eax)>>>0;break;case OP.DEC_EAX:eax=(eax-1)>>>0;break;case OP.INC_EAX:eax=(eax+1)>>>0;break;
  case OP.ADD_EAX_EBX:eax=(eax+ebx)>>>0;break;case OP.SUB_EAX_EBX:eax=(eax-ebx)>>>0;break;case OP.IMUL_EAX_EBX:eax=Math.imul(eax,ebx)>>>0;break;
  case OP.ADD_EAX_IMMED:eax=(eax+imm)>>>0;break;case OP.SUB_EAX_IMMED:eax=(eax-imm)>>>0;break;case OP.AND_EBX_IMMED:ebx=(ebx&imm)>>>0;break;
  case OP.AND_EAX_IMMED:eax=(eax&imm)>>>0;break;case OP.XOR_EAX_IMMED:eax=(eax^imm)>>>0;break;case OP.MOV_EAX_IMMED:eax=imm;break;
  case OP.MOV_EAX_INDIRECT:if(eax>=cb.length)throw new Error('CX_INDEX');eax=(~cb[eax])>>>0;break;
  case OP.RETN:return eax;
  default:break;}}
 throw new Error('CX_NO_RETN');
}
// A scheme ready to decrypt: {mask, offset, prolog, odd, even, cb (Uint32Array 0x400), random?, riddle?}.
function filter(scheme){
 const programs=new Array(0x80);
 const xcode=hash=>{const seed=hash&0x7f;const code=programs[seed]||(programs[seed]=generate(scheme,seed));const h=hash>>>7;return [run(code,scheme.cb,h),run(code,scheme.cb,(~h)>>>0)];};
 const decode=(key,offset,buf,pos,count)=>{const [r1,r2]=xcode(key>>>0);const k1=r2>>>16;let k2=r2&0xffff,k3=r1&255;if(k1===k2)k2+=1;if(!k3)k3=1;
  if(k2>=offset&&k2<offset+count)buf[pos+k2-offset]^=(r1>>>16)&255;
  if(k1>=offset&&k1<offset+count)buf[pos+k1-offset]^=(r1>>>8)&255;
  for(let i=0;i<count;i++)buf[pos+i]^=k3;};
 const riddle=(hash,offset,buf,pos,count)=>{if(offset>=8||count<=0)return;const lo=(hash^0x55555555)>>>0;let hi=((hash<<13)^hash)>>>0;hi=(hi^(hi>>>17))>>>0;hi=(hi^(hi<<5)^0xAAAAAAAA)>>>0;
  let key=(BigInt(hi)<<32n|BigInt(lo))>>BigInt(offset*8);const n=Math.min(count,8-offset);for(let i=0;i<n;i++){buf[pos+i]^=Number(key&255n);key>>=8n;}};
 return function decrypt(hash,offset,buf,pos=0,count=buf.length-pos){hash>>>=0;
  if(scheme.riddle)riddle(hash,offset,buf,pos,count);
  const base=((hash&scheme.mask)>>>0)+scheme.offset;
  if(offset<base){const n=Math.min(base-offset,count);decode(hash,offset,buf,pos,n);offset+=n;pos+=n;count-=n;}
  if(count>0)decode((hash>>>16)^hash,offset,buf,pos,count);
  return buf;};
}
let known=null;
/* E561 schemes an adapter pack adds (params target "cx-scheme") are tried first; a malformed one is left out */
let fileSchemes=null;
function packCx(){try{return require('../adapter-packs.cjs').params('cx-scheme');}catch{return [];}}
const schemeOk=s=>s&&Number.isSafeInteger(s.mask)&&Number.isSafeInteger(s.offset)&&Array.isArray(s.prolog)&&Array.isArray(s.odd)&&Array.isArray(s.even)&&(s.cb===undefined||typeof s.cb==='string'&&s.cb.length<=8192);
function extraFp(list){if(!list.length)return '';try{return crypto.createHash('sha256').update(JSON.stringify(list)).digest('hex');}catch{return String(Date.now())+':'+Math.random();}}
function schemes(){const extra=packCx();if(known&&known.extra===extra)return known;
 if(!fileSchemes){let raw={};try{raw=JSON.parse(fs.readFileSync(path.join(__dirname,'cx-schemes.json'),'utf8'));}catch{}fileSchemes=raw.schemes||[];}
 const valid=extra.map(x=>x?.value).filter(schemeOk);
 known=[...valid,...fileSchemes].map(s=>({...s,cb:s.cb?(b=>new Uint32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length)))(Buffer.from(s.cb,'base64')):null}));
 known.extra=extra;known.fp=extraFp(valid);return known;}
// The control block of a scheme that keeps it in a plug-in (TPM / DLL): " Encryption control block", inverted.
const SIG=Buffer.from(' Encryption control block','latin1');
function controlBlockIn(file){let b;try{b=fs.readFileSync(file);}catch{return null;}let at=b.indexOf(SIG);
 while(at>=0){if(at%4===0&&at+0x1000<=b.length){const cb=new Uint32Array(0x400);for(let i=0;i<0x400;i++)cb[i]=(~b.readUInt32LE(at+i*4))>>>0;return cb;}at=b.indexOf(SIG,at+1);}return null;}
// Does a decrypted head look like a file KiriKiri keeps (script text with BOM, TJS2 bytecode, PSB, image, sound,
// movie)? Only multi-byte magics: a one-byte guess (* ; @) matches random bytes of a wrong scheme.
// 2026-11-19 (千恋＊万花 data.xp3: its first encrypted entries are KiriKiri simple-crypt scripts \xfe\xfe<mode>\xff,
// pre-rendered fonts "TVP pre-rendered font" and OpenType / TrueType fonts; none matched, so the archive got no filter
// and its fonts could not be read): those heads count too.
const HEAD=/^(?:\xff\xfe|\xef\xbb\xbf|TJS2|PSB\x00|mdf\x00|TLG[05]|\x89PNG|OggS|RIFF|AMV\d|\xfe\xfe[\x00-\x02]\xff|TVP |OTTO|\x00\x01\x00\x00|ttcf)/;
const looks=b=>HEAD.test(b.toString('latin1',0,4))||(b.length>=4&&(b[1]^b[3])===0x53&&(b[2]^b[3])===0x42)||isRiddlePsb(b);
const rotl32=(x,n)=>((x<<n)|(x>>>(32-n)))>>>0;
function hxChacha(key1Hex,key2Hex,data){
 const key=Buffer.from(key1Hex,'hex'),nonce=Buffer.from(key2Hex,'hex'),st=Buffer.alloc(64);
 Buffer.from('expand 32-byte k','ascii').copy(st,0);key.copy(st,16,0,16);key.copy(st,32,16,32);
 st.writeUInt32LE(1,48);st.writeUInt32LE(0,52);nonce.copy(st,56,0,8);
 const out=Buffer.allocUnsafe(data.length),s=new Uint32Array(16),z=new Uint32Array(16);
 for(let off=0;off<data.length;off+=64){
  for(let i=0;i<16;i++)s[i]=st.readUInt32LE(i*4);z.set(s);
  for(let i=0;i<10;i++){
   const q=(a,b,c,d)=>{z[a]=(z[a]+z[b])>>>0;z[d]=rotl32(z[d]^z[a],16);z[c]=(z[c]+z[d])>>>0;z[b]=rotl32(z[b]^z[c],12);z[a]=(z[a]+z[b])>>>0;z[d]=rotl32(z[d]^z[a],8);z[c]=(z[c]+z[d])>>>0;z[b]=rotl32(z[b]^z[c],7);};
   q(0,4,8,12);q(1,5,9,13);q(2,6,10,14);q(3,7,11,15);q(0,5,10,15);q(1,6,11,12);q(2,7,8,13);q(3,4,9,14);
  }
  const blk=Buffer.allocUnsafe(64);for(let i=0;i<16;i++)blk.writeUInt32LE((s[i]+z[i])>>>0,i*4);
  const n=Math.min(64,data.length-off);for(let i=0;i<n;i++)out[off+i]=data[off+i]^blk[i];
  for(let k=0;k<8;k++){st[48+k]=(st[48+k]+1)&0xff;if(st[48+k]!==0)break;}
 }
 return out;
}
function hxIndexEntries(buf){
 let p=0;
 const read=()=>{const t=buf[p++];if(t===0||t===1)return null;
  if(t===2){const n=buf.readInt32BE(p);p+=4;const s=buf.toString('utf16le',p,p+n*2);p+=n*2;return s;}
  if(t===3){const n=buf.readInt32BE(p);p+=4;const a=buf.subarray(p,p+n);p+=n;return a;}
  if(t===4||t===5){const v=buf.readBigInt64BE(p);p+=8;return v;}
  if(t===0x81){const n=buf.readInt32BE(p);p+=4;const a=[];for(let i=0;i<n;i++)a.push(read());return a;}
  if(t===0xc1){const n=buf.readInt32BE(p);p+=4;const d={};for(let i=0;i<n;i++){const k=read();d[k]=read();}return d;}
  throw new Error('HX_INDEX_TYPE_'+t);};
 const root=read(),map=new Map();if(!Array.isArray(root))return map;
 for(let i=0;i<root.length;i+=2){const dir=root[i+1];if(!Array.isArray(dir))continue;
  for(let j=0;j<dir.length;j+=2){const info=dir[j+1];if(!Array.isArray(info)||info.length<2)continue;
   const id=info[0],key=info[1];if(typeof id!=='bigint'||typeof key!=='bigint'||id<0n)continue;
   let h=Number(id&M32)>>>0,uname='';for(;;){uname+=String.fromCharCode((h&0x3fff)+0x5000);h>>>=14;if(!h)break;}
   map.set(uname,{id,key});}}
 return map;
}
function hxEntryDecryptor(scheme,id,key,programs=new Array(0x80)){
 const exec=h32=>{const seed=h32&0x7f,code=programs[seed]||(programs[seed]=generate(scheme,seed)),h=h32>>>7;return [run(code,scheme.cb,h),run(code,scheme.cb,(~h)>>>0)];};
 const fk=BigInt('0x'+(scheme.filterKey||'0'));let ek=BigInt(key)&M64;if((BigInt(id)&0x100000000n)===0n)ek^=fk;
 const hkSeed=(~ek)&M64,r0=exec(Number(ek&M32)),r1=exec(Number((ek>>32n)&M32));
 const k0=BigInt(r0[0])|(BigInt(r0[1])<<32n),k1=BigInt(r1[0])|(BigInt(r1[1])<<32n);
 const split=Number((BigInt(scheme.offset)+((ek>>16n)&BigInt(scheme.mask)))&M32);
 const hk=Buffer.alloc(16);let r3=exec(Number(hkSeed&M32)),v5=(~(BigInt(r3[0])|(BigInt(r3[1])<<32n)))&M64;
 for(let i=0,j=56;i<8;i++,j-=8)hk[i]=Number((v5>>BigInt(j))&0xffn);
 r3=exec(Number(v5&M32));v5=(~(BigInt(r3[0])|(BigInt(r3[1])<<32n)))&M64;
 for(let i=0,j=56;i<8;i++,j-=8)hk[i+8]=Number((v5>>BigInt(j))&0xffn);
 const span=(k64,off,buf,pos,cnt)=>{if(cnt<=0)return;
  const fk0=Number(k64&0xffn)||0xa5,d1=Number((k64>>8n)&0xffn),d2=Number((k64>>16n)&0xffn);
  const s0=Number((k64>>48n)&0xffffn);let s1=Number((k64>>32n)&0xffffn);if(s0===s1)s1+=1;
  for(let i=0;i<cnt;i++)buf[pos+i]^=fk0;
  if(d1&&s0>=off&&s0<off+cnt)buf[pos+s0-off]^=d1;
  if(d2&&s1>=off&&s1<off+cnt)buf[pos+s1-off]^=d2;};
 return (offset,buf,pos=0,count=buf.length-pos)=>{
  if(offset<16&&count>0){const n=Math.min(count,16-offset);for(let i=0;i<n;i++)buf[pos+i]^=hk[offset+i];}
  if(offset<split){const n=Math.min(split-offset,count);span(k0,offset,buf,pos,n);offset+=n;pos+=n;count-=n;}
  if(count>0)span(k1,offset,buf,pos,count);
  return buf;};
}
function hxFilter(scheme,hxMap){
 const programs=new Array(0x80);
 return function decrypt(hash,offset,buf,pos=0,count=buf.length-pos,entry=null){
  const info=entry&&hxMap.get(entry.name);if(!info)return buf;
  const dec=info.dec||(info.dec=hxEntryDecryptor(scheme,info.id,info.key,programs));
  return dec(offset,buf,pos,count);};
}
const zlibHead=b=>b.length>=2&&(b[0]&0x0f)===8&&(b[0]>>4)<=7&&(((b[0]<<8)|b[1])%31)===0;
function decodeHxMap(hxRaw,k1,k2){
 if(hxRaw.length<=20)return null;
 const head=hxChacha(k1,k2,hxRaw.subarray(16,Math.min(hxRaw.length,80)));
 if(head.length<6||!zlibHead(head.subarray(4)))return null;
 try{return hxIndexEntries(zlib.inflateSync(hxChacha(k1,k2,hxRaw.subarray(16)).subarray(4)));}catch{return null;}
}
const TEXT_NAME=/\.(ks|tjs|txt|asd|csv|ini)$/i;
const isJpg=b=>b.length>=10&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff&&(b[3]===0xe0&&b.toString('latin1',6,10)==='JFIF'||b[3]===0xe1&&b.toString('latin1',6,10)==='Exif');
const looksHashXor=b=>HEAD.test(b.toString('latin1',0,4))||isJpg(b);
const sjisDec=new TextDecoder('shift_jis'),gbkDec=new TextDecoder('gbk'),utf8Dec=new TextDecoder('utf-8',{fatal:true});
function scoreScript(b){
 if(b.length<16)return 0;
 let lf=0,crlf=0,lfcr=0;
 for(let i=0;i<b.length;i++){const c=b[i];if(c<9||(c>13&&c<32&&c!==27))return 0;if(c===10){lf++;if(i>0&&b[i-1]===13)crlf++;if(i+1<b.length&&b[i+1]===13)lfcr++;}}
 if(!lf||lfcr>crlf)return 0;
 const cut=b.lastIndexOf(10),view=cut>16&&b.length===512?b.subarray(0,cut+1):b;
 if(!/(?:^|\n)\s*(?:\[[A-Za-z_][\w\s=."']*\]|@[A-Za-z_]|;|\/\/|\*[A-Za-z0-9_]+|\b(?:var|function|class|if|return)\b)/m.test(view.toString('latin1')))return 0;
 try{utf8Dec.decode(view);return 8;}catch{}
 for(const dec of [sjisDec,gbkDec]){const t=dec.decode(view);if(!/\ufffd/.test(t)&&(t.match(/[｡-ﾟ]/g)||[]).length<=t.length*.05)return crlf>=lf*.5?8:6;}
 return 0;
}
/* KiriKiri keyless hash filters: the whole key comes from the entry's adlr hash, so they are found by trying them on
   sample entries and keeping the one whose output reads as a known file head or a script, never by title.
   hash^k: KiriKiri 2 simple xp3dec.tpm, each byte XOR (adlr_hash ^ k) & 0xff, k one of 256.
   rot31: 2026-11-20 (#472 #417 #415 #404 #411: kinglove/hutamata/koirowa/koikari.tpm, one 45 KiB plug-in): h = hash &
   0x7fffffff seen as a 31-bit ring, key[i] = low byte of h rotated right by 8*i bits, byte at file offset o XOR key[o % 31]. */
function rot31Key(hash){let h=(hash&0x7fffffff)>>>0;h=(h|(h<<31))>>>0;const k=Buffer.alloc(31);for(let i=0;i<31;i++){k[i]=h&0xff;h=((h>>>8)|(((h&0xfffffffe)<<23)>>>0))>>>0;}return k;}
function rot31(hash,offset,buf,pos=0,count=buf.length-pos){const k=rot31Key(hash>>>0);let o=offset%31;for(let i=0;i<count;i++){buf[pos+i]^=k[o];if(++o===31)o=0;}return buf;}
const hashXor=k=>function decrypt(hash,offset,buf,pos=0,count=buf.length-pos){const x=((hash>>>0)^k)&0xff;for(let i=0;i<count;i++)buf[pos+i]^=x;return buf;};
function keylessCandidates(){const out=[{name:'rot31',dec:rot31}];for(let k=0;k<256;k++)out.push({name:'hash^'+k,dec:hashXor(k)});return out;}
function hashXorFilter(file,xp3,list,plainHits){
 const enc=(list?list.files:[]).filter(e=>e.encrypted&&e.size>=16&&e.size<=(4<<20));
 if(!enc.length)return null;
 const picked=enc.length>24?Array.from({length:24},(_,i)=>enc[Math.floor(i*enc.length/24)]):enc;
 const sample=picked.map(e=>{try{return {e,r:xp3.read(file,e).subarray(0,512)};}catch{return null;}}).filter(Boolean);
 if(!sample.length||plainHits>=Math.max(2,Math.ceil(sample.length/2)))return null;
 const minHits=Math.min(2,sample.length);
 let best=null,bestScore=0;
 for(const c of keylessCandidates()){
  let hits=0,score=0;
  for(const {e,r} of sample){
   const b=c.dec(e.hash>>>0,0,Buffer.from(r));
   if(looksHashXor(b)){hits++;score+=10;}
   else if(TEXT_NAME.test(e.name)){const sc=scoreScript(b);if(sc>0){hits++;score+=sc;}}
  }
  if(hits>=minHits&&hits>plainHits&&score>bestScore){bestScore=score;best=c;}
 }
 if(!best)return null;
 const dec=best.dec;const fn=(hash,offset,buf,pos=0,count=buf.length-pos)=>dec(hash,offset,buf,pos,count);fn.titles=[best.name];return fn;
}
const memo=new Map();
// The filter of one archive: the known scheme that turns most of its encrypted entries into known heads (at least
// two and more than reading them as they are), or null.
function forArchive(file){const id=path.resolve(file).toLowerCase();let st;
 try{st=fs.statSync(file);}catch{memo.delete(id);return null;}
 const all=schemes(),stamp=st.size+':'+st.mtimeMs+':'+all.fp,hit=memo.get(id);
 if(hit&&hit.st===stamp)return hit.v;let best=null;
 try{const xp3=require('./xp3.cjs'),list=xp3.list(file),hxRaw=xp3.hxChunk(file),dir=path.dirname(file);
  const enc=(list?list.files:[]).filter(e=>e.encrypted&&e.size>=16);
  const picked=hxRaw&&enc.length>32?Array.from({length:32},(_,i)=>enc[Math.floor(i*enc.length/32)]):enc.slice(0,hxRaw?32:16);
  const sample=picked.map(e=>{try{return {e,r:xp3.read(file,e).subarray(0,32)};}catch{return null;}}).filter(Boolean);
  const plainHits=sample.filter(s=>looks(s.r)).length;let top=Math.max(1,plainHits);
  const tryScheme=(make,titles)=>{let dec;try{dec=make();}catch{return;}let hits=0;
   for(const {e,r} of sample){const b=Buffer.from(r);try{dec(e.hash,0,b,0,b.length,e);}catch{continue;}if(looks(b))hits++;}
   if(hits>top){top=hits;best=dec;best.titles=titles;}};
  if(hxRaw){
   const idxCache=new Map();
   for(const s of all){if(s.type!=='HxCrypt'||!s.cb||!s.filterKey||!Array.isArray(s.indexKeys))continue;
    let hxMap=null;
    for(const [k1,k2] of s.indexKeys){const ck=k1+':'+k2;if(!idxCache.has(ck))idxCache.set(ck,decodeHxMap(hxRaw,k1,k2));hxMap=idxCache.get(ck);if(hxMap)break;}
    if(hxMap?.size)tryScheme(()=>hxFilter(s,hxMap),s.titles);}
  }else{
   for(const s of all){if(s.type==='HxCrypt')continue;let cb=s.cb;if(!cb&&s.tpm)cb=controlBlockIn(path.join(dir,s.tpm))||controlBlockIn(path.join(dir,'plugin',s.tpm));
    if(cb)tryScheme(()=>filter({...s,cb}),s.titles);}
    if(!best)best=hashXorFilter(file,xp3,list,plainHits);}}catch{best=null;}
 memo.set(id,{st:stamp,v:best});return best;}
module.exports={rot31,rot31Key,filter,generate,run,schemes,controlBlockIn,forArchive,looks,hxChacha,hxEntryDecryptor};
