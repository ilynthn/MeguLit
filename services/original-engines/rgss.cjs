// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E574 RPG Maker XP / VX / VX Ace (RGSS1-3). Same family as MV / MZ (rpgmaker.cjs, E375): dialogue is event commands
   (101 Show Text + 401 rows, 102 choices, 105 + 405 scrolling text) in Map###, CommonEvents and Troops; only the
   storage differs — Ruby Marshal data files, usually packed into an encrypted archive. This reader turns them into the
   MV shape and hands them to rpgmaker.cjs, so messages, keys and patch pairing are one implementation.
   Archives as in RPGMakerDecrypter (uuksu, MIT: RGSSADv1.cs, RGSSADv3.cs, RGSSAD.cs DecryptFileData):
     Game.rgssad (XP) / Game.rgss2a (VX)  "RGSSAD\0\x01"; key 0xDEADCAFE; per entry: u32 name length ^ key, name bytes
       each ^ (key & 0xFF), u32 size ^ key — the key steps key = key * 7 + 3 after every one of these; data follows
     Game.rgss3a (VX Ace)  "RGSSAD\0\x03"; key = u32 * 9 + 3; entries {offset, size, file key, name length} each ^ key,
       name bytes ^ the key's bytes in turn; offset 0 ends the index
     data: XOR with the entry key's 4 bytes, the key stepping * 7 + 3 every 4 bytes
   Data/*.rxdata (XP) / .rvdata (VX) / .rvdata2 (VX Ace): Ruby Marshal 4.8, decoded by the reader below (objects become
   {ivars without "@"}, hashes plain objects or arrays, user-defined dumps raw bytes); nothing is executed.
   XP's 101 carries the first text row itself (VX and later keep only the face there); it is moved into a 401. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs'),rpgmaker=require('./rpgmaker.cjs');
const step=k=>(Math.imul(k,7)+3)>>>0;

/* ---- RGSSAD ----------------------------------------------------------------------------------------------------- */
function list(file){const size=kit.size(file);if(size<16)return null;const h=kit.readAt(file,0,8);if(h.toString('latin1',0,7)!=='RGSSAD\0')return null;const v=h[7];
 const idx=kit.readAt(file,0,Math.min(size,v===3?16<<20:size)),out=[];
 try{if(v===1){let key=0xdeadcafe,p=8;
   while(p+4<=size){if(p+4>idx.length)break;const len=(idx.readUInt32LE(p)^key)>>>0;key=step(key);p+=4;if(len>1024||p+len>idx.length)return null;
    const nb=Buffer.alloc(len);for(let i=0;i<len;i++){nb[i]=idx[p+i]^(key&255);key=step(key);}p+=len;
    const sz=(idx.readUInt32LE(p)^key)>>>0;key=step(key);p+=4;if(p+sz>size)return null;out.push({name:nb.toString('utf8').replace(/\\/g,'/'),offset:p,size:sz,key});p+=sz;}
   return out;}
  if(v===3){let p=8;const key=(Math.imul(idx.readUInt32LE(8),9)+3)>>>0;p=12;const kb=Buffer.alloc(4);kb.writeUInt32LE(key);
   while(p+16<=idx.length){const offset=(idx.readUInt32LE(p)^key)>>>0,sz=(idx.readUInt32LE(p+4)^key)>>>0,fk=(idx.readUInt32LE(p+8)^key)>>>0,len=(idx.readUInt32LE(p+12)^key)>>>0;p+=16;
    if(offset===0)break;if(len>1024||p+len>idx.length||offset+sz>size)return null;const nb=Buffer.alloc(len);for(let i=0;i<len;i++)nb[i]=idx[p+i]^kb[i&3];p+=len;
    out.push({name:nb.toString('utf8').replace(/\\/g,'/'),offset,size:sz,key:fk});}
   return out;}}catch{return null;}
 return null;}
function decrypt(buf,key){const out=Buffer.from(buf),kb=Buffer.alloc(4);let k=key>>>0;kb.writeUInt32LE(k);
 for(let i=0;i<out.length;i++){if(i&&!(i&3)){k=step(k);kb.writeUInt32LE(k);}out[i]^=kb[i&3];}return out;}
const read=(file,e)=>decrypt(kit.readAt(file,e.offset,e.size),e.key);

