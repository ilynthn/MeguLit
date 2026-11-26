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
