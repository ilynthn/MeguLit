@echo off
rem x86 MSVC environment from MEGULIT_VS (VsDevCmd.bat) for machines without the local setup_x86.bat (CI runners).
call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo
