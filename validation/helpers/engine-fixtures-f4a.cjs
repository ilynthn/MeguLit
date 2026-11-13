'use strict';
/* E640–E654 synthetic files for family F4a (Escude, PJADV, Luca System, Stuff / Propeller, AI5WIN, STCM2L, Willadv and the
   archive + generic scan engines), written as the readers' header comments describe the formats. Ciphers that are their
   own inverse reuse the reader's generator; the others (GLib2, Blowfish) are inverted here. */
const zlib=require('node:zlib');
const kit=require('../../services/original-engines/kit.cjs');
const {sjis,gbk}=require('./engine-fixtures.cjs');
const {Blowfish}=require('../../services/original-engines/blowfish.cjs');
const u8=v=>Buffer.from([v&255]),u16=v=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;},u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;},u64=v=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b;};
const fixed=(s,n,enc=x=>Buffer.from(x,'latin1'))=>{const b=Buffer.alloc(n);enc(s).copy(b);return b;};
const z=b=>Buffer.concat([b,Buffer.from([0])]);
/* LZSS (kit.lzss defaults) with every byte a literal */
const lzLit=data=>{const out=[];for(let i=0;i<data.length;i+=8)out.push(Buffer.from([0xff]),data.subarray(i,i+8));return Buffer.concat(out);};

/* ---- Escude --------------------------------------------------------------------------------------------------------- */
/* ESCR1_00: strings in table order (the code is a stub that only has to be skipped) */
function escr1(strs,enc=sjis){const bodies=strs.map(s=>z(enc(s))),offs=[];let o=0;for(const b of bodies){offs.push(o);o+=b.length;}const code=Buffer.from([1,2,3,4,0,0]);
 return Buffer.concat([Buffer.from('ESCR1_00','latin1'),u32(strs.length),...offs.map(u32),u32(code.length),code,u32(o),...bodies]);}
/* ESCR_NEW message file (.001) */
function escrMess(strs,enc=sjis){const bodies=strs.map(s=>Buffer.from(z(enc(s)).map(c=>c^0x55))),offs=[];let o=0;for(const b of bodies){offs.push(o);o+=b.length;}
 return Buffer.concat([Buffer.from('@mess:__','latin1'),u32(strs.length),u32(o),...offs.map(u32),...bodies]);}
/* the "acp" LZW with literal codes only (9 bits, MSB first) and the end code */
function acp(data){const codes=[...data,0x100];let bits='';for(const c of codes)bits+=c.toString(2).padStart(9,'0');while(bits.length%8)bits+='0';
 const body=Buffer.alloc(bits.length/8);for(let i=0;i<body.length;i++)body[i]=parseInt(bits.substr(i*8,8),2);const h=Buffer.alloc(8);h.write('acp\0',0,'latin1');h.writeUInt32BE(data.length,4);return Buffer.concat([h,body]);}
/* ESC-ARC2 / ESC-ARC1 with the index XORed by the seed stream */
function escArc(files,{version=2,seed=0x12345678}={}){const {seedStream}=require('../../services/original-engines/escude.cjs');const names=Object.keys(files),next=seedStream(seed),count=names.length;
 const enc=b=>{const o=Buffer.from(b);for(let i=0;i+4<=o.length;i+=4)o.writeUInt32LE((o.readUInt32LE(i)^next())>>>0,i);return o;};
 const head=Buffer.concat([Buffer.from('ESC-ARC'+version,'latin1'),u32(seed),u32((count^next())>>>0)]);
 if(version===1){const idxLen=count*0x88;let off=0x10+idxLen;const recs=[],datas=[];for(const n of names){recs.push(fixed(n,0x80),u32(off),u32(files[n].length));datas.push(files[n]);off+=files[n].length;}return Buffer.concat([head,enc(Buffer.concat(recs)),...datas]);}
 const nameBuf=Buffer.concat(names.map(n=>z(Buffer.from(n,'latin1')))),nsz=u32((nameBuf.length^next())>>>0);let off=0x14+count*12+nameBuf.length,no=0;const recs=[],datas=[];
 for(const n of names){recs.push(u32(no),u32(off),u32(files[n].length));no+=n.length+1;datas.push(files[n]);off+=files[n].length;}
 return Buffer.concat([head,nsz,enc(Buffer.concat(recs)),nameBuf,...datas]);}

