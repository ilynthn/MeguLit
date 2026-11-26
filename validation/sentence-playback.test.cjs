'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');

function installStrictAudio(t,onPlay=async()=>{}){
 const clips=[],revoked=[];let nextURL=0;
 class FakeAudio extends EventTarget{
  constructor(src){super();this._volume=1;this.src=src;clips.push(this);}
  get volume(){return this._volume;}
  set volume(v){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)throw new RangeError('IndexSizeError: volume out of range');this._volume=v;}
  async play(){this.volumeAtPlay=this._volume;this.played=true;await onPlay(this);}
  pause(){this.paused=true;}
 }
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Audio');
 Object.defineProperty(globalThis,'Audio',{value:FakeAudio,configurable:true});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'Audio',previous);else delete globalThis.Audio;});
 t.mock.method(URL,'createObjectURL',()=>`blob:clip-${nextURL++}`);
 t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
 return {clips,revoked};
}

test('the latest sentence click owns playback and releases its audio URL',async t=>{
 const {playSentence}=await import('../web/sentence-voice.js');
 const clips=[],revoked=[];
 let nextURL=0,play=async()=>{};
 const audio=class extends EventTarget{
  constructor(src){super();this.src=src;clips.push(this);}
  async play(){this.played=true;await play();}
  pause(){this.paused=true;}
 };
 const previous=Object.getOwnPropertyDescriptor(globalThis,'Audio');
 Object.defineProperty(globalThis,'Audio',{value:audio,configurable:true});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'Audio',previous);else delete globalThis.Audio;});
 t.mock.method(URL,'createObjectURL',()=>`blob:clip-${nextURL++}`);
 t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
 const response={data:'AA==',source:'game'};
 let finish;
 const first=playSentence(()=>new Promise(resolve=>{finish=resolve;}),'first');
 await playSentence(async()=>response,'second');
 finish(response);await first;
 assert.equal(clips.length,1);
 assert.equal(clips[0].src,'blob:clip-0');
 assert.ok(clips[0].played);
 assert.ok(!clips[0].paused);
 await playSentence(async()=>response,'third');
 assert.ok(clips[0].paused);
 assert.deepEqual(revoked,['blob:clip-0']);
 clips[1].dispatchEvent(new Event('ended'));
 assert.deepEqual(revoked,['blob:clip-0','blob:clip-1']);
 let rejectPlay;
 play=()=>new Promise((_,reject)=>{rejectPlay=reject;});
 const interrupted=playSentence(async()=>response,'fourth');
 await new Promise(resolve=>setImmediate(resolve));
 play=async()=>{};
 await playSentence(async()=>response,'fifth');
 rejectPlay(Error('interrupted'));
 await interrupted;
 clips[2].dispatchEvent(new Event('error'));
 assert.deepEqual(revoked,['blob:clip-0','blob:clip-1','blob:clip-2']);
 clips[3].dispatchEvent(new Event('error'));
 assert.deepEqual(revoked,['blob:clip-0','blob:clip-1','blob:clip-2','blob:clip-3']);
 play=async()=>{throw Error('cannot play');};
 await assert.rejects(playSentence(async()=>response,'sixth'),/cannot play/);
 assert.deepEqual(revoked,['blob:clip-0','blob:clip-1','blob:clip-2','blob:clip-3','blob:clip-4']);
});

test('playSentence applies response volume before play, clamps out-of-range values, and ignores missing/non-numeric volume',async t=>{
 const {playSentence}=await import('../web/sentence-voice.js');
 const {clips}=installStrictAudio(t);
 await playSentence(async()=>({data:'AA==',source:'synthesized',volume:0.25}),'quiet');
 assert.equal(clips[0].volumeAtPlay,0.25);
 await playSentence(async()=>({data:'AA==',source:'game',volume:0}),'muted');
 assert.equal(clips[1].volumeAtPlay,0);
 await playSentence(async()=>({data:'AA==',source:'synthesized',volume:1.5}),'high');
 assert.equal(clips[2].volumeAtPlay,1);
 await playSentence(async()=>({data:'AA==',source:'synthesized',volume:-0.2}),'low');
 assert.equal(clips[3].volumeAtPlay,0);
 for(const bad of [undefined,null,NaN,Infinity,'0.2']){
  const idx=clips.length;
  await playSentence(async()=>({data:'AA==',source:'synthesized',...(bad===undefined?{}:{volume:bad})}),'fallback');
  assert.equal(clips[idx].volumeAtPlay,1,`volume=${String(bad)} must keep default volume instead of muting`);
 }
});

