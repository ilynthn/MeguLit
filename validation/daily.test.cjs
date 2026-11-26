process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* E415 日报 page: relay RSS parsing + D1 cache + routes, the bridge's cleaning and link gate, and the page markup. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay');
test('long relay paragraphs keep Unicode characters intact across translation and retry',async()=>{
 const daily=require('../services/daily.cjs'),url='https://www.4gamer.net/games/91/';
 const start='文'.repeat(1999),tail='🌸最後',text=start+tail;
 const fetch=async address=>({ok:true,json:async()=>address.endsWith('/api/news')?{items:[{link:url,title:'Fixture',fulltext:true}]}:
  address.includes('/article?')?{paragraphs:[text,'別の段落。']}:{words:[]}});
 const opts={env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch};
 await daily.view('',null,opts);
 const article=await daily.article('',url,opts);
 assert.equal(article.via,'relay');
 assert.deepEqual(article.paragraphs.map(p=>p.text),[text,'別の段落。']);
 let missing=true;
 const received=[],runtime={reviews:()=>({translate:async list=>{received.push(list);return {texts:list.map(t=>t===tail&&missing?'':t)};}})};
 const run=()=>daily.translate('',runtime,article.paragraphs.map(p=>p.text),'zh',{withEngine:true,translateFree:async()=>''});
 assert.deepEqual(await run(),{texts:['','別の段落。'],engine:'app',error:'ENGINE_EMPTY'});
 missing=false;
 assert.deepEqual((await run()).texts,[text,'別の段落。']);
 assert.deepEqual(received,[[start,tail,'別の段落。'],[tail]]);
});
test('an incomplete single paragraph preserves the last translation error',async()=>{
 const daily=require('../services/daily.cjs');
 const text='失'.repeat(2000)+'末尾';
 const runtime={reviews:()=>({translate:async()=>({texts:['','ending'],error:'MODEL_BUSY'})})};
 await assert.rejects(daily.translate('',runtime,[text],'en',{translateFree:async()=>{throw Error('TRANSLATION_HTTP_429');}}),/TRANSLATION_FAILED:TRANSLATION_HTTP_429/);
});
test('long article paragraphs keep their full dictionary tokens',async()=>{
 const daily=require('../services/daily.cjs'),url='https://www.4gamer.net/games/92/',text='日'.repeat(3999)+'🌸本語';
 const fetch=async address=>({ok:true,json:async()=>address.endsWith('/api/news')?{items:[{link:url,title:'Fixture',fulltext:true}]}:
  address.includes('/article?')?{paragraphs:[text]}:{words:[]}});
 const chunks=[],learning={installed:()=>true,readings:{resolve:tokens=>tokens},tokenize:async t=>{
  if([...t].length>4000)throw Error('TOKENIZER_LIMIT');
  chunks.push(t);return [{surface:t,reading:'ご',readingSource:'dictionary'}];
 }};
 const opts={env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch,runtime:{learning:()=>learning}};
 await daily.view('',null,opts);
 const [p]=(await daily.article('',url,opts)).paragraphs;
 assert.deepEqual(chunks,['日'.repeat(3999),'🌸本語']);
 assert.equal(p.tokens.map(t=>t.s).join(''),text);
 assert.ok(p.tokens.every(t=>t.r==='ご'));
});
test('translation keeps the end of a long news paragraph and its position in the article',async()=>{
 const daily=require('../services/daily.cjs'),{GameReviews}=require('../services/game-reviews.cjs');
 const first='前'.repeat(1700)+'。',second='次'.repeat(1600)+'。',third='終'.repeat(1600)+'。';
 const body=first+second+third,texts=require('../services/news-article.cjs').paragraphs('<p>'+body+'</p><p>末尾。</p>');
 const seen=[],reviews=new GameReviews('',undefined,{engine:()=>'follow',translate:async text=>{seen.push(text);return text;}});
 for(const goal of ['en','zh']){
  seen.length=0;
  const result=await daily.translate('',{reviews:()=>reviews},texts,goal,{translateFree:async()=>''});
  assert.deepEqual(result,[[first,second,third].join(goal==='en'?' ':''),'末尾。']);
  assert.deepEqual(seen,[first,second,third,'末尾。']);
 }
});
test('daily reports the configured engine error when both translations are empty',async()=>{
 const daily=require('../services/daily.cjs'),runtime={reviews:()=>({translate:async()=>({texts:[''],error:'MODEL_BUSY'})})};
 await assert.rejects(daily.translate('',runtime,['空の応答'],'en',{translateFree:async()=>''}),/TRANSLATION_FAILED:MODEL_BUSY/);
});
test('the daily machine settings use the reader fallback and keep its source in cache',async t=>{
 const daily=require('../services/daily.cjs'),{Runtime}=require('../services/runtime.cjs');
 const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'megulit-daily-machine-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runtime=Object.assign(Object.create(Runtime.prototype),{root,folder:root,gameReviews:{translate:async()=>({texts:['wrong']})}});
 for(const reviewEngine of ['machine','follow']){
  fs.writeFileSync(path.join(root,'preferences.json'),JSON.stringify({provider:'google',reviewEngine}));
  const calls=[],options={withEngine:true,translateFree:async(_,o)=>{calls.push(o.preferred);return '译文';}};
  const run=()=>daily.translate(root,runtime,['機械翻訳の設定 '+reviewEngine],'zh',options);
  const expected={texts:['译文'],engine:'microsoft'};
  assert.deepEqual(await run(),expected);
  assert.deepEqual(await run(),expected);
  assert.deepEqual(calls,['microsoft']);
 }
});
test('English daily articles fall back when the selected local model is Chinese-only',async t=>{
 const daily=require('../services/daily.cjs'),{Runtime}=require('../services/runtime.cjs');
 const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'megulit-daily-lang-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runtime=Object.assign(Object.create(Runtime.prototype),{root,folder:root,local:()=>({ensure:async()=>{}}),
  reviewTranslator:{translate:async()=> '中文译文'}});
 for(const [provider,reviewEngine] of [['google','local'],['sakura','follow']]){
  fs.writeFileSync(path.join(root,'preferences.json'),JSON.stringify({provider,reviewEngine}));
  const text='言語のテスト '+provider,used=[];
  const options={withEngine:true,translateFree:async(t,o)=>{used.push([t,o.target]);return 'English';}};
  const result=await daily.translate(root,runtime,[text],'en',options);
  assert.deepEqual(result,{texts:['English'],engine:'microsoft'});
  assert.deepEqual(used,[[text,'en']]);
  assert.deepEqual(await daily.translate(root,runtime,[text],'en',options),result);
  assert.equal(used.length,1);
  assert.deepEqual(await daily.translate(root,runtime,[text],'zh',options),{texts:['中文译文'],engine:'app'});
 }
});
test('daily uses the configured review translator through the last article paragraph',async()=>{
 const daily=require('../services/daily.cjs'),{GameReviews}=require('../services/game-reviews.cjs');
 const reviews=new GameReviews('',undefined,{engine:()=>'api',translate:async text=>'translated '+text});
 const list=Array.from({length:120},(_,i)=>'記事の段落 '+i);
 const article=require('../services/news-article.cjs').paragraphs(list.map(t=>'<p>'+t+'</p>').join(''));
 assert.deepEqual(article,list);
 const fallback=[];
 const result=await daily.translate('',{reviews:()=>reviews},article,'en',{withEngine:true,translateFree:async t=>{fallback.push(t);return 'fallback';}});
 assert.deepEqual({length:result.texts.length,first:result.texts[0],last:result.texts.at(-1),fallback:fallback.length},
  {length:120,first:'translated '+list[0],last:'translated '+list.at(-1),fallback:0});
 assert.deepEqual(result,{texts:list.map(t=>'translated '+t),engine:'app'});
});
test('daily falls back only for missing paragraphs in a structured engine result',async()=>{
 const daily=require('../services/daily.cjs'),texts=['記事の冒頭','記事の末尾'],used=[];
 const runtime={reviews:()=>({translate:async()=>({texts:['opening',''],engine:'api',error:'MODEL_BUSY'})})};
 const options={withEngine:true,translateFree:async t=>{used.push(t);return 'ending';}};
 const expected={texts:['opening','ending'],engine:'app+microsoft'};
 assert.deepEqual(await daily.translate('',runtime,texts,'en',options),expected);
 assert.deepEqual(used,[texts[1]]);
 assert.deepEqual(await daily.translate('',runtime,texts,'en',options),expected);
 assert.deepEqual(used,[texts[1]]);
});
const load=name=>import(pathToFileURL(path.join(relayDir,'src',name)).href);
const MIGRATIONS=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATIONS);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});return {prepare:sql=>stmt(sql)};}
const MOE=`<rss><channel><item><title>2027年1月発売タイトル新規登録</title><link>https://moepedia.net/news/2026/1030/793/</link><pubDate>Mon, 09 Nov 2026 04:07:50 +0000</pubDate><description><![CDATA[1月29日発売予定。『逆転支配』ほか。続きはこちら。]]></description><content:encoded><![CDATA[<p><img src="https://moepedia.net/a.jpg">本文はコピーしない</p>]]></content:encoded></item></channel></rss>`;
const G4=`<rdf:RDF><item rdf:about="https://www.4gamer.net/games/1/"><title>PS3 20周年</title><link>https://www.4gamer.net/games/1/</link><dc:date>2026-11-11T07:00:00+09:00</dc:date><description>ゲーム機の話</description></item><item rdf:about="https://www.4gamer.net/games/2/"><title>恋愛ADV「星の歌」Steam版が発売</title><link>https://www.4gamer.net/games/2/</link><dc:date>2026-11-10T07:00:00+09:00</dc:date><description>ノベルゲームの新作です。</description></item></rdf:RDF>`;
const DEN=`<rss><item><title>美少女ゲーム特集 &amp; 対談</title><link>https://news.denfaminicogamer.jp/news/1</link><pubDate>Tue, 10 Nov 2026 15:52:28 +0000</pubDate><description><![CDATA[一文目。二文目。三文目は要らない。]]></description><enclosure url="https://news.denfaminicogamer.jp/x.jpg" type="image/jpeg" length="1"/></item></rss>`;
const TRENDS=`<rss><channel><item><title>チキンマックナゲット</title><ht:approx_traffic>200+</ht:approx_traffic><ht:news_item><ht:news_item_title>ナゲット値下げ</ht:news_item_title><ht:news_item_url>https://news.yahoo.co.jp/a</ht:news_item_url><ht:news_item_source>Yahoo!ニュース</ht:news_item_source></ht:news_item></item><item><title>arsenal</title></item><item><title>文化祭</title></item></channel></rss>`;
const NHK=`<rss><item><title>「線状降水帯」に警戒 「文化祭」も中止</title><link>https://www3.nhk.or.jp/news/1</link></item></rss>`;
const fetcher=map=>async url=>{for(const[k,v]of Object.entries(map))if(url.startsWith(k))return {ok:true,text:async()=>v};return {ok:false,text:async()=>''};};
const FEEDS={'https://moepedia.net':MOE,'https://www.4gamer.net':G4,'https://news.denfaminicogamer.jp':DEN,'https://trends.google.com':TRENDS,'https://www3.nhk.or.jp':NHK};

