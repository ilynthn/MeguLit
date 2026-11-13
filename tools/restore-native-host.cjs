const fs=require('node:fs'),path=require('node:path'),r=path.resolve(__dirname,'..')+path.sep,src=r+'migration/original-overlay-20261104/native/';
// Without the private migration snapshot the committed native sources are already the restored, maintained host.
if(!fs.existsSync(src)){console.log('Native host: using committed sources');process.exit(0);}
const names=['GalWindowBridge.cs','GameTextMask.cs','GameWaitMarker.cs','NativeMaskLayer.cs','DialogDetector.cs','GameHookVerifier.cs','GameCapture.cs','GameAudio.cs','GlassLayer.cs'];for(const n of names)fs.copyFileSync(src+n,r+'native/'+n);
const p=r+'native/GalWindowBridge.cs';let s=fs.readFileSync(p,'latin1');function rep(a,b){if(!s.includes(a))throw Error('Missing native host anchor '+a.slice(0,70));s=s.replace(a,b);}
if(!s.includes('PreferredOverlay')){
 rep('static void FindOverlay(){','static IntPtr PreferredOverlay=IntPtr.Zero;\r\n    static void FindOverlay(){\r\n        if(PreferredOverlay!=IntPtr.Zero&&IsWindow(PreferredOverlay)){uint owner;GetWindowThreadProcessId(PreferredOverlay,out owner);if(owner==OverlayPid){Overlay=PreferredOverlay;return;}}');
 rep('if(args.Length!=1||!Int32.TryParse(args[0],out OverlayPid))return 2;','if((args.Length!=1&&args.Length!=2)||!Int32.TryParse(args[0],out OverlayPid))return 2;\r\n        if(args.Length==2){long handle;if(!Int64.TryParse(args[1],out handle))return 2;PreferredOverlay=new IntPtr(handle);uint owner;GetWindowThreadProcessId(PreferredOverlay,out owner);if(owner!=OverlayPid)return 2;}');
}
rep('message.wParam.ToUInt64()==0x543){RequestModeToggle();}', 'message.wParam.ToUInt64()==0x543){Emit(new{type="homeHotkey"});}');
rep('static DateTime LastZCheck=DateTime.MinValue;', 'static DateTime LastZCheck=DateTime.MinValue;static IntPtr LastHomeForeground;');
rep('bool contextActive=gameOwned||fg==overlayRoot;', 'bool homeOwned=PreferredOverlay!=IntPtr.Zero&&fgPid==(uint)OverlayPid&&fg!=overlayRoot;bool contextActive=gameOwned||fg==overlayRoot||homeOwned;');
rep('KeepAboveGame(gameRoot,contextActive);',`if(homeOwned&&LastHomeForeground!=fg)SetWindowPos(Overlay,fg,0,0,0,0,0x0001|0x0002|0x0010);
        LastHomeForeground=homeOwned?fg:IntPtr.Zero;
        KeepAboveGame(gameRoot,contextActive&&!homeOwned);`);
rep('if(menu&&!front){if(!below)return;', 'if(!front){if(!below)return;');
rep('SetWindowPos(Overlay,gameOwned?new IntPtr(-1):IntPtr.Zero,box.Left','SetWindowPos(Overlay,homeOwned?fg:gameOwned?new IntPtr(-1):IntPtr.Zero,box.Left');
rep('static string WantedProcess="";','static string WantedProcess="";static bool EnterGamePending;static string WantedExecutable="";static DateTime ManualBindUntil;');
rep('else if(type=="toggleMode")PageToggleMode();','else if(type=="toggleMode")PageToggleMode();\n        else if(type=="enterGame")EnterGamePending=true;');
rep('if(!TranslationMode){if((GetWindowLong(Overlay,-20)&8)!=0)',`if(EnterGamePending&&Target!=IntPtr.Zero){EnterGamePending=false;InterfaceMode(true,false);}
        if(!TranslationMode&&PreferredOverlay!=IntPtr.Zero){if(TextMask!=null)TextMask.Hide();if(WaitMarker!=null)WaitMarker.Hide();if(MenuOpen&&MenuRegionReady&&HitRegions.Count>0){Rect menuClient;if(GetClientRect(Overlay,out menuClient))ApplyRegion(menuClient.Right,menuClient.Bottom);if(!IsWindowVisible(Overlay))SetWindowPos(Overlay,IntPtr.Zero,0,0,0,0,0x0001|0x0002|0x0010|0x0040);IsShown=true;AckRegion();FocusMenuOnce();}else{if(IsWindowVisible(Overlay))ShowWindow(Overlay,0);IsShown=false;}return;}
        if(!TranslationMode){if((GetWindowLong(Overlay,-20)&8)!=0)`);
