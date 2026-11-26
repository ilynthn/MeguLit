'use strict';
/* #1114 (user, 2026-11-24: 「切换不同的音调完全失效 永远都是一个发音」, lookup card of 甦る with 0 平板 / 3 中高 / 4 中高).
   AivisSpeech 1.2.0 reads the intonation from AudioQuery.kana when it is set, over the accent in accent_phrases. Measured on the
   bundled engine (speaker まお ノーマル): ヨ'ミガエル and ヨミガエル' gave the same F0 contour with kana 甦る, a falling and a
   rising one without kana. core/speech.cjs sends a chosen accent without kana; web/reader/modules/v4.js speaks a chip on click. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Speech,clipKey}=require('../core/speech.cjs');

function engine(log){
 const json=v=>({ok:true,json:async()=>v,arrayBuffer:async()=>{const b=Buffer.alloc(44);b.write('RIFF',0,'ascii');b.write('WAVE',8,'ascii');return b;}});
 const phrase=(t,a)=>({moras:[...t.replace(/'/g,'')].map(text=>({text})),accent:a,pause_mora:null});
 return async(url,options)=>{const u=new URL(url),text=u.searchParams.get('text')||'';
  if(u.pathname==='/speakers')return json([{styles:[{id:0}]}]);
  if(u.pathname==='/audio_query')return json({accent_phrases:[phrase('ヨミガエル',3)],kana:text});
  if(u.pathname==='/accent_phrases'){const at=text.indexOf("'");return json([phrase(text,at<0?3:at)]);}
  if(u.pathname==='/synthesis'){log.push(JSON.parse(options.body));return json(null);}
  throw Error('unexpected '+url);};
}

test('a chosen accent is synthesized from accent_phrases alone (no kana), the automatic one keeps the text',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-pitch-'));test.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const sent=[],speech=new Speech(folder,engine(sent)),options={aivisUrl:'http://127.0.0.1:10101',aivisSpeaker:0};
 const word={surface:'甦る',reading:'よみがえる',ambiguous:false};
 const head=await speech.synthesize({...word,pitch:[1]},options),flat=await speech.synthesize({...word,pitch:[4]},options);
 assert.notEqual(head.filename,flat.filename,'each accent is its own clip');
 assert.equal('kana' in sent[0],false);assert.equal('kana' in sent[1],false);
 assert.deepEqual(sent.map(q=>q.accent_phrases[0].accent),[1,4]);
 await speech.synthesize({...word,pitch:[0,3,4]},options);
 assert.equal(sent[2].kana,'甦る','several accents: the engine estimates it from the text');
});

test('clips made while kana overrode the accent are not reused',()=>{
 const c={aivisUrl:'http://127.0.0.1:10101',aivisSpeaker:0,aivisSpeed:1},w={surface:'甦る',reading:'よみがえる',pitch:[1]};
 assert.notEqual(clipKey(w,c,false,1),clipKey(w,c,false,3));
 assert.equal(clipKey(w,c,true,null),clipKey({...w,pitch:[]},c,true,null),'automatic clips keep their cache');
});

test('a pitch chip on the lookup card is spoken when clicked',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','v4.js'),'utf8');
 assert.match(source,/chip\.onclick=\(\)=>\{pick\(p\);[^}]*act\('speak'\)/);
});
