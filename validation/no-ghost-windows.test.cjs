// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// 2026-11-14 (user: 「很久都没见过的蓝框又出来了 顶部」): a blue caption strip titled "MeguLit tools" with an x ran across the top
// of the monitor. That was Windows' "Ghost" window: when a process stops reading messages for 5 s, every visible window
// of it is covered by a stand-in with the same title and size and a basic caption. The reader overlay spans the monitor,
// so its ghost is a full-width title bar over the game. MeguLit, GalWindowBridge (glass/mask layers over the game) and
// the startup splash opt out of ghosting before they create a window, and the clipboard read no longer runs on the UI
// thread. The native check hangs two off-screen fixture popups (-4000,-4000; nothing on the monitor) and needs no game.
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),os=require('os'),{execFileSync}=require('child_process');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const csc=['C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'].find(f=>fs.existsSync(f));
const work=fs.existsSync('H:/')?'H:/MeguLit-Work/no-ghost-windows-test':path.join(os.tmpdir(),'megulit-no-ghost-windows-test');

test('every MeguLit process with windows opts out of ghosting before its first window',()=>{
 const main=read('desktop/src/main.rs'),policy=read('desktop/src/window_policy.rs');
 assert.match(policy,/fn no_ghost_windows\(\)\{[\s\S]*?DisableProcessWindowsGhosting\(\);/);
 const body=main.slice(main.indexOf('fn main()'));
 const call=body.indexOf('window_policy::no_ghost_windows();');
 assert.ok(call>0,'main() calls no_ghost_windows');
 for(const later of ['tauri::Builder::default()','StartupIsland.exe','single_instance::acquire'])assert.ok(call<body.indexOf(later),'before '+later);
 const bridge=read('native/GalWindowBridge.cs'),bridgeMain=bridge.slice(bridge.indexOf('public static int Main('));
 assert.ok(/^public static int Main\(string\[\] args\)\{\r?\n[^\n]*\r?\n[^\n]*\r?\n\s*NoGhostWindows\(\);/.test(bridgeMain),'GalWindowBridge opts out first thing in Main');
 assert.match(bridge,/static extern void DisableProcessWindowsGhosting\(\)/);
 const island=read('native/StartupIsland.cs');
 assert.match(island,/static int Main\(string\[\] args\)\{\s*try\{DisableProcessWindowsGhosting\(\);\}catch\{\}/);
});

test('the clipboard read runs off the UI thread; hidden windows are created hidden',()=>{
 const main=read('desktop/src/main.rs');
 assert.match(main,/async fn read_clipboard\(\)->Result<String,String>\{tauri::async_runtime::spawn_blocking\(clipboard::read\)/);
 const reader=main.slice(main.indexOf('async fn reader_open'),main.indexOf('async fn reader_connect'));
 assert.match(reader,/\.title\("MeguLit tools"\)[^\n]*\.visible\(false\)/,'the reader overlay ("MeguLit tools") is built hidden');
 assert.match(main,/WebviewWindowBuilder::from_config\(app,&config\)\?[^\n]*\.visible\(false\)/,'the home window is built hidden');
 const tray=read('desktop/src/tray_menu.rs');assert.match(tray,/\.visible\(false\)/,'the tray menu is built hidden');
});

const fixture=String.raw`using System;using System.Diagnostics;using System.Runtime.InteropServices;using System.Text;using System.Threading;
class F{
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CreateWindowExW(int ex,string cls,string title,uint style,int x,int y,int w,int h,IntPtr p,IntPtr m,IntPtr i,IntPtr a);
 [DllImport("user32.dll")]static extern void DisableProcessWindowsGhosting();[DllImport("user32.dll")]static extern bool DestroyWindow(IntPtr h);
 [DllImport("user32.dll")]static extern bool PeekMessage(out MSG m,IntPtr h,uint a,uint b,uint r);[DllImport("user32.dll")]static extern IntPtr DispatchMessage(ref MSG m);
 [StructLayout(LayoutKind.Sequential)]struct MSG{public IntPtr h;public uint m;public IntPtr w,l;public uint t;public int x,y;}
 delegate bool P(IntPtr h,IntPtr l);[DllImport("user32.dll")]static extern bool EnumWindows(P p,IntPtr l);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr h,StringBuilder s,int n);[DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")]static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);[DllImport("user32.dll")]static extern bool IsHungAppWindow(IntPtr h);
 static bool Ghost(string title){bool seen=false;EnumWindows((h,l)=>{var c=new StringBuilder(64);GetClassName(h,c,64);var t=new StringBuilder(200);GetWindowText(h,t,200);if(c.ToString()=="Ghost"&&t.ToString().StartsWith(title))seen=true;return true;},IntPtr.Zero);return seen;}
 static int Main(string[] a){
  if(a[0]=="hang"){if(a[1]=="off")DisableProcessWindowsGhosting();
   /* off screen, tool window, no activation: nothing appears on the monitor or the taskbar */
   var h=CreateWindowExW(0x08000080,"STATIC",a[2],0x90000000,-4000,-4000,320,200,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
   Console.WriteLine(h.ToInt64());Console.Out.Flush();MSG m;var end=DateTime.Now.AddMilliseconds(500);while(DateTime.Now<end){while(PeekMessage(out m,IntPtr.Zero,0,0,1))DispatchMessage(ref m);Thread.Sleep(10);}
   Thread.Sleep(int.Parse(a[3]));DestroyWindow(h);return 0;}
  /* probe: one fixture with ghosting, one opted out; both stop reading messages; poke them like a user would */
  var self=Process.GetCurrentProcess().MainModule.FileName;var tag="MeguLitGhostFixture"+Process.GetCurrentProcess().Id;var kids=new Process[2];var wins=new IntPtr[2];string[] modes={"on","off"};
  for(int i=0;i<2;i++){var s=new ProcessStartInfo(self,"hang "+modes[i]+" "+tag+modes[i]+" 9000");s.UseShellExecute=false;s.RedirectStandardOutput=true;s.CreateNoWindow=true;kids[i]=Process.Start(s);wins[i]=new IntPtr(long.Parse(kids[i].StandardOutput.ReadLine()));}
  bool[] ghost=new bool[2],hung=new bool[2];var stop=DateTime.Now.AddMilliseconds(8000);
  while(DateTime.Now<stop&&!ghost[0]){for(int i=0;i<2;i++){PostMessage(wins[i],0x200,IntPtr.Zero,(IntPtr)0x00100010);if(IsHungAppWindow(wins[i]))hung[i]=true;if(Ghost(tag+modes[i]))ghost[i]=true;}Thread.Sleep(200);}
  for(int i=0;i<2;i++){if(IsHungAppWindow(wins[i]))hung[i]=true;if(Ghost(tag+modes[i]))ghost[i]=true;try{kids[i].Kill();}catch{}}
  Console.WriteLine("{\"hungDefault\":"+hung[0].ToString().ToLower()+",\"ghostDefault\":"+ghost[0].ToString().ToLower()+",\"hungOptedOut\":"+hung[1].ToString().ToLower()+",\"ghostOptedOut\":"+ghost[1].ToString().ToLower()+"}");return 0;}}`;

test('a hung window gets a ghost by default and none after DisableProcessWindowsGhosting (off-screen fixtures)',{skip:process.platform!=='win32'||!csc||process.env.MEGULIT_HEADLESS_ONLY==='1'},()=>{
 fs.mkdirSync(work,{recursive:true});const src=path.join(work,'GhostFixture.cs'),exe=path.join(work,'GhostFixture.exe');
 fs.writeFileSync(src,fixture);execFileSync(csc,['-nologo','-out:'+exe,src],{stdio:'pipe'});
 const result=JSON.parse(execFileSync(exe,['probe'],{encoding:'utf8',timeout:30000}).trim().split(/\r?\n/).pop());
 assert.ok(result.hungDefault&&result.hungOptedOut,'both fixtures stopped answering: '+JSON.stringify(result));
 if(!result.ghostDefault)return; /* a session without DWM ghosting (service, locked) cannot show the difference */
 assert.equal(result.ghostOptedOut,false,'the opted-out window must never be replaced by a ghost: '+JSON.stringify(result));
});