test('news: galgame filter on general sites, summary capped at two sentences, no article body, thumbnails',async()=>{
 const d=await load('daily.js');
 const moe=d.parseNews(MOE,d.NEWS_FEEDS[0]);assert.equal(moe.length,1);assert.equal(moe[0].image,'https://moepedia.net/a.jpg');assert.doesNotMatch(JSON.stringify(moe),/本文はコピーしない/);
 assert.equal(moe[0].summary,'1月29日発売予定。『逆転支配』ほか。');
 const g4=d.parseNews(G4,d.NEWS_FEEDS[1]);assert.deepEqual(g4.map(n=>n.title),['恋愛ADV「星の歌」Steam版が発売']);
 const den=d.parseNews(DEN,d.NEWS_FEEDS[2]);assert.equal(den[0].title,'美少女ゲーム特集 & 対談');assert.equal(den[0].image,'https://news.denfaminicogamer.jp/x.jpg');assert.equal(den[0].summary,'一文目。二文目。');
});
test('hot words: Japanese terms only, kana readings, NHK fills up to ten',async()=>{
 const d=await load('daily.js');const t=d.parseTrends(TRENDS);
 assert.deepEqual(t.map(w=>w.term),['チキンマックナゲット','文化祭']);assert.equal(t[0].reading,'チキンマックナゲット');assert.equal(t[1].reading,'');assert.equal(t[0].url,'https://news.yahoo.co.jp/a');
 const e={DB:d1()};await d.refreshWords(e,new Date('2026-11-11T00:00:00Z'),fetcher(FEEDS));
 const r=await d.hotWordsDailyGet(e,new URL('https://x/api/hotwords/daily'),{json:v=>v,fail:c=>c},new Date('2026-11-11T00:10:00Z'));
 assert.deepEqual(r.words.map(w=>w.term),['チキンマックナゲット','文化祭','線状降水帯']);assert.equal(r.day,'2026-11-11');assert.match(r.source,/NHK/);
});
test('relay routes: /api/news and /api/hotwords/daily fetch once when empty, cron refreshes, bad day rejected',async()=>{
 const {handle,scheduled}=await load('worker.js');
 const e={DB:d1(),HASH_SALT:'s',LINK_SECRET:'l'};const real=globalThis.fetch;globalThis.fetch=fetcher(FEEDS);
 try{
  const req=p=>new Request('https://relay.test'+p,{headers:{'cf-connecting-ip':'10.9.0.1'}});
  const news=await (await handle(req('/api/news'),e)).json();assert.equal(news.items.length,3);assert.ok(news.updatedAt);assert.equal(news.items[0].source,'電ファミニコゲーマー');
  const words=await (await handle(req('/api/hotwords/daily'),e)).json();assert.equal(words.words.length,3);
  assert.equal((await handle(req('/api/hotwords/daily?day=bad'),e)).status,400);
  assert.deepEqual(await scheduled({cron:'20 21 * * *',scheduledTime:Date.now()},e,null),{news:3,words:3,removed:0});
  assert.match(fs.readFileSync(path.join(relayDir,'wrangler.toml'),'utf8'),/"20 21 \* \* \*"/);
 }finally{globalThis.fetch=real;}
});
test('bridge: not-configured without relay, cleans data, dictionary readings only for exact headwords, link gate',async()=>{
 const daily=require('../services/daily.cjs');
 assert.equal((await daily.view('',null,{env:{MEGULIT_RELAY_BASE:'off'}})).state,'not-configured');
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE dictionary_entries(spelling TEXT,reading TEXT,definition TEXT,frequency INTEGER);INSERT INTO dictionary_entries VALUES('文化祭','ぶんかさい','文化节',1)");
 const f=async url=>({ok:true,json:async()=>url.endsWith('/api/news')?{items:[{title:'t',link:'https://moepedia.net/n',image:'javascript:alert(1)'},{title:'x',link:'javascript:alert(1)'}]}:{day:'2026-11-11',words:[{term:'文化祭'},{term:'線状降水帯',url:'https://www3.nhk.or.jp/news/1'}]}});
 const v=await daily.view('',db,{env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:f});
 assert.equal(v.state,'ok');assert.equal(v.news.items.length,1);assert.equal(v.news.items[0].image,'');
 assert.equal(v.words.words[0].reading,'ぶんかさい');assert.equal(v.words.words[1].reading,'');
 assert.ok(daily.canOpen('https://moepedia.net/n'));assert.ok(daily.canOpen('https://www3.nhk.or.jp/news/1'));assert.ok(!daily.canOpen('https://evil.example/'));
 const fail=await daily.view('',db,{env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:async()=>{throw Error('x');}});assert.equal(fail.state,'error');
});
test('page: tab label, empty state, lookup on word click, ruby only with a reading, escaped text',async()=>{
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','daily-view.js')).href);
 assert.deepEqual(view.dailyLabel,{zh:'日报',ja:'日報',en:'Daily'});
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 for(const locale of ['zh','ja','en']){const empty=view.pageHTML({state:'not-configured'},{locale,esc});assert.match(empty,/dl-empty/);assert.match(empty,/data-dl-refresh/);}
 const html=view.pageHTML({state:'ok',news:{items:[{title:'<b>見出し</b>',link:'https://moepedia.net/n',source:'Moepedia',summary:'s',date:''}]},words:{words:[{term:'文化祭',reading:'ぶんかさい'},{term:'ナゲット',reading:'ナゲット'}]}},{locale:'zh',esc});
 assert.match(html,/data-dl-lookup="文化祭"/);assert.match(html,/<ruby>文化祭<rt>ぶんかさい<\/rt><\/ruby>/);assert.doesNotMatch(html,/<ruby>ナゲット/);assert.doesNotMatch(html,/<b>見出し/);
 const app=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');assert.match(app,/navigate\('learning','dictionary'\)/);assert.match(app,/if\(pendingLookup\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','index.html'),'utf8'),/daily\.css/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8'),/case 'daily_open':\{const url=String\(request\.url\|\|''\);if\(!require\('\.\/daily\.cjs'\)\.canOpen\(url\)\)/);
});
function r2(){const store=new Map();return {store,head:async k=>store.has(k)?{}:null,put:async(k,b,o)=>{store.set(k,{body:b,httpMetadata:o?.httpMetadata,customMetadata:o?.customMetadata});},get:async k=>store.get(k)||null,delete:async k=>{store.delete(k);},list:async()=>({objects:[...store].map(([key,v])=>({key,customMetadata:v.customMetadata})),truncated:false})};}
test('thumbnails: copied to R2 (RSS picture or og:image), served from the relay, cleaned after two days',async()=>{
 const d=await load('daily.js'),{handle}=await load('worker.js');
 const img=(type='image/jpeg',size=10)=>({ok:true,headers:new Headers({'content-type':type}),arrayBuffer:async()=>new Uint8Array(size).buffer});
 const calls=[];const f=async url=>{calls.push(url);if(url==='https://news.denfaminicogamer.jp/x.jpg')return img();if(url==='https://www.4gamer.net/games/2/')return {ok:true,text:async()=>'<meta property="og:image" content="/og.png">'};if(url==='https://www.4gamer.net/og.png')return img('image/png');if(url==='https://moepedia.net/a.jpg')return img('text/html');return fetcher(FEEDS)(url);};
 const e={DB:d1(),BUCKET:r2()},t0=new Date('2026-11-11T00:00:00Z');
 await d.refreshNews(e,t0,f);
 const news=await d.newsGet(e,{json:v=>v},t0);
 const by=Object.fromEntries(news.items.map(n=>[n.sourceId,n.image]));
 assert.match(by.denfami,/^\/api\/news\/img\/[0-9a-f]{32}$/);assert.match(by['4gamer'],/^\/api\/news\/img\/[0-9a-f]{32}$/);assert.equal(by.moepedia,'','non-image content is not stored');
 assert.equal(e.BUCKET.store.size,2);
 calls.length=0;await d.refreshNews(e,t0,f);assert.ok(!calls.includes('https://news.denfaminicogamer.jp/x.jpg'),'already mirrored images are not fetched again');
 const real=globalThis.fetch;globalThis.fetch=async()=>({ok:false,text:async()=>''});
 try{const res=await handle(new Request('https://relay.test'+by.denfami,{headers:{'cf-connecting-ip':'10.9.0.2'}}),e);assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'image/jpeg');
  assert.equal((await handle(new Request('https://relay.test/api/news/img/'+'0'.repeat(32),{headers:{'cf-connecting-ip':'10.9.0.2'}}),e)).status,404);}finally{globalThis.fetch=real;}
 assert.equal(await d.cleanupImages(e,new Date(t0.getTime()+86400e3)),0);assert.equal(await d.cleanupImages(e,new Date(t0.getTime()+3*86400e3)),2);assert.equal(e.BUCKET.store.size,0);
});
test('bridge thumbnails: only relay image paths, fetched once into data/cache, returned as data: URLs',async()=>{
 const daily=require('../services/daily.cjs'),root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'dl-'));
 const id='a'.repeat(32);let imgCalls=0;
 const f=async url=>{if(url.includes('/api/news/img/')){imgCalls++;return {ok:true,headers:new Headers({'content-type':'image/png'}),arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};}
  return {ok:true,json:async()=>url.endsWith('/api/news')?{items:[{title:'t',link:'https://moepedia.net/n',image:'/api/news/img/'+id},{title:'u',link:'https://moepedia.net/m',image:'https://evil.example/x.png'}]}:{words:[]}};};
 const opts={env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:f};
 const v=await daily.view(root,null,opts);assert.equal(v.news.items[0].image,'data:image/png;base64,AQID');assert.equal(v.news.items[1].image,'');
 await daily.view(root,null,opts);assert.equal(imgCalls,1,'second view reads the local cache');
 assert.ok(fs.existsSync(path.join(root,'data','cache','daily-img',id)));
});

