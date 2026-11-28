// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-27 megulit.com user centre (site/public/me/, assets/js/me-*.mjs): dictionary look-up on a tapped character, the
   dashboard numbers, the incremental sync into the local store, the dictionary builder, the service worker's offline behaviour,
   the top-bar account button, and the PWA files. Pure logic runs in Node; the service worker and the button run in a vm with a
   small fake of the browser objects they touch. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
const site=path.join(__dirname,'..','site'),pub=path.join(site,'public'),js=path.join(pub,'assets','js');
const core=()=>import(pathToFileURL(path.join(js,'me-core.mjs')).href);
const builder=require('../site/tools/build-web-dict.cjs');

const ENTRIES=[
 {id:1,spellings:['気持ち'],readings:['きもち'],definitions:['心情','感觉'],pos:['n'],freq_rank:10},
 {id:2,spellings:['気'],readings:['き'],definitions:['气'],pos:['n'],freq_rank:5},
 {id:3,spellings:['食べる'],readings:['たべる'],definitions:['吃'],pos:['v1','vt'],freq_rank:3},
 {id:4,spellings:['書く'],readings:['かく'],definitions:['写'],pos:['v5k'],freq_rank:4},
 {id:5,spellings:['嘘'],readings:['うそ'],definitions:['谎言'],pos:['n'],freq_rank:20},
 {id:6,spellings:['美しい'],readings:['うつくしい'],definitions:['美丽'],pos:['adj-i'],freq_rank:30},
 {id:7,spellings:['勉強'],readings:['べんきょう'],definitions:['学习'],pos:['n','vs'],freq_rank:6},
 {id:8,spellings:[],readings:['ヽ'],definitions:[],pos:[],freq_rank:0},
 {id:9,spellings:['行く'],readings:['いく','ゆく'],definitions:['去'],pos:['v5k-s'],freq_rank:1},
 {id:10,spellings:['飲む'],readings:['のむ'],definitions:['喝'],pos:['v5m'],freq_rank:7}
];
const shardsOf=entries=>{const {shards}=builder.build(entries);return n=>shards[n];};

test('dictionary builder: every form of an entry is found in the file the page asks for; entries without a definition are left out',async()=>{
 const {shardOf,SHARDS,pickEntries}=await core();
 assert.equal(builder.SHARDS,SHARDS,'builder and page agree on the number of files');
 for(const form of ['気持ち','気','きもち','食べる','a','ー','😀x','𠮷野'])assert.equal(builder.shardOf(form),shardOf(form),'same file for '+form);
 const {shards,count}=builder.build(ENTRIES);
 assert.equal(shards.length,SHARDS);assert.equal(count,9,'the entry with no definition is dropped');
 for(const e of ENTRIES.filter(e=>e.definitions.length))for(const form of [...e.spellings,...e.readings]){
  const hits=pickEntries(shards[shardOf(form)],form);assert.ok(hits.some(h=>h.id===e.id),form);
 }
 assert.deepEqual(shards[shardOf('ヽ')].filter(e=>e[0]===8),[]);
 /* definitions are cut to 6 and clipped */
 const long=builder.compact({id:1,spellings:['x'],readings:['x'],definitions:Array.from({length:9},(_,i)=>'d'+i),pos:['a','b','c','d']});
 assert.equal(long[3].length,6);assert.equal(long[4].length,3);
 const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'web-dict-'));
 try{const out=builder.write(ENTRIES,dir);assert.equal(out.entries,9);assert.equal(fs.readdirSync(dir).length,SHARDS+1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,shardOf('嘘')+'.json'),'utf8')).map(e=>e[0]),[5]);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('tapping a character finds the longest word from there, also through conjugation',async()=>{
 const {lookupAt,deinflect,candidates,isWordChar,shardOf}=await core(),load=async n=>shardsOf(ENTRIES)(n);
 let r=await lookupAt('この気持ちは、きっと嘘じゃない。',2,load);
 assert.equal(r.surface,'気持ち','the longest word wins over 気');assert.equal(r.entries[0].id,1);assert.deepEqual(r.entries[0].definitions,['心情','感觉']);
 assert.deepEqual((await lookupAt('この気持ちは',3,load)).entries,[],'a tap on 持 starts a new word there, and there is none');
 r=await lookupAt('毎日食べました。',2,load);assert.equal(r.form,'食べる');assert.equal(r.surface,'食べました');
 r=await lookupAt('手紙を書いて',3,load);assert.equal(r.form,'書く');
 r=await lookupAt('それは美しかった',3,load);assert.equal(r.form,'美しい');
 r=await lookupAt('勉強した',0,load);assert.equal(r.form,'勉強');
 r=await lookupAt('昨日行った',2,load);assert.equal(r.form,'行く');
 r=await lookupAt('ジュースを飲まない',5,load);assert.equal(r.form,'飲む');
 assert.deepEqual((await lookupAt('、きっと',0,load)).entries,[],'punctuation is not a word');
 assert.deepEqual(candidates('、あ',0),[]);assert.ok(isWordChar('気')&&isWordChar('ー')&&!isWordChar('。')&&!isWordChar('a'));
 assert.equal(deinflect('食べる')[0],'食べる','the surface itself comes first');
 /* the dictionary is not installed or not cached: the card says so instead of "not found" */
 r=await lookupAt('気持ち',0,async()=>null);assert.equal(r.unavailable,true);assert.deepEqual(r.entries,[]);
 /* a word whose longer form is not cached still resolves through the shorter one that is */
  assert.notEqual(shardOf('気持ち'),shardOf('気'));
 const partial=async n=>{const shard=shardsOf(ENTRIES)(n);return shard.some(e=>e[0]===1)?null:shard;};
 r=await lookupAt('気持ち',0,partial);assert.equal(r.entries[0].id,2);
});

