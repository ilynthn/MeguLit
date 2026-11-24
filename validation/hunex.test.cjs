// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E304/E305 (WITCH ON THE HOLY NIGHT, Steam): HuneX text tables in HFA archives are read (LenZu), line i of the Japanese
// table gets line i of the release's Simplified Chinese at once, and the hook's <r reading>base</r> ruby is the game's own.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const hunex=require('../services/original-engines/hunex.cjs'),scenes=require('../services/original-engines/scenes.cjs'),ot=require('../services/original-text.cjs');
const {extractSourceRuby}=require('../core/source-ruby.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-hunex-'));
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));

// A LenZu stream whose Huffman table has one symbol (127, code "1"): literal runs of 128 bytes, and back-references of
// 129 bytes from 129 back (length and distance are 127 + base 2, no low bits).
function lenzu(data,{repeatFrom=-1}={}){
 const bits=[],push=(v,n)=>{for(let k=n-1;k>=0;k--)bits.push((v>>k)&1);};
 for(let o=0;o<data.length;){
  if(o===repeatFrom){push(1,1);push(1,1);push(1,1);o+=129;continue;}
  push(0,1);push(1,1);for(let k=0;k<128;k++)push(data[o+k]||0,8);o+=128;
 }
 const body=Buffer.alloc(Math.ceil(bits.length/8));bits.forEach((b,i)=>{if(b)body[i>>3]|=0x80>>(i&7);});
 const head=Buffer.alloc(0x30);head.write('LenZuCompressor\0',0,'latin1');head.write('1',16,'latin1');head.write('0',20,'latin1');head.writeUInt32LE(data.length,0x20);
 return Buffer.concat([head,Buffer.from([6,7,7,14,0,2]),Buffer.from([1,127,1,0,0,0]),body]);
}
function hfa(entries){const n=entries.length,index=Buffer.alloc(n*0x80);let at=0;const datas=[];
 entries.forEach(([name,data],i)=>{index.write(name,i*0x80,'utf8');index.writeUInt32LE(at,i*0x80+0x60);index.writeUInt32LE(data.length,i*0x80+0x64);datas.push(data);at+=data.length;});
 const head=Buffer.alloc(16);head.write('HUNEXGGEFA10',0,'latin1');head.writeUInt32LE(n,12);return Buffer.concat([head,index,...datas]);}

test('LenZu: literal runs and an overlapping back-reference come back exactly',()=>{
 const plain=Buffer.alloc(128*3+129);for(let i=0;i<128*3;i++)plain[i]=(i*7)&255;
 for(let i=0;i<129;i++)plain[128*3+i]=plain[128*3+i-129];
 assert.deepStrictEqual(hunex.lenzu(lenzu(plain,{repeatFrom:128*3})),plain);
 assert.throws(()=>hunex.lenzu(Buffer.from('not a lenzu stream, not at all......................................')),/LENZU_MAGIC/);
});

const ja=['　その子の影になったのは８年前の冬のこと。','　彼女がはじめて命に<触|ふ>れた、<厳|しず>かな朝の出来事だ。','　彼女の家は山の<中腹|ちゅうふく>にあった。','@o「げぇぇぇ!!!?　生徒^会まじ横暴ー！」'];
const zc=['　变成她的影子，那已经是8年前的冬天的事情了。','　那个寂静的早晨，她第一次触摸到了生命。','　她的家在山腰上。','“学生会太霸道了！”'];
function game(name){const dir=path.join(tmp,name);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'data00000.hfa'),hfa([['image.cbg',Buffer.from('x')]]));
 fs.writeFileSync(path.join(dir,'data00200.hfa'),hfa([['script_text_ja.ctd',lenzu(Buffer.from(ja.join('\r\n'),'utf8'))],['script_text_zc.ctd',lenzu(Buffer.from(zc.join('\r\n'),'utf8'))]]));
 fs.writeFileSync(path.join(dir,'WoH.exe'),'');return dir;}

test('the text tables are found in any archive and line up line for line, markup removed, ruby kept',()=>{
 const dir=game('read');
 assert.strictEqual(scenes.detect(dir),'hunex');
 const [scene]=scenes.read('hunex',dir);
 assert.deepStrictEqual(scene.lines,['　その子の影になったのは８年前の冬のこと。','　彼女がはじめて命に触れた、厳かな朝の出来事だ。','　彼女の家は山の中腹にあった。','「げぇぇぇ!!!?　生徒会まじ横暴ー！」']);
 assert.strictEqual(scene.zh[2],'　她的家在山腰上。');
 assert.deepStrictEqual(scene.ruby[1],[['触','ふ'],['厳','しず']]);
});

