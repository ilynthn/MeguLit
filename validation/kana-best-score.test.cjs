// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('kana games and records views show personal best score and accuracy without undefined',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-best-'));
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
  document.body.innerHTML='<div id="host"></div>';
  const {mountKana}=await import('/kana/kana.js');
  const makeLog=(okCount,total)=>Array.from({length:total},(_,i)=>({show:'あ',ok:i<okCount,t:1.2,limit:10,hint:false}));
  const now=Date.now();
  const runs=[
   {id:now-3000,G:'pos',D:'adv',script:'m',only:[],log:makeLog(8,10),best:5,secs:12},
   {id:now-2000,G:'conv',D:'intro',script:'h',only:[],log:makeLog(5,10),best:3,secs:15},
   {id:now-1000,G:'conv',D:'chal',script:'m',only:[],log:makeLog(10,10),best:10,secs:20}
  ];
  const api=async action=>{
   if(action==='kana_progress')return {mastery:{},boxes:{},runs,applied:[],lessons:{},prefs:{volume:0.4,voice:'female'}};
   if(action==='kana_game_words')return {words:{}};
   return {};
  };
  const host=document.getElementById('host');
  await mountKana(host,{api,start:'index'});
  const root=host.querySelector('.kana-host').shadowRoot;
  const waitFor=async fn=>{for(let i=0;i<60;i++){if(fn())return true;await new Promise(r=>setTimeout(r,20));}return false;};
  root.querySelector('[data-go="games.html"]').click();
  await waitFor(()=>root.querySelectorAll('#games .game').length===3);
  const posCardText=root.querySelector('#games .game[data-g="0"] .best').textContent;
  const convCardText=root.querySelector('#games .game[data-g="2"] .best').textContent;
  root.querySelector('.diff[data-d="2"]').click();
  const startBestAdv=root.querySelector('.start-row .best').textContent;
  root.querySelector('.diff[data-d="0"]').click();
  const startBestIntro=root.querySelector('.start-row .best').textContent;

  await mountKana(host,{api,start:'records'});
  const r2=host.querySelector('.kana-host').shadowRoot;
  await waitFor(()=>r2.querySelectorAll('table tbody tr').length===3);
  const tableText=r2.querySelector('table').textContent;
  const advCell=r2.querySelectorAll('table tbody tr')[0].querySelectorAll('td')[3].textContent;
  return {posCardText,convCardText,startBestAdv,startBestIntro,tableText,advCell};
 })()`);

 assert.doesNotMatch(out.posCardText,/undefined/,'games left card must not render undefined when only adv was played');
 assert.match(out.posCardText,/已玩 1 个难度 · 最佳 \d+\.\d%/);
 assert.match(out.convCardText,/已玩 2 个难度 · 最佳 101\.0%/,'games left card must pick highest score across all difficulties');
 assert.doesNotMatch(out.startBestAdv,/undefined/,'start row personal best must not render undefined');
 assert.match(out.startBestAdv,/个人最佳 · 正确率 80%/);
 assert.equal(out.startBestIntro,'这个难度还没有成绩');
 assert.doesNotMatch(out.tableText,/undefined/,'records personal best table must not render undefined');
 assert.match(out.advCell,/80% · 1 次/);
});
