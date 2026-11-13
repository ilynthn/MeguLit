// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Game library: finds visual novels in the Steam libraries and in folders the user names, picks each game's
// program, a cover and whether LunaHook can read its text (by engine, confirmed once text is actually captured).
// State lives in config\library.json; the page adds the games to the Tomoyo library (media table) itself.
const {LocaleEmulator,recommended}=require('./locale-emulator.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process');

// Engine signatures, checked in the game folder (and one level of data folders). hook: LunaHook reads the text.
const ENGINES=[
 {name:'BGI / Ethornell',hook:true,test:f=>f.has(/^BGI.*\.exe$/i)||f.has(/^sysgrp\.arc$/i)||(f.has(/\.arc$/i)&&f.has(/^bgi\.gdb$/i))},
 {name:'YU-RIS',hook:true,test:f=>f.has(/\.ypf$/i)||f.sub('pac',/\.ypf$/i)||f.has(/^yscfg\.dat$/i)},
 {name:'KiriKiri',hook:true,test:f=>f.has(/\.xp3$/i)},
 {name:'SiglusEngine',hook:true,test:f=>f.has(/^scene\.pck$/i)||f.has(/^siglusengine.*\.exe$/i)},
 {name:'RealLive',hook:true,test:f=>f.has(/^seen\.txt$/i)||f.has(/^reallive.*\.exe$/i)},
 {name:'CatSystem2',hook:true,test:f=>f.has(/^cs2conf\.dll$/i)||(f.has(/\.int$/i)&&f.has(/^cs2.*\.exe$/i))},
 {name:'Artemis',hook:true,test:f=>f.has(/\.pfs(\.\d+)?$/i)},
 {name:'Malie',hook:true,test:f=>f.has(/^malie\.ini$/i)||f.has(/\.lib$/i)&&f.has(/^malie.*\.exe$/i)},
 {name:'AdvHD / WillPlus',hook:true,test:f=>f.has(/^rio\.arc$/i)||f.has(/^advhd\.exe$/i)},
 {name:'Majiro',hook:true,test:f=>f.has(/^scenario\.arc$/i)&&f.has(/\.arc$/i)},
 {name:'QLIE',hook:true,test:f=>f.sub('GameData',/\.pack$/i)},
 {name:'SoftPal',hook:true,test:f=>f.has(/^pal\.dll$/i)||(f.has(/^data\.pac$/i)&&f.has(/^script\.src$/i))},
 {name:'NeXAS',hook:true,test:f=>f.has(/^thumbnail\.pac$/i)||f.has(/^update\.pac$/i)},
 {name:'System4 (AliceSoft)',hook:true,test:f=>f.has(/\.ain$/i)||f.has(/\.ald$/i)},
 {name:'ShiinaRio',hook:true,test:f=>f.has(/\.war$/i)},
 {name:'Entis / Cotopha',hook:true,test:f=>f.has(/\.noa$/i)},
 {name:'NScripter',hook:true,test:f=>f.has(/^(arc\.nsa|nscript\.dat|00\.txt|0\.txt)$/i)},
 {name:'LiveMaker',hook:true,test:f=>f.has(/\.lsb$/i)||f.has(/^live\.dll$/i)},
 {name:'MAGES',hook:true,test:f=>f.has(/.mpk$/i)||f.sub('languagebarrier',/./)},
 /* Spike Chunsoft SDL2 ports (Steam ダンガンロンパ 1・2): AGAR .wad archives */
 {name:'Spike Chunsoft (WAD)',hook:null,test:f=>f.magic(/\.wad$/i,'AGAR')},
 {name:'Light.vn',hook:true,test:f=>f.has(/\.vndat$/i)},
 /* Purple software CMVS (アオイトリ / Aoi Tori, アマツツミ, 星メモ HD …): cmvs32.exe / cmvs64.exe with cmvs.cfg, scripts PS2A .ps3, archives .cpz */
 {name:'Purple software (CMVS)',hook:true,test:f=>f.has(/^cmvs(32|64)\.exe$/i)||f.has(/^cmvs\.cfg$/i)&&f.has(/\.exe$/i)},
 {name:'minori (PAZ)',hook:true,test:f=>f.has(/^(scr|sys)\.paz$/i)},
 {name:'Nitroplus (NPK)',hook:true,test:f=>f.has(/^(script|system)\.npk$/i)},
 // Older Nitroplus titles (装甲悪鬼村正, 沙耶の唄, スマガ…) pack scripts as nss.npa / system.npa (user report 2026-11-09).
 {name:'Nitroplus (NPA)',hook:true,test:f=>f.has(/^(nss|system|cg|sound)\.npa$/i)||f.names.filter(n=>/\.npa$/i.test(n)).length>=2},
 {name:"Ren'Py",hook:true,test:f=>f.has(/^renpy$/i)||f.sub('game',/\.rp[ay]c?$/i)},
 {name:'TyranoScript',hook:true,test:f=>f.sub('data',/^scenario$/i)||f.sub('resources',/^app\.asar$/i)&&f.has(/^tyrano/i)},
 {name:'Leaf / AQUAPLUS',hook:true,test:f=>f.has(/^grp\.pak$/i)&&f.has(/^char\.pak$/i)&&f.has(/^(voice|bgm|se)\.pak$/i)},
 // More engines (user, 2026-11-09). Signatures are files only these engines ship; text reading goes through the
 // general hook and is confirmed on first play (hook:null) until a game of that engine is verified.
 {name:'Escude',hook:true,test:f=>f.magic(/^script\.bin$/i,'ESC-ARC')||f.has(/^script\.bin$/i)&&f.has(/^(gpr|evt|st)\.bin$/i)},
 {name:'PJADV',hook:null,test:f=>f.magic(/^archive\.dat$/i,'GAMEDAT PAC')||f.has(/^textdata\.bin$/i)&&f.has(/^scenario\.dat$/i)},
 {name:'Valkyria',hook:true,test:f=>f.has(/\.odn$/i)},
 {name:'Cyberworks (C,system)',hook:null,test:f=>f.names.filter(n=>/^Arc0\d\.dat$/i.test(n)).length>=3},
 {name:'LC-ScriptEngine',hook:true,test:f=>f.has(/^lcsebody.*\.exe$/i)||f.has(/^lcscr.*\.lst$/i)},
 /* E375 WOLF RPG Editor: Game.exe or GamePro.exe (Pro, encrypted data) with Data.wolf, Data/*.wolf or a loose Data/BasicData. */
 {name:'Wolf RPG',hook:true,generic:true,test:f=>f.has(/\.wolf$/i)||f.sub('Data',/\.wolf$/i)||f.sub('Data',/^BasicData$/i)||f.has(/^gamepro\.exe$/i)&&f.has(/^data$/i)},
 /* E375 RPG Maker MV (www/js, www/data) and MZ (js/rmmz_core.js, data/System.json) run in NW.js. hook:null: LunaHook has no
    reliable hook for Chromium's V8 strings; the script (data JSON) is still read for zero-latency translation. */
 {name:'RPG Maker MV/MZ',hook:null,generic:true,test:f=>f.sub('js',/^(rpg_core|rmmz_core)\.js$/i)||f.sub('www',/^js$/i)&&f.has(/^package\.json$/i)||f.sub('data',/^MapInfos\.json$/i)&&f.sub('data',/^System\.json$/i)&&f.has(/^(game|nw)\.exe$/i)},
 {name:'RPG Maker VX/XP',hook:true,generic:true,test:f=>f.has(/\.rgss(3a|2a|ad)$/i)},
 // Visual-novel frameworks inside Unity, named so the library and the hook choice can tell them apart.
 {name:'Unity (Utage)',hook:null,test:f=>f.managed(/^Utage/i)},
 {name:'Unity (Naninovel)',hook:null,test:f=>f.managed(/^Naninovel/i)},
 {name:'Unity (Yarn Spinner)',hook:null,test:f=>f.managed(/^YarnSpinner/i)},
 {name:'Unity (Adventure Creator)',hook:null,test:f=>f.managed(/^AC(\.|Runtime)|AdventureCreator/i)},
 {name:'DxLib',hook:true,generic:true,test:f=>f.has(/\.dxa$/i)},
 // Unity games read through LunaHook's Mono/IL2CPP hooks for many, not all, titles: verified on first play.
 // A Unity build keeps <Name>_Data beside <Name>.exe. A folder that only holds something named *_Data (a library
 // folder, or the folder a game was unpacked into) is not a Unity game by itself.
 {name:'Unity',hook:null,generic:true,test:f=>f.has(/^unityplayer\.dll$/i)||f.names.some(n=>/_Data$/i.test(n)&&f.names.some(e=>e.toLowerCase()===n.slice(0,-5).toLowerCase()+'.exe'))},
];
const SKIP_EXE_ANY=/(卸载|卸載|アンインストール|uninst|設定|设置|设定|config|setting|register|update|installer|fontinst)/i;
// Reject recognisable Chinese and English editions both while scanning and before launch: ToMe reads the Japanese text.
// They are still reported by the scan, with the patch's own restore tool when one is found (user, 2026-11-02).
const TRANSLATED_ZH=/(汉化|漢化|中文|简体|簡體|繁体|繁體|乐园_高清版|(?:^|[-_ .])(chs|cht|cn|sc|tc|zh|chinese)(?=$|[-_ .]))/i;
const TRANSLATED_EN=/(英語版|英文版|英文|(?:^|[-_ .])(en|eng|english)(?=$|[-_ .]))/i;
const launcher=require('./launcher-language.cjs');
const TRANSLATED=new RegExp(TRANSLATED_ZH.source+'|'+TRANSLATED_EN.source,'i');
const translationOf=n=>TRANSLATED_ZH.test(n)?'zh':TRANSLATED_EN.test(n)?'en':'';
// The patch's own way back to the Japanese original: a restore/uninstall script that names the patched program (CLANNAD:
// uninstall.bat moves REALLIVE.EXE back from clfvbak and deletes clannadFV_sc.exe), or a patch uninstaller program.
// Never the game's own uninstaller (unins000.exe removes the whole game) and never an install script.
function restoreTool(dir,patched){const names=listing(dir).names,want=String(patched||'').toLowerCase(),ascii=/^[\x20-\x7e]+$/.test(want);
 for(const n of names){if(!/\.(bat|cmd)$/i.test(n)||!/(uninst|卸载|卸載|还原|還原|restore|remove|删除|刪除|恢复|復元)/i.test(n)||/^install/i.test(n))continue;let text='';try{const st=fs.statSync(path.join(dir,n));if(st.size>200000)continue;text=fs.readFileSync(path.join(dir,n),'latin1').toLowerCase();}catch{continue;}
  if(!ascii||text.includes(want))return {file:n,kind:'script'};}
 for(const n of names){if(!/\.exe$/i.test(n)||/^unins\d*\.exe$/i.test(n))continue;if(/(uninst|卸载|卸載|还原|還原|restore|remove|恢复)/i.test(n)&&/(patch|补丁|補丁|汉化|漢化|中文|chs|cht|eng|english|翻訳|translation)/i.test(n))return {file:n,kind:'program'};}
 return null;}
