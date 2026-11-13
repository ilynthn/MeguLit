# Self-test of MeguLitScn32/64.dll against a stand-in KiriKiri host (host.cpp, plugin.cpp); no game is involved.
# Run ..\build.cmd first. Toolchains: MEGULIT_VS (VsDevCmd.bat, x64) and MEGULIT_VS_X86 (setup_x86.bat).
$ErrorActionPreference='Stop'
$vs=if($env:MEGULIT_VS){$env:MEGULIT_VS}else{'E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat'}
$vs86=if($env:MEGULIT_VS_X86){$env:MEGULIT_VS_X86}else{'E:\Apps\work\euphoria-test-build\toolchain\msvc\setup_x86.bat'}
if(-not(Test-Path -LiteralPath $vs86)){$env:MEGULIT_VS=$vs;$vs86=Join-Path $PSScriptRoot '..\..\vsx86.cmd'}
$work=Join-Path $env:TEMP 'megulit-scn-selftest';if(Test-Path $work){Remove-Item $work -Recurse -Force}
function Key($dir){$h=[uint64]2166136261;foreach($c in $dir.ToCharArray()){$v=[uint32][char]$c;if($v -ge 65 -and $v -le 90){$v+=32};$h=(($h -bxor $v)*16777619)%4294967296};'{0:x8}' -f $h}
foreach($bit in '32','64'){
 $root=Join-Path $work "root$bit";$game=Join-Path $root "game$bit";New-Item -ItemType Directory (Join-Path $root native),$game | Out-Null
 Copy-Item (Join-Path $PSScriptRoot "..\..\MeguLitScn$bit.dll") (Join-Path $root native)
 $env_=if($bit -eq '32'){"`"$vs86`""}else{"`"$vs`" -arch=x64 -host_arch=x64 -no_logo"}
 $build="call $env_ >nul && cd /d `"$PSScriptRoot`" && cl /nologo /O2 /MT /EHsc /LD /Fo`"$root/`" plugin.cpp /Fe:`"$game\plugin1.dll`" >nul && cl /nologo /O2 /MT /EHsc /DUNICODE /Fo`"$root/`" host.cpp /Fe:`"$game\host.exe`" /link shlwapi.lib user32.lib >nul"
 cmd /c $build;if($LASTEXITCODE){throw "build $bit failed"}
 Copy-Item (Join-Path $game plugin1.dll) (Join-Path $game plugin2.dll)
 $out=Join-Path $root ("cache\kirikiri-scn\"+(Key $game)+'\')
 Push-Location $game;try{& .\host.exe (Join-Path $root "native\MeguLitScn$bit.dll") $out;$code=$LASTEXITCODE}finally{Pop-Location}
 Get-Content (Join-Path $out capture.log) -ErrorAction SilentlyContinue | ForEach-Object {"  [$bit] $_"}
 if($code){throw "x$bit self-test failed ($code)"}
}
