// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('kana records streak counts completed lessons as well as practice runs to match index view',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-streak-'));
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
  const [{view:indexView},{view:recordsView},D]=await Promise.all([
   import('/kana/views/index.js'),
   import('/kana/views/records.js'),
   import('/kana/data.js')
  ]);
  const dayMs=864e5,now=Date.now();
  /* 3 consecutive days: today & 2 days ago via lessons, yesterday via a practice run */
  const data={
   m:{},b:{},a:[],p:{},
   l:{h0:now-2*dayMs,h1:now},
   r:[{id:now-dayMs,G:'pos',D:'intro',script:'h',log:[{k:'あ',show:'あ',ok:true,t:1.5}]}]
  };
  const store={
   KEY:{m:'m',b:'b',r:'r',a:'a',l:'l',p:'p'},DAY:dayMs,
   GAME:{pos:'行段识别',seq:'前后假名',conv:'平片转换'},
   DIFF:{intro:'入门',std:'标准',adv:'进阶',chal:'挑战'},
   INTERVAL:[1,3,7,21],
   get:(k,f)=>data[k]===undefined?f:JSON.parse(JSON.stringify(data[k])),
   put(){}
  };
  const elIdx=document.createElement('div');document.body.append(elIdx);
  indexView(elIdx,{data:D,store,params:{},speech:{say(){},prefetch(){},stop(){}},go(){},onKey(){},onLeave(){},voicePicker:()=>document.createElement('div')});
  const indexStreak=elIdx.querySelector('.mg-hud-stats b').textContent;
  elIdx.remove();

  const elRec=document.createElement('div');document.body.append(elRec);
  recordsView(elRec,{data:D,store,params:{},go(){}});
  const recordsStreak=elRec.querySelector('.side .big b').textContent;
  elRec.remove();

  /* Lesson-only streak (no runs at all): 2 consecutive days */
  const dataLessonsOnly={m:{},b:{},a:[],p:{},l:{h0:now-dayMs,h1:now},r:[]};
  const store2={...store,get:(k,f)=>dataLessonsOnly[k]===undefined?f:JSON.parse(JSON.stringify(dataLessonsOnly[k]))};
  const elRec2=document.createElement('div');document.body.append(elRec2);
  recordsView(elRec2,{data:D,store:store2,params:{},go(){}});
  const lessonsOnlyStreak=elRec2.querySelector('.side .big b').textContent;
  elRec2.remove();

  return {indexStreak,recordsStreak,lessonsOnlyStreak};
 })()`);

 assert.equal(out.indexStreak,'3');
 assert.equal(out.recordsStreak,'3','records view streak must match index view across lessons and runs');
 assert.equal(out.lessonsOnlyStreak,'2','records view streak must count lesson-only days');
});
