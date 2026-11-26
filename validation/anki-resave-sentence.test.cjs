// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Mining a word that already has a card: the sentence's voice, screenshot, translation and game go with the sentence.
const test=require('node:test'),assert=require('node:assert/strict');
const {Anki}=require('../core/anki.cjs');
const FIELDS=['Word','WordReading','Sentence','SentenceTranslation','SentenceAudio','Screenshot','Game','TranslationSource','SentenceFurigana','Audio'];
function ankiPattern(raw,exact){
 let pat='';
 for(let i=0;i<raw.length;i++){
  if(raw[i]==='\\'&&i+1<raw.length){pat+=raw[++i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');continue;}
  if(raw[i]==='*')pat+='.*';
  else if(raw[i]==='_')pat+='.';
  else pat+=raw[i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 }
 return new RegExp(exact?'^'+pat+'$':pat);
}
function fake(){const notes=new Map(),addOptions=[],queries=[];let next=100;const anki=new Anki();anki.prepareModel=async()=>({available:FIELDS,owned:true});
 anki.call=async(c,action,p)=>{
  if(action==='createDeck'||action==='storeMediaFile')return null;
  if(action==='findNotes'){
   queries.push(p.query);
   const deckMatch=/deck:"((?:\\.|[^"])*)"/.exec(p.query);
   const noteMatch=/note:"((?:\\.|[^"])*)"/.exec(p.query);
   const tagMatch=/tag:(\S+)/.exec(p.query);
   const wordMatches=[...p.query.matchAll(/Word:"((?:\\.|[^"])*)"/g)].map(m=>ankiPattern(m[1],false));
   return [...notes].filter(([,n])=>{
    if(deckMatch&&!ankiPattern(deckMatch[1],true).test(n.deckName||'MeguLit'))return false;
    if(noteMatch&&!ankiPattern(noteMatch[1],true).test(n.modelName||''))return false;
    if(tagMatch&&!n.tags.includes(tagMatch[1]))return false;
    if(wordMatches.length&&!wordMatches.some(re=>re.test(String(n.fields.Word||''))))return false;
    return true;
   }).map(([id])=>id);
  }
  if(action==='addNote'){
   addOptions.push(p.note.options);
   const strip=s=>String(s||'').replace(/<[^<>]*>/g,'').trim();
   const dup=!p.note.options?.allowDuplicate&&[...notes.values()].some(n=>n.modelName===p.note.modelName&&strip(n.fields.Word)===strip(p.note.fields.Word));
   if(dup)throw Error('AnkiConnect：cannot create note because it is a duplicate');
   const id=next++;notes.set(id,{deckName:p.note.deckName,modelName:p.note.modelName,fields:{...p.note.fields},tags:p.note.tags});return id;
  }
  if(action==='notesInfo')return p.notes.map(id=>({noteId:id,modelName:notes.get(id).modelName,fields:Object.fromEntries(Object.entries(notes.get(id).fields).map(([k,v])=>[k,{value:v}]))}));
  if(action==='updateNoteFields'){Object.assign(notes.get(p.note.id).fields,p.note.fields);return null;}
  throw Error('unexpected '+action);};
 return {anki,notes,addOptions,queries,fields:()=>[...notes.values()][0].fields,count:()=>notes.size};}
const c={ankiDeck:'MeguLit',ankiModel:'MeguLit'};
const word=s=>({surface:'約束',base:'約束',reading:'やくそく',pos:'名詞',meaning:'promise',sentence:s});
const media={translation:'我们约好了吧。',screenshot:Buffer.from('shot').toString('base64'),sentenceAudio:{data:Buffer.from('voice').toString('base64'),ext:'.ogg'},gameAudio:true,gameTitle:'Game A'};

test('the same word from another line does not keep the first line\'s voice, screenshot, translation or game',async()=>{
 const f=fake();await f.anki.save(word('約束したよね。'),c,null,'w1',media);
 assert.match(f.fields().Screenshot,/<img/);assert.match(f.fields().SentenceAudio,/<audio/);
 await f.anki.save(word('約束を守れ。'),c,null,'w1',{});
 const v=f.fields();assert.equal(f.count(),1);assert.equal(v.Sentence,'約束を守れ。');
 for(const k of ['SentenceTranslation','SentenceAudio','Screenshot','Game'])assert.equal(v[k],'',k);
});

