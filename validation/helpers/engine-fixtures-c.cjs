'use strict';
/* E581–E584 synthetic game files for QLIE, Entis GLS, AliceSoft System 3.x and Marble, written from the format specs
   (no game data). Every builder is the inverse of the reader it feeds. */
const zlib=require('node:zlib');
const {sjis,gbk}=require('./engine-fixtures.cjs');
const qlie=require('../../services/original-engines/qlie.cjs'),entis=require('../../services/original-engines/entis.cjs');
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;},i32=n=>{const b=Buffer.alloc(4);b.writeInt32LE(n|0);return b;},u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
const pad=(b,n)=>Buffer.concat([b,Buffer.alloc((n-b.length%n)%n)]);

/* ---- PE with RCDATA / named resources (QLIE RESKEY / TFORM1, Entis IDR_COTOMI) ---------------------------------------- */
function pe(resources){/* resources: [{type, name, data}] */
 const types=[...new Set(resources.map(r=>r.type))];const dirSize=n=>16+8*n;
 let off=dirSize(types.length);const typeAt=new Map(),nameAt=new Map(),langAt=new Map(),dataAt=new Map(),strAt=new Map();
 for(const t of types){typeAt.set(t,off);off+=dirSize(resources.filter(r=>r.type===t).length);}
 for(const r of resources){nameAt.set(r,off);off+=dirSize(1);}
 for(const r of resources){langAt.set(r,off);off+=16;}
 const strs=[...new Set(resources.flatMap(r=>[r.type,r.name]).filter(x=>typeof x==='string'))];for(const s of strs){strAt.set(s,off);off+=2+s.length*2;}off=(off+3)&~3;
 for(const r of resources){dataAt.set(r,off);off+=(r.data.length+3)&~3;}
 const res=Buffer.alloc(off),VA=0x1000;
 const dir=(at,entries)=>{res.writeUInt16LE(entries.filter(e=>typeof e[0]==='string').length,at+12);res.writeUInt16LE(entries.filter(e=>typeof e[0]!=='string').length,at+14);
  entries.forEach(([id,to,leaf],i)=>{res.writeUInt32LE(typeof id==='string'?(0x80000000|strAt.get(id))>>>0:id,at+16+i*8);res.writeUInt32LE(leaf?to:(0x80000000|to)>>>0,at+20+i*8);});};
 dir(0,types.map(t=>[t,typeAt.get(t)]));
 for(const t of types)dir(typeAt.get(t),resources.filter(r=>r.type===t).map(r=>[r.name,nameAt.get(r)]));
 for(const r of resources){dir(nameAt.get(r),[[0x411,langAt.get(r),true]]);const l=langAt.get(r);res.writeUInt32LE(VA+dataAt.get(r),l);res.writeUInt32LE(r.data.length,l+4);r.data.copy(res,dataAt.get(r));}
 for(const s of strs){const a=strAt.get(s);res.writeUInt16LE(s.length,a);res.write(s,a+2,'utf16le');}
 const h=Buffer.alloc(0x200);h.write('MZ',0,'latin1');h.writeUInt32LE(0x40,0x3c);h.write('PE\0\0',0x40,'latin1');const coff=0x44;h.writeUInt16LE(0x14c,coff);h.writeUInt16LE(1,coff+2);h.writeUInt16LE(224,coff+16);
 h.writeUInt16LE(0x0102,coff+18);/* executable, 32-bit: what LoadLibraryEx(AS_DATAFILE) expects of an image header */
 const raw=(res.length+0x1ff)&~0x1ff,virt=(res.length+0xfff)&~0xfff,opt=coff+20;h.writeUInt16LE(0x10b,opt);h.writeUInt32LE(0x400000,opt+28);h.writeUInt32LE(0x1000,opt+32);h.writeUInt32LE(0x200,opt+36);
 h.writeUInt16LE(4,opt+40);h.writeUInt16LE(4,opt+48);h.writeUInt32LE(VA+virt,opt+56);h.writeUInt32LE(0x200,opt+60);h.writeUInt16LE(2,opt+68);h.writeUInt32LE(0x100000,opt+72);h.writeUInt32LE(0x1000,opt+76);h.writeUInt32LE(0x100000,opt+80);h.writeUInt32LE(0x1000,opt+84);h.writeUInt32LE(16,opt+92);
 h.writeUInt32LE(VA,opt+96+16);h.writeUInt32LE(res.length,opt+96+20);
 const sec=opt+224;h.write('.rsrc',sec,'latin1');h.writeUInt32LE(res.length,sec+8);h.writeUInt32LE(VA,sec+12);h.writeUInt32LE(raw,sec+16);h.writeUInt32LE(0x200,sec+20);h.writeUInt32LE(0x40000040,sec+36);
 return Buffer.concat([h,res,Buffer.alloc(raw-res.length)]);}

