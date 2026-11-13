process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* E377 client side of the opt-in leaderboard: local aggregation, opt-in / opt-out, the not-configured state, the shared
   relay address, nickname rules shared with the relay, and the top tab. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const lb=require('../services/leaderboard.cjs'),relay=require('../services/relay-config.cjs'),{SCHEMA}=require('../services/store.cjs'),{Settings}=require('../services/settings.cjs');
const NO_ENV={MEGULIT_RELAY_BASE:'off'},BASE_ENV={MEGULIT_RELAY_BASE:'https://relay.test'};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-lb-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const db=new DatabaseSync(':memory:');db.exec(SCHEMA);t.after(()=>db.close());return {root,db};
}
const at=(y,m,d,h=12)=>Math.floor(new Date(y,m-1,d,h).getTime()/1000);
function seed(db){
 db.prepare("INSERT INTO games(id,title) VALUES('g1','ATRI'),('g2','千恋＊万花'),('g3','Hidden')").run();db.prepare("UPDATE games SET hidden_at=1 WHERE id='g3'").run();
 const s=db.prepare('INSERT INTO reading_sessions(game_id,started_at,ended_at,active_seconds,characters) VALUES(?,?,?,?,?)');
 /* Tue 2026-11-10 is "now"; this week = Mon 9th..; this month = 1st.. */
 s.run('g1',at(2026,11,10),null,600,1000);s.run('g1',at(2026,11,9),null,300,500);s.run('g2',at(2026,11,8),null,1200,2000);
 s.run('g2',at(2026,11,7),null,60,100);s.run('g1',at(2026,10,20),null,3600,9000);s.run('g3',at(2026,11,10),null,10,10);
 s.run('g1',at(2026,11,5),null,0,0);
 const w=db.prepare("INSERT INTO vocabulary(spelling,reading,definitions,created_at,original) VALUES('語','ご','[]',?,'{}')");
 w.run(at(2026,11,10));w.run(at(2026,11,3));w.run(at(2026,9,1));
}
const NOW=new Date(2026,10,10,20,0,0);

test('collectStats sums week / month / all time, words and streaks from local records only',t=>{
 const {db}=fixture(t);seed(db);const s=lb.collectStats(db,NOW);
 assert.deepEqual(s.keys,{week:'2026-W46',month:'2026-11',all:'all'});
 assert.deepEqual(s.stats.week,{characters:1510,seconds:910,words:1,streak:2,reviews:0,kana:0});
 assert.deepEqual(s.stats.month,{characters:3610,seconds:2170,words:2,streak:4,reviews:0,kana:0});
 assert.deepEqual(s.stats.all,{characters:12610,seconds:5770,words:3,streak:4,reviews:0,kana:0});
 assert.equal(s.currentStreak,4);
 assert.deepEqual(s.games.map(g=>[g.title,g.characters]),[['ATRI',10500],['千恋＊万花',2100]],'hidden games stay out');
 assert.equal(lb.longestRun(['2026-01-01','2026-01-02','2026-01-04']),2);
 assert.equal(lb.currentRun(['2026-11-08','2026-11-09'],NOW),2,'today without reading keeps yesterday\'s run');
});

test('relay address: env, then Settings, then the built-in default; https only except localhost',t=>{
 const {root}=fixture(t);
 assert.equal(relay.DEFAULT_RELAY_BASE,'https://api.megulit.com');
 assert.equal(relay.relayBase(root,{}),'https://api.megulit.com');
 assert.equal(relay.relayBase(root,NO_ENV),'');
 assert.equal(relay.relayBase(root,{MEGULIT_RELAY_BASE:'https://r.example/'}),'https://r.example');
 for(const bad of ['http://r.example','https://u:p@r.example','https://r.example/?a=1','ftp://r.example','not a url'])assert.equal(relay.normalizeBase(bad),'',bad);
 assert.equal(relay.normalizeBase('http://127.0.0.1:8787'),'http://127.0.0.1:8787');
 const settings=new Settings(root);settings.save({scope:'online',values:{relayUrl:'https://relay.megulit.example/'}});
 assert.equal(relay.relayBase(root,NO_ENV),'https://relay.megulit.example');
 assert.equal(relay.endpoint(root,'/api/diagnostics',NO_ENV),'https://relay.megulit.example/api/diagnostics');
 assert.throws(()=>settings.save({scope:'online',values:{relayUrl:'http://relay.megulit.example'}}),/SETTINGS_INVALID_URL/);
 assert.throws(()=>settings.save({scope:'online',values:{leaderboardName:'fuck'}}),/LEADERBOARD_NAME_BLOCKED/);
});

