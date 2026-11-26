'use strict';
// Context explanations have their own source (user, 2026-11-09): the user's own AI API (DeepSeek by default),
// independent of the word-lookup source; the lookup card is a panel, so its clicks never reach the game.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const m=require('../core/lookup-models.cjs');

test('context source defaults to DeepSeek and stays separate from the lookup source',()=>{
 assert.equal(m.cleanLookup({}).contextProvider,'deepseek');
 assert.equal(m.cleanLookup({contextProvider:'moji'}).contextProvider,'deepseek','MOJi is a dictionary, not a context source');
 assert.equal(m.cleanLookup({contextProvider:'local'}).contextProvider,'deepseek');
 assert.equal(m.cleanLookup({lookupProvider:'local',contextProvider:'qwen'}).lookupProvider,'local');
 const o=m.contextOptions({lookupProvider:'local',contextProvider:'deepseek'},{});assert.ok(o&&o.provider==='deepseek');
 assert.equal(m.lookupOptions({lookupProvider:'local',contextProvider:'deepseek'},{}),null,'word lookups stay local');
});

test('AI modes use the context source and a missing key shows the setup hint; the card is a click panel',()=>{
 const reader=fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8'),sel=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','selection.js'),'utf8');
 assert.match(reader,/context\?models\.contextOptions\(main,main,keyed\):models\.lookupOptions\(main,main\)/);assert.match(reader,/CONTEXT_KEY_REQUIRED/);
 assert.match(sel,/推荐 DeepSeek/);assert.doesNotMatch(sel,/点读解释来源现在是「本地辞书」/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','reader','modules','interaction.js'),'utf8'),/const MENUS='[^']*\.tomoyo-selection-card'/);
});