const G4PAGE='<html><head><meta property="og:title" content="恋愛ADV「星の歌」"></head><body><nav>メニュー</nav><div class="maintxt"><!--[if !IE]>↓本文↓<![endif]--><div class="entry-content">　新作の<strong>恋愛ADV</strong>が発売された。<br><table><tr><td><img src="x"></td></tr></table><br>　価格は3000円だ。<script>ad()</script><!--[if !IE]>↑本文↑<![endif]--></div><footer>Copyright</footer></body></html>';
test('article text: site body only, no tags, scripts, tables or footer',()=>{
 const a=require('../services/news-article.cjs');
 const x=a.extract(G4PAGE,'https://www.4gamer.net/games/2/');
 assert.equal(x.title,'恋愛ADV「星の歌」');assert.deepEqual(x.paragraphs,['新作の恋愛ADVが発売された。','価格は3000円だ。']);
 const den=a.extract('<div id="articleBody" ><p>一段目。</p><p>二段目。</p><div class="inner-related-article"><p>関連</p></div></div>','https://news.denfaminicogamer.jp/news/1');assert.deepEqual(den.paragraphs,['一段目。','二段目。']);
 const moe=a.extract('<div class="post-body"><p>1月29日発売予定<br />『作品』</p></div><div class="post-share"><p>Share</p></div>','https://moepedia.net/news/1');assert.deepEqual(moe.paragraphs,['1月29日発売予定','『作品』']);
});
test('fast fetch: falls back to a plain request when DoH gives nothing',async()=>{
 const ff=require('../services/fast-fetch.cjs');let plain=0;
 const r=await ff.getText('https://example.invalid/a',{doh:async()=>({ok:false}),fetch:async()=>{plain++;return {ok:true,url:'https://example.invalid/a',text:async()=>'<p>x</p>'};}});
 assert.equal(r.ok,true);assert.equal(r.via,'direct');assert.equal(plain,1);
 assert.equal(await ff.fastest([]),'');
});
test('relay full text: only for NEWS_FULLTEXT_SOURCES and only current stories, cached in R2',async()=>{
 const d=await load('daily.js');const e={DB:d1(),BUCKET:r2()},t0=new Date('2026-11-11T00:00:00Z');
 await d.refreshNews(e,t0,fetcher(FEEDS));
 const json=(v,status=200)=>({v,status}),fail=(c,status)=>({v:{error:c},status});
 const link='https://www.4gamer.net/games/2/',u=new URL('https://x/api/news/article?link='+encodeURIComponent(link));
 assert.equal((await d.articleGet(e,u,{json,fail},t0,async()=>({ok:true,text:async()=>G4PAGE}))).status,404,'empty allowlist: nothing is served');
 e.NEWS_FULLTEXT_SOURCES='4gamer';let calls=0;const page=async()=>{calls++;return {ok:true,text:async()=>G4PAGE};};
 const r=await d.articleGet(e,u,{json,fail},t0,page);assert.equal(r.status,200);assert.deepEqual(r.v.paragraphs,['新作の恋愛ADVが発売された。','価格は3000円だ。']);
 await d.articleGet(e,u,{json,fail},t0,page);assert.equal(calls,1,'second read comes from R2');
 assert.equal((await d.articleGet(e,new URL('https://x/api/news/article?link='+encodeURIComponent('https://evil.example/')),{json,fail},t0,page)).status,404);
 const news=await d.newsGet(e,{json:v=>v},t0);assert.equal(news.items.find(n=>n.sourceId==='4gamer').fulltext,true);assert.equal(news.items.find(n=>n.sourceId==='moepedia').fulltext,false);
 assert.equal(await d.cleanupImages(e,new Date(t0.getTime()+3*86400e3))>=1,true);assert.equal([...e.BUCKET.store.keys()].filter(k=>k.startsWith('daily-article/')).length,0);
});
test('bridge reader: article fetched on this PC unless the relay may serve it, cached, tokens keep only dictionary readings; Anki deck megulit_news',async()=>{
 const daily=require('../services/daily.cjs'),root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'dl-'));
 const link='https://www.4gamer.net/games/9/';const calls=[];
 const f=async url=>{calls.push(url);if(url.endsWith('/api/news'))return {ok:true,json:async()=>({items:[{title:'t',link,source:'4Gamer.net'}]})};if(url.includes('/api/hotwords'))return {ok:true,json:async()=>({words:[]})};if(url===link)return {ok:true,url:link,text:async()=>G4PAGE};return {ok:false};};
 const opts={env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:f,doh:async()=>({ok:false})};
 await assert.rejects(daily.article(root,'https://evil.example/',opts),/URL_NOT_ALLOWED/);
 await daily.view(root,null,opts);
 const learning={installed:()=>true,tokenize:async()=>[{surface:'新作',reading:'シンサク'},{surface:'。'}],readings:{resolve:t=>[{...t[0],reading:'しんさく',readingSource:'dictionary'},{surface:'価格',reading:'カカク',base_form:'価格'}]}};
 const a=await daily.article(root,link,{...opts,runtime:{learning:()=>learning}});
 assert.equal(a.state,'ok');assert.equal(a.via,'direct');assert.equal(a.paragraphs.length,2);assert.ok(!calls.some(u=>u.includes('/api/news/article')),'not on the relay allowlist: no relay request');
 assert.deepEqual(a.paragraphs[0].tokens,[{s:'新作',b:'新作',r:'しんさく'},{s:'価格',b:'価格',r:''}]);
 calls.length=0;await daily.article(root,link,opts);assert.ok(!calls.includes(link),'second open reads data/cache');
 assert.equal(daily.NEWS_DECK,'megulit_news');
 const src=fs.readFileSync(path.join(__dirname,'..','services','daily.cjs'),'utf8');assert.match(src,/ankiDeck:NEWS_DECK/);
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','daily-view.js')).href);
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 assert.equal(view.paragraphHTML({text:'x',tokens:[{s:'新作',b:'新作',r:'しんさく'},{s:'。',b:'。',r:''},{s:'する',b:'する',r:'する'}]},esc),'<span class="rd-t" data-b="新作" data-r="しんさく"><ruby>新作<rt>しんさく</rt></ruby></span>。<span class="rd-t" data-b="する" data-r="する">する</span>');
 const shell=view.readerShell({title:'<t>',source:'S',link},{rdJa:'日文',rdTr:'译文',rdBi:'双语',rdOrig:'o',rdClose:'c',rdHint:'h',rdLoading:'l'},esc);assert.match(shell,/data-rd-mode="tr"/);assert.match(shell,/data-rd-mode="bi"/);assert.doesNotMatch(shell,/<t>/);
});
test('translation: engine first, Microsoft when the engine gives nothing, cached, failure carries the reason',async()=>{
 const daily=require('../services/daily.cjs'),root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'dl-'));
 const broken={reviews:()=>({translate:async list=>list.map(()=>'')})};let calls=[];
 const free=async(text,o)=>{calls.push(o.preferred);return '译:'+text;};
 assert.deepEqual(await daily.translate(root,broken,['一段目。','二段目。'],'zh',{translateFree:free}),['译:一段目。','译:二段目。']);
 assert.deepEqual(calls,['microsoft','microsoft']);
 calls=[];assert.deepEqual(await daily.translate(root,broken,['一段目。'],'zh',{translateFree:free}),['译:一段目。']);assert.equal(calls.length,0,'second time from cache');
 const fine={reviews:()=>({translate:async list=>list.map(t=>'引擎:'+t)})};
 assert.deepEqual(await daily.translate(root,fine,['三段目。'],'zh',{translateFree:free}),['引擎:三段目。']);
 const dead={reviews:()=>({translate:async()=>{throw Error('LOCAL_MODEL_MISSING');}})};
 await assert.rejects(daily.translate(root,dead,['四段目。'],'zh',{translateFree:async()=>{throw Error('TRANSLATION_HTTP_429');}}),/TRANSLATION_FAILED:TRANSLATION_HTTP_429/);
 assert.ok(fs.existsSync(path.join(root,'data','cache','daily-translate.json')));
});
test('hot word glosses: dictionary first (first senses, first reading), then the relay AI note, then machine translation',async()=>{
 const daily=require('../services/daily.cjs');
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE dictionary_entries(spelling TEXT,reading TEXT,definition TEXT,frequency INTEGER);INSERT INTO dictionary_entries VALUES('上場廃止','じょうじょうはいし','上市废止；退市；摘牌\n其他',1),('手術','しゅじゅつ · しゅずつ','手术；外科手术；手术操作',1)");
 assert.deepEqual(daily.dictFor(db,'上場廃止'),{reading:'じょうじょうはいし',gloss:'上市废止；退市'});assert.equal(daily.dictFor(db,'手術').reading,'しゅじゅつ');
 const f=async url=>url.endsWith('/api/news')?{ok:true,json:async()=>({items:[]})}:{ok:true,json:async()=>({words:[{term:'上場廃止'},{term:'中村晃',gloss:'棒球选手'},{term:'ナゲット'}]})};
 const v=await daily.view('',db,{env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:f,translateFree:async t=>t==='ナゲット'?'鸡块':t});
 const g=Object.fromEntries(v.words.words.map(w=>[w.term,[w.gloss,w.glossFrom]]));
 assert.deepEqual(g,{'上場廃止':['上市废止；退市','dict'],'中村晃':['棒球选手','ai'],'ナゲット':['鸡块','mt']});
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','daily-view.js')).href);
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const html=view.pageHTML({state:'ok',news:{items:[]},words:v.words},{locale:'zh',esc});
 assert.match(html,/<small class="dl-gloss">上市废止；退市<\/small>/);assert.match(html,/<dt>释义<\/dt><dd>棒球选手<em>AI 注释<\/em><\/dd>/);
 const w={trWhy:{LOCAL_MODEL_MISSING:'本地模型还没下载',API_KEY_MISSING:'k',TRANSLATION_HTTP_429:'429',NETWORK:'net',TIMEOUT:'t',other:'o'}};
 assert.equal(view.trReason(Error('TRANSLATION_FAILED:LOCAL_MODEL_MISSING'),w),'本地模型还没下载');assert.equal(view.trReason(Error('fetch failed'),w),'net');
});
test('relay glosses: Workers AI JSON list (thinking stripped), fallback model, kept on the stored words',async()=>{
 const d=await load('daily.js');
 assert.deepEqual(d.parseGlosses('<think>…</think>["退市","棒球选手"]',2),['退市','棒球选手']);assert.deepEqual(d.parseGlosses('nope',2),[]);
 const seen=[];const AI={run:async model=>{seen.push(model);if(model===d.GLOSS_MODEL)throw Error('no model');return {response:'["快餐产品","学校活动"]'};}};
 const e={DB:d1(),AI,HOT_MODEL:'@cf/qwen/qwen3-30b-a3b-fp8'};await d.refreshWords(e,new Date('2026-11-11T00:00:00Z'),fetcher(FEEDS));
 const r=await d.hotWordsDailyGet(e,new URL('https://x/api/hotwords/daily'),{json:v=>v,fail:c=>c},new Date('2026-11-11T00:10:00Z'));
 assert.deepEqual(r.words.slice(0,2).map(w=>w.gloss),['快餐产品','学校活动']);assert.deepEqual(seen,[d.GLOSS_MODEL,d.GLOSS_FALLBACK]);
});
test('more news: Atom feeds, ACG category, stories kept for days across refreshes, capped per category',async()=>{
 const d=await load('daily.js');
 const atom='<feed><entry><title>新刊リスト</title><link rel="alternate" href="https://natalie.mu/comic/news/1"></link><updated>2026-11-11T00:00:00+09:00</updated><summary type="html">マンガ雑誌のお知らせ。</summary></entry></feed>';
 const nat=d.NEWS_FEEDS.find(f=>f.id==='natalie');const x=d.parseNews(atom,nat);
 assert.deepEqual(x.map(n=>[n.title,n.link,n.cat,n.summary]),[['新刊リスト','https://natalie.mu/comic/news/1','acg','マンガ雑誌のお知らせ。']]);
 assert.ok(d.NEWS_FEEDS.filter(f=>f.cat==='acg').length>=2);assert.ok(d.NEWS_FEEDS.length>=10);
 const e={DB:d1()},day1=new Date('2026-11-11T00:00:00Z');
 await d.refreshNews(e,day1,fetcher({...FEEDS,'https://natalie.mu':atom}));
 /* next day: the feeds no longer list the 4Gamer story, it stays; ten days later it is gone */
 await d.refreshNews(e,new Date('2026-11-12T00:00:00Z'),fetcher({'https://moepedia.net':MOE}));
 let n=await d.newsGet(e,{json:v=>v},new Date('2026-11-12T00:10:00Z'));
 assert.ok(n.items.some(i=>i.sourceId==='4gamer'));assert.ok(n.items.some(i=>i.cat==='acg'));
 await d.refreshNews(e,new Date('2026-11-25T00:00:00Z'),fetcher({'https://moepedia.net':MOE.replace('Mon, 09 Nov 2026','Tue, 24 Nov 2026')}));
 n=await d.newsGet(e,{json:v=>v},new Date('2026-11-25T00:10:00Z'));assert.deepEqual(n.items.map(i=>i.sourceId),['moepedia']);
});
test('Microsoft hint: the reader learns which engine answered (also from cache); the overlay says it once',async()=>{
 const daily=require('../services/daily.cjs'),root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'dl-'));
 const broken={reviews:()=>({translate:async list=>list.map(()=>'')})},free=async t=>'译:'+t;
 const r=await daily.translate(root,broken,['甲。'],'zh',{translateFree:free,withEngine:true});assert.deepEqual(r,{texts:['译:甲。'],engine:'microsoft'});
 assert.match((await daily.translate(root,broken,['甲。'],'zh',{translateFree:free,withEngine:true})).engine,/microsoft/,'cached Microsoft lines still show the hint');
 const fine={reviews:()=>({translate:async list=>list.map(t=>'引擎:'+t)})};assert.equal((await daily.translate(root,fine,['乙。'],'zh',{withEngine:true})).engine,'app');
 const view=fs.readFileSync(path.join(__dirname,'..','web','daily-view.js'),'utf8');
 assert.match(view,/当前为微软机器翻译，效果一般。想要更好的译文，可以在设置 › 翻译里接入自己的 AI API/);assert.match(view,/openSettings\?\.\('translation'\)/);assert.match(view,/data-rd-mt-x/);
 assert.match(require('./flat-source.cjs')(path.join(__dirname,'..','web','app.js')),/route==='daily'\)await mountDaily\(main,.*?openSettings:section=>\{settingsSection=section/);
 const inject=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','inject.js'),'utf8');assert.match(inject,/bridge\.mtNotice = \(\) => \{\s*if \(bridge\.mtNoticed\) return;/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8'),/r\.source==='mt'&&!chain\.isMt\(options\.provider\)&&!this\.mtNoticed\)\{this\.mtNoticed=true;this\.emit\('reader-event',\{type:'call',method:'mtNotice'/,'said once when machine translation stood in for the chosen engine (services/translation-chain.cjs)');
 const page=await import(pathToFileURL(path.join(__dirname,'..','web','daily-view.js')).href);
 const esc=s=>String(s);const html=page.pageHTML({state:'ok',news:{items:[{title:'G',link:'https://a/1',source:'A',cat:'gal'},{title:'C',link:'https://a/2',source:'B',cat:'acg'}]},words:{words:[]}},{locale:'zh',esc,cat:'acg'});
 assert.match(html,/data-dl-cat="acg" aria-selected="true"/);assert.match(html,/<h2>C<\/h2>/);assert.doesNotMatch(html,/<h2>G<\/h2>/);
});

