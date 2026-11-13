// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* SoftPal / Pal engine (時計仕掛けのレイライン, ユニゾンシフト and other Pal titles): data.pac is a "PAC " archive,
   count at 8, 40-byte entries from 0x804 (32-byte name, size, offset). TEXT.DAT holds every string of the game:
   "$TEXT_LIST__", count, then from 0x10 per entry a u32 id and a Shift-JIS C string. From 0x10 on, every dword is
   encrypted: its first byte rotated right by a shift that starts at 4 and counts up mod 8, the dword XOR 0xF7D5859D.
   Speaker names are their own entries right after the line; a short entry repeated many times is a name, not a line. */
const fs=require('node:fs'),path=require('node:path');
const KEY=(0x084DF873^0xFF987DEE)>>>0,sj=new TextDecoder('shift_jis');
function entries(file){let b;try{b=fs.readFileSync(file);}catch{return null;}
 if(b.length<0x804||b.toString('latin1',0,4)!=='PAC ')return null;const n=b.readUInt32LE(8);if(n<=0||n>100000||0x804+n*40>b.length)return null;
 const out=[];for(let i=0;i<n;i++){const o=0x804+i*40,name=b.toString('latin1',o,o+32).replace(/\0[\s\S]*$/,''),size=b.readUInt32LE(o+32),off=b.readUInt32LE(o+36);
  if(off+size<=b.length)out.push({name,read:()=>b.subarray(off,off+size)});}
 return out;}
function decrypt(src){const d=Buffer.from(src);if(d.toString('latin1',0,12)!=='$TEXT_LIST__')return null;let sh=4;
 for(let i=0x10;i+4<=d.length;i+=4){const x=d[i];d[i]=((x<<sh)|(x>>(8-sh)))&255;sh=(sh+1)&7;d.writeUInt32LE((d.readUInt32LE(i)^KEY)>>>0,i);}
 return d;}
function strings(d){const out=[];let p=16;while(p+4<d.length){p+=4;let e=d.indexOf(0,p);if(e<0)e=d.length;out.push(sj.decode(d.subarray(p,e)));p=e+1;}return out;}
const JA=/[ぁ-ゖァ-ヺ一-龯]/;
/* parse takes the decrypted TEXT.DAT (scenes() decrypts) */
function parse(d){
 const all=strings(d).map(t=>t.replace(/<[^>]*>/g,'').trim()),count=new Map();for(const t of all)count.set(t,(count.get(t)||0)+1);
 const name=t=>t.length<=8&&!/[「」『』（）。、…！？―]/.test(t)&&count.get(t)>=5;
 return {lines:all.filter(t=>t&&JA.test(t)&&!t.includes('%')&&!name(t)),anchors:[]};}
const textEntry=dir=>{const f=path.join(dir,'data.pac');const e=entries(f);return e?e.find(x=>/^TEXT\.DAT$/i.test(x.name)):null;};
const softpal={
 id:'softpal',hint:'data.pac (TEXT.DAT)',
 scenes(dir){const e=textEntry(dir);return e?[{name:'TEXT.DAT',read:()=>{const r=e.read();return decrypt(r)||r;}}]:[];},
 archives:()=>[],
 sources:dir=>textEntry(dir)?[path.join(dir,'data.pac')]:[],
 parse,test:n=>/^TEXT\.DAT$/i.test(n),
 _internal:{entries,decrypt,strings},
};
module.exports=softpal;
