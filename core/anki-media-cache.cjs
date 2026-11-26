// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* (user 2026-11-14 "读取游戏cv配音又失败") MeguLit keeps its own copy of the audio it puts on Anki cards (the game's CV clip,
   the synthesized sentence, the word reading), under the same media name, so a card plays it without asking Anki for it.
   Anki stays the fallback for cards mined before this copy existed; what comes back from Anki is copied here too. */
const fs=require('node:fs'),path=require('node:path');
const LIMIT=12*1024*1024;
const MAX_ENCODED=4*Math.ceil(LIMIT/3);
function boundedBase64(data){
 if(typeof data!=='string'||!data)return null;
 if(data.length<=MAX_ENCODED)return data;
 const compact=data.replace(/[\t\n\r ]+/g,'');
 return compact&&compact.length<=MAX_ENCODED?compact:null;
}
/* only MeguLit's own clip names: no folders, no other add-ons' files */
const ours=name=>typeof name==='string'&&/^tomoyo_[A-Za-z0-9_]{1,120}\.(?:wav|mp3|ogg|m4a)$/.test(name);
function read(dir,name){if(!dir||!ours(name))return null;try{const file=path.join(dir,name),size=fs.statSync(file).size;if(!size||size>LIMIT)return null;return fs.readFileSync(file).toString('base64');}catch{return null;}}
function write(dir,name,base64){if(!dir||!ours(name))return false;base64=boundedBase64(base64);if(!base64)return false;try{
 fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,name),tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,Buffer.from(base64,'base64'));fs.renameSync(tmp,file);return true;}catch{return false;}}
const dirFor=root=>path.join(root,'data','cache','anki-media');
/* 2026-11-15 (user: AI 合成的例句要拉「游戏原声」才能调音量) a synthesized sentence kept under a tomoyo_g_ name (it replaced a
   wrong game clip) is marked, so it plays on the synthesized-sentence channel and is not synthesized again */
const mark=(dir,name)=>path.join(dir,name+'.synth');
function markSynth(dir,name,on=true){if(!dir||!ours(name))return;try{if(on){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(mark(dir,name),'');}else fs.unlinkSync(mark(dir,name));}catch{}}
function isSynth(dir,name){if(!dir||!ours(name))return false;try{return fs.existsSync(mark(dir,name));}catch{return false;}}
/* what an audio clip really is (a game's ogg may sit under a .wav name) */
function mimeOf(base64,name){const h=String(base64||'').slice(0,8),b=Buffer.from(String(base64||'').slice(0,16),'base64');if(h.startsWith('T2dnUw'))return 'audio/ogg';if(h.startsWith('UklGR'))return 'audio/wav';if(b.length>=2&&b[0]===0xff&&(b[1]&0xf6)===0xf0)return 'audio/aac';if(h.startsWith('SUQz')||h.startsWith('//'))return 'audio/mpeg';if(h.startsWith('ZkxhQw'))return 'audio/flac';if(h.startsWith('GkXfo'))return 'audio/webm';if(b.toString('latin1',4,8)==='ftyp')return 'audio/mp4';
 const m=/\.([^.]+)$/.exec(String(name||'')),ext=m?m[1].toLowerCase():'';return {mp3:'audio/mpeg',ogg:'audio/ogg',opus:'audio/ogg',m4a:'audio/mp4',flac:'audio/flac',webm:'audio/webm',aac:'audio/aac'}[ext]||'audio/wav';}
module.exports={ours,read,write,dirFor,markSynth,isSynth,mimeOf,boundedBase64};
