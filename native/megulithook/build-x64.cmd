@echo off
rem MeguLitHook64.dll (64-bit hook) from E:\Apps\work\megulithook\src, the same tree and the same MeguLit files as
rem build-x86.cmd (GDI hide: MeguLitGdiHide.h, texthook.cc, hijackfuns.cc, embed_util.cc). Toolchain: the VS 2022 build
rem tools in E:\Apps\build-tools (CMake + Ninja that ship with them), x64 ATL from get-atl-x64.py, MinHook from
rem preserved\source\lunahoook-adapted\third_party. The DLL lands in src\NativeImpl\LunaHook\builds\Release_win10.
rem (The old script used E:\Apps\work\euphoria-test-build\build-deps, which no longer exists.)
set PATH=E:\Apps\build-tools\vs2022\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;E:\Apps\build-tools\vs2022\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja;%PATH%
call "E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64 -no_logo >nul 2>nul
set "INCLUDE=E:\Apps\work\megulithook\atl\VC\Tools\MSVC\14.44.35207\atlmfc\include;%INCLUDE%"
set "LIB=E:\Apps\work\megulithook\atl\VC\Tools\MSVC\14.44.35207\atlmfc\lib\x64;%LIB%"
for %%F in (MeguLitGdiHide.h texthook.cc hijackfuns.cc embed_util.cc) do copy /y "%~dp0%%F" "E:\Apps\work\megulithook\src\src\NativeImpl\LunaHook\LunaHook\%%F" >nul || exit /b 1
rem Configured every time, like build-x86.cmd (the cache keeps the MinHook path of the checkout that configured it last).
cmake -S "E:\Apps\work\megulithook\src\src\NativeImpl\LunaHook" -B "E:\Apps\work\megulithook\build-x64-vs" -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_HOST=OFF -DBUILD_HOOK=ON -DWIN10ABOVE=ON -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl -DFETCHCONTENT_SOURCE_DIR_MINHOOK="%~dp0..\..\preserved\source\lunahoook-adapted\third_party\minhook" -DFETCHCONTENT_FULLY_DISCONNECTED=ON || exit /b 1
cmake --build "E:\Apps\work\megulithook\build-x64-vs" --target LunaHook --parallel 8
