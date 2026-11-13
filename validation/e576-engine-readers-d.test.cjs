'use strict';
/* E592–E596 string-pool family (docs/engine-families.md A): CMVS, Lucifen, KaGuYa, LC-ScriptEngine, Yuka. Readers built
   on kit.cjs from public specs, tested on synthetic game folders (validation/helpers/engine-fixtures-d.cjs). Each builds a
   Japanese game and a Chinese (GBK) patch and checks 1:1 pairing. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F={...require('./helpers/engine-fixtures.cjs'),...require('./helpers/engine-fixtures-d.cjs')};
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs');
const cmvs=require('../services/original-engines/cmvs.cjs'),lucifen=require('../services/original-engines/lucifen.cjs'),kaguya=require('../services/original-engines/kaguya.cjs');
const lcse=require('../services/original-engines/lcse.cjs'),yuka=require('../services/original-engines/yuka.cjs'),kit=require('../services/original-engines/kit.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e576-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};
/* a patch folder read with the engine's own archives(), parsed scene by scene */
const patchLines=(id,dir)=>scenes.ENGINES[id].archives(dir).map(s=>({name:s.name,lines:scenes.ENGINES[id].parse(s.read()).lines}));
const pairs=(own,zh)=>{assert.deepEqual(own.map(s=>s.name),zh.map(s=>s.name));own.forEach((s,i)=>assert.equal(zh[i].lines.length,s.lines.length,s.name));};

/* ---- CMVS -------------------------------------------------------------------------------------------------------- */
const CM_JA=['さくら','「おはよう、遅刻するよ」',{push:'bgm01.ogg'},'朝の光が差し込む。'],CM_ZH=['樱','“早上好，要迟到了”',{push:'bgm01.ogg'},'晨光照了进来。'];
test('CMVS: PS2A rotate + 2 KB LZSS, pushes in code order, resource names are anchors',()=>{
 const r=cmvs.parse(F.ps2a(CM_JA));assert.deepEqual(r.lines,['さくら','「おはよう、遅刻するよ」','朝の光が差し込む。']);assert.deepEqual(r.anchors,['bgm01.ogg']);
 /* a back-reference in the 2 KB window: "abc" at 0x7DF, then (lo 0xDF, hi 7 << 5 | 1) = 3 bytes from 0x7DF */
 assert.equal(kit.lzss(Buffer.from([0x07,0x61,0x62,0x63,0xdf,0xe1]),6,{window:0x800,start:0x7df,lenBits:5,minMatch:2}).toString('latin1'),'abcabc');
 assert.deepEqual(cmvs.parse(Buffer.from('PS2A not really')).lines,[]);
});
test('CMVS: CPZ5 / CPZ6 index and entries decrypted for any md5 variant; a GBK .ps3 patch pairs',t=>{
 for(const [version,variant] of [[6,'Mirai'],[5,'A'],[6,'Chrono'],[6,'Aoi']]){const game=tmp(t),patch=tmp(t);
  F.writeTree(game,{'script.cpz':F.cpz({'scene/a01.ps3':F.ps2a(CM_JA),'scene/a02.ps3':F.ps2a(['二本目の話。']),'start.ps3':F.ps2a([{push:'a01.ps3'}])},{version,variant}),'cmvs32.exe':'MZ'});
  F.writeTree(patch,{'a01.ps3':F.ps2a(CM_ZH,{enc:F.gbk}),'a02.ps3':F.ps2a(['第二篇。'],{enc:F.gbk})});
  assert.equal(cmvs.open(path.join(game,'script.cpz'))?.variant,variant);
  assert.equal(library.engineOf(game)?.name,'CMVS (Purple Software)');assert.equal(scenes.detect(game),'cmvs');
  const own=scenes.read('cmvs',game).filter(s=>s.lines.length),zh=patchLines('cmvs',patch);pairs(own,zh);assert.equal(zh[0].lines[1],'“早上好，要迟到了”');}
});
test('CMVS: a CPZ7 archive is detected and reported as needing a real game',t=>{
 const game=tmp(t),c=F.cpz({'a.ps3':F.ps2a(['x'])});c.write('CPZ7',0,'latin1');F.writeTree(game,{'script.cpz':c});
 assert.equal(cmvs.list(path.join(game,'script.cpz')),null);assert.equal(scenes.unsupportedReason(game)?.code,'CMVS_CPZ7');
});

