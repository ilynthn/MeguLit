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
 assert.ok(b.includes('if(Armed(c)&&(ReplacementEnabled||ProbeWanted&&c.gdiProbe)){var t3=c.tp;bool v3=true;later.Add(()=>Luna_UseEmbed(t3,v3));}'),'switched on with replacement on or as a hide probe, outside Gate (E560)');
 assert.ok(b.includes('Armed(Candidates[Selected])&&!(ProbeWanted&&Candidates[Selected].gdiProbe))Luna_UseEmbed(Candidates[Selected].tp,false);ReplacementEnabled=false;'),'switched off with replacement unless the reader still probes');
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

/* E578 live beta38 (2026-11-14): the reader stayed in read mode for the read-only Bruns stream ("select ... replacement=False"),
   so the host never switched the stream on and neither hide ran; the game's line and MeguLit's copy were both drawn. */
const {HookControl}=require('../core/hook-control.cjs');
function control(){
 const notes=[],probes=[];let t=0;
 const h={state:{bound:true,coverEnabled:true,gameProcessId:32048,gameStarted:'1794598452000'},preferences:{hookProfile:'read',hookHide:true,hookAutoStart:true,autoGameStyle:true,hookFast:true},
  hooks:{preflight:false,enabled:false,state:{hookThreads:[]},configure(){},trace(){},select(){},probeHide(on){probes.push(on);this.probing=on;}},
  styleSync:{latest:null,status(){},request(){},begin(){}},send(){},save(p){h.preferences=p;},notify:m=>notes.push(m),onEvent(){}};
 const c=new HookControl(h);c.now=()=>t;c.plan='read';c.running=true;
 return {h,c,notes,probes,tick:ms=>{t+=ms;}};
}
const lines=['遠くで小さく、モーター音がしていることに気がついた。','……なんの、音だろう。これは。','そう思って、耳を澄まそうとする。','聞き覚えがないわけではない。'];
test('reader: a read-only dialogue stream is probed for hiding at once, and becomes the hidden stream after the hook reports a hidden draw',()=>{
 const {h,c,notes,probes,tick}=control();
 h.hooks.state.hookThreads=[{id:'bruns',name:'Bruns',sample:lines[0],selected:true,embeddable:false}];c.apply();
 assert.deepEqual(probes,[true],'probe on with the first line');
 tick(9000);c.apply();assert.ok(!notes.some(n=>n.hookEmbedUnsupported===true),'not called unsupported while the probe runs');
 h.hooks.state.hookThreads=[{id:'bruns',name:'Bruns',sample:lines[1],selected:true,embeddable:true,hideOnly:true}];c.apply();
 assert.equal(c.plan,'embed','hide plan once the stream is hide-only');assert.equal(h.hooks.preferredThread,'bruns');});
test('reader: a probe that never hides anything ends in the feedback after four lines; hiding off stops the probe',()=>{
 const {h,c,notes,probes,tick}=control();
 for(const s of lines){h.hooks.state.hookThreads=[{id:'bruns',name:'Bruns',sample:s,selected:true,embeddable:false}];c.apply();tick(9000);}
 c.apply();assert.ok(notes.some(n=>n.hookEmbedUnsupported===true));
 h.preferences.hookHide=false;c.apply();assert.equal(probes.at(-1),false);});
test('hook-native sends the probe once per state and forgets it with the process',()=>{
 const {HookNative}=require('../core/hook-native.cjs');const n=Object.create(HookNative.prototype),sent=[];
 Object.assign(n,{process:{},send:m=>sent.push(m),trace(){}});
 n.probeHide(true);n.probeHide(true);n.probeHide(false);assert.deepEqual(sent,[{type:'probe',on:true},{type:'probe',on:false}]);
 assert.match(read('core/hook-native.cjs'),/stop\(dispose=true\)\{this\.embedModeSent=undefined;this\.probing=false;/);});
test('host: the probe switches the probed stream on without replacement, keeps it through a read-mode disable, and feeds the glyph hide',()=>{
 const b=read('native/HookBridge.cs');
 assert.ok(b.includes('else if(type=="probe"){object pv;ProbeWanted=d.TryGetValue("on",out pv)&&Convert.ToBoolean(pv);Probe();}'));
 assert.ok(b.includes('!c.gdiProbe)return;tp=c.tp;on=ReplacementEnabled||ProbeWanted;'),'only the stream the GDI hide probes');
 assert.ok(b.includes('bool v1=ReplacementEnabled||ProbeWanted&&c.gdiProbe;'));
 assert.ok(b.includes('Enabled&&Armed(Candidates[Selected])&&(ReplacementEnabled||ProbeWanted&&Candidates[Selected].gdiProbe))Luna_UseEmbed(Candidates[Selected].tp,true);'),'on connect too');
 assert.ok(b.includes('return !GlyphCached&&Enabled&&(ReplacementEnabled||ProbeWanted)&&Selected!=""'),'glyph hide lines are pushed while probing');});
test('reader: where the hook cannot hide the game text, MeguLit does not paint a second copy of the Japanese line over it',()=>{
 const g=read('web/reader/modules/gal.js');
 assert.match(g,/body\.tomoyo-gal-bound\.megulit-readonly-hook \.sentence-window:not\(\.tome-island-page\) \.sentence-text \.char-token \{ -webkit-text-fill-color:transparent!important;/);
 assert.match(g,/megulit-ruby-base\[data-tomoyo-reading\]::before \{ -webkit-text-fill-color:var\(--tomoyo-gal-color/,'ruby keeps its own fill');});
test('release stops on a hook or font DLL older than the hide sources it ships with',()=>{
 const r=read('Release.ps1');
 assert.match(r,/'native\/megulithook\/MeguLitGdiHide\.h','native\/megulithook\/MeguLitHook32\.dll','MeguLit_GDIHIDE'/);
 assert.match(r,/'native\/fontprobe\/GlyphMatch\.h','native\/MeguLitFont32\.dll','ToMe_GLYPHHIDE'/);
 assert.match(r,/is an old build: it lacks/);});
