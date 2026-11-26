'use strict';
// Numbers with counters (user, 2026-11-23: 10分 was annotated 10ふん). SudachiDict reads each token on its own: 分 is
// always フン and digits are read one by one (10 イチレイ). The tokens below are SudachiDict Full 20261015 output.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createReadingResolver,settled}=require('../core/reading.cjs');
const {counterReading,readNumber,parseNumber,numberTokens}=require('../core/counter-reading.cjs');
const {annotations}=require('../core/furigana.js');
const {exampleSpans}=require('../core/example-ruby.cjs');

const tok=(surface,reading,grammar,start,end)=>({surface,reading,grammar:grammar.split(','),pos:grammar.split(',')[0],base_form:surface,start,end,pitch:[1]});
const NUM='名詞,数詞,*',COUNT='名詞,普通名詞,助数詞可能';
function resolver(entries=[]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-counter-'));const file=path.join(dir,'jmdict.json');
 fs.writeFileSync(file,JSON.stringify(entries));test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return createReadingResolver(file);
}

test('a number and its counter are read as one word with the sound change',()=>{
 const r=resolver();
 const line='あと10分だけ';
 const out=r.resolve([tok('あと','アト','名詞,普通名詞,副詞可能',0,2),tok('10','イチレイ',NUM,2,4),tok('分','フン',COUNT,4,5),tok('だけ','ダケ','助詞,副助詞,*',5,7)]);
 const word=out.find(t=>t.surface==='10分');
 assert.equal(word.reading,'じゅっぷん');assert.equal(word.start,2);assert.equal(word.end,5);assert.ok(settled(word));
 assert.deepEqual(word.pitch,[],'the merged word has no UniDic accent of its own, so speech estimates it');
 assert.deepEqual(annotations(line,out).filter(a=>a.start===2),[{start:2,end:5,reading:'じゅっぷん'}]);
});

test('the counter takes the sound change of the number’s last part',()=>{
 const cases={'1分':'いっぷん','3分':'さんぷん','4分':'よんぷん','6分':'ろっぷん','8分':'はっぷん','20分':'にじゅっぷん','100分':'ひゃっぷん',
  '１０分':'じゅっぷん','三百本':'さんびゃっぽん','六百本':'ろっぴゃっぽん','4本':'よんほん','1000本':'せんぼん','三匹':'さんびき','1杯':'いっぱい',
  '3階':'さんがい','6個':'ろっこ','8歳':'はっさい','6歳':'ろくさい','20歳':'はたち','100点':'ひゃくてん','3ヶ月':'さんかげつ','6か月':'ろっかげつ',
  '4人':'よにん','1人':'ひとり','14人':'じゅうよにん','7時':'しちじ','9時':'くじ','4月':'しがつ','4円':'よえん','34日':'さんじゅうよっか','20日':'はつか',
  '1,000円':'せんえん','2万5千円':'にまんごせんえん','一万円':'いちまんえん','10秒':'じゅうびょう'};
 for(const [text,reading] of Object.entries(cases)){
  const counter=['ヶ月','か月'].find(c=>text.endsWith(c))||text.slice(-1);
  assert.equal(counterReading(text.slice(0,-counter.length),counter),reading,text);
 }
});

test('meaning-dependent or unknown combinations are left alone',()=>{
 assert.equal(counterReading('十','分'),'','十分 is usually じゅうぶん (enough)');
 assert.equal(counterReading('13','月'),'');
 assert.equal(counterReading('3','匹目'),'');
 assert.equal(parseNumber('3.5'),null);
 assert.equal(parseNumber('012'),null);
 const r=resolver([{spellings:['十分'],readings:['じゅうぶん','じっぷん']}]);
 const out=r.resolve([tok('十','ジュウ',NUM,0,1),tok('分','フン',COUNT,1,2),tok('待っ','マッ','動詞,一般,*',2,4)]);
 assert.equal(out[0].surface,'十分');assert.equal(out[0].reading,'じゅうぶん');assert.equal(out[0].readingSource,'dictionary');
});

test('a longer dictionary word that starts with the number wins',()=>{
 const r=resolver([{spellings:['一日中'],readings:['いちにちじゅう']}]);
 // 中 as ジュウ: the dictionary merge compares the tokenizer's reading, so this case needs it to match.
 const out=r.resolve([tok('一','イチ',NUM,0,1),tok('日','ニチ',COUNT,1,2),tok('中','ジュウ','接尾辞,名詞的,副詞可能',2,3)]);
 assert.equal(out[0].surface,'一日中');assert.equal(out[0].reading,'いちにちじゅう');
});

