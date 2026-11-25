// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const test=require('node:test');
const kit=require('../services/original-engines/kit.cjs');
const {engine}=require('../services/original-engines/arcg.cjs');
const registry=require('../services/original-engines/registry.cjs');
const {probeGame}=require('../services/adapter-probe-core.cjs');
const original=require('../services/original-text.cjs');

function frame(opcode,payload=Buffer.alloc(0)){
 return Buffer.concat([Buffer.from([payload.length+2,opcode]),payload]);
}
const start=()=>frame(0x07,Buffer.alloc(4));
const text=value=>frame(0x09,Buffer.concat([kit.encodeSjis(value),Buffer.from([0])]));
const end=()=>frame(0x40,Buffer.from([0]));
const page=(...parts)=>Buffer.concat([start(),...parts.map(text),frame(0x0a)]);
const scene=(...frames)=>Buffer.concat([...frames,end(),Buffer.alloc(7,0xff)]);

function scb(members){
 const header=Buffer.alloc(32),directory=Buffer.alloc(16);
 let offset=header.length;
 const index=members.map(([name,body])=>{
  const label=Buffer.from(name,'ascii'),entry=Buffer.alloc(2+label.length+8);
  entry[0]=2+label.length;
  label.copy(entry,1);
  entry.writeUInt32LE(offset,entry[0]);
  entry.writeUInt32LE(body.length,entry[0]+4);
  offset+=body.length;
  return entry;
 });
 directory[0]=4;
 directory.writeUInt32LE(offset+directory.length,4);
 directory.writeUInt32LE(members.length,8);
 const table=Buffer.concat([directory,...index,Buffer.alloc(4)]);
 header.write('ARCG');
 header.writeUInt32LE(0x10000,4);
 header.writeUInt32LE(offset,8);
 header.writeUInt32LE(table.length,12);
 header.writeUInt16LE(1,16);
 header.writeUInt32LE(members.length,18);
 return Buffer.concat([header,...members.map(([,body])=>body),table]);
}

function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'arcg-')),dir=path.join(root,'game');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(dir);
 const executable=path.join(dir,'game.exe');
 fs.writeFileSync(executable,'MZ');
 return {root,dir,executable};
}

test('flat ARCG scripts deliver complete dialogue pages through both entry points',t=>{
 const {root,dir,executable}=setup(t);
 const speaker=Buffer.concat([kit.encodeSjis('先生'),Buffer.from([0])]);
 const intro=scene(start(),frame(0x25,speaker),text('今日は'),
  text('いい天気ですね。'),frame(0x0a),page('公園に行きましょう。'));
 const table=Buffer.concat([page('設定用の文字です。'),frame(0x41)]);
 fs.writeFileSync(path.join(dir,'game.scb'),scb([['RegTbl',table],['intro',intro]]));
 fs.writeFileSync(path.join(dir,'media.arc'),scb([['media',scene(page('画像の文字です。'))]]));
 assert.deepEqual(registry.readersFor(dir),['arcg']);
 const probe=probeGame({dir,executable});
 assert.equal(probe.step,'ok');
 assert.equal(probe.detected,'arcg');
 assert.equal(probe.engines.find(item=>item.id==='arcg').scenes,1);
 assert.equal(probe.japaneseLines,2);

 const state=original.scanRunning(root,'1',executable);
 assert.equal(state.status,'native-japanese');
 assert.equal(state.runtime.engine,'arcg');
 assert.deepEqual(JSON.parse(fs.readFileSync(state.runtime.index,'utf8')).lines,
  ['今日はいい天気ですね。','公園に行きましょう。']);
});

