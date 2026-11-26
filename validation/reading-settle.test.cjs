'use strict';
// Furigana of single words (user, 2026-11-23: 「要保证读音和注音是一样的注音是对的」). SudachiDict gave 一回 いちかい and
// 箱 after の ばこ. Only a word whose reading JMdict does not list at all takes the dictionary's single reading; a run
// over 1500 game lines showed wider rules turned right readings wrong (来て らい, 分 ふん, 乾 けん, 街 がい).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createReadingResolver}=require('../core/reading.cjs');

const tok=(surface,reading,grammar,start,end,base=surface)=>({surface,reading,grammar:grammar.split(','),base_form:base,start,end,pitch:[1]});
const NOUN='名詞,普通名詞,一般';
function settle(entries,tokens){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-settle-'));const file=path.join(dir,'jmdict.json');
 fs.writeFileSync(file,JSON.stringify(entries));try{return createReadingResolver(file).settle(tokens);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('a word with a reading the dictionary does not know takes its single reading',()=>{
 const out=settle([{spellings:['箱'],readings:['はこ']},{spellings:['一回'],readings:['いっかい']}],
  [tok('の','ノ','助詞,格助詞',0,1),tok('箱','バコ',NOUN,1,2),tok('、','、','補助記号,読点',2,3),tok('一回','イチカイ',NOUN,3,5)]);
 assert.equal(out[1].reading,'はこ');assert.equal(out[1].readingSource,'dictionary');assert.deepEqual(out[1].pitch,[]);
 assert.equal(out[3].reading,'いっかい');
 assert.equal(out[0],out.at(0));assert.equal(out.length,4);
});

test('right readings the dictionary lists differently are kept',()=>{
 const dict=[{spellings:['分'],readings:['ふん','ぶん','ぶ']},{spellings:['乾'],readings:['けん']},{spellings:['来'],readings:['らい']},
  {spellings:['街'],readings:['がい']},{spellings:['箱'],readings:['はこ']},{spellings:['頃'],readings:['ころ','ごろ']},{spellings:['角'],readings:['かど','かく']}];
 const tokens=[
  tok('分','ブン',NOUN,0,1),                               // one of several readings (分まで)
  tok('乾','イヌイ','名詞,固有名詞,人名',2,3),             // a name
  tok('来','キ','動詞,非自立可能',4,5,'来る'),             // a conjugated verb
  tok('本','ホン',NOUN,6,7),tok('箱','バコ',NOUN,7,8),     // the voiced half of a split compound
  tok('頃','ゴロ',NOUN,9,10),                              // one of several readings
  tok('角','ツノ',NOUN,11,12),                             // several readings, none of them the tokenizer's
 ];
 const out=settle(dict,tokens);
 assert.deepEqual(out.map(t=>t.reading),['ブン','イヌイ','キ','ホン','バコ','ゴロ','ツノ']);
 assert.ok(out.every((t,i)=>t===tokens[i]));
});

test('LocalLearning.tokenize settles single words after names, numbers and dictionary words',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','core','learning-native.cjs'),'utf8');
 assert.match(src,/const own=names\?unknownNames\(this\.withNames\(gameTokens\(plain,game\)\)\):plain;/,'the game’s own readings, then VNDB names, then guessed names dropped (#1134)');
 assert.match(src,/contextual\(text,this\.readings\.settle\(contextReadings\(this\.dictionaryWords\(numberTokens\(own\)\)\)\)\)/,'context readings (生 せい, #1123) come after the dictionary words and before settle');
});
