'use strict';
/* E570–E572 synthetic files for System-NNN, codeX RScript (Liar-soft) and AST, written exactly as the readers' header
   comments describe the formats (see engine-fixtures.cjs for the shared encoders). */
const {sjis}=require('./engine-fixtures.cjs');

/* ---- System-NNN (E570) ----------------------------------------------------------------------------------------- */
/* items: [{say:'…'} | {choices:['…','…']} | {voice:true}] -> .spt, dword-XOR'd with key (0xFFFFFFFF) unless plain */
function nnnSpt(items,{enc=sjis,key=0xffffffff,plain=false}={}){const msgs=[],strs=[],cmds=[];
 for(const it of items){if(it.say!==undefined){cmds.push([6,0x66660006,0x22220001,msgs.length,0,0]);msgs.push(it.say);}
  else if(it.choices){const idx=it.choices.map(c=>{strs.push(c);return strs.length-1;});cmds.push([3+1+idx.length+3+1,0x66660006,0x22220006,idx.length,...idx,0,0,0,0]);}
  else cmds.push([5,0x66660007,0x33330008,1,2]);}
 const head=24,cmdLen=cmds.reduce((a,c)=>a+c.length,0),msgTable=head+cmdLen,strTable=msgTable+msgs.length,dataAt=strTable+strs.length;
 const data=[];let at=dataAt;const place=s=>{const b=Buffer.concat([enc(s),Buffer.from([0])]),pad=(4-b.length%4)%4,p=at;data.push(b,Buffer.alloc(pad));at+=(b.length+pad)/4;return p;};
 const msgPtr=msgs.map(place),strPtr=strs.map(place);
 const h=new Array(head).fill(0);h[0]=head;h[1]=0x66660001;h[2]=0x55550001;h[4]=msgs.length;h[5]=msgTable;h[6]=strs.length;h[7]=strTable;
 const words=[...h,...cmds.flat(),...msgPtr,...strPtr],w=Buffer.alloc(words.length*4);words.forEach((v,i)=>w.writeUInt32LE(v>>>0,i*4));
 const out=Buffer.concat([w,...data]);if(!plain)for(let i=0;i+4<=out.length;i+=4)out.writeUInt32LE((out.readUInt32LE(i)^key)>>>0,i);return out;}

/* ---- codeX RScript / Liar-soft (E571) -------------------------------------------------------------------------- */
function gsc(strings,{enc=sjis,commands=Buffer.from([0x51,0,1,0,0,0,2,0,0,0])}={}){const bodies=strings.map(s=>Buffer.concat([Buffer.isBuffer(s)?s:enc(s),Buffer.from([0])]));
 const offs=[];let o=0;for(const b of bodies){offs.push(o);o+=b.length;}const decl=Buffer.alloc(offs.length*4);offs.forEach((v,i)=>decl.writeInt32LE(v,i*4));const def=Buffer.concat(bodies);
 const head=Buffer.alloc(36),size=36+commands.length+decl.length+def.length;head.writeInt32LE(size,0);head.writeInt32LE(36,4);head.writeInt32LE(commands.length,8);head.writeInt32LE(decl.length,12);head.writeInt32LE(def.length,16);
 return Buffer.concat([head,commands,decl,def]);}
function xfl(files){const names=Object.keys(files),idx=Buffer.alloc(40*names.length),datas=[];let off=0;
 names.forEach((n,i)=>{const nb=sjis(n);nb.copy(idx,i*40,0,Math.min(31,nb.length));idx.writeUInt32LE(off,i*40+32);idx.writeUInt32LE(files[n].length,i*40+36);datas.push(files[n]);off+=files[n].length;});
 const h=Buffer.alloc(12);h.writeUInt32LE(0x0001424c,0);h.writeUInt32LE(idx.length,4);h.writeInt32LE(names.length,8);return Buffer.concat([h,idx,...datas]);}

/* ---- AST (E572) ------------------------------------------------------------------------------------------------ */
/* an LZSS stream of literals only (valid input for any LZSS decoder) */
function lzssLiterals(data){const out=[];for(let i=0;i<data.length;i+=8){const chunk=data.subarray(i,i+8);out.push(Buffer.from([0xff]),chunk);}return Buffer.concat(out);}
function astArc(files,{version=2,pack=true}={}){
 const entries=Object.keys(files).map(n=>{const raw=Buffer.from(files[n]);let body=raw;if(version===2){const x=Buffer.from(raw.map(c=>c^0xff));body=pack?lzssLiterals(x):x;}return {n,raw,body};});
 const nameBufs=entries.map(e=>{const b=sjis(e.n);return version===2?Buffer.from(b.map(c=>c^0xff)):b;});
 const idxLen=entries.reduce((a,e,i)=>a+9+nameBufs[i].length,0);let off=8+idxLen;const idx=[];
 entries.forEach((e,i)=>{const h=Buffer.alloc(9);h.writeUInt32LE(off,0);h.writeUInt32LE(e.raw.length,4);h[8]=nameBufs[i].length;idx.push(h,nameBufs[i]);off+=e.body.length;});
 const head=Buffer.alloc(8);head.write(version===2?'ARC2':'ARC1','latin1');head.writeInt32LE(entries.length,4);
 return Buffer.concat([head,...idx,...entries.map(e=>e.body)]);}
module.exports={nnnSpt,gsc,xfl,lzssLiterals,astArc};