/* ---- PJADV ---------------------------------------------------------------------------------------------------------- */
/* items: [{name?, say} | {choice} | {prompt}] -> {scenario, textdata (encrypted)} */
function pjadvPair(items,enc=sjis,{encrypt=true}={}){const strs=[Buffer.from('PJADV_TF0001','latin1'),u32(0)];let at=16;const put=s=>{const o=at;const b=Buffer.concat([enc(s),Buffer.from([0,0])]);strs.push(b);at+=b.length;return o;};
 const code=[];const op=(o,dws)=>{code.push(u8(dws.length+1),Buffer.from([o&255,(o>>8)&255,(o>>16)&255]),...dws.map(u32));};
 for(const it of items){if(it.say!==undefined)op(0x800003,[0,it.name?put(it.name):0,put(it.say),0]);else if(it.choice!==undefined)op(0x010108,[put(it.choice),0]);else if(it.prompt!==undefined)op(0x030003,[0,put(it.prompt)]);op(0x0102,[7]);}
 strs[1]=u32(items.length);const scenario=Buffer.concat([Buffer.from('PJADV_SF0001','latin1'),u32(items.length),Buffer.alloc(16),...code]);let text=Buffer.concat(strs);
 if(encrypt){text=Buffer.from(text);let k=0xc5;for(let i=0;i<text.length;i++){text[i]^=k;k=(k+0x5c)&255;}}
 return {scenario,textdata:text};}
function gamedat(files,{version=2}={}){const names=Object.keys(files),nl=version===1?16:32,count=names.length;let off=0;const idx=[],datas=[];
 for(const n of names){idx.push(u32(off),u32(files[n].length));datas.push(files[n]);off+=files[n].length;}
 return Buffer.concat([Buffer.from(version===1?'GAMEDAT PACK':'GAMEDAT PAC2','latin1'),u32(count),...names.map(n=>fixed(n,nl)),...idx,...datas]);}

/* ---- Luca System ---------------------------------------------------------------------------------------------------- */
/* a code line: opcode, fixed flag, params -> u16 length, op, flag, params, pad */
const lucaCode=(op,flag,params)=>{const len=4+params.length;return Buffer.concat([u16(len),u8(op),u8(flag),params,len&1?Buffer.alloc(1):Buffer.alloc(0)]);};
const lstr=s=>{const b=Buffer.from(s,'utf16le');return Buffer.concat([u16(b.length/2),b]);};
/* SP style: MESSAGE = u16 voice + UTF-16 lstring + u8; SELECT = u16 × 4 + lstring + u16 × 3 */
function lucaScriptSP(items){return Buffer.concat(items.map(it=>it.say!==undefined?lucaCode(0x21,1,Buffer.concat([u16(3),u16(it.voice||0),lstr(it.say),u8(0)])):it.choice!==undefined?lucaCode(0x22,0,Buffer.concat([u16(1),u16(0),u16(0),u16(0),lstr(it.choice),u16(0),u16(0),u16(0)])):lucaCode(0x05,2,Buffer.concat([u16(1),u16(2),u16(9)]))));}
/* LB_EN style: MESSAGE = u16 voice + C string (Japanese, UTF-8) + C string (English) + u8 */
function lucaScriptEN(items,enc=s=>Buffer.from(s,'utf8')){return Buffer.concat(items.map(it=>it.say!==undefined?lucaCode(0x30,0,Buffer.concat([u16(0),z(enc(it.say)),z(Buffer.from(it.en||'','latin1')),u8(0)])):lucaCode(0x07,0,Buffer.concat([u16(5),z(Buffer.from('bg01','latin1'))]))));}
function lucaPak(files,{bs=16}={}){const names=Object.keys(files),count=names.length,nameBuf=Buffer.concat(names.map(n=>z(Buffer.from(n,'latin1'))));
 let hl=0x24+4+count*8+nameBuf.length;hl=Math.ceil(hl/bs)*bs;const head=Buffer.alloc(hl);head.writeUInt32LE(hl,0);head.writeUInt32LE(count,4);head.writeUInt32LE(0,8);head.writeUInt32LE(bs,12);head.writeUInt32LE(0x200,32);
 const namesAt=0x24+4+count*8;head.writeUInt32LE(namesAt,0x24);nameBuf.copy(head,namesAt);let blk=hl/bs;const datas=[];
 names.forEach((n,i)=>{const b=files[n],padded=Buffer.concat([b,Buffer.alloc((bs-b.length%bs)%bs)]);head.writeUInt32LE(blk,0x28+i*8);head.writeUInt32LE(b.length,0x2c+i*8);datas.push(padded);blk+=padded.length/bs;});
 return Buffer.concat([head,...datas]);}

