'use strict';
/* #1111 (user 2026-11-24, lookup card of 甦る: 「よみがえる这种词下面没有显示异表记下拉栏 明明ひきちぎる这种组合词都会有… 并且不能仅凭读音
   相同就合并，否则会把同音异义词也混在一起」). The JMdict rows are the bundled jmdict.json entries 1606020 (蘇る), 1168810 (引きちぎる),
   1384830 (切る), 1423000 (着る), 1304400 (斬る). The token rows are SudachiDict Full 20261015 output. */
const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path');
const {LocalLearning}=require('../core/learning-native.cjs');
const src=require('./flat-source.cjs')(path.join(__dirname,'..','web','reader','modules','selection.js'));

const JM=[
 {id:1606020,spellings:['蘇る','甦る','蘇える','甦える'],readings:['よみがえる'],pos:['Godan verb with \'ru\' ending'],definitions:['复活'],freq_rank:3335},
 {id:1168810,spellings:['引きちぎる','引き千切る'],readings:['ひきちぎる'],pos:[],definitions:['撕掉'],freq_rank:11402},
 {id:1384830,spellings:['切る'],readings:['きる','キる'],pos:[],definitions:['切割'],freq_rank:812},
 {id:1423000,spellings:['着る','著る'],readings:['きる'],pos:[],definitions:['穿'],freq_rank:748},
 {id:1304400,spellings:['斬る'],readings:['きる'],pos:[],definitions:['砍'],freq_rank:7917},
];
function learning(){
 const L=new LocalLearning(path.join(os.tmpdir(),'megulit-variant-spellings'));
 L.load=function(){if(this.index)return;const index=new Map(),byId=new Map();for(const e of JM){byId.set(e.id,e);for(const k of [...e.spellings,...e.readings])index.set(k,[...(index.get(k)||[]),e.id]);}Object.assign(this,{index,byId,english:new Map()});};
 L.adapt=e=>({...e});return L;
}
const VERB='動詞,一般,*,*,五段-ラ行';

test('a word written in kana is found by the spelling of its lemma; words that only read alike come after, marked',()=>{
 const L=learning();
 const kiru=L.entries({surface:'きる',base_form:'きる',normalized:'切る',reading:'キル',grammar:VERB.split(',')},'zh');
 assert.deepEqual(kiru.map(e=>[e.spellings[0],e.match||'spelling']),[['切る','spelling'],['着る','reading'],['斬る','reading']],'not 着る first because it is the most frequent きる');
 const tear=L.entries({surface:'ひきちぎる',base_form:'ひきちぎる',normalized:'引き千切る',reading:'ヒキチギル',grammar:VERB.split(',')},'zh');
 assert.deepEqual(tear.map(e=>e.id),[1168810]);
 const revive=L.entries({surface:'甦っ',base_form:'甦る',normalized:'蘇る',reading:'ヨミガエッ',grammar:VERB.split(',')},'zh');
 assert.deepEqual(revive.map(e=>[e.id,e.match]),[[1606020,undefined]],'one entry with four spellings');
 const unknown=L.entries({surface:'きる',base_form:'きる',normalized:'きる',reading:'キル',grammar:VERB.split(',')},'zh');
 assert.equal(unknown.length,3,'no entry spelled so: readings find the words, as before');assert.ok(unknown.every(e=>!e.match));
});

test('the lookup card lists the entry’s own spellings as 异表记 and keeps homophones apart',()=>{
 assert.match(src,/function spellings\(result,entry,parent\)\{const list=\[\.\.\.new Set\(entry\?\.spellings\|\|\[\]\)\];if\(list\.length<2\)return;/);
 assert.match(src,/el\('label','tomoyo-alternative tomoyo-spellings','异表记 '\)/);
 assert.match(src,/if\(entry\)\{senses\(entry,sub\);spellings\(result,entry,sub\);\}/,'shown under the senses of the card’s entry');
 assert.match(src,/senses\(replacement\.entries\[0\],sub\);spellings\(replacement,replacement\.entries\[0\],sub\)/,'and of an entry picked from the list');
 assert.match(src,/\['同音词（只是读音相同）',result\.entries\.map\(\(e,i\)=>\[e,i\]\)\.filter\(\(\[e\]\)=>e\.match==='reading'\)\]/);
});