rep('if(!translation){Restore();NormalShowUntil=DateTime.UtcNow.AddMilliseconds(1500);if(Overlay!=IntPtr.Zero){ShowWindow(Overlay,userAction?5:4);IsShown=true;if(userAction)SetForegroundWindow(Overlay);}}','if(!translation){Restore();if(PreferredOverlay!=IntPtr.Zero){NormalShowUntil=DateTime.MinValue;if(Overlay!=IntPtr.Zero)ShowWindow(Overlay,0);IsShown=false;}else{NormalShowUntil=DateTime.UtcNow.AddMilliseconds(1500);if(Overlay!=IntPtr.Zero){ShowWindow(Overlay,userAction?5:4);IsShown=true;if(userAction)SetForegroundWindow(Overlay);}}}');
rep('if(open&&!TranslationMode){FindOverlay();','if(open&&!TranslationMode&&PreferredOverlay==IntPtr.Zero){FindOverlay();');
rep('if(IsIconic(Overlay)||(foreground!=overlayRoot&&foreground!=gameRoot)){','uint foregroundPid;GetWindowThreadProcessId(GetForegroundWindow(),out foregroundPid);bool ownHome=PreferredOverlay!=IntPtr.Zero&&foregroundPid==(uint)OverlayPid;\r\n        if(IsIconic(Overlay)||(foreground!=overlayRoot&&foreground!=gameRoot&&!ownHome)){');
rep('if(r.Right!=screen.Width||r.Bottom!=screen.Height)return;','if(r.Right!=screen.Width||Math.Abs(r.Bottom-screen.Height)>1)return;');
rep('Overlay=PreferredOverlay;return;','Overlay=PreferredOverlay;PrepareHostedFrame();return;');
rep('if(!TranslationMode&&PreferredOverlay!=IntPtr.Zero){if(TextMask!=null)',`if(!TranslationMode&&PreferredOverlay!=IntPtr.Zero){
            var desktop=System.Windows.Forms.SystemInformation.VirtualScreen;Rect hosted;
            if(GetWindowRect(Overlay,out hosted)&&(hosted.Left!=desktop.Left||hosted.Top!=desktop.Top||hosted.Right!=desktop.Right||hosted.Bottom!=desktop.Bottom-1)){
                SetWindowPos(Overlay,IntPtr.Zero,desktop.Left,desktop.Top,desktop.Width,Math.Max(1,desktop.Height-1),0x0004|0x0010);RegionKey="";
            }
            if(TextMask!=null)`);
rep('static IntPtr PreferredOverlay=IntPtr.Zero;',`static IntPtr PreferredOverlay=IntPtr.Zero;
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
    }`);
rep('bool menuPinned=TranslationMode&&Target!=IntPtr.Zero&&MenuOpen&&MenuRegionReady;',`uint hostForegroundPid;GetWindowThreadProcessId(GetForegroundWindow(),out hostForegroundPid);
        uint hostGamePid=0;if(Target!=IntPtr.Zero)GetWindowThreadProcessId(Target,out hostGamePid);
        bool hostContext=hostForegroundPid==(uint)OverlayPid||hostForegroundPid==hostGamePid||ImeHost(ProcessName(hostForegroundPid));
        bool menuPinned=TranslationMode&&Target!=IntPtr.Zero&&MenuOpen&&MenuRegionReady&&hostContext;`);
