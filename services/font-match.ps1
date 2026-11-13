# SPDX-License-Identifier: GPL-3.0-or-later
# Which installed font draws like a game's pre-rendered glyph sheet (MAGES FONT.PNG and other engines with bitmap fonts).
# Input JSON (-In): {"chars":"あい…","size":32,"glyphs":["<base64 size*size grey, ink=255>",…]}.
# Every installed family is drawn with GraphicsPath (no font fallback), each glyph cropped to its ink box and scaled to
# size x size like the input; score = 1 - mean |difference|. Output JSON (-Out): [{"family","style","score"},…] best first.
param([Parameter(Mandatory=$true)][string]$In,[Parameter(Mandatory=$true)][string]$Out)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;using System.Drawing;using System.Drawing.Drawing2D;using System.Drawing.Imaging;using System.Drawing.Text;using System.Collections.Generic;
public static class MeguFontMatch{
 static byte[] Norm(Bitmap bmp,int size){
  int w=bmp.Width,h=bmp.Height,x0=w,y0=h,x1=-1,y1=-1;var d=bmp.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
  var px=new byte[d.Stride*h];System.Runtime.InteropServices.Marshal.Copy(d.Scan0,px,0,px.Length);bmp.UnlockBits(d);
  for(int y=0;y<h;y++)for(int x=0;x<w;x++)if(px[y*d.Stride+x*4+1]>100){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  if(x1<0)return null;var outp=new byte[size*size];int cw=x1-x0+1,ch=y1-y0+1;
  for(int y=0;y<size;y++)for(int x=0;x<size;x++){double sx=x0+(x+0.5)*cw/size-0.5,sy=y0+(y+0.5)*ch/size-0.5;int ix=(int)Math.Floor(sx),iy=(int)Math.Floor(sy);double fx=sx-ix,fy=sy-iy;
   Func<int,int,double> g=(a,b)=>{if(a<x0)a=x0;if(a>x1)a=x1;if(b<y0)b=y0;if(b>y1)b=y1;return px[b*d.Stride+a*4+1];};
   outp[y*size+x]=(byte)Math.Round(g(ix,iy)*(1-fx)*(1-fy)+g(ix+1,iy)*fx*(1-fy)+g(ix,iy+1)*(1-fx)*fy+g(ix+1,iy+1)*fx*fy);}
  return outp;}
 public static string Run(string chars,int size,byte[][] glyphs,float em){
  var res=new List<string>();var fams=new InstalledFontCollection().Families;var seen=new HashSet<string>();
  var list=new List<Tuple<double,string,string>>();double best=0;
  using(var bmp=new Bitmap((int)(em*1.6)+16,(int)(em*1.6)+16))using(var gr=Graphics.FromImage(bmp)){gr.SmoothingMode=SmoothingMode.AntiAlias;
   foreach(var fam in fams){if(fam.Name.StartsWith("@"))continue;foreach(var st in new[]{FontStyle.Regular}){if(!fam.IsStyleAvailable(st))continue;
    double tot=0;int n=0;bool bad=false;
    for(int i=0;i<chars.Length&&i<glyphs.Length;i++){if(glyphs[i]==null)continue;
     gr.Clear(Color.Black);using(var path=new GraphicsPath()){path.AddString(chars[i].ToString(),fam,(int)st,em,new Point(8,4),StringFormat.GenericTypographic);gr.FillPath(Brushes.White,path);}
     var g=Norm(bmp,size);if(g==null){bad=true;break;}double diff=0;for(int k=0;k<g.Length;k++)diff+=Math.Abs(g[k]-glyphs[i][k]);tot+=1-diff/g.Length/255.0;n++;
     if((n==6&&tot/n<0.7)||(n==12&&tot/n<best-0.04)){bad=true;break;}}
    if(!bad&&n>0){list.Add(Tuple.Create(tot/n,fam.Name,st.ToString()));if(tot/n>best)best=tot/n;}}}}
  list.Sort((a,b)=>b.Item1.CompareTo(a.Item1));
  var sb=new System.Text.StringBuilder("[");for(int i=0;i<list.Count&&i<8;i++){if(i>0)sb.Append(',');sb.Append("{\"family\":\""+list[i].Item2.Replace("\\","\\\\").Replace("\"","\\\"")+"\",\"style\":\""+list[i].Item3+"\",\"score\":"+list[i].Item1.ToString("0.0000",System.Globalization.CultureInfo.InvariantCulture)+"}");}
  return sb.Append("]").ToString();}}
'@
$job=Get-Content -LiteralPath $In -Raw -Encoding UTF8|ConvertFrom-Json
$glyphs=[byte[][]]@($job.glyphs|ForEach-Object{if($_){,[Convert]::FromBase64String($_)}else{,$null}})
$json=[MeguFontMatch]::Run([string]$job.chars,[int]$job.size,$glyphs,[float]$(if($job.em){$job.em}else{64}))
[IO.File]::WriteAllText($Out,$json,(New-Object Text.UTF8Encoding($false)))