/* ---- Stuff / Propeller ---------------------------------------------------------------------------------------------- */
/* items [{say} | {choice}] -> .msc, version 0 (u16 string lengths) or 1 (u32) */
function msc(items,{version=0,enc=sjis}={}){const S=b=>Buffer.concat([version?u32(b.length):u16(b.length),b]),W=version?u32:u16;const code=[];
 code.push(Buffer.from([1,0]),S(Buffer.from('Title','latin1')));
 for(const it of items){if(it.say!==undefined)code.push(Buffer.from([5,0]),u8(0),version?u32(1):u16(1),S(enc(it.say)));else code.push(Buffer.from([2,0x12]),...[0,1,2,3,4].flatMap(()=>[u8(0),W(1)]),S(enc(it.choice)));
  code.push(Buffer.from([0,5]),u8(0),W(0),u8(1));}
 code.push(Buffer.from([0,6]));const lab=Buffer.concat([u8(0),version?u32(1):u16(1),u32(0)]);
 return Buffer.concat([Buffer.from([0,0]),u32(14+2*lab.length),u32(lab.length),lab,u32(lab.length),lab,...code]);}
function mpk(files){const names=Object.keys(files),count=names.length;let off=8;const datas=[],recs=[];
 for(const n of names){const b=/\.msc$/i.test(n)?kit.xor(files[n],0x88):files[n];recs.push(Buffer.concat([fixed('\\'+n,0x20),u32(off),u32(b.length)]));datas.push(b);off+=b.length;}
 const idx=Buffer.concat(recs),key=0x5a;const x=Buffer.from(idx.map(c=>c^key));/* byte 0x1F of the plain index is 0 (end of the first name) so the key is stored there */
 return Buffer.concat([u32(off),u32(count),...datas,x]);}

/* ---- AI5WIN --------------------------------------------------------------------------------------------------------- */
/* code: [op, ...operands] where an operand is {s}, {b}, {h}, {i}, {c:[bytes]} (expression, 0xFF appended), {v:[...]}, {g:[[bytes]...]}, {f:0|1} */
function ai5Code(ops,enc=sjis){const out=[];for(const [op,...args] of ops){out.push(u8(op));for(const a of args){
  if(a.s!==undefined)out.push(z(enc(a.s)));else if(a.b!==undefined)out.push(u8(a.b));else if(a.h!==undefined)out.push(u16(a.h));else if(a.i!==undefined)out.push(u32(a.i));
  else if(a.c)out.push(Buffer.from([...a.c,0xff]));else if(a.v){for(const x of a.v)out.push(x.s!==undefined?Buffer.concat([u8(1),z(enc(x.s))]):Buffer.concat([u8(2),Buffer.from([...x.c,0xff])]));out.push(u8(0));}
  else if(a.g){for(const x of a.g)out.push(u8(1),Buffer.from([...x,0xff]));out.push(u8(0));}else if(a.f!==undefined)out.push(u8(a.f));}}
 return Buffer.concat(out);}
const ai5Mes=(code,version)=>version===2?Buffer.concat([u32(1),u32(0),code]):version===0?Buffer.concat([u16(6),Buffer.from('HDR\0','latin1'),code]):code;
function ai5Dat(files,{key=0x13572468,nameKey=0x3c}={}){const names=Object.keys(files),count=names.length;let off=8+count*0x1c;const recs=[],datas=[];
 for(const n of names){const nb=fixed(n,0x14);for(let i=0;i<nb.length;i++)nb[i]^=nameKey;recs.push(u32((files[n].length^key)>>>0),u32((off^key)>>>0),nb);datas.push(files[n]);off+=files[n].length;}
 return Buffer.concat([u32((count^key)>>>0),u32(key),...recs,...datas]);}

/* ---- STCM2L --------------------------------------------------------------------------------------------------------- */
/* actions [{op, strs:[...]}] -> file */
function stcm2(actions,enc=sjis){const start=0x50,parts=[];let at=start;
 for(const a of actions){const strs=a.strs||[],n=Math.max(strs.length,1),head=16+n*12;let extra=[],eoff=head;const params=[];
  for(let i=0;i<n;i++){if(i<strs.length){const raw=enc(strs[i]),len=Math.ceil((raw.length+1)/4)*4,blk=Buffer.concat([u32(0),u32(0),u32(0),u32(len),fixed('',len,()=>raw)]);params.push(Buffer.concat([u32(at+eoff),u32(0),u32(0)]));extra.push(blk);eoff+=blk.length;}else params.push(Buffer.concat([u32(0xff000000),u32(5),u32(0)]));}
  const len=eoff;parts.push(Buffer.concat([u32(0),u32(a.op),u32(n),u32(len),...params,...extra]));at+=len;}
 const exportsAt=at+12,h=Buffer.alloc(start);h.write('STCM2L Apr 12 2006 test',0,'latin1');h.writeUInt32LE(exportsAt,0x20);h.writeUInt32LE(exportsAt,0x2c);h.write('CODE_START_\0',start-12,'latin1');
 return Buffer.concat([h,...parts,Buffer.from('EXPORT_DATA\0','latin1'),Buffer.from('COLLECTION_LINK\0','latin1'),Buffer.alloc(0x40)]);}