/* ---- QLIE ------------------------------------------------------------------------------------------------------------ */
const {chain,v3KeyDecrypt,v31Decrypt,nameXor,nameXor31,hash30,hash31}=qlie._internal;
/* "1PC\xFF" with every byte mapped to itself except 0xFF -> "AB" */
function qliePc(plain){const s=plain.toString('latin1').replace(/AB/g,'\xff');const body=Buffer.from(s,'latin1');
 const table=[127,...Array.from({length:128},(_,i)=>i),127,...Array.from({length:127},(_,i)=>i+128),0x41,0x42];
 return Buffer.concat([Buffer.from([0x31,0x50,0x43,0xff]),u32(0),u32(plain.length),Buffer.from(table),u32(body.length),body]);}
/* qliePack({name: Buffer}, {version:'1.0'|'2.0'|'3.0'|'3.1', packed:Set(names), keyFile, gameKey, method:1|2}) */
function qliePack(files,{version='2.0',packed=new Set(),keyFile=null,gameKey=null,method=1,packKeyfile=null}={}){
 const [major,minor]=version.split('.').map(Number),tailBlock=Buffer.alloc(0x400);for(let i=0;i<tailBlock.length;i++)tailBlock[i]=(i*37+11)&255;
 const arcKey=major<3?0:(((minor===1?hash31:hash30)(tailBlock.subarray(0,0x100))&0x0FFFFFFF)>>>0);
 const datas=[],index=[];let off=0,kf=keyFile;
 const list=Object.entries(files);if(packKeyfile)list.unshift(['pack_keyfile.dat',packKeyfile]);
 for(const [name,plain0] of list){let plain=Buffer.from(plain0);const isPacked=packed.has(name);if(isPacked)plain=qliePc(plain);const buf=Buffer.from(plain),len=buf.length;let m=1;
  if(major===1)chain(buf,len,(0^0xFEC9753E)>>>0,true);
  else if(major===2)chain(buf,len,((len+0)>>>0^0xFEC9753E)>>>0,true);
  else if(minor===0){const raw=sjis(name.replace(/\//g,'\\'));if(kf)v3KeyDecrypt(buf,len,{rawName:raw,arcKey,keyFile:kf,gameKey},true);else chain(buf,len,(((len+arcKey)>>>0)^0xFEC9753E)>>>0,true);}
  else{m=name==='pack_keyfile.dat'?2:method;v31Decrypt(buf,len,{name:name.replace(/\//g,'\\'),method:m,arcKey,keyFile:kf},true);}
  datas.push(buf);let nb;
  if(major===3&&minor===1){nb=nameXor31(Buffer.from(name.replace(/\//g,'\\'),'utf16le'),arcKey);index.push(u16(nb.length/2));}
  else{nb=sjis(name.replace(/\//g,'\\'));nameXor(nb,major===1?(0xC4^0x3E):nb.length+((major===3?arcKey:0xC4)^0x3E));index.push(u16(nb.length));}
  index.push(nb,u64(off),u32(buf.length),u32(plain0.length),i32(isPacked?1:0),i32(m));if(major>1)index.push(u32(0));off+=buf.length;
  if(name==='pack_keyfile.dat')kf=Buffer.from(plain0);}
 const idx=Buffer.concat(index),footer=Buffer.alloc(0x1C);footer.write(`FilePackVer${major}.${minor}`,0,'latin1');footer.writeInt32LE(list.length,0x10);footer.writeBigInt64LE(BigInt(off),0x14);
 return Buffer.concat([...datas,idx,tailBlock,footer]);}
/* a Delphi form whose IconKeyImage holds the 3.0 game key */
/* Delphi binary form: "TPF0", class, name, properties (name, type, value) ending 0, child objects, 0 */
const pstr=s=>Buffer.concat([Buffer.from([s.length]),Buffer.from(s,'latin1')]);
const tform=gameKey=>Buffer.concat([Buffer.from('TPF0','latin1'),pstr('TForm1'),pstr('Form1'),pstr('Caption'),Buffer.from([6]),pstr('Game'),Buffer.from([0]),
 pstr('TImage'),pstr('IconKeyImage'),pstr('Picture.Data'),Buffer.from([0x0a]),u32(0x106),Buffer.from('\x05TIcon','latin1'),gameKey,Buffer.from([0,0,0])]);

/* ---- Entis ----------------------------------------------------------------------------------------------------------- */
const lit=(s,pool)=>{if(pool&&pool.has(s))return Buffer.concat([u32(0x80000000),i32(pool.get(s))]);return Buffer.concat([u32(s.length),Buffer.from(s,'utf16le')]);};
/* ops: ['s', text] Load String, ['i', n] Load Integer, ['call', name, argc] */
function csx(ops,{pooled=[]}={}){const pool=new Map(pooled.map((s,i)=>[s,i]));const code=[];
 for(const o of ops){if(o[0]==='s')code.push(Buffer.from([2,0,6]),lit(o[1],pool));else if(o[0]==='i')code.push(Buffer.from([2,0,4]),u32(o[1]));else code.push(Buffer.from([8,5]),i32(o[2]),lit(o[1],pool));code.push(Buffer.from([1]));}
 const img=Buffer.concat(code),cs=Buffer.concat([i32(pooled.length),...pooled.flatMap(s=>[i32(s.length),Buffer.from(s,'utf16le'),i32(0)])]);
 const rec=(id,d)=>Buffer.concat([Buffer.from(id,'latin1'),u64(d.length),d]);
 const head=Buffer.alloc(0x40);head.write('Entis\x1a',0,'latin1');head.writeUInt32LE(0x02000100,8);head.write('Cotopha Image file',0x10,'latin1');
 return Buffer.concat([head,rec('header  ',Buffer.alloc(36)),rec('image   ',img),rec('conststr',cs)]);}
/* a .noa: files {path: Buffer} (one level of folders), bshf: names encrypted with the password */
function noa(files,{password=null,encrypt=new Set()}={}){
 const tree={};for(const [p,d] of Object.entries(files)){const parts=p.split('/');if(parts.length===1)tree[p]=d;else{(tree[parts[0]]=tree[parts[0]]||{})[parts[1]]=d;}}
 const head=Buffer.alloc(0x40);head.write('Entis\x1a',0,'latin1');head.writeUInt32LE(0x02000400,8);head.write('ERISA-Archive file',0x10,'latin1');
 const chunks=[head];let pos=0x40;
 const writeDir=(node,prefix)=>{/* entries are written after the directory record; their offsets are relative to it */
  const names=Object.keys(node),at=pos;const sizeOfEntry=n=>32+4+4+Buffer.byteLength(n,'latin1')*2+1;let dirLen=4+names.reduce((s,n)=>s+sizeOfEntry(n),0);
  const rec=Buffer.alloc(16+dirLen);chunks.push(rec);pos+=rec.length;rec.write('DirEntry',0,'latin1');rec.writeBigUInt64LE(BigInt(dirLen),8);rec.writeInt32LE(names.length,16);let p=20;
  for(const n of names){const v=node[n],nameB=Buffer.concat([sjis(n),Buffer.from([0])]),entryAt=pos;let attr=0,code=0,size=0;
   if(Buffer.isBuffer(v)){const full=prefix?prefix+'/'+n:n;let data=v;size=v.length;if(encrypt.has(full)){code=0x40000000;data=Buffer.concat([entis.bshf(pad(v,32),password,true),Buffer.alloc(4)]);}
    const fr=Buffer.concat([Buffer.from('filehdr\0','latin1'),u64(code?data.length:data.length),data]);chunks.push(fr);pos+=fr.length;}
   else{attr=0x10;const filler=Buffer.alloc(16);filler.write('dirhdr\0\0',0,'latin1');chunks.push(filler);pos+=16;writeDir(v,prefix?prefix+'/'+n:n);}
   rec.writeBigUInt64LE(BigInt(size),p);rec.writeUInt32LE(attr,p+8);rec.writeUInt32LE(code,p+12);rec.writeBigUInt64LE(BigInt(entryAt-at),p+16);p+=32;
   rec.writeUInt32LE(0,p);p+=4;rec.writeUInt32LE(nameB.length,p);p+=4;nameB.copy(rec,p);p+=nameB.length;}
  rec.writeBigUInt64LE(BigInt(p-16),8);};
 writeDir(tree,'');return Buffer.concat(chunks);}

/* ---- AliceSoft ------------------------------------------------------------------------------------------------------- */
/* ALD of one volume (xsys35c ald_write) */
function ald(entries,volume=1){const ptr=(arr,size,st)=>{st.s+=(size+0xff)>>8;arr.push(st.s&255,st.s>>8&255,st.s>>16&255);};const st={s:0},ptrs=[];
 const hdr=e=>(Buffer.byteLength(e.name)+1+31)&~0xf;const mine=entries.filter(e=>e.volume===volume);
 ptr(ptrs,(mine.length+2)*3,st);ptr(ptrs,entries.length*3,st);for(const e of mine)ptr(ptrs,hdr(e)+e.data.length,st);
 const link=[],count={};for(const e of entries){count[e.volume]=(count[e.volume]||0)+1;link.push(e.volume,count[e.volume]&255,count[e.volume]>>8);}
 const files=mine.map(e=>{const h=Buffer.alloc(hdr(e));h.writeUInt32LE(h.length,0);h.writeUInt32LE(e.data.length,4);h.write(e.name,16,'latin1');return pad(Buffer.concat([h,e.data]),256);});
 const foot=Buffer.concat([u32(0x14c4e),u32(0x10),u32(mine.length<<8|volume),u32(0)]);
 return Buffer.concat([pad(Buffer.from(ptrs),256),pad(Buffer.from(link),256),...files,foot]);}
/* SCO page: code pieces (Buffer | string as Shift-JIS message) */
function sco(parts,{version='S351',name='page.adv'}={}){const code=Buffer.concat(parts.map(p=>typeof p==='string'?sjis(p):Buffer.from(p)));const hdr=0x20,h=Buffer.alloc(hdr);
 h.write(version,0,'latin1');h.writeUInt32LE(hdr,4);h.writeUInt32LE(hdr+code.length,8);h.writeUInt32LE(0,12);h.writeUInt16LE(name.length,16);h.write(name,18,'latin1');return Buffer.concat([h,code]);}
const A=Buffer.from('A'),R=Buffer.from('R');
const num=n=>n<0x34?Buffer.from([0x40|n]):Buffer.from([(n>>8)&0x3f,n&255]);
const expr=(...xs)=>Buffer.concat([...xs.map(num),Buffer.from([0x7f])]);
/* System39.ain with MSGI (and an empty HEL0) */
function ain39(messages){const body=Buffer.concat([Buffer.from('HEL0','latin1'),u32(0),u32(0),Buffer.from('MSGI','latin1'),u32(0),u32(messages.length),...messages.map(m=>Buffer.concat([sjis(m),Buffer.from([0])]))]);
 const d=Buffer.concat([Buffer.from('AINI','latin1'),u32(1),body]);for(let i=4;i<d.length;i++)d[i]=((d[i]>>>2)|(d[i]<<6))&255;return d;}
/* AFA v2 (System4 resources) */
function afa(files){const idx=Buffer.concat(Object.entries(files).map(([n,d],i,all)=>{const nb=pad(Buffer.from(n,'latin1'),4),off=8+all.slice(0,i).reduce((s,[,x])=>s+x.length,0);return Buffer.concat([u32(n.length),u32(nb.length),nb,u32(0),u32(0),u32(off),u32(d.length)]);}));
 const z=zlib.deflateSync(idx),dataStart=44+z.length,h=Buffer.alloc(44);h.write('AFAH',0,'latin1');h.writeUInt32LE(0x1c,4);h.write('AlicArch',8,'latin1');h.writeUInt32LE(2,16);h.writeUInt32LE(1,20);h.writeUInt32LE(dataStart,24);
 h.write('INFO',28,'latin1');h.writeUInt32LE(z.length+16,32);h.writeUInt32LE(idx.length,36);h.writeUInt32LE(Object.keys(files).length,40);
 const data=Buffer.concat(Object.values(files));return Buffer.concat([h,z,Buffer.from('DATA','latin1'),u32(data.length+8),data]);}

/* ---- Marble ---------------------------------------------------------------------------------------------------------- */
/* entries {name: Buffer}; layout 'len' (count, name length, entries) or 'fixed16' */
function mbl(files,{layout='len',nameLen=16}={}){const names=Object.keys(files),n=names.length,nl=layout==='fixed16'?16:nameLen,start=layout==='fixed16'?4:8,isz=(nl+8)*n;
 let off=start+isz;const idx=[],data=[];for(const name of names){const nb=Buffer.alloc(nl),d=files[name];const dot=name.lastIndexOf('.');
  if(layout==='fixed16'&&dot>0){nb.write(name.slice(0,dot),0,'latin1');nb.write(name.slice(dot+1),dot+1,'latin1');}else nb.write(name,0,'latin1');
  idx.push(nb,u32(off),u32(d.length));data.push(d);off+=d.length;}
 return Buffer.concat([u32(n),...(layout==='fixed16'?[]:[u32(nl)]),...idx,...data]);}
const marbleScript=(strings,enc=sjis)=>Buffer.concat(strings.flatMap(s=>[enc(s),Buffer.from([0])]));

module.exports={pe,qliePc,qliePack,tform,csx,noa,ald,sco,A,R,num,expr,ain39,afa,mbl,marbleScript,u32,u16,sjis,gbk};