test('dashboard numbers: reading time across devices, 30-day series, streak, mastery, routes',async()=>{
 const {buildStats,routes,dayKey,filterSentences,filterWords,parseDefinitions}=await core();
 const now=new Date(2026,10,27,20,0,0),day=n=>dayKey(new Date(2026,10,27-n));
 const reading=[
  {device:'a',day:day(0),game:'千恋＊万花',seconds:3600,characters:5000,sentences:400},
  {device:'b',day:day(0),game:'千恋＊万花',seconds:600,characters:700,sentences:50},
  {device:'a',day:day(1),game:'CHAOS;CHILD',seconds:1800,characters:2000,sentences:150},
  {device:'a',day:day(2),game:'CHAOS;CHILD',seconds:60,characters:10,sentences:1},
  {device:'a',day:day(4),game:'CHAOS;CHILD',seconds:900,characters:1,sentences:1},
  {device:'a',day:day(40),game:'old',seconds:7200,characters:1,sentences:1}
 ];
 const s=buildStats({reading,words:[{status:0},{status:1},{status:2},{status:3},{status:4},{status:9},{}],sentences:[{},{}],study:[{lookups:3,reviews:2,newWords:1},{lookups:4}],progress:[]},now);
 assert.equal(s.seconds,3600+600+1800+60+900+7200);assert.equal(s.characters,5000+700+2000+10+1+1);
 assert.equal(s.series.length,30);assert.equal(s.series.at(-1).day,day(0));assert.equal(s.series.at(-1).minutes,70,'two devices on one day add up');assert.equal(s.series.find(d=>d.day===day(40)),undefined,'older than 30 days is not in the chart');
 assert.equal(s.streak,3,'today, yesterday and the day before; the gap on day 3 ends it');
 assert.deepEqual(s.mastery,{new:2,learning:2,known:3},'a status above 4 counts as known, a missing one as new');
 assert.deepEqual(s.study,{lookups:7,reviews:2,newWords:1});assert.equal(s.words,7);assert.equal(s.sentences,2);
 assert.deepEqual(s.games.map(g=>g.game),['old','千恋＊万花','CHAOS;CHILD']);
 /* no reading today: the streak counts from yesterday */
 assert.equal(buildStats({reading:[{day:day(1),seconds:10},{day:day(2),seconds:10}]},now).streak,2);assert.equal(buildStats({reading:[{day:day(3),seconds:10}]},now).streak,0);
 /* routes: the newest device decides read/total, seconds add up, unknown total stays unknown */
 const r=routes([{game:'G',read:10,total:100,seconds:100,lastPlayedAt:1},{game:'g',read:60,total:100,seconds:50,lastPlayedAt:2},{game:'H',read:5,total:null,seconds:5,lastPlayedAt:3}]);
 assert.deepEqual(r.map(x=>[x.game,x.read,x.seconds,x.ratio]),[['H',5,5,null],['g',60,150,0.6]]);
 assert.deepEqual(parseDefinitions('["心情","感觉"]'),['心情','感觉']);assert.deepEqual(parseDefinitions('plain'),['plain']);assert.deepEqual(parseDefinitions(['a']),['a']);assert.deepEqual(parseDefinitions(undefined),[]);
 const lines=[{text:'この気持ち',translation:'这份心情',game:'A',created_at:2},{text:'嘘じゃない',translation:'不是谎言',game:'B',created_at:3},{text:'おはよう',translation:'早',game:'A',created_at:1}];
 assert.deepEqual(filterSentences(lines,{query:'心情'}).map(x=>x.text),['この気持ち'],'searches the translation');
 assert.deepEqual(filterSentences(lines,{game:'A'}).map(x=>x.created_at),[2,1],'by work, newest first');assert.equal(filterSentences(lines,{query:'zzz'}).length,0);
 const words=[{spelling:'猫',reading:'ねこ',definitions:'["猫"]',status:0,created_at:1},{spelling:'犬',reading:'いぬ',definitions:'["狗"]',status:4,created_at:2}];
 assert.deepEqual(filterWords(words,{mastery:'known'}).map(w=>w.spelling),['犬']);assert.deepEqual(filterWords(words,{query:'ねこ'}).map(w=>w.spelling),['猫']);assert.deepEqual(filterWords(words,{query:'狗'}).map(w=>w.spelling),['犬']);
});

