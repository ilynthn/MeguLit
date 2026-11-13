// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* E375 WOLF RPG Editor (Game.exe / GamePro.exe). Its data is Data/ either loose or packed in .wolf archives (DxLib
   DXArchive): Data.wolf for everything, or Data/BasicData.wolf, Data/MapData.wolf ... per folder.
     MapData/*.mps            maps: events, pages, event commands
     BasicData/CommonEvent.dat common events
   An event command is stored as
     u8 argCount+1, i32 code, i32 args[argCount], u8 indent, u8 stringCount, strings (i32 length incl. NUL, bytes), u8 end
   with code 101 = message (string 0 is the text) and 102 = choices (one string per choice). The files are scanned for
   such records, so differences in the map and event headers between editor versions do not matter; the event a
   command belongs to is the last event header seen (u8 0x6F, 39 30 00 00, i32 id) and lines are keyed by event and
   ordinal, so a translated copy pairs line by line.
   Control codes \c[n] \s[n] \f[n] \i[n] \v[n] \self[n] \cdb[a:b:c] \A+ \- ... are dropped; \r[base,reading] keeps the
   base and gives the game's own reading (ruby). \n stays a line break.
   Archives the engine encrypts (any DXArchive whose header is not plain, WOLF RPG Pro / 3.x protected data) are not
   read: unsupported(dir) says why. No key is ever searched for. */
const fs=require('node:fs'),path=require('node:path');
const {stat}=require('./file-key.cjs');
const KANA=/[ぁ-ゖァ-ヺ]/g;

// ---- DXArchive (DxLib), unencrypted only ------------------------------------------------------------------------
// v6+ (64-bit fields): u16 'DX', u16 version, u32 headSize, u64 dataStart, u64 nameTable, u64 fileTable (from the name
// table), u64 dirTable (from the name table), then v6/v7 u64 charCode, v8+ u32 charCode, u32 flags (1 no key, 2 head
// not packed). v5 and older use 32-bit fields. Entries: name address, attributes (0x10 = folder), 3 times, data address
// (a folder: its directory record), size, packed size (all ones = stored). v8 adds a Huffman size.
const DXA_NO_KEY=1,DXA_NO_HEAD_PRESS=2;
function dxaHeader(fd,size){const h=Buffer.alloc(64);fs.readSync(fd,h,0,64,0);if(h.readUInt16LE(0)!==0x5844)return null;
 const version=h.readUInt16LE(2);if(version<1||version>16)return null;const wide=version>=6;
 const r=o=>wide?Number(h.readBigUInt64LE(o)):h.readUInt32LE(o),w=wide?8:4;
 const head={version,wide,headSize:h.readUInt32LE(4),dataStart:r(8),names:r(8+w),files:r(8+2*w),dirs:r(8+3*w),flags:0};
 if(version>=8)head.flags=h.readUInt32LE(8+4*w+4);else if(wide)head.flags=0;
 if(head.headSize<16||head.names+head.headSize>size||head.dataStart>size||head.files>head.headSize||head.dirs>head.headSize)return null;
 return head;}
