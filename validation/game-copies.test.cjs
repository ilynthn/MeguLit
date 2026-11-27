// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 tools/game-copies.cjs: every agent plays its own game copy under its own lock, so several games run at once.
   Before, all runs shared one machine-wide lock and queued. Checks: two different copies are locked (and run) at the same
   time; one copy never has two owners; a dead owner's lock is taken over, a live owner's lock is never overwritten; the
   copy is real folders only (no junction mirror), resource archives may be hard-linked but exe / saves / settings are real
   copies, and the original folder is not changed; the old single lock keeps its format and rules. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const C=require('../tools/game-copies.cjs');
const TOOL=path.join(__dirname,'..','tools','game-copies.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'game-copies-'));
const put=(f,data)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);};
const deadPid=()=>{const r=spawnSync(process.execPath,['-e','0']);return r.pid;};
const FREE={bavail:1e6,bsize:1<<20};
function treeHash(dir){const h=crypto.createHash('sha1');const walk=d=>{for(const n of fs.readdirSync(d).sort()){const a=path.join(d,n),st=fs.lstatSync(a);
  h.update(path.relative(dir,a)+'|'+st.isSymbolicLink());if(st.isSymbolicLink())continue;if(st.isDirectory())walk(a);else h.update(fs.readFileSync(a)).update(String(st.mtimeMs));}};walk(dir);return h.digest('hex');}

test('two different copies are locked at the same time; one copy has one owner',async t=>{const d=tmp(),locks=path.join(d,'locks');t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const a=path.join(d,'game-a'),b=path.join(d,'game-b');fs.mkdirSync(a);fs.mkdirSync(b);
 const ra=C.tryAcquire(a,{owner:'agent-1',dir:locks}),rb=C.tryAcquire(b,{owner:'agent-2',dir:locks});
 assert.ok(ra.ok,'agent-1 gets game-a');assert.ok(rb.ok,'agent-2 gets game-b while game-a is held');
 const again=C.tryAcquire(a,{owner:'agent-2',dir:locks});assert.equal(again.ok,false,'game-a has one owner');assert.equal(again.holder.owner,'agent-1');
 assert.equal(C.tryAcquire(a+path.sep,{owner:'agent-2',dir:locks}).ok,false,'the same folder spelled with a trailing slash is the same lock');
 assert.equal(C.release(a,{owner:'agent-2',dir:locks}),false,'someone else cannot release it');
 assert.ok(fs.existsSync(ra.file));ra.release();assert.equal(fs.existsSync(ra.file),false);
 assert.ok(C.tryAcquire(a,{owner:'agent-2',dir:locks}).ok,'free again after release');rb.release();
 const outer=C.tryAcquire(b,{owner:'agent-1',dir:locks}),inner=C.tryAcquire(b,{owner:'agent-1',dir:locks});
 assert.ok(inner.ok&&inner.again,'the same owner and pid may take it again (adapter, then its cold run)');inner.release();
 assert.equal(C.tryAcquire(b,{owner:'agent-2',dir:locks}).ok,false,'the inner release leaves the outer lock');outer.release();});

test('lock file says owner, pid and start time; a dead pid is taken over, a live owner is never overwritten',async t=>{const d=tmp(),locks=path.join(d,'locks');t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const g=path.join(d,'g');fs.mkdirSync(g);
 const r=C.tryAcquire(g,{owner:'me',dir:locks});const body=JSON.parse(fs.readFileSync(r.file,'utf8'));
 assert.equal(body.owner,'me');assert.equal(body.pid,process.pid);assert.ok(!Number.isNaN(Date.parse(body.started)));r.release();
 const file=C.lockFile(g,locks),dead=deadPid();
 fs.writeFileSync(file,JSON.stringify({owner:'crashed',pid:dead,started:'2026-11-27T00:00:00Z',host:os.hostname()}));
 const logs=[];const rel=await C.acquire(g,{owner:'me',dir:locks,log:m=>logs.push(m)});assert.ok(rel,'dead owner taken over');
 assert.match(logs.join('\n'),/took over a dead lock: owner=crashed/);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).owner,'me');rel();
 const live=JSON.stringify({owner:'other',pid:process.ppid||process.pid,started:'2026-11-27T00:00:00Z',host:os.hostname()});fs.writeFileSync(file,live);
 const old=Date.now()-6*3600e3;fs.utimesSync(file,old/1000,old/1000);
 assert.equal(await C.acquire(g,{owner:'me',dir:locks,waitMs:0}),null,'a live owner keeps it even when the file is hours old');
 assert.equal(fs.readFileSync(file,'utf8'),live,'and its file is untouched');});

