// SPDX-License-Identifier: GPL-3.0-or-later
// Per-pixel alpha startup surface. Draws at 2x resolution before compositing.
// 2026-11-27 (user: 「启动器只保留进度条 最后动效取消变圆然后出来那个小脸 换成变形成透明的MeguLit的logo」): the surface is only
// the progress bar; when it fills, the bar turns into a small translucent MeguLit logo (no wider than the bar), holds, and fades.
// The logo enters with the same move as the promo video's end card and the website entrance: the logo's own cape unfurls
// left to right in 48 strips that ripple like cloth and settle, while the hat and letters land big -> small, soft -> sharp.
// Every timing below is site/public/assets/js/intro.js (the video's 30 fps timing at double speed; in the video
// project they are the `Logo` / `CapeStrips` components); here the cape unfurls out of the bar. Windows' "Animation effects"
// off (prefers-reduced-motion) skips the logo and the bar just fades.
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
 readonly Bitmap Cape,Rest; readonly bool Reduce;
 const float SurfaceW=300,SurfaceH=140,BarW=218,BarH=8,LogoW=230,LogoH=LogoW*780f/2014f,LogoAlpha=.62f;
 // intro.js constants: 48 cape strips; ripple and rotation as drawn there; 30 px ripple at the video's 900 px logo width;
 // 8 px blur at the site's 23rem (368 px) logo width.
 const int CapeStrips=48;const float CapeRipple=30*LogoW/900f,RestBlur=8*LogoW/368f;
 [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr h,int attribute,ref int value,int size);
 void Cloak(IntPtr h,bool hidden){int value=hidden?1:0;DwmSetWindowAttribute(h,13,ref value,4);}
 Bitmap LoadArt(string name){
  // native/splash-logo-cape.png and -rest.png (the video's logo_cape / logo_rest), pre-scaled once to the 2x render size.
  int w=(int)Math.Ceiling(LogoW*2*DpiScale),h=(int)Math.Ceiling(LogoH*2*DpiScale);var art=new Bitmap(w,h,PixelFormat.Format32bppPArgb);
  using(var stream=typeof(StartupIsland).Assembly.GetManifestResourceStream(name))
  using(var original=new Bitmap(stream))using(var g=Graphics.FromImage(art)){
   g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.DrawImage(original,new Rectangle(0,0,w,h));
  }return art;
 }
 [DllImport("user32.dll")]static extern bool SystemParametersInfo(uint action,uint param,out bool value,uint ini);
 static bool ReducedMotion(){bool on;return SystemParametersInfo(0x1042,0,out on,0)&&!on;}

 // Everything the surface shows at one moment. ms counts from the first frame; ready is when the bar filled (-1 = loading).
 // Morph = how far the cape has unfurled, Logo = how far the hat and letters have landed, CapeMs = the cape's own clock.
 public struct Frame { public double Opacity,Progress,Bar,Morph,Logo,Ripple,CapeMs,Drop; }
 public const long MorphReveal=390,MorphClose=1160,ReduceReveal=0,ReduceClose=240,CapeStart=60;
 static double Eo(double t,double a,double b,double p){return 1-Math.Pow(1-Math.Max(0,Math.Min(1,(t-a)/(b-a))),p);}
 public static Frame Compute(long ms,long ready,double progress,bool reduce){
  var f=new Frame();f.Progress=progress;long e=ready<0?-1:ms-ready;double appear=Ease(ms/220.0);
  if(reduce||e<0){f.Bar=1;f.Opacity=appear*(e<0?1:1-Ease(e/220.0));return f;}
  // intro.js: unfurl = eo(t, 0, 475, 3); amp = 30 * scale * (1 - eo(t, 125, 800, 2)); rp = eo(t, 100, 575, 4); 850 ms
  double t=e-CapeStart;f.CapeMs=Math.Max(0,t);
  f.Morph=t<0?0:Eo(t,0,475,3);f.Ripple=1-Eo(t,125,800,2);f.Logo=t<0?0:Eo(t,100,575,4);
  // the full bar settles onto the cape's line, and the unfurling cape takes its place left to right
  f.Drop=Ease(e/240.0);f.Bar=1-Eo(t,380,475,2);
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
  Cape=LoadArt("MeguLit.LogoCape");Rest=LoadArt("MeguLit.LogoRest");
  FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;Text="MeguLit";StartPosition=FormStartPosition.Manual;
  ClientSize=new System.Drawing.Size((int)(SurfaceW*DpiScale),(int)(SurfaceH*DpiScale));
  var area=Screen.PrimaryScreen.WorkingArea;Location=new System.Drawing.Point(area.X+(area.Width-Width)/2,area.Y+(area.Height-Height)/2);
  Animation.Interval=20;Animation.Tick+=delegate{try{TickFrame();}catch(Exception e){Log(e);Close();}};
  Shown+=delegate{Clock.Restart();Animation.Start();};
  FormClosed+=delegate{Animation.Stop();if(EventHook!=IntPtr.Zero)UnhookWinEvent(EventHook);Restore();Cape.Dispose();Rest.Dispose();Animation.Dispose();};
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
  string key=frame.Opacity.ToString("F2")+":"+frame.Progress.ToString("F3")+":"+frame.Bar.ToString("F2")+":"+frame.Morph.ToString("F3")+":"+frame.Logo.ToString("F3")+":"+frame.CapeMs.ToString("F0")+":"+frame.Drop.ToString("F2");
  if(key!=LastFrame){using(var bitmap=Render(frame))Present(bitmap);LastFrame=key;}
  Animation.Interval=ReadyAt<0&&ms>800&&Math.Abs(ProgressTarget-Progress)<.001?80:20;
  if(++Frames==1){ShowWindow(Handle,4);if(IsWindowVisible(Handle))try{File.WriteAllText(Flag+".shown","1");}catch{}LaunchEngine();}
  if(ReadyAt>=0&&elapsed>=(Reduce?ReduceClose:MorphClose))Close();
 }
 static GraphicsPath Round(RectangleF r,float radius){var p=new GraphicsPath();float d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
 static float Lerp(float a,float b,double t){return a+(b-a)*(float)t;}
 static ImageAttributes Faded(double alpha,bool white){
  var m=new ColorMatrix();m.Matrix33=(float)Math.Max(0,Math.Min(1,alpha));
  if(white){m.Matrix00=0;m.Matrix11=0;m.Matrix22=0;m.Matrix40=1;m.Matrix41=1;m.Matrix42=1;}
  var a=new ImageAttributes();a.SetColorMatrix(m);return a;
 }
 static void DrawPart(Graphics g,Bitmap image,RectangleF from,RectangleF to,double alpha,bool white){
  if(alpha<=0)return;using(var attributes=Faded(alpha,white))
   g.DrawImage(image,new[]{to.Location,new PointF(to.Right,to.Top),new PointF(to.Left,to.Bottom)},from,GraphicsUnit.Pixel,attributes);
 }
 static void DrawFaded(Graphics g,Bitmap image,RectangleF to,double alpha){DrawPart(g,image,new RectangleF(0,0,image.Width,image.Height),to,alpha,false);}
 void DrawLogo(Graphics g,Frame f,float x0,float y0){
  // intro.js runCape(): each strip is a slice of the cape, lifted by the ripple and tilted while it is near the front
  float sw=LogoW/CapeStrips,kx=Cape.Width/LogoW,amp=(float)(CapeRipple*f.Ripple),front=(float)(f.Morph*(CapeStrips+6)-3),beat=(float)(f.CapeMs/16.67);
  for(int i=0;i<CapeStrips;i++){
   float vis=Math.Max(0,Math.Min(1,front-i));if(vis<=0)break;
   float u=(float)i/CapeStrips,near=Math.Max(0,Math.Min(1,1-(front-i)/6)),y=amp*(.35f+u)*(float)Math.Sin(u*7.5-beat*.32)-near*amp*1.2f;
   var state=g.Save();g.TranslateTransform(x0+i*sw,y0+LogoH*.7f+y);g.RotateTransform(near*-8);
   DrawPart(g,Cape,new RectangleF(i*sw*kx,0,(sw+1)*kx,Cape.Height),new RectangleF(-.5f,-LogoH*.7f,sw+1,LogoH),vis,false);g.Restore(state);
  }
  // the hat and letters: opacity rp * 1.6, scale 1.32 -> 1, blur (1 - rp) * 8 px
  double rp=f.Logo;if(rp<=0)return;float k=(float)(1.32-.32*rp),w=LogoW*k,h=LogoH*k;var to=new RectangleF(x0+(LogoW-w)/2,y0+(LogoH-h)/2,w,h);
  double blur=rp<.98?(1-rp)*RestBlur*2*DpiScale:0;
  if(blur<1.5){DrawFaded(g,Rest,to,Math.Min(1,rp*1.6));return;}
  // a blur by resampling: down to one pixel per blur radius and back up, smoothly
  int bw=Math.Max(2,(int)(Rest.Width/blur)),bh=Math.Max(2,(int)(Rest.Height/blur));
  using(var small=new Bitmap(bw,bh,PixelFormat.Format32bppPArgb)){
   using(var s=Graphics.FromImage(small)){s.InterpolationMode=InterpolationMode.HighQualityBilinear;s.PixelOffsetMode=PixelOffsetMode.HighQuality;s.DrawImage(Rest,new Rectangle(0,0,bw,bh));}
   var mode=g.InterpolationMode;g.InterpolationMode=InterpolationMode.HighQualityBilinear;DrawFaded(g,small,to,Math.Min(1,rp*1.6));g.InterpolationMode=mode;
  }
 }
 Bitmap Render(Frame f){
  var result=new Bitmap(Width,Height,PixelFormat.Format32bppPArgb);
  using(var high=new Bitmap(Width*2,Height*2,PixelFormat.Format32bppPArgb)){
   using(var g=Graphics.FromImage(high)){
    g.ScaleTransform(2*DpiScale,2*DpiScale);g.SmoothingMode=SmoothingMode.AntiAlias;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.InterpolationMode=InterpolationMode.HighQualityBicubic;
    float cx=SurfaceW/2,cy=SurfaceH/2,o=(float)f.Opacity,x0=cx-LogoW/2,y0=cy-LogoH/2;
    if(f.Morph>0||f.Logo>0){
     // the logo is drawn solid on its own layer, then laid down translucent with a faint frosted tint, so strip seams never show
     using(var layer=new Bitmap(high.Width,high.Height,PixelFormat.Format32bppPArgb)){
      using(var l=Graphics.FromImage(layer)){l.Transform=g.Transform;l.SmoothingMode=SmoothingMode.AntiAlias;l.PixelOffsetMode=PixelOffsetMode.HighQuality;l.InterpolationMode=InterpolationMode.HighQualityBicubic;DrawLogo(l,f,x0,y0);}
      var whole=new RectangleF(0,0,layer.Width,layer.Height);var state=g.Save();g.ResetTransform();
      DrawPart(g,layer,whole,whole,o*LogoAlpha,false);DrawPart(g,layer,whole,whole,o*.10,true);g.Restore(state);
     }
    }
    if(f.Bar>0){
     // the bar, lowered onto the cape's line; the part the cape has already reached is gone
     var bar=new RectangleF(cx-BarW/2,cy-BarH/2+(float)f.Drop*LogoH*.22f,BarW,BarH);int a=(int)(255*o*f.Bar);
     float cut=f.Morph>0?x0+(float)(f.Morph*(CapeStrips+6)-3)*LogoW/CapeStrips:float.MinValue;
     using(var shape=Round(bar,BarH/2)){
      g.SetClip(new RectangleF(Math.Max(cut,bar.X-1),bar.Y-2,bar.Right-Math.Max(cut,bar.X-1)+2,BarH+4));
      using(var bg=new SolidBrush(Color.FromArgb((int)(a*.98),27,27,32)))g.FillPath(bg,shape);
      using(var edge=new Pen(Color.FromArgb((int)(a*.14),255,255,255),.65f))g.DrawPath(edge,shape);
      if(f.Progress>0){g.SetClip(shape,CombineMode.Intersect);using(var fill=new SolidBrush(Color.FromArgb(a,Accent)))g.FillRectangle(fill,bar.X,bar.Y,bar.Width*(float)f.Progress,BarH);}
      g.ResetClip();
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
   json.Append(i==0?"":",").AppendFormat(inv,"{{\"ms\":{0},\"opacity\":{1:F3},\"bar\":{2:F3},\"morph\":{3:F3},\"logo\":{4:F3},\"ripple\":{5:F3}",ms,f.Opacity,f.Bar,f.Morph,f.Logo,f.Ripple).Append('}');i++;
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
   // The offscreen modes ignore the machine's own animation setting, so their output is the same everywhere.
   bool frames=Array.IndexOf(args,"--frames")>=0,still=args.Length>3&&args[3]=="--render-test",reduce=Array.IndexOf(args,"--reduce-motion")>=0||(!frames&&!still&&ReducedMotion());
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
