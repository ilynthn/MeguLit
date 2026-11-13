// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 (user: each collected sentence keeps the game's own picture of that moment, and only ever a picture with NO
   dialogue box: "never store a frame with the dialogue box; if there is no clean frame, store nothing").
   1. While a game is read, every time the game's dialogue box leaves the screen (the same trigger as scene-shots.cjs,
      its own 1.5 s throttle, 700 ms settle, box re-checked before and after) MeguLit takes one clean capture of the game
      window alone (GalWindowBridge sceneFrame: never MeguLit's own layer) and keeps only the newest one in memory on the
      reader: {jpeg, topHash, at, gameId}. topHash is a difference hash of the top 62% of the frame, where dialogue boxes
      never are. Nothing is written to disk at this point.
   2. When a sentence is saved (收藏这一句 in the lookup card, or automatically with an Anki card) the frame on screen now
      is probed for the same top hash (sceneProbe, no picture). Only when it is within MATCH bits of the remembered clean
      frame of this same game, the clean frame is written once to data/sentence-scenes/<gameKey>/<topHash>-<at>.jpg and the
      sentence's original JSON gets scene:{file,hash,at}. Later sentences on the same remembered frame reuse that file.
      No match, no clean frame, an error: nothing is stored. The save itself never waits for this and never fails by it.
   3. Deleting a sentence deletes its picture once no other sentence of the game uses it; removing a game deletes its folder.
   Off switch: Settings › Library (library.json sceneShots:false), the same switch as the card-wall scene captures. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {hamming}=require('./scene-shots.cjs');
const MATCH=12,GAP=1500,SETTLE=700;
const HASH=/^[0-9a-f]{16}$/,FILE=/^[0-9a-f]{16}-[0-9]{1,16}\.jpg$/;
const keyOf=gameId=>crypto.createHash('sha1').update(String(gameId)).digest('hex').slice(0,16);
const dirOf=(root,gameId)=>path.join(root,'data','sentence-scenes',keyOf(gameId));
const validFile=file=>typeof file==='string'&&FILE.test(file);
function enabled(root){try{return JSON.parse(fs.readFileSync(path.join(root,'data','config','library.json'),'utf8'))?.sceneShots!==false;}catch{return true;}}
function parse(original){try{const v=JSON.parse(original||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
/* the scene of a sentence from its original JSON, or null */
function sceneOf(original){const s=(typeof original==='string'?parse(original):original||{}).scene;
 return s&&validFile(s.file)&&HASH.test(String(s.hash||''))&&Number.isFinite(Number(s.at))?{file:s.file,hash:s.hash,at:Number(s.at)}:null;}

/* Called by the reader for every new line (hidden=false: the box is there) and every box visibility change. */
async function remember(reader,{hidden=false}={},settle=SETTLE){
 if(!reader)return;
 if(!hidden){reader.sentenceSceneHidden=false;reader.sentenceSceneEpoch=(reader.sentenceSceneEpoch||0)+1;return;}
 reader.sentenceSceneHidden=true;
 try{
  const gal=reader.gal,gameId=reader.gameId;if(!gameId||typeof gal?.sceneFrame!=='function')return;
  if(!enabled(reader.root)){reader.sentenceScene=null;return;}
  const now=Date.now(),state=reader.sentenceSceneState||(reader.sentenceSceneState={at:0,busy:false});
  if(state.busy||now-state.at<GAP)return;state.busy=true;state.at=now;
  try{
   const epoch=reader.sentenceSceneEpoch||0,still=()=>reader.sentenceSceneHidden===true&&(reader.sentenceSceneEpoch||0)===epoch&&reader.gameId===gameId;
   await new Promise(r=>setTimeout(r,settle));if(!still())return;
   const frame=await gal.sceneFrame();
   /* the box came back (even briefly) while the capture ran: the frame may show it, so it is dropped */
   if(!still()||!frame?.jpeg||!HASH.test(String(frame.topHash||''))||!(Number(frame.score)>0))return;
   reader.sentenceScene={jpeg:String(frame.jpeg),topHash:frame.topHash,at:Date.now(),gameId};
  }finally{state.busy=false;}
 }catch{}
}

/* After a sentence row was saved: probe, compare, write once, record. Never throws; resolves to the scene or null. */
async function attach(reader,id,{open}={}){
 try{
  const n=Number(id),latest=reader?.sentenceScene,gameId=reader?.gameId,gal=reader?.gal;
  if(!Number.isSafeInteger(n)||!latest||!gameId||latest.gameId!==gameId||typeof gal?.sceneProbe!=='function')return null;
  if(!HASH.test(String(latest.topHash||''))||!latest.jpeg||!enabled(reader.root))return null;
  const probe=await gal.sceneProbe();
  if(!probe||!HASH.test(String(probe.topHash||''))||hamming(probe.topHash,latest.topHash)>MATCH)return null;
  const db=(open||require('./store.cjs').openStore)(reader.root);
  try{
   const row=db.prepare('SELECT id,game_id,original FROM saved_sentences WHERE id=?').get(n);
   if(!row||String(row.game_id)!==String(gameId))return null;
   const original=parse(row.original),had=sceneOf(original);if(had)return had;
   const file=latest.topHash+'-'+Math.floor(Number(latest.at))+'.jpg';if(!validFile(file))return null;
   const dir=dirOf(reader.root,gameId),full=path.join(dir,file);
   if(!fs.existsSync(full)){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(full+'.tmp',Buffer.from(latest.jpeg,'base64'));fs.renameSync(full+'.tmp',full);}
   const scene={file,hash:latest.topHash,at:Math.floor(Number(latest.at))};
   db.prepare('UPDATE saved_sentences SET original=? WHERE id=?').run(JSON.stringify({...original,scene}),n);
   return scene;
  }finally{db.close();}
 }catch{return null;}
}

/* bridge sentence_scene: the picture of one sentence, by game and strict file name */
function read(root,gameId,file){
 if(!gameId||!validFile(file))throw Error('SCENE_NOT_FOUND');
 const f=path.join(dirOf(root,String(gameId)),file);
 if(!fs.existsSync(f))throw Error('SCENE_NOT_FOUND');
 return {mime:'image/jpeg',data:fs.readFileSync(f).toString('base64')};
}
/* a sentence with this scene was deleted: remove the file once no sentence of the game refers to it */
function release(db,root,gameId,scene){
 try{
  const file=scene?.file;if(!root||!gameId||!validFile(file))return false;
  if(db.prepare("SELECT 1 FROM saved_sentences WHERE game_id=? AND instr(original,?)>0 LIMIT 1").get(String(gameId),'"'+file+'"'))return false;
  fs.rmSync(path.join(dirOf(root,String(gameId)),file),{force:true});return true;
 }catch{return false;}
}
function removeGame(root,gameId){try{if(root&&gameId)fs.rmSync(dirOf(root,String(gameId)),{recursive:true,force:true});}catch{}}
module.exports={remember,attach,read,release,removeGame,sceneOf,keyOf,dirOf,MATCH,GAP};
