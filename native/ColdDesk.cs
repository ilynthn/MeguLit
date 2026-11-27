// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 (owner: 闲时冷测试) runs one library game on a separate, invisible Windows desktop for the idle-time cold test
// (services/cold-test-run.cjs, docs/cold-test.md). Same idea as the owner's test tools HidDesk (separate desktop, PostMessage
// input, PrintWindow pictures) and MuteProc (the game's audio sessions muted), in one helper that ships with MeguLit.
//
//   ColdDesk.exe status
//     one JSON line: {idleMs, ac (true|false|null = no battery), fullscreen, cpu (0..1 over 1 s), quns}
//   ColdDesk.exe run <game.exe> [--seconds N] [--steam-appid ID]
//     starts the game suspended on desktop "MeguLitColdDesk" inside a job object (KILL_ON_JOB_CLOSE: the whole process tree
//     dies with this helper), keeps every audio session of the job muted, and prints JSON events, one per line:
//       {"type":"started","pid":n,"started":"<StartTime UTC ticks>"}   {"type":"window","hwnd":"…","w":n,"h":n,"title":"…"}
//       {"type":"input"}  the user touched keyboard or mouse: the game is ended at once
//       {"type":"power","ac":false}  {"type":"fullscreen","on":true}   (reported; the service decides)
//       {"type":"relaunched","pid":n}  the same program appeared outside our job: report only; never kill the player's process
//       {"type":"shot","ok":true,"path":"…","w":n,"h":n,"black":false,"source":"wgc|printwindow|screen","wgc":"<why WGC was not used>"}  {"type":"timeout"}  {"type":"exited","code":n}
//       {"type":"ended","why":"…"}  last line
//     stdin commands, one per line: key <vk> | keydown <vk> | keyup <vk> | click <x> <y> | activate | shot <maxWidth> <path> | kill
// The user's screen, taskbar, focus, mouse and keyboard are never touched: input is PostMessage to the game's window only, so
// GetLastInputInfo keeps measuring the user alone.
using System;using System.Collections.Generic;using System.Diagnostics;using System.Drawing;using System.Drawing.Imaging;using System.IO;
using System.Runtime.InteropServices;using System.Text;using System.Threading;

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator{int EnumAudioEndpoints(int flow,int mask,out IMMDeviceCollection c);}
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection{int GetCount(out int n);int Item(int i,out IMMDevice d);}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice{int Activate(ref Guid id,int ctx,IntPtr p,[MarshalAs(UnmanagedType.IUnknown)] out object o);}
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2{int f1();int f2();int GetSessionEnumerator(out IAudioSessionEnumerator e);}
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator{int GetCount(out int n);int GetSession(int i,out IAudioSessionControl2 s);}
[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2{int a1();int a2();int a3();int a4();int a5();int a6();int a7();int a8();int a9();int b1();int b2();int GetProcessId(out uint pid);}
[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume{int SetMasterVolume(float v,ref Guid g);int GetMasterVolume(out float v);int SetMute(bool m,ref Guid g);int GetMute(out bool m);}
[ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCls{}

static class ColdDesk{
 internal delegate void SuspendedLaunch(string exe,string desktop,out IntPtr process,out IntPtr thread,out int pid);
 const string DESK="MeguLitColdDesk";
 [StructLayout(LayoutKind.Sequential)] struct RECT{public int L,T,R,B;}
 [StructLayout(LayoutKind.Sequential)] struct POINT{public int X,Y;}
 [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO{public uint cbSize,dwTime;}
 [StructLayout(LayoutKind.Sequential)] struct SYSTEM_POWER_STATUS{public byte ACLineStatus,BatteryFlag,BatteryLifePercent,SystemStatusFlag;public int BatteryLifeTime,BatteryFullLifeTime;}
 [StructLayout(LayoutKind.Sequential)] struct FILETIME{public uint Lo,Hi;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STARTUPINFO{public int cb;public string lpReserved,lpDesktop,lpTitle;public int dwX,dwY,dwXSize,dwYSize,dwXCountChars,dwYCountChars,dwFillAttribute,dwFlags;public short wShowWindow,cbReserved2;public IntPtr lpReserved2,hStdInput,hStdOutput,hStdError;}
 [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION{public IntPtr hProcess,hThread;public int dwProcessId,dwThreadId;}
 [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_BASIC_LIMIT_INFORMATION{public long PerProcessUserTimeLimit,PerJobUserTimeLimit;public uint LimitFlags;public UIntPtr MinimumWorkingSetSize,MaximumWorkingSetSize;public uint ActiveProcessLimit;public UIntPtr Affinity;public uint PriorityClass,SchedulingClass;}
 [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS{public ulong a,b,c,d,e,f;}
 [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION{public JOBOBJECT_BASIC_LIMIT_INFORMATION Basic;public IO_COUNTERS Io;public UIntPtr ProcessMemoryLimit,JobMemoryLimit,PeakProcessMemoryUsed,PeakJobMemoryUsed;}
 delegate bool EnumProc(IntPtr h,IntPtr l);
 [DllImport("user32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern IntPtr CreateDesktop(string n,IntPtr d,IntPtr m,int f,uint a,IntPtr s);
 [DllImport("user32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern IntPtr OpenDesktop(string n,int f,bool i,uint a);
 [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr d);
 [DllImport("user32.dll")] static extern bool EnumDesktopWindows(IntPtr d,EnumProc cb,IntPtr l);
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb,IntPtr l);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h,ref POINT p);
 [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
 [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h,IntPtr dc);
 [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dst,int x,int y,int w,int h,IntPtr src,int sx,int sy,int rop);
 /* 2026-11-27 (MeguLit-Adapter, ISLAND): on the user's own desktop (--visible) a Direct3D window PrintWindow cannot read is taken from
    the composed screen instead (BitBlt of the screen DC at the client area); on the hidden desktop nothing changes */
 static bool OnUserDesktop;
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h,IntPtr dc,uint f);
 [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int cx,int cy,uint f);
 [DllImport("user32.dll")] static extern IntPtr ChildWindowFromPointEx(IntPtr h,POINT p,uint f);
 [DllImport("user32.dll")] static extern int MapWindowPoints(IntPtr a,IntPtr b,ref POINT p,uint n);
 [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code,uint type);
 [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO i);
 [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
 [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS s);
 [DllImport("kernel32.dll")] static extern bool GetSystemTimes(out FILETIME idle,out FILETIME kernel,out FILETIME user);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string dir,ref STARTUPINFO si,out PROCESS_INFORMATION pi);
 [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr h);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h,out uint code);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr a,string n);
 [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr j,int c,ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION i,uint n);
 [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr j,IntPtr p);
 [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr j,uint code);
 [DllImport("kernel32.dll")] static extern bool QueryInformationJobObject(IntPtr j,int c,IntPtr info,uint n,IntPtr ret);
 [DllImport("kernel32.dll")] static extern uint GetTickCount();

 static readonly object Out=new object();
 static void Emit(string json){lock(Out){Console.Out.WriteLine(json);Console.Out.Flush();}}
 static string Q(string s){var b=new StringBuilder("\"");foreach(var c in s??""){if(c=='"'||c=='\\'){b.Append('\\').Append(c);}else if(c<0x20||c>0x7e){b.Append("\\u").Append(((int)c).ToString("x4"));}else b.Append(c);}return b.Append('"').ToString();}

 static int Main(string[] a){
  if(a.Length<1){/* --visible (tools/adapt-auto.cjs --foreground, owner away): the game on the user's own desktop, still muted and in the job */Console.Error.WriteLine("ColdDesk status | run <game.exe> [--seconds N] [--steam-appid ID] [--ignore-input] [--visible]");return 2;}
  try{if(a[0]=="status"){Emit(Status());return 0;}if(a[0]=="run"&&a.Length>1){if(Array.IndexOf(a,"--visible")>=2){OnUserDesktop=true;return Run(a,"Default");}return Run(a);}}
  catch(Exception e){Emit("{\"type\":\"ended\",\"why\":"+Q("error "+e.Message)+"}");return 1;}
  return 2;}

 /* ---- status ---------------------------------------------------------------------------------------------------- */
 static uint IdleMs(){var li=new LASTINPUTINFO();li.cbSize=(uint)Marshal.SizeOf(li);if(!GetLastInputInfo(ref li))return 0;return unchecked(GetTickCount()-li.dwTime);}
 static string Ac(){SYSTEM_POWER_STATUS s;if(!GetSystemPowerStatus(out s))return "null";if((s.BatteryFlag&128)!=0||s.BatteryFlag==255)return "null";return s.ACLineStatus==1?"true":s.ACLineStatus==0?"false":"null";}
 /* QUNS_BUSY 2, QUNS_RUNNING_D3D_FULL_SCREEN 3, QUNS_PRESENTATION_MODE 4 */
 static int Quns(){int q=0;try{SHQueryUserNotificationState(out q);}catch{}return q;}
 static ulong Ft(FILETIME f){return ((ulong)f.Hi<<32)|f.Lo;}
 static double Cpu(){FILETIME i0,k0,u0,i1,k1,u1;if(!GetSystemTimes(out i0,out k0,out u0))return -1;Thread.Sleep(1000);GetSystemTimes(out i1,out k1,out u1);
  double idle=Ft(i1)-Ft(i0),total=(Ft(k1)-Ft(k0))+(Ft(u1)-Ft(u0));return total<=0?0:Math.Max(0,Math.Min(1,1-idle/total));}
 static string Status(){double cpu=Cpu();int q=Quns();return "{\"idleMs\":"+IdleMs()+",\"ac\":"+Ac()+",\"fullscreen\":"+(q==2||q==3||q==4?"true":"false")+",\"quns\":"+q+",\"cpu\":"+cpu.ToString("0.000",System.Globalization.CultureInfo.InvariantCulture)+"}";}

 /* ---- run ------------------------------------------------------------------------------------------------------- */
 static IntPtr Job,Desk,GameWin;static HashSet<uint> Pids=new HashSet<uint>();static string ImageName="";static DateTime StartedAt;
 static readonly object CleanupLock=new object();static volatile bool Stopping;static bool Cleaned,CleanupSafe=true;static int StopRequested;
 static List<uint> JobPids(){var l=new List<uint>();int size=8+IntPtr.Size*1024;IntPtr buf=Marshal.AllocHGlobal(size);try{if(!QueryInformationJobObject(Job,3,buf,(uint)size,IntPtr.Zero))throw new Exception("Cannot confirm cold job process list");int n=Marshal.ReadInt32(buf,4);for(int i=0;i<n;i++)l.Add((uint)Marshal.ReadIntPtr(buf,8+i*IntPtr.Size).ToInt64());}finally{Marshal.FreeHGlobal(buf);}return l;}
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,StringBuilder name,int max);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr hwnd,EnumProc callback,IntPtr data);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint msg,IntPtr length,StringBuilder text,uint flags,uint timeout,out IntPtr result);
 /* 2026-11-27 (Monochrome Empire, YU-RIS name entry: three #32770 「名前入力」 dialogs, Edit + OK). services/cold-input.ps1 answers them
    with EnumThreadWindows from the visible desktop, which finds nothing on this hidden desktop: the runs that passed it were --foreground,
    every hidden run stalled on the first dialog. "dialog [name]": a visible #32770 of the game's job on this desktop with an Edit gets the
    name when the Edit is empty, then its OK (id 1, or OK / 決定 / はい) is pressed; any other dialog is only reported */
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",CharSet=CharSet.Unicode)] static extern IntPtr SendText(IntPtr hwnd,uint msg,IntPtr w,string text,uint flags,uint timeout,out IntPtr result);
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW")] static extern IntPtr SendPlain(IntPtr hwnd,uint msg,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
 [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr h);
 static string WinText(IntPtr h){var b=new StringBuilder(256);GetWindowText(h,b,256);return b.ToString();}
 static void AnswerDialog(string name){
  var pids=new HashSet<uint>(JobPids());var dlgs=new List<IntPtr>();var cls=new StringBuilder(80);
  EnumDesktopWindows(Desk,(h,l)=>{uint p;GetWindowThreadProcessId(h,out p);cls.Clear();GetClassName(h,cls,cls.Capacity);if(pids.Contains(p)&&IsWindowVisible(h)&&cls.ToString()=="#32770")dlgs.Add(h);return true;},IntPtr.Zero);
  if(dlgs.Count==0)return;var o=new StringBuilder();IntPtr res;
  foreach(var d in dlgs){IntPtr edit=IntPtr.Zero,ok=IntPtr.Zero;var labels=new List<string>();
   EnumChildWindows(d,(h,l)=>{var c=new StringBuilder(80);GetClassName(h,c,c.Capacity);string k=c.ToString(),x=WinText(h);
    if(k=="Edit"&&edit==IntPtr.Zero)edit=h;else if(k=="Button"){if(GetDlgCtrlID(h)==1||System.Text.RegularExpressions.Regex.IsMatch(x.Trim(),"^(OK|ＯＫ|決定|はい|&OK)$",System.Text.RegularExpressions.RegexOptions.IgnoreCase))ok=h;}else if(k=="Static"&&x.Trim().Length>0&&labels.Count<4)labels.Add(x.Trim());return true;},IntPtr.Zero);
   string had=edit!=IntPtr.Zero?WinText(edit):"";bool filled=false;
   if(edit!=IntPtr.Zero&&had.Trim().Length==0&&!String.IsNullOrEmpty(name)){SendText(edit,0x0C,IntPtr.Zero,name,2,2000,out res);filled=true;}
   if(ok!=IntPtr.Zero&&edit!=IntPtr.Zero)SendPlain(ok,0xF5,IntPtr.Zero,IntPtr.Zero,2,2000,out res);
   o.Append((o.Length>0?" | ":"")+"\""+WinText(d)+"\" "+String.Join("/",labels)+(edit!=IntPtr.Zero?" edit=\""+(filled?name:had)+"\"":"")+(ok==IntPtr.Zero?" no-ok":edit!=IntPtr.Zero?" ok":" left"));}
  Emit("{\"type\":\"dialog\",\"what\":"+Q(o.ToString())+"}");}
 static void ReadGameDialog(IntPtr window){
  var cls=new StringBuilder(80);GetClassName(window,cls,cls.Capacity);
  if(cls.ToString()!="#32770")return;
  uint owner;GetWindowThreadProcessId(window,out owner);int count=0;
  EnumChildWindows(window,delegate(IntPtr child,IntPtr data){
   uint pid;GetWindowThreadProcessId(child,out pid);cls.Clear();GetClassName(child,cls,cls.Capacity);
   if(pid==owner && cls.ToString()=="Static" && IsWindowVisible(child)){
    var label=new StringBuilder(1024);IntPtr length;
    if(SendMessageTimeout(child,13,(IntPtr)label.Capacity,label,2,200,out length)!=IntPtr.Zero && length.ToInt64()>0)
     Emit("{\"type\":\"gameDialog\",\"text\":"+Q(label.ToString())+"}");
    count++;
   }
   return count<8;
  },IntPtr.Zero);
 }
 internal static IntPtr RootWindow(int pid){
  uint owner;var hwnd=GameWin;
  return hwnd!=IntPtr.Zero && GetWindowThreadProcessId(hwnd,out owner)!=0 && owner==pid && JobPids().Contains(owner) ? hwnd : IntPtr.Zero;
 }
 static IntPtr Biggest(){IntPtr best=IntPtr.Zero;long area=-1;var pids=new HashSet<uint>(JobPids());EnumProc cb=(h,_)=>{uint p;GetWindowThreadProcessId(h,out p);if(!pids.Contains(p)||!IsWindowVisible(h))return true;RECT r;GetWindowRect(h,out r);long s=(long)(r.R-r.L)*(r.B-r.T);if(s>area){area=s;best=h;}return true;};
  EnumDesktopWindows(Desk,cb,IntPtr.Zero);return best;}
 static Dictionary<uint,Process> audioGuards=new Dictionary<uint,Process>();
 static bool requireObservedAudio;
 internal static bool AudioReadback {get;private set;}
 static void CheckAudioExit(Process guard){
  if(requireObservedAudio && guard.ExitCode==0)AudioReadback=true;
  if(guard.ExitCode!=0 && !(requireObservedAudio && guard.ExitCode==3))CleanupSafe=false;
 }
 static void StopAudioGuards(){
  foreach(var guard in audioGuards.Values){
   try{
    if(!guard.HasExited){guard.StandardInput.WriteLine("stop");if(!guard.WaitForExit(4000)){CleanupSafe=false;continue;}}
    CheckAudioExit(guard);
   }catch{try{if(guard.HasExited)CheckAudioExit(guard);else CleanupSafe=false;}catch{CleanupSafe=false;}}
   finally{guard.Dispose();}
  }
  audioGuards.Clear();
 }
 static readonly Dictionary<ISimpleAudioVolume,bool> originalMute=new Dictionary<ISimpleAudioVolume,bool>();
 static void RestoreAudio(){foreach(var kv in originalMute){try{Guid g=Guid.Empty;kv.Key.SetMute(kv.Value,ref g);}catch{CleanupSafe=false;}}originalMute.Clear();}
 static void Mute(){lock(CleanupLock){if(Stopping)return;foreach(uint pid in JobPids()){if(audioGuards.ContainsKey(pid)){if(audioGuards[pid].HasExited)throw new Exception("Audio guard stopped before cleanup");continue;}long started;using(var game=Process.GetProcessById((int)pid))started=game.StartTime.ToUniversalTime().Ticks;if(!JobPids().Contains(pid))continue;var helper=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ColdCapture64.exe");var s=new ProcessStartInfo(helper,(requireObservedAudio?"--audio-watch-observed ":"--audio-watch ")+Process.GetCurrentProcess().Id+" "+pid+" "+started);s.UseShellExecute=false;s.CreateNoWindow=true;s.RedirectStandardInput=true;try{audioGuards[pid]=Process.Start(s);}catch{throw new Exception("Audio guard unavailable");}}}}
 static void Cleanup(){lock(CleanupLock){if(Cleaned)return;Stopping=true;
  StopAudioGuards();RestoreAudio();if(Job!=IntPtr.Zero){try{if(!TerminateJobObject(Job,1))CleanupSafe=false;var until=DateTime.UtcNow.AddSeconds(4);while(JobPids().Count>0&&DateTime.UtcNow<until)Thread.Sleep(20);if(JobPids().Count!=0)CleanupSafe=false;}catch{CleanupSafe=false;}finally{CloseHandle(Job);Job=IntPtr.Zero;}}
  Cleaned=true;Emit("{\"type\":\"cleanup\",\"safe\":"+(CleanupSafe?"true":"false")+"}");}}
 /* Independent of PrintWindow and the command queue: parent death/EOF can always end this owned job. */
 static void RequestStop(){Stopping=true;if(Interlocked.Exchange(ref StopRequested,1)==0)new Thread(Cleanup){IsBackground=true}.Start();}
 static void WatchParent(int pid){if(pid<=0)return;new Thread(()=>{try{using(var owner=Process.GetProcessById(pid)){while(!Stopping&&!owner.HasExited)Thread.Sleep(100);if(owner.HasExited)RequestStop();}}catch{RequestStop();}}){IsBackground=true}.Start();}
 static IntPtr Lp(uint vk,bool up){uint sc=MapVirtualKey(vk,0);long l=1|(sc<<16);if(up)l|=0xC0000000L;return (IntPtr)unchecked((int)l);}
 static void Key(uint vk,bool down,bool up){if(GameWin==IntPtr.Zero)return;if(down)PostMessage(GameWin,0x100,(IntPtr)vk,Lp(vk,false));if(down&&up&&(vk==0x0d||vk==0x20||vk==0x1b))PostMessage(GameWin,0x102,(IntPtr)vk,Lp(vk,false));if(up)PostMessage(GameWin,0x101,(IntPtr)vk,Lp(vk,true));}
 /* hover: a WM_MOUSEMOVE to the deepest child under the point, nothing pressed (KiriKiri buttons take the hover state from it) */
 static void Move(int x,int y){if(GameWin==IntPtr.Zero)return;var w=GameWin;for(int i=0;i<8;i++){POINT pt;pt.X=x;pt.Y=y;var c=ChildWindowFromPointEx(w,pt,1);if(c==IntPtr.Zero||c==w)break;POINT o;o.X=0;o.Y=0;MapWindowPoints(c,w,ref o,1);x-=o.X;y-=o.Y;w=c;}PostMessage(w,0x200,IntPtr.Zero,(IntPtr)((y<<16)|(x&0xffff)));}
 static void Click(int x,int y){if(GameWin==IntPtr.Zero)return;var w=GameWin;/* the deepest child under the point (KiriKiri draws in a child) */for(int i=0;i<8;i++){POINT pt;pt.X=x;pt.Y=y;var c=ChildWindowFromPointEx(w,pt,1);if(c==IntPtr.Zero||c==w)break;POINT o;o.X=0;o.Y=0;MapWindowPoints(c,w,ref o,1);x-=o.X;y-=o.Y;w=c;}
  var lp=(IntPtr)((y<<16)|(x&0xffff));PostMessage(w,0x200,IntPtr.Zero,lp);PostMessage(w,0x201,(IntPtr)1,lp);Thread.Sleep(40);PostMessage(w,0x202,IntPtr.Zero,lp);}
 /* games pause when they think they lost focus: tell the window it is the active one (on its own desktop) */
 static void Activate(){if(GameWin==IntPtr.Zero)return;PostMessage(GameWin,0x1C,(IntPtr)1,IntPtr.Zero);PostMessage(GameWin,0x06,(IntPtr)1,IntPtr.Zero);PostMessage(GameWin,0x86,(IntPtr)1,IntPtr.Zero);PostMessage(GameWin,0x07,IntPtr.Zero,IntPtr.Zero);}
 static ImageCodecInfo Jpeg(){foreach(var c in ImageCodecInfo.GetImageEncoders())if(c.MimeType=="image/jpeg")return c;return null;}
 /* the client area only (PW_CLIENTONLY | PW_RENDERFULLCONTENT), scaled to maxWidth, JPEG q70; black = nothing drawn */
 /* 2026-11-27 (ISLAND, visible runs while the owner was away: the game opened behind the window that had the foreground, a process
    started from a background service cannot take it, and every shot found the other window on the game's points: 0 lines; the
    same copy ran 537 lines when it happened to open on top) on the user's own desktop the game window is raised when it opens and
    whenever a shot finds it covered */
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a,uint b,bool on);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
 static void Raise(IntPtr w){if(!OnUserDesktop||w==IntPtr.Zero)return;uint dummy;uint fg=GetWindowThreadProcessId(GetForegroundWindow(),out dummy),me=GetCurrentThreadId();bool att=fg!=0&&fg!=me&&AttachThreadInput(me,fg,true);
  try{SetWindowPos(w,IntPtr.Zero,0,0,0,0,0x0003|0x0040);BringWindowToTop(w);SetForegroundWindow(w);}finally{if(att)AttachThreadInput(me,fg,false);}}
 /* 2026-11-27 Windows.Graphics.Capture first (MeguLitWgcShot.exe beside this helper, native/wgcshot): it reads the game's own
    surface from DWM, so a game under other windows, in the background or drawing with Direct3D still gives its own picture and
    is not raised over the user's windows. WGC works only on the user's desktop; on the hidden desktop, when the helper is
    missing or WGC fails (old Windows, minimised, no frame) the PrintWindow path below is used and the shot event says why
    ("wgc":"<why>"). */
 static string WgcExe=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"MeguLitWgcShot.exe");
 static Bitmap WgcPicture(out string why){why="";
  if(!OnUserDesktop){why="hidden-desktop";return null;}
  if(!File.Exists(WgcExe)){why="no MeguLitWgcShot.exe";return null;}
  string tmp=Path.Combine(Path.GetTempPath(),"megulit-colddesk-wgc-"+Process.GetCurrentProcess().Id+".png");
  try{var si=new ProcessStartInfo(WgcExe,"--hwnd "+GameWin.ToInt64()+" --method wgc --timeout-ms 2000 --out \""+tmp+"\"");si.UseShellExecute=false;si.CreateNoWindow=true;si.RedirectStandardOutput=true;
   string line="";using(var p=Process.Start(si)){line=p.StandardOutput.ReadToEnd();if(!p.WaitForExit(8000)){try{p.Kill();}catch{}why="timeout";return null;}}
   if(line.IndexOf("\"ok\":true",StringComparison.Ordinal)<0||line.IndexOf("\"method\":\"wgc\"",StringComparison.Ordinal)<0){var m=System.Text.RegularExpressions.Regex.Match(line,"\"error\":\"([^\"]*)\"");why=m.Success?m.Groups[1].Value:"no picture";return null;}
   if(line.IndexOf("\"blank\":true",StringComparison.Ordinal)>=0){why="black";return null;}
   using(var f=new Bitmap(tmp))return new Bitmap(f);}
  catch(Exception e){why="error "+e.Message;return null;}
  finally{try{File.Delete(tmp);}catch{}}}
 static void Shot(int maxW,string file){if(GameWin==IntPtr.Zero){Emit("{\"type\":\"shot\",\"ok\":false,\"why\":\"no window\"}");return;}RECT r;GetClientRect(GameWin,out r);int w=r.R-r.L,h=r.B-r.T;if(w<16||h<16){Emit("{\"type\":\"shot\",\"ok\":false,\"why\":\"tiny\"}");return;}
  string wgcWhy;Bitmap wgc=WgcPicture(out wgcWhy);if(wgc!=null){w=wgc.Width;h=wgc.Height;}
  using(var b=wgc??new Bitmap(w,h,PixelFormat.Format32bppArgb)){bool black=false,screen=false,covered=false;
   if(wgc==null){using(var g=Graphics.FromImage(b)){var dc=g.GetHdc();try{PrintWindow(GameWin,dc,3);}finally{g.ReleaseHdc(dc);}}
    black=IsBlack(b,w,h);covered=OnUserDesktop&&!GameOnTop(w,h);if(covered){Raise(GameWin);System.Threading.Thread.Sleep(200);covered=!GameOnTop(w,h);}
    if(black&&OnUserDesktop&&!covered){var p=new POINT();ClientToScreen(GameWin,ref p);IntPtr sdc=GetDC(IntPtr.Zero);try{using(var g=Graphics.FromImage(b)){var dc=g.GetHdc();try{BitBlt(dc,0,0,w,h,sdc,p.X,p.Y,0x00CC0020);}finally{g.ReleaseHdc(dc);}}}finally{ReleaseDC(IntPtr.Zero,sdc);}black=IsBlack(b,w,h);screen=true;}}
   int tw=Math.Min(w,Math.Max(160,maxW)),th=(int)Math.Round(h*(double)tw/w);
   using(var s=new Bitmap(tw,th)){using(var g=Graphics.FromImage(s)){g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;g.DrawImage(b,0,0,tw,th);}
    var ep=new EncoderParameters(1);ep.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,70L);Directory.CreateDirectory(Path.GetDirectoryName(file));/* .png: lossless (the cold OCR reads outlined button labels JPEG blurs) */if(file.EndsWith(".png",StringComparison.OrdinalIgnoreCase))s.Save(file,ImageFormat.Png);else s.Save(file,Jpeg(),ep);}
   Emit("{\"type\":\"shot\",\"ok\":true,\"path\":"+Q(file)+",\"w\":"+tw+",\"h\":"+th+",\"black\":"+(black?"true":"false")+(wgc!=null?",\"source\":\"wgc\"":screen?",\"source\":\"screen\"":",\"source\":\"printwindow\"")+(wgc==null?",\"wgc\":"+Q(wgcWhy):"")+(covered?",\"covered\":true":"")+"}");}}
 /* the screen is read only where the game itself is on top: the centre and four inner corners of its client area all hit a window of the
    game's process (千恋＊万花 run: the game lay under the user's other windows and the screen read took those instead) */
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
 static bool GameOnTop(int w,int h){uint game;GetWindowThreadProcessId(GameWin,out game);int[][] at={new[]{w/2,h/2},new[]{8,8},new[]{w-8,8},new[]{8,h-8},new[]{w-8,h-8}};
  foreach(var a in at){var p=new POINT();p.X=a[0];p.Y=a[1];ClientToScreen(GameWin,ref p);var hit=WindowFromPoint(p);uint pid;if(hit==IntPtr.Zero)return false;GetWindowThreadProcessId(hit,out pid);if(pid!=game)return false;}return true;}
 /* black = nothing drawn: mean and spread of a 64 x 48 sample of the picture both tiny */
 static bool IsBlack(Bitmap b,int w,int h){double sum=0,sq=0;int n=0;for(int yy=0;yy<h;yy+=Math.Max(1,h/48))for(int xx=0;xx<w;xx+=Math.Max(1,w/64)){var c=b.GetPixel(xx,yy);double v=(c.R+c.G+c.B)/3.0;sum+=v;sq+=v*v;n++;}
  double mean=n>0?sum/n:0,sd=n>0?Math.Sqrt(Math.Max(0,sq/n-mean*mean)):0;return mean<10&&sd<6;}

 static bool StopUnassigned(IntPtr process){try{TerminateProcess(process,1);return WaitForSingleObject(process,4000)==0;}catch{return false;}}
 internal static int Run(string[] a,string desktop=DESK,string childArgument=null,Func<IntPtr,int,bool> observe=null,SuspendedLaunch restricted=null,bool readerOnly=false){string exe=Path.GetFullPath(a[1]);int seconds=600,parentPid=0;for(int i=2;i<a.Length-1;i++){if(a[i]=="--seconds")seconds=Math.Max(10,int.Parse(a[i+1]));if(a[i]=="--parent-pid")parentPid=int.Parse(a[i+1]);}
  /* 2026-11-26 tools/adapt-auto.cjs (unattended pipeline, owner away): --ignore-input keeps the run going when GetLastInputInfo moves
     (a phantom input source reset it every ~100 ms and every run ended at 0.4 s). Without the switch the user's input still ends the run at once */
  bool ignoreInput=Array.IndexOf(a,"--ignore-input")>=2;
  /* --locale-emulator <LEProc.exe> --le-guid <profile>: the game started through Locale Emulator (x86 games on a non-Japanese system
     quit at once without it: オルフレール shows a Shift-JIS "Information" box). The game is LEProc's child, so it is in the job too;
     the window event carries the owning pid (the hook attaches to the game, not to LEProc) */
  string le=null,leGuid=null;for(int i=2;i<a.Length-1;i++){if(a[i]=="--locale-emulator")le=Path.GetFullPath(a[i+1]);if(a[i]=="--le-guid")leGuid=a[i+1];}
  if(le!=null&&(leGuid==null||!File.Exists(le)))le=null;
  requireObservedAudio=restricted!=null;
  using(var owner=Process.GetCurrentProcess())Emit("{\"type\":\"owner\",\"pid\":"+owner.Id+",\"started\":"+Q(owner.StartTime.ToUniversalTime().Ticks.ToString())+"}");
  ImageName=Path.GetFileNameWithoutExtension(exe);
  Desk=OpenDesktop(desktop,0,false,0x10000000);if(Desk==IntPtr.Zero)Desk=CreateDesktop(desktop,IntPtr.Zero,IntPtr.Zero,0,0x10000000,IntPtr.Zero);if(Desk==IntPtr.Zero){Emit("{\"type\":\"ended\",\"why\":\"desktop\"}");return 1;}
  PROCESS_INFORMATION pi=new PROCESS_INFORMATION();string why="";
  try{
  Job=CreateJobObject(IntPtr.Zero,null);var lim=new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();lim.Basic.LimitFlags=0x2000;/* KILL_ON_JOB_CLOSE */if(Job==IntPtr.Zero||!SetInformationJobObject(Job,9,ref lim,(uint)Marshal.SizeOf(lim)))throw new Exception("Job setup failed");
  var si=new STARTUPINFO();si.cb=Marshal.SizeOf(si);si.lpDesktop="WinSta0\\"+desktop;
  const uint CREATE_SUSPENDED=4,CREATE_NO_WINDOW=0x08000000;
  if(restricted!=null)restricted(exe,si.lpDesktop,out pi.hProcess,out pi.hThread,out pi.dwProcessId);
  else if(!CreateProcess(le??exe,new StringBuilder(le!=null?"\""+le+"\" -runas "+leGuid+" \""+exe+"\"":"\""+exe+"\""+(childArgument==null?"":" "+childArgument)),IntPtr.Zero,IntPtr.Zero,false,CREATE_SUSPENDED|CREATE_NO_WINDOW,IntPtr.Zero,Path.GetDirectoryName(exe),ref si,out pi)){Emit("{\"type\":\"ended\",\"why\":\"create "+Marshal.GetLastWin32Error()+"\"}");return 1;}
  if(!AssignProcessToJobObject(Job,pi.hProcess)){/* This suspended child is outside the job: only its original handle identifies it safely. */if(!StopUnassigned(pi.hProcess))CleanupSafe=false;Emit("{\"type\":\"ended\",\"why\":\"job\"}");return 1;}
  WatchParent(parentPid);ResumeThread(pi.hThread);CloseHandle(pi.hThread);pi.hThread=IntPtr.Zero;StartedAt=DateTime.UtcNow;
  string started="";try{started=Process.GetProcessById(pi.dwProcessId).StartTime.ToUniversalTime().Ticks.ToString();}catch{}
  Emit("{\"type\":\"started\",\"pid\":"+pi.dwProcessId+",\"started\":"+Q(started)+"}");
  var cmds=new Queue<string>();var reader=new Thread(()=>{string l;try{while((l=Console.In.ReadLine())!=null){if(l.Trim()=="kill" || (observe!=null && l.Trim()=="{\"type\":\"stop\"}")){RequestStop();return;}if(observe==null || (restricted!=null && (l.StartsWith("key ") || l.StartsWith("click "))))lock(cmds)cmds.Enqueue(l);}}catch{}RequestStop();});reader.IsBackground=true;reader.Start();
  uint baseInput=0;{var li=new LASTINPUTINFO();li.cbSize=(uint)Marshal.SizeOf(li);GetLastInputInfo(ref li);baseInput=li.dwTime;}
  int lastW=0,lastH=0;IntPtr lastHwnd=IntPtr.Zero;DateTime lastMute=DateTime.MinValue,lastPower=DateTime.MinValue;bool everAlive=false;DateTime goneAt=DateTime.MinValue;bool wasFull=Quns()>=2&&Quns()<=4;
  var end=DateTime.UtcNow.AddSeconds(seconds);
  while(why==""){
   if(Stopping){why="stopped";break;}
   /* the user is back: end now, before anything else */
   {var li=new LASTINPUTINFO();li.cbSize=(uint)Marshal.SizeOf(li);if(observe==null && !ignoreInput && GetLastInputInfo(ref li)&&li.dwTime!=baseInput){Emit("{\"type\":\"input\"}");why="input";break;}}
   string c=null;lock(cmds)if(cmds.Count>0)c=cmds.Dequeue();
   if(c!=null && restricted!=null && RootWindow(pi.dwProcessId)==IntPtr.Zero)throw new IOException("GAME_INPUT_WINDOW_CHANGED");
   if(c!=null){var p=c.Trim().Split(new[]{' '},3);try{switch(p[0]){
     case "key":Key(Convert.ToUInt32(p[1]),true,true);break;
     case "keydown":Key(Convert.ToUInt32(p[1]),true,false);break;
     case "keyup":Key(Convert.ToUInt32(p[1]),false,true);break;
     case "click":Click(int.Parse(p[1]),int.Parse(p[2]));break;
     case "move":Move(int.Parse(p[1]),int.Parse(p[2]));break;
     case "activate":Activate();break;
     case "shot":Shot(int.Parse(p[1]),p[2]);break;
     case "dialog":AnswerDialog(p.Length>1?Uri.UnescapeDataString(p[1].Trim()):"");break;
     case "kill":why="killed";break;}}catch(Exception e){Emit("{\"type\":\"error\",\"what\":"+Q(c)+",\"why\":"+Q(e.Message)+"}");}
    if(why!="")break;continue;}
   if(observe!=null && observe(Job,pi.dwProcessId)){why="sampled";break;}
   var pids=JobPids();
   if(pids.Count>0){everAlive=true;goneAt=DateTime.MinValue;}
   else if(everAlive){if(goneAt==DateTime.MinValue){goneAt=DateTime.UtcNow;}
    /* A matching process outside our job may belong to the player. Report it; never move or kill it. */
    foreach(var pr in Process.GetProcessesByName(ImageName)){try{if(pr.StartTime.ToUniversalTime()>StartedAt&&!pids.Contains((uint)pr.Id)&&String.Equals(Path.GetFullPath(pr.MainModule.FileName),exe,StringComparison.OrdinalIgnoreCase)){Emit("{\"type\":\"relaunched\",\"pid\":"+pr.Id+"}");why="relaunched";CleanupSafe=false;}}catch{}finally{pr.Dispose();}}
    if(why!="")break;
    if((DateTime.UtcNow-goneAt).TotalSeconds>12){uint code=0;GetExitCodeProcess(pi.hProcess,out code);Emit("{\"type\":\"exited\",\"code\":"+code+"}");why="exited";break;}}
   var w=Biggest();if(w!=IntPtr.Zero){RECT r;GetClientRect(w,out r);int cw=r.R-r.L,ch=r.B-r.T;if(w!=lastHwnd||cw!=lastW||ch!=lastH){lastHwnd=w;lastW=cw;lastH=ch;GameWin=w;Raise(w);if(restricted!=null)ReadGameDialog(w);var t=new StringBuilder(256);GetWindowText(w,t,256);Activate();uint wpid;GetWindowThreadProcessId(w,out wpid);string wstarted="";try{using(var wp=Process.GetProcessById((int)wpid))wstarted=wp.StartTime.ToUniversalTime().Ticks.ToString();}catch{}
     Emit("{\"type\":\"window\",\"hwnd\":"+Q(w.ToInt64().ToString())+",\"pid\":"+wpid+",\"started\":"+Q(wstarted)+",\"w\":"+cw+",\"h\":"+ch+",\"title\":"+Q(t.ToString())+"}");}}
   if(!readerOnly && (DateTime.UtcNow-lastMute).TotalMilliseconds>700){lastMute=DateTime.UtcNow;Mute();}
   if((DateTime.UtcNow-lastPower).TotalSeconds>5){lastPower=DateTime.UtcNow;if(Ac()=="false")Emit("{\"type\":\"power\",\"ac\":false}");int q=Quns();bool full=q>=2&&q<=4;if(full&&!wasFull)Emit("{\"type\":\"fullscreen\",\"on\":true}");wasFull=full;}
   if(DateTime.UtcNow>end){Emit("{\"type\":\"timeout\"}");why="timeout";break;}
   Thread.Sleep(100);}
  }catch(Exception){if(!Stopping)throw;why="stopped";}finally{
  Cleanup();if(pi.hThread!=IntPtr.Zero)CloseHandle(pi.hThread);if(pi.hProcess!=IntPtr.Zero)CloseHandle(pi.hProcess);
  /* the desktop goes away with its last handle once the game's windows are gone */
  Thread.Sleep(300);CloseDesktop(Desk);}
  Emit("{\"type\":\"ended\",\"why\":"+Q(why)+"}");return CleanupSafe?0:1;}
}