test('not configured: the page gets local numbers and a not-configured board, and nothing is sent',async t=>{
 const {root,db}=fixture(t);seed(db);let calls=0;const fetch=async()=>{calls++;throw Error('must not fetch');};
 const before=await lb.view(root,db,{period:'month',metric:'characters'},{env:NO_ENV,fetch,now:NOW});
 assert.equal(before.configured,false);assert.deepEqual(before.board,{state:'not-configured'});assert.equal(before.local.stats.month.characters,3610);
 lb.join(root,{name:'めぐみん',consent:true});
 assert.deepEqual(await lb.submit(lb.collectStats(db,NOW),{root,env:NO_ENV,fetch}),{state:'not-configured'});
 assert.deepEqual(await lb.fetch('week','characters',{root,env:NO_ENV,fetch}),{state:'not-configured'});
 assert.deepEqual(await lb.leave(root,{env:NO_ENV,fetch}),{state:'left',remote:'not-configured'});
 assert.equal(calls,0);
});

test('opt-in needs consent and a clean nickname; only totals are uploaded; games only when shared',async t=>{
 const {root,db}=fixture(t);seed(db);const sent=[];
 const fetch=async(url,init)=>{sent.push({url,method:init.method,body:init.body?JSON.parse(init.body):null});return new Response(JSON.stringify(init.method==='GET'?{entries:[{rank:1,name:'めぐみん',value:1510,me:true}],total:1,me:{rank:1,value:1510}}:{ok:true}),{status:200});};
 assert.deepEqual(await lb.submit(lb.collectStats(db,NOW),{root,env:BASE_ENV,fetch}),{state:'disabled'},'nothing before joining');
 assert.throws(()=>lb.join(root,{name:'めぐみん'}),/LEADERBOARD_CONSENT_REQUIRED/);
 /* E385 the app (bridge) joins only with a signed-in account */
 assert.throws(()=>lb.join(root,{name:'めぐみん',consent:true,requireAccount:true},{account:null}),/LEADERBOARD_ACCOUNT_REQUIRED/);
 assert.equal(lb.join(root,{name:'めぐみん',consent:true,requireAccount:true},{account:{accountId:'acc1',token:()=>''}}).joined,true);
 assert.throws(()=>lb.join(root,{name:'a',consent:true}),/LEADERBOARD_NAME_LENGTH/);
 assert.throws(()=>lb.join(root,{name:'sb',consent:true}),/LEADERBOARD_NAME_BLOCKED/);
 const joined=lb.join(root,{name:'  めぐみん ',consent:true});assert.equal(joined.joined,true);assert.match(joined.installId,/^[0-9a-f-]{36}$/);
 const view=await lb.view(root,db,{period:'week',metric:'characters'},{env:BASE_ENV,fetch,now:NOW});
 assert.equal(view.submit.state,'ok');assert.equal(view.board.entries[0].me,true);
 const post=sent.find(r=>r.method==='POST');
 assert.equal(post.url,'https://relay.test/api/leaderboard');
 /* 2026-11-12 转职: the level (and the element once chosen) ride along */
 assert.deepEqual(Object.keys(post.body).sort(),['hot','id','keys','level','name','stats','version']);assert.equal(typeof post.body.level,'number');assert.deepEqual(post.body.hot,{week:'2026-W46',terms:[]},'no lookups recorded');
 assert.deepEqual(post.body.stats.week,{characters:1510,seconds:910,words:1,streak:2,reviews:0,kana:0});
 assert.equal(post.body.name,'めぐみん');assert.ok(!JSON.stringify(post.body).includes(os.hostname()),'no machine names');
 const get=sent.find(r=>r.method==='GET');assert.match(get.url,/period=week&metric=characters&key=2026-W46&me=[0-9a-f]{64}$/);
 /* within 10 minutes the page does not post again */
 await lb.view(root,db,{},{env:BASE_ENV,fetch,now:new Date(NOW.getTime()+60000)});assert.equal(sent.filter(r=>r.method==='POST').length,1);
 lb.join(root,{name:'めぐみん',consent:true,shareGames:true});
 await lb.submit(lb.collectStats(db,NOW),{root,env:BASE_ENV,fetch});
 assert.deepEqual(sent.at(-1).body.games.map(({last,...g})=>g),[{title:'ATRI',characters:10500,seconds:4500},{title:'千恋＊万花',characters:2100,seconds:1260}]);
});

