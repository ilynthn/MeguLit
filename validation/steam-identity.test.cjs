// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Library,Synopses,steamAppidFor}=require('../core/library.cjs');
const store=require('../services/store.cjs'),{reconcile}=require('../services/library.cjs');
const {GameEnrichment}=require('../services/game-enrichment.cjs');
const APPID='5105090';
const VN={id:'v1',title:'ECHO',titles:[],description:'The unrelated visual novel.',developers:[]};

function fixture(t,{engine='',previous=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-steam-identity-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const config=path.join(root,'data/config'),steam=path.join(root,'Steam');
 const apps=path.join(steam,'steamapps'),dir=path.join(apps,'common','ECHO'),exe=path.join(dir,'ECHO.exe');
 fs.mkdirSync(config,{recursive:true});fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(exe,Buffer.alloc(22000));
 if(engine==='Unity')fs.writeFileSync(path.join(dir,'UnityPlayer.dll'),'');
 if(engine==='KiriKiri')fs.writeFileSync(path.join(dir,'data.xp3'),'');
 fs.writeFileSync(path.join(apps,'appmanifest_'+APPID+'.acf'),'"AppState" { "appid" "'+APPID+'" "name" "ECHO" "installdir" "ECHO" }');
 const old={key:'echo',source:'steam',appid:APPID,title:'ECHO',names:['ECHO'],dir,exe,vndbId:'v1',engine};
 fs.writeFileSync(path.join(config,'library.json'),JSON.stringify({steamPath:steam,games:previous?[old]:[],scanVersion:4}));
 return {root,config,dir,exe,old,library:new Library({root,config})};
}

function network(t,{linked=false,offline=false}={}){
 const calls=[];
 const fetcher=async(url,options={})=>{
  url=String(url);const body=JSON.parse(options.body||'{}');calls.push({url,body});
  if(offline)throw Error('offline');
  if(url.endsWith('/kana/release'))return Response.json({results:linked?[{vns:[VN]}]:[]});
  if(url.endsWith('/kana/vn'))return Response.json({results:[VN]});
  return new Response('',{status:404});
 };
 t.mock.method(globalThis,'fetch',fetcher);
 return {fetcher,calls};
}

for(const engine of ['', 'Unity'])test('Steam title collision does not import an application with '+(engine||'no engine'),async t=>{
 const {library}=fixture(t,{engine});network(t);
 assert.deepEqual(await library.scan(),[]);
});

test('an exact Steam AppID match is recorded and remains available offline',async t=>{
 const {library}=fixture(t);network(t,{linked:true});
 const [game]=await library.scan();
 assert.equal(game.vndbId,'v1');assert.equal(game.vndbSteamAppid,APPID);
 network(t,{offline:true});
 const [offline]=await library.scan();
 assert.equal(offline.vndbId,'v1');assert.notEqual(offline.missing,true);
});

test('an explicit visual-novel engine can be imported without linking a same-name VNDB work',async t=>{
 const {library}=fixture(t,{engine:'KiriKiri'});network(t);
 const [game]=await library.scan();
 assert.equal(game.engine,'KiriKiri');assert.equal(game.vndbId,null);
});

test('an unavailable AppID lookup is retried on the next scan',async t=>{
 const {library,dir}=fixture(t);network(t,{offline:true});
 assert.deepEqual(await library.scan(),[]);
 assert.equal(library.state.notGal[dir.toLowerCase()],undefined);
 network(t,{linked:true});
 assert.equal((await library.scan())[0].vndbId,'v1');
});

test('an explicit engine retries AppID verification after an offline startup',async t=>{
 const {library}=fixture(t,{engine:'KiriKiri'});network(t,{offline:true});
 assert.equal((await library.scan())[0].vndbId,null);
 network(t,{linked:true});
 const [game]=await library.scan(()=>{},{incremental:true});
 assert.equal(game.vndbId,'v1');
});

test('a corrected Steam identity replaces an automatic cover and preserves a custom cover',t=>{
 const f=fixture(t);reconcile(f.root,[{...f.old,cover:'old.png'}]);
 reconcile(f.root,[{...f.old,vndbId:'v2',vndbSteamAppid:APPID,cover:'new.png'}]);
 let db=store.openStore(f.root),row=db.prepare('SELECT * FROM games').get();
 assert.equal(row.cover,'new.png');
 const original=JSON.parse(row.original);original.coverCustom=true;
 db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),row.id);db.close();
 reconcile(f.root,[{...f.old,vndbSteamAppid:APPID,cover:'other.png'}]);
 db=store.openStore(f.root);try{assert.equal(db.prepare('SELECT cover FROM games').get().cover,'new.png');}finally{db.close();}
});

