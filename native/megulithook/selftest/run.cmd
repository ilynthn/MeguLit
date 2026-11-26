@echo off
rem Builds and runs the MeguLitGdiHide.h and MeguLitEmbedWait.h (A6 embed wait replay) self-tests as a 32-bit and as a 64-bit host process (the hook ships for both),
rem then checks that both shipped hook DLLs carry the GDI hide version marker. Exit code = failures (1 for a DLL miss).
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
if not exist "%TEMP%\megulit-gdihide32" mkdir "%TEMP%\megulit-gdihide32"
if not exist "%TEMP%\megulit-gdihide64" mkdir "%TEMP%\megulit-gdihide64"
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 gdihide.cpp /Fe:"%TEMP%\megulit-gdihide32\host.exe" /Fo"%TEMP%\megulit-gdihide32\\" /link gdi32.lib user32.lib >nul" || exit /b 1
cmd /c "call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 gdihide.cpp /Fe:"%TEMP%\megulit-gdihide64\host.exe" /Fo"%TEMP%\megulit-gdihide64\\" /link gdi32.lib user32.lib >nul" || exit /b 1
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 embedwait.cpp /Fe:"%TEMP%\megulit-gdihide32\embedwait.exe" /Fo"%TEMP%\megulit-gdihide32\\" >nul" || exit /b 1
cmd /c "call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 embedwait.cpp /Fe:"%TEMP%\megulit-gdihide64\embedwait.exe" /Fo"%TEMP%\megulit-gdihide64\\" >nul" || exit /b 1
rem A6 embed wait replay (MeguLitEmbedWait.h): must pass, and the old waiting (--old) must fail, so the test can see a regression
set "MEGULIT_TEST_OUT=%TEMP%\megulit-pal-text-bounds"
call "%~dp0pal-text-bounds.cmd" || exit /b 1
for %%B in (32 64) do (
 echo [embed wait %%B-bit]
 "%TEMP%\megulit-gdihide%%B\embedwait.exe"
 if errorlevel 1 exit /b 1
 "%TEMP%\megulit-gdihide%%B\embedwait.exe" --old >nul
 if not errorlevel 1 (echo FAIL embed wait replay does not catch the old waiting& exit /b 1)
 echo PASS embed wait replay catches the old waiting
)
echo [32-bit]
"%TEMP%\megulit-gdihide32\host.exe" || exit /b 1
echo [64-bit]
"%TEMP%\megulit-gdihide64\host.exe" || exit /b 1
for %%D in (MeguLitHook32.dll MeguLitHook64.dll) do (
 findstr /m /c:"MeguLit_GDIHIDE armed version=2" "%~dp0..\%%D" >nul && (echo PASS %%D carries MeguLit_GDIHIDE armed version=2) || (echo FAIL %%D lacks the GDI hide version marker & exit /b 1)
)
rem source no-draw (MeguLitDrawSkip.h): the KiriKiri layer DrawText shape, locked message layer, other layers untouched, 32- and 64-bit
call "%~dp0run-drawskip.cmd" || exit /b 1
rem exact adapter match (MeguLitMatch.h): no other MAGES or CatSystem2 program reaches an adapter
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 match.cpp /Fe:"%TEMP%\megulit-gdihide32\match.exe" /Fo"%TEMP%\megulit-gdihide32\\" >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\match.exe"
 if errorlevel 1 exit /b 1
rem engine-draw YU-RIS signature (YurisDrawSig.h) on bytes of the four known builds
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 yurisdraw.cpp /Fe:"%TEMP%\megulit-gdihide32\yurisdraw.exe" /Fo"%TEMP%\megulit-gdihide32\\" >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\yurisdraw.exe"
 if errorlevel 1 exit /b 1
rem engine-draw GDI draw sites (DrawSitesSig.h) on bytes around every known site of the owner's exes
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 drawsites.cpp /Fe:"%TEMP%\megulit-gdihide32\drawsites.exe" /Fo"%TEMP%\megulit-gdihide32\\" >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\drawsites.exe"
 if errorlevel 1 exit /b 1
rem engine-draw GDI draw sites, the run-time gate (DrawSites.h) driven like MinHook drives it on a call site
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 /I stub drawsites-gate.cpp /Fe:"%TEMP%\megulit-gdihide32\drawsites-gate.exe" /Fo"%TEMP%\megulit-gdihide32\\" user32.lib gdi32.lib >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\drawsites-gate.exe"
 if errorlevel 1 exit /b 1
rem Permission toggles and SEH use a real MinHook patch and relocated trampoline in this self-test process.
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 /I ..\..\shared\minhook\include drawsites-permission.cpp ..\..\shared\minhook\src\buffer.c ..\..\shared\minhook\src\hook.c ..\..\shared\minhook\src\trampoline.c ..\..\shared\minhook\src\hde\hde32.c /Fe:"%TEMP%\megulit-gdihide32\drawsites-permission.exe" /Fo"%TEMP%\megulit-gdihide32\\" user32.lib gdi32.lib >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\drawsites-permission.exe" || exit /b 1
rem engine-draw SiglusEngine signature (SiglusDrawSig.h) on the windows of CLANNAD and Summer Pockets
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 siglusdraw.cpp /Fe:"%TEMP%\megulit-gdihide32\siglusdraw.exe" /Fo"%TEMP%\megulit-gdihide32\\" >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\siglusdraw.exe"
 if errorlevel 1 exit /b 1
