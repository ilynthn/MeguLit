// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const {Runtime}=require('../services/runtime.cjs');
const {Reader}=require('../services/reader.cjs');
const {Settings}=require('../services/settings.cjs');
const settingsReset=require('../services/settings-reset.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('Runtime.settingsSaved emits restoreV4Config after speech, anki, and reset saves',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-v4-sync-rt-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const events=[],gameAudio=[],sent=[];
 const runtime=new Runtime(root,(type,data)=>{if(type==='reader-event')events.push(data);});
 runtime.reader={gal:{styleSync:{profileKey:''},preferences:{},preview(){},send:m=>sent.push(m),setGameAudio:v=>gameAudio.push(v)},prefs:()=>({}),sendDialogConfig:Reader.prototype.sendDialogConfig};
 const settings=new Settings(root);

 settings.save({scope:'speech',values:{aivisVolume:0.25,aivisAutoSpeak:true,aivisSpeaker:888753761,aivisSpeed:1.25}});
 await runtime.settingsSaved({scope:'speech',values:{aivisVolume:0.25,aivisAutoSpeak:true,aivisSpeaker:888753761,aivisSpeed:1.25}});
 const afterSpeech=events.filter(e=>e.type==='call'&&e.method==='restoreV4Config').at(-1);
 assert.ok(afterSpeech,'settingsSaved must emit restoreV4Config for speech changes');
 assert.equal(afterSpeech.args[0].aivisVolume,0.25);
 assert.equal(afterSpeech.args[0].aivisAutoSpeak,true);
 assert.equal(afterSpeech.args[0].aivisSpeaker,888753761);
 assert.equal(afterSpeech.args[0].aivisSpeed,1.25);

 settings.save({scope:'anki',values:{ankiGameMedia:false,ankiDeck:'CustomDeck'}});
 await runtime.settingsSaved({scope:'anki',values:{ankiGameMedia:false,ankiDeck:'CustomDeck'}});
 const afterAnki=events.filter(e=>e.type==='call'&&e.method==='restoreV4Config').at(-1);
 assert.equal(afterAnki.args[0].ankiGameMedia,false);
 assert.equal(afterAnki.args[0].ankiDeck,'CustomDeck');
 assert.equal(gameAudio.at(-1),false);

 settings.save({scope:'immersion',values:{immersion:true,dialogDetection:'visual'}});
 await runtime.settingsSaved({scope:'immersion',values:{immersion:true,dialogDetection:'visual'}});
 assert.deepEqual(sent.at(-1),{type:'dialogConfig',scene:true,auto:true,active:true,marker:false});

 settings.save({scope:'immersion',values:{immersion:false,dialogDetection:'visual'}});
 await runtime.settingsSaved({scope:'immersion',values:{immersion:false,dialogDetection:'visual'}});
 assert.deepEqual(sent.at(-1),{type:'dialogConfig',scene:false,auto:false,active:false,marker:false});

 settingsReset.reset(root);
 await runtime.settingsSaved({scope:'text'});
 const afterReset=events.filter(e=>e.type==='call'&&e.method==='restoreV4Config').at(-1);
 assert.equal(afterReset.args[0].aivisVolume,0.9);
 assert.equal(afterReset.args[0].aivisAutoSpeak,false);
 assert.equal(afterReset.args[0].ankiGameMedia,true);
 assert.deepEqual(sent.at(-1),{type:'dialogConfig',scene:true,auto:true,active:false,marker:true});
});

