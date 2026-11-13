// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// services/runtime-dump.cjs against a dump folder laid out the way MeguLitDump32/64.dll writes it (the native side has its
// own self-test: native/runtimedump/selftest/run.ps1). No game is involved.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');

function setup(){const base=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-rtdump-'));process.env.MEGULIT_RUNTIME_DUMP=path.join(base,'dump');
 const game=path.join(base,'Game Folder');fs.mkdirSync(game);delete require.cache[require.resolve('../services/runtime-dump.cjs')];
 return{base,game,rd:require('../services/runtime-dump.cjs')};}
const sjis=s=>{/* Shift-JIS for the characters used below */const map={'【':[0x81,0x79],'】':[0x81,0x7a],'「':[0x81,0x75],'」':[0x81,0x76],'め':[0x82,0xdf],'ぐ':[0x82,0xae],'み':[0x82,0xdd],'ん':[0x82,0xf1],'爆':[0x94,0x9a],'裂':[0x97,0xf4],'！':[0x81,0x49]};
 return Buffer.from([...s].flatMap(c=>map[c]||[c.charCodeAt(0)]));};
function write(rd,game,items){const d=rd.enable(game);fs.writeFileSync(path.join(d,'game.txt'),game);
 const lines=items.map((it,i)=>{const file=`${String(i+1).padStart(5,"0")}_${path.basename(it.source.replace(/\\/g,"/"))}_${it.how}.bin`;fs.writeFileSync(path.join(d,file),it.data);
  return JSON.stringify({seq:i+1,file,source:it.source,how:it.how,offset:it.offset||0,size:it.data.length,enc:it.enc});});
 fs.writeFileSync(path.join(d,'index.jsonl'),lines.join('\n')+'\n');return d;}

test('key matches the DLL (FNV-1a of the lower-case folder) and the dump is on by default and disable/enable toggle the off file',()=>{
 const{game,rd}=setup();assert.match(rd.key(game),/^[0-9a-f]{8}$/);assert.equal(rd.key(game),rd.key(game.toUpperCase()));
 assert.equal(rd.enabled(game),true);rd.disable(game);assert.equal(rd.enabled(game),false);rd.enable(game);assert.equal(rd.enabled(game),true);});

test('decrypted copies win over the cipher text read as plain; languages and lines come out',()=>{
 const{game,rd}=setup();
 const ja=Buffer.concat([sjis('【めぐみん】「爆裂！」'),Buffer.from([0,1,2]),sjis('「めぐみん」'),Buffer.from('\r\n')]);
 const zh=Buffer.from('「吾名惠惠！」\n红魔族第一的魔法师\n\u0000\u0007无关\n','utf8');
 write(rd,game,[
  {source:'scene.dat',how:'plain',enc:'gbk',data:Buffer.from([0xc4,0xe3,0xba,0xc3,0xc4,0xe3,0xba,0xc3])},
  {source:'scene.dat',how:'inplace',enc:'shift_jis',data:ja},
  {source:'menou.chs',how:'alloc',enc:'utf-8',data:zh},
  {source:'menou.chs',how:'alloc',enc:'utf-8',data:Buffer.from('「短」\n','utf8')},
  {source:'loose.txt',how:'plain',enc:'utf-8',data:Buffer.from('普通的文本行\n','utf8')}]);
 const docs=rd.collect(game);
 assert.deepEqual(docs.map(d=>[d.source,d.how,d.lang]),[['scene.dat','inplace','ja'],['menou.chs','alloc','zh'],['loose.txt','plain','zh']]);
 assert.deepEqual(docs[0].lines,['【めぐみん】「爆裂！」','「めぐみん」']);
 assert.deepEqual(docs[1].lines,['「吾名惠惠！」','红魔族第一的魔法师','无关']);
 const c=rd.corpus(game);assert.equal(c.ja.length,2);assert.equal(c.zh.length,4);});

test('exportTexts writes UTF-8 files named after their sources',()=>{
 const{base,game,rd}=setup();
 write(rd,game,[{source:'C:\\g\\data\\menou.chs',how:'inflate',enc:'utf-16le',data:Buffer.from('\ufeff「你好」\r\n','utf16le')}]);
 const files=rd.exportTexts(game,path.join(base,'out'));
 assert.deepEqual(files.map(f=>path.basename(f)),['menou.chs.inflate.zh.txt']);
 assert.equal(fs.readFileSync(files[0],'utf8'),'「你好」\r\n');});

test('the game folder is also found through game.txt when the key differs',()=>{
 const{game,rd}=setup();const other=path.join(process.env.MEGULIT_RUNTIME_DUMP,'deadbeef');fs.mkdirSync(other,{recursive:true});
 fs.writeFileSync(path.join(other,'game.txt'),game.toUpperCase());assert.equal(rd.dirFor(game),other);});

// When the native self-test has run on this machine, its real output must read back too.
test('native self-test output (if present) reads back as Japanese and Chinese',{skip:!fs.existsSync('H:\\MeguLit-Work\\runtime-dump-selftest\\out64')},()=>{
 process.env.MEGULIT_RUNTIME_DUMP='H:\\MeguLit-Work\\runtime-dump-selftest\\out64';delete require.cache[require.resolve('../services/runtime-dump.cjs')];
 const rd=require('../services/runtime-dump.cjs'),c=rd.corpus('H:\\MeguLit-Work\\runtime-dump-selftest\\game64');
 assert.ok(c.ja.some(l=>l.includes('めぐみん')),'Japanese line');assert.ok(c.zh.some(l=>l.includes('惠惠')),'Chinese line');});
