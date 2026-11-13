using System;
using System.IO;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public class GalWindowBridge {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; public Rect(int l,int t,int r,int b){Left=l;Top=t;Right=r;Bottom=b;} }
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X,Y; }
    [StructLayout(LayoutKind.Sequential)] struct Msg { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public Point pt; }
    delegate bool EnumProc(IntPtr h, IntPtr p);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p,IntPtr l);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder s,int c);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h,out Rect r);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect r);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h,ref Point p);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int cmd);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h,uint cmd);
    [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="FindWindowW")] static extern IntPtr FindWindowByClass(string cls,IntPtr title);
    [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="GetPropW")] static extern IntPtr GetProp(IntPtr h,string name);
    /* Issue #135 (user: with embedded subtitles Magpie upscaling no longer works). Magpie draws the game, scaled, in its own
       window and publishes where (docs: "Interact with Magpie programmatically": class name and the window properties
       Magpie.SrcHWND / Src* / Dest*, physical pixels; this process is per-monitor-v2 aware). While Magpie scales the bound
       game, the reader lays its text out over Magpie's picture, not over the hidden-behind original window, and stays above
       Magpie's window. */
    static bool MagpieArea(IntPtr gameRoot,Rect area,out Rect scaled){
        scaled=area;IntPtr magpie=FindWindowByClass("Window_Magpie_967EB565-6F73-4E94-AE53-00CC42592A22",IntPtr.Zero);
        if(magpie==IntPtr.Zero||!IsWindowVisible(magpie))return false;IntPtr src=GetProp(magpie,"Magpie.SrcHWND");
        if(src==IntPtr.Zero||(src!=gameRoot&&src!=Target))return false;
        Func<string,int> p=n=>(int)(long)GetProp(magpie,"Magpie."+n);
        int sl=p("SrcLeft"),st=p("SrcTop"),sr=p("SrcRight"),sb=p("SrcBottom"),dl=p("DestLeft"),dt=p("DestTop"),dr=p("DestRight"),db=p("DestBottom");
        if(sr<=sl||sb<=st||dr<=dl||db<=dt)return false;
        double kx=(dr-dl)/(double)(sr-sl),ky=(db-dt)/(double)(sb-st);
        Func<int,int> mx=x=>dl+(int)Math.Round((x-sl)*kx);Func<int,int> my=y=>dt+(int)Math.Round((y-st)*ky);
        scaled=new Rect(mx(area.Left),my(area.Top),mx(area.Right),my(area.Bottom));MagpieWindow=magpie;NativeMaskLayer.Scale(true,sl,st,dl,dt,kx,ky,Overlay);return true;
    }
    static IntPtr MagpieWindow;static DateTime MagpieRaisedAt,MagpieFocusAt;
    static string LastCoverNote="";
    // True when no real application window lies over the middle of the game, even if the game does not have focus
    // (e.g. right after Tomoyo was restarted from Explorer). Walks the z-order above the game and ignores windows that
    // cannot be seen or clicked: hidden, cloaked (background UWP apps), click-through overlays, Tomoyo's own windows.
    static bool ImeHost(string name){name=(name??"").ToLowerInvariant();return name=="textinputhost"||name=="chsime"||name=="ctfmon"||name=="inputapp";}
    static bool GameUncovered(IntPtr gameRoot,IntPtr overlayRoot){Rect c;if(!GetClientRect(Target,out c))return false;Point o=new Point();if(!ClientToScreen(Target,ref o))return false;
        int cx=o.X+c.Right/2,cy=o.Y+c.Bottom*2/3;uint self=(uint)Process.GetCurrentProcess().Id;int guard=0;
        for(IntPtr w=GetWindow(gameRoot,3);w!=IntPtr.Zero&&guard++<400;w=GetWindow(w,3)){
            if(!IsWindowVisible(w)||w==overlayRoot)continue;uint pid;GetWindowThreadProcessId(w,out pid);if(pid==OverlayPid||pid==self)continue;
            int ex=GetWindowLong(w,-20);if((ex&0x20)!=0)continue;int cloaked;if(DwmGetWindowAttribute(w,14,out cloaked,4)==0&&cloaked!=0)continue;
            Rect r;if(!GetWindowRect(w,out r)||r.Right-r.Left<2||r.Bottom-r.Top<2)continue;
            if(cx>=r.Left&&cx<r.Right&&cy>=r.Top&&cy<r.Bottom){var t=new StringBuilder(128);GetWindowText(w,t,t.Capacity);string note=ProcessName(pid)+" / "+t;if(note!=LastCoverNote){LastCoverNote=note;Emit(new{type="coverDebug",text="游戏被其他窗口挡住，阅读层隐藏："+note});}return false;}}
        if(LastCoverNote!=""){LastCoverNote="";Emit(new{type="coverDebug",text="游戏画面未被遮挡，阅读层显示"});}return true;}
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h,int index);
    [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h,int index,int value);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h,int id,uint modifiers,uint key);
    /* E476: end GalWindowBridge processes started from another MeguLit folder (a folder that holds MeguLit.exe); never this one's */
    static int EndForeignBridges(){int ended=0;string own="";try{own=System.IO.Path.GetFullPath(System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName);}catch{return 0;}
      foreach(var p in System.Diagnostics.Process.GetProcessesByName("GalWindowBridge")){try{if(p.Id==System.Diagnostics.Process.GetCurrentProcess().Id)continue;string file=System.IO.Path.GetFullPath(p.MainModule.FileName);if(String.Equals(file,own,StringComparison.OrdinalIgnoreCase))continue;
        string dir=System.IO.Path.GetDirectoryName(file),root=dir!=null&&System.IO.File.Exists(System.IO.Path.Combine(dir,"MeguLit.exe"))?dir:System.IO.Path.GetDirectoryName(dir??"");
        if(root==null||!System.IO.File.Exists(System.IO.Path.Combine(root,"MeguLit.exe")))continue;
        p.Kill();p.WaitForExit(3000);ended++;}catch{}finally{p.Dispose();}}
      return ended;}
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h,int id);
    [DllImport("user32.dll")] static extern bool PeekMessage(out Msg m,IntPtr h,uint min,uint max,uint remove);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref Msg m);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Msg m);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern bool GetLayeredWindowAttributes(IntPtr h,out uint color,out byte alpha,out uint flags);
    [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h,uint color,byte alpha,uint flags);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h,int attribute,out int value,int size);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h,int attribute,ref int value,int size);
    static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=4000000};
    static readonly object OutputLock=new object();
    static readonly ConcurrentQueue<Dictionary<string,object>> Commands=new ConcurrentQueue<Dictionary<string,object>>();
    static volatile bool Running=true;
    static int OverlayPid, OriginalStyle, OriginalExStyle;
    static IntPtr Overlay=IntPtr.Zero,Target=IntPtr.Zero;
    static Process TrackedGame;static long TrackedGameStarted;
    static Rect OriginalRect;
    static IntPtr OriginalRegion;
    [DllImport("user32.dll")]static extern int GetWindowRgn(IntPtr window,IntPtr region);
    static GameHookVerifier HookVerifier;
    static bool DialogVisible=true,VisualDetection,SceneDetection,ReaderMenuDown;static readonly GameSceneProbe Scene=new GameSceneProbe();static readonly GameUiLayer GameUi=new GameUiLayer();static DialogDetector Dialog=new DialogDetector();
    static bool Captured,MenuOpen,MenuRegionReady,MenuFocusPending,LookupOpen,IsShown=true,CoverEnabled=true,TranslationMode,FloatingPlaced,ModeConfigured;
    // Translation mode without a game: the main window shrinks to a dialogue strip along its own bottom edge. Dragging
    // the strip moves it by (FloatDX,FloatDY); leaving translation mode moves the main window by the same amount, so
    // the two stay bound together.
    const int FloatHeight=190;static int FloatDX,FloatDY;static bool Dragging;static Point DragStart;static Rect DragRect;
    [DllImport("user32.dll")] static extern bool GetCursorPos(out Point p);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);
    static Rect FloatingBase(){int dpi=96;try{dpi=(int)GetDpiForWindow(Overlay);}catch{}if(dpi<96)dpi=96;
        int w=Math.Max(480*dpi/96,OriginalRect.Right-OriginalRect.Left),h=FloatHeight*dpi/96;return new Rect(OriginalRect.Left,OriginalRect.Bottom-h,OriginalRect.Left+w,OriginalRect.Bottom);}
    static void DragTick(){
        if((GetAsyncKeyState(0x01)&0x8000)==0||Overlay==IntPtr.Zero||!TranslationMode||Target!=IntPtr.Zero){Dragging=false;return;}
        Point p;if(!GetCursorPos(out p))return;int x=DragRect.Left+p.X-DragStart.X,y=DragRect.Top+p.Y-DragStart.Y;
        SetWindowPos(Overlay,IntPtr.Zero,x,y,0,0,0x0001|0x0004|0x0010);Rect b=FloatingBase();FloatDX=x-b.Left;FloatDY=y-b.Top;}

    // The normal-mode window size and position (and maximised state) are kept in cache\window-placement.txt and put
    // back at the next start, while the window is still hidden behind the startup animation.
    [StructLayout(LayoutKind.Sequential)] struct Placement{public int Length,Flags,ShowCmd;public Point Min,Max;public Rect Normal;}
    [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr h,ref Placement p);
    [DllImport("user32.dll")] static extern bool SetWindowPlacement(IntPtr h,ref Placement p);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromRect(ref Rect r,uint flags);
    static readonly string PlacementFile=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..","cache","window-placement.txt"));
    static bool PlacementRestored,PendingMaximize;static string LastPlacement="";static DateTime NextPlacementCheck=DateTime.MinValue;
    static string PlacementText(){var p=new Placement();p.Length=Marshal.SizeOf(typeof(Placement));if(!GetWindowPlacement(Overlay,ref p))return "";var r=p.Normal;return r.Left+" "+r.Top+" "+r.Right+" "+r.Bottom+" "+(p.ShowCmd==3?1:0);}
    static void KeepPlacement(){
        if(Overlay==IntPtr.Zero||Captured)return;
        if(!PlacementRestored){PlacementRestored=true;
            try{var v=File.ReadAllText(PlacementFile).Trim().Split(' ');var r=new Rect(int.Parse(v[0]),int.Parse(v[1]),int.Parse(v[2]),int.Parse(v[3]));
                if(r.Right-r.Left>=400&&r.Bottom-r.Top>=300&&MonitorFromRect(ref r,0)!=IntPtr.Zero){var p=new Placement();p.Length=Marshal.SizeOf(typeof(Placement));
                    if(GetWindowPlacement(Overlay,ref p)){bool shown=IsWindowVisible(Overlay);p.Normal=r;p.Flags=0;p.ShowCmd=shown?(v.Length>4&&v[4]=="1"?3:1):0;SetWindowPlacement(Overlay,ref p);PendingMaximize=!shown&&v.Length>4&&v[4]=="1";}}}
            catch{}
            LastPlacement=PlacementText();return;}
        if(PendingMaximize&&IsWindowVisible(Overlay)){PendingMaximize=false;ShowWindow(Overlay,3);}
        if(DateTime.UtcNow<NextPlacementCheck)return;NextPlacementCheck=DateTime.UtcNow.AddSeconds(1);
        if(!IsWindowVisible(Overlay)||IsIconic(Overlay))return;string text=PlacementText();
        if(text!=""&&text!=LastPlacement){LastPlacement=text;try{Directory.CreateDirectory(Path.GetDirectoryName(PlacementFile));File.WriteAllText(PlacementFile,text);}catch{}}}
    static DateTime NextAutoBind=DateTime.MinValue;
    static DateTime LastModeToggle=DateTime.MinValue;
    static DateTime LastCoverToggle=DateTime.MinValue;
    static GameTextMask TextMask;
    static PageLocator PageLocate; // E306: OCR sentence positions for engines without their own
    static GameWaitMarker WaitMarker;
    static NativeMaskLayer MaskLayer;
    // Live frosted glass behind glass-mode panels (GlassLayer.cs): rectangles come from the page, the bridge keeps them under the overlay.
    static readonly GlassLayer Glass=new GlassLayer{LogPath=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..","logs","glass-timing.log"),Emit=Emit};
    // Panel rectangles for the glass, each with its radius and glass blur/dim/saturation. Thread-safe (GlassLayer.Set locks):
    // the input thread calls it directly, so a dragged panel's glass does not wait for the next bridge loop (E139).
    static void GlassCommand(Dictionary<string,object> d){var boxes=new List<GlassLayer.Box>();object rects;if(d.TryGetValue("rects",out rects)&&rects is System.Collections.ArrayList){foreach(object item in (System.Collections.ArrayList)rects){var rect=item as Dictionary<string,object>;if(rect==null||boxes.Count>=16)continue;double x=Num(rect,"x",0),y=Num(rect,"y",0),w=Num(rect,"width",0),h=Num(rect,"height",0);if(w>0&&h>0&&w<=16384&&h<=16384&&Math.Abs(x)<32768&&Math.Abs(y)<32768)boxes.Add(new GlassLayer.Box((int)x,(int)y,(int)w,(int)h,(int)Num(rect,"radius",Num(d,"radius",0)),(int)Math.Max(0,Math.Min(60,Num(rect,"blur",18))),(int)Math.Max(0,Math.Min(95,Num(rect,"dim",0))),(int)Math.Max(0,Math.Min(300,Num(rect,"saturate",100))),(int)Math.Max(0,Math.Min(100,Num(rect,"alpha",100))),(int)Num(rect,"fx",x),(int)Num(rect,"fy",y),(int)Math.Max(0,Math.Min(16384,Num(rect,"fw",w))),(int)Math.Max(0,Math.Min(16384,Num(rect,"fh",h)))));}}
        Glass.Set(boxes,(int)Num(d,"radius",0));}
    /* E533: Pass = painted (inside the window region) but never takes the pointer: art-text translations over game buttons */sealed class HitRegion{public Rect Bounds;public bool Pass;}
    static readonly List<HitRegion> HitRegions=new List<HitRegion>();static string RegionKey="";
    [DllImport("user32.dll")]static extern int SetWindowRgn(IntPtr window,IntPtr region,bool redraw);
    [DllImport("gdi32.dll")]static extern IntPtr CreateRectRgn(int left,int top,int right,int bottom);
    [DllImport("gdi32.dll")]static extern int CombineRgn(IntPtr result,IntPtr a,IntPtr b,int mode);
    [DllImport("gdi32.dll")]static extern int GetRgnBox(IntPtr region,out Rect box);
    [DllImport("gdi32.dll")]static extern bool DeleteObject(IntPtr value);
    static void MaskOutput(object value){var d=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(value));if(Str(d,"type")!="maskFrame"){Emit(value);return;}if(Bool(d,"clear")){MaskLayer.Hide();return;}try{MaskLayer.Frame(Str(d,"png"),(int)Num(d,"x",0),(int)Num(d,"y",0),(int)Num(d,"width",0),(int)Num(d,"height",0));}catch{MaskLayer.Hide();}}
    static void ResetRegion(){RegionKey="";HitRegions.Clear();if(Overlay!=IntPtr.Zero){SetWindowRgn(Overlay,OriginalRegion,true);OriginalRegion=IntPtr.Zero;}}
    public static Rect Clip(Rect r,int width,int height){return new Rect(Math.Max(0,r.Left),Math.Max(0,r.Top),Math.Min(width,r.Right),Math.Min(height,r.Bottom));}
    static void ApplyRegion(int width,int height){
        int dx=0,dy=0;Rect wr;Point co=new Point();
        if(GetWindowRect(Overlay,out wr)&&ClientToScreen(Overlay,ref co)){dx=Math.Max(0,Math.Min(64,co.X-wr.Left));dy=Math.Max(0,Math.Min(64,co.Y-wr.Top));}
        width+=dx;height+=dy;
        string key=width+":"+height+":"+dx+":"+dy+":"+LookupOpen+":"+String.Join(";",HitRegions.ConvertAll(h=>h.Bounds.Left+","+h.Bounds.Top+","+h.Bounds.Right+","+h.Bounds.Bottom));
        if(key==RegionKey)return;
        IntPtr region=LookupOpen?CreateRectRgn(0,0,width,height):CreateRectRgn(0,0,0,0);
        foreach(var hit in HitRegions){var h=hit.Bounds;var rect=Clip(new Rect(h.Left+dx,h.Top+dy,h.Right+dx,h.Bottom+dy),width,height);
            if(rect.Right<=rect.Left||rect.Bottom<=rect.Top)continue;
            // Keep the CSS corner pixels; a Win32 rounded region has only binary coverage and clips away antialiasing.
            IntPtr part=CreateRectRgn(rect.Left,rect.Top,rect.Right,rect.Bottom);
            try{CombineRgn(region,region,part,2);}finally{DeleteObject(part);}
        }
        // Chromium-based programs (browsers, Discord, CEF/Electron players) treat a window whose region is one plain
        // rectangle as opaque over its whole window rectangle. With the menu open the overlay spans the desktop, so they
        // marked themselves occluded and paused or blanked their video. A region that is never a single rectangle is
        // skipped by that check: one transparent corner pixel is added (or cut out when the region already covers it).
        Rect box;if(GetRgnBox(region,out box)==2&&width>2&&height>2){bool covers=box.Right>=width&&box.Bottom>=height;IntPtr corner=CreateRectRgn(width-1,height-1,width,height);try{CombineRgn(region,region,corner,covers?4:2);}finally{DeleteObject(corner);}}
        if(SetWindowRgn(Overlay,region,true)!=0)RegionKey=key;else DeleteObject(region);
    }

    static Rect LastRect; static bool HasLastRect;
    static Rect LastReaderRect;
    static double X=4,Y=66,W=92,H=26;
    static string WantedProcess="";static bool EnterGamePending;static string WantedExecutable="";static DateTime ManualBindUntil;
    static uint OldLayerColor,OldLayerFlags; static byte OldLayerAlpha; static bool HadLayerAttributes;
    static readonly Dictionary<int,int> OriginalDwm=new Dictionary<int,int>();
    static void PlainFrame(){
        OriginalDwm.Clear();
        foreach(var pair in new[]{new[]{38,1},new[]{33,1},new[]{34,unchecked((int)0xfffffffe)}}){
            try{int oldValue;if(DwmGetWindowAttribute(Overlay,pair[0],out oldValue,4)==0){int newValue=pair[1];if(DwmSetWindowAttribute(Overlay,pair[0],ref newValue,4)==0)OriginalDwm[pair[0]]=oldValue;}}catch{}
        }
    }
    // The reader is MeguLit's own window: its Windows 11 accent border (DWMWA_BORDER_COLOR, 34) stays off even when the
    // window gets its normal frame back, or a blue outline shows around it whenever it has focus (user, 2026-11-09).
    static void RestoreFrame(){foreach(var pair in OriginalDwm){if(pair.Key==34)continue;try{int value=pair.Value;DwmSetWindowAttribute(Overlay,pair.Key,ref value,4);}catch{}}OriginalDwm.Clear();}
    static string Str(Dictionary<string,object> d,string key,string fallback=""){object v;return d.TryGetValue(key,out v)?Convert.ToString(v):fallback;}
    static double Num(Dictionary<string,object> d,string key,double fallback){object v;double n;return d.TryGetValue(key,out v)&&Double.TryParse(Convert.ToString(v),out n)?n:fallback;}
    static bool Bool(Dictionary<string,object> d,string key){object v;return d.TryGetValue(key,out v)&&v is bool&&(bool)v;}
    static void Emit(object value){lock(OutputLock){Console.WriteLine(Json.Serialize(value));Console.Out.Flush();}}
        [DllImport("kernel32.dll")]static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool QueryFullProcessImageName(IntPtr process,int flags,StringBuilder image,ref int length);
    [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
    static string ProcessImage(uint pid){var handle=OpenProcess(0x1000,false,pid);if(handle==IntPtr.Zero)return "";try{int length=32768;var image=new StringBuilder(length);return QueryFullProcessImageName(handle,0,image,ref length)?image.ToString():"";}finally{CloseHandle(handle);}}
    static string ProcessName(uint pid){try{using(var process=Process.GetProcessById((int)pid))return process.ProcessName;}catch{return "";}}
    static void Diagnose(){
        var windows=new List<object>();int order=0;
        EnumWindows(delegate(IntPtr hwnd,IntPtr unused){
            int z=order++;uint pid;GetWindowThreadProcessId(hwnd,out pid);string name=ProcessName(pid);
            if(name!="BGI"&&name!="MeguLit"&&name!="tomoyo"&&name!="tomoyo_megumin"&&name!="GalWindowBridge")return true;
            Rect r,client;GetWindowRect(hwnd,out r);GetClientRect(hwnd,out client);Point origin=new Point();ClientToScreen(hwnd,ref origin);
            var title=new StringBuilder(200);GetWindowText(hwnd,title,title.Capacity);int cloak=0;try{DwmGetWindowAttribute(hwnd,14,out cloak,4);}catch{}
            windows.Add(new{hwnd=hwnd.ToInt64().ToString(),pid=pid,process=name,title=title.ToString(),z=z,visible=IsWindowVisible(hwnd),style=GetWindowLong(hwnd,-16),exStyle=GetWindowLong(hwnd,-20),x=r.Left,y=r.Top,width=r.Right-r.Left,height=r.Bottom-r.Top,clientX=origin.X,clientY=origin.Y,clientWidth=client.Right,clientHeight=client.Bottom,cloaked=cloak});return true;
        },IntPtr.Zero);
        Emit(new{type="diagnose",session=Process.GetCurrentProcess().SessionId,foreground=GetForegroundWindow().ToInt64().ToString(),windows=windows});
    }
    static List<Dictionary<string,object>> Windows(){
        var list=new List<Dictionary<string,object>>();
        EnumWindows(delegate(IntPtr hwnd,IntPtr unused){
            if(!IsWindowVisible(hwnd))return true;uint pid;GetWindowThreadProcessId(hwnd,out pid);
            if(pid==OverlayPid||pid==(uint)Process.GetCurrentProcess().Id)return true;
            var title=new StringBuilder(512);GetWindowText(hwnd,title,title.Capacity);
            if(title.Length==0)return true;
            string name=ProcessName(pid);if(name=="")return true;
            list.Add(new Dictionary<string,object>{{"hwnd",hwnd.ToInt64().ToString()},{"pid",pid},{"title",title.ToString()},{"processName",name}});return true;
        },IntPtr.Zero);return list;
    }
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowTextLength(IntPtr h);
    static IntPtr PreferredOverlay=IntPtr.Zero;
    static int HostedFrameUpdates;
    public static int HostedStyle(int style){return (style&~0x00c40000)|unchecked((int)0x80000000);}
    static void PrepareHostedFrame(){
        // A dedicated transparent HWND is always a popup. Expanding its hit region
        // during menu drag must never reveal the saved ordinary-window caption.
        int style=GetWindowLong(Overlay,-16),wanted=HostedStyle(style),ex=GetWindowLong(Overlay,-20),wantedEx=(ex&~0x00040000)|0x00000080;
        if(style==wanted&&ex==wantedEx)return;
        SetWindowLong(Overlay,-16,wanted);SetWindowLong(Overlay,-20,wantedEx);
        SetWindowPos(Overlay,IntPtr.Zero,0,0,0,0,0x0001|0x0002|0x0004|0x0010|0x0020);
        if(++HostedFrameUpdates<=12)Emit(new{type="hostFrame",update=HostedFrameUpdates,styleBefore=style,styleAfter=GetWindowLong(Overlay,-16),exStyleBefore=ex,exStyleAfter=GetWindowLong(Overlay,-20)});
    }
    static void FindOverlay(){
        if(PreferredOverlay!=IntPtr.Zero&&IsWindow(PreferredOverlay)){uint owner;GetWindowThreadProcessId(PreferredOverlay,out owner);if(owner==OverlayPid){Overlay=PreferredOverlay;PrepareHostedFrame();return;}}
        // Tauri also owns hidden event-loop/tool windows. Select its actual application surface.
        // A minimised main window has an empty client rectangle; retain its identity until it is destroyed.
        if(Overlay!=IntPtr.Zero&&IsWindow(Overlay))return;
        Overlay=IntPtr.Zero;long largest=0;
        EnumWindows(delegate(IntPtr h,IntPtr u){uint pid;GetWindowThreadProcessId(h,out pid);Rect rect;
            if(pid==OverlayPid&&GetClientRect(h,out rect)&&rect.Right>=250&&rect.Bottom>=150){long area=(long)rect.Right*rect.Bottom;if(area>largest){largest=area;Overlay=h;}}return true;
        },IntPtr.Zero);
        if(Overlay!=IntPtr.Zero){var title=new StringBuilder(128);GetWindowText(Overlay,title,title.Capacity);if(title.ToString()!="MeguLit")SetWindowText(Overlay,"MeguLit");}
    }

    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool SetWindowText(IntPtr h,string title);
    // The borderless translation surface is a popup, not an ordinary opaque application window.
    // Its menu spans the virtual desktop; Chromium otherwise may treat that HWND rectangle as
    // covering other video windows, especially while dragging makes the region rectangular.
    // WS_POPUP avoids that occlusion classification without changing focus, taskbar or alpha.
    // Restore() puts back OriginalStyle when returning to the main interface.
    static void Capture(){if(Captured||Overlay==IntPtr.Zero||IsIconic(Overlay))return;GetWindowRect(Overlay,out OriginalRect);OriginalRegion=CreateRectRgn(0,0,0,0);if(GetWindowRgn(Overlay,OriginalRegion)==0){DeleteObject(OriginalRegion);OriginalRegion=IntPtr.Zero;}OriginalStyle=GetWindowLong(Overlay,-16);OriginalExStyle=GetWindowLong(Overlay,-20);HadLayerAttributes=GetLayeredWindowAttributes(Overlay,out OldLayerColor,out OldLayerAlpha,out OldLayerFlags);Captured=true;SetWindowLong(Overlay,-16,(OriginalStyle&~0x00c40000)|unchecked((int)0x80000000));PlainFrame();if((OriginalExStyle&0x00080000)!=0)SetLayeredWindowAttributes(Overlay,0,255,2);}
    static void Restore(){Glass.Clear();if(MaskLayer!=null)MaskLayer.Hide();if(TextMask!=null)TextMask.Hide();
        // A region can exist without a capture (bound while in normal mode); always clear it, or the normal UI stays cut into rectangles.
        if(!Captured&&Overlay!=IntPtr.Zero&&IsWindow(Overlay)&&(RegionKey!=""||HitRegions.Count>0)){RegionKey="";HitRegions.Clear();SetWindowRgn(Overlay,IntPtr.Zero,true);}
        if(!Captured||!IsWindow(Overlay))return;ResetRegion();RestoreFrame();SetWindowLong(Overlay,-16,OriginalStyle);SetWindowPos(Overlay,new IntPtr(-2),OriginalRect.Left,OriginalRect.Top,OriginalRect.Right-OriginalRect.Left,OriginalRect.Bottom-OriginalRect.Top,0x0020|0x0040|0x0010);if(HadLayerAttributes)SetLayeredWindowAttributes(Overlay,OldLayerColor,OldLayerAlpha,OldLayerFlags);Captured=false;IsShown=true;}
    public static Rect Place(Rect area,double x,double y,double w,double h){int aw=Math.Max(1,area.Right-area.Left),ah=Math.Max(1,area.Bottom-area.Top);x=Math.Max(0,Math.Min(95,x));y=Math.Max(0,Math.Min(95,y));w=Math.Max(5,Math.Min(100,w));h=Math.Max(5,Math.Min(100,h));int l=area.Left+(int)Math.Round(aw*x/100),t=area.Top+(int)Math.Round(ah*y/100);return new Rect(l,t,l+Math.Max(120,(int)Math.Round(aw*w/100)),t+Math.Max(70,(int)Math.Round(ah*h/100)));}
    public static Rect SurfaceBounds(Rect reader,Rect game,System.Drawing.Rectangle scan){return scan.IsEmpty?reader:new Rect(Math.Min(reader.Left,game.Left+scan.Left),Math.Min(reader.Top,game.Top+scan.Top),Math.Max(reader.Right,game.Left+scan.Right),Math.Max(reader.Bottom,game.Top+scan.Bottom));}
    static string ExecutableHash(uint pid){try{using(var sha=System.Security.Cryptography.SHA256.Create())using(var input=File.OpenRead(Process.GetProcessById((int)pid).MainModule.FileName))return BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant();}catch{return "";}}
    static void Bind(IntPtr target,bool activate=false){Scene.Reset();GameUi.Clear();if(target==IntPtr.Zero||target==Overlay||!IsWindow(target))throw new Exception("请选择有效的游戏窗口");FindOverlay();if(Overlay==IntPtr.Zero)throw new Exception("MeguLit 窗口尚未准备好，请稍后再绑定");if(TranslationMode)Capture();Target=target;HasLastRect=false;uint pid;GetWindowThreadProcessId(target,out pid);ForgetGame();TrackedGame=Process.GetProcessById((int)pid);TrackedGameStarted=TrackedGame.StartTime.ToUniversalTime().Ticks;WindowGoneAt=DateTime.MinValue;WantedProcess=ProcessName(pid);string executableHash=ExecutableHash(pid);Dialog.Reset();DialogVisible=true;if(activate){CoverEnabled=true;RevealGame(Target);
            // Binding from the menu keeps the menu open (and the keyboard on it); the game only comes forward without one.
            if(!MenuOpen)SetForegroundWindow(GetAncestor(Target,2));LastZCheck=DateTime.MinValue;}if(AudioWanted)Audio.Start(pid);var gameCaption=new StringBuilder(512);GetWindowText(target,gameCaption,gameCaption.Capacity);Emit(new{type="bound",activateGame=activate,coverEnabled=CoverEnabled,bound=TranslationMode,gameProcessId=pid,gameStarted=Process.GetProcessById((int)pid).StartTime.ToUniversalTime().Ticks.ToString(),gameHwnd=target.ToInt64().ToString(),gameStyleKey=executableHash,gameTitle=gameCaption.ToString(),hookExact474=executableHash=="e77a11486b6d94a42f9d7d39fd768b4e763f163b977d3eaed94cf9e13217f995",interfaceMode=TranslationMode?"translation":"normal",processName=WantedProcess,message="游戏窗口已记住；Alt+M 切换普通界面和翻译文本框"});}
    // The game's own sound for Anki (GameAudio.cs): recorded only while MeguLit asks for it and a game is bound.
    static readonly GameAudio Audio=new GameAudio();static bool AudioWanted;
    // #113: binding, unbinding or closing never leaves the game unreachable. Its top-level window comes back if it is
    // minimised, hidden or parked completely off every monitor (-32000 and similar), without stealing focus or resizing.
    static void RevealGame(IntPtr target){try{if(target==IntPtr.Zero||!IsWindow(target))return;IntPtr root=GetAncestor(target,2);if(root==IntPtr.Zero||root==Overlay||!IsWindow(root))return;
        if(IsIconic(root))ShowWindow(root,9);else if(!IsWindowVisible(root))ShowWindow(root,8);
        Rect r;if(!GetWindowRect(root,out r))return;var desktop=System.Windows.Forms.SystemInformation.VirtualScreen;
        if(GameOffScreen(r.Left,r.Top,r.Right,r.Bottom,desktop.Left,desktop.Top,desktop.Right,desktop.Bottom)){var work=System.Windows.Forms.Screen.PrimaryScreen.WorkingArea;SetWindowPos(root,IntPtr.Zero,work.Left+Math.Max(0,(work.Width-(r.Right-r.Left))/2),work.Top+Math.Max(0,(work.Height-(r.Bottom-r.Top))/2),0,0,0x0001|0x0004|0x0010);}
    }catch{}}
    public static bool GameOffScreen(int left,int top,int right,int bottom,int dl,int dt,int dr,int db){int visibleW=Math.Min(right,dr)-Math.Max(left,dl),visibleH=Math.Min(bottom,db)-Math.Max(top,dt);return visibleW<48||visibleH<32;}
    static void ForgetGame(){Audio.Stop();if(TrackedGame!=null){TrackedGame.Dispose();TrackedGame=null;}TrackedGameStarted=0;WindowGoneAt=DateTime.MinValue;}
    static DateTime WindowGoneAt=DateTime.MinValue;
    static bool HasGameWindow(uint pid){bool found=false;EnumWindows(delegate(IntPtr hwnd,IntPtr unused){uint owner;GetWindowThreadProcessId(hwnd,out owner);if(owner==pid&&GetWindowTextLength(hwnd)>0){found=true;return false;}return true;},IntPtr.Zero);return found;}
    static bool HasVisibleWindow(uint pid){bool found=false;EnumWindows(delegate(IntPtr hwnd,IntPtr unused){uint owner;GetWindowThreadProcessId(hwnd,out owner);if(owner==pid&&IsWindowVisible(hwnd)){found=true;return false;}return true;},IntPtr.Zero);return found;}
    // Track the process separately from its HWND: minimizing or recreating a window is not a game exit.
    static bool CheckGameExit(){
        if(TrackedGame==null)return false;
        bool exited;try{exited=TrackedGame.HasExited;}catch{return false;}
        // Some games (euphoria) close every window at once on quit but keep the process alive for minutes while it
        // shuts down. A bound game whose window is gone and that shows no window for 5 s has been closed.
        if(!exited){
            uint targetPid=0;if(Target!=IntPtr.Zero&&IsWindow(Target))GetWindowThreadProcessId(Target,out targetPid);
            if(targetPid==(uint)TrackedGame.Id){WindowGoneAt=DateTime.MinValue;return false;}
            if(WindowGoneAt==DateTime.MinValue){WindowGoneAt=DateTime.UtcNow;return false;}
            if((DateTime.UtcNow-WindowGoneAt).TotalSeconds<5||HasGameWindow((uint)TrackedGame.Id))return false;
            // User authorised cleanup of closed games that leave a windowless process behind.
            // A minimised game is preserved; a destroyed or hidden main window with no visible game windows is closed.
            try{TrackedGame.Refresh();if(PreferredOverlay==IntPtr.Zero&&!TrackedGame.HasExited&&TrackedGame.StartTime.ToUniversalTime().Ticks==TrackedGameStarted&&!HasGameWindow((uint)TrackedGame.Id)){
                int cleanupPid=TrackedGame.Id;TrackedGame.Kill();bool stopped=TrackedGame.WaitForExit(1000);Emit(new{type="gameCleanup",pid=cleanupPid,success=stopped,message=stopped?"closed game process exit confirmed":"process exit not confirmed"});if(!stopped){WindowGoneAt=DateTime.UtcNow;return false;}
            }}catch(Exception error){Emit(new{type="gameCleanup",pid=TrackedGame.Id,success=false,message=error.Message});WindowGoneAt=DateTime.UtcNow;return false;}

        }
        WindowGoneAt=DateTime.MinValue;
        ForgetGame();Target=IntPtr.Zero;ModeRequestAt=DateTime.MinValue;ModeFallbackAt=DateTime.UtcNow;
        Restore();InterfaceMode(false,false);if(WaitMarker!=null)WaitMarker.Hide();if(HookVerifier!=null)HookVerifier.Cancel();
        Emit(new{type="gameClosed",interfaceMode="normal",bound=false,gameAttached=false,gameProcessId=0,gameStarted="",gameHwnd=""});
        return true;
    }
    static void InterfaceMode(bool translation,bool userAction){
        if(translation&&userAction){FindOverlay();if(Overlay!=IntPtr.Zero&&IsIconic(Overlay))ShowWindow(Overlay,4);}
        if(translation!=TranslationMode){
            if(!translation&&Captured&&Target==IntPtr.Zero&&(FloatDX!=0||FloatDY!=0))OriginalRect=new Rect(OriginalRect.Left+FloatDX,OriginalRect.Top+FloatDY,OriginalRect.Right+FloatDX,OriginalRect.Bottom+FloatDY);
            FloatDX=FloatDY=0;Dragging=false;
            TranslationMode=translation;MenuOpen=false;MenuRegionReady=false;MenuFocusPending=false;LookupOpen=false;HitRegions.Clear();Glass.Clear();RegionKey="";HasLastRect=false;FloatingPlaced=false;
            if(!translation){Restore();if(PreferredOverlay!=IntPtr.Zero){NormalShowUntil=DateTime.MinValue;if(Overlay!=IntPtr.Zero)ShowWindow(Overlay,0);IsShown=false;}else{NormalShowUntil=DateTime.UtcNow.AddMilliseconds(1500);if(Overlay!=IntPtr.Zero){ShowWindow(Overlay,userAction?5:4);IsShown=true;if(userAction)SetForegroundWindow(Overlay);}}}
            else if(userAction&&Target!=IntPtr.Zero)SetForegroundWindow(Target);
            // No game: shrink to the dialogue strip right away (the tick loop runs only every 100 ms without a game).
            if(PreferredOverlay==IntPtr.Zero&&translation&&Target==IntPtr.Zero){FindOverlay();if(Overlay!=IntPtr.Zero){Capture();Rect r=FloatingBase();SetWindowPos(Overlay,new IntPtr(-2),r.Left+FloatDX,r.Top+FloatDY,r.Right-r.Left,r.Bottom-r.Top,0x0020|0x0010);FloatingPlaced=true;}}
        }
        Emit(new{type=userAction?"interfaceMode":"bound",interfaceMode=translation?"translation":"normal",bound=translation&&Target!=IntPtr.Zero,gameAttached=Target!=IntPtr.Zero,coverEnabled=CoverEnabled,message=translation?"翻译文本框模式 · Alt+M 开关 MeguLit 主页":"普通 MeguLit 界面 · Alt+M 切换翻译文本框"});
    }
    // Right after switching to normal mode the main window must end up visible; it was seen staying hidden when the
    // switch landed while the reading layer was auto-hidden. Only this short window is enforced, so hiding it later still works.
    static DateTime NormalShowUntil=DateTime.MinValue;
    // The reading layer must stay above the game. Activating the game (binding, clicking it) could leave the layer
    // underneath while the layer was only re-placed on size changes, so a menu opened afterwards was never seen.
    static DateTime LastZCheck=DateTime.MinValue;static IntPtr LastHomeForeground;
    // Tells the page once a region that includes the menu is in place and the window shown; the page holds the menu's
    // opening animation until then, so a half-opened menu never shows through the old, text-only region.
    static bool RegionAckPending;
    static void AckRegion(){if(!RegionAckPending||!MenuOpen)return;Rect r;if(!GetClientRect(Overlay,out r))return;if(TranslationMode&&Target!=IntPtr.Zero){var screen=System.Windows.Forms.SystemInformation.VirtualScreen;if(r.Right!=screen.Width||Math.Abs(r.Bottom-screen.Height)>1)return;}RegionAckPending=false;Emit(new{type="regionApplied",surfaceWidth=r.Right,surfaceHeight=r.Bottom});}
    static void KeepAboveGame(IntPtr gameRoot){KeepAboveGame(gameRoot,true);}
    static void KeepAboveGame(IntPtr gameRoot,bool front){
        bool menu=MenuOpen&&MenuRegionReady;
        if((DateTime.UtcNow-LastZCheck).TotalMilliseconds<(menu?100:250))return;LastZCheck=DateTime.UtcNow;
        /* E472 (user: fullscreen ファタモルガーナの館 showed no text): a game window owned by a hidden application window (KiriKiri 2:
           TVPWindowForm owned by TApplication) has that hidden window as its root owner, so the visible form going topmost
           fullscreen above the layer was never seen. Both the root owner and the game's own top-level window count. */
        IntPtr gameTop=Target!=IntPtr.Zero?GetAncestor(Target,2):IntPtr.Zero;if(gameTop==IntPtr.Zero)gameTop=gameRoot;
        bool below=false;int steps=0;for(IntPtr h=GetWindow(Overlay,3);h!=IntPtr.Zero&&steps<400;h=GetWindow(h,3),steps++)if(h==gameRoot||h==gameTop){below=true;break;}
        // Raise only over the foreground game. Menus and foreign applications always use ordinary z-order.
        // Some game renderers draw over an inactive ordinary window even after HWND_TOP.
        // Menu open: made topmost at once (not only after the game got above it), so a click on the game cannot cover it.
        // Another application in front (Alt+Tab): the layer stays directly above the game, below that application.
        if(!front){if(!below)return;IntPtr above=GetWindow(gameTop,3);if(above==Overlay)return;SetWindowPos(Overlay,above==IntPtr.Zero?IntPtr.Zero:above,0,0,0,0,0x0001|0x0002|0x0010);
            Emit(new{type="coverDebug",text="Alt+T 菜单打开、前台是其他程序：阅读层放回游戏正上方"});return;}
        if(menu&&(GetWindowLong(Overlay,-20)&8)==0)below=true;
        if(!below)return;
        // Menu open: topmost, so neither clicking the game nor focusing another MeguLit window puts the menu under the game.
        SetWindowPos(Overlay,menu||GetAncestor(GetForegroundWindow(),3)==gameRoot?new IntPtr(-1):IntPtr.Zero,0,0,0,0,0x0001|0x0002|0x0010);
        Emit(new{type="coverDebug",text=menu?"Alt+T 菜单打开：阅读层固定到游戏上方":"阅读层已移到前台游戏上方"});}
    /* P0 2026-11-13 (user, ファタモルガーナの館 full screen: the game flashed and kept dropping to the desktop; Alt+T sent it
       to the desktop). A full-screen game (its window covers its whole monitor: KiriKiri fsmethod=cds, TOPMOST popup, E533)
       minimises itself as soon as it loses the foreground. MeguLit then must never take the foreground from it: the overlay
       stays WS_EX_NOACTIVATE also with the Alt+T menu open, the menu is never focused, a minimised overlay is shown without
       activation. The menu works by mouse; the game keeps the keyboard. */
    public static bool CoversMonitor(int l,int t,int r,int b,int ml,int mt,int mr,int mb){return r-l>=mr-ml&&b-t>=mb-mt&&l<=ml&&t<=mt&&r>=mr&&b>=mb;}
    public static bool OverlayMayActivate(bool fullscreenGame,bool bound,bool menu){return !(bound&&fullscreenGame)&&menu;}
    static bool FullscreenTarget(){try{if(Target==IntPtr.Zero||!IsWindow(Target))return false;IntPtr root=GetAncestor(Target,2);Rect w;if(root==IntPtr.Zero||!GetWindowRect(root,out w))return false;var m=System.Windows.Forms.Screen.FromHandle(root).Bounds;return CoversMonitor(w.Left,w.Top,w.Right,w.Bottom,m.Left,m.Top,m.Right,m.Bottom);}catch{return false;}}
    public static bool ReadingVisible(bool context,bool gameMinimized,bool overlayMinimized,bool cover,bool dialogue,bool menu){return context&&!gameMinimized&&!overlayMinimized&&(menu||(cover&&dialogue));}
    static void FocusMenuOnce(){
        if(!MenuOpen||!MenuRegionReady||!MenuFocusPending)return;
        if(TranslationMode&&FullscreenTarget()){MenuFocusPending=false;return;}
        IntPtr foreground=GetAncestor(GetForegroundWindow(),3),overlayRoot=GetAncestor(Overlay,3),gameRoot=Target==IntPtr.Zero?IntPtr.Zero:GetAncestor(Target,3);
        // A queued menu-open must not pull the keyboard back after the user switched applications.
        uint foregroundPid;GetWindowThreadProcessId(GetForegroundWindow(),out foregroundPid);bool ownHome=PreferredOverlay!=IntPtr.Zero&&foregroundPid==(uint)OverlayPid;
        if(IsIconic(Overlay)||(foreground!=overlayRoot&&foreground!=gameRoot&&!ownHome)){MenuFocusPending=false;return;}
        if((GetAsyncKeyState(0x12)&0x8000)!=0)return;
        MenuFocusPending=false;if(foreground!=overlayRoot)SetForegroundWindow(Overlay);
    }
    // One startup.log line ("Visibility: ...") each time the bridge hides the MeguLit window, with the deciding state.
    static void HideReason(string why){Emit(new{type="coverDebug",text="阅读层隐藏 ("+(TranslationMode?"translation":"normal")+", target="+(Target!=IntPtr.Zero)+") "+why});}
    static void ToggleInterface(){if((DateTime.UtcNow-LastModeToggle).TotalMilliseconds<180)return;LastModeToggle=DateTime.UtcNow;InterfaceMode(!TranslationMode,true);}
    // Alt+M: ask the page first so it can play the leaving half of the transition, then it sends "toggleMode".
    // If the page does not answer in time (busy or an older page script), switch anyway.
    static DateTime ModeRequestAt=DateTime.MinValue,ModeFallbackAt=DateTime.MinValue;
    static void RequestModeToggle(){if(PreferredOverlay!=IntPtr.Zero&&!TranslationMode&&Target==IntPtr.Zero){ManualBindUntil=DateTime.UtcNow.AddSeconds(20);NextAutoBind=DateTime.MinValue;Emit(new{type="bindPending"});return;}if(ModeRequestAt!=DateTime.MinValue&&(DateTime.UtcNow-ModeRequestAt).TotalMilliseconds<1500)return;ModeRequestAt=DateTime.UtcNow;Emit(new{type="modeRequest",interfaceMode=TranslationMode?"normal":"translation"});}
    static void ModeRequestTick(){if(ModeRequestAt!=DateTime.MinValue&&(DateTime.UtcNow-ModeRequestAt).TotalMilliseconds>900){ModeRequestAt=DateTime.MinValue;ModeFallbackAt=DateTime.UtcNow;LastModeToggle=DateTime.MinValue;ToggleInterface();}}
    static void PageToggleMode(){if(ModeRequestAt==DateTime.MinValue&&(DateTime.UtcNow-ModeFallbackAt).TotalMilliseconds<1500)return;ModeRequestAt=DateTime.MinValue;LastModeToggle=DateTime.MinValue;ToggleInterface();}
    static void Settings(Dictionary<string,object> d){X=Num(d,"x",X);Y=Num(d,"y",Y);W=Num(d,"width",W);H=Num(d,"height",H);if(TextMask!=null)TextMask.Configure(d);if(WaitMarker!=null)WaitMarker.Configure(d);}
    static void ToggleCover(){
        if((DateTime.UtcNow-LastCoverToggle).TotalMilliseconds<180)return;
        LastCoverToggle=DateTime.UtcNow;CoverEnabled=!CoverEnabled;
        if(!CoverEnabled)LookupOpen=false;
        Emit(new{type="cover",coverEnabled=CoverEnabled,message=CoverEnabled?"MeguLit 覆盖已显示；Alt+H 可隐藏":"MeguLit 覆盖已隐藏；Alt+H 可恢复"});
    }
    static void Command(Dictionary<string,object> d){
        string type=Str(d,"type");object value;
        if(type=="dialogConfig"){VisualDetection=Bool(d,"active");SceneDetection=Bool(d,"scene");if(!SceneDetection)Scene.Reset();if(WaitMarker!=null)WaitMarker.PresenceWanted=Bool(d,"marker");if(!VisualDetection){Dialog.Reset();DialogVisible=true;}}
        else if(type=="dialogCalibrate"){Rect rect;if(Target!=IntPtr.Zero&&GetClientRect(Target,out rect)){bool success=Dialog.Calibrate(Target,rect.Right,rect.Bottom,Num(d,"x",2),Num(d,"y",58),Num(d,"width",96),Num(d,"height",2));Emit(new{type="dialogCalibration",success=success,message=success?"已记录对话框边缘，请勿把人物或字幕放入检测区域":"无法取得游戏画面"});}}
        else if(type=="windows")ThreadPool.QueueUserWorkItem(delegate{try{Emit(new{type="windows",windows=Windows()});}catch{}}); // read-only and slow (a process lookup per window): kept off the loop so the menu's region is not held up
        else if(type=="gameUi"){object rows;GameUi.Set(Target,d.TryGetValue("items",out rows)?rows as System.Collections.ArrayList:null,Bool(d,"preview"));}
        else if(type=="dialogSceneLine"){Scene.Line();GameUi.Clear();}
        else if(type=="dialogVisibility"){DialogVisible=Bool(d,"visible");}
        else if(type=="hookVerify"){if(HookVerifier!=null)HookVerifier.Request(Target,d);}
        else if(type=="choiceLocate"){object list;var options=new List<string>();if(d.TryGetValue("options",out list)&&list is System.Collections.ArrayList)foreach(object o in (System.Collections.ArrayList)list){string t=Convert.ToString(o);if(!String.IsNullOrWhiteSpace(t)&&t.Length<=120&&options.Count<12)options.Add(t);}if(PageLocate!=null&&Target!=IntPtr.Zero)PageLocate.RequestChoices(Target,options);}
        else if(type=="pageLocate"){if(PageLocate!=null&&Target!=IntPtr.Zero)PageLocate.Request(Target,Str(d,"text"),Bool(d,"art"));}
        /* 2026-11-12 art scan (OCR read path): MeguLit asks for it while no hook line is current; PageLocator reads the picture and emits artText */
        else if(type=="artScan"){if(PageLocate!=null)PageLocate.Scan(Target,Bool(d,"on")&&Target!=IntPtr.Zero,Str(d,"dialog"),Str(d,"speaker"),Bool(d,"band"),Bool(d,"foreign"));}
        else if(type=="maskAssist"){if(TextMask!=null)TextMask.Assist(Str(d,"source"));}
        else if(type=="hookVerifyCancel"){if(HookVerifier!=null)HookVerifier.Cancel();}
        else if(type=="gameAudio"){AudioWanted=Bool(d,"enabled");uint pid=0;if(AudioWanted&&Target!=IntPtr.Zero)GetWindowThreadProcessId(Target,out pid);if(AudioWanted&&pid!=0)Audio.Start(pid);else if(!AudioWanted)Audio.Stop();}
        else if(type=="sceneShot"){string id=Str(d,"id");IntPtr target=Target;
            ThreadPool.QueueUserWorkItem(delegate{string jpeg="",hash="";double score=0;try{Rect rect;if(target!=IntPtr.Zero&&GetClientRect(target,out rect))jpeg=GameAudio.SceneShot(target,rect.Right,rect.Bottom,out score,out hash);}catch{}
                try{Emit(new{type="sceneShot",id=id,jpeg=jpeg,score=score,hash=hash});}catch{}});}
        /* 2026-11-13 collected sentence pictures: a full clean frame (asked only while the dialogue box is hidden) and a cheap probe of the top hash */
        else if(type=="sceneFrame"){string id=Str(d,"id");IntPtr target=Target;
            ThreadPool.QueueUserWorkItem(delegate{string jpeg="",hash="";double score=0;try{Rect rect;if(target!=IntPtr.Zero&&GetClientRect(target,out rect))jpeg=GameAudio.SceneFrame(target,rect.Right,rect.Bottom,out score,out hash);}catch{}
                try{Emit(new{type="sceneFrame",id=id,jpeg=jpeg,score=score,topHash=hash});}catch{}});}
        else if(type=="sceneProbe"){string id=Str(d,"id");IntPtr target=Target;
            ThreadPool.QueueUserWorkItem(delegate{string hash="";try{Rect rect;if(target!=IntPtr.Zero&&GetClientRect(target,out rect))hash=GameAudio.SceneProbe(target,rect.Right,rect.Bottom);}catch{}
                try{Emit(new{type="sceneProbe",id=id,topHash=hash});}catch{}});}
        else if(type=="mediaClip"){string id=Str(d,"id");long from=(long)Num(d,"from",0),to=(long)Num(d,"to",0);bool shot=Bool(d,"screenshot"),readerShot=Bool(d,"readerScreenshot");IntPtr target=Target,readerWindow=Overlay;
            var readerArea=new System.Drawing.Rectangle((int)Num(d,"readerX",0),(int)Num(d,"readerY",0),(int)Num(d,"readerWidth",0),(int)Num(d,"readerHeight",0));
            ThreadPool.QueueUserWorkItem(delegate{string wav="",jpeg="";bool voiced=false;try{var voice=GameAudio.Voice(Audio.Range(from,to));if(voice!=null){voiced=true;wav=Convert.ToBase64String(GameAudio.Wav(voice));}
                }catch{}
                try{Rect rect;if(shot&&target!=IntPtr.Zero&&GetClientRect(target,out rect))jpeg=readerShot?ReaderScreenshot.Capture(target,readerWindow,readerArea):GameAudio.Screenshot(target,rect.Right,rect.Bottom);}catch{}
                try{Emit(new{type="mediaClip",id=id,voiced=voiced,wav=wav,jpeg=jpeg,recording=Audio.Active,audioError=Audio.Error});}catch{}});}
        else if(type=="markerSource"){if(WaitMarker!=null)WaitMarker.SetSource(Str(d,"text"));}
        else if(type=="markerHookDrawn"){if(WaitMarker!=null)WaitMarker.HookDrawn();}
        else if(type=="source"){if(TextMask!=null)TextMask.SetSource(Str(d,"text"));if(WaitMarker!=null)WaitMarker.SetSource(Str(d,"text"));}
        else if(type=="toggleCover")ToggleCover();
        else if(type=="toggleMode")PageToggleMode();
        else if(type=="enterGame")EnterGamePending=true;
        else if(type=="expectExecutable"){WantedExecutable=Str(d,"path");NextAutoBind=DateTime.MinValue;}
        // MeguLit launched this process and saw its window come up: bind to its largest visible window right away.
        // If none is usable yet, remember the process (name + exact image) so the auto-bind loop picks it up.
        else if(type=="bindProcess"){uint pid=(uint)Int64.Parse(Str(d,"pid"));IntPtr best=IntPtr.Zero;long bestArea=0;
            EnumWindows(delegate(IntPtr candidate,IntPtr unused){uint owner;GetWindowThreadProcessId(candidate,out owner);Rect r;
                if(owner==pid&&candidate!=Overlay&&IsWindowVisible(candidate)&&!IsIconic(candidate)&&GetClientRect(candidate,out r)){long area=(long)r.Right*r.Bottom;if(area>bestArea){bestArea=area;best=candidate;}}return true;},IntPtr.Zero);
            string name=ProcessName(pid),image=ProcessImage(pid);if(name!="")WantedProcess=name;if(image!="")WantedExecutable=image;NextAutoBind=DateTime.MinValue;
            if(best!=IntPtr.Zero&&bestArea>=320L*240&&Target!=best){try{Bind(best);}catch{}}}
        else if(type=="bind"){WantedExecutable="";FindOverlay();if(Overlay!=IntPtr.Zero&&IsIconic(Overlay))ShowWindow(Overlay,4);if(d.TryGetValue("settings",out value)&&value is Dictionary<string,object>)Settings((Dictionary<string,object>)value);bool keepMenu=MenuOpen;InterfaceMode(true,false);if(keepMenu){MenuOpen=true;MenuFocusPending=true;}Bind(new IntPtr(Int64.Parse(Str(d,"hwnd"))),true);}
        else if(type=="configure"){if(!ModeConfigured&&d.ContainsKey("interfaceMode")){ModeConfigured=true;InterfaceMode(Str(d,"interfaceMode")=="translation",false);}Settings(d);WantedProcess=Bool(d,"bindEnabled")?Str(d,"gameProcess"):"";if(!Bool(d,"bindEnabled")&&(Target!=IntPtr.Zero||TrackedGame!=null)){RevealGame(Target);ForgetGame();Target=IntPtr.Zero;Restore();Emit(new{type="bound",bound=false,message="已解除窗口绑定"});}}
        else if(type=="unbind"){WantedExecutable="";WantedProcess="";RevealGame(Target);ForgetGame();Target=IntPtr.Zero;Restore();Emit(new{type="bound",bound=false,message="已解除窗口绑定"});}
        // The page passes where the button went down, so the strip stays under the same spot of the cursor even though
        // the drag only starts after a few pixels of movement.
        else if(type=="floatDrag"){if(TranslationMode&&Target==IntPtr.Zero&&Overlay!=IntPtr.Zero&&GetCursorPos(out DragStart)&&GetWindowRect(Overlay,out DragRect)){if(d.ContainsKey("x")&&d.ContainsKey("y")){DragStart.X=(int)Num(d,"x",DragStart.X);DragStart.Y=(int)Num(d,"y",DragStart.Y);}Dragging=true;}}
        else if(type=="menu"){bool open=Bool(d,"open");if(open!=MenuOpen)RegionAckPending=false;if(open&&!MenuOpen){MenuFocusPending=true;FindOverlay();if(Overlay!=IntPtr.Zero&&IsIconic(Overlay))ShowWindow(Overlay,4);}bool returning=MenuOpen&&!open&&TranslationMode&&Target!=IntPtr.Zero&&GetAncestor(GetForegroundWindow(),2)==Overlay;MenuOpen=open;ReaderActivationPolicy();RefreshReaderPointer();if(returning)SetForegroundWindow(GetAncestor(Target,2));if(!open){MenuRegionReady=false;MenuFocusPending=false;}if(open&&!TranslationMode&&PreferredOverlay==IntPtr.Zero){FindOverlay();if(Overlay!=IntPtr.Zero){
            // Only when needed: re-showing and re-activating the already visible, already active main window made it
            // hide and reappear once (with the Windows open animation) on the first menu after start.
            bool keepGame=FullscreenTarget()&&GetAncestor(GetForegroundWindow(),3)==GetAncestor(Target,3);if(!IsWindowVisible(Overlay))ShowWindow(Overlay,keepGame?4:5);if(!keepGame&&GetAncestor(GetForegroundWindow(),3)!=GetAncestor(Overlay,3))SetForegroundWindow(Overlay);IsShown=true;MenuFocusPending=false;}}}
        else if(type=="hitRegions"){MenuRegionReady=Bool(d,"menuOpen");RegionAckPending=MenuRegionReady;HitRegions.Clear();object regions;if(d.TryGetValue("regions",out regions)&&regions is System.Collections.ArrayList){foreach(object item in (System.Collections.ArrayList)regions){var rect=item as Dictionary<string,object>;if(rect==null||HitRegions.Count>=256)continue;double x=Num(rect,"x",0),y=Num(rect,"y",0),w=Num(rect,"width",0),h=Num(rect,"height",0);if(w>0&&h>0&&w<=16384&&h<=16384&&Math.Abs(x)<32768&&Math.Abs(y)<32768)HitRegions.Add(new HitRegion{Bounds=new Rect((int)x,(int)y,(int)(x+w),(int)(y+h)),Pass=Bool(rect,"pass")});}}
            // Over a bound game apply the new region right away instead of in the next tick (which also captures the game
            // for text and marker detection and made the menu wait ~170 ms before it could open).
            if(TranslationMode&&Target!=IntPtr.Zero&&Overlay!=IntPtr.Zero&&Captured&&HasLastRect&&IsShown){ApplyRegion(LastRect.Right-LastRect.Left,LastRect.Bottom-LastRect.Top);AckRegion();}RefreshReaderPointer();}
        else if(type=="glass")GlassCommand(d);
        else if(type=="lookup"){bool open=Bool(d,"open")&&TranslationMode&&CoverEnabled;if(open!=LookupOpen){LookupOpen=open;HasLastRect=false;Rect client;if(Overlay!=IntPtr.Zero&&IsShown&&GetClientRect(Overlay,out client))ApplyRegion(client.Right,client.Bottom);RefreshReaderPointer();}}
        else if(type=="quit")Running=false;
    }
    static bool ReaderMouseDown,ReaderSpaceDown,ReaderEnterDown,ReaderSkipHeld;
    static bool ReaderOwnsPointer(){Point screen,origin=new Point();if(Overlay==IntPtr.Zero||!IsShown||!GetCursorPos(out screen)||!ClientToScreen(Overlay,ref origin))return false;
        int x=screen.X-origin.X,y=screen.Y-origin.Y;return HitRegions.Exists(h=>!h.Pass&&x>=h.Bounds.Left&&x<h.Bounds.Right&&y>=h.Bounds.Top&&y<h.Bounds.Bottom);}
    static ReaderPointerGate PointerGate;
    static IntPtr NoActivateWindow;
    static void ReaderActivationPolicy(){
        IntPtr window=Overlay;
        bool reading=window!=IntPtr.Zero&&TranslationMode&&Target!=IntPtr.Zero&&!OverlayMayActivate(FullscreenTarget(),true,MenuOpen);
        if(NoActivateWindow!=IntPtr.Zero&&(NoActivateWindow!=window||!reading)){
            if(IsWindow(NoActivateWindow))SetWindowLong(NoActivateWindow,-20,GetWindowLong(NoActivateWindow,-20)&~0x08000000);
            NoActivateWindow=IntPtr.Zero;
        }
        if(reading){
            int style=GetWindowLong(window,-20);
            if((style&0x08000000)==0)SetWindowLong(window,-20,style|0x08000000);
            NoActivateWindow=window;
        }
    }
    static void RefreshReaderPointer(){
        if(PointerGate==null)return;
        Rect client;
        if(!TranslationMode||MenuOpen||Overlay==IntPtr.Zero||!IsShown||!GetClientRect(Overlay,out client)){
            PointerGate.Current=null;return;
        }
        /* Issue #133 (WHITE ALBUM2: clicking a word went to the next line). The overlay floated unbound (Target zero), the
           gate was off, and the game, which polls the mouse button, took the click as well. Unbound, the gate still owns
           clicks on MeguLit's own text regions (never the whole overlay), so a polling game under it never sees them. */
        if(Target==IntPtr.Zero){PointerGate.Current=new ReaderPointerGate.Context(Overlay,IntPtr.Zero,client,false,HitRegions.FindAll(h=>!h.Pass).ConvertAll(h=>h.Bounds).ToArray());return;}
        PointerGate.Current=new ReaderPointerGate.Context(Overlay,GetAncestor(Target,2),client,LookupOpen,HitRegions.FindAll(h=>!h.Pass).ConvertAll(h=>h.Bounds).ToArray());
    }
    static void ReaderInputTick(bool foregroundGame){ReaderActivationPolicy();RefreshReaderPointer();
        bool mouse=(GetAsyncKeyState(0x01)&0x8000)!=0,space=(GetAsyncKeyState(0x20)&0x8000)!=0,enter=(GetAsyncKeyState(0x0d)&0x8000)!=0;
        bool allowed=foregroundGame&&!MenuOpen&&!LookupOpen&&CoverEnabled&&!IsIconic(Target);
        bool complete=allowed&&((mouse&&!ReaderMouseDown&&!ReaderOwnsPointer())||(space&&!ReaderSpaceDown)||(enter&&!ReaderEnterDown));
        bool skip=allowed&&(GetAsyncKeyState(0x11)&0x8000)!=0;
        ReaderMouseDown=mouse;ReaderSpaceDown=space;ReaderEnterDown=enter;
        if(complete||skip!=ReaderSkipHeld)Emit(new{type="readerInput",complete=complete,skipHeld=skip});
        ReaderSkipHeld=skip;
    }
    static void Tick(){
        if(HookVerifier!=null)HookVerifier.Tick();
        FindOverlay();if(Overlay==IntPtr.Zero)return;
        if(CheckGameExit())return;
        // Demote inherited/older topmost state in every mode, including minimised or foreign-application states.
        bool foregroundGame=TranslationMode&&Target!=IntPtr.Zero&&IsWindow(Target)&&!IsIconic(Overlay)&&GetAncestor(GetForegroundWindow(),3)==GetAncestor(Target,3);
        ReaderInputTick(foregroundGame);
        bool sceneInput=foregroundGame&&!MenuOpen&&!LookupOpen&&((GetAsyncKeyState(0x01)<0||GetAsyncKeyState(0x02)<0)&&!ReaderOwnsPointer()||GetAsyncKeyState(0x1B)<0||GetAsyncKeyState(0x20)<0||GetAsyncKeyState(0x0D)<0);
        if(sceneInput&&!ReaderMenuDown){GameUi.Clear();if(SceneDetection)Scene.Input();}ReaderMenuDown=sceneInput;
        if(SceneDetection&&foregroundGame&&GetAsyncKeyState(0x11)<0)Scene.Input();
        Rect uiRect;var uiOrigin=new Point();
        if(Target!=IntPtr.Zero&&GetClientRect(Target,out uiRect)&&ClientToScreen(Target,ref uiOrigin))GameUi.Tick(Target,new System.Drawing.Rectangle(uiOrigin.X,uiOrigin.Y,uiRect.Right,uiRect.Bottom),foregroundGame&&!MenuOpen&&!LookupOpen&&!IsIconic(Target));
        else GameUi.Clear();
        if(SceneDetection&&foregroundGame&&!MenuOpen&&!LookupOpen&&CoverEnabled&&Target!=IntPtr.Zero&&!GameCapture.Busy(Target)){
            Rect sceneRect;var sceneOrigin=new Point();if(GetClientRect(Target,out sceneRect)&&ClientToScreen(Target,ref sceneOrigin)){
                /* E322: the game window itself, never the screen with MeguLit's own layer on it */string kept=Scene.Reason;bool? present=Scene.Tick(Target,sceneRect.Right,sceneRect.Bottom);if(present.HasValue)Emit(new{type="dialogScene",visible=present.Value,reason=Scene.Reason});else if(Scene.Reason!=kept&&Scene.Reason.StartsWith("kept"))Emit(new{type="dialogSceneKept",reason=Scene.Reason});
            }
        }
        // Alt+T menu open over a bound game: the layer stays above the game whatever is in front (user, 2026-11-03: dragging
        // between MeguLit and the menu, the foreground checks below demoted or hid it and the menu fell under the game).
        uint hostForegroundPid;GetWindowThreadProcessId(GetForegroundWindow(),out hostForegroundPid);
        uint hostGamePid=0;if(Target!=IntPtr.Zero)GetWindowThreadProcessId(Target,out hostGamePid);
        bool hostContext=hostForegroundPid==(uint)OverlayPid||hostForegroundPid==hostGamePid||ImeHost(ProcessName(hostForegroundPid));
        bool menuPinned=TranslationMode&&Target!=IntPtr.Zero&&MenuOpen&&MenuRegionReady&&hostContext;
        if(!foregroundGame&&!menuPinned&&(GetWindowLong(Overlay,-20)&8)!=0)SetWindowPos(Overlay,new IntPtr(-2),0,0,0,0,0x0001|0x0002|0x0010);
        if(IsIconic(Overlay)){MenuFocusPending=false;if(MaskLayer!=null)MaskLayer.Hide();if(TextMask!=null)TextMask.Hide();if(WaitMarker!=null)WaitMarker.Hide();return;}
        if(Dragging)DragTick();
        // Keep the current surface during the first menu construction instead of hiding and immediately showing it again.
        if(TranslationMode&&MenuOpen&&!MenuRegionReady)return;
        // A closed or restarted game must be noticed in every mode; this check used to run only in translation mode,
        // so after a game restart in normal mode the hook kept targeting the dead process and never rebound.
        if(Target!=IntPtr.Zero&&!IsWindow(Target)){Target=IntPtr.Zero;Restore();Emit(new{type="bound",bound=false,message="游戏窗口已关闭，等待再次启动"});}
        if(Target==IntPtr.Zero&&WantedProcess!=""&&DateTime.UtcNow>=NextAutoBind){
            NextAutoBind=DateTime.UtcNow.AddSeconds(1);
            // Never enumerate the names of every desktop process 10 times a second while a game is minimised.
            // Resolve the remembered process once, then inspect only its windows without activating/restoring them.
            var pids=new HashSet<uint>();foreach(var process in Process.GetProcessesByName(WantedProcess))using(process){try{if(WantedExecutable==""||String.Equals(ProcessImage((uint)process.Id),WantedExecutable,StringComparison.OrdinalIgnoreCase))pids.Add((uint)process.Id);}catch{}}
            IntPtr bestWindow=IntPtr.Zero;long bestArea=0;
            if(pids.Count>0)EnumWindows(delegate(IntPtr candidate,IntPtr unused){uint pid;GetWindowThreadProcessId(candidate,out pid);Rect r;
                if(pids.Contains(pid)&&IsWindowVisible(candidate)&&!IsIconic(candidate)&&GetClientRect(candidate,out r)){long candidateArea=(long)r.Right*r.Bottom;if(candidateArea>bestArea){bestArea=candidateArea;bestWindow=candidate;}}return true;},IntPtr.Zero);
            if(bestWindow!=IntPtr.Zero&&bestArea>=320L*240)Bind(bestWindow);}
        if((EnterGamePending||DateTime.UtcNow<ManualBindUntil)&&Target!=IntPtr.Zero){EnterGamePending=false;ManualBindUntil=DateTime.MinValue;InterfaceMode(true,false);}
        if(PreferredOverlay!=IntPtr.Zero&&(!TranslationMode||Target==IntPtr.Zero)){
            var desktop=System.Windows.Forms.SystemInformation.VirtualScreen;Rect hosted;
            if(GetWindowRect(Overlay,out hosted)&&(hosted.Left!=desktop.Left||hosted.Top!=desktop.Top||hosted.Right!=desktop.Right||hosted.Bottom!=desktop.Bottom-1)){
                SetWindowPos(Overlay,IntPtr.Zero,desktop.Left,desktop.Top,desktop.Width,Math.Max(1,desktop.Height-1),0x0004|0x0010);RegionKey="";
            }
            if(TextMask!=null)TextMask.Hide();if(WaitMarker!=null)WaitMarker.Hide();if(MenuOpen&&MenuRegionReady&&HitRegions.Count>0){Rect menuClient;if(GetClientRect(Overlay,out menuClient))ApplyRegion(menuClient.Right,menuClient.Bottom);if(!IsWindowVisible(Overlay))SetWindowPos(Overlay,IntPtr.Zero,0,0,0,0,0x0001|0x0002|0x0010|0x0040);IsShown=true;AckRegion();FocusMenuOnce();}else{if(IsWindowVisible(Overlay))ShowWindow(Overlay,0);IsShown=false;}return;}
        if(!TranslationMode){if((GetWindowLong(Overlay,-20)&8)!=0)SetWindowPos(Overlay,new IntPtr(-2),0,0,0,0,0x0001|0x0002|0x0010);if(TextMask!=null)TextMask.Hide();if(WaitMarker!=null)WaitMarker.Hide();if(DateTime.UtcNow<NormalShowUntil&&!IsWindowVisible(Overlay)){ShowWindow(Overlay,4);IsShown=true;}KeepPlacement();return;}
        if(Target==IntPtr.Zero){
            Capture();if(!FloatingPlaced){Rect r=FloatingBase();SetWindowPos(Overlay,IntPtr.Zero,r.Left+FloatDX,r.Top+FloatDY,r.Right-r.Left,r.Bottom-r.Top,0x0020|0x0010);FloatingPlaced=true;}
            Rect floatingClient;if(GetClientRect(Overlay,out floatingClient))ApplyRegion(floatingClient.Right,floatingClient.Bottom);
            if(!CoverEnabled&&!(MenuOpen&&MenuRegionReady)){if(IsShown)HideReason("floating, cover off");ShowWindow(Overlay,0);IsShown=false;}else if(!IsShown){ShowWindow(Overlay,4);IsShown=true;}
            if(IsShown)AckRegion();
            FocusMenuOnce();
        }
        if(Target==IntPtr.Zero){if(TextMask!=null)TextMask.Hide();if(WaitMarker!=null)WaitMarker.Hide();return;}
        if(!IsWindow(Target)){Target=IntPtr.Zero;Restore();Emit(new{type="bound",bound=false,message="游戏窗口已关闭，等待再次启动"});return;}
        IntPtr fg=GetAncestor(GetForegroundWindow(),3),gameRoot=GetAncestor(Target,3),overlayRoot=GetAncestor(Overlay,3);
        Rect probeRect;if(VisualDetection&&GetClientRect(Target,out probeRect)){bool? presence=Dialog.Tick(Target,probeRect.Right,probeRect.Bottom);if(presence.HasValue)Emit(new{type="dialogEvidence",visible=presence.Value});}
        // The game's own popups (IME candidate list, dialogs) belong to its process but not to its window tree: the IME
        // list of a Chinese input method used to hide the whole reading layer as "fg=other" in Subahibi.
        uint fgPid=0,gamePid=0;GetWindowThreadProcessId(GetForegroundWindow(),out fgPid);GetWindowThreadProcessId(Target,out gamePid);bool gameOwned=fg==gameRoot||(fgPid!=0&&(fgPid==gamePid||ImeHost(ProcessName(fgPid))));
        bool homeOwned=PreferredOverlay!=IntPtr.Zero&&fgPid==(uint)OverlayPid&&fg!=overlayRoot;bool contextActive=gameOwned||fg==overlayRoot||homeOwned;bool visible=ReadingVisible(contextActive||menuPinned,IsIconic(Target),IsIconic(Overlay),CoverEnabled,DialogVisible,MenuOpen&&MenuRegionReady);
        if(!contextActive)MenuFocusPending=false;
        // Another application in front: never topmost, also with the menu open (it stays visible, just above the game;
        // KeepAboveGame keeps it there). Topmost over everything after Alt+Tab was wrong (user, 2026-11-03).
        if(!contextActive&&(GetWindowLong(Overlay,-20)&8)!=0)SetWindowPos(Overlay,new IntPtr(-2),0,0,0,0,0x0001|0x0002|0x0010);
        if(!visible){if(IsShown){HideReason("menu="+MenuOpen+"/"+MenuRegionReady+" cover="+CoverEnabled+" dialog="+DialogVisible+" iconic="+IsIconic(Target)+" fg="+(fg==gameRoot?"game":fg==overlayRoot?"overlay":"other"));ShowWindow(Overlay,0);}IsShown=false;if(TextMask!=null)TextMask.Hide();
            // Hidden only because no dialogue was detected: keep looking for the wait marker, so its return brings the layer back.
            Rect probeClient;Point probeOrigin=new Point();
            if(WaitMarker!=null&&WaitMarker.PresenceWanted&&!DialogVisible&&CoverEnabled&&!IsIconic(Target)&&GetClientRect(Target,out probeClient)&&ClientToScreen(Target,ref probeOrigin)){WaitMarker.ProbeOnly=true;WaitMarker.ScreenX=probeOrigin.X;WaitMarker.ScreenY=probeOrigin.Y;WaitMarker.Tick(Target,probeClient.Right,probeClient.Bottom,true,0,0);}
            else if(WaitMarker!=null)WaitMarker.Hide();
            return;}
        // Bind() only captures the window frame when already in translation mode. Auto-binding at startup happens in normal mode,
        // so the later Alt+M switch left the title bar in place and the hit region was applied offset, cutting glyphs apart.
        if(!Captured){Capture();HasLastRect=false;RegionKey="";}
        Rect client;if(!GetClientRect(Target,out client))return;Point origin=new Point();if(!ClientToScreen(Target,ref origin))return;
        Rect area=new Rect(origin.X,origin.Y,origin.X+client.Right,origin.Y+client.Bottom);Rect scaledArea;bool magpie=MagpieArea(GetAncestor(Target,2),area,out scaledArea);if(magpie)area=scaledArea;else{MagpieWindow=IntPtr.Zero;NativeMaskLayer.Scale(false,0,0,0,0,1,1,IntPtr.Zero);}
        Rect reader=Place(area,X,Y,W,H),box=reader;int layoutX=area.Left,layoutY=area.Top,layoutW=area.Right-area.Left,layoutH=area.Bottom-area.Top;
        
        
        /* The window always covers the whole game client area. Opening the menu or a word card used to resize and move
           it, and the page re-laid out the text one frame later, so the text flashed. Now only the window region changes. */
        // The overlay always spans the desktop while bound (only its region follows the text and menus): switching between
        // the game area and the desktop on every Alt+T resized the WebView, and the text re-laid out a frame later, which
        // showed as a flash. The menu can still be dragged beyond the game; text remains game-relative via the layout.
        box=new Rect(System.Windows.Forms.SystemInformation.VirtualScreen.Left,System.Windows.Forms.SystemInformation.VirtualScreen.Top,System.Windows.Forms.SystemInformation.VirtualScreen.Right,System.Windows.Forms.SystemInformation.VirtualScreen.Bottom-1);
        // One pixel short of the desktop: a monitor-sized window that becomes foreground (Alt+T, a selection) is treated as a
        // fullscreen game by Wallpaper Engine and similar tools, which then pause or black out the wallpaper.
        Rect localReader=new Rect(reader.Left-box.Left,reader.Top-box.Top,reader.Right-box.Left,reader.Bottom-box.Top);
        if(!HasLastRect||localReader.Left!=LastReaderRect.Left||localReader.Top!=LastReaderRect.Top||localReader.Right!=LastReaderRect.Right||localReader.Bottom!=LastReaderRect.Bottom||box.Right-box.Left!=LastRect.Right-LastRect.Left||box.Bottom-box.Top!=LastRect.Bottom-LastRect.Top){var scan=TextMask!=null?TextMask.SurfaceRegion(client.Right,client.Bottom):System.Drawing.Rectangle.Empty;Emit(new{type="layout",clientWidth=layoutW,clientHeight=layoutH,clientX=layoutX-box.Left,clientY=layoutY-box.Top,magpie=magpie,readerX=localReader.Left,readerY=localReader.Top,readerWidth=localReader.Right-localReader.Left,readerHeight=localReader.Bottom-localReader.Top,surfaceWidth=box.Right-box.Left,surfaceHeight=box.Bottom-box.Top,maskX=scan.X-(box.Left-origin.X),maskY=scan.Y-(box.Top-origin.Y)});LastReaderRect=localReader;}
        ApplyRegion(box.Right-box.Left,box.Bottom-box.Top);
        /* 2026-11-13 (live test, game relaunched while bound: the reader stayed at the floating 160x28 spot at the screen bottom and
           the opening and first lines never showed, while the game hid its own text): the cached LastRect said the window
           was already placed. The real window rect is checked too, so a window moved by any other path is put back. */
        Rect placed;bool strayed=HasLastRect&&GetWindowRect(Overlay,out placed)&&(placed.Left!=box.Left||placed.Top!=box.Top||placed.Right!=box.Right||placed.Bottom!=box.Bottom);
        if(strayed||!HasLastRect||!IsShown||box.Left!=LastRect.Left||box.Top!=LastRect.Top||box.Right!=LastRect.Right||box.Bottom!=LastRect.Bottom){SetWindowPos(Overlay,homeOwned?fg:gameOwned?new IntPtr(-1):IntPtr.Zero,box.Left,box.Top,box.Right-box.Left,box.Bottom-box.Top,(uint)(0x0010|0x0040|(!HasLastRect?0x0020:0)));LastRect=box;HasLastRect=true;}IsShown=true;AckRegion();
        FocusMenuOnce();
        if(homeOwned&&LastHomeForeground!=fg)SetWindowPos(Overlay,fg,0,0,0,0,0x0001|0x0002|0x0010);
        LastHomeForeground=homeOwned?fg:IntPtr.Zero;
        KeepAboveGame(gameRoot,contextActive&&!homeOwned);
        if(magpie&&contextActive&&!homeOwned&&(DateTime.UtcNow-MagpieRaisedAt).TotalMilliseconds>250){MagpieRaisedAt=DateTime.UtcNow;SetWindowPos(Overlay,new IntPtr(-1),0,0,0,0,0x0001|0x0002|0x0010);}
        /* Magpie pauses while its source window is not in front: outside the Alt+T menu (which needs the keyboard and hands focus back when it closes) the reading layer never keeps the foreground from the scaled game. */
        if(magpie&&!MenuOpen&&fg==overlayRoot&&(DateTime.UtcNow-MagpieFocusAt).TotalMilliseconds>400){MagpieFocusAt=DateTime.UtcNow;SetForegroundWindow(gameRoot);}
        MaskLayer.Origin(Overlay,Target,box.Left,box.Top);
        if(TextMask!=null)TextMask.Tick(Target,origin.X,origin.Y,client.Right,client.Bottom,CoverEnabled,box.Left-origin.X,box.Top-origin.Y);
        if(WaitMarker!=null){WaitMarker.ProbeOnly=false;WaitMarker.ScreenX=origin.X;WaitMarker.ScreenY=origin.Y;WaitMarker.Tick(Target,client.Right,client.Bottom,CoverEnabled,box.Left-origin.X,box.Top-origin.Y);}
    }
    public static int Main(string[] args){
        Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
        if(args.Length>0&&args[0]=="--host-frame-self-test"){
            int original=0x16cf0000,hosted=HostedStyle(original);
            if((hosted&0x00c40000)!=0||(hosted&unchecked((int)0x80000000))==0||HostedStyle(hosted)!=hosted)return 8;
            Emit(new{type="host-frame-selftest",passed=true,noCaption=true,noResizeFrame=true,popup=true});return 0;
        }
        if(args.Length>0&&args[0]=="--game-window-policy-self-test"){
            using(var fixture=new System.Windows.Forms.Form()){fixture.Text="MeguLit hidden game fixture";Target=fixture.Handle;TrackedGame=Process.GetCurrentProcess();TrackedGameStarted=TrackedGame.StartTime.ToUniversalTime().Ticks;WindowGoneAt=DateTime.UtcNow.AddSeconds(-10);
                bool preserved=!CheckGameExit()&&WindowGoneAt==DateTime.MinValue;
                ForgetGame();Target=IntPtr.Zero;if(!preserved)return 9;
                Emit(new{type="game-window-policy-selftest",passed=true,hiddenWindowPreserved=true});return 0;
            }
        }
        if(args.Length>=1&&args[0]=="--page-locator-ocr-test"){string r=PageLocator.OcrSelfTest(args.Length>1?args[1]:null);Console.WriteLine(r=="0"?"PASS page locator OCR: three drawn paragraphs found, wrapped where they were drawn, boxes at the drawn margin":(r.StartsWith("skip")?"SKIP "+r:"FAIL page locator OCR: "+r));return r=="0"||r.StartsWith("skip")?0:13;}
        if(args.Length==3&&args[0]=="--choice-file"){Console.OutputEncoding=Encoding.UTF8;Console.Write(PageLocator.ChoiceFile(args[1],args[2]));return 0;}
if(args.Length==2&&args[0]=="--art-scan-file"){Console.OutputEncoding=Encoding.UTF8;Console.Write(PageLocator.ScanFile(args[1]));return 0;}
        if(args.Length>=1&&args[0]=="--art-scan-ocr-test"){string r=PageLocator.ScanOcrSelfTest(args.Length>1?args[1]:null);Console.WriteLine(r=="0"?"PASS art scan OCR: centred opening lines read and grouped, the text box with its name and dialogue left out":(r.StartsWith("skip")?"SKIP "+r:"FAIL art scan OCR: "+r));return r=="0"||r.StartsWith("skip")?0:15;}
        if(args.Length==1&&args[0]=="--art-scan-self-test"){string r=PageLocator.ScanSelfTest();Console.WriteLine(r=="0"?"PASS art scan: Japanese rows outside the dialogue grouped, shown after two reads, hidden after two misses":"FAIL art scan: "+r);return r=="0"?0:14;}
        if(args.Length==1&&args[0]=="--page-locator-self-test"){bool passed=PageLocator.SelfTest();Console.WriteLine(passed?"PASS page locator: hook line aligned to OCR rows, split where the game wrapped, OCR mistakes tolerated, punctuation kept on its row":"FAIL page locator");return passed?0:12;}
        if(args.Length==1&&args[0]=="--wait-page-marker-self-test"){bool passed=WaitPageMarker.SelfTest();Emit(new{type="wait-page-marker-selftest",passed=passed});return passed?0:10;}
        if(args.Length==1&&args[0]=="--reader-pointer-self-test"){bool passed=ReaderPointerGate.SelfTest();Emit(new{type="reader-pointer-selftest",passed=passed});return passed?0:11;}
        if(args.Length>0&&args[0]=="--diagnose"){Diagnose();return 0;}
        if(args.Length==2&&args[0]=="--process-status"){
            string wanted=Path.GetFullPath(args[1]);var matches=new List<object>();
            foreach(var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(wanted)))using(process){try{
                if(String.Equals(ProcessImage((uint)process.Id),wanted,StringComparison.OrdinalIgnoreCase))matches.Add(new{pid=process.Id,visible=HasVisibleWindow((uint)process.Id),started=process.StartTime.ToUniversalTime().Ticks.ToString()});
            }catch{}}
            Emit(new{type="gameProcesses",processes=matches});return 0;
        }
        if(args.Length>0&&args[0]=="--mask-self-test"){
            try{int count=GameTextMask.SelfTest(args.Length>1?args[1]:null);Emit(new{type="mask-selftest",passed=true,words=count,fastPathMilliseconds=GameTextMask.LastFastTestMilliseconds});return 0;}catch(Exception error){Emit(new{type="mask-selftest",passed=false,message=error.Message});return 3;}
        }
        if(args.Length>0&&args[0]=="--mode-self-test"){
            if(!GameSceneProbe.SelfTest())return 6;
            Command(new Dictionary<string,object>{{"type","configure"},{"interfaceMode","translation"}});
            if(!TranslationMode)return 4;
            Command(new Dictionary<string,object>{{"type","configure"},{"interfaceMode","normal"}});
            if(!TranslationMode)return 4;
            ToggleInterface();if(TranslationMode)return 4;
            LastModeToggle=DateTime.MinValue;ToggleInterface();if(!TranslationMode)return 4;
            Emit(new{type="mode-selftest",passed=true,previewCannotSwitchMode=true});return 0;
        }
        if(args.Length>0&&args[0]=="--focus-self-test"){
            if(!ReadingVisible(true,false,false,true,true,false)||!ReadingVisible(true,false,false,false,false,true)||ReadingVisible(false,false,false,true,true,true)||ReadingVisible(true,true,false,true,true,true)||ReadingVisible(true,false,true,true,true,true)||ReadingVisible(true,false,false,false,true,false))return 5;
            if(!CoversMonitor(0,0,1920,1080,0,0,1920,1080)||CoversMonitor(0,0,1280,720,0,0,1920,1080)||!CoversMonitor(-8,-8,1928,1088,0,0,1920,1080)||OverlayMayActivate(true,true,true)||!OverlayMayActivate(false,true,true)||OverlayMayActivate(false,true,false))return 6;
            Emit(new{type="focus-selftest",passed=true,fullscreenGameKeepsForeground=true,foreignApplicationsYield=true,minimizedWindowPreserved=true});return 0;
        }
        if(args.Length>0&&args[0]=="--scene-frame-self-test"){string r=GameAudio.SceneFrameSelfTest();Console.WriteLine(r=="0"?"PASS scene frame: top hash ignores the dialogue box, other scenes differ, fades give nothing, JPEG long side 1600":"FAIL scene frame: "+r);return r=="0"?0:15;}
        if(args.Length>0&&args[0]=="--audio-self-test"){if(!GameAudio.SelfTest())return 7;Console.WriteLine("PASS game audio: speech found over steady music, music alone rejected, WAV valid");return 0;}
        if(args.Length>0&&args[0]=="--self-test"){
            Rect b=Place(new Rect(100,200,1100,1000),4,66,92,26);
            if(b.Left!=140||b.Top!=728||b.Right!=1060||b.Bottom!=936)return 2;
            Rect surface=SurfaceBounds(b,new Rect(100,200,1100,1000),GameTextMask.ScanRegion(1000,800,2,60,96,38));
            if(surface.Left!=120||surface.Top!=680||surface.Right!=1080||surface.Bottom!=984||b.Left-surface.Left!=20||b.Top-surface.Top!=48)return 2;
            Emit(new{type="selftest",passed=true});return 0;
        }
        if((args.Length!=1&&args.Length!=2)||!Int32.TryParse(args[0],out OverlayPid))return 2;
        if(args.Length==2){long handle;if(!Int64.TryParse(args[1],out handle))return 2;PreferredOverlay=new IntPtr(handle);uint owner;GetWindowThreadProcessId(PreferredOverlay,out owner);if(owner!=OverlayPid)return 2;}
        HookVerifier=new GameHookVerifier(Emit);MaskLayer=new NativeMaskLayer();TextMask=new GameTextMask(MaskOutput);PageLocate=new PageLocator(Emit);
        WaitMarker=new GameWaitMarker(Emit);
        try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
        PointerGate=new ReaderPointerGate(Emit);
        bool hotkey=RegisterHotKey(IntPtr.Zero,0x541,0x4001,0x54),coverHotkey=RegisterHotKey(IntPtr.Zero,0x542,0x4001,0x48),modeHotkey=RegisterHotKey(IntPtr.Zero,0x543,0x4001,0x4d);
        /* E476: a helper left running by another MeguLit folder (an older download) holds Alt+T: end it and take the keys */
        /* E540: side-by-side test copies (MEGULIT_SIDE_BY_SIDE=1, E530) share the PC with other MeguLit folders on purpose;
           ending their helpers unbound every other copy's game, so a side-by-side copy goes without Alt+T instead */
        bool sideBySide=Environment.GetEnvironmentVariable("MEGULIT_SIDE_BY_SIDE")=="1";
        if(!sideBySide&&(!hotkey||!coverHotkey||!modeHotkey)){if(EndForeignBridges()>0){Thread.Sleep(300);if(!hotkey)hotkey=RegisterHotKey(IntPtr.Zero,0x541,0x4001,0x54);if(!coverHotkey)coverHotkey=RegisterHotKey(IntPtr.Zero,0x542,0x4001,0x48);if(!modeHotkey)modeHotkey=RegisterHotKey(IntPtr.Zero,0x543,0x4001,0x4d);}}
        Emit(new{type="ready",hotkey=hotkey,coverHotkey=coverHotkey,modeHotkey=modeHotkey,coverEnabled=true,interfaceMode="normal"});
        DateTime nextHotkeyTry=DateTime.UtcNow.AddSeconds(2);
        var input=new Thread(delegate(){string line;while((line=Console.ReadLine())!=null){try{var command=Json.Deserialize<Dictionary<string,object>>(line);if(Str(command,"type")=="glass"){GlassCommand(command);continue;}Commands.Enqueue(command);}catch{}}Running=false;});input.IsBackground=true;input.Start();
        try{while(Running){Dictionary<string,object> command;while(Commands.TryDequeue(out command)){try{Command(command);}catch(Exception error){Emit(new{type="error",message=error.Message});}}Msg message;while(PeekMessage(out message,IntPtr.Zero,0,0,1)){if(message.message==0x0312&&message.wParam.ToUInt64()==0x543){Emit(new{type="homeHotkey"});}else if(message.message==0x0312&&message.wParam.ToUInt64()==0x542){ToggleCover();}else if(message.message==0x0312){Emit(new{type="hotkey"});}else{TranslateMessage(ref message);DispatchMessage(ref message);}}try{ModeRequestTick();Tick();}catch{}
          /* E476: keys another program held are taken as soon as it lets go, so "not ready" heals by itself */
          if((!hotkey||!coverHotkey||!modeHotkey)&&DateTime.UtcNow>=nextHotkeyTry){nextHotkeyTry=DateTime.UtcNow.AddSeconds(2);bool was=hotkey&&coverHotkey&&modeHotkey;if(!hotkey)hotkey=RegisterHotKey(IntPtr.Zero,0x541,0x4001,0x54);if(!coverHotkey)coverHotkey=RegisterHotKey(IntPtr.Zero,0x542,0x4001,0x48);if(!modeHotkey)modeHotkey=RegisterHotKey(IntPtr.Zero,0x543,0x4001,0x4d);if(hotkey||coverHotkey||modeHotkey)Emit(new{type="hotkeyState",hotkey=hotkey,coverHotkey=coverHotkey,modeHotkey=modeHotkey});}
          try{Glass.Follow(Overlay,TranslationMode&&Target!=IntPtr.Zero&&IsShown&&Overlay!=IntPtr.Zero&&IsWindowVisible(Overlay)&&!IsIconic(Overlay)&&!IsIconic(Target));}catch{}Thread.Sleep(Dragging?8:Target==IntPtr.Zero?100:16);}}
        finally{RevealGame(Target);ForgetGame();if(HookVerifier!=null)HookVerifier.Dispose();Restore();TextMask.Dispose();WaitMarker.Dispose();MaskLayer.Dispose();Glass.Dispose();if(hotkey)UnregisterHotKey(IntPtr.Zero,0x541);if(coverHotkey)UnregisterHotKey(IntPtr.Zero,0x542);if(modeHotkey)UnregisterHotKey(IntPtr.Zero,0x543);}return 0;
    }
}
