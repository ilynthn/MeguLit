@echo off
rem A Direct3D 11 window fully covered by a topmost window: WGC must return the D3D window's colour, not the cover and not
rem black; a minimised window must fall back to PrintWindow and say so. The windows sit past the right edge of the virtual
rem screen, so nothing shows on the desktop. Where WGC is not supported the test checks that the fallback says so.
setlocal
"%~dp0..\..\MeguLitWgcShot.exe" --selftest || exit /b 1
