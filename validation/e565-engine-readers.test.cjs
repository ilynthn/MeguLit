'use strict';
/* E565–E567 readers built from public format specs, tested on synthetic game folders (validation/helpers/engine-fixtures.cjs):
   Majiro (scenario.arc + .mjo), Ren'Py compiled scripts (.rpyc, .rpa, compiled tl), TyranoScript (loose, app.asar,
   package.nw, exe-appended zip). Each builds a Japanese game and a Chinese patch and checks the lines pair 1:1. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F=require('./helpers/engine-fixtures.cjs');
const scenes=require('../services/original-engines/scenes.cjs');
const majiro=require('../services/original-engines/majiro.cjs'),rpyc=require('../services/original-engines/renpy-rpyc.cjs'),tyrano=require('../services/original-engines/tyrano.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e565-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};

/* ---- Majiro ---------------------------------------------------------------------------------------------------- */
const mjOps=(say,name,choice)=>[['line',1],['ldstr','bg01'],['syscallp',0x1234,1],['ldstr',name],['syscallp',0x5555,1],['text',say[0]],['ctrl','n'],['text',say[1]],['proc'],
 ['ldc',5],['ldc',7],['add'],['st',0,0xdead,-1],['switch',[1,2,3]],['alloca',[0,1]],['callp',0x99,0],['br',0],['text',say[2]],['ctrl','p'],['ldstr',choice],['ret']];
test('Majiro: every archive version, encrypted and plain .mjo, opcode walk',()=>{
 const ops=mjOps(['「おはよう、','今日もいい天気だね」','風が吹いた。'],'真琴','次へ進む');
 for(const v of [1,2,3])for(const encrypted of [true,false]){const arc=F.majiroArc({'start.mjo':F.mjo(ops,{encrypted})},v),e=majiro.arcList(arc)[0];
  const r=majiro.parse(arc.subarray(e.offset,e.offset+e.size));
  assert.deepEqual(r.lines,['真琴','「おはよう、\n今日もいい天気だね」','風が吹いた。','次へ進む'],'v'+v+' enc '+encrypted);assert.deepEqual(r.anchors,['bg01']);}
 /* a byte pair 0x40 0x08 inside an int operand is not read as text */
 const tricky=majiro.parse(F.mjo([['ldc',0x00000840],['text','本文']]));assert.deepEqual(tricky.lines,['本文']);
 assert.equal(majiro.arcList(Buffer.from('not an archive at all, really not')),null);
});
test('Majiro: a game folder reads through scenes.cjs and a GBK patch pairs line by line',t=>{
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'scenario.arc':F.majiroArc({'a01.mjo':F.mjo(mjOps(['「おはよう、','今日もいい天気だね」','風が吹いた。'],'真琴','次へ進む')),'a02.mjo':F.mjo([['text','二日目。'],['proc']])}),'data.arc':Buffer.from('x')});
 F.writeTree(patch,{'scenario.arc':F.majiroArc({'a01.mjo':F.mjo(mjOps(['“早上好，','今天也是好天气”','风吹过。'],'真琴','前进'),{enc:F.gbk}),'a02.mjo':F.mjo([['text','第二天。'],['proc']],{enc:F.gbk})})});
 assert.equal(scenes.detect(game),'majiro');
 const own=scenes.read('majiro',game),zh=scenes.read('majiro',patch);
 assert.deepEqual(own.map(s=>s.name),['a01.mjo','a02.mjo']);
 assert.deepEqual(own.map(s=>s.lines.length),zh.map(s=>s.lines.length));
 assert.equal(zh[0].lines[2],'风吹过。');assert.deepEqual(own[0].anchors,zh[0].anchors);
});