function fakeApi(kinds,pages){
 const calls=[];
 return {calls,get:async p=>{calls.push(p);if(p==='/api/sync')return {ok:true,kinds};const m=/^\/api\/sync\/(\w+)\?since=(\d+)/.exec(p);const list=pages[m[1]]||[];const page=list.find(x=>x.since===Number(m[2]));return {ok:true,kind:m[1],records:page.records,cursor:page.cursor,more:!!page.more};}};
}
function fakeStore(){
 const cursors={},rows=new Map();
 return {rows,cursors,cursor:async k=>cursors[k]||0,setCursor:async(k,n)=>{cursors[k]=n;},clear:async k=>{for(const key of [...rows.keys()])if(key.startsWith(k+'\0'))rows.delete(key);},
  apply:async(k,records)=>{for(const r of records){const id=k+'\0'+r.key;if(r.deleted||!r.data)rows.delete(id);else rows.set(id,r.data);}}};
}
test('sync into the local store: only moved kinds are pulled, pages are followed, tombstones delete, a wiped cloud copy clears the kind',async()=>{
 const {syncKinds}=await core(),store=fakeStore();
 let api=fakeApi({words:{cursor:3,records:2},sentences:{cursor:0,records:0},progress:{cursor:5,records:1}},{
  words:[{since:0,records:[{key:'a',updated_at:1,deleted:false,data:{spelling:'猫'}},{key:'b',updated_at:1,deleted:false,data:{spelling:'犬'}}],cursor:2,more:true},{since:2,records:[{key:'c',updated_at:1,deleted:false,data:{spelling:'鳥'}}],cursor:3}],
  progress:[{since:0,records:[{key:'p',updated_at:1,deleted:false,data:{game:'G',read:1}}],cursor:5}]});
 assert.deepEqual(await syncKinds({api,store}),['words','progress']);
 assert.equal(store.rows.size,4);assert.deepEqual([store.cursors.words,store.cursors.progress],[3,5]);
 assert.ok(!api.calls.some(c=>c.startsWith('/api/sync/sentences')),'a kind that did not move is not pulled');
 /* nothing moved: one summary request, no pages */
 api=fakeApi({words:{cursor:3},progress:{cursor:5}},{});assert.deepEqual(await syncKinds({api,store}),[]);assert.deepEqual(api.calls,['/api/sync']);
 /* a deletion arrives as a tombstone */
 api=fakeApi({words:{cursor:4}},{words:[{since:3,records:[{key:'a',updated_at:2,deleted:true,data:null}],cursor:4}]});
 await syncKinds({api,store,kinds:['words']});assert.ok(!store.rows.has('words\0a'));assert.ok(store.rows.has('words\0b'));
 /* the cloud copy was deleted (「删除云端数据」): the server cursor is behind ours, the kind is emptied */
 api=fakeApi({words:{cursor:0,records:0},progress:{cursor:5}},{});
 assert.deepEqual(await syncKinds({api,store}),['words']);assert.equal([...store.rows.keys()].filter(k=>k.startsWith('words')).length,0);assert.equal(store.cursors.words,0);assert.ok(store.rows.has('progress\0p'),'other kinds stay');
 /* a broken answer is refused, never half applied */
 await assert.rejects(()=>syncKinds({api:{get:async()=>({ok:true})},store}),{code:'SYNC_RESPONSE_INVALID'});
 const loop=fakeApi({words:{cursor:9}},{words:[{since:0,records:[],cursor:0,more:true}]});
 await assert.rejects(()=>syncKinds({api:loop,store:fakeStore(),kinds:['words']}),{code:'SYNC_RESPONSE_INVALID'},'a page that does not advance cannot loop forever');
 /* only reads: the pull never sends anything but GET paths */
 assert.ok(api.calls.every(c=>c.startsWith('/api/sync')));
});

