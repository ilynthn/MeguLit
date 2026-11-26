'use strict';
/* QQ #1130 (p0, 2026-11-24): L is many games' own shortcut; the log only opened on L with the Alt+T menu open. The log now has
   its own global key (Alt+L by default, chosen in the log settings), held by the bridge only while the bound game is in front in
   translation mode; plain L stays as an option that works only while the Alt+T menu (or the log) is open. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const log=read('web/reader/modules/backlog.js'),bridge=read('native/GalWindowBridge.cs'),reader=read('services/reader.cjs');
test('the log settings choose a combination and send it to the bridge',()=>{
 const hotkeys=JSON.parse(log.match(/const HOTKEYS=(\[[^\]]*\]);/)[1].replace(/'/g,'"'));
 assert.deepStrictEqual(hotkeys,['Alt+L','Ctrl+Alt+L','Alt+Shift+L','Alt+B','']);
 assert.match(log,/wheel:true,keyL:true,hotkey:'Alt\+L'\}/,'Alt+L by default');
 const spec=new Function('return '+log.match(/const hotkeySpec=(name=>\{[\s\S]+?charCodeAt\(0\)\};\})/)[1])();
 assert.deepStrictEqual(spec('Alt+L'),{modifiers:1,key:0x4C});
 assert.deepStrictEqual(spec('Ctrl+Alt+L'),{modifiers:3,key:0x4C});
 assert.deepStrictEqual(spec('Alt+Shift+L'),{modifiers:5,key:0x4C});
 assert.deepStrictEqual(spec('Alt+B'),{modifiers:1,key:0x42});
 assert.deepStrictEqual(spec(''),{modifiers:0,key:0});
 assert.match(log,/hotkey\.onchange=\(\)=>\{cfg\.hotkey=hotkey\.value;changed\(\);sendHotkey\(\);\};/);
 assert.match(log,/row\(t\('hotkey'\),hotkey\)/);
 assert.match(log,/if\(m\?\.type==='ready'\)sendHotkey\(\);if\(m\?\.type==='backlogHotkey'\)b\.toggleBacklog\(\);/,'sent again whenever the bridge (re)starts; its key toggles the log');
 assert.match(reader,/case 'galBacklogHotkey':g\?\.send\(\{type:'backlogHotkey',modifiers:Number\(r\.modifiers\)\|0,key:Number\(r\.key\)\|0\}\);break;/);
});
test('plain L opens the log only while the Alt+T menu or the log is open',()=>{
 assert.match(log,/if\(cfg\.keyL&&\(panel\|\|menuOpen\(\)\)&&!e\.altKey/);
 for(const lang of ['Alt+T 菜单开着时按 L 打开','while the Alt+T menu is open','Alt+T メニューが開いている間'])assert.ok(log.includes(lang));
});
test('the bridge holds the key only for the bound game in front in translation mode',()=>{
 assert.match(bridge,/internal static bool BacklogKeyValid\(uint mods,uint key\)\{return key>=0x41&&key<=0x5A&&\(mods&~7u\)==0&&\(mods&3\)!=0;\}/,'Alt or Ctrl plus a letter, never a bare key');
 assert.match(bridge,/internal static bool BacklogKeyWanted\(bool configured,bool translation,bool bound,bool gameInFront\)\{return configured&&translation&&bound&&gameInFront;\}/);
 assert.match(bridge,/RegisterHotKey\(IntPtr\.Zero,0x544,BacklogMods\|0x4000,BacklogKey\)/);
 assert.match(bridge,/message\.wParam\.ToUInt64\(\)==0x544\)\{Emit\(new\{type="backlogHotkey"\}\);\}else if/,'its own message, never mistaken for Alt+T');
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
