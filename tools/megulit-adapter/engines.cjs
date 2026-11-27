// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 MeguLit-Adapter, the engine layer's rule table (owner: 以后所有适配都走 MeguLit-Adapter，学到的东西沉淀回引擎层或规则表).
   One row per engine: what the repository already has for it, each cell backed by a file the table checks exists, so the table
   never claims more than the code:
     readers   script readers (services/original-engines, RRFZ): taken from registry.cjs READERS, never listed here by hand
     pairing   how a reader pairs a Chinese build: patchLines (the patch's own lines), foreign (a translation column in the script),
               originalLines (the Japanese under a Chinese layer); read from the reader objects of scenes.cjs
     draw      the engine-draw hook (native/megulithook/<X>Draw.h + tools/engine-sigs/<x>-draw.cjs): 'roles' reads text with its
               role, 'input' is a diagnostic raw-input pin, 'sites' is a DrawSites GDI signature
     hide      engine-level hides (docs/hide-layers.md layers 1 and 2, and engine paths in the GDI / GPU layers): file + what it does;
               caveat: what it is known to break (the plan shows it, the person looks at that picture)
     seeds     The Seed/<engine>/ by status; defaults: core/profiles/engines/<id>.cjs
   Interface: capabilities(engine) -> one row (an unknown engine gets an empty row, never a guess); inventory() -> every row;
   markdown(rows) -> the table for a PR or the skill. A new engine trait learned while adapting a game goes into RULES here (or a
   reader / hook of the engine layer), never into a one-off script. */
const fs=require('node:fs'),path=require('node:path');
const REPO=path.join(__dirname,'..','..');
const GENERIC_HIDE=[
 {how:'GDI glyph hide (layer 3)',file:'native/megulithook/MeguLitGdiHide.h'},
 {how:'GPU glyph quads (layer 4)',file:'native/gpuhide/GlyphQuads.h'},
];
/* registry: names in services/original-engines/registry.cjs ENGINES; seed: folder names under The Seed/ */
const RULES={
 kirikiri:{label:'KiriKiri',registry:['KiriKiri'],seed:['kirikiri'],
  draw:[{kind:'kag',file:'native/krkrtext/KrkrText.cpp',note:'MeguLitKrkr KAG message layer DLL (ToMe_CHARS, roles, embed)'}],
  hide:[{how:'KAG message layer hides its own text (layer 2, ToMe_CHARS hidden=1)',file:'native/krkrtext/script.inc'},
   {how:'no-KAG Layer.drawText source no-draw (DrawSkip, オルフレール)',file:'native/megulithook/MeguLitDrawSkip.h'}]},
 siglus:{label:'SiglusEngine',registry:['SiglusEngine'],seed:['siglus'],
  draw:[{kind:'roles',file:'native/megulithook/SiglusDraw.h',sig:'tools/engine-sigs/siglus-draw.cjs'}],hide:[]},
 /* input: the level the live run's input starts on (core/cold-test/input-fallback.cjs). 2026-11-27 ハミダシクリエイティブ: posted clicks and
    Enter changed nothing, not even the title's hover colour; InputShim's cursor + click opened START and advanced every line */
 artemis:{label:'Artemis',registry:['Artemis'],seed:['artemis'],draw:[],
  hide:[{how:'Artemis2 layout call written back blank (layer 1), one stream per text layer: dialogue hidden, names and choices kept (core/profiles/engines/artemis.cjs source.embedGlyphPieces)',file:'native/megulithook/Artemis.cpp',mark:'hp.split = regoffset(ecx);',caveat:'只有 32 位、Artemis2 特征码命中的版本；64 位（THE SHELL）和 EmbedArtemis 版本没改'}],input:'inputctl'},
 tyrano:{label:'TyranoScript',registry:['TyranoScript'],seed:['tyrano'],draw:[],hide:[]},
 catsystem2:{label:'CatSystem2',registry:['CatSystem2'],seed:['catsystem2'],
  draw:[{kind:'roles',file:'native/megulithook/CS2Draw.h',sig:'tools/engine-sigs/cs2-draw.cjs'}],
  hide:[{how:'ISLAND exact build: the composer skips the dialogue layout while hide is asked (one exe)',file:'native/megulithook/ToMeIslandDraw.h'}]},
 qlie:{label:'QLIE',registry:['QLIE'],seed:['qlie'],draw:[],hide:[]},
 marble:{label:'Marble',registry:['Marble'],seed:[],draw:[],hide:[]},
 entis:{label:'Entis / Cotopha',registry:['Entis / Cotopha'],seed:[],draw:[],hide:[]},
 ikura:{label:'Ikura GDL',registry:['Ikura GDL'],seed:[],draw:[],hide:[]},
 unity:{label:'Unity',registry:['Unity','Unity (Utage)','Unity (Naninovel)','Unity (Yarn Spinner)','Unity (Adventure Creator)','Unity (Game Creator)'],seed:['unity'],
  draw:[{kind:'roles',file:'native/megulithook/Il2cppDraw.h',sig:'tools/engine-sigs/il2cpp-text.cjs'},{kind:'plugin',file:'native/unitytext/MeguLitUnityText.cs',note:'Mono text plugin'}],hide:[]},
 aokana:{label:'Unity (Aokana)',registry:['Unity (Aokana)'],seed:['aokana'],draw:[],
  hide:[{how:'write-back embed waits for the line set twice (layer 1)',file:'native/megulithook/MeguLitEmbedWait.h'}]},
 mages:{label:'MAGES',registry:['MAGES'],seed:['mages'],
  draw:[{kind:'roles',file:'native/megulithook/MagesDraw.h',sig:'tools/engine-sigs/mages-draw.cjs'}],hide:[]},
 yuris:{label:'YU-RIS',registry:['YU-RIS'],seed:['yuris'],
  draw:[{kind:'roles',file:'native/megulithook/YurisDraw.h',sig:'tools/engine-sigs/yuris-draw.cjs'}],
  hide:[{how:'folded YU-RIS2 TextOutA stream: the GDI hide drops the call (source no-draw)',file:'native/HookBridge.cs',mark:'YurisGdiOwn',caveat:'YU-RIS2 的选项和台词走同一个 TextOutA：这个隐藏会把选项字也藏掉（Monochrome Empire），要看选项截图'},
   {how:'euphoria HD 4.74 exact build: dialogue raster compositing suppressed',file:'native/megulithook/EuphoriaHD474Draw.h'}]},
 bgi:{label:'BGI / Ethornell',registry:['BGI / Ethornell'],seed:['bgi'],
  draw:[{kind:'roles',file:'native/megulithook/BgiDraw.h',sig:'tools/engine-sigs/bgi-draw.cjs'}],hide:[]},
 cmvs:{label:'CMVS (Purple Software)',registry:['CMVS (Purple Software)'],seed:['cmvs'],
  draw:[{kind:'input',file:'native/megulithook/CmvsDraw.h',sig:'tools/engine-sigs/cmvs-draw.cjs'}],hide:[]},
 advhd:{label:'AdvHD / WillPlus',registry:['AdvHD / WillPlus'],seed:['advhd'],
  draw:[{kind:'input',file:'native/megulithook/AdvhdDraw.h',sig:'tools/engine-sigs/advhd-draw.cjs'}],hide:[]},
 willarcg:{label:'Will ARCG (littlecheese)',registry:['Will ARCG'],seed:['willarcg'],draw:[],
  hide:[{how:'littlecheese v1.00 exact build: retained-bitmap glyph blits dropped (黒と金)',file:'native/gpuhide/LittlecheeseGdi.h'}]},
 fvp:{label:'FVP (FAVORITE)',registry:['FVP (FAVORITE)'],seed:['fvp'],
  draw:[{kind:'input',file:'native/megulithook/FvpDraw.h',sig:'tools/engine-sigs/fvp-draw.cjs'}],hide:[]},
 majiro:{label:'Majiro',registry:['Majiro'],seed:['majiro'],
  draw:[{kind:'input',file:'native/megulithook/MajiroDraw.h',sig:'tools/engine-sigs/majiro-draw.cjs'}],hide:[]},
 system4:{label:'System4 (AliceSoft)',registry:['System4 (AliceSoft)'],seed:['system4'],draw:[],
  hide:[{how:'SACT2 message sprite: monologue, dialogue after a stream switch and battle bubbles skipped, the hidden line reported (#1239)',file:'native/gpuhide/Sact2Draw.h'}]},
 softpal:{label:'SoftPal',registry:['SoftPal'],seed:['softpal'],draw:[{kind:'sites',file:'native/megulithook/DrawSitesSig.h',mark:'softpal'}],hide:[]},
 reallive:{label:'RealLive',registry:['RealLive'],seed:['reallive'],draw:[{kind:'sites',file:'native/megulithook/DrawSitesSig.h',mark:'avg32'}],hide:[]},
 nscripter:{label:'NScripter',registry:['NScripter'],seed:['nscripter'],draw:[{kind:'sites',file:'native/megulithook/DrawSitesSig.h',mark:'nscripter'}],hide:[]},
 nitroplus:{label:'Nitroplus (NPA / NPK)',registry:['Nitroplus (NPA)','Nitroplus (NPK)'],seed:['nitroplus','nitropak'],draw:[{kind:'sites',file:'native/megulithook/DrawSitesSig.h',mark:'nitroplus'}],hide:[]},
 minori:{label:'minori (PAZ)',registry:['minori (PAZ)'],seed:['minori'],draw:[{kind:'sites',file:'native/megulithook/DrawSitesSig.h',mark:'minori'}],hide:[]},
 musica:{label:'Musica (PAZ)',registry:['Musica (PAZ)'],seed:['musica'],draw:[{kind:'sites',file:'native/megulithook/DrawSitesSig.h',mark:'musica'}],hide:[]},
 bruns:{label:'Bruns',registry:['Bruns'],seed:['bruns'],draw:[{kind:'sites',file:'native/megulithook/DrawSitesSig.h',mark:'bruns'}],hide:[]},
 innocentgrey:{label:'Innocent Grey (IGA)',registry:['Innocent Grey (IGA)'],seed:['innocentgrey'],draw:[],hide:[]},
 renpy:{label:"Ren'Py",registry:["Ren'Py"],seed:['renpy'],
  draw:[{kind:'roles',file:'native/MeguLitRenpy.py',note:'say/menu script hook'}],
  hide:[{how:'Ren\'Py page DLL hides the say text itself (layer 2)',file:'native/renpytext/RenpyText.cpp'}]},
 rgss:{label:'RPG Maker VX/XP',registry:['RPG Maker VX/XP'],seed:[],draw:[],hide:[]},
 rpgmaker:{label:'RPG Maker MV/MZ',registry:['RPG Maker MV/MZ'],seed:[],draw:[],hide:[]},
 spikechunsoft:{label:'Spike Chunsoft',registry:['Spike Chunsoft (WAD)','Spike Chunsoft (DRV3)'],seed:['spikechunsoft'],draw:[],hide:[]},
 leaf:{label:'Leaf / AQUAPLUS',registry:['Leaf / AQUAPLUS','AQUAPLUS PCK','Leaf PAK'],seed:['leaf'],draw:[],hide:[]},
 rugp:{label:'rUGP (age)',registry:['rUGP (age)'],seed:['rugp'],draw:[],hide:[]},
 siasoft:{label:'SIA-Soft',registry:['SIA-Soft'],seed:['siasoft'],draw:[],hide:[]},
 silkys:{label:"Silky's",registry:["Silky's"],seed:['silkys'],draw:[],hide:[]},
 stuffscript:{label:'Stuff Script (Propeller)',registry:['Stuff Script (Propeller)'],seed:['stuffscript'],draw:[],hide:[]},
 nexas:{label:'NeXAS',registry:['NeXAS'],seed:[],draw:[],hide:[]},
 malie:{label:'Malie',registry:['Malie'],seed:[],draw:[],hide:[]},
 shiinario:{label:'ShiinaRio',registry:['ShiinaRio'],seed:[],draw:[],hide:[]},
 garbro:{label:'GARbro fallback',registry:[],readers:['garbro'],seed:['garbro'],draw:[],hide:[]},
};
/* the profile engine id (core/profiles engineId) -> the rule id here, where they differ */
const ALIAS={cs2:'catsystem2',ethornell:'bgi',krkr:'kirikiri',willplus:'advhd',nitropak:'nitroplus',iga:'innocentgrey',paz:'minori',sia:'siasoft',silky:'silkys',stuff:'stuffscript',arcg:'willarcg'};
/* LunaHook engine class (its runtime 「匹配到 X 引擎」 and its static checks, registry.lunaHook) -> the rule id here; a class not listed
   stays unknown and the person is asked, with LunaHook's name in the question */
const LUNA={KiriKiri:'kirikiri',KiriKiriZ:'kirikiri',CatSystem:'catsystem2',BGI:'bgi',littlecheese:'willarcg',Artemis:'artemis',CMVS:'cmvs',Purple:'cmvs',Purple2:'cmvs',Giga:'nexas',QLIE:'qlie',Malie:'malie',Minori:'minori',Nitroplus:'nitroplus',Nitroplus2:'nitroplus',Onscripter:'nscripter',ShinaRio:'shiinario',Silkys:'silkys',SilkysOld:'silkys',Silkyssakura:'silkys',Silkysveryveryold:'silkys',System4x:'system4',WillPlus:'advhd',FVP:'fvp',EntisGLS:'entis',Cotopha:'entis',_5pb:'mages',_5pb_2:'mages',RPGMakerRGSS3:'rgss',RPGMakerRGSS300:'rgss',RpgmXP:'rgss',Siglusold:'siglus',Siglus:'siglus',Leaf:'leaf',Ages3ResT:'rugp',Yuris:'yuris',YU_RIS:'yuris',Majiro:'majiro',SoftPal:'softpal',Reallive:'reallive',RealLive:'reallive',Renpy:'renpy',TyranoScript:'tyrano',Unity:'unity',Mages:'mages'};
const lunaRule=cls=>LUNA[String(cls||'')]||LUNA[String(cls||'').replace(/\d+$/,'')]||'';
const ruleId=engine=>{const e=String(engine||'').toLowerCase();if(RULES[e])return e;if(ALIAS[e])return ALIAS[e];try{const id=require('../../core/profiles/index.cjs').engineId(e);if(RULES[id])return id;if(ALIAS[id])return ALIAS[id];}catch{}return '';};
const exists=(rel,mark)=>{try{const p=path.join(REPO,rel);if(!fs.existsSync(p))return false;return !mark||fs.readFileSync(p,'latin1').includes(mark);}catch{return false;}};
let readerMemo=null;
function readerTable(){if(readerMemo)return readerMemo;let reg={READERS:{}},scenes={ENGINES:{}};
 try{reg=require('../../services/original-engines/registry.cjs');}catch{}try{scenes=require('../../services/original-engines/scenes.cjs');}catch{}
 return readerMemo={READERS:reg.READERS||{},ENGINES:scenes.ENGINES||{}};}
function seedCounts(dirs){const out={};for(const d of dirs){let slugs=[];try{slugs=fs.readdirSync(path.join(REPO,'The Seed',d),{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name);}catch{}
  for(const s of slugs){let st='?';try{st=JSON.parse(fs.readFileSync(path.join(REPO,'The Seed',d,s,'game.json'),'utf8').replace(/^﻿/,'')).status||'?';}catch{}out[st]=(out[st]||0)+1;}}
 return out;}
/* one engine's row; engine: a profile engine id, a registry name or a rule id */
function capabilities(engine){const id=ruleId(engine)||Object.keys(RULES).find(k=>RULES[k].registry.includes(String(engine)))||'';const r=RULES[id];
 if(!r)return {id:String(engine||''),label:String(engine||'unknown'),known:false,readers:[],pairing:[],draw:[],hide:[],genericHide:GENERIC_HIDE.filter(h=>exists(h.file)),seeds:{},defaults:false};
 const T=readerTable(),readers=[...new Set([...(r.readers||[]),...r.registry.flatMap(n=>T.READERS[n]||[])])].filter(x=>x!=='bgi'&&x!=='system4'?!!T.ENGINES[x]:true);
 const pairing=[];for(const x of readers){const e=T.ENGINES[x];if(!e)continue;if(typeof e.patchLines==='function')pairing.push(x+':patch');if(typeof e.foreign==='function')pairing.push(x+':column');if(typeof e.originalLines==='function')pairing.push(x+':underlay');}
 if(readers.includes('bgi')||readers.includes('system4'))pairing.push('original-text:patch');
 const draw=r.draw.filter(d=>exists(d.file,d.mark)&&(!d.sig||exists(d.sig))).map(d=>({...d}));
 const hide=r.hide.filter(h=>exists(h.file,h.mark)).map(h=>({...h}));
 return {id,label:r.label,known:true,readers,pairing:[...new Set(pairing)],draw,hide,genericHide:GENERIC_HIDE.filter(h=>exists(h.file)),seeds:seedCounts(r.seed),defaults:exists('core/profiles/engines/'+id+'.cjs'),input:r.input||''};}
function inventory(){return Object.keys(RULES).map(capabilities);}
const cell=a=>a.length?a.join('<br>'):'—';
function markdown(rows=inventory()){const head='| 引擎 | 剧本读取（RRFZ） | 画字钩子 | 引擎级隐藏 | 汉化配对 | seed / 默认设置 |\n|---|---|---|---|---|---|';
 const seeds=s=>{const t=Object.entries(s).map(([k,v])=>k+' '+v).join('，');return t||'—';};
 return head+'\n'+rows.map(r=>'| '+r.label+' | '+cell(r.readers)+' | '+cell(r.draw.map(d=>d.kind+' '+path.basename(d.file)+(d.mark?'#'+d.mark:'')))+' | '+cell(r.hide.map(h=>path.basename(h.file)+(h.mark?'#'+h.mark:'')))+' | '+cell(r.pairing)+' | '+seeds(r.seeds)+(r.defaults?'；引擎默认 core/profiles/engines/'+r.id+'.cjs':'')+' |').join('\n');}
module.exports={RULES,GENERIC_HIDE,LUNA,lunaRule,ruleId,capabilities,inventory,markdown};
