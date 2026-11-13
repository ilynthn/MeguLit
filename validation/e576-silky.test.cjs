'use strict';
/* E576 Silky's family (Silky Engine, AI6WIN, AI5WIN): archives and .mes scripts from synthetic files built per the spec */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const F={...require('./helpers/engine-fixtures.cjs'),...require('./helpers/engine-fixtures-a.cjs')};
const silky=require('../services/original-engines/silky.cjs'),scenes=require('../services/original-engines/scenes.cjs'),library=require('../core/library.cjs');
const tmp=t=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'e576-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};
const z=b=>Buffer.concat([b,Buffer.from([0])]),u32be=v=>{const b=Buffer.alloc(4);b.writeUInt32BE(v>>>0);return b;},u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v>>>0);return b;};
/* a .mes: header (silky: two counts, ai6: one), then code [op, operands] */
function mes(code,{hdr='ai6',enc=F.sjis}={}){const parts=[];
 for(const [op,...a] of code){parts.push(Buffer.from([op]));for(const x of a){if(typeof x==='string')parts.push(z(enc(x)));else if(Buffer.isBuffer(x))parts.push(z(x));else if(x&&x.be!==undefined)parts.push(u32be(x.be));else parts.push(Buffer.from([x]));}}
 const head=hdr==='silky'?Buffer.concat([u32(1),u32(0),u32(0)]):Buffer.concat([u32(1),u32(0)]);return Buffer.concat([head,...parts]);}
const ai6Code=(say,name,choice,enc)=>[[0x33,'bg01'],[0x18],[0x33,name],[0x0a,say],[0x19,{be:0}],[0x10,1],[0x36,2],[0x32,{be:5}],[0x34],[0x33,choice],[0x1a,{be:0}],[0x01]];
/* Silky's 0x0A packs hiragana: byte b < 0x81 is Shift-JIS 0x829E + b */
const packHira=s=>{const b=F.sjis(s),out=[];for(let i=0;i<b.length;i+=2){const code=b.readUInt16BE(i);if(code>=0x829f&&code<=0x82f1)out.push(code-0x829e);else out.push(b[i],b[i+1]);}return Buffer.from(out);};

