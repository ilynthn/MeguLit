// SPDX-License-Identifier: GPL-3.0-or-later
// Per-pixel alpha startup surface. Draws at 2x resolution before compositing.
// 2026-11-27 (user: 「启动器只保留进度条 最后动效取消变圆然后出来那个小脸 换成变形成透明的MeguLit的logo」): the surface is only
// the progress bar; when it fills, the bar opens into a translucent glass MeguLit logo, holds, and fades. Windows'
// "Animation effects" off (prefers-reduced-motion) skips the morph and the bar just fades.
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
 readonly Bitmap Logo,Frost; readonly bool Reduce;
 const float SurfaceW=300,SurfaceH=140,BarW=218,BarH=8,LogoW=250,LogoH=LogoW*780f/2014f,LogoAlpha=.62f;
 [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr h,int attribute,ref int value,int size);
 void Cloak(IntPtr h,bool hidden){int value=hidden?1:0;DwmSetWindowAttribute(h,13,ref value,4);}
 Bitmap LoadLogo(){
  // docs/assets/logo.png, pre-scaled once to the 2x render size so every frame draws it 1:1.
  int w=(int)Math.Ceiling(LogoW*2*DpiScale),h=(int)Math.Ceiling(LogoH*2*DpiScale);var logo=new Bitmap(w,h,PixelFormat.Format32bppPArgb);
  using(var stream=typeof(StartupIsland).Assembly.GetManifestResourceStream("MeguLit.Logo"))
  using(var original=new Bitmap(stream))using(var g=Graphics.FromImage(logo)){
   g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.DrawImage(original,new Rectangle(0,0,w,h));
  }return logo;
 }
 static Bitmap Silhouette(Bitmap source){
  // The logo's shape in white: the frosted glass tint and the light sweep are drawn through it.
  var white=new Bitmap(source.Width,source.Height,PixelFormat.Format32bppPArgb);
  using(var g=Graphics.FromImage(white))using(var attributes=new ImageAttributes()){
   var m=new ColorMatrix(new float[][]{new float[]{0,0,0,0,0},new float[]{0,0,0,0,0},new float[]{0,0,0,0,0},new float[]{0,0,0,1,0},new float[]{1,1,1,0,1}});
   attributes.SetColorMatrix(m);g.DrawImage(source,new Rectangle(0,0,source.Width,source.Height),0,0,source.Width,source.Height,GraphicsUnit.Pixel,attributes);
  }return white;
 }
 [DllImport("user32.dll")]static extern bool SystemParametersInfo(uint action,uint param,out bool value,uint ini);
 static bool ReducedMotion(){bool on;return SystemParametersInfo(0x1042,0,out on,0)&&!on;}

 // Everything the surface shows at one moment. ms counts from the first frame; ready is when the bar filled (-1 = loading).
 public struct Frame { public double Opacity,Progress,Bar,Morph,Logo,Sheen,Edge; }
 public const long MorphReveal=390,MorphClose=1160,ReduceReveal=0,ReduceClose=240;
 public static Frame Compute(long ms,long ready,double progress,bool reduce){
  var f=new Frame();f.Progress=progress;long e=ready<0?-1:ms-ready;double appear=Ease(ms/220.0);f.Sheen=-1;
  if(reduce||e<0){f.Bar=1;f.Opacity=appear*(e<0?1:1-Ease(e/220.0));return f;}
  // 60-420 ms: the full bar opens vertically into the logo; the bar fades as the logo fills in; a light sweep crosses it.
  f.Morph=Ease((e-60)/360.0);f.Bar=1-Ease((e-60)/220.0);f.Logo=Ease((e-110)/330.0);f.Sheen=(e-300)/480.0;
  f.Edge=Math.Sin(Math.PI*Math.Max(0,Math.Min(1,(e-60)/560.0)));
  f.Opacity=appear*(1-Ease((e-920)/220.0));return f;
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
  double span=Reduce?220:420,k=Ease(elapsed/span);foreach(var h in Hidden)if(IsWindow(h))Alpha(h,(byte)Math.Round(255*k));
  if(elapsed>=span)Restore();
 }

 protected override void OnLoad(EventArgs e){base.OnLoad(e);using(var bitmap=Render(Compute(0,-1,0,Reduce)))Present(bitmap);}
 protected override bool ShowWithoutActivation {get{return true;}}
 protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x80000|0x80|0x08000000|0x20;return p;}}
 StartupIsland(string flag,string lang,Color accent,bool reduce){
  Flag=flag;Accent=accent;Reduce=reduce;
  using(var g=Graphics.FromHwnd(IntPtr.Zero))DpiScale=g.DpiX/96f;
  Logo=LoadLogo();Frost=Silhouette(Logo);
  FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;Text="MeguLit";StartPosition=FormStartPosition.Manual;
  ClientSize=new System.Drawing.Size((int)(SurfaceW*DpiScale),(int)(SurfaceH*DpiScale));
  var area=Screen.PrimaryScreen.WorkingArea;Location=new System.Drawing.Point(area.X+(area.Width-Width)/2,area.Y+(area.Height-Height)/2);
  Animation.Interval=20;Animation.Tick+=delegate{try{TickFrame();}catch(Exception e){Log(e);Close();}};
  Shown+=delegate{Clock.Restart();Animation.Start();};
  FormClosed+=delegate{Animation.Stop();if(EventHook!=IntPtr.Zero)UnhookWinEvent(EventHook);Restore();Logo.Dispose();Frost.Dispose();Animation.Dispose();};
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
  long elapsed=ReadyAt<0?0:ms-ReadyAt,reveal=Reduce?ReduceReveal:MorphReveal;
  if(ReadyAt>=0&&elapsed>=reveal&&!RevealStarted)StartReveal();
  if(RevealStarted&&!Restored)FadeMain(elapsed-reveal);
  if(ms>45000){Close();return;}
  var frame=Compute(ms,ReadyAt,Progress,Reduce);
  string key=frame.Opacity.ToString("F2")+":"+frame.Progress.ToString("F3")+":"+frame.Bar.ToString("F2")+":"+frame.Morph.ToString("F3")+":"+frame.Logo.ToString("F2")+":"+frame.Sheen.ToString("F2");
  if(key!=LastFrame){using(var bitmap=Render(frame))Present(bitmap);LastFrame=key;}
  Animation.Interval=ReadyAt<0&&ms>800&&Math.Abs(ProgressTarget-Progress)<.001?80:20;
  if(++Frames==1){ShowWindow(Handle,4);if(IsWindowVisible(Handle))try{File.WriteAllText(Flag+".shown","1");}catch{}LaunchEngine();}
  if(ReadyAt>=0&&elapsed>=(Reduce?ReduceClose:MorphClose))Close();
 }
 static GraphicsPath Round(RectangleF r,float radius){var p=new GraphicsPath();float d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
 static float Lerp(float a,float b,double t){return a+(b-a)*(float)t;}
 static void DrawFaded(Graphics g,Bitmap image,RectangleF to,double alpha){
  if(alpha<=0)return;using(var attributes=new ImageAttributes()){var m=new ColorMatrix();m.Matrix33=(float)Math.Min(1,alpha);attributes.SetColorMatrix(m);
   g.DrawImage(image,new[]{to.Location,new PointF(to.Right,to.Top),new PointF(to.Left,to.Bottom)},new RectangleF(0,0,image.Width,image.Height),GraphicsUnit.Pixel,attributes);}
 }
 Bitmap Render(Frame f){
  var result=new Bitmap(Width,Height,PixelFormat.Format32bppPArgb);
  using(var high=new Bitmap(Width*2,Height*2,PixelFormat.Format32bppPArgb)){
   using(var g=Graphics.FromImage(high)){
    g.ScaleTransform(2*DpiScale,2*DpiScale);g.SmoothingMode=SmoothingMode.AntiAlias;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.InterpolationMode=InterpolationMode.HighQualityBicubic;
    float cx=SurfaceW/2,cy=SurfaceH/2,o=(float)f.Opacity;
    // The opening: a rounded slit that starts as the bar and widens to frame the logo.
    float sw=Lerp(BarW,LogoW+24,f.Morph),sh=Lerp(BarH,LogoH+20,f.Morph);var slit=new RectangleF(cx-sw/2,cy-sh/2,sw,sh);
    if(f.Logo>0)using(var clip=Round(slit,Math.Min(sh/2,22))){
     g.SetClip(clip);float k=Lerp(.94f,1,f.Morph);var to=new RectangleF(cx-LogoW*k/2,cy-LogoH*k/2,LogoW*k,LogoH*k);
     DrawFaded(g,Logo,to,o*f.Logo*LogoAlpha);DrawFaded(g,Frost,to,o*f.Logo*.10);
     if(f.Sheen>0&&f.Sheen<1)using(var band=new GraphicsPath()){
      float bx=to.X-50+(to.Width+100)*(float)f.Sheen;band.AddPolygon(new[]{new PointF(bx,to.Y-4),new PointF(bx+30,to.Y-4),new PointF(bx+6,to.Bottom+4),new PointF(bx-24,to.Bottom+4)});
      g.SetClip(band,CombineMode.Intersect);DrawFaded(g,Frost,to,o*f.Logo*.38*Math.Sin(Math.PI*f.Sheen));
     }
     g.ResetClip();
    }
    if(f.Edge>0)using(var pane=Round(slit,Math.Min(sh/2,22)))using(var edge=new Pen(Color.FromArgb((int)(70*o*f.Edge),255,255,255),.6f))g.DrawPath(edge,pane);
    if(f.Bar>0){
     var bar=new RectangleF(cx-sw/2,cy-BarH/2,sw,BarH);int a=(int)(255*o*f.Bar);
     using(var shape=Round(bar,BarH/2)){
      using(var bg=new SolidBrush(Color.FromArgb((int)(a*.98),27,27,32)))g.FillPath(bg,shape);
      using(var edge=new Pen(Color.FromArgb((int)(a*.14),255,255,255),.65f))g.DrawPath(edge,shape);
      if(f.Progress>0){g.SetClip(shape);using(var fill=new SolidBrush(Color.FromArgb(a,Accent)))g.FillRectangle(fill,bar.X,bar.Y,bar.Width*(float)f.Progress,BarH);g.ResetClip();}
     }
    }
   }
   using(var g=Graphics.FromImage(result)){g.CompositingMode=CompositingMode.SourceCopy;g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(high,0,0,Width,Height);}
  }return result;
 }
 // Offscreen run of the whole timeline with a scripted load (no window, no engine): one PNG per 40 ms and timeline.json.
 static double SimTarget(long ms){return ms>=700?1:ms>=500?.97:ms>=250?.6:.2;}
 void DumpFrames(string dir){
  Directory.CreateDirectory(dir);double progress=0;long ready=-1;int i=0;var json=new System.Text.StringBuilder();var inv=System.Globalization.CultureInfo.InvariantCulture;
  for(long ms=0;ms<6000;ms+=40){
   double target=SimTarget(ms);progress+=(target-progress)*(1-Math.Exp(-40/130.0));
   if(ready<0&&target==1&&progress>.996&&ms>=850){progress=1;ready=ms;}
   var f=Compute(ms,ready,progress,Reduce);
   using(var b=Render(f))b.Save(Path.Combine(dir,i.ToString("D3")+".png"),ImageFormat.Png);
   json.Append(i==0?"":",").AppendFormat(inv,"{{\"ms\":{0},\"opacity\":{1:F3},\"bar\":{2:F3},\"morph\":{3:F3},\"logo\":{4:F3}",ms,f.Opacity,f.Bar,f.Morph,f.Logo).Append('}');i++;
   if(ready>=0&&ms-ready>=(Reduce?ReduceClose:MorphClose))break;
  }
  File.WriteAllText(Path.Combine(dir,"timeline.json"),String.Format(inv,"{{\"scale\":{0},\"reduce\":{1},\"readyAt\":{2},\"revealAfter\":{3},\"closeAfter\":{4},\"frames\":[{5}]}}",DpiScale,Reduce?"true":"false",ready,Reduce?ReduceReveal:MorphReveal,Reduce?ReduceClose:MorphClose,json));
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
   bool frames=Array.IndexOf(args,"--frames")>=0,reduce=Array.IndexOf(args,"--reduce-motion")>=0||(!frames&&ReducedMotion());
   using(var island=new StartupIsland(args[0],args.Length>1?args[1]:"zh",accent,reduce)){
    if(frames){island.DumpFrames(args[0]);return 0;}
    if(args.Length>3&&args[3]=="--render-test"){
     using(var b=island.Render(Compute(2000,-1,.6,reduce)))b.Save(args[0]+"-busy.png",ImageFormat.Png);using(var b=island.Render(Compute(2000,1200,1,reduce)))b.Save(args[0]+"-ready.png",ImageFormat.Png);return 0;
    }
    if(args.Length>4&&args[3]=="--engine")island.Engine=args[4];
    Application.Run(island);
   }return 0;
  }catch(Exception e){try{File.AppendAllText(args[0]+".log",e.ToString());}catch{}return 1;}
 }
}
