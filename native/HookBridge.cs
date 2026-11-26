// SPDX-License-Identifier: GPL-3.0-or-later
// Adapter to LunaHook's C ABI. See third_party/LunaHook/UPSTREAM.json.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
public static partial class HookBridge {
 [StructLayout(LayoutKind.Sequential)] public struct ThreadParam {public uint processId;public ulong addr,ctx,ctx2;public string Key(){return addr.ToString("x")+":"+ctx.ToString("x")+":"+ctx2.ToString("x");}}
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void ProcessEvent(uint pid);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void CreateEvent([MarshalAs(UnmanagedType.LPWStr)]string code,[MarshalAs(UnmanagedType.LPStr)]string name,ThreadParam tp,[MarshalAs(UnmanagedType.I1)]bool embed);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void DestroyEvent([MarshalAs(UnmanagedType.LPWStr)]string code,[MarshalAs(UnmanagedType.LPStr)]string name,ThreadParam tp);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void OutputEvent([MarshalAs(UnmanagedType.LPWStr)]string code,[MarshalAs(UnmanagedType.LPStr)]string name,ThreadParam tp,[MarshalAs(UnmanagedType.LPWStr)]string text);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void InfoEvent(int type,[MarshalAs(UnmanagedType.LPWStr)]string text);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void InsertEvent(uint pid,ulong address,[MarshalAs(UnmanagedType.LPWStr)]string code);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void EmbedEvent([MarshalAs(UnmanagedType.LPWStr)]string text,ThreadParam tp);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate IntPtr QueryEvent([MarshalAs(UnmanagedType.LPWStr)]string text);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void GameEvent([MarshalAs(UnmanagedType.LPWStr)]string id,[MarshalAs(UnmanagedType.LPWStr)]string title,[MarshalAs(UnmanagedType.LPWStr)]string version);
 static string Host="LunaHost64.dll";
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void DLuna_Start(ProcessEvent connected,ProcessEvent disconnected,CreateEvent create,DestroyEvent destroy,OutputEvent output,InfoEvent info,InsertEvent insert,EmbedEvent embed,QueryEvent query,GameEvent game); static DLuna_Start _Luna_Start; static void Luna_Start(ProcessEvent connected,ProcessEvent disconnected,CreateEvent create,DestroyEvent destroy,OutputEvent output,InfoEvent info,InsertEvent insert,EmbedEvent embed,QueryEvent query,GameEvent game){_Luna_Start(connected, disconnected, create, destroy, output, info, insert, embed, query, game);}
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void DLuna_Settings(int delay,int codepage,int buffer,int history,[MarshalAs(UnmanagedType.I1)]bool pcHooks); static DLuna_Settings _Luna_Settings; static void Luna_Settings(int delay,int codepage,int buffer,int history,bool pcHooks){_Luna_Settings(delay, codepage, buffer, history, pcHooks);}
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void DLuna_ConnectProcess(uint pid); static DLuna_ConnectProcess _Luna_ConnectProcess; static void Luna_ConnectProcess(uint pid){_Luna_ConnectProcess(pid);}
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] [return:MarshalAs(UnmanagedType.I1)] delegate bool DLuna_CheckIfNeedInject(uint pid); static DLuna_CheckIfNeedInject _Luna_CheckIfNeedInject; static bool Luna_CheckIfNeedInject(uint pid){return _Luna_CheckIfNeedInject(pid);}
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void DLuna_DetachProcess(uint pid); static DLuna_DetachProcess _Luna_DetachProcess; static void Luna_DetachProcess(uint pid){_Luna_DetachProcess(pid);} [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void DLuna_InsertHookCode(uint pid,[MarshalAs(UnmanagedType.LPWStr)]string code); static DLuna_InsertHookCode _Luna_InsertHookCode;
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void DLuna_UseEmbed(ThreadParam tp,[MarshalAs(UnmanagedType.I1)]bool use); static DLuna_UseEmbed _Luna_UseEmbed;
 /* #696 review: single owner deciding whether stream `key` should have native embed enabled right now. Caller holds Gate. */
 static bool WantEmbed(string key,out ThreadParam tp){tp=default(ThreadParam);Candidate c;if(String.IsNullOrEmpty(key)||!Candidates.TryGetValue(key,out c))return false;tp=c.tp;if(!Connected||!Enabled)return false;{bool body;lock(DrawBody){body=DrawBody.Contains(key);}if(body)return DrawSkipWant(true,DrawSkippable(c),HookTarget.ChineseText,ReplacementEnabled,ProbeWanted);}if(!HideStreamAllowed(c.embed&&!c.hideOnly,DialogueHideReady.Contains(key),HookTarget.ChineseText))return false;if(key==Selected)return Armed(c)&&(ReplacementEnabled||ProbeWanted&&c.gdiProbe)&&(!DotsOwn(c)||YurisGdiOwn(key));if(!ReplacementEnabled||Selected=="")return false;Candidate sel;if(!Candidates.TryGetValue(Selected,out sel))return false;if(JaTwins.Contains(key))return sel.embed&&!sel.hideOnly&&!AnswersLater(sel.code)&&c.embed&&c.role!=2&&c.role!=3;if(TwinEmbed.Contains(key))return !TranslateMode&&c.embed&&c.role!=2;return false;}
 /* #696 review: ordered serial reconciler for native UseEmbed; never holds Gate across native calls (E560) */
 static readonly object EmbedSyncGate=new object();static readonly Queue<string> EmbedSyncQueue=new Queue<string>();static readonly HashSet<string> EmbedSyncPending=new HashSet<string>();static bool EmbedSyncRunning;static Action<Action> EmbedSyncDispatch;
 static void MarkEmbedDirty(string key){if(String.IsNullOrEmpty(key))return;lock(EmbedSyncGate){if(EmbedSyncPending.Add(key))EmbedSyncQueue.Enqueue(key);}if(key==Selected)DrawBodyKeys(k=>{if(k!=key)lock(EmbedSyncGate){if(EmbedSyncPending.Add(k))EmbedSyncQueue.Enqueue(k);}});} /* the selected stream's switch (probe, enable, deactivate, select) re-decides the dialogue contexts of the source no-draw too */
 static void MarkAllEmbedDirty(){if(Selected!="")MarkEmbedDirty(Selected);foreach(var k in JaTwins)MarkEmbedDirty(k);foreach(var k in TwinEmbed)MarkEmbedDirty(k);}
 static void ScheduleEmbedSync(){bool start=false;lock(EmbedSyncGate){if(!EmbedSyncRunning&&EmbedSyncQueue.Count>0){EmbedSyncRunning=true;start=true;}}if(!start)return;Action run=RunEmbedSync;var dispatch=EmbedSyncDispatch;if(dispatch!=null)dispatch(run);else ThreadPool.QueueUserWorkItem(_=>run());}
 static void RunEmbedSync(){bool running=true;try{for(;;){string key;lock(EmbedSyncGate){if(EmbedSyncQueue.Count==0){EmbedSyncRunning=false;running=false;Monitor.PulseAll(EmbedSyncGate);return;}key=EmbedSyncQueue.Dequeue();EmbedSyncPending.Remove(key);}ThreadParam tp=default(ThreadParam);bool hasTp=false,want=false;lock(Gate){Candidate c;if(Candidates.TryGetValue(key,out c)){hasTp=true;want=WantEmbed(key,out tp);}}if(hasTp){try{var fn=_Luna_UseEmbed;if(fn!=null)fn(tp,want);}catch{}}}}finally{if(running)lock(EmbedSyncGate){EmbedSyncRunning=false;Monitor.PulseAll(EmbedSyncGate);}}}
 static void FlushEmbedSync(){if(EmbedSyncDispatch!=null||Monitor.IsEntered(Gate)){ScheduleEmbedSync();return;}for(;;){bool runHere=false;lock(EmbedSyncGate){if(!EmbedSyncRunning&&EmbedSyncQueue.Count==0)return;if(!EmbedSyncRunning){EmbedSyncRunning=true;runHere=true;}else Monitor.Wait(EmbedSyncGate);}if(runHere)RunEmbedSync();}}
 [UnmanagedFunctionPointer(CallingConvention.Cdecl,CharSet=CharSet.Unicode)] delegate void DLuna_EmbedCallback(ThreadParam tp,string text,string trans); static DLuna_EmbedCallback _Luna_EmbedCallback; static void Luna_EmbedCallback(ThreadParam tp,string text,string trans){_Luna_EmbedCallback(tp, text, trans);}
 [UnmanagedFunctionPointer(CallingConvention.Cdecl,CharSet=CharSet.Unicode)] delegate void DLuna_SettingsEx(uint pid,uint wait,byte charset,[MarshalAs(UnmanagedType.I1)]bool setCharset,string font,uint display,[MarshalAs(UnmanagedType.I1)]bool skip,[MarshalAs(UnmanagedType.I1)]bool clear,[MarshalAs(UnmanagedType.I1)]bool setSize,float size,[MarshalAs(UnmanagedType.I1)]bool veh,string unitydir); static DLuna_SettingsEx _Luna_SettingsEx; static void Luna_SettingsEx(uint pid,uint wait,byte charset,bool setCharset,string font,uint display,bool skip,bool clear,bool setSize,float size,bool veh,string unitydir){_Luna_SettingsEx(pid, wait, charset, setCharset, font, display, skip, clear, setSize, size, veh, unitydir);}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr LoadLibraryEx(string path,IntPtr file,uint flags);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr module,string name);
 [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr process,out bool wow);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [StructLayout(LayoutKind.Sequential)] struct Rect {public int left,top,right,bottom;}
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd,out Rect rect);
 [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd,IntPtr dc,uint flags);
 static readonly object Gate=new object(),OutputGate=new object();static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 static DateTime SelectedTextAt=DateTime.MinValue;static readonly Dictionary<string,int> SameHookHits=new Dictionary<string,int>();static readonly Dictionary<string,DateTime> SameHookSeen=new Dictionary<string,DateTime>();
 class Candidate {public ThreadParam tp;public string name,code,sample="",prevSample="";public bool embed,created,hideOnly,gdiProbe,glyphHide;public int role;public readonly TypewriterCadence cadence=new TypewriterCadence();}
 static readonly Dictionary<string,Candidate> Candidates=new Dictionary<string,Candidate>();static readonly List<Delegate> Keep=new List<Delegate>();
 static bool ReceivedText,ReplacementCallback,OfficialRuntime,KnownNaninovel;static string UnityFontDir="";static string NaninovelHide="size0";
 // Naninovel keeps its own copy of each line for the backlog and auto-advance; the printer only gets the line drawn
 // at zero size.
 static DateTime HideCheckedAt=DateTime.MinValue;
 static string HideNaninovel(string text){
  // Debug override: native\naninovel-hide.txt (re-read at most once a second, no reconnect needed).
  if((DateTime.UtcNow-HideCheckedAt).TotalSeconds>=1){HideCheckedAt=DateTime.UtcNow;try{string f=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"naninovel-hide.txt");if(File.Exists(f)){string v=File.ReadAllText(f).Trim();if(v!="")NaninovelHide=v;}}catch{}}
  switch(NaninovelHide){
   case "original":return text;
   case "space":return " ";
   case "mark":return "◆"+text;
   case "color":return "<color=#00000000>"+text+"</color>";
   case "voffset":return "<voffset=-100em>"+text+"</voffset>";
   case "alpha":return "<alpha=#00>"+text;
  }
  // Zero-size glyphs: Naninovel's reveal rewrites vertex colours, so colour/alpha tags stay visible, but it keeps sizes.
  return "<size=0>"+text+"</size>";}
 static DateTime LastHeartbeat=DateTime.MinValue;
 static bool KnownIsland;static volatile bool ScriptCaptureOnly;static bool EmbedPendingSent;static volatile bool SharedResourceStream;static ulong MagesAddress;static uint Pid;static string GameStart="";
/* #468 (ひぐらし, live: the bridge was stopped while the game ran; the next bridge found the LunaHook DLL "already injected", connected, and no stream ever spoke again: the DLL clears every hook when its host goes and its engine detection (HIJACK) runs once per process). Every hook code inserted in this game process is kept beside the stream memory with the process id and start time; a bridge that attaches to the same, already injected process inserts them again. Any engine. */
static bool Reattach=false,ReattachDone=false;static readonly HashSet<string> LiveCodes=new HashSet<string>();static readonly object LiveGate=new object();
static string LivePath(){string m=MemoryPath();return m==""?"":m.Substring(0,m.Length-5)+".hooks.live";}
static void LiveCode(string code){if(string.IsNullOrEmpty(code)||code.Length>600)return;string[] all;lock(LiveGate){if(!LiveCodes.Add(code))return;all=new string[LiveCodes.Count];LiveCodes.CopyTo(all);}try{string p=LivePath();if(p!="")File.WriteAllText(p,Json.Serialize(new Dictionary<string,object>{{"pid",Pid.ToString()},{"start",GameStart},{"codes",all}}));}catch{}}
static void ReattachHooks(){if(!Reattach||ReattachDone||_Luna_InsertHookCode==null)return;ReattachDone=true;ThreadPool.QueueUserWorkItem(_=>{try{string p=LivePath();if(p==""||!File.Exists(p)){Diagnostic("reattach: no hook list of this process");return;}var d=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(p));if(Convert.ToString(d["pid"])!=Pid.ToString()||Convert.ToString(d["start"])!=GameStart){Diagnostic("reattach: hook list is of another process");return;}var codes=d["codes"] as System.Collections.IEnumerable;int n=0;if(codes!=null)foreach(var c in codes){string code=Convert.ToString(c);if(string.IsNullOrEmpty(code))continue;try{_Luna_InsertHookCode(Pid,code);n++;}catch{}}Diagnostic("reattach: inserted "+n+" hooks the previous bridge had in this process");}catch(Exception e){Diagnostic("reattach failed "+e.Message);}});}static string Selected="",ProcessStarted="",BoundProcess="";static IntPtr GameWindow;static bool Enabled,Started,ReplacementRequested;static bool ReplacementEnabled{get{return ReplacementRequested&&!HookTarget.ChineseText;}set{ReplacementRequested=value;}}static int Codepage=932;static volatile bool Connected,Quit;static Dictionary<string,object> Resume;static bool FromMemory,MemorySaved;/* E609 dialogue rivals and Japanese twins (see OnText) */static volatile bool ManualPick;static string RememberedCode="";class DialogueRival{public int hits;public string last="";public DateTime at=DateTime.MinValue;}static readonly Dictionary<string,DialogueRival> DialogueRivals=new Dictionary<string,DialogueRival>();static string LastSelectedLine="";static DateTime LastSelectedLineAt=DateTime.MinValue;static readonly Dictionary<string,KeyValuePair<string,DateTime>> OtherLines=new Dictionary<string,KeyValuePair<string,DateTime>>();static readonly Dictionary<string,int> JaTwinHits=new Dictionary<string,int>();static readonly HashSet<string> JaTwins=new HashSet<string>();static DateTime JaTwinHiddenAt=DateTime.MinValue;static string JaTwinHiddenLine="";static int ProbePending;static WaitRenderHook WaitHook;
 /* 2026-11-20 (CHAOS;CHILD froze when the log drive filled): Emit used to write stdout in the caller's thread, often the
    pipe reader that the game's hook thread waits on. When MeguLit stopped reading (its main thread stuck on a full disk),
    the pipe to MeguLit filled, Emit blocked, the hook pipe stopped draining and the game hung. Now the caller only queues
    the line; one writer thread talks to stdout, in order. Nothing on the game's path waits for MeguLit or a disk. */
 static readonly System.Collections.Concurrent.ConcurrentQueue<string> OutQueue=new System.Collections.Concurrent.ConcurrentQueue<string>();static readonly AutoResetEvent OutSignal=new AutoResetEvent(false);static Thread OutWriter;
 internal static System.IO.TextWriter OutTarget;
 static void Emit(object value){OutQueue.Enqueue(Json.Serialize(value));if(OutWriter==null)StartOutWriter();OutSignal.Set();}
 static void StartOutWriter(){lock(OutputGate){if(OutWriter!=null)return;AppDomain.CurrentDomain.ProcessExit+=(s,e)=>{var t=new Thread(DrainOutput){IsBackground=true};t.Start();t.Join(2000);};var w=new Thread(()=>{while(true){OutSignal.WaitOne(250);DrainOutput();}}){IsBackground=true,Name="stdout"};OutWriter=w;w.Start();}}
 static void DrainOutput(){lock(OutputGate){string line;var o=OutTarget??Console.Out;while(OutQueue.TryDequeue(out line)){try{o.WriteLine(line);}catch{}}try{o.Flush();}catch{}}}
 /* Paths relative to the MeguLit.V3 root (this exe lives in native\). */
 // Unity games draw embedded text with TextMeshPro fonts that lack Chinese. MeguLit downloads LunaTranslator's TMP font
 // bundles to cache\unity-font once; when LunaHook reports a Unity engine, its loader is pointed at that folder.
 static void UseUnityFont(){string dir="";try{string root=Under("cache","unity-font","x");root=Path.GetDirectoryName(root);foreach(var f in Directory.GetFiles(root,"arialuni_sdf_u*",SearchOption.AllDirectories)){dir=Path.GetDirectoryName(f);break;}}catch{}
  if(dir==""){Diagnostic("unity font bundle missing; Chinese may not show in Unity embed");return;}
  UnityFontDir=dir;ApplySettings();Diagnostic("unity font dir "+dir);}
 // LunaHook's clearText bypasses OnEmbed and rewrites script and resource strings too.
 // E215.4: every runtime waits up to 1 s for the reply (the bridge always answers, usually within 1 ms; 200 ms lost lines

 // under load), and holding Ctrl/Shift no longer skips the replacement (fastskipignore showed the original, user: STEINS;GATE).

 // E285 (user: CLANNAD wrote 「它正抓着什·　。」): the Chinese charset alone keeps the game's Japanese face, which has no
 // Simplified glyphs. Translated lines are drawn with a Chinese system font that also has kana.
 static string TranslateFont(){string fonts=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"Fonts");return File.Exists(Path.Combine(fonts,"msyh.ttc"))?"Microsoft YaHei":File.Exists(Path.Combine(fonts,"simhei.ttf"))?"SimHei":"";}
 /* 2026-11-19: the longest a game thread waits for a hide answer (was 1000 ms; the answer comes in a few ms, and a line
    that is not answered in time is drawn unchanged, as before) */
 const uint HideWaitMs=100;/* 2026-11-20 (アマカノ2 "卡卡的，口型对不上"): the game thread waits for the bridge on every new line, so a long wait freezes the game while its voice plays on. Translate mode waited up to 4 s for a translation; now it gets the same short budget: a translation not back in time hides the line and MeguLit draws it (the reader shows the translation), the game never stalls. */const uint TranslateWaitMs=150,TranslateGiveUpMs=110;
 static void ApplySettings(){Luna_SettingsEx(Pid,TranslateMode?TranslateWaitMs:HideWaitMs,TranslateMode?(byte)134:(byte)0,TranslateMode,TranslateMode?TranslateFont():"",0,false,false,false,1,false,UnityFontDir);Diagnostic("settings clearText=False; guarded callbacks; mode="+(TranslateMode?"translate":"hide"));}
// Translation written back into the game (user, 2026-11-09): instead of blanking a dialogue
// line for MeguLit to draw over, the bridge asks MeguLit for the line's translation and hands that to LunaHook, so the
// game draws Chinese in its own text box and font. LunaHook keeps the game waiting up to TranslateWaitMs (150 ms, was 4 s);
// a translation that is not back by then hides the line (MeguLit draws it with its translation), so the game never stalls.
sealed class PendingEmbed {public ThreadParam tp;public string text;public string hidden;public string code;public string selected;public long leaveGen;public string askedState;public Timer timer;}
static volatile bool TranslateMode;static long EmbedSerial;
static bool Printer(string code){return (code??"").Contains(":Naninovel.UI:RevealableText:SetTextValue:");}
/* #696 review: embedded translation of a line that is neither a Naninovel printer nor a veiled Unity setter is answered later (FinishEmbed). While that is so, the selected stream is the only one that waits: LunaHost wakes every wait for a line with any answer for that line, so a Japanese twin's passthrough answer would end the selected stream's wait without its translation, and the translation would be written into the twin. Its twins are never written back in that state anyway (LastEmbedCovered stays false), so WantEmbed keeps them off. */
static bool AnswersLater(string code){return TranslateMode&&!Printer(code)&&!UnitySetter(code);}static readonly Dictionary<long,PendingEmbed> PendingEmbeds=new Dictionary<long,PendingEmbed>();
static void FinishEmbed(long id,string trans,bool hide=false){PendingEmbed p;lock(Gate){if(!PendingEmbeds.TryGetValue(id,out p))return;PendingEmbeds.Remove(id);}
 if(p.timer!=null)p.timer.Dispose();/* E352: indent and trailing engine codes kept, command-like characters removed */string reply=hide?(p.hidden??""):EmbedTextPolicy.Writeback(p.text,trans);reply=SafeReply(p.code,p.text,reply,"embed-translate");/* E358: hide = the game's font cannot draw the translation: the line is hidden and MeguLit draws it */
 /* #696 review: an answer goes back only for the selection that asked. LunaHost names the answer event by the line, not by the stream, and keeps one answer buffer, so a late answer for A (switched off since) would wake B waiting for the same line and B would write back and cache A's answer. A's own wait ends within 20 ms of the reconciler switching A off (MeguLitEmbedWait.h Wait checks every step); reselecting the same stream leaves nothing (LeaveGen). Under Gate, so no switch lands between the check and the answer. */bool current;lock(Gate){current=Selected==p.selected&&LeaveGen==p.leaveGen;if(current){try{Luna_EmbedCallback(p.tp,p.text,reply);}catch(Exception e){Diagnostic("embed-translate callback failed "+e.Message);return;}RememberAnswer(p.tp,p.text,reply,p.askedState,true,false);if(reply.Length>0){LastReplaceAt=DateTime.UtcNow;ReplacementCallback=true;ReceivedText=true;RememberStream();}}}
 if(!current){Diagnostic("embed-translate stale answer dropped (selection changed) id="+id+" chars="+p.text.Length);return;}
 Diagnostic("embed-translate "+(hide?"hide (no glyphs)":reply.Length>0?"replace":"timeout passthrough")+" id="+id+" chars="+p.text.Length);
 if(reply.Length>0){Status(hide?"游戏字库缺这句译文的字，改由 MeguLit 显示":"已把译文写回游戏，由游戏自己显示");}}
 /* 2026-11-15 write guard (EmbedTextPolicy.GuardWrite): nothing the engine could read back as garbage is written; a refused
    reply goes back empty, so the game keeps its own line and MeguLit only reads it. */
 static string SafeReply(string code,string text,string reply,string who){string why;string safe=EmbedTextPolicy.GuardWrite(code,Codepage,text,reply,out why);if(why.Length>0)Diagnostic("write-guard refused "+who+" ("+why+") code="+(code??"")+" chars="+(text??"").Length);return safe;}
 static string Under(params string[] parts){var all=new List<string>{AppDomain.CurrentDomain.BaseDirectory,".."};all.AddRange(parts);string full=Path.GetFullPath(Path.Combine(all.ToArray()));try{Directory.CreateDirectory(Path.GetDirectoryName(full));}catch{}return full;}
 // E243: a multilingual container (every language track in one string) reached the hook. Keep a raw sample with the
 // code points of its separators, at most one per stream every 30 s, so the hook point can be fixed from real bytes.
 static readonly Dictionary<string,DateTime> ContainerSeen=new Dictionary<string,DateTime>();
 static void ContainerSample(string name,string text){try{DateTime last;string k=name??"";lock(Gate){if(ContainerSeen.TryGetValue(k,out last)&&(DateTime.UtcNow-last).TotalSeconds<30)return;ContainerSeen[k]=DateTime.UtcNow;}var marks=new SortedSet<string>();foreach(char ch in text){var cat=Char.GetUnicodeCategory(ch);if(ch=='?'||ch=='？'||ch=='�'||ch=='%'||ch==';'||cat==System.Globalization.UnicodeCategory.PrivateUse||cat==System.Globalization.UnicodeCategory.Surrogate||cat==System.Globalization.UnicodeCategory.OtherNotAssigned||cat==System.Globalization.UnicodeCategory.Control||cat==System.Globalization.UnicodeCategory.Format)marks.Add(((int)ch).ToString("x4"));}Diagnostic("container "+k+" chars="+text.Length+" marks="+String.Join(",",marks)+" raw="+Json.Serialize(text.Length>400?text.Substring(0,400):text));}catch{}}
 // E293 KiriKiri Z games with strong archive encryption (サノバウィッチ): MeguLitScn<bit>.dll saves the scene files the
 // engine itself decrypts to cache\kirikiri-scn (native\scncapture\ScnCapture.cpp). Only for games with .xp3 archives next to
 // the program; any failure is only logged and the hook carries on as before.
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,System.Text.StringBuilder path,ref int size);
 static void ScnCapture(string bit,string loader,string[] args){try{string dll=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"MeguLitScn"+bit+".dll"),exe="";if(!File.Exists(dll))return;IntPtr h=OpenProcess(0x1000,false,Pid);if(h==IntPtr.Zero)return;try{var sb=new System.Text.StringBuilder(32768);int size=sb.Capacity;if(QueryFullProcessImageName(h,0,sb,ref size))exe=sb.ToString();}finally{CloseHandle(h);}
  if(exe==""||Directory.GetFiles(Path.GetDirectoryName(exe),"*.xp3").Length==0)return;var start=new ProcessStartInfo(loader,Pid+" "+args[1]+" \""+args[2]+"\" "+args[3]+" \""+dll+"\""){UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true};
  using(var child=Process.Start(start)){if(!child.WaitForExit(12000)){Diagnostic("scene capture load timed out");return;}Diagnostic(child.ExitCode==0?"scene capture loaded":"scene capture failed: "+child.StandardError.ReadToEnd().Trim());}}catch(Exception e){Diagnostic("scene capture skipped: "+e.Message);}}
 // Runtime dump (native\runtimedump\RuntimeDump.cpp): MeguLitDump<bit>.dll saves the scripts and translation packs a game
 // decrypts in its own memory, whatever the cipher. Loaded for every game (on by default) unless switched off with cache\runtime-dump\<key>\off
 // (key: FNV-1a of the lower-case game folder, services/runtime-dump.cjs); any failure is only logged.
 static string RuntimeDumpKey(string dir){uint h=2166136261;foreach(char ch in dir){uint c=ch;if(c>=65&&c<=90)c+=32;h=unchecked((h^c)*16777619);}return h.ToString("x8");}
 // The DLL comes from the cold runtime pack runtime\\runtime-dump (docs/runtime-dump-pack.md), else next to HookBridge (dev builds).
 // On a first run the pack may still be downloading: a background thread waits for it (up to 15 min, while the game runs).
 /* P0 2026-11-21 (1.4.20 users: SenrenBanka, Higurashi, Rance ended with 0xC00000FD; WER dump: MeguLitDump32 recursing through
    RtlAllocateHeap until the stack ran out). The fix (cd35cbd4) was in the source but the cold pack users download was never
    rebuilt (pack.json contract 2, 2026-11-13), and an installed pack is never fetched again. A pack below MinDumpContract is
    treated as absent: the dump stays off until a fixed pack is in place. A DLL next to HookBridge (dev build) has no pack.json. */
 internal const int MinDumpContract=3;static bool DumpStaleNoted;
 internal static int PackContract(string dir){try{string j=File.ReadAllText(Path.Combine(dir,"pack.json"));var m=System.Text.RegularExpressions.Regex.Match(j,"\"contract\"\\s*:\\s*(\\d+)");return m.Success?Int32.Parse(m.Groups[1].Value):0;}catch{return 0;}}
 static string RuntimeDumpDll(string bit){string install=Path.GetDirectoryName(AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\'));string pack=Path.Combine(install,"runtime","runtime-dump");
  {string f=Path.Combine(pack,"MeguLitDump"+bit+".dll");if(File.Exists(f)){int c=PackContract(pack);if(c>=MinDumpContract)return f;if(!DumpStaleNoted){DumpStaleNoted=true;Diagnostic("runtime dump pack contract "+c+" is below "+MinDumpContract+" (known stack overflow): not loaded until the pack is updated");}}}
  {string f=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"MeguLitDump"+bit+".dll");if(File.Exists(f)&&!File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"pack.json")))return f;}return null;}
 static void RuntimeDump(string bit,string loader,string[] args){if(RuntimeDumpDll(bit)!=null){RuntimeDumpNow(bit,loader,args);return;}new Thread(()=>{try{for(int i=0;i<900&&!Quit;i++){Thread.Sleep(1000);if(RuntimeDumpDll(bit)!=null){Thread.Sleep(1500);RuntimeDumpNow(bit,loader,args);return;}}}catch{}}){IsBackground=true}.Start();}
 static void RuntimeDumpNow(string bit,string loader,string[] args){try{string dll=RuntimeDumpDll(bit),exe="";if(dll==null)return;IntPtr h=OpenProcess(0x1000,false,Pid);if(h==IntPtr.Zero)return;try{var sb=new System.Text.StringBuilder(32768);int size=sb.Capacity;if(QueryFullProcessImageName(h,0,sb,ref size))exe=sb.ToString();}finally{CloseHandle(h);}
  if(exe=="")return;string root=Environment.GetEnvironmentVariable("MEGULIT_RUNTIME_DUMP");if(String.IsNullOrEmpty(root))root=Path.Combine(Path.GetDirectoryName(AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\')),"cache","runtime-dump");
  if(File.Exists(Path.Combine(root,RuntimeDumpKey(Path.GetDirectoryName(exe).TrimEnd('\\')),"off"))||Environment.GetEnvironmentVariable("MEGULIT_RUNTIME_DUMP_OFF")=="1")return;
  /* The game never has MeguLit's environment: the DLL reads the dump root from root.txt next to itself (review 2026-11-13 item 9). */
  try{File.WriteAllText(Path.Combine(Path.GetDirectoryName(dll),"root.txt"),root,new System.Text.UTF8Encoding(false));}catch{}var start=new ProcessStartInfo(loader,Pid+" "+args[1]+" \""+args[2]+"\" "+args[3]+" \""+dll+"\""){UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true};
  using(var child=Process.Start(start)){if(!child.WaitForExit(12000)){Diagnostic("runtime dump load timed out");return;}Diagnostic(child.ExitCode==0?"runtime dump loaded":"runtime dump failed: "+child.StandardError.ReadToEnd().Trim());}}catch(Exception e){Diagnostic("runtime dump skipped: "+e.Message);}}
 /* 2026-11-19 (アマカノ2 "卡卡的"): the log is written by a background thread; a caller (often holding Gate, which OnEmbed waits
    for while the game thread waits for OnEmbed) only queues the line */
 static readonly System.Collections.Concurrent.ConcurrentQueue<string> DiagQueue=new System.Collections.Concurrent.ConcurrentQueue<string>();static readonly AutoResetEvent DiagSignal=new AutoResetEvent(false);static readonly object DiagFlushGate=new object();static Thread DiagWriter;
 static void Diagnostic(string value){DiagQueue.Enqueue(DateTime.UtcNow.ToString("o")+" "+value+Environment.NewLine);if(DiagWriter==null)StartDiagWriter();DiagSignal.Set();}
 static void StartDiagWriter(){lock(DiagFlushGate){if(DiagWriter!=null)return;AppDomain.CurrentDomain.ProcessExit+=(s,e)=>FlushDiagnostics();var t=new Thread(()=>{while(true){DiagSignal.WaitOne(250);FlushDiagnostics();}}){IsBackground=true,Priority=ThreadPriority.BelowNormal};DiagWriter=t;t.Start();}}
 static void FlushDiagnostics(){lock(DiagFlushGate){string line;var all=new System.Text.StringBuilder();while(DiagQueue.TryDequeue(out line))all.Append(line);if(all.Length==0)return;try{string file=Under("logs","hook-diagnostics.log");if(!File.Exists(file)||new FileInfo(file).Length<1048576){if(DiagDropped>0)all.Insert(0,DateTime.UtcNow.ToString("o")+" log: dropped "+DiagDropped+" lines (log drive not writable)"+Environment.NewLine);File.AppendAllText(file,all.ToString());DiagDropped=0;}}catch{/* full or read-only drive: drop, count, say so once it writes again */DiagDropped+=LineCount(all);}}}
 sealed class StuckWriter:System.IO.TextWriter{public readonly ManualResetEvent Open=new ManualResetEvent(false);public readonly System.Collections.Generic.List<string> Lines=new System.Collections.Generic.List<string>();public override System.Text.Encoding Encoding{get{return System.Text.Encoding.UTF8;}}public override void WriteLine(string v){Open.WaitOne();lock(Lines)Lines.Add(v);}}
 /* stdout stuck (MeguLit not reading, as with its log drive full): 5000 Emits must not wait for it, and every line must come out in order once it reads */
 static string OutputNonblockSelfTest(){var w=new StuckWriter();OutTarget=w;
  /* the old Emit never returns here (the writer is stuck); the new one finishes in serialisation time */
  var emitter=new Thread(()=>{for(int i=0;i<5000;i++)Emit(new{i});}){IsBackground=true};emitter.Start();if(!emitter.Join(15000))return "Emit blocked with stdout stuck";
  var gate=new ManualResetEvent(false);var emitter2=new Thread(()=>{DiskLater(()=>gate.WaitOne());for(int i=0;i<500;i++)DiskLater(()=>{});}){IsBackground=true};emitter2.Start();if(!emitter2.Join(5000))return "DiskLater waited for a stuck drive";
  var drained=new ManualResetEvent(false);DiskLater(()=>drained.Set());gate.Set();if(!drained.WaitOne(5000))return "disk queue did not drain";
  w.Open.Set();for(int k=0;k<100;k++){lock(w.Lines)if(w.Lines.Count==5000)break;Thread.Sleep(50);}
  lock(w.Lines){if(w.Lines.Count!=5000)return "lines after release: "+w.Lines.Count;for(int i=0;i<5000;i++)if(w.Lines[i]!="{\"i\":"+i+"}")return "order at "+i+": "+w.Lines[i];}
  var b=new System.Text.StringBuilder("a\nb\nc\n");if(LineCount(b)!=3)return "line count";return "";}
 /* 2026-11-20: files written from the hook callbacks (unsafe-stream memory, glyph state, GPU calibration) are written by
    this one thread, in order; the callback only queues. A slow or full drive costs nothing on the game's path. */
 static readonly System.Collections.Concurrent.BlockingCollection<Action> DiskQueue=new System.Collections.Concurrent.BlockingCollection<Action>(new System.Collections.Concurrent.ConcurrentQueue<Action>());static Thread DiskThread;
 internal static void DiskLater(Action a){if(DiskThread==null)lock(DiskQueue){if(DiskThread==null){var t=new Thread(()=>{foreach(var job in DiskQueue.GetConsumingEnumerable()){try{job();}catch{}}}){IsBackground=true,Name="disk",Priority=ThreadPriority.BelowNormal};t.Start();DiskThread=t;}}if(DiskQueue.Count>2000)return;DiskQueue.Add(a);}
 static long DiagDropped;static int LineCount(System.Text.StringBuilder b){int n=0;for(int i=0;i<b.Length;i++)if(b[i]=='\n')n++;return n;}
 // E244 per-game stream memory: the dialogue stream that last replaced text is remembered per game executable (name + size),
 // so the next launch pre-arms it and embeds from the first line. Written only after a real replacement; ignored on mismatch.
 static string MemoryPath(){try{using(var p=Process.GetProcessById((int)Pid)){var f=new FileInfo(p.MainModule.FileName);string key=System.Text.RegularExpressions.Regex.Replace(f.Name,"[^A-Za-z0-9._-]","_")+"-"+f.Length;return Under("data","hook-streams",key+".json");}}catch{return "";}}
 /* 2026-11-13 signature memory: the exact build's file first. Another build of the same executable (updated, patched, other release) is
    only a candidate (CrossMemory) when it carries a real signature; it becomes the remembered stream only after the signature is found
    at the same place in this build. Moved: inserted later as an ordinary candidate (read-only until the normal dialogue check). */
 static string MemoryFile(){return MemoryPath();}
 static Dictionary<string,object> CrossMemory;static bool SignatureInserted;
 static Dictionary<string,object> OtherBuildMemory(){string exact=MemoryPath();if(exact==""||File.Exists(exact))return null;try{string dir=Path.GetDirectoryName(exact),stem=Path.GetFileNameWithoutExtension(exact);stem=stem.Substring(0,stem.LastIndexOf('-')+1);Dictionary<string,object> best=null;DateTime bestAt=DateTime.MinValue;
   foreach(string f in Directory.GetFiles(dir,stem+"*.json")){long n;if(!Int64.TryParse(Path.GetFileNameWithoutExtension(f).Substring(stem.Length),out n))continue;DateTime at=File.GetLastWriteTimeUtc(f);if(at<=bestAt)continue;Dictionary<string,object> d;try{d=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(f));}catch{continue;}if(HookSignature.FromMemory(d)==null)continue;best=d;bestAt=at;}
   if(best!=null)Diagnostic("stream memory candidate from another build");return best;}catch{return null;}}
 /* Runs right after injection, cross-build memory only. Never inserts at the same place (engine detection does, E520 matches it) and never inserts over a hook already there. */
 /* review 9: the module read and scan run on the thread pool, the other injections do not wait */
 static void PreArmSignature(){ThreadPool.QueueUserWorkItem(_=>PreArmSignatureNow());}
 static void PreArmSignatureNow(){Dictionary<string,object> mem;lock(Gate){mem=CrossMemory;CrossMemory=null;}if(mem==null||KnownIsland||MagesAddress!=0)return;try{var sig=HookSignature.FromMemory(mem);ulong offset;ulong addr=HookSignature.Relocate(Pid,sig,out offset);if(addr==0){Diagnostic("signature not found in "+sig.Module+": automatic search");return;}
   string code=Convert.ToString(mem["code"]),next=HookSignature.Rewrite(code,Convert.ToUInt64(Convert.ToString(mem["addr"]),16),sig.Offset,addr,offset);if(next==null){Diagnostic("signature found but code has no address "+code);return;}
   /* review 8: another build is matched by exe name only (Game.exe, SiglusEngine.exe, BGI.exe are shared by many games): never restored as the remembered stream; at the same place engine detection hooks it and the normal dialogue check decides */
   if(offset==sig.Offset){Diagnostic("signature same place "+sig.Module+"+"+offset.ToString("x")+": left to engine detection");return;}
   if(_Luna_InsertHookCode==null)return;
   ThreadPool.QueueUserWorkItem(_=>{try{Thread.Sleep(2500);/* engine detection first: its own hook (text/embed functions a code string cannot carry) wins */lock(Gate){if(SignatureInserted||Selected!="")return;foreach(var k in Candidates.Values)if(k.tp.addr==addr){Diagnostic("signature target already hooked by engine");return;}int first=HookSignature.ReadByte(Pid,addr);if(first<0||first==0xE9||first==0xEB){Diagnostic("signature target already patched");return;}SignatureInserted=true;}
     _Luna_InsertHookCode(Pid,next);Diagnostic("signature relocated "+sig.Module+"+"+sig.Offset.ToString("x")+" -> +"+offset.ToString("x")+" "+next+" (ordinary candidate)");Emit(new{type="hookSignature",found=true,module=sig.Module,moved=true,code=next});}catch(Exception e){Diagnostic("signature failed "+e.Message);}});}catch(Exception e){Diagnostic("signature failed "+e.Message);}}
 /* Called under Gate: only a snapshot here; the module read and the file write run on the thread pool (E320 timing). */
 static void RememberStream(){if(MemorySaved)return;MemorySaved=true;try{Candidate c;if(Selected==""||!Candidates.TryGetValue(Selected,out c)||!c.embed||c.code==null)return;string code=c.code,name=c.name;ThreadParam tp=c.tp;uint pid=Pid;
   ThreadPool.QueueUserWorkItem(_=>{try{string file=MemoryPath();if(file=="")return;var sig=HookSignature.Capture(pid,tp.addr);/* signature of this build, refreshed every launch that replaces text */File.WriteAllText(file,Json.Serialize(new Dictionary<string,object>{{"code",code},{"addr",tp.addr.ToString("x")},{"ctx",tp.ctx.ToString("x")},{"ctx2",tp.ctx2.ToString("x")},{"name",name},{"embeddable",true},{"at",DateTime.UtcNow.ToString("o")},{"sigModule",sig==null?"":sig.Module},{"sigOffset",sig==null?"":sig.Offset.ToString("x")},{"sigPattern",sig==null?"":sig.Pattern},{"sigLead",sig==null?0:sig.Lead}}));Diagnostic("stream remembered "+name+" "+code);}catch{}});}catch{}}
 static DateTime LastSourceAt=DateTime.MinValue;
 /* 2026-11-15 (user group, 1.4.9, 時計仕掛けのレイライン: the reader stayed on old lines with names glued on, "満琉憂緒鍔姫", while the game showed the next line; log: the backlog was opened, its pages came through the same hook's role-0 context, three of them "left the dialogue-less stream" and that context was remembered). The stream the engine itself marks as the displayed dialogue (role 1) is never left for an unmarked context of the same hook. */static bool EngineDialogueSibling(Candidate cur,Candidate sib){return cur!=null&&sib!=null&&cur.role==1&&sib.role==0&&cur.code!=null&&cur.code==sib.code&&cur.tp.addr==sib.tp.addr;}
 static bool SameHookNewContext(Candidate cur,Candidate sib){return cur!=null&&sib!=null&&cur.code!=null&&cur.code==sib.code&&cur.tp.addr==sib.tp.addr&&cur.tp.ctx2==sib.tp.ctx2&&cur.tp.ctx!=sib.tp.ctx&&cur.embed==sib.embed&&cur.role==sib.role&&sib.role!=2&&sib.role!=3;}
 static readonly List<KeyValuePair<DateTime,string>> CleanLines=new List<KeyValuePair<DateTime,string>>();static readonly Dictionary<string,string> CleanStreamOf=new Dictionary<string,string>();
 static void RememberClean(string key,string text){lock(CleanLines){CleanLines.Add(new KeyValuePair<DateTime,string>(DateTime.UtcNow,text));CleanStreamOf[text]=key;if(CleanLines.Count>12)CleanLines.RemoveAt(0);}}
 /* the clean line this text interleaves: all its characters are the line's, nearly every character of the line (4 in 5; the last frame may be cut) is in it, and it is at least half as long again */
 internal static string InterleavedTwin(string key,string text){lock(CleanLines){string best=null;var cutoff=DateTime.UtcNow.AddSeconds(-2.5);foreach(var e in CleanLines){if(e.Key<cutoff)continue;string c=e.Value;string from;if(CleanStreamOf.TryGetValue(c,out from)&&from==key)continue;if(Interleaves(text,c)&&(best==null||c.Length>best.Length))best=c;}return best;}}
 internal static bool Interleaves(string text,string clean){if(text==null||clean==null)return false;string t=text.Replace("　","").Replace(" ","").Trim(),c=clean.Replace("　","").Replace(" ","").Trim();if(c.Length<4||t.Length<c.Length*3/2)return false;var set=new HashSet<char>(c);foreach(char ch in t)if(!set.Contains(ch))return false;var seen=new HashSet<char>(t);int hit=0;foreach(char ch in set)if(seen.Contains(ch))hit++;return hit*5>=set.Count*4;}
 /* #696 review: a stream left behind takes its line state along. Its twins are marked dirty for the embed reconciler and switched off outside Gate; a newly selected former twin reconciles to its new selected state instead of being turned off out of order. Caller holds Gate. */static void LeaveSelected(){LeaveGen++;foreach(var k in JaTwins)MarkEmbedDirty(k);foreach(var k in TwinEmbed)MarkEmbedDirty(k);JaTwins.Clear();JaTwinHits.Clear();DialogueRivals.Clear();OtherLines.Clear();UnitySiblings.Clear();TwinCrowdSeen.Clear();SelectGen++;LastEmbedText="";LastEmbedCovered=false;}
 /* E609: caller holds Gate; the stream is switched to embedding outside the lock *//* 2026-11-21 (user, Aokana: the game's own line stayed under MeguLit's). Aokana sets the line twice through TMP_Text.set_text from two contexts: the selected one is written back, the second about 0.5 s later puts the line back on screen. That second context only ever reached OnOutput (aux), so ManyUnityContexts, which looks at embed callbacks, never saw it. A context of the selected Unity text setter itself (same hook, same name) that repeats the selected line is a twin too, at its first repeat, so the opening lines are hidden as well. The repeat must be the line itself or a typewriter buffer of it (SameLine), never a page that merely holds it, so a backlog page is no twin; a lone backlog row or save preview that shows the line within 1.5 s of it is (and is veiled while it shows that line); with embedding on, it asks OnEmbedAnswer for every line itself: the hook caches answers per stream (MeguLitEmbedWait.h Key), so no other context is written back from the selected stream's answer and TwinCrowd sees every twin (#696 review). Repeats are compared without tags: a read line comes back wrapped in a grey <color>. The typewriter context that draws the line while it is typed is handled in OnOutput and OnEmbedAnswer (SameLine). */static void JaTwinHit(string key,List<ThreadParam> on){Candidate c;if(!Candidates.TryGetValue(key,out c)||!c.embed||c.role==2||c.role==3)return;int n;JaTwinHits.TryGetValue(key,out n);JaTwinHits[key]=++n;Candidate sel;if(!Candidates.TryGetValue(Selected,out sel)||!sel.embed)return;/* #696 review: no twin is switched on while the selected stream does not write back (cover mode) */string code=c.code??"";bool own=code==(sel.code??"");if(own&&!(UnitySetter(code)&&c.name==sel.name))return;if(n>=(own?1:2)&&JaTwins.Add(key)){on.Add(c.tp);MarkEmbedDirty(key);Diagnostic("japanese twin embedding on "+c.name+" id="+key+" (repeats the selected line)");}}/* 2026-11-19 (千恋＊万花, back from the settings page: the selection followed KiriKiriZ's per-character context and the reader got 「「「「「「「「……「…): a sibling context whose new line only grows (or shrinks to) its previous one is typing glyph by glyph, which is no dialogue evidence */
static bool Typing(string before,string now){if(String.IsNullOrEmpty(before)||String.IsNullOrEmpty(now))return false;string a=before.TrimEnd('…'),b=now.TrimEnd('…');return a.Length>0&&b.Length>0&&a!=b&&(b.StartsWith(a)||a.StartsWith(b));}
static bool DialogueLike(string text){return text!=null&&text.Length<=600&&System.Text.RegularExpressions.Regex.IsMatch(text,"[぀-ヿ]")&&System.Text.RegularExpressions.Regex.Matches(text,"[぀-ヿ一-鿿]").Count>=8;}
 /* glyph dots (all): the remembered stream must stay selected from the first line on (caching engines), so a
    stream that happens to speak first (title menus) never displaces it */
 static bool StaleMemory(){return FromMemory&&!ReceivedText&&!(GlyphAll);}
 static void SaveSelection(Candidate c){try{File.WriteAllText(SessionFileFor??Under("cache","hook-session.json"),Json.Serialize(new{pid=Pid,started=ProcessStarted,code=c.code,addr=c.tp.addr.ToString("x"),ctx=c.tp.ctx.ToString("x"),ctx2=c.tp.ctx2.ToString("x"),name=c.name,embeddable=c.embed}));}catch{}}
 static bool InitialReplacement(string[] args){return !(args.Length==5&&args[4]=="--read-only");}
 static bool TryIslandThread(bool known,uint pid,ulong address,string code,out ThreadParam tp){
  tp=new ThreadParam();if(!known||address!=0x503af0||String.IsNullOrEmpty(code)||!code.StartsWith("E",StringComparison.Ordinal))return false;
  tp=new ThreadParam{processId=pid,addr=address,ctx=0,ctx2=1};return true;
 }
 static void ScriptCapture(){if(ScriptCaptureOnly)return;ScriptCaptureOnly=true;Emit(new{type="hookEngineFeature",framework="siglus"});Diagnostic("script VM hooks are capture only");}
 static bool UnityPluginHooks;
 static readonly string[] UnityPluginEntries={"EHMF2@TextTypewriterEffect:TextTypewriterEffect:TextTypewriterEffect:StartText:7:JIT:UNITY","EHMF2@TextTypewriterEffect:TextTypewriterEffect:TextTypewriterEffect:StartText:5:JIT:UNITY","EHMF2@TextTypewriterEffect:TextTypewriterEffect:TextTypewriterEffect:SetTextImmediate:1:JIT:UNITY"};
 // Reserve the selection before the restore worker or another callback can run.
 static void BeginResumeSelection(){lock(Gate){if(SelectGen==0)SelectGen++;Resume=null;}}
 static void OnInsert(uint pid,ulong address,string code){Diagnostic("insert "+code);if(pid!=Pid)return;LiveCode(code);GpuLittlecheeseHookInserted(code);GpuSact2HookInserted(code);/* E531 (CLANNAD: "暂时不能隐藏原文" on the title menu) an embed-capable hook (code E...) is in, its stream just has not spoken yet */if((code??"").StartsWith("E")&&!EmbedPendingSent){EmbedPendingSent=true;Emit(new{type="hookEmbedPending",code=code});}
  /* 2026-11-13 (DDLC Plus: the dialogue box never reached TMP_Text.set_text, only the history panel did): Unity games often
     feed their dialogue box through a typewriter/text plugin that builds the TMP mesh itself. Once the Unity JIT hooks are in,
     the entry methods of known text plugins are inserted as well (a method the game does not have simply never resolves). */
  if((code??"").Contains(":JIT:UNITY")&&!UnityPluginHooks&&_Luna_InsertHookCode!=null){UnityPluginHooks=true;ThreadPool.QueueUserWorkItem(_=>{foreach(string h in UnityPluginEntries){try{_Luna_InsertHookCode(Pid,h);Diagnostic("unity plugin hook "+h);}catch(Exception e){Diagnostic("unity plugin hook failed "+h+" "+e.Message);}}});}
  if(Printer(code)){if(!KnownNaninovel){KnownNaninovel=true;ThreadPool.QueueUserWorkItem(_=>{try{ApplySettings();}catch{}});}Emit(new{type="hookEngineFeature",framework="naninovel"});
   // The built-in printer hook is kept as is. Swapping it for an unfiltered copy at the same address (and removing
   // the String hooks) froze the game after quick MeguLit restarts; 9 rapid restarts without the swap stayed responsive.
   }
    try{ThreadParam tp;string name;if(Resume!=null&&code!=null&&code.StartsWith("E")&&Convert.ToString(Resume["code"])==code&&(Convert.ToString(Resume["addr"])==address.ToString("x")||FromMemory&&!KnownIsland&&MagesAddress==0/* E520: the same hook code inserted at another address (module relocated, game updated in place) is the same hook: the address the code resolved to now is used */)){tp=new ThreadParam{processId=pid,addr=address,ctx=Convert.ToUInt64(Convert.ToString(Resume["ctx"]),16),ctx2=Convert.ToUInt64(Convert.ToString(Resume["ctx2"]),16)};name=Convert.ToString(Resume["name"]);BeginResumeSelection();{int resumeRole=EmbedTextPolicy.Role(true,tp.ctx2);if(!EmbedTextPolicy.Writable(resumeRole)||Unsafe(name,resumeRole))return;}}
   // Upstream EmbedBGI2 sets ctx=0 and ctx2=ScenarioRole (1).
   // Pre-arm this verified dialogue role only; names (2) remain untouched.
   else if(Resume==null&&Selected==""&&TryIslandThread(KnownIsland,pid,address,code,out tp)){name="EmbedToMeCS2_DrawPreserve";Emit(new{type="hookEngineFeature",framework="cs2"});}
   else if(Resume==null&&Selected==""&&ReplacementEnabled&&MagesAddress!=0&&address==MagesAddress&&code!=null&&code.StartsWith("E")){tp=new ThreadParam{processId=Pid,addr=address,ctx=0,ctx2=0};name="EmbedMAGES_SteinsGate";}
   else if(Resume==null&&Selected==""&&ReplacementEnabled&&String.Equals(BoundProcess,"BGI",StringComparison.OrdinalIgnoreCase)&&code!=null&&code.StartsWith("EXHSXN8:20@")&&code.EndsWith(":BGI.exe",StringComparison.OrdinalIgnoreCase)){tp=new ThreadParam{processId=pid,addr=address,ctx=0,ctx2=1};name="EmbedBGI";}
   else return;lock(Gate){if(name=="EmbedToMeCS2_DrawPreserve"||name=="EmbedEuphoria474_DrawHide_TEST2")Luna_Settings(0,932,4000,4000,false);Candidates[tp.Key()]=new Candidate{tp=tp,code=code,name=name,embed=true};}Select(tp.Key());}catch{Resume=null;}
 }
 static void CaptureProbe(){try{uint owner;GetWindowThreadProcessId(GameWindow,out owner);Rect rect;if(owner!=Pid||!GetClientRect(GameWindow,out rect)||rect.right<1||rect.bottom<1||rect.right>7680||rect.bottom>4320)return;using(var image=new Bitmap(rect.right,rect.bottom,PixelFormat.Format32bppArgb)){using(var graphics=Graphics.FromImage(image)){IntPtr dc=graphics.GetHdc();try{if(!PrintWindow(GameWindow,dc,2))return;}finally{graphics.ReleaseHdc(dc);}}int top=rect.bottom*55/100;using(var crop=image.Clone(new Rectangle(0,top,rect.right,rect.bottom-top),PixelFormat.Format32bppArgb)){string folder=Under("logs","work-diagnostics","x");folder=Path.GetDirectoryName(folder);Directory.CreateDirectory(folder);crop.Save(Path.Combine(folder,"hook-game.png"),ImageFormat.Png);}}}catch(Exception e){Diagnostic("probe "+e.Message);}}
 static void Status(string message){lock(Gate){Emit(new{type="hookStatus",hookMessage=message,hookActive=Enabled&&Selected!=""&&Connected,processAttached=Connected,streamSelected=Selected!="",receivedText=ReceivedText,replacementState=!ReplacementEnabled?"disabled":ReplacementCallback?"callback-acknowledged":Enabled&&Selected!=""&&Candidates.ContainsKey(Selected)&&Candidates[Selected].embed?"clear-requested":"unverified"});}}
 static void Heartbeat(){if((DateTime.UtcNow-LastHeartbeat).TotalSeconds<2)return;LastHeartbeat=DateTime.UtcNow;lock(Gate){List();Emit(new{type="hookHeartbeat",hookActive=Enabled&&Selected!=""&&Connected,processAttached=Connected,streamSelected=Selected!="",receivedText=ReceivedText,replacementState=!ReplacementEnabled?"disabled":ReplacementCallback?"callback-acknowledged":Enabled&&Selected!=""&&Candidates.ContainsKey(Selected)&&Candidates[Selected].embed?"clear-requested":"unverified"});}}
 static void Rescan(){Candidate c=null;long probe;lock(Gate){List();if(StreamProbePending)return;probe=StreamProbe;if(Selected!=""&&Candidates.ContainsKey(Selected)&&Candidates[Selected].created)c=Candidates[Selected];}if(c!=null&&c.name!="EmbedToMeCS2_DrawPreserve"&&c.name!="EmbedEuphoria474_DrawHide_TEST2"){
 HistoryEvent history=s=>{lock(Gate){if(probe==StreamProbe&&Selected==c.tp.Key()&&!ReceivedText&&!String.IsNullOrWhiteSpace(s)){ReceivedText=true;Emit(new{type="hookSource",text=s,origin="history",sourceName=c.name,sourceCode=c.code,hookActive=true});}}};Luna_QueryThreadHistory(c.tp,true,history);GC.KeepAlive(history);}}
 static long StreamProbe, SelectingProbe;
 static bool StreamProbePending;
 static void ProbeStreams(long id){
  lock(Gate){
   if(id<=StreamProbe)return;
   bool littlecheeseStarting=GpuLittlecheeseStarting();
   Interlocked.Exchange(ref StreamProbe,id);
   StreamProbePending=true;
   ReceivedText=false;
   FromMemory=false;
   Resume=null;
   ManualPick=false;
   EmbedBatch.Clear();
   SourceFrames.Clear();
   lock(CleanLines){CleanLines.Clear();CleanStreamOf.Clear();}
   if(littlecheeseStarting||GpuSact2Ready)SyncGpuRenderers();
  }
  Status("正在探测正文文本流，请在游戏里推进一句");
 }
 static bool AcceptProbeFrame(long probe,ThreadParam tp,string text){
  if(probe==0)return Interlocked.Read(ref StreamProbe)==0;
  lock(Gate){
   if(probe!=StreamProbe)return false;
   if(!StreamProbePending)return true;
   Candidate candidate;
   if(SelectingProbe==probe||EngineDialogHidden||!Candidates.TryGetValue(tp.Key(),out candidate)||
      candidate.role==2||candidate.role==3||(tp.Key()!=Selected&&Regex.IsMatch(candidate.name??"",AutoSkip,RegexOptions.IgnoreCase))||
      !ProbeDialogue(text,GameCaption()))return false;
   SelectingProbe=probe;
  }
  try{
   Select(tp.Key(),false);
   lock(Gate){if(probe!=StreamProbe)return false;StreamProbePending=false;SyncGpuRenderers();return true;}
  }catch(Exception error){Diagnostic("text stream probe selection failed: "+error.Message);return false;}
  finally{lock(Gate){if(SelectingProbe==probe)SelectingProbe=0;}}
 }
 static bool ProbeDialogue(string text,string caption){
  text=text.Trim();
  if(text.Length<2||text.Length>600||EmbedTextPolicy.Unreadable(text)||EmbedTextPolicy.AuxNoise(text,caption))return false;
  if(SpokenPiece(text))return true;
  if(EmbedTextPolicy.Label(text))return false;
  return DialogueLike(text)||Regex.IsMatch(text,@"^[「『][぀-ヿ一-鿿]{2,}[」』]$")||
    (HookTarget.ChineseText&&Regex.IsMatch(text,@"\p{IsCJKUnifiedIdeographs}{4,}"))||
    Regex.IsMatch(text,@"[A-Za-z]{2,}\s+[A-Za-z]{2,}.*[.!?]$");
 }
 static bool StreamProbeSelfTest(){
  return ProbeDialogue("俺たちは登り始める。","CLANNAD")&&ProbeDialogue("『お客さん』","")&&
    ProbeDialogue("「はい」","")&&!ProbeDialogue("タイトルメニュー","CLANNAD タイトルメニュー")&&
    !ProbeDialogue("『『『『『『おお『お『おお客客『お客『『おお客客ささ","");
 }
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate void HistoryEvent([MarshalAs(UnmanagedType.LPWStr)]string text);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void DLuna_QueryThreadHistory(ThreadParam tp,[MarshalAs(UnmanagedType.I1)]bool latest,HistoryEvent callback); static DLuna_QueryThreadHistory _Luna_QueryThreadHistory; static void Luna_QueryThreadHistory(ThreadParam tp,bool latest,HistoryEvent callback){_Luna_QueryThreadHistory(tp, latest, callback);}
 static readonly EmbedSourceBatch EmbedBatch=new EmbedSourceBatch();
 static DateTime LastEmbedAt=DateTime.MinValue;static string LastEmbedText="";
 /* when the bridge last decided a line of the selected stream itself (skip bursts). LastEmbedAt also moves when a line shown again is answered from the memo (#696: its twins follow it); a per-frame redraw every 500 ms must not make the next line look like a burst */
 static DateTime LastDecidedAt=DateTime.MinValue;
 /* E560 (月に寄りそう乙女の作法, Unity UI.Text): a typewriter sets the box once per character, 20-60 ms apart; each step extends the
    previous text (rich-text tags aside), so it is the same line being typed, not a skip burst, and is hidden like any line. */
 static string Bare(string s){return System.Text.RegularExpressions.Regex.Replace(s??"",@"<[^<>]*>|<[^<>]*$|\s","");}
 /* the same line without tags or whitespace; a stream that buffered several redraws of it into one output (a typewriter that
    sets the whole line once per frame, Aokana) matches on any of its rows */
 /* 2026-11-21 review (#696): the line itself (tags and line breaks aside), or a typewriter buffer of it: frames one per row,
     each a start of the line, the last the whole line. A backlog page that holds the line among others is not the line. */
 static bool SameLine(string other,string line){string b=Bare(line);if(b.Length==0)return false;if(Bare(other)==b)return true;var rows=(other??"").Split((char)10);int last=rows.Length-1;while(last>0&&Bare(rows[last]).Length==0)last--;if(last==0||Bare(rows[last])!=b)return false;for(int i=0;i<last;i++){string r=Bare(rows[i]);if(r.Length>0&&!b.StartsWith(r,StringComparison.Ordinal))return false;}return true;}
 /* E560 for twins (#696 review): Aokana writes each line from two twins of the selected setter (the second setter and the
     typewriter). Counts the twins writing the shown line within 2 s. Three is Aokana's two and a backlog row that shows the line: cover mode for
     this run, not remembered. Four or more is the many-context box of 月に寄りそう乙女の作法, whose contexts all written back froze
     the game: cover mode, remembered, as ManyUnityContexts does for contexts that are no twins. */
 static readonly Dictionary<string,DateTime> TwinCrowdSeen=new Dictionary<string,DateTime>();
 static int TwinCrowd(string key,DateTime now){TwinCrowdSeen[key]=now;var old=new List<string>();foreach(var kv in TwinCrowdSeen)if((now-kv.Value).TotalSeconds>2)old.Add(kv.Key);foreach(var k in old)TwinCrowdSeen.Remove(k);return TwinCrowdSeen.Count;}
 /* E560 (月に寄りそう乙女の作法): a Unity JIT setter hook (UI.Text.set_text …) reports one stream per call context, and this game
    writes the box it shows from several contexts at once (9 for one NVL page). Replacing only the selected one leaves the
    others on screen, and replacing them all froze or crashed the game. When two or more other contexts of the selected Unity
    setter write the same box within 2 s, the box cannot be hidden from the hook: embed is marked unsafe (cover mode). */
 static readonly Dictionary<string,DateTime> UnitySiblings=new Dictionary<string,DateTime>();
 static bool SameUnitySetter(string key,string text){Candidate a,b;if(Selected==""||LastEmbedText==""||!SameBox(LastEmbedText,text)||!Candidates.TryGetValue(key,out a)||!Candidates.TryGetValue(Selected,out b))return false;string code=b.code??"";return code.EndsWith(":JIT:UNITY")&&code==(a.code??"")&&a.name==b.name;}
 static bool ManyUnityContexts(string key,string text){if(!SameUnitySetter(key,text))return false;DateTime now=DateTime.UtcNow;UnitySiblings[key]=now;var old=new List<string>();foreach(var kv in UnitySiblings)if((now-kv.Value).TotalSeconds>2)old.Add(kv.Key);foreach(var k in old)UnitySiblings.Remove(k);return UnitySiblings.Count>=2;}
 /* the same box: one text is the start of the other (typewriter, page growing) or both open with the same 8 visible characters */
 static bool SameBox(string x,string y){string a=Bare(x),b=Bare(y);if(a.Length==0||b.Length==0)return false;if(a.StartsWith(b,StringComparison.Ordinal)||b.StartsWith(a,StringComparison.Ordinal))return true;int n=Math.Min(8,Math.Min(a.Length,b.Length));return n>=8&&String.CompareOrdinal(a,0,b,0,n)==0;}
 static bool UnitySetter(string code){code=code??"";return code.EndsWith(":JIT:UNITY")&&(code.Contains(":UnityEngine.UI:Text:set_text:")||code.Contains(":TMP_Text:set_text:")||code.Contains(":TextMeshProUGUI:set_text:")||code.Contains(":TextMeshPro:set_text:"));}
 static bool TypewriterStep(string before,string after){string a=Bare(before),b=Bare(after);return a.Length>0&&b.Length>a.Length&&b.StartsWith(a,StringComparison.Ordinal);}
/* E422 (user, WoH 1.3.8: "原文有时还是会露出来"; log: "typemoon skip burst" then passthrough for 3-7 lines). A page shows
   groups of lines without a click between them (script wait 0: up to 7 lines; 21521 single, 865 pairs, 166 threes ...),
   which arrive within a few ms like a skip. Only a held skip key (reported by the reader) or a run longer than any such
   group is a skip; every other line is hidden as usual. */
static volatile bool SkipHeld;static int BurstRun;const int BurstSkipLines=8;static bool SkipNoted;
 static string LastTwinText="";static bool LastEmbedCovered;/* #696 review: the selected stream's last line (LastEmbedText) was written back (replaced or veiled), not passed through */static readonly HashSet<string> TwinEmbed=new HashSet<string>();
 static bool ForeignTwin(string text){if(String.IsNullOrWhiteSpace(text)||text.Length<24||text.Length>600)return false;if(System.Text.RegularExpressions.Regex.IsMatch(text,"[\u3040-\u30ff\u4e00-\u9fff]"))return false;return System.Text.RegularExpressions.Regex.IsMatch(text,"\\p{L}{2,}[,;]?[ \\t]+\\p{L}{2,}[,;]?[ \\t]+\\p{L}{2,}");}
 /* 2026-11-19 cache generation (native/megulithook/MeguLitEmbedWait.h): the hook caches every answer, also "unchanged", per
    generation. When anything that changes the answer changes (selected stream, mode, replacement, marks, glyph dots, skip,
    text window, the stream's hide state) the bridge bumps CommonSharedMem::hash (offset 16, unused upstream) and the hook
    drops its cache, so switching hiding on later still works. */
 static System.IO.MemoryMappedFiles.MemoryMappedFile EmbedMem;static System.IO.MemoryMappedFiles.MemoryMappedViewAccessor EmbedView;static long EmbedGen;static string EmbedState="";static bool EmbedGenNoted;static readonly object EmbedGenGate=new object();
 /* #696 review: the hook keeps every answer only 500 ms (MeguLitEmbedWait.h AnswerTtlMs), twins' hide answers too, so a pause past the 1.5 s twin window asks the bridge again. The selected stream's redraws then ask again as well; they are answered here from what the same line got under the same state (the selection, every switch in EmbedStateKey, LeaveGen, the generation the hook sees), without the work of a first answer (the skip-burst count, a second translation request, marks, status lines). Any change of state misses, as the hook's own cache did. Only the selected stream and non-empty answers: a twin is always decided again, an empty answer is often "not yet" (embedded translation pending, a skip burst).
    The line on screen is still the selected stream's line: a hit sets LastEmbedText, LastEmbedAt and LastEmbedCovered as the first answer did, so the twins of a line shown again (A, B, then A once more) are decided by A, not by B (#696 review). An answer that left them alone (glyph pass-through, a veil read back) leaves them alone again. */
 sealed class MemoAnswer{public string reply;public bool line,covered;}
 static readonly Dictionary<string,MemoAnswer> MemoAnswers=new Dictionary<string,MemoAnswer>();static string MemoState="";
 static string AnswerState(){try{return EmbedStateKey()+"|"+LeaveGen+"|"+Interlocked.Read(ref EmbedGen);}catch{return null;}}
 /* askedState: AnswerState() when the line was asked; an answer is remembered only if nothing changed since. line: the first answer set the selected line (LastEmbedText), covered: what it set LastEmbedCovered to */
 static void RememberAnswer(ThreadParam tp,string text,string reply,string askedState,bool line,bool covered){if(String.IsNullOrEmpty(reply))return;lock(Gate){if(tp.Key()!=Selected)return;string now=AnswerState();if(now==null||now!=askedState)return;if(MemoState!=now||MemoAnswers.Count>=4096){MemoAnswers.Clear();MemoState=now;}MemoAnswers[text]=new MemoAnswer{reply=reply,line=line,covered=covered};}}
 static bool AnswerFromMemo(ThreadParam tp,string text){lock(Gate){MemoAnswer m;if(tp.Key()!=Selected||MemoState!=AnswerState()||!MemoAnswers.TryGetValue(text,out m))return false;_Luna_EmbedCallback(tp,text,m.reply);if(m.line){LastEmbedAt=DateTime.UtcNow;LastEmbedText=text;LastEmbedCovered=m.covered;}return true;}}
 static string EmbedStateKey(){lock(Gate){Candidate c=null;if(Selected!="")Candidates.TryGetValue(Selected,out c);return Selected+"|"+Enabled+"|"+Connected+"|"+ReplacementEnabled+"|"+TranslateMode+"|"+MarksMode+"|"+MarksPaused+"|"+GlyphAll+"|"+SkipHeld+"|"+EngineDialogHidden+"|"+HookTarget.ChineseText+"|"+(c==null?"-":c.embed+"|"+c.hideOnly+"|"+c.glyphHide+"|"+c.gdiProbe);}}
 static void SyncEmbedGeneration(){if(!Connected)return;string key;try{key=EmbedStateKey();}catch{return;}lock(EmbedGenGate){if(key==EmbedState)return;try{if(EmbedView==null){EmbedMem=System.IO.MemoryMappedFiles.MemoryMappedFile.OpenExisting("EMBED_SHARED_MEM"+Pid);EmbedView=EmbedMem.CreateViewAccessor(16,8);}EmbedView.Write(0,++EmbedGen);EmbedState=key;}catch(Exception e){EmbedView=null;if(!EmbedGenNoted){EmbedGenNoted=true;Diagnostic("embed generation unavailable "+e.Message);}}}}
 /* 2026-11-20 how long the bridge takes to answer a line the game thread waits for (OnEmbed), reported every 30 s with the slowest line: the game-side histogram ("MeguLit embed waits") says the game waited, this one says whether the bridge was the slow part */
 static readonly long[] EmbedAnswerBuckets=new long[6];static long EmbedAnswerWorstTicks;static DateTime EmbedAnswerReported=DateTime.UtcNow;static readonly object EmbedAnswerGate=new object();
 internal static int EmbedAnswerBucket(double ms){return ms<1?0:ms<5?1:ms<20?2:ms<50?3:ms<100?4:5;}
 static void EmbedAnswerNote(long ticks){double ms=ticks*1000.0/System.Diagnostics.Stopwatch.Frequency;string line=null;lock(EmbedAnswerGate){EmbedAnswerBuckets[EmbedAnswerBucket(ms)]++;if(ticks>EmbedAnswerWorstTicks)EmbedAnswerWorstTicks=ticks;if((DateTime.UtcNow-EmbedAnswerReported).TotalSeconds>=30){EmbedAnswerReported=DateTime.UtcNow;line="embed answer ms <1:"+EmbedAnswerBuckets[0]+" <5:"+EmbedAnswerBuckets[1]+" <20:"+EmbedAnswerBuckets[2]+" <50:"+EmbedAnswerBuckets[3]+" <100:"+EmbedAnswerBuckets[4]+" >=100:"+EmbedAnswerBuckets[5]+" worst="+(EmbedAnswerWorstTicks*1000.0/System.Diagnostics.Stopwatch.Frequency).ToString("0.0");Array.Clear(EmbedAnswerBuckets,0,6);EmbedAnswerWorstTicks=0;}}if(line!=null)Diagnostic(line);}
 static void OnEmbed(string text,ThreadParam tp){long t0=System.Diagnostics.Stopwatch.GetTimestamp();try{OnEmbedAnswer(text,tp);}finally{EmbedAnswerNote(System.Diagnostics.Stopwatch.GetTimestamp()-t0);}}
 static void OnEmbedAnswer(string text,ThreadParam tp){SyncEmbedGeneration();if(AnswerFromMemo(tp,text))return;if(tp.Key()==Selected&&DialogueLike(text)){bool wasZh=HookTarget.ChineseText;HookTarget.ConfirmJapanese(text);if(HookTarget.ChineseText!=wasZh){lock(Gate)MarkAllEmbedDirty();ScheduleEmbedSync();}}
  string askedState=AnswerState();
  if(GlyphAll&&Selected!=""&&tp.Key()==Selected&&GlyphAllOk(text)){GlyphLine(text);GlyphDrain(8);try{Luna_EmbedCallback(tp,text,text);}catch(Exception e){Diagnostic("glyph dots embed passthrough failed "+e.Message);return;}RememberAnswer(tp,text,text,askedState,false,false);lock(Gate){ReceivedText=true;ReplacementCallback=true;}RememberStream();/* the next launch pre-selects this stream before the first line, so caching engines never rasterise a real dialogue glyph */return;}
  lock(Gate){
   Candidate candidate;
   /* 2026-11-13 (9-nine in English: the Japanese came from the multi-language container stream, the game drew the English
      line through another stream, TextRender, so hiding the selected stream left the English on screen). With the game set
      to another language, the line it draws is the foreign twin of the selected line: a Latin prose line (no kana or kanji)
      on another writable stream within 1.5 s of the selected stream's line (embed or source) is hidden too, and so are its redraws. */
   if(ReplacementEnabled&&Enabled&&Connected&&!TranslateMode&&tp.Key()!=Selected&&Selected!=""&&Candidates.TryGetValue(tp.Key(),out candidate)&&candidate.embed&&candidate.role!=2&&ForeignTwin(text)){
    DateTime twinNow=DateTime.UtcNow;bool twin=text==LastTwinText||Math.Abs((twinNow-LastSourceAt).TotalMilliseconds)<1500||Math.Abs((twinNow-LastEmbedAt).TotalMilliseconds)<1500;if(!twin)Diagnostic("foreign line not near the selected line "+candidate.name+" chars="+text.Length);
    string hidden=twin?EmbedTextPolicy.Hide(text):"";
    if(hidden.Length>0&&hidden!=text){LastTwinText=text;Luna_EmbedCallback(tp,text,hidden);Diagnostic("foreign twin hidden "+candidate.name+" chars="+text.Length);return;}
   }
   /* E609 Japanese twin: hidden like the selected line while the selected stream itself is written back *//* #696 review: only when the selected stream's line was written back itself (LastEmbedCovered): a line it passed through (a skip burst, a translation still pending) leaves its twins alone too, so does the text window hidden (EngineDialogHidden), and a veiled Unity line in embedded-translation mode is covered, so are its twins */if(tp.Key()!=Selected&&JaTwins.Contains(tp.Key())){Candidate sel;if(ReplacementEnabled&&Enabled&&Connected&&LastEmbedCovered&&!SkipHeld&&!EngineDialogHidden&&Candidates.TryGetValue(tp.Key(),out candidate)&&Candidates.TryGetValue(Selected,out sel)&&!sel.hideOnly&&((DateTime.UtcNow-LastEmbedAt).TotalMilliseconds<1500||(DateTime.UtcNow-JaTwinHiddenAt).TotalMilliseconds<1500)&&Bare(text)==Bare(LastEmbedText)/* E610 (live DDLC Plus: the twin StartText(string,...) overload calls the selected StartText overload; blanking it first handed the selected stream nothing but spaces and the line was lost): only after the selected stream wrote this line back. One call is one frame: the whole line, never a part of it (a typewriter that reads its text back and appends would build on blanks). JaTwinHiddenAt keeps a typewriter longer than 1.5 s hidden, for this line only. */){int crowd=TwinCrowd(tp.Key(),DateTime.UtcNow);if(crowd>2){Luna_EmbedCallback(tp,text,"");/* #696 review: exactly three is Aokana's two and a backlog row, cover mode for this run; a fourth is the many-context box of E560, remembered as ManyUnityContexts does. The selected stream's own embed is not in the gate, so the count goes on after the third put it in cover mode */if(crowd==3){Diagnostic("three japanese twins write the shown line; cover mode for this run (not remembered)");QueueMarkUnsafe("japanese-twin-crowd",false);}else if(crowd==4){Diagnostic("four japanese twins write the shown line; cover mode remembered");RememberUnsafe(sel,"japanese-twin-crowd");}return;}if(!sel.embed){Luna_EmbedCallback(tp,text,"");return;}string twinHidden=UnitySetter(candidate.code)?EmbedTextPolicy.UnityVeil(text):EmbedTextPolicy.Hide(text);/* 2026-11-21 Aokana: a typewriter frame colours each character itself (<color=#6e6e6e><alpha=#ff>「おい、泣<alpha=#eb>く…), so no outer colour hides it. It rebuilds the frame from its own line every time and never reads the text back, so its characters are blanked and every tag and alpha stays as it was. */if(twinHidden.Length==0&&UnitySetter(candidate.code)&&EmbedTextPolicy.HasInnerColor(text))twinHidden=EmbedTextPolicy.Hide(text);twinHidden=SafeReply(candidate.code,text,twinHidden,candidate.name);if(twinHidden.Length>0&&twinHidden!=text){Luna_EmbedCallback(tp,text,twinHidden);JaTwinHiddenAt=DateTime.UtcNow;/* once per line: a typewriter asks for every frame */string line=Bare(LastEmbedText);if(line!=JaTwinHiddenLine){JaTwinHiddenLine=line;Diagnostic("japanese twin hidden "+candidate.name+" chars="+text.Length);}return;}}/* #696 review: a twin the gate does not let through is left as it is. Only TwinCrowd counts twins: ManyUnityContexts would take Aokana's own two (the second setter and the typewriter) for a many-context box and remember cover mode for every later launch */Luna_EmbedCallback(tp,text,"");return;}if(ReplacementEnabled&&Enabled&&Connected&&tp.Key()!=Selected&&ManyUnityContexts(tp.Key(),text)){Luna_EmbedCallback(tp,text,"");Diagnostic("several contexts of the selected Unity setter write the shown box; embed marked unsafe (cover mode)");UnitySiblings.Clear();QueueMarkUnsafe("unity-many-contexts");return;}
   if(!ReplacementEnabled||!Enabled||!Connected||tp.Key()!=Selected||!Candidates.TryGetValue(tp.Key(),out candidate)||!candidate.embed){
    Luna_EmbedCallback(tp,text,"");return;
   }
   EmbedBatch.Add(text,DateTime.UtcNow);
   bool printer=Printer(candidate.code);
   bool veil=!printer&&UnitySetter(candidate.code);
   /* E560: the game handed our veil back (its typewriter reads Text.text and appends): it builds on what it reads, which froze
      月に寄りそう乙女の作法. The original goes back unveiled and writeback stops for this stream (cover mode). */
   if(veil&&text.IndexOf(EmbedTextPolicy.UnityVeilOpen,StringComparison.Ordinal)>=0){Luna_EmbedCallback(tp,text,EmbedTextPolicy.Unveil(text));RememberAnswer(tp,text,EmbedTextPolicy.Unveil(text),askedState,false,false);Diagnostic(candidate.name+" reads its text back (veil returned); embed marked unsafe (cover mode)");QueueMarkUnsafe("unity-readback");return;}string replacement=printer?HideNaninovel(text):veil?EmbedTextPolicy.UnityVeil(text):MarksMode&&MarksLive()?EmbedTextPolicy.Mark(text):EmbedTextPolicy.Hide(text);/* 2026-11-19 (live 素晴らしき日々, BGI 「やっぱり……いい女には、」「たばこと」「屋上と」「…似合うのよ」): a short piece is a label to Hide, but an all-hiragana one was a line to the reader (drawn twice) and one inside an open 「 was lost from the reader and left to the game. SpokenPiece is the one rule for both sides: such a piece is a line, drawn by the reader and hidden in the game */if(replacement.Length==0&&!printer&&!veil&&!(MarksMode&&MarksLive())&&SpokenPiece(text))replacement=EmbedTextPolicy.HideSpoken(text);
   if(veil&&replacement.Length==0&&EmbedTextPolicy.HasInnerColor(text)&&EmbedTextPolicy.Hide(EmbedTextPolicy.Unveil(text)).Length>0){Diagnostic(candidate.name+" colours each character itself: the Unity veil cannot hide it; embed marked unsafe (cover mode)");Luna_EmbedCallback(tp,text,"");QueueMarkUnsafe("unity-colour-reveal");return;}
   /* E320 (魔法使いの夜): the game stopped with "Micro Thread ... [0x80000012]" right after a skip burst that was written back line by line (several lines within 2-40 ms). While the game skips, its lines go back unchanged; hiding resumes at the first line read at normal speed; a redraw of the same line is not a burst. */
   DateTime embedNow=DateTime.UtcNow;bool quick=(embedNow-LastDecidedAt).TotalMilliseconds<250&&text!=LastEmbedText&&!TypewriterStep(LastEmbedText,text);BurstRun=quick?BurstRun+1:0;bool burst=quick&&(SkipHeld||BurstRun>=BurstSkipLines);LastDecidedAt=LastEmbedAt=embedNow;LastEmbedText=text;LastEmbedCovered=false;
   /* (user 2026-11-12: サイコロジック closed with a text-size error while skipping; "never let this reach other games") the skip
      guard is no longer typemoon-only: while any game skips, its lines go back unchanged and nothing is written. */
   if(EngineDialogHidden&&replacement.Length>0){replacement="";Diagnostic(candidate.name+" art text (text window hidden) goes back unchanged");}
   if(burst&&replacement.Length>0){replacement="";if(!SkipNoted){SkipNoted=true;Diagnostic(candidate.name+" skip burst: lines go back unchanged until the game stops skipping");}}else if(!burst)SkipNoted=false;
   if(!printer&&replacement.Length>0&&IsSharedResourceStream(candidate.name)&&!IsCurrentDialogue(text))replacement="";
   if(replacement.Length>0&&EmbedTextPolicy.Unreadable(text)&&SelectedReadableRun<2){replacement="";Diagnostic(candidate.name+" unreadable line goes back unchanged chars="+text.Length);}
   if(AnswersLater(candidate.code)&&replacement.Length>0&&replacement!=text){
    long id=++EmbedSerial;var pending=new PendingEmbed{tp=tp,text=text,hidden=replacement,code=candidate.code,selected=Selected,leaveGen=LeaveGen,askedState=askedState};PendingEmbeds[id]=pending;
    pending.timer=new Timer(_=>FinishEmbed(id,null,true),null,(int)TranslateGiveUpMs,Timeout.Infinite);
    Emit(new{type="embedRequest",id=id,text=text});return;
   }
   replacement=SafeReply(candidate.code,text,replacement,candidate.name);
   Luna_EmbedCallback(tp,text,replacement==text?"":replacement);LastEmbedCovered=replacement.Length>0&&replacement!=text;RememberAnswer(tp,text,replacement==text?"":replacement,askedState,true,LastEmbedCovered);
   if(MarksMode&&!MarksPaused&&replacement.Length>0&&replacement!=text)MarksLine("embed",text,replacement);
   Diagnostic("guarded "+(replacement.Length==0||replacement==text?"passthrough ":"replace ")+candidate.name+" chars="+text.Length+(replacement.Length==0?" raw="+Json.Serialize(text.Length>160?text.Substring(0,160):text):""));
   if(replacement.Length==0||replacement==text)return;
   LastReplaceAt=DateTime.UtcNow;ReplacementCallback=true;ReceivedText=true;RememberStream();Status("已收到内嵌原文并应答替换；画面效果待验证");
  }
 }

 // Unity games create one stream per String call site; the selected and embeddable ones go first and the list is
 // capped so one status line stays small.
 static void List(){var result=new List<object>();var items=new List<KeyValuePair<string,Candidate>>(Candidates);items.Sort((a,b)=>((b.Key==Selected?2:0)+(b.Value.embed?1:0)).CompareTo((a.Key==Selected?2:0)+(a.Value.embed?1:0)));if(items.Count>80)items.RemoveRange(80,items.Count-80);foreach(var item in items){var c=item.Value;if(c.role==2||c.role==3)continue;result.Add(new{id=item.Key,name=c.name,code=c.code,sample=c.sample,embeddable=c.embed,hideTrying=item.Key==Selected&&c.gdiProbe&&!c.hideOnly&&(ReplacementEnabled||ProbeWanted)&&!GlyphCached,hideOnly=c.hideOnly,selected=item.Key==Selected,drawSkipped=item.Key==Selected?Interlocked.Read(ref DrawSkipped):0});}Emit(new{type="hookThreads",hookThreads=result});}
 /* E578 hide probe (live beta38, ダストマニア: the reader stays in read mode for a stream that cannot write back, so replacement was never
   enabled and neither the GDI hide nor the glyph hide ever ran): while the reader still wants the game text hidden it sends probe on;
   the selected stream the GDI hide probes (GdiProbeable) is then switched on in the game without replacement. A reported hidden draw
   (GdiHideHit) makes it hide-only, the reader sees an embeddable stream and enables replacement as for any other engine. */
static volatile bool ProbeWanted;
static void Probe(){if(HookTarget.ChineseText)return;bool on;string name;lock(Gate){Candidate c;if(!Connected||!Enabled||Selected==""||!Candidates.TryGetValue(Selected,out c)||!c.gdiProbe)return;on=(ReplacementEnabled||ProbeWanted)&&(!DotsOwn(c)||YurisGdiOwn(Selected));name=c.name;MarkEmbedDirty(Selected);}FlushEmbedSync();Diagnostic("hide probe "+(on?"on ":"off ")+name);}
static void Deactivate(string reason){if(WaitHook!=null)WaitHook.Disable();lock(Gate){ReplacementEnabled=false;ReplacementCallback=false;if(Selected!="")MarkEmbedDirty(Selected);foreach(var k in JaTwins)MarkEmbedDirty(k);foreach(var k in TwinEmbed)MarkEmbedDirty(k);}FlushEmbedSync();Diagnostic("replacement disabled; reason="+reason+"; selected="+Selected);GlyphOff();LayersGiveWay(reason);Status("原文清空已关闭；所选文本流仍可读取");}
 /* GDI hide (MeguLitHook MeguLitGdiHide.h): a selected dialogue stream that cannot write back is still switched on in the game,
    so the hook DLL can leave out the GDI text calls (TextOut/ExtTextOut/DrawText) that draw that line (BRUNS: libscr.dll TextOutW).
    Engine-agnostic. The stream becomes hide-only only after the DLL reports a hidden string ("MeguLit_GDIHIDE hit"),
    so engines that do not draw through GDI keep today's behaviour. */
 static bool Armed(Candidate c){return c!=null&&(c.embed||c.gdiProbe);}
 /* 2026-11-20 (#470, a game read only through kernel32 MultiByteToWideChar/WideCharToMultiByte: "游戏界面没有文字了只有标点符号"): a string conversion or C runtime copy is not a draw call; the game uses its output for everything (script, paths, every string it draws), so blanking it there left only punctuation on screen. Only text the game draws or measures (gdi32/user32/dwrite/d2d1 and engine hooks) may be probed for hiding. */
static bool ConversionHook(string code){return System.Text.RegularExpressions.Regex.IsMatch(code??"",@"(?i):(kernel32|kernelbase|msvcr\w*|msvcp\w*|ucrtbase|vcruntime\w*)\.dll:");}
static bool GdiProbeable(Candidate c){return c!=null&&!c.embed&&!ConversionHook(c.code)&&c.role!=2&&c.role!=3&&!LoadUnsafe().ContainsKey(UnsafeKey(c.name,c.role));}
 static void GdiHideHit(string info){Candidate c;lock(Gate){if(Selected==""||!Candidates.TryGetValue(Selected,out c)||!c.gdiProbe||c.embed)return;c.embed=true;c.hideOnly=true;List();}Diagnostic("gdi hide confirmed for "+c.name+" "+c.code+": hide-only ("+info+")");}
 static bool OldBgiCharHook(Candidate c){return c!=null&&c.name=="BGI"&&c.code!=null&&c.code.StartsWith("H")&&c.code.EndsWith(":BGI.exe",StringComparison.OrdinalIgnoreCase)&&String.Equals(BoundProcess,"BGI",StringComparison.OrdinalIgnoreCase);}
 /* E560 (月に寄りそう乙女の作法 froze when the selection followed a new context): LunaHost's UseEmbed waits for the game's hook,
    and a game thread inside our embed callback waits for Gate, so UseEmbed is called only after Gate is released. */
 static void Select(string id,bool readHistory=true){try{lock(Gate){if(id!=Selected)LeaveSelected();Candidate c;if(!Candidates.TryGetValue(id,out c)||c.tp.processId!=Pid){
   // LeaveSelected ended startup when the requested stream disappeared.
   SyncGpuRenderers();
   throw new Exception("请选择支持内嵌的对话文本流");
  }SelectGen++;if(Selected==id&&Enabled){SyncGpuRenderers();MarkAllEmbedDirty();List();Diagnostic("select retained id="+id+" replacement="+ReplacementEnabled);Status("文本流已选择；"+(ReplacementEnabled&&c.embed?"等待内嵌替换回调":"仅读取，不清空游戏原文"));return;}if(Selected!="")MarkEmbedDirty(Selected);EmbedBatch.Clear();Selected=id;Enabled=true;c.cadence.Reset();ReceivedText=false;ReplacementCallback=false;/* E417 old BGI: the per-character hook of the stream chosen as dialogue can blank its own glyphs (MeguLitHook BGI1Text); it can hide but not write a translation, and only the selected dialogue stream is ever switched on */if(!c.embed&&OldBgiCharHook(c)){c.embed=true;c.hideOnly=true;Diagnostic("old BGI character hook "+c.code+": hide-only (glyphs blanked, no write-back)");}if(GdiProbeable(c)){c.gdiProbe=true;Diagnostic("gdi hide probe on "+c.name+" "+c.code);}if(ReaderFlushDelay(c,GlyphAll,GpuPageOn)==180)FlushFit();SyncGpuRenderers();MarkEmbedDirty(id);SaveSelection(c);List();Diagnostic("select id="+id+" name="+c.name+" embed="+c.embed+" replacement="+ReplacementEnabled);}Status("文本流已选择；"+(ReplacementEnabled&&Candidates[id].embed?"等待内嵌替换回调":"仅读取，不清空游戏原文"));if(readHistory)Rescan();}finally{FlushEmbedSync();}}
 static void OnConnect(uint pid){if(pid!=Pid)return;Connected=true;ReattachHooks();ApplySettings();StartGuard();
  lock(Gate){
   if(!Quit&&GpuRendererDisconnected){GpuRendererDisconnected=false;SyncGpuRenderers();}
   if(Selected!="")MarkEmbedDirty(Selected);
  }
  FlushEmbedSync();Status("进程已附加，等待对话流与实际文本");
 }
 static void OnDisconnect(uint pid){if(pid!=Pid)return;
  // Restore the game text before waiting for the process or collecting crash evidence.
  lock(Gate){GpuRendererDisconnected=true;SyncGpuRenderers();}
  CheckCrash();try{if(GameProcess!=null&&GameProcess.WaitForExit(1500)){TextPathCanary.Exited(GameProcess.ExitCode);CrashWitnessCollect(Pid,unchecked((uint)GameProcess.ExitCode));}}catch{}
  lock(Gate){Connected=false;Enabled=false;ReceivedText=false;ReplacementCallback=false;Quit=true;SyncGpuRenderers();}
  Status("游戏连接已断开，Hook 清空已停止");
 }
 static bool IsSharedResourceStream(string name){return String.Equals(name,"EmbedLeaf",StringComparison.OrdinalIgnoreCase)||String.Equals(name,"Leaf",StringComparison.OrdinalIgnoreCase);}
 // Leaf/EmbedLeaf pass dialogue and resource names (grp.pak, "grp,", tone curves) through one hook point. Only strings that
 // read as dialogue are replaced; every other string goes back to the engine unchanged (E213, after E212 made it read-only).
 // Shared streams also draw the game's own backlog. Only the newest line (and its redraws) is replaced; a line seen
 // before that is no longer the newest is a backlog entry and is left intact.
 static string LatestLeaf="";static DateTime LatestLeafAt;static string Norm(string s){return System.Text.RegularExpressions.Regex.Replace(s??"",@"s|　","");}static bool Same(string a,string b){a=Norm(a);b=Norm(b);return a.Length>0&&(a==b||a.Contains(b)||b.Contains(a));}
 static readonly Dictionary<string,bool> SeenDialogue=new Dictionary<string,bool>();static string LatestDialogue="";
 static bool IsCurrentDialogue(string text){if(text==LatestDialogue)return true;if(SeenDialogue.ContainsKey(text))return false;if(SeenDialogue.Count>2000)SeenDialogue.Clear();SeenDialogue[text]=true;LatestDialogue=text;return true;}
 static bool IsDialogueText(string text){return EmbedTextPolicy.Hide(text).Length>0||EmbedTextPolicy.Container(text);}
 // E215 self-healing embed guard, for every engine: if the game opens an error dialog (#32770) within 20 s of an answered
 // replacement, or exits with a failure code within 30 s of one, the selected stream's writeback is switched off at once
 // and remembered for this game (cache\embed-unsafe.json); reading continues. The user sees at most one error, once.
 static DateTime LastReplaceAt=DateTime.MinValue;static Thread Guard;static Process GameProcess;
 delegate bool EnumWindowsProc(IntPtr hwnd,IntPtr lparam);
 [DllImport("user32.dll")]static extern bool EnumWindows(EnumWindowsProc callback,IntPtr lparam);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr hwnd,System.Text.StringBuilder text,int max);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr hwnd,System.Text.StringBuilder text,int max);
 // E215.2: only a dialog that actually reports an error counts. The game's own dialogs (quit confirmation, settings)
 // also use #32770 and are titled with the game name; one of those disabled CLANNAD HD's working stream.
 delegate bool EnumChildProc(IntPtr hwnd,IntPtr lparam);
 [DllImport("user32.dll")]static extern bool EnumChildWindows(IntPtr parent,EnumChildProc callback,IntPtr lparam);
 static string DialogText(IntPtr dialog){var all=new System.Text.StringBuilder();var title=new System.Text.StringBuilder(256);GetWindowText(dialog,title,256);all.Append(title).Append(' ');EnumChildProc child=(h,l)=>{var t=new System.Text.StringBuilder(512);GetWindowText(h,t,512);if(t.Length>0)all.Append(t).Append(' ');return true;};EnumChildWindows(dialog,child,IntPtr.Zero);GC.KeepAlive(child);return all.ToString().Trim();}
 /* A Shift-JIS game on a Chinese-locale system shows its message box as GBK mojibake ("僥僉僗僩撪晹僄儔乕" is テキスト内部エラー):
    the text is also read back through code page 936 -> 932 before matching. */
 internal static string Unmojibake(string text){try{if(String.IsNullOrEmpty(text))return "";var gbk=System.Text.Encoding.GetEncoding(936,System.Text.EncoderFallback.ExceptionFallback,System.Text.DecoderFallback.ReplacementFallback);return System.Text.Encoding.GetEncoding(932).GetString(gbk.GetBytes(text));}catch{return "";}}
 internal static bool IsErrorDialog(string text){return ErrorWords(text)||ErrorWords(Unmojibake(text));}
 static bool ErrorWords(string text){return System.Text.RegularExpressions.Regex.IsMatch(text??"",@"エラー|不正|失敗|例外|異常|短すぎ|長すぎ|見つかりません|できません|致命|错误|異常終了|error|exception|fail|invalid|too long|access violation|runtime",System.Text.RegularExpressions.RegexOptions.IgnoreCase);}
 static string UnsafeFileFor,SessionFileFor;/* TwinAnswerSelfTest's own files */static string UnsafeFile(){return UnsafeFileFor??Under("cache","embed-unsafe.json");}
 static string UnsafeExe;/* E477: learned per game folder, not per process name */static string UnsafeKey(string name,int role){if(UnsafeExe==null){string exe="";try{exe=BoundExe();}catch{}if(exe=="")return EmbedTextPolicy.UnsafeKey(BoundProcess,"",name,role);UnsafeExe=exe;}return EmbedTextPolicy.UnsafeKey(BoundProcess,UnsafeExe,name,role);}
 static Dictionary<string,object> UnsafeMemo;static int UnsafeWrites;static readonly object UnsafeMemoGate=new object();
 static Dictionary<string,object> LoadUnsafe(){lock(UnsafeMemoGate){if(UnsafeMemo!=null)return new Dictionary<string,object>(UnsafeMemo);}try{string f=UnsafeFile();if(File.Exists(f)){var v=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(f));if(v!=null)return v;}}catch{}return new Dictionary<string,object>();}
 /* E320: an entry only counts under the hiding rules it was learned with; 魔法使いの夜 was marked unsafe while every ruby line went back unchanged. */static bool Unsafe(string name,int role){object v;if(!LoadUnsafe().TryGetValue(UnsafeKey(name,role),out v))return false;var d=v as Dictionary<string,object>;object p;if(d==null||!d.TryGetValue("policy",out p))return false;try{return Convert.ToInt32(p)>=EmbedTextPolicy.Version;}catch{return false;}}
 static void RememberUnsafe(Candidate c,string reason){var all=LoadUnsafe();all[UnsafeKey(c.name,c.role)]=new Dictionary<string,object>{{"reason",reason},{"at",DateTime.UtcNow.ToString("o")},{"policy",EmbedTextPolicy.Version}};string unsafeJson=Json.Serialize(all),unsafeFile=UnsafeFile();lock(UnsafeMemoGate){UnsafeMemo=all;UnsafeWrites++;}DiskLater(()=>{try{File.WriteAllText(unsafeFile,unsafeJson);}catch{}lock(UnsafeMemoGate){if(--UnsafeWrites==0)UnsafeMemo=null;}});}
 static long SelectGen;
 /* #696 review: counts selections left (LeaveSelected), not reselections. A pending embedded translation is bound to it: an answer for a stream that was left (A->B, also A->B->A) is dropped, while reselecting the same stream (sourceLanguage, the UI sending the same id again) keeps the native wait on and its answer still goes back. */
 static long LeaveGen;
 static Action<Action> QueueUnsafeWork;
 /* #696 review: caller holds Gate; bind queued cover-mode work to the stream and selection generation at trigger time */
 static void QueueMarkUnsafe(string reason,bool remember=true){string target=Selected;long gen=SelectGen;Action work=()=>MarkUnsafe(reason,remember,target,gen);var q=QueueUnsafeWork;if(q!=null)q(work);else ThreadPool.QueueUserWorkItem(_=>work());}
 static void MarkUnsafe(string reason,bool remember=true,string expectedSelected=null,long expectedGen=0){Candidate c;lock(Gate){if(Selected==""||(expectedSelected!=null&&(Selected!=expectedSelected||SelectGen!=expectedGen))||!Candidates.TryGetValue(Selected,out c)||!c.embed)return;c.glyphHide=false;c.embed=false;if(c.gdiProbe){c.gdiProbe=false;c.hideOnly=false;}/* #696 review: its twins stop writing back too, so they no longer wait for the bridge on every line. They stay twins: a crowd goes on counting them, JaTwinHit adds none while covered, and Select forgets them */MarkEmbedDirty(Selected);foreach(var k in JaTwins)MarkEmbedDirty(k);ReplacementCallback=false;/* remember: later launches start in cover mode; a twin crowd is for this run only */if(remember)RememberUnsafe(c,reason);List();}
  ScheduleEmbedSync();Diagnostic("embed-guard disabled writeback "+c.name+" role "+c.role+": "+reason);GlyphOff();Emit(new{type="hookEmbedUnsafe",name=c.name,role=c.role,reason=reason});Status(remember?"游戏在内嵌替换后报错，已自动停用这个文本流的写回并记住；继续读取文字":"多个文本流同时写出当前这句，已停用这个文本流的写回；继续读取文字");}
 static void StartGuard(){if(Guard!=null)return;try{GameProcess=Process.GetProcessById((int)Pid);}catch{}var seen=new HashSet<IntPtr>();bool first=true;
  Guard=new Thread(()=>{while(!Quit){try{var now=new List<IntPtr>();EnumWindowsProc callback=(h,l)=>{uint owner;GetWindowThreadProcessId(h,out owner);if(owner==Pid&&IsWindowVisible(h)){var cls=new System.Text.StringBuilder(64);GetClassName(h,cls,64);if(cls.ToString()=="#32770")now.Add(h);}return true;};EnumWindows(callback,IntPtr.Zero);GC.KeepAlive(callback);
   foreach(IntPtr h in now){if(seen.Add(h)&&!first&&(DateTime.UtcNow-LastReplaceAt).TotalSeconds<20){string text=DialogText(h);if(IsErrorDialog(text))MarkUnsafe("error dialog \""+(text.Length>120?text.Substring(0,120):text)+"\"");if(KrkrHide!=null&&!KrkrHideBroken&&IsErrorDialog(text)){KrkrHideBroken=true;try{KrkrHide.Reset();}catch{}Diagnostic("krkr invisible drawing stopped for this run: the game showed an error");}else Diagnostic("embed-guard ignored dialog \""+(text.Length>120?text.Substring(0,120):text)+"\"");}}first=false;}catch{}Thread.Sleep(400);}});
  Guard.IsBackground=true;Guard.Start();}
 static void CheckCrash(){try{if(GameProcess==null||(DateTime.UtcNow-LastReplaceAt).TotalSeconds>30)return;if(!GameProcess.WaitForExit(1500))return;int code=GameProcess.ExitCode;if(code!=0)MarkUnsafe("game exited with 0x"+code.ToString("x8")+" shortly after a replacement");}catch{}}
 static void OnCreate(string code,string name,ThreadParam tp,bool embed){if(tp.processId!=Pid||SadisticPageRedraw(name,tp))return;int role=EmbedTextPolicy.Role(embed,tp.ctx2);if(embed&&!EmbedTextPolicy.Writable(role)){embed=false;Diagnostic("role "+role+" "+name+" read-only: the engine marks it as name/other text, not the displayed dialogue");}if(embed&&Unsafe(name,role)){embed=false;Diagnostic("embed unsafe (learned) "+name+" role "+role+": read-only");}if(IsSharedResourceStream(name)){bool first=!SharedResourceStream;SharedResourceStream=true;Diagnostic("shared stream "+name+": dialogue-only embed");if(first&&Connected)ApplySettings();}if(tp.processId!=Pid)return;if((code??"").Contains(":Naninovel.UI:RevealableText:SetTextValue:"))name="Naninovel:RevealableText.SetTextValue";if(embed||!(code??"").Contains("@mscorlib:System:String:"))Diagnostic("thread "+name+" "+code+" embed="+embed);lock(Gate){Candidates[tp.Key()]=new Candidate{tp=tp,name=name,code=code,embed=embed,created=true,role=role};
  if(GpuLittlecheeseStarting()&&String.Equals(code,GpuLittlecheeseSourceCode,StringComparison.OrdinalIgnoreCase))SyncGpuRenderers();
  if(KnownIsland&&embed&&name=="EmbedToMeCS2_DrawPreserve"&&tp.addr==0x503af0&&tp.ctx==0&&tp.ctx2==1&&Selected=="")Select(tp.Key());if((embed&&String.Equals(name,"EmbedEuphoria474_DrawHide_TEST2",StringComparison.Ordinal))||(BoundProcess=="euphoriaHD"&&name=="YU-RIS6"&&tp.addr==0x41e3a4)){ThreadPool.QueueUserWorkItem(_=>{try{Select(tp.Key());}catch(Exception e){Diagnostic("test-select-error "+e.Message);}});}if(Selected==tp.Key()&&Enabled&&ReplacementEnabled&&embed)MarkEmbedDirty(tp.Key());List();if(Resume!=null&&Convert.ToString(Resume["code"])==code&&Convert.ToString(Resume["addr"])==tp.addr.ToString("x")&&Convert.ToString(Resume["ctx"])==tp.ctx.ToString("x")&&Convert.ToString(Resume["ctx2"])==tp.ctx2.ToString("x")){BeginResumeSelection();ThreadPool.QueueUserWorkItem(_=>{try{Select(tp.Key());}catch(Exception e){Diagnostic("restore-error "+e.Message);}});}}ScheduleEmbedSync();ThreadPool.QueueUserWorkItem(_=>{try{Rescan();}catch{}});}
 static void OnDestroy(string code,string name,ThreadParam tp){if(tp.processId!=Pid)return;lock(Gate){Candidates.Remove(tp.Key());if(Selected==tp.Key()){LeaveSelected();Selected="";Enabled=false;FlushFit();SyncGpuRenderers();Status("所选文本流已移除，请重新选择");}List();}ScheduleEmbedSync();}
 const string AutoSkip="^String:|name|speaker|mail|choice|select|ruby|GDI|TextOut|GlyphOutline|DrawText|Console|Clipboard|Stuff|Window|Menu";
 /* 2026-11-26 (オルフレール, KiriKiri without KAG3: its own cメッセージ system calls Layer.drawText per character, so global.kag never
    exists and native/krkrtext reports "wait kag" for good; the dialogue reached only tTVPNativeBaseBitmap::DrawText, every character
    twice ("私私もも頑頑張張…"), and was dropped as aux noise while a name field stream ("クレレアア") held the selection). A KiriKiri game
    whose KAG DLL said "wait kag" and nothing else for KrkrNoKagMs: that DrawText stream may be auto-selected (it is the only dialogue
    source there) and its per-character doubling is undone. A KAG game (any other status) is never affected. */
 const string KrkrDrawText="tTVPNativeBaseBitmap::DrawText";const double KrkrNoKagMs=20000;static long KrkrWaitKagAt=0;static bool KrkrKagSeen=false;
 static void KrkrKagStatus(string said){if((said??"").StartsWith("wait kag",StringComparison.Ordinal)){if(!KrkrKagSeen)Interlocked.CompareExchange(ref KrkrWaitKagAt,DateTime.UtcNow.Ticks,0);}else{KrkrKagSeen=true;Interlocked.Exchange(ref KrkrWaitKagAt,0);}}
 static bool KrkrNoKag(){long at=Interlocked.Read(ref KrkrWaitKagAt);return at!=0&&!KrkrKagSeen&&(DateTime.UtcNow-new DateTime(at,DateTimeKind.Utc)).TotalMilliseconds>=KrkrNoKagMs;}
 static bool KrkrNoKagSelfTest(){long keep=KrkrWaitKagAt;bool seen=KrkrKagSeen;try{
  if(UndoublePrefix("昇昇りり始始めめ感感じ、ゆっくり")!="昇り始め感じ、ゆっくり"||UndoublePrefix("首首都都―――アアンン")!="首都――アン"||UndoublePrefix("はいはい")!="はいはい"||UndoublePrefix("ここここはは")!="ここは"||KrkrRank("KiriKiri2")<=KrkrRank(KrkrDrawText))return false;
  if(KrkrSplitOptions("……本当は、お優しい方なのかしら……本当に、几帳面な方なのね")!="……本当は、お優しい方なのかしら\n……本当に、几帳面な方なのね"||KrkrSplitOptions("「はい」と言った。")!="「はい」と言った。"||KrkrSplitOptions("クレア")!="クレア"||KrkrSplitOptions("いる。海に面しているため、貿易事業")!="いる。海に面しているため、貿易事業")return false;
  {var tpx=new ThreadParam{processId=1,addr=0x9999,ctx=7,ctx2=1};if(KrkrJoinPiece("c","KiriKiri2",tpx,"「",0)!=null||KrkrJoinPiece("c","KiriKiri2",tpx,"こんな",0)!=null||KrkrJoinPiece("c","KiriKiri2",tpx,"ことが？」",0)!="「こんなことが？」"||KrkrJoinPiece("c","KiriKiri2",tpx,"一文。",0)!="一文。"||KrkrJoinPiece("c","KiriKiri2",tpx,"途中まで",0)!=null||KrkrJoinPiece("c","KiriKiri2",tpx,"「次の行",0)!="途中まで"||KrkrJoinPiece("c","KiriKiri2",tpx,"です」",0)!="「次の行です」"||UndoubleChars("ここ",2)!="こ")return false;}
  if(UndoubleChars("私私もも頑頑張張るる")!="私も頑張る"||UndoubleChars("はいはい")!="はいはい"||UndoubleChars("クレレアア")!="クレレアア")return false;
  KrkrWaitKagAt=0;KrkrKagSeen=false;if(!AutoSkipped(KrkrDrawText))return false;KrkrKagStatus("wait kag");if(!AutoSkipped(KrkrDrawText))return false;/* not yet 20 s */
  KrkrWaitKagAt=DateTime.UtcNow.AddSeconds(-30).Ticks;if(AutoSkipped(KrkrDrawText)||!AutoSkipped("GDI TextOutW")||!AutoSkipped("KiriKiri name"))return false;
  KrkrKagStatus("ok layers=2");if(!AutoSkipped(KrkrDrawText))return false;KrkrKagStatus("wait kag");return AutoSkipped(KrkrDrawText);/* a KAG game stays a KAG game */
 }finally{KrkrWaitKagAt=keep;KrkrKagSeen=seen;}}
 static bool AutoSkipped(string name){if(String.Equals(name,KrkrDrawText,StringComparison.Ordinal)&&KrkrNoKag())return false;return System.Text.RegularExpressions.Regex.IsMatch(name??"",AutoSkip,System.Text.RegularExpressions.RegexOptions.IgnoreCase);}
 /* 2026-11-26 source no-draw (MeguLitHook MeguLitDrawSkip.h; オルフレール: the original stayed on screen because the stream read
    cannot write back, the GPU hide layer missed the per-character glyphs and the GDI hide never applies to KiriKiri's own glyphs).
    The hook DLL announces a draw call that can draw nothing ("MeguLit_DRAWSKIP ready addr="). Behind the no-KAG gate only, a stream
    of that call whose text is part of the dialogue (the selected stream's recent text, or the selected stream itself) is locked as a
    dialogue context and switched on while the reader wants the original hidden; the DLL then hands the game an empty text there and
    locks that drawing object, so the other lines of the message layer go too, and menus, buttons, the name entry and choices on other
    layers stay. The DLL counts what it did not draw ("MeguLit_DRAWSKIP hit n="): the first count confirms the selected stream
    hide-only (as a GDI hide hit does), the count is listed on the selected stream (drawSkipped) and in the status line. */
 static readonly HashSet<ulong> DrawSkipAddrs=new HashSet<ulong>();static readonly HashSet<string> DrawBody=new HashSet<string>();static readonly Dictionary<string,string> DrawPieces=new Dictionary<string,string>();
 static string DrawBodyText="";static long DrawSkipped=0;static bool DrawSkipConfirmed=false;const int DrawBodyKeep=1200,DrawBodyMin=4;
 static bool DrawSkippable(Candidate c){if(c==null)return false;lock(DrawSkipAddrs){if(!DrawSkipAddrs.Contains(c.tp.addr))return false;}return KrkrNoKag();}
 internal static bool DrawSkipWant(bool body,bool skippable,bool chinese,bool replacement,bool probe){return body&&skippable&&!chinese&&(replacement||probe);}
 internal static string DrawPiece(string text){return System.Text.RegularExpressions.Regex.Replace(text??"",@"[\s　]+","");}
 internal static bool DrawBodyMatch(string body,string piece){piece=DrawPiece(piece);return piece.Length>=DrawBodyMin&&DrawPiece(body).Contains(piece);}
 internal static ulong DrawSkipReadyAddr(string line){var m=System.Text.RegularExpressions.Regex.Match(line??"",@"^MeguLit_DRAWSKIP ready addr=([0-9a-fA-F]{1,16})\s*$");ulong a;return m.Success&&UInt64.TryParse(m.Groups[1].Value,System.Globalization.NumberStyles.HexNumber,null,out a)?a:0;}
 internal static long DrawSkipHitCount(string line){var m=System.Text.RegularExpressions.Regex.Match(line??"",@"^MeguLit_DRAWSKIP hit n=(\d{1,12})\b");long n;return m.Success&&Int64.TryParse(m.Groups[1].Value,out n)?n:-1;}
 static void DrawBodyKeys(Action<string> each){List<string> keys;lock(DrawBody){keys=new List<string>(DrawBody);}foreach(var k in keys)each(k);}
 /* one undoubled piece of a no-KAG KiriKiri stream; caller holds Gate. -> true when a dialogue context was locked now */
 static bool DrawBodySeen(string key,string text){bool added=false;Candidate c;if(!Candidates.TryGetValue(key,out c))return false;
  if(key==Selected){DrawBodyText=DrawBodyText+DrawPiece(text);if(DrawBodyText.Length>DrawBodyKeep)DrawBodyText=DrawBodyText.Substring(DrawBodyText.Length-DrawBodyKeep);
   if(DrawSkippable(c))lock(DrawBody){added|=DrawBody.Add(key);}
   foreach(var kv in new List<KeyValuePair<string,string>>(DrawPieces)){if(!DrawBodyMatch(DrawBodyText,kv.Value))continue;lock(DrawBody){added|=DrawBody.Add(kv.Key);}DrawPieces.Remove(kv.Key);MarkEmbedDirty(kv.Key);Diagnostic("draw skip: dialogue context locked "+kv.Key);}
   if(added)MarkEmbedDirty(key);return added;}
  if(!DrawSkippable(c))return false;lock(DrawBody){if(DrawBody.Contains(key))return false;}
  if(DrawBodyMatch(DrawBodyText,text)){lock(DrawBody){DrawBody.Add(key);}DrawPieces.Remove(key);MarkEmbedDirty(key);Diagnostic("draw skip: dialogue context locked "+key);return true;}
  string p=DrawPiece(text);if(p.Length>=DrawBodyMin){string was;DrawPieces.TryGetValue(key,out was);p=(was??"")+p;if(p.Length>200)p=p.Substring(p.Length-200);DrawPieces[key]=p;}return false;}
 static void DrawSkipReady(string line){ulong a=DrawSkipReadyAddr(line);if(a==0)return;lock(DrawSkipAddrs){DrawSkipAddrs.Add(a);}Diagnostic("draw skip ready at "+a.ToString("x"));}
 static void DrawSkipHit(string line){long n=DrawSkipHitCount(line);if(n<0)return;bool first=false;string name="",code="";
  lock(Gate){Interlocked.Exchange(ref DrawSkipped,n);Candidate c;if(!DrawSkipConfirmed&&Selected!=""&&Candidates.TryGetValue(Selected,out c)){DrawSkipConfirmed=true;first=true;name=c.name;code=c.code;if(!c.embed){c.embed=true;c.hideOnly=true;}}List();}
  if(first)Diagnostic("draw skip confirmed for "+name+" "+code+": hide-only (the game draws nothing on the dialogue layer)");
  Diagnostic("draw skip: "+n+" characters not drawn");Status("原文源头不画：已跳过 "+n+" 字");}
 static bool DrawSkipSelfTest(){
  if(DrawSkipReadyAddr("MeguLit_DRAWSKIP ready addr=538f14")!=0x538f14UL||DrawSkipReadyAddr("MeguLit_DRAWSKIP ready addr=")!=0||DrawSkipReadyAddr("MeguLit_GDIHIDE hit fn=x")!=0)return false;
  if(DrawSkipHitCount("MeguLit_DRAWSKIP hit n=128 self=1a2b on=1")!=128||DrawSkipHitCount("MeguLit_DRAWSKIP hit n=x")!=-1||DrawSkipHitCount("MeguLit_DRAWSKIP ready addr=1")!=-1)return false;
  if(!DrawBodyMatch("　昇り始めた陽の光を感じ、ゆっくりと瞼を開く。","ゆっくりと瞼")||DrawBodyMatch("　昇り始めた陽の光を感じ、ゆっくりと瞼を開く。","クレア")||DrawBodyMatch("ここはアンゼリア国。","はじめから")||DrawBodyMatch("abc","ab"))return false;
  /* switched on only for a locked dialogue context of a skippable stream, never for Chinese text, only while the reader wants the original hidden */
  if(!DrawSkipWant(true,true,false,true,false)||!DrawSkipWant(true,true,false,false,true)||DrawSkipWant(false,true,false,true,true)||DrawSkipWant(true,false,false,true,true)||DrawSkipWant(true,true,true,true,true)||DrawSkipWant(true,true,false,false,false))return false;
  /* the gate: a skippable address is skippable only behind the no-KAG gate (a KAG game never switches it on) */
  long keep=KrkrWaitKagAt;bool seen=KrkrKagSeen;var probe=new Candidate{tp=new ThreadParam{processId=1,addr=0xdead5eedUL,ctx=0,ctx2=0x90}};try{
   lock(DrawSkipAddrs){DrawSkipAddrs.Add(0xdead5eedUL);}KrkrWaitKagAt=DateTime.UtcNow.AddSeconds(-30).Ticks;KrkrKagSeen=false;if(!DrawSkippable(probe))return false;
   KrkrKagSeen=true;if(DrawSkippable(probe))return false;KrkrKagSeen=false;probe.tp.addr=0xdead5eeeUL;if(DrawSkippable(probe))return false;
  }finally{lock(DrawSkipAddrs){DrawSkipAddrs.Remove(0xdead5eedUL);}KrkrWaitKagAt=keep;KrkrKagSeen=seen;}
  return true;}
 /* every character twice in a row ("私私もも" -> "私も"); anything else unchanged */
 /* a typewriter that draws every glyph twice, completed by a click: the doubled prefix once, the rest as it is ("昇昇りり始始め
    めたた感感じ、ゆっくり" -> "昇り始めた感じ、ゆっくり"). One stray character between pairs is kept (a dash drawn three times). Needs two
    doubled pairs at the start; anything else unchanged */
 internal static string UndoublePrefix(string text){if(text==null||text.Length<4||text[0]!=text[1]||text[2]!=text[3])return text;var sb=new System.Text.StringBuilder(text.Length);int i=0;
  while(i+1<text.Length){if(text[i]==text[i+1]){sb.Append(text[i]);i+=2;continue;}if(i+2<text.Length&&text[i+1]==text[i+2]){sb.Append(text[i]);i+=1;continue;}break;}
  sb.Append(text.Substring(i));return sb.ToString();}
 /* which KiriKiri hook stream carries whole lines when there is no KAG: the line hook, then the glyph hooks */
 /* YU-RIS streams (LunaHook Yuris.cpp) and which of them carries the dialogue when they repeat glyphs: the TextOutA call, then the
    other glyph hook, then yuris7's two-character pieces; yuris8/yuris9 (script strings, resource names) never take it this way */
 static bool YurisStream(string name){return System.Text.RegularExpressions.Regex.IsMatch(name??"",@"^(YU-RIS\d*|yuris\d+|EmbedYURIS\d*)$");}
 static int YurisRank(string name){return name=="YU-RIS2"?3:name=="YU-RIS"?2:name=="yuris7"?1:0;}
 static readonly Dictionary<string,int> YurisFolds=new Dictionary<string,int>();
 /* 2026-11-26 (Monochrome Empire r1: the folded lines reached the reader, the original stayed: the glyph layer got each joined line
    after the typewriter had drawn it, placed=0): YU-RIS2 is the TextOutA call itself, so the DLL's GDI hide (MeguLitGdiHide.h) sees
    each glyph fed by that hook just before the same call draws it, and leaves it undrawn. A selected folded YU-RIS2 stream is switched on
    for it like a write-back stream (gdiProbe streams are otherwise left to the GPU / glyph layers, DotsOwn) */
 static bool YurisGdiOwn(string key){Candidate c;return key!=null&&YurisFolded(key)&&Candidates.TryGetValue(key,out c)&&c.name=="YU-RIS2";}
 static bool YurisFolded(string key){lock(YurisFolds){return key!=null&&YurisFolds.ContainsKey(key);}}
 /* the stream's repeat factor: learned once from a text that is nothing but runs of a common length N (N >= 3 over two runs, or N = 2
    over four), kept for the stream; 0 while none was seen */
 static int YurisFoldOf(string key,string name,string text){int n;lock(YurisFolds){if(YurisFolds.TryGetValue(key,out n))return n;n=RepeatFold(text);if(n<2)return 0;YurisFolds[key]=n;}Diagnostic("yuris: "+name+" id="+key+" repeats every character "+n+" times; folded from now on");return n;}
 internal static int RepeatFold(string text){if(text==null||text.Length<4)return 0;int g=0,runs=0;for(int i=0;i<text.Length;){int j=i;while(j<text.Length&&text[j]==text[i])j++;int k=j-i;if(k<2)return 0;g=Gcd(g,k);runs++;i=j;}
  if(g<2||runs<2||g==2&&runs<4)return 0;return g;}
 static int Gcd(int a,int b){while(b!=0){int t=a%b;a=b;b=t;}return a;}
 /* a run of k characters is k / n of them; what is left over counts as one more when it is over half of n (a run cut by the flush:
    「んんんんんんて」), and as itself when the run is shorter than n (a glyph drawn once among the repeated ones: "っ", "お", "……") */
 internal static string Unfold(string text,int n){if(text==null||n<2)return text;var sb=new System.Text.StringBuilder(text.Length);for(int i=0;i<text.Length;){int j=i;while(j<text.Length&&text[j]==text[i])j++;int k=j-i,q=k/n,r=k%n;sb.Append(text[i],q+(r==0?0:r>n/2?1:q==0?r:0));i=j;}return sb.ToString();}
 /* a name plate drawn by a string call per glyph: each pass reads the name from every glyph on ("朽木" + "木"), N passes:
    「朽木木朽木木朽木木…」 → 朽木 at `at`, `len` characters of the text; null when there is none (three passes at least) */
 internal static string YurisNameChain(string text,out int at,out int len,int reps=3){at=0;len=0;if(text==null)return null;
  for(int i=0;i+2*reps<=text.Length;i++)for(int m=2;m<=8;m++){if(i+m>text.Length)break;var b=new System.Text.StringBuilder();for(int s=0;s<m;s++)b.Append(text,i+s,m-s);string block=b.ToString();
   int k=0;while(i+(k+1)*block.Length<=text.Length&&String.CompareOrdinal(text,i+k*block.Length,block,0,block.Length)==0)k++;
   if(k>=reps){string who=text.Substring(i,m);if(who.Trim(who[0]).Length>0&&System.Text.RegularExpressions.Regex.IsMatch(who,@"^[぀-ヿ一-鿿Ａ-ｚＡ-Ｚ・ー]+$")){at=i;len=k*block.Length;return who;}}}
  return null;}
 static bool YurisFoldSelfTest(){
  {int at,len;string who=YurisNameChain("朽木木朽木木朽木木朽木木朽木木朽木木朽木木朽木木（あれ？）",out at,out len);if(who!="朽木"||at!=0||len!=24)return false;
   who=YurisNameChain("ものが言えない。浩平平浩平平浩平平浩平平浩平平浩平平浩平平浩平平「おい」",out at,out len);if(who!="浩平"||at!=8||len!=24)return false;
   if(YurisNameChain("「はいはい、そうですね」",out at,out len)!=null||YurisNameChain("ここここここ",out at,out len)!=null||YurisNameChain("ーーーーーーーーーーーー",out at,out len)!=null)return false;}
  {int at,len;if(YurisNameChain("主神神主神神「ほう」",out at,out len)!=null||YurisNameChain("主神神主神神「ほう」",out at,out len,2)!="主神"||len!=6)return false;}
  if(JoinEnd("「あの、私。")||!JoinEnd("「あの、私。これから」")||!JoinEnd("あの。")||JoinEnd("『ああ（いい）。")||!JoinEnd("いい）。")||JoinEnd("「あの、私……"))return false;
  if(RepeatFold("誕誕誕誕誕誕誕誕生生生生生生生生")!=8||Unfold("誕誕誕誕誕誕誕誕生生生生生生生生",8)!="誕生")return false;
  if(RepeatFold("心心心心心心心心")!=0||Unfold("心心心心心心心心",8)!="心"||Unfold("お",8)!="お"||Unfold("……",8)!="……"||Unfold("――――――――――――――――ああああああああ",8)!="――あ"||Unfold("んんんんんんて",8)!="んて"||Unfold("怒怒怒怒怒怒怒怒怒りを",8)!="怒りを")return false;
  if(RepeatFold("ここここはは")!=0||RepeatFold("私私もも頑頑張張るる")!=2||RepeatFold("はいはい")!=0||RepeatFold("ああああ")!=0||RepeatFold("「おはよう」")!=0||RepeatFold("ーーーー")!=0)return false;
  if(Unfold("スマスにも、プレゼントはいらなかった。",8)!="スマスにも、プレゼントはいらなかった。")return false;
  if(!YurisStream("YU-RIS2")||!YurisStream("yuris9")||!YurisStream("EmbedYURIS6")||YurisStream("KiriKiri2")||YurisStream(KrkrDrawText))return false;
  if(YurisRank("YU-RIS2")<=YurisRank("YU-RIS")||YurisRank("YU-RIS")<=YurisRank("yuris7")||YurisRank("yuris9")!=0||YurisRank("yuris8")!=0)return false;
  string key="yuris-self-test";lock(YurisFolds){YurisFolds.Remove(key);}try{
   if(YurisFoldOf(key,"YU-RIS2","お")!=0||YurisFoldOf(key,"YU-RIS2","誕誕誕誕誕誕誕誕生生生生生生生生")!=8||YurisFoldOf(key,"YU-RIS2","お")!=8||!YurisFolded(key))return false;
  }finally{lock(YurisFolds){YurisFolds.Remove(key);}}
  return true;}
 static int KrkrRank(string name){return name=="KiriKiri2"?3:name=="KiriKiri1"?2:name==KrkrDrawText?1:0;}
 static readonly Dictionary<string,DateTime> KrkrLineAt=new Dictionary<string,DateTime>();
 /* a no-KAG KiriKiri stream flushed piece by piece at reading pace (LunaHook ends a frame at every pause of the typewriter: 「「 / ここ /
    んん / … / に話を…ないかな？」): the pieces of one stream are one line up to a sentence end, or KrkrJoinMs without a piece */
 const int KrkrJoinMs=1200,KrkrJoinMax=400;class KrkrPending{public System.Text.StringBuilder text=new System.Text.StringBuilder();public System.Threading.Timer timer;public string code,name;public ThreadParam tp;public long probe;}
 static readonly Dictionary<string,KrkrPending> KrkrJoin=new Dictionary<string,KrkrPending>();[ThreadStatic] static bool KrkrJoinFlush;
 static void KrkrJoinDue(object state){string key=(string)state;KrkrPending p;lock(KrkrJoin){if(!KrkrJoin.TryGetValue(key,out p))return;KrkrJoin.Remove(key);}try{p.timer.Dispose();}catch{}
  string text=p.text.ToString();if(text.Length==0)return;KrkrJoinFlush=true;try{Diagnostic("krkr no-KAG: joined (quiet) "+p.name+" chars="+text.Length);OutputFrame(p.code,p.name,p.tp,text,p.probe);}catch(Exception e){Diagnostic("krkr join error "+e.Message);}finally{KrkrJoinFlush=false;}}
 /* -> the whole line to handle now, or null when the piece was kept for later */
 static string KrkrJoinPiece(string code,string name,ThreadParam tp,string text,long probe){string key=tp.Key();lock(KrkrJoin){KrkrPending p;
  if(!KrkrJoin.TryGetValue(key,out p)){if(JoinEnd(text))return text;p=new KrkrPending{code=code,name=name,tp=tp,probe=probe};p.timer=new System.Threading.Timer(KrkrJoinDue,key,Timeout.Infinite,Timeout.Infinite);KrkrJoin[key]=p;}
  /* a piece that opens a new line (「『（ or the full-width indent), or a line already KrkrJoinMax long (fast-forward: no closing
     punctuation for a long time, 4036 characters on オルフレール), closes what was kept before it */
  if(p.text.Length>0&&("「『（　".IndexOf(text[0])>=0||p.text.Length+text.Length>KrkrJoinMax)){string before=p.text.ToString();p.text.Clear().Append(text);p.timer.Change(KrkrJoinMs,Timeout.Infinite);Diagnostic("krkr no-KAG: joined (next line) "+name+" chars="+before.Length);return before;}
  p.text.Append(text);string all=p.text.ToString();if(JoinEnd(all)){KrkrJoin.Remove(key);try{p.timer.Dispose();}catch{}if(all.Length>text.Length)Diagnostic("krkr no-KAG: joined "+name+" chars="+all.Length);return all;}
  p.timer.Change(KrkrJoinMs,Timeout.Infinite);return null;}}
  /* オルフレール's two options came as one text (LunaHook flushed both draws at once: "……本当は、お優しい方なのかしら……本当に、几帳面
    な方なのね"), so the kernel saw one candidate and no choice reached the reader. A short text without a sentence end whose opening mark
    (…… … 「 『 （ ・ ― or the first two characters) comes again later is split there, one option per line (the bridge's batch format) */
 internal static string KrkrSplitOptions(string text){string t=(text??"").Trim();if(t.Length<6||t.Length>160||t.IndexOf('\n')>=0||SentenceEnd(t))return text;
  string mark=null;foreach(string m in new[]{"……","…","「","『","（","・","―"})if(t.StartsWith(m,StringComparison.Ordinal)){mark=m;break;}if(mark==null)return text;/* only an explicit opening mark: "the first two characters" cut narration at a repeated 「いる」 */
  var parts=new List<string>();int from=0;for(int i=mark.Length+2;i<=t.Length-mark.Length;i++){if(String.CompareOrdinal(t,i,mark,0,mark.Length)!=0)continue;if(i>0&&mark.Length>0&&t[i-1]==mark[0])continue;parts.Add(t.Substring(from,i-from));from=i;i+=mark.Length;}
  parts.Add(t.Substring(from));if(parts.Count<2||parts.Count>6)return text;foreach(string x in parts)if(x.Trim().Length<mark.Length+2)return text;return String.Join("\n",parts);}
/* 2026-11-26 (Monochrome Empire: a 。 inside 「…」 closed the line and the quote reached the reader as two lines; オルフレール the same:
   「盗賊団に…ってね……。 / この村は大丈夫かねえ。 / 不安だよ……」 came 0.6 s and 0.4 s apart, too short to be read, Cardinal row 0.886): the
   joiner ends a line at a sentence end only when every 「『（ in it is closed. The quiet timer (KrkrJoinMs) and KrkrJoinMax still end an
   unclosed one, so a quote running over two pages reaches the reader page by page, KrkrJoinMs late */
 internal static bool JoinEnd(string t){if(!SentenceEnd(t))return false;int a=0,b=0,c=0;foreach(char ch in t??""){if(ch=='「')a++;else if(ch=='」')a--;else if(ch=='『')b++;else if(ch=='』')b--;else if(ch=='（')c++;else if(ch=='）')c--;}return a<=0&&b<=0&&c<=0;}
/* closing punctuation only: a typed 「― or 「… is a pause inside the line, not its end */static bool SentenceEnd(string t){t=(t??"").TrimEnd();return t.Length>0&&"。！？!?」』）)".IndexOf(t[t.Length-1])>=0;}
 internal static string UndoubleChars(string text,int min=4){if(text==null||text.Length<min||text.Length<2||text.Length%2!=0)return text;for(int i=0;i<text.Length;i+=2)if(text[i]!=text[i+1])return text;var sb=new System.Text.StringBuilder(text.Length/2);for(int i=0;i<text.Length;i+=2)sb.Append(text[i]);return sb.ToString();}
 // SACT2 uses one hook for sprite text. The map label can speak twice before the
 // first named dialogue line and take the selected context with it.
 const string Sact2TextHook="HS-4:-10@B1E0:SACT2.dll";
 static bool Sact2DialogueStream(Candidate candidate){
  return candidate!=null&&candidate.role==0&&!candidate.embed&&
   candidate.tp.ctx==0xf139&&(candidate.tp.ctx2==12||candidate.tp.ctx2==14)&&
   String.Equals(candidate.code,Sact2TextHook,StringComparison.OrdinalIgnoreCase);
 }
 static bool Sact2Speech(Candidate candidate,string text){
  if(!Sact2DialogueStream(candidate))return false;
  string line=(text??"").Trim();
  if(PageDump(line))return false;
  return Regex.IsMatch(line,@"\A【[^】\r\n]{1,40}】[ \t\u3000]*(?:「[^」]+」|『[^』]+』|（[^【】\r\n]+）)\z");
 }
 static bool PreferSact2Speech(Candidate current,Candidate next,string text,bool manual){
  return !manual&&current!=null&&next!=null&&current.tp.addr==next.tp.addr&&current.tp.ctx==next.tp.ctx&&
   current.tp.ctx2!=next.tp.ctx2&&String.Equals(current.code,next.code,StringComparison.OrdinalIgnoreCase)&&Sact2Speech(next,text);
 }
 static bool Sact2SpeechSelfTest(){
  const string code="HS-4:-10@B1E0:SACT2.dll", place="     【洞窟】          通路";
  const string dialogue="【勇者】「やりましたね、先生」";
  var current=new Candidate{name="System40",code=code,sample=place,tp=new ThreadParam{addr=0x401000,ctx=0xf139,ctx2=8}};
  var next=new Candidate{name="System40",code=code,tp=new ThreadParam{addr=0x401000,ctx=0xf139,ctx2=12}};
  if(!PreferSact2Speech(current,next,dialogue,false)||PreferSact2Speech(current,next,dialogue,true)||
     PreferSact2Speech(current,next,place,false)||PreferSact2Speech(current,next,dialogue+"【案内】「戻る」",false))return false;
  var aside=new Candidate{name="System40",code=code,tp=new ThreadParam{addr=0x401000,ctx=0xf139,ctx2=14}};
  const string monologue="【勇者】（この暗い道の先に　何があるの（たぶん出口）だろう）";
  if(!PreferSact2Speech(next,aside,monologue,false)||!PreferSact2Speech(aside,next,dialogue,false)||
     PreferSact2Speech(next,aside,monologue,true)||PreferSact2Speech(next,aside,monologue+monologue,false)||
     !Sact2DrawWanted(true,false,false,false,true,aside))return false;
  if(!Sact2DrawWanted(true,false,false,false,false,current)||!Sact2DrawWanted(true,false,false,false,true,next)||
     Sact2DrawWanted(false,false,false,false,false,next)||Sact2DrawWanted(true,true,false,false,false,next)||
     Sact2DrawWanted(true,false,true,false,false,next)||Sact2DrawWanted(true,false,false,true,false,next)||
     Sact2DrawWanted(true,false,false,false,true,current)||!Sact2GenericHideSelfTest(next))return false;
  next.tp.ctx=0x1000;
  if(PreferSact2Speech(current,next,dialogue,false))return false;
  next.tp.ctx=0xf139;
  current.code=next.code="HS-4:-10@B1E0:another.dll";
  return !PreferSact2Speech(current,next,dialogue,false);
 }
 static void FollowSact2Speech(ThreadParam tp,string text){
  lock(Gate){
   Candidate current,next;
   if(!Enabled||tp.Key()==Selected||!Candidates.TryGetValue(Selected,out current)||
      !Candidates.TryGetValue(tp.Key(),out next)||!PreferSact2Speech(current,next,text,ManualPick))return;
   FromMemory=false;
   MemorySaved=false;
   Select(tp.Key(),false);
  }
 }
 static readonly HookSourceFrames SourceFrames=new HookSourceFrames();
 static void OnOutput(string code,string name,ThreadParam tp,string text){long probe=Interlocked.Read(ref StreamProbe);if(SadisticPageRedraw(name,tp))return;if(KnownNaninovel&&!Printer(code))return;if(KnownNaninovel)Diagnostic("out "+tp.Key()+" "+Json.Serialize(text!=null&&text.Length>300?text.Substring(0,300):text));if(KnownNaninovel){lock(Gate){Candidate current;if(Selected!=""&&Candidates.TryGetValue(Selected,out current)&&!(current.code??"").Contains(":Naninovel.UI:RevealableText:SetTextValue:"))Select(tp.Key());}}if(name=="EmbedToMeCS2_DrawPreserve"||name=="EmbedEuphoria474_DrawHide_TEST2"){lock(Gate){foreach(string frame in SourceFrames.Feed(tp.Key(),text))OutputFrame(code,name,tp,frame,probe);}return;}OutputFrame(code,name,tp,text,probe);}
 /* E500 the game window's own title, read at most every 2 s: a stream that carries it is not choice text */ static string CaptionText="";static DateTime CaptionAt=DateTime.MinValue;static string GameCaption(){if((DateTime.UtcNow-CaptionAt).TotalSeconds<2)return CaptionText;CaptionAt=DateTime.UtcNow;try{using(var p=System.Diagnostics.Process.GetProcessById((int)Pid))CaptionText=p.MainWindowTitle??"";}catch{CaptionText="";}return CaptionText;}
 static void OutputFrame(string code,string name,ThreadParam tp,string text,long probe){if(tp.processId!=Pid||String.IsNullOrWhiteSpace(text))return;/* 2026-11-12 a file path the game opens is never text to read (EmbedTextPolicy.StripPaths) */{string kept=EmbedTextPolicy.StripPaths(text);if(kept.Length!=text.Length){Diagnostic("paths dropped "+name+" chars="+(text.Length-kept.Length));text=kept;if(String.IsNullOrWhiteSpace(text))return;}}if(!AcceptProbeFrame(probe,tp,text))return;
  if(String.Equals(code,Sact2TextHook,StringComparison.OrdinalIgnoreCase))FollowSact2Speech(tp,text);
  if(KrkrRank(name)>0&&KrkrNoKag()){string once=UndoubleChars(text,2);if(once==text)once=UndoublePrefix(text);text=once;{bool locked;lock(Gate){locked=DrawBodySeen(tp.Key(),text);}if(locked)FlushEmbedSync();}
   if(!KrkrJoinFlush){string whole=KrkrJoinPiece(code,name,tp,text,probe);if(whole==null)return;text=whole;}
   /* the stream that carries whole lines takes the selection: a complete sentence there, and the selected stream ranks lower or has
      had no complete line for 10 s (a name field context of the same hook). Same rank never moves twice within 10 s */
   if(DialogueLike(text)&&SentenceEnd(text)){string key=tp.Key();bool move=false;var now0=DateTime.UtcNow;lock(Gate){KrkrLineAt[key]=now0;Candidate cur;DateTime at;
     if(Selected!=key){int mine=KrkrRank(name),theirs=Selected!=""&&Candidates.TryGetValue(Selected,out cur)?KrkrRank(cur.name):0;bool quiet=!KrkrLineAt.TryGetValue(Selected,out at)||(now0-at).TotalSeconds>10;move=Selected==""||mine>theirs||mine==theirs&&quiet;}}
    if(move){Diagnostic("krkr no-KAG: dialogue stream "+name+" id="+key);FromMemory=false;MemorySaved=false;Select(key);}}}
  /* 2026-11-26 YU-RIS (Monochrome Empire): the game draws each glyph eight times with TextOutA (an outline), so YU-RIS2 (the TextOutA
     call) and YU-RIS see every character N times ("誕誕誕誕誕誕誕誕生生生生生生生生"), flushed two characters at a time while the line types,
     and the rest at once on a click; yuris7 carries the same pieces once; the stream LunaHook found first (yuris9) holds only script
     resource names ("ysr003"). Once a YU-RIS stream shows a repeat factor (all runs a multiple of N), its text is folded back by N,
     its pieces are joined into lines (KrkrJoinPiece: up to a sentence end, a new opening mark, or 1.2 s without a piece), and a
     complete line there takes the selection from a lower ranked read-only stream. A YU-RIS game whose streams never repeat is unchanged */
  if(YurisStream(name)){int fold=YurisFoldOf(tp.Key(),name,text);if(fold>=2){text=Unfold(text,fold);if(text.Length==0)return;{int at,len;string who=YurisNameChain(text,out at,out len);if(who!=null){/* the name plate: what came before it is the end of the last line, the name goes to the reader as the speaker, the rest goes on */if(at>0)OutputFrame(code,name,tp,text.Substring(0,at),probe);bool sel;lock(Gate){sel=tp.Key()==Selected;}if(sel){Diagnostic("yuris: name "+who);Emit(new{type="hookName",text=who});}text=text.Substring(at+len);if(text.Length==0)return;}}
    if(!KrkrJoinFlush){string whole=KrkrJoinPiece(code,name,tp,text,probe);if(whole==null)return;text=whole;
     /* 2026-11-26 (Monochrome Empire r4: 「貴方は……？」主神神主神神…「ほう。…」 reached the reader as one line): a name plate cut by the
        flushes leaves fewer than three passes in each piece, so the joined line is searched again, two passes being enough there */
     {int at2,len2;string who2;while((who2=YurisNameChain(text,out at2,out len2,2))!=null){if(at2>0){KrkrJoinFlush=true;try{OutputFrame(code,name,tp,text.Substring(0,at2),probe);}finally{KrkrJoinFlush=false;}}
       bool sel2;lock(Gate){sel2=tp.Key()==Selected;}if(sel2){Diagnostic("yuris: name "+who2+" (joined line)");Emit(new{type="hookName",text=who2});}text=text.Substring(at2+len2);if(text.Length==0)return;}}}
    if(DialogueLike(text)&&SentenceEnd(text)){string key=tp.Key();bool move=false;var now0=DateTime.UtcNow;lock(Gate){KrkrLineAt[key]=now0;Candidate cur;DateTime at;
      if(Selected!=key){bool has=Selected!=""&&Candidates.TryGetValue(Selected,out cur);cur=has?Candidates[Selected]:null;int mine=YurisRank(name),theirs=has&&YurisFolded(Selected)?YurisRank(cur.name):-1;bool writable=has&&cur.embed&&!cur.hideOnly;bool quiet=!KrkrLineAt.TryGetValue(Selected,out at)||(now0-at).TotalSeconds>10;move=!writable&&(Selected==""||mine>theirs||mine==theirs&&quiet);}}
     if(move){Diagnostic("yuris: dialogue stream "+name+" id="+key+" (folded x"+fold+")");FromMemory=false;MemorySaved=false;Select(key);}}}}
  ObserveReaderCadence(tp,text);
  /* 2026-11-12 (user, ファタモルガーナの館: "又出现复读"): a per-glyph draw stream (tTVPNativeBaseBitmap::DrawText, KiriKiri1) interleaves the frames of the typewriter, "そうそすれうそばす、れう…", about 0.2 s after a clean stream sent the line. Such a frame is the clean line, wherever it comes from and whichever stream is selected. */{string clean=InterleavedTwin(tp.Key(),text);if(clean!=null){if(clean!=text)Diagnostic("interleave "+name+" chars="+text.Length+" -> "+clean.Length);text=clean;}else if(DialogueLike(text))RememberClean(tp.Key(),text);}/* 2026-11-12 (ファタモルガーナの館: the scenario stream also carries image, music and menu names, "選択ライン", "女中のテーマピアノソロ"): what EmbedTextPolicy.Label calls a label is passed back unchanged and is not a line to show either; a short all-hiragana line ("なるほど") is still a line. */{bool selected;lock(Gate){selected=tp.Key()==Selected;}if(selected&&EmbedTextPolicy.Label(text)&&!SpokenPiece(text)){bool probeOnly;lock(Gate){DialogueHideReady.Remove(tp.Key());Candidate lc;Candidates.TryGetValue(tp.Key(),out lc);probeOnly=LabelStopsEmbed(lc);}if(!GpuLittlecheeseLine(text))GlyphOff();/* 2026-11-19 (live 素晴らしき日々, BGI: one label "屋上と" turned the selected writable stream's embed off and only the GDI probe is ever turned back on, so every later line stayed on screen under the reader): a writable stream decides per line in OnEmbed and keeps its embed; only a probe stream is switched off */if(probeOnly){MarkEmbedDirty(tp.Key());FlushEmbedSync();}Diagnostic("label not shown "+name+" "+Json.Serialize(text));return;}if(selected)QuoteOpen=QuoteState(text,QuoteOpen);}text=EmbedSourceBatch.Unrepeat(text);/* E501 (live CLANNAD beta.24: 「タイトルメニュー」 still reached the reader as the first line, from the stream the reader reads, not only from aux): text that is part of the game window title is never a line, whatever stream sends it */{string tt=text.Trim(),cap=GameCaption();if(tt.Length>=2&&tt.Length<=40&&cap.Length>0&&cap.Contains(tt)){Diagnostic("window caption not shown "+name+" "+Json.Serialize(tt));return;}}{Candidate nameStream;bool isName;lock(Gate){isName=Candidates.TryGetValue(tp.Key(),out nameStream)&&nameStream.role==2;}if(isName&&text.Length<=40){Emit(new{type="hookName",text=text});if(GlyphNames&&GlyphWanted())GlyphSend("EXTRA n "+System.Text.RegularExpressions.Regex.Replace(text,@"[
  ]+"," "));}}if(EmbedTextPolicy.Container(text))ContainerSample(name,text);/* #115 (user: after syncing the prologue once, entering it again needed another sync and its first lines were lost): some engines (Type-Moon) open a new thread context of the very same hook per chapter. A dialogue-length line from such a sibling, while the chosen stream has been quiet for 3 s, moves the selection there before the line is handled, and the new stream is remembered. */{bool follow=false;lock(Gate){Candidate sib,cur;follow=Enabled&&Selected!=""&&tp.Key()!=Selected&&Candidates.TryGetValue(tp.Key(),out sib)&&Candidates.TryGetValue(Selected,out cur)&&SameHookNewContext(cur,sib)&&(DateTime.UtcNow-LastSourceAt).TotalSeconds>=3&&DialogueLike(text)&&!Typing(sib.prevSample,text);}if(follow){Diagnostic("follow new context of the selected hook "+name+" id="+tp.Key());MemorySaved=false;Select(tp.Key());}}/* E609 (DDLC Plus in Japanese, beta.41: "不捕捉不替换"; log: the remembered stream TMP_Text.set_text only carried menu labels and English OS text in this build, every story line came through TextTypewriterEffect.StartText and was shown as aux, so nothing was read, hidden or replaced). Any engine: while the selected stream gives no dialogue-like line, a readable stream that is not a name stream and gives three different dialogue-like lines in a row, paced like reading (0.35 s or more apart, so a backlog dump does not count), takes over; a stream that cannot write back needs five when the selected one can. A stream the player picked by hand is never left. */{bool steal=false;string was="";int got=0;string cap=GameCaption();var twinOn=new List<ThreadParam>();lock(Gate){Candidate rv;DateTime now=DateTime.UtcNow;if(tp.Key()==Selected){if(DialogueLike(text)){DialogueRivals.Clear();LastSelectedLine=text;LastSelectedLineAt=now;foreach(var kv in OtherLines)if(Math.Abs((now-kv.Value.Value).TotalMilliseconds)<1500&&SameLine(kv.Value.Key,text))JaTwinHit(kv.Key,twinOn);}}/* 2026-11-21 (user, Aokana: the line was typed out in the original, then vanished). Its typewriter sets the whole line every frame with a
   per-character <alpha> fade; LunaHook buffers those frames into one output, often over the 600 characters DialogueLike allows. A stream
   whose output repeats the selected line row by row is still a twin. */else if(Enabled&&Selected!=""&&Candidates.TryGetValue(tp.Key(),out rv)&&rv.embed&&rv.role!=2&&rv.role!=3&&!DialogueLike(text)&&DialogueLike(LastSelectedLine)&&Math.Abs((now-LastSelectedLineAt).TotalMilliseconds)<1500&&SameLine(text,LastSelectedLine))JaTwinHit(tp.Key(),twinOn);else if(Enabled&&Selected!=""&&Candidates.TryGetValue(tp.Key(),out rv)&&rv.role!=2&&rv.role!=3&&DialogueLike(text)&&Candidates.ContainsKey(Selected)){/* the same line on another writable stream (a second setter of the same box) within 1.5 s of the selected line, twice: a Japanese twin, hidden with the selected line (OnEmbed) */if(rv.embed){OtherLines[tp.Key()]=new KeyValuePair<string,DateTime>(text,now);if(Math.Abs((now-LastSelectedLineAt).TotalMilliseconds)<1500&&SameLine(text,LastSelectedLine))JaTwinHit(tp.Key(),twinOn);}Candidate cur=Candidates[Selected];if(!ManualPick&&!JaTwins.Contains(tp.Key())&&(now-LastSelectedLineAt).TotalSeconds>=3&&!SameHookNewContext(cur,rv)&&!EngineDialogueSibling(cur,rv)&&!(YurisFolded(Selected)&&YurisRank(rv.name)>0)&&!AutoSkipped(rv.name)&&!EmbedTextPolicy.Unreadable(text)&&!EmbedTextPolicy.AuxNoise(text,cap)){DialogueRival r;if(!DialogueRivals.TryGetValue(tp.Key(),out r)){r=new DialogueRival();DialogueRivals[tp.Key()]=r;}if(text!=r.last&&(now-r.at).TotalSeconds>=0.35){r.hits++;r.last=text;r.at=now;}/* E610 (live DDLC Plus: the remembered plugin stream was resumed, then the stale-memory auto-select took a menu label stream before the story began): the remembered stream takes the selection back with its first dialogue line */if(r.hits>=(RememberedCode!=""&&rv.code==RememberedCode?1:rv.embed||!cur.embed?3:5)){steal=true;was=Selected;got=r.hits;DialogueRivals.Clear();}}}}if(twinOn.Count>0)ScheduleEmbedSync();if(steal){string wasCode="";lock(Gate){Candidate w;if(Candidates.TryGetValue(was,out w))wasCode=w.code??"";}Diagnostic("leave dialogue-less stream "+was+" for "+name+" id="+tp.Key()+" ("+got+" dialogue lines there, none on the selected stream)");Emit(new{type="hookStreamLeft",id=was,code=wasCode,to=tp.Key()});FromMemory=false;MemorySaved=false;SelectedUnreadableRun=0;SelectedReadableRun=0;Select(tp.Key());/* 2026-11-21 (user, Aokana: the first lines showed the original): the line that won the switch is the selected line, so its own twins repeating it moments later (another context of the same setter, the typewriter) are recognised on this line, not on the next */lock(Gate){if(DialogueLike(text)){LastSelectedLine=text;LastSelectedLineAt=DateTime.UtcNow;}}}}/* E407 choices: short Japanese text from any stream other than the dialogue and name streams goes to the reader as auxiliary text (read-only, never written back); the reader keeps only what OCR finds drawn as separate rows. */{Candidate aux=null;bool other;lock(Gate){other=Selected!=""&&tp.Key()!=Selected&&Candidates.TryGetValue(tp.Key(),out aux)&&aux.role!=2;}/* #468 a longer multi-line text of another stream (the whole text box as the game holds it, TMP set_text of an NVL page) is page evidence only: core/hook-native.cjs auxPage */if(other&&text.Length>200&&text.Length<=4000&&text.IndexOf((char)10)>=0&&System.Text.RegularExpressions.Regex.IsMatch(text,"[぀-ヿ一-鿿]"))Emit(new{type="hookPageText",text=text,sourceName=name});if(other&&text.Length<=200&&System.Text.RegularExpressions.Regex.IsMatch(text,"[぀-ヿ一-鿿]")&&EmbedTextPolicy.AuxNoise(text,GameCaption())){Diagnostic("aux noise "+name+" "+Json.Serialize(text.Length>40?text.Substring(0,40):text));}else if(other&&text.Length<=200&&System.Text.RegularExpressions.Regex.IsMatch(text,"[぀-ヿ一-鿿]")){Diagnostic("aux "+name+" role "+aux.role+" chars="+text.Length+" text="+(text.Length>60?text.Substring(0,60):text).Replace("\n","/"));{string auxOut=(KrkrRank(name)>0||(name??"").StartsWith("KiriKiri",StringComparison.Ordinal))&&KrkrNoKag()?KrkrSplitOptions(text):text;if(auxOut!=text)Diagnostic("krkr no-KAG: options split "+name+" "+auxOut.Replace("\n"," | "));Emit(new{type="hookAuxText",text=auxOut,sourceName=name,role=aux.role});}}}/* 2026-11-13 foreign twin (see OnEmbed): a writable stream that is not selected only reaches OnEmbed once embedding is on for it, so it is switched on the first time it carries Latin prose while hiding is active. */{Candidate twin;bool on=false;lock(Gate){on=ReplacementEnabled&&Enabled&&Connected&&!TranslateMode&&Selected!=""&&tp.Key()!=Selected&&Candidates.TryGetValue(tp.Key(),out twin)&&twin.embed&&twin.role!=2&&ForeignTwin(text)&&TwinEmbed.Add(tp.Key());if(on)MarkEmbedDirty(tp.Key());}if(on){ScheduleEmbedSync();Diagnostic("foreign twin embedding on "+name+" id="+tp.Key());}}if(name=="Leaf"){LatestLeaf=text;LatestLeafAt=DateTime.UtcNow;}lock(Gate){Candidate c;if(Candidates.TryGetValue(tp.Key(),out c)){string sample=text.Length>100?text.Substring(0,100)+"…":text;if(c.sample!=sample){c.prevSample=c.sample;c.sample=sample;List();}}if(c!=null&&c.embed&&c.name=="EmbedCS2"&&c.tp.ctx2==1&&Selected!=""&&Candidates.ContainsKey(Selected)&&Candidates[Selected].name=="EmbedCS2"&&Candidates[Selected].tp.ctx2!=1){Select(tp.Key());Diagnostic("auto-upgrade CatSystem scenario role; history role is not the rendered dialogue");}/* the selected stream went quiet and the same hook (same code) now carries the dialogue in a new context (after a name-entry screen): follow it after two such lines */if(Selected!=""&&tp.Key()==Selected){SelectedTextAt=DateTime.UtcNow;SameHookHits.Clear();}else if(Selected!=""&&c!=null&&Candidates.ContainsKey(Selected)&&Candidates[Selected].code==c.code&&c.role!=2&&c.role!=3&&(DateTime.UtcNow-SelectedTextAt).TotalSeconds>8&&System.Text.RegularExpressions.Regex.Matches(text,"[぀-ヿ一-鿿]").Count>=4){/* 2026-11-19 (素晴らしき日々, user test 11:17Z: the game's LOG screen drew 50 old lines through this hook in another context in 0.3 s; it was followed, and on the way back the dialogue context had lost its write-back: read-only, no hiding, no names). Lines that come as a burst (under 0.35 s apart: a LOG, backlog or recollection page) never count; only lines paced like reading do, one line each (a text holding a page of lines is a dump) */int hits;DateTime seen;double since=SameHookSeen.TryGetValue(tp.Key(),out seen)?(DateTime.UtcNow-seen).TotalSeconds:double.MaxValue;SameHookSeen[tp.Key()]=DateTime.UtcNow;SameHookHits.TryGetValue(tp.Key(),out hits);hits=SameHookPace(hits,since,text);SameHookHits[tp.Key()]=hits;if(hits>=2){SameHookHits.Clear();SelectedTextAt=DateTime.UtcNow;Candidate was=Candidates[Selected];c.embed=was.embed;c.hideOnly=was.hideOnly;c.gdiProbe=was.gdiProbe;c.glyphHide=was.glyphHide;/* the context left keeps what it was verified as: when the dialogue comes back to it, it writes back again (it used to be set read-only here) *//* same hook, same nature: the new context takes over what the old one was verified as, so no ranking pulls the selection back */Diagnostic("follow "+c.name+": the selected context went quiet, the same hook carries the dialogue in "+tp.Key());Select(tp.Key());}}if((Selected==""||StaleMemory())&&Candidates.Count==1){Candidate only;if(Candidates.TryGetValue(tp.Key(),out only)&&!System.Text.RegularExpressions.Regex.IsMatch(only.name??"","name|speaker",System.Text.RegularExpressions.RegexOptions.IgnoreCase)){FromMemory=false;Select(tp.Key());}}
   // Several streams (MAGES engines send each line twice): the first engine stream that carries a real Japanese line
   // is taken; name, mail, choice and plain GDI/API drawing streams are not.
   else if(Selected!=""&&c!=null&&c.embed&&tp.Key()!=Selected&&Candidates.ContainsKey(Selected)&&!Candidates[Selected].embed&&Candidates[Selected].sample==c.sample&&!String.IsNullOrWhiteSpace(c.sample)){Diagnostic("prefer embeddable "+c.name+" over "+Candidates[Selected].name);Select(tp.Key());}
   else if((Selected==""||(StaleMemory()&&tp.Key()!=Selected)||(tp.Key()!=Selected&&SelectedUnreadableRun>=2&&SelectedReadableRun<2))&&c!=null&&c.role!=2&&c.role!=3&&!AutoSkipped(c.name)&&text.Length<=600&&System.Text.RegularExpressions.Regex.IsMatch(text,"[぀-ヿ]")&&System.Text.RegularExpressions.Regex.Matches(text,"[぀-ヿ一-鿿]").Count>=4&&(!EmbedTextPolicy.Unreadable(text)||EmbedTextPolicy.EngineText(c.code))){bool leave=Selected!=""&&SelectedUnreadableRun>=2;FromMemory=false;if(leave){MemorySaved=false;Diagnostic("leave unreadable stream "+Selected+" ("+SelectedUnreadableRun+" lines in a row) for "+c.name);}SelectedUnreadableRun=0;SelectedReadableRun=0;Select(tp.Key());Diagnostic("auto-select "+c.name+" (first dialogue stream of "+Candidates.Count+")");}/* 2026-11-15 (沙耶の唄: the auto-select took Nitroplus3, whose every line is UTF-8 read as Shift-JIS, and the Japanese NitroPlus stream stayed aux): a stream is never auto-selected on an unreadable line, and a selected stream that gives two unreadable lines in a row is left for the next stream with a readable dialogue line */if(Enabled&&tp.Key()==Selected){if(EmbedTextPolicy.Unreadable(text)&&(c==null||!EmbedTextPolicy.EngineText(c.code)))SelectedUnreadableRun++;else{SelectedUnreadableRun=0;SelectedReadableRun++;}}if(Enabled&&tp.Key()==Selected){string latest=EmbedBatch.LastLine(text,DateTime.UtcNow);string final=ProfileArtemisQuoteSpans&&name=="Artemis64x"&&!SkipHeld?EmbedBatch.ArtemisQuoteLine(text,DateTime.UtcNow):latest;bool artemisJoined=final!=latest;if(final!=text){Diagnostic("coalesced source batch chars="+text.Length+" final="+final.Length);if(!artemisJoined)ChoiceBatch(name,EmbedBatch.Recent(DateTime.UtcNow));text=final;}if(text.Length>4000)text=text.Substring(0,4000);{bool wasZh=HookTarget.ChineseText;HookTarget.ObserveLanguage(text);if(HookTarget.ChineseText!=wasZh){MarkAllEmbedDirty();ScheduleEmbedSync();}}ReceivedText=true;LastSourceAt=DateTime.UtcNow;Diagnostic("source id="+tp.Key()+" chars="+text.Length);GlyphLine(text);List<string> pageParts=null;double pageAge=0;if(final==text&&!SkipHeld&&!artemisJoined)pageParts=EmbedBatch.Parts(text,DateTime.UtcNow,out pageAge);if(pageParts!=null){Diagnostic("source parts="+pageParts.Count+" age="+(int)pageAge);Emit(new{type="hookSource",text=text,sourceName=name,sourceCode=code,hookActive=true,streamProbe=probe,parts=pageParts.ToArray(),partsAgeMs=(int)pageAge});}else Emit(new{type="hookSource",text=text,sourceName=name,sourceCode=code,hookActive=true,streamProbe=probe});if(File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"enable-hook-probe.flag"))&&Interlocked.Exchange(ref ProbePending,1)==0)ThreadPool.QueueUserWorkItem(_=>{try{Thread.Sleep(250);CaptureProbe();}finally{ProbePending=0;}});}}}
 /* 2026-11-13 (ファタモルガーナの館: the two options 「……おはよう……」「…………」 came on the dialogue stream itself, one right after
    the other, and the batch merge kept only the last as a line). A batch of 2-8 short pieces (at most 30 characters, no
    sentence end, labels left out) is also handed to the reader as choice candidates, read-only; OCR still decides. */
 static void ChoiceBatch(string name,List<string> lines){var pieces=new List<string>();foreach(string raw in lines){string t=(raw??"").Trim();if(t.Length==0||pieces.Contains(t)||EmbedTextPolicy.Label(t))continue;pieces.Add(t);}
  if(pieces.Count<2||pieces.Count>8)return;foreach(string t in pieces)if(t.Length>30||System.Text.RegularExpressions.Regex.IsMatch(t,"[。」』！？!?]$"))return;
  if(!pieces.Exists(t=>System.Text.RegularExpressions.Regex.IsMatch(t,"[぀-ヿ一-鿿]")))return;
  Diagnostic("choice batch "+name+" "+Json.Serialize(pieces));Emit(new{type="hookAuxText",text=String.Join("\n",pieces),sourceName=name+" batch",role=0});}
 static void Input(){string line;while(!Quit&&(line=Console.ReadLine())!=null){try{var d=Json.Deserialize<Dictionary<string,object>>(line);string type=Convert.ToString(d["type"]);if(type=="rescan")Rescan();else if(type=="probeStreams"){long probe;if(d.ContainsKey("id")&&Int64.TryParse(Convert.ToString(d["id"]),out probe))ProbeStreams(probe);}else if(type=="profile"){ApplyProfile(d);}else if(type=="engineGiveWay"){object ms;double v=d.TryGetValue("ms",out ms)?Convert.ToDouble(ms):3000;Interlocked.Exchange(ref GiveWayUntil,DateTime.UtcNow.AddMilliseconds(Math.Max(0,Math.Min(10000,v))).Ticks);}else if(type=="sourceLanguage"){object lv;string lang=d.TryGetValue("value",out lv)?Convert.ToString(lv):"";if(lang=="zh"||lang=="zh!"||lang=="ja"){HookTarget.SetSourceLanguage(lang);GlyphOff();if(Selected!="")Select(Selected);else SyncGpuRenderers();}}else if(type=="waitMarker"){if(WaitHook!=null){if(SharedResourceStream)WaitHook.Disable();else WaitHook.Update(d,Enabled&&Connected);}}else if(type=="probe"){object pv;ProbeWanted=d.TryGetValue("on",out pv)&&Convert.ToBoolean(pv);Probe();}else if(type=="glyphMarks"){object ov;GlyphMarks=d.TryGetValue("on",out ov)&&Convert.ToBoolean(ov);GlyphSend(GlyphMarks?"MARK on":"MARK off");}else if(type=="codepage"){object cv;int cp;if(d.TryGetValue("value",out cv)&&Int32.TryParse(Convert.ToString(cv),out cp)&&(cp==932||cp==936||cp==950||cp==65001)&&cp!=Codepage){Codepage=cp;if(Started)Luna_Settings(180,cp,4000,4000,false);Emit(new{type="hookCodepage",codepage=cp});}}else if(type=="glyphExtras"){object nv,cv;GlyphNames=d.TryGetValue("names",out nv)&&Convert.ToBoolean(nv);if(d.TryGetValue("choices",out cv)){GlyphSend("EXTRA-CLEAR o");var items=cv as System.Collections.IList;if(items!=null&&GlyphWanted())foreach(object it in items){string t=Convert.ToString(it)??"";t=System.Text.RegularExpressions.Regex.Replace(t,@"[\r\n\u2028\u2029]+"," ").Trim();if(t.Length>0&&t.Length<=200)GlyphSend("EXTRA o "+t);}}}else if(type=="glyphMode"){object mv,av,bv;GlyphAll=d.TryGetValue("all",out av)&&Convert.ToBoolean(av);GlyphBlind=d.TryGetValue("blind",out bv)&&Convert.ToBoolean(bv);GlyphModeSet(d.TryGetValue("mode",out mv)?Convert.ToString(mv):"",true);}else if(type=="dialogAway"){object av;bool away=d.TryGetValue("away",out av)&&Convert.ToBoolean(av);bool was=OverlayGate.DialogAway;OverlayGate.DialogAway=away;if(away!=was)Diagnostic("reading layer away with the game's text window: "+(OverlayGate.DialogAway?"the game's text stays hidden":"over"));}else if(type=="skipHeld"){object hv;SetSkipHeld(d.TryGetValue("held",out hv)&&Convert.ToBoolean(hv));}else if(type=="select"){ReplacementEnabled=!SafeMode&&d.ContainsKey("replace")&&Convert.ToBoolean(d["replace"]);string chosen=Convert.ToString(d["id"]);if(chosen!=Selected)MemorySaved=false;ManualPick=d.ContainsKey("manual")&&Convert.ToBoolean(d["manual"]);Select(chosen);}else if(type=="disable"){object why;string reason=d.TryGetValue("reason",out why)?Convert.ToString(why):"";Deactivate(reason=="script-vm-capture-only"||reason=="reader-preflight"||reason=="reader-profile"||reason=="reader-unbound"||reason=="cover-disabled"?reason:"client-request");}else if(type=="enable"){ReplacementEnabled=!SafeMode;ApplySettings();if(Selected!="")Select(Selected);else SyncGpuRenderers();}else if(type=="embedMode"){bool translate=Convert.ToString(d["mode"])=="translate";if(translate!=TranslateMode){TranslateMode=translate;if(Connected)ApplySettings();lock(Gate){foreach(var k in TwinEmbed)MarkEmbedDirty(k);foreach(var k in JaTwins)MarkEmbedDirty(k);}ScheduleEmbedSync();if(!translate){List<long> ids;lock(Gate){ids=new List<long>(PendingEmbeds.Keys);}foreach(long id in ids)FinishEmbed(id,null);}}}else if(type=="embedReply"){object t;object hv;FinishEmbed(Convert.ToInt64(d["id"]),d.TryGetValue("trans",out t)?Convert.ToString(t):"",d.TryGetValue("hide",out hv)&&Convert.ToBoolean(hv));}else if(type=="glyphConv"){object ov;bool ok=d.TryGetValue("ok",out ov)&&Convert.ToBoolean(ov);/* oss-universal conv source: only the compositor confirms it (it saw the marks) or turns it off */GlyphSend(ok?"CONV ok":"CONV off");Diagnostic("glyph conv "+(ok?"ok":"off")+" (compositor)");}else if(type=="textMarks"){object mv;SetMarks(d.TryGetValue("on",out mv)&&Convert.ToBoolean(mv));}else if(type=="quit"){Quit=true;break;}}catch(Exception e){Diagnostic("input-error "+e.Message);Status("Hook 设置未生效，请重新选择对话文本流");}}Quit=true;}
 /* 2026-11-20 (#483 Fate/stay night REMASTERED, Steam: "打开就闪退"; every failed run was injected 1-3 s after the process
    started, the one good run long after: the GPU layer's threads never ran and a later LoadLibrary timed out, so the loader
    lock stayed taken once LunaHook put its generic kernel32/user32 hooks on a game still loading its modules). A game in its
    first seconds is injected only once it has loaded a graphics module (d3d9/d3d11/d3d12/dxgi/opengl32/vulkan-1) and its
    window answers, or after StartupSettleMs at most; a game already running is injected at once. */
 const int StartupSettleMs=10000;
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Module32FirstW(IntPtr snap,ref ModuleEntry32 e);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Module32NextW(IntPtr snap,ref ModuleEntry32 e);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct ModuleEntry32{public uint dwSize,th32ModuleID,th32ProcessID,GlblcntUsage,ProccntUsage;public IntPtr modBaseAddr;public uint modBaseSize;public IntPtr hModule;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=256)]public string szModule;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string szExePath;}
 [DllImport("user32.dll")] static extern IntPtr SendMessageTimeoutW(IntPtr h,uint msg,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
 internal static bool GraphicsModule(string name){return System.Text.RegularExpressions.Regex.IsMatch(name??"",@"^(d3d9|d3d11|d3d12|dxgi|opengl32|vulkan-1)\.dll$",System.Text.RegularExpressions.RegexOptions.IgnoreCase);}
 static bool HasGraphicsModule(uint pid){IntPtr snap=CreateToolhelp32Snapshot(0x18,pid);if(snap==IntPtr.Zero||snap==new IntPtr(-1))return false;try{var e=new ModuleEntry32();e.dwSize=(uint)Marshal.SizeOf(typeof(ModuleEntry32));if(!Module32FirstW(snap,ref e))return false;do{if(GraphicsModule(e.szModule))return true;}while(Module32NextW(snap,ref e));}finally{CloseHandle(snap);}return false;}
 [DllImport("user32.dll")] static extern bool IsHungAppWindow(IntPtr h);
 /* the wait is only for the generic-hook path: no remembered stream or engine-specific address, no Unity/KiriKiri runtime next to
    the program, and no thread of the game still suspended (MeguLit's own suspended start injects before the game runs) */
 internal static bool UnknownEngine(bool resume,bool island,ulong mages,string unity,string remembered,string exe){if(resume||island||mages!=0||(unity??"")!=""||(remembered??"")!="")return false;
  return EngineFileNear(exe)=="";}
 /* an engine MeguLit knows from the game's own files on first play (the names services/engine-fingerprint.cjs reads, plus BGI,
    CatSystem2 and MAGES archives): such a game keeps the early injection its engine hook needs */
 internal static readonly System.Text.RegularExpressions.Regex EngineFile=new System.Text.RegularExpressions.Regex(@"(\.(xp3|ain|ypf|rpa|rgssad|rgss2a|rgss3a|wolf|cpz|iga|int|mpk|cpk|rio|pck|arc|dat\.pck)$)|^(unityplayer\.dll|gameassembly\.dll|scene\.pck|gameexe\.dat|nw\.dll|package\.nw|siglus\w*\.exe)$",System.Text.RegularExpressions.RegexOptions.IgnoreCase);
 internal static string EngineFileNear(string exe){try{string dir=Path.GetDirectoryName(exe??"");if(dir=="")return "";foreach(var f in Directory.GetFiles(dir)){string n=Path.GetFileName(f);if(EngineFile.IsMatch(n))return n;}foreach(var d in Directory.GetDirectories(dir))if(d.EndsWith("_Data",StringComparison.OrdinalIgnoreCase))return Path.GetFileName(d);}catch{}return "";}
 static bool StartedSuspended(uint pid){try{foreach(ProcessThread t in Process.GetProcessById((int)pid).Threads)if(t.ThreadState==System.Diagnostics.ThreadState.Wait&&t.WaitReason==ThreadWaitReason.Suspended)return true;}catch{}return false;}
 static bool GenericHookStart(){string why=Resume!=null?"remembered stream":KnownIsland?"known island":MagesAddress!=0?"MAGES address":(UnityFontDir??"")!=""?"Unity":(RememberedCode??"")!=""?"remembered hook code":"";if(why==""){string f=EngineFileNear(HookTarget.ExePath);if(f!="")why="engine file "+f;}if(why==""&&StartedSuspended(Pid))why="started suspended";if(why!=""){Diagnostic("startup settle not needed ("+why+")");return false;}return true;}
 static void WaitStartupSettled(uint pid){try{var p=Process.GetProcessById((int)pid);double age=(DateTime.Now-p.StartTime).TotalMilliseconds;if(age>=StartupSettleMs)return;var sw=Stopwatch.StartNew();
  string missing="";Diagnostic("startup settle: generic-hook game "+(int)age+" ms old, waiting for graphics module + answering window (at most "+StartupSettleMs+" ms)");
  while(sw.ElapsedMilliseconds+age<StartupSettleMs){if(p.HasExited)return;p.Refresh();IntPtr w=p.MainWindowHandle,r;bool g=HasGraphicsModule(pid);
   missing=w==IntPtr.Zero?"no main window":!g?"no graphics module":IsHungAppWindow(w)?"window hung":SendMessageTimeoutW(w,0,IntPtr.Zero,IntPtr.Zero,2/* SMTO_ABORTIFHUNG */,500,out r)==IntPtr.Zero?"window does not answer":"";
   if(missing==""){Diagnostic("startup settled: waited "+sw.ElapsedMilliseconds+" ms, process "+(int)(age+sw.ElapsedMilliseconds)+" ms old (graphics module loaded, window answers)");return;}Thread.Sleep(150);}
  Diagnostic("startup settle: waited "+sw.ElapsedMilliseconds+" ms, still "+missing+"; injecting as before");}catch(Exception e){Diagnostic("startup settle skipped "+e.Message);}}
 /* 2026-11-20 (#483 fallback while the root cause is an inference): a game that vanishes within QuickVanishMs of being joined,
    with no line read and no exit code seen, twice in a row, runs in the safe mode from then on: no GPU layer, nothing hidden
    or written in the game, MeguLit only reads (and says so). A run that lasts or reads a line clears the count. Kept in the
    game's GPU canary record ("vanish"). */
 /* the hook status has no language of its own: the safe-mode notice is given in all three UI languages */
 internal const string SafeModeMessage="这部游戏前两次刚启动就退出了，为了不影响游戏，已对它关闭「隐藏游戏原文」和 GPU 隐藏层，只读取文字 / このゲームは前回・前々回とも起動直後に終了したため、ゲームへの影響を避けて「原文を隠す」と GPU 非表示レイヤーをオフにし、文字の読み取りだけを行います / This game closed right after starting twice in a row, so to keep it safe MeguLit has turned off hiding the game's text and the GPU hide layer for it and only reads the text";
 const int QuickVanishMs=60000,QuickVanishLimit=2;static DateTime SessionStart=DateTime.MinValue;static volatile bool SafeMode;
 internal static int QuickVanishNext(int count,double ranMs,bool exited,bool readText){if(!exited)return count;return ranMs<QuickVanishMs&&!readText?count+1:0;}
 static void QuickVanishNote(){if(SessionStart==DateTime.MinValue)return;bool exited=false;try{exited=GameProcess!=null&&GameProcess.HasExited;}catch{}string f=GpuCanaryFile();if(f=="")return;var d=GpuCanaryRead(f);object v;int count=d.TryGetValue("vanish",out v)?Convert.ToInt32(v):0;double ran=(DateTime.UtcNow-SessionStart).TotalMilliseconds;int next=QuickVanishNext(count,ran,exited,ReceivedText);if(next==count)return;d["vanish"]=next;GpuCanaryWrite(f,d);if(next>0)Diagnostic("quick vanish "+next+"/"+QuickVanishLimit+": the game ended "+(int)ran+" ms after it was joined, no line read");}
 static void QuickVanishCheck(){string f=GpuCanaryFile();if(f=="")return;object v;var d=GpuCanaryRead(f);if(!(d.TryGetValue("vanish",out v)&&Convert.ToInt32(v)>=QuickVanishLimit))return;SafeMode=true;ReplacementEnabled=false;Diagnostic("safe mode: the game vanished right after start "+v+" times; nothing is hidden or drawn into the game, MeguLit only reads");Status(SafeModeMessage);}
 static readonly string[] Exports={"Luna_Start","Luna_Settings","Luna_SettingsEx","Luna_ConnectProcess","Luna_CheckIfNeedInject","Luna_UseEmbed","Luna_EmbedCallback","Luna_DetachProcess","Luna_QueryThreadHistory"};
 static IntPtr Probe(string root){string dll=Path.Combine(root,Host);if(!File.Exists(dll))throw new Exception("缺少 LunaHost64.dll，请导入官方 LunaTranslator 的 Hook 组件");IntPtr module=LoadLibraryEx(dll,IntPtr.Zero,8);if(module==IntPtr.Zero)throw new Exception("无法加载 LunaHost64.dll（位数、依赖或版本不匹配）");foreach(string name in Exports)if(GetProcAddress(module,name)==IntPtr.Zero){FreeLibrary(module);throw new Exception("LunaHook 接口版本不兼容，缺少 "+name);}_Luna_Start=(DLuna_Start)Marshal.GetDelegateForFunctionPointer(GetProcAddress(module,"Luna_Start"),typeof(DLuna_Start));_Luna_Settings=(DLuna_Settings)Marshal.GetDelegateForFunctionPointer(GetProcAddress(module,"Luna_Settings"),typeof(DLuna_Settings));_Luna_ConnectProcess=(DLuna_ConnectProcess)Marshal.GetDelegateForFunctionPointer(GetProcAddress(module,"Luna_ConnectProcess"),typeof(DLuna_ConnectProcess));_Luna_CheckIfNeedInject=(DLuna_CheckIfNeedInject)Marshal.GetDelegateForFunctionPointer(GetProcAddress(module,"Luna_CheckIfNeedInject"),typeof(DLuna_CheckIfNeedInject));_Luna_DetachProcess=(DLuna_DetachProcess)Marshal.GetDelegateForFunctionPointer(GetProcAddress(module,"Luna_DetachProcess"),typeof(DLuna_DetachProcess));{IntPtr ins=GetProcAddress(module,"Luna_InsertHookCode");if(ins!=IntPtr.Zero)_Luna_InsertHookCode=(DLuna_InsertHookCode)Marshal.GetDelegateForFunctionPointer(ins,typeof(DLuna_InsertHookCode));}_Luna_UseEmbed=(DLuna_UseEmbed)Marshal.GetDelegateForFunctionPointer(GetProcAddress(module,"Luna_UseEmbed"),typeof(DLuna_UseEmbed));_Luna_EmbedCallback=(DLuna_EmbedCallback)Marshal.GetDelegateForFunctionPointer(GetProcAddress(module,"Luna_EmbedCallback"),typeof(DLuna_EmbedCallback));_Luna_SettingsEx=(DLuna_SettingsEx)Marshal.GetDelegateForFunctionPointer(GetProcAddress(module,"Luna_SettingsEx"),typeof(DLuna_SettingsEx));_Luna_QueryThreadHistory=(DLuna_QueryThreadHistory)Marshal.GetDelegateForFunctionPointer(GetProcAddress(module,"Luna_QueryThreadHistory"),typeof(DLuna_QueryThreadHistory));return module;}
 static bool IsSupportedIsland(string[] args){if(args.Length<4||!String.Equals(args[2],"ISLAND",StringComparison.OrdinalIgnoreCase))return false;try{using(var p=Process.GetProcessById(Int32.Parse(args[0])))using(var hash=System.Security.Cryptography.SHA256.Create())using(var stream=File.OpenRead(p.MainModule.FileName))return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","")=="474CC11D875D7BE9DF9581F3A55D64698CCF4E760C44013DF403CCED85E505F1";}catch{return false;}}
 // E216: Siglus engine processes use the Siglus-only build whose scenario search also covers newer Steam builds (register-agnostic compare, longer function).
 /* the MeguLitHook32.dll of this runtime folder contains the marker an adapter logs (ToMeCS2_DRAW, ToMeSG_EMBED); false for any other folder */
 static bool MainRuntimeHas(string root,string marker){try{if(!String.Equals(Path.GetFileName(root),"megulithook",StringComparison.OrdinalIgnoreCase))return false;byte[] dll=File.ReadAllBytes(Path.Combine(root,"MeguLitHook32.dll")),m=System.Text.Encoding.ASCII.GetBytes(marker);for(int i=0;i+m.Length<=dll.Length;i++){int k=0;while(k<m.Length&&dll[i+k]==m[k])k++;if(k==m.Length)return true;}}catch{}return false;}
 /* E252 + 2026-11-19 one hook runtime. Our own full MeguLitHook build (runtime/megulithook) is the runtime of every game, the
    ISLAND and STEINS;GATE adapters included (engines of MeguLitHook32, native/megulithook/MeguLitEngines.h). The dedicated folders
    the base runtime pack still carries (hook, hook-island, hook-mages[-e201], hook-siglus) are used only when MeguLitHook is
    missing or is an older build without that adapter (euphoria HD sits in its Yuris.cpp). Exercised by --runtime-choice-self-test. */
 static string ChooseRuntime(string runtime,bool euphoria,bool island,bool steinsGate,bool siglus){return ChooseRuntime(runtime,euphoria,island,steinsGate,siglus,Environment.GetEnvironmentVariable("MEGULIT_UNIFIED_ADAPTERS")=="1");}
 /* unified: ISLAND, STEINS;GATE and euphoria HD on MeguLitHook too. Their adapters are in MeguLitHook32 but were never run on a
    real game there, so by default they keep their dedicated folders; MEGULIT_UNIFIED_ADAPTERS=1 switches them for that check */
 static string ChooseRuntime(string runtime,bool euphoria,bool island,bool steinsGate,bool siglus,bool unified){
  Func<string,string> at=name=>Path.Combine(runtime,name);
  string root=File.Exists(Path.Combine(at("megulithook"),"MeguLitHook32.dll"))?at("megulithook"):at("hook-readonly");
  if(euphoria&&Directory.Exists(at("hook"))&&(!unified||!MainRuntimeHas(root,"EmbedEuphoria474_DrawHide_TEST2")))root=at("hook");
  if(island&&Directory.Exists(at("hook-island"))&&(!unified||!MainRuntimeHas(root,"ToMeCS2_DRAW")))root=at("hook-island");
  if(steinsGate&&Directory.Exists(at("hook-mages"))&&(!unified||!MainRuntimeHas(root,"ToMeSG_EMBED")))root=Directory.Exists(at("hook-mages-e201"))?at("hook-mages-e201"):at("hook-mages");
  if(siglus&&Path.GetFileName(root)=="hook-readonly"&&File.Exists(Path.Combine(at("hook-siglus"),"MeguLitHook32.dll")))root=at("hook-siglus");
  return root;}
 static int RuntimeChoiceSelfTest(){
  string dir=Path.Combine(Path.GetTempPath(),"megulit-runtime-choice-"+Process.GetCurrentProcess().Id);
  Action<string,string> dll=(name,content)=>{Directory.CreateDirectory(Path.Combine(dir,name));File.WriteAllText(Path.Combine(dir,name,"MeguLitHook32.dll"),content);};
  Func<string,string> leaf=r=>Path.GetFileName(r);var fails=new List<string>();
  Action<string,string,string> expect=(what,got,want)=>{if(got!=want)fails.Add(what+": "+got+" (want "+want+")");};
  try{
   /* new runtime with the adapters, the old pack folders present */
   dll("megulithook","...ToMeCS2_DRAW...ToMeSG_EMBED...EmbedEuphoria474_DrawHide_TEST2...");foreach(var d in new[]{"hook","hook-island","hook-mages","hook-mages-e201","hook-readonly"})Directory.CreateDirectory(Path.Combine(dir,d));dll("hook-siglus","x");
   expect("new, island by default",leaf(ChooseRuntime(dir,false,true,false,false,false)),"hook-island");expect("new, island unified",leaf(ChooseRuntime(dir,false,true,false,false,true)),"megulithook");expect("new, steins;gate by default",leaf(ChooseRuntime(dir,false,false,true,false,false)),"hook-mages-e201");expect("new, steins;gate unified",leaf(ChooseRuntime(dir,false,false,true,false,true)),"megulithook");
   expect("new, siglus",leaf(ChooseRuntime(dir,false,false,false,true,false)),"megulithook");expect("new, other",leaf(ChooseRuntime(dir,false,false,false,false,false)),"megulithook");expect("new, euphoria by default",leaf(ChooseRuntime(dir,true,false,false,false,false)),"hook");expect("new, euphoria unified",leaf(ChooseRuntime(dir,true,false,false,false,true)),"megulithook");
   /* an older MeguLitHook without the adapters: the dedicated folders as before */
   dll("megulithook","older build");
   expect("old, island unified",leaf(ChooseRuntime(dir,false,true,false,false,true)),"hook-island");expect("old, steins;gate unified",leaf(ChooseRuntime(dir,false,false,true,false,true)),"hook-mages-e201");expect("old, other",leaf(ChooseRuntime(dir,false,false,false,false,false)),"megulithook");expect("old, euphoria unified",leaf(ChooseRuntime(dir,true,false,false,false,true)),"hook");
   /* the old pack folders gone (a runtime without them): MeguLitHook for all */
   dll("megulithook","...ToMeCS2_DRAW...ToMeSG_EMBED...EmbedEuphoria474_DrawHide_TEST2...");foreach(var d in new[]{"hook","hook-island","hook-mages","hook-mages-e201","hook-siglus"})Directory.Delete(Path.Combine(dir,d),true);
   expect("no pack, island",leaf(ChooseRuntime(dir,false,true,false,false,false)),"megulithook");expect("no pack, steins;gate",leaf(ChooseRuntime(dir,false,false,true,false,false)),"megulithook");expect("no pack, euphoria",leaf(ChooseRuntime(dir,true,false,false,false,false)),"megulithook");
   /* no MeguLitHook at all: the read-only runtime, Siglus with its own when present */
   Directory.Delete(Path.Combine(dir,"megulithook"),true);dll("hook-siglus","x");
   expect("no megulithook, siglus",leaf(ChooseRuntime(dir,false,false,false,true,false)),"hook-siglus");expect("no megulithook, other",leaf(ChooseRuntime(dir,false,false,false,false,false)),"hook-readonly");
  }finally{try{Directory.Delete(dir,true);}catch{}}
  if(fails.Count>0){Console.WriteLine("FAIL runtime choice: "+String.Join("; ",fails.ToArray()));return 1;}
  Console.WriteLine("PASS runtime choice: ISLAND, STEINS;GATE and euphoria HD keep their folders unless MEGULIT_UNIFIED_ADAPTERS=1 (then MeguLitHook when it carries the adapter); Siglus on MeguLitHook, its folder only without it");return 0;}
 static bool IsSiglusProcess(string[] args){if(args.Length<3)return false;string name=(args[2]??"").ToLowerInvariant();if(name.Contains("siglusengine")||name.StartsWith("siglus~"))return true;try{uint pid;if(!UInt32.TryParse(args[0],out pid))return false;using(var process=Process.GetProcessById((int)pid))return File.Exists(Path.Combine(Path.GetDirectoryName(process.MainModule.FileName),"SiglusEngine.exe"));}catch{return false;}}
 static bool IsSupportedSteinsGate(string[] args){
  if(args.Length!=5||!String.Equals(args[2],"Game",StringComparison.OrdinalIgnoreCase))return false;
  try{uint pid;if(!UInt32.TryParse(args[0],out pid))return false;using(var process=Process.GetProcessById((int)pid)){string file=process.MainModule.FileName;
   using(var hash=System.Security.Cryptography.SHA256.Create())using(var stream=File.OpenRead(file)){bool supported=BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","")=="CBBC5DAB18EDC344D05C01D4D08819FBC0A68A78741956831752986009B69E16";if(supported)MagesAddress=(ulong)(process.MainModule.BaseAddress.ToInt64()+0x4970d);return supported;}}}catch{return false;}
 }
 // E300/E301 page sentence positions. Engine DLLs report each sentence of a full-screen page when its first character is
 // drawn (begin) and at its click wait or clear (end), in game-screen pixels, as ToMe_<ENGINE> lines over a named pipe:
 // KRKR = KiriKiri KAG message layers (MeguLitKrkr32.dll, native\krkrtext), RENPY = Ren'Py NVL pages (MeguLitRenpy32/64.dll
 // + MeguLitRenpy.py, native\renpytext). The engine name becomes hookEngineLine.engine (krkr / renpy).
 static object PageInfo(string s){
  var m=System.Text.RegularExpressions.Regex.Match(s??"",@"^ToMe_(KRKR|RENPY) (begin|end) line=(\d+) same=([01]) nvl=([01]) x0=(-?\d+) y0=(-?\d+) x1=(-?\d+) y1=(-?\d+) size=(\d+) sw=(\d+) sh=(\d+) n=(\d+)(?: color=([0-9a-f]{6}))?(?: paint=([0-9a-fes:,.\-]{1,120}))?(?: text=(.*))?$");
  if(!m.Success)return null;string text=m.Groups[16].Success?m.Groups[16].Value.Replace('\u001f','\n'):"";if(text.Length>4000)text=text.Substring(0,4000);Func<int,long> n=i=>Int64.Parse(m.Groups[i].Value);
  return new{type="hookEngineLine",engine=m.Groups[1].Value.ToLowerInvariant(),phase=m.Groups[2].Value,line=n(3),same=m.Groups[4].Value=="1",nvl=m.Groups[5].Value=="1",x0=n(6),y0=n(7),x1=n(8),y1=n(9),size=n(10),sw=n(11),sh=n(12),count=n(13),color=m.Groups[14].Success?"#"+m.Groups[14].Value:null,paint=m.Groups[15].Success?m.Groups[15].Value:null,text=text,at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()};
 }
 static bool PageSelfTest(){
  var b=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(PageInfo("ToMe_KRKR begin line=7 same=0 nvl=1 x0=120 y0=96 x1=1160 y1=96 size=30 sw=1280 sh=720 n=0")));
  var e=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(PageInfo("ToMe_KRKR end line=7 same=1 nvl=0 x0=-4 y0=96 x1=1100 y1=150 size=30 sw=1280 sh=720 n=41 text=空は青い。\u001f = 二行目")));
  var r=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(PageInfo("ToMe_RENPY end line=3 same=1 nvl=1 x0=120 y0=80 x1=316 y1=118 size=28 sw=1920 sh=1080 n=14 text=春の風が吹いた。\u001f二行目です。")));
  return Convert.ToString(b["type"])=="hookEngineLine"&&Convert.ToString(b["engine"])=="krkr"&&Convert.ToString(b["phase"])=="begin"&&Convert.ToInt64(b["line"])==7&&!Convert.ToBoolean(b["same"])&&Convert.ToBoolean(b["nvl"])&&Convert.ToString(b["text"])==""&&Convert.ToInt64(b["x1"])==1160
   &&Convert.ToString(e["phase"])=="end"&&Convert.ToBoolean(e["same"])&&!Convert.ToBoolean(e["nvl"])&&Convert.ToInt64(e["x0"])==-4&&Convert.ToInt64(e["count"])==41&&Convert.ToString(e["text"])=="空は青い。\n = 二行目"
   &&Convert.ToString(r["engine"])=="renpy"&&Convert.ToInt64(r["sw"])==1920&&Convert.ToInt64(r["y1"])==118&&Convert.ToString(r["text"])=="春の風が吹いた。\n二行目です。"
   &&Convert.ToString(Json.Deserialize<Dictionary<string,object>>(Json.Serialize(PageInfo("ToMe_KRKR end line=8 same=1 nvl=1 x0=1 y0=2 x1=3 y1=4 size=30 sw=1280 sh=720 n=2 color=a0b0ff text=既読")))["color"])=="#a0b0ff"&&Convert.ToString(Json.Deserialize<Dictionary<string,object>>(Json.Serialize(PageInfo("ToMe_KRKR end line=9 same=1 nvl=0 x0=1 y0=2 x1=3 y1=4 size=30 sw=1280 sh=720 n=2 color=ffff00 paint=f:ffff00ff,e:000000ff:2,s:00000080:2:-2 text=既読")))["paint"])=="f:ffff00ff,e:000000ff:2,s:00000080:2:-2"&&PageInfo("ToMe_KRKR status ok layers=4")==null&&PageInfo("ToMe_RENPY status ok")==null&&PageInfo("ToMe_KRKR end line=x")==null&&PageInfo("ToMe_OTHER end line=1 same=0 nvl=1 x0=0 y0=0 x1=0 y1=0 size=9 sw=1 sh=1 n=0")==null;
 }
 // The DLL (or, for Ren'Py, the game's own Python) writes to \.\pipe\<name><pid>; one connection at a time, reconnecting
 // after the game side drops it. tag: KRKR / RENPY, the protocol prefix; status lines only go to the diagnostics log.
 /* 2026-11-12 KiriKiri draws its message text at opacity 0 while this event is set (MeguLitKrkr __megulitKrkrHide, which also
    needs the pipe connected): set while replacement is on, so MeguLit's text is the only text and the engine still lays it out. */
 static System.Threading.EventWaitHandle KrkrHide;
 /* 2026-11-12 while the engine has hidden its text window, a line it draws elsewhere (an opening title) is art text: written back unchanged */
 static volatile bool EngineDialogHidden; static volatile bool KrkrHideBroken;
 /* 2026-11-21 (ファタモルガーナの館: the game drew its lines invisible and MeguLit drew none of some): the reader asks the engine hide to give
    way while it has a hidden line it cannot draw (no boxes, no text); the game draws its own text until then. Never an empty box. */
 static long GiveWayUntil;
 /* Text architecture ③ (docs/text-architecture.md): the same invisible drawing for Ren'Py (MeguLitRenpy.py draws the say Text's
    Render at alpha 0 while Local\MeguLitRenpyHide-<pid> is set). Each engine path is armed in the crash canary
    (TextPathCanary.cs) the first time it hides, and stays off for a game that died right after. */
 static readonly Dictionary<string,System.Threading.EventWaitHandle> EngineHides=new Dictionary<string,System.Threading.EventWaitHandle>();
 static void StartKrkrHide(){StartEngineHide("KRKR");}
 static void StartEngineHide(string tag){string path=tag.ToLowerInvariant();System.Threading.EventWaitHandle hide;lock(EngineHides){if(EngineHides.ContainsKey(tag))return;EngineHides[tag]=null;}
  if(!TextPathCanary.Allowed(path)){Diagnostic(path+" invisible drawing off for this game (crash canary): "+TextPathCanary.Why(path));return;}
  try{hide=new System.Threading.EventWaitHandle(false,System.Threading.EventResetMode.ManualReset,"Local\\MeguLit"+tag.Substring(0,1)+path.Substring(1)+"Hide-"+Pid);}catch(Exception e){Diagnostic(path+" hide event "+e.Message);return;}
  /* The event outlives a bridge that was killed while hiding (the game holds it open): a new bridge starts from "the game draws", or a
     read-only session after a crash left the dialogue invisible with nobody drawing it (live ファタモルガーナの館 2026-11-19). */
  try{hide.Reset();}catch{}
  lock(EngineHides)EngineHides[tag]=hide;if(tag=="KRKR")KrkrHide=hide;
  /* E472 (user: fullscreen ファタモルガーナの館 showed no text at all): the game's text may only be invisible while MeguLit's own
     text is on screen. MeguLit's reading layer has to be a visible window above the game (exclusive fullscreen, a hidden or
     unbound layer, a layer under a fullscreen game all fail); 0.6 s shown before hiding. 2026-11-19 (user: Alt+T switched the game's text box on and off): 1.6 s missing before the game draws
     again, not 0.4 s. This gate infers from the z-order, and the z-order moves whenever the Alt+T menu opens or closes or the keyboard
     goes between MeguLit and the game; handing the text back to the game is the one thing such a moment must never do (an engine
     with a glyph cache keeps the holes). OverlayGate.Track holds the rule, --overlay-gate-self-test checks it. */
  new Thread(()=>{bool last=false,over=false;int ok=0,bad=0;string why="";while(!Quit){string reason;int seen=OverlayGate.Seen(OverlayGate.Check(GameWindow,out reason));bool was=over;over=OverlayGate.Track(over,ref ok,ref bad,seen);if(over)why="";else if(seen==0||was)why=reason;
   bool want=ReplacementEnabled&&!KrkrHideBroken&&over&&DateTime.UtcNow.Ticks>=Interlocked.Read(ref GiveWayUntil);if(!want&&over&&ReplacementEnabled&&!KrkrHideBroken)why="the reader cannot draw a hidden line";if(want!=last){last=want;if(want)Interlocked.Increment(ref EngineHideOn);else Interlocked.Decrement(ref EngineHideOn);if(!want)EnginePassConfirmed=true;if(want)TextPathCanary.Arm(path);try{if(want)hide.Set();else hide.Reset();}catch{}Diagnostic(path+" draws its text "+(want?"invisible (MeguLit draws it)":"itself"+(ReplacementEnabled&&!KrkrHideBroken&&why!=""?" ("+why+")":"")));}if(want)TextPathCanary.Alive(path);Thread.Sleep(200);}try{hide.Reset();}catch{}}){IsBackground=true}.Start();}
 static void PagePipe(string name,string tag){string label=tag.ToLowerInvariant(),status="ToMe_"+tag+" status ";if(tag=="KRKR"||tag=="RENPY")StartEngineHide(tag);new Thread(()=>{while(!Quit){try{using(var pipe=new System.IO.Pipes.NamedPipeServerStream(name+Pid,System.IO.Pipes.PipeDirection.In,1)){pipe.WaitForConnection();Diagnostic(label+" positions connected");using(var reader=new StreamReader(pipe,new System.Text.UTF8Encoding(false))){string line;while((line=reader.ReadLine())!=null){if(line.Length<=28000&&line.StartsWith("ToMe_CHARS ",StringComparison.Ordinal)&&line.IndexOf(" hidden=1 ",StringComparison.Ordinal)>0)EngineHideProof(label);if(line.StartsWith("ToMe_CHARS ",StringComparison.Ordinal)){if(line.Length<=28000)Emit(new{type="hookChars",line=line});continue;}if(line.Length>12000)continue;if(line.StartsWith(status,StringComparison.Ordinal)){string said=line.Substring(status.Length);if(tag=="KRKR")KrkrKagStatus(said);Diagnostic(label+" "+said);continue;}/* what the glyph colour sampler saw for a sentence (native/krkrtext/script.inc): log only */if(line.StartsWith("ToMe_KRKR colorlog ",StringComparison.Ordinal)){Diagnostic(label+" "+line.Substring(10));continue;}/* the game's own read flag at a click wait (KAG getCurrentRead): the sentence on screen is read / new, also when it was written back hidden and nothing is drawn */if(line=="ToMe_KRKR read v=0"||line=="ToMe_KRKR read v=1"||line=="ToMe_RENPY read v=0"||line=="ToMe_RENPY read v=1"){Emit(new{type="hookEngineRead",engine=label,read=line.EndsWith("1",StringComparison.Ordinal)});continue;}var info=PageInfo(line);if(info!=null)Emit(info);else{var dialog=System.Text.RegularExpressions.Regex.Match(line,@"^ToMe_DIALOG engine=(\w+) visible=([01])$");if(dialog.Success){EngineDialogHidden=dialog.Groups[2].Value=="0";Diagnostic(label+" dialog visible="+dialog.Groups[2].Value);Emit(new{type="hookDialog",engine=dialog.Groups[1].Value,visible=dialog.Groups[2].Value=="1"});}else{var font=System.Text.RegularExpressions.Regex.Match(line,@"^ToMe_KRKR font size=(\d+) bold=([01])(?: pfont=(\S{1,80}))? face=(.{1,64})$");if(font.Success){/* a Japanese game on a Chinese system reads its own font name through code page 936: read it back as 932 */string face=font.Groups[4].Value,back=Unmojibake(face);if(back.Length>0&&back!=face&&System.Text.RegularExpressions.Regex.IsMatch(back,"[ぁ-ヿＡ-Ｚ]|ゴシック|明朝"))face=back;Diagnostic(label+" font "+face+" "+font.Groups[1].Value+"px");Emit(new{type="hookFont",engine=label,face=face,size=Int32.Parse(font.Groups[1].Value),bold=font.Groups[2].Value=="1",prerendered=font.Groups[3].Value});}}}}}}}catch(Exception e){Diagnostic(label+" pipe "+e.Message);Thread.Sleep(1000);}}}){IsBackground=true}.Start();}
 static string BoundExe(){string exe="";IntPtr h=OpenProcess(0x1000,false,Pid);if(h==IntPtr.Zero)return "";try{var sb=new System.Text.StringBuilder(32768);int size=sb.Capacity;if(QueryFullProcessImageName(h,0,sb,ref size))exe=sb.ToString();}finally{CloseHandle(h);}return exe;}
 static void PageDll(string dll,string pipe,string tag,string loader,string[] args){string label=tag.ToLowerInvariant();PagePipe(pipe,tag);var start=new ProcessStartInfo(loader,Pid+" "+args[1]+" \""+args[2]+"\" "+args[3]+" \""+dll+"\""){UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true};
  using(var child=Process.Start(start)){if(!child.WaitForExit(12000)){Diagnostic(label+" positions load timed out");return;}Diagnostic(child.ExitCode==0?label+" positions loaded":label+" positions failed: "+child.StandardError.ReadToEnd().Trim());}}
 // Loaded like the scene capture: only into 32-bit games with .xp3 archives next to the program; failures are only logged.
 static void KrkrText(string bit,string loader,string[] args){try{string dll=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"MeguLitKrkr"+bit+".dll");/* E321 (user, 2026-11-10: ライムライト never switched to page layout and nothing said why) *//* 64-bit KiriKiri Z games get MeguLitKrkr64.dll (same source, native/krkrtext/build.cmd). */if(!File.Exists(dll)){Diagnostic("krkr positions unavailable: "+Path.GetFileName(dll)+" missing");return;}string exe=BoundExe();
  if(exe==""||Directory.GetFiles(Path.GetDirectoryName(exe),"*.xp3").Length==0){Diagnostic("krkr positions skipped: no .xp3 next to "+(exe==""?"(unbound)":Path.GetFileName(exe)));return;}PageDll(dll,"MeguLitKrkr-","KRKR",loader,args);}catch(Exception e){Diagnostic("krkr positions skipped: "+e.Message);}}
 // Ren'Py: a game folder with renpy\ and game\ beside the program (Ren'Py 7/8 put the real program there; older
 // builds run lib\windows-*\ python, so the parents are checked too). The DLL needs MeguLitRenpy.py next to it.
 static bool IsRenpyFolder(string exe){try{var dir=new DirectoryInfo(Path.GetDirectoryName(exe));for(int i=0;i<3&&dir!=null;i++,dir=dir.Parent)if(Directory.Exists(Path.Combine(dir.FullName,"renpy"))&&Directory.Exists(Path.Combine(dir.FullName,"game")))return true;}catch{}return false;}
 static void RenpyText(string bit,string loader,string[] args){try{string folder=AppDomain.CurrentDomain.BaseDirectory,dll=Path.Combine(folder,"MeguLitRenpy"+bit+".dll");if(!File.Exists(dll)||!File.Exists(Path.Combine(folder,"MeguLitRenpy.py")))return;string exe=BoundExe();
  if(exe==""||!IsRenpyFolder(exe))return;PageDll(dll,"MeguLitRenpy-","RENPY",loader,args);}catch(Exception e){Diagnostic("renpy positions skipped: "+e.Message);}}
 /* MeguLitFont<bit>.dll (native/fontprobe, user 2026-11-13: 自动读内存来导入游戏字体): loaded into every bound game; reports the
    font that draws the most Japanese characters (GDI, GDI+, DirectWrite) and the private fonts the game loads from memory or files. */
 static void FontProbe(string bit,string loader,string[] args){try{string dll=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"MeguLitFont"+bit+".dll");if(!File.Exists(dll)){Diagnostic("font probe unavailable: "+Path.GetFileName(dll)+" missing");return;}
  new Thread(()=>{while(!Quit){try{using(var pipe=new System.IO.Pipes.NamedPipeServerStream("MeguLitFont-"+Pid,System.IO.Pipes.PipeDirection.In,1)){pipe.WaitForConnection();using(var reader=new StreamReader(pipe,new System.Text.UTF8Encoding(false))){string line;while((line=reader.ReadLine())!=null){var info=FontInfo(line);if(info!=null){Emit(info);BlindSeed(line);}else if(line.StartsWith("ToMe_GLYPHHIDE ",StringComparison.Ordinal))GlyphReport(line.Substring(15));else if(line.StartsWith("ToMe_GLYPHDOT ",StringComparison.Ordinal))GlyphDots(line.Substring(14));else if(line.StartsWith("ToMe_FONT status ",StringComparison.Ordinal))Diagnostic("font probe "+line.Substring(17));}}}}catch(Exception e){Diagnostic("font pipe "+e.Message);Thread.Sleep(1000);}}}){IsBackground=true}.Start();
  GlyphControl();
  var start=new ProcessStartInfo(loader,Pid+" "+args[1]+" \""+args[2]+"\" "+args[3]+" \""+dll+"\""){UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true};using(var child=Process.Start(start)){if(!child.WaitForExit(12000)){Diagnostic("font probe load timed out");return;}Diagnostic(child.ExitCode==0?"font probe loaded":"font probe failed: "+child.StandardError.ReadToEnd().Trim());}}catch(Exception e){Diagnostic("font probe skipped: "+e.Message);}}
 /* Glyph hide (native/fontprobe/GlyphMatch.h, user 2026-11-14: 为什么不能不适配就替换): the generic fallback when the selected
    dialogue stream cannot write back and no engine-specific embed hook exists (the same streams the GDI hide probes,
    GdiProbeable, with replacement on). Every line of that stream is pushed to MeguLitFont<bit>.dll at once, before
    MeguLit gets it, and the DLL leaves the game's own drawing of it out at the GDI glyph/string, GDI+ and Direct2D
    layer. The stream becomes hide-only only after the DLL reports a hidden draw (like the GDI hide); a glyph cache
    report undoes that, stops the pushes and is remembered for this game, so the next launch keeps today's behaviour.
    The dialogue font the DLL learned is remembered per game too and seeds the next launch from the first glyph. */
 static readonly object GlyphGate=new object();static StreamWriter GlyphCtl;static bool GlyphSent,GlyphCached;static string GlyphSeed;static string GlyphFile;
 static void GlyphControl(){try{GlyphFile=MemoryPath();if(GlyphFile!="")GlyphFile=Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(GlyphFile)),"glyph-hide",Path.GetFileName(GlyphFile));if(GlyphFile!=""&&File.Exists(GlyphFile)){var d=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(GlyphFile));object v;bool here=LearnedHere(d,BridgeBuild());if(!here&&(d.ContainsKey("cached")||d.ContainsKey("allFailed")))Diagnostic("glyph hide memory from another build: trying the hide again");if(here&&d.TryGetValue("cached",out v)&&Convert.ToBoolean(v)){GlyphCached=true;Diagnostic("glyph hide off for this game: it reuses rasterised glyphs (learned)");}else if(d.ContainsKey("leak")){/* the engine keeps the glyphs it rasterised: that does not change with the bridge build, and trying again costs the first lines of every update */GlyphPassLeaked=true;GlyphAllFailed=true;Diagnostic("glyph pass-through off for this game: the engine keeps glyphs it has rasterised (learned); lines are written back hidden");}else if(here&&d.TryGetValue("allFailed",out v)){GlyphAllFailedVersion=Convert.ToInt32(v);Diagnostic("glyph pass-through off for this game: its glyphs were not blanked last time (learned, layer version "+GlyphAllFailedVersion+")");}else if(d.TryGetValue("face",out v)){GlyphProven=!d.ContainsKey("from");string face=Convert.ToString(v);int size=Convert.ToInt32(d["size"]);if(face.Length>0&&face.Length<=64&&size>0&&size<1000)GlyphSeed="FONT "+size+" "+face;}}}catch(Exception e){Diagnostic("glyph hide memory "+e.Message);}
  new Thread(()=>{while(!Quit){try{using(var pipe=new System.IO.Pipes.NamedPipeServerStream("MeguLitFontCtl-"+Pid,System.IO.Pipes.PipeDirection.Out,1)){pipe.WaitForConnection();var w=new StreamWriter(pipe,new System.Text.UTF8Encoding(false)){AutoFlush=true,NewLine="\n"};lock(GlyphGate){GlyphCtl=w;GlyphPipe=pipe;GlyphSent=false;w.WriteLine(GlyphModeLine());if(GlyphMarks)w.WriteLine("MARK on");if(GlyphSeed!=null)w.WriteLine(GlyphSeed);}Diagnostic("glyph hide connected"+(GlyphSeed!=null?" ("+GlyphSeed+")":""));while(!Quit){lock(GlyphGate){if(GlyphCtl!=w)break;}Thread.Sleep(500);}}}catch(Exception e){lock(GlyphGate){GlyphCtl=null;}Diagnostic("glyph control "+e.Message);Thread.Sleep(1000);}}}){IsBackground=true}.Start();}
 /* 2026-11-19: the glyph dots line reaches the font DLL before the game draws: wait until the DLL has read the pipe (was a
    fixed Sleep(8) on every line), at most ms */
 static System.IO.Pipes.NamedPipeServerStream GlyphPipe;
 static void GlyphDrain(int ms){System.IO.Pipes.NamedPipeServerStream p;lock(GlyphGate){p=GlyphCtl!=null?GlyphPipe:null;}if(p==null)return;try{System.Threading.Tasks.Task.Run(()=>{try{p.WaitForPipeDrain();}catch{}}).Wait(ms);}catch{}}
 static void GlyphSend(string line){lock(GlyphGate){if(GlyphCtl==null)return;try{GlyphCtl.WriteLine(line);}catch{GlyphCtl=null;}}}
 public static bool ChineseHideSelfTest(){bool chinese=HookTarget.ChineseText,request=ReplacementRequested;try{ReplacementEnabled=true;HookTarget.ChineseText=true;if(ReplacementEnabled||GlyphWanted()||GpuWanted()||HideStreamAllowed(true,true,true)||HideStreamAllowed(false,false,false)||!HideStreamAllowed(false,true,false)||!HideStreamAllowed(true,false,false))return false;GpuArm("test","テストの台詞。");lock(GpuGate){if(GpuSent)return false;}GlyphLine("テストの台詞。");lock(GlyphGate){if(GlyphSent)return false;}HookTarget.ConfirmJapanese("这就是一个纯中文句子。");if(!HookTarget.ChineseText)return false;HookTarget.ConfirmJapanese("設定");if(!HookTarget.ChineseText)return false;HookTarget.SetSourceLanguage("zh!");HookTarget.ConfirmJapanese("これは日本語の台詞です。");if(!HookTarget.ChineseText)return false;HookTarget.SetSourceLanguage("zh");HookTarget.ConfirmJapanese("これは日本語の台詞です。");return ReplacementEnabled;}finally{HookTarget.ChineseText=chinese;ReplacementRequested=request;}}
 static readonly HashSet<string> DialogueHideReady=new HashSet<string>();
 static volatile bool QuoteOpen;
 static bool QuoteState(string text,bool open){string t=text??"";int o=t.LastIndexOfAny(new[]{'「','『'}),c=t.LastIndexOfAny(new[]{'」','』'});return o<0&&c<0?open:o>c;}
 static bool SpokenPiece(string text){return EmbedTextPolicy.ShortSpoken(text)||(QuoteOpen&&EmbedTextPolicy.QuotedPiece(text));}
 static bool LabelStopsEmbed(Candidate c){return !(c!=null&&c.embed&&!c.hideOnly&&!c.gdiProbe);}
 /* #696 review: the twin rules run here, not only as source text */
 public static bool TwinSelfTest(){string line="「でも……」";
  if(!SameLine(line,line)||!SameLine("<color=#6e6e6e>"+line+"</color>",line))return false;
  if(!SameLine("<alpha=#ff>「で<alpha=#00>も……」\n<alpha=#ff>「でも……」\n",line)||!SameLine("「で\n「でも…\n「でも……」",line))return false;
  if(!SameLine("「おい、泣くなよ。\nそういうのはナシだって」","「おい、泣くなよ。そういうのはナシだって」"))return false;
  if(SameLine("「ああ、じゃあ元気で」\n"+line,line)||SameLine(line+"\n「ああ、じゃあ元気で」",line)||SameLine(line+"\n"+line+"x",line))return false;
  lock(Gate){var crowd=new Dictionary<string,DateTime>(TwinCrowdSeen);string was=Selected;var cands=new Dictionary<string,Candidate>(Candidates);var twins=new HashSet<string>(JaTwins);var hits=new Dictionary<string,int>(JaTwinHits);
   try{DateTime t=DateTime.UtcNow;TwinCrowdSeen.Clear();if(TwinCrowd("a",t)!=1||TwinCrowd("b",t)!=2||TwinCrowd("a",t.AddMilliseconds(500))!=2||TwinCrowd("c",t.AddSeconds(1))!=3||TwinCrowd("d",t.AddSeconds(1))!=4)return false;
    TwinCrowdSeen.Clear();if(TwinCrowd("a",t)!=1||TwinCrowd("b",t)!=2||TwinCrowd("c",t.AddSeconds(3))!=1)return false;
    string tmp="EXHMXF2@Unity.TextMeshPro:TMPro:TMP_Text:set_text:1:JIT:UNITY",game="EXHMXF2@Assembly-CSharp:Novel:Say:1:JIT:UNITY";var on=new List<ThreadParam>();
    Candidates.Clear();JaTwins.Clear();JaTwinHits.Clear();Selected="sel";Candidates["sel"]=new Candidate{code=tmp,name="t",embed=true};Candidates["own"]=new Candidate{code=tmp,name="t",embed=true};Candidates["renamed"]=new Candidate{code=tmp,name="u",embed=true};Candidates["other"]=new Candidate{code=game,name="g",embed=true};
    JaTwinHit("own",on);if(!JaTwins.Contains("own"))return false;
    JaTwinHit("renamed",on);JaTwinHit("renamed",on);if(JaTwins.Contains("renamed"))return false;
    JaTwinHit("other",on);if(JaTwins.Contains("other"))return false;JaTwinHit("other",on);if(!JaTwins.Contains("other"))return false;
    /* a JIT:UNITY hook that is no text setter: its own contexts are no twins */
    Candidates["sel"]=new Candidate{code=game,name="g",embed=true};Candidates["own2"]=new Candidate{code=game,name="g",embed=true};JaTwinHit("own2",on);JaTwinHit("own2",on);if(JaTwins.Contains("own2"))return false;
    return true;}
   finally{TwinCrowdSeen.Clear();foreach(var kv in crowd)TwinCrowdSeen[kv.Key]=kv.Value;Selected=was;Candidates.Clear();foreach(var kv in cands)Candidates[kv.Key]=kv.Value;JaTwins.Clear();foreach(var k in twins)JaTwins.Add(k);JaTwinHits.Clear();foreach(var kv in hits)JaTwinHits[kv.Key]=kv.Value;}}}
 /* #696 review: OnEmbedAnswer for Aokana's selected setter S and its two twins (T the second setter, W the typewriter: the same
    hook and name), the answers recorded. A twin the gate does not let through (skip held, 1.6 s late) is left alone and never
    turns on cover mode; in embedded-translation mode the veiled selected line is covered and so are its twins; a line the
    selected stream passed through (a skip burst) leaves its twins alone; a third twin within 2 s (a backlog row, grey) is cover
    mode for this run only and switches the twins off. */
 public static bool TwinAnswerSelfTest(){string tmp="EXHMXF2@Unity.TextMeshPro:TMPro:TMP_Text:set_text:1:JIT:UNITY",game="EXHMXF2@Assembly-CSharp:Novel:Say:1:JIT:UNITY",line="「おい、泣くなよ。そういうのはナシだって」",file=Path.Combine(Path.GetTempPath(),"megulit-twin-answer-"+Guid.NewGuid().ToString("n")+".json"),session=Path.ChangeExtension(file,".session.json");
  var S=new ThreadParam{processId=Pid,addr=0x1000,ctx=1};var T=new ThreadParam{processId=Pid,addr=0x1000,ctx=2};var W=new ThreadParam{processId=Pid,addr=0x1000,ctx=3};var R=new ThreadParam{processId=Pid,addr=0x1000,ctx=4};var Q=new ThreadParam{processId=Pid,addr=0x1000,ctx=5};
  var answers=new Dictionary<string,string>();var off=new List<string>();var calls=new List<string>();var nativeOn=new Dictionary<string,bool>();DLuna_EmbedCallback cb=_Luna_EmbedCallback;DLuna_UseEmbed ue=_Luna_UseEmbed;Action<Action> prevDispatch=EmbedSyncDispatch;
  string was;Dictionary<string,Candidate> cands;HashSet<string> twins;Dictionary<string,int> hits;lock(Gate){was=Selected;cands=new Dictionary<string,Candidate>(Candidates);twins=new HashSet<string>(JaTwins);hits=new Dictionary<string,int>(JaTwinHits);}
  bool conn=Connected,hidden=EngineDialogHidden,en=Enabled,rep=ReplacementEnabled,tr=TranslateMode,skip=SkipHeld,memory=MemorySaved,chinese=HookTarget.ChineseText,callback=ReplacementCallback,received=ReceivedText;DateTime replaceAt=LastReplaceAt;
  Func<string,ThreadParam,string> ask=(text,tp)=>{OnEmbedAnswer(text,tp);lock(answers){string a;return answers.TryGetValue(tp.Key(),out a)?a:null;}};
  Func<bool> cover=()=>{Thread.Sleep(300);FlushEmbedSync();lock(Gate){return !Candidates[S.Key()].embed;}};
  Action reset=()=>{FlushEmbedSync();lock(Gate){Candidates.Clear();foreach(var tp in new[]{S,T,W,R,Q})Candidates[tp.Key()]=new Candidate{tp=tp,code=tmp,name="TMP_Text.set_text",embed=true};Selected=S.Key();JaTwins.Clear();JaTwins.Add(T.Key());JaTwins.Add(W.Key());JaTwinHits.Clear();TwinCrowdSeen.Clear();UnitySiblings.Clear();LastEmbedAt=LastDecidedAt=DateTime.MinValue;LastEmbedText="";LastEmbedCovered=false;JaTwinHiddenAt=DateTime.MinValue;BurstRun=0;SkipHeld=false;TranslateMode=false;EngineDialogHidden=false;ReplacementEnabled=true;MemoAnswers.Clear();MemoState="";}lock(answers){answers.Clear();}lock(off){off.Clear();calls.Clear();nativeOn.Clear();}};
  try{_Luna_EmbedCallback=(tp,text,trans)=>{lock(answers){answers[tp.Key()]=trans;}};_Luna_UseEmbed=(tp,use)=>{lock(off){calls.Add(tp.Key()+(use?"+":"-"));nativeOn[tp.Key()]=use;if(!use)off.Add(tp.Key());}};
   UnsafeFileFor=file;SessionFileFor=session;MemorySaved=true;Connected=true;Enabled=true;ReplacementEnabled=true;HookTarget.ChineseText=false;
   /* the selected line veiled, both twins veiled with it */
   reset();if(String.IsNullOrEmpty(ask(line,S))||String.IsNullOrEmpty(ask(line,T))||String.IsNullOrEmpty(ask(line,W))||cover())return false;
   /* #696 review: the hook keeps every answer 500 ms, so the selected line's redraws ask again. They get the same answer from the memo without the work of a first answer (the skip-burst count stays as it was: a first answer of a line already shown sets it to 0); a twin asking the same line is decided again every time (its JaTwinHiddenAt moves); LeaveGen, the generation or a switch in the state misses */
   reset();{string first=ask(line,S);if(String.IsNullOrEmpty(first))return false;lock(Gate)BurstRun=5;lock(answers)answers.Clear();
    if(ask(line,S)!=first)return false;lock(Gate){if(BurstRun!=5)return false;}
    DateTime twinAt;if(String.IsNullOrEmpty(ask(line,T)))return false;lock(Gate)twinAt=JaTwinHiddenAt;Thread.Sleep(20);if(String.IsNullOrEmpty(ask(line,T)))return false;lock(Gate){if(JaTwinHiddenAt==twinAt)return false;}
    lock(Gate){LeaveGen++;BurstRun=5;}if(ask(line,S)!=first)return false;lock(Gate){if(BurstRun!=0)return false;BurstRun=5;}
    Interlocked.Increment(ref EmbedGen);if(ask(line,S)!=first)return false;lock(Gate){if(BurstRun!=0)return false;}
    EngineDialogHidden=true;if(ask(line,S)!="")return false;EngineDialogHidden=false;}
   /* the memo of an older state is dropped when a line is remembered under a newer one: the first line asked again is decided again */
   reset();{string second="「じゃあ、また明日な。遅れるなよ」";if(String.IsNullOrEmpty(ask(line,S)))return false;lock(Gate)LeaveGen++;Thread.Sleep(300);if(String.IsNullOrEmpty(ask(second,S)))return false;Thread.Sleep(300);lock(Gate)BurstRun=5;ask(line,S);lock(Gate){if(BurstRun!=0)return false;}}
   /* #696 review: the selected stream shows A, then B, then A again from the memo: A is the line on screen again, so a twin
      drawing A is hidden with it (it was left showing the original while the bridge still held B) */
   reset();{string second="「じゃあ、また明日な。遅れるなよ」",first=ask(line,S);if(String.IsNullOrEmpty(first))return false;Thread.Sleep(300);if(String.IsNullOrEmpty(ask(second,S)))return false;Thread.Sleep(300);
    /* B went back unchanged (a skip burst): A shown again is covered again */
    lock(Gate){BurstRun=5;LastEmbedCovered=false;}lock(answers)answers.Clear();if(ask(line,S)!=first)return false;
    lock(Gate){if(BurstRun!=5||LastEmbedText!=line||!LastEmbedCovered)return false;}if(String.IsNullOrEmpty(ask(line,T)))return false;
    /* a new line right after a redraw answered from the memo is not a skip burst: the last line the bridge decided was 300 ms ago (a game redrawing every frame reaches the bridge every 500 ms) */
    lock(Gate)BurstRun=5;if(String.IsNullOrEmpty(ask("「明日は晴れるといいね、本当に」",S)))return false;lock(Gate){if(BurstRun!=0)return false;}}
   /* a foreign twin hidden within the 1.5 s window */
   {string prevTwin=LastTwinText;try{reset();ask(line,S);if(String.IsNullOrEmpty(ask("Good morning, the weather is really nice today.",R)))return false;}finally{LastTwinText=prevTwin;}}
   /* skip held: the twins are left alone, no cover mode */
   reset();SkipHeld=true;ask(line,S);if(ask(line,T)!=""||ask(line,W)!=""||cover())return false;
   /* the text window hidden after the selected line was written back (the engine reports it): the twins are left alone */
   reset();ask(line,S);EngineDialogHidden=true;if(ask(line,T)!=""||ask(line,W)!=""||cover())return false;
   /* embedded translation: the Unity line is veiled (MeguLit draws the translation), so are its twins; no cover mode */
   reset();TranslateMode=true;if(String.IsNullOrEmpty(ask(line,S))||String.IsNullOrEmpty(ask(line,T))||String.IsNullOrEmpty(ask(line,W))||cover())return false;
   /* embedded translation of a line that is not veiled: the translation is still pending, the line not written back yet, so its twins are left alone (the line before was covered) */
   reset();TranslateMode=true;LastEmbedCovered=true;lock(Gate){foreach(var tp in new[]{S,T,W})Candidates[tp.Key()].code=game;}ask(line,S);if(ask(line,T)!=""||ask(line,W)!=""||cover())return false;
   /* 1.6 s after the selected line: left alone, no cover mode */
   reset();ask(line,S);LastEmbedAt=DateTime.UtcNow.AddMilliseconds(-1600);if(ask(line,T)!=""||ask(line,W)!=""||cover())return false;
   /* a skip burst passes the selected line through: its twins are left alone */
   reset();LastEmbedAt=LastDecidedAt=DateTime.UtcNow;LastEmbedText="「前の台詞はここまで、次へ進む」";LastEmbedCovered=true;BurstRun=BurstSkipLines;if(ask(line,S)!=""||ask(line,T)!=""||ask(line,W)!=""||cover())return false;
   /* a backlog row R shows the line, grey, 0.9 s later: a third twin, cover mode for this run, not remembered, every twin switched off and no new one switched on */
   reset();lock(Gate)JaTwins.Add(R.Key());ask(line,S);ask(line,T);ask(line,W);LastEmbedAt=DateTime.UtcNow.AddMilliseconds(-900);if(ask("<color=#6e6e6e>"+line+"</color>",R)!=""||!cover()||File.Exists(file))return false;
   lock(off){if(!off.Contains(S.Key())||!off.Contains(T.Key())||!off.Contains(W.Key())||!off.Contains(R.Key()))return false;}
   lock(Gate){var on=new List<ThreadParam>();JaTwinHit(Q.Key(),on);JaTwinHit(Q.Key(),on);if(on.Count>0||JaTwins.Contains(Q.Key()))return false;}
   /* a fourth twin Q shows the line in the same 2 s, asking after the third put the stream in cover mode: the many-context box of E560, remembered */
   reset();lock(Gate){JaTwins.Add(R.Key());JaTwins.Add(Q.Key());}ask(line,S);ask(line,T);ask(line,W);LastEmbedAt=DateTime.UtcNow.AddMilliseconds(-900);if(ask("<color=#6e6e6e>"+line+"</color>",R)!=""||!cover()||ask(line,Q)!="")return false;
   for(int i=0;i<40&&!File.Exists(file);i++)Thread.Sleep(50);if(!File.Exists(file))return false;Thread.Sleep(100);try{File.Delete(file);}catch{}
   /* a former twin T selected by hand: the old twins and the old selected stream are switched off, T ends switched on, and the line left behind is forgotten, so the old streams still asking before they are switched off are no contexts of the new setter (ManyUnityContexts would remember cover mode) */
   reset();lock(Gate)JaTwins.Add(R.Key());ask(line,S);ask(line,T);Select(T.Key());
   lock(off){if(!off.Contains(S.Key())||!off.Contains(W.Key())||!off.Contains(R.Key())||calls.LastIndexOf(T.Key()+"+")<0||calls.LastIndexOf(T.Key()+"+")<calls.LastIndexOf(T.Key()+"-"))return false;}
   lock(Gate){if(JaTwins.Count>0||LastEmbedText!=""||LastEmbedCovered||UnitySiblings.Count>0||TwinCrowdSeen.Count>0)return false;}
   if(ask(line,W)!=""||ask(line,R)!=""||ask(line,S)!="")return false;Thread.Sleep(300);lock(Gate){if(!Candidates[T.Key()].embed)return false;}if(File.Exists(file))return false;
   /* with replacement off a former twin selected by hand ends switched off: the selected stream writes nothing back */
   reset();ReplacementEnabled=false;Select(T.Key());lock(off){if(calls.LastIndexOf(T.Key()+"-")<0||calls.LastIndexOf(T.Key()+"-")<calls.LastIndexOf(T.Key()+"+")||!off.Contains(W.Key()))return false;}ReplacementEnabled=true;
   /* control: a remembered reason is written to the file */
   reset();MarkUnsafe("self-test");for(int i=0;i<40&&!File.Exists(file);i++)Thread.Sleep(50);if(!File.Exists(file))return false;
   /* in cover mode a twin showing the line is left alone */
   LastEmbedAt=DateTime.UtcNow;LastEmbedText=line;LastEmbedCovered=true;if(ask(line,T)!="")return false;
   /* #696 review: queued MarkUnsafe bound to trigger selection: A queues -> switch to B -> queued task runs -> B stays embeddable */
   {var queued=new List<Action>();Action<Action> prevQueue=QueueUnsafeWork;
    try{QueueUnsafeWork=a=>queued.Add(a);
     reset();lock(Gate)JaTwins.Add(R.Key());ask(line,S);ask(line,T);ask(line,W);LastEmbedAt=DateTime.UtcNow.AddMilliseconds(-900);
     if(ask("<color=#6e6e6e>"+line+"</color>",R)!=""||queued.Count!=1)return false;
     Select(Q.Key());
     lock(off){off.Clear();calls.Clear();}
     foreach(var work in queued)work();
     Thread.Sleep(100);
     lock(Gate){if(Selected!=Q.Key()||!Candidates[Q.Key()].embed||!Candidates[S.Key()].embed)return false;}
     lock(off){if(off.Contains(Q.Key()))return false;}
     /* A queues -> switch to B -> switch back to A -> stale task runs -> A stays embeddable */
     queued.Clear();reset();lock(Gate)JaTwins.Add(R.Key());ask(line,S);ask(line,T);ask(line,W);LastEmbedAt=DateTime.UtcNow.AddMilliseconds(-900);
     if(ask("<color=#6e6e6e>"+line+"</color>",R)!=""||queued.Count!=1)return false;
     Select(Q.Key());Select(S.Key());
     lock(off){off.Clear();calls.Clear();}
     foreach(var work in queued)work();
     Thread.Sleep(100);
     lock(Gate){if(Selected!=S.Key()||!Candidates[S.Key()].embed)return false;}
     lock(off){if(off.Contains(S.Key()))return false;}
     /* control: when the selection stays on A, the queued task still switches A to cover mode */
     queued.Clear();reset();lock(Gate)JaTwins.Add(R.Key());ask(line,S);ask(line,T);ask(line,W);LastEmbedAt=DateTime.UtcNow.AddMilliseconds(-900);
     if(ask("<color=#6e6e6e>"+line+"</color>",R)!=""||queued.Count!=1)return false;
     foreach(var work in queued)work();
     bool sOff=false;for(int i=0;i<20&&!sOff;i++){lock(off)sOff=off.Contains(S.Key());if(!sOff)Thread.Sleep(25);}
     lock(Gate){if(Candidates[S.Key()].embed||!sOff)return false;}}
    finally{QueueUnsafeWork=prevQueue;}}
   /* #696 review: FinishEmbed bound to trigger selection and generation: A->B->A while waiting answers nothing (A's wait ended when A was switched off) and does not attribute status/memory to the newer selection; unchanged selection still records */
   reset();TranslateMode=true;lock(Gate){Candidates[S.Key()].code=game;}OnEmbedAnswer(line,S);
   {long pid1=EmbedSerial;Select(Q.Key());Select(S.Key());
    lock(Gate){LastReplaceAt=DateTime.MinValue;ReplacementCallback=false;ReceivedText=false;MemorySaved=false;}
    FinishEmbed(pid1,"测试译文");
    lock(answers){if(answers.ContainsKey(S.Key()))return false;}
    lock(Gate){if(LastReplaceAt!=DateTime.MinValue||ReplacementCallback||ReceivedText||MemorySaved)return false;}}
   /* #696 review: A asks for a line -> the selection moves to B, which asks for the same line -> A's answer comes first: nothing is answered (LunaHost would wake B's wait with A's answer), B's own answer goes to B */
   reset();TranslateMode=true;lock(Gate){Candidates[S.Key()].code=game;Candidates[Q.Key()].code=game;}OnEmbedAnswer(line,S);
   {long pidA=EmbedSerial;Select(Q.Key());OnEmbedAnswer(line,Q);long pidB=EmbedSerial;if(pidB==pidA)return false;
    FinishEmbed(pidA,"甲的译文");
    lock(answers){if(answers.Count!=0)return false;}
    FinishEmbed(pidB,"乙的译文");
    lock(answers){if(answers.Count!=1||!answers.ContainsKey(Q.Key())||answers[Q.Key()]!="乙的译文")return false;}}
   /* #696 review: reselecting the stream that asks (sourceLanguage, the same id from the UI) leaves its native wait on: its answer still goes back and is credited */
   reset();TranslateMode=true;lock(Gate){Candidates[S.Key()].code=game;}OnEmbedAnswer(line,S);
   {long pidS=EmbedSerial;Select(S.Key());
    lock(Gate){LastReplaceAt=DateTime.MinValue;ReplacementCallback=false;}
    FinishEmbed(pidS,"测试译文");
    lock(answers){if(!answers.ContainsKey(S.Key())||answers[S.Key()]!="测试译文")return false;}
    lock(Gate){if(LastReplaceAt==DateTime.MinValue||!ReplacementCallback)return false;}}
   /* #696 review: while the selected line is answered later (embedded translation, no Unity veil), its Japanese twins stay off, so no other stream waits for that line; with the Unity veil (answered at once) they stay on */
   reset();TranslateMode=true;lock(Gate){Candidates[S.Key()].code=game;ThreadParam tw;if(WantEmbed(T.Key(),out tw)||!WantEmbed(S.Key(),out tw))return false;Candidates[S.Key()].code=tmp;if(!WantEmbed(T.Key(),out tw))return false;}
   TranslateMode=false;lock(Gate){Candidates[S.Key()].code=game;ThreadParam tw;if(!WantEmbed(T.Key(),out tw))return false;}
   reset();TranslateMode=true;lock(Gate){Candidates[S.Key()].code=game;}OnEmbedAnswer(line,S);
   {long pid2=EmbedSerial;
    lock(Gate){LastReplaceAt=DateTime.MinValue;ReplacementCallback=false;ReceivedText=false;MemorySaved=false;}
    FinishEmbed(pid2,"测试译文");
    lock(answers){if(!answers.ContainsKey(S.Key())||answers[S.Key()]!="测试译文")return false;}
    lock(Gate){if(LastReplaceAt==DateTime.MinValue||!ReplacementCallback||!ReceivedText||!MemorySaved)return false;}
    /* #696 review: the translated line asked again (the hook kept it 500 ms) gets the same translation back, and no second translation request */
    lock(answers)answers.Clear();long serial=EmbedSerial;if(ask(line,S)!="测试译文"||EmbedSerial!=serial)return false;}
   /* #696 review: a translation that comes back after a switch changed is answered for that ask but not remembered: the line asked again under the new state is decided again (here the text window hidden: unchanged) */
   reset();TranslateMode=true;lock(Gate){Candidates[S.Key()].code=game;}OnEmbedAnswer(line,S);
   {long pid3=EmbedSerial;EngineDialogHidden=true;FinishEmbed(pid3,"测试译文");lock(answers){if(!answers.ContainsKey(S.Key())||answers[S.Key()]!="测试译文")return false;answers.Clear();}
    if(ask(line,S)!="")return false;EngineDialogHidden=false;}
   /* #696 review: ordered native UseEmbed reconciler regressions */
   {var syncWork=new List<Action>();
    try{
     /* 1. A (S) marked unsafe -> user selects A's twin B (T) -> A's deferred native disable runs -> native B stays ON and matches bridge */
     reset();lock(Gate)JaTwins.Add(R.Key());
     EmbedSyncDispatch=a=>{lock(syncWork)syncWork.Add(a);};
     MarkUnsafe("japanese-twin-crowd",false);
     if(syncWork.Count!=1)return false;
     Select(T.Key());
     var toRun=new List<Action>(syncWork);syncWork.Clear();
     foreach(var w in toRun)w();
     EmbedSyncDispatch=null;FlushEmbedSync();
     lock(off){if(!nativeOn.ContainsKey(T.Key())||!nativeOn[T.Key()]||nativeOn[S.Key()]||nativeOn[W.Key()]||nativeOn[R.Key()]||off.Contains(T.Key()))return false;}
     /* 2. rapid off->on and on->off dirty marks on the same stream coalesce and converge to current bridge state */
     reset();EmbedSyncDispatch=a=>{lock(syncWork)syncWork.Add(a);};
     lock(Gate){ReplacementEnabled=false;MarkEmbedDirty(S.Key());ReplacementEnabled=true;MarkEmbedDirty(S.Key());}
     ScheduleEmbedSync();
     if(syncWork.Count!=1)return false;
     syncWork[0]();syncWork.Clear();
     lock(off){if(calls.Count!=1||calls[0]!=S.Key()+"+"||!nativeOn[S.Key()])return false;calls.Clear();}
     lock(Gate){ReplacementEnabled=true;MarkEmbedDirty(S.Key());ReplacementEnabled=false;MarkEmbedDirty(S.Key());}
     ScheduleEmbedSync();
     if(syncWork.Count!=1)return false;
     syncWork[0]();syncWork.Clear();
     lock(off){if(calls.Count!=1||calls[0]!=S.Key()+"-"||nativeOn[S.Key()])return false;}
     /* 3. twin enable (JaTwinHit) -> cover mode disable -> leave selected / switch stream -> Deactivate -> re-enable retained Select restores twin */
     EmbedSyncDispatch=null;reset();lock(Gate){JaTwins.Clear();}
     {var on=new List<ThreadParam>();lock(Gate){JaTwinHit(T.Key(),on);}FlushEmbedSync();}
     lock(off){if(!nativeOn.ContainsKey(T.Key())||!nativeOn[T.Key()])return false;}
     Deactivate("self-test");
     lock(off){if(nativeOn[S.Key()]||nativeOn[T.Key()])return false;}
     ReplacementEnabled=true;Select(S.Key());
     lock(off){if(!nativeOn[S.Key()]||!nativeOn[T.Key()])return false;}
     MarkUnsafe("japanese-twin-crowd",false);FlushEmbedSync();
     lock(off){if(nativeOn[S.Key()]||nativeOn[T.Key()])return false;}
     Select(Q.Key());
     lock(off){if(!nativeOn[Q.Key()])return false;}
     /* 4. calling Select while holding outer Gate never calls native UseEmbed under Gate and never deadlocks */
     bool calledUnderGate=false;
     DLuna_UseEmbed prevNative=_Luna_UseEmbed;
     _Luna_UseEmbed=(tp,use)=>{if(Monitor.IsEntered(Gate))calledUnderGate=true;prevNative(tp,use);};
     try{lock(Gate){Select(T.Key());}FlushEmbedSync();}
     finally{_Luna_UseEmbed=prevNative;}
     lock(off){if(calledUnderGate||!nativeOn[T.Key()]||nativeOn[Q.Key()])return false;}
     Deactivate("self-test");
     lock(off){if(nativeOn[T.Key()])return false;}}
    finally{EmbedSyncDispatch=prevDispatch;FlushEmbedSync();}}
   return true;}
  finally{EmbedSyncDispatch=prevDispatch;FlushEmbedSync();Thread.Sleep(200);lock(Gate){MemoAnswers.Clear();MemoState="";}_Luna_EmbedCallback=cb;_Luna_UseEmbed=ue;UnsafeFileFor=null;SessionFileFor=null;MemorySaved=memory;Connected=conn;EngineDialogHidden=hidden;Enabled=en;ReplacementEnabled=rep;TranslateMode=tr;SkipHeld=skip;HookTarget.ChineseText=chinese;ReplacementCallback=callback;ReceivedText=received;LastReplaceAt=replaceAt;
   lock(Gate){Selected=was;Candidates.Clear();foreach(var kv in cands)Candidates[kv.Key]=kv.Value;JaTwins.Clear();foreach(var k in twins)JaTwins.Add(k);JaTwinHits.Clear();foreach(var kv in hits)JaTwinHits[kv.Key]=kv.Value;TwinCrowdSeen.Clear();UnitySiblings.Clear();LastEmbedAt=LastDecidedAt=DateTime.MinValue;LastEmbedText="";LastEmbedCovered=false;BurstRun=0;foreach(var p in PendingEmbeds.Values)if(p.timer!=null)p.timer.Dispose();PendingEmbeds.Clear();}
   lock(UnsafeMemoGate)UnsafeMemo=null;try{File.Delete(file);}catch{}try{File.Delete(session);}catch{}}}
 public static bool LabelEmbedSelfTest(){return !LabelStopsEmbed(new Candidate{embed=true})&&LabelStopsEmbed(new Candidate{embed=true,gdiProbe=true})&&LabelStopsEmbed(new Candidate{embed=true,hideOnly=true})&&LabelStopsEmbed(new Candidate{embed=false})&&LabelStopsEmbed(null)&&EmbedTextPolicy.HideSpoken("たばこと")=="　　　　"&&EmbedTextPolicy.HideSpoken("屋上と")=="　　　"&&QuoteState("「やっぱり……いい女には、",false)&&QuoteState("屋上と",true)&&!QuoteState("ヒラヒラ服だわね……」",true)&&!QuoteState("　地の文。",false)&&EmbedTextPolicy.QuotedPiece("屋上と")&&!EmbedTextPolicy.QuotedPiece("■自動車（車内")&&!EmbedTextPolicy.QuotedPiece("bgm01")&&EmbedTextPolicy.Hide("たばこと")==""&&EmbedTextPolicy.Hide("ロード")=="";}
 static bool HideStreamAllowed(bool writable,bool dialogue,bool chinese){return !chinese&&(writable||dialogue);}
 public static bool ShortHideSelfTest(){string saved=Selected,key="self-test-dialogue";bool existed=DialogueHideReady.Contains(key);try{Selected=key;DialogueHideReady.Remove(key);if(HideDialogueLine("はい"))return false;DialogueHideReady.Add(key);if(!(HideDialogueLine("はい")&&HideDialogueLine("「はい」")&&HideDialogueLine("……")&&!HideDialogueLine("ロード")&&!HideDialogueLine("最初から")))return false;/* a line the game writes as noise (沙耶の唄, recorded): hidden once the stream has spoken two readable lines, as the front end draws it; labels stay */int run=SelectedReadableRun;try{string noise="『ナニﾖｸC。凬5ﾕーとシタコトナﾁw蚪/1ノガソンwP1麓ﾃ思議？』";SelectedReadableRun=2;if(!HideDialogueLine(noise)||HideDialogueLine("ロード")||HideDialogueLine("最初から")||HideDialogueLine("bgm01.ogg"))return false;SelectedReadableRun=0;if(HideDialogueLine(noise)!=IsDialogueText(noise))return false;DialogueHideReady.Remove(key);SelectedReadableRun=2;if(HideDialogueLine(noise)!=IsDialogueText(noise))return false;return true;}finally{SelectedReadableRun=run;}}finally{Selected=saved;if(!existed)DialogueHideReady.Remove(key);}}
 /* 2026-11-19 (user, 沙耶の唄 1.4.17: "换页后的第一句偶发不替换"; log 13:18:51Z: 『ナニﾖｸC。凬5ﾕーとシタコトナ…』, gpu page armed=0, own=2..36).
    The game writes some lines as noise on purpose. The front end takes such a line of a stream that has spoken readable Japanese as the
    script's text and draws it (core/hook-native.cjs "script noise line kept"); this side asked EmbedTextPolicy.Hide, which sees a
    resource string in some of them and says no, and the layers stood down for that line: the game's copy stayed and MeguLit drew a
    second one. One rule for both sides: on a selected stream that has been hidden before and has had two readable lines, a line of
    dialogue length with kana (DialogueLike) is a line, whatever else is in it. Short labels (ロード, 最初から) are not. */
 static bool ProvenStreamLine(string text){return SelectedReadableRun>=2&&DialogueLike(text);}
 static bool HideDialogueLine(string text){if(IsDialogueText(text))return true;lock(Gate){return Selected!=""&&DialogueHideReady.Contains(Selected)&&(System.Text.RegularExpressions.Regex.IsMatch(text??"", "^[ぁ-ゖー～っ…‥。！？!?、　 \t]+$")||ProvenStreamLine(text));}}
 /* 2026-11-19 (user, 素晴らしき日々 again: the original kept showing in pieces and some lines jumped to the top of the window). After the
    pass-through was taken back every line was still handed to the font layer (GlyphLine on each source): log "glyph hide line seq=5 ...
    placed=0 requested=2", "seq=7 placed=1 requested=1". It went on serving blank glyphs into the engine's cache and reporting places of
    one or two characters, which the reader took for the line's place. A writable stream whose glyphs leak is written back hidden and
    has nothing for the font layer to do. */
 static bool GlyphLeakStandDown(Candidate c){return GlyphPassLeaked&&c!=null&&c.embed&&!c.hideOnly;}
 static bool GlyphWanted(){lock(Gate){Candidate c;return !GpuSact2Ready&&!HookTarget.ChineseText&&!GlyphCached&&Enabled&&(ReplacementEnabled||ProbeWanted)&&Selected!=""&&Candidates.TryGetValue(Selected,out c)&&(c.gdiProbe||GlyphAll||RememberedHide(c));}}
 static bool GlyphLeakDown(){lock(Gate){Candidate c;return Selected!=""&&Candidates.TryGetValue(Selected,out c)&&GlyphLeakStandDown(c);}}
 /* 2026-11-15 (user, 沙耶の唄: 「保存了设置的游戏从开游戏开始就绑定，第一句就替换」): a stream the front end selects with replacement on that cannot
    write back (a hide-only stream remembered from an earlier run) is hidden by the glyph / GPU layers from its first line; the probe is not
    needed again, and switching it off no longer leaves the original on screen. */
 static bool RememberedHide(Candidate c){return ReplacementEnabled&&c!=null&&!c.embed&&GdiProbeable(c);}
 /* Called with every line of the selected stream; line breaks do not matter to the DLL (it ignores blanks). */
 /* A read-only stream's text reaches the bridge only after LunaHook's flush delay (180 ms of quiet), i.e. after the game
    rasterised the line (AdvHD), so it could never be matched glyph by glyph. While glyph placement covers every stream
    (GlyphAll) and the selected stream cannot write back, the delay is cut to 30 ms (enough for a line hooked in one go;
    an engine that hooks one character per typewriter step would split, so it is only for that case). Back to 180
    otherwise. Embed hooks that set their own delay (0) are not touched. */
 /* Streams with whole-line callbacks can place glyphs at 30 ms. A run of regularly spaced single
    Japanese characters indicates that the native host is flushing between typewriter steps. */
 sealed class TypewriterCadence {
  int count, minGap, maxGap;
  long last;
  public void Reset(){count=0;}
  public bool Observe(string text,long now){
   text=text.Trim();
   if(text.Length!=1 || !Regex.IsMatch(text,@"^[ぁ-ヿ㐀-鿿｡-ﾟ、。！？「」…]$")){Reset();return false;}
   long gap=now-last;
   last=now;
   if(count==0||gap<45||gap>160){count=1;minGap=160;maxGap=45;return false;}
   minGap=Math.Min(minGap,(int)gap);
   maxGap=Math.Max(maxGap,(int)gap);
   if(maxGap-minGap>45){count=2;minGap=maxGap=(int)gap;return false;}
   return ++count>=4;
  }
 }
 static readonly HashSet<string> ReaderTypewriters=new HashSet<string>(StringComparer.Ordinal);
 static string ReaderTypewriterFile="";
 static string ReaderStreamKey(Candidate c){
  return String.IsNullOrEmpty(c.code)?"":c.code+"|"+c.tp.ctx.ToString("x")+"|"+c.tp.ctx2.ToString("x");
 }
 static void LoadReaderTypewriters(string memoryPath){
  ReaderTypewriterFile=Path.ChangeExtension(memoryPath,".reader-timing.json");
  try{
   if(!File.Exists(ReaderTypewriterFile)||new FileInfo(ReaderTypewriterFile).Length>65536)return;
   foreach(string key in Json.Deserialize<string[]>(File.ReadAllText(ReaderTypewriterFile))){
    if(!String.IsNullOrEmpty(key)&&key.Length<=512&&ReaderTypewriters.Count<64)ReaderTypewriters.Add(key);
   }
  }catch{}
 }
 static int ReaderFlushDelay(Candidate selected,bool glyphAll,bool gpuPage){
  return selected!=null&&(glyphAll||gpuPage)&&(!selected.embed||gpuPage)&&
    !LittlecheeseDialogue(selected)&&!ReaderTypewriters.Contains(ReaderStreamKey(selected))?30:180;
 }
 static void ObserveReaderCadence(ThreadParam tp,string text){
  lock(Gate){
   Candidate c;
   if(!Enabled||tp.Key()!=Selected||!Candidates.TryGetValue(Selected,out c))return;
   if(SkipHeld||FlushMs!=30||ReaderFlushDelay(c,GlyphAll,GpuPageOn)!=30){c.cadence.Reset();return;}
   string key=ReaderStreamKey(c);
   if(key.Length==0||!c.cadence.Observe(text,(long)GetTickCount64()))return;
   ReaderTypewriters.Add(key);
   Diagnostic("hook typewriter cadence learned "+Selected+" "+c.name);
   FlushFit();
   if(ReaderTypewriterFile!=""&&key.Length<=512&&ReaderTypewriters.Count<=64){
    string[] keys=new string[ReaderTypewriters.Count];
    ReaderTypewriters.CopyTo(keys);
    DiskLater(()=>{try{File.WriteAllText(ReaderTypewriterFile,Json.Serialize(keys));}catch{}});
   }
  }
 }
 static bool ReaderFlushSelfTest(){
  var unknown=new Candidate{name="unknown renderer",code="HAX-8@123:test.exe",tp=new ThreadParam{ctx=1}};
  var otherContext=new Candidate{name=unknown.name,code=unknown.code,tp=new ThreadParam{ctx=2}};
  var wholeLine=new Candidate{name="AdvHD",code="HSA@456:test.exe"};
  var hinted=new Candidate{name="littlecheese",code="HAX-8@1DA3C:test.exe",tp=new ThreadParam{ctx=0x31221}};
  var ruf=new Candidate{name="Ruf",code="HA-C@17C78:test.exe",tp=new ThreadParam{ctx=0x1db20}};
  var otherRuf=new Candidate{name="Ruf",code="HA-C@abc:test.exe"};
  if(ReaderFlushDelay(unknown,true,false)!=30||ReaderFlushDelay(hinted,true,false)!=180||ReaderFlushDelay(ruf,true,false)!=180||ReaderFlushDelay(otherRuf,true,false)!=30)return false;
  long tick=100;
  foreach(string line in new[]{"さ","き","今はまだこのままで。","と","か","話したい。"}){
   if(wholeLine.cadence.Observe(line,tick)||ReaderFlushDelay(wholeLine,true,false)!=30)return false;
   tick+=94;
  }
  var cadence=unknown.cadence;
  if(cadence.Observe("社",100)||cadence.Observe("会",130)||cadence.Observe("待",330)||
     cadence.Observe("長い行",422)||cadence.Observe("社",516)||cadence.Observe("会",610)||
     cadence.Observe("か",706))return false;
  if(!cadence.Observe("ら",798))return false;
  ReaderTypewriters.Add(ReaderStreamKey(unknown));
  try{
   return ReaderFlushDelay(unknown,true,false)==180&&ReaderFlushDelay(unknown,false,true)==180&&
    ReaderFlushDelay(otherContext,true,false)==30&&ReaderFlushDelay(wholeLine,false,true)==30&&
    ReaderFlushDelay(new Candidate{embed=true},true,false)==180&&ReaderFlushDelay(null,true,true)==180;
  }finally{ReaderTypewriters.Clear();}
 }
 static int FlushMs=180;
 static void FlushFit(){
  lock(Gate){
   Candidate c=null;
   if(Selected!="")Candidates.TryGetValue(Selected,out c);
   int want=ReaderFlushDelay(c,GlyphAll,GpuPageOn);
   if(want==FlushMs)return;
   try{
    Luna_Settings(want,932,4000,4000,false);
    FlushMs=want;
    Diagnostic("hook flush delay "+want+" ms"+(want==30?" (read-only stream under glyph placement)":""));
   }catch{}
  }
 }
 /* lines of the selected stream: unreadable in a row / readable since selection (a readable stream's noise lines are the game's own text) */static int SelectedUnreadableRun,SelectedReadableRun;
 /* 2026-11-15 (user: holding Ctrl to fast-forward "works once per launch"). While the skip key is held the game runs through
    its lines; the hide layers (glyph font, layer 4) left every one of them out and the reader is hidden for the skip, so
    nothing moved on screen and the fast-forward looked dead. The key is only read, never taken from the game. Held: the
    layers stand down at once and stay down (the game shows its own fast-forward); released: the next line arms them again.
    Write-back streams already pass a skip through (E422). */
 static int SkipStandDowns;
 public static void SetSkipHeld(bool held){bool was=SkipHeld;SkipHeld=held;if(held!=was)SyncGpuRenderers();if(held&&!was){SkipStandDowns++;Diagnostic("skip key held: hide layers stand down, the game shows its own fast-forward");GlyphOff();}else if(!held&&was)Diagnostic("skip key released: the next line arms the hide layers again");}
 /// <summary>HookBridge --self-test: press, release, press ... three times; armed layers go down on every press and no line arms them while held.</summary>
 public static bool SkipSelfTest(){bool keepSkip=SkipHeld;int keepDowns=SkipStandDowns;try{SkipHeld=false;
   for(int i=1;i<=3;i++){lock(GpuGate){GpuSent=true;}lock(GlyphGate){GlyphSent=true;} /* a line is hidden */
    SetSkipHeld(true);bool gpu,glyph;lock(GpuGate){gpu=GpuSent;}lock(GlyphGate){glyph=GlyphSent;}
    if(!SkipHeld||gpu||glyph||SkipStandDowns!=keepDowns+i)return false; /* press i: both layers down */
    SetSkipHeld(true);if(SkipStandDowns!=keepDowns+i)return false; /* the key repeating is not a new press */
    lock(GpuGate){GpuSent=true;}lock(GlyphGate){GlyphSent=true;}GlyphLine("\u30c6\u30b9\u30c8\u306e\u53f0\u8a5e\u3002");lock(GpuGate){gpu=GpuSent;}lock(GlyphGate){glyph=GlyphSent;}
    if(gpu||glyph)return false; /* a line that arrives while the key is held arms nothing */
    SetSkipHeld(false);if(SkipHeld)return false;}
   return true;}catch{return false;}finally{SkipHeld=keepSkip;SkipStandDowns=keepDowns;lock(GpuGate){GpuSent=false;}lock(GlyphGate){GlyphSent=false;}}}
 /* 2026-11-15 (user group, 1.4.9: 時計仕掛けのレイライン and others, "原文隐藏不了…翻译文本有时消失", ".48 都是完美隐藏的"; log: the selected Pal
    stream was writable, yet no "guarded replace" line and no glyph hit: "all" passed every line back unchanged and waited for the font
    layer to blank the glyphs, but SoftPal rasterises its text itself, so nothing hid the original). Pass-through needs proof that a
    layer hides the line: the GPU layer is wanted, or the font layer has blanked / reported glyphs of this game (now, or remembered).
    Without proof the line is written back hidden as before 1.4.9. A game that draws through GDI (font probe) gets one trial line; no
    glyph report by the next line = not blankable, remembered per game for this layer version. */
 static volatile bool GlyphProven,GdiFontSeen,GlyphAllFailed;static int GlyphVersion,GlyphAllFailedVersion=-1;static DateTime GlyphTrialAt;static string GlyphTrialText;static bool GlyphAllNoted;
 /* 2026-11-19 (user, 素晴らしき日々 / BGI 1.647: "点了校准之后字就不替换了", black text after calibrating). Its EmbedBGI stream is writable
    and was written back hidden (guarded replace, nothing Japanese on screen). The first calibration showed the original, the font
    layer saw GDI glyphs for the first time, one trial line brought a "hit" and every later line was passed to the game unchanged
    (pass-through proven). BGI keeps the glyphs it rasterised: the lines' own reports said so at once (repeat=2 missing=2, later
    "cache seq=15 missing=3 of 3"), kana and common kanji stayed on screen, some of them as the black outline pass alone, and the
    calibration then measured that leftover as the game's text colour. A hit says the layer reached a glyph, not that the line is
    gone. The proof is now taken back by what the layer itself reports: a cache report, or a line with glyphs it could not blank.
    Lines of a writable stream go back to write-back hidden, which worked; the verdict is remembered for the game like a failed trial. */
 static volatile bool GlyphPassLeaked;static int GlyphLeakLines;
 static void GlyphPassLeak(string why){if(GlyphPassLeaked)return;GlyphPassLeaked=true;GlyphProven=false;GlyphAllFailed=true;GlyphAllNoted=false;
  GlyphSave(new Dictionary<string,object>{{"allFailed",GlyphVersion},{"bridge",BridgeBuild()},{"leak",why},{"at",DateTime.UtcNow.ToString("o")}});GlyphAllNote("the engine keeps glyphs it has rasterised ("+why+"), the font layer cannot blank them");
  /* said once: the verdict is remembered for the game, so the next run starts written back and never gets here */
  Status("这款游戏首次适配时前几句可能显示不全：开个新存档推进几句，再回标题重新开始即可");GlyphFontOff();}
 static void GlyphLineReport(string s){var m=System.Text.RegularExpressions.Regex.Match(s,@"^line seq=\d{1,9} chars=\d{1,6} placed=\d{1,6} hidden=\d{1,6} requested=\d{1,6} repeat=\d{1,6} missing=(\d{1,6})$");if(!m.Success)return;
  if(m.Groups[1].Value=="0")return;/* one such line is enough: every further passed line puts more blank glyphs into the engine's cache, and those stay until the game is restarted */Interlocked.Increment(ref GlyphLeakLines);GlyphPassLeak("a line with glyphs that were not blanked ("+s.Substring(5)+")");}
 /// <summary>HookBridge --self-test: a hit proves the pass-through and clean lines keep it; the first line with glyphs that were not blanked, or a cache report, takes the proof back, and later hits do not bring it back.</summary>
 public static bool GlyphLeakSelfTest(){bool p=GlyphProven,g=GdiFontSeen,f=GlyphAllFailed,c=GlyphCached,n=GlyphAllNoted,l=GlyphPassLeaked;int fv=GlyphAllFailedVersion,gv=GlyphVersion,ll=GlyphLeakLines;string file=GlyphFile,mode=GlyphMode;try{
   if(GpuWanted())return true;GlyphFile="";GlyphMode="blank";GlyphCached=false;GdiFontSeen=true;GlyphAllFailed=false;GlyphAllFailedVersion=-1;GlyphVersion=3;
   for(int kind=0;kind<2;kind++){GlyphProven=false;GlyphAllFailed=false;GlyphPassLeaked=false;GlyphLeakLines=0;GlyphAllProof("hit");if(!GlyphAllOk("一行目。"))return false;
    GlyphLineReport("line seq=4 chars=24 placed=10 hidden=10 requested=12 repeat=0 missing=0");GlyphLineReport("line seq=5 chars=6 placed=4 hidden=4 requested=4 repeat=0 missing=0");if(GlyphPassLeaked||!GlyphAllOk("二行目。"))return false; /* clean lines keep it */
    if(kind==0)GlyphLineReport("line seq=6 chars=13 placed=2 hidden=2 requested=3 repeat=2 missing=2");else GlyphDots("cache seq=15 missing=3 of 3");
    if(!GlyphPassLeaked||GlyphAllOk("三行目。"))return false;GlyphAllProof("hit");if(GlyphProven||GlyphAllOk("四行目。"))return false;}
   /* dot mode owns the cache itself (the compositor replaces the dots): no verdict there */
   GlyphProven=true;GlyphAllFailed=false;GlyphPassLeaked=false;GlyphLeakLines=0;GlyphMode="dot";GlyphDots("cache seq=15 missing=3 of 3");if(GlyphPassLeaked)return false;
   /* after the verdict a writable stream is not handed to the font layer; a stream that cannot write back still is */
   if(GlyphLeakStandDown(new Candidate{embed=true}))return false;GlyphPassLeaked=true;if(!GlyphLeakStandDown(new Candidate{embed=true})||GlyphLeakStandDown(new Candidate{embed=true,hideOnly=true})||GlyphLeakStandDown(new Candidate{embed=false})||GlyphLeakStandDown(null))return false;
   return true;}catch{return false;}finally{GlyphProven=p;GdiFontSeen=g;GlyphAllFailed=f;GlyphCached=c;GlyphAllNoted=n;GlyphPassLeaked=l;GlyphAllFailedVersion=fv;GlyphVersion=gv;GlyphLeakLines=ll;GlyphFile=file;GlyphMode=mode;}}
 static void GlyphAllProof(string by){if(GlyphProven||GlyphPassLeaked)return;GlyphProven=true;GlyphAllFailed=false;Diagnostic("glyph pass-through proven ("+by+"): the font layer handles this game's glyphs");}
 static void GlyphAllNote(string why){if(GlyphAllNoted)return;GlyphAllNoted=true;Diagnostic("glyph pass-through off: "+why+"; lines are written back hidden");}
 /* 2026-11-19 (live 千恋＊万花, hide mode: read lines stayed white; log "glyph pass-through off: the trial line brought no glyph report;
    lines are written back hidden"). A game on the engine text path (KiriKiri TextRender / KAG, Ren'Py) is hidden by the engine side
    itself: the text is drawn at opacity 0 and each line is confirmed with ToMe_CHARS hidden=1. That is a layer that hides the line
    as much as the GPU or the font layer, and it was not counted: 千恋's renderer rasterises by itself, brings no GDI glyph report, and
    its lines were written back hidden, so the renderer drew nothing and the glyph colour had nothing to read. 死に逝く君 kept its
    lines and its colours. Now: a hidden=1 confirmation proves pass-through for this run; while the engine hide is switched on and
    nothing is proven yet, one trial line is passed (as for GDI), and a next line without a confirmation ends the trial for this run. */
 /* The proof has to stay true: a passed line that the game side does not hide is the original on screen under MeguLit's own text (the
    double text fixed in 4e2bd3f8). While the engine hide is on, every passed line is expected to be confirmed; two lines in a row
    without a confirmation take the proof back for the run and lines are written back hidden again, as before this change. With the
    engine hide off (MeguLit's layer is not over the game) the game draws its lines itself on purpose and nothing is counted.
    Only the dialogue stream goes through here: menus and settings pages are neither passed nor written back (script.inc trOwn, E980). */
 /* 2026-11-19 (live 千恋＊万花, log 05:55:15.50 proven -> 05:55:16.35 "two lines in a row were not confirmed"): the proof was taken back
    0.85 s after it was given, and the trial before it had ended the same way. One click of the game brings several texts of the
    selected stream within a few milliseconds (the scene label ■自動車（車内／走行）, the name 【 将臣 】 twice, the sentence), and every one
    of them was counted as a line of its own; the game side confirms one thing per click, the sentence it drew. A line is now a click:
    the texts that arrive within EngineBatchMs of the first one, their repeats and their typewriter steps. Not counted: the engine hide
    off, the skip key held (the layers stand down), and what was passed before the hide layers gave way (LayersGiveWay). */
 static volatile bool EngineHideProven,EngineTrialFailed,EnginePassConfirmed;static int EngineHideOn,EngineUnconfirmed;static DateTime EngineBatchAt;static string EngineTrialText;
 static readonly List<string> EngineBatch=new List<string>();const int EngineBatchMs=400;
 /* 2026-11-21 layered game profile (core/profiles, hide.engineTrial.*): the running game's diff, from MEGULIT_PROFILE at start and
    {"type":"profile","engineTrial":{...}} when it changes (core/hook-native.cjs bridgeProfile). A key the diff leaves out keeps the
    kernel rule: trial on, 2 unconfirmed lines end the proof, one click = EngineBatchMs, labels and name plates pass aside. */
 static volatile int ProfileTrial=-1,ProfileUnconfirmed=2,ProfileClickMs=EngineBatchMs;static volatile bool ProfileSkipAside=true;
 static volatile bool ProfileArtemisQuoteSpans;
 static volatile bool SadisticTrialLayout;
 // This caller redraws the entire NVL page while the player is idle. Repeated output
 // from it must not replace the real scenario thread when that thread goes quiet.
 static bool SadisticPageRedraw(string name,ThreadParam tp){return SadisticTrialLayout&&name=="NNNhook"&&tp.ctx==0xd838a&&tp.ctx2==0;}
 static void ApplyProfile(Dictionary<string,object> d){object av;SadisticTrialLayout=d!=null&&d.TryGetValue("sadisticTrialLayout",out av)&&av is bool&&(bool)av;ProfileArtemisQuoteSpans=d!=null&&d.TryGetValue("artemisQuoteSpans",out av)&&av is bool&&(bool)av;object t;var e=d!=null&&d.TryGetValue("engineTrial",out t)?t as Dictionary<string,object>:null;int trial=-1,un=2,ms=EngineBatchMs;bool aside=true;
  if(e!=null){object v;if(e.TryGetValue("enabled",out v)&&v is bool)trial=(bool)v?1:0;if(e.TryGetValue("unconfirmedLines",out v)&&v is int&&(int)v>=1&&(int)v<=10)un=(int)v;
   if(e.TryGetValue("clickMs",out v)&&v is int&&(int)v>=100&&(int)v<=10000)ms=(int)v;if(e.TryGetValue("skipAside",out v)&&v is bool)aside=(bool)v;}
  ProfileTrial=trial;ProfileUnconfirmed=un;ProfileClickMs=ms;ProfileSkipAside=aside;Diagnostic("profile engineTrial enabled="+(trial<0?"kernel":trial==1?"on":"off")+" unconfirmed="+un+" clickMs="+ms+" skipAside="+(aside?"1":"0"));}
 static void ProfileFromEnv(){string raw=Environment.GetEnvironmentVariable("MEGULIT_PROFILE");if(String.IsNullOrEmpty(raw)||raw.Length>8192)return;try{ApplyProfile(Json.Deserialize<Dictionary<string,object>>(raw));}catch(Exception e){Diagnostic("profile env ignored: "+e.Message);}}
 static void EngineHideProof(string by){EnginePassConfirmed=true;EngineUnconfirmed=0;if(EngineHideProven||EngineTrialFailed&&EngineTrialText==null)return;EngineHideProven=true;EngineTrialFailed=false;Diagnostic("engine pass-through proven ("+by+"): the game side draws its lines invisible");}
 static bool EngineSameClick(string text,DateTime now){lock(EngineBatch){if(EngineBatch.Count==0)return false;
   if((now-EngineBatchAt).TotalMilliseconds<ProfileClickMs){if(EngineBatch.Count<16&&!EngineBatch.Contains(text))EngineBatch.Add(text);return true;}
   foreach(string b in EngineBatch)if(text==b||TypewriterStep(b,text))return true;return false;}}
 static void EngineNewClick(string text,DateTime now){lock(EngineBatch){EngineBatch.Clear();EngineBatch.Add(text);EngineBatchAt=now;}EnginePassConfirmed=false;}
 /* 2026-11-21 (owner incr9, 千恋＊万花 22:54:04Z: the trial line was the scene label ■自動車（車内／走行）, which the game never draws, so no
    hidden record could confirm it; the sentence came 0.6 s later as a new click and the trial failed. The fallback wrote every line back
    blank, TextRender laid out spaces, no ToMe_CHARS was sent and the reader had no place: the Japanese was gone for the whole opening).
    A scene label or a name plate is never the line the game side confirms: it passes, starts no trial and is no click of its own. */
 static readonly System.Text.RegularExpressions.Regex EngineNamePlate=new System.Text.RegularExpressions.Regex(@"^\s*【[^】
]{1,16}】\s*$");
 static bool EngineAside(string text){return text.Length>0&&(EngineNamePlate.IsMatch(text)||EmbedTextPolicy.Label(text)&&!SpokenPiece(text));}
 static bool EngineAllOk(string text){text=text??"";DateTime now=DateTime.UtcNow;
  if(ProfileTrial==0)return false; /* this game's diff: no engine pass-through, lines are written back hidden */
  if(ProfileSkipAside&&Volatile.Read(ref EngineHideOn)>0&&!EngineTrialFailed&&EngineAside(text))return true;
  if(EngineHideProven){
   if(Volatile.Read(ref EngineHideOn)>0&&!SkipHeld&&!EngineSameClick(text,now)){
    bool pending;lock(EngineBatch){pending=EngineBatch.Count>0;}
    if(pending&&!EnginePassConfirmed){if(++EngineUnconfirmed>=ProfileUnconfirmed){EngineHideProven=false;EngineTrialFailed=true;EngineTrialText=null;lock(EngineBatch){EngineBatch.Clear();}Diagnostic("engine pass-through off: two lines in a row were not confirmed hidden by the game side; lines are written back hidden");return false;}}
    EngineNewClick(text,now);}
   return true;}
  if(EngineTrialFailed||Volatile.Read(ref EngineHideOn)<=0)return false;
  if(EngineTrialText==null){EngineTrialText=text;EngineNewClick(text,now);Diagnostic("engine pass-through trial line chars="+EngineTrialText.Length);return true;}
  if(EngineSameClick(text,now))return true;
  EngineTrialFailed=true;Diagnostic("engine pass-through off: the trial line was not confirmed hidden by the game side");return false;}
 /* One place where every layer that hides the game's own text gives way (2026-11-19, user: calibrating 千恋＊万花 in hide mode flashed
    for a minute; the screenshots had no game text in the dialogue box). The layers are: write-back (the line is written back hidden),
    the engine side (KiriKiri / Ren'Py draw at opacity 0 while Local\MeguLit<Engine>Hide-<pid> is set), the font layer and the GPU
    layer. The calibration preflight, the reader profile and a disabled cover all end here; the engine events are reset at once and
    not at the hide thread's next 200 ms poll, and the state of every layer is logged in one line. The proof of the engine
    pass-through is kept (the game side has not changed), so "enable" hides again from the next line without a new trial. A line that
    is already on screen stays as it was drawn: one written back hidden or drawn at opacity 0 comes back with the next line, a
    TextRender text layer at once (script.inc trHide). */
 static string LayerState(){bool glyph,gpu,engine=false;lock(GlyphGate){glyph=GlyphSent;}lock(GpuGate){gpu=GpuSent;}lock(EngineHides){foreach(var h in EngineHides.Values)if(h!=null){try{if(h.WaitOne(0))engine=true;}catch{}}}
  return "write-back="+(ReplacementEnabled?"on":"off")+" engine="+(engine?"on":"off")+" glyph="+(glyph?"on":"off")+" gpu="+(gpu?"on":"off");}
 static string LayersGiveWay(string reason){lock(Gate){ReplacementEnabled=false;ReplacementCallback=false;}SyncGpuRenderers();
  lock(EngineHides){foreach(var h in EngineHides.Values)if(h!=null){try{h.Reset();}catch{}}}
  EnginePassConfirmed=true; /* what was passed before is not a miss of the game side */
  GlyphOff();string state=LayerState();Diagnostic("hide layers give way ("+reason+"): "+state);return state;}
 /// <summary>HookBridge --self-test: with every layer on and the engine pass-through proven, giving way leaves no layer on, keeps the proof, counts nothing while away, and the first line after coming back is not a miss.</summary>
 public static bool GiveWaySelfTest(){bool r=ReplacementEnabled,rc=ReplacementCallback,p=EngineHideProven,f=EngineTrialFailed,pc=EnginePassConfirmed,gs,ps;int on=EngineHideOn,un=EngineUnconfirmed;DateTime ba=EngineBatchAt;string tt=EngineTrialText;string[] batch;lock(EngineBatch){batch=EngineBatch.ToArray();}lock(GlyphGate){gs=GlyphSent;}lock(GpuGate){ps=GpuSent;}
  var ev=new System.Threading.EventWaitHandle(true,System.Threading.EventResetMode.ManualReset);try{
   lock(EngineHides){EngineHides["SELFTEST"]=ev;}ReplacementEnabled=true;lock(GlyphGate){GlyphSent=true;}lock(GpuGate){GpuSent=true;}
   EngineHideProven=true;EngineTrialFailed=false;EngineHideOn=1;EngineUnconfirmed=0;lock(EngineBatch){EngineBatch.Clear();}
   if(LayerState()!="write-back=on engine=on glyph=on gpu=on")return false;
   if(!EngineAllOk("一行目。"))return false; /* passed, not confirmed yet */
   if(LayersGiveWay("self-test")!="write-back=off engine=off glyph=off gpu=off"||ReplacementEnabled||ev.WaitOne(0))return false;
   EngineHideOn=0;if(!EngineAllOk("二行目。")||!EngineAllOk("三行目。")||!EngineAllOk("四行目。"))return false; /* the game draws them itself */
   if(!EngineHideProven||EngineUnconfirmed!=0)return false;
   EngineHideOn=1;EngineBatchAt=DateTime.UtcNow.AddSeconds(-5);if(!EngineAllOk("五行目。")||EngineUnconfirmed!=0||!EngineHideProven)return false; /* back: a fresh line, no miss carried over */
   return true;}catch{return false;}finally{lock(EngineHides){EngineHides.Remove("SELFTEST");}ev.Dispose();ReplacementEnabled=r;ReplacementCallback=rc;EngineHideProven=p;EngineTrialFailed=f;EnginePassConfirmed=pc;EngineHideOn=on;EngineUnconfirmed=un;EngineBatchAt=ba;EngineTrialText=tt;lock(EngineBatch){EngineBatch.Clear();EngineBatch.AddRange(batch);}lock(GlyphGate){GlyphSent=gs;}lock(GpuGate){GpuSent=ps;}}}
 public static bool GlyphAllOk(string text){
  if(GpuWanted())return true;
  if(EngineAllOk(text))return true;
  if(GlyphCached){GlyphAllNote("the engine reuses rasterised glyphs");return false;}
  if(GlyphPassLeaked)return false;
  if(GlyphProven)return true;
  if(GlyphAllFailed||GlyphAllFailedVersion>=0&&(GlyphVersion==0||GlyphAllFailedVersion==GlyphVersion)){GlyphAllNote("this game's glyphs were not blanked");return false;}
  if(!GdiFontSeen){GlyphAllNote("no GDI glyphs seen from this game yet");return false;}
  DateTime now=DateTime.UtcNow;
  if(GlyphTrialText==null){GlyphTrialAt=now;GlyphTrialText=text??"";GlyphAllNoted=false;Diagnostic("glyph pass-through trial line chars="+GlyphTrialText.Length);return true;}
  if(text==GlyphTrialText||TypewriterStep(GlyphTrialText,text)||(now-GlyphTrialAt).TotalMilliseconds<400)return true;
  GlyphAllFailed=true;GlyphAllNoted=false;GlyphSave(new Dictionary<string,object>{{"allFailed",GlyphVersion},{"bridge",BridgeBuild()},{"at",now.ToString("o")}});GlyphAllNote("the trial line brought no glyph report");return false;}
 /// <summary>HookBridge --self-test: pass-through only with proof; no GDI glyphs = write-back; one trial line, then write-back; proof turns it on.</summary>
 /// <summary>HookBridge --self-test: no engine hide = no trial; engine hide on = one trial line, its redraw passes, a second line without a confirmation ends it; a confirmation proves it.</summary>
 /// <summary>HookBridge --self-test: hide.engineTrial.* of the game profile reach the engine pass-through; an empty profile is the kernel rule.</summary>
 public static bool ProfileSelfTest(){bool p=EngineHideProven,f=EngineTrialFailed,pc=EnginePassConfirmed,sk=SkipHeld;int on=EngineHideOn,un=EngineUnconfirmed;DateTime ba=EngineBatchAt;string tt=EngineTrialText;
  try{SkipHeld=false;Func<string,bool> reset=j=>{ApplyProfile(Json.Deserialize<Dictionary<string,object>>(j));EngineHideProven=false;EngineTrialFailed=false;EngineHideOn=1;EngineTrialText=null;EnginePassConfirmed=false;EngineUnconfirmed=0;lock(EngineBatch){EngineBatch.Clear();}return true;};
   reset("{}");if(ProfileTrial!=-1||ProfileUnconfirmed!=2||ProfileClickMs!=EngineBatchMs||!ProfileSkipAside||!EngineAllOk("「一行目。」"))return false;
   reset("{\"engineTrial\":{\"enabled\":false}}");if(EngineAllOk("「一行目。」"))return false;
   reset("{\"engineTrial\":{\"skipAside\":false}}");if(!EngineAllOk("■自動車（車内／走行）")||EngineTrialText!="■自動車（車内／走行）")return false;
   reset("{\"engineTrial\":{\"unconfirmedLines\":1,\"clickMs\":200}}");if(ProfileUnconfirmed!=1||ProfileClickMs!=200)return false;
   EngineHideProven=true;if(!EngineAllOk("「一行目。」"))return false;EngineBatchAt=DateTime.UtcNow.AddSeconds(-5);if(EngineAllOk("「二行目。」")||!EngineTrialFailed)return false;
   reset("{\"engineTrial\":{\"unconfirmedLines\":99,\"clickMs\":5}}");return ProfileUnconfirmed==2&&ProfileClickMs==EngineBatchMs;}
  catch{return false;}finally{ApplyProfile(null);EngineHideProven=p;EngineTrialFailed=f;EnginePassConfirmed=pc;SkipHeld=sk;EngineHideOn=on;EngineUnconfirmed=un;EngineBatchAt=ba;EngineTrialText=tt;lock(EngineBatch){EngineBatch.Clear();}}}
 public static bool EngineAllSelfTest(){bool p=EngineHideProven,f=EngineTrialFailed,pc=EnginePassConfirmed,sk=SkipHeld;int on=EngineHideOn,un=EngineUnconfirmed;DateTime ba=EngineBatchAt;string tt=EngineTrialText;string[] batch;lock(EngineBatch){batch=EngineBatch.ToArray();}try{
   Action next=()=>{EngineBatchAt=DateTime.UtcNow.AddSeconds(-1);}; /* the next text belongs to a later click */
   SkipHeld=false;EngineHideProven=false;EngineTrialFailed=false;EngineHideOn=0;EngineTrialText=null;EnginePassConfirmed=false;EngineUnconfirmed=0;lock(EngineBatch){EngineBatch.Clear();}
   if(EngineAllOk("一行目。"))return false; /* the engine hide is not on: nothing to wait for */
   /* the trial is one click: the scene label, the name and the sentence arrive together, the name and the typewriter come again later */
   EngineHideOn=1;if(!EngineAllOk("■自動車（車内／走行）")||!EngineAllOk("【 将臣 】")||!EngineAllOk("【 将臣 】")||!EngineAllOk("「あっ、")||EngineTrialFailed)return false;
   next();if(!EngineAllOk("【 将臣 】")||!EngineAllOk("「あっ、はい。なんですか？」")||EngineTrialFailed)return false; /* repeats and typewriter steps of that click */
   if(EngineAllOk("二行目。")||!EngineTrialFailed||EngineAllOk("三行目。"))return false; /* the next click came without a confirmation: off for this run */
   /* incr9: the label arrives alone and the sentence 0.6 s later: the sentence is the trial, the label never was */
   EngineTrialFailed=false;EngineTrialText=null;lock(EngineBatch){EngineBatch.Clear();}if(!EngineAllOk("■自動車（車内／走行）")||EngineTrialText!=null)return false;next();if(!EngineAllOk("【運転手】")||EngineTrialText!=null)return false;next();if(!EngineAllOk("「お客さんってば」")||EngineTrialFailed||EngineTrialText!="「お客さんってば」")return false;EngineHideProof("self-test");if(!EngineHideProven)return false;
   EngineHideProven=false;EngineTrialFailed=true;EngineTrialText=null;lock(EngineBatch){EngineBatch.Clear();}
   EngineTrialFailed=false;EngineTrialText=null;if(!EngineAllOk("一行目。"))return false;EngineHideProof("self-test");next();if(!EngineAllOk("二行目。"))return false;next();if(!EngineAllOk("三行目。"))return false; /* confirmed: every line passes */
   EngineHideProof("self-test");EngineHideOn=0;next();if(!EngineAllOk("四行目。"))return false;next();if(!EngineAllOk("五行目。"))return false;next();if(!EngineAllOk("六行目。")||!EngineHideProven||EngineUnconfirmed!=0)return false; /* hide off: the game draws on purpose, nothing is counted */
   /* live 千恋＊万花: three clicks of label + name + sentence, each confirmed once: the proof stays */
   EngineHideOn=1;lock(EngineBatch){EngineBatch.Clear();}EngineUnconfirmed=0;
   for(int i=0;i<3;i++){next();if(!EngineAllOk("■自動車（車内／走行）")||!EngineAllOk("【運転手】")||!EngineAllOk("【運転手】")||!EngineAllOk("台詞"+i+"。"))return false;EngineHideProof("self-test");}
   if(!EngineHideProven||EngineUnconfirmed!=0)return false;
   /* the skip key held: the layers stand down, nothing is counted */
   SkipHeld=true;for(int i=0;i<4;i++){next();if(!EngineAllOk("早送り"+i+"。"))return false;}SkipHeld=false;if(!EngineHideProven||EngineUnconfirmed!=0)return false;
   /* confirmed lines keep the proof; two unconfirmed clicks in a row take it back, and it stays off for the run */
   next();if(!EngineAllOk("七行目。"))return false;EngineHideProof("self-test");next();if(!EngineAllOk("八行目。"))return false;EngineHideProof("self-test");
   next();if(!EngineAllOk("九行目。")||!EngineAllOk("九行目。"))return false;next();if(!EngineAllOk("十行目。"))return false; /* 九 unconfirmed: one miss is tolerated, its redraw is not a new line */
   next();if(EngineAllOk("十一行目。")||EngineHideProven||!EngineTrialFailed)return false; /* 十 unconfirmed too: proof taken back */
   if(EngineAllOk("十二行目。"))return false;EngineHideProof("late");if(EngineHideProven||EngineAllOk("十三行目。"))return false; /* a late confirmation does not bring it back in this run */
   return true;}finally{SkipHeld=sk;EngineHideProven=p;EngineTrialFailed=f;EnginePassConfirmed=pc;EngineHideOn=on;EngineUnconfirmed=un;EngineBatchAt=ba;EngineTrialText=tt;lock(EngineBatch){EngineBatch.Clear();EngineBatch.AddRange(batch);}}}
 public static bool GlyphAllSelfTest(){bool p=GlyphProven,g=GdiFontSeen,f=GlyphAllFailed,c=GlyphCached,n=GlyphAllNoted;int fv=GlyphAllFailedVersion,gv=GlyphVersion;DateTime ta=GlyphTrialAt;string tt=GlyphTrialText,file=GlyphFile;try{GlyphFile="";GlyphCached=false;GlyphProven=false;GdiFontSeen=false;GlyphAllFailed=false;GlyphAllFailedVersion=-1;GlyphVersion=3;GlyphTrialText=null;
   if(GpuWanted())return true; /* a layer is armed in this process: nothing to judge */
   if(GlyphAllOk("一行目。"))return false; /* SoftPal case: no GDI glyphs, writable stream = write-back */
   GdiFontSeen=true;if(!GlyphAllOk("一行目。")||!GlyphAllOk("一行目。"))return false; /* trial line and its redraw pass */
   GlyphTrialAt=DateTime.UtcNow.AddSeconds(-1);if(GlyphAllOk("二行目。")||!GlyphAllFailed||GlyphAllOk("三行目。"))return false; /* no report by the next line: off, stays off */
   GlyphAllProof("self-test");if(!GlyphAllOk("四行目。"))return false; /* a glyph report turns it on */
   GlyphProven=false;GlyphAllFailed=false;GlyphTrialText=null;GlyphAllFailedVersion=3;if(GlyphAllOk("五行目。"))return false; /* remembered failure of this layer version */
   GlyphAllFailedVersion=2;if(!GlyphAllOk("五行目。"))return false; /* a newer layer tries again */
   GlyphCached=true;GlyphProven=true;if(GlyphAllOk("六行目。"))return false; /* cached glyphs cannot be blanked */
   return true;}catch{return false;}finally{GlyphProven=p;GdiFontSeen=g;GlyphAllFailed=f;GlyphCached=c;GlyphAllNoted=n;GlyphAllFailedVersion=fv;GlyphVersion=gv;GlyphTrialAt=ta;GlyphTrialText=tt;GlyphFile=file;}}
 static void GlyphLine(string text){FlushFit();if(GpuLittlecheeseLine(text))return;if(!HideDialogueLine(text)){GlyphOff();return;}bool first=false;lock(Gate){if(Selected!="")first=DialogueHideReady.Add(Selected);}if(first)ThreadPool.QueueUserWorkItem(_=>Probe());if(HookTarget.ChineseText){GlyphOff();return;}if(SkipHeld){GlyphOff();return;}/* 2026-11-15 a line no one can read stays the game's own (EmbedTextPolicy.Unreadable) */string selCode;lock(Gate){Candidate sc;selCode=Selected!=""&&Candidates.TryGetValue(Selected,out sc)?sc.code:"";}if(EmbedTextPolicy.Unreadable(text)&&SelectedReadableRun<2&&!EmbedTextPolicy.EngineText(selCode)){Diagnostic("unreadable line left to the game chars="+(text??"").Length);GlyphOff();return;}GpuLine(text);if(GlyphWanted()&&!GlyphLeakDown()){lock(GlyphGate){GlyphSent=true;}GlyphSend("LINE "+System.Text.RegularExpressions.Regex.Replace(text??"",@"[\r\n\u2028\u2029]+"," "));}else GlyphFontOff();}
 /* 2026-11-15 (沙耶の唄: every LINE to the GPU layer was followed by OFF): a game whose glyphs the font layer cannot blank (GlyphCached, learned
    once and saved) turned the font layer off per line through GlyphOff, which also disarmed layer 4. Only the font layer goes off here. */
 static void GlyphFontOff(){bool was;lock(GlyphGate){was=GlyphSent;GlyphSent=false;}if(was)GlyphSend("OFF");}
 static void GlyphOff(){GpuDisarm();bool was;lock(GlyphGate){was=GlyphSent;GlyphSent=false;}if(was)GlyphSend("OFF");}
 /* Glyph dots (docs/text-architecture.md): MODE dot makes MeguLitFont<bit>.dll serve dot glyphs (same metrics, one small
    square per character) instead of blank ones, for MeguLit's capture compositor to find and replace; MODE blank is the
    version 2 behaviour and stays the default. Chosen by the front end ({"type":"glyphMode","mode":"dot"|"blank"}) or
    MEGULIT_GLYPH_MODE=dot for tests. In dot mode the LunaHook GDI hide (MeguLitGdiHide.h) is not switched on for the
    stream, because a string it leaves out would never reach the dots. Every dot is forwarded as a hookGlyphDots event. */
 static string GlyphMode=GlyphModeName(Environment.GetEnvironmentVariable("MEGULIT_GLYPH_MODE"));
 /* place: blank glyphs (same metrics, no coverage) plus the same per-character records, each with its cell origin on screen,
    for the reader overlay that draws MeguLit's text where the game's would be. Since spec 3 every mode reports (blank =
    the old place); "place" is accepted as an alias of blank. */
 static string GlyphModeName(string m){return m=="dot"?"dot":"blank";}
 /* names / choices as extra lines (front end: {"type":"glyphExtras","names":true,"choices":[...]}); off until the reader overlay draws them */
 /* locating marks for GetGlyphOutline engines (MARK on; docs "Locating marks"): only while the reader captures to find them */
 static volatile bool GlyphMarks=Environment.GetEnvironmentVariable("MEGULIT_GLYPH_MARKS")=="1";
 static volatile bool GlyphNames=Environment.GetEnvironmentVariable("MEGULIT_GLYPH_NAMES")=="1";
 static volatile bool GlyphAll=Environment.GetEnvironmentVariable("MEGULIT_GLYPH_ALL")=="1";
 /* blind: dots for every glyph under the dialogue font without waiting for the line (streams whose text arrives after
    the glyphs are drawn, e.g. AdvHD); the line still follows and the front end maps dots to it by reading order. */
 static volatile bool GlyphBlind=Environment.GetEnvironmentVariable("MEGULIT_GLYPH_BLIND")=="1";
 /* blind dots need the dialogue font before the first glyph (caching engines draw every character once): the font the
    probe reports as leading is remembered per game (glyph-hide memory, the same file the hide's learned key uses) and
    seeds the next launch at connect. */
 static void BlindSeed(string line){if(!GlyphBlind)return;var m=System.Text.RegularExpressions.Regex.Match(line??"",@"^ToMe_FONT src=gdi size=(\d{1,4}) weight=\d{1,4} chars=\d+ face=(.{1,64})$");if(!m.Success)return;string next="FONT "+m.Groups[1].Value+" "+m.Groups[2].Value;if(next==GlyphSeed)return;/* the probe re-reports when another font overtakes the leader (AdvHD: the 17 px name box first, the 20 px dialogue after): the latest leader is remembered */GlyphSeed=next;GlyphSend(GlyphSeed);GlyphSave(new Dictionary<string,object>{{"face",m.Groups[2].Value},{"size",Int32.Parse(m.Groups[1].Value)},{"at",DateTime.UtcNow.ToString("o")},{"from","probe"}});Diagnostic("glyph dots: dialogue font seeded from the probe ("+GlyphSeed+")");}
 static string GlyphModeLine(){return GlyphBlind?"MODE "+GlyphMode+"-blind":"MODE "+GlyphMode;}
 /* all: write-back streams too. Their embed callback stays on, but in dot mode it pushes the line to the DLL first and then
    hands the text back unchanged, so the line is known before the game draws it (the text output arrives too late for that). */
 static bool DotsOwn(Candidate c){return c!=null&&c.gdiProbe;} /* text marks on a per-character argument hook: the DLL marks only a stream that is switched on (check_embed_able), so dots no longer keep it off */
 static void GlyphModeSet(string mode,bool force=false){mode=GlyphModeName(mode);if(mode==GlyphMode&&!force)return;GlyphMode=mode;GlyphSend(GlyphModeLine());Diagnostic("glyph mode "+mode);string id;lock(Gate){id=Enabled?Selected:"";}if(id!="")Select(id);}
 static List<object> GlyphList(string v){var list=new List<object>();foreach(string e in v.Split(';')){var f=e.Split(':');int i,h,b,a,x,y,sd,cp,px=0,py=0;if(f.Length!=9&&f.Length!=12||f[8].Length!=1||f.Length==12&&(!Int32.TryParse(f[9],out px)||!Int32.TryParse(f[10],out py)||!System.Text.RegularExpressions.Regex.IsMatch(f[11],@"^(-|c|g|[mt]\d{1,5}x\d{1,5})$"))||!Int32.TryParse(f[0],out i)||!Int32.TryParse(f[1],System.Globalization.NumberStyles.HexNumber,null,out cp)||!Int32.TryParse(f[2],out h)||!Int32.TryParse(f[3],out b)||!Int32.TryParse(f[4],out a)||!Int32.TryParse(f[5],out x)||!Int32.TryParse(f[6],out y)||!Int32.TryParse(f[7],out sd)||cp<1||cp>0xffff)continue;if(f.Length==12&&f[11]!="-")list.Add(new{i=i,ch=((char)cp).ToString(),h=h,b=b,a=a,x=x,y=y,s=sd,k=f[8],at=new{x=px,y=py,space=f[11]}});else list.Add(new{i=i,ch=((char)cp).ToString(),h=h,b=b,a=a,x=x,y=y,s=sd,k=f[8]});}return list;}
 static void GlyphDots(string s){
  /* extra lines (names, choices; records 4): announced once per id, then their own records */
  var ex=System.Text.RegularExpressions.Regex.Match(s,@"^extra id=(\d{1,9}) kind=([no]) text=(.*)$");if(ex.Success){Emit(new{type="hookGlyphExtra",state="line",id=Int64.Parse(ex.Groups[1].Value),kind=ex.Groups[2].Value,text=ex.Groups[3].Value});return;}
  var xd=System.Text.RegularExpressions.Regex.Match(s,@"^xdots id=(\d{1,9}) path=(\w{1,8}) list=(.*)$");if(xd.Success){Emit(new{type="hookGlyphExtra",state="dots",id=Int64.Parse(xd.Groups[1].Value),path=xd.Groups[2].Value,dots=GlyphList(xd.Groups[3].Value)});return;}
  /* the colour the game hands the text API for the line (native/fontprobe ServeColor): evidence that survives the blank glyphs */
  var col=System.Text.RegularExpressions.Regex.Match(s,@"^color seq=(\d{1,9}) rgb=([0-9a-f]{6}) a=([0-9a-f]{2}) src=(\w{1,8})$");if(col.Success){Emit(new{type="hookGlyphColor",seq=Int64.Parse(col.Groups[1].Value),color="#"+col.Groups[2].Value,alpha=Convert.ToInt32(col.Groups[3].Value,16),src=col.Groups[4].Value});return;}
  var line=System.Text.RegularExpressions.Regex.Match(s,@"^line seq=(\d{1,9}) text=(.*)$");if(line.Success){Emit(new{type="hookGlyphDots",state="line",seq=Int64.Parse(line.Groups[1].Value),text=line.Groups[2].Value});return;}
  var dots=System.Text.RegularExpressions.Regex.Match(s,@"^dots seq=(\d{1,9}) path=(\w{1,8}) list=(.*)$");if(dots.Success){var list=GlyphList(dots.Groups[3].Value);if(list.Count>0)GlyphAllProof("dots");
   Emit(new{type="hookGlyphDots",state="dots",seq=Int64.Parse(dots.Groups[1].Value),path=dots.Groups[2].Value,dots=list});return;}
  if(s.StartsWith("cache ",StringComparison.Ordinal)){Diagnostic("glyph dots: the engine reuses rasterised glyphs ("+s.Substring(6)+"); dots go on");if(GlyphMode!="dot")GlyphPassLeak("cache "+s.Substring(6));Emit(new{type="hookGlyphDots",state="cached"});return;}
  /* locating marks refused: the engine keeps glyphs (cache), marks would come back in later lines */
  var mo=System.Text.RegularExpressions.Regex.Match(s,@"^status marks-off cache=([01]) hits=(\d{1,6})/(\d{1,6})$");if(mo.Success){Diagnostic("glyph marks off: the engine does not rasterise repeated characters again ("+mo.Groups[2].Value+"/"+mo.Groups[3].Value+(mo.Groups[1].Value=="1"?", cache seen":"")+")");Emit(new{type="hookGlyphDots",state="status",status="marks-off",served=0});return;}
  /* compositor heartbeat gate (docs/text-architecture.md): paused | live | needs-relaunch served=<n> */
  var st=System.Text.RegularExpressions.Regex.Match(s,@"^status (paused|live|needs-relaunch)(?: served=(\d{1,9}))?$");if(st.Success){Diagnostic("glyph dots "+s);Emit(new{type="hookGlyphDots",state="status",status=st.Groups[1].Value,served=st.Groups[2].Success?Int64.Parse(st.Groups[2].Value):0});}}
 static string GlyphKey;
 /* 2026-11-19 (user test copy: 千恋＊万花 learned "cannot hide" before its hide was fixed that day): a learned negative verdict
    (cached glyphs, no glyph blanked) belongs to the bridge build that learned it. A record from another build, or one written
    before the stamp existed, is tried again once; a failure under this build is learned again with its stamp. */
 static string BridgeBuild(){try{return System.Reflection.Assembly.GetExecutingAssembly().ManifestModule.ModuleVersionId.ToString("N");}catch{return "";}}
 static bool LearnedHere(Dictionary<string,object> d,string build){object b;return d!=null&&build!=""&&d.TryGetValue("bridge",out b)&&Convert.ToString(b)==build;}
 public static bool LearnedSelfTest(){string me=BridgeBuild();if(me.Length!=32||me!=BridgeBuild())return false;
  if(!LearnedHere(new Dictionary<string,object>{{"cached",true},{"bridge",me}},me))return false;
  if(LearnedHere(new Dictionary<string,object>{{"cached",true}},me))return false; /* written before the stamp: tried again */
  if(LearnedHere(new Dictionary<string,object>{{"allFailed",3},{"bridge","0123456789abcdef0123456789abcdef"}},me))return false; /* another build */
  return !LearnedHere(new Dictionary<string,object>{{"cached",true},{"bridge",""}},"");}
 /* Pure rule of the same-hook follow above, for the self-test: a line counts only when it comes 0.35 s or more after the previous
    one of that context; a burst sets the count back */
 public static int SameHookPace(int hits,double sinceLast,string text){return PageDump(text)?0:sinceLast>=0.35?hits+1:0;}
 /* several lines in one text: two or more line breaks, two or more opening brackets, or longer than a message box holds */
 public static bool PageDump(string text){string t=text??"";int breaks=0,quotes=0;foreach(char ch in t){if(ch=='\n')breaks++;else if(ch=='「'||ch=='『')quotes++;}return breaks>=2||quotes>=2||t.Length>160;}
 public static bool SameHookSelfTest(){int h=0;foreach(double gap in new[]{9.0,0.03,0.02,0.04,0.03})h=SameHookPace(h,gap,"「お？」");if(h>=2)return false; /* a LOG page: 50 lines in 0.3 s never follow */
  h=0;foreach(double gap in new[]{9.0,2.1})h=SameHookPace(h,gap,"　週の終わり、だからこそもっとも忙しい昼。");if(h<2)return false;
  h=0;foreach(double gap in new[]{9.0,2.1})h=SameHookPace(h,gap,"【由岐】「V系だ！」【ざくろ】「な、なにが？」");if(h>=2)return false; /* LOG pages a scroll apart: dumps */
  return !PageDump("「そこに覆い被さる……重く真っ青な空は、\nいつでも当たり前の姿を私達に見せてくれる。」");}
 static void GlyphSave(object value){if(String.IsNullOrEmpty(GlyphFile))return;string file=GlyphFile,json=Json.Serialize(value);DiskLater(()=>{try{Directory.CreateDirectory(Path.GetDirectoryName(file));File.WriteAllText(file,json);}catch{}});}
 static void GlyphReport(string s){Diagnostic("glyph hide "+s);GlyphLineReport(s);
  var ready=System.Text.RegularExpressions.Regex.Match(s,@"^ready version=(\d{1,4})");if(ready.Success){GlyphVersion=Int32.Parse(ready.Groups[1].Value);Emit(new{type="hookGlyphHide",state="ready",version=Int32.Parse(ready.Groups[1].Value)});return;}
  var key=System.Text.RegularExpressions.Regex.Match(s,@"^key size=(\d{1,4}) face=(.{1,64})$");if(key.Success){GlyphKey=key.Groups[1].Value+"|"+key.Groups[2].Value;Emit(new{type="hookGlyphHide",state="key",face=key.Groups[2].Value,size=Int32.Parse(key.Groups[1].Value)});return;}
  var hit=System.Text.RegularExpressions.Regex.Match(s,@"^hit path=(\w+) size=(\d{1,4})");if(hit.Success){GlyphAllProof("hit");bool fresh=false;lock(Gate){Candidate c;if(Selected!=""&&Candidates.TryGetValue(Selected,out c)&&c.gdiProbe&&!c.embed){c.glyphHide=true;fresh=true;}}GdiHideHit("glyph "+s.Substring(4));if(fresh){Emit(new{type="hookGlyphHide",state="hit",path=hit.Groups[1].Value,size=Int32.Parse(hit.Groups[2].Value)});Status("通用字形隐藏已生效：游戏原文由 MeguLit 接管显示");}string k=GlyphPassLeaked?null:GlyphKey;if(k!=null){int bar=k.IndexOf('|');GlyphSave(new Dictionary<string,object>{{"face",k.Substring(bar+1)},{"size",Int32.Parse(k.Substring(0,bar))},{"at",DateTime.UtcNow.ToString("o")}});}return;}
  if(s.StartsWith("cache ",StringComparison.Ordinal)){Candidate c=null;lock(Gate){GlyphCached=true;if(Selected!=""&&Candidates.TryGetValue(Selected,out c)&&c.glyphHide){c.glyphHide=false;c.embed=false;c.hideOnly=false;List();}else c=null;}GlyphOff();GlyphSave(new Dictionary<string,object>{{"cached",true},{"bridge",BridgeBuild()},{"at",DateTime.UtcNow.ToString("o")}});Emit(new{type="hookGlyphHide",state="cached"});Diagnostic("glyph hide stopped: the engine reuses rasterised glyphs"+(c!=null?"; "+c.name+" back to read-only":""));if(c!=null)Status("这个游戏会复用已画好的字形，通用隐藏已停用，改为只读");}}
 static object FontInfo(string line){if((line??"").StartsWith("ToMe_FONT src=gdi ",StringComparison.Ordinal))GdiFontSeen=true;
  var m=System.Text.RegularExpressions.Regex.Match(line??"",@"^ToMe_FONT src=(gdi|gdip|dwrite) size=(\d{1,4}) weight=(\d{1,4}) chars=(\d+) face=(.{1,64})$");
  if(m.Success){string face=m.Groups[5].Value,back=Unmojibake(face);if(back.Length>0&&back!=face&&System.Text.RegularExpressions.Regex.IsMatch(back,"[ぁ-ヿＡ-Ｚ]|ゴシック|明朝"))face=back;int weight=Int32.Parse(m.Groups[3].Value);Diagnostic("font probe draws with "+face+" "+m.Groups[2].Value+"px w"+weight+" ("+m.Groups[1].Value+", "+m.Groups[4].Value+" chars)");
   return new{type="hookFont",engine=m.Groups[1].Value,probe=true,face=face,size=Int32.Parse(m.Groups[2].Value),weight=weight,bold=weight>=600,chars=Int64.Parse(m.Groups[4].Value),prerendered=""};}
  var file=System.Text.RegularExpressions.Regex.Match(line??"",@"^ToMe_FONTFILE kind=(mem|file) path=(.{4,900})$");
  if(file.Success){Diagnostic("font probe "+file.Groups[1].Value+" font "+file.Groups[2].Value);return new{type="hookFontFile",kind=file.Groups[1].Value,path=file.Groups[2].Value};}
  return null;}
 static object EngineInfo(string s){
    // engine-draw MAGES (native/megulithook/MagesDraw.h): the engine's dialogue page records go to the kernel as they are;
    // core/mages-draw.cjs turns them into ToMe_CHARS (one line per page between clears)
    if((s??"").StartsWith("ToMe_DRAWRUN engine=mages ",StringComparison.Ordinal)||(s??"").StartsWith("ToMe_DRAWBOX engine=mages ",StringComparison.Ordinal))return s.Length<=1000?new{type="hookEngineDraw",engine="mages",line=s}:null;
    var layout=System.Text.RegularExpressions.Regex.Match(s??"",@"^ToMe_CS2_LAYOUT line=(\d+) token=(\d+) x0=(-?\d+) y0=(-?\d+) x1=(-?\d+) y1=(-?\d+) size=(\d+) n=(\d+) hidden=([01])(?: color=([0-9a-f]{8}))?");
    if(layout.Success)return new{type="hookTextPos",engine="cs2_screen_v2",line=Int64.Parse(layout.Groups[1].Value),token=Int64.Parse(layout.Groups[2].Value),x0=Int64.Parse(layout.Groups[3].Value),y0=Int64.Parse(layout.Groups[4].Value),x1=Int64.Parse(layout.Groups[5].Value),y1=Int64.Parse(layout.Groups[6].Value),size=Int64.Parse(layout.Groups[7].Value),count=Int64.Parse(layout.Groups[8].Value),replacementRequested=layout.Groups[9].Value=="1",color=layout.Groups[10].Success?"#"+layout.Groups[10].Value.Substring(6,2)+layout.Groups[10].Value.Substring(4,2)+layout.Groups[10].Value.Substring(2,2):null,at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()};
    var pos=System.Text.RegularExpressions.Regex.Match(s??"",@"^ToMe_TEXTPOS engine=(\w+) line=(-?\d+) x0=(-?\d+) y0=(-?\d+) x1=(-?\d+) y1=(-?\d+) size=(-?\d+) n=(\d+)(?: token=(\d+))?");
    if(pos.Success)return new{type="hookTextPos",engine=pos.Groups[1].Value,line=Int64.Parse(pos.Groups[2].Value),x0=Int64.Parse(pos.Groups[3].Value),y0=Int64.Parse(pos.Groups[4].Value),x1=Int64.Parse(pos.Groups[5].Value),y1=Int64.Parse(pos.Groups[6].Value),size=Int64.Parse(pos.Groups[7].Value),count=Int64.Parse(pos.Groups[8].Value),token=pos.Groups[9].Success?Int64.Parse(pos.Groups[9].Value):-1,at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()};
    // Whether the new line joins the lines already on the game's page (several lines per page) or starts a new page.
    var page=System.Text.RegularExpressions.Regex.Match(s??"",@"^ToMe_PAGE engine=(\w+) line=(-?\d+) same=([01])(?: token=(\d+))?");
    if(page.Success)return new{type="hookPage",engine=page.Groups[1].Value,line=Int64.Parse(page.Groups[2].Value),same=page.Groups[3].Value=="1",token=page.Groups[4].Success?Int64.Parse(page.Groups[4].Value):-1,at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()};
    var dialog=System.Text.RegularExpressions.Regex.Match(s??"",@"^ToMe_DIALOG engine=(\w+) visible=([01])$");
    if(dialog.Success)return new{type="hookDialog",engine=dialog.Groups[1].Value,visible=dialog.Groups[2].Value=="1"};return null;
 }
 static bool EngineInfoSelfTest(){
  var mages=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(EngineInfo("ToMe_DRAWRUN engine=mages ev=clear page=0 seq=1")));
  if(Convert.ToString(mages["type"])!="hookEngineDraw"||Convert.ToString(mages["line"])!="ToMe_DRAWRUN engine=mages ev=clear page=0 seq=1"||EngineInfo("ToMe_DRAWRUN engine=yuris run=1")!=null)return false;
  var layout=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(EngineInfo("ToMe_CS2_LAYOUT line=3 token=11 x0=230 y0=160 x1=800 y1=190 size=28 n=30 hidden=1 color=ffffe2b0")));
  var p=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(EngineInfo("ToMe_TEXTPOS engine=cs2_screen_v1 line=2 x0=28 y0=43 x1=306 y1=74 size=28 n=20 token=4294967295")));
  var page=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(EngineInfo("ToMe_PAGE engine=cs2 line=2 same=1 token=4294967295")));
  var hide=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(EngineInfo("ToMe_DIALOG engine=cs2 visible=0")));
  var show=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(EngineInfo("ToMe_DIALOG engine=cs2 visible=1")));
  return Convert.ToString(layout["engine"])=="cs2_screen_v2"&&Convert.ToString(layout["color"])=="#b0e2ff"&&Convert.ToBoolean(layout["replacementRequested"])&&Convert.ToInt64(layout["y1"])==190&&Convert.ToString(p["type"])=="hookTextPos"&&Convert.ToInt64(p["token"])==4294967295L&&Convert.ToInt64(p["x1"])==306&&Convert.ToString(page["type"])=="hookPage"&&Convert.ToBoolean(page["same"])&&!Convert.ToBoolean(hide["visible"])&&Convert.ToBoolean(show["visible"])&&EngineInfo("ToMe_TEXTPOS_DUMP engine=cs2 line=1 record=1234")==null;
 }
 public static int Main(string[] args){
  Console.OutputEncoding=new System.Text.UTF8Encoding(false);Console.InputEncoding=new System.Text.UTF8Encoding(false);
  if(args.Length==1&&args[0]=="--self-test"){if(!ReaderFlushSelfTest()){Console.Error.WriteLine("FAIL reader flush for per-character streams");return 3;}if(!StreamProbeSelfTest()){Console.Error.WriteLine("FAIL fresh text-stream probe");return 3;}if(!HookTarget.LanguageSelfTest()){Console.Error.WriteLine("FAIL text language hide policy");return 3;}if(!TextPathCanary.SelfTest()){Console.Error.WriteLine("FAIL text path canary");return 3;}if(!HookSignature.SelfTest()){Console.Error.WriteLine("FAIL hook signature relocation");return 3;}if(!GpuCanarySelfTest()){Console.Error.WriteLine("FAIL gpu hide crash canary");return 3;}if(!ShortHideSelfTest()){Console.Error.WriteLine("FAIL short dialogue hide");return 3;}if(!LabelEmbedSelfTest()){Console.Error.WriteLine("FAIL label: a writable stream keeps its embed after a label line, and a short all-hiragana line the reader shows is hidden");return 3;}if(!TwinSelfTest()){Console.Error.WriteLine("FAIL japanese twins: the line or a typewriter buffer of it, a Unity text setter, at most two twins");return 3;}if(!TwinAnswerSelfTest()){Console.Error.WriteLine("FAIL japanese twin answers: left alone when not let through or the text window is hidden, three twins are cover mode for this run and four are remembered, twins off in cover mode and when another stream is selected");return 3;}if(!ChineseHideSelfTest()){Console.Error.WriteLine("FAIL Chinese hide paths");return 3;}if(!SkipSelfTest()){Console.Error.WriteLine("FAIL skip key: hide layers must stand down on every press");return 3;}if(!GlyphLeakSelfTest()){Console.Error.WriteLine("FAIL glyph pass-through leak: a cache report or a line with unblanked glyphs takes the proof back for good");return 3;}if(!GiveWaySelfTest()){Console.Error.WriteLine("FAIL hide layers give way: write-back, engine, font and GPU layer off together, proof kept, nothing counted while away");return 3;}if(!EngineAllSelfTest()){Console.Error.WriteLine("FAIL engine pass-through: one trial line while the engine hide is on, ended by an unconfirmed next line, proven by a hidden=1 confirmation");return 3;}if(!ProfileSelfTest()){Console.Error.WriteLine("FAIL profile engineTrial: a game diff turns the engine pass-through off, changes the unconfirmed count and the click window; no diff = kernel rule");return 3;}if(!GlyphAllSelfTest()){Console.Error.WriteLine("FAIL glyph pass-through: a writable stream is written back hidden until a layer is proven to hide it");return 3;}if(!Sact2SpeechSelfTest()){Console.Error.WriteLine("FAIL SACT2 dialogue context");return 3;}if(!SameHookSelfTest()){Console.Error.WriteLine("FAIL same-hook follow: a burst of old lines (LOG page) is never followed, lines paced like reading are");return 3;}if(!LearnedSelfTest()){Console.Error.WriteLine("FAIL learned verdict: a learned cannot-hide record from another bridge build is tried again");return 3;}if(!EmbedTextPolicy.GuardSelfTest()){Console.Error.WriteLine("FAIL write guard");return 3;}{string mk=EmbedTextPolicy.Mark("今日はいい天気だね。\n明日もABC？");if(mk!="・・・・・・・・・・\n・・・･･･・"){Console.Error.WriteLine("FAIL text marks: "+mk);return 3;}}if(!EmbedTextPolicy.Label("選択ライン")||!EmbedTextPolicy.Label("女中のテーマピアノソロ")||EmbedTextPolicy.Label("「はい」")||EmbedTextPolicy.Label("薄暗さは女中だけにあるのではない。"))throw new Exception("Label lines");if(!Interleaves("どうかどわうたかどくしどわうかのうわた手かくしをわたの離た手くしをさくのなし手を離いのさで手な離いをいさでて離ないくさい","どうかわたくしの手を離さないでいてくださいまし。".Replace("。",""))||Interleaves("どうかわたくしの手を離さないでいてくださいまし。","どうかわたくしの手を離さないでいてくださいまし。")||Interleaves("そうすれば、歴史の波に攫われてしまうこともありませんわ。そうすれば","そうすれば、"))throw new Exception("Interleave detection");if(!IsSharedResourceStream("EmbedLeaf")||!IsSharedResourceStream("leaf")||IsSharedResourceStream("EmbedBGI"))throw new Exception("Shared hook safety policy mismatch");foreach(var bad in new[]{"grp.pak","grp,bg001","data\\grp\\a.tga","ToneCurve","BG01"})if(IsDialogueText(bad))throw new Exception("Leaf resource string treated as dialogue: "+bad);foreach(var good in new[]{"「やっと来たね」","そうですね……","冬弥は小さく頷いた。"})if(!IsDialogueText(good))throw new Exception("Leaf dialogue rejected: "+good);if(!EmbedSourceBatch.SelfTest()||!EmbedSourceBatch.ArtemisQuoteSelfTest()||!EmbedTextPolicy.SelfTest()||IsErrorDialog("CLANNAD HD ゲームを終了しますか？ はい いいえ")||!IsErrorDialog("CLANNAD HD 名前フラグ名が短すぎます")||!IsErrorDialog("コマンドが不正です。(global)")||!IsErrorDialog("string too long"))throw new Exception("Default embed text policy mismatch");if(!EngineInfoSelfTest())throw new Exception("Engine telemetry protocol mismatch");if(!PageSelfTest())throw new Exception("Page position protocol mismatch");if(Marshal.SizeOf(typeof(ThreadParam))!=32||Marshal.OffsetOf(typeof(ThreadParam),"addr").ToInt32()!=8)throw new Exception("LunaHook ABI mismatch");if(!KrkrNoKagSelfTest())throw new Exception("KiriKiri no-KAG DrawText gate mismatch");if(!DrawSkipSelfTest())throw new Exception("KiriKiri source no-draw mismatch");if(!YurisFoldSelfTest())throw new Exception("YU-RIS glyph repeat fold mismatch");if(!LittlecheeseStartupSelfTest())return 3;Console.WriteLine("PASS LunaHook C ABI: ThreadParam 32 bytes, uint64 aligned at 8, cdecl callbacks; engine position/page/visibility protocol; no game attached");return 0;}
  if(args.Length==1&&args[0]=="--overlay-gate-self-test"){string failure=OverlayGate.SelfTest();if(failure!=""){Console.Error.WriteLine("FAIL overlay gate: "+failure);return 3;}Console.WriteLine("PASS overlay gate: a menu or focus hand-over never gives the text back to the game");return 0;}
  if(args.Length==1&&args[0]=="--output-nonblock-self-test"){string f=OutputNonblockSelfTest();if(f!=""){Console.Error.WriteLine("FAIL output nonblock: "+f);return 3;}Console.WriteLine("PASS output nonblock: Emit returns at once while MeguLit's stdout is stuck; lines arrive in order once it reads again");return 0;}
  if(args.Length==1&&args[0]=="--runtime-choice-self-test")return RuntimeChoiceSelfTest();if(args.Length==1&&args[0]=="--source-frame-self-test"){if(!HookSourceFrames.SelfTest()||!EmbedSourceBatch.SelfTest()||!EmbedSourceBatch.ArtemisQuoteSelfTest())return 3;Console.WriteLine("PASS complete source frames, fragmented frames, repeated callbacks and intentional repetition");return 0;}
  if(args.Length==1&&args[0]=="--island-policy-self-test"){
   ThreadParam t;string code="EXHSXF@3AF0:ISLAND.exe";
   if(!TryIslandThread(true,123,0x503af0,code,out t)||t.processId!=123||t.addr!=0x503af0||t.ctx!=0||t.ctx2!=1)throw new Exception("ISLAND scenario role pre-arm mismatch");
   if(TryIslandThread(false,123,0x503af0,code,out t)||TryIslandThread(true,123,0x503af1,code,out t)||TryIslandThread(true,123,0x503af0,"HS@other",out t))throw new Exception("Unverified ISLAND stream was pre-armed");
   if(!InitialReplacement(new[]{"1","2","ISLAND","3"})||InitialReplacement(new[]{"1","2","ISLAND","3","--read-only"})||!InitialReplacement(new[]{"1","2","ISLAND","3","--official-embed"}))throw new Exception("Initial replacement mode mismatch");
   Console.WriteLine("PASS ISLAND pre-arm policy: exact adapter, scenario role, fresh process, read-only and initial replacement before injection; no game attached");return 0;
  }
  ProfileFromEnv();IntPtr module=IntPtr.Zero;
  try{
   string folder=AppDomain.CurrentDomain.BaseDirectory;/* the ISLAND runtime and its hook hide the text inside the engine for the reading overlay; with the capture compositor (dot mode from spawn) ISLAND is treated as any CatSystem2 game, so the glyph dots hide the text and MeguLit can find and redraw the lines */KnownIsland=IsSupportedIsland(args)&&GlyphMode!="dot";string root=ChooseRuntime(Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..","runtime")),args.Length==4&&String.Equals(args[2],"euphoriaHD",StringComparison.OrdinalIgnoreCase),KnownIsland,IsSupportedSteinsGate(args),IsSiglusProcess(args));if(File.Exists(Path.Combine(root,"MeguLitHost64.dll")))Host="MeguLitHost64.dll";OfficialRuntime=String.Equals(Path.GetFileName(root),"hook-readonly",StringComparison.OrdinalIgnoreCase);module=Probe(root);
   if(args.Length==1&&args[0]=="--probe"){Emit(new{type="probe",available=true,exports=Exports.Length});return 0;}
   if(args.Length!=4&&!(args.Length==5&&(args[4]=="--read-only"||args[4]=="--official-embed")))throw new Exception("Expected explicitly bound game PID, window, process name and start time");ReplacementEnabled=InitialReplacement(args);Pid=UInt32.Parse(args[0]);HookTarget.Validate(Pid,args[1],args[2],args[3]);GameWindow=new IntPtr(Int64.Parse(args[1]));ProcessStarted=args[3];BoundProcess=args[2];if(KnownIsland)Emit(new{type="hookEngineFeature",framework="cs2"});WaitHook=new WaitRenderHook(Pid,args[1],BoundProcess,ProcessStarted,Emit);
   try{var saved=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Under("cache","hook-session.json")));if(Convert.ToUInt32(saved["pid"])==Pid&&Convert.ToString(saved["started"])==ProcessStarted)Resume=saved;}catch{}
    /* E520 (user: a game that embedded before must replace its very first line after a restart): the memory is loaded in read-only starts too (the reader starts read-only while it decides whether to pre-check the screen) and announced, so the reader skips its warm-up and switches replacement on before the first line */if(Resume==null)try{string mf=MemoryFile();if(mf!=""&&File.Exists(mf)){Resume=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(mf));FromMemory=true;RememberedCode=Convert.ToString(Resume["code"])??"";Diagnostic("stream memory loaded "+Convert.ToString(Resume["name"])+" "+Convert.ToString(Resume["code"]));Emit(new{type="hookMemory",name=Convert.ToString(Resume["name"]),code=Convert.ToString(Resume["code"])});}}catch{Resume=null;FromMemory=false;}if(Resume==null&&!FromMemory)CrossMemory=OtherBuildMemory();
   if(KnownIsland&&Resume!=null&&(Convert.ToString(Resume["name"])!="EmbedToMeCS2_DrawPreserve"||Convert.ToString(Resume["addr"])!="503af0"||Convert.ToString(Resume["ctx"])!="0"||Convert.ToString(Resume["ctx2"])!="1"))Resume=null;
   if(MagesAddress!=0&&Resume!=null&&Convert.ToString(Resume["name"] )!="EmbedMAGES_SteinsGate")Resume=null;
   IntPtr process=OpenProcess(0x1000,false,Pid);if(process==IntPtr.Zero)throw new Exception("无法读取绑定游戏的位数");bool wow;try{if(!IsWow64Process(process,out wow))throw new Exception("无法识别游戏位数");}finally{CloseHandle(process);}string bit=Environment.Is64BitOperatingSystem&&!wow?"64":"32";
   string hook=File.Exists(Path.Combine(root,"MeguLitHook"+bit+".dll"))?Path.Combine(root,"MeguLitHook"+bit+".dll"):Path.Combine(root,"LunaHook"+bit+".dll"),loader=Path.Combine(folder,"HookInjector"+bit+".exe");if(!File.Exists(hook)||!File.Exists(loader))throw new Exception("缺少当前游戏所需的 LunaHook"+bit+".dll 或注入组件");
   FlushDiagnostics();try{string diagnostic=Under("logs","hook-diagnostics.log");if(File.Exists(diagnostic)){string archived=Under("logs","hook-diagnostics-"+DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff")+".log");File.Move(diagnostic,archived);}}catch{}Diagnostic("runtime "+root);
   ProcessEvent connected=OnConnect,disconnected=OnDisconnect;CreateEvent create=OnCreate;DestroyEvent destroy=OnDestroy;OutputEvent output=OnOutput;InfoEvent info=(t,s)=>{Diagnostic("info "+t+" "+s);if(t==4&&(s??"").IndexOf("unity",StringComparison.OrdinalIgnoreCase)>=0)UseUnityFont();var match=System.Text.RegularExpressions.Regex.Match(s??"",@"(?:Euphoria474_DRAW skip|ToMeSG_EMBED cleared) #(\d+)");if(match.Success)Emit(new{type="hookRender",count=Int64.Parse(match.Groups[1].Value),at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()});
    // Where the game draws the current line, in the engine's own units (ToMeTextPos.h); MeguLit maps it to the screen.
    var engineInfo=EngineInfo(s);if(engineInfo!=null)Emit(engineInfo);if((s??"").StartsWith("MeguLit_GDIHIDE hit",StringComparison.Ordinal))GdiHideHit(s.Substring(20));if((s??"").StartsWith("MeguLit_MARKS hit",StringComparison.Ordinal))MarksHit(s.Substring(18));if((s??"").StartsWith("MeguLit_DRAWSKIP ready",StringComparison.Ordinal))DrawSkipReady(s);if((s??"").StartsWith("MeguLit_DRAWSKIP hit",StringComparison.Ordinal))DrawSkipHit(s);};InsertEvent insert=OnInsert;EmbedEvent embed=OnEmbed;QueryEvent query=s=>IntPtr.Zero;GameEvent game=(i,t,v)=>{};Keep.AddRange(new Delegate[]{connected,disconnected,create,destroy,output,info,insert,embed,query,game});
   if(GenericHookStart())WaitStartupSettled(Pid);
   Luna_Settings(180,Codepage,4000,4000,false);Luna_Start(connected,disconnected,create,destroy,output,info,insert,embed,query,game);QuickVanishCheck();Started=true;SessionStart=DateTime.UtcNow;Luna_ConnectProcess(Pid);Emit(new{type="hookProcess",path=HookTarget.ExePath});
   GameStart=args.Length>3?args[3]:"";Reattach=!Luna_CheckIfNeedInject(Pid);if(Reattach){Diagnostic("reattach: LunaHook already in this process");/* the DLL can connect before this line (OnConnect then saw Reattach unset): run it here too, ReattachDone keeps it once */if(Connected)ReattachHooks();}if(!Reattach){var start=new ProcessStartInfo(loader,Pid+" "+args[1]+" \""+args[2]+"\" "+args[3]+" \""+hook+"\""){UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true};using(var child=Process.Start(start)){/* #468 (寒蝉 rig: injection into a Unity game still starting took over 12 s; the bridge was silent, MeguLit ended it mid-handshake and the DLL never connected again): a heartbeat every second while the loader works (alive, not attached), 45 s before giving up, and the time it took in the log */var injectAt=DateTime.UtcNow;while(!child.WaitForExit(1000)){Emit(new{type="hookHeartbeat",phase="injecting"});if((DateTime.UtcNow-injectAt).TotalSeconds>45)throw new Exception("LunaHook 加载超时");}Diagnostic("inject took "+(int)(DateTime.UtcNow-injectAt).TotalMilliseconds+" ms");if(child.ExitCode!=0)throw new Exception("LunaHook 加载失败："+child.StandardError.ReadToEnd().Trim());}}
   try{if(GameProcess==null)GameProcess=Process.GetProcessById((int)Pid);}catch{}try{string mp=MemoryPath();if(mp!="")LoadReaderTypewriters(mp);if(mp!="")TextPathCanary.Init(Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(mp)),"text-paths",Path.GetFileName(mp)));}catch(Exception e){Diagnostic("text path canary "+e.Message);}
   PreArmSignature();
   KrkrText(bit,loader,args);
   RenpyText(bit,loader,args);
   FontProbe(bit,loader,args);
   GpuHide(bit,loader,args);
   ScnCapture(bit,loader,args);
   RuntimeDump(bit,loader,args);
   new Thread(Input){IsBackground=true}.Start();DateTime until=DateTime.UtcNow.AddSeconds(15);while(!Quit){if(!Connected&&DateTime.UtcNow>until)throw new Exception("LunaHook 未连接当前游戏");if(WaitHook!=null)WaitHook.Tick();Heartbeat();SyncEmbedGeneration();Thread.Sleep(40);}return 0;
  }catch(Exception e){Emit(new{type="hookError",hookActive=false,hookMessage=e.Message});return 1;}
  finally{if(WaitHook!=null)WaitHook.Dispose();if(Started){try{QuickVanishNote();}catch{}try{Deactivate("bridge-shutdown");Luna_DetachProcess(Pid);}catch{}}GC.KeepAlive(Keep);/* Keep loaded native code alive until process exit: native worker callbacks may still be returning. */}
 }
}

/* E472: is MeguLit's reading layer actually on screen above the game? 1 yes, 0 no, -1 unknown (game minimised or gone: keep
   the current state). A visible, uncloaked MeguLit top-level window that covers at least a quarter of the game and sits
   above the game's top-level window in z-order. Windows reports any monitor-covering Direct3D window as "D3D fullscreen"
   (ファタモルガーナの館 borderless, MeguLit shown over it), so that only names the reason; the z-order decides. */
static class OverlayGate {
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] static extern IntPtr GetTopWindow(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h,uint cmd);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Box r);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h,int attribute,out int value,int size);
 [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
 [StructLayout(LayoutKind.Sequential)] struct Box {public int l,t,r,b;}
 static readonly Dictionary<uint,bool> Ours=new Dictionary<uint,bool>();
 static bool IsOurs(uint pid){bool v;if(Ours.TryGetValue(pid,out v))return v;try{using(var p=Process.GetProcessById((int)pid))v=p.ProcessName.StartsWith("MeguLit",StringComparison.OrdinalIgnoreCase);}catch{v=false;}if(Ours.Count>512)Ours.Clear();Ours[pid]=v;return v;}
 /* samples every 200 ms. Shown: 3 in a row (0.6 s). Lost: LostSamples in a row (1.6 s); unknown (-1) keeps everything. */
 public const int ShownSamples=3,LostSamples=8;
 /* 2026-11-19 (user, 千恋＊万花: "有时候原文还是会出来一下"): the reading layer left because the game's text window was gone (a staged pause,
    a scene change; the front end says so with dialogAway). After 1.6 s the text went back to the game, the next line was drawn by the
    game and stayed visible until the layer had been back for 0.6 s. A layer that is away with the text window has nothing to give
    back: those samples are unknown, the hide stays as it is. Every other absence (another program in front, a fullscreen game above
    the layer, a skip) is counted as before. */
 public static volatile bool DialogAway;
 public static int Seen(int seen){return seen==0&&DialogAway?-1:seen;}
 public static bool Track(bool over,ref int ok,ref int bad,int seen){
  if(seen==1){bad=0;if(++ok>=ShownSamples)over=true;}
  else if(seen==0){ok=0;if(++bad>=LostSamples)over=false;}
  return over;}
 public static string SelfTest(){
  int ok=0,bad=0;bool over=false;
  for(int i=0;i<2;i++)over=Track(over,ref ok,ref bad,1);if(over)return "hidden before the layer was seen for 0.6 s";
  over=Track(over,ref ok,ref bad,1);if(!over)return "not hidden after 0.6 s";
  /* recorded 2026-11-19 15:00: the layer under the game for up to 1.4 s around a menu close, in every position of the 200 ms samples */
  for(int gap=1;gap<LostSamples;gap++){for(int i=0;i<gap;i++){over=Track(over,ref ok,ref bad,0);if(!over)return "text given back after "+((i+1)*200)+" ms";}over=Track(over,ref ok,ref bad,1);if(!over)return "lost on return";}
  /* unknown samples (game minimised) neither count nor reset */
  for(int i=0;i<40;i++)over=Track(over,ref ok,ref bad,-1);if(!over)return "unknown samples gave the text back";
  var random=new Random(1119);for(int run=0;run<2000;run++){ok=0;bad=0;over=true;int zeros=0;for(int step=0;step<60;step++){int seen=random.Next(3)-1;zeros=seen==0?zeros+1:seen==1?0:zeros;over=Track(over,ref ok,ref bad,seen);if(!over&&zeros<LostSamples&&zeros>0)return "random: given back after "+zeros+" lost samples";if(!over){over=true;ok=0;bad=0;zeros=0;}}}
  /* recorded 2026-11-19 11:20:44-47Z: the layer away for 3.1 s with the game's text window; the hide holds, and it holds for a minute too */
  {bool keep=DialogAway;try{DialogAway=true;ok=0;bad=0;over=true;for(int i=0;i<300;i++){over=Track(over,ref ok,ref bad,Seen(0));if(!over)return "text given back while the text window was away ("+((i+1)*200)+" ms)";}
    if(Seen(1)!=1||Seen(-1)!=-1)return "a seen layer must stay seen";
    DialogAway=false;if(Seen(0)!=0)return "an absence for another reason must count";}finally{DialogAway=keep;}}
  /* really gone (fullscreen game above the layer, E472): the game draws again after 1.6 s */
  ok=0;bad=0;over=true;for(int i=0;i<LostSamples;i++)over=Track(over,ref ok,ref bad,0);if(over)return "never given back";
  return "";}
 public static int Check(IntPtr game,out string why){
  why="";try{
   IntPtr root=GetAncestor(game,2);if(root==IntPtr.Zero||!IsWindow(root)||IsIconic(root))return -1;
   Box g;if(!GetWindowRect(root,out g)||g.r<=g.l||g.b<=g.t)return -1;long area=(long)(g.r-g.l)*(g.b-g.t);
   int steps=0;for(IntPtr h=GetTopWindow(IntPtr.Zero);h!=IntPtr.Zero&&h!=root&&steps<4000;h=GetWindow(h,2),steps++){
    if(!IsWindowVisible(h)||IsIconic(h))continue;uint pid;GetWindowThreadProcessId(h,out pid);if(pid==0||!IsOurs(pid))continue;
    int cloaked;if(DwmGetWindowAttribute(h,14,out cloaked,4)==0&&cloaked!=0)continue;
    Box w;if(!GetWindowRect(h,out w))continue;long x=Math.Max(0,(long)Math.Min(w.r,g.r)-Math.Max(w.l,g.l)),y=Math.Max(0,(long)Math.Min(w.b,g.b)-Math.Max(w.t,g.t));
    if(x*y*4>=area)return 1;}
   int q;why=SHQueryUserNotificationState(out q)==0&&q==3?"fullscreen game above MeguLit's reading layer":"MeguLit's reading layer is not shown above the game";return 0;
  }catch(Exception e){why=e.Message;return -1;}
 }
}
