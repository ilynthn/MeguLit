// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E602 ShiinaRio WARC 1.2–1.7 decryption, ported from GARbro ArcFormats/ShiinaRio/WarcEncryption.cs (the Decoder class:
   DecryptIndex / Decrypt / Encrypt / Decrypt2 and their helpers, and the IDecryptExtra classes) and the Kogado range
   coder ArcWARC.cs unpacks the 1.2–1.6 index with (morkt, MIT; OpenShiina's WarcRangeDecoder.cpp, kagaminehaku,
   GPL-3.0, read for the model). Checked byte for byte against GARbro 1.5.44's ArcFormats.dll on every scheme of its key
   database (tools/warc-vectors.ps1 → validation/helpers/warc-vectors.json).

   The keys of a title (a "scheme") are in shiinario-schemes.json, stored the way OpenShiina's Formats.Json does:
   SharedData (hex byte arrays several titles share, named "@name"), CommonImages (base64 common parts of the
   ShiinaImages) and per title CryptKey, HelperKey, Region, DecodeBin, ShiinaImage {Common, CommonLength, Tail, Length,
   Sha256} and ExtraCrypt {$type, Seed, Key, DecodeTable, MinLength, PostDataOffset, EncryptedSize}.

   The arithmetic: everything GARbro does in uint is done here as uint32 (>>> 0, Math.imul); its doubles are JS numbers
   (both IEEE-754 binary64 on x64, the same Math.Acos / Log / Exp / Pow / Sin / Cos results over the domains the
   vectors cover: every (a, b) byte pair the cipher can meet); the float casts of DecryptHelper3 go through a
   Float32Array; the 64-bit product of DecryptHelper4 and FILETIME → SYSTEMTIME go through BigInt. */
const crypto=require('node:crypto');

/* ---- small helpers ---------------------------------------------------------------------------------------------- */
const u32=x=>x>>>0;
const rotl=(v,n)=>((v<<n)|(v>>>(32-n)))>>>0,rotr=(v,n)=>((v>>>n)|(v<<(32-n)))>>>0;
const le32=(b,i)=>(b[i]|b[i+1]<<8|b[i+2]<<16|b[i+3]<<24)>>>0,be32=(b,i)=>(b[i]<<24|b[i+1]<<16|b[i+2]<<8|b[i+3])>>>0;
const xor32=(b,i,v)=>{b[i]^=v&255;b[i+1]^=v>>>8&255;b[i+2]^=v>>>16&255;b[i+3]^=v>>>24&255;};
const sbyte=v=>(v&255)<<24>>24;
/* what .NET throws on (an index out of range, a division by zero): the same input fails the same way here */
class Fault extends Error{}
const at=(b,i)=>{if(i<0||i>=b.length)throw new Fault('index');return b[i];};
const put=(b,i,v)=>{if(i<0||i>=b.length)throw new Fault('index');b[i]=v;};
const div=(a,b)=>{if(!b)throw new Fault('divide by zero');return Math.floor(a/b)>>>0;};

const F32=new Float32Array(1),F32U=new Uint32Array(F32.buffer),F32I=new Int32Array(F32.buffer);

/* CRC-32 MSB first (poly 0x04C11DB7, GameRes Crc32Normal: no final XOR) */
const CRC32N=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let c=i<<24>>>0;for(let j=0;j<8;j++)c=(c&0x80000000?(c<<1)^0x04c11db7:c<<1)>>>0;t[i]=c;}return t;})();
function crc32Normal(crc,b,i,n){for(let k=0;k<n;k++)crc=(CRC32N[(crc>>>24)^b[i+k]]^(crc<<8))>>>0;return crc;}
/* GARbro's Crc16: reflected poly 0x8408, starts at 0xFFFF, no final XOR (CRC-16/MCRF4XX) */
const CRC16=(()=>{const t=new Uint16Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?(c>>>1)^0x8408:c>>>1;t[i]=c;}return t;})();
function crc16(b,i,n){let c=0xffff;for(let k=0;k<n;k++)c=CRC16[(c^at(b,i+k))&255]^(c>>>8);return c;}
function adler32(b,i,n){let a=1,s=0;for(let k=0;k<n;k++){a=(a+at(b,i+k))%65521;s=(s+a)%65521;}return (s<<16|a)>>>0;}
/* RegionCrc32's table: rotate right, poly 0x6DB88320 when the bit was 0 */
const REGION_CRC=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let p=i;for(let j=0;j<8;j++){const bit=p&1;p=rotr(p,1);if(!bit)p=(p^0x6db88320)>>>0;}t[i]=p;}return t;})();

