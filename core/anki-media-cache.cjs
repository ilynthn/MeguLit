// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* (user 2026-11-14 "读取游戏cv配音又失败") MeguLit keeps its own copy of the audio it puts on Anki cards (the game's CV clip,
   the synthesized sentence, the word reading), under the same media name, so a card plays it without asking Anki for it.
   Anki stays the fallback for cards mined before this copy existed; what comes back from Anki is copied here too. */
const fs=require('node:fs'),path=require('node:path');
const LIMIT=12*1024*1024;
/* only MeguLit's own clip names: no folders, no other add-ons' files */
const ours=name=>typeof name==='string'&&/^tomoyo_[A-Za-z0-9_]{1,120}\.(?:wav|mp3|ogg)$/.test(name);
function read(dir,name){if(!dir||!ours(name))return null;try{const file=path.join(dir,name),size=fs.statSync(file).size;if(!size||size>LIMIT)return null;return fs.readFileSync(file).toString('base64');}catch{return null;}}
function write(dir,name,base64){if(!dir||!ours(name)||typeof base64!=='string'||!base64||base64.length>LIMIT*4/3+4)return false;try{
 fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,name),tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,Buffer.from(base64,'base64'));fs.renameSync(tmp,file);return true;}catch{return false;}}
const dirFor=root=>path.join(root,'data','cache','anki-media');
module.exports={ours,read,write,dirFor};
