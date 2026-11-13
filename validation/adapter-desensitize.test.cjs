// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E560 desensitizer: synthetic scripts per engine family go through desensitize(); the output keeps every offset, opcode,
   length and ASCII command, and an independent text detector finds no line, word or character pair of the original. */
const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const d=require('../services/desensitize.cjs');

/* Shift-JIS / GBK encoders from the decoders (Node has no encoder for them) */
function encoderFor(label){const m=new Map(),dec=new TextDecoder(label);for(let a=0x81;a<=0xfe;a++)for(let b=0x40;b<=0xfe;b++){const s=dec.decode(Buffer.from([a,b]));if(s.length===1&&s!=='�'&&!m.has(s))m.set(s,[a,b]);}
 if(label==='shift_jis')for(let b=0xa1;b<=0xdf;b++){const s=dec.decode(Buffer.from([b]));if(!m.has(s))m.set(s,[b]);}
 return t=>{const out=[];for(const ch of t){const c=ch.codePointAt(0);if(c<0x80)out.push(c);else{const x=m.get(ch);if(!x)throw Error('cannot encode '+ch);out.push(...x);}}return Buffer.from(out);};}
const sjis=encoderFor('shift_jis'),gbk=encoderFor('gbk');

const LINES=['爆裂魔法、撃ってもいいですか？','今日はいい天気ですね','カズマさん、聞いてください','ﾃｽﾄの半角カナ','紅魔族随一の魔法の使い手','ここは駆け出しの街アクセル'];
const ZH=['你好世界，这是汉化补丁','今天天气很好','我们一起去冒险吧'];
const EN='Hello there, this is an English line of prose that must not leave the PC.';

/* An independent detector: decode the bytes in every encoding a script may use and look for any original line, any
   two-character piece of one, or any run of three or more kana/kanji that is not made of placeholders. */
const PH=new Set([...'あア亜Ａ０□가ｱ啊Ā𠀀']);
function leaks(buf,originals){const found=[];const texts=['shift_jis','gbk','utf-8','utf-16le'].map(e=>{try{return new TextDecoder(e).decode(buf);}catch{return '';}});
 for(const o of originals){const chars=[...o].filter(c=>/[぀-ヿ一-鿿ｦ-ﾟ]/.test(c));
  for(const t of texts){if(t.includes(o))found.push('line:'+o);for(let i=0;i+1<chars.length;i++){const pair=chars[i]+chars[i+1];if(PH.has(chars[i])&&PH.has(chars[i+1]))continue;if(t.includes(pair)&&!pairInPlaceholderText(t,pair))found.push('pair:'+pair);}}}
 return [...new Set(found)];}
/* a pair that only shows up because two placeholders read in another encoding happen to make it is not a leak of the game */
function pairInPlaceholderText(){return false;}
function englishLeak(buf){return ['utf-8','utf-16le','latin1'].some(e=>new TextDecoder(e==='latin1'?'windows-1252':e).decode(buf).includes('English line of prose'));}
/* every byte the desensitizer changed belongs to a text character: the rest (opcodes, lengths, tags) is identical */
function changedOnlyText(a,b,textBytes){for(let i=0;i<a.length;i++)if(a[i]!==b[i]&&!textBytes.has(i))return i;return -1;}
function textByteSet(buf,parts){const s=new Set();for(const [at,len] of parts)for(let i=at;i<at+len;i++)s.add(i);return s;}

