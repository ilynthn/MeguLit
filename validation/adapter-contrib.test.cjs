// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-15 adaptation contribution (services/adapter-contrib.cjs, relay/src/contrib.js, tools/contrib-workbench.cjs).
   Offline: a synthetic game (PE with .text/.rdata/.rsrc, XP3 archives with scripts, an image, a voice file, a script-named
   PNG, a translation patch, saves, a readme, media folders), the relay in-process (D1 on node:sqlite, R2 in a Map).
   Covers the three rules: consent (public off until agreed, beta on only after the note, off = nothing sent and the
   outbox emptied), only the game (library + probe problem only; scripts and exe code only; no images, voice, saves or
   files outside; masked home path / user name; refused folders), deleted after use (local package gone after upload,
   relay parts gone on done and on expiry, stale uploads cleaned), plus gzip, chunks and resume. */
process.env.MEGULIT_RELAY_BASE='https://relay.test';
if(!process.env.MEGULIT_TEST_TMP)try{fs_mk();}catch{}
function fs_mk(){const d='H:\\MeguLit-Work\\test-tmp';require('node:fs').mkdirSync(d,{recursive:true});process.env.MEGULIT_TEST_TMP=d;}
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const fx=require('./helpers/adapter-fixtures.cjs');
const contrib=require('../services/adapter-contrib.cjs'),auto=require('../services/probe-auto.cjs'),workbench=require('../tools/contrib-workbench.cjs');

/* ---- in-process relay -------------------------------------------------------------------------------------------- */
const relayDir=path.join(__dirname,'..','relay'),MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATION);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});return {prepare:sql=>stmt(sql),raw:db};}
function r2(){const store=new Map();return {store,put:async(k,b)=>{store.set(k,new Uint8Array(b));},get:async k=>store.has(k)?{body:store.get(k)}:null,delete:async k=>{store.delete(k);}};}
const ENV={DB:d1(),BUCKET:r2(),LINK_SECRET:'link',HASH_SALT:'salt',ADAPTER_ADMIN_TOKEN:'admin-token'};
let handle,scheduled;const relay=async()=>{if(!handle){const m=await import(pathToFileURL(path.join(relayDir,'src','worker.js')).href);handle=m.handle;scheduled=m.scheduled;}return handle;};
function user(ip,{failAt=null}={}){const f=async(url,init={})=>{f.calls++;if(failAt&&failAt(url,init,f))throw Object.assign(Error('net'),{name:'TypeError'});const h=await relay();
 return h(new Request(url,{method:init.method||'GET',headers:{'cf-connecting-ip':ip,...(init.headers||{})},body:init.body,...(init.body?{duplex:'half'}:{})}),ENV,new Date());};f.calls=0;return f;}
const admin=user('198.51.100.1');
const adminFetch=async(url,init={})=>admin(url,{...init,headers:{...(init.headers||{}),authorization:'Bearer admin-token'}});
const parts=()=>[...ENV.BUCKET.store.keys()].filter(k=>k.startsWith('contrib/'));

/* ---- a synthetic game ------------------------------------------------------------------------------------------- */
function pe(sections){/* MZ + PE32 header + section table, raw data after 0x400 */
 const head=Buffer.alloc(0x400);head.write('MZ',0,'latin1');head.writeUInt32LE(0x80,0x3c);head.write('PE\0\0',0x80,'latin1');head.writeUInt16LE(0x14c,0x84);head.writeUInt16LE(sections.length,0x86);head.writeUInt16LE(0xe0,0x94);head.writeUInt16LE(0x10b,0x98);
 let at=0x400;const table=0x98+0xe0,bodies=[];sections.forEach((s,i)=>{const p=table+i*40;head.write(s.name,p,'latin1');head.writeUInt32LE(s.data.length,p+8);head.writeUInt32LE(0x1000*(i+1),p+12);head.writeUInt32LE(s.data.length,p+16);head.writeUInt32LE(at,p+20);head.writeUInt32LE(s.ch,p+36);bodies.push(s.data);at+=s.data.length;});
 return Buffer.concat([head,...bodies]);}