test('Runtime sentence_voice passes configured aivisVolume for synthesized clips and omits it for game voice',async t=>{
 const {playSentence}=await import('../web/sentence-voice.js');
 const {Runtime}=require('../services/runtime.cjs');
 const {clipKey}=require('../core/speech.cjs');
 const {cleanV4}=require('../core/v4-config.cjs');
 const {openStore}=require('../services/store.cjs');
 const {save}=require('../services/saved-sentences.cjs');
 const {clips}=installStrictAudio(t);
 const root=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'megulit-sv-vol-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
 const writeVol=v=>fs.writeFileSync(path.join(root,'data','config','v4-preferences.json'),JSON.stringify({aivisVolume:v}));
 const runtime=new Runtime(root);
 runtime.services().ensureSpeech=async()=>{};
 runtime.speech().synthesize=async()=>({data:Buffer.from('SYNTH').toString('base64'),cached:false});
 const api=(action,req)=>runtime.call({action,...req});

 // 1. Default config (no v4-preferences.json): cleanV4 default aivisVolume is 0.9
 await playSentence(api,'デフォルト音量。');
 assert.equal(clips.at(-1).volumeAtPlay,0.9);

 // 2. Cached clip path with configured volume 0.35
 writeVol(0.35);
 const cachedText='キャッシュ済みの台詞。';
 fs.mkdirSync(runtime.speech().folder,{recursive:true});
 fs.writeFileSync(path.join(runtime.speech().folder,clipKey({surface:cachedText,reading:'',pitch:[]},cleanV4({}),true,null)+'.wav'),'RIFF');
 const hit=await runtime.call({action:'sentence_voice',text:cachedText});
 assert.equal(hit.source,'synthesized');
 assert.equal(hit.cached,true);
 assert.equal(hit.volume,0.35);
 await playSentence(api,cachedText);
 assert.equal(clips.at(-1).volumeAtPlay,0.35);

 // 3. Fresh synthesis path with configured volume 0.35
 const fresh=await runtime.call({action:'sentence_voice',text:'新しく合成する台詞。'});
 assert.equal(fresh.source,'synthesized');
 assert.equal(fresh.volume,0.35);
 await playSentence(api,'新しく合成する台詞。');
 assert.equal(clips.at(-1).volumeAtPlay,0.35);

 // 4. Game voice path (saved voice clip): must NOT carry aivisVolume
 const wav1s=()=>{const n=24000,b=Buffer.alloc(44+n*2);b.write('RIFF',0,'latin1');b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8,'latin1');b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36,'latin1');b.writeUInt32LE(n*2,40);return b;};
 const gameText='ゲーム原声の台詞。';
 const db=openStore(root);
 let savedId;
 try{
  const row=save(db,{gameId:'g1',text:gameText,translation:''});
  savedId=row.id;
  fs.mkdirSync(path.join(root,'data','saved-voice'),{recursive:true});
  fs.writeFileSync(path.join(root,'data','saved-voice',`${savedId}.wav`),wav1s());
  db.prepare('UPDATE saved_sentences SET original=? WHERE id=?').run(JSON.stringify({source:'reader',voice:{kind:'file',file:`${savedId}.wav`,from:'capture'}}),savedId);
 }finally{db.close();}
 const gv=await runtime.call({action:'sentence_voice',id:savedId,text:gameText});
 assert.equal(gv.source,'game');
 assert.equal('volume' in gv,false,'game voice must not apply aivisVolume');
 await playSentence(api,gameText,null,{id:savedId});
 assert.equal(clips.at(-1).volumeAtPlay,1);

 // 5. Live config update to muted (0) mutes synthesized playback while leaving game voice untouched
 writeVol(0);
 await playSentence(api,cachedText);
 assert.equal(clips.at(-1).volumeAtPlay,0);
 await playSentence(api,gameText,null,{id:savedId});
 assert.equal(clips.at(-1).volumeAtPlay,1);
});
