param([switch]$Check)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
# Toolchain discovery (local offline tools folder, or a standard Windows setup); see tools/build-env.ps1.
. (Join-Path $taskRoot 'tools/build-env.ps1')
if ($taskProblems.Count) { $taskProblems | ForEach-Object { Write-Error "MISSING: $_" -ErrorAction Continue }; throw 'Build environment incomplete; run tools/check-env.ps1 for details' }
& (Join-Path $taskRoot 'tools/build-tray-icon.ps1')
& $taskNode (Join-Path $taskRoot 'tools/prepare-reader.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Original overlay source preparation failed' }
& $taskNode (Join-Path $taskRoot 'tools/restore-native-host.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Native overlay host preparation failed' }
& (Join-Path $taskRoot 'tools/build-reader-bridge.ps1')
$taskHookPending = Join-Path $taskRoot 'native/HookBridge.updated.exe'
$taskHookFinal = Join-Path $taskRoot 'native/HookBridge.exe'
& (Join-Path $taskRoot 'native/Build-HookBridge.ps1') -OutputPath $taskHookPending
try { Copy-Item -LiteralPath $taskHookPending -Destination $taskHookFinal -Force; Remove-Item -LiteralPath $taskHookPending -Force }
catch [System.IO.IOException] { Write-Output 'Hook bridge update staged for the next attach' }
# E667 glyph hide: MeguLitFont32/64.dll (native/fontprobe) are not tracked (*.dll is ignored) and Release.ps1 packages whatever
# sits in native/, so a stale DLL once shipped without the hide side. They are rebuilt here every time, and their self-tests
# (decisions; DLL exports MeguLitFontVersion >= 2 and hides off screen, both bitnesses) fail the build.
$taskVsDev = Resolve-First (@($env:MEGULIT_VS, (Join-Path $taskTools 'vs2022\Common7\Tools\VsDevCmd.bat')) + @(if (Test-Path -LiteralPath $vswhere) { & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | ForEach-Object { Join-Path $_ 'Common7\Tools\VsDevCmd.bat' } }))
if (-not $taskVsDev) { throw 'VsDevCmd.bat not found: the MSVC C++ toolset is needed for native/fontprobe (set MEGULIT_VS)' }
$env:MEGULIT_VS = $taskVsDev; Remove-Item Env:MEGULIT_FONT_OUT -ErrorAction SilentlyContinue
# stderr is merged inside cmd: VsDevCmd's harmless "vswhere.exe is not recognized" must not stop the build under ErrorAction Stop.
function Invoke-TaskCmd([string]$Script) { & cmd /c ('""' + $Script + '" 2>&1"') | Out-Host; return $LASTEXITCODE }
if ((Invoke-TaskCmd (Join-Path $taskRoot 'native\fontprobe\build.cmd')) -ne 0) { throw 'MeguLitFont DLL build failed' }
if ((Invoke-TaskCmd (Join-Path $taskRoot 'native\fontprobe\selftest\run-match.cmd')) -ne 0) { throw 'Glyph hide decision self-test failed' }
if ((Invoke-TaskCmd (Join-Path $taskRoot 'native\fontprobe\selftest\run-hide.cmd')) -ne 0) { throw 'MeguLitFont DLL self-test failed (old DLL or glyph hide broken)' }
& (Join-Path $taskRoot 'native/Build-GameStyleProbe.ps1')
& (Join-Path $taskRoot 'native/Build-StartupIsland.ps1') -OutputPath (Join-Path $taskRoot 'native/StartupIsland.exe')
& $taskCsc /nologo /target:exe /optimize+ ("/out:" + (Join-Path $taskRoot 'native\GameProcess.exe')) (Join-Path $taskRoot 'native\GameProcess.cs')
if ($LASTEXITCODE -ne 0) { throw 'Native game process helper build failed' }
# The hook injectors (one per game bitness) and the API key vault were only shipped as prebuilt binaries; build them here.
foreach ($taskHelper in @(@('HookInjector32.exe','/platform:x86','HookInjector.cs','HookTarget.cs'),@('HookInjector64.exe','/platform:x64','HookInjector.cs','HookTarget.cs'),@('ColdCapture32.exe','/platform:x86','ColdCapture.cs'),@('ColdCapture64.exe','/platform:x64','ColdCapture.cs'),@('KeyVault.exe','/reference:System.Security.dll','KeyVault.cs'),@('RuntimeHarvest.exe','/platform:x64','RuntimeHarvest.cs'))) {
 & $taskCsc /nologo /target:exe /optimize+ $taskHelper[1] ('/out:' + (Join-Path $taskRoot ('native\' + $taskHelper[0]))) @($taskHelper[2..($taskHelper.Count-1)] | ForEach-Object { Join-Path $taskRoot ('native\' + $_) })
 if ($LASTEXITCODE -ne 0) { throw "Native helper build failed: $($taskHelper[0])" }
}
& $taskNode --check (Join-Path $taskRoot 'services\bridge.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Service syntax check failed' }
foreach ($taskScript in @('web/app.js','web/primary-buttons.js','web/library-grid-fit.js','web/tray-menu.js','web/launch-feedback.js','web/reader/game-ui.js','web/home-motion.js','web/library-refresh.js','web/series-library.js','web/series-i18n.js','web/game-reception.js','web/settings-autosave.js','web/path-picker.js','web/game-language.js','web/cn-version-guide.js','web/grid-motion.js','web/game-detail.js','web/adaptation-overview.js','web/diagnostics-ui.js','web/settings.js','web/settings-layout.js','web/settings-search.js','web/settings-help.js','web/select-control.js','web/translation-settings.js','web/speech-settings.js','web/voice-style.js','web/background-crop.js','web/backup-ui.js','web/settings-reset.js','web/anki-review.js','web/anki-fit.js','web/anki-card.js','web/reader/host-transport.js','web/reader/bootstrap.js','web/reader/learning-notice.js','web/reader/host-startup.js','web/reader/host-regions.js','web/reader/module-list.js','web/reader/mode.js','web/reader/word-status.js')) {
 & $taskNode --check (Join-Path $taskRoot $taskScript)
 if ($LASTEXITCODE -ne 0) { throw "UI syntax check failed: $taskScript" }
}
foreach ($taskScript in @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'web/reader/modules') -Filter '*.js' -File | ForEach-Object {$_.FullName}) + @('services/reader.cjs','services/legacy-reader-sql.cjs','services/runtime.cjs','services/game-detail.cjs','services/diagnostics.cjs','services/diagnostics-upload.cjs','services/adaptation-overview.cjs','services/anki-review.cjs','services/anki-media.cjs','services/settings-schema.cjs','services/store.cjs','services/assets.cjs','services/locale-launch.cjs','services/patch-swap.cjs','services/game-readiness.cjs','core/game-ui.cjs','core/translate.cjs','services/library-scan.cjs','services/series.cjs','services/series-migration.cjs','services/game-enrichment.cjs','services/launch-path.cjs','core/series-recognition.cjs','services/anki-model.cjs','core/python-installer.cjs','core/lookup-models.cjs','services/brand-migration.cjs','tools/prepare-reader.cjs')) {
 & $taskNode --check $(if ([IO.Path]::IsPathRooted($taskScript)) { $taskScript } else { Join-Path $taskRoot $taskScript })
 if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $taskScript" }
}
# Link the final host with Rust's bundled LLVM linker, without Visual Studio linker helper processes.
if (-not (Test-Path -LiteralPath $taskLld)) { throw 'Bundled Rust LLVM linker not found' }
if (-not $taskMsvc -or -not $taskSdk) { throw 'Local Windows import libraries not found' }
$env:LIB = (Join-Path $taskMsvc.FullName 'lib\x64')+';'+(Join-Path $taskSdk.FullName 'ucrt\x64')+';'+(Join-Path $taskSdk.FullName 'um\x64')
& $taskCargo rustc $taskCargoNet --locked --release --features custom-protocol --manifest-path (Join-Path $taskRoot 'desktop\Cargo.toml') -- -C "linker=$taskLld" -C linker-flavor=lld-link -L ("native="+(Join-Path $taskMsvc.FullName 'lib\x64')) -L ("native="+(Join-Path $taskSdk.FullName 'ucrt\x64')) -L ("native="+(Join-Path $taskSdk.FullName 'um\x64'))
if ($LASTEXITCODE -ne 0) { throw 'Independent desktop build failed' }
$taskBuilt = Join-Path $taskRoot 'desktop\target\release\megulit.exe'
if ($Check) {
 $taskTests = @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'validation') -Filter '*.test.cjs' -File -Recurse | ForEach-Object { $_.FullName })
 if (-not $taskTests.Count) { throw 'No tests found in validation/*.test.cjs; -Check must not pass with zero tests' }
 $taskTestOutput = & $taskNode --test @taskTests 2>&1
 $taskTestExit = $LASTEXITCODE
 $taskTestOutput | Set-Content -LiteralPath (Join-Path $taskRoot 'validation/automated-results.txt') -Encoding utf8
 $taskTestText = $taskTestOutput -join "`n"
 @{ recordedAt=[DateTime]::UtcNow.ToString('o'); exitCode=$taskTestExit; tests=[int]([regex]::Match($taskTestText,'(?m)tests\s+(\d+)').Groups[1].Value); passed=[int]([regex]::Match($taskTestText,'(?m)pass\s+(\d+)').Groups[1].Value); failed=[int]([regex]::Match($taskTestText,'(?m)fail\s+(\d+)').Groups[1].Value) } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'validation/automated-results.json') -Encoding utf8
 Write-Output ($taskTestOutput | Select-Object -Last 9)
 if ($taskTestExit -ne 0) { $taskTestOutput | Select-String -Pattern '^not ok|^\s+(error|location):' | ForEach-Object { Write-Output $_.Line }; throw 'Independent data checks failed; see validation/automated-results.txt' }
 if (-not ([regex]::Match($taskTestText,'(?m)tests\s+(\d+)').Success) -or [int]([regex]::Match($taskTestText,'(?m)tests\s+(\d+)').Groups[1].Value) -eq 0) { throw 'Test runner reported zero tests' }
}
$taskOutput = Join-Path $taskRoot 'MeguLit.exe'
try { Copy-Item -LiteralPath $taskBuilt -Destination $taskOutput -Force }
catch [System.IO.IOException] {
 $taskOutput = Join-Path $taskRoot 'MeguLit.next.exe'
 Copy-Item -LiteralPath $taskBuilt -Destination $taskOutput -Force
 Write-Output 'The running app was left open; the new build is staged as MeguLit.next.exe'
}
$taskWebViewLoader = Get-ChildItem -LiteralPath (Join-Path $taskRoot 'desktop\target\release\build') -Filter WebView2Loader.dll -File -Recurse | Where-Object { $_.Directory.Name -eq 'x64' } | Select-Object -First 1
if (-not $taskWebViewLoader) { throw 'x64 WebView2 loader not found in dependency build outputs' }
$taskLoader = Join-Path $taskRoot 'WebView2Loader.dll'
if (-not (Test-Path -LiteralPath $taskLoader) -or (Get-FileHash -LiteralPath $taskLoader).Hash -ne (Get-FileHash -LiteralPath $taskWebViewLoader.FullName).Hash) { Copy-Item -LiteralPath $taskWebViewLoader.FullName -Destination $taskLoader -Force }
$taskHash = (Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256).Hash.ToLowerInvariant()
@{ schema=1; name='MeguLit'; identity='app.megulit'; artifact=[IO.Path]::GetFileName($taskOutput); builtAt=[DateTime]::UtcNow.ToString('o'); sha256=$taskHash; upstreamRuntime=$false } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'build-manifest.json') -Encoding utf8
Write-Output "Built $taskOutput ($taskHash)"