/* ---- Ren'Py ---------------------------------------------------------------------------------------------------- */
const N=F.node,T=F.tuple;
const say=(who,what)=>N('Say',T(null,{who,what,with_:null,interact:true}));
const tr=(id,lang,block)=>N('Translate',T(null,{identifier:id,language:lang,block}));
const script=()=>[N('Label',T(null,{name:'start',parameters:null,block:[
 tr('start_a1b2c3d4',null,[say('e','こんにちは、世界。')]),
 N('Scene',T(null,{imspec:['bg room']})),
 tr('start_e5f6a7b8',null,[say(null,'静かな部屋だった。')]),
 N('Menu',T(null,{items:[T('右へ行く',"True",[tr('start_11112222',null,[say('e','右だね。')])]),T('左へ行く',"True",[])],set:null,with_:null})),
 N('Python',T(null,{code:{source:'x = "コードの中の文字列"'}})),
]}))];
test("Ren'Py: rpyc statements, translate ids, menu choices; python code is not text",()=>{
 const r=rpyc.parse(F.rpyc(script()));
 assert.deepEqual(r.lines,['こんにちは、世界。','静かな部屋だった。','右へ行く','右だね。','左へ行く']);
 assert.deepEqual(r.ids,['start_a1b2c3d4','start_e5f6a7b8',null,'start_11112222',null]);
});
test("Ren'Py: a game with only script.rpa (no .rpy) reads, and a compiled tl/chinese pairs by id",t=>{
 const game=tmp(t);
 const tl=F.rpyc([tr('start_a1b2c3d4','chinese',[say('e','你好，世界。')]),tr('start_e5f6a7b8','chinese',[say(null,'房间很安静。')]),tr('start_11112222','chinese',[say('e','是右边呢。')]),
  N('TranslateString',T(null,{language:'chinese',old:'右へ行く',new:'往右走'})),N('TranslateString',T(null,{language:'chinese',old:'左へ行く',new:'往左走'}))]);
 F.writeTree(game,{'renpy/__init__.py':'#','game/script.rpa':F.rpa({'script.rpyc':F.rpyc(script()),'tl/chinese/script.rpyc':tl})});
 assert.equal(scenes.detect(game),'renpy');
 const base=scenes.read('renpy',game);assert.deepEqual(base.map(s=>s.name),['script.rpy']);assert.equal(base[0].lines.length,5);
 const found={dirs:[game,path.join(game,'game')],files:new Map()};
 const out=scenes.ENGINES.renpy.patchLines(base,found);
 assert.deepEqual(out[0].lines,['你好，世界。','房间很安静。','往右走','是右边呢。','往左走']);assert.equal(out[0].patched,true);
 /* RPA-2.0 (no key) and a loose rpyc override */
 const g2=tmp(t);F.writeTree(g2,{'game/a.rpa':F.rpa({'b.rpyc':F.rpyc([say(null,'旧い行')])},{version:'2.0'}),'game/b.rpyc':F.rpyc([say(null,'新しい行')])});
 assert.deepEqual(scenes.read('renpy',g2)[0].lines,['新しい行']);
});
test("Ren'Py: .rpy sources still win over the compiled copy",t=>{
 const game=tmp(t);F.writeTree(game,{'game/script.rpy':'label start:\n    e "ソースの行"\n','game/script.rpyc':F.rpyc([say('e','コンパイル版')])});
 assert.deepEqual(scenes.read('renpy',game)[0].lines,['ソースの行']);
});

