// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 English interface: online lookups go to Jisho (jisho.org public search API, free, no sign-in) instead of
   MOJi, whose definitions are Chinese. Results use the same shape as MOJi results (spelling, reading, partOfSpeech,
   definition) plus jlpt/common tags. Requests are gentle: answers are cached (memory + data/config/jisho-cache.json,
   7 days; misses 1 day), the same word in flight is shared, and network calls are spaced at least GAP_MS apart. */
const fs=require('node:fs'),path=require('node:path');
const ENDPOINT='https://jisho.org/api/v1/search/words?keyword=';
const TTL=7*864e5,MISS_TTL=864e5,GAP_MS=1100,MAX_CACHE=500;
const memory=new Map(),inflight=new Map();let nextSlot=0;

const clean=(v,max=400)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const cacheFile=root=>root?path.join(root,'data','config','jisho-cache.json'):'';
let disk=null,diskRoot='';
function load(root){if(disk&&diskRoot===root)return disk;diskRoot=root;disk={};try{const f=cacheFile(root);if(f)disk=JSON.parse(fs.readFileSync(f,'utf8'))||{};}catch{disk={};}return disk;}
function save(root){const f=cacheFile(root);if(!f||!disk)return;try{const keys=Object.keys(disk);if(keys.length>MAX_CACHE)for(const k of keys.sort((a,b)=>disk[a].at-disk[b].at).slice(0,keys.length-MAX_CACHE))delete disk[k];
 fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f+'.tmp',JSON.stringify(disk));fs.renameSync(f+'.tmp',f);}catch{}}

/* Jisho's parts of speech are long English phrases ("Godan verb with 'ku' ending", "Noun"); keep them short */
function shortPos(p){const s=clean(p,80);if(/^Wikipedia definition$/i.test(s))return '';
 return s.replace(/^Godan verb.*$/i,'Godan verb').replace(/^Ichidan verb.*$/i,'Ichidan verb').replace(/^Suru verb.*$/i,'Suru verb').replace(/\s*\(.*\)$/,'');}

/* One Jisho response → result rows like MOJi's */
function parse(json){
 const out=[];
 for(const item of Array.isArray(json?.data)?json.data.slice(0,12):[]){
  const jp=Array.isArray(item.japanese)?item.japanese:[],head=jp.find(j=>j&&(j.word||j.reading))||{};
  const spelling=clean(head.word||head.reading,80),reading=clean(head.reading||'',80);if(!spelling)continue;
  const senses=(Array.isArray(item.senses)?item.senses:[]).filter(s=>Array.isArray(s.english_definitions)&&s.english_definitions.length&&!(s.parts_of_speech||[]).includes('Wikipedia definition'));
  const pos=[...new Set(senses.flatMap(s=>s.parts_of_speech||[]).map(shortPos).filter(Boolean))].slice(0,4);
  const jlpt=[...new Set((item.jlpt||[]).map(j=>String(j).replace(/^jlpt-/i,'').toUpperCase()).filter(j=>/^N[1-5]$/.test(j)))].sort().reverse()[0]||'';
  const definition=senses.slice(0,3).map((s,i)=>(senses.length>1?(i+1)+'. ':'')+s.english_definitions.slice(0,4).join('; ')).join('\n');
  out.push({spelling,reading:spelling===reading?'':reading,pron:reading,source:'jisho',partOfSpeech:pos,jlpt,common:!!item.is_common,
   forms:jp.slice(1,4).map(j=>clean(j.word||j.reading,40)).filter(Boolean),definition});
 }
 return out;
}

async function throttle(now=Date.now){const wait=Math.max(0,nextSlot-now());nextSlot=Math.max(nextSlot,now())+GAP_MS;if(wait)await new Promise(r=>setTimeout(r,wait));}

async function lookupJisho(query,fetcher=fetch,options={}){
 const word=typeof query==='string'?query.trim().slice(0,100):'';if(!word)return [];
 const now=options.now||Date.now(),key=word.normalize('NFKC');
 const hit=memory.get(key)||load(options.root||'')[key];
 if(hit&&now-hit.at<(hit.items.length?TTL:MISS_TTL)){memory.set(key,hit);return hit.items;}
 if(inflight.has(key))return inflight.get(key);
 const job=(async()=>{
  if(!options.noThrottle)await throttle();
  const res=await fetcher(ENDPOINT+encodeURIComponent(word),{headers:{accept:'application/json','user-agent':'MeguLit dictionary'},signal:AbortSignal.timeout(options.timeout||10000)});
  if(!res.ok)throw Error('JISHO_UNAVAILABLE');
  const items=parse(await res.json()),entry={at:Date.now(),items};
  memory.set(key,entry);if(memory.size>MAX_CACHE)memory.delete(memory.keys().next().value);
  if(options.root){load(options.root)[key]=entry;save(options.root);}
  return items;
 })().finally(()=>inflight.delete(key));
 inflight.set(key,job);return job;
}
function _reset(){memory.clear();inflight.clear();disk=null;diskRoot='';nextSlot=0;}
module.exports={lookupJisho,parse,shortPos,ENDPOINT,GAP_MS,_reset};
