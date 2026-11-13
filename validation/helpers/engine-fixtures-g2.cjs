'use strict';
/* E577–E579 synthetic files for NeXAS, Malie and ShiinaRio, written as the readers' header comments describe the formats
   (the encoders here are the inverses of the readers' decoders; see engine-fixtures.cjs for the text encoders). */
const crypto=require('node:crypto'),zlib=require('node:zlib');
const {sjis}=require('./engine-fixtures.cjs');
const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;};
const cstr=(s,enc)=>Buffer.concat([Buffer.isBuffer(s)?s:enc(s),Buffer.from([0])]);
const fixed=(s,n,enc=sjis)=>{const b=Buffer.alloc(n),e=enc(s);e.copy(b,0,0,Math.min(n-1,e.length));return b;};

/* static Huffman (GARbro HuffmanDecoder): a balanced tree over the bytes used, then the codes. order 'msb' | 'dword-msb' */
function huffman(data,{order='msb'}={}){const syms=[...new Set(data)].sort((a,b)=>a-b);if(syms.length===1)syms.push((syms[0]+1)&255);const bits=[],codes=new Map();
 const build=(list,prefix)=>{if(list.length===1){bits.push(0);for(let i=7;i>=0;i--)bits.push((list[0]>>i)&1);codes.set(list[0],prefix);return;}bits.push(1);const m=list.length>>1;build(list.slice(0,m),prefix+'0');build(list.slice(m),prefix+'1');};
 build(syms,'');for(const c of data)for(const ch of codes.get(c))bits.push(+ch);
 if(order==='msb'){const out=Buffer.alloc(Math.ceil(bits.length/8));bits.forEach((b,i)=>{if(b)out[i>>3]|=0x80>>(i&7);});return out;}
 const out=Buffer.alloc(Math.ceil(bits.length/32)*4);for(let w=0;w*32<bits.length;w++){let v=0;for(let k=0;k<32;k++)v=(v<<1|(bits[w*32+k]||0))>>>0;out.writeUInt32LE(v,w*4);}return out;}

/* ---- NeXAS (E577) ------------------------------------------------------------------------------------------------ */
/* a .bin: strings in table order; names (indices) get the (0,name)(5,1)(0,message) speaker pattern before the next one.
   layout 'v1' (bare code count), 'v2' (version word first), 'ver' ("VER" header, length-prefixed UTF-8) */
function nexasBin(strings,{layout='v2',enc=sjis,names=[]}={}){const codes=[];strings.forEach((s,i)=>{if(names.includes(i)){codes.push([0,i],[5,1],[0,i+1]);}else if(!names.includes(i-1))codes.push([0,i],[4,0]);});
 const code=Buffer.concat([u32(codes.length),...codes.map(([o,a])=>Buffer.concat([u32(o),u32(a)]))]);
 if(layout==='ver'){const strs=Buffer.concat([u32(strings.length),...strings.map(s=>{const b=Buffer.from(s+'\0','utf8');return Buffer.concat([u32(b.length),b]);})]);
  return Buffer.concat([Buffer.from('VER\0\0\0\0\0\0','latin1'),u32(2),u32(0),u32(0),u32(0),code,strs,u32(0)]);}
 const strs=Buffer.concat([u32(strings.length),...strings.map(s=>cstr(s,enc)),u32(0),u32(0)]);
 return Buffer.concat([layout==='v2'?u32(3):Buffer.alloc(0),code,strs]);}
/* a PAC: files {name: Buffer}; type 0 none, 3/4 zlib, 7 zstd; index 'old' (0x40 names at 0xC) or 'huffman' (at the end) */
function nexasPac(files,{type=4,index='huffman',version=0x32}={}){const names=Object.keys(files),datas=[],ents=[];let off=12+(index==='old'?names.length*0x4c:0);
 for(const n of names){const raw=files[n];let body=raw;if(type===3||type===4)body=zlib.deflateSync(raw);else if(type===7)body=zlib.zstdCompressSync(raw);ents.push({n,off,unpacked:raw.length,size:body.length});datas.push(body);off+=body.length;}
 const idx=Buffer.concat(ents.map(e=>Buffer.concat([fixed(e.n,0x40),u32(e.off),u32(e.unpacked),u32(e.size)])));
 const h=Buffer.concat([Buffer.from([0x50,0x41,0x43,version]),u32(names.length),u32(type)]);
 if(index==='old')return Buffer.concat([h,idx,...datas]);
 const packed=huffman(idx).map(c=>~c&255);return Buffer.concat([h,...datas,packed,u32(packed.length)]);}

