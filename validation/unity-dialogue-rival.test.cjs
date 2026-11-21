'use strict';
// E609 (DDLC Plus in Japanese, beta.41): the remembered TMP_Text.set_text stream only carried labels, the story came through
// TextTypewriterEffect.StartText as aux. The bridge leaves a dialogue-less stream for one that carries dialogue, and hides the
// second setter that repeats the selected line.
const test=require('node:test');const assert=require('node:assert');const fs=require('node:fs');const path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');

test('a stream with three paced dialogue lines takes over a selected stream that gives none',()=>{
 assert.match(s,/leave dialogue-less stream/);
 assert.match(s,/\(now-LastSelectedLineAt\)\.TotalSeconds>=3/);
 assert.match(s,/\(now-r\.at\)\.TotalSeconds>=0\.35/,'a backlog dump does not count');
 assert.match(s,/rv\.embed\|\|!cur\.embed\?3:5\)\)\{/);
 assert.match(s,/!ManualPick&&!JaTwins\.Contains\(tp\.Key\(\)\)/,'a stream the player picked is kept');
 assert.match(s,/ManualPick=d\.ContainsKey\("manual"\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','core','hook-native.cjs'),'utf8'),/\.\.\.\(manual\?\{manual:true\}:\{\}\)/);
});

test('a second writable stream that repeats the selected line is hidden with it',()=>{
 assert.match(s,/japanese twin embedding on/);
 assert.match(s,/japanese twin hidden/);
 assert.match(s,/bool own=code==\(sel\.code\?\?""\);if\(own&&!\(UnitySetter\(code\)&&c\.name==sel\.name\)\)return;if\(n>=\(own\?1:2\)&&JaTwins\.Add\(key\)\)/,'another hook after two repeats, or a context of the selected Unity setter itself after one (Aokana sets each line twice through TMP_Text.set_text)');
 assert.match(s,/foreach\(var kv in OtherLines\)if\(Math\.Abs\(\(now-kv\.Value\.Value\)\.TotalMilliseconds\)<1500&&SameLine\(kv\.Value\.Key,text\)\)JaTwinHit\(kv\.Key,twinOn\);/,'a twin seen before the selected line counts');
 assert.match(s,/if\(Math\.Abs\(\(now-LastSelectedLineAt\)\.TotalMilliseconds\)<1500&&SameLine\(text,LastSelectedLine\)\)JaTwinHit\(tp\.Key\(\),twinOn\);\}/);
 assert.match(s,/rv\.embed&&rv\.role!=2&&rv\.role!=3&&!DialogueLike\(text\)&&DialogueLike\(LastSelectedLine\)&&Math\.Abs\(\(now-LastSelectedLineAt\)\.TotalMilliseconds\)<1500&&SameLine\(text,LastSelectedLine\)\)JaTwinHit/,'typewriter frames buffered past 600 characters still count');
 assert.match(s,/if\(last==0\|\|Bare\(rows\[last\]\)!=b\)return false;for\(int i=0;i<last;i\+\+\)\{string r=Bare\(rows\[i\]\);if\(r\.Length>0&&!b\.StartsWith\(r,StringComparison\.Ordinal\)\)return false;\}return true;/,'a typewriter buffer: every row a start of the line, the last the line; a backlog page is no twin');
 assert.match(s,/if\(!TwinSelfTest\(\)\)\{Console\.Error\.WriteLine\("FAIL japanese twins/,'HookBridge --self-test runs the twin rules (built by Build-HookBridge.ps1)');
 assert.match(s,/if\(id!=Selected\)\{DialogueRivals\.Clear\(\);JaTwins\.Clear\(\);/);
});

test('E610 the twin is hidden only after the selected stream wrote the same line back; the remembered stream comes back on its first line',()=>{
 assert.match(s,/sel\.embed&&!sel\.hideOnly&&\(\(DateTime\.UtcNow-LastEmbedAt\)\.TotalMilliseconds<1500\|\|\(DateTime\.UtcNow-JaTwinHiddenAt\)\.TotalMilliseconds<1500\)&&Bare\(text\)==Bare\(LastEmbedText\)/,'one frame is the whole line');
 assert.match(s,/RememberedCode!=""&&rv\.code==RememberedCode\?1:/);
 assert.match(s,/Emit\(new\{type="hookStreamLeft",id=was,code=wasCode,to=tp\.Key\(\)\}\)/);
 assert.match(s,/Select\(tp\.Key\(\)\);\/\*[^*]*\*\/lock\(Gate\)\{if\(DialogueLike\(text\)\)\{LastSelectedLine=text;LastSelectedLineAt=DateTime\.UtcNow;\}\}/,'the line that won the switch counts for its twins');
 const n=fs.readFileSync(path.join(__dirname,'..','core','hook-native.cjs'),'utf8');
 assert.match(n,/gdilessSelected\(sel\)\{[^\n]*return \/:JIT:UNITY\$\|IL2CPP\/i\.test/);assert.match(n,/this\.ownTextFn\?\.\(\)===true&&!this\.gdilessSelected\(\)/,'calibration can pause a Unity stream under placement');assert.match(n,/own&&!this\.textPathActive&&!gdiless/);
 assert.match(n,/if\(m\.type==='hookStreamLeft'\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','core','hook-control.cjs'),'utf8'),/x\.embeddable&&!left\.has\(x\.code\)/);
});

test('E560 still holds for twins: more than two of them writing the shown line go to cover mode',()=>{
 assert.match(s,/\)\{if\(TwinCrowd\(tp\.Key\(\),DateTime\.UtcNow\)\)\{Luna_EmbedCallback\(tp,text,""\);Diagnostic\("more than two japanese twins[^"]*"\);TwinCrowdSeen\.Clear\(\);ThreadPool\.QueueUserWorkItem\(_=>MarkUnsafe\("unity-many-contexts"\)\);return;\}string twinHidden=/);
 assert.match(s,/return TwinCrowdSeen\.Count>2;\}/,'Aokana has two: the second setter and the typewriter');
});

test('Aokana: a typewriter frame that colours each character itself is blanked with its tags and alphas kept',()=>{
 assert.match(s,/if\(twinHidden\.Length==0&&UnitySetter\(candidate\.code\)&&EmbedTextPolicy\.HasInnerColor\(text\)\)twinHidden=EmbedTextPolicy\.Hide\(text\);/);
 assert.match(s,/if\(line!=JaTwinHiddenLine\)\{JaTwinHiddenLine=line;Diagnostic\("japanese twin hidden "/,'logged once per line, not per frame');
});
