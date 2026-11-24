process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* E378 accounts + cloud sync: relay/src/accounts.js on a node:sqlite D1 stand-in, services/account.cjs against it. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay');
const load=()=>import(pathToFileURL(path.join(relayDir,'src','accounts.js')).href);
const MIGRATION=fs.readFileSync(path.join(relayDir,'migrations','0005_accounts.sql'),'utf8');
function d1(){
 const db=new DatabaseSync(':memory:');db.exec(MIGRATION);
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}});
 return {prepare:sql=>stmt(sql),batch:async list=>{db.exec('BEGIN');try{for(const s of list)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},raw:db};
}
/* relay env whose Resend call is captured instead of sent */
function relay(extra={}){
 const mails=[];const env={DB:d1(),HASH_SALT:'salt',RESEND_API_KEY:'re_test',fetch:async(url,init)=>{mails.push({url,body:JSON.parse(init.body),auth:init.headers.authorization});return new Response('{"id":"x"}',{status:200});},...extra};
 return {env,mails,lastCode:()=>/(\d{6})/.exec(mails.at(-1).body.text)[1]};
}
const T0=new Date('2026-11-10T04:00:00Z');
const req=(method,url,data,headers={})=>new Request('https://relay.test'+url,{method,headers:{'cf-connecting-ip':'198.51.100.7',...(data!==undefined?{'content-type':'application/json'}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
async function login(handle,r,email='Megumin@Example.com',now=T0,ip='198.51.100.7'){
 assert.equal((await handle(req('POST','/api/auth/code',{email},{'cf-connecting-ip':ip}),r.env,now)).status,200);
 const res=await handle(req('POST','/api/auth/verify',{email,code:r.lastCode(),device:'PC <b>1</b>'},{'cf-connecting-ip':ip}),r.env,now);
 assert.equal(res.status,200);return res.json();
}

test('pure helpers: email, code generation, code hashing, expiry and tries, rate windows, last-writer-wins',async()=>{
 const a=await load();
 assert.equal(a.normalizeEmail('  Megumin@Example.COM '),'megumin@example.com');
 for(const bad of ['','a@b','no-at.example.com','a b@example.com','x@-bad.com','<x>@example.com',`${'a'.repeat(65)}@example.com`,42])assert.equal(a.normalizeEmail(bad),'',String(bad));
 /* rejection sampling: values at or above the last full million are re-drawn */
 const draws=[0xffffffff,1234567];const code=a.generateCode(arr=>{arr[0]=draws.shift();return arr;});
 assert.equal(code,'234567');assert.equal(draws.length,0);
 assert.match(a.generateCode(),/^\d{6}$/);assert.equal(a.generateCode(arr=>{arr[0]=42;return arr;}),'000042');
 const h1=await a.hashCode('pepper','x@example.com','123456');
 assert.match(h1,/^[0-9a-f]{64}$/);assert.equal(h1,await a.hashCode('pepper','x@example.com','123456'));
 assert.notEqual(h1,await a.hashCode('pepper','y@example.com','123456'));assert.notEqual(h1,await a.hashCode('other','x@example.com','123456'));
 assert.ok(!h1.includes('123456'));
 const row={code_hash:h1,expires_at:1000,tries:0};
 assert.deepEqual(a.checkCode(row,h1,999),{ok:true});
 assert.equal(a.checkCode(row,h1,1000).error,'CODE_EXPIRED');
 assert.equal(a.checkCode(null,h1,1).error,'NO_CODE');
 assert.deepEqual(a.checkCode(row,'0'.repeat(64),999),{ok:false,error:'WRONG_CODE',triesLeft:4});
 assert.equal(a.checkCode({...row,tries:4},'0'.repeat(64),999).triesLeft,0);
 assert.equal(a.checkCode({...row,tries:5},h1,999).error,'TOO_MANY_TRIES','even the right code fails after 5 wrong tries');
 const w1=a.rateWindow('code-email-gap','k',60000),w2=a.rateWindow('code-email-gap','k',119999),w3=a.rateWindow('code-email-gap','k',120000);
 assert.equal(w1.bucket,w2.bucket);assert.notEqual(w2.bucket,w3.bucket);assert.equal(w1.limit,1);assert.equal(w1.resetAt,120);
 const older={key:'k',updated_at:1,data:{v:1}},newer={key:'k',updated_at:2,data:{v:0}},tomb={key:'k',updated_at:2,deleted:true,data:null};
 assert.equal(a.newerRecord(older,newer),newer);assert.equal(a.newerRecord(newer,older),newer);
 assert.equal(a.newerRecord(newer,tomb),tomb);assert.equal(a.newerRecord(tomb,newer),tomb);
 const x={updated_at:5,data:{v:'a'}},y={updated_at:5,data:{v:'b'}};assert.equal(a.newerRecord(x,y),a.newerRecord(y,x),'ties resolve the same on every replica');
 const client=require('../services/account.cjs');
 for(const [p,q] of [[older,newer],[newer,tomb],[x,y]])assert.equal(client.newerRecord(p,q),a.newerRecord(p,q),'client and server agree');
 assert.equal(a.validateRecord('words',{key:'k',updated_at:Date.UTC(2019,0,1),data:{}},T0.getTime()).error,'INVALID_UPDATED_AT');
 assert.equal(a.validateRecord('reading',{key:'k',updated_at:T0.getTime(),data:{x:'y'.repeat(2000)}},T0.getTime()).error,'RECORD_TOO_LARGE');
 const mail=a.codeEmail('123456');assert.match(mail.text,/验证码/);assert.match(mail.text,/sign-in code/);assert.doesNotMatch(mail.html,/<a |<img|https?:/i,'no links, images or trackers');
});

test('login: code mail, verify, wrong tries, expiry, rate limits, missing mail key',async()=>{
 const {handleAccounts}=await load(),r=relay();
 assert.equal(await handleAccounts(req('GET','/api/leaderboard'),r.env,T0),null,'other paths are left to the router');
 assert.equal((await (await handleAccounts(req('POST','/api/auth/code',{email:'nope'}),r.env,T0)).json()).error,'EMAIL_INVALID');
 const none=relay({RESEND_API_KEY:''});assert.equal((await handleAccounts(req('POST','/api/auth/code',{email:'a@example.com'}),none.env,T0)).status,503);
 assert.equal((await handleAccounts(req('POST','/api/auth/code',{email:'a@example.com'}),r.env,T0)).status,200);
 assert.equal(r.mails[0].url,'https://api.resend.com/emails');assert.equal(r.mails[0].body.from,'MeguLit <mail@megulit.com>');assert.deepEqual(r.mails[0].body.to,['a@example.com']);assert.equal(r.mails[0].auth,'Bearer re_test');
 const stored=r.env.DB.raw.prepare('SELECT * FROM auth_codes').all();assert.equal(stored.length,1);
 assert.ok(!JSON.stringify(stored).includes(r.lastCode())&&!JSON.stringify(stored).includes('a@example.com'),'only hashes are stored');
 /* one code a minute per email */
 assert.equal((await handleAccounts(req('POST','/api/auth/code',{email:'A@example.com'}),r.env,new Date(T0.getTime()+5000))).status,429);
 const code=r.lastCode(),wrong=code==='000000'?'111111':'000000',later=s=>new Date(T0.getTime()+s*1000);
 for(let i=0;i<5;i++){const body=await (await handleAccounts(req('POST','/api/auth/verify',{email:'a@example.com',code:wrong}),r.env,later(10))).json();assert.equal(body.error,'WRONG_CODE');assert.equal(body.triesLeft,4-i);}
 assert.equal((await (await handleAccounts(req('POST','/api/auth/verify',{email:'a@example.com',code}),r.env,later(10))).json()).error,'TOO_MANY_TRIES');
 /* a fresh code expires after 10 minutes */
 await handleAccounts(req('POST','/api/auth/code',{email:'a@example.com'}),r.env,later(70));
 assert.equal((await (await handleAccounts(req('POST','/api/auth/verify',{email:'a@example.com',code:r.lastCode()}),r.env,later(70+601))).json()).error,'CODE_EXPIRED');
 await handleAccounts(req('POST','/api/auth/code',{email:'a@example.com'}),r.env,later(800));
 const ok=await (await handleAccounts(req('POST','/api/auth/verify',{email:' A@Example.com',code:r.lastCode(),device:'Win'}),r.env,later(830))).json();
 assert.equal(ok.ok,true);assert.match(ok.token,/^mgl_[A-Za-z0-9_-]{43}$/);assert.match(ok.accountId,/^[0-9a-f-]{36}$/);assert.equal(ok.email,'a@example.com');
 assert.equal((await (await handleAccounts(req('POST','/api/auth/verify',{email:'a@example.com',code:r.lastCode()}),r.env,later(840))).json()).error,'NO_CODE','a code works once');
 assert.equal(r.env.DB.raw.prepare('SELECT COUNT(*) n FROM account_sessions WHERE token_hash=?').get(ok.token).n,0,'token stored hashed');
 /* 5 codes an hour per email: the 4th and 5th succeed (minutes apart), the 6th is refused */
 await handleAccounts(req('POST','/api/auth/code',{email:'a@example.com'}),r.env,later(900));
 await handleAccounts(req('POST','/api/auth/code',{email:'a@example.com'}),r.env,later(1000));
 assert.equal((await handleAccounts(req('POST','/api/auth/code',{email:'a@example.com'}),r.env,later(1100))).status,429);
});

test('sessions: /api/me, daily rotation with grace, device revoke, logout, account deletion',async()=>{
 const {handleAccounts}=await load(),r=relay(),a=await login(handleAccounts,r),auth=t=>({authorization:'Bearer '+t});
 const me=await (await handleAccounts(req('GET','/api/me',undefined,auth(a.token)),r.env,T0)).json();
 assert.equal(me.accountId,a.accountId);assert.equal(me.email,'megumin@example.com');assert.equal(me.devices.length,1);assert.equal(me.devices[0].device,'PC b1/b','device label is cleaned');assert.ok(me.devices[0].current);
 assert.equal((await handleAccounts(req('GET','/api/me',undefined,auth('mgl_'+'x'.repeat(43))),r.env,T0)).status,401);
 assert.equal((await handleAccounts(req('GET','/api/me'),r.env,T0)).status,401);
 /* a day later the token rotates; the old one still works for a day, then stops */
 const day=new Date(T0.getTime()+86400e3+1000),res=await handleAccounts(req('GET','/api/me',undefined,auth(a.token)),r.env,day),fresh=res.headers.get('x-megulit-token');
 assert.match(fresh,/^mgl_/);assert.notEqual(fresh,a.token);
 assert.equal((await handleAccounts(req('GET','/api/me',undefined,auth(a.token)),r.env,new Date(day.getTime()+3600e3))).status,200);
 /* 2026-11-12 the previous token keeps working 30 days (a rotation an answer did not carry was lost) */
 assert.equal((await handleAccounts(req('GET','/api/me',undefined,auth(a.token)),r.env,new Date(day.getTime()+29*86400e3))).status,200);
 assert.equal((await handleAccounts(req('GET','/api/me',undefined,auth(a.token)),r.env,new Date(day.getTime()+30*86400e3+1000))).status,401);
 assert.equal((await handleAccounts(req('GET','/api/me',undefined,auth(fresh)),r.env,new Date(day.getTime()+86401e3))).status,200);
 /* sessions expire after 180 idle days */
 assert.equal((await handleAccounts(req('GET','/api/me',undefined,auth(fresh)),r.env,new Date(day.getTime()+86401e3+181*86400e3))).status,401);
 /* second device, revoked from the first; then the first logs out */
 const t1=new Date(T0.getTime()+120e3),b=await login(handleAccounts,r,'megumin@example.com',t1,'203.0.113.5');
 assert.equal(b.accountId,a.accountId,'same email → same account');
 const c=await login(handleAccounts,r,'megumin@example.com',new Date(T0.getTime()+240e3),'203.0.113.6');
 assert.equal((await (await handleAccounts(req('POST','/api/auth/logout',{sessionId:b.sessionId},auth(c.token)),r.env,t1)).json()).revoked,b.sessionId);
 assert.equal((await handleAccounts(req('GET','/api/me',undefined,auth(b.token)),r.env,t1)).status,401);
 await handleAccounts(req('PUT','/api/sync/words',{records:[{key:'k',updated_at:T0.getTime(),data:{a:1}}]},auth(c.token)),r.env,t1);
 assert.equal((await handleAccounts(req('POST','/api/auth/logout',undefined,auth(c.token)),r.env,t1)).status,200);
 assert.equal((await handleAccounts(req('GET','/api/me',undefined,auth(c.token)),r.env,t1)).status,401);
 const d=await login(handleAccounts,r,'megumin@example.com',new Date(T0.getTime()+400e3),'203.0.113.7');
 assert.equal((await handleAccounts(req('DELETE','/api/me',undefined,auth(d.token)),r.env,t1)).status,200);
 for(const table of ['accounts','account_sessions','sync_records','auth_codes'])assert.equal(r.env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0,table);
});

test('sync endpoints: incremental pulls by since, last-writer-wins, tombstones, caps',async()=>{
 const {handleAccounts,KIND_CAP}=await load(),r=relay(),a=await login(handleAccounts,r),h={authorization:'Bearer '+a.token},at=T0.getTime();
 const put=(kind,records)=>handleAccounts(req('PUT','/api/sync/'+kind,{records},h),r.env,T0).then(x=>x.json());
 const get=(kind,since=0)=>handleAccounts(req('GET',`/api/sync/${kind}?since=${since}`,undefined,h),r.env,T0).then(x=>x.json());
 assert.equal((await handleAccounts(req('GET','/api/sync/paths',undefined,h),r.env,T0)).status,404);
 const p0=await handleAccounts(req('PUT','/api/sync/words',{records:[]},h),r.env,T0);assert.equal(p0.status,200,await p0.clone().text());
 const p1=await put('words',[{key:'猫\tねこ',updated_at:at,data:{v:1}},{key:'犬\tいぬ',updated_at:at,data:{v:1}}]);assert.equal(p1.accepted,2);
 const g1=await get('words');assert.equal(g1.records.length,2);assert.equal(g1.more,false);
 const p2=await put('words',[{key:'猫\tねこ',updated_at:at-1,data:{v:0}},{key:'犬\tいぬ',updated_at:at+5,deleted:true}]);
 assert.equal(p2.accepted,1);assert.deepEqual(p2.newer.map(x=>[x.key,x.data]),[['猫\tねこ',{v:1}]],'the older write loses and the server copy comes back');
 const g2=await get('words',g1.cursor);assert.deepEqual(g2.records,[{key:'犬\tいぬ',updated_at:at+5,deleted:true,data:null}],'only what changed since the cursor');
 assert.equal((await get('words',g2.cursor)).records.length,0);
 assert.equal((await get('sentences')).records.length,0,'kinds are separate');
 assert.equal((await handleAccounts(req('PUT','/api/sync/reading',{records:[{key:'x',updated_at:at,data:{s:'y'.repeat(2000)}}]},h),r.env,T0)).status,413);
 assert.equal((await handleAccounts(req('PUT','/api/sync/words',{records:Array.from({length:501},(_,i)=>({key:'k'+i,updated_at:at,data:{}}))},h),r.env,T0)).status,400);
 /* quota per kind */
 const big='z'.repeat(30000),n=Math.ceil(KIND_CAP.settings/30000)+1,res=await handleAccounts(req('PUT','/api/sync/settings',{records:Array.from({length:n},(_,i)=>({key:'p'+i,updated_at:at,data:{big}}))},h),r.env,T0);
 assert.equal(res.status,413);assert.equal((await res.json()).error,'SYNC_QUOTA_EXCEEDED');
});

/* ---- client ------------------------------------------------------------------------------------------------- */
const {openStore}=require('../services/store.cjs');
const account=require('../services/account.cjs');
function device(t,r,clock){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-account-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const db=openStore(root);db.close();
 const fetcher=async(url,init)=>{const {handleAccounts}=await load();return handleAccounts(new Request(url,init),r.env,new Date(clock.now));};
 const a=new account.Account(root,{env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:fetcher,vault:(action,value)=>value,now:()=>clock.now});
 const run=fn=>{const db=openStore(root);try{return fn(db);}finally{db.close();}};
 return {root,a,run};
}
async function signIn(dev,r,email='megumin@example.com'){await dev.a.requestCode(email);return dev.a.verify(email,r.lastCode());}

test('client sync uploads a long bilingual saved sentence with the other pending sentences',async t=>{
 const r=relay(),clock={now:T0.getTime()},A=device(t,r,clock),B=device(t,r,clock);
 const text='読'.repeat(3000),translation='读'.repeat(3000);
 A.run(db=>{
  const {save}=require('../services/saved-sentences.cjs');
  save(db,{text,translation},1000);
  save(db,{text:'短い文',translation:'短句'},2000);
 });
 await signIn(A,r);clock.now+=61000;await signIn(B,r);
 const result=await A.a.sync();
 assert.equal(result.summary.sentences.pushed,2);
 assert.equal(result.pending.sentences||0,0);
 await B.a.sync();
 const rows=B.run(db=>db.prepare('SELECT text,translation FROM saved_sentences ORDER BY created_at').all());
 assert.deepEqual(rows.map(row=>[row.text,row.translation]),[[text,translation],['短い文','短句']]);
});

test('raising the cap never admits a truncated migrated sentence under the original text key',async t=>{
 const r=relay(),clock={now:T0.getTime()},A=device(t,r,clock),B=device(t,r,clock);
 const text='読'.repeat(3001);
 A.run(db=>db.prepare("INSERT INTO saved_sentences(text,created_at,original) VALUES(?,1,'{}')").run(text));
 await signIn(A,r);clock.now+=61000;await signIn(B,r);
 // Older clients clipped the payload after deriving the key from the complete text.
 const transport=A.a.fetcher;
 A.a.fetcher=(url,init)=>{
  if(init.method==='PUT'&&url.endsWith('/sync/sentences')){
   const payload=JSON.parse(init.body);
   for(const record of payload.records)record.data.text=record.data.text.slice(0,3000);
   init={...init,body:JSON.stringify(payload)};
  }
  return transport(url,init);
 };
 await assert.rejects(A.a.sync(),{code:'RECORD_TOO_LARGE'});
 assert.equal(A.a.status().pending.sentences,1);
 assert.equal(A.run(db=>db.prepare('SELECT text FROM saved_sentences').get().text),text);
 await B.a.sync();
 assert.equal(B.run(db=>db.prepare('SELECT COUNT(*) AS n FROM saved_sentences').get().n),0);
});

test('the relay bounds the size of each serialized sentence in bytes',async()=>{
 const {validateRecord,RECORD_CAP}=await load(),updated_at=T0.getTime();
 assert.deepEqual(account.RECORD_CAP,RECORD_CAP);
 const body=length=>({key:'s:a',updated_at,data:{text:'x'.repeat(length-Buffer.byteLength('{"text":""}'))}});
 assert.equal(validateRecord('sentences',body(40*1024),updated_at).error,undefined);
 assert.equal(validateRecord('sentences',body(40*1024+1),updated_at).error,'RECORD_TOO_LARGE');
});

test('the larger-record safeguard keeps existing sync keys and rejects missing original text',async()=>{
 const {handleAccounts,sha256}=await load(),r=relay(),a=await login(handleAccounts,r),updated_at=T0.getTime();
 const send=(kind,key,data)=>handleAccounts(req('PUT','/api/sync/'+kind,{records:[{key,updated_at,data}]},
  {authorization:'Bearer '+a.token}),r.env,T0);
 const key='s:'+(await sha256('undefined')).slice(0,32),translation='読'.repeat(3000);
 assert.equal((await send('sentences',key,{text:'legacy'})).status,200,'small legacy records keep their previous behavior');
 assert.equal((await send('sentences','legacy-key',{text:'legacy',translation})).status,200,'older opaque keys are not content hashes');
 assert.equal((await send('words',key,{definition:translation})).status,200,'the rule only applies to saved sentences');
 assert.equal((await send('sentences',key,{translation})).status,413,'a matching hash of undefined cannot stand in for original text');
});

test('client: not configured / logged out stays local; login keeps the token in the vault file, not in profile.json',async t=>{
 const r=relay(),clock={now:T0.getTime()},dev=device(t,r,clock);
 const plain=new account.Account(dev.root,{env:{MEGULIT_RELAY_BASE:'off'},vault:(a,v)=>v});
 const s0=plain.status();assert.equal(s0.configured,false);assert.equal(s0.loggedIn,false);
 await assert.rejects(()=>plain.requestCode('a@example.com'),/RELAY_NOT_CONFIGURED/);
 await assert.rejects(()=>dev.a.sync(),/NOT_LOGGED_IN/);
 const s=await signIn(dev,r);assert.equal(s.loggedIn,true);assert.equal(s.email,'megumin@example.com');assert.match(s.accountId,/^[0-9a-f-]{36}$/);
 const profileText=fs.readFileSync(path.join(dev.root,'data','config','account','profile.json'),'utf8');
 assert.doesNotMatch(profileText,/mgl_/);assert.ok(fs.existsSync(path.join(dev.root,'data','config','account','secrets.dpapi')));
 await dev.a.logout();assert.equal(dev.a.status().loggedIn,false);assert.equal(dev.a.token(),'');
 assert.equal(r.env.DB.raw.prepare('SELECT COUNT(*) n FROM account_sessions').get().n,0,'logout revokes the server session');
});

test('client sync: words with examples merge across two PCs, deletions propagate, offline changes queue',async t=>{
 const r=relay(),clock={now:T0.getTime()},A=device(t,r,clock),B=device(t,r,clock);
 A.run(db=>{db.prepare("INSERT INTO games(id,title,executable) VALUES('game-1','ATRI','C:\\\\Games\\\\ATRI\\\\atri.exe')").run();
  db.prepare("INSERT INTO vocabulary(id,spelling,reading,definitions,status,created_at,original) VALUES(101,'猫','ねこ','[\"cat\"]',1,100,'{\"entry\":{\"id\":101},\"noteId\":5}')").run();
  db.prepare("INSERT INTO examples(word_id,game_id,text,translation,highlight_start,highlight_end,created_at,original) VALUES(101,'game-1','猫がいる','有猫',0,1,110,'{}')").run();
  db.prepare("INSERT INTO saved_sentences(game_id,text,translation,created_at,original) VALUES('game-1','いい天気','好天气',120,'{}')").run();
  db.prepare("INSERT INTO reading_sessions(game_id,started_at,ended_at,active_seconds,characters,sentences) VALUES('game-1',?,?,600,1200,40)").run(T0.getTime()/1000,T0.getTime()/1000+700);});
 B.run(db=>{db.prepare("INSERT INTO vocabulary(id,spelling,reading,definitions,status,created_at,original) VALUES(101,'猫','ねこ','[\"cat\"]',0,90,'{}')").run();
  db.prepare("INSERT INTO examples(word_id,game_id,text,translation,highlight_start,highlight_end,created_at,original) VALUES(101,NULL,'猫が好き','喜欢猫',0,1,95,'{}')").run();});
 await signIn(A,r);clock.now+=61000;await signIn(B,r);
 clock.now+=1000;await A.a.sync();
 clock.now+=1000;const sb=await B.a.sync();assert.equal(sb.loggedIn,true);
 clock.now+=1000;await A.a.sync();
 const examples=dev=>dev.run(db=>db.prepare("SELECT text FROM examples WHERE word_id=101 ORDER BY text").all().map(x=>x.text));
 assert.deepEqual(examples(A),['猫がいる','猫が好き'],'A got B\'s example');assert.deepEqual(examples(B),['猫がいる','猫が好き'],'B kept its own and got A\'s');
 assert.equal(B.run(db=>db.prepare("SELECT text FROM saved_sentences").get()?.text),'いい天気');
 const imported=B.run(db=>db.prepare("SELECT active_seconds,characters,original FROM reading_sessions").all());
 assert.equal(imported.length,1);assert.equal(imported[0].characters,1200);assert.ok(JSON.parse(imported[0].original).sync,'imported totals are marked');
 assert.equal(A.run(db=>db.prepare("SELECT COUNT(*) n FROM reading_sessions").get().n),1,'A does not re-import its own totals');
 /* a third sync changes nothing on either side */
 clock.now+=1000;const again=await B.a.sync();assert.ok(Object.values(again.summary).every(s=>s.pushed===0&&s.pulled===0),JSON.stringify(again.summary));
 /* deleted on A → moved to B's word trash */
 A.run(db=>{db.prepare('DELETE FROM examples WHERE word_id=101').run();db.prepare('DELETE FROM vocabulary WHERE id=101').run();});
 clock.now+=1000;await A.a.sync();clock.now+=1000;await B.a.sync();
 assert.equal(B.run(db=>db.prepare('SELECT COUNT(*) n FROM vocabulary').get().n),0);assert.equal(B.run(db=>db.prepare('SELECT COUNT(*) n FROM word_trash').get().n),1);
 /* offline: the change waits in the queue and goes up on the next sync */
 B.run(db=>db.prepare("INSERT INTO saved_sentences(text,translation,created_at,original) VALUES('雨だ','下雨了',130,'{}')").run());
 const online=B.a.fetcher;B.a.fetcher=async()=>{throw Error('offline');};
 clock.now+=1000;await assert.rejects(()=>B.a.sync(),/NETWORK/);
 assert.equal(B.a.status().lastError,'NETWORK');assert.equal(B.a.status().pending.sentences,1);
 B.a.fetcher=online;clock.now+=1000;await B.a.sync();assert.equal(B.a.status().pending.sentences||0,0);
 clock.now+=1000;await A.a.sync();assert.deepEqual(A.run(db=>db.prepare('SELECT text FROM saved_sentences ORDER BY text').all().map(x=>x.text)),['いい天気','雨だ']);
 /* turned-off kinds are not touched */
 A.a.setKinds({sentences:false});A.run(db=>db.prepare("INSERT INTO saved_sentences(text,created_at,original) VALUES('秘密',1,'{}')").run());
 clock.now+=1000;const off=await A.a.sync();assert.equal(off.summary.sentences,undefined);
 assert.equal(r.env.DB.raw.prepare("SELECT COUNT(*) n FROM sync_records WHERE data LIKE '%秘密%'").get().n,0);
});

test('client: last writer wins for word status, both directions',async t=>{
 const r=relay(),clock={now:T0.getTime()},A=device(t,r,clock),B=device(t,r,clock);
 A.run(db=>db.prepare("INSERT INTO vocabulary(id,spelling,reading,definitions,status,created_at,original) VALUES(7,'本','ほん','[]',0,1,'{}')").run());
 await signIn(A,r);clock.now+=61000;await signIn(B,r);clock.now+=1000;await A.a.sync();clock.now+=1000;await B.a.sync();
 A.run(db=>db.prepare('UPDATE vocabulary SET status=2 WHERE id=7').run());clock.now+=1000;await A.a.sync();
 B.run(db=>db.prepare('UPDATE vocabulary SET status=4 WHERE id=7').run());clock.now+=1000;await B.a.sync();
 clock.now+=1000;await A.a.sync();
 assert.equal(A.run(db=>db.prepare('SELECT status FROM vocabulary WHERE id=7').get().status),4,'the later change (B) wins');
 assert.equal(B.run(db=>db.prepare('SELECT status FROM vocabulary WHERE id=7').get().status),4);
});

test('settings sync repairs already queued fractional timestamps and writes new timestamps as integers',async t=>{
 const r=relay(),clock={now:T0.getTime()},dev=device(t,r,clock),key='b'.repeat(64);
 const config=path.join(dev.root,'data','config'),savedAt=clock.now-1000.25,queuedAt=clock.now-2000.75;
 fs.mkdirSync(config,{recursive:true});
 fs.writeFileSync(path.join(config,'gal-preferences.json'),JSON.stringify({japaneseSize:30}));
 fs.writeFileSync(path.join(config,'game-style-profiles.json'),JSON.stringify({version:3,entries:{[key]:{name:'Test game',prefs:{translationSize:20},savedAt}}}));
 await signIn(dev,r);
 dev.run(db=>{
  account.ensureState(db);
  const entry=account.kinds.settings.collect(db,dev.root).get('global-style');
  db.prepare('INSERT INTO account_sync VALUES (?,?,?,?,1)').run('settings','global-style',account.hashData(entry),queuedAt);
 });
 const result=await dev.a.sync();
 assert.equal(result.summary.settings.pushed,2);
 assert.equal(result.pending.settings||0,0);
 const uploaded=r.env.DB.raw.prepare("SELECT key,updated_at FROM sync_records WHERE kind='settings'").all();
 assert.deepEqual(Object.fromEntries(uploaded.map(row=>[row.key,row.updated_at])),{[key]:Math.trunc(savedAt),'global-style':Math.trunc(queuedAt)});
 assert.equal((await dev.a.sync()).summary.settings.pushed,0);
});

test('privacy: synced per-game settings carry no paths, local paths survive a remote update',async t=>{
 const prefs={japaneseSize:30,gameProcess:'C:\\Games\\ATRI\\atri.exe',executable:'D:\\x\\y.exe',savePath:'C:\\Users\\me\\save',backgroundImage:'C:\\pics\\bg.png',coverUrl:'https://example.com/c.jpg',save_dir:'/home/me/x',japaneseFont:'Yu Gothic',profile:'keep me',nested:{fontFile:'C:\\Windows\\Fonts\\a.ttf',note:'\\\\server\\share\\x',color:'#ffffff',list:['D:\\a\\b.png','ok']},textColor:'#fff'};
 const clean=account.cleanSettings(prefs),text=JSON.stringify(clean);
 for(const bad of [/[A-Za-z]:\\\\/,/\\\\\\\\/,/\/home\//,/https?:/,/gameProcess|executable|savePath|backgroundImage|coverUrl|save_dir|fontFile/])assert.doesNotMatch(text,bad);
 assert.deepEqual(clean,{japaneseSize:30,japaneseFont:'Yu Gothic',profile:'keep me',nested:{color:'#ffffff',list:['ok']},textColor:'#fff'});
 const r=relay(),clock={now:T0.getTime()},A=device(t,r,clock),B=device(t,r,clock),key='a'.repeat(64);
 fs.mkdirSync(path.join(A.root,'data','config'),{recursive:true});
 fs.writeFileSync(path.join(A.root,'data','config','game-style-profiles.json'),JSON.stringify({version:3,entries:{[key]:{name:'C:\\Games\\ATRI\\ATRI.exe',prefs,savedAt:T0.getTime()-1000}}}));
 fs.mkdirSync(path.join(B.root,'data','config'),{recursive:true});fs.writeFileSync(path.join(B.root,'data','config','game-style-profiles.json'),JSON.stringify({version:3,entries:{[key]:{name:'ATRI',prefs:{gameProcess:'E:\\ATRI\\atri.exe',japaneseSize:20},savedAt:T0.getTime()-5000}}}));
 await signIn(A,r);clock.now+=1000;await A.a.sync();
 const uploaded=r.env.DB.raw.prepare("SELECT data FROM sync_records WHERE kind='settings'").all().map(x=>x.data).join('\n');
 assert.ok(uploaded.length>0);assert.doesNotMatch(uploaded,/[A-Za-z]:\\\\|\.exe|\.png|\.ttf|https?:/,'no path or exe reaches the server');
 assert.equal(JSON.parse(uploaded).name,'ATRI','a path-like name is cut to its bare file name');
 /* nothing path-like in any synced kind */
 A.run(db=>db.prepare("INSERT INTO games(id,title,executable,cover) VALUES('game-9','Sample','C:\\\\G\\\\s.exe','C:\\\\G\\\\c.png')").run());
 A.run(db=>db.prepare("INSERT INTO saved_sentences(game_id,text,created_at,original) VALUES('game-9','テスト',1,'{}')").run());
 clock.now+=1000;await A.a.sync();assert.doesNotMatch(r.env.DB.raw.prepare('SELECT group_concat(data) d FROM sync_records').get().d,/C:\\\\/);
 clock.now+=61000;await signIn(B,r);clock.now+=1000;await B.a.sync();
 const merged=JSON.parse(fs.readFileSync(path.join(B.root,'data','config','game-style-profiles.json'),'utf8')).entries[key];
 assert.equal(merged.prefs.japaneseSize,30,'remote style arrives');assert.equal(merged.prefs.gameProcess,'E:\\ATRI\\atri.exe','the local process path is kept');
});

test('UI and wiring: settings page, bridge hook, ACCOUNTS.md router note',()=>{
 const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const ui=read('web/account-ui.js');for(const s of ['联网服务还在准备中','立即同步','退出登录','删除账号（含云端数据）','今すぐ同期','Sync now'])assert.ok(ui.includes(s),s);
 assert.match(read('web/settings-layout.js'),/ids\.push\('account'\)/);assert.match(read('web/settings.js'),/section==='account'/);
 assert.match(read('services/bridge.cjs'),/startsWith\('account_'\)/);
 assert.match(read('relay/ACCOUNTS.md'),/isAccountsPath\(path\)/);
 for(const f of ['services/account.cjs','web/account-ui.js'])assert.doesNotMatch(read(f).split('\n').slice(1).join('\n'),/(^|[;{}])\s*\/\/(?!\/)/m,f+' has no inline // comments');
});
test('account page sync preserves oversized sentences, other records and retry state',async t=>{
 const r=relay(),clock={now:T0.getTime()},dev=device(t,r,clock);
 await signIn(dev,r);
 const large='海'.repeat(14000);
 dev.run(db=>{
  const insert=db.prepare("INSERT INTO saved_sentences(text,created_at,original) VALUES(?,1,'{}')");
  insert.run(large);insert.run('small');
 });
 const online=dev.a.fetcher,options={env:dev.a.env,vault:dev.a.vault,now:dev.a.now,fetch:online};
 const sync=()=>account.handle(dev.root,{action:'account_sync'},options);
 await assert.rejects(sync,/RECORD_TOO_LARGE/);
 const {renderAccount}=await import('../web/account-ui.js');
 const button={},control={querySelector:()=>control,querySelectorAll:()=>[]};
 const target={querySelector:selector=>selector==='[data-sync]'?button:control,querySelectorAll:()=>[]};
 const messages=[];
 await renderAccount({target,locale:'en',esc:String,toast:message=>messages.push(message),
  api:(action,args)=>account.handle(dev.root,{action,...args,autoSync:false},options)});
 await button.onclick();
 assert.match(messages.at(-1),/size limit/);
 const count=()=>r.env.DB.raw.prepare("SELECT COUNT(*) n FROM sync_records WHERE kind='sentences'").get().n;
 assert.equal(count(),1);
 assert.equal(dev.a.status().pending.sentences,1);
 assert.equal(dev.run(db=>db.prepare('SELECT length(text) n FROM saved_sentences ORDER BY n DESC').get().n),large.length);
 dev.run(db=>db.prepare("UPDATE saved_sentences SET translation='changed' WHERE text='small'").run());
 let intercept='GET';
 options.fetch=async(url,init)=>url.includes('/sync/sentences')&&init.method===intercept?new Response('<html/>'):online(url,init);
 await assert.rejects(sync,/SYNC_RESPONSE_INVALID/);
 intercept='PUT';
 await assert.rejects(sync,/SYNC_RESPONSE_INVALID/);
 assert.equal(dev.a.status().pending.sentences,2);
 options.fetch=online;
 await assert.rejects(sync,/RECORD_TOO_LARGE/);
 assert.equal(dev.a.status().pending.sentences,1);
 assert.equal(count(),1);
 assert.match(r.env.DB.raw.prepare("SELECT data FROM sync_records WHERE kind='sentences'").get().data,/changed/);
});
