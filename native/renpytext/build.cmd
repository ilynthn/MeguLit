@echo off
rem Builds MeguLitRenpy32.dll and MeguLitRenpy64.dll into native\ (see RenpyText.cpp). The script they run is
rem native\MeguLitRenpy.py, shipped next to them. Toolchain paths as in scncapture\build.cmd: MEGULIT_VS (VsDevCmd.bat)
rem and MEGULIT_VS_X86 (setup_x86.bat).
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
if "%MEGULIT_VS_X86%"=="" set "MEGULIT_VS_X86=E:\Apps\work\euphoria-test-build\toolchain\msvc\setup_x86.bat"
if not exist "%MEGULIT_VS_X86%" set "MEGULIT_VS_X86=%~dp0..\vsx86.cmd"
set FLAGS=/nologo /O2 /MT /EHsc /LD /W3 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN
if not exist obj32 mkdir obj32
if not exist obj64 mkdir obj64
call "%MEGULIT_VS_X86%" || exit /b 1
cl %FLAGS% /Foobj32\ RenpyText.cpp /Fe:..\MeguLitRenpy32.dll || exit /b 1
endlocal & setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set FLAGS=/nologo /O2 /MT /EHsc /LD /W3 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo || exit /b 1
cl %FLAGS% /Foobj64\ RenpyText.cpp /Fe:..\MeguLitRenpy64.dll || exit /b 1
del /q ..\MeguLitRenpy32.exp ..\MeguLitRenpy32.lib ..\MeguLitRenpy64.exp ..\MeguLitRenpy64.lib 2>nul
endlocal
