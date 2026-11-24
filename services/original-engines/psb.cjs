// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E282 KiriKiri Z scene files (.scn) are PSB documents (E-mote / M2 binary JSON), sometimes inside an "mdf" zlib wrapper.
// Layout after FreeMote (MIT): a header of offsets, a name trie, a string table and typed values.
const zlib=require('node:zlib');
// Some retail scenes retain a fixed tag in place of magic, version and flags after RiddleCxCrypt. The PSB v3 header size follows it.
const RIDDLE_PSB_V3=Buffer.from('159258f0d266fdec2c000000','hex');
const isRiddlePsb=b=>b.length>=RIDDLE_PSB_V3.length&&b.subarray(0,RIDDLE_PSB_V3.length).equals(RIDDLE_PSB_V3);
function unwrap(buf){
 if(buf.toString('latin1',0,4)==='mdf\0')return zlib.inflateSync(buf.subarray(8));
 return buf;
}
// Errors name the byte the parser could not accept and the values it would have accepted there.
function bad(code,at,range){const e=Error(code+'@'+at);e.at=at;e.range=range;return e;}
// window: only values starting before this offset are read (a quick structural check of the start of the file).
function parse(input,{window=Infinity,tolerant=false}={}){
 const b=unwrap(input),riddle=isRiddlePsb(b);if(!riddle&&b.toString('latin1',0,4)!=='PSB\0')throw bad('PSB_MAGIC',0,null);
 const version=riddle?3:b.readUInt16LE(4);if(!riddle&&(b.readUInt16LE(6)&1))throw Error('PSB_HEADER_ENCRYPTED');
 const u=o=>b.readUInt32LE(o),offNames=u(12),offStrings=u(16),offStringsData=u(20),offEntries=u(36);
 if(offNames>=b.length||offEntries>=b.length||offStrings>=b.length||offStringsData>=b.length)throw bad('PSB_HEADER',12,null);
 const uint=(at,n)=>{let v=0;for(let i=n-1;i>=0;i--)v=v*256+b[at+i];return v;};
 const sint=(at,n)=>{if(!n)return 0;let v=uint(at,n);const top=2**(8*n);if(v>=top/2)v-=top;return v;};
 // Packed array: type 0x0D+k (count in k+1 bytes), then an entry type giving the entry width.
 function array(at){const t=b[at];if(!(t>=0x0d&&t<=0x14))throw bad('PSB_ARRAY',at,[0x0d,0x14]);const cn=t-0x0c,count=uint(at+1,cn),et=b[at+1+cn];
  if(!(et>=0x0d&&et<=0x14))throw bad('PSB_ARRAY',at+1+cn,[0x0d,0x14]);const w=et-0x0c,start=at+2+cn;if(start+count*w>b.length)throw bad('PSB_ARRAY_SIZE',at,null);
  const out=new Array(count);for(let i=0;i<count;i++)out[i]=uint(start+i*w,w);return {values:out,end:start+count*w};}
 const charset=array(offNames),namesData=array(charset.end),nameIndexes=array(namesData.end);
 const names=nameIndexes.values.map(index=>{const chars=[];let chr=namesData.values[index],n=0;while(chr!==0&&chr!==undefined&&n++<256){const code=namesData.values[chr],d=charset.values[code];chars.push((chr-d)&255);chr=code;}return Buffer.from(chars.reverse()).toString('utf8');});
 const stringOffsets=window<Infinity?null:array(offStrings).values,strCache=new Map();
 const str=i=>{if(strCache.has(i))return strCache.get(i);if(i>=stringOffsets.length)throw bad('PSB_STRING',-1,null);const at=offStringsData+stringOffsets[i];const end=b.indexOf(0,at);const s=b.toString('utf8',at,end<0?b.length:end);strCache.set(i,s);return s;};
 const child=(at,depth)=>{if(!tolerant)return value(at,depth);try{return value(at,depth);}catch{damaged++;return undefined;}};let damaged=0;
 function value(at,depth=0){
  if(at>window)return null;
  if(depth>200)throw Error('PSB_DEPTH');const t=b[at];
  if(t===0||t===1)return null;if(t===2)return false;if(t===3)return true;
  if(t>=0x04&&t<=0x0c)return sint(at+1,t-0x04);
  if(t>=0x0d&&t<=0x14)return array(at).values;
  if(t>=0x15&&t<=0x18){if(window<Infinity)return '';const i=uint(at+1,t-0x14);if(i>=stringOffsets.length)throw bad('PSB_STRING',at,null);return str(i);}
  if(t>=0x19&&t<=0x1c)return {resource:uint(at+1,t-0x18)};
  if(t===0x1d)return 0;if(t===0x1e)return b.readFloatLE(at+1);if(t===0x1f)return b.readDoubleLE(at+1);
  if(t===0x20){const offs=array(at+1),base=offs.end;for(const o of offs.values)if(base+o>=b.length)throw bad('PSB_OFFSET',at,null);return offs.values.map(o=>child(base+o,depth+1));}
  if(t===0x21){const keys=array(at+1),offs=array(keys.end),base=offs.end,obj={};if(keys.values.length!==offs.values.length)throw bad('PSB_OBJECT',at,null);
   for(const o of offs.values)if(base+o>=b.length)throw bad('PSB_OFFSET',at,null);keys.values.forEach((k,i)=>{if(k>=names.length)throw bad('PSB_NAME',at,null);obj[names[k]]=child(base+offs.values[i],depth+1);});return obj;}
  if(t>=0x22&&t<=0x25)return {extra:uint(at+1,t-0x21)};
  throw bad('PSB_TYPE',at,[0x00,0x25]);
 }
 const root=value(offEntries);return {version,names,root,damaged};
}
// A decode counts only when the name table is real (printable UTF-8, sorted, unique) and the root is a non-empty object.
function saneNames(n,maxBad=0){
 if(!n.length)return false;let bad=0,prev='';
 for(let i=0;i<n.length;i++){const s=n[i];
  if(!s||/[\x00-\x1f\x7f\ufffd]/.test(s)){if(++bad>maxBad)return false;continue;}
  if(prev&&!(prev<s)){if(++bad>maxBad)return false;continue;}
  if(maxBad&&i+1<n.length&&prev<n[i+1]&&!(s<n[i+1])){if(++bad>maxBad)return false;continue;}
  prev=s;
 }
 return true;
}
// Scene files: scenes is a list (null when it lies past the quick-check window). A wrong boundary inside the root's
// own header points its keys at unrelated values, which this catches.
const sane=(doc,tolerant=false)=>saneNames(doc.names,tolerant&&doc.names.length>=8?Math.min(2,Math.floor(doc.names.length/8)):0)&&!!doc.root&&typeof doc.root==='object'&&!Array.isArray(doc.root)&&Object.keys(doc.root).length>0&&
 (!('scenes' in doc.root)||doc.root.scenes===null||Array.isArray(doc.root.scenes))&&(!('name' in doc.root)||doc.root.name===null||typeof doc.root.name==='string');

