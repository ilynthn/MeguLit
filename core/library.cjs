// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Game library: finds visual novels in the Steam libraries and in folders the user names, picks each game's
// program, a cover and whether LunaHook can read its text (by engine, confirmed once text is actually captured).
// State lives in config\library.json; the page adds the games to the Tomoyo library (media table) itself.
const {LocaleEmulator,recommended}=require('./locale-emulator.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {registryString}=require('./registry-string.cjs');

/* E601 engine fingerprints and their readers live in one registry (services/original-engines/registry.cjs) */
const registry=require('../services/original-engines/registry.cjs'),ENGINES=registry.ENGINES;
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
/* E580 kit.peInfo */
function peBits(file){const i=require('../services/original-engines/kit.cjs').peInfo(file);return i&&i.pe?i.bits:0;}
function steamBits(names){const has=re=>names.some(n=>re.test(n)),a32=has(/^steam_api\.dll$/i),a64=has(/^steam_api64\.dll$/i);return a32&&!a64?32:a64&&!a32?64:0;}
const SKIP_EXE=/^(unins|uninstall|setup|install|config|settings?|launcher_?config|crashpad|crash|unitycrashhandler|dxsetup|vcredist|dotnet|redist|notification_helper|steamerrorreporter|easyanticheat|ue4prereq|update|patch|register|cefsharp|7z|reg|eosbootstrapper|vc_redist)/i;

const listing=registry.listing;
function engineOf(dir){const f=listing(dir);for(const e of ENGINES)if(e.test(f))return e;return null;}
/* A Steam emulator's launcher names the program it starts (SmartSteamEmu: SmartSteamEmu\launcher.ini Target, UTF-16);
   the original exe beside it quits without Steam (サノバウィッチ: SabbatOfTheWitch.exe vs SabbatOfTheWitch_crack.exe). */
function emulatorTarget(dir){
 for(const f of [path.join(dir,'SmartSteamEmu','launcher.ini'),path.join(dir,'launcher.ini')]){let b;try{b=fs.readFileSync(f);}catch{continue;}
  const text=b[0]===0xff&&b[1]===0xfe?b.toString('utf16le'):b.toString('utf8'),m=/^\s*Target\s*=\s*(.+?)\s*$/mi.exec(text);if(!m)continue;
  const name=path.basename(m[1].replace(/\\/g,'/'));const file=path.join(dir,name);try{if(/\.exe$/i.test(name)&&!launcher.isVersionedUpdater(name)&&fs.statSync(file).isFile())return file;}catch{}}
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
 if(!best)return '';
 /* E-DRM: never the DRM wrapper (SdWrap *_srp.exe, or a starter that runs it) and, when a cracked engine program of about
    the same size is there, not the protected one either (core/drm-wrap.cjs). The launcher that starts a protected program
    is chosen at launch time. Only folders with SoftDenchi traces are read here, so the scan stays fast. */
 if(listing(dir).names.some(n=>/\.exe\.emb$|_srp\.exe$/i.test(n))){try{const p=require('./drm-wrap.cjs').plan(path.join(dir,best),{allowTranslated:translatedDir});if(p&&p.executable)return p.executable;}catch{}}
 return path.join(dir,best);
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
/* 2026-11-21 (群友: BALDR SKY Steam 版 Dive1+Dive2 扫不出/打不开) a Steam install that holds one work in parts: the install
   root's program and a program of the same file name in a subfolder (BALDR SKY: BaldrSky.exe + Dive1\BaldrSky.exe, the part
   folder carries only its own override archives and no steam_api.dll). Steam's single launch option starts only the root
   one. Every part is recorded as a variant, so a part added by hand is the same library game and the launch knows the
   install tree. Generic: same program name, any engine; a game diff may name the parts (library.partLabels). */
const PART_SKIP=/^(save|savedata|_commonredist|redist|directx|manual|ost|soundtrack|bonus|extra|movie|backup|bak)$/i;
function steamParts(root,exe,title=''){
 if(!root||!exe||path.dirname(exe).toLowerCase()!==path.resolve(root).toLowerCase())return [];
 const name=path.basename(exe).toLowerCase(),parts=[{dir:path.resolve(root),exe,name:''}];
 for(const n of listing(root).names){const sub=path.join(root,n);try{if(PART_SKIP.test(n)||isTranslated(n)||!fs.statSync(sub).isDirectory())continue;}catch{continue;}
  const hit=listing(sub).names.find(f=>f.toLowerCase()===name);if(!hit)continue;try{if(fs.statSync(path.join(sub,hit)).size<200000)continue;}catch{continue;}
  parts.push({dir:sub,exe:path.join(sub,hit),name:n});}
 if(parts.length<2)return [];
 let labels=null;try{const P=require('./profiles/index.cjs');labels=P.get(P.profileFor({exe,title,folder:root,steamAppId:require('./steam-owned.cjs').steamOf(exe)?.appid||''}),'library.partLabels',null);}catch{}
 return parts.map(p=>({label:String(labels?.[p.name||'.']||p.name||title||path.basename(root)),dir:p.dir,exe:p.exe,part:p.name||'.'}));}
/* why each scanned folder was taken or left out (logs/library-scan.log, kept under 512 KB): a game "not found" by the scan
   is told from this file instead of a guess */
function scanLog(root,entry){if(!root)return;try{const dir=path.join(root,'logs'),file=path.join(dir,'library-scan.log');fs.mkdirSync(dir,{recursive:true});try{if(fs.statSync(file).size>512*1024)fs.renameSync(file,file+'.1');}catch{}fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),...entry})+'\n');}catch{}}
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
// reg.exe prints in the console code page (GBK on Chinese Windows), but the output was read as UTF-8, so a Steam folder
// with Chinese or Japanese in its path came back garbled and was not found. PowerShell is told to print UTF-8.
async function steamFromRegistry(){const p=await registryString('HKCU\\Software\\Valve\\Steam','SteamPath');return p?path.normalize(p):'';}
async function findSteam(){
 const tries=[await steamFromRegistry(),'C:\\Program Files (x86)\\Steam','C:\\Program Files\\Steam','D:\\Steam','E:\\Steam','D:\\SteamLibrary','E:\\SteamLibrary'];
 for(const p of tries)if(p&&fs.existsSync(path.join(p,'steamapps')))return p;return '';
}
function vdfValues(text,key){const out=[];const re=new RegExp('"'+key+'"\\s+"((?:[^"\\\\]|\\\\.)*)"','gi');let m;while((m=re.exec(text)))out.push(m[1].replace(/\\\\/g,'\\'));return out;}
function steamLibraries(steam){
 const libs=new Map(),add=p=>{const n=path.normalize(p);if(!libs.has(n.toLowerCase()))libs.set(n.toLowerCase(),n);};add(steam);try{for(const p of vdfValues(fs.readFileSync(path.join(steam,'steamapps','libraryfolders.vdf'),'utf8'),'path'))add(p);}catch{}
 return [...libs.values()].filter(p=>fs.existsSync(path.join(p,'steamapps')));
}
// A Steam client in another language caches art with a language suffix (library_capsule_schinese.jpg,
// header_schinese.jpg), often with no unsuffixed copy. Portrait art comes first, wherever it sits.
const STEAM_ART=['library_600x900','library_capsule','header','library_header'];
function steamCover(steam,appid){
 const base=path.join(steam,'appcache','librarycache',String(appid));let dirs=[base];
 try{dirs=dirs.concat(fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>path.join(base,d.name)));}catch{}
 const files=dirs.map(d=>{try{return fs.readdirSync(d).map(n=>path.join(d,n));}catch{return [];}}).flat();
 for(const kind of STEAM_ART)for(const name of [kind+'_schinese.jpg',kind+'_japanese.jpg',kind+'.jpg',new RegExp('^'+kind+'_[a-z]+\\.jpg$')]){
  const hit=files.find(f=>typeof name==='string'?path.basename(f)===name:name.test(path.basename(f)));if(hit)return hit;}
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
/* E-SteamOwned: Steam's install manifests are read by core/steam-owned.cjs (one reader for the scan and the launch) */
function steamAppidFor(executable){const r=require('./steam-owned.cjs').steamOf(executable);return r?.installed?r.appid:'';}

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
/* 2026-11-28 (owner: 1.4.26 游戏库刷新要等特别久) the VNDB answers a scan got, kept in data/config/library-lookups.json: a match
   7 days, "no such work" 1 day, a failed ask never. A refresh asks VNDB again only for names it has not asked lately. */
