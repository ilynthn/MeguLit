@echo off
rem Self-test of native\MeguLitKrkr32.dll and MeguLitKrkr64.dll against a stand-in KiriKiri host (host.cpp); no game is
rem involved. Run ..\build.cmd first. Toolchains: MEGULIT_VS_X86 (setup_x86.bat) and MEGULIT_VS (VsDevCmd.bat, x64).
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS_X86%"=="" set "MEGULIT_VS_X86=E:\Apps\work\euphoria-test-build\toolchain\msvc\setup_x86.bat"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
if not exist "%MEGULIT_VS_X86%" set "MEGULIT_VS_X86=%~dp0..\..\vsx86.cmd"
set "WORK=%TEMP%\megulit-krkr-selftest"
if not exist "%WORK%\32" mkdir "%WORK%\32"
if not exist "%WORK%\64" mkdir "%WORK%\64"
set FLAGS=/nologo /O2 /MT /EHsc /W3 /wd4828 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /FIwindows.h /FIobjidl.h
cmd /c "call "%MEGULIT_VS_X86%" >nul && cl %FLAGS% /Fo"%WORK%\32\\" host.cpp ..\sdk\tp_stub.cpp /Fe:"%WORK%\32\host.exe" /link user32.lib >nul" || exit /b 1
cmd /c "call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul && cl %FLAGS% /Fo"%WORK%\64\\" host.cpp ..\sdk\tp_stub.cpp /Fe:"%WORK%\64\host.exe" /link user32.lib >nul" || exit /b 1
echo [32]
"%WORK%\32\host.exe" "%~dp0..\..\MeguLitKrkr32.dll" || exit /b 1
echo [64]
"%WORK%\64\host.exe" "%~dp0..\..\MeguLitKrkr64.dll" || exit /b 1
endlocal