/* ---- Ruby Marshal 4.8 ------------------------------------------------------------------------------------------- */
function marshal(buf){if(buf[0]!==4||buf[1]!==8)throw Error('MARSHAL_VERSION');let p=2;const syms=[],objs=[];
 const byte=()=>buf[p++];
 const long=()=>{const c=(byte()<<24)>>24;if(c===0)return 0;if(c>=5)return c-5;if(c<=-5)return c+5;let v=0;
  if(c>0){for(let i=0;i<c;i++)v+=byte()*2**(8*i);return v;}let x=0;for(let i=0;i<-c;i++)x+=byte()*2**(8*i);/* negative */return x-2**(8*-c);};
 const bytes=()=>{const n=long();const b=buf.subarray(p,p+n);p+=n;return b;};
 const sym=()=>{const t=byte();if(t===0x3a){const s=bytes().toString('utf8');syms.push(s);return s;}if(t===0x3b)return syms[long()];if(t===0x49){const s=sym();const n=long();for(let i=0;i<n;i++){sym();value();}return s;}throw Error('MARSHAL_SYMBOL');};
 const reg=v=>{objs.push(v);return v;};
 const ivars=o=>{const n=long();for(let i=0;i<n;i++){const k=sym(),v=value();if(o&&typeof o==='object'&&!(o instanceof Uint8Array))o[k.replace(/^@/,'')]=v;}};
 function value(){const t=byte();switch(t){
  case 0x30:return null;case 0x54:return true;case 0x46:return false;
  case 0x69:return long();
  case 0x3a:case 0x3b:p--;return sym();
  case 0x22:return reg(bytes().toString('utf8'));
  case 0x49:{/* ivar wrapper: the value, then its instance variables (string encoding E / encoding) */const at=objs.length;let v=value();const n=long();for(let i=0;i<n;i++){sym();value();}return v;}
  case 0x5b:{const a=reg([]);const n=long();for(let i=0;i<n;i++)a.push(value());return a;}
  case 0x7b:case 0x7d:{const h=reg(new Map());const n=long();for(let i=0;i<n;i++){const k=value();h.set(k,value());}if(t===0x7d)value();return h;}
  case 0x6f:{const o=reg({__class:sym()});ivars(o);return o;}
  case 0x40:return objs[long()];
  case 0x75:{const cls=sym();return reg({__class:cls,__dump:Buffer.from(bytes())});}
  case 0x55:{const o=reg({__class:sym()});o.__data=value();return o;}
  case 0x66:return reg(Number(bytes().toString('latin1')));
  case 0x6c:{const sign=byte();const n=long();let v=0;for(let i=0;i<n*2;i++)v+=byte()*2**(8*i);return reg(sign===0x2d?-v:v);}
  case 0x65:{sym();return value();}
  case 0x43:{sym();return value();}
  case 0x53:{const o=reg({__class:sym()});const n=long();for(let i=0;i<n;i++){const k=sym();o[k]=value();}return o;}
  case 0x63:case 0x6d:case 0x4d:return reg({__module:bytes().toString('latin1')});
  case 0x2f:{const s=bytes().toString('utf8');byte();return reg(s);}
  case 0x64:{sym();return reg(null);}
  default:throw Error('MARSHAL_TYPE_'+t.toString(16));}}
 return value();}
/* Marshal objects -> the MV JSON shape: Ruby hashes become arrays (event ids) or objects, symbols stay strings */
function plain(v,seen=new Map()){if(v===null||typeof v!=='object')return v;if(Buffer.isBuffer(v))return null;if(seen.has(v))return seen.get(v);
 if(Array.isArray(v)){const a=[];seen.set(v,a);for(const x of v)a.push(plain(x,seen));return a;}
 if(v instanceof Map){const keys=[...v.keys()];if(keys.every(k=>Number.isInteger(k))){const a=[];seen.set(v,a);for(const [k,x] of v)a[k]=plain(x,seen);return a;}
  const o={};seen.set(v,o);for(const [k,x] of v)o[String(k)]=plain(x,seen);return o;}
 const o={};seen.set(v,o);for(const [k,x] of Object.entries(v))if(k!=='__dump')o[k]=plain(x,seen);return o;}
/* XP: 101's parameters[0] is the first row; VX and later: the face. Turn XP lists into the later shape. */
function xpLists(doc){const fix=list=>{if(!Array.isArray(list))return list;const out=[];for(const c of list){if(c&&c.code===101&&c.parameters?.length===1&&typeof c.parameters[0]==='string'){/* XP: [text]; VX+: [face, index, bg, pos] */out.push({...c,parameters:[]});out.push({code:401,indent:c.indent,parameters:[c.parameters[0]]});}else out.push(c);}return out;};
 const walk=v=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}if(Array.isArray(v.list)&&v.list.some(c=>c&&typeof c.code==='number'))v.list=fix(v.list);for(const k of Object.keys(v))if(k!=='list')walk(v[k]);};
 walk(doc);return doc;}

