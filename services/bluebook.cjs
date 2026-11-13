// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 学习 → 语法 · grammar cards from the learner's own Anki (2026-11-11, user: 本地 Anki 里有蓝宝书 N5–N1 语法，把语法条加进来
   和我们的课融合). Nothing of those cards ships with MeguLit: they are read at run time from the collection on this
   computer (a copy, read only), so each learner sees the decks they own. A note type counts when it has the fields
   Word, Level and Explain1 / Example1 (the layout of the 蓝宝书 grammar decks); other decks are ignored. */
const fs=require('fs'),path=require('path'),os=require('os');
const plain=s=>String(s||'').replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
/* Anki furigana 「 以[い] 外[がい]」 → 以外 */
const noRuby=s=>plain(s).replace(/\s*([^\s\[\]]+?)\[[^\]]*\]/g,'$1').replace(/\s+/g,' ').trim();
function profiles(env=process.env){
  const bases=[...new Set([env.APPDATA&&path.join(env.APPDATA,'Anki2'),env.USERPROFILE&&path.join(env.USERPROFILE,'AppData','Roaming','Anki2'),env===process.env&&path.join(os.homedir(),'AppData','Roaming','Anki2')].filter(Boolean))],out=[];
  for(const base of bases){try{for(const d of fs.readdirSync(base,{withFileTypes:true}))if(d.isDirectory()&&fs.existsSync(path.join(base,d.name,'collection.anki2'))&&!out.some(x=>x.name===d.name))out.push({name:d.name,file:path.join(base,d.name,'collection.anki2')});}catch{}}
  return out;}
/* One example line: the text without furigana, and the bold part (the grammar) as the highlight. */
function example(html,zh){const ja=noRuby(html);if(!ja)return null;const m=String(html).match(/<b>([\s\S]*?)<\/b>/i),hl=m?noRuby(m[1]):'';return {ja,hl:hl&&ja.includes(hl)?hl:'',zh:plain(zh).trim()};}
/* The forms that mark the point in a line: the headword split at ／ and 、 without ～, plus the bold parts of its examples. */
function hitsOf(word,examples){const out=new Set();
  for(const w of noRuby(word).split(/[\/／、,，]|\s+or\s+/))for(const v of [w.replace(/[～~〜（）()]/g,'').trim()])if([...v].length>=2&&!/[A-Za-z＋+]/.test(v))out.add(v);
  for(const e of examples)if(e.hl&&[...e.hl].length>=2&&[...e.hl].length<=12)out.add(e.hl);
  return [...out];}
function cardOf(f,id,deck){
  const many=(p,max)=>Array.from({length:max},(_,i)=>f(p+(i+1))).filter(x=>plain(x).trim()),level=(plain(f('Level')).match(/N[1-5]/)||[])[0];if(!level)return null;
  const word=noRuby(f('Word')).replace(/^\s+/,'');if(!word)return null;
  const examples=Array.from({length:25},(_,i)=>example(f('Example'+(i+1)),f('Chinese'+(i+1)))).filter(Boolean);
  return {id:'bb-'+String(id),level,word,form:many('ConnectiveType',10).map(noRuby),explain:many('Explain',15).map(noRuby),notes:many('Note',15).map(noRuby),examples,hits:hitsOf(word,examples),order:Number(plain(f('TotalOrder')))||0,deck};
}
function parse(db){
  const types=db.prepare('SELECT id,name FROM notetypes').all().filter(t=>{const f=db.prepare('SELECT name FROM fields WHERE ntid=? ORDER BY ord').all(t.id).map(x=>x.name);return ['Word','Level','Explain1','Example1'].every(n=>f.includes(n));});
  const out=[];
  for(const t of types){const names=db.prepare('SELECT name FROM fields WHERE ntid=? ORDER BY ord').all(t.id).map(x=>x.name),idx=Object.fromEntries(names.map((n,i)=>[n,i]));
    for(const n of db.prepare('SELECT id,flds FROM notes WHERE mid=?').all(t.id)){const row=String(n.flds).split('\x1f'),c=cardOf(name=>idx[name]==null?'':row[idx[name]]||'',n.id,t.name);if(c)out.push(c);}}
  return out.sort((a,b)=>a.level.localeCompare(b.level)||a.order-b.order);
}
/* Reads every Anki profile on this computer (copies first: Anki may be open), cached by the files' modified time. */
function fromFiles(root,env){
  const list=profiles(env),errors=[];if(!list.length)return {available:false,points:[],profiles:[],errors:['没有找到 Anki 的用户文件夹（%APPDATA%\\Anki2）']};
  const stamp=list.map(p=>{let m=0;for(const x of [p.file,p.file+'-wal'])try{m=Math.max(m,fs.statSync(x).mtimeMs);}catch{}return p.name+':'+m;}).join('|');
  const cache=path.join(root,'data','grammar-anki-cache.json');try{const c=JSON.parse(fs.readFileSync(cache,'utf8'));if(c.stamp===stamp&&c.result?.available)return c.result;}catch{}
  let DatabaseSync;try{({DatabaseSync}=require('node:sqlite'));}catch(e){return {available:false,points:[],profiles:list.map(p=>p.name),errors:['本机的读取组件不支持 SQLite：'+e.message]};}
  const points=[],seen=new Set();
  for(const p of list){let dir='';
    try{dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-'));const copy=path.join(dir,'c.anki2');fs.copyFileSync(p.file,copy);if(fs.existsSync(p.file+'-wal'))fs.copyFileSync(p.file+'-wal',copy+'-wal');
      const db=new DatabaseSync(copy,{readOnly:false});try{for(const x of parse(db))if(!seen.has(x.word+x.level)){seen.add(x.word+x.level);points.push({...x,profile:p.name});}}finally{db.close();}}
    catch(e){errors.push(`${p.name}：${e.code||''} ${e.message}`.trim());}finally{if(dir)try{fs.rmSync(dir,{recursive:true,force:true});}catch{}}}
  const result={available:points.length>0,points,profiles:list.map(p=>p.name),errors};
  if(result.available)try{fs.mkdirSync(path.dirname(cache),{recursive:true});fs.writeFileSync(cache,JSON.stringify({stamp,result}));}catch{}
  return result;
}
/* Through AnkiConnect when Anki is open: the decks whose name mentions 蓝宝书, their notes as cards. */
async function fromAnkiConnect(anki,config){
  const decks=(await anki.call(config,'deckNames')).filter(d=>/蓝宝书|藍宝書|ブルーブック/i.test(d));if(!decks.length)return {available:false,points:[],decks:[]};
  const ids=new Set();for(const d of decks.filter(d=>!decks.some(o=>o!==d&&d.startsWith(o+'::'))))for(const id of await anki.call(config,'findNotes',{query:`deck:"${d.replace(/"/g,'\\"')}"`}))ids.add(id);
  const points=[],seen=new Set(),all=[...ids];
  for(let i=0;i<all.length;i+=200){const notes=await anki.call(config,'notesInfo',{notes:all.slice(i,i+200)});
    for(const n of notes){const c=cardOf(name=>n.fields?.[name]?.value||'',n.noteId,n.modelName);if(c&&!seen.has(c.word+c.level)){seen.add(c.word+c.level);points.push(c);}}}
  return {available:points.length>0,points:points.sort((a,b)=>a.level.localeCompare(b.level)||a.order-b.order),decks,via:'ankiconnect'};
}
/* Files first; AnkiConnect when the files give nothing; every reason kept so the page can say what went wrong. */
async function readAll(root,{env=process.env,anki=null,config=null}={}){
  const a=fromFiles(root,env);if(a.available)return a;
  if(anki&&config){try{const b=await fromAnkiConnect(anki,config);if(b.available)return {...b,profiles:a.profiles};if(b.decks?.length)a.errors.push('AnkiConnect 找到了牌组 '+b.decks.join('、')+'，但卡片字段不是蓝宝书格式');a.decks=b.decks;}catch(e){a.errors.push('AnkiConnect：'+(e.message||e));}}
  return a;
}
function read(root,opts){return fromFiles(root,opts?.env);}
/* The lines you read that contain each card's forms (at most 4 per card, recorded lines and human translations first). */
/* E459: the page's version lets other requests run between cards (763 cards × 20 000 lines held the service for seconds)
   and is cached until the cards or the lines change */