test('opt-out: Settings switch off deletes the server entry and forgets the id and consent',async t=>{
 const {root}=fixture(t),calls=[];const fetch=async(url,init)=>{calls.push([init.method,url]);return new Response('{"ok":true}');};
 const {installId}=lb.join(root,{name:'Kazuma',consent:true});
 const left=await lb.leave(root,{env:BASE_ENV,fetch});
 assert.deepEqual(left,{state:'left',remote:'deleted'});assert.deepEqual(calls,[['DELETE','https://relay.test/api/leaderboard?id='+installId]]);
 const c=lb.config(root,BASE_ENV);assert.equal(c.joined,false);assert.equal(c.enabled,false);assert.equal(c.installId,'');
 assert.equal(new Settings(root).get().values.online.leaderboardEnabled,false);
 /* a failed delete still forgets locally and reports the error */
 lb.join(root,{name:'Kazuma',consent:true});
 const failed=await lb.leave(root,{env:BASE_ENV,fetch:async()=>{throw Error('offline');}});assert.equal(failed.remote,'NETWORK');assert.equal(lb.config(root,BASE_ENV).installId,'');
 /* turning the switch on in Settings alone is not consent */
 new Settings(root).save({scope:'online',values:{leaderboardEnabled:true,leaderboardName:'Kazuma'}});assert.equal(lb.config(root,BASE_ENV).joined,false);
});

test('bridge: switching 参加排行榜 off in Settings calls leave',async t=>{
 const {root}=fixture(t);
 /* bridge reads MEGULIT_ROOT at load time, so load it in a child with its own root */
 const {execFileSync}=require('node:child_process');
 lb.join(root,{name:'Kazuma',consent:true});
 const out=execFileSync(process.execPath,['-e',`require(${JSON.stringify(path.join(__dirname,'..','services','bridge.cjs'))}).dispatch({action:'settings_save',scope:'online',values:{leaderboardEnabled:false}}).then(r=>console.log(JSON.stringify(r.values.online))).catch(e=>console.log('ERR '+e.message))`],{env:{...process.env,MEGULIT_ROOT:root,MEGULIT_RELAY_BASE:''},encoding:'utf8'});
 assert.equal(JSON.parse(out.trim().split('\n').pop()).leaderboardEnabled,false);
 assert.equal(lb.config(root,NO_ENV).installId,'','id forgotten');
});

test('nickname rules match the relay; fetch output is sanitized',async t=>{
 const relayValidate=await import(pathToFileURL(path.join(__dirname,'..','relay','src','validate.js')).href);
 const samples=['めぐみん','Kazuma','a','x'.repeat(17),'grape lover','fuckyou','傻逼123','SB','sb2','admin','MeguLit官方','see http://x','a@b','名前​','<b>hi</b>','  爆裂  魔法  ','ＭＥＧＵ','Dickens','死ね死ね'];
 for(const name of samples)assert.deepEqual(lb.cleanName(name),relayValidate.cleanName(name),name);
 assert.deepEqual(relayValidate.BLOCKED,lb.BLOCKED,'one block list on both sides');
 assert.equal(lb.cleanName('  爆裂  魔法  ').name,'爆裂 魔法');assert.equal(lb.cleanName('grape lover').ok,true);
 const {root}=fixture(t);lb.join(root,{name:'Kazuma',consent:true});
 const res=await lb.fetch('all','streak',{root,env:BASE_ENV,fetch:async()=>new Response(JSON.stringify({entries:[{rank:'1',name:'x'.repeat(50),value:-5,me:'yes',extra:1}],total:3}))});
 assert.deepEqual(res.entries,[{rank:1,name:'x'.repeat(32),value:0,me:false,avatar:null,pid:null,element:'',level:0}]);
 assert.deepEqual(await lb.fetch('week','characters',{root,env:BASE_ENV,fetch:async()=>new Response('{"ok":false,"error":"RATE_LIMITED"}',{status:429})}),{state:'error',error:'RATE_LIMITED',retryAfter:60});
 await assert.rejects(()=>lb.fetch('year','characters',{root,env:BASE_ENV}),/LEADERBOARD_INVALID_QUERY/);
});

