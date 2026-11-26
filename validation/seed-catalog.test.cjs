// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The Seed catalog page: services/seed-catalog.cjs against a stub VNDB (no real network) and the page's pure parts in
   web/seed-catalog.js (grouping, names, which covers each mode shows, the mode switch, the cover queue, escaping) */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const sc=require('../services/seed-catalog.cjs');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-seed-catalog-'));
const rm=(...d)=>{for(const x of d)fs.rmSync(x,{recursive:true,force:true});};
const DAY=864e5,MIN=6e4;
const seeds={games:[
 {key:'safe-game',engine:'kirikiri',status:'verified',prints:{vndb:'v1',pack:'a'.repeat(64)}},
 {key:'adult-game',engine:'siglus',status:'skeleton',prints:{vndb:'v2'}},
 {key:'unrated-game',engine:'bgi',status:'read',prints:{vndb:'v3'}},
 {key:'no-vndb-game',engine:'unity',status:'skeleton',prints:{steam:'123'}},
 {key:'gone-game',engine:'yuris',status:'owner-ok',prints:{vndb:'v4'}},
 {key:'gory-game',engine:'nitroplus',status:'skeleton',prints:{vndb:'v5'}},
 {key:'zero-game',engine:'bgi',status:'skeleton',prints:{vndb:'v0123'}}]};
const vn={
 v1:{id:'v1',title:'Safe Game',alttitle:'セーフ',developers:[{id:'p1',name:'Studio A',original:'スタジオA'}],image:{url:'https://t.vndb.org/cv/01/1.jpg',thumbnail:'https://t.vndb.org/cv.t/01/1.jpg',sexual:0,violence:0}},
 v2:{id:'v2',title:'Adult Game',alttitle:null,developers:[{id:'p1',name:'Studio A',original:'スタジオA'}],image:{url:'https://t.vndb.org/cv/02/2.jpg',sexual:1.6,violence:0}},
 v3:{id:'v3',title:'Unrated',alttitle:'無評価',developers:[{id:'p2',name:'Studio B',original:null}],image:{url:'https://t.vndb.org/cv/03/3.png'}},
 v5:{id:'v5',title:'Gory',alttitle:'',developers:[],image:{url:'https://t.vndb.org/cv/05/5.webp',sexual:0,violence:1.2}},
 v123:{id:'v123',title:'Leading Zero',alttitle:'',developers:[],image:null}};
const JPEG=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(400,7)]);
const PNG=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(400,7)]);
const WEBP=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),Buffer.alloc(400,7)]);
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.length);
function stubVndb({image}={}){
 const calls=[];
 const fetch=async(url,o={})=>{calls.push({url,body:o.body?JSON.parse(o.body):null});
  if(url===sc.VNDB){const f=JSON.parse(o.body).filters;const want=f[0]==='or'?f.slice(1).map(x=>x[2]):[f[2]];
   return {ok:true,json:async()=>({results:want.filter(id=>vn[id]).map(id=>vn[id])})};}
  if(/^https:\/\/t\.vndb\.org\//.test(url)){const b=image||(/\.png$/.test(url)?PNG:/\.webp$/.test(url)?WEBP:JPEG);return {ok:true,arrayBuffer:async()=>ab(b)};}
  throw Error('unexpected '+url);};
 return {fetch,calls};
}
const writeJSON=(file,v)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(v));};

