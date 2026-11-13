// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// services/runtime-cg.cjs and its card wall source, against a dump folder laid out the way RuntimeCg.cpp writes it (the
// native side, with a stand-in game that shows some CGs and only preloads others, is native/runtimedump/selftest/run.ps1).
// No game is involved.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const PNG=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ffbf1e000502027fa1d5d9a40000000049454e44ae426082','hex');

function setup(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-rtcg-'));process.env.MEGULIT_RUNTIME_DUMP=path.join(base,'dump');
 for(const m of ['../services/runtime-dump.cjs','../services/runtime-cg.cjs','../services/card-wall.cjs'])delete require.cache[require.resolve(m)];
 const rd=require('../services/runtime-dump.cjs'),cg=require('../services/runtime-cg.cjs'),wall=require('../services/card-wall.cjs');
 wall._setRunner(jobs=>jobs.map(j=>{fs.mkdirSync(path.dirname(j.out),{recursive:true});fs.copyFileSync(j.in,j.out);return {ok:true,w:800,h:600};}));
 wall._setSpawnWarm(()=>{});
 const game=path.join(base,'Game');fs.mkdirSync(game);const exe=path.join(game,'game.exe');fs.writeFileSync(exe,'');
 const dir=rd.enable(game);fs.mkdirSync(path.join(dir,'cg'));
 const root=path.join(base,'megulit');fs.mkdirSync(root);
 const db={prepare:()=>({get:id=>id==='g1'?{id:'g1',title:'t',executable:exe,cover:''}:undefined,all:()=>[]})};
 return {base,game,exe,dir,root,db,cg,wall};}
const line=o=>JSON.stringify(o)+'\n';

test('lists recorded CGs once per CRC; skips missing files, bad names and paths out of the cg folder',()=>{
 const {dir,exe,cg}=setup();
 fs.writeFileSync(path.join(dir,'cg','04ff87f9_800x600.png'),PNG);fs.writeFileSync(path.join(dir,'cg','e83e8972_800x600.jpg'),PNG);fs.writeFileSync(path.join(dir,'secret.png'),PNG);
 fs.writeFileSync(path.join(dir,'cg.jsonl'),
  line({file:'cg/04ff87f9_800x600.png',source:'data.pak',how:'inplace',crc:'04ff87f9',w:800,h:600,fmt:'png'})+
  line({file:'cg/04ff87f9_800x600.png',source:'data.pak',how:'alloc',crc:'04ff87f9',w:800,h:600,fmt:'png'})+
  line({file:'cg/e83e8972_800x600.jpg',source:'gallery_c.jpg',how:'plain',crc:'e83e8972',w:800,h:600,fmt:'jpg'})+
  line({file:'cg/deadbeef_800x600.png',crc:'deadbeef',fmt:'png'})+
  line({file:'../secret.png',crc:'11111111',fmt:'png'})+'not json\n');
 const l=cg.list(exe);assert.deepEqual(l.map(x=>x.crc),['04ff87f9','e83e8972']);assert.equal(l[0].how,'inplace');
 assert.deepEqual(cg.sources(exe).map(s=>s.id),['mem:04ff87f9','mem:e83e8972']);
 assert.deepEqual(cg.list(path.join(path.dirname(exe),'..','Other','x.exe')),[]);});

test('card wall: recorded CGs are unlocked and openable; nothing else from memory is',()=>{
 const {dir,root,db,wall}=setup();
 fs.writeFileSync(path.join(dir,'cg','04ff87f9_800x600.png'),PNG);
 fs.writeFileSync(path.join(dir,'cg.jsonl'),line({file:'cg/04ff87f9_800x600.png',source:'data.pak',how:'inplace',crc:'04ff87f9',w:800,h:600,fmt:'png'}));
 const ids=wall.unlocked(db,root,'g1').map(x=>x.id);assert.deepEqual(ids,['mem:04ff87f9']);
 assert.match(wall.image(db,root,'g1','mem:04ff87f9').src,/^data:image\/png/);
 assert.throws(()=>wall.image(db,root,'g1','mem:9dc86319'),/CARD_SOURCE_LOCKED/);});