test('refresh: once a day on its own, on the first request of a new Japan day, and on demand at most every 10 minutes',async()=>{
 const d=await load('daily.js');const e={DB:d1()};let calls=0;const f=async u=>{if(u.startsWith('https://trends.google.com'))calls++;return fetcher(FEEDS)(u);};
 const real=globalThis.fetch;globalThis.fetch=f;
 try{
  const t=iso=>new Date(iso),u=q=>new URL('https://x/api/hotwords/daily'+q),io={json:v=>v,fail:c=>c};
  await d.hotWordsDailyGet(e,u(''),io,t('2026-11-11T00:00:00Z'));assert.equal(calls,1,'empty cache fetches');
  await d.hotWordsDailyGet(e,u(''),io,t('2026-11-11T10:00:00Z'));assert.equal(calls,1,'same Japan day: cached');
  await d.hotWordsDailyGet(e,u('?refresh=1'),io,t('2026-11-11T10:05:00Z'));assert.equal(calls,2,'refresh button');
  await d.hotWordsDailyGet(e,u('?refresh=1'),io,t('2026-11-11T10:08:00Z'));assert.equal(calls,2,'not twice within 10 minutes');
  await d.hotWordsDailyGet(e,u(''),io,t('2026-11-11T15:30:00Z'));assert.equal(calls,3,'a new Japan day (00:30 JST) fetches on open');
 }finally{globalThis.fetch=real;}
 const src=fs.readFileSync(path.join(__dirname,'..','web','daily-view.js'),'utf8');assert.match(src,/api\('daily_view',spin\?\{force:true\}:\{\}\)/);
});

