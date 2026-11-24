// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* rUGP (âge / relic Unified Game Platform) script archive reader.
   Format references:
   - Container, ciphers, packed class names, offset/size decoding, and TOC parsing follow
     GARbro ArcFormats/rUGP/ArcRIO.cs (morkt / crskycode fork, MIT licence; see THIRD-PARTY.md).
   - osmium76/rugptools (README.md / RugpObject.cs, no licence) consulted only for object field
     layout and the TOC 0x0200 (fNoChildren) flag semantics; no code taken.
   - CRsa / CVmMsg3 bytecode slot pairing, CVmRet UTF-16LE pool bounds, OM_AddSelecter choices,
     and language discrimination were reverse-engineered directly from Steam Muv-Luv binaries and
     implemented independently for MeguLit's engine reader contract. */
const fs=require('node:fs'),path=require('node:path');
const kit=require('./kit.cjs');
const {stat}=require('./file-key.cjs');

const ICI_HEADER_SIG=0x673ce92a,RAW_RIO_SIG=0x596e32cd,ENC_TOC_SIG=0x1edb927c;
const ICI_STREAM_SEED=0xb29d5a0c,DATA_STREAM_SEED=0x7e6b8ce2;
const LEN_MASK_A=0xc92e568b,LEN_MASK_B=0xc92e568f,PRNG_STEP=0xa3b376c9;
const OFF_BIAS=0xa2fb6ad1,SZ_BIAS=0xe7b5d9f8;
const HAN=/[一-鿿]/,ASCII_WORD=/[A-Za-z]{2,}/;

// Huffman-like packed ASCII tables used by rUGP serialized class headers.
const CLS_COMMON='eaitrosducmnSglR';
const CLS_UPPER='\x01COFLfBMxphyAVbI';
const CLS_EXT='EHTDPWXkqvNjwGz02U_K15JQZ467839\x00';

const POOL_START=Buffer.from('6aea81f9ffffffff00000000','hex');
const FIRST_MSG3=Buffer.from('ffff1500056ada317dff','hex');
const CHOICE_FN=Buffer.from('OM_AddSelecter','latin1');

function decryptBlock(src,offset,seed){
 if(offset+8>src.length)throw Error('RUGP_TRUNCATED_HEADER');
 const expected=(~(src.readUInt32LE(offset)^LEN_MASK_A))>>>0;
 const check=((src.readUInt32LE(offset+4)^LEN_MASK_B)>>>3)>>>0;
 if(expected!==check||expected>(64<<20))throw Error('RUGP_BAD_LENGTH');
 const out=Buffer.allocUnsafe(expected);
 let inAt=offset+8,outAt=0;
 while(outAt<expected){
  const span=Math.min(32,expected-outAt);
  if(inAt+span>src.length)throw Error('RUGP_TRUNCATED_BLOCK');
  let weightedSum=0;
  for(let k=0;k<span;k++){
   const plain=(src[inAt+k]^(seed&0xff))&0xff;
   out[outAt+k]=plain;
   weightedSum=(weightedSum+plain*(span-k))&0xffff;
   seed=(~((seed>>>15&1)+Math.imul(seed,2)+PRNG_STEP))>>>0;
  }
  inAt+=span;outAt+=span;
  if(span===32){
   if(inAt+2>src.length)throw Error('RUGP_TRUNCATED_CRC');
   if(src.readUInt16LE(inAt)!==weightedSum)throw Error('RUGP_CRC_MISMATCH');
   inAt+=2;
  }
 }
 return out;
}

function deinterleaveLanes(src,lanes,masks){
 const total=src.length,cols=Math.floor(total/lanes),tail=total%lanes;
 const dst=Buffer.allocUnsafe(total);
 for(let row=0;row<cols;row++){
  const base=row*lanes;
  for(let lane=0;lane<lanes;lane++){
   const v=src[lane*cols+row];
   dst[base+lane]=masks?(v^masks[lane]):v;
  }
 }
 if(tail)src.copy(dst,total-tail,total-tail,total);
 return dst;
}

function unscrambleIci(raw){
 // Reverse stage 1: 6-lane transposition + forward running diff + 0xA5 mask.
 const s1=deinterleaveLanes(raw,6);
 let carry=0;
 for(let i=0;i<s1.length;i++){const d=(s1[i]-carry)&0xff;carry=(carry+d)&0xff;s1[i]=d^0xa5;}
 // Reverse stage 2: 5-lane transposition + backward running diff.
 const s2=deinterleaveLanes(s1,5);
 carry=0;
 for(let i=s2.length-1;i>=0;i--){const d=(s2[i]-carry)&0xff;carry=(carry+d)&0xff;s2[i]=d;}
 // Reverse stage 3: 3-lane transposition with fixed lane masks.
 return deinterleaveLanes(s2,3,[0x18,0x3f,0xe2]);
}