test('saving the same line again without media keeps what the card already has',async()=>{
 const f=fake();await f.anki.save(word('約束したよね。'),c,null,'w1',media);const before=f.fields();
 await f.anki.save(word('約束したよね。'),c,null,'w1',{});
 const v=f.fields();for(const k of ['SentenceTranslation','SentenceAudio','Screenshot','Game'])assert.equal(v[k],before[k],k);
});

test('distinct cardKey grammar/news cards and homographs sharing Word are not rejected as duplicates',async()=>{
 const {ankiWord}=require('../services/grammar.cjs');
 const f=fake();
 const g1=ankiWord('wo','を —— 动作的对象','表示宾语',{text:'彼女は本を閉じた。'});
 const g2=ankiWord('wo','を —— 动作的对象','表示宾语',{text:'窓を開けた。'});
 const r1=await f.anki.sync(g1,c,null);
 const r2=await f.anki.sync(g2,c,null);
 assert.equal(r1.updated,false);assert.equal(r2.updated,false);assert.notEqual(r1.id,r2.id);assert.equal(f.count(),2);
 const r2Again=await f.anki.sync(g2,c,null);
 assert.equal(r2Again.updated,true);assert.equal(r2Again.id,r2.id);assert.equal(f.count(),2,'same cardKey still updates instead of duplicating');

 const n1={surface:'開催',base:'開催',reading:'かいさい',cardKey:'news:開催:https://example.test/a',meaning:'举办',pos:'',pitch:[],sentence:'大会を開催する。'};
 const n2={surface:'開催',base:'開催',reading:'かいさい',cardKey:'news:開催:https://example.test/b',meaning:'举办',pos:'',pitch:[],sentence:'展示会を開催する。'};
 const rn1=await f.anki.sync(n1,c,null);
 const rn2=await f.anki.sync(n2,c,null);
 assert.equal(rn1.updated,false);assert.equal(rn2.updated,false);assert.notEqual(rn1.id,rn2.id);assert.equal(f.count(),4);

 const h1={surface:'生',base:'生',reading:'せい',meaning:'生命',pos:'名詞',pitch:[1],sentence:'生を受ける。'};
 const h2={surface:'生',base:'生',reading:'なま',meaning:'生的',pos:'名詞',pitch:[1],sentence:'生で食べる。'};
 const rh1=await f.anki.sync(h1,c,null);
 const rh2=await f.anki.sync(h2,c,null);
 assert.equal(rh1.updated,false);assert.equal(rh2.updated,false);assert.notEqual(rh1.id,rh2.id);assert.equal(f.count(),6);
 assert.equal(f.addOptions.at(-2).allowDuplicate,false,'first ordinary word keeps allowDuplicate:false');
 assert.equal(f.addOptions.at(-1).allowDuplicate,true,'different-reading homograph allows duplicate Word');
});

