'use strict';
/* RRFZ #1192 (SudachiDict Full + JMdict): Sudachi normalizes colloquial kana words to a kanji lemma read otherwise (めっちゃ→目茶 めちゃ,
   やっぱり→矢張り やはり, いい→良い よい, ちっちゃい→小さい ちいさい, すっごく→凄い すごい). #1192 headed the card with that lemma and listed the
   word itself as a homophone. The lemma heads it only when read as the word is; else the entries read as the kana word do.
   JMdict rows are bundled jmdict.json entries (spellings, readings, rank as shipped); token rows are SudachiDict Full output. */
const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path');
const {LocalLearning}=require('../core/learning-native.cjs');
const JM=[
 {id:2183440,spellings:['滅茶'],readings:['めっちゃ','めっっちゃ'],freq_rank:5544},
 {id:1808040,spellings:['目茶','滅茶'],readings:['めちゃ'],freq_rank:90567},
 {id:1012810,spellings:['矢っ張り'],readings:['やっぱり'],freq_rank:140},
 {id:2772770,spellings:['矢張り','矢張'],readings:['やはり'],freq_rank:507},
 {id:2772780,spellings:[],readings:['やっぱ'],freq_rank:1547},
 {id:2820690,spellings:[],readings:['いい'],freq_rank:31},
 {id:1605820,spellings:['良い','好い','善い','佳い'],readings:['よい','えい'],freq_rank:229},
 {id:1347780,spellings:['小っちゃい'],readings:['ちっちゃい'],freq_rank:30079},
 {id:1347750,spellings:['小さい'],readings:['ちいさい'],freq_rank:393},
 {id:2179800,spellings:[],readings:['すっごい','すんごい'],freq_rank:1151},
 {id:1374550,spellings:['凄い'],readings:['すごい','すっごーい'],freq_rank:147},
 {id:1384830,spellings:['切る'],readings:['きる'],freq_rank:812},
 {id:1423000,spellings:['着る','著る'],readings:['きる'],freq_rank:748},
];
function learning(){
 const L=new LocalLearning(path.join(os.tmpdir(),'megulit-colloquial-kana'));
 L.load=function(){if(this.index)return;const index=new Map(),byId=new Map();for(const e of JM){byId.set(e.id,{pos:[],definitions:['-'],...e});for(const k of [...e.spellings,...e.readings])index.set(k,[...(index.get(k)||[]),e.id]);}Object.assign(this,{index,byId,english:new Map()});};
 L.adapt=e=>({...e});return L;
}
const head=(L,t)=>{const list=L.entries(t,'zh');return {first:list[0]?.id,reading:list.filter(e=>e.match==='reading').map(e=>e.id)};};
test('a colloquial kana word keeps its own entry at the head and is never its own homophone',()=>{
 const L=learning();
 const cases=[
  [{surface:'めっちゃ',base_form:'めっちゃ',normalized:'目茶',reading:'メッチャ'},2183440],
  [{surface:'やっぱり',base_form:'やっぱり',normalized:'矢張り',reading:'ヤッパリ'},1012810],
  [{surface:'やっぱ',base_form:'やっぱ',normalized:'矢張り',reading:'ヤッパ'},2772780],
  [{surface:'いい',base_form:'いい',normalized:'良い',reading:'イイ'},2820690],
  [{surface:'ちっちゃい',base_form:'ちっちゃい',normalized:'小さい',reading:'チッチャイ'},1347780],
  [{surface:'すっごく',base_form:'すっごい',normalized:'凄い',reading:'スッゴク'},2179800],
 ];
 for(const [token,id] of cases){const r=head(L,token);assert.equal(r.first,id,token.surface);assert.ok(!r.reading.includes(id),token.surface+' is not its own homophone');}
});
test('a normalized lemma read as the word is still heads the card (#1111 unchanged)',()=>{
 const L=learning();
 const kiru=L.entries({surface:'きる',base_form:'きる',normalized:'切る',reading:'キル'},'zh');
 assert.deepEqual(kiru.map(e=>[e.id,e.match||'spelling']),[[1384830,'spelling'],[1423000,'reading']]);
});