test('Japanese game: each line gets the release\'s own Chinese at once',()=>{
 const root=path.join(tmp,'root'),dir=game('live'),exe=path.join(dir,'WoH.exe'),id='woh';
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
 const state=ot.scanRunning(root,id,exe);assert.strictEqual(state.engine,'hunex');assert.strictEqual(state.status,'native-japanese');
 assert.strictEqual(ot.importPatch(root,null,id,dir,{auto:true,executable:exe}).patchStatus,'ready');
 const p=ot.provider(root,exe);
 // What the hook delivers: the line without the leading space, with the game's own ruby markup.
 const hooked=extractSourceRuby('彼女の家は山の<rちゅうふく>中腹</r>にあった。');
 assert.deepStrictEqual(hooked.ruby,[['中腹','ちゅうふく']]);
 const r=p.resolve(hooked.text);
 assert.strictEqual(r.translation,'　她的家在山腰上。');
 assert.deepStrictEqual(r.ruby,[['中腹','ちゅうふく']]);
});

test('hook text: HuneX <r reading>base</r> ruby becomes the game reading and leaves no markup',()=>{
 const r=extractSourceRuby('彼女がはじめて命に<rふ>触</r>れた、<rしず>厳</r>かな朝の出来事だ。');
 assert.strictEqual(r.text,'彼女がはじめて命に触れた、厳かな朝の出来事だ。');
 assert.deepStrictEqual(r.ruby,[['触','ふ'],['厳','しず']]);
});

test('HFA page and glyph caches follow additions, same-size rewrites and removals',t=>{
 const dir=path.join(tmp,'hfa-cache'),file=path.join(dir,'data.hfa');
 fs.mkdirSync(dir);
 const archive=(line,firstCode)=>{
  const script=Buffer.alloc(0xd0),op=0x30,text=0xb0;
  script.write('HunexCompiledScriptVer1.00',0,'latin1');
  script.writeUInt32LE(123,op);script.writeUInt32LE(0x12345678,op+4);
  script.writeUInt32LE(text-0x30,op+12);script.write('$'+String(line).padStart(6,'0'),text,'latin1');
  const ccit=Buffer.alloc(8+100*8);ccit.writeUInt32LE(100,0);ccit.writeUInt32LE(8,4);
  for(let i=0;i<100;i++){
   const bytes=Buffer.from(String.fromCodePoint(firstCode+i),'utf8');
   ccit.writeUInt32LE(bytes.readUIntBE(0,bytes.length),8+8*i);
  }
  return hfa([['scene.chs',lenzu(script)],['Font000001.ccit',lenzu(ccit)]]);
 };
 let opens=0;const open=fs.openSync;
 t.mock.method(fs,'openSync',(f,flags,...args)=>{if(f===file&&flags==='r')opens++;return open(f,flags,...args);});
 const read=()=>({pages:hunex.pages(dir),glyphs:hunex.glyphs(dir)});
 assert.deepStrictEqual(read(),{pages:null,glyphs:null});assert.equal(opens,0);

 const first=archive(8,0x4e00),second=archive(9,0x5000);
 assert.equal(first.length,second.length);
 const time=new Date('2020-01-01T00:00:00Z');
 fs.writeFileSync(file,first);fs.utimesSync(file,time,time);
 const loaded=read(),added=opens;
 assert.ok(added>0);assert.deepStrictEqual([...loaded.pages.known],[8]);
 assert.equal(loaded.glyphs.size,100);assert.ok(loaded.glyphs.has('一'));
 assert.strictEqual(hunex.pages(dir),loaded.pages);assert.strictEqual(hunex.glyphs(dir),loaded.glyphs);
 assert.equal(opens,added);

 const later=new Date('2020-01-01T00:00:02Z');
 fs.writeFileSync(file,second);fs.utimesSync(file,later,later);
 const replaced=read(),afterRewrite=opens;
 assert.ok(afterRewrite>added);assert.deepStrictEqual([...replaced.pages.known],[9]);
 assert.ok(replaced.glyphs.has(String.fromCodePoint(0x5000)));assert.ok(!replaced.glyphs.has('一'));
 assert.strictEqual(hunex.pages(dir),replaced.pages);assert.strictEqual(hunex.glyphs(dir),replaced.glyphs);
 assert.equal(opens,afterRewrite);
 fs.unlinkSync(file);
 assert.deepStrictEqual(read(),{pages:null,glyphs:null});assert.equal(opens,afterRewrite);
});

test('local WITCH ON THE HOLY NIGHT tables, when installed',{skip:!fs.existsSync('E:/Steam/steamapps/common/WITCH ON THE HOLY NIGHT/data00200.hfa')&&'environment: WITCH ON THE HOLY NIGHT not installed'},()=>{
 const [scene]=scenes.read('hunex','E:/Steam/steamapps/common/WITCH ON THE HOLY NIGHT');
 assert.ok(scene.lines.length>20000);assert.strictEqual(scene.lines.length,scene.zh.length);
 assert.ok(scene.lines.includes('　彼女の家は山の中腹にあった。'));assert.strictEqual(scene.zh[scene.lines.indexOf('　彼女の家は山の中腹にあった。')],'　她的家在山腰上。');
 assert.ok(!scene.lines.some(t=>/<[^>]*\|/.test(t)));
});
