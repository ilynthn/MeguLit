// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-28 排行榜 · 作品榜: Galgame / 轻小说 / 乙游 rankings. Recorded API responses (validation/fixtures/charts, taken
   from VNDB, Bangumi and AniList on 2026-11-28 and cut to the first page) go through the relay's parsers and cron into a
   D1 stand-in, out of GET /api/charts, through the app's service (with its cache fallback) and onto the page. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const ROOT=path.join(__dirname,'..'),FIX=path.join(__dirname,'fixtures','charts');
const fixture=name=>JSON.parse(fs.readFileSync(path.join(FIX,name+'.json'),'utf8'));
const relayCharts=()=>import(pathToFileURL(path.join(ROOT,'relay','src','charts.js')).href);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const MIGRATION=fs.readFileSync(path.join(ROOT,'relay','migrations','0043_charts.sql'),'utf8');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATION);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});return {prepare:sql=>stmt(sql),raw:db};}
function bucket(){const m=new Map();return {m,put:async(k,v,o)=>{m.set(k,{bytes:v,httpMetadata:o?.httpMetadata});},get:async k=>m.has(k)?{body:m.get(k).bytes,httpMetadata:m.get(k).httpMetadata}:null,delete:async k=>{m.delete(k);},list:async({prefix})=>({objects:[...m.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false})};}
const reply=(json,status=200)=>({ok:status<300,status,json:async()=>json,headers:{get:()=>'application/json'}});
/* the three APIs as recorded; `down` makes a host fail */
function sources({down=[]}={}){
 const calls=[];
 const fetcher=async(url,opt={})=>{const u=new URL(url),body=opt.body?JSON.parse(opt.body):null;calls.push({host:u.host,body});
  if(down.includes(u.host))throw Error('NETWORK');
  if(u.host==='api.vndb.org')return reply(fixture(JSON.stringify(body.filters).includes('g542')?'otome-vndb':'gal-vndb'));
  if(u.host==='api.bgm.tv'){if(Number(u.searchParams.get('offset'))>0)return reply({data:[],total:0});const f=body.filter;return reply(fixture(f.type[0]===1?'ln-bangumi':f.tag?.includes('乙女向')?'otome-bangumi':'gal-bangumi'));}
  if(u.host==='graphql.anilist.co')return reply(fixture('ln-anilist'));
  if(/^(t\.vndb\.org|lain\.bgm\.tv|s4\.anilist\.co)$/.test(u.host))return {ok:true,status:200,headers:{get:()=>'image/jpeg'},arrayBuffer:async()=>new Uint8Array([0xff,0xd8,0xff,1,2,3]).buffer};
  return reply({},404);};
 return {fetcher,calls};
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const fail=(code,status)=>json({error:code},status);

test('relay parsers read the recorded VNDB, Bangumi and AniList responses',async()=>{
 const c=await relayCharts();
 const gal=c.parseVndb(fixture('gal-vndb'));
 assert.equal(gal.length,15);
 assert.deepEqual(gal[0],{rank:1,id:'v20802',vndb:'v20802',title:'Rance Ⅹ -決戦-',zh:'兰斯10 决战',score:9.07,votes:1287,year:2018,cover:'https://t.vndb.org/cv/91/88391.jpg',url:'https://vndb.org/v20802'});
 assert.equal(gal[1].title,'装甲悪鬼村正','the original title (alttitle), not the romanization');
 assert.ok(gal.every((x,i)=>x.rank===i+1&&x.score>0&&x.votes>=500));
 /* a cover VNDB flags as sexual or violent is never mirrored */
 const flagged=fixture('gal-vndb');flagged.results[0].image.sexual=1.4;flagged.results[1].image.violence=1;
 const f=c.parseVndb(flagged);assert.equal(f[0].cover,'');assert.equal(f[1].cover,'');assert.ok(f[2].cover);
 const otome=c.parseVndb(fixture('otome-vndb'));assert.equal(otome[0].title,'ジャックジャンヌ');assert.equal(otome[0].zh,'JACKJEANNE');
 /* Bangumi light novels: a subject counts only when 轻小说 is one of its main tags (新世界より and 銀河英雄伝説 carry it
    only as a minor tag); 十二国記 keeps it as its second tag and stays */
 const ln=c.parseBangumi(fixture('ln-bangumi'),{tag:'轻小说'});
 assert.ok(!ln.some(x=>['新世界より','銀河英雄伝説'].includes(x.title)),'minor-tag subjects are dropped');
 assert.deepEqual(ln.slice(0,2).map(x=>[x.rank,x.title,x.zh,x.url]),[[1,'十二国記','十二国记','https://bgm.tv/subject/'+fixture('ln-bangumi').data[2].id],[2,'安達としまむら','安达与岛村','https://bgm.tv/subject/'+fixture('ln-bangumi').data[3].id]]);
 assert.equal(c.parseBangumi(fixture('ln-bangumi')).length,20,'without the tag rule nothing is dropped');
 const bgal=c.parseBangumi(fixture('gal-bangumi'));assert.equal(bgal[0].title,'Ever17 -the out of infinity-');assert.equal(bgal[0].zh,'时空轮回');assert.equal(bgal[0].votes,10084);assert.match(bgal[0].cover,/^https:\/\/lain\.bgm\.tv\//);
 const al=c.parseAnilist(fixture('ln-anilist'));assert.equal(al.length,15);assert.match(al[0].url,/^https:\/\/anilist\.co\/manga\/\d+$/);assert.ok(al.every(x=>x.votes>0&&x.score<=10&&x.zh===''));
 /* AniList has no Chinese titles: the same work's name is borrowed from the Bangumi list */
 const borrowed=[{title:'安達としまむら',zh:''}];c.fillChinese([ln,borrowed]);assert.equal(borrowed[0].zh,'安达与岛村');
});

test('relay cron caches every board × source in D1, keeps the last list when a source fails, and mirrors covers',async()=>{
 const c=await relayCharts(),env={DB:d1(),BUCKET:bucket()};
 const {fetcher,calls}=sources();
 const r=await c.refreshCharts(env,new Date('2026-11-28T20:40:00Z'),fetcher,{gap:0});
 assert.equal(r.saved,6,JSON.stringify(r.errors));
 const ua=calls.filter(x=>x.host==='api.bgm.tv');assert.ok(ua.length>=3);
 const get=async(board,source)=>(await c.chartsGet(env,new URL(`https://relay.test/api/charts?board=${board}${source?'&source='+source:''}`),{json,fail})).json();
 let gal=await get('gal');assert.equal(gal.source,'vndb','first source is the default');assert.equal(gal.state,'ok');assert.equal(gal.items[0].title,'Rance Ⅹ -決戦-');
 assert.equal(gal.items[0].cover,'','a cover not mirrored yet is not sent (never the source URL)');
 assert.deepEqual(gal.sources.map(s=>s.id),['vndb','bangumi']);
 assert.equal((await get('ln','anilist')).items[0].url.startsWith('https://anilist.co/'),true);
 assert.equal((await c.chartsGet(env,new URL('https://relay.test/api/charts?board=ln&source=vndb'),{json,fail})).status,400,'a source the board does not have is refused');
 /* covers trickle into R2 on the half-hourly cron */
 const n=await c.mirrorChartImages(env,new Date(),fetcher,12);assert.equal(n,12);
 gal=await get('gal');assert.match(gal.items[0].cover,/^\/api\/charts\/img\/[0-9a-f]{32}$/);
 const img=await c.chartImageGet(env,gal.items[0].cover.slice(16));assert.equal(img.status,200);assert.equal(img.headers.get('content-type'),'image/jpeg');
 /* next day VNDB is down: its lists stay as they were (and keep their mirrored covers), Bangumi's are replaced */
 const before=env.DB.raw.prepare("SELECT updated_at FROM charts_cache WHERE board='gal' AND source='vndb'").get().updated_at;
 const r2=await c.refreshCharts(env,new Date('2026-11-29T20:40:00Z'),sources({down:['api.vndb.org']}).fetcher,{gap:0});
 assert.equal(r2.saved,4);assert.ok(r2.errors['gal|vndb']);
 assert.equal(env.DB.raw.prepare("SELECT updated_at FROM charts_cache WHERE board='gal' AND source='vndb'").get().updated_at,before);
 assert.equal((await get('gal')).items[0].cover,gal.items[0].cover);
 /* a board nobody has fetched yet answers pending, not an error */
 const empty={DB:d1()};const p=await (await c.chartsGet(empty,new URL('https://relay.test/api/charts?board=otome'),{json,fail})).json();assert.equal(p.state,'pending');assert.deepEqual(p.items,[]);
});

test('relay serves /api/charts through the worker and runs the lists on their own cron',async()=>{
 const toml=fs.readFileSync(path.join(ROOT,'relay','wrangler.toml'),'utf8');assert.match(toml,/"40 20 \* \* \*"/);
 const {scheduled}=await import(pathToFileURL(path.join(ROOT,'relay','src','worker.js')).href);
 const env={DB:d1(),BUCKET:bucket(),CHARTS_GAP_MS:'0'},real=globalThis.fetch;
 globalThis.fetch=sources().fetcher;
 try{await scheduled({cron:'40 20 * * *',scheduledTime:Date.now()},env,null);}finally{globalThis.fetch=real;}
 assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM charts_cache').get().n,6);
});

function client(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-charts-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {SCHEMA}=require('../services/store.cjs'),db=new DatabaseSync(':memory:');db.exec(SCHEMA);t.after(()=>db.close());return {root,db};
}
/* the relay as the app sees it: GET /api/charts from the recorded lists, covers as tiny jpegs */
async function relayFetch(){
 const c=await relayCharts(),env={DB:d1(),BUCKET:bucket()};await c.refreshCharts(env,new Date('2026-11-28T20:40:00Z'),sources().fetcher,{gap:0});await c.mirrorChartImages(env,new Date(),sources().fetcher,100);
 const urls=[];let down=false;
 const fetcher=async url=>{urls.push(url);if(down)throw Object.assign(Error('offline'),{name:'TypeError'});const u=new URL(url);
  if(u.pathname==='/api/charts')return c.chartsGet(env,u,{json,fail});if(u.pathname.startsWith('/api/charts/img/'))return c.chartImageGet(env,u.pathname.slice(16));return json({},404);};
 return {fetcher,urls,setDown:v=>{down=v;}};
}
const ENV={MEGULIT_RELAY_BASE:'https://relay.test'};

test('app service: reads the relay, switches source, falls back to its cache when the relay is down',async t=>{
 const {root,db}=client(t),charts=require('../services/charts.cjs'),r=await relayFetch();
 /* a game in the library by its VNDB id, another by its title */
 db.prepare("INSERT INTO games(id,title,original) VALUES('g-muramasa','装甲悪鬼村正 本編',?),('g-sg','STEINS;GATE','{}')").run(JSON.stringify({library:{vndbId:'v2016'}}));
 const gal=await charts.view(root,db,{board:'gal'},{env:ENV,fetch:r.fetcher});
 assert.equal(gal.state,'ok');assert.equal(gal.source,'vndb');assert.equal(gal.items.length,15);
 assert.equal(gal.items.find(x=>x.vndb==='v2016').gameId,'g-muramasa','matched by VNDB id');
 assert.equal(gal.items.find(x=>x.title==='STEINS;GATE').gameId,'g-sg','matched by title');
 assert.equal(gal.items[0].gameId,undefined,'not in the library: no game id, the page opens the source');
 assert.match(gal.items[0].cover,/^data:image\/jpeg;base64,/,'covers come through the relay as data URLs');
 assert.ok(r.urls.some(u=>u==='https://relay.test/api/charts?board=gal&source=vndb'));
 assert.ok(r.urls.every(u=>u.startsWith('https://relay.test/')),'the app never calls the source sites');
 /* source switch */
 const bgm=await charts.view(root,db,{board:'gal',source:'bangumi'},{env:ENV,fetch:r.fetcher});
 assert.equal(bgm.source,'bangumi');assert.equal(bgm.items[0].title,'Ever17 -the out of infinity-');assert.match(bgm.items[0].url,/^https:\/\/bgm\.tv\/subject\/\d+$/);
 const al=await charts.view(root,db,{board:'ln',source:'anilist'},{env:ENV,fetch:r.fetcher});assert.equal(al.source,'anilist');assert.match(al.items[0].url,/^https:\/\/anilist\.co\//);
 assert.equal((await charts.view(root,db,{board:'ln',source:'vndb'},{env:ENV,fetch:r.fetcher})).source,'bangumi','a source the board lacks falls back to its first one');
 /* the relay goes away: the last saved list is shown, marked stale, covers from the local cache */
 r.setDown(true);
 const stale=await charts.view(root,db,{board:'gal',source:'vndb'},{env:ENV,fetch:r.fetcher});
 assert.equal(stale.state,'stale');assert.deepEqual(stale.items.map(x=>x.title),gal.items.map(x=>x.title));assert.equal(stale.updatedAt,gal.updatedAt);
 assert.match(stale.items[0].cover,/^data:image\/jpeg;base64,/);
 /* never fetched and the relay is down: an error the page can retry */
 const none=await charts.view(root,db,{board:'otome',source:'bangumi'},{env:ENV,fetch:r.fetcher});assert.equal(none.state,'error');assert.deepEqual(none.items,[]);
 assert.equal((await charts.view(root,db,{board:'gal'},{env:{MEGULIT_RELAY_BASE:'off'},fetch:r.fetcher})).state,'stale','no relay configured still shows the saved copy');
 /* a row may only open its own source site */
 assert.equal(charts.canOpen('https://bgm.tv/subject/1'),true);assert.equal(charts.canOpen('https://evil.test/'),false);
 assert.deepEqual(charts.clean({items:[{id:'x',title:'t',url:'https://evil.test/a'}]},'vndb').items,[],'a link to another host is dropped');
});

test('page: three category tabs, a source switch, rows, and the credit line in all three languages',async()=>{
 const view=await import(pathToFileURL(path.join(ROOT,'web','leaderboard-view.js')).href),cv=await import(pathToFileURL(path.join(ROOT,'web','charts-view.js')).href);
 const items=[{rank:1,id:'v2016',title:'装甲悪鬼村正',zh:'装甲恶鬼村正',score:9.02,votes:6444,year:2009,cover:'',url:'https://vndb.org/v2016',gameId:'g1'},{rank:2,id:'v2002',title:'STEINS;GATE',zh:'命运石之门',score:9.02,votes:17270,year:2009,cover:'data:image/jpeg;base64,AAAA',url:'https://vndb.org/v2002'},{rank:3,id:'v1',title:'CLANNAD',zh:'CLANNAD',score:8.9,votes:10,cover:'',url:'https://vndb.org/v1'}];
 view.setView({tab:'gal',sources:{gal:'vndb',ln:'bangumi',otome:'vndb'}});
 const zh=view.leaderboardHTML({state:'ok',items,updatedAt:'2026-11-28T20:40:00.000Z'},'zh',esc);
 for(const tab of ['gal','ln','otome'])assert.match(zh,new RegExp(`data-lb-tab="${tab}"`));
 assert.match(zh,/data-lb-tab="gal" aria-pressed="true">Gal</);assert.match(zh,/>轻小说</);assert.match(zh,/>乙游</);
 assert.match(zh,/data-lb-source="vndb" aria-pressed="true">VNDB/);assert.match(zh,/data-lb-source="bangumi" aria-pressed="false">Bangumi/);
 assert.match(zh,/装甲悪鬼村正（装甲恶鬼村正）/,'原名（中文名）');assert.match(zh,/>CLANNAD</,'no brackets when the names are the same');
 assert.match(zh,/data-lb-game-id="g1"/,'in the library: opens its detail page');assert.match(zh,/data-lb-open="https:\/\/vndb\.org\/v2002"/,'otherwise the source');
 assert.match(zh,/9\.02/);assert.match(zh,/17,270 人评价/);assert.match(zh,/<img src="data:image\/jpeg;base64,AAAA"/);
 const credit={zh:/排名数据来自 <button[^>]*data-lb-open="https:\/\/vndb\.org"[^>]*>VNDB<\/button>，按其公开数据整理，与 MeguLit 无关，排名不代表 MeguLit 的立场/,
  ja:/ランキングのデータは <button[^>]*>VNDB<\/button> の公開データをもとに整理したもので、MeguLit とは関係がなく、MeguLit の見解を示すものではありません/,
  en:/Ranking data comes from <button[^>]*>VNDB<\/button> and is compiled from its public data\. It has nothing to do with MeguLit, and the ranking does not reflect MeguLit&#39;s views/};
 for(const [loc,re] of Object.entries(credit)){for(const state of ['ok','stale','error','pending']){const html=view.leaderboardHTML({state,items:state==='ok'||state==='stale'?items:[],updatedAt:'2026-11-28T20:40:00.000Z'},loc,esc);assert.match(html,re,`${loc}/${state}: credit line`);}}
 /* the credit names the source being shown */
 view.setView({tab:'ln',sources:{gal:'vndb',ln:'anilist',otome:'vndb'}});
 const ln=view.leaderboardHTML({state:'ok',items},'zh',esc);assert.match(ln,/排名数据来自 <button[^>]*data-lb-open="https:\/\/anilist\.co"[^>]*>AniList/);assert.match(ln,/轻小说排行 <span>· AniList/);
 assert.match(view.leaderboardHTML({state:'stale',items,updatedAt:'2026-11-27T20:40:00.000Z'},'zh',esc),/显示的是上次保存的排名（2026-11-27）/);
 assert.match(view.leaderboardHTML(null,'zh',esc),/lb-loading/,'loading keeps the tab and source rows');
 assert.equal(cv.workName({title:'恋物語',zh:''}),'恋物語');
 view.setView({tab:'board'});
});
