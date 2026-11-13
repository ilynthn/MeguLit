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
