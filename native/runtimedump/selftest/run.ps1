# Self-test of MeguLitDump32/64.dll against a stand-in game (host.cpp); no game is involved. Run ..\build.cmd first.
# Work folder: MEGULIT_WORK (default H:\MeguLit-Work)\runtime-dump-selftest.
$ErrorActionPreference='Stop'
$vs=if($env:MEGULIT_VS){$env:MEGULIT_VS}else{'E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat'}
$base=if($env:MEGULIT_WORK){$env:MEGULIT_WORK}else{'H:\MeguLit-Work'}
$work=Join-Path $base 'runtime-dump-selftest';if(Test-Path $work){Remove-Item $work -Recurse -Force}
foreach($bit in '32','64'){
 $game=Join-Path $work "game$bit";$out=Join-Path $work "out$bit";New-Item -ItemType Directory $game,$out | Out-Null
 $arch=if($bit -eq '32'){'x86'}else{'x64'}
 cmd /c "call `"$vs`" -arch=$arch -host_arch=x64 -no_logo >nul && cd /d `"$PSScriptRoot`" && cl /nologo /O2 /MT /EHsc /utf-8 /Fo`"$game/`" host.cpp cases\\*.cpp /Fe:`"$game\host.exe`" >nul"
 if($LASTEXITCODE){throw "build $bit failed"}
 # Stand-in middleware DLLs (fakedll\<Name>.cpp -> <game>\<Name>.dll) for module cases that hook a DLL's exports.
 foreach($f in Get-ChildItem (Join-Path $PSScriptRoot 'fakedll') -Filter *.cpp -ErrorAction SilentlyContinue){
  cmd /c "call `"$vs`" -arch=$arch -host_arch=x64 -no_logo >nul && cd /d `"$PSScriptRoot`" && cl /nologo /Od /MT /LD /utf-8 /Fo`"$game/`" fakedll\$($f.Name) /Fe:`"$game\$($f.BaseName).dll`" /link /OPT:NOICF >nul"
  if($LASTEXITCODE){throw "build $bit $($f.Name) failed"}
 }
 Push-Location $game;try{& .\host.exe (Join-Path $PSScriptRoot "..\..\MeguLitDump$bit.dll") $out;$code=$LASTEXITCODE}finally{Pop-Location}
 Get-ChildItem $out -Recurse -Filter dump.log | Get-Content | ForEach-Object {"  [$bit] $_"}
 if($code){throw "x$bit self-test failed ($code)"}
}
'runtime-dump self-test passed'
