// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Runtime}=require('../services/runtime.cjs');
const {Settings}=require('../services/settings.cjs');

function makeRuntime(t,speakers,v4Values={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-spk-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 if(Object.keys(v4Values).length)new Settings(root).save({scope:'speech',values:v4Values});
 const runtime=new Runtime(root);
 runtime.serviceManager={ensureSpeech:async()=>{},rememberSpeakers(){},cachedSpeakers:()=>speakers,stop:async()=>{}};
 const synthCalls=[];
 runtime.speechEngine={
  speakers:async()=>speakers,
  synthesize:async(word,options)=>{synthCalls.push({word,aivisSpeaker:options.aivisSpeaker});return {data:'UklGRg==',cached:false};}
 };
 return {runtime,synthCalls};
}

test('kana_speak picks おちつき / ノーマル for default aivisSpeaker 0 instead of leaving speaker unresolved',async t=>{
 const aivis=[
  {name:'まお',styles:[{id:888753760,name:'ささやき'},{id:888753761,name:'おちつき'},{id:888753762,name:'ノーマル'}]}
 ];
 const {runtime,synthCalls}=makeRuntime(t,aivis,{aivisSpeaker:0});
 await runtime.call({action:'kana_speak',text:'あ',reading:'あ',speaker:null,speed:0.9});
 assert.equal(synthCalls.at(-1).aivisSpeaker,888753761,'default speaker 0 must resolve to first speaker and select おちつき');

 const noCalm=[
  {name:'コハク',styles:[{id:1878365376,name:'甘々'},{id:1878365377,name:'ノーマル'}]}
 ];
 const {runtime:rt2,synthCalls:calls2}=makeRuntime(t,noCalm,{aivisSpeaker:0});
 await rt2.call({action:'kana_speak',text:'い',reading:'い',speaker:null,speed:0.9});
 assert.equal(calls2.at(-1).aivisSpeaker,1878365377,'default speaker 0 falls back to ノーマル when おちつき is absent');
});

test('kana_speak does not coerce null speaker to style id 0 on engines with id 0, while honoring explicit speaker ids',async t=>{
 const voicevox=[
  {name:'ずんだもん',styles:[{id:0,name:'あまあま'},{id:3,name:'ノーマル'}]},
  {name:'四国めたん',styles:[{id:2,name:'あまあま'},{id:6,name:'ツンツン'},{id:7,name:'おちつき'}]}
 ];
 const {runtime,synthCalls}=makeRuntime(t,voicevox,{aivisSpeaker:6});

 await runtime.call({action:'kana_speak',text:'あ',reading:'あ',speaker:null,speed:0.9});
 assert.equal(synthCalls.at(-1).aivisSpeaker,7,'speaker:null must not coerce to 0 and hijack to another character');

 await runtime.call({action:'kana_speak',text:'あ',reading:'あ',speaker:0,speed:0.9});
 assert.equal(synthCalls.at(-1).aivisSpeaker,0,'explicit numeric speaker 0 must still be honored when style 0 exists');

 await runtime.call({action:'kana_speak',text:'あ',reading:'あ',speaker:2,speed:0.9});
 assert.equal(synthCalls.at(-1).aivisSpeaker,2,'explicit non-zero speaker id must still be honored');
});
