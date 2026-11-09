# SPDX-License-Identifier: GPL-3.0-or-later
# MeguLit first-launch setup.
# The release zip ships without runtime\. This window lets the user pick:
#   Lite  = base pack only (Node, Python, hooks, JMdict). Other packs can be added later in Settings.
#   Full  = base + furigana dictionaries + voice engine, all at once.
# Everything is installed straight into this MeguLit folder (runtime\ next to MeguLit.exe), so a fresh
# PC needs nothing preinstalled except the WebView2 Runtime (built into Windows 11).
# Packs, URLs, SHA-256 and sizes come from setup\runtime.json. Exit 0 = runtime ready.
param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Windows.Forms.Application]::EnableVisualStyles()

$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $Root 'setup\runtime.json') | ConvertFrom-Json
$packs = $manifest.packs
$appSize = 40MB
function MB($n) { if ($n -ge 1GB) { '{0:N1} GB' -f ($n/1GB) } else { '{0:N0} MB' -f ($n/1MB) } }
$lite = @('base'); $full = @('base','reading','voice')
function Sum($ids, $field) { $t = 0; foreach ($i in $ids) { $t += $packs.$i.$field }; $t }

# WebView2 Runtime is the one thing MeguLit cannot ship itself (Windows 11 has it; some Windows 10 PCs do not).
function Has-WebView2 {
  $id = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  foreach ($k in "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$id", "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$id", "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$id") {
    try { $v = (Get-ItemProperty -Path $k -Name pv -ErrorAction Stop).pv; if ($v -and $v -ne '0.0.0.0') { return $true } } catch {}
  }
  return $false
}
$webview = Has-WebView2

# Palette: dark grimoire, cream pages, crimson ribbon, a little gold.
$C = @{
  bg    = [Drawing.Color]::FromArgb(24,19,20);  card  = [Drawing.Color]::FromArgb(38,30,31)
  line  = [Drawing.Color]::FromArgb(62,48,49);  cream = [Drawing.Color]::FromArgb(243,233,220)
  muted = [Drawing.Color]::FromArgb(170,154,144); red  = [Drawing.Color]::FromArgb(200,50,60)
  gold  = [Drawing.Color]::FromArgb(217,165,74)
}
$ui = 'Microsoft YaHei UI'
# Flat buttons default to a white hover; give them grimoire colours instead.
function Style-Button($b, [bool]$primary) {
  $b.FlatStyle = 'Flat'; $b.UseVisualStyleBackColor = $false; $b.ForeColor = $C.cream; $b.Cursor = 'Hand'
  if ($primary) { $b.BackColor = $C.red; $b.FlatAppearance.BorderColor = $C.red; $b.FlatAppearance.MouseOverBackColor = [Drawing.Color]::FromArgb(222,72,82); $b.FlatAppearance.MouseDownBackColor = [Drawing.Color]::FromArgb(168,38,48) }
  else { $b.BackColor = $C.card; $b.FlatAppearance.MouseOverBackColor = [Drawing.Color]::FromArgb(64,40,43); $b.FlatAppearance.MouseDownBackColor = [Drawing.Color]::FromArgb(84,48,52) }
}
function Img($name) { $p = Join-Path $Root "setup\$name"; if (Test-Path $p) { [Drawing.Image]::FromFile($p) } }
$logo = Img 'logo.png'

# Double-buffered panel so the hand-drawn line art does not flicker.
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
public class GrimoirePanel : System.Windows.Forms.Panel {
  public GrimoirePanel() { this.DoubleBuffered = true; this.SetStyle(System.Windows.Forms.ControlStyles.ResizeRedraw, true); }
}
'@