test('relay glosses also read OpenAI-style answers; feeds keep old-but-listed stories',async()=>{
 const d=await load('daily.js');
 const AI={run:async()=>({choices:[{message:{content:'["快餐产品","学校活动"]'}}]})};
 const e={DB:d1(),AI};await d.refreshWords(e,new Date('2026-11-11T00:00:00Z'),fetcher(FEEDS));
 const r=await d.hotWordsDailyGet(e,new URL('https://x/api/hotwords/daily'),{json:v=>v,fail:c=>c},new Date('2026-11-11T00:10:00Z'));
 assert.deepEqual(r.words.slice(0,2).map(w=>w.gloss),['快餐产品','学校活动']);
 const old=MOE.replace('Mon, 09 Nov 2026','Fri, 30 Oct 2026'),n={DB:d1()};await d.refreshNews(n,new Date('2026-11-11T00:00:00Z'),fetcher({'https://moepedia.net':old}));
 assert.equal((await d.newsGet(n,{json:v=>v},new Date('2026-11-11T00:10:00Z'))).items.length,1,'a feed\'s own story is kept even when older than 10 days');
});

test('relay glosses: Qwen 3 JSON-mode answers (arrays of objects) are understood',async()=>{
 const d=await load('daily.js');
 assert.deepEqual(d.parseGlosses([{term:'上場廃止',gloss:'退市'},{term:'中村晃',释义:'棒球选手'},'鸡块',{a:'ナゲット',b:'快餐'}],4),['退市','棒球选手','鸡块','快餐']);
 const AI={run:async()=>({response:[{term:'チキンマックナゲット',gloss:'快餐产品'},{term:'文化祭',gloss:'学校活动'}]})};
 const e={DB:d1(),AI};await d.refreshWords(e,new Date('2026-11-11T00:00:00Z'),fetcher(FEEDS));
 const r=await d.hotWordsDailyGet(e,new URL('https://x/api/hotwords/daily'),{json:v=>v,fail:c=>c},new Date('2026-11-11T00:10:00Z'));
 assert.deepEqual(r.words.slice(0,2).map(w=>w.gloss),['快餐产品','学校活动']);
});

