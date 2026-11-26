// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {AnkiReviewer}=require('../services/anki-review.cjs');
function fixture(t){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');t.after(()=>db.close());const calls=[],state={card:101,fail:false};const fetcher=async(url,options)=>{const {action,params}=JSON.parse(options.body);calls.push({action,params});let result;
 if(action==='version')result=6;else if(action==='deckNames')result=['Real deck'];else if(action==='deckNamesAndIds')result={'Real deck':1};else if(action==='guiDeckReview'||action==='guiShowAnswer')result=true;else if(action==='guiCurrentCard')result=state.card?{cardId:state.card,deckName:'Real deck',question:'front',answer:'back',buttons:[1,2,3,4],nextReviews:['1m','6m','1d','4d']}:null;else if(action==='guiAnswerCard'){if(state.fail)throw Error('connection lost');state.card++;result=true;}else if(action==='retrieveMediaFile')result=Buffer.from('media bytes').toString('base64');else throw Error('unexpected '+action);return {ok:true,json:async()=>({result,error:null})};};return {reviewer:new AnkiReviewer({db,fetcher}),db,calls,state};}
test('connection check only reads Anki version and real deck list',async t=>{const {reviewer,calls}=fixture(t);const status=await reviewer.status();assert.deepEqual(status.decks,['Real deck']);assert.equal(status.connected,true);assert.deepEqual(calls.map(c=>c.action),['version','deckNamesAndIds']);});
test('newest decks come first with subdecks under their parent, and a finished deck is reported as finished',async t=>{const {orderDecks}=require('../services/anki-review.cjs');assert.deepEqual(orderDecks({'Old':1,'Old::Sub':2,'MeguLit':5,'New':9}),['New','MeguLit','Old','Old::Sub']);const {reviewer,state}=fixture(t);state.card=null;assert.deepEqual(await reviewer.start('Real deck'),{done:true,finished:true,deck:'Real deck',total:0});});
test('real review shows the answer before sending a rating and deduplicates a repeated operation',async t=>{const {reviewer,calls,db}=fixture(t);assert.equal((await reviewer.start('Real deck')).html,'front');await assert.rejects(reviewer.grade({cardId:101,ease:3,operationId:'operation-101'}),/ANKI_ANSWER_REQUIRED/);assert.equal((await reviewer.showAnswer(101)).html,'back');const next=await reviewer.grade({cardId:101,ease:3,operationId:'operation-101'});assert.equal(next.cardId,102);assert.deepEqual(await reviewer.grade({cardId:101,ease:3,operationId:'operation-101'}),next);assert.equal(calls.filter(c=>c.action==='guiAnswerCard').length,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM anki_review_events').get().n,1);});
test('a stale card cannot be shown or graded after Anki advances elsewhere',async t=>{const {reviewer,state,calls}=fixture(t);await reviewer.start('Real deck');await reviewer.showAnswer(101);state.card=202;await assert.rejects(reviewer.grade({cardId:101,ease:3,operationId:'stale-101'}),/ANKI_CARD_CHANGED/);await assert.rejects(reviewer.showAnswer(101),/ANKI_CARD_CHANGED/);assert.equal(calls.filter(c=>c.action==='guiAnswerCard').length,0);});
test('a lost rating response cannot trigger an automatic retry, even with a new operation ID',async t=>{const {reviewer,state,calls}=fixture(t);await reviewer.start('Real deck');await reviewer.showAnswer(101);state.fail=true;await assert.rejects(reviewer.grade({cardId:101,ease:3,operationId:'uncertain-101'}),/ANKI_RATING_UNCERTAIN/);await assert.rejects(reviewer.grade({cardId:101,ease:3,operationId:'uncertain-101'}),/ANKI_ACTION_PENDING/);await assert.rejects(reviewer.grade({cardId:101,ease:3,operationId:'uncertain-102'}),/ANKI_ACTION_PENDING/);assert.equal(calls.filter(c=>c.action==='guiAnswerCard').length,1);});
test('media is retrieved through AnkiConnect without navigating its Qt window',async t=>{const {reviewer,calls}=fixture(t);const html=await reviewer.withMedia('<img src="picture.png">[sound:voice.mp3]');assert.match(html,/data:image\/png;base64,/);assert.match(html,/audio controls/);assert.deepEqual(calls.map(c=>c.action),['retrieveMediaFile','retrieveMediaFile']);});


test('explicit reload recovers a failed rating while the old operation stays blocked',async t=>{
 const {reviewer,state,calls}=fixture(t);
 await reviewer.start('Real deck');await reviewer.showAnswer(101);state.fail=true;
 await assert.rejects(reviewer.grade({cardId:101,ease:3,operationId:'failed-101'}),/ANKI_RATING_UNCERTAIN/);
 state.fail=false;
 await reviewer.snapshot(null,{recover:true});
 await assert.rejects(reviewer.grade({cardId:101,ease:3,operationId:'failed-101'}),/ANKI_ACTION_PENDING/);
 await assert.rejects(reviewer.grade({cardId:101,ease:3,operationId:'recovered-101'}),/ANKI_ANSWER_REQUIRED/);
 await reviewer.showAnswer(101);
 assert.equal((await reviewer.grade({cardId:101,ease:3,operationId:'recovered-101'})).cardId,102);
 assert.equal(calls.filter(c=>c.action==='guiAnswerCard').length,2);
});

test('a successful answer followed by a lost snapshot can be reviewed when scheduled again',async t=>{
 const {reviewer,state,db}=fixture(t),call=reviewer.call.bind(reviewer);
 let fail=false;
 reviewer.call=async(action,params)=>{
  if(action==='guiCurrentCard'&&fail){fail=false;throw Error('ANKI_UNAVAILABLE');}
  const result=await call(action,params);if(action==='guiAnswerCard')fail=true;return result;
 };
 await reviewer.start('Real deck');await reviewer.showAnswer(101);
 await assert.rejects(reviewer.grade({cardId:101,ease:1,operationId:'answered-101'}),/ANKI_RATING_UNCERTAIN/);
 state.card=101;reviewer.call=call;
 const restarted=new AnkiReviewer({db});restarted.call=call;
 await restarted.snapshot(null,{recover:true});await restarted.showAnswer(101);
 assert.equal((await restarted.grade({cardId:101,ease:3,operationId:'scheduled-101'})).cardId,102);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM anki_review_events').get().n,2);
});

test('reload does not release a rating still waiting for Anki',async t=>{
 const {reviewer,db}=fixture(t),call=reviewer.call.bind(reviewer);
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 reviewer.call=async(action,params)=>{if(action==='guiAnswerCard'){entered();await gate;}return call(action,params);};
 await reviewer.start('Real deck');await reviewer.showAnswer(101);
 const pending=reviewer.grade({cardId:101,ease:3,operationId:'inflight-101'});
 await started;
 try{
  const other=new AnkiReviewer({db});other.call=call;
  await other.snapshot(null,{recover:true});
  await assert.rejects(other.grade({cardId:101,ease:3,operationId:'second-101'}),/ANKI_ACTION_PENDING/);
 }finally{release();await pending;}
});

test('grading the final card returns today count, next due, and deck total without failing if summary queries fail',async t=>{
 const {reviewRest}=await import('../web/empty-states.js');
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');t.after(()=>db.close());
 let card={cardId:101,deckName:'MeguLit',question:'front',answer:'back',buttons:[1,2,3,4],nextReviews:['1m','6m','1d','4d']};
 const calls=[];
 const fetcher=async(_u,o)=>{
  const {action,params}=JSON.parse(o.body);calls.push({action,params});
  if(action==='deckNames')return {ok:true,json:async()=>({result:['MeguLit'],error:null})};
  if(action==='guiDeckReview'||action==='guiShowAnswer')return {ok:true,json:async()=>({result:true,error:null})};
  if(action==='guiCurrentCard')return {ok:true,json:async()=>card?{result:card,error:null}:{result:null,error:'Gui review is not currently active.'}};
  if(action==='guiAnswerCard'){card=null;return {ok:true,json:async()=>({result:true,error:null})};}
  if(action==='getDeckStats')return {ok:true,json:async()=>({result:{1:{total_in_deck:42}},error:null})};
  if(action==='getNumCardsReviewedToday')return {ok:true,json:async()=>({result:15,error:null})};
  if(action==='findCards')return {ok:true,json:async()=>({result:/prop:due=1$/.test(params.query)?[201,202,203,204,205]:[],error:null})};
  throw Error('unexpected '+action);
 };
 const reviewer=new AnkiReviewer({db,fetcher});
 await reviewer.start('MeguLit');await reviewer.showAnswer(101);
 const done=await reviewer.grade({cardId:101,ease:3,operationId:'finish-101'});
 assert.deepEqual(done,{done:true,finished:true,deck:'MeguLit',total:42,reviewedToday:15,nextDue:{days:1,count:5}});
 // Idempotent replay returns the exact cached finished summary without re-answering.
 assert.deepEqual(await reviewer.grade({cardId:101,ease:3,operationId:'finish-101'}),done);
 assert.equal(calls.filter(c=>c.action==='guiAnswerCard').length,1);
 const html=reviewRest({locale:'zh',esc:String,kind:'rest',deck:done.deck,reviewed:done.reviewedToday??null,nextDue:done.nextDue,total:done.total??null});
 assert.match(html,/>15<\/b><span>张 · 今天复习过的卡/);
 assert.match(html,/下次到期 明天 · 5 张/);
 assert.match(html,/MeguLit · 牌组共 42 张/);

 // Summary lookup failures after guiAnswerCard must never turn a succeeded rating into ANKI_RATING_UNCERTAIN.
 const db2=new DatabaseSync(':memory:');db2.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');t.after(()=>db2.close());
 let card2={cardId:201,deckName:'',question:'f',answer:'b',buttons:[1,2,3,4],nextReviews:[]};
 const seen2=[];
 const fetcher2=async(_u,o)=>{
  const {action,params}=JSON.parse(o.body);seen2.push({action,params});
  if(action==='deckNames')return {ok:true,json:async()=>({result:['MeguLit'],error:null})};
  if(action==='guiDeckReview'||action==='guiShowAnswer')return {ok:true,json:async()=>({result:true,error:null})};
  if(action==='guiCurrentCard')return {ok:true,json:async()=>card2?{result:card2,error:null}:{result:null,error:'Gui review is not currently active.'}};
  if(action==='guiAnswerCard'){card2=null;return {ok:true,json:async()=>({result:true,error:null})};}
  if(action==='getNumCardsReviewedToday')return {ok:true,json:async()=>({result:7,error:null})};
  throw Error('summary failed');
 };
 const reviewer2=new AnkiReviewer({db:db2,fetcher:fetcher2});
 await reviewer2.start('MeguLit');await reviewer2.showAnswer(201);
 const done2=await reviewer2.grade({cardId:201,ease:3,operationId:'finish-201'});
 assert.deepEqual(done2,{done:true,finished:true,deck:'',reviewedToday:7});
 assert.ok(!seen2.some(c=>c.action==='getDeckStats'||c.action==='findCards'),'empty deck skips deck-scoped summary queries');
});
