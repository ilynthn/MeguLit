// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// 2026-11-14 (user: an Anki card picture from WHITE ALBUM2 held MeguLit's own lookup card and furigana): every saved game
// picture (Anki card, collected sentence, scene shots, card wall) is the game window's own surface, never a copy of the
// screen, so MeguLit's overlays can never be in it. The native check runs a stand-in game with an overlay popup on top,
// both cloaked by DWM (nothing is drawn on the monitor), and needs no game.
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),os=require('os'),{execFileSync}=require('child_process');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const csc=['C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'].find(f=>fs.existsSync(f));
const work=fs.existsSync('H:/')?'H:/MeguLit-Work/shot-own-overlay-test':path.join(os.tmpdir(),'megulit-shot-own-overlay-test');

test('saved pictures go through GameCapture.Picture, which never reads the screen',()=>{
 const cap=read('native/GameCapture.cs'),audio=read('native/GameAudio.cs'),bridge=read('native/GalWindowBridge.cs');
 assert.match(cap,/public static bool Picture\(IntPtr hwnd,Bitmap image\)\{if\(!Into\(hwnd,image,2,false\)\)return false;if\(FromScreen\)\{FromScreen=false;return false;\}return true;\}/);
 assert.match(cap,/FromScreen=true;return ScreenInto\(hwnd,image\);/,'a screen copy inside Into is marked so Picture drops it');
 for(const name of ['Screenshot','SceneShot','SceneFrame','SceneProbe']){
  const body=audio.slice(audio.indexOf('public static string '+name+'('));assert.match(body.slice(0,700),/GameCapture\.Picture\(target,image\)/,name);
 }
 assert.doesNotMatch(audio,/GameCapture\.(Into|ScreenInto)\(/,'GameAudio pictures never use a path that may read the screen');
 assert.ok(!fs.existsSync(path.join(root,'native/ReaderScreenshot.cs')),'the screen-copy Anki picture is gone');
 assert.doesNotMatch(bridge,/ReaderScreenshot|readerScreenshot/);
 for(const f of ['native/Build-GalWindowBridge.ps1','tools/build-reader-bridge.ps1','tools/restore-native-host.cjs'])assert.doesNotMatch(read(f),/ReaderScreenshot/,f);
});

test('the Anki picture asks for the game window alone and hides nothing of MeguLit for it',()=>{
 assert.doesNotMatch(read('core/gal-native.cjs'),/readerScreenshot/);
 assert.match(read('core/gal-native.cjs'),/gameFrame\(\)\{/);
 const reader=read('services/reader.cjs'),anki=reader.slice(reader.indexOf("if(action==='ankiScreenshot')"));
 assert.match(anki.slice(0,400),/const image=await this\.gal\?\.gameFrame\(\);/);
 const v4=read('web/reader/modules/v4.js');
 assert.match(v4,/async function captureReader\(\)\{[\s\S]{0,400}request\('ankiScreenshot',\{\},5000\)/);
 assert.doesNotMatch(v4,/megulit-capturing|megulit-mining-capture|readerX/);
 assert.doesNotMatch(read('web/reader/modules/selection.js'),/megulit-precapture/);
 assert.doesNotMatch(read('web/reader/host-surface.css'),/megulit-capturing|megulit-precapture|megulit-mining-capture/);
});

test('stand-in game with an overlay on top: the picture holds the game only, a blank game saves nothing',{skip:!csc&&'no csc'},()=>{
 fs.mkdirSync(work,{recursive:true});const exe=path.join(work,'harness.exe'),out=path.join(work,'result.json');
 execFileSync(csc,['/nologo','/target:winexe','/platform:x64','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll','/out:'+exe,
  path.join(root,'native/GameCapture.cs'),path.join(__dirname,'shot-overlay-harness.cs')],{windowsHide:true});
 try{fs.rmSync(out,{force:true});}catch{}
 execFileSync(exe,[out],{windowsHide:true,timeout:30000});
 const r=JSON.parse(fs.readFileSync(out,'utf8'));
 assert.ok(!r.error,r.error);
 assert.equal(r.overlaps,true,'the overlay popup covers part of the game');
 assert.equal(r.picture,true,'the game picture was taken');
 assert.equal(r.stripes,2,'the game\'s own stripes are in the picture, also under the overlay');
 assert.equal(r.pictureGreen,0,'none of the overlay\'s pixels are in the picture');
 assert.equal(r.blankSaved,false,'a blank game surface is not replaced by a screen copy');
});
