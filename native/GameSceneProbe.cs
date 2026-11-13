// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

// Sample the upper part of the bound game client only after game input. A pause
// or a single moving sprite cannot, by itself, make the dialogue disappear.
// E322 (user, 2026-11-10: "the whole layer suddenly fades out", in several games). The probe read the SCREEN, which
// includes MeguLit's own reading layer: after a click MeguLit's own Japanese and translation changing, typing or fading
// counted as the game's picture changing, so the layer hid itself; and because the "picture is back" baseline held
// MeguLit's own text too, it stayed hidden until the next line. It now reads the game window through GameCapture (the
// DWM picture without MeguLit's overlay windows), like every other detector. A change also has to last 1.2 s with no
// new line, and the dialogue-box band at the bottom has to change with it (the box itself went away): a background,
// CG or sprite change behind a box that stays, and flashes or shakes that settle back, no longer hide the layer.
public sealed class GameSceneProbe : IDisposable {
 const int Columns=24, Rows=12, BoxRows=4;
 const double Changed=.62, BoxGone=.35, Returned=.13;
 const int SettleMs=1200;
 // E578 (live beta38, ダストマニア: the player hid the game's text window, MeguLit's line stayed on the bare picture): the box band alone
 // going away while the rest of the picture stays is the text window being hidden; it must hold this long with no new line.
 const double BoxOnly=.5, StillPicture=.13;
 const int BoxSettleMs=650;
 Bitmap frame;
 int[] last, baseline, lastBox, baseBox;
 DateTime inputAt, next, candidateAt;
 bool hidden,boxHidden;
 DateTime boxAt;
 int changed, returned;
 int width, height;
 // Why the last hide / show / keep decision was taken; GalWindowBridge sends it with dialogScene for the reader log.
 public string Reason="";