test('a lock file that is still being written is not a dead lock',async t=>{const d=tmp(),locks=path.join(d,'locks');t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 /* the winner creates the file empty and then fills it; a taker reading it in between must not take it over (CI: two of six takers won) */
 const g=path.join(d,'g');fs.mkdirSync(g);fs.mkdirSync(locks);const file=C.lockFile(g,locks);
 fs.writeFileSync(file,'');
 const r=C.tryAcquire(g,{owner:'late',dir:locks});assert.equal(r.ok,false,'a just-created empty lock is held');assert.equal(fs.readFileSync(file,'utf8'),'','and left alone');
 const old=Date.now()-60e3;fs.utimesSync(file,old/1000,old/1000);
 assert.equal(C.tryAcquire(g,{owner:'late',dir:locks}).ok,true,'an unreadable lock nobody is writing any more is taken over');});

test('parallel takers of a dead lock: exactly one wins',async t=>{const d=tmp(),locks=path.join(d,'locks');t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const g=path.join(d,'g');fs.mkdirSync(g);fs.mkdirSync(locks);fs.writeFileSync(C.lockFile(g,locks),JSON.stringify({owner:'crashed',pid:deadPid(),host:os.hostname()}));
 const code=`const C=require(${JSON.stringify(TOOL)});const r=C.tryAcquire(${JSON.stringify(g)},{owner:'p'+process.pid,dir:${JSON.stringify(locks)}});process.stdout.write(r.ok?'won':'lost');setTimeout(()=>{},800);`;
 const outs=await Promise.all(Array.from({length:6},()=>new Promise(res=>{const c=spawn(process.execPath,['-e',code]);let s='';c.stdout.on('data',b=>s+=b);c.on('exit',()=>res(s));})));
 assert.equal(outs.filter(s=>s==='won').length,1,outs.join(','));});

test('cli run: two copies run at the same time, a second owner of one copy waits until it is free',async t=>{const d=tmp(),locks=path.join(d,'locks');t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const a=path.join(d,'a'),b=path.join(d,'b');fs.mkdirSync(a);fs.mkdirSync(b);const env={...process.env,MEGULIT_GAME_LOCKS:locks};
 const job=(dir,owner,ms,wait='1')=>new Promise(res=>{const t0=Date.now();const c=spawn(process.execPath,[TOOL,'run',dir,'--owner',owner,'--wait-min',wait,'--',process.execPath,'-e',`setTimeout(()=>{},${ms})`],{env});
  let err='';c.stderr.on('data',x=>err+=x);c.on('exit',code=>res({code,t0,t1:Date.now(),err}));});
 const [x,y]=await Promise.all([job(a,'agent-1',1500),job(b,'agent-2',1500)]);
 assert.equal(x.code,0,x.err);assert.equal(y.code,0,y.err);
 assert.ok(Math.max(x.t0,y.t0)<Math.min(x.t1,y.t1)-500,'both ran at once');
 assert.deepEqual(fs.readdirSync(locks).filter(n=>n.endsWith('.lock')),[],'locks released at exit');
 const first=job(a,'agent-1',1500);await new Promise(r=>setTimeout(r,400));
 const busy=await job(a,'agent-2',10,'0');assert.equal(busy.code,3,'same copy: busy');assert.match(busy.err,/busy: owner=agent-1/);
 assert.equal((await first).code,0);});

