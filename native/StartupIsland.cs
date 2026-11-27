// SPDX-License-Identifier: GPL-3.0-or-later
// Per-pixel alpha startup surface.
// 2026-11-28 (user: 「现在这个启动动画的megulit 贼他妈发灰 还卡卡的 要优化一下」): the logo is drawn solid in its own colours
// (Megumin red, warm white) and comes in dark -> bright instead of blurring in; the whole surface fades only through the
// layered window's constant alpha. Frames are drawn on their own thread into one reused DIB, paced to the display, so the
// UI thread's file polling and window hiding never hold a frame back; the logo art is pre-scaled once to device pixels.
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
using System.Threading;
using System.Windows.Forms;
using Timer=System.Windows.Forms.Timer;

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
 readonly int[] CapePx,RestPx,Buf; readonly int ArtW,ArtH; readonly bool Reduce;
 const float SurfaceW=300,SurfaceH=140,BarW=218,BarH=8,LogoW=230,LogoH=LogoW*780f/2014f;
 // intro.js constants: 48 cape strips; ripple and rotation as drawn there; 30 px ripple at the video's 900 px logo width.
 // Where the site blurs the letters in, they come in dark -> bright (no per-frame filter); the cape's front strips too.
 const int CapeStrips=48;const float CapeRipple=30*LogoW/900f,DarkStart=.18f,FrontDark=.55f;
 [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr h,int attribute,ref int value,int size);
 void Cloak(IntPtr h,bool hidden){int value=hidden?1:0;DwmSetWindowAttribute(h,13,ref value,4);}
 Bitmap LoadArt(string name){
  // native/splash-logo-cape.png and -rest.png (the video's logo_cape / logo_rest), pre-scaled once to device pixels.
  int w=(int)Math.Round(LogoW*DpiScale),h=(int)Math.Round(LogoH*DpiScale);var art=new Bitmap(w,h,PixelFormat.Format32bppPArgb);
  using(var stream=typeof(StartupIsland).Assembly.GetManifestResourceStream(name))
  using(var original=new Bitmap(stream))using(var g=Graphics.FromImage(art)){
   g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.DrawImage(original,new Rectangle(0,0,w,h));
  }return art;
 }
 static int[] Pixels(Bitmap b){
  var d=b.LockBits(new Rectangle(0,0,b.Width,b.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppPArgb);
  try{var px=new int[b.Width*b.Height];for(int y=0;y<b.Height;y++)Marshal.Copy(new IntPtr(d.Scan0.ToInt64()+(long)y*d.Stride),px,y*b.Width,b.Width);return px;}finally{b.UnlockBits(d);}
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

 // Progress and ReadyAt belong to the render thread; the UI thread only writes ProgressTarget (under Sync) and reads ReadyAt.
 double Progress,ProgressTarget;readonly object Sync=new object();
 Thread Painter;volatile bool Painting,PaintFailed;IntPtr Surface;int PosX,PosY;List<double> Trace;
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

 protected override void OnLoad(EventArgs e){base.OnLoad(e);Surface=Handle;PosX=Left;PosY=Top;CreateBack();PaintFrame(Compute(0,-1,0,Reduce));Present(255);}
 protected override bool ShowWithoutActivation {get{return true;}}
 protected override CreateParams CreateParams {get{var p=base.CreateParams;p.ExStyle|=0x80000|0x80|0x08000000|0x20;return p;}}
 StartupIsland(string flag,string lang,Color accent,bool reduce){
  Flag=flag;Accent=accent;Reduce=reduce;
  using(var g=Graphics.FromHwnd(IntPtr.Zero))DpiScale=g.DpiX/96f;
  using(var cape=LoadArt("MeguLit.LogoCape"))using(var rest=LoadArt("MeguLit.LogoRest")){ArtW=cape.Width;ArtH=cape.Height;CapePx=Pixels(cape);RestPx=Pixels(rest);}
  Buf=new int[(int)(SurfaceW*DpiScale)*(int)(SurfaceH*DpiScale)];
  FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;Text="MeguLit";StartPosition=FormStartPosition.Manual;
  ClientSize=new System.Drawing.Size((int)(SurfaceW*DpiScale),(int)(SurfaceH*DpiScale));
  var area=Screen.PrimaryScreen.WorkingArea;Location=new System.Drawing.Point(area.X+(area.Width-Width)/2,area.Y+(area.Height-Height)/2);
  Animation.Interval=16;Animation.Tick+=delegate{try{TickFrame();}catch(Exception e){Log(e);Close();}};
  Shown+=delegate{Clock.Restart();Animation.Start();};
  FormClosing+=delegate{StopPainter();};
  FormClosed+=delegate{Animation.Stop();if(EventHook!=IntPtr.Zero)UnhookWinEvent(EventHook);Restore();WriteTrace();FreeBack();Animation.Dispose();};
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
 // UI thread: polls the host's files, hides / reveals the main window and closes. It never draws.
 void TickFrame(){
  long ms=Clock.ElapsedMilliseconds;
  if(File.Exists(Flag+".failed")||PaintFailed){Close();return;}
  long ready=Interlocked.Read(ref ReadyAt);
  if(ready<0){
   HideMain();int value;double target=-1;try{if(Int32.TryParse(File.ReadAllText(Flag+".progress"),out value))target=Math.Min(.97,Math.Max(0,value/100.0));}catch{}
   if(File.Exists(Flag))target=1;
   lock(Sync)ProgressTarget=Math.Max(ProgressTarget,target);
  }
  long elapsed=ready<0?0:ms-ready,reveal=Reduce?ReduceReveal:MorphReveal;
  if(ready>=0&&elapsed>=reveal&&!RevealStarted)StartReveal();
  if(RevealStarted&&!Restored)FadeMain(elapsed-reveal);
  if(ms>45000){Close();return;}
  Animation.Interval=ready<0?40:16;
  if(++Frames==1){ShowWindow(Handle,4);if(IsWindowVisible(Handle))try{File.WriteAllText(Flag+".shown","1");}catch{}StartPainter();LaunchEngine();}
  if(ready>=0&&elapsed>=(Reduce?ReduceClose:MorphClose))Close();
 }
 [DllImport("dwmapi.dll")]static extern int DwmFlush();
 [DllImport("winmm.dll")]static extern uint timeBeginPeriod(uint ms);
 [DllImport("gdi32.dll")]static extern int GetDeviceCaps(IntPtr dc,int index);
 double Period=1000/60.0;
 void StartPainter(){
  IntPtr screen=GetDC(IntPtr.Zero);int hz=GetDeviceCaps(screen,116);ReleaseDC(IntPtr.Zero,screen);if(hz>=50&&hz<=500)Period=1000.0/Math.Min(hz,120);
  if(File.Exists(Flag+".trace"))Trace=new List<double>();
  Painting=true;Painter=new Thread(PaintLoop){IsBackground=true,Name="splash paint",Priority=ThreadPriority.AboveNormal};Painter.Start();
 }
 void StopPainter(){Painting=false;if(Painter!=null&&Painter.IsAlive)Painter.Join(1000);}
 // Render thread: steps the bar, draws into the back buffer only when something besides opacity changed, and presents at
 // the display's pace (DwmFlush waits for the next composition; a frame is never shorter than one refresh, nor than 1/120 s,
 // so a fast monitor does not take CPU from the app that is starting).
 void PaintLoop(){
  try{
   double previous=Clock.Elapsed.TotalMilliseconds;string drawn=null;int shown=-1;
   while(Painting){
    double now=Clock.Elapsed.TotalMilliseconds,dt=Math.Max(1,now-previous);previous=now;long ms=(long)now;
    double target;lock(Sync)target=ProgressTarget;long ready=Interlocked.Read(ref ReadyAt);
    if(ready<0){
     Progress+=(target-Progress)*(1-Math.Exp(-dt/130.0));
     if(target==1&&Progress>.996&&ms>=850){Progress=1;ready=ms;Interlocked.Exchange(ref ReadyAt,ms);}
    }
    var f=Compute(ms,ready,Progress,Reduce);string key=Key(f);int alpha=(int)Math.Round(255*f.Opacity);
    bool changed=key!=drawn||alpha!=shown;
    if(key!=drawn){PaintFrame(f);drawn=key;}
    if(changed){Present(alpha);shown=alpha;if(Trace!=null)Trace.Add(Clock.Elapsed.TotalMilliseconds);}
    if(!changed){Thread.Sleep(15);continue;}
    // never faster than the monitor refreshes, even where DwmFlush returns early (no composition, another desktop)
    DwmFlush();int rest=(int)(Period-(Clock.Elapsed.TotalMilliseconds-now));if(rest>0)Thread.Sleep(rest);
   }
  }catch(Exception e){Log(e);PaintFailed=true;}
 }
 static string Key(Frame f){return f.Progress.ToString("F3")+":"+f.Bar.ToString("F2")+":"+f.Morph.ToString("F3")+":"+f.Logo.ToString("F3")+":"+f.CapeMs.ToString("F0")+":"+f.Drop.ToString("F3");}
 void WriteTrace(){if(Trace==null)return;try{File.WriteAllText(Flag+".frames",String.Join("\n",Trace.ConvertAll(t=>t.ToString("F2",System.Globalization.CultureInfo.InvariantCulture)).ToArray())+"\nreadyAt="+Interlocked.Read(ref ReadyAt));}catch{}}
 static GraphicsPath Round(RectangleF r,float radius){var p=new GraphicsPath();float d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
 static float Lerp(float a,float b,double t){return a+(b-a)*(float)t;}
 // alpha and brightness through one colour matrix; plain DrawImage (GDI+'s fast path) when both are 1
 static void DrawPart(Graphics g,Bitmap image,RectangleF from,RectangleF to,double alpha,double light){
  if(alpha<=0)return;var points=new[]{to.Location,new PointF(to.Right,to.Top),new PointF(to.Left,to.Bottom)};
  if(alpha>=1&&light>=1){g.DrawImage(image,points,from,GraphicsUnit.Pixel);return;}
  var m=new ColorMatrix();m.Matrix33=(float)Math.Min(1,alpha);m.Matrix00=m.Matrix11=m.Matrix22=(float)Math.Max(0,Math.Min(1,light));
  using(var attributes=new ImageAttributes()){attributes.SetColorMatrix(m);g.DrawImage(image,points,from,GraphicsUnit.Pixel,attributes);}
 }
 // ---- the logo, composited in managed code on the pre-scaled art (premultiplied ARGB) into Buf ----
 // GDI+ costs ~70 us per DrawImage with a transform, far too much for 48 strips a frame on a slow machine; here each strip
 // is one translate (+ rotate near the front), the letters one scale, both with alpha and brightness, sampled bilinearly.
 static int Px(int[] s,int w,int h,int x0,int x1,int x,int y){return x<x0||x>=x1||y<0||y>=h?0:s[y*w+x];}
 static int Mix(int a,int b,int t){
  if(a==b)return a;int u=256-t;
  return (int)((((uint)a>>24)*(uint)u+((uint)b>>24)*(uint)t)>>8<<24)|((((a>>16&255)*u+(b>>16&255)*t)>>8)<<16)|((((a>>8&255)*u+(b>>8&255)*t)>>8)<<8)|(((a&255)*u+(b&255)*t)>>8);
 }
 // c over Buf[i], with c's alpha scaled by a and its colour by a * l (a, l in 0..256)
 void Over(int i,int c,int a,int l){
  if(c==0)return;int ca=(int)((uint)c>>24)*a>>8;if(ca<=0)return;int k=a*l>>8;
  int r=(c>>16&255)*k>>8,g=(c>>8&255)*k>>8,b=(c&255)*k>>8,d=Buf[i];
  if(ca>=255||d==0){Buf[i]=(ca<<24)|(r<<16)|(g<<8)|b;return;}
  int inv=255-ca;Buf[i]=((ca+((int)((uint)d>>24)*inv+127)/255)<<24)|((r+((d>>16&255)*inv+127)/255)<<16)|((g+((d>>8&255)*inv+127)/255)<<8)|(b+((d&255)*inv+127)/255);
 }
 // Draws source columns [sx0, sx1) of art, mapped by dest = origin + R(angle) * scale * (src - pivot), over Buf.
 void Blit(int[] art,int sx0,int sx1,double pivotX,double pivotY,double originX,double originY,double angle,double scale,int a,int l){
  int W=(int)(SurfaceW*DpiScale),H=(int)(SurfaceH*DpiScale);double cos=Math.Cos(angle),sin=Math.Sin(angle);
  if(angle==0&&scale==1&&originX-pivotX==Math.Round(originX-pivotX)){
   // translate only, by whole pixels across: each column is a straight vertical resample
   int dx=(int)Math.Round(originX-pivotX);double oy=originY-pivotY;int iy=(int)Math.Floor(oy),t=(int)Math.Round((oy-iy)*256);if(t==256){iy++;t=0;}
   for(int sx=Math.Max(0,sx0);sx<Math.Min(ArtW,sx1);sx++){int x=sx+dx;if(x<0||x>=W)continue;
    for(int sy=-1;sy<ArtH;sy++){int y=sy+iy+1;if(y<0||y>=H)continue;
     int top=sy<0?0:art[sy*ArtW+sx],bottom=sy+1<ArtH?art[(sy+1)*ArtW+sx]:0;if(top==0&&bottom==0)continue;Over(y*W+x,Mix(bottom,top,t),a,l);}}
   return;
  }
  // general: the source rectangle's corners give the destination bounds; every destination pixel maps back
  double minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  foreach(var c in new[]{new[]{sx0,0},new[]{sx1,0},new[]{sx0,ArtH},new[]{sx1,ArtH}}){
   double px=(c[0]-pivotX)*scale,py=(c[1]-pivotY)*scale,x=originX+px*cos-py*sin,y=originY+px*sin+py*cos;
   minX=Math.Min(minX,x);maxX=Math.Max(maxX,x);minY=Math.Min(minY,y);maxY=Math.Max(maxY,y);}
  int bx0=Math.Max(0,(int)Math.Floor(minX)-1),bx1=Math.Min(W,(int)Math.Ceiling(maxX)+1),by0=Math.Max(0,(int)Math.Floor(minY)-1),by1=Math.Min(H,(int)Math.Ceiling(maxY)+1);
  for(int y=by0;y<by1;y++)for(int x=bx0;x<bx1;x++){
   double ex=x+.5-originX,ey=y+.5-originY,u=(ex*cos+ey*sin)/scale+pivotX-.5,v=(-ex*sin+ey*cos)/scale+pivotY-.5;
   if(u<sx0-1||u>=sx1||v<-1||v>=ArtH)continue;
   int ix=(int)Math.Floor(u),iy=(int)Math.Floor(v),tx=(int)((u-ix)*256),ty=(int)((v-iy)*256);
   int c=Mix(Mix(Px(art,ArtW,ArtH,sx0,sx1,ix,iy),Px(art,ArtW,ArtH,sx0,sx1,ix+1,iy),tx),Mix(Px(art,ArtW,ArtH,sx0,sx1,ix,iy+1),Px(art,ArtW,ArtH,sx0,sx1,ix+1,iy+1),tx),ty);
   Over(y*W+x,c,a,l);
  }
 }
 static int Unit(double v){return (int)Math.Round(256*Math.Max(0,Math.Min(1,v)));}
 void Compose(Frame f,float x0,float y0){
  Array.Clear(Buf,0,Buf.Length);if(f.Morph<=0&&f.Logo<=0)return;
  double s=DpiScale,ox=Math.Round(x0*s),oy=Math.Round(y0*s),sw=LogoW/CapeStrips,amp=CapeRipple*f.Ripple,front=f.Morph*(CapeStrips+6)-3,beat=f.CapeMs/16.67;
  // intro.js runCape(): each strip is a slice of the cape, lifted by the ripple and tilted while it is near the front;
  // the strips at the front come in darker and brighten as the front moves on
  for(int i=0;i<CapeStrips;i++){
   double vis=Math.Max(0,Math.Min(1,front-i));if(vis<=0)break;
   double u=(double)i/CapeStrips,near=Math.Max(0,Math.Min(1,1-(front-i)/6)),y=amp*(.35+u)*Math.Sin(u*7.5-beat*.32)-near*amp*1.2;
   int sx0=(int)Math.Round(i*sw*s),sx1=(int)Math.Round((i+1)*sw*s);
   // the strip pivots on its own left edge at 70 % of the logo's height, as on the site
   Blit(CapePx,sx0,sx1,sx0,LogoH*.7*s,ox+sx0,oy+(LogoH*.7+y)*s,near*-8*Math.PI/180,1,Unit(vis),Unit(1-near*FrontDark));
  }
  // the hat and letters: opacity rp * 1.6 and scale 1.32 -> 1 as on the site; dark -> bright where the site blurs
  double rp=f.Logo;if(rp<=0)return;
  Blit(RestPx,0,ArtW,ArtW/2.0,ArtH/2.0,ox+ArtW/2.0,oy+ArtH/2.0,0,rp>=1?1:1.32-.32*rp,Unit(rp*1.6),Unit(DarkStart+(1-DarkStart)*rp));
 }
 float LogoX{get{return (float)Math.Round((SurfaceW/2-LogoW/2)*DpiScale)/DpiScale;}}
 float LogoY{get{return (float)Math.Round((SurfaceH/2-LogoH/2)*DpiScale)/DpiScale;}}
 // One frame at full strength into a 32-bit premultiplied buffer at bits (stride = width * 4) that g draws on.
 // The surface's opacity is applied by the layered window (Present), not by redrawing.
 void Draw(IntPtr bits,Graphics g,Frame f){
  Compose(f,LogoX,LogoY);Marshal.Copy(Buf,0,bits,Buf.Length);
  if(f.Bar<=0){g.Flush(FlushIntention.Sync);return;}
  g.ResetTransform();g.ScaleTransform(DpiScale,DpiScale);g.SmoothingMode=SmoothingMode.AntiAlias;g.PixelOffsetMode=PixelOffsetMode.Half;g.CompositingQuality=CompositingQuality.HighSpeed;
  float cx=SurfaceW/2,cy=SurfaceH/2,x0=LogoX;
  // the bar, lowered onto the cape's line; the part the cape has already reached is gone
  var bar=new RectangleF(cx-BarW/2,cy-BarH/2+(float)f.Drop*LogoH*.22f,BarW,BarH);int a=(int)(255*f.Bar);
  float cut=f.Morph>0?x0+(float)(f.Morph*(CapeStrips+6)-3)*LogoW/CapeStrips:float.MinValue;
  using(var shape=Round(bar,BarH/2)){
   g.SetClip(new RectangleF(Math.Max(cut,bar.X-1),bar.Y-2,bar.Right-Math.Max(cut,bar.X-1)+2,BarH+4));
   using(var bg=new SolidBrush(Color.FromArgb((int)(a*.98),27,27,32)))g.FillPath(bg,shape);
   using(var edge=new Pen(Color.FromArgb((int)(a*.14),255,255,255),.65f))g.DrawPath(edge,shape);
   if(f.Progress>0){g.SetClip(shape,CombineMode.Intersect);using(var fill=new SolidBrush(Color.FromArgb(a,Accent)))g.FillRectangle(fill,bar.X,bar.Y,bar.Width*(float)f.Progress,BarH);}
   g.ResetClip();
  }
  g.Flush(FlushIntention.Sync);
 }
 // Offscreen copy of a frame as the screen shows it (opacity applied), for --frames / --render-test.
 Bitmap Render(Frame f){
  int W=(int)(SurfaceW*DpiScale),H=(int)(SurfaceH*DpiScale);IntPtr bits=Marshal.AllocHGlobal(W*H*4);
  try{
   using(var full=new Bitmap(W,H,W*4,PixelFormat.Format32bppPArgb,bits)){
    using(var g=Graphics.FromImage(full))Draw(bits,g,f);
    var result=new Bitmap(W,H,PixelFormat.Format32bppPArgb);
    using(var g=Graphics.FromImage(result)){g.CompositingMode=CompositingMode.SourceCopy;var r=new RectangleF(0,0,W,H);DrawPart(g,full,r,r,f.Opacity,1);}
    return result;
   }
  }finally{Marshal.FreeHGlobal(bits);}
 }
 // The back buffer: one top-down 32-bit DIB selected into one memory DC for the window's life; GDI+ draws straight into it.
 [StructLayout(LayoutKind.Sequential)] struct BitmapInfo { public int Size,Width,Height;public short Planes,Bits;public int Compression,Image,XPels,YPels,Used,Important; }
 [DllImport("gdi32.dll")]static extern IntPtr CreateDIBSection(IntPtr dc,ref BitmapInfo info,uint usage,out IntPtr bits,IntPtr section,uint offset);
 IntPtr BackDc,BackDib,BackOld,BackBits;Bitmap Back;Graphics BackGraphics;
 void CreateBack(){
  var info=new BitmapInfo{Size=40,Width=Width,Height=-Height,Planes=1,Bits=32};IntPtr bits;
  BackDib=CreateDIBSection(IntPtr.Zero,ref info,0,out bits,IntPtr.Zero,0);if(BackDib==IntPtr.Zero)throw new System.ComponentModel.Win32Exception();
  BackDc=CreateCompatibleDC(IntPtr.Zero);BackOld=SelectObject(BackDc,BackDib);
  BackBits=bits;Back=new Bitmap(Width,Height,Width*4,PixelFormat.Format32bppPArgb,bits);BackGraphics=Graphics.FromImage(Back);
 }
 void FreeBack(){
  if(BackGraphics!=null)BackGraphics.Dispose();if(Back!=null)Back.Dispose();
  if(BackDc!=IntPtr.Zero){SelectObject(BackDc,BackOld);DeleteDC(BackDc);}if(BackDib!=IntPtr.Zero)DeleteObject(BackDib);BackDc=BackDib=IntPtr.Zero;
 }
 void PaintFrame(Frame f){Draw(BackBits,BackGraphics,f);}
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
 // --bench: draws the scripted timeline the way the window does (one reused 32-bit buffer, nothing presented) and writes
 // each frame's draw time in ms; runs it 7 times and keeps the median per frame (a busy machine skews single runs).
 void Bench(string dir){
  Directory.CreateDirectory(dir);var inv=System.Globalization.CultureInfo.InvariantCulture;var times=new List<double>();var stamps=new List<long>();
  int W=(int)(SurfaceW*DpiScale),H=(int)(SurfaceH*DpiScale);IntPtr bits=Marshal.AllocHGlobal(W*H*4);
  var runs=new List<List<double>>();
  using(var buffer=new Bitmap(W,H,W*4,PixelFormat.Format32bppPArgb,bits))using(var g=Graphics.FromImage(buffer))
  for(int run=0;run<7;run++){
   double progress=0;long ready=-1;int i=0;var one=new List<double>();runs.Add(one);
   for(long ms=0;ms<6000;ms+=8){
    double target=SimTarget(ms);progress+=(target-progress)*(1-Math.Exp(-8/130.0));
    if(ready<0&&target==1&&progress>.996&&ms>=850){progress=1;ready=ms;}
    var f=Compute(ms,ready,progress,Reduce);var watch=Stopwatch.StartNew();Draw(bits,g,f);double t=watch.Elapsed.TotalMilliseconds;
    one.Add(t);if(run==0)stamps.Add(ready<0?-1:ms-ready);i++;
    if(ready>=0&&ms-ready>=(Reduce?ReduceClose:MorphClose))break;
   }
  }
  for(int i=0;i<stamps.Count;i++){var all=runs.ConvertAll(r=>r[i]);all.Sort();times.Add(all[all.Count/2]);}
  Marshal.FreeHGlobal(bits);
  var json=new System.Text.StringBuilder();for(int i=0;i<times.Count;i++)json.Append(i==0?"":",").AppendFormat(inv,"[{0},{1:F3}]",stamps[i],times[i]);
  File.WriteAllText(Path.Combine(dir,"bench.json"),"{\"frames\":["+json+"]}");
 }
 // Shows the back buffer at the given constant alpha; a fade is only this number changing.
 void Present(int alpha){
  var pos=new Point(PosX,PosY);var size=new LayerSize(Width,Height);var zero=new Point();var blend=new Blend{Alpha=(byte)Math.Max(0,Math.Min(255,alpha)),Format=1};
  if(!UpdateLayeredWindow(Surface,IntPtr.Zero,ref pos,ref size,BackDc,ref zero,0,ref blend,2))throw new System.ComponentModel.Win32Exception();
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
   bool frames=Array.IndexOf(args,"--frames")>=0||Array.IndexOf(args,"--bench")>=0,still=args.Length>3&&args[3]=="--render-test",reduce=Array.IndexOf(args,"--reduce-motion")>=0||(!frames&&!still&&ReducedMotion());
   using(var island=new StartupIsland(args[0],args.Length>1?args[1]:"zh",accent,reduce)){
    if(Array.IndexOf(args,"--bench")>=0){island.Bench(args[0]);return 0;}
    if(frames){island.DumpFrames(args[0]);return 0;}
    if(args.Length>3&&args[3]=="--render-test"){
     using(var b=island.Render(Compute(2000,-1,.6,reduce)))b.Save(args[0]+"-busy.png",ImageFormat.Png);using(var b=island.Render(Compute(2000,1200,1,reduce)))b.Save(args[0]+"-ready.png",ImageFormat.Png);return 0;
    }
    if(args.Length>4&&args[3]=="--engine")island.Engine=args[4];
    try{timeBeginPeriod(1);}catch{}
    Application.Run(island);
   }return 0;
  }catch(Exception e){try{File.AppendAllText(args[0]+".log",e.ToString());}catch{}return 1;}
 }
}