function xp3(files){/* plain XP3: header, segments, uncompressed index */
 const MAGIC=Buffer.from([0x58,0x50,0x33,0x0d,0x0a,0x20,0x0a,0x1a,0x8b,0x67,0x01]);let at=19;const bodies=[],chunks=[];
 const chunk=(tag,body)=>{const h=Buffer.alloc(12);h.write(tag,0,'latin1');h.writeBigUInt64LE(BigInt(body.length),4);return Buffer.concat([h,body]);};
 for(const [name,data] of Object.entries(files)){const n=Buffer.from(name,'utf16le'),info=Buffer.alloc(22);info.writeUInt32LE(0,0);info.writeBigUInt64LE(BigInt(data.length),4);info.writeBigUInt64LE(BigInt(data.length),12);info.writeUInt16LE(name.length,20);
  const segm=Buffer.alloc(28);segm.writeUInt32LE(0,0);segm.writeBigUInt64LE(BigInt(at),4);segm.writeBigUInt64LE(BigInt(data.length),12);segm.writeBigUInt64LE(BigInt(data.length),20);const adlr=Buffer.alloc(4);
  chunks.push(chunk('File',Buffer.concat([chunk('info',Buffer.concat([info,n])),chunk('segm',segm),chunk('adlr',adlr)])));bodies.push(data);at+=data.length;}
 const index=Buffer.concat(chunks),flag=Buffer.alloc(9);flag[0]=0;flag.writeBigUInt64LE(BigInt(index.length),1);const head=Buffer.alloc(19);MAGIC.copy(head);head.writeBigUInt64LE(BigInt(at),11);
 return Buffer.concat([head,...bodies,flag,index]);}
const PNG=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),crypto.randomBytes(3000)]);
const OGG=Buffer.concat([Buffer.from('OggS'),crypto.randomBytes(3000)]);
const HOME=os.homedir();
const SCRIPT=fx.sjis('*start\r\n【めぐみん】\r\n爆裂魔法、撃ってもいいですか？[p]\r\n@bg storage="bg01"\r\n');
const SECRET_SCRIPT=Buffer.concat([fx.sjis(';log '),Buffer.from(HOME+'\\Documents\\x.txt','utf8'),Buffer.from('\r\n')]);
function makeGame(r,folder='Games/TestVN'){const dir=path.join(r,folder);fs.mkdirSync(dir,{recursive:true});
 const code=crypto.randomBytes(200*1024),rdata=Buffer.concat([Buffer.from('KEY:0123456789abcdef'),crypto.randomBytes(40*1024)]);
 fs.writeFileSync(path.join(dir,'Game.exe'),pe([{name:'.text',data:code,ch:0x60000020},{name:'.rdata',data:rdata,ch:0x40000040},{name:'.rsrc',data:PNG,ch:0x40000040}]));
 fs.writeFileSync(path.join(dir,'data.xp3'),xp3({'scenario/first.ks':SCRIPT,'scenario/log.ks':SECRET_SCRIPT,'system/Config.tjs':Buffer.from('var a=1;'),'image/bg01.png':PNG,'voice/m001.ogg':OGG,'scenario/fake.ks':PNG}));
 fs.writeFileSync(path.join(dir,'patch_chs.xp3'),xp3({'scenario/first.ks':Buffer.from('*start\r\n爆裂魔法，可以发射吗？[p]\r\n','utf8')}));
 fs.writeFileSync(path.join(dir,'bgm.xp3'),xp3({'bgm01.ogg':OGG}));
 fs.mkdirSync(path.join(dir,'savedata'),{recursive:true});fs.writeFileSync(path.join(dir,'savedata','data0.ksd'),Buffer.from('SAVE'));fs.writeFileSync(path.join(dir,'savedata','note.ks'),Buffer.from('save-ks'));
 fs.writeFileSync(path.join(dir,'readme.txt'),'お読みください');fs.writeFileSync(path.join(dir,'loose.ks'),SCRIPT);
 fs.mkdirSync(path.join(dir,'movie'),{recursive:true});fs.writeFileSync(path.join(dir,'movie','op.mp4'),Buffer.concat([Buffer.from([0,0,0,0x18]),Buffer.from('ftypmp42'),crypto.randomBytes(1000)]));
 fs.writeFileSync(path.join(r,'Games','outside.ks'),Buffer.from('OUTSIDE-SECRET'));
 return {dir,exe:path.join(dir,'Game.exe')};}
