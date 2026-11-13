@echo off
rem Builds and runs the glyph hide decision self-test (GlyphMatch.h); no game, no DLL. Output goes to %TEMP%.
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul || exit /b 1
cl /nologo /O2 /EHsc /W3 /utf-8 match.cpp /Fe:%TEMP%\megulit-glyphmatch.exe /Fo%TEMP%\ >nul || exit /b 1
"%TEMP%\megulit-glyphmatch.exe"
