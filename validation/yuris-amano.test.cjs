'use strict';
// E333/E334 YU-RIS: euphoria's Chinese patches (萌你妹: euphoria_sc.exe + .dll + .pack, an AES "Amano" pack) as the translation.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const yuris=require('../services/original-engines/yuris.cjs');

function encoder(label){const dec=new TextDecoder(label),map=new Map();
 for(let a=0x81;a<=0xfe;a++)for(let b=0x40;b<=0xfe;b++){const ch=dec.decode(Buffer.from([a,b]));if(ch.length===1&&ch!=='\ufffd'&&!map.has(ch))map.set(ch,Buffer.from([a,b]));}
 return t=>Buffer.concat(Array.from(t,ch=>ch.charCodeAt(0)<0x80?Buffer.from(ch,'latin1'):map.get(ch)));}
const sjis=encoder('shift_jis'),gbk=encoder('gbk');
const KEY=[0xd3,0x6f,0xac,0x96];
// A YSTB as in yuris-scenes.test.cjs; `id` is the argument id (non-zero ids hide the key's low byte from a byte count).
function ystb(lines,id=0){const code=[],args=[],res=[];let off=0;
 const arg=(type,data)=>{const a=Buffer.alloc(12);a.writeUInt16LE(id,0);a.writeUInt16LE(type,2);a.writeUInt32LE(data.length,4);a.writeUInt32LE(off,8);off+=data.length;args.push(a);res.push(data);};
 lines.forEach((t,i)=>{code.push(Buffer.from([29,1,0,0]));arg(3,Buffer.from('M\x08\x00"es.SND"V'+i,'latin1'));code.push(Buffer.from([91,1,0,0]));arg(0,t);});
 const segs=[Buffer.concat(code),Buffer.concat(args),Buffer.concat(res),Buffer.alloc(code.length*4)].map(s=>{const x=Buffer.from(s);for(let i=0;i<x.length;i++)x[i]^=KEY[i&3];return x;});
 const head=Buffer.alloc(32);head.write('YSTB',0,'latin1');head.writeUInt32LE(0x1c2,4);head.writeUInt32LE(code.length,8);segs.forEach((s,k)=>head.writeUInt32LE(s.length,12+k*4));
 return Buffer.concat([head,...segs]);}
function ypf(files){const entries=[],datas=[];let index=0;
 for(const [name] of files)index+=4+1+name.length+18;let off=32+index;
 for(const [name,data] of files){const packed=zlib.deflateSync(data),n=Buffer.from(name,'latin1'),e=Buffer.alloc(4+1+n.length+18);
  e[4]=n.length^0xff;n.forEach((c,i)=>{e[5+i]=c^0xff;});let p=5+n.length;e[p+1]=1;e.writeUInt32LE(data.length,p+2);e.writeUInt32LE(packed.length,p+6);e.writeUInt32LE(off,p+10);off+=packed.length;entries.push(e);datas.push(packed);}
 const head=Buffer.alloc(32);head.write('YPF\0',0,'latin1');head.writeUInt32LE(450,4);head.writeUInt32LE(files.length,8);head.writeUInt32LE(index,12);
 return Buffer.concat([head,...entries,...datas]);}
