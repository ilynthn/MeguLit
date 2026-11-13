// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E653 STCM2 / STCM2L scripts (Idea Factory / Otomate titles and their PC ports). Family F4a.
   Format reference (read, not copied): kubo25/Diabolik-Lovers-STCM2L-Editor (MIT) classes/{STCM2L,Action,TextEntity}.cs.
     file     "STCM2…" header; "CODE_START_\0" within the first 2000 bytes, the code right after it. u32 @0x20 exports
              position ("EXPORT_DATA" 12 bytes before it), u32 @0x2C collection link
     action   u32 local-call flag, u32 opcode, u32 parameter count, u32 length (with all of this), count × {u32 v1, v2,
              v3}, then extra data. A parameter whose v1 points inside its own action (and whose top byte is not 0xFF)
              is a local one: at v1 - action start + 12 the extra data holds u32 length + the string bytes (NUL padded)
   The editor takes 0xD2 lines, 0xD4 names, 0xE7 choices and 0x79D0 places, but opcode numbers differ between titles, so
   this reader is opcode-agnostic: every local string parameter with non-ASCII text, in action order, is a line (the
   speaker, when there is one, comes before the line). ASCII strings (labels, file names) are anchors. */
const kit=require('./kit.cjs');

function start(b){const at=b.subarray(0,Math.min(b.length,2048)).indexOf('CODE_START_','latin1');return at<0?-1:at+12;}
/* the local strings of every action in order: [Buffer] */
function strings(b){if(b.length<0x40||b.toString('latin1',0,5)!=='STCM2')return null;const s=start(b);if(s<0)return null;const exp=b.readUInt32LE(0x20),end=exp>=12&&exp<=b.length?exp-12:b.length,out=[];
 for(let a=s;a+16<=end;){const n=b.readUInt32LE(a+8),len=b.readUInt32LE(a+12);if(len<16+n*12||a+len>b.length||n>4096)break;
  for(let i=0;i<n;i++){const v1=b.readUInt32LE(a+16+i*12);if((v1>>>24)===0xff||v1<=a||v1>=a+len)continue;const q=v1+12;if(q+4>a+len)continue;const l=b.readUInt32LE(q);if(q+4+l>a+len)continue;
   let z=b.subarray(q+4,q+4+l);const e=z.indexOf(0);if(e>=0)z=z.subarray(0,e);if(z.length)out.push(z);}
  a+=len;}
 return out;}
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf),list=strings(b);if(!list)return {lines:[],anchors:[]};const dec=kit.decoder(list),lines=[],anchors=[];
 for(const x of list){if(!x.some(c=>c>=0x80)){anchors.push(x.toString('latin1'));continue;}const t=kit.trimBoth(dec.decode(x));if(t)lines.push(t);}return {lines,anchors};}
const isStcm=f=>kit.head(f,5).toString('latin1')==='STCM2';
function looseFiles(dir){return kit.files(dir,{name:/\.(dat|bin|stcm2?l?|scr)$|^[^.]+$/i,subs:['','script','scripts','data','scenario'],max:4000}).filter(isStcm);}
const fs=require('node:fs'),path=require('node:path');
const engine={id:'stcm2',hint:'STCM2L scripts',
 scenes:dir=>looseFiles(dir).map(f=>({name:path.basename(f),read:()=>fs.readFileSync(f)})).sort((a,b)=>a.name.localeCompare(b.name)),
 sources:looseFiles,parse,test:()=>false};
engine.archives=engine.scenes;
module.exports={engine,parse,strings,isStcm};
