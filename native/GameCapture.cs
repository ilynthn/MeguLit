// SPDX-License-Identifier: GPL-3.0-or-later
// Reads a game window's client area for text, marker and dialogue detection.
// PrintWindow with PW_RENDERFULLCONTENT makes some DirectX games (Steins;Gate) render an extra frame, which shows as
// white flashes while it runs several times a second. BitBlt from the window's DC only reads what DWM already
// composed (without MeguLit's own overlay windows), so it is used; PrintWindow is only for a window BitBlt is proven
// blind to, and rate limited (see Choice). Nothing is read while the window is dragged or minimised (see Into).
// C# 5 only (the .NET Framework csc that ships with Windows).
using System;using System.Collections.Generic;using System.Drawing;using System.Drawing.Imaging;using System.Runtime.InteropServices;
public static class GameCapture{
 [DllImport("user32.dll")]static extern bool PrintWindow(IntPtr hwnd,IntPtr dc,uint flags);
 [DllImport("user32.dll")]static extern IntPtr GetDC(IntPtr hwnd);
 [DllImport("user32.dll")]static extern int ReleaseDC(IntPtr hwnd,IntPtr dc);
 [DllImport("gdi32.dll")]static extern bool BitBlt(IntPtr dest,int x,int y,int w,int h,IntPtr src,int sx,int sy,int rop);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")]static extern bool GetGUIThreadInfo(uint thread,ref GuiInfo info);
 [DllImport("user32.dll")]static extern bool IsIconic(IntPtr hwnd);
 [DllImport("user32.dll")]static extern bool ClientToScreen(IntPtr hwnd,ref Pt p);
 [StructLayout(LayoutKind.Sequential)]struct Pt{public int X,Y;}
 [StructLayout(LayoutKind.Sequential)]struct GuiInfo{public int Size,Flags;public IntPtr Active,Focus,Capture,MenuOwner,MoveSize,Caret;public int L,T,R,B;}
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
 // Proven: BitBlt has shown this window's picture. Blind: BitBlt keeps giving a blank picture while the screen shows
 // the game, so only PrintWindow can read it. Votes: screen checks in a row that said "blind".
 sealed class Choice{public bool Proven,Blind;public int Votes;public DateTime Printed;}
 static readonly Dictionary<IntPtr,Choice> Choices=new Dictionary<IntPtr,Choice>();static readonly object Gate=new object();
 // PrintWindow with PW_RENDERFULLCONTENT makes a DirectX game present an extra frame, seen as a whole black or white
 // flash. Games open on plain black/white screens (warnings, logos, fades), which BitBlt reads as "blank", and that used
 // to switch the window to PrintWindow for 30 seconds: every probe then flashed the screen several times a second for
 // the first 15-30 s (Steins;Gate and others; a photosensitive-seizure risk). Now a blank frame is only skipped; a
 // window counts as blind only when the screen itself shows a different, non-blank picture three times in a row while
 // it is in front, and even then it is printed at most once every PrintGapMs (far under 3 flashes a second).
 const int PrintGapMs=2000;
 // True when the last Into() on this thread did not read the window only for the moment (dragged, minimised, one
 // blank frame): callers keep what they have and try again, without reporting an error.
 [ThreadStatic]public static bool Skipped;
 // True when the last Into() on this thread filled the picture from the screen (style measurement only): such a picture
 // holds whatever lies over the game, MeguLit's own reader, lookup card and furigana included.
 [ThreadStatic]public static bool FromScreen;
 // Saved pictures (Anki card, collected sentence, scene shots, card wall). 2026-11-14 (user: an Anki picture held MeguLit's
 // lookup card and furigana): only the game window's own surface is used, read through its window DC or PrintWindow, which
 // DWM keeps apart from every other window, so MeguLit's overlays never reach it whatever the engine draws with. The
 // screen is never read here, and a picture that came from it anyway is dropped rather than saved.
 public static bool Picture(IntPtr hwnd,Bitmap image){if(!Into(hwnd,image,2,false))return false;if(FromScreen){FromScreen=false;return false;}return true;}
 // The window is being moved or resized (its thread runs the system move/size loop) or is minimised.
 public static bool Busy(IntPtr hwnd){
  if(hwnd==IntPtr.Zero||IsIconic(hwnd))return true;uint pid,thread=GetWindowThreadProcessId(hwnd,out pid);if(thread==0)return false;
  var info=new GuiInfo();info.Size=Marshal.SizeOf(typeof(GuiInfo));return GetGUIThreadInfo(thread,ref info)&&(info.Flags&0x2)!=0;
 }
 // Fills image (client size) with the window's picture; false when it could not be read this time.
 // Nothing is read during a move (a DirectX game stops presenting then).
 public static bool Into(IntPtr hwnd,Bitmap image,uint printFlags){return Into(hwnd,image,printFlags,false);}
 // screenFallback: some DirectX/Unity windows give a blank picture to both BitBlt and PrintWindow (style sync then saw
 // "ocrLines=0"). Only callers that hide MeguLit's own text first (style measurement) may read the screen instead: it
 // includes overlays, so marker and mask detection never use it.
 public static bool Into(IntPtr hwnd,Bitmap image,uint printFlags,bool screenFallback){
  Skipped=false;FromScreen=false;if(Busy(hwnd)){Skipped=true;return false;}
  Choice c;lock(Gate){if(!Choices.TryGetValue(hwnd,out c)){if(Choices.Count>16)Choices.Clear();c=new Choice();Choices[hwnd]=c;}}
  if(Blt(hwnd,image)&&!Blank(image)){lock(Gate){c.Proven=true;c.Blind=false;c.Votes=0;}return true;}
  if(!c.Proven&&!c.Blind){int vote=BlindVote(hwnd,image);lock(Gate){if(vote>0){if(++c.Votes>=3)c.Blind=true;}else if(vote<0)c.Votes=0;}}
  bool print=false;if(c.Blind)lock(Gate){if((DateTime.UtcNow-c.Printed).TotalMilliseconds>=PrintGapMs){c.Printed=DateTime.UtcNow;print=true;}}
  if(!print){if(screenFallback&&!c.Proven&&ScreenInto(hwnd,image)){FromScreen=true;return true;}Skipped=true;return false;}
  bool printed;using(var g=Graphics.FromImage(image)){IntPtr dc=g.GetHdc();try{printed=PrintWindow(hwnd,dc,printFlags);}finally{g.ReleaseHdc(dc);}}
  if(printed&&!Blank(image))return true;if(!screenFallback)return printed;
  FromScreen=true;return ScreenInto(hwnd,image);
 }
 // +1: the window is in front and the screen over its client area shows a non-blank picture that differs from the
 // blank one BitBlt gave on most sampled points (BitBlt cannot see it). -1: the screen is blank or matches (the game
 // really shows a plain screen). 0: cannot tell (not in front, screen unreadable). Reading the screen never makes the
 // game repaint. MeguLit's own subtitles cover a small part only, so they do not reach "most points".
 static int BlindVote(IntPtr hwnd,Bitmap blank){
  IntPtr front=GetForegroundWindow();if(front==IntPtr.Zero||GetAncestor(front,2)!=GetAncestor(hwnd,2))return 0;
  try{using(var screen=new Bitmap(blank.Width,blank.Height,PixelFormat.Format32bppArgb)){
   if(!ScreenInto(hwnd,screen))return -1;int w=blank.Width,h=blank.Height,n=0,diff=0;
   var a=blank.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
   try{var b=screen.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
    try{var ra=new byte[w*4];var rb=new byte[w*4];for(int y=h/16;y<h;y+=Math.Max(1,h/16)){Marshal.Copy(IntPtr.Add(a.Scan0,y*a.Stride),ra,0,w*4);Marshal.Copy(IntPtr.Add(b.Scan0,y*b.Stride),rb,0,w*4);
      for(int x=w/16;x<w;x+=Math.Max(1,w/16)){int i=x*4;n++;if(Math.Abs(ra[i]-rb[i])+Math.Abs(ra[i+1]-rb[i+1])+Math.Abs(ra[i+2]-rb[i+2])>72)diff++;}}}
    finally{screen.UnlockBits(b);}}finally{blank.UnlockBits(a);}
   return n>0&&diff*10>=n*6?1:-1;}}catch{return 0;}
 }
 // Calibration only: after the renderer acknowledges its reader/menu are hidden, prefer what the user actually sees.
 public static bool ScreenInto(IntPtr hwnd,Bitmap image){
  if(Busy(hwnd))return false;
  var origin=new Pt();if(!ClientToScreen(hwnd,ref origin))return false;IntPtr screen=GetDC(IntPtr.Zero);if(screen==IntPtr.Zero)return false;
  try{using(var g=Graphics.FromImage(image)){IntPtr dc=g.GetHdc();try{if(!BitBlt(dc,0,0,image.Width,image.Height,screen,origin.X,origin.Y,0x00CC0020))return false;}finally{g.ReleaseHdc(dc);}}}finally{ReleaseDC(IntPtr.Zero,screen);}
  return !Blank(image);
 }
 static bool Blt(IntPtr hwnd,Bitmap image){
  using(var g=Graphics.FromImage(image)){IntPtr dest=g.GetHdc(),src=GetDC(hwnd);if(src==IntPtr.Zero){g.ReleaseHdc(dest);return false;}
   try{return BitBlt(dest,0,0,image.Width,image.Height,src,0,0,0x00CC0020);}finally{ReleaseDC(hwnd,src);g.ReleaseHdc(dest);}}
 }
 // A picture with almost no variation (all black or one colour) means BitBlt cannot see this window's content.
 static bool Blank(Bitmap image){
  int w=image.Width,h=image.Height;if(w<4||h<4)return true;int lo=255,hi=0;
  var d=image.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
  try{var row=new byte[w*4];for(int y=h/16;y<h;y+=Math.Max(1,h/16)){Marshal.Copy(IntPtr.Add(d.Scan0,y*d.Stride),row,0,w*4);for(int x=w/16;x<w;x+=Math.Max(1,w/16)){int i=x*4,l=(row[i]+row[i+1]+row[i+2])/3;if(l<lo)lo=l;if(l>hi)hi=l;}}}
  finally{image.UnlockBits(d);}
  return hi-lo<6;
 }
}
