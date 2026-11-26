// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E417 (player #91/#95, 穢翼のユースティア): old BGI only gets LunaHook's per-character BGI1 hook (HAC:-14@25900, embed=False),
// so the game's text could not be hidden. MeguLitHook's BGI1Text blanks the glyph on the stack when the host switches the
// dialogue thread on; the host does so only for that hook, and the stream is hide-only (no game-drawn translation).
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('hook side: BGI1 reads the character as before and blanks it only for a thread the host switched on',()=>{
 const c=read('native/megulithook/BGI.cpp');
 assert.match(c,/void BGI1Text\(hook_context \*context, HookParam \*hp, TextBuffer \*buffer, uintptr_t \*split\)/);
 assert.match(c,/uintptr_t c = context->stack\[3\];\s*\*split = context->esp;/,'same argument and split as stackoffset(3) / regoffset(esp)');
 assert.match(c,/buffer->size = !!IsDBCSLeadByteEx\(hp->codepage, \(c >> 8\) & 0xff\) \+ 1;/,'same length rule as TextHook::GetLength');
 assert.match(c,/if \(!check_embed_able\(tp\)\)\s*return;/);
 assert.match(c,/\(buffer->size == 2 \? 0x8140 : 0x20\)/,'a blank of the same width');
 assert.equal((c.match(/hp\.text_fun = BGI1Text; \/\/ E417/g)||[]).length,2,'both BGI1 search branches');
 const bgi1=c.slice(c.indexOf('bool InsertBGI1Hook()'),c.indexOf('bool InsertBGI2Hook()'));
 assert.doesNotMatch(bgi1,/EMBED_ABLE/,'never EMBED_ABLE: LunaHook does not wait for a host reply per character');
 const bgi2=c.slice(c.indexOf('bool InsertBGI2Hook()'));assert.match(bgi2,/return NewHook\(hp, "EmbedBGI"\);/,'new BGI (EmbedBGI) untouched');
 assert.match(c,/return NewHook\(hp, "BGI5"\);/,'very old BGI5 untouched');});
test('host side: only the selected old-BGI character stream becomes hide-only',()=>{
 const b=read('native/HookBridge.cs');
 assert.ok(b.includes('static bool OldBgiCharHook(Candidate c){return c!=null&&c.name=="BGI"&&c.code!=null&&c.code.StartsWith("H")&&c.code.EndsWith(":BGI.exe",StringComparison.OrdinalIgnoreCase)&&String.Equals(BoundProcess,"BGI",StringComparison.OrdinalIgnoreCase);}'));
 assert.ok(b.includes('if(!c.embed&&OldBgiCharHook(c)){c.embed=true;c.hideOnly=true;'),'switched on at selection only (the name stream is never selected as dialogue)');
 assert.ok(b.includes('hideOnly=c.hideOnly,selected=item.Key==Selected'));});
test('regression: other streams never match the old-BGI rule',()=>{
 const rule=(name,code,proc)=>name==='BGI'&&code.startsWith('H')&&/:BGI\.exe$/i.test(code)&&/^BGI$/i.test(proc);
 assert.equal(rule('BGI','HAC:-14@25900:BGI.exe','BGI'),true);
 for(const [name,code,proc] of [['EmbedBGI','EXHSXN8:20@3c1d0:BGI.exe','BGI'],['BGI5','HAB8:-8@1234:BGI.exe','BGI'],['EmbedKrkrZ','EHQ@0:krkr.exe','SenrenBanka'],['EmbedSiglus','EHWN@0:SiglusEngine.exe','SiglusEngine'],['BGI','HAC:-14@25900:BGI.exe','SabbatOfTheWitch']])
  assert.equal(rule(name,code,proc),false,name+' '+code);});
test('front end: a hide-only stream never asks the game to draw the translation',()=>{
 const n=read('core/hook-native.cjs'),c=read('core/hook-control.cjs');
 assert.match(n,/const hideOnly=\(this\.state\?\.hookThreads\|\|\[\]\)\.some\(t=>t\.selected&&t\.hideOnly===true\);const want=!!\(this\.process&&this\.enabled&&!hideOnly&&/);
 assert.match(n,/\.\.\.\(t\.hideOnly===true\?\{hideOnly:true\}:\{\}\)(,\.\.\.\(Number\(t\.drawSkipped\)>0\?\{drawSkipped:[^}]*\}:\{\}\))?\}\)\)\}\);this\.syncEmbedMode\(\);/);
 assert.match(c,/!\(h\.hooks\?\.state\?\.hookThreads\|\|\[\]\)\.some\(t=>t\.selected&&t\.hideOnly===true\)/);});
test('regression: without hideOnly the embed-mode decision is the same as before',()=>{
 const {HookNative}=require('../core/hook-native.cjs');const h=Object.create(HookNative.prototype);const sent=[];
 Object.assign(h,{process:{},enabled:true,state:{hookThreads:[{id:'a',selected:true,embeddable:true}]},preferences:{embedTranslation:true},flowPage:false,send:m=>sent.push(m.mode),trace(){},notify(){}});
 h.syncEmbedMode();assert.deepEqual(sent,['translate']);
 h.embedModeSent=undefined;h.state.hookThreads[0].hideOnly=true;sent.length=0;h.syncEmbedMode();assert.deepEqual(sent,['hide']);});
