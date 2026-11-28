// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-27 megulit.com user centre, relay side: website sign-ins open a read-only session, the new count-only kinds
   (progress, study) refuse anything but numbers and a title, GET /api/sync summarises, DELETE /api/sync wipes the
   cloud copy, and every account sees only its own rows. relay/src/accounts.js on a node:sqlite D1 stand-in. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay');
const load=()=>import(pathToFileURL(path.join(relayDir,'src','accounts.js')).href);
const migration=name=>fs.readFileSync(path.join(relayDir,'migrations',name),'utf8');
function d1(files=['0005_accounts.sql','0015_password_login.sql','0042_web_sessions.sql']){
 const db=new DatabaseSync(':memory:');for(const f of files)db.exec(migration(f));
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}});
 return {prepare:sql=>stmt(sql),batch:async list=>{db.exec('BEGIN');try{for(const s of list)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},raw:db};
}
function relay(extra={}){
 const mails=[];const env={DB:d1(extra.files),HASH_SALT:'salt',RESEND_API_KEY:'re_test',fetch:async(url,init)=>{mails.push(JSON.parse(init.body));return new Response('{"id":"x"}',{status:200});},...extra};
 return {env,lastCode:()=>/(\d{6})/.exec(mails.at(-1).text)[1]};
}
const T0=new Date('2026-11-27T04:00:00Z'),MS=T0.getTime();
const req=(method,url,data,headers={})=>new Request('https://relay.test'+url,{method,headers:{'cf-connecting-ip':'198.51.100.9',...(data!==undefined?{'content-type':'application/json'}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
const bearer=token=>({authorization:'Bearer '+token});
/* each sign-in of the same e-mail a minute later than the one before (the relay sends at most one code a minute) */
let clock=0;
async function login(handle,r,{email='megumin@example.com',client,ip='198.51.100.9'}={}){
 const at=new Date(MS-3600000+(clock++)*61000);
 assert.equal((await handle(req('POST','/api/auth/code',{email},{'cf-connecting-ip':ip}),r.env,at)).status,200);
 const res=await handle(req('POST','/api/auth/verify',{email,code:r.lastCode(),device:'Chrome',...(client?{client}:{})},{'cf-connecting-ip':ip}),r.env,at);
 assert.equal(res.status,200);return res.json();
}
const word=(k,v)=>({key:k,updated_at:MS,data:{spelling:k,reading:'',definitions:'[]',status:v,examples:[]}});

test('website sign-in opens a read-only, 30-day session; the desktop one stays full',async()=>{
 const {handleAccounts}=await load(),r=relay();
 const web=await login(handleAccounts,r,{client:'web'}),pc=await login(handleAccounts,r);
 assert.equal(web.scope,'read');assert.equal(pc.scope,'full');
 const life=id=>{const row=r.env.DB.raw.prepare('SELECT created_at,expires_at FROM account_sessions WHERE id=?').get(id);return row.expires_at-row.created_at;};
 assert.equal(life(web.sessionId),30*86400);assert.equal(life(pc.sessionId),180*86400);
 const me=await (await handleAccounts(req('GET','/api/me',undefined,bearer(web.token)),r.env,T0)).json();
 assert.equal(me.scope,'read');
 const device=me.devices.find(d=>d.current).device;assert.match(device,/^网页 · Chrome$/);
 /* password sign-in with client:web is read-only too */
 assert.equal((await handleAccounts(req('POST','/api/auth/code',{email:'megumin@example.com'},{'cf-connecting-ip':'198.51.100.9'}),r.env,T0)).status,200);
 assert.equal((await handleAccounts(req('POST','/api/me/password',{password:'correct horse',code:r.lastCode()},bearer(pc.token)),r.env,T0)).status,200);
 const pw=await (await handleAccounts(req('POST','/api/auth/password',{login:'megumin@example.com',password:'correct horse',device:'Safari',client:'web'}),r.env,T0)).json();
 assert.equal(pw.scope,'read');
});

test('a read-only session can read and sign itself out, nothing else',async()=>{
 const {handleAccounts}=await load(),r=relay();
 const pc=await login(handleAccounts,r),web=await login(handleAccounts,r,{client:'web'});
 assert.equal((await handleAccounts(req('PUT','/api/sync/words',{records:[word('猫',1)]},bearer(pc.token)),r.env,T0)).status,200);
 const pull=await (await handleAccounts(req('GET','/api/sync/words?since=0',undefined,bearer(web.token)),r.env,T0)).json();
 assert.deepEqual(pull.records.map(x=>x.key),['猫']);
 for(const [method,url,body] of [['PUT','/api/sync/words',{records:[word('犬',1)]}],['DELETE','/api/sync'],['DELETE','/api/me'],['POST','/api/me/username',{username:'megumin'}],['POST','/api/auth/logout',{sessionId:pc.sessionId}]]){
  const res=await handleAccounts(req(method,url,body,bearer(web.token)),r.env,T0);
  assert.equal(res.status,403,method+' '+url);assert.equal((await res.json()).error,'READ_ONLY_SESSION');
 }
 /* nothing changed behind the refusals */
 const db=r.env.DB.raw;
 assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_records').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM accounts').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM account_sessions').get().n,2);
 /* signing itself out works */
 assert.equal((await handleAccounts(req('POST','/api/auth/logout',{},bearer(web.token)),r.env,T0)).status,200);
 assert.equal((await handleAccounts(req('GET','/api/me',undefined,bearer(web.token)),r.env,T0)).status,401);
});

test('no token, a bad token or another account never reaches the records',async()=>{
 const {handleAccounts}=await load(),r=relay();
 const a=await login(handleAccounts,r),b=await login(handleAccounts,r,{email:'other@example.com',ip:'198.51.100.10'});
 await handleAccounts(req('PUT','/api/sync/sentences',{records:[{key:'s:1',updated_at:MS,data:{text:'秘密の一文',translation:'',created_at:1,game:'G'}}]},bearer(a.token)),r.env,T0);
 for(const headers of [{},{authorization:'Bearer mgl_'+'A'.repeat(43)},{authorization:'Basic abc'}]){
  for(const url of ['/api/sync','/api/sync/sentences?since=0']){const res=await handleAccounts(req('GET',url,undefined,headers),r.env,T0);assert.equal(res.status,401,url);}
 }
 const other=await (await handleAccounts(req('GET','/api/sync/sentences?since=0',undefined,bearer(b.token)),r.env,T0)).json();
 assert.deepEqual(other.records,[],'B sees none of A');
 const sum=await (await handleAccounts(req('GET','/api/sync',undefined,bearer(b.token)),r.env,T0)).json();
 assert.equal(sum.kinds.sentences.records,0);
 /* B wiping its cloud copy leaves A's alone */
 assert.equal((await handleAccounts(req('DELETE','/api/sync',undefined,bearer(b.token)),r.env,T0)).status,200);
 assert.equal(r.env.DB.raw.prepare('SELECT COUNT(*) n FROM sync_records').get().n,1);
});

test('GET /api/sync summarises per kind; DELETE /api/sync wipes records but keeps the account; 3 wipes a day',async()=>{
 const {handleAccounts,KINDS}=await load(),r=relay();
 assert.deepEqual(KINDS,['words','sentences','reading','settings','progress','study']);
 const pc=await login(handleAccounts,r);
 await handleAccounts(req('PUT','/api/sync/words',{records:[word('猫',1),word('犬',2)]},bearer(pc.token)),r.env,T0);
 await handleAccounts(req('PUT','/api/sync/words',{records:[{key:'犬',updated_at:MS+1,deleted:true}]},bearer(pc.token)),r.env,T0);
 await handleAccounts(req('PUT','/api/sync/progress',{records:[{key:'p:1',updated_at:MS,data:{game:'千恋＊万花',read:1200,total:5000}}]},bearer(pc.token)),r.env,T0);
 const sum=await (await handleAccounts(req('GET','/api/sync',undefined,bearer(pc.token)),r.env,T0)).json();
 assert.deepEqual(sum.kinds.words,{cursor:3,records:1});assert.deepEqual(sum.kinds.progress,{cursor:4,records:1});assert.deepEqual(sum.kinds.study,{cursor:0,records:0});
 const wipe=await (await handleAccounts(req('DELETE','/api/sync',undefined,bearer(pc.token)),r.env,T0)).json();
 assert.equal(wipe.deleted,3);
 const db=r.env.DB.raw;
 assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_records').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM accounts').get().n,1,'the account stays');
 assert.equal((await handleAccounts(req('GET','/api/me',undefined,bearer(pc.token)),r.env,T0)).status,200,'still signed in');
 /* after a wipe, a new upload starts again above the old cursor so other devices still pull it */
 const put=await (await handleAccounts(req('PUT','/api/sync/words',{records:[word('鳥',0)]},bearer(pc.token)),r.env,T0)).json();
 assert.ok(put.cursor>4);
 assert.equal((await handleAccounts(req('DELETE','/api/sync',undefined,bearer(pc.token)),r.env,T0)).status,200);
 assert.equal((await handleAccounts(req('DELETE','/api/sync',undefined,bearer(pc.token)),r.env,T0)).status,200);
 assert.equal((await handleAccounts(req('DELETE','/api/sync',undefined,bearer(pc.token)),r.env,T0)).status,429);
});

test('progress and study accept counts and a title only, so no game text can be uploaded in them',async()=>{
 const {handleAccounts,validateRecord}=await load(),r=relay(),now=MS;
 const ok=(kind,data)=>assert.ok(!validateRecord(kind,{key:'k',updated_at:now,data},now).error,JSON.stringify(data));
 const bad=(kind,data)=>assert.equal(validateRecord(kind,{key:'k',updated_at:now,data},now).error,'INVALID_DATA',JSON.stringify(data));
 ok('progress',{game:'素晴らしき日々',read:10,total:100,seconds:3600,lastPlayedAt:1795000000000});
 ok('progress',{game:'G',read:0,total:null});
 bad('progress',{game:'G',read:1,text:'「好きです」'});
 bad('progress',{game:'G',read:1,lines:['line']});
 bad('progress',{game:'G',read:'10'});
 bad('progress',{game:'x'.repeat(181),read:1});
 bad('progress',{game:'  ',read:1});
 bad('progress',{read:1});
 ok('study',{day:'2026-11-27',lookups:3,reviews:20,newWords:2,kana:0,grammar:1,anki:5});
 bad('study',{day:'2026-11-27',lookups:-1});
 bad('study',{day:'yesterday'});
 bad('study',{day:'2026-11-27',note:'台詞'});
 const pc=await login(handleAccounts,r);
 const res=await handleAccounts(req('PUT','/api/sync/progress',{records:[{key:'p:1',updated_at:MS,data:{game:'G',read:1,script:'本文'}}]},bearer(pc.token)),r.env,T0);
 assert.equal(res.status,400);assert.equal((await res.json()).error,'INVALID_DATA');
 assert.equal(r.env.DB.raw.prepare('SELECT COUNT(*) n FROM sync_records').get().n,0);
});

test('website reads use the RL binding (no D1 row); desktop requests still count in rate_limits',async()=>{
 const {handleAccounts}=await load();let left=2;const calls=[];
 const r=relay({RL_SYNC_GET:{limit:async o=>{calls.push(o.key);return {success:left-->0};}}});
 const web=await login(handleAccounts,r,{client:'web'}),db=r.env.DB.raw;
 const before=db.prepare("SELECT COUNT(*) n FROM rate_limits WHERE bucket LIKE 'acct:%'").get().n;
 assert.equal((await handleAccounts(req('GET','/api/sync',undefined,bearer(web.token)),r.env,T0)).status,200);
 assert.equal((await handleAccounts(req('GET','/api/sync/words?since=0',undefined,bearer(web.token)),r.env,T0)).status,200);
 assert.equal((await handleAccounts(req('GET','/api/sync/words?since=0',undefined,bearer(web.token)),r.env,T0)).status,429);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM rate_limits WHERE bucket LIKE 'acct:%'").get().n,before,'no D1 write for website reads');
 assert.equal(calls.length,3);assert.equal(new Set(calls).size,1,'keyed by the account');
 const pc=await login(handleAccounts,r);
 await handleAccounts(req('GET','/api/sync',undefined,bearer(pc.token)),r.env,T0);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM rate_limits WHERE bucket LIKE 'acct:%'").get().n,before+1);
});

test('before migration 0042 a website sign-in fails closed and a desktop one still works',async()=>{
 const {handleAccounts}=await load(),r=relay({files:['0005_accounts.sql','0015_password_login.sql']});
 assert.equal((await login(handleAccounts,r)).scope,'full');
 await handleAccounts(req('POST','/api/auth/code',{email:'w@example.com'},{'cf-connecting-ip':'198.51.100.30'}),r.env,T0);
 const res=await handleAccounts(req('POST','/api/auth/verify',{email:'w@example.com',code:r.lastCode(),client:'web'},{'cf-connecting-ip':'198.51.100.30'}),r.env,T0);
 assert.equal(res.status,500,'never a full session for the website');
 assert.equal(r.env.DB.raw.prepare("SELECT COUNT(*) n FROM account_sessions WHERE device LIKE '网页%'").get().n,0);
});

test('CORS: megulit.com and cn.megulit.com may read the rotated token; other origins get nothing',async()=>{
 const {handle}=await import(pathToFileURL(path.join(relayDir,'src','worker.js')).href);
 const toml=fs.readFileSync(path.join(relayDir,'wrangler.toml'),'utf8'),origins=/ALLOWED_ORIGINS = "([^"]+)"/.exec(toml)[1];
 assert.deepEqual(origins.split(','),['https://megulit.com','https://www.megulit.com','https://cn.megulit.com']);
 assert.match(toml,/name = "RL_SYNC_GET"[\s\S]*?limit = 60, period = 60/);
 const env={ALLOWED_ORIGINS:origins};
 for(const origin of ['https://megulit.com','https://cn.megulit.com']){
  const res=await handle(new Request('https://relay.test/api/sync',{method:'OPTIONS',headers:{origin}}),env,T0);
  assert.equal(res.status,204);assert.equal(res.headers.get('access-control-allow-origin'),origin);
  assert.equal(res.headers.get('access-control-expose-headers'),'x-megulit-token');assert.match(res.headers.get('access-control-allow-headers'),/authorization/);
 }
 const evil=await handle(new Request('https://relay.test/api/sync',{method:'OPTIONS',headers:{origin:'https://megulit.com.evil.example'}}),env,T0);
 assert.equal(evil.status,403);assert.equal(evil.headers.get('access-control-allow-origin'),null);
});
