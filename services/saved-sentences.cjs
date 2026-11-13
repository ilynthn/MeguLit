'use strict';
/* Saved sentences (学习 → 句子): the one write path into saved_sentences, shared by the app bridge and the reader.
   One row per game + original text. source: 'manual' (收藏句子 in the drag-selection card) or 'auto' (left behind
   when a word from the line went to Anki). A manual save upgrades an auto row; an auto save never downgrades.
   Account sync picks rows up by diffing the table (services/account.cjs). */
const SOURCES=['manual','auto'];
const clean=v=>String(v??'').replace(/\r\n?/g,'\n').trim();
function migrate(db){if(!db.prepare('PRAGMA table_info(saved_sentences)').all().some(c=>c.name==='source'))db.exec("ALTER TABLE saved_sentences ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");}
function find(db,gameId,text){
 text=clean(text);if(!text)return null;
 return db.prepare('SELECT id,game_id,text,translation,created_at,source FROM saved_sentences WHERE text=? AND game_id IS ? ORDER BY id LIMIT 1').get(text,gameId||null)||null;
}
function save(db,{gameId,text,translation,source}={},now=Date.now()){
 text=clean(text);translation=clean(translation);source=SOURCES.includes(source)?source:'manual';
 if(!text||text.length>3000||translation.length>3000)throw Error('INVALID_SENTENCE');
 gameId=gameId?String(gameId):null;
 const found=find(db,gameId,text);
 if(found){
  if(translation&&!found.translation){db.prepare('UPDATE saved_sentences SET translation=? WHERE id=?').run(translation,found.id);found.translation=translation;}
  if(source==='manual'&&found.source!=='manual'){db.prepare("UPDATE saved_sentences SET source='manual' WHERE id=?").run(found.id);found.source='manual';}
  return {...found,saved:true,created:false};
 }
 const created_at=Math.floor(now/1000);
 const id=Number(db.prepare('INSERT INTO saved_sentences(game_id,text,translation,created_at,original,source) VALUES(?,?,?,?,?,?)').run(gameId,text,translation,created_at,'{"source":"reader"}',source).lastInsertRowid);
 return {id,game_id:gameId,text,translation,created_at,source,saved:true,created:true};
}
/* root given: the sentence's scene picture (sentence-scenes.cjs) goes too once no other sentence uses it */
function remove(db,{id,gameId,text}={},{root}={}){
 const drop=n=>{const row=root?db.prepare('SELECT game_id,original FROM saved_sentences WHERE id=?').get(n):null,deleted=db.prepare('DELETE FROM saved_sentences WHERE id=?').run(n).changes>0;
  if(deleted&&row){const scenes=require('./sentence-scenes.cjs'),scene=scenes.sceneOf(row.original);if(scene)scenes.release(db,root,row.game_id,scene);}return deleted;};
 if(id!==undefined&&id!==null&&id!==''){const n=Number(id);if(!Number.isSafeInteger(n))throw Error('INVALID_SENTENCE');return {deleted:drop(n),saved:false};}
 const found=find(db,gameId?String(gameId):null,text);if(!found)return {deleted:false,saved:false};
 drop(found.id);return {deleted:true,saved:false,id:found.id};
}
function state(db,{gameId,text}={}){const found=find(db,gameId?String(gameId):null,text);return {saved:!!found,id:found?.id??null,source:found?.source||''};}
/* 学习 → 句子: newest first, each with the words sent to Anki / the word list from that line (examples.text) */
function list(db,{source}={}){
 const filter=SOURCES.includes(source)?' WHERE s.source=?':'';
 const rows=db.prepare('SELECT s.id,s.game_id,s.text,s.translation,s.created_at,s.source,s.original,g.title FROM saved_sentences s LEFT JOIN games g ON s.game_id=g.id'+filter+' ORDER BY s.created_at DESC,s.id DESC LIMIT 1000').all(...(filter?[source]:[]));
 const words=db.prepare('SELECT DISTINCT v.id,v.spelling,v.reading FROM examples e JOIN vocabulary v ON v.id=e.word_id WHERE e.text=? ORDER BY e.id');
 /* 2026-11-13 scene {file,hash,at}|null and source, the same fields as game_detail's sentences (the 学习 › 句子 hero and strip show the frame) */
 const {sceneOf}=require('./sentence-scenes.cjs');
 return rows.map(({original,...r})=>({...r,source:r.source||'manual',scene:sceneOf(original),words:words.all(r.text).map(w=>({...w}))}));
}
module.exports={save,remove,state,find,list,migrate,SOURCES};