/* ---- Will ARC (Willadv) --------------------------------------------------------------------------------------------- */
function willArc(groups){const exts=Object.keys(groups);let dir=4+exts.length*12;const head=[u32(exts.length)],idx=[],datas=[];let dataAt=dir+exts.reduce((n,e)=>n+Object.keys(groups[e]).length*17,0);
 for(const e of exts){head.push(fixed(e,4),u32(Object.keys(groups[e]).length),u32(dir));for(const [n,b] of Object.entries(groups[e])){const enc=e==='WSC'?Buffer.from(b.map(c=>((c<<2)|(c>>>6))&255)):b;idx.push(fixed(n,9),u32(enc.length),u32(dataAt));datas.push(enc);dataAt+=enc.length;dir+=17;}}
 return Buffer.concat([...head,...idx,...datas]);}
/* a .wsc with one spoken (0x42) and one narrated (0x41) line */
const wsc=(name,say,narr,enc=sjis)=>Buffer.concat([Buffer.from([0,0x42,1,0,0,0,0]),z(enc(name)),z(enc(say)),Buffer.from([0,0x41,1,0,0,0]),z(enc(narr)),Buffer.from([0])]);

/* ---- archive + scan engines ----------------------------------------------------------------------------------------- */
const textScript=(lines,enc)=>enc(lines.join('\r\n')+'\r\n');
function isa(files){const names=Object.keys(files),count=names.length;let off=0x10+count*0x20;const recs=[],datas=[];
 for(const n of names){recs.push(fixed(n,0x0c),u32(0),u32(off),u32(files[n].length),Buffer.alloc(8));datas.push(files[n]);off+=files[n].length;}
 const h=Buffer.concat([Buffer.from('ISM ARCHIVED','latin1'),u16(count),u16(2)]);return Buffer.concat([h,...recs,...datas]);}
/* GLib2: one folder "scr" and its files; keys: header, 4 index keys, 4 chunk keys per file (0 = a key with no scheme: plain) */
function glib2(files){const S=require('../../services/original-engines/archive-scan.cjs');const keys=[];for(let k=1;keys.length<4;k+=7919)if(S.g2Scheme(k))keys.push(k);let none=1;while(S.g2Scheme(none))none++;
 const names=['scr',...Object.keys(files)],count=names.length,nameBuf=Buffer.concat(names.map(n=>z(Buffer.from(n,'latin1'))));const nameOff=[];let o=0;for(const n of names){nameOff.push(o);o+=n.length+1;}
 const infoBase=0x10+count*0x18+nameBuf.length,infos=[],recs=[],datas=[];let dataAt=0x5c;
 names.forEach((n,i)=>{const isFile=i>0;recs.push(u32(nameOff[i]),u32(0),u32(isFile?0:0xffffffff),u32(isFile?0x100:0x10),u32(isFile?(i-1)*0x50:0),u32(0));
  if(isFile){const b=files[n],sc=S.g2Scheme(keys[i%4]);const enc=S.g2Encrypt(sc,b);/* chunk 0 under keys[i % 4]; chunks 1–3 under a key with no scheme (stored) */
   infos.push(Buffer.concat([u32(0),u32(0),u32(b.length),u32(dataAt),u32(keys[i%4]),Buffer.alloc(12),u32(none),Buffer.alloc(12),u32(none),Buffer.alloc(12),u32(none),Buffer.alloc(12)]));datas.push(enc);dataAt+=enc.length;}});
 let idx=Buffer.concat([Buffer.from('CDBD','latin1'),u32(count),u32(count*0x18+nameBuf.length),u32(0),...recs,nameBuf,...infos]);void infoBase;
 const hk=[0x44,0x34,0x24,0x14];for(let j=3;j>=0;j--)idx=S.g2Encrypt(S.g2Scheme(keys[j]),idx);/* decryption applies 0x44 (keys[0]) first */
 const h=Buffer.alloc(0x5c);h.write('GLibArchiveData2.0','latin1');hk.forEach((k,j)=>h.writeUInt32LE(keys[j],k));h.writeUInt32LE(dataAt,0x54);h.writeUInt32LE(idx.length,0x58);
 return Buffer.concat([S.g2Encrypt(S.g2Scheme(S.G2_HEADER_KEY),h),...datas,idx]);}
