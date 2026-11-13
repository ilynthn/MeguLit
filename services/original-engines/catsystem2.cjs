// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');
/* E356 CatSystem2 (ISLAND): scene.int is an encrypted KIF archive of CatScene (.cst) scripts. Decryption as in GARbro
   (ArcINT.cs, KifOpener.OpenEncrypted): the size field of the first entry (__key__.dat) seeds the CatSystem2 Mersenne
   Twister (the old sgenrand seeding with 69069), its first output is a 4-byte Blowfish key; each entry's (offset + index,
   size) pair is one Blowfish block, file data is Blowfish in 8-byte blocks (little-endian words). A CatScene is
   "CatScene", packed and unpacked sizes, then zlib: a 16-byte header (.., .., .., string table offset) and strings
   "\x01<type>text\0" — type 0x20 message, 0x21 speaker name, 0x30 command.
   The Chinese patch (cnscene.int) keeps every scene at the same index with the Japanese messages followed by the same
   number of Chinese (GBK) messages, so each scene gives the Japanese line and the group's translation.
   In the text, [base/reading] is ruby (a reading of only "・" is emphasis dots) and \n \@ \pc ... are layout codes. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {Blowfish}=require('./blowfish.cjs');
const sjis=kit.SJIS,gbk=new TextDecoder('gbk');
const memo=new Map();
const {stat}=require('./file-key.cjs');

function twister(seed){const mt=new Array(624);seed>>>=0;for(let i=0;i<624;i++){mt[i]=seed&0xffff0000;seed=(Math.imul(69069,seed)+1)>>>0;mt[i]=(mt[i]|((seed&0xffff0000)>>>16))>>>0;seed=(Math.imul(69069,seed)+1)>>>0;}let idx=624;
 return ()=>{if(idx>=624){for(let k=0;k<624;k++){const y=(mt[k]&0x80000000)|(mt[(k+1)%624]&0x7fffffff);mt[k]=(mt[(k+397)%624]^(y>>>1)^(y&1?0x9908b0df:0))>>>0;}idx=0;}let y=mt[idx++];y^=y>>>11;y^=(y<<7)&0x9d2c5680;y^=(y<<15)&0xefc60000;y^=y>>>18;return y>>>0;};}

/* E450 Names in an encrypted KIF (pcm_a.int voices) are a letter rotation keyed by the game's passphrase, as in GARbro
   ArcINT.cs: the passphrase is the exe's resource of type V_CODE2 (name DATA), Blowfish under KEY_CODE/KEY (each byte ^ 0xCD, else
   "windmill"); its key is a CRC-32 (MSB-first) fold of the Shift-JIS bytes; entry i's name key is the first Twister output
   seeded with key + i. */
function peResource(file,type,name){let b;try{b=fs.readFileSync(file);}catch{return null;}if(b.readUInt16LE(0)!==0x5a4d)return null;const pe=b.readUInt32LE(0x3c);if(b.readUInt32LE(pe)!==0x4550)return null;
 const nsec=b.readUInt16LE(pe+6),opt=pe+24,magic=b.readUInt16LE(opt),dirs=opt+(magic===0x20b?112:96),rva=b.readUInt32LE(dirs+2*8);if(!rva)return null;
 const secs=[];for(let i=0;i<nsec;i++){const s=opt+b.readUInt16LE(pe+20)+i*40;secs.push({va:b.readUInt32LE(s+12),vs:Math.max(b.readUInt32LE(s+8),b.readUInt32LE(s+16)),raw:b.readUInt32LE(s+20)});}
 const off=v=>{const s=secs.find(s=>v>=s.va&&v<s.va+s.vs);return s?v-s.va+s.raw:-1;};const base=off(rva);if(base<0)return null;
 const label=p=>{const n=b.readUInt16LE(base+p);return b.toString('utf16le',base+p+2,base+p+2+n*2);};
 const find=(dir,want)=>{const n=b.readUInt16LE(base+dir+12)+b.readUInt16LE(base+dir+14);for(let i=0;i<n;i++){const e=base+dir+16+i*8,id=b.readUInt32LE(e),to=b.readUInt32LE(e+4);
   if(want===null||((id&0x80000000)&&label(id&0x7fffffff).toUpperCase()===want))return to;}return null;};
 let t=find(0,type);if(t===null||!(t&0x80000000))return null;t=find(t&0x7fffffff,name);if(t===null||!(t&0x80000000))return null;t=find(t&0x7fffffff,null);if(t===null||(t&0x80000000))return null;
 const leaf=base+t,data=off(b.readUInt32LE(leaf)),size=b.readUInt32LE(leaf+4);return data<0?null:Buffer.from(b.subarray(data,data+size));}