const isTranslated=p=>String(p||'').split(/[\\/]+/).some(n=>TRANSLATED.test(n.replace(/\.exe$/i,''))||launcher.languageHint(n)==='zh');
const ENGINE_EXE=/^(BGI|SiglusEngine|RealLive|AdvHD|cs2|malie|Game|nscr|LiveMaker|lightvn|renpy|nw)(?:[_-]steam)?\.exe$/i;
/* A Steam folder ships the steam_api DLL of the bitness its game is built for; an exe of the other bitness there (Summer
   Pockets: a stray x64 SummerPocketsRB.exe beside SiglusEngine_Steam.exe and a 32-bit steam_api.dll) cannot start, so the
   hook would attach to nothing and embedding fell back to read only. */
function peBits(file){try{const fd=fs.openSync(file,'r'),b=Buffer.alloc(0x400);try{fs.readSync(fd,b,0,b.length,0);}finally{fs.closeSync(fd);}const o=b.readUInt32LE(0x3c);if(o+6>b.length||b.toString('latin1',o,o+4)!=='PE\0\0')return 0;const m=b.readUInt16LE(o+4);return m===0x14c?32:m===0x8664||m===0xaa64?64:0;}catch{return 0;}}
function steamBits(names){const has=re=>names.some(n=>re.test(n)),a32=has(/^steam_api\.dll$/i),a64=has(/^steam_api64\.dll$/i);return a32&&!a64?32:a64&&!a32?64:0;}
const SKIP_EXE=/^(unins|uninstall|setup|install|config|settings?|launcher_?config|crashpad|crash|unitycrashhandler|dxsetup|vcredist|dotnet|redist|notification_helper|steamerrorreporter|easyanticheat|ue4prereq|update|patch|register|cefsharp|7z|reg|eosbootstrapper|vc_redist)/i;