test('relay glosses: Japanese notes (with kana) are dropped, the prompt asks for Chinese only',async()=>{
 const d=await load('daily.js');
 assert.deepEqual(d.parseGlosses(['建設会社','ブナの実の収穫量','棒球选手','人名'],4),['建設会社','','棒球选手','人名']);
 assert.match(d.GLOSS_PROMPT,/必须全部使用简体中文/);
});
test('hot-word notes by type: proper nouns say who or what, names restated are rewritten once, the page tags the type',async()=>{
 const d=await load('daily.js');
 assert.deepEqual(d.parseNotes([{type:'人名',note:'人名，日本网红（YouTuber）'},{type:'词语',note:'退市'},{type:'作品',note:'动画作品'}],3),[{kind:'person',gloss:'日本网红（YouTuber）'},{kind:'word',gloss:'退市'},{kind:'work',gloss:'动画作品'}]);
 assert.equal(d.repeatsTerm('岡本和真','冈本和真','person'),true);assert.equal(d.repeatsTerm('東出昌大','日本演员','person'),false,'a short description is not a repeat');assert.equal(d.repeatsTerm('髙木悠未','日本女艺人','person'),false);
 assert.equal(d.repeatsTerm('岡本和真','日本职业棒球选手','person'),false);assert.equal(d.repeatsTerm('上場廃止','退市','word'),false);
 const asked=[];const AI={run:async(model,input)=>{const retry=input.messages[0].content.startsWith(d.GLOSS_RETRY);asked.push(retry);
  return retry?{response:[{type:'人名',note:'日本职业棒球选手'}]}:{response:[{type:'人名',note:'冈本和真'},{type:'词语',note:'学校活动'}]};}};
 const words=[{term:'岡本和真',headline:'巨人の岡本和真がメジャー挑戦'},{term:'文化祭',headline:''}];
 const e={DB:d1(),AI};
 const real=globalThis.fetch;globalThis.fetch=async u=>u.startsWith('https://trends.google.com')?{ok:true,text:async()=>'<rss>'+words.map(w=>`<item><title>${w.term}</title><ht:news_item><ht:news_item_title>${w.headline}</ht:news_item_title></ht:news_item></item>`).join('')+'</rss>'}:{ok:false,text:async()=>''};
 try{const r=await d.hotWordsDailyGet(e,new URL('https://x/api/hotwords/daily'),{json:v=>v,fail:c=>c},new Date('2026-11-11T00:10:00Z'));
  assert.deepEqual(r.words.map(w=>[w.term,w.kind,w.gloss]),[['岡本和真','person','日本职业棒球选手'],['文化祭','word','学校活动']]);assert.deepEqual(asked,[false,true]);}
 finally{globalThis.fetch=real;}
 const daily=require('../services/daily.cjs');const mt=[];
 const f=async url=>url.endsWith('/api/news')?{ok:true,json:async()=>({items:[]})}:{ok:true,json:async()=>({words:[{term:'ゴリ',kind:'person',gloss:'日本网红（YouTuber）'},{term:'中村晃',kind:'person'},{term:'ナゲット'}]})};
 const v=await daily.view('',null,{env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:f,translateFree:async t=>{mt.push(t);return t==='ナゲット'?'鸡块':t;}});
 assert.deepEqual(v.words.words.map(w=>[w.term,w.kind,w.gloss]),[['ゴリ','person','日本网红（YouTuber）'],['中村晃','person',''],['ナゲット','','鸡块']]);assert.ok(!mt.includes('中村晃'),'no machine translation for a name');
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','daily-view.js')).href);
 const esc=s=>String(s);const html=view.pageHTML({state:'ok',news:{items:[]},words:v.words},{locale:'zh',esc});
 assert.match(html,/<small class="dl-gloss"><b class="dl-kind" data-kind="person">人名<\/b>日本网红（YouTuber）<\/small>/);
 assert.match(html,/<dd>人名，日本网红（YouTuber）<em>/);assert.match(html,/<small class="dl-gloss"><b class="dl-kind" data-kind="person">人名<\/b><\/small>/);
});

