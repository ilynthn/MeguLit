'use strict';
// E452 Steam VN group: minori PAZ (eden*), Naninovel voices by text id (魔法少女ノ魔女裁判, IL2CPP), DDLC Plus (Mono).
// Synthetic data first, then the real Steam installs when present (read only).
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const paz=require('../services/original-engines/paz.cjs'),{Blowfish}=require('../services/original-engines/blowfish.cjs');
const naninovel=require('../services/original-engines/naninovel.cjs'),nvoice=require('../services/original-engines/naninovel-voice.cjs');
const tmp=p=>fs.mkdtempSync(path.join(os.tmpdir(),p));
const enc=(key,buf)=>{const bf=new Blowfish(Buffer.from(key,'hex'));buf=Buffer.from(buf);for(let i=0;i+8<=buf.length;i+=8){const [l,r]=bf.encrypt(buf.readUInt32LE(i),buf.readUInt32LE(i+4));buf.writeUInt32LE(l,i);buf.writeUInt32LE(r,i+4);}return buf;};
const pad8=b=>Buffer.concat([b,Buffer.alloc((8-b.length%8)%8)]);
function rc4(key,buf){const S=[...Array(256).keys()];let j=0;for(let i=0;i<256;i++){j=(j+S[i]+key[i%key.length])&255;[S[i],S[j]]=[S[j],S[i]];}let a=0,b=0;const o=Buffer.from(buf);for(let i=0;i<o.length;i++){a=(a+1)&255;b=(b+S[a])&255;[S[a],S[b]]=[S[b],S[a]];o[i]^=S[(S[a]+S[b])&255];}return o;}
/* A version-1 PAZ: 32-byte header naming the build, index size, Blowfish index, entries (RC4 by type password, Blowfish). */
function pazFile(header,scheme,arc,files){
 const keys=scheme.arc[arc],names=Object.keys(files);let idxLen=4;for(const n of names)idxLen+=Buffer.byteLength(n,'latin1')+1+24;idxLen=(idxLen+7)&~7;
 let at=0x24+idxLen;const parts=[],idx=Buffer.alloc(idxLen);idx.writeUInt32LE(names.length,0);let p=4;
 for(const n of names){const plain=files[n],key=Buffer.from(n.toLowerCase()+' '+plain.length.toString(16).toUpperCase().padStart(8,'0')+' '+scheme.type.sc,'latin1');
  const body=enc(keys[1],pad8(rc4(key,plain)));p+=idx.write(n,p,'latin1');idx[p++]=0;idx.writeBigInt64LE(BigInt(at),p);idx.writeUInt32LE(plain.length,p+8);idx.writeUInt32LE(plain.length,p+12);idx.writeUInt32LE(body.length,p+16);idx.writeInt32LE(0,p+20);p+=24;parts.push(body);at+=body.length;}
 const head=Buffer.alloc(0x24);head.write(header,0,'latin1');head.writeUInt32LE(idxLen,0x20);
 return Buffer.concat([head,enc(keys[0],idx),...parts]);}
const schemes=require('../services/original-engines/paz-schemes.json');

test('PAZ: the scheme comes from GARbro\'s catalogue by which index key opens the archive (no title match needed)',()=>{
 assert.ok(Object.keys(schemes).length>=40,'paz-schemes.json holds GARbro\'s PazSchemes');
 const s=schemes['eden* [English Steam]'];assert.ok(s&&s.arc.scr&&s.type.sc);
 const dir=tmp('paz-');
 // ASCII lines stand in for the script body; Shift-JIS kana bytes mark it Japanese (ひ = 82 D0)
 const ja=Buffer.concat([Buffer.from('.message\t10\tryo-A001-0001\t\t','latin1'),Buffer.from([0x81,0x75,0x82,0xd0,0x82,0xc6,0x81,0x76]),Buffer.from('\r\n','latin1')]);
 fs.writeFileSync(path.join(dir,'scr.paz'),pazFile('some_build',s,'scr',{'A001.sc':ja}));
 const list=paz.list(path.join(dir,'scr.paz'));assert.deepStrictEqual(list.map(e=>e.name),['A001.sc']);
 assert.deepStrictEqual(paz.parse(list[0].read()).lines,['「ひと」']);
 assert.deepStrictEqual(paz.parse(list[0].read()).voices,['ryo-A001-0001']);
 const scenes=require('../services/original-engines/scenes.cjs');assert.strictEqual(scenes.detect(dir),'paz');assert.strictEqual(scenes.unsupportedReason(dir),null);
 fs.rmSync(dir,{recursive:true,force:true});
});

