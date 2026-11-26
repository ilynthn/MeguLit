'use strict';
/* RRFZ #1289 review 2 (SudachiDict Full + bundled JMdict): the kana word's own entry heads the card only when it is the same part of
   speech as the token. イイ (形容詞, lemma 良い) was headed by イイ Iran-Iraq, ちょ (副詞, 一寸) by 著, よー (形状詞, 様) by the interjection,
   いふ (動詞, 言う) by 畏怖, こひ (名詞, 恋) by 虎皮; katakana メッチャ / ヤッパリ were never looked up in hiragana; いい merged 謂 / 易々 / 唯々
   into the head instead of listing them as homophones. JMdict rows are copied from the bundled jmdict.json. */
const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path');
const {LocalLearning}=require('../core/learning-native.cjs');
const JM=[
 {id:1012810,spellings:['矢っ張り'],readings:['やっぱり'],pos:['adverb (fukushi)'],freq_rank:140},
 {id:1157470,spellings:['畏怖'],readings:['いふ'],pos:['noun (common) (futsuumeishi)','noun or participle which takes the aux. verb suru','transitive verb'],freq_rank:14162},
 {id:1163940,spellings:['一寸','鳥渡'],readings:['ちょっと','ちょと','チョット','ちょいと','チョッと'],pos:['adverb (fukushi)','expressions (phrases, clauses, etc.)','interjection (kandoushi)','suffix'],freq_rank:73},
 {id:1536430,spellings:['夜雨'],readings:['やう','よさめ'],pos:['noun (common) (futsuumeishi)'],freq_rank:106077},
 {id:1558670,spellings:['恋','戀','孤悲'],readings:['こい'],pos:['noun (common) (futsuumeishi)'],freq_rank:2028},
 {id:1587040,spellings:['言う','云う','謂う'],readings:['いう','ゆう'],pos:["Godan verb with 'u' ending",'intransitive verb','transitive verb'],freq_rank:24},
 {id:1605820,spellings:['良い','好い','善い','佳い','吉い','宜い'],readings:['よい','えい'],pos:['adjective (keiyoushi)','suffix'],freq_rank:229},
 {id:1605840,spellings:['様'],readings:['よう'],pos:['noun (common) (futsuumeishi)','noun, used as a suffix'],freq_rank:152},
 {id:1808040,spellings:['目茶','滅茶'],readings:['めちゃ'],pos:['adjectival nouns or quasi-adjectives (keiyodoshi)','adverb (fukushi)','noun (common) (futsuumeishi)'],freq_rank:90567},
 {id:1923080,spellings:[],readings:['イイ'],pos:['noun (common) (futsuumeishi)'],freq_rank:31250},
 {id:1956680,spellings:['著'],readings:['ちょ'],pos:['noun (common) (futsuumeishi)','suffix'],freq_rank:61648},
 {id:2158950,spellings:['良う','善う','能う','好う'],readings:['よう','よー'],pos:['adverb (fukushi)'],freq_rank:128321},
 {id:2183440,spellings:['滅茶'],readings:['めっちゃ','めっっちゃ'],pos:['adverb (fukushi)'],freq_rank:5544},
 {id:2672300,spellings:['謂'],readings:['いい'],pos:['noun (common) (futsuumeishi)'],freq_rank:101945},
 {id:2672320,spellings:['易々','易易'],readings:['いい'],pos:["'taru' adjective","adverb taking the 'to' particle"],freq_rank:36359},
 {id:2672330,spellings:['唯々','唯唯'],readings:['いい'],pos:["'taru' adjective","adverb taking the 'to' particle"],freq_rank:116295},
 {id:2706290,spellings:['虎皮'],readings:['こひ'],pos:['noun (common) (futsuumeishi)'],freq_rank:139949},
 {id:2772770,spellings:['矢張り','矢張'],readings:['やはり'],pos:['adverb (fukushi)'],freq_rank:507},
 {id:2820690,spellings:[],readings:['いい'],pos:['adjective (keiyoushi) - yoi/ii class'],freq_rank:31},
 {id:2845172,spellings:[],readings:['ちょ','ちょっ'],pos:['interjection (kandoushi)'],freq_rank:0},
 {id:2853599,spellings:[],readings:['よー','よう','よお'],pos:['interjection (kandoushi)','particle'],freq_rank:11856},
];
function learning(){
 const L=new LocalLearning(path.join(os.tmpdir(),'megulit-colloquial-kana-pos'));
 L.load=function(){if(this.index)return;const index=new Map(),byId=new Map();for(const e of JM){byId.set(e.id,{definitions:['-'],...e});for(const k of [...e.spellings,...e.readings])index.set(k,[...(index.get(k)||[]),e.id]);}Object.assign(this,{index,byId,english:new Map()});};
 L.adapt=e=>({...e});return L;
}
const card=(L,t)=>{const list=L.entries(t,'zh');return {first:list[0]?.id,ids:list.map(e=>e.id),reading:list.filter(e=>e.match==='reading').map(e=>e.id)};};
test('a kana word read like an unrelated noun or interjection keeps its lemma at the head',()=>{
 const L=learning();
 const cases=[
  [{surface:'ちょ',base_form:'ちょ',normalized:'一寸',reading:'チョ',pos:'副詞'},1163940,1956680],
  [{surface:'よー',base_form:'よー',normalized:'様',reading:'ヨー',pos:'形状詞'},1605840,2853599],
  [{surface:'いふ',base_form:'いふ',normalized:'言う',reading:'イフ',pos:'動詞'},1587040,1157470],
  [{surface:'やう',base_form:'やう',normalized:'様',reading:'ヤウ',pos:'形状詞'},1605840,1536430],
  [{surface:'こひ',base_form:'こひ',normalized:'恋',reading:'コヒ',pos:'名詞'},1558670,2706290],
 ];
 for(const [token,head,homophone] of cases){const r=card(L,token);assert.equal(r.first,head,token.surface);assert.ok(r.reading.includes(homophone),token.surface+': '+homophone+' is only a homophone');}
});
test('katakana colloquial words find their own entry through hiragana; the lemma stays on the card',()=>{
 const L=learning();
 const ii=card(L,{surface:'イイ',base_form:'イイ',normalized:'良い',reading:'イイ',pos:'形容詞'});
 assert.equal(ii.first,2820690);assert.ok(ii.ids.includes(1605820),'良い is still listed');assert.ok(ii.reading.includes(1923080),'Iran-Iraq is only a homophone');
 assert.equal(card(L,{surface:'メッチャ',base_form:'メッチャ',normalized:'目茶',reading:'メッチャ',pos:'副詞'}).first,2183440);
 assert.equal(card(L,{surface:'ヤッパリ',base_form:'ヤッパリ',normalized:'矢張り',reading:'ヤッパリ',pos:'副詞'}).first,1012810);
});
test('いい lists unrelated nouns and タリ adjectives read いい as homophones, not as the word',()=>{
 const r=card(learning(),{surface:'いい',base_form:'いい',normalized:'良い',reading:'イイ',pos:'形容詞'});
 assert.equal(r.first,2820690);
 for(const id of [2672300,2672320,2672330])assert.ok(r.reading.includes(id),id+' is a homophone');
 assert.ok(!r.reading.includes(1605820)&&r.ids.includes(1605820),'良い is the lemma, not a homophone');
});
