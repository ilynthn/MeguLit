// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('kana play view cancels countdown and pending timers on leave',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-leave-'));
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
  const [{view},D]=await Promise.all([import('/kana/views/play.js'),import('/kana/data.js')]);
  const makeCtx=(params)=>{
   const leaves=[],runs=[],navs=[],keys=[];
   const store={KEY:{m:'m',b:'b',r:'r',a:'a',l:'l',p:'p'},get:(_,f)=>f,put(){},addRun:r=>runs.push(r)};
   const speech={say(){},prefetch(){},stop(){}};
   return {ctx:{params,data:D,store,speech,go:u=>navs.push(u),onKey:h=>keys.push(h),onLeave:h=>leaves.push(h),volumeHTML:()=>''},leaves,runs,navs,keys};
  };

  /* 1. Challenge mode countdown must stop on leave and never fire finish()/go('results.html') */
  const origNow=performance.now.bind(performance);
  let fakeNow=1000;
  performance.now=()=>fakeNow;
  const origRaf=window.requestAnimationFrame,origCancelRaf=window.cancelAnimationFrame;
  let rafId=0;const rafMap=new Map();
  window.requestAnimationFrame=cb=>{const id=++rafId;rafMap.set(id,cb);return id;};
  window.cancelAnimationFrame=id=>{rafMap.delete(id);};
  const el1=document.createElement('div');document.body.append(el1);
  const c1=makeCtx({g:'pos',d:'chal',s:'h'});
  view(el1,c1.ctx);
  const leaveRegistered=c1.leaves.length>0;
  for(const h of c1.leaves)h();
  const rafLeftAfterLeave=rafMap.size;
  fakeNow+=120_000;
  for(const cb of [...rafMap.values()])cb(fakeNow);
  performance.now=origNow;
  window.requestAnimationFrame=origRaf;
  window.cancelAnimationFrame=origCancelRaf;
  el1.remove();

  /* 2. Pending next-question timer after answering must cancel on leave */
  const el2=document.createElement('div');document.body.append(el2);
  const c2=makeCtx({g:'pos',d:'std',s:'h'});
  view(el2,c2.ctx);
  el2.querySelector('[data-row]').click();
  el2.querySelector('[data-dan]').click();
  const qBefore=el2.querySelector('#qcount').textContent;
  for(const h of c2.leaves)h();
  await new Promise(r=>setTimeout(r,850));
  const qAfter=el2.querySelector('#qcount').textContent;
  el2.remove();

  /* 3. Pending seq second-slot timer must cancel on leave */
  const el3=document.createElement('div');document.body.append(el3);
  const c3=makeCtx({g:'seq',d:'std',s:'h',only:'き'});
  view(el3,c3.ctx);
  const prevBtn=[...el3.querySelectorAll('#opts .ch')].find(b=>b.textContent.includes('か'));
  prevBtn.click();
  const optsBefore=el3.querySelector('#opts').innerHTML;
  for(const h of c3.leaves)h();
  await new Promise(r=>setTimeout(r,450));
  const optsAfter=el3.querySelector('#opts').innerHTML;
  el3.remove();

  return {
   leaveRegistered,
   rafLeftAfterLeave,
   chalNavs:c1.navs,
   chalRuns:c1.runs.length,
   qStayed:qBefore===qAfter,
   optsStayed:optsBefore===optsAfter
  };
 })()`);

 assert.equal(out.leaveRegistered,true,'play view must register an onLeave cleanup handler');
 assert.equal(out.rafLeftAfterLeave,0,'onLeave must cancel active requestAnimationFrame');
 assert.deepEqual(out.chalNavs,[],'leaving challenge mode must not later navigate to results.html');
 assert.equal(out.chalRuns,0,'leaving challenge mode must not later record a finished run');
 assert.equal(out.qStayed,true,'leaving after answering must not advance to the next question');
 assert.equal(out.optsStayed,true,'leaving after first seq slot must not re-render options');
});