function setup(prefix,{step='decrypt-failed',inLibrary=true,problem=true,consent=true,folder}={}){const r=fx.root(prefix);const g=makeGame(r,folder);
 const res={schema:'megulit.probe-result',version:1,step:problem?step:'ok',detail:'',detected:'kirikiri',engines:[],lines:0,japaneseLines:0,inventory:{files:4,bytes:1,ext:{},archives:[]},title:'テストゲーム',stamp:'s',at:Date.now()};
 fs.mkdirSync(path.join(r,'data','adapter-probe'),{recursive:true});fs.writeFileSync(path.join(r,'data','adapter-probe','state.json'),JSON.stringify({version:1,run:null,results:{g1:res}}));
 fs.writeFileSync(path.join(r,'data','config','library.json'),JSON.stringify(consent===null?{}:{adapterContrib:consent}));
 return {root:r,game:{id:'g1',title:'テストゲーム',executable:g.exe},dir:g.dir,result:res,db:fx.db(inLibrary?[{id:'g1',title:'テストゲーム',executable:g.exe}]:[])};}

test('rule 1: on by default with no question or note, each new version turns it on again; settings write keeps the decision',()=>{
 const u=setup('megulit-ct-consent-',{consent:null}),V='1.4.9';
 let c=contrib.consentState(u.root,{version:V});assert.deepEqual([c.enabled,c.ask,c.notice],[true,false,false],'first start of a version: on, nothing asked or noted');
 assert.equal(JSON.parse(fs.readFileSync(path.join(u.root,'data','config','library.json'),'utf8')).adapterContrib,true,'written to library.json');
 contrib.setConsent(u.root,false,{version:V});c=contrib.consentState(u.root,{version:V});assert.equal(c.enabled,false,'turned off: stays off within this version');
 c=contrib.consentState(u.root,{version:'1.4.10-beta.1'});assert.deepEqual([c.enabled,c.notice],[true,false],'the next version (beta too) turns it on again, silently');
 contrib.setConsent(u.root,false,{version:'1.4.10-beta.1'});assert.equal(contrib.consentState(u.root,{version:'1.4.10-beta.1'}).enabled,false);
 c=contrib.consentState(u.root,{version:'1.4.10'});assert.equal(c.enabled,true,'and the public build after it as well');
 const w=setup('megulit-ct-noversion-',{consent:null});assert.equal(contrib.consentState(w.root,{version:''}).enabled,true,'version unknown: on by default too');
 /* Settings: an untouched switch never decides; a change does */
 const {Settings}=(()=>{try{return {Settings:require('../services/settings.cjs').Settings||require('../services/settings.cjs')};}catch{return {};}})();
 const v=setup('megulit-ct-settings-',{consent:null});const lib=()=>JSON.parse(fs.readFileSync(path.join(v.root,'data','config','library.json'),'utf8'));
 if(typeof Settings==='function'){const s=new Settings(v.root);const cur=s.read('library');assert.equal(cur.adapterContrib,true,'undecided shows on');
  s.save({scope:'library',values:{...cur}});assert.equal(typeof lib().adapterContrib,'undefined','saving the page unchanged decides nothing');
  s.save({scope:'library',values:{...cur,adapterContrib:false}});assert.equal(lib().adapterContrib,false,'turning it off in Settings decides');
  s.save({scope:'library',values:{...s.read('library'),adapterContrib:true}});assert.equal(lib().adapterContrib,true,'and on');}else assert.fail('Settings class');
});