// Display branding only; the saved Hook codes and native ABI identifiers remain compatible.
// The percentage width and height are relative to the game, independent of the origin.
rep('w=Math.Max(5,Math.Min(100-x,w));h=Math.Max(5,Math.Min(100-y,h));',
    'w=Math.Max(5,Math.Min(100,w));h=Math.Max(5,Math.Min(100,h));');
// A missing/failed game-audio range must not skip an otherwise valid screenshot. The picture is the game window alone (2026-11-14).
rep('Rect rect;if(shot&&target!=IntPtr.Zero&&GetClientRect(target,out rect))jpeg=GameAudio.Screenshot(target,rect.Right,rect.Bottom);}catch{}',
    '}catch{}\n                try{Rect rect;if(shot&&target!=IntPtr.Zero&&GetClientRect(target,out rect))jpeg=GameAudio.Screenshot(target,rect.Right,rect.Bottom);}catch{}');
rep('if(args.Length>0&&args[0]=="--diagnose")',`if(args.Length>0&&args[0]=="--host-frame-self-test"){
            int original=0x16cf0000,hosted=HostedStyle(original);
            if((hosted&0x00c40000)!=0||(hosted&unchecked((int)0x80000000))==0||HostedStyle(hosted)!=hosted)return 8;
            Emit(new{type="host-frame-selftest",passed=true,noCaption=true,noResizeFrame=true,popup=true});return 0;
        }
        if(args.Length>0&&args[0]=="--diagnose")`);
rep('static bool DialogVisible=true,VisualDetection;','static bool DialogVisible=true,VisualDetection,SceneDetection,ReaderMenuDown;static readonly GameSceneProbe Scene=new GameSceneProbe();static readonly GameUiLayer GameUi=new GameUiLayer();');
rep('VisualDetection=Bool(d,"active");','VisualDetection=Bool(d,"active");SceneDetection=Bool(d,"scene");if(!SceneDetection)Scene.Reset();');
rep('else if(type=="dialogVisibility")','else if(type=="gameUi"){object rows;GameUi.Set(Target,d.TryGetValue("items",out rows)?rows as System.Collections.ArrayList:null,Bool(d,"preview"));}\n        else if(type=="dialogSceneLine"){Scene.Line();GameUi.Clear();}\n        else if(type=="dialogVisibility")');
rep('static void Bind(IntPtr target,bool activate=false){','static void Bind(IntPtr target,bool activate=false){Scene.Reset();GameUi.Clear();');
rep('ReaderInputTick(foregroundGame);',`ReaderInputTick(foregroundGame);
        bool sceneInput=foregroundGame&&!MenuOpen&&!LookupOpen&&(GetAsyncKeyState(0x01)<0||GetAsyncKeyState(0x02)<0||GetAsyncKeyState(0x1B)<0||GetAsyncKeyState(0x20)<0||GetAsyncKeyState(0x0D)<0);
        if(sceneInput&&!ReaderMenuDown){GameUi.Clear();if(SceneDetection)Scene.Input();}ReaderMenuDown=sceneInput;
        if(SceneDetection&&foregroundGame&&GetAsyncKeyState(0x11)<0)Scene.Input();
        Rect uiRect;var uiOrigin=new Point();
        if(Target!=IntPtr.Zero&&GetClientRect(Target,out uiRect)&&ClientToScreen(Target,ref uiOrigin))GameUi.Tick(Target,new System.Drawing.Rectangle(uiOrigin.X,uiOrigin.Y,uiRect.Right,uiRect.Bottom),foregroundGame&&!MenuOpen&&!LookupOpen&&!IsIconic(Target));
        else GameUi.Clear();
        if(SceneDetection&&foregroundGame&&!MenuOpen&&!LookupOpen&&CoverEnabled&&Target!=IntPtr.Zero&&!GameCapture.Busy(Target)){
            Rect sceneRect;var sceneOrigin=new Point();if(GetClientRect(Target,out sceneRect)&&ClientToScreen(Target,ref sceneOrigin)){
                bool? present=Scene.Tick(sceneOrigin.X,sceneOrigin.Y,sceneRect.Right,sceneRect.Bottom);if(present.HasValue)Emit(new{type="dialogScene",visible=present.Value});
            }
        }`);
