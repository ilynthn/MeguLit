'use strict';
/* E630–E639 F3 game-maker binaries (services/original-engines/makers.cjs): GameMaker, Director, HSP, Clickteam, AGS, SRPG
   Studio, Java / libGDX, MonoGame / XNA, OHRRPGCE, RPG Paper Maker read from synthetic game folders
   (validation/helpers/engine-fixtures-f3.cjs). Each builds a Japanese game and a Chinese patch and checks 1:1 pairing;
   Bakin, Visionaire, Smile Game Builder and Unity Game Creator are recognised only. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F=require('./helpers/engine-fixtures-f3.cjs'),{writeTree}=require('./helpers/engine-fixtures.cjs');
const scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs'),M=require('../services/original-engines/makers.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e630-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};
const JA=['「おはよう」と彼女は言った。','静かな午後だった。','ひなた'],ZH=['“早上好”她说。','那是个安静的午后。','向日葵'];
/* the game reads as engine / reader id with these lines; the patch folder (same files, Chinese) pairs 1:1 */
function pairs(game,patch,{engine,id,ja,zh}){assert.equal(library.engineOf(game)?.name,engine);assert.equal(scenes.detect(game),id);
 const own=scenes.read(id,game).flatMap(s=>s.lines);assert.deepEqual(own,ja);
 const E=scenes.ENGINES[id],tl=E.archives(patch).flatMap(s=>E.parse(s.read()).lines);assert.deepEqual(tl,zh);assert.equal(tl.length,own.length);}

test('GameMaker: data.win STRG pool (UTF-8) and included text files',t=>{
 const win=L=>F.gmWin(['obj_player','spr_bg',L[0],'scr_main',L[1],L[2]]);
 const game=writeTree(tmp(t),{'data.win':win(JA),'game.exe':F.pe(),'options.ini':'[Windows]\nfoo=1\n','story.json':JSON.stringify({lines:[JA[1],'skip']})});
 const patch=writeTree(tmp(t),{'data.win':win(ZH),'story.json':JSON.stringify({lines:[ZH[1],'skip']})});
 pairs(game,patch,{engine:'GameMaker',id:'gamemaker',ja:[...JA,JA[1]],zh:[...ZH,ZH[1]]});
 assert.deepEqual(M.gmStrings(win(JA)).slice(0,2),['obj_player','spr_bg']);assert.deepEqual(M.ENGINES.gamemaker.parse(Buffer.from('FORMxxxx')).lines,[]);
});

test('Director: RIFX movie (big-endian), Afterburner .cct (XFIR, ILS + zlib), and a projector exe overlay',t=>{
 const movie=(L,enc)=>F.rifxMovie([['STXT',F.stxtData(enc(L[0]))],['CASt',Buffer.alloc(16,1)],['STXT',F.stxtData(enc(L[1]))],['STXT',F.stxtData(Buffer.from('OK'))]]);
 const cast=(L,enc)=>F.afterburner([['STXT',F.stxtData(enc(L[2]))],['Lscr',Buffer.alloc(20,2)],['STXT',F.stxtData(enc(L[0]+'\r'+L[1]))]]);
 const game=writeTree(tmp(t),{'movie.dxr':movie(JA,F.sjis),'cast.cct':cast(JA,F.sjis),'start.exe':F.pe()});
 const patch=writeTree(tmp(t),{'movie.dxr':movie(ZH,F.gbk),'cast.cct':cast(ZH,F.gbk)});
 pairs(game,patch,{engine:'Macromedia Director',id:'director',ja:[JA[2],JA[0]+'\n'+JA[1],JA[0],JA[1]],zh:[ZH[2],ZH[0]+'\n'+ZH[1],ZH[0],ZH[1]]});
 /* a Windows projector: the movie (XFIR) is appended to the exe */
 const proj=writeTree(tmp(t),{'game.exe':F.pe(Buffer.concat([Buffer.from('PJ00'),Buffer.alloc(60),F.rifxMovie([['STXT',F.stxtData(F.sjis(JA[1]))]],{le:true})]))});
 assert.equal(M.probes.overlayKind(path.join(proj,'game.exe')),'director');assert.equal(library.engineOf(proj)?.name,'Macromedia Director');
 assert.deepEqual(scenes.read('director',proj).flatMap(s=>s.lines),[JA[1]]);
 const be=F.rifxMovie([['STXT',F.stxtData(F.sjis(JA[0]))]]);assert.equal(M.rifx(be).type,'MV93');assert.equal(M.rifx(F.afterburner([['STXT',F.stxtData(F.sjis(JA[0]))]],{le:false})).type,'FGDM');
});

