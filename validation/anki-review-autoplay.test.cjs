'use strict';
/* 2026-11-12 regression: a half-applied patch left frame() reading `auto` that was never declared, so every Anki review
   and practice card threw and showed "Anki 暂时无法完成此操作" for every user. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('Anki review: the auto-play setting the card frame reads is declared and mounted',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','anki-review.js'),'utf8');
 assert.match(src,/let auto=\{flip:'off',next:'off'\}/);assert.match(src,/function mountAutoplay\(toolbar\)/);assert.match(src,/mountAutoplay\(toolbar\)/);
 assert.ok(src.indexOf('let auto=')<src.indexOf('function frame('),'declared before the frame uses it');
});

function runAutoplay(tracksSpec,mode){
 const vm=require('node:vm');
 const handlers={},played=[],timers=[];
 const audios=tracksSpec.map(({name,channel})=>{
  const listeners={};
  const button={setAttribute(){}};
  const audio={
   name,hidden:false,controls:true,currentTime:0,volume:1,
   dataset:channel!==undefined?{ankiChannel:channel}:{},
   parentElement:{querySelector:s=>s==='[data-anki-play]'?button:null},
   addEventListener(ev,fn){(listeners[ev]??=[]).push(fn);},
   pause(){},
   play(){played.push(name);const cbs=listeners.ended?.splice(0)||[];return Promise.resolve().then(()=>{for(const fn of cbs)fn();});}
  };
  return audio;
 });
 const root={
  style:{setProperty(){}},classList:{add(){},remove(){}},
  replaceChildren(){},querySelector:()=>null,
  querySelectorAll:s=>s==='audio'||s==='audio[src]'?audios:[],
  addEventListener(){}
 };
 const document={
  querySelector:s=>s==='#card-content'?root:s==='#card-viewport'?{scrollTop:0}:s==='#card-stage'?{}:{hidden:true},
  createElement:()=>({content:{querySelectorAll:()=>[]}})
 };
 const parent={postMessage(){}};
 const context={
  document,parent,location:{hash:'#auto-1'},
  addEventListener:(name,fn)=>handlers[name]=fn,
  requestAnimationFrame(){},ResizeObserver:class{observe(){}},
  setTimeout:fn=>{timers.push(fn);return timers.length;},
  clearTimeout(){}
 };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/anki-card.js'),'utf8'),context);
 handlers.message({source:parent,data:{type:'tome-anki-card',nonce:'auto-1',html:'<div>card</div>',auto:mode}});
 return async()=>{
  for(let step=0;step<20&&(timers.length);step++){
   const fn=timers.shift();
   fn();
   await Promise.resolve();
   await Promise.resolve();
  }
  return played;
 };
}

test('autoplay plays untagged non-MeguLit card audio while preserving MeguLit channel filtering',async()=>{
 // Non-MeguLit deck (e.g. Core 2k / Kaishi): tracks have empty data-anki-channel="".
 const nonMegu=[{name:'core_word.mp3',channel:''},{name:'core_sent.mp3',channel:''}];
 assert.deepEqual(await runAutoplay(nonMegu,'off')(),[]);
 assert.deepEqual(await runAutoplay(nonMegu,'word')(),['core_word.mp3','core_sent.mp3']);
 assert.deepEqual(await runAutoplay(nonMegu,'sentence')(),['core_word.mp3','core_sent.mp3']);
 assert.deepEqual(await runAutoplay(nonMegu,'both')(),['core_word.mp3','core_sent.mp3']);

 // MeguLit deck: channel selection must stay exact.
 const megu=[{name:'game.wav',channel:'game'},{name:'word.wav',channel:'word'}];
 assert.deepEqual(await runAutoplay(megu,'word')(),['word.wav']);
 assert.deepEqual(await runAutoplay(megu,'sentence')(),['game.wav']);
 assert.deepEqual(await runAutoplay(megu,'both')(),['word.wav','game.wav']);

 // MeguLit card with ONLY a game/sentence clip must stay silent when auto-play is set to 'word'.
 assert.deepEqual(await runAutoplay([{name:'game.wav',channel:'game'}],'word')(),[]);

 // Mixed card (MeguLit word + custom untagged clip): 'word' plays only word; 'both' plays word then untagged.
 const mixed=[{name:'extra.mp3',channel:''},{name:'word.wav',channel:'word'}];
 assert.deepEqual(await runAutoplay(mixed,'word')(),['word.wav']);
 assert.deepEqual(await runAutoplay(mixed,'both')(),['word.wav','extra.mp3']);
});
