// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('kana module does not warm up AivisSpeech in recorded-voice modes or after unmount, but still warms up in AI mode',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-warm-'));
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
  const wav='UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  const runCase=async(prefs,{start='gojuon',unmountEarly=false,unmountOnFirstSpeak=false}={})=>{
   const host=document.getElementById('host');
   host.innerHTML='';
   const calls=[];
   const api=async(action,req)=>{
    calls.push({action,req});
    if(action==='kana_progress')return {mastery:{},boxes:{},runs:[],applied:[],lessons:{},prefs};
    if(action==='kana_game_words')return {words:{}};
    if(action==='kana_speak'){
     if(unmountOnFirstSpeak){host.innerHTML='';await new Promise(r=>setTimeout(r,20));}
     return {data:wav};
    }
    return {};
   };
   await mountKana(host,{api,start});
   if(unmountEarly)host.innerHTML='';
   await new Promise(r=>setTimeout(r,450));
   return calls.filter(c=>c.action==='kana_speak').map(c=>c.req.text);
  };
  const femaleDefault=await runCase({volume:0.4});
  const maleVoice=await runCase({volume:0.4,voice:'male'});
  const aiUnmounted=await runCase({volume:0.4,voice:'ai'},{start:'index',unmountEarly:true});
  const aiPrefetchAborted=await runCase({volume:0.4,voice:'ai'},{start:'gojuon',unmountOnFirstSpeak:true});
  const aiVoice=await runCase({volume:0.4,voice:'ai'},{start:'index'});
  return {femaleDefault,maleVoice,aiUnmounted,aiPrefetchAborted,aiVoice};
 })()`);

 assert.deepEqual(out.femaleDefault,[],'default female recorded voice must not trigger kana_speak warmup');
 assert.deepEqual(out.maleVoice,[],'male recorded voice must not trigger kana_speak warmup');
 assert.deepEqual(out.aiUnmounted,[],'leaving kana page before warmup timer fires must not trigger kana_speak');
 assert.equal(out.aiPrefetchAborted.length,1,'prefetch loop must stop after kana page unmounts');
 assert.deepEqual(out.aiVoice,['あ'],'AI voice mode still warms up AivisSpeech');
});