test('one VNDB query with only the seeds\' VNDB ids; each game says which covers it has',async()=>{
 const root=tmp(),{fetch,calls}=stubVndb();
 const r=await sc.catalog(root,{seeds,fetch,now:1e12});
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].body.filters,['or',...['v1','v2','v3','v4','v5','v123'].map(id=>['id','=',id])],'v0123 is asked as v123');
 assert.deepEqual(Object.keys(calls[0].body).sort(),['fields','filters','results']);
 assert.equal(r.offline,false);assert.equal(r.safeOnly,false);
 const by=Object.fromEntries(r.games.map(g=>[g.slug,g]));
 assert.equal(by['safe-game'].cover,'safe');
 assert.equal(by['adult-game'].cover,'nsfw');
 assert.equal(by['unrated-game'].cover,'nsfw','a cover without ratings is not treated as safe');
 assert.equal(by['gory-game'].cover,'nsfw','violence counts too');
 assert.equal(by['no-vndb-game'].cover,'none');assert.equal(by['no-vndb-game'].title,'');
 assert.equal(by['gone-game'].cover,'none');
 assert.equal(by['zero-game'].vndb,'v123');assert.equal(by['zero-game'].title,'Leading Zero');
 assert.deepEqual(by['safe-game'].developers,[{id:'p1',name:'Studio A',original:'スタジオA'}]);
 assert.equal(by['safe-game'].alttitle,'セーフ');
 assert.ok(!('prints' in by['safe-game'])&&!('settings' in by['safe-game']),'no fingerprints or settings go to the page');
 rm(root);
});

test('answers stay 30 days, misses 7; a stale answer is shown at once and refreshed behind it',async()=>{
 const root=tmp(),{fetch,calls}=stubVndb(),t0=1e12;
 await sc.catalog(root,{seeds,fetch,now:t0});
 await sc.catalog(root,{seeds,fetch,now:t0+6*DAY});assert.equal(calls.length,1,'nothing is asked again inside a week');
 await sc.catalog(root,{seeds,fetch,now:t0+8*DAY,wait:true});assert.equal(calls.length,2);
 assert.deepEqual(calls[1].body.filters,['id','=','v4'],'only the miss is asked again after 7 days');
 vn.v1.title='Safe Game 2';
 try{
  const old=await sc.catalog(root,{seeds,fetch,now:t0+31*DAY});
  assert.equal(old.games.find(g=>g.slug==='safe-game').title,'Safe Game','the stale name comes back without waiting');
  assert.equal(calls.length,3,'and a refresh started behind it');
  await new Promise(r=>setTimeout(r,20));
  const fresh=await sc.catalog(root,{seeds,fetch,now:t0+31*DAY+1});
  assert.equal(fresh.games.find(g=>g.slug==='safe-game').title,'Safe Game 2');
 }finally{vn.v1.title='Safe Game';}
 rm(root);
});

test('VNDB down or answering nonsense: offline, nothing written as a miss, no new try for 10 minutes',async()=>{
 const t0=1e12;
 for(const bad of [async()=>{throw Error('down');},async()=>({ok:false,status:429}),async()=>({ok:true,json:async()=>({results:'x'})}),async()=>({ok:true,json:async()=>null})]){
  const root=tmp();let n=0;const f=async(...a)=>{n++;return bad(...a);};
  const r=await sc.catalog(root,{seeds,fetch:f,now:t0});
  assert.equal(r.offline,true);assert.ok(r.games.every(g=>g.cover==='none'&&g.title===''));
  assert.deepEqual(sc.readCache(root).vn,{},'no id is remembered as unknown');
  const again=await sc.catalog(root,{seeds,fetch:f,now:t0+9*MIN});
  assert.equal(n,1,'the next opening inside 10 minutes does not wait on VNDB');assert.equal(again.offline,true);
  const {fetch}=stubVndb();
  const later=await sc.catalog(root,{seeds,fetch,now:t0+11*MIN});
  assert.equal(later.offline,false);assert.equal(later.games.find(g=>g.slug==='safe-game').title,'Safe Game');
  rm(root);
 }
});

test('an error status counts as down even with a body; two openings at once ask VNDB once',async()=>{
 const root=tmp(),{fetch}=stubVndb();
 const r=await sc.catalog(root,{seeds,fetch:async(u,o)=>({...(await fetch(u,o)),ok:false,status:503}),now:1e12});
 assert.equal(r.offline,true);assert.deepEqual(sc.readCache(root).vn,{});
 const root2=tmp(),s=stubVndb();let n=0;const f=async(u,o)=>{n++;await new Promise(x=>setTimeout(x,20));return s.fetch(u,o);};
 const [a,b]=await Promise.all([sc.catalog(root2,{seeds,fetch:f}),sc.catalog(root2,{seeds,fetch:f})]);
 assert.equal(n,1);assert.equal(a.games[0].title,'Safe Game');assert.equal(b.games[0].title,'Safe Game');
 rm(root,root2);
});

