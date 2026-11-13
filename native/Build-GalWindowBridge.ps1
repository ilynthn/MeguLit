# Rebuilds native\GalWindowBridge.exe from the .cs files next to this script.
# Usage (PowerShell):  powershell -ExecutionPolicy Bypass -File E:\Apps\ToMe.V3\native\Build-GalWindowBridge.ps1
# - Uses the VS 2022 Build Tools C# compiler from the local build-tools folder (MEGULIT_BUILD_TOOLS) when present, otherwise the .NET Framework
#   compiler that ships with Windows.
# - The new exe must pass its own --mode-self-test before it is installed.
# - If ToMe is running, the result is written as GalWindowBridge.updated.exe and ToMe swaps it in on its next start;
#   otherwise the old exe is backed up and replaced right away.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$sources = @('GalWindowBridge.cs','GameTextMask.cs','PageLocator.cs','GameWaitMarker.cs','NativeMaskLayer.cs','DialogDetector.cs','DialogBoxProbe.cs','GameHookVerifier.cs','GameCapture.cs','GameAudio.cs','GlassLayer.cs','GameSceneProbe.cs','GameUiLayer.cs','WaitPageMarker.cs','ReaderPointerGate.cs') | ForEach-Object { Join-Path $native $_ }
foreach ($s in $sources) { if (-not (Test-Path -LiteralPath $s)) { throw "Missing source: $s" } }

$fw = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
if (-not (Test-Path -LiteralPath $fw)) { $fw = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319' }
$compilers = @()
foreach ($c in @($(if ($env:MEGULIT_ROSLYN_CSC) { $env:MEGULIT_ROSLYN_CSC } else { Join-Path $(if ($env:MEGULIT_BUILD_TOOLS) { $env:MEGULIT_BUILD_TOOLS } else { Join-Path (Split-Path (Split-Path $PSScriptRoot)) 'build-tools' }) 'vs2022\MSBuild\Current\Bin\Roslyn\csc.exe' }), (Join-Path $fw 'csc.exe'))) { if (Test-Path -LiteralPath $c) { $compilers += $c } }
if (-not $compilers.Count) { throw 'No C# compiler found (neither VS Build Tools Roslyn nor the .NET Framework csc.exe).' }

# WinRT metadata for Windows.Media.Ocr. Candidates, tried in order:
#  1. the Windows SDK's full union Windows.winmd (UnionMetadata\<version>\Windows.winmd; never the Facade\ stub,
#     which only forwards types and makes the compiler fail)
#  2. the SDK's per-contract .winmd files (References\<version>\...)
#  3. the system's split .winmd files (System32\WinMetadata)
$winmdSets = @()
$kits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10'
$union = Get-ChildItem -Path (Join-Path $kits 'UnionMetadata') -Filter Windows.winmd -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\Facade\\' } | Sort-Object { $_.Directory.Name } -Descending | Select-Object -First 1
if ($union) { $winmdSets += ,@($union.FullName) }
$refRoot = Join-Path $kits 'References'
$refVer = Get-ChildItem -Path $refRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if ($refVer) { $contracts = @(Get-ChildItem -Path $refVer.FullName -Filter *.winmd -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }); if ($contracts.Count) { $winmdSets += ,$contracts } }
$system = @(Get-ChildItem -Path (Join-Path $env:WINDIR 'System32\WinMetadata') -Filter *.winmd -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
if ($system.Count) { $winmdSets += ,$system }
if (-not $winmdSets.Count) { throw 'No WinRT metadata (.winmd) found for Windows.Media.Ocr.' }
$facades = @('System.Runtime.dll','System.Runtime.WindowsRuntime.dll','System.Runtime.InteropServices.WindowsRuntime.dll') | ForEach-Object { Join-Path $fw $_ } | Where-Object { Test-Path -LiteralPath $_ }
$baseRefs = @('System.dll','System.Core.dll','System.Drawing.dll','System.Web.Extensions.dll','System.Windows.Forms.dll') + $facades

$work = Join-Path $env:TEMP ('tome-native-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($work) | Out-Null
$out = Join-Path $work 'GalWindowBridge.exe'
$built = $false
:outer foreach ($csc in $compilers) {
  foreach ($winmd in $winmdSets) {
    $refs = $baseRefs + $winmd
    $cscArgs = @('/nologo','/langversion:5','/optimize+','/target:exe','/platform:x64','/codepage:65001','/utf8output',"/out:$out") + ($refs | ForEach-Object { "/reference:$_" }) + $sources
    Write-Host ("Compiling with $csc (WinRT metadata: " + (Split-Path -Parent $winmd[0]) + ')')
    $log = & $csc @cscArgs 2>&1
    if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $out)) { $log | ForEach-Object { Write-Host $_ }; $built = $true; break outer }
    $log | Select-Object -First 12 | ForEach-Object { Write-Host $_ }
    Write-Host 'Failed with this combination; trying the next one.' -ForegroundColor Yellow
  }
}
if (-not $built) { throw 'GalWindowBridge.exe could not be compiled; the installed exe was left unchanged.' }

& $out --mode-self-test | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Self-test failed (exit $LASTEXITCODE); the installed exe was left unchanged." }
& $out --page-locator-self-test | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Page locator self-test failed (exit $LASTEXITCODE); the installed exe was left unchanged." }
& $out --audio-self-test | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Audio self-test failed (exit $LASTEXITCODE); the installed exe was left unchanged." }
& $out --scene-frame-self-test | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Scene frame self-test failed (exit $LASTEXITCODE); the installed exe was left unchanged." }

$target = Join-Path $native 'GalWindowBridge.exe'
$running = Get-Process -Name GalWindowBridge -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $target }
if ($running) {
  Copy-Item -LiteralPath $out -Destination (Join-Path $native 'GalWindowBridge.updated.exe') -Force
  Write-Host 'ToMe is running: saved as GalWindowBridge.updated.exe. Restart ToMe and it switches to the new build.' -ForegroundColor Green
} else {
  if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target -Destination ($target + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) -Force }
  Copy-Item -LiteralPath $out -Destination $target -Force
  Write-Host "Installed: $target (previous exe kept as .bak-*)" -ForegroundColor Green
}
Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
