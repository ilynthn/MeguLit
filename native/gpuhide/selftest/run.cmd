@echo off
rem Self-test of hide layer 4 (MeguLitGpu32/64.dll): x86 and x64 hosts, Direct3D 9 (DrawPrimitiveUP, vertex buffer with
rem transforms, indexed, vertex declaration + vertex shader with one triangle fan per glyph), Direct3D 11 (NDC positions, guessed input layout), OpenGL (GLSL + vertex buffer; fixed function + client arrays)
rem and GDI blits; font dots at the source (fontdotshost: EENZ / BMP glyph sheets served dotted through the file APIs). Usage: run.cmd [dll folder]   (default native\). Exit code 0 = all passed.
setlocal
cd /d "%~dp0"
set "DLLS=%~1"
if "%DLLS%"=="" set "DLLS=%~dp0..\.."
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set "OUT=%TEMP%\megulit-gpuhide-selftest"
if not exist "%OUT%" mkdir "%OUT%"
set "MH=..\..\shared\minhook"
set "FREEZE=freeze-close.c %MH%\src\buffer.c %MH%\src\trampoline.c %MH%\src\hde\hde32.c %MH%\src\hde\hde64.c"
for %%b in (freeze32 freeze64) do if not exist "%OUT%\%%b" mkdir "%OUT%\%%b"
set FLAGS=/nologo /O2 /MT /EHsc /W3 /utf-8 /DUNICODE /D_UNICODE
setlocal
call "%~dp0..\..\vsx86.cmd" >nul || exit /b 1
cl %FLAGS% /Fo"%OUT%\host32.obj" host.cpp /Fe:"%OUT%\host32.exe" /link d3d9.lib d3d11.lib d3dcompiler.lib opengl32.lib user32.lib gdi32.lib >nul || exit /b 1
cl %FLAGS% /Fo"%OUT%\fontdots32.obj" fontdotshost.cpp /Fe:"%OUT%\fontdots32.exe" >nul || exit /b 1
cl %FLAGS% /I%MH%\include /Fo"%OUT%\freeze32\\" %FREEZE% /Fe:"%OUT%\freeze32.exe" >nul || exit /b 1
endlocal
setlocal
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul || exit /b 1
cl %FLAGS% /Fo"%OUT%\host64.obj" host.cpp /Fe:"%OUT%\host64.exe" /link d3d9.lib d3d11.lib d3dcompiler.lib opengl32.lib user32.lib gdi32.lib >nul || exit /b 1
cl %FLAGS% /Fo"%OUT%\fontdots64.obj" fontdotshost.cpp /Fe:"%OUT%\fontdots64.exe" >nul || exit /b 1
cl %FLAGS% /I%MH%\include /Fo"%OUT%\freeze64\\" %FREEZE% /Fe:"%OUT%\freeze64.exe" >nul || exit /b 1
rem page redraw rule of the glyph learner (CHAOS;CHILD 2026-11-21)
cl %FLAGS% /std:c++17 /Fo"%OUT%\redraw.obj" redraw.cpp /Fe:"%OUT%\redraw.exe" >nul || exit /b 1
endlocal
set FAIL=0
"%OUT%\freeze32.exe" || set FAIL=1
"%OUT%\freeze64.exe" || set FAIL=1
call "%~dp0run-scope.cmd" || set FAIL=1
for %%m in (d3d9-up d3d9-vb d3d9-ivb d3d9-quad4 d3d9-decl d3d11 gl gl-ff gdi) do (
 "%OUT%\host32.exe" "%DLLS%\MeguLitGpu32.dll" %%m || set FAIL=1
 "%OUT%\host64.exe" "%DLLS%\MeguLitGpu64.dll" %%m || set FAIL=1
)
call "%~dp0run-trace.cmd" "%DLLS%" || set FAIL=1
call "%~dp0run-color.cmd" || set FAIL=1
"%OUT%\redraw.exe" || set FAIL=1
"%OUT%\fontdots32.exe" "%DLLS%\MeguLitGpu32.dll" || set FAIL=1
"%OUT%\fontdots64.exe" "%DLLS%\MeguLitGpu64.dll" || set FAIL=1
findstr /c:"MeguLitGpu version=1" "%DLLS%\MeguLitGpu32.dll" >nul || (echo FAIL MeguLitGpu32.dll has no version marker & set FAIL=1)
findstr /c:"MeguLitGpu version=1" "%DLLS%\MeguLitGpu64.dll" >nul || (echo FAIL MeguLitGpu64.dll has no version marker & set FAIL=1)
if %FAIL%==1 (echo GPUHIDE SELFTEST FAILED & exit /b 1)
echo GPUHIDE SELFTEST PASSED
endlocal