/* ---- engine ----------------------------------------------------------------------------------------------------- */
const DATA=/^(?:map\d+|commonevents|troops|actors)\.(?:rxdata|rvdata2?)$/i,SCENE=/^(?:map\d+|commonevents|troops)\.(?:rxdata|rvdata2?)$/i;
const mvName=n=>n.replace(/\.(?:rxdata|rvdata2?)$/i,'.json').replace(/^map/i,'Map').replace(/^commonevents/i,'CommonEvents').replace(/^troops/i,'Troops');
function decode(buf){try{return plain(marshal(buf));}catch{return null;}}
/* every data file of a folder (loose Data\ wins over the archive): Map(lower name -> read) */
function dataFiles(dir){const out=new Map();
 for(const a of kit.files(dir,{name:/\.rgss(?:ad|2a|3a)$/i})){const l=list(a);for(const e of l||[]){const n=path.posix.basename(e.name);if(DATA.test(n)&&/^data\//i.test(e.name))out.set(n.toLowerCase(),{name:n,read:()=>read(a,e)});}}
 for(const f of kit.files(dir,{name:DATA,subs:['Data','data',''],max:20000}))out.set(path.basename(f).toLowerCase(),{name:path.basename(f),read:()=>fs.readFileSync(f)});
 return out;}
function actorsOf(files){const a=[...files.values()].find(x=>/^actors\./i.test(x.name));if(!a)return [];const d=decode(a.read());return Array.isArray(d)?d.map(x=>x&&typeof x.name==='string'?x.name:''):[];}
/* parse() gets the wrapped document the MV reader understands */
const wrap=(name,data,actors)=>Buffer.from(JSON.stringify({rpgmaker:1,name:mvName(name),actors,data:xpLists(data)}));
function scenes(dir){const files=dataFiles(dir);let actors=null;
 return [...files.values()].filter(x=>SCENE.test(x.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(x=>({name:x.name,read:()=>{actors=actors||actorsOf(files);const d=decode(x.read());return wrap(x.name,d,actors);}}));}
const parse=buf=>{const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf);if(b[0]===4&&b[1]===8){const d=decode(b);return d?rpgmaker.parse(wrap('Map000.rxdata',d,[])):{lines:[],anchors:[]};}return rpgmaker.parse(b);};
/* a translated copy: the same data files (loose or in the patch's own archive), paired by message key as for MV */
function patchLines(base,found){const byName=new Map();
 for(const d of found.dirs){let files;try{files=dataFiles(d);}catch{continue;}if(!files.size)continue;let actors=null;
  for(const [k,x] of files){if(!SCENE.test(x.name))continue;try{actors=actors||actorsOf(files);const p=rpgmaker.parse(wrap(x.name,decode(x.read()),actors));(byName.get(k)||byName.set(k,[]).get(k)).push(p);}catch{}}}
 let any=false;const list=base.map(scene=>{let best=null,bestChanged=0;
  for(const p of byName.get(scene.name.toLowerCase())||[]){const byKey=new Map(p.keys.map((k,i)=>[k,p.lines[i]]));let changed=0;
   const lines=scene.lines.map((t,i)=>{const k=scene.keys?.[i],g=k&&k.slice(0,k.indexOf(':'));if(!k||p.groups[g]!==scene.groups?.[g])return t;const v=byKey.get(k);if(v===undefined||v===t)return t;changed++;return v;});
   if(changed>bestChanged){best=lines;bestChanged=changed;}}
  if(!best)return scene;any=true;return {...scene,patched:true,lines:best};});
 return any?list:null;}
const engine={id:'rgss',hint:'Game.rgss3a / .rgss2a / .rgssad（或 Data\\*.rvdata2）',scenes,archives:()=>[],
 sources:dir=>[...kit.files(dir,{name:/\.rgss(?:ad|2a|3a)$/i}),...kit.files(dir,{name:DATA,subs:['Data','data',''],max:20000})],
 parse,test:n=>SCENE.test(n),patchLines};
module.exports={engine,list,read,decrypt,marshal,plain,xpLists,parse,step};
