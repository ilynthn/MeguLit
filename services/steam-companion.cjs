// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 Steam games with a companion launcher (MAGES: STEINS;GATE, STEINS;GATE 0, CHAOS;CHILD, ...). Steam shows a
   launch-option chooser for them, and the game itself refuses a bare start. The launcher holds the command line it uses
   for the game ("Game.exe mages_sgate"); that is read here so MeguLit can start the game the same way. Returns the
   argument list, or null when the folder has no companion launcher or its command line for this program is not found. */
const fs=require('node:fs'),path=require('node:path');
const LAUNCHER=/^(launcher|config(uration)?|settings?|gameconfig)[^\\/]*\.exe$/i;
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function argsIn(buf,exe){
  const name=esc(path.basename(exe));
  for(const text of [buf.toString('latin1'),buf.toString('utf16le'),buf.length>1?buf.subarray(1).toString('utf16le'):'']){
    const m=new RegExp('(?:^|[\\\\/"\\s\\x00])'+name+'"?[ \\t]+([A-Za-z0-9_\\-][A-Za-z0-9_\\- ./=]{1,60}?)(?=[\\x00"\\r\\n]|$)','i').exec(text);
    if(m){const a=m[1].trim().split(/\s+/).filter(Boolean);if(a.length&&a.every(x=>!/%[sd]/.test(x)))return a;}
  }
  return null;
}
function launchArgs(executable){
  let names=[];try{names=fs.readdirSync(path.dirname(executable)).filter(f=>LAUNCHER.test(f));}catch{return null;}
  for(const n of names){let buf;try{const f=path.join(path.dirname(executable),n);if(fs.statSync(f).size>64*1024*1024)continue;buf=fs.readFileSync(f);}catch{continue;}
    const a=argsIn(buf,executable);if(a)return a;}
  return null;
}
module.exports={launchArgs,argsIn};
