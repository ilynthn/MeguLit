param([string]$OutputPath)
$ErrorActionPreference='Stop'
# Roslyn csc (C# 6+): MEGULIT_ROSLYN_CSC, the local build-tools folder, or any Visual Studio / Build Tools install.
$candidates=@($env:MEGULIT_ROSLYN_CSC,(Join-Path $(if($env:MEGULIT_BUILD_TOOLS){$env:MEGULIT_BUILD_TOOLS}else{Join-Path (Split-Path (Split-Path $PSScriptRoot)) 'build-tools'}) 'vs2022\MSBuild\Current\Bin\Roslyn\csc.exe'))
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if(Test-Path -LiteralPath $vswhere){foreach($vs in @(& $vswhere -products * -property installationPath)){$candidates+=Join-Path $vs 'MSBuild\Current\Bin\Roslyn\csc.exe'}}
$compiler=$candidates|Where-Object{$_ -and (Test-Path -LiteralPath $_)}|Select-Object -First 1
if(-not $compiler){throw 'Roslyn C# compiler not found: install Visual Studio 2022 or Build Tools (MSBuild), or set MEGULIT_ROSLYN_CSC'}
if(-not $OutputPath){$OutputPath=Join-Path $PSScriptRoot 'HookBridge.exe';if(Get-Process HookBridge -ErrorAction SilentlyContinue){throw 'Stop Hook through ToMe before installing a new bridge'}}
$sources=@('HookBridge.cs','EmbedTextPolicy.cs','HookSourceFrames.cs','WaitRenderHook.cs','HookTarget.cs','HookSignature.cs')|ForEach-Object{Join-Path $PSScriptRoot $_}
& $compiler /nologo /langversion:5 /optimize+ /target:exe /platform:x64 /codepage:65001 "/out:$OutputPath" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll @sources
if($LASTEXITCODE -ne 0){throw 'HookBridge compilation failed'}
# 32-bit helper that locates the system Direct3D9 functions for the wait-marker draw hook (see WaitRenderHook.cs).
& $compiler /nologo /langversion:5 /optimize+ /target:exe /platform:x86 /codepage:65001 ("/out:"+(Join-Path (Split-Path $OutputPath) 'D3D9Probe.exe')) /reference:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'D3D9Probe.cs')
if($LASTEXITCODE -ne 0){throw 'D3D9Probe compilation failed'}
& $OutputPath --self-test
if($LASTEXITCODE -ne 0){throw 'HookBridge self-test failed'}
