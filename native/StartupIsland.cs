// SPDX-License-Identifier: GPL-3.0-or-later
// Per-pixel alpha startup surface. Draws at 2x resolution before compositing.
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;

sealed class StartupIsland : Form {
 [StructLayout(LayoutKind.Sequential)] struct Point { public int X,Y; public Point(int x,int y){X=x;Y=y;} }
 [StructLayout(LayoutKind.Sequential)] struct LayerSize { public int W,H; public LayerSize(int w,int h){W=w;H=h;} }
 [StructLayout(LayoutKind.Sequential,Pack=1)] struct Blend { public byte Op,Flags,Alpha,Format; }
 [StructLayout(LayoutKind.Sequential)] struct Rect { public int L,T,R,B; }
 delegate bool Visitor(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr h,IntPtr dc,ref Point pos,ref LayerSize size,IntPtr src,ref Point origin,uint key,ref Blend blend,uint flags);
 [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
 [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h,IntPtr dc);
 [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
 [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc,IntPtr value);
 [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr value);
 [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
 [DllImport("user32.dll")] static extern bool EnumWindows(Visitor visitor,IntPtr l);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,System.Text.StringBuilder text,int count);
 public static bool MainSurface(string title,int width,int height){return width>250&&height>150&&(title=="MeguLit"||title=="MeguLit.V3"||title=="Tomoyo");}
 static bool MainSurface(IntPtr h){Rect r;var title=new System.Text.StringBuilder(128);GetWindowText(h,title,title.Capacity);return GetWindowRect(h,out r)&&MainSurface(title.ToString(),r.R-r.L,r.B-r.T);}
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect rect);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 readonly string Flag; readonly Color Accent; readonly Stopwatch Clock=Stopwatch.StartNew();
 readonly List<IntPtr> Hidden=new List<IntPtr>(); readonly Timer Animation=new Timer();
 readonly float DpiScale;
 readonly Bitmap Face;
 [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr h,int attribute,ref int value,int size);
 void Cloak(IntPtr h,bool hidden){int value=hidden?1:0;DwmSetWindowAttribute(h,13,ref value,4);}
 static Bitmap LoadFace(){
  var face=new Bitmap(96,96,PixelFormat.Format32bppPArgb);
  using(var stream=typeof(StartupIsland).Assembly.GetManifestResourceStream("MeguLit.MeguminFace"))
  using(var original=new Bitmap(stream))using(var g=Graphics.FromImage(face)){
   g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.HighQuality;
   // Exact source pixels, tightly framing the face, hair and eyepatch.
   g.DrawImage(original,new Rectangle(0,0,96,96),new Rectangle(335,445,505,505),GraphicsUnit.Pixel);
  }return face;
 }

 double Progress,ProgressTarget;long PreviousFrame;string LastFrame="";
 string Engine;IntPtr EventHook;WinEvent EventCallback;
[DllImport("user32.dll")]static extern IntPtr GetAncestor(IntPtr h,uint flag);
 delegate void WinEvent(IntPtr hook,uint ev,IntPtr h,int objectId,int childId,uint thread,uint time);
 [DllImport("user32.dll")]static extern IntPtr SetWinEventHook(uint min,uint max,IntPtr module,WinEvent callback,uint pid,uint thread,uint flags);
 [DllImport("user32.dll")]static extern bool UnhookWinEvent(IntPtr hook);
 void WatchWindows(){
  EventCallback=delegate(IntPtr hook,uint ev,IntPtr h,int obj,int child,uint thread,uint time){
   if(h==IntPtr.Zero||obj!=0||child!=0||GetAncestor(h,2)!=h||RevealStarted||Restored)return;
   uint pid;GetWindowThreadProcessId(h,out pid);if(Target==0||pid!=Target)return;
   // IME candidates, TSF helpers and event-loop windows share the process. Never change their alpha or styles.
   if(MainSurface(h)){Alpha(h,0);Cloak(h,true);if(!Hidden.Contains(h))Hidden.Add(h);}
  };
  EventHook=SetWinEventHook(0x8000,0x8002,IntPtr.Zero,EventCallback,0,0,0);
 }
 void LaunchEngine(){
  if(String.IsNullOrEmpty(Engine))return;
  WatchWindows();
  try{var process=Process.Start(new ProcessStartInfo(Engine){WorkingDirectory=Path.GetDirectoryName(Engine),UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden});Target=(uint)process.Id;File.WriteAllText(Flag+".pid",Target.ToString());process.Dispose();}
  catch(Exception e){File.WriteAllText(Flag+".engine-error",e.Message);throw;}
 }

 long ReadyAt=-1; uint Target; int Frames; bool Restored; bool RevealStarted;
 readonly Dictionary<IntPtr,int> SavedStyles=new Dictionary<IntPtr,int>();
 [DllImport("user32.dll")]static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll")]static extern int SetWindowLong(IntPtr h,int index,int value);
 [DllImport("user32.dll")]static extern bool SetLayeredWindowAttributes(IntPtr h,uint key,byte alpha,uint flags);
 void Alpha(IntPtr h,byte alpha){
  if(!SavedStyles.ContainsKey(h)){int style=GetWindowLong(h,-20);SavedStyles[h]=style;if((style&0x80000)==0)SetWindowLong(h,-20,style|0x80000);}
  SetLayeredWindowAttributes(h,0,alpha,2);
 }
 bool MainSuppressed(){try{return File.ReadAllText(Flag+".suppressed").Trim()=="1";}catch{return false;}}
 void StartReveal(){
  if(RevealStarted)return;RevealStarted=true;
  // E391 tells the host the main window is now fading in, so the page starts its entrance while it can be seen
  try{File.WriteAllText(Flag+".revealed","1");}catch{}
  if(EventHook!=IntPtr.Zero){UnhookWinEvent(EventHook);EventHook=IntPtr.Zero;}
  foreach(var h in Hidden)if(IsWindow(h)){Alpha(h,0);ShowWindow(h,MainSuppressed()?0:5);Cloak(h,false);}
  if(!MainSuppressed()&&Hidden.Count>0){var h=Hidden[0];SetWindowPos(h,new IntPtr(-1),0,0,0,0,0x43);SetWindowPos(h,new IntPtr(-2),0,0,0,0,0x43);SetForegroundWindow(h);}
 }
 void FadeMain(long elapsed){
  double k=Ease(elapsed/420.0);foreach(var h in Hidden)if(IsWindow(h))Alpha(h,(byte)Math.Round(255*k));
  if(elapsed>=420)Restore();
 }

 protected override void OnLoad(EventArgs e){base.OnLoad(e);using(var bitmap=Render(44,44,0,0,0))Present(bitmap);}
 protected override bool ShowWithoutActivation {get{return true;}}
 protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x80000|0x80|0x08000000|0x20;return p;}}
 StartupIsland(string flag,string lang,Color accent){
  Flag=flag;Accent=accent;Face=LoadFace();
  using(var g=Graphics.FromHwnd(IntPtr.Zero))DpiScale=g.DpiX/96f;
  FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;Text="MeguLit";StartPosition=FormStartPosition.Manual;
  ClientSize=new System.Drawing.Size((int)(270*DpiScale),(int)(92*DpiScale));
  var area=Screen.PrimaryScreen.WorkingArea;Location=new System.Drawing.Point(area.X+(area.Width-Width)/2,area.Y+(area.Height-Height)/2);
  Animation.Interval=20;Animation.Tick+=delegate{try{TickFrame();}catch(Exception e){Log(e);Close();}};
  Shown+=delegate{Clock.Restart();Animation.Start();};
  FormClosed+=delegate{Animation.Stop();if(EventHook!=IntPtr.Zero)UnhookWinEvent(EventHook);Restore();Face.Dispose();Animation.Dispose();};
 }
 void Log(Exception e){try{File.AppendAllText(Flag+".log",e.ToString()+Environment.NewLine);}catch{}}
 static double Ease(double t){t=Math.Max(0,Math.Min(1,t));return 1-Math.Pow(1-t,3);}
 void HideMain(){
  if(Target==0)try{uint.TryParse(File.ReadAllText(Flag+".pid").Trim(),out Target);}catch{}
  if(Target==0||Restored)return;
  EnumWindows(delegate(IntPtr h,IntPtr l){uint pid;GetWindowThreadProcessId(h,out pid);
   // Tool windows must never become the foreground window during restoration.
   if(pid==Target&&MainSurface(h)){if(!Hidden.Contains(h))Hidden.Add(h);Cloak(h,true);Alpha(h,0);}return true;
  },IntPtr.Zero);
 }
 void Restore(){
  if(Restored)return;Restored=true;
  foreach(var h in Hidden)if(IsWindow(h)){Alpha(h,255);ShowWindow(h,MainSuppressed()?0:5);Cloak(h,false);}
  // The fade's temporary layered style must not remain on the WebView2 window: popup compositing can otherwise show dark tiles.
  foreach(var pair in SavedStyles)if(IsWindow(pair.Key)&&(pair.Value&0x80000)==0){int current=GetWindowLong(pair.Key,-20);SetWindowLong(pair.Key,-20,current&~0x80000);SetWindowPos(pair.Key,IntPtr.Zero,0,0,0,0,0x37);}
  if(!MainSuppressed()&&Hidden.Count>0){IntPtr h=Hidden[0];SetWindowPos(h,new IntPtr(-1),0,0,0,0,0x43);SetWindowPos(h,new IntPtr(-2),0,0,0,0,0x43);SetForegroundWindow(h);}
  Hidden.Clear();SavedStyles.Clear();
 }
 void TickFrame(){
  long ms=Clock.ElapsedMilliseconds;double dt=Math.Max(1,ms-PreviousFrame);PreviousFrame=ms;
  if(File.Exists(Flag+".failed")){Close();return;}
  if(ReadyAt<0){
   HideMain();int value;try{if(Int32.TryParse(File.ReadAllText(Flag+".progress"),out value))ProgressTarget=Math.Max(ProgressTarget,Math.Min(.97,Math.Max(0,value/100.0)));}catch{}
   if(File.Exists(Flag))ProgressTarget=1;
   Progress+=(ProgressTarget-Progress)*(1-Math.Exp(-dt/130.0));
   if(ProgressTarget==1&&Progress>.996&&ms>=850){Progress=1;ReadyAt=ms;}
  }
  long elapsed=ReadyAt<0?0:ms-ReadyAt;
  // Complete the bar, morph into a circle, then reveal the main window with the check mark.
  double close=ReadyAt<0?0:Ease((elapsed-90)/300.0);
  if(ReadyAt>=0&&elapsed>=390&&!RevealStarted)StartReveal();
  if(RevealStarted&&!Restored)FadeMain(elapsed-390);
  if(ms>45000){Close();return;}
  double open=Ease(Math.Max(0,ms-90)/600.0);
  float width=(float)(44+174*open*(1-close)),height=(float)(44-36*open*(1-close));
  float opacity=(float)(Ease(ms/220.0)*(ReadyAt<0?1:1-Ease((elapsed-920)/220.0)));
  float check=(float)(ReadyAt<0?0:Ease((elapsed-310)/160.0));
  string key=width.ToString("F1")+":"+height.ToString("F1")+":"+opacity.ToString("F2")+":"+Progress.ToString("F3")+":"+check.ToString("F2");
  if(key!=LastFrame){using(var bitmap=Render(width,height,opacity,(float)Progress,check))Present(bitmap);LastFrame=key;}
  Animation.Interval=ReadyAt<0&&ms>800&&Math.Abs(ProgressTarget-Progress)<.001?80:20;
  if(++Frames==1){ShowWindow(Handle,4);if(IsWindowVisible(Handle))try{File.WriteAllText(Flag+".shown","1");}catch{}LaunchEngine();}
  if(ReadyAt>=0&&elapsed>=1160)Close();
 }
 static GraphicsPath Round(RectangleF r,float radius){var p=new GraphicsPath();float d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
 Bitmap Render(float width,float height,float opacity,float progress,float check){
  var result=new Bitmap(Width,Height,PixelFormat.Format32bppPArgb);
  using(var high=new Bitmap(Width*2,Height*2,PixelFormat.Format32bppPArgb)){
   using(var g=Graphics.FromImage(high)){
    g.ScaleTransform(2*DpiScale,2*DpiScale);g.SmoothingMode=SmoothingMode.AntiAlias;g.PixelOffsetMode=PixelOffsetMode.HighQuality;
    float x=(270-width)/2,y=(92-height)/2;
    for(int i=8;i>=1;i--)using(var shadow=Round(new RectangleF(x-i*.5f,y+2-i*.25f,width+i,height+i*.5f),height/2+i*.25f))using(var brush=new SolidBrush(Color.FromArgb((int)(4*opacity),0,0,0)))g.FillPath(brush,shadow);
    var rect=new RectangleF(x,y,width,height);
    using(var shape=Round(rect,height/2)){
     using(var bg=new SolidBrush(Color.FromArgb((int)(250*opacity),27,27,32)))g.FillPath(bg,shape);
     using(var edge=new Pen(Color.FromArgb((int)(35*opacity),255,255,255),.65f))g.DrawPath(edge,shape);
     if(progress>0){g.SetClip(shape);using(var fill=new SolidBrush(Color.FromArgb((int)(255*opacity*Math.Max(0,Math.Min(1,(44-height)/36))),Accent)))g.FillRectangle(fill,x,y,width*progress,height);g.ResetClip();}
    }
    if(check>0){
     using(var circle=Round(new RectangleF(113,24,44,44),22))using(var attributes=new ImageAttributes()){
      var matrix=new ColorMatrix();matrix.Matrix33=opacity*check;attributes.SetColorMatrix(matrix);
      g.SetClip(circle);g.DrawImage(Face,new Rectangle(113,24,44,44),0,0,Face.Width,Face.Height,GraphicsUnit.Pixel,attributes);g.ResetClip();
     }
    }
   }
   using(var g=Graphics.FromImage(result)){g.CompositingMode=CompositingMode.SourceCopy;g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(high,0,0,Width,Height);}
  }return result;
 }
 void Present(Bitmap image){
  IntPtr screen=GetDC(IntPtr.Zero),memory=CreateCompatibleDC(screen),bitmap=image.GetHbitmap(Color.FromArgb(0)),old=SelectObject(memory,bitmap);
  try{var pos=new Point(Left,Top);var size=new LayerSize(Width,Height);var zero=new Point();var blend=new Blend{Alpha=255,Format=1};if(!UpdateLayeredWindow(Handle,screen,ref pos,ref size,memory,ref zero,0,ref blend,2))throw new System.ComponentModel.Win32Exception();}
  finally{SelectObject(memory,old);DeleteObject(bitmap);DeleteDC(memory);ReleaseDC(IntPtr.Zero,screen);}
 }
 [DllImport("user32.dll")]static extern void DisableProcessWindowsGhosting();
 [STAThread] static int Main(string[] args){
  try{DisableProcessWindowsGhosting();}catch{}
  if(args.Length==1&&args[0]=="--surface-self-test"){
   return MainSurface("MeguLit",800,600)&&MainSurface("MeguLit.V3",800,600)&&!MainSurface("Default IME",800,600)&&!MainSurface("MSCTFIME UI",800,600)&&!MainSurface("",800,600)&&!MainSurface("MeguLit",16,16)?0:3;
  }
  if(args.Length==2&&args[0]=="--restore"){
   uint target;if(!UInt32.TryParse(args[1],out target))return 2;
   EnumWindows(delegate(IntPtr h,IntPtr unused){uint pid;GetWindowThreadProcessId(h,out pid);if(pid==target&&MainSurface(h)){int value=0;DwmSetWindowAttribute(h,13,ref value,4);int style=GetWindowLong(h,-20);SetWindowLong(h,-20,style|0x80000);SetLayeredWindowAttributes(h,0,255,2);ShowWindow(h,5);}return true;},IntPtr.Zero);return 0;
  }
  if(args.Length<1)return 2;
  try{SetProcessDPIAware();Application.EnableVisualStyles();Color accent=ColorTranslator.FromHtml(args.Length>2?args[2]:"#e0495a");
   using(var island=new StartupIsland(args[0],args.Length>1?args[1]:"zh",accent)){
    if(args.Length>3&&args[3]=="--render-test"){
     island.CreateControl();using(var b=island.Render(218,8,1,.6f,0))b.Save(args[0]+"-busy.png",ImageFormat.Png);using(var b=island.Render(44,44,1,0,1))b.Save(args[0]+"-ready.png",ImageFormat.Png);return 0;
    }
    if(args.Length>4&&args[3]=="--engine")island.Engine=args[4];
    Application.Run(island);
   }return 0;
  }catch(Exception e){try{File.AppendAllText(args[0]+".log",e.ToString());}catch{}return 1;}
 }
}
