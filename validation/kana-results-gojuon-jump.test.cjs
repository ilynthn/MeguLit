// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('kana results wrong-kana links target gojuon?k=... and gojuon jump handles yoon and unknown params without blanking',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-gojuon-jump-'));
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
  const [{view:resultsView},{view:gojuonView},D]=await Promise.all([
   import('/kana/views/results.js'),
   import('/kana/views/gojuon.js'),
   import('/kana/data.js')
  ]);
  const run={
   id:Date.now(),G:'conv',D:'adv',script:'m',secs:12,best:1,ended:'答完',score:50,
   log:[
    {k:'きゃ',show:'キャ',ok:false,why:'写错',t:3},
    {k:'ぬ',show:'ぬ',ok:false,why:'写错',t:2.5}
   ]
  };
  const store={
   KEY:{m:'m',b:'b',r:'r',a:'a',l:'l',p:'p'},DAY:864e5,
   GAME:{pos:'行段识别',seq:'前后假名',conv:'平片转换'},
   DIFF:{intro:'入门',std:'标准',adv:'进阶',chal:'挑战'},
   CONFUSE:D.CONFUSE,INTERVAL:[1,3,7,21],
   get:(k,f)=>k==='r'?[run]:f,
   put(){},
   stats:r=>({ok:0,total:r.log.length,acc:0,avg:2.75}),
   bestOf:()=>null,
   applyRun:()=>[]
  };

  /* 1. Results wrong-kana links carry ?k=<kana> */
  const elR=document.createElement('div');document.body.append(elR);
  resultsView(elR,{data:D,store,params:{run:String(run.id)},go(){}});
  const hrefs=[...elR.querySelectorAll('.wk .wrow a')].map(a=>a.getAttribute('href'));
  elR.remove();

  /* 2. Gojuon jumps to katakana yoon キャ */
  const openGojuon=k=>{
   const el=document.createElement('div');document.body.append(el);
   gojuonView(el,{
    base:'/kana/',params:k?{k}:{},data:D,store,
    speech:{say(){},prefetch(){},stop(){}},
    go(){},onKey(){},onLeave(){},
    volumeHTML:()=>'',voicePicker:()=>document.createElement('div')
   });
   const res={
    cells:el.querySelectorAll('#table .cell').length,
    sel:el.querySelector('#table .cell.sel .k')?.textContent||'',
    detailKana:el.querySelector('#detail .d-kana')?.textContent||'',
    catYoon:el.querySelector('#cat button[data-v="yoon"]')?.getAttribute('aria-pressed'),
    scriptK:el.querySelector('#script button[data-v="k"]')?.getAttribute('aria-pressed')
   };
   el.remove();
   return res;
  };
  const yoonKata=openGojuon('キャ');
  const yoonHira=openGojuon('しゃ');
  const unknown=openGojuon('ヴ');

  return {hrefs,yoonKata,yoonHira,unknown};
 })()`);

 assert.deepEqual(out.hrefs,[
  'gojuon.html?k='+encodeURIComponent('キャ'),
  'gojuon.html?k='+encodeURIComponent('ぬ')
 ],'results wrong-kana links must pass ?k=<kana>');
 assert.equal(out.yoonKata.sel,'キャ','gojuon must select katakana yoon cell');
 assert.equal(out.yoonKata.detailKana,'キャ','gojuon detail must show katakana yoon');
 assert.equal(out.yoonKata.catYoon,'true');
 assert.equal(out.yoonKata.scriptK,'true');
 assert.equal(out.yoonHira.sel,'しゃ','gojuon must select hiragana yoon cell');
 assert.equal(out.unknown.cells,46,'unknown ?k param must fall back to rendering default seion chart instead of blank page');
 assert.equal(out.unknown.sel,'あ');
 assert.equal(out.unknown.scriptK,'false','unknown ?k param must not corrupt script state');
});