function unpackClassName(raw){
 let bitOffset=0;
 const takeBits=width=>{
  let acc=0;
  for(let i=0;i<width;i++){
   const byteIdx=bitOffset>>3;
   if(byteIdx>=raw.length)return -1;
   acc|=((raw[byteIdx]>>(bitOffset&7))&1)<<i;
   bitOffset++;
  }
  return acc;
 };
 let result='';
 if(takeBits(1)===0)result+='C';
 for(;;){
  const lead=takeBits(1);if(lead<0)break;
  let ch;
  if(lead===0){const idx=takeBits(4);if(idx<0)break;ch=CLS_COMMON[idx];}
  else{
   const branch=takeBits(1);if(branch<0)break;
   if(branch){const idx=takeBits(5);if(idx<0)break;ch=CLS_EXT[idx];}
   else{
    const idx=takeBits(4);if(idx<0)break;
    if(idx)ch=CLS_UPPER[idx];
    else{const code=takeBits(8);if(code<0)break;ch=String.fromCharCode(code);}
   }
  }
  if(ch==='\x00')break;
  result+=ch;
 }
 return result;
}

const decodeRelOff=(rawId,shift)=>(((rawId-OFF_BIAS)>>>0)*(shift?2:1));
function decodeRelSize(rawId){const delta=(rawId-SZ_BIAS)>>>0,hi=delta>>>13;return (((delta-(hi&0xfff))<<19)|hi)>>>0;}

function createCursor(buf,start=0){
 let at=start;
 const slice=n=>{const s=buf.subarray(at,at+n);at+=n;return s;};
 const u8=()=>buf[at++];
 const u16=()=>{const v=buf.readUInt16LE(at);at+=2;return v;};
 const u32=()=>{const v=buf.readUInt32LE(at);at+=4;return v;};
 const i32=()=>{const v=buf.readInt32LE(at);at+=4;return v;};
 const count=()=>{const v=u16();return v===0xffff?i32():v;};
 return {get at(){return at;},set at(v){at=v;},left:()=>buf.length-at,slice,u8,u16,u32,i32,count};
}

function readIciToc(iciFile){
 const dec=unscrambleIci(decryptBlock(fs.readFileSync(iciFile),0,ICI_STREAM_SEED));
 const cur=createCursor(dec);
 if(cur.u32()!==ICI_HEADER_SIG)throw Error('RUGP_ICI_SIG');
 const ver=cur.u16();
 if(ver>=0x10&&ver<=0x3fff){if(ver>=0x11)cur.u16();}else cur.at-=2;
 cur.u16();cur.u16();
 const rootLen=cur.u16();
 if(cur.slice(rootLen).toString('ascii')!=='CObjectArcMan')throw Error('RUGP_ARCMAN');
 cur.count();
 const schemaVer=cur.i32();cur.i32();cur.u8();cur.u8();
 if(schemaVer>=10){cur.i32();cur.i32();}
 cur.i32();cur.i32();cur.i32();
 if(schemaVer<6)return {tocOff:0,tocSize:0};
 return {tocOff:cur.u32(),tocSize:cur.u32()};
}

function* volumePaths(basePath){
 for(let idx=1;idx<999;idx++){
  const volPath=idx===1?basePath:`${basePath}.${String(idx).padStart(3,'0')}`;
  if(!fs.existsSync(volPath))break;
  yield volPath;
 }
}

function openVolumeSet(basePath){
 const volumes=[];let totalBytes=0;
 for(const volPath of volumePaths(basePath)){
  const volSize=fs.statSync(volPath).size;
  volumes.push({path:volPath,fd:fs.openSync(volPath,'r'),start:totalBytes,end:totalBytes+volSize});
  totalBytes+=volSize;
 }
 return {
  paths:volumes.map(v=>v.path),total:totalBytes,
  readRange(offset,length){
   if(offset<0||offset>=totalBytes||length<=0)return Buffer.alloc(0);
   const want=Math.min(length,totalBytes-offset),buf=Buffer.allocUnsafe(want);
   let got=0;
   while(got<want){
    const abs=offset+got,vol=volumes.find(v=>abs>=v.start&&abs<v.end);
    if(!vol)break;
    const chunk=fs.readSync(vol.fd,buf,got,Math.min(want-got,vol.end-abs),abs-vol.start);
    if(chunk<=0)break;
    got+=chunk;
   }
   return got===want?buf:buf.subarray(0,got);
  },
  close(){for(const v of volumes)try{fs.closeSync(v.fd);}catch{}},
 };
}

