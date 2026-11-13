param()
$ErrorActionPreference='Stop'
$bridgeRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\native'))
$frameworkRoot=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$bridgeSources=@('GalWindowBridge.cs','ReaderPointerGate.cs','GameTextMask.cs','PageLocator.cs','DialogBoxProbe.cs','GameWaitMarker.cs','NativeMaskLayer.cs','DialogDetector.cs','GameHookVerifier.cs','GameCapture.cs','GameAudio.cs','GlassLayer.cs','GameSceneProbe.cs','GameUiLayer.cs','WaitPageMarker.cs') | ForEach-Object {Join-Path $bridgeRoot $_}
$bridgeReferences=@('System.dll','System.Core.dll','System.Drawing.dll','System.Web.Extensions.dll','System.Windows.Forms.dll')+@('System.Runtime.dll','System.Runtime.WindowsRuntime.dll','System.Runtime.InteropServices.WindowsRuntime.dll' | ForEach-Object {Join-Path $frameworkRoot $_} | Where-Object {Test-Path -LiteralPath $_})+@(Get-ChildItem -LiteralPath (Join-Path $env:WINDIR 'System32\WinMetadata') -Filter *.winmd -File | ForEach-Object {$_.FullName})
# Use the Windows .NET Framework compiler directly; this build needs no Visual Studio process or telemetry service.
$bridgeCompiler=Join-Path $frameworkRoot 'csc.exe'
if(-not(Test-Path -LiteralPath $bridgeCompiler)){throw 'Windows .NET Framework C# compiler not found'}
$bridgePending=Join-Path $bridgeRoot 'GalWindowBridge.updated.exe'
$bridgeArgs=@('/nologo','/langversion:5','/optimize+','/target:exe','/platform:x64','/codepage:65001','/utf8output',('/out:'+$bridgePending))+@($bridgeReferences | ForEach-Object {'/reference:'+$_})+$bridgeSources
& $bridgeCompiler @bridgeArgs
if($LASTEXITCODE -ne 0){throw 'Reader bridge compilation failed'}
$bridgeTarget=Join-Path $bridgeRoot 'GalWindowBridge.exe'
try { Copy-Item -LiteralPath $bridgePending -Destination $bridgeTarget -Force;Remove-Item -LiteralPath $bridgePending -Force }
catch [System.IO.IOException] {Write-Output 'Reader bridge is in use; it will be replaced at the next MeguLit startup'}
