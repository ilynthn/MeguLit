// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E545 (user: 零延迟翻译 only worked after switching the setting off and on again). With the switch on, a cold start
// (MeguLit just started, the game launched from the library) must have the script provider ready before the first line,
// keep it when the game process binds, pick up a patch found later, and let the prefetch run from the first line.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const ot=require('../services/original-text.cjs');
const {Reader}=require('../services/reader.cjs');
const ksJa='*start\r\n@bg storage="room"\r\n[name text="ハル"]\r\nおはよう、今日はいい天気だね。[p]\r\n@se storage="door"\r\nそうだね、散歩に行こうか。[p]\r\n@wait time=200\r\n@bgm storage="bgm01"\r\n*end\r\n@jump storage="next.ks"\r\n@s\r\n';
function setup(){
 const top=fs.mkdtempSync(path.join(process.env.TEMP||os.tmpdir(),'e545-')),game=path.join(top,'game-jp'),data=path.join(top,'data');
 fs.mkdirSync(game);fs.mkdirSync(path.join(data,'data','config'),{recursive:true});fs.writeFileSync(path.join(game,'first.ks'),ksJa);fs.writeFileSync(path.join(game,'game.exe'),'MZ');
 const exe=path.join(game,'game.exe');assert.strictEqual(ot.scanRunning(data,'1',exe).status,'native-japanese');
 return {data,exe,folder:path.join(data,'data','config')};
}
function reader({data,folder},prefs={scriptTranslation:true}){
 fs.writeFileSync(path.join(folder,'preferences.json'),JSON.stringify(prefs));
 const r=new Reader({root:data,folder,emit(){},config:()=>({}),services:()=>({gameEvent:async()=>{}})});
 r.gal={hooks:{},preferences:{},send(){},save(){}};return r;
}
test('switch on + cold start: provider ready at launch, before the game process binds',()=>{
 const env=setup(),r=reader(env);
 r.selectGame('game.exe',true,env.exe);
 const p=r.gal.hooks.originalText;assert.ok(p&&p.kind==='patch','provider built at launch');
 assert.strictEqual(r.gal.hooks.scriptAllowed(),true);
 r.adoptTextSource(env.exe,4242);for(const t of r.textSourceTimers)clearTimeout(t);
 assert.strictEqual(r.gal.hooks.originalText,p,'the bound process keeps the launch provider (reading position kept)');
 assert.strictEqual(r.gal.hooks.textSourcePid,4242);
});
test('switch on + cold start: the prefetch runs from the first line',async()=>{
 const env=setup(),r=reader(env);r.selectGame('game.exe',true,env.exe);
 const calls=[],cached=new Map();r.scriptPrefetch={service:{translate:async t=>{calls.push(t);return '译：'+t;},clearContext(){},observeSource(){},setKey(){}},keysAt:Date.now(),running:false};
 r.localReady=async()=>{};r.embedCached=(t,v)=>cached.set(t,v);
 const p=r.gal.hooks.originalText;assert.strictEqual(p.resolve('おはよう、今日はいい天気だね。').status,'none');
 assert.strictEqual(await require('../services/script-prefetch.cjs').ahead(r),1,'prefetch ran');
 assert.deepStrictEqual(calls,['そうだね、散歩に行こうか。']);assert.strictEqual(cached.get('そうだね、散歩に行こうか。'),'译：そうだね、散歩に行こうか。');
});
test('a non-forced refresh keeps an unchanged provider and rebuilds a changed one; settings save refreshes',()=>{
 const env=setup(),r=reader(env);r.selectGame('game.exe',true,env.exe);const p=r.gal.hooks.originalText;
 r.refreshTextSource({force:false});assert.strictEqual(r.gal.hooks.originalText,p);
 const stateFile=path.join(env.data,'data','config','original-text.json');
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));state['1'].mode='changed';fs.writeFileSync(stateFile,JSON.stringify(state));
 r.refreshTextSource({force:false});assert.notStrictEqual(r.gal.hooks.originalText,p,'state changed: rebuilt');
});
test('a reader started again while the game runs gets the provider on its new hooks',()=>{
 const env=setup(),r=reader(env);r.selectGame('game.exe',true,env.exe);r.gameExe=env.exe;
 r.gal={hooks:{},preferences:{},send(){},save(){}};r.refreshTextSource();
 assert.ok(r.gal.hooks.originalText?.kind==='patch');
});
test('switch off: the provider is there but the script is not allowed',()=>{
 const env=setup(),r=reader(env,{scriptTranslation:false});r.selectGame('game.exe',true,env.exe);
 assert.strictEqual(r.gal.hooks.scriptAllowed(),false);
});
