'use strict';
// 2026-11-13 MAGES games index their font sheets with different character lists (STEINS;GATE 0 / CHAOS;CHILD: default,
// Linear Bounded Phenogram, My Darling's Embrace: their own). The script reader picks the list per script.mpk.
// Synthetic data first, then the real Steam installs when present (Japanese language).
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const mages=require('../services/original-engines/mages.cjs');
const {charset,pickCharset,gameCharset,CHARSETS}=mages._internal;
function sc3(strings,id){const cs=charset(id),enc=t=>Buffer.concat(Array.from(t,ch=>{const i=cs.indexOf(ch);assert.ok(i>=0,id+' '+ch);const b=Buffer.alloc(2);b.writeUInt16BE(0x8000|i);return b;}));
 const bodies=strings.map(s=>Buffer.concat([enc(s),Buffer.from([0xff])]));
 const table=12,ret=table+bodies.length*4;let at=ret+4;const head=Buffer.alloc(ret+4);head.write('SC3\0',0,'latin1');head.writeUInt32LE(table,4);head.writeUInt32LE(ret,8);
 bodies.forEach((b,i)=>{head.writeUInt32LE(at,table+i*4);at+=b.length;});return Buffer.concat([head,...bodies]);}
function mpk(files){const head=Buffer.alloc(0x40+files.length*256);head.write('MPK\0',0,'latin1');head.writeUInt16LE(2,6);head.writeUInt32LE(files.length,8);let off=head.length;
 files.forEach(([name,data],i)=>{const p=0x40+i*256;head.writeUInt32LE(i,p+4);head.writeBigUInt64LE(BigInt(off),p+8);head.writeBigUInt64LE(BigInt(data.length),p+16);head.writeBigUInt64LE(BigInt(data.length),p+24);head.write(name,p+32,'latin1');off+=data.length;});
 return Buffer.concat([head,...files.map(f=>f[1])]);}
const LINES=['今日は何を話そうかと思って、自分の手を見た。','俺は大きな声で言った。前に出て、上を見て、下を見た。','時間がない。気をつけて行くんだ、人の顔を見てな。'];

test('every list ships and holds the common words',()=>{for(const id of CHARSETS){const cs=charset(id);assert.ok(cs.length>2000,id);for(const ch of '今日何話思自分手見俺大声言前出上下時間気行人顔')assert.ok(cs.includes(ch),id+' '+ch);}});

test('a script is decoded with the list it was written in',()=>{for(const id of CHARSETS){const b=sc3(LINES,id);assert.strictEqual(pickCharset(b),charset(id),id);
 assert.deepStrictEqual(mages.parse(b).lines,LINES,id);}});

test('one list per game: a short menu scene follows the game, not its own guess',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mages-cs-'));
 try{const story=Array.from({length:150},(_,i)=>LINES[i%3]);const files=[];for(let i=0;i<12;i++)files.push(['S'+String(i).padStart(2,'0')+'.SCX',sc3(story,'sgmde')]);
  files.push(['_MENU.SCX',sc3(['データ'],'sgmde')]);fs.mkdirSync(path.join(dir,'USRDIR'));fs.writeFileSync(path.join(dir,'USRDIR','script.mpk'),mpk(files));
  assert.strictEqual(gameCharset(path.join(dir,'USRDIR','script.mpk')),'sgmde');const sc=mages.scenes(dir);assert.strictEqual(sc.length,13);
  for(const s of sc){const b=s.read();assert.strictEqual(b.magesCharset,'sgmde');}
  assert.deepStrictEqual(mages.parse(sc.find(s=>s.name==='S00.SCX').read()).lines.slice(0,3),LINES);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}});

const STEAM='E:/steam/steamapps/common/';
for(const [game,id,want] of [['STEINS;GATE','sghd','牧瀬紅莉栖'],['STEINS;GATE 0','default','トゥットゥルー♪　オカリン〜、セミナーさんの準備、順調なのかな？'],['CHAOS;CHILD','default','セーブされていない現在プレイ中のデータは失われます。'],['SG_Phenogram','sglbp','また秋葉原にアルパカマンが現れたんだって！'],["SG_My Darling's Embrace",'sgmde','私もラボメンのひとりだもんね♪']]){
 const f=path.join(STEAM,game,'USRDIR','script.mpk');
 test('real install: '+game,{skip:!fs.existsSync(f)&&'not installed'},()=>{const sc=mages.scenes(path.join(STEAM,game));
  if(!sc.length)return;/* English install: the reader leaves it out */assert.strictEqual(gameCharset(f),id);
  let found=false,lines=0,voiced=0;for(const s of sc){const p=mages.parse(s.read());lines+=p.lines.length;voiced+=(p.voices||[]).filter(Boolean).length;if(!found&&p.lines.some(l=>l.includes(want)))found=true;}
  assert.ok(found,want);assert.ok(lines>30000,String(lines));assert.ok(voiced>10000,String(voiced));});}
