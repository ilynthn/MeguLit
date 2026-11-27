// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 MeguLit-Adapter, the static engine study: craft-anything (storytold/craft-anything, MIT OR Apache-2.0, a pure-Rust
   reverse-engineering engine; an external program on our machine, never in git; MEGULIT_CRAFT_CLI = its craft-anything-cli.exe).
   Owner (11-28): 以后照 RRFZ 那套「一次全适配」做；RRFZ contributes to craft-anything, and his engine-layer PRs say the readers were
   written by reverse engineering the shipped binaries. This stage runs before the game is ever started and asks craft-anything only
   read-only questions (Deep mode reads the files; it runs nothing and writes nothing into the game folder):
     app_folder_explain   what the folder is built on (Unity / Unreal / Godot with its version, .NET, native)
     core_target_triage   the main program: format, bits, toolchain
     native_library_calls_list   what the program imports: which text API draws the line (GetGlyphOutline / TextOut / DirectWrite / D3D)
     native_strings_find  the engine's own words in the program (YU-RIS Script Engine, CatScene, NeXAS, Artemis Engine …), the script
                          file names it opens, where it saves; each string with the function that uses it
   study({gameDir, exe, cli, out}, {run}) -> report {ok, error, cli, version, folder, program, textApis, engines, scripts, saves, ms}
   suggest(report, caps) -> {engine, engineWhy, agrees, hide, notes}: the evidence for the adapter's own steps, never a decision of its
   own: the engine it names goes through the rule table, the probe, the live check and the person like any other (an engine the
   registry and LunaHook did not know is taken from here, said so in the plan, and asked when the rule table lacks it too).
   markdown(report, suggestion) -> <out>/craft/report.md. Nothing here is fatal: no program, an error or a timeout come back as error. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const DEFAULT_CLI=()=>process.env.MEGULIT_CRAFT_CLI||'';
/* the engine's own words in its program -> the rule id (tools/megulit-adapter/engines.cjs RULES); checked against the real programs of
   ISLAND (CatScene, cs2debug), OZMAFIA!! (YU-RIS Script Engine, ysbin\yst%05d.ybn), アイキス3 sexy (NeXAS), ハミダシクリエイティブ
   (**** Artemis Engine Rev.2762 ****). A word that also names a file format (.pac, .arc) is no marker: too many engines share it */
const MARKERS=[
 ['yuris',/YU-RIS|ysbin[\\/]|\.ypf\b/i],
 ['catsystem2',/CatScene|cs2debug|open_cs2|\bCS2_/],
 ['artemis',/Artemis Engine|Artemis_Debug/],
 ['nexas',/\bNeXAS\b/],
 ['kirikiri',/TVP\(KIRIKIRI\)|KIRIKIRI|TVPGetFunctionExporter|\.xp3\b/i],
 ['siglus',/SiglusEngine|Scene\.pck|Gameexe\.dat/i],
 ['bgi',/BURIKO|Ethornell/i],
 ['qlie',/\bQLIE\b/],
 ['majiro',/Majiro|\.mjo\b/i],
 ['cmvs',/\bCMVS\b|\.cpz\b/i],
 ['advhd',/AdvHD|WillPlus/i],
 ['fvp',/\bFAVORITE\b|\.hcb\b/],
 /* not a bare System4: たいせつなきみのためにぼくにできるいちばんのこと (Dandelion) ships its own system1.lib … system8.lib */
 ['system4',/System ?4\.0|AliceSoft|\.ain\b/i],
 ['softpal',/SoftPal|\bPAL\.dll\b/i],
 ['reallive',/RealLive|SEEN\.TXT/i],
 ['nscripter',/NScripter|ONScripter|nscript\.dat/i],
 ['malie',/\bmalie\b/i],
 ['mages',/\bMAGES\b|\.mpk\b/],
 ['entis',/EntisGLS|Cotopha|\.noa\b/i],
 ['willarcg',/littlecheese/i],
 ['shiinario',/ShiinaRio|Shiina Rio/i],
 ['nitroplus',/\.npa\b|\bnitroplus\b/i],
 ['rugp',/\brUGP\b|Ages3ResT|\.rio\b/],
];
const SEARCH=MARKERS.map(([,re])=>re.source).join('|')+'|Copyright|\\(C\\) ?\\d{4}|FreeType|postscript-font-name|FT_Init_FreeType|DWriteCreateFactory|sav(e|edata)[\\\\/%]|SavePath|SaveDataPath|%APPDATA%|\\.ybn\\b|\\.int\\b|\\.pfs\\b|\\.pac\\b|\\.ks\\b|\\.ast\\b|\\.scr\\b';
/* text APIs in the import table -> what draws the line, and which hide layer of docs/hide-layers.md that points at */
const TEXT_APIS=[
 ['gdi-glyph',/^GetGlyphOutline[AW]?$/,'GDI 字形（GetGlyphOutline）：通用 GDI 字形隐藏（layer 3）对得上'],
 ['gdi-text',/^(Ext)?TextOut[AW]?$|^PolyTextOut[AW]?$|^DrawText(Ex)?[AW]?$/,'GDI 整串画字（TextOut / DrawText）：通用 GDI 层只在 GDI 画到窗口时有用，进贴图的要引擎级'],
 ['directwrite',/^DWriteCreateFactory$/,'DirectWrite：GPU 字形层（layer 4）'],
 ['d3d9',/^Direct3DCreate9(Ex)?$/,'Direct3D 9'],
 ['d3d11',/^D3D11CreateDevice(AndSwapChain)?$/,'Direct3D 11'],
 ['opengl',/^wgl(CreateContext|MakeCurrent)$/,'OpenGL'],
];
function runCli(cli,args,{timeoutMs=120000}={}){const r=spawnSync(cli,['--deep',...args,'--output-format','json'],{encoding:'utf8',windowsHide:true,timeout:timeoutMs,maxBuffer:64<<20});
 let json=null;try{json=JSON.parse(String(r.stdout||''));}catch{}
 return {status:r.status,json,error:r.error?String(r.error.code||r.error.message):json?.error?String(json.error.code||json.error.message):r.status!==0?String(r.stderr||'exit '+r.status).trim().split(/\r?\n/).pop().slice(0,160):''};}