/* ---- service worker, in a vm ------------------------------------------------------------------------------------------ */
function worker({online=true,cached={}}={}){
 const handlers={},store=new Map(Object.entries(cached)),fetched=[];
 const key=k=>typeof k==='string'?k:new URL(k.url).pathname;
 const cache={add:async()=>{},put:async(k,v)=>{store.set(key(k),v);},match:async k=>store.get(key(k))};
 const context={self:{addEventListener:(t,f)=>{handlers[t]=f;},location:{origin:'https://megulit.com'},skipWaiting(){},clients:{claim(){}}},
  caches:{open:async()=>cache,match:async k=>store.get(key(k)),keys:async()=>['me-v0','me-v1','megulit-dict-v1'],delete:async()=>true},
  fetch:async r=>{fetched.push(typeof r==='string'?r:r.url);if(!online)throw new Error('offline');return {ok:true,clone(){return this;},body:'network:'+(typeof r==='string'?r:r.url)};},Request:class{constructor(url){this.url=url;}},URL,Promise};
 vm.runInNewContext(fs.readFileSync(path.join(pub,'me','sw.js'),'utf8'),context);
 const fire=(request)=>{let answer=null;handlers.fetch({request,respondWith:p=>{answer=p;}});return answer;};
 return {fire,fetched,handlers,context};
}
test('service worker: the page opens offline from the cache, the shell comes from the cache, API calls and writes are never intercepted',async()=>{
 const w=worker({online:false,cached:{'/me/':{body:'cached shell'},'/assets/js/me.js':{body:'cached js'}}});
 const nav=await w.fire({method:'GET',url:'https://megulit.com/me/',mode:'navigate'});assert.equal(nav.body,'cached shell');
 const sub=await w.fire({method:'GET',url:'https://megulit.com/me/#/words',mode:'navigate'});assert.equal(sub.body,'cached shell');
 const asset=await w.fire({method:'GET',url:'https://megulit.com/assets/js/me.js',mode:'cors'});assert.equal(asset.body,'cached js');
 assert.equal(w.fetched.filter(u=>u.includes('me.js')).length,0,'the shell does not touch the network');
 assert.equal(w.fire({method:'GET',url:'https://api.megulit.com/api/sync',mode:'cors'}),null,'another origin');
 assert.equal(w.fire({method:'POST',url:'https://megulit.com/me/',mode:'cors'}),null,'a write');
 assert.equal(w.fire({method:'GET',url:'https://megulit.com/dict/v1/12.json',mode:'cors'}),null,'dictionary files are the page\'s own cache');
 assert.equal(w.fire({method:'GET',url:'https://megulit.com/',mode:'navigate'}),null,'the rest of the site is not ours');
 /* online: a navigation is fetched fresh and the cached copy is refreshed */
 const on=worker({online:true});const fresh=await on.fire({method:'GET',url:'https://megulit.com/me/',mode:'navigate'});assert.match(fresh.body,/^network:/);
});
test('service worker: every precached file exists, and the cache name changes with the file set',()=>{
 const source=fs.readFileSync(path.join(pub,'me','sw.js'),'utf8'),list=JSON.parse(/const PRECACHE = (\[[\s\S]*?\]);/.exec(source)[1].replace(/'/g,'"'));
 for(const url of list){const file=url.split('?')[0],local=file==='/me/'?path.join(pub,'me','index.html'):path.join(pub,file.slice(1));assert.ok(fs.existsSync(local),'precached but missing: '+url);}
 for(const f of fs.readdirSync(js).filter(f=>/^me[-.]/.test(f)&&!/entry/.test(f)))assert.ok(list.includes('/assets/js/'+f),'not precached: '+f);
 assert.match(source,/const VERSION = 'me-v\d+'/);
});

/* ---- the account button in the top bar, in a vm ----------------------------------------------------------------------- */
function bar({chip,lang='zh',language='zh-CN'}={}){
 const el=tag=>{const e={tag,className:'',href:'',title:'',alt:'',src:'',children:[],attrs:{},_text:'',
  classList:{add(c){e.className=(e.className+' '+c).trim();}},setAttribute(k,v){e.attrs[k]=v;},removeAttribute(k){delete e.attrs[k];},appendChild(c){e.children.push(c);return c;},querySelector(){return null;}};
  Object.defineProperty(e,'textContent',{get:()=>e._text,set:v=>{e._text=v;e.children=[];}});return e;};
 const tools=el('div'),listeners={},store={'megulit-lang':lang};if(chip!==undefined)store['megulit-me-chip']=JSON.stringify(chip);
 vm.runInNewContext(fs.readFileSync(path.join(js,'me-entry.js'),'utf8'),{document:{querySelector:s=>s==='.top .tools'?tools:null,createElement:el},window:{addEventListener:(t,f)=>{listeners[t]=f;}},localStorage:{getItem:k=>store[k]??null},navigator:{language},JSON,String});
 return {tools,link:tools.children[0],listeners,store};
}
test('top bar account button: 「登录」 when signed out, the avatar or an initial when signed in, always to /me/',()=>{
 let b=bar();assert.equal(b.link.href,'/me/');assert.equal(b.link._text,'登录');assert.equal(b.link.className,'me-chip');assert.match(b.tools.className,/has-chip/);
 b=bar({lang:'en'});assert.equal(b.link._text,'Sign in');b=bar({lang:'ja'});assert.equal(b.link._text,'ログイン');
 b=bar({chip:{n:'megumin',a:''}});assert.equal(b.link._text,'M');assert.match(b.link.className,/on/);assert.match(b.link.attrs['aria-label'],/megumin/);assert.equal(b.link.href,'/me/');
 b=bar({chip:{n:'めぐ',a:'data:image/png;base64,AAAA'}});assert.equal(b.link.children[0].tag,'img');assert.equal(b.link.children[0].src,'data:image/png;base64,AAAA');
 for(const bad of ['javascript:alert(1)','https://evil.example/a.png','data:text/html;base64,AAAA','data:image/svg+xml;base64,AAAA'])
  {b=bar({chip:{n:'x',a:bad}});assert.equal(b.link.children.length,0,'no image for '+bad);assert.equal(b.link._text,'X');}
 /* a language switch repaints it */
 b=bar();b.store['megulit-lang']='en';b.listeners['megulit:lang']();assert.equal(b.link._text,'Sign in');
 /* no top bar on the page: nothing happens */
 assert.doesNotThrow(()=>vm.runInNewContext(fs.readFileSync(path.join(js,'me-entry.js'),'utf8'),{document:{querySelector:()=>null},window:{},localStorage:{getItem:()=>null},navigator:{language:'zh'}}));
});

/* ---- the PWA files and the site's own headers ---------------------------------------------------------------------------- */
test('PWA: the manifest, the page and the headers fit together',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(pub,'me','manifest.webmanifest'),'utf8'));
 assert.equal(manifest.start_url,'/me/');assert.equal(manifest.scope,'/me/');assert.equal(manifest.display,'standalone');
 for(const size of ['192x192','512x512']){const icon=manifest.icons.find(i=>i.sizes===size&&i.purpose==='any');assert.ok(icon,size);const png=fs.readFileSync(path.join(pub,icon.src.slice(1)));assert.equal(png.readUInt32BE(16)+'x'+png.readUInt32BE(20),size,'the file really is '+size);}
 const page=fs.readFileSync(path.join(pub,'me','index.html'),'utf8');
 for(const href of [...page.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map(m=>m[1].split('?')[0]).filter(h=>!/^\/($|#)/.test(h)&&!/^\/(me\/|changelog|\?)/.test(h)&&!h.startsWith('/#')))assert.ok(fs.existsSync(path.join(pub,href.slice(1))),'referenced but missing: '+href);
 assert.match(page,/rel="manifest" href="\/me\/manifest\.webmanifest"/);assert.doesNotMatch(page,/<script(?![^>]*\bsrc=)[^>]*>/,'no inline script: the site CSP has no unsafe-inline');assert.doesNotMatch(page,/\sstyle="/);
 const headers=fs.readFileSync(path.join(pub,'_headers'),'utf8');
 assert.match(headers,/connect-src [^\n]*https:\/\/api\.megulit\.com[^\n]*https:\/\/cn-api\.megulit\.com/);assert.doesNotMatch(headers,/unsafe-inline|unsafe-eval/);
 assert.match(headers,/\/me\/sw\.js\r?\n  Cache-Control: no-cache/);
 for(const f of ['index.html','changelog.html'])assert.match(fs.readFileSync(path.join(pub,f),'utf8'),/<script src="\/assets\/js\/me-entry\.js" defer><\/script>/,f+' loads the account button');
});
test('the three languages have the same text keys',async()=>{
 const {STRINGS,fill,pickLang,errorText}=await import(pathToFileURL(path.join(js,'me-i18n.mjs')).href);
 const keys=l=>Object.keys(STRINGS[l]).sort(),errors=l=>Object.keys(STRINGS[l].errors).sort();
 assert.deepEqual(keys('ja'),keys('zh'));assert.deepEqual(keys('en'),keys('zh'));assert.deepEqual(errors('ja'),errors('zh'));assert.deepEqual(errors('en'),errors('zh'));
 assert.equal(fill('{n} 天',{n:3}),'3 天');assert.equal(pickLang('ja',['en']),'ja');assert.equal(pickLang(null,['en-US']),'en');assert.equal(pickLang(null,['fr']),'zh');
 assert.equal(errorText('en','WRONG_CODE'),'Wrong code');assert.equal(errorText('zh','NOPE'),STRINGS.zh.errors.other);
});

/* ---- 2026-11-29 (owner: 网站这边文字看不清; api.megulit.com hit Cloudflare's daily limit, error 1027) ------------------------- */
async function apiWith(fetcher){
 const saved=globalThis.fetch;globalThis.fetch=fetcher;
 const mod=await import(pathToFileURL(path.join(js,'me-api.mjs')).href+'?t='+Math.random());
 return {mod,restore:()=>{globalThis.fetch=saved;}};
}
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('relay client: Cloudflare 1027/429 reads as the daily quota, a dead network as NETWORK, the relay\'s own RATE_LIMITED stays itself; nothing retries on its own',async()=>{
 const run=async(answer)=>{
  const calls=[];const {mod,restore}=await apiWith(async(url,init={})=>{calls.push((init.mode||'cors')+' '+(init.method||'GET')+' '+new URL(url).host+new URL(url).pathname);return answer(url,init);});
  try{await mod.requestCode('you@example.com');return {code:'OK',calls};}catch(error){return {code:error.code,calls};}finally{restore();}
 };
 /* 1027: Cloudflare's page has no CORS headers, so cors fetches fail while a no-cors probe gets an (opaque) answer */
 let r=await run((url,init)=>{if(init.mode==='no-cors')return new Response('',{status:200});throw new TypeError('Failed to fetch');});
 assert.equal(r.code,'QUOTA_EXCEEDED');
 assert.equal(r.calls.filter(c=>c.startsWith('cors POST')).length,2,'one try per node, no loop: '+r.calls.join(' | '));
 /* a readable 429 that is not the relay's JSON */
 r=await run(url=>new URL(url).pathname==='/api/health'?json(200,{ok:true}):new Response('<html>error code: 1027</html>',{status:429}));assert.equal(r.code,'QUOTA_EXCEEDED');
 /* the network is down: no-cors fails too */
 r=await run(()=>{throw new TypeError('Failed to fetch');});assert.equal(r.code,'NETWORK');
 /* a timeout on a slow link is NETWORK even though the node answers a probe */
 r=await run((url,init)=>{if(init.mode==='no-cors')return new Response('',{status:200});throw new DOMException('timed out','TimeoutError');});assert.equal(r.code,'NETWORK');
 /* the relay's own per-user limit keeps its message */
 r=await run(url=>new URL(url).pathname==='/api/health'?json(200,{ok:true}):json(429,{ok:false,error:'RATE_LIMITED',retryAfter:60}));assert.equal(r.code,'RATE_LIMITED');
 r=await run(url=>json(200,{ok:true,expiresIn:600}));assert.equal(r.code,'OK');
 const {STRINGS}=await import(pathToFileURL(path.join(js,'me-i18n.mjs')).href);
 assert.equal(STRINGS.zh.errors.QUOTA_EXCEEDED,'服务器今日额度已满，北京时间 8 点恢复');
 for(const l of ['zh','ja','en'])assert.doesNotMatch(STRINGS[l].errors.QUOTA_EXCEEDED,/网络|ネットワーク|connection/);
});
test('readability: what people read on /me/ is the body font at 14px or more, with AA contrast in both themes',()=>{
 const css=fs.readFileSync(path.join(pub,'assets','css','me.css'),'utf8');
 const esc=x=>[...x].map(c=>'.*+?^${}()|[]'.includes(c)?'\\'+c:c).join('');
 const rule=sel=>{const m=new RegExp('(^|\\n|\\} )'+esc(sel)+' \\{([^}]*)\\}').exec(css);assert.ok(m,'no rule for '+sel);return m[2];};
 for(const sel of ['.hint','.msg','.help','.offline','.src','.src b','.me-foot','.flabel','.linkish','.btn-red','.btn-mini','.acct','.k','.mtag','.mchip','.lk-pos','.mrows em','.study span','.lk-from, .lk-load, .lk-none','.mn-mail, .mn-sync']){
  const body=rule(sel),font=/font: (\d+) ([\d.]+)rem/.exec(body);assert.ok(font,sel+' sets its font');
  assert.ok(Number(font[2])>=.875,sel+' is at least 14px ('+font[2]+'rem)');assert.match(body,/var\(--sans\)/,sel+' uses the body font');assert.doesNotMatch(body,/MeguLit Mono/,sel);
 }
 assert.match(rule('.btn-red'),/font: 600 1rem/,'buttons are bigger and bold');
 assert.match(rule('.msg.bad'),/border-left: 4px solid var\(--m-hot\)/,'errors stand out');
 const lum=hex=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
 const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
 for(const block of [/^:root \{([^}]*)\}/m.exec(css)[1],/^:root\[data-theme="light"\] \{([^}]*)\}/m.exec(css)[1]]){
  const v=name=>new RegExp('--m-'+name+': (#[0-9a-f]{6})').exec(block)[1];
  for(const fg of ['paper','soft','dim'])assert.ok(ratio(v(fg),v('bg'))>=4.5,`--m-${fg} on --m-bg: ${ratio(v(fg),v('bg')).toFixed(2)}`);
 }
});
