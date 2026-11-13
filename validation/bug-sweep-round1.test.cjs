'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('shell() global listeners are bound once across language changes',()=>{
 const s=read('web/app.js');
 assert.match(s,/function bindGlobalOnce\(key,bind\)\{if\(boundGlobals\.has\(key\)\)return;/);
 assert.match(s,/bindGlobalOnce\('history-keys',\(\)=>\{addEventListener\('mouseup'/);
 assert.match(s,/bindGlobalOnce\('dialog-backdrop',\(\)=>document\.addEventListener\('mousedown'/);
 assert.match(s,/bindGlobalOnce\('resize',/);
});

test('statistics mount drops the previous click handler and stale draws',()=>{
 const s=read('web/statistics-grimoire.js');
 assert.match(s,/mounted\?\.abort\(\);const life=new AbortController\(\);mounted=life;/);
 assert.match(s,/\},\{signal:life\.signal\}\);/);
 assert.match(s,/mine!==seq\[panel\]/);
});

test('update notice error after close does not touch a null card',()=>{
 const s=read('web/update-notice.js');
 assert.doesNotMatch(s,/info\.hot=false;card\.querySelector/);
 assert.match(s,/card\?\.querySelector\('\[data-upd-keep\]'\)/);
});

test('cg-rating idle shutdown detaches the worker before ending stdin',()=>{
 assert.match(read('services/cg-rating.cjs'),/setTimeout\(\(\)=>\{if\(worker===w\)worker=null;try\{w\.py\.stdin\.end\(\);/);
});

test('runtime pack download closes the file stream when the response errors',()=>{
 assert.match(read('core/runtime-packs.cjs'),/res\.on\('error',e=>\{out\.destroy\(\);reject\(e\);\}\)/);
});

test('desktop close records the window size synchronously before flushing',()=>{
 const s=read('desktop/src/main.rs');
 assert.match(s,/state\.window_memory\.capture\(window\);state\.window_memory\.flush\(\);/);
 assert.match(read('desktop/src/single_instance.rs'),/fn take_command\(file:&Path\)/);
});
