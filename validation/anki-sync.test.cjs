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

test('AnkiSync, bridge anki_sync, and reader ankiStats resolve suru verbs, potential forms, conjugations, and normalized variants via LocalLearning/morphology analysis',async t=>{
 const {db,root}=fixture(t);
 const {matchesReading}=require('../services/anki-sync.cjs');
 const {LocalLearning}=require('../core/learning-native.cjs');
 const {conjugation}=require('../core/morphology.cjs');

 const dictEntries=[
  {id:1512670,spellings:['勉強'],readings:['べんきょう'],pos:['Noun','Noun or participle which takes the aux. verb suru'],definitions:['study']},
  {id:1015230,spellings:[],readings:['アクセス'],pos:['Noun','Noun or participle which takes the aux. verb suru'],definitions:['access']},
  {id:1174340,spellings:['泳ぐ'],readings:['およぐ'],pos:['Godan verb with gu ending'],definitions:['swim']},
  {id:1465610,spellings:['入れる'],readings:['いれる'],pos:['Ichidan verb'],definitions:['put in']},
  {id:1465590,spellings:['入る'],readings:['はいる'],pos:['Godan verb with ru ending'],definitions:['enter']},
  {id:1590000,spellings:['お話'],readings:['おはなし'],pos:['Noun'],definitions:['talk']},
  {id:1358280,spellings:['食べる'],readings:['たべる'],pos:['Ichidan verb'],definitions:['eat']},
  {id:1502860,spellings:['分'],readings:['ぶん'],pos:['Noun'],definitions:['part']},
  {id:101,spellings:['生'],readings:['せい'],pos:['Noun','Noun or participle which takes the aux. verb suru'],definitions:['life']},
  {id:102,spellings:['生'],readings:['なま'],pos:['Noun'],definitions:['raw']},
  {id:301,spellings:['汗ばむ'],readings:['あせばむ'],pos:['Godan verb with mu ending'],definitions:['be sweaty']}
 ];
 const ll=new LocalLearning(root);
 const index=new Map(),byId=new Map(),english=new Map();
 for(const e of dictEntries){byId.set(e.id,e);for(const k of [...e.spellings,...e.readings]){const arr=index.get(k)||[];arr.push(e.id);index.set(k,arr);}}
 Object.assign(ll,{index,byId,english});
 ll.load=()=>{};
 const tokensByWord={
  '勉強する':[
   {surface:'勉強',base_form:'勉強',normalized:'勉強',reading:'ベンキョウ',pos:'名詞',grammar:['名詞','普通名詞','サ変可能','*','*','*'],start:0,end:2},
   {surface:'する',base_form:'する',normalized:'為る',reading:'スル',pos:'動詞',grammar:['動詞','非自立可能','*','*','サ行変格','終止形-一般'],start:2,end:4}
  ],
  '勉強した':[
   {surface:'勉強',base_form:'勉強',normalized:'勉強',reading:'ベンキョウ',pos:'名詞',grammar:['名詞','普通名詞','サ変可能','*','*','*'],start:0,end:2},
   {surface:'し',base_form:'する',normalized:'為る',reading:'シ',pos:'動詞',grammar:['動詞','非自立可能','*','*','サ行変格','連用形-一般'],start:2,end:3},
   {surface:'た',base_form:'た',normalized:'た',reading:'タ',pos:'助動詞',grammar:['助動詞','*','*','*','助動詞-タ','終止形-一般'],start:3,end:4}
  ],
  'アクセスする':[
   {surface:'アクセス',base_form:'アクセス',normalized:'アクセス',reading:'アクセス',pos:'名詞',grammar:['名詞','普通名詞','サ変可能','*','*','*'],start:0,end:4},
   {surface:'する',base_form:'する',normalized:'為る',reading:'スル',pos:'動詞',grammar:['動詞','非自立可能','*','*','サ行変格','終止形-一般'],start:4,end:6}
  ],
  '泳げる':[
   {surface:'泳げる',base_form:'泳げる',normalized:'泳げる',reading:'オヨゲル',pos:'動詞',grammar:['動詞','一般','*','*','下一段-ガ行','終止形-一般'],start:0,end:3}
  ],
  '入れる':[
   {surface:'入れる',base_form:'入れる',normalized:'入れる',reading:'イレル',pos:'動詞',grammar:['動詞','一般','*','*','下一段-ラ行','終止形-一般'],start:0,end:3}
  ],
  'お話し':[
   {surface:'お話し',base_form:'お話し',normalized:'お話',reading:'オハナシ',pos:'名詞',grammar:['名詞','普通名詞','一般','*','*','*'],start:0,end:3}
  ],
  '食べた':[
   {surface:'食べ',base_form:'食べる',normalized:'食べる',reading:'タベ',pos:'動詞',grammar:['動詞','一般','*','*','下一段-バ行','連用形-一般'],start:0,end:2},
   {surface:'た',base_form:'た',normalized:'た',reading:'タ',pos:'助動詞',grammar:['助動詞','*','*','*','助動詞-タ','終止形-一般'],start:2,end:3}
  ],
  '10分':[
   {surface:'10',base_form:'10',normalized:'10',reading:'',pos:'名詞',grammar:['名詞','数詞','*','*','*','*'],start:0,end:2},
   {surface:'分',base_form:'分',normalized:'分',reading:'ブン',pos:'名詞',grammar:['名詞','普通名詞','一般','*','*','*'],start:2,end:3}
  ],
  '生する':[
   {surface:'生',base_form:'生',normalized:'生',reading:'セイ',pos:'名詞',grammar:['名詞','普通名詞','サ変可能','*','*','*'],start:0,end:1},
   {surface:'する',base_form:'する',normalized:'為る',reading:'スル',pos:'動詞',grammar:['動詞','非自立可能','*','*','サ行変格','終止形-一般'],start:1,end:3}
  ],
  '汗ばむ手':[
   {surface:'汗',base_form:'汗',normalized:'汗',reading:'アセ',pos:'名詞',grammar:['名詞','普通名詞','一般','*','*','*'],start:0,end:1},
   {surface:'ばむ',base_form:'ばむ',normalized:'ばむ',reading:'バム',pos:'接尾辞',grammar:['接尾辞','動詞的','*','*','五段-マ行','終止形-一般'],start:1,end:3},
   {surface:'手',base_form:'手',normalized:'手',reading:'テ',pos:'名詞',grammar:['名詞','普通名詞','一般','*','*','*'],start:3,end:4}
  ],
  '汗ばん':[
   {surface:'汗',base_form:'汗',normalized:'汗',reading:'アセ',pos:'名詞',grammar:['名詞','普通名詞','一般','*','*','*'],start:0,end:1},
   {surface:'ばん',base_form:'ばむ',normalized:'ばむ',reading:'バン',pos:'接尾辞',grammar:['接尾辞','動詞的','*','*','五段-マ行','連用形-撥音便'],start:1,end:3}
  ]
 };
 ll.tokenizeWhole=async text=>tokensByWord[text]||[];

 const lookup=async w=>ll.request('lookup_exact',{text:w,start:0,end:[...w].length},'zh');
 const rSuru=await lookup('勉強する');
 const rSuruPast=await lookup('勉強した');
 const rKanaSuru=await lookup('アクセスする');
 const rPot=await lookup('泳げる');
 const rIreru=await lookup('入れる');
 const rOku=await lookup('お話し');
 const rPast=await lookup('食べた');
 const rPhrase=await lookup('10分');
 const rHomographSuru=await lookup('生する');
 const rPrefixPhrase=await lookup('汗ばむ手');
 const rWholeCompound=await lookup('汗ばん');

 assert.equal(rSuru.morphology.lookup,'勉強');
 assert.equal(rSuru.morphology.lookupReading,'べんきょう');
 assert.equal(rPot.morphology.base,'泳ぐ');
 assert.equal(rOku.morphology.normalized,'お話');
 // English morphology carries the same lookup/normalized fields
 assert.equal(conjugation(ll.groups(tokensByWord['勉強する'])[0],'en').lookup,'勉強');

 assert.equal(pickEntry(rSuru.entries,'勉強する','べんきょうする',rSuru)?.id,1512670);
 assert.equal(pickEntry(rSuru.entries,'勉強する','べんきょう',rSuru)?.id,1512670);
 assert.equal(pickEntry(rSuru.entries,'勉強する','',rSuru)?.id,1512670);
 assert.equal(pickEntry(rSuruPast.entries,'勉強した','べんきょうした',rSuruPast)?.id,1512670);
 assert.equal(pickEntry(rKanaSuru.entries,'アクセスする','あくせすする',rKanaSuru)?.id,1015230);
 assert.equal(pickEntry(rPot.entries,'泳げる','およげる',rPot)?.id,1174340);
 assert.equal(pickEntry(rPot.entries,'泳げる','',rPot)?.id,1174340);
 assert.equal(pickEntry(rOku.entries,'お話し','おはなし',rOku)?.id,1590000);
 assert.equal(pickEntry(rPast.entries,'食べた','たべた',rPast)?.id,1358280);
 assert.equal(pickEntry(rWholeCompound.entries,'汗ばん','あせばむ',rWholeCompound),null);
 assert.equal(pickEntry(rWholeCompound.entries,'汗ばん','あせばん',rWholeCompound)?.id,301);
 // Homograph suru stem: explicit reading resolves to matching entry, blank reading still refuses ambiguity even when Sudachi guesses a reading
 assert.equal(pickEntry(rHomographSuru.entries,'生する','せいする',rHomographSuru)?.id,101);
 assert.equal(pickEntry(rHomographSuru.entries,'生する','',rHomographSuru),null);

 // 入れる keeps its own entry and never falls back to 入る even if 入れる were missing from candidates
 assert.equal(pickEntry(rIreru.entries,'入れる','いれる',rIreru)?.id,1465610);
 assert.equal(pickEntry([dictEntries[4]],'入れる','いれる',rIreru),null);

 // Negative boundaries: phrase subtoken & prefix-only fallbacks, mismatched surface/reading, missing analysis, empty m.reading with wrong r
 assert.equal(pickEntry(rPhrase.entries,'10分','ぶん',rPhrase),null);
 assert.equal(pickEntry(rPhrase.entries,'10分','',rPhrase),null);
 assert.equal(pickEntry(rPrefixPhrase.entries,'汗ばむ手','あせばむて',rPrefixPhrase),null);
 assert.equal(pickEntry(rPrefixPhrase.entries,'汗ばむ手','',rPrefixPhrase),null);
 assert.equal(pickEntry(rSuru.entries,'別の語','べんきょうする',rSuru),null);
 assert.equal(pickEntry(rPot.entries,'泳げる','たべる',rPot),null);
 assert.equal(pickEntry(rSuru.entries,'勉強する','べんきょうする'),null);
 assert.equal(pickEntry([dictEntries[0]],'勉強する','まったくちがう',{morphology:{base:'勉強する',lookup:'勉強',lookupReading:'べんきょう',reading:''}}),null);
 assert.equal(pickEntry([dictEntries[0]],'勉強する','べんきょうする',{morphology:{base:'勉強する',lookup:'勉強',lookupReading:'べんきょう',reading:'べんきょうする'},selection_analysis:{exact:false}}),null);
 assert.equal(pickEntry([dictEntries[5]],'お話し','ちがう',{morphology:{base:'お話し',normalized:'お話',reading:''}}),null);
 // Suru stem with explicit lookupReading and non-inflected normalized variants must never fall back to a reading-mismatched entry
 assert.equal(pickEntry([dictEntries[9]],'生する','せいする',rHomographSuru),null);
 assert.equal(pickEntry(rHomographSuru.entries,'生する','しょうする',rHomographSuru),null);
 assert.equal(pickEntry([{id:2001,spellings:['確と'],readings:['しかと']}],'ちゃんと','ちゃんと',{morphology:{base:'ちゃんと',normalized:'確と',reading:'ちゃんと'}}),null);
 assert.equal(pickEntry([{id:401,spellings:['入る'],readings:['はいる']},{id:402,spellings:['入る'],readings:['いる']}],'入った','はいった',{morphology:{base:'入る',reading:'はいった'}}),null);
 assert.equal(pickEntry([dictEntries[10]],'汗 ばむ','あせばむ',{morphology:{base:'汗ばむ',surface:'汗 ばむ',reading:'あせばむ'},selection_analysis:{exact:true,parts:[{surface:'汗'},{surface:' '},{surface:'ばむ'}]}}),dictEntries[10]);
 // Resolved reading symbol only matches the reading verified by morphology
 const pickedPot=pickEntry(rPot.entries,'泳げる','およげる',rPot);
 assert.equal(matchesReading(pickedPot,'およげる'),true);
 assert.equal(matchesReading(pickedPot,'たべる'),false);
 assert.equal(matchesReading(dictEntries[2],'およげる'),false);

 // End-to-end AnkiSync via bridge anki_sync and reader ankiStats
 const prevRoot=process.env.MEGULIT_ROOT;
 const bridgePath=require.resolve('../services/bridge.cjs');
 delete require.cache[bridgePath];
 process.env.MEGULIT_ROOT=root;
 t.after(()=>{delete require.cache[bridgePath];if(prevRoot===undefined)delete process.env.MEGULIT_ROOT;else process.env.MEGULIT_ROOT=prevRoot;});
 const {Anki}=require('../core/anki.cjs');
 t.mock.method(Anki.prototype,'stats',async()=>[
  {noteId:9101,word:'勉強する',reading:'べんきょうする',status:3,reviews:[10000]},
  {noteId:9102,word:'泳げる',reading:'およげる',status:2,reviews:[20000]},
  {noteId:9103,word:'お話し',reading:'おはなし',status:4,reviews:[30000]},
  {noteId:9104,word:'泳げる',reading:'たべる',status:1,reviews:[40000]},
  {noteId:9105,word:'10分',reading:'ぶん',status:2,reviews:[50000]},
  {noteId:9106,word:'アクセスする',reading:'あくせすする',status:2,reviews:[60000]}
 ]);
 const runtime={config:()=>({}),emit:()=>{},learning:()=>ll};
 const {dispatch}=require('../services/bridge.cjs');
 const res=await dispatch({action:'anki_sync'},runtime);
 assert.equal(res.imported,4);
 assert.equal(res.skipped,2);
 const checkDb=openStore(root);
 try{
  assert.equal(checkDb.prepare('SELECT note_id FROM anki_links WHERE word_id=1512670').get()?.note_id,9101);
  assert.equal(checkDb.prepare('SELECT note_id FROM anki_links WHERE word_id=1174340').get()?.note_id,9102);
  assert.equal(checkDb.prepare('SELECT note_id FROM anki_links WHERE word_id=1590000').get()?.note_id,9103);
  assert.equal(checkDb.prepare('SELECT spelling,reading FROM vocabulary WHERE id=1015230').get()?.spelling,'アクセス');
 }finally{checkDb.close();}
 const {Reader}=require('../services/reader.cjs');
 const reader=Object.create(Reader.prototype);
 reader.root=root;reader.runtime=runtime;
 const stats=await reader.v4('ankiStats',{linked:[]});
 assert.equal(stats[0].entry?.id,1512670);
 assert.equal(stats[1].entry?.id,1174340);
 assert.equal(stats[2].entry?.id,1590000);
 assert.equal(stats[3].entry,undefined);
 assert.equal(stats[4].entry,undefined);
});
