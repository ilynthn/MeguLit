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
 assert.match(reader,/learnerLanguage:requestLanguage,\.\.\.\(detached\?\{detached:true\}:\{\}\)\}/);
 assert.match(reader,/quiet=false,detached=quiet\}=\{\}\)\{/,'a quiet request is always detached');
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
test('the selection translation is never rewritten by polish.js as AI explanation rows (RRFZ #1175)',()=>{
 const s=read('web/reader/modules/selection.js'),polish=read('web/reader/modules/polish.js');
 const block=/const label='选区翻译';[^]*?选区翻译失败'\)\);place\(\);\}\);\}/.exec(s);
 assert.ok(block,'selection translation block found');
 const make=/const line=\(cls,text\)=>\{(const n=el\('div',cls,text\);n\.dataset\.mgLines='1';return n;)\}/.exec(block[0]);
 assert.ok(make,'every line of the box is created marked');
 const line=new Function('el','return (cls,text)=>{'+make[1]+'}')((tag,cls,text)=>({tag,className:cls,textContent:text,dataset:{}}));
 assert.equal(line('','注意：这是译文').dataset.mgLines,'1');
 assert.equal((block[0].match(/el\('div'/g)||[]).length,1,'no unmarked div is put in the box');
 assert.equal((block[0].match(/line\('/g)||[]).length,3,'pending, answer and error lines all marked');
 for(const m of polish.matchAll(/document\.querySelectorAll\('\.tomoyo-ai-result > div([^']*)'\)/g))assert.equal(m[1],':not([data-mg-lines])','polish skips marked boxes');
});