const exampleCache={key:null,value:null};
async function examplesForAsync(points,list,opts={}){
  const key=points.length+':'+(points[0]?.id||'')+':'+(points.at(-1)?.id||'')+'|'+list.length+':'+(list[0]?.text||'');if(exampleCache.key===key)return exampleCache.value;
  const breathe=require('./cooperative.cjs').breather(),out={};
  for(let i=0;i<points.length;i+=25){Object.assign(out,examplesFor(points.slice(i,i+25),list,opts));await breathe();}
  exampleCache.key=key;exampleCache.value=out;return out;
}
function examplesFor(points,list,{max=4}={}){
  const score=e=>(e.translationSource==='group'||e.translationSource==='official'?4:e.translation?1:0)+(e.origin==='history'?2:0);
  const out={};for(const p of points){const hits=[...p.hits].sort((a,b)=>b.length-a.length),found=[];
    for(const c of list){if(found.length>=20)break;const h=hits.find(x=>c.text.includes(x));if(!h)continue;const at=c.text.indexOf(h),start=[...c.text.slice(0,at)].length;
      found.push({text:c.text,origin:c.origin,gameId:c.gameId,title:c.title,translation:c.translation,translationSource:c.translationSource,start,end:start+[...h].length,readAt:c.readAt,readBy:c.readBy});}
    if(found.length)out[p.id]=found.sort((a,b)=>score(b)-score(a)).slice(0,max);}
  return out;
}
/* 「下载并自动导入」: after the learner clicks Download on AnkiWeb, the newest .apkg that appeared in Downloads since
   `since` (and stopped growing) is imported: through AnkiConnect when it answers, otherwise opened with Anki. */
function newDeck(since,{dir=path.join(os.homedir(),'Downloads')}={}){
  let best=null;try{for(const f of fs.readdirSync(dir)){if(!/\.apkg$/i.test(f))continue;const file=path.join(dir,f),st=fs.statSync(file);if(st.mtimeMs>=since&&(!best||st.mtimeMs>best.mtime))best={file,mtime:st.mtimeMs,size:st.size};}}catch{}
  return best;
}
async function importDeck(file,{anki=null,config=null,open=null}={}){
  if(anki&&config){try{await anki.call(config,'importPackage',{path:file});return {imported:true,via:'ankiconnect'};}catch{}}
  if(open){open(file);return {imported:false,via:'open'};}
  return {imported:false,via:'none'};
}
module.exports={examplesForAsync,newDeck,importDeck,read,readAll,fromFiles,fromAnkiConnect,cardOf,parse,profiles,examplesFor,noRuby,hitsOf};