test('covers: normal mode never fetches or shows a cover that is not rated safe; NSFW mode does',async()=>{
 const root=tmp(),{fetch,calls}=stubVndb();
 await sc.catalog(root,{seeds,fetch});calls.length=0;
 assert.match(await sc.cover(root,'v1',{fetch}),/^data:image\/jpeg;base64,/);
 assert.equal(calls[0].url,'https://t.vndb.org/cv.t/01/1.jpg','the thumbnail is used when VNDB has one');
 for(const id of ['v2','v3','v5'])assert.equal(await sc.cover(root,id,{fetch}),null,id);
 assert.equal(calls.length,1,'no request for a cover normal mode does not show');
 assert.match(await sc.cover(root,'v2',{fetch,nsfw:true}),/^data:image\/jpeg;base64,/);
 assert.match(await sc.cover(root,'v3',{fetch,nsfw:true}),/^data:image\/png;base64,/);
 assert.match(await sc.cover(root,'v5',{fetch,nsfw:true}),/^data:image\/webp;base64,/);
 assert.equal(await sc.cover(root,'v2',{fetch}),null,'a cover saved in NSFW mode stays hidden in normal mode');
 const n=calls.length;assert.match(await sc.cover(root,'v1',{fetch}),/^data:image/);assert.equal(calls.length,n,'a saved cover is read from disk');
 assert.ok(fs.readdirSync(path.join(root,'data','assets','covers')).every(f=>/^seed-v\d+-[0-9a-f]{12}\.(jpg|png|webp)$/.test(f)));
 for(const bad of ['','v','1','v1/../x','../v1','v01'])assert.equal(await sc.cover(root,bad,{fetch,nsfw:true}),null,bad);
 rm(root);
});

test('the app\'s R18 filter keeps covers in normal mode whatever the page asks',async()=>{
 const root=tmp(),{fetch}=stubVndb();
 writeJSON(path.join(root,'data','config','native-preferences.json'),{safe_cg:true});
 const r=await sc.catalog(root,{seeds,fetch});assert.equal(r.safeOnly,true);
 assert.equal(await sc.cover(root,'v2',{fetch,nsfw:true}),null);
 assert.match(await sc.cover(root,'v1',{fetch,nsfw:true}),/^data:image/);
 rm(root);
});

test('a download that is not a picture is neither shown nor saved',async()=>{
 const root=tmp(),html=Buffer.from('<html><body>'+'x'.repeat(300)+'</body></html>');
 const s1=stubVndb({image:html});await sc.catalog(root,{seeds,fetch:s1.fetch});
 assert.equal(await sc.cover(root,'v1',{fetch:s1.fetch}),null);
 assert.ok(!fs.existsSync(path.join(root,'data','assets','covers'))||!fs.readdirSync(path.join(root,'data','assets','covers')).length);
 const s2=stubVndb();assert.match(await sc.cover(root,'v1',{fetch:s2.fetch}),/^data:image\/jpeg/,'the next try downloads again');
 assert.equal(sc.imageType(Buffer.from('GIF89a......')),'');
 rm(root);
});

