// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 YU-RIS (Monochrome Empire): every glyph is drawn eight times with TextOutA, so YU-RIS2 / YU-RIS read
   「誕誕誕誕誕誕誕誕生生生生生生生生」 two characters at a time, and the stream LunaHook found first (yuris9) carried only script resource
   names ("ysr003"). The fold itself is checked by HookBridge.exe --self-test (YurisFoldSelfTest, run by native/Build-HookBridge.ps1);
   here: it is wired before the frame is read, the pieces are joined, the rank decides the selection, and KiriKiri is not touched. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const SRC=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');

test('HookBridge: YU-RIS repeat fold, join and selection are wired and self-tested',()=>{
 assert.match(SRC,/if\(YurisStream\(name\)\)\{int fold=YurisFoldOf\(tp\.Key\(\),name,text\);if\(fold>=2\)\{text=Unfold\(text,fold\);/,'folded before the frame is read, only once a factor was seen');
 assert.match(SRC,/if\(fold>=2\)\{[^\n]*\n\s*if\(!KrkrJoinFlush\)\{string whole=KrkrJoinPiece\(code,name,tp,text,probe\);if\(whole==null\)return;text=whole;/,'pieces joined into one line');
 assert.match(SRC,/yuris: dialogue stream /,'a complete line on a higher ranked stream takes the selection');
 assert.match(SRC,/bool writable=has&&cur\.embed&&!cur\.hideOnly;/,'a writable selected stream (EmbedYURIS6) is never taken from');
 assert.match(SRC,/&&!\(YurisFolded\(Selected\)&&YurisRank\(rv\.name\)>0\)/,'the rival switch does not pull between folded YU-RIS siblings');
 assert.match(SRC,/static int YurisRank\(string name\)\{return name=="YU-RIS2"\?3:name=="YU-RIS"\?2:name=="yuris7"\?1:0;\}/,'yuris8/yuris9 never rank');
 assert.match(SRC,/if\(!YurisFoldSelfTest\(\)\)throw/,'--self-test covers it');
 assert.match(SRC,/string who=YurisNameChain\(text,out at,out len\);/,'a name plate drawn per pass (朽木木朽木木…) goes to the reader as the speaker');
 assert.match(SRC,/&&\(!DotsOwn\(c\)\|\|YurisGdiOwn\(key\)\);/,'a selected folded YU-RIS2 stream is switched on for the DLL GDI hide');
 assert.match(SRC,/static bool YurisGdiOwn\(string key\)\{Candidate c;return key!=null&&YurisFolded\(key\)&&Candidates\.TryGetValue\(key,out c\)&&c\.name=="YU-RIS2";\}/,'only the TextOutA call stream');
 assert.match(SRC,/if\(KrkrRank\(name\)>0&&KrkrNoKag\(\)\)\{string once=UndoubleChars\(text,2\);/,'the KiriKiri no-KAG path is unchanged');});

test('YU-RIS joined lines: a name plate cut by the flushes is found again in the joined line; a 。 inside an open quote does not end it (KiriKiri no-KAG too)',()=>{
 const SRC=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','native','HookBridge.cs'),'utf8');
 assert.match(SRC,/while\(\(who2=YurisNameChain\(text,out at2,out len2,2\)\)!=null\)/,'two passes are enough on the joined line');
 assert.match(SRC,/internal static bool JoinEnd\(string t\)\{if\(!SentenceEnd\(t\)\)return false;/);
 assert.match(SRC,/if\(!KrkrJoin\.TryGetValue\(key,out p\)\)\{if\(JoinEnd\(text\)\)return text;/,'the first piece');assert.match(SRC,/string all=p\.text\.ToString\(\);if\(JoinEnd\(all\)\)\{/,'the joined pieces (KiriKiri no-KAG too)');
 assert.match(SRC,/JoinEnd\("「あの、私。"\)\|\|!JoinEnd\("「あの、私。これから」"\)/,'--self-test covers it');});
