'use strict';
/* QQ #1130 (p0, 2026-11-24): L is many games' own shortcut; the log only opened on L with the Alt+T menu open. The log now has
   its own global key (Alt+L by default, chosen in the log settings), held by the bridge only while the bound game is in front in
   translation mode; plain L stays as an option that works only while the Alt+T menu (or the log) is open. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const log=read('web/reader/modules/backlog.js'),bridge=read('native/GalWindowBridge.cs'),reader=read('services/reader.cjs');
test('the log key is one of the hotkeys (热键 page), no longer a list of its own',()=>{
 /* 2026-11-27 every key is chosen on the 热键 page (web/hotkeys.js, core/hotkeys.cjs); the log page shows the current key and
    leads there, and a key chosen here before is handed over once (core/hotkeys.cjs adoptLog, validation/custom-hotkeys.test.cjs) */
 assert.ok(!/HOTKEYS|hotkeySpec|galBacklogHotkey/.test(log),'no second list or sender for the log key');
 assert.ok(!/galBacklogHotkey/.test(reader));
 assert.match(log,/action:'hotkeys_adopt_log',value:old/);
 assert.match(log,/H\.display\('log'\)/,'the log page names the current key');
 assert.match(log,/\[data-menu-key=hotkeys\]/,'and opens the 热键 page');
 assert.match(log,/if\(m\?\.type==='backlogHotkey'\)b\.toggleBacklog\(\);/,'the key still toggles the log');
});
test('plain L opens the log only while the Alt+T menu or the log is open',()=>{
 assert.match(log,/if\(cfg\.keyL&&\(panel\|\|menuOpen\(\)\)&&!e\.altKey/);
 for(const lang of ['Alt+T 菜单开着时按 L 打开','while the Alt+T menu is open','Alt+T メニューが開いている間'])assert.ok(log.includes(lang));
});
test('the bridge holds the key only for the bound game in front in translation mode',()=>{
 assert.match(bridge,/internal static bool BacklogKeyValid\(uint mods,uint key\)\{return BridgeHotkeys\.KeyValid\(mods,key\);\}/,'the same rule as every key: Alt, Ctrl or Win plus a key, never a bare key');
 assert.match(bridge,/internal static bool BacklogKeyWanted\(bool configured,bool translation,bool bound,bool gameInFront\)\{return configured&&translation&&bound&&gameInFront;\}/);
 assert.match(bridge,/RegisterHotKey\(IntPtr\.Zero,0x544,BacklogMods\|0x4000,BacklogKey\)/);
 assert.match(bridge,/if\(id==0x544\)\{Emit\(new\{type="backlogHotkey"\}\);\}else if/,'its own message, never mistaken for Alt+T');
 assert.match(bridge,/Tick\(\);\}catch\{\}try\{BacklogHotkeyTick\(noHotkeys\);\}catch\{\}/,'its own try: a failure never stops the bridge tick');
 assert.match(bridge,/if\(BacklogHeldKey!=0\)UnregisterHotKey\(IntPtr\.Zero,0x544\);\}/,'released when the bridge ends');
 assert.match(bridge,/if\(!BacklogKeyValid\(1,0x4C\)/,'covered by the bridge mode self-test');
 assert.match(read('core/gal-native.cjs'),/message\.type === 'backlogHotkey'/,'the bridge event reaches the page');
});
test('the bridge mode self-test passes (when the bridge is built)',{skip:!fs.existsSync(path.join(root,'native','GalWindowBridge.exe'))},()=>{
 const r=spawnSync(path.join(root,'native','GalWindowBridge.exe'),['--mode-self-test'],{encoding:'utf8',timeout:60000,windowsHide:true});
 assert.equal(r.status,0,String(r.stdout).slice(-300));
});
test('a key another program holds is retried every 1.5 s, not every tick; the front check uses the root owner (RRFZ #1175)',()=>{
 const tick=/static void BacklogHotkeyTick\(bool noHotkeys\)\{([^]*?)\n    \}/.exec(bridge);
 assert.ok(tick,'BacklogHotkeyTick found');
 assert.ok(!/GetAncestor\([^)]*,2\)/.test(tick[1]),'no GA_ROOT left in the front check');
 assert.match(tick[1],/GetAncestor\(front,3\)/);
 assert.match(tick[1],/front==GetAncestor\(Target,3\)/,'an owned dialog of the game keeps the key');
 assert.match(tick[1],/BacklogRetryWait\(BacklogMods,BacklogKey,BacklogFailedMods,BacklogFailedKey,DateTime\.UtcNow,BacklogRetryAt\)\)return;\s*if\(want&&!noHotkeys&&RegisterHotKey/,'no RegisterHotKey while waiting');
 assert.match(tick[1],/else\{BacklogFailedKey=BacklogKey;BacklogFailedMods=BacklogMods;BacklogRetryAt=DateTime\.UtcNow\.AddMilliseconds\(1500\);\}/);
 const wait=/internal static bool BacklogRetryWait\(uint mods,uint key,uint failedMods,uint failedKey,DateTime now,DateTime retryAt\)\{return ([^;]+);\}/.exec(bridge);
 assert.ok(wait);
 const f=new Function('mods','key','failedMods','failedKey','now','retryAt','return '+wait[1]+';');
 assert.equal(f(1,0x4C,1,0x4C,0,1500),true,'same failed key waits');
 assert.equal(f(1,0x4C,1,0x4C,1500,1500),false,'tried again after the pause');
 assert.equal(f(1,0x42,1,0x4C,0,1500),false,'a newly chosen key is tried at once');
 assert.match(bridge,/BacklogRetryWait\(1,0x4C,1,0x4C,t0,t0\.AddMilliseconds\(1500\)\)/,'covered by the bridge mode self-test');
});
