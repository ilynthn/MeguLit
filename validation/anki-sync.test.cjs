// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('../services/store.cjs'),{AnkiSync,link,pickEntry}=require('../services/anki-sync.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tome-anki-sync-'));const db=openStore(root);t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});db.prepare('INSERT INTO vocabulary VALUES(?,?,?,?,?,?,?,?)').run(1,'言葉','ことば','["preserved definition"]',0,123,null,'{"custom":true}');return {db,root};}
test('Anki status and review history update canonical words once without changing definitions',async t=>{const {db}=fixture(t);link(db,1,1000);const sync=new AnkiSync({db,config:{},anki:{stats:async()=>[{noteId:1000,word:'言葉',reading:'ことば',status:3,reviews:[10000,20000]}]}});const first=await sync.run();assert.equal(first.status,1);assert.equal(first.reviews,2);const second=await sync.run();assert.equal(second.status,0);assert.equal(second.reviews,0);const word=db.prepare('SELECT * FROM vocabulary WHERE id=1').get();assert.equal(word.status,3);assert.equal(word.definitions,'["preserved definition"]');assert.equal(JSON.parse(word.original).custom,true);assert.equal(db.prepare('SELECT COUNT(*) n FROM review_events').get().n,2);});
test('unlinked notes resolve locally, import once, and never resurrect a deleted linked word',async t=>{const {db}=fixture(t);const notes=[{noteId:3000,word:'新語',reading:'しんご',status:1,reviews:[]}],sync=new AnkiSync({db,config:{},anki:{stats:async()=>notes},resolveEntry:async()=>({id:2,spellings:['新語'],readings:['しんご'],definitions:['new word']})});assert.equal((await sync.run()).imported,1);assert.equal((await sync.run()).imported,0);db.prepare('DELETE FROM vocabulary WHERE id=2').run();assert.equal((await sync.run()).imported,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM vocabulary WHERE id=2').get().n,0);});
test('a failed remote read leaves canonical status and reviews unchanged',async t=>{const {db}=fixture(t);const sync=new AnkiSync({db,config:{},anki:{stats:async()=>{throw Error('ANKI_OFFLINE');}}});await assert.rejects(sync.run(),/ANKI_OFFLINE/);assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=1').get().status,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM review_events').get().n,0);});
test('legacy links import once and preserve review deduplication across migration',async t=>{const {db}=fixture(t);db.prepare('INSERT INTO preserved_records VALUES(?,?,?)').run('tome_anki_links','0',JSON.stringify({word_id:1,note_id:5000}));db.prepare('INSERT INTO preserved_records VALUES(?,?,?)').run('tome_anki_reviews','0',JSON.stringify({word_id:1,review_id:7000}));const sync=new AnkiSync({db,config:{},anki:{stats:async()=>[{noteId:5000,status:2,reviews:[7000]}]}});assert.equal((await sync.run()).reviews,0);assert.equal(db.prepare('SELECT note_id FROM anki_links WHERE word_id=1').get().note_id,5000);});

test('homograph sync passes reading, picks matching entry, and skips mismatched or ambiguous candidates',async t=>{
 const {db}=fixture(t);
 const entries=[
  {id:101,spellings:['生'],readings:['せい'],definitions:['life']},
  {id:102,spellings:['生'],readings:['なま'],definitions:['raw']}
 ];
 const seen=[];
 const notes=[
  {noteId:6001,word:'生',reading:'せい',status:2,reviews:[10000]},
  {noteId:6002,word:'生',reading:'ナマ',status:4,reviews:[20000]},
  {noteId:6003,word:'生',reading:'いく',status:3,reviews:[30000]},
  {noteId:6004,word:'生',reading:'',status:1,reviews:[40000]}
 ];
 const sync=new AnkiSync({db,config:{},anki:{stats:async()=>notes},resolveEntry:async(word,reading)=>{seen.push([word,reading]);return pickEntry(entries,word,reading);}});
 const res=await sync.run();
 assert.deepEqual(seen,[['生','せい'],['生','ナマ'],['生','いく'],['生','']]);
 assert.equal(res.imported,2);assert.equal(res.linked,2);assert.equal(res.skipped,2);assert.equal(res.reviews,2);
 assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=101').get().status,2);
 assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=102').get().status,4);
 assert.equal(db.prepare('SELECT note_id FROM anki_links WHERE word_id=101').get().note_id,6001);
 assert.equal(db.prepare('SELECT note_id FROM anki_links WHERE word_id=102').get().note_id,6002);
 // Even if a custom resolver ignores reading and returns the wrong homograph, AnkiSync rejects it.
 const wrong=new AnkiSync({db,config:{},anki:{stats:async()=>[{noteId:6005,word:'生',reading:'うぶ',status:3,reviews:[50000]}]},resolveEntry:async()=>entries[0]});
 const res2=await wrong.run();
 assert.equal(res2.linked,0);assert.equal(res2.skipped,1);
 assert.equal(db.prepare('SELECT note_id FROM anki_links WHERE word_id=101').get().note_id,6001);
 // Unambiguous kana-only and multi-entry same-reading words still resolve to the primary (first) entry.
 assert.equal(pickEntry([
  {id:201,spellings:['然し'],readings:['しかし','しっかし']},
  {id:202,spellings:['私窩子'],readings:['しかし','しわし']}
 ],'しかし','')?.id,201,'kana-only card with blank reading keeps primary entry even with variant readings');
 assert.equal(pickEntry([
  {id:203,spellings:['沈黙'],readings:['ちんもく']},
  {id:5531003,spellings:['沈黙'],readings:['ちんもく']}
 ],'沈黙',' ちんもく ')?.id,203,'multi-entry same spelling+reading keeps primary entry and trims reading');
 assert.equal(pickEntry([
  {id:203,spellings:['沈黙'],readings:['ちんもく']},
  {id:5531003,spellings:['沈黙'],readings:['ちんもく']}
 ],'沈黙','')?.id,203,'multi-entry kanji with blank reading resolves when all readings match');
 assert.equal(pickEntry([{id:208,spellings:['行く'],readings:['いく','ゆく']}],'行く','')?.id,208,'single kanji entry with multiple readings resolves on blank reading');
 assert.equal(pickEntry([
  {id:204,spellings:['精'],readings:['せい']},
  {id:205,spellings:['生'],readings:['せい']}
 ],'生','せい')?.id,205,'matching spelling wins over other kanji sharing the same reading');
 assert.equal(pickEntry([{id:206,spellings:[],readings:['ビール']}],'ビール','びーる')?.id,206,'kana-only card with hiragana reading matches katakana entry');
 assert.equal(pickEntry([{id:207,spellings:[''],readings:['']}],'   ',''),null,'blank word returns null');

 // Bidirectional katakana/hiragana local vocabulary lookup avoids redundant resolution.
 db.prepare('INSERT INTO vocabulary VALUES(?,?,?,?,?,?,?,?)').run(401,'珈琲','コーヒー','["coffee"]',0,123,null,'{}');
 db.prepare('INSERT INTO vocabulary VALUES(?,?,?,?,?,?,?,?)').run(402,'硝子','がらす','["glass"]',0,123,null,'{}');
 let localResolveCalls=0;
 const localSync=new AnkiSync({
  db,config:{},
  anki:{stats:async()=>[
   {noteId:6010,word:'珈琲',reading:'こーひー',status:2,reviews:[60000]},
   {noteId:6011,word:'硝子',reading:'ガラス',status:3,reviews:[70000]}
  ]},
  resolveEntry:async()=>{localResolveCalls++;return null;}
 });
 const localRes=await localSync.run();
 assert.equal(localResolveCalls,0,'katakana/hiragana local matches do not call resolveEntry');
 assert.equal(localRes.linked,2);
 assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=401').get().status,2);
 assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=402').get().status,3);
});

test('bridge anki_sync and reader ankiStats resolve homographs by reading instead of picking the first candidate',async t=>{
 const {root}=fixture(t);
 const prevRoot=process.env.MEGULIT_ROOT;
 const bridgePath=require.resolve('../services/bridge.cjs');
 delete require.cache[bridgePath];
 process.env.MEGULIT_ROOT=root;
 t.after(()=>{delete require.cache[bridgePath];if(prevRoot===undefined)delete process.env.MEGULIT_ROOT;else process.env.MEGULIT_ROOT=prevRoot;});
 const {Anki}=require('../core/anki.cjs');
 const entries=[
  {id:301,spellings:['生'],readings:['せい'],definitions:['life']},
  {id:302,spellings:['生'],readings:['なま'],definitions:['raw']}
 ];
 t.mock.method(Anki.prototype,'stats',async()=>[
  {noteId:7001,word:'生',reading:'せい',status:2,reviews:[11000]},
  {noteId:7002,word:'生',reading:'なま',status:4,reviews:[22000]},
  {noteId:7003,word:'生',reading:'き',status:3,reviews:[33000]}
 ]);
 const runtime={
  config:()=>({}),
  emit:()=>{},
  learning:()=>({request:async()=>({entries})})
 };
 const {dispatch}=require('../services/bridge.cjs');
 const r=await dispatch({action:'anki_sync'},runtime);
 assert.equal(r.imported,2);assert.equal(r.skipped,1);
 const db=openStore(root);
 try{
  assert.equal(db.prepare('SELECT note_id FROM anki_links WHERE word_id=301').get().note_id,7001);
  assert.equal(db.prepare('SELECT note_id FROM anki_links WHERE word_id=302').get().note_id,7002);
  assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=301').get().status,2);
  assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=302').get().status,4);
 }finally{db.close();}
 const {Reader}=require('../services/reader.cjs');
 const reader=Object.create(Reader.prototype);
 reader.root=root;reader.runtime=runtime;
 const stats=await reader.v4('ankiStats',{linked:[]});
 assert.equal(stats[0].entry?.id,301);
 assert.equal(stats[1].entry?.id,302);
 assert.equal(stats[2].entry,undefined);
});

test('Anki.stats falls back to Reading when WordReading is empty or nbsp so homograph sync does not drop readings',async t=>{
 const {db}=fixture(t);
 const {Anki}=require('../core/anki.cjs');
 const anki=new Anki(async(_url,options)=>{
  const {action}=JSON.parse(options.body);let result;
  if(action==='findNotes')result=[8001,8002,8003];
  else if(action==='notesInfo')result=[
   {noteId:8001,cards:[9001],fields:{Word:{value:'生',order:0},WordReading:{value:'',order:1},Reading:{value:'なま',order:2},Sentence:{value:'生で食べる。',order:3}}},
   {noteId:8002,cards:[9002],fields:{Word:{value:'<span>生</span>',order:0},WordReading:{value:'<div>&nbsp;</div>',order:1},Reading:{value:'せい&nbsp;',order:2},Sentence:{value:'生を受ける。',order:3}}},
   {noteId:8003,cards:[9003],fields:{Word:{value:'言葉',order:0},WordReading:{value:'ことば',order:1},Reading:{value:'ふるい',order:2},Sentence:{value:'',order:3}}}
  ];
  else if(action==='cardsInfo')result=[
   {cardId:9001,type:2,queue:2,interval:21},
   {cardId:9002,type:2,queue:2,interval:10},
   {cardId:9003,type:2,queue:2,interval:3}
  ];
  else if(action==='getReviewsOfCards')result={'9001':[{id:10000}],'9002':[{id:20000}],'9003':[]};
  else throw Error('unexpected '+action);
  return Response.json({result,error:null});
 });
 const notes=await anki.stats({});
 assert.deepEqual(notes.map(n=>[n.noteId,n.word,n.reading]),[
  [8001,'生','なま'],
  [8002,'生','せい'],
  [8003,'言葉','ことば']
 ]);
 const entries=[
  {id:501,spellings:['生'],readings:['せい'],definitions:['life']},
  {id:502,spellings:['生'],readings:['なま'],definitions:['raw']}
 ];
 const sync=new AnkiSync({db,config:{},anki,resolveEntry:async(word,reading)=>pickEntry(entries,word,reading)});
 const res=await sync.run();
 assert.equal(res.imported,2);assert.equal(res.linked,3);assert.equal(res.skipped,0);assert.equal(res.reviews,2);
 assert.equal(db.prepare('SELECT note_id FROM anki_links WHERE word_id=502').get().note_id,8001);
 assert.equal(db.prepare('SELECT note_id FROM anki_links WHERE word_id=501').get().note_id,8002);
});

test('kana-only Anki notes with blank WordReading match existing local vocabulary without resolveEntry, while kanji homographs do not',async t=>{
 const {db}=fixture(t);
 db.prepare('INSERT INTO vocabulary VALUES(?,?,?,?,?,?,?,?)').run(601,'やっぱり','やっぱり','["as expected"]',0,123,null,'{}');
 db.prepare('INSERT INTO vocabulary VALUES(?,?,?,?,?,?,?,?)').run(602,'コーヒー','コーヒー','["coffee"]',0,123,null,'{}');
 db.prepare('INSERT INTO vocabulary VALUES(?,?,?,?,?,?,?,?)').run(603,'生','せい','["life"]',0,123,null,'{}');
 const resolved=[];
 const sync=new AnkiSync({
  db,config:{},
  anki:{stats:async()=>[
   {noteId:9001,word:'やっぱり',reading:'',status:3,reviews:[10000]},
   {noteId:9002,word:'コーヒー',reading:'',status:2,reviews:[20000]},
   {noteId:9003,word:'生',reading:'',status:4,reviews:[30000]}
  ]},
  resolveEntry:async(word,reading)=>{resolved.push([word,reading]);return null;}
 });
 const res=await sync.run();
 assert.deepEqual(resolved,[['生','']],'only the kanji note with blank reading falls through to resolveEntry');
 assert.equal(res.linked,2);
 assert.equal(res.skipped,1);
 assert.equal(res.reviews,2);
 assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=601').get().status,3);
 assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=602').get().status,2);
 assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=603').get().status,0);
 assert.equal(db.prepare('SELECT note_id FROM anki_links WHERE word_id=601').get().note_id,9001);
 assert.equal(db.prepare('SELECT note_id FROM anki_links WHERE word_id=602').get().note_id,9002);
});