const LOOKUP_HIT=7*864e5,LOOKUP_MISS=864e5;
class Lookups{
 constructor(root){this.file=path.join(root,'data','config','library-lookups.json');this.dirty=false;this.running=new Map();
  try{const v=JSON.parse(fs.readFileSync(this.file,'utf8'));this.all=v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{this.all={};}}
 get(key,ask){const e=this.all[key];if(e&&Date.now()-e.at<(e.v?LOOKUP_HIT:LOOKUP_MISS))return Promise.resolve(e.v);
  if(this.running.has(key))return this.running.get(key);
  const job=ask().then(v=>{if(v!==undefined){this.all[key]={at:Date.now(),v};this.dirty=true;}return v;}).finally(()=>this.running.delete(key));this.running.set(key,job);return job;}
 vn(title,strict){return this.get('vn:'+(strict?1:0)+':'+title,()=>vndb(title,strict));}
 steam(appid){return this.get('steam:'+appid,()=>vndbSteam(appid));}
 save(){if(!this.dirty)return;try{const now=Date.now();for(const [k,e] of Object.entries(this.all))if(!e||now-e.at>LOOKUP_HIT)delete this.all[k];
  fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.all));fs.renameSync(this.file+'.tmp',this.file);this.dirty=false;}catch{}}
}
/* runs job over the items, `limit` at a time */
async function pool(items,limit,job){let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const item=items[next++];try{await job(item);}catch{}}}));}
/* the names a folder game is looked up by on VNDB, in the order the scan asks them (it stops at the first match) */
function lookupQueries(names){return [...new Set(names.flatMap(n=>[n,n.replace(/\s*[（(][^）)]*[）)]/g,'').trim(),...searchNames(n),...[...n.matchAll(/[（(]([^）)]+)[）)]/g)].map(m=>m[1])]).filter(Boolean))].slice(0,8);}
const LOOKUPS_AT_ONCE=3;
async function download(url,file){try{const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)return false;fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));return true;}catch{return false;}}

