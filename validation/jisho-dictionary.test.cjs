'use strict';
// 2026-11-13 English interface online lookup via Jisho: parsing, cache, shared in-flight request, spacing, UI wiring.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const J=require('../services/jisho-dictionary.cjs');
const sample={meta:{status:200},data:[
 {slug:'食べる',is_common:true,jlpt:['jlpt-n5'],japanese:[{word:'食べる',reading:'たべる'},{word:'喰べる',reading:'たべる'}],
  senses:[{english_definitions:['to eat'],parts_of_speech:["Ichidan verb","Transitive verb"]},{english_definitions:['to live on (e.g. a salary)','to subsist on'],parts_of_speech:['Ichidan verb']}]},
 {slug:'たべる',is_common:false,jlpt:[],japanese:[{reading:'たべる'}],senses:[{english_definitions:['Taberu'],parts_of_speech:['Wikipedia definition']}]}]};

test('Jisho rows have the MOJi result shape with English definitions, parts of speech and JLPT',()=>{
 const rows=J.parse(sample);
 assert.equal(rows[0].spelling,'食べる');assert.equal(rows[0].reading,'たべる');assert.equal(rows[0].source,'jisho');
 assert.equal(rows[0].jlpt,'N5');assert.equal(rows[0].common,true);
 assert.deepEqual(rows[0].partOfSpeech,['Ichidan verb','Transitive verb']);
 assert.match(rows[0].definition,/^1\. to eat\n2\. to live on/);
 assert.deepEqual(rows[0].forms,['喰べる']);
 assert.equal(rows[1].definition,'','Wikipedia-only senses are dropped');
 assert.deepEqual(J.parse(null),[]);
});

test('lookups are cached on disk, shared while in flight and spaced apart',async()=>{
 J._reset();const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jisho-'));let calls=0;const urls=[],times=[];
 const fetcher=async url=>{calls++;urls.push(url);times.push(Date.now());return {ok:true,json:async()=>sample};};
 const [a,b]=await Promise.all([J.lookupJisho('食べる',fetcher,{root}),J.lookupJisho('食べる',fetcher,{root})]);
 assert.equal(calls,1,'same word in flight → one request');assert.equal(a[0].spelling,'食べる');assert.deepEqual(a,b);
 assert.ok(urls[0].startsWith(J.ENDPOINT)&&urls[0].includes(encodeURIComponent('食べる')));
 J._reset();assert.equal((await J.lookupJisho('食べる',fetcher,{root}))[0].jlpt,'N5');assert.equal(calls,1,'disk cache survives a restart');
 await J.lookupJisho('飲む',fetcher,{root});await J.lookupJisho('見る',fetcher,{root});
 assert.equal(calls,3);assert.ok(times[2]-times[1]>=J.GAP_MS-50,'requests are spaced');
 await assert.rejects(J.lookupJisho('走る',async()=>({ok:false}),{root,noThrottle:true}),/JISHO_UNAVAILABLE/);
 assert.deepEqual(await J.lookupJisho('  ',fetcher,{root}),[]);
 fs.rmSync(root,{recursive:true,force:true});
});

test('English interface asks Jisho on the dictionary page and the Anki lookup; Chinese keeps MOJi',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),anki=fs.readFileSync(path.join(__dirname,'../web/anki-review.js'),'utf8'),bridge=fs.readFileSync(path.join(__dirname,'../services/bridge.cjs'),'utf8');
 assert.match(app,/onlineSource=locale==='en'\?'jisho':'moji'/);assert.match(app,/source:online\?onlineSource:'local'/);
 assert.match(anki,/q\(locale==='en'\?'jisho':'moji'\)[\s\S]{0,200}catch\(\(\)=>q\('local'\)\)/);
 assert.match(bridge,/request\.source==='jisho'\?await require\('\.\/jisho-dictionary\.cjs'\)\.lookupJisho/);
});
