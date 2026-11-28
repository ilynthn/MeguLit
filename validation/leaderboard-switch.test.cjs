process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-28 (user: 切时长/字数/次数一直跳「请求太频繁，7 秒后自动重试」) switching the reading board's tabs must not hit the relay
   each time: one /api/leaderboard/boards request brings every metric of a period (counted once by the rate limit), the
   app keeps answers a few minutes, and a refused request shows the last answer instead of an error.
   Also 按游戏 as ranked cards (cover, 原名（中文名）, readers, the top reader's picture and name). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const ROOT=path.join(__dirname,'..'),relayDir=path.join(ROOT,'relay');
const MIGRATIONS=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATIONS);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});
 return {prepare:sql=>stmt(sql),batch:async list=>{db.exec('BEGIN');try{for(const s of list)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},raw:db};}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const NOW=new Date('2026-11-10T04:00:00Z');
let ip=0;const req=(method,url,data)=>new Request('https://relay.test'+url,{method,headers:{'cf-connecting-ip':'10.9.0.'+(++ip),...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
const stats={week:{characters:100,seconds:60,words:1,streak:1},month:{characters:100,seconds:60,words:1,streak:1},all:{characters:100,seconds:60,words:1,streak:1}};

test('relay: /api/leaderboard/boards answers every metric of a period and counts once against lb-get',async()=>{
 const {handle}=await import(pathToFileURL(path.join(relayDir,'src','worker.js')).href);
 const limits=[];const env={DB:d1(),HASH_SALT:'s',LINK_SECRET:'l',RL_LB_GET:{limit:async o=>{limits.push(o);return {success:true};}}};
 for(const [n,chars] of [[1,300],[2,100]]){const r=await handle(req('POST','/api/leaderboard',{version:1,id:`0000000${n}-1111-4111-8111-111111111111`,name:'Reader'+n,keys:{week:'2026-W46',month:'2026-11'},stats:{...stats,week:{...stats.week,characters:chars}},games:[{title:'ATRI',characters:chars,seconds:60}]}),env,NOW);assert.equal(r.status,200,await r.text());}
 const res=await handle(req('GET','/api/leaderboard/boards?period=week&key=2026-W46'),env,NOW);assert.equal(res.status,200);
 const {boards}=await res.json();
 assert.deepEqual(Object.keys(boards).sort(),['characters','kana','reviews','seconds','streak','study','words']);
 assert.deepEqual(boards.characters.entries.map(e=>[e.rank,e.name,e.value]),[[1,'Reader1',300],[2,'Reader2',100]]);
 assert.equal(boards.seconds.total,2);
 assert.equal(limits.length,1,'one request, one count');
 /* the single-board endpoint still answers the same (older apps) */
 const one=await (await handle(req('GET','/api/leaderboard?period=week&metric=characters&key=2026-W46'),env,NOW)).json();assert.deepEqual(one.entries,boards.characters.entries);
 /* 按游戏: the top reader comes with a picture field */
 const games=await (await handle(req('GET','/api/leaderboard?metric=games'),env,NOW)).json();
 assert.deepEqual(games.games[0],{title:'ATRI',readers:2,top:{rank:1,name:'Reader1',value:300,avatar:null}});
 const toml=fs.readFileSync(path.join(relayDir,'wrangler.toml'),'utf8');assert.match(toml,/name = "RL_LB_GET"[\s\S]*?simple = \{ limit = 120, period = 60 \}/);
});

function client(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-lbswitch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {SCHEMA}=require('../services/store.cjs'),db=new DatabaseSync(':memory:');db.exec(SCHEMA);t.after(()=>db.close());return {root,db};
}
const ENV={MEGULIT_RELAY_BASE:'https://relay.test'};
const board=v=>({entries:[{rank:1,name:'Reader1',value:v,me:false}],total:1,me:null,feature:null});
const BOARDS={boards:{characters:board(300),seconds:board(60),words:board(1),reviews:board(4),streak:board(2),kana:board(5),study:board(7)}};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

test('app: switching metrics asks the relay once per period; a refused request shows the last answer with a quiet retry',async t=>{
 const {root,db}=client(t),lb=require('../services/leaderboard.cjs');let mode='ok';const urls=[];
 const fetcher=async url=>{urls.push(url);const u=new URL(url);if(!u.pathname.startsWith('/api/leaderboard'))return reply({});if(mode==='429')return new Response(JSON.stringify({error:'RATE_LIMITED'}),{status:429,headers:{'retry-after':'7'}});
  return u.pathname==='/api/leaderboard/boards'?reply(BOARDS):reply(board(1));};
 const seen={};
 for(const metric of ['seconds','characters','words','reviews','study','streak']){const v=await lb.view(root,db,{period:'week',metric},{env:ENV,fetch:fetcher,now:NOW});seen[metric]=v.board.entries[0].value;assert.equal(v.board.state,'ok');}
 const lbCalls=urls.filter(u=>new URL(u).pathname.startsWith('/api/leaderboard'));
 assert.equal(lbCalls.length,1,'six tabs, one relay request: '+lbCalls.join(' '));
 assert.deepEqual(seen,{seconds:60,characters:300,words:1,reviews:4,study:7,streak:2});assert.match(lbCalls[0],/\/api\/leaderboard\/boards\?period=week&key=2026-W46$/);
 /* the relay refuses: the last answer stays on the page, marked stale with when to try again */
 mode='429';
 const r=await lb.fetch('week','characters',{root,env:ENV,fetch:fetcher,now:NOW,fresh:true});
 assert.equal(r.state,'ok');assert.equal(r.entries[0].value,300);assert.equal(r.stale,true);assert.ok(r.retry>=5&&r.retry<=60);
 /* nothing cached yet and refused: the error comes through, as before */
 const month=await lb.fetch('month','characters',{root,env:ENV,fetch:fetcher,now:NOW});assert.equal(month.state,'error');assert.equal(month.error,'RATE_LIMITED');
});

test('app: an older relay without /api/leaderboard/boards gets one request per board, and is not asked again',async t=>{
 const {root}=client(t),lb=require('../services/leaderboard.cjs');const urls=[];
 const fetcher=async url=>{urls.push(url);const u=new URL(url);return u.pathname==='/api/leaderboard/boards'?reply({error:'NOT_FOUND'},404):reply(board(u.searchParams.get('metric')==='seconds'?60:300));};
 const base={root,env:{MEGULIT_RELAY_BASE:'https://old-relay.test'},fetch:fetcher,now:NOW};
 assert.equal((await lb.fetch('week','characters',base)).entries[0].value,300);
 assert.equal((await lb.fetch('week','seconds',base)).entries[0].value,60);
 assert.deepEqual(urls.map(u=>new URL(u).pathname),['/api/leaderboard/boards','/api/leaderboard','/api/leaderboard']);
});

test('page: 按游戏 is a ranked list of cards; a game in the library opens its detail page',async t=>{
 const view=await import(pathToFileURL(path.join(ROOT,'web','leaderboard-view.js')).href);
 const w=view.leaderboardWords('zh');
 const games=[{title:'装甲悪鬼村正',zh:'装甲恶鬼村正',readers:12,gameId:'g1',cover:'data:image/jpeg;base64,AAAA',top:{name:'めぐみん',value:9000,avatar:null}},{title:'ATRI',zh:'',readers:3,top:{name:'Reader2',value:10,avatar:null}},{title:'CLANNAD',readers:2,top:null},{title:'Ever17',readers:1,top:null}];
 const html=view.gamesHTML(games,w,'zh',esc,{});
 assert.equal((html.match(/<li/g)||[]).length,4);
 assert.match(html,/class="is-owned is-top is-top-1"[\s\S]*?data-lb-game-id="g1"/,'first place, in the library: opens the detail page');
 assert.match(html,/装甲悪鬼村正（装甲恶鬼村正）/);assert.match(html,/<img src="data:image\/jpeg;base64,AAAA"/);
 assert.match(html,/12 人在读 · 在游戏库中/);assert.match(html,/lb-game-top[\s\S]*?leaderboard-avatar[\s\S]*?めぐみん/,'the top reader with picture and name');
 assert.match(html,/class="is-top is-top-2"[\s\S]*?data-lb-game="ATRI"/,'not in the library: opens its readers\' board');
 assert.match(html,/class="is-top is-top-3"/);assert.doesNotMatch(html,/is-top-4/);
 /* through the page: 阅读榜 → 按游戏 */
 view.setView({tab:'board',metric:'games',game:''});
 const page=view.leaderboardHTML({configured:true,joined:true,name:'me',local:{stats:{}},board:{state:'ok',games}},'zh',esc);
 assert.match(page,/lb-charts lb-games/);assert.match(page,/data-lb-metric="games" aria-pressed="true"/);
 view.setView({metric:'seconds'});
});

test('app: 按游戏 rows get the library game, cover and Chinese name from what is on this PC',async t=>{
 const {root,db}=client(t),charts=require('../services/charts.cjs');
 const ref='/api/charts/img/'+'a'.repeat(32);
 fs.mkdirSync(path.dirname(charts.cacheFile(root,'gal','vndb')),{recursive:true});
 fs.writeFileSync(charts.cacheFile(root,'gal','vndb'),JSON.stringify({items:[{rank:1,id:'v2016',vndb:'v2016',title:'装甲悪鬼村正',zh:'装甲恶鬼村正',score:9,votes:1,cover:ref,url:'https://vndb.org/v2016'},{rank:2,id:'v2002',vndb:'v2002',title:'STEINS;GATE',zh:'命运石之门',score:9,votes:1,cover:'',url:'https://vndb.org/v2002'}]}));
 fs.mkdirSync(path.join(root,'data','cache','charts-img'),{recursive:true});fs.writeFileSync(path.join(root,'data','cache','charts-img','a'.repeat(32)),Buffer.concat([Buffer.from('image/jpeg\n'),Buffer.from([0xff,0xd8,0xff])]));
 db.prepare("INSERT INTO games(id,title,original) VALUES('g1','村正',?)").run(JSON.stringify({library:{vndbId:'v2016'}}));
 const info=charts.titleInfo(root,db,['装甲悪鬼村正','STEINS;GATE','Unknown']);
 assert.deepEqual(info[0],{gameId:'g1',zh:'装甲恶鬼村正',cover:'data:image/jpeg;base64,/9j/'});
 assert.deepEqual(info[1],{gameId:'',zh:'命运石之门',cover:''});
 assert.deepEqual(info[2],{gameId:'',zh:'',cover:''});
});
