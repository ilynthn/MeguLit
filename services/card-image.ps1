# SPDX-License-Identifier: GPL-3.0-or-later
# 2026-11-13 card wall pictures (services/card-wall.cjs): one run handles a JSON list of jobs.
#  {mode:'thumb', in, out, max}                    a JPEG no longer than max on its long edge
#  {mode:'crop',  in, out, x, y, scale, w, h}      the card face: the largest w:h window, shrunk by scale (>=1),
#                                                  centred on (x,y) in 0..1 of the picture, clamped inside, drawn at w x h
# Writes "<index>\t<ok|error>\t<srcW>\t<srcH>" per job to stdout.
param([string]$JobFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$jobs = Get-Content -LiteralPath $JobFile -Raw -Encoding UTF8 | ConvertFrom-Json
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]86)
$i = 0
foreach ($j in $jobs) {
  $src = $null; $dst = $null; $g = $null
  try {
    $bytes = [System.IO.File]::ReadAllBytes($j.in)
    $ms = New-Object System.IO.MemoryStream (,$bytes)
    $src = [System.Drawing.Image]::FromStream($ms)
    $W = $src.Width; $H = $src.Height
    if ($j.mode -eq 'crop') {
      $ow = [int]$j.w; $oh = [int]$j.h; $aspect = $ow / $oh
      if ($W / $H -gt $aspect) { $cw = $H * $aspect; $ch = $H } else { $cw = $W; $ch = $W / $aspect }
      $s = [double]$j.scale; if ($s -lt 1) { $s = 1 }; if ($s -gt 8) { $s = 8 }
      $cw = $cw / $s; $ch = $ch / $s
      $cx = [double]$j.x * $W - $cw / 2; $cy = [double]$j.y * $H - $ch / 2
      $cx = [Math]::Max(0, [Math]::Min($W - $cw, $cx)); $cy = [Math]::Max(0, [Math]::Min($H - $ch, $cy))
      $rect = New-Object System.Drawing.RectangleF ([single]$cx), ([single]$cy), ([single]$cw), ([single]$ch)
    } else {
      $max = [int]$j.max; $k = [Math]::Min([double]1, [double]$max / [Math]::Max($W, $H))
      $ow = [Math]::Max(1, [int]($W * $k)); $oh = [Math]::Max(1, [int]($H * $k))
      $rect = New-Object System.Drawing.RectangleF 0, 0, $W, $H
    }
    $dst = New-Object System.Drawing.Bitmap $ow, $oh
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Black)
    # decoded engine pictures (TLG, g00) may carry alpha 0 on opaque art: draw every pixel opaque
    $cm = New-Object System.Drawing.Imaging.ColorMatrix; $cm.Matrix33 = 0; $cm.Matrix43 = 1
    $ia = New-Object System.Drawing.Imaging.ImageAttributes; $ia.SetColorMatrix($cm)
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $ow, $oh), [single]$rect.X, [single]$rect.Y, [single]$rect.Width, [single]$rect.Height, [System.Drawing.GraphicsUnit]::Pixel, $ia)
    $tmp = $j.out + '.tmp'
    $dst.Save($tmp, $codec, $params)
    Move-Item -LiteralPath $tmp -Destination $j.out -Force
    [Console]::Out.WriteLine("$i`tok`t$W`t$H")
  } catch {
    $msg = ($_.Exception.Message -replace '[\r\n\t]', ' ')
    [Console]::Out.WriteLine("$i`terror`t0`t0`t$msg")
  } finally {
    if ($g) { $g.Dispose() }; if ($dst) { $dst.Dispose() }; if ($src) { $src.Dispose() }
  }
  $i++
}
