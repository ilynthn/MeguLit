// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-15 (死に逝く君、館に芽吹く憎悪): the softdenchi launcher 「打开游戏.exe」 waits on its own banner; starts it could not finish left
   hidden copies behind (seven were found). A launcher MeguLit started is ended when the start fails; hidden leftovers are ended before
   the next start; a visible banner and a running game are never touched. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {endHidden,startedMs}=require('../services/launcher-cleanup.cjs');
const ticks=ms=>String(BigInt(ms)*10000n+621355968000000000n);
const LAUNCHER='C:\\Games\\x\\打开游戏.exe',GAME='C:\\Games\\x\\bug02_yakata.exe';
function world(table){const killed=[];return {killed,list:async exe=>{const v=table[path.normalize(exe)];if(v instanceof Error)throw v;return v||[];},kill:pid=>killed.push(pid)};}

test('.NET start ticks convert to epoch ms',()=>{assert.equal(startedMs(ticks(1794753263524)),1794753263524);assert.ok(Number.isNaN(startedMs('x')));});

test('hidden launchers are ended, a visible banner stays',async()=>{
 const w=world({[LAUNCHER]:[{pid:11,visible:false,started:ticks(1000)},{pid:12,visible:true,started:ticks(1000)},{pid:13,visible:false,started:ticks(5000)}]});
 assert.deepEqual(await endHidden({launchVia:LAUNCHER,gameExe:GAME,list:w.list,kill:w.kill}),[11,13]);
 assert.deepEqual(w.killed,[11,13]);
});

test('after a failed start only the launchers of that start are ended',async()=>{
 const w=world({[LAUNCHER]:[{pid:21,visible:false,started:ticks(1000)},{pid:22,visible:false,started:ticks(100000)}]});
 assert.deepEqual(await endHidden({launchVia:LAUNCHER,gameExe:GAME,since:99000,list:w.list,kill:w.kill}),[22]);
});

test('nothing is ended while the game runs or processes cannot be listed',async()=>{
 const running=world({[GAME]:[{pid:5,visible:true}],[LAUNCHER]:[{pid:31,visible:false,started:ticks(1)}]});
 assert.deepEqual(await endHidden({launchVia:LAUNCHER,gameExe:GAME,list:running.list,kill:running.kill}),[]);
 const blind=world({[GAME]:Error('PROCESS_QUERY_FAILED'),[LAUNCHER]:[{pid:32,visible:false,started:ticks(1)}]});
 assert.deepEqual(await endHidden({launchVia:LAUNCHER,gameExe:GAME,list:blind.list,kill:blind.kill}),[]);
 assert.deepEqual(await endHidden({launchVia:'',gameExe:GAME,list:blind.list}),[]);
});

test('the launch flow ends hidden launchers before a start and after a failed one',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 assert.match(src,/stage='launcher-start';[\s\S]*?else if\(!languageTarget\)\{[^}]*endHidden\(\{launchVia,gameExe:gameProcessExe/);
 assert.match(src,/\}catch\(error\)\{[^\n]*?if\(launcherRun\)try\{await require\('\.\/launcher-cleanup\.cjs'\)\.endHidden\(\{\.\.\.launcherRun/);
});