/* What one archive is: {state:'plain', files} | {state:'encrypted'|'packed-head'|'not-dxa'}. */
function dxaList(file){let fd;try{fd=fs.openSync(file,'r');}catch{return {state:'unreadable'};}
 try{const size=fs.fstatSync(fd).size,head=dxaHeader(fd,size);
  if(!head){const b=Buffer.alloc(4);fs.readSync(fd,b,0,4,0);return {state:b.readUInt16LE(0)===0x5844?'not-dxa':'encrypted'};}
  if(head.version>=8&&!(head.flags&DXA_NO_KEY))return {state:'encrypted'};
  if(head.version>=8&&!(head.flags&DXA_NO_HEAD_PRESS))return {state:'packed-head'};
  const t=Buffer.alloc(head.headSize);fs.readSync(fd,t,0,head.headSize,head.names);
  const w=head.wide?8:4,rd=o=>head.wide?Number(t.readBigUInt64LE(o)):t.readUInt32LE(o),fileSize=head.wide?(head.version>=8?72:64):44,dirSize=4*w;
  const nameAt=o=>{const n=t.readUInt16LE(o)*4,raw=t.subarray(o+4+n,o+4+2*n),end=raw.indexOf(0);return dec(end<0?raw:raw.subarray(0,end));};
  const files=[],seen=new Set();
  const walk=(dirOff,prefix,depth)=>{if(depth>16||seen.has(dirOff))return;seen.add(dirOff);const d=head.dirs+dirOff;if(d+dirSize>t.length)throw Error('DXA_BAD_DIR');
   const count=rd(d+2*w),first=rd(d+3*w);if(count>100000)throw Error('DXA_BAD_DIR');
   for(let i=0;i<count;i++){const f=head.files+first+i*fileSize;if(f+fileSize>t.length)throw Error('DXA_BAD_FILE');
    const name=nameAt(rd(f)),attr=rd(f+w),data=rd(f+2*w+24),length=rd(f+3*w+24),packedRaw=head.wide?t.readBigUInt64LE(f+4*w+24):BigInt(t.readUInt32LE(f+4*w+24));
    const packed=packedRaw===(head.wide?0xffffffffffffffffn:0xffffffffn)?-1:Number(packedRaw);
    if(attr&0x10)walk(data,prefix+name+'/',depth+1);else files.push({name:prefix+name,offset:head.dataStart+data,size:length,packed});}};
  walk(0,'',0);return {state:'plain',files,head};
 }catch{return {state:'encrypted'};}finally{fs.closeSync(fd);}}
function dxaRead(file,entry){const fd=fs.openSync(file,'r');try{const n=entry.packed>=0?entry.packed:entry.size,b=Buffer.alloc(n);fs.readSync(fd,b,0,n,entry.offset);return entry.packed>=0?lzDecode(b):b;}finally{fs.closeSync(fd);}}
// DxLib's LZ: u32 size, u32 packed size (with this 9-byte header), u8 key; key key = the key byte itself, key code
// [hi] index = copy (code>>3 | hi<<5) + 4 bytes from index+1 back (index 1, 2 or 3 bytes by code&3).
function lzDecode(src){const size=src.readUInt32LE(0),end=Math.min(src.length,src.readUInt32LE(4)),key=src[8],out=Buffer.alloc(size);let s=9,d=0;
 while(s<end&&d<size){if(src[s]!==key){out[d++]=src[s++];continue;}if(src[s+1]===key){out[d++]=key;s+=2;continue;}
  let code=src[s+1];if(code>key)code--;s+=2;let n=code>>3;if(code&4)n|=src[s++]<<5;n+=4;
  const width=code&3;let index=width===0?src[s]:width===1?src.readUInt16LE(s):src.readUInt16LE(s)|src[s+2]<<16;s+=width+1;index++;
  for(let k=0;k<n&&d<size;k++,d++)out[d]=out[d-index];}
 return out;}

// ---- Text ---------------------------------------------------------------------------------------------------------
function dec(b){try{return new TextDecoder('utf-8',{fatal:true}).decode(b);}catch{return kit.SJIS.decode(b);}}
// One code page for a whole file: UTF-8 (WOLF 3), else Shift-JIS or (a Chinese patch) GBK, whichever reads cleaner.
function codepage(bufs){const all=Buffer.concat(bufs.slice(0,4000));try{new TextDecoder('utf-8',{fatal:true}).decode(all);return 'utf-8';}catch{}
 /* E577 Shift-JIS vs GBK: kit.codepage */return kit.codepage(all);}
function clean(text){const ruby=[];let t=String(text??'').replace(/\r/g,'');
 t=t.replace(/\\r\[([^,\]]+),([^\]]+)\]/g,(_,base,reading)=>{ruby.push([base,reading]);return base;});
 t=t.replace(/\\n(?![a-z\[])/g,'\n');
 t=t.replace(/\\[a-z]+\[[^\]]*\]/gi,'').replace(/\\[A-Za-z]{1,2}[+\-]?/g,'').replace(/\\[-<>^.|!]/g,'').replace(/<[CLR]>/g,'');
 return {text:t.replace(/[ \t]+\n/g,'\n').trim(),ruby};}