test('top tab 排行榜 sits between 学习 and 工具 and the page renders the not-ready state',async()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');
 assert.ok(app.includes("['home','library','history','learning'].map(tabButton)"));assert.ok(app.includes("['leaderboard','daily'].map(tabButton)"));assert.ok(app.includes("['tools','settings','about'].map("));assert.ok(app.includes('data-top-me'));
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','leaderboard-view.js')).href);
 assert.deepEqual(view.leaderboardLabel,{zh:'排行榜',ja:'ランキング',en:'Leaderboard'});
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const local={stats:{week:{characters:1510,seconds:910,words:1,streak:2}},currentStreak:4};
 const zh=view.leaderboardHTML({configured:false,local,board:{state:'not-configured'}},'zh',esc);
 assert.match(zh,/联网服务还在准备中/);assert.match(zh,/1,510 字/);assert.doesNotMatch(zh,/data-lb-join/);
 assert.match(view.leaderboardHTML({configured:false,local},'ja',esc),/オンラインサービスは準備中です/);
 const guest=view.leaderboardHTML({configured:true,joined:false,account:false,local,board:{state:'ok',entries:[]}},'zh',esc);
 assert.match(guest,/data-lb-login/);assert.match(guest,/用邮箱登录/);assert.doesNotMatch(guest,/data-lb-join/);
 const signed=view.leaderboardHTML({configured:true,joined:false,account:true,local,board:{state:'ok',entries:[]}},'en',esc);
 assert.match(signed,/data-lb-join/);assert.doesNotMatch(signed,/data-lb-login/);
 const board=view.leaderboardHTML({configured:true,joined:true,name:'<x>',local,board:{state:'ok',entries:[{rank:1,name:'<img>',value:3600,me:true}],me:{rank:1,value:3600}}},'zh',esc);
 assert.doesNotMatch(board,/<img>|<x>/);assert.match(board,/is-me/);
 for(const locale of ['zh','ja','en'])assert.deepEqual(Object.keys(view.leaderboardWords(locale)).sort(),Object.keys(view.leaderboardWords('zh')).sort(),locale);
 assert.equal(view.formatValue('seconds',3660,'zh'),'1 小时 1 分钟');
});

/* ---- E379 ---------------------------------------------------------------------------------------------------- */
test('weekly lookups: UTC+8 Monday boundary, Japanese terms only, term + count only in the upload',async t=>{
 const {root,db}=fixture(t);
 const ins=db.prepare('INSERT INTO lookup_events(surface,occurred_at,original) VALUES(?,?,?)');
 const s=d=>Math.floor(new Date(d).getTime()/1000);
 for(const [surface,when]of [['仕方ない','2026-11-09T01:00:00Z'],['仕方ない','2026-11-10T01:00:00Z'],['ｼｶﾀﾅｲ','2026-11-10T01:00:00Z'],['  気をつけて ','2026-11-10T02:00:00Z'],['hello','2026-11-10T02:00:00Z'],['先週','2026-11-08T15:59:00Z'],['今週','2026-11-08T16:00:00Z']])ins.run(surface,s(when),'{}');
 const now=new Date('2026-11-10T12:00:00Z'),hot=lb.collectLookups(db,now);
 assert.equal(hot.week,'2026-W46');
 assert.deepEqual(hot.terms[0],{term:'仕方ない',count:2});
 assert.ok(!hot.terms.some(x=>x.term==='hello'||x.term==='先週'));
 assert.deepEqual(hot.terms.map(x=>x.term).sort(),['シカタナイ','今週','仕方ない','気をつけて'].sort());
 lb.join(root,{name:'Kazuma',consent:true});const sent=[];
 await lb.submit(lb.collectStats(db,now),{root,env:BASE_ENV,account:null,now,fetch:async(u,i)=>{sent.push(JSON.parse(i.body));return new Response('{"ok":true}');}});
 assert.equal(sent[0].hot.week,'2026-W46');for(const x of sent[0].hot.terms)assert.deepEqual(Object.keys(x).sort(),['count','term']);
 const relayValidate=await import(pathToFileURL(path.join(__dirname,'..','relay','src','validate.js')).href);
 for(const term of ['仕方ない','ｼｶﾀﾅｲ','hello','a\b語','x`語','<b>語','語'.repeat(41)])assert.equal(lb.cleanTerm(term),relayValidate.cleanTerm(term),term);
 assert.equal(lb.hotWeekKey(now),relayValidate.hotWeekKey(now));
});

test('account identity: bearer token sent, me = sha256(account:id), rotated token saved',async t=>{
 const {root,db}=fixture(t);lb.join(root,{name:'Kazuma',consent:true});
 const saved=[],account={accountId:'acc9',token:()=>'mgl_'+'B'.repeat(43),save:x=>saved.push(x)},seen=[];
 const fetch=async(url,init)=>{seen.push({url,auth:init.headers.authorization});return new Response('{"ok":true,"entries":[]}',{headers:{'x-megulit-token':'mgl_'+'C'.repeat(43)}});};
 await lb.view(root,db,{},{env:BASE_ENV,fetch,account,now:NOW});
 assert.equal(seen[0].auth,'Bearer mgl_'+'B'.repeat(43),'POST carries the session');assert.equal(seen[1].auth,undefined,'public reads do not');
 assert.match(seen[1].url,new RegExp('me='+lb.publicHash('account:acc9')));
 assert.deepEqual(saved,['mgl_'+'C'.repeat(43)]);
 assert.equal(lb.config(root,BASE_ENV,{account:null}).me,lb.publicHash(lb.config(root,BASE_ENV,{account:null}).installId));
});