/* ---- Malie (E578) ------------------------------------------------------------------------------------------------ */
const wname=s=>{const b=Buffer.from(s+'\0','utf16le');return Buffer.concat([u32((b.length|0x80000000)>>>0),b]);};
/* EXEC: one variable, function and label, empty data and code sections, then the message table */
function malieExec(messages){const texts=messages.map(m=>Buffer.from(m,'utf16le'));let o=0;const ranges=texts.map(t=>{const r=Buffer.concat([u32(o),u32(t.length)]);o+=t.length+2;return r;});
 const data=Buffer.concat(texts.flatMap(t=>[t,Buffer.alloc(2)]));
 return Buffer.concat([u32(1),wname('g_flag'),u32(1),u32(7),u32(0),u32(0),u32(0),u32(0),u32(0),
  u32(0x12345678),u32(1),wname('maliescenario'),u32(1),u32(0),u32(0),
  u32(1),wname('_index'),u32(0),
  u32(4),Buffer.from([1,2,3,4]),u32(2),Buffer.from([0x13,0x37]),
  u32(texts.length),...ranges,u32(data.length),data]);}
const rotl=(x,n)=>((x<<n)|(x>>>(32-n)))>>>0,rotr=(x,n)=>((x>>>n)|(x<<(32-n)))>>>0;
/* encrypt in place (the inverse of malie.cjs camellia(): Camellia-128 encryption, then the offset rotations undone) */
function camelliaEncrypt(buf,key){const c=crypto.createCipheriv('camellia-128-ecb',Buffer.from(key,'hex'),null);c.setAutoPadding(false);const e=Buffer.concat([c.update(buf),c.final()]);
 for(let i=0;i<e.length;i+=16){const r=((i>>>4)&15)+16;e.writeUInt32LE(rotr(e.readUInt32LE(i),r),i);e.writeUInt32LE(rotl(e.readUInt32LE(i+4),r),i+4);e.writeUInt32LE(rotr(e.readUInt32LE(i+8),r),i+8);e.writeUInt32LE(rotl(e.readUInt32LE(i+12),r),i+12);}return e;}
/* LIBP: files {path: Buffer} in one folder level ("dir/name"), data aligned to align, then encrypted with key */
function malieLibp(files,{key,align=0x400}){const tree=new Map();for(const [p,b] of Object.entries(files)){const [d,n]=p.includes('/')?p.split('/'):['',p];if(!tree.has(d))tree.set(d,[]);tree.get(d).push([n,b]);}
 const ents=[],blobs=[],offsets=[];const dirs=[...tree.keys()];
 /* entry 0 = root folder holding the top folders, then each folder's entries */
 ents.push({name:'',flags:0,offset:1,size:dirs.length});let next=1+dirs.length;const dirEnts=dirs.map(d=>{const e={name:d,flags:0,offset:0,size:tree.get(d).length};ents.push(e);return e;});
 dirs.forEach((d,i)=>{dirEnts[i].offset=next;for(const [n,b] of tree.get(d)){ents.push({name:n,flags:0x10000,offset:offsets.length,size:b.length});offsets.push(0);blobs.push(b);next++;}});
 let at=0;blobs.forEach((b,i)=>{offsets[i]=at/1024;at+=Math.ceil(b.length/1024)*1024;});
 const idx=Buffer.concat(ents.map(e=>Buffer.concat([fixed(e.name,0x14),u32(e.flags),u32(e.offset),u32(e.size)])));
 const head=Buffer.concat([Buffer.from('LIBP','latin1'),u32(ents.length),u32(offsets.length),u32(0),idx,...offsets.map(u32)]);const base=Math.ceil(head.length/align)*align;
 const body=Buffer.alloc(base+at);head.copy(body,0);let p=base;for(const b of blobs){b.copy(body,p);p+=Math.ceil(b.length/1024)*1024;}
 return camelliaEncrypt(body,key);}
/* plain LIB: {name: Buffer} */
function malieLib(files){const names=Object.keys(files),idx=[],datas=[];let off=16+names.length*0x30;
 for(const n of names){idx.push(Buffer.concat([fixed(n,0x24),u32(files[n].length),u32(off),u32(0)]));datas.push(files[n]);off+=files[n].length;}
 const h=Buffer.alloc(16);h.write('LIB\0',0,'latin1');h.writeInt16LE(names.length,8);return Buffer.concat([h,...idx,...datas]);}

/* ---- ShiinaRio (E579) -------------------------------------------------------------------------------------------- */
/* YLZ of literals only: the reader's control-bit order (dword loaded when the previous one runs out, high bit first) */
function ylzLiterals(data){/* the reader's first call only loads the first dword; the next one is loaded as soon as the last bit is used */
 let word={v:0},mask=0x80000000;const out=[word];
 for(const c of data){word.v=(word.v|mask)>>>0;mask>>>=1;if(!mask){word={v:0};out.push(word);mask=0x80000000;}out.push(c);}
 return Buffer.concat(out.map(x=>typeof x==='number'?Buffer.from([x]):u32(x.v)));}