/* Cyberworks: body Arc04.dat and its binary index Arc01.dat */
function cyberworks(files){const names=Object.keys(files);let off=0;const recs=[],datas=[];
 names.forEach((n,i)=>{const b=files[n],packed=lzLit(b);recs.push(Buffer.concat([u32(0x17),u32(i+1),u32(b.length),u32(packed.length),u32(off),Buffer.from('s0','latin1'),u32(0),u8(0)]));datas.push(packed);off+=packed.length;});
 /* one image entry the reader skips */
 recs.push(Buffer.concat([u32(0x17),u32(99),u32(4),u32(4),u32(0),Buffer.from('b0','latin1'),u32(0),u8(0)]));
 const toc=Buffer.concat(recs),packedToc=lzLit(toc),num=v=>Buffer.from(String(v).padStart(8,'0').split('').map(d=>(+d)^0x7f));
 return {body:Buffer.concat(datas),index:Buffer.concat([num(toc.length),num(packedToc.length),packedToc])};}
function bfEncrypt(bf,buf){const o=Buffer.from(buf);for(let i=0;i+8<=o.length;i+=8){const [l,r]=bf.encrypt(o.readUInt32LE(i),o.readUInt32LE(i+4));o.writeUInt32LE(l,i);o.writeUInt32LE(r,i+4);}return o;}
/* Tanuki TAC 1.10: one bucket, entries stored Blowfish-encrypted (not packed) or zlib-packed */
function tac(files,{seed=7}={}){const names=Object.keys(files),count=names.length;const ents=[],datas=[];let off=0;
 names.forEach((n,i)=>{const packed=i%2===1,hash=BigInt(0x1000+i),full=(hash<<16n)|0x77n;let body=packed?zlib.deflateSync(files[n]):bfEncrypt(new Blowfish(Buffer.from(full.toString()+'_tlib_secure_','latin1')),files[n]);
  ents.push(Buffer.concat([u64(hash),u32(packed?1:0),u32(files[n].length),u32(off),u32(body.length)]));datas.push(body);off+=body.length;});
 const idx=Buffer.concat([u16(0x77),u16(count),u32(0),...ents]);const enc=bfEncrypt(new Blowfish('TLibArchiveData'),zlib.deflateSync(idx));/* a tail shorter than 8 bytes stays plain */
 const h=Buffer.alloc(0x2c);h.write('TArc1.10','latin1');h.writeInt32LE(count,0x14);h.writeInt32LE(1,0x18);h.writeUInt32LE(enc.length,0x1c);h.writeUInt32LE(seed,0x20);
 return Buffer.concat([h,enc,...datas]);}
/* Yaneurao yanepkDx, entries LZSS-packed */
function yanepk(files){const names=Object.keys(files),count=names.length,first=0xc+count*0x10c;let off=first;const recs=[],datas=[];
 for(const n of names){const p=lzLit(files[n]);recs.push(fixed(n,0x100),u32(off),u32(files[n].length),u32(p.length));datas.push(p);off+=p.length;}
 return Buffer.concat([Buffer.from('yanepkDx','latin1'),u32(count),...recs,...datas]);}
/* Rits SAF v6 with the encrypted index (id 0x601: zlib-packed entries) */
function saf(files){const names=Object.keys(files),count=names.length,nameBuf=Buffer.concat(names.map(n=>z(Buffer.from(n,'latin1'))));const head=8+count*16+nameBuf.length,start=Math.ceil(head/2048)*2048;
 const recs=[],datas=[];let at=start,no=0;names.forEach(n=>{const p=zlib.deflateSync(files[n]),pad=Buffer.concat([p,Buffer.alloc((2048-p.length%2048)%2048)]);recs.push(Buffer.concat([u32(no),u32(at/2048),u32(p.length),u32(files[n].length)]));datas.push(pad);at+=pad.length;no+=n.length+1;});
 const idx=Buffer.concat(recs);for(let i=0;i<count;i++){let k=0xef;for(let j=0;j<16;j++)idx[i*16+j]^=(k++)&255;}const nb=Buffer.from(nameBuf);let k=0xff;for(let i=0;i<nb.length;i++){nb[i]^=k;k=(k-1)&255;}
 const h=Buffer.concat([u16(0x601),u16(count),u32(nameBuf.length),idx,nb]);return Buffer.concat([h,Buffer.alloc(start-h.length),...datas]);}
