/* 2026-11-13 home "today" column: big top-story picture under the activity card (picture only, no text bottom-left), its title
   translated for the tooltip without ever showing a partial string, and an honest empty state for a year without reading */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const WEB=path.join(__dirname,'..','web');
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),map:m};};
const pic=(title,extra={})=>({title,link:'https://example.com/'+encodeURIComponent(title),image:'data:image/jpeg;base64,AAAA',...extra});

test('the big picture is the top story of the chosen tab and the small row never repeats it',async()=>{
 const {pickHeadline}=await import('../web/home-today.js');
 const items=[pic('acg 1',{cat:'acg'}),pic('flat',{cat:'gal',flat:true}),{title:'no picture',link:'x',cat:'gal'},pic('gal 1',{cat:'gal'}),pic('acg 2',{cat:'acg'}),
  {title:'remote picture',link:'y',image:'https://example.com/a.jpg'},pic('acg 3',{cat:'acg'}),pic('acg 4',{cat:'acg'})];
 const g=pickHeadline(items,'gal');assert.equal(g.top.title,'gal 1');assert.deepEqual(g.small.map(x=>x.title),['acg 1','acg 2','acg 3']);
 const a=pickHeadline(items,'acg');assert.equal(a.top.title,'acg 1');assert.ok(!a.small.includes(a.top));
 assert.equal(pickHeadline([pic('only',{cat:'acg'})],'gal').top.title,'only','falls back to any pictured story');
 assert.deepEqual(pickHeadline(null,'gal'),{top:null,small:[]});
});

test('the title is translated whole for zh/en, remembered, and never mixed with the original',async()=>{
 const {translateHeadline,cachedHeadline}=await import('../web/home-today.js');
 const src='魔女狩りが横行する時代にわけありの薬草医となり，あらゆる手段を駆使して生き延びていく。物語重視のADV「我不是女巫」（I Am Not a Witch）発表';
 const storage=memory();let calls=[];
 const api=async(action,params)=>{calls.push([action,params]);return {texts:['  在猎巫盛行的时代成为草药师，\n用尽手段生存。叙事冒险《我不是女巫》公布 '],engine:'microsoft'};};
 assert.equal(cachedHeadline(src,'zh',storage),null);
 const r=await translateHeadline(api,src,'zh',{storage});
 assert.deepEqual(calls,[['daily_translate',{texts:[src],target:'zh'}]]);
 assert.equal(r.state,'translated');assert.equal(r.lang,'zh-CN');assert.equal(r.text,'在猎巫盛行的时代成为草药师， 用尽手段生存。叙事冒险《我不是女巫》公布');
 assert.ok(!r.text.includes('物語重視'),'no Japanese fragment glued on');
 calls=[];const again=await translateHeadline(api,src,'zh',{storage});assert.equal(again.text,r.text);assert.equal(calls.length,0,'second time comes from the cache');
 assert.equal(cachedHeadline(src,'zh',storage).text,r.text);assert.equal(cachedHeadline(src,'en',storage),null,'cache is per target language');
 const en=await translateHeadline(async(_a,p)=>[`EN:${p.texts[0].length}`],src,'en',{storage:memory()});assert.equal(en.lang,'en');assert.equal(en.text,`EN:${src.length}`);
});

test('a Japanese UI, a failure, an empty answer or a slow engine all leave the whole original title',async()=>{
 const {translateHeadline}=await import('../web/home-today.js');
 const src='物語重視のADV「我不是女巫」発表';let called=false;
 const ja=await translateHeadline(async()=>{called=true;return [];},src,'ja',{storage:memory()});assert.deepEqual(ja,{text:src,lang:'ja',state:'original'});assert.equal(called,false);
 for(const api of [async()=>{throw Error('TRANSLATION_FAILED');},async()=>({texts:['']}),async()=>({texts:[]}),async()=>null,async()=>[src]]){
  const r=await translateHeadline(api,src,'zh',{storage:memory()});assert.deepEqual(r,{text:src,lang:'ja',state:'original'});}
 const slow=await translateHeadline(()=>new Promise(r=>setTimeout(()=>r(['迟到的译文']),200)),src,'zh',{storage:memory(),timeout:20});
 assert.deepEqual(slow,{text:src,lang:'ja',state:'original'});
});

test('the picture tooltip shows the translation with the original under it, or the original alone',async()=>{
 const {headlineLabel}=await import('../web/home-today.js');
 assert.equal(headlineLabel({text:'译文',state:'translated'},'原文'),'译文\n原文');
 assert.equal(headlineLabel({text:'原文',state:'original'},'原文'),'原文');
 assert.equal(headlineLabel(null,' 原文 '),'原文');
});

test('a year without any reading is an empty state, a single read day is not',async()=>{
 const {activitySummary,emptyActivityHTML,EMPTY_COPY}=await import('../web/home-today.js');
 const {activityCells}=await import('../web/learning-activity.js');
 const today=new Date(2026,10,13),none=activityCells([],today);
 const s0=activitySummary(none.slice(-140),none);assert.equal(s0.empty,true);assert.equal(s0.active,0);
 const old=activityCells([{day:'2026-01-05',seconds:600}],today);assert.equal(activitySummary(old.slice(-140),old).empty,false,'reading outside the shown weeks still counts');
 const some=activityCells([{day:'2026-11-12',seconds:1200,characters:300},{day:'2026-11-13',seconds:300}],today),s=activitySummary(some.slice(-140),some);
 assert.equal(s.empty,false);assert.equal(s.active,2);assert.equal(s.best,2);assert.equal(s.secs,1500);
 const html=emptyActivityHTML('zh',x=>String(x),today);assert.ok(html.includes(EMPTY_COPY.zh.title));assert.ok(html.includes(EMPTY_COPY.zh.body));
 assert.equal((html.match(/<i /g)||[]).length,7,'one hairline square per day of this week');assert.equal((html.match(/class="today"/g)||[]).length,1);
 for(const l of ['ja','en'])assert.ok(emptyActivityHTML(l,x=>x,today).includes(EMPTY_COPY[l].title));
});

test('home page: no background headline, no text bottom-left, picture-only top story under the card, lower hand',()=>{
 const js=fs.readFileSync(path.join(WEB,'home-tv.js'),'utf8'),css=fs.readFileSync(path.join(WEB,'home-tv.css'),'utf8');
 for(const gone of ['tv-hero','tv-hl','has-hl'])assert.ok(!js.includes(gone)&&!css.includes(gone),gone+' is gone');
 const block=js.slice(js.indexOf("className='tv-hot-news'"),js.indexOf('fitLeft(root);}',js.indexOf("className='tv-hot-news'")));
 assert.ok(block.includes('tv-hot-img')&&!block.includes('tv-hot-meta'),'the big picture carries no text');assert.ok(js.includes('card.after(big)'),'it sits under the activity card');
 assert.ok(js.includes('pickHeadline(')&&js.includes('translateHeadline('),'title goes through the translation path');
 assert.match(css,/\.tv-home:not\(\.empty\) \.tv-title\{display:none\}/);
 assert.match(css,/\.tv-hand\{bottom:-\d+(\.\d+)?vh\}/,'the hand may run off the bottom edge');
 assert.match(css,/\.tv-heat-card\.is-empty \.tv-heat/);
});

test('home modules parse as ES modules (plain node --check misses broken strings in them)',()=>{
 for(const f of ['home-tv.js','home-today.js']){const r=spawnSync(process.execPath,['--input-type=module','--check'],{input:fs.readFileSync(path.join(WEB,f)),encoding:'utf8'});
  assert.equal(r.status,0,f+': '+r.stderr);}
});
