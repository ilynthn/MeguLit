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
    /* 2026-11-16 (user: 启动游戏后很久才自动绑定窗口): a game started in the Japanese environment or through a non-ASCII
       folder runs from MeguLit's junction (cache\game-launch\<hash>\game.exe), so its image path never equalled the
       remembered executable and the auto-bind loop matched nothing; only the late bindProcess after the launch wait bound it.
       Two paths name the same program when they open the same file (volume serial + file index): junctions, symlinks,
       hard links and 8.3 names all agree. Identities are cached per path. */
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,EntryPoint="CreateFileW",SetLastError=true)]static extern IntPtr OpenForIdentity(string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
    [StructLayout(LayoutKind.Sequential,Pack=4)]struct FileIdentityInfo{public uint Attributes;public long Created,Accessed,Written;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
    [DllImport("kernel32.dll",EntryPoint="GetFileInformationByHandle")]static extern bool FileIdentity(IntPtr file,out FileIdentityInfo info);
    static readonly Dictionary<string,string> ImageIdentities=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
    static string ImageIdentity(string file){if(String.IsNullOrEmpty(file))return "";string known;if(ImageIdentities.TryGetValue(file,out known))return known;string id="";
        IntPtr h=OpenForIdentity(file,0,7,IntPtr.Zero,3,0x02000000,IntPtr.Zero);
        if(h!=IntPtr.Zero&&h!=new IntPtr(-1)){try{FileIdentityInfo info;if(FileIdentity(h,out info))id=info.Volume.ToString("x")+":"+info.IndexHigh.ToString("x")+":"+info.IndexLow.ToString("x");}finally{CloseHandle(h);}}
        if(ImageIdentities.Count>256)ImageIdentities.Clear();ImageIdentities[file]=id;return id;}
    public static bool SameImage(string a,string b){if(String.IsNullOrEmpty(a)||String.IsNullOrEmpty(b))return false;if(String.Equals(a,b,StringComparison.OrdinalIgnoreCase))return true;string x=ImageIdentity(a);return x!=""&&x==ImageIdentity(b);}
    /* A top-level window of any process was shown (EVENT_OBJECT_SHOW, out of context, delivered in this thread's
       PeekMessage): while a game is expected and nothing is bound, scan at once instead of waiting for the 1 s poll. */
    delegate void ShowEventProc(IntPtr hook,uint ev,IntPtr hwnd,int obj,int child,uint thread,uint time);
    [DllImport("user32.dll",EntryPoint="SetWinEventHook")]static extern IntPtr SetShowEventHook(uint min,uint max,IntPtr module,ShowEventProc proc,uint pid,uint thread,uint flags);
    [DllImport("user32.dll",EntryPoint="UnhookWinEvent")]static extern bool UnhookShowEvent(IntPtr hook);
    static ShowEventProc ShowEventKeep;static IntPtr ShowEventHook=IntPtr.Zero;static bool AutoBindKick;static DateTime LastAutoScan=DateTime.MinValue;
    static void InstallShowWatch(){ShowEventKeep=(hook,ev,h,obj,child,thread,time)=>{if(obj==0&&child==0&&h!=IntPtr.Zero&&Target==IntPtr.Zero&&WantedProcess!=""&&GetAncestor(h,2)==h)AutoBindKick=true;};ShowEventHook=SetShowEventHook(0x8002,0x8002,IntPtr.Zero,ShowEventKeep,0,0,0);}
    static void UninstallShowWatch(){if(ShowEventHook!=IntPtr.Zero)UnhookShowEvent(ShowEventHook);ShowEventHook=IntPtr.Zero;}
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
    /* E533: Pass = painted (inside the window region) but never takes the pointer: art-text translations over game buttons */sealed class HitRegion{public Rect Bounds;public bool Pass;public bool Menu;public bool Lookup;}
    static readonly List<HitRegion> HitRegions=new List<HitRegion>();static string RegionKey="";static int LookupDragRegion;
    static ReaderPointerGate.LookupGrip LookupGrip;
    static bool ReadHitBounds(Dictionary<string,object> value,out Rect bounds){
        bounds=new Rect();if(value==null)return false;
        double x=Num(value,"x",0),y=Num(value,"y",0),w=Num(value,"width",0),h=Num(value,"height",0);
        if(!(w>0&&h>0&&w<=16384&&h<=16384&&Math.Abs(x)<32768&&Math.Abs(y)<32768))return false;
        bounds=new Rect((int)x,(int)y,(int)(x+w),(int)(y+h));return true;
    }
    static ReaderPointerGate.LookupGrip ReadLookupGrip(Dictionary<string,object> value){
        object data,region,blocked;Rect area;
        if(!value.TryGetValue("lookupGrip",out data))return null;
        var grip=data as Dictionary<string,object>;
        if(grip==null||!grip.TryGetValue("area",out region)||!ReadHitBounds(region as Dictionary<string,object>,out area))return null;
        var controls=new List<Rect>();
        if(grip.TryGetValue("controls",out blocked)&&blocked is System.Collections.ArrayList){foreach(object item in (System.Collections.ArrayList)blocked){
            Rect box;if(controls.Count>=64)return null;
            if(ReadHitBounds(item as Dictionary<string,object>,out box))controls.Add(box);
        }}
        return new ReaderPointerGate.LookupGrip(area,controls.ToArray());
    }
    [DllImport("user32.dll")]static extern int SetWindowRgn(IntPtr window,IntPtr region,bool redraw);
    [DllImport("gdi32.dll")]static extern IntPtr CreateRectRgn(int left,int top,int right,int bottom);
    [DllImport("gdi32.dll")]static extern int CombineRgn(IntPtr result,IntPtr a,IntPtr b,int mode);
    [DllImport("gdi32.dll")]static extern int GetRgnBox(IntPtr region,out Rect box);
    [DllImport("gdi32.dll")]static extern bool DeleteObject(IntPtr value);
    static void MaskOutput(object value){var d=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(value));if(Str(d,"type")!="maskFrame"){Emit(value);return;}if(Bool(d,"clear")){MaskLayer.Hide();return;}try{MaskLayer.Frame(Str(d,"png"),(int)Num(d,"x",0),(int)Num(d,"y",0),(int)Num(d,"width",0),(int)Num(d,"height",0));}catch{MaskLayer.Hide();}}
    static void ResetRegion(){RegionKey="";LookupDragRegion=0;LookupGrip=null;HitRegions.Clear();if(Overlay!=IntPtr.Zero){SetWindowRgn(Overlay,OriginalRegion,true);OriginalRegion=IntPtr.Zero;}}
    public static Rect Clip(Rect r,int width,int height){return new Rect(Math.Max(0,r.Left),Math.Max(0,r.Top),Math.Min(width,r.Right),Math.Min(height,r.Bottom));}
    static void ApplyRegion(int width,int height){
        int dx=0,dy=0;Rect wr;Point co=new Point();
        if(GetWindowRect(Overlay,out wr)&&ClientToScreen(Overlay,ref co)){dx=Math.Max(0,Math.Min(64,co.X-wr.Left));dy=Math.Max(0,Math.Min(64,co.Y-wr.Top));}
        width+=dx;height+=dy;
        string key=width+":"+height+":"+dx+":"+dy+":"+(LookupDragRegion>0?"lookup-drag":String.Join(";",HitRegions.ConvertAll(h=>h.Bounds.Left+","+h.Bounds.Top+","+h.Bounds.Right+","+h.Bounds.Bottom)));
        if(key==RegionKey)return;
        IntPtr region=LookupDragRegion>0?CreateRectRgn(0,0,width,height):CreateRectRgn(0,0,0,0);
        if(LookupDragRegion==0)foreach(var hit in HitRegions){var h=hit.Bounds;var rect=Clip(new Rect(h.Left+dx,h.Top+dy,h.Right+dx,h.Bottom+dy),width,height);
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
    [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr h,StringBuilder s,int c);
    // 2026-11-15 Alt+M binds the window in front (no longer opens or closes the home window). Only the facts are sent;
    // services/bind-hotkey.cjs decides (MeguLit's own windows, the desktop and Explorer are refused) and binds through
    // the same "bind" command as the Alt+T window picker.
    static void BindHotkey(bool pick=false){IntPtr fg=GetForegroundWindow(),root=fg==IntPtr.Zero?IntPtr.Zero:GetAncestor(fg,2);uint pid=0;var title=new StringBuilder(512);var cls=new StringBuilder(256);
        if(root!=IntPtr.Zero){GetWindowThreadProcessId(root,out pid);GetWindowText(root,title,title.Capacity);GetClassName(root,cls,cls.Capacity);}
        bool own=pid!=0&&(pid==(uint)OverlayPid||pid==(uint)Process.GetCurrentProcess().Id);
        Emit(new{type="bindHotkey",hwnd=root.ToInt64().ToString(),pid=pid,title=title.ToString(),className=cls.ToString(),processName=pid==0?"":ProcessName(pid),own=own,pick=pick});}
    // Alt+T → 校准 → 绑定游戏窗口 → 点选: the next window the user brings to the front (within 15 s) goes the same way as Alt+M.
    static DateTime PickUntil=DateTime.MinValue;static IntPtr PickSkip=IntPtr.Zero;
    static void PickTick(){if(PickUntil==DateTime.MinValue)return;if(DateTime.UtcNow>PickUntil){PickUntil=DateTime.MinValue;Emit(new{type="pickWindow",active=false,timeout=true});return;}
        IntPtr fg=GetForegroundWindow(),root=fg==IntPtr.Zero?IntPtr.Zero:GetAncestor(fg,2);if(root==IntPtr.Zero||root==PickSkip)return;uint pid;GetWindowThreadProcessId(root,out pid);
        if(pid==(uint)OverlayPid||pid==(uint)Process.GetCurrentProcess().Id)return;PickUntil=DateTime.MinValue;BindHotkey(true);}
    static IntPtr PreferredOverlay=IntPtr.Zero;
    static int HostedFrameUpdates;
    public static int HostedStyle(int style){return (style&~0x00c40000)|unchecked((int)0x80000000);}
    /* no edge of any kind, a tool window: the same value as chromeless_ex_style in desktop/src/window_chrome.rs */
    public static int HostedExStyle(int ex){return (ex&~(0x00000001|0x00000100|0x00000200|0x00020000|0x00040000))|0x00000080;}
    static void PrepareHostedFrame(){
        // A dedicated transparent HWND is always a popup. Expanding its hit region
        // during menu drag must never reveal the saved ordinary-window caption.
        /* 2026-11-19: the window's own process now keeps these bits off for good (desktop/src/window_chrome.rs, WM_STYLECHANGING).
           This stays as the check from outside: an older MeguLit.exe, or a frame that shows up anyway, is put right and
           logged with the size of the non-client area (reader-host.log "hostFrame"), 200 times at most. */
        int style=GetWindowLong(Overlay,-16),wanted=HostedStyle(style),ex=GetWindowLong(Overlay,-20),wantedEx=HostedExStyle(ex);
        Rect wr,cr;Point co=new Point();int ncLeft=0,ncTop=0,ncRight=0,ncBottom=0;
        if(GetWindowRect(Overlay,out wr)&&GetClientRect(Overlay,out cr)&&ClientToScreen(Overlay,ref co)&&!IsIconic(Overlay)){ncLeft=co.X-wr.Left;ncTop=co.Y-wr.Top;ncRight=wr.Right-(co.X+cr.Right);ncBottom=wr.Bottom-(co.Y+cr.Bottom);}
        bool framed=ncLeft!=0||ncTop!=0||ncRight!=0||ncBottom!=0;
        if(style==wanted&&ex==wantedEx&&!framed)return;
        if(style!=wanted)SetWindowLong(Overlay,-16,wanted);if(ex!=wantedEx)SetWindowLong(Overlay,-20,wantedEx);
        SetWindowPos(Overlay,IntPtr.Zero,0,0,0,0,0x0001|0x0002|0x0004|0x0010|0x0020);
        if(++HostedFrameUpdates<=200)Emit(new{type="hostFrame",update=HostedFrameUpdates,styleBefore=style,styleAfter=GetWindowLong(Overlay,-16),exStyleBefore=ex,exStyleAfter=GetWindowLong(Overlay,-20),nonClient=ncLeft+","+ncTop+","+ncRight+","+ncBottom});
    }
    static void FindOverlay(){
        // Self-test modes run without an overlay process (OverlayPid 0): never adopt, move or raise someone else's window.
        if(OverlayPid<=0){Overlay=IntPtr.Zero;return;}
        if(PreferredOverlay!=IntPtr.Zero){
            uint owner;GetWindowThreadProcessId(PreferredOverlay,out owner);
            Overlay=owner==OverlayPid?PreferredOverlay:IntPtr.Zero;
            if(Overlay!=IntPtr.Zero)PrepareHostedFrame();
            return;
        }
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
        if(!Captured||!IsWindow(Overlay))return;
        bool hosted=PreferredOverlay!=IntPtr.Zero;
        if(hosted)ShowWindow(Overlay,0);
        ResetRegion();RestoreFrame();SetWindowLong(Overlay,-16,OriginalStyle);
        SetWindowPos(Overlay,new IntPtr(1),OriginalRect.Left,OriginalRect.Top,OriginalRect.Right-OriginalRect.Left,OriginalRect.Bottom-OriginalRect.Top,0x0020|0x0010);
        if(HadLayerAttributes)SetLayeredWindowAttributes(Overlay,OldLayerColor,OldLayerAlpha,OldLayerFlags);
        Captured=false;IsShown=IsWindowVisible(Overlay);}
    public static Rect Place(Rect area,double x,double y,double w,double h){int aw=Math.Max(1,area.Right-area.Left),ah=Math.Max(1,area.Bottom-area.Top);x=Math.Max(0,Math.Min(95,x));y=Math.Max(0,Math.Min(95,y));w=Math.Max(5,Math.Min(100,w));h=Math.Max(5,Math.Min(100,h));int l=area.Left+(int)Math.Round(aw*x/100),t=area.Top+(int)Math.Round(ah*y/100);return new Rect(l,t,l+Math.Max(120,(int)Math.Round(aw*w/100)),t+Math.Max(70,(int)Math.Round(ah*h/100)));}
    public /* 2026-11-19 (user: 只要显示器上还有位置就不要挤压汉字): the bottom of the work area (taskbar excluded) of the monitor the game client is on */
static int WorkBottom(Rect area){try{return System.Windows.Forms.Screen.FromRectangle(new System.Drawing.Rectangle(area.Left,area.Top,Math.Max(1,area.Right-area.Left),Math.Max(1,area.Bottom-area.Top))).WorkingArea.Bottom;}catch{return area.Bottom;}}
static Rect SurfaceBounds(Rect reader,Rect game,System.Drawing.Rectangle scan){return scan.IsEmpty?reader:new Rect(Math.Min(reader.Left,game.Left+scan.Left),Math.Min(reader.Top,game.Top+scan.Top),Math.Max(reader.Right,game.Left+scan.Right),Math.Max(reader.Bottom,game.Top+scan.Bottom));}
    static string ExecutableHash(uint pid){try{using(var sha=System.Security.Cryptography.SHA256.Create())using(var input=File.OpenRead(Process.GetProcessById((int)pid).MainModule.FileName))return BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant();}catch{return "";}}
    static void Bind(IntPtr target,bool activate=false){Scene.Reset();GameUi.Clear();if(target==IntPtr.Zero||target==Overlay||!IsWindow(target))throw new Exception("请选择有效的游戏窗口");FindOverlay();if(Overlay==IntPtr.Zero)throw new Exception("MeguLit 窗口尚未准备好，请稍后再绑定");if(TranslationMode)Capture();Target=target;HasLastRect=false;uint pid;GetWindowThreadProcessId(target,out pid);ForgetGame();TrackedGame=Process.GetProcessById((int)pid);TrackedGameStarted=TrackedGame.StartTime.ToUniversalTime().Ticks;ResetPageLocator(true);WindowGoneAt=DateTime.MinValue;WantedProcess=ProcessName(pid);string executableHash=ExecutableHash(pid);Dialog.Reset();DialogVisible=true;if(activate){CoverEnabled=true;RevealGame(Target);
            // Binding from the menu keeps the menu open (and the keyboard on it); the game only comes forward without one.
            if(!MenuOpen)SetForegroundWindow(GetAncestor(Target,2));LastZCheck=DateTime.MinValue;}if(AudioWanted)Audio.Start(pid);var gameCaption=new StringBuilder(512);GetWindowText(target,gameCaption,gameCaption.Capacity);Emit(new{type="bound",activateGame=activate,coverEnabled=CoverEnabled,bound=TranslationMode,gameProcessId=pid,gameStarted=Process.GetProcessById((int)pid).StartTime.ToUniversalTime().Ticks.ToString(),gameHwnd=target.ToInt64().ToString(),gameStyleKey=executableHash,gameTitle=gameCaption.ToString(),hookExact474=executableHash=="e77a11486b6d94a42f9d7d39fd768b4e763f163b977d3eaed94cf9e13217f995",interfaceMode=TranslationMode?"translation":"normal",processName=WantedProcess,gameExecutable=ProcessImage(pid),message="游戏窗口已记住；在游戏里按 Alt+M 可重新绑定当前窗口"});}
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
    static void ResetPageLocator(bool bind=false){
        lock(OutputLock){
            if(PageLocate!=null)PageLocate.Dispose();
            PageLocate=null;
            if(!bind)return;
            PageLocator locator=null;
            locator=new PageLocator(message=>{
                lock(OutputLock){if(Object.ReferenceEquals(PageLocate,locator))Emit(message);}
            });
            locator.OwnPids=new uint[]{(uint)OverlayPid,(uint)Process.GetCurrentProcess().Id};
            PageLocate=locator;
            var ownPids=PageLocate.OwnPids;GameCapture.OwnParts=(ownHwnd,ownW,ownH)=>OwnCover.Parts(ownHwnd,ownW,ownH,ownPids);
        }
    }
    static void ForgetGame(){ResetPageLocator();Audio.Stop();if(TrackedGame!=null){TrackedGame.Dispose();TrackedGame=null;}TrackedGameStarted=0;WindowGoneAt=DateTime.MinValue;}
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
        DropLayers();Restore();InterfaceMode(false,false);if(WaitMarker!=null)WaitMarker.Hide();if(HookVerifier!=null)HookVerifier.Cancel();
        Emit(new{type="gameClosed",interfaceMode="normal",bound=false,gameAttached=false,gameProcessId=0,gameStarted="",gameHwnd=""});
        return true;
    }
    static void InterfaceMode(bool translation,bool userAction){
        if(translation&&userAction){FindOverlay();if(Overlay!=IntPtr.Zero&&IsIconic(Overlay))ShowWindow(Overlay,4);}
        if(translation!=TranslationMode){
            if(!translation&&Captured&&Target==IntPtr.Zero&&(FloatDX!=0||FloatDY!=0))OriginalRect=new Rect(OriginalRect.Left+FloatDX,OriginalRect.Top+FloatDY,OriginalRect.Right+FloatDX,OriginalRect.Bottom+FloatDY);
            FloatDX=FloatDY=0;Dragging=false;
            TranslationMode=translation;MenuOpen=false;MenuRegionReady=false;MenuFocusPending=false;LookupOpen=false;HitRegions.Clear();Glass.Clear();RegionKey="";HasLastRect=false;FloatingPlaced=false;
            if(!translation){Restore();if(PreferredOverlay!=IntPtr.Zero){NormalShowUntil=DateTime.MinValue;if(Overlay!=IntPtr.Zero)ShowWindow(Overlay,0);IsShown=false;}else{NormalShowUntil=DateTime.UtcNow.AddMilliseconds(1500);if(Overlay!=IntPtr.Zero){if(userAction){ShowWindow(Overlay,5);SetForegroundWindow(Overlay);IsShown=true;}else if(!IsWindowVisible(Overlay))IsShown=TopmostGuard.ShowAtBottom(Overlay);}}}
            else if(userAction&&Target!=IntPtr.Zero)SetForegroundWindow(Target);
            // No game: shrink to the dialogue strip right away (the tick loop runs only every 100 ms without a game).
            if(PreferredOverlay==IntPtr.Zero&&translation&&Target==IntPtr.Zero){FindOverlay();if(Overlay!=IntPtr.Zero){Capture();Rect r=FloatingBase();SetWindowPos(Overlay,new IntPtr(1),r.Left+FloatDX,r.Top+FloatDY,r.Right-r.Left,r.Bottom-r.Top,0x0020|0x0010);FloatingPlaced=true;}}
        }
        Emit(new{type=userAction?"interfaceMode":"bound",interfaceMode=translation?"translation":"normal",bound=translation&&Target!=IntPtr.Zero,gameAttached=Target!=IntPtr.Zero,coverEnabled=CoverEnabled,message=translation?"翻译文本框模式 · Alt+M 绑定当前游戏窗口":"普通 MeguLit 界面 · Alt+M 绑定当前游戏窗口"});
    }
    // Right after switching to normal mode the main window must end up visible; it was seen staying hidden when the
    // switch landed while the reading layer was auto-hidden. Only this short window is enforced, so hiding it later still works.
    static DateTime NormalShowUntil=DateTime.MinValue;
    // The reading layer must stay above the game. Activating the game (binding, clicking it) could leave the layer
    // underneath while the layer was only re-placed on size changes, so a menu opened afterwards was never seen.
    static DateTime LastZCheck=DateTime.MinValue;
    // Tells the page once a region that includes the menu is in place and the window shown; the page holds the menu's
    // opening animation until then, so a half-opened menu never shows through the old, text-only region.
    static bool RegionAckPending;
    static void AckRegion(){if(!RegionAckPending||!MenuOpen)return;Rect r;if(!GetClientRect(Overlay,out r))return;if(TranslationMode&&Target!=IntPtr.Zero){var screen=System.Windows.Forms.SystemInformation.VirtualScreen;if(r.Right!=screen.Width||Math.Abs(r.Bottom-screen.Height)>1)return;}RegionAckPending=false;Emit(new{type="regionApplied",surfaceWidth=r.Right,surfaceHeight=r.Bottom});}
    static void KeepAboveGame(IntPtr gameRoot,bool front){
        bool menu=MenuOpen&&MenuRegionReady;
        /* E472 (user: fullscreen ファタモルガーナの館 showed no text): a game window owned by a hidden application window (KiriKiri 2:
           TVPWindowForm owned by TApplication) has that hidden window as its root owner, so the visible form going topmost
           fullscreen above the layer was never seen. Both the root owner and the game's own top-level window count. */
        IntPtr gameTop=Target!=IntPtr.Zero?GetAncestor(Target,2):IntPtr.Zero;if(gameTop==IntPtr.Zero)gameTop=gameRoot;
        bool below=BelowGame(gameRoot,gameTop);
        DateTime now=DateTime.UtcNow;
        if((now-LastZCheck).TotalMilliseconds<(below?32:menu?100:250))return;LastZCheck=now;
        // Raise only over the foreground game. Menus and foreign applications always use ordinary z-order.
        // Some game renderers draw over an inactive ordinary window even after HWND_TOP.
        // Menu open: made topmost at once (not only after the game got above it), so a click on the game cannot cover it.
        // Another application in front (Alt+Tab): the layer stays directly above the game, below that application.
        if(!front){TopmostGuard.Sink(Overlay,gameTop);return;}
        bool topmost=(GetWindowLong(Overlay,-20)&8)!=0;
        if(!below&&topmost){if(LastRaise!="held"){LastRaise="held";Emit(new{type="layerRaise",how="held",above=true,topmost=topmost});}return;}
        /* 2026-11-19 16:17 (user: 「一切屏回来就啥都没了」): back from another program the decision was right (float, shown) but the
           topmost request did not take; the game, activated, lay above the layer and nothing checked. The raise now has a
           result: asked, looked at, and when the layer is still under the game it is put directly above it in the normal
           band (the same call that keeps it there while another program is in front), every pass until it holds. */
        string how=ReaderLayerPolicy.Raise(new LayerZ(gameRoot,gameTop),front);
        bool aboveGame=!BelowGame(gameRoot,gameTop);topmost=(GetWindowLong(Overlay,-20)&8)!=0;
        if(how!=LastRaise){LastRaise=how;Emit(new{type="layerRaise",how=how,above=aboveGame,topmost=topmost});}
        if(below&&aboveGame)Emit(new{type="coverDebug",text=menu?"Alt+T 菜单打开：阅读层固定到游戏上方":"阅读层已移到前台游戏上方"});}
    static string LastRaise="";
    [DllImport("user32.dll")]static extern bool AttachThreadInput(uint attach,uint to,bool on);
    [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
    static bool BelowGame(IntPtr gameRoot,IntPtr gameTop){
        // A hidden owner (for example KiriKiri's TApplication) cannot cover the reader.
        return !TopmostGuard.IsAbove(Overlay,gameTop)||gameRoot!=IntPtr.Zero&&gameRoot!=gameTop&&
            IsWindowVisible(gameRoot)&&!IsIconic(gameRoot)&&!TopmostGuard.IsAbove(Overlay,gameRoot);
    }
    sealed class LayerZ:ReaderLayerPolicy.ILayerZ{
        const uint PlaceFlags=0x0001|0x0002|0x0010|0x0200|0x0400; // NOSIZE, NOMOVE, NOACTIVATE, NOOWNERZORDER, NOSENDCHANGING
        readonly IntPtr Root,Top;public LayerZ(IntPtr root,IntPtr top){Root=root;Top=top;}
        public bool BelowGame(){return GalWindowBridge.BelowGame(Root,Top);}
        public bool Topmost(){return (GetWindowLong(Overlay,-20)&8)!=0;}
        public void RequestTopmost(){SetWindowPos(Overlay,new IntPtr(-1),0,0,0,0,PlaceFlags);}
        public void PlaceAboveGame(){
            IntPtr above=GetWindow(Top,3);
            if(above!=Overlay)SetWindowPos(Overlay,above,0,0,0,0,PlaceFlags);
        }
        public void PlaceTop(){SetWindowPos(Overlay,IntPtr.Zero,0,0,0,0,PlaceFlags);}
        /* last step, only when every plain request was ignored: for the length of one call this thread shares the input
           queue of the foreground thread, which is what makes the system take a z-order request; no focus changes */
        public void ForceTopmost(){IntPtr fg=GetForegroundWindow();if(fg==IntPtr.Zero)return;uint pid;uint thread=GetWindowThreadProcessId(fg,out pid),self=GetCurrentThreadId();if(thread==0||thread==self)return;
            if(!AttachThreadInput(self,thread,true))return;try{RequestTopmost();}finally{AttachThreadInput(self,thread,false);}}
    }
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
        IntPtr foreground=GetForegroundWindow();
        bool readerFront=GetAncestor(foreground,2)==Overlay;
        bool bound=TranslationMode&&Target!=IntPtr.Zero;
        bool gameFront=bound&&GetAncestor(foreground,3)==GetAncestor(Target,3);
        // Opening the unbound settings from MeguLit's home is allowed. A bound reader cannot take focus from it.
        uint foregroundPid;GetWindowThreadProcessId(foreground,out foregroundPid);
        bool settingsFromHome=!bound&&PreferredOverlay!=IntPtr.Zero&&foregroundPid==(uint)OverlayPid;
        if(IsIconic(Overlay)||!(readerFront||gameFront||settingsFromHome)){MenuFocusPending=false;return;}
        if((GetAsyncKeyState(0x12)&0x8000)!=0)return;
        MenuFocusPending=false;if(!readerFront)SetForegroundWindow(Overlay);
    }
    // One startup.log line ("Visibility: ...") each time the bridge hides the MeguLit window, with the deciding state.
    static void HideReason(string why){Emit(new{type="coverDebug",text="阅读层隐藏 ("+(TranslationMode?"translation":"normal")+", target="+(Target!=IntPtr.Zero)+") "+why});}
    static void ToggleInterface(){if((DateTime.UtcNow-LastModeToggle).TotalMilliseconds<180)return;LastModeToggle=DateTime.UtcNow;InterfaceMode(!TranslationMode,true);}
    // Interface switch requested by the page (galToggleMode): ask the page first so it can play the leaving half of the transition, then it sends "toggleMode".
    // If the page does not answer in time (busy or an older page script), switch anyway.
    static DateTime ModeRequestAt=DateTime.MinValue,ModeFallbackAt=DateTime.MinValue;
    static void RequestModeToggle(){if(PreferredOverlay!=IntPtr.Zero&&!TranslationMode&&Target==IntPtr.Zero){ManualBindUntil=DateTime.UtcNow.AddSeconds(20);NextAutoBind=DateTime.MinValue;Emit(new{type="bindPending"});return;}if(ModeRequestAt!=DateTime.MinValue&&(DateTime.UtcNow-ModeRequestAt).TotalMilliseconds<1500)return;ModeRequestAt=DateTime.UtcNow;Emit(new{type="modeRequest",interfaceMode=TranslationMode?"normal":"translation"});}
    static void ModeRequestTick(){if(ModeRequestAt!=DateTime.MinValue&&(DateTime.UtcNow-ModeRequestAt).TotalMilliseconds>900){ModeRequestAt=DateTime.MinValue;ModeFallbackAt=DateTime.UtcNow;LastModeToggle=DateTime.MinValue;ToggleInterface();}}
    static void PageToggleMode(){if(ModeRequestAt==DateTime.MinValue&&(DateTime.UtcNow-ModeFallbackAt).TotalMilliseconds<1500)return;ModeRequestAt=DateTime.MinValue;LastModeToggle=DateTime.MinValue;ToggleInterface();}
    static void Settings(Dictionary<string,object> d){X=Num(d,"x",X);Y=Num(d,"y",Y);W=Num(d,"width",W);H=Num(d,"height",H);if(TextMask!=null)TextMask.Configure(d);if(WaitMarker!=null)WaitMarker.Configure(d);}
    /* 2026-11-16 Alt+T only opens the menu: RegisterHotKey swallows the T, so the window in front saw a lone Alt press and
       released it into its menu bar (KiriKiri games have one): the game sat in its modal menu loop, the next key or click went to
       that menu. A dummy key (VK 0xE8, unassigned; AutoHotkey's menu mask key) while Alt is still down makes the release ordinary. */
    [DllImport("user32.dll")] static extern void keybd_event(byte vk,byte scan,uint flags,UIntPtr extra);
    static void MaskAltRelease(){if((GetAsyncKeyState(0x12)&0x8000)==0)return;keybd_event(0xE8,0,0,UIntPtr.Zero);keybd_event(0xE8,0,2,UIntPtr.Zero);}
    /* 2026-11-26 (QQ #1130: L was the game's own shortcut; the log only opened on L with the Alt+T menu open). The log has its own
       global key (Alt+L by default, chosen in the log settings, backlog.js), held only while a bound game (or MeguLit's layer) is
       in front in translation mode, so it is never taken from other programs; outside that the key stays theirs. */
    static uint BacklogMods,BacklogKey,BacklogHeldMods,BacklogHeldKey;
    internal static bool BacklogKeyValid(uint mods,uint key){return key>=0x41&&key<=0x5A&&(mods&~7u)==0&&(mods&3)!=0;}
    internal static bool BacklogKeyWanted(bool configured,bool translation,bool bound,bool gameInFront){return configured&&translation&&bound&&gameInFront;}
    /* RRFZ #1175: a combination another program already holds is tried again only every 1.5 s, not on every 16 ms tick; a newly chosen one is tried at once */
    static uint BacklogFailedMods,BacklogFailedKey;static DateTime BacklogRetryAt=DateTime.MinValue;
    internal static bool BacklogRetryWait(uint mods,uint key,uint failedMods,uint failedKey,DateTime now,DateTime retryAt){return key!=0&&key==failedKey&&mods==failedMods&&now<retryAt;}
    static void BacklogHotkeyConfigure(Dictionary<string,object> d){uint mods=(uint)Math.Max(0,Math.Min(255,Num(d,"modifiers",0))),key=(uint)Math.Max(0,Math.Min(255,Num(d,"key",0)));
        if(!BacklogKeyValid(mods,key)){mods=0;key=0;}BacklogMods=mods;BacklogKey=key;}
    static void BacklogHotkeyTick(bool noHotkeys){
        var front=GetForegroundWindow();front=front==IntPtr.Zero?IntPtr.Zero:GetAncestor(front,3);
        bool want=!noHotkeys&&BacklogKeyWanted(BacklogKey!=0,TranslationMode,Target!=IntPtr.Zero,front!=IntPtr.Zero&&(front==GetAncestor(Target,3)||Overlay!=IntPtr.Zero&&front==GetAncestor(Overlay,3)));
        if(want&&BacklogHeldKey==BacklogKey&&BacklogHeldMods==BacklogMods||!want&&BacklogHeldKey==0)return;
        if(BacklogHeldKey!=0){UnregisterHotKey(IntPtr.Zero,0x544);BacklogHeldKey=0;BacklogHeldMods=0;}
        if(!want||BacklogRetryWait(BacklogMods,BacklogKey,BacklogFailedMods,BacklogFailedKey,DateTime.UtcNow,BacklogRetryAt))return;
        if(want&&!noHotkeys&&RegisterHotKey(IntPtr.Zero,0x544,BacklogMods|0x4000,BacklogKey)){BacklogHeldKey=BacklogKey;BacklogHeldMods=BacklogMods;BacklogFailedKey=0;BacklogFailedMods=0;}
        else{BacklogFailedKey=BacklogKey;BacklogFailedMods=BacklogMods;BacklogRetryAt=DateTime.UtcNow.AddMilliseconds(1500);}
    }
    static void ToggleCover(){
        if((DateTime.UtcNow-LastCoverToggle).TotalMilliseconds<180)return;
        LastCoverToggle=DateTime.UtcNow;CoverEnabled=!CoverEnabled;
        if(!CoverEnabled)LookupOpen=false;
        Emit(new{type="cover",coverEnabled=CoverEnabled,message=CoverEnabled?"MeguLit 覆盖已显示；Alt+H 可隐藏":"MeguLit 覆盖已隐藏；Alt+H 可恢复"});
    }
    static void Command(Dictionary<string,object> d){
        string type=Str(d,"type");object value;
        if(type=="dialogConfig"){VisualDetection=Bool(d,"active");SceneDetection=Bool(d,"scene");Scene.Full=SceneDetection;if(WaitMarker!=null)WaitMarker.PresenceWanted=Bool(d,"marker");if(!VisualDetection){Dialog.Reset();DialogVisible=true;}}
        else if(type=="dialogCalibrate"){Rect rect;if(Target!=IntPtr.Zero&&GetClientRect(Target,out rect)){bool success=Dialog.Calibrate(Target,rect.Right,rect.Bottom,Num(d,"x",2),Num(d,"y",58),Num(d,"width",96),Num(d,"height",2));Emit(new{type="dialogCalibration",success=success,message=success?"已记录对话框边缘，请勿把人物或字幕放入检测区域":"无法取得游戏画面"});}}
        else if(type=="windows")ThreadPool.QueueUserWorkItem(delegate{try{Emit(new{type="windows",windows=Windows()});}catch{}}); // read-only and slow (a process lookup per window): kept off the loop so the menu's region is not held up
        else if(type=="gameUi"){object rows;GameUi.Set(Target,d.TryGetValue("items",out rows)?rows as System.Collections.ArrayList:null,Bool(d,"preview"));}
        else if(type=="dialogSceneLine"){Scene.Line();GameUi.Clear();}
        else if(type=="dialogVisibility"){DialogVisible=Bool(d,"visible");}
        else if(type=="hookVerify"){if(HookVerifier!=null)HookVerifier.Request(Target,d);}
        else if(type=="choiceLocate"){object list;var options=new List<string>();if(d.TryGetValue("options",out list)&&list is System.Collections.ArrayList)foreach(object o in (System.Collections.ArrayList)list){string t=Convert.ToString(o);if(!String.IsNullOrWhiteSpace(t)&&t.Length<=120&&options.Count<12)options.Add(t);}if(PageLocate!=null&&Target!=IntPtr.Zero)PageLocate.RequestChoices(Target,options);}
        else if(type=="pageLocate"){if(PageLocate!=null&&Target!=IntPtr.Zero)PageLocate.Request(Target,Str(d,"text"),Bool(d,"art"));}
        /* 2026-11-12 art scan (OCR read path): MeguLit asks for it while no hook line is current; PageLocator reads the picture and emits artText */
        else if(type=="artScan"){if(PageLocate!=null)PageLocate.Scan(Target,Bool(d,"on")&&Target!=IntPtr.Zero,Str(d,"dialog"),Str(d,"speaker"),Bool(d,"band"),Bool(d,"foreign"),Bool(d,"slow"));}
        else if(type=="maskAssist"){if(TextMask!=null)TextMask.Assist(Str(d,"source"));}
        else if(type=="hookVerifyCancel"){if(HookVerifier!=null)HookVerifier.Cancel();}
        else if(type=="gameAudio"){AudioWanted=Bool(d,"enabled");uint pid=0;if(AudioWanted&&Target!=IntPtr.Zero)GetWindowThreadProcessId(Target,out pid);if(AudioWanted&&pid!=0)Audio.Start(pid);else if(!AudioWanted)Audio.Stop();}
        /* 2026-11-21 runtime sample: {type:"clientShot",id,maxEdge,maxBytes} -> the whole client area, full size + a scaled copy (GameAudio.ClientShot) */
        else if(type=="clientShot"){string id=Str(d,"id");IntPtr target=Target;object me,mb;int maxEdge=d.TryGetValue("maxEdge",out me)?Math.Max(64,Math.Min(4096,Convert.ToInt32(me))):960,maxBytes=d.TryGetValue("maxBytes",out mb)?Math.Max(16*1024,Math.Min(2*1024*1024,Convert.ToInt32(mb))):150*1024;
            ThreadPool.QueueUserWorkItem(delegate{string full="",small="";try{Rect rect;if(target!=IntPtr.Zero&&GetClientRect(target,out rect))GameAudio.ClientShot(target,rect.Right,rect.Bottom,maxEdge,maxBytes,out full,out small);}catch{}
                try{Emit(new{type="clientShot",id=id,full=full,small=small});}catch{}});}
        else if(type=="sceneShot"){string id=Str(d,"id");IntPtr target=Target;
            ThreadPool.QueueUserWorkItem(delegate{string jpeg="",hash="";double score=0;try{Rect rect;if(target!=IntPtr.Zero&&GetClientRect(target,out rect))jpeg=GameAudio.SceneShot(target,rect.Right,rect.Bottom,out score,out hash);}catch{}
                try{Emit(new{type="sceneShot",id=id,jpeg=jpeg,score=score,hash=hash});}catch{}});}
        /* 2026-11-13 collected sentence pictures: a full clean frame (asked only while the dialogue box is hidden) and a cheap probe of the top hash */
        /* 2026-11-15 overlay placement (core/glyph-locate-host.cjs): one lossless BGRA picture of the game window (GameCapture:
           window DC first, rate-limited PrintWindow, never the screen) written raw to a .megulit-frame file under the cache;
           asked twice per line and only while a game's text position is being learned */
        else if(type=="rawFrame"){string id=Str(d,"id"),file=Str(d,"file");IntPtr target=Target,overlay=Overlay;
            ThreadPool.QueueUserWorkItem(delegate{bool ok=false;int w=0,h=0;try{Rect rect;if(target!=IntPtr.Zero&&file.EndsWith(".megulit-frame",StringComparison.OrdinalIgnoreCase)&&GetClientRect(target,out rect)&&rect.Right>0&&rect.Bottom>0&&rect.Right<=8192&&rect.Bottom<=8192){w=rect.Right;h=rect.Bottom;
                using(var bmp=new System.Drawing.Bitmap(w,h,System.Drawing.Imaging.PixelFormat.Format32bppArgb)){if(GameCapture.Picture(target,bmp)){var data=bmp.LockBits(new System.Drawing.Rectangle(0,0,w,h),System.Drawing.Imaging.ImageLockMode.ReadOnly,System.Drawing.Imaging.PixelFormat.Format32bppArgb);
                var bytes=new byte[w*h*4];try{for(int y=0;y<h;y++)Marshal.Copy(new IntPtr(data.Scan0.ToInt64()+(long)y*data.Stride),bytes,y*w*4,w*4);}finally{bmp.UnlockBits(data);}File.WriteAllBytes(file,bytes);ok=true;}}}}catch{}
                Point gameOrigin=new Point(),overlayOrigin=new Point();int[] clientOrigin=null;
                if(ok&&overlay!=IntPtr.Zero&&ClientToScreen(target,ref gameOrigin)&&ClientToScreen(overlay,ref overlayOrigin))
                    clientOrigin=new[]{gameOrigin.X-overlayOrigin.X,gameOrigin.Y-overlayOrigin.Y};
                try{Emit(new{type="rawFrame",id=id,ok=ok,file=ok?file:"",width=w,height=h,clientOrigin=clientOrigin});}catch{}});}
        else if(type=="sceneFrame"){string id=Str(d,"id");IntPtr target=Target;
            ThreadPool.QueueUserWorkItem(delegate{string jpeg="",hash="";double score=0;try{Rect rect;if(target!=IntPtr.Zero&&GetClientRect(target,out rect))jpeg=GameAudio.SceneFrame(target,rect.Right,rect.Bottom,out score,out hash);}catch{}
                try{Emit(new{type="sceneFrame",id=id,jpeg=jpeg,score=score,topHash=hash});}catch{}});}
        else if(type=="sceneProbe"){string id=Str(d,"id");IntPtr target=Target;
            ThreadPool.QueueUserWorkItem(delegate{string hash="";try{Rect rect;if(target!=IntPtr.Zero&&GetClientRect(target,out rect))hash=GameAudio.SceneProbe(target,rect.Right,rect.Bottom);}catch{}
                try{Emit(new{type="sceneProbe",id=id,topHash=hash});}catch{}});}
        else if(type=="mediaClip"){string id=Str(d,"id");long from=(long)Num(d,"from",0),to=(long)Num(d,"to",0);bool shot=Bool(d,"screenshot");IntPtr target=Target;
            ThreadPool.QueueUserWorkItem(delegate{string wav="",jpeg="";bool voiced=false;try{var voice=GameAudio.Voice(Audio.Range(from,to));if(voice!=null){voiced=true;wav=Convert.ToBase64String(GameAudio.Wav(voice));}
                }catch{}
                try{Rect rect;if(shot&&target!=IntPtr.Zero&&GetClientRect(target,out rect))jpeg=GameAudio.Screenshot(target,rect.Right,rect.Bottom);/* game window only, never MeguLit's layer (GameCapture.Picture) */}catch{}
                try{Emit(new{type="mediaClip",id=id,voiced=voiced,wav=wav,jpeg=jpeg,recording=Audio.Active,audioError=Audio.Error});}catch{}});}
        else if(type=="markerSource"){if(WaitMarker!=null)WaitMarker.SetSource(Str(d,"text"));}
        else if(type=="markerHookDrawn"){if(WaitMarker!=null)WaitMarker.HookDrawn();}
        else if(type=="source"){if(TextMask!=null)TextMask.SetSource(Str(d,"text"));if(WaitMarker!=null)WaitMarker.SetSource(Str(d,"text"));}
        else if(type=="toggleCover")ToggleCover();
        else if(type=="toggleMode")PageToggleMode();
        else if(type=="enterGame")EnterGamePending=!Bool(d,"cancel");
        else if(type=="expectExecutable"){WantedExecutable=Str(d,"path");NextAutoBind=DateTime.MinValue;}
        // MeguLit launched this process and saw its window come up: bind to its largest visible window right away.
        // If none is usable yet, remember the process (name + exact image) so the auto-bind loop picks it up.
        else if(type=="bindProcess"){uint pid=(uint)Int64.Parse(Str(d,"pid"));IntPtr best=IntPtr.Zero;long bestArea=0;
            EnumWindows(delegate(IntPtr candidate,IntPtr unused){uint owner;GetWindowThreadProcessId(candidate,out owner);Rect r;
                if(owner==pid&&candidate!=Overlay&&IsWindowVisible(candidate)&&!IsIconic(candidate)&&GetClientRect(candidate,out r)){long area=(long)r.Right*r.Bottom;if(area>bestArea){bestArea=area;best=candidate;}}return true;},IntPtr.Zero);
            string name=ProcessName(pid),image=ProcessImage(pid);if(name!="")WantedProcess=name;if(image!="")WantedExecutable=image;NextAutoBind=DateTime.MinValue;
            if(best!=IntPtr.Zero&&bestArea>=320L*240&&Target!=best){try{Bind(best);}catch{}}}
        else if(type=="bind"){WantedExecutable="";FindOverlay();if(Overlay!=IntPtr.Zero&&IsIconic(Overlay))ShowWindow(Overlay,4);if(d.TryGetValue("settings",out value)&&value is Dictionary<string,object>)Settings((Dictionary<string,object>)value);bool keepMenu=MenuOpen;InterfaceMode(true,false);if(keepMenu){MenuOpen=true;MenuFocusPending=true;}Bind(new IntPtr(Int64.Parse(Str(d,"hwnd"))),true);}
        else if(type=="configure"){if(!ModeConfigured&&d.ContainsKey("interfaceMode")){ModeConfigured=true;InterfaceMode(Str(d,"interfaceMode")=="translation",false);}Settings(d);WantedProcess=Bool(d,"bindEnabled")?Str(d,"gameProcess"):"";/* 2026-11-19 a remembered full path binds only that program (another game's BGI.exe is not this record); an old record without one still matches by name */if(Bool(d,"bindEnabled")&&WantedExecutable==""){string remembered=Str(d,"gameExecutable");if(remembered!="")WantedExecutable=remembered;}if(!Bool(d,"bindEnabled")&&(Target!=IntPtr.Zero||TrackedGame!=null)){RevealGame(Target);ForgetGame();Target=IntPtr.Zero;Restore();Emit(new{type="bound",bound=false,message="已解除窗口绑定"});}}
        else if(type=="pickWindow"){if(Bool(d,"active")){IntPtr fg=GetForegroundWindow();PickSkip=fg==IntPtr.Zero?IntPtr.Zero:GetAncestor(fg,2);PickUntil=DateTime.UtcNow.AddSeconds(15);}else PickUntil=DateTime.MinValue;Emit(new{type="pickWindow",active=PickUntil!=DateTime.MinValue});}
        else if(type=="unbind"){WantedExecutable="";WantedProcess="";RevealGame(Target);ForgetGame();Target=IntPtr.Zero;Restore();Emit(new{type="bound",bound=false,message="已解除窗口绑定"});}
        // The page passes where the button went down, so the strip stays under the same spot of the cursor even though
        // the drag only starts after a few pixels of movement.
        else if(type=="floatDrag"){if(TranslationMode&&Target==IntPtr.Zero&&Overlay!=IntPtr.Zero&&GetCursorPos(out DragStart)&&GetWindowRect(Overlay,out DragRect)){if(d.ContainsKey("x")&&d.ContainsKey("y")){DragStart.X=(int)Num(d,"x",DragStart.X);DragStart.Y=(int)Num(d,"y",DragStart.Y);}Dragging=true;}}
        else if(type=="menu"){LastReaderContext=null;ReaderLayerPolicy.Unsettle();bool open=Bool(d,"open");if(open!=MenuOpen)RegionAckPending=false;if(open&&!MenuOpen){MenuFocusPending=true;FindOverlay();if(Overlay!=IntPtr.Zero&&IsIconic(Overlay))ShowWindow(Overlay,4);}bool returning=MenuOpen&&!open&&TranslationMode&&Target!=IntPtr.Zero&&GetAncestor(GetForegroundWindow(),2)==Overlay;MenuOpen=open;ReaderActivationPolicy();RefreshReaderPointer();if(returning)SetForegroundWindow(GetAncestor(Target,2));if(!open){MenuRegionReady=false;MenuFocusPending=false;}if(open&&!TranslationMode&&PreferredOverlay==IntPtr.Zero){FindOverlay();if(Overlay!=IntPtr.Zero){
            // Only when needed: re-showing and re-activating the already visible, already active main window made it
            // hide and reappear once (with the Windows open animation) on the first menu after start.
            bool keepGame=FullscreenTarget()&&GetAncestor(GetForegroundWindow(),3)==GetAncestor(Target,3);if(!IsWindowVisible(Overlay))ShowWindow(Overlay,keepGame?4:5);if(!keepGame&&GetAncestor(GetForegroundWindow(),3)!=GetAncestor(Overlay,3))SetForegroundWindow(Overlay);IsShown=true;MenuFocusPending=false;}}}
        else if(type=="hitRegions"){MenuRegionReady=Bool(d,"menuOpen");HitRegions.Clear();object regions;if(d.TryGetValue("regions",out regions)&&regions is System.Collections.ArrayList){foreach(object item in (System.Collections.ArrayList)regions){var rect=item as Dictionary<string,object>;Rect bounds;if(HitRegions.Count>=256)break;if(ReadHitBounds(rect,out bounds))HitRegions.Add(new HitRegion{Bounds=bounds,Pass=Bool(rect,"pass"),Menu=Bool(rect,"menu"),Lookup=Bool(rect,"lookup")});}}
            LookupGrip=ReadLookupGrip(d);
            LookupDragRegion=TranslationMode&&HitRegions.Exists(h=>h.Lookup)?(int)Math.Max(0,Math.Min(Int32.MaxValue,Num(d,"lookupDrag",0))):0;
            RegionAckPending=MenuRegionReady;
            // Over a bound game apply the new region right away instead of in the next tick (which also captures the game
            // for text and marker detection and made the menu wait ~170 ms before it could open).
            if(TranslationMode&&Target!=IntPtr.Zero&&Overlay!=IntPtr.Zero&&Captured&&HasLastRect&&IsShown){ApplyRegion(LastRect.Right-LastRect.Left,LastRect.Bottom-LastRect.Top);AckRegion();}
            /* 2026-11-15 (user video: Alt+T resized by its edge showed blank areas and clipped content): the desktop-wide host
               (no bound game) applied a new region only on the next 100 ms tick, so the whole-layer region a drag or resize
               asks for arrived after the panel had already grown. Apply it at once here too. */
            else if(PreferredOverlay!=IntPtr.Zero&&(!TranslationMode||Target==IntPtr.Zero)&&Overlay!=IntPtr.Zero&&IsShown&&MenuOpen&&MenuRegionReady&&HitRegions.Count>0){Rect menuClient;if(GetClientRect(Overlay,out menuClient)){ApplyRegion(menuClient.Right,menuClient.Bottom);AckRegion();}}
            RefreshReaderPointer();}
        else if(type=="glass")GlassCommand(d);
        else if(type=="lookup"){bool open=Bool(d,"open");LookupOpen=open&&TranslationMode&&CoverEnabled;if(!open){LookupDragRegion=0;LookupGrip=null;}RefreshReaderPointer();}
        else if(type=="backlogHotkey")BacklogHotkeyConfigure(d);
        else if(type=="wheelDecision"){int id;if(PointerGate!=null&&Int32.TryParse(Str(d,"id"),out id))PointerGate.ResolveWheel(id,Bool(d,"panel"),Bool(d,"panelUp"));}
        else if(type=="quit")Running=false;
    }
    static bool ReaderMouseDown,ReaderSpaceDown,ReaderEnterDown,ReaderSkipHeld;
    static bool ReaderOwnsPointer(){Point screen,origin=new Point();if(Overlay==IntPtr.Zero||!IsShown||!GetCursorPos(out screen)||!ClientToScreen(Overlay,ref origin))return false;
        int x=screen.X-origin.X,y=screen.Y-origin.Y;return HitRegions.Exists(h=>!h.Pass&&x>=h.Bounds.Left&&x<h.Bounds.Right&&y>=h.Bounds.Top&&y<h.Bounds.Bottom);}
    static ReaderPointerGate PointerGate;
    /* 2026-11-15 (user: 「不要让幽灵窗口抢我桌面置顶」): set by the foreground hook and every tick; the glass host and the
       reading layer float above the game only while this holds (native/TopmostGuard.cs) */
    static volatile bool LayersMayFloat;
    static bool GameOnDesktop(){
        if(!IsWindowVisible(Target)||IsIconic(Target))return false;
        int cloaked;
        return DwmGetWindowAttribute(Target,14,out cloaked,4)!=0||cloaked==0;
    }
    /* Foreground / minimise event (TopmostGuard hook, runs in this thread's PeekMessage): the same decision as the tick,
       at once. Another program in front, the game minimised or gone: the layer leaves the topmost band directly above the
       game (under the program now in front), the glass host hides; minimised or gone also hides the layer and its masks. */
    static void GuardLayers(uint ev){
        if(Overlay==IntPtr.Zero||!TranslationMode||Target==IntPtr.Zero)return;
        IntPtr fgWindow=GetForegroundWindow(),fg=GetAncestor(fgWindow,3),gameRoot=GetAncestor(Target,3);
        bool alive=IsWindow(Target),iconic=alive&&!GameOnDesktop();
        /* no foreground window: an activation is in flight (menu closing, focus handed back to the game); the next event or tick decides */
        if(fgWindow==IntPtr.Zero&&alive&&!iconic)return;
        uint fgPid=0,gamePid=0;GetWindowThreadProcessId(fgWindow,out fgPid);if(alive)GetWindowThreadProcessId(Target,out gamePid);
        bool gameFront=alive&&(fg==gameRoot||fgPid!=0&&(fgPid==gamePid||ImeHost(ProcessName(fgPid))));
        bool ownFront=GetAncestor(fgWindow,2)==Overlay;
        /* #468: a screenshot tool in front of the game decides nothing; the layer stays where it is, in the picture */
        if(alive&&!iconic&&!gameFront&&!ownFront&&fgPid!=(uint)OverlayPid&&CaptureSurfaceFront(fg))return;
        bool ok=TopmostGuard.MayFloat(alive,iconic,gameFront,ownFront);
        LayersMayFloat=ok;
        if(ok){
            // Activation can reorder the game ahead of the reader before the next capture/placement tick.
            LastZCheck=DateTime.MinValue;
            if(IsShown&&IsWindowVisible(Overlay)&&!IsIconic(Overlay))KeepAboveGame(gameRoot,true);
            return;
        }
        if(!alive||iconic){
            if(IsShown||IsWindowVisible(Overlay))ShowWindow(Overlay,0);
            IsShown=false;DropLayers();return;
        }
        // Yield z-order to the foreground application without revealing the game's original text.
        if(IsShown&&TopmostGuard.Sink(Overlay,GetAncestor(Target,2)))
            Emit(new{type="coverDebug",text="前台换成了别的程序：阅读层保留在游戏正上方 (event "+ev.ToString("x")+")"});
        try{Glass.Hide();}catch{}
    }
    /* game gone or minimised: no MeguLit mask / marker / glass window stays on the desktop (they are created again on use) */
    static void DropLayers(){
        try{if(TextMask!=null)TextMask.Hide();}catch{}try{if(WaitMarker!=null)WaitMarker.Hide();}catch{}
        try{if(MaskLayer!=null)MaskLayer.Dispose();}catch{}try{Glass.Hide();}catch{}LayersMayFloat=false;
    }
    static int TopmostGuardSelfTest(){string r=TopmostGuard.WindowSelfTest();Emit(new{type="topmost-guard-selftest",passed=r=="",failure=r,minimiseMs=TopmostGuard.LastMinimiseMs});return r==""?0:12;}

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
    /* 2026-11-21 (owner, STEINS;GATE with the Alt+T panel pinned open: clicks on words advanced the game; the host logged no
       click at all while the panel was open): since 1.0.0 an open menu switched the gate off, so with the panel pinned every
       click on the reader's text went to the game. The gate stays on while the menu is open: the panel and the text regions
       are both MeguLit's (HitRegions carries both), everything else still reaches the game. */
    internal static bool PointerGateOn(bool translation,bool menuOpen,bool overlay,bool shown){return translation&&overlay&&shown;}
    static void RefreshReaderPointer(){
        if(PointerGate==null)return;
        Rect client;
        if(!PointerGateOn(TranslationMode,MenuOpen,Overlay!=IntPtr.Zero,IsShown)||!GetClientRect(Overlay,out client)){
            PointerGate.Current=null;return;
        }
        /* Issue #133 (WHITE ALBUM2: clicking a word went to the next line). The overlay floated unbound (Target zero), the
           gate was off, and the game, which polls the mouse button, took the click as well. Unbound, the gate still owns
           clicks on MeguLit's own text regions (never the whole overlay), so a polling game under it never sees them. */
        PointerGate.Current=new ReaderPointerGate.Context(Overlay,GetAncestor(Target,2),client,LookupOpen,
            HitRegions.FindAll(h=>!h.Pass).ConvertAll(h=>h.Bounds).ToArray(),
            HitRegions.FindAll(h=>h.Menu).ConvertAll(h=>h.Bounds).ToArray(),
            HitRegions.FindAll(h=>h.Lookup).ConvertAll(h=>h.Bounds).ToArray(),LookupGrip);
    }
    static bool? LastReaderContext;
    /* 2026-11-19 one reading of the foreground per tick and one decision for the layer (native/ReaderLayerPolicy.cs):
       float / shown / probes believed. Every place below uses it; none reads the foreground for itself any more. */
    static ReaderLayerPolicy.State Layer;static bool ProbesSettled;static string LastLayerKey="";
    static long NowMs(){return DateTime.UtcNow.Ticks/10000;}
    static int FrontNow(){
        IntPtr w=GetForegroundWindow();if(w==IntPtr.Zero)return ReaderLayerPolicy.None;
        IntPtr fg=GetAncestor(w,3);uint fgPid=0,gamePid=0;GetWindowThreadProcessId(w,out fgPid);
        bool target=Target!=IntPtr.Zero&&IsWindow(Target);if(target)GetWindowThreadProcessId(Target,out gamePid);
        return ReaderLayerPolicy.Classify(true,target&&fg==GetAncestor(Target,3),target&&fgPid!=0&&(fgPid==gamePid||ImeHost(ProcessName(fgPid))),Overlay!=IntPtr.Zero&&GetAncestor(w,2)==Overlay,fgPid!=0&&fgPid==(uint)OverlayPid,target&&CaptureSurfaceFront(fg));}
    /* #468: is this foreground root a screenshot surface over the game (ReaderLayerPolicy.CaptureSurface)? */
    static bool CaptureSurfaceFront(IntPtr fg){
        if(fg==IntPtr.Zero||Target==IntPtr.Zero||!IsWindow(Target))return false;
        int style=GetWindowLong(fg,-16),ex=GetWindowLong(fg,-20);Rect w,c;var o=new Point();
        if(!GetWindowRect(fg,out w)||!GetClientRect(Target,out c)||!ClientToScreen(Target,ref o))return false;
        bool covers=w.Left<=o.X&&w.Top<=o.Y&&w.Right>=o.X+c.Right&&w.Bottom>=o.Y+c.Bottom;
        return ReaderLayerPolicy.CaptureSurface((ex&8)!=0,(style&0x00C00000)==0x00C00000,covers,IsIconic(Target));}
    static ReaderLayerPolicy.State DecideLayer(){
        bool bound=TranslationMode&&Target!=IntPtr.Zero&&IsWindow(Target);
        var s=ReaderLayerPolicy.Decide(bound?FrontNow():ReaderLayerPolicy.Foreign,MenuOpen,MenuRegionReady,PreferredOverlay!=IntPtr.Zero,bound&&!GameOnDesktop(),NowMs());
        if(!bound){s.Float=false;s.Pinned=false;s.Context=false;}
        /* every change is logged (reader-host.log "layerState"): a report of the text vanishing is matched against it */
        string key=s.Front+"|"+s.Float+"|"+s.Context+"|"+s.Pinned+"|"+MenuOpen+"|"+IsShown+"|"+DialogVisible+"|"+CoverEnabled;
        if(bound&&key!=LastLayerKey){LastLayerKey=key;/* the place is checked in this pass, not up to 250 ms later */LastZCheck=DateTime.MinValue;Emit(new{type="layerState",front=s.Front,floating=s.Float,context=s.Context,pinned=s.Pinned,menu=MenuOpen,shown=IsShown,dialog=DialogVisible,cover=CoverEnabled,topmost=Overlay!=IntPtr.Zero&&(GetWindowLong(Overlay,-20)&8)!=0});}
        return s;}
    static void ReaderInputTick(bool foregroundGame){ReaderActivationPolicy();RefreshReaderPointer();
        bool mouse=(GetAsyncKeyState(0x01)&0x8000)!=0,space=(GetAsyncKeyState(0x20)&0x8000)!=0,enter=(GetAsyncKeyState(0x0d)&0x8000)!=0;
        bool allowed=foregroundGame&&!MenuOpen&&!LookupOpen&&CoverEnabled&&!IsIconic(Target);
        /* the probes are believed only after the game has been back in front, menu and word card closed, for the settle time; a click or key below is a fact and is reported at once */
        bool settled=ReaderLayerPolicy.Settled(allowed,NowMs());ProbesSettled=settled;
        if(LastReaderContext!=settled){LastReaderContext=settled;if(WaitMarker!=null)WaitMarker.ResetPresence();Emit(new{type="readerContext",active=settled});}
        bool complete=allowed&&((mouse&&!ReaderMouseDown&&!ReaderOwnsPointer())||(space&&!ReaderSpaceDown)||(enter&&!ReaderEnterDown));
        bool skip=allowed&&(GetAsyncKeyState(0x11)&0x8000)!=0;
        ReaderMouseDown=mouse;ReaderSpaceDown=space;ReaderEnterDown=enter;
        if(complete||skip!=ReaderSkipHeld)Emit(new{type="readerInput",complete=complete,skipHeld=skip});
        ReaderSkipHeld=skip;
    }
    /* 2026-11-26 (QQ essence 1144, Danganronpa V3 and other games that hide and lock the mouse: with the Alt+T panel open the pointer
       stayed locked to the game and invisible, so no setting could be changed). While the panel (or a word card) is open the cursor
       clip is lifted; it is given back to the game when the panel closes. Guess: a game that also
       re-centres the pointer itself every frame (SetCursorPos) is not helped by this, it needs the hook layer.
       RRFZ #1177: ShowCursor only counts for the calling thread, so it never showed a cursor the game hid and only piled up a count
       on every 16 ms tick; it is gone. The clip is touched only in translation mode with a
       bound game while the game or the reader layer is in front; leaving for another program forgets the saved clip, the game
       sets its own again when it is activated. */
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] static extern bool ClipCursor(IntPtr rect);
    [DllImport("user32.dll")] static extern bool GetClipCursor(out Rect rect);
    [DllImport("user32.dll",EntryPoint="ClipCursor")] static extern bool ClipCursorTo(ref Rect rect);
    static bool CursorFreed;static Rect CursorClip;
    /* 0 nothing, 1 lift the clip, 2 give the saved clip back, 3 forget it (another program is in front) */
    internal static int CursorStep(bool panel,bool ours,bool freed){return !ours?(freed?3:0):panel?(freed?0:1):(freed?2:0);}
    internal static bool ClipIsTight(Rect clip,Rect screen){return clip.Right-clip.Left<screen.Right-screen.Left||clip.Bottom-clip.Top<screen.Bottom-screen.Top;}
    static Rect VirtualScreen(){return new Rect(GetSystemMetrics(76),GetSystemMetrics(77),GetSystemMetrics(76)+GetSystemMetrics(78),GetSystemMetrics(77)+GetSystemMetrics(79));}
    static void FreeCursorForMenu(bool wanted,bool ours){
        try{
            int step=CursorStep(wanted,ours,CursorFreed);
            if(step==3)CursorFreed=false;
            else if(step==1){
                Rect clip;
                if(GetClipCursor(out clip)&&ClipIsTight(clip,VirtualScreen())){CursorClip=clip;ClipCursor(IntPtr.Zero);CursorFreed=true;}
            }else if(step==2){
                /* a game that set its clip once gets it back (Codex #1177); one that set a new clip meanwhile keeps its own */
                Rect now;if(CursorFreed&&!(GetClipCursor(out now)&&ClipIsTight(now,VirtualScreen())))ClipCursorTo(ref CursorClip);
                CursorFreed=false;
            }
        }catch{}
    }
    static void Tick(){
        if(HookVerifier!=null)HookVerifier.Tick();
        FindOverlay();if(Overlay==IntPtr.Zero)return;
        if(CheckGameExit())return;
        {IntPtr front=GetAncestor(GetForegroundWindow(),3);FreeCursorForMenu(MenuOpen||LookupOpen,TranslationMode&&Target!=IntPtr.Zero&&front!=IntPtr.Zero&&(front==GetAncestor(Target,3)||front==GetAncestor(Overlay,3)));}
        // Demote inherited/older topmost state in every mode, including minimised or foreign-application states.
        bool foregroundGame=TranslationMode&&Target!=IntPtr.Zero&&IsWindow(Target)&&!IsIconic(Overlay)&&GetAncestor(GetForegroundWindow(),3)==GetAncestor(Target,3);
        Layer=DecideLayer();
        ReaderInputTick(foregroundGame);
        bool sceneInput=foregroundGame&&!MenuOpen&&!LookupOpen&&((GetAsyncKeyState(0x01)<0||GetAsyncKeyState(0x02)<0)&&!ReaderOwnsPointer()||GetAsyncKeyState(0x1B)<0||GetAsyncKeyState(0x20)<0||GetAsyncKeyState(0x0D)<0);
        if(sceneInput&&!ReaderMenuDown){GameUi.Clear();Scene.Input();}ReaderMenuDown=sceneInput;
        if(foregroundGame&&GetAsyncKeyState(0x11)<0)Scene.Input();
        Rect uiRect;var uiOrigin=new Point();
        if(Target!=IntPtr.Zero&&GetClientRect(Target,out uiRect)&&ClientToScreen(Target,ref uiOrigin))GameUi.Tick(Target,new System.Drawing.Rectangle(uiOrigin.X,uiOrigin.Y,uiRect.Right,uiRect.Bottom),foregroundGame&&!MenuOpen&&!LookupOpen&&!IsIconic(Target));
        else GameUi.Clear();
        /* E578: the text-window probe runs with immersion off too (Scene.Full limits the rest to immersion) */
        if(ProbesSettled&&Target!=IntPtr.Zero&&!GameCapture.Busy(Target)){
            Rect sceneRect;var sceneOrigin=new Point();if(GetClientRect(Target,out sceneRect)&&ClientToScreen(Target,ref sceneOrigin)){
                /* E322: the game window itself, never the screen with MeguLit's own layer on it */string kept=Scene.Reason;bool? present=Scene.Tick(Target,sceneRect.Right,sceneRect.Bottom);if(present.HasValue)Emit(new{type="dialogScene",visible=present.Value,reason=Scene.Reason,box=Scene.Box});else if(Scene.Reason!=kept&&Scene.Reason.StartsWith("kept"))Emit(new{type="dialogSceneKept",reason=Scene.Reason});
            }
        }
        LayersMayFloat=Layer.Float;
        if(!Layer.Float&&(GetWindowLong(Overlay,-20)&8)!=0){if(Target!=IntPtr.Zero&&IsWindow(Target)){/* only a layer that stays visible leaves the topmost band; one that is hidden below keeps its place for the return */if(ReaderLayerPolicy.SinkOnLeave(Layer.Context&&!IsIconic(Target)))TopmostGuard.Sink(Overlay,GetAncestor(Target,2));}else SetWindowPos(Overlay,new IntPtr(-2),0,0,0,0,0x0001|0x0002|0x0010);}
        if(IsIconic(Overlay)){MenuFocusPending=false;if(MaskLayer!=null)MaskLayer.Hide();if(TextMask!=null)TextMask.Hide();if(WaitMarker!=null)WaitMarker.Hide();return;}
        if(Dragging)DragTick();
        // Keep the current surface during the first menu construction instead of hiding and immediately showing it again.
        if(TranslationMode&&MenuOpen&&!MenuRegionReady)return;
        // A closed or restarted game must be noticed in every mode; this check used to run only in translation mode,
        // so after a game restart in normal mode the hook kept targeting the dead process and never rebound.
        if(Target!=IntPtr.Zero&&!IsWindow(Target)){Target=IntPtr.Zero;Restore();Emit(new{type="bound",bound=false,message="游戏窗口已关闭，等待再次启动"});}
        if(Target==IntPtr.Zero&&WantedProcess!=""&&(DateTime.UtcNow>=NextAutoBind||AutoBindKick&&DateTime.UtcNow>=LastAutoScan.AddMilliseconds(150))){
            AutoBindKick=false;LastAutoScan=DateTime.UtcNow;NextAutoBind=DateTime.UtcNow.AddSeconds(1);
            // Never enumerate the names of every desktop process 10 times a second while a game is minimised.
            // Resolve the remembered process once, then inspect only its windows without activating/restoring them.
            var pids=new HashSet<uint>();foreach(var process in Process.GetProcessesByName(WantedProcess))using(process){try{if(WantedExecutable==""||SameImage(ProcessImage((uint)process.Id),WantedExecutable))pids.Add((uint)process.Id);}catch{}}
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
        if(!TranslationMode){if((GetWindowLong(Overlay,-20)&8)!=0&&ReaderLayerPolicy.SinkOnLeave(IsWindowVisible(Overlay)))TopmostGuard.Sink(Overlay,IntPtr.Zero);if(TextMask!=null)TextMask.Hide();if(WaitMarker!=null)WaitMarker.Hide();if(DateTime.UtcNow<NormalShowUntil&&!IsWindowVisible(Overlay))IsShown=TopmostGuard.ShowAtBottom(Overlay);KeepPlacement();return;}
        if(Target==IntPtr.Zero){
            Capture();if(!FloatingPlaced){Rect r=FloatingBase();SetWindowPos(Overlay,new IntPtr(1),r.Left+FloatDX,r.Top+FloatDY,r.Right-r.Left,r.Bottom-r.Top,0x0020|0x0010);FloatingPlaced=true;}
            Rect floatingClient;if(GetClientRect(Overlay,out floatingClient))ApplyRegion(floatingClient.Right,floatingClient.Bottom);
            if(!CoverEnabled&&!(MenuOpen&&MenuRegionReady)){if(IsShown)HideReason("floating, cover off");ShowWindow(Overlay,0);IsShown=false;}else if(!IsShown){if(MenuOpen&&MenuRegionReady){ShowWindow(Overlay,4);IsShown=true;}else IsShown=TopmostGuard.ShowAtBottom(Overlay);}
            if(IsShown)AckRegion();
            FocusMenuOnce();
        }
        if(Target==IntPtr.Zero){if(TextMask!=null)TextMask.Hide();if(WaitMarker!=null)WaitMarker.Hide();return;}
        if(!IsWindow(Target)){Target=IntPtr.Zero;DropLayers();Restore();Emit(new{type="bound",bound=false,message="游戏窗口已关闭，等待再次启动"});return;}
        IntPtr fg=GetAncestor(GetForegroundWindow(),3),gameRoot=GetAncestor(Target,3),overlayRoot=GetAncestor(Overlay,3);
        Rect probeRect;if(VisualDetection&&GetClientRect(Target,out probeRect)){bool? presence=Dialog.Tick(Target,probeRect.Right,probeRect.Bottom);if(presence.HasValue)Emit(new{type="dialogEvidence",visible=presence.Value});}
        // The game's own popups (IME candidate list, dialogs) belong to its process but not to its window tree: the IME
        // list of a Chinese input method used to hide the whole reading layer as "fg=other" in Subahibi.
        uint fgPid=0,gamePid=0;GetWindowThreadProcessId(GetForegroundWindow(),out fgPid);GetWindowThreadProcessId(Target,out gamePid);bool gameOwned=Layer.Front==ReaderLayerPolicy.Game;
        bool contextActive=gameOwned||Layer.Front==ReaderLayerPolicy.OwnLayer;
        bool visible=ReadingVisible(Layer.Context,IsIconic(Target),IsIconic(Overlay),CoverEnabled,DialogVisible,MenuOpen);
        if(!contextActive)MenuFocusPending=false;
        if(!visible){if(IsShown){HideReason("menu="+MenuOpen+"/"+MenuRegionReady+" cover="+CoverEnabled+" dialog="+DialogVisible+" iconic="+IsIconic(Target)+" fg="+(fg==gameRoot?"game":fg==overlayRoot?"overlay":"other"));ShowWindow(Overlay,0);}IsShown=false;if(TextMask!=null)TextMask.Hide();
            // Hidden only because no dialogue was detected: keep looking for the wait marker, so its return brings the layer back.
            Rect probeClient;Point probeOrigin=new Point();
            if(contextActive&&WaitMarker!=null&&WaitMarker.PresenceWanted&&!DialogVisible&&CoverEnabled&&!IsIconic(Target)&&GetClientRect(Target,out probeClient)&&ClientToScreen(Target,ref probeOrigin)){WaitMarker.ProbeOnly=true;WaitMarker.ScreenX=probeOrigin.X;WaitMarker.ScreenY=probeOrigin.Y;WaitMarker.Tick(Target,probeClient.Right,probeClient.Bottom,true,0,0);}
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
        if(!HasLastRect||localReader.Left!=LastReaderRect.Left||localReader.Top!=LastReaderRect.Top||localReader.Right!=LastReaderRect.Right||localReader.Bottom!=LastReaderRect.Bottom||box.Right-box.Left!=LastRect.Right-LastRect.Left||box.Bottom-box.Top!=LastRect.Bottom-LastRect.Top){var scan=TextMask!=null?TextMask.SurfaceRegion(client.Right,client.Bottom):System.Drawing.Rectangle.Empty;Emit(new{type="layout",clientWidth=layoutW,clientHeight=layoutH,clientX=layoutX-box.Left,clientY=layoutY-box.Top,magpie=magpie,readerX=localReader.Left,readerY=localReader.Top,readerWidth=localReader.Right-localReader.Left,readerHeight=localReader.Bottom-localReader.Top,workBottom=WorkBottom(area)-box.Top,surfaceWidth=box.Right-box.Left,surfaceHeight=box.Bottom-box.Top,maskX=scan.X-(box.Left-origin.X),maskY=scan.Y-(box.Top-origin.Y)});LastReaderRect=localReader;}
        ApplyRegion(box.Right-box.Left,box.Bottom-box.Top);
        /* 2026-11-13 (live test, game relaunched while bound: the reader stayed at the floating 160x28 spot at the screen bottom and
           the opening and first lines never showed, while the game hid its own text): the cached LastRect said the window
           was already placed. The real window rect is checked too, so a window moved by any other path is put back. */
        Rect placed;bool strayed=HasLastRect&&GetWindowRect(Overlay,out placed)&&(placed.Left!=box.Left||placed.Top!=box.Top||placed.Right!=box.Right||placed.Bottom!=box.Bottom);
        if(strayed||!HasLastRect||!IsShown||box.Left!=LastRect.Left||box.Top!=LastRect.Top||box.Right!=LastRect.Right||box.Bottom!=LastRect.Bottom){SetWindowPos(Overlay,Layer.Float?new IntPtr(-1):TopmostGuard.Slot(Overlay,GetAncestor(Target,2)),box.Left,box.Top,box.Right-box.Left,box.Bottom-box.Top,(uint)(0x0010|0x0040|(!HasLastRect?0x0020:0)));LastRect=box;HasLastRect=true;}IsShown=true;AckRegion();
        FocusMenuOnce();
        /* 2026-11-14 (user, beta.36: a translation drawn big over MeguLit's own game page while a file picker was open):
           with a MeguLit window in front the layer went directly under that window. An unowned window of MeguLit (the file
           picker, a popup) is its own root, so the layer landed above the main window. The layer now sits directly above the
           game, under every other window, so it only ever covers the game. */
        KeepAboveGame(gameRoot,Layer.Float);
        if(magpie&&contextActive&&(DateTime.UtcNow-MagpieRaisedAt).TotalMilliseconds>250){MagpieRaisedAt=DateTime.UtcNow;SetWindowPos(Overlay,new IntPtr(-1),0,0,0,0,0x0001|0x0002|0x0010);}
        /* Magpie pauses while its source window is not in front: outside the Alt+T menu (which needs the keyboard and hands focus back when it closes) the reading layer never keeps the foreground from the scaled game. */
        if(magpie&&!MenuOpen&&fg==overlayRoot&&(DateTime.UtcNow-MagpieFocusAt).TotalMilliseconds>400){MagpieFocusAt=DateTime.UtcNow;SetForegroundWindow(gameRoot);}
        MaskLayer.Origin(Overlay,Target,box.Left,box.Top);
        // Keep the last cover when another application can obscure the area being sampled.
        if(contextActive&&TextMask!=null)TextMask.Tick(Target,origin.X,origin.Y,client.Right,client.Bottom,CoverEnabled,box.Left-origin.X,box.Top-origin.Y);
        if(contextActive&&WaitMarker!=null){WaitMarker.ProbeOnly=false;WaitMarker.ScreenX=origin.X;WaitMarker.ScreenY=origin.Y;WaitMarker.Tick(Target,client.Right,client.Bottom,CoverEnabled,box.Left-origin.X,box.Top-origin.Y);}
    }
    [DllImport("user32.dll")]static extern void DisableProcessWindowsGhosting();
    public static void NoGhostWindows(){try{DisableProcessWindowsGhosting();}catch{}}
    public static int Main(string[] args){
        Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
        /* Its glass and mask layers sit over the game: a stalled moment must never turn them into blue-captioned ghosts. */
        NoGhostWindows();
        if(args.Length==3&&args[0]=="--same-image"){Emit(new{type="sameImage",same=SameImage(args[1],args[2]),a=ImageIdentity(args[1]),b=ImageIdentity(args[2])});return 0;}
        if(args.Length>0&&args[0]=="--topmost-guard-self-test")return TopmostGuardSelfTest();
        if(args.Length>0&&args[0]=="--background-window-self-test"){
            string failure=TopmostGuard.BackgroundShowSelfTest();
            Emit(new{type="background-window-selftest",passed=failure=="",failure=failure});return failure==""?0:12;
        }
        if(args.Length>0&&args[0]=="--layer-policy-self-test"){string failure=ReaderLayerPolicy.SelfTest();Emit(new{type="layer-policy-selftest",passed=failure=="",failure=failure});return failure==""?0:1;}
        if(args.Length>0&&args[0]=="--host-frame-self-test"){
            int original=0x16cf0000,hosted=HostedStyle(original);
            if((hosted&0x00c40000)!=0||(hosted&unchecked((int)0x80000000))==0||HostedStyle(hosted)!=hosted)return 8;
            Emit(new{type="host-frame-selftest",passed=true,noCaption=true,noResizeFrame=true,popup=true});return 0;
        }
        if(args.Length>0&&args[0]=="--game-window-policy-self-test"){
            using(var fixture=new System.Windows.Forms.Form{StartPosition=System.Windows.Forms.FormStartPosition.Manual,Location=new System.Drawing.Point(-32000,-32000),ShowInTaskbar=false}){fixture.Text="MeguLit hidden game fixture";Target=fixture.Handle;TrackedGame=Process.GetCurrentProcess();TrackedGameStarted=TrackedGame.StartTime.ToUniversalTime().Ticks;WindowGoneAt=DateTime.UtcNow.AddSeconds(-10);
                bool preserved=!CheckGameExit()&&WindowGoneAt==DateTime.MinValue;
                ForgetGame();Target=IntPtr.Zero;if(!preserved)return 9;
                Emit(new{type="game-window-policy-selftest",passed=true,hiddenWindowPreserved=true});return 0;
            }
        }
        if(args.Length>=1&&args[0]=="--page-locator-ocr-test"){string r=PageLocator.OcrSelfTest(args.Length>1?args[1]:null);Console.WriteLine(r=="0"?"PASS page locator OCR: three drawn paragraphs found, wrapped where they were drawn, boxes at the drawn margin":(r.StartsWith("skip")?"SKIP "+r:"FAIL page locator OCR: "+r));return r=="0"||r.StartsWith("skip")?0:13;}
        if(args.Length==3&&args[0]=="--choice-file"){Console.OutputEncoding=Encoding.UTF8;Console.Write(PageLocator.ChoiceFile(args[1],args[2]));return 0;}
if(args.Length==2&&args[0]=="--art-scan-file"){Console.OutputEncoding=Encoding.UTF8;Console.Write(PageLocator.ScanFile(args[1]));return 0;}
        if(args.Length>=1&&args[0]=="--art-scan-mask-test"){string r=PageLocator.ScanMaskSelfTest(args.Length>1?args[1]:null);Console.WriteLine(r=="0"?"PASS art scan mask: MeguLit's menu over a corner painted out, only the game's quote read":r.StartsWith("skip")?"SKIP "+r:"FAIL art scan mask: "+r);return r=="0"||r.StartsWith("skip")?0:1;}
        if(args.Length>=2&&args[0]=="--art-scan-image"){Console.OutputEncoding=new System.Text.UTF8Encoding(false);Console.WriteLine(PageLocator.ScanImage(args[1],args.Length>2?args[2]:null));return 0;}
        if(args.Length>=1&&args[0]=="--art-scan-ocr-test"){string r=PageLocator.ScanOcrSelfTest(args.Length>1?args[1]:null);Console.WriteLine(r=="0"?"PASS art scan OCR: centred opening lines read and grouped, the text box with its name and dialogue left out":(r.StartsWith("skip")?"SKIP "+r:"FAIL art scan OCR: "+r));return r=="0"||r.StartsWith("skip")?0:15;}
        if(args.Length==1&&args[0]=="--art-scan-self-test"){string r=PageLocator.ScanSelfTest();Console.WriteLine(r=="0"?"PASS art scan: Japanese rows outside the dialogue grouped, shown after two reads, hidden after two misses":"FAIL art scan: "+r);return r=="0"?0:14;}
        if(args.Length==1&&args[0]=="--page-locator-self-test"){bool passed=PageLocator.SelfTest();Console.WriteLine(passed?"PASS page locator: hook line aligned to OCR rows, split where the game wrapped, OCR mistakes tolerated, punctuation kept on its row":"FAIL page locator");return passed?0:12;}
        if(args.Length==1&&args[0]=="--wait-page-marker-self-test"){bool passed=WaitPageMarker.SelfTest();Emit(new{type="wait-page-marker-selftest",passed=passed});return passed?0:10;}
        if(args.Length==1&&args[0]=="--reader-pointer-self-test"){bool passed=ReaderPointerGate.SelfTest();Emit(new{type="reader-pointer-selftest",passed=passed});return passed?0:11;}
        if(args.Length>0&&args[0]=="--diagnose"){Diagnose();return 0;}
        if(args.Length==2&&args[0]=="--process-status"){
            string wanted=Path.GetFullPath(args[1]);var matches=new List<object>();
            foreach(var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(wanted)))using(process){try{
                if(SameImage(ProcessImage((uint)process.Id),wanted))matches.Add(new{pid=process.Id,visible=HasVisibleWindow((uint)process.Id),started=process.StartTime.ToUniversalTime().Ticks.ToString()});
            }catch{}}
            Emit(new{type="gameProcesses",processes=matches});return 0;
        }
        if(args.Length>0&&args[0]=="--mask-self-test"){
            try{int count=GameTextMask.SelfTest(args.Length>1?args[1]:null);Emit(new{type="mask-selftest",passed=true,words=count,fastPathMilliseconds=GameTextMask.LastFastTestMilliseconds});return 0;}catch(Exception error){Emit(new{type="mask-selftest",passed=false,message=error.Message});return 3;}
        }
        if(args.Length>0&&args[0]=="--mode-self-test"){
            if(!GameSceneProbe.SelfTest())return 6;
            if(!GameCapture.FreezeSelfTest())return 10;
            if(!GameAudio.ClientShotSelfTest())return 9;
            /* the log key: Alt/Ctrl + a letter only; held only for a bound game in front in translation mode */
            if(!BacklogKeyValid(1,0x4C)||!BacklogKeyValid(3,0x4C)||BacklogKeyValid(4,0x4C)||BacklogKeyValid(0,0x4C)||BacklogKeyValid(1,0x54+0x20)||BacklogKeyValid(9,0x4C)||
               !BacklogKeyWanted(true,true,true,true)||BacklogKeyWanted(false,true,true,true)||BacklogKeyWanted(true,false,true,true)||BacklogKeyWanted(true,true,false,true)||BacklogKeyWanted(true,true,true,false))return 11;
            {var t0=new DateTime(2026,1,1,0,0,0,DateTimeKind.Utc);if(!BacklogRetryWait(1,0x4C,1,0x4C,t0,t0.AddMilliseconds(1500))||BacklogRetryWait(1,0x4C,1,0x4C,t0.AddMilliseconds(1500),t0.AddMilliseconds(1500))||BacklogRetryWait(3,0x4C,1,0x4C,t0,t0.AddSeconds(1))||BacklogRetryWait(1,0x42,1,0x4C,t0,t0.AddSeconds(1))||BacklogRetryWait(0,0,0,0,t0,t0.AddSeconds(1)))return 11;}
            Command(new Dictionary<string,object>{{"type","backlogHotkey"},{"modifiers",1},{"key",0x4C}});if(BacklogKey!=0x4C||BacklogMods!=1)return 11;
            Command(new Dictionary<string,object>{{"type","backlogHotkey"},{"modifiers",0},{"key",0x4C}});if(BacklogKey!=0)return 11;
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
            if(CursorStep(true,true,false)!=1||CursorStep(true,true,true)!=0||CursorStep(false,true,true)!=2||CursorStep(false,true,false)!=0||CursorStep(true,false,true)!=3||CursorStep(true,false,false)!=0||CursorStep(false,false,true)!=3)return 9;
            if(!ClipIsTight(new Rect(960,540,961,541),new Rect(0,0,1920,1080))||ClipIsTight(new Rect(0,0,1920,1080),new Rect(0,0,1920,1080))||!ClipIsTight(new Rect(0,0,1280,720),new Rect(0,0,1920,1080)))return 9;
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
        HookVerifier=new GameHookVerifier(Emit);MaskLayer=new NativeMaskLayer();TextMask=new GameTextMask(MaskOutput);
        WaitMarker=new GameWaitMarker(Emit);
        try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
        PointerGate=new ReaderPointerGate(Emit);
        TopmostGuard.Install((ev,h)=>GuardLayers(ev));
        InstallShowWatch();
        /* 2026-11-19 test copies running side by side (MEGULIT_NO_HOTKEYS=1): a copy in the background took Alt+T/H/M from the copy
           in front and bound the wrong game; such a copy registers no global key at all, never retries and never ends other
           helpers. Unset, everything below runs as before (users never set it) */
        bool noHotkeys=Environment.GetEnvironmentVariable("MEGULIT_NO_HOTKEYS")=="1";
        bool hotkey=!noHotkeys&&RegisterHotKey(IntPtr.Zero,0x541,0x4001,0x54),coverHotkey=!noHotkeys&&RegisterHotKey(IntPtr.Zero,0x542,0x4001,0x48),modeHotkey=!noHotkeys&&RegisterHotKey(IntPtr.Zero,0x543,0x4001,0x4d);
        /* E476: a helper left running by another MeguLit folder (an older download) holds Alt+T: end it and take the keys */
        /* E540: side-by-side test copies (MEGULIT_SIDE_BY_SIDE=1, E530) share the PC with other MeguLit folders on purpose;
           ending their helpers unbound every other copy's game, so a side-by-side copy goes without Alt+T instead */
        bool sideBySide=Environment.GetEnvironmentVariable("MEGULIT_SIDE_BY_SIDE")=="1";
        if(!sideBySide&&!noHotkeys&&(!hotkey||!coverHotkey||!modeHotkey)){if(EndForeignBridges()>0){Thread.Sleep(300);if(!hotkey)hotkey=RegisterHotKey(IntPtr.Zero,0x541,0x4001,0x54);if(!coverHotkey)coverHotkey=RegisterHotKey(IntPtr.Zero,0x542,0x4001,0x48);if(!modeHotkey)modeHotkey=RegisterHotKey(IntPtr.Zero,0x543,0x4001,0x4d);}}
        Emit(new{type="ready",hotkey=hotkey,coverHotkey=coverHotkey,modeHotkey=modeHotkey,coverEnabled=true,interfaceMode="normal"});
        DateTime nextHotkeyTry=DateTime.UtcNow.AddSeconds(2);
        var input=new Thread(delegate(){string line;while((line=Console.ReadLine())!=null){try{var command=Json.Deserialize<Dictionary<string,object>>(line);if(Str(command,"type")=="glass"){GlassCommand(command);continue;}Commands.Enqueue(command);}catch{}}Running=false;});input.IsBackground=true;input.Start();
        try{while(Running){Dictionary<string,object> command;while(Commands.TryDequeue(out command)){try{Command(command);}catch(Exception error){Emit(new{type="error",message=error.Message});}}Msg message;while(PeekMessage(out message,IntPtr.Zero,0,0,1)){if(message.message==0x0312)MaskAltRelease();if(message.message==0x0312&&message.wParam.ToUInt64()==0x544){Emit(new{type="backlogHotkey"});}else if(message.message==0x0312&&message.wParam.ToUInt64()==0x543){BindHotkey();}else if(message.message==0x0312&&message.wParam.ToUInt64()==0x542){ToggleCover();}else if(message.message==0x0312){Emit(new{type="hotkey"});}else{TranslateMessage(ref message);DispatchMessage(ref message);}}try{ModeRequestTick();PickTick();Tick();}catch{}try{BacklogHotkeyTick(noHotkeys);}catch{}
          /* E476: keys another program held are taken as soon as it lets go, so "not ready" heals by itself */
          if(!noHotkeys&&(!hotkey||!coverHotkey||!modeHotkey)&&DateTime.UtcNow>=nextHotkeyTry){nextHotkeyTry=DateTime.UtcNow.AddSeconds(2);bool was=hotkey&&coverHotkey&&modeHotkey;if(!hotkey)hotkey=RegisterHotKey(IntPtr.Zero,0x541,0x4001,0x54);if(!coverHotkey)coverHotkey=RegisterHotKey(IntPtr.Zero,0x542,0x4001,0x48);if(!modeHotkey)modeHotkey=RegisterHotKey(IntPtr.Zero,0x543,0x4001,0x4d);if(hotkey||coverHotkey||modeHotkey)Emit(new{type="hotkeyState",hotkey=hotkey,coverHotkey=coverHotkey,modeHotkey=modeHotkey});}
          try{Glass.Follow(Overlay,TranslationMode&&Target!=IntPtr.Zero&&LayersMayFloat&&IsShown&&Overlay!=IntPtr.Zero&&IsWindowVisible(Overlay)&&!IsIconic(Overlay)&&!IsIconic(Target));}catch{}Thread.Sleep(Dragging?8:Target==IntPtr.Zero?250:16);}}
        finally{RevealGame(Target);TopmostGuard.Uninstall();UninstallShowWatch();ForgetGame();if(HookVerifier!=null)HookVerifier.Dispose();Restore();TextMask.Dispose();WaitMarker.Dispose();MaskLayer.Dispose();Glass.Dispose();if(hotkey)UnregisterHotKey(IntPtr.Zero,0x541);if(coverHotkey)UnregisterHotKey(IntPtr.Zero,0x542);if(modeHotkey)UnregisterHotKey(IntPtr.Zero,0x543);if(BacklogHeldKey!=0)UnregisterHotKey(IntPtr.Zero,0x544);}return 0;
    }
}