test('PAZ: a Chinese patch (GBK) or a long English script is not offered as Japanese; the game says why',()=>{
 const s=schemes['eden* [English Steam]'],dir=tmp('paz-zh-');
 const gbk=Buffer.concat([Buffer.from('.message\t10\t\t','latin1'),Buffer.from([0xce,0xd2,0xc3,0xc7,0xa1,0xa3]),Buffer.from('\r\n','latin1')]);/* 我们。 */
 fs.writeFileSync(path.join(dir,'scr.paz'),pazFile('eden_en',s,'scr',{'A001.sc':Buffer.concat(Array(5).fill(gbk))}));
 const scenes=require('../services/original-engines/scenes.cjs');assert.strictEqual(scenes.detect(dir),null);
 assert.strictEqual(scenes.unsupportedReason(dir).code,'PAZ_CHINESE_ONLY');
 assert.deepStrictEqual(paz.parse(Buffer.from(Array(30).fill('.message\t1\t\t\tHello there.').join('\n'),'latin1')).lines,[]);
 assert.deepStrictEqual(paz.parse(Buffer.from('.message\t40\t\tA\tabc','latin1')).lines,['A','abc'],'short fixtures stay readable');
 fs.rmSync(dir,{recursive:true,force:true});
});

test('PAZ: space-delimited messages keep empty columns, speaker names, voices and dialogue spacing',()=>{
 const script=Buffer.concat([
  Buffer.from('.message 10   No  voice.\r\n.message 11 v001 A'),Buffer.from([0x81,0x40]), // full-width space in a name
  Buffer.from('B '),Buffer.from([0x82,0xd0]), // ひ
  Buffer.from('  OK\r\n.message 12  Speaker Quiet.\r\n.message\t13\tv002\tA B\tOne\ttwo\r\n.message 14 v003 Speaker \r\n.message 15\r\n'),
 ]);
 const result=paz.parse(script);
 assert.deepStrictEqual(result.lines,['No  voice.','A　B','ひ  OK','Speaker','Quiet.','A B','One\ttwo']);
 assert.deepStrictEqual(result.voices,[null,null,'v001',null,null,null,'v002']);
});

test('PAZ: a different command cannot turn an English script into a Japanese scene',t=>{
 const english=Array(30).fill('.message 10   Hello there.').join('\n');
 const other=Buffer.concat([Buffer.from('\n.messageColor\t1\t\t\t'),Buffer.from([0x82,0xd0])]);
 const body=Buffer.concat([Buffer.from(english),other]);
 assert.deepStrictEqual(paz.parse(body).lines,[]);
 const dir=tmp('paz-language-');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'scr.paz'),pazFile('some_build',schemes['eden* [English Steam]'],'scr',{'sample.sc':body}));
 assert.strictEqual(paz.engine.unsupported(dir),'PAZ_ENGLISH_ONLY');
});

test('PAZ: padding before the first tab keeps a tab-delimited message intact',()=>{
 const row=Buffer.from('.message  \t10\tv001\tA B\tOne  two\tthree');
 assert.deepStrictEqual(paz.parse(row),{lines:['A B','One  two\tthree'],voices:[null,'v001'],anchors:[]});
 const spaced=Buffer.from('.message 10   One\ttwo');
 assert.deepStrictEqual(paz.parse(spaced).lines,['One\ttwo']);
});