test('avatars: only small WebP goes up; pictures come back as cached data URLs; reports',async t=>{
 const {root}=fixture(t);lb.join(root,{name:'Kazuma',consent:true});
 await assert.rejects(lb.setAvatar(root,Buffer.from('GIF89a'.padEnd(40,'x')).toString('base64'),{env:BASE_ENV,account:null}),/LEADERBOARD_AVATAR_INVALID/);
 const webp=Buffer.alloc(40);webp.write('RIFF',0,'latin1');webp.writeUInt32LE(32,4);webp.write('WEBP',8,'latin1');webp.write('VP8L',12,'latin1');
 const sent=[];const fetch=async(url,init)=>{sent.push({url,method:init.method,type:init.headers['content-type'],size:init.body?.length});
  if(url.includes('/api/leaderboard/avatar'))return new Response(JSON.stringify({ok:true,status:'rejected',reason:'NSFW',avatar:null}));
  if(url.includes('/report'))return new Response('{"ok":true,"hidden":true}');
  return new Response(webp);};
 const r=await lb.setAvatar(root,'data:image/webp;base64,'+webp.toString('base64'),{env:BASE_ENV,account:null,fetch});
 assert.deepEqual(r,{state:'ok',status:'rejected',reason:'NSFW'});assert.equal(sent[0].type,'image/webp');assert.equal(sent[0].size,40);
 const id='a'.repeat(32),images=await lb.avatarImages(root,[id,'not-an-id',id],{env:BASE_ENV,fetch});
 assert.deepEqual(Object.keys(images),[id]);assert.match(images[id],/^data:image\/webp;base64,/);
 const again=await lb.avatarImages(root,[id],{env:BASE_ENV,fetch:async()=>{throw Error('cached, no fetch');}});assert.equal(again[id],images[id]);
 const notWebp=await lb.avatarImages(root,['b'.repeat(32)],{env:BASE_ENV,fetch:async()=>new Response('<html>')});assert.deepEqual(notWebp,{});
 assert.deepEqual(await lb.report(root,id,{env:BASE_ENV,account:null,fetch}),{state:'ok',hidden:true});
 await assert.rejects(lb.report(root,'../x',{env:BASE_ENV}),/LEADERBOARD_INVALID_QUERY/);
 assert.deepEqual(await lb.avatarStatus(fixture(t).root,{env:NO_ENV}),{state:'not-configured',status:'none'});
});

test('name filter also blocks R18 and abuse words on both sides',async()=>{
 const relayValidate=await import(pathToFileURL(path.join(__dirname,'..','relay','src','validate.js')).href);
 for(const name of ['hentai王','R18大好き','エロ魔法使い','巨乳控','智障一号','nmsl','ロリコン','ヘンタイ紳士'])assert.equal(lb.cleanName(name).error,'NAME_BLOCKED',name);
 for(const name of ['ゆんゆん','Aqua','ダクネス','爆裂道'])assert.equal(lb.cleanName(name).ok,true,name);
 assert.deepEqual(relayValidate.BLOCKED,lb.BLOCKED);
});

test('E394 个人主页: leaderboard fields leave 联网服务, search lands on the profile page, the bridge reads them without the board',async t=>{
 const layout=await import(pathToFileURL(path.join(__dirname,'..','web','settings-layout.js')).href);
 const fields=[{scope:'online',key:'leaderboardEnabled'},{scope:'online',key:'leaderboardName'},{scope:'online',key:'leaderboardShareGames'},{scope:'online',key:'relayUrl'}];
 assert.deepEqual(layout.visibleFields('online',fields).map(f=>f.key),['relayUrl']);
 /* E404 个人主页 is a panel now, not a settings page */
 assert.ok(!layout.navigation.some(c=>c.ids.includes('personal')),'no 个人主页 page in the settings nav');
 const search=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'..','web','settings-search.js')).toString('base64'));
 const entries=search.globalSearchEntries({fields:fields.map(f=>({...f,label:{zh:f.key==='leaderboardName'?'排行榜昵称':f.key,en:f.key}}))},{});
 assert.equal(entries.find(e=>e.key==='leaderboardName').scope,'personal');assert.equal(entries.find(e=>e.key==='relayUrl').scope,'online');
 const hits=q=>entries.filter(e=>search.matchesSetting(e,q)).map(e=>e.scope);
 assert.ok(hits('touxiang').includes('personal'),'头像 by pinyin');assert.ok(hits('gerenzhuye').includes('personal'),'个人主页 by pinyin');assert.ok(hits('tuichu').includes('personal'),'退出 by pinyin');
 const view=fs.readFileSync(path.join(__dirname,'..','web','leaderboard-view.js'),'utf8');assert.doesNotMatch(view,/data-lb-leave/,'no leave button on the 排行榜 page');assert.match(view,/openProfilePanel\(/);
 const {root}=fixture(t);lb.join(root,{name:'Kazuma',shareGames:true,consent:true});
 const {execFileSync}=require('node:child_process');
 const out=execFileSync(process.execPath,['-e',`require(${JSON.stringify(path.join(__dirname,'..','services','bridge.cjs'))}).dispatch({action:'leaderboard_profile'}).then(r=>console.log(JSON.stringify(r))).catch(e=>console.log('ERR '+e.message))`],{env:{...process.env,MEGULIT_ROOT:root,MEGULIT_RELAY_BASE:''},encoding:'utf8'});
 const r=JSON.parse(out.trim().split('\n').pop());assert.deepEqual([r.joined,r.name,r.shareGames,typeof r.configured],[true,'Kazuma',true,'boolean']);assert.equal(r.board,undefined,'no board fetch');
});

