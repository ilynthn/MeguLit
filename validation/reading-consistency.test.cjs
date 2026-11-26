'use strict';
/* #1131 (user 2026-11-24: 「点读之后的小喇叭发音和注音以及点读查询后的发音不一致 并且是错误的」). Furigana and lookup read the line
   without the game's line breaks (tokenizeWhole); the speech button read it with them, so a word the game wrapped (黒｜ずんでいた) was
   cut there and spoken another way. And a word whose token reading the card's dictionary entry did not list was spoken by the
   engine's own guess instead of the reading the furigana showed. The token rows are SudachiDict Full 20261015 output. */
const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path');
const {LocalLearning}=require('../core/learning-native.cjs');
const {annotations}=require('../core/furigana.js');

const tok=(surface,reading,grammar,start)=>({surface,reading,base_form:surface,normalized:surface,grammar:grammar.split(','),pos:grammar.split(',')[0],start,end:start+[...surface].length,pitch:[],source:'SudachiDict Full'});
const ROWS={
 '黒ずんでいた':[tok('黒ずん','クロズン','動詞,一般,*',0),tok('で','デ','助詞,接続助詞,*',3),tok('い','イ','動詞,非自立可能,*',4),tok('た','タ','助動詞,*,*',5)],
 '黒\nずんでいた':[tok('黒','クロ','名詞,普通名詞,一般',0),tok('\n','','空白,*,*',1),tok('ず','ズ','助動詞,*,*',2),tok('ん','ン','助動詞,*,*',3),tok('で','デ','助詞,接続助詞,*',4),tok('い','イ','動詞,非自立可能,*',5),tok('た','タ','助動詞,*,*',6)],
 '説教だし':[tok('説教','セッキョウ','名詞,普通名詞,サ変可能',0),tok('だし','ダシ','名詞,普通名詞,一般',2)],
};
function stubbed(){
 const L=new LocalLearning(path.join(os.tmpdir(),'megulit-reading-consistency'));L.ready=async()=>{};
 L.worker={stdin:{write(line){const {id,text}=JSON.parse(line),p=L.pending.get(id);clearTimeout(p.timer);L.pending.delete(id);p.resolve(JSON.parse(JSON.stringify(ROWS[text]||[])));}}};
 L.load=function(){if(this.index)return;this.index=new Map();this.byId=new Map();this.english=new Map();};
 return L;
}

test('the speech button reads a line the game wrapped as the furigana does',async()=>{
 const L=stubbed(),text='黒\nずんでいた',N={names:true};
 L.request=async()=>({surface:'黒\nずん',entries:[],morphology:{}});
 const furigana=annotations(text,await L.tokenizeWhole(text,N));
 assert.deepEqual(furigana,[{start:0,end:1,reading:'くろ'}]);
 const word=await L.word({text,start:0,end:4},undefined,N);
 assert.equal(word.reading,'クロズン','one word over the break, not 黒 + ず + ん');
});

test('a token’s own reading is spoken even when the card’s entry spells it otherwise',async()=>{
 const L=stubbed(),N={names:true};
 L.request=async()=>({surface:'説教',entries:[{id:1,spellings:['説教'],readings:['せっこう']}],morphology:{base:'説教'}});
 const word=await L.word({text:'説教だし',start:0,end:2},1,N);
 assert.equal(word.reading,'セッキョウ');assert.equal(word.ambiguous,false,'the furigana’s reading, not the engine’s guess');
});
