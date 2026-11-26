const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {templateSounds,playMap}=require('../services/anki-media.cjs'),{AnkiReviewer}=require('../services/anki-review.cjs'),{fitScale}=require('../web/anki-fit.js');
test('Anki audio indices follow active template order, independently for each side',()=>{
 const card={template:'JP',fields:{Sentence:{value:'[sound:sentence.mp3]'},Word:{value:'[sound:word.mp3]'},Empty:{value:''}}},templates={JP:{Front:'{{Word}}',Back:'{{FrontSide}}{{#Empty}}{{Sentence}}{{/Empty}}{{Word}}{{^Empty}}{{Sentence}}{{/Empty}}'}};
 assert.deepEqual([...playMap(card,templates,'[anki:play:q:0][anki:play:a:0][anki:play:a:1]')],[['q:0','word.mp3'],['a:0','word.mp3'],['a:1','sentence.mp3']]);
});
test('ambiguous template audio keeps native replay rather than playing an incorrect file',()=>{
 const card={template:'x',fields:{Word:{value:'[sound:a.mp3]'}}};
 assert.equal(playMap(card,{x:{Back:'{{Word}}'}},'[anki:play:a:2]').size,0);
 assert.equal(templateSounds('{{tts ja_JP:Word}}',card.fields).safe,false);
 assert.equal(templateSounds('{{#Word}}{{Word}}{{/Other}}',card.fields).safe,false);
});
function fixture(t){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');t.after(()=>db.close());const calls=[],card={cardId:101,modelName:'JP',template:'JP',fields:{Sentence:{value:'[sound:sentence.mp3]'},Word:{value:'[sound:word.mp3]'}}};
 const reviewer=new AnkiReviewer({db,fetcher:async(url,options)=>{const r=JSON.parse(options.body);calls.push(r);let result;
  if(r.action==='modelTemplates')result={JP:{Back:'{{FrontSide}}{{Word}}{{Sentence}}'}};
  else if(r.action==='retrieveMediaFile')result=Buffer.from(r.params.filename).toString('base64');
  else if(r.action==='guiCurrentCard')result=card;else if(r.action==='guiPlayAudio')result=null;else throw Error('Unexpected '+r.action);
  return {ok:true,json:async()=>({result,error:null})};}});return {reviewer,card,calls};
}
test('modern Anki audio markers become individual playable media, and unknown indices stay actionable',async t=>{
 const {reviewer,card,calls}=fixture(t),html=await reviewer.withMedia('[anki:play:a:0] [anki:play:a:1]',card);
 assert.doesNotMatch(html,/\[anki:play:/);assert.equal((html.match(/data-anki-play /g)||[]).length,2);
 assert(html.includes(Buffer.from('word.mp3').toString('base64')));assert(html.includes(Buffer.from('sentence.mp3').toString('base64')));
 assert.deepEqual(calls.filter(r=>r.action==='retrieveMediaFile').map(r=>r.params.filename),['word.mp3','sentence.mp3']);
 const fallback=await reviewer.withMedia('[anki:play:a:9]',card);assert.match(fallback,/data-anki-replay/);assert.doesNotMatch(fallback,/<audio/);
});
test('replay accepts Anki null success and rejects a stale card before sending audio or ratings',async t=>{
 const {reviewer,calls}=fixture(t);assert.deepEqual(await reviewer.playAudio(101),{played:true});await assert.rejects(reviewer.playAudio(102),/ANKI_CARD_CHANGED/);
 assert.equal(calls.filter(r=>r.action==='guiPlayAudio').length,1);assert(!calls.some(r=>/Answer|DeckReview|ShowAnswer/.test(r.action)));
});
test('managed manual audio renders a click-to-play button without a native play request',async t=>{
 const {reviewer,calls}=fixture(t);
 const html=await reviewer.withMedia('<audio controls preload="none" src="tomoyo_g_12ab.wav"></audio>');
 assert.match(html,/data-anki-play /);
 assert.match(html,/data-anki-channel="game"/);
 assert.match(html,/data:audio\/wav;base64,/);
 assert.deepEqual(calls.map(r=>r.action),['retrieveMediaFile']);
});
test('Anki card tracks retain the recorded source across direct and legacy markup',async t=>{
 const {reviewer}=fixture(t);
 const html=await reviewer.withMedia('[sound:tomoyo_abcd_1234.wav] [sound:tomoyo_s_5678.wav] [sound:other.wav]');
 assert.deepEqual([...html.matchAll(/data-anki-channel="([^"]*)"/g)].map(m=>m[1]),['word','sentence','']);
});
test('a clip at the cache size limit plays on the first retrieval and from disk',async t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const cache=require('../core/anki-media-cache.cjs'),{reviewer}=fixture(t);
 reviewer.mediaDir=fs.mkdtempSync(path.join(os.tmpdir(),'anki-media-limit-'));
 t.after(()=>fs.rmSync(reviewer.mediaDir,{recursive:true,force:true}));
 const limit=12*1024*1024,name='tomoyo_g_test.wav';
 let data=Buffer.alloc(limit).toString('base64'),calls=0;
 reviewer.call=async action=>{assert.equal(action,'retrieveMediaFile');calls++;return data;};
 assert.equal((await reviewer.mediaFile(name))?.length,data.length);
 assert.equal(fs.statSync(path.join(reviewer.mediaDir,name)).size,limit);
 assert.equal((await reviewer.mediaFile(name))?.length,data.length);
 assert.equal(calls,1);
 const wrapped=data.slice(0,80)+'\r\n'+data.slice(80)+'\r\n';
 assert.equal(cache.write(reviewer.mediaDir,'tomoyo_g_wrapped.wav',wrapped),true);
 assert.equal(cache.read(reviewer.mediaDir,'tomoyo_g_wrapped.wav')===data,true);
 data=Buffer.alloc(limit+1).toString('base64');
 const other='tomoyo_g_over.wav';
 assert.equal(await reviewer.mediaFile(other),null);
 assert.equal(cache.write(reviewer.mediaDir,other,data),false);
 assert.equal(fs.existsSync(path.join(reviewer.mediaDir,other)),false);
 data=false;
 assert.equal(await reviewer.mediaFile(other),null);
 data='YQ==\r\n';
 assert.equal(await reviewer.mediaFile('external.wav'),data);
});
test('fit keeps an ordinary card within its viewport and bounds the reduction for long illustrated notes',()=>{
 assert.equal(fitScale(900,400,900,600),2/3);assert.equal(fitScale(900,700,900,600),1);assert.equal(fitScale(900,300,900,1200),.6);assert.equal(fitScale(900,400,900,600,false),1);assert.equal(fitScale(0,0,0,0),1);
});

test('templates with non-audio metadata blocks or hint/type filters still resolve audio safely',()=>{
 const card={
  template:'Kaishi',
  fields:{
   Word:{value:'食べる'},
   Notes:{value:'Ichidan verb'},
   WordAudio:{value:'[sound:word.mp3]'},
   SentenceAudio:{value:'[sound:sent.mp3]'},
   Empty:{value:''}
  }
 };
 const templates={
  Kaishi:{
   Front:'{{Word}}{{WordAudio}}{{type:Word}}{{#Tags}}<div class="tags">{{Tags}}</div>{{/Tags}}',
   Back:'{{FrontSide}}<hr>{{hint:Notes}}{{SentenceAudio}}{{#Tags}}<footer class="tags">{{Tags}}</footer>{{/Tags}}'
  }
 };
 assert.deepEqual(
  [...playMap(card,templates,'[anki:play:q:0][anki:play:a:0]')],
  [['q:0','word.mp3'],['a:0','sent.mp3']]
 );
 // Safety invariants: audio inside unknown conditional blocks, hint filters, tts, or unknown third-party filters stays unsafe.
 assert.equal(templateSounds('{{#Tags}}{{WordAudio}}{{/Tags}}',card.fields).safe,false);
 assert.equal(templateSounds('{{#Tags}}[sound:lit.mp3]{{/Tags}}',card.fields).safe,false);
 assert.equal(templateSounds('{{#Tags}}[anki:tts lang=ja_JP]{{/Tags}}',card.fields).safe,false);
 assert.equal(templateSounds('{{#Tags}}{{#Deck}}{{WordAudio}}{{/Deck}}{{/Tags}}',card.fields).safe,false);
 assert.equal(templateSounds('{{#Tags}}{{#Word}}{{WordAudio}}{{/Word}}{{/Tags}}',card.fields).safe,false);
 assert.equal(templateSounds('{{hint:WordAudio}}',card.fields).safe,false);
 assert.equal(templateSounds('{{hint:Missing}}',card.fields).safe,false);
 assert.equal(templateSounds('{{tts ja_JP:Word}}',card.fields).safe,false);
 assert.equal(templateSounds('{{text: tts ja_JP:Word}}',card.fields).safe,false);
 assert.equal(templateSounds('{{forvo:Word}}{{WordAudio}}',card.fields).safe,false);
 // Unclosed conditional and trailing literal [sound:] are still handled accurately.
 assert.equal(templateSounds('{{#Word}}{{WordAudio}}',card.fields).safe,false);
 assert.deepEqual(templateSounds('{{Word}}[sound:tail.mp3]',card.fields),{safe:true,names:['tail.mp3']});
 // Dead branches (either outside or inside an unknown conditional) do not taint safety.
 assert.deepEqual(templateSounds('{{#Empty}}{{#Tags}}{{WordAudio}}{{/Tags}}{{/Empty}}{{SentenceAudio}}',card.fields),{safe:true,names:['sent.mp3']});
 assert.deepEqual(templateSounds('{{#Tags}}{{#Empty}}{{WordAudio}}{{/Empty}}{{/Tags}}{{SentenceAudio}}',card.fields),{safe:true,names:['sent.mp3']});
});