/* ---- the scheme data -------------------------------------------------------------------------------------------- */
/* {schemes: [scheme], byName: Map, gameMap: {exe: title}} from shiinario-schemes.json (or a pack's scheme list); every
   byte array resolved, the ShiinaImage put together on first use */
function loadSchemes(json,extra=[]){
 const shared=json.SharedData||{},commons=new Map(),out=[];
 const hex=v=>{if(v==null)return null;if(typeof v!=='string')throw new Error('not a hex string');const t=v.startsWith('@')?shared[v.slice(1)]:v;if(t==null)throw new Error(v+' is not in SharedData');
  if(!/^(?:[0-9a-f]{2})*$/i.test(t))throw new Error('not a hex string');return Buffer.from(t,'hex');};
 const common=name=>{if(!commons.has(name)){const c=json.CommonImages?.[name];if(typeof c!=='string')throw new Error('CommonImages has no '+name);commons.set(name,Buffer.from(c,'base64'));}return commons.get(name);};
 const parse=(e,images)=>{
  const s={name:String(e.Name),title:e.OriginalTitle||'',version:e.Version|0,nameSize:e.EntryNameSize|0,cryptKey:hex(e.CryptKey),
   helperKey:Array.isArray(e.HelperKey)?Uint32Array.from(e.HelperKey,h=>parseInt(String(h).replace(/^0x/i,''),16)>>>0):null,region:hex(e.Region),decodeBin:hex(e.DecodeBin),extra:null,image:null};
  if(!s.name||!(s.nameSize>0&&s.nameSize<=0x100))throw new Error('bad Name / EntryNameSize');if(!s.cryptKey?.length)throw new Error('no CryptKey');
  if(s.helperKey&&s.helperKey.length<5)throw new Error('HelperKey needs 5 values');if(s.region&&s.region.length<9216)throw new Error('Region is 48 x 48 x 4 bytes');
  if(s.decodeBin&&s.decodeBin.length<0x2000)throw new Error('DecodeBin is 0x2000 bytes');
  const img=e.ShiinaImage;
  if(img){let cached=null;s.imageInfo=img;Object.defineProperty(s,'image',{enumerable:true,get(){if(cached)return cached;
   const c=(images||common)(img.Common),n=img.CommonLength==null?c.length:img.CommonLength|0;if(n>c.length)throw new Error('CommonLength past the common part');
   const whole=Buffer.concat([c.subarray(0,n),Buffer.from(img.Tail||'','base64')]);
   if(img.Length!=null&&whole.length!==img.Length)throw new Error('ShiinaImage length');
   if(img.Sha256&&crypto.createHash('sha256').update(whole).digest('hex')!==String(img.Sha256).toLowerCase())throw new Error('ShiinaImage SHA-256');
   return cached=whole;}});}
  if(e.ExtraCrypt){const x=e.ExtraCrypt,type=String(x.$type||'').replace(/^.*\./,'');
   s.extra=extraCrypt(type,{seed:x.Seed,key:x.Key,table:hex(x.DecodeTable),minLength:x.MinLength,postDataOffset:x.PostDataOffset,encryptedSize:x.EncryptedSize});}
  return s;};
 const errors=[];
 for(const e of json.schemes||[]){try{out.push(parse(e));}catch(err){errors.push((e&&e.Name)+': '+err.message);}}
 for(const e of extra){try{out.push(parse(e));}catch(err){errors.push((e&&e.Name)+': '+err.message);}}
 const byName=new Map();for(const s of out)byName.set(s.name,s);
 return {schemes:out,byName,gameMap:{...(json.GameMap||{})},errors,parse:e=>parse(e)};}

/* ---- IDecryptExtra ---------------------------------------------------------------------------------------------- */
/* GARbro's CopyOverlapped: Buffer.BlockCopy in runs no longer than the distance (each run checked before it copies) */
function copyOverlapped(b,src,dst,count){
 const block=(s,d,n)=>{if(s<0||d<0||n<0||s+n>b.length||d+n>b.length)throw new Fault('copy');b.copyWithin(d,s,s+n);};
 if(dst>src){while(count>0){const n=Math.min(dst-src,count);block(src,dst,n);dst+=n;count-=n;}}else block(src,dst,count);}