test('an automatic scan preserves the cover of a manually selected VNDB work',t=>{
 const f=fixture(t);reconcile(f.root,[{...f.old,vndbId:'v2',cover:'manual-v2.png'}]);
 let db=store.openStore(f.root),row=db.prepare('SELECT * FROM games').get();
 const original=JSON.parse(row.original);original.vndbManual='v2';
 db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),row.id);db.close();
 reconcile(f.root,[{...f.old,vndbSteamAppid:APPID,cover:'steam-v1.png'}]);
 db=store.openStore(f.root);try{assert.equal(db.prepare('SELECT cover FROM games').get().cover,'manual-v2.png');}finally{db.close();}
});

test('startup rechecks old name matches and removes confirmed false positives without deleting history',async t=>{
 const f=fixture(t,{previous:true});network(t);
 reconcile(f.root,[f.old]);
 let db=store.openStore(f.root);
 const id=db.prepare('SELECT id FROM games').get().id;
 db.prepare('INSERT INTO reading_sessions(game_id,started_at,active_seconds) VALUES(?,?,?)').run(id,1,77);db.close();
 const scanned=await f.library.scan(()=>{},{incremental:true});
 reconcile(f.root,scanned,{restoreRemoved:true});
 db=store.openStore(f.root);
 try{
  assert.equal(store.games(db,f.root).length,0);
  assert.equal(db.prepare('SELECT active_seconds FROM reading_sessions WHERE game_id=?').get(id).active_seconds,77);
  assert.equal(JSON.parse(db.prepare('SELECT original FROM games WHERE id=?').get(id).original).library.vndbId,null);
 }finally{db.close();}
 reconcile(f.root,f.library.load().games,{restoreRemoved:true});
 db=store.openStore(f.root);try{assert.equal(store.games(db,f.root).length,0);}finally{db.close();}
});

test('an old unverified AppID match stays retryable while the network is offline',async t=>{
 const {library}=fixture(t,{previous:true});network(t,{offline:true});
 await library.scan(()=>{},{incremental:true});
 network(t);
 const scanned=await library.scan(()=>{},{incremental:true});
 assert.equal(scanned[0].steamRejected,true);
});

test('an explicit manual VNDB selection survives rejection by the automatic scanner',async t=>{
 const f=fixture(t,{previous:true});network(t);reconcile(f.root,[f.old]);
 let db=store.openStore(f.root);const row=db.prepare('SELECT * FROM games').get();
 const original=JSON.parse(row.original);original.vndbManual='v2';
 db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),row.id);db.close();
 reconcile(f.root,await f.library.scan(()=>{},{incremental:true}));
 db=store.openStore(f.root);
 try{assert.equal(store.games(db,f.root)[0].vndbId,'v2');}finally{db.close();}
});

test('a manual game remains visible when the automatic scanner rejects that application',t=>{
 const f=fixture(t);reconcile(f.root,[{...f.old,source:'manual'}]);
 reconcile(f.root,[{...f.old,steamRejected:true,vndbId:null}]);
 const db=store.openStore(f.root);
 try{assert.equal(store.games(db,f.root).length,1);assert.equal(store.games(db,f.root)[0].source,'manual');}finally{db.close();}
});

test('a successful automatic scan preserves a manually added game for later scans',t=>{
 const f=fixture(t);reconcile(f.root,[{...f.old,source:'manual'}]);
 reconcile(f.root,[{...f.old,vndbSteamAppid:APPID}]);
 reconcile(f.root,[{...f.old,steamRejected:true,vndbId:null}]);
 const db=store.openStore(f.root);
 try{assert.equal(store.games(db,f.root).length,1);assert.equal(store.games(db,f.root)[0].source,'manual');}finally{db.close();}
});

