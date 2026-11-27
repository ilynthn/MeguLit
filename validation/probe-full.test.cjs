// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-15 closed-beta full probe (services/probe-full.cjs, relay/src/probe-full.js, tools/probe-workbench.cjs).
   Covers: extraction takes script entries only (no image / voice / movie, by name and by magic), the exe cut down to
   code (offsets kept, big .rsrc and overlay gone, version read), gzip per item, the .mlfp round trip; the relay's chunked
   R2 multipart upload, resume after a broken connection (only the missing parts are sent again), duplicates, the
   maintainer's list / get / done / delete and the cron cleanup; the background queue sends it once and deletes the local
   file. No game, no window, no network: synthetic game folders, the relay in-process (D1 on node:sqlite, R2 in a Map). */
process.env.MEGULIT_RELAY_BASE??='off';
if(!process.env.MEGULIT_TEST_TMP&&require('node:fs').existsSync('H:\\MeguLit-Work'))process.env.MEGULIT_TEST_TMP=require('node:fs').mkdirSync('H:\\MeguLit-Work\\tmp',{recursive:true})||'H:\\MeguLit-Work\\tmp';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const fx=require('./helpers/adapter-fixtures.cjs');
const pf=require('../services/probe-full.cjs'),auto=require('../services/probe-auto.cjs'),pi=require('../services/probe-identity.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

/* ---- a synthetic game ----------------------------------------------------------------------------------------------- */
function xp3(entries){/* plain XP3 v1: data, then a raw index (flag 0) */
 const MAGIC=Buffer.from([0x58,0x50,0x33,0x0d,0x0a,0x20,0x0a,0x1a,0x8b,0x67,0x01]);const head=Buffer.alloc(19);MAGIC.copy(head);let at=19;const datas=[],files=[];
 const chunk=(tag,body)=>{const h=Buffer.alloc(12);h.write(tag,0,'latin1');h.writeBigUInt64LE(BigInt(body.length),4);return Buffer.concat([h,body]);};
 for(const e of entries){const data=e.zlib?zlib.deflateSync(e.data):e.data;datas.push(data);const name=Buffer.from(e.name,'utf16le');
  const info=Buffer.alloc(22);info.writeUInt32LE(e.encrypted?0x80000000:0,0);info.writeBigUInt64LE(BigInt(e.data.length),4);info.writeBigUInt64LE(BigInt(data.length),12);info.writeUInt16LE(e.name.length,20);
  const segm=Buffer.alloc(28);segm.writeUInt32LE(e.zlib?1:0,0);segm.writeBigUInt64LE(BigInt(at),4);segm.writeBigUInt64LE(BigInt(e.data.length),12);segm.writeBigUInt64LE(BigInt(data.length),20);
  const adlr=Buffer.alloc(4);files.push(chunk('File',Buffer.concat([chunk('info',Buffer.concat([info,name])),chunk('segm',segm),chunk('adlr',adlr)])));at+=data.length;}
 const index=Buffer.concat(files),flag=Buffer.alloc(9);flag[0]=0;flag.writeBigUInt64LE(BigInt(index.length),1);head.writeBigUInt64LE(BigInt(at),11);
 return Buffer.concat([head,...datas,flag,index]);}
const RSRC=2<<20,OVERLAY=1<<20;
function pe({text=crypto.randomBytes(0x1000),product='テストゲーム'}={}){/* MZ, PE, .text (code) + .rsrc (version) + overlay */
 const buf=Buffer.alloc(0x1400+RSRC+OVERLAY);buf.write('MZ',0,'latin1');buf.writeUInt32LE(0x40,0x3c);buf.writeUInt32LE(0x4550,0x40);buf.writeUInt16LE(0x14c,0x44);buf.writeUInt16LE(2,0x46);buf.writeUInt16LE(0xe0,0x54);
 const sec=(i,name,va,rawAt,rawSize,flags)=>{const p=0x40+24+0xe0+i*40;buf.write(name,p,'latin1');buf.writeUInt32LE(rawSize,p+8);buf.writeUInt32LE(va,p+12);buf.writeUInt32LE(rawSize,p+16);buf.writeUInt32LE(rawAt,p+20);buf.writeUInt32LE(flags,p+36);};
 sec(0,'.text',0x1000,0x400,0x1000,0x60000020);sec(1,'.rsrc',0x2000,0x1400,RSRC,0x40000040);text.copy(buf,0x400);
 crypto.randomBytes(RSRC-0x400).copy(buf,0x1800);const fixed=Buffer.alloc(52);fixed.writeUInt32LE(0xfeef04bd,0);fixed.writeUInt32LE(0x00010002,8);fixed.writeUInt32LE(0x00030004,12);fixed.copy(buf,0x1500);
 Buffer.from('ProductName\0\0'+product+'\0','utf16le').copy(buf,0x1600);crypto.randomBytes(OVERLAY).copy(buf,0x1400+RSRC);return buf;}
const KS='*start\r\n[cm]\r\nこれはテストの台詞です。\r\n@jump storage="next.ks"\r\n'.repeat(400);
function game(prefix){const r=fx.root(prefix),dir=path.join(r,'Games','test');fs.mkdirSync(path.join(dir,'data'),{recursive:true});fs.mkdirSync(path.join(dir,'voice'));fs.mkdirSync(path.join(dir,'plugin'));
 const exe=path.join(dir,'Game.exe');fs.writeFileSync(exe,pe());fs.writeFileSync(path.join(dir,'chs.exe'),pe({product:'汉化'}));fs.writeFileSync(path.join(dir,'plugin','krglhwebp.dll'),pe());
 const ogg=Buffer.concat([Buffer.from('OggS'),crypto.randomBytes(20000)]),png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47]),crypto.randomBytes(20000)]);
 fs.writeFileSync(path.join(dir,'data.xp3'),xp3([{name:'scenario/first.ks',data:Buffer.from(KS,'utf16le'),zlib:true},{name:'scenario/enc.ks',data:crypto.randomBytes(5000),encrypted:true},
  {name:'image/bg01.png',data:png},{name:'voice/v001.ogg',data:ogg},{name:'system/sound.dat',data:ogg},{name:'system/Config.tjs',data:Buffer.from('var x = 1;\n'.repeat(50))}]));
 fs.writeFileSync(path.join(dir,'patch.xp3'),xp3([{name:'scenario/first.ks',data:Buffer.from(KS.replace(/これはテストの台詞です。/g,'这是测试台词。'),'utf16le')},{name:'bg/cn.png',data:png}]));
 fs.writeFileSync(path.join(dir,'data','scene.pak'),Buffer.concat([Buffer.from('UNKNOWNPAK0'),crypto.randomBytes(3<<20)]));
 fs.writeFileSync(path.join(dir,'data','bgm.pak'),Buffer.concat([Buffer.from('OggS'),crypto.randomBytes(200000)]));
 fs.writeFileSync(path.join(dir,'voice','v1.ogg'),ogg);fs.writeFileSync(path.join(dir,'cg.png'),png);fs.writeFileSync(path.join(dir,'op.mp4'),crypto.randomBytes(30000));
 fs.writeFileSync(path.join(dir,'startup.ks'),Buffer.from('[call storage="first.ks"]\r\n'));
 return {root:r,dir,exe,result:{schema:'megulit.probe-result',version:1,step:'decrypt-failed',detected:null,engines:[],_archives:[path.join(dir,'data','scene.pak')]}};}

