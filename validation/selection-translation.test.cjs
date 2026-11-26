'use strict';
/* QQ #1139 (2026-11-23): a phrase selected by dragging (or a long press) is looked up word by word but never translated. The card
   now shows 选区翻译 from the same translation chain as the lines, without touching the lines' context, cache or backfill. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('a detached phrase uses the recent lines as context but never becomes one of them',async()=>{
 const {createTranslationService}=require('../core/providers.cjs'),calls=[];
 const translator=createTranslationService(async(url,request)=>{calls.push(JSON.parse(request.body));return {ok:true,json:async()=>({choices:[{message:{content:'译文'+calls.length}}]})};},'fixture-key');
 const common={provider:'gpt',contextEnabled:true,contextLines:4};
 await translator.translate('一行目のセリフ。',common);
 await translator.translate('二行目のセリフだ。',common);
 await translator.translate('セリフだ',{...common,detached:true});
 await translator.translate('三行目のセリフです。',common);
 const text=call=>JSON.stringify(call.messages);
 assert.ok(text(calls[2]).includes('二行目のセリフだ。'),'the phrase sees the line it came from');
 assert.ok(!text(calls[3]).includes('"セリフだ"')&&!/source[^}]*セリフだ"/.test(text(calls[3])),'the next line does not see the phrase as a line');
 assert.ok(text(calls[3]).includes('二行目のセリフだ。'),'the game lines stay its context');
});
test('the reader translates a selection quietly through the line chain',()=>{
 const reader=read('services/reader.cjs');
 assert.match(reader,/case 'lookupTranslate':\{[^]*?this\.chainTranslate\(selection,this\.requestOptions\(\),\{current:\(\)=>this\.lookupTranslation===serial,quiet:true\}\)/);
 assert.match(reader,/reply\('lookupDeliver',r\.id,\{text:String\(result\?\.text\|\|''\),kind:'translation'/);
 assert.match(reader,/onLate:r=>\{if\(quiet\|\|!this\.active\(\)/,'no late backfill of a phrase into the lines');
 assert.match(reader,/learnerLanguage:requestLanguage,\.\.\.\(quiet\?\{detached:true\}:\{\}\)\}/);
});
test('the lookup card asks for and shows 选区翻译 for a drag selection only',()=>{
 const s=read('web/reader/modules/selection.js');
 assert.match(s,/send\(\{type:'lookupTranslate',id,args:\{text:args\.text,start:args\.start,end:args\.end\}\}\)/);
 assert.match(s,/const drag=!result;\s*if\(drag&&\[\.\.\.String\(args\.text\|\|''\)\]\.slice\(args\.start,args\.end\)\.join\(''\)\.trim\(\)\)\{const label='选区翻译'/);
 assert.match(s,/card\.append\(top,actions,ai,translated,body,origin\)/,'after the AI result box, so the AI buttons keep reading their own box');
 assert.match(s,/translateSelection\(mine\)\.then\(value=>\{if\(current!==mine\|\|!card\)return;/,'an answer for a closed or replaced card is dropped');
});
test('closing the card drops its selection translation, so queued attempts and fallbacks stop (Codex #1175)',()=>{
 const reader=read('services/reader.cjs');
 assert.match(reader,/case 'lookupCancel':this\.lookup\+\+;this\.lookupTranslation=\(this\.lookupTranslation\|\|0\)\+1;/);
});