// ---- Amano pack writer (the format yuris.cjs reads; see the E330 comment there) ----
const sha=b=>{const d=crypto.createHash('sha256').update(b).digest(),h=Buffer.alloc(32);for(let i=0;i<8;i++)h.writeUInt32LE(d.readUInt32BE(i*4),i*4);return h;};
const enc=(key,iv,b)=>crypto.createCipheriv('aes-128-cfb',key,iv).update(b);
const rol13=x=>((x<<13)|(x>>>19))>>>0;
// A dll whose first section is named `section` (the pack key's source).
function dll(section){const b=Buffer.alloc(0x200);b.write('MZ',0,'latin1');b.writeUInt32LE(0x40,0x3c);b.write('PE\0\0',0x40,'latin1');b.writeUInt16LE(0xe0,0x40+20);b.write(section,0x40+24+0xe0,'latin1');return b;}
// files: [name, data, header?] — with a header the file is an SPCM record (stored), else raw.
function pack(section,files){const k=sha(Buffer.from(section,'latin1')),recs=[],bodies=[];let off=0x18;
 for(const [name,data,spcm] of files){const h=sha(Buffer.from(name,'latin1'));let plain=data;
  if(spcm){const hd=Buffer.alloc(0x1c);hd.write('SPCM',0,'latin1');hd.writeUInt32LE(1,8);hd.writeUInt32LE(data.length,12);hd.writeUInt32LE(data.length,20);plain=Buffer.concat([hd,data]);}
  const body=enc(h.subarray(16,32),h.subarray(0,16),plain),rec=Buffer.alloc(32);
  for(let i=0;i<4;i++)rec.writeUInt32LE((h.readUInt32LE(i*4)^h.readUInt32LE(16+i*4))>>>0,i*4);
  [off,0,plain.length,spcm?1:0].forEach((v,i)=>rec.writeUInt32LE((v^rol13(rec.readUInt32LE(i*4)))>>>0,16+i*4));
  recs.push(rec);bodies.push(body);off+=body.length;}
 recs.sort((a,b)=>Buffer.compare(a.subarray(0,16),b.subarray(0,16)));
 const head=Buffer.alloc(0x18);head.write('FUCK',0,'latin1');head.writeUInt32LE(0x18,4);head.writeBigUInt64LE(BigInt(off),8);head.writeUInt32LE(recs.length*32,16);
 return Buffer.concat([enc(k.subarray(0,16),k.subarray(16,32),head),...bodies,...recs]);}
function put(dir,files){for(const [rel,data] of Object.entries(files)){const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);}}
async function patchFor(game,exe){
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');
 db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',path.join(game,exe));
 const ot=require('../services/original-text.cjs'),data=path.join(path.dirname(game),'data'),r=await ot.autoPatch(data,db,'1',{drives:false,force:true});
 return {r,ot,data,exe:path.join(game,exe)};}

test('YU-RIS: the Chinese scenes in an Amano pack next to the game are its translation',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'yuris-a-')),game=path.join(base,'game');
 const ja=['ここは…どこだ。','何もない部屋だ。白い。','梨香「名前…」','……名前？','だらりと両手を垂れさげる。','いつもの『声』が響く。'];
 const ja2=['あしたもはれるといいな。','そうだね。'],zh2=['明天也晴天就好了。','是啊。'];
 const zh=['这里…是哪里？','什么都没有的，纯白的房间。','梨香「名字…」','……名字？','耷拉着垂下双手。','一如既往的『声音』响起了。'];
 put(game,{'game.exe':'exe','pac/bn.ypf':ypf([['ysbin\\yst00000.ybn',ystb([])],['ysbin\\yst00100.ybn',ystb(ja.map(sjis))],['ysbin\\yst00101.ybn',ystb(ja2.map(sjis))]]),
  'game_sc.dll':dll('.Test\0\0\0'),'game_sc.pack':pack('.Test\0\0\0',[['ysbin\\yst00100.ybn',ystb(zh.map(gbk)),true],['ysbin\\yst00101.ybn',ystb(zh2.map(gbk)),false],['cg\\a.png',Buffer.from('png'),true]])});
 const list=yuris.patchLines(yuris.scenes(game).map(s=>({name:s.name,...yuris.parse(s.read())})),{dirs:[game]});
 assert.deepStrictEqual(list.map(s=>s.patched),[true,true]);assert.deepStrictEqual(list[0].lines,zh);assert.deepStrictEqual(list[1].lines,zh2,'a raw (headerless) entry');
 const {r,ot,data,exe}=await patchFor(game,'game.exe');assert.ok(r.found,JSON.stringify(r));
 assert.strictEqual(ot.provider(data,exe).resolve('何もない部屋だ。白い。').translation,'什么都没有的，纯白的房间。');
 fs.rmSync(base,{recursive:true,force:true});
});