/* Every message / choice command in a file: {code, event, strings (raw buffers)}. */
function scanCommands(buf){const out=[];let event=0;
 for(let p=0;p+12<buf.length;p++){
  if(buf[p]===0x6f&&buf[p+1]===0x39&&buf[p+2]===0x30&&buf[p+3]===0&&buf[p+4]===0&&p+9<=buf.length){event=buf.readInt32LE(p+5);continue;}
  const argc=buf[p]-1;if(argc<0||argc>16||p+5+argc*4+2>buf.length)continue;
  const code=buf.readInt32LE(p+1);if(code!==101&&code!==102)continue;
  let q=p+5+argc*4;q++;const count=buf[q++];if(count<1||count>16)continue;
  const strings=[];let ok=true;
  for(let k=0;k<count;k++){if(q+4>buf.length){ok=false;break;}const n=buf.readInt32LE(q);q+=4;if(n<1||q+n>buf.length||buf[q+n-1]!==0){ok=false;break;}strings.push(buf.subarray(q,q+n-1));q+=n;}
  if(!ok||q>=buf.length||buf[q]>1)continue;
  out.push({code,event,strings});p=q;}
 return out;}
/* lines: message texts and choices; keys: event:kind#ordinal; groups: message count per event; ruby: game readings. */
function parse(buf){const cmds=scanCommands(buf),enc=codepage(cmds.flatMap(c=>c.strings)),td=new TextDecoder(enc);
 const lines=[],keys=[],ruby=[],groups={},anchors=[],seen={};
 for(const c of cmds){const g='e'+c.event;if(!(g in groups)){groups[g]=0;anchors.push(g);}
  const texts=c.code===101?[c.strings[0]]:c.strings,kind=c.code===101?'m':'c';
  for(const raw of texts){const {text,ruby:r}=clean(td.decode(raw));if(!text&&kind==='m')continue;groups[g]++;const k=g+':'+kind;seen[k]=(seen[k]||0)+1;
   lines.push(text);keys.push(k+'#'+seen[k]);ruby.push(r.length?r:null);}}
 return {lines,anchors,keys,groups,ruby:ruby.some(Boolean)?ruby:undefined,codepage:enc};}

// ---- Game folder ------------------------------------------------------------------------------------------------
const SCENE=n=>/\.mps$/i.test(n)||/^commonevent\.dat$/i.test(n);
const dataRoot=dir=>{for(const n of ['Data','data'])try{if(fs.statSync(path.join(dir,n)).isDirectory())return path.join(dir,n);}catch{}return '';};
function archivesOf(dir){const out=[];try{for(const f of fs.readdirSync(dir))if(/^data\.wolf$/i.test(f))out.push(path.join(dir,f));}catch{}
 const d=dataRoot(dir);if(d)try{for(const f of fs.readdirSync(d).sort())if(/\.wolf$/i.test(f))out.push(path.join(d,f));}catch{}return out;}
function looseFiles(d,out=[],depth=2){let es;try{es=fs.readdirSync(d,{withFileTypes:true});}catch{return out;}
 for(const e of es){const f=path.join(d,e.name);if(e.isDirectory()){if(depth>0&&!/^save/i.test(e.name))looseFiles(f,out,depth-1);}else if(SCENE(e.name))out.push(f);}return out;}