const cleanLine=text=>kit.trimBoth(String(text||'').replace(/[\x01-\x08\x0b-\x1f]/g,'').replace(/\r/g,''));

function extractChoices(dec,endAt){
 const out=[],head=dec.subarray(0,endAt);
 for(let pos=head.indexOf(CHOICE_FN),next;pos>=0;pos=next){
  next=head.indexOf(CHOICE_FN,pos+CHOICE_FN.length);
  const win=head.subarray(pos,Math.min(next<0?endAt:next,pos+512)),strs=[];
  for(let p=0;p+4<=win.length;){
   if(win[p]===0xff&&win[p+1]===0xfe&&win[p+2]===0xff){
    let chars=win[p+3],start=p+4;
    if(chars===0xff&&start+2<=win.length){chars=win.readUInt16LE(start);start+=2;}
    if(chars>0&&start+chars*2<=win.length){strs.push(win.subarray(start,start+chars*2).toString('utf16le'));p=start+chars*2;continue;}
   }
   p++;
  }
  const jp=cleanLine(strs[0]);
  if(!jp)continue;
  let zh='',en='';
  for(const raw of strs.slice(1)){
   const s=cleanLine(raw);if(!s)continue;
   if(!zh&&HAN.test(s)&&!kit.hasKana(s))zh=s;
   else if(!en&&/[A-Za-z]/.test(s))en=s;
  }
  out.push({jp,zh,en});
 }
 return out;
}

function parseCrsaMessages(dec){
 const poolMarker=dec.indexOf(POOL_START);
 if(poolMarker<0||poolMarker+POOL_START.length+4>dec.length)return null;
 const poolChars=dec.readUInt32LE(poolMarker+POOL_START.length),poolStart=poolMarker+POOL_START.length+4;
 if(poolChars<=2||poolStart+poolChars*2>dec.length)return null;
 const poolBuf=dec.subarray(poolStart,poolStart+poolChars*2);
 const readPool=charIdx=>{
  if(!charIdx||charIdx>=poolChars)return '';
  let end=charIdx;
  while(end<poolChars&&poolBuf.readUInt16LE(end*2)!==0)end++;
  return poolBuf.subarray(charIdx*2,end*2).toString('utf16le');
 };

 const rows=[],msg3At=dec.subarray(0,poolMarker).indexOf(FIRST_MSG3);
 if(msg3At>=0){
  const cands=[];
  for(let p=msg3At;p<poolMarker-28;p++){
   if(dec[p]!==0||dec[p+1]!==0||dec[p+2]<2||dec[p+2]>4||dec[p+3]>1)continue;
   const first=p===msg3At+20;if(!first&&p<msg3At+20)continue;
   const langs=dec[p+2];if(p+4+langs*12>poolMarker)continue;
   const tag=first?-1:dec.readUInt16LE(p-12);
   if(!first&&(tag<0x8002||tag>0x8400))continue;
   const jpOff=dec.readUInt32LE(p+4),trOff=dec.readUInt32LE(p+4+(langs-1)*12),enOff=langs>=2?dec.readUInt32LE(p+4+12):0;
   if(!jpOff||jpOff>=poolChars||trOff>=poolChars||enOff>=poolChars)continue;
   if(poolBuf.readUInt16LE((jpOff-1)*2)!==0)continue;
   if(trOff>0&&poolBuf.readUInt16LE((trOff-1)*2)!==0)continue;
   cands.push({tag,jpOff,trOff,enOff});
  }
  const counts=new Map();for(const c of cands)if(c.tag!==-1)counts.set(c.tag,(counts.get(c.tag)||0)+1);
  const topTag=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];
  for(const c of cands){
   if(c.tag!==-1&&c.tag!==topTag)continue;
   const jp=cleanLine(readPool(c.jpOff));if(!jp)continue;
   rows.push({jp,tr:c.trOff?cleanLine(readPool(c.trOff)):'',en:c.enOff?cleanLine(readPool(c.enOff)):''});
  }
 }
 for(const ch of extractChoices(dec,poolMarker))rows.push({jp:ch.jp,tr:ch.zh||ch.en,en:ch.en});
 return rows.length?rows:null;
}