/* the packed first block (0x718E958D): Dodakure's RLE, Jokers' range code, Binbo's LZ — over a copy of 0x200 bytes */
function blockCopy(input,src,data,dst,n){if(src<0||n<0||src+n>input.length||dst<0||dst+n>data.length)throw new Fault('copy');input.copy(data,dst,src,src+n);}
function xorLength(data,index,length,always){for(let k=0;k<4;k++)if(always||length>0x200+k)put(data,index+0x200+k,data[index+0x200+k]^(length>>>(8*k)&255));}

function extraCrypt(type,p){
 const seed=u32(p.seed||0),table=p.table;
 /* KeyDecryptBase: pre (0x202) / post (0x204) halves, from MinLength on */
 const keyBase=(pre,{minLength=0x400,postDataOffset=0x200}={})=>{const minL=p.minLength??minLength,postAt=p.postDataOffset??postDataOffset;
  const post=(data,index)=>{for(let k=0;k<4;k++){const i=index+postAt+k;put(data,i,data[i]^(seed>>>(8*k)&255));}};
  return {type,decrypt(data,index,length,flags){if(length<minL)return;if((flags&0x202)===0x202)pre(data,index,length);if((flags&0x204)===0x204)post(data,index,length);},
   encrypt(data,index,length,flags){if(length<minL)return;if((flags&0x104)===0x104)post(data,index,length);if((flags&0x102)===0x102)pre(data,index,length);}};};
 const needTable=()=>{if(!table?.length)throw new Error(type+' needs DecodeTable');};
 const keyExtra=(init,size)=>{needTable();const n=p.encryptedSize??size;return keyBase((data,index)=>{const k=init(seed);
  for(let i=0;i<n;i++){const j=(k[3]^(k[3]<<11)^k[0]^((k[3]^(k[3]<<11)^(k[0]>>>11))>>>8))>>>0;k[3]=k[2];k[2]=k[1];k[1]=k[0];k[0]=j;put(data,index+i,data[index+i]^table[j%table.length]);}},
  {postDataOffset:type==='YuruPlusCrypt'?0x204:0x200});};
 const both=(min,flagD,flagE,fn)=>({type,decrypt(d,i,l,f){if(l>=min&&(f&flagD)===flagD)fn(d,i,l);},encrypt(d,i,l,f){if(l>=min&&(f&flagE)===flagE)fn(d,i,l);}});
 const rotateRight=(data,index,n)=>{let sum=0,bit=0;for(let i=0;i<n;i++){const v=at(data,index+i);sum+=v>>1;data[index+i]=(v>>1|bit)&255;bit=v<<7;}put(data,index,(data[index]|bit)&255);return sum;};
 const rotateLeft=(data,index,n)=>{let sum=0,bit=0;for(let i=n-1;i>=0;i--){const v=at(data,index+i);sum+=v&0x7f;data[index+i]=(v<<1|bit)&255;bit=v>>7;}put(data,index+n-1,(data[index+n-1]|bit)&255);return sum;};
 const xorSum=(data,i,sum)=>{put(data,i,data[i]^(sum&255));put(data,i+1,data[i+1]^(sum>>8&255));};
 const counts=(swap,min)=>(data,index,length)=>{if(length<min)return;const n=(length&0x7e)|1;let z=0,ff=0;for(let i=0;i<n;i++){const v=at(data,index+i);if(v===0xff)ff=(ff+1)&255;else if(v===0)z=(z+1)&255;}
  put(data,index+0x100,data[index+0x100]^(swap?ff:z));put(data,index+0x104,data[index+0x104]^(swap?z:ff));};
 const adler=(data,index)=>{const k=adler32(data,index,0xff);for(let j=0;j<4;j++)put(data,index+0x200+j,data[index+0x200+j]^(k>>>(8*j)&255));};
 const notImpl=()=>{throw new Fault('encrypt not implemented');};
 switch(type){
  case 'ShojoMamaCrypt':return keyExtra(k=>Uint32Array.of(k+1,k+4,k+2,k+3),0xff);
  case 'YuruPlusCrypt':return keyExtra(k=>Uint32Array.of(k+4,k+3,k+2,k+1),0x100);
  case 'TestamentCrypt':return keyExtra(k=>Uint32Array.of(k+3,k+2,k+1,k),0xff);
  case 'MakiFesCrypt':needTable();return keyBase((data,index)=>{let k=seed;for(let i=0;i<0x100;i++){k=(Math.imul(0x343fd,k)+0x269ec3)>>>0;put(data,index+i,data[index+i]^table[((k>>>16)&0x7fff)%table.length]);}});
  case 'KeyAdlerCrypt':return keyBase((data,index)=>{const k=adler32(data,index,0x100);for(let j=0;j<4;j++)put(data,index+0x204+j,data[index+0x204+j]^(k>>>(8*j)&255));});
  case 'MajimeCrypt':return {type,decrypt(d,i,l,f){if(l<0x200)return;if((f&0x202)===0x202)xorSum(d,i+0x104,rotateRight(d,i,0x100));},encrypt(d,i,l,f){if(l<0x200)return;if((f&0x102)===0x102)xorSum(d,i+0x104,rotateLeft(d,i,0x100));}};
  case 'NyaruCrypt':return {type,decrypt(d,i,l,f){if(l<0x200)return;if((f&0x204)===0x204)xorSum(d,i+0x100,rotateRight(d,i,0x100));},encrypt(d,i,l,f){if(l<0x200)return;if((f&0x104)===0x104)xorSum(d,i+0x100,rotateLeft(d,i,0x100));}};
  case 'AlcotCrypt':return both(0x400,0x204,0x104,(d,i,l)=>{const sum=crc16(d,i,(l&0x7e)|1)^0xffff;xorSum(d,i+0x104,sum);});
  case 'PostAdlerCrypt':return both(0x400,0x204,0x104,adler);
  case 'PreAdlerCrypt':return both(0x400,0x202,0x102,adler);
  case 'CountCrypt':return both(0,0x204,0x104,counts(false,0x200));
  case 'AltCountCrypt':return both(0,0x204,0x104,counts(true,0x400));
  case 'UshimitsuCrypt':{const key=u32(p.key);if(p.key==null)throw new Error('UshimitsuCrypt needs Key');return both(0,0x204,0x104,(d,i,l)=>{if(l<0x100)return;for(let k=0;k<0x40;k++){if(i+4*k+4>d.length)throw new Fault('index');xor32(d,i+4*k,key);}});}
  case 'DodakureCrypt':return {type,encrypt(d,i,l,f){if(l>=0x200&&(f&0x104)===0x104)notImpl();},decrypt(data,index,length,flags){if(length<0x200||(flags&0x204)!==0x204)return;
   if(index+4<=data.length&&le32(data,index)===0x718e958d){const input=Buffer.alloc(0x200);blockCopy(data,index,input,0,0x200);let remaining=input.readInt32LE(8),src=12,dst=index,rle=false;
    while(remaining>0){const count=at(input,src++);if(rle){const v=at(data,dst-1);for(let i=0;i<count;i++)put(data,dst++,v);}else{blockCopy(input,src,data,dst,count);src+=count;dst+=count;}remaining-=count;if(count<0xff)rle=!rle;}}
   xorLength(data,index,length,false);}};
  case 'JokersCrypt':return {type,encrypt(d,i,l,f){if(l>=0x400&&(f&0x104)===0x104)notImpl();},decrypt(data,index,length,flags){if(length<0x400||(flags&0x204)!==0x204)return;
   if(index+4<=data.length&&le32(data,index)===0x718e958d){const input=Buffer.alloc(0x200);blockCopy(data,index,input,0,0x200);const remaining=input.readInt32LE(8);let src=12;
    const hi=new Uint32Array(0x100),lo=new Uint32Array(0x101);for(let i=0;i<0x100;i++){const v=input[src++];hi[i]=v;lo[i+1]=v+lo[i];}
    const denominator=lo[0x100],symbols=new Uint8Array(denominator);for(let i=0;i<0x100;i++)symbols.fill(i,lo[i],lo[i+1]);
    let low=0,high=0xffffffff,current=be32(input,src);src+=4;
    for(let i=0;i<remaining;i++){const range=div(high,denominator),t=div(u32(current-low),range);if(t>=symbols.length)throw new Fault('index');const symbol=symbols[t];
     put(data,index+i,symbol);low=u32(low+Math.imul(lo[symbol],range));high=Math.imul(hi[symbol],range)>>>0;
     while(((low^u32(high+low))&0xff000000)===0){low=u32(low<<8);high=u32(high<<8);current=u32(current<<8|at(input,src++));}
     while(high<0x10000){low=u32(low<<8);high=u32(0x1000000-(low&0xffff00));current=u32(current<<8|at(input,src++));}}}
   xorLength(data,index,length,true);}};
  case 'BinboCrypt':return {type,encrypt(d,i,l,f){if(l>=0x200&&(f&0x104)===0x104)notImpl();},decrypt(data,index,length,flags){if(length<0x200||(flags&0x204)!==0x204)return;
   if(index+4<=data.length&&le32(data,index)===0x718e958d){const input=Buffer.alloc(0x200);blockCopy(data,index,input,0,0x200);let src=8,bits=0,count=0,dst=index;
    const fill=()=>{if(src+4>input.length)throw new Fault('index');bits=le32(input,src);src+=4;count=32;};
    const bit=()=>{const v=bits>>>--count;if(count<=0)fill();return v&1;};
    fill();
    while(src<input.length){if(bit()){put(data,dst++,at(input,src++));continue;}let n,offset;
     if(bit()){if(src+2>input.length)throw new Fault('index');n=input.readUInt16LE(src);src+=2;offset=n>>3|-0x2000;n&=7;if(n>0)n+=2;else{n=at(input,src++);if(!n)break;n+=9;}}
     else{n=bit()<<1;n|=bit();n+=2;offset=at(input,src++)|-0x100;}
     copyOverlapped(data,dst+offset,dst,n);dst+=n;}}
   xorLength(data,index,length,false);}};
  default:throw new Error('ExtraCrypt '+type+' is not known');}}

