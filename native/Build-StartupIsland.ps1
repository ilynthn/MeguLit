# Build the startup progress bar and its closing MeguLit logo
param([string]$OutputPath='')
$ErrorActionPreference='Stop'
$native=$PSScriptRoot
if(!$OutputPath){$OutputPath=Join-Path $native 'StartupIsland.updated.exe'}
$work=[IO.Path]::GetFullPath((Join-Path $env:TEMP ('tome-startup-'+[Guid]::NewGuid().ToString('N'))))
[IO.Directory]::CreateDirectory($work)|Out-Null
try {
  # The logo is the committed brand artwork (docs/assets/logo.png); the surface draws nothing else besides the bar.
  $logo=Join-Path (Split-Path $native -Parent) 'docs/assets/logo.png'
  if(!(Test-Path -LiteralPath $logo)){throw "Startup artwork missing: expected $logo"}
  $compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  if(!(Test-Path -LiteralPath $compiler)){$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'}
  $built=Join-Path $work 'StartupIsland.exe'
  & $compiler /nologo /langversion:5 /optimize+ /target:winexe /platform:x64 /codepage:65001 /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll "/resource:$logo,MeguLit.Logo" "/out:$built" (Join-Path $native 'StartupIsland.cs')
  if($LASTEXITCODE -ne 0){throw 'Startup build failed'}
  $probe=Start-Process -FilePath $built -ArgumentList '--surface-self-test' -WindowStyle Hidden -PassThru -Wait
  if($probe.ExitCode -ne 0){throw 'Startup surface selection test failed'}
  Copy-Item -LiteralPath $built -Destination $OutputPath -Force
  Write-Output "Built and checked: $OutputPath"
} finally {
  $tempRoot=[IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')+'\'
  if(!$work.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or !(Split-Path -Leaf $work).StartsWith('tome-startup-')){throw 'Refusing to remove an unexpected build path'}
  Remove-Item -LiteralPath $work -Recurse -Force
}
