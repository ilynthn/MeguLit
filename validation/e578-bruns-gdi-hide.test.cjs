// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E578 (2026-11-14, ダストマニア・グロテスク～解体挿入新書～, BRUNS, beta36): MeguLit read the line but could not hide it — the
   game's text and MeguLit's copy were both on screen. LunaHook's Bruns hook is std::wstring::push_back (one UTF-16
   character per call, not EMBED_ABLE), and libscr.dll renders the built line with GDI TextOutW into a DIB (its only GDI
   text call, at libscr+0x1cc5e). Generic fix, no engine names: the host switches the selected stream on in the game
   even when it cannot write back; MeguLitHook keeps the text that stream delivers (MeguLitGdiHide.h) and leaves out any
   TextOut/ExtTextOut/DrawText whose string is part of it (plus ruby: short kana in a smaller font right after). The
   first hidden string is reported (MeguLit_GDIHIDE hit) and only then the stream becomes hide-only, so engines that
   do not draw through GDI keep today's behaviour. Native self-test: native/megulithook/selftest/run.cmd. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const {replay}=require('./helpers/hook-replay.cjs');

test('hook DLL: the selected stream that cannot write back feeds the GDI hide, nothing else does',()=>{
 const t=read('native/megulithook/texthook.cc');
 assert.match(t,/#include "MeguLitGdiHide\.h"/);
 assert.match(t,/TextOutput\(tp, hp, buffer, buff\.size\);[\s\S]{0,200}if \(!\(hp\.type & EMBED_ABLE\) && check_embed_able\(tp\)\)\s*MeguLitGdiHide::Feed\(tp, hp, buff\);/);
 const h=read('native/megulithook/MeguLitGdiHide.h');
 assert.match(h,/attachFunction\(F_TextOutA \| F_TextOutW \| F_ExtTextOutA \| F_ExtTextOutW \| F_DrawTextA \| F_DrawTextW \| F_DrawTextExA \| F_DrawTextExW\)/);
 assert.match(h,/if \(!armed \|\| !\(hit \|\| ruby\) \|\| !check_embed_able\(tp\)\)\s*return false;/,'never hides once the host switches the stream off');
 assert.match(h,/Msg::Log\("MeguLit_GDIHIDE hit fn=%s size=%ld n=%d"/);
 assert.doesNotMatch(h,/bruns|libscr|gameplay/i,'no engine or game names');});
test('hook DLL: GDI functions skip only matched dialogue and otherwise pass through untouched',()=>{
 const c=read('native/megulithook/hijackfuns.cc');
 for(const fn of ['TextOutA','TextOutW','ExtTextOutA','ExtTextOutW','DrawTextA','DrawTextW','DrawTextExA','DrawTextExW'])
  assert.match(c,new RegExp('Hijack::new'+fn+'\\([^)]*\\)\\r?\\n\\{\\r?\\n.*\\r?\\n  .*MeguLitGdiHide::Skip.*"'+fn+'".*if \\(!MeguLitGdiHide::FontWanted\\) return old'+fn+'\\('),fn);
 assert.match(c,/ETO_GLYPH_INDEX\) && MeguLitGdiHide::Skip\(/,'glyph-index strings are never compared');
 assert.match(c,/DT_CALCRECT\) && MeguLitGdiHide::Skip\(/,'measuring calls are never skipped');
 const e=read('native/megulithook/embed_util.cc');
 assert.match(e,/if \(hp\.embed_hook_font\)\s*\{\s*MeguLitGdiHide::FontWanted = true;\s*attachFunction\(hp\.embed_hook_font\);/,'font switching only when an embed hook asked for it, as before');
 for(const f of ['build-x86.cmd','build-x64.cmd'])assert.match(read('native/megulithook/'+f),/for %%F in \(MeguLitGdiHide\.h texthook\.cc hijackfuns\.cc embed_util\.cc\) do copy \/y/,f);});
test('host: probe on selection, hide-only only after the DLL reports a hidden string',()=>{
 const b=read('native/HookBridge.cs');
 assert.ok(b.includes('static bool Armed(Candidate c){return c!=null&&(c.embed||c.gdiProbe);}'));
 assert.ok(b.includes('static bool GdiProbeable(Candidate c){return c!=null&&!c.embed&&c.role!=2&&c.role!=3&&!LoadUnsafe().ContainsKey(UnsafeKey(c.name,c.role));}'),'never the name stream, never a stream marked unsafe');
 assert.ok(b.includes('if(GdiProbeable(c)){c.gdiProbe=true;'));
 assert.ok(b.includes('if(Armed(c)&&ReplacementEnabled){var t3=c.tp;bool v3=true;later.Add(()=>Luna_UseEmbed(t3,v3));}'),'switched on only with replacement on, outside Gate (E560)');
 assert.ok(b.includes('Armed(Candidates[Selected]))Luna_UseEmbed(Candidates[Selected].tp,false);ReplacementEnabled=false;'),'switched off with replacement');
 assert.ok(b.includes('if(Selected==""||!Candidates.TryGetValue(Selected,out c)||!c.gdiProbe||c.embed)return;c.embed=true;c.hideOnly=true;List();'));
 assert.ok(b.includes('if((s??"").StartsWith("MeguLit_GDIHIDE hit",StringComparison.Ordinal))GdiHideHit(s.Substring(20));'));
 assert.ok(b.includes('c.embed=false;if(c.gdiProbe){c.gdiProbe=false;c.hideOnly=false;}'),'an unsafe report turns the GDI hide off too');
 assert.ok(b.includes('if(!c.embed&&OldBgiCharHook(c)){c.embed=true;c.hideOnly=true;'),'E417 old BGI unchanged');});
test('front end: once the GDI report makes the stream hide-only, MeguLit draws the line itself (hide mode)',()=>{
 const {HookNative}=require('../core/hook-native.cjs');const h=Object.create(HookNative.prototype);const sent=[];
 Object.assign(h,{process:{},enabled:true,state:{hookThreads:[{id:'bruns',name:'Bruns',selected:true,embeddable:false}]},preferences:{embedTranslation:true},flowPage:false,send:m=>sent.push(m.mode),trace(){},notify(){}});
 h.syncEmbedMode();assert.deepEqual(sent,['translate'],'before the report: unchanged');
 h.state.hookThreads=[{id:'bruns',name:'Bruns',selected:true,embeddable:true,hideOnly:true}];sent.length=0;h.syncEmbedMode();
 assert.deepEqual(sent,['hide'],'hide-only after the GDI report, even with game-drawn translation preferred');});
test('ダストマニア replay (push_back stream, scene bruns0100): every line is shown once, in order',()=>{
 const r=replay(path.join(__dirname,'helpers','bruns-replay','dustmania-push-back.jsonl'),{name:'gameplay'});
 const shown=[],seen=new Set();for(const e of r.events){if(!e.hookSequence||seen.has(e.hookSequence))continue;seen.add(e.hookSequence);shown.push(e.hookSource);}
 assert.equal(shown.length,4);
 assert.deepEqual(shown.slice(0,3),['遠くで小さく、モーター音がしていることに気がついた。','……なんの、音だろう。これは。','そう思って、耳を澄まそうとする。']);
 assert.match(shown[3],/^聞き覚えがないわけではない。/);});