function Pen($color, $alpha, $w) { New-Object Drawing.Pen ([Drawing.Color]::FromArgb($alpha, $color)), $w }
function Draw-Circle($g, $cx, $cy, $r, $color, $alpha) {
  $p = Pen $color $alpha 1
  foreach ($k in 1.0, 0.9, 0.58, 0.22) { $rr = $r * $k; $g.DrawEllipse($p, [float]($cx-$rr), [float]($cy-$rr), [float](2*$rr), [float](2*$rr)) }
  foreach ($rot in 0, 180) {
    $pts = foreach ($i in 0..2) { $a = ($rot - 90 + $i*120) * [math]::PI / 180; New-Object Drawing.PointF ([float]($cx + $r*0.9*[math]::Cos($a))), ([float]($cy + $r*0.9*[math]::Sin($a))) }
    $g.DrawPolygon($p, [Drawing.PointF[]]$pts)
  }
  $p.Dispose()
}
function Draw-Book($g, $x, $y, $color) {
  $p = Pen $color 255 1.6
  $g.DrawBezier($p, $x, $y+4, $x+6, $y, $x+11, $y+1, $x+14, $y+4); $g.DrawBezier($p, $x+14, $y+4, $x+17, $y+1, $x+22, $y, $x+28, $y+4)
  $g.DrawLine($p, $x, $y+4, $x, $y+20); $g.DrawLine($p, $x+28, $y+4, $x+28, $y+20); $g.DrawLine($p, $x+14, $y+4, $x+14, $y+22)
  $g.DrawBezier($p, $x, $y+20, $x+6, $y+16, $x+11, $y+17, $x+14, $y+22); $g.DrawBezier($p, $x+14, $y+22, $x+17, $y+17, $x+22, $y+16, $x+28, $y+20)
  $p.Dispose()
}

