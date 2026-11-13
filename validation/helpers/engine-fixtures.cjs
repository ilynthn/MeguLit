'use strict';
/* E565 synthetic game files for engines MeguLit has no real copy of. Every builder writes the format exactly as the
   reader's header comment describes it (the public specs it cites), so a test proves the reader follows the spec. A
   real game can still differ; the notes (ENGINE-ADAPTATION-NOTES) list what each engine still needs a real copy for. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const sjis=s=>{/* Shift-JIS encoder for the characters the fixtures use, via the decoder's inverse */
 const out=[];for(const ch of s){const c=ch.codePointAt(0);if(c<0x80){out.push(c);continue;}const b=SJ.get(ch);if(!b)throw Error('no sjis for '+ch);out.push(...b);}return Buffer.from(out);};
const SJ=(()=>{const m=new Map(),d=new TextDecoder('shift_jis');for(let a=0x81;a<=0xfc;a++){if(a>0x9f&&a<0xe0)continue;for(let b=0x40;b<=0xfc;b++){if(b===0x7f)continue;const s=d.decode(Buffer.from([a,b]));if(s.length===1&&s!=='�'&&!m.has(s))m.set(s,[a,b]);}}return m;})();
const GB=(()=>{const m=new Map(),d=new TextDecoder('gbk');for(let a=0x81;a<=0xfe;a++)for(let b=0x40;b<=0xfe;b++){if(b===0x7f)continue;const s=d.decode(Buffer.from([a,b]));if(s.length===1&&s!=='�'&&!m.has(s))m.set(s,[a,b]);}return m;})();
const gbk=s=>{const out=[];for(const ch of s){const c=ch.codePointAt(0);if(c<0x80){out.push(c);continue;}const b=GB.get(ch);if(!b)throw Error('no gbk for '+ch);out.push(...b);}return Buffer.from(out);};

/* ---- Majiro ---------------------------------------------------------------------------------------------------- */
const majiro=require('../../services/original-engines/majiro.cjs');
/* ops: [['line',n],['text','…'],['ctrl','n'],['proc'],['ldstr','…'],['syscallp',hash,argc],['ldc',n],['add'],['st',flags,hash,off],['br',off],['switch',[..]]] */
function mjoCode(ops,enc=sjis){const parts=[];const u16=v=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;},u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;};
 const str=s=>{const b=enc(s);return Buffer.concat([u16(b.length+1),b,Buffer.from([0])]);};
 for(const [op,...a] of ops){switch(op){
  case 'line':parts.push(u16(0x83a),u16(a[0]));break;
  case 'text':parts.push(u16(0x840),str(a[0]));break;
  case 'ctrl':parts.push(u16(0x842),str(a[0]));break;
  case 'proc':parts.push(u16(0x841));break;
  case 'ldstr':parts.push(u16(0x801),str(a[0]));break;
  case 'ldc':parts.push(u16(0x800),u32(a[0]));break;
  case 'add':parts.push(u16(0x118));break;
  case 'st':{const o=Buffer.alloc(2);o.writeInt16LE(a[2]);parts.push(u16(0x1b0),u16(a[0]),u32(a[1]),o);}break;
  case 'syscallp':parts.push(u16(0x835),u32(a[0]),u16(a[1]));break;
  case 'callp':parts.push(u16(0x810),u32(a[0]),u32(0),u16(a[1]));break;
  case 'br':parts.push(u16(0x82c),u32(a[0]));break;
  case 'alloca':parts.push(u16(0x829),u16(a[0].length),Buffer.from(a[0]));break;
  case 'switch':parts.push(u16(0x850),u16(a[0].length),...a[0].map(u32));break;
  case 'ret':parts.push(u16(0x82b));break;
  default:throw Error('op '+op);}}
 return Buffer.concat(parts);}
function mjo(ops,{encrypted=true,enc}={}){const code=mjoCode(ops,enc),h=Buffer.alloc(28);
 h.write(encrypted?'MajiroObjX1.000\0':'MajiroObjV1.000\0','latin1');h.writeUInt32LE(0,16);h.writeUInt32LE(0,20);h.writeInt32LE(1,24);
 const fn=Buffer.alloc(8);fn.writeUInt32LE(majiro.hash32(Buffer.from('main@GLOBAL')),0);const sz=Buffer.alloc(4);sz.writeUInt32LE(code.length);
 return Buffer.concat([h,fn,sz,encrypted?majiro.crypt(code):code]);}