test('untagged legacy or manual note with the same word and reading is treated as existing and not duplicated',async()=>{
 const f=fake();
 f.notes.set(50,{modelName:'MeguLit',fields:{Word:'約束',WordReading:'',Reading:'ヤクソク',Meaning:'manual'},tags:[]});
 const r=await f.anki.sync({surface:'約束',base:'約束',reading:'やくそく',meaning:'new',pos:'名詞',pitch:[0],sentence:'約束する。'},c,null);
 assert.equal(r.id,50);assert.equal(r.updated,false);
 assert.equal(f.count(),1,'must not create a second note for untagged same-word same-reading card');
 assert.equal(f.notes.get(50).fields.Meaning,'manual','existing untagged note is not overwritten');

 // Untagged kana-only note (blank WordReading) with the same word is also not duplicated.
 f.notes.set(51,{modelName:'MeguLit',fields:{Word:'しかし',WordReading:'',Meaning:'but'},tags:[]});
 const rk=await f.anki.sync({surface:'しかし',base:'しかし',reading:'しかし',meaning:'however',pos:'接続詞',pitch:[2],sentence:'しかし行く。'},c,null);
 assert.equal(rk.id,51);assert.equal(f.count(),2);

 // Untagged kanji note with no reading at all keeps allowDuplicate:false so Anki refuses a duplicate.
 f.notes.set(52,{deckName:'MeguLit',modelName:'MeguLit',fields:{Word:'橋',WordReading:'',Meaning:'bridge?'},tags:[]});
 await assert.rejects(f.anki.sync({surface:'橋',base:'橋',reading:'はし',meaning:'bridge',pos:'名詞',pitch:[2],sentence:'橋を渡る。'},c,null),/duplicate/);
 assert.equal(f.count(),3);

 // &nbsp; and HTML tags in readings/words are decoded: blank &nbsp; falls back or stays duplicate-safe.
 f.notes.set(53,{deckName:'MeguLit',modelName:'MeguLit',fields:{Word:'<span>橋2</span>',WordReading:'<div>&nbsp;</div>',Meaning:'blank nbsp'},tags:[]});
 await assert.rejects(f.anki.sync({surface:'橋2',base:'橋2',reading:'はし',meaning:'bridge',pos:'名詞',pitch:[2],sentence:'橋2を渡る。'},c,null),/duplicate/);
 f.notes.set(54,{deckName:'MeguLit',modelName:'MeguLit',fields:{Word:'<span>端</span>',WordReading:'&nbsp;',Reading:'<b>はし&nbsp;</b>',Meaning:'legacy nbsp'},tags:[]});
 const rNbsp=await f.anki.sync({surface:'端',base:'端',reading:'はし',meaning:'edge',pos:'名詞',pitch:[0],sentence:'端を歩く。'},c,null);
 assert.equal(rNbsp.id,54);assert.equal(f.count(),5);

 // Mix of one different-reading note and one missing-reading note still keeps allowDuplicate:false.
 f.notes.set(55,{deckName:'MeguLit',modelName:'MeguLit',fields:{Word:'角',WordReading:'つの',Meaning:'horn'},tags:[]});
 f.notes.set(56,{deckName:'MeguLit',modelName:'MeguLit',fields:{Word:'角',WordReading:'',Meaning:'missing'},tags:[]});
 await assert.rejects(f.anki.sync({surface:'角',base:'角',reading:'かど',meaning:'corner',pos:'名詞',pitch:[1],sentence:'角を曲がる。'},c,null),/duplicate/);
 assert.equal(f.count(),7);

 // Kana-only word with a conflicting non-empty reading on an existing note does not enable allowDuplicate.
 f.notes.set(57,{deckName:'MeguLit',modelName:'MeguLit',fields:{Word:'ここ',WordReading:'ちがう',Meaning:'odd'},tags:[]});
 await assert.rejects(f.anki.sync({surface:'ここ',base:'ここ',reading:'ここ',meaning:'here',pos:'代名詞',pitch:[0],sentence:'ここにある。'},c,null),/duplicate/);
 assert.equal(f.count(),8);
});