test('hot-word notes read every related headline as context',async()=>{
 const d=await load('daily.js');
 const xml='<rss><item><title>豊島逸夫</title><ht:news_item><ht:news_item_title>経済評論家の豊島逸夫氏が金価格を解説</ht:news_item_title></ht:news_item><ht:news_item><ht:news_item_title>金相場、最高値更新</ht:news_item_title></ht:news_item></item></rss>';
 const w=d.parseTrends(xml);assert.deepEqual(w[0].context,['経済評論家の豊島逸夫氏が金価格を解説','金相場、最高値更新']);
 let prompt='',user='';const AI={run:async(m,input)=>{prompt=input.messages[0].content;user=input.messages[1].content;return {response:[{type:'人名',note:'日本经济评论家'}]};}};
 const e={DB:d1(),AI};const real=globalThis.fetch;globalThis.fetch=async u=>u.startsWith('https://trends.google.com')?{ok:true,text:async()=>xml}:{ok:false,text:async()=>''};
 try{const r=await d.hotWordsDailyGet(e,new URL('https://x/api/hotwords/daily'),{json:v=>v,fail:c=>c},new Date('2026-11-11T00:10:00Z'));assert.equal(r.words[0].gloss,'日本经济评论家');}finally{globalThis.fetch=real;}
 assert.match(user,/経済評論家の豊島逸夫氏が金価格を解説 ／ 金相場、最高値更新/);assert.match(prompt,/以给出的新闻标题为准/);
});

