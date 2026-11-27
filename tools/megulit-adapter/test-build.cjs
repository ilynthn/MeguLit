// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 (owner: 测试交给测试员用 UU 远程测) the test build a tester starts: a side-by-side MeguLit with this checkout's code.
     node tools/megulit-adapter.cjs testbuild <target folder> [--app <installed MeguLit>]
   1. the installed app is copied without its user data (data\, cache\, logs\, secrets\, migration\, validation\, rollbacks);
      data\config\ (settings, translation keys bound to this Windows user) and data\preferences.json come along
   2. this checkout's core\, services\, web\, The Seed\, setup\ replace the installed ones
   3. the native pieces this branch may change are built into it: HookBridge.exe (native\Build-HookBridge.ps1), GalWindowBridge.exe
      (native\Build-GalWindowBridge.ps1, then copied) and the glyph hide DLLs (native\fontprobe\build.cmd, then copied)
   4. 启动测试版.cmd starts it with MEGULIT_SIDE_BY_SIDE=1: without it a second MeguLit retires the other installations
      (desktop/src/main.rs), which would close the tester's own one
   The target must not be on a drive of MEGULIT_ADAPTER_NO_DRIVES (default C, E). */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const REPO=path.join(__dirname,'..','..');
const SKIP_TOP=/^(data|cache|logs|secrets|migration|validation)$/i,SKIP_FILE=/\.rollback-|\.bak-/i;
const OVERLAY=['core','services','web','The Seed','setup'];
const NATIVE_COPY=['GalWindowBridge.exe','MeguLitFont32.dll','MeguLitFont64.dll','MeguLitLaunch32.exe','MeguLitLaunch64.exe'];
const LAUNCHER='@echo off\r\nrem MeguLit test build (side by side: does not retire the installed MeguLit)\r\nset MEGULIT_SIDE_BY_SIDE=1\r\nstart "" "%~dp0MeguLit.exe"\r\n';

function copyApp(app,target){let n=0;const walk=(from,to,top)=>{fs.mkdirSync(to,{recursive:true});for(const e of fs.readdirSync(from,{withFileTypes:true})){if(top&&SKIP_TOP.test(e.name))continue;if(SKIP_FILE.test(e.name))continue;
  const f=path.join(from,e.name),t=path.join(to,e.name);if(e.isDirectory())walk(f,t,false);else if(e.isFile()){fs.copyFileSync(f,t);n++;}}};walk(app,target,true);
 const cfg=path.join(app,'data','config');if(fs.existsSync(cfg))fs.cpSync(cfg,path.join(target,'data','config'),{recursive:true});
 const pref=path.join(app,'data','preferences.json');if(fs.existsSync(pref))fs.copyFileSync(pref,path.join(target,'data','preferences.json'));return n;}
function overlay(repo,target){for(const d of OVERLAY){const src=path.join(repo,d);if(!fs.existsSync(src))continue;fs.rmSync(path.join(target,d),{recursive:true,force:true});fs.cpSync(src,path.join(target,d),{recursive:true});}}
const ps=(file,args=[])=>spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file,...args],{encoding:'utf8',windowsHide:true,timeout:900000});
function buildNative(repo,target,{run=ps,cmd=f=>spawnSync('cmd.exe',['/c',f],{encoding:'utf8',windowsHide:true,timeout:900000})}={}){const out=[];
 const hb=run(path.join(repo,'native','Build-HookBridge.ps1'),['-OutputPath',path.join(target,'native','HookBridge.exe')]);out.push(['HookBridge.exe',hb.status===0]);
 const gw=run(path.join(repo,'native','Build-GalWindowBridge.ps1'));out.push(['GalWindowBridge.exe',gw.status===0]);
 const fp=cmd(path.join(repo,'native','fontprobe','build.cmd'));out.push(['fontprobe',fp.status===0]);
 for(const f of NATIVE_COPY){const src=path.join(repo,'native',f);if(fs.existsSync(src))fs.copyFileSync(src,path.join(target,'native',f));}
 for(const f of fs.readdirSync(path.join(repo,'native')))if(/^GalWindowBridge\.exe\.bak-/.test(f))fs.rmSync(path.join(repo,'native',f),{force:true});
 return out;}
/* -> {ok, target, files, built:[[name, ok]], launcher, why} */
function testBuild(target,{app='E:\\MeguLit',repo=REPO,noDrives=process.env.MEGULIT_ADAPTER_NO_DRIVES??'C,E',build=buildNative}={}){
 const drive=(/^([A-Za-z]):/.exec(path.resolve(target))||[])[1]||'';
 if(drive&&String(noDrives).toUpperCase().split(/[,\s]+/).includes(drive.toUpperCase()))return {ok:false,why:'不往 '+drive+': 放测试版（'+target+'）'};
 if(!fs.existsSync(path.join(app,'MeguLit.exe')))return {ok:false,why:'找不到安装版 MeguLit：'+app};
 const files=copyApp(app,target);overlay(repo,target);const built=build(repo,target);
 const launcher=path.join(target,'启动测试版.cmd');fs.writeFileSync(launcher,LAUNCHER);
 return {ok:built.every(b=>b[1]),target,files,built,launcher,why:built.filter(b=>!b[1]).map(b=>b[0]+' 没编出来').join('；')};}

module.exports={testBuild,copyApp,overlay,buildNative,LAUNCHER,SKIP_TOP};
