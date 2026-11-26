// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {AnkiReviewer}=require('../services/anki-review.cjs');

function fixture(t,handler){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');
 t.after(()=>db.close());
 const fetcher=async(_u,o)=>{
  const {action,params}=JSON.parse(o.body);
  const r=handler(action,params);
  return {ok:true,json:async()=>r instanceof Error?{result:null,error:r.message}:{result:r,error:null}};
 };
 return {reviewer:new AnkiReviewer({db,fetcher}),db};
}

test('practice advance failure does not persist the incremented index and skip a card on retry',async t=>{
 let failSecond=true;
 const {reviewer}=fixture(t,(a,p)=>{
  if(a==='findCards')return [11,12,13];
  if(a==='cardsInfo'){
   if(failSecond){failSecond=false;throw Object.assign(Error('timeout'),{name:'TimeoutError'});}
   return [{cardId:p.cards[0],question:'q'+p.cards[0],answer:'a'+p.cards[0]}];
  }
  return null;
 });
 // Let first card succeed, then fail the first advance to card 2.
 failSecond=false;
 const first=await reviewer.practice('MeguLit');
 assert.equal(first.position,1);

 failSecond=true;
 await assert.rejects(reviewer.practice('MeguLit',true),/ANKI_TIMEOUT/);

 // Retrying advance must land on position 2 (not skip to position 3).
 const second=await reviewer.practice('MeguLit',true);
 assert.equal(second.done,false);
 assert.equal(second.position,2);
 assert.notEqual(second.cardId,first.cardId);

 const third=await reviewer.practice('MeguLit',true);
 assert.equal(third.done,false);
 assert.equal(third.position,3);
 assert.notEqual(third.cardId,first.cardId);
 assert.notEqual(third.cardId,second.cardId);
});

test('practice skips deleted cards instead of ending early and clears active state when none remain',async t=>{
 let deleted=new Set();
 const {reviewer,db}=fixture(t,(a,p)=>{
  if(a==='findCards')return [21,22,23];
  if(a==='cardsInfo')return deleted.has(p.cards[0])?[]:[{cardId:p.cards[0],question:'q'+p.cards[0],answer:'a'+p.cards[0]}];
  return null;
 });
 const first=await reviewer.practice('MeguLit');
 assert.equal(first.position,1);
 const saved=JSON.parse(db.prepare("SELECT value FROM meta WHERE key='anki-practice'").get().value);
 // Delete card #2 in Anki mid-practice: advancing should skip #2 and show #3.
 deleted.add(saved.ids[1]);
 const next=await reviewer.practice('MeguLit',true);
 assert.equal(next.done,false,'must not abort the round while card #3 still exists');
 assert.equal(next.cardId,saved.ids[2]);
 assert.equal(next.position,3);

 // Start a new round where every remaining card after #1 is deleted: round finishes and clears active flag.
 deleted=new Set();
 const start2=await reviewer.practice('MeguLit');
 const saved2=JSON.parse(db.prepare("SELECT value FROM meta WHERE key='anki-practice'").get().value);
 deleted.add(saved2.ids[1]);
 deleted.add(saved2.ids[2]);
 const done=await reviewer.practice('MeguLit',true);
 assert.deepEqual(done,{done:true,practiceDone:true,deck:'MeguLit',total:3});
 // Resuming after all remaining cards were deleted must return {done:true} without calling cardsInfo again.
 assert.deepEqual(await reviewer.practice('',false,true),{done:true});
 assert.equal(start2.position,1);
});