test('a damaged or hand-edited cache cannot bring an unsafe cover or a bad URL back',async()=>{
 const root=tmp(),{fetch,calls}=stubVndb(),now=Date.now();
 writeJSON(path.join(root,'data','config','seed-catalog.json'),{vn:{
  v1:{title:'A',developers:[null,{id:'x'},{id:'p9',name:'Ok'}],image:{url:'https://t.vndb.org/cv/1.jpg',sexual:[],violence:false},at:now},
  v2:{title:'B',image:{url:'https://evilvndb.org/cv/2.jpg',sexual:0,violence:0},at:now},
  v3:{title:'C',image:{url:'https://t.vndb.org/cv/3.jpg',sexual:'0',violence:' '},at:now},
  '../x':{title:'D',at:now},v4:'junk'}});
 const c=sc.readCache(root);
 assert.deepEqual(Object.keys(c.vn).sort(),['v1','v2','v3']);
 assert.deepEqual(c.vn.v1.developers,[{id:'p9',name:'Ok',original:''}]);
 assert.equal(c.vn.v2.image,null);
 assert.equal(await sc.cover(root,'v1',{fetch}),null);assert.equal(await sc.cover(root,'v3',{fetch}),null);
 assert.equal(await sc.cover(root,'v2',{fetch,nsfw:true}),null);
 assert.equal(calls.length,0);
 writeJSON(path.join(root,'data','config','seed-catalog.json'),[1,2]);assert.deepEqual(sc.readCache(root).vn,{});
 rm(root);
});

test('only vndb.org images, only known developers, ratings that are not numbers count as not safe',()=>{
 for(const url of ['https://evil.example/cv.jpg','https://evilvndb.org/a.jpg','https://attacker-vndb.org/cv/1.jpg','https://vndb.org.evil.com/a.jpg','http://t.vndb.org/a.jpg'])
  assert.equal(sc.cleanVn({id:'v9',image:{url,sexual:0,violence:0}}).image,null,url);
 assert.ok(sc.cleanVn({id:'v9',image:{url:'https://s2.t.vndb.org/cv/1.jpg',sexual:0,violence:0}}).image);
 const a=sc.cleanVn({id:'v9',title:'X',developers:[{id:'p1',name:'A'},{id:'x',name:'B'},null]});
 assert.deepEqual(a.developers.map(d=>d.id),['p1']);
 const img=(sexual,violence)=>sc.cleanVn({id:'v9',image:{url:'https://t.vndb.org/cv/1/1.jpg',sexual,violence}}).image;
 for(const v of [null,undefined,'',' ','0',[],false,NaN,Infinity])assert.equal(sc.safe(img(v,0)),false,String(v));
 assert.equal(sc.safe(img(0.9,0.2)),true);assert.equal(sc.safe(img(1,0)),false);assert.equal(sc.safe(img(0,1)),false);
 assert.equal(sc.cleanVn(null),null);
});

test('the real The Seed folder lists every seed with a well-formed VNDB id or none',()=>{
 const list=sc.seedList();
 assert.ok(list.length>0);
 for(const g of list){assert.match(g.slug,/^[a-z0-9][a-z0-9-]+$/);assert.ok(g.vndb===''||/^v[1-9]\d*$/.test(g.vndb),g.slug);}
 assert.ok(list.some(g=>g.vndb));
});

test('page: groups by developer, biggest first, games without a developer last; search; names per language',async()=>{
 const p=await import('../web/seed-catalog.js');
 const games=[
  {slug:'b-game',title:'B Game',alttitle:'Bゲーム',developers:[{id:'p1',name:'Studio A',original:'スタジオA'}],cover:'safe'},
  {slug:'a-game',title:'A Game',alttitle:'',developers:[{id:'p1',name:'Studio A',original:'スタジオA'}],cover:'nsfw'},
  {slug:'c-game',title:'C Game',alttitle:'Cゲーム',developers:[{id:'p2',name:'Studio B',original:''}],cover:'none'},
  {slug:'lone-seed',title:'',alttitle:'',developers:[],cover:'none'}];
 const g=p.groupGames(games,'zh');
 assert.deepEqual(g.map(x=>x.name),['スタジオA','Studio B','']);
 assert.deepEqual(g[0].games.map(x=>p.gameTitle(x,'zh')),['A Game','Bゲーム']);
 assert.equal(p.gameTitle(games[0],'en'),'B Game');
 assert.equal(p.gameTitle(games[3],'zh'),'Lone Seed');
 assert.equal(p.developerName(games[0].developers[0],'en'),'Studio A');
 assert.deepEqual(p.groupGames(games,'zh','studio b').map(x=>x.games.length),[1]);
 assert.deepEqual(p.groupGames(games,'zh','ｂゲーム').flatMap(x=>x.games.map(y=>y.slug)),['b-game'],'search folds full-width letters');
 assert.deepEqual(p.groupGames(games,'zh','nothing'),[]);
});

