// SPDX-License-Identifier: GPL-3.0-or-later
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
/* 轻小说 tab of the 日报: ラノベニュースオンライン (ln-news.com). Fixtures are a recorded /feed (Atom) and one article page. */
const FX=path.join(__dirname,'fixtures','ln-news');
const FEED=fs.readFileSync(path.join(FX,'feed.xml'),'utf8'),PAGE=fs.readFileSync(path.join(FX,'article-127314.html'),'utf8');
const LINK='https://ln-news.com/articles/127314';
const loadRelay=()=>import(pathToFileURL(path.join(__dirname,'..','relay','src','daily.js')).href);

test('ln-news feed: Atom entries become 轻小说 stories with the article link, picture and source name',async()=>{
 const d=await loadRelay(),feed=d.NEWS_FEEDS.find(f=>f.id==='lnnews');
 assert.ok(feed&&feed.url==='https://ln-news.com/feed'&&feed.cat==='ln'&&feed.name==='ln-news.com');
 assert.ok(d.CATEGORIES.includes('ln'));
 const list=d.parseNews(FEED,feed);
 assert.equal(list.length,30);
 const first=list[0];
 assert.equal(first.title,'アニメ『弱気MAX令嬢なのに、辣腕婚約者様の賭けに乗ってしまった』第9話「辣腕婚約者様との新たな賭け」のあらすじ＆先行カット解禁');
 assert.equal(first.link,'https://ln-news.com/articles/127316','the story link, not the picture enclosure');
 assert.equal(first.image,'https://assets.ln-news.com/images/medias/5d926148bc77471a97ffaf870ff7e77f.jpg');
 assert.equal(first.date,'2026-11-28T10:00:00.000Z');
 assert.deepEqual([first.source,first.sourceId,first.cat],['ln-news.com','lnnews','ln']);
 assert.ok(list.every(n=>/^https:\/\/ln-news\.com\/articles\/\d+$/.test(n.link)&&n.title));
 /* an Atom feed whose links have no rel (and the existing natalie shape) still resolves to its single link */
 const plain='<feed><entry><title>t</title><link href="https://x.example/a"/><updated>2026-11-11T00:00:00+09:00</updated></entry></feed>';
 assert.equal(d.parseNews(plain,feed)[0].link,'https://x.example/a');
});

test('ln-news article: body paragraphs only, without menus, ads, iframes, share links or tags',()=>{
 const x=require('../services/news-article.cjs').extract(PAGE,LINK);
 assert.equal(x.title,'アニメ『姫騎士様のヒモ』は2027年1月3日（日）より放送開始');
 assert.match(x.paragraphs[0],/^電撃文庫発のアニメ『姫騎士様のヒモ』の放送情報が解禁された。/);
 for(const want of ['2027年1月3日（日）：　TOKYO MX　24：30～','マシュー：　諏訪部順一','電撃文庫公式サイト'])assert.ok(x.paragraphs.includes(want),want);
 const all=x.paragraphs.join('\n');
 assert.doesNotMatch(all,/アフィリエイト|x\.com\/share|youtube|<|&nbsp;/i);
 assert.ok(x.paragraphs.every(p=>p.trim()===p&&p.length>=2));
});

function app(fetch){return {env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch,doh:async()=>({ok:false})};}
const relayFetch=(article)=>async url=>{
 if(url.endsWith('/api/news'))return {ok:true,json:async()=>({items:[{title:'姫騎士様のヒモ',link:LINK,source:'ln-news.com',sourceId:'lnnews',cat:'ln',date:'2026-11-28T10:00:00.000Z'},{title:'ギャルゲ',link:'https://www.4gamer.net/x',source:'4Gamer.net',sourceId:'4gamer'}]})};
 if(url.includes('/api/hotwords'))return {ok:true,json:async()=>({words:[]})};
 if(url===LINK)return article();
 return {ok:false,status:404};
};

test('bridge keeps the ln category and reads the article on this PC (never the relay)',async()=>{
 const daily=require('../services/daily.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'dl-ln-'));
 try{
  const calls=[],f=relayFetch(()=>({ok:true,url:LINK,text:async()=>PAGE})),spy=async u=>{calls.push(u);return f(u);};
  const v=await daily.view(root,null,app(spy));
  assert.deepEqual(v.news.items.map(n=>[n.source,n.cat]),[['ln-news.com','ln'],['4Gamer.net','gal']]);
  const a=await daily.article(root,LINK,app(spy));
  assert.equal(a.state,'ok');assert.equal(a.via,'direct');assert.match(a.paragraphs[0].text,/姫騎士様のヒモ/);
  assert.ok(!calls.some(u=>u.includes('/api/news/article')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('ln-news network failure: a dead relay shows the error card, a dead site gives the error state with the link, a cached article still opens',async()=>{
 const daily=require('../services/daily.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'dl-ln-'));
 try{
  assert.equal((await daily.view(root,null,app(async()=>{throw Error('offline');}))).state,'error');
  let online=false;
  const f=relayFetch(()=>{if(!online)throw Error('ECONNRESET');return {ok:true,url:LINK,text:async()=>PAGE};});
  await daily.view(root,null,app(f));
  assert.deepEqual(await daily.article(root,LINK,app(f)),{state:'error',link:LINK});
  online=true;
  assert.equal((await daily.article(root,LINK,app(f))).state,'ok');
  online=false;
  const again=await daily.article(root,LINK,app(f));
  assert.equal(again.state,'ok','second open comes from data/cache while offline');assert.ok(again.paragraphs.length>5);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('daily page: 轻小说 tab in all three languages, source name beside every story',async()=>{
 const v=await import(pathToFileURL(path.join(__dirname,'..','web','daily-view.js')).href);
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const data={state:'ok',news:{items:[{title:'姫騎士様のヒモ',link:LINK,source:'ln-news.com',cat:'ln',summary:'',image:'',date:''},{title:'ギャルゲ',link:'https://x/y',source:'4Gamer.net',cat:'gal',summary:'',image:'',date:''}]},words:{words:[]}};
 for(const [locale,label] of [['zh','轻小说'],['ja','ライトノベル'],['en','Light novels']]){
  const html=v.pageHTML(data,{locale,esc,cat:'ln'});
  assert.match(html,new RegExp('data-dl-cat="ln"[^>]*>'+label+'<'));
  assert.match(html,/<b>ln-news\.com<\/b>/);assert.doesNotMatch(html,/4Gamer/);
 }
 assert.ok(v.pageHTML(data,{locale:'zh',esc,cat:'ln'}).indexOf('data-dl-cat="acg"')<v.pageHTML(data,{locale:'zh',esc,cat:'ln'}).indexOf('data-dl-cat="ln"'));
});