test('ARCG rejects out-of-range indexes and incomplete or malformed pages',t=>{
 const {dir}=setup(t);
 const pathToScript=path.join(dir,'game.scb');
 const complete=page('読める文章です。');
 const orphan=frame(0x09,Buffer.concat([kit.encodeSjis('孤立した文字です。'),Buffer.from([0])]));
 const invalid=frame(0x09,Buffer.from([0x82,0]));
 const result=engine.parse(scene(orphan,frame(0x0a),start(),invalid,frame(0x0a),complete,start(),text('未完の文章です。')));
 assert.deepEqual(result.lines,['読める文章です。']);
 assert.deepEqual(engine.parse(complete).lines,[]);
 assert.deepEqual(engine.parse(Buffer.concat([complete,Buffer.from([255,0x40,0])])).lines,[]);

 const bytes=scb([['intro',scene(complete)]]);
 const index=bytes.readUInt32LE(8),first=index+16;
 const truncated=Buffer.from(bytes);
 truncated.writeUInt32LE(bytes.length,12);
 fs.writeFileSync(pathToScript,truncated);
 assert.deepEqual(engine.scenes(dir),[]);
 const outOfRange=Buffer.from(bytes);
 outOfRange.writeUInt32LE(index,first+outOfRange[first]);
 fs.writeFileSync(pathToScript,outOfRange);
 assert.deepEqual(engine.scenes(dir),[]);
});


test('ARCG checks exact magic and finds the valid SCB after unrelated files',t=>{
 const {root,dir,executable}=setup(t);
 const bytes=scb([['story',scene(page('見つけた台詞です。'))]]);
 const impostor=Buffer.from(bytes);
 Buffer.from([0xc1,0xd2,0xc3,0xc7]).copy(impostor);
 for(let i=0;i<64;i++)fs.writeFileSync(path.join(dir,'other-'+i+'.scb'),impostor);
 assert.deepEqual(registry.readersFor(dir),[]);
 assert.equal(probeGame({dir,executable}).detected,null);
 assert.equal(original.scanRunning(root,'1',executable).status,'unsupported');

 fs.writeFileSync(path.join(dir,'story.scb'),bytes);
 assert.deepEqual(registry.readersFor(dir),['arcg']);
 assert.equal(probeGame({dir,executable}).detected,'arcg');
 assert.equal(original.scanRunning(root,'1',executable).runtime.engine,'arcg');
});

test('a script from the registered engine takes priority over an ARCG side archive',t=>{
 const {root,dir,executable}=setup(t);
 const {scnpac}=require('./helpers/engine-fixtures-e.cjs');
 const seraphText=kit.encodeSjis('セラフの台詞です。\r\nこちらの台詞です。\r\n');
 fs.writeFileSync(path.join(dir,'ScnPac.dat'),scnpac([Buffer.concat([Buffer.alloc(4),seraphText])]));
 const bonus=scb([['bonus',scene(page('おまけの一行目。'),page('おまけの二行目。'),page('おまけの三行目。'))]]);
 const broken=Buffer.from(bonus),index=bonus.readUInt32LE(8);
 broken.writeUInt32LE(2,index+8);
 for(const [game,archive] of [['1',broken],['2',bonus]]){
  fs.writeFileSync(path.join(dir,'bonus.scb'),archive);
  assert.deepEqual(registry.readersFor(dir),['seraph']);
  const probe=probeGame({dir,executable});
  assert.equal(probe.detected,'seraph');
  assert.equal(probe.japaneseLines,2);
  const state=original.scanRunning(root,game,executable);
  assert.equal(state.runtime.engine,'seraph');
  assert.equal(state.runtime.japaneseLines,2);
 }
});

test('ARCG accepts an archive at the size limit and rejects one byte over it',t=>{
 const {dir}=setup(t);
 const file=path.join(dir,'story.scb');
 fs.writeFileSync(file,scb([['story',scene(page('上限内の台詞です。'))]]));
 fs.truncateSync(file,64<<20);
 assert.deepEqual(registry.readersFor(dir),['arcg']);
 assert.deepEqual(engine.scenes(dir).map(s=>s.name),['story']);
 fs.truncateSync(file,(64<<20)+1);
 assert.deepEqual(registry.readersFor(dir),[]);
 assert.deepEqual(engine.scenes(dir),[]);
});

test('ARCG stops reading a scene when its budget expires in the padding',t=>{
 const body=Buffer.concat([page('途中までの台詞です。'),end(),Buffer.alloc(192<<10,0xff)]);
 assert.equal(engine.parse(body).lines.length,1);
 let checks=0;
 t.mock.method(Date,'now',()=>++checks<=2?0:2);
 assert.deepEqual(engine.parse(body,{deadline:1}).lines,[]);
});
