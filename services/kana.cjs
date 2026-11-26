'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   Kana learning module: local progress file and example lines from the player's own reading history. */
const fs=require('fs'),path=require('path');
const {plainWithRuby}=require('../core/example-ruby.cjs');
const FILE=root=>path.join(root,'data','kana-progress.json');
const MAX_BYTES=4*1024*1024;

function clean(data){
 const o=data&&typeof data==='object'&&!Array.isArray(data)?data:{};
 const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
 const mastery={};for(const [k,v] of Object.entries(obj(o.mastery)))if([...k].length<=2&&Number.isInteger(v)&&v>=0&&v<=3)mastery[k]=v;
 const boxes={};for(const [k,v] of Object.entries(obj(o.boxes)))if([...k].length<=2&&v&&Number.isInteger(v.box)&&v.box>=1&&v.box<=4&&Number.isFinite(v.due))boxes[k]={box:v.box,due:v.due};
 const runs=(Array.isArray(o.runs)?o.runs:[]).filter(r=>r&&typeof r==='object'&&Number.isFinite(r.id)&&Array.isArray(r.log)).slice(-200);
 const applied=(Array.isArray(o.applied)?o.applied:[]).filter(Number.isFinite).slice(-300);
 const lessons={};for(const [k,v] of Object.entries(obj(o.lessons)))if(/^[a-z]\d{1,2}$/.test(k)&&Number.isFinite(v))lessons[k]=v;
 const p=obj(o.prefs),prefs={volume:Number.isFinite(p.volume)?Math.min(1,Math.max(0,p.volume)):0.4,romaji:p.romaji!==false,speaker:Number.isSafeInteger(p.speaker)?p.speaker:null,speed:Number.isFinite(p.speed)?Math.min(1.3,Math.max(0.7,p.speed)):0.9,voice:['female','male','ai'].includes(p.voice)?p.voice:'female'};
 return {version:1,mastery,boxes,runs,applied,lessons,prefs};
}
function read(root){try{return clean(JSON.parse(fs.readFileSync(FILE(root),'utf8')));}catch{return clean({});}}
function save(root,data){
 const value=clean(data),json=JSON.stringify(value);if(json.length>MAX_BYTES)throw Error('KANA_PROGRESS_TOO_LARGE');
 const file=FILE(root),tmp=file+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(tmp,json);fs.renameSync(tmp,file);return {saved:true,runs:value.runs.length};
}

/* Count kana words in recent reading history. A word only counts when it is not part of a longer hiragana run
   (うん inside うんめい does not count), and one example line is kept per word. */
function gameWords(db,words){
 const list=[...new Set((Array.isArray(words)?words:[]).map(String).filter(w=>/^[ぁ-ゖァ-ヺー]{1,12}$/u.test(w)))].slice(0,150);
 if(!list.length)return {words:{}};
 const rows=db.prepare('SELECT e.text,e.read_at,g.title FROM reading_events e LEFT JOIN games g ON e.game_id=g.id ORDER BY e.read_at DESC,e.id DESC LIMIT 20000').all();
 for(const row of rows){row.text=plainWithRuby(row.text,true).text;if(/[\u3099\u309a]/u.test(row.text))row.text=row.text.normalize('NFC');}
 const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const out={};
 for(const w of list){
  const re=new RegExp('(?<![\\u3041-\\u3096])'+esc(w)+'(?![\\u3041-\\u3096])','gu');let n=0,example=null,long=null;
  for(const row of rows){
   const text=String(row.text||'');if(!text.includes(w))continue;
   const hits=text.match(re);if(!hits)continue;n+=hits.length;
   if(example)continue;
   const short=text.length<=60||(text.length<=120&&[...text].length<=60);
   if(!short&&long)continue;
   const matches=[...text.matchAll(re)].map(m=>m.index);
   const info={title:row.title||'',read_at:row.read_at};
   if(short){example={...info,text,matches};continue;}
   const i=matches[0],start=i-[...text.slice(0,i)].slice(-20).join('').length;
   const end=i+w.length+[...text.slice(i+w.length)].slice(0,24).join('').length;
   const prefix=start?'…':'';
   long={...info,text:prefix+text.slice(start,end)+(end<text.length?'…':''),
    matches:matches.filter(at=>at+w.length<=end).map(at=>at-start+prefix.length)};
  }
  if(n)out[w]={count:n,example:example||long};
 }
 return {words:out,scanned:rows.length};
}
module.exports={read,save,gameWords,clean};