function scanObjExtents(buf,shift,maxTotal,push){
 for(let i=0;i+10<=buf.length;i++){
  if(buf[i]===0x08&&(buf[i+1]===0xc1||buf[i+1]===0xc3||buf[i+1]===0xd1)){
   const off=decodeRelOff(buf.readUInt32LE(i+2),shift),sz=decodeRelSize(buf.readUInt32LE(i+6));
   if(off<maxTotal&&sz>=32&&sz<50000000)push(off,sz);
  }
 }
}

function collectTocExtents(tocBuf,encrypted,shift,maxTotal,push){
 const cur=createCursor(tocBuf,4),hdrVer=cur.u16();
 if(hdrVer>=0x10&&hdrVer<=0x3fff){if(hdrVer>=0x11)cur.u16();}else cur.at-=2;
 const types=[null,'this'];
 const nextType=()=>{
  const hi=cur.u16(),tag=hi===0x7fff?cur.i32():((hi&0x8000)<<16)|(hi&0x7fff);
  if((tag&0x80000000)===0)return null;
  if(hi!==0xffff)return types[tag&0x7fffffff]||null;
  cur.u16();const n=cur.u8(),len=n===0xff?cur.u16():n,raw=cur.slice(len);
  const cls=encrypted?unpackClassName(raw):raw.toString('ascii');
  types.push(cls);return cls;
 };
 types.push({cls:nextType()});
 const walk=depth=>{
  if(depth>40||cur.left()<2)return;
  const total=cur.count();
  for(let i=0;i<total&&cur.left()>=2;i++){
   const mode=cur.u16(),kind=mode&7;
   if(kind===0){if(mode&0x8000)cur.u8();else cur.u16();nextType();}
   else if(kind===1){cur.i32();if(cur.u16()===0x1e57)nextType();else{cur.u16();cur.slice(cur.u16());}}
   else break;
   if(mode&8){const a=cur.u32(),b=cur.u32();push(encrypted?decodeRelOff(a,shift):a,encrypted?decodeRelSize(b):b);}
   if(!(mode&0x0200))walk(depth+1);
  }
 };
 walk(0);
 if(encrypted&&cur.left()>=8){try{scanObjExtents(decryptBlock(tocBuf,cur.at,DATA_STREAM_SEED),shift,maxTotal,push);}catch{}}
}

const iciOf=rioPath=>fs.existsSync(rioPath+'.ici')?rioPath+'.ici':rioPath.replace(/\.rio$/i,'.ici');
function readRioScenes(rioPath){
 const iciPath=iciOf(rioPath);
 const vol=openVolumeSet(rioPath);
 try{
  if(vol.total<32)return null;
  let tocBuf,shift=0,encrypted=false;
  if(fs.existsSync(iciPath)){
   const {tocOff,tocSize}=readIciToc(iciPath);if(!tocSize||tocSize>(8<<20))return null;
   for(const sh of [1,0]){
    const b=vol.readRange(tocOff*(sh?2:1),tocSize);
    if(b.length>=8&&b.readUInt32LE(0)===ENC_TOC_SIG){tocBuf=b;shift=sh;encrypted=true;break;}
   }
  }else{
   const sig=vol.readRange(0,4);
   if(sig.length===4&&sig.readUInt32LE(0)===RAW_RIO_SIG)tocBuf=vol.readRange(0,Math.min(vol.total,2<<20));
  }
  if(!tocBuf)return null;

  const queue=[],visited=new Set();
  const enqueue=(off,sz)=>{if(off<vol.total&&sz>=32&&sz<50000000&&!visited.has(off)){visited.add(off);queue.push({off,sz});}};
  collectTocExtents(tocBuf,encrypted,shift,vol.total,enqueue);

  const scenes=[];
  while(queue.length&&visited.size<200000){
   const {off,sz}=queue.shift(),raw=vol.readRange(off,Math.min(sz+64,Math.max(sz,128)));
   if(raw.length<24)continue;
   let dec=null;
   if(raw[0]===0x00&&raw[1]===0x05&&raw[2]===0x6e){
    const lenA=(~(raw.readUInt32LE(11)^LEN_MASK_A))>>>0,lenB=((raw.readUInt32LE(15)^LEN_MASK_B)>>>3)>>>0;
    if(lenA===lenB&&lenA>0&&lenA<50000000){
     const need=11+8+lenA+Math.floor(lenA/32)*2,full=need<=raw.length?raw:vol.readRange(off,need);
     try{dec=decryptBlock(full,11,DATA_STREAM_SEED);}catch{}
    }
   }
   if(dec){
    const rows=parseCrsaMessages(dec);
    if(rows){
     let zhCnt=0,enCnt=0;
     for(const r of rows){const t=r.tr;if(!t)continue;if(HAN.test(t)&&!kit.hasKana(t))zhCnt++;else if(ASCII_WORD.test(t)&&!HAN.test(t))enCnt++;}
     const hasZh=zhCnt>enCnt&&zhCnt>0;
     const lines=rows.map(r=>r.jp),zh=hasZh?rows.map(r=>r.tr||''):[],en=hasZh?rows.map(r=>r.en&&ASCII_WORD.test(r.en)&&!HAN.test(r.en)?r.en:''):rows.map(r=>r.en||r.tr||'');
     scenes.push({name:`scene-${String(scenes.length+1).padStart(3,'0')}-${off.toString(16)}`,lines,zh,en});
    }
    scanObjExtents(dec,shift,vol.total,enqueue);
   }else if(sz<200000){
    scanObjExtents(raw,shift,vol.total,enqueue);
   }
  }
  return scenes.length?{rioPath,parts:vol.paths,iciPath:fs.existsSync(iciPath)?iciPath:null,scenes}:null;
 }finally{vol.close();}
}