/* ---- TyranoScript ---------------------------------------------------------------------------------------------- */
const KS_JA=`*start
[cm]
;コメント
/* ブロック
コメント */
#あかね:smile
[playse storage="voice/akane_001.ogg"]
おはよう！[l][r]
今日は[ruby text="はれ"]晴れだね。[p]
[iscript]
f.name = "スクリプト";
[endscript]
@jump target=*next
#
空が青い。[p]
`;
const KS_ZH=KS_JA.replace('#あかね:smile','#茜:smile').replace('おはよう！','早上好！').replace('今日は[ruby text="はれ"]晴れだね。','今天是晴天呢。').replace('空が青い。','天空很蓝。');
test('TyranoScript: names, ruby, code and comments',()=>{
 const r=tyrano.parse(Buffer.from(KS_JA));
 assert.deepEqual(r.lines,['あかね','おはよう！','今日は晴れだね。','空が青い。']);
 assert.deepEqual(r.ruby[2],[['晴','はれ']]);
 assert.ok(r.anchors.includes('@jump target=*next'));
});
test('TyranoScript: loose, app.asar, package.nw and exe-appended NW.js builds read the same lines',t=>{
 const files=ks=>({'data/scenario/first.ks':ks,'data/scenario/sub/route.ks':'#\nルートの行。[p]\n','tyrano/tyrano.base.js':'//','tyrano/libs/jquery.js':'//','index.html':'<html>'});
 const loose=tmp(t);F.writeTree(loose,files(KS_JA));
 const asarGame=tmp(t);F.writeTree(asarGame,{'resources/app.asar':F.asar(files(KS_JA)),'Game.exe':'MZ'});
 const nw=tmp(t);F.writeTree(nw,{'package.nw':F.zip(files(KS_JA)),'nw.dll':'x'});
 const exe=tmp(t);F.writeTree(exe,{'Game.exe':F.zip(files(KS_JA),{prefix:Buffer.alloc(4096,0x4d)}),'nw.dll':'x'});
 for(const dir of [loose,asarGame,nw,exe]){assert.equal(scenes.detect(dir),'tyrano',dir);const r=scenes.read('tyrano',dir);
  assert.deepEqual(r.map(s=>s.name),['first.ks','sub/route.ks']);assert.deepEqual(r[0].lines,['あかね','おはよう！','今日は晴れだね。','空が青い。']);}
 /* a KiriKiri folder with loose data/scenario but no tyrano engine stays KiriKiri */
 const krkr=tmp(t);F.writeTree(krkr,{'data/scenario/first.ks':'*start\nこんにちは[p]\n','data/system/Config.tjs':'//'});
 assert.equal(scenes.detect(krkr),'kirikiri');
 /* a Chinese patch (same layout) pairs line by line */
 const zh=tmp(t);F.writeTree(zh,files(KS_ZH));const a=scenes.read('tyrano',loose),b=scenes.read('tyrano',zh);
 assert.deepEqual(a.map(s=>s.lines.length),b.map(s=>s.lines.length));assert.equal(b[0].lines[3],'天空很蓝。');assert.deepEqual(a[0].anchors,b[0].anchors);
});

/* ---- Softpal ADV (E568) ---------------------------------------------------------------------------------------- */
const softpal=require('../services/original-engines/softpal.cjs');
test('Softpal: data.pac with encrypted TEXT.DAT, names before messages, choices; a GBK patch pairs',t=>{
 const ja=[{kind:'say',text:'……その手紙が届いたのは、ある晴れた日の午後のことだった。'},{kind:'say',name:'満琉',text:'「お前、試しただろ」'},{kind:'choice',text:'学園へ行く'},{kind:'say',name:'満琉',text:'「行くぞ」'}];
 const zh=[{kind:'say',text:'……那封信寄到的时候，是一个晴朗的午后。'},{kind:'say',name:'满琉',text:'“你试探我了吧”'},{kind:'choice',text:'去学园'},{kind:'say',name:'满琉',text:'“走吧”'}];
 const a=F.softpalPair(ja),b=F.softpalPair(zh,{enc:F.gbk});
 assert.equal(a.text.toString('latin1',0,12),'$TEXT_LIST__');assert.ok(!a.text.includes(F.sjis('満琉')),'body is encrypted');
 const game=tmp(t),patch=tmp(t);F.writeTree(game,{'data.pac':F.softpalPac({'SCRIPT.SRC':a.src,'TEXT.DAT':a.text,'ANI.ANI':Buffer.from('x')}),'dll/PAL.dll':'x'});
 F.writeTree(patch,{'SCRIPT.SRC':b.src,'TEXT.DAT':b.text});
 assert.equal(scenes.detect(game),'softpal');
 const own=scenes.read('softpal',game)[0].lines,tr=scenes.ENGINES.softpal.archives(patch).map(s=>softpal.parse(s.read()))[0].lines;
 assert.deepEqual(own,['……その手紙が届いたのは、ある晴れた日の午後のことだった。','満琉','「お前、試しただろ」','学園へ行く','満琉','「行くぞ」']);
 assert.equal(tr.length,own.length);assert.equal(tr[3],'去学园');
 /* plain (already decrypted) TEXT.DAT reads too */
 const plain=F.softpalPair(ja,{plain:true});assert.equal(softpal.parse(Buffer.concat([plain.src,softpal.JOIN,plain.text])).lines.length,6);
});
const leyline='E:/GAL/[120727][ユニゾンシフト：ブロッサム] 時計仕掛けのレイライン -黄昏時の境界線-';
test('Softpal: 時計仕掛けのレイライン -黄昏時の境界線- (local copy, read only)',{skip:!fs.existsSync(leyline+'/data.pac')&&'no local copy'},()=>{
 const r=scenes.read('softpal',leyline)[0];assert.ok(r.lines.length>30000,String(r.lines.length));
 assert.equal(r.lines[0],'……その手紙が届いたのは、ある晴れた日の午後のことだった。');assert.ok(r.lines.includes('「なかなか論理的ですね久我くん」'));
});

