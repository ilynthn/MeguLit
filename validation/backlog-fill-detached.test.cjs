'use strict';
/* RRFZ #1176: the log fills its old lines in the background (backlog.js askMissing -> translateGuard). Those requests were written into the live
   dialogue history, so the next game line sent to an LLM had two old narration lines as its "previous" context. They are detached now. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Reader}=require('../services/reader.cjs'),{createTranslationService}=require('../core/providers.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('the log asks its missing lines detached',()=>{
 const log=read('web/reader/modules/backlog.js');
 const ask=/function askMissing\(\)\{[^]*?\}\/\*/.exec(log);
 assert.ok(ask,'askMissing found');
 assert.match(ask[0],/send\(\{type:'translateGuard',text:t,detached:true\}\)/);
});
const guard=async(message)=>{
 const r=Object.create(Reader.prototype),seen=[];
 Object.assign(r,{displayLanguage:()=>'zh',gal:{hooks:{trace(){},scriptTranslation:()=>''}},runtime:{emit(){}},baseOptions:()=>({}),chainTranslate:async(t,o,extra)=>{seen.push(extra);return {text:'译:'+t};}});
 await r.message(message);await new Promise(res=>setTimeout(res,30));
 return seen[0];
};
test('translateGuard passes detached on to the chain only when asked',async()=>{
 assert.equal((await guard({type:'translateGuard',text:'雨が降り始めた。',detached:true})).detached,true);
 assert.equal((await guard({type:'translateGuard',text:'「行こう」'})).detached,false,'the visible line guard stays in the dialogue');
 assert.equal((await guard({type:'translateGuard',text:'「行こう」',detached:'yes'})).detached,false,'only true counts');
});
test('the chain hands detached to the translator without making the request quiet',async()=>{
 const r=Object.create(Reader.prototype),opts=[],events=[];
 Object.assign(r,{root:'Z:/unit-no-store',gameId:'unit',visualGeneration:1,prefs:()=>({provider:'gpt'}),zeroLatencyEnabled:()=>false,loadKeys(){},
  translator:()=>({hasKey:()=>true,translate:async(text,o)=>{opts.push(o);return 'T:'+text;}}),runtime:{emit:(n,m)=>events.push(m),local:()=>({status:()=>({installed:false})}),models:()=>({status:()=>({models:[]})})}});
 await r.chainTranslate('雨が降り始めた。',{provider:'gpt',learnerLanguage:'zh'},{detached:true});
 assert.equal(opts[0].detached,true);
 await r.chainTranslate('「行こう」',{provider:'gpt',learnerLanguage:'zh'});
 assert.equal(opts[1].detached,undefined);
});
test('a detached old line does not push the recent lines out of the next request',async()=>{
 const calls=[],translator=createTranslationService(async(url,request)=>{calls.push(JSON.parse(request.body));return {ok:true,json:async()=>({choices:[{message:{content:'译文'+calls.length}}]})};},'fixture-key');
 const o={provider:'gpt',contextEnabled:true,contextLines:4};
 for(const line of ['一行目。','二行目。','三行目。','四行目。'])await translator.translate(line,o);
 await translator.translate('ずっと前の地の文。',{...o,detached:true});
 await translator.translate('もっと前の地の文。',{...o,detached:true});
 await translator.translate('五行目。',o);
 const last=JSON.stringify(calls.at(-1).messages);
 for(const line of ['二行目。','三行目。','四行目。'])assert.ok(last.includes(line),line+' still the context');
 assert.ok(!last.includes('ずっと前の地の文。')&&!last.includes('もっと前の地の文。'),'the old narration is not');
});