/* ---- Lucifen ----------------------------------------------------------------------------------------------------- */
const LU_JA=[{say:'「こんにちは」',name:'翔',voice:'sho0001'},{say:'空が青い。'},{choices:['教室へ行く','屋上へ行く']}],LU_ZH=[{say:'“你好”',name:'翔',voice:'sho0001'},{say:'天很蓝。'},{choices:['去教室','去屋顶']}];
test('Lucifen: SOB0 messages and choices by relocation, speaker split, UI pointers ignored',()=>{
 assert.deepEqual(lucifen.parse(F.sob(LU_JA)).lines,['翔','「こんにちは」','空が青い。','教室へ行く','屋上へ行く']);
 assert.deepEqual(lucifen.parse(F.sob(LU_JA,{magic:'SOB2'})).lines.length,5);
 assert.deepEqual(lucifen.split('#あかり$本文$'),['あかり','本文']);
});
test('Lucifen: SCRIPT.LPK (trie index, LZSS, entry + whole-content crypt) with either scheme; a GBK patch pairs',t=>{
 for(const scheme of lucifen.DEFAULT){const game=tmp(t),patch=tmp(t);
  F.writeTree(game,{'SCRIPT.LPK':F.lpk({'a01.sob':F.sob(LU_JA),'a02.sob':F.sob([{say:'二本目。'}]),'gameinit.sob':F.sob([])},{scheme}),'SE.LPK':Buffer.from('LPK1....'),'game.exe':'MZ'});
  F.writeTree(patch,{'SCRIPT.LPK':F.lpk({'a01.sob':F.sob(LU_ZH,{enc:F.gbk}),'a02.sob':F.sob([{say:'第二篇。'}],{enc:F.gbk}),'gameinit.sob':F.sob([])},{scheme,flags:0x0e})});
  assert.equal(lucifen.open(path.join(game,'SCRIPT.LPK'))?.scheme.name,scheme.name);
  assert.equal(library.engineOf(game)?.name,'Lucifen');assert.equal(scenes.detect(game),'lucifen');
  const own=scenes.read('lucifen',game).filter(s=>s.lines.length),zh=patchLines('lucifen',patch).filter(s=>s.lines.length);pairs(own,zh);assert.equal(zh[0].lines[1],'“你好”');}
});

/* ---- KaGuYa ------------------------------------------------------------------------------------------------------ */
const KG_JA=[[{name:'あかり',msgs:['「おはよう」','「今日も晴れだね」']},{name:null,msgs:['朝だった。']}],['はい','いいえ']],KG_ZH=[[{name:'明里',msgs:['“早上好”','“今天也是晴天呢”']},{name:null,msgs:['是早晨。']}],['是','否']];
test('KaGuYa: message.dat ver4 (XOR key, groups, ％) and the early block format',()=>{
 assert.deepEqual(kaguya.parse(F.kaguya4(...KG_JA,{key:0x5a})).lines,['あかり','「おはよう」','あかり','「今日も晴れだね」','朝だった。','はい','いいえ']);
 assert.deepEqual(kaguya.parse(F.kaguya4([{name:null,msgs:[Buffer.from([0x31,0x30,0xf0,0x40])]}],[],{enc:b=>b})).lines,['10％']);
 assert.deepEqual(kaguya.parse(F.kaguyaEarly([{name:'あかり',texts:['「おはよう」','行こう。']},{choice:'はい'}])).lines,['あかり','「おはよう」','行こう。','はい']);
});
test('KaGuYa: loose message.dat or one inside a WFL1 arc is found; a GBK patch pairs',t=>{
 const game=tmp(t),packed=tmp(t),patch=tmp(t);
 F.writeTree(game,{'message.dat':F.kaguya4(...KG_JA,{key:0x5a}),'params.dat':'[SCR-PARAMS]v05','arc0.arc':F.wfl1({'bg01.ogg':Buffer.from('OggS')}),'game.exe':'MZ'});
 F.writeTree(packed,{'arc1.arc':F.wfl1({'message.dat':F.kaguya4(...KG_JA)}),'game.exe':'MZ'});
 F.writeTree(patch,{'message.dat':F.kaguya4(...KG_ZH,{enc:F.gbk})});
 assert.equal(library.engineOf(game)?.name,'KaGuYa');assert.equal(scenes.detect(game),'kaguya');assert.equal(scenes.detect(packed),'kaguya');
 const own=scenes.read('kaguya',game),zh=patchLines('kaguya',patch);pairs(own,zh);assert.equal(zh[0].lines[1],'“早上好”');
 assert.deepEqual(scenes.read('kaguya',packed)[0].lines,own[0].lines);
 const linked=tmp(t);F.writeTree(linked,{'data.arc':F.link4({'bg01.png':Buffer.from('PNG'),'message.dat':F.kaguya4(...KG_JA)})});
 assert.deepEqual(kaguya.link(path.join(linked,'data.arc')).map(e=>e.name),['bg01.png','message.dat']);assert.deepEqual(scenes.read('kaguya',linked)[0].lines,own[0].lines);
});

