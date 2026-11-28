process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 user name + password sign-in (relay/src/accounts.js, migration 0015) and the faster code mail, on the same
   node:sqlite D1 stand-in as accounts.test.cjs; then services/account.cjs and its bridge actions against it. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay');
const load=()=>import(pathToFileURL(path.join(relayDir,'src','accounts.js')).href);
const MIGRATIONS=['0005_accounts.sql','0015_password_login.sql','0042_web_sessions.sql'].map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8'));
function d1(){
 const db=new DatabaseSync(':memory:');for(const m of MIGRATIONS)db.exec(m);
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}});
 return {prepare:sql=>stmt(sql),batch:async list=>{db.exec('BEGIN');try{for(const s of list)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},raw:db};
}
function relay(extra={}){
 const mails=[];const env={DB:d1(),HASH_SALT:'salt',RESEND_API_KEY:'re_test',fetch:async(url,init)=>{mails.push({url,body:JSON.parse(init.body)});return new Response('{"id":"x"}',{status:200});},...extra};
 return {env,mails,lastCode:()=>/(\d{6})/.exec(mails.at(-1).body.text)[1]};
}
const T0=new Date('2026-11-12T04:00:00Z'),at=s=>new Date(T0.getTime()+s*1000);
const req=(method,url,data,headers={})=>new Request('https://relay.test'+url,{method,headers:{'cf-connecting-ip':'198.51.100.7',...(data!==undefined?{'content-type':'application/json'}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
const bearer=token=>({authorization:'Bearer '+token});
async function codeLogin(h,r,email,now){
 assert.equal((await h(req('POST','/api/auth/code',{email}),r.env,now)).status,200);
 const res=await h(req('POST','/api/auth/verify',{email,code:r.lastCode(),device:'PC'}),r.env,now);assert.equal(res.status,200);return res.json();
}
const PW='correct horse battery';

test('relay: user name once, password set/change rules, sign-in by e-mail or user name, one answer for every failure',async()=>{
 const {handleAccounts:h}=await load(),r=relay(),a=await codeLogin(h,r,'Megumin@Example.com',T0);
 const post=(route,body,token,now=T0)=>h(req('POST',route,body,token?bearer(token):{}),r.env,now).then(async x=>({status:x.status,body:await x.json()}));
 let me=await (await h(req('GET','/api/me',undefined,bearer(a.token)),r.env,T0)).json();
 assert.equal(me.username,null);assert.equal(me.hasPassword,false);
 /* user name */
 for(const bad of ['ab','1abc','has space','toolong_toolong_toolong','admin','名前'])assert.equal((await post('/api/me/username',{username:bad},a.token)).body.error,'USERNAME_INVALID',bad);
 assert.equal((await post('/api/me/username',{username:'Megumin_1'},a.token)).body.username,'Megumin_1');
 assert.equal((await post('/api/me/username',{username:'Other_name'},a.token)).body.error,'USERNAME_LOCKED','chosen once, never changed');
 const b=await codeLogin(h,r,'yunyun@example.com',at(5));
 assert.equal((await post('/api/me/username',{username:'megumin_1'},b.token,at(5))).body.error,'USERNAME_TAKEN','names compare without case');
 /* password */
 assert.equal((await post('/api/me/password',{password:'short'},a.token)).body.error,'PASSWORD_LENGTH');
 assert.equal((await post('/api/me/password',{password:'aaaaaaaaaa'},a.token)).body.error,'PASSWORD_WEAK');
 assert.equal((await post('/api/me/password',{password:PW},a.token)).body.hasPassword,true);
 const stored=r.env.DB.raw.prepare('SELECT pass_hash,pass_salt FROM accounts WHERE email=?').get('megumin@example.com');
 assert.ok(stored.pass_hash&&!stored.pass_hash.includes(PW)&&/^[0-9a-f]{32}$/.test(stored.pass_salt),'only a salted hash is kept');
 me=await (await h(req('GET','/api/me',undefined,bearer(a.token)),r.env,T0)).json();assert.equal(me.username,'Megumin_1');assert.equal(me.hasPassword,true);
 /* the code session is fresh for 10 minutes: a change needs no current password; later it does */
 assert.equal((await post('/api/me/password',{password:PW+'!'},a.token,at(300))).status,200);
 assert.equal((await post('/api/me/password',{password:PW},a.token,at(700))).body.error,'WRONG_PASSWORD');
 assert.equal((await post('/api/me/password',{password:PW,current:'nope nope'},a.token,at(700))).body.error,'WRONG_PASSWORD');
 assert.equal((await post('/api/me/password',{password:PW,current:PW+'!'},a.token,at(700))).status,200);
 /* sign in with the e-mail (any case) or the user name (any case) */
 for(const login of ['megumin@example.com',' MEGUMIN@example.com','Megumin_1','MEGUMIN_1']){
  const res=await post('/api/auth/password',{login,password:PW,device:'Laptop'},null,at(800));
  assert.equal(res.status,200,login);assert.match(res.body.token,/^mgl_[A-Za-z0-9_-]{43}$/);assert.equal(res.body.accountId,a.accountId);assert.equal(res.body.email,'megumin@example.com');assert.ok(res.body.sessionId&&res.body.expiresAt);
 }
 const wrong=await post('/api/auth/password',{login:'Megumin_1',password:'wrong password'},null,at(800));
 const ghost=await post('/api/auth/password',{login:'nobody_here',password:PW},null,at(800));
 const noPass=await post('/api/auth/password',{login:'yunyun@example.com',password:PW},null,at(800));
 assert.deepEqual([wrong.body.error,ghost.body.error,noPass.body.error],['WRONG_PASSWORD','WRONG_PASSWORD','WRONG_PASSWORD'],'nobody can tell which names exist');
 /* rate limit per login */
 let last;for(let i=0;i<12;i++)last=await post('/api/auth/password',{login:'Megumin_1',password:'guess '+i},{},at(900+i));
 assert.equal(last.status,429);assert.equal(last.body.error,'RATE_LIMITED');
});

/* 2026-11-29 (owner: 个人主页要能够改密码和设置密码啊 megulit和官网都是): a first password needs a mailed code, a change needs
   the current password or a code (the forgotten-password path), and the website's read-only session may do both, never without proof */
test('relay: first password needs a mailed code; change needs the current one or a code; the website may do it, never without proof',async()=>{
 const {handleAccounts:h}=await load(),r=relay(),a=await codeLogin(h,r,'megumin@example.com',T0);
 const post=(route,body,token,now)=>h(req('POST',route,body,token?bearer(token):{}),r.env,now).then(async x=>({status:x.status,body:await x.json()}));
 const hasPassword=()=>!!r.env.DB.raw.prepare('SELECT pass_hash FROM accounts WHERE email=?').get('megumin@example.com').pass_hash;
 /* a session older than 10 minutes on a code-only account: no password without a code */
 let res=await post('/api/me/password',{password:PW},a.token,at(700));
 assert.equal(res.status,400);assert.equal(res.body.error,'CODE_REQUIRED');assert.equal(hasPassword(),false);
 assert.equal((await post('/api/me/password',{password:PW,current:'anything at all'},a.token,at(701))).body.error,'CODE_REQUIRED','a made-up current password is no proof');
 assert.equal((await post('/api/auth/code',{email:'megumin@example.com'},null,at(710))).status,200);
 const code=r.lastCode(),wrong=code==='000000'?'111111':'000000';
 res=await post('/api/me/password',{password:PW,code:wrong},a.token,at(720));assert.equal(res.body.error,'WRONG_CODE');assert.equal(res.body.triesLeft,4);
 assert.equal((await post('/api/me/password',{password:PW,code:'12a'},a.token,at(721))).body.error,'WRONG_CODE');
 res=await post('/api/me/password',{password:PW,code},a.token,at(730));assert.equal(res.status,200);assert.equal(res.body.hasPassword,true);
 assert.equal((await post('/api/me/password',{password:PW+'x',code},a.token,at(731))).body.error,'NO_CODE','a code works once');
 assert.equal((await post('/api/auth/password',{login:'megumin@example.com',password:PW},null,at(740))).status,200,'signs in with the new password');
 /* the website: a read-only session, fresh or not, needs the current password or a code */
 const w=(await post('/api/auth/password',{login:'megumin@example.com',password:PW,client:'web'},null,at(3700))).body;assert.equal(w.scope,'read');
 assert.equal((await post('/api/me/password',{password:'brand new pass'},w.token,at(3701))).body.error,'WRONG_PASSWORD','no fresh-session shortcut on the website');
 assert.equal((await post('/api/me/password',{password:'brand new pass',current:'not it at all'},w.token,at(3702))).body.error,'WRONG_PASSWORD');
 res=await post('/api/me/password',{password:'brand new pass',current:PW},w.token,at(3703));assert.equal(res.status,200);
 assert.equal((await post('/api/auth/password',{login:'megumin@example.com',password:PW},null,at(3710))).body.error,'WRONG_PASSWORD','the old password stops working');
 assert.equal((await post('/api/auth/password',{login:'megumin@example.com',password:'brand new pass'},null,at(3711))).status,200);
 /* forgotten on the website: a mailed code resets it */
 await post('/api/auth/code',{email:'megumin@example.com'},null,at(3800));
 assert.equal((await post('/api/me/password',{password:'forgot and reset',code:r.lastCode()},w.token,at(3810))).status,200);
 assert.equal((await post('/api/auth/password',{login:'megumin@example.com',password:'forgot and reset'},null,at(3820))).status,200);
 assert.equal((await post('/api/me/password',{password:'short'},w.token,at(3821))).body.error,'PASSWORD_LENGTH','the same rules as the desktop');
 /* the website still cannot write anything else */
 assert.equal((await h(req('DELETE','/api/me',undefined,bearer(w.token)),r.env,at(3830))).status,403);
 /* other devices stay signed in after a change (existing behaviour; each can be signed out from the device list) */
 const me=await (await h(req('GET','/api/me',undefined,bearer(a.token)),r.env,at(3840))).json();
 assert.equal(me.hasPassword,true);assert.ok(me.devices.length>=3);
 /* guessing is capped: 10 tries an hour per account */
 let last;for(let i=0;i<12;i++)last=await post('/api/me/password',{password:'guess guess '+i,current:'guess '+i},w.token,at(7300+i));
 assert.equal(last.status,429);assert.equal(last.body.error,'RATE_LIMITED');
});

test('relay: the code request answers before a slow mail finishes, and still reports failures',async()=>{
 const {handleAccounts:h}=await load();
 /* fast failure inside the wait: reported, the code removed */
 const failing=relay({fetch:async()=>new Response('{}',{status:500})});
 let res=await h(req('POST','/api/auth/code',{email:'a@example.com'}),failing.env,T0,{waitUntil(){}});
 assert.equal(res.status,502);assert.equal((await res.json()).error,'EMAIL_SEND_FAILED');
 assert.equal(failing.env.DB.raw.prepare('SELECT COUNT(*) n FROM auth_codes').get().n,0);
 const throwing=relay({fetch:async()=>{throw Error('offline');}});
 assert.equal((await h(req('POST','/api/auth/code',{email:'a@example.com'}),throwing.env,T0)).status,502,'a thrown fetch is a send failure, not a 500');
 /* slow success: the answer comes first (sending:true), the mail finishes inside waitUntil and the code works */
 let release;const gate=new Promise(r=>{release=r;}),r=relay({MAIL_WAIT_MS:'30'}),inner=r.env.fetch,waits=[];
 r.env.fetch=async(...a)=>{await gate;return inner(...a);};
 const started=Date.now();res=await h(req('POST','/api/auth/code',{email:'a@example.com'}),r.env,T0,{waitUntil:p=>waits.push(p)});
 assert.ok(Date.now()-started<1000);assert.equal(res.status,200);assert.equal((await res.json()).sending,true);assert.equal(waits.length,1);
 release();await Promise.all(waits);
 const ok=await h(req('POST','/api/auth/verify',{email:'a@example.com',code:r.lastCode()}),r.env,at(10));assert.equal(ok.status,200);
 /* slow failure: the answer was ok, the code is removed, so verifying says NO_CODE and the app asks for a new one */
 let drop;const gate2=new Promise(x=>{drop=x;}),r2=relay({MAIL_WAIT_MS:'30'}),waits2=[];
 r2.env.fetch=async()=>{await gate2;return new Response('{}',{status:500});};
 assert.equal((await h(req('POST','/api/auth/code',{email:'b@example.com'}),r2.env,T0,{waitUntil:p=>waits2.push(p)})).status,200);
 drop();await Promise.all(waits2);
 assert.equal((await (await h(req('POST','/api/auth/verify',{email:'b@example.com',code:'123456'}),r2.env,at(10))).json()).error,'NO_CODE');
 /* without ctx (tests, old callers) it waits for the mail as before */
 const plain=relay();assert.equal((await (await h(req('POST','/api/auth/code',{email:'c@example.com'}),plain.env,T0)).json()).sending,undefined);
 /* the worker passes ctx through */
 assert.match(fs.readFileSync(path.join(relayDir,'src','worker.js'),'utf8'),/fetch:async\(request,env,ctx\)=>\{const response=await handle\(request,env,new Date\(\),ctx\)/);
});

/* ---- client ------------------------------------------------------------------------------------------------- */
const {openStore}=require('../services/store.cjs');
const account=require('../services/account.cjs');
function device(t,r,clock){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-account-pw-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const db=openStore(root);db.close();
 const calls=[];
 const fetcher=async(url,init)=>{calls.push({url,body:init.body});const {handleAccounts}=await load();return handleAccounts(new Request(url,init),r.env,new Date(clock.now));};
 const options={env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:fetcher,vault:(action,value)=>value,now:()=>clock.now};
 return {root,a:new account.Account(root,options),options,calls};
}

test('client: password sign-in stores the token like a code sign-in; user name and password through the bridge actions',async t=>{
 const r=relay(),clock={now:T0.getTime()},pc1=device(t,r,clock),pc2=device(t,r,clock);
 await pc1.a.requestCode('megumin@example.com');let s=await pc1.a.verify('megumin@example.com',r.lastCode());
 assert.equal(s.codeFresh,true);assert.equal(s.hasPassword,false);assert.equal(s.passwordKnown,false);
 const handle=(dev,request)=>account.handle(dev.root,request,dev.options);
 await assert.rejects(()=>handle(pc1,{action:'account_username',username:'1bad'}),/USERNAME_INVALID/);
 s=await handle(pc1,{action:'account_username',username:'Megumin_1'});assert.equal(s.username,'Megumin_1');
 await assert.rejects(()=>handle(pc1,{action:'account_username',username:'Another'}),/USERNAME_LOCKED/);
 await assert.rejects(()=>handle(pc1,{action:'account_password',password:'short'}),/PASSWORD_LENGTH/);
 s=await handle(pc1,{action:'account_password',password:PW});assert.equal(s.hasPassword,true);
 const me=await handle(pc1,{action:'account_me'});assert.equal(me.username,'Megumin_1');assert.equal(me.hasPassword,true);
 clock.now+=11*60e3;assert.equal(pc1.a.status().codeFresh,false);
 await assert.rejects(()=>handle(pc1,{action:'account_password',password:PW+'2'}),/WRONG_PASSWORD/);
 await handle(pc1,{action:'account_password',password:PW+'2',current:PW});
 /* second PC: no network for an empty or malformed login */
 const before=pc2.calls.length;
 await assert.rejects(()=>handle(pc2,{action:'account_password_login',login:'x y',password:PW}),/LOGIN_INVALID/);
 await assert.rejects(()=>handle(pc2,{action:'account_password_login',login:'a@b',password:PW}),/EMAIL_INVALID/);
 await assert.rejects(()=>handle(pc2,{action:'account_password_login',login:'Megumin_1',password:''}),/WRONG_PASSWORD/);
 assert.equal(pc2.calls.length,before);
 await assert.rejects(()=>handle(pc2,{action:'account_password_login',login:'Megumin_1',password:PW}),/WRONG_PASSWORD/);
 s=await handle(pc2,{action:'account_password_login',login:'megumin_1',password:PW+'2',kinds:{reading:false}});
 assert.equal(s.loggedIn,true);assert.equal(s.email,'megumin@example.com');assert.equal(s.hasPassword,true);assert.equal(s.codeFresh,false);assert.equal(s.kinds.reading,false);
 await pc2.a.sync().catch(()=>{});
 const profileText=fs.readFileSync(path.join(pc2.root,'data','config','account','profile.json'),'utf8');
 assert.doesNotMatch(profileText,/mgl_|correct horse/,'neither the token nor the password lands in profile.json');
 assert.match(pc2.a.token(),/^mgl_/);
 /* the daily rotation still reaches the vault on a password session */
 const old=pc2.a.token();clock.now+=86400e3+1000;await pc2.a.me();assert.notEqual(pc2.a.token(),old);assert.equal((await pc2.a.me()).email,'megumin@example.com');
 /* signing out forgets the cached user name and password state */
 await pc2.a.logout();s=pc2.a.status();assert.equal(s.loggedIn,false);assert.equal(s.username,'');assert.equal(s.hasPassword,false);
 assert.doesNotMatch(fs.readFileSync(path.join(pc2.root,'data','config','account','profile.json'),'utf8'),/Megumin_1/);
});

test('client: a code-only account sets its first password with a code mailed to its own address; a forgotten one is reset the same way',async t=>{
 const r=relay(),clock={now:T0.getTime()},pc=device(t,r,clock),handle=request=>account.handle(pc.root,request,pc.options);
 await pc.a.requestCode('megumin@example.com');await pc.a.verify('megumin@example.com',r.lastCode());
 clock.now+=11*60e3;
 await assert.rejects(()=>handle({action:'account_password',password:PW}),/CODE_REQUIRED/);
 const sent=await handle({action:'account_password_code'});assert.equal(sent.email,'megumin@example.com');assert.equal(r.mails.at(-1).body.to[0],'megumin@example.com');
 await assert.rejects(()=>handle({action:'account_password',password:PW,code:'12 34'}),/WRONG_CODE/);
 let s=await handle({action:'account_password',password:PW,code:r.lastCode()});assert.equal(s.hasPassword,true);
 clock.now+=61e3;await handle({action:'account_password_code'});
 s=await handle({action:'account_password',password:PW+'3',code:r.lastCode(),current:'ignored when a code is given'});assert.equal(s.hasPassword,true);
 assert.equal((await r.env.DB.prepare('SELECT COUNT(*) n FROM account_sessions').first()).n,1,'still signed in');
 await pc.a.logout();await assert.rejects(()=>handle({action:'account_password_code'}),/UNAUTHORIZED/);
});

test('UI: two sign-in modes, the user name warning, the password section, the suggestion after a code sign-in',()=>{
 const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),ui=read('web/account-ui.js');
 for(const s of ['验证码登录','密码登录','邮箱或用户名','用户名只能设置一次，设置后永远不能更改','设置密码','修改密码','当前密码','正在发送验证码','忘记当前密码？用邮箱验证码重设','改密码后，其他已登录的设备不会被退出','パスワードでログイン','Sign in with a password','can never be changed'])assert.ok(ui.includes(s),s);
 for(const action of ['account_password_login','account_username','account_password','account_password_code'])assert.ok(ui.includes(`'${action}'`),action);
 assert.match(ui,/suggestPassword/);assert.match(ui,/autocomplete="current-password"/);assert.match(ui,/autocomplete="new-password"/);
 assert.doesNotMatch(ui,/store\.set\([^)]*password\.value/,'the password is never kept in localStorage');
 assert.match(read('web/unify.css'),/\.login-modes\{/);
 for(const f of ['services/account.cjs','web/account-ui.js'])assert.doesNotMatch(read(f).split('\n').slice(1).join('\n'),/(^|[;{}])\s*\/\/(?!\/)/m,f+' has no inline // comments');
});
