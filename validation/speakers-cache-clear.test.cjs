// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Services}=require('../core/services.cjs');
const {Runtime}=require('../services/runtime.cjs');

test('rememberSpeakers clears stale speakers.json when engine reports empty list, while ignoring non-array and HTTP errors',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-spk-clear-'));
 fs.mkdirSync(path.join(root,'logs'),{recursive:true});
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));

 const mao=[{name:'まお',styles:[{id:888753760,name:'ノーマル'}]}];
 const services=new Services(root,{
  fetch:async(url)=>{
   if(url.endsWith('/version'))return {ok:true,status:200};
   if(url.endsWith('/speakers'))return {ok:false,status:500,json:async()=>[]};
   return {ok:true,status:200};
  }
 });

 // 1. Non-empty list is cached; non-array values do not overwrite it
 services.rememberSpeakers(mao);
 assert.deepEqual(services.cachedSpeakers(),mao);
 services.rememberSpeakers(null);
 services.rememberSpeakers({error:'bad'});
 assert.deepEqual(services.cachedSpeakers(),mao,'non-array input must not clobber cached speakers');

 // 2. HTTP 500 from /speakers during gameEvent warmup must not wipe cached speakers
 await services.gameEvent({type:'bound',gameProcessId:1234,gameStarted:'t1'},{aivisUrl:'http://127.0.0.1:10101',aivisGpu:false,aivisSpeaker:0});
 assert.deepEqual(services.cachedSpeakers(),mao,'HTTP error from /speakers must preserve existing speakers cache');

 // 3. Empty array [] (e.g., last voice pack removed) MUST clear cache/speakers.json
 services.rememberSpeakers([]);
 assert.deepEqual(services.cachedSpeakers(),[],'empty speakers list must clear stale cached speakers');

 // 4. End-to-end Runtime speakers -> speakers_cached reflects deletion of last voice pack
 const runtime=new Runtime(root);
 runtime.services().ensureSpeech=async()=>{};
 let current=mao;
 runtime.speech().fetch=async()=>({ok:true,status:200,json:async()=>current});
 assert.deepEqual(await runtime.call({action:'speakers'}),mao);
 assert.deepEqual(await runtime.call({action:'speakers_cached'}),mao);
 current=[];
 assert.deepEqual(await runtime.call({action:'speakers'}),[]);
 assert.deepEqual(await runtime.call({action:'speakers_cached'}),[],'speakers_cached must be empty after last voice is removed');
});