test('.mes: AI6WIN v1 / v0 and Silky tables are told apart by walking the whole code; packed hiragana',()=>{
 const r=silky.parse(mes(ai6Code('「おはよう」と言った。','真琴','教室へ')));
 assert.deepEqual(r.lines,['真琴','「おはよう」と言った。','教室へ']);assert.deepEqual(r.anchors,['bg01']);
 /* AI6WIN v0: 0x10 and 0x36 take no operand */
 const v0=silky.parse(mes([[0x33,'名前'],[0x0a,'本文です'],[0x10],[0x36],[0x01]]));assert.deepEqual(v0.lines,['名前','本文です']);
 /* Silky: two header counts, 0x0A with packed hiragana, 0x1B with a u32 operand */
 const s=silky.parse(mes([[0x0a,packHira('あいうえお、漢字')],[0x1b,{be:3}],[0x0b,'通常の文'],[0x00]],{hdr:'silky'}));
 assert.deepEqual(s.lines,['あいうえお、漢字','通常の文']);
});
test('archives: AI6WIN (name cipher, big-endian sizes, LZSS), Silky .arc, IFL with CMP_, AI5WIN (keys recovered)',t=>{
 const d=tmp(t),ja=mes(ai6Code('「おはよう」と言った。','真琴','教室へ')),zh=mes(ai6Code('“早上好”他说。','真琴','去教室'),{enc:F.gbk});
 /* AI6WIN */
 const ai6=(files)=>{const names=Object.keys(files),idx=[],datas=[];let off=4+names.length*0x110;
  for(const n of names){const nb=Buffer.alloc(0x104),raw=F.sjis(n);let key=(raw.length+1)&255;for(let j=0;j<raw.length;j++){nb[j]=(raw[j]+key)&255;key=(key-1)&255;}const packed=F.lzssLiterals(files[n]);
   idx.push(nb,u32be(packed.length),u32be(files[n].length),u32be(off));datas.push(packed);off+=packed.length;}
  return Buffer.concat([u32(names.length),...idx,...datas]);};
 fs.writeFileSync(path.join(d,'mes.arc'),ai6({'a01.mes':ja,'a02.mes':mes([[0x0a,'二本目'],[0x01]])}));
 let a=silky.listAny(path.join(d,'mes.arc'));assert.equal(a.kind,'ai6');assert.equal(silky.readEntry(path.join(d,'mes.arc'),a.kind,a.list[0]).toString('hex'),ja.toString('hex'));
 /* Silky .arc */
 const sarc=files=>{const names=Object.keys(files),idx=[];let off=4+names.length*40;const datas=[];for(const n of names){const nb=Buffer.alloc(32);nb.write(n,'latin1');idx.push(nb,u32(off),u32(files[n].length));datas.push(files[n]);off+=files[n].length;}return Buffer.concat([u32(names.length),...idx,...datas]);};
 fs.writeFileSync(path.join(d,'s.arc'),sarc({'b01.mes':ja}));a=silky.listAny(path.join(d,'s.arc'));assert.equal(a.kind,'silky');assert.equal(a.list[0].name,'b01.mes');
 /* IFL */
 const cmp=Buffer.concat([Buffer.from('CMP_'),u32(ja.length),u32(0),F.lzssLiterals(ja)]),ifl=Buffer.concat([Buffer.from('IFLS'),u32(12+24),u32(1),Buffer.concat([Buffer.from('c01.mes'.padEnd(16,'\0'),'latin1'),u32(36),u32(cmp.length)]),cmp]);
 fs.writeFileSync(path.join(d,'m.ifl'),ifl);a=silky.listAny(path.join(d,'m.ifl'));assert.equal(a.kind,'ifl');assert.equal(silky.readEntry(path.join(d,'m.ifl'),a.kind,a.list[0]).toString('hex'),ja.toString('hex'));
 /* AI5WIN: names XOR k, size ^ a, offset ^ b */
 const ai5=files=>{const names=Object.keys(files),nl=0x14,k=0x5a,sa=0x11223344,ob=0x55667788,idx=[],datas=[];let off=4+names.length*(nl+8);
  for(const n of names){const nb=Buffer.alloc(nl);Buffer.from(n,'latin1').copy(nb);for(let i=0;i<nl;i++)nb[i]^=k;const packed=F.lzssLiterals(files[n]);idx.push(nb,u32(packed.length^sa),u32(off^ob));datas.push(packed);off+=packed.length;}
  return Buffer.concat([u32(names.length),...idx,...datas]);};
 fs.writeFileSync(path.join(d,'ai5.arc'),ai5({'d01.mes':Buffer.from('xx'),'d02.mes':F.sjis('「テストの文です」と言った。')}));a=silky.listAny(path.join(d,'ai5.arc'));
 assert.equal(a.kind,'ai5');assert.deepEqual(a.list.map(e=>e.name),['d01.mes','d02.mes']);
 assert.ok(silky.parse(silky.readEntry(path.join(d,'ai5.arc'),a.kind,a.list[1])).lines.includes('「テストの文です」と言った。'));
 /* a game folder and its GBK patch pair line by line */
 const game=tmp(t),patch=tmp(t);F.writeTree(game,{'mes.arc':ai6({'a01.mes':ja}),'AI6WIN.exe':'MZ'});F.writeTree(patch,{'a01.mes':zh});
 assert.equal(library.engineOf(game)?.name,"Silky's");assert.equal(scenes.detect(game),'silky');
 const own=scenes.read('silky',game)[0].lines,tr=scenes.ENGINES.silky.archives(patch).map(s=>silky.parse(s.read()))[0].lines;
 assert.equal(tr.length,own.length);assert.equal(tr[1],'“早上好”他说。');
});
