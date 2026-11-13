'use strict';
/* E640–E654 family F4a: Escude, PJADV, Luca System, Stuff (Propeller .msc), AI5WIN (full grammar), STCM2L, Willadv, and
   the archive + generic scan engines (ISM, GLib2, Cyberworks, Tanuki, Yaneurao, Rits, BlueGale, DxLib, SLG System),
   tested on synthetic game folders (validation/helpers/engine-fixtures-f4a.cjs): each builds a Japanese game and a
   Chinese (GBK / UTF-8 / UTF-16) patch and checks 1:1 pairing. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F=require('./helpers/engine-fixtures-f4a.cjs');
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs');
const E=n=>require('../services/original-engines/'+n+'.cjs');
const escude=E('escude'),pjadv=E('pjadv'),luca=E('luca'),stuff=E('stuff'),silky=E('silky'),stcm2=E('stcm2'),scan=E('archive-scan');
const {sjis,gbk}=F,kit=E('kit');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e640-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};
const put=(dir,rel,buf)=>{const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,buf);return f;};
const pairs=(own,zh)=>{assert.equal(zh.length,own.length,'line counts differ');return own.map((o,i)=>[o,zh[i]]);};
const JA=['「おはよう」と彼女は言った。','今日はいい天気ですね。','ありがとう、また明日。'],ZH=['“早上好”她说道。','今天天气真好啊。','谢谢，明天见。'];

/* ---- Escude --------------------------------------------------------------------------------------------------------- */
const OUTER='！？　。「」、…をぁぃぅぇぉゃゅょっーあいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん゛゜',INNER='!?｡｢｣､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾞﾟ';
const inner=s=>[...s].map(c=>{const i=[...OUTER].indexOf(c);return i<0?c:[...INNER][i];}).join('');
test('Escude: ESC-ARC2 / ESC-ARC1 index cipher, acp LZW, ESCR1_00 strings (half-width hiragana mapped back), ESCR_NEW .001',t=>{
 assert.equal(escude.lzw(F.acp(Buffer.from('hello acp')).subarray(8),9).toString(),'hello acp');
 const enc=s=>kit.encodeSjis(s),s1=F.escr1(['bg01',...JA.map(inner),'se_02'],enc),s2=F.escr1(['真琴',inner('きょうもがんばろう。')],enc);
 const game=tmp(t);put(game,'script.bin',F.escArc({'scr/0001.bin':s1,'scr/0002.bin':F.acp(s2)}));put(game,'gpr.bin',Buffer.alloc(32,1));
 assert.equal(library.engineOf(game)?.name,'Escude');assert.equal(scenes.detect(game),'escude');
 const v1=tmp(t);put(v1,'script.bin',F.escArc({'0001.bin':s1},{version:1}));assert.deepEqual(escude.list(path.join(v1,'script.bin')).map(e=>e.name),['0001.bin']);
 const own=scenes.read('escude',game).filter(s=>s.lines.length);assert.equal(own.length,2);
 assert.deepEqual(own[0].lines,JA);assert.deepEqual(own[0].anchors,['bg01','se_02']);assert.deepEqual(own[1].lines,['真琴','きょうもがんばろう。']);
 const patch=tmp(t);put(patch,'0001.bin',F.escr1(['bg01',...ZH,'se_02'],gbk));
 const zh=scenes.ENGINES.escude.archives(patch).map(s=>escude.parse(s.read())).filter(p=>p.lines.length);pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[0],ZH[0]);
 /* ESCR_NEW: the messages live in <name>.001 */
 const mess=escude.parse(F.escrMess(JA));assert.deepEqual(mess.lines,JA);pairs(mess.lines,escude.parse(F.escrMess(ZH,gbk)).lines);
 assert.deepEqual(escude.parse(Buffer.alloc(40,3)).lines,[]);
});

