// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E596 compressed samples (user 2026-11-14): desensitized data is mostly repeated placeholders, so whole scripts and
   archive heads / tails go up gzip-compressed; caps count the compressed size; the manifest shows raw and sent sizes;
   the width of every character is kept, so offsets in the sample are offsets in the file. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fx=require('./helpers/adapter-fixtures.cjs'),d=require('../services/desensitize.cjs'),sample=require('../services/adapter-sample.cjs');
const R=fx.root('megulit-compress-');
const script=n=>{const parts=[];let size=0;for(let i=0;size<n;i++){const b=fx.scene(i%40,12);parts.push(b);size+=b.length;}return Buffer.concat(parts).subarray(0,n);};
/* an index of 20 000 records {u32 offset, u32 size, u32 unpacked, char name[36]} (Shift-JIS names) */
function index(n=20000){const b=Buffer.alloc(n*48);for(let i=0;i<n;i++){b.writeUInt32LE(16+i*4096,i*48);b.writeUInt32LE(3000+i%900,i*48+4);b.writeUInt32LE(9000+i%977,i*48+8);fx.sjis('シナリオ'+String(i).padStart(5,'0')+'.ks').copy(b,i*48+12);}return b;}
const ratio=(s)=>{const z=d.sampleSizes(s);return z.raw/z.packed;};

test('measured: a desensitized script compresses ~100×, an index table several times, an encrypted archive to its structure',()=>{
 const s=d.sample(script(1<<20),{max:1<<20,compress:true});assert.ok(ratio(s)>=50,'script ×'+ratio(s).toFixed(0));
 const ix=d.sample(index(),{max:20000*48,compress:true});assert.ok(ratio(ix)>=3,'index ×'+ratio(ix).toFixed(1));
 const arc=Buffer.concat([crypto.randomBytes(4<<20),index(5000)]);const a=d.sample(arc,{max:arc.length,compress:true});
 assert.ok(a.opaque.length>=1000,'encrypted blocks dropped');assert.ok(ratio(a)>=20,'archive ×'+ratio(a).toFixed(0));
 /* width kept: the sample inflates to exactly the bytes it covers */
 assert.equal(d.partBytes(s.parts[0]).length,1<<20);assert.equal(s.parts[0].len,1<<20);
 /* a part never inflates past its declared length */
 assert.equal(d.partBytes({...s.parts[0],len:100}).length,0);
});
test('archive: an index too big for the old 64 KB head now goes up whole, names as placeholders, offsets intact',()=>{
 const dir=path.join(R,'games','Big Index');fs.mkdirSync(dir,{recursive:true});
 const ix=index(),body=crypto.randomBytes(3<<20),head=Buffer.alloc(16);head.write('BIGX',0,'latin1');head.writeUInt32LE(16+body.length,4);head.writeUInt32LE(ix.length,8);
 const file=path.join(dir,'data.pak'),arc=Buffer.concat([head,body,ix]);fs.writeFileSync(file,arc);
 const s=sample.archiveSample(file,dir,{raw:0});assert.ok(s.sample,JSON.stringify(s).slice(0,200));
 assert.ok(s.raw>=arc.length,'the whole archive was sampled');assert.ok(s.packed<=sample.SAMPLE_PACKED_MAX);assert.ok(s.packed<ix.length,'sent: '+s.packed+' bytes for a '+ix.length+'-byte index');
 const part=s.sample.parts.find(p=>p.at<=16+body.length&&p.at+p.len>=arc.length);assert.ok(part);const bytes=d.partBytes(part),at=16+body.length-part.at;
 for(let i=0;i<20000;i+=997){assert.equal(bytes.readUInt32LE(at+i*48),16+i*4096,'offset of record '+i);assert.equal(bytes.readUInt32LE(at+i*48+4),3000+i%900);}
 const names=new TextDecoder('shift_jis').decode(bytes.subarray(at,at+48*50));assert.ok(!names.includes('シナリオ'));assert.ok(names.includes('アアアア00000.ks'),'names masked in place, ASCII kept');
});
test('manifest: every sample shows its raw size and what is actually sent',async()=>{
 const s=d.sample(script(256<<10),{max:256<<10,compress:true});
 const fake={games:[{key:'a'.repeat(64),title:'t',step:'parse-failed',detail:'',samples:[{name:'s.ks',role:'script',size:256<<10,sample:s}],keys:[]}]};
 const sizes=d.sampleSizes(s);assert.equal(sizes.raw,256<<10);assert.ok(sizes.packed<sizes.raw/20);
 /* manifestOf is internal: go through manifest() on a stored bundle */
 const body=Buffer.from(JSON.stringify({schema:'megulit.probe-bundle',version:1,...fake}));const hash=crypto.createHash('sha256').update(body).digest('hex');
 fs.mkdirSync(path.join(R,'data','adapter-probe','outbox'),{recursive:true});fs.writeFileSync(path.join(R,'data','adapter-probe','outbox',hash+'.json'),body);
 const item=sample.manifest(R,hash).manifest[0].items.find(i=>i.kind==='sample');assert.equal(item.raw,256<<10);assert.equal(item.packed,sizes.packed);assert.ok(item.bytes>0&&item.bytes<item.raw);
});
test('privacy unchanged: nothing of any line inside the compressed parts, verify() on every stretch',()=>{
 const mixed=Buffer.concat([script(300<<10),crypto.randomBytes(64<<10),Buffer.from(fx.LINES.join('\n'),'utf16le'),script(100<<10)]);
 const s=d.sample(mixed,{max:mixed.length,compress:true});assert.ok(s);
 const bytes=Buffer.concat(s.parts.map(d.partBytes));assert.equal(bytes.length,mixed.length);
 for(const enc of ['shift_jis','utf-16le','utf-8'])for(const line of fx.LINES){const t=new TextDecoder(enc).decode(bytes);for(let i=0;i+1<line.length;i++){const pair=line.slice(i,i+2);if(/[あア亜、。！？]/.test(pair))continue;assert.ok(!t.includes(pair),enc+' '+pair);}}
 assert.equal(d.textRuns(bytes).length,0);
});