test('YU-RIS: Amano and rioLoader scenes use their own encodings in one patch search',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yuris-patch-codecs-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const amano=path.join(dir,'amano'),rio=path.join(dir,'rio');
 const amanoName='yst00100.ybn',rioName='yst00101.ybn';
 const amanoJa='朝はいい天気ですね。',rioJa='今日はどうしましょう。';
 const amanoZh='早上好，今天天气真好',rioZh='我们去散步吧。';
 const amanoPath='ysbin\\'+amanoName,rioPath='ysbin\\'+rioName;
 put(amano,{'patch.pack':pack('.Amano\0\0',[[amanoPath,ystb([gbk(amanoZh)]),true]])});

 const table=Buffer.alloc(0x20000),font=Buffer.alloc(12+8*16),rioBytes=Buffer.alloc(2*rioZh.length),glyphs=new Map();
 table.write(" !\"#$%&'()*+,-./0123456789",64,'utf16le');
 font.writeUInt32BE(0x10000,0);font.writeUInt16BE(8,4);font.writeUInt32BE(font.length,24);
 for(let i=0;i<rioZh.length;i++){
  const code=0x8140+i,glyph=0xe000+i;
  table.writeUInt16LE(glyph,2*code);rioBytes.writeUInt16BE(code,2*i);
  glyphs.set(String.fromCharCode(glyph),rioZh[i]);
 }
 // Keep the loader's byte table real and make the outline match independent of installed fonts.
 const fontUnmap=require('../services/original-engines/font-unmap.cjs');
 t.mock.method(fontUnmap,'unmapping',()=>glyphs);
 put(rio,{'loader.exe':Buffer.concat([table,font]),'update1.ypf':ypf([[rioPath,ystb([rioBytes])]])});

 const base=[[amanoName,amanoJa],[rioName,rioJa]].map(([name,line])=>({name,...yuris.parse(ystb([sjis(line)]))}));
 const patched=dirs=>yuris.patchLines(base,{dirs}).map(s=>s.lines);
 assert.deepStrictEqual(patched([amano]),[[amanoZh],[rioJa]]);
 assert.deepStrictEqual(patched([rio]),[[amanoJa],[rioZh]]);
 assert.deepStrictEqual(patched([amano,rio]),[[amanoZh],[rioZh]]);
 assert.deepStrictEqual(patched([rio,amano]),[[amanoZh],[rioZh]]);
});

test('YU-RIS: a standalone Amano pack still detects the plain script encoding',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yuris-amano-plain-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const name='yst00100.ybn',line='ゆっくりやすみましょう。';
 put(dir,{'patch.pack':pack('.Amano\0\0',[['ysbin\\'+name,ystb([sjis(line)])]])});
 const patched=yuris.patchLines([{name,lines:['元の台詞です。'],anchors:[]}],{dirs:[dir]});
 assert.deepStrictEqual(patched.map(s=>s.lines),[[line]]);
});

test('YU-RIS: the YSTB key low byte is found when argument ids are not zero',()=>{
 const ja=['きょうはいいてんきですね。','そうだね、さんぽにいこうか。','あのこうえんまであるいていこう。'];
 assert.deepStrictEqual(yuris.parse(ystb(ja.map(sjis),5)).lines,ja);
});

