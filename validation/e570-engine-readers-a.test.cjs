'use strict';
/* E570–E572 System-NNN, codeX RScript (Liar-soft), AST: readers built from public specs, tested on synthetic game folders
   (validation/helpers/engine-fixtures-a.cjs). Each builds a Japanese game and a Chinese patch and checks 1:1 pairing. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F={...require('./helpers/engine-fixtures.cjs'),...require('./helpers/engine-fixtures-a.cjs')};
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs');
const nnn=require('../services/original-engines/systemnnn.cjs'),liar=require('../services/original-engines/liar.cjs'),ast=require('../services/original-engines/ast.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e570-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};

const JA=[{say:'「おはよう」\r\n朝の光が差し込む。'},{voice:true},{say:'#心ありがとう#［れい］。'},{choices:['教室へ行く','屋上へ行く']},{say:'静かな午後だった。'}];
const ZH=[{say:'“早上好”\r\n晨光照了进来。'},{voice:true},{say:'#心谢谢#［れい］。'},{choices:['去教室','去屋顶']},{say:'那是个安静的午后。'}];
test('System-NNN: spt decrypt, PRINT and SELECT in command order, display codes stripped',()=>{
 const r=nnn.parse(F.nnnSpt(JA));
 assert.deepEqual(r.lines,['「おはよう」\n朝の光が差し込む。','ありがとう。','教室へ行く','屋上へ行く','静かな午後だった。']);
 /* another fixed key (recovered from the header command) and an already decoded file */
 assert.deepEqual(nnn.parse(F.nnnSpt(JA,{key:0x12345678})).lines,r.lines);
 assert.deepEqual(nnn.parse(F.nnnSpt(JA,{plain:true})).lines,r.lines);
 assert.deepEqual(nnn.parse(Buffer.alloc(64,7)).lines,[]);
});
test('System-NNN: a game folder (spt beside nya) is recognised and read, and a GBK patch pairs',t=>{
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'spt/a01.spt':F.nnnSpt(JA),'spt/sys.spt':F.nnnSpt([]),'nya/x.xtx':'x','game.exe':'MZ'});
 F.writeTree(patch,{'override/spt/a01.spt':F.nnnSpt(ZH,{enc:F.gbk})});
 assert.equal(library.engineOf(game)?.name,'System-NNN');assert.equal(scenes.detect(game),'systemnnn');
 const own=scenes.read('systemnnn',game).find(s=>s.name==='a01.spt'),zh=scenes.ENGINES.systemnnn.archives(patch).map(s=>nnn.parse(s.read()))[0];
 assert.equal(zh.lines.length,own.lines.length);assert.equal(zh.lines[2],'去教室');assert.equal(zh.lines[0],'“早上好”\n晨光照了进来。');
});

test('codeX RScript: .gsc string table in order, ^n breaks, ASCII anchors',()=>{
 const r=liar.parse(F.gsc(['bg01','ナレーション','「眠いな」^n「うん」','東へ','西へ','voice/a001']));
 assert.deepEqual(r.lines,['ナレーション','「眠いな」\n「うん」','東へ','西へ']);assert.deepEqual(r.anchors,['bg01','voice/a001']);
 assert.deepEqual(liar.parse(Buffer.from('not a gsc file at all......')).lines,[]);
});
test('codeX RScript: scr.xfl (with a nested folder) is recognised and read, and a GBK patch pairs',t=>{
 const ja=['bg01','誰ソ彼の街','「行こう」'],zh=['bg01','黄昏之街','“走吧”'];
 const game=tmp(t),patch=tmp(t);
 F.writeTree(game,{'scr.xfl':F.xfl({'0001.gsc':F.gsc(ja),'sub.xfl':F.xfl({'0002.gsc':F.gsc(['二本目'])})}),'grp.xfl':F.xfl({'a.wcg':Buffer.from('WGq')}),'game.exe':'MZ'});
 F.writeTree(patch,{'scr.xfl':F.xfl({'0001.gsc':F.gsc(zh,{enc:F.gbk}),'sub.xfl':F.xfl({'0002.gsc':F.gsc(['第二本'],{enc:F.gbk})})})});
 assert.equal(library.engineOf(game)?.name,'codeX RScript (Liar-soft)');assert.equal(scenes.detect(game),'liar');
 const own=scenes.read('liar',game),tr=scenes.ENGINES.liar.archives(patch).map(s=>liar.parse(s.read()));
 assert.deepEqual(own.map(s=>s.name),['0001.gsc','0002.gsc']);assert.deepEqual(own.map(s=>s.lines.length),tr.map(s=>s.lines.length));
 assert.equal(tr[0].lines[1],'“走吧”');assert.deepEqual(liar.xflList(path.join(game,'scr.xfl')).map(e=>e.name),['0001.gsc','sub.xfl/0002.gsc']);
});

test('AST: ARC2 index (names XOR 0xFF), LZSS + XOR entries, ARC1 plain; media entries skipped',t=>{
 /* LZSS back-reference: "abc" then a reference to window position 0xFEE, length 3 -> "abcabc" */
 assert.equal(ast.lzss(Buffer.from([0x07,0x61,0x62,0x63,0xee,0xf0]),6).toString('latin1'),'abcabc');
 const text=F.sjis('「こんにちは」と彼女は言った。\r\n風が吹いている。\r\n');
 const game=tmp(t);F.writeTree(game,{script:F.astArc({'s001.txt':text,'title.png':Buffer.from('PNG')}),graphic:F.astArc({'a.png':Buffer.from('x')},{version:1}),'game.exe':'MZ'});
 assert.equal(library.engineOf(game)?.name,'AST');
 const l=ast.list(path.join(game,'script'));assert.deepEqual(l.map(e=>e.name),['s001.txt','title.png']);
 assert.equal(ast.read(path.join(game,'script'),l[0]).toString('hex'),text.toString('hex'));
 assert.equal(scenes.detect(game),'ast');const r=scenes.read('ast',game);assert.deepEqual(r.map(s=>s.name),['script/s001.txt']);
 assert.ok(r[0].lines.includes('風が吹いている。'),JSON.stringify(r[0].lines));
 const v1=ast.list(path.join(game,'graphic'));assert.equal(ast.read(path.join(game,'graphic'),v1[0]).toString(),'x');
});
