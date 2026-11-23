'use strict';
/* 2026-11-16 (user: 启动游戏后很久才自动绑定窗口): the window is bound and entered as soon as it is shown, not after the
   launch wait; a launcher in the Japanese environment no longer waits out its own (never shown) window. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('a launch asks the bridge to enter the game from the start and cancels on failure',()=>{
 const src=read('services/bridge.cjs');
 assert.match(src,/runtime\?\.prepareGame\(gameProcessExe,\{enter:true\}\);/);
 assert.doesNotMatch(src,/prepareGame\(gameProcessExe,\{enter:false\}\)/);
 assert.match(src,/\}catch\(error\)\{[^\n]*?if\(launcherRun\)[\s\S]{0,300}send\(\{type:'enterGame',cancel:true\}\)/);
 assert.match(src,/lib\.locale\.launch\(launchVia,\{trace,alsoExe:gameProcessExe\}\)/);
});
test('the bridge binds on EVENT_OBJECT_SHOW and compares programs by file identity',()=>{
 const cs=read('native/GalWindowBridge.cs');
 assert.match(cs,/SetShowEventHook\(0x8002,0x8002/);
 assert.match(cs,/InstallShowWatch\(\);/);assert.match(cs,/UninstallShowWatch\(\);/);
 assert.match(cs,/AutoBindKick&&DateTime\.UtcNow>=LastAutoScan\.AddMilliseconds\(150\)/);
 assert.match(cs,/WantedExecutable==""\|\|SameImage\(ProcessImage/);
 assert.match(cs,/Pack=4\)\]struct FileIdentityInfo/);
 assert.match(cs,/type=="enterGame"\)EnterGamePending=!Bool\(d,"cancel"\)/);
});
test('the Japanese-environment launch also accepts the game program\'s own window',async()=>{
 const {LocaleEmulator}=require('../core/locale-emulator.cjs');
 assert.match(LocaleEmulator.prototype.launch.toString(),/alsoExe/);
});