/* ---- the Decoder ------------------------------------------------------------------------------------------------ */
/* Si(a), the sine integral, as the engine computes it (series below 18, the asymptotic pair above) */
function helper1(a){
 if(a<0)return -helper1(-a);
 let v0,v1;
 if(a<18.0){v0=a;v1=a;const v2=-(a*a);for(let j=3;j<1000;j+=2){v1*=v2/(j*(j-1));v0+=v1/j;if(v0===v2)break;}return v0;}
 let flags=0,v0l=0,v1l=0,v1h=2.0,v0h=2.0,d=1/a,i=0;v0=0;v1=0;
 do{v0+=d;d*=++i/a;if(v0<v0h)v0h=v0;else flags|=1;
  v1+=d;d*=++i/a;if(v1<v1h)v1h=v1;else flags|=2;
  v0-=d;d*=++i/a;if(v0>v0l)v0l=v0;else flags|=4;
  v1-=d;d*=++i/a;if(v1>v1l)v1l=v1;else flags|=8;}while(flags!==0xf);
 return ((Math.PI-Math.cos(a)*(v0l+v0h))-(Math.sin(a)*(v1l+v1h)))/2.0;}
/* the angle of (a, b) in degrees, 0 … 360. .NET's Math.Acos (the CRT's) is not V8's in the last bits for some ratios:
   the pairs where GARbro's token differs are in shiinario-acos.json (tools/warc-acos-fix.cjs), as ulps to add. a and b
   are bytes (-128 … 127 signed, 0 … 255 for WARC 1.2), so the table covers every pair the cipher can meet. */
