'use strict';
/* E630–E639 synthetic files for the F3 game-maker readers (services/original-engines/makers.cjs), written as the readers'
   header comments describe the formats. Encoders are the inverse of each documented layout; ciphers that are their own
   inverse (RC4) reuse the reader's function, so those tests prove the layout and the key choice, not the cipher. */
const zlib=require('node:zlib'),crypto=require('node:crypto');
const {sjis,gbk,zip}=require('./engine-fixtures.cjs');
const u8=v=>Buffer.from([v&255]),u16=v=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;},u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;};
const u16b=v=>{const b=Buffer.alloc(2);b.writeUInt16BE(v);return b;},u32b=v=>{const b=Buffer.alloc(4);b.writeUInt32BE(v>>>0);return b;};
const utf8=s=>Buffer.from(s,'utf8');

/* ---- a PE image: one section, optional overlay; cli: {usHeap} makes it a .NET assembly with that #US heap --------- */
function pe(overlay=Buffer.alloc(0),{us=null}={}){const img=Buffer.alloc(0x400);img.write('MZ',0,'latin1');img.writeUInt32LE(0x40,0x3c);img.write('PE\0\0',0x40,'latin1');
 const c=0x44;img.writeUInt16LE(0x14c,c);img.writeUInt16LE(1,c+2);img.writeUInt16LE(0xe0,c+16);img.writeUInt16LE(0x0102,c+18);const opt=c+20;img.writeUInt16LE(0x10b,opt);
 const sec=opt+0xe0;img.write('.text',sec,'latin1');img.writeUInt32LE(0x200,sec+8);img.writeUInt32LE(0x1000,sec+12);img.writeUInt32LE(0x200,sec+16);img.writeUInt32LE(0x200,sec+20);
 if(!us)return Buffer.concat([img,overlay]);
 /* section data at file 0x200 = RVA 0x1000: CLI header, metadata root "BSJB" with one #US stream */
 const ver=Buffer.from('v4.0.30319\0\0','latin1'),root=Buffer.concat([Buffer.from('BSJB','latin1'),u16(1),u16(1),u32(0),u32(ver.length),ver,u16(0),u16(1)]);
 const shdr=Buffer.concat([u32(0),u32(us.length),Buffer.from('#US\0','latin1')]),mdLen=root.length+shdr.length;shdr.writeUInt32LE(mdLen,0);
 const md=Buffer.concat([root,shdr,us]),cli=Buffer.alloc(0x48);cli.writeUInt32LE(0x48,0);cli.writeUInt32LE(0x1000+0x48,8);cli.writeUInt32LE(md.length,12);
 const data=Buffer.concat([cli,md]),size=Math.ceil(data.length/0x200)*0x200;img.writeUInt32LE(size,sec+8);img.writeUInt32LE(size,sec+16);img.writeUInt32LE(0x1000,opt+96+14*8);
 const out=Buffer.alloc(0x200+size);img.copy(out,0,0,0x200);data.copy(out,0x200);return Buffer.concat([out,overlay]);}
/* #US heap: 0, then {compressed length, UTF-16LE, flag byte} */
function usHeap(strings){const parts=[Buffer.from([0])];for(const s of strings){const b=Buffer.concat([Buffer.from(s,'utf16le'),Buffer.from([1])]);const n=b.length;parts.push(n<0x80?u8(n):Buffer.from([0x80|(n>>8),n&255]),b);}return Buffer.concat(parts);}

/* ---- GameMaker data.win (E630) ---------------------------------------------------------------------------------- */
function gmWin(strings){const gen=Buffer.concat([Buffer.from('GEN8','latin1'),u32(8),Buffer.alloc(8)]);const bodies=strings.map(s=>{const b=utf8(s);return Buffer.concat([u32(b.length),b,Buffer.from([0])]);});
 const strgHead=8+gen.length+8,ptrStart=strgHead+4,dataStart=ptrStart+4*strings.length;let off=dataStart;const ptrs=bodies.map(b=>{const p=off;off+=b.length;return u32(p);});
 const strg=Buffer.concat([u32(strings.length),...ptrs,...bodies]),chunk=Buffer.concat([Buffer.from('STRG','latin1'),u32(strg.length),strg]);
 const body=Buffer.concat([gen,chunk]);return Buffer.concat([Buffer.from('FORM','latin1'),u32(body.length),body]);}

