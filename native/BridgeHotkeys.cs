// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;

/* 2026-11-27 (owner: 支持Alt+T alt+H L之类的热键可以自定义设置 也可以绑定在鼠标上). The keys of GalWindowBridge are the player's:
   core/hotkeys.cjs passes them in MEGULIT_HOTKEYS at start and as {type:'hotkeys'} after every change (no restart).
   Slots: 0 menu (Alt+T, hotkey id 0x541), 1 cover (Alt+H, 0x542), 2 bind (Alt+M, 0x543), 3 log (Alt+L, 0x544).
   Keyboard: menu / cover / bind are RegisterHotKey keys held all the time, as before; the log key stays with
   GalWindowBridge.BacklogHotkeyTick (held only while the bound game is in front). Mouse (side buttons X1 / X2, the middle
   button with a modifier): a low-level mouse hook on its own thread, installed only while some action is on a mouse button;
   it takes the button only while the bound game (or MeguLit's own layer) is in front and passes it on untouched otherwise,
   so other programs keep their mouse buttons. While the 热键 panel records a key everything is let go (Pause). */
public static class BridgeHotkeys {
    public const int Menu=0,Cover=1,Bind=2,Log=3;
    public static readonly int[] Ids={0x541,0x542,0x543,0x544};
    static readonly string[] Names={"menu","cover","bind","log"};
    public static readonly uint[] Mods=new uint[4],Keys=new uint[4],Mouse=new uint[4];
    static readonly uint[] HeldMods=new uint[3],HeldKeys=new uint[3];
    static readonly bool[] Ok={true,true,true};
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h,int id,uint modifiers,uint key);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h,int id);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    static BridgeHotkeys(){Defaults();}
    public static void Defaults(){Set(Menu,1,0x54,0);Set(Cover,1,0x48,0);Set(Bind,1,0x4D,0);Set(Log,1,0x4C,0);}
    static void Set(int i,uint mods,uint key,uint mouse){Mods[i]=mods;Keys[i]=key;Mouse[i]=mouse;}
    /* a keyboard key: Alt (1), Ctrl (2) or Win (8), maybe Shift (4), plus one key that is not itself a modifier */
    internal static bool KeyValid(uint mods,uint key){return key>=0x08&&key<=0xFE&&key!=0x10&&key!=0x11&&key!=0x12&&key!=0x5B&&key!=0x5C&&key!=0xA0&&key!=0xA1&&key!=0xA2&&key!=0xA3&&key!=0xA4&&key!=0xA5&&(mods&~15u)==0&&(mods&11u)!=0;}
    /* a mouse button: 2 X1 / 3 X2 alone or with modifiers; 1 the middle button only with a modifier */
    internal static bool MouseValid(uint mods,uint mouse){if((mods&~15u)!=0)return false;return mouse==2||mouse==3||mouse==1&&mods!=0;}
    static uint Num(Dictionary<string,object> d,string k){object v;if(d==null||!d.TryGetValue(k,out v)||v==null)return 0;try{double x=Convert.ToDouble(v);return x<0||x>255?0u:(uint)x;}catch{return 0;}}
    /* {menuMods,menuKey,menuMouse,...} (web/hotkeys.js nativeSpec); an action left out keeps its key, a broken one is off */
    public static void Configure(Dictionary<string,object> d){
        for(int i=0;i<4;i++){string n=Names[i];if(d==null||!d.ContainsKey(n+"Mods"))continue;uint m=Num(d,n+"Mods"),k=Num(d,n+"Key"),mo=Num(d,n+"Mouse");
            if(mo!=0){if(MouseValid(m,mo))Set(i,m,0,mo);else Set(i,0,0,0);}
            else if(k!=0&&KeyValid(m,k))Set(i,m,k,0);else Set(i,0,0,0);}
    }
    public static void ConfigureFromEnvironment(){string s=Environment.GetEnvironmentVariable("MEGULIT_HOTKEYS");if(String.IsNullOrEmpty(s))return;try{Configure(new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(s));}catch{}}
    /* the 热键 panel is recording: every key and button is let go so the one pressed reaches the page; ends by itself after 30 s */
    static DateTime PausedUntil=DateTime.MinValue;static bool LastPaused;
    public static void Pause(bool on){PausedUntil=on?DateTime.UtcNow.AddSeconds(30):DateTime.MinValue;}
    public static bool Paused{get{return DateTime.UtcNow<PausedUntil;}}
    /* true once each time the pause starts or ends (the bridge then applies the keys again) */
    public static bool PauseChanged(){bool p=Paused;if(p==LastPaused)return false;LastPaused=p;return true;}
    /* slot 0..2 has what it wants (its key held, or no keyboard key wanted) */
    public static bool SlotOk(int i){return Ok[i];}
    public static bool AllOk{get{return Ok[0]&&Ok[1]&&Ok[2];}}
    /* (un)registers menu / cover / bind to match the wanted keys; true when anything changed. Called on the bridge's main thread,
       which owns the WM_HOTKEY messages */
    public static bool ApplyGlobal(bool noHotkeys){
        bool changed=false,paused=Paused;
        for(int i=0;i<3;i++){
            uint wm=noHotkeys||paused?0:Mods[i],wk=noHotkeys||paused?0:Keys[i];
            if(HeldKeys[i]!=0&&(HeldKeys[i]!=wk||HeldMods[i]!=wm)){UnregisterHotKey(IntPtr.Zero,Ids[i]);HeldKeys[i]=0;HeldMods[i]=0;changed=true;}
            if(wk!=0&&HeldKeys[i]==0&&RegisterHotKey(IntPtr.Zero,Ids[i],wm|0x4000,wk)){HeldKeys[i]=wk;HeldMods[i]=wm;changed=true;}
            bool ok=wk==0||HeldKeys[i]!=0;if(ok!=Ok[i]){Ok[i]=ok;changed=true;}
        }
        return changed;
    }
    public static void ReleaseAll(){for(int i=0;i<3;i++)if(HeldKeys[i]!=0){UnregisterHotKey(IntPtr.Zero,Ids[i]);HeldKeys[i]=0;HeldMods[i]=0;}StopMouseHook();}
    /* the log key for BacklogHotkeyTick: its keyboard key, or none */
    public static uint LogMods{get{return Keys[Log]!=0?Mods[Log]:0;}}
    public static uint LogKey{get{return Keys[Log];}}

    /* ---- mouse ---- */
    delegate IntPtr LowLevelProc(int code,IntPtr wParam,IntPtr lParam);
    [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id,LowLevelProc proc,IntPtr module,uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h,int code,IntPtr w,IntPtr l);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern int GetMessage(out HookMsg m,IntPtr h,uint min,uint max);
    [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread,uint msg,UIntPtr w,IntPtr l);
    [StructLayout(LayoutKind.Sequential)] struct HookMsg{public IntPtr hwnd;public uint message;public UIntPtr wParam;public IntPtr lParam;public uint time;public int x,y;}
    [StructLayout(LayoutKind.Sequential)] struct MouseInfo{public int X,Y;public uint mouseData,flags,time;public UIntPtr extra;}
    /* slots whose mouse button fired, read by the bridge's main loop */
    public static readonly ConcurrentQueue<int> Fired=new ConcurrentQueue<int>();
    /* set by the bridge: the bound game (or MeguLit's own layer) is the window in front */
    public static Func<bool> InFront=delegate{return false;};
    static readonly LowLevelProc Proc=HookProc;
    static IntPtr Hook=IntPtr.Zero;static Thread HookThread;static uint HookThreadId;
    static readonly bool[] Swallowed=new bool[4];
    public static bool MouseHookActive{get{return HookThread!=null;}}
    /* Alt 1, Ctrl 2, Shift 4, Win 8 as held right now */
    static uint ModsNow(){uint m=0;if(GetAsyncKeyState(0x12)<0)m|=1;if(GetAsyncKeyState(0x11)<0)m|=2;if(GetAsyncKeyState(0x10)<0)m|=4;if(GetAsyncKeyState(0x5B)<0||GetAsyncKeyState(0x5C)<0)m|=8;return m;}
    /* the slot a button (1 middle, 2 X1, 3 X2) with these modifiers belongs to, or -1 */
    internal static int MouseSlot(uint button,uint mods){for(int i=0;i<4;i++)if(Mouse[i]!=0&&Mouse[i]==button&&Mods[i]==mods)return i;return -1;}
    /* the button a low-level mouse message is about (0 for anything else) and whether it went down */
    internal static uint MouseButton(uint message,uint mouseData,out bool down){
        down=message==0x207||message==0x20B;
        if(message==0x207||message==0x208)return 1;
        if(message==0x20B||message==0x20C){uint x=(mouseData>>16)&0xFFFF;return x==1?2u:x==2?3u:0u;}
        return 0;
    }
    static IntPtr HookProc(int code,IntPtr w,IntPtr l){
        try{
            if(code>=0){
                uint message=(uint)w.ToInt64();
                if(message==0x207||message==0x208||message==0x20B||message==0x20C){
                    var info=(MouseInfo)Marshal.PtrToStructure(l,typeof(MouseInfo));bool down;uint button=MouseButton(message,info.mouseData,out down);
                    if(button!=0){
                        /* the release of a press MeguLit took is taken too, wherever the pointer is now */
                        if(!down&&Swallowed[button]){Swallowed[button]=false;return (IntPtr)1;}
                        if(down&&!Paused){int slot=MouseSlot(button,ModsNow());if(slot>=0&&InFront()){Swallowed[button]=true;Fired.Enqueue(slot);return (IntPtr)1;}}
                    }
                }
            }
        }catch{}
        return CallNextHookEx(Hook,code,w,l);
    }
    /* the hook runs only while some action is on a mouse button */
    public static void UpdateMouseHook(bool noHotkeys){bool want=!noHotkeys&&(Mouse[0]|Mouse[1]|Mouse[2]|Mouse[3])!=0;if(want&&HookThread==null)StartMouseHook();else if(!want&&HookThread!=null)StopMouseHook();}
    static void StartMouseHook(){
        var ready=new ManualResetEvent(false);
        var thread=new Thread(delegate(){
            HookThreadId=GetCurrentThreadId();
            Hook=SetWindowsHookEx(14,Proc,GetModuleHandle(null),0);
            ready.Set();
            HookMsg m;while(Hook!=IntPtr.Zero&&GetMessage(out m,IntPtr.Zero,0,0)>0){}
            if(Hook!=IntPtr.Zero)UnhookWindowsHookEx(Hook);Hook=IntPtr.Zero;
        });
        thread.IsBackground=true;thread.Name="MeguLit mouse keys";HookThread=thread;thread.Start();ready.WaitOne(2000);
    }
    static void StopMouseHook(){if(HookThread==null)return;if(HookThreadId!=0)PostThreadMessage(HookThreadId,0x12,UIntPtr.Zero,IntPtr.Zero);HookThread=null;HookThreadId=0;for(int i=0;i<Swallowed.Length;i++)Swallowed[i]=false;}
    /* --mode-self-test: what is a key, which slot a button belongs to, configure/off */
    internal static bool SelfTest(){
        if(!KeyValid(1,0x54)||!KeyValid(6,0x71)||!KeyValid(8,0x4C)||KeyValid(4,0x4C)||KeyValid(0,0x4C)||KeyValid(16,0x4C)||KeyValid(1,0x12))return false;
        if(!MouseValid(0,2)||!MouseValid(0,3)||MouseValid(0,1)||!MouseValid(2,1)||MouseValid(0,4)||MouseValid(32,2))return false;
        bool down;if(MouseButton(0x20B,1u<<16,out down)!=2||!down||MouseButton(0x20C,2u<<16,out down)!=3||down||MouseButton(0x207,0,out down)!=1||!down||MouseButton(0x201,0,out down)!=0)return false;
        Configure(new Dictionary<string,object>{{"menuMods",0},{"menuKey",0},{"menuMouse",2},{"coverMods",2},{"coverKey",0},{"coverMouse",1},{"logMods",0},{"logKey",0},{"logMouse",0},{"bindMods",3},{"bindKey",0x71},{"bindMouse",0}});
        bool ok=MouseSlot(2,0)==Menu&&MouseSlot(2,1)==-1&&MouseSlot(1,2)==Cover&&MouseSlot(3,0)==-1&&Keys[Bind]==0x71&&Mods[Bind]==3&&LogKey==0&&Keys[Menu]==0;
        Configure(new Dictionary<string,object>{{"coverMods",0},{"coverKey",0},{"coverMouse",1}});ok=ok&&Mouse[Cover]==0&&Mouse[Menu]==2;
        Defaults();return ok&&Keys[Menu]==0x54&&LogKey==0x4C;
    }
}
