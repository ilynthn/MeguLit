@echo off
rem Builds MeguLitKrkr32.dll and MeguLitKrkr64.dll into native\ (see KrkrText.cpp). The SDK stub (sdk\tp_stub.*) is the
rem KiriKiri 2 one; every SDK call goes through the engine's own exports, so the same source serves 64-bit KiriKiri Z.
rem Toolchains: MEGULIT_VS_X86 (setup_x86.bat) and MEGULIT_VS (VsDevCmd.bat, x64).
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS_X86%"=="" set "MEGULIT_VS_X86=E:\Apps\work\euphoria-test-build\toolchain\msvc\setup_x86.bat"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
if not exist "%MEGULIT_VS_X86%" set "MEGULIT_VS_X86=%~dp0..\vsx86.cmd"
set FLAGS=/nologo /O2 /MT /EHsc /LD /W3 /wd4828 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /FIwindows.h /FIobjidl.h
if not exist obj32 mkdir obj32
if not exist obj64 mkdir obj64
cmd /c "call "%MEGULIT_VS_X86%" >nul && cl %FLAGS% /Foobj32\ KrkrText.cpp sdk\tp_stub.cpp /Fe:..\MeguLitKrkr32.dll /link user32.lib" || exit /b 1
cmd /c "call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul && cl %FLAGS% /Foobj64\ KrkrText.cpp sdk\tp_stub.cpp /Fe:..\MeguLitKrkr64.dll /link user32.lib" || exit /b 1
del /q ..\MeguLitKrkr32.exp ..\MeguLitKrkr32.lib ..\MeguLitKrkr64.exp ..\MeguLitKrkr64.lib 2>nul
endlocal