/* ---- Director (E631) -------------------------------------------------------------------------------------------- */
const stxtData=text=>Buffer.concat([u32b(12),u32b(text.length),u32b(0),text]);
/* an uncompressed movie: resources [[tag, data]]; le = XFIR (Windows), else RIFX */
function rifxMovie(res,{le=false}={}){const U=le?u32:u32b,U16=le?u16:u16b,T=t=>le?Buffer.from(t.split('').reverse().join(''),'latin1'):Buffer.from(t,'latin1');
 const all=[['imap',Buffer.alloc(24)],['mmap',null],...res,['free',Buffer.alloc(0)]],hs=24,es=20,mmapLen=hs+es*(all.length+1);
 const offs=[];let p=12;for(const [t,d] of all){offs.push(p);p+=8+(t==='mmap'?mmapLen:d.length);}
 const imap=Buffer.concat([U(1),U(offs[1]),U(0x4c7),Buffer.alloc(12)]);
 const entries=[Buffer.concat([T('RIFX'),U(p-8),U(0),U16(0),U16(0),U(0)]),...all.map(([t,d],i)=>Buffer.concat([T(t),U(t==='mmap'?mmapLen:i===0?24:d.length),U(offs[i]),U16(0),U16(0),U(0)]))];
 const mmap=Buffer.concat([U16(hs),U16(es),U(all.length+1),U(all.length+1),Buffer.alloc(8,0xff),U(0xffffffff),...entries]);
 const chunks=all.map(([t,d])=>{const data=t==='imap'?imap:t==='mmap'?mmap:d;return Buffer.concat([T(t),U(data.length),data]);});
 const body=Buffer.concat([T('MV93'),...chunks]);return Buffer.concat([T('RIFX'),U(body.length),body]);}
const vi=v=>{const g=[v&0x7f];v=Math.floor(v/128);while(v>0){g.unshift(0x80|(v&0x7f));v=Math.floor(v/128);}return Buffer.from(g);};
/* an Afterburner (.dcr) movie: resources [[tag, data]]; the first goes into the initial load segment */
function afterburner(res,{le=true}={}){const U=le?u32:u32b,U16=le?u16:u16b,T=t=>le?Buffer.from(t.split('').reverse().join(''),'latin1'):Buffer.from(t,'latin1');
 const fver=vi(0x400),guid=Buffer.concat([U(0xac99e904),U16(0x0070),U16(0x0b36),U(0x00080000),U(0x347a3707)]),fcdr=zlib.deflateSync(Buffer.concat([U16(1),guid,Buffer.from('zlib\0','latin1')]));
 const items=res.map(([t,d],i)=>({id:3+i,tag:t,raw:d,comp:zlib.deflateSync(d)}));const ilsItem=items[0],rest=items.slice(1);
 const ils=zlib.deflateSync(Buffer.concat([vi(ilsItem.id),ilsItem.comp]));let off=ils.length;const placed=rest.map(x=>{const o=off;off+=x.comp.length;return o;});
 const ent=(id,o,comp,raw,tag)=>Buffer.concat([vi(id),vi(o<0?o+0x100000000:o),vi(comp),vi(raw),vi(0),U(tag.split('').reduce((a,c)=>a*256+c.charCodeAt(0),0))]);
 const map=Buffer.concat([vi(0),vi(0),vi(items.length+1),ent(2,0,ils.length,ils.length,'ILS '),ent(ilsItem.id,-1,ilsItem.comp.length,ilsItem.raw.length,ilsItem.tag),...rest.map((x,i)=>ent(x.id,placed[i],x.comp.length,x.raw.length,x.tag))]);
 const abmpData=Buffer.concat([vi(0),vi(map.length),zlib.deflateSync(map)]);
 const body=Buffer.concat([T('FGDM'),T('Fver'),vi(fver.length),fver,T('Fcdr'),vi(fcdr.length),fcdr,T('ABMP'),vi(abmpData.length),abmpData,T('FGEI'),vi(0),ils,...rest.map(x=>x.comp)]);
 return Buffer.concat([T('RIFX'),U(body.length),body]);}