test('PAZ: schemeOf() cache invalidates when paz-scheme adapter packs or file mtime change in the same process',t=>{
 const packs=require('../services/adapter-packs.cjs'),orig=packs.params;
 t.after(()=>{packs.params=orig;});
 const dir=tmp('paz-pack-cache-');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const idxKeyA='11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
 const idxKeyB='22334455667788990011aabbccddeeff22334455667788990011aabbccddeeff';
 const dataKeyA='ffeeddccbbaa00998877665544332211ffeeddccbbaa00998877665544332211';
 const dataKeyB='00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
 const schemeA={title:'Custom PAZ A',version:1,type:{sc:'pw123456'},arc:{scr:[idxKeyA,dataKeyA]}};
 const schemeB={title:'Custom PAZ B',version:1,type:{sc:'pw123456'},arc:{scr:[idxKeyB,dataKeyB]}};
 const schemeWrongData={title:'Custom PAZ A',version:1,type:{sc:'pw123456'},arc:{scr:[idxKeyA,dataKeyB]}};
 const schemeWrongSc={title:'Custom PAZ A',version:1,type:{sc:'pw000000'},arc:{scr:[idxKeyA,dataKeyA]}};
 const ja=Buffer.concat([Buffer.from('.message\t10\tryo-A001-0001\t\t','latin1'),Buffer.from([0x81,0x75,0x82,0xd0,0x82,0xc6,0x81,0x76]),Buffer.from('\r\n','latin1')]);
 const blobA=pazFile('custom_paz',schemeA,'scr',{'A001.sc':ja});
 const blobB=pazFile('custom_paz',schemeB,'scr',{'A001.sc':ja});
 assert.strictEqual(blobA.length,blobB.length);
 const pFile=path.join(dir,'scr.paz'),tSec=1700000000000;
 fs.writeFileSync(pFile,blobA);
 fs.utimesSync(pFile,new Date(tSec+100),new Date(tSec+100));
 /* 1. No pack: schemeOf caches null */
 packs.params=()=>[];
 assert.strictEqual(paz.list(pFile),null);
 /* 2. Wrong index key (count 1) still returns null */
 const wrongIdx=[{value:schemeB,pack:'p@1'}];
 packs.params=target=>target==='paz-scheme'?wrongIdx:[];
 assert.strictEqual(paz.list(pFile),null);
 /* 3. Right index key, wrong data key only -> updating data key (same count 1, same index key & sc) must invalidate */
 const badData=[{value:schemeWrongData,pack:'p@2'}];
 packs.params=target=>target==='paz-scheme'?badData:[];
 const lBadData=paz.list(pFile);assert.ok(lBadData&&lBadData.length===1);
 assert.notDeepStrictEqual(paz.parse(lBadData[0].read()).lines,['「ひと」']);
 const right=[{value:schemeA,pack:'p@3'}];
 packs.params=target=>target==='paz-scheme'?right:[];
 assert.deepStrictEqual(paz.parse(paz.list(pFile)[0].read()).lines,['「ひと」']);
 /* 4. Right index & data keys, wrong sc password only -> updating sc password must invalidate */
 const badSc=[{value:schemeWrongSc,pack:'p@4'}];
 packs.params=target=>target==='paz-scheme'?badSc:[];
 assert.notDeepStrictEqual(paz.parse(paz.list(pFile)[0].read()).lines,['「ひと」']);
 packs.params=target=>target==='paz-scheme'?right:[];
 assert.deepStrictEqual(paz.parse(paz.list(pFile)[0].read()).lines,['「ひと」']);
 /* 5. Same-size overwrite within the same second (different ms) switches between two active schemes */
 const both=[{value:schemeA,pack:'p@5'},{value:schemeB,pack:'p@6'}];
 packs.params=target=>target==='paz-scheme'?both:[];
 assert.deepStrictEqual(paz.parse(paz.list(pFile)[0].read()).lines,['「ひと」']);
 fs.writeFileSync(pFile,blobB);
 fs.utimesSync(pFile,new Date(tSec+600),new Date(tSec+600));
 const lSwitched=paz.list(pFile);assert.ok(lSwitched&&lSwitched.length===1);
 assert.deepStrictEqual(paz.parse(lSwitched[0].read()).lines,['「ひと」']);
 fs.writeFileSync(pFile,blobA);
 fs.utimesSync(pFile,new Date(tSec+900),new Date(tSec+900));
 assert.deepStrictEqual(paz.parse(paz.list(pFile)[0].read()).lines,['「ひと」']);
 /* 6. Removing pack invalidates cached scheme */
 packs.params=()=>[];
 assert.strictEqual(paz.list(pFile),null);
 /* 7. Warmed schemeOf() cache returns without re-reading header or calling opens() (kills P8) */
 packs.params=target=>target==='paz-scheme'?right:[];
 assert.ok(paz.list(pFile));
 const origOpen=fs.openSync;let opensCnt=0;fs.openSync=(...a)=>{opensCnt++;return origOpen(...a);};
 try{assert.ok(paz.list(pFile));assert.strictEqual(opensCnt,2,'cached paz.list() should only read index size and index body, not header/opens');}finally{fs.openSync=origOpen;}
 /* 8. Changing only type.ogg (and delimiter-collision sc/ogg pairs) invalidates cache (kills P5 & collision) */
 const oggData=Buffer.from('OggS\x00\x02dummy-ogg-payload-123456','latin1');
 const pazFileWith=(hdr,sc,arc,files,pw)=>{
  const keys=sc.arc[arc],names=Object.keys(files),zlib=require('node:zlib');
  let idxLen=4;for(const n of names)idxLen+=Buffer.byteLength(n,'latin1')+1+24;idxLen=(idxLen+7)&~7;
  let at=0x24+idxLen;const parts=[],idx=Buffer.alloc(idxLen);idx.writeUInt32LE(names.length,0);let p=4;
  for(const n of names){const plain=files[n],k=Buffer.from(n.toLowerCase()+' '+plain.length.toString(16).toUpperCase().padStart(8,'0')+' '+pw,'latin1');
   const skip=sc.version>=2?(zlib.crc32(k)>>>12)&255:0;
   const S=[...Array(256).keys()];let j=0;for(let i=0;i<256;i++){j=(j+S[i]+k[i%k.length])&255;[S[i],S[j]]=[S[j],S[i]];}
   let a=0,b=0;for(let q=0;q<skip;q++){a=(a+1)&255;b=(b+S[a])&255;[S[a],S[b]]=[S[b],S[a]];}
   const x=Buffer.from(plain);for(let i=0;i<x.length;i++){a=(a+1)&255;b=(b+S[a])&255;[S[a],S[b]]=[S[b],S[a]];x[i]^=S[(S[a]+S[b])&255];}
   const body=enc(keys[1],pad8(x));p+=idx.write(n,p,'latin1');idx[p++]=0;idx.writeBigInt64LE(BigInt(at),p);idx.writeUInt32LE(plain.length,p+8);idx.writeUInt32LE(plain.length,p+12);idx.writeUInt32LE(body.length,p+16);idx.writeInt32LE(0,p+20);p+=24;parts.push(body);at+=body.length;}
  const head=Buffer.alloc(0x24);head.write(hdr,0,'latin1');head.writeUInt32LE(idxLen,0x20);
  return Buffer.concat([head,enc(keys[0],idx),...parts]);
 };
 const vSchemeGood={title:'Custom:Voice',version:1,type:{sc:'a',ogg:'b:c'},arc:{voice:[idxKeyA,dataKeyA]}};
 const vSchemeCollide={title:'Custom:Voice',version:1,type:{sc:'a:b',ogg:'c'},arc:{voice:[idxKeyA,dataKeyA]}};
 const vSchemeBadOgg={title:'Custom:Voice',version:1,type:{sc:'a',ogg:'wrong'},arc:{voice:[idxKeyA,dataKeyA]}};
 const vFile=path.join(dir,'voice.paz');
 fs.writeFileSync(vFile,pazFileWith('custom_v',vSchemeGood,'voice',{'v001.ogg':oggData},'b:c'));
 const pBadOgg=[{value:vSchemeBadOgg,pack:'v@1'}],pCollide=[{value:vSchemeCollide,pack:'v@2'}],pGoodOgg=[{value:vSchemeGood,pack:'v@3'}];
 packs.params=target=>target==='paz-scheme'?pBadOgg:[];
 assert.notStrictEqual(paz.audio(vFile)[0].read().toString('latin1',0,4),'OggS');
 packs.params=target=>target==='paz-scheme'?pGoodOgg:[];
 assert.strictEqual(paz.audio(vFile)[0].read().toString('latin1',0,4),'OggS');
 packs.params=target=>target==='paz-scheme'?pCollide:[];
 assert.notStrictEqual(paz.audio(vFile)[0].read().toString('latin1',0,4),'OggS');
 packs.params=target=>target==='paz-scheme'?pGoodOgg:[];
 assert.strictEqual(paz.audio(vFile)[0].read().toString('latin1',0,4),'OggS');
 /* 9. Changing only version (1 -> 2, same keys & passwords) invalidates cache (kills P6) */
 const v2Good={title:'Custom V2',version:2,type:{sc:'pw123456'},arc:{scr:[idxKeyA,dataKeyA]}};
 const v2AsV1={title:'Custom V2',version:1,type:{sc:'pw123456'},arc:{scr:[idxKeyA,dataKeyA]}};
 const v2File=path.join(dir,'scr.dat');
 fs.writeFileSync(v2File,pazFileWith('custom_v2',v2Good,'scr',{'A001.sc':ja},'pw123456'));
 const pV1=[{value:v2AsV1,pack:'v2@1'}],pV2=[{value:v2Good,pack:'v2@2'}];
 packs.params=target=>target==='paz-scheme'?pV1:[];
 assert.notDeepStrictEqual(paz.parse(paz.list(v2File)[0].read()).lines,['「ひと」']);
 packs.params=target=>target==='paz-scheme'?pV2:[];
 assert.deepStrictEqual(paz.parse(paz.list(v2File)[0].read()).lines,['「ひと」']);
});