let ACOS_FIX=null;
const acosFix=()=>{if(!ACOS_FIX){ACOS_FIX=new Map();try{for(const e of require('./shiinario-acos.json').fix.split(' ')){const [k,d]=e.split(':');ACOS_FIX.set(parseInt(k,36),Number(d));}}catch{}}return ACOS_FIX;};
const TOKEN_BITS=new DataView(new ArrayBuffer(8));
function token(a,b){let t=0.0;if((a|b)!==0){t=Math.acos(a/Math.sqrt(a*a+b*b));t=t/Math.PI*180.0;}if(b<0)t=360.0-t;
 const d=a>=-128&&a<256&&b>=-128&&b<256?acosFix().get((a+128)*384+(b+128)):undefined;
 if(d){TOKEN_BITS.setFloat64(0,t);TOKEN_BITS.setBigInt64(0,TOKEN_BITS.getBigInt64(0)+BigInt(d));t=TOKEN_BITS.getFloat64(0);}
 return t;}
function helper3(key){
 F32[0]=1.5*(key&255)+0.1;const v0=((F32U[0]&255)<<24|(F32U[0]>>>8&255)<<16|(F32U[0]>>>16&255)<<8|F32U[0]>>>24)>>>0;
 F32[0]=1.5*(key>>>8&255)+0.1;const v1=Math.trunc(F32[0])>>>0;
 F32[0]=1.5*(key>>>16&255)+0.1;const v2=(-F32I[0])>>>0;
 F32[0]=1.5*(key>>>24)+0.1;const v3=(~F32U[0])>>>0;
 return ((v0+v1)|(v2-v3))>>>0;}