function listing(dir){let names=[];try{names=fs.readdirSync(dir);}catch{}const cache={};
 // magic: the first file matching re starts with these bytes (archives that share a common extension).
 const magic=(re,head)=>{const n=names.find(x=>re.test(x));if(!n)return false;try{const fd=fs.openSync(path.join(dir,n),'r'),b=Buffer.alloc(head.length);try{fs.readSync(fd,b,0,b.length,0);}finally{fs.closeSync(fd);}return b.toString('latin1')===head;}catch{return false;}};
 // managed: a Unity build's <Name>_Data/Managed holds an assembly matching re (the VN framework inside Unity).
 const managed=re=>{const data=names.find(n=>/_Data$/i.test(n));if(!data)return false;if(!('\0managed' in cache))try{cache['\0managed']=fs.readdirSync(path.join(dir,data,'Managed'));}catch{cache['\0managed']=[];}return cache['\0managed'].some(n=>re.test(n));};
 return {names,magic,managed,has:re=>names.some(n=>re.test(n)),sub:(name,re)=>{const real=names.find(n=>n.toLowerCase()===name.toLowerCase());if(!real)return false;if(!(real in cache))try{cache[real]=fs.readdirSync(path.join(dir,real));}catch{cache[real]=[];}return cache[real].some(n=>re.test(n));}};}
function engineOf(dir){const f=listing(dir);for(const e of ENGINES)if(e.test(f))return e;return null;}
/* A Steam emulator's launcher names the program it starts (SmartSteamEmu: SmartSteamEmu\launcher.ini Target, UTF-16);
   the original exe beside it quits without Steam (サノバウィッチ: SabbatOfTheWitch.exe vs SabbatOfTheWitch_crack.exe). */
function emulatorTarget(dir){
 for(const f of [path.join(dir,'SmartSteamEmu','launcher.ini'),path.join(dir,'launcher.ini')]){let b;try{b=fs.readFileSync(f);}catch{continue;}
  const text=b[0]===0xff&&b[1]===0xfe?b.toString('utf16le'):b.toString('utf8'),m=/^\s*Target\s*=\s*(.+?)\s*$/mi.exec(text);if(!m)continue;
  const name=path.basename(m[1].replace(/\\/g,'/'));const file=path.join(dir,name);try{if(/\.exe$/i.test(name)&&fs.statSync(file).isFile())return file;}catch{}}
 return '';}
function mainExe(dir,translatedDir=false){
 if(!translatedDir&&isTranslated(dir))return ''; 
 { const t=emulatorTarget(dir);if(t)return t; }
 // The game's own program: the engine's usual name or the folder's name first, translation-patch and variant
 // launchers (BGI-CHS.exe, euphoria_sc.exe, BGI_patch.exe) last, the larger file among equals.
 const variant=/([-_ .](chs|cht|cn|sc|tc|zh|chinese|patch|\d{6,8})|中文|汉化|漢化|简体|繁體|补丁|パッチ)/i,folder=path.basename(dir).toLowerCase();
 let best='',score=-1,size=0;
  const names=listing(dir).names,bits=steamBits(names);
 for(const n of names){if(!launcher.isLauncher(n)||SKIP_EXE.test(n)||SKIP_EXE_ANY.test(n)||isTranslated(n))continue;let s;try{s=fs.statSync(path.join(dir,n));}catch{continue;}if(!s.isFile()||s.size<200000)continue;if(bits){const b=peBits(path.join(dir,n));if(b&&b!==bits)continue;}
  const base=n.replace(/\.exe$/i,'').toLowerCase(),sc=(ENGINE_EXE.test(n)?3:0)+(base===folder?2:0)+(variant.test(base)?0:1);
  if(sc>score||(sc===score&&s.size>size)){best=n;score=sc;size=s.size;}}
 if(!best)for(const n of listing(dir).names){if(!launcher.isLauncher(n)||SKIP_EXE.test(n)||SKIP_EXE_ANY.test(n)||isTranslated(n)||/^(python|pythonw|zsync|zsyncmake)\.exe$/i.test(n))continue;let st;try{st=fs.statSync(path.join(dir,n));}catch{continue;}if(st.isFile()&&st.size>=20000&&st.size>size){best=n;size=st.size;}}
 return best?path.join(dir,best):'';
}
// The game folder can be the folder itself or one or two levels below it (Game\JP\game.exe, Steam's common\X\bin).
function findGame(dir,depth=2){
 const e=engineOf(dir),exe=mainExe(dir);if(e||exe&&depth<2)return {dir,engine:e,exe};
 if(depth>0)for(const n of listing(dir).names){const sub=path.join(dir,n);try{if(!fs.statSync(sub).isDirectory()||/^(save|savedata|_commonredist|redist|directx|manual|ost|soundtrack|bonus|extra)$/i.test(n))continue;}catch{continue;}const g=findGame(sub,depth-1);if(g&&g.engine)return g.exe?g:(exe?{dir,engine:g.engine,exe}:g);}
 return exe?{dir,engine:e,exe}:null;
}
// Playable Japanese editions: original, HD and other named editions, with one shared launch button.
function findVariants(root){
 const found=[],seen=new Set();
 const add=(g,name)=>{if(!g?.exe||isTranslated(g.exe)||seen.has(g.exe.toLowerCase()))return;seen.add(g.exe.toLowerCase());found.push({dir:g.dir,exe:g.exe,name});};
 if(engineOf(root))add({dir:root,exe:mainExe(root)},path.basename(root));
 for(const n of listing(root).names){const sub=path.join(root,n);try{if(!fs.statSync(sub).isDirectory()||isTranslated(n)||/^(save|savedata|_commonredist|redist|directx|manual|ost|soundtrack|bonus|extra)$/i.test(n))continue;}catch{continue;}
  add(findGame(sub,1),n);}
 if(found.length<2)return [];const hd=n=>/(?:hd|高清|リマスター|remaster)/i.test(n),hasHD=found.some(v=>hd(v.name));
 const labels=found.map(v=>hd(v.name)?'HD版':hasHD&&found.filter(o=>!hd(o.name)).length===1?'原版':v.name);
 return found.map((v,i)=>({label:labels.filter(l=>l===labels[i]).length>1?labels[i]+' · '+v.name:labels[i],dir:v.dir,exe:v.exe}));
}
function playableGame(g){
 const variants=(g.variants||[]).filter(v=>v.exe&&!isTranslated(v.exe));
 const exe=g.exe&&!isTranslated(g.exe)?g.exe:variants[0]?.exe||mainExe(g.dir||'')||g.exe||'';
 return {...g,exe,localeJapanese:recommended(g,exe),variants:variants.map(v=>({...v,localeJapanese:recommended(g,v.exe)}))};
}
const hookState=e=>!e?'unknown':e.hook===true?'supported':e.hook===null?'unverified':'unsupported';