rem engine-draw SiglusEngine runtime replay (SiglusDraw.h): the real gates and MinHook on stand-ins, one page with ruby, name, choice, clear, backlog
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 /I"%~dp0..\..\shared\minhook\include" siglusdraw-gate.cpp "%~dp0..\..\shared\minhook\src\hook.c" "%~dp0..\..\shared\minhook\src\buffer.c" "%~dp0..\..\shared\minhook\src\trampoline.c" "%~dp0..\..\shared\minhook\src\hde\hde32.c" /Fe:"%TEMP%\megulit-gdihide32\siglusgate.exe" /Fo"%TEMP%\megulit-gdihide32\\" /link user32.lib >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\siglusgate.exe" >nul
 if errorlevel 1 (echo FAIL siglus draw gate replay& exit /b 1)
 echo PASS siglus draw gate replay
rem engine-draw MAGES signature (MagesDrawSig.h) on the decrypted code of the five known Steam builds
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 magesdraw.cpp /Fe:"%TEMP%\megulit-gdihide32\magesdraw.exe" /Fo"%TEMP%\megulit-gdihide32\\" >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\magesdraw.exe"
 if errorlevel 1 exit /b 1
rem engine-draw MAGES runtime (MagesDraw.h): real MinHook detours on a stand-in engine, the whole commit / clear / show / glyph chain
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 /I..\..\shared\minhook\include magesgate.cpp ..\..\shared\minhook\src\hook.c ..\..\shared\minhook\src\buffer.c ..\..\shared\minhook\src\trampoline.c ..\..\shared\minhook\src\hde\hde32.c /Fe:"%TEMP%\megulit-gdihide32\magesgate.exe" /Fo"%TEMP%\megulit-gdihide32\\" >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\magesgate.exe"
rem engine-draw CatSystem2 signature (CS2DrawSig.h) on bytes of the known build (ISLAND)
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 cs2draw.cpp /Fe:"%TEMP%\megulit-gdihide32\cs2draw.exe" /Fo"%TEMP%\megulit-gdihide32\\" >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\cs2draw.exe"
rem engine-draw BGI signature (BgiDrawSig.h) on bytes of the known builds
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 bgidraw.cpp /Fe:"%TEMP%\megulit-gdihide32\bgidraw.exe" /Fo"%TEMP%\megulit-gdihide32\\" >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\bgidraw.exe"
 if errorlevel 1 exit /b 1
rem engine-draw Unity IL2CPP: the role rules and ranges on the owner's two IL2CPP games, and the runtime (fake il2cpp API, real unwind), 32- and 64-bit
for %%A in (x86 x64) do (
 cmd /c "call "%MEGULIT_VS%" -arch=%%A -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 il2cppdraw.cpp /Fe:"%TEMP%\megulit-il2cpp-%%A-roles.exe" /Fo"%TEMP%\\" >nul" || exit /b 1
 "%TEMP%\megulit-il2cpp-%%A-roles.exe" || exit /b 1
 cmd /c "call "%MEGULIT_VS%" -arch=%%A -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 il2cppgate.cpp /Fe:"%TEMP%\megulit-il2cpp-%%A-gate.exe" /Fo"%TEMP%\\" >nul" || exit /b 1
 "%TEMP%\megulit-il2cpp-%%A-gate.exe" || exit /b 1
)
rem one hook runtime (2026-11-19): the ISLAND, STEINS;GATE, euphoria HD adapters are part of MeguLitHook32
for %%M in (ToMeCS2_DRAW ToMeSG_EMBED EmbedEuphoria474_DrawHide_TEST2) do (
 findstr /m /c:"%%M" "%~dp0..\MeguLitHook32.dll" >nul && (echo PASS MeguLitHook32.dll carries %%M) || (echo FAIL MeguLitHook32.dll lacks %%M & exit /b 1)
)

rem Majiro complete-string observer: signatures and real MinHook gate, x86 and x64 stub
call "%~dp0run-majiro.cmd" || exit /b 1
rem AdvHD version-pinned diagnostic input, custom EAX + eleven-word ABI and x64 no-op.
call "%~dp0run-advhd.cmd" || exit /b 1
rem CMVS paired full-input diagnostics, real ECX/two-word callee-cleaned ABI.
call "%~dp0run-cmvs.cmd" || exit /b 1
rem FVP raw append diagnostics, real ECX/one-word ret4 ABI.
call "%~dp0run-fvp.cmd" || exit /b 1
rem BGI trusted UTF16 control and reversible observation, real link-call/free detours.
call "%~dp0run-bgi-permission.cmd" || exit /b 1
rem YU-RIS trusted UTF16 control and reversible observation, real glyph-call detour.
call "%~dp0run-yuris-permission.cmd" || exit /b 1

rem minori exact English-build byte-string input observer, default off; no game execution.
call "%~dp0run-minori.cmd" || exit /b 1
rem Siglus trusted control, reversible Push/Clear/Frame observation and idle flush.
call "%~dp0run-siglus-permission.cmd" || exit /b 1

rem MAGES strict control, persistent permission epochs, TLS return ownership and actual cdecl gates.
call "%~dp0run-mages-permission.cmd" || exit /b 1