const short=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,120);
/* the folder's runtime: craft-anything names Unity / Unreal / Godot (with the version) itself; native and .NET candidates are inferences
   from files being there (アイキス3 sexy has TwitterUploader.exe beside it and was called .NET), so only the game engine is kept as fact */
function folderView(j){const r=j?.result||{};return {summary:short(j?.summary),game:r.game?{engine:String(r.game.engine||''),version:String(r.game.version||''),clue:String(r.game.clue||''),note:short(r.game.note)}:null,
 runtimes:(r.candidates||[]).filter(c=>!c.secondary).map(c=>({runtime:String(c.runtime||''),strength:String(c.strength||'')}))};}
function programView(j){const r=j?.result||{};return {summary:short(j?.plain_english||j?.summary||r.plain_english),bits:r.bits|0,arch:String(r.architecture||''),stripped:!!r.stripped,
 toolchain:(r.toolchain_hints||[]).map(h=>String(h.label||h.id||'')).filter(Boolean),libraries:(r.libraries||[]).map(String)};}
function textApis(imports){const out=[];for(const [id,re,how] of TEXT_APIS){const names=[...new Set(imports.filter(i=>re.test(String(i.name||''))).map(i=>String(i.name)))];if(names.length)out.push({id,names,how});}return out;}
/* the engine markers: every string that names one, counted per engine; the strongest first */
function engineHits(strings){const by=new Map();for(const s of strings){const t=String(s.text||'');for(const [id,re] of MARKERS)if(re.test(t)){const e=by.get(id)||{id,count:0,examples:[]};e.count++;if(e.examples.length<3&&!e.examples.includes(short(t)))e.examples.push(short(t));by.set(id,e);}}
 return [...by.values()].sort((a,b)=>b.count-a.count);}
const scriptNames=strings=>[...new Set(strings.map(s=>String(s.text||'')).filter(t=>/\.(ybn|int|pfs|pac|ks|ast|scr|xp3|ypf|mjo|cpz|hcb|ain|npa|mpk|rio)\b/i.test(t)&&t.length<80))].slice(0,12);
const saveHints=strings=>[...new Set(strings.map(s=>String(s.text||'')).filter(t=>/sav(e|edata)[\\/%]|SavePath|SaveDataPath|%APPDATA%/i.test(t)&&t.length<80))].slice(0,8);
/* the maker's own line (「Copyright (C) 2011 Dandelion Ver1.0」): the first clue for an engine no rule knows; the licences of bundled
   libraries (zlib, libpng, FreeType, Ogg …) are not the maker */
