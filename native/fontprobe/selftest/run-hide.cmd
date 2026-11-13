@echo off
rem Builds the glyph hide self-test host for both bitnesses and runs each against its MeguLitFont DLL: off-screen DIB,
rem no window, no game. Fails when either DLL is old (no MeguLitFontVersion >= 2) or any hide check fails.
rem Usage: run-hide.cmd [folder with MeguLitFont32/64.dll] (default native\, i.e. build.cmd first)
setlocal
cd /d "%~dp0"
set "DLLDIR=%~1"
if "%DLLDIR%"=="" set "DLLDIR=%~dp0..\.."
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set LIBS=gdi32.lib user32.lib gdiplus.lib d2d1.lib dwrite.lib ole32.lib
if not exist "%TEMP%\megulit-glyphhide64" mkdir "%TEMP%\megulit-glyphhide64"
if not exist "%TEMP%\megulit-glyphhide32" mkdir "%TEMP%\megulit-glyphhide32"
setlocal
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul || exit /b 1
cl /nologo /O2 /EHsc /utf-8 /DUNICODE /D_UNICODE hidehost.cpp /Fe:"%TEMP%\megulit-glyphhide64\host.exe" /Fo"%TEMP%\megulit-glyphhide64\\" /link %LIBS% >nul || exit /b 1
endlocal
setlocal
call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul || exit /b 1
cl /nologo /O2 /EHsc /utf-8 /DUNICODE /D_UNICODE hidehost.cpp /Fe:"%TEMP%\megulit-glyphhide32\host.exe" /Fo"%TEMP%\megulit-glyphhide32\\" /link %LIBS% >nul || exit /b 1
endlocal
echo [64-bit]
"%TEMP%\megulit-glyphhide64\host.exe" "%DLLDIR%\MeguLitFont64.dll" || exit /b 1
echo [32-bit]
"%TEMP%\megulit-glyphhide32\host.exe" "%DLLDIR%\MeguLitFont32.dll" || exit /b 1