/* ---- PJADV ---------------------------------------------------------------------------------------------------------- */
const PJ=(L,N)=>[{name:N,say:L[0]},{say:L[1]},{prompt:L[2]},{choice:L[0].slice(0,3)},{choice:L[1].slice(0,3)}];
test('PJADV: GAMEDAT PAC2 / PACK, encrypted textdata.bin, scenario.dat names / lines / choices in code order',t=>{
 const ja=F.pjadvPair(PJ(JA,'ひなた'));const game=tmp(t);put(game,'archive.dat',F.gamedat({'scenario.dat':ja.scenario,'textdata.bin':ja.textdata}));
 assert.equal(F.gamedat({'a.bin':Buffer.alloc(4)},{version:1}).toString('latin1',0,12),'GAMEDAT PACK');assert.equal(pjadv.list(put(tmp(t),'a.dat',F.gamedat({'a.bin':Buffer.alloc(4)},{version:1})))[0].name,'a.bin');
 assert.equal(library.engineOf(game)?.name,'PJADV');assert.equal(scenes.detect(game),'pjadv');
 const own=scenes.read('pjadv',game);assert.equal(own.length,1);
 assert.deepEqual(own[0].lines,['ひなた',JA[0],JA[1],JA[2],JA[0].slice(0,3),JA[1].slice(0,3)]);
 const patch=tmp(t),zh=F.pjadvPair(PJ(ZH,'向日葵'),gbk,{encrypt:false});put(patch,'scenario.dat',zh.scenario);put(patch,'textdata.bin',zh.textdata);
 const z=scenes.ENGINES.pjadv.archives(patch).map(s=>pjadv.parse(s.read()));pairs(own[0].lines,z[0].lines);assert.equal(z[0].lines[0],'向日葵');
});

/* ---- Luca System ---------------------------------------------------------------------------------------------------- */
const LU=L=>[{say:L[0],voice:12},{op:1},{say:L[1]},{choice:L[2]}];
test('Luca System: SCRIPT.PAK (block offsets, name table), code lines; UTF-16 counted strings and UTF-8 C strings, opcode-agnostic',t=>{
 const game=tmp(t);put(game,'files/SCRIPT.PAK',F.lucaPak({_VARSTR:Buffer.alloc(8),SEEN0001:F.lucaScriptSP(LU(JA)),SEEN0002:F.lucaScriptEN([{say:JA[0],en:'Good morning'},{x:1},{say:JA[1],en:'Nice day'}])}));
 assert.equal(library.engineOf(game)?.name,'Luca System');assert.equal(scenes.detect(game),'luca');
 const own=scenes.read('luca',game);assert.deepEqual(own.map(s=>s.name),['SEEN0001','SEEN0002']);
 assert.deepEqual(own[0].lines,JA);assert.deepEqual(own[1].lines,[JA[0],JA[1]]);
 const patch=tmp(t);put(patch,'files/script/SEEN0001',F.lucaScriptSP(LU(ZH)));put(patch,'files/script/SEEN0002',F.lucaScriptEN([{say:ZH[0],en:'x'},{x:1},{say:ZH[1],en:'y'}]));
 const zh=scenes.ENGINES.luca.archives(patch).map(s=>luca.parse(s.read()));pairs(own[0].lines,zh[0].lines);pairs(own[1].lines,zh[1].lines);assert.equal(zh[0].lines[2],ZH[2]);
 /* a Shift-JIS C string (older titles) */
 assert.deepEqual(luca.parse(F.lucaScriptEN([{say:JA[2]}],sjis)).lines,[JA[2]]);
});

/* ---- Stuff (Propeller .msc) ----------------------------------------------------------------------------------------- */
test('Stuff Script: .mpk index XOR, .msc XOR 0x88, version 0 (u16 strings) and 1 (u32), MESSAGE and choices',t=>{
 const items=L=>[{say:L[0]},{say:L[1]},{choice:L[2]}];
 const game=tmp(t);put(game,'scr.mpk',F.mpk({'s01.msc':F.msc(items(JA)),'s02.msc':F.msc(items(JA),{version:1}),'bg.png':Buffer.from('\x89PNG')}));
 assert.equal(library.engineOf(game)?.name,'Stuff Script (Propeller)');assert.equal(scenes.detect(game),'stuff');
 const own=scenes.read('stuff',game);assert.deepEqual(own.map(s=>s.name),['s01.msc','s02.msc']);assert.deepEqual(own[0].lines,JA);assert.deepEqual(own[1].lines,JA);
 const patch=tmp(t);put(patch,'s01.msc',F.msc(items(ZH),{enc:gbk}));
 const zh=scenes.ENGINES.stuff.archives(patch).map(s=>stuff.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[2],ZH[2]);
});