/* ---- HSP3 (E632) ------------------------------------------------------------------------------------------------ */
/* items: strings (mes) or {big: string} (operand written as a 32-bit word) -> start.ax */
function ax(items,enc){const ds=[],cs=[];let dsLen=0;const add=b=>{const at=dsLen;ds.push(b,Buffer.from([0]));dsLen+=b.length+1;return at;};
 add(Buffer.from('bg.png','latin1'));cs.push(u16(0x0008),u16(0x0f));
 for(const it of items){const s=typeof it==='string'?it:it.big;const at=add(enc(s));cs.push(u16(0x200f),u16(0x0f));
  if(typeof it==='string')cs.push(u16(0x0002),u16(at));else cs.push(u16(0x8002),u32(at));cs.push(u16(0x0004),u16(1));}
 const code=Buffer.concat(cs),data=Buffer.concat(ds),h=Buffer.alloc(0x60);h.write('HSP3',0,'latin1');h.writeInt32LE(0x0350,4);
 h.writeInt32LE(0x60,16);h.writeInt32LE(code.length,20);h.writeInt32LE(0x60+code.length,24);h.writeInt32LE(data.length,28);h.writeInt32LE(0x60+code.length+data.length,12);
 return Buffer.concat([h,code,data]);}
/* DPMX pack: files {name: Buffer} (keys: {name: key}) */
function dpmx(files,keys={}){const names=Object.keys(files),n=names.length,data=16+n*32,idx=[];let off=0;
 for(const name of names){const e=Buffer.alloc(32);e.write(name,0,'latin1');e.writeInt32LE(-1,16);e.writeUInt32LE(keys[name]||0,20);e.writeUInt32LE(off,24);e.writeUInt32LE(files[name].length,28);idx.push(e);off+=files[name].length;}
 return Buffer.concat([Buffer.from('DPMX','latin1'),u32(data),u32(n),u32(0),...idx,...names.map(k=>files[k])]);}

/* ---- Clickteam (E633) ------------------------------------------------------------------------------------------- */
const cfChunk=(id,data,{packed=false,flags}={})=>{const body=packed?Buffer.concat([u32(data.length),u32(0),zlib.deflateSync(data)]):data;return Buffer.concat([u16(id),u16(flags??(packed?1:0)),u32(body.length),body]);};
/* texts: [name, frame text 1, frame text 2] */
function pame(texts,{unicode=true,enc=sjis}={}){const E=s=>unicode?Buffer.from(s+'\0','utf16le'):Buffer.concat([enc(s),Buffer.from([0])]);
 const frame=Buffer.concat([cfChunk(0x3334,E('frame1')),cfChunk(0x333d,Buffer.concat([Buffer.alloc(6,1),E(texts[1])]),{packed:true}),cfChunk(0x7f7f,Buffer.alloc(0))]);
 const chunks=Buffer.concat([cfChunk(0x2224,E(texts[0])),cfChunk(0x2229,Buffer.concat([Buffer.alloc(10,2),E(texts[2])]),{packed:true}),cfChunk(0x2230,Buffer.alloc(12,9),{flags:2}),cfChunk(0x3333,frame),cfChunk(0x7f7f,Buffer.alloc(0))]);
 const h=Buffer.concat([Buffer.from(unicode?'PAMU':'PAME','latin1'),u16(0x0302),u16(0),u32(0),u32(285)]);
 return Buffer.concat([Buffer.from('wwww','latin1'),Buffer.alloc(28),h,chunks]);}

/* ---- AGS (E634) ------------------------------------------------------------------------------------------------- */
function scom(strings,enc){const s=Buffer.concat(strings.flatMap(x=>[enc(x),Buffer.from([0])])),gd=Buffer.alloc(8,3),code=Buffer.alloc(12,4);
 return Buffer.concat([Buffer.from('SCOM','latin1'),u32(89),u32(gd.length),u32(code.length/4),u32(s.length),gd,code,s,u32(0)]);}
const PW=Buffer.from('Avis Durgan','latin1');
function traStr(b){const s=Buffer.concat([b,Buffer.from([0])]);for(let i=0;i<s.length;i++)s[i]=(s[i]+PW[i%11])&255;return Buffer.concat([u32(s.length),s]);}
/* pairs [[source Buffer, translation Buffer]] -> .tra (GameID, Dict, TextOpts, end) */
function traFile(pairs){const block=(id,d)=>Buffer.concat([u32(id),u32(d.length),d]);
 const dict=Buffer.concat([...pairs.flatMap(([s,d])=>[traStr(s),traStr(d)]),traStr(Buffer.alloc(0)),traStr(Buffer.alloc(0))]);
 return Buffer.concat([Buffer.from('AGSTranslation\0','latin1'),block(2,Buffer.concat([u32(1234),traStr(Buffer.from('game','latin1'))])),block(1,dict),block(3,Buffer.concat([u32(0),u32(0),u32(0)])),Buffer.from([0xff,0xff,0xff,0xff])]);}
