// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-14 user recording of 学习 (句子 / 词典 / 学习统计): opening 词典 counted a look-up for each often-looked-up
   word, the search box jumped when the panels arrived, clearing the search kept the old results, 朗读 waited for a
   cold AivisSpeech start although its clip was cached, and the calendar caption went stale. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const web=f=>fs.readFileSync(path.join(__dirname,'..','web',f),'utf8');

/* a DOM just big enough for dict-home: createElement, after, classList, dataset, innerHTML, isConnected */
function fakeDom(){const make=()=>{const el={children:[],dataset:{},className:'',innerHTML:'',isConnected:true,classes:new Set(),
  classList:{add:c=>el.classes.add(c),contains:c=>el.classes.has(c)},querySelectorAll:()=>[],after(n){el.parent?.children.push(n);n.parent=el.parent;n.isConnected=true;}};return el;};
 return {make,document:{createElement:()=>make(),querySelector:()=>null}};}

test('opening the dictionary home never records a look-up',async()=>{
 const {make,document}=fakeDom();global.document=document;
 const target=make(),results=make();results.parent=target;target.children.push(results);
 const calls=[];const api=async(action,args)=>{calls.push({action,args});
  if(action==='unknown_words')return [{surface:'水没',lookups:52},{surface:'なす',lookups:53}];
  if(action==='dictionary')return [{spelling:args.query,reading:'すいぼつ',definition:'淹没'}];return [];};
 const mod=await import(pathToFileURL(path.join(__dirname,'..','web','dict-home.js')));
 const done=mod.mountDictHome(target,results,{api,esc:String,number:String,locale:'zh',look:()=>{}});
 const home=target.children[1];
 assert.ok(target.classes.has('dh-ready'),'final layout applied before any data arrives (no search-box jump)');
 assert.ok('loading' in home.dataset,'frame drawn at once while loading');
 assert.match(home.innerHTML,/常查的词/);
 await done;
 const dict=calls.filter(c=>c.action==='dictionary');
 assert.equal(dict.length,2);
 for(const c of dict)assert.equal(c.args.operationId,undefined,'meaning peeks must not carry an operationId (the bridge counts those)');
 assert.ok(!('loading' in home.dataset));
 assert.match(home.innerHTML,/52 次/);
 delete global.document;
});