function majiroArc(files,version=3){const names=Object.keys(files),count=names.length,entry=4*(version+1);
 const tableSize=(count+(version===1?1:0))*entry,namesBuf=Buffer.concat(names.map(n=>Buffer.concat([sjis(n),Buffer.from([0])]))),dataAt=0x1c+tableSize+namesBuf.length;
 const h=Buffer.alloc(0x1c);h.write('MajiroArcV'+version+'.000\0','latin1');h.writeInt32LE(count,16);h.writeUInt32LE(0x1c+tableSize,20);h.writeUInt32LE(dataAt,24);
 const table=Buffer.alloc(tableSize),datas=[];let off=dataAt;
 names.forEach((n,i)=>{const at=i*entry,hs=version<3?4:8;table.writeUInt32LE(majiro.hash32(sjis(n)),at);table.writeUInt32LE(off,at+hs);if(version>1)table.writeUInt32LE(files[n].length,at+hs+4);datas.push(files[n]);off+=files[n].length;});
 if(version===1)table.writeUInt32LE(off,count*entry+4);
 return Buffer.concat([h,table,namesBuf,...datas]);}

/* ---- zip (stored + deflate), enough for NW.js package.nw and exe-appended zips ---------------------------------- */
function zip(files,{prefix=Buffer.alloc(0)}={}){const local=[],central=[];let off=prefix.length;
 const crc32=b=>{let r=0xffffffff;for(const x of b)r=(r>>>8)^CRCT[(r^x)&255];return (~r)>>>0;};
 for(const [name,data0] of Object.entries(files)){const data=Buffer.isBuffer(data0)?data0:Buffer.from(data0),comp=zlib.deflateRawSync(data),nm=Buffer.from(name,'utf8');
  const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0x800,6);lh.writeUInt16LE(8,8);lh.writeUInt32LE(crc32(data),14);lh.writeUInt32LE(comp.length,18);lh.writeUInt32LE(data.length,22);lh.writeUInt16LE(nm.length,26);
  const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(0x800,8);ch.writeUInt16LE(8,10);ch.writeUInt32LE(crc32(data),16);ch.writeUInt32LE(comp.length,20);ch.writeUInt32LE(data.length,24);ch.writeUInt16LE(nm.length,28);ch.writeUInt32LE(off,42);
  local.push(lh,nm,comp);central.push(ch,nm);off+=30+nm.length+comp.length;}
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(off,16);
 return Buffer.concat([prefix,...local,cd,end]);}
const CRCT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let v=n;for(let k=0;k<8;k++)v=v&1?(v>>>1)^0xEDB88320:v>>>1;t[n]=v>>>0;}return t;})();

/* ---- asar ------------------------------------------------------------------------------------------------------ */
function asar(files){const tree={files:{}},datas=[];let off=0;
 for(const [name,data0] of Object.entries(files)){const data=Buffer.isBuffer(data0)?data0:Buffer.from(data0);let node=tree;const parts=name.split('/');
  for(const p of parts.slice(0,-1)){node.files[p]=node.files[p]||{files:{}};node=node.files[p];}
  node.files[parts.at(-1)]={size:data.length,offset:String(off)};datas.push(data);off+=data.length;}
 const json=Buffer.from(JSON.stringify(tree),'utf8'),pad=(4-json.length%4)%4,pickle=Buffer.alloc(8+json.length+pad);
 pickle.writeUInt32LE(4+json.length+pad,0);pickle.writeUInt32LE(json.length,4);json.copy(pickle,8);
 const sizeBuf=Buffer.alloc(8);sizeBuf.writeUInt32LE(4,0);sizeBuf.writeUInt32LE(pickle.length,4);
 return Buffer.concat([sizeBuf,pickle,...datas]);}

/* ---- Python pickle (protocol 2) for Ren'Py rpa / rpyc ------------------------------------------------------------ */
class Obj{constructor(module,name,state){this.module=module;this.name=name;this.state=state;}}
function pickle(value){const out=[];const b=(...x)=>out.push(Buffer.from(x));
 const str=s=>{const u=Buffer.from(s,'utf8');if(u.length<256){b(0x8c,u.length);}else{const l=Buffer.alloc(5);l[0]=0x58;l.writeUInt32LE(u.length,1);out.push(l);}out.push(u);};
 const int=n=>{if(n>=0&&n<256)b(0x4b,n);else if(n>=0&&n<65536){b(0x4d,n&255,n>>8);}else if(n>=-0x80000000&&n<0x80000000){const l=Buffer.alloc(5);l[0]=0x4a;l.writeInt32LE(n,1);out.push(l);}else{let x=BigInt(n);const bytes=[];while(x!==0n&&x!==-1n){bytes.push(Number(x&255n));x>>=8n;}if(!bytes.length||(bytes.at(-1)&0x80))bytes.push(0);b(0x8a,bytes.length,...bytes);}};
 const walk=v=>{
  if(v===null||v===undefined){b(0x4e);return;}
  if(v===true){b(0x88);return;}if(v===false){b(0x89);return;}
  if(typeof v==='number'){int(v);return;}
  if(typeof v==='string'){str(v);return;}
  if(Buffer.isBuffer(v)){b(0x43,v.length);out.push(v);return;}
  if(Array.isArray(v)&&v.tuple){b(0x28);v.forEach(walk);b(0x74);return;}
  if(Array.isArray(v)){b(0x5d,0x28);v.forEach(walk);b(0x65);return;}
  if(v instanceof Obj){b(0x63);out.push(Buffer.from(v.module+'\n'+v.name+'\n','latin1'));b(0x29,0x81);walk(v.state);b(0x62);return;}
  if(typeof v==='object'){b(0x7d,0x28);for(const [k,x] of Object.entries(v)){walk(k);walk(x);}b(0x75);return;}
  throw Error('pickle '+typeof v);};
 b(0x80,2);walk(value);b(0x2e);return Buffer.concat(out);}