test('Anki search wildcards, substring words, HTML entities, and cross-deck homographs are handled accurately',async()=>{
 const f=fake();
 // Model name containing "_" (built-in tomoyo_megumin) must not wildcard-match another model.
 f.notes.set(60,{deckName:'MeguLit',modelName:'tomoyoXmegumin',fields:{Word:'約束',WordReading:'やくそく',Meaning:'other model'},tags:[]});
 const tm={ankiDeck:'MeguLit',ankiModel:'tomoyo_megumin'};
 const rTm=await f.anki.sync({surface:'約束',base:'約束',reading:'やくそく',meaning:'promise',pos:'名詞',pitch:[0],sentence:'約束する。'},tm,null);
 assert.notEqual(rTm.id,60);assert.equal(f.count(),2);
 assert.ok(f.queries.some(q=>q.includes('note:"tomoyo\\_megumin"')),'underscore in model name must be escaped');

 // Word containing "*" must be escaped and not wildcard-match unrelated words.
 f.notes.set(61,{deckName:'MeguLit',modelName:'MeguLit',fields:{Word:'axb',WordReading:'えーばいびー',Meaning:'unrelated'},tags:[]});
 const rStar=await f.anki.sync({surface:'a*b',base:'a*b',reading:'えーばいびー',meaning:'star',pos:'名詞',pitch:[],sentence:'a*b'},c,null);
 assert.notEqual(rStar.id,61);
 assert.ok(f.queries.some(q=>q.includes('Word:"a\\*b"')),'asterisk in Word must be escaped');

 // Substring word with missing reading must not block exact word from allowing its own homograph.
 f.notes.set(62,{deckName:'MeguLit',modelName:'MeguLit',fields:{Word:'生活',WordReading:'',Meaning:'life'},tags:[]});
 const rSei=await f.anki.sync({surface:'生',base:'生',reading:'せい',meaning:'life',pos:'名詞',pitch:[1],sentence:'生を受ける。'},{ankiDeck:'megulit_news',ankiModel:'MeguLit'},null);
 // Cross-deck homograph (megulit_news -> MeguLit, same model) is allowed.
 const rNama=await f.anki.sync({surface:'生',base:'生',reading:'なま',meaning:'raw',pos:'名詞',pitch:[1],sentence:'生で食べる。'},c,null);
 assert.notEqual(rSei.id,rNama.id);

 // HTML-escaped Word (e.g. "&" stored as "&amp;") is found so a different reading can be added.
 const rAmp1=await f.anki.sync({surface:'生&死',base:'生&死',reading:'せいとし',meaning:'life and death',pos:'名詞',pitch:[],sentence:'生&死。'},c,null);
 const rAmp2=await f.anki.sync({surface:'生&死',base:'生&死',reading:'いきとし',meaning:'alt',pos:'名詞',pitch:[],sentence:'生&死。'},c,null);
 assert.notEqual(rAmp1.id,rAmp2.id);
});