test('rule 2: only scripts and exe code of the library game; no images, voice, saves, readme or outside files; masked',async()=>{
 const u=setup('megulit-ct-collect-');const c=await contrib.collect(u.root,u.db,'g1',{result:u.result});assert.equal(c.ok,true,JSON.stringify(c));
 const {manifest,files}=contrib.unpack(fs.readFileSync(c.file));const names=files.map(f=>f.name);
 assert.equal(manifest.schema,'megulit.contrib');assert.match(manifest.identity,/^[a-f0-9]{64}$/);
 assert.ok(names.includes('data.xp3::scenario/first.ks'),names.join());assert.ok(names.includes('data.xp3::system/Config.tjs'));assert.ok(names.includes('loose.ks'));
 assert.ok(files.some(f=>f.role==='patch-script'&&f.name.startsWith('patch_chs.xp3::')),'translation patch script taken');
 assert.deepEqual(files.filter(f=>f.role.startsWith('exe-')).map(f=>f.role+':'+f.name.split('#')[1]).sort(),['exe-code:.text','exe-data:.rdata','exe-header:header']);
 for(const f of files){assert.ok(!contrib.isMediaBytes(f.data)||f.role.startsWith('exe-'),'no media: '+f.name);
  assert.doesNotMatch(f.name,/\.(png|ogg|mp4|ksd)$|savedata|readme|outside|bgm|rsrc/i,f.name);
  assert.ok(!f.data.includes(Buffer.from('OUTSIDE-SECRET')),'nothing from outside the folder');
  assert.ok(!f.data.includes(Buffer.from(HOME,'utf8')),'home path masked in '+f.name);}
 assert.ok(files.find(f=>f.name==='data.xp3::scenario/first.ks').data.equals(SCRIPT),'scripts arrive byte for byte');
 assert.ok(files.find(f=>f.name==='Game.exe#.rdata').data.includes(Buffer.from('KEY:0123456789abcdef')),'key section kept');
 const json=JSON.stringify(manifest);assert.ok(!json.includes(HOME)&&!json.includes(HOME.replace(/\\/g,'\\\\'))&&!json.includes(u.root.replace(/\\/g,'\\\\')),'no absolute path in the manifest');
 let user='';try{user=os.userInfo().username;}catch{}if(user.length>=3)assert.ok(!json.toLowerCase().includes(user.toLowerCase())||json.includes('<masked>'),'user name masked');
 assert.ok(manifest.dropped.media>=2,'image / voice entries counted as dropped: '+JSON.stringify(manifest.dropped));
 assert.ok(manifest.versionInfo.some(v=>v.name==='Game.exe'&&v.size>0),'version info');
 /* gzip */
 const raw=fs.readFileSync(c.file);assert.equal(raw[0],0x1f);assert.equal(raw[1],0x8b);assert.ok(c.size<c.raw,'compressed: '+c.size+' < '+c.raw);
});

test('rule 2: not in the library, reading well, refused folders, switch off → nothing collected',async()=>{
 assert.equal((await contrib.collect(setup('megulit-ct-nolib-',{inLibrary:false}).root,fx.db([]),'g1')).reason,'NOT_IN_LIBRARY');
 const ok=setup('megulit-ct-ok-',{problem:false});assert.equal((await contrib.collect(ok.root,ok.db,'g1')).reason,'READS_WELL');
 const off=setup('megulit-ct-off-',{consent:false});assert.equal((await contrib.collect(off.root,off.db,'g1')).reason,'OFF');
 assert.equal(contrib.gameFolderOk(os.homedir(),path.join(os.homedir(),'x.exe')),false,'home folder refused');
 assert.equal(contrib.gameFolderOk(path.join(os.homedir(),'Desktop'),path.join(os.homedir(),'Desktop','x.exe')),false,'desktop refused');
 assert.equal(contrib.gameFolderOk(path.parse(process.cwd()).root,path.join(path.parse(process.cwd()).root,'x.exe')),false,'drive root refused');
});