test('own copy: real folders, exe / saves / settings copied, archives hard-linked on one volume, original unchanged',async t=>{const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const src=path.join(d,'orig','Game');const big=Buffer.alloc(2<<20,7);
 put(path.join(src,'Game.exe'),'exe');put(path.join(src,'engine.dll'),'dll');put(path.join(src,'data.xp3'),big);put(path.join(src,'voice','v.arc'),big);
 put(path.join(src,'savedata','big.xp3'),big);put(path.join(src,'config.ini'),'a=1');put(path.join(src,'small.xp3'),'tiny');
 const outside=path.join(d,'outside');put(path.join(outside,'movie.mpg'),big);fs.symlinkSync(outside,path.join(src,'movie'),'junction');
 const before=treeHash(src);const root=path.join(d,'copies');
 const c=C.prepareCopy(src,{owner:'agent-1',root,noDrives:'',statfs:()=>FREE});
 assert.equal(c.dir,path.join(root,'Game-agent-1'));assert.equal(c.reused,false);
 assert.equal(fs.lstatSync(path.join(c.dir,'movie')).isSymbolicLink(),false,'a junction in the original becomes a real folder');
 assert.ok(fs.existsSync(path.join(c.dir,'movie','movie.mpg')));
 const same=(x,y)=>{const p=fs.statSync(x),q=fs.statSync(y);return p.ino===q.ino&&p.dev===q.dev;};
 for(const f of ['Game.exe','engine.dll','config.ini','small.xp3',path.join('savedata','big.xp3')])assert.equal(same(path.join(src,f),path.join(c.dir,f)),false,f+' is its own file');
 assert.equal(same(path.join(src,'data.xp3'),path.join(c.dir,'data.xp3')),true,'archive shared');
 fs.writeFileSync(path.join(c.dir,'Game.exe'),'patched');fs.writeFileSync(path.join(c.dir,'config.ini'),'a=2');fs.writeFileSync(path.join(c.dir,'savedata','big.xp3'),'save');
 fs.writeFileSync(path.join(c.dir,'movie','movie.mpg'),'x');
 assert.equal(treeHash(src),before,'the original folder is unchanged');
 assert.equal(fs.readFileSync(path.join(outside,'movie.mpg')).length,big.length,'what the junction pointed at is unchanged');
 assert.equal(C.prepareCopy(src,{owner:'agent-1',root,noDrives:'',statfs:()=>FREE}).reused,true,'kept the second time');
 const c2=C.prepareCopy(src,{owner:'agent-2',root,noDrives:'',statfs:()=>FREE});assert.notEqual(c2.dir,c.dir,'each owner has its own copy');});

test('own copy: cross-volume falls back to copying; no space, C:/E: and overlapping folders are refused',async t=>{const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const src=path.join(d,'G');put(path.join(src,'data.xp3'),Buffer.alloc(2<<20));put(path.join(src,'g.exe'),'e');
 const c=C.prepareCopy(src,{owner:'o',root:path.join(d,'c'),noDrives:'',statfs:()=>FREE,link:()=>{const e=Error('EXDEV');e.code='EXDEV';throw e;}});
 assert.equal(c.linked,0);assert.equal(c.copied,2);
 assert.throws(()=>C.prepareCopy(src,{owner:'o2',root:path.join(d,'c'),noDrives:'',statfs:()=>({bavail:1,bsize:1})}),/not enough space/);
 assert.throws(()=>C.prepareCopy(src,{owner:'o',root:path.join(src,'copies'),noDrives:'',statfs:()=>FREE}),/overlap/);
 const drive=path.parse(d).root.slice(0,1);assert.throws(()=>C.prepareCopy(src,{owner:'o3',root:path.join(d,'c'),noDrives:drive,statfs:()=>FREE}),/copies never go to/);
 assert.throws(()=>C.prepareCopy(src,{owner:'o',root:''}),/MEGULIT_COPIES_ROOT/);});

test('which files may be shared',()=>{
 assert.equal(C.shareable('bg.arc',5<<20),true);assert.equal(C.shareable('Game.exe',50<<20),false);assert.equal(C.shareable('a.dll',50<<20),false);
 assert.equal(C.shareable('save\\s.arc',5<<20),false);assert.equal(C.shareable('small.arc',1000),false);
 assert.equal(C.shareable('sys.dat',1<<20),false,'a small .dat may be a save');assert.equal(C.shareable('data.dat',64<<20),true);});

test('old machine-wide lock: same format and rules; with {dir} it takes that folder instead',async t=>{const d=tmp();t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const file=path.join(d,'.game.lock');fs.writeFileSync(file,'owner=other game=x started=now');
 assert.equal(await C.gameLock('me','g',{file,waitMs:0}),null);
 const old=Date.now()-25*60000;fs.utimesSync(file,old/1000,old/1000);
 assert.equal(await C.gameLock('me','g',{file,waitMs:0}),null,'a lock that never says refreshed= gets three hours');
 fs.writeFileSync(file,'owner=other game=x refreshed=then');fs.utimesSync(file,old/1000,old/1000);
 const r=await C.gameLock('me','g',{file,waitMs:0});assert.ok(r);assert.match(fs.readFileSync(file,'utf8'),/^owner=me game=g refreshed=/);r();assert.equal(fs.existsSync(file),false);
 fs.writeFileSync(file,'owner=other game=x refreshed=now');
 const g=path.join(d,'copy');fs.mkdirSync(g);const r2=await C.gameLock('me','g',{dir:g,locks:path.join(d,'locks'),waitMs:0});
 assert.ok(r2,'a folder lock does not wait for the old single lock');assert.equal(fs.readFileSync(file,'utf8'),'owner=other game=x refreshed=now');r2();});
