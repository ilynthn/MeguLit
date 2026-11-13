@echo off
rem Builds and runs the MeguLitGdiHide.h self-test as a 32-bit and as a 64-bit host process (the hook ships for both),
rem then checks that both shipped hook DLLs carry the GDI hide version marker. Exit code = failures (1 for a DLL miss).
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
if not exist "%TEMP%\megulit-gdihide32" mkdir "%TEMP%\megulit-gdihide32"
if not exist "%TEMP%\megulit-gdihide64" mkdir "%TEMP%\megulit-gdihide64"
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 gdihide.cpp /Fe:"%TEMP%\megulit-gdihide32\host.exe" /Fo"%TEMP%\megulit-gdihide32\\" /link gdi32.lib user32.lib >nul" || exit /b 1
cmd /c "call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 gdihide.cpp /Fe:"%TEMP%\megulit-gdihide64\host.exe" /Fo"%TEMP%\megulit-gdihide64\\" /link gdi32.lib user32.lib >nul" || exit /b 1
echo [32-bit]
"%TEMP%\megulit-gdihide32\host.exe" || exit /b 1
echo [64-bit]
"%TEMP%\megulit-gdihide64\host.exe" || exit /b 1
for %%D in (MeguLitHook32.dll MeguLitHook64.dll) do (
 findstr /m /c:"MeguLit_GDIHIDE armed version=2" "%~dp0..\%%D" >nul && (echo PASS %%D carries MeguLit_GDIHIDE armed version=2) || (echo FAIL %%D lacks the GDI hide version marker & exit /b 1)
)
