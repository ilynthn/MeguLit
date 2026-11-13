// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 card wall (services/card-wall.cjs): state, Toploaders, cards, and above all no spoilers: a CG the game's
   save does not mark, a picture no engine reported, or a made-up source id never reaches the page. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const wall=require('../services/card-wall.cjs');
/* pictures are not drawn in tests: copy the input and report a fixed size */
wall._setRunner(jobs=>jobs.map(j=>{fs.mkdirSync(path.dirname(j.out),{recursive:true});fs.copyFileSync(j.in,j.out);return {ok:true,w:1280,h:720};}));
/* the background decoder runs inline in tests */
wall._setSpawnWarm((root,exe,names)=>wall.warm(root,exe,names));
const PNG=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ffbf1e000502027fa1d5d9a40000000049454e44ae426082','hex');
function fakeDb(rows){return {prepare:sql=>({get:id=>rows.find(r=>r.id===id),all:()=>rows})};}
function kirikiriGame(root){
 const dir=path.join(root,'game');fs.mkdirSync(path.join(dir,'savedata'),{recursive:true});fs.mkdirSync(path.join(dir,'image','evcg'),{recursive:true});
 for(const n of ['ev101a','ev102a','ev103a','bg_school'])fs.writeFileSync(path.join(dir,'image','evcg',n+'.png'),PNG);
 /* the system save marks only ev101a */
 fs.writeFileSync(path.join(dir,'savedata','datasu.ksd'),Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('%[ "cg_EV101A" => 1, "next" => "ev102a" ]','utf16le')]));
 const exe=path.join(dir,'game.exe');fs.writeFileSync(exe,'');return exe;}
function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cards-'));const exe=kirikiriGame(root);
 fs.mkdirSync(path.join(root,'data','assets','covers'),{recursive:true});fs.writeFileSync(path.join(root,'data','assets','covers','c.png'),PNG);
 const db=fakeDb([{id:'g1',title:'sample',executable:exe,cover:'c.png'}]);return {root,exe,db};}

test('a fresh wall has 50 empty Toploaders, mode a',()=>{const {root}=setup();const s=wall.state(root);assert.equal(s.toploaders.length,50);assert.ok(s.toploaders.every(t=>t.cardId===null));assert.equal(s.mode,'a');assert.deepEqual(s.cards,[]);});

