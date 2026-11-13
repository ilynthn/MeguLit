@echo off
rem Builds native\megulithook\MeguLitHook32.dll (the shipped hook engine; HookNative.syncShippedHook copies it into
rem runtime\megulithook at the next game start). build-x86.cmd compiles the LunaHook tree in E:\Apps\work\megulithook\src
rem with this folder's changed files; the result is copied here only when it carries the GDI hide marker (MeguLit_GDIHIDE),
rem so an old tree can never be packaged as a new build. Called by Build.ps1 (native\native-builds.json).
setlocal
cd /d "%~dp0"
set "OUT=E:\Apps\work\megulithook\src\src\NativeImpl\LunaHook\builds\Release_win10\LunaHook32.dll"
cmd /c "%~dp0build-x86.cmd" || exit /b 1
if not exist "%OUT%" (echo LunaHook32.dll was not produced & exit /b 1)
findstr /m /c:"MeguLit_GDIHIDE" "%OUT%" >nul || (echo LunaHook32.dll lacks MeguLit_GDIHIDE: the GDI hide sources were not compiled & exit /b 1)
copy /y "%OUT%" "%~dp0MeguLitHook32.dll" >nul || exit /b 1
echo MeguLitHook32.dll updated
endlocal