function regionCrc32(src,flags,rgb){
 let srcAlpha=flags&0x1ff,dstAlpha=(flags>>>12)&0x1ff;flags>>>=24;if(!(flags&0x10))dstAlpha=0;if(!(flags&8))srcAlpha=0x100;
 let yStep=0,xStep=4,pos=0;const width=48;
 if(flags&0x40){yStep+=width;pos+=(width-1)*4;xStep=-xStep;}
 if(flags&0x20){yStep-=width;pos+=width*0x2f*4;}
 yStep<<=3;let sum=0;
 for(let y=0;y<48;y++){for(let x=0;x<48;x++){const alpha=(src[pos+3]*srcAlpha)>>8;let color=rgb;
   for(let i=0;i<3;i++){const v=src[pos+i];let c=color&0xff;c-=v;c=(c*dstAlpha)>>8;c=(c+v)&0xff;c=(c*alpha)>>8;sum=((sum>>>8)^REGION_CRC[(c^sum)&0xff])>>>0;color>>>=8;}
   pos+=xStep;}pos+=yStep;}
 return sum;}
/* FILETIME (100 ns since 1601) → the SYSTEMTIME fields the engine takes */
function systemTime(high,low){const ms=Number(((BigInt(high>>>0)<<32n)|BigInt(low>>>0))/10000n),d=new Date(ms-11644473600000);
 return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,hour:d.getUTCHours(),minute:d.getUTCMinutes(),second:d.getUTCSeconds(),ms:d.getUTCMilliseconds()};}