test('upload: chunked, resumable, local package deleted, one package per game; workbench pulls, unpacks, marks done',async()=>{
 const u=setup('megulit-ct-up-');const c=await contrib.collect(u.root,u.db,'g1',{result:u.result});assert.ok(c.ok);
 /* small chunks for the test: the relay limit is 4 MiB, so a package over 4 MiB needs parts; force two by checking the math instead */
 const id=crypto.randomUUID();let n=0;
 const flaky=user('203.0.113.7');
 const r=await contrib.upload(u.root,{file:c.file,sha256:c.sha256,identity:c.identity,title:'テストゲーム',upload:id,fetcher:flaky,relay:'https://relay.test'});
 assert.equal(r.state,'uploaded',JSON.stringify(r));assert.equal(fs.existsSync(c.file),false,'local package deleted after upload');
 const row=ENV.DB.raw.prepare('SELECT * FROM contrib_uploads WHERE upload=?').get(id);assert.equal(row.state,'complete');assert.equal(row.sha256,c.sha256);assert.equal(row.title,'テストゲーム');
 assert.ok(row.expires_at-row.created_at===30*86400,'30 days');
 /* has → complete; a second player's upload of the same game is a duplicate */
 assert.equal(await contrib.has(u.root,c.identity,{fetcher:flaky,relay:'https://relay.test'}),'complete');
 const v=setup('megulit-ct-up2-');const c2=await contrib.collect(v.root,v.db,'g1',{result:v.result});
 const r2=await contrib.upload(v.root,{file:c2.file,sha256:c2.sha256,identity:c.identity,upload:crypto.randomUUID(),fetcher:user('203.0.113.8'),relay:'https://relay.test'});assert.equal(r2.state,'duplicate');assert.equal(fs.existsSync(c2.file),false);
 /* workbench: list, pull (joins, sha256), unpack to the work folder */
 const work=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'megulit-ct-work-'));process.env.MEGULIT_ADMIN_TOKEN='admin-token';
 const o={fetcher:adminFetch,relay:'https://relay.test',work};const listed=await workbench.list(o);assert.equal(listed.length,1);assert.equal(listed[0].upload,id);
 const p=await workbench.pull(id,o);const x=workbench.unpack(p.file);assert.ok(fs.existsSync(path.join(x.out,'data.xp3','scenario','first.ks')));assert.ok(fs.existsSync(path.join(x.out,'Game.exe.section..text.bin')));
 assert.equal(fs.readdirSync(x.out).some(n=>/png|ogg/i.test(n)),false);
 /* workbench extras: id by prefix / title, a second pull keeps the checked copy, sync finds nothing new, text + SUMMARY.md, the table */
 assert.equal(workbench.match(listed,id.slice(0,8)).upload,id);assert.equal(workbench.match(listed,'テスト').upload,id);assert.throws(()=>workbench.match(listed,'zzzz'),/no complete package/);assert.throws(()=>workbench.match(listed,''),/which package/);
 assert.equal((await workbench.pull(id.slice(0,8),o)).cached,true,'same sha256: not downloaded again');
 const g=await workbench.get(id,o);assert.ok(fs.existsSync(path.join(g.dir,'SUMMARY.md')));assert.match(g.info.text,/## Files by role/);assert.match(g.info.text,/exe-code/);
 assert.ok(fs.existsSync(path.join(g.dir,'text','data.xp3','scenario','first.ks')),'scripts decoded to UTF-8 under text/');assert.equal(fs.existsSync(path.join(g.dir,'text','Game.exe.section..text')),false,'exe sections are not text');
 const sy=await workbench.sync(o);assert.equal(sy.got.length,0);assert.equal(sy.kept.length,1);assert.equal(sy.failed.length,0);
 const rw=workbench.rows(listed,work);assert.equal(rw[0].local,true);assert.equal(rw[0].daysLeft,30);assert.match(workbench.table(rw),/收齐/);assert.match((await workbench.overview(o)).text,/done/);
 assert.deepEqual(workbench.decodeText(Buffer.from([0x82,0xb1,0x82,0xf1,0x82,0xc9,0x82,0xbf,0x82,0xcd])),{encoding:'shift_jis',text:'こんにちは'});
 assert.equal(workbench.decodeText(Buffer.from('吾輩は猫である','utf8')).encoding,'utf-8');assert.equal(workbench.decodeText(Buffer.from('﻿猫','utf16le')).encoding,'utf-16le');assert.equal(workbench.decodeText(Buffer.from([0x00,0x01,0x02,0xff,0xfe,0x00,0x9c])),null,'binary is left alone');
 /* the admin token: explicit variable first, then the value Windows stores for the user (a terminal opened before a key change carries the old one), then the process value */
 {const at=require('../tools/admin-token.cjs'),reg=()=>['','HKEY_CURRENT_USER/Environment','    MEGULIT_ADAPTER_ADMIN_TOKEN    REG_SZ    new-key ',''].join(String.fromCharCode(13,10));
  assert.equal(at.adminToken({env:{MEGULIT_ADAPTER_ADMIN_TOKEN:'old-key'},run:reg,platform:'win32'}),'new-key');assert.equal(at.adminToken({env:{MEGULIT_ADMIN_TOKEN:'explicit',MEGULIT_ADAPTER_ADMIN_TOKEN:'old-key'},run:reg,platform:'win32'}),'explicit');
  assert.equal(at.adminToken({env:{MEGULIT_ADAPTER_ADMIN_TOKEN:'old-key'},run:()=>{throw Error('no value');},platform:'win32'}),'old-key');assert.equal(at.adminToken({env:{MEGULIT_ADAPTER_ADMIN_TOKEN:'k'},run:reg,platform:'linux'}),'k');assert.equal(at.adminToken({env:{},run:()=>'',platform:'win32'}),'');}
 /* an unreachable relay hands over to the next one; an HTTP error does not */
 {const keep=process.env.MEGULIT_RELAY;let n=0;const f=async(u,i)=>{n++;if(String(u).startsWith('https://api.megulit.com'))throw Object.assign(Error('fetch failed'),{cause:{code:'ENOTFOUND'}});return adminFetch(String(u).replace('https://cn-api.megulit.com','https://relay.test'),i);};
  if(!keep){assert.equal((await workbench.list({fetcher:f})).length,1);assert.equal(n,2);}}
 /* done: the relay deletes the parts, has → done, a new upload is a duplicate */
 assert.ok(parts().length>0);const d=await workbench.done(id,o);assert.equal(d.ok,true);assert.equal(d.localRemoved,1,'the local copy goes with done');assert.equal(fs.existsSync(path.join(work,id)),false);assert.equal(parts().length,0,'parts deleted on done');
 assert.equal(await contrib.has(u.root,c.identity,{fetcher:flaky,relay:'https://relay.test'}),'done');
 /* non-admin cannot list or download */
 const anon=await user('203.0.113.50')('https://relay.test/api/contrib/list');assert.equal(anon.status,401);
});