const LIB_CREDIT=/inflate|deflate|Mark Adler|Jean-loup|libpng|jpeg|Independent JPEG|FreeType|Xiph|Ogg|Vorbis|Theora|Lua\b|Microsoft|Zynga|Apache|Unicode|Sam Leffler|Silicon Graphics|Info-ZIP|Free Software|Bink|RAD Game|CRI Middleware|Nullsoft|Thomas G\. Lane|IJG|Plauger|Dinkumware|Unity Technologies/i;
const credits=strings=>[...new Set(strings.map(s=>short(s.text)).filter(t=>/(Copyright|\(C\)) ?(\(C\))? ?\d{4}/i.test(t)&&t.length<100&&!LIB_CREDIT.test(t)))].slice(0,4);
const freetype=strings=>strings.some(s=>/FreeType|FT_Init_FreeType|postscript-font-name/.test(String(s.text||'')));
/* Unity: the folder tells Mono (Managed/*.dll) from IL2CPP (GameAssembly.dll), and which VN toolkit ships (Utage, Naninovel, TextMeshPro) */
function unityView(gameDir){let names=[];try{names=fs.readdirSync(gameDir);}catch{}const data=names.find(n=>/_Data$/i.test(n));let managed=[];
 if(data)try{managed=fs.readdirSync(path.join(gameDir,data,'Managed'));}catch{}
 const backend=names.some(n=>/^GameAssembly\.dll$/i.test(n))?'il2cpp':managed.length?'mono':'';
 const kits=['Utage','Naninovel','Fungus','Unity.TextMeshPro','YarnSpinner'].filter(k=>managed.some(m=>m.toLowerCase().startsWith(k.toLowerCase())));
 return backend?{backend,kits}:null;}

function study({gameDir,exe,cli=DEFAULT_CLI(),out=''},{run=runCli}={}){const t0=Date.now();
 const rep={ok:false,error:'',cli:cli?path.basename(cli):'',version:'',folder:null,program:null,textApis:[],engines:[],credits:[],scripts:[],saves:[],freetype:false,unity:null,ms:0};
 if(!cli||!fs.existsSync(cli)){rep.error=cli?'craft-anything-cli not found ('+path.basename(cli)+')':'MEGULIT_CRAFT_CLI not set';return rep;}
 const a=run(cli,['app-folder-explain','--path',gameDir]);
 if(!a.json?.result){rep.error='app-folder-explain: '+(a.error||'no output');rep.ms=Date.now()-t0;return rep;}
 rep.version=String(a.json.environment?.engine_version||'');rep.folder=folderView(a.json);
 if(exe){const tr=run(cli,['core-target-triage','--path',exe]);if(tr.json)rep.program=programView(tr.json);
  const im=run(cli,['native-library-calls-list','--path',exe,'--limit','5000']);rep.textApis=textApis(im.json?.result?.imports||[]);
  const st=run(cli,['native-strings-find',exe,'--pattern',SEARCH,'--mode','regex','--limit','2000']);const strings=st.json?.result?.matches||[];
  rep.engines=engineHits(strings);rep.scripts=scriptNames(strings);rep.saves=saveHints(strings);rep.freetype=freetype(strings);rep.credits=credits(strings);rep.stringsTotal=st.json?.result?.total|0;}
 if(rep.folder.game?.engine==='unity')rep.unity=unityView(gameDir);
 rep.ok=true;rep.ms=Date.now()-t0;
 if(out){const d=path.join(out,'craft');fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'report.json'),JSON.stringify(rep,null,1));}
 return rep;}

