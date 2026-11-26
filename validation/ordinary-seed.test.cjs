// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), os=require('node:os'), crypto=require('node:crypto'), net=require('node:net');
const {once}=require('node:events');
const {database,fixture}=require('./helpers/torch-release.cjs');
const ordinary=require('../core/ordinary-seed.cjs'), diff=require('../core/game-diff.cjs');
const feed=require('../services/auto-profile-feed.cjs'), receiver=require('../services/torch-receive.cjs');
const {server}=require(process.env.MEGULIT_TEST_SCAN_SERVICE||'../relay/scan-service/server.cjs');
const marker='b'.repeat(64), clean={key:'a'.repeat(64),mode:'hide',settings:{page:{presentation:'adv'}}};
test('ordinary schema accepts bounded calibrations only',()=>{
  assert.deepEqual(ordinary.normalize(clean),clean);
  for(const patch of [{source:'official'},{signature:{}},{settings:{draw:{roles:true}}},{settings:{choice:{filters:['.*']}}},
    {settings:{calibrate:{textBox:{x:0,y:0,w:1,h:2,client:[[1],2]}}}},{settings:{page:{presentation:'.\\game.exe'}}},
    {settings:JSON.parse('{"__proto__":{"a":1}}')},{settings:{page:{presentation:{script:'x'}}}}])
    assert.equal(ordinary.normalize({...clean,...patch}),null);
});
// CI uses a framed clamd stand-in. Set MEGULIT_TEST_CLAMD_PORT to exercise a real
// local daemon with the harmless test signature from docs/ordinary-seed.md.
async function listener(t,s) {
  s.listen(0,'127.0.0.1'); await once(s,'listening'); t.after(()=>new Promise(done=>s.close(done)));
  return s.address().port;
}
async function setup(t,{live=false}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ordinary-seed-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const publisher=crypto.generateKeyPairSync('ed25519'), keyFile=path.join(root,'test.pem');
  fs.writeFileSync(keyFile,publisher.privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
  const publicKey={id:'ordinary-test',alg:'ed25519',publicKey:publisher.publicKey.export({format:'der',type:'spki'}).toString('base64')};
  const testPort=process.env.MEGULIT_TEST_CLAMD_PORT;
  const port=testPort||await listener(t,net.createServer(s=>{
    let data=Buffer.alloc(0);
    s.on('data',b=>{data=Buffer.concat([data,b]);const end=data.indexOf(0);if(end<0)return;
      if(data.subarray(0,end).toString()==='zVERSION')return s.end('ClamAV 1.5.5/1/'+new Date().toString()+'\0');
      if(data.length<end+9)return;const size=data.readUInt32BE(end+1);if(data.length<end+9+size)return;
      s.end(data.includes(Buffer.from(marker))?'stream: NeutralMarker FOUND\0':'stream: OK\0');
    });
  }));
  const config={CLAMD_PORT:port,ORDINARY_KEY_ID:publicKey.id,ORDINARY_PRIVATE_KEY_FILE:keyFile,ORDINARY_SCAN_TOKEN:crypto.randomBytes(32).toString('hex')};
  const gateway='http://127.0.0.1:'+await listener(t,server(config))+'/scan';
  const f=fixture(),env={...f.env,ORDINARY_SCAN_URL:gateway,ORDINARY_PUBLIC_KEYS:JSON.stringify([publicKey]),ORDINARY_SCAN_TOKEN:config.ORDINARY_SCAN_TOKEN};
  const db=database();
  db.raw.exec('CREATE TABLE rate_limits(bucket TEXT PRIMARY KEY,count INTEGER,reset_at INTEGER)');
  t.after(()=>db.raw.close());
  const worker=await import('../relay/src/worker.js');
  let fetcher,store,retry,socketBase;
  if(process.env.MEGULIT_TEST_WORKER_BUNDLE){
    const {Miniflare,convertV4MiniflareOptions}=require('../relay/node_modules/miniflare');
    const mf=new Miniflare(convertV4MiniflareOptions({modules:[{type:'ESModule',path:'worker.mjs',contents:fs.readFileSync(process.env.MEGULIT_TEST_WORKER_BUNDLE,'utf8')}],compatibilityDate:'2026-10-01',
      bindings:{...env,ORDINARY_SCAN_URL:'https://scan.test/scan'},d1Databases:['DB'],durableObjects:{SEED_NOTIFICATIONS:{className:'SeedNotifications',useSQLite:true}},outboundService:async r=>{
        if(r.url==='https://scan.test/health'&&r.method==='GET')return fetch(new URL('health',gateway),{headers:{authorization:r.headers.get('authorization')}});
        assert.equal(r.url,'https://scan.test/scan');return fetch(gateway,{method:r.method,body:await r.arrayBuffer(),headers:{
          authorization:r.headers.get('authorization'),'content-type':r.headers.get('content-type')}});
      }}));
    t.after(()=>mf.dispose());store=await mf.getD1Database('DB');
    for(const row of db.raw.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await store.prepare(row.sql).run();
    for(const row of db.raw.prepare('SELECT slot,name FROM torch_alias_pool').all())await store.prepare('INSERT INTO torch_alias_pool(slot,name) VALUES(?,?)').bind(row.slot,row.name).run();
    await store.prepare('INSERT INTO ordinary_publish_policy VALUES(1,1,1,NULL)').run();
    await store.prepare('INSERT INTO torch_counter(id,total) VALUES(1,0)').run();
    socketBase=(await mf.ready).origin;
    fetcher=(url,init)=>mf.dispatchFetch(url,init);
    retry=async()=>{const worker=await mf.getWorker();await worker.scheduled({cron:'*/30 * * * *',scheduledTime:Date.now()});};
  }else{
    store=db;const jobs=[];
    if(live){
      const {WebSocketServer}=require('../relay/node_modules/ws');
      const sockets=new WebSocketServer({host:'127.0.0.1',port:0});
      await once(sockets,'listening');socketBase='http://127.0.0.1:'+sockets.address().port;
      t.after(()=>{for(const ws of sockets.clients)ws.terminate();sockets.close();});
      const hub=new worker.SeedNotifications({getWebSockets:()=>[...sockets.clients]});
      env.SEED_NOTIFICATIONS={idFromName:n=>n,get:()=>({fetch:(url,init)=>hub.fetch(new Request(url,init))})};
    }
    fetcher=async(url,init)=>{const result=await worker.handle(new Request(url,init),{...env,DB:db},new Date(),{waitUntil:p=>jobs.push(p)});await Promise.all(jobs.splice(0));return result;};
    retry=async()=>{const {retryJobs}=await import('../relay/src/ordinary-seed.js');await retryJobs({...env,DB:db});};
  }
  // Normal client endpoints, including receive's legacy exact-version fallback.
  process.env.MEGULIT_RELAY_BASE='http://127.0.0.1:13991';
  t.after(()=>{delete process.env.MEGULIT_RELAY_BASE;feed._trustOrdinary(null);});
  feed._trustOrdinary([publicKey]);
  const request=(route,init)=>fetcher('http://127.0.0.1:13991'+route,init);
  const submit=async input=>request('/api/game-profile/report',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({version:1,profile:{...input,source:'calibration'},ordinary:input})});
  const find=async(id,state)=>{for(let i=0;i<100;i++){const row=await store.prepare('SELECT * FROM ordinary_seed_jobs WHERE id=?').bind(id).first();
    if(row.state===state&&!row.lease&&(state!=='pending'||row.retry_at>0))return row;await new Promise(r=>setTimeout(r,50));}assert.fail('missing state '+state);};
  return {root,config,publicKey,request,fetcher,submit,find,store,retry,f,socketBase,gateway};
}
test('enhanced scanner inspects exact signed bytes without using the ordinary signing key',async t=>{
 const {f,config,gateway}=await setup(t);
 config.ORDINARY_PRIVATE_KEY_FILE='missing-fixture-key';
 const profile=f.profile(1,{...f.identity,script:'c'.repeat(64)});
 const body=diff.canonical(profile);
 const res=await fetch(new URL('scan-enhanced',gateway),{method:'POST',headers:{authorization:'Bearer '+config.ORDINARY_SCAN_TOKEN},body});
 assert.equal(res.status,200);
 const receipt=await res.json();
 assert.equal(receipt.subject,crypto.createHash('sha256').update(body).digest('hex'));
 assert.equal(receipt.state,'clean');assert.equal(receipt.signature,undefined);
});
test('player upload, scanner retry, quarantine, signature, offline install and signed revocation',async t=>{
  const {root,config,publicKey,request,fetcher,submit,find,store,retry,f,gateway}=await setup(t);
  if(process.env.MEGULIT_TEST_WORKER_BUNDLE){
    const policy=await request('/api/seed-admin/ordinary-policy',{headers:{authorization:'Bearer '+f.env.ADAPTER_ADMIN_TOKEN}});
    assert.equal(policy.status,200);assert.equal((await policy.json()).scanner,'online');
    const {checkGateway}=await import('../relay/check-ordinary.mjs');
    const vars={ORDINARY_SCAN_URL:gateway,ORDINARY_PUBLIC_KEYS:JSON.stringify([publicKey])};
    const receipt=await checkGateway(vars,[publicKey],config.ORDINARY_SCAN_TOKEN);
    assert.equal(receipt.keyId,publicKey.id);
    await assert.rejects(checkGateway(vars,[],config.ORDINARY_SCAN_TOKEN),/matching ordinary/);
    await assert.rejects(checkGateway({...vars,PROFILE_PUBLIC_KEYS:JSON.stringify([publicKey])},[publicKey],config.ORDINARY_SCAN_TOKEN),/dedicated/);
  }
  const exe=path.join(root,'game.exe');fs.writeFileSync(exe,'inert version identity');
  const key=await receiver.fileHash(exe,{}),rec={...clean,key,source:'calibration',reason:'diagnostic only',candidates:[]};
  const library=require('../services/store.cjs').openStore(root);
  const add=library.prepare('INSERT INTO games(id,title,original,hidden_at,removed_at) VALUES(?,?,?,?,?)');
  add.run('1','private library title',JSON.stringify({vndbManual:'v4',library:{vndbId:'v7771'}}),null,null);
  add.run('2','hidden',JSON.stringify({library:{vndbId:'v19073'}}),1,null);
  add.run('3','removed',JSON.stringify({library:{vndbId:'v7771'}}),null,1);
  add.run('4','corrupt','{',null,null);library.close();
  assert.equal((await submit({...clean,settings:{draw:{engineTable:{}}}})).status,422);
  const large=await request('/api/game-profile/report',{method:'POST',body:' '.repeat(16385)});assert.equal(large.status,413);
  const realPort=config.CLAMD_PORT;config.CLAMD_PORT=1;
  const posted=await feed.report(root,rec,{fetcher:async(url,init)=>{
    const body=JSON.parse(init.body);
    assert.equal(body.libraryAlias,'岡崎朋也');
    assert.doesNotMatch(init.body,/private library title|v7771|v19073|"v4"/);
    return fetcher(url,init);
  }});
  assert.equal(posted.state,'sent');assert.equal(posted.credit.engraved,false);assert.equal(posted.credit.alias,require('../core/torch-alias.cjs').fallbackAlias(posted.credit.torchNo));
  const [{id}]=(await store.prepare('SELECT id FROM ordinary_seed_jobs').all()).results;
  await find(id,'pending');assert.equal((await request('/api/game-profile?exe='+key)).status,404);
  config.CLAMD_PORT=realPort;
  // Only advance the durable backoff. The cron resumes without a new upload.
  await store.prepare('UPDATE ordinary_seed_jobs SET retry_at=0 WHERE id=?').bind(id).run();
  await retry();
  const published=await find(id,'published');
  const dup=await Promise.all([submit(recToInput(rec)),submit(recToInput(rec))]);
  for(const r of dup)assert.equal((await r.json()).ordinary.id,id);
  const result=await (await request('/api/game-profile?exe='+key)).json();
  assert.equal(published.revision,1);assert.equal((await store.prepare('SELECT count(*) n FROM game_diffs').first()).n,1);
  assert.equal((await store.prepare('SELECT count(*) n FROM seed_admin_uploads').first()).n,1);
  assert.ok(ordinary.valid(diff.unsigned(result.diff)));assert.ok(!JSON.stringify(result.diff).includes('diagnostic'));
  assert.equal(JSON.parse(published.scan).scanner,'ClamAV');
  const opts={getGame:()=>({id:'1',executable:exe}),resources:()=>true,fetcher};
  assert.equal((await receiver.receive(root,'1',opts)).state,'received');
  const offline=require('node:child_process').execFileSync(process.execPath,['-e',`
    global.fetch=()=>{throw Error('unexpected offline network request')};
    const [root,key,exe,pub]=process.argv.slice(1);
    require('./services/auto-profile-feed.cjs')._trustOrdinary([JSON.parse(pub)]);
    require('./services/torch-receive.cjs').installed(root,key,{exe}).then(v=>console.log(JSON.stringify(v)));
  `,root,key,exe,JSON.stringify(publicKey)],{cwd:path.join(__dirname,'..'),encoding:'utf8',windowsHide:true});
  const receipt=JSON.parse(offline);assert.equal(receipt.origin,'ordinary-seed');assert.equal(receipt.hash,published.profile_hash);
  assert.equal(feed.layer(feed.cached(root,key),key).settings.page.presentation,'adv');
  assert.equal(feed.layer({...result,key:clean.key,versionLayer:{...result.versionLayer,match:'head'}},clean.key),null);
  const tamper=structuredClone(result);tamper.diff.settings.page.presentation='nvl';tamper.versionLayer.diff=tamper.diff;
  assert.equal(feed.layer(tamper,key),null);
  const infected=(await (await submit({...clean,key:marker})).json()).ordinary;
  await find(infected.id,'quarantined');assert.equal((await request('/api/game-profile?exe='+marker)).status,404);
  assert.equal((await (await request('/api/game-profile/ordinary-status?id='+infected.id)).json()).state,'quarantined');
  assert.equal((await (await submit({...clean,key:marker})).json()).ordinary.state,'quarantined');
  const revoke=f.publisher.sign({schema:'megulit.torch-revocation',version:1,profileHash:published.profile_hash,reason:'signature-revoked'});
  const revoked=await request('/api/torch-release/revoke',{method:'POST',headers:{authorization:'Bearer '+f.env.ADAPTER_ADMIN_TOKEN},body:JSON.stringify(revoke)});
  assert.equal(revoked.status,200);assert.equal((await receiver.receive(root,'1',opts)).code,'TORCH_REVOKED');
  assert.equal(await receiver.installed(root,key,{exe}),null);
  const {changes}=await (await request('/api/torch-release/changes?after=0')).json();
  assert.deepEqual(changes.map(change=>change.game_key),[key,key]);
  t.diagnostic('Scanner '+(process.env.MEGULIT_TEST_CLAMD_PORT?'real clamd':'protocol fixture')+' '+published.scan);
});
function recToInput({key,mode,settings}){return {key,mode,settings};}

test('indeterminate receipts and untrusted publisher keys leave the job pending',async t=>{
  const jobs=await import('../relay/src/ordinary-seed.js'), protocol=require('../core/torch-release.cjs');
  const db=database();t.after(()=>db.raw.close());
  const f=fixture(),thing=await jobs.enqueue(db,clean,new Date()),row=await db.prepare('SELECT * FROM ordinary_seed_jobs').first();
  const doc=ordinary.document(clean,thing.revision,row.issued_at);
  const signer=require('./helpers/torch-release.cjs').signer('ordinary-untrusted'),signed=signer.sign(doc);
  const valid={state:'clean',subject:await protocol.hash(doc),artifact:await protocol.hash(signed),signature:signed.signature,
    scanner:'ClamAV',version:'1.5.5',definitions:'123',scannedAt:new Date().toISOString()};
  let reply;
  const port=await listener(t,require('node:http').createServer((req,res)=>{req.resume();res.end(JSON.stringify(reply));}));
  const env={...f.env,DB:db,ORDINARY_SCAN_URL:'http://127.0.0.1:'+port+'/scan',ORDINARY_SCAN_TOKEN:'fixture',ORDINARY_PUBLIC_KEYS:'[]'};
  for(const change of [{state:'unknown'},{subject:'0'.repeat(64)},{definitions:[]},{artifact:'0'.repeat(64)},{}]){
    reply={...valid,...change};
    await db.prepare('UPDATE ordinary_seed_jobs SET retry_at=0').run();
    await jobs.processJob(env,thing.id);
    const receipt=await jobs.status(db,thing.id);assert.equal(receipt.state,'pending');assert.ok(receipt.retryReason);
    assert.equal((await db.prepare('SELECT count(*) n FROM game_diffs').first()).n,0);
  }
});

test('private calibration publish wakes a second library, matches script and replays offline withdrawal',async t=>{
  const {root,fetcher,request,socketBase,find,f}=await setup(t,{live:true});
  const peer=path.join(root,'peer'),scriptFiles=new Map();
  const relay=require('../services/relay-config.cjs'),sessions=require('../services/self-check-live.cjs');
  const localOrigin='http://127.0.0.1:13991';
  for(const dir of [root,peer]){
    const config=path.join(dir,'data/config');fs.mkdirSync(config,{recursive:true});
    const exe=path.join(dir,'game.exe'),runtime=path.join(dir,'source.ain'),index=runtime+'.json';
    fs.writeFileSync(exe,'same executable');fs.writeFileSync(runtime,'neutral runtime');
    fs.writeFileSync(index,JSON.stringify({schema:1,lines:['first script']}));
    fs.writeFileSync(path.join(config,'original-text.json'),JSON.stringify({7:{status:'native-japanese',runtime:{
      engine:'system4',file:runtime,index,sha256:await receiver.fileHash(runtime,{})}}}));
    fs.writeFileSync(path.join(config,'online.json'),JSON.stringify({relayUrl:dir===peer?localOrigin:''}));
    fs.writeFileSync(path.join(config,'library.json'),JSON.stringify({autoProfileShare:false,runtimeSampleShare:false,sharedAdaptation:false}));
    scriptFiles.set(dir,index);
    const store=require('../services/store.cjs').openStore(dir);
    store.prepare("INSERT INTO games(id,title,executable) VALUES('7','Fixture',?)").run(exe);store.close();
  }
  const prior=process.env;
  process.env=require('../tools/owner-tests-launch.cjs').environment(root,prior);
  const key=await receiver.fileHash(path.join(root,'game.exe'),{});
  const script=require('../services/original-text.cjs').contributionScript(root,path.join(root,'game.exe'),'7');
  assert.match(script,/^[0-9a-f]{64}$/);
  const traffic=[],connections=[],stops=[];
  let wakes=0;
  const network=global.fetch;
  t.mock.method(global,'fetch',(url,init)=>{
    const target=new URL(url);
    if(target.pathname==='/scan'&&target.hostname==='127.0.0.1')return network(url,init);
    assert.ok([relay.CN_RELAY_BASE,relay.DEFAULT_RELAY_BASE,localOrigin].includes(target.origin),String(url));
    traffic.push({target,method:init?.method||'GET',body:init?.body});
    return fetcher(localOrigin+target.pathname+target.search,init);
  });
  class LocalSocket extends WebSocket{
    constructor(url){const remote=new URL(url);assert.equal(remote.pathname,'/api/torch-release/events');
      assert.ok([relay.CN_RELAY_BASE,relay.DEFAULT_RELAY_BASE,localOrigin].includes(remote.origin.replace(/^ws/,'http')));
      super(socketBase.replace(/^http/,'ws')+remote.pathname);connections.push(this);
      this.addEventListener('message',event=>{if(event.data==='changed')wakes++;});}
  }
  const until=async check=>{for(let n=0;n<200;n++){if(await check())return;await new Promise(r=>setTimeout(r,30));}assert.fail('timed out: '+check);};
  try{
    const {subscribe}=require('../services/seed-live.cjs');
    for(const dir of [root,peer])stops.push(subscribe(dir,{Socket:LocalSocket}));
    await until(()=>traffic.filter(x=>x.target.pathname.endsWith('/changes')).length===2);
    const exe=path.join(peer,'game.exe');
    const applied=[],reader={root:peer,gameId:'7',gal:{setGameProfile:p=>applied.push(p)}};
    const session=sessions.start(reader,exe,null,{exe,engine:'system4'},{key});
    const record={...clean,key,settings:{page:{effectFrames:true}},source:'calibration',exe:'private-name',reason:'private detail'};
    assert.equal(feed.sharing(root),false);
    assert.deepEqual(relay.endpoints(root,'/api/diagnostics'),[]);
    const result=await feed.report(root,record,{prints:{script,title:'c'.repeat(64)},credit:'private'});
    assert.equal(result.state,'sent');
    const posts=traffic.filter(x=>x.method==='POST');assert.equal(posts.length,1);
    assert.ok([relay.CN_RELAY_BASE,relay.DEFAULT_RELAY_BASE].includes(posts[0].target.origin));
    assert.equal(posts[0].target.pathname,'/api/game-profile/report');
    const sent=JSON.parse(posts[0].body);
    assert.deepEqual(Object.keys(sent).sort(),['ordinary','prints','profile','version']);
    assert.deepEqual(sent.prints,{script});assert.ok(!posts[0].body.includes('private'));
    const job=JSON.parse(fs.readFileSync(path.join(feed.dir(root),key+'.sent.json'))).ordinary;
    await find(job.id,'published');
    await until(()=>session.seedPending&&[root,peer].every(dir=>feed.cached(dir,key)?.diff?.prints?.script===script));
    assert.equal(connections.length,2);assert.equal(wakes,2);assert.equal(applied.length,0);
    sessions.seedBoundary(reader,{hookSequence:1,hookSource:'next'});assert.equal(applied.at(-1).page.effectFrames,true);
    assert.equal((await request('/api/game-profile?exe='+key)).status,404);
    assert.equal((await request('/api/game-profile?exe='+key+'&script='+'c'.repeat(64))).status,404);
    const pinned=feed.layer(feed.cached(peer,key),key,{exe});
    assert.ok(pinned?.ordinaryHash);
    const replaceScript=lines=>{const file=scriptFiles.get(peer),tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify({schema:1,lines}));fs.renameSync(tmp,file);};
    replaceScript(['other script variant']);
    assert.equal(feed.forExe(pinned,key,exe,{pinned:true}),null);
    assert.equal(await receiver.installed(peer,key,{exe}),null);
    replaceScript(['first script']);
    assert.equal((await receiver.installed(peer,key,{exe})).origin,'ordinary-seed');
    const published=await (await request('/api/torch-release/changes?after=0')).json();
    assert.equal(published.changes.length,1);
    for(const ws of connections)ws.close();
    const withdraw=()=>request('/api/game-profile/withdraw',{method:'POST',headers:{authorization:'Bearer '+f.env.ADAPTER_ADMIN_TOKEN},
      body:JSON.stringify({key,source:'auto'})});
    assert.equal((await withdraw()).status,200);assert.equal((await withdraw()).status,200);
    await until(()=>connections.length>=4&&session.seedPending&&receiver.status(peer,'7')?.code==='TORCH_REVOKED');
    assert.equal(await receiver.installed(peer,key,{exe}),null);
    sessions.seedBoundary(reader,{hookSequence:2,hookSource:'after withdrawal'});assert.notEqual(applied.at(-1).page.effectFrames,true);
    const replay=await (await request('/api/torch-release/changes?after='+published.changes[0].seq)).json();
    assert.equal(replay.changes.length,1);assert.equal(replay.changes[0].game_key,key);
    process.env.MEGULIT_OFFLINE='1';assert.equal((await feed.report(root,record)).state,'skipped');
    assert.deepEqual(relay.seedBases(root,'receive'),[]);
  }finally{await Promise.all(stops.map(stop=>stop?.()));sessions.stop();process.env=prior;}
});

