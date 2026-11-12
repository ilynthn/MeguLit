'use strict';
// 2026-11-13: games shown in another language (DDLC Plus, 9-nine in English), the translation flash and the Chinese font stack.
const test=require('node:test');const assert=require('node:assert');const fs=require('node:fs');const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('Unity text plugins (TextTypewriterEffect) are hooked once the Unity JIT hooks are in',()=>{
 const s=read('native/HookBridge.cs');
 assert.match(s,/"Luna_InsertHookCode"/);
 assert.match(s,/EHMF2@TextTypewriterEffect:TextTypewriterEffect:TextTypewriterEffect:StartText:7:JIT:UNITY/);
 assert.match(s,/Contains\(":JIT:UNITY"\)&&!UnityPluginHooks&&_Luna_InsertHookCode!=null/);
});

test('the foreign line the game draws on another writable stream is hidden next to the selected line',()=>{
 const s=read('native/HookBridge.cs');
 assert.match(s,/static bool ForeignTwin\(string text\)/);
 assert.match(s,/TwinEmbed\.Add\(tp\.Key\(\)\)/,'embedding is switched on for the twin stream');
 assert.match(s,/Math\.Abs\(\(twinNow-LastSourceAt\)\.TotalMilliseconds\)<1500/);
 assert.match(read('native/EmbedTextPolicy.cs'),/\(Resource\.IsMatch\(value\) && !Prose\.IsMatch\(value\)\)/,'English prose with a comma is dialogue, not a resource');
});

test('hook-control keeps the stream the foreign picker mapped to dialogue; a manual pick is marked',()=>{
 assert.match(read('core/hook-control.cjs'),/const foreignPicked=h\.hooks\.foreignPicked&&threads\.find/);
 assert.match(read('services/reader.cjs'),/case 'hookSelect':g\?\.hooks\.select\(r\.id,true\)/);
});

test('the previous translation goes as soon as the source line changes',()=>{
 assert.match(read('web/reader/modules/inject.js'),/if\(output&&text&&text!==bridge\.current&&enabled&&translationVisible&&output\.dataset\.state!=='pending'\)\{window\.TomeTypewriter\?\.stop\(output\);output\.replaceChildren\(\)/);
});

test('Chinese never falls back to the partial borrowed-code SubahibiFont, and YaHei comes before SimHei',()=>{
 for(const f of ['web/reader/modules/game-style.js','core/game-style.js']){const s=read(f);
  assert.doesNotMatch(s,/zh:'[^']*SubahibiFont/);assert.doesNotMatch(s,/zh:'[^']*素晴字体/);
  assert.match(s,/zh:'"TomoyoSubahibiCN","Microsoft YaHei","SimHei",sans-serif'/);}
});
