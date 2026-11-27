// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 制服カノジョ3 (ENTERGRAM package edition): the disc was an .mdf that is a plain ISO, its root an Inno Setup installer with
   split data (Launcher.exe + Launcher-1..3.bin), and the first install into a folder under a junction was refused by Inno
   (error 448) and rolled back. Each of these was a person's step; the adapter now tells them apart. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const D=require('../tools/megulit-adapter/disc-kind.cjs');

const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-disc-'));

test('mdfIso: a 2048-byte-sector .mdf is an ISO, a raw 2352 one and other files are not',()=>{const d=tmp();try{
 const iso=Buffer.alloc(0x9000);iso.write('CD001',0x8001,'latin1');fs.writeFileSync(path.join(d,'GAME.mdf'),iso);
 const raw=Buffer.alloc(0xa000);raw.write('CD001',0x9310+1,'latin1');fs.writeFileSync(path.join(d,'raw.mdf'),raw);
 fs.writeFileSync(path.join(d,'GAME.mds'),iso);
 assert.equal(D.mdfIso(path.join(d,'GAME.mdf')),true);
 assert.equal(D.mdfIso(path.join(d,'raw.mdf')),false,'raw 2352-byte sectors');
 assert.equal(D.mdfIso(path.join(d,'GAME.mds')),false,'only .mdf');
 assert.equal(D.mdfIso(path.join(d,'none.mdf')),false,'missing file');
}finally{fs.rmSync(d,{recursive:true,force:true});}});

test('innoDisc: Inno Setup with split .bin data is an installer disc; plain game files are not',()=>{const d=tmp();try{
 const head=Buffer.concat([Buffer.from('MZ'),Buffer.alloc(4096),Buffer.from('Inno Setup Setup Data (6.7.0)','latin1')]);
 fs.writeFileSync(path.join(d,'Launcher.exe'),head);for(const n of [2,1,3,10])fs.writeFileSync(path.join(d,'Launcher-'+n+'.bin'),'x');fs.writeFileSync(path.join(d,'autorun.inf'),'[autorun]');
 const r=D.innoDisc(d);assert.ok(r);assert.equal(path.basename(r.exe),'Launcher.exe');assert.deepEqual(r.parts.map(p=>path.basename(p)),['Launcher-1.bin','Launcher-2.bin','Launcher-3.bin','Launcher-10.bin']);
 const g=tmp();try{fs.writeFileSync(path.join(g,'Game.exe'),head);fs.writeFileSync(path.join(g,'data.pac'),'x');assert.equal(D.innoDisc(g),null,'an installer exe with no split data is not this kind');
  fs.writeFileSync(path.join(g,'Game-1.bin'),'x');fs.writeFileSync(path.join(g,'Game.exe'),Buffer.from('MZ not inno'));assert.equal(D.innoDisc(g),null,'.bin parts beside a non-Inno exe');}
 finally{fs.rmSync(g,{recursive:true,force:true});}
}finally{fs.rmSync(d,{recursive:true,force:true});}});

test('innoArgs: silent, per user, no icons, the target folder',()=>{
 assert.deepEqual(D.innoArgs('X:\\games\\seifuku3','X:\\games\\install.log'),['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOICONS','/CURRENTUSER','/MERGETASKS="!desktopicon"','/DIR="X:\\games\\seifuku3"','/LOG="X:\\games\\install.log"']);
 assert.ok(!D.innoArgs('X:\\g').some(a=>a.startsWith('/LOG')));});

test('linkInPath: a target under a junction is named, a real folder is not',{skip:process.platform!=='win32'&&'junctions are Windows'},()=>{const d=tmp();try{
 const real=path.join(d,'real');fs.mkdirSync(real);const link=path.join(d,'work');fs.symlinkSync(real,link,'junction');
 assert.equal(D.linkInPath(path.join(link,'copies','seifuku3')),link);
 assert.equal(D.linkInPath(path.join(real,'copies','seifuku3')),'');
}finally{fs.rmSync(d,{recursive:true,force:true});}});