function snn(files){const names=Object.keys(files);let off=0;const recs=[u32(names.length)],datas=[];for(const n of names){recs.push(fixed(n,0x40),u32(off),u32(files[n].length));datas.push(files[n]);off+=files[n].length;}return {snn:Buffer.concat(datas),inx:Buffer.concat(recs)};}
/* SLG: SZS archive (data XOR 0x90) with .sd scripts XORed by the MSVC rand() stream of a known key */
const slgEncrypt=(b,key)=>kit.xorStream(b,kit.msvcRand(key));
function szs(files){const names=Object.keys(files),count=names.length;let off=0x10+count*0x110;const recs=[],datas=[];
 for(const n of names){recs.push(fixed(n,0x100),u64(off),u32(files[n].length),u32(0));datas.push(kit.xor(files[n],0x90));off+=files[n].length;}
 const h=Buffer.alloc(0x10);h.write('SZS100__','latin1');h.writeInt32LE(count,0xc);return Buffer.concat([h,...recs,...datas]);}
/* an unencrypted DXArchive v8 (copied from validation/rpg-engines.test.cjs, stored entries only) */
function dxa(files){const version=8;
 const tree={};for(const [p,b] of Object.entries(files)){const parts=p.split('/');let t=tree;for(const d of parts.slice(0,-1))t=t[d]=t[d]||{};t[parts.at(-1)]=b;}
 const names=[],nameOf=n=>{const at=Buffer.concat(names).length,len=Math.ceil((Buffer.byteLength(n)+1)/4)*4,pad=s=>{const b=Buffer.alloc(len);Buffer.from(s).copy(b);return b;};names.push(u16(len/4),u16(0),pad(n.toUpperCase()),pad(n));return at;};
 const fileSize=72,datas=[];let dataAt=0;const fileRecs=[],dirRecs=[],ff=Buffer.from('ffffffffffffffff','hex');
 const fileRec=()=>{fileRecs.push(null);return (fileRecs.length-1)*fileSize;};
 const dirOf=(t,selfAt,parentAt)=>{const index=dirRecs.length;dirRecs.push(null);const keys=Object.keys(t),first=fileRecs.length*fileSize,slots=keys.map(()=>fileRec());
  keys.forEach((k,i)=>{const v=t[k],at=nameOf(k);
   if(Buffer.isBuffer(v)){fileRecs[slots[i]/fileSize]=Buffer.concat([u64(at),u64(0x20),Buffer.alloc(24),u64(dataAt),u64(v.length),ff,ff]);datas.push(v);dataAt+=v.length;}
   else{const sub=dirOf(v,slots[i],selfAt);fileRecs[slots[i]/fileSize]=Buffer.concat([u64(at),u64(0x10),Buffer.alloc(24),u64(sub),u64(0),ff,ff]);}});
  dirRecs[index]=Buffer.concat([u64(selfAt),u64(parentAt),u64(keys.length),u64(first)]);return index*32;};
 nameOf('');fileRec();fileRecs[0]=Buffer.concat([u64(0),u64(0x10),Buffer.alloc(24),u64(0),u64(0),ff,ff]);dirOf(tree,0,0xffffffff);
 const nameBuf=Buffer.concat(names),fileBuf=Buffer.concat(fileRecs),dirBuf=Buffer.concat(dirRecs),head=Buffer.concat([nameBuf,fileBuf,dirBuf]),data=Buffer.concat(datas);
 const hs=64,h=Buffer.concat([u16(0x5844),u16(version),u32(head.length),u64(hs),u64(hs+data.length),u64(nameBuf.length),u64(nameBuf.length+fileBuf.length),u32(932),u32(3),Buffer.alloc(16)]);
 return Buffer.concat([h,data,head]);}

module.exports={sjis,gbk,u16,u32,z,escr1,escrMess,acp,escArc,pjadvPair,gamedat,lucaScriptSP,lucaScriptEN,lucaPak,msc,mpk,ai5Code,ai5Mes,ai5Dat,stcm2,willArc,wsc,
 textScript,isa,glib2,cyberworks,tac,yanepk,saf,snn,slgEncrypt,szs,dxa,lzLit};
