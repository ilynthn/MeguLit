'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const N=f=>fs.readFileSync(path.join(__dirname,'..','native',f),'utf8');
test('lookup card presses use the pointer gate while Alt+T controls retain native drags',()=>{
 const g=N('ReaderPointerGate.cs'),b=N('GalWindowBridge.cs');
 assert.match(b,/Lookup=Bool\(rect,"lookup"\)/);
 assert.match(b,/HitRegions\.FindAll\(h=>h\.Lookup\)\.ConvertAll\(h=>h\.Bounds\)\.ToArray\(\)/);
 assert.match(g,/if\(gesture\.Owner==null&&index>=0&&context\.NativeMenu\(point\.X,point\.Y\)\)return false;/);
 assert.match(g,/foreach\(var rect in LookupPanels\)if\(Contains\(rect,x,y\)\)return false;/);
 assert.doesNotMatch(b,/LookupOpen\?CreateRectRgn/,'lookup does not expand the overlay input region');
 assert.match(g,/context\.Grip\.Hit\(point\.X,point\.Y\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','reader','modules','interaction.js'),'utf8'),/menu:isMenu,\.\.\.\(lookup\?\{lookup:true\}/);
});
test('the live DOM resolves ambiguous wheel events before the bridge forwards them to the game',()=>{
 const g=N('ReaderPointerGate.cs'),r=fs.readFileSync(path.join(__dirname,'..','desktop','src','reader_pointer.rs'),'utf8');
 const web=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','interaction.js'),'utf8');
 assert.match(g,/NeedsWheelHitTest\(false,false,true,false,true\)/,'a stale native rectangle still needs a DOM hit test on the reader window');
 assert.match(g,/NeedsWheelHitTest\(true,false,false,true,true\)/,'a moved lookup card needs a live hit test even when Windows reports the game below it');
 assert.match(g,/kind="wheelHitTest"/);
 assert.match(g,/if\(WheelToPanel\(panel,panelUp,wheel\.Message,[^{]+\{[\s\S]+?kind="mouseWheel"/);
 assert.match(g,/else\{\s*var foreground=GetAncestor\(GetForegroundWindow\(\),2\);[\s\S]+?PostGameWheel\(context\.Game,wheel\);/);
 assert.match(g,/PostMessage\(game,\(uint\)wheel\.Message,/);
 assert.match(r,/window\.__megulitResolveWheel/);
 assert.match(r,/if kind == "mouseWheel" \{\s*packet\["deltaX"\]/);
 assert.match(web,/document\.elementFromPoint\(x,y\)/);
 assert.match(web,/\.closest\(MENUS\)/);
});
