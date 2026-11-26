// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('kana play intro respects chosen script and seq locks input during 350ms slot transition',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-f21-'));
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
   const leaves=[];
   const store={KEY:{m:'m',b:'b',r:'r',a:'a',l:'l',p:'p'},get:(_,f)=>f,put(){},addRun(){}};
   return {ctx:{params,data:D,store,speech:{say(){},prefetch(){},stop(){}},go(){},onKey(){},onLeave:h=>leaves.push(h),volumeHTML:()=>''},leaves};
  };

  /* 1. pos & seq intro respect s=k (katakana) and default to hiragana when s is omitted */
  const checkPrompt=(params,sel)=>{
   const el=document.createElement('div');document.body.append(el);
   const {ctx,leaves}=makeCtx(params);
   view(el,ctx);
   const txt=el.querySelector(sel)?.textContent||'';
   for(const h of leaves)h();
   el.remove();
   return txt;
  };
  const posKata=checkPrompt({g:'pos',d:'intro',s:'k',only:'あ'},'.prompt');
  const seqKata=checkPrompt({g:'seq',d:'intro',s:'k',only:'あ'},'.mid');
  const posDefault=checkPrompt({g:'pos',d:'intro',only:'あ'},'.prompt');

  /* 2a. seq std (choices): double-clicking right option within 350ms must not mark next slot wrong */
  const elStd=document.createElement('div');document.body.append(elStd);
  const cStd=makeCtx({g:'seq',d:'std',s:'h',only:'い'});
  view(elStd,cStd.ctx);
  const prevBtn=[...elStd.querySelectorAll('#opts .ch')].find(b=>b.textContent.endsWith('あ'));
  prevBtn.click();
  prevBtn.click(); /* immediate double click during 350ms transition */
  const stdFbDuring=elStd.querySelector('#fb')?.textContent||'';
  const stdNextSlotDuring=elStd.querySelector('#slot-next')?.className||'';
  await new Promise(r=>setTimeout(r,450));
  const nextBtn=[...elStd.querySelectorAll('#opts .ch')].find(b=>b.textContent.endsWith('う'));
  nextBtn?.click();
  const stdFbAfter=elStd.querySelector('#fb')?.textContent||'';
  for(const h of cStd.leaves)h();
  elStd.remove();

  /* 2b. seq adv (input): double submit within 350ms before input clears must not mark next slot wrong */
  const elAdv=document.createElement('div');document.body.append(elAdv);
  const cAdv=makeCtx({g:'seq',d:'adv',s:'h',only:'い'});
  view(elAdv,cAdv.ctx);
  const inp=elAdv.querySelector('#ans'),sub=elAdv.querySelector('#submit');
  inp.value='あ';
  sub.click();
  sub.click(); /* immediate double submit while inp.value is still 'あ' */
  const advFbDuring=elAdv.querySelector('#fb')?.textContent||'';
  await new Promise(r=>setTimeout(r,450));
  const advValCleared=inp.value;
  inp.value='う';
  sub.click();
  const advFbAfter=elAdv.querySelector('#fb')?.textContent||'';
  for(const h of cAdv.leaves)h();
  elAdv.remove();

  return {posKata,seqKata,posDefault,stdFbDuring,stdNextSlotDuring,stdFbAfter,advFbDuring,advValCleared,advFbAfter};
 })()`);

 await t.test('1. pos and seq intro respect s=k and keep hiragana default',()=>{
  assert.equal(out.posKata,'ア','pos intro with s=k must show katakana');
  assert.equal(out.seqKata,'ア','seq intro with s=k must show katakana');
  assert.equal(out.posDefault,'あ','pos intro without s must still default to hiragana');
 });
 await t.test('2. seq locks during 350ms transition in choice and input modes',()=>{
  assert.equal(out.stdFbDuring,'','double click during 350ms transition must not fail the second slot');
  assert.doesNotMatch(out.stdNextSlotDuring,/wrong/,'next slot must not be marked wrong during transition');
  assert.match(out.stdFbAfter,/正确/,'second slot must accept answer after 350ms unlock');
  assert.equal(out.advFbDuring,'','double submit during 350ms input transition must not fail the second slot');
  assert.equal(out.advValCleared,'','input must be cleared after 350ms transition');
  assert.match(out.advFbAfter,/正确/,'input second slot must accept answer after 350ms unlock');
 });
});
