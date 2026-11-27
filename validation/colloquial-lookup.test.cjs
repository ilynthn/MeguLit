// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* QQ group (舐めんなし: click on it, nothing happens): SudachiDict Full + JMdict only read standard Japanese, so a colloquial contraction
   (舐めんな, わかんねえ, やっとく, 行かなきゃ, すげー) or a word with a dialect ending (舐めんなし, ええやん, そうだべ) found no entry.
   core/colloquial.cjs reads it out: dialect ending cut (marked 方言语尾), contraction written out, deinflected to a JMdict headword;
   otherwise the longest prefix that is listed. JMdict rows below are bundled jmdict.json entries trimmed to the fields used. */
const test=require('node:test'),assert=require('node:assert/strict');
const Colloquial=require('../core/colloquial.cjs');

const V5=r=>["Godan verb with '"+r+"' ending",'transitive verb'],V1=['Ichidan verb','transitive verb'],ADJ=['adjective (keiyoushi)'];
const JM=[
 {id:1,spellings:['舐める','嘗める'],readings:['なめる'],pos:V1,freq_rank:5000},
 {id:2,spellings:['分かる','解る','判る'],readings:['わかる'],pos:V5('ru'),freq_rank:100},
 {id:3,spellings:['凄い'],readings:['すごい'],pos:ADJ,freq_rank:147},
 {id:4,spellings:['遣る'],readings:['やる'],pos:V5('ru'),freq_rank:200},
 {id:5,spellings:['行く','往く'],readings:['いく','ゆく'],pos:["Godan verb - Iku/Yuku special class",'intransitive verb'],freq_rank:50},
 {id:6,spellings:['良い','好い','善い'],readings:['よい','いい','ええ'],pos:['adjective (keiyoushi) - yoi/ii class'],freq_rank:229},
 {id:7,spellings:[],readings:['そう'],pos:['adverb (fukushi)'],freq_rank:60},
 {id:8,spellings:['美味い','旨い'],readings:['うまい'],pos:ADJ,freq_rank:900},
 {id:9,spellings:['無い'],readings:['ない'],pos:ADJ,freq_rank:40},
 {id:10,spellings:['為る'],readings:['する'],pos:['suru verb - included','transitive verb'],freq_rank:20},
 {id:11,spellings:['食べる'],readings:['たべる'],pos:V1,freq_rank:300},
 {id:12,spellings:['飲む'],readings:['のむ'],pos:V5('mu'),freq_rank:400},
 {id:13,spellings:['見る'],readings:['みる'],pos:V1,freq_rank:30},
 {id:14,spellings:['読む'],readings:['よむ'],pos:V5('mu'),freq_rank:350},
 {id:15,spellings:['持つ'],readings:['もつ'],pos:V5('tsu'),freq_rank:250},
 {id:16,spellings:['知る'],readings:['しる'],pos:V5('ru'),freq_rank:120},
 {id:17,spellings:['好き'],readings:['すき'],pos:['adjectival nouns or quasi-adjectives (keiyodoshi)'],freq_rank:500},
 {id:18,spellings:['来る'],readings:['くる'],pos:['Kuru verb - special class','intransitive verb'],freq_rank:35},
 {id:19,spellings:['雨'],readings:['あめ'],pos:['noun (common) (futsuumeishi)'],freq_rank:800},
 {id:20,spellings:['でかい'],readings:['でかい'],pos:ADJ,freq_rank:3000},
 {id:21,spellings:['帰る'],readings:['かえる'],pos:V5('ru'),freq_rank:180},
 {id:22,spellings:['言う','云う'],readings:['いう','ゆう'],pos:V5('u'),freq_rank:25},
 {id:23,spellings:['行う'],readings:['おこなう'],pos:V5('u'),freq_rank:600},
 {id:24,spellings:['奴'],readings:['やつ'],pos:['noun (common) (futsuumeishi)'],freq_rank:700},
 {id:25,spellings:['無し'],readings:['なし'],pos:['noun (common) (futsuumeishi)'],freq_rank:1500},
 {id:26,spellings:['寒い'],readings:['さむい'],pos:ADJ,freq_rank:1200},
 {id:27,spellings:['違う'],readings:['ちがう'],pos:V5('u'),freq_rank:90},
 {id:28,spellings:[],readings:['ええ'],pos:['interjection (kandoushi)'],freq_rank:1000},
];
const index=new Map(),byId=new Map();
for(const e of JM){byId.set(e.id,e);for(const k of [...e.spellings,...e.readings])index.set(k,[...(index.get(k)||[]),e.id]);}
const lookup=key=>(index.get(key)||[]).map(id=>byId.get(id));
const idOf=word=>{const r=Colloquial.resolve(word,lookup);return r?lookup(r.base)[0]?.id:null;};

