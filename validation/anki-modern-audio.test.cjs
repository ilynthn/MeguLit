// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {AnkiReviewer}=require('../services/anki-review.cjs');
const {mimeOf}=require('../core/anki-media-cache.cjs');

const SAMPLES={
 'clip.opus':Buffer.concat([Buffer.from('OggS'),Buffer.from([0,2,0,0,0,0,0,0])]).toString('base64'),
 'clip.webm':Buffer.from([0x1a,0x45,0xdf,0xa3,0x9f,0x42,0x86,0x81]).toString('base64'),
 'clip.flac':Buffer.concat([Buffer.from('fLaC'),Buffer.from([0,0,0,34])]).toString('base64'),
 'clip.aac':Buffer.from([0xff,0xf1,0x50,0x80,0x02,0x1f,0xfc,0x00]).toString('base64'),
 'clip.mp3':Buffer.from([0xff,0xfb,0x90,0x00,0x00,0x00,0x00,0x00]).toString('base64')
};

test('mimeOf detects opus, webm, flac, and ADTS aac without misclassifying aac as mp3',()=>{
 assert.equal(mimeOf(SAMPLES['clip.opus'],'clip.opus'),'audio/ogg');
 assert.equal(mimeOf(SAMPLES['clip.webm'],'clip.webm'),'audio/webm');
 assert.equal(mimeOf(SAMPLES['clip.flac'],'clip.flac'),'audio/flac');
 assert.equal(mimeOf(SAMPLES['clip.aac'],'clip.aac'),'audio/aac');
 assert.equal(mimeOf(SAMPLES['clip.mp3'],'clip.mp3'),'audio/mpeg');
 // Extension fallback when bytes have no known magic header
 const raw=Buffer.from('plain').toString('base64');
 assert.equal(mimeOf(raw,'voice.opus'),'audio/ogg');
 assert.equal(mimeOf(raw,'voice.webm'),'audio/webm');
 assert.equal(mimeOf(raw,'voice.flac'),'audio/flac');
 assert.equal(mimeOf(raw,'voice.aac'),'audio/aac');
 assert.equal(mimeOf(raw,'voice.mp3'),'audio/mpeg');
 assert.equal(mimeOf(raw,'mp3'),'audio/wav');
});

test('withMedia and cardClips render and replay opus, webm, flac, and aac audio in external Anki decks',async t=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');
 t.after(()=>db.close());
 const card={
  cardId:77,modelName:'Subs2SRS',ord:0,deckName:'Anime',css:'',
  question:'テスト',
  answer:'[sound:clip.opus] [sound:clip.webm] [sound:clip.flac] [sound:clip.aac]',
  fields:{
   Audio:{value:'[sound:clip.opus][sound:clip.webm][sound:clip.flac][sound:clip.aac]',order:0}
  }
 };
 const reviewer=new AnkiReviewer({
  db,
  fetcher:async(_url,options)=>{
   const {action,params}=JSON.parse(options.body);
   let result=null;
   if(action==='retrieveMediaFile')result=SAMPLES[params.filename]||false;
   else if(action==='cardsInfo')result=[card];
   else if(action==='modelTemplates')result={Card:{Front:'{{Word}}',Back:'{{Audio}}'}};
   return {ok:true,headers:{get:()=>'application/json'},json:async()=>({result,error:null})};
  }
 });

 const rendered=await reviewer.withMedia(card.answer,card);
 assert.match(rendered,/data:audio\/ogg;base64,/);
 assert.match(rendered,/data:audio\/webm;base64,/);
 assert.match(rendered,/data:audio\/flac;base64,/);
 assert.match(rendered,/data:audio\/aac;base64,/);
 assert.equal((rendered.match(/data-anki-play/g)||[]).length,4,'all four modern audio clips render playable controls');

 const clips=await reviewer.cardClips(card.cardId);
 assert.deepEqual(
  clips.map(c=>[c.name,c.src.slice(0,c.src.indexOf(';'))]),
  [
   ['clip.opus','data:audio/ogg'],
   ['clip.webm','data:audio/webm'],
   ['clip.flac','data:audio/flac'],
   ['clip.aac','data:audio/aac']
  ]
 );
});
