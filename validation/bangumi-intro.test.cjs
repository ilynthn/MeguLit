// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 Bangumi as a source of work and developer introductions (core/bangumi.cjs, services/info-source.cjs,
   core/synopsis-policy.cjs, core/library.cjs Synopses, services/seed-producer.cjs). The answers are recorded from api.bgm.tv
   (validation/fixtures/bangumi, summaries cut short); no network. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const B=require('../core/bangumi.cjs'),src=require('../services/info-source.cjs'),policy=require('../core/synopsis-policy.cjs');
const {Synopses}=require('../core/library.cjs'),P=require('../services/seed-producer.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'bangumi-'));
const fixture=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','bangumi',name+'.json'),'utf8'));
/* the searches we recorded, by keyword */
const SEARCH={'喫茶ステラと死神の蝶':'search-stella','Summer Pockets':'search-sp','サクラノ詩 —櫻の森の上を舞う—':'search-sakura','サクラノ':'search-sakurano','千恋＊万花':'search-senren'};
const json=(body,status=200)=>({ok:status<400,status,json:async()=>body});
/* api.bgm.tv as recorded: a keyword we have no recording for answers as Bangumi does when nothing matches */
function bangumi({fail=false,seen=[]}={}){return async(url,init={})=>{
 seen.push({url,init});if(fail)throw Object.assign(Error('fetch failed'),{cause:{code:'ECONNRESET'}});
 const u=new URL(url);
 if(u.pathname.startsWith('/search/subject/')){const k=decodeURIComponent(u.pathname.slice('/search/subject/'.length));return SEARCH[k]?json(fixture(SEARCH[k])):json({request:u.pathname,code:404,error:'Not Found'});}
 if(u.pathname==='/v0/subjects/200763')return json(fixture('subject-200763'));
 if(u.pathname.startsWith('/v0/subjects/'))return json({title:'Not Found'},404);
 if(u.pathname==='/v0/search/persons')return JSON.parse(init.body).keyword==='ゆずソフト'?json(fixture('persons-yuzusoft')):json({data:[],total:0});
 return json({},404);};}
const fast={gap:0};
test.beforeEach(()=>B._reset());

test('a work is matched by its exact name: Chinese name, introduction, cover, score; the request names MeguLit and its home page',async()=>{
 const seen=[];const w=await B.work(['喫茶ステラと死神の蝶','Cafe Stella'],{fetcher:bangumi({seen}),...fast});
 assert.equal(w.id,'289599');assert.equal(w.nameCn,'星光咖啡馆与死神之蝶');assert.equal(w.url,'https://bgm.tv/subject/289599');
 assert.match(w.text,/^主人公、高嶺昂晴は/);assert.equal(w.lang,'ja','the Japanese official story text is marked as Japanese');
 assert.match(w.cover,/^https:\/\/lain\.bgm\.tv\/pic\/cover\//);assert.ok(w.score>0&&w.votes>0);
 assert.match(seen[0].url,/^https:\/\/api\.bgm\.tv\/search\/subject\/.+\?type=4&/);
 assert.match(seen[0].init.headers['User-Agent'],/MeguLit.*\(https:\/\/github\.com\/ilynthn\/MeguLit\)/);
 assert.equal(seen.length,2,'one search, one try for the developer field (404 for an R18 work without a token)');assert.equal(w.developer,'');
});

test('the developer comes from the entry when Bangumi shows it',async()=>{
 const w=await B.work(['Summer Pockets'],{fetcher:bangumi(),...fast});
 assert.equal(w.id,'200763');assert.equal(w.nameCn,'夏日口袋');assert.equal(w.developer,'VISUAL ARTS / Key');
});

test('a name that only resembles an entry is no match: nothing is better than another work\'s text',async()=>{
 // サクラノ returns サクラノ詩, サクラノ刻, サクラノモリ†ドリーマーズ ... none of them is "サクラノ響"
 assert.equal(await B.work(['サクラノ響','サクラノ'],{fetcher:bangumi(),...fast}),null);
 // "サクラノ詩" alone is not "サクラノ詩 —櫻の森の上を舞う—" nor "サクラノ詩 10th Anniversary edition"
 assert.equal(B.pick(fixture('search-sakurano').list,['サクラノ詩']),null);
 // VNDB's original name, written with other dashes and spaces, is the same name
 assert.equal(String(B.pick(fixture('search-sakurano').list,['サクラノ詩 －櫻の森の上を舞う－']).id),'22423');
 // two different entries under the same name: no match
 const list=fixture('search-stella').list;assert.equal(B.pick([...list,{...list[0],id:999}],['喫茶ステラと死神の蝶']),null);
 // the known names are tried in order: VNDB's original name decides before a library name
 assert.equal(String(B.pick(fixture('search-sakurano').list,['サクラノ刻 -櫻の森の下を歩む-','サクラノ詩 —櫻の森の上を舞う—']).id),'220921');
});

test('the requests wait for each other, a gap apart',async()=>{
 const at=[];const f=async u=>{at.push(Date.now());return bangumi()(u);};
 await Promise.all([B.work(['千恋＊万花'],{fetcher:f,gap:120}),B.work(['Summer Pockets'],{fetcher:f,gap:120})]);
 assert.ok(at.length>=3);for(let i=1;i<at.length;i++)assert.ok(at[i]-at[i-1]>=110,`request ${i} came ${at[i]-at[i-1]} ms after the one before`);
});

test('the setting: Bangumi first, Bangumi only, and auto asks Bangumi first in the Chinese UI',()=>{
 assert.deepEqual(src.order('auto','zh'),['bangumi-zh','moegirl','vndb']);assert.deepEqual(src.order('auto','ja'),['vndb']);assert.deepEqual(src.order('auto','en'),['vndb']);
 assert.deepEqual(src.order('bangumi','en'),['bangumi','vndb']);assert.deepEqual(src.order('bangumi-only','zh'),['bangumi']);
 assert.deepEqual(src.order('moegirl','en'),['moegirl','vndb']);assert.deepEqual(src.order('vndb','zh'),['vndb']);
 const field=require('../services/settings-schema.cjs').fields.find(f=>f.key==='infoSource');
 assert.deepEqual(field.options.map(o=>o.value),['auto','moegirl','bangumi','bangumi-only','vndb']);for(const o of field.options)for(const l of ['zh','en','ja'])assert.ok(o.label[l],o.value+' '+l);
 assert.deepEqual(field.options.map(o=>o.label.zh).slice(2),['Bangumi 优先（任何界面语言），没有再用 VNDB','只用 Bangumi','只用 VNDB']);
 const {Settings}=require('../services/settings.cjs');const r=tmp(),s=new Settings(r);
 for(const v of ['bangumi','bangumi-only']){s.save({scope:'library',values:{...s.read('library'),infoSource:v}});assert.equal(new Settings(r).read('library').infoSource,v);assert.equal(src.get(r),v);}
});

/* a game's synopsis: VNDB (machine translated to Chinese), Moegirlpedia and Bangumi as the sources answer */
const VN={text:'A young man dies and wakes up on the morning of the same day.',alttitle:'喫茶ステラと死神の蝶',names:['Cafe Stella and the Reaper\'s Butterflies']};
const MG={text:'《喫茶Stella与死神之蝶》是由柚子社制作的恋爱冒险游戏。主人公高岭昂晴在一次事故中身亡，却在死亡当天的早晨醒来。',title:'喫茶Stella与死神之蝶'};
const synopses=({moegirl=async()=>MG,fetcher=bangumi()}={})=>new Synopses({config:tmp()},{lookup:async()=>VN,moegirl,translate:async(t,l)=>l==='zh'?'一个年轻人死去，又在同一天早上醒来。':'',bangumi:titles=>B.work(titles,{fetcher,...fast})});
test('the synopsis follows the order: Bangumi in Chinese first in auto, a Japanese Bangumi text gives way to Moegirlpedia',async()=>{
 // 千恋＊万花: Bangumi's introduction is Chinese
 const s=new Synopses({config:tmp()},{lookup:async()=>({text:'x',alttitle:'千恋＊万花',names:[]}),moegirl:async()=>MG,translate:async()=>'机翻',bangumi:titles=>B.work(titles,{fetcher:bangumi(),...fast})});
 let r=await s.get({mediaId:'senren',titles:['Senren Banka'],vndbId:'v19073',lang:'zh',sources:src.order('auto','zh')});
 assert.match(r.text,/^在一座连公交都不通的深山里/);assert.equal(r.source,'Bangumi · 千恋＊万花 · '+fixture('search-senren').list[0].rating.score.toFixed(1));
 // 喫茶ステラと死神の蝶: Bangumi has the Japanese story text, so auto shows Moegirlpedia; "Bangumi first" shows Bangumi's
 const st=synopses();
 r=await st.get({mediaId:'stella',titles:['CafeStella-copy'],vndbId:'v26414',lang:'zh',sources:src.order('auto','zh')});assert.equal(r.text,MG.text);assert.match(r.source,/^萌娘百科/);
 r=await st.get({mediaId:'stella',titles:['CafeStella-copy'],vndbId:'v26414',lang:'en',sources:src.order('bangumi','en')});assert.match(r.text,/^主人公、高嶺昂晴は/);assert.equal(r.lang,'ja');
 r=await st.get({mediaId:'stella',titles:['CafeStella-copy'],vndbId:'v26414',lang:'zh',sources:src.order('vndb','zh')});assert.equal(r.text,'一个年轻人死去，又在同一天早上醒来。');
 // the game page gets every source for its dropdown, and starts on the one shown
 const entry=JSON.parse(fs.readFileSync(st.file,'utf8')).stella;const v=policy.views(entry,'zh',src.order('bangumi','zh'));
 assert.equal(v.synopsisChoices.preferred,'bangumi');assert.equal(v.synopsisChoices.bangumi.title,'星光咖啡馆与死神之蝶');assert.equal(v.synopsisChoices.moegirl.text,MG.text);
 assert.equal(entry.bangumi.cover.startsWith('https://lain.bgm.tv/'),true);assert.equal(entry.bangumi.id,'289599');
});

test('no Bangumi entry for the work: the next source; Bangumi only shows nothing rather than another source',async()=>{
 const s=new Synopses({config:tmp()},{lookup:async()=>({text:'Unrelated.',alttitle:'サクラノ響',names:[]}),moegirl:async()=>null,translate:async()=>'机翻',bangumi:titles=>B.work(titles,{fetcher:bangumi(),...fast})});
 let r=await s.get({mediaId:'x',titles:['サクラノ'],vndbId:'v1',lang:'zh',sources:src.order('bangumi','zh')});assert.equal(r.text,'机翻');assert.match(r.source,/^VNDB/);
 r=await s.get({mediaId:'x',titles:['サクラノ'],vndbId:'v1',lang:'zh',sources:src.order('bangumi-only','zh')});assert.equal(r.text,'');assert.equal(r.source,'');
});

test('Bangumi unreachable: the next source at once, and a Bangumi text found before is kept',async()=>{
 let fail=false;const f=bangumi(),flaky=async(u,i)=>{if(fail)throw Error('fetch failed');return f(u,i);};
 const st=synopses({fetcher:flaky,moegirl:async()=>null});
 let r=await st.get({mediaId:'stella',titles:['CafeStella-copy'],vndbId:'v26414',lang:'zh',sources:src.order('bangumi','zh')});assert.match(r.text,/^主人公、高嶺昂晴は/);
 fail=true;
 r=await st.get({mediaId:'stella',titles:['CafeStella-copy'],vndbId:'v26414',lang:'zh',refresh:true,sources:src.order('bangumi','zh')});assert.match(r.text,/^主人公、高嶺昂晴は/,'the earlier answer stays');
 const fresh=synopses({fetcher:bangumi({fail:true}),moegirl:async()=>null});
 r=await fresh.get({mediaId:'new',titles:['CafeStella-copy'],vndbId:'v26414',lang:'zh',sources:src.order('bangumi','zh')});assert.equal(r.text,'一个年轻人死去，又在同一天早上醒来。','the VNDB text');
});

/* the developer panel */
const YUZU={results:[{name:'Yuzusoft',original:'ゆずソフト',aliases:[],description:'Yuzusoft is a Japanese visual novel developer. It was founded in 2006. More text follows here.',extlinks:[]}]};
const producerFetch=({fail=false}={})=>{const b=bangumi({fail});return async(u,i)=>u.startsWith('https://api.vndb.org/')?json(YUZU):u.includes('moegirl')?json({query:{pages:{'-1':{ns:0,title:'x',missing:''}}}}):b(u,i);};
test('a developer: Bangumi\'s introduction of the company with the same name, its page linked; VNDB when Bangumi is not asked or not reachable',async()=>{
 const root=tmp();
 let info=await P.producer(root,'p98',{fetch:producerFetch(),order:src.order('bangumi','zh')});
 assert.equal(info.source,'bangumi');assert.match(info.intro,/^ゆずソフト（Yuzu-Soft）は/);assert.ok(info.links.some(l=>l.kind==='bangumi'&&l.url==='https://bgm.tv/person/7175'));
 const opened=[];assert.deepEqual(P.open(root,'p98','bangumi',{spawnFn:(e,a)=>{opened.push(a[0]);return {};}}),{opened:true});assert.deepEqual(opened,['https://bgm.tv/person/7175']);
 info=await P.producer(root,'p98',{fetch:producerFetch(),order:src.order('vndb','zh')});assert.equal(info.source,'VNDB');assert.match(info.intro,/^Yuzusoft is/);
 // auto in the Chinese UI: Bangumi's introduction is Japanese, Moegirlpedia has no page, so VNDB
 info=await P.producer(root,'p98',{fetch:producerFetch(),order:src.order('auto','zh')});assert.equal(info.source,'VNDB');
 const off=tmp();info=await P.producer(off,'p98',{fetch:producerFetch({fail:true}),order:src.order('bangumi','zh')});assert.equal(info.source,'VNDB');assert.ok(!info.links.some(l=>l.kind==='bangumi'));
 const only=tmp();info=await P.producer(only,'p98',{fetch:producerFetch({fail:true}),order:src.order('bangumi-only','zh')});assert.equal(info.intro,'');assert.ok(info.links.length>0,'the links stay');
});
