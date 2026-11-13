'use strict';
// SteamPath was read with reg.exe, which prints in the console code page (GBK on Chinese Windows), and decoded as
// UTF-8. A Steam folder such as D:\游戏\Steam came back garbled and Steam was not found.
const test=require('node:test'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {registryString}=require('../core/library.cjs');

test('a registry value with Chinese and Japanese characters is read back as written',{skip:process.platform!=='win32'},async()=>{
 const key='HKCU\\Software\\MeguLitTest\\steam-path-'+process.pid,value='D:\\游戏\\ゲーム\\Steam';
 execFileSync('reg',['add',key,'/v','SteamPath','/t','REG_SZ','/d',value,'/f'],{windowsHide:true,stdio:'ignore'});
 try{
  assert.equal(await registryString(key,'SteamPath'),value);
  assert.equal(await registryString(key,'Missing'),'');
 }finally{execFileSync('reg',['delete','HKCU\\Software\\MeguLitTest','/f'],{windowsHide:true,stdio:'ignore'});}
});