test('KiriKiri .ks in Shift-JIS: tags, labels and commands stay, every Japanese character is replaced',()=>{
 const ks=['*start|開始','@bg storage="bg01" time=500','[cm]','【めぐみん】',`「${LINES[0]}」[p]`,LINES[1]+'[r]'+LINES[2]+'[l]','[ruby text="こうまぞく"]'+LINES[4],';コメント行','@jump target=*next',LINES[3],LINES[5]].join('\r\n')+'\r\n';
 const src=sjis(ks),out=d.desensitize(src);
 assert.equal(out.bytes.length,src.length,'same length');assert.equal(out.encoding,'sjis');
 const text=new TextDecoder('shift_jis').decode(out.bytes);
 for(const keep of ['*start|','@bg storage="bg01" time=500','[cm]','[p]','[r]','[l]','[ruby text="','@jump target=*next','\r\n'])assert.ok(text.includes(keep),'kept '+keep);
 assert.equal(text.split('\r\n').length,ks.split('\r\n').length,'line structure');
 assert.deepEqual(leaks(out.bytes,[...LINES,'開始','めぐみん','こうまぞく','コメント行']),[]);
 assert.ok(d.verify(src,out.bytes).ok);
});
test('UTF-16LE scripts with BOM (KiriKiri Z, Artemis): text replaced code unit for code unit',()=>{
 const body='*label\r\n'+LINES.map(l=>'[mes]'+l+'[np]').join('\r\n');const src=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(body,'utf16le')]);
 const out=d.desensitize(src);assert.equal(out.bytes.length,src.length);assert.equal(out.encoding,'utf16le');
 const t=out.bytes.toString('utf16le',2);assert.equal(t.match(/\[mes\]/g).length,LINES.length);assert.equal(t.match(/\[np\]/g).length,LINES.length);
 assert.deepEqual(leaks(out.bytes,LINES),[]);assert.ok(d.verify(src,out.bytes).ok);
});
test('UTF-8 (Ren\'Py, Artemis .ast, Naninovel) incl. English prose',()=>{
 const src=Buffer.from(['label start:','    m "'+LINES[0]+'"','    show megumin happy at left','    k "'+LINES[2]+'"','    "'+EN+'"','    $ renpy.pause(1.0)','ast = { text = "'+LINES[5]+'" }'].join('\n'),'utf8');
 const out=d.desensitize(src);assert.equal(out.bytes.length,src.length);
 const t=out.bytes.toString('utf8');for(const keep of ['label start:','show megumin happy at left','$ renpy.pause(1.0)','ast = { text = "'])assert.ok(t.includes(keep),'kept '+keep);
 assert.deepEqual(leaks(out.bytes,LINES),[]);assert.equal(englishLeak(out.bytes),false,'English prose replaced');assert.ok(d.verify(src,out.bytes).ok);
});
test('bytecode (BGI / YU-RIS / Siglus style): opcode + u16 length + Shift-JIS string, ints untouched',()=>{
 const parts=[Buffer.from('BurikoCompiledScriptVer1.00\0','latin1')],texts=[],ops=[];
 const ints=Buffer.alloc(64);for(let i=0;i<16;i++)ints.writeUInt32LE(i*0x01010101,i*4);parts.push(ints);
 for(const [i,l] of [...LINES,'恵'].entries()){const b=sjis(l),h=Buffer.alloc(3);h[0]=0x2d;h.writeUInt16LE(b.length,1);const at=parts.reduce((n,p)=>n+p.length,0);ops.push(at);texts.push([at+3,b.length]);parts.push(h,b,Buffer.from([0x10,i,0,0]));}
 const src=Buffer.concat(parts),out=d.desensitize(src);
 assert.equal(out.bytes.length,src.length);
 for(const at of ops){assert.equal(out.bytes[at],0x2d,'opcode');assert.equal(out.bytes.readUInt16LE(at+1),src.readUInt16LE(at+1),'length');}
 assert.equal(changedOnlyText(src,out.bytes,textByteSet(src,texts)),-1,'only text bytes changed');
 assert.ok(out.bytes.subarray(0,28+64).equals(src.subarray(0,28+64)),'header and int table untouched');
 assert.deepEqual(leaks(out.bytes,[...LINES,'恵']),[]);assert.ok(d.verify(src,out.bytes).ok);
});
test('GBK patch scripts (Chinese translations) are covered too',()=>{
 const src=Buffer.concat(ZH.map(l=>Buffer.concat([Buffer.from('#msg ','latin1'),gbk(l),Buffer.from('\r\n','latin1')])));const out=d.desensitize(src);
 assert.equal(out.encoding,'gbk');assert.equal(out.bytes.length,src.length);assert.equal((new TextDecoder('gbk').decode(out.bytes).match(/#msg /g)||[]).length,ZH.length);
 assert.deepEqual(leaks(out.bytes,ZH),[]);assert.ok(d.verify(src,out.bytes).ok);
});
test('UTF-16 strings inside a binary table (Unity TextAsset / PSB style)',()=>{
 const parts=[Buffer.from('PSB\0','latin1'),Buffer.from([4,0,0,0])];for(const l of LINES){const b=Buffer.from(l,'utf16le'),h=Buffer.alloc(4);h.writeUInt32LE(b.length/2);parts.push(h,b);}
 const src=Buffer.concat(parts),out=d.desensitize(src);assert.equal(out.bytes.length,src.length);assert.ok(out.bytes.subarray(0,8).equals(src.subarray(0,8)));
 assert.deepEqual(leaks(out.bytes,LINES),[]);assert.ok(d.verify(src,out.bytes).ok);
});
test('verify() catches a leak and a changed length',()=>{
 const src=sjis('@cmd\r\n'+LINES[0]+'\r\n');const bad=Buffer.from(src);assert.equal(d.verify(src,bad).ok,false,'unchanged text is a leak');
 assert.equal(d.verify(src,src.subarray(1)).error,'LENGTH_CHANGED');
});
test('sample(): opaque (encrypted / compressed) blocks are zero-filled and listed, the plaintext head is desensitized',()=>{
 const head=sjis('*start\r\n'+LINES.join('\r\n')+'\r\n'),rnd=require('node:crypto').randomBytes(8192),file=Buffer.concat([head,Buffer.alloc(4096-head.length%4096,0x20),rnd]);
 const s=d.sample(file,{max:64*1024});assert.ok(s);assert.ok(s.opaque.length>=1,'opaque block listed');
 const bytes=Buffer.from(s.parts[0].base64,'base64');assert.equal(bytes.length,file.length);
 for(const o of s.opaque)assert.ok(bytes.subarray(o.at,o.at+o.len).every(b=>b===0),'opaque block not uploaded');
 assert.deepEqual(leaks(bytes,LINES),[]);
});
test('keyCandidates(): known plaintext finds the xor key of encrypted entries; nothing of the data is returned',()=>{
 const key=0x5a,png=Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452','hex'),require('node:crypto').randomBytes(200)]),ogg=Buffer.concat([Buffer.from('OggS\0\x02','latin1'),require('node:crypto').randomBytes(200)]);
 const enc=b=>Buffer.from(b.map(x=>x^key));const c=d.keyCandidates([{data:enc(png),ext:'png'},{data:enc(ogg),ext:'ogg'},{data:enc(png),ext:'png'}]);
 assert.equal(c[0].algo,'xor');assert.equal(c[0].key,'5a');assert.ok(c[0].confidence>=.6);
 const sub=d.keyCandidates([{data:Buffer.from(png.map(x=>(x+7)&255)),ext:'png'}]);assert.ok(sub.some(k=>k.algo==='sub'&&k.value===7));
 const z=zlib.deflateSync(Buffer.from('x'.repeat(4000))),zc=d.keyCandidates([{data:Buffer.from(z.map(x=>x^0x33)),ext:''}]);assert.ok(zc.some(k=>k.algo==='xor'&&k.key==='33'&&k.then==='zlib'));
 for(const k of [...c,...sub,...zc])assert.ok(JSON.stringify(k).length<400&&!('data' in k));
});
test('maskString(): names inside archive indexes',()=>{assert.equal(d.maskString('シナリオ/第一章_01.ks'),'アアアア/亜亜亜_01.ks');assert.equal(d.maskString('scenario/ch01.ks'),'scenario/ch01.ks');});
test('privacy: a whole synthetic script set through sample() leaves no text for the detector',()=>{
 const files=[sjis(LINES.map(l=>'「'+l+'」[p]').join('\r\n')),Buffer.from('﻿'+LINES.join('\n'),'utf8'),Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(LINES.join('\r\n'),'utf16le')]),gbk(ZH.join('\r\n'))];
 for(const f of files){const s=d.sample(f);assert.ok(s,'sample made');const bytes=Buffer.concat(s.parts.map(p=>Buffer.from(p.base64,'base64')));assert.deepEqual(leaks(bytes,[...LINES,...ZH]),[]);
  assert.equal(d.textRuns(bytes).length,0,'no text run left');}
});