test('manually adding a rejected Steam installation survives later automatic scans',async t=>{
 const f=fixture(t,{previous:true});network(t);reconcile(f.root,[f.old]);
 const rejected=await f.library.scan(()=>{},{incremental:true});reconcile(f.root,rejected);
 const previousRoot=process.env.MEGULIT_ROOT,bridgePath=require.resolve('../services/bridge.cjs');
 process.env.MEGULIT_ROOT=f.root;delete require.cache[bridgePath];
 t.after(()=>{if(previousRoot===undefined)delete process.env.MEGULIT_ROOT;else process.env.MEGULIT_ROOT=previousRoot;delete require.cache[bridgePath];});
 const {dispatch}=require(bridgePath);
 await dispatch({action:'save_game',title:'My game',executable:f.exe});
 reconcile(f.root,rejected,{restoreRemoved:true});
 const db=store.openStore(f.root);
 try{assert.equal(store.games(db,f.root).length,1);assert.equal(store.games(db,f.root)[0].source,'manual');}finally{db.close();}
});

test('a Steam application also named in folder settings cannot bypass AppID verification',async t=>{
 const f=fixture(t);network(t);f.library.state.folders=[path.dirname(f.dir)];
 assert.deepEqual(await f.library.scan(),[]);
});

test('a Steam installation scanned only through folder settings still uses its manifest AppID',async t=>{
 const f=fixture(t);network(t);
 f.library.state.steamPath='';f.library.state.folders=[path.dirname(f.dir)];
 assert.deepEqual(await f.library.scan(),[]);
});

test('manifest lookup recognizes an application installed after its cache was populated',t=>{
 const f=fixture(t),apps=path.dirname(path.dirname(f.dir));
 const manifest=path.join(apps,'appmanifest_'+APPID+'.acf'),content=fs.readFileSync(manifest);
 fs.unlinkSync(manifest);
 fs.writeFileSync(path.join(apps,'appmanifest_111.acf'),'"AppState" { "appid" "111" "installdir" "Other" }');
 assert.equal(steamAppidFor(path.join(path.dirname(f.dir),'Other','Other.exe')),'111');
 fs.writeFileSync(manifest,content);
 assert.equal(steamAppidFor(f.exe),APPID);
});

test('metadata clears an old name match instead of restoring same-name VNDB data',async t=>{
 const f=fixture(t);const {fetcher}=network(t);reconcile(f.root,[f.old]);
 let db=store.openStore(f.root);const id=db.prepare('SELECT id FROM games').get().id;db.close();
 const manager=new GameEnrichment(f.root,()=>{},fetcher,async()=>'');
 const result=await manager.run(id,'en',true);
 assert.equal(result.info.vndbId,'');assert.equal(result.reception.vndb,null);
 assert.equal(result.synopsis.text,'');
 db=store.openStore(f.root);
 try{assert.equal(JSON.parse(db.prepare('SELECT original FROM games WHERE id=?').get(id).original).library.vndbId,null);}finally{db.close();}
});

test('an unverified cached synopsis does not bypass Steam identity verification',async t=>{
 const f=fixture(t);const {fetcher}=network(t);reconcile(f.root,[f.old]);
 let db=store.openStore(f.root);const id=db.prepare('SELECT id FROM games').get().id;db.close();
 fs.writeFileSync(path.join(f.config,'synopsis.json'),JSON.stringify({[id]:{at:Date.now(),policy:2,en:'Wrong novel.',src:{en:'VNDB'}}}));
 const manager=new GameEnrichment(f.root,()=>{},fetcher,async()=>'');
 const result=await manager.run(id,'en',false);
 assert.equal(result.synopsis.text,'');assert.equal(result.reception.vndb,null);
});

