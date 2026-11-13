'use strict';
/* E585–E591 synthetic files for Tmr-Hiro, NekoSDK, Ikura GDL, ExHIBIT, EAGLS, Seraph and Interheart FPK, written as the readers'
   header comments describe the formats (see engine-fixtures.cjs for the shared encoders). Where a cipher is its own inverse
   (the XOR key streams) the fixture reuses the kit's generator, so those tests prove the layout, not the generator. */
const zlib=require('node:zlib');
const kit=require('../../services/original-engines/kit.cjs');
const {sjis,gbk}=require('./engine-fixtures.cjs');
const u16=v=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;},u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;};
const cstr=(s,enc,n)=>{const b=Buffer.alloc(n);enc(s).copy(b);return b;};
const literals=(data,flagAll=0xff)=>{const out=[];for(let i=0;i<data.length;i+=8){out.push(Buffer.from([flagAll]),data.subarray(i,i+8));}return Buffer.concat(out);};

/* ---- Tmr-Hiro (E585) ------------------------------------------------------------------------------------------ */
/* records: [[opcode, payload Buffer]] -> decoded .srp (i32 count, {u16 length, u32 opcode, payload}) */
function srp(records){const parts=[u32(records.length)];for(const [op,payload] of records)parts.push(u16(4+payload.length),u32(op),payload);return Buffer.concat(parts);}
const HEADER=[0x140050,Buffer.from([1,2])];
const tmrMsg=(text,{name,voice,enc=sjis}={})=>[0x150050,enc([name,text,voice].filter(x=>x!==undefined).join(','))];
const tmrChoice=(choices,enc=sjis)=>[0x140010,Buffer.concat([Buffer.from([0,0,0]),enc(choices.map(([c,l])=>' d'+c+','+l).join(''))])];
/* a no-magic .pac: names n bytes, version 1 (u32 offsets) or 2 (i64 offsets); script payloads nibble-swapped */
function tmrPac(files,{version=1,nameLen=16,swap=true}={}){const names=Object.keys(files),count=names.length,rec=nameLen+(version===1?8:12),data=7+rec*count;
 const bodies=names.map(n=>{const b=files[n];if(!swap||!b.slice)return b;const recs=require('../../services/original-engines/tmrhiro.cjs').walk(b);const o=Buffer.from(b);for(const r of recs)for(let i=r.at;i<r.end;i++)o[i]=((o[i]<<4)|(o[i]>>>4))&255;return o;});
 const head=Buffer.alloc(7);head.writeInt16LE(count,0);head[2]=nameLen;head.writeUInt32LE(data,3);const idx=[];let off=0;
 names.forEach((n,i)=>{const e=Buffer.alloc(rec);e.write(n,0,'latin1');if(version===1){e.writeUInt32LE(off,nameLen);e.writeUInt32LE(bodies[i].length,nameLen+4);}else{e.writeBigInt64LE(BigInt(off),nameLen);e.writeUInt32LE(bodies[i].length,nameLen+8);}idx.push(e);off+=bodies[i].length;});
 return Buffer.concat([head,...idx,...bodies]);}

/* ---- NekoSDK (E586) -------------------------------------------------------------------------------------------- */
const NSHOW=sjis('[テキスト表示]'),NLOG=sjis('[ログ追加]');
const nStr=b=>Buffer.concat([u32(b.length+1),b,Buffer.from([0])]);
/* items: [{say, name}] -> ADVSCRIPT2 bytes (a log command repeats each line, an unknown command sits between) */
function advscript2(items,{enc=sjis,nulInLen=true}={}){const parts=[Buffer.from('NEKOSDK_ADVSCRIPT2','latin1')];
 for(const it of items){parts.push(u32(NSHOW.length+(nulInLen?1:0)),NSHOW,...(nulInLen?[Buffer.from([0])]:[]),nStr(enc(it.name||'')),nStr(enc(it.say)));
  parts.push(u32(NLOG.length+1),NLOG,Buffer.from([0]),nStr(enc(it.name||'')),nStr(enc(it.say)));}
 return Buffer.concat(parts);}
function nekoPak(files,{mode='A'}={}){const names=Object.keys(files),bodies=names.map(n=>{const z=zlib.deflateSync(files[n]),size=z.length+4,b=Buffer.concat([z,u32(files[n].length)]);let key=Math.floor(size/8)+0x22;for(let i=0;i<4;i++){b[i]^=key&255;key=(key<<3)>>>0;}return b;});
 const nameBuf=names.map(n=>Buffer.concat([sjis(n),Buffer.from([0])])),idxLen=nameBuf.reduce((a,b)=>a+4+b.length+8,0),start=mode==='A'?14:10,dataAt=start+idxLen+(mode==='A'?0:12);
 const idx=[];let off=dataAt;names.forEach((n,i)=>{let key=0;for(const c of nameBuf[i])key+=c<<24>>24;idx.push(u32(nameBuf[i].length),nameBuf[i],u32(off^key),u32(bodies[i].length^key));off+=bodies[i].length;});
 const head=Buffer.alloc(14);head.write('NEKOPACK4'+mode,'latin1');head.writeUInt32LE(idxLen,10);
 return Buffer.concat([mode==='A'?head:head.subarray(0,10),...idx,...(mode==='S'?[Buffer.alloc(12)]:[]),...bodies]).subarray(0);}