const CRC=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let c=i<<24;for(let k=0;k<8;k++)c=c&0x80000000?(c<<1)^0x04c11db7:c<<1;t[i]=c>>>0;}return t;})();
function passKey(pass){let key=0xffffffff;for(const c of pass)key=(~CRC[((key>>>24)^c)&255]^(key<<8))>>>0;return key>>>0;}
// The passphrase key of the game in this folder, or null.
function gameKey(dir){let names=[];try{names=fs.readdirSync(dir).filter(n=>/\.exe$/i.test(n));}catch{}
 for(const n of names){const file=path.join(dir,n),code=peResource(file,'V_CODE2','DATA');if(!code||code.length<8)continue;let key=peResource(file,'KEY_CODE','KEY');
  key=key?Buffer.from(key.map(v=>v^0xcd)):Buffer.from('windmill');const plain=new Blowfish(key).decryptBuffer(Buffer.from(code));const z=plain.indexOf(0);return passKey(plain.subarray(0,z<0?plain.length:z));}
 return null;}
const ALPHA='zyxwvutsrqponmlkjihgfedcbaZYXWVUTSRQPONMLKJIHGFEDCBA';
function decipherName(raw,key){let k=((key>>>24)+(key>>>16)+(key>>>8)+key)&255;const out=Buffer.from(raw);let i=0;
 for(;i<out.length&&out[i];i++){let j=ALPHA.indexOf(String.fromCharCode(out[i]));if(j!==-1){j-=k%0x34;if(j<0)j+=0x34;out[i]=ALPHA.charCodeAt(0x33-j);}k++;}
 return sjis.decode(out.subarray(0,i));}
// Entries of a KIF archive: [{index, read()}] (read gives the stored file, decrypted when the archive is).
function kif(file,nameKey=null){const key=file+'|'+stat(file)+'|'+nameKey;if(memo.has(key))return memo.get(key);
 const fd=fs.openSync(file,'r');let list=[];
 try{const head=Buffer.alloc(8);fs.readSync(fd,head,0,8,0);if(head.toString('latin1',0,4)!=='KIF\0')throw Error('NOT_KIF');
  const n=head.readUInt32LE(4),dir=Buffer.alloc(n*0x48);fs.readSync(fd,dir,0,dir.length,8);
  const encrypted=dir.toString('latin1',0,12)==='__key__.dat\0';let bf=null;
  if(encrypted){const kb=Buffer.alloc(4);kb.writeUInt32LE(twister(dir.readUInt32LE(0x44))());bf=new Blowfish(kb);}
  for(let i=encrypted?1:0;i<n;i++){const p=i*0x48;let off=dir.readUInt32LE(p+0x40),size=dir.readUInt32LE(p+0x44);
   if(bf)[off,size]=bf.decrypt((off+i)>>>0,size);
   const name=encrypted?(nameKey===null?'':decipherName(dir.subarray(p,p+0x40),twister((nameKey+i)>>>0)())):dir.toString('latin1',p,p+0x40).replace(/\0.*$/s,'');
   list.push({index:i,name,read:()=>{const b=Buffer.alloc(size),f=fs.openSync(file,'r');try{fs.readSync(f,b,0,size,off);}finally{fs.closeSync(f);}if(bf)bf.decryptBuffer(b);return b;}});}}
 finally{fs.closeSync(fd);}
 memo.set(key,list);return list;}