function decoder(warcVersion,scheme){
 const s=scheme,schemeVersion=s.version|0;let rand=0;
 const next=()=>(rand=(Math.imul(1566083941,rand)+1)>>>0);
 const maxIndexLength=(s.nameSize+0x18)*(warcVersion<150||schemeVersion<2310?8192:16384);
 function helper2(a){let v0,v1,v2,v3;
  if(a>1.0){v0=Math.sqrt(a*2-1);
   for(;;){v1=1-next()/4294967296.0;v2=2.0*next()/4294967296.0-1.0;if(v1*v1+v2*v2>1.0)continue;
    v2/=v1;v3=v2*v0+a-1.0;if(v3<=0)continue;
    v1=(a-1.0)*Math.log(v3/(a-1.0))-v2*v0;if(v1<-50.0)continue;
    if(next()/4294967296.0<=Math.exp(v1)*(v2*v2+1.0))break;}}
  else{v0=Math.exp(1.0)/(a+Math.exp(1.0));
   do{v1=next()/4294967296.0;v2=next()/4294967296.0;if(v1<v0){v3=Math.pow(v2,1.0/a);v1=Math.exp(-v3);}else{v3=1.0-Math.log(v2);v1=Math.pow(v3,a-1.0);}}
   while(next()/4294967296.0>=v1);}
  return warcVersion>120?(v3*256.0)>>>0:((next()/4294967296.0)&255);}
 function helper4(data,index){
  const buf=new Uint32Array(0x50);let i;for(i=0;i<0x10;i++)buf[i]=be32(data,index+40+4*i);
  for(;i<0x50;i++)buf[i]=rotl((buf[i-16]^buf[i-14]^buf[i-8]^buf[i-3])>>>0,1);
  const key=new Uint32Array(10);key.set(s.helperKey.subarray(0,5));let [k0,k1,k2,k3,k4]=key;
  for(let n=0;n<0x50;n++){let f,c;
   if(n<0x10){f=k1^k2^k3;c=0;}else if(n<0x20){f=(k1&k2)|(k3&~k1);c=0x5a827999;}else if(n<0x30){f=k3^(k1|~k2);c=0x6ed9eba1;}
   else if(n<0x40){f=(k1&k3)|(k2&~k3);c=0x8f1bbcdc;}else{f=k1^(k2|~k3);c=0xa953fd4e;}
   const nk0=(buf[n]+k4+(f>>>0)+c+rotl(k0,5))>>>0,nk2=rotr(k1,2);k1=k0;k4=k3;k3=k2;k2=nk2;k0=nk0;}
  key[0]+=k0;key[1]+=k1;key[2]+=k2;key[3]+=k3;key[4]+=k4;
  const t=systemTime(key[0]&0x7fffffff,key[1]);
  key[5]=(t.year|t.month<<16)>>>0;key[7]=(t.hour|t.minute<<16)>>>0;key[8]=(t.second|t.ms<<16)>>>0;
  let flags=(le32(data,index+40)|0x80000000)>>>0;const rgb=buf[1]>>>8;if(!(flags&0x78000000))flags=(flags|0x98000000)>>>0;
  key[6]=regionCrc32(s.region,flags,rgb);
  key[9]=Number(BigInt.asUintN(32,(BigInt(key[2]|0)*BigInt(key[3]|0))>>8n));
  if(schemeVersion>=2390)key[6]+=key[9];
  for(i=0;i<10;i++)xor32(data,index+4*i,key[i]);}
 function content(decrypt,x,data,index,length){const key=s.cryptKey,kl=key.length;let n=0;
  for(let i=2;i<length;i++){let d=data[index+i];
   if(decrypt){if(warcVersion>120)d^=(next()/16777216.0)&255;d=((d>>1)|(d<<7))&255;d^=key[n++]^key[x];data[index+i]=d;x=d%kl;}
   else{const k=key[n++]^key[x];x=d%kl;d^=k;d=((d<<1)|(d>>7))&255;if(warcVersion>120)d^=(next()/16777216.0)&255;data[index+i]=d;}
   if(n>=kl)n=0;}}
 function run(decrypt,data,index,length){
  length>>>=0;if(length<3||warcVersion<120)return;
  let eff=Math.min(length,1024),a,b,fac=0;rand=length;
  if(warcVersion>120){a=sbyte(data[index])^sbyte(length);b=sbyte(data[index+1])^sbyte(Math.floor(length/2));
   if(length!==maxIndexLength&&(warcVersion>130||schemeVersion>2150)){const img=s.image;if(!img)throw new Error(s.name+' has no ShiinaImage');
    const idx=Math.trunc(next()*(img.length/4294967296.0));
    if(warcVersion>=160){fac=(rand+img[idx])>>>0;fac=(helper3(fac)&0xfffffff)>>>0;if(eff>0x80&&schemeVersion>2350){helper4(data,index+4);index+=0x80;eff-=0x80;}}
    else if(warcVersion===150){fac=(rand+img[idx])>>>0;fac=(fac^Math.imul(fac&0xfff,fac&0xfff))>>>0;let v=0;for(let i=0;i<32;i++){const bit=fac&1;fac>>>=1;if(bit)v=(v+fac)>>>0;}fac=v;}
    else if(warcVersion===140)fac=img[idx];
    else if(warcVersion===130)fac=img[idx&0xff];}}
  else{a=data[index];b=data[index+1];}
  rand=(rand^((helper1(a)*100000000.0)>>>0))>>>0;
  const x=((fac+(helper2(token(a,b))&255))>>>0)%s.cryptKey.length;
  content(decrypt,x,data,index,eff);}
 function xorIndex(offset,index){const n=index.length>>2;for(let i=0;i<n;i++)xor32(index,4*i,offset>>>0);if(warcVersion>=170){const k=~warcVersion&255;for(let i=0;i<index.length;i++)index[i]^=k;}}
 return {warcVersion,schemeVersion,maxIndexLength,nameSize:s.nameSize,extra:s.extra,scheme:s,
  decrypt:(data,index,length)=>run(true,data,index,length),encrypt:(data,index,length)=>run(false,data,index,length),
  decryptIndex(offset,index){run(true,index,0,index.length);xorIndex(offset,index);},
  encryptIndex(offset,index){xorIndex(offset,index);run(false,index,0,index.length);},
  decrypt2(data,index,length){if(length<0x400||!s.decodeBin)return;const crc=crc32Normal(0xffffffff,data,index,0x100);index+=0x100;
   for(let i=0;i<0x40;i++){const src=le32(s.decodeBin,le32(data,index)&0x1ffc),key=(src^crc)>>>0;for(let k=0;k<4;k++){data[index+0x100]^=key>>>(8*k)&255;index++;}}},
  helper1,helper2,helper3,token,get rand(){return rand;},set rand(v){rand=v>>>0;}};}

