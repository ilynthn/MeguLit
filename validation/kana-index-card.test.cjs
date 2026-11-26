// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('kana index familiarity card shows counterpart script without duplicate reading and keeps row highlight and stage progress on level change',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-index-'));
 let server,browser;
 t.after(async()=>{
  await browser?.stop();
  server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 server=await startWeb();
 browser=await startEdge(path.join(root,'edge'));
 const origin='http://127.0.0.1:'+server.address().port;
 await browser.send('Page.navigate',{url:origin+'/index.html'});

 const out=await browser.evaluate(`(async()=>{
  const [{view},D]=await Promise.all([import('/kana/views/index.js'),import('/kana/data.js')]);
  const state={m:{},b:{},r:[],a:[],l:{h0:Date.now()},p:{}};
  const store={
   KEY:{m:'m',b:'b',r:'r',a:'a',l:'l',p:'p'},DAY:864e5,
   get:(k,f)=>state[k]===undefined?f:JSON.parse(JSON.stringify(state[k])),
   put:(k,v)=>{state[k]=JSON.parse(JSON.stringify(v));}
  };
  const ctx={
   base:'/kana/',params:{},data:D,store,
   speech:{say(){},prefetch(){},stop(){}},
   go(){},onKey(){},onLeave(){},
   voicePicker:()=>document.createElement('div')
  };
  const el=document.createElement('div');
  document.body.append(el);
  view(el,ctx);

  /* 1. Hiragana kanji word still shows counterpart katakana and reading; pure-kana word omits duplicate reading */
  el.querySelector('[data-mk="あ"]').click();
  const hiraSmall=el.querySelector('.mk-head small').textContent;
  el.querySelector('[data-set="2"]').click();
  el.querySelector('[data-mk="ず"]').click();
  const pureKanaSmall=el.querySelector('.mk-head small').textContent;

  /* 2. Katakana cell shows hiragana counterpart and non-duplicated katakana example */
  el.querySelector('[data-set="1"]').click();
  const stageBefore=el.querySelector('.mg-prog .mg-num').textContent;
  const subBefore=el.querySelector('.mg-sub').textContent;
  const cellA=el.querySelector('[data-mk="ア"]');
  cellA.click();
  const kataSmall=el.querySelector('.mk-head small').textContent;

  /* 3. Clicking mastery level keeps .row highlight, updates aria-label, and refreshes stage progress */
  el.querySelector('[data-mk-lv="2"]').click();
  const cellAfter=el.querySelector('[data-mk="ア"]');
  const hasRowAfter=cellAfter.classList.contains('row');
  const hasSelAfter=cellAfter.classList.contains('sel');
  const hasM2After=cellAfter.classList.contains('m2');
  const ariaAfter=cellAfter.getAttribute('aria-label');
  const stageAfter=el.querySelector('.mg-prog .mg-num').textContent;
  const subAfter=el.querySelector('.mg-sub').textContent;
  const stageBigAfter=el.querySelector('.mg-stage-kana b').textContent;
  el.querySelector('[data-mk="ヲ"]').click();
  const kataWoSmall=el.querySelector('.mk-head small').textContent;

  el.remove();
  return {
   hiraSmall,pureKanaSmall,kataSmall,kataWoSmall,
   stageBefore,stageAfter,subBefore,subAfter,stageBigAfter,
   hasRowAfter,hasSelAfter,hasM2After,ariaAfter
  };
 })()`);

 assert.equal(out.hiraSmall,'ア · 雨（あめ）');
 assert.equal(out.pureKanaSmall,'ズ · ずっと');
 assert.equal(out.kataSmall,'あ · アイス');
 assert.equal(out.kataWoSmall,'を');
 assert.equal(out.hasRowAfter,true,'setting mastery must preserve current-lesson .row class');
 assert.equal(out.hasSelAfter,true,'setting mastery must preserve .sel class');
 assert.equal(out.hasM2After,true,'setting mastery must update mastery class');
 assert.equal(out.ariaAfter,'ア a 熟悉');
 assert.equal(out.stageBefore,'00/46');
 assert.equal(out.stageAfter,'01/46','stage progress counter must refresh after setting mastery');
 assert.match(out.subBefore,/还有 5 个假名不熟/);
 assert.match(out.subAfter,/还有 4 个假名不熟/);
 assert.equal(out.stageBigAfter,'イ','stage preview kana should advance to next unfamiliar kana');
});
