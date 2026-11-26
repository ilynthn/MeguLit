// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E215.4 (user): Anki has to be open for mining. MeguLit can find it, start it together with MeguLit, keep its window
// out of the taskbar, and close it again on exit. Only an Anki that MeguLit started is ever closed, and only through
// a normal WM_CLOSE to Anki's main window, so Anki saves its collection the normal way. Nothing is killed.
const fs=require('node:fs'),path=require('node:path'),{spawn,execFile}=require('node:child_process');
const {Anki}=require('./anki.cjs');

const ankiFolder=root=>path.join(root,'Anki');
function candidates(configured,env=process.env){
 const roots=[env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs'),env.ProgramFiles,env['ProgramFiles(x86)'],env.ProgramW6432].filter(Boolean);
 // Anki 25.x installs the program itself under %LOCALAPPDATA%\AnkiProgramFiles\.venv (ankiw.exe has no console).
 const venv=env.LOCALAPPDATA?['ankiw.exe','anki.exe'].map(name=>path.join(env.LOCALAPPDATA,'AnkiProgramFiles','.venv','Scripts',name)):[];
 return [configured,...roots.map(folder=>path.join(folder,'Anki','anki.exe')),...venv].filter(Boolean);
}
// Target of a Windows shortcut (.lnk, MS-SHLLINK): the local base path stored in its LinkInfo. '' when unreadable.
// That path is often stored only in the ANSI code page; a non-ASCII one is read back through the Shell as UTF-8.
function shortcutTarget(file){
 try{
  const b=fs.readFileSync(file);if(b.length<0x4c||b.readUInt32LE(0)!==0x4c)return '';
  const flags=b.readUInt32LE(0x14);let at=0x4c;if(flags&1)at+=2+b.readUInt16LE(at);if(!(flags&2))return '';
  const info=at,header=b.readUInt32LE(info+4),infoFlags=b.readUInt32LE(info+8);if(!(infoFlags&1))return '';
  const wide=offset=>{const start=info+offset;let end=start;while(end+1<b.length&&b.readUInt16LE(end))end+=2;return b.toString('utf16le',start,end);};
  if(header>=0x24)return wide(b.readUInt32LE(info+28))+wide(b.readUInt32LE(info+32));
  const narrow=offset=>{const start=info+offset;const end=b.indexOf(0,start);return b.subarray(start,end<0?b.length:end);},ansi=Buffer.concat([narrow(b.readUInt32LE(info+16)),narrow(b.readUInt32LE(info+24))]);
  /* a name outside the ANSI code page is stored as ? (en-US CI runner, Japanese folder): ask Windows for the Unicode target */
  if(!ansi.some(byte=>byte>0x7e||byte===0x3f))return ansi.toString('latin1');
  return require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;(New-Object -ComObject WScript.Shell).CreateShortcut($env:MEGULIT_LNK).TargetPath'],{encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,MEGULIT_LNK:file}}).replace(/^﻿/,'').trim();
 }catch{return '';}
}
// Cold detection (user: Anki installed outside C: was never found): when no default location has Anki, read where
// Windows says it was installed (uninstall entries and App Paths, per user and per machine), then the Start menu
// shortcut the installer made, then other drives' usual folders. Finally look in the current MeguLit folder.
// Anki's MSI may leave InstallLocation empty, and a copied Anki will have neither a registry entry nor a shortcut.
let coldHit;
function coldCandidates(env=process.env,root=''){
 const B=String.fromCharCode(92);
 const out=[],reg=path.join(env.WINDIR||['C:','Windows'].join(B),'System32','reg.exe');
 const query=key=>{try{return require('node:child_process').execFileSync(reg,['query',key,'/s'],{encoding:'utf8',windowsHide:true,timeout:4000,maxBuffer:8<<20,stdio:['ignore','pipe','ignore']});}catch{return '';}};
 for(const key of [['HKCU','SOFTWARE'].join(B),['HKLM','SOFTWARE'].join(B),['HKLM','SOFTWARE','WOW6432Node'].join(B)]){
  for(const block of query(key+['','Microsoft','Windows','CurrentVersion','Uninstall'].join(B)).split(/\r?\n\r?\n/)){
   if(!/DisplayName\s+REG_SZ\s+Anki\b/i.test(block))continue;
   // The official MSI leaves InstallLocation empty and its UninstallString is "MsiExec.exe /X{...}": an empty value
   // must not take the next line, and only absolute folders are used.
   for(const m of block.matchAll(/(InstallLocation|DisplayIcon|UninstallString)[ \t]+REG_(?:EXPAND_)?SZ[ \t]+(\S[^\r\n]*)/gi)){let v=m[2].trim().replace(/,\d+$/,'').replace(/"/g,'');if(/^msiexec/i.test(path.basename(v.split(/\s+\//)[0])))continue;if(/\.exe$/i.test(v))v=path.dirname(v);if(path.isAbsolute(v))out.push(path.join(v,'anki.exe'),path.join(v,'ankiw.exe'));}
  }
  const app=query(key+['','Microsoft','Windows','CurrentVersion','App Paths','anki.exe'].join(B)).match(/\(Default\)\s+REG_SZ\s+(.+)/i);if(app)out.push(app[1].trim().replace(/"/g,''));
 }
 for(const menu of [env.APPDATA&&path.join(env.APPDATA,'Microsoft','Windows','Start Menu','Programs'),env.ProgramData&&path.join(env.ProgramData,'Microsoft','Windows','Start Menu','Programs')].filter(Boolean)){
  for(const link of [path.join(menu,'Anki','Anki.lnk'),path.join(menu,'Anki.lnk')]){const target=shortcutTarget(link);if(/\.exe$/i.test(target))out.push(target);}
 }
 for(const drive of 'CDEFGH')out.push(drive+[':','Anki','anki.exe'].join(B),drive+[':','Program Files','Anki','anki.exe'].join(B),drive+[':','Apps','Anki','anki.exe'].join(B));
 if(env.USERPROFILE)out.push(path.join(env.USERPROFILE,'scoop','apps','anki','current','anki.exe'));
 if(root){
  const folder=ankiFolder(root);
  out.push(path.join(folder,'anki.exe'),path.join(folder,'ankiw.exe'));
 }
 return out;
}
function find(configured,env=process.env,exists=file=>{try{return fs.statSync(file).isFile();}catch{return false;}},root=''){
 for(const file of candidates(configured,env))if(exists(file))return file;
 if(coldHit&&exists(coldHit))return coldHit;
 const local=root?ankiFolder(root).toLowerCase():'';
 for(const file of coldCandidates(env,root))if(exists(file)){
  // A manually placed copy belongs to this root and should not be cached across relocations.
  if(path.dirname(file).toLowerCase()!==local)coldHit=file;
  return file;
 }
 return '';
}
// AnkiConnect is an Anki add-on (code 2055492159). Without it MeguLit cannot add cards even when Anki is open.
function addonEntryExists(dir){try{return fs.statSync(path.join(dir,'__init__.py')).isFile();}catch{return false;}}
function ankiConnectInstalled(env=process.env){const base=env.APPDATA&&path.join(env.APPDATA,'Anki2','addons21');if(!base)return null;try{return fs.readdirSync(base).some(name=>(name==='2055492159'||/anki-?connect/i.test(name))&&addonEntryExists(path.join(base,name)));}catch{return null;}}
// Anki's main window is a Qt window titled "Anki" or "<profile> - Anki"; the 25.x launcher runs Anki in a child
// process, so windows are matched by title and class rather than by the spawned PID.
const WINDOWS=`
Add-Type @'
using System;using System.Text;using System.Runtime.InteropServices;
public static class MeguLitAnkiWindows{
 delegate bool Proc(IntPtr h,IntPtr l);
 [DllImport("user32.dll")]static extern bool EnumWindows(Proc p,IntPtr l);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr h,int c);
 [DllImport("user32.dll")]static extern IntPtr GetWindow(IntPtr h,uint c);
 [DllImport("user32.dll")]static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 // E215.10: this helper is started hidden, and Windows turns a process's first ShowWindow into its STARTUPINFO
 // SW_HIDE, so "show" used to hide Anki. SetWindowPos(SWP_SHOWWINDOW) is not subject to that rule.
 [DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int ht,uint flags);
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")]static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("user32.dll")]static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll")]static extern void SwitchToThisWindow(IntPtr h,bool alt);
 [DllImport("user32.dll")]static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);
 // Bring Anki's main window to the front (the Alt tap lets a background process take the foreground).
 public static bool Focus(){IntPtr found=IntPtr.Zero;EnumWindows((h,l)=>{if(GetWindow(h,4)!=IntPtr.Zero||!IsWindowVisible(h))return true;var t=new StringBuilder(256);GetWindowText(h,t,256);var c=new StringBuilder(128);GetClassName(h,c,128);string title=t.ToString();if(c.ToString().StartsWith("Qt")&&(title=="Anki"||title.EndsWith(" - Anki"))){found=h;return false;}return true;},IntPtr.Zero);if(found==IntPtr.Zero)return false;SetWindowPos(found,IntPtr.Zero,0,0,0,0,0x0001|0x0002|0x0004|0x0040);keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(0x12,0,2,UIntPtr.Zero);if(!SetForegroundWindow(found)){uint pid;uint fg=GetWindowThreadProcessId(GetForegroundWindow(),out pid),me=GetCurrentThreadId();AttachThreadInput(me,fg,true);BringWindowToTop(found);SetForegroundWindow(found);AttachThreadInput(me,fg,false);if(GetForegroundWindow()!=found)SwitchToThisWindow(found,true);System.Threading.Thread.Sleep(150);}return GetForegroundWindow()==found;}
 // E451 (user, 2026-11-12: after closing MeguLit an Anki window came back that could not be clicked): every window
 // hidden here is recorded, because a modal dialog (sync progress, a prompt) hidden with Anki kept the main window
 // disabled once only the main window was shown again. Show restores the recorded dialog when Anki is blocked.
 [DllImport("user32.dll")]static extern bool IsWindowEnabled(IntPtr h);
 [DllImport("user32.dll")]static extern bool IsWindow(IntPtr h);
 static string Rec(){return System.IO.Path.Combine(System.IO.Path.GetTempPath(),"megulit-anki-hidden.txt");}
 static void Save(System.Collections.Generic.List<IntPtr> hs){if(hs.Count==0)return;try{var lines=new System.Collections.Generic.List<string>();foreach(var x in hs)lines.Add(x.ToInt64().ToString());System.IO.File.AppendAllLines(Rec(),lines);}catch{}}
 public static int RestoreBlocked(){var rec=new System.Collections.Generic.List<IntPtr>();try{foreach(var s in System.IO.File.ReadAllLines(Rec())){long v;if(long.TryParse(s,out v)&&!rec.Contains(new IntPtr(v)))rec.Add(new IntPtr(v));}System.IO.File.Delete(Rec());}catch{}
  int n=0;var mains=new System.Collections.Generic.List<IntPtr>();EnumWindows((h,l)=>{if(GetWindow(h,4)!=IntPtr.Zero||!IsWindowVisible(h))return true;var t=new StringBuilder(256);GetWindowText(h,t,256);var c=new StringBuilder(128);GetClassName(h,c,128);string title=t.ToString();if(c.ToString().StartsWith("Qt")&&(title=="Anki"||title.EndsWith(" - Anki")))mains.Add(h);return true;},IntPtr.Zero);
  foreach(var m in mains){if(IsWindowEnabled(m))continue;uint mp;GetWindowThreadProcessId(m,out mp);int before=n;
   for(int i=rec.Count-1;i>=0;i--){var h=rec[i];uint p;if(!IsWindow(h)||IsWindowVisible(h)||!IsWindowEnabled(h))continue;GetWindowThreadProcessId(h,out p);if(p!=mp)continue;SetWindowPos(h,IntPtr.Zero,0,0,0,0,0x0001|0x0002|0x0040);n++;}
   if(n==before&&!IsWindowEnabled(m))EnumWindows((h,l)=>{if(GetWindow(h,4)!=m||IsWindowVisible(h)||!IsWindowEnabled(h))return true;SetWindowPos(h,IntPtr.Zero,0,0,0,0,0x0001|0x0002|0x0040);n++;return true;},IntPtr.Zero);}
  return n;}
 public static int HidePids(int[] ids){var set=new System.Collections.Generic.HashSet<uint>();foreach(var i in ids)set.Add((uint)i);int k=0;var hid=new System.Collections.Generic.List<IntPtr>();EnumWindows((h,l)=>{if(!IsWindowVisible(h))return true;uint p;GetWindowThreadProcessId(h,out p);if(set.Contains(p)){ShowWindow(h,0);hid.Add(h);k++;}return true;},IntPtr.Zero);Save(hid);return k;}
 public static int Apply(string mode){if(mode=="hideall"){var pids=new System.Collections.Generic.HashSet<uint>();EnumWindows((h,l)=>{var t=new StringBuilder(256);GetWindowText(h,t,256);var c=new StringBuilder(128);GetClassName(h,c,128);string title=t.ToString();if(c.ToString().StartsWith("Qt")&&(title=="Anki"||title.EndsWith(" - Anki"))){uint p;GetWindowThreadProcessId(h,out p);pids.Add(p);}return true;},IntPtr.Zero);int k=0;var hid=new System.Collections.Generic.List<IntPtr>();EnumWindows((h,l)=>{if(!IsWindowVisible(h))return true;uint p;GetWindowThreadProcessId(h,out p);if(pids.Contains(p)){ShowWindow(h,0);hid.Add(h);k++;}return true;},IntPtr.Zero);Save(hid);return k;}bool show=mode=="show",close=mode=="close";if(!show&&!close&&mode!="hide")return 0;int n=0;EnumWindows((h,l)=>{if(GetWindow(h,4)!=IntPtr.Zero)return true;if(!close&&IsWindowVisible(h)==show)return true;var t=new StringBuilder(256);GetWindowText(h,t,256);var c=new StringBuilder(128);GetClassName(h,c,128);string title=t.ToString();if(!c.ToString().StartsWith("Qt"))return true;if(title!="Anki"&&!title.EndsWith(" - Anki"))return true;if(close)PostMessage(h,0x0010,IntPtr.Zero,IntPtr.Zero);else if(show)SetWindowPos(h,IntPtr.Zero,0,0,0,0,0x0001|0x0002|0x0004|0x0010|0x0040);else ShowWindow(h,0);n++;return true;},IntPtr.Zero);if(show)RestoreBlocked();return n;}
}
'@
$mode=[string]($args[0]);if($mode -like 'watch:*'){$until=[DateTime]::Now.AddMilliseconds([int]$mode.Substring(6));$ids=@();$n=0;while([DateTime]::Now -lt $until){if($n%10 -eq 0){$ids=@(Get-Process -ErrorAction SilentlyContinue|Where-Object{$_.Path -and $_.Path -like '*Anki*'}|ForEach-Object{$_.Id})};if($ids.Count){[void][MeguLitAnkiWindows]::HidePids([int[]]$ids)};[void][MeguLitAnkiWindows]::Apply('hideall');Start-Sleep -Milliseconds 30;$n++};0}elseif($mode -like 'keys:*'){[void][MeguLitAnkiWindows]::Apply('show');if([MeguLitAnkiWindows]::Focus()){Start-Sleep -Milliseconds 350;Add-Type -AssemblyName System.Windows.Forms;$k=$mode.Substring(5);if($k){[System.Windows.Forms.SendKeys]::SendWait($k)};1}else{0}}else{[MeguLitAnkiWindows]::Apply($mode)}`;
// Who listens on AnkiConnect's port (user, 2026-11-09: another program on 8765 answered instead of AnkiConnect and
// "reconnect" could never succeed). Returns [{pid,name,path}] from the OS; read-only.
const LISTENERS=`$p=[int]$args[0];$ids=@(Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue|ForEach-Object{$_.OwningProcess}|Sort-Object -Unique);foreach($i in $ids){$x=Get-Process -Id $i -ErrorAction SilentlyContinue;if($x){[string]$i+[char]9+$x.ProcessName+[char]9+$x.Path}}`;
function listeners(port){
 return new Promise(resolve=>{execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command','& {'+LISTENERS+'} '+Number(port)],{windowsHide:true,timeout:20000},(error,stdout)=>{
  if(error)return resolve([]);resolve(String(stdout).split(/\r?\n/).filter(Boolean).map(line=>{const [pid,name,file]=line.split('\t');return {pid:Number(pid),name:name||'',path:file||''};}).filter(x=>x.pid>4));});});
}
// Anki itself: anki.exe / ankiw.exe, or the Python of Anki 25.x's own venv (%LOCALAPPDATA%\AnkiProgramFiles).
function isAnki(proc){return /^ankiw?$/i.test(proc.name)||/[\\/]AnkiProgramFiles[\\/]|[\\/]Anki[\\/]/i.test(proc.path||'');}
function portOf(url){try{const u=new URL(url||'http://127.0.0.1:8765');return Number(u.port)||(u.protocol==='https:'?443:80);}catch{return 8765;}}
function kill(pid){try{process.kill(pid);return true;}catch{return false;}}
function windows(mode){
 return new Promise(resolve=>{execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command','& {'+WINDOWS+'} '+"'"+String(mode).replace(/'/g,"''")+"'"],{windowsHide:true,timeout:20000},(error,stdout)=>resolve(error?0:Number(String(stdout).trim())||0));});
}
class AnkiProcess{
 constructor({root='',config,log=()=>{},anki=new Anki(),windowControl=windows,portOwners=listeners,killer=kill,running=ankiRunning,ankiPids=ankiProcesses,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),spawner=spawn,watcher=null,now=Date.now}={}){this.portOwners=portOwners;this.killer=killer;this.running=running;this.ankiPids=ankiPids;this.wait=wait;this.windows=windowControl;this.spawner=spawner;this.watcherFactory=watcher;this.now=now;this.root=root;this.config=config;this.log=log;this.anki=anki;this.started=false;this.hidden=false;this.starting=null;this.hideRequested=false;this.startGen=0;}
 async online(){try{await this.anki.call(this.config(),'version');return true;}catch{return false;}}
 find(){return find(this.config().ankiPath,process.env,undefined,this.root);}
 stopWatch(){this.watcher?.kill?.();this.watcher=null;}
 async start({hide=false}={}){
  if(!hide)this.hideRequested=false;
  const pending=this.starting;
  if(pending){
   if(!hide&&(this.hidden||this.watcher))await this.show();
   return pending;
  }
  const gen=++this.startGen;
  this.hideRequested=!!hide;
  let hideStarted=false;
  const task=(async()=>{
   if(!this.hideRequested&&(this.hidden||this.watcher))await this.show();
   const isOnline=await this.online();
   if(gen!==this.startGen)throw Error('ANKI_OFFLINE');
   if(isOnline){
    if(this.hideRequested)await this.hide();
    return {running:true,started:false};
   }
   const alreadyRunning=!!this.running();
   const exe=alreadyRunning?'':this.find();
   if(!alreadyRunning&&!exe)throw Error('ANKI_EXECUTABLE_MISSING');
   if(this.hideRequested&&!alreadyRunning){hideStarted=true;this.hidden=true;this.watch(30000);}
   if(!alreadyRunning){
    await new Promise((resolve,reject)=>{
     let child;
     try{child=this.spawner(exe,[],{cwd:path.dirname(exe),detached:true,stdio:'ignore',windowsHide:this.hideRequested});}catch(err){reject(err);return;}
     let settled=false;
     const done=fn=>v=>{if(settled)return;settled=true;fn(v);};
     if(typeof child?.once==='function'){
      child.once('error',done(reject));
      child.once('spawn',done(()=>{child.unref?.();resolve();}));
     }else{child?.unref?.();done(resolve)();}
    }).catch(err=>{if(gen===this.startGen){this.stopWatch();this.hideRequested=false;this.hidden=false;}throw err;});
    this.started=true;this.log('[MeguLit] started Anki '+exe+(this.hideRequested?' (hidden)':''));
   }else{
    if(!this.hideRequested)await this.show();
    this.log('[MeguLit] Anki already running; waiting for AnkiConnect');
   }
   /* v1.1.5: a cold Anki syncs and loads add-ons before AnkiConnect answers; 45 s was often too short, so wait up to 90 s */
   for(let i=0;i<120;i++){
    await this.wait(750);
    const up=await this.online();
    if(gen!==this.startGen)throw Error('ANKI_OFFLINE');
    if(up){
     if(this.hideRequested)await this.hide();
     else if(hideStarted||this.hidden||this.watcher)await this.show();
     return {running:true,started:!alreadyRunning};
    }
    if(this.hideRequested&&!alreadyRunning&&i%2===0)await this.hide();
   }
   if(gen===this.startGen){this.hideRequested=false;if(this.hidden||this.watcher)await this.show();}
   throw Error('ANKI_OFFLINE');
  })().finally(()=>{if(this.starting===task)this.starting=null;});
  this.starting=task;
  return task;
 }
 // "Reconnect" that actually reconnects (user, 2026-11-09): close whatever else holds AnkiConnect's port, and when
 // AnkiConnect still does not answer, close Anki normally and start it cold so the add-on binds the port again.
 // Only programs listening on that port are touched; MeguLit itself never is.
 async repair({hide=false}={}){
  if(await this.online())return {running:true,repaired:false};
  const port=portOf(this.config().ankiUrl),owners=(await this.portOwners(port)).filter(p=>p.pid!==process.pid);
  const others=owners.filter(p=>!isAnki(p)),killed=[];
  for(const p of others)if(this.killer(p.pid)){killed.push(p.name||String(p.pid));this.log('[MeguLit] closed '+(p.name||p.pid)+' (pid '+p.pid+') holding AnkiConnect port '+port);}
  if(killed.length){for(let i=0;i<8;i++){await this.wait(500);if(await this.online())return {running:true,repaired:true,killed};}}
  // Cold start: a running Anki whose AnkiConnect failed to bind (or hangs) is closed the normal way first.
  const anki=(await this.portOwners(port)).some(isAnki)||this.running();
  this.startGen++;this.starting=null;this.stopWatch();
  if(anki){
   await this.windows('close');
   for(let i=0;i<30&&this.running();i++)await this.wait(500);
   if(this.running()){
    await this.show();
    this.log('[MeguLit] Anki did not close for a cold restart; shown for user');
    throw Error('ANKI_CLOSE_REQUIRED');
   }
  }
  const result=await this.start({hide});return {...result,repaired:true,killed,restarted:anki};
 }
 async hide(){const n=await this.windows('hideall');if(n)this.hidden=true;return n;}
 // E259: Anki's sync progress dialog and its 'collection synced' tooltip are separate windows of the same process
 // E265: one long-lived helper (compiled once) hides Anki's windows every ~30ms, so none is ever painted
 watch(ms){this.stopWatch();this.watcher=this.watcherFactory?this.watcherFactory(ms):execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command','& {'+WINDOWS+'} '+"'watch:"+Math.round(ms)+"'"],{windowsHide:true,timeout:ms+15000},()=>{});}
 sweep(ms){const until=Date.now()+ms;const tick=()=>{if(Date.now()>until||!this.hidden)return;this.windows('hideall').finally(()=>setTimeout(tick,400).unref?.());};tick();}
 async show(){this.stopWatch();this.hideRequested=false;this.hidden=false;return this.windows('show');}
 // E215.7 (user): open Anki's own add-on manager / deck options / custom study in its native window. AnkiConnect has
 // no action for those dialogs, so Anki is shown, focused and sent its own shortcut (Ctrl+Shift+A add-ons; on a deck's
 // overview O options, C custom study). If focusing fails, Anki is still shown on that deck for a click.
 async open(target,deck=''){
  if(!await this.online())throw Error('ANKI_OFFLINE');
  const c=this.config();if(!deck&&target!=='addons')deck=c.ankiDeck;if(deck&&target!=='addons')await this.anki.call(c,'guiDeckOverview',{name:deck});else if(target==='addons')await this.anki.call(c,'guiDeckBrowser').catch(()=>{});
  const keys={addons:'^+a',options:'o',custom:'c',overview:''}[target];if(keys===undefined)throw Error('ANKI_INVALID_TARGET');
  // E215.9: a background helper may not take the foreground, so MeguLit's own window process (in front after the
  // click) focuses Anki and presses the shortcut; this only makes sure Anki's window is shown.
  await this.show();return {opened:true,focused:false,shortcut:target};
 }
 async auto(){const c=this.config();if(!c.ankiAutoStart)return {skipped:true};try{return await this.start({hide:c.ankiHidden});}catch(error){this.log('[MeguLit] Anki auto start failed '+error.message);return {error:error.message};}}
 // E215.6: AnkiConnect's guiExitAnki answered but Anki kept running hidden (its timer is not kept alive), and the
 // user could not open Anki afterwards. Closing now posts WM_CLOSE to Anki's main window, the same as its close
 // button, so Anki saves and exits normally; an Anki that stays open is always shown again.
 async stop(){
  this.startGen++;this.starting=null;
  const close=this.started&&this.config().ankiAutoClose;this.started=false;
  this.hideRequested=false;
  try{
   if(!close){if(this.hidden||this.config().ankiHidden)await this.show();else this.stopWatch();return {closed:false};}
   const quiet=this.hidden||this.config().ankiHidden;if(quiet)this.watch(20000);const sent=await this.windows('close');
   const deadline=this.now()+4500;
   for(let i=0;i<40&&this.now()<deadline&&(await this.online()||this.running());i++){if(quiet)await this.windows('hideall');await this.wait(400);}
   this.hidden=false;
   if(await this.online()||this.running()){await this.show();this.log('[MeguLit] Anki did not close; shown again');return {closed:false};}
   this.log('[MeguLit] closed Anki started by MeguLit (windows='+sent+')');return {closed:true};
  }catch(error){this.log('[MeguLit] Anki close failed '+error.message);try{await this.show();}catch{this.stopWatch();}return {closed:false};}
  finally{this.stopWatch();}
 }
}
// One-click AnkiConnect (user, 2026-11-08: most "Anki will not connect" reports were a missing add-on). Downloads the
// add-on from AnkiWeb (its official channel), checks it really is the AnkiConnect package, and unpacks it into
// Anki's add-on folder under its AnkiWeb code. Anki must be closed so it does not overwrite the folder; an existing
// install is never replaced.
const ANKICONNECT_CODE='2055492159';
function ankiRunning(){if(ankiProcesses().length)return true;try{return /^"?(anki|ankiw)\.exe"?,/im.test(require('node:child_process').execFileSync('tasklist',['/fo','csv','/nh'],{encoding:'utf8',windowsHide:true,timeout:5000}));}catch{return false;}}
// Anki 25.x runs as pythonw.exe from its own venv, which tasklist names only "pythonw.exe"; find those by path.
function ankiProcesses(){try{const out=require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-Process -ErrorAction SilentlyContinue|Where-Object{$_.Path -and ($_.ProcessName -match '^ankiw?$' -or $_.Path -match 'AnkiProgramFiles')}|ForEach-Object{$_.Id}"],{encoding:'utf8',windowsHide:true,timeout:15000});return out.split(/\r?\n/).map(Number).filter(n=>n>4);}catch{return [];}}
// locate: the Anki program MeguLit can find (the configured path first). Without Anki2 that tells "never started"
// from "not installed", which needs a different hint.
/* fresh: Anki was just installed and has not started yet (one-click install): the add-on goes in before its first start,
   which loads it, instead of failing with ANKI_NEVER_STARTED */
async function installAnkiConnect(env=process.env,{locate=()=>find('',env),fresh=false,running=ankiRunning,fetcher=fetch,extract=(zip,out)=>require('node:child_process').execFileSync(path.join(env.WINDIR||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env:MEGULIT_ZIP -DestinationPath $env:MEGULIT_OUT -Force'],{windowsHide:true,timeout:60000,env:{...env,MEGULIT_ZIP:zip,MEGULIT_OUT:out}})}={}){
 if(!env.APPDATA)throw Error('ANKI_ADDON_FOLDER_MISSING');
 const base=path.join(env.APPDATA,'Anki2','addons21'),target=path.join(base,ANKICONNECT_CODE);
 if(ankiConnectInstalled(env))return {installed:true,already:true};
 if(!fs.existsSync(path.join(env.APPDATA,'Anki2'))){if(!locate())throw Error('ANKI_NOT_INSTALLED');if(!fresh)throw Error('ANKI_NEVER_STARTED');}
 if(running())throw Error('ANKI_RUNNING');
 let response,bytes;
 try{
  response=await fetcher('https://ankiweb.net/shared/download/'+ANKICONNECT_CODE+'?v=2.1&p=250900',{redirect:'follow',signal:AbortSignal.timeout(60000),headers:{'User-Agent':'MeguLit'}});
  if(!response.ok)throw Error('HTTP '+response.status);
  bytes=Buffer.from(await response.arrayBuffer());
 }catch(error){throw Error('ANKICONNECT_DOWNLOAD_FAILED: '+(error?.message||error));}
 if(bytes.length<4096||bytes.length>5<<20||bytes.readUInt32LE(0)!==0x04034b50)throw Error('ANKICONNECT_DOWNLOAD_FAILED: not an add-on package');
 const work=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'megulit-ankiconnect-')),zip=path.join(work,'addon.zip'),out=path.join(work,'addon');
 let staging='';
 try{
  fs.writeFileSync(zip,bytes);
  try{extract(zip,out);}catch(error){throw Error('ANKICONNECT_INSTALL_FAILED: '+(error?.message||error));}
  const init=path.join(out,'__init__.py'),cfg=path.join(out,'config.json');if(!fs.existsSync(init)||!fs.existsSync(cfg)||!/AnkiConnect|anki_connect|web\.WebServer|webBindAddress/i.test(fs.readFileSync(init,'utf8')+fs.readFileSync(cfg,'utf8')))throw Error('ANKICONNECT_DOWNLOAD_FAILED: unexpected package');
  fs.mkdirSync(base,{recursive:true});
  staging=fs.mkdtempSync(path.join(base,'.megulit-addon-'));
  fs.cpSync(out,staging,{recursive:true,force:true});
  if(ankiConnectInstalled(env))return {installed:true,already:true};
  if(running())throw Error('ANKI_RUNNING');
  const existing=fs.lstatSync(target,{throwIfNoEntry:false});
  if(existing){
   if(addonEntryExists(target))return {installed:true,already:true};
   if(existing.isDirectory()&&!existing.isSymbolicLink())fs.rmSync(target,{recursive:true,force:true});
   else throw Error('ANKICONNECT_INSTALL_FAILED: target exists');
  }
  try{
   fs.renameSync(staging,target);
   staging='';
  }catch(error){
   if(ankiConnectInstalled(env))return {installed:true,already:true};
   throw error;
  }
  return {installed:true,path:target};
 }finally{fs.rmSync(work,{recursive:true,force:true});if(staging)fs.rmSync(staging,{recursive:true,force:true});}
}
module.exports={AnkiProcess,find,candidates,ankiFolder,coldCandidates,shortcutTarget,ankiConnectInstalled,installAnkiConnect,ankiRunning,windows,listeners,isAnki,portOf};