/* ---- AI5WIN --------------------------------------------------------------------------------------------------------- */
const ai5Ops=(L,enc)=>[[0x0e,{v:[{c:[0x80,5,0xe0]},{s:'face'}]}],[0x01,{s:L[0]}],[0x0b,{c:[0xf2,1,2,3,4,0xef]},{i:12}],[0x01,{s:L[1]}],[0x08,{c:[0xa0,1]},{f:0},{c:[3]},{g:[[0xf1,0xff,0xff],[4]]}],[0x02,{s:L[2]}],[0x13,{b:1}],[0x00]];
test('AI5WIN: v2 / v1 / v0 grammars (expressions, variable lists, groups, F flag), markers dropped, .dat archive',t=>{
 for(const v of [2,1]){const r=silky.parse(F.ai5Mes(F.ai5Code(ai5Ops(JA)),v));assert.deepEqual(r.lines,JA,'version '+v);assert.deepEqual(r.anchors,[]);}
 const v0=F.ai5Mes(F.ai5Code([[0x01,{s:JA[0]}],[0x03,{b:1},{c:[0xc0,2]},{g:[[1]]}],[0x09,{c:[0x80,1]},{i:0}],[0x01,{s:JA[1]}],[0x00]]),0);assert.deepEqual(silky.ai5Parse(v0).lines,[JA[0],JA[1]]);assert.equal(silky.ai5Parse(v0).version,0);
 const marked=Buffer.concat([sjis('前'),Buffer.from([0xeb,0xa1]),sjis('後です')]);assert.deepEqual(silky.parse(F.ai5Mes(Buffer.concat([Buffer.from([1]),marked,Buffer.from([0,0])]),2)).lines,['前後です']);
 const game=tmp(t);put(game,'AI5WIN.exe',Buffer.from('MZ'));const ja=F.ai5Mes(F.ai5Code(ai5Ops(JA)),2);put(game,'mes.dat',F.ai5Dat({'start.mes':F.lzLit(ja),'logo.gcc':Buffer.alloc(16,1)}));
 assert.equal(library.engineOf(game)?.name,"Silky's");assert.equal(scenes.detect(game),'silky');
 const own=scenes.read('silky',game);assert.equal(own.length,1);assert.deepEqual(own[0].lines,JA);
 const patch=tmp(t);put(patch,'start.mes',F.ai5Mes(F.ai5Code(ai5Ops(ZH),gbk),2));
 const zh=scenes.ENGINES.silky.archives(patch).map(s=>silky.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[1],ZH[1]);
});

/* ---- STCM2L --------------------------------------------------------------------------------------------------------- */
test('STCM2L: actions, local string parameters in action order (opcode-agnostic), ASCII strings as anchors',t=>{
 const acts=L=>[{op:0x50,strs:['bgm01']},{op:0xd4,strs:['ひなた']},{op:0xd2,strs:[L[0]]},{op:0x01},{op:0xd2,strs:[L[1]]},{op:0xe7,strs:[L[2]]}];
 const game=tmp(t);put(game,'script.dat',F.stcm2(acts(JA)));
 assert.equal(library.engineOf(game)?.name,'STCM2');assert.equal(scenes.detect(game),'stcm2');
 const own=scenes.read('stcm2',game);assert.deepEqual(own[0].lines,['ひなた',...JA]);assert.deepEqual(own[0].anchors,['bgm01']);
 const patch=tmp(t);put(patch,'script.dat',F.stcm2(acts(ZH).map(a=>a.op===0xd4?{...a,strs:['向日葵']}:a),gbk));
 const zh=scenes.ENGINES.stcm2.archives(patch).map(s=>stcm2.parse(s.read()));pairs(own[0].lines,zh[0].lines);assert.equal(zh[0].lines[0],'向日葵');
});

/* ---- Willadv -------------------------------------------------------------------------------------------------------- */
test('Willadv: a Will ARC whose scripts are not the first extension is recognised and read by the AdvHD reader',t=>{
 const game=tmp(t);put(game,'data.arc',F.willArc({OGG:{bgm01:Buffer.from('OggS')},WSC:{s01:F.wsc('ひなた',JA[0],JA[1])}}));
 assert.equal(library.engineOf(game)?.name,'Willadv');assert.equal(scenes.detect(game),'advhd');
 const own=scenes.read('advhd',game);assert.deepEqual(own[0].lines,['ひなた',JA[0],JA[1]]);
});

