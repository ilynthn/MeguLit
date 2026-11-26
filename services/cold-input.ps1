# SPDX-License-Identifier: GPL-3.0-or-later
# 2026-11-26 the cold test's input fallback (services/cold-test-run.cjs, tools/adapt-auto.cjs only): one line in, one JSON line out.
#   init <pid> <hwnd> <bits> <inputctl dir>   InputCtl<bits>.exe inject <pid> (the testbed's InputShim: fake foreground, cursor,
#                                             GetAsyncKeyState and DirectInput inside the game), then its shared state is opened here
#   shim click|move <x> <y> | shim key|down|up <vk hex>   what InputCtl.exe does, with the hwnd ColdDesk found (InputCtl looks the
#                                             window up with EnumWindows, which never sees the hidden desktop)
#   fg click|move <x> <y> | fg key|down|up <vk hex>       real input (SendInput) to the game made the foreground window; only for a
#                                             visible run (adapt-auto --foreground, owner away): it moves the real cursor
#   quit
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;using System.Threading;using System.IO.MemoryMappedFiles;
public static class ColdInput{
 [DllImport("user32.dll")]static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("user32.dll")]static extern bool ClientToScreen(IntPtr h,ref PT p);
 [DllImport("user32.dll")]static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr h,int c);
 [DllImport("user32.dll")]static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")]static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,IntPtr p);
 [DllImport("user32.dll")]static extern bool AttachThreadInput(uint a,uint b,bool on);
 [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")]static extern uint MapVirtualKey(uint c,uint t);
 [DllImport("user32.dll")]static extern void keybd_event(byte vk,byte sc,uint f,UIntPtr e);
 [DllImport("user32.dll",SetLastError=true)]static extern uint SendInput(uint n,INPUT[] i,int size);
 [StructLayout(LayoutKind.Sequential)]public struct PT{public int X,Y;}
 [StructLayout(LayoutKind.Sequential)]struct MI{public int dx,dy;public uint data,flags,time;public IntPtr extra;}
 [StructLayout(LayoutKind.Sequential)]struct KI{public ushort vk,scan;public uint flags,time;public IntPtr extra;}
 [StructLayout(LayoutKind.Explicit)]struct U{[FieldOffset(0)]public MI mi;[FieldOffset(0)]public KI ki;}
 [StructLayout(LayoutKind.Sequential)]struct INPUT{public uint type;public U u;}
 /* InputShim's shared state (megu-testbed\inputshim\InputShim.c): on, hwnd, x, y, buttons, keys[256], clicks, served */
 const int ON=0,HWND=4,X=8,Y=12,KEYS=20,CLICKS=276,SIZE=284;
 static MemoryMappedViewAccessor S;static IntPtr W;static Timer pump;
 static IntPtr Lp(int x,int y){return (IntPtr)((y<<16)|(x&0xffff));}
 static void Act(){PostMessage(W,0x1C,(IntPtr)1,IntPtr.Zero);PostMessage(W,0x06,(IntPtr)1,IntPtr.Zero);PostMessage(W,0x07,IntPtr.Zero,IntPtr.Zero);}
 public static string Open(int pid,long hwnd){W=(IntPtr)hwnd;Exception last=null;
  for(int i=0;i<50;i++){try{var m=MemoryMappedFile.OpenExisting("Local\\MeguInputShim_"+pid);S=m.CreateViewAccessor(0,SIZE);break;}catch(Exception e){last=e;Thread.Sleep(100);}}
  if(S==null)return "no shim state: "+(last==null?"?":last.Message);
  S.Write(HWND,(int)hwnd);S.Write(ON,1);Act();
  /* games that pause when they lose focus: activation every 200 ms, as InputCtl pump does */
  pump=new Timer(_=>{if(IsWindow(W))Act();},null,200,200);return "";}
 public static void Shim(string cmd,int a,int b){S.Write(ON,1);
  if(cmd=="move"||cmd=="click"){S.Write(X,a);S.Write(Y,b);PostMessage(W,0x200,IntPtr.Zero,Lp(a,b));Thread.Sleep(200);
   if(cmd=="click"){Act();S.Write(CLICKS,S.ReadInt32(CLICKS)+1);PostMessage(W,0x201,(IntPtr)1,Lp(a,b));Thread.Sleep(200);PostMessage(W,0x202,IntPtr.Zero,Lp(a,b));Thread.Sleep(100);}return;}
  int vk=a&255;
  if(cmd!="up"){S.Write(KEYS+vk,(byte)0x80);PostMessage(W,0x100,(IntPtr)vk,(IntPtr)1);}
  if(cmd=="key")Thread.Sleep(200);
  if(cmd!="down"){S.Write(KEYS+vk,(byte)0);PostMessage(W,0x101,(IntPtr)vk,unchecked((IntPtr)(int)0xC0000001));}}
 /* the game window to the front: Alt tap + AttachThreadInput (the foreground lock refuses a plain SetForegroundWindow) */
 static bool Front(){if(GetForegroundWindow()==W)return true;if(IsIconic(W))ShowWindow(W,9);
  uint me=GetCurrentThreadId(),fg=GetWindowThreadProcessId(GetForegroundWindow(),IntPtr.Zero);keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(0x12,0,2,UIntPtr.Zero);
  if(fg!=0&&fg!=me)AttachThreadInput(me,fg,true);BringWindowToTop(W);SetForegroundWindow(W);if(fg!=0&&fg!=me)AttachThreadInput(me,fg,false);Thread.Sleep(80);return GetForegroundWindow()==W;}
 static void Mouse(uint flags){var i=new INPUT[1];i[0].type=0;i[0].u.mi.flags=flags;SendInput(1,i,Marshal.SizeOf(typeof(INPUT)));}
 static void Key(int vk,bool up){var i=new INPUT[1];i[0].type=1;i[0].u.ki.scan=(ushort)MapVirtualKey((uint)vk,0);
  uint f=0x8;if((vk>=0x21&&vk<=0x28)||vk==0x2D||vk==0x2E)f|=1;if(up)f|=2;i[0].u.ki.flags=f;SendInput(1,i,Marshal.SizeOf(typeof(INPUT)));}
 public static string Fg(long hwnd,string cmd,int a,int b){W=(IntPtr)hwnd;bool front=Front();
  if(cmd=="move"||cmd=="click"){var p=new PT();p.X=a;p.Y=b;ClientToScreen(W,ref p);SetCursorPos(p.X,p.Y);Thread.Sleep(120);
   if(cmd=="click"){Mouse(2);Thread.Sleep(90);Mouse(4);Thread.Sleep(60);}}
  else{int vk=a&255;if(cmd!="up")Key(vk,false);if(cmd=="key")Thread.Sleep(90);if(cmd!="down")Key(vk,true);}
  return front?"":"not foreground";}
}
'@
$hwnd=[long]0
function Out-Line($o){[Console]::Out.WriteLine(($o|ConvertTo-Json -Compress));[Console]::Out.Flush()}
while($null -ne ($l=[Console]::In.ReadLine())){$p=$l.Trim() -split '\s+';if(-not $p[0]){continue}
 try{switch($p[0]){
  'init'{$pid0=[int]$p[1];$hwnd=[long]$p[2];$exe=Join-Path $p[4] ('InputCtl'+$p[3]+'.exe')
   if(-not (Test-Path -LiteralPath $exe)){Out-Line @{type='init';ok=$false;why="no $exe"};continue}
   $r=Start-Process -FilePath $exe -ArgumentList 'inject',$pid0 -NoNewWindow -Wait -PassThru
   if($r.ExitCode -ne 0){Out-Line @{type='init';ok=$false;why=('inject exit '+$r.ExitCode)};continue}
   $why=[ColdInput]::Open($pid0,$hwnd);Out-Line @{type='init';ok=($why -eq '');why=$why}}
  'shim'{$a=if($p[1] -in 'click','move'){[int]$p[2]}else{[Convert]::ToInt32($p[2],16)};$b=if($p.Count -gt 3){[int]$p[3]}else{0}
   [ColdInput]::Shim($p[1],$a,$b);Out-Line @{type='done';cmd=$l;ok=$true}}
  'fg'{$a=if($p[1] -in 'click','move'){[int]$p[2]}else{[Convert]::ToInt32($p[2],16)};$b=if($p.Count -gt 3){[int]$p[3]}else{0}
   $why=[ColdInput]::Fg($hwnd,$p[1],$a,$b);Out-Line @{type='done';cmd=$l;ok=($why -eq '');why=$why}}
  'hwnd'{$hwnd=[long]$p[1]}
  'quit'{exit 0}}}
 catch{Out-Line @{type='error';cmd=$l;why=$_.Exception.Message}}}