test('only the CG the save marks is offered; unmarked CGs never appear',()=>{
 const {root,db}=setup();wall.unlocked(db,root,'g1');const list=wall.unlocked(db,root,'g1');const ids=list.map(x=>x.id).sort();
 assert.deepEqual(ids,['cover','save:ev101a']);
 for(const bad of ['ev102a','ev103a','bg_school'])assert.ok(!ids.some(i=>i.includes(bad)),bad+' must stay hidden');
 for(const x of list){assert.match(x.src,/^data:image\//);assert.ok(x.w>0&&x.h>0);}});

test('seen: only a picture an engine reported, and only with a file of that exact name',()=>{
 const {root,db,exe}=setup();wall.noteSeen(root,exe,'bg_school.png');wall.noteSeen(root,exe,'never_exists');
 const ids=wall.unlocked(db,root,'g1').map(x=>x.id);assert.ok(ids.includes('seen:bg_school'));assert.ok(!ids.includes('seen:never_exists'));assert.ok(!ids.some(i=>/ev10[23]/.test(i)));
 assert.equal(wall.noteSeen(root,exe,'bad<name>?'),false);});

test('R18 filter: unrated save CGs and seen pictures are left out',()=>{
 const {root,db,exe}=setup();fs.mkdirSync(path.join(root,'data','config'),{recursive:true});fs.writeFileSync(path.join(root,'data','config','native-preferences.json'),JSON.stringify({safe_cg:true}));
 wall.noteSeen(root,exe,'bg_school');const ids=wall.unlocked(db,root,'g1').map(x=>x.id);assert.deepEqual(ids,['cover']);});

test('cards_create refuses a locked or made-up source',()=>{
 const {root,db}=setup();
 for(const srcId of ['save:ev102a','save:ev103a','seen:bg_school','shot:../../x.jpg','x'])assert.throws(()=>wall.create(db,root,{gameId:'g1',srcId}),/CARD_SOURCE_LOCKED/);
 assert.throws(()=>wall.handle(db,root,{action:'cards_image',gameId:'g1',srcId:'save:ev102a'}),/CARD_SOURCE_LOCKED/);});

test('create, insert, eject, delete, add Toploaders, mode',()=>{
 const {root,db}=setup();
 const card=wall.handle(db,root,{action:'cards_create',gameId:'g1',kind:'cg',srcId:'save:ev101a',still:{x:2,y:-1,scale:0.2}});
 assert.equal(card.initial,'S');assert.deepEqual(card.still,{x:1,y:0,scale:1});assert.match(card.src,/^data:image\//);assert.equal(card.full,undefined,'the big picture is not sent with every state');assert.match(wall.handle(db,root,{action:'cards_full',cardId:card.id}).full,/^data:image\//);
 let s=wall.handle(db,root,{action:'cards_insert',toploaderId:'t3',cardId:card.id});assert.equal(s.toploaders[3].cardId,card.id);
 s=wall.handle(db,root,{action:'cards_insert',toploaderId:'t5',cardId:card.id});assert.equal(s.toploaders[3].cardId,null);assert.equal(s.toploaders[5].cardId,card.id);
 s=wall.handle(db,root,{action:'cards_eject',toploaderId:'t5'});assert.equal(s.toploaders[5].cardId,null);assert.equal(s.cards.length,1);
 s=wall.handle(db,root,{action:'cards_add_toploaders',count:3});assert.equal(s.toploaders.length,53);
 s=wall.handle(db,root,{action:'cards_set_mode',mode:'b'});assert.equal(s.mode,'b');
 wall.handle(db,root,{action:'cards_insert',toploaderId:'t0',cardId:card.id});
 s=wall.handle(db,root,{action:'cards_delete',cardId:card.id});assert.equal(s.cards.length,0);assert.equal(s.toploaders[0].cardId,null);
 assert.equal(fs.readdirSync(path.join(root,'data','cards','img')).length,0);});

test('a damaged cards.json falls back to a clean wall; writes leave no temp files',()=>{
 const {root}=setup();fs.mkdirSync(path.join(root,'data','cards'),{recursive:true});fs.writeFileSync(path.join(root,'data','cards','cards.json'),'{oops');
 assert.equal(wall.state(root).toploaders.length,50);wall.handle(null,root,{action:'cards_set_mode',mode:'b'});
 assert.deepEqual(fs.readdirSync(path.join(root,'data','cards')).filter(f=>/tmp|lock/.test(f)),[]);});

test('cards_games lists games with at least one picture',()=>{
 const {root,exe}=setup();const store=require('../services/store.cjs'),orig=store.games;
 store.games=()=>[{id:'g1',title:'sample',cover:'data:x'},{id:'g2',title:'none',cover:''}];
 try{const db=fakeDb([{id:'g1',title:'sample',executable:exe,cover:'c.png'},{id:'g2',title:'none',executable:'',cover:''}]);
  assert.deepEqual(wall.games(db,root),[{gameId:'g1',title:'sample',cover:'data:x',unlockedCount:2}]);}finally{store.games=orig;}});

test('KiriKiri: a bare CG name in the save (no cg_ mark) never reaches the wall; the detail card rule is unchanged',()=>{
 const {root,db,exe}=setup();const cg=require('../services/game-cg.cjs');
 assert.ok(cg.scan(exe).items.has('ev102a'),'detail card still uses its wider rule');
 assert.deepEqual([...cg.kirikiriMarked(exe)],['ev101a']);
 wall.unlocked(db,root,'g1');assert.ok(!wall.unlocked(db,root,'g1').some(x=>x.id==='save:ev102a'));
 assert.throws(()=>wall.create(db,root,{gameId:'g1',srcId:'save:ev102a'}),/CARD_SOURCE_LOCKED/);});

test('undecoded CGs: the list answers at once and the background worker fills them in',()=>{
 const {root,db,exe}=setup();const calls=[];wall._setSpawnWarm((r,e,n)=>calls.push(n));
 try{assert.deepEqual(wall.unlocked(db,root,'g1').map(x=>x.id),['cover']);assert.deepEqual(calls,[['ev101a']]);
  assert.deepEqual(wall.handle(db,root,{action:'cards_pending',gameId:'g1'}),{pending:1});
  wall.warm(root,exe,['ev101a']);assert.deepEqual(wall.handle(db,root,{action:'cards_pending',gameId:'g1'}),{pending:0});
  assert.deepEqual(wall.unlocked(db,root,'g1').map(x=>x.id),['cover','save:ev101a']);}
 finally{wall._setSpawnWarm((r,e,n)=>wall.warm(r,e,n));}});

test('scene shots: only captures marked clean (taken with no dialogue box on screen) can become cards',()=>{
 const {root,db,exe}=setup();const shots=require('../services/scene-shots.cjs');
 /* two shots: one from before the no-dialogue-box rule (no clean mark), one taken after it */
 const dir=path.join(root,'data','scene-shots',require('node:crypto').createHash('sha1').update(path.resolve(exe).toLowerCase()).digest('hex').slice(0,16));
 fs.mkdirSync(dir,{recursive:true});for(const f of ['a1-aaaaaa.jpg','b2-bbbbbb.jpg'])fs.writeFileSync(path.join(dir,f),PNG);
 fs.writeFileSync(path.join(dir,'index.json'),JSON.stringify([{file:'a1-aaaaaa.jpg',score:90,hash:'aaaaaaaaaaaaaaaa',at:1},{file:'b2-bbbbbb.jpg',score:80,hash:'bbbbbbbbbbbbbbbb',at:2,clean:true}]));
 assert.deepEqual(shots.list(root,exe).map(s=>s.file),['b2-bbbbbb.jpg']);
 wall.unlocked(db,root,'g1');const ids=wall.unlocked(db,root,'g1').map(x=>x.id);
 assert.ok(ids.includes('shot:b2-bbbbbb.jpg'));assert.ok(!ids.includes('shot:a1-aaaaaa.jpg'),'a capture that may show a dialogue box is never offered');
 assert.throws(()=>wall.create(db,root,{gameId:'g1',srcId:'shot:a1-aaaaaa.jpg'}),/CARD_SOURCE_LOCKED/);
 /* keep() through the reader path always marks clean only when the box was hidden */
 const reader={root,gameExe:exe,sceneDialogHidden:false};return shots.maybe(reader,{hidden:false}).then(()=>assert.equal(reader.sceneDialogHidden,false));});

test('spoilers: a CG unlocked later appears, one never unlocked stays out of every action',()=>{
 const {root,db,exe}=setup();
 const before=new Set((wall.unlocked(db,root,'g1'),wall.unlocked(db,root,'g1')).map(x=>x.id));assert.ok(!before.has('save:ev102a'));
 for(const action of ['cards_image','cards_create'])assert.throws(()=>wall.handle(db,root,{action,gameId:'g1',srcId:'save:ev102a',kind:'cg'}),/CARD_SOURCE_LOCKED/);
 /* the player reaches ev102a: the save now marks it */
 fs.writeFileSync(path.join(path.dirname(exe),'savedata','datasu.ksd'),Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('%[ "cg_EV101A" => 1, "cg_EV102A" => 1 ]','utf16le')]));
 wall.unlocked(db,root,'g1');const after=wall.unlocked(db,root,'g1').map(x=>x.id);
 assert.ok(after.includes('save:ev102a'));assert.ok(!after.includes('save:ev103a'));});

test('an ejected card stays in cards (我的卡) and can be sleeved into another toploader',()=>{
 const {root,db}=setup();const card=wall.handle(db,root,{action:'cards_create',gameId:'g1',kind:'cover',srcId:'cover'});
 wall.handle(db,root,{action:'cards_insert',toploaderId:'t1',cardId:card.id});let s=wall.handle(db,root,{action:'cards_eject',toploaderId:'t1'});
 assert.ok(s.cards.some(c=>c.id===card.id));assert.ok(s.toploaders.every(t=>t.cardId!==card.id));
 s=wall.handle(db,root,{action:'cards_insert',toploaderId:'t9',cardId:card.id});assert.equal(s.toploaders[9].cardId,card.id);});

test('finish: plain, shine (闪卡) or holo (镭射) is kept on the card; anything else is plain',()=>{
 const {root,db}=setup();
 const a=wall.handle(db,root,{action:'cards_create',gameId:'g1',kind:'cover',srcId:'cover',finish:'holo'});assert.equal(a.finish,'holo');
 const b=wall.handle(db,root,{action:'cards_create',gameId:'g1',kind:'cover',srcId:'cover',finish:'shine'});assert.equal(b.finish,'shine');
 const c=wall.handle(db,root,{action:'cards_create',gameId:'g1',kind:'cover',srcId:'cover',finish:'<img>'});assert.equal(c.finish,'plain');
 assert.deepEqual(wall.state(root).cards.map(x=>x.finish),['holo','shine','plain']);});

test('a made card can change its finish later; unknown finishes fall back to plain',()=>{
 const {root,db}=setup();const c=wall.handle(db,root,{action:'cards_create',gameId:'g1',kind:'cover',srcId:'cover'});assert.equal(c.finish,'plain');
 let s=wall.handle(db,root,{action:'cards_set_finish',cardId:c.id,finish:'shine'});assert.equal(s.cards[0].finish,'shine');
 s=wall.handle(db,root,{action:'cards_set_finish',cardId:c.id,finish:'holo'});assert.equal(s.cards[0].finish,'holo');
 s=wall.handle(db,root,{action:'cards_set_finish',cardId:c.id,finish:'x'});assert.equal(s.cards[0].finish,'plain');
 assert.throws(()=>wall.handle(db,root,{action:'cards_set_finish',cardId:'nope',finish:'holo'}),/CARD_NOT_FOUND/);});
