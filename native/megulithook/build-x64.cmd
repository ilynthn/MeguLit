@echo off
rem MEGULIT_HOOK_TREE: the LunaHook tree and its build folders (default E:\Apps\work\megulithook; a private copy keeps one session's files out of another's build)
if "%MEGULIT_HOOK_TREE%"=="" set "MEGULIT_HOOK_TREE=E:\Apps\work\megulithook"
rem MeguLitHook64.dll (64-bit hook) from %MEGULIT_HOOK_TREE%\src, the same tree and the same MeguLit files as
rem build-x86.cmd (GDI hide: MeguLitGdiHide.h, texthook.cc, hijackfuns.cc, embed_util.cc). Toolchain: the VS 2022 build
rem tools in E:\Apps\build-tools (CMake + Ninja that ship with them), x64 ATL from get-atl-x64.py, MinHook from
rem preserved\source\lunahoook-adapted\third_party. The DLL lands in src\NativeImpl\LunaHook\builds\Release_win10.
rem (The old script used E:\Apps\work\euphoria-test-build\build-deps, which no longer exists.)
set PATH=E:\Apps\build-tools\vs2022\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;E:\Apps\build-tools\vs2022\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja;%PATH%
call "E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64 -no_logo >nul 2>nul
set "INCLUDE=%MEGULIT_HOOK_TREE%\atl\VC\Tools\MSVC\14.44.35207\atlmfc\include;%INCLUDE%"
set "LIB=%MEGULIT_HOOK_TREE%\atl\VC\Tools\MSVC\14.44.35207\atlmfc\lib\x64;%LIB%"
for %%F in (MeguLitGdiHide.h MeguLitDrawSkip.h MeguLitMarks.h MeguLitEmbedWait.h texthook.cc hijackfuns.cc embed_util.cc main.cc veh_hook.cpp hookfinder.cc enginecontrol.cpp) do copy /y "%~dp0%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\%%F" >nul || exit /b 1
for %%F in (DrawSites.h DrawSitesSig.h) do copy /y "%~dp0%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\%%F" >nul || exit /b 1
for %%F in (MajiroDraw.h MajiroDrawSig.h) do copy /y "%~dp0%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\%%F" >nul || exit /b 1
for %%F in (AdvhdDraw.h AdvhdDrawSig.h) do copy /y "%~dp0%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\%%F" >nul || exit /b 1
for %%F in (CmvsDraw.h CmvsDrawSig.h) do copy /y "%~dp0%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\%%F" >nul || exit /b 1
for %%F in (FvpDraw.h FvpDrawSig.h) do copy /y "%~dp0%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\%%F" >nul || exit /b 1
for %%F in (MinoriInput.h MinoriInputSig.h) do copy /y "%~dp0%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\%%F" >nul || exit /b 1
rem the shared safe unhook flow (native\shared\MeguLitSafeUnhook.h); main.cc and veh_hook.cpp carry its detach and breakpoint parts
copy /y "%~dp0..\shared\MeguLitSafeUnhook.h" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\MeguLitSafeUnhook.h" >nul || exit /b 1
rem the crash witness (native\shared\MeguLitCrashWitness.h), armed by main.cc
copy /y "%~dp0..\shared\MeguLitCrashWitness.h" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\MeguLitCrashWitness.h" >nul || exit /b 1
rem the changed engine files go to engine32 (copied by hand before; the YU-RIS in-place marks need Yuris.cpp built)
for %%F in (BGI.cpp BgiDraw.h BgiDrawSig.h Siglus.cpp Yuris.cpp Pal.cpp ToMeIslandDraw.h ToMeIslandFlow.h ToMeTextPos.h MeguLitSg.cpp EuphoriaHD474Draw.h EuphoriaDrawFlow.h) do copy /y "%~dp0%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\engine32\%%F" >nul || exit /b 1
rem one hook runtime (2026-11-19): the exact-program adapters (ISLAND, STEINS;GATE) are engines our enginecollection32.cpp lists first, euphoria HD sits in Yuris.cpp;
rem the STEINS;GATE adapter is compiled from native\mages under its own namespaces (MeguLitSg.cpp), upstream engines\mages untouched
for %%F in (enginecollection32.cpp MeguLitEngines.h MeguLitMatch.h) do copy /y "%~dp0%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\%%F" >nul || exit /b 1
for %%F in (MusicaBasic.h MusicaBasicSig.h) do copy /y "%~dp0%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\%%F" >nul || exit /b 1
copy /y "%~dp0..\mages\readString.cpp" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\engine32\MeguLitSg_readString.inc" >nul || exit /b 1
copy /y "%~dp0..\mages\mages.cpp" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\engine32\MeguLitSg_mages.inc" >nul || exit /b 1
copy /y "%~dp0..\mages\sgBlank.h" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\engines\mages\sgBlank.h" >nul || exit /b 1
rem Configured every time, like build-x86.cmd (the cache keeps the MinHook path of the checkout that configured it last).
rem MinHook's instruction decoder for the MAGES register scan (native\mages\mages.cpp, 2026-11-20)
for %%F in (hde32.h pstdint.h) do copy /y "%~dp0..\shared\minhook\src\hde\%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\engine32\%%F" >nul || exit /b 1
rem the upstream MAGES engine (5pb games: CHAOS;CHILD, STEINS;GATE 0, ...) with the same instruction-aligned register scan
copy /y "%~dp0MagesEngine.cpp" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\engines\mages\mages.cpp" >nul || exit /b 1
rem engine-draw Unity IL2CPP: LunaHook's Unity engine with the text setters observed (UnityEngine.cpp) and its roles reader
copy /y "%~dp0UnityEngine.cpp" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\engines\unity\unity.cpp" >nul || exit /b 1
for %%F in (Il2cppDraw.h Il2cppDrawRoles.h) do copy /y "%~dp0%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\engines\unity\%%F" >nul || exit /b 1
for %%F in (hde32.h pstdint.h) do copy /y "%~dp0..\shared\minhook\src\hde\%%F" "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\LunaHook\engines\mages\%%F" >nul || exit /b 1
cmake -S "%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook" -B "%MEGULIT_HOOK_TREE%\build-x64-vs" -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_HOST=OFF -DBUILD_HOOK=ON -DWIN10ABOVE=ON -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl -DFETCHCONTENT_SOURCE_DIR_MINHOOK="%~dp0..\shared\minhook" -DFETCHCONTENT_FULLY_DISCONNECTED=ON || exit /b 1
if not defined CMAKE_BUILD_PARALLEL_LEVEL set "CMAKE_BUILD_PARALLEL_LEVEL=8"
cmake --build "%MEGULIT_HOOK_TREE%\build-x64-vs" --target LunaHook
