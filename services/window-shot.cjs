// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* One picture of a game window, Windows.Graphics.Capture first (native/MeguLitWgcShot.exe, native/wgcshot/WgcShot.cpp).

   WGC reads the window's own surface from DWM: the picture is the game's even when other windows cover it, when it is in
   the background or not topmost, and for Direct3D games. When WGC cannot be used (Windows without WGC, the window
   minimised, the window on a hidden desktop such as ColdDesk's, the capture failing) the helper falls back to the
   picture the cold test takes today (PrintWindow) and says why; captureWindow() logs that line.

   captureWindow({hwnd|pid, out, method:'auto'|'wgc'|'print', timeoutMs, log}) →
     {ok, method:'wgc'|'printwindow', fallback:null|'<why>', w, h, blank, mean:[b,g,r], hwnd, error?}

   foregroundNeeded({shot, input}) says whether a run still needs the visible foreground: only when the run has to click or
   type and the game does not take background input (PostMessage), or when no usable picture comes without it.

   ColdDesk.exe (cold test, MeguLit-Adapter live runs) calls the same helper for its "shot" command; this is the entry for node
   tools that hold a window handle or pid themselves. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');

const EXE=process.env.MEGULIT_WGCSHOT||path.join(__dirname,'..','native','MeguLitWgcShot.exe');
const REASONS={minimized:'窗口最小化','wgc-unsupported':'系统不支持 WGC','hidden-desktop':'窗口在隐藏桌面（WGC 只能截可见桌面）'};
const reasonText=f=>REASONS[f]||(String(f).startsWith('wgc-failed')?'WGC 截图失败（'+String(f).slice(12)+'）':String(f));

function parseLine(stdout){const line=String(stdout||'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s.startsWith('{')).pop();
 if(!line)return null;try{return JSON.parse(line);}catch{return null;}}

function captureWindow({hwnd,pid,out,method='auto',timeoutMs=3000,log=()=>{},exe=EXE,run=spawnSync}={}){
 if(!out)throw Error('captureWindow: out missing');if(!hwnd&&!pid)throw Error('captureWindow: hwnd or pid needed');
 if(!['auto','wgc','print'].includes(method))throw Error('captureWindow: method is auto, wgc or print');
 if(run===spawnSync&&!fs.existsSync(exe)){const r={ok:false,method:'',fallback:null,error:'MeguLitWgcShot.exe missing: '+exe};log('# 截图失败：'+r.error);return r;}
 fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
 const args=[...(hwnd?['--hwnd',String(hwnd)]:['--pid',String(pid)]),'--out',path.resolve(out),'--method',method,'--timeout-ms',String(timeoutMs)];
 const p=run(exe,args,{encoding:'utf8',windowsHide:true,timeout:timeoutMs+15000});
 const r=parseLine(p.stdout)||{ok:false,method:'',fallback:null,error:(p.error&&p.error.message)||String(p.stderr||'').trim()||'no result (exit '+p.status+')'};
 if(r.ok&&r.method==='printwindow'&&r.fallback)log('# 截图退回 PrintWindow（旧方式）：'+reasonText(r.fallback));
 else if(r.ok&&r.method==='printwindow')log('# 截图用 PrintWindow（指定了旧方式）');
 if(!r.ok)log('# 截图失败：'+(r.fallback?reasonText(r.fallback)+'；':'')+(r.error||'unknown'));
 else if(r.blank)log('# 截图是全黑的（'+r.method+'）');
 return r;}

function foregroundNeeded({shot,input='none'}={}){
 const picture=!!(shot&&shot.ok&&!shot.blank);
 if(input==='foreground')return {foreground:true,why:'要点击或输入，而游戏不接后台输入'};
 if(!picture)return {foreground:true,why:shot&&shot.ok?'后台截到的是全黑':'后台截不到图'+(shot&&shot.fallback?'（'+reasonText(shot.fallback)+'）':'')};
 if(shot.method!=='wgc')return {foreground:false,why:'PrintWindow 能截到'+(shot.fallback?'（'+reasonText(shot.fallback)+'）':'')+'，但被挡住时不一定对'};
 return {foreground:false,why:'WGC 能截到'+(input==='background'?'，输入走后台':'')};}

module.exports={captureWindow,foregroundNeeded,parseLine,reasonText,EXE};