 public void Reset(){last=null;baseline=null;lastBox=null;baseBox=null;changed=returned=0;hidden=boxHidden=false;inputAt=DateTime.MinValue;candidateAt=DateTime.MinValue;boxAt=DateTime.MinValue;}
 public void Line(){baseline=null;baseBox=null;changed=returned=0;hidden=boxHidden=false;inputAt=DateTime.MinValue;candidateAt=DateTime.MinValue;boxAt=DateTime.MinValue;}
 public void Input(){
  if(hidden||baseline!=null||last==null)return;
  baseline=last;baseBox=lastBox;inputAt=DateTime.UtcNow;changed=0;candidateAt=DateTime.MinValue;boxAt=DateTime.MinValue;
 }
 public static double Difference(int[] a,int[] b){
  if(a==null||b==null||a.Length==0||a.Length!=b.Length)return 0;
  int different=0;
  for(int i=0;i<a.Length;i++){
   int d=Math.Abs((a[i]&255)-(b[i]&255))+Math.Abs((a[i]>>8&255)-(b[i]>>8&255))+Math.Abs((a[i]>>16&255)-(b[i]>>16&255));
   if(d>=108)different++;
  }
  return different/(double)a.Length;
 }
 // Average colour of each cell of a Columns x rows grid laid over the region (every 4th pixel is enough).
 public static int[] Cells(Bitmap image,Rectangle region,int rows){
  region.Intersect(new Rectangle(0,0,image.Width,image.Height));
  if(region.Width<Columns||region.Height<rows)return null;
  var cells=new int[Columns*rows];
  var data=image.LockBits(region,ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
  try{
   var line=new byte[region.Width*4];
   long[] r=new long[cells.Length],g=new long[cells.Length],b=new long[cells.Length];int[] n=new int[cells.Length];
   for(int y=0;y<region.Height;y+=4){
    Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),line,0,line.Length);
    int row=Math.Min(rows-1,y*rows/region.Height);
    for(int x=0;x<region.Width;x+=4){
     int cell=row*Columns+Math.Min(Columns-1,x*Columns/region.Width),i=x*4;
     b[cell]+=line[i];g[cell]+=line[i+1];r[cell]+=line[i+2];n[cell]++;
    }
   }
   for(int i=0;i<cells.Length;i++){int k=Math.Max(1,n[i]);cells[i]=(int)(r[i]/k)<<16|(int)(g[i]/k)<<8|(int)(b[i]/k);}
  }finally{image.UnlockBits(data);}
  return cells;
 }
 // One decision step on a game picture (client size). Returns false to hide, true to show again, null for no change.
 public bool? Step(Bitmap image,DateTime now){
  int w=image.Width,h=image.Height;
  var pixels=Cells(image,new Rectangle(w/10,h/9,w*8/10,h*5/9),Rows);
  var box=Cells(image,new Rectangle(w/10,h*7/10,w*8/10,h/4),BoxRows);
  if(pixels==null||box==null)return null;
  last=pixels;lastBox=box;
  if(baseline==null)return null;
  double delta=Difference(baseline,pixels);
  if(hidden){
   /* a hidden text window comes back: the box band looks as it did before the input again */
   returned=(boxHidden?Difference(baseBox,box):delta)<=Returned?returned+1:0;
   if(returned>=2){Line();Reason="scene back";return true;}
   return null;
  }
  if(candidateAt==DateTime.MinValue){
   double bandDelta=Difference(baseBox,box);
   if(delta<=StillPicture&&bandDelta>=BoxOnly){if(boxAt==DateTime.MinValue)boxAt=now;else if((now-boxAt).TotalMilliseconds>=BoxSettleMs){hidden=boxHidden=true;returned=0;Reason="text window hidden: box "+Math.Round(bandDelta*100)+"%, picture "+Math.Round(delta*100)+"%";return false;}return null;}
   boxAt=DateTime.MinValue;
   if((now-inputAt).TotalMilliseconds>1900){Line();return null;}
   changed=delta>=Changed?changed+1:0;
   if(changed>=3)candidateAt=now;
   return null;
  }
  // A flash, shake or quick fade that settles back is not a scene change.
  if(delta<Changed){candidateAt=DateTime.MinValue;changed=0;return null;}
  if((now-candidateAt).TotalMilliseconds<SettleMs)return null;
  double boxDelta=Difference(baseBox,box);
  if(boxDelta>=BoxGone){hidden=true;Reason="scene changed "+Math.Round(delta*100)+"%, box "+Math.Round(boxDelta*100)+"%";return false;}
  // The picture changed but the dialogue-box band did not: a background or CG behind a box that is still there.
  Reason="kept: picture changed "+Math.Round(delta*100)+"% but box only "+Math.Round(boxDelta*100)+"%";Line();return null;
 }
 public bool? Tick(IntPtr target,int w,int h){
  if(w<160||h<120||target==IntPtr.Zero)return null;
  var now=DateTime.UtcNow;
  if(w!=width||h!=height){
   // A resize invalidates the old pixels, but must not re-show a hidden line.
   last=null;baseline=null;lastBox=null;baseBox=null;changed=returned=0;candidateAt=DateTime.MinValue;width=w;height=h;
   if(frame!=null){frame.Dispose();frame=null;}
  }
  if(now<next)return null;
  next=now.AddMilliseconds(170);
  if(frame==null)frame=new Bitmap(w,h,PixelFormat.Format32bppArgb);
  // The game window's own picture, without MeguLit's overlay; a window that cannot be read now is skipped.
  if(!GameCapture.Into(target,frame,2))return null;
  return Step(frame,now);
 }
 // Synthetic pictures, no window: MeguLit's text is never in the picture now, a background change behind a box that
 // stays keeps the layer, the box going away hides it after 1.2 s, and the picture coming back shows it again.
 public static bool SelfTest(){
  var p=new GameSceneProbe();var t=new DateTime(2026,1,1);
  Func<Color,Color,Bitmap> pic=(scene,box)=>{var b=new Bitmap(640,360,PixelFormat.Format32bppArgb);using(var g=Graphics.FromImage(b)){g.Clear(scene);using(var br=new SolidBrush(box))g.FillRectangle(br,0,252,640,108);}return b;};
  using(var day=pic(Color.SkyBlue,Color.FromArgb(30,30,60)))using(var night=pic(Color.Black,Color.FromArgb(30,30,60)))using(var cg=pic(Color.Orange,Color.Orange)){
   Func<Bitmap,int,bool?> run=(img,ms)=>{bool? r=null;for(int i=0;i<ms/170+1;i++){t=t.AddMilliseconds(170);var v=p.Step(img,t);if(v.HasValue)r=v;}return r;};
   run(day,170);p.Input();
   // Background change, box stays: never hidden.
   if(run(night,2600)==false)return false;
   p.Line();run(day,170);p.Input();
   // Box goes away with the picture (CG): hidden after it settles, shown again when the picture comes back.
   if(run(cg,2000)!=false)return false;
   if(run(day,600)!=true)return false;
   // A flash that settles back within the window: not hidden.
   p.Line();run(day,170);p.Input();run(cg,600);if(run(day,1500)==false)return false;
   // E578: the text window alone is hidden (picture unchanged): hidden after it holds, shown again when the window is back.
   using(var bare=pic(Color.SkyBlue,Color.SkyBlue)){p.Line();run(day,170);p.Input();if(run(bare,1000)!=false)return false;if(run(day,600)!=true)return false;
    // a box that only blinks (a new line redrawing it) is not a hidden window
    p.Line();run(day,170);p.Input();run(bare,340);if(run(day,1200)==false)return false;}
  }
  return true;
 }
 public void Dispose(){if(frame!=null)frame.Dispose();}
}
