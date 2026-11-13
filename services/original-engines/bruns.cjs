// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* Bruns system (Belisama ダストマニア・グロテスク～解体挿入新書～): scene/*.bso are "EENC"/"EENZ" files, as in GARbro (MIT,
   ArcFormats/Bruns/ImageEENC.cs): key = (u32 at 4) ^ 0xDEADBEEF, bytes from 8 XOR-ed with the key's bytes in turn, then
   zlib for "EENZ". The scene is Lisp-like Shift-JIS: (a3:send-string "[$B千春$K]台詞$N" n) puts text up, wait-w waits
   for a click. [$X名前$K] names the speaker; $N ends a line, other $X codes are colours/styles. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const sj=kit.SJIS;
function decode(b){const tag=b.toString('latin1',0,4);if(tag!=='EENC'&&tag!=='EENZ')return b;const key=(b.readUInt32LE(4)^0xDEADBEEF)>>>0,d=Buffer.from(b.subarray(8));
 for(let i=0;i<d.length;i++)d[i]^=(key>>>((i&3)*8))&255;return tag==='EENZ'?zlib.inflateSync(d):d;}
function parse(data){const t=sj.decode(decode(data)),lines=[];let name='',text='';
 const flush=()=>{const s=text.replace(/^[　\s]+|[　\s]+$/g,'');if(s&&/[ぁ-ゖァ-ヺ一-龯]/.test(s)){if(name)lines.push(name);lines.push(s);}name='';text='';};
 for(const m of t.matchAll(/\(a3:send-string\s+(?:"((?:[^"\\]|\\.)*)"|([\w-]+))/g)){
  if(m[2]){if(m[2]==='wait-w'||m[2]==='clear')flush();continue;}
  let s=m[1];const who=s.match(/^\[\$[A-Z]([^$\]]*)\$[A-Z]\]/);if(who){flush();name=who[1];s=s.slice(who[0].length);}
  text+=s.replace(/\$[A-Za-z]/g,'');}
 flush();return {lines,anchors:[]};}
const sceneDir=dir=>{const d=path.join(dir,'scene');try{return fs.readdirSync(d).some(f=>/\.bso$/i.test(f))?d:null;}catch{return null;}};
/* E577 kit.engine: loose scene\*.bso */
const engine=kit.engine({id:'bruns',hint:'scene\\*.bso',overlay:false,loose:{name:/\.bso$/i,subs:['scene']},parse,test:n=>/\.bso$/i.test(n),extra:{_internal:{decode}}});
module.exports={decode,parse,engine};