function rioCandidates(dir){
 let names=[];try{names=fs.readdirSync(dir);}catch{return [];}
 return names.filter(n=>/\.rio$/i.test(n)).sort((a,b)=>(/_chn\.rio$/i.test(a)?0:1)-(/_chn\.rio$/i.test(b)?0:1)||a.localeCompare(b)).map(n=>path.join(dir,n));
}

const cache=new Map();
function loadDir(dir,all=false){
 const id=(all?'all|':'picked|')+dir,cands=rioCandidates(dir);
 if(!cands.length){cache.delete(id);return null;}
 const key=JSON.stringify(cands.map(f=>[...volumePaths(f),iciOf(f)].map(p=>[p,stat(p)]))),cached=cache.get(id);
 if(cached?.key===key)return cached.val;
 let picked=null;const extra=[];
 for(const f of cands){
  let r=null;try{r=readRioScenes(f);}catch{r=null;}
  if(!r)continue;
  if(!picked){picked=r;if(!all)break;}
  else extra.push(r);
 }
 const out=picked?{picked,all:[picked,...extra]}:null;
 cache.set(id,{key,val:out});if(cache.size>8)cache.delete(cache.keys().next().value);
 return out;
}

const rugp={
 id:'rugp',hint:'*.rio（+ *.rio.ici）',
 scenes(dir){
  const d=loadDir(dir,false);if(!d)return [];
  return d.picked.scenes.map(s=>({name:s.name,read:()=>Buffer.from(JSON.stringify({lines:s.lines,zh:s.zh}),'utf8')}));
 },
 archives:()=>[],
 sources(dir){
  const d=loadDir(dir,false);if(!d)return [];
  return [...d.picked.parts,...(d.picked.iciPath?[d.picked.iciPath]:[])];
 },
 parse(buf){
  const doc=JSON.parse(Buffer.isBuffer(buf)?buf.toString('utf8'):String(buf));
  return {lines:doc.lines||[],anchors:[],...(doc.zh?.some(Boolean)?{zh:doc.zh}:{})};
 },
 test:()=>false,
 patchLines(base){
  let any=false;
  const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});
  return any?list:null;
 },
 foreign(dir){
  const d=loadDir(dir,true);if(!d)return null;
  const fk=require('../original-text.cjs').foreignKey,out=new Map(),seq=[];out.seq=seq;
  const add=(tr,j)=>{
   if(!tr||!j||tr===j)return;
   const k=fk(tr),jk=fk(j);if(!k||k.length<2||k===jk)return;
   if(!out.has(k))out.set(k,j);
   seq.push([k,j]);
  };
  for(const src of d.all)for(const sc of src.scenes)for(let i=0;i<sc.lines.length;i++){
   const j=sc.lines[i];if(!j)continue;
   if(sc.zh[i])add(sc.zh[i],j);
   if(sc.en[i])add(sc.en[i],j);
  }
  return out.size?out:null;
 },
 _internal:{decryptBlock,unscrambleIci,unpackClassName,decodeRelOff,decodeRelSize,readIciToc,parseCrsaMessages,readRioScenes,cleanLine},
};

module.exports={engine:rugp,...rugp};
