// SPDX-License-Identifier: GPL-3.0-or-later
// Engine-independent hook relocation (first line replaced after a restart, game update, ASLR or another build).
// A stream that replaced text is remembered as module name + module-relative offset + a byte signature of the code
// around the hook point, with wildcards over bytes that move between builds (call/jump targets, absolute and
// RIP-relative operands). On the next launch the module is found by name, the signature checked at the old offset,
// then searched across the module image; one unique match gives the new address, and the remembered hook code is
// rewritten to it and inserted before the game shows its first line. No match: the existing automatic search runs and
// the signature is written again for this build once the stream replaces text.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

static class HookSignature{
 public const int Before=16,After=48;
 public sealed class Module{public string Name;public ulong Base;public uint Size;}
 public sealed class Signature{public string Module;public ulong Offset;public string Pattern;public int Lead;}
 // ---- pattern building: bytes that differ between builds of the same function become ?? ----
 public static bool[] Wild(byte[] b,bool x64){var w=new bool[b.Length];
  for(int i=0;i<b.Length;i++){int op=b[i],n=-1;
   if(op==0xE8||op==0xE9)n=i+1;                                         // call/jmp rel32
   else if(op==0x0F&&i+1<b.Length&&(b[i+1]&0xF0)==0x80)n=i+2;           // jcc rel32
   else if(op==0x68)n=i+1;                                              // push imm32 (often an address)
   else if(!x64&&op>=0xB8&&op<=0xBF)n=i+1;                               // mov r32,imm32 (address in 32-bit code)
   else if(op==0xA1||op==0xA3)n=i+1;                                    // mov eax,[abs] / mov [abs],eax
   else if(i+1<b.Length&&IsModRmOp(op)&&(b[i+1]&0xC7)==0x05)n=i+2;      // [disp32] (x86) / [rip+disp32] (x64)
   if(n>0)for(int k=n;k<n+4&&k<b.Length;k++)w[k]=true;}
  return w;}
 static bool IsModRmOp(int op){return op==0x8B||op==0x89||op==0x8D||op==0x8A||op==0x88||op==0x3B||op==0x39||op==0x03||op==0x2B||op==0x33||op==0x0B||op==0x23||op==0x85||op==0xFF||op==0xC7||op==0x83||op==0x81||op==0x80||op==0xC6||op==0x38||op==0x3A;}
 public static string Format(byte[] b,bool[] w){var s=new StringBuilder();for(int i=0;i<b.Length;i++){if(i>0)s.Append(' ');s.Append(w[i]?"??":b[i].ToString("X2"));}return s.ToString();}
 public static int[] Parse(string pattern){var parts=(pattern??"").Split(new[]{' '},StringSplitOptions.RemoveEmptyEntries);var r=new int[parts.Length];for(int i=0;i<parts.Length;i++)r[i]=parts[i]=="??"?-1:Convert.ToInt32(parts[i],16);return r;}
 public static bool At(byte[] image,int pos,int[] p){if(pos<0||pos+p.Length>image.Length)return false;for(int i=0;i<p.Length;i++)if(p[i]>=0&&image[pos+i]!=p[i])return false;return true;}
 // All positions where the pattern matches (at most limit). A pattern with too few fixed bytes never matches.
 public static List<int> Find(byte[] image,int[] p,int limit){var hits=new List<int>();int fixedBytes=0,first=-1;for(int i=0;i<p.Length;i++)if(p[i]>=0){fixedBytes++;if(first<0)first=i;}
  if(fixedBytes<12||first<0)return hits;byte f=(byte)p[first];
  for(int i=first;i<=image.Length-p.Length+first;i++){if(image[i]!=f)continue;int pos=i-first;if(At(image,pos,p)){hits.Add(pos);if(hits.Count>=limit)break;}}
  return hits;}
 // Build the signature from the module image and the hook offset: the window grows until it is unique in this image.
 public static Signature Build(string module,byte[] image,ulong offset,bool x64){if(offset>=(ulong)image.Length)return null;int o=(int)offset;
  /* the code from the hook point on first (the bytes before it belong to the previous function, which changes between builds); the lead-in only when needed for uniqueness */foreach(int grow in new[]{1,2,4,-1,-2}){int lead=grow>0?0:Math.Min(Before*-grow,o),len=Math.Min(lead+After*Math.Abs(grow),image.Length-o+lead);var b=new byte[len];Array.Copy(image,o-lead,b,0,len);string pat=Format(b,Wild(b,x64));
   var hits=Find(image,Parse(pat),2);if(hits.Count==1&&hits[0]==o-lead)return new Signature{Module=module,Offset=offset,Pattern=pat,Lead=lead};}
  return null;}
 // New module offset of the hook: the old offset when the signature still matches there, else a unique match.
 public static long Locate(byte[] image,Signature s){if(s==null||image==null)return -1;var p=Parse(s.Pattern);if(p.Length==0)return -1;
  long old=(long)s.Offset-s.Lead;if(old>=0&&old<=int.MaxValue&&At(image,(int)old,p))return (long)s.Offset;
  var hits=Find(image,p,2);return hits.Count==1?hits[0]+s.Lead:-1;}
 // Hook code addresses: "...@<hex>:<module>" is module-relative, "...@<hex>" alone absolute.
 public static string Rewrite(string code,ulong oldAddr,ulong oldOffset,ulong newAddr,ulong newOffset){if(String.IsNullOrEmpty(code))return null;
  var m=Regex.Match(code,"@([0-9A-Fa-f]+)(:[^:@]+)?(?=$|:)");if(!m.Success)return null;ulong v;try{v=Convert.ToUInt64(m.Groups[1].Value,16);}catch{return null;}
  string next;if(m.Groups[2].Success&&v==oldOffset)next=newOffset.ToString("X");else if(!m.Groups[2].Success&&v==oldAddr)next=newAddr.ToString("X");else if(v==oldOffset)next=newOffset.ToString("X");else return null;
  return code.Substring(0,m.Groups[1].Index)+next+code.Substring(m.Groups[1].Index+m.Groups[1].Length);}
 // ---- live process access ----
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct MODULEENTRY32W{public uint dwSize,th32ModuleID,th32ProcessID,GlblcntUsage,ProccntUsage;public IntPtr modBaseAddr;public uint modBaseSize;public IntPtr hModule;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=256)]public string szModule;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string szExePath;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Module32FirstW(IntPtr snap,ref MODULEENTRY32W e);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Module32NextW(IntPtr snap,ref MODULEENTRY32W e);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr p,IntPtr addr,byte[] buf,IntPtr size,out IntPtr read);
 [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr p,out bool wow);
 public static List<Module> Modules(uint pid){var r=new List<Module>();for(int attempt=0;attempt<5&&r.Count==0;attempt++){IntPtr snap=CreateToolhelp32Snapshot(0x18,pid);if(snap==new IntPtr(-1)){System.Threading.Thread.Sleep(30);continue;}
   try{var e=new MODULEENTRY32W{dwSize=(uint)Marshal.SizeOf(typeof(MODULEENTRY32W))};if(Module32FirstW(snap,ref e))do r.Add(new Module{Name=e.szModule,Base=(ulong)e.modBaseAddr.ToInt64(),Size=e.modBaseSize});while(Module32NextW(snap,ref e));}finally{CloseHandle(snap);}}
  return r;}
 public static bool Is64(uint pid){IntPtr h=OpenProcess(0x1000,false,pid);if(h==IntPtr.Zero)return true;try{bool wow;return Environment.Is64BitOperatingSystem&&IsWow64Process(h,out wow)&&!wow;}finally{CloseHandle(h);}}
 // Reads the module image page by page; unreadable pages stay zero (never match fixed bytes).
 public static byte[] Image(uint pid,Module m){if(m==null||m.Size==0||m.Size>512u*1024*1024)return null;IntPtr h=OpenProcess(0x0410,false,pid);if(h==IntPtr.Zero)return null;
  try{var image=new byte[m.Size];var page=new byte[0x1000];for(uint at=0;at<m.Size;at+=0x1000){uint n=Math.Min(0x1000u,m.Size-at);IntPtr read;if(ReadProcessMemory(h,new IntPtr((long)(m.Base+at)),page,new IntPtr(n),out read))Array.Copy(page,0,image,at,(int)read.ToInt64());}return image;}finally{CloseHandle(h);}}
 public static Module Containing(List<Module> mods,ulong addr){foreach(var m in mods)if(addr>=m.Base&&addr<m.Base+m.Size)return m;return null;}
 public static Module Named(List<Module> mods,string name){foreach(var m in mods)if(String.Equals(m.Name,name,StringComparison.OrdinalIgnoreCase))return m;return null;}
 public static Signature Capture(uint pid,ulong addr){var mods=Modules(pid);var m=Containing(mods,addr);if(m==null)return null;var image=Image(pid,m);return image==null?null:Build(m.Name,image,addr-m.Base,Is64(pid));}
 // Absolute new address of the remembered hook in the running process, or 0.
 public static ulong Relocate(uint pid,Signature s,out ulong newOffset){newOffset=0;if(s==null)return 0;var m=Named(Modules(pid),s.Module);if(m==null)return 0;long o=Locate(Image(pid,m),s);if(o<0)return 0;newOffset=(ulong)o;return m.Base+(ulong)o;}
 public static Signature FromMemory(Dictionary<string,object> d){try{object v;if(d==null||!d.TryGetValue("sigModule",out v))return null;return new Signature{Module=Convert.ToString(v),Offset=Convert.ToUInt64(Convert.ToString(d["sigOffset"]),16),Pattern=Convert.ToString(d["sigPattern"]),Lead=Convert.ToInt32(d["sigLead"])};}catch{return null;}}
 // ---- self test on synthetic builds (no process): function moved, call targets and an absolute operand changed ----
 public static bool SelfTest(){var rnd=new Random(7);Func<int,byte[]> noise=n=>{var b=new byte[n];rnd.NextBytes(b);return b;};
  byte[] fn={0x55,0x8B,0xEC,0x83,0xEC,0x10,0x53,0x56,0x57,0x8B,0x7D,0x08,0xE8,1,2,3,4,0x68,0x10,0x20,0x40,0x00,0x8B,0x0D,0x44,0x33,0x22,0x11,0x85,0xC9,0x0F,0x84,9,9,0,0,0x8B,0x45,0x0C,0x50,0x57,0xFF,0x15,0x10,0x10,0x40,0x00,0x83,0xC4,0x08,0x5F,0x5E,0x5B,0x8B,0xE5,0x5D,0xC3,0xCC,0xCC,0xCC,0xCC,0xCC,0xCC,0xCC,0x56,0x57};
  Func<int,byte[],byte[]> build=(pad,f)=>{var a=noise(pad);var z=noise(8192);var r=new byte[pad+f.Length+z.Length];Array.Copy(a,r,pad);Array.Copy(f,0,r,pad,f.Length);Array.Copy(z,0,r,pad+f.Length,z.Length);return r;};
  var v1=build(4096,fn);var f2=(byte[])fn.Clone();f2[13]=0x77;f2[18]=0x30;f2[24]=0x55;f2[33]=0x12;f2[44]=0x60;var v2=build(6000,f2);
  var s=Build("game.exe",v1,4096+6,false);if(s==null||Locate(v1,s)!=4096+6||Locate(v2,s)!=6000+6)return false;
  var v3=build(4096,new byte[fn.Length]);if(Locate(v3,s)!=-1)return false;
  if(Rewrite("EHS-4@1006:game.exe",0x401006,0x1006,0x501770,0x1776)!="EHS-4@1776:game.exe")return false;
  if(Rewrite("HB8@401006",0x401006,0x1006,0x401776,0x1776)!="HB8@401776")return false;
  if(Rewrite("HQ@0:game.exe:fn",0,0x10,0,0x20)!=null)return false;
  return true;}
}
