process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-27 megulit.com user centre, desktop side (services/account.cjs, services/account-auto.cjs) against relay/src/accounts.js
   on a node:sqlite D1 stand-in: favourites, study counts and reading progress upload and change, a failed upload resumes,
   the 「同步到网页」 switch and 「删除云端数据」 work, and no script or novel text ever leaves the PC. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay');
const load=()=>import(pathToFileURL(path.join(relayDir,'src','accounts.js')).href);
const {openStore}=require('../services/store.cjs');
const account=require('../services/account.cjs');
const auto=require('../services/account-auto.cjs');
const saved=require('../services/saved-sentences.cjs');
const readProgress=require('../services/read-progress.cjs');

function d1(){
 const db=new DatabaseSync(':memory:');for(const f of ['0005_accounts.sql','0015_password_login.sql','0042_web_sessions.sql'])db.exec(fs.readFileSync(path.join(relayDir,'migrations',f),'utf8'));
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}});
 return {prepare:sql=>stmt(sql),batch:async list=>{db.exec('BEGIN');try{for(const s of list)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},raw:db};
}
function relay(){
 const mails=[];const env={DB:d1(),HASH_SALT:'salt',RESEND_API_KEY:'re_test',fetch:async(url,init)=>{mails.push(JSON.parse(init.body));return new Response('{"id":"x"}',{status:200});}};
 return {env,lastCode:()=>/(\d{6})/.exec(mails.at(-1).text)[1],rows:kind=>env.DB.raw.prepare('SELECT key,data,deleted FROM sync_records WHERE kind=? ORDER BY key').all(kind).map(r=>({key:r.key,deleted:!!r.deleted,data:r.data?JSON.parse(r.data):null}))};
}
const T0=Date.UTC(2026,10,27,5,37,13);/* not near midnight in any time zone, so one day's events stay on one local day */
/* one desktop: its own data folder, a fetch into the relay that can be switched off, and a log of every request body */
function desktop(t,r,clock){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-websync-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 openStore(root).close();
 const sent=[],state={down:false,calls:0};
 const fetcher=async(url,init)=>{state.calls++;if(state.down)throw new Error('offline');sent.push(String(init?.body||''));const {handleAccounts}=await load();return handleAccounts(new Request(url,init),r.env,new Date(clock.now));};
 const a=new account.Account(root,{env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:fetcher,vault:(action,value)=>value,now:()=>clock.now});
 const run=fn=>{const db=openStore(root);try{return fn(db);}finally{db.close();}};
 return {root,a,run,sent,state,tick:auto.create({account:a,openDb:()=>openStore(root),now:()=>clock.now})};
}
async function signIn(dev,r,email='megumin@example.com'){await dev.a.requestCode(email);return dev.a.verify(email,r.lastCode());}
const ymd=seconds=>{const d=new Date(seconds*1000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const EXE='C:\\Games\\Secret Circle\\SECRETGAME.exe';

function seed(db){
 db.prepare('INSERT INTO games(id,title,executable,last_launched_at) VALUES(?,?,?,?)').run('g1','千恋＊万花',EXE,Math.floor(T0/1000)-3600);
 const t=Math.floor(T0/1000);
 db.prepare('INSERT INTO reading_sessions(game_id,started_at,ended_at,active_seconds,characters,sentences,original) VALUES(?,?,?,?,?,?,?)').run('g1',t-7200,t-3600,1800,4000,300,'{}');
 const word=db.prepare('INSERT INTO vocabulary(spelling,reading,definitions,status,created_at,original) VALUES(?,?,?,?,?,?)').run('気持ち','きもち','["心情"]',1,t-100,'{}').lastInsertRowid;
 db.prepare('INSERT INTO lookup_events(game_id,word_id,surface,occurred_at,operation_id) VALUES(?,?,?,?,?)').run('g1',word,'気持ち',t-90,'op1');
 db.prepare('INSERT INTO lookup_events(game_id,word_id,surface,occurred_at,operation_id) VALUES(?,?,?,?,?)').run('g1',word,'気持ち',t-80,'op2');
 db.prepare('INSERT INTO review_events(word_id,reviewed_at) VALUES(?,?)').run(word,t-70);
 saved.save(db,{text:'この気持ちは、きっと嘘じゃない。',translation:'这份心情，一定不是假的',gameId:'g1'},T0-60000);
}

test('favourites, study counts and reading progress upload; a changed record uploads again; a removed one is deleted',async t=>{
 const r=relay(),clock={now:T0},A=desktop(t,r,clock);
 const real=readProgress.progress;readProgress.progress=()=>({total:200,read:50});t.after(()=>{readProgress.progress=real;});
 A.run(seed);await signIn(A,r);
 const result=await A.a.sync();
 assert.equal(result.summary.progress.pushed,1);assert.ok(result.summary.study.pushed>=1);
 const prog=r.rows('progress');assert.equal(prog.length,1);
 assert.match(prog[0].key,/^[0-9a-f]{12}\|[0-9a-f]{12}$/,'one record per device and work');
 assert.deepEqual(prog[0].data,{game:'千恋＊万花',read:50,total:200,seconds:1800,lastPlayedAt:(Math.floor(T0/1000)-3600)*1000});
 const day=ymd(Math.floor(T0/1000)-80),study=r.rows('study').find(x=>x.key.endsWith('|'+day));
 assert.ok(study,'a record for the day');assert.equal(study.data.lookups,2);assert.equal(study.data.reviews,1);assert.equal(study.data.newWords,1);
 assert.equal(r.rows('sentences').length,1);assert.equal(r.rows('words').length,1);
 assert.equal(result.pending.progress||0,0);
 /* nothing changed → nothing uploaded */
 clock.now+=1000;const again=await A.a.sync();
 assert.equal(again.summary.progress.pushed,0);assert.equal(again.summary.study.pushed,0);
 /* progress moves → the record uploads again; the work leaves the library → the record is deleted */
 readProgress.progress=()=>({total:200,read:80});clock.now+=1000;
 assert.equal((await A.a.sync()).summary.progress.pushed,1);assert.equal(r.rows('progress')[0].data.read,80);
 A.run(db=>db.prepare('UPDATE games SET removed_at=? WHERE id=?').run(1,'g1'));clock.now+=1000;
 await A.a.sync();assert.equal(r.rows('progress')[0].deleted,true);
 /* a sentence deleted on the PC is deleted on the cloud */
 A.run(db=>db.prepare('DELETE FROM saved_sentences').run());clock.now+=1000;await A.a.sync();
 assert.ok(r.rows('sentences').every(x=>x.deleted));
});

test('privacy: no script line, history text, path or exe ever leaves the PC',async t=>{
 const r=relay(),clock={now:T0},A=desktop(t,r,clock);
 const SECRET_LINE='ＳＥＣＲＥＴ台詞：この物語は本編のネタバレである。';
 A.run(db=>{
  seed(db);const now=Math.floor(T0/1000);
  db.prepare('INSERT INTO reading_events(session_id,game_id,text,read_at,original) VALUES(?,?,?,?,?)').run(1,'g1',SECRET_LINE,now-50,'{}');
  db.prepare('UPDATE games SET original=?,cover=? WHERE id=?').run(JSON.stringify({script:SECRET_LINE}),'C:\\Games\\Secret Circle\\cover-secret.png','g1');
 });
 fs.mkdirSync(path.join(A.root,'data','config'),{recursive:true});
 fs.writeFileSync(path.join(A.root,'data','config','original-text.json'),JSON.stringify({g1:{runtime:{lines:[SECRET_LINE]}}}));
 fs.writeFileSync(path.join(A.root,'data','config','game-read-lines.json'),JSON.stringify({entries:{x:[SECRET_LINE]}}));
 fs.writeFileSync(path.join(A.root,'data','config','game-style-profiles.json'),JSON.stringify({version:3,entries:{['a'.repeat(64)]:{name:'千恋＊万花',prefs:{fontSize:20,gamePath:EXE},savedAt:1}}}));
 await signIn(A,r);await A.a.sync();
 const everything=A.sent.join('\n')+JSON.stringify(['progress','study','words','sentences','reading','settings'].map(k=>r.rows(k)));
 for(const secret of [SECRET_LINE,'SECRETGAME','Secret Circle','cover-secret','ネタバレ'])assert.ok(!everything.includes(secret),'leaked: '+secret);
 assert.ok(everything.includes('この気持ちは、きっと嘘じゃない。'),'the favourite sentence the user saved does go up');
 /* the relay itself refuses text in the count-only kinds */
 const res=await A.a.call('PUT','/api/sync/progress',{records:[{key:'k',updated_at:clock.now,data:{game:'G',read:1,text:SECRET_LINE}}]}).catch(e=>e);
 assert.equal(res.code,'INVALID_DATA');
});

test('「同步到网页」 off: nothing is uploaded or pulled; on again: everything is sent again',async t=>{
 const r=relay(),clock={now:T0},A=desktop(t,r,clock);
 A.run(seed);await signIn(A,r);
 assert.equal(A.a.status().webSync,true,'on by default');
 A.a.setWebSync(false);const before=A.state.calls;
 await assert.rejects(()=>A.a.sync(),{code:'SYNC_OFF'});
 assert.equal(A.state.calls,before,'not a single request');assert.equal(r.rows('sentences').length,0);
 assert.equal(await A.tick.tick(),'idle');assert.equal(A.state.calls,before);
 let called=0;
 await account.handle(A.root,{action:'account_status',autoSync:true},{env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:async()=>{called++;throw new Error('offline');},vault:(a,v)=>v,now:()=>clock.now+3600000});
 assert.equal(called,0,'opening the settings page does not start a sync while it is off');
 A.a.setWebSync(true);const result=await A.a.sync();
 assert.equal(result.summary.sentences.pushed,1);assert.equal(r.rows('sentences').length,1);
 /* the choice survives signing out */
 A.a.setWebSync(false);A.a.forget();assert.equal(A.a.profile().webSync,false);
});

test('「删除云端数据」: the cloud copy goes, the account stays, the switch turns off, this PC keeps its data',async t=>{
 const r=relay(),clock={now:T0},A=desktop(t,r,clock);
 A.run(seed);await signIn(A,r);await A.a.sync();
 assert.ok(r.rows('words').length>0);
 const status=await A.a.wipeCloud();
 assert.equal(status.webSync,false);assert.equal(status.loggedIn,true);
 for(const k of ['words','sentences','reading','settings','progress','study'])assert.equal(r.rows(k).length,0,k);
 assert.equal(r.env.DB.raw.prepare('SELECT COUNT(*) n FROM accounts').get().n,1);
 assert.deepEqual(A.a.profile().cursors,{});
 assert.equal(A.run(db=>db.prepare('SELECT COUNT(*) n FROM account_sync').get().n),0);
 assert.equal(A.run(db=>db.prepare('SELECT COUNT(*) n FROM saved_sentences').get().n),1,'local data untouched');
 assert.equal(A.run(db=>db.prepare('SELECT COUNT(*) n FROM vocabulary').get().n),1);
 await assert.rejects(()=>A.a.sync(),{code:'SYNC_OFF'},'no upload until the user turns it on again');
 A.a.setWebSync(true);clock.now+=1000;await A.a.sync();
 assert.equal(r.rows('sentences').length,1,'turning it on uploads everything afresh');
});

test('auto upload: a change waits for quiet, one sync runs, a failed one backs off and resumes (also after a restart)',async t=>{
 const r=relay(),clock={now:T0},A=desktop(t,r,clock);
 A.run(seed);await signIn(A,r);
 assert.equal(await A.tick.tick(),'synced','the first tick after a start syncs a cloud copy that was never made');
 assert.equal(await A.tick.tick(),'clean');
 /* a new favourite */
 A.run(db=>saved.save(db,{text:'二つ目の文。',translation:'第二句',gameId:'g1'},clock.now));
 clock.now+=auto.POLL;assert.equal(await A.tick.tick(),'waiting');assert.equal(r.rows('sentences').length,1);
 clock.now+=auto.DEBOUNCE;assert.equal(await A.tick.tick(),'synced');assert.equal(r.rows('sentences').length,2);
 /* continuous change (reading) still syncs after MAX_WAIT */
 const rows=()=>A.run(db=>db.prepare('UPDATE reading_sessions SET active_seconds=active_seconds+1').run());
 rows();clock.now+=auto.POLL;assert.equal(await A.tick.tick(),'waiting');
 let syncedWhileMoving=false;
 for(let i=0;i<auto.MAX_WAIT/auto.POLL+1&&!syncedWhileMoving;i++){rows();clock.now+=auto.POLL;syncedWhileMoving=(await A.tick.tick())==='synced';}
 assert.ok(syncedWhileMoving,'a reader who never stops still gets synced');
 assert.equal(A.tick.state().failures,0);
 /* the relay is unreachable: the change is queued, the retry waits 30 s */
 A.state.down=true;
 A.run(db=>saved.save(db,{text:'三つ目の文。',translation:'第三句',gameId:'g1'},clock.now));
 clock.now+=auto.POLL;assert.equal(await A.tick.tick(),'waiting');
 clock.now+=auto.DEBOUNCE;assert.equal(await A.tick.tick(),'failed');
 assert.equal(r.rows('sentences').length,2);assert.ok((A.a.status().pending.sentences||0)>=1,'queued for the next try');
 const calls=A.state.calls;clock.now+=auto.POLL;assert.equal(await A.tick.tick(),'backoff');assert.equal(A.state.calls,calls,'no request while backing off');
 clock.now+=auto.BACKOFF[0];assert.equal(await A.tick.tick(),'failed');assert.equal(A.tick.state().failures,2);
 /* the app restarts while the relay is still down, then the relay comes back */
 const restarted=auto.create({account:A.a,openDb:()=>openStore(A.root),now:()=>clock.now});
 A.state.down=false;
 assert.equal(await restarted.tick(),'synced','a restart resumes what was queued');
 assert.equal(r.rows('sentences').length,3);assert.equal(A.a.status().pending.sentences||0,0);
});

test('auto upload stays quiet when signed out, switched off, or the session was refused',async t=>{
 const r=relay(),clock={now:T0},A=desktop(t,r,clock);
 A.run(seed);
 assert.equal(await A.tick.tick(),'idle','not signed in');assert.equal(A.state.calls,0);
 await signIn(A,r);A.a.setWebSync(false);const calls=A.state.calls;
 assert.equal(await A.tick.tick(),'idle');assert.equal(A.state.calls,calls);
 A.a.setWebSync(true);
 /* the server forgot the session: the tick signs out locally and stops, no backoff storm */
 r.env.DB.raw.prepare('DELETE FROM account_sessions').run();
 assert.equal(await A.tick.tick(),'idle');assert.equal(A.a.status().loggedIn,false);
 assert.equal(await A.tick.tick(),'idle');
});

test('the fingerprint moves for favourites, reviews and reading, and holds no text',async t=>{
 const r=relay(),clock={now:T0},A=desktop(t,r,clock);
 const fp=()=>A.run(auto.fingerprint);
 const base=fp();A.run(seed);const seeded=fp();assert.notEqual(seeded,base);
 A.run(db=>saved.save(db,{text:'もう一文',translation:'',gameId:'g1'},1));assert.notEqual(fp(),seeded);
 const again=fp();A.run(db=>db.prepare('UPDATE vocabulary SET status=3').run());assert.notEqual(fp(),again);
 assert.match(seeded,/^[0-9:|]+$/,'counts and ids only');
});
