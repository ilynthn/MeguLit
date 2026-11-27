@echo off
rem Builds native\MeguLitWgcShot.exe (x64; it runs as its own process, so one build serves 32- and 64-bit games).
rem Objects go to %MEGULIT_BUILD_OUT% (default obj\ here).
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
if "%MEGULIT_BUILD_OUT%"=="" set "MEGULIT_BUILD_OUT=%~dp0obj"
if not exist "%MEGULIT_BUILD_OUT%" mkdir "%MEGULIT_BUILD_OUT%"
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul 2>nul || exit /b 1
cl /nologo /std:c++20 /O2 /EHsc /W3 /utf-8 /MT /permissive- /DUNICODE /D_UNICODE /Fo"%MEGULIT_BUILD_OUT%\\" WgcShot.cpp /Fe:..\MeguLitWgcShot.exe /link /SUBSYSTEM:CONSOLE d3d11.lib dxgi.lib windowscodecs.lib dwmapi.lib user32.lib gdi32.lib ole32.lib windowsapp.lib >"%MEGULIT_BUILD_OUT%\wgcshot.log" || (type "%MEGULIT_BUILD_OUT%\wgcshot.log" & exit /b 1)
echo MeguLitWgcShot built