// ── Steam ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function steamRoot(value){
 if(!value)return '';
 const normalized=path.normalize(value);
 const p=normalized.length>path.parse(normalized).root.length?normalized.replace(/[\\/]+$/,''):normalized;
 const parent=path.dirname(p);
 if(path.basename(p).toLowerCase()==='common'&&path.basename(parent).toLowerCase()==='steamapps')return path.dirname(parent);
 if(path.basename(p).toLowerCase()==='steamapps')return parent;
 return p;
}
function steamFromRegistry(){return new Promise(resolve=>{execFile('reg',['query','HKCU\\Software\\Valve\\Steam','/v','SteamPath'],{windowsHide:true,timeout:5000,encoding:'utf8'},(error,out)=>{const m=!error&&/SteamPath\s+REG_SZ\s+(.+)/i.exec(String(out||''));resolve(m?path.normalize(m[1].trim()):'');});});}
async function findSteam(){
 const tries=[await steamFromRegistry(),'C:\\Program Files (x86)\\Steam','C:\\Program Files\\Steam','D:\\Steam','E:\\Steam','D:\\SteamLibrary','E:\\SteamLibrary'];
 for(const p of tries)if(p&&fs.existsSync(path.join(p,'steamapps')))return p;return '';
}
function vdfValues(text,key){const out=[];const re=new RegExp('"'+key+'"\\s+"((?:[^"\\\\]|\\\\.)*)"','gi');let m;while((m=re.exec(text)))out.push(m[1].replace(/\\\\/g,'\\'));return out;}
function steamLibraries(steam){
 const libs=new Map(),add=p=>{const n=path.normalize(p);if(!libs.has(n.toLowerCase()))libs.set(n.toLowerCase(),n);};add(steam);try{for(const p of vdfValues(fs.readFileSync(path.join(steam,'steamapps','libraryfolders.vdf'),'utf8'),'path'))add(p);}catch{}
 return [...libs.values()].filter(p=>fs.existsSync(path.join(p,'steamapps')));
}
function steamCover(steam,appid){
 const base=path.join(steam,'appcache','librarycache',String(appid));const want=['library_600x900_schinese.jpg','library_600x900_japanese.jpg','library_600x900.jpg','library_capsule.jpg','header.jpg'];
 for(const n of want)if(fs.existsSync(path.join(base,n)))return path.join(base,n);
 try{for(const d of fs.readdirSync(base)){const sub=path.join(base,d);if(!fs.statSync(sub).isDirectory())continue;for(const n of want)if(fs.existsSync(path.join(sub,n)))return path.join(sub,n);}}catch{}
 const old=path.join(steam,'appcache','librarycache',appid+'_library_600x900.jpg');return fs.existsSync(old)?old:'';
}
function steamGames(steam){
 steam=steamRoot(steam);
 if(!steam)return [];
 const out=[];for(const lib of steamLibraries(steam)){const apps=path.join(lib,'steamapps');let files=[];try{files=fs.readdirSync(apps).filter(n=>/^appmanifest_\d+\.acf$/i.test(n));}catch{}
  for(const f of files){try{const t=fs.readFileSync(path.join(apps,f),'utf8');const appid=vdfValues(t,'appid')[0],name=vdfValues(t,'name')[0],dir=vdfValues(t,'installdir')[0];
   if(!appid||!dir||/^(228980|250820|1007|1070560|1391110|1493710|1628350|2180100)$/.test(appid)||/Steamworks|Redistributable|Proton|Steam Linux Runtime|SteamVR/i.test(name||''))continue;
   const root=path.join(apps,'common',dir);if(fs.existsSync(root))out.push({source:'steam',appid,title:name||dir,root,cover:steamCover(steam,appid)});}catch{}}}
 return out;
}

// Steam manifests also identify installations reached through ordinary folder settings.
const manifestCache=new Map();
function steamAppidFor(executable){
 const m=/^(.*[\\/]steamapps)[\\/]common[\\/]([^\\/]+)[\\/]/i.exec(String(executable||''));if(!m)return '';
 const dir=m[1],install=m[2].toLowerCase();let map=manifestCache.get(dir.toLowerCase());
 if(!map||!map.has(install)){map=new Map();try{for(const f of fs.readdirSync(dir))if(/^appmanifest_\d+\.acf$/i.test(f)){try{const t=fs.readFileSync(path.join(dir,f),'utf8'),id=/"appid"\s+"(\d+)"/.exec(t)?.[1],inst=/"installdir"\s+"([^"]+)"/.exec(t)?.[1];if(id&&inst)map.set(inst.toLowerCase(),id);}catch{}}}catch{}manifestCache.set(dir.toLowerCase(),map);}
 return map.get(install)||'';
}

// ── Third-party folders: every sub-folder is one game (or the folder itself, if it is a game) ──────────────────
function folderGames(folder){
 const out=[];let names=[];try{names=fs.readdirSync(folder);}catch{return out;}
 if(engineOf(folder))return [{source:'folder',title:label(folder),root:folder}];
 for(const n of names){const root=path.join(folder,n);try{if(!fs.statSync(root).isDirectory())continue;}catch{continue;}out.push({source:'folder',title:label(root),root});}
 return out;
}
// Names to look a folder up by on VNDB. Downloaded folders are often "[160825][Nitroplus] 装甲悪鬼村正 DL版 Ver1.02":
// dates, brand tags, edition and version words hide the title, so each is also tried with those removed, and the
// longest Japanese/Chinese run on its own (user report 2026-11-09: a game never showed up in the library).
function searchNames(name){
 const raw=String(name||'').normalize('NFKC').trim();if(!raw)return [];
 const out=[raw];
 let t=raw.replace(/[\[【［(（{][^\]】］)）}]*[\]】］)）}]/g,' ')
  .replace(/(^|\s)\d{6,8}(?=\s|$)/g,' ')
  .replace(/\b(?:ver(?:sion)?\.?\s*[\d.]+|v\d+(?:\.\d+)+)\b/gi,' ')
  .replace(/(DL版|パッケージ版|通常版|初回版|限定版|廉価版|HD版|高清版|steam版|汉化版|漢化版|中文版|简体中文|繁體中文|日文版|日语版|原版|硬盘版|免安装|绿色版|修正版|修复版|\bHD\b|\bSteam\b)/gi,' ')
  .replace(/[_\s]+/g,' ').trim();
 if(t&&t!==raw)out.push(t);
 const cjk=(t||raw).match(/[\u3040-\u30ff\u3400-\u9fff々〆ヶー・～〜！？!?]+/g)||[];
 const longest=cjk.sort((a,b)=>b.length-a.length)[0];if(longest&&longest.length>=2&&longest!==t)out.push(longest);
 return [...new Set(out)];
}
function label(root){
 const parts=path.resolve(root).split(/[\\/]+/).filter(Boolean);return (parts[parts.length-1]||'Game').replace(/[_\- ]?(hd|hd版|高清版|steam版|dl版|パッケージ版)$/i,'').trim()||parts[parts.length-1];
}

