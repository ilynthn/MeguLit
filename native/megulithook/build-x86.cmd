@echo off
rem MeguLitHook32.dll from E:\Apps\work\megulithook\src (LunaHook + MeguLit changes; BGI.cpp, Siglus.cpp, Yuris.cpp and Pal.cpp
rem here are the changed engine files). Toolchain: the VS 2022 build tools in E:\Apps\build-tools, ATL headers and the
rem x86 atls.lib from get-atl-x64.py / get-atl-x86.py (Microsoft's VS package feed, SHA-256 checked), MinHook from
rem preserved\source\lunahoook-adapted\third_party. The DLL lands in src\NativeImpl\LunaHook\builds\Release_win10.
set PATH=E:\Apps\build-tools\vs2022\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;E:\Apps\build-tools\vs2022\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja;%PATH%
call "E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat" -arch=x86 -no_logo >nul 2>nul
set "INCLUDE=E:\Apps\work\megulithook\atl\VC\Tools\MSVC\14.44.35207\atlmfc\include;%INCLUDE%"
set "LIB=E:\Apps\work\megulithook\atl\VC\Tools\MSVC\14.44.35207\atlmfc\lib\x86;%LIB%"
rem GDI hide (MeguLitGdiHide.h): the hook core files changed for it are copied over the upstream tree first
for %%F in (MeguLitGdiHide.h texthook.cc hijackfuns.cc embed_util.cc) do copy /y "%~dp0%%F" "E:\Apps\work\megulithook\src\src\NativeImpl\LunaHook\LunaHook\%%F" >nul || exit /b 1
rem Configured every time: the cache keeps the MinHook path of the checkout that configured it last (a removed worktree broke the build).
cmake -S "E:\Apps\work\megulithook\src\src\NativeImpl\LunaHook" -B "E:\Apps\work\megulithook\build-x86-vs" -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_HOST=OFF -DBUILD_HOOK=ON -DWIN10ABOVE=ON -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl -DFETCHCONTENT_SOURCE_DIR_MINHOOK="%~dp0..\..\preserved\source\lunahoook-adapted\third_party\minhook" -DFETCHCONTENT_FULLY_DISCONNECTED=ON || exit /b 1
cmake --build "E:\Apps\work\megulithook\build-x86-vs" --target LunaHook --parallel 8
