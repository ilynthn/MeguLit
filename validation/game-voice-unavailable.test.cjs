// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-28 (owner: 点原声还是不发音). The voice index keeps every game it scanned. On the reporting machine 30 of them had
   since been uninstalled or moved (the folder gone, or left with a launcher and a log: ATRI, 9-nine-, 沙耶の唄, STEINS;GATE 0),
   yet every line of theirs was labelled 「原声」; a click found no clip, fell back to synthesis, and with the speech engine
   down nothing played and nothing said why. These tests scan a small game of their own, then take it away. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

// A tiny Ogg page header: enough for game-voice kind() (the bytes are never decoded here).
const OGG=Buffer.concat([Buffer.from('OggS'),Buffer.alloc(60,1)]);
const LINE='「今日は星が綺麗だね」',OTHER='「明日もきっと晴れるよ」';

function rig(t){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-gv-gone-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const root=path.join(temp,'app'),game=path.join(temp,'game');fs.mkdirSync(path.join(root,'logs'),{recursive:true});
 fs.mkdirSync(path.join(game,'voice'),{recursive:true});fs.writeFileSync(path.join(game,'voice','v001.ogg'),OGG);fs.writeFileSync(path.join(game,'voice','v002.ogg'),OGG);
 const gv=require('../services/game-voice.cjs');gv._reset();
 const r=gv.scan(root,game,{engine:'kirikiri',scenes:[{lines:[LINE,OTHER],voices:['v001','v002']}]});
 assert.equal(r.found,2);
 return {root,game,gv,slv:require('../services/saved-line-voice.cjs')};
}
// The game uninstalled the way Steam leaves it: the folder kept, the game files gone. A new app session (catalog cache empty).
function uninstall(game,gv){fs.rmSync(path.join(game,'voice'),{recursive:true,force:true});fs.writeFileSync(path.join(game,'steam_appid.txt'),'1');gv._reset();}

test('a line of an installed game is 原声 and plays its clip',t=>{
 const {root,gv,slv}=rig(t);
 assert.deepEqual(slv.has(root,[{text:LINE}]),[true]);assert.equal(gv.has(root,LINE),true);
 assert.equal(gv.find(root,LINE).mime,'audio/ogg');
});

test('game uninstalled (folder left with a stub): not 原声, and the reason is GAME_VOICE_GONE',t=>{
 const {root,game,gv,slv}=rig(t);uninstall(game,gv);
 assert.equal(gv.has(root,LINE),false,'the label must not promise a voice that cannot play');
 assert.deepEqual(slv.states(root,[{text:LINE},{text:'「索引にない台詞」'}]),['GAME_VOICE_GONE',null]);
 assert.equal(slv.why(root,{text:LINE}),'GAME_VOICE_GONE');
 assert.equal(slv.why(root,{text:'「索引にない台詞」'}),null,'a line with no known game voice has nothing to explain');
});

test('game folder moved away entirely: GAME_VOICE_GONE',t=>{
 const {root,game,gv,slv}=rig(t);fs.rmSync(game,{recursive:true,force:true});gv._reset();
 assert.deepEqual(slv.has(root,[{text:LINE}]),[false]);assert.equal(slv.why(root,{text:LINE}),'GAME_VOICE_GONE');
});

test('a clip played once is cached and still plays after the game is gone',t=>{
 const {root,game,gv,slv}=rig(t);assert.ok(gv.find(root,LINE));uninstall(game,gv);
 assert.deepEqual(slv.has(root,[{text:LINE},{text:OTHER}]),[true,false]);assert.equal(slv.why(root,{text:OTHER}),'GAME_VOICE_GONE');
 assert.equal(gv.find(root,LINE).mime,'audio/ogg');
});

