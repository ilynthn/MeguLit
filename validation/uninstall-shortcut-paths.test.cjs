// SPDX-License-Identifier: GPL-3.0-or-later
// The uninstaller reads MeguLit's shortcuts to see which point into the install. The paths were passed to PowerShell
// after -Command, which split them at every space: the Start menu shortcuts ("...\Start Menu\Programs\...") and
// "Uninstall MeguLit.lnk" read as empty and were left behind. Real .lnk files in a temporary folder.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {realShortcuts}=require('../services/uninstall.cjs')._internal;

test('shortcuts whose paths have spaces are read',{skip:process.platform!=='win32'},()=>{
 // ASCII target: a shortcut made through WScript.Shell keeps only what the system code page can hold (CI is en-US).
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-lnk-')),target=path.join(base,'MeguLit app','MeguLit.exe');
 const files=[path.join(base,'Desktop','MeguLit.lnk'),path.join(base,'Desktop','Uninstall MeguLit.lnk'),path.join(base,'Start Menu','Programs','MeguLit.lnk'),path.join(base,'Start Menu','Programs','Uninstall MeguLit.lnk')];
 try{
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'');
  for(const f of files)fs.mkdirSync(path.dirname(f),{recursive:true});
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','$s=New-Object -ComObject WScript.Shell;foreach($f in ($env:LNKS -split [char]10)){$l=$s.CreateShortcut($f);$l.TargetPath=$env:TARGET;$l.Save()}'],{windowsHide:true,env:{...process.env,LNKS:files.join('\n'),TARGET:target}});
  const info=realShortcuts(files);
  for(const f of files)assert.equal(info[f]?.target,target,f);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
