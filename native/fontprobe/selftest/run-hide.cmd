@echo off
rem Builds the glyph hide self-test host (64-bit) and runs it against MeguLitFont64.dll: off-screen DIB, no window, no game.
rem Usage: run-hide.cmd [folder with MeguLitFont64.dll] (default native\, i.e. build.cmd first)
setlocal
cd /d "%~dp0"
set "DLLDIR=%~1"
if "%DLLDIR%"=="" set "DLLDIR=%~dp0..\.."
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul || exit /b 1
cl /nologo /O2 /EHsc /utf-8 /DUNICODE /D_UNICODE hidehost.cpp /Fe:%TEMP%\megulit-glyphhide-host.exe /Fo%TEMP%\ /link gdi32.lib user32.lib gdiplus.lib d2d1.lib dwrite.lib ole32.lib >nul || exit /b 1
"%TEMP%\megulit-glyphhide-host.exe" "%DLLDIR%\MeguLitFont64.dll"