/* ---- library detection (E569) ---------------------------------------------------------------------------------- */
const library=require('../core/library.cjs');
test('library: engines MeguLit reads, and engines it did not know, are recognised instead of unknown',t=>{
 const cases={
  'FVP (FAVORITE)':{'irohika.hcb':'x','FVPKernel.dll':'x'},'Innocent Grey (IGA)':{'script.iga':'IGA0rest'},'Musica (PAZ)':{'scr.dat':'x','sys.dat':'x','st.dat':'x'},
  'Bruns':{'scene/a.bso':'EENC'},'HuneX':{'data00200.hfa':'HUNEXGGEFA10'},'SoftPal':{'data.pac':'PAC \0\0\0\0','dll/PAL.dll':'x'},
  'CMVS (Purple Software)':{'pack/x':'','script.cpz':'CPZ7xxxx'},'EAGLS':{'Scpack.pak':'x','Scpack.idx':'x'},'Ikura GDL':{'ISF':'SM2MPX10xxxx'},"Silky's":{'mes.ifl':'IFLSxxxx'},
  'PJADV':{'data1.dat':'GAMEDAT PAC2'},'System-NNN':{'ta.gtb':'x','ta.gpk':'x'},'Godot':{'game.pck':'GDPCxxxx'},'Majiro':{'data.arc':'MajiroArcV3.000\0'},
  'TyranoScript':{'data/scenario/first.ks':'x','tyrano/tyrano.base.js':'x','index.html':'x'},'Luca System':{'files/SCRIPT.PAK':'x'},'Lucifen':{'a.lpk':'LPK1xxxx'},'Seraph':{'ArchPac.dat':'x'},'ISM':{'data.isa':'ISM ARCHIVED'},'ExHIBIT':{'dat/scr.rld':'x'}};
 for(const [name,files] of Object.entries(cases)){const d=tmp(t);F.writeTree(d,files);assert.equal(library.engineOf(d)?.name,name,JSON.stringify(files));}
 /* a NeXAS script.pac is not taken for Softpal and the other way round */
 const nx=tmp(t);F.writeTree(nx,{'Script.pac':'PAC\0\x04'});assert.equal(library.engineOf(nx)?.name,'NeXAS');
});

/* ---- GARbro fallback reaches QLIE / ShiinaRio / Entis / AliceSoft containers (E569) ----------------------------- */
test('GARbro fallback lists the containers of engines without a reader of their own',t=>{
 const g=require('../services/original-engines/garbro.cjs');const d=tmp(t);
 F.writeTree(d,{'GameData/data0.pack':Buffer.alloc(20000),'scene.war':Buffer.alloc(20000),'data.noa':Buffer.alloc(20000),'Rance01SA.ald':Buffer.alloc(20000),'GameData/bg.png':Buffer.alloc(20000)});
 assert.deepEqual(g.archives(d).map(f=>path.basename(f)).sort(),['Rance01SA.ald','data.noa','data0.pack','scene.war']);
});
