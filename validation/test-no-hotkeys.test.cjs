'use strict';
/* 2026-11-19 three test copies side by side: a copy in the background took Alt+T/H/M from the copy in front and bound the wrong
   game. MEGULIT_NO_HOTKEYS=1 (test copies only) registers no global key, never retries and never ends other helpers; unset, the
   bridge registers and retries exactly as before. */
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const cs=fs.readFileSync(path.join(__dirname,'..','native','GalWindowBridge.cs'),'utf8');
test('MEGULIT_NO_HOTKEYS=1 turns off every global hotkey of the bridge, nothing else changes',()=>{
 assert.match(cs,/bool noHotkeys=Environment\.GetEnvironmentVariable\("MEGULIT_NO_HOTKEYS"\)=="1";/);
 const regs=cs.match(/RegisterHotKey\(IntPtr\.Zero,0x54[123],0x4001,0x[0-9a-f]+\)/g)||[];
 assert.strictEqual(regs.length,9,'three first tries, three after ending a foreign helper, three in the 2 s retry');
 assert.match(cs,/bool hotkey=!noHotkeys&&RegisterHotKey\(IntPtr\.Zero,0x541,0x4001,0x54\),coverHotkey=!noHotkeys&&RegisterHotKey\(IntPtr\.Zero,0x542,0x4001,0x48\),modeHotkey=!noHotkeys&&RegisterHotKey\(IntPtr\.Zero,0x543,0x4001,0x4d\);/);
 assert.match(cs,/if\(!sideBySide&&!noHotkeys&&\(!hotkey\|\|!coverHotkey\|\|!modeHotkey\)\)\{if\(EndForeignBridges\(\)>0\)/,'no ending of other helpers');
 assert.match(cs,/if\(!noHotkeys&&\(!hotkey\|\|!coverHotkey\|\|!modeHotkey\)&&DateTime\.UtcNow>=nextHotkeyTry\)/,'no 2 s retry');
 assert.match(cs,/bool want=!noHotkeys&&BacklogKeyWanted\(/,'2026-11-26 the log key (Alt+L) is off too');
 assert.match(cs,/if\(want&&!noHotkeys&&RegisterHotKey\(IntPtr\.Zero,0x544,/);
 assert.ok(!/RegisterHotKey\(IntPtr\.Zero,0x5[0-9a-f]{2}/.test(cs.replace(/!noHotkeys&&RegisterHotKey/g,'').replace(/\{if\(!hotkey\)hotkey=RegisterHotKey[^}]*\}/g,'').replace(/if\(!hotkey\)hotkey=RegisterHotKey\(IntPtr\.Zero,0x541,0x4001,0x54\);if\(!coverHotkey\)coverHotkey=RegisterHotKey\(IntPtr\.Zero,0x542,0x4001,0x48\);if\(!modeHotkey\)modeHotkey=RegisterHotKey\(IntPtr\.Zero,0x543,0x4001,0x4d\);/g,'')),'no other global hotkey');
 for(const f of fs.readdirSync(path.join(__dirname,'..','native')).filter(f=>/\.(cs|cpp|h)$/.test(f)))assert.ok(!/WH_KEYBOARD_LL|SetWindowsHookExW?\(13/.test(fs.readFileSync(path.join(__dirname,'..','native',f),'utf8')),f+' has no low-level keyboard hook');});