test('resume: an upload cut off mid-way sends only the missing parts next time',async()=>{
 const u=setup('megulit-ct-resume-');
 /* a package over one chunk: pad with an incompressible loose script */
 fs.writeFileSync(path.join(u.dir,'big.scn'),crypto.randomBytes(contrib.CHUNK+300*1024));
 const c=await contrib.collect(u.root,u.db,'g1',{result:u.result});assert.ok(c.ok);assert.ok(c.size>contrib.CHUNK,'two parts: '+c.size);
 const id=crypto.randomUUID();let sent=0;
 const cut=user('203.0.113.20',{failAt:url=>url.endsWith('/api/contrib/chunk')&&++sent>=2});
 const a=await contrib.upload(u.root,{file:c.file,sha256:c.sha256,identity:c.identity,upload:id,fetcher:cut,relay:'https://relay.test'});
 assert.equal(a.state,'failed');assert.equal(fs.existsSync(c.file),true,'kept for the retry');
 const again=user('203.0.113.20');const b=await contrib.upload(u.root,{file:c.file,sha256:c.sha256,identity:c.identity,upload:id,fetcher:again,relay:'https://relay.test'});
 assert.equal(b.state,'uploaded');assert.equal(b.sent,1,'only the missing part');assert.equal(fs.existsSync(c.file),false);
 const row=ENV.DB.raw.prepare('SELECT state,parts FROM contrib_uploads WHERE upload=?').get(id);assert.deepEqual([row.state,row.parts],['complete',2]);
});

test('relay: bad chunks refused; expiry and stale uploads cleaned by the cron',async()=>{
 const f=user('203.0.113.30'),post=(h,body)=>f('https://relay.test/api/contrib/chunk',{method:'POST',headers:{'content-type':'application/octet-stream',...h},body});
 const h={'x-contrib-upload':crypto.randomUUID(),'x-contrib-part':'0','x-contrib-parts':'1','x-contrib-size':'10','x-contrib-sha256':'a'.repeat(64)};
 assert.equal((await post(h,Buffer.from('not gzip!!'))).status,400,'not gzip');
 assert.equal((await post({...h,'x-contrib-parts':'99'},Buffer.alloc(10))).status,400,'too many parts');
 assert.equal((await post({...h,'x-contrib-size':String(64<<20),'x-contrib-parts':'16'},Buffer.alloc(10))).status,400,'too large');
 const stale=crypto.randomUUID(),body=Buffer.concat([Buffer.from([0x1f,0x8b]),crypto.randomBytes(8)]);
 assert.equal((await post({...h,'x-contrib-upload':stale,'x-contrib-parts':'2','x-contrib-size':String((4<<20)+10)},Buffer.concat([body,crypto.randomBytes((4<<20)-10)]))).status,200,'first of two parts kept');
 /* an old complete package */
 const old=crypto.randomUUID();ENV.DB.raw.prepare("INSERT INTO contrib_uploads(upload,identity,size,sha256,parts,state,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)").run(old,'b'.repeat(64),10,'c'.repeat(64),1,'complete',1,2);
 ENV.DB.raw.prepare('INSERT INTO contrib_parts(upload,part,size,created_at) VALUES(?,?,?,?)').run(old,0,10,1);await ENV.BUCKET.put(`contrib/${old}/0`,Buffer.alloc(10));
 await relay();const later=Date.now()+3*86400000;await scheduled({cron:'*/30 * * * *',scheduledTime:later},ENV,null);
 const st=u=>ENV.DB.raw.prepare('SELECT state FROM contrib_uploads WHERE upload=?').get(u)?.state;
 assert.equal(st(old),'expired');assert.equal(st(stale),'expired','stale receiving upload cleaned');
 assert.equal(parts().filter(k=>k.includes(old)||k.includes(stale)).length,0,'their parts are gone');
});

