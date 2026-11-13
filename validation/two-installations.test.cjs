'use strict';
/* E476: a second MeguLit download must not stay "not ready" because an older copy holds Alt+T. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('the desktop host retires other installations once it owns its own folder',()=>{
 const rs=read('desktop/src/single_instance.rs'),main=read('desktop/src/main.rs');
 assert.match(rs,/pub fn retire_other_installations/);assert.match(rs,/name!="megulit\.exe"/);assert.match(rs,/send\(dir,"exit"\)/);
 assert.match(main,/Owner\(lease\)\)=>\{if control\.is_none\(\)&&std::env::var\("MEGULIT_SIDE_BY_SIDE"\)[^{]*\{single_instance::retire_other_installations\(&root\);\}/);
});
test('the bridge ends foreign bridges, retries the keys and reports them',()=>{
 const cs=read('native/GalWindowBridge.cs'),js=read('core/gal-native.cjs');
 assert.match(cs,/static int EndForeignBridges\(\)/);assert.match(cs,/File\.Exists\(System\.IO\.Path\.Combine\(root,"MeguLit\.exe"\)\)/);
 assert.match(cs,/type="hotkeyState"/);assert.match(js,/message\.type==='hotkeyState'/);
});