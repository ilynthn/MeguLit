// SPDX-License-Identifier: GPL-3.0-or-later
// E215.7: a finished deck is reported (AnkiConnect throws "review is not currently active"), studying can be stopped,
// practice never answers cards in Anki, and daily limits are saved through the deck's options preset.
const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {AnkiReviewer}=require('../services/anki-review.cjs');
function fixture(t,handler){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');t.after(()=>db.close());const calls=[];
 const fetcher=async(_u,o)=>{const {action,params}=JSON.parse(o.body);calls.push({action,params});const r=handler(action,params);return {ok:true,json:async()=>r instanceof Error?{result:null,error:r.message}:{result:r,error:null}};};
 return {reviewer:new AnkiReviewer({db,fetcher}),calls};}
test('a finished deck reports finished instead of failing',async t=>{
 const {reviewer}=fixture(t,a=>a==='deckNames'?['MeguLit']:a==='guiDeckReview'?true:a==='guiCurrentCard'?Error('Gui review is not currently active.'):a==='getDeckStats'?{1:{total_in_deck:4}}:null);
 assert.deepEqual(await reviewer.start('MeguLit'),{done:true,finished:true,deck:'MeguLit',total:4,reviewedToday:0,nextDue:null});
 assert.deepEqual(await reviewer.snapshot(),{done:true});
});
test('a finished deck says how many were reviewed today and when cards are due again',async t=>{
 const {reviewer}=fixture(t,(a,p)=>a==='deckNames'?['MeguLit']:a==='guiDeckReview'?true:a==='guiCurrentCard'?Error('Gui review is not currently active.'):a==='getDeckStats'?{1:{total_in_deck:9}}:a==='getNumCardsReviewedToday'?12:a==='findCards'?(/prop:due=3$/.test(p.query)?[1,2]:[]):null);
 assert.deepEqual(await reviewer.start('MeguLit'),{done:true,finished:true,deck:'MeguLit',total:9,reviewedToday:12,nextDue:{days:3,count:2}});
});
test('stop returns Anki to the deck list',async t=>{const {reviewer,calls}=fixture(t,()=>true);assert.deepEqual(await reviewer.stop(),{stopped:true});assert.deepEqual(calls.map(c=>c.action),['guiDeckBrowser']);});
test('practice walks the deck without answering cards',async t=>{
 const {reviewer,calls}=fixture(t,(a,p)=>a==='findCards'?[11,12]:a==='cardsInfo'?[{cardId:p.cards[0],question:'q'+p.cards[0],answer:'a'+p.cards[0]}]:null);
 const first=await reviewer.practice('MeguLit');assert.equal(first.practice,true);assert.equal(first.position,1);
 const second=await reviewer.practice('MeguLit',true);assert.equal(second.position,2);assert.notEqual(second.cardId,first.cardId);
 assert.deepEqual(await reviewer.practice('MeguLit',true),{done:true,practiceDone:true,deck:'MeguLit',total:2});
 assert.ok(!calls.some(c=>/answer|guiAnswerCard/i.test(c.action)));
});
test('daily limits are saved through the deck preset',async t=>{
 let saved=null;const {reviewer}=fixture(t,(a,p)=>a==='getDeckConfig'?(saved||{id:1,name:'默认',new:{perDay:10,bury:false},rev:{perDay:200}}):a==='saveDeckConfig'?(saved=p.config,true):null);
 const r=await reviewer.saveDeckLimits('MeguLit',{newPerDay:30,revPerDay:500});assert.equal(r.newPerDay,30);assert.equal(r.revPerDay,500);assert.equal(saved.new.bury,false);
 await assert.rejects(reviewer.saveDeckLimits('MeguLit',{newPerDay:-1,revPerDay:5}),/ANKI_INVALID_LIMIT/);
});
test('an unfinished practice round resumes on the same card and ends cleanly',async t=>{
 const {reviewer}=fixture(t,(a,p)=>a==='findCards'?[21,22,23]:a==='cardsInfo'?[{cardId:p.cards[0],question:'q',answer:'a'}]:null);
 assert.deepEqual(await reviewer.practice('',false,true),{done:true});
 const first=await reviewer.practice('MeguLit');const again=await reviewer.practice('',false,true);assert.equal(again.cardId,first.cardId);assert.equal(again.position,1);
 await reviewer.practice('MeguLit',true);assert.equal((await reviewer.practice('',false,true)).position,2);
 reviewer.endPractice();assert.deepEqual(await reviewer.practice('',false,true),{done:true});
});