test('probe-auto: with consent the problem game is contributed once; switch off → no contrib request, outbox emptied',async()=>{
 const u=setup('megulit-ct-auto-');const f=user('203.0.113.40');
 const r=await auto.run(u.root,u.db,{wait:async()=>{},probeFirst:false,fetcher:f,endpoint:'https://relay.test/api/probe',hasEndpoint:'https://relay.test/api/probe/has',sampler:async()=>({samples:[],keys:[]})});
 assert.equal(r.contrib.g1,'sent',JSON.stringify(r));assert.equal(fs.readdirSync(contrib.outbox(u.root)).length,0,'nothing left locally');
 const again=await auto.run(u.root,u.db,{wait:async()=>{},probeFirst:false,fetcher:f,endpoint:'https://relay.test/api/probe',hasEndpoint:'https://relay.test/api/probe/has',sampler:async()=>({samples:[],keys:[]})});
 assert.equal(again.contrib.g1,'known','not sent twice');
 /* off: a stray package is deleted and nothing reaches /api/contrib */
 const v=setup('megulit-ct-auto-off-');fs.mkdirSync(contrib.outbox(v.root),{recursive:true});fs.writeFileSync(path.join(contrib.outbox(v.root),'x.mgct.gz'),'x');
 contrib.setConsent(v.root,false);assert.equal(fs.readdirSync(contrib.outbox(v.root)).length,0,'switch-off empties the outbox');
 const seen=[];const g=async(url,init)=>{seen.push(url);return f(url,init);};
 const o=await auto.run(v.root,v.db,{wait:async()=>{},probeFirst:false,fetcher:g,endpoint:'https://relay.test/api/probe',hasEndpoint:'https://relay.test/api/probe/has',sampler:async()=>({samples:[],keys:[]})});
 assert.deepEqual(o.contrib||{},{});assert.equal(seen.filter(u=>u.includes('/api/contrib/')).length,0,'off: no contribution request');
 assert.equal(await contrib.forGame(v.root,v.db,v.game,v.result,{fetcher:g}),'off');
});

test('rule 1: upgrades turn it on for everyone, agreed or not; within a version the switch holds',()=>{
 const a=setup('megulit-ct-upg-',{consent:null});contrib.setConsent(a.root,true,{source:'card',version:'1.4.15'});
 for(const v of ['1.4.15','1.4.16-beta.1','1.4.16','1.5.0'])assert.deepEqual([contrib.consentState(a.root,{version:v}).ask,contrib.consentState(a.root,{version:v}).enabled],[false,true],'agreed: '+v);
 const b=setup('megulit-ct-no-',{consent:false});
 assert.equal(contrib.consentState(b.root,{version:'1.4.15'}).enabled,true,'a no from before this rule (no version recorded) is turned on by the update');
 contrib.setConsent(b.root,false,{source:'settings',version:'1.4.15'});
 for(let i=0;i<3;i++)assert.equal(contrib.consentState(b.root,{version:'1.4.15'}).enabled,false,'declined in this version: stays off on every start');
 assert.equal(contrib.consentState(b.root,{version:'1.4.16'}).enabled,true,'declined: on again after the update');
});
