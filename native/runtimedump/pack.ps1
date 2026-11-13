# Builds the cold "runtime-dump" runtime pack (docs/runtime-dump-pack.md): MeguLit-runtime-dump-v<Version>.zip with
# MeguLitDump32.dll, MeguLitDump64.dll and pack.json at its top, and writes its size, SHA-256 and download URL into
# setup/runtime.json (one line of its own). Run build.cmd first. Uploading the zip to the GitHub release
# runtime-dump-v<Version> is a release step (ask the user first); until it is there, clients fail the download quietly
# and try again at the next game start.
param([string]$Version='1.0.0',[string]$Out=$(if($env:MEGULIT_WORK){Join-Path $env:MEGULIT_WORK 'runtime-dump-pack'}else{'H:\MeguLit-Work\runtime-dump-pack'}))
$ErrorActionPreference='Stop'
$repo=Resolve-Path (Join-Path $PSScriptRoot '..\..')
$stage=Join-Path $Out 'stage';if(Test-Path $stage){Remove-Item $stage -Recurse -Force};New-Item -ItemType Directory $stage -Force | Out-Null
foreach($bit in '32','64'){Copy-Item (Join-Path $repo "native\MeguLitDump$bit.dll") $stage}
$commit=(git -C $repo rev-parse --short HEAD)
[IO.File]::WriteAllText((Join-Path $stage 'pack.json'),(@{pack='runtime-dump';version=$Version;contract=2;commit=$commit}|ConvertTo-Json -Compress))
$zip=Join-Path $Out "MeguLit-runtime-dump-v$Version.zip";if(Test-Path $zip){Remove-Item $zip -Force}
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
$sha=(Get-FileHash $zip -Algorithm SHA256).Hash;$size=(Get-Item $zip).Length
$unpacked=(Get-ChildItem $stage | Measure-Object Length -Sum).Sum
$url="https://github.com/ilynthn/MeguLit/releases/download/runtime-dump-v$Version/MeguLit-runtime-dump-v$Version.zip"
$manifest=Join-Path (Join-Path $repo 'setup') 'runtime.json'
node (Join-Path $PSScriptRoot 'pack-manifest.cjs') $manifest $size $unpacked $sha $url
if($LASTEXITCODE){throw 'manifest update failed'}
"$zip`n$size bytes, sha256 $sha"
