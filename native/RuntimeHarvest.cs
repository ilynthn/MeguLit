// SPDX-License-Identifier: GPL-3.0-or-later
// E596 runtime harvest reader (user 2026-11-14: what only exists while the game runs — decrypt keys, the unpacked archive
// index, decoded script structure — so engines the offline probe cannot crack become solvable).
//
// Read-only by construction: the game is opened with PROCESS_QUERY_INFORMATION | PROCESS_VM_READ | SYNCHRONIZE and no
// other right, so this process cannot write to it, allocate in it, start a thread in it or suspend it. Nothing is
// injected; the game keeps running untouched. Its memory is streamed to stdout for services/runtime-harvest.cjs, which
// analyses it in memory, keeps only structure (keys, parameters, offsets, layouts) and drops the bytes. Nothing is
// written to disk here.
//
// Budgeted and cancellable: --budget-mb caps the bytes read, --seconds the wall time, reads go in 1 MiB chunks at idle
// priority with a yield between chunks; closing stdout (the service killing or abandoning the read) ends it at the next
// chunk; the game exiting ends it too. Any failure ends the read quietly with a summary frame; nothing is retried.
//
// Usage: RuntimeHarvest.exe --pid <n> [--budget-mb 512] [--seconds 60] [--max-region-mb 64]
//        RuntimeHarvest.exe --self-test           reads its own process, prints ok
// Output: one JSON line {v,pid,bits,modules:[{name,base,size}],regions:[{base,size,protect,type}]}, then frames
//   "MLRH" u8 kind, 3 zero bytes, u64 address, u32 length, u32 region index, <length bytes>
//   kind 1 = memory, kind 2 = summary JSON {read,regions,ms,stop}. Addresses are hex strings in the JSON.
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class RuntimeHarvest {
 [StructLayout(LayoutKind.Sequential)] struct MBI{public IntPtr BaseAddress,AllocationBase;public uint AllocationProtect;public IntPtr RegionSize;public uint State,Protect,Type;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct MODULEENTRY32W{public uint dwSize,th32ModuleID,th32ProcessID,GlblcntUsage,ProccntUsage;public IntPtr modBaseAddr;public uint modBaseSize;public IntPtr hModule;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=256)]public string szModule;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string szExePath;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr p,IntPtr addr,byte[] buf,IntPtr size,out IntPtr read);
 [DllImport("kernel32.dll")] static extern IntPtr VirtualQueryEx(IntPtr p,IntPtr addr,out MBI info,IntPtr size);
 [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr p,out bool wow);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint ms);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Module32FirstW(IntPtr snap,ref MODULEENTRY32W e);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Module32NextW(IntPtr snap,ref MODULEENTRY32W e);
 // The only rights asked for: query, read, wait. No PROCESS_VM_WRITE / VM_OPERATION / CREATE_THREAD / SUSPEND_RESUME.
 const uint READ_ONLY_RIGHTS=0x0400|0x0010|0x00100000;
 const uint MEM_COMMIT=0x1000,MEM_IMAGE=0x1000000,MEM_MAPPED=0x40000,MEM_PRIVATE=0x20000,PAGE_GUARD=0x100,PAGE_NOACCESS=1;
 const int CHUNK=1<<20;
 class Region{public ulong Base,Size;public uint Protect,Type;public int Index;}
 class Module{public string Name;public ulong Base,Size;}

 static bool Readable(uint protect){if((protect&PAGE_GUARD)!=0||(protect&PAGE_NOACCESS)!=0||protect==0)return false;return (protect&(0x02|0x04|0x08|0x20|0x40|0x80))!=0;}
 static string Hex(ulong v){return "0x"+v.ToString("x");}
 static string Json(string s){var b=new StringBuilder("\"");foreach(char c in s){if(c=='"'||c=='\\')b.Append('\\').Append(c);else if(c<0x20)b.Append("\\u").Append(((int)c).ToString("x4"));else b.Append(c);}return b.Append('"').ToString();}

 static List<Module> Modules(uint pid){var list=new List<Module>();
  for(int attempt=0;attempt<3&&list.Count==0;attempt++){IntPtr snap=CreateToolhelp32Snapshot(0x08|0x10,pid);if(snap==IntPtr.Zero||snap==new IntPtr(-1)){Thread.Sleep(50);continue;}
   try{var e=new MODULEENTRY32W();e.dwSize=(uint)Marshal.SizeOf(typeof(MODULEENTRY32W));if(Module32FirstW(snap,ref e))do{list.Add(new Module{Name=e.szModule??"",Base=(ulong)e.modBaseAddr.ToInt64(),Size=e.modBaseSize});}while(list.Count<4096&&Module32NextW(snap,ref e));}
   finally{CloseHandle(snap);}}
  return list;}
 static List<Region> Regions(IntPtr h,ulong maxRegion){var list=new List<Region>();ulong at=0x10000;int size=Marshal.SizeOf(typeof(MBI));
  while(list.Count<50000){MBI m;if(VirtualQueryEx(h,new IntPtr((long)at),out m,new IntPtr(size))==IntPtr.Zero)break;
   ulong b=(ulong)m.BaseAddress.ToInt64(),s=(ulong)m.RegionSize.ToInt64();if(s==0)break;
   if(m.State==MEM_COMMIT&&Readable(m.Protect)&&!(m.Type==MEM_MAPPED&&s>(16UL<<20)))list.Add(new Region{Base=b,Size=Math.Min(s,maxRegion),Protect=m.Protect,Type=m.Type});
   ulong next=b+s;if(next<=at)break;at=next;}
  // Module images first (static keys, tables, dispatch tables, the pointers that locate heap objects again), then the
  // private heap from small to large (key schedules and index tables are small allocations), then small file views.
  list.Sort((x,y)=>{int rx=x.Type==MEM_IMAGE?0:x.Type==MEM_PRIVATE?1:2,ry=y.Type==MEM_IMAGE?0:y.Type==MEM_PRIVATE?1:2;if(rx!=ry)return rx-ry;if(rx==0)return x.Base.CompareTo(y.Base);return x.Size.CompareTo(y.Size);});
  for(int i=0;i<list.Count;i++)list[i].Index=i;return list;}

 static void Frame(Stream o,byte kind,ulong address,int index,byte[] data,int length){
  var head=new byte[24];head[0]=(byte)'M';head[1]=(byte)'L';head[2]=(byte)'R';head[3]=(byte)'H';head[4]=kind;
  BitConverter.GetBytes(address).CopyTo(head,8);BitConverter.GetBytes((uint)length).CopyTo(head,16);BitConverter.GetBytes((uint)index).CopyTo(head,20);
  o.Write(head,0,24);if(length>0)o.Write(data,0,length);}

 public static int Main(string[] args){
  if(args.Length==1&&args[0]=="--self-test")return SelfTest();
  uint pid=0;long budget=512L<<20;int seconds=60;ulong maxRegion=64UL<<20;
  for(int i=0;i+1<args.Length;i+=2){
   if(args[i]=="--pid")pid=UInt32.Parse(args[i+1]);
   else if(args[i]=="--budget-mb")budget=Math.Max(1,Math.Min(4096,Int64.Parse(args[i+1])))<<20;
   else if(args[i]=="--seconds")seconds=Math.Max(1,Math.Min(600,Int32.Parse(args[i+1])));
   else if(args[i]=="--max-region-mb")maxRegion=(ulong)Math.Max(1,Math.Min(512,Int32.Parse(args[i+1])))<<20;}
  if(pid==0)return 2;
  try{Process.GetCurrentProcess().PriorityClass=ProcessPriorityClass.Idle;}catch{}
  return Harvest(pid,budget,seconds,maxRegion,Console.OpenStandardOutput());}

 static int Harvest(uint pid,long budget,int seconds,ulong maxRegion,Stream output){
  var o=new BufferedStream(output,1<<16);var clock=Stopwatch.StartNew();long read=0;int done=0;string stop="done";
  IntPtr h=OpenProcess(READ_ONLY_RIGHTS,false,pid);
  if(h==IntPtr.Zero){try{var none=Encoding.UTF8.GetBytes("{\"v\":1,\"pid\":"+pid+",\"error\":\"OPEN\"}\n");o.Write(none,0,none.Length);o.Flush();}catch{}return 1;}
  try{
   bool wow;int bits=IsWow64Process(h,out wow)&&wow?32:64;
   var modules=Modules(pid);var regions=Regions(h,maxRegion);
   var head=new StringBuilder("{\"v\":1,\"pid\":").Append(pid).Append(",\"bits\":").Append(bits).Append(",\"modules\":[");
   for(int i=0;i<modules.Count;i++){if(i>0)head.Append(',');head.Append("{\"name\":").Append(Json(modules[i].Name)).Append(",\"base\":\"").Append(Hex(modules[i].Base)).Append("\",\"size\":").Append(modules[i].Size).Append('}');}
   head.Append("],\"regions\":[");
   for(int i=0;i<regions.Count;i++){if(i>0)head.Append(',');head.Append("{\"base\":\"").Append(Hex(regions[i].Base)).Append("\",\"size\":").Append(regions[i].Size).Append(",\"protect\":").Append(regions[i].Protect).Append(",\"type\":").Append(regions[i].Type).Append('}');}
   head.Append("]}\n");var hb=Encoding.UTF8.GetBytes(head.ToString());o.Write(hb,0,hb.Length);
   var buf=new byte[CHUNK];
   foreach(var r in regions){
    for(ulong at=r.Base;at<r.Base+r.Size;at+=(ulong)CHUNK){
     if(read>=budget){stop="budget";goto end;}
     if(clock.Elapsed.TotalSeconds>=seconds){stop="time";goto end;}
     if(WaitForSingleObject(h,0)==0){stop="exited";goto end;}
     int want=(int)Math.Min((ulong)CHUNK,r.Base+r.Size-at);IntPtr got;
     // A page freed between the query and the read fails the read: the chunk is skipped, never retried.
     if(!ReadProcessMemory(h,new IntPtr((long)at),buf,new IntPtr(want),out got)||got.ToInt64()<=0)continue;
     int n=(int)got.ToInt64();Frame(o,1,at,r.Index,buf,n);read+=n;
     Thread.Sleep(read%(16L<<20)<CHUNK?1:0);}
    done++;}
   end:;
  }catch(IOException){stop="closed";return 0;}
  catch{stop="failed";}
  finally{CloseHandle(h);}
  try{var s=Encoding.UTF8.GetBytes("{\"read\":"+read+",\"regions\":"+done+",\"ms\":"+clock.ElapsedMilliseconds+",\"stop\":\""+stop+"\"}");Frame(o,2,0,0,s,s.Length);o.Flush();}catch{}
  return 0;}

 static int SelfTest(){
  // Reads its own memory into a sink and checks the stream shape: header line, memory frames, the summary frame.
  var marker=Encoding.ASCII.GetBytes("MEGULIT-RUNTIME-HARVEST-SELFTEST-MARKER");var keep=new byte[4096];Array.Copy(marker,0,keep,100,marker.Length);
  var ms=new MemoryStream();Harvest((uint)Process.GetCurrentProcess().Id,1024L<<20,30,256UL<<20,ms);
  var all=ms.ToArray();int nl=Array.IndexOf(all,(byte)'\n');bool header=nl>0&&all[0]=='{';bool found=false,summary=false;
  for(int p=nl+1;p+24<=all.Length;){if(all[p]!='M'||all[p+1]!='L'||all[p+2]!='R'||all[p+3]!='H')break;int len=BitConverter.ToInt32(all,p+16);
   if(all[p+4]==2)summary=true;if(all[p+4]==1&&!found){for(int i=p+24;i+marker.Length<=p+24+len&&!found;i++){int k=0;while(k<marker.Length&&all[i+k]==marker[k])k++;if(k==marker.Length)found=true;}}p+=24+len;}
  GC.KeepAlive(keep);Console.WriteLine(header&&found&&summary?"ok":"failed");return header&&found&&summary?0:1;}
}
