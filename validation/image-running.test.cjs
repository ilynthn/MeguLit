'use strict';
// The cold runs (kirikiri-cold.cjs, voice-cold.cjs) skip a game the player already has open. They looked for the exe
// name in tasklist's output, which is in the console code page (GBK on Chinese Windows), so a game with a Chinese or
// Japanese exe name counted as closed and was started a second time in the background.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {imageRunning}=require('../services/game-process.cjs');

test('a running program with a Chinese or Japanese file name is found',{skip:process.platform!=='win32'},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-running-')),children=[];
 try{
  for(const name of ['恋ゲーム.exe','美少女万华镜.exe','plain-game.exe']){
   const exe=path.join(dir,name);fs.copyFileSync(path.join(process.env.SystemRoot||'C:\\Windows','System32','PING.EXE'),exe);
   children.push(spawn(exe,['-n','30','127.0.0.1'],{stdio:'ignore',windowsHide:true}));
  }
  await new Promise(r=>setTimeout(r,500));
  for(const name of ['恋ゲーム.exe','美少女万华镜.exe','plain-game.exe'])assert.equal(imageRunning(path.join(dir,name)),true,name);
  assert.equal(imageRunning(path.join(dir,'まだ起動していない.exe')),false);
 }finally{
  for(const c of children)c.kill();
  await new Promise(r=>setTimeout(r,300));
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
