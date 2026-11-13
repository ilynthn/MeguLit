'use strict';
/* P0 2026-11-13 (ファタモルガーナの館 full screen: game flashed / fell to the desktop; Alt+T sent it to the desktop).
   A full-screen game minimises itself when it loses the foreground; MeguLit's overlay must never take it. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','native','GalWindowBridge.cs'),'utf8');
test('overlay stays no-activate over a full-screen game, also with the Alt+T menu open',()=>{
 assert.match(src,/bool reading=window!=IntPtr\.Zero&&TranslationMode&&Target!=IntPtr\.Zero&&!OverlayMayActivate\(FullscreenTarget\(\),true,MenuOpen\);/);
 assert.match(src,/public static bool OverlayMayActivate\(bool fullscreenGame,bool bound,bool menu\)\{return !\(bound&&fullscreenGame\)&&menu;\}/);
});
test('the menu is never focused over a full-screen game',()=>{
 assert.match(src,/if\(!MenuOpen\|\|!MenuRegionReady\|\|!MenuFocusPending\)return;\s*if\(TranslationMode&&FullscreenTarget\(\)\)\{MenuFocusPending=false;return;\}/);
 assert.match(src,/bool keepGame=FullscreenTarget\(\)&&[^;]+;if\(!IsWindowVisible\(Overlay\)\)ShowWindow\(Overlay,keepGame\?4:5\);if\(!keepGame&&/);
});
test('a minimised overlay comes back without activation',()=>{
 assert.doesNotMatch(src,/IsIconic\(Overlay\)\)ShowWindow\(Overlay,9\)/);
});
test('native self-test covers the full-screen policy',()=>{
 assert.match(src,/fullscreenGameKeepsForeground=true/);
 assert.match(src,/CoversMonitor\(0,0,1920,1080,0,0,1920,1080\)/);
});
