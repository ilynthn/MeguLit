// Test harness only (never shipped): capture a hook signature in mock game A, relocate it in mock game B.
using System;
static class Harness{
 static long Exact(byte[] img,byte[] f){for(int i=0;i+f.Length<=img.Length;i++){int k=0;while(k<f.Length&&img[i+k]==f[k])k++;if(k==f.Length)return i;}return -1;}
 static byte[] Hex(string s){var b=new byte[s.Length/2];for(int i=0;i<b.Length;i++)b[i]=Convert.ToByte(s.Substring(i*2,2),16);return b;}
 static int Main(string[] a){uint pa=UInt32.Parse(a[0]),pb=UInt32.Parse(a[1]);byte[] fa=Hex(a[2]),fb=Hex(a[3]);string mod=a[4];int hookAt=Int32.Parse(a[5]);
  var ma=HookSignature.Named(HookSignature.Modules(pa),mod);var mb=HookSignature.Named(HookSignature.Modules(pb),mod);if(ma==null||mb==null){Console.WriteLine("{\"error\":\"module\"}");return 2;}
  long ra=Exact(HookSignature.Image(pa,ma),fa),rb=Exact(HookSignature.Image(pb,mb),fb);if(ra<0||rb<0){Console.WriteLine("{\"error\":\"blob\"}");return 2;}
  ulong addrA=ma.Base+(ulong)ra+(ulong)hookAt;var sig=HookSignature.Capture(pa,addrA);if(sig==null){Console.WriteLine("{\"error\":\"capture\"}");return 2;}
  ulong off;ulong addrB=HookSignature.Relocate(pb,sig,out off);string code="EHS-4@"+sig.Offset.ToString("X")+":"+mod;string next=HookSignature.Rewrite(code,addrA,sig.Offset,addrB,off);
  Console.WriteLine("{\"baseA\":\""+ma.Base.ToString("x")+"\",\"baseB\":\""+mb.Base.ToString("x")+"\",\"offA\":\""+sig.Offset.ToString("x")+"\",\"expectB\":\""+((ulong)rb+(ulong)hookAt).ToString("x")+"\",\"offB\":\""+off.ToString("x")+"\",\"addrB\":\""+addrB.ToString("x")+"\",\"code\":\""+next+"\",\"pattern\":\""+sig.Pattern+"\"}");return 0;}
}
