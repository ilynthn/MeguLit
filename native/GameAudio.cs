// SPDX-License-Identifier: GPL-3.0-or-later
// The game's own sound for Anki cards: Windows process loopback records only the bound game's process tree (never the
// microphone, never other programs) into a two-minute ring in memory. A card asks for the span of one line; the clip is
// used when it contains speech, otherwise MeguLit falls back to synthesis. Nothing is written to disk here.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

public sealed class GameAudio:IDisposable{
 const int Rate=24000,Seconds=120;
 readonly short[] Ring=new short[Rate*Seconds];long Written;long LastAt;readonly object Gate=new object();
 Thread Worker;volatile bool Running;uint Pid;public string Error="";

 [StructLayout(LayoutKind.Sequential)] struct ActivationParams{public int ActivationType;public uint TargetProcessId;public int ProcessLoopbackMode;}
 [StructLayout(LayoutKind.Sequential)] struct PropVariantBlob{public ushort vt;public ushort r1,r2,r3;public uint cbSize;public uint pad;public IntPtr pBlobData;}
 [StructLayout(LayoutKind.Sequential)] struct WaveFormat{public ushort wFormatTag,nChannels;public uint nSamplesPerSec,nAvgBytesPerSec;public ushort nBlockAlign,wBitsPerSample,cbSize;}
 [ComImport,Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IActivateAudioInterfaceAsyncOperation{void GetActivateResult(out int hr,[MarshalAs(UnmanagedType.IUnknown)] out object activated);}
 [ComImport,Guid("41D949AB-9862-444A-80F6-C261334DA5EB"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IActivateAudioInterfaceCompletionHandler{void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation);}
 [ComImport,Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAgileObject{}
 [ComImport,Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IAudioClient{void Initialize(int shareMode,uint flags,long bufferDuration,long periodicity,IntPtr format,IntPtr session);void GetBufferSize(out uint frames);void GetStreamLatency(out long latency);void GetCurrentPadding(out uint padding);void IsFormatSupported(int mode,IntPtr format,out IntPtr closest);void GetMixFormat(out IntPtr format);void GetDevicePeriod(out long def,out long min);void Start();void Stop();void Reset();void SetEventHandle(IntPtr handle);void GetService(ref Guid iid,[MarshalAs(UnmanagedType.IUnknown)] out object service);}
 [ComImport,Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IAudioCaptureClient{void GetBuffer(out IntPtr data,out uint frames,out uint flags,out ulong position,out ulong qpc);void ReleaseBuffer(uint frames);void GetNextPacketSize(out uint frames);}
 [DllImport("Mmdevapi.dll",ExactSpelling=true,PreserveSig=false)]
 static extern void ActivateAudioInterfaceAsync([MarshalAs(UnmanagedType.LPWStr)] string path,ref Guid iid,IntPtr activationParams,IActivateAudioInterfaceCompletionHandler handler,out IActivateAudioInterfaceAsyncOperation operation);
 sealed class Completion:IActivateAudioInterfaceCompletionHandler,IAgileObject{public readonly ManualResetEvent Done=new ManualResetEvent(false);public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation){Done.Set();}}

 public bool Active{get{return Running;}}
 public void Start(uint pid){if(Running&&pid==Pid)return;Stop();Pid=pid;Error="";lock(Gate){Written=0;LastAt=0;}Running=true;Worker=new Thread(Run){IsBackground=true,Name="MeguLit game audio"};Worker.SetApartmentState(ApartmentState.MTA);Worker.Start();}
 public void Stop(){Running=false;var w=Worker;Worker=null;if(w!=null)w.Join(1500);}
 public void Dispose(){Stop();}

 void Run(){
  IntPtr parameters=IntPtr.Zero,variant=IntPtr.Zero,format=IntPtr.Zero;IAudioClient client=null;
  try{
   var p=new ActivationParams{ActivationType=1,TargetProcessId=Pid,ProcessLoopbackMode=0};parameters=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(ActivationParams)));Marshal.StructureToPtr(p,parameters,false);
   var v=new PropVariantBlob{vt=65,cbSize=(uint)Marshal.SizeOf(typeof(ActivationParams)),pBlobData=parameters};variant=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(PropVariantBlob)));Marshal.StructureToPtr(v,variant,false);
   var done=new Completion();IActivateAudioInterfaceAsyncOperation operation;Guid iid=typeof(IAudioClient).GUID;
   ActivateAudioInterfaceAsync("VAD\\Process_Loopback",ref iid,variant,done,out operation);
   if(!done.Done.WaitOne(5000))throw new Exception("audio activation timed out");int hr;object activated;operation.GetActivateResult(out hr,out activated);if(hr!=0||activated==null)throw new Exception("audio activation failed 0x"+hr.ToString("x8"));
   client=(IAudioClient)activated;
   var wf=new WaveFormat{wFormatTag=1,nChannels=2,nSamplesPerSec=48000,nAvgBytesPerSec=192000,nBlockAlign=4,wBitsPerSample=16,cbSize=0};format=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(WaveFormat)));Marshal.StructureToPtr(wf,format,false);
   // Loopback with event callback (the documented mode for process loopback), automatic conversion to the format above.
   client.Initialize(0,0x00020000|0x00040000|0x80000000|0x08000000,2000000,0,format,IntPtr.Zero);var ready=new AutoResetEvent(false);client.SetEventHandle(ready.SafeWaitHandle.DangerousGetHandle());
   Guid captureId=typeof(IAudioCaptureClient).GUID;object service;client.GetService(ref captureId,out service);var capture=(IAudioCaptureClient)service;
   client.Start();var chunk=new List<short>();
   while(Running){ready.WaitOne(100);uint packet;capture.GetNextPacketSize(out packet);
    while(packet>0){IntPtr data;uint frames,flags;ulong pos,qpc;capture.GetBuffer(out data,out frames,out flags,out pos,out qpc);chunk.Clear();
     // Stereo 48 kHz -> mono 24 kHz (average of two channels and two frames); silent packets carry no data.
     bool silent=(flags&2)!=0;var raw=new short[frames*2];if(!silent&&frames>0)Marshal.Copy(data,raw,0,raw.Length);
     for(int i=0;i+3<raw.Length;i+=4)chunk.Add((short)((raw[i]+raw[i+1]+raw[i+2]+raw[i+3])/4));
     capture.ReleaseBuffer(frames);Append(chunk);capture.GetNextPacketSize(out packet);}}
   client.Stop();
  }catch(Exception e){Error=e.Message;}
  finally{if(client!=null)Marshal.ReleaseComObject(client);if(format!=IntPtr.Zero)Marshal.FreeHGlobal(format);if(variant!=IntPtr.Zero)Marshal.FreeHGlobal(variant);if(parameters!=IntPtr.Zero)Marshal.FreeHGlobal(parameters);Running=false;}
 }
 void Append(List<short> samples){lock(Gate){foreach(short s in samples){Ring[Written%Ring.Length]=s;Written++;}LastAt=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();}}

 // Samples between two wall-clock times (Unix ms), mapped through the time of the newest sample.
 public short[] Range(long fromMs,long toMs){lock(Gate){if(Written==0||toMs<=fromMs)return new short[0];long end=Written-Math.Max(0,(LastAt-toMs)*Rate/1000),start=Written-Math.Max(0,(LastAt-fromMs)*Rate/1000);
  start=Math.Max(start,Math.Max(0,Written-Ring.Length));end=Math.Min(end,Written);if(end<=start)return new short[0];var o=new short[end-start];for(long i=start;i<end;i++)o[i-start]=Ring[i%Ring.Length];return o;}}

 // Speech check on 20 ms frames of the high-passed signal (speech has energy where most BGM bass does not, and its
 // loudness swings syllable by syllable): enough frames well above the quiet floor, and a wide loudness range.
 // Returns the trimmed voiced span or null.
 public static short[] Voice(short[] s){int frame=Rate/50;int n=s.Length/frame;if(n<8)return null;var db=new double[n];
  for(int f=0;f<n;f++){double sum=0;for(int i=f*frame+1;i<(f+1)*frame;i++){double d=s[i]-s[i-1];sum+=d*d;}db[f]=10*Math.Log10(sum/frame+1);}
  var sorted=(double[])db.Clone();Array.Sort(sorted);double floor=sorted[n/5];
  int first=-1,last=-1,count=0;for(int f=0;f<n;f++)if(db[f]>floor+12){count++;if(first<0)first=f;last=f;}
  if(count<8)return null;int a=Math.Max(0,(first-8)*frame),b=Math.Min(s.Length,(last+13)*frame);var o=new short[b-a];Array.Copy(s,a,o,0,o.Length);return o;}

 public static byte[] Wav(short[] s){using(var m=new MemoryStream())using(var w=new BinaryWriter(m)){int bytes=s.Length*2;w.Write(new[]{(byte)'R',(byte)'I',(byte)'F',(byte)'F'});w.Write(36+bytes);w.Write(new[]{(byte)'W',(byte)'A',(byte)'V',(byte)'E',(byte)'f',(byte)'m',(byte)'t',(byte)' '});
  w.Write(16);w.Write((short)1);w.Write((short)1);w.Write(Rate);w.Write(Rate*2);w.Write((short)2);w.Write((short)16);w.Write(new[]{(byte)'d',(byte)'a',(byte)'t',(byte)'a'});w.Write(bytes);foreach(short v in s)w.Write(v);w.Flush();return m.ToArray();}}

 // Game window picture for the card's answer side: JPEG, at most 1280 px wide.
 public static string Screenshot(IntPtr target,int width,int height){if(target==IntPtr.Zero||width<16||height<16)return "";
  using(var image=new Bitmap(width,height,PixelFormat.Format32bppRgb)){if(!GameCapture.Picture(target,image))return "";double k=Math.Min(1,1280.0/width);int w=Math.Max(1,(int)(width*k)),h=Math.Max(1,(int)(height*k));
   using(var small=new Bitmap(w,h,PixelFormat.Format24bppRgb)){using(var g=Graphics.FromImage(small)){g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(image,0,0,w,h);}
    var codec=Array.Find(ImageCodecInfo.GetImageEncoders(),c=>c.MimeType=="image/jpeg");var ps=new EncoderParameters(1);ps.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,85L);
    using(var m=new MemoryStream()){small.Save(m,codec,ps);return Convert.ToBase64String(m.ToArray());}}}}

 /* 2026-11-12 (user: MeguLit quietly keeps the game's good-looking scenes for the card back, adult scenes included).
    One capture of the game window alone (never MeguLit's layer), with a looks score from the small copy: colourfulness
    (Hasler-Suesstrunk), contrast and detail; near-black, near-white or flat frames (fades, menus, loading) score 0.
    The 64-bit difference hash lets the caller keep only scenes that differ. */
 public static string SceneShot(IntPtr target,int width,int height,out double score,out string hash){score=0;hash="";if(target==IntPtr.Zero||width<64||height<64)return "";
  using(var image=new Bitmap(width,height,PixelFormat.Format32bppRgb)){if(!GameCapture.Picture(target,image))return "";double k=Math.Min(1,1280.0/width);int w=Math.Max(1,(int)(width*k)),h=Math.Max(1,(int)(height*k));
   using(var small=new Bitmap(w,h,PixelFormat.Format24bppRgb)){using(var g=Graphics.FromImage(small)){g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(image,0,0,w,h);}
    var lum=new double[96*54];Func<int,int,double> lumAt=(x,y)=>lum[y*96+x];
    using(var probe=new Bitmap(96,54,PixelFormat.Format24bppRgb)){using(var g=Graphics.FromImage(probe)){g.InterpolationMode=InterpolationMode.HighQualityBilinear;g.DrawImage(small,0,0,96,54);}
     var data=probe.LockBits(new Rectangle(0,0,96,54),ImageLockMode.ReadOnly,PixelFormat.Format24bppRgb);var px=new byte[data.Stride*54];System.Runtime.InteropServices.Marshal.Copy(data.Scan0,px,0,px.Length);probe.UnlockBits(data);
     double n=0,sl=0,sl2=0,srg=0,srg2=0,syb=0,syb2=0,edge=0;
     for(int y=0;y<54;y++)for(int x=0;x<96;x++){int o=y*data.Stride+x*3;double b=px[o],gg=px[o+1],r=px[o+2],l=.299*r+.587*gg+.114*b,rg=r-gg,yb=.5*(r+gg)-b;lum[y*96+x]=l;n++;sl+=l;sl2+=l*l;srg+=rg;srg2+=rg*rg;syb+=yb;syb2+=yb*yb;}
     for(int y=0;y<54;y++)for(int x=1;x<96;x++)edge+=Math.Abs(lum[y*96+x]-lum[y*96+x-1]);edge/=54*95;
     double ml=sl/n,sd=Math.Sqrt(Math.Max(0,sl2/n-ml*ml)),mrg=srg/n,myb=syb/n,colour=Math.Sqrt(Math.Max(0,srg2/n-mrg*mrg)+Math.Max(0,syb2/n-myb*myb))+.3*Math.Sqrt(mrg*mrg+myb*myb);
     score=(ml<22||ml>238||sd<16||edge<2.5)?0:Math.Round(colour*.55+sd*.35+Math.Min(edge,30)*1.2,1);
     ulong bits=0;int bit=0;for(int y=0;y<8;y++)for(int x=0;x<8;x++){double a=0,c=0;for(int yy=0;yy<6;yy++)for(int xx=0;xx<10;xx++){a+=lum[(y*6+yy+3)*96+x*10+xx];c+=lum[(y*6+yy+3)*96+x*10+xx+10];}if(a<c)bits|=1UL<<bit;bit++;}
     hash=bits.ToString("x16");}
    if(score<=0)return "";
    /* (user: keep only the card's face, delete the rest to save space) the 3:4 upright window with the most detail and
       colour (where the characters usually are), slightly favouring the centre, cropped out and stored alone */
    int cw=Math.Min(w,(int)Math.Round(h*3.0/4)),best=(w-cw)/2;
    if(cw<w){var col=new double[96];for(int x=1;x<95;x++){double e=0;for(int y=1;y<53;y++){double l=lumAt(x,y);e+=Math.Abs(l-lumAt(x-1,y))+Math.Abs(l-lumAt(x,y-1));}col[x]=e;}
     int pw=Math.Max(1,(int)Math.Round(96.0*cw/w));double top=-1;for(int x0=0;x0+pw<=96;x0++){double sum=0;for(int x=x0;x<x0+pw;x++)sum+=col[x];double centre=1-.25*Math.Abs((x0+pw/2.0)-48)/48;sum*=centre;if(sum>top){top=sum;best=(int)Math.Round((double)x0*w/96);}}
     best=Math.Max(0,Math.Min(w-cw,best));}
    int oh=Math.Min(h,960),ow=(int)Math.Round(oh*3.0/4);
    using(var crop=new Bitmap(ow,oh,PixelFormat.Format24bppRgb)){using(var g=Graphics.FromImage(crop)){g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(small,new Rectangle(0,0,ow,oh),new Rectangle(best,0,cw,h),GraphicsUnit.Pixel);}
     var codec=Array.Find(ImageCodecInfo.GetImageEncoders(),c=>c.MimeType=="image/jpeg");var ps=new EncoderParameters(1);ps.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,86L);
     using(var m=new MemoryStream()){crop.Save(m,codec,ps);return Convert.ToBase64String(m.ToArray());}}}}}

 /* 2026-11-13 (user: each collected sentence keeps the game's picture without the dialogue box, never a frame with
    the box). SceneFrame: one clean capture of the game window alone, taken by MeguLit only while the box is hidden,
    as a full-frame JPEG (long side at most 1600) with its looks score and a difference hash of the TOP 62% of the
    frame only. SceneProbe: the same top hash of the frame on screen now (box back or not: dialogue boxes sit in the
    bottom part the hash never sees), no JPEG. A sentence takes the remembered clean frame only when both top hashes
    agree, so it is always the same scene. A flat top (fade, black, one colour) gives no hash: it would match anything. */
 const double TopShare=.62;
 static double Looks(Bitmap source,Rectangle from,double[] lum){
  using(var probe=new Bitmap(96,54,PixelFormat.Format24bppRgb)){using(var g=Graphics.FromImage(probe)){g.InterpolationMode=InterpolationMode.HighQualityBilinear;g.PixelOffsetMode=PixelOffsetMode.Half;g.DrawImage(source,new Rectangle(0,0,96,54),from,GraphicsUnit.Pixel);}
   var data=probe.LockBits(new Rectangle(0,0,96,54),ImageLockMode.ReadOnly,PixelFormat.Format24bppRgb);var px=new byte[data.Stride*54];Marshal.Copy(data.Scan0,px,0,px.Length);probe.UnlockBits(data);
   double n=0,sl=0,sl2=0,srg=0,srg2=0,syb=0,syb2=0,edge=0;
   for(int y=0;y<54;y++)for(int x=0;x<96;x++){int o=y*data.Stride+x*3;double b=px[o],gg=px[o+1],r=px[o+2],l=.299*r+.587*gg+.114*b,rg=r-gg,yb=.5*(r+gg)-b;lum[y*96+x]=l;n++;sl+=l;sl2+=l*l;srg+=rg;srg2+=rg*rg;syb+=yb;syb2+=yb*yb;}
   for(int y=0;y<54;y++)for(int x=1;x<96;x++)edge+=Math.Abs(lum[y*96+x]-lum[y*96+x-1]);edge/=54*95;
   double ml=sl/n,sd=Math.Sqrt(Math.Max(0,sl2/n-ml*ml)),mrg=srg/n,myb=syb/n,colour=Math.Sqrt(Math.Max(0,srg2/n-mrg*mrg)+Math.Max(0,syb2/n-myb*myb))+.3*Math.Sqrt(mrg*mrg+myb*myb);
   return (ml<22||ml>238||sd<16||edge<2.5)?0:Math.Round(colour*.55+sd*.35+Math.Min(edge,30)*1.2,1);}}
 public static string TopHashOf(Bitmap image){int w=image.Width,h=image.Height;if(w<64||h<64)return "";var lum=new double[96*54];Looks(image,new Rectangle(0,0,w,Math.Max(1,(int)(h*TopShare))),lum);
  double s=0,s2=0;foreach(double l in lum){s+=l;s2+=l*l;}double m=s/lum.Length,sd=Math.Sqrt(Math.Max(0,s2/lum.Length-m*m));if(sd<6)return "";
  ulong bits=0;int bit=0;for(int y=0;y<8;y++)for(int x=0;x<8;x++){double a=0,c=0;for(int yy=0;yy<6;yy++)for(int xx=0;xx<10;xx++){a+=lum[(y*6+yy+3)*96+x*10+xx];c+=lum[(y*6+yy+3)*96+x*10+xx+10];}if(a<c)bits|=1UL<<bit;bit++;}
  return bits.ToString("x16");}
 public static string SceneFrameOf(Bitmap image,out double score,out string topHash){int w=image.Width,h=image.Height;score=0;topHash="";if(w<64||h<64)return "";
  score=Looks(image,new Rectangle(0,0,w,h),new double[96*54]);topHash=TopHashOf(image);if(score<=0||topHash=="")return "";
  double k=Math.Min(1,1600.0/Math.Max(w,h));int ow=Math.Max(1,(int)Math.Round(w*k)),oh=Math.Max(1,(int)Math.Round(h*k));
  using(var small=new Bitmap(ow,oh,PixelFormat.Format24bppRgb)){using(var g=Graphics.FromImage(small)){g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.Half;g.DrawImage(image,new Rectangle(0,0,ow,oh),new Rectangle(0,0,w,h),GraphicsUnit.Pixel);}
   var codec=Array.Find(ImageCodecInfo.GetImageEncoders(),c=>c.MimeType=="image/jpeg");var ps=new EncoderParameters(1);ps.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,85L);
   using(var m=new MemoryStream()){small.Save(m,codec,ps);return Convert.ToBase64String(m.ToArray());}}}
 public static string SceneFrame(IntPtr target,int width,int height,out double score,out string topHash){score=0;topHash="";if(target==IntPtr.Zero||width<64||height<64)return "";
  using(var image=new Bitmap(width,height,PixelFormat.Format32bppRgb)){if(!GameCapture.Picture(target,image))return "";return SceneFrameOf(image,out score,out topHash);}}
 public static string SceneProbe(IntPtr target,int width,int height){if(target==IntPtr.Zero||width<64||height<64)return "";
  using(var image=new Bitmap(width,height,PixelFormat.Format32bppRgb)){if(!GameCapture.Picture(target,image))return "";return TopHashOf(image);}}
 static int Distance(string a,string b){if(a.Length!=16||b.Length!=16)return 64;ulong x=Convert.ToUInt64(a,16)^Convert.ToUInt64(b,16);int n=0;while(x!=0){n+=(int)(x&1);x>>=1;}return n;}
 /* --scene-frame-self-test, offline (no window): a drawn scene and the same scene with a dialogue box over its bottom
    third give the same top hash; another scene does not; a flat (fade) frame gives no hash and no JPEG; the JPEG is
    the whole frame with its long side at most 1600. Returns "0" or the failed check. */
 public static string SceneFrameSelfTest(){
  Func<int,int,int,Bitmap> scene=(w,h,seed)=>{var b=new Bitmap(w,h,PixelFormat.Format32bppRgb);var rnd=new Random(seed);using(var g=Graphics.FromImage(b)){g.Clear(Color.FromArgb(70,110,170));
    for(int i=0;i<40;i++){using(var br=new SolidBrush(Color.FromArgb(rnd.Next(256),rnd.Next(256),rnd.Next(256))))g.FillEllipse(br,rnd.Next(w),rnd.Next(h),w/6+rnd.Next(w/4),h/6+rnd.Next(h/4));}}return b;};
  using(var a=scene(1920,1080,1))using(var boxed=(Bitmap)a.Clone())using(var other=scene(1920,1080,2))using(var flat=new Bitmap(1280,720,PixelFormat.Format32bppRgb)){
   using(var g=Graphics.FromImage(boxed)){using(var br=new SolidBrush(Color.FromArgb(230,20,20,40)))g.FillRectangle(br,60,(int)(1080*.66),1800,330);using(var f=new Font("Arial",40))g.DrawString("dialogue text over the scene",f,Brushes.White,120,(int)(1080*.70));}
   using(var g=Graphics.FromImage(flat))g.Clear(Color.Black);
   double score;string hash;string jpeg=SceneFrameOf(a,out score,out hash);if(jpeg==""||hash.Length!=16||score<=0)return "frame";
   using(var m=new MemoryStream(Convert.FromBase64String(jpeg)))using(var img=Image.FromStream(m)){if(img.Width!=1600||img.Height!=900)return "size "+img.Width+"x"+img.Height;}
   if(TopHashOf(boxed)!=hash)return "boxed "+Distance(TopHashOf(boxed),hash);
   if(Distance(TopHashOf(other),hash)<=12)return "other";
   string flatHash;if(SceneFrameOf(flat,out score,out flatHash)!=""||flatHash!=""||TopHashOf(flat)!="")return "flat";
   return "0";}}

 // Offline check used by --audio-self-test: speech-like bursts over a steady tone are detected and trimmed, a steady
 // tone alone is not speech, and the WAV header is valid.
 public static bool SelfTest(){var rnd=new Random(1);var bgm=new short[Rate*4];for(int i=0;i<bgm.Length;i++)bgm[i]=(short)(1500*Math.Sin(i*2*Math.PI*110/Rate));
  if(Voice(bgm)!=null)return false;var speech=(short[])bgm.Clone();for(int i=Rate;i<Rate*3;i++){double env=Math.Abs(Math.Sin((i-Rate)*Math.PI*5/Rate));speech[i]+=(short)(env*6000*(rnd.NextDouble()*2-1));}
  var v=Voice(speech);if(v==null||v.Length>Rate*3||v.Length<Rate)return false;var brief=(short[])bgm.Clone();for(int i=Rate;i<Rate+Rate/5;i++)brief[i]+=(short)(5000*(rnd.NextDouble()*2-1));if(Voice(brief)==null)return false;var wav=Wav(v);return wav.Length==44+v.Length*2&&wav[0]=='R'&&wav[8]=='W';}
}