test('collect: scripts and code only, never images / voices / movies; exe slim with the same offsets; .mlfp round trip',()=>{
 const g=game('megulit-pf-collect-'),out=path.join(g.root,'out');
 const c=pf.collect({dir:g.dir,executable:g.exe,result:g.result,out,identity:'a'.repeat(64),title:'テスト'});
 assert.ok(c.file&&fs.existsSync(c.file));assert.equal(path.basename(c.file),c.sha256+'.mlfp');assert.equal(sha(fs.readFileSync(c.file)),c.sha256);
 const {manifest:m,data}=pf.open(fs.readFileSync(c.file));const paths=m.items.map(i=>i.path);
 for(const want of ['data.xp3/scenario/first.ks','data.xp3/scenario/enc.ks','data.xp3/system/Config.tjs','patch.xp3/scenario/first.ks','startup.ks','Game.exe','chs.exe','plugin/krglhwebp.dll','data/scene.pak#head'])assert.ok(paths.includes(want),want);
 {const whole=m.items.find(i=>i.path==='data/scene.pak#head');assert.ok(whole.whole&&whole.size===(3<<20)+11,'a script-named archive under ENTRY_MAX goes whole');}
 for(const p of paths)assert.doesNotMatch(p,/\.(png|ogg|mp4)$|bgm\.pak|voice\//i,'no media: '+p);
 assert.ok(m.dropped.some(d=>d.entry==='system/sound.dat'&&d.reason==='media'),'a script-named entry holding Ogg is dropped by magic');
 assert.equal(m.items.find(i=>i.path==='data.xp3/scenario/enc.ks').encrypted,true,'encrypted entries go as stored');
 /* the Japanese script comes back byte for byte; the Chinese patch script is there too */
 const ix=p=>paths.indexOf(p);assert.equal(data(ix('data.xp3/scenario/first.ks')).toString('utf16le'),KS);assert.match(data(ix('patch.xp3/scenario/first.ks')).toString('utf16le'),/这是测试台词/);
 /* exe: code kept at its offset, .rsrc (2 MiB) zeroed, overlay cut, version read */
 const orig=fs.readFileSync(g.exe),slim=data(ix('Game.exe')),it=m.items[ix('Game.exe')];
 assert.equal(slim.length,0x1400+RSRC,'overlay cut');assert.ok(slim.subarray(0x400,0x1400).equals(orig.subarray(0x400,0x1400)),'.text kept in place');
 assert.ok(slim.subarray(0x1400).every(b=>b===0),'.rsrc zeroed');assert.deepEqual(it.pe.dropped,['.rsrc']);assert.equal(it.pe.overlay,OVERLAY);
 assert.equal(m.versions['Game.exe'].fileVersion,'1.2.3.4');assert.equal(m.versions['Game.exe'].strings.ProductName,'テストゲーム');assert.equal(m.versions['chs.exe'].strings.ProductName,'汉化');
 /* every file listed with its size; exes / archives / scripts hashed */
 const f=Object.fromEntries(m.files.map(x=>[x.path,x]));assert.equal(f['voice/v1.ogg']?.size,20004);assert.equal(f['Game.exe'].sha256,sha(orig));assert.equal(f['data.xp3'].sha256,sha(fs.readFileSync(path.join(g.dir,'data.xp3'))));
 /* gzip + the slim PE: the exe's 2 MiB random .rsrc was dropped, so the exe item is a few KiB, not ~2 MiB */
 assert.ok(it.packed<64*1024,'exe compressed to '+it.packed+' (rsrc dropped)');for(const i of m.items)if(i.same===undefined)assert.ok(i.packed>0);
 /* unpack (workbench) */
 const u=pf.unpack(c.file,path.join(g.root,'unpacked'));assert.equal(u.items,m.items.length);
 assert.equal(fs.readFileSync(path.join(g.root,'unpacked','archives','data.xp3','scenario','first.ks')).toString('utf16le'),KS);
 assert.ok(fs.existsSync(path.join(g.root,'unpacked','bin','Game.exe')));assert.ok(fs.existsSync(path.join(g.root,'unpacked','versions.json')));
});

test('collect: the budget keeps the exe and the scripts first, then stops (dropped says why)',()=>{
 const g=game('megulit-pf-budget-');const c=pf.collect({dir:g.dir,executable:g.exe,result:g.result,out:path.join(g.root,'out'),packedMax:200*1024});
 const {manifest:m}=pf.open(fs.readFileSync(c.file));assert.ok(m.items.some(i=>i.path==='Game.exe'),'main exe first');
 assert.ok(m.dropped.some(d=>d.reason==='packed-budget'));assert.ok(m.budget.packed<=200*1024);
});

/* ---- the relay in-process ---------------------------------------------------------------------------------------------- */
const relayDir=path.join(__dirname,'..','relay'),MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATION);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});return {prepare:sql=>stmt(sql),raw:db};}
function r2(){const store=new Map(),mps=new Map();
 return {store,mps,put:async(k,b)=>{store.set(k,Buffer.from(b));},get:async k=>store.has(k)?{body:store.get(k)}:null,delete:async k=>{store.delete(k);},
  createMultipartUpload:async key=>{const id=crypto.randomUUID();mps.set(id,{key,parts:new Map()});return {key,uploadId:id};},
  resumeMultipartUpload:(key,id)=>({uploadPart:async(n,b)=>{const m=mps.get(id);if(!m)throw Error('NoSuchUpload');const etag=sha(Buffer.from(b));m.parts.set(n,{etag,b:Buffer.from(b)});return {partNumber:n,etag};},
   complete:async list=>{const m=mps.get(id);if(!m)throw Error('NoSuchUpload');store.set(key,Buffer.concat(list.map(p=>{const x=m.parts.get(p.partNumber);if(!x||x.etag!==p.etag)throw Error('BadPart');return x.b;})));mps.delete(id);},
   abort:async()=>{mps.delete(id);}})};}
