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
/* RRFZ #1176: an older copy of a repeated line was never filled, because the newer translated copy stopped the search */
test('a fill for a repeated line skips translated copies and reaches the older empty one',()=>{
 const log=read('web/reader/modules/backlog.js'),m=/function translated\(src,text,keep\)\{[^]*?refreshLog\(\);\}\}/.exec(log);
 assert.ok(m,'translated() found');
 const make=new Function('entries','norm','split','persist','refreshLog',m[0]+'\nreturn translated;');
 const entries=[{src:'「はい」',tr:''},{src:'「違う」',tr:'不对'},{src:'「はい」',tr:'是的'}];
 let saved=0;const translated=make(entries,t=>t,t=>({text:t}),()=>saved++,()=>{});
 translated('「はい」','是的',true);
 assert.deepEqual(entries.map(e=>e.tr),['是的','不对','是的']);
 assert.equal(saved,1);
 translated('「はい」','好',true);
 assert.deepEqual(entries.map(e=>e.tr),['是的','不对','是的'],'keep: nothing translated is overwritten');
 translated('「はい」','好');
 assert.equal(entries[2].tr,'好','without keep the newest copy is replaced as before');
});
/* RRFZ #1289: with keep, every empty copy of a repeated line in the window is filled, not only the newest empty one */
test('a kept fill reaches every empty copy of a repeated line and saves once',()=>{
 const log=read('web/reader/modules/backlog.js'),m=/function translated\(src,text,keep\)\{[^]*?refreshLog\(\);\}\}/.exec(log);
 const make=new Function('entries','norm','split','persist','refreshLog',m[0]+'\nreturn translated;');
 const entries=[{src:'「はい」',tr:''},{src:'「はい」',tr:''},{src:'「違う」',tr:'不对'},{src:'「はい」',tr:'是的'},{src:'「はい」',tr:''}];
 let saved=0;make(entries,t=>t,t=>({text:t}),()=>saved++,()=>{})('「はい」','是',true);
 assert.deepEqual(entries.map(e=>e.tr),['是','是','不对','是的','是']);
 assert.equal(saved,1);
 saved=0;make(entries,t=>t,t=>({text:t}),()=>saved++,()=>{})('「無い」','无',true);
 assert.equal(saved,0,'nothing to fill, nothing saved');
});
