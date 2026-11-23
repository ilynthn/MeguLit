// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 日文环境 + 文字显示 = 合成层: the game is started through MeguLitLaunch32 (LE's loader). When its window is slower than the
   15 s wait the game is still starting: falling back to LEProc then opened a second copy. Only a launcher that started no
   game falls back. Process starts and waits are stubbed; nothing is launched. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const readiness=require('../services/game-readiness.cjs'),dots=require('../core/glyph-dots.cjs'),paths=require('../core/text-paths-launch.cjs');
const {LocaleEmulator}=require('../core/locale-emulator.cjs');

function setup(t,{gameRunning}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-le-early-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const exe=path.join(root,'game.exe'),pe=Buffer.alloc(0x100);pe.write('MZ',0,'latin1');pe.writeUInt32LE(0x80,60);pe.writeUInt32LE(0x4550,0x80);pe.writeUInt16LE(0x14c,0x84);fs.writeFileSync(exe,pe);
 const saved={start:readiness.startProcess,wait:readiness.waitForVisibleGame,early:dots.earlyLocale,font:paths.fontDot};
 t.after(()=>{readiness.startProcess=saved.start;readiness.waitForVisibleGame=saved.wait;dots.earlyLocale=saved.early;paths.fontDot=saved.font;});
 const started=[];let waits=0;
 readiness.startProcess=async file=>{started.push(path.basename(file));return {pid:100+started.length,exit:null};};
 readiness.waitForVisibleGame=async()=>{if(waits++===0)throw Error('GAME_WINDOW_NOT_READY');return {pid:7};};
 dots.earlyLocale=()=>({file:path.join(root,'MeguLitLaunch32.exe'),args:[],env:{}});paths.fontDot=()=>null;
 const le=new LocaleEmulator(root);le.status=async()=>({installed:true,dir:root,path:path.join(root,'LEProc.exe'),profile:'ja'});
 le.processes=async()=>gameRunning?[{pid:7,visible:false}]:[];
 return {le,exe,started};
}

test('a game whose window is slow after the early launcher is not started a second time',async t=>{
 const {le,exe,started}=setup(t,{gameRunning:true});
 await assert.rejects(le.launch(exe),/GAME_WINDOW_NOT_READY/);
 assert.deepEqual(started,['MeguLitLaunch32.exe']);
});
test('a launcher that started no game still falls back to LEProc',async t=>{
 const {le,exe,started}=setup(t,{gameRunning:false});
 const r=await le.launch(exe);
 assert.deepEqual(started,['MeguLitLaunch32.exe','LEProc.exe']);assert.equal(r.gamePid,7);
});

test('a slow game started by a short-lived language launcher also prevents a second start',async t=>{
 const {le,exe,started}=setup(t,{gameRunning:false});
 const game=path.join(path.dirname(exe),'engine.exe');
 le.processes=async file=>file===game?[{pid:7,visible:false}]:[];
 await assert.rejects(le.launch(exe,{alsoExe:game}),/GAME_WINDOW_NOT_READY/);
 assert.deepEqual(started,['MeguLitLaunch32.exe']);
});