function nekoDat(files,{packed=[]}={}){const names=Object.keys(files),first=(names.length+1)*0x8c,idx=[],bodies=[];let off=first;
 for(const n of names){const raw=files[n],pk=packed.includes(n),body=pk?literals(raw):raw,e=Buffer.alloc(0x8c);e.write(n,0,'latin1');e.writeUInt32LE(((pk?raw.length:0)^0xcacaca)>>>0,0x80);e.writeUInt32LE(body.length^0xcacaca,0x84);e.writeUInt32LE(off^0xcacaca,0x88);idx.push(e);bodies.push(body);off+=body.length;}
 return Buffer.concat([...idx,Buffer.alloc(0x8c),...bodies]);}

/* ---- Ikura GDL (E587) ------------------------------------------------------------------------------------------- */
/* ops: [[opcode, payload]] -> isf: u32 code start (8), u16 version, key, then the records, ror2 inverse (rol 2) applied */
function isf(ops,{version=0x9795,secret=false}={}){const recs=ops.map(([op,p])=>{const total=p.length+2;return total<0x80?Buffer.concat([Buffer.from([op,total]),p]):Buffer.concat([Buffer.from([op,0x80|((p.length+3)>>8),(p.length+3)&255]),p]);});
 const head=Buffer.alloc(8);head.writeUInt32LE(8,0);head.writeUInt16LE(version,4);head[6]=0x5a;const body=Buffer.concat(recs);
 for(let i=0;i<body.length;i++)body[i]=version===0xd197?~body[i]&255:version===0xce89?body[i]^0x5a:((body[i]<<2)|(body[i]>>>6))&255;
 return Buffer.concat([head,body,...(secret?[Buffer.from('SECRETFILTER100a','latin1')]:[])]);}
const pm=(text,{enc=sjis,voice,name}={})=>[0x2b,Buffer.concat([Buffer.from([0,0x03]),...(name!==undefined?[Buffer.from([0x04,name])]:[]),...(voice?[Buffer.from([0x13]),Buffer.from(voice+'\0','latin1')]:[]),Buffer.from([0x08,1,0,0,0,0xff]),enc(text),Buffer.from([0])])];
function mpx(files){const names=Object.keys(files),head=Buffer.alloc(0x20);head.write('SM2MPX10','latin1');head.writeInt32LE(names.length,8);head.writeUInt32LE(names.length*20,12);let off=0x20+20*names.length;const idx=[];
 for(const n of names){const e=Buffer.alloc(20);e.write(n,0,'latin1');e.writeUInt32LE(off,12);e.writeUInt32LE(files[n].length,16);idx.push(e);off+=files[n].length;}return Buffer.concat([head,...idx,...names.map(n=>files[n])]);}
function drs(files){const names=Object.keys(files),dir=16*(names.length+1);let off=dir+2;const idx=[];
 for(const n of names){const e=Buffer.alloc(16);e.write(n,0,'latin1');e.writeUInt32LE(off,12);idx.push(e);off+=files[n].length;}
 const end=Buffer.alloc(16);end.write('END',0,'latin1');end.writeUInt32LE(off,12);const h=Buffer.alloc(2);h.writeUInt16LE(dir,0);return Buffer.concat([h,...idx,end,...names.map(n=>files[n])]);}

/* ---- ExHIBIT (E588) -------------------------------------------------------------------------------------------- */
/* ins: [{op, ints:[...], strs:[Buffer]}] -> rld (plain, or encrypted with a seed) */
function rld(ins,{seed=null,enc=sjis}={}){const parts=[];for(const i of ins){const strs=i.strs.map(s=>Buffer.isBuffer(s)?s:enc(s));const w=(i.op&0xffff)|((i.ints.length&0xff)<<16)|((strs.length&0xf)<<24);
  parts.push(u32(w),...i.ints.map(v=>{const b=Buffer.alloc(4);b.writeInt32LE(v);return b;}),...strs.flatMap(s=>[s,Buffer.from([0])]));}
 const body=Buffer.concat(parts),head=Buffer.alloc(0x114);head.write('\0DLR','latin1');head.writeUInt32LE(1,4);head.writeUInt32LE(0x114,8);head.writeUInt32LE(ins.length,12);
 const file=Buffer.concat([head,body]);return seed===null?file:require('../../services/original-engines/exhibit.cjs').crypt(file,seed);}
const rldSay=(label,text,enc=sjis)=>({op:0x1c,ints:[1,0,0,0,0,0,0],strs:[enc(label),enc(text)]});
const rldChoice=(list,enc=sjis)=>({op:0x15,ints:[],strs:[...list.map(c=>enc(c)),...Array(10-list.length).fill(Buffer.from('*'))]});

