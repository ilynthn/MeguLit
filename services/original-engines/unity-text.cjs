// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* E340 Unity ports that keep their scenario as TextAssets with every language on one line (Steam 月に寄りそう乙女の作法:
   <name>_Data/resources.assets). A text line reads  日本語※简体中文※繁體中文 ; command lines start with ^ \ or //.
   In the text, [rb,漢字,よみ] is the game's ruby (漢字 is drawn) and [n] a line break; other [..] tags are dropped.
   The TextAssets are found without a type tree: a name (length-prefixed ASCII), padding to 4, then the data
   (length-prefixed) holding "※". A scene is a TextAsset whose lines are mostly such triples with kana in the first part.
   The release's Simplified (else Traditional) Chinese part is the translation of each Japanese line. */
const fs=require('node:fs'),path=require('node:path');
const SEP='※',MARK=Buffer.from(SEP);
const KANA=/[ぁ-ゖァ-ヺ]/;
const HANS=/[们这说话时个来对没还让门见问题电车为样边过东华爱头间学认长听写书钱后于]/g,HANT=/[們這說話時個來對沒還讓門見問題電車為樣邊過東華愛頭間學認長聽寫書錢後於]/g;
const {stat}=require('./file-key.cjs');
// <name>_Data folders beside the program that hold a resources.assets.
function dataFiles(dir){let names;try{names=fs.readdirSync(dir,{withFileTypes:true});}catch{return [];}
 const out=[];for(const e of names)if(e.isDirectory()&&/_Data$/i.test(e.name)){const d=path.join(dir,e.name);let files;try{files=fs.readdirSync(d);}catch{continue;}
  for(const f of files)if(/^(?:resources|sharedassets\d+)\.assets$/i.test(f))out.push(path.join(d,f));}
 return out.sort();}
const isText=line=>{const t=line.trim();return !!t&&t.includes(SEP)&&!/^[\^\\/;]/.test(t);};
// TextAssets in one .assets file that carry "※" lines with Japanese in front.
function scan(buf){const out=[];
 for(let i=0;i+8<buf.length;i+=4){const n=buf.readUInt32LE(i);if(n<1||n>96)continue;let ok=true;for(let k=i+4;k<i+4+n;k++){const c=buf[k];if(c<0x21||c>0x7e){ok=false;break;}}if(!ok)continue;
  const j=(i+4+n+3)&~3;if(j+4>buf.length)continue;const m=buf.readUInt32LE(j);if(m<16||j+4+m>buf.length)continue;
  const data=buf.subarray(j+4,j+4+m);if(data.indexOf(MARK)<0)continue;
  const lines=data.toString('utf8').split(/\r?\n/).filter(isText);if(!lines.length)continue;
  const ja=lines.filter(l=>KANA.test(l.split(SEP)[0])).length;if(ja<lines.length*.5)continue;
  out.push({name:buf.toString('latin1',i+4,i+4+n),offset:j+4,size:m});i=((j+4+m+3)&~3)-4;}
 return out;}
const memo=new Map();
function assetsIndex(file){const key=file+'|'+stat(file);if(memo.has(key))return memo.get(key);let list=[];
 try{if(fs.statSync(file).size<=512*1024*1024){const buf=fs.readFileSync(file);if(buf.indexOf(MARK)>=0)list=scan(buf);}}catch{list=[];}
 memo.set(key,list);if(memo.size>16)memo.delete(memo.keys().next().value);return list;}
const readPart=(file,e)=>kit.readAt(file,e.offset,e.size);
const RB=/\[rb,([^,\]]*),([^\]]*)\]/g;
function clean(t){return t.replace(RB,'$1').replace(/\[n\]/g,'\n').replace(/\[[^\]]*\]/g,'').trim();}
// Which part after the Japanese is Simplified Chinese (else Traditional), found by its characters.
function chineseSlot(rows){let best=-1,bestHans=-1;const width=Math.max(0,...rows.map(r=>r.length));
 for(let i=1;i<width;i++){let n=0,hans=0,hant=0;for(const r of rows){const t=r[i]||'';if(!t||KANA.test(t)&&!/[一-鿿]/.test(t))continue;n++;hans+=(t.match(HANS)||[]).length;hant+=(t.match(HANT)||[]).length;}
  if(n<rows.length*.3)continue;if(best<0||hans-hant>bestHans){best=i;bestHans=hans-hant;}}
 return best;}
function parse(buf){const rows=[];for(const line of buf.toString('utf8').split(/\r?\n/))if(isText(line))rows.push(line.trim().split(SEP));
 const slot=chineseSlot(rows),lines=[],zh=[],ruby=[];
 for(const r of rows){const ja=r[0]||'';lines.push(clean(ja));zh.push(slot>0?clean(r[slot]||''):'');
  const pairs=[];for(const m of ja.matchAll(RB))if(m[1]&&m[2])pairs.push([m[1],m[2]]);ruby.push(pairs.length?pairs:null);}
 return {lines,anchors:[],zh,ruby};}
const unityText={
 id:'unity-text',hint:'<游戏>_Data\\resources.assets',
 scenes(dir){const out=new Map();
  for(const file of dataFiles(dir))for(const e of assetsIndex(file))if(!out.has(e.name.toLowerCase()))out.set(e.name.toLowerCase(),{name:e.name,read:()=>readPart(file,e)});
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:dir=>dataFiles(dir).filter(f=>assetsIndex(f).length),
 parse,test:()=>false,
 // The release's own Chinese part of each line (same rule as the KiriKiri Z language slots).
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 _internal:{scan,clean,chineseSlot},
};
module.exports=unityText;
