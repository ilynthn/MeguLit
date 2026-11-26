// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('kana pos intro excludes ん from LEARNED fallback, finish records effective onlyPool, and leaving kana tab runs leaveHandlers',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-f20-'));
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
  const [{view},D,{mountKana}]=await Promise.all([
   import('/kana/views/play.js'),
   import('/kana/data.js'),
   import('/kana/kana.js')
  ]);

  /* 1. pos intro fallback when user has learned ん must exclude ん and never throw */
  const origRandom=Math.random;
  Math.random=()=>0.9999; /* picks the last element of pool (ん in LEARNED before fix) */
  let posIntroError=null,posIntroPrompt='';
  try{
   const el=document.createElement('div');document.body.append(el);
   const leaves=[];
   const mast={あ:2,わ:2,を:2,ん:2};
   const store={KEY:{m:'m',b:'b',r:'r',a:'a',l:'l',p:'p'},get:(k,f)=>k==='m'?{...mast}:f,put(){},addRun(){}};
   const ctx={params:{g:'pos',d:'intro',s:'h',only:'ん'},data:D,store,speech:{say(){},prefetch(){},stop(){}},go(){},onKey(){},onLeave:h=>leaves.push(h),volumeHTML:()=>''};
   try{view(el,ctx);}catch(e){posIntroError=String(e?.message||e);}
   posIntroPrompt=el.querySelector('.prompt')?.textContent||'';
   for(const h of leaves)h();
   el.remove();
  }finally{Math.random=origRandom;}

  /* 2. finish() writes effective onlyPool to run.only ([] on fallback, filtered subset on partial match) */
  const runToFinish=async(onlyParam)=>{
   const origST=window.setTimeout;
   window.setTimeout=(fn,ms,...args)=>origST(fn,Math.min(Number(ms)||0,2),...args);
   const runs=[];
   const el=document.createElement('div');document.body.append(el);
   const leaves=[];
   const store={KEY:{m:'m',b:'b',r:'r',a:'a',l:'l',p:'p'},get:(_,f)=>f,put(){},addRun:r=>runs.push(r)};
   const ctx={params:{g:'pos',d:'intro',s:'h',only:onlyParam},data:D,store,speech:{say(){},prefetch(){},stop(){}},go(){},onKey(){},onLeave:h=>leaves.push(h),volumeHTML:()=>''};
   try{
    view(el,ctx);
    for(let guard=0;guard<40&&!runs.length;guard++){
     const rBtn=el.querySelector('[data-row]');
     if(rBtn){
      rBtn.click();
      const dBtn=el.querySelector('[data-dan]');
      if(dBtn)dBtn.click();
     }
     await new Promise(r=>origST(r,10));
    }
   }finally{
    for(const h of leaves)h();
    el.remove();
    window.setTimeout=origST;
   }
   return runs[0]||null;
  };
  const fallbackRun=await runToFinish('ん');
  const partialRun=await runToFinish('あ,ん');

  /* 3. Switching away from the whole 五十音 tab (mountKana stop/cleanup) runs leaveHandlers so lesson quiz timer stops */
  const hostWrap=document.createElement('div');document.body.append(hostWrap);
  const api=async(cmd)=>{
   if(cmd==='kana_progress')return {mastery:{},boxes:{},runs:[],applied:[],lessons:{},prefs:{volume:0.4,voice:'female'}};
   if(cmd==='kana_game_words')return {words:{}};
   return {ok:true};
  };
  const mounted=await mountKana(hostWrap,{api,start:'index'});
  const shadow=hostWrap.querySelector('.kana-host').shadowRoot;
  shadow.querySelector('a[href="lesson.html?id=h0"],[data-go="lesson.html?id=h0"]').click();
  for(let i=0;i<50&&!shadow.querySelector('#nx');i++)await new Promise(r=>setTimeout(r,20));
  for(let i=0;i<5;i++)shadow.querySelector('#nx').click(); /* 5 kana in あ行 -> enters step 1 (1 / 5) */
  const numBefore=shadow.querySelector('.q-meta .num')?.textContent||'';
  const k=shadow.querySelector('.prompt .big')?.textContent||'';
  const roma=D.romaOf(k);
  [...shadow.querySelectorAll('.choice')].find(b=>b.textContent.endsWith(roma)).click();
  mounted.stop(); /* leave entire 五十音 tab */
  await new Promise(r=>setTimeout(r,900));
  const numAfter=shadow.querySelector('.q-meta .num')?.textContent||'';
  hostWrap.remove();

  return {
   posIntroError,
   posIntroPrompt,
   fallbackRunOnly:fallbackRun?.only??null,
   partialRunOnly:partialRun?.only??null,
   numBefore,
   numAfter
  };
 })()`);

 await t.test('1. pos intro fallback excludes ん from LEARNED',()=>{
  assert.equal(out.posIntroError,null,'pos intro fallback with learned ん must not throw');
  assert.ok(out.posIntroPrompt&&out.posIntroPrompt!=='ん','pos intro fallback must pick a valid non-ん kana');
 });
 await t.test('2. finish records effective onlyPool to run.only',()=>{
  assert.deepEqual(out.fallbackRunOnly,[],'full fallback from invalid only= must write [] to run.only');
  assert.deepEqual(out.partialRunOnly,['あ'],'partial only= must write filtered effective onlyPool to run.only');
 });
 await t.test('3. mountKana stop/cleanup invokes leaveHandlers',()=>{
  assert.equal(out.numBefore,'1 / 5','expected lesson quiz to start at 1 / 5');
  assert.equal(out.numAfter,'1 / 5','leaving the whole 五十音 tab must cancel pending quiz advance timer');
 });
});