// ---- MoleBox writer (E334; the format yuris.cjs reads, encrypted here with independent code) ----
const steps=[];for(let r=0;r<8;r++){const k=r*7;steps.push([7,B=>k+3,3],[4,()=>k,0],[6,()=>k+2,2],[5,()=>k+1,1],[1,()=>k+4,4],[2,null,null],[3,()=>k+5,6],[0,()=>k+6,7]);}
for(let j=0;j<4;j++)steps.push([j+4,()=>56+j,j]);
const ndEnc=(S,K)=>B=>{for(let i=steps.length-1;i>=0;i--){const [x,k,y]=steps[i];B[x]^=S[k?K[k()]^B[y]:B[5]^B[4]];}};
function cbcEnc(buf,enc){let iv=Buffer.alloc(8);for(let p=0;p<buf.length;p+=8){const b=buf.subarray(p,p+8);for(let i=0;i<8;i++)b[i]^=iv[i];enc(b);iv=Buffer.from(b);}return buf;}
function shuffle(seed){const src=[...seed],out=[];let x=1;while(src.length){x=(Math.imul(x,0x19660d)+0x3c6ef35f)>>>0;out.push(src.splice(x%src.length,1)[0]);}return Buffer.from(out);}
function expand(key){const out=[];for(let n=11;;){out.push(key[n%15],key[(n+1)%15],key[(n+2)%15]);const b=(n+3)%15;out.push(key[b]);let d=(b+9)%15;if(d===12)return Buffer.from(out);out.push(key[d],key[d+1],key[d+2]);d+=2;n=(d+9)%15;}}
function bfEnc(P0,S0,key){const P=Uint32Array.from(P0),S=Uint32Array.from(S0);
 for(let i=0,j=0;i<18;i++){let d=0;for(let k=0;k<4;k++,j=(j+1)%key.length)d=(d<<8|key[j])>>>0;P[i]=(P[i]^d)>>>0;}
 const F=x=>((((S[x>>>24]+S[256|x>>>16&255])>>>0)^S[512|x>>>8&255])+S[768|x&255])>>>0;
 const enc=(l,r)=>{for(let i=0;i<16;i++){l=(l^P[i])>>>0;r=(r^F(l))>>>0;[l,r]=[r,l];}[l,r]=[r,l];return [(l^P[17])>>>0,(r^P[16])>>>0];};
 let l=0,r=0;for(let i=0;i<18;i+=2){[l,r]=enc(l,r);P[i]=l;P[i+1]=r;}for(let i=0;i<1024;i+=2){[l,r]=enc(l,r);S[i]=l;S[i+1]=r;}
 return b=>{const [x,y]=enc(b.readUInt32LE(0),b.readUInt32LE(4));b.writeUInt32LE(x,0);b.writeUInt32LE(y,4);};}
