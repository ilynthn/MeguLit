@echo off
rem MeguLitDrawSkip.h self-test (selftest\drawskip.cpp) as a 32-bit and a 64-bit process. Exit code = failures.
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
for %%A in (x86 x64) do (
 if not exist "%TEMP%\megulit-drawskip-%%A" mkdir "%TEMP%\megulit-drawskip-%%A"
 cmd /c "call "%MEGULIT_VS%" -arch=%%A -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 drawskip.cpp /Fe:"%TEMP%\megulit-drawskip-%%A\drawskip.exe" /Fo"%TEMP%\megulit-drawskip-%%A\\" >nul" || exit /b 1
 echo [draw skip %%A]
 "%TEMP%\megulit-drawskip-%%A\drawskip.exe" || exit /b 1
)
endlocal
