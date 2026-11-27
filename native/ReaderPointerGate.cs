using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Threading;

// Own the complete physical gesture before it can reach a polling game. The desktop
// relays it into WebView2 without re-injecting it into the Windows input stream.
internal sealed class ReaderPointerGate {
    internal const int Move=0x200, LeftDown=0x201, LeftUp=0x202, RightDown=0x204, RightUp=0x205, MiddleDown=0x207, MiddleUp=0x208;
    const int Wheel=0x20A, HorizontalWheel=0x20E;
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X,Y; }
    [StructLayout(LayoutKind.Sequential)] struct Mouse { public Point Position; public uint Data,Flags,Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] struct Message { public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public Point Position; public uint Reserved; }
    delegate IntPtr MouseProc(int code,IntPtr message,ref Mouse mouse);
    [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id,MouseProc callback,IntPtr module,uint thread);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,ref Mouse mouse);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern int GetMessage(out Message message,IntPtr window,uint min,uint max);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window,uint flag);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr window,ref Point point);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window,out GalWindowBridge.Rect rect);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window,uint message,UIntPtr w,IntPtr l);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread,uint message,UIntPtr w,IntPtr l);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll")] static extern uint GetTickCount();

    static bool Contains(GalWindowBridge.Rect rect,int x,int y){return x>=rect.Left&&x<rect.Right&&y>=rect.Top&&y<rect.Bottom;}

    internal sealed class LookupGrip {
        readonly GalWindowBridge.Rect area;
        readonly GalWindowBridge.Rect[] controls;
        internal LookupGrip(GalWindowBridge.Rect area,GalWindowBridge.Rect[] controls){this.area=area;this.controls=controls;}
        internal bool Hit(int x,int y){
            if(!Contains(area,x,y))return false;
            foreach(var control in controls)if(Contains(control,x,y))return false;
            return true;
        }
    }

    internal sealed class Context {
        internal readonly IntPtr Overlay,Game;
        internal readonly GalWindowBridge.Rect Client;
        internal readonly bool Lookup;
        internal readonly GalWindowBridge.Rect[] Hits,Menus,LookupPanels,NativeSpots;
        internal readonly LookupGrip Grip;
        internal Context(IntPtr overlay,IntPtr game,GalWindowBridge.Rect client,bool lookup,GalWindowBridge.Rect[] hits,GalWindowBridge.Rect[] menus=null,GalWindowBridge.Rect[] lookupPanels=null,LookupGrip grip=null,GalWindowBridge.Rect[] nativeSpots=null){
            Overlay=overlay;Game=game;Client=client;Lookup=lookup;Hits=hits;Menus=menus??new GalWindowBridge.Rect[0];
            LookupPanels=lookupPanels??new GalWindowBridge.Rect[0];
            Grip=grip;NativeSpots=nativeSpots??new GalWindowBridge.Rect[0];
        }
        internal bool InMenu(int x,int y){foreach(var rect in Menus)if(Contains(rect,x,y))return true;return false;}
        // Keep Alt+T's native slider and resize gestures. The lookup card also sits over polling games.
        internal bool NativeMenu(int x,int y){
            /* #1136: inside a relayed panel, the controls that need a native drag (the log's scrollbar, sliders, drop-downs) stay native */
            foreach(var rect in NativeSpots)if(Contains(rect,x,y))return InMenu(x,y);
            foreach(var rect in LookupPanels)if(Contains(rect,x,y))return false;
            return InMenu(x,y);
        }
        internal bool Hit(int x,int y){
            if(!Contains(Client,x,y))return false;
            foreach(var rect in Hits)if(Contains(rect,x,y))return true;
            return false;
        }
    }

    internal volatile Context Current;
    readonly BlockingCollection<object> events=new BlockingCollection<object>();
    sealed class PendingWheel {
        internal Context Context;
        internal Mouse Mouse;
        internal Point Local;
        internal int Message,Modifiers;
        internal uint At;
    }
    readonly ConcurrentDictionary<int,PendingWheel> pendingWheels=new ConcurrentDictionary<int,PendingWheel>();
    int wheelSequence;
    readonly MouseProc callback;
    static readonly int[] Buttons={LeftDown,RightDown,MiddleDown};
    sealed class Gesture {
        internal Context Owner;
        internal int Button=-1;
        internal bool DragLookup;
        /* a press outside the open lookup card only closes the card: the whole press is kept from the game */
        internal bool Dismiss;
        internal bool Accept(int down,int up,bool move,Context initial,bool dragLookup=false){
            if(Owner!=null)return up==Button||move;
            if(down<0||initial==null)return false;
            Owner=initial;Button=down;DragLookup=down==0&&dragLookup;return true;
        }
        internal void End(){Owner=null;Button=-1;DragLookup=false;Dismiss=false;}
    }
    readonly Gesture gesture=new Gesture();
    uint lastMove;

    internal ReaderPointerGate(Action<object> emit){
        callback=Filter;
        /* 2026-11-21 (owner, CHAOS;CHILD: a click on a word went to the game; no click was logged after 20:34:58): one failed write
           ended this relay for good (and with it every later click routed to the reader); a failed write now only drops that item */
        new Thread(()=>{foreach(var item in events.GetConsumingEnumerable()){try{emit(item);}catch(System.IO.IOException){}catch(ObjectDisposedException){}}}){IsBackground=true,Name="Reader pointer relay"}.Start();
        new Thread(Watch){IsBackground=true,Name="Reader mouse hook"}.Start();
        new Thread(Guard){IsBackground=true,Name="Reader mouse hook guard"}.Start();
    }

    /* 2026-11-21: Windows removes a low-level mouse hook without a word when its callback is late (LowLevelHooksTimeout), and
       every click then reaches the game. The guard polls the mouse; when it moved or a button went down and the hook has seen
       nothing for StaleMs, the hook thread installs the hook again. */
    const uint Reinstall=0x8001;internal const uint StaleMs=2000;
    volatile uint hookThread,lastHook;
    internal static bool Stale(uint lastHook,uint lastInput,uint now){return unchecked(lastInput-lastHook)<0x80000000u&&unchecked(lastInput-lastHook)>0&&unchecked(now-lastHook)>=StaleMs&&unchecked(now-lastInput)<StaleMs*2;}
    void Watch(){
        hookThread=GetCurrentThreadId();
        var hook=SetWindowsHookEx(14,callback,GetModuleHandle(null),0);
        int error=Marshal.GetLastWin32Error();lastHook=GetTickCount();
        events.Add(new{type="hostFrame",pointerHook=hook!=IntPtr.Zero,error=hook==IntPtr.Zero?error:0});
        if(hook==IntPtr.Zero)return;
        try{Message message;while(GetMessage(out message,IntPtr.Zero,0,0)>0){
            if(message.Id!=Reinstall)continue;
            // Keep the old hook registered until Windows accepts its replacement.
            var replacement=SetWindowsHookEx(14,callback,GetModuleHandle(null),0);
            error=replacement==IntPtr.Zero?Marshal.GetLastWin32Error():0;
            if(replacement!=IntPtr.Zero){UnhookWindowsHookEx(hook);hook=replacement;}
            lastHook=GetTickCount();
            events.Add(new{type="hostFrame",pointerHook=hook!=IntPtr.Zero,reinstalled=replacement!=IntPtr.Zero,error});
        }}finally{UnhookWindowsHookEx(hook);}
    }
    void Guard(){
        Point last;GetCursorPos(out last);bool down=false;
        for(;;){Thread.Sleep(250);uint now=GetTickCount();Point at;bool moved=GetCursorPos(out at)&&(at.X!=last.X||at.Y!=last.Y);last=at;
            bool pressed=GetAsyncKeyState(0x01)<0||GetAsyncKeyState(0x02)<0;
            bool inputChanged=moved||pressed&&!down;down=pressed;
            // Idle time after a healthy movement is not evidence that Windows removed the hook.
            if(hookThread!=0&&inputChanged&&Stale(lastHook,now,now)){lastHook=now;PostThreadMessage(hookThread,Reinstall,UIntPtr.Zero,IntPtr.Zero);}
            foreach(var pending in pendingWheels)if(unchecked(now-pending.Value.At)>500){PendingWheel expired;pendingWheels.TryRemove(pending.Key,out expired);}}
    }

    IntPtr Filter(int code,IntPtr message,ref Mouse mouse){
        lastHook=GetTickCount();
        if(code==0){
            if(Route((int)message,mouse))return new IntPtr(1);
            TraceGameClick((int)message,mouse);
        }
        return CallNextHookEx(IntPtr.Zero,code,message,ref mouse);
    }

    void TraceGameClick(int message,Mouse mouse){
        int button=Array.IndexOf(Buttons,message);
        bool down=button>=0;
        if(!down)button=Array.IndexOf(Buttons,message-1);
        var context=Current;
        if(button<0||context==null||GetAncestor(GetForegroundWindow(),2)!=context.Game)return;
        if(GetAncestor(WindowFromPoint(mouse.Position),2)!=context.Game)return;
        var point=mouse.Position;
        GalWindowBridge.Rect client;
        if(!ScreenToClient(context.Game,ref point)||!GetClientRect(context.Game,out client)||
           point.X<0||point.Y<0||point.X>=client.Right||point.Y>=client.Bottom)return;
        events.Add(new{type="hostFrame",pointer=down?"down":"up",isolated=false,button,gameX=point.X,gameY=point.Y,
            gameWidth=client.Right,gameHeight=client.Bottom,game=context.Game.ToInt64(),ctrl=GetAsyncKeyState(0x11)<0,
            x=mouse.Position.X,y=mouse.Position.Y,dismissLookup=down&&context.Lookup});
    }

    /* 2026-11-26 (QQ #1120, p0: with the lookup card open, a click beside it advanced the game; it has to close the card only).
       The click used to pass to the game and only asked the page to close the card afterwards (dismissLookup in TraceGameClick).
       While the card is open, a press on the game window (not on MeguLit's text or panels) is the card's dismissal and the
       whole press, down to its release, stays out of the game. */
    internal static bool DismissOutside(bool lookupCard,bool hit,bool overOverlay,bool overGame,bool gameActive,bool inClient){
        return lookupCard&&!hit&&!overOverlay&&overGame&&gameActive&&inClient;
    }

    static int Modifiers(){
        return (GetAsyncKeyState(0x12)<0?1:0)|(GetAsyncKeyState(0x11)<0?2:0)|(GetAsyncKeyState(0x10)<0?8:0);
    }

    static bool NeedsWheelHitTest(bool lookupOpen,bool inPanel,bool overOverlay,bool overGame,bool gameActive){
        return overOverlay||overGame&&gameActive&&(lookupOpen||inPanel);
    }

    bool RouteWheel(int message,Mouse mouse){
        // A click's captured geometry belongs to that gesture. A wheel uses the live surface.
        var context=Current;
        if(context==null||!IsWindowVisible(context.Overlay))return false;
        var point=mouse.Position;
        if(!ScreenToClient(context.Overlay,ref point))return false;
        var under=GetAncestor(WindowFromPoint(mouse.Position),2);
        var foreground=GetAncestor(GetForegroundWindow(),2);
        bool active=context.Game!=IntPtr.Zero&&(foreground==context.Game||foreground==context.Overlay);
        // The card can move before the native window region catches up. Resolve against the live card in that gap.
        bool lookupOpen=context.Lookup||context.LookupPanels.Length>0;
        if(!NeedsWheelHitTest(lookupOpen,context.InMenu(point.X,point.Y),under==context.Overlay,under==context.Game,active))return false;
        // Keep the real wheel out of the game until the WebView has resolved the current DOM target.
        if(pendingWheels.Count>=128)return true;
        int id=Interlocked.Increment(ref wheelSequence);
        pendingWheels[id]=new PendingWheel{Context=context,Mouse=mouse,Local=point,Message=message,Modifiers=Modifiers(),At=GetTickCount()};
        events.Add(new{type="readerPointer",kind="wheelHitTest",id,x=point.X,y=point.Y});
        return true;
    }

    /* 2026-11-26 (QQ #1130: wheel up over MeguLit's line no longer opened the log). Every wheel over the line was posted to the
       game, so the page's own wheel-up-opens-the-log never saw one. The page now also says when only an upward wheel is its
       own (panelUp: the log setting is on and the pointer is on the line); a downward wheel there still reaches the game. */
    internal static bool WheelToPanel(bool panel,bool panelUp,int message,int delta){return panel||panelUp&&message==Wheel&&delta>0;}

    internal void ResolveWheel(int id,bool panel,bool panelUp=false){
        PendingWheel wheel;
        if(!pendingWheels.TryRemove(id,out wheel)||unchecked(GetTickCount()-wheel.At)>500)return;
        var context=Current;
        if(context==null||context.Overlay!=wheel.Context.Overlay||context.Game!=wheel.Context.Game||!IsWindowVisible(context.Overlay))return;
        var under=GetAncestor(WindowFromPoint(wheel.Mouse.Position),2);
        if(under!=context.Overlay&&under!=context.Game)return;
        if(WheelToPanel(panel,panelUp,wheel.Message,unchecked((short)(wheel.Mouse.Data>>16)))){
            int delta=unchecked((short)(wheel.Mouse.Data>>16));
            events.Add(new{type="readerPointer",kind="mouseWheel",x=wheel.Local.X,y=wheel.Local.Y,button=-1,buttons=0,modifiers=wheel.Modifiers,
                deltaX=wheel.Message==HorizontalWheel?delta:0,deltaY=wheel.Message==Wheel?-delta:0});
        }else{
            var foreground=GetAncestor(GetForegroundWindow(),2);
            if(context.Game==IntPtr.Zero||foreground!=context.Game&&foreground!=context.Overlay)return;
            PostGameWheel(context.Game,wheel);
        }
    }

    static void PostGameWheel(IntPtr game,PendingWheel wheel){
        var gamePoint=wheel.Mouse.Position;
        GalWindowBridge.Rect client;
        if(!ScreenToClient(game,ref gamePoint)||!GetClientRect(game,out client)||
           gamePoint.X<0||gamePoint.Y<0||gamePoint.X>=client.Right||gamePoint.Y>=client.Bottom)return;
        uint keys=(uint)((wheel.Modifiers&8)!=0?4:0)|(uint)((wheel.Modifiers&2)!=0?8:0);
        uint position=(uint)(ushort)wheel.Mouse.Position.X|((uint)(ushort)wheel.Mouse.Position.Y<<16);
        PostMessage(game,(uint)wheel.Message,new UIntPtr((wheel.Mouse.Data&0xffff0000u)|keys),new IntPtr(unchecked((int)position)));
    }

    bool Route(int message,Mouse mouse){
        if(message==Wheel||message==HorizontalWheel)return RouteWheel(message,mouse);
        int index=Array.IndexOf(Buttons,message),up=Array.IndexOf(Buttons,message-1);
        bool moving=message==Move;
        if(index<0&&up<0&&!moving)return false;
        if(gesture.Owner==null&&index<0)return false;
        var context=gesture.Owner??Current;
        if(context==null)return false;
        var point=mouse.Position;
        if(!ScreenToClient(context.Overlay,ref point)){
            if(gesture.Owner!=null&&up==gesture.Button){
                if(gesture.DragLookup)events.Add(new{type="readerPointer",kind="lookupDragCancel",x=0,y=0});
                gesture.End();return true;
            }
            return false;
        }
        if(gesture.Owner==null&&index>=0&&context.NativeMenu(point.X,point.Y))return false;
        if(gesture.Owner!=null&&gesture.Dismiss){
            if(up!=gesture.Button)return false;
            gesture.End();return true;
        }
        if(gesture.Owner==null&&index>=0&&IsWindowVisible(context.Overlay)){
            var below=GetAncestor(WindowFromPoint(mouse.Position),2);
            var front=GetAncestor(GetForegroundWindow(),2);
            if(DismissOutside(context.Lookup&&context.LookupPanels.Length>0,context.Hit(point.X,point.Y),below==context.Overlay,
                below==context.Game&&context.Game!=IntPtr.Zero,front==context.Game||front==context.Overlay,Contains(context.Client,point.X,point.Y))){
                gesture.Owner=context;gesture.Button=index;gesture.Dismiss=true;
                events.Add(new{type="hostFrame",pointer="down",isolated=true,button=index,x=mouse.Position.X,y=mouse.Position.Y,
                    game=context.Game.ToInt64(),overlay=context.Overlay.ToInt64(),lookup=true,dismissLookup=true});
                return true;
            }
        }
        if(gesture.Owner==null){
            /* (user, issue #133: the speaker button still advanced the game) a click Windows delivers to the overlay is
               MeguLit's, whether or not the page listed that control among its hit regions; it never reaches a game
               that polls the mouse button. */
            var under=GetAncestor(WindowFromPoint(mouse.Position),2);
            if(!IsWindowVisible(context.Overlay)||!(context.Hit(point.X,point.Y)||under==context.Overlay))return false;
            var foreground=GetAncestor(GetForegroundWindow(),2);
            if(foreground!=context.Game&&foreground!=context.Overlay&&under!=context.Overlay)return false;
            if(under!=context.Overlay&&under!=context.Game)return false;
        }
        if(!gesture.Accept(index,up,moving,context,index==0&&context.Grip!=null&&context.Grip.Hit(point.X,point.Y)))return false;
        if(moving&&unchecked(mouse.Time-lastMove)<8)return false;
        lastMove=index>=0?unchecked(mouse.Time-8):mouse.Time;
        // A grip drag follows the hook's button lifecycle. Real Windows hover moves still reach WebView2
        // and cannot cancel the drag or compete with a relayed, pressed Chromium pointer.
        var kind=gesture.DragLookup?(index>=0?"lookupDragStart":up>=0?"lookupDragEnd":"lookupDragMove"):
            (index>=0?"mousePressed":up>=0?"mouseReleased":"mouseMoved");
        int button=gesture.Button;
        events.Add(new{type="readerPointer",kind,x=point.X,y=point.Y,button=moving?-1:button,buttons=up>=0?0:1<<button,modifiers=Modifiers()});
        if(!moving)events.Add(new{type="hostFrame",pointer=index>=0?"down":"up",isolated=true,button,x=mouse.Position.X,y=mouse.Position.Y,foreground=GetForegroundWindow().ToInt64(),overlay=context.Overlay.ToInt64(),game=context.Game.ToInt64(),lookup=context.Lookup,lookupDrag=gesture.DragLookup});
        if(up>=0)gesture.End();
        // Mouse motion still updates the real cursor and hover. Only the relayed move carries a pressed button.
        return !moving;
    }

    internal static bool SelfTest(){
        /* a press on the panel is the panel's; a press on the reader's text outside it is the gate's */
        {var c=new Context(IntPtr.Zero,IntPtr.Zero,new GalWindowBridge.Rect(0,0,1920,1080),false,new[]{new GalWindowBridge.Rect(1300,0,1900,740),new GalWindowBridge.Rect(100,600,900,660)},new[]{new GalWindowBridge.Rect(1300,0,1900,740)});
         if(!c.InMenu(1500,400)||c.InMenu(300,620)||!c.Hit(300,620))return false;}
        /* an open (or pinned) menu keeps the gate on; no translation layer, no overlay or a hidden layer switch it off */
        if(!GalWindowBridge.PointerGateOn(true,true,true,true)||!GalWindowBridge.PointerGateOn(true,false,true,true)||GalWindowBridge.PointerGateOn(false,true,true,true)||GalWindowBridge.PointerGateOn(true,true,false,true)||GalWindowBridge.PointerGateOn(true,true,true,false))return false;
        /* hook guard: input after the hook went quiet for StaleMs means reinstall; input the hook saw, or old input, does not */
        if(!Stale(1000,3500,3600)||Stale(4000,3500,4100)||Stale(1000,1500,2900)||Stale(1000,3500,9000))return false;
        var client=new GalWindowBridge.Rect(0,0,1920,1080);
        var hits=new[]{new GalWindowBridge.Rect(200,600,800,660)};
        var line=new Context(IntPtr.Zero,IntPtr.Zero,client,false,hits);
        var lookup=new Context(IntPtr.Zero,IntPtr.Zero,client,true,hits,hits,hits);
        if(!line.Hit(300,620)||line.Hit(800,620)||line.Hit(900,600)||lookup.Hit(900,600)||lookup.Hit(-1,600)||lookup.Hit(1920,600))return false;
        if(!lookup.Hit(300,620)||lookup.NativeMenu(300,620)||!lookup.InMenu(300,620))return false;
        {var log=new Context(IntPtr.Zero,IntPtr.Zero,client,false,hits,hits,hits,null,new[]{new GalWindowBridge.Rect(780,600,800,660)});if(log.NativeMenu(300,620)||!log.NativeMenu(790,620))return false;}
        if(!WheelToPanel(true,false,Wheel,-120)||!WheelToPanel(false,true,Wheel,120)||WheelToPanel(false,true,Wheel,-120)||
           WheelToPanel(false,true,HorizontalWheel,120)||WheelToPanel(false,false,Wheel,120))return false;
        /* only a press on the game itself, while the card is open and the game is in front, is a dismissal */
        if(!DismissOutside(true,false,false,true,true,true)||DismissOutside(false,false,false,true,true,true)||DismissOutside(true,true,false,true,true,true)||
           DismissOutside(true,false,true,false,true,true)||DismissOutside(true,false,false,true,false,true)||DismissOutside(true,false,false,true,true,false))return false;
        {var held=new Gesture();held.Owner=lookup;held.Button=0;held.Dismiss=true;held.End();if(held.Dismiss||held.Owner!=null)return false;}
        if(!NeedsWheelHitTest(false,false,true,false,true)||!NeedsWheelHitTest(false,true,false,true,true)||
           !NeedsWheelHitTest(true,false,false,true,true)||NeedsWheelHitTest(false,false,false,true,true)||
           NeedsWheelHitTest(true,true,false,false,true)||NeedsWheelHitTest(true,true,false,true,false))return false;
        var gesture=new Gesture();
        var grip=new LookupGrip(new GalWindowBridge.Rect(200,600,800,660),new[]{new GalWindowBridge.Rect(600,610,700,650)});
        if(!grip.Hit(300,620)||grip.Hit(650,620)||grip.Hit(800,620))return false;
        if(!gesture.Accept(0,-1,false,lookup,true)||!gesture.DragLookup||!gesture.Accept(-1,-1,true,null)||
           !gesture.DragLookup||!gesture.Accept(-1,0,false,null))return false;
        gesture.End();if(gesture.DragLookup)return false;
        if(!gesture.Accept(0,-1,false,line)||!gesture.Accept(-1,-1,true,null)||gesture.Accept(-1,1,false,null)||!gesture.Accept(-1,0,false,null))return false;
        gesture.End();
        if(!gesture.Accept(0,-1,false,lookup)||!gesture.Accept(-1,0,false,null))return false;
        gesture.End();
        if(gesture.Accept(0,-1,false,null)||gesture.Owner!=null)return false;
        MouseProc probe=PassThrough;
        var hook=SetWindowsHookEx(14,probe,GetModuleHandle(null),0);
        bool registered=hook!=IntPtr.Zero&&UnhookWindowsHookEx(hook);
        GC.KeepAlive(probe);
        return registered;
    }
    static IntPtr PassThrough(int code,IntPtr message,ref Mouse mouse){return CallNextHookEx(IntPtr.Zero,code,message,ref mouse);}
}