// KiriKiri Z "cx" archives (Steam releases with PackinOne / cxdec plug-ins): each file is XORed with one byte up to a
// per-file boundary and another byte after it, and a few single bytes in the first 64 KiB carry an extra XOR. Without
// the game's key the parts are recovered from the document itself: the two bytes from the magic and the empty chunk
// arrays, the boundary from zero-density + the name table and a structural check of the first 72 KiB, and stray bytes
// by trying the values a PSB allows where the check stops (plus header flags / offStrings).
const WINDOW=0x12000;
function check(buf,window=WINDOW,tolerant=false){try{const doc=parse(buf,{window});const hs=(doc.names.includes('scenes')&&doc.names.includes('texts'))?3:doc.names.includes('scenes')?2:1;return sane(doc,tolerant)?{ok:true,at:Infinity,hs}:{ok:false,at:window,hs};}catch(e){return {ok:false,at:e.at??-1,error:e};}}
function decryptCx(raw){
 if(raw.length<0x40)return null;
 let k1=raw[3];
 if((raw[1]^k1)!==0x53||(raw[2]^k1)!==0x42){if((raw[1]^raw[2])===0x11)k1=raw[1]^0x53;else return null;}
 const u=o=>(raw.readUInt32LE(o)^(k1*0x01010101))>>>0;
 const names=u(12),chunk=u(24),entries=u(36);if(names<0x28||entries<=names||chunk+1>=raw.length||entries>=raw.length)return null;
 let k2=raw[chunk+1];
 if(chunk+5<raw.length){const votes=[raw[chunk]^0x0d,k2,raw[chunk+2]^0x0d,raw[chunk+3]^0x0d,raw[chunk+4],raw[chunk+5]^0x0d],cnt=new Map();let top=0;
  for(const v of votes){const c=(cnt.get(v)||0)+1;cnt.set(v,c);if(c>top){top=c;k2=v;}}}
 const buf=Buffer.allocUnsafe(raw.length);for(let i=0;i<raw.length;i++)buf[i]=raw[i]^k2;
 const limit=Math.min(raw.length,entries+0x1000);
 const setSplit=p=>{for(let i=0;i<limit;i++)buf[i]=raw[i]^(i<p?k1:k2);buf[0]=0x50;if((buf[6]&1)&&buf[4]>=1&&buf[4]<=4&&!buf[5]&&!buf[7])buf[6]=0;};
 // Splits inside the name table must decode it into printable, sorted, unique names that end where the entries start.
 const namesOk=p=>{try{const by=i=>i===0?0x50:raw[i]^(i<p?k1:k2);let at=names;const arrs=[];
   for(let a=0;a<3;a++){const t=by(at);if(t<0x0d||t>0x14)return 0;const cn=t-0x0c;let count=0;for(let i=cn-1;i>=0;i--)count=count*256+by(at+1+i);const et=by(at+1+cn);if(et<0x0d||et>0x14)return 0;const w=et-0x0c,st=at+2+cn;if(st+count*w>entries)return 0;const v=new Array(count);for(let i=0;i<count;i++){let x=0;for(let j=w-1;j>=0;j--)x=x*256+by(st+i*w+j);v[i]=x;}arrs.push(v);at=st+count*w;}
   if(at!==entries)return 0;const [cs,nd,ni]=arrs,list=[];
   for(const index of ni){let chr=nd[index],chars=[],n=0;while(chr!==0){if(chr===undefined||n++>128)return 0;const code=nd[chr];if(code===undefined||cs[code]===undefined)return 0;chars.push((chr-cs[code])&255);chr=code;}list.push(Buffer.from(chars.reverse()).toString('utf8'));}
   return saneNames(list)?((list.includes('scenes')&&list.includes('texts'))?3:list.includes('scenes')?2:1):0;}catch{return 0;}};
 const candidates=[],seen=new Set(),add=p=>{if(p>=names&&p<limit&&!seen.has(p)){seen.add(p);candidates.push(p);}};
 let pref=null,peak=names;
 if(k1===k2)add(names);
 else{
  // Zero bytes dominate the name and entry tables: k1->0 before the split and k2->0 after it gives an O(n) peak.
  const span=limit-names;pref=new Int32Array(span+1);let peakScore=0;
  for(let i=0;i<span;i++){const b=raw[names+i],v=pref[i]+(b===k1?1:b===k2?-1:0);pref[i+1]=v;if(v>peakScore){peakScore=v;peak=names+i+1;}}
  const lo=Math.max(names,peak-64),hi=Math.min(limit-1,peak+64),near=[];
  for(let p=lo;p<=hi;p++)near.push(p);
  // Highest zero-density first (never low-to-high, or an early offset with a small k1^k2 shift can look plausible first).
  near.sort((a,b)=>(pref[b-names]-pref[a-names])||(Math.abs(a-peak)-Math.abs(b-peak)));
  const nRanks=new Map();for(const p of near)if(p<=entries){const r=namesOk(p);if(r)nRanks.set(p,r);}
  for(const r of [3,2,1])for(const p of near)if(nRanks.get(p)===r)add(p);
  for(const p of near)add(p);
 }
 let best=null;
 const scoreOf=p=>p<=entries?namesOk(p):3;
 const better=(a,b)=>!b||a.at>b.at||(a.at===b.at&&(a.hs||scoreOf(a.p))>(b.hs||scoreOf(b.p)));
 const tryList=(list,tol)=>{let stale=0;
  for(const p of list){setSplit(p);const f=check(buf,WINDOW,tol);const hs=f.hs??scoreOf(p);
   if(better({p,...f,hs},best)){best={p,...f,hs};stale=0;}else stale++;
   if(f.ok&&hs>=3)return true;
   if(best.at>entries&&best.at<WINDOW&&best.hs>=3&&stale>=8)break;}
  return !!(best&&best.ok&&best.hs>=3);};
 const okFast=tryList(candidates,false);
 if(!okFast&&k1!==k2){
  if(best&&best.at===WINDOW){
   const tol=candidates.find(p=>{setSplit(p);const g=check(buf,WINDOW,true);return g.ok&&g.hs>=3;});
   if(tol!==undefined)best={p:tol,ok:true,at:Infinity,hs:3};
  }
  if(!(best&&best.ok&&best.hs>=3)&&(!best||best.at<=entries||best.at===WINDOW||(best.hs||0)<3)){
   const byRank=[[],[],[]];
   for(let p=names;p<=entries;p++)if(!seen.has(p)){const r=namesOk(p);if(r)byRank[3-r].push(p);}
   for(const a of byRank)a.sort((x,y)=>pref[y-names]-pref[x-names]);
   const allNames=byRank.flat();
   for(const p of allNames)add(p);
   tryList(allNames,false);
  }
  if(!(best&&best.ok)&&(!best||best.at<=entries)){
   const rest=[];for(let p=names;p<limit;p++)if(!seen.has(p))rest.push(p);
   rest.sort((a,b)=>pref[b-names]-pref[a-names]);
   const more=rest.slice(0,128);
   for(const p of more)add(p);
   tryList(more,false);
  }
 }
 const repair=()=>{
  setSplit(best.p);let f=check(buf,WINDOW,true);
  for(let fixes=0;!f.ok&&fixes<6;fixes++){
   const at=f.at;if(!(at>=0)||at>=0x10000)break;
   // A value the parser rejects names its own byte; a wrong count, offset or index is in the few bytes after its type.
   const spots=f.error?.range?[[at,...f.error.range]]:[...Array(12)].map((_,k)=>[at+k,0,255]);let pick=null;
   for(const [pos,lo,hi] of spots){if(pos>=0x10000||pos>=buf.length)continue;const orig=buf[pos];
    for(let v=lo;v<=hi;v++){if(v===orig)continue;buf[pos]=v;const g=check(buf,WINDOW,true);if(g.at>at&&(!pick||g.at>pick.at))pick={pos,v,...g};if(g.ok)break;}
    buf[pos]=orig;if(pick?.ok)break;}
   if(!pick)break;buf[pick.pos]=pick.v;f=pick;
  }
  return f;
 };
 let f=repair();
 if(!f.ok&&best&&best.at===WINDOW){
  const tol=candidates.find(p=>{setSplit(p);return check(buf,WINDOW,true).ok;});
  if(tol!==undefined){best={p:tol,ok:true,at:Infinity};f=repair();}
 }
 // A stray byte in offStrings (16..23) or its array header breaks parsing past WINDOW: verify and repair it in place.
 const stringsOk=()=>{const os=buf.readUInt32LE(16),od=buf.readUInt32LE(20);
  if(os<entries||os>=od||od>buf.length)return false;
  const t=buf[os];if(t<0x0d||t>0x14)return false;const cn=t-0x0c;if(os+2+cn>od)return false;
  let count=0;for(let i=cn-1;i>=0;i--)count=count*256+buf[os+1+i];
  const et=buf[os+1+cn];if(et<0x0d||et>0x14)return false;
  return os+2+cn+count*(et-0x0c)===od;};
 if(!stringsOk()){
  let fixed=false;
  for(const pos of [16,17,18,19,20,21,22,23]){const orig=buf[pos];
   for(let v=0;v<256;v++){if(v===orig)continue;buf[pos]=v;if(stringsOk()){fixed=true;break;}}
   if(fixed)break;buf[pos]=orig;}
  if(!fixed){const os=buf.readUInt32LE(16),od=buf.readUInt32LE(20);
   if(os>=entries&&os<od&&od<=buf.length)for(let pos=os;pos<Math.min(od,os+6);pos++){const orig=buf[pos];
    for(let v=0;v<256;v++){if(v===orig)continue;buf[pos]=v;if(stringsOk()){fixed=true;break;}}
    if(fixed)break;buf[pos]=orig;}}
 }
 // Strays that could not be repaired only cost the values they sit in: the caller parses with tolerant:true.
 return buf;
}
// Decrypted and parsed in one go; null when the file is not a cx-encrypted PSB or nothing sensible comes out.
function openCx(raw){const buf=decryptCx(raw);if(!buf)return null;try{const doc=parse(buf,{tolerant:true});return sane(doc,true)?doc:null;}catch{return null;}}
module.exports={parse,unwrap,decryptCx,openCx,isRiddlePsb};
