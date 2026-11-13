// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E586 NekoSDK (NEKOPACK4 / ADVSCRIPT2; ~30 company releases, 10 since 2016). Format references (read, not copied): GARbro
   ArcFormats/NekoSDK/ArcPAK.cs + ArcDAT.cs (morkt, MIT) and the GPL-3.0 notes of GalTransl-GalGameReverse-Skill
   (engines/nekosdk.md, python/archives/nekopack.py, python/engines/nekosdk.py), which follow SExtractor extract_NekoSDK.py.
     *.pak   "NEKOPACK4" + mode "A" (index from 14, u32 index length at 10) or "S" (index from 10, + 12); entries
             {u32 name length incl. NUL (0 ends), name cp932, u32 offset, u32 size}, offset / size XOR the signed sum of the
             name bytes. A member: its first 4 bytes XOR a rolling key (size / 8 + 0x22, shifted left 3 after each byte), then
             a zlib stream, the last 4 bytes are the unpacked length (size includes them)
     *.dat   no magic, entries of 0x8C bytes {char name[0x80], u32 unpacked, u32 size, u32 offset}, the three dwords XOR
             0xCACACA; the first offset is the index size (count + 1 entries, the last is a sentinel); unpacked != 0 means
             the stock LZSS
     script  "NEKOSDK_ADVSCRIPT2" then commands: u32 length + the command name ("[テキスト表示]" shows text) followed by
             two length-prefixed strings {u32 length incl. NUL, bytes, NUL}: the speaker and the message (real CRLF inside)
   Only [テキスト表示] lines are read (the log command repeats them; choices have no public description), in script
   order, speaker first when it is not empty. NekoPack 1–3 ("NEKO" + "PACK", names stored as hashes) is a different
   engine and is left to the GARbro fallback. */
const kit=require('./kit.cjs');
const MAGIC='NEKOSDK_ADVSCRIPT2';
const CMD_SHOW=Buffer.from('5b8365834c83588367955c8ea65d','hex');

/* ---- *.pak ------------------------------------------------------------------------------------------------------ */
function pakList(file){const h=kit.head(file,14);if(h.length<14||h.toString('latin1',0,9)!=='NEKOPACK4')return null;
 const mode=String.fromCharCode(h[9]);if(mode!=='A'&&mode!=='S')return null;const fsz=kit.size(file);
 const start=mode==='A'?14:10,end=start+h.readUInt32LE(10)+(mode==='A'?0:12);if(end>fsz||end<=start)return null;
 const idx=kit.readAt(file,start,end-start),out=[];let p=0;
 while(p+4<=idx.length){const nl=idx.readUInt32LE(p);p+=4;if(!nl)break;if(nl>256||p+nl+8>idx.length)return null;
  let key=0;for(let i=0;i<nl;i++)key+=idx[p+i]<<24>>24;const z=idx.indexOf(0,p),name=kit.SJIS.decode(idx.subarray(p,z<0||z>=p+nl?p+nl:z));p+=nl;
  const offset=(idx.readUInt32LE(p)^key)>>>0,size=(idx.readUInt32LE(p+4)^key)>>>0;p+=8;if(!name||offset+size>fsz)return null;out.push({name,offset,size});}
 return out.length?out:null;}
function pakRead(file,e){const raw=kit.readAt(file,e.offset,e.size);if(e.size<8)return raw;
 const b=Buffer.from(raw);let key=Math.floor(e.size/8)+0x22;for(let i=0;i<4;i++){b[i]^=key&255;key=(key<<3)>>>0;}
 try{return kit.inflate(b.subarray(0,e.size-4));}catch{return raw;}}