const listMemo=new Map();
function listed(file){const k=file+'|'+stat(file);if(listMemo.has(k))return listMemo.get(k);const v=dxaList(file);listMemo.set(k,v);if(listMemo.size>200)listMemo.delete(listMemo.keys().next().value);return v;}
const isWolf=dir=>{try{const names=fs.readdirSync(dir);return names.some(n=>/^(game|gamepro)\.exe$/i.test(n))&&(names.some(n=>/^data\.wolf$/i.test(n))||!!dataRoot(dir)&&(archivesOf(dir).length>0||fs.existsSync(path.join(dataRoot(dir),'BasicData'))));}catch{return false;}};
// Scene files by name: archives first, loose files over them (the editor's test play and most patches use loose Data).
function sceneMap(dir){const out=new Map();if(!isWolf(dir))return out;
 for(const a of archivesOf(dir)){const t=listed(a);if(t.state!=='plain')continue;for(const e of t.files){const name=path.basename(e.name);if(SCENE(name))out.set(name.toLowerCase(),{name,read:()=>dxaRead(a,e)});}}
 const d=dataRoot(dir);if(d)for(const f of looseFiles(d))out.set(path.basename(f).toLowerCase(),{name:path.basename(f),read:()=>fs.readFileSync(f)});
 return out;}
/* Why a WOLF game cannot be read, or '' (readable, or not a WOLF game). */
function unsupported(dir){if(!isWolf(dir))return '';if(sceneMap(dir).size)return '';
 const states=archivesOf(dir).map(a=>listed(a).state);
 if(states.includes('encrypted')||states.includes('not-dxa'))return fs.readdirSync(dir).some(n=>/^gamepro\.exe$/i.test(n))?'WOLF_PRO_ENCRYPTED':'WOLF_ENCRYPTED';
 if(states.includes('packed-head'))return 'WOLF_PACKED_HEADER';
 return 'WOLF_NO_SCRIPT';}
const REASONS={WOLF_PRO_ENCRYPTED:'WOLF RPG 编辑器 Pro 版加密了数据（Data.wolf），无法读取剧本',WOLF_ENCRYPTED:'这个 WOLF RPG 游戏的 .wolf 数据已加密，无法读取剧本',WOLF_PACKED_HEADER:'这个 WOLF RPG 游戏的 .wolf 目录被压缩，暂不支持',WOLF_NO_SCRIPT:'没有找到 WOLF RPG 的地图或公共事件数据'};
function pairScene(scene,files){let best=null,bestChanged=0;
 for(const f of files){let p;try{p=parse(f.read());}catch{continue;}
  const byKey=new Map(p.keys.map((k,i)=>[k,p.lines[i]]));let changed=0;
  const lines=scene.lines.map((t,i)=>{const k=scene.keys?.[i],g=k&&k.slice(0,k.indexOf(':'));if(!k||p.groups[g]!==scene.groups?.[g])return t;const v=byKey.get(k);if(v===undefined||v===t)return t;changed++;return v;});
  if(changed>bestChanged){best=lines;bestChanged=changed;}}
 return best;}
// Every copy of each scene file a patch offers: loose files in any folder, and the scene files of plain .wolf archives.
function patchFiles(found){const out=new Map(),add=(name,item)=>{const k=name.toLowerCase();if(!out.has(k))out.set(k,[]);out.get(k).push(item);};
 for(const d of found.dirs){let names=[];try{names=fs.readdirSync(d);}catch{}
  for(const n of names){const f=path.join(d,n);if(SCENE(n))add(n,{read:()=>fs.readFileSync(f)});
   else if(/\.wolf$/i.test(n)){const t=listed(f);if(t.state==='plain')for(const e of t.files){const b=path.basename(e.name);if(SCENE(b))add(b,{read:()=>dxaRead(f,e)});}}}}
 return out;}
const wolf={
 id:'wolf',hint:'Data 文件夹（或 Data.wolf）',
 scenes(dir){return [...sceneMap(dir).values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:dir=>{const d=dataRoot(dir);return [...archivesOf(dir),...(d?looseFiles(d):[])];},
 parse,test:SCENE,
 patchLines(base,found){const files=patchFiles(found);let any=false;
  const list=base.map(scene=>{const lines=pairScene(scene,files.get(scene.name.toLowerCase())||[]);if(!lines)return scene;any=true;return {...scene,patched:true,lines};});
  return any?list:null;},
 unsupported,REASONS,
 _internal:{dxaList,dxaRead,lzDecode,scanCommands,clean,isWolf},
};
module.exports=wolf;
