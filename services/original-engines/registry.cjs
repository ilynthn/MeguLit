// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E601 the engine registry (user 2026-11-14: 合并检测). One table for both halves of an engine: how the library
   recognises a game folder (cheap file fingerprints, first match wins, checked in this order) and which script readers
   read it (ids in scenes.cjs ENGINES; 'bgi' and 'system4' are the legacy adapters in original-text.cjs). The library
   (core/library.cjs) and the script reader choice (scenes.detect) both take it from here, so an engine is added in one
   place, next to its readers. Entries without readers are recognised only (hook and GARbro fallback).
   Moved verbatim from core/library.cjs (the tests and listing() are unchanged). */
const fs=require('node:fs'),path=require('node:path');

// Engine signatures, checked in the game folder (and one level of data folders). hook: LunaHook reads the text.
const ENGINES=[
 {name:'BGI / Ethornell',hook:true,test:f=>f.has(/^BGI.*\.exe$/i)||f.has(/^sysgrp\.arc$/i)||(f.has(/\.arc$/i)&&f.has(/^bgi\.gdb$/i))},
 {name:'YU-RIS',hook:true,test:f=>f.has(/\.ypf$/i)||f.sub('pac',/\.ypf$/i)||f.has(/^yscfg\.dat$/i)},
 {name:'KiriKiri',hook:true,test:f=>f.has(/\.xp3$/i)},
 {name:'SiglusEngine',hook:true,test:f=>f.has(/^scene\.pck$/i)||f.has(/^siglusengine.*\.exe$/i)},
 {name:'RealLive',hook:true,test:f=>f.has(/^seen\.txt$/i)||f.has(/^reallive.*\.exe$/i)},
 {name:'CatSystem2',hook:true,test:f=>f.has(/^cs2conf\.dll$/i)||(f.has(/\.int$/i)&&f.has(/^cs2.*\.exe$/i))},
 {name:'Artemis',hook:true,test:f=>f.has(/\.pfs(\.\d+)?$/i)},
 /* E578 or a data*.dat / *.lib that opens as a Malie archive (plain LIB / LIBU, or LIBP with one of the known title keys) */
 {name:'Malie',hook:true,test:f=>f.has(/^malie\.ini$/i)||f.has(/\.lib$/i)&&f.has(/^malie.*\.exe$/i)||(f.has(/^data\d*\.dat$|\.lib$/i)||f.sub('data',/^data\d*\.dat$|\.lib$/i))&&require('./malie.cjs').probe(f.dir)},
 {name:'AdvHD / WillPlus',hook:true,test:f=>f.has(/^rio\.arc$/i)||f.has(/^advhd\.exe$/i)},
 {name:'Majiro',hook:true,test:f=>f.has(/^scenario\.arc$/i)&&f.has(/\.arc$/i)},
 {name:'QLIE',hook:true,test:f=>f.sub('GameData',/\.pack$/i)},
 /* E568 Softpal keeps PAL.dll in dll\ (時計仕掛けのレイライン); its archives start "PAC " (NeXAS: "PAC" + a version byte) */
 {name:'SoftPal',hook:true,test:f=>f.has(/^pal\.dll$/i)||f.sub('dll',/^pal\.dll$/i)||f.magic(/^data\.pac$/i,'PAC ')||(f.has(/^data\.pac$/i)&&f.has(/^script\.src$/i))},
 {name:'NeXAS',hook:true,test:f=>f.has(/^thumbnail\.pac$/i)||f.has(/^update\.pac$/i)||f.has(/^script\.pac$/i)&&!f.magic(/^script\.pac$/i,'PAC ')},
 /* E583 AliceSoft System 3.5–3.9: scenario in xxxSA.ALD (and System39.ain for 3.9), no System4 .ain beside it */
 {name:'System 3.x (AliceSoft)',hook:null,test:f=>f.has(/^system39\.ain$/i)||f.has(/s[a-z]\.ald$/i)&&!f.has(/\.ain$/i)},
 {name:'System4 (AliceSoft)',hook:true,test:f=>f.has(/\.ain$/i)||f.has(/\.ald$/i)||f.magicAny(/\.afa$/i,'AFAH')},
 /* E579 WARC 1.x archives (a .war of another engine is not counted) */
 {name:'ShiinaRio',hook:true,test:f=>f.magicAny(/\.war$/i,'WARC')},
 /* E582 Entis GLS: .noa archives, or Cotopha images (.csx) left loose */
 {name:'Entis / Cotopha',hook:true,test:f=>f.has(/\.noa$/i)||f.magicAny(/\.csx$/i,'Entis\x1a')},
 {name:'NScripter',hook:true,test:f=>f.has(/^(arc\.nsa|nscript\.dat|00\.txt|0\.txt)$/i)},
 /* LiveMaker 2/3: game.dat (or an .ext beside the exe) is a "vff" archive */
 {name:'LiveMaker',hook:true,test:f=>f.has(/\.lsb$/i)||f.has(/^live\.dll$/i)||f.magicAny(/\.(dat|ext)$/i,'vff\0')},
 /* E643 Propeller's .mpk (index offset first, XORed names) before MAGES, whose test takes any .mpk (MAGES archives start "MPK\0") */
 {name:'Stuff Script (Propeller)',hook:null,test:f=>f.probe(/\.mpk$/i,p=>{const l=require('./stuff.cjs').list(p);return !!l&&l.some(e=>/\.msc$/i.test(e.name));})||f.sub('msc',/\.msc$/i)},
 {name:'MAGES',hook:true,test:f=>f.has(/.mpk$/i)||f.sub('languagebarrier',/./)},
 /* Spike Chunsoft SDL2 ports (Steam ダンガンロンパ 1・2): AGAR .wad archives */
 {name:'Spike Chunsoft (WAD)',hook:null,test:f=>f.magic(/\.wad$/i,'AGAR')},
 {name:'Light.vn',hook:true,test:f=>f.has(/\.vndat$/i)},
 {name:'minori (PAZ)',hook:true,test:f=>f.has(/^(scr|sys)\.paz$/i)},
 {name:'Nitroplus (NPK)',hook:true,test:f=>f.has(/^(script|system)\.npk$/i)},
 // Older Nitroplus titles (装甲悪鬼村正, 沙耶の唄, スマガ…) pack scripts as nss.npa / system.npa (user report 2026-11-09).
 {name:'Nitroplus (NPA)',hook:true,test:f=>f.has(/^(nss|system|cg|sound)\.npa$/i)||f.names.filter(n=>/\.npa$/i.test(n)).length>=2},
 {name:"Ren'Py",hook:true,test:f=>f.has(/^renpy$/i)||f.sub('game',/\.rp[ay]c?$/i)},
 /* E610 F1 bundled assets (web / NW.js / Electron / zip): webbundle.cjs profiles. Before TyranoScript, whose package.nw clause would otherwise claim any NW.js bundle */
 {name:'Visual Novel Maker',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'vnmaker')},
 {name:'Twine / SugarCube',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'twine')},
 {name:'WebGAL',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'webgal')},
 {name:'Monogatari',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'monogatari')},
 {name:'RenJS',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'renjs')},
 {name:'Narrat',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'narrat')},
 {name:'ink (inkle)',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'ink')},
 {name:'Bitsy',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'bitsy')},
 {name:'GB Studio',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'gbstudio')},
 {name:'GDevelop',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'gdevelop')},
 {name:'Construct',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'construct')},
 {name:'Decker',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'decker')},
 {name:'Cocos2d',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'cocos')},
 {name:'LÖVE',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'love')},
 {name:'Defold',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'defold')},
 {name:'Corona / Solar2D',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'solar2d')},
 /* E567 TyranoScript: loose (tyrano/ or index.html beside data/scenario), Electron app.asar whose index names the scenario,
    NW.js package.nw (an exe-appended NW.js build is found by the script reader, tyrano.cjs) */
 {name:'TyranoScript',hook:true,test:f=>f.sub('data',/^scenario$/i)&&(f.has(/^tyrano$/i)||f.has(/^index\.html$/i))||f.sub('resources',/^app\.asar$/i)&&f.peek('resources/app.asar',/data\/scenario|"scenario"/,65536)||f.has(/^package\.nw$/i)&&!f.sub('www',/./)},
 /* E569 engines MeguLit reads but did not recognise (the library showed them as unknown): FAVORITE FVP (<name>.hcb),
    Innocent Grey IGA, Musica PAZ (ぱれっと: scr.dat + sys.dat + st/bg.dat), Bruns (scene/*.bso), HuneX (.hfa),
    Majiro archives under any name */
 {name:'FVP (FAVORITE)',hook:true,test:f=>f.has(/\.hcb$/i)||f.has(/^fvpkernel\.dll$/i)},
 {name:'Innocent Grey (IGA)',hook:true,test:f=>f.magicAny(/\.iga$/i,'IGA0')},
 {name:'Musica (PAZ)',hook:true,test:f=>f.has(/\.paz$/i)&&!f.has(/^(scr|sys)\.paz$/i)||f.has(/^scr\.dat$/i)&&f.has(/^sys\.dat$/i)&&f.has(/^(st|bg)\.dat$/i)},
 {name:'Bruns',hook:null,test:f=>f.sub('scene',/\.bso$/i)||f.has(/^belisama\.cfg$/i)},
 {name:'HuneX',hook:null,test:f=>f.has(/\.hfa$/i)||f.sub('data',/\.hfa$/i)},
 {name:'Majiro',hook:true,test:f=>f.magicAny(/\.arc$/i,'MajiroArcV')},
 /* E569 engines MeguLit did not know at all: named so the library is not "unknown"; text goes through the general hook and
    is confirmed on first play (hook:null) */
 {name:'CMVS (Purple Software)',hook:true,test:f=>f.magicAny(/\.cpz$/i,'CPZ')||f.has(/^cmvs(32|64)\.exe$/i)||f.has(/^cmvs\.cfg$/i)&&f.has(/\.exe$/i)},
 {name:'EAGLS',hook:true,test:f=>f.has(/^eagles\.dll$/i)||f.has(/^scpack\.(pak|idx)$/i)||f.sub('script',/^scpack\.(pak|idx)$/i)},
 {name:'Ikura GDL',hook:null,test:f=>f.magicAny(/^[A-Za-z0-9_]{2,12}$/,'SM2MPX10')},
 {name:"Silky's",hook:null,test:f=>f.magicAny(/\.ifl$/i,'IFLS')||f.has(/^ai[56]win\.exe$/i)},
 /* E570 System-NNN keeps its story scripts loose in spt\ (beside nya\, init\ and the dwq / vaw packs) */
 {name:'System-NNN',hook:null,test:f=>f.has(/\.gtb$/i)&&f.has(/\.gpk$/i)||f.has(/\.vtb$/i)&&f.has(/\.vpk$/i)||f.sub('spt',/\.spt$/i)&&(f.has(/^nya$/i)||f.has(/^init2?$/i)||f.has(/^dwq$/i))},
 /* E571 codeX RScript (Liar-soft and its sister brands): scr.xfl / grp.xfl ... "LB\x01\0" archives */
 {name:'codeX RScript (Liar-soft)',hook:null,test:f=>f.magicAny(/\.xfl$/i,'LB\x01\0')},
 /* E572 AST: archives without an extension starting "ARC1" / "ARC2" */
 {name:'AST',hook:null,test:f=>f.magicAny(/^[A-Za-z0-9_]{1,16}$/,'ARC2',8)||f.magicAny(/^[A-Za-z0-9_]{1,16}$/,'ARC1',8)},
 /* E585 no-magic archives are recognised by their index: Tmr-Hiro srp.pac (.pac with a script entry), Interheart .fpk, NekoSDK NEKOPACK4 .pak / 0xCACACA .dat (ADVSCRIPT2) */
 {name:'Tmr-Hiro ADV',hook:null,test:f=>f.probe(/\.pac$/i,p=>require('./tmrhiro.cjs').isPac(p))},
 {name:'Interheart (FPK)',hook:null,test:f=>f.magicAny(/\.fpk$/i,'FPK 2.00')||f.probe(/\.fpk$/i,p=>require('./interheart.cjs').isArchive(p))},
 {name:'NekoSDK',hook:null,test:f=>f.magicAny(/\.pak$/i,'NEKOPACK4')||f.probe(/\.dat$/i,p=>require('./nekosdk.cjs').isArchive(p))},
 {name:'KaGuYa',hook:null,test:f=>f.has(/\.ari$/i)&&f.has(/\.arc$/i)||f.peek('message.dat',/^\[SCR-MESSAGE\]/,16)||f.peek('params.dat',/^\[SCR-PARAMS\]/,16)||f.magicAny(/\.arc$/i,'WFL1')||f.magicAny(/\.arc$/i,'LINK')},
 {name:'Lucifen',hook:null,test:f=>f.magicAny(/\.lpk$/i,'LPK1')},
 {name:'Yuka',hook:null,test:f=>f.magicAny(/\.ykc$/i,'YKC00')},
 {name:'Luca System',hook:null,test:f=>f.sub('files',/^script\.pak$/i)},
 {name:'NEKOPACK',hook:null,test:f=>f.magicAny(/\.(dat|pak)$/i,'NEKOPACK')},
 {name:'Marble',hook:null,test:f=>f.has(/\.mbl$/i)},
 {name:'rUGP (age)',hook:null,test:f=>f.has(/^rugp.*\.exe$/i)||f.has(/\.rio$/i)&&f.has(/\.rio\.ini$/i)},
 /* E620 the F2 plain-text script family (Suika 2, NVList, VNDS, PyMO …): fingerprints are data in plaintext-profiles.json */
 ...require('./plaintext.cjs').RAW.profiles.filter(p=>p.match).map(p=>({name:p.engine,hook:null,test:f=>require('./plaintext.cjs').matches(f,p.id)})),
 /* E660–E669 F4b proprietary engines (research: H:\MeguLit-Work\f4b, notes E660–E669). Readers: Circus (adv32) and Whale
    complete; DDSystem, SystemAoi, KID archive + generic scan. The rest are named from GARbro's archive fingerprints only */
 {name:'Circus (adv32)',hook:null,test:f=>f.sub('advdata',/\.(mes|pck|dat|crx)$|^(mes|grp|dat)$/i)&&require('./circus.cjs').probe(f.dir)||f.has(/\.mes$/i)&&require('./circus.cjs').probe(f.dir)},
 {name:'Whale',hook:null,test:f=>f.probe(/\.dat$/i,p=>(require('./whale.cjs').list(p)||[]).length>=3,6)},
 {name:'DDSystem',hook:null,test:f=>f.magicAny(/\.dat$/i,'DDP2',8)||f.magicAny(/\.dat$/i,'DDP3',8)},
 {name:'SystemAoi',hook:null,test:f=>f.magicAny(/\.box$/i,'AOIB')||f.magicAny(/\.box$/i,'AOIMY01\0')||f.magicAny(/\.box$/i,'A\0O\0I\0M\0')||f.has(/\.vfs$/i)&&f.magicAny(/\.vfs$/i,'VF')},
 {name:'KID Engine',hook:null,test:f=>f.magicAny(/\.dat$/i,'LNK\0',8)},
 {name:'AZ System',hook:null,test:f=>f.magicAny(/\.arc$/i,'ARC\x1a')||f.magicAny(/\.cpb$/i,'CPB\x1a')},
 {name:'A98SYS (Active Soft)',hook:null,test:f=>f.magicAny(/\.pak$/i,'ADPACK32')},
 {name:'ARCGameEngine (Eushully)',hook:null,test:f=>f.has(/^sys[34]ini\.bin$/i)&&(f.has(/\.alf$/i)||f.has(/\.agf$/i))},
 {name:'FW-EDITOR (Frontwing)',hook:null,test:f=>f.probe(/\.(dat|bin|pak|lib|flt|arc)$/i,p=>require('./kit.cjs').head(p,16).toString('latin1')==='LIB_PACKDATA0000',8)},
 {name:'F&C (ADVWin32 / ADVWIN / AGSI)',hook:null,test:f=>f.magicAny(/\.mrg$/i,'MRG\0')||f.magicAny(/\.mrg$/i,'mrg0')||f.names.some(n=>/^dt0.*\.bdt$/i.test(n))},
 {name:'GSD',hook:null,test:f=>f.magicAny(/\.bin$/i,'LSDARC V.100')||f.magicAny(/\.bmz$/i,'ZLC3')},
 {name:'BlueGale',hook:null,test:f=>f.names.some(n=>/\.snn$/i.test(n)&&f.has(new RegExp('^'+n.slice(0,-4).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\.inx$','i')))},
 {name:'CRIware (CPK / AFS)',hook:null,generic:true,test:f=>f.magicAny(/\.cpk$/i,'CPK ')||f.magicAny(/\.afs$/i,'AFS\0')},
 {name:'Godot',hook:null,generic:true,test:f=>f.magicAny(/\.pck$/i,'GDPC')},
 {name:'Unreal Engine',hook:null,generic:true,test:f=>f.has(/^engine$/i)&&f.names.some(n=>/\.exe$/i.test(n))&&f.sub('engine',/^(binaries|content)$/i)},
 /* E601 Capcom RE Engine (逆転裁判456 王泥喜セレクション): read by re-pak.cjs but had no fingerprint, so it showed as unknown */
 {name:'RE Engine (Capcom)',hook:null,generic:true,test:f=>f.has(/^re_chunk_000\.pak$/i)},
 {name:'Adobe AIR / Flash',hook:null,generic:true,test:f=>f.sub('META-INF',/^AIR$/i)||f.has(/\.swf$/i)&&f.names.some(n=>/\.exe$/i.test(n))},
 {name:'Seraph',hook:null,test:f=>f.has(/^(archpac|scnpac)\.dat$/i)},
 {name:'ISM',hook:null,test:f=>f.magicAny(/\.isa$/i,'ISM ARCHIVED')},
 {name:'GLib2',hook:null,test:f=>f.has(/\.g2$/i)&&f.has(/\.stx$/i)},
 {name:'ExHIBIT',hook:null,test:f=>f.has(/\.rld$/i)||f.sub('dat',/\.rld$/i)||f.sub('rld',/\.rld$/i)},
 {name:'SakanaGL',hook:null,test:f=>f.has(/^sakanagl\.dll$/i)},
 {name:'Leaf / AQUAPLUS',hook:true,test:f=>f.has(/^grp\.pak$/i)&&f.has(/^char\.pak$/i)&&f.has(/^(voice|bgm|se)\.pak$/i)},
 // More engines (user, 2026-11-09). Signatures are files only these engines ship; text reading goes through the
 // general hook and is confirmed on first play (hook:null) until a game of that engine is verified.
 {name:'Escude',hook:true,test:f=>f.magic(/^script\.bin$/i,'ESC-ARC')||f.has(/^script\.bin$/i)&&f.has(/^(gpr|evt|st)\.bin$/i)},
 /* E569 PJADV is Pajamas Adventure System: its GAMEDAT PAC / PAC2 archives go by other names too (data1.dat …) */
 {name:'PJADV',hook:null,test:f=>f.magicAny(/\.(dat|pak)$/i,'GAMEDAT PAC')||f.has(/^textdata\.bin$/i)&&f.has(/^scenario\.dat$/i)},
 /* E640–E654 family F4a (round two): engines with public tools or GARbro formats */
 {name:'SLG System',hook:null,test:f=>f.magicAny(/\.szs$/i,'SZS')||f.has(/\.spd$/i)&&f.magicAny(/\.spl$/i,'SFP\0')},
 {name:'STCM2',hook:null,test:f=>f.probe(/\.(dat|bin)$|^[^.]+$/i,p=>require('./stcm2.cjs').isStcm(p),8)},
 {name:'Willadv',hook:null,test:f=>f.has(/\.arc$/i)&&require('./advhd.cjs').engine.sources(f.dir).length>0},
 {name:'Tanuki Engine',hook:null,test:f=>f.magicAny(/\.tac$/i,'TArc')},
 {name:'Yaneurao',hook:null,test:f=>f.magicAny(/\.dat$/i,'yanepk')||f.magicAny(/\.sda$/i,'SQDARC')},
 {name:'Rits',hook:null,test:f=>f.probe(/\.saf$/i,p=>!!require('./archive-scan.cjs').safList(p))},
 {name:'Valkyria',hook:true,test:f=>f.has(/\.odn$/i)},
 {name:'Cyberworks (C,system)',hook:null,test:f=>f.names.filter(n=>/^Arc0\d\.dat$/i.test(n)).length>=3},
 {name:'LC-ScriptEngine',hook:true,test:f=>f.has(/^lcsebody.*\.exe$/i)||f.has(/^lcscr.*\.lst$/i)||f.has(/^lcsebody\d*\.lst$/i)},
 /* E375 WOLF RPG Editor: Game.exe or GamePro.exe (Pro, encrypted data) with Data.wolf, Data/*.wolf or a loose Data/BasicData. */
 {name:'Wolf RPG',hook:true,generic:true,test:f=>f.has(/\.wolf$/i)||f.sub('Data',/\.wolf$/i)||f.sub('Data',/^BasicData$/i)||f.has(/^gamepro\.exe$/i)&&f.has(/^data$/i)},
 /* E375 RPG Maker MV (www/js, www/data) and MZ (js/rmmz_core.js, data/System.json) run in NW.js. hook:null: LunaHook has no
    reliable hook for Chromium's V8 strings; the script (data JSON) is still read for zero-latency translation. */
 {name:'RPG Maker MV/MZ',hook:null,generic:true,test:f=>f.sub('js',/^(rpg_core|rmmz_core)\.js$/i)||f.sub('www',/^js$/i)&&f.has(/^package\.json$/i)||f.sub('data',/^MapInfos\.json$/i)&&f.sub('data',/^System\.json$/i)&&f.has(/^(game|nw)\.exe$/i)},
 /* E574 also an unpacked XP / VX / VX Ace game: Data\*.rxdata / .rvdata / .rvdata2 beside Game.exe */
 {name:'RPG Maker VX/XP',hook:true,generic:true,test:f=>f.has(/\.rgss(3a|2a|ad)$/i)||f.sub('Data',/^(?:map\d+|system)\.r(?:x|v)data2?$/i)&&f.has(/^game\.exe$/i)},
 /* E630–E639 F3 game-maker binaries (services/original-engines/makers.cjs). Exe-appended data is told by the PE overlay
    (makers.probes.overlayKind, one cached 1 MB look per exe): HSP DPMX, Clickteam PAME / PAMU, AGS CLIB, Director XFIR / RIFX */
 {name:'GameMaker',hook:null,generic:true,test:f=>f.magic(/^data.win$/i,'FORM')||f.magic(/^game.unx$/i,'FORM')},
 {name:'SRPG Studio',hook:null,generic:true,test:f=>f.magic(/^data.dts$/i,'SDTS')||f.has(/^runtime.rts$/i)&&f.has(/^data.dts$/i)},
 {name:'Adventure Game Studio',hook:null,generic:true,test:f=>f.has(/^(ac2game.dat|game28.dta)$/i)||f.has(/^acsetup.cfg$/i)&&f.has(/.(vox|exe)$/i)||f.probe(/.exe$/i,p=>require('./makers.cjs').probes.overlayKind(p)==='ags')},
 {name:'Macromedia Director',hook:null,generic:true,test:f=>f.has(/.(dxr|dcr|cxt|cct)$/i)||f.sub('Xtras',/.x32$/i)||f.probe(/.exe$/i,p=>require('./makers.cjs').probes.overlayKind(p)==='director')},
 {name:'Hot Soup Processor',hook:null,generic:true,test:f=>f.has(/^data.dpm$/i)||f.has(/^start.ax$/i)||f.has(/^hsp3.*.(dll|hpi)$/i)&&f.has(/.exe$/i)||f.probe(/.exe$/i,p=>require('./makers.cjs').probes.overlayKind(p)==='hsp')},
 {name:'Clickteam Fusion',hook:null,generic:true,test:f=>f.has(/.(ccn|ccj)$/i)||f.sub('Modules',/.mfx$/i)||f.probe(/.exe$/i,p=>require('./makers.cjs').probes.overlayKind(p)==='clickteam')},
 {name:'MonoGame / XNA',hook:null,generic:true,test:f=>f.has(/^(MonoGame.Framework|Microsoft.Xna.Framework.*|FNA).dll$/i)||f.sub('Content',/.xnb$/i)},
 {name:'RPG Paper Maker',hook:null,generic:true,test:f=>f.sub('Content',/^Datas$/i)},
 {name:'libGDX',hook:null,generic:true,test:f=>f.probe(/.jar$/i,p=>require('./makers.cjs').probes.gdx(p))||f.sub('lib',/^gdx.*.jar$/i)},
 {name:'Java',hook:null,generic:true,test:f=>f.has(/.jar$/i)&&(f.has(/^jre$/i)||f.names.some(n=>/.(exe|bat|cmd)$/i.test(n)))||f.sub('lib',/.jar$/i)&&f.names.some(n=>/.(exe|bat|cmd)$/i.test(n))},
 {name:'OHRRPGCE',hook:null,generic:true,test:f=>f.probe(/.rpg$/i,p=>require('./makers.cjs').probes.isRpg(p))||f.names.some(n=>/.rpgdir$/i.test(n))},
 /* E639 recognised only: data packed with the maker's own cipher (Bakin BKNPAK, Visionaire .vis) or not yet known (Smile
    Game Builder runtime SharpKmy*.dll); text goes through the hook and GARbro's generic scan until a real game is checked */
 {name:'RPG Developer Bakin',hook:null,generic:true,test:f=>f.magicAny(/.rbpack$/i,'BKNPAK')},
 {name:'Visionaire Studio',hook:null,generic:true,test:f=>f.has(/.vis$/i)&&f.names.some(n=>/.exe$/i.test(n))},
 {name:'Smile Game Builder',hook:null,generic:true,test:f=>f.has(/^sharpkmy.*.dll$/i)},
 // Visual-novel frameworks inside Unity, named so the library and the hook choice can tell them apart.
 {name:'Unity (Utage)',hook:null,test:f=>f.managed(/^Utage/i)},
 {name:'Unity (Naninovel)',hook:null,test:f=>f.managed(/^Naninovel/i)},
 {name:'Unity (Yarn Spinner)',hook:null,test:f=>f.managed(/^YarnSpinner/i)},
 {name:'Unity (Game Creator)',hook:null,test:f=>f.managed(/^GameCreator/i)},
 {name:'Unity (Adventure Creator)',hook:null,test:f=>f.managed(/^AC(\.|Runtime)|AdventureCreator/i)},
 {name:'DxLib',hook:true,generic:true,test:f=>f.has(/\.dxa$/i)},
 // Unity games read through LunaHook's Mono/IL2CPP hooks for many, not all, titles: verified on first play.
 // A Unity build keeps <Name>_Data beside <Name>.exe. A folder that only holds something named *_Data (a library
 // folder, or the folder a game was unpacked into) is not a Unity game by itself.
 {name:'Unity',hook:null,generic:true,test:f=>f.has(/^unityplayer\.dll$/i)||f.names.some(n=>/_Data$/i.test(n)&&f.names.some(e=>e.toLowerCase()===n.slice(0,-5).toLowerCase()+'.exe'))},
 /* E610 generic web bundles last: named engines of the family with no signature of their own read through the generic HTML5 reader */
 {name:'O2 Engine / Novelsphere',hook:null,generic:true,test:f=>f.names.some(n=>/novelsphere/i.test(n))},
 {name:'NVLMaker',hook:null,generic:true,test:f=>f.names.some(n=>/nvlmaker/i.test(n))},
 {name:'CloudNovel',hook:null,generic:true,test:f=>f.names.some(n=>/cloudnovel/i.test(n))},
 {name:'HTMLVN',hook:null,generic:true,test:f=>f.names.some(n=>/htmlvn/i.test(n))},
 {name:'HTML5 / Electron / NW.js',hook:null,generic:true,test:f=>require('./webbundle.cjs').probe(f.dir,'html5')},
];
/* the readers of each engine */
const READERS={"BGI / Ethornell":["bgi"],
 "YU-RIS":["yuris"],
 "KiriKiri":["kirikiri-lang","kirikiri","kirikiri-cx","kirikiri-dump","kirikiri-ks"],
 "SiglusEngine":["siglus"],
 "RealLive":["reallive","avg32"],
 "CatSystem2":["catsystem2"],
 "Artemis":["artemis"],
 "Malie":["malie"],
 "AdvHD / WillPlus":["advhd"],
 "Majiro":["majiro"],
 "QLIE":["qlie"],
 "SoftPal":["softpal"],
 "NeXAS":["nexas"],
 "System 3.x (AliceSoft)":["alicesoft"],
 "System4 (AliceSoft)":["system4","alicesoft"],
 "ShiinaRio":["shiinario"],
 "Entis / Cotopha":["entis"],
 "NScripter":["nscripter"],
 "MAGES":["mages"],
 "Spike Chunsoft (WAD)":["spike-wad"],
 "minori (PAZ)":["paz"],
 "Nitroplus (NPK)":["nitroplus-n4","nitro-npk"],
 "Nitroplus (NPA)":["nitro-pak"],
 "Ren'Py":["renpy"],
 "TyranoScript":["tyrano"],
 "FVP (FAVORITE)":["fvp"],
 "Innocent Grey (IGA)":["iga"],
 "Musica (PAZ)":["paz"],
 "Bruns":["bruns"],
 "HuneX":["hunex"],
 "CMVS (Purple Software)":["cmvs"],
 "EAGLS":["eagls"],
 "Ikura GDL":["ikura"],
 "Silky's":["silky"],
 "System-NNN":["systemnnn"],
 "codeX RScript (Liar-soft)":["liar"],
 "AST":["ast"],
 "Tmr-Hiro ADV":["tmrhiro"],
 "Interheart (FPK)":["interheart"],
 "NekoSDK":["nekosdk"],
 "KaGuYa":["kaguya"],
 "Lucifen":["lucifen"],
 "Yuka":["yuka"],
 "NEKOPACK":["nekosdk"],
 "Marble":["marble"],
 "Seraph":["seraph"],
 "ExHIBIT":["exhibit"],
 "Escude":["escude"],"PJADV":["pjadv"],"Luca System":["luca"],"ISM":["ism"],"GLib2":["glib2"],"Cyberworks (C,system)":["cyberworks"],"DxLib":["dxlib"],
 "SLG System":["slg"],"Stuff Script (Propeller)":["stuff"],"STCM2":["stcm2"],"Willadv":["advhd"],"Tanuki Engine":["tanuki"],"Yaneurao":["yaneurao"],"Rits":["rits"],"BlueGale":["bluegale"],
 "Leaf / AQUAPLUS":["aquaplus"],
 "LC-ScriptEngine":["lcse"],
 "Wolf RPG":["wolf"],
 "RPG Maker MV/MZ":["rpgmaker"],
 "RPG Maker VX/XP":["rgss"],
 "Unity (Utage)":["unity-text"],
 "Unity (Naninovel)":["naninovel"],
 "Unity (Yarn Spinner)":["unity-text"],
 "Unity (Adventure Creator)":["unity-text"],
 "Visual Novel Maker":["vnmaker"],
 "Twine / SugarCube":["twine"],
 "WebGAL":["webgal"],
 "Monogatari":["monogatari"],
 "RenJS":["renjs"],
 "Narrat":["narrat"],
 "ink (inkle)":["ink"],
 "Bitsy":["bitsy"],
 "GB Studio":["gbstudio"],
 "GDevelop":["gdevelop"],
 "Construct":["construct"],
 "Decker":["decker"],
 "Cocos2d":["cocos"],
 "LÖVE":["love"],
 "Defold":["defold"],
 "Corona / Solar2D":["solar2d"],
 "O2 Engine / Novelsphere":["html5"],"NVLMaker":["html5"],"CloudNovel":["html5"],"HTMLVN":["html5"],"HTML5 / Electron / NW.js":["html5"],
 "Circus (adv32)":["circus"],
 "Whale":["whale"],
 "DDSystem":["ddsystem"],
 "SystemAoi":["aoi"],
 "KID Engine":["kid"],
 "Unity (Game Creator)":["unity-text"],
 "GameMaker":["gamemaker"],"SRPG Studio":["srpg"],"Adventure Game Studio":["ags"],"Macromedia Director":["director"],"Hot Soup Processor":["hsp"],
 "Clickteam Fusion":["clickteam"],"MonoGame / XNA":["xna"],"RPG Paper Maker":["rpgpaper"],"libGDX":["java"],"Java":["java"],"OHRRPGCE":["ohrrpgce"],
 "RE Engine (Capcom)":["re-pak"],"Unity":["unity-text","naninovel","higurashi","capcom-msg","vgprompter","pwaat"]};
for(const p of require('./plaintext.cjs').RAW.profiles)READERS[p.engine]=p.detectOnly?[]:['plaintext'];
for(const e of ENGINES)e.readers=READERS[e.name]||[];

function listing(dir){let names=[];try{names=fs.readdirSync(dir);}catch{}const cache={};
 // magic: the first file matching re starts with these bytes (archives that share a common extension).
 const magic=(re,head)=>{const n=names.find(x=>re.test(x));if(!n)return false;try{const fd=fs.openSync(path.join(dir,n),'r'),b=Buffer.alloc(head.length);try{fs.readSync(fd,b,0,b.length,0);}finally{fs.closeSync(fd);}return b.toString('latin1')===head;}catch{return false;}};
 // managed: a Unity build's <Name>_Data/Managed holds an assembly matching re (the VN framework inside Unity).
 const managed=re=>{const data=names.find(n=>/_Data$/i.test(n));if(!data)return false;if(!('\0managed' in cache))try{cache['\0managed']=fs.readdirSync(path.join(dir,data,'Managed'));}catch{cache['\0managed']=[];}return cache['\0managed'].some(n=>re.test(n));};
 /* E569 magicAny: one of the first few files matching re starts with head; peek: a file's first n bytes match re */
 const magicAny=(re,head,max=4)=>names.filter(x=>re.test(x)).slice(0,max).some(n=>{try{const fd=fs.openSync(path.join(dir,n),'r'),b=Buffer.alloc(head.length);try{fs.readSync(fd,b,0,b.length,0);}finally{fs.closeSync(fd);}return b.toString('latin1')===head;}catch{return false;}});
 const peek=(rel,re,n=4096)=>{try{const fd=fs.openSync(path.join(dir,rel),'r'),b=Buffer.alloc(n);let got;try{got=fs.readSync(fd,b,0,n,0);}finally{fs.closeSync(fd);}return re.test(b.toString('latin1',0,got));}catch{return false;}};
 /* E585 probe: one of the first few files matching re passes a structure check (archives with no magic: Tmr-Hiro .pac, Interheart .fpk, NekoSDK .dat) */
 const probe=(re,check,max=4)=>names.filter(x=>re.test(x)).slice(0,max).some(n=>{try{return !!check(path.join(dir,n));}catch{return false;}});
 return {dir,names,magic,magicAny,peek,probe,managed,has:re=>names.some(n=>re.test(n)),sub:(name,re)=>{const real=names.find(n=>n.toLowerCase()===name.toLowerCase());if(!real)return false;if(!(real in cache))try{cache[real]=fs.readdirSync(path.join(dir,real));}catch{cache[real]=[];}return cache[real].some(n=>re.test(n));}};}
function engineOf(dir){const f=listing(dir);for(const e of ENGINES)if(e.test(f))return e;return null;}
/* the readers to try first for a folder: those of the engine the fingerprints name */
function readersFor(dir){const e=engineOf(dir);return e?e.readers:[];}
module.exports={ENGINES,READERS,listing,engineOf,readersFor};
