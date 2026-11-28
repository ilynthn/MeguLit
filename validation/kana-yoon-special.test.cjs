// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 owner (然后这边的那些拗音啥的呢？？): 学习 → 五十音 only had 平假名 / 片假名 / 浊音 boards. Now the board is
   清音 / 浊音・半浊音 / 拗音 / 特殊音 with a 平/片 switch above it; 拗音, 促音・长音 and the katakana loanword sounds have
   lessons, familiarity and strokes (two boxes for a two-character sound). The 25 old lessons keep their ids and order, so
   progress saved before this change still points at the same lesson. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));
const OLD_IDS=[...Array(10).keys()].map(i=>'h'+i).concat([...Array(10).keys()].map(i=>'k'+i),[...Array(5).keys()].map(i=>'d'+i));

test('kana data: old lessons keep their ids and order, new kinds are appended with romaji, words and hints',async()=>{
 const D=await import(pathToFileURL(path.join(__dirname,'..','web','kana','data.js')).href);
 assert.deepEqual(D.LESSONS.slice(0,25).map(l=>l.id),OLD_IDS,'the first 25 lessons must stay exactly as saved progress knows them');
 const added=D.LESSONS.slice(25);
 for(const [cat,script] of [['daku','k'],['yoon','h'],['yoon','k'],['special','h'],['special','k']])
  assert.ok(added.some(l=>l.cat===cat&&l.script===script),`a ${cat} lesson in ${script==='k'?'katakana':'hiragana'} is added`);
 assert.equal(new Set(D.LESSONS.map(l=>l.id)).size,D.LESSONS.length,'lesson ids are unique');
 const yoon=new Set(added.filter(l=>l.cat==='yoon').flatMap(l=>l.kana));
 for(const k of D.YOON_LIST)assert.ok(yoon.has(k)&&yoon.has(D.toKata(k)),`拗音 ${k} is taught in both scripts`);
 for(const k of ['ぎゃ','じゃ','びゃ','ぴゃ'])assert.ok(yoon.has(k),`voiced 拗音 ${k} is taught`);
 for(const k of [...yoon,...D.GAIRAI_LIST]){assert.ok(D.romaOf(k),`${k} has romaji`);assert.ok(D.hintOf(k),`${k} has a hint`);}
 for(const k of ['ファ','ティ','ディ','ウィ','ヴァ','シェ','チェ','ジェ'])assert.ok(added.some(l=>l.kana.includes(k)),`loanword sound ${k} has a lesson`);
 for(const k of ['っ','ッ','ー'])assert.ok(D.hintOf(k)&&D.wordOf(k),`${k} has an explanation and an example word`);
 assert.deepEqual(['きって','ちょっと','いっしょ','ビール','コーヒー','すごーい'].map(D.toRomaji),['kitte','chotto','issho','biiru','koohii','sugooi']);
 assert.equal(D.boardOf('yoon','k').length,33);
 assert.ok(D.boardOf('special','k').includes('ヴ')&&!D.boardOf('special','h').includes('ヴ'),'loanword sounds sit on the katakana 特殊音 board only');
});