/* ---- LC-ScriptEngine --------------------------------------------------------------------------------------------- */
const LC_JA=['あかり\x01「おはよう」\x01今日も晴れ。',{sys:'bg01'},{choices:['はい','いいえ']},'朝だった。\x02\x03'],LC_ZH=['明里\x01“早上好”\x01今天也是晴天。',{sys:'bg01'},{choices:['是','否']},'是早晨。\x02\x03'];
test('LC-ScriptEngine: .lst key found from its size, SNX key from its header, push / show / choice order',()=>{
 assert.deepEqual(lcse.parse(F.snx(LC_JA)).lines,['あかり','「おはよう」\n今日も晴れ。','はい','いいえ','朝だった。']);
 assert.deepEqual(lcse.parse(F.snx(LC_JA,{key:3})).lines.length,5);assert.deepEqual(lcse.parse(F.snx(LC_JA,{key:0})).lines.length,5);
});
test('LC-ScriptEngine: lcsebody1.lst + data pack is recognised and read; a GBK snx patch pairs',t=>{
 const game=tmp(t),patch=tmp(t);
 for(const key of [1,2]){const p=F.lcsePack({a01:{data:F.snx(LC_JA),type:1},a02:{data:F.snx(['二本目。'],{key:2}),type:1},bg01:{data:Buffer.from('BM..'),type:2}},{key});
  F.writeTree(game,{'lcsebody1.lst':p.lst,'lcsebody1':p.pack,'lcsebody.exe':'MZ'});
  assert.equal(library.engineOf(game)?.name,'LC-ScriptEngine');assert.equal(scenes.detect(game),'lcse');}
 F.writeTree(patch,{'a01.snx':F.snx(LC_ZH,{enc:F.gbk}),'a02.snx':F.snx(['第二篇。'],{enc:F.gbk,key:3})});
 const own=scenes.read('lcse',game),zh=patchLines('lcse',patch);pairs(own,zh);assert.equal(zh[0].lines[1],'“早上好”\n今天也是晴天。');
});

/* ---- Yuka -------------------------------------------------------------------------------------------------------- */
const YK_JA=[{name:'あかり'},{say:'「おはよう」'},{call:'Wait',args:[30]},{call:'BGM',args:['bgm01']},{say:'朝だった。'}],YK_ZH=[{name:'明里'},{say:'“早上好”'},{call:'Wait',args:[30]},{call:'BGM',args:['bgm01']},{say:'是早晨。'}];
test('Yuka: YKS element table walk, StrOut / NameOut constants only, data XOR 0xAA',()=>{
 assert.deepEqual(yuka.parse(F.yks(YK_JA)).lines,['あかり','「おはよう」','朝だった。']);
 assert.deepEqual(yuka.parse(F.yks(YK_JA,{encrypted:false})).lines.length,3);assert.deepEqual(yuka.parse(Buffer.from('YKS001 short')).lines,[]);
});
test('Yuka: data.ykc is recognised and read; a GBK yks patch pairs',t=>{
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'data02.ykc':F.ykc({'yks/a01.yks':F.yks(YK_JA),'yks/a02.yks':F.yks([{say:'二本目。'}]),'bg.ykg':Buffer.from('YKG000')}),'game.exe':'MZ'});
 F.writeTree(patch,{'yks/a01.yks':F.yks(YK_ZH,{enc:F.gbk}),'yks/a02.yks':F.yks([{say:'第二篇。'}],{enc:F.gbk})});
 assert.equal(library.engineOf(game)?.name,'Yuka');assert.equal(scenes.detect(game),'yuka');
 const own=scenes.read('yuka',game),zh=patchLines('yuka',patch);pairs(own,zh);assert.equal(zh[0].lines[1],'“早上好”');
});