test('Naninovel: "> Name: |#id|" gives the line its voice by text id; @choice and narration take none',()=>{
 const doc=['; 日本語 <ja> to 简体中文 <zh-Hans> localization document for \'A/B\' Naninovel scenario script','',
  '# 0101Adv31_Narrative001','; エマたちは食堂の調査にやってきた。','艾玛她们来到了食堂。','',
  '# 0101Adv31_Hanna001','; > Hanna: |#0101Adv31_Hanna001|','; さすがに食欲はないですわ。','实在是没食欲。','',
  '# 0101Adv05_Choice002','; > @choice |#0101Adv05_Choice002|','; ただ見守った','选择了旁观'].join('\n');
 const p=naninovel.parse(Buffer.from(doc,'utf8'));
 assert.deepStrictEqual(p.lines,['エマたちは食堂の調査にやってきた。','さすがに食欲はないですわ。','ただ見守った']);
 assert.deepStrictEqual(p.zh,['艾玛她们来到了食堂。','实在是没食欲。','选择了旁观']);
 assert.deepStrictEqual(p.voices,[null,'0101Adv31_Hanna001',null]);
});

test('Unity AudioClips named by text id are found in a serialized file with their .resource range',()=>{
 const str=s=>{const b=Buffer.from(s,'utf8'),o=Buffer.alloc(4+((b.length+3)&~3));o.writeUInt32LE(b.length,0);b.copy(o,4);return o;};
 const clip=(name,off,size)=>{const fields=Buffer.alloc(32);fields.writeInt32LE(1,4);fields.writeInt32LE(48000,8);const tail=Buffer.alloc(20);tail.writeBigUInt64LE(BigInt(off),0);tail.writeBigUInt64LE(BigInt(size),8);
  return Buffer.concat([str(name),fields,str('archive:/CAB-0123/CAB-0123.resource'),tail]);};
 const buf=Buffer.concat([Buffer.alloc(64),clip('0101Adv31_Sherry001',0,5000),clip('0101Adv31_Ema002',5008,7000),Buffer.alloc(16)]);
 assert.deepStrictEqual(nvoice.namedClips(buf),[{name:'0101Adv31_Sherry001',off:0,size:5000},{name:'0101Adv31_Ema002',off:5008,size:7000}]);
});

