# SPDX-License-Identifier: GPL-3.0-or-later
# Resolves the build toolchain. Dot-sourced by Build.ps1 and run on its own by tools/check-env.ps1.
#
# Two layouts are supported:
#  1. A self-contained tools folder (the original offline setup): MEGULIT_BUILD_TOOLS, or a "build-tools" folder next
#     to the repository, holding rustup\toolchains\stable-x86_64-pc-windows-msvc, cargo\ and vs2022\VC\Tools\MSVC.
#     Cargo then runs offline, exactly as before.
#  2. A standard Windows development setup: rustup (stable-x86_64-pc-windows-msvc), Node.js 20+ on PATH, Visual Studio
#     2022 or Build Tools with the C++ workload, and the Windows 10/11 SDK. Cargo may fetch crates (still --locked).
# Set MEGULIT_OFFLINE=1 to force offline Cargo in layout 2 as well (needs a populated cargo cache).
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskProblems = New-Object System.Collections.Generic.List[string]
function Resolve-First([string[]]$candidates) { foreach ($c in $candidates) { if ($c -and (Test-Path -LiteralPath $c)) { return (Resolve-Path -LiteralPath $c).Path } } return $null }

$taskTools = $(if ($env:MEGULIT_BUILD_TOOLS) { $env:MEGULIT_BUILD_TOOLS } else { Join-Path (Split-Path $taskRoot) 'build-tools' })
$taskLocalTools = Test-Path -LiteralPath (Join-Path $taskTools 'rustup\toolchains\stable-x86_64-pc-windows-msvc\bin\rustc.exe')

# Rust
if ($taskLocalTools) {
 $taskSysroot = Join-Path $taskTools 'rustup\toolchains\stable-x86_64-pc-windows-msvc'
 $env:CARGO_HOME = Join-Path $taskTools 'cargo'
 $taskOffline = $true
} else {
 $rustc = Resolve-First @((Get-Command rustc.exe -ErrorAction SilentlyContinue).Source, (Join-Path $env:USERPROFILE '.cargo\bin\rustc.exe'))
 $taskSysroot = $null
 if ($rustc) { $taskSysroot = (& $rustc --print sysroot 2>$null | Select-Object -First 1) }
 if (-not $taskSysroot -or -not (Test-Path -LiteralPath $taskSysroot)) { $taskProblems.Add('Rust not found. Install rustup (https://rustup.rs) with the stable-x86_64-pc-windows-msvc toolchain, or set MEGULIT_BUILD_TOOLS.') }
 $taskOffline = $env:MEGULIT_OFFLINE -eq '1'
}
if ($taskSysroot) {
 $taskRustBin = Join-Path $taskSysroot 'bin'
 $env:RUSTC = Join-Path $taskRustBin 'rustc.exe'
 $env:RUSTDOC = Join-Path $taskRustBin 'rustdoc.exe'
 $taskCargo = Resolve-First @((Join-Path $taskRustBin 'cargo.exe'), (Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'), (Get-Command cargo.exe -ErrorAction SilentlyContinue).Source)
 $taskLld = Join-Path $taskSysroot 'lib\rustlib\x86_64-pc-windows-msvc\bin\rust-lld.exe'
 if (-not $taskCargo) { $taskProblems.Add('cargo.exe not found next to rustc') }
 if (-not (Test-Path -LiteralPath $taskLld)) { $taskProblems.Add("rust-lld.exe not found in $taskSysroot (needs the x86_64-pc-windows-msvc target)") }
 $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = $taskLld
}
if ($taskOffline) { $env:CARGO_NET_OFFLINE = 'true' } else { Remove-Item Env:CARGO_NET_OFFLINE -ErrorAction SilentlyContinue }
$taskCargoNet = [string[]]$(if ($taskOffline) { '--offline' } else { @() })

# Windows SDK (resource compiler and import libraries): newest installed version
$taskKits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10'
$taskSdk = Get-ChildItem -LiteralPath (Join-Path $taskKits 'Lib') -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'um\x64\kernel32.lib') } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
$env:RC = Resolve-First (@($env:MEGULIT_RC) + @(Get-ChildItem -LiteralPath (Join-Path $taskKits 'bin') -Directory -ErrorAction SilentlyContinue | Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending | ForEach-Object { Join-Path $_.FullName 'x64\rc.exe' }))
if (-not $taskSdk) { $taskProblems.Add('Windows 10/11 SDK libraries not found (install the Windows SDK, e.g. with Visual Studio Build Tools)') }
if (-not $env:RC) { $taskProblems.Add('rc.exe (Windows SDK resource compiler) not found') }

# MSVC import libraries: local tools folder first, then a Visual Studio / Build Tools install
$taskMsvcRoots = @((Join-Path $taskTools 'vs2022\VC\Tools\MSVC'))
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $vswhere) { foreach ($vs in @(& $vswhere -products * -property installationPath)) { $taskMsvcRoots += Join-Path $vs 'VC\Tools\MSVC' } }
$taskMsvc = $taskMsvcRoots | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object { Get-ChildItem -LiteralPath $_ -Directory } | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'lib\x64\msvcrt.lib') } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (-not $taskMsvc) { $taskProblems.Add('MSVC libraries not found (install Visual Studio 2022 or Build Tools with "Desktop development with C++")') }

# .NET Framework C# compiler (part of Windows)
$taskCsc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $taskCsc)) { $taskProblems.Add(".NET Framework 4.x C# compiler not found at $taskCsc") }

# Node.js: bundled runtime first, then PATH
$taskNode = Resolve-First @((Join-Path $taskRoot 'runtime\node.exe'), (Get-Command node.exe -ErrorAction SilentlyContinue).Source)
if (-not $taskNode) { $taskProblems.Add('Node.js 20+ not found (put node.exe on PATH)') }
elseif ([int](((& $taskNode --version) -replace '^v','') -split '\.')[0] -lt 20) { $taskProblems.Add("Node.js 20+ required: $taskNode") }

$env:Path = (@($taskRustBin, $(if ($taskNode) { Split-Path -Parent $taskNode }), (Join-Path $env:WINDIR 'System32'), $env:WINDIR, (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0')) | Where-Object { $_ }) -join ';'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'; $env:VSCMD_SKIP_SENDTELEMETRY = '1'; $env:POWERSHELL_TELEMETRY_OPTOUT = '1'