test('a number on its own is read by value, not digit by digit',()=>{
 const out=resolver().resolve([tok('34','サンヨン',NUM,0,2)]);
 assert.equal(out[0].reading,'さんじゅうよん');assert.ok(settled(out[0]));
 assert.equal(readNumber(2026),'にせんにじゅうろく');assert.equal(readNumber(10000),'いちまん');
});

test('example sentences and the daily page show the number reading',()=>{
 const r=resolver();const text='あと3本だけ';
 const out=r.resolve([tok('あと','アト','名詞,普通名詞,副詞可能',0,2),tok('3','サン',NUM,2,3),tok('本','ポン','接尾辞,名詞的,助数詞',3,4),tok('だけ','ダケ','助詞,副助詞,*',4,6)]);
 assert.deepEqual(exampleSpans(text,out,[]).map(s=>[s.start,s.end,s.reading]),[[2,4,'さんぼん']]);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','daily.cjs'),'utf8'),/settled\(t\)\?String\(t\.reading/);
});

/* 2026-11-23 (user: the speech button said something else than the furigana): furigana, the speech button and lookup all read
   LocalLearning.tokenize(). The worker is stubbed with the SudachiDict Full tokens of these lines; JMdict entries are real. */
const {LocalLearning}=require('../core/learning-native.cjs');
const {engineAccentKana}=require('../core/speech.cjs');
const LINES={
 'あと10分だけ':[tok('あと','アト','名詞,普通名詞,副詞可能',0,2),tok('10','イチレイ',NUM,2,4),tok('分','フン',COUNT,4,5),tok('だけ','ダケ','助詞,副助詞,*',5,7)],
 '3本のペン':[tok('3','サン',NUM,0,1),tok('本','ポン','接尾辞,名詞的,助数詞',1,2),tok('の','ノ','助詞,格助詞,*',2,3),tok('ペン','ペン','名詞,普通名詞,一般',3,5)],
 '私は行く':[{...tok('私','ワタクシ','代名詞,*,*',0,1),pitch:[0]},tok('は','ワ','助詞,係助詞,*',1,2),tok('行く','イク','動詞,非自立可能,*',2,4)],
};
const ENTRIES=[{id:1,spellings:['分'],readings:['ふん','ぶん','ぶ'],pos:['noun (common) (futsuumeishi)'],definitions:['minute']},{id:2,spellings:['分だけ'],readings:['ぶんだけ'],pos:['noun (common) (futsuumeishi)'],definitions:['to the extent']},
 {id:3,spellings:['本'],readings:['ほん'],pos:['noun (common) (futsuumeishi)'],definitions:['book']},{id:4,spellings:['本の'],readings:['ほんの'],pos:['noun (common) (futsuumeishi)'],definitions:['mere']},{id:5,spellings:['私'],readings:['わたし','わたくし'],pos:['noun (common) (futsuumeishi)'],definitions:['I']}];
function stubbed(){
 const L=new LocalLearning(path.join(os.tmpdir(),'megulit-counter-learning'));L.ready=async()=>{};
 L.worker={stdin:{write(line){const {id,text}=JSON.parse(line);const p=L.pending.get(id);clearTimeout(p.timer);L.pending.delete(id);p.resolve(JSON.parse(JSON.stringify(LINES[text])));}}};
 L.load=function(){if(this.index)return;this.index=new Map();this.byId=new Map();this.english=new Map();for(const e of ENTRIES){this.byId.set(e.id,e);for(const k of [...e.spellings,...e.readings]){const ids=this.index.get(k)||[];ids.push(e.id);this.index.set(k,ids);}}};
 return L;
}

test('the counter is read with its number before JMdict joins it with the next word (分だけ, 本の)',async()=>{
 const L=stubbed();
 assert.deepEqual((await L.tokenize('あと10分だけ')).map(t=>[t.surface,t.reading]),[['あと','アト'],['10分','じゅっぷん'],['だけ','ダケ']]);
 assert.deepEqual((await L.tokenize('3本のペン')).map(t=>[t.surface,t.reading]),[['3本','さんぼん'],['の','ノ'],['ペン','ペン']]);
});

