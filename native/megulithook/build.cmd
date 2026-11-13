@echo off
rem Builds native\megulithook\MeguLitHook32.dll and MeguLitHook64.dll (the shipped hook engine; HookNative.syncShippedHook
rem copies both into runtime\megulithook at the next game start, over the runtime pack's older copies). build-x86.cmd /
rem build-x64.cmd compile the LunaHook tree in E:\Apps\work\megulithook\src with this folder's changed files; a result is
rem copied here only when it carries the GDI hide version marker, so an old tree can never be packaged as a new build.
rem Called by Build.ps1 (native\native-builds.json).
setlocal
cd /d "%~dp0"
set "BUILT=E:\Apps\work\megulithook\src\src\NativeImpl\LunaHook\builds\Release_win10"
set "MARK=MeguLit_GDIHIDE armed version=2"
cmd /c "%~dp0build-x86.cmd" || exit /b 1
cmd /c "%~dp0build-x64.cmd" || exit /b 1
for %%B in (32 64) do (
 if not exist "%BUILT%\LunaHook%%B.dll" (echo LunaHook%%B.dll was not produced & exit /b 1)
 findstr /m /c:"%MARK%" "%BUILT%\LunaHook%%B.dll" >nul || (echo LunaHook%%B.dll lacks "%MARK%": the GDI hide sources were not compiled & exit /b 1)
 copy /y "%BUILT%\LunaHook%%B.dll" "%~dp0MeguLitHook%%B.dll" >nul || exit /b 1
 echo MeguLitHook%%B.dll updated
)
endlocal