test('policy pause fences in-flight scans across resume and keeps accepted uploads and published revisions',async t=>{
 const {enqueue,processJob,retryJobs,ordinaryPolicyRoute}=await import('../relay/src/ordinary-seed.js');
 const P=require('../core/torch-release.cjs'),signer=require('./helpers/torch-release.cjs').signer('ordinary-fixture');
 const db=database();t.after(()=>db.raw.close());
 const env={DB:db,ORDINARY_SCAN_URL:'https://scanner.invalid/scan',ORDINARY_SCAN_TOKEN:'fixture',ORDINARY_PUBLIC_KEYS:JSON.stringify([signer.public])};
 const h={json:x=>Response.json(x),fail:(error,status)=>Response.json({error},{status}),readJSON:async r=>({value:await r.json()})};
 const change=(enabled,revision)=>ordinaryPolicyRoute(new Request('https://fixture/policy',{method:'POST',body:JSON.stringify({enabled,revision})}),env,new Date(),null,h);
 const job=await enqueue(db,clean,new Date()),get=()=>db.raw.prepare('SELECT * FROM ordinary_seed_jobs WHERE id=?').get(job.id);
 let entered,release,calls=0;const started=new Promise(r=>{entered=r;}),hold=new Promise(r=>{release=r;});
 t.mock.method(global,'fetch',async(url,init)=>{
  const doc=JSON.parse(init.body),signed=signer.sign(doc);if(++calls===1){entered();await hold;}
  return Response.json({state:'clean',subject:await P.hash(doc),artifact:await P.hash(signed),signature:signed.signature,scanner:'ClamAV',version:'1.5.5',definitions:'1',scannedAt:new Date().toISOString()});
 });
 const inFlight=processJob(env,job.id);await started;
 assert.equal((await change(false,1)).status,200);assert.equal(get().lease,null);
 const other=await enqueue(db,{...clean,key:marker},new Date());
 await Promise.all([retryJobs(env),processJob(env,other.id)]);assert.equal(calls,1);
 assert.equal((await change(true,1)).status,409);assert.equal((await change(false,1)).status,200);
 assert.equal((await change(true,2)).status,200);release();await inFlight;
 assert.equal(get().state,'pending');assert.equal(db.raw.prepare('SELECT count(*) n FROM game_diffs').get().n,0);
 await retryJobs(env);await retryJobs(env);assert.equal(get().state,'published');assert.equal(calls,3);
 assert.equal(db.raw.prepare('SELECT count(*) n FROM torch_changes').get().n,2);
 await change(false,3);const row=db.raw.prepare('SELECT * FROM game_diffs LIMIT 1').get();
 assert.throws(()=>db.raw.prepare('UPDATE game_diffs SET rev=rev+1 WHERE game_key=?').run(row.game_key),/ORDINARY_PUBLISH_PAUSED/);
 assert.equal(db.raw.prepare('SELECT count(*) n FROM game_diffs WHERE withdrawn_at IS NULL').get().n,2);
});