const pad8=b=>Buffer.concat([b,Buffer.alloc((8-b.length%8)%8)]);
function moleExe(files){
 let rnd=7;const next=()=>(rnd=(Math.imul(rnd,1103515245)+12345)>>>0);
 const seed=Buffer.from(Array.from({length:256},(_,i)=>(i*91+17)&255)),S=shuffle(seed),key16=Buffer.from('0123456789abcdef'),nd=ndEnc(S,expand(key16));
 // PE: headers 0x200, .text 0x200, .data 0x200 (the table seed first).
 const pe=Buffer.alloc(0x600);pe.write('MZ',0,'latin1');pe.writeUInt32LE(0x80,0x3c);pe.write('PE\0\0',0x80,'latin1');pe.writeUInt16LE(2,0x86);pe.writeUInt16LE(0xe0,0x94);
 [['.text',0x200],['.data',0x400]].forEach(([n,raw],i)=>{const s=0x80+24+0xe0+i*40;pe.write(n,s,'latin1');pe.writeUInt32LE(0x200,s+16);pe.writeUInt32LE(raw,s+20);});seed.copy(pe,0x400);
 const ov=0x600,P0=[0x243f6a88,0x85a308d3],S0=[];while(P0.length<18)P0.push(next());while(S0.length<1024)S0.push(next());
 const core=Buffer.alloc(0x40+72+4096);core.write('STEELBOX',0,'latin1');P0.forEach((v,i)=>core.writeUInt32LE(v,0x40+i*4));S0.forEach((v,i)=>core.writeUInt32LE(v,0x40+72+i*4));
 const lzParts=[];for(let p=0;p<core.length;p+=256)lzParts.push(Buffer.from([0,Math.min(256,core.length-p)-1]),core.subarray(p,p+256));
 const sz=Buffer.alloc(4);sz.writeUInt32LE(core.length);const coreBlob=cbcEnc(pad8(Buffer.concat([sz,...lzParts])),nd);
 const coreAt=ov+8+0x1f0,dataAt=coreAt+coreBlob.length;
 const inner=bfEnc(P0,S0,crypto.createHash('md5').update('password').digest().subarray(0,15)),outer=bfEnc(P0,S0,crypto.createHash('md5').update('7233DA04FCF24B388408701CB1F874F3').digest().subarray(0,15));
 const datas=[],recs=[];let off=0;
 for(const f of files){const chunks=[];for(let p=0;p<f.length;p+=0xc000){const z=zlib.deflateSync(f.subarray(p,p+0xc000)),enc=cbcEnc(pad8(z),inner);chunks.push({packed:enc.length,size:Math.min(0xc000,f.length-p),off});datas.push(enc);off+=enc.length;}
  const r=Buffer.alloc(0x34+12*chunks.length);crypto.randomBytes(20).copy(r,16);r.writeUInt32LE(7,40);r.writeUInt32LE(f.length,44);r.writeUInt32LE(chunks.length,48);
  chunks.forEach((c,k)=>{const q=0x34+12*k;r.writeUInt16LE(c.packed,q);r.writeUInt16LE(c.size,q+2);r.writeUInt16LE(6,q+4);r.writeUInt32LE(c.off,q+8);});recs.push(r);}
 // The last chunk ends where the catalog starts.
 const data=Buffer.concat(datas),catAt=dataAt+data.length,cat=cbcEnc(pad8(Buffer.concat([Buffer.from([0x15,0xcd,0x5b,0x07]),...recs])),inner);
 const footAt=catAt+cat.length,foot=Buffer.alloc(0x30);foot.writeUInt32LE(catAt,0);foot.writeUInt32LE(cat.length,4);foot.write('STELPACK',0x28,'latin1');cbcEnc(foot,inner);
 const cat0=Buffer.alloc(0x50);cat0.writeUInt32LE(footAt,0x2a);crypto.createHash('md5').update('password').digest().copy(cat0,0x3a);cbcEnc(cat0,outer);
 const tail=Buffer.alloc(8);tail.writeUInt32LE(0x50,0);outer(tail);
 const hdr=Buffer.alloc(0x1f0);hdr.writeUInt32LE(coreAt,0x20);hdr.writeUInt32LE(coreBlob.length,0x24);key16.copy(hdr,0x170);cbcEnc(hdr.subarray(0,0x170),nd);cbcEnc(hdr.subarray(0x180),nd);
 const mark=Buffer.alloc(8);mark.writeUInt32LE(0x12345678,0);mark.writeUInt32LE((0x12345678^0x4a4e414d^0x554a4f58)>>>0,4);
 return Buffer.concat([pe,mark,hdr,coreBlob,data,cat,foot,cat0,tail]);}

test('YU-RIS: the Chinese scenes inside a MoleBox program next to the game are its translation',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'yuris-m-')),game=path.join(base,'game');
 const ja=['ここは…どこだ。','何もない部屋だ。白い。','梨香「名前…」','……名前？','だらりと両手を垂れさげる。','いつもの『声』が響く。'];
 const zh=['这里…是哪里？','什么都没有的，纯白的房间。','梨香「名字…」','……名字？','耷拉着垂下双手。','一如既往的『声音』响起了。'];
 const big=crypto.randomBytes(0x1c000);
 put(game,{'game.exe':'exe','pac/bn.ypf':ypf([['ysbin\\yst00100.ybn',ystb(ja.map(sjis))]]),
  'patch_cn.exe':moleExe([Buffer.from('fake png'),big,ypf([['ysbin\\yst00100.ybn',ystb(zh.map(gbk))]])])});
 const list=yuris.patchLines(yuris.scenes(game).map(s=>({name:s.name,...yuris.parse(s.read())})),{dirs:[game]});
 assert.ok(list&&list[0].patched,JSON.stringify(list));assert.deepStrictEqual(list[0].lines,zh);
 const files=yuris._internal.moleBox(path.join(game,'patch_cn.exe'));assert.strictEqual(files.length,3);assert.ok(files[1].read().equals(big),'multi-chunk file');
 assert.strictEqual(yuris._internal.moleBox(path.join(game,'game.exe')),null);
 const {r,ot,data,exe}=await patchFor(game,'game.exe');assert.ok(r.found,JSON.stringify(r));
 assert.strictEqual(ot.provider(data,exe).resolve('何もない部屋だ。白い。').translation,'什么都没有的，纯白的房间。');
 fs.rmSync(base,{recursive:true,force:true});
});

