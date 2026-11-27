# Build the startup progress bar and its closing MeguLit logo
param([string]$OutputPath='')
$ErrorActionPreference='Stop'
$native=$PSScriptRoot
if(!$OutputPath){$OutputPath=Join-Path $native 'StartupIsland.updated.exe'}
$work=[IO.Path]::GetFullPath((Join-Path $env:TEMP ('tome-startup-'+[Guid]::NewGuid().ToString('N'))))
[IO.Directory]::CreateDirectory($work)|Out-Null
try {
  # The closing logo, in the two parts the promo video and the website animate: the cape, and the hat with the letters.
  $cape=Join-Path $native 'splash-logo-cape.png';$rest=Join-Path $native 'splash-logo-rest.png'
  foreach($art in $cape,$rest){if(!(Test-Path -LiteralPath $art)){throw "Startup artwork missing: expected $art"}}
  $compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  if(!(Test-Path -LiteralPath $compiler)){$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'}
  $built=Join-Path $work 'StartupIsland.exe'
  & $compiler /nologo /langversion:5 /optimize+ /target:winexe /platform:x64 /codepage:65001 /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll "/resource:$cape,MeguLit.LogoCape" "/resource:$rest,MeguLit.LogoRest" "/out:$built" (Join-Path $native 'StartupIsland.cs')
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