const clib=parts=>Buffer.concat([Buffer.from('CLIB\x1a','latin1'),Buffer.from([30]),Buffer.alloc(32,5),...parts,Buffer.from('CLIB\x01\x02\x03\x04SIGE','latin1')]);

/* ---- SRPG Studio (E635) ----------------------------------------------------------------------------------------- */
function dts(strings,{encrypt=true}={}){const proj=Buffer.concat([u32(7),u32(1),...strings.flatMap(s=>{const b=Buffer.from(s+'\0','utf16le');return [u32(b.length),b,u32(3)];})]);
 const head=Buffer.alloc(168);head.write('SDTS',0,'latin1');head.writeUInt32LE(encrypt?1:0,4);head.writeUInt32LE(1260,8);head.writeUInt32LE(0,20);
 if(!encrypt)return Buffer.concat([head,proj]);const key=crypto.createHash('md5').update(Buffer.from('_dynamic','utf16le').subarray(0,8)).digest();
 return Buffer.concat([head,require('../../services/original-engines/makers.cjs').rc4(key,proj)]);}

/* ---- Java (E636) ------------------------------------------------------------------------------------------------ */
const cpUtf=s=>{const b=utf8(s);return Buffer.concat([u8(1),u16b(b.length),b]);};
/* a class whose constant pool holds the literals (a long between them takes two slots) */
function javaClass(literals){const cp=[cpUtf('jp/game/Main'),Buffer.concat([u8(7),u16b(1)])];let idx=3;const refs=[];
 literals.forEach((s,i)=>{cp.push(cpUtf(s));const u=idx++;cp.push(Buffer.concat([u8(8),u16b(u)]));idx++;if(i===0){cp.push(Buffer.concat([u8(5),Buffer.alloc(8)]));idx+=2;}refs.push(u);});
 cp.push(cpUtf('ascii.png'),Buffer.concat([u8(8),u16b(idx)]));idx+=2;
 return Buffer.concat([u32b(0xcafebabe),u16b(0),u16b(52),u16b(idx),...cp,u16b(0x21),u16b(2)]);}
const props=entries=>Buffer.from(entries.map(([k,v])=>k+'='+[...v].map(c=>c.charCodeAt(0)>127?'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'):c).join('')).join('\n')+'\n','latin1');
const jar=files=>zip({'META-INF/MANIFEST.MF':'Manifest-Version: 1.0\n',...files});

/* ---- MonoGame / XNA (E637) -------------------------------------------------------------------------------------- */
const netStr=s=>{const b=utf8(s);return Buffer.concat([b.length<0x80?u8(b.length):Buffer.from([0x80|(b.length&0x7f),b.length>>7]),b]);};
function xnb(strings,{lz4=false}={}){const body=Buffer.concat([u8(1),netStr('Microsoft.Xna.Framework.Content.StringReader'),u32(0),u8(0),u8(1),...strings.flatMap(s=>[netStr(s),u8(0)])]);
 if(!lz4){const h=Buffer.concat([Buffer.from('XNBw','latin1'),u8(5),u8(0),u32(10+body.length)]);return Buffer.concat([h,body]);}
 const lit=[];let n=body.length-15;const tok=[0xf0];while(n>=255){tok.push(255);n-=255;}tok.push(n);lit.push(Buffer.from(tok),body);
 const packed=Buffer.concat(lit);return Buffer.concat([Buffer.from('XNBw','latin1'),u8(5),u8(0x40),u32(14+packed.length),u32(body.length),packed]);}

/* ---- OHRRPGCE (E638) -------------------------------------------------------------------------------------------- */
const pdp=v=>Buffer.from([(v>>>16)&255,(v>>>24)&255,v&255,(v>>>8)&255]);
function sayLump(boxes,enc){return Buffer.concat(boxes.map(lines=>{const r=Buffer.alloc(400);lines.forEach((l,k)=>enc(l).copy(r,k*38,0,38));return r;}));}
const rpgFile=lumps=>Buffer.concat(Object.entries(lumps).flatMap(([n,d])=>[Buffer.from(n+'\0','latin1'),pdp(d.length),d]));

module.exports={pe,usHeap,gmWin,stxtData,rifxMovie,afterburner,ax,dpmx,pame,scom,traFile,clib,dts,javaClass,props,jar,xnb,netStr,sayLump,rpgFile,sjis,gbk};
