// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const {Settings}=require('../services/settings.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('speech settings style selector updates, previews, and saves when aivisSpeaker is default 0 or unknown',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-speech-style-'));
 let server,browser;
 t.after(async()=>{
  await browser?.stop();
  server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 server=await startWeb();
 browser=await startEdge(path.join(root,'edge'));
 const origin='http://127.0.0.1:'+server.address().port;
 await browser.send('Page.navigate',{url:origin+'/settings.js'});
 const baseSettings=new Settings(root).get();

 const res=await browser.evaluate(`(async()=>{
  const {renderSettings}=await import('/settings.js');
  const tick=()=>new Promise(r=>setTimeout(r,30));
  const speakers=[
   {name:'まお',styles:[{id:888753760,name:'ノーマル'},{id:888753761,name:'上機嫌'},{id:888753762,name:'怒り'}]},
   {name:'コハク',styles:[{id:999000001,name:'ノーマル'},{id:999000002,name:'喜び'}]},
  ];
  const wavBase64='UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  async function mount(initialSpeaker,voiceList){
   document.body.innerHTML='<main></main>';
   const saves=[],previews=[],main=document.querySelector('main');
   const data=structuredClone(${JSON.stringify(baseSettings)});
   data.values.speech.aivisSpeaker=initialSpeaker;
   let failNextRefresh=false,nextRefreshList=null;
   const api=async(name,req)=>{
    if(name==='settings_get')return data;
    if(name==='speakers_cached')return voiceList;
    if(name==='speakers'){if(failNextRefresh){failNextRefresh=false;throw Error('OFFLINE');}if(nextRefreshList!==null){const r=nextRefreshList;nextRefreshList=null;return r;}return voiceList;}
    if(name==='settings_save'){saves.push(req);return {saved:true};}
    if(name==='speech_preview'){previews.push(req);return {data:wavBase64};}
    if(name==='pack_status')return {packs:[]};
    if(name==='reader_message')return {replies:[{method:'v4Deliver',args:[req.message.id,{voices:[]},'']}]};
    return {};
   };
   await renderSettings({main,section:'speech',api,locale:'zh',esc:String,toast:()=>{},
    heading:()=>'<div class="page-tools"></div>',text:{settings:'设置',serviceFailed:'失败'},
    isCurrent:()=>true,onSaved:async()=>{}});
   await tick();
   const pickOption=(selectSel,idx)=>{
    const sel=main.querySelector(selectSel);
    sel.closest('.select-control').querySelector('.select-trigger').click();
    const opts=document.querySelectorAll('.select-popup [role="option"]');
    opts[idx].click();
   };
   const triggerText=selectSel=>main.querySelector(selectSel).closest('.select-control').querySelector('.select-trigger').textContent;
   return {main,saves,previews,pickOption,triggerText,setNextRefresh:(fail,list=null)=>{failNextRefresh=fail;nextRefreshList=list;}};
  }

  // Case 1: brand-new default user (aivisSpeaker=0) with 1 voice installed
  const c1=await mount(0,[speakers[0]]);
  const c1FeedbackInit=c1.main.querySelector('.speech-feedback').textContent;
  const c1SavesInit=c1.saves.length;
  c1.pickOption('[data-style]',1); // 上機嫌 (888753761)
  await tick();
  const c1IdAfterStyle=c1.main.querySelector('input[name="aivisSpeaker"]').value;
  const c1TriggerAfterStyle=c1.triggerText('[data-style]');
  c1.main.querySelector('[data-preview]').click();
  await tick();
  // Re-clicking same style must not trigger a duplicate save (id.value === emotion.value)
  c1.pickOption('[data-style]',1);
  await tick();
  const c1SavesAfterSame=c1.saves.length;
  // Round-trip back to style 0 (888753760)
  c1.pickOption('[data-style]',0);
  await tick();
  const c1IdAfterBack=c1.main.querySelector('input[name="aivisSpeaker"]').value;
  const c1TriggerAfterBack=c1.triggerText('[data-style]');
  c1.main.querySelector('[data-preview]').click();
  await tick();
  // Empty emotion value change must not overwrite id.value
  const emoEl=c1.main.querySelector('[data-style]');
  emoEl.append(new Option('empty',''));emoEl.value='';emoEl.dispatchEvent(new Event('change'));
  await tick();
  const c1IdAfterEmpty=c1.main.querySelector('input[name="aivisSpeaker"]').value;

  // Case 2: deleted/unknown speaker ID (999999999) with 1 voice installed + error state recovery
  const c2=await mount(999999999,[speakers[0]]);
  const c2FeedbackInit=c2.main.querySelector('.speech-feedback').textContent;
  c2.setNextRefresh(true);c2.main.querySelector('[data-refresh]').click();await tick();
  const c2ErrState=c2.main.querySelector('.speech-feedback').dataset.state||'';
  c2.main.querySelector('[data-refresh]').click();await tick();
  const c2FeedbackAfterRefresh=c2.main.querySelector('.speech-feedback').textContent;
  const c2StateAfterRefresh=c2.main.querySelector('.speech-feedback').dataset.state||'';
  c2.setNextRefresh(true);c2.main.querySelector('[data-refresh]').click();await tick();
  c2.pickOption('[data-style]',0); // pick first style ノーマル (888753760)
  await tick();
  const c2IdAfterStyle=c2.main.querySelector('input[name="aivisSpeaker"]').value;
  const c2FeedbackAfterPick=c2.main.querySelector('.speech-feedback').textContent;
  const c2StateAfterPick=c2.main.querySelector('.speech-feedback').dataset.state||'';
  c2.main.querySelector('[data-preview]').click();
  await tick();
  // Error state cleared when refresh returns empty []
  c2.setNextRefresh(true);c2.main.querySelector('[data-refresh]').click();await tick();
  c2.setNextRefresh(false,[]);c2.main.querySelector('[data-refresh]').click();await tick();
  const c2EmptyFeedback=c2.main.querySelector('.speech-feedback').textContent;
  const c2EmptyState=c2.main.querySelector('.speech-feedback').dataset.state||'';

  // Case 3: deleted/unknown speaker ID with 2 voices installed, switching voice clears feedback and error state
  const c3=await mount(999999999,speakers);
  c3.setNextRefresh(true);c3.main.querySelector('[data-refresh]').click();await tick();
  c3.pickOption('[data-voice]',1); // コハク (999000001)
  await tick();
  const c3IdAfterVoice=c3.main.querySelector('input[name="aivisSpeaker"]').value;
  const c3VoiceTrigger=c3.triggerText('[data-voice]');
  const c3FeedbackAfterVoice=c3.main.querySelector('.speech-feedback').textContent;
  const c3StateAfterVoice=c3.main.querySelector('.speech-feedback').dataset.state||'';

  return {
   c1:{feedbackInit:c1FeedbackInit,savesInit:c1SavesInit,idAfterStyle:c1IdAfterStyle,triggerAfterStyle:c1TriggerAfterStyle,savesAfterSame:c1SavesAfterSame,idAfterBack:c1IdAfterBack,triggerAfterBack:c1TriggerAfterBack,idAfterEmpty:c1IdAfterEmpty,savedSpeakers:c1.saves.map(s=>s.values.aivisSpeaker),previewSpeakers:c1.previews.map(p=>p.speaker)},
   c2:{feedbackInit:c2FeedbackInit,errState:c2ErrState,feedbackAfterRefresh:c2FeedbackAfterRefresh,stateAfterRefresh:c2StateAfterRefresh,idAfterStyle:c2IdAfterStyle,feedbackAfterPick:c2FeedbackAfterPick,stateAfterPick:c2StateAfterPick,emptyFeedback:c2EmptyFeedback,emptyState:c2EmptyState,savedSpeakers:c2.saves.map(s=>s.values.aivisSpeaker),previewSpeakers:c2.previews.map(p=>p.speaker)},
   c3:{idAfterVoice:c3IdAfterVoice,voiceTrigger:c3VoiceTrigger,feedbackAfterVoice:c3FeedbackAfterVoice,stateAfterVoice:c3StateAfterVoice,savedSpeakers:c3.saves.map(s=>s.values.aivisSpeaker)},
  };
 })()`);

 // Case 1 assertions
 assert.equal(res.c1.feedbackInit,'','default aivisSpeaker=0 must not show unknown-voice warning');
 assert.equal(res.c1.savesInit,0,'initial speaker list load must not trigger spurious autosave');
 assert.equal(res.c1.idAfterStyle,'888753761');
 assert.match(res.c1.triggerAfterStyle,/上機嫌/);
 assert.equal(res.c1.savesAfterSame,1,'re-selecting same style must not trigger extra save');
 assert.equal(res.c1.idAfterBack,'888753760');
 assert.match(res.c1.triggerAfterBack,/ノーマル/);
 assert.equal(res.c1.idAfterEmpty,'888753760','empty emotion value must not clear saved speaker ID');
 assert.deepEqual(res.c1.savedSpeakers,[888753761,888753760]);
 assert.deepEqual(res.c1.previewSpeakers,[888753761,888753760]);

 // Case 2 assertions
 assert.match(res.c2.feedbackInit,/未在列表中/);
 assert.equal(res.c2.errState,'error');
 assert.match(res.c2.feedbackAfterRefresh,/未在列表中/,'manual refresh must keep unknown-voice hint until user picks');
 assert.equal(res.c2.stateAfterRefresh,'','successful refresh clears prior error state');
 assert.equal(res.c2.idAfterStyle,'888753760');
 assert.equal(res.c2.feedbackAfterPick,'','picking a valid style clears the unknown-voice warning');
 assert.equal(res.c2.stateAfterPick,'','picking a valid style clears prior error state');
 assert.equal(res.c2.emptyFeedback,'');assert.equal(res.c2.emptyState,'');
 assert.deepEqual(res.c2.savedSpeakers,[888753760]);
 assert.deepEqual(res.c2.previewSpeakers,[888753760]);

 // Case 3 assertions
 assert.equal(res.c3.idAfterVoice,'999000001');
 assert.equal(res.c3.voiceTrigger,'コハク');
 assert.equal(res.c3.feedbackAfterVoice,'','switching voice clears the unknown-voice warning');
 assert.equal(res.c3.stateAfterVoice,'','switching voice clears prior error state');
 assert.deepEqual(res.c3.savedSpeakers,[999000001]);
});