test('HSP: DPMX appended to the exe, start.ax string operands (16- and 32-bit) in code order, pack text files; loose .ax',t=>{
 const exe=(L,enc)=>F.pe(F.dpmx({'start.ax':F.ax([L[0],{big:L[1]}],enc),'story.txt':Buffer.concat([enc(L[2]+'\r\n'),Buffer.from('end\r\n')]),'bg.png':Buffer.from('PNG')}));
 const game=writeTree(tmp(t),{'game.exe':exe(JA,F.sjis)}),patch=writeTree(tmp(t),{'game.exe':exe(ZH,F.gbk)});
 pairs(game,patch,{engine:'Hot Soup Processor',id:'hsp',ja:JA,zh:ZH});
 /* no pack index: the HSP3 object is found by its header */
 const loose=Buffer.concat([Buffer.alloc(33,7),F.ax([JA[1]],F.sjis)]);assert.deepEqual(M.ENGINES.hsp.parse(loose).lines,[JA[1]]);
 const g2=writeTree(tmp(t),{'start.ax':F.ax([JA[0]],F.sjis),'hsp3.exe':F.pe()});assert.equal(library.engineOf(g2)?.name,'Hot Soup Processor');assert.deepEqual(scenes.read('hsp',g2).flatMap(s=>s.lines),[JA[0]]);
 /* a keyed entry is counted, not read */
 const keyed=F.dpmx({'start.ax':Buffer.alloc(0x80,9)},{'start.ax':0x1234});assert.equal(M.ENGINES.hsp.encrypted(keyed),1);assert.deepEqual(M.ENGINES.hsp.parse(keyed).lines,[]);
});

test('Clickteam Fusion: PAMU chunks (zlib, nested frame chunks, encrypted ones skipped) and ANSI PAME',t=>{
 const game=writeTree(tmp(t),{'game.exe':F.pe(F.pame(JA))}),patch=writeTree(tmp(t),{'game.exe':F.pe(F.pame(ZH))});
 pairs(game,patch,{engine:'Clickteam Fusion',id:'clickteam',ja:[JA[0],JA[2],JA[1]],zh:[ZH[0],ZH[2],ZH[1]]});
 const ansi=M.clickteam(F.pe(F.pame(ZH,{unicode:false,enc:F.gbk})));assert.deepEqual(ansi.lines,[ZH[0],ZH[2],ZH[1]]);assert.equal(ansi.encrypted,1);
 assert.deepEqual(M.clickteam(F.pe(F.pame(JA,{unicode:false,enc:F.sjis}))).lines,[JA[0],JA[2],JA[1]]);
});

test('AGS: SCOM string sections in the exe CLIB and room files; a .tra translation pairs by source text',t=>{
 const exe=(L,enc)=>F.pe(F.clib([Buffer.alloc(40,1),F.scom(['GlobalScript',L[0],'Look',L[1]],enc),Buffer.alloc(9,2)]));
 const game=writeTree(tmp(t),{'game.exe':exe(JA,F.sjis),'room1.crm':Buffer.concat([Buffer.from('ROOM'),F.scom([JA[2]],F.sjis)]),'acsetup.cfg':'[misc]\n'});
 const patch=writeTree(tmp(t),{'game.exe':exe(ZH,F.gbk),'room1.crm':Buffer.concat([Buffer.from('ROOM'),F.scom([ZH[2]],F.gbk)])});
 pairs(game,patch,{engine:'Adventure Game Studio',id:'ags',ja:JA,zh:ZH});
 const tra=F.traFile(JA.map((s,i)=>[F.sjis(s),F.gbk(ZH[i])]));assert.equal(M.tra(tra).length,3);
 const trDir=writeTree(tmp(t),{'Chinese.tra':tra}),base=scenes.read('ags',game),got=scenes.ENGINES.ags.patchLines(base,{dirs:[trDir]});
 assert.deepEqual(got.flatMap(s=>s.lines),ZH);assert.ok(got.every(s=>s.patched));
 assert.equal(scenes.ENGINES.ags.patchLines(base,{dirs:[tmp(t)]}),null);
});

test('SRPG Studio: data.dts project data, RC4 with the "_dynamic" key (or plain), UTF-16 string pool',t=>{
 const pool=L=>['Map01',L[0],'Unit',L[1],L[2]];
 const game=writeTree(tmp(t),{'data.dts':F.dts(pool(JA)),'runtime.rts':'x','game.exe':F.pe()}),patch=writeTree(tmp(t),{'data.dts':F.dts(pool(ZH))});
 pairs(game,patch,{engine:'SRPG Studio',id:'srpg',ja:JA,zh:ZH});
 assert.deepEqual(M.ENGINES.srpg.parse(F.dts(pool(JA),{encrypt:false})).lines,JA);
});