test('v4.js live-syncs restoreV4Config to lookup audio, auto-speak, precapture, and open Alt+T panel without stale overwrite',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-v4-sync-edge-'));
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
  document.body.innerHTML='';
  const wav='UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  const speakers=[
   {name:'まお',styles:[{id:888753760,name:'ノーマル'},{id:888753761,name:'上機嫌'}]},
   {name:'コハク',styles:[{id:1878365376,name:'ノーマル'},{id:1878365377,name:'あまあま'}]},
  ];
  const played=[],configured=[],sent=[];
  window.Audio=class FakeAudio extends EventTarget{
   constructor(src){super();this.src=src;this.volume=1;played.push(this);}
   play(){this.volumeAtPlay=this.volume;return Promise.resolve();}
   pause(){this.paused=true;}
  };
  let loadReqId=null,speakCount=0;
  window.__tomoyoChinese={galStatus(){}};
  window.__tomoyoTranslateRequest=raw=>{
   const m=JSON.parse(raw);sent.push(m);
   if(m.type!=='v4')return;
   if(m.action==='load'){loadReqId=m.id;return;}
   if(m.action==='speakersCached'){setTimeout(()=>window.__tomoyoChinese.v4Deliver(m.id,speakers,''),0);return;}
   if(m.action==='voicePackStatus'){setTimeout(()=>window.__tomoyoChinese.v4Deliver(m.id,{voices:[]},''),0);return;}
   if(m.action==='configure'){configured.push(m.args);setTimeout(()=>window.__tomoyoChinese.v4Deliver(m.id,{...m.args},''),0);return;}
   if(m.action==='word'){setTimeout(()=>window.__tomoyoChinese.v4Deliver(m.id,{surface:m.args.text,reading:'テスト',pitch:[0],pitchSource:'dict'},''),0);return;}
   if(m.action==='speak'){speakCount++;setTimeout(()=>window.__tomoyoChinese.v4Deliver(m.id,{data:wav,cached:false},''),0);return;}
   if(m.action==='prefetch'){setTimeout(()=>window.__tomoyoChinese.v4Deliver(m.id,{ready:true},''),0);return;}
   if(m.action==='ankiScreenshot'){setTimeout(()=>window.__tomoyoChinese.v4Deliver(m.id,{id:'shot-1'},''),0);return;}
  };
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s);});
  // Mount learning panel BEFORE load resolves to exercise the initial mount/load race
  const host=document.createElement('div');host.className='tomoyo-learning-panel';document.body.append(host);
  await loadScript('/reader/modules/v4.js');
  await loadScript('/reader/modules/voice-layout.js');
  const tick=(ms=30)=>new Promise(r=>setTimeout(r,ms));
  await tick();

  // Resolve initial load AFTER panel was already mounted
  window.__tomoyoChinese.v4Deliver(loadReqId,{
   aivisUrl:'http://127.0.0.1:10101',aivisSpeaker:888753761,aivisVolume:0.4,aivisSpeed:1.1,
   aivisGpu:true,aivisAutoSpeak:false,ankiUrl:'http://127.0.0.1:8765',ankiDeck:'DeckA',ankiModel:'MeguLit',
   ankiPath:'',ankiAudio:true,ankiGameMedia:true,ankiVoiceIsolate:true,immersion:true,dialogDetection:'marker'
  },'');
  await tick();
  const field=k=>host.querySelector('[data-v4-key="'+k+'"]');
  const spkSelects=()=>host.querySelectorAll('.tome-speaker-select');
  const afterLoad={
   volume:Number(field('aivisVolume').value),
   volumeOut:field('aivisVolume').closest('label').querySelector('output').textContent,
   speed:Number(field('aivisSpeed').value),
   speedOut:field('aivisSpeed').closest('label').querySelector('output').textContent,
   speakerVal:field('aivisSpeaker').value,
   speakerSelect:spkSelects()[0].value,
   styleSelect:spkSelects()[1].value,
   autoSpeak:field('aivisAutoSpeak').checked,
   deck:field('ankiDeck').value,
  };

  // Helper to open a lookup card
  const openCard=text=>{
   const card=document.createElement('div');card.className='tomoyo-selection-card';
   card.innerHTML='<header><span>词典</span></header><div class="tomoyo-word-heading"><strong>'+text+'</strong></div><footer></footer>';
   document.body.append(card);
   window.__tomoyoChinese.decorateWordActions(card,{text,start:0,end:text.length},{entries:[{id:1}]});
   return card;
  };

  // Start playback on card 1 (volume 0.4, autoSpeak false)
  const card1=openCard('朝');
  await tick();
  const autoSpokeWhenOff=speakCount;
  card1.querySelector('.tomoyo-speak-button').click();
  await tick();
  const firstAudio=played.at(-1);
  const volBeforePush=firstAudio.volumeAtPlay;

  // Simulate Home Settings save pushed via restoreV4Config
  const hasMethod=typeof window.__tomoyoChinese.restoreV4Config==='function';
  if(hasMethod){
   window.__tomoyoChinese.restoreV4Config({
    aivisUrl:'http://127.0.0.1:10101',aivisSpeaker:1878365377,aivisVolume:0.15,aivisSpeed:1.3,
    aivisGpu:false,aivisAutoSpeak:true,ankiUrl:'http://127.0.0.1:8765',ankiDeck:'DeckB',ankiModel:'MeguLit',
    ankiPath:'',ankiAudio:true,ankiGameMedia:false,ankiVoiceIsolate:true,immersion:true,dialogDetection:'visual'
   });
  }
  await tick();
  const liveAudioVolume=firstAudio.volume;
  const afterPush={
   volume:Number(field('aivisVolume').value),
   volumeOut:field('aivisVolume').closest('label').querySelector('output').textContent,
   speed:Number(field('aivisSpeed').value),
   speedOut:field('aivisSpeed').closest('label').querySelector('output').textContent,
   speakerVal:field('aivisSpeaker').value,
   speakerSelect:spkSelects()[0].value,
   styleSelect:spkSelects()[1].value,
   speakerOptions:spkSelects()[0].options.length,
   autoSpeak:field('aivisAutoSpeak').checked,
   deck:field('ankiDeck').value,
   edgeHidden:host.querySelector('.tome-imm-edge').hidden,
   precaptureNull:window.__tomoyoChinese.precaptureReader()===null,
  };

  // Open card 2: autoSpeak is now true so it should speak automatically at volume 0.15
  card1.remove();
  const speakBeforeCard2=speakCount;
  openCard('夜');
  await tick(60);
  const autoSpokeWhenOn=speakCount-speakBeforeCard2;
  const secondAudioVol=played.at(-1)?.volumeAtPlay;

  // Toggle autoSpeak and drag volume in Alt+T: must NOT clobber unsaved edits in other fields,
  // and must preserve DeckB and speaker 1878365377 in the configure payload
  spkSelects()[0].value='0';spkSelects()[0].dispatchEvent(new Event('change'));
  field('aivisSpeed').value='1.35';
  field('ankiDeck').value='UnsavedDeck';
  field('aivisAutoSpeak').checked=false;
  field('aivisAutoSpeak').dispatchEvent(new Event('change'));
  await tick();
  const savedAfterToggle=configured.at(-1);
  const unsavedAfterToggle={speaker:spkSelects()[0].value,style:spkSelects()[1].value,spkVal:field('aivisSpeaker').value,speed:field('aivisSpeed').value,deck:field('ankiDeck').value};

  field('aivisVolume').value='0.5';
  field('aivisVolume').dispatchEvent(new Event('input'));
  field('aivisVolume').dispatchEvent(new Event('change'));
  // Drag again while previous configure is in flight: stale response must not pull back slider or volume
  field('aivisVolume').value='0.2';
  field('aivisVolume').dispatchEvent(new Event('input'));
  await tick();
  const unsavedAfterVolume={speaker:spkSelects()[0].value,style:spkSelects()[1].value,speed:field('aivisSpeed').value,deck:field('ankiDeck').value,slider:Number(field('aivisVolume').value),liveVol:played.at(-1).volume};

  // Unknown speaker ID followed by known speaker ID: synthetic "ID ..." entry must not linger
  window.__tomoyoChinese.restoreV4Config({aivisSpeaker:777777});
  await tick();
  const withUnknown=spkSelects()[0].options.length;
  window.__tomoyoChinese.restoreV4Config({aivisSpeaker:888753760});
  await tick();
  const afterBackToKnown={options:spkSelects()[0].options.length,speaker:spkSelects()[0].value,style:spkSelects()[1].value};

  // Non-step volume (0.33) synced from config must not be rounded back into config by the 0.05-step slider
  window.__tomoyoChinese.restoreV4Config({aivisVolume:0.33});
  await tick();
  const preciseVol=played.at(-1).volume;

  return {hasMethod,afterLoad,autoSpokeWhenOff,volBeforePush,liveAudioVolume,afterPush,autoSpokeWhenOn,secondAudioVol,savedAfterToggle,unsavedAfterToggle,unsavedAfterVolume,withUnknown,afterBackToKnown,preciseVol};
 })()`);

 assert.equal(out.hasMethod,true,'bridge must expose restoreV4Config');
 assert.equal(out.afterLoad.volume,0.4);
 assert.equal(out.afterLoad.volumeOut,'40%');
 assert.equal(out.afterLoad.speed,1.1);
 assert.equal(out.afterLoad.speedOut,'1.10×');
 assert.equal(out.afterLoad.speakerVal,'888753761');
 assert.equal(out.afterLoad.speakerSelect,'0');
 assert.equal(out.afterLoad.styleSelect,'888753761');
 assert.equal(out.afterLoad.deck,'DeckA');

 assert.equal(out.autoSpokeWhenOff,0);
 assert.equal(out.volBeforePush,0.4);
 assert.equal(out.liveAudioVolume,0.15,'active playback volume must update immediately');

 assert.equal(out.afterPush.volume,0.15);
 assert.equal(out.afterPush.volumeOut,'15%');
 assert.equal(out.afterPush.speed,1.3);
 assert.equal(out.afterPush.speedOut,'1.30×');
 assert.equal(out.afterPush.speakerVal,'1878365377');
 assert.equal(out.afterPush.speakerSelect,'1');
 assert.equal(out.afterPush.styleSelect,'1878365377');
 assert.equal(out.afterPush.speakerOptions,2,'must not append duplicate ghost speaker entries');
 assert.equal(out.afterPush.autoSpeak,true);
 assert.equal(out.afterPush.deck,'DeckB');
 assert.equal(out.afterPush.edgeHidden,false,'visual detection mode shows edge calibration section');
 assert.equal(out.afterPush.precaptureNull,true,'ankiGameMedia:false disables precapture immediately');

 assert.equal(out.autoSpokeWhenOn,1,'autoSpeak enabled from Home Settings triggers on next lookup');
 assert.equal(out.secondAudioVol,0.15,'next lookup speaks at updated volume');
 assert.equal(out.savedAfterToggle.aivisAutoSpeak,false);
 assert.equal(out.savedAfterToggle.aivisSpeaker,1878365377,'Alt+T save must not overwrite Home Settings speaker');
 assert.equal(out.savedAfterToggle.ankiDeck,'DeckB','Alt+T save must not overwrite Home Settings deck');
 assert.deepEqual(out.unsavedAfterToggle,{speaker:'0',style:'888753760',spkVal:'888753760',speed:'1.35',deck:'UnsavedDeck'},'toggling autoSpeak must not clobber unsaved edits in Alt+T');
 assert.deepEqual(out.unsavedAfterVolume,{speaker:'0',style:'888753760',speed:'1.35',deck:'UnsavedDeck',slider:0.2,liveVol:0.2},'dragging volume must not clobber unsaved edits or snap back on configure response');
 assert.equal(out.withUnknown,3);
 assert.deepEqual(out.afterBackToKnown,{options:2,speaker:'0',style:'888753760'});
 assert.equal(out.preciseVol,0.33,'syncing range slider must not round in-memory config.aivisVolume');
});

test('v4.js handles empty speaker cache sync/reset, ignores invalid restoreV4Config, and blocks stale initial load',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-v4-sync-race-'));
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
  document.body.innerHTML='';
  let loadReqId=null;
  window.__tomoyoChinese={galStatus(){}};
  window.__tomoyoTranslateRequest=raw=>{
   const m=JSON.parse(raw);if(m.type!=='v4')return;
   if(m.action==='load'){loadReqId=m.id;return;}
   if(m.action==='speakersCached'){setTimeout(()=>window.__tomoyoChinese.v4Deliver(m.id,[],''),0);return;}
   if(m.action==='voicePackStatus'){setTimeout(()=>window.__tomoyoChinese.v4Deliver(m.id,{voices:[]},''),0);return;}
  };
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s);});
  await loadScript('/reader/modules/v4.js');
  const tick=(ms=30)=>new Promise(r=>setTimeout(r,ms));
  await tick();

  // Invalid restoreV4Config(null)/([]) must NOT increment version or block initial load
  window.__tomoyoChinese.restoreV4Config(null);
  window.__tomoyoChinese.restoreV4Config([]);
  window.__tomoyoChinese.v4Deliver(loadReqId,{aivisSpeaker:888753761,aivisVolume:0.35,ankiDeck:'LoadedDeck'},'');
  await tick();
  // Open Alt+T panel with empty speaker cache: non-zero saved speaker renders synthetic "ID 888753761" dropdown
  const host=document.createElement('div');host.className='tomoyo-learning-panel';document.body.append(host);
  await tick();
  const field=k=>host.querySelector('[data-v4-key="'+k+'"]');
  const spkSelects=()=>host.querySelectorAll('.tome-speaker-select');
  const detection=host.querySelector('.tomoyo-v4-immersion select');
  const afterLoad={
   speakerVal:field('aivisSpeaker').value,
   spkHidden:field('aivisSpeaker').hidden,
   selHidden:spkSelects()[1].hidden,
   selValue:spkSelects()[1].value,
   volume:Number(field('aivisVolume').value),
   deck:field('ankiDeck').value,
  };

  // With empty cached speaker list, Home Settings changes speaker ID -> synthetic select updates
  window.__tomoyoChinese.restoreV4Config({aivisSpeaker:1878365377,ankiDeck:'NewDeck'});
  await tick();
  const afterChange={
   speakerVal:field('aivisSpeaker').value,
   selHidden:spkSelects()[1].hidden,
   selValue:spkSelects()[1].value,
   defaults:{speed:Number(field('aivisSpeed').value),volume:Number(field('aivisVolume').value),detection:detection.value},
  };

  // Reset to aivisSpeaker: 0 with empty speaker list -> falls back to bare ID input keeping '0' (not '')
  window.__tomoyoChinese.restoreV4Config({aivisSpeaker:0,aivisVolume:undefined,aivisSpeed:undefined,dialogDetection:undefined});
  await tick();
  const afterResetToZero={
   speakerVal:field('aivisSpeaker').value,
   spkHidden:field('aivisSpeaker').hidden,
   selHidden:spkSelects()[1].hidden,
   speed:Number(field('aivisSpeed').value),
   volume:Number(field('aivisVolume').value),
   detection:detection.value,
  };
  return {afterLoad,afterChange,afterResetToZero};
 })()`);

 assert.deepEqual(out.afterLoad,{speakerVal:'888753761',spkHidden:true,selHidden:false,selValue:'888753761',volume:0.35,deck:'LoadedDeck'});
 assert.deepEqual(out.afterChange,{speakerVal:'1878365377',selHidden:false,selValue:'1878365377',defaults:{speed:1,volume:0.35,detection:'marker'}});
 assert.deepEqual(out.afterResetToZero,{speakerVal:'0',spkHidden:false,selHidden:true,speed:1,volume:0.9,detection:'marker'});
});