/* an entry body: 'YPK' zlib, 'YLZ' literals, 'YH1' Huffman; km: XOR'd as the engine does when byte 3 is set */
function warcEntry(data,tag='YPK',{km=false}={}){let body=tag==='YPK'?zlib.deflateSync(data):tag==='YLZ'?ylzLiterals(data):huffman(data,{order:'dword-msb'});
 const b=Buffer.concat([Buffer.from(tag,'latin1'),Buffer.from([km?1:0]),u32(data.length),body]);if(!km)return b;
 const key=tag==='YH1'?(0x6393528e^0x4b4d)>>>0:tag==='YPK'?(~0x4b4d4b4d)>>>0:0x4b4d4b4d;let i=8;for(;i+4<=b.length;i+=4)b.writeUInt32LE((b.readUInt32LE(i)^key)>>>0,i);
 let k=key;for(;i<b.length;i++){b[i]^=k&255;if(tag==='YLZ')k>>>=8;}return b;}
/* WARC 1.1: {name: entry body} */
function warc11(files){const names=Object.keys(files),datas=[],idx=[];let off=12;
 for(const n of names){const b=files[n];idx.push(Buffer.concat([fixed(n,16),u32(off),u32(b.length),u32(b.readUInt32LE(4)),Buffer.alloc(8),u32(0)]));datas.push(b);off+=b.length;}
 const h=Buffer.concat([Buffer.from('WARC 1.1','latin1'),u32((off^0xf182ad82)>>>0)]);return Buffer.concat([h,...datas,...idx]);}
/* a keyed WARC header only (1.7): its index cannot be read without the title's keys */
const warcKeyed=(version=7)=>Buffer.concat([Buffer.from('WARC 1.'+version,'latin1'),u32((16^0xf182ad82)>>>0),crypto.randomBytes(64)]);
/* E602 a keyed WARC (1.2–1.7) under a scheme of shiinario-crypt.cjs: files {name: {data, tag ('YPK' | 'YLZ' | 'YH1' |
   null = stored), flags, km}}; every step of GARbro's OpenEntry undone in reverse order, the index range coded (1.2–1.6)
   or deflated after 8 bytes (1.7), encrypted and put at the end */
function warcEncrypted(files,{version=7,scheme}){const C=require('../../services/original-engines/shiinario-crypt.cjs'),ver=100+version*10,dec=C.decoder(ver,scheme);
 const inv=(data,index,length,flags)=>{if(!dec.extra)return;try{dec.extra.encrypt(data,index,length,flags);}catch(e){if(!(e instanceof C.Fault))throw e;dec.extra.decrypt(data,index,length,flags|0x200);}};
 const datas=[],idx=[];let off=12;
 for(const [name,f] of Object.entries(files)){const flags=(f.flags??0x80000000)>>>0;let body;
  if(f.tag){const x=Buffer.from(f.data);inv(x,0,x.length,0x104);if(flags&0x40000000)dec.decrypt2(x,0,x.length);
   body=warcEntry(x,f.tag,{km:!!f.km});const unpacked=x.length,sig=(body.readUInt32LE(0)^((unpacked^0x82ad82)&0xffffff))>>>0;body.writeUInt32LE(sig,0);}
  else body=Buffer.from(f.data);
  if(body.length>8){if(flags&0x20000000)dec.decrypt2(body,8,body.length-8);inv(body,8,body.length-8,0x102);if(flags&0x80000000)dec.encrypt(body,8,body.length-8);}
  const rec=Buffer.alloc(scheme.nameSize+24);Buffer.from(name,'latin1').copy(rec,0,0,scheme.nameSize);rec.writeUInt32LE(off,scheme.nameSize);rec.writeUInt32LE(body.length,scheme.nameSize+4);
  rec.writeUInt32LE(f.tag?f.data.length:body.length,scheme.nameSize+8);rec.writeUInt32LE(flags,scheme.nameSize+20);idx.push(rec);datas.push(body);off+=body.length;}
 const table=Buffer.concat(idx),plain=ver>=170?Buffer.concat([u32(table.length),u32(idx.length),zlib.deflateSync(table)]):C.rangeEncode(table);
 const buf=Buffer.alloc(dec.maxIndexLength);plain.copy(buf);dec.encryptIndex(off,buf);
 return Buffer.concat([Buffer.from('WARC 1.'+version,'latin1'),u32((off^0xf182ad82)>>>0),...datas,buf.subarray(0,plain.length)]);}
module.exports={huffman,nexasBin,nexasPac,malieExec,malieLibp,malieLib,camelliaEncrypt,ylzLiterals,warcEntry,warc11,warcKeyed,warcEncrypted};
