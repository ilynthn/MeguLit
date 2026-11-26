# 2026-11-26 cold test: Japanese lines of one picture with their boxes (Windows.Media.Ocr), one JSON array on stdout.
# Usage: powershell -File cold-ocr.ps1 <picture>  ->  [{"text":"...","x":0,"y":0,"w":0,"h":0,"pass":"plain|ink"}, ...] (picture px)
# Two passes: the picture as it is, and "ink" tiles (640x120 every 60 px, 3x, dark where a pixel is colourful: outlined pastel
# button labels such as オルフレール's 「デフォルト / タイトルへ」 that the plain pass cannot read), boxes back in picture px.
param([string]$Picture)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime,System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;using System.Drawing;using System.Drawing.Imaging;using System.Runtime.InteropServices;
public static class ColdInk{
 /* tiles of tw x th every sy px (rows) and tw/2 (columns), each 3x and dark where a pixel is colourful; -> "file|x|y" lines */
 public static string[] Tiles(string src,string dir,int tw,int th,int sy,int k){var list=new System.Collections.Generic.List<string>();using(var b=new Bitmap(src)){
  for(int y=0;y<b.Height;y+=sy)for(int x=0;x<b.Width;x+=tw/2){int w=Math.Min(tw,b.Width-x),h=Math.Min(th,b.Height-y);if(w<tw/2||h<th/2)continue;
   var f=System.IO.Path.Combine(dir,"t"+x+"_"+y+".png");using(var big=new Bitmap(w*k,h*k,PixelFormat.Format32bppArgb)){
    using(var g=Graphics.FromImage(big)){g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;g.DrawImage(b,new Rectangle(0,0,w*k,h*k),new Rectangle(x,y,w,h),GraphicsUnit.Pixel);}
    var r=new Rectangle(0,0,big.Width,big.Height);var d=big.LockBits(r,ImageLockMode.ReadWrite,PixelFormat.Format32bppArgb);var px=new byte[d.Stride*d.Height];Marshal.Copy(d.Scan0,px,0,px.Length);
    for(int i=0;i<px.Length;i+=4){int bl=px[i],gr=px[i+1],re=px[i+2];int mx=Math.Max(re,Math.Max(gr,bl)),mn=Math.Min(re,Math.Min(gr,bl));int v=255-Math.Min(255,(mx-mn)*4);px[i]=px[i+1]=px[i+2]=(byte)v;px[i+3]=255;}
    Marshal.Copy(px,0,d.Scan0,px.Length);big.UnlockBits(d);big.Save(f,ImageFormat.Png);}
   list.Add(f+"|"+x+"|"+y);}}
  return list.ToArray();}}
'@
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]
function Wait-Op($op,[Type]$t){$task=$asTask.MakeGenericMethod($t).Invoke($null,@($op));$task.Wait(-1)|Out-Null;$task.Result}
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]|Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]|Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime]|Out-Null
[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]|Out-Null
$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ja'))
if($engine -eq $null){[Console]::Out.Write('[]');exit 0}
function Read-Lines([string]$file,[double]$scale,[string]$pass,[int]$ox=0,[int]$oy=0){
 $f=Wait-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($file)) ([Windows.Storage.StorageFile])
 $stream=Wait-Op ($f.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
 try{$decoder=Wait-Op ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap=Wait-Op ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  if($bitmap.PixelWidth -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or $bitmap.PixelHeight -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension){return}
  $result=Wait-Op ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])}finally{$stream.Dispose()}
 # 2026-11-27 (MeguLit-Adapter, ファタモルガーナの館 title): the engine deskews the picture first (TextAngle 8.5) and its boxes are in that
 # rotated picture; each box centre is turned back about the picture centre, or the click lands 50 px above 「館の扉を開く」
 $angle=0.0;if($result.TextAngle -ne $null){$angle=[double]$result.TextAngle};$rad=$angle*[Math]::PI/180;$cx=$bitmap.PixelWidth/2;$cy=$bitmap.PixelHeight/2
 foreach($line in $result.Lines){$ws=@($line.Words);if(-not $ws.Count){continue}
  $x=($ws|ForEach-Object{$_.BoundingRect.X}|Measure-Object -Minimum).Minimum;$y=($ws|ForEach-Object{$_.BoundingRect.Y}|Measure-Object -Minimum).Minimum
  $r=($ws|ForEach-Object{$_.BoundingRect.X+$_.BoundingRect.Width}|Measure-Object -Maximum).Maximum;$b=($ws|ForEach-Object{$_.BoundingRect.Y+$_.BoundingRect.Height}|Measure-Object -Maximum).Maximum
  if([Math]::Abs($angle) -gt 0.3){$mx=($x+$r)/2-$cx;$my=($y+$b)/2-$cy;$nx=$cx+$mx*[Math]::Cos($rad)-$my*[Math]::Sin($rad);$ny=$cy+$mx*[Math]::Sin($rad)+$my*[Math]::Cos($rad);$hw=($r-$x)/2;$hh=($b-$y)/2;$x=$nx-$hw;$r=$nx+$hw;$y=$ny-$hh;$b=$ny+$hh}
  [pscustomobject]@{text=$line.Text;x=[int]($x/$scale)+$ox;y=[int]($y/$scale)+$oy;w=[int](($r-$x)/$scale);h=[int](($b-$y)/$scale);pass=$pass}}}
$src=(Resolve-Path -LiteralPath $Picture).Path
$out=@(Read-Lines $src 1 'plain')
$dir=[IO.Path]::Combine([IO.Path]::GetTempPath(),'megulit-cold-ink-'+[Guid]::NewGuid().ToString('N'));New-Item -ItemType Directory -Path $dir|Out-Null
try{foreach($t in [ColdInk]::Tiles($src,$dir,640,120,60,3)){$p=$t.Split('|');$out+=@(Read-Lines $p[0] 3 'ink' ([int]$p[1]) ([int]$p[2]))}}catch{}finally{Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue}
$json=ConvertTo-Json -InputObject @($out) -Compress
[Console]::OutputEncoding=[Text.Encoding]::UTF8;[Console]::Out.Write($json)