test('a TLG record (never confirmed by the DLL) is not offered as a picture',()=>{
 const {dir,exe,cg}=setup();fs.writeFileSync(path.join(dir,'cg','aaaaaaaa_800x600.tlg'),Buffer.from('TLG5.0\0raw'));
 fs.writeFileSync(path.join(dir,'cg.jsonl'),line({file:'cg/aaaaaaaa_800x600.tlg',crc:'aaaaaaaa',fmt:'tlg'}));
 assert.equal(cg.list(exe).length,1);assert.deepEqual(cg.sources(exe),[]);});

test('R18 filter: memory CGs (never rated) are left out',()=>{
 const {dir,root,db,wall}=setup();fs.writeFileSync(path.join(dir,'cg','04ff87f9_800x600.png'),PNG);
 fs.writeFileSync(path.join(dir,'cg.jsonl'),line({file:'cg/04ff87f9_800x600.png',crc:'04ff87f9',fmt:'png'}));
 fs.mkdirSync(path.join(root,'data','config'),{recursive:true});fs.writeFileSync(path.join(root,'data','config','native-preferences.json'),JSON.stringify({safe_cg:true}));
 assert.deepEqual(wall.unlocked(db,root,'g1').map(x=>x.id),[]);});

// End to end with the native self-test output, when run.ps1 has run on this machine with the Cg case (it leaves cg.log).
const selfOut=path.join(process.env.MEGULIT_WORK||'H:\\MeguLit-Work','runtime-dump-selftest','out64');
const hasCgRun=()=>{try{return fs.readdirSync(selfOut).some(k=>fs.existsSync(path.join(selfOut,k,'cg.log')));}catch{return false;}};
test('native self-test output: shown CGs readable, the preloaded one absent',{skip:!hasCgRun()},()=>{
 const work=path.join(process.env.MEGULIT_WORK||'H:\\MeguLit-Work','runtime-dump-selftest');
 process.env.MEGULIT_RUNTIME_DUMP=path.join(work,'out64');delete require.cache[require.resolve('../services/runtime-dump.cjs')];delete require.cache[require.resolve('../services/runtime-cg.cjs')];
 const cg=require('../services/runtime-cg.cjs');cg.settle(require('../services/runtime-dump.cjs').dirFor(path.join(work,'game64')));
 const l=cg.list(path.join(work,'game64','host.exe'),{settle:false});
 /* A (png) and C (jpg) confirmed by the DLL, F (TLG, shown) confirmed here and stored as png; G (TLG, preloaded) waits */
 assert.deepEqual(l.map(x=>x.fmt).sort(),['jpg','png','png']);for(const x of l){assert.equal(x.w,800);assert.equal(x.h,600);}
 assert.equal(l.filter(x=>x.how==='tlg').length,1);
 const dir=require('../services/runtime-dump.cjs').dirFor(path.join(work,'game64'));
 assert.equal(fs.readdirSync(path.join(dir,'cg-wait')).filter(n=>n.endsWith('.tlg')).length,1);});
const tlgs=dir=>fs.readdirSync(path.join(dir,'cg-wait')).filter(n=>n.endsWith('.tlg'));

/* TLG5 with raw channels (the inverse of cg-decoders tlg5): pixel(x,y) -> [r,g,b] */
function tlg5(w,h,px){const head=Buffer.alloc(11+13+4);head.write('TLG5.0\0raw\x1a','latin1');head[11]=3;head.writeUInt32LE(w,12);head.writeUInt32LE(h,16);head.writeUInt32LE(h,20);
 const ch=[0,1,2].map(()=>Buffer.alloc(w*h));
 for(let y=0;y<h;y++){let prev=[0,0,0];for(let x=0;x<w;x++){const p=px(x,y),u=y?px(x,y-1):[0,0,0];const d=[p[2]-u[2],p[1]-u[1],p[0]-u[0]];/* B G R */
  const db=d[0]-prev[0],dg=d[1]-prev[1],dr=d[2]-prev[2];ch[0][y*w+x]=(db-dg)&255;ch[1][y*w+x]=dg&255;ch[2][y*w+x]=(dr-dg)&255;prev=d;}}
 return Buffer.concat([head,...ch.flatMap(c=>{const m=Buffer.alloc(5);m[0]=1;m.writeUInt32LE(c.length,1);return [m,c];})]);}