test('E397 client: signature rules match the relay, last-read times ride along, social calls need an account and stay private-safe',async t=>{
 const relayValidate=await import(pathToFileURL(path.join(__dirname,'..','relay','src','validate.js')).href);
 for(const sample of ['(｡･ω･｡)','( ´∀｀)','(｀・ω・´)','ヽ(✿ﾟ▽ﾟ)ノ','(@_@)','mail a@b.cn','爆裂魔法 一日一发','','あ'.repeat(61),'看 www.x.com','r18 only','约炮吗','I love MeguLit','you are a bitch','<b>','Dickens fan',undefined,7])assert.deepEqual(lb.cleanBio(sample),relayValidate.cleanBio(sample),String(sample));
 assert.deepEqual(lb.REPORT_KINDS,relayValidate.REPORT_KINDS);
 const {root,db}=fixture(t);seed(db);const stats=lb.collectStats(db,NOW);
 assert.equal(stats.games.find(g=>g.title==='ATRI').last,at(2026,11,10),'newest session start');
 lb.join(root,{name:'Kazuma',shareGames:true,consent:true});
 const sent=[];await lb.submit(stats,{root,env:BASE_ENV,account:null,now:NOW,fetch:async(u,i)=>{sent.push(JSON.parse(i.body));return new Response('{"ok":true}');}});
 assert.ok(sent[0].games.every(g=>Number.isInteger(g.last)&&g.last<=Math.floor(NOW.getTime()/1000)));
 /* no account: nothing is sent */
 let calls=0;const none={env:BASE_ENV,account:null,fetch:async()=>{calls++;return new Response('{}');}};
 assert.equal((await lb.profileGet(root,none)).state,'login');assert.equal((await lb.followSet(root,'0123456789abcdef',true,none)).state,'login');assert.equal((await lb.social(root,none)).state,'login');
 assert.equal(calls,0);
 await assert.rejects(()=>lb.profileSave(root,{bio:'约炮吗'},none),/LEADERBOARD_BIO_BLOCKED/,'checked before sending');
 await assert.rejects(()=>lb.reportProfile(root,'0123456789abcdef',{kind:'bad'},none),/LEADERBOARD_INVALID_KIND/);
 /* with an account: bearer token, cleaned replies; a private card is just "private" */
 const account={accountId:'acc9',token:()=>'mgl_'+'B'.repeat(43),save:()=>{}},seen=[];
 const replies={'/api/profile/0123456789abcdef':[404,{ok:false,error:'NOT_FOUND'}],'/api/following':[200,{following:[{pid:'0123456789abcdef',name:'Aqua',public:true,avatar:'zz',recent:[{title:'ATRI',last:5},{title:'x'.repeat(300),last:'bad'}]}]}],'/api/kindred':[200,{kindred:[{pid:'nope',name:'bad'},{pid:'fedcba9876543210',name:'Wiz',shared:['ATRI'],count:1}]}],'/api/profile':[200,{joined:true,pid:null,public:false,hidden:true,bio:'hi',favorites:[{title:'ATRI',vndb:'javascript:'}]}]};
 const fetch=async(url,init)=>{const route=new URL(url).pathname;seen.push({route,method:init.method,auth:init.headers.authorization});const [status,data]=replies[route]||[404,{}];return new Response(JSON.stringify(data),{status});};
 const opts={env:BASE_ENV,account,fetch};
 assert.deepEqual(await lb.profileCard(root,'0123456789abcdef',opts),{state:'private'});assert.deepEqual(await lb.profileCard(root,'../x',opts),{state:'private'});
 const own=await lb.profileGet(root,opts);assert.deepEqual([own.hidden,own.favorites],[true,[{title:'ATRI',vndb:''}]]);
 const s=await lb.social(root,opts);assert.equal(s.following[0].avatar,null,'bad avatar id dropped');assert.equal(s.following[0].recent[1].title.length,120);assert.equal(s.following[0].recent[1].last,0);
 assert.deepEqual(s.kindred.map(p=>p.name),['Wiz'],'rows without a valid pid are dropped');
 assert.ok(seen.every(c=>c.auth==='Bearer mgl_'+'B'.repeat(43)));
 const view=await lb.view(root,db,{tab:'follow'},{...opts,now:NOW});assert.equal(view.tab,'follow');assert.equal(view.social.state,'ok');
 assert.deepEqual(lb.libraryTitles(db),['ATRI','千恋＊万花'],'hidden games are not offered');
});

