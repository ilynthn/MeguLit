// SPDX-License-Identifier: GPL-3.0-or-later
// E322 (user, 2026-11-10: the whole reading layer faded out by itself, in several games). The scene probe read the
// screen, MeguLit's own layer included, so MeguLit's own text changing after a click looked like the game's picture
// changing. These checks keep it on the game window's own picture and make every whole-layer hide carry its cause.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Immersion}=require('../core/immersion.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('the scene probe reads the game window through GameCapture, never the screen with MeguLit on it',()=>{
 const probe=read('native/GameSceneProbe.cs');
 assert.doesNotMatch(probe,/GetDC\(IntPtr\.Zero\)/);
 assert.match(probe,/GameCapture\.Into\(target,frame,2\)/);
 assert.match(probe,/public static bool SelfTest\(\)/);
 const bridge=read('native/GalWindowBridge.cs');
 assert.match(bridge,/Scene\.Tick\(Target,/);assert.match(bridge,/GameSceneProbe\.SelfTest\(\)/);
});

test('every whole-layer hide carries its cause, and the reader host logs it',()=>{
 let now=1000;const out=[];const im=new Immersion(m=>out.push(m),()=>now);
 im.configure({immersion:true,dialogDetection:'hook'});im.bind('game');
 im.scene(false,'scene changed 80%, box 60%');
 assert.deepEqual(out.at(-1),{dialogVisible:false,reason:'scene changed 80%, box 60%'});
 im.scene(true);assert.deepEqual(out.at(-1),{dialogVisible:true});
 im.skip(true);now+=400;im.tick();assert.deepEqual(out.at(-1),{dialogVisible:false,reason:'skip'});
 const reader=read('services/reader.cjs');
 assert.match(reader,/logVisibility\(\{type:'dialogVisibility',visible:message\.dialogVisible,reason:message\.reason\}\)/);
 assert.match(reader,/message\.type==='dialogSceneKept'/);
});

// 2026-11-21 (user, Aokana: the line stayed after the game's picture had moved on). Its window gave BitBlt one old picture for
// the whole session, so every scene check compared that picture with itself.
test('a BitBlt picture that stays the same while the screen moves is frozen and read through PrintWindow',()=>{
 const cap=read('native/GameCapture.cs'),probe=read('native/GameSceneProbe.cs'),bridge=read('native/GalWindowBridge.cs');
 assert.match(cap,/if\(!Stale\(c,Signature\(image\),at,\(\)=>FreezeVote\(hwnd,image,c\)\)\)\{lock\(Gate\)\{c\.Proven=true;/,'Into: a frozen picture is not proven');
 assert.match(cap,/if\(c\.Blind\|\|frozen\)lock\(Gate\)/,'a frozen window is printed under the same rate limit as a blind one');
 assert.match(cap,/return differs>=\.6\|\|moved>=\.25\?1:differs<\.05\?-1:0;/);
 assert.match(cap,/if\(printed&&!Blank\(image\)\)\{if\(frozen\)Keep\(c,image\);return true;\}/);
 assert.match(cap,/printed=PrintWindow\(hwnd,dc,frozen\?printFlags\|1:printFlags\);/,'a frozen window is printed client area only, the same for every reader');
 assert.match(cap,/GetAncestor\(front,2\)!=GetAncestor\(hwnd,2\)\|\|!SameScale\(hwnd\)\)return 0;/,'no vote for a window not drawn at its monitor DPI');
 assert.match(cap,/Cover\(now,OwnCover\.Parts\(hwnd,picture\.Width,picture\.Height,OwnPids\),picture\.Width,picture\.Height\);/,'MeguLit windows are left out');
 assert.match(bridge,/GameCapture\.OwnPids=PageLocate\.OwnPids;/);
 assert.match(probe,/if\(GameCapture\.Into\(target,frame,2\)\)pictureAt=DateTime\.UtcNow;else if\(!GameCapture\.Recent\(target,frame,ref pictureAt\)\)return null;/,'the scene probe sees every print');
 assert.match(probe,/>1900&&seen>=3\)\{Line\(\);return null;\}/,'sparse pictures: at least three after an input');
 assert.match(bridge,/if\(!GameCapture\.FreezeSelfTest\(\)\)return 10;/);
});