// ── VNDB: confirms that an unknown game is a visual novel, and finds a title and cover for folder games ──────────
const norm=s=>String(s||'').toLowerCase().normalize('NFKC').replace(/[\s\-_:：・~～!！?？'"「」『』【】()（）\[\]［］、。,.,…♪☆★]/g,'');
async function vndb(title,strict){
 try{const r=await fetch('https://api.vndb.org/kana/vn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters:['search','=',title],fields:'title,alttitle,titles.title,image.url,image.sexual',sort:'searchrank',results:20}),signal:AbortSignal.timeout(8000)});
  if(!r.ok)return undefined;const data=await r.json();const want=norm(title);if(!want)return null;
  for(const vn of data.results||[]){const names=[vn.title,vn.alttitle,...(vn.titles||[]).map(t=>t.title)].map(norm).filter(Boolean);
   if(names.some(n=>n===want||(!strict&&want.length>=4&&(n.startsWith(want)||want.startsWith(n))&&Math.min(n.length,want.length)/Math.max(n.length,want.length)>=.5)))return {id:vn.id,title:vn.alttitle||vn.title,cover:vn.image?.url||''};}
  return null;}catch{return undefined;}
}
async function vndbSteam(appid){
 if(!/^\d+$/.test(String(appid||'')))return null;
 try{const r=await fetch('https://api.vndb.org/kana/release',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters:['extlink','=',['steam',Number(appid)]],fields:'vns.id,vns.title,vns.alttitle,vns.image.url',results:5}),signal:AbortSignal.timeout(8000)});
  if(!r.ok)return undefined;const d=await r.json();const vn=d.results?.[0]?.vns?.[0];return vn?{id:vn.id,title:vn.alttitle||vn.title,cover:vn.image?.url||''}:null;}catch{return undefined;}
}
async function download(url,file){try{const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)return false;fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));return true;}catch{return false;}}

