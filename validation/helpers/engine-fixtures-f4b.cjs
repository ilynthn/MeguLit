'use strict';
/* E660–E664 synthetic game files for the F4b readers (circus, whale, ddsystem, aoi, kid), written from the same specs the
   readers follow (msg-tool, arc_unpacker, VNTranslationTools, GARbro) */
const zlib=require('node:zlib');
const {sjis,gbk}=require('./engine-fixtures.cjs');
const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;},u16=v=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;};
const fixed=(s,n,enc=sjis)=>{const b=Buffer.alloc(n);enc(s).copy(b);return b;};

/* ---- Circus MES (table dc3dd: u8x2 0x00–0x38, u8str 0x39–0x43, string 0x44–0x62, encstr 0x63–0x67, u16x4 0x68+,
   plain text 0x58, key 0x20, name 0x64) ---------------------------------------------------------------------------- */
const DC3DD={version:0xa5a8,text:0x63,name:0x64,plain:0x58,string:0x44,u8x2:0x01,u8str:0x39,u16x4:0x70,key:0x20};
const encstr=(op,s,enc)=>{const b=Buffer.from(enc(s).map(c=>(c-DC3DD.key)&255));return Buffer.concat([Buffer.from([op]),b,Buffer.from([0])]);};
/* items: {say, name} | {plain} | {cmd} ; newer: the head1 == 3 layout */
function mes(items,{enc=sjis,newer=false}={}){const code=[];
 for(const it of items){code.push(Buffer.from([DC3DD.u8x2,1,2]));
  if(it.cmd!==undefined)code.push(Buffer.concat([Buffer.from([DC3DD.string]),Buffer.from(it.cmd,'latin1'),Buffer.from([0])]));
  if(it.name)code.push(encstr(DC3DD.name,it.name,enc));
  if(it.say)code.push(encstr(DC3DD.text,it.say,enc));
  if(it.plain)code.push(Buffer.concat([Buffer.from([DC3DD.plain]),enc(it.plain),Buffer.from([0])]));
  code.push(Buffer.concat([Buffer.from([DC3DD.u8str,5]),Buffer.from('se01','latin1'),Buffer.from([0])]),Buffer.from([DC3DD.u16x4,0,0,0,0,0,0,0,0]));}
 const head=newer?Buffer.concat([u32(2),u32(3),Buffer.alloc(8),u16(DC3DD.version),Buffer.from([0])]):Buffer.concat([u32(1),u32(0x10),u16(DC3DD.version)]);
 return Buffer.concat([head,...code]);}
function pck(files){const names=Object.keys(files),n=names.length;let off=4+n*8+n*0x40;const idx=[],ent=[],data=[];
 for(const k of names){const d=files[k];idx.push(u32(off),u32(d.length));ent.push(fixed(k,0x38),u32(off),u32(d.length));data.push(d);off+=d.length;}
 return Buffer.concat([u32(n),...idx,...ent,...data]);}
/* DAT: count + 1 index entries, the last one the end marker */
function circusDat(files,nl=0x24){const names=Object.keys(files),n=names.length+1;let off=4+(nl+4)*n;const idx=[],data=[];
 for(const k of names){idx.push(fixed(k,nl),u32(off));data.push(files[k]);off+=files[k].length;}idx.push(Buffer.alloc(nl),u32(off));return Buffer.concat([u32(n),...idx,...data]);}

/* ---- Whale *.dat: scripts zlib + dword XOR with (hash ^ K), images obfuscated (type 1) --------------------------- */
function whaleDat(scripts,{K=0x5a3c9e17,extra=2}={}){const items=[];let h=0x1234567n;
 for(let i=0;i<extra;i++)items.push({type:1,data:Buffer.alloc(64+i,0x41)});
 for(const s of scripts)items.push({type:2,data:zlib.deflateSync(s),orig:s.length});
 const n=items.length,base=4+n*21;let off=base;const idx=[],data=[];
 for(const it of items){h=(h*6364136223846793005n+1442695040888963407n)&0xffffffffffffffffn;const lo=Number(h&0xffffffffn);let d=it.data;
  if(it.type===2){d=Buffer.from(d);const key=(lo^K)>>>0;for(let i=0;i+4<=d.length;i+=4)d.writeUInt32LE((d.readUInt32LE(i)^key)>>>0,i);}
  const e=Buffer.alloc(21);e.writeBigUInt64LE(h,0);e[8]=it.type^(lo&255);e.writeUInt32LE((off^lo)>>>0,9);e.writeUInt32LE((d.length^lo)>>>0,13);e.writeUInt32LE(((it.orig||d.length)^lo)>>>0,17);
  idx.push(e);data.push(d);off+=d.length;}
 return Buffer.concat([u32((n^0x26aca46e)>>>0),...idx,...data]);}