/* ---- archive + generic scan ----------------------------------------------------------------------------------------- */
const TXT=enc=>F.textScript(JA,enc),TXZ=()=>F.textScript(ZH,gbk);
const SLG_KEY=0xbf8766f5,slgSd=body=>F.slgEncrypt(Buffer.concat([Buffer.from([2,0,0,2,0]),body,Buffer.from([0])]),SLG_KEY);
const CASES=[
 {engine:'ISM',id:'ism',make:(d,b)=>put(d,'data.isa',F.isa({'SCENE01.ISF':b,'BGM.OG':Buffer.from('OggS....')}))},
 {engine:'GLib2',id:'glib2',make:(d,b)=>{put(d,'data.g2',F.glib2({'s01.txt':b}));put(d,'scr.stx',F.glib2({'s02.txt':Buffer.from('OggS')}));}},
 {engine:'Cyberworks (C,system)',id:'cyberworks',make:(d,b)=>{const c=F.cyberworks({a:b});put(d,'Arc01.dat',c.index);put(d,'Arc04.dat',c.body);put(d,'Arc06.dat',Buffer.alloc(8));}},
 {engine:'Tanuki Engine',id:'tanuki',make:(d,b)=>put(d,'data.tac',F.tac({a:b,b:Buffer.from(b)}))},
 {engine:'Yaneurao',id:'yaneurao',make:(d,b)=>put(d,'script.dat',F.yanepk({'scenario/s01.txt':b}))},
 {engine:'Rits',id:'rits',make:(d,b)=>put(d,'script.saf',F.saf({'s01.str':b,'bg.png':Buffer.from('\x89PNG')}))},
 {engine:'BlueGale',id:'bluegale',make:(d,b)=>{const s=F.snn({'s01.scr':b});put(d,'data.snn',s.snn);put(d,'data.inx',s.inx);}},
 {engine:'DxLib',id:'dxlib',make:(d,b)=>put(d,'data.dxa',F.dxa({'scenario/s01.txt':b,'bgm/a.ogg':Buffer.from('OggS')}))},
 {engine:'SLG System',id:'slg',make:(d,b,zh)=>put(d,'data.szs',F.szs({'scr;main.sd':zh?F.slgEncrypt(Buffer.concat([Buffer.from([2,0,0,2,0]),b,Buffer.from([0])]),SLG_KEY):slgSd(b)}))}];
for(const c of CASES)test(c.engine+': archive opened, scripts read with the generic scan, a GBK patch packed the same way pairs 1:1',t=>{
 const game=tmp(t);c.make(game,TXT(sjis));
 assert.equal(library.engineOf(game)?.name,c.engine);assert.equal(scenes.detect(game),c.id);
 const own=scenes.read(c.id,game).filter(s=>s.lines.length);assert.equal(own.length,c.id==='tanuki'?2:1,'scripts with lines');assert.deepEqual(own[0].lines,JA);
 const patch=tmp(t);c.make(patch,TXZ(),true);
 const zh=scenes.ENGINES[c.id].archives(patch).map(s=>scenes.ENGINES[c.id].parse(s.read())).filter(p=>p.lines.length);pairs(own[0].lines,zh[0].lines);assert.deepEqual(zh[0].lines,ZH);
});
test('archive + scan helpers: GLib2 schemes invert, SLG keys, media skipped, unknown data reads nothing',()=>{
 const sc=scan.g2Scheme(scan.G2_HEADER_KEY),b=Buffer.from('GLibArchiveData2.0 and some more bytes');assert.deepEqual(scan.g2Decrypt(sc,scan.g2Encrypt(sc,b)),b);
 assert.deepEqual(scan.slgDecrypt(slgSd(sjis('テスト'))).subarray(0,5),Buffer.from([2,0,0,2,0]));assert.equal(scan.slgDecrypt(Buffer.alloc(16,0x55)),null);
 assert.deepEqual(scan.parse(Buffer.concat([Buffer.from('OggS'),sjis('おはようございます')])).lines,[]);
 assert.deepEqual(scan.parse(Buffer.alloc(64,7)).lines,[]);
});
