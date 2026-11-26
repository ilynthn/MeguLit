'use strict';
/* RRFZ review of #1175: a quiet selection translation (lookupTranslate) is the card's own business. A better answer that comes
   late must never reach the game line (compositorText), the line cache or the log backfill. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const chain=require('../services/translation-chain.cjs'),{Reader}=require('../services/reader.cjs');
const source=fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8');
const harness=({strict=false,provider='gpt'}={})=>{
 const r=Object.create(Reader.prototype),events=[],drawn=[],cached=[];
 Object.assign(r,{root:'Z:/unit-no-store',gameId:'unit',visualGeneration:1,prefs:()=>({provider,learnerLanguage:'zh'}),zeroLatencyEnabled:()=>strict,loadKeys(){},
  translator:()=>({hasKey:()=>true,translate:async(text,o)=>{if(!chain.isMt(o.provider))throw Error('unit api down');return 'MT:'+text;}}),
  compositorText:(...args)=>drawn.push(args),embedCached:(...args)=>{cached.push(args);},
  runtime:{emit:(name,message)=>events.push(message),local:()=>({status:()=>({installed:false})}),models:()=>({status:()=>({models:[]})})}});
 return {r,events,drawn,cached};
};
const lateHook=async(quiet)=>{
 const h=harness(),original=chain.translate;let late;
 chain.translate=async(text,list,attempt,opts)=>{late=opts.onLate;return {text:'MT:'+text,provider:'microsoft',source:'mt',early:true};};
 try{await h.r.chainTranslate('選んだ言葉',{provider:'gpt',learnerLanguage:'zh'},{quiet});}finally{chain.translate=original;}
 late({text:'更好的译文',provider:'gpt',source:'api'});
 return h;
};
test('a late better answer for a quiet selection reaches neither the game line nor the cache nor the log',async()=>{
 const h=await lateHook(true);
 assert.deepEqual(h.drawn,[],'compositorText not called');
 assert.deepEqual(h.cached,[],'no line cache');
 assert.ok(!h.events.some(e=>e?.method==='deliverBackfill'),'no backfill');
});
test('a late better answer for a game line still fills it (the quiet check is not a blanket stop)',async()=>{
 const h=await lateHook(false);
 assert.equal(h.drawn.length,1);
 assert.ok(h.events.some(e=>e?.method==='deliverBackfill'&&e.args[1]==='更好的译文'));
});
test('in onLate the quiet return comes before compositorText (merge order of #1175 and #1176)',()=>{
 const late=/onLate:r=>\{([^]*?)\}\}\)\.then/.exec(source);
 assert.ok(late,'onLate found');
 const stop=late[1].indexOf('if(quiet||'),draw=late[1].indexOf('this.compositorText(');
 assert.ok(stop===0,'the quiet check opens the callback');
 assert.ok(draw>stop,'compositorText only after it');
});
test('a quiet selection that falls back to machine translation does not use up the one-time MT notice',async()=>{
 const h=harness();
 const result=await h.r.chainTranslate('選んだ言葉',{provider:'gpt',learnerLanguage:'zh'},{quiet:true});
 assert.equal(result.source,'mt');
 assert.ok(!h.r.mtNoticed,'mtNoticed untouched');
 assert.ok(!h.events.some(e=>e?.method==='mtNotice'));
 await h.r.chainTranslate('本当のセリフ',{provider:'gpt',learnerLanguage:'zh'});
 assert.equal(h.r.mtNoticed,true,'the first game line still gets it');
 assert.equal(h.events.filter(e=>e?.method==='mtNotice').length,1);
});
test('a quiet selection neither reads nor writes the strict MT cache of the lines',async()=>{
 const h=harness({strict:true});
 await h.r.chainTranslate('選んだ言葉',{provider:'gpt',learnerLanguage:'zh'},{quiet:true});
 assert.equal(h.r.strictMtCache?.size||0,0,'nothing written');
 h.r.strictMtCache=new Map();
 for(const p of ['microsoft','google'])h.r.strictMtCache.set(JSON.stringify(['unit','zh',p,'選んだ言葉']),'台词缓存');
 const quiet=await h.r.chainTranslate('選んだ言葉',{provider:'gpt',learnerLanguage:'zh'},{quiet:true});
 assert.equal(quiet.text,'MT:選んだ言葉','not read either');
 const line=await h.r.chainTranslate('選んだ言葉',{provider:'gpt',learnerLanguage:'zh'});
 assert.equal(line.text,'台词缓存','game lines keep using it');
});