// A hidden but still existing game window is not a closed game. Keep this in
// the reproducible adapter, since native/*.cs is regenerated on every build.
rep('if(args.Length>0&&args[0]=="--diagnose")',`if(args.Length>0&&args[0]=="--game-window-policy-self-test"){
            using(var fixture=new System.Windows.Forms.Form()){fixture.Text="MeguLit hidden game fixture";Target=fixture.Handle;TrackedGame=Process.GetCurrentProcess();TrackedGameStarted=TrackedGame.StartTime.ToUniversalTime().Ticks;WindowGoneAt=DateTime.UtcNow.AddSeconds(-10);
                bool preserved=!CheckGameExit()&&WindowGoneAt==DateTime.MinValue;
                ForgetGame();Target=IntPtr.Zero;if(!preserved)return 9;
                Emit(new{type="game-window-policy-selftest",passed=true,hiddenWindowPreserved=true});return 0;
            }
        }
        if(args.Length>0&&args[0]=="--diagnose")`);
rep('if(targetPid==(uint)TrackedGame.Id&&(IsWindowVisible(Target)||IsIconic(Target)))','if(targetPid==(uint)TrackedGame.Id)');
rep('static bool HasVisibleWindow(uint pid){', 'static bool HasGameWindow(uint pid){bool found=false;EnumWindows(delegate(IntPtr hwnd,IntPtr unused){uint owner;GetWindowThreadProcessId(hwnd,out owner);if(owner==pid&&GetWindowTextLength(hwnd)>0){found=true;return false;}return true;},IntPtr.Zero);return found;}\n    static bool HasVisibleWindow(uint pid){');
rep('(DateTime.UtcNow-WindowGoneAt).TotalSeconds<5||HasVisibleWindow((uint)TrackedGame.Id)', '(DateTime.UtcNow-WindowGoneAt).TotalSeconds<5||HasGameWindow((uint)TrackedGame.Id)');
rep('&&!HasVisibleWindow((uint)TrackedGame.Id)', '&&!HasGameWindow((uint)TrackedGame.Id)');
rep('string key=width+":"+height+":"+dx+":"+dy+":"+String.Join', 'string key=width+":"+height+":"+dx+":"+dy+":"+LookupOpen+":"+String.Join');
rep('IntPtr region=CreateRectRgn(0,0,0,0);','IntPtr region=LookupOpen?CreateRectRgn(0,0,width,height):CreateRectRgn(0,0,0,0);');
// The dedicated host must never shrink to the old shared-window floating strip.
rep('if(translation&&Target==IntPtr.Zero){FindOverlay();','if(PreferredOverlay==IntPtr.Zero&&translation&&Target==IntPtr.Zero){FindOverlay();');
rep('if(!TranslationMode&&PreferredOverlay!=IntPtr.Zero){','if(PreferredOverlay!=IntPtr.Zero&&(!TranslationMode||Target==IntPtr.Zero)){');
rep('static void RequestModeToggle(){', 'static void RequestModeToggle(){if(PreferredOverlay!=IntPtr.Zero&&!TranslationMode&&Target==IntPtr.Zero){ManualBindUntil=DateTime.UtcNow.AddSeconds(20);NextAutoBind=DateTime.MinValue;Emit(new{type="bindPending"});return;}');
rep('if(EnterGamePending&&Target!=IntPtr.Zero){EnterGamePending=false;InterfaceMode(true,false);}','if((EnterGamePending||DateTime.UtcNow<ManualBindUntil)&&Target!=IntPtr.Zero){EnterGamePending=false;ManualBindUntil=DateTime.MinValue;InterfaceMode(true,false);}');
rep('else if(type=="enterGame")EnterGamePending=true;','else if(type=="enterGame")EnterGamePending=true;\n        else if(type=="expectExecutable"){WantedExecutable=Str(d,"path");NextAutoBind=DateTime.MinValue;}');
rep('else if(type=="unbind"){WantedProcess="";','else if(type=="unbind"){WantedExecutable="";WantedProcess="";');
rep('else if(type=="bind"){','else if(type=="bind"){WantedExecutable="";');
rep('pids.Add((uint)process.Id);','if(WantedExecutable==""||String.Equals(ProcessImage((uint)process.Id),WantedExecutable,StringComparison.OrdinalIgnoreCase))pids.Add((uint)process.Id);');
rep('static string ProcessName(uint pid){', '    [DllImport("kernel32.dll")]static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);\n    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool QueryFullProcessImageName(IntPtr process,int flags,StringBuilder image,ref int length);\n    [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);\n    static string ProcessImage(uint pid){var handle=OpenProcess(0x1000,false,pid);if(handle==IntPtr.Zero)return "";try{int length=32768;var image=new StringBuilder(length);return QueryFullProcessImageName(handle,0,image,ref length)?image.ToString():"";}finally{CloseHandle(handle);}}\n    static string ProcessName(uint pid){');
rep('Path.GetFullPath(process.MainModule.FileName),wanted','ProcessImage((uint)process.Id),wanted');
rep('try{TrackedGame.Refresh();if(!TrackedGame.HasExited', 'try{TrackedGame.Refresh();if(PreferredOverlay==IntPtr.Zero&&!TrackedGame.HasExited');
rep('static void ReaderInputTick(bool foregroundGame){', 'static bool ReaderOwnsPointer(){Point screen,origin=new Point();if(Overlay==IntPtr.Zero||!IsShown||!GetCursorPos(out screen)||!ClientToScreen(Overlay,ref origin))return false;\n        int x=screen.X-origin.X,y=screen.Y-origin.Y;return HitRegions.Exists(h=>x>=h.Bounds.Left&&x<h.Bounds.Right&&y>=h.Bounds.Top&&y<h.Bounds.Bottom);}\n    static void ReaderInputTick(bool foregroundGame){');
rep('(mouse&&!ReaderMouseDown)', '(mouse&&!ReaderMouseDown&&!ReaderOwnsPointer())');
rep('(GetAsyncKeyState(0x01)<0||GetAsyncKeyState(0x02)<0||','((GetAsyncKeyState(0x01)<0||GetAsyncKeyState(0x02)<0)&&!ReaderOwnsPointer()||');
for(const n of names){if(n==='GalWindowBridge.cs')continue;const file=r+'native/'+n;fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/\bToMe\b/g,'MeguLit'));}
const audioFile=r+'native/GameAudio.cs';
let audio=fs.readFileSync(audioFile,'utf8');
for(const [before,after] of [
 ['if(n<10)return null','if(n<8)return null'],
 ['double floor=sorted[n/5],high=sorted[n*9/10];if(high-floor<12)return null;','double floor=sorted[n/5];'],
 ['if(count<15)return null','if(count<8)return null'],
 ['var wav=Wav(v);return wav.Length','var brief=(short[])bgm.Clone();for(int i=Rate;i<Rate+Rate/5;i++)brief[i]+=(short)(5000*(rnd.NextDouble()*2-1));if(Voice(brief)==null)return false;var wav=Wav(v);return wav.Length']
]){
 if(!audio.includes(before))throw Error('Missing game audio adapter anchor '+before);
 audio=audio.replace(before,after);
}
fs.writeFileSync(audioFile,audio);
const markerFile=r+'native/GameWaitMarker.cs';
let marker=fs.readFileSync(markerFile,'utf8');
function markerReplace(from,to){if(!marker.includes(from))throw Error('Missing wait marker adapter anchor '+from);marker=marker.replace(from,to);}
markerReplace(' static List<Rectangle> Find(Bitmap image,bool light){',' public static List<Rectangle> DetectPage(Bitmap image){return Find(image,true,true);}\n static List<Rectangle> Find(Bitmap image,bool light,bool pageOnly=false){');
markerReplace('   int[] rowLeft=new int[h]', '   if(pageOnly){var page=new Rectangle(left,top,w,h);if(WaitPageMarker.Matches(pixels,width,page))found.Add(page);continue;}\n   int[] rowLeft=new int[h]');
markerReplace('     if(candidates.Count>0)LastFoundAt=', '     if(!String.IsNullOrWhiteSpace(FrameSource)){var pages=DetectPage(region);if(pages.Count==1)candidates=pages;}\n     if(candidates.Count>0)LastFoundAt=');
fs.writeFileSync(markerFile,marker);
rep('if(args.Length>0&&args[0]=="--diagnose")','if(args.Length==1&&args[0]=="--wait-page-marker-self-test"){bool passed=WaitPageMarker.SelfTest();Emit(new{type="wait-page-marker-selftest",passed=passed});return passed?0:10;}\n        if(args.Length>0&&args[0]=="--diagnose")');
// Keep the game foreground while giving the WebView the whole reader gesture.
rep('static void ReaderInputTick(bool foregroundGame){',`static ReaderPointerGate PointerGate;
    static IntPtr NoActivateWindow;
    static void ReaderActivationPolicy(){
        IntPtr window=Overlay;
        bool reading=window!=IntPtr.Zero&&TranslationMode&&Target!=IntPtr.Zero&&!MenuOpen;
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
        if(!TranslationMode||MenuOpen||Overlay==IntPtr.Zero||Target==IntPtr.Zero||!IsShown||!GetClientRect(Overlay,out client)){
            PointerGate.Current=null;return;
        }
        PointerGate.Current=new ReaderPointerGate.Context(Overlay,GetAncestor(Target,2),client,LookupOpen,HitRegions.ConvertAll(h=>h.Bounds).ToArray());
    }
    static void ReaderInputTick(bool foregroundGame){ReaderActivationPolicy();RefreshReaderPointer();`);
