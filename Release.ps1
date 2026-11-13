# SPDX-License-Identifier: GPL-3.0-or-later
# One-command release: bump the version, build and test, package, merge to main, tag and publish on GitHub.
#
#   .\Release.ps1 -Version 1.1.3 -Notes notes.md          # full release
#   .\Release.ps1 -Version 1.1.3 -Notes notes.md -DryRun  # bump, build, test and package only; nothing is pushed
#   .\Release.ps1 -Version 1.1.6 -Prepare                 # bump, build and test now; then release with -SkipBuild
#   .\Release.ps1 -Version 1.1.6 -Notes notes.md -SkipBuild  # skips the build when nothing changed since
#   .\Release.ps1 -Version 1.1.8 -Notes notes.md -Hotfix -IncludeWorkingChanges  # fix the latest release in place
#   .\Release.ps1 -Version 1.4.9-beta.1 -Notes notes.md -Beta  # beta: branch beta, GitHub prerelease, not on the site
#   -IncludeWorkingChanges                                 # also commit the uncommitted changes in this release
#
# notes.md: Chinese first, then a line with only ---, then English (the in-app update card shows the reader's half).
# The package keeps the updater contract: MeguLit-vX.Y.Z-win-x64.zip with every entry under MeguLit/ (see
# services/update.cjs). Its file list is the previous release's list plus newly tracked files under core/, services/,
# web/ and setup/; files that are not in the repository (prebuilt helpers) are carried over from the previous zip.
param(
 [Parameter(Mandatory=$true)][string]$Version,
 [string]$Notes,
 [switch]$DryRun,
 [switch]$Prepare,   # bump + build + test only, and remember this tree so a later -SkipBuild can reuse the build
 [switch]$SkipBuild, # reuse the last -Prepare (or release) build when the tree and MeguLit.exe are unchanged since
 [switch]$Hotfix,    # replace the package of the latest release (same version); installs from v1.1.8 on pick it up
 [switch]$IncludeWorkingChanges, # ship uncommitted changes in the release commit instead of refusing
 [switch]$Beta      # user 2026-11-13: commit to branch beta and publish a GitHub prerelease. The site, the mirror and the
                    # in-app updater read releases/latest, which skips prereleases, so only stable releases reach them
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
$Repo='ilynthn/MeguLit'
$Author=-join [char[]](0x9B5A,0x9B5A,0x68DF)
$Email='ilymegumin1204@gmail.com'
$Root=$PSScriptRoot
Set-Location $Root
Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
function Step($m){Write-Host "== $m" -ForegroundColor Yellow}
function G{ & git.exe @args; if($LASTEXITCODE -ne 0){throw "git $($args -join ' ') failed"} }
function Utf8NoBom{New-Object System.Text.UTF8Encoding($false)}
function ReadText($p){[IO.File]::ReadAllText((Join-Path $Root $p),[Text.Encoding]::UTF8)}
function WriteText($p,$t){[IO.File]::WriteAllText((Join-Path $Root $p),$t,(Utf8NoBom))}
function Swap($p,$pattern,$replacement){$t=ReadText $p;$n=[regex]::Replace($t,$pattern,$replacement);if($n -eq $t -and -not ($t -match [regex]::Escape($Version))){throw "version not found in $p"};if($n -ne $t){WriteText $p $n}}

# ---------- checks ----------
if($Beta){if($Version -notmatch '^\d+\.\d+\.\d+-beta\.\d+$'){throw 'Beta version must look like 1.2.3-beta.1'};if($Hotfix){throw '-Beta cannot be a -Hotfix; bump the beta number'}}
elseif($Version -notmatch '^\d+\.\d+\.\d+[a-z]?$'){throw 'Version must look like 1.2.3 or 1.2.3a'}
# Hotfix letters (1.2.8a, 1.2.8b ...): shown in the app and on the release page; the tag, package name and Cargo/Tauri
# version stay numeric so installed updaters keep finding the package. A lettered version is a hotfix of its base when
# that release exists, otherwise the first release of the base.
$Label=$Version;$Version=$Version -replace '-beta\.\d+$','' -replace '[a-z]$','';$LabelPrefix=if($Label -ne $Version){"v$Label · "}else{''}
if($Label -ne $Version -and -not $Hotfix){try{$null=Invoke-RestMethod -Uri "https://api.github.com/repos/ilynthn/MeguLit/releases/tags/v$Version" -Headers @{'User-Agent'='MeguLit-release'};$Hotfix=[switch]$true}catch{}}
$Body=''
if(-not $Prepare){
 if(-not $Notes){throw 'Pass -Notes notes.md (or -Prepare to only build)'}
 $NotesPath=(Resolve-Path $Notes).Path
 $Body=[IO.File]::ReadAllText($NotesPath,[Text.Encoding]::UTF8)
 if($Body -notmatch "(?m)^---\s*$"){throw 'Notes need a --- line between the Chinese and English halves'}
}
$Tag="v$Version";if($Beta){$Tag="v$Label"};$Branch=if($Beta){'beta'}else{'main'};$Asset="MeguLit-$Tag-win-x64.zip"
# One click to the package at the top of the release page, however many hotfix sections follow (user, 2026-11-09).
# The in-app update card drops this line (services/update.cjs).
$DownloadLine="> **[⬇ 下载 MeguLit $Tag 安装包 / Download $Asset](https://github.com/ilynthn/MeguLit/releases/download/$Tag/$Asset)**"
# E297 (user, 2026-11-10: every release note, hotfixes too, bilingual and collapsible like DangoMusic's): the notes file
# stays "Chinese --- English"; the page shows each language in its own collapsed <details> block, and a hotfix is
# one collapsed block holding both. A --- line still separates the halves for update cards older than 1.2.4.
$Halves=[regex]::Split($Body.Trim(),"(?m)^---\s*$");$Zh=$Halves[0].Trim();$En=($Halves[1..($Halves.Count-1)] -join "`n").Trim()
function LangBlocks($zh,$en,$openZh){$o=if($openZh){' open'}else{''};return "<details$o>`n<summary><b>中文</b></summary>`n`n$zh`n`n</details>`n`n---`n`n<details>`n<summary><b>English</b></summary>`n`n$en`n`n</details>"}
$Token=$null
if(-not $DryRun -and -not $Prepare){
 # gh first: Windows PowerShell 5.1 pipes CRLF, which newer git credential fill rejects
 try{$Token=(gh auth token 2>$null|Out-String).Trim()}catch{}
 if(-not $Token){$cred="protocol=https`nhost=github.com`n`n" | git credential fill
 $Token=($cred | Where-Object {$_ -like 'password=*'}) -replace '^password=',''}
 if(-not $Token){throw 'No GitHub token from git credential fill'}
}
$Headers=@{'User-Agent'='megulit-release';'Accept'='application/vnd.github+json'}
if($Token){$Headers.Authorization="Bearer $Token"}
function Api($method,$path,$body=$null){
 $p=@{Method=$method;Uri="https://api.github.com/repos/$Repo$path";Headers=$Headers}
 if($body){$p.Body=[Text.Encoding]::UTF8.GetBytes(($body|ConvertTo-Json -Depth 5));$p.ContentType='application/json; charset=utf-8'}
 Invoke-RestMethod @p
}

Step 'sync main'
if(-not $DryRun -and -not $Prepare){
 $dirty=git status --porcelain --untracked-files=no
 if($dirty -and -not $IncludeWorkingChanges){throw "Working tree has uncommitted changes (add -IncludeWorkingChanges to ship them):`n$dirty"}
 G fetch -q origin
 if($Beta){
  # beta follows main: start from origin/beta, then take everything new on main
  & git.exe show-ref --verify --quiet refs/heads/beta;if($LASTEXITCODE -ne 0){G branch -q beta origin/beta}
  G checkout -q beta
  G merge -q --ff-only origin/beta
  G -c "user.name=$Author" -c "user.email=$Email" merge -q --no-edit origin/main
 }else{
  G checkout -q main
  G merge -q --ff-only origin/main
 }
}
$latest=Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $Headers
$prev=$latest.tag_name -replace '^v',''
$prevAsset=$latest.assets | Where-Object {$_.name -match '^MeguLit-v\d+\.\d+\.\d+-win-x64\.zip$'} | Select-Object -First 1
if(-not $prevAsset){throw 'Previous release has no package to take the file list from'}
if($Hotfix){if($Version -ne $prev){throw "-Hotfix replaces the latest release ($prev); pass -Version $prev"}}
elseif([version]$Version -le [version]$prev){if($Beta){throw "Beta $Label must be for a version after the latest stable release $prev"};throw "Version $Version is not newer than the latest release $prev"}
# E392 the labels people see (1.3.1a), not only the numeric tags: the progress band and the log read this line
$prevLabelShown=$prev;$aboutNow=git show HEAD:web/about.js 2>$null|Out-String;if($aboutNow -match "VERSION='(\d+\.\d+\.\d+[a-z]?)'"){$prevLabelShown=$matches[1]}
Write-Host "previous release v$prevLabelShown -> v$Label ($Tag)"

# ---------- version ----------
Step 'bump version'
Swap 'web/about.js' "export const VERSION='\d+\.\d+\.\d+(?:[a-z]|-beta\.\d+)?';" "export const VERSION='$Label';"
Swap 'desktop/Cargo.toml' '(?m)^version = "\d+\.\d+\.\d+"' "version = `"$Version`""
Swap 'desktop/tauri.conf.json' '"version": "\d+\.\d+\.\d+"' "`"version`": `"$Version`""
Swap 'desktop/Cargo.lock' '(name = "megulit"\r?\nversion = )"\d+\.\d+\.\d+"' "`${1}`"$Version`""
if(-not $Beta){ # README download links stay on the stable release
$readme=ReadText 'README.md'
$readme=[regex]::Replace($readme,'MeguLit-v\d+\.\d+\.\d+-win-x64\.zip',$Asset)
$readme=[regex]::Replace($readme,'\u4e0b\u8f7d v\d+\.\d+\.\d+',"$([char]0x4e0b)$([char]0x8f7d) $Tag")
if($readme -ne (ReadText 'README.md')){WriteText 'README.md' $readme}
}

# ---------- build ----------
Step 'build and test'
# Reuse rule: the last build was for this version and no source file is newer than MeguLit.exe. The bump above only
# writes files whose content changes, and cargo's own rewrite of Cargo.lock happens before the exe is produced.
$stampFile=Join-Path $env:TEMP 'megulit-release-stamp.json';$exePath=Join-Path $Root 'MeguLit.exe'
function NewestSource{
 $files=git ls-files --cached --others --exclude-standard web services core setup desktop/src desktop/Cargo.toml desktop/tauri.conf.json native
 $newest=$null;foreach($f in $files){if($f -match '\.(exe|dll|lib|obj|png|jpg|webp|ico)$'){continue};$p=Join-Path $Root $f;if(-not (Test-Path -LiteralPath $p)){continue};$t=(Get-Item -LiteralPath $p).LastWriteTimeUtc;if(-not $newest -or $t -gt $newest.Time){$newest=@{Time=$t;File=$f}}}
 $newest
}
$reuse=$false
if($SkipBuild -and (Test-Path $stampFile) -and (Test-Path $exePath)){
 $stamp=Get-Content $stampFile -Raw | ConvertFrom-Json;$exeTime=(Get-Item $exePath).LastWriteTimeUtc;$src=NewestSource
 if($stamp.version -eq $Version -and $stamp.exe -eq (Get-FileHash $exePath -Algorithm SHA256).Hash -and $src.Time -le $exeTime){$reuse=$true}
 elseif($src.Time -gt $exeTime){Write-Host "  $($src.File) changed after the last build"}
}
if($reuse){Write-Host "  nothing changed since the last build of $Tag; reusing MeguLit.exe"}
else{
 if($SkipBuild){Write-Host '  building (no reusable build for this version)'}
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'Build.ps1') -Check
 if($LASTEXITCODE -ne 0){throw 'Build or tests failed'}
 @{version=$Version;exe=(Get-FileHash $exePath -Algorithm SHA256).Hash} | ConvertTo-Json | Set-Content $stampFile
}
if($Prepare){Step "prepared $Tag (built and tested; release later with -SkipBuild)";return}
# E667: also when the build is reused, no native binary older than its sources (native/native-builds.json) is packaged.
Push-Location $Root;try{& node tools/native-stale.cjs;if($LASTEXITCODE -ne 0){throw 'A native binary is older than its sources or lacks its marker; run Build.ps1 (see tools/native-stale.cjs output)'}}finally{Pop-Location}

# ---------- package ----------
Step 'package'
$work=Join-Path $env:TEMP "megulit-release-$Version";if(Test-Path $work){Remove-Item $work -Recurse -Force};New-Item -ItemType Directory $work | Out-Null
$prevZip=Join-Path $work ("previous-"+$prevAsset.name) # a hotfix downloads a package of the same name it then writes
# E386 the previous package: a local copy from the last release, then our mirror dl.megulit.com, then GitHub (from here
# GitHub can take an hour for 20 MB). Whatever the source, its SHA-256 must match GitHub's digest of the asset.
$want=([string]$prevAsset.digest) -replace '^sha256:','';$got=$false
$local=Join-Path $env:TEMP ("megulit-release-$prev\"+$prevAsset.name)
if($want -and (Test-Path $local) -and (Get-FileHash $local -Algorithm SHA256).Hash.ToLower() -eq $want){Copy-Item $local $prevZip -Force;$got=$true;Write-Host '  previous package from the local copy'}
if(-not $got -and $want){try{Invoke-WebRequest -Uri "https://dl.megulit.com/files/$want/$($prevAsset.name)" -OutFile $prevZip -UseBasicParsing -TimeoutSec 300;$got=(Get-FileHash $prevZip -Algorithm SHA256).Hash.ToLower() -eq $want;if($got){Write-Host '  previous package from dl.megulit.com'}}catch{}}
if(-not $got){Invoke-WebRequest -Uri $prevAsset.browser_download_url -OutFile $prevZip -UseBasicParsing -TimeoutSec 1800;if($want -and (Get-FileHash $prevZip -Algorithm SHA256).Hash.ToLower() -ne $want){throw 'Previous package hash differs from GitHub digest'}}
$old=[IO.Compression.ZipFile]::OpenRead($prevZip)
$names=New-Object 'System.Collections.Generic.SortedSet[string]' ([StringComparer]::Ordinal)
# E-pkg: carry over only files the repository never tracked (prebuilt native helpers, fonts); a file git deleted stays deleted.
function Get-DroppedPaths([string[]]$Paths){$gone=@{};foreach($f in (git log --diff-filter=D --name-only --format= -- core services web setup native)){if($f){$gone[$f]=1}};$live=@{};foreach($f in (git ls-files)){$live[$f]=1};@($Paths | Where-Object {$gone.ContainsKey($_) -and -not $live.ContainsKey($_) -and -not (Test-Path -LiteralPath (Join-Path $Root ($_ -replace '/','\')))})}
$prevNames=@(foreach($e in $old.Entries){if($e.FullName -like 'MeguLit/*' -and $e.FullName -ne 'MeguLit/build-shell.txt' -and -not $e.FullName.EndsWith('/') -and $e.FullName -notmatch '\.(lib|obj|pdb|exp|ilk|iobj|ipdb)$' -and $e.FullName -notmatch '/build/'){$e.FullName.Substring(8)}})
$dropped=Get-DroppedPaths $prevNames
foreach($n in $prevNames){if($dropped -contains $n){Write-Host "  dropped deleted $n"}else{[void]$names.Add($n)}}
# --others: files added in this release are not tracked yet when the list is built (-IncludeWorkingChanges)
foreach($f in (git ls-files --cached --others --exclude-standard core services web setup)){if($f -notlike 'web/fonts/*'){[void]$names.Add($f)}}
# Prebuilt native helpers added after the previous package (not tracked: *.dll is ignored); E293 scene capture.
# E301 Ren'Py positions: the DLLs run native/MeguLitRenpy.py, which must ship next to them.
# E297 cold run helpers (built by Build.ps1, *.exe is not tracked).
foreach($f in 'native/ColdCapture32.exe','native/ColdCapture64.exe','native/RuntimeHarvest.exe','native/MeguLitScn32.dll','native/MeguLitScn64.dll','native/MeguLitDpDecline32.dll','native/MeguLitDpDecline64.dll','native/MeguLitKrkr32.dll','native/MeguLitKrkr64.dll','native/MeguLitRenpy32.dll','native/MeguLitRenpy64.dll','native/MeguLitRenpy.py','native/MeguLitFont32.dll','native/MeguLitFont64.dll','native/megulithook/MeguLitHook32.dll'){if(Test-Path -LiteralPath (Join-Path $Root $f)){[void]$names.Add($f)}}
# E578 (live beta38: the GDI hide and the glyph hide were merged but the shipped MeguLitHook32.dll / MeguLitFont32.dll were the old builds,
# so neither ran): a native DLL whose committed sources add a marker string must carry that marker, or the release stops.
foreach($m in @(@('native/megulithook/MeguLitGdiHide.h','native/megulithook/MeguLitHook32.dll','MeguLit_GDIHIDE'),@('native/fontprobe/GlyphMatch.h','native/MeguLitFont32.dll','ToMe_GLYPHHIDE'),@('native/fontprobe/GlyphMatch.h','native/MeguLitFont64.dll','ToMe_GLYPHHIDE'))){$src=Join-Path $Root $m[0];$dll=Join-Path $Root $m[1];if((Test-Path -LiteralPath $src)-and(Test-Path -LiteralPath $dll)){$bytes=[IO.File]::ReadAllBytes($dll);if([Text.Encoding]::ASCII.GetString($bytes).IndexOf($m[2],[StringComparison]::Ordinal)-lt 0){throw ($m[1]+' is an old build: it lacks '+$m[2]+' from '+$m[0]+'; rebuild it before releasing')}}}
# Hot updates (services/hot-update.cjs, user 2026-11-13: 不重启装更新): build-shell.txt fingerprints what MeguLit.exe is made of
# apart from the page scripts it serves from the web folder after a hot update: its Rust code and config (version lines
# left out), the HTML (CSP hashes) and the fonts (not shipped as files). Equal fingerprints = the old exe can run the new files.
function Sha256Text($t){([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($t)))).Replace('-','').ToLower()}
function ShellHash{
 $files=@(git ls-files --cached --others --exclude-standard desktop/src desktop/build.rs desktop/Cargo.toml desktop/Cargo.lock desktop/tauri.conf.json desktop/capabilities desktop/icons)+@(git ls-files --cached --others --exclude-standard web | Where-Object {$_ -match '\.html?$' -or $_ -like 'web/fonts/*'})
 $sb=New-Object Text.StringBuilder
 foreach($f in ($files | Sort-Object -Unique)){$p=Join-Path $Root $f;if(-not (Test-Path -LiteralPath $p -PathType Leaf)){continue}
  if($f -match '\.(toml|lock|json|rs)$'){$t=[IO.File]::ReadAllText($p) -replace "`r`n","`n"
   if($f -eq 'desktop/Cargo.toml'){$t=$t -replace '(?m)^version = "[^"]+"',''}
   if($f -eq 'desktop/tauri.conf.json'){$t=$t -replace '"version": "[^"]+"',''}
   if($f -eq 'desktop/Cargo.lock'){$t=$t -replace '(name = "megulit"\nversion = )"[^"]+"','$1'}
   $h=Sha256Text $t}else{$h=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower()}
  [void]$sb.Append("$f $h`n")}
 Sha256Text $sb.ToString()
}
$Shell=ShellHash;$shellFile=Join-Path $work 'build-shell.txt';[IO.File]::WriteAllText($shellFile,$Shell,(Utf8NoBom))
$zipPath=Join-Path $work $Asset
$out=[IO.Compression.ZipFile]::Open($zipPath,'Create')
try{
 foreach($n in $names){
  $local=Join-Path $Root ($n -replace '/','\')
  if(Test-Path -LiteralPath $local -PathType Leaf){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($out,$local,"MeguLit/$n",[IO.Compression.CompressionLevel]::Optimal)}
  else{
   $src=$old.GetEntry("MeguLit/$n");if(-not $src){throw "No source for $n"}
   $dst=$out.CreateEntry("MeguLit/$n",[IO.Compression.CompressionLevel]::Optimal);$dst.LastWriteTime=$src.LastWriteTime
   $i=$src.Open();$o=$dst.Open();try{$i.CopyTo($o)}finally{$o.Dispose();$i.Dispose()}
   Write-Host "  carried over $n"
  }
 }
 [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($out,$shellFile,'MeguLit/build-shell.txt',[IO.Compression.CompressionLevel]::Optimal)
}finally{$out.Dispose();$old.Dispose()}
$check=[IO.Compression.ZipFile]::OpenRead($zipPath)
try{if(-not $check.GetEntry('MeguLit/MeguLit.exe')){throw 'Package has no MeguLit.exe'};foreach($u in 'MeguLit/setup/uninstall.ps1','MeguLit/services/uninstall.cjs'){if(-not $check.GetEntry($u)){throw "Package has no $u (uninstaller)"}};if($check.Entries | Where-Object {$_.FullName -like 'MeguLit/data/*'}){throw 'Package contains data/'};$count=$check.Entries.Count}finally{$check.Dispose()}
$hash=(Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLower();$size=(Get-Item $zipPath).Length
Write-Host "$Asset  $count files  $size bytes  sha256 $hash"

# ---------- hot package ----------
# Only the changed files, for installs running exactly the previous package (name carries its version and digest).
# Offered when MeguLit.exe's own code is unchanged (build-shell.txt) and every changed file is under web/, services/,
# core/ or setup/ and is not HTML. Betas are prereleases the updater never reads, so they get none.
$HotPath=$null;$HotAsset=$null
if(-not $Beta){
 $prevDigestHot=(Get-FileHash $prevZip -Algorithm SHA256).Hash.ToLower()
 $za=[IO.Compression.ZipFile]::OpenRead($prevZip);$zb=[IO.Compression.ZipFile]::OpenRead($zipPath);$why='';$changed=@()
 function EntryHash($e){$st=$e.Open();try{([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($st))).Replace('-','').ToLower()}finally{$st.Dispose()}}
 try{
  $oldShell=$za.GetEntry('MeguLit/build-shell.txt')
  if(-not $oldShell){$why='previous package has no build-shell.txt'}
  else{$rd=New-Object IO.StreamReader($oldShell.Open());$prevShell=$rd.ReadToEnd().Trim();$rd.Dispose();if($prevShell -ne $Shell){$why='MeguLit.exe code, HTML or fonts changed'}}
  if(-not $why){foreach($e in $zb.Entries){$n=$e.FullName;if($n.EndsWith('/') -or $n -eq 'MeguLit/MeguLit.exe' -or $n -eq 'MeguLit/build-shell.txt'){continue}
   $h=EntryHash $e;$o=$za.GetEntry($n);if($o -and $o.Length -eq $e.Length -and (EntryHash $o) -eq $h){continue}
   $rel=$n.Substring(8);if($rel -notmatch '^(web|services|core|setup)/' -or $rel -match '\.html?$'){$why="$rel changed";break}
   $changed+=[pscustomobject]@{path=$rel;sha256=$h;entry=$e}}}
  if(-not $why -and -not $changed.Count){$why='no file changed'}
  if(-not $why){
   $HotAsset="MeguLit-v$Label-hot-from-v$prevLabelShown-$($prevDigestHot.Substring(0,12)).zip";$HotPath=Join-Path $work $HotAsset
   $hz=[IO.Compression.ZipFile]::Open($HotPath,'Create')
   try{
    foreach($c in $changed){$dst=$hz.CreateEntry("MeguLit/$($c.path)",[IO.Compression.CompressionLevel]::Optimal);$i=$c.entry.Open();$o=$dst.Open();try{$i.CopyTo($o)}finally{$o.Dispose();$i.Dispose()}}
    $manifest=@{version=$Label;from=$prevLabelShown;files=@($changed | ForEach-Object {@{path=$_.path;sha256=$_.sha256}})} | ConvertTo-Json -Depth 4
    $dst=$hz.CreateEntry('MeguLit/hot.json');$o=$dst.Open();try{$bytes=(Utf8NoBom).GetBytes($manifest);$o.Write($bytes,0,$bytes.Length)}finally{$o.Dispose()}
   }finally{$hz.Dispose()}
  }
 }finally{$za.Dispose();$zb.Dispose()}
 if($HotPath){Write-Host "$HotAsset  $($changed.Count) files  $((Get-Item $HotPath).Length) bytes (hot update from v$prevLabelShown)"}else{Write-Host "  no hot package: $why"}
}
if($DryRun){if($HotPath){Write-Host "  hot package at $HotPath"};& git.exe checkout -- web/about.js desktop/Cargo.toml desktop/tauri.conf.json desktop/Cargo.lock README.md;Step "dry run finished; package at $zipPath (version files restored)";return}

# ---------- commit ----------
# Direct commit on main, no pull request (user 2026-11-10: PRs opened through the GitHub integration list the bot as a
# contributor). The commit carries only the author's own identity.
Step "commit and push to $Branch"
if((G rev-parse --abbrev-ref HEAD) -ne $Branch){G checkout -q $Branch}
G add -A
# E400 a hotfix of the same version may change nothing tracked (the fix was committed before): push what is there
& git.exe diff --cached --quiet
if($LASTEXITCODE -ne 0){G -c "user.name=$Author" -c "user.email=$Email" commit -q -m $(if($Label -ne $Version){"v$Label"}elseif($Hotfix){"$Tag hotfix"}else{"$Tag"})}else{Write-Host '  nothing new to commit'}
G push -q origin $Branch
$merged=@{sha=(G rev-parse HEAD)}
Write-Host "pushed to $Branch at $($merged.sha)"

# ---------- release ----------
Step 'publish release'
if($Hotfix){
 # same version: swap the package, append the notes; the tag stays on the first commit of this version
 $rel=Api GET "/releases/tags/$Tag"
 # E401 the old package stays until the new one is up (deleting first left a window where update checks saw no package)
 $oldAssets=@($rel.assets | Where-Object {$_.name -eq $Asset})
 $old=[string]$rel.body;if($old -notmatch [regex]::Escape($DownloadLine)){$old=$DownloadLine+"`n`n"+$old}
 $stamp=Get-Date -Format 'yyyy-MM-dd HH:mm'
 $section="<details>`n<summary><b>🔧 ${LabelPrefix}Hotfix $stamp</b>（点击展开 / click to expand）</summary>`n`n"+(LangBlocks $Zh $En $false)+"`n`n</details>"
 $rel=Api PATCH "/releases/$($rel.id)" @{body=($old+"`n`n---`n`n"+$section)}
}elseif($Beta){
 $rel=Api POST '/releases' @{tag_name=$Tag;target_commitish=$merged.sha;name="MeguLit v$Label (beta)";body=($DownloadLine+"`n`n## MeguLit v$Label (beta)`n`n"+(LangBlocks $Zh $En $false));prerelease=$true;make_latest='false'}
}else{
 $rel=Api POST '/releases' @{tag_name=$Tag;target_commitish=$merged.sha;name="MeguLit v$Label";body=($DownloadLine+"`n`n## MeguLit v$Label`n`n"+(LangBlocks $Zh $En $false));make_latest='true'}
}
# E386 upload with gh: Invoke-RestMethod hung for over an hour on v1.3.0 with no timeout; gh finished in seconds
$ghExe=(Get-Command gh -ErrorAction SilentlyContinue).Source;if(-not $ghExe){$ghExe='E:/Apps/tools/gh/bin/gh.exe'}
$uploadPath=$zipPath;if($Hotfix){$uploadPath=Join-Path $work ('next-'+$Asset);Copy-Item $zipPath $uploadPath -Force}
$job=Start-Job -ScriptBlock {param($gh,$tag,$zip,$repo) & $gh release upload $tag $zip -R $repo --clobber 2>&1} -ArgumentList $ghExe,$Tag,$uploadPath,$Repo
if(-not (Wait-Job $job -Timeout 900)){Stop-Job $job;throw 'Upload did not finish in 15 minutes'};Receive-Job $job | Out-Host;Remove-Job $job
if($Hotfix){$next=(Api GET "/releases/$($rel.id)").assets | Where-Object {$_.name -eq ('next-'+$Asset)} | Select-Object -First 1;if(-not $next){throw 'Uploaded asset not found on the release'}
 foreach($old in $oldAssets){Api DELETE "/releases/assets/$($old.id)" | Out-Null};Api PATCH "/releases/assets/$($next.id)" @{name=$Asset} | Out-Null}
$a=(Api GET "/releases/$($rel.id)").assets | Where-Object {$_.name -eq $Asset} | Select-Object -First 1
if(-not $a){throw 'Uploaded asset not found on the release'}
if($a.size -ne $size){throw "Uploaded size $($a.size) differs from $size"}
if($a.digest -and $a.digest -ne "sha256:$hash"){throw "GitHub digest $($a.digest) differs from sha256:$hash"}
# the hot package goes up after the full one; any older hot package on this release (an earlier hotfix) is removed,
# since it would bring installs to files this release no longer has
if($HotPath){
 $job=Start-Job -ScriptBlock {param($gh,$tag,$zip,$repo) & $gh release upload $tag $zip -R $repo --clobber 2>&1} -ArgumentList $ghExe,$Tag,$HotPath,$Repo
 if(-not (Wait-Job $job -Timeout 600)){Stop-Job $job;throw 'Hot package upload did not finish in 10 minutes'};Receive-Job $job | Out-Host;Remove-Job $job
 $hotHash=(Get-FileHash $HotPath -Algorithm SHA256).Hash.ToLower()
 $all=(Api GET "/releases/$($rel.id)").assets;$h=$all | Where-Object {$_.name -eq $HotAsset} | Select-Object -First 1
 if(-not $h -or ($h.digest -and $h.digest -ne "sha256:$hotHash")){throw 'Hot package missing or its digest differs'}
 foreach($stale in @($all | Where-Object {$_.name -match '-hot-from-' -and $_.name -ne $HotAsset})){Api DELETE "/releases/assets/$($stale.id)" | Out-Null}
}elseif($Hotfix){foreach($stale in @((Api GET "/releases/$($rel.id)").assets | Where-Object {$_.name -match '-hot-from-'})){Api DELETE "/releases/assets/$($stale.id)" | Out-Null}}

Step 'verify download'
$back=Join-Path $work 'check.zip'
# a hotfix replaces a file under the same URL; the download edge can serve the old one for a few seconds
# E386 GitHub's own SHA-256 of the uploaded file is checked above; downloading it back from here can take an hour, so
# the download is tried with a time limit and only a mismatch fails the release
$ok=$false;try{Invoke-WebRequest -Uri $a.browser_download_url -OutFile $back -UseBasicParsing -TimeoutSec 120;$ok=(Get-FileHash $back -Algorithm SHA256).Hash.ToLower() -eq $hash;if(-not $ok){throw 'Downloaded package hash differs'}}catch{if($_.Exception.Message -eq 'Downloaded package hash differs'-and -not ($Hotfix -and $a.digest -eq "sha256:$hash")){throw};Write-Host "  download check skipped (slow network): $($_.Exception.Message)";if(-not $a.digest){throw 'No GitHub digest and no download to check'}}
# An installed copy of the previous package (its version label and package digest recorded as after an update) must see
# this release as an update: a new version by number, a hotfix by package digest (E358: 1.2.8a slipped through).
if($Beta){Remove-Item $work -Recurse -Force;Step "beta released (prerelease, not on the site or in app updates) $($rel.html_url)";return}
$prevDigest=(Get-FileHash $prevZip -Algorithm SHA256).Hash.ToLower();$probeRoot=Join-Path $work 'probe';New-Item -ItemType Directory (Join-Path $probeRoot 'data') -Force | Out-Null
$prevLabel=if($Hotfix){(Select-String -Path (Join-Path $Root 'web/about.js') -Pattern "VERSION='([^']+)'" | Select-Object -First 1).Matches[0].Groups[1].Value}else{$prev}
if($Hotfix){$prevLabel=(& git.exe show "HEAD~1:web/about.js" | Select-String -Pattern "VERSION='([^']+)'" | Select-Object -First 1).Matches[0].Groups[1].Value}
@{version=$Version;digest=$prevDigest} | ConvertTo-Json -Compress | Set-Content (Join-Path $probeRoot 'data/update-installed.json') -Encoding ascii
@{version=$prevLabel} | ConvertTo-Json -Compress | Set-Content (Join-Path $probeRoot 'data/icon-refresh.json') -Encoding ascii
$probe=& node -e "require('./services/update.cjs').check(process.argv[1],fetch,process.argv[2]).then(r=>console.log(r.latest+' '+r.newer+(r.hotfix?' hotfix':''))).catch(e=>console.log('ERR '+e.message))" $prevLabel $probeRoot
Write-Host "update check from v${prevLabel}: $probe"
if($probe -notmatch ' true'){throw "An installed v$prevLabel does not see this release as an update: $probe"}
Remove-Item $work -Recurse -Force
Step "released $($rel.html_url)"
