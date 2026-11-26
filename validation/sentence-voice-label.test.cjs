// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('reused sentence play button clears stale CV? badge and drops out-of-order labelVoices responses',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-sv-label-'));
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
  document.documentElement.lang='zh-CN';
  document.body.innerHTML='<button type="button" id="play">朗读</button>';
  const btn=document.getElementById('play');
  const {labelVoices,markSource}=await import('/sentence-voice.js');

  // 1. After playing an estimated game voice (原声 CV?), switching to an unvoiced line must clear the CV? badge
  markSource(btn,'game',true);
  const afterEstimated={text:btn.textContent,hasBadge:!!btn.querySelector('.cv-badge'),isGame:btn.classList.contains('is-game-voice')};
  await labelVoices(async()=>({has:[false]}),[{button:btn,id:2,text:'無声の台詞'}]);
  const afterSwitchUnvoiced={text:btn.textContent,hasBadge:!!btn.querySelector('.cv-badge'),isGame:btn.classList.contains('is-game-voice')};

  // 2. Switching from estimated game voice to an exact game voice must also clear stale CV? badge
  markSource(btn,'game',true);
  await labelVoices(async()=>({has:[true]}),[{button:btn,id:3,text:'完全一致の台詞'}]);
  const afterSwitchExact={text:btn.textContent,hasBadge:!!btn.querySelector('.cv-badge'),isGame:btn.classList.contains('is-game-voice')};

  // 3. Out-of-order labelVoices: slow first response [true] arriving after second response [false] must not overwrite
  let resolveSlow;
  const slow=labelVoices(()=>new Promise(r=>{resolveSlow=r;}),[{button:btn,id:10,text:'遅い台詞'}]);
  await labelVoices(async()=>({has:[false]}),[{button:btn,id:11,text:'新しい台詞'}]);
  resolveSlow({has:[true]});
  await slow;
  const afterOutOfOrder={text:btn.textContent,isGame:btn.classList.contains('is-game-voice')};

  // 4. Stale labelVoices resolving after markSource must not wipe the fresh CV? badge
  let resolveBeforeMark;
  const slow2=labelVoices(()=>new Promise(r=>{resolveBeforeMark=r;}),[{button:btn,id:12,text:'再生前の台詞'}]);
  markSource(btn,'game',true);
  resolveBeforeMark({has:[false]});
  await slow2;
  const afterStaleOverMark={text:btn.textContent,hasBadge:!!btn.querySelector('.cv-badge'),isGame:btn.classList.contains('is-game-voice')};

  return {afterEstimated,afterSwitchUnvoiced,afterSwitchExact,afterOutOfOrder,afterStaleOverMark};
 })()`);

 assert.equal(out.afterEstimated.text,'原声CV?');
 assert.equal(out.afterEstimated.hasBadge,true);

 assert.equal(out.afterSwitchUnvoiced.text,'朗读','stale CV? badge must be removed when switching to an unvoiced line');
 assert.equal(out.afterSwitchUnvoiced.hasBadge,false);
 assert.equal(out.afterSwitchUnvoiced.isGame,false);

 assert.equal(out.afterSwitchExact.text,'原声','stale CV? badge must be removed when relabelling another line');
 assert.equal(out.afterSwitchExact.hasBadge,false);
 assert.equal(out.afterSwitchExact.isGame,true);

 assert.equal(out.afterOutOfOrder.text,'朗读','stale labelVoices response must not overwrite newer sentence label');
 assert.equal(out.afterOutOfOrder.isGame,false);

 assert.equal(out.afterStaleOverMark.text,'原声CV?','stale labelVoices response must not wipe fresh markSource badge');
 assert.equal(out.afterStaleOverMark.hasBadge,true);
 assert.equal(out.afterStaleOverMark.isGame,true);
});
