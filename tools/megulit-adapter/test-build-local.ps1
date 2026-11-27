# SPDX-License-Identifier: GPL-3.0-or-later
# 2026-11-28 (owner: 测试版用 Rust 自己构建) the local half of tools/megulit-adapter/test-build-all.cjs: builds, in the integration tree,
#  -Shell  the MeguLit.exe shell with cargo (web\ embedded, as Build.ps1 links it), target folder -CargoTarget (kept between builds:
#          incremental)
#  -PartList  "a,b": the native C++ parts of native/native-builds.json by name (their own build.cmd with the MSVC of the build tools folder);
#          a part whose "requires" tree is not on this machine is reported, not built
# The toolchain is tools/build-env.ps1's (MEGULIT_BUILD_TOOLS: the offline tools folder). Self-tests are left to the PR's CI.
# Prints one JSON line: {"shell":{"ok":..,"exe":..,"loader":..,"why":..},"parts":{"<name>":{"ok":..,"why":..}}}
param([Parameter(Mandatory)][string]$Tree,[string]$CargoTarget='',[switch]$Shell,[string]$PartList='')
$ErrorActionPreference = 'Stop'
$Parts = @($PartList -split '[,;\s]+' | Where-Object { $_ })
$out = [ordered]@{ shell = $null; parts = [ordered]@{} }
function Done { $out | ConvertTo-Json -Depth 5 -Compress | Write-Output; exit 0 }
try { . (Join-Path $Tree 'tools/build-env.ps1') } catch { $out.shell = @{ ok = $false; why = "build-env: $($_.Exception.Message)" }; foreach ($p in $Parts) { $out.parts[$p] = @{ ok = $false; why = 'build-env' } }; Done }
# cargo and cl write progress to stderr: under Stop, Windows PowerShell 5.1 would turn the first line into an error
$ErrorActionPreference = 'Continue'
$why = if ($taskProblems.Count) { ($taskProblems -join '; ') } else { '' }

if ($Shell) {
 if ($why -or -not (Test-Path -LiteralPath $taskLld) -or -not $taskMsvc -or -not $taskSdk) { $out.shell = @{ ok = $false; why = $(if ($why) { $why } else { 'linker or import libraries not found' }) } }
 else {
  if ($CargoTarget) { $env:CARGO_TARGET_DIR = $CargoTarget } else { $CargoTarget = Join-Path $Tree 'desktop\target' }
  $libs = @((Join-Path $taskMsvc.FullName 'lib\x64'), (Join-Path $taskSdk.FullName 'ucrt\x64'), (Join-Path $taskSdk.FullName 'um\x64'))
  $env:LIB = $libs -join ';'
  $exe = Join-Path $CargoTarget 'release\megulit.exe'; Remove-Item -LiteralPath $exe -Force -ErrorAction SilentlyContinue
  $log = & $taskCargo rustc $taskCargoNet --locked --release --features custom-protocol --manifest-path (Join-Path $Tree 'desktop\Cargo.toml') -- -C "linker=$taskLld" -C linker-flavor=lld-link @($libs | ForEach-Object { '-L'; "native=$_" }) 2>&1
  $code = $LASTEXITCODE
  $loader = Get-ChildItem -LiteralPath (Join-Path $CargoTarget 'release\build') -Filter WebView2Loader.dll -File -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Directory.Name -eq 'x64' } | Select-Object -First 1
  if ($code -eq 0 -and (Test-Path -LiteralPath $exe) -and $loader) { $out.shell = @{ ok = $true; exe = $exe; loader = $loader.FullName } }
  else { $out.shell = @{ ok = $false; why = ('cargo exit ' + $code + ': ' + (($log | Select-Object -Last 6) -join ' | ')) } }
 }
}

if ($Parts.Count) {
 $vs = Resolve-First (@($env:MEGULIT_VS, (Join-Path $taskTools 'vs2022\Common7\Tools\VsDevCmd.bat')))
 $list = Get-Content -LiteralPath (Join-Path $Tree 'native/native-builds.json') -Raw | ConvertFrom-Json
 foreach ($p in $Parts) {
  $nb = $list | Where-Object { $_.name -eq $p } | Select-Object -First 1
  if (-not $nb) { $out.parts[$p] = @{ ok = $false; why = 'not in native-builds.json' }; continue }
  if ($nb.requires -and -not (Test-Path -LiteralPath $nb.requires)) { $out.parts[$p] = @{ ok = $false; why = "needs $($nb.requires)" }; continue }
  if (-not $vs) { $out.parts[$p] = @{ ok = $false; why = 'VsDevCmd.bat not found' }; continue }
  $env:MEGULIT_VS = $vs; $env:MEGULIT_VS_X86 = 'none'; Remove-Item Env:MEGULIT_FONT_OUT -ErrorAction SilentlyContinue
  # an old output must not pass for a new one when this build fails
  foreach ($o in $nb.outputs) { Remove-Item -LiteralPath (Join-Path $Tree $o) -Force -ErrorAction SilentlyContinue }
  $build = Join-Path $Tree ($nb.build -replace '/', '\')
  if ($build -like '*.ps1') { $log = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $build 2>&1 } else { $log = & cmd /c ('""' + $build + '" 2>&1"') }
  $code = $LASTEXITCODE
  $missing = @($nb.outputs | Where-Object { -not (Test-Path -LiteralPath (Join-Path $Tree $_)) })
  if ($code -eq 0 -and -not $missing.Count) { $out.parts[$p] = @{ ok = $true } }
  else { $out.parts[$p] = @{ ok = $false; why = ('exit ' + $code + $(if ($missing.Count) { ', missing ' + ($missing -join ', ') } else { '' }) + ': ' + (($log | Select-Object -Last 4) -join ' | ')) } }
 }
}
Done