rep('if(open!=LookupOpen){LookupOpen=open;HasLastRect=false;}', 'if(open!=LookupOpen){LookupOpen=open;HasLastRect=false;Rect client;if(Overlay!=IntPtr.Zero&&IsShown&&GetClientRect(Overlay,out client))ApplyRegion(client.Right,client.Bottom);RefreshReaderPointer();}');
rep('ApplyRegion(LastRect.Right-LastRect.Left,LastRect.Bottom-LastRect.Top);AckRegion();}', 'ApplyRegion(LastRect.Right-LastRect.Left,LastRect.Bottom-LastRect.Top);AckRegion();}RefreshReaderPointer();');
rep('MenuOpen=open;if(!open)', 'bool returning=MenuOpen&&!open&&TranslationMode&&Target!=IntPtr.Zero&&GetAncestor(GetForegroundWindow(),2)==Overlay;MenuOpen=open;ReaderActivationPolicy();RefreshReaderPointer();if(returning)SetForegroundWindow(GetAncestor(Target,2));if(!open)');
rep('bool hotkey=RegisterHotKey', 'PointerGate=new ReaderPointerGate(Emit);\n        bool hotkey=RegisterHotKey');
rep('if(args.Length>0&&args[0]=="--diagnose")', 'if(args.Length==1&&args[0]=="--reader-pointer-self-test"){bool passed=ReaderPointerGate.SelfTest();Emit(new{type="reader-pointer-selftest",passed=passed});return passed?0:11;}\n        if(args.Length>0&&args[0]=="--diagnose")');
s=s.replace(Buffer.from('Alt+M 返回普通界面').toString('latin1'),Buffer.from('Alt+M 开关 MeguLit 主页').toString('latin1'))
   .replace(Buffer.from('Alt+M 切换透明文本框').toString('latin1'),Buffer.from('Alt+M 开关 MeguLit 主页').toString('latin1'));
fs.writeFileSync(p,s.replace(/\bToMe\b/g,'MeguLit'),'latin1');
console.log('Original native input/Hook logic restored with explicit overlay HWND hosting');