test('page: builds that share a VNDB id are one card; a build never confirmed does not look confirmed',async()=>{
 const {mergeGames,catalogHTML,statusText}=await import('../web/seed-catalog.js');
 const one=(slug,engine,status,vndb)=>({slug,engine,status,vndb,title:'T',alttitle:'',developers:[],cover:'none'});
 const games=[one('saya-jp','nitropak','skeleton','v97'),one('x','bgi','skeleton',''),one('saya','nitroplus','verified','v97'),one('y','bgi','read',''),
  one('t1','nscripter','verified','v7'),one('t2','kirikiri','owner-ok','v7')];
 const m=mergeGames(games);
 assert.deepEqual(m.map(g=>[g.slug,g.seeds,g.ok,g.status,g.engines.join('+')]),[['saya-jp',2,1,'verified','nitropak+nitroplus'],['x',1,0,'skeleton','bgi'],['y',1,0,'read','bgi'],['t1',2,2,'verified','nscripter+kirikiri']]);
 assert.equal(statusText(m[0],'zh'),'1/2 已确认');assert.equal(statusText(m[3],'zh'),'已确认');assert.equal(statusText(m[1],'zh'),'等传火');
 assert.equal(games[0].status,'skeleton','the answer from the service is not changed');
 const html=catalogHTML(games,'zh','normal',v=>String(v??''));
 assert.equal((html.match(/class="sc-card"/g)||[]).length,4);assert.ok(html.includes('2 颗种子'));assert.ok(html.includes('sc-st-part'));
});

test('page: which covers each mode loads',async()=>{
 const {coverState}=await import('../web/seed-catalog.js');
 assert.equal(coverState({cover:'safe'},'normal'),'load');
 assert.equal(coverState({cover:'nsfw'},'normal'),'hidden');
 assert.equal(coverState({cover:'none'},'normal'),'none');
 assert.equal(coverState({cover:'safe'},'nsfw'),'load');
 assert.equal(coverState({cover:'nsfw'},'nsfw'),'load');
 assert.equal(coverState({cover:'none'},'nsfw'),'none');
});

test('page: the mode of the covers is the global NSFW setting',async()=>{
 const {savedMode}=await import('../web/seed-catalog.js');
 assert.equal(savedMode(),'normal','off by default');
});

test('page: the cover queue stops when the list is drawn again, keeps covers per mode and asks again after a miss',async()=>{
 const {loadCovers}=await import('../web/seed-catalog.js');
 const els=n=>Array.from({length:n},(_,i)=>({dataset:{vndb:'v'+(i+1)},isConnected:true}));
 const rootOf=list=>({isConnected:true,querySelectorAll:()=>list});
 const asked=[];let live=true;
 const api=async(a,p)=>{asked.push(p.vndb+'|'+p.nsfw);await new Promise(r=>setTimeout(r,5));return p.vndb==='v2'?null:'data:image/jpeg;base64,AA';};
 const cache=new Map(),shown=[];
 const run=loadCovers(rootOf(els(20)),api,'nsfw',()=>live,{cache,show:(el)=>shown.push(el.dataset.vndb)});
 await new Promise(r=>setTimeout(r,1));live=false;await run;
 assert.equal(asked.length,4,'a run that is no longer the current one sends no new request');
 assert.equal(shown.length,0,'and shows nothing');
 const list=els(3);list[2].isConnected=false;
 await loadCovers(rootOf(list),api,'nsfw',()=>true,{cache,show:(el)=>shown.push(el.dataset.vndb)});
 assert.deepEqual(asked.slice(4),['v2|true'],'v1 is kept from before, v2 missed and is asked again, a removed card is skipped');
 assert.deepEqual(shown,['v1']);
 await loadCovers(rootOf(els(1)),api,'normal',()=>true,{cache,show:()=>{}});
 assert.equal(asked.at(-1),'v1|false','normal mode does not reuse the NSFW answer');
});

