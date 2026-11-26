'use strict';
/* QQ #1120 (p0, 2026-11-24): with the lookup card open, a click beside it advanced the game. The click has to close the card
   only. The pointer gate now owns a press on the game while the card is open (down and its release), never passes it on,
   and asks the page to close the card through the same dismissLookup path as before. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.join(__dirname,'..'),g=fs.readFileSync(path.join(root,'native','ReaderPointerGate.cs'),'utf8');
test('a press beside the open lookup card is kept from the game and closes the card',()=>{
 assert.match(g,/internal static bool DismissOutside\(bool lookupCard,bool hit,bool overOverlay,bool overGame,bool gameActive,bool inClient\)\{\s*return lookupCard&&!hit&&!overOverlay&&overGame&&gameActive&&inClient;/);
 assert.match(g,/DismissOutside\(context\.Lookup&&context\.LookupPanels\.Length>0,context\.Hit\(point\.X,point\.Y\)/,'only the card (lookup panels), not a hover tooltip, makes a press a dismissal');
 assert.match(g,/gesture\.Dismiss=true;\s*events\.Add\(new\{type="hostFrame"[^;]*dismissLookup=true\}\);\s*return true;/,'the press is swallowed and the page is told to close the card');
 assert.match(g,/if\(gesture\.Owner!=null&&gesture\.Dismiss\)\{\s*if\(up!=gesture\.Button\)return false;\s*gesture\.End\(\);return true;/,'its release is swallowed too; moves still pass');
 assert.match(g,/internal void End\(\)\{Owner=null;Button=-1;DragLookup=false;Dismiss=false;\}/);
 assert.match(g,/if\(!DismissOutside\(true,false,false,true,true,true\)\|\|DismissOutside\(false,/,'decision covered by the bridge self-test');
 const reader=fs.readFileSync(path.join(root,'services','reader.cjs'),'utf8');
 assert.match(reader,/if\(message\.dismissLookup===true\)this\.emit\('reader-event',\{type:'call',method:'closeLocalSelection',args:\[\]\}\);/);
});
test('the bridge self-test passes (when the bridge is built)',{skip:!fs.existsSync(path.join(root,'native','GalWindowBridge.exe'))},()=>{
 const r=spawnSync(path.join(root,'native','GalWindowBridge.exe'),['--reader-pointer-self-test'],{encoding:'utf8',timeout:20000,windowsHide:true});
 assert.match(String(r.stdout),/"passed":true/);
});
