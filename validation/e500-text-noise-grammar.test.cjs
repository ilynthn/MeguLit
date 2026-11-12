'use strict';
/* E500 (live checks 2026-11-13): typewriter frames, sound-effect captions and window titles are not lines; the grammar page
   numbers the next lesson in stage order and does not flash empty stats before the report arrives. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const lt=require('../core/language-tracks.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('typewriter frames and captions are dropped, real lines kept',()=>{
 assert.equal(lt.stuttered('『『『『『『『『おお『お『『おお客客『お客『『おお客客ささ『お客さ『『おお客客ささんん』』'),true);
 for(const line of ['『お客さん』','「ああああ、そうか」','「ささっと、もっと、ずっと」','……っっっ！'])assert.equal(lt.stuttered(line),false,line);
 assert.equal(lt.soundCaption('■自動車（車内／走行）'),true);
 assert.equal(lt.soundCaption('★ＢＧＭ：日常'),true);
 assert.equal(lt.soundCaption('「■は四角だ」'),false);
 assert.equal(lt.soundCaption('※注意：この作品はフィクションです。'),false);
 const hook=read('core/hook-native.cjs');
 assert.match(hook,/lt\.soundCaption\(text\)\|\|lt\.stuttered\(text\)/);
 assert.match(hook,/if\(lt\.stuttered\(t\)\|\|lt\.soundCaption\(t\)\)return;/);
});

test('native policy: ASCII ellipsis lines are dialogue, captions and window titles are labels/noise',()=>{
 const policy=read('native/EmbedTextPolicy.cs'),bridge=read('native/HookBridge.cs');
 assert.match(policy,/Label\("■自動車（車内／走行）"\) && !Label\("\\"Clubs\.\.\.\\""\)/);
 assert.match(policy,/public static bool AuxNoise\(string value, string caption\)/);
 assert.match(bridge,/EmbedTextPolicy\.AuxNoise\(text,GameCaption\(\)\)/);
});

test('grammar: next lesson follows the stage order and stats wait for the report',async()=>{
 const g=await import(pathToFileURL(path.join(__dirname,'..','web','grammar.js')).href);
 const esc=s=>String(s??'');
 const pts=g.pointsOf?g.pointsOf('N5'):null;
 const groups=[...new Set((pts||[]).map(p=>p.group))];
 const second=groups[1]||groups[0];
 const html=g.listHTML({progress:{}},{locale:'zh',esc,level:'N5',goal:{plan:{groups:[second]}}});
 const kicker=/gm-kicker">[^<]*?(\d+) \/ (\d+)</.exec(html);
 assert.ok(kicker,'hero shows a lesson number');
 assert.equal(kicker[1],'01','first lesson of the first stage');
 const firstStage=/<button[^>]*class="gm-stg[^"]*"[^>]*data-gtab="([^"]+)"/.exec(html)[1];
 assert.equal(firstStage,second,'goal stage comes first');
 assert.match(/<button[^>]*class="gm-stg[^"]*"[\s\S]*?<\/button>/.exec(html)[0],/gm-stg-flag">next/,'NEXT sits on stage 01');
 assert.match(g.listHTML({},{locale:'zh',esc,level:'N5'}),/gm-hud-stats wait/);
 assert.doesNotMatch(html,/gm-hud-stats wait/);
});