function screen(cg,w,h,px){const rgba=Buffer.alloc(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=px(x,y);rgba.set([p[0],p[1],p[2],255],(y*w+x)*4);}
 const sig=cg._internal.grid(rgba,w,h),rec=Buffer.alloc(8+32*18);rec.writeUInt32LE(Math.floor(Date.now()/1000)+1,0);for(let i=0;i<sig.length;i++)rec[8+i]=sig[i];return rec;}
test('TLG: a waiting TLG that matches a logged screen becomes a png CG; one that never showed stays out',()=>{
 const {dir,exe,cg}=setup();const W=320,H=180,F=(x,y)=>x<W/3?[240,240,40]:[20,20,120],G=(x,y)=>((x>>4)&1)?[240,240,240]:[20,20,20];
 const now=Math.floor(Date.now()/1000);fs.mkdirSync(path.join(dir,'cg-wait'));
 fs.writeFileSync(path.join(dir,'cg-wait',`0000000f_${W}x${H}_${now}.tlg`),tlg5(W,H,F));fs.writeFileSync(path.join(dir,'cg-wait',`00000006_${W}x${H}_${now}.tlg`),tlg5(W,H,G));
 /* the decoder agrees with the encoder */
 const img=require('../services/cg-decoders.cjs').tlg(tlg5(W,H,F));assert.deepEqual([...img.rgba.subarray(0,4)],[240,240,40,255]);
 fs.writeFileSync(path.join(dir,'cg-screens.bin'),screen(cg,W,H,F));
 cg.settle(dir);
 const l=cg.list(exe,{settle:false});assert.deepEqual(l.map(x=>[x.crc,x.fmt,x.how]),[['0000000f','png','tlg']]);
 assert.deepEqual(cg.sources(exe,{settle:false}).map(s=>s.id),['mem:0000000f']);
 assert.deepEqual(tlgs(dir),[`00000006_${W}x${H}_${now}.tlg`]);
 /* a second settle reuses the cached signature (no decode) and changes nothing */
 assert.ok(fs.existsSync(path.join(dir,'cg-wait',`00000006_${W}x${H}_${now}.tlg.sig`)));cg.settle(dir);assert.equal(cg.list(exe,{settle:false}).length,1);
 /* after the wait time a never-shown TLG is deleted, never offered, and the screen log goes with it */
 cg.settle(dir,Date.now()+31*60*1000);assert.deepEqual(fs.readdirSync(path.join(dir,'cg-wait')),[]);assert.equal(cg.list(exe,{settle:false}).length,1);
 assert.equal(fs.existsSync(path.join(dir,'cg-screens.bin')),false);});

test('spoiler guard: a preloaded variant of the shown CG (other face in a few cells) is not unlocked with it',()=>{
 const {dir,exe,cg}=setup();const W=320,H=180,base=(x,y)=>x<W/3?[240,240,40]:[20,20,120],variant=(x,y)=>x>=200&&x<240&&y>=20&&y<60?[255,255,255]:base(x,y);
 const now=Math.floor(Date.now()/1000);fs.mkdirSync(path.join(dir,'cg-wait'));
 fs.writeFileSync(path.join(dir,'cg-wait',`000000a1_${W}x${H}_${now}.tlg`),tlg5(W,H,base));fs.writeFileSync(path.join(dir,'cg-wait',`000000b2_${W}x${H}_${now}.tlg`),tlg5(W,H,variant));
 fs.writeFileSync(path.join(dir,'cg-screens.bin'),screen(cg,W,H,base));
 cg.settle(dir);assert.deepEqual(cg.list(exe,{settle:false}).map(x=>x.crc),['000000a1']);assert.deepEqual(tlgs(dir),[`000000b2_${W}x${H}_${now}.tlg`]);
 /* the same rule in numbers: mean distance is small, one cell is far */
 const a=cg._internal.grid(Buffer.alloc(4),1,1);assert.equal(cg._internal.dist(a,a),0);});
