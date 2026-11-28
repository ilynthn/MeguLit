// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-15 The game's own voice of a saved line (user: 我游戏里有cv的例句怎么出来朗读还是ai合成？).
   Same for every engine. When a line is saved (收藏句子, or kept by an Anki card) its voice is written into the row's
   original JSON as voice:
     {kind:'scan', g, ref, estimated?}  the clip the game's script plays for it (game-voice.cjs index: engine readers +
                                        archive catalog); read out of the game's archive when it is played;
     {kind:'file', file, from}          a clip kept in data/saved-voice: a runtime clip game-voice kept for the line, or
                                        cut at the moment of saving from the game process loopback ring (GameAudio.cs,
                                        only the game's own process tree; kept only when the ring heard speech);
     {kind:'none', at}                  nothing found then; looked up again when played (older saved lines too).
   play() gives the game voice of a saved line or of any sentence text, else null (the caller synthesizes). */
const fs=require('node:fs'),path=require('node:path');
const gv=()=>require('./game-voice.cjs');
const DIR=root=>path.join(root,'data','saved-voice');
const FILE=/^\d{1,12}\.(?:ogg|wav|mp3|m4a)$/;
const savedId=id=>id===undefined||id===null||id===''?NaN:Number(id);
const parse=o=>{try{const v=JSON.parse(o||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}};
const voiceOf=original=>{const v=(typeof original==='string'?parse(original):original||{}).voice;return v&&typeof v==='object'?v:null;};
// Re-read the row and merge voice into its original JSON (sentence-scenes.cjs writes scene into the same JSON).
function write(db,id,voice){const row=db.prepare('SELECT original FROM saved_sentences WHERE id=?').get(id);if(!row)return false;db.prepare('UPDATE saved_sentences SET original=? WHERE id=?').run(JSON.stringify({...parse(row.original),voice}),id);return true;}
function keepFile(root,id,data){const t=gv().kind(data);if(!t)return null;const file=id+t.ext;fs.mkdirSync(DIR(root),{recursive:true});fs.writeFileSync(path.join(DIR(root),file+'.tmp'),data);fs.renameSync(path.join(DIR(root),file+'.tmp'),path.join(DIR(root),file));return file;}
// The voice record the line index gives for this text, or null. A runtime clip is copied (the cache may be trimmed).
function fromIndex(root,id,text){const e=gv().entry(root,text);if(!e)return null;
 if(e.ref!=='runtime')return {kind:'scan',g:e.game,ref:e.ref,...(e.estimated?{estimated:true}:{})};
 try{const file=keepFile(root,id,fs.readFileSync(gv().runtimeFile(root,e.key,e.ext)));if(file)return {kind:'file',file,from:'runtime'};}catch{}return null;}
// The library executable of a game id, or ''.
const exeOf=(db,gameId)=>{if(!gameId)return '';try{return String(db.prepare('SELECT executable FROM games WHERE id=?').get(String(gameId))?.executable||'');}catch{return '';}};
/* At save time (reader = the attached reader when the line is from the game being read). Never throws, never blocks the
   save; resolves to the voice record written, or null. */
async function attach({root,db:open,reader},id,text){
 try{const n=Number(id);if(!Number.isSafeInteger(n)||!root)return null;
  const openDb=open||(()=>require('./store.cjs').openStore(root));
  let row,exe;{const db=openDb();try{row=db.prepare('SELECT id,game_id,text,original FROM saved_sentences WHERE id=?').get(n);exe=row?exeOf(db,row.game_id):'';}finally{db.close();}}
  if(!row)return null;const had=voiceOf(row.original);if(had&&had.kind!=='none')return had;text=String(text||row.text);
  let voice=fromIndex(root,n,text),heard=null;
  /* not in the index: cut it from the game's sound now (the line is on screen, its voice just played; the ring keeps
     two minutes, so this comes before any scan) */
  if(!voice&&reader?.gal&&typeof reader.gal.gameMedia==='function'&&(!row.game_id||String(reader.gameId||'')===String(row.game_id))){
   const m=await reader.gal.gameMedia(text,Date.now(),false).catch(()=>null);
   if(m?.matched&&m.audio?.data){const b=Buffer.from(m.audio.data,'base64');if(gv().recordedFits(root,text,b))heard=b;}}
  /* an index that is out of date for this game's engine: scan it, then look again; the script's clip wins */
  if(!voice&&exe&&await gv().ensureScanned(root,exe).catch(()=>false))voice=fromIndex(root,n,text);
  if(!voice&&heard){const file=keepFile(root,n,heard);if(file)voice={kind:'file',file,from:'capture'};}
  voice=voice||{kind:'none',at:Date.now()};
  const db=openDb();try{write(db,n,voice);}finally{db.close();}return voice;
 }catch{return null;}}
// The bytes of a voice record, or null. A recorded clip (capture/runtime) of a line the script says is quiet, or one
// whose length does not fit the text, is not played (text given).
function read(root,voice,text){if(!voice)return null;
 if(voice.kind==='scan'&&voice.g&&voice.ref){const c=gv().clip(root,String(voice.g),String(voice.ref),!!voice.estimated);return c?{...c,source:'game',origin:'scan'}:null;}
 if(voice.kind==='file'&&FILE.test(String(voice.file||''))){try{const data=fs.readFileSync(path.join(DIR(root),voice.file));const t=gv().kind(data);if(t&&text&&!gv().recordedFits(root,text,data))return null;return t?{data,mime:t.mime,source:'game',origin:voice.from||'file'}:null;}catch{return null;}}
 return null;}
/* The game voice for a sentence: a saved line (id) by its kept record, then the line index by text; a saved line whose
   game index is stale is scanned first. A found voice is written back into the saved row (older saved lines). */
async function play(root,{id,text,db:open}={}){
 const openDb=open||(()=>require('./store.cjs').openStore(root));const n=savedId(id);
 let row=null,exe='';if(Number.isSafeInteger(n)){const db=openDb();try{row=db.prepare('SELECT id,game_id,text,original FROM saved_sentences WHERE id=?').get(n)||null;exe=row?exeOf(db,row.game_id):'';}finally{db.close();}}
 text=String(text||row?.text||'').trim();
 if(row){const rec=voiceOf(row.original),kept=read(root,rec,text);if(kept)return kept;
  /* 2026-11-15 a kept recorded clip that does not fit this line: removed, the record cleared (looked up again below) */
  if(rec?.kind==='file'){release(root,row.original);const db=openDb();try{write(db,row.id,{kind:'none',at:Date.now(),dropped:rec.from||'file'});}finally{db.close();}}}
 const found=()=>{const v=gv().find(root,text);return v?{...v,source:'game',origin:v.source}:null;};
 let v=text?found():null;
 if(!v&&row&&exe&&await gv().ensureScanned(root,exe).catch(()=>false))v=found();
 if(v&&row){try{const rec=fromIndex(root,row.id,text);if(rec){const db=openDb();try{write(db,row.id,rec);}finally{db.close();}}}catch{}}
 return v;}
/* Which texts have a game voice (button labels, no audio read): saved rows by their record, any text by the index; a
   recorded clip of a quiet line does not count. */
function has(root,items,options){return states(root,items,options).map(s=>s==='ok');}
/* Per item: 'ok' (the game voice plays), null (none known) or why the known voice cannot play (game-voice clipState:
   GAME_VOICE_GONE, GAME_VOICE_STALE). 2026-11-28: a kept scan record of an uninstalled game is not a voice. */
function states(root,items,{db:open}={}){
 const list=Array.isArray(items)?items.slice(0,500):[],rows=new Map();
 const ids=[...new Set(list.map(x=>savedId(x?.id)).filter(Number.isSafeInteger))];
 if(ids.length){const db=(open||(()=>require('./store.cjs').openStore(root)))();try{
  for(const row of db.prepare('SELECT id,text,original FROM saved_sentences WHERE id IN ('+ids.map(()=>'?').join(',')+')').all(...ids))rows.set(row.id,row);
 }finally{db.close();}}
 return list.map(item=>{
  const row=rows.get(savedId(item?.id)),voice=voiceOf(row?.original),text=String(item?.text||row?.text||'').trim();
  if(voice?.kind==='scan'&&voice.g&&voice.ref){const s=gv().clipState(root,String(voice.g),String(voice.ref));if(s==='ok'||!text)return s;const t=gv().voiceState(root,text);return t==='ok'?t:s;}
  if(voice?.kind==='file'&&typeof voice.file==='string'&&FILE.test(voice.file)&&gv().recordingExists(path.join(DIR(root),voice.file))&&(!text||gv().verdict(root,text)==='unknown'))return 'ok';
  return text?gv().voiceState(root,text):null;
 });}
/* After play() gave nothing: why the game voice this line has could not play, or null when it has none. A clip the index
   says is there but whose bytes are no audio a browser plays is GAME_VOICE_UNREADABLE. */
function why(root,{id,text,db}={}){const s=states(root,[{id:id??null,text:String(text||'')}],{db})[0];return s==='ok'?'GAME_VOICE_UNREADABLE':s;}
// A removed saved line takes its kept clip with it.
function release(root,original){const v=voiceOf(original);if(v?.kind==='file'&&FILE.test(String(v.file||'')))try{fs.unlinkSync(path.join(DIR(root),v.file));}catch{}}
module.exports={attach,play,has,states,why,read,release,voiceOf};
