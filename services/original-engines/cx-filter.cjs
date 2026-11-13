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
const fs=require('node:fs'),path=require('node:path');
const OP={NOP:0,RETN:1,MOV_EDI_ARG:2,PUSH_EBX:3,POP_EBX:4,PUSH_ECX:5,POP_ECX:6,MOV_EAX_EBX:7,MOV_EBX_EAX:8,MOV_ECX_EBX:9,MOV_EAX_EDI:11,MOV_EAX_INDIRECT:12,ADD_EAX_EBX:13,SUB_EAX_EBX:14,IMUL_EAX_EBX:15,AND_ECX_0F:16,SHR_EBX_1:17,SHL_EAX_1:18,SHR_EAX_CL:19,SHL_EAX_CL:20,OR_EAX_EBX:21,NOT_EAX:22,NEG_EAX:23,DEC_EAX:24,INC_EAX:25,IMMED:0x100,MOV_EAX_IMMED:0x101,AND_EBX_IMMED:0x102,AND_EAX_IMMED:0x103,XOR_EAX_IMMED:0x104,ADD_EAX_IMMED:0x105,SUB_EAX_IMMED:0x106};
const LIMIT=0x80;
function lcg(seed){let s=seed>>>0;return ()=>{const old=s;s=(Math.imul(1103515245,old)+12345)>>>0;return (s^(old<<16)^(old>>>16))>>>0;};}
function nana(seed,random){let s=seed>>>0,r=random>>>0;return ()=>{let x=(s^(s<<17))>>>0;x=(x^((x<<18)|(x>>>15)))>>>0;s=(~x)>>>0;let y=(r^(r<<13))>>>0;y=(y^(y>>>17))>>>0;r=(y^(y<<5))>>>0;return (s^r)>>>0;};}
function generate(scheme,seed){
 /* the generator keeps its state across stages, as GARbro's CxProgram.Clear() keeps m_seed: a seed whose stage-5
    program is too long goes on with the numbers after it (restarting it decoded about half of the entries wrong:
    9-nine- Episode 4 / ATRI voices) */
 const random=scheme.random==null?lcg(seed):nana(seed,scheme.random);
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
function schemes(){const extra=packCx();if(known&&known.extra===extra)return known;
 if(!fileSchemes){let raw={};try{raw=JSON.parse(fs.readFileSync(path.join(__dirname,'cx-schemes.json'),'utf8'));}catch{}fileSchemes=raw.schemes||[];}
 const ok=s=>s&&Number.isSafeInteger(s.mask)&&Number.isSafeInteger(s.offset)&&Array.isArray(s.prolog)&&Array.isArray(s.odd)&&Array.isArray(s.even)&&(s.cb===undefined||typeof s.cb==='string'&&s.cb.length<=8192);
 known=[...extra.map(x=>x.value).filter(ok),...fileSchemes].map(s=>({...s,cb:s.cb?(b=>new Uint32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length)))(Buffer.from(s.cb,'base64')):null}));known.extra=extra;return known;}
// The control block of a scheme that keeps it in a plug-in (TPM / DLL): " Encryption control block", inverted.
const SIG=Buffer.from(' Encryption control block','latin1');
function controlBlockIn(file){let b;try{b=fs.readFileSync(file);}catch{return null;}let at=b.indexOf(SIG);
 while(at>=0){if(at%4===0&&at+0x1000<=b.length){const cb=new Uint32Array(0x400);for(let i=0;i<0x400;i++)cb[i]=(~b.readUInt32LE(at+i*4))>>>0;return cb;}at=b.indexOf(SIG,at+1);}return null;}
// Does a decrypted head look like a file KiriKiri keeps (script text with BOM, TJS2 bytecode, PSB, image, sound,
// movie)? Only multi-byte magics: a one-byte guess (* ; @) matches random bytes of a wrong scheme.
const HEAD=/^(?:\xff\xfe|\xef\xbb\xbf|TJS2|PSB\x00|mdf\x00|TLG[05]|\x89PNG|OggS|RIFF|AMV\d)/;
const looks=b=>HEAD.test(b.toString('latin1',0,4))||(b.length>=4&&(b[1]^b[3])===0x53&&(b[2]^b[3])===0x42);
const memo=new Map();
// The filter of one archive: the known scheme that turns most of its encrypted entries into known heads (at least
// two and more than reading them as they are), or null.
function forArchive(file){let key;try{const st=fs.statSync(file);key=path.resolve(file).toLowerCase()+'|'+st.size+'|'+st.mtimeMs+'|'+schemes().length;}catch{return null;}
 if(memo.has(key))return memo.get(key);let best=null;
 try{const xp3=require('./xp3.cjs'),list=xp3.list(file);const sample=(list?list.files:[]).filter(e=>e.encrypted&&e.size>=16).slice(0,16).map(e=>{try{return {e,r:xp3.read(file,e).subarray(0,32)};}catch{return null;}}).filter(Boolean);
  const plainHits=sample.filter(s=>looks(s.r)).length;let top=Math.max(1,plainHits);const dir=path.dirname(file);
  for(const s of schemes()){let cb=s.cb;if(!cb&&s.tpm)cb=controlBlockIn(path.join(dir,s.tpm))||controlBlockIn(path.join(dir,'plugin',s.tpm));if(!cb)continue;
   let dec;try{dec=filter({...s,cb});}catch{continue;}let hits=0;
   for(const {e,r} of sample){const b=Buffer.from(r);try{dec(e.hash,0,b);}catch{continue;}if(looks(b))hits++;}
   if(hits>top){top=hits;best=dec;best.titles=s.titles;}}}catch{best=null;}
 memo.set(key,best);return best;}
module.exports={filter,generate,run,schemes,controlBlockIn,forArchive,looks};
