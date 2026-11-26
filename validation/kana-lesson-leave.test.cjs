// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('kana lesson view cancels delayed speech and quiz timers on leave',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-lesson-'));
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
  const [{view},D]=await Promise.all([import('/kana/views/lesson.js'),import('/kana/data.js')]);
  const makeCtx=()=>{
   const leaves=[],said=[],done=[];
   const store={KEY:{m:'m',b:'b',r:'r',a:'a',l:'l',p:'p'},DAY:864e5,get:(_,f)=>f,put(){},lessonDone:id=>done.push(id)};
   const speech={say:t=>said.push(t),prefetch(){},stop(){}};
   return {ctx:{base:'/kana/',params:{id:'h9'},data:D,store,speech,gameWords:async()=>({}),go(){},onKey(){},onLeave:h=>leaves.push(h),volumeHTML:()=>''},leaves,said,done};
  };

  /* 1. Leaving right after answering in quiz cancels the 650ms next-question timer */
  const el1=document.createElement('div');document.body.append(el1);
  const c1=makeCtx();
  view(el1,c1.ctx);
  const leaveRegistered=c1.leaves.length>0;
  for(let i=0;i<3;i++)el1.querySelector('#nx').click(); /* h9 has 3 kana -> enters step 1 (k2r) */
  const q1Before=el1.querySelector('.q-meta .num').textContent;
  const k1=el1.querySelector('.prompt .big').textContent;
  const r1=D.romaOf(k1);
  [...el1.querySelectorAll('.choice')].find(b=>b.textContent.endsWith(r1)).click();
  for(const h of c1.leaves)h();
  await new Promise(r=>setTimeout(r,800));
  const q1AfterLeave=el1.querySelector('.q-meta .num').textContent;
  el1.remove();

  /* 2. Staying in quiz still advances, and leaving right after entering snd2k cancels 250ms auto-speak */
  const origRandom=Math.random;
  Math.random=()=>0; /* forces snd2k in step 2 */
  const el2=document.createElement('div');document.body.append(el2);
  const c2=makeCtx();
  view(el2,c2.ctx);
  for(let i=0;i<3;i++)el2.querySelector('#nx').click();
  let advancedInPlace=false;
  for(let q=0;q<3;q++){
   const k=el2.querySelector('.prompt .big').textContent,r=D.romaOf(k);
   [...el2.querySelectorAll('.choice')].find(b=>b.textContent.endsWith(r)).click();
   await new Promise(r=>setTimeout(r,750));
   if(q===0&&el2.querySelector('.q-meta .num')?.textContent==='2 / 3')advancedInPlace=true;
  }
  /* Now in step 2 (snd2k), 250ms auto-speak timer is pending; leave immediately */
  const saidBeforeLeave=c2.said.length;
  for(const h of c2.leaves)h();
  await new Promise(r=>setTimeout(r,350));
  const saidAfterLeave=c2.said.length;
  Math.random=origRandom;
  el2.remove();

  return {
   leaveRegistered,
   stayedOnQ1AfterLeave:q1Before==='1 / 3'&&q1AfterLeave==='1 / 3',
   advancedInPlace,
   noSpeakAfterLeave:saidAfterLeave===saidBeforeLeave
  };
 })()`);

 assert.equal(out.leaveRegistered,true,'lesson view must register onLeave cleanup');
 assert.equal(out.stayedOnQ1AfterLeave,true,'leaving after answering must cancel next-question timer');
 assert.equal(out.advancedInPlace,true,'staying in quiz must still advance to next question');
 assert.equal(out.noSpeakAfterLeave,true,'leaving on a listen-and-pick prompt must cancel the 250ms auto-speak timer');
});