/* ---- *.dat ------------------------------------------------------------------------------------------------------ */
function datList(file){const fsz=kit.size(file);if(fsz<0x8c*2)return null;const first=(kit.head(file,0x8c).readUInt32LE(0x88)^0xcacaca)>>>0;
 if(!first||first>=fsz||first%0x8c)return null;const count=first/0x8c-1;if(count<1||count>200000)return null;
 const idx=kit.readAt(file,0,count*0x8c),out=[];
 for(let i=0;i<count;i++){const p=i*0x8c;if(!idx[p])return null;const z=idx.indexOf(0,p),name=idx.toString('latin1',p,Math.min(z,p+0x80));
  const unpacked=(idx.readUInt32LE(p+0x80)^0xcacaca)>>>0,size=(idx.readUInt32LE(p+0x84)^0xcacaca)>>>0,offset=(idx.readUInt32LE(p+0x88)^0xcacaca)>>>0;
  if(offset<first||offset+size>fsz||!/^[\x20-\x7e]+$/.test(name))return null;out.push({name,offset,size,unpacked});}
 return out;}
const datRead=(file,e)=>{const raw=kit.readAt(file,e.offset,e.size);return e.unpacked?kit.lzss(raw,e.unpacked):raw;};

const list=file=>{const h=kit.head(file,9).toString('latin1');return h==='NEKOPACK4'?pakList(file):datList(file);};
const read=(file,e)=>kit.head(file,9).toString('latin1')==='NEKOPACK4'?pakRead(file,e):datRead(file,e);
const isArchive=file=>{try{return !!list(file);}catch{return false;}};

/* ---- ADVSCRIPT2 -------------------------------------------------------------------------------------------------- */
function shown(buf){const out=[];if(buf.toString('latin1',0,MAGIC.length)!==MAGIC)return out;let end=MAGIC.length;
 for(let at=buf.indexOf(CMD_SHOW,end);at>=0;at=buf.indexOf(CMD_SHOW,at+1)){
  /* a marker inside the previous record's strings is not a command */
  if(at<end||at<4)continue;const size=buf.readUInt32LE(at-4);if((size!==CMD_SHOW.length&&size!==CMD_SHOW.length+1)||at+size>buf.length)continue;
  let p=at+size;const f=[];for(let k=0;k<2;k++){if(p+4>buf.length)break;const n=buf.readUInt32LE(p);if(n<1||p+4+n>buf.length||buf[p+3+n]!==0)break;f.push(buf.subarray(p+4,p+3+n));p+=4+n;}
  if(f.length===2){out.push({name:f[0],text:f[1]});end=p;}}
 return out;}
function parse(buf){const list=shown(buf);if(!list.length)return {lines:[],anchors:[]};
 const dec=kit.decoder(list.flatMap(x=>[x.name,x.text])),lines=[];
 for(const x of list){const n=kit.trimBoth(dec.decode(x.name)),t=kit.trimBoth(dec.decode(x.text).replace(/\r\n|\r/g,'\n'));if(n)lines.push(n);if(t)lines.push(t);}
 return {lines,anchors:[]};}

const base=kit.engine({id:'nekosdk',hint:'*.pak（NEKOPACK4）/ 无魔数 .dat（ADVSCRIPT2）',
 archives:{name:/\.(pak|dat)$/i,list,read,entry:/\.txt$/i},parse});
/* a loose script (a patch folder) is a .txt that starts with the ADVSCRIPT2 magic */
const looseTxt=dir=>kit.files(dir,{name:/\.txt$/i,magic:MAGIC,subs:['','script','Script'],max:20000});
const engine={...base,
 scenes(dir){const m=new Map(base.scenes(dir).map(s=>[s.name.toLowerCase(),s]));for(const f of looseTxt(dir)){const n=require('node:path').basename(f);m.set(n.toLowerCase(),{name:n,read:()=>require('node:fs').readFileSync(f)});}
  return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 sources:dir=>[...base.sources(dir),...looseTxt(dir)],test:()=>false};
engine.archives=engine.scenes;
module.exports={engine,parse,shown,pakList,pakRead,datList,datRead,isArchive};