const CASES=[
 // 舐めんなし: 舐めるな (prohibition) → 舐めんな (る→ん) + Koshu し
 ['舐めんなし',1],['舐めんな',1],['わかんねえ',2],['わかんない',2],['すんの',10],
 ['すげー',3],['すげえ',3],['うめえ',8],['ねえ',9],['行きてえ',5],['さみい',26],
 ['行っちゃう',5],['食べちゃった',11],['飲んじゃう',12],['見ちゃ',13],['帰っちゃ',21],
 ['やっとく',4],['やっといた',4],['読んどく',14],['食べてる',11],['言ってた',22],['持ってく',15],
 ['行かなきゃ',5],['食べなくちゃ',11],['行かなけりゃ',5],
 ['そうっす',7],['いいっす',6],
 ['ええやん',6],['そうだべ',7],['行くべさ',5],['でかいべ',20],['行かへん',5],['知らんねん',16],['好きやで',17],
 ['来るけん',18],['そうじゃけ',7],['雨やさかい',19],['行かはる',5],['ちゃうやん',27],
];

test('each colloquial or dialect form is looked up as its dictionary headword',()=>{
 assert.ok(CASES.length>=30);
 const wrong=CASES.filter(([word,id])=>idOf(word)!==id).map(([word,id])=>word+' → '+idOf(word)+' (want '+id+')');
 assert.deepEqual(wrong,[]);
});

test('a dialect ending is reported with its region and note; a contraction with the rule used',()=>{
 const r=Colloquial.resolve('舐めんなし',lookup);
 assert.equal(r.base,'舐める');assert.equal(r.dialect.ending,'し');assert.equal(r.prefix,false);
 assert.ok(r.rules.some(x=>/ん→る/.test(x)),'ん→る named');
 assert.match(Colloquial.describe(r,'zh'),/方言语尾「し」/);
 assert.match(Colloquial.describe(r,'en'),/Dialect ending「し」/);
 const plain=Colloquial.resolve('わかんねえ',lookup);assert.equal(plain.dialect,null,'no dialect ending in a plain contraction');
 assert.equal(Colloquial.resolve('ええやん',lookup).dialect.ending,'やん');
 assert.equal(Colloquial.resolve('そうだべ',lookup).dialect.ending,'だべ','the longer ending is cut first');
});

test('when the whole string never resolves, the longest listed prefix is taken; nothing at all stays null',()=>{
 const r=Colloquial.resolve('食べるぽよ',lookup);
 assert.deepEqual([r.base,r.matched,r.rest,r.prefix],['食べる','食べる','ぽよ',true]);
 assert.match(Colloquial.describe(r,'zh'),/只查了前面的：食べる｜未查：ぽよ/);
 assert.equal(Colloquial.resolve('ぽよぽよ',lookup),null);
 assert.equal(Colloquial.resolve('',lookup),null);
 assert.equal(Colloquial.resolve('!?',lookup),null);
});

test('standard words still resolve as written (no rewrite, no dialect)',()=>{
 for(const [word,id]of [['食べる',11],['分かる',2],['凄い',3],['食べた',11],['行かない',5]]){const r=Colloquial.resolve(word,lookup);assert.equal(lookup(r.base)[0].id,id,word);assert.equal(r.dialect,null,word);assert.deepEqual(r.rules,[],word);}
});

test('every dialect ending row has a note and region in Chinese, English and Japanese',()=>{
 for(const d of Colloquial.ENDINGS){assert.ok(d.ending,'ending');for(const l of ['zh','en','ja']){assert.ok(d.note?.[l],d.ending+' note '+l);assert.ok(d.region?.[l],d.ending+' region '+l);}}
 for(const word of ['し','べ','べさ','やん','へん','ねん','けん','じゃけ','だべ','ちゃ','はる','やで','さかい'])assert.ok(Colloquial.ENDINGS.some(d=>d.ending===word),word);
});