// The user's own install (skipped elsewhere): euphoria HD with the 萌你妹 1.01 patch (乐园_高清版.exe).
const REAL_HD='E:\\GAL\\euphoria\\euphoriaHD';
test('YU-RIS real data: euphoria HD Japanese bn.ypf lines pair with the scripts inside 乐园_高清版.exe',{skip:!fs.existsSync(path.join(REAL_HD,'乐园_高清版.exe'))&&'euphoria HD not installed'},async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'yuris-h-')),game=path.join(base,'euphoriaHD');
 for(const rel of ['pac/bn.ypf','乐园_高清版.exe']){const to=path.join(game,rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(REAL_HD,rel),to);}
 fs.writeFileSync(path.join(game,'euphoriaHD.exe'),'exe');
 const parsed=yuris.scenes(game).map(s=>({name:s.name,...yuris.parse(s.read())}));assert.ok(parsed.length>=450,parsed.length+' scenes');
 const list=yuris.patchLines(parsed,{dirs:[game]});
 assert.ok(list.filter(s=>s.patched).length>=450,list.filter(s=>!s.patched).map(s=>s.name+':'+s.skipped).join(' '));
 assert.ok(!list.some(s=>s.lines.some(t=>t.includes('\ufffd'))),'no broken characters');
 const {r,ot,data,exe}=await patchFor(game,'euphoriaHD.exe');assert.ok(r.found,JSON.stringify(r));
 const state=JSON.parse(fs.readFileSync(path.join(data,'data/config/original-text.json'),'utf8'))['1'];
 assert.strictEqual(state.engine,'yuris');assert.strictEqual(state.patchStatus,'ready');
 assert.strictEqual(ot.provider(data,exe).resolve('何もない部屋だ。白い。').translation,'什么都没有的，纯白的房间。');
 fs.rmSync(base,{recursive:true,force:true});
});

// The user's own install (skipped elsewhere): euphoria (SD) with the 萌你妹 patch.
const REAL='E:\\GAL\\euphoria\\euphoria';
test('YU-RIS real data: euphoria Japanese bn.ypf lines pair with euphoria_sc.pack',{skip:!fs.existsSync(path.join(REAL,'euphoria_sc.pack'))&&'euphoria not installed'},async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'yuris-e-')),game=path.join(base,'euphoria'),copy=rel=>{const to=path.join(game,rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(REAL,rel),to);};
 for(const rel of ['pac/bn.ypf','euphoria_sc.pack','euphoria_sc.dll'])copy(rel);fs.writeFileSync(path.join(game,'euphoria.exe'),'exe');
 const scenes=yuris.scenes(game),parsed=scenes.map(s=>({name:s.name,...yuris.parse(s.read())}));
 assert.ok(scenes.length>=450,scenes.length+' scenes');
 assert.ok(parsed.find(s=>s.name==='yst00126.ybn').lines.includes('蒔羽の眉がきゅっと八の字に下がる。'),'scenes whose key low byte is not the most common byte');
 const list=yuris.patchLines(parsed,{dirs:[game]});
 assert.ok(list.filter(s=>s.patched).length>=450,list.filter(s=>!s.patched).map(s=>s.name+':'+s.skipped).join(' '));
 assert.ok(!list.some(s=>s.lines.some(t=>t.includes('\ufffd'))),'no broken characters');
 const {r,ot,data,exe}=await patchFor(game,'euphoria.exe');assert.ok(r.found,JSON.stringify(r));
 const state=JSON.parse(fs.readFileSync(path.join(data,'data/config/original-text.json'),'utf8'))['1'];
 assert.strictEqual(state.engine,'yuris');assert.strictEqual(state.patchStatus,'ready');
 assert.strictEqual(ot.provider(data,exe).resolve('何もない部屋だ。白い。').translation,'什么都没有的，纯白的房间。');
 fs.rmSync(base,{recursive:true,force:true});
});