# The setup runs inside powershell.exe, so the taskbar grouped it with PowerShell and showed PowerShell's icon.
# An own AppUserModelID gives the window its own taskbar entry with the MeguLit icon set below.
try { Add-Type -Namespace MeguLit -Name Shell -MemberDefinition @'
[DllImport("shell32.dll")] public static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string id);
[DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
'@; [void][MeguLit.Shell]::SetCurrentProcessExplicitAppUserModelID('app.megulit.setup') } catch {}
$form = New-Object Windows.Forms.Form
$form.Text = 'MeguLit'; $form.ClientSize = New-Object Drawing.Size(720,650); $form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false; $form.BackColor = $C.bg; $form.ForeColor = $C.cream
$form.add_HandleCreated({
  $dark = 1
  $frameBackground = [Drawing.ColorTranslator]::ToWin32($form.BackColor)
  $frameText = [Drawing.ColorTranslator]::ToWin32($form.ForeColor)
  [void][MeguLit.Shell]::DwmSetWindowAttribute($form.Handle,20,[ref]$dark,4)
  [void][MeguLit.Shell]::DwmSetWindowAttribute($form.Handle,34,[ref]$frameBackground,4)
  [void][MeguLit.Shell]::DwmSetWindowAttribute($form.Handle,35,[ref]$frameBackground,4)
  [void][MeguLit.Shell]::DwmSetWindowAttribute($form.Handle,36,[ref]$frameText,4)
})
$exe = Join-Path $Root 'MeguLit.exe'; if (Test-Path $exe) { $form.Icon = [Drawing.Icon]::ExtractAssociatedIcon($exe) }

function Label($text, $x, $y, $w, $h, $size, $bold, $color, $parent) {
  $l = New-Object Windows.Forms.Label; $l.Text = $text; $l.Location = New-Object Drawing.Point($x,$y); $l.Size = New-Object Drawing.Size($w,$h)
  $style = if ($bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular }
  $l.Font = New-Object Drawing.Font($ui, $size, $style); $l.ForeColor = $color; $l.BackColor = [Drawing.Color]::Transparent
  $parent.Controls.Add($l); $l
}

# ---- shared backdrop: magic circles + header art ----
$stage = New-Object GrimoirePanel; $stage.Dock = 'Fill'; $stage.BackColor = $C.bg
$stage.add_Paint({ param($s,$e)
  $g = $e.Graphics; $g.SmoothingMode = 'AntiAlias'
  Draw-Circle $g 640 70 190 $C.red 46
  Draw-Circle $g 40 560 150 $C.gold 30
  if ($logo) { $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($logo, 30, 18, 212, 81) }
  $p = Pen $C.line 255 1; $g.DrawLine($p, 32, 122, 688, 122); $p.Dispose()
})
$form.Controls.Add($stage)

# ---- choice page ----
$choice = New-Object Windows.Forms.Panel; $choice.Location = New-Object Drawing.Point(0,124); $choice.Size = New-Object Drawing.Size(720,526); $choice.BackColor = [Drawing.Color]::Transparent
$stage.Controls.Add($choice)
[void](Label '第一次使用 MeguLit' 32 12 560 30 14 $true $C.cream $choice)
[void](Label '先下载运行组件。它们都会装进 MeguLit 自己的文件夹，电脑上不用预先安装 Node.js、Python 或其他软件' 32 44 656 20 9 $false $C.muted $choice)
[void](Label '组件包放在 MeguLit 的 GitHub Releases，里面是 Node.js、Python、LunaHook、AivisSpeech 等项目官方发布的原版文件，下载后逐个校验 SHA-256，被改动过的文件不会安装' 32 66 656 34 8 $false $C.muted $choice)
$free = (Get-Item $Root).PSDrive.Free

function Option($x, $title, $sub, $items, $pros, $cons, $ids, $primary, $badge) {
  $p = New-Object GrimoirePanel; $p.Location = New-Object Drawing.Point($x,106); $p.Size = New-Object Drawing.Size(316,346); $p.BackColor = $C.card
  $down = Sum $ids 'size'; $disk = (Sum $ids 'unpacked') + $appSize
  $accent = if ($primary) { $C.red } else { $C.line }
  $edgeColor = if ($primary) { $C.red } else { $C.line }
  $p.add_Paint({ param($s,$e)
    $g = $e.Graphics; $g.SmoothingMode = 'AntiAlias'
    $b = New-Object Drawing.SolidBrush $accent; $g.FillRectangle($b, 0, 0, 316, $(if ($primary) { 4 } else { 2 }))
    if ($primary) { $g.FillPolygon($b, [Drawing.Point[]]@((New-Object Drawing.Point(272,0)),(New-Object Drawing.Point(290,0)),(New-Object Drawing.Point(290,30)),(New-Object Drawing.Point(281,23)),(New-Object Drawing.Point(272,30)))) }; $b.Dispose()
    Draw-Book $g 20 20 $(if ($primary) { $C.red } else { $C.muted })
    $pen = Pen $edgeColor 255 $(if ($primary) { 2 } else { 1 }); $g.DrawRectangle($pen, 0, 0, 315, 345); $pen.Dispose()
    $pen = Pen $C.line 255 1; $g.DrawLine($pen, 20, 262, 296, 262); $pen.Dispose()
  }.GetNewClosure())
  [void](Label $title 58 16 120 30 13 $true $C.cream $p)
  if ($badge) { $bd = Label $badge 132 23 40 18 8 $true $C.cream $p; $bd.BackColor = $C.red; $bd.TextAlign = 'MiddleCenter'; $bd.AutoSize = $false }
  [void](Label $sub 59 44 220 18 8 $false $C.muted $p)
  [void](Label '包含 / Includes' 20 68 280 18 8 $true $(if ($primary) { $C.red } else { $C.muted }) $p)
  [void](Label (($items | ForEach-Object { '·  ' + $_ }) -join "`n") 20 86 286 68 9 $false $C.cream $p)
  [void](Label (($pros | ForEach-Object { '✓  ' + $_ }) -join "`n") 20 158 286 52 9 $false $C.gold $p)
  [void](Label (($cons | ForEach-Object { '–  ' + $_ }) -join "`n") 20 212 286 48 8 $false $C.muted $p)
  [void](Label ('下载约 ' + (MB $down)) 20 270 140 22 10 $true $C.cream $p)
  $warn = if ($free -lt $disk * 1.1) { $C.red } else { $C.muted }
  [void](Label ('占用磁盘约 ' + (MB $disk)) 160 272 140 20 9 $false $warn $p)
  $b = New-Object Windows.Forms.Button; $b.Text = $(if ($primary) { '安装' + $title + '（推荐）' } else { '只装' + $title }); $b.FlatStyle = 'Flat'
  $b.Location = New-Object Drawing.Point(20,$(if ($primary) { 298 } else { 302 })); $b.Size = New-Object Drawing.Size(276,$(if ($primary) { 38 } else { 30 }))
  $b.Font = New-Object Drawing.Font($ui, $(if ($primary) { 11 } else { 9 }), $(if ($primary) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular })); $b.ForeColor = $C.cream; $b.Cursor = 'Hand'
  Style-Button $b $primary; if (-not $primary) { $b.FlatAppearance.BorderColor = $C.line; $b.ForeColor = $C.muted }
  $b.Tag = $ids; $b.add_Click({ param($s) Start-Install $s.Tag })
  $p.Controls.Add($b); $choice.Controls.Add($p)
  if ($primary) { $form.AcceptButton = $b }
}
$baseItems = @('Node.js 运行时（程序后台服务）','Python 3（分词与注音）','文本 Hook 引擎（读取游戏文字）','JMdict 日英 / 日中离线词典')
Option 32 '完整版' 'FULL · 一次装齐，开箱即用' @('精简版的全部组件','SudachiDict / UniDic 注音分词词典','AivisSpeech 语音引擎（朗读、原声补全）') @('注音和分词更准，生僻词、人名读音更可靠','朗读、制卡配音、原声补全马上能用','装完就不用再下载，断网也能用') @('下载约大五倍，第一次要多等一会','本地翻译模型不含在内，要用时在设置里下载') $full $true '推荐'
Option 372 '精简版' 'LITE · 先用起来' $baseItems @('下载最小，几分钟就能开始玩','读取台词、点读查词、在线翻译都能用') @('第一次显示注音时才补装词典，要等一下','没有语音：朗读、配音要以后在「设置 → 语音 / 词典」补装') $lite $false ''

