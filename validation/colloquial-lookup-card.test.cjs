// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* QQ group (舐めんなし: click on it, nothing happens): the lookup card for a colloquial or dialect word SudachiDict leaves unknown,
   and the AI gloss asked for when nothing is found. The word-level cases are in colloquial-lookup.test.cjs. This file only uses
   the lookup card and the AI service, so it runs on the code before core/colloquial.cjs existed (and fails there: empty card). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LocalLearning}=require('../core/learning-native.cjs');
const {createReadingResolver}=require('../core/reading.cjs');

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
// The lookup card itself: SudachiDict leaves the word unknown (one token, not in JMdict); before core/colloquial.cjs the card was empty.
const SUDACHI={
 '舐めんなし！':[['舐めんなし','ナメンナシ','名詞,普通名詞,一般,*,*,*'],['！','！','補助記号,句点,*,*,*,*']],
 'ええやん':[['ええやん','エエヤン','名詞,普通名詞,一般,*,*,*']],
 '食べるぽよ':[['食べる','タベル','動詞,一般,*,*,下一段-バ行,終止形-一般'],['ぽよ','ポヨ','名詞,普通名詞,一般,*,*,*']],
 '食べるぽよ。':[['食べるぽよ','タベルポヨ','名詞,普通名詞,一般,*,*,*'],['。','。','補助記号,句点,*,*,*,*']],
 'ぽよぽよ':[['ぽよぽよ','ポヨポヨ','名詞,普通名詞,一般,*,*,*']],
};
function tokens(text){let at=0;return (SUDACHI[text]||[]).map(([surface,reading,pos,base=surface])=>{const grammar=pos.split(','),t={surface,reading,grammar,pos:grammar[0],base_form:base,normalized:base,start:at,end:at+[...surface].length,pitch:[]};at=t.end;return t;});}
function learning(dir){
 const L=new LocalLearning(dir);L.ready=async()=>{};L.raw=async text=>tokens(text);
 L.readings=createReadingResolver(path.join(dir,'no-jmdict.json'));L.furigana=null;
 L.load=function(){if(this.index)return;this.index=new Map();this.byId=new Map();this.english=new Map();for(const e of JM){const full={kana_only:false,ke_inf:e.spellings.map(()=>[]),re_inf:e.readings.map(()=>[]),re_restr:e.readings.map(()=>[]),re_nokanji:e.readings.map(()=>false),priority:[],definitions:['-'],...e};this.byId.set(e.id,full);for(const k of [...e.spellings,...e.readings])this.index.set(k,[...(this.index.get(k)||[]),e.id]);}};
 return L;
}
test('the lookup card finds 舐めんなし and marks the dialect ending; a click on it does too',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-colloquial-'));
 try{
  const L=learning(dir);
  const exact=await L.request('lookup_exact',{text:'舐めんなし！',start:0,end:5},'zh');
  assert.equal(exact.entries[0]?.id,1,'舐める heads the card');
  assert.equal(exact.colloquial.dialect.ending,'し');assert.match(exact.match_note,/方言语尾/);
  assert.equal(exact.selection_analysis.exact,true);
  const click=await L.request('lookup_at_position',{text:'舐めんなし！',position:2},'zh');
  assert.deepEqual([click.entries[0]?.id,click.start,click.end,click.colloquial.prefix],[1,0,5,false]);
  const kansai=await L.request('lookup_exact',{text:'ええやん',start:0,end:4},'zh');
  assert.equal(kansai.entries[0]?.id,6,'ええやん is 良い, not the interjection ええ');
  const prefix=await L.request('lookup_exact',{text:'食べるぽよ。',start:0,end:5},'zh');
  assert.deepEqual([prefix.entries[0]?.id,prefix.colloquial.prefix,prefix.colloquial.rest,prefix.end],[11,true,'ぽよ',3]);
  const pieces=await L.request('lookup_exact',{text:'食べるぽよ',start:0,end:5},'zh');
  assert.deepEqual([pieces.entries[0]?.id,pieces.colloquial],[11,undefined],'a selection over words SudachiDict found keeps their entries, no prefix guess');
  const plain=await L.request('lookup_exact',{text:'食べるぽよ',start:0,end:3},'zh');
  assert.equal(plain.entries[0]?.id,11);assert.equal(plain.colloquial,undefined,'a word SudachiDict found is untouched');
  const none=await L.request('lookup_exact',{text:'ぽよぽよ',start:0,end:4},'zh');
  assert.deepEqual(none.entries,[]);assert.equal(none.colloquial,undefined);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('AI gloss: one line from the context model, kind gloss, cached',async()=>{
 const {createTranslationService}=require('../core/providers.cjs');let calls=0,body=null;
 const service=createTranslationService(async(url,init)=>{calls++;body=JSON.parse(init.body);return {ok:true,json:async()=>({choices:[{message:{content:'别小看我（山梨方言，＝舐めるなよ）'}}]})};});
 const ask=()=>service.lookup({selection:'舐めんなし',sentence:'舐めんなし！',entries:[],mode:'gloss'},{provider:'gpt',baseUrl:'http://127.0.0.1:11434/v1',model:'qwen2.5:7b'},()=>true);
 const r=await ask();
 assert.deepEqual([r.kind,r.text],['gloss','别小看我（山梨方言，＝舐めるなよ）']);
 assert.match(JSON.parse(body.messages[1].content).instruction,/本地辞书查不到/);assert.equal(body.max_tokens,200);
 await ask();assert.equal(calls,1,'the second ask is served from the cache');
});