const ENV={DB:d1(),BUCKET:r2(),LINK_SECRET:'link',HASH_SALT:'salt',ADAPTER_ADMIN_TOKEN:'admin-token'};
let mod;const relay=async()=>mod??=await import(pathToFileURL(path.join(relayDir,'src','worker.js')).href);
const BASE='https://relay.test/api/probe/full';
/* one user (IP); breakAfter: the connection drops after that many part uploads */
function user(ip,{breakAfter=Infinity}={}){const f=async(url,init={})=>{if(String(url).includes('/part?')){f.parts.push(Number(new URL(url).searchParams.get('part')));if(f.parts.length>breakAfter)throw Object.assign(Error('reset'),{name:'TypeError'});}
  f.calls++;const {handle}=await relay();return handle(new Request(url,{method:init.method||'GET',headers:{'cf-connecting-ip':ip,...(init.headers||{})},body:init.body}),ENV,new Date());};f.calls=0;f.parts=[];return f;}
const maint=async(method,route,body)=>{const {handle}=await relay();return handle(new Request('https://relay.test'+route,{method,headers:{authorization:'Bearer admin-token','content-type':'application/json'},body:body?JSON.stringify(body):undefined}),ENV,new Date());};
const rows=sql=>ENV.DB.raw.prepare(sql).all();
/* a .mlfp of several parts (random, so gzip cannot shrink it) */
function bigFile(root,size){const dir=pf.fullDir(root);fs.mkdirSync(dir,{recursive:true});const b=crypto.randomBytes(size);const f=path.join(dir,sha(b)+'.mlfp');fs.writeFileSync(f,b);return {file:f,bytes:b};}