test('E401 reviews and kana practice: counted per period, Anki answers that come back with a sync count once, word total kept apart',async t=>{
 const {root,db}=fixture(t);seed(db);
 db.exec('CREATE TABLE IF NOT EXISTS anki_review_events(operation_id TEXT PRIMARY KEY,card_id INTEGER NOT NULL,ease INTEGER NOT NULL,reviewed_at INTEGER NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS anki_synced_reviews(review_id INTEGER PRIMARY KEY,word_id INTEGER NOT NULL)');
 const r=db.prepare('INSERT INTO review_events(word_id,reviewed_at) VALUES(1,?)');r.run(at(2026,11,10));r.run(at(2026,11,9));r.run(at(2026,11,2));r.run(at(2026,10,1));
 const a=db.prepare('INSERT INTO anki_review_events VALUES(?,1,3,?)');a.run('op1',at(2026,11,10,9));a.run('op2',at(2026,11,10,10));
 /* op2 came back with an Anki sync (review id = epoch ms, 2 s later): already in review_events, so it is not counted twice */
 db.prepare('INSERT INTO anki_synced_reviews VALUES(?,1)').run(at(2026,11,10,10)*1000+2000);r.run(at(2026,11,10,10)+2);
 const ms=(y,m,d)=>new Date(y,m-1,d,12).getTime(),log=n=>Array.from({length:n},()=>({show:'あ',ok:true}));
 fs.mkdirSync(path.join(root,'data'),{recursive:true});
 fs.writeFileSync(path.join(root,'data','kana-progress.json'),JSON.stringify({version:1,runs:[{id:ms(2026,11,10),log:log(20)},{id:ms(2026,11,3),log:log(12)},{id:ms(2026,9,1),log:log(5)}]}));
 const s=lb.collectStats(db,NOW,root);
 assert.deepEqual([s.stats.week.reviews,s.stats.month.reviews,s.stats.all.reviews],[4,5,6]);
 assert.deepEqual([s.stats.week.kana,s.stats.month.kana,s.stats.all.kana],[20,32,37]);
 assert.equal(s.totals.words,3,'all-time words saved, apart from "new this week"');assert.equal(s.stats.week.words,1);
 assert.equal(lb.collectStats(db,NOW).stats.week.kana,0,'no root: no kana file read');
 /* only numbers are uploaded */
 lb.join(root,{name:'Kazuma',consent:true});const sent=[];
 await lb.submit(s,{root,env:BASE_ENV,account:null,now:NOW,fetch:async(u,i)=>{sent.push(JSON.parse(i.body));return new Response('{"ok":true}');}});
 assert.deepEqual(sent[0].stats.week,{characters:1510,seconds:910,words:1,streak:2,reviews:4,kana:20});
 const relayValidate=await import(pathToFileURL(path.join(__dirname,'..','relay','src','validate.js')).href);
 assert.equal(relayValidate.validateLeaderboard(sent[0],NOW).ok,true);
 /* an older client without the new numbers is still accepted; they count as 0 */
 const old=JSON.parse(JSON.stringify(sent[0]));for(const p of ['week','month','all']){delete old.stats[p].reviews;delete old.stats[p].kana;}
 const checked=relayValidate.validateLeaderboard(old,NOW);assert.equal(checked.ok,true);assert.equal(checked.value.stats.week.kana,0);
 const big=JSON.parse(JSON.stringify(sent[0]));big.stats.week.reviews=100001;assert.equal(relayValidate.validateLeaderboard(big,NOW).error,'STATS_OUT_OF_RANGE');
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','leaderboard-view.js')).href);
 assert.equal(view.formatValue('kana',20,'zh'),'20 题');assert.equal(view.formatValue('reviews',4,'en'),'4 reviews');
});

