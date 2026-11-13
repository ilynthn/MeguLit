// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E560 SoftPal / Pal (時計仕掛けのレイライン): data.pac TEXT.DAT is read as the game's script (synthetic archive).
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const softpal=require('../services/original-engines/softpal.cjs'),scenes=require('../services/original-engines/scenes.cjs');
const KEY=(0x084DF873^0xFF987DEE)>>>0;
function encrypt(d){let sh=4;for(let i=0x10;i+4<=d.length;i+=4){d.writeUInt32LE((d.readUInt32LE(i)^KEY)>>>0,i);const x=d[i];d[i]=((x>>sh)|(x<<(8-sh)))&255;sh=(sh+1)&7;}return d;}
function textDat(list){
 const parts=[Buffer.from('$TEXT_LIST__','latin1'),Buffer.alloc(4)];parts[1].writeUInt32LE(list.length);
 list.forEach((b,i)=>{const id=Buffer.alloc(4);id.writeUInt32LE(i);parts.push(id,b,Buffer.from([0]));});
 let d=Buffer.concat(parts);d=Buffer.concat([d,Buffer.alloc((4-d.length%4)%4)]);return encrypt(d);}
// Shift-JIS bytes of the test strings
const S={line1:Buffer.from('817582a082ea82cd8176','hex'),name:Buffer.from('8FAC91BE984E','hex'),line2:Buffer.from('82a082a282a482a682a88142','hex'),fmt:Buffer.from('819A5B25645D','hex')};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-softpal-'));test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
function game(){const list=[S.fmt];for(let i=0;i<6;i++)list.push(S.line1,S.name,S.line2,S.name);const t=textDat(list);
 const head=Buffer.alloc(0x804+40);head.write('PAC ',0,'latin1');head.writeUInt32LE(1,8);head.write('TEXT.DAT',0x804,'latin1');head.writeUInt32LE(t.length,0x804+32);head.writeUInt32LE(head.length,0x804+36);
 const dir=path.join(tmp,'g');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'data.pac'),Buffer.concat([head,t]));return dir;}

test('TEXT.DAT in data.pac is decrypted and read without speaker names or format strings',()=>{
 const dir=game(),sc=softpal.scenes(dir);assert.strictEqual(sc.length,1);
 const {lines}=softpal.parse(sc[0].read());
 assert.ok(lines.length===12,'12 dialogue lines, got '+lines.length);
 assert.ok(lines.every(t=>t!=='小太郎'&&!t.includes('%')));
 assert.strictEqual(scenes.readable('softpal',dir),true);
});
test('a folder without a PAC archive is not SoftPal',()=>{assert.deepStrictEqual(softpal.scenes(tmp),[]);});
