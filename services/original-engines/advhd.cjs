// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E449 Will / AdvHD "Rio" scripts (Sugar Beans Under the Moon, いじわる My Master and other Will-family titles).
   Rio.arc is a Will ARC: u32 count of extension records {char[4] ext, u32 files, u32 directory offset}, then per file a
   NUL-padded name (9 bytes, or 13 in later archives), u32 size, u32 offset (layout as in GARbro ArcWILL.cs, MIT).
   .wsc scripts are stored with every byte rotated left by 2. In a script, after a NUL:
     0x41 <3 bytes> text\0              narration
     0x42 <4 bytes> name\0 text\0       a spoken line and its speaker
   Text is Shift-JIS. Other commands (voice and image names, jumps) are ASCII and dropped. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');/* E605 */
const sj=kit.SJIS;
const PROSE=/[ぁ-ゖァ-ヺ一-龯]/;
function list(b,fileSize=b.length){if(b.length<16)return null;const n=b.readInt32LE(0);if(n<=0||n>0xff||4+n*12>b.length)return null;const exts=[];
 for(let i=0;i<n;i++){const p=4+i*12,ext=b.toString('latin1',p,p+4).replace(/\0.*$/s,'');if(!/^[A-Za-z0-9]{1,4}$/.test(ext))return null;exts.push({ext,count:b.readUInt32LE(p+4),dir:b.readUInt32LE(p+8)});}
 const read=size=>{const out=[];for(const e of exts){let d=e.dir;for(let i=0;i<e.count;i++){if(d+size+8>b.length)return null;const name=b.toString('latin1',d,d+size).replace(/\0.*$/s,'');
   const s=b.readUInt32LE(d+size),o=b.readUInt32LE(d+size+4);if(!name||o+s>fileSize)return null;out.push({name:name+'.'+e.ext.toLowerCase(),size:s,offset:o});d+=size+8;}}return out;};
 return read(9)||read(13);}
function decode(raw){const d=Buffer.from(raw);for(let i=0;i<d.length;i++)d[i]=((d[i]>>>2)|(d[i]<<6))&255;return d;}
function cstr(d,p){const e=d.indexOf(0,p);return e<0?null:{s:d.subarray(p,e),next:e+1};}
// Inline codes (%K wait for a click, %P new page, %N new line ...) are dropped.
const text=b=>sj.decode(b).replace(/\\n|%n/gi,'\n').replace(/%[A-Za-z]+/g,'').replace(/^[\s　]+|[\s　]+$/g,'');
// Lines of one decoded script: a speaker name line before each spoken line, as other readers do.
/* E450 a voice name (Ash_1093) is an ASCII string between the previous line and a spoken one; the line takes the last. */
const VOICE=/\0([A-Za-z]{1,6}_?\d{3,6}[A-Za-z]?)\0/g;
function parse(buf){const d=Buffer.isBuffer(buf)?buf:Buffer.from(buf),lines=[],anchors=[],voices=[];
 const marks=[...d.toString('latin1').matchAll(VOICE)].map(m=>({at:m.index,name:m[1]}));let mi=0,last=0;
 const voiceBefore=i=>{let v=null;while(mi<marks.length&&marks[mi].at<i){if(marks[mi].at>=last&&!/^(?:EV|BG|ST|CG|SE|BGM|TEF|FG|SD)/i.test(marks[mi].name))v=marks[mi].name;mi++;}last=i;return v;};
 // The id after the opcode is 3 (narration) / 4 (spoken) bytes in early scripts and one byte longer in later ones: the
 // text starts after the id's last (zero) byte, on a Shift-JIS lead byte.
 const at=(i,a)=>{for(const k of [a,a+1])if(d[i+k]>=0x81&&d[i+k-1]===0)return i+k;return -1;};
 for(let i=1;i<d.length-6;i++){if(d[i-1]!==0||(d[i]!==0x41&&d[i]!==0x42))continue;
  if(d[i]===0x41){const p=at(i,4);if(p<0)continue;const t=cstr(d,p);if(!t||t.s.length<2)continue;const s=text(t.s);if(!s||!PROSE.test(s)||s.includes('�'))continue;lines.push(s);voices.push(voiceBefore(i));i=t.next-1;continue;}
  const p=at(i,5);if(p<0)continue;const name=cstr(d,p);if(!name||name.s.length<2)continue;const t=cstr(d,name.next);if(!t||t.s.length<2||t.s[0]<0x80)continue;
  const who=text(name.s),s=text(t.s);if(!s||!PROSE.test(s)||s.includes('�')||who.length>24)continue;lines.push(who);voices.push(null);lines.push(s);voices.push(voiceBefore(i));i=t.next-1;}
 const v=require('./voice-ref.cjs').keep(voices);return v?{lines,anchors,voices:v}:{lines,anchors};}
function archives(dir){let names;try{names=fs.readdirSync(dir);}catch{return [];}
 return names.filter(f=>/\.arc$/i.test(f)).map(f=>path.join(dir,f)).filter(f=>{try{const fd=fs.openSync(f,'r');try{const h=Buffer.alloc(4+16*12);fs.readSync(fd,h,0,h.length,0);const n=h.readInt32LE(0);
 /* E654 Willadv (Will's engine before AdvHD) keeps scripts beside images in one ARC, so WSC need not be the first extension */
 if(!(n>0&&n<16))return false;for(let i=0;i<n;i++)if(/^(WSC|SCR)\0?$/i.test(h.toString('latin1',4+i*12,8+i*12).replace(/\0+$/,'')))return true;return false;}finally{fs.closeSync(fd);}}catch{return false;}});}
function scenesIn(file){let b;try{b=fs.readFileSync(file);}catch{return [];}const es=list(b);if(!es)return [];
 return es.filter(e=>/\.(wsc|scr)$/i.test(e.name)).map(e=>({name:e.name,read:()=>decode(b.subarray(e.offset,e.offset+e.size))}));}
const engine={
 id:'advhd',hint:'Rio.arc（.wsc）',
 scenes:dir=>archives(dir).flatMap(scenesIn).sort((a,b)=>a.name.localeCompare(b.name)),
 archives:dir=>archives(dir).flatMap(scenesIn),
 sources:archives,
 parse,test:n=>/\.wsc$/i.test(n),
 _internal:{list,decode},
};
/* E580 an archive's index without reading the whole file (the voice catalogue: voice archives are large) */
const listFile=file=>{return list(kit.head(file,8<<20),kit.size(file));};
module.exports={parse,decode,list,listFile,engine};