test('the speech button says what the furigana shows',async()=>{
 const L=stubbed();
 const piece=await L.word({text:'あと10分だけ',start:4,end:5});
 assert.deepEqual(piece.spoken,{surface:'10分',reading:'じゅっぷん',pitch:[],ambiguous:false},'a click on 分 says the whole number word');
 assert.equal(piece.surface,'分','the card keeps the selected word');
 const me=await L.word({text:'私は行く',start:0,end:1});
 assert.equal(me.reading,'わたし');assert.deepEqual(me.pitch,[],'the accent of わたくし is not spoken for わたし');
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8'),/synthesize\(word\.spoken\?\{\.\.\.word,\.\.\.word\.spoken\}:word/);
});

test('our reading keeps the engine phrases and accents when the morae line up',()=>{
 // AivisSpeech 1.2.0 reads 10分 as ジップン' (accent 4): sending ジュップン as plain text came back as ジュ'ッ/プ'ン.
 const phrase=(text,accent,pause=false)=>({moras:require('../core/speech.cjs').morae(text).map(m=>({text:m})),accent,...(pause?{pause_mora:{text:'、'}}:{})});
 assert.equal(engineAccentKana([phrase('ジップン',4)],'じゅっぷん'),"ジュップン'");
 assert.equal(engineAccentKana([phrase('コレハ',1,true),phrase('ジップン',4)],'これはじゅっぷん'),"コ'レハ、ジュップン'");
 assert.equal(engineAccentKana([phrase('ジップン',4)],'さんじゅっぷん'),'','different mora counts leave it to the old fallback');
});

test('month-count counters (1ヶ月1日, 三か月一日) keep 1日 as いちにち while real dates (4月1日, 四月一日) read ついたち',()=>{
 const monthAndDay=(n1,c1,n2,c2)=>{
  let pos=0;const mk=(s,r,g)=>{const start=pos;pos+=[...s].length;return tok(s,r,g,start,pos);};
  return numberTokens([mk(n1,'イチ',NUM),mk(c1,'カゲツ',COUNT),mk(n2,'イチ',NUM),mk(c2,'ニチ',COUNT)]).map(t=>[t.surface,t.reading]);
 };
 assert.deepEqual(monthAndDay('1','ヶ月','1','日'),[['1ヶ月','いっかげつ'],['1日','いちにち']]);
 assert.deepEqual(monthAndDay('三','か月','一','日'),[['三か月','さんかげつ'],['一日','いちにち']]);
 assert.deepEqual(monthAndDay('2','カ月','1','日'),[['2カ月','にかげつ'],['1日','いちにち']]);
 assert.deepEqual(monthAndDay('1','ケ月','1','日'),[['1ケ月','いっかげつ'],['1日','いちにち']]);
 assert.deepEqual(monthAndDay('1','箇月','1','日'),[['1箇月','いっかげつ'],['1日','いちにち']]);
 assert.deepEqual(monthAndDay('4','月','1','日'),[['4月','しがつ'],['1日','ついたち']]);
 assert.deepEqual(monthAndDay('四','月','一','日'),[['四月','しがつ'],['一日','ついたち']]);
 assert.deepEqual(monthAndDay('12','月','1','日'),[['12月','じゅうにがつ'],['1日','ついたち']]);
 const preMerged=[{...tok('1ヶ月','いっかげつ',NUM,0,3),readingSource:'number'},tok('1','イチ',NUM,3,4),tok('日','ニチ',COUNT,4,5)];
 assert.deepEqual(numberTokens(preMerged).map(t=>[t.surface,t.reading]),[['1ヶ月','いっかげつ'],['1日','いちにち']]);
 const preMergedSmallKa=[{...tok('1ヵ月','いっかげつ',NUM,0,3),readingSource:'number'},tok('1','イチ',NUM,3,4),tok('日','ニチ',COUNT,4,5)];
 assert.deepEqual(numberTokens(preMergedSmallKa).map(t=>[t.surface,t.reading]),[['1ヵ月','いっかげつ'],['1日','いちにち']]);
 const emptySubtokens=[{...tok('4月','しがつ',NUM,0,2),readingSource:'number',subtokens:[]},tok('1','イチ',NUM,2,3),tok('日','ニチ',COUNT,3,4)];
 assert.deepEqual(numberTokens(emptySubtokens).map(t=>[t.surface,t.reading]),[['4月','しがつ'],['1日','ついたち']]);
});