class Library{
 constructor(layout){this.locale=new LocaleEmulator(layout.root||path.dirname(layout.config));this.file=path.join(layout.config,'library.json');this.coverDir=path.join(layout.root||path.dirname(layout.config),'data','assets','covers');this.state=this.read();this.verifiedPids=new Set();}
 read(){try{const v=JSON.parse(fs.readFileSync(this.file,'utf8'));return {autoSeries:v.autoSeries!==false,localeAutoJapanese:v.localeAutoJapanese!==false,localePath:String(v.localePath||''),setupDone:!!v.setupDone,steamPath:steamRoot(String(v.steamPath||'').trim()),folders:Array.isArray(v.folders)?v.folders.map(String):[],games:Array.isArray(v.games)?v.games:[],scanVersion:5,notGal:v.scanVersion===5&&v.notGal&&typeof v.notGal==='object'?v.notGal:{}};}catch{return {setupDone:false,steamPath:'',folders:[],games:[],notGal:{}};}}
 write(){try{fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.state,null,2));fs.renameSync(this.file+'.tmp',this.file);return true;}catch{return false;}}
 load(){return {...this.state,games:this.state.games.map(playableGame)};}
 async findSteam(){return {path:await findSteam()};}
 check(kind,value){
  const input=String(value||'').trim(),p=kind==='steam'?steamRoot(input):input;if(!p)return {ok:false,message:'未填写'};
  if(!fs.existsSync(p)||!fs.statSync(p).isDirectory())return {ok:false,message:'文件夹不存在'};
  if(kind==='steam'){if(!fs.existsSync(path.join(p,'steamapps')))return {ok:false,message:'不是 Steam 目录（里面没有 steamapps）'};const n=steamGames(p).length;return {ok:true,message:'找到 '+steamLibraries(p).length+' 个 Steam 库，'+n+' 个已安装应用'};}
  const n=folderGames(p).length;return {ok:true,message:n?'有 '+n+' 个子文件夹待识别':'文件夹是空的'};
 }
 settings(v){this.state.steamPath=steamRoot(String(v.steamPath||'').trim());this.state.folders=String(v.folders||'').split(/[;\n]/).map(s=>s.trim()).filter(Boolean);this.state.setupDone=v.setupDone!==false;this.write();return this.state;}
 // Scans Steam and the folders; returns games with engine, hook state, program and a cover file inside Tomoyo's
 // covers folder (Tomoyo only reads images there). Known games keep their media id and confirmed hook state.
 async scan(progress=()=>{},{incremental=false}={}){
  // Folders in the user's game folders that could not be confirmed as visual novels (unknown engine and no VNDB
  // match) are reported instead of vanishing, so the library can offer to add them by hand.
  this.unconfirmed=[];
  manifestCache.clear();
  const found=[],skipped=[];this.restorable=new Map();if(this.state.steamPath)found.push(...steamGames(this.state.steamPath));for(const f of this.state.folders)found.push(...folderGames(f));
  const known=new Map(this.state.games.map(g=>[String(g.dir||'').toLowerCase(),g]));if(!this.state.notGal)this.state.notGal={};const games=[],scanned=new Set();let i=0;
  try{fs.mkdirSync(this.coverDir,{recursive:true});}catch{}
  for(const c of found){progress({done:i++,total:found.length,title:c.title});
   if(scanned.has(c.root.toLowerCase()))continue;
   scanned.add(c.root.toLowerCase());
   // Folders already found not to be a visual novel are skipped until their contents change (start-up checks stay fast).
   const stamp=(()=>{try{return Math.round(fs.statSync(c.root).mtimeMs);}catch{return 0;}})(),rootKey=c.root.toLowerCase();
   if(this.state.notGal[rootKey]===stamp&&!known.has(rootKey)){if(c.source==='folder')this.unconfirmed.push({title:c.title,dir:c.root});continue;}
   const g=findGame(c.root);
   // A visual-novel folder whose only program is a translated edition (CLANNAD's clannadFV_sc.exe, the original REALLIVE.EXE
   // moved aside by the patch) is kept as a library game in that language; the game language dialog offers the original.
   if(g&&g.engine&&!g.exe){const patched=listing(g.dir).names.filter(n=>/\.exe$/i.test(n)&&isTranslated(n)&&!SKIP_EXE.test(n)&&!SKIP_EXE_ANY.test(n)).sort((a,b)=>{try{return fs.statSync(path.join(g.dir,b)).size-fs.statSync(path.join(g.dir,a)).size;}catch{return 0;}})[0];if(patched){this.restorable.set(g.dir.toLowerCase(),restoreTool(g.dir,patched));g.exe=path.join(g.dir,patched);g.translated=translationOf(patched.replace(/\.exe$/i,''))||'zh';}}
   /* E295 (user report 2026-11-10: Steam's "Tomoyo After ~It's a Wonderful Life~ English Edition" was not listed): a folder
      named as a translated edition hides its own program from the scan. It is listed with its main program as that
      language's edition, so the game language dialog can point to a Japanese one. */
   if(g&&g.engine&&!g.exe&&isTranslated(g.dir)){const own=mainExe(g.dir,true);if(own){g.exe=own;g.translated=translationOf(path.basename(g.dir))||'en';}}
    if(!g||!g.exe)continue;
    const appid=c.appid||steamAppidFor(g.exe);
    if(appid){c.source='steam';c.appid=appid;}
    const previous=known.get(g.dir.toLowerCase());
    const steamTrusted=c.source!=='steam'||String(previous?.appid||'')===c.appid&&previous?.vndbSteamAppid===c.appid&&(previous.vndbId||g.engine&&!g.engine.generic);
    if(incremental&&previous&&!previous.steamRejected&&steamTrusted&&String(previous.exe).toLowerCase()===g.exe.toLowerCase()){
     games.push({...previous,missing:false,engine:g.engine?.name||previous.engine||'',hook:previous.hook==='verified'?'verified':hookState(g.engine),variants:c.source==='folder'?findVariants(c.root):previous.variants||[]});continue;
    }
   // A folder game is named after its game folder when that is deeper (E:GAL素晴日素晴らしき日々HD版 -> 素晴らしき日々).
   const names=[...new Set([c.source==='folder'&&g.dir!==c.root?label(g.dir):'',c.title].filter(Boolean))];
   let vn=null,lookupFailed=false;const queries=[...new Set(names.flatMap(n=>[n,n.replace(/\s*[（(][^）)]*[）)]/g,'').trim(),...searchNames(n),...[...n.matchAll(/[（(]([^）)]+)[）)]/g)].map(m=>m[1])]).filter(Boolean))].slice(0,8);if(c.source==='steam'){const hit=await vndbSteam(c.appid);if(hit===undefined)lookupFailed=true;else if(hit)vn=hit;}
   if(c.source!=='steam'&&!vn&&(!g.engine||g.engine.hook===null||c.source==='folder'))for(const n of queries){const result=await vndb(n,false);if(result===undefined)lookupFailed=true;else if(result){vn=result;break;}}
   if(!vn&&lookupFailed&&c.source==='steam'&&previous?.appid===c.appid&&previous.vndbSteamAppid===c.appid&&previous.vndbId)vn={id:previous.vndbId,title:previous.names?.[1]||previous.title};
   // Steam also installs software. An AppID link or a specific visual-novel engine confirms an automatic entry.
   if((!g.engine||g.engine.generic)&&!vn){
    if(!lookupFailed){
     this.state.notGal[rootKey]=stamp;
     if(c.source==='steam'&&previous){
      games.push(previous.source==='manual'?{...previous,missing:false}:{...previous,steamRejected:true,vndbId:null,vndbSteamAppid:null,missing:false});
     }
    }
    if(c.source==='folder')this.unconfirmed.push({title:c.title,dir:g.dir,exe:g.exe});
    continue;
   }delete this.state.notGal[rootKey];
   const old=known.get(g.dir.toLowerCase())||{};const key=crypto.createHash('sha1').update(g.dir.toLowerCase()).digest('hex').slice(0,16);
   const identityChanged=c.source==='steam'&&String(old.vndbId||'')!==String(vn?.id||'');
   let cover=!identityChanged&&old.cover&&fs.existsSync(old.cover)?old.cover:'';
   if(!cover){const target=path.join(this.coverDir,'tome-'+key+'.jpg');
    if(c.cover){try{fs.copyFileSync(c.cover,target);cover=target;}catch{}}
    else if(vn?.cover&&await download(vn.cover,target))cover=target;}
   games.push({key,source:old.source==='manual'?'manual':c.source,appid:c.appid||null,title:c.source==='steam'?c.title:(vn?.title||names[0]),names:[...new Set([...names,vn?.title].filter(Boolean))],dir:g.dir,exe:g.exe,engine:g.engine?.name||'',
    hook:old.hook==='verified'?'verified':hookState(g.engine),vndbId:vn?.id||(c.source==='steam'?null:old.vndbId)||null,cover,mediaId:old.mediaId||null,
    ...(c.source==='steam'?{vndbSteamAppid:!lookupFailed||vn?c.appid:null,steamRejected:false}:{}),
    variants:c.source==='folder'?findVariants(c.root):[],...(g.translated?{contentLanguage:g.translated}:{})});}
  progress({done:found.length,total:found.length,title:''});
  // Games found earlier that are now gone are kept (their media entries stay), only marked missing.
  for(const old of this.state.games)if(!games.some(g=>g.dir.toLowerCase()===String(old.dir||'').toLowerCase()))games.push({...old,missing:old.source==='manual'?!fs.existsSync(old.exe):true});
  const latest=this.read();for(const key of ['steamPath','folders','localeAutoJapanese','localePath','autoSeries'])if(latest[key]!==undefined)this.state[key]=latest[key];
  this.state.scanVersion=5;this.state.games=games;this.write();return games.concat(skipped);
 }
 manualAdd(value){
  const exe=path.resolve(String(value?.exe||'').trim());if(!/\.exe$/i.test(exe)||!fs.existsSync(exe)||!fs.statSync(exe).isFile())throw Error('请选择现有游戏 exe 文件');
  if(isTranslated(exe)||SKIP_EXE.test(path.basename(exe))||SKIP_EXE_ANY.test(path.basename(exe)))throw Error('请选择原游戏程序，不要选择补丁或翻译启动器');
  const dir=path.dirname(exe),engine=engineOf(dir),key=crypto.createHash('sha1').update(dir.toLowerCase()).digest('hex').slice(0,16),old=this.state.games.find(g=>g.key===key)||{};
  const title=String(value.title||old.title||label(dir)).trim().slice(0,180);if(!title)throw Error('请填写游戏名称');
  const game={...old,key,source:'manual',title,names:[...new Set([title,...old.names||[]])],dir,exe,engine:engine?.name||'',hook:old.hook==='verified'?'verified':hookState(engine),variants:[],missing:false};
  const previous=this.state;this.state={...previous,games:previous.games.filter(g=>g.key!==key).concat(game),setupDone:true};if(!this.write()){this.state=previous;throw Error('游戏库保存失败');}return game;
 }
 // Runs the patch's own restore tool for a folder the last scan reported (only those), then checks that the Japanese
 // program is back. The page asked the user first; the tool's own window is shown when it has one.
 async restore(value){const dir=path.resolve(String(value?.dir||''));const tool=this.restorable?.get(dir.toLowerCase());if(!tool)throw Error('没有找到这部作品的还原程序');
  const file=path.join(dir,tool.file);await new Promise((resolve,reject)=>{const {spawn}=require('node:child_process');const child=tool.kind==='script'?spawn('cmd.exe',['/d','/c',file],{cwd:dir,windowsHide:true,stdio:'ignore'}):spawn(file,[],{cwd:dir,stdio:'ignore'});const timer=setTimeout(()=>{try{child.kill();}catch{}reject(Error('还原程序超时'));},10*60*1000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',()=>{clearTimeout(timer);resolve();});});
  const g=findGame(dir);if(!g?.exe||isTranslated(g.exe))throw Error('还原后仍未找到日文原版程序，请手动安装原版');this.restorable.delete(dir.toLowerCase());return {ok:true,exe:g.exe};}
 link(list){for(const {key,mediaId} of Array.isArray(list)?list:[]){const g=this.state.games.find(x=>x.key===key);if(g&&Number.isSafeInteger(mediaId))g.mediaId=mediaId;}this.write();return this.state.games;}
 // Starts a game: Steam titles through Steam (so its DRM does not restart the game), others by their program.
 // A game that is already running is not started twice. Returns the process name to bind and the home entry.
 // variant: index into the game's versions (HD / original); without one, the game's main program.
 exeOf(key,variant){const raw=this.state.games.find(x=>x.key===key&&!x.missing);if(!raw)return '';const g=playableGame(raw);if(variant!==undefined&&(!Number.isInteger(variant)||variant<0||variant>=g.variants.length))throw Error('Invalid game version');const v=Number.isInteger(variant)?g.variants[variant]:null;const exe=String((v||g).exe||'');return isTranslated(exe)?'':exe;}
 async launch(key,variant,options={}){
  const g=this.state.games.find(x=>x.key===key&&!x.missing);if(!g)throw Error('没有找到这个游戏，请重新扫描游戏路径');
  const exe=this.exeOf(key,variant),name=path.basename(exe).replace(/.exe$/i,'');if(!exe||!fs.existsSync(exe))throw Error('游戏程序不在了：'+exe);
  const running=(await this.locale.processes(exe)).length>0;
  let localeResult={};if(!running&&options.localeJapanese!==false&&recommended(g,exe)){localeResult=await this.locale.launch(exe);if(localeResult.needLocaleEmulator){try{await this.locale.ensure();localeResult=await this.locale.launch(exe);}catch{}if(localeResult.needLocaleEmulator)return localeResult;}}
  if(!running&&!localeResult.localeJapanese){const {spawn}=require('node:child_process');
   if(g.source==='steam'&&/^\d+$/.test(String(g.appid)))spawn('explorer.exe',['steam://rungameid/'+g.appid],{detached:true,stdio:'ignore'}).unref();
   else spawn(exe,[],{cwd:path.dirname(exe),detached:true,stdio:'ignore'}).unref();}
  return {name,mediaId:g.mediaId||null,running,title:g.title,...localeResult};
 }
 // Called when the hook delivers real text from a bound game: that game's hook is confirmed.
 verify(exe){
  const dir=path.dirname(String(exe||'')).toLowerCase();if(!dir||dir==='.')return false;
  const g=this.state.games.find(x=>{const d=String(x.dir||'').toLowerCase();return d===dir||dir.startsWith(d+path.sep)||d.startsWith(dir+path.sep);});
  if(!g||g.hook==='verified')return false;g.hook='verified';this.write();return true;
 }
}
// ── Synopses in the interface language, fetched online: Steam's own store text (zh / en / ja) for Steam games,
// Bangumi for Chinese (and the Japanese original it often carries), VNDB for English. Cached in config\synopsis.json
// and refreshed at most once a day per work.
const UA='MeguLit/0.1 (https://github.com/46daishi/tomoyo)';
const clean=s=>String(s||'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|h\d|li|div)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
 .replace(/\[url=[^\]]*\]([^[]*)\[\/url\]/gi,'$1').replace(/\[\/?(b|i|u|s|spoiler|quote|raw|code)\]/gi,'').replace(/\[From [^\]]+\]\s*$/i,'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const cut=(s,n=1400)=>s.length>n?s.slice(0,s.lastIndexOf('\n',n)>n*.6?s.lastIndexOf('\n',n):n).trim()+'…':s;
const isJapanese=s=>{const kana=(s.match(/[぀-ヿ]/g)||[]).length;return kana>=12&&kana/Math.max(1,s.length)>.08;};
async function getJson(url,options={}){try{const r=await fetch(url,{...options,headers:{'User-Agent':UA,Accept:'application/json',...(options.headers||{})},signal:AbortSignal.timeout(9000)});return r.ok?await r.json():null;}catch{return null;}}
async function steamText(appid,lang){
 const l={zh:'schinese',en:'english',ja:'japanese'}[lang];const d=await getJson('https://store.steampowered.com/api/appdetails?appids='+appid+'&l='+l);
 const data=d?.[appid]?.data;if(!data)return '';const text=clean(data.about_the_game||data.detailed_description||data.short_description);
 // Steam falls back to English when a language is missing: only keep text that really is in that language.
 if(lang==='zh'&&!/[一-鿿]/.test(text))return '';if(lang==='ja'&&!isJapanese(text))return '';if(lang==='en'&&/[぀-ヿ一-鿿]{20}/.test(text))return '';return cut(text);
}
async function bangumi(titles){
 // An entry of exactly this name first; otherwise the shortest name that starts with it (the base game, not its
 // HD / full-voice / fan-disc entries, which Bangumi lists under longer names).
 // Another edition's page (HD / full voice / remaster / fan disc) describes that edition, not the story: skipped.
 const EDITION=/(hd|フルボイス|fullvoice|完全版|リマスター|remaster|リニューアル|fd|ファンディスク|appendix|アペンド|dl版|パッケージ版|新装版|全年龄|全年齢|r18|18禁)/i;
 let best=null;for(const title of titles.filter(Boolean)){const d=await getJson('https://api.bgm.tv/v0/search/subjects?limit=10',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:title,filter:{type:[4]}})});
  const want=norm(title);for(const s of d?.data||[]){if(!String(s.summary||'').trim())continue;for(const n of [s.name,s.name_cn].map(norm).filter(Boolean)){const exact=n===want;if(!exact&&!(want.length>=4&&n.startsWith(want)))continue;if(!exact&&EDITION.test(n.slice(want.length)))continue;const rank=exact?0:n.length;if(!best||rank<best.rank)best={rank,s};}}if(best?.rank===0)break;}
 return best?clean(best.s.summary):'';
}
async function vndbText(id,titles){
 let filters=id?['id','=',/^v/i.test(id)?id:'v'+id]:null;if(!filters){for(const t of titles){const vn=await vndb(t,true);if(vn){filters=['id','=',vn.id];break;}}}if(!filters)return '';
 try{const r=await fetch('https://api.vndb.org/kana/vn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters,fields:'description,alttitle'}),signal:AbortSignal.timeout(9000)});if(!r.ok)return '';const v=(await r.json()).results?.[0];return {text:clean(v?.description||''),alttitle:v?.alttitle||''};}catch{return '';}
}
// Machine translation for a language no source has (free Google endpoint, kept apart from the dialogue translator so
// a synopsis never becomes context for the next game line).
async function machine(text,lang,source='auto'){
 try{
  const output=[];
  for(const part of text.match(/.{1,3500}/gsu)||[])output.push(await require('./translate.cjs').translateFree(part,{source,target:lang}));
  return output.join('\n');
 }catch{return '';}
}
class Synopses{
 constructor(layout,options={}){this.lookup=options.lookup||vndbText;this.translate=options.translate||machine;this.file=path.join(layout.config,'synopsis.json');try{this.cache=JSON.parse(fs.readFileSync(this.file,'utf8'))||{};}catch{this.cache={};}this.running=new Map();}
 write(){try{fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.cache,null,1));fs.renameSync(this.file+'.tmp',this.file);}catch{}}
 // {mediaId,titles[],vndbId,appid,lang,refresh} -> {text,lang,source,fresh}
 async get(a){
  const id=String(a.mediaId),lang=['zh','en','ja'].includes(a.lang)?a.lang:'zh';let entry=this.cache[id];
   if(a.appid&&entry?.steamIdentity!==String(a.appid)+':'+(a.vndbId||''))entry=null;
  // A language that could not be translated last time (offline, rate limited) is retried after ten minutes, not a day.
  const missing=entry&&!entry[lang]&&Date.now()-(entry.at||0)>600000;
  if(a.refresh||!entry||missing||entry.policy!==2||Date.now()-(entry.at||0)>86400000){if(!this.running.has(id))this.running.set(id,this.fetch(a).finally(()=>this.running.delete(id)));entry=await this.running.get(id)||entry;}
  if(!entry)return {text:'',lang,source:''};
  const order={zh:['zh','ja','en'],en:['en','zh','ja'],ja:['ja','zh','en']}[lang];for(const l of order)if(entry[l]&&require('./synopsis-policy.cjs').approved(entry.src?.[l]))return {text:entry[l],lang:l,source:entry.src?.[l]||''};return {text:'',lang,source:''};
 }
 async fetch(a){
   const titles=[...new Set((a.titles||[]).map(String).filter(Boolean))],out={at:Date.now(),policy:2,src:{}};
   if(a.appid)out.steamIdentity=String(a.appid)+':'+(a.vndbId||'');
   const cached=this.cache[String(a.mediaId)]||{},old=a.appid&&cached.steamIdentity!==out.steamIdentity?{}:cached;
  const put=(l,text,src)=>{if(text&&!out[l]){out[l]=text;out.src[l]=src;}};
   const v=a.appid&&!a.vndbId?null:await this.lookup(a.vndbId,a.appid?[]:titles);if(v?.text){put('en',v.text.slice(0,20000),'VNDB');if(v.alttitle)titles.push(v.alttitle);}
  // A language still missing is machine-translated from the best text found (the original Japanese first).
  await Promise.all([['zh',['ja','en']],['en',['ja','zh']],['ja',['zh','en']]].map(async([l,from])=>{if(out[l]||(old[l]&&require('./synopsis-policy.cjs').approved(old.src?.[l])&&!/机翻|MT/.test(old.src[l])))return;const f=from.find(x=>out[x]&&!/机翻/.test(out.src[x]||''));if(!f)return;const text=await this.translate(out[f],l,f);if(text&&text.trim()!==out[f].trim())put(l,text,out.src[f]+' · 机翻');}));
  // Keep what an earlier fetch found for a language this one could not reach (offline, rate limits).
  for(const l of ['zh','en','ja'])if(!out[l]&&old[l]&&require('./synopsis-policy.cjs').approved(old.src?.[l])){out[l]=old[l];out.src[l]=old.src?.[l]||'';}
   if(!out.zh&&!out.en&&!out.ja&&!a.appid)return Object.keys(old.src||{}).some(l=>require('./synopsis-policy.cjs').approved(old.src[l]))?old:null;if(!fs.existsSync(this.file+'.pre-vndb.json')&&fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.pre-vndb.json');this.cache[String(a.mediaId)]=out;this.write();return out;
 }
}
module.exports={searchNames,machine,restoreTool,Library,Synopses,engineOf,findGame,steamGames,steamAppidFor,folderGames,findSteam,findVariants,isTranslated,playableGame};