/* the folder's game engine (craft-anything's own names) -> the rule id */
const GAME_ENGINE={unity:'unity'};
/* what the study says for the adapter. caps: the rule-table row the registry / LunaHook gave (caps.known false when none did) */
function suggest(rep,caps={}){const s={engine:'',engineWhy:'',strong:false,agrees:null,hide:'',notes:[]};if(!rep?.ok)return s;
 const top=rep.engines[0],game=GAME_ENGINE[rep.folder?.game?.engine||''];
 /* one string is too thin to adopt an engine the rule table did not name (system4.lib was Dandelion's own file): strong = two or more */
 if(top){s.engine=top.id;s.strong=top.count>=2;s.engineWhy='程序里的字符串：'+top.examples.join(' / ')+'（'+top.count+' 处）';}
 else if(game){s.engine=game;s.strong=true;s.engineWhy='目录：'+rep.folder.game.clue+(rep.folder.game.version?' '+rep.folder.game.version:'');}
 const known=caps.known!==false&&caps.id;
 if(s.engine&&known)s.agrees=s.engine===caps.id;
 if(s.agrees===false)s.notes.push('craft-anything 认为是 '+s.engine+'（'+s.engineWhy+'），规则表认的是 '+caps.id+'：先核对');
 if(rep.engines.length>1&&rep.engines[1].count*2>=top.count)s.notes.push('craft-anything 在程序里还看到 '+rep.engines.slice(1,3).map(e=>e.id).join(' / ')+' 的字样：同一个程序里有两套引擎的话，先确认是哪一套在画台词');
 /* the hide: an engine-level hide of the rule table first; otherwise what the import table says the generic layers can catch */
 const ids=new Set(rep.textApis.map(t=>t.id)),engineHide=(caps.hide||[]).length>0;
 s.blindHide=rep.freetype?'engine-needed':ids.has('gdi-glyph')?'gdi-glyph':ids.has('gdi-text')?'gdi-text':(ids.has('directwrite')||ids.has('d3d11')||ids.has('d3d9'))?'gpu':'';
 /* FreeType wins over GetGlyphOutline: ハミダシクリエイティブ imports GetGlyphOutlineA/W and still drew every line with FreeType (0 hits);
    TextOut before D3D: OZMAFIA!! presents with D3D9 but draws the line with TextOutA */
 s.hide=engineHide?'engine':s.blindHide;
 if(!engineHide&&rep.freetype)s.notes.push('程序里带 FreeType：字可能在 CPU 上画进贴图，通用 GDI / GPU 字形层可能一处都抓不到（ハミダシクリエイティブ 先例），要引擎级隐藏或读模式');
 if(!engineHide&&s.hide==='gdi-text')s.notes.push('只导入了 TextOut / DrawText，没有 GetGlyphOutline：通用字形层抓不到，看实机截图有没有藏住');
 if((!s.engine||!s.strong)&&rep.credits.length)s.notes.push('程序里的署名：'+rep.credits.join(' / ')+'（规则表没有的厂商自制引擎从这里查）');
 if(rep.unity)s.notes.push('Unity '+(rep.folder.game?.version||'')+' '+(rep.unity.backend==='il2cpp'?'IL2CPP（画字钩子 Il2cppDraw）':'Mono（Mono 文本插件）')+(rep.unity.kits.length?'，带 '+rep.unity.kits.join(' / '):''));
 return s;}
/* the plan's one line */
function note(rep,s){if(!rep?.ok)return '';const apis=rep.textApis.map(t=>t.names.join('/')).join('，');
 return 'craft-anything：'+(s.engine?'引擎 '+s.engine+(s.agrees===true?'（和规则表一致）':s.agrees===false?'（和规则表不一致）':'')+'；':'没认出引擎；')+(apis?'画字 API '+apis+'；':'')+'隐藏 '+(HIDE_WORDS[s.hide]||'未知');}
const HIDE_WORDS={engine:'规则表有引擎级隐藏','engine-needed':'通用层多半抓不到（FreeType），要引擎级','gdi-glyph':'通用 GDI 字形层',gpu:'通用 GPU 字形层','gdi-text':'只有 TextOut/DrawText，通用层存疑'};
function markdown(rep,s,{title='',adapterEngine=''}={}){if(!rep?.ok)return '# craft-anything 分析：'+title+'\n\n没跑成：'+rep?.error+'\n';
 const L=['# craft-anything 分析：'+title,'','craft-anything '+rep.version+'（Deep，只读；'+rep.ms+' ms）','',
  '| 项 | 结果 |','|---|---|',
  '| 目录 | '+rep.folder.summary+' |',
  '| 主程序 | '+(rep.program?.summary||'—')+(rep.program?.toolchain?.length?'；'+rep.program.toolchain.join('，'):'')+' |',
  '| 引擎（字符串） | '+(rep.engines.map(e=>e.id+' ×'+e.count+'：'+e.examples.join(' / ')).join('<br>')||'—')+' |',
  '| 规则表 / registry | '+(adapterEngine||'—')+(s.agrees===true?'，一致':s.agrees===false?'，**不一致**':'')+' |',
  '| 画字 API | '+(rep.textApis.map(t=>t.names.join(', ')+'：'+t.how).join('<br>')||'—')+' |',
  '| FreeType | '+(rep.freetype?'有':'没看到')+' |',
  '| 隐藏建议 | '+(HIDE_WORDS[s.hide]||'未知')+' |',
  '| 剧本文件名 | '+(rep.scripts.join(', ')||'—')+' |',
  '| 署名 | '+(rep.credits.join('<br>')||'—')+' |',
  '| 存档线索 | '+(rep.saves.join(', ')||'—')+' |',
  ...(rep.unity?['| Unity | '+rep.unity.backend+(rep.unity.kits.length?'，'+rep.unity.kits.join(', '):'')+' |']:[]),
  '',...s.notes.map(n=>'- '+n)];
 return L.join('\n')+'\n';}
module.exports={study,suggest,note,markdown,runCli,MARKERS,TEXT_APIS,engineHits,textApis,unityView,SEARCH};
