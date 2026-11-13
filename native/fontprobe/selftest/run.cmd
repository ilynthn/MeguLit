@echo off
rem Builds the 64-bit self-test host and runs it against ..\..\MeguLitFont64.dll (build.cmd first).
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul || exit /b 1
cl /nologo /O2 /EHsc /utf-8 /DUNICODE /D_UNICODE host.cpp /Fe:%TEMP%\megulit-fontprobe-host.exe /Fo%TEMP%\ /link gdi32.lib user32.lib >nul || exit /b 1
"%TEMP%\megulit-fontprobe-host.exe" "%~dp0..\..\MeguLitFont64.dll" C:\Windows\Fonts\msgothic.ttc
