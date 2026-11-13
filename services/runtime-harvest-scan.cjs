// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E596 runtime harvest analysis: what a running game holds in memory once it has decrypted its own data, reduced to
   structure. Input is the memory the read-only reader (native/RuntimeHarvest.exe) streams, region by region, plus local
   context (the game's archives, the runtime-dump buffers the existing dump DLL saved). Output is findings; nothing here
   uploads and nothing here keeps raw memory: each region is analysed and dropped.

   scanner=createScanner({archives:[{name,file,size}],pairs:[{plain,cipher,offset,source}],budgetMs})
     scanner.header({bits,modules:[{name,base,size}],regions:[{base,size,protect,type}]})
     scanner.region({base,bytes,index})       one whole region (the stream reader joins its chunks)
     scanner.finish() → {constants,keys,indexes,dispatch,scripts,stats}   local findings (keys in full)

   Detectors (all generic; none knows a game or an engine):
     constants   crypto tables and immediates in module images (Blowfish pi, AES, Camellia sigma/S-box, TEA delta, CRC32,
                 MD5, zlib) with module + RVA and a code signature that references them: tells which cipher the engine
                 links, and gates the costlier searches below
     keys        Blowfish key schedules found by self-consistency (the last S-box pair is the encryption of the pair before
                 it, a 64-bit check no random data passes), then the original key when a candidate string reproduces it;
                 Camellia-128 key schedules by the rotation relations of KL (KL<<<15, <<<45 … stored next to it); TEA /
                 XTEA keys checked against known plaintext (dump buffers vs. the archive bytes) or an oracle (entry heads
                 that decrypt to structure); XOR / add parameters derived from known plaintext
     indexes     archive index tables decoded in memory: runs of fixed-stride records whose offset/size fields tile one of
                 the game's archives without overlap; stride, field layout, count field, entries (numbers only)
     dispatch    opcode dispatch tables: long arrays of pointers into one module's code
     scripts     decoded script buffers: text runs between binary opcodes; the byte(s) before each run, length prefixes,
                 terminators; a desensitized sample of the window (desensitize.sample, verify() gate)
   Every find records the module and RVA it came from (heap finds: the module slot that points at them) and, where code
   references it, a byte pattern with the address wildcarded, so an adapter can find it again by pattern. */
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib');
const d=require('./desensitize.cjs');

const MEM_IMAGE=0x1000000,MEM_PRIVATE=0x20000,SCRIPT_WINDOW=1<<20;
const EXEC=0x10|0x20|0x40|0x80,WRITE=0x04|0x08|0x40|0x80;

/* ---- crypto constants ------------------------------------------------------------------------------------------- */
const u32le=(...w)=>{const b=Buffer.alloc(w.length*4);w.forEach((v,i)=>b.writeUInt32LE(v>>>0,i*4));return b;};
const u32be=(...w)=>{const b=Buffer.alloc(w.length*4);w.forEach((v,i)=>b.writeUInt32BE(v>>>0,i*4));return b;};
const CONSTANTS=[
 ['blowfish',u32le(0x243f6a88,0x85a308d3,0x13198a2e,0x03707344)],['blowfish',u32le(0xd1310ba6,0x98dfb5ac,0x2ffd72db,0xd01adfb7)],
 ['aes',Buffer.from('637c777bf26b6fc53001672bfed7ab76','hex')],['aes-inverse',Buffer.from('52096ad53036a538bf40a39e81f3d7fb','hex')],['aes',u32le(0xa56363c6,0x847c7cf8)],
 ['camellia',u32be(0xa09e667f,0x3bcc908b)],['camellia',u32le(0xa09e667f,0x3bcc908b)],['camellia',Buffer.from('70822cecb327c0e5e4855735ea0cae41','hex')],
 ['tea',u32le(0x9e3779b9)],['tea',u32le(0x61c88647)],['tea',u32le(0xc6ef3720)],
 ['crc32',u32le(0,0x77073096,0xee0e612c,0x990951ba)],['md5',u32le(0x67452301,0xefcdab89,0x98badcfe,0x10325476)],
 ['zlib',Buffer.from(' inflate 1.','latin1')],['zlib',Buffer.from(' deflate 1.','latin1')]];

/* ---- Blowfish ----------------------------------------------------------------------------------------------------- */
/* decrypt one block with a state laid out in w: P at p (18 words), S-boxes at s (4×256). Result in BF[0], BF[1]. */
const BF=new Uint32Array(2);
function bfDecrypt(w,p,s,l,r){
 for(let i=17;i>1;i--){l=(l^w[p+i])>>>0;const x=l;r=(r^((((w[s+(x>>>24)]+w[s+256+((x>>>16)&255)])>>>0)^w[s+512+((x>>>8)&255)])+w[s+768+(x&255)])>>>0)>>>0;const t=l;l=r;r=t;}
 const t=l;l=r;r=t;r=(r^w[p+1])>>>0;l=(l^w[p])>>>0;BF[0]=l;BF[1]=r;}
function bfEncrypt(w,p,s,l,r){
 for(let i=0;i<16;i++){l=(l^w[p+i])>>>0;const x=l;r=(r^((((w[s+(x>>>24)]+w[s+256+((x>>>16)&255)])>>>0)^w[s+512+((x>>>8)&255)])+w[s+768+(x&255)])>>>0)>>>0;const t=l;l=r;r=t;}
 const t=l;l=r;r=t;r=(r^w[p+16])>>>0;l=(l^w[p+17])>>>0;BF[0]=l;BF[1]=r;}
/* the key schedule's last two pairs: S3[254..255]=E(S3[252..253]) and S3[252..253]=E(S3[250..251]) under the state of
   that moment, which differs from the final one only in those entries; at least one holds for ~97 % of real states */
function bfConsistent(w,p,s){const S3=s+768;
 bfDecrypt(w,p,s,w[S3+254],w[S3+255]);if(BF[0]===w[S3+252]&&BF[1]===w[S3+253])return true;
 bfDecrypt(w,p,s,w[S3+252],w[S3+253]);return BF[0]===w[S3+250]&&BF[1]===w[S3+251];}
function stateWords(state){const w=new Uint32Array(1042);for(let i=0;i<1042;i++)w[i]=state.readUInt32LE(i*4);return w;}
/* decrypt a buffer in 8-byte ECB blocks with a state ("PS": P then S) — little-endian words, as x86 engines store them */
function blowfishStateDecrypt(buf,state,{words='le'}={}){const w=stateWords(state),out=Buffer.from(buf);
 for(let i=0;i+8<=out.length;i+=8){const l=words==='be'?out.readUInt32BE(i):out.readUInt32LE(i),r=words==='be'?out.readUInt32BE(i+4):out.readUInt32LE(i+4);bfDecrypt(w,0,18,l,r);
  if(words==='be'){out.writeUInt32BE(BF[0],i);out.writeUInt32BE(BF[1],i+4);}else{out.writeUInt32LE(BF[0],i);out.writeUInt32LE(BF[1],i+4);}}
 return out;}
/* the state a key gives (P then S), as bytes */
function blowfishState(key){const {Blowfish}=require('./original-engines/blowfish.cjs');const b=new Blowfish(Buffer.from(key)),out=Buffer.alloc(4168);
 b.P.forEach((v,i)=>out.writeUInt32LE(v,i*4));for(let s=0;s<4;s++)for(let i=0;i<256;i++)out.writeUInt32LE(b.S[s][i],72+(s*256+i)*4);return out;}

/* ---- Camellia (key schedule relations only; decryption uses node:crypto) ------------------------------------------ */
function rot128(w,n){n%=128;const q=n>>5,r=n&31,out=new Uint32Array(4);for(let i=0;i<4;i++){const a=w[(i+q)&3],b=w[(i+q+1)&3];out[i]=r?((a<<r)|(b>>>(32-r)))>>>0:a;}return out;}
const CAMELLIA_ROT=[15,45,77,94,111];

/* ---- TEA / XTEA --------------------------------------------------------------------------------------------------- */
const DELTA=0x9e3779b9;
function teaDecryptBlock(v0,v1,k,rounds,variant){let sum=Math.imul(DELTA,rounds)>>>0;
 if(variant==='xtea'){for(let i=0;i<rounds;i++){v1=(v1-((((v0<<4)^(v0>>>5))+v0)^(sum+k[(sum>>>11)&3])))>>>0;sum=(sum-DELTA)>>>0;v0=(v0-((((v1<<4)^(v1>>>5))+v1)^(sum+k[sum&3])))>>>0;}}
 else{for(let i=0;i<rounds;i++){v1=(v1-((((v0<<4)+k[2])^(v0+sum)^((v0>>>5)+k[3]))>>>0))>>>0;v0=(v0-((((v1<<4)+k[0])^(v1+sum)^((v1>>>5)+k[1]))>>>0))>>>0;sum=(sum-DELTA)>>>0;}}
 BF[0]=v0;BF[1]=v1;}
function teaDecrypt(buf,{key,variant='tea',rounds=32,words='le'}){const k=Buffer.from(key,'hex'),kw=[0,1,2,3].map(i=>words==='be'?k.readUInt32BE(i*4):k.readUInt32LE(i*4)),out=Buffer.from(buf);
 for(let i=0;i+8<=out.length;i+=8){teaDecryptBlock(words==='be'?out.readUInt32BE(i):out.readUInt32LE(i),words==='be'?out.readUInt32BE(i+4):out.readUInt32LE(i+4),kw,rounds,variant);
  if(words==='be'){out.writeUInt32BE(BF[0],i);out.writeUInt32BE(BF[1],i+4);}else{out.writeUInt32LE(BF[0],i);out.writeUInt32LE(BF[1],i+4);}}
 return out;}
const TEA_VARIANTS=[['tea',32],['xtea',32],['tea',16],['xtea',64]];

/* ---- plaintext plausibility ----------------------------------------------------------------------------------------- */
const MAGICS=[Buffer.from('89504e47','hex'),Buffer.from('OggS'),Buffer.from('RIFF'),Buffer.from([0xff,0xfe]),Buffer.from([0xef,0xbb,0xbf]),Buffer.from('TJS2'),Buffer.from('PSB\0'),Buffer.from('BM'),Buffer.from([0xff,0xd8,0xff]),Buffer.from('PK\x03\x04','latin1')];
/* structured: a known magic, or at least 7 of 8 bytes zero / printable ASCII / a Shift-JIS lead+trail pair, or a zlib head */
function structured(b){if(b.length<8)return false;for(const m of MAGICS)if(b.subarray(0,m.length).equals(m))return true;if((b[0]&0x0f)===8&&((b[0]<<8)|b[1])%31===0)return true;
 let ok=0;for(let i=0;i<8;i++){const x=b[i];if(x===0||x===9||x===10||x===13||x>=0x20&&x<0x7f)ok++;else if(i<7&&(x>=0x81&&x<=0x9f||x>=0xe0&&x<=0xef)&&b[i+1]>=0x40){ok+=2;i++;}}return ok>=7;}

/* ---- known plaintext → XOR / add parameters ------------------------------------------------------------------------- */
/* from one pair (ciphertext as stored, plaintext the game made of it): {algo,key|value|base+step,period,phase,confidence} */
function fromKnownPlaintext(c,p,offset=0){const n=Math.min(c.length,p.length,8192);if(n<16)return null;
 const k=Buffer.alloc(n);for(let i=0;i<n;i++)k[i]=c[i]^p[i];
 if(k.every(x=>x===0))return {algo:'none',confidence:1};
 if(k.every(x=>x===k[0]))return {algo:'xor',key:k.subarray(0,1).toString('hex'),period:1,phase:'entry',confidence:1};
 const sub=(c[0]-p[0])&255;let isSub=true;for(let i=1;i<n&&isSub;i++)if(((c[i]-p[i])&255)!==sub)isSub=false;if(isSub)return {algo:'sub',value:sub,confidence:1};
 const step=(k[1]-k[0])&255;let lin=true;for(let i=2;i<n&&lin;i++)if(((k[i]-k[i-1])&255)!==step)lin=false;if(lin)return {algo:'xor-index',base:k[0],step,confidence:1};
 for(let period=2;period<=Math.min(4096,n>>2);period++){let same=0;const m=n-period;for(let i=0;i<m;i++)if(k[i]===k[i+period])same++;
  if(same>=m*.995){const key=k.subarray(0,period);
   /* a key that lines up with the file offset rather than the entry start */
   const phase=offset%period;return {algo:'xor',key:key.toString('hex'),period,phase:'entry',filePhase:phase?Buffer.concat([key.subarray(period-phase),key.subarray(0,period-phase)]).toString('hex'):key.toString('hex'),confidence:1};}}
 return null;}

/* ---- the scanner ---------------------------------------------------------------------------------------------------- */
function createScanner({archives=[],pairs=[],budgetMs=90000,now=Date.now}={}){
 const started=now();let header={bits:64,modules:[],regions:[]},mods=[];
 const out={constants:[],keys:[],indexes:[],dispatch:[],scripts:[],stats:{regions:0,bytes:0,skipped:0,ms:0,stop:'done'}};
 const seen=new Set(),gate=new Set();/* algos whose constants a module carries: gates the costlier key searches */
 const slots=new Map();/* heap address → [module index, rva] of an image slot that points at it */
 const execRegions=[];/* image code: [base, Buffer, module] kept only as long as needed for signatures (bounded) */
 let execBytes=0;const pending=[];/* image finds that want a code signature: {find,address} */
 const candidates=[];/* strings that may be a Blowfish key: Buffer */
 const maxSize=archives.reduce((m,a)=>Math.max(m,a.size||0),0);
 const over=()=>now()-started>budgetMs;
 const moduleOf=a=>{let lo=0,hi=mods.length-1;while(lo<=hi){const mid=(lo+hi)>>1,m=mods[mid];if(a<m.base)hi=mid-1;else if(a>=m.base+m.size)lo=mid+1;else return mid;}return -1;};
 const where=a=>{const i=moduleOf(a);return i>=0?{module:i,rva:a-mods[i].base}:{module:-1,heap:true};};
 const heapRanges=[];

 function header_(h){header={bits:h.bits===32?32:64,modules:h.modules||[],regions:h.regions||[]};
  mods=header.modules.map((m,i)=>({name:String(m.name||''),base:typeof m.base==='string'?parseInt(m.base,16):Number(m.base),size:Number(m.size)||0,index:i})).sort((a,b)=>a.base-b.base);
  for(const r of header.regions){const base=typeof r.base==='string'?parseInt(r.base,16):Number(r.base);if(r.type===MEM_PRIVATE)heapRanges.push([base,base+Number(r.size)]);}
  heapRanges.sort((a,b)=>a[0]-b[0]);}
 const inHeap=v=>{let lo=0,hi=heapRanges.length-1;while(lo<=hi){const mid=(lo+hi)>>1,r=heapRanges[mid];if(v<r[0])hi=mid-1;else if(v>=r[1])lo=mid+1;else return true;}return false;};

 /* image: constants, pointer slots into the heap, dispatch tables, key-string candidates */
 function image(base,b,meta){const mi=moduleOf(base),exec=(meta.protect&EXEC)!==0;
  if(exec&&execBytes<64<<20){execRegions.push({base,bytes:b,module:mi});execBytes+=b.length;}
  for(const [algo,sig] of CONSTANTS){let at=b.indexOf(sig);let n=0;while(at>=0&&n<4){const a=base+at,k=algo+'@'+a;if(!seen.has(k)){seen.add(k);gate.add(algo);if(out.constants.filter(c=>c.algo===algo).length<4){const f={algo,where:where(a),address:a};out.constants.push(f);pending.push({find:f,address:a});}}n++;at=b.indexOf(sig,at+sig.length);}}
  /* TEA's delta as an instruction immediate in code */
  if(!exec){
   const ptr=header.bits===64?8:4;
   for(let i=0;i+ptr<=b.length;i+=ptr){const v=ptr===8?b.readUInt32LE(i)+b.readUInt16LE(i+4)*4294967296:b.readUInt32LE(i);if(v>0x10000&&inHeap(v)&&slots.size<2000000&&!slots.has(v))slots.set(v,[mi,base+i-(mi>=0?mods[mi].base:0)]);}
   dispatchTables(base,b,mi,ptr);
   if(candidates.length<20000)keyStrings(b,candidates);}
 }
 /* printable ASCII strings 4..56 bytes (Blowfish keys are often a pass phrase in .rdata) */
 function keyStrings(b,list){let s=-1;for(let i=0;i<=b.length;i++){const x=i<b.length?b[i]:0;if(x>=0x21&&x<0x7f){if(s<0)s=i;}else{if(s>=0&&x===0&&i-s>=4&&i-s<=56&&list.length<20000)list.push(Buffer.from(b.subarray(s,i)));s=-1;}}}
 /* ≥48 consecutive pointers into the executable part of one module */
 function dispatchTables(base,b,mi,ptr){if(mi<0)return;const m=mods[mi];let run=0,start=0,targets=[];
  const flush=end=>{if(run>=48){const distinct=new Set(targets).size;if(distinct>=run*.5&&out.dispatch.length<32){const a=base+start;const f={where:where(a),address:a,count:run,ptr,targets:targets.slice(0,1024).map(t=>t-m.base)};out.dispatch.push(f);pending.push({find:f,address:a});}}run=0;targets=[];};
  for(let i=0;i+ptr<=b.length;i+=ptr){const v=ptr===8?(b.readUInt16LE(i+6)?0:b.readUInt32LE(i)+b.readUInt16LE(i+4)*4294967296):b.readUInt32LE(i);
   if(v>m.base&&v<m.base+m.size&&execAt(v)){if(!run)start=i;run++;targets.push(v);}else flush(i);}
  flush(b.length);}
 const execRanges=[];const execAt=v=>execRanges.some(r=>v>=r[0]&&v<r[1]);

 /* heap: Blowfish states, Camellia schedules, index tables, script windows */
 function heap(base,b){
  if(b.byteOffset%4)b=Buffer.from(b);
  const n=b.length>>2,w=new Uint32Array(b.buffer,b.byteOffset,n);
  blowfishScan(base,w);if(over())return;
  if(gate.has('camellia')&&b.length<=16<<20)camelliaScan(base,w,b);if(over())return;
  if(archives.length)indexScan(base,w,b);if(over())return;
  scriptScan(base,b);
 }
 function blowfishScan(base,w){let run=0;const n=w.length;
  for(let i=0;i<n;i++){if(w[i]===0){run=0;continue;}run++;if(run<1042)continue;const s=i-1041;
   if((s&1023)===0&&over())return;
   for(const [layout,p,sb] of [['PS',s,s+18],['SP',s+1024,s]]){if(!bfConsistent(w,p,sb))continue;
    const state=Buffer.alloc(4168);for(let k=0;k<18;k++)state.writeUInt32LE(w[p+k],k*4);for(let k=0;k<1024;k++)state.writeUInt32LE(w[sb+k],72+k*4);
    const h=crypto.createHash('sha256').update(state).digest('hex');if(seen.has('bf'+h))continue;seen.add('bf'+h);
    const a=base+s*4;out.keys.push({algo:'blowfish',layout,form:'state',state,address:a,where:where(a),verified:'self-consistent'});}}}
 function camelliaScan(base,w,b){const n=w.length;
  for(const conv of ['le','be']){const rd=conv==='le'?(i=>w[i]):(i=>b.readUInt32BE(i*4));
   for(let i=0;i+4<=n;i++){if((i&4095)===0&&over())return;const x=[rd(i),rd(i+1),rd(i+2),rd(i+3)];if(!x[0]||!x[1]||!x[2]||!x[3])continue;
    let hits=0;for(const r of CAMELLIA_ROT){const t=rot128(x,r);for(let j=i+2;j<Math.min(n-1,i+2+128);j+=2){if(rd(j)===t[0]&&rd(j+1)===t[1]){hits++;break;}}if(hits>=2)break;}
    if(hits>=2){const key=Buffer.alloc(16);x.forEach((v,k)=>key.writeUInt32BE(v,k*4));const k='cam'+key.toString('hex');if(seen.has(k))continue;seen.add(k);const a=base+i*4;
     out.keys.push({algo:'camellia',bits:128,form:'key',key:key.toString('hex'),words:conv,address:a,where:where(a),verified:'key-schedule'});}}}}
 /* records of a fixed stride whose offset field stays inside an archive and whose offset/size fields tile it */
 function indexScan(base,w,b){const n=w.length;
  /* dense blocks: many words that could be an offset into the largest archive */
  const BLOCK=1024;const dense=[];for(let s=0;s<n;s+=BLOCK){let ok=0,nz=0;for(let i=s;i<Math.min(n,s+BLOCK);i++){const v=w[i];if(v){nz++;if(v<=maxSize)ok++;}}if(ok>=24&&ok>=nz*.05)dense.push(s);}
  if(!dense.length)return;
  /* a table that starts in the block before a dense one (its first records next to other data) is scanned from there */
  const spans=[];for(const s of dense){const from=Math.max(0,s-BLOCK),last=spans[spans.length-1];if(last&&last[1]>=from)last[1]=Math.min(n,s+BLOCK);else spans.push([from,Math.min(n,s+BLOCK)]);}
  for(const [from,to] of spans){if(over())return;
   for(let stride=2;stride<=64;stride++){/* stride in words: 8..256 bytes */if(over())return;
    for(let phase=0;phase<stride;phase++){let runStart=-1,count=0,prev=-1;
     /* offsets in file order: each record's offset above the previous one (packers write entries in order) */
     for(let i=from+phase;i<=to;i+=stride){const v=i<to?w[i]:0;const ok=i<to&&v<maxSize&&v>prev;
      if(ok){if(runStart<0)runStart=i;count++;prev=v;}
      else{if(count>=8)tryTable(base,w,b,runStart,count,stride);runStart=i<to&&v<maxSize?i:-1;count=runStart<0?0:1;prev=runStart<0?-1:v;}}}}}}
 function tryTable(base,w,b,at0,count0,stride){
  const key='ix'+(base+at0*4)+':'+stride;if(seen.has(key))return;
  /* a size field next to the offset (u32 at ±1..±4 words), u64 offsets (next word zero), packed + unpacked sizes */
  for(const g of [1,2,-1,3,-2,4,-3,-4]){if(g>=stride||-g>=stride)continue;
   /* an entry at offset 0 before the run */
   let at=at0,count=count0;while(at-stride>=0&&-g<=at-stride&&w[at-stride]<w[at]&&w[at-stride+g]>0&&w[at-stride]+w[at-stride+g]<=w[at]){at-=stride;count++;}
   const offs=[],sizes=[];for(let k=0;k<count;k++){const i=at+k*stride;offs.push(w[i]);sizes.push(w[i+g]);}
   if(sizes.some(s=>s===0||s>maxSize))continue;
   for(const arc of archives){if(!arc.size)continue;const S=arc.size;if(offs.some((o,k)=>o+sizes[k]>S))continue;
    const order=offs.map((o,k)=>k).sort((x,y)=>offs[x]-offs[y]);let overlap=0,covered=0;
    for(let k=0;k<order.length;k++){const o=offs[order[k]],e=o+sizes[order[k]];covered+=sizes[order[k]];if(k+1<order.length&&e>offs[order[k+1]])overlap++;}
    const maxEnd=Math.max(...offs.map((o,k)=>o+sizes[k]));
    if(overlap>count*.02||covered<S*.3||maxEnd<S*.5)continue;
    /* packers write entries back to back, or aligned to a block (512 … 4096): the gap after an entry is under 16 bytes,
       or under the block every offset is a multiple of */
    const align=[4096,2048,1024,512].find(A=>offs.every(o=>o%A===0))||16;let tight=0;
    for(let k=0;k+1<order.length;k++){const gap=offs[order[k+1]]-(offs[order[k]]+sizes[order[k]]);if(gap>=0&&gap<align)tight++;}
    if(tight<(order.length-1)*.8)continue;
    seen.add(key);
    const fields={offset:{word:0,type:w[at+1]===0&&stride>2&&g!==1?'u64le':'u32le'},size:{word:g,type:'u32le'}};
    /* a second size field (unpacked ≥ packed) */
    for(const g2 of [1,2,3,4,-1,-2]){if(g2===g||g2>=stride||-g2>=stride||g2===1&&fields.offset.type==='u64le')continue;let ge=0,diff=0;for(let k=0;k<count;k++){const v=w[at+k*stride+g2];if(v>=sizes[k]*.5&&v<=sizes[k]*64+4096)ge++;if(v!==sizes[k])diff++;}if(ge===count&&diff){fields.unpacked={word:g2,type:'u32le'};break;}}
    /* a NUL-terminated name inside the record, or a name pointer */
    const names=recordNames(b,at,count,stride);
    /* a count field just before the table */
    let countAt=null;for(let back=1;back<=8;back++){if(at-back>=0&&w[at-back]===count){countAt=-back;break;}}
    const table=[];for(let k=0;k<count;k++){const i=at+k*stride;table.push([w[i],w[i+g],fields.unpacked?w[i+fields.unpacked.word]:0]);}
    const sig=crypto.createHash('sha1').update(Buffer.from(Uint32Array.from(table.flat()).buffer)).digest('hex');const twin=out.indexes.find(x=>x.sig===sig);if(twin){twin.copies=(twin.copies||1)+1;return;}
    /* the table as it sits in memory, 256 bytes either side (names and all; desensitized before it can leave) */
    const from=Math.max(0,at*4-256),to=Math.min(b.length,(at+count*stride)*4+256);
    const a=base+at*4;out.indexes.push({sig,region:{at:from-at*4,bytes:Buffer.from(b.subarray(from,to))},archive:arc,address:a,where:where(a),stride:stride*4,count,fields,names,countAt,entries:table,coverage:Math.round(covered/S*1000)/1000});return;}}}
 /* the name of each record: a NUL-terminated string at the same place in every record, or a pointer */
 function recordNames(b,at,count,stride){const recBytes=stride*4,first=at*4;
  /* inside the record first (the offset field need not be its first word), then a name before the offset field */
  const offs=[];for(let o=0;o<recBytes;o+=4)offs.push(o);for(let o=-4;o>-recBytes;o-=4)offs.push(o);
  for(const off of offs){const list=[];let ok=0;
   for(let k=0;k<Math.min(count,64);k++){const p=first+k*recBytes+off;if(p<0||p+2>b.length)break;let e=p;while(e<b.length&&e-p<recBytes&&b[e])e++;
    const len=e-p;if(len>=3&&len<recBytes&&b[e]===0){const s=b.subarray(p,e);if(/^[\x20-\x7e]+$/.test(s.toString('latin1'))||d.detect(s).length){ok++;list.push(s);}}}
   if(ok>=Math.min(count,64)*.9&&list.length&&first+off>=0){const all=[];for(let k=0;k<count;k++){const p=first+k*recBytes+off;let e=p;while(e<b.length&&e-p<recBytes&&b[e])e++;all.push(Buffer.from(b.subarray(p,e)));}return {at:off,form:'cstr',list:all};}}
  return null;}
 /* windows where text runs sit between binary opcodes */
 const scriptSeen=new Set();
 let scriptWindows=0;
 function scriptScan(base,b){if(out.scripts.length>=12)return;const BLOCK=4096;
  for(let s=0;s+BLOCK<=b.length;s+=BLOCK){if(out.scripts.length>=12)return;let score=0;
   for(let i=s;i<s+BLOCK-1;i++){const x=b[i],y=b[i+1];if((x===0x82&&y>=0x9f&&y<=0xf1)||(x===0x83&&y>=0x40&&y<=0x96))score++;else if(y===0x30&&(i&1)===0&&x>=0x41&&x<=0xff)score++;else if(x===0xe3&&(y===0x81||y===0x82||y===0x83))score++;}
   if(score<24)continue;if(++scriptWindows>400||over())return;
   const win=b.subarray(s,Math.min(b.length,s+65536));const shape=bytecodeShape(win);if(!shape)continue;
   const h=crypto.createHash('sha1').update(win.subarray(0,4096)).digest('hex');if(scriptSeen.has(h))continue;scriptSeen.add(h);
   /* the sample is a larger window (desensitized and compressed later: placeholders compress to almost nothing) */
   const a=base+s;out.scripts.push({address:a,where:where(a),...shape,window:Buffer.from(b.subarray(s,Math.min(b.length,s+SCRIPT_WINDOW)))});s+=win.length-BLOCK;}}
 function finish(){
  /* code signatures for image finds and the heap slots that locate heap finds */
  /* the object may start a little before the find (a record's first field, a context struct around a key schedule) */
  const locate=f=>{if(!f.where?.heap)return;const back=f.stride||256;for(let k=0;k<back;k+=4){const slot=slots.get(f.address-k);if(slot){f.locator={module:slot[0],rva:slot[1],deref:1,add:k};return;}}};
  for(const f of [...out.keys,...out.indexes,...out.scripts])locate(f);
  for(const f of [...out.keys,...out.indexes])if(f.locator){const m=mods[f.locator.module];if(m)pending.push({find:f,address:m.base+f.locator.rva,slot:true});}
  signatures();
  camelliaClusters();
  /* Blowfish keys: a string that reproduces the state's first words */
  for(const k of out.keys)if(k.algo==='blowfish'&&!k.key&&!over()){const want0=k.state.readUInt32LE(0),want1=k.state.readUInt32LE(4);
   for(const c of candidates.slice(0,4000)){if(over())break;const st=blowfishState(c);if(st.readUInt32LE(0)===want0&&st.readUInt32LE(4)===want1){k.key=c.toString('hex');k.verified+='+key';break;}}}
  /* known plaintext: dump buffers against the archive bytes */
  knownPlaintext();
  /* one table per place: a stride that is a multiple of a kept one over the same records is the same table */
  out.indexes.sort((a,b)=>b.count-a.count||a.stride-b.stride);{const keep=[];for(const ix of out.indexes){if(keep.some(k=>ix.stride%k.stride===0&&ix.address>=k.address-k.stride&&ix.address<k.address+k.count*k.stride))continue;keep.push(ix);}out.indexes=keep;}
  /* script windows: the most bytecode-like first (one opcode in front of most runs), six at most */
  out.scripts.sort((a,b)=>((b.opcodes?.[0]?.share||0)-(a.opcodes?.[0]?.share||0))||b.runs-a.runs);out.scripts=out.scripts.slice(0,6);
  /* entry heads of each index: what kind of data, after the key that opens them */
  for(const ix of out.indexes)classifyEntries(ix);
  /* modules in address order (every module number in the findings is a position in this list); main: the executable */
  out.modules=mods.map(m=>({name:m.name,size:m.size,main:m.index===0}));
  out.stats.ms=now()-started;if(over()&&out.stats.stop==='done')out.stats.stop='budget';
  return out;}
 /* one schedule holds KL, KA and their rotations: per cluster (512 bytes) the first is the key, the other candidates that are
    not a rotation of it are alternates (KA) the pack maker tells apart with known plaintext */
 function camelliaClusters(){const cam=out.keys.filter(k=>k.algo==='camellia').sort((a,b)=>a.address-b.address);if(!cam.length)return;const keep=[];
  const words=k=>[0,1,2,3].map(i=>Buffer.from(k,'hex').readUInt32BE(i*4));const isRot=(a,b)=>{const wa=words(a),wb=words(b);for(let r=1;r<128;r++){const x=rot128(wa,r);if(x.every((v,i)=>v===wb[i]))return true;}return false;};
  for(const k of cam){const c=keep.find(x=>k.address-x.address<512&&k.words===x.words);if(!c){keep.push({...k,alternates:[]});continue;}if(!isRot(c.key,k.key)&&!c.alternates.some(a=>isRot(a,k.key))&&c.alternates.length<2)c.alternates.push(k.key);}
  out.keys=out.keys.filter(k=>k.algo!=='camellia').concat(keep);}
 function signatures(){
  const targets=new Map();for(const p of pending){if(!targets.has(p.address))targets.set(p.address,[]);targets.get(p.address).push(p);}
  if(!targets.size)return;
  for(const r of execRegions){const b=r.bytes;if(over())return;
   for(let i=8;i+8<=b.length;i++){
    const abs=header.bits===32?b.readUInt32LE(i):-1;const rel=r.base+i+4+b.readInt32LE(i);
    for(const t of [abs,rel]){const list=targets.get(t);if(!list)continue;for(const p of list){const f=p.find,key=p.slot?'slotSig':'sig';f[key]=f[key]||[];if(f[key].length>=2)continue;
     f[key].push({module:r.module,rva:r.module>=0?r.base+i-mods[r.module].base:-1,kind:t===abs?'abs32':'rip32',pattern:b.subarray(i-6,i).toString('hex')+'????????'+b.subarray(i+4,i+8).toString('hex')});}}}}}
 /* dump pairs: ciphertext from the archive vs. what the game made of it */
 function knownPlaintext(){for(const p of pairs.slice(0,64)){if(over())return;if(!p.cipher||!p.plain)continue;
  const r=fromKnownPlaintext(p.cipher,p.plain,p.offset||0);if(r&&r.algo!=='none'){const k='kp'+JSON.stringify(r);if(!seen.has(k)){seen.add(k);out.keys.push({...r,form:'params',verified:'known-plaintext',source:p.source});}continue;}
  /* a block cipher this scanner already holds a key for */
  for(const k of out.keys){if(k.verified.includes('known-plaintext'))continue;const head=p.cipher.subarray(0,64),want=p.plain.subarray(0,56);
   let dec=null;try{if(k.algo==='blowfish')dec=blowfishStateDecrypt(head,k.state);else if(k.algo==='camellia')dec=camelliaDecrypt(head,k.key);}catch{}
   if(dec&&dec.subarray(0,56).equals(want)){k.verified+='+known-plaintext';k.mode='ecb';}}
  /* TEA / XTEA keys among 16-byte windows of the images' data, when the engine links TEA */
  if(gate.has('tea')&&!out.keys.some(k=>k.algo==='tea'||k.algo==='xtea'))teaSearch(p);}}
 const teaWindows=[];/* 16-byte windows kept from image data (bounded) */
 function teaSearch(p){const c0=p.cipher.readUInt32LE(0),c1=p.cipher.readUInt32LE(4),p0=p.plain.readUInt32LE(0),p1=p.plain.readUInt32LE(4);
  for(const win of teaWindows){if(over())return;for(const words of ['le','be']){const k=[0,1,2,3].map(i=>words==='be'?win.readUInt32BE(i*4):win.readUInt32LE(i*4));if(!k.some(Boolean))continue;
   for(const [variant,rounds] of TEA_VARIANTS){teaDecryptBlock(words==='be'?p.cipher.readUInt32BE(0):c0,words==='be'?p.cipher.readUInt32BE(4):c1,k,rounds,variant);
    const ok=words==='be'?BF[0]===p.plain.readUInt32BE(0)&&BF[1]===p.plain.readUInt32BE(4):BF[0]===p0&&BF[1]===p1;
    if(ok){out.keys.push({algo:variant,rounds,words,form:'key',key:win.toString('hex'),verified:'known-plaintext',mode:'ecb'});return;}}}}}
 /* TEA by oracle: entry heads of a recovered index that decrypt to structure */
 function teaOracle(ix,heads){if(!gate.has('tea')||out.keys.some(k=>k.algo==='tea'||k.algo==='xtea'))return;
  if(heads.length<6)return;
  for(const win of teaWindows){if(over())return;for(const words of ['le','be'])for(const [variant,rounds] of TEA_VARIANTS){const key=win.toString('hex');let good=0;
   /* two blocks of every head must read as structure: a 1-in-a-billion event for a wrong key over six heads */
   for(const h of heads){const dec=teaDecrypt(h.subarray(0,16),{key,variant,rounds,words});if(structured(dec.subarray(0,8))&&structured(dec.subarray(8,16)))good++;else break;}
   if(good===heads.length){out.keys.push({algo:variant,rounds,words,form:'key',key,verified:'oracle',mode:'ecb',archive:ix.archive.name});return;}}}}
 function camelliaDecrypt(buf,key){const n=buf.length&~15,dc=crypto.createDecipheriv('camellia-128-ecb',Buffer.from(key,'hex'),null);dc.setAutoPadding(false);return Buffer.concat([dc.update(buf.subarray(0,n)),dc.final(),buf.subarray(n)]);}
 /* per entry: magic / text / opaque of the bytes at its offset, with each key that applies; the select list for a pack */
 function classifyEntries(ix){const file=ix.archive.file;if(!file)return;let fd;try{fd=fs.openSync(file,'r');}catch{return;}
  try{const heads=[];const kinds=[];
   for(const e of ix.entries.slice(0,20000)){const h=Buffer.alloc(Math.min(64,e[1]));try{fs.readSync(fd,h,0,h.length,e[0]);}catch{}heads.push(h);}
   teaOracle(ix,heads.filter(h=>h.length>=16).slice(0,8));
   const opens=[{id:'plain',fn:h=>h}];for(const k of out.keys){if(k.algo==='blowfish')opens.push({id:'blowfish',fn:h=>blowfishStateDecrypt(h,k.state)});else if(k.algo==='camellia')opens.push({id:'camellia',fn:h=>camelliaDecrypt(h,k.key)});else if(k.algo==='tea'||k.algo==='xtea')opens.push({id:k.algo,fn:h=>teaDecrypt(h,k)});else if(k.algo==='xor'&&k.form==='params'){const kb=Buffer.from(k.key,'hex');opens.push({id:'xor',fn:h=>Buffer.from(h.map((x,i)=>x^kb[i%kb.length]))});}}
   for(const h of heads){let kind='opaque',via='';for(const o of opens){let x;try{x=o.fn(h);}catch{continue;}const m=magicOf(x);if(m){kind=m;via=o.id;break;}if(structured(x)){kind=d.detect(x).length?'text':'data';via=o.id;break;}}kinds.push([kind,via]);}
   ix.kinds=kinds;}finally{fs.closeSync(fd);}}
 const magicOf=b=>{const t=[['png','89504e47'],['ogg','4f676753'],['riff','52494646'],['jpeg','ffd8ff'],['bmp','424d'],['zip','504b0304'],['psb','50534200'],['tjs2','544a5332'],['zlib','78da'],['zlib','789c'],['zlib','7801'],['utf16','fffe'],['utf8','efbbbf']];const hex=b.subarray(0,4).toString('hex');for(const [n,m] of t)if(hex.startsWith(m))return n;return '';};
 function region({base,bytes,index}){const meta=header.regions[index]||{};out.stats.regions++;out.stats.bytes+=bytes.length;
  if(over()){out.stats.skipped++;out.stats.stop='budget';return;}
  if(meta.type===MEM_IMAGE){if((meta.protect&EXEC)!==0)execRanges.push([base,base+bytes.length]);image(base,bytes,meta);
   if((meta.protect&EXEC)===0&&teaWindows.length<300000&&gate.has('tea'))for(let i=0;i+16<=bytes.length&&teaWindows.length<300000;i+=4){const win=bytes.subarray(i,i+16);if(win.readUInt32LE(0)&&win.readUInt32LE(12)&&d.entropy(win)>=3.5)teaWindows.push(Buffer.from(win));}}
  else heap(base,bytes);}
 return {header:header_,region,finish,get gates(){return [...gate];}};
}

/* bytecode: text runs separated by binary; the bytes before each run, length prefixes, terminators */
function bytecodeShape(win){const {enc,list}=d.targets(win);if(list.length<40)return null;
 /* runs: consecutive characters (2 bytes apart or less) */
 const runs=[];let cur=null;for(const c of list.sort((a,b)=>a.at-b.at)){if(cur&&c.at<=cur.end+2){cur.end=c.at+c.len;cur.n++;}else{if(cur)runs.push(cur);cur={at:c.at,end:c.at+c.len,n:1};}}if(cur)runs.push(cur);
 if(runs.length<12)return null;
 const textBytes=runs.reduce((s,r)=>s+r.end-r.at,0),share=textBytes/win.length;
 let control=0;for(let i=0;i<win.length;i++)if(win[i]<9||win[i]>13&&win[i]<0x20)control++;
 if(share>.9||control<32)return null;
 const before=new Map(),lengths={u8:0,u16le:0,u32le:0},term={nul:0};
 for(const r of runs){if(r.at>=1){const k=win[r.at-1].toString(16).padStart(2,'0');before.set(k,(before.get(k)||0)+1);}
  /* a length field just before the run: the run's byte length up to its terminator */
  let e=r.end;while(e<win.length&&e-r.end<8&&win[e]!==0&&win[e]>=0x20)e++;const len=e-r.at,len0=r.end-r.at;
  if(r.at>=1&&(win[r.at-1]===len||win[r.at-1]===len0||win[r.at-1]===len+1))lengths.u8++;if(r.at>=2&&[len,len0,len+1].includes(win.readUInt16LE(r.at-2)))lengths.u16le++;if(r.at>=4&&[len,len0,len+1].includes(win.readUInt32LE(r.at-4)))lengths.u32le++;
  if(win[e]===0)term.nul++;}
 const top=[...before.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([byte,n])=>({byte,share:Math.round(n/runs.length*100)/100}));
 const lp=Object.entries(lengths).sort((a,b)=>b[1]-a[1])[0],lengthPrefix=lp[1]>=runs.length*.5?lp[0]:null;
 /* the opcode: the byte before the length field (or before the run when there is none) */
 const L={u8:1,u16le:2,u32le:4}[lengthPrefix]||0,ops=new Map();for(const r of runs){const at=r.at-1-L;if(at>=0){const k=win[at].toString(16).padStart(2,'0');ops.set(k,(ops.get(k)||0)+1);}}
 const opcodes=[...ops.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([byte,n])=>({byte,share:Math.round(n/runs.length*100)/100}));
 return {encoding:enc,runs:runs.length,textShare:Math.round(share*100)/100,before:top,opcodes,lengthPrefix,terminator:term.nul>=runs.length*.5?'nul':null};}

/* the stream of native/RuntimeHarvest.exe: header line, then frames; calls onHeader / onRegion. A region reaches the
   scanner whole, or — when larger than window — in windows that overlap by overlap bytes, so a structure across a
   window edge is still seen whole once (big heap segments are common in games) */
function streamParser({onHeader,onRegion,onSummary,window=32<<20,overlap=1<<20}){let pend=[],pendLen=0,gotHeader=false,cur=null;
 const emit=(base,bytes,index)=>{try{onRegion({base,bytes,index});}catch{}};
 const flush=()=>{if(cur&&cur.size){emit(cur.base,cur.parts.length===1?cur.parts[0]:Buffer.concat(cur.parts),cur.index);}cur=null;};
 const take=n=>{/* the first n pending bytes as one buffer */let out;if(pend[0].length>=n){out=pend[0].subarray(0,n);pend[0]=pend[0].subarray(n);if(!pend[0].length)pend.shift();}
  else{const parts=[];let need=n;while(need>0){const p=pend[0];if(p.length<=need){parts.push(p);need-=p.length;pend.shift();}else{parts.push(p.subarray(0,need));pend[0]=p.subarray(need);need=0;}}out=Buffer.concat(parts);}pendLen-=n;return out;};
 const peek=n=>pend[0].length>=n?pend[0].subarray(0,n):Buffer.concat(pend).subarray(0,n);
 return {push(chunk){pend.push(chunk);pendLen+=chunk.length;
  if(!gotHeader){const all=pend.length>1?Buffer.concat(pend):pend[0];const nl=all.indexOf(10);if(nl<0){if(pendLen>8<<20)throw Error('HEADER');pend=[all];return;}let h;try{h=JSON.parse(all.toString('utf8',0,nl));}catch{throw Error('HEADER');}gotHeader=true;pend=[all.subarray(nl+1)];pendLen=pend[0].length;onHeader(h);}
  while(pendLen>=24){const head=peek(24);if(head.toString('latin1',0,4)!=='MLRH')throw Error('FRAME');const kind=head[4],len=head.readUInt32LE(16),index=head.readUInt32LE(20);if(len>(4<<20))throw Error('FRAME');if(pendLen<24+len)break;
   const addr=Number(head.readBigUInt64LE(8));take(24);const data=Buffer.from(take(len));
   if(kind===1){if(cur&&(cur.index!==index||cur.end!==addr))flush();if(!cur)cur={index,base:addr,end:addr,parts:[],size:0};cur.parts.push(data);cur.size+=data.length;cur.end=addr+data.length;
    if(cur.size>=window){const bytes=Buffer.concat(cur.parts);emit(cur.base,bytes,index);const keep=Buffer.from(bytes.subarray(bytes.length-overlap));cur={index,base:cur.end-keep.length,end:cur.end,parts:[keep],size:keep.length};}}
   else if(kind===2){flush();let st={};try{st=JSON.parse(data.toString('utf8'));}catch{}onSummary?.(st);}}},
  end(){flush();}};}

module.exports={createScanner,streamParser,bytecodeShape,fromKnownPlaintext,blowfishState,blowfishStateDecrypt,teaDecrypt,teaDecryptBlock,rot128,structured,CONSTANTS,_internal:{bfConsistent,bfEncrypt,BF}};