function catScene(buf){if(buf.toString('latin1',0,8)!=='CatScene')return null;return zlib.inflateSync(buf.subarray(16));}
// Messages (0x20) and their speaker names in order: [{text: Buffer, name: Buffer|null}]
function messages(z){const out=[];let name=null,voice=null;for(let i=16+z.readUInt32LE(12);i+1<z.length;){const t=z[i],c=z[i+1],e=z.indexOf(0,i+2);if(e<0)break;
  // E450 "pcm KUO_kar04_001" before a message is its voice
  if(t===1&&c===0x30){const m=/^pcm\s+([\w.-]+)/.exec(z.toString('latin1',i+2,e));if(m)voice=m[1];}
  if(t===1&&c===0x21)name=z.subarray(i+2,e);else if(t===1&&c===0x20){out.push({text:z.subarray(i+2,e),name,voice});name=null;voice=null;}i=e+1;}
 return out;}
const RUBY=/\[([^\[\]\/]+)\/([^\[\]]+)\]/g;
function clean(s){return s.replace(RUBY,'$1').replace(/\\n/g,'\n').replace(/\\[a-zA-Z@]+/g,'').replace(/\\/g,'').trim();}
function ruby(s){const pairs=[];for(const m of s.matchAll(RUBY))if(!/^・+$/.test(m[2]))pairs.push([m[1],m[2]]);return pairs.length?pairs:null;}

const sceneFile=dir=>{const f=path.join(dir,'scene.int');return fs.existsSync(f)?f:'';};
const patchFile=dir=>{let names;try{names=fs.readdirSync(dir);}catch{return '';}const f=names.find(n=>/^(cn|chs|sc|zh)scene\.int$/i.test(n));return f?path.join(dir,f):'';};

const catsystem2={
 id:'catsystem2',hint:'scene.int（汉化：cnscene.int）',
 scenes(dir){const jp=sceneFile(dir);if(!jp)return [];const cnFile=patchFile(dir);
  let cn=[];try{cn=cnFile?kif(cnFile):[];}catch{}
  return kif(jp).map((e,k)=>({name:'scene'+String(e.index).padStart(4,'0')+'.cst',read:()=>{
   const z=catScene(e.read());if(!z)return Buffer.from('{"ja":[],"zh":[]}');
   const mj=messages(z),ja=mj.map(m=>sjis.decode(m.text)),voices=mj.map(m=>m.voice||null);let zh=[];
   const c=cn[k];if(c)try{const zc=catScene(c.read()),all=zc?messages(zc):[];if(all.length===2*ja.length&&all.slice(0,ja.length).every((m,j)=>sjis.decode(m.text)===ja[j]))zh=all.slice(ja.length).map(m=>gbk.decode(m.text));}catch{}
   return Buffer.from(JSON.stringify({ja,zh,...(voices.some(Boolean)?{voices}:{})}));}}));},
 archives:()=>[],
 sources:dir=>[sceneFile(dir),patchFile(dir)].filter(Boolean),
 parse(buf){const doc=JSON.parse(buf.toString('utf8'));const lines=[],zh=[],rb=[];
  doc.ja.forEach((t,k)=>{lines.push(clean(t));zh.push(doc.zh[k]?clean(doc.zh[k]):'');rb.push(ruby(t));});
  return Array.isArray(doc.voices)?{lines,anchors:[],zh,ruby:rb,voices:doc.voices}:{lines,anchors:[],zh,ruby:rb};},
 test:()=>false,
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 _internal:{gameKey,peResource,decipherName,kif,catScene,messages,clean,twister},
};
module.exports=catsystem2;
// E450 the voice clips of an encrypted KIF (pcm_*.int), named once the game's passphrase is known, for game-voice.cjs.
catsystem2.audio=file=>{if(!/\.int$/i.test(file))return null;const key=gameKey(path.dirname(file));if(key===null)return null;try{return kif(file,key).filter(e=>/\.ogg$/i.test(e.name));}catch{return null;}};
