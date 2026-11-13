@echo off
rem Builds and runs the MeguLitGdiHide.h self-test (32-bit, like the game hook). Exit code = number of failures.
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
call "%MEGULIT_VS%" -arch=x86 -no_logo >nul || exit /b 1
cl /nologo /O2 /EHsc /std:c++17 /utf-8 gdihide.cpp /Fe:%TEMP%\megulit-gdihide.exe /Fo%TEMP%\ /link gdi32.lib user32.lib >nul || exit /b 1
"%TEMP%\megulit-gdihide.exe"