test('Java / libGDX: jar class literals (constant pool), .properties \\u escapes, json; library jars skipped',t=>{
 const jar=(L,extra={})=>F.jar({'jp/game/Main.class':F.javaClass([L[0],L[1]]),'text/story.properties':F.props([['title','Game'],['say',L[2]]]),'data/menu.json':JSON.stringify({menu:[L[1]]}),...extra});
 const game=writeTree(tmp(t),{'game.jar':jar(JA),'game.exe':F.pe()}),patch=writeTree(tmp(t),{'game.jar':jar(ZH)});
 pairs(game,patch,{engine:'Java',id:'java',ja:[JA[1],JA[0],JA[1],JA[2]],zh:[ZH[1],ZH[0],ZH[1],ZH[2]]});
 const gdx=writeTree(tmp(t),{'desktop.jar':jar(JA,{'com/badlogic/gdx/Gdx.class':F.javaClass(['ライブラリ'])})});
 assert.equal(library.engineOf(gdx)?.name,'libGDX');assert.equal(scenes.detect(gdx),'java');assert.ok(!scenes.read('java',gdx).flatMap(s=>s.lines).includes('ライブラリ'));
 assert.deepEqual(M.classStrings(F.javaClass(['あいう'])),['あいう','ascii.png']);
});

test('MonoGame / XNA: Content .xnb strings (plain and LZ4) and the game assembly #US heap',t=>{
 const tree=(L,root)=>writeTree(root,{'Content/Text/story.xnb':F.xnb([L[0]]),'Content/Text/zmenu.xnb':F.xnb([L[1]],{lz4:true}),'Game.exe':F.pe(Buffer.alloc(0),{us:F.usHeap(['Loading',L[2]])}),'MonoGame.Framework.dll':F.pe()});
 const game=tree(JA,tmp(t)),patch=tree(ZH,tmp(t));
 pairs(game,patch,{engine:'MonoGame / XNA',id:'xna',ja:JA,zh:ZH});
 assert.deepEqual(M.userStrings(F.pe(Buffer.alloc(0),{us:F.usHeap(['a',JA[0]])})),['a',JA[0]]);
 assert.equal(M.lz4Block(Buffer.from([0x44,0x61,0x62,0x63,0x64,0x04,0x00,0x10,0x21]),13).toString(),'abcdabcdabcd!');
 assert.equal(M.xnbBody(Buffer.concat([Buffer.from('XNBw'),Buffer.from([5,0x80]),Buffer.alloc(8)])),null);
});

test('OHRRPGCE: .rpg lumps (PDP-endian sizes), .say text boxes of 8 lines',t=>{
 const rpg=(L,enc)=>F.rpgFile({'game.gen':Buffer.alloc(16,1),'game.say':F.sayLump([[L[0]],[L[2],L[1]]],enc)});
 const game=writeTree(tmp(t),{'game.rpg':rpg(JA,F.sjis),'game.exe':F.pe()}),patch=writeTree(tmp(t),{'game.rpg':rpg(ZH,F.gbk)});
 pairs(game,patch,{engine:'OHRRPGCE',id:'ohrrpgce',ja:[JA[0],JA[2]+'\n'+JA[1]],zh:[ZH[0],ZH[2]+'\n'+ZH[1]]});
 assert.deepEqual(M.lumps(rpg(JA,F.sjis)).map(l=>l.name),['game.gen','game.say']);
});

test('RPG Paper Maker: Content/Datas JSON string values in order',t=>{
 const tree=(L,root)=>writeTree(root,{'Content/Datas/langs.json':JSON.stringify({names:{1:'English',2:L[2]}}),'Content/Datas/Maps/MAP0001/objects.json':JSON.stringify({objs:[{msg:L[0]},{msg:L[1]}]})});
 const game=tree(JA,tmp(t));fs.writeFileSync(path.join(game,'Game.exe'),F.pe());const patch=tree(ZH,tmp(t));
 pairs(game,patch,{engine:'RPG Paper Maker',id:'rpgpaper',ja:[JA[2],JA[0],JA[1]],zh:[ZH[2],ZH[0],ZH[1]]});
});

test('recognised only: Bakin, Visionaire, Smile Game Builder, Unity Game Creator; plain exes are not F3 games',t=>{
 const cases=[[{'data.rbpack':'BKNPAK\0\x01','Game.exe':'MZ'},'RPG Developer Bakin'],[{'game.vis':'VIS3','game.exe':'MZ'},'Visionaire Studio'],[{'SharpKmyBase.dll':'MZ','Game.exe':'MZ'},'Smile Game Builder'],
  [{'Game.exe':'MZ','UnityPlayer.dll':'MZ','Game_Data/Managed/GameCreator.Runtime.Core.dll':'MZ'},'Unity (Game Creator)']];
 for(const [files,name] of cases)assert.equal(library.engineOf(writeTree(tmp(t),files))?.name,name);
 const plain=writeTree(tmp(t),{'game.exe':F.pe(Buffer.from('just some overlay bytes'))});assert.equal(M.probes.overlayKind(path.join(plain,'game.exe')),null);
 for(const id of Object.keys(M.ENGINES))assert.deepEqual(scenes.ENGINES[id].scenes(plain).filter(s=>scenes.ENGINES[id].parse(s.read()).lines.length),[],id);
});
