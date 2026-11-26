# BGI adaptation lessons, 2026-11-22

- A copied permission candidate is not present merely because its report exists: `8c774853` is not an ancestor of base `ba00434c`; import the BGI-specific delta explicitly and rerun its production-file and actual-call gates
- Separate installed detours from current authorization; revoke pending rows and caller-role maps on missing/unreadable/off configuration, and keep original link/free execution intact
- Ten synthetic repeated-glyph pages validate the observer's row lifetime, not real Japanese hiding, lookup, translation or screen clear
- TextOut/GetGlyphOutline cache entries, glyph-chain layout, sprite text walkers and actual sprite visibility have different lifetimes; chain free is not page clear
- Existing Chinese launchers contain the same visible layout bytes but extra `.enigma` sections and an unbacked import RVA; file signature equality does not establish the module actually running or Japanese-language rendering
- The minimal first-scene sample must exclude system/debug text and opening literary quotations before counting ten narration candidates; role mappings still require live name/choice/menu evidence
- Repository-root ENGINE-ADAPTATION-NOTES.md is absent at this base; this independent supplement is provided for root's later aggregation, without touching shared handoff files
- The root-authorized hidden run reached a Direct3D initialization error before dialogue; stop that launch route and keep its screenshot rather than moving to the foreground or counting static rows as live input
- A real audio guard failure before ready/capture-only means no mute mutation and no audio recovery pass; preserve both facts, stop the owned game, and release its slot only after confirming exit
- Building the current Hook DLL with a matching source header hash is useful freshness evidence, but this failed launch never attached that DLL and supplies no real I/G/H/D/U proof

# 2026-11-26 バトラーズ～召しませお嬢様 (BGI.exe, 2006-10-04 build): the 13 s exit is the copy protection, not us
- BGI.exe is wrapped by SETTEC Alpha-ROM: unnamed sections at entropy 7.4-8.0, entry 0xB3000, strings SETTEC0000SETTEC1111, AlphaROM, C:\AlphaDiscLog.txt, CD001, WnASPI32.dll / SCSI for WIN32, CdRom%d, [DRIVE_NAME] DriveCount=%d (a disc check over the drives). Autorun.exe next to it is the Buriko installer/disc menu (Uninstall key, InstalledFolder), not a launcher the game needs
- Started by hand on the visible desktop, no hook, no ColdDesk, no Locale Emulator: BGI.exe starts a second BGI.exe as its child and the parent dies within 7 s with 0xC0000005, Application Error 1000 "Faulting module name: unknown, Fault offset: 0x0019fec7" (code on the stack), WER bucket type BEX. Through LEProc the same: everything gone in 4.5 s, no window. So neither the hidden desktop, the injection nor the missing Japanese locale causes it
- Cold test / adapt-auto can only report it ("游戏自己退出了"); the game needs its disc (or a cracked/no-disc exe), which the cold test does not do. Not reverse-engineered