test('page: names from VNDB are escaped; a hidden cover carries no VNDB id to load',async()=>{
 const {catalogHTML}=await import('../web/seed-catalog.js');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
 const games=[{slug:'x',engine:'kirikiri',status:'verified',vndb:'v1',title:'<img src=x onerror=alert(1)>',alttitle:'',developers:[{id:'p1',name:'"><b>',original:''}],cover:'nsfw'}];
 const normal=catalogHTML(games,'en','normal',esc);
 assert.ok(!normal.includes('<img src=x'));assert.ok(!normal.includes('"><b>'));
 assert.ok(!normal.includes('data-vndb'),'normal mode does not ask for an adult cover');
 assert.ok(catalogHTML(games,'en','nsfw',esc).includes('data-vndb="v1"'));
 assert.ok(catalogHTML(games,'zh','normal',esc).includes('已确认'));
 assert.equal(catalogHTML(games,'zh','normal',esc,'zzz'),'<p class="sc-empty">没有找到</p>');
});

test('a public torch cover can resolve a cold VNDB ID and reuse its safe cached thumbnail',async()=>{
 const root=tmp(),{fetch,calls}=stubVndb();
 try{
  assert.equal(await sc.cover(root,'v1',{fetch}),null);
  const first=await sc.cover(root,'v1',{fetch,resolveMissing:true});
  assert.match(first,/^data:image\/jpeg;base64,/);
  assert.equal(await sc.cover(root,'v1',{fetch,resolveMissing:true}),first);
  assert.equal(await sc.cover(root,'v2',{fetch,resolveMissing:true}),null);
  assert.equal(await sc.cover(root,'v4',{fetch,resolveMissing:true}),null);
  assert.equal(await sc.cover(root,'v4',{fetch,resolveMissing:true}),null);
  assert.deepEqual(calls.filter(c=>c.body).map(c=>c.body.filters[2]),['v1','v2','v4']);
  assert.deepEqual(calls.filter(c=>!c.body).map(c=>c.url),[vn.v1.image.thumbnail]);
 }finally{rm(root);}
});

test('page: a read-mode seed is shown as adapted with the default settings imported, in green, never as 只读模式',async()=>{
 const {statusText,catalogHTML,catalogWords}=await import('../web/seed-catalog.js');
 const g={slug:'y',engine:'bgi',status:'read',vndb:'',title:'T',alttitle:'',developers:[],cover:'none',seeds:1,ok:0};
 assert.equal(statusText(g,'zh'),'已适配 · 默认配置已导入');
 for(const l of ['zh','en','ja'])assert.ok(!/只读|Read mode|読み取りモード/.test(catalogWords(l).status.read),l);
 const html=catalogHTML([g],'zh','normal',v=>String(v??''));
 assert.ok(html.includes('sc-st-ok')&&html.includes('已适配 · 默认配置已导入')&&!html.includes('只读模式'));
});

test('a read-mode seed gives its settings as the default layer; this PC personal layers go over it and never change the seed',()=>{
 const seed=require('../core/profiles/seed.cjs'),profiles=require('../core/profiles/index.cjs');
 const g=seed.seeds().games.find(x=>x.status==='read');assert.ok(g);
 const before=JSON.stringify(seed.seeds().games.find(x=>x.key===g.key));
 const base=profiles.profileFor({engine:g.engine,title:g.prints.title||g.key,exe:'',exeSha256:''});
 const own=profiles.profileFor({engine:g.engine,title:g.prints.title||g.key,exe:'',exeSha256:'',auto:{placement:{lineOffsetY:7}}});
 assert.ok(base&&own);
 assert.equal(JSON.stringify(seed.seeds().games.find(x=>x.key===g.key)),before,'the seed is not written back');
});