test('relay: chunked upload to R2, resume after a dropped connection sends only the missing parts',async()=>{
 const root=fx.root('megulit-pf-relay-'),id=sha('game-1'),{file,bytes}=bigFile(root,pf.CHUNK*2+12345);
 const u1=user('198.51.100.1',{breakAfter:1});const a=await pf.upload(root,{file,identity:id,title:'テスト',fetcher:u1,base:BASE});
 assert.equal(a.state,'failed');assert.ok(fs.existsSync(file),'kept for the resume');assert.ok(fs.existsSync(file.replace(/\.mlfp$/,'.json')));
 assert.deepEqual(rows('SELECT part FROM probe_full_parts').map(r=>r.part),[0]);
 const u2=user('198.51.100.1');const b=await pf.upload(root,{file,identity:id,title:'テスト',fetcher:u2,base:BASE});
 assert.equal(b.state,'uploaded');assert.deepEqual(u2.parts,[1,2],'part 0 not sent again');
 assert.ok(!fs.existsSync(file)&&!fs.existsSync(file.replace(/\.mlfp$/,'.json')),'deleted once the relay has it');
 const key=`probe-full/${id}/${sha(bytes)}.mlfp`;assert.ok(ENV.BUCKET.store.get(key).equals(bytes),'R2 object = the file');assert.equal(ENV.BUCKET.mps.size,0);
 assert.equal(rows('SELECT state FROM probe_full')[0].state,'ready');assert.equal(rows('SELECT COUNT(*) n FROM probe_full_parts')[0].n,0);
 /* a second player with the same game: duplicate, nothing sent */
 const again=bigFile(root,pf.CHUNK+5),u3=user('198.51.100.2');const c=await pf.upload(root,{file:again.file,identity:id,fetcher:u3,base:BASE});
 assert.equal(c.state,'duplicate');assert.equal(u3.parts.length,0);assert.ok(!fs.existsSync(again.file));assert.equal(rows('SELECT reporters FROM probe_full')[0].reporters,2);
});