const STEAM='E:/Steam/steamapps/common';
const has=g=>require('./helpers/installed.cjs').installed(path.join(STEAM,g));
test('real: 魔法少女ノ魔女裁判 (Naninovel, IL2CPP) reads Japanese with Simplified Chinese on every line and plays its voices',{skip:!has('manosaba_game')},()=>{
 const scenes=require('../services/original-engines/scenes.cjs'),dir=path.join(STEAM,'manosaba_game');assert.strictEqual(scenes.detect(dir),'naninovel');
 const list=scenes.read('naninovel',dir);let n=0,paired=0,voiced=0;for(const s of list){s.lines.forEach((t,i)=>{n++;if((s.zh||[])[i])paired++;});voiced+=(s.voices||[]).filter(Boolean).length;}
 assert.ok(n>30000);assert.strictEqual(paired,n);assert.ok(voiced>20000);
 const cat=require('../services/game-voice.cjs').catalog(dir);let found=0;for(const s of list)for(const v of s.voices||[])if(v&&cat.get(v))found++;
 assert.ok(found/voiced>0.95,found+'/'+voiced);
 const read=cat.get('0101adv31_sherry001');assert.ok(read);assert.strictEqual(read().toString('latin1',0,4),'OggS');
});
test('real: DDLC Plus (Unity Mono) reads Japanese with Chinese on every line',{skip:!has('Doki Doki Literature Club Plus')},()=>{
 const scenes=require('../services/original-engines/scenes.cjs'),dir=path.join(STEAM,'Doki Doki Literature Club Plus');assert.strictEqual(scenes.detect(dir),'vgprompter');
 let n=0,paired=0;for(const s of scenes.read('vgprompter',dir))s.lines.forEach((t,i)=>{n++;if((s.zh||[])[i])paired++;});assert.ok(n>15000);assert.strictEqual(paired,n);
});
test('real: eden* (minori PAZ) opens with GARbro\'s Steam keys; voice.paz clips are Ogg; a Chinese-patched scr.paz is reported',{skip:!has('eden')},()=>{
 const dir=path.join(STEAM,'eden');assert.strictEqual(paz.list(path.join(dir,'scr.paz')).filter(e=>/\.sc$/.test(e.name)).length>20,true);
 const v=paz.audio(path.join(dir,'voice.paz'));assert.ok(v.length>5000);assert.strictEqual(v[0].read().toString('latin1',0,4),'OggS');
 const scenes=require('../services/original-engines/scenes.cjs');if(scenes.detect(dir)===null)assert.strictEqual(scenes.unsupportedReason(dir).code,'PAZ_CHINESE_ONLY');
});