test('cross-deck news cardKey cards do not hijack or block ordinary game mining, and katakana-reading cards still update on hiragana resave',async()=>{
 const f=fake();
 const newsCfg={ankiDeck:'megulit_news',ankiModel:'MeguLit'};

 // Scenario A: existing news card in megulit_news must not hijack ordinary mining into MeguLit deck.
 const rNews=await f.anki.sync({surface:'開催',base:'開催',reading:'かいさい',cardKey:'news:開催:https://example.test/1',meaning:'举办',pos:'名詞',pitch:[],sentence:'大会を開催する。'},newsCfg,null);
 const rGame=await f.anki.sync({surface:'開催',base:'開催',reading:'かいさい',meaning:'举办',pos:'名詞',pitch:[],sentence:'学園祭を開催しよう。'},c,null,{screenshot:Buffer.from('shot').toString('base64')});
 assert.notEqual(rGame.id,rNews.id,'game mining must create its own note in MeguLit deck instead of returning megulit_news noteId');
 assert.equal(f.notes.get(rGame.id)?.deckName,'MeguLit');
 assert.equal(rGame.screenshotAttached,true);

 // Scenario B: legacy MeguLit card saved with katakana reading must still update sentence/screenshot when remined with hiragana reading.
 const rLegacy=await f.anki.sync({surface:'約束',base:'約束',reading:'ヤクソク',meaning:'promise',pos:'名詞',pitch:[0],sentence:'古い文。'},c,null);
 const rUpdate=await f.anki.sync({surface:'約束',base:'約束',reading:'やくそく',meaning:'promise',pos:'名詞',pitch:[0],sentence:'新しい文。'},c,null,{screenshot:Buffer.from('shot2').toString('base64')});
 assert.equal(rUpdate.id,rLegacy.id);
 assert.equal(rUpdate.updated,true);
 assert.equal(rUpdate.screenshotAttached,true);
 assert.equal(f.notes.get(rLegacy.id).fields.Sentence,'新しい文。');

 // Scenario C: readingless news card in megulit_news must not block a reading-bearing homograph in MeguLit deck.
 await f.anki.sync({surface:'生',base:'生',reading:'生',noReading:true,cardKey:'news:生:https://example.test/2',meaning:'新闻卡',pos:'',pitch:[],sentence:'生の声。'},newsCfg,null);
 const rNama=await f.anki.sync({surface:'生',base:'生',reading:'なま',meaning:'生的',pos:'名詞',pitch:[1],sentence:'生で食べる。'},c,null);
 assert.equal(f.notes.get(rNama.id)?.deckName,'MeguLit');

 // Scenario D: same-deck cardKey card must not hijack ordinary mining of the same word either.
 const rSameDeckNews=await f.anki.sync({surface:'発表',base:'発表',reading:'はっぴょう',cardKey:'news:発表:https://example.test/3',meaning:'发表',pos:'名詞',pitch:[],sentence:'結果を発表する。'},c,null);
 const rSameDeckGame=await f.anki.sync({surface:'発表',base:'発表',reading:'はっぴょう',meaning:'发表',pos:'名詞',pitch:[],sentence:'これから発表するよ。'},c,null,{screenshot:Buffer.from('shot3').toString('base64')});
 assert.notEqual(rSameDeckGame.id,rSameDeckNews.id);
 assert.equal(rSameDeckGame.screenshotAttached,true);

 // Scenario E: legacy cross-deck note without tomoyo::cardkey tag (kanji and kana-only) is isolated by deck.
 f.notes.set(900,{deckName:'megulit_news',modelName:'MeguLit',fields:{Word:'連絡',WordReading:'れんらく',Meaning:'legacy news'},tags:['tomoyo_megumin','tomoyo::legacyhash']});
 const rCrossLegacy=await f.anki.sync({surface:'連絡',base:'連絡',reading:'れんらく',meaning:'联系',pos:'名詞',pitch:[0],sentence:'連絡する。'},c,null);
 assert.notEqual(rCrossLegacy.id,900);assert.equal(f.notes.get(rCrossLegacy.id)?.deckName,'MeguLit');

 f.notes.set(901,{deckName:'megulit_news',modelName:'MeguLit',fields:{Word:'しかし',WordReading:'',Meaning:'legacy kana news'},tags:['tomoyo_megumin','tomoyo::legacykana']});
 const rCrossKana=await f.anki.sync({surface:'しかし',base:'しかし',reading:'しかし',meaning:'但是',pos:'接続詞',pitch:[2],sentence:'しかし行く。'},c,null);
 assert.notEqual(rCrossKana.id,901);assert.equal(f.notes.get(rCrossKana.id)?.deckName,'MeguLit');

 // Scenario F: cardKey sync does not overwrite an existing same-deck ordinary note via reading-variant tag lookup, and hiragana->katakana resave updates.
 const rOrdKata=await f.anki.sync({surface:'準備',base:'準備',reading:'ジュンビ',meaning:'准备',pos:'名詞',pitch:[1],sentence:'準備する。'},c,null);
 const rKeyHira=await f.anki.sync({surface:'準備',base:'準備',reading:'じゅんび',cardKey:'news:準備:https://example.test/4',meaning:'新闻准备',pos:'名詞',pitch:[1],sentence:'大会の準備。'},c,null);
 assert.notEqual(rKeyHira.id,rOrdKata.id);assert.equal(f.notes.get(rOrdKata.id).fields.Sentence,'準備する。');

 const rHiraFirst=await f.anki.sync({surface:'予定',base:'予定',reading:'よてい',meaning:'预定',pos:'名詞',pitch:[0],sentence:'古い予定。'},c,null);
 const rKataUpdate=await f.anki.sync({surface:'予定',base:'予定',reading:' ヨテイ ',meaning:'预定',pos:'名詞',pitch:[0],sentence:'新しい予定。'},c,null);
 assert.equal(rKataUpdate.id,rHiraFirst.id);assert.equal(rKataUpdate.updated,true);
 assert.equal(f.notes.get(rHiraFirst.id).fields.Sentence,'新しい予定。');
});