test('the bridge only records dictionary calls that carry an operationId',()=>{
 const bridge=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 assert.match(bridge,/if\(entries\.length&&typeof request\.operationId==='string'[^\n]*recordLookup/);
});

test('one dictionary search uses one operationId, also for the local fallback',()=>{
 const app=web('app.js'),start=app.indexOf("target.querySelector('#lookup-form').addEventListener('submit'"),body=app.slice(start,start+1600);
 assert.ok(start>0);
 assert.equal((body.match(/randomUUID\(\)/g)||[]).length,1);
 assert.equal((body.match(/api\('dictionary',\{query,source:[^}]*operationId\}/g)||[]).length,3);
});

test('dictionary page: no duplicate chips row; clearing the search returns home; home rows open the exact entry',()=>{
 const app=web('app.js');
 assert.doesNotMatch(app,/g-dict-chips/);
 assert.match(app,/#lookup-input'\)\.addEventListener\('input',e=>\{if\(e\.target\.value\.trim\(\)\|\|!results\.innerHTML\)return;ticket\+\+;lastItems=\[\];openWanted='';results\.innerHTML='';\}\)/);
 assert.match(app,/openWanted=word;/);
 assert.match(app,/const exact=wanted&&used&&items\.find\([^\n]*\);if\(exact\)openDetail\(exact\);/);
});

test('a cached sentence clip plays without starting the speech engine',t=>{
 const {Speech,clipKey}=require('../core/speech.cjs'),{cleanV4}=require('../core/v4-config.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-clip-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let fetched=0;const speech=new Speech(dir,async()=>{fetched++;throw Error('engine must not be asked');});
 const word={surface:'けれど水も星も綺麗な、',reading:'',pitch:[]},options={};
 assert.equal(speech.cachedClip(word,options),null);
 fs.mkdirSync(speech.folder,{recursive:true});fs.writeFileSync(path.join(speech.folder,clipKey(word,cleanV4(options),true,null)+'.wav'),'RIFF');
 const hit=speech.cachedClip(word,options);
 assert.equal(Buffer.from(hit.data,'base64').toString(),'RIFF');assert.equal(hit.cached,true);assert.equal(fetched,0);
 const runtime=fs.readFileSync(path.join(__dirname,'..','services','runtime.cjs'),'utf8'),line=runtime.split('\n').find(l=>l.includes("case 'sentence_voice'"));
 assert.ok(line.indexOf('cachedClip')>0&&line.indexOf('cachedClip')<line.indexOf('ensureSpeech'),'cache checked before the engine starts');
});

test('朗读 shows a busy state instead of a dead grey button; arrows hide when nothing scrolls',()=>{
 const js=web('sentences-page.js'),play=js.slice(js.indexOf(' async function play(b)'),js.indexOf(' async function remove(b)'));
 assert.doesNotMatch(play,/disabled/);assert.match(play,/aria-busy/);
 assert.match(web('sentences-page.css'),/\[data-sentence-play\]\.is-busy\{/);
 assert.match(js,/\[data-sp-step\]'\)\.forEach\(b=>\{b\.hidden=minX>-2;\}\)/);
});

test('statistics calendar caption returns to the hint when the pointer leaves',()=>{
 assert.match(web('statistics-grimoire.js'),/\.stg-cal'\)\?\.addEventListener\('mouseleave',\(\)=>\{cap\.textContent=w\.hover;\}\)/);
});

/* ---- 读过的词: two lists side by side; JLPT level → word window ---- */
test('jlptWords lists one level with read counts, games, saved and known state, all games or one game',async t=>{
 const I=require('../services/learning-insights.cjs'),{openStore}=require('../services/store.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jlptw-'));const db=openStore(root);t.after(()=>{try{db.close();}catch{}fs.rmSync(root,{recursive:true,force:true});});
 db.prepare("INSERT INTO games(id,title) VALUES('g1','Game One'),('g2','Game Two')").run();
 const add=db.prepare('INSERT INTO reading_events(session_id,game_id,text,read_at,original) VALUES(1,?,?,?,?)'),at=Math.floor(Date.now()/1000);
 add.run('g1','雪を払う。',at-60,'{}');add.run('g1','雪が降る。',at-30,'{}');add.run('g2','雪だ。',at-10,'{}');
 const tok=(s,pos,start)=>({surface:s,base_form:s,normalized:s,pos,grammar:[pos],start,end:start+[...s].length,reading:''});
 const dict={'雪を払う。':[tok('雪','名詞',0),tok('払う','動詞',2)],'雪が降る。':[tok('雪','名詞',0),tok('降る','動詞',2)],'雪だ。':[tok('雪','名詞',0)]};
 await I.refresh(db,async text=>dict[text]||[]);
 const jlpt=I.jlptIndex({levels:{N5:['雪|ゆき','降る|ふる','山|やま','あの|あの'],N4:['払う|はらう']}});
 const all=I.jlptWords(db,{level:'N5',jlpt});
 assert.deepEqual(all.totals,{all:4,met:2,saved:0,unmet:2});
 const snow=all.words.find(w=>w.base==='雪');assert.equal(snow.count,3);assert.deepEqual(snow.games.map(g=>[g.title,g.count]),[['Game One',2],['Game Two',1]]);
 assert.equal(all.words.find(w=>w.base==='山').count,0);
 const one=I.jlptWords(db,{level:'N5',gameId:'g2',jlpt});assert.equal(one.gameTitle,'Game Two');assert.equal(one.totals.met,1);assert.equal(one.words.find(w=>w.base==='雪').count,1);
 assert.equal(I.jlptWords(db,{level:'N4',jlpt}).words[0].count,1);
 I.saveWord(db,{id:7,spellings:['降る'],readings:['ふる'],definitions:['下']},null,{status:3});I.saveWord(db,{id:8,spellings:['山'],readings:['やま'],definitions:['山']},null);
 const after=I.jlptWords(db,{level:'N5',jlpt}),fall=after.words.find(w=>w.base==='降る'),mountain=after.words.find(w=>w.base==='山');
 assert.deepEqual([fall.saved,fall.known,fall.vocabId],[true,true,7]);assert.deepEqual([mountain.saved,mountain.known,mountain.vocabId],[true,false,8]);
 assert.equal(after.totals.saved,2);
 assert.throws(()=>I.jlptWords(db,{level:'N9',jlpt}),/INVALID_JLPT_LEVEL/);
 const described=await I.jlptDescribe(db,[{key:'山',base:'山'}],async base=>({id:8,spellings:[base],readings:['やま'],definitions:['山；山峰']}));
 assert.deepEqual(described,[{key:'山',reading:'やま',meaning:'山；山峰'}]);
 assert.equal(I.jlptWords(db,{level:'N5',jlpt}).words.find(w=>w.base==='山').meaning,'山；山峰','meanings are cached for the next open');
});

test('word window: filters, search, sort, totals and the virtualised slice',async()=>{
 const m=await import(pathToFileURL(path.join(__dirname,'..','web','jlpt-words.js')));
 const words=[{key:'a',base:'雪',forms:['雪'],reading:'ゆき',meaning:'snow',count:3,saved:false},{key:'b',base:'山',forms:['山'],reading:'やま',meaning:'mountain',count:0,saved:true},{key:'c',base:'あの',forms:['あの'],reading:'あの',meaning:'that',count:1,saved:true,known:true}];
 assert.deepEqual(m.filterJlptWords(words).map(w=>w.key),['a','c','b']);
 assert.deepEqual(m.filterJlptWords(words,{filter:'met'}).map(w=>w.key),['a','c']);
 assert.deepEqual(m.filterJlptWords(words,{filter:'saved'}).map(w=>w.key),['c','b']);
 assert.deepEqual(m.filterJlptWords(words,{filter:'unmet'}).map(w=>w.key),['b']);
 assert.deepEqual(m.filterJlptWords(words,{query:'ヤマ'}).map(w=>w.key),['b'],'katakana search finds the hiragana reading');
 assert.deepEqual(m.filterJlptWords(words,{query:'snow'}).map(w=>w.key),['a']);
 assert.deepEqual(m.filterJlptWords(words,{sort:'kana'}).map(w=>w.base),['あの','山','雪']);
 assert.deepEqual(m.jlptTotals(words),{all:3,met:2,saved:2,unmet:1});
 assert.deepEqual(m.visibleRange(0,600,2696),{first:0,last:Math.ceil(600/m.JW_ROW)+6});
 const r=m.visibleRange(100000,600,2696);assert.ok(r.last-r.first<30,'only a screenful of N1 rows is drawn');assert.ok(r.last<=2696);
 for(const l of ['zh','ja','en'])for(const k of Object.keys(m.jlptWordMessages.zh))assert.ok(k in m.jlptWordMessages[l],`${l}.${k}`);
});

test('读过的词: two lists in one row, no rank numbers or No.01, levels and game segments open the word window',async()=>{
 const m=await import(pathToFileURL(path.join(__dirname,'..','web','reading-insights.js')));
 const word=(key,count)=>({key,base:key,count,reading:'',meaning:'意味',jlpt:'N5',games:[{id:'g1',title:'Game One'}],lastAt:0});
 const data={lines:3,pending:0,weekly:[word('雪',3),word('山',2)],frequent:[word('雪',3),word('山',2)],games:[{id:'g1',title:'Game One',lines:3,levels:[{level:'N5',count:2,share:1},{level:'beyond',count:1,share:0}]}],
  jlpt:['N5','N4','N3','N2','N1'].map(level=>({level,total:10,met:1,saved:0,metShare:.1,savedShare:0}))};
 const html=m.readingInsightsHTML(data,{locale:'zh',esc:s=>String(s),number:String});
 const pair=html.slice(html.indexOf('<div class="ri-pair">'));assert.ok(pair.indexOf('这周读到的生词')>0&&pair.indexOf('常见未收录词')>pair.indexOf('这周读到的生词'));
 assert.doesNotMatch(html,/ri-rank|No\.0|>0[1-9]</);
 assert.match(html,/ri-same/,'identical lists explain why');
 assert.equal((html.match(/<button type="button" class="ri-level"[^>]*data-jlpt-level=/g)||[]).length,5);
 assert.match(html,/class="ri-seg ri-n5"[^>]*data-jlpt-level="N5" data-jlpt-game="g1"/);
 assert.doesNotMatch(html,/ri-beyond"[^>]*data-jlpt-level/);
 const scoped=m.readingInsightsHTML({...data,frequent:[word('雪',2)]},{locale:'zh',esc:s=>String(s),number:String,gameId:'g1'});assert.doesNotMatch(scoped,/ri-same/);
 for(const l of ['ja','en'])assert.ok(m.insightMessages[l].openLevel&&m.insightMessages[l].same);
 const css=fs.readFileSync(path.join(__dirname,'..','web','word-lab.css'),'utf8');assert.match(css,/\.ri-pair\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);assert.match(css,/max-width:1100px[^}]*\.ri-pair\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','index.html'),'utf8'),/href="word-lab\.css"/);
});

test('bridge exposes the level word list and meanings',()=>{
 const b=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');assert.match(b,/case 'jlpt_words':/);assert.match(b,/case 'jlpt_describe':/);
});
