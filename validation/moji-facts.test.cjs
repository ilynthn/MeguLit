'use strict';
// 2026-11-13 word card shows MOJi's own class, JLPT level and lookup count (user: 词性、JLPT、使用频繁度直接接 MOJi).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../services/moji-dictionary.cjs');
const word={objectId:'198970381',spell:'食べる',pron:'たべる',excerpt:'[他动·一段] 吃，进食',tags:'N2#N5#考研',viewedNum:13571};
const reply=body=>({ok:true,status:200,json:async()=>body});

test('JLPT comes from MOJi tags, easiest level first',()=>{
 assert.deepEqual(M.jlpt('N2#N5#考研'),{jlpt:'N5',jlptAll:['N5','N2']});
 assert.deepEqual(M.jlpt(''),{jlpt:'',jlptAll:[]});
});

test('facts keep MOJi labels and the lookup count',()=>{
 const f=M.facts(word,[{partOfSpeech:[8]}]);
 assert.deepEqual(f.partOfSpeech,['他动']);assert.equal(f.verbType,'一段');assert.equal(f.verbGroup,'二类');
 assert.equal(f.jlpt,'N5');assert.equal(f.views,13571);
});

test('wordFacts only uses an entry whose spelling and reading match',async()=>{
 const calls=[];
 const fetcher=async(url,init)=>{calls.push(url);
  if(url.endsWith('word-clickSearchV2'))return reply({result:{result:{word:[{...word,spell:'今日',pron:'きょう',objectId:'1'}],details:[]}}});
  if(url.endsWith('union-api'))return reply({result:{results:{'search-all':{result:{word:{searchResult:[{title:'今日 | こんにち ◎',targetId:'2'}]}}}}}});
  if(url.includes('detailInfo?wordId=2'))return reply({word:[{...word,spell:'今日',pron:'こんにち',tags:'',viewedNum:168,excerpt:'[名] 今天',objectId:'2'}],details:[]});
  throw Error('unexpected '+url);};
 const other=await M.wordFacts('今日','コンニチ',{fetcher});
 assert.equal(other.id,'2');assert.equal(other.pron,'こんにち');assert.equal(other.jlpt,'');assert.equal(other.views,168);
 assert.equal(await M.wordFacts('明日','あした',{fetcher:async url=>url.endsWith('union-api')?reply({result:{results:{}}}):reply({result:{result:{word:[]}}})}),null);
});

test('reader serves mojiFacts and the card paints it next to the class',()=>{
 const reader=fs.readFileSync(path.join(__dirname,'../services/reader.cjs'),'utf8');
 assert.match(reader,/action==='mojiFacts'\)return await require\('\.\/moji-dictionary\.cjs'\)\.cachedFacts/);
 const card=fs.readFileSync(path.join(__dirname,'../web/reader/modules/selection.js'),'utf8');
 assert.match(card,/request\('mojiFacts',\{word,reading\}/);
 assert.match(card,/tomoyo-word-jlpt/);assert.match(card,/'被查 '\+views/);
});