test('kana index board switches 平/片 and 清音/浊音/拗音/特殊音, and old progress continues at the same lesson',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-kana-yoon-'));
 let server,browser;
 t.after(async()=>{await browser?.stop();server?.close();await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});});
 server=await startWeb();browser=await startEdge(path.join(root,'edge'));
 await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/index.html'});
 const out=await browser.evaluate(`(async()=>{
  const D=await import('/kana/data.js');
  const mk=(done)=>{const state={m:{},b:{},r:[],a:[],l:Object.fromEntries(done.map(id=>[id,Date.now()])),p:{}};
   return {KEY:{m:'m',b:'b',r:'r',a:'a',l:'l',p:'p'},DAY:864e5,get:(k,f)=>state[k]===undefined?f:JSON.parse(JSON.stringify(state[k])),put:(k,v)=>{state[k]=JSON.parse(JSON.stringify(v));},lessonDone(id){state.l[id]=1;},state};};
  const said=[];
  const ctxOf=(store,params={})=>({base:'/kana/',params,data:D,store,speech:{say(t){said.push(t);},prefetch(){},stop(){},cancelPrefetch(){}},go(){},onKey(){},onLeave(){},
   voicePicker:()=>document.createElement('div'),volumeHTML:()=>'',gameWords:()=>Promise.resolve({})});
  const mount=async(name,store,params)=>{const {view}=await import('/kana/views/'+name+'.js');const el=document.createElement('div');document.body.append(el);view(el,ctxOf(store,params));return el;};
  /* 21 of the old 25 lessons done: the stage continues at lesson 22, the one it pointed at before */
  const old=D.LESSONS.slice(0,21).map(l=>l.id);
  const el=await mount('index',mk(old));
  const stage=el.querySelector('.mg-pick .mg-num').textContent,title=el.querySelector('.mg-title').textContent;
  const cats=[...el.querySelectorAll('[data-set]')].map(b=>b.textContent),scripts=[...el.querySelectorAll('[data-script]')].map(b=>b.textContent);
  const cells=()=>[...el.querySelectorAll('[data-board] [data-mk]')].map(b=>b.dataset.mk);
  el.querySelector('[data-script="h"]').click();el.querySelector('[data-set="2"]').click();const yoonH=cells(),yoonTitle=el.querySelector('.mg-title').textContent;
  el.querySelector('[data-script="k"]').click();const yoonK=cells();
  el.querySelector('[data-set="3"]').click();const specialK=cells();
  el.querySelector('[data-script="h"]').click();const specialH=cells(),note=!el.querySelector('[data-board-note]').hidden;
  el.querySelector('[data-mk="っ"]').click();const card=el.querySelector('.mk-head small')?.textContent||'';
  el.querySelector('[data-mk-lv="2"]').click();const marked=el.querySelector('[data-mk="っ"]').className;
  el.remove();
  /* a 拗音 lesson draws a stroke box per character; a 促音・长音 lesson offers the contrast word */
  const yl=await mount('lesson',mk([]),{id:'yk0'});await new Promise(r=>setTimeout(r,400));
  const yoonBoxes=yl.querySelectorAll('.grid-box .strokes').length,yoonStrokes=yl.querySelectorAll('.grid-box .strokes .st').length,yoonHead=yl.querySelector('.kana-line .ja').textContent;yl.remove();
  const sl=await mount('lesson',mk([]),{id:'s0'});const pair=sl.querySelector('.pair-box')?.textContent||'';
  for(let i=0;i<20&&!sl.querySelector('.choice');i++)sl.querySelector('#nx')?.click();
  const prompt=sl.querySelector('.prompt .big')?.textContent||'',choices=[...sl.querySelectorAll('.choice')].map(b=>b.textContent.replace(/^\\d/,''));sl.remove();
  return {stage,title,expected:D.LESSONS[21].title,cats,scripts,yoonH,yoonK,yoonTitle,specialK,specialH,note,card,marked,yoonBoxes,yoonStrokes,yoonHead,pair,prompt,choices};
 })()`);
 assert.equal(out.stage,'22/'+out.stage.split('/')[1],'old progress continues at lesson 22');
 assert.equal(out.title,out.expected);
 assert.deepEqual(out.cats,['清音','浊音 · 半浊音','拗音','特殊音']);
 assert.deepEqual(out.scripts,['平假名','片假名']);
 assert.equal(out.yoonH.length,33);assert.ok(out.yoonH.includes('きゃ')&&out.yoonH.includes('ぴょ'));
 assert.ok(out.yoonK.includes('キャ')&&out.yoonK.includes('ジョ'));
 assert.match(out.yoonTitle,/ゃ行/,'choosing 拗音 moves the stage to a 拗音 lesson');
 for(const k of ['ッ','ー','ファ','ティ','ディ','ウィ','ヴァ','シェ','チェ','ジェ'])assert.ok(out.specialK.includes(k),`特殊音 board (katakana) shows ${k}`);
 assert.deepEqual(out.specialH,['っ','ー']);assert.ok(out.note,'hiragana 特殊音 says the loanword sounds are katakana only');
 assert.match(out.card,/切手/,'っ opens a card with its example word');
 assert.match(out.marked,/\bm2\b/,'familiarity can be set on っ');
 assert.equal(out.yoonBoxes,2,'a two-character sound shows two stroke boxes');
 assert.ok(out.yoonStrokes>=3,'both characters are drawn');
 assert.equal(out.yoonHead,'キャ');
 assert.match(out.pair,/きって.*≠.*きて/,'促音 lesson shows the word against its contrast word');
 const pairOf={kitte:'kite',sakki:'saki',motto:'moto',itta:'ita',obaasan:'obasan',ojiisan:'ojisan',yuuki:'yuki',sugooi:'sugoi'};
 const wordPair={'きって':'きて','さっき':'さき','もっと':'もと','いった':'いた','おばあさん':'おばさん','おじいさん':'おじさん','ゆうき':'ゆき','すごーい':'すごい'};
 assert.ok(out.choices.length===4,'four choices');
 assert.ok(Object.entries(pairOf).some(([a,b])=>out.choices.includes(a)&&out.choices.includes(b))||Object.entries(wordPair).some(([a,b])=>out.choices.includes(a)&&out.choices.includes(b)),
  'a 促音・长音 question always offers the word and its contrast: '+JSON.stringify(out.choices));
});