$runtimeDir = Join-Path $Root 'runtime'
# A long path wrapped to a second line that the 20px label cut in half; keep it on one line and end it with … instead
$where = Label ('装进 MeguLit 自己的文件夹，不会写到别处：' + $runtimeDir) 32 466 656 20 8 $false $C.muted $choice
$where.AutoEllipsis = $true; (New-Object Windows.Forms.ToolTip).SetToolTip($where, $runtimeDir)
[void](Label ('所在磁盘可用 ' + (MB $free) + '   ·   以后移动 MeguLit 文件夹，组件会跟着一起走') 32 486 656 20 8 $false $C.muted $choice)
if (-not $webview) {
  $link = New-Object Windows.Forms.LinkLabel; $link.Text = '这台电脑缺少 Microsoft Edge WebView2 运行时，MeguLit 的界面需要它：点这里去微软官网下载安装'
  $link.Location = New-Object Drawing.Point(32,506); $link.Size = New-Object Drawing.Size(656,20); $link.Font = New-Object Drawing.Font($ui, 8, [Drawing.FontStyle]::Bold)
  $link.LinkColor = $C.red; $link.ActiveLinkColor = $C.gold; $link.BackColor = [Drawing.Color]::Transparent
  $link.add_LinkClicked({ Start-Process 'https://developer.microsoft.com/microsoft-edge/webview2/' })
  $choice.Controls.Add($link)
}

