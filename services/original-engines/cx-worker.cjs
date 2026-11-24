// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E282: reads every scene file of a cx-encrypted KiriKiri Z archive once, off the main thread, and stores the text as
// JSON next to MeguLit's other caches. Each text keeps its language slots (Japanese, English, Simplified, Traditional).
const {workerData,parentPort}=require('node:worker_threads');
const fs=require('node:fs'),path=require('node:path');
const xp3=require('./xp3.cjs'),psb=require('./psb.cjs');
// Ruby is written "[reading]kanji"; line breaks are a literal \n.
const clean=s=>typeof s==='string'?s.replace(/\[[^\]]*\]/g,'').replace(/\\n/g,'\n'):'';
// The game's own readings (user: game ruby first): "[し]志[な]那[つ]都荘" puts a reading on each following character. A
// reading padded with full-width spaces ("[　げんじ　]玄[　ゅう]十") belongs to a word spread over several characters, so
// those characters are joined into one base with one reading.
const padded=r=>/^[\s　]|[\s　]$/.test(r);
function rubyOf(s){
 if(typeof s!=='string'||!s.includes('['))return [];
 const marks=[...s.matchAll(/\[([^\]]*)\](.)/gu)].map(m=>({at:m.index,end:m.index+m[0].length,reading:m[1],base:m[2]})),out=[];
 for(let i=0;i<marks.length;i++){const m=marks[i];
  if(padded(m.reading)){let base=m.base,reading=m.reading,j=i;
   while(j+1<marks.length&&marks[j+1].at===marks[j].end&&padded(marks[j+1].reading)){j++;base+=marks[j].base;reading+=marks[j].reading;}
   reading=reading.replace(/[\s　]/g,'');if(/[ぁ-ヿ]/.test(reading))out.push([base,reading]);i=j;continue;}
  // Neighbouring single readings make one word (志那都 → しなつ): learned per work, a lone 都 → つ would misread 都会.
  let base=m.base,reading=m.reading,j=i;
  while(j+1<marks.length&&marks[j+1].at===marks[j].end&&!padded(marks[j+1].reading)){j++;base+=marks[j].base;reading+=marks[j].reading;}
  if(/[ぁ-ヿ]/.test(reading))out.push([base,reading]);i=j;}
 return out;
}
/* A text entry is [name, display name, [[speaker, text, …] per language], [voices], …] in the multilingual Steam releases,
   and [name, [[speaker, text, length, plain, plain]], [voices] or null, …] in single-language KiriKiri Z scenes (死に逝く騎士、
   異世界に響く断末魔, マガルミナ, ましろ色シンフォニー SANA EDITION ...: every voiced line read as "" and every unvoiced one was
   dropped). The language slots are the first of t[2], t[1] holding [speaker, text] arrays; the voices the first array of
   objects with a voice after them. */
const isSlots=a=>Array.isArray(a)&&a.some(s=>Array.isArray(s)&&typeof s[1]==='string');
function slotsOf(t){if(isSlots(t[2]))return t[2];if(isSlots(t[1]))return t[1];return typeof t[2]==='string'?t[2]:null;}
function voiceOf(t){for(const k of [3,2]){const v=t[k];if(Array.isArray(v)){const hit=v.find(x=>x&&typeof x.voice==='string');if(hit)return hit.voice;}}return null;}
function textsOf(doc){
 const scenes=[];
 for(const scene of Array.isArray(doc.root?.scenes)?doc.root.scenes:[]){
  const rows=[],ruby=[],voices=[];
  for(const t of Array.isArray(scene?.texts)?scene.texts:[]){if(!Array.isArray(t))continue;const slots=slotsOf(t),vo=voiceOf(t);
   if(Array.isArray(slots)){rows.push(slots.map(s=>Array.isArray(s)?clean(s[1]):''));voices.push(vo||null);ruby.push(rubyOf(Array.isArray(slots[0])?slots[0][1]:''));}
   else if(typeof slots==='string'){rows.push([clean(slots)]);voices.push(vo||null);ruby.push(rubyOf(slots));}}
  if(rows.length)scenes.push({label:typeof scene.label==='string'?scene.label:'',rows,ruby,...(voices.some(Boolean)?{voices}:{})});
 }
 return scenes;
}
const NON_SCN=/\.(?:png|jpe?g|bmp|gif|webp|tlg\d?|psd|pimg|mstand|stage|ogg|wav|mp3|opus|flac|wma|sli|wmv|mp4|avi|mpe?g|mkv|amv|ttf|otf|ttc|tft|fon|ks|tjs|txt|csv|tsv|ini|xml|json|cfg|dll|exe|zip|7z|rar)$/i;
function build(file,{list=xp3.list(file)}={}){
 const docs=[];if(!list)return {docs,files:0};let tried=0;
 const hasScn=list.files.some(e=>/\.scn$/i.test(e.name));
 let cx=null;if(list.files.some(e=>e.encrypted))try{cx=require('./cx-filter.cjs').forArchive(file);}catch{}
 for(const entry of list.files){
  if(hasScn?!/\.scn$/i.test(entry.name):NON_SCN.test(entry.name))continue;
  let raw;try{raw=xp3.read(file,entry,cx);}catch{continue;}
  if(raw.length<0x40)continue;
  const h=raw.toString('latin1',0,4),plain=h==='PSB\0'||h==='mdf\0'||psb.isRiddlePsb(raw);
  if(!plain&&!((raw[1]^raw[3])===0x53&&(raw[2]^raw[3])===0x42||(raw[1]^raw[2])===0x11&&(raw[0]^raw[1])===0x03))continue;tried++;
  let doc=null;if(plain)try{const d=psb.parse(raw,{tolerant:true});if(d?.root&&typeof d.root==='object')doc=d;}catch{}if(!doc)doc=psb.openCx(raw);if(!doc)continue;
  const scenes=textsOf(doc);
  if(scenes.length)docs.push({entry:entry.name,name:typeof doc.root.name==='string'?doc.root.name:'',scenes});
 }
 return {docs,files:tried};
}
function prepare(file,out){
 const list=xp3.list(file);if(!list||!list.files.some(e=>e.encrypted||/\.scn$/i.test(e.name)))return false;
 const result=build(file,{list});fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({schema:1,file,...result}));return true;
}
if(parentPort&&workerData?.prepare){
 const signal=new Int32Array(workerData.signal);let status=3;
 try{status=prepare(workerData.file,workerData.attempt)?1:2;}catch{}
 finally{Atomics.store(signal,0,status);Atomics.notify(signal,0);}
}else if(parentPort&&workerData){
 const {file,out}=workerData;
 const attempt=out+'.'+process.pid+'.'+require('node:crypto').randomUUID()+'.tmp';
 try{const result=build(file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(attempt,JSON.stringify({schema:1,file,...result}));fs.renameSync(attempt,out);parentPort.postMessage({ok:true,docs:result.docs.length});}
 catch(error){try{fs.rmSync(attempt,{force:true});}catch{}parentPort.postMessage({ok:false,error:String(error?.message||error)});}
}
module.exports={build,prepare,textsOf,clean,rubyOf};
