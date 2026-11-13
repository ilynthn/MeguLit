'use strict';
/* E540: a side-by-side test copy (MEGULIT_SIDE_BY_SIDE=1) must not end the GalWindowBridge of another MeguLit folder when it
   cannot take Alt+T: doing so unbound the other copy's game (opening tests of three agents kept losing their hooks). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','native','GalWindowBridge.cs'),'utf8');
test('foreign bridges are only ended outside side-by-side mode',()=>{
 const call=src.indexOf('EndForeignBridges()>0');assert.ok(call>0);
 const line=src.slice(src.lastIndexOf('\n',call),call);
 assert.match(line,/!sideBySide&&/);
 assert.match(src,/sideBySide=Environment\.GetEnvironmentVariable\("MEGULIT_SIDE_BY_SIDE"\)=="1"/);
});
test('the bridge inherits the environment of the reader service',()=>{
 const gal=fs.readFileSync(path.join(__dirname,'..','core','gal-native.cjs'),'utf8');
 const spawn=gal.slice(gal.indexOf("'GalWindowBridge.exe'"),gal.indexOf("'GalWindowBridge.exe'")+3000);
 assert.doesNotMatch(spawn,/env:\{(?![^}]*process\.env)/);
});