# ---- progress page ----
$progress = New-Object Windows.Forms.Panel; $progress.Location = New-Object Drawing.Point(0,124); $progress.Size = New-Object Drawing.Size(720,526); $progress.BackColor = [Drawing.Color]::Transparent; $progress.Visible = $false
$stage.Controls.Add($progress)
$title = Label '正在下载运行组件…' 32 40 640 32 14 $true $C.cream $progress
$status = Label '' 32 84 656 44 9 $false $C.muted $progress
# Hand-drawn progress bar: rounded dark track, crimson-to-gold fill, a soft shimmer while unpacking.
$script:barValue = 0; $script:barBusy = $false; $script:barPhase = 0.0
$bar = New-Object GrimoirePanel; $bar.Location = New-Object Drawing.Point(32,132); $bar.Size = New-Object Drawing.Size(656,14); $bar.BackColor = [Drawing.Color]::Transparent
function Round-Rect($x, $y, $w, $h) {
  $r = [math]::Min($h, $w); $gp = New-Object Drawing.Drawing2D.GraphicsPath
  if ($w -le 0) { return $gp }
  $gp.AddArc([float]$x, [float]$y, [float]$r, [float]$h, 90, 180); $gp.AddArc([float]($x + $w - $r), [float]$y, [float]$r, [float]$h, 270, 180); $gp.CloseFigure(); $gp
}
$bar.add_Paint({ param($s,$e)
  $g = $e.Graphics; $g.SmoothingMode = 'AntiAlias'; $w = $bar.Width - 1; $h = $bar.Height - 1
  $track = Round-Rect 0 0 $w $h
  $tb = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(52,41,42)); $g.FillPath($tb, $track); $tb.Dispose()
  if ($script:barBusy) {
    $seg = [int]($w * 0.28); $x = [int](($w + $seg) * $script:barPhase) - $seg
    $g.SetClip($track)
    $rect = New-Object Drawing.Rectangle ($x, 0, [math]::Max(1,$seg), ($h + 1))
    $lg = New-Object Drawing.Drawing2D.LinearGradientBrush $rect, ([Drawing.Color]::FromArgb(0,$C.red)), ([Drawing.Color]::FromArgb(0,$C.gold)), 0.0
    $blend = New-Object Drawing.Drawing2D.ColorBlend 3
    $blend.Colors = @([Drawing.Color]::FromArgb(0,$C.red), $C.red, [Drawing.Color]::FromArgb(0,$C.gold)); $blend.Positions = @(0.0, 0.55, 1.0); $lg.InterpolationColors = $blend
    $g.FillRectangle($lg, $rect); $lg.Dispose(); $g.ResetClip()
  } elseif ($script:barValue -gt 0) {
    $fw = [math]::Max($h, [int]($w * $script:barValue / 1000))
    $fill = Round-Rect 0 0 $fw $h
    $lg = New-Object Drawing.Drawing2D.LinearGradientBrush (New-Object Drawing.Rectangle 0, 0, ($fw + 1), ($h + 1)), $C.red, $C.gold, 0.0
    $g.FillPath($lg, $fill); $lg.Dispose()
    $hl = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(60,255,255,255)); $g.FillRectangle($hl, [float]($h/2), 2, [float]([math]::Max(0,$fw - $h)), [float]([math]::Max(1,$h/4))); $hl.Dispose()
  }
  $edge = Pen $C.line 255 1; $g.DrawPath($edge, $track); $edge.Dispose()
})
$progress.Controls.Add($bar)
$percent = Label '' 600 104 88 20 9 $true $C.gold $progress; $percent.TextAlign = 'MiddleRight'
$shimmer = New-Object Windows.Forms.Timer; $shimmer.Interval = 30
$shimmer.add_Tick({ $script:barPhase = ($script:barPhase + 0.012) % 1.0; $bar.Invalidate() })
function Set-Bar([int]$value) { $script:barBusy = $false; $shimmer.Stop(); $script:barValue = [math]::Max(0, [math]::Min(1000, $value)); $percent.Text = if ($value -gt 0) { ('{0:N0}%' -f ($script:barValue / 10)) } else { '' }; $bar.Invalidate() }
function Set-Busy { $script:barBusy = $true; $percent.Text = ''; $shimmer.Start(); $bar.Invalidate() }
[void](Label ('安装位置：' + $runtimeDir) 32 160 656 20 8 $false $C.muted $progress)
$button = New-Object Windows.Forms.Button; $button.Text = '取消 Cancel'; $button.FlatStyle = 'Flat'; $button.ForeColor = $C.cream
$button.Font = New-Object Drawing.Font($ui, 9, [Drawing.FontStyle]::Bold); Style-Button $button $false; $button.FlatAppearance.BorderColor = $C.red; $button.Location = New-Object Drawing.Point(568,200); $button.Size = New-Object Drawing.Size(120,34); $button.Cursor = 'Hand'
$progress.Controls.Add($button)

$client = New-Object Net.WebClient; $client.Headers.Add('User-Agent','MeguLit-setup')
$script:queue = @(); $script:index = 0; $script:urlIndex = 0; $script:done = $false; $script:mode = ''
$names = @{ base = '基础组件'; reading = '注音分词词典'; voice = '语音引擎' }
$markers = @{ base = 'runtime\node.exe'; reading = 'runtime\reading\sudachidict_full\resources\system.dic'; voice = 'runtime\aivis\run.exe' }

