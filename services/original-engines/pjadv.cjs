// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E641 PJADV (Pajamas Adventure System, ぱじゃまソフト and the brands using it). Family F4a.
   Format references (read, not copied): GARbro ArcFormats/Pajamas/ArcGameDat.cs (morkt, MIT) for the archive and the
   textdata cipher; BlackDragonHunt pjadv_dump.py (WTFPL) for the scenario layout.
     archive.dat  "GAMEDAT PACK" (v1, names 16 bytes) / "GAMEDAT PAC2" (v2, names 32 bytes), i32 count @0x0C, count
                  names from 0x10, then count × {u32 offset, u32 size}; offsets from the end of that index
     textdata.bin "PJADV_TF0001", u32 count, then the strings, each ending in two NULs. Stored XORed with a key that
                  starts at 0xC5 and grows by 0x5C a byte when it begins 95 6B 3C 9D 63 (the cipher of "PJADV")
     scenario.dat "PJADV_SF0001", u32 count, code from 0x20: u8 size in dwords (with this one), u24 opcode, then
                  (size - 1) dwords. 0x800003: dword 1 the speaker's and dword 2 the line's textdata offset (0 = none);
                  0x010108: dword 0 a choice; 0x030003: dword 1 the choice prompt
   The two files belong together, so a scene is the pair: read() gives "PJSC" + u32 scenario length + scenario +
   textdata, and a patch's own pair (loose or in its archive) is read the same way. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');

function list(file){const h=kit.head(file,0x10);if(h.length<0x10||h.toString('latin1',0,11)!=='GAMEDAT PAC')return null;const v=h[11]===0x4b?1:h[11]===0x32?2:0;if(!v)return null;
 const count=h.readInt32LE(12);if(count<=0||count>0xfffff)return null;const nl=v===1?16:32,size=kit.size(file),idx=kit.readAt(file,0x10,count*(nl+8));if(idx.length<count*(nl+8))return null;
 const base=0x10+count*(nl+8),out=[];for(let i=0;i<count;i++){const nb=kit.cstr(idx,i*nl,i*nl+nl),p=count*nl+i*8,offset=base+idx.readUInt32LE(p),sz=idx.readUInt32LE(p+4);if(!nb||offset+sz>size)return null;
  out.push({name:kit.SJIS.decode(nb),offset,size:sz});}
 return out;}
function decrypt(b){if(b.length>=5&&b[0]===0x95&&b[1]===0x6b&&b[2]===0x3c&&b[3]===0x9d&&b[4]===0x63){const o=Buffer.from(b);let k=0xc5;for(let i=0;i<o.length;i++){o[i]^=k;k=(k+0x5c)&255;}return o;}return b;}
const str=(t,off)=>{if(!off||off>=t.length)return null;let e=off;while(e+1<t.length&&!(t[e]===0&&t[e+1]===0))e++;if(e+1>=t.length&&t[e]!==0)e=t.length;return t.subarray(off,e);};
/* [{kind, bytes}] in code order */
function walk(scn,text){if(scn.toString('latin1',0,12)!=='PJADV_SF0001'||text.toString('latin1',0,12)!=='PJADV_TF0001')return null;const out=[];
 for(let p=0x20;p+4<=scn.length;){const n=scn[p],op=scn.readUIntLE(p+1,3);if(!n)break;const d=p+4,end=p+n*4;if(end>scn.length)break;const dw=k=>d+k*4+4<=end?scn.readUInt32LE(d+k*4):0;
  if(op===0x800003){const nm=str(text,dw(1)),s=str(text,dw(2));if(nm&&nm.length)out.push({kind:'name',bytes:nm});if(s)out.push({kind:'say',bytes:s});}
  else if(op===0x010108){const s=str(text,dw(0));if(s)out.push({kind:'choice',bytes:s});}
  else if(op===0x030003){const s=str(text,dw(1));if(s)out.push({kind:'prompt',bytes:s});}
  p=end;}
 return out;}
const pack=(scn,text)=>{const h=Buffer.alloc(8);h.write('PJSC',0,'latin1');h.writeUInt32LE(scn.length,4);return Buffer.concat([h,scn,decrypt(text)]);};
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf);let scn,text;
 if(b.toString('latin1',0,4)==='PJSC'){const n=b.readUInt32LE(4);scn=b.subarray(8,8+n);text=b.subarray(8+n);}else return {lines:[],anchors:[]};
 const w=walk(scn,text);if(!w)return {lines:[],anchors:[]};const dec=kit.decoder(w.map(x=>x.bytes)),lines=[];
 for(const x of w){const t=kit.trimBoth(dec.decode(x.bytes).replace(/\\n/g,'\n'));if(t)lines.push(t);}return {lines,anchors:[]};}

/* the scenario / textdata pairs of a folder: loose files win over archived ones (scenario.dat + textdata.bin, and the
   localised pairs scenarioeng.dat + textdataeng.bin share the suffix) */
const SCN=/^scenario(.*)\.dat$/i,TXT=/^textdata(.*)\.bin$/i;
function archives(dir){return kit.files(dir,{name:/\.(dat|pak|pac)$/i,magic:'GAMEDAT PAC'}).filter(f=>{const l=list(f);return l&&l.some(e=>SCN.test(path.posix.basename(e.name))||TXT.test(path.posix.basename(e.name)));});}
function scenes(dir){const scn=new Map(),txt=new Map();
 for(const a of archives(dir))for(const e of list(a)){const n=path.posix.basename(e.name.replace(/\\/g,'/'));let m;if((m=SCN.exec(n)))scn.set(m[1].toLowerCase(),()=>kit.readAt(a,e.offset,e.size));else if((m=TXT.exec(n)))txt.set(m[1].toLowerCase(),()=>kit.readAt(a,e.offset,e.size));}
 for(const f of kit.files(dir,{name:/\.(dat|bin)$/i,subs:['','data','pjadv']})){const n=path.basename(f);let m;if(kit.head(f,12).toString('latin1')==='PJADV_SF0001'&&(m=SCN.exec(n)))scn.set(m[1].toLowerCase(),()=>fs.readFileSync(f));else if((m=TXT.exec(n)))txt.set(m[1].toLowerCase(),()=>fs.readFileSync(f));}
 const out=[];for(const [k,r] of scn){const t=txt.get(k);if(t)out.push({name:'scenario'+k+'.dat',read:()=>pack(r(),t())});}
 return out.sort((a,b)=>a.name.localeCompare(b.name));}
const engine={id:'pjadv',hint:'archive.dat（scenario.dat + textdata.bin）',scenes,archives:scenes,
 sources:dir=>[...archives(dir),...kit.files(dir,{name:/^(scenario.*\.dat|textdata.*\.bin)$/i,subs:['','data','pjadv']})],parse,test:n=>SCN.test(n)||TXT.test(n)};
module.exports={engine,parse,list,decrypt,walk,pack};