test('v4.js ignores stale initial load arriving after valid restoreV4Config',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-v4-sync-stale-'));
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
  document.body.innerHTML='';
  let loadReqId=null;
  window.__tomoyoChinese={galStatus(){}};
  window.__tomoyoTranslateRequest=raw=>{
   const m=JSON.parse(raw);if(m.type!=='v4')return;
   if(m.action==='load'){loadReqId=m.id;return;}
   if(m.action==='speakersCached'){setTimeout(()=>window.__tomoyoChinese.v4Deliver(m.id,[],''),0);return;}
   if(m.action==='voicePackStatus'){setTimeout(()=>window.__tomoyoChinese.v4Deliver(m.id,{voices:[]},''),0);return;}
  };
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s);});
  const host=document.createElement('div');host.className='tomoyo-learning-panel';document.body.append(host);
  await loadScript('/reader/modules/v4.js');
  const tick=(ms=30)=>new Promise(r=>setTimeout(r,ms));
  await tick();

  window.__tomoyoChinese.restoreV4Config({aivisSpeaker:123456,aivisVolume:0.2,ankiDeck:'NewDeck'});
  await tick();
  window.__tomoyoChinese.v4Deliver(loadReqId,{aivisSpeaker:0,aivisVolume:0.9,ankiDeck:'OldDeck'},'');
  await tick();
  const field=k=>host.querySelector('[data-v4-key="'+k+'"]');
  return {speaker:field('aivisSpeaker').value,volume:Number(field('aivisVolume').value),deck:field('ankiDeck').value};
 })()`);

 assert.deepEqual(out,{speaker:'123456',volume:0.2,deck:'NewDeck'});
});