# ---- download source ----
# Users in mainland China often get very slow GitHub downloads. We do not look up the user's IP
# (that would send it to a third-party geo service); the system time zone / UI language is enough
# to decide whether to probe mirrors. When it looks like China, every source gets a short ranged
# download and the fastest wins. Mirrors only relay the same GitHub file; SHA-256 still has to match.
$inChina = ([TimeZoneInfo]::Local.Id -eq 'China Standard Time') -or ((Get-Culture).Name -eq 'zh-CN')
function Source-Name($url) { ([Uri]$url).Host }
function Candidates($id) {
  $direct = @($packs.$id.urls)
  $mirrored = foreach ($m in @($manifest.mirrors)) { foreach ($u in $direct) { $m.Replace('{url}', $u) } }
  if ($inChina) { @($mirrored) + $direct } else { $direct + @($mirrored) }
}
function Probe($url) {
  try {
    $req = [Net.HttpWebRequest]::Create($url); $req.AddRange(0, 1048575); $req.Timeout = 6000; $req.ReadWriteTimeout = 6000; $req.UserAgent = 'MeguLit-setup'
    $sw = [Diagnostics.Stopwatch]::StartNew(); $res = $req.GetResponse(); $stream = $res.GetResponseStream()
    $buf = New-Object byte[] 65536; $n = 0
    while ($sw.ElapsedMilliseconds -lt 6000) { $r = $stream.Read($buf, 0, $buf.Length); if ($r -le 0) { break }; $n += $r }
    $res.Close(); if ($n -lt 65536) { return 0 }
    return $n / [math]::Max(0.05, $sw.Elapsed.TotalSeconds)
  } catch { return 0 }
}
function Order-Sources($id) {
  $list = @(Candidates $id)
  if (-not $inChina -or $list.Count -lt 2) { return $list }
  $status.Text = '正在为你挑选最快的下载源（GitHub / 国内镜像）…'; $form.Refresh()
  $scored = foreach ($u in $list) { [Windows.Forms.Application]::DoEvents(); [pscustomobject]@{ url = $u; speed = (Probe $u) } }
  $ok = @($scored | Where-Object { $_.speed -gt 0 } | Sort-Object speed -Descending | ForEach-Object { $_.url })
  $bad = @($scored | Where-Object { $_.speed -le 0 } | ForEach-Object { $_.url })
  return $ok + $bad
}

function Start-Install($ids) {
  $script:queue = @($ids | Where-Object { -not (Test-Path (Join-Path $Root $markers[$_])) })
  $script:index = 0; $choice.Visible = $false; $progress.Visible = $true; Next-Pack
}
function Current { $script:queue[$script:index] }
function Part { Join-Path $Root ('runtime-' + (Current) + '.part') }
function Next-Pack {
  if ($script:index -ge $script:queue.Count) { $script:done = $true; $form.Close(); return }
  $script:urlIndex = 0; $script:sources = @(Order-Sources (Current)); Start-Download
}
function Start-Download {
  $script:stage = 'download'; $script:mode = 'download'; $button.Text = '取消 Cancel'; Style-Button $button $false; $button.FlatAppearance.BorderColor = $C.red; $status.ForeColor = $C.muted; Set-Bar 0
  $title.Text = '正在下载运行组件…'
  $status.Text = ('[{0}/{1}] 正在下载{2}…  来源 {3}' -f ($script:index+1), $script:queue.Count, $names[(Current)], (Source-Name $script:sources[$script:urlIndex]))
  if (Test-Path (Part)) { Remove-Item (Part) -Force }
  $client.DownloadFileAsync([Uri]$script:sources[$script:urlIndex], (Part))
}
function Fail([string]$message) {
  $script:mode = 'failed'; $status.ForeColor = $C.red; Set-Bar 0
  $title.Text = if ($script:stage -eq 'unpack') { '安装没完成' } else { '下载中断了' }
  $hint = if ($script:stage -eq 'unpack') { '磁盘空间不足或文件被占用时会这样，点「重试」再来一次 / Retry' } else { '检查网络后点「重试」 / Check your connection and retry' }
  $status.Text = $message + "`n" + $hint; $button.Text = '重试 Retry'; Style-Button $button $true
}