test('a newly verified AppID does not reuse metadata cached for a different VNDB work',async t=>{
 const f=fixture(t);const {fetcher}=network(t,{linked:true});
 reconcile(f.root,[{...f.old,vndbSteamAppid:APPID}]);
 let db=store.openStore(f.root);const id=db.prepare('SELECT id FROM games').get().id;
 const covers=path.join(f.root,'data/assets/covers');fs.mkdirSync(covers,{recursive:true});fs.writeFileSync(path.join(covers,'old.png'),'fixture');
 db.prepare('UPDATE games SET cover=? WHERE id=?').run('old.png',id);db.close();
 fs.writeFileSync(path.join(f.config,'game-reception.json'),JSON.stringify({[id]:{at:Date.now(),synopsisPolicy:2,vndb:{url:'https://vndb.org/v9'},synopses:{en:{text:'Wrong novel.',source:'VNDB'}}}}));
 const result=await new GameEnrichment(f.root,()=>{},fetcher,async()=>'').run(id,'en',false);
 assert.equal(result.reception.vndb.url,'https://vndb.org/v1');
 assert.notEqual(result.synopsis.text,'Wrong novel.');
});

test('verified metadata and synopsis remain available during an offline refresh',async t=>{
 const f=fixture(t);let connected=network(t,{linked:true});reconcile(f.root,[f.old]);
 const db=store.openStore(f.root),id=db.prepare('SELECT id FROM games').get().id;db.close();
 const first=await new GameEnrichment(f.root,()=>{},connected.fetcher,async()=>'').run(id,'en',true);
 connected=network(t,{offline:true});
 const offline=await new GameEnrichment(f.root,()=>{},connected.fetcher,async()=>'').run(id,'en',true);
 assert.equal(offline.reception.vndb.url,first.reception.vndb.url);
 assert.equal(offline.synopsis.text,first.synopsis.text);
 assert.notEqual(offline.synopsis.text,'');
});

test('a Steam synopsis without a VNDB identity cannot resolve a work by name',async t=>{
 const f=fixture(t);const synopsis=new Synopses({config:f.config},{lookup:async(id,titles)=>id||titles.length?{text:'Wrong novel.'}:null,translate:async()=>''});
 const result=await synopsis.get({mediaId:'echo',appid:APPID,titles:['ECHO'],vndbId:'',lang:'en'});
 assert.equal(result.text,'');
});

test('opening and refreshing Steam details cannot expose unverified cached VNDB data',async t=>{
 const f=fixture(t);network(t);reconcile(f.root,[f.old]);
 const db=store.openStore(f.root),id=db.prepare('SELECT id FROM games').get().id;
 try{
  fs.writeFileSync(path.join(f.config,'synopsis.json'),JSON.stringify({[id]:{at:Date.now(),policy:2,en:'Wrong novel.',src:{en:'VNDB'}}}));
  fs.writeFileSync(path.join(f.config,'game-reception.json'),JSON.stringify({[id]:{vndb:{url:'https://vndb.org/v1'},reviews:{en:[]}}}));
  const {detail,refreshSynopsis}=require('../services/game-detail.cjs');
  const before=detail(db,f.root,id,'en');
  assert.equal(before.synopsis.text,'');assert.equal(before.reception?.vndb??null,null);
  assert.equal((await refreshSynopsis(db,f.root,id,'en')).text,'');
 }finally{db.close();}
});

test('VNDB reviews for an unlinked Steam application do not use a same-name work',async t=>{
 const f=fixture(t);const {fetcher}=network(t);reconcile(f.root,[f.old]);
 const db=store.openStore(f.root),id=db.prepare('SELECT id FROM games').get().id;db.close();
 const {GameReviews}=require('../services/game-reviews.cjs');
 const reviews=new GameReviews(f.root,fetcher);
 assert.equal(await reviews.identity(reviews.game(id),'vndb'),null);
});

test('reviews discover the Steam AppID of a manually added executable',async t=>{
 const f=fixture(t);const {fetcher}=network(t);
 reconcile(f.root,[{title:'ECHO',exe:f.exe,source:'manual',dir:f.dir}]);
 const db=store.openStore(f.root),id=db.prepare('SELECT id FROM games').get().id;db.close();
 const {GameReviews}=require('../services/game-reviews.cjs');
 const reviews=new GameReviews(f.root,fetcher);
 assert.equal(await reviews.identity(reviews.game(id),'vndb'),null);
});
