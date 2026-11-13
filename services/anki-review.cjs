// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const crypto=require('node:crypto');
const {cleanV4}=require('../core/v4-config.cjs');
class AnkiReviewer{
 constructor({config={},db,fetcher=fetch,speak=null,mediaDir=''}){this.config=cleanV4(config);this.db=db;this.fetch=fetcher;this.speak=speak;this.mediaDir=mediaDir;db.exec(`CREATE TABLE IF NOT EXISTS anki_actions(operation_id TEXT PRIMARY KEY,card_id INTEGER NOT NULL,ease INTEGER NOT NULL,status TEXT NOT NULL,result TEXT,created_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS anki_review_events(operation_id TEXT PRIMARY KEY,card_id INTEGER NOT NULL,ease INTEGER NOT NULL,reviewed_at INTEGER NOT NULL);CREATE UNIQUE INDEX IF NOT EXISTS anki_one_pending_rating ON anki_actions(card_id) WHERE status='pending';`);}
 async call(action,params={}){
  let response;
  try{response=await this.fetch(this.config.ankiUrl,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,version:6,params}),signal:AbortSignal.timeout(10000)});}catch(error){const code=error.cause?.code||error.name;throw Error(code==='ECONNREFUSED'?'ANKI_OFFLINE':code==='TimeoutError'?'ANKI_TIMEOUT':'ANKI_UNAVAILABLE');}
  if(!/json/i.test(response.headers?.get?.('content-type')||'json'))throw Error('ANKI_PORT_TAKEN');
  if(!response.ok)throw Error('ANKI_UNAVAILABLE');
  const message=await response.json();
  if(message.error){const e=String(message.error);if(/review is not currently active/i.test(e))throw Error('ANKI_REVIEW_INACTIVE');throw Error(/unsupported action|not supported|unknown action/i.test(e)?'ANKI_UNSUPPORTED':/key|auth|permission/i.test(e)?'ANKI_AUTH':'ANKI_FAILED');}
  if(!Object.hasOwn(message,'result'))throw Error('ANKI_INVALID_RESPONSE');return message.result;
 }
 session(){try{return JSON.parse(this.db.prepare("SELECT value FROM meta WHERE key='anki-review-state'").get()?.value||'null');}catch{return null;}}
 saveSession(value){this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('anki-review-state',JSON.stringify(value));}
 // E215.6 (user): newest decks first (Anki deck ids are creation times; subdecks stay under their parent) and the
 // mining deck (MeguLit or the user's own) selected by default.
 async status(){try{const version=await this.call('version');let decks;try{decks=orderDecks(await this.call('deckNamesAndIds'));}catch{decks=await this.call('deckNames');}
  const defaultDeck=decks.includes(this.config.ankiDeck)?this.config.ankiDeck:decks[0]||'';return {connected:true,version,decks,defaultDeck};}catch(error){return {connected:false,reason:error.message};}}
 async snapshot(expectedId=null){
  let card;try{card=await this.call('guiCurrentCard');}catch(error){if(error.message==='ANKI_REVIEW_INACTIVE')return {done:true};throw error;}if(!card)return {done:true};
  if(expectedId!=null&&Number(card.cardId)!==Number(expectedId))throw Error('ANKI_CARD_CHANGED');
  const previous=this.session(),shown=previous?.cardId===Number(card.cardId)&&previous.answerShown===true;
  this.saveSession({cardId:Number(card.cardId),answerShown:shown,buttons:Array.isArray(card.buttons)?card.buttons.filter(n=>[1,2,3,4].includes(n)):[1,2,3,4]});
  const html=(card.css?'<style>'+String(card.css)+'</style>':'')+String((shown?card.answer:card.question)||'');
  return {done:false,cardId:Number(card.cardId),deck:card.deckName||'',answerShown:shown,buttons:Array.isArray(card.buttons)?card.buttons.filter(n=>[1,2,3,4].includes(n)):[1,2,3,4],intervals:card.nextReviews||[],hasAudio:/\[sound:|\[anki:play:|<audio\b/i.test(html),manualAudio:/<audio controls preload="none" src="tomoyo_/i.test(html),html:await this.withMedia(html,card)};
 }
 async start(deck){
  const decks=await this.call('deckNames');if(!decks.includes(deck))throw Error('ANKI_DECK_MISSING');
  // A deck with nothing left today: Anki refuses or shows its congratulations screen. Report it as finished.
  const opened=await this.call('guiDeckReview',{name:deck});this.saveSession(null);
  const result=await this.snapshot().catch(error=>{if(opened)throw error;return {done:true};});
  if(result.done){let total=0;try{const stats=Object.values(await this.call('getDeckStats',{decks:[deck]}))[0];total=Number(stats?.total_in_deck)||0;}catch{}return {done:true,finished:true,deck,total,...await this.dayInfo(deck)};}
  return result;
 }
 // 2026-11-13: for the finished screen, cards reviewed today and when this deck has cards due again (first day with any, up to a month)
 async dayInfo(deck){const out={};try{out.reviewedToday=Number(await this.call('getNumCardsReviewedToday'))||0;}catch{}
  try{const q='"deck:'+String(deck).replace(/"/g,'')+'" -is:suspended prop:due=';for(const days of [1,2,3,4,5,6,7]){const ids=await this.call('findCards',{query:q+days});if(ids?.length){out.nextDue={days,count:ids.length};return out;}}
   const later=await this.call('findCards',{query:'"deck:'+String(deck).replace(/"/g,'')+'" -is:suspended prop:due>7 prop:due<=30'});out.nextDue=later?.length?{days:8,count:later.length}:null;}catch{}return out;}
 async showAnswer(id){
  const current=await this.call('guiCurrentCard');if(!current||Number(current.cardId)!==Number(id))throw Error('ANKI_CARD_CHANGED');
  if(!await this.call('guiShowAnswer'))throw Error('ANKI_FAILED');
  this.saveSession({cardId:Number(id),answerShown:true,buttons:current.buttons||[1,2,3,4]});return this.snapshot(id);
 }
 async grade({cardId,ease,operationId}){
  if(!Number.isSafeInteger(cardId)||![1,2,3,4].includes(ease)||typeof operationId!=='string'||operationId.length<8||operationId.length>100)throw Error('ANKI_INVALID_RATING');
  const previous=this.db.prepare('SELECT * FROM anki_actions WHERE operation_id=?').get(operationId);
  if(previous){if(previous.card_id!==cardId||previous.ease!==ease)throw Error('ANKI_INVALID_RATING');if(previous.status==='done')return JSON.parse(previous.result);throw Error('ANKI_ACTION_PENDING');}
  const state=this.session();if(state?.cardId!==cardId||!state.answerShown)throw Error('ANKI_ANSWER_REQUIRED');
  if(!state.buttons.includes(ease))throw Error('ANKI_INVALID_RATING');
  const card=await this.call('guiCurrentCard');if(!card||Number(card.cardId)!==cardId)throw Error('ANKI_CARD_CHANGED');
  try{this.db.prepare('INSERT INTO anki_actions VALUES (?,?,?,?,?,?)').run(operationId,cardId,ease,'pending',null,Math.floor(Date.now()/1000));}catch(error){if(this.db.prepare("SELECT 1 FROM anki_actions WHERE card_id=? AND status='pending'").get(cardId))throw Error('ANKI_ACTION_PENDING');throw error;}
  // Once a rating may have reached Anki, never retry it automatically after a
  // network failure. Reloading the current card is the recovery operation.
  try{
   if(!await this.call('guiAnswerCard',{ease}))throw Error('ANKI_FAILED');
   this.db.prepare('INSERT INTO anki_review_events VALUES (?,?,?,?)').run(operationId,cardId,ease,Math.floor(Date.now()/1000));
   this.saveSession(null);
   const result=await this.snapshot();if(result.done){result.finished=true;result.deck=card.deckName||'';}
   this.db.prepare("UPDATE anki_actions SET status='done',result=? WHERE operation_id=?").run(JSON.stringify(result),operationId);return result;
  }catch(error){throw Error(error.message==='ANKI_CARD_CHANGED'?error.message:'ANKI_RATING_UNCERTAIN');}
 }
 /* (user 2026-11-14 "读取游戏cv配音又失败") the card's own clips play in MeguLit first: practice cards are not Anki's review,
    so guiCurrentCard/guiPlayAudio fail there ("Gui review is not currently active"). Anki's player is only the fallback. */
 async playAudio(id){if(!Number.isSafeInteger(id))throw Error('ANKI_INVALID_CARD');
  const clips=await this.cardClips(id).catch(()=>[]);if(clips.length)return {played:false,clips};
  let card;try{card=await this.call('guiCurrentCard');}catch(error){throw Error(error.message==='ANKI_REVIEW_INACTIVE'?'ANKI_MEDIA_MISSING':error.message);}
  if(!card||Number(card.cardId)!==id)throw Error('ANKI_CARD_CHANGED');if(await this.call('guiPlayAudio')===false)throw Error('ANKI_FAILED');return {played:true};}
 /* the clips of one card in template order (answer side, which holds the question's too), as data: URLs */
 async cardClips(id){const [card]=await this.call('cardsInfo',{cards:[id]});if(!card)return [];const audio=require('./anki-media.cjs'),html=String(card.answer||'');
  let names=[];if(/\[anki:play:a:\d+\]/.test(html)){try{const play=audio.playMap(card,await this.call('modelTemplates',{modelName:card.modelName}),html);names=[...html.matchAll(/\[anki:play:a:(\d+)\]/g)].map(m=>play.get('a:'+m[1]));}catch{}}
  if(!names.length||names.some(n=>!n))names=[...audio.sounds(html),...Object.values(card.fields||{}).sort((a,b)=>(a?.order??0)-(b?.order??0)).flatMap(f=>audio.sounds(f?.value))];
  const out=[];for(const name of [...new Set(names)].filter(n=>n&&!/[\\/]/.test(n)).slice(0,6)){const data=await this.mediaFile(name);if(data)out.push({name,src:'data:'+(/\.mp3$/i.test(name)?'audio/mpeg':/\.ogg$/i.test(name)?'audio/ogg':'audio/wav')+';base64,'+data});}return out;}
 /* one media file: MeguLit's own copy first, then Anki's media folder (copied here for next time) */
 async mediaFile(name){const cache=require('../core/anki-media-cache.cjs');const local=cache.read(this.mediaDir,name);if(local)return local;
  const data=await this.call('retrieveMediaFile',{filename:name});if(typeof data!=='string'||!data||data.length>12*1024*1024)return null;cache.write(this.mediaDir,name,data);return data;}
 async withMedia(html,card){
  const audio=require('./anki-media.cjs');let play=new Map();if(card&&/\[anki:play:[qa]:\d+\]/.test(html)){try{play=audio.playMap(card,await this.call('modelTemplates',{modelName:card.modelName}),html);}catch{}}
  const names=new Set([...play.values()].filter(name=>name&&!/[\\/]/.test(name)));for(const match of html.matchAll(/\[sound:([^\]\r\n]+)\]|(?:src|href)\s*=\s*["']([^"']+)["']/gi)){const name=match[1]||match[2];if(name&&!/^(?:https?:|data:|javascript:|#)/i.test(name)&&!/[\\/]/.test(name))names.add(name);}
  const media=new Map();
  for(const name of [...names].slice(0,12)){try{const data=await this.mediaFile(name);if(!data)continue;const ext=name.split('.').pop().toLowerCase(),mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',mp4:'video/mp4',woff:'font/woff',woff2:'font/woff2'}[ext];if(mime)media.set(name,'data:'+mime+';base64,'+data);}catch{}}
  /* (user 2026-11-12) a game-voice clip that is silent (music recorded under an unvoiced line, then separated) is
     replaced, once, by the synthesized sentence under the same media name, so the card plays the line again */
  if(this.speak)for(const [name,src] of media){if(!/^tomoyo_g_[a-f0-9]+\.wav$/.test(name))continue;try{
   const buf=Buffer.from(src.slice(src.indexOf(',')+1),'base64');if(!require('../core/voice-trim.cjs').quiet(buf))continue;
   const at=html.indexOf(name),before=at<0?'':html.slice(Math.max(0,at-4000),at),m=[...before.matchAll(/<span class="tm-jp">([\s\S]*?)<\/span><span class="tm-play">/g)].pop();
   const text=m?m[1].replace(/<rt>[\s\S]*?<\/rt>|<rp>[\s\S]*?<\/rp>/g,'').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim():'';if(!text||text.length>400)continue;
   const voice=await this.speak(text);if(!voice?.data)continue;await this.call('storeMediaFile',{filename:name,data:voice.data});require('../core/anki-media-cache.cjs').write(this.mediaDir,name,voice.data);media.set(name,'data:audio/wav;base64,'+voice.data);}catch{}}
  return html.replace(/<audio controls preload="none" src="(tomoyo_[a-f0-9_gs]+\.wav)"><\/audio>/gi,(all,name)=>media.has(name)?audio.player(media.get(name),name):all)
   .replace(/\[anki:play:([qa]):(\d+)\]/g,(_,side,index)=>{const name=play.get(side+':'+index),src=media.get(name);return src?audio.player(src,name):audio.replay();}).replace(/\[sound:([^\]\r\n]+)\]/g,(_,name)=>media.has(name)?audio.player(media.get(name),name):'').replace(/\b(src|href)\s*=\s*(["'])([^"']+)\2/gi,(all,key,quote,name)=>media.has(name)?key+'='+quote+media.get(name)+quote:all);
 }
}
function orderDecks(map){const entries=Object.entries(map||{}).map(([name,id])=>({name,id:Number(id)||0})),groups=new Map();
 for(const e of entries){const top=e.name.split('::')[0];const g=groups.get(top)||{newest:0,items:[]};g.newest=Math.max(g.newest,e.id);g.items.push(e);groups.set(top,g);}
 return [...groups.values()].sort((a,b)=>b.newest-a.newest).flatMap(g=>g.items.sort((a,b)=>a.name.localeCompare(b.name)).map(e=>e.name));}
// E215.7 (user): stop a review half way, keep practising a finished deck, and change a deck's daily limits here.
AnkiReviewer.prototype.stop=async function(){this.saveSession(null);this.endPractice();try{await this.call('guiDeckBrowser');}catch{}return {stopped:true};};
// Practice shows the deck's cards again without answering them in Anki, so Anki's schedule is untouched.
AnkiReviewer.prototype.practice=async function(deck,advance=false,resume=false){
 let state;try{state=JSON.parse(this.db.prepare("SELECT value FROM meta WHERE key='anki-practice'").get()?.value||'null');}catch{state=null;}
 // Coming back to Learning continues an unfinished practice round (E215.8, user).
 if(resume){if(!state?.active||state.index>=state.ids.length)return {done:true};deck=state.deck;}
 else if(!advance||!state||state.deck!==deck){const quote=v=>'"'+String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';const ids=(await this.call('findCards',{query:'deck:'+quote(deck)})).slice(0,500);for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}state={deck,ids,index:0,active:true};}
 else state.index++;
 if(state.index>=state.ids.length)state.active=false;
 this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('anki-practice',JSON.stringify(state));
 if(state.index>=state.ids.length)return {done:true,practiceDone:true,deck,total:state.ids.length};
 const [card]=await this.call('cardsInfo',{cards:[state.ids[state.index]]});if(!card)return {done:true,practiceDone:true,deck,total:state.ids.length};
 const style=card.css?'<style>'+String(card.css)+'</style>':'';
 return {done:false,practice:true,deck,cardId:Number(card.cardId),position:state.index+1,total:state.ids.length,question:await this.withMedia(style+String(card.question||''),card),answer:await this.withMedia(style+String(card.answer||''),card)};
};
AnkiReviewer.prototype.endPractice=function(){this.db.prepare("DELETE FROM meta WHERE key='anki-practice'").run();return {stopped:true};};
AnkiReviewer.prototype.deckConfig=async function(deck){const c=await this.call('getDeckConfig',{deck});if(!c||typeof c!=='object')throw Error('ANKI_FAILED');
 return {deck,preset:c.name||'',presetId:c.id,newPerDay:Number(c.new?.perDay)||0,revPerDay:Number(c.rev?.perDay)||0};};
AnkiReviewer.prototype.saveDeckLimits=async function(deck,{newPerDay,revPerDay}){
 const n=Number(newPerDay),r=Number(revPerDay);if(!Number.isInteger(n)||n<0||n>9999||!Number.isInteger(r)||r<0||r>99999)throw Error('ANKI_INVALID_LIMIT');
 const c=await this.call('getDeckConfig',{deck});c.new={...c.new,perDay:n};c.rev={...c.rev,perDay:r};if(!await this.call('saveDeckConfig',{config:c}))throw Error('ANKI_FAILED');return this.deckConfig(deck);};
module.exports={AnkiReviewer,orderDecks};