test('E402 every tab draws the same top and sub rows (no jump), the podium keeps empty stands, one empty-state look',async()=>{
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','leaderboard-view.js')).href);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const local={stats:{week:{}},totals:{words:3}};
 const pages={loading:view.leaderboardHTML(null,'zh',esc),board:view.leaderboardHTML({configured:true,joined:true,tab:'board',name:'A',board:{state:'ok',entries:[{rank:1,name:'A',value:5,me:true}],me:{rank:1,value:5}},local,avatars:{}},'zh',esc),
  hot:view.leaderboardHTML({configured:true,joined:true,tab:'hot',hot:{state:'ok',settled:false,awards:[],weeks:[]},local},'zh',esc),follow:view.leaderboardHTML({configured:true,joined:true,tab:'follow',social:{state:'ok',following:[],kindred:[],avatars:{}},local},'zh',esc)};
 for(const [name,html] of Object.entries(pages)){
  assert.ok(html.indexOf('lb-toprow')<html.indexOf('lb-subrow')&&html.indexOf('lb-subrow')<html.indexOf('lb-body'),name+': rows in order');
  assert.match(html,/class="lb-toprow"><div class="lb-seg" role="group" data-lb-group="tab">/,name+': the tab switch opens the top row');
  assert.doesNotMatch(html,/lb-title|<h1/,name+': no page title (the top bar already says 排行榜)');
 }
 assert.match(pages.board,/lb-toprow-end"><button type="button" class="lb-mychip" data-lb-me/,'my rank sits at the right of the top row');
 assert.doesNotMatch(pages.board,/lb-stage|lb-place/,'E419 no podium for readers');assert.equal((pages.board.match(/class="lb-grimoire[ "]/g)||[]).length,1,'one equal card per reader');
 assert.match(pages.hot,/lb-empty-state/);assert.equal((pages.follow.match(/lb-empty-state/g)||[]).length,2);
 assert.doesNotMatch(pages.board,/is-accent/,'all tiles look the same');assert.equal((pages.board.match(/class="lb-tile"/g)||[]).length,8);
});

test('E404 the 我的主页 chip shows on every tab and opens the panel; signed out it says 注册 / 登录; settings page gone',async()=>{
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','leaderboard-view.js')).href);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const base={configured:true,local:{stats:{week:{}},totals:{words:0}},avatars:{}};
 const chip=html=>(html.match(/<button type="button" class="lb-mychip"[\s\S]*?<\/button>/)||[''])[0];
 const guest=view.leaderboardHTML({...base,joined:false,account:false,tab:'hot',hot:{state:'ok',settled:false,awards:[],weeks:[]}},'zh',esc);
 assert.match(chip(guest),/我的主页/);assert.match(chip(guest),/注册 \/ 登录/);
 const follow=view.leaderboardHTML({...base,joined:true,account:true,name:'めぐみん',tab:'follow',self:{avatar:null},social:{state:'ok',following:[],kindred:[],avatars:{}}},'ja',esc);
 assert.match(chip(follow),/マイページ/);assert.match(chip(follow),/めぐみん/);
 const board=view.leaderboardHTML({...base,joined:true,account:true,name:'A',tab:'board',board:{state:'ok',entries:[{rank:3,name:'A',value:9,me:true}],me:{rank:3,value:9}}},'en',esc);
 assert.match(chip(board),/My profile/);assert.doesNotMatch(chip(board),/#3/,'E419 no rank on the chip');assert.match(chip(board),/data-lb-me/);
 for(const html of [guest,follow,board])assert.equal((chip(html).match(/<small>/g)||[]).length,1,'same two-line chip in every state');
 const settings=fs.readFileSync(path.join(__dirname,'..','web','settings.js'),'utf8');assert.match(settings,/section==='personal'\)\{openProfilePanel/);assert.doesNotMatch(settings,/mountProfileSettings/);
 const panel=fs.readFileSync(path.join(__dirname,'..','web','profile-panel.js'),'utf8');assert.match(panel,/mountEmailLogin/);assert.match(panel,/onSignedOut:\(\)=>paint\(\)/);
});

test('E420 the board head: most-read work with cover for time / characters, a lookup word for new words, the circle otherwise',async()=>{
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','leaderboard-view.js')).href);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const entries=[{rank:1,name:'A',value:3600}];
 const html=(metric,extra)=>{view.setView?.({metric});return view.boardHTML({board:{state:'ok',entries,...extra}},{},'zh',esc);};
 const work=html('seconds',{feature:{title:'作品',value:7200,readers:5,cover:'data:image/png;base64,AA=='}});
 assert.match(work,/lb-circle is-feature/);assert.match(work,/作品/);assert.match(work,/<img src="data:image\/png/);
 const word=html('words',{word:{term:'憧憬',users:4}});
 assert.match(word,/data-lb-lookup="憧憬"/);assert.doesNotMatch(word,/lb-sigil/);
 assert.match(html('reviews',{}),/lb-sigil/);
 const worker=fs.readFileSync(path.join(__dirname,'..','relay','src','worker.js'),'utf8');assert.match(worker,/return json\(\{entries,total,me:mine,feature\}\)/);
});