const libraryStateFields=['autoSeries','localeAutoJapanese','localePath','setupDone','steamPath','folders','games','scanVersion','notGal'];
const libraryScanFields=new Set(['games','scanVersion','notGal']);
const librarySnapshot=state=>Object.fromEntries(libraryStateFields.filter(key=>!libraryScanFields.has(key)).map(key=>[key,JSON.stringify(state[key])]));
class Library{
 constructor(layout){this.locale=new LocaleEmulator(layout.root||path.dirname(layout.config));this.file=path.join(layout.config,'library.json');this.coverDir=path.join(layout.root||path.dirname(layout.config),'data','assets','covers');this.state=this.read();this.persisted=librarySnapshot(this.state);this.verifiedPids=new Set();this.logRoot=layout.root||path.dirname(layout.config);}
 read(){try{const v=JSON.parse(fs.readFileSync(this.file,'utf8'));return {autoSeries:v.autoSeries!==false,localeAutoJapanese:v.localeAutoJapanese!==false,localePath:String(v.localePath||''),setupDone:!!v.setupDone,steamPath:steamRoot(String(v.steamPath||'').trim()),folders:Array.isArray(v.folders)?v.folders.map(String):[],games:Array.isArray(v.games)?v.games:[],scanVersion:5,notGal:v.scanVersion===5&&v.notGal&&typeof v.notGal==='object'?v.notGal:{}};}catch{return {setupDone:false,steamPath:'',folders:[],games:[],notGal:{}};}}
 write(editedFields=[]){try{
  let latest;try{latest=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;latest={};}
  if(!latest||typeof latest!=='object'||Array.isArray(latest))return false;
  // Scanning owns its result fields, while settings and future fields remain owned by their current file values.
  const next={...latest};for(const key of libraryStateFields)if(Object.hasOwn(this.state,key)&&(libraryScanFields.has(key)||editedFields.includes(key)||!Object.hasOwn(latest,key)||JSON.stringify(this.state[key])!==this.persisted[key]))next[key]=this.state[key];
  fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(next,null,2));fs.renameSync(this.file+'.tmp',this.file);
  const saved=this.read();for(const key of libraryStateFields)if(!libraryScanFields.has(key))this.state[key]=saved[key];this.persisted=librarySnapshot(this.state);return true;
 }catch{return false;}}
 load(){return {...this.state,games:this.state.games.map(playableGame)};}
 async findSteam(){return {path:await findSteam()};}
 check(kind,value){
  const input=String(value||'').trim(),p=kind==='steam'?steamRoot(input):input;if(!p)return {ok:false,message:'未填写'};
  if(!fs.existsSync(p)||!fs.statSync(p).isDirectory())return {ok:false,message:'文件夹不存在'};
  if(kind==='steam'){if(!fs.existsSync(path.join(p,'steamapps')))return {ok:false,message:'不是 Steam 目录（里面没有 steamapps）'};const n=steamGames(p).length;return {ok:true,message:'找到 '+steamLibraries(p).length+' 个 Steam 库，'+n+' 个已安装应用'};}
  const n=folderGames(p).length;return {ok:true,message:n?'有 '+n+' 个子文件夹待识别':'文件夹是空的'};
 }
 settings(v){this.state.steamPath=steamRoot(String(v.steamPath||'').trim());this.state.folders=String(v.folders||'').split(/[;\n]/).map(s=>s.trim()).filter(Boolean);this.state.setupDone=v.setupDone!==false;this.write(['steamPath','folders','setupDone']);return this.state;}
 // Scans Steam and the folders; returns games with engine, hook state, program and a cover file inside Tomoyo's
 // covers folder (Tomoyo only reads images there). Known games keep their media id and confirmed hook state.
 /* 2026-11-28 (owner: 1.4.26 游戏库刷新要等特别久) network:false is the pass the refresh button waits for: it asks nothing on the
    network. A game already in the library with the same program is kept as it is, a new game of a known engine is listed under its
    folder name, and a folder only VNDB can confirm waits. this.lookups counts what was left for the network pass, which the service
    runs right after in the background (services/runtime.cjs library_scan); that pass asks VNDB a few folders at a time and keeps
    the answers (Lookups), so a later refresh asks again only for names it has not asked lately. */
 async scan(progress=()=>{},{incremental=false,network=true}={}){
  this.lookups=0;const lookups=new Lookups(this.logRoot),covers=[];
  // Folders in the user's game folders that could not be confirmed as visual novels (unknown engine and no VNDB
  // match) are reported instead of vanishing, so the library can offer to add them by hand.
  this.unconfirmed=[];this.confirmedFolderMatches=new Set();
  require('./steam-owned.cjs')._internal.cache.clear();
  const found=[],skipped=[];this.restorable=new Map();if(this.state.steamPath)found.push(...steamGames(this.state.steamPath));for(const f of this.state.folders)found.push(...folderGames(f));
  const known=new Map(this.state.games.map(g=>[String(g.dir||'').toLowerCase(),g]));if(!this.state.notGal)this.state.notGal={};const games=[],scanned=new Set();let i=0;
  try{fs.mkdirSync(this.coverDir,{recursive:true});}catch{}
  /* the network pass asks VNDB for every folder that needs it, LOOKUPS_AT_ONCE at a time; the loop below then reads the answers */
  if(network){const asks=[],seen=new Set();
   for(const c of found){const rootKey=c.root.toLowerCase();if(seen.has(rootKey))continue;seen.add(rootKey);
    let stamp=0;try{stamp=Math.round(fs.statSync(c.root).mtimeMs);}catch{}if(this.state.notGal[rootKey]===stamp&&!known.has(rootKey))continue;
    const g=findGame(c.root);if(!g?.exe)continue;const previous=known.get(g.dir.toLowerCase());
    if(incremental&&previous&&!previous.steamRejected&&!previous.pendingLookup&&String(previous.exe).toLowerCase()===g.exe.toLowerCase())continue;
    const appid=c.appid||steamAppidFor(g.exe);
    if(appid)asks.push(()=>lookups.steam(appid));
    else if(!g.engine||g.engine.hook===null||c.source==='folder'){const names=[...new Set([c.source==='folder'&&g.dir!==c.root?label(g.dir):'',c.title].filter(Boolean))];
     asks.push(async()=>{for(const n of lookupQueries(names))if(await lookups.vn(n,false))break;});}}
   await pool(asks,LOOKUPS_AT_ONCE,ask=>ask());}
  for(const c of found){progress({done:i++,total:found.length,title:c.title});
   if(scanned.has(c.root.toLowerCase()))continue;
   scanned.add(c.root.toLowerCase());
   // Folders already found not to be a visual novel are skipped until their contents change (start-up checks stay fast).
   const stamp=(()=>{try{return Math.round(fs.statSync(c.root).mtimeMs);}catch{return 0;}})(),rootKey=c.root.toLowerCase();
   if(this.state.notGal[rootKey]===stamp&&!known.has(rootKey)){scanLog(this.logRoot,{source:c.source,appid:c.appid||'',title:c.title,dir:c.root,result:'skipped',why:'not-gal-cached'});if(c.source==='folder')this.unconfirmed.push({title:c.title,dir:c.root});continue;}
   const g=findGame(c.root);
   // A visual-novel folder whose only program is a translated edition (CLANNAD's clannadFV_sc.exe, the original REALLIVE.EXE
   // moved aside by the patch) is kept as a library game in that language; the game language dialog offers the original.
   if(g&&g.engine&&!g.exe){const patched=listing(g.dir).names.filter(n=>/\.exe$/i.test(n)&&isTranslated(n)&&!SKIP_EXE.test(n)&&!SKIP_EXE_ANY.test(n)).sort((a,b)=>{try{return fs.statSync(path.join(g.dir,b)).size-fs.statSync(path.join(g.dir,a)).size;}catch{return 0;}})[0];if(patched){this.restorable.set(g.dir.toLowerCase(),restoreTool(g.dir,patched));g.exe=path.join(g.dir,patched);g.translated=translationOf(patched.replace(/\.exe$/i,''))||'zh';}}
   /* E295 (user report 2026-11-10: Steam's "Tomoyo After ~It's a Wonderful Life~ English Edition" was not listed): a folder
      named as a translated edition hides its own program from the scan. It is listed with its main program as that
      language's edition, so the game language dialog can point to a Japanese one. */
   if(g&&g.engine&&!g.exe&&isTranslated(g.dir)){const own=mainExe(g.dir,true);if(own){g.exe=own;g.translated=translationOf(path.basename(g.dir))||'en';}}
    if(!g||!g.exe){scanLog(this.logRoot,{source:c.source,appid:c.appid||'',title:c.title,dir:c.root,result:'skipped',why:!g?'no-program':'no-japanese-program',engine:g?.engine?.name||'',programs:listing(c.root).names.filter(n=>/\.exe$/i.test(n)).slice(0,12)});continue;}
    const appid=c.appid||steamAppidFor(g.exe);
    if(appid){c.source='steam';c.appid=appid;}
    const previous=known.get(g.dir.toLowerCase());
    const steamTrusted=c.source!=='steam'||String(previous?.appid||'')===c.appid&&previous?.vndbSteamAppid===c.appid&&(previous.vndbId||g.engine&&!g.engine.generic);
    if(previous&&String(previous.exe).toLowerCase()===g.exe.toLowerCase()&&(!network||incremental&&!previous.steamRejected&&steamTrusted&&!previous.pendingLookup)){
     if(previous.pendingLookup)this.lookups++;
     games.push({...previous,missing:false,engine:g.engine?.name||previous.engine||'',hook:previous.hook==='verified'?'verified':hookState(g.engine),variants:c.source==='folder'?findVariants(c.root):c.source==='steam'?steamParts(g.dir,g.exe,c.title):previous.variants||[]});scanLog(this.logRoot,{source:c.source,appid:c.appid||'',title:c.title,dir:g.dir,exe:g.exe,result:'kept',engine:g.engine?.name||previous.engine||''});continue;
    }
   // A folder game is named after its game folder when that is deeper (E:GAL素晴日素晴らしき日々HD版 -> 素晴らしき日々).
   const names=[...new Set([c.source==='folder'&&g.dir!==c.root?label(g.dir):'',c.title].filter(Boolean))];
   let vn=null,lookupFailed=false;const queries=lookupQueries(names);
   if(!network){this.lookups++;lookupFailed=true;}
   else{if(c.source==='steam'){const hit=await lookups.steam(c.appid);if(hit===undefined)lookupFailed=true;else if(hit)vn=hit;}
    if(c.source!=='steam'&&!vn&&(!g.engine||g.engine.hook===null||c.source==='folder'))for(const n of queries){const result=await lookups.vn(n,false);if(result===undefined)lookupFailed=true;else if(result){vn=result;break;}}}
   if(c.source==='folder'&&vn?.id)this.confirmedFolderMatches.add(g.dir);
   if(!vn&&lookupFailed&&c.source==='steam'&&previous?.appid===c.appid&&previous.vndbSteamAppid===c.appid&&previous.vndbId)vn={id:previous.vndbId,title:previous.names?.[1]||previous.title};
   // Steam also installs software. An AppID link or a specific visual-novel engine confirms an automatic entry.
   if((!g.engine||g.engine.generic)&&!vn){
    if(!lookupFailed){
     this.state.notGal[rootKey]=stamp;
     if(c.source==='steam'&&previous){
      games.push(previous.source==='manual'?{...previous,missing:false}:{...previous,steamRejected:true,vndbId:null,vndbSteamAppid:null,missing:false});
     }
    }
    if(!network){/* left for the network pass; a game already listed stays as it was until then */
     if(previous)games.push({...previous,missing:false});
     scanLog(this.logRoot,{source:c.source,appid:c.appid||'',title:c.title,dir:g.dir,exe:g.exe,result:'waiting',why:'network-pass',engine:g.engine?.name||''});continue;}
    scanLog(this.logRoot,{source:c.source,appid:c.appid||'',title:c.title,dir:g.dir,exe:g.exe,result:'skipped',why:lookupFailed?'vndb-unreachable':'not-gal',engine:g.engine?.name||''});
    if(c.source==='folder')this.unconfirmed.push({title:c.title,dir:g.dir,exe:g.exe});
    continue;
   }delete this.state.notGal[rootKey];
   const old=known.get(g.dir.toLowerCase())||{};const key=crypto.createHash('sha1').update(g.dir.toLowerCase()).digest('hex').slice(0,16);
   const identityChanged=c.source==='steam'&&String(old.vndbId||'')!==String(vn?.id||'');
   let cover=!identityChanged&&old.cover&&fs.existsSync(old.cover)?old.cover:'';
   if(!cover){const target=path.join(this.coverDir,'tome-'+key+'.jpg');
    if(c.cover){try{fs.copyFileSync(c.cover,target);cover=target;}catch{}}
    else if(vn?.cover){cover=target;covers.push({url:vn.cover,target,key});}}
   games.push({key,source:old.source==='manual'?'manual':c.source,appid:c.appid||null,...(network?{}:{pendingLookup:true}),title:c.source==='steam'?c.title:(vn?.title||names[0]),names:[...new Set([...names,vn?.title].filter(Boolean))],dir:g.dir,exe:g.exe,engine:g.engine?.name||'',
    hook:old.hook==='verified'?'verified':hookState(g.engine),vndbId:vn?.id||(c.source==='steam'?null:old.vndbId)||null,cover,mediaId:old.mediaId||null,
    ...(c.source==='steam'?{vndbSteamAppid:!lookupFailed||vn?c.appid:null,steamRejected:false}:{}),
    variants:c.source==='folder'?findVariants(c.root):c.source==='steam'?steamParts(g.dir,g.exe,c.title):[],...(g.translated?{contentLanguage:g.translated}:{})});
   scanLog(this.logRoot,{source:c.source,appid:c.appid||'',title:c.title,dir:g.dir,exe:g.exe,result:'added',engine:g.engine?.name||'',vndb:vn?.id||'',parts:games[games.length-1].variants.length||undefined});}
  /* the covers the network pass found, LOOKUPS_AT_ONCE at a time; a game whose cover did not come keeps none */
  await pool(covers,LOOKUPS_AT_ONCE,async c=>{if(!await download(c.url,c.target)){const g=games.find(x=>x.key===c.key);if(g)g.cover='';}});
  progress({done:found.length,total:found.length,title:''});
  // Games found earlier that are now gone are kept (their media entries stay), only marked missing.
  for(const old of this.state.games)if(!games.some(g=>g.dir.toLowerCase()===String(old.dir||'').toLowerCase()))games.push({...old,missing:old.source==='manual'?!fs.existsSync(old.exe):true});
  const latest=this.read();for(const key of ['steamPath','folders','localeAutoJapanese','localePath','autoSeries'])if(latest[key]!==undefined)this.state[key]=latest[key];
  lookups.save();
  this.state.scanVersion=5;this.state.games=games;this.write();return games.concat(skipped);
 }
 manualAdd(value){
  const exe=path.resolve(String(value?.exe||'').trim());if(!/\.exe$/i.test(exe)||!fs.existsSync(exe)||!fs.statSync(exe).isFile())throw Error('请选择现有游戏 exe 文件');
  if(isTranslated(exe)||SKIP_EXE.test(path.basename(exe))||SKIP_EXE_ANY.test(path.basename(exe)))throw Error('请选择原游戏程序，不要选择补丁或翻译启动器');
  /* a part program picked by hand (Dive1\BaldrSky.exe) belongs to the install root's game: same record, engine and parts */
  let dir=path.dirname(exe),parts=[];{const up=path.dirname(dir),rootExe=path.join(up,path.basename(exe));if(up!==dir&&fs.existsSync(rootExe)&&require('./steam-owned.cjs').steamOf(exe)?.installed){const p=steamParts(up,rootExe,String(value?.title||''));if(p.some(v=>v.exe.toLowerCase()===exe.toLowerCase())){dir=up;parts=p;}}}
  const engine=engineOf(dir),key=crypto.createHash('sha1').update(dir.toLowerCase()).digest('hex').slice(0,16),old=this.state.games.find(g=>g.key===key)||{};
  const title=String(value.title||old.title||label(dir)).trim().slice(0,180);if(!title)throw Error('请填写游戏名称');
  const game={...old,key,source:'manual',title,names:[...new Set([title,...old.names||[]])],dir,exe,engine:engine?.name||'',hook:old.hook==='verified'?'verified':hookState(engine),variants:parts,missing:false};
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
  const steamId=require('./steam-owned.cjs').launchAppid(exe,g);
  let localeResult={};if(!running&&!steamId&&options.localeJapanese!==false&&recommended(g,exe)){localeResult=await this.locale.launch(exe);if(localeResult.needLocaleEmulator){try{await this.locale.ensure();localeResult=await this.locale.launch(exe);}catch{}if(localeResult.needLocaleEmulator)return localeResult;}}
  if(!running&&!localeResult.localeJapanese){const {spawn}=require('node:child_process');
   if(steamId)spawn('explorer.exe',['steam://rungameid/'+steamId],{detached:true,stdio:'ignore'}).unref();
   else{/* E-DRM: a DRM-wrapped program is started through the launcher beside it (core/drm-wrap.cjs) */let start=exe;try{const p=require('./drm-wrap.cjs').plan(exe,{allowTranslated:isTranslated(path.dirname(exe)),source:g.source});if(p?.launchVia)start=p.launchVia;else if(p?.changed&&p.executable)start=p.executable;}catch{}
    spawn(start,[],{cwd:path.dirname(start),detached:true,stdio:'ignore'}).unref();}}
  return {name,mediaId:g.mediaId||null,running,title:g.title,...localeResult};
 }
 // Called when the hook delivers real text from a bound game: that game's hook is confirmed.
 verify(exe){
  const dir=path.dirname(String(exe||'')).toLowerCase();if(!dir||dir==='.')return false;
  const g=this.state.games.find(x=>{const d=String(x.dir||'').toLowerCase();return d===dir||dir.startsWith(d+path.sep)||d.startsWith(dir+path.sep);});
  if(!g||g.hook==='verified')return false;g.hook='verified';this.write();return true;
 }
}
// Fetch synopses from VNDB, Moegirlpedia and Bangumi and cache them in config/synopsis.json.
const clean=s=>String(s||'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|h\d|li|div)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
 .replace(/\[url=[^\]]*\]([^[]*)\[\/url\]/gi,'$1').replace(/\[\/?(b|i|u|s|spoiler|quote|raw|code)\]/gi,'').replace(/\[From [^\]]+\]\s*$/i,'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
async function vndbText(id,titles){
 let filters=id?['id','=',/^v/i.test(id)?id:'v'+id]:null;if(!filters){for(const t of titles){const vn=await vndb(t,true);if(vn){filters=['id','=',vn.id];break;}}}if(!filters)return '';
 try{const r=await fetch('https://api.vndb.org/kana/vn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters,fields:'description,alttitle,title,titles.title,aliases'}),signal:AbortSignal.timeout(9000)});if(!r.ok)return '';const v=(await r.json()).results?.[0];return {text:clean(v?.description||''),alttitle:v?.alttitle||'',names:[v?.title,v?.alttitle,...(v?.titles||[]).map(x=>x.title),...(v?.aliases||[])].filter(x=>typeof x==='string'&&x)};}catch{return '';}
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
const MOEGIRL_SOURCE='萌娘百科 · CC BY-NC-SA 3.0';
/* the opening of a Moegirlpedia page for one of the titles (the MediaWiki "extracts" API; redirects followed, a disambiguation page or a stub is no synopsis) */
async function moegirlText(titles,{fetcher=globalThis.fetch,timeout=8000}={}){
 const names=[...new Set((titles||[]).map(t=>String(t||'').replace(/^(\s*\[[^\]]*\])+\s*/,'').trim()).filter(t=>t&&t.length<=120))].slice(0,6);if(!names.length||!fetcher)return null;
 try{const r=await fetcher('https://zh.moegirl.org.cn/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&redirects=1&titles='+names.map(encodeURIComponent).join('%7C'),{headers:{'user-agent':'MeguLit',accept:'application/json'},signal:AbortSignal.timeout(timeout)});
  if(!r.ok)return null;const j=await r.json();const pages=Object.values(j?.query?.pages||{}).filter(p=>p&&p.ns===0&&typeof p.extract==='string'&&p.extract.trim().length>=40&&!/消歧义|可以指|可能指|可能是指/.test(p.extract.slice(0,200)));
  const rank=p=>{const k=names.findIndex(n=>n.toLowerCase()===String(p.title).toLowerCase());return k<0?99:k;};pages.sort((x,y)=>rank(x)-rank(y));const page=pages[0];if(!page)return null;
  const text=page.extract.split(String.fromCharCode(10)).map(x=>x.split(String.fromCharCode(9)).join(' ').trim()).filter(Boolean).slice(0,3).join(String.fromCharCode(10,10)).slice(0,1500).trim();return text.length>=40?{text,title:String(page.title)}:null;}catch{return null;}
}
class Synopses{
 constructor(layout,options={}){
  this.lookup=options.lookup||vndbText;this.moegirl=options.moegirl||moegirlText;this.bangumi=options.bangumi||(titles=>require('./bangumi.cjs').work(titles));this.translate=options.translate||machine;
  this.file=path.join(layout.config,'synopsis.json');this.running=new Map();
 }
 read(){try{return JSON.parse(fs.readFileSync(this.file,'utf8'))||{};}catch{return {};}}
 write(id,entry){
  try{
   fs.mkdirSync(path.dirname(this.file),{recursive:true});
   const cache=this.read();cache[id]=entry;
   if(!fs.existsSync(this.file+'.pre-vndb.json')&&fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.pre-vndb.json');
   fs.writeFileSync(this.file+'.tmp',JSON.stringify(cache,null,1));fs.renameSync(this.file+'.tmp',this.file);
  }catch{}
 }
 async get(a){
  const policy=require('./synopsis-policy.cjs'),id=String(a.mediaId);
  const lang=['zh','en','ja'].includes(a.lang)?a.lang:'zh';
  while(this.running.has(id))await this.running.get(id).catch(()=>{});
  let entry=policy.forWork(this.read()[id],a);
  // Retry a missing translation after ten minutes. A choice between providers never invalidates the shared entry.
  const age=Date.now()-(entry?.at||0);
  if(a.refresh||!entry||(!entry[lang]&&age>600000)||entry.policy!==policy.POLICY||entry.mg!==1||entry.bg!==1||age>86400000){
   const job=this.fetch(a,entry).finally(()=>this.running.delete(id));this.running.set(id,job);
   entry=await job;
  }
  return policy.views(entry,lang,a.sources||a.moegirl).synopsis;
 }
 async fetch(a,previous){
  const {approved,POLICY}=require('./synopsis-policy.cjs'),old=previous||{};
  const titles=[...new Set((a.titles||[]).map(String).filter(Boolean))];
  const out={at:Date.now(),policy:POLICY,mg:1,bg:1,src:{},vndbId:String(a.vndbId||'')};
  if(a.appid)out.steamIdentity=a.appid+':'+out.vndbId;
  const put=(lang,text,source)=>{if(text&&!out[lang]){out[lang]=text;out.src[lang]=source;}};
  const vn=a.appid&&!a.vndbId?null:await this.lookup(a.vndbId,a.appid?[]:titles);
  if(vn?.text)put('en',vn.text.slice(0,20000),'VNDB');
  if(vn?.alttitle)titles.push(vn.alttitle);
  if(vn?.names)titles.push(...vn.names);
  /* Bangumi is matched by the names VNDB gives first (its original name), then the library's; see core/bangumi.cjs */
  const [mg,bg]=await Promise.all([this.moegirl(titles),this.bangumi([vn?.alttitle,...(vn?.names||[]),...titles].filter(Boolean))]);
  if(bg?.text)out.bangumi={text:bg.text,src:bg.source,lang:bg.lang,id:bg.id,url:bg.url,name:bg.name,nameCn:bg.nameCn,cover:bg.cover,score:bg.score,votes:bg.votes,developer:bg.developer};
  else if(old.bangumi?.text)out.bangumi=old.bangumi;
  if(mg?.text)out.moegirl={text:mg.text,src:MOEGIRL_SOURCE,title:mg.title};
  else if(old.moegirl?.text)out.moegirl=old.moegirl;
  const changed=out.en&&old.en&&out.en!==old.en;
  const keep=lang=>approved(old.src?.[lang])&&!(changed&&/^VNDB.*(?:机翻|MT)/i.test(old.src[lang]));
  await Promise.all(['zh','ja'].map(async lang=>{
   if(!out.en||(old[lang]&&keep(lang)&&!/机翻|MT/.test(old.src[lang])))return;
   const text=await this.translate(out.en,lang,'en');
   if(text&&text.trim()!==out.en.trim())put(lang,text,'VNDB · 机翻');
  }));
  for(const lang of ['zh','en','ja'])if(keep(lang))put(lang,old[lang],old.src[lang]);
  this.write(String(a.mediaId),out);
  return out;
 }
}
module.exports={_moegirlText:moegirlText,norm,searchNames,machine,restoreTool,Library,Synopses,engineOf,findGame,steamGames,steamAppidFor,folderGames,findSteam,registryString,findVariants,steamParts,isTranslated,playableGame};