/* ---- EAGLS (E589) ---------------------------------------------------------------------------------------------- */
const IDX_KEY='1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik,9ol.0p;/-@:^[]';
/* files: {name: Buffer} -> {pak, idx}; idx 280000 bytes (28-byte entries) encrypted with key (default the stock one) */
function scpack(files,{key=IDX_KEY,seed=0x1234abcd,long=false}={}){const names=Object.keys(files),size=long?40:28,idx=Buffer.alloc(10000*size+4);let off=0x100;const bodies=[];
 names.forEach((n,i)=>{const p=i*size;idx.write(n,p,'latin1');if(long){idx.writeBigInt64LE(BigInt(off),p+0x18);idx.writeUInt32LE(files[n].length,p+0x20);}else{idx.writeUInt32LE(off,p+0x14);idx.writeUInt32LE(files[n].length,p+0x18);}off+=files[n].length;bodies.push(files[n]);});
 idx.writeInt32LE(seed,10000*size);const rnd=kit.msvcRand(seed>>>0);for(let i=0;i<10000*size;i++)idx[i]^=key.charCodeAt(rnd()%key.length);
 return {pak:Buffer.concat(bodies),idx};}
/* lines: script text lines (CRLF joined) -> a .dat: 3600-byte label table, encrypted text, NUL, seed byte */
function eaglsDat(lines,{enc=sjis,seedByte=0x6b,encrypt=true}={}){const label=Buffer.alloc(3600);label.write('$start',0,'latin1');
 const body=Buffer.concat([enc(lines.join('\r\n')+'\r\n'),Buffer.from([0,seedByte])]);const out=Buffer.concat([label,body]);
 if(!encrypt)return out;const K='EAGLS_SYSTEM',rnd=kit.msvcRand((seedByte<<24>>24)>>>0);for(let i=3600;i<out.length-2;i+=2)out[i]^=K.charCodeAt(rnd()%K.length);return out;}

/* ---- Seraph (E590) --------------------------------------------------------------------------------------------- */
function lzPack(data){const out=[u32(data.length)];for(let i=0;i<data.length;i+=128){const c=data.subarray(i,i+128);out.push(Buffer.from([c.length-1]),c);}return Buffer.concat(out);}
function scnpac(entries){const count=entries.length;let off=4+4*(count+1);const offs=[];for(const e of entries){offs.push(off);off+=e.length;}offs.push(off);
 return Buffer.concat([u32(count),...offs.map(u32),...entries]);}

/* ---- Interheart FPK (E591) ------------------------------------------------------------------------------------- */
function zlc2(data){const out=[Buffer.from('ZLC2','latin1'),u32(data.length)];for(let i=0;i<data.length;i+=8){const c=data.subarray(i,i+8);out.push(Buffer.from([0]),c);}return Buffer.concat(out);}
function fpk(files,{nameSize=0x10,encrypted=false}={}){const names=Object.keys(files);
 if(encrypted){const key=Buffer.from([0x11,0x22,0x33,0x44]);let off=4;const bodies=[];const idx=[];for(const n of names){const e=Buffer.alloc(12+0x18);e.writeUInt32LE(off,0);e.writeUInt32LE(files[n].length,4);e.write(n,12,'latin1');idx.push(e);bodies.push(files[n]);off+=files[n].length;}
  const index=Buffer.concat(idx);for(let i=0;i<index.length;i++)index[i]^=key[i&3];const h=Buffer.alloc(4);h.writeUInt32LE((0x80000000|names.length)>>>0,0);const trailer=Buffer.concat([key,u32(off)]);return Buffer.concat([h,...bodies,index,trailer]);}
 const rec=8+nameSize,data=4+rec*names.length;let off=data;const idx=[],bodies=[];for(const n of names){const e=Buffer.alloc(rec);e.writeUInt32LE(off,0);e.writeUInt32LE(files[n].length,4);e.write(n,8,'latin1');idx.push(e);bodies.push(files[n]);off+=files[n].length;}
 return Buffer.concat([u32(names.length),...idx,...bodies]);}
function fpk2(files){const names=Object.keys(files),h=Buffer.alloc(0x20);h.write('FPK 2.00','latin1');h.writeInt32LE(names.length,0x1c);let off=0x20+0x20*names.length;const idx=[],bodies=[];
 for(const n of names){const e=Buffer.alloc(0x20);e.writeUInt32LE(off,0);e.writeUInt32LE(files[n].length,4);e.write(n,8,'latin1');idx.push(e);bodies.push(files[n]);off+=files[n].length;}return Buffer.concat([h,...idx,...bodies]);}

module.exports={srp,HEADER,tmrMsg,tmrChoice,tmrPac,advscript2,nekoPak,nekoDat,isf,pm,mpx,drs,rld,rldSay,rldChoice,scpack,eaglsDat,lzPack,scnpac,zlc2,fpk,fpk2,literals,sjis,gbk};