test('hot-word notes: the type follows the note, the prompt asks to use headline clues',async()=>{
 const d=await load('daily.js');
 assert.equal(d.fixKind('work','日本棒球独立联盟球队'),'org');assert.equal(d.fixKind('org','日本摩托车赛车手'),'person');assert.equal(d.fixKind('person','日本人物'),'person');assert.equal(d.fixKind('word','棒球队'),'word');
 assert.deepEqual(d.parseNotes([{type:'作品',note:'日本棒球独立联盟球队'}],1),[{kind:'org',gloss:'日本棒球独立联盟球队'}]);
 assert.match(d.GLOSS_PROMPT,/MotoGP、F1/);assert.match(d.GLOSS_PROMPT,/类型必须和说明一致/);
});

test('daily reader and hot-word furigana keep okurigana and pure kana outside <ruby>, and phrase selection drops <rt>',async()=>{
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','daily-view.js')).href);
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 // Okurigana, prefixes, medial kana, katakana compounds, and numbers
 assert.equal(view.rubyHTML('新作','しんさく',esc),'<ruby>新作<rt>しんさく</rt></ruby>');
 assert.equal(view.rubyHTML('新しい','あたらしい',esc),'<ruby>新<rt>あたら</rt></ruby>しい');
 assert.equal(view.rubyHTML('受け取る','うけとる',esc),'<ruby>受<rt>う</rt></ruby>け<ruby>取<rt>と</rt></ruby>る');
 assert.equal(view.rubyHTML('目覚め','めざめ',esc),'<ruby>目覚<rt>めざ</rt></ruby>め');
 assert.equal(view.rubyHTML('お話し','おはなし',esc),'お<ruby>話<rt>はな</rt></ruby>し');
 assert.equal(view.rubyHTML('ゴミ箱','ごみばこ',esc),'ゴミ<ruby>箱<rt>ばこ</rt></ruby>');
 assert.equal(view.rubyHTML('10分','じゅっぷん',esc),'<ruby>10分<rt>じゅっぷん</rt></ruby>');
 assert.equal(view.rubyHTML('アニメ','あにめ',esc),'アニメ','pure katakana with hiragana reading gets no ruby');
 assert.equal(view.rubyHTML('食べる','タベル',esc),'<ruby>食<rt>た</rt></ruby>べる','katakana reading normalizes to hiragana');
 // paragraphHTML keeps okurigana outside <ruby>
 const pHtml=view.paragraphHTML({text:'新しい作品を受け取る。',tokens:[
  {s:'新しい',b:'新しい',r:'あたらしい'},{s:'作品',b:'作品',r:'さくひん'},{s:'を',b:'を',r:''},{s:'受け取る',b:'受け取る',r:'うけとる'},{s:'。',b:'。',r:''},
 ]},esc);
 assert.equal(pHtml,
  '<span class="rd-t" data-b="新しい" data-r="あたらしい"><ruby>新<rt>あたら</rt></ruby>しい</span>'
  +'<span class="rd-t" data-b="作品" data-r="さくひん"><ruby>作品<rt>さくひん</rt></ruby></span>'
  +'<span class="rd-t" data-b="を" data-r="">を</span>'
  +'<span class="rd-t" data-b="受け取る" data-r="うけとる"><ruby>受<rt>う</rt></ruby>け<ruby>取<rt>と</rt></ruby>る</span>。');
 // wordsHTML strips ruby from pure katakana with hiragana dict reading and splits okurigana
 const wHtml=view.wordsHTML([{term:'アニメ',reading:'あにめ'},{term:'取り消し',reading:'とりけし'},{term:'文化祭',reading:'ぶんかさい'}],{esc,w:{lookup:'查词',wReading:'读音',wGloss:'释义',wSource:'出处',noWords:'',kinds:{},glossFrom:{}}});
 assert.doesNotMatch(wHtml,/<ruby>アニメ/);
 assert.match(wHtml,/<ruby>取<rt>と<\/rt><\/ruby>り<ruby>消<rt>け<\/rt><\/ruby>し/);
 assert.match(wHtml,/<ruby>文化祭<rt>ぶんかさい<\/rt><\/ruby>/);
 // CSS prevents selecting <rt> text during drag-to-lookup and copy-paste
 const css=fs.readFileSync(path.join(__dirname,'..','web','daily.css'),'utf8');
 assert.match(css,/\.rd-ja rt\{[^}]*user-select:none/);
 assert.match(css,/\.dl-term rt\{[^}]*user-select:none/);
 // selectionText strips <rt>/<rp> nodes from dragged ranges
 const mkFrag=nodes=>({
  nodes:[...nodes],
  querySelectorAll(sel){const tags=sel.split(',');return this.nodes.filter(n=>tags.includes(n.tag)).map(n=>({remove:()=>{const idx=this.nodes.indexOf(n);if(idx>=0)this.nodes.splice(idx,1);}}));},
  get textContent(){return this.nodes.map(n=>n.text).join('');},
 });
 const dragged={rangeCount:1,isCollapsed:false,getRangeAt:()=>({cloneContents:()=>mkFrag([
  {tag:'text',text:'新作'},{tag:'rt',text:'しんさく'},{tag:'text',text:'を'},{tag:'text',text:'発表'},{tag:'rp',text:'('},{tag:'rt',text:'はっぴょう'},{tag:'rp',text:')'},
 ])})};
 assert.equal(view.selectionText(dragged),'新作を発表');
 assert.equal(view.selectionText({rangeCount:1,isCollapsed:true}),'');
});
