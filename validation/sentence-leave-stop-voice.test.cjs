// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('leaving sentences page stops playing audio and suppresses delayed synthesis playback and stale errors',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-sent-leave-'));
 let server,browser;
 t.after(async()=>{
  await browser?.stop();
  server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 server=await startWeb();
 browser=await startEdge(path.join(root,'edge'));
 const origin='http://127.0.0.1:'+server.address().port;
 await browser.send('Page.navigate',{url:origin+'/sentences-page.js'});

 const res=await browser.evaluate(`(async()=>{
  const {mountSentences}=await import('/sentences-page.js');
  const {playSentence}=await import('/sentence-voice.js');
  const tick=()=>new Promise(r=>setTimeout(r,30));
  const wavBase64='UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  const players=[];
  const NativeAudio=window.Audio;
  window.Audio=class FakeAudio{
   constructor(){
    this.src='';this.volume=1;this.paused=true;this.playCalls=0;this.pauseCalls=0;
    this._listeners=new Map();
    players.push(this);
   }
   addEventListener(name,fn){this._listeners.set(name,fn);}
   play(){this.paused=false;this.playCalls++;return Promise.resolve();}
   pause(){this.paused=true;this.pauseCalls++;}
  };
  try{
   const items=[{id:1,text:'黒より黒く闇より暗き漆黒。',translation:'比黑更黑',created_at:Date.now(),source:'manual',words:[]}];
   const toasts=[];
   let mode='ok',resolvePending=null,rejectPending=null;
   const api=async(name)=>{
    if(name==='sentences')return items;
    if(name==='sentence_voice_has')return {has:[false]};
    if(name==='sentence_voice'){
     if(mode==='defer-ok')return new Promise(r=>{resolvePending=r;});
     if(mode==='defer-fail')return new Promise((_,rej)=>{rejectPending=rej;});
     return {data:wavBase64,mime:'audio/wav',source:'synthesized',volume:0.8};
    }
    return {};
   };
   const mountInto=async()=>{
    document.body.innerHTML='<main id="main" class="main"><div id="slot"></div></main>';
    const target=document.getElementById('slot');
    await mountSentences(target,{
     api,locale:'zh',esc:String,toast:m=>toasts.push(m),errorMessage:e=>String(e?.message||e),
     empty:()=>'',emptyLabel:'',readTime:()=>'',datetime:()=>'',icon:()=>'',
     isCurrent:()=>true,rerender:()=>{},lookup:()=>{},openGame:()=>{},games:[],cover:()=>''
    });
    await tick();
    return {main:document.getElementById('main'),target};
   };

   // Case 1: audio already playing when user leaves sentences page -> paused immediately
   const c1=await mountInto();
   c1.target.querySelector('[data-sentence-play]').click();
   await tick();
   const p1=players.at(-1);
   const p1PlayingBeforeLeave=!p1.paused;
   c1.main.innerHTML='<section>other page</section>';
   await tick();
   const p1PausedAfterLeave=p1.paused&&p1.pauseCalls>=1;

   // Case 2: synthesis still in flight when user leaves sentences page -> resolving later must NOT play audio
   const c2=await mountInto();
   mode='defer-ok';
   const countBeforeC2=players.length;
   c2.target.querySelector('[data-sentence-play]').click();
   await tick();
   c2.main.innerHTML='<section>other page</section>';
   await tick();
   resolvePending({data:wavBase64,mime:'audio/wav',source:'synthesized',volume:0.8});
   await tick();
   const countAfterC2=players.length;

   // Case 3: direct playSentence from another view (e.g. grammar/detail) whose button detaches while in flight -> no playback and no stale throw
   document.body.innerHTML='<main id="main"><button id="b" type="button">朗读</button></main>';
   const b3=document.getElementById('b');
   mode='defer-ok';
   const countBeforeC3=players.length;
   const p3=playSentence(api,'テスト文',b3);
   await tick();
   b3.remove();
   resolvePending({data:wavBase64,mime:'audio/wav',source:'synthesized',volume:0.8});
   await p3;
   const countAfterC3=players.length;

   // Case 4: detached button whose synthesis fails later -> resolves silently instead of throwing stale error
   document.body.innerHTML='<main id="main"><button id="b4" type="button">朗读</button></main>';
   const b4=document.getElementById('b4');
   mode='defer-fail';
   let c4Threw=false;
   const p4=playSentence(api,'失敗テスト',b4).catch(()=>{c4Threw=true;});
   await tick();
   b4.remove();
   rejectPending(Error('ENGINE_DOWN'));
   await p4;

   // Case 5: still-connected button whose synthesis fails -> still throws so caller can toast
   document.body.innerHTML='<main id="main"><button id="b5" type="button">朗读</button></main>';
   const b5=document.getElementById('b5');
   mode='defer-fail';
   let c5Threw=false;
   const p5=playSentence(api,'失敗テスト2',b5).catch(()=>{c5Threw=true;});
   await tick();
   rejectPending(Error('ENGINE_DOWN'));
   await p5;

   return {
    p1PlayingBeforeLeave,p1PausedAfterLeave,
    c2Created:countAfterC2-countBeforeC2,
    c3Created:countAfterC3-countBeforeC3,
    c4Threw,c5Threw,toastCount:toasts.length
   };
  }finally{
   window.Audio=NativeAudio;
  }
 })()`);

 assert.equal(res.p1PlayingBeforeLeave,true);
 assert.equal(res.p1PausedAfterLeave,true,'leaving sentences page must pause playing sentence audio');
 assert.equal(res.c2Created,0,'in-flight sentence synthesis must not start playing after leaving sentences page');
 assert.equal(res.c3Created,0,'in-flight sentence synthesis must not start playing after its button leaves the DOM');
 assert.equal(res.c4Threw,false,'failed synthesis after button detaches must not throw stale error');
 assert.equal(res.c5Threw,true,'failed synthesis while button stays connected must still throw');
 assert.equal(res.toastCount,0,'leaving sentences page must not trigger failure toasts');
});
