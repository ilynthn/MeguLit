# 2026-11-26 cold test: Japanese lines of one picture with their boxes (Windows.Media.Ocr), one JSON array on stdout.
# Usage: powershell -File cold-ocr.ps1 <picture>  ->  [{"text":"...","x":0,"y":0,"w":0,"h":0}, ...] (picture px)
param([string]$Picture)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]
function Wait-Op($op,[Type]$t){$task=$asTask.MakeGenericMethod($t).Invoke($null,@($op));$task.Wait(-1)|Out-Null;$task.Result}
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]|Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]|Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime]|Out-Null
[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]|Out-Null
$file=Wait-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path -LiteralPath $Picture).Path)) ([Windows.Storage.StorageFile])
$stream=Wait-Op ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder=Wait-Op ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap=Wait-Op ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ja'))
if($engine -eq $null){'[]';exit 0}
$result=Wait-Op ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$out=foreach($line in $result.Lines){$ws=@($line.Words);if(-not $ws.Count){continue}
 $x=($ws|ForEach-Object{$_.BoundingRect.X}|Measure-Object -Minimum).Minimum;$y=($ws|ForEach-Object{$_.BoundingRect.Y}|Measure-Object -Minimum).Minimum
 $r=($ws|ForEach-Object{$_.BoundingRect.X+$_.BoundingRect.Width}|Measure-Object -Maximum).Maximum;$b=($ws|ForEach-Object{$_.BoundingRect.Y+$_.BoundingRect.Height}|Measure-Object -Maximum).Maximum
 [pscustomobject]@{text=$line.Text;x=[int]$x;y=[int]$y;w=[int]($r-$x);h=[int]($b-$y)}}
$json=ConvertTo-Json -InputObject @($out) -Compress
[Console]::OutputEncoding=[Text.Encoding]::UTF8;[Console]::Out.Write($json)