test('sentence_voice: a gone game voice is read aloud instead and says why; with the speech engine down too, the reason is the error',async t=>{
 const {root,game,gv}=rig(t);uninstall(game,gv);
 const {Runtime}=require('../services/runtime.cjs');
 const wav=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVE'),Buffer.alloc(36)]);
 const up=new Runtime(root);up.services().ensureSpeech=async()=>{};
 up.speech().fetch=async url=>{const p=new URL(url).pathname;if(p==='/speakers')return {ok:true,json:async()=>[{name:'まお',styles:[{id:1,name:'ノーマル'}]}]};
  if(p==='/audio_query')return {ok:true,json:async()=>({accent_phrases:[]})};if(p==='/synthesis')return {ok:true,arrayBuffer:async()=>wav};throw Error('unexpected '+url);};
 const spoken=await up.call({action:'sentence_voice',text:LINE});
 assert.equal(spoken.source,'synthesized');assert.equal(spoken.gameVoice,'GAME_VOICE_GONE');
 assert.match(fs.readFileSync(path.join(root,'logs','speech-engine.log'),'utf8'),/game voice unavailable: GAME_VOICE_GONE/);
 const down=new Runtime(root);down.services().ensureSpeech=async()=>{throw Error('AivisSpeech 尚未就绪，首次启动可能需要下载模型，请查看 speech-engine.log');};
 await assert.rejects(down.call({action:'sentence_voice',text:OTHER}),{message:'GAME_VOICE_GONE'});
 const has=await down.call({action:'sentence_voice_has',items:[{text:LINE},{text:'「索引にない台詞」'}]});
 assert.deepEqual(has,{has:[false,false],why:['GAME_VOICE_GONE',null]});
});

const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));
test('the button marks a gone game voice before the click, and greys out with the reason when nothing can play',{skip:!hasEdge},async t=>{
 const {startEdge,startWeb}=require('./library-views-perf.cjs');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-gv-gone-page-'));let server,browser;
 t.after(async()=>{await browser?.stop();server?.close();await fs.promises.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:150});});
 server=await startWeb();browser=await startEdge(path.join(temp,'edge'));
 await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/index.html'});
 const out=await browser.evaluate(`(async()=>{
  document.documentElement.lang='zh-CN';document.body.innerHTML='<button id="a">朗读</button><button id="b">朗读</button><button id="c">朗读</button>';
  window.Audio=class{constructor(){this.volume=1;}addEventListener(){}pause(){}play(){window.played=(window.played||0)+1;return Promise.resolve();}};
  const {labelVoices,playSentence}=await import('/sentence-voice.js'),a=document.getElementById('a'),b=document.getElementById('b'),c=document.getElementById('c');
  await labelVoices(async()=>({has:[false,true],why:['GAME_VOICE_GONE',null]}),[{button:a,text:'x'},{button:b,text:'y'}]);
  const before={a:a.textContent,aTitle:a.title,aLost:!!a.querySelector('.cv-lost'),b:b.textContent,bLost:!!b.querySelector('.cv-lost')};
  const wav=btoa(String.fromCharCode(...new Uint8Array(48)));
  const spoken=await playSentence(async()=>({data:wav,mime:'audio/wav',source:'synthesized',gameVoice:'GAME_VOICE_GONE'}),'x',a);
  const afterSpoken={grey:a.classList.contains('is-voice-unavailable'),lost:!!a.querySelector('.cv-lost'),played:window.played};
  let message='';try{await playSentence(async()=>{throw 'GAME_VOICE_GONE';},'z',c);}catch(e){message=e.userMessage||'';}
  const failed={grey:c.classList.contains('is-voice-unavailable'),title:c.title,message};
  return {before,spoken,afterSpoken,failed};
 })()`);
 assert.equal(out.before.a,'朗读原声');assert.equal(out.before.aLost,true);assert.match(out.before.aTitle,/游戏已被删除或移动/);
 assert.equal(out.before.b,'原声');assert.equal(out.before.bLost,false);
 assert.equal(out.spoken,'synthesized');assert.equal(out.afterSpoken.played,1);assert.equal(out.afterSpoken.grey,false,'it still read the line aloud');
 assert.equal(out.failed.grey,true);assert.match(out.failed.title,/游戏已被删除或移动/);assert.match(out.failed.message,/游戏已被删除或移动.*合成朗读也没能播放/);
});
