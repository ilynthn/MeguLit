// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 MeguLit-Adapter craft stage: craft-anything's read-only answers (folder runtime, imports, program strings) become engine
   evidence, a hide expectation and the maker's line. The answers below are the shapes craft-anything 0.6.1 returned for the real
   programs (only the program's own words: no script text): ISLAND (CatSystem2), ハミダシクリエイティブ (Artemis, FreeType),
   OZMAFIA!! (YU-RIS, TextOutA), たいせつなきみのために… (Dandelion's own engine, system1.lib … system8.lib). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Craft=require('../tools/megulit-adapter/craft.cjs'),Engines=require('../tools/megulit-adapter/engines.cjs'),Check=require('../tools/megulit-adapter/checkpoints.cjs');
const Adapter=require('../tools/megulit-adapter.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'megulit-craft-'));
const S=t=>({text:t,section:'.rdata'});
const GAMES={
 island:{folder:{summary:'ISLAND: its programs are native code',result:{game:null,candidates:[{runtime:'native',strength:'weak'}]}},
  imports:['GetGlyphOutlineA','CreateFontIndirectA','SetTextColor','Direct3DCreate9','ReadFile'],
  strings:['cs2debug','CS2_VideoWidnow','open_cs2','CatScene','CatScene','scene','config.int/gamedef.xml','postscript-font-name','Copyright (C) 1998, Thomas G. Lane','LegalCopyright']},
 hamidashi:{folder:{summary:'native',result:{game:null,candidates:[]}},imports:['GetGlyphOutlineA','GetGlyphOutlineW','Direct3DCreate9'],
  strings:['**** Artemis Engine Rev.2762 **** Copyright (C)2009 Daiju Hanaoka (Mikage)','Artemis_Debug','.pfs','\\root.pfs','SaveDataPath','Portions of this software are copyright (C) 2012 The FreeType Project']},
 ozmafia:{folder:{summary:'native',result:{game:null,candidates:[]}},imports:['TextOutA','CreateFontIndirectA','Direct3DCreate9'],
  strings:['YU-RIS Script Engine','ysbin\\yst%05d.ybn','ysbin\\ysc.ybn','update1.ypf','\\yscfg.dat']},
 dandelion:{folder:{summary:'native',result:{game:null,candidates:[]}},imports:['TextOutA'],
  strings:['system1.lib','system2.lib','system3-1.lib','system4.lib','system8.lib','sys.arc','msg.arc','Copyright (C) 2011 Dandelion Ver1.0',' inflate 1.2.3 Copyright 1995-2005 Mark Adler ','save%d.sav']},
 unity:{folder:{summary:'Unity',result:{game:{engine:'unity',version:'6000.0.59f2',clue:'unityplayer.dll',note:'Managed/Assembly-CSharp.dll'},candidates:[{runtime:'unity',strength:'strong'}]}},imports:[],strings:[]},
};
/* the fake craft-anything: answers like the real one for each command, and records what it was asked */
function fake(g,calls=[]){return (cli,args)=>{calls.push(args[0]);const J=result=>({status:0,error:'',json:{environment:{engine_version:'0.6.1'},summary:'x',result}});
 if(args[0]==='app-folder-explain')return {status:0,error:'',json:{environment:{engine_version:'0.6.1'},...g.folder}};
 if(args[0]==='core-target-triage')return J({plain_english:'a program for Windows',bits:32,architecture:'x86',toolchain_hints:[{label:'Microsoft Visual C++ toolchain'}],libraries:['GDI32.dll']});
 if(args[0]==='native-library-calls-list')return J({imports:g.imports.map(name=>({name,library:'GDI32.dll'}))});
 if(args[0]==='native-strings-find'){const re=new RegExp(args[args.indexOf('--pattern')+1],'i');const m=g.strings.filter(t=>re.test(t)).map(S);return J({matches:m,total:m.length});}
 return {status:1,error:'unknown',json:null};};}
const studyOf=(g,o={})=>Craft.study({gameDir:o.dir||tmp(),exe:'game.exe',cli:process.execPath,out:o.out||''},{run:fake(GAMES[g],o.calls)});

test('craft: the program\'s own words name the engine and the text API (ISLAND, OZMAFIA!!), only read-only commands in Deep mode',()=>{
 const calls=[],i=studyOf('island',{calls});
 assert.equal(i.ok,true);assert.equal(i.engines[0].id,'catsystem2');assert.ok(i.engines[0].count>=4);
 assert.deepEqual(i.textApis.map(t=>t.id),['gdi-glyph','d3d9']);
 assert.deepEqual(calls,['app-folder-explain','core-target-triage','native-library-calls-list','native-strings-find']);
 const o=studyOf('ozmafia');assert.equal(o.engines[0].id,'yuris');assert.deepEqual(o.textApis.map(t=>t.id),['gdi-text','d3d9']);
 assert.ok(o.scripts.includes('ysbin\\yst%05d.ybn'),'the script files the program opens');});

test('craft: FreeType in the program means the generic glyph layers can miss, even with GetGlyphOutline imported (ハミダシクリエイティブ)',()=>{
 const h=studyOf('hamidashi');assert.equal(h.freetype,true);assert.equal(h.engines[0].id,'artemis');
 const blind=Craft.suggest(h,{known:false});assert.equal(blind.hide,'engine-needed');assert.ok(blind.notes.some(n=>/FreeType/.test(n)));
 /* with the rule table's Artemis2 write-back the engine hide is the plan, and no FreeType warning */
 const known=Craft.suggest(h,Engines.capabilities('artemis'));assert.equal(known.hide,'engine');assert.equal(known.agrees,true);assert.ok(!known.notes.some(n=>/FreeType/.test(n)));
 /* the cases the import table decides alone: GetGlyphOutline without FreeType, TextOut only */
 const n=Craft.suggest({...studyOf('island'),freetype:false},{known:false});assert.equal(n.hide,'gdi-glyph');
 const t=Craft.suggest(studyOf('ozmafia'),{known:false});assert.equal(t.hide,'gdi-text');assert.ok(t.notes.some(x=>/TextOut/.test(x)));});

test('craft: one weak string adopts nothing (system4.lib of Dandelion\'s own engine); the maker\'s line is shown, library licences are not',()=>{
 const d=studyOf('dandelion');assert.deepEqual(d.engines.map(e=>e.id),[],'system1.lib … system8.lib are no System4');
 assert.deepEqual(d.credits,['Copyright (C) 2011 Dandelion Ver1.0']);
 const s=Craft.suggest(d,{known:false});assert.equal(s.engine,'');assert.ok(s.notes.some(n=>/Dandelion/.test(n)));
 assert.deepEqual(studyOf('island').credits,[],'Thomas G. Lane (libjpeg) and a bare LegalCopyright are no maker');
 /* a single real marker is named, never adopted */
 const one=Craft.suggest({ok:true,engines:[{id:'qlie',count:1,examples:['QLIE']}],textApis:[],credits:[],folder:{game:null}},{known:false});assert.equal(one.engine,'qlie');assert.equal(one.strong,false);});

test('craft stage in the adapter: an engine the registry missed is taken (and said), a disagreement is a note, the engine question names it',()=>{
 const out=tmp(),loc={gameDir:tmp(),exe:'ozmafia.exe',engine:''};
 const unknown=Engines.capabilities('');assert.equal(unknown.known,false);
 const cr=Adapter.craftStage(loc,unknown,out,o=>Craft.study({...o,cli:process.execPath},{run:fake(GAMES.ozmafia)}));
 assert.equal(cr.caps.id,'yuris');assert.equal(cr.caps.craftStatic,true);assert.ok(cr.caps.hide.length,'the rule table row comes with it: the YU-RIS2 TextOutA hide');
 assert.ok(cr.notes.some(n=>/静态认出/.test(n)));assert.match(fs.readFileSync(path.join(out,'craft','report.md'),'utf8'),/yuris ×\d/);
 /* the registry said KiriKiri, the program says YU-RIS: a note to check, the engine stays the registry's */
 const k=Adapter.craftStage(loc,Engines.capabilities('kirikiri'),out,o=>Craft.study({...o,cli:process.execPath},{run:fake(GAMES.ozmafia)}));
 assert.equal(k.caps,null);assert.equal(k.view.agrees,false);assert.ok(k.notes.some(n=>/不一致|先核对/.test(n)));
 /* a weak name stays a name in the engine question */
 const w=Adapter.craftStage(loc,unknown,out,()=>({ok:true,error:'',version:'0.6.1',engines:[{id:'qlie',count:1,examples:['QLIE']}],textApis:[],credits:[],folder:{game:null,summary:''},scripts:[],saves:[],freetype:false,unity:null,ms:1}));
 assert.equal(w.caps.known,false);assert.equal(w.caps.craft,'qlie');
 const q=Check.questions({identity:{vndb:'v1',release:'DL',adapted:[]},caps:w.caps}).find(x=>x.id==='engine');assert.match(q.ask,/craft-anything 认为是 qlie/);});

test('craft stage: not set up on this PC is skipped quietly; a broken run is an error, never fatal',()=>{
 assert.equal(Craft.study({gameDir:tmp(),exe:'',cli:''}).error,'MEGULIT_CRAFT_CLI not set');
 assert.equal(Adapter.craftStage({gameDir:tmp(),exe:'x.exe',engine:''},Engines.capabilities('yuris'),tmp(),o=>Craft.study({...o,cli:''})),null);
 const bad=Craft.study({gameDir:tmp(),exe:'x.exe',cli:process.execPath},{run:()=>({status:1,error:'feature_missing',json:null})});
 assert.equal(bad.ok,false);assert.match(bad.error,/feature_missing/);
 const cr=Adapter.craftStage({gameDir:tmp(),exe:'x.exe',engine:''},Engines.capabilities('yuris'),tmp(),()=>bad);assert.equal(cr.view.ok,false);assert.equal(cr.caps,null);});

test('craft: Unity folders say Mono or IL2CPP and which VN kit ships (制服カノジョ3: Utage + TextMeshPro)',()=>{
 const d=tmp();fs.mkdirSync(path.join(d,'SEIFUKU3_Data','Managed'),{recursive:true});for(const f of ['Utage.dll','Unity.TextMeshPro.dll','Assembly-CSharp.dll'])fs.writeFileSync(path.join(d,'SEIFUKU3_Data','Managed',f),'');
 const u=studyOf('unity',{dir:d});assert.deepEqual(u.unity,{backend:'mono',kits:['Utage','Unity.TextMeshPro']});
 const s=Craft.suggest(u,Engines.capabilities('unity'));assert.equal(s.engine,'unity');assert.equal(s.agrees,true);assert.ok(s.notes.some(n=>/Mono.*Utage/.test(n)));
 fs.writeFileSync(path.join(d,'GameAssembly.dll'),'');assert.equal(Craft.unityView(d).backend,'il2cpp');});

test('craft: every marker names a rule of the rule table',()=>{for(const [id] of Craft.MARKERS)assert.ok(Engines.RULES[id],id);});
