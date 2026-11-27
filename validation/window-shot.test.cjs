// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 services/window-shot.cjs + native/MeguLitWgcShot.exe: a game window's picture with Windows.Graphics.Capture, so
   a covered or background game (D3D too) still gives its own picture and the run does not need the foreground. When WGC
   cannot be used the helper falls back to PrintWindow and the log says why. The covered-D3D-window check itself is the
   native self-test (native/wgcshot/selftest/run.cmd, run by CI on the visible runner desktop); here the same exe runs on an
   isolated desktop, where WGC is not available, and must fall back with that reason and still give the window's colour. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const S=require('../services/window-shot.cjs');
const fake=line=>()=>({status:0,stdout:'noise\n'+JSON.stringify(line)+'\n',stderr:''});

test('a WGC picture is used as it is; a fallback is logged with its reason',()=>{const out=path.join(os.tmpdir(),'ws-'+process.pid+'.png');
 let logs=[];let r=S.captureWindow({hwnd:42,out,run:fake({ok:true,method:'wgc',fallback:null,w:10,h:10,blank:false}),log:m=>logs.push(m)});
 assert.equal(r.method,'wgc');assert.deepEqual(logs,[]);
 for(const [why,text] of [['minimized','最小化'],['wgc-unsupported','不支持 WGC'],['hidden-desktop','隐藏桌面'],['wgc-failed: no frame within the timeout','no frame']]){logs=[];
  r=S.captureWindow({pid:7,out,run:fake({ok:true,method:'printwindow',fallback:why,w:10,h:10,blank:false}),log:m=>logs.push(m)});
  assert.equal(r.fallback,why);assert.equal(logs.length,1);assert.match(logs[0],/退回 PrintWindow/);assert.ok(logs[0].includes(text),logs[0]);}
 logs=[];r=S.captureWindow({hwnd:1,out,run:()=>({status:1,stdout:'',stderr:'boom'}),log:m=>logs.push(m)});
 assert.equal(r.ok,false);assert.match(logs[0],/截图失败：boom/);
 r=S.captureWindow({hwnd:1,out,exe:path.join(os.tmpdir(),'nope','MeguLitWgcShot.exe'),log:()=>{}});assert.equal(r.ok,false);assert.match(r.error,/missing/);
 assert.throws(()=>S.captureWindow({out}),/hwnd or pid/);assert.throws(()=>S.captureWindow({hwnd:1,out,method:'x'}),/method/);});

test('foreground only for input the game does not take in the background, or when no picture comes without it',()=>{
 const wgc={ok:true,method:'wgc',blank:false},black={ok:true,method:'wgc',blank:true},none={ok:false,fallback:'minimized'};
 assert.equal(S.foregroundNeeded({shot:wgc,input:'background'}).foreground,false);
 assert.equal(S.foregroundNeeded({shot:wgc,input:'none'}).foreground,false);
 assert.equal(S.foregroundNeeded({shot:wgc,input:'foreground'}).foreground,true);
 assert.equal(S.foregroundNeeded({shot:black}).foreground,true);
 assert.match(S.foregroundNeeded({shot:none}).why,/最小化/);});

const exe=S.EXE,isolated=path.join(__dirname,'..','tools','run-isolated.cjs');
test('real helper on an isolated desktop: falls back to PrintWindow, says so, and still gives the window',{skip:process.platform!=='win32'||!fs.existsSync(exe)?'needs Windows and native/MeguLitWgcShot.exe':false},()=>{
 const r=spawnSync(process.execPath,[isolated,exe,'--selftest'],{encoding:'utf8',timeout:120000,windowsHide:true});
 assert.equal(r.status,0,r.stdout+r.stderr);
 const lines=r.stdout.split(/\r?\n/).filter(s=>s.startsWith('{')).map(s=>JSON.parse(s));
 const shot=lines.find(l=>l.method);assert.ok(shot,r.stdout);
 assert.equal(shot.method,'printwindow');assert.equal(shot.fallback,'hidden-desktop');assert.equal(shot.ok,true);
 [89,199,41].forEach((v,i)=>assert.ok(Math.abs(shot.mean[i]-v)<=8,'the D3D window colour (b,g,r): '+shot.mean));
 assert.match(lines.at(-1).selftest,/^skip: hidden-desktop/);});