/* ---- the 1.2–1.6 index: Kogado's range coder, quasistatic model of 257 symbols (256 = end), totals of 2^12 ----- */
const RC_SYMBOLS=257,RC_BITS=12,RC_TOTAL=1<<RC_BITS,RC_RESCALE=2000,RC_END=256;
function rangeModel(){
 const cf=new Uint32Array(RC_SYMBOLS+1),newf=new Uint32Array(RC_SYMBOLS);cf[RC_SYMBOLS]=RC_TOTAL;
 const m={cf,newf,rescale:RC_SYMBOLS>>4|2,nextleft:0,left:0,incr:0};
 const each=Math.floor(RC_TOTAL/RC_SYMBOLS),end=RC_TOTAL%RC_SYMBOLS;for(let i=0;i<RC_SYMBOLS;i++)newf[i]=each+(i<end?1:0);
 m.dorescale=()=>{if(m.nextleft){m.incr++;m.left=m.nextleft;m.nextleft=0;return;}
  if(m.rescale<RC_RESCALE){m.rescale<<=1;if(m.rescale>RC_RESCALE)m.rescale=RC_RESCALE;}
  let c=cf[RC_SYMBOLS],missing=c;for(let i=RC_SYMBOLS-1;i;i--){const t=newf[i];c-=t;cf[i]=c;const h=t>>1|1;missing-=h;newf[i]=h;}
  newf[0]=newf[0]>>1|1;missing-=newf[0];m.incr=Math.floor(missing/m.rescale);m.nextleft=missing%m.rescale;m.left=m.rescale-m.nextleft;};
 m.symbol=t=>{let lo=0,hi=RC_SYMBOLS;while(hi-lo>1){const mid=(lo+hi)>>1;if(t<cf[mid])hi=mid;else lo=mid;}return lo;};
 m.update=sym=>{if(m.left<=0)m.dorescale();m.left--;newf[sym]+=m.incr;};
 m.dorescale();return m;}
/* the decoded bytes (at most max), or null where GARbro's UnpackRNG gives 0 */
function rangeDecode(input,length=input.length,max=1<<24){
 length=Math.min(length,input.length);const m=rangeModel(),out=[];let pos=0,low=0,range=0,help=0,buffer=0;
 const take=()=>{if(pos>=length){buffer=0;return false;}buffer=input[pos++];return true;};
 const normalize=()=>{while(range<=0x800000){low=((low<<8)|((buffer<<7)&0xff))>>>0;if(!take())return;low=(low|(buffer>>>1))>>>0;range=(range<<8)>>>0;}};
 take();take();low=buffer>>>1;range=1<<7;
 const narrow=(start,size)=>{const below=Math.imul(help,start)>>>0;low=(low-below)>>>0;if(start+size<RC_TOTAL)range=Math.imul(help,size)>>>0;else range=(range-below)>>>0;};
 while(pos<length){normalize();help=range>>>RC_BITS;if(!help)return null;const tq=Math.floor(low/help),t=(tq>>>RC_BITS)?RC_TOTAL-1:tq;
  const sym=m.symbol(t);if(sym===RC_END)break;if(out.length>=max)return null;out.push(sym);narrow(m.cf[sym],m.cf[sym+1]-m.cf[sym]);m.update(sym);}
 return Buffer.from(out);}
/* the matching encoder (Schindler's rangecod, carry with "help" bytes): builds test archives */
function rangeEncode(data){
 const m=rangeModel(),out=[];let low=0,range=0x80000000,buffer=0,help=0,bytecount=0;
 const normalize=()=>{while(range<=0x800000){
  if(low<(0xff<<23)>>>0){out.push(buffer);for(;help;help--)out.push(0xff);buffer=(low>>>23)&255;}
  else if(low&0x80000000){out.push((buffer+1)&255);for(;help;help--)out.push(0);buffer=(low>>>23)&255;}
  else help++;
  range=(range<<8)>>>0;low=((low<<8)&0x7fffffff)>>>0;bytecount++;}};
 const encode=(sy,lt)=>{normalize();const r=range>>>RC_BITS,t=Math.imul(r,lt)>>>0;low=(low+t)>>>0;if((lt+sy)>>RC_BITS)range=(range-t)>>>0;else range=Math.imul(r,sy)>>>0;};
 for(const sym of [...data,RC_END]){encode(m.cf[sym+1]-m.cf[sym],m.cf[sym]);if(sym!==RC_END)m.update(sym);}
 normalize();bytecount+=5;let t=(low&0x7fffff)<((bytecount&0xffffff)>>>1)?low>>>23:(low>>>23)+1;
 if(t>0xff){out.push((buffer+1)&255);for(;help;help--)out.push(0);}else{out.push(buffer);for(;help;help--)out.push(0xff);}
 out.push(t&255,(bytecount>>>16)&255,(bytecount>>>8)&255,bytecount&255);
 return Buffer.from(out);}

module.exports={loadSchemes,extraCrypt,decoder,rangeDecode,rangeEncode,helper1,helper3,token,regionCrc32,crc16,crc32Normal,adler32,systemTime,Fault};
