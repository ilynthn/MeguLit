// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E503 engine font readers for Unity / MAGES / Ren'Py (engines that draw without Windows, so the E498 probe sees nothing).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const root=path.join(__dirname,'..');
const scanner=require('../core/engine-font-scan.cjs'),ef=require('../core/engine-font.cjs'),{collectionFaces}=require('../core/game-fonts.cjs');
const JP=['C:/Windows/Fonts/msgothic.ttc','C:/Windows/Fonts/msmincho.ttc','C:/Windows/Fonts/YuGothR.ttc'].find(f=>fs.existsSync(f));
const jpFace=()=>collectionFaces(fs.readFileSync(JP))[0];
const tmp=n=>fs.mkdtempSync(path.join(os.tmpdir(),'efs-'+n+'-'));

test('Unity: a Font object (length-prefixed m_FontData) inside sharedassets is found, exported and named',{skip:!JP},()=>{
 const game=tmp('unity'),data=path.join(game,'Demo_Data');fs.mkdirSync(data);fs.writeFileSync(path.join(data,'globalgamemanagers'),'x');
 const font=jpFace(),len=Buffer.alloc(4);len.writeUInt32LE(font.length);
 fs.writeFileSync(path.join(data,'sharedassets0.assets'),Buffer.concat([Buffer.alloc(4099,7),len,font,Buffer.alloc(3,0),Buffer.from('tail')]));
 const r=scanner.scan(game,path.join(game,'cache'));
 assert.equal(r.engine,'unity');assert.ok(r.face,'face named');assert.equal(r.files.length,1);
 assert.deepEqual(fs.readFileSync(r.files[0]),font,'exported byte for byte');assert.match(path.basename(r.files[0]),/\.jp\.(ttf|otf)$/);
});

test('Unity scoring: Japanese text font beats KR/SC localisation fonts and decorative faces',()=>{
 const big={kana:180,kanji:20000},s=n=>scanner.score([n],big);
 assert.equal(s('Source Han Sans K Medium'),null);assert.equal(s('Noto Sans CJK KR Regular'),null);assert.equal(s('方正仿宋简体'),null);
 assert.ok(s('Noto Sans CJK JP Regular')>s('syunka2'));assert.ok(s('FOT-筑紫明朝 Pr6N B')>s('PixelMplus10'));assert.ok(s('syunka2')>s('851手書き雑フォント'));
 assert.equal(scanner.score(['Latin Only'],{kana:0,kanji:0}),null);
 assert.deepEqual(scanner.sdfNames(Buffer.from('\x10\0\0\0NotoSansCJKjp-Regular SDF\0\0')),['NotoSansCJKjp-Regular']);
});

test('MAGES: atlas stroke ratio threshold, pick maps the family to the MS face, PNG decoder',()=>{
 /* the ratio is empirical (GDI renders, E503): mincho 1.15-1.84, gothic 0.58-0.77; STEINS;GATE FONT.PNG 0.78 */
 assert.equal(scanner.atlasFamily({ratio:1.3}),'mincho');assert.equal(scanner.atlasFamily({ratio:0.78}),'gothic');
 assert.equal(ef.pick({family:'gothic'}).key,'originalGothic');assert.equal(ef.pick({family:'mincho'}).key,'originalMincho');assert.equal(ef.pick({}),null);
 assert.ok(ef.rank({scanned:true})>ef.rank({probe:true})&&ef.rank({scanned:true})<ef.rank({}),'scan between probe and live engine report');
 /* PNG decoder: a 2x1 grey PNG */
 const raw=Buffer.from([0,0,255]),chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);return Buffer.concat([l,Buffer.from(t),d,Buffer.alloc(4)]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(2,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=0;
 const img=scanner.png(Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
 assert.equal(img.w,2);assert.equal(img.ink.length,2);
});

/* pickle protocol 2 of {name: [(offset, length, prefix)]} as Ren'Py writes the RPA-3.0 index */
function pickleIndex(entries){const parts=[Buffer.from([0x80,2,0x7d,0x28])];const u=s=>{const b=Buffer.from(s,'utf8'),l=Buffer.alloc(4);l.writeUInt32LE(b.length);return Buffer.concat([Buffer.from([0x58]),l,b]);};const i=n=>{const b=Buffer.alloc(5);b[0]=0x4a;b.writeInt32LE(n|0,1);return b;};
 for(const [name,off,len] of entries)parts.push(u(name),Buffer.from([0x5d]),i(off),i(len),Buffer.from([0x43,0,0x87,0x61]));/* value: EMPTY_LIST, (off, len, b'') TUPLE3, APPEND */
 return Buffer.concat([...parts,Buffer.from([0x75,0x2e])]);}

test('Ren\'Py: gui.text_font in a loose gui.rpy and in an .rpa archive picks the Japanese font file',{skip:!JP},()=>{
 const font=jpFace();
 const loose=tmp('renpy');fs.mkdirSync(path.join(loose,'game','fonts'),{recursive:true});fs.mkdirSync(path.join(loose,'renpy'));
 fs.writeFileSync(path.join(loose,'game','gui.rpy'),'define gui.text_font = "fonts/jp.ttf"\ndefine gui.name_text_font = "DejaVuSans.ttf"\n');fs.writeFileSync(path.join(loose,'game','fonts','jp.ttf'),font);
 const a=scanner.scan(loose,path.join(loose,'cache'));assert.equal(a.engine,'renpy');assert.match(a.reason,/text_font = fonts\/jp\.ttf/);assert.deepEqual(fs.readFileSync(a.files[0]),font);
 const arch=tmp('rpa');fs.mkdirSync(path.join(arch,'game'),{recursive:true});fs.mkdirSync(path.join(arch,'renpy'));
 const key=0x42424242,gui=Buffer.from('define gui.text_font = "SourceJP.ttf"\n'),head=Buffer.alloc(34,0x20),body=Buffer.concat([gui,font]);
 const idx=zlib.deflateSync(pickleIndex([['gui.rpy',(34^key)>>>0,(gui.length^key)>>>0],['SourceJP.ttf',((34+gui.length)^key)>>>0,(font.length^key)>>>0]]));
 const at=34+body.length;Buffer.from('RPA-3.0 '+at.toString(16).padStart(16,'0')+' '+key.toString(16)+'\n').copy(head);
 fs.writeFileSync(path.join(arch,'game','archive.rpa'),Buffer.concat([head,body,idx]));
 const b=scanner.scan(arch,path.join(arch,'cache'));assert.equal(b.engine,'renpy');assert.equal(b.files.length,1);assert.deepEqual(fs.readFileSync(b.files[0]),font);
 assert.deepEqual(scanner.fontsInScript('style.default.font = "a.otf"'),[{key:'default_font',file:'a.otf'}]);
});

test('reader wiring: scan after the folder font scan, scanned hookFont carries family to pick',()=>{
 const src=fs.readFileSync(path.join(root,'services','reader.cjs'),'utf8');
 assert.match(src,/fonts\.detect\(pid\)\.then\(\(\)=>this\.engineFontScan\(pid\)\)/);assert.match(src,/scanned:true/);assert.match(src,/family:message\.family/);
 assert.match(fs.readFileSync(path.join(root,'core','engine-font-scan.cjs'),'utf8'),/new Worker\(__filename/);
});
