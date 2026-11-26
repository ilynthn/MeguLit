// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const {Settings}=require('../services/settings.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('speech settings preview applies volume changes live and suppresses stale failure toasts after leaving',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-speech-vol-'));
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
  const wavBase64='UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  const players=[];
  const NativeAudio=window.Audio;
  let deferPlay=false;
  window.Audio=class FakeAudio{
   constructor(src){
    this.src=src;this.volume=1;this.paused=true;this.volumes=[];this.onended=null;this.onerror=null;
    this._playResolve=null;this._playReject=null;
    players.push(this);
   }
   play(){
    this.paused=false;
    this.volumes.push(this.volume);
    if(deferPlay){
     deferPlay=false;
     return new Promise((res,rej)=>{this._playResolve=res;this._playReject=rej;});
    }
    return Promise.resolve();
   }
   pause(){
    this.paused=true;
    if(this._playReject){
     const rej=this._playReject;this._playResolve=null;this._playReject=null;
     rej(Object.assign(new Error('interrupted by pause'),{name:'AbortError'}));
    }
   }
  };
  try{
   // Case 1: dragging slider and editing number box update playing preview audio volume live
   document.body.innerHTML='<main></main>';
   const main=document.querySelector('main'),toasts=[];
   const data=structuredClone(${JSON.stringify(baseSettings)});
   data.values.speech.aivisVolume=0.9;
   let previewMode='ok',rejectPreview=null;
   const api=async(name,req)=>{
    if(name==='settings_get')return data;
    if(name==='speakers_cached')return [];
    if(name==='settings_save')return {saved:true};
    if(name==='pack_status')return {packs:[]};
    if(name==='reader_message')return {replies:[{method:'v4Deliver',args:[req.message.id,{voices:[]},'']}]};
    if(name==='speech_preview'){
     if(previewMode==='fail')throw Error('ENGINE_DOWN');
     if(previewMode==='defer')return new Promise((_,rej)=>{rejectPreview=rej;});
     return {data:wavBase64};
    }
    return {};
   };
   const opts={main,api,locale:'zh',esc:String,toast:msg=>toasts.push(msg),
    heading:()=>'<div class="page-tools"></div>',text:{settings:'设置',serviceFailed:'失败'},
    isCurrent:()=>true,onSaved:async()=>{},basicSettings:()=>{},setSection:()=>{},setProfile:()=>{}};
   await renderSettings({...opts,section:'speech'});
   await tick();

   const previewBtn=main.querySelector('[data-preview]');
   const slider=main.querySelector('input[type="range"][name="aivisVolume"]');
   const num=main.querySelector('input[data-slider-number="aivisVolume"]');
   previewBtn.click();
   await tick();
   const p1=players.at(-1);
   const volStart=p1.volume;

   slider.value='0.25';
   slider.dispatchEvent(new Event('input',{bubbles:true}));
   const volAfterSlide=p1.volume;

   slider.value='0';
   slider.dispatchEvent(new Event('input',{bubbles:true}));
   const volAfterMute=p1.volume;

   num.value='0.6';
   num.dispatchEvent(new Event('change',{bubbles:true}));
   const volAfterNum=p1.volume;

   // Stop preview cleanly before next case
   previewBtn.click();
   await tick();

   // Case 2: failure while still on speech settings DOES show toast and resets button
   previewMode='fail';
   previewBtn.click();
   await tick();
   const toastsOnActiveFail=toasts.length;
   const btnTextAfterFail=previewBtn.textContent;
   const btnDisabledAfterFail=previewBtn.disabled;

   // Case 3: in-flight preview fails AFTER leaving speech settings -> no stale toast
   previewMode='defer';
   previewBtn.click();
   await tick();
   await renderSettings({...opts,section:'general'});
   await tick();
   rejectPreview(Error('ENGINE_TIMEOUT'));
   await tick();
   const toastsAfterLeaveReject=toasts.length;

   // Case 4: audio.play() interrupted by pause() on leaving speech settings -> no bogus toast
   await renderSettings({...opts,section:'speech'});
   await tick();
   previewMode='ok';
   deferPlay=true;
   main.querySelector('[data-preview]').click();
   await tick();
   await renderSettings({...opts,section:'general'});
   await tick();
   const toastsAfterLeavePlayAbort=toasts.length;

   return {
    volStart,volAfterSlide,volAfterMute,volAfterNum,
    toastsOnActiveFail,btnTextAfterFail,btnDisabledAfterFail,
    toastsAfterLeaveReject,toastsAfterLeavePlayAbort,
   };
  }finally{
   window.Audio=NativeAudio;
  }
 })()`);

 assert.equal(res.volStart,0.9);
 assert.equal(res.volAfterSlide,0.25,'dragging volume slider must update playing preview volume immediately');
 assert.equal(res.volAfterMute,0,'dragging volume slider to 0 must mute playing preview immediately');
 assert.equal(res.volAfterNum,0.6,'editing volume number box must update playing preview volume immediately');
 assert.equal(res.toastsOnActiveFail,1,'failure while still on speech settings must still show error toast');
 assert.equal(res.btnTextAfterFail,'试听');
 assert.equal(res.btnDisabledAfterFail,false);
 assert.equal(res.toastsAfterLeaveReject,1,'preview failure after leaving speech settings must not show stale toast');
 assert.equal(res.toastsAfterLeavePlayAbort,1,'play() aborted by leaving speech settings must not show bogus failure toast');
});
