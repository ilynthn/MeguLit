'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('E457 the dictionary page local search falls back to the lookup card JMdict when the table is empty',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 assert.match(src,/if\(!entries\.length&&!online&&runtime\)\{try\{const r=await runtime\.learning\(\)\.request\('lookup_exact'/);
 const {localEntries}=require('../services/bridge.cjs');
 const rows=localEntries({entries:[{spellings:['夢'],readings:['ゆめ'],definitions:['梦','梦想']},{spellings:['爆裂'],readings:['ばくれつ'],definition_groups:[{title:'爆炸',text:'爆炸；爆裂'}]},{spellings:['空'],readings:['そら'],definitions:[]}]},'夢');
 assert.deepEqual(rows,[{spelling:'夢',reading:'ゆめ',definition:'梦\n梦想'},{spelling:'爆裂',reading:'ばくれつ',definition:'爆炸；爆裂'}]);
 assert.deepEqual(localEntries(null,'x'),[]);
});
