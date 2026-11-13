'use strict';
/* 2026-11-14 regression (user: "读取游戏cv配音又失败"): in practice (练习) the word and example ▶ showed
   「Anki 暂时无法完成此操作」. practice() never handed the card to withMedia, so the 2026-11-12 ord fix in playMap never ran,
   the [anki:play] markers became Anki-replay buttons, and guiCurrentCard failed with "Gui review is not currently active". */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const {AnkiReviewer}=require('../services/anki-review.cjs'),{Anki}=require('../core/anki.cjs'),cache=require('../core/anki-media-cache.cjs');
const WORD='tomoyo_40c718b2_6aca0b94c05e.wav',GAME='tomoyo_g_aef3de9396d93eaa.wav';
/* a fake AnkiConnect whose GUI is not reviewing (practice), as the user's Anki answered */
function fakeAnki(t,{media=true}={}){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');t.after(()=>db.close());
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anki-cv-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const card={cardId:1793896690584,modelName:'MeguLit',ord:0,deckName:'MeguLit',css:'',question:'問題',answer:'問題 [anki:play:a:0] そういう問題じゃなくてね [anki:play:a:1]',
  fields:{Word:{value:'問題',order:0},Audio:{value:'[sound:'+WORD+']',order:1},SentenceAudio:{value:'[sound:'+GAME+']',order:2}}};
 const calls=[];const fetcher=async(url,options)=>{const r=JSON.parse(options.body);calls.push(r.action);let result=null,error=null;
  if(r.action==='findCards')result=[card.cardId];else if(r.action==='cardsInfo')result=[card];
  else if(r.action==='modelTemplates')result={'日本語':{Front:'{{Word}}',Back:'{{FrontSide}}<hr>{{Audio}} {{Sentence}}{{SentenceAudio}}'}};
  else if(r.action==='retrieveMediaFile')result=media?Buffer.from('RIFF '+r.params.filename).toString('base64'):false;
  else if(r.action==='guiCurrentCard'||r.action==='guiPlayAudio')error='Gui review is not currently active.';
  else error='unexpected '+r.action;
  return {ok:true,headers:{get:()=>'application/json'},json:async()=>({result,error})};};
 return {reviewer:new AnkiReviewer({db,fetcher,mediaDir:dir}),calls,dir,card};
}
test('practice cards play their own clips in MeguLit: no Anki-replay button, no guiCurrentCard',async t=>{
 const {reviewer,calls}=fakeAnki(t),r=await reviewer.practice('MeguLit');
 assert.equal((r.answer.match(/data-anki-play /g)||[]).length,2);assert.doesNotMatch(r.answer,/data-anki-replay|\[anki:play:/);
 assert.match(r.answer,/data-anki-channel="game"/);assert.ok(!calls.includes('guiCurrentCard')&&!calls.includes('guiPlayAudio'));
});
test('the replay action returns the card clips outside an Anki review instead of failing',async t=>{
 const {reviewer,calls,card}=fakeAnki(t),r=await reviewer.playAudio(card.cardId);
 assert.deepEqual(r.clips.map(c=>c.name),[WORD,GAME]);assert.match(r.clips[1].src,/^data:audio\/wav;base64,/);
 assert.ok(!calls.includes('guiPlayAudio'));
});
test('local-first: a clip in MeguLit\'s own copy plays without asking Anki for the file',async t=>{
 const {reviewer,calls,dir,card}=fakeAnki(t,{media:false});
 assert.ok(cache.write(dir,WORD,Buffer.from('word').toString('base64')));assert.ok(cache.write(dir,GAME,Buffer.from('cv').toString('base64')));
 const r=await reviewer.playAudio(card.cardId);assert.deepEqual(r.clips.map(c=>Buffer.from(c.src.split(',')[1],'base64').toString()),['word','cv']);
 assert.ok(!calls.includes('retrieveMediaFile'),'never asked Anki for the media');
});
test('clips fetched from Anki are kept locally for next time',async t=>{
 const {reviewer,dir,card}=fakeAnki(t);await reviewer.playAudio(card.cardId);
 assert.ok(fs.existsSync(path.join(dir,GAME)));assert.ok(fs.existsSync(path.join(dir,WORD)));
});
test('no clip anywhere and no Anki review: a specific reason, not the catch-all',async t=>{
 const {reviewer,card}=fakeAnki(t,{media:false});await assert.rejects(reviewer.playAudio(card.cardId),/^Error: ANKI_MEDIA_MISSING$/);
});
test('clips MeguLit stores on a card are mirrored into its own copy',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anki-cv-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const anki=new Anki(async()=>({ok:true,json:async()=>({result:GAME,error:null})}),{mediaDir:dir});
 await anki.call({ankiUrl:'http://127.0.0.1:8765'},'storeMediaFile',{filename:GAME,data:Buffer.from('cv').toString('base64')});
 assert.equal(fs.readFileSync(path.join(dir,GAME),'utf8'),'cv');
 assert.equal(cache.write(dir,'../evil.wav','AA=='),false);assert.equal(cache.write(dir,'other.png','AA=='),false);
});
test('review page names the real Anki failure in zh/ja/en and plays returned clips',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','anki-review.js'),'utf8');
 for(const code of ['ANKI_REVIEW_INACTIVE','ANKI_MEDIA_MISSING','ANKI_TIMEOUT','ANKI_UNAVAILABLE','ANKI_FAILED'])assert.equal((src.match(new RegExp(code+':','g'))||[]).length>=3,true,code);
 assert.match(src,/playClips\(r\.clips\)/);assert.match(src,/text\.ankiFailed\+'（'/);
});