test('relay: bad parts are refused (size, checksum, unknown upload, oversize start)',async()=>{
 const {handle}=await relay(),id=sha('game-2'),size=pf.CHUNK+10;
 const call=(url,init)=>handle(new Request(url,{...init,headers:{'cf-connecting-ip':'198.51.100.7',...(init.headers||{})}}),ENV,new Date());
 const big=await call(BASE+'/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,identity:id,size:200<<20,sha256:'b'.repeat(64),parts:40,chunk:pf.CHUNK})});assert.equal(big.status,400);
 const s=await (await call(BASE+'/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,identity:id,size,sha256:'c'.repeat(64),parts:2,chunk:pf.CHUNK})})).json();assert.ok(s.upload);
 const short=Buffer.alloc(100);assert.equal((await call(BASE+'/part?upload='+s.upload+'&part=0',{method:'PUT',headers:{'x-sha256':sha(short)},body:short})).status,400,'a middle part must be CHUNK bytes');
 const last=Buffer.alloc(10,1);assert.equal((await call(BASE+'/part?upload='+s.upload+'&part=1',{method:'PUT',headers:{'x-sha256':'0'.repeat(64)},body:last})).status,409,'checksum');
 assert.equal((await call(BASE+'/part?upload='+crypto.randomUUID()+'&part=0',{method:'PUT',headers:{'x-sha256':sha(last)},body:last})).status,404);
 const done=await call(BASE+'/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({upload:s.upload})});assert.equal(done.status,409,'parts missing');
});

test('maintainer: list / get / done / delete need the token; done keeps apps from resending; cleanup clears old files',async()=>{
 const root=fx.root('megulit-pf-maint-'),id=sha('game-3'),{file,bytes}=bigFile(root,4000);
 assert.equal((await pf.upload(root,{file,identity:id,title:'ゲーム3',fetcher:user('198.51.100.3'),base:BASE})).state,'uploaded');
 const {handle}=await relay();assert.equal((await handle(new Request('https://relay.test/api/probe/full/list'),ENV,new Date())).status,401);
 const l=await (await maint('GET','/api/probe/full/list')).json();const g=l.games.find(x=>x.identity===id);assert.equal(g.title,'ゲーム3');assert.equal(g.size,4000);
 const got=Buffer.from(await (await maint('GET','/api/probe/full/get?identity='+id)).arrayBuffer());assert.ok(got.equals(bytes));
 assert.equal((await (await maint('POST','/api/probe/full/done',{identity:id})).json()).done,true);
 assert.ok(![...ENV.BUCKET.store.keys()].some(k=>k.includes(id)),'R2 file deleted');
 const again=bigFile(root,4001);assert.equal((await pf.upload(root,{file:again.file,identity:id,fetcher:user('198.51.100.4'),base:BASE})).state,'duplicate','done: not sent again');
 /* delete: gone completely, may come again */
 const id2=sha('game-4'),f2=bigFile(root,5000);await pf.upload(root,{file:f2.file,identity:id2,fetcher:user('198.51.100.5'),base:BASE});
 await maint('POST','/api/probe/full/delete',{identity:id2});assert.equal(rows(`SELECT COUNT(*) n FROM probe_full WHERE identity='${id2}'`)[0].n,0);
 /* cleanup: an expired file, a stale unfinished upload, an old tombstone */
 const id3=sha('game-5'),f3=bigFile(root,6000);await pf.upload(root,{file:f3.file,identity:id3,fetcher:user('198.51.100.6'),base:BASE});
 const id4=sha('game-6'),f4=bigFile(root,pf.CHUNK*2);await pf.upload(root,{file:f4.file,identity:id4,fetcher:user('198.51.100.8',{breakAfter:1}),base:BASE});
 assert.ok(ENV.BUCKET.mps.size>=1,'id4 left an open multipart upload');
 const {cleanupProbeFull}=await import(pathToFileURL(path.join(relayDir,'src','probe-full.js')).href);
 const later=new Date(Date.now()+31*86400000);const r=await cleanupProbeFull(ENV,later);
 assert.ok(r.removed>=3,'removed '+r.removed);assert.equal(ENV.BUCKET.mps.size,0,'every open multipart aborted');
 assert.ok(![...ENV.BUCKET.store.keys()].some(k=>k.startsWith('probe-full/')),'R2 empty');assert.equal(rows('SELECT COUNT(*) n FROM probe_full')[0].n,0);
 /* the cron runs it */
 const toml=fs.readFileSync(path.join(relayDir,'src','worker.js'),'utf8');assert.match(toml,/cleanupProbeFull\(env/);
});

test('queue: a problem game gets its full probe once, the local file goes; nothing sent again next run',async()=>{
 const g=game('megulit-pf-auto-');const executable=g.exe;
 fs.mkdirSync(path.join(g.root,'data','adapter-probe'),{recursive:true});
 fs.writeFileSync(path.join(g.root,'data','adapter-probe','state.json'),JSON.stringify({version:1,run:null,results:{g1:{...g.result,title:'テスト',stamp:'s',at:Date.now(),inventory:{files:1,bytes:1,ext:{},archives:[]}}}}));
 const db=fx.db([{id:'g1',title:'テスト',executable}]);let collected=0;
 const fuller=async(game,result,job)=>{collected++;return pf.collect({dir:path.dirname(game.executable),executable:game.executable,result,...job});};
 const f=user('198.51.100.9');const opts={wait:async()=>{},probeFirst:false,fetcher:f,endpoint:'https://relay.test/api/probe',hasEndpoint:'https://relay.test/api/probe/has',fullBase:BASE,sampler:async()=>({samples:[],keys:[]}),fuller};
 /* on by default since 2026-11-28; with the switch turned off nothing of the game is collected or sent */
 require('../services/adapter-contrib.cjs').setConsent(g.root,false,{source:'test'});
 const r0=await auto.run(g.root,db,opts);assert.equal(r0.full.g1,undefined,'no full upload with the switch off');assert.equal(collected,0,'nothing collected with the switch off');
 require('../services/adapter-contrib.cjs').setConsent(g.root,true,{source:'test'});
 const r=await auto.run(g.root,db,opts);assert.equal(r.full.g1,'sent');assert.equal(collected,1);
 assert.deepEqual(fs.readdirSync(pf.fullDir(g.root)),[],'local full probe deleted');
 const id=pi.identity({executable,result:g.result,vndb:''}).id;const row=rows(`SELECT * FROM probe_full WHERE identity='${id}'`)[0];assert.equal(row.state,'ready');
 const {manifest}=pf.open(ENV.BUCKET.store.get(row.object_key));assert.equal(manifest.identity,id);assert.ok(manifest.items.some(i=>i.path==='data.xp3/scenario/first.ks'));
 const st=auto.status(g.root);assert.equal(st.games.g1.full.state,'sent');assert.ok(st.log.some(x=>x.kind==='full'));
 const r2run=await auto.run(g.root,db,opts);assert.equal(r2run.full.g1,'skipped');assert.equal(collected,1,'not collected again');
});