const whaleScript=(L,enc=sjis)=>enc(['*start','BG 01,0',`【${L[0]}】「${L[1]}」`,L[2],'MS.HS "'+L[3]+'"',`SELECT "${L[4]},*a","${L[5]},*b"`,'*a','（'+L[6]+'）','END'].join('\r\n'));

/* ---- generic-scan script bodies: text runs between bytecode ------------------------------------------------------ */
const body=(L,enc=sjis)=>Buffer.concat(L.flatMap((s,i)=>[Buffer.from([0x10+i,0x02,0x00,0x00]),enc(s),Buffer.from([0,0x7f,0x01])]));

/* ---- DDSystem DDP2 + SHS (literal runs only) + HXB ---------------------------------------------------------------- */
function shsLiteral(b){const out=[];for(let i=0;i<b.length;i+=29){const n=Math.min(29,b.length-i);out.push(Buffer.from([n-1]),b.subarray(i,i+n));}return Buffer.concat(out);}
function hxb(text){const len=0x10+text.length,b=Buffer.alloc(len);b.write('DDSxHXB','latin1');b[8]=(len>>16)&255;b[9]=(len>>8)&255;b[10]=len&255;text.copy(b,0x10);
 const k=Math.imul(((len<<5)^0xa5),(len+0x6f349))^0x34a9b129,kb=Buffer.alloc(4);kb.writeInt32LE(k|0);for(let i=0x10;i<len;i++)b[i]^=kb[i&3];return b;}
function ddp2(items){const n=items.length,base=0x20+n*16;let off=base;const idx=[],data=[];
 for(const it of items){const d=it.pack?shsLiteral(it.data):it.data;idx.push(u32(off),u32(it.data.length),u32(it.pack?d.length:0),u32(0));data.push(d);off+=d.length;}
 const head=Buffer.alloc(0x20);head.write('DDP2','latin1');head.writeInt32LE(n,4);return Buffer.concat([head,...idx,...data]);}

/* ---- SystemAoi AOIB (OX7, XOR 0xB4) -------------------------------------------------------------------------------- */
function aoiBox(files){const names=Object.keys(files),n=names.length;let off=0x10+n*0x18;const idx=[],data=[];
 for(const k of names){const d=Buffer.from(files[k].map(c=>c^0xb4));idx.push(fixed(k,0x10),u32(off),u32(d.length));data.push(d);off+=d.length;}
 const head=Buffer.alloc(0x10);head.write('AOIBOX7\0','latin1');head.writeInt32LE(n,8);return Buffer.concat([head,...idx,...data]);}

/* ---- KID LNK + lnd (literal runs) ---------------------------------------------------------------------------------- */
function lndPack(b){const out=[];for(let i=0;i<b.length;i+=32){const n=Math.min(32,b.length-i);out.push(Buffer.from([n-1]),b.subarray(i,i+n));}
 const h=Buffer.alloc(0x10);h.write('lnd\0','latin1');h.writeUInt32LE(b.length,8);return Buffer.concat([h,...out]);}
function lnk(files,{pack=[]}={}){const names=Object.keys(files),n=names.length;let off=0;const idx=[],data=[];
 for(const k of names){const p=pack.includes(k),d=p?lndPack(files[k]):files[k];const e=Buffer.alloc(32);e.writeUInt32LE(off,0);e.writeUInt32LE((d.length<<1|(p?1:0))>>>0,4);fixed(k,0x18).copy(e,8);idx.push(e);data.push(d);off+=d.length;}
 const head=Buffer.alloc(0x10);head.write('LNK\0','latin1');head.writeInt32LE(n,4);return Buffer.concat([head,...idx,...data]);}

module.exports={DC3DD,mes,pck,circusDat,whaleDat,whaleScript,body,shsLiteral,hxb,ddp2,aoiBox,lndPack,lnk,sjis,gbk};