$client.add_DownloadProgressChanged({ param($s,$e)
  $total = [math]::Max($e.TotalBytesToReceive, $packs.(Current).size)
  Set-Bar ([int][math]::Min(1000, 1000 * $e.BytesReceived / $total))
  $status.Text = ('[{0}/{1}] 正在下载{2}  {3:N0} / {4:N0} MB  ·  来源 {5}' -f ($script:index+1), $script:queue.Count, $names[(Current)], ($e.BytesReceived/1MB), ($total/1MB), (Source-Name $script:sources[$script:urlIndex]))
})
$client.add_DownloadFileCompleted({ param($s,$e)
  if ($e.Cancelled) { return }
  if ($e.Error) {
    if ($script:urlIndex + 1 -lt $script:sources.Count) { $script:urlIndex++; Start-Download; return }
    $msg = if ($e.Error.InnerException) { $e.Error.InnerException.Message } else { $e.Error.Message }
    Fail ('下载失败：' + $msg); return
  }
  try {
    $part = Part; $unpack = Join-Path $Root ('runtime-' + (Current) + '.unpack')
    $script:stage = 'unpack'
    $status.Text = '正在校验… / Verifying'; $form.Refresh()
    if ((Get-FileHash -Algorithm SHA256 $part).Hash -ne $packs.(Current).sha256.ToUpper()) {
      Remove-Item $part -Force
      if ($script:urlIndex + 1 -lt $script:sources.Count) { $script:urlIndex++; Start-Download; return }
      throw '文件校验失败，可能下载不完整'
    }
    $status.Text = ('正在解压{0}… / Unpacking' -f $names[(Current)]); Set-Busy; $form.Refresh()
    if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }
    New-Item -ItemType Directory $unpack | Out-Null
    $tar = Start-Process -FilePath "$env:SystemRoot\System32\tar.exe" -ArgumentList @('-xf', "`"$part`"", '-C', "`"$unpack`"") -NoNewWindow -PassThru
    $null = $tar.Handle  # keep the handle so ExitCode is readable after exit
    while (-not $tar.HasExited) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 30 }
    $tar.WaitForExit()
    if ($tar.ExitCode -ne 0 -or -not (Test-Path (Join-Path $unpack 'runtime'))) { throw '解压失败' }
    New-Item -ItemType Directory -Force $runtimeDir | Out-Null
    Get-ChildItem (Join-Path $unpack 'runtime') | ForEach-Object { $dest = Join-Path $runtimeDir $_.Name; if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }; Move-Item $_.FullName $dest }
    Remove-Item $unpack -Recurse -Force; Remove-Item $part -Force
    $script:index++; Next-Pack
  } catch { Fail ('安装失败：' + $_.Exception.Message) }
})

$button.add_Click({
  if ($script:mode -eq 'failed') { $script:urlIndex = 0; Start-Download }
  else { $client.CancelAsync(); $form.Close() }
})
$form.add_FormClosing({ if (-not $script:done) { $client.CancelAsync() } })
# MEGULIT_SETUP_PREVIEW=<png>: render the choice page to an image and exit (used to check the layout).
if ($env:MEGULIT_SETUP_PREVIEW) { $form.add_Shown({ if ($env:MEGULIT_SETUP_PREVIEW_STATE -eq 'failed') { $choice.Visible = $false; $progress.Visible = $true; $script:stage = 'download'; Fail '下载失败：无法连接到服务器' }; if ($env:MEGULIT_SETUP_PREVIEW_STATE -eq 'progress') { $choice.Visible = $false; $progress.Visible = $true; $status.Text = '[1/3] 正在下载基础组件  47 / 107 MB  ·  来源 github.com'; Set-Bar 440 }; $form.Refresh(); $bmp = New-Object Drawing.Bitmap $form.Width, $form.Height; $form.DrawToBitmap($bmp, (New-Object Drawing.Rectangle 0,0,$form.Width,$form.Height)); $bmp.Save($env:MEGULIT_SETUP_PREVIEW); $form.Close() }) }
[void]$form.ShowDialog()
$client.Dispose()
Get-ChildItem $Root -Filter 'runtime-*.part' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
if ($script:done -and (Test-Path (Join-Path $Root 'runtime\node.exe'))) { exit 0 } else { exit 1 }
