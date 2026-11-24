process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* E379 relay community features: avatar moderation (fail closed), reports, account identity, weekly hot-word privacy
   threshold, settlement and the podium split on the page. Worker runs against a node:sqlite D1 stand-in. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay');
const load=name=>import(pathToFileURL(path.join(relayDir,'src',name)).href);
const MIGRATIONS=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){
 const db=new DatabaseSync(':memory:');db.exec(MIGRATIONS);
 const stmt=(sql,args=[])=>({bind:(...a)=>{if(a.length>100)throw Error('D1 bound parameter limit');return stmt(sql,a);},first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});
 return {prepare:sql=>stmt(sql),batch:async list=>{db.exec('BEGIN');try{for(const s of list)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},raw:db};
}
function r2(){const store=new Map();return {store,put:async(k,b)=>{store.set(k,new Uint8Array(b));},get:async k=>store.has(k)?{body:store.get(k)}:null,delete:async k=>{store.delete(k);}};}
const ai=answer=>({calls:[],async run(model,input){this.calls.push({model,input});if(answer instanceof Error)throw answer;return typeof answer==='function'?answer(model,input):{response:answer};}});
const env=(extra={})=>({DB:d1(),BUCKET:r2(),HASH_SALT:'s',LINK_SECRET:'l',...extra});
const NOW=new Date('2026-11-10T04:00:00Z');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
let ipN=0;const req=(method,url,data,headers={})=>new Request('https://relay.test'+url,{method,headers:{'cf-connecting-ip':'10.1.'+(ipN>>8&255)+'.'+(ipN++&255),...(data!==undefined&&!(data instanceof Uint8Array)?{'content-type':'application/json'}:{}),...headers},body:data===undefined?undefined:data instanceof Uint8Array?data:JSON.stringify(data)});
const uuid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const stats={week:{characters:100,seconds:60,words:1,streak:1},month:{characters:100,seconds:60,words:1,streak:1},all:{characters:100,seconds:60,words:1,streak:1}};
const join=(id,extra={})=>({version:1,id,name:'Reader'+id.slice(6,8),keys:{week:'2026-W46',month:'2026-11'},stats,...extra});

test('leaderboard accepts all 100 weekly terms and replaces the prior set within the D1 parameter limit',async()=>{
 const {handle}=await load('worker.js'),e=env(),id=uuid(47);
 const terms=Array.from({length:101},(_,i)=>({term:'言葉'+i,count:1}));
 const send=(name,weekly)=>handle(req('POST','/api/leaderboard',join(id,{name,hot:{week:'2026-W46',terms:weekly}})),e,NOW);
 const sent=await send('Reader47',terms.slice(0,100));assert.equal(sent.status,200,await sent.text());
 const saved=await send('Reader48',terms.slice(1));assert.equal(saved.status,200,await saved.text());
 const rows=e.DB.raw.prepare('SELECT term FROM hot_lookups WHERE id_hash=?').all(sha(id));
 assert.equal(rows.length,100);
 assert.ok(rows.some(r=>r.term==='言葉100')&&!rows.some(r=>r.term==='言葉0'));
 assert.equal(e.DB.raw.prepare('SELECT name FROM leaderboard_users WHERE id_hash=?').get(sha(id)).name,'Reader48');
 assert.equal((await send('Reader48',[])).status,200);
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM hot_lookups').get().n,0);
});
/* minimal still WebP (VP8L header) of size×size; animated=true builds a VP8X with the animation flag */
function webp(size=128,{height=size,animated=false}={}){
 const b=new Uint8Array(40);const put=(o,s)=>[...s].forEach((c,i)=>b[o+i]=c.charCodeAt(0));put(0,'RIFF');b[4]=32;put(8,'WEBP');
 if(animated){put(12,'VP8X');b[16]=10;b[20]=0x02;const w=size-1,h=height-1;b[24]=w&255;b[25]=w>>8;b[27]=h&255;b[28]=h>>8;return b;}
 put(12,'VP8L');b[16]=20;b[20]=0x2f;const bits=(size-1)|(height-1)<<14;b[21]=bits&255;b[22]=bits>>8&255;b[23]=bits>>16&255;b[24]=bits>>24&255;return b;
}

test('moderation fails closed: only a clean SAFE approves',async()=>{
 const {moderateImage}=await load('community.js'),img=webp();const v=r=>({approved:r.approved,reason:r.reason});
 assert.deepEqual(v(await moderateImage({AI:ai('SAFE')},img)),{approved:true,reason:''});
 assert.deepEqual(v(await moderateImage({AI:ai(' safe.')},img)),{approved:true,reason:''});
 assert.deepEqual(await moderateImage({AI:ai('UNSAFE')},img),{approved:false,reason:'NSFW',answer:'UNSAFE'});
 for(const unclear of ['Probably safe','SAFE? not sure','','I cannot tell'])assert.equal((await moderateImage({AI:ai(unclear)},img)).reason,'MODERATION_UNCLEAR',unclear);
 assert.deepEqual(v(await moderateImage({AI:ai(new Error('model down'))},img)),{approved:false,reason:'MODERATION_ERROR'});
 assert.deepEqual(await moderateImage({},img),{approved:false,reason:'MODERATION_UNAVAILABLE'});
 const model=ai('SAFE');await moderateImage({AI:model,AVATAR_MODEL:'@cf/x/vision'},img);assert.equal(model.calls[0].model,'@cf/x/vision');assert.equal(model.calls[0].input.image.length,img.length);
});

test('avatars: pending is invisible, approved shows on the board, rejected is deleted; size and format checks',async()=>{
 const {handle}=await load('worker.js'),{validateAvatar}=await load('validate.js');
 assert.equal(validateAvatar(webp(128)).ok,true);
 assert.equal(validateAvatar(webp(512)).error,'AVATAR_SIZE');assert.equal(validateAvatar(webp(128,{height:100})).error,'AVATAR_SIZE');
 assert.equal(validateAvatar(webp(128,{animated:true})).error,'AVATAR_NOT_WEBP');assert.equal(validateAvatar(new TextEncoder().encode('GIF89a'.padEnd(40,'x'))).error,'AVATAR_NOT_WEBP');
 let seenWhilePending=null;const e=env();
 e.AI=ai(async()=>{const row=e.DB.raw.prepare('SELECT avatar_id,status FROM avatars').get();const res=await handle(req('GET','/api/avatar/'+row.avatar_id),e,NOW);seenWhilePending={status:row.status,http:res.status};return {response:'SAFE'};});
 const id=uuid(1);
 assert.equal((await handle(req('POST','/api/leaderboard/avatar?id='+id,webp(),{'content-type':'image/webp'}),e,NOW)).status,403,'must join first');
 await handle(req('POST','/api/leaderboard',join(id)),e,NOW);
 const up=await (await handle(req('POST','/api/leaderboard/avatar?id='+id,webp(),{'content-type':'image/webp'}),e,NOW)).json();
 assert.deepEqual(seenWhilePending,{status:'pending',http:404});
 assert.equal(up.status,'approved');assert.match(up.avatar,/^[0-9a-f]{32}$/);
 const board=await (await handle(req('GET','/api/leaderboard?period=week&metric=characters&key=2026-W46'),e,NOW)).json();assert.equal(board.entries[0].avatar,up.avatar);
 const pic=await handle(req('GET','/api/avatar/'+up.avatar),e,NOW);assert.equal(pic.status,200);assert.equal(pic.headers.get('content-type'),'image/webp');
 /* a new upload that fails replaces the old one: nothing shows; only the rejected picture is kept, privately, for an appeal */
 e.AI=ai('UNSAFE');const bad=await (await handle(req('POST','/api/leaderboard/avatar?id='+id,webp(),{'content-type':'image/webp'}),e,NOW)).json();
 assert.deepEqual([bad.status,bad.reason,bad.avatar],['rejected','NSFW',null]);assert.equal(e.BUCKET.store.size,1);
 const kept=e.DB.raw.prepare('SELECT avatar_id FROM avatars').get().avatar_id;assert.equal((await handle(req('GET','/api/avatar/'+kept),e,NOW)).status,404,'rejected pictures are never public');
 assert.equal((await handle(req('GET','/api/avatar/'+up.avatar),e,NOW)).status,404);
 const after=await (await handle(req('GET','/api/leaderboard?period=week&metric=characters&key=2026-W46'),e,NOW)).json();assert.equal(after.entries[0].avatar,null);
 e.AI=ai(new Error('boom'));assert.equal((await (await handle(req('POST','/api/leaderboard/avatar?id='+id,webp(),{'content-type':'image/webp'}),e,NOW)).json()).reason,'MODERATION_ERROR');
 const status=await (await handle(req('GET','/api/leaderboard/avatar?id='+id),e,NOW)).json();assert.deepEqual([status.status,status.avatar],['rejected',null]);
 /* leaving deletes the avatar too */
 e.AI=ai('SAFE');await handle(req('POST','/api/leaderboard/avatar?id='+id,webp(),{'content-type':'image/webp'}),e,NOW);
 await handle(req('DELETE','/api/leaderboard?id='+id),e,NOW);assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM avatars').get().n,0);assert.equal(e.BUCKET.store.size,0);
});

test('reports: distinct reporters past the threshold hide the avatar and queue it; self and repeats do not count',async()=>{
 const {handle}=await load('worker.js'),e=env({AI:ai('SAFE'),REPORT_THRESHOLD:'3'}),owner=uuid(2);
 await handle(req('POST','/api/leaderboard',join(owner)),e,NOW);
 const {avatar}=await (await handle(req('POST','/api/leaderboard/avatar?id='+owner,webp(),{'content-type':'image/webp'}),e,NOW)).json();
 assert.equal((await handle(req('POST',`/api/avatar/${avatar}/report?id=${owner}`),e,NOW)).status,400,'cannot report yourself');
 const r=n=>handle(req('POST',`/api/avatar/${avatar}/report?id=${uuid(n)}`),e,NOW).then(x=>x.json());
 assert.equal((await r(10)).hidden,false);assert.equal((await r(10)).hidden,false,'same reporter twice');assert.equal((await r(11)).hidden,false);
 assert.equal((await r(12)).hidden,true);
 assert.equal((await handle(req('GET','/api/avatar/'+avatar),e,NOW)).status,404);
 assert.deepEqual(e.DB.raw.prepare('SELECT kind,subject FROM moderation_queue').all().map(x=>({...x})),[{kind:'avatar',subject:avatar}]);
 const board=await (await handle(req('GET','/api/leaderboard?period=week&metric=characters&key=2026-W46'),e,NOW)).json();assert.equal(board.entries[0].avatar,null);
});

test('a logged-in account is one leaderboard row across PCs; deleting the account removes it',async()=>{
 const {handle}=await load('worker.js'),e=env(),token='mgl_'+'A'.repeat(43),t=Math.floor(NOW.getTime()/1000);
 e.DB.raw.prepare('INSERT INTO accounts(id,email,created_at,last_login_at) VALUES(?,?,?,?)').run('acc1','a@example.com',t,t);
 e.DB.raw.prepare('INSERT INTO account_sessions(id,account_id,token_hash,created_at,last_used_at,rotated_at,expires_at) VALUES(?,?,?,?,?,?,?)').run('s1','acc1',sha(token),t,t,t,t+86400*100);
 const auth={authorization:'Bearer '+token};
 /* PC 1 first took part without an account; its row folds into the account row on the next submit */
 await handle(req('POST','/api/leaderboard',join(uuid(3))),e,NOW);
 await handle(req('POST','/api/leaderboard',join(uuid(3)),auth),e,NOW);
 await handle(req('POST','/api/leaderboard',join(uuid(4)),auth),e,NOW);
 const rows=e.DB.raw.prepare('SELECT id_hash FROM leaderboard_users').all();assert.deepEqual(rows.map(r=>r.id_hash),[sha('account:acc1')]);
 const board=await (await handle(req('GET',`/api/leaderboard?period=week&metric=characters&key=2026-W46&me=${sha('account:acc1')}`),e,NOW)).json();assert.equal(board.entries.length,1);assert.equal(board.entries[0].me,true);
 assert.equal((await handle(req('DELETE','/api/me',undefined,auth),e,NOW)).status,200);
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM leaderboard_users').get().n,0);
});

const hotBody=(id,terms,week='2026-W46')=>join(id,{hot:{week,terms:terms.map(([term,count])=>({term,count}))}});
test('hot lookups: validation, privacy threshold, categories, ranking, frozen results and catch-up cron',async()=>{
 const {handle,scheduled}=await load('worker.js'),{validateHot,hotWeekKey}=await load('validate.js');
 assert.equal(hotWeekKey(new Date('2026-11-08T16:00:00Z')),'2026-W46','Monday 00:00 UTC+8 starts the new week');assert.equal(hotWeekKey(new Date('2026-11-08T15:59:59Z')),'2026-W45');
 assert.equal(validateHot({week:'2026-W40',terms:[]},NOW).error,'PERIOD_KEY_OUT_OF_RANGE');
 assert.equal(validateHot({week:'2026-W46',terms:[{term:'hello',count:1}]},NOW).error,'INVALID_LOOKUPS','needs Japanese');
 assert.equal(validateHot({week:'2026-W46',terms:[{term:'語',count:0}]},NOW).error,'INVALID_LOOKUPS');
 assert.equal(validateHot({week:'2026-W46',terms:Array.from({length:101},(_,i)=>({term:'語'+i,count:1}))},NOW).error,'INVALID_LOOKUPS');
 const AIcalls=[];const e=env({AI:{run:async(model,input)=>{AIcalls.push({model,input});const terms=[...input.messages[1].content.matchAll(/^\d+\. (.+?)（/gm)].map(m=>m[1]);return {response:'好的：'+JSON.stringify(terms.map(term=>({term,reason:term==='仕方ない'?'可能是本周热门作品里的口头禅':'也许是常见但难懂的说法'})))};}}});
 /* 5 readers; 仕方ない by 4 people, 気をつけて by 3, よろしくお願いします、先輩 by 3, 先輩 by 2 (under the threshold), ヘンタイ by 4 (blocked) */
 const plan={1:[['仕方ない',5],['気をつけて',1],['先輩',9],['ヘンタイ',2],['よろしくお願いします、先輩',1]],2:[['仕方ない',2],['気をつけて',1],['先輩',9],['ヘンタイ',1],['よろしくお願いします、先輩',1]],3:[['仕方ない',1],['気をつけて',1],['ヘンタイ',1],['よろしくお願いします、先輩',1]],4:[['仕方ない',1],['ヘンタイ',1]],5:[['別の言葉',1]]};
 for(const [n,terms]of Object.entries(plan))assert.equal((await handle(req('POST','/api/leaderboard',hotBody(uuid(20+Number(n)),terms)),e,NOW)).status,200);
 /* re-submitting replaces, not adds */
 await handle(req('POST','/api/leaderboard',hotBody(uuid(21),plan[1])),e,NOW);
 assert.equal(e.DB.raw.prepare("SELECT count FROM hot_lookups WHERE term='仕方ない' AND id_hash=?").get(sha(uuid(21))).count,5);
 const before=await (await handle(req('GET','/api/hotwords?category=word'),e,NOW)).json();assert.equal(before.settled,false);assert.deepEqual(before.awards,[]);
 /* the cron in the same week settles nothing */
 assert.deepEqual(await scheduled({scheduledTime:NOW.getTime()},e),[]);
 const monday=new Date('2026-11-15T16:00:00Z'),done=await scheduled({scheduledTime:monday.getTime()},e);
 assert.deepEqual(done.map(d=>[d.week,d.settled,d.participants]),[['2026-W46',true,5]]);
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM hot_lookups').get().n,0,'raw per-user rows are gone after settling');
 const words=await (await handle(req('GET','/api/hotwords?category=word&week=2026-W46'),e,monday)).json();
 assert.deepEqual(words.awards.map(a=>[a.rank,a.term,a.users,a.lookups,a.ai]),[[1,'仕方ない',4,9,true]]);
 assert.equal(words.awards[0].reason,'可能是本周热门作品里的口头禅');
 const phrases=await (await handle(req('GET','/api/hotwords?category=phrase'),e,monday)).json();assert.deepEqual(phrases.awards.map(a=>a.term),['気をつけて']);
 const sentences=await (await handle(req('GET','/api/hotwords?category=sentence'),e,monday)).json();assert.deepEqual(sentences.awards.map(a=>a.term),['よろしくお願いします、先輩']);
 assert.deepEqual(words.weeks,['2026-W46']);
 assert.ok(![words,phrases,sentences].flatMap(x=>x.awards).some(a=>a.term==='先輩'||a.term==='ヘンタイ'),'under the threshold or blocked never shows');
 assert.equal(AIcalls[0].model,'@cf/qwen/qwen3-30b-a3b-fp8');
 /* settling again is a no-op; results stay frozen */
 const {settleWeek}=await load('community.js');assert.equal((await settleWeek(e,'2026-W46',monday)).reason,'ALREADY_SETTLED');
 assert.equal((await handle(req('GET','/api/hotwords?category=nope'),e,monday)).status,400);
});

test('settlement ranking: people first, then lookups, top 50; AI failure keeps a plain, unlabelled reason',async()=>{
 const {rankHot,aiReasons,fallbackReason,cleanReason}=await load('community.js');
 const rows=Array.from({length:60},(_,i)=>({term:'語'+String(i).padStart(2,'0'),users:3+(i%5),lookups:100-i}));rows.push({term:'少ない',users:2,lookups:999});
 const ranked=rankHot(rows,3);
 assert.equal(ranked.word.length,50);assert.ok(!ranked.word.some(x=>x.term==='少ない'));
 assert.deepEqual(ranked.word.slice(0,3).map(x=>[x.rank,x.users,x.lookups]),[[1,7,96],[2,7,91],[3,7,86]]);
 for(let i=1;i<ranked.word.length;i++){const a=ranked.word[i-1],b=ranked.word[i];assert.ok(a.users>b.users||a.users===b.users&&a.lookups>=b.lookups);}
 const top=ranked.word.slice(0,10);
 const failed=await aiReasons({AI:{run:async()=>{throw Error('down');}}},'word',top);assert.ok([...failed.values()].every(r=>r.ai===false&&r.reason));
 assert.equal(failed.get(top[0].term).reason,fallbackReason(top[0]));
 const garbage=await aiReasons({AI:{run:async()=>({response:'no json here'})}},'word',top);assert.ok([...garbage.values()].every(r=>!r.ai));
 assert.equal(cleanReason('看 https://x.com'),'');assert.equal(cleanReason('x'.repeat(81)),'');assert.equal(cleanReason('<b>可能</b>是口头禅'),'b可能/b是口头禅');
});

test('page: podium 1–3 (shown 2·1·3), cards 4–10 with the AI label, 11–50 as a plain list',async()=>{
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','leaderboard-view.js')).href);
 const awards=Array.from({length:50},(_,i)=>({rank:i+1,term:'語'+(i+1),users:60-i,lookups:200-i,reason:i<10?'可能是口头禅'+(i+1):'',ai:i<10&&i!==4}));
 const split=view.splitAwards([...awards].reverse());
 assert.deepEqual([split.podium.map(a=>a.rank),split.cards.map(a=>a.rank),split.list.length],[[1,2,3],[4,5,6,7,8,9,10],40]);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const html=view.hotHTML({state:'ok',week:'2026-W46',weeks:['2026-W46','2026-W45'],settled:true,participants:12,awards},view.leaderboardWords('zh'),'zh',esc);
 const podium=html.slice(html.indexOf('leaderboard-podium'),html.indexOf('leaderboard-cards'));
 assert.deepEqual([...podium.matchAll(/data-rank="(\d)"/g)].map(m=>m[1]),['2','1','3']);
 assert.match(podium,/medal-gold/);assert.match(podium,/medal-silver/);assert.match(podium,/medal-bronze/);
 const cards=html.slice(html.indexOf('leaderboard-cards'),html.indexOf('leaderboard-hot-list'));
 assert.equal((cards.match(/AI 推测/g)||[]).length,6,'rank 5 has a plain reason without the label');
 const list=html.slice(html.indexOf('leaderboard-hot-list'));assert.doesNotMatch(list,/可能是/);assert.equal((list.match(/<li>/g)||[]).length,40);
 /* E402 the week picker and categories sit in the shared sub row above the card */
 const page=view.leaderboardHTML({configured:true,joined:true,tab:'hot',hot:{state:'ok',week:'2026-W46',weeks:['2026-W46','2026-W45'],settled:true,participants:12,awards},local:{stats:{}}},'zh',esc);
 const sub=page.slice(page.indexOf('lb-subrow'),page.indexOf('lb-body'));assert.match(sub,/data-lb-week/);assert.match(sub,/2026-W45/);assert.match(sub,/data-lb-category/);
 /* fewer than three awards: the empty places keep their stand */
 assert.equal((view.hotHTML({state:'ok',week:'2026-W46',weeks:[],settled:true,participants:3,awards:awards.slice(0,1)},view.leaderboardWords('zh'),'zh',esc).match(/is-vacant" role="listitem"/g)||[]).length,2);
 assert.match(view.hotHTML({state:'ok',weeks:[],settled:false,awards:[]},view.leaderboardWords('ja'),'ja',esc),/月曜 0:00/);
 const d=view.defaultAvatar('めぐみん');assert.equal(d.initial,'め');assert.match(d.color,/^#[0-9a-f]{6}$/);
 assert.match(view.avatarHTML({name:'x',avatar:'a'.repeat(32)},{['a'.repeat(32)]:'javascript:alert(1)'},esc),/is-default/,'only webp data URLs are used as images');
});

test('appeal: one click opens a GitHub issue with a private, expiring review link; one appeal per picture',async()=>{
 const {handle}=await load('worker.js'),{cleanupAvatars}=await load('community.js'),calls=[];
 const e=env({AI:ai('UNSAFE'),GITHUB_TOKEN:'ghp_x',fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({html_url:'https://github.com/ilynthn/MeguLit/issues/88'}),{status:201});}});
 const id=uuid(7);await handle(req('POST','/api/leaderboard',join(id)),e,NOW);
 assert.equal((await handle(req('POST','/api/leaderboard/avatar/appeal?id='+id,'{}'),e,NOW)).status,400,'nothing to appeal yet');
 await handle(req('POST','/api/leaderboard/avatar?id='+id,webp(),{'content-type':'image/webp'}),e,NOW);
 const res=await (await handle(req('POST','/api/leaderboard/avatar/appeal?id='+id,{version:'1.2.9'}),e,NOW)).json();
 assert.equal(res.issueUrl,'https://github.com/ilynthn/MeguLit/issues/88');
 const issue=calls[0].body;assert.deepEqual(issue.labels,['avatar-appeal']);assert.match(issue.title,/头像复核.*NSFW/);
 assert.match(issue.body,/model answer: `UNSAFE`/);assert.match(issue.body,/1\.2\.9/);assert.doesNotMatch(issue.body,/!\[/,'the picture is linked, never embedded');
 assert.match(issue.body,/status='approved'/);
 const link=issue.body.match(/https:\/\/relay\.test\/api\/avatar\/[0-9a-f]{32}\/review\?\S+/)[0];
 const view=await handle(new Request(link),e,NOW);assert.equal(view.status,200);assert.equal(view.headers.get('cache-control'),'private, no-store');
 assert.equal((await handle(new Request(link.replace(/sig=([0-9a-f])/,(m,c)=>'sig='+(c==='0'?'1':'0'))),e,NOW)).status,404);
 assert.equal((await handle(new Request(link),e,new Date(NOW.getTime()+73*3600000))).status,410);
 const again=await (await handle(req('POST','/api/leaderboard/avatar/appeal?id='+id,'{}'),e,NOW)).json();assert.equal(again.already,true);assert.equal(calls.length,1);
 assert.deepEqual(e.DB.raw.prepare("SELECT kind FROM moderation_queue").all().map(r=>r.kind),['appeal']);
 const status=await (await handle(req('GET','/api/leaderboard/avatar?id='+id),e,NOW)).json();assert.deepEqual([status.status,status.appealed,status.issueUrl],['rejected',true,'https://github.com/ilynthn/MeguLit/issues/88']);
 /* the maintainer approves with the SQL from the issue: it is public at once */
 const avatar=e.DB.raw.prepare('SELECT avatar_id FROM avatars').get().avatar_id;e.DB.raw.prepare("UPDATE avatars SET status='approved',reason='APPEAL_APPROVED' WHERE avatar_id=?").run(avatar);
 assert.equal((await handle(req('GET','/api/avatar/'+avatar),e,NOW)).status,200);
 /* unappealed rejections are deleted after 30 days */
 const id2=uuid(8);await handle(req('POST','/api/leaderboard',join(id2)),e,NOW);await handle(req('POST','/api/leaderboard/avatar?id='+id2,webp(),{'content-type':'image/webp'}),e,NOW);
 const before=e.BUCKET.store.size;assert.equal(await cleanupAvatars(e,new Date(NOW.getTime()+29*86400000)),0);assert.equal(await cleanupAvatars(e,new Date(NOW.getTime()+31*86400000)),1);
 assert.equal(e.BUCKET.store.size,before-1);assert.equal(e.DB.raw.prepare("SELECT status FROM avatars WHERE id_hash=?").get(sha(id2)).status,'expired');
});

test('weekly hot-word reasons: a live model (llama-3.1-8b is retired) and Qwen 3 answers in every shape',async()=>{
 const c=await load('community.js');assert.equal(c.HOT_MODEL,'@cf/qwen/qwen3-30b-a3b-fp8');
 assert.match(fs.readFileSync(path.join(relayDir,'wrangler.toml'),'utf8'),/HOT_MODEL = "@cf\/qwen\/qwen3-30b-a3b-fp8"/);
 const items=[{term:'先輩',rank:1,users:3,lookups:9}];
 for(const answer of [{response:[{term:'先輩',reason:'学园剧里天天叫'}]},{response:'<think>x</think>[{"term":"先輩","reason":"学园剧里天天叫"}]'},{choices:[{message:{content:'[{"term":"先輩","reason":"学园剧里天天叫"}]'}}]}]){
  const r=await c.aiReasons({AI:{run:async()=>answer}},'word',items);assert.equal(r.get('先輩').ai,true,JSON.stringify(answer));
 }
});