const tuple=(...x)=>Object.assign(x,{tuple:true});
const node=(name,state)=>new Obj('renpy.ast',name,state);
function rpyc(stmts){const body=zlib.deflateSync(pickle(tuple({version:5003000,key:'unlocked'},stmts)));
 const head=Buffer.alloc(10+12*2);head.write('RENPY RPC2','latin1');head.writeUInt32LE(1,10);head.writeUInt32LE(head.length,14);head.writeUInt32LE(body.length,18);head.writeUInt32LE(0,22);
 return Buffer.concat([head,body]);}
function rpa(files,{version='3.0',key=0x42424242}={}){const datas=[],index={};let off=34;
 for(const [name,data0] of Object.entries(files)){const data=Buffer.isBuffer(data0)?data0:Buffer.from(data0);datas.push(data);
  index[name]=[tuple(version==='3.0'?off^key:off,version==='3.0'?data.length^key:data.length,Buffer.alloc(0))];off+=data.length;}
 const idx=zlib.deflateSync(pickle(index)),hex=n=>n.toString(16).padStart(16,'0');
 const header=version==='3.0'?Buffer.from('RPA-3.0 '+hex(off)+' '+key.toString(16).padStart(8,'0')+'\n','latin1'):Buffer.from('RPA-2.0 '+hex(off)+'\n','latin1');
 const padded=Buffer.alloc(34,0);header.copy(padded);return Buffer.concat([padded,...datas,idx]);}

function writeTree(root,files){for(const [rel,data] of Object.entries(files)){const f=path.join(root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);}return root;}
module.exports={sjis,gbk,mjo,mjoCode,majiroArc,zip,asar,pickle,Obj,tuple,node,rpyc,rpa,writeTree};

/* ---- Softpal --------------------------------------------------------------------------------------------------- */
/* entries: [{kind:'say', name?, text} | {kind:'choice', text}] -> {src, text} (TEXT.DAT encrypted unless plain) */
function softpalPair(entries,{enc=sjis,plain=false}={}){const texts=[Buffer.from('$TEXT_LIST__\0\0\0\0','latin1')];let off=16,idx=0;const offsets=new Map();
 const add=s=>{if(offsets.has(s))return offsets.get(s);const b=Buffer.concat([Buffer.alloc(4),enc(s),Buffer.from([0])]);b.writeUInt32LE(idx++,0);texts.push(b);offsets.set(s,off);off+=b.length;return offsets.get(s);};
 const blocks=[Buffer.from('Sv20','latin1'),Buffer.alloc(12)];
 for(const e of entries){if(e.kind==='say'){const b=Buffer.alloc(32);b.writeUInt32LE(0x0001001f,0);b.writeUInt32LE(add(e.text),4);b.writeUInt32LE(0x00010002,8);b.writeUInt32LE(e.name?add(e.name):0x0fffffff,12);b.writeUInt32LE(0x00010002,16);b.writeUInt32LE(0,20);b.writeUInt32LE(0x00010017,24);b.writeUInt32LE(0x00020002,28);blocks.push(b);}
  else{const b=Buffer.alloc(16);b.writeUInt32LE(0x0001001f,0);b.writeUInt32LE(add(e.text),4);b.writeUInt32LE(0x00010017,8);b.writeUInt32LE(0x00060002,12);blocks.push(b);}
  blocks.push(Buffer.from([0x1f,0,1,0,0,0,0,0]));}
 const text=Buffer.concat(texts);text.writeUInt32LE(idx,12);
 if(!plain){/* inverse of the reader's decrypt: XOR the dword, then rotate its first byte right */let shift=4;for(let i=16;i<text.length-4;i+=4){text.writeUInt32LE((text.readUInt32LE(i)^0x084DF873^0xFF987DEE)>>>0,i);const n=shift%8;text[i]=((text[i]>>>n)|(text[i]<<(8-n)))&255;shift++;}}
 else text[0]=0;
 return {src:Buffer.concat(blocks),text};}
function softpalPac(files){const names=Object.keys(files),count=names.length,first=0x804+40*count,h=Buffer.alloc(first);h.write('PAC ','latin1');h.writeUInt32LE(count,8);let off=first;const datas=[];
 names.forEach((n,i)=>{const at=0x804+i*40;h.write(n,at,'latin1');h.writeUInt32LE(files[n].length,at+32);h.writeUInt32LE(off,at+36);datas.push(files[n]);off+=files[n].length;});
 return Buffer.concat([h,...datas]);}
module.exports.softpalPair=softpalPair;module.exports.softpalPac=softpalPac;
