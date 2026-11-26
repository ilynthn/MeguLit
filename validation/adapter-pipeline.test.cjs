// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E560–E563 the pipeline end to end, offline: probe a synthetic library (real worker process), build the desensitized
   bundle (privacy: no line of the games in it), upload it in chunks to the relay handlers (D1 / R2 stand-ins), publish a
   signed pack, sync the feed, rebuild the index, report before/after, roll back a pack that made a game worse, and the
   withdrawn path. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {database}=require('./helpers/torch-release.cjs');
const {createHash,createHmac,randomUUID}=require('node:crypto');
const fx=require('./helpers/adapter-fixtures.cjs'),d=require('../services/desensitize.cjs');
const R=fx.root('megulit-pipeline-');process.env.MEGULIT_ROOT=R;process.env.MEGULIT_ADAPTER_PACKS_DIR=path.join(R,'data','adapter-packs');
const packs=require('../services/adapter-packs.cjs'),probe=require('../services/adapter-probe.cjs'),sample=require('../services/adapter-sample.cjs'),feed=require('../services/adapter-feed.cjs');
const K=fx.key();packs._trust([K.entry]);
const APP='1.4.9';fs.writeFileSync(path.join(R,'data','update-installed.json'),JSON.stringify({version:APP}));
fs.writeFileSync(path.join(R,'data','config','online.json'),JSON.stringify({relayUrl:'https://relay.test'}));

/* relay stand-ins (as in relay.test.cjs) */
const relayDir=path.join(__dirname,'..','relay'),MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){return database(MIGRATION); }
function r2(){const store=new Map();return {store,put:async(k,b)=>{store.set(k,new Uint8Array(b));},get:async k=>store.has(k)?{body:store.get(k)}:null,delete:async k=>{store.delete(k);}};}
const issues=[];
const ENV={DB:d1(),BUCKET:r2(),LINK_SECRET:'link',HASH_SALT:'salt',ADAPTER_ADMIN_TOKEN:'admin-token',GITHUB_TOKEN:'gh',GITHUB_REPO:'o/r',fetch:async(url,init)=>{issues.push(JSON.parse(init.body));return new Response(JSON.stringify({html_url:'https://github.com/o/r/issues/1'}),{status:201});}};
let handle;const relay=async()=>handle??=(await import(pathToFileURL(path.join(relayDir,'src','worker.js')).href)).handle;
/* fetch for the app: every https://relay.test call goes to the Worker handler */
const fetcher=async(url,init={})=>{const h=await relay();return h(new Request(url,{method:init.method||'GET',headers:{'cf-connecting-ip':'198.51.100.9',...(init.headers||{})},body:init.body}),ENV,new Date());};
const admin=(route,body,method='POST')=>fetcher('https://relay.test'+route,{method,headers:{authorization:'Bearer admin-token','content-type':'application/json'},body:body?JSON.stringify(body):undefined});

/* the library: one MGPK game no built-in reader knows, one plain KiriKiri-style loose .ks game */
const mg=fx.game(R,'Unknown Format Game');
const ksDir=path.join(R,'games','Loose KS');fs.mkdirSync(ksDir,{recursive:true});fs.writeFileSync(path.join(ksDir,'game.exe'),Buffer.alloc(2048,7));
const GAMES=[{id:'g-mgpk',title:'未知封包のゲーム',executable:mg.exe},{id:'g-missing',title:'Missing',executable:path.join(R,'games','nope','x.exe')}];
const DB=fx.db(GAMES);
const waitIdle=async()=>{for(let i=0;i<1500;i++){if(probe.status(R).state!=='running')return;await new Promise(r=>setTimeout(r,100));}throw Error('probe did not finish');};

test('probe: a background worker classifies every library game and stores the result (resumable)',async()=>{
 const s=probe.start(R,DB,{reason:'test',perGameMs:60000});assert.equal(s.state,'running');assert.equal(s.total,2);
 await waitIdle();const st=probe.status(R);assert.equal(st.state,'done');assert.equal(st.done,2);
 const r=probe.results(R);assert.equal(r['g-mgpk'].step,'unknown-pack','an archive no reader opens');assert.equal(r['g-missing'].detail,'GAME_MISSING');
 assert.ok(r['g-mgpk'].inventory.archives.some(a=>a.name==='data/script.mgp'&&a.magic.startsWith('4d47504b')));
 assert.equal(probe.start(R,DB,{reason:'again'}).total,0,'unchanged games are not probed again');
 assert.equal(probe.start(R,DB,{reason:'force',force:true}).total,2);probe.cancel(R);assert.equal(probe.status(R).state,'cancelled');
 const resumed=probe.resume(R,DB);assert.ok(['running','done'].includes(resumed.state));await waitIdle();assert.equal(probe.status(R).state,'done');
 assert.deepEqual(probe.problems(R).map(p=>p.id),['g-mgpk']);
});
test('upload bundle: desensitized samples + key candidates, manifest, no game text anywhere',async()=>{
 const prep=await sample.prepare(R,DB,{sampler:probe.sampleInWorker});assert.ok(prep.hash,JSON.stringify(prep));assert.equal(prep.games,1);
 const body=fs.readFileSync(path.join(R,'data','adapter-probe','outbox',prep.hash+'.json'),'utf8'),bundle=JSON.parse(body);
 const g=bundle.games[0];assert.equal(g.step,'unknown-pack');assert.ok(g.samples.length>=1);assert.match(g.key,/^[a-f0-9]{64}$/);
 /* privacy: no path, no user name, no line, no two characters of any line */
 assert.ok(!body.includes(R)&&!body.includes('Unknown Format Game')&&!body.includes(require('node:os').userInfo().username+'\\'));
 for(const line of fx.LINES){assert.ok(!body.includes(line));for(let i=0;i+1<line.length;i++)assert.ok(!body.includes(line.slice(i,i+2))||/[あア亜]{2}/.test(line.slice(i,i+2)),'pair '+line.slice(i,i+2));}
 const raw=d.partBytes(g.samples[0].sample.parts[0]);for(const enc of ['shift_jis','utf-8','utf-16le'])for(const line of fx.LINES)assert.ok(!new TextDecoder(enc).decode(raw).includes(line));
 assert.equal(sample.clean({games:[{title:'x',detail:'猫が好き'}]}),false,'clean() refuses text outside titles');
 const m=sample.manifest(R,prep.hash);assert.equal(m.hash,prep.hash);assert.equal(m.manifest[0].title,'未知封包のゲーム');assert.ok(m.manifest[0].items.some(i=>i.kind==='sample'));
 test.prep=prep;
 /* E599: the confirmation dialog shows, per sample, what it adds to the upload and its raw size; in total the bundle size
    against the relay cap (the cap the bundle is trimmed to), then the raw size it stands for */
 assert.equal(prep.limit,sample.MAX_BUNDLE);assert.equal(m.limit,sample.MAX_BUNDLE);
 const smp=m.manifest.flatMap(x=>x.items).filter(i=>i.kind==='sample');assert.ok(smp.length&&smp.every(i=>i.raw>0&&i.packed>0&&i.bytes>0));
 const ui=await import(pathToFileURL(path.join(__dirname,'..','web','adapter-probe-ui.js')).href),z=ui.bundleSizes(m);
 assert.equal(z.sent,prep.bytes);assert.equal(z.limit,8<<20);assert.ok(z.sent<=z.limit&&z.raw>=z.sent);
 assert.equal(z.raw,Math.max(prep.bytes,prep.bytes+smp.reduce((n,i)=>n+i.raw-i.bytes,0)));
 assert.equal(ui.bundleSizes({bytes:10,manifest:[]}).limit,8<<20,'an older service without limit: the relay cap');
});
test('upload: chunks to /api/probe, assembled and checked by the relay, one private skeleton',async()=>{
 const {hash}=test.prep;const before=sample.CHUNK;
 const r=await sample.upload(R,{hash,followUp:true,fetcher});assert.equal(r.state,'uploaded',JSON.stringify(r));assert.equal(r.issueUrl,'');
 assert.equal(issues.length,1);assert.deepEqual(issues[0].labels,['adapter-probe'],'detail issue for the [适配探针] 汇总 tracker');
 assert.ok(!issues[0].body.startsWith('MeguLit desensitized probe uploaded through the relay'),'not a legacy probe issue');
 const item=await ENV.DB.prepare("SELECT * FROM seed_admin_items WHERE kind='probe-skeleton'").first();
 assert.equal(item.state,'pending');assert.equal(item.published,0);assert.equal(item.author_torch_no,null);
 assert.ok(!item.body.includes(GAMES[0].title));assert.ok(!fx.LINES.some(l=>item.body.includes(l)));
 const row=await ENV.DB.prepare('SELECT * FROM probe_bundles').first();assert.equal(row.sha256,hash);assert.equal(ENV.BUCKET.store.get(row.object_key).length,row.size);
 assert.ok(![...ENV.BUCKET.store.keys()].some(k=>k.startsWith('probes/parts/')),'chunks cleaned up');
 assert.equal(Object.keys(sample.consent(R)).length,1,'follow-up consent kept for that game');
 assert.equal((await sample.upload(R,{hash:'0'.repeat(64),fetcher})).error,'NOT_PREPARED');
 const bad=await fetcher('https://relay.test/api/probe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,upload:'x',part:0,parts:1})});assert.equal(bad.status,400);
 assert.equal(before,sample.CHUNK);
});
const bundleOf = games => JSON.stringify({schema:'megulit.probe-bundle',version:1,app:'1.4.22',games});
const sha = text => createHash('sha256').update(text).digest('hex');
function uploadBundle(bundle, upload=randomUUID()){
 return fetcher('https://relay.test/api/probe',{method:'POST',body:JSON.stringify({
  version:1,upload,part:0,parts:1,size:Buffer.byteLength(bundle),sha256:sha(bundle),data:Buffer.from(bundle).toString('base64')
 })});
}
test('intake maps all four failure steps to pending admin evidence and retries a rolled-back queue write',async()=>{
 const expected={'parse-failed':'readable-script','unsupported-engine':'supported-reader',
  'decrypt-failed':'readable-archive','chinese-build':'japanese-source'};
 const games=Object.keys(expected).map((step,i)=>({identity:sha(step),key:sha('fp'+step),fingerprintKind:'exe-head-v1',
  step,title:'private-player@example.invalid',vndb:'v123',detail:'C:/Users/private-player',
  ...(i===3?{detected:'reallive',lines:111839,engines:[{id:'reallive',lines:111839}]}:
  {inventory:{archives:[i===1?{name:'script.bin',magic:'50534200'}:{name:'data.xp3',magic:'5850330d0a'}]}})}));
 const bundle=bundleOf(games),id=randomUUID();
 ENV.DB.raw.exec("CREATE TRIGGER fail_probe_draft BEFORE INSERT ON seed_admin_items WHEN NEW.kind='probe-skeleton' BEGIN SELECT RAISE(ABORT,'test queue failure'); END");
 try {
  assert.equal((await uploadBundle(bundle,id)).status,500);
  assert.equal(await ENV.DB.prepare('SELECT * FROM probe_bundles WHERE id=?').bind(id).first(),null);
 } finally { ENV.DB.raw.exec('DROP TRIGGER fail_probe_draft'); }
 assert.equal((await uploadBundle(bundle,id)).status,201);
 assert.equal((await (await uploadBundle(bundle,id)).json()).duplicate,true);
 const list=await (await admin('/api/seed-admin/items?state=pending&source=probe',null,'GET')).json();
 for(const [i,game] of games.entries()){
  const row=list.items.find(item=>item.probe?.probeIdentity===game.identity);
  assert.ok(row,game.step);assert.equal(row.engine,['kirikiri','emote','kirikiri','reallive'][i]);
  assert.equal(row.probe.status,'skeleton');assert.equal(row.probe.step,game.step);
  assert.ok(row.probe.missing.includes(expected[game.step]));assert.equal(row.probe.probeAppVersion,'1.4.22');
  assert.equal(row.probe.exeHeadFingerprint,game.key);assert.equal(row.seedRev,null);
  assert.equal(row.author,null);assert.equal(row.published,false);assert.equal(row.cardinal.reliable,false);
  assert.equal(row.capabilities.queue,false);assert.equal(row.revision,1);
  assert.doesNotMatch(JSON.stringify(row),/private-player|v123/);
 }
});

test('direct upload without a probe identity durably exposes sanitized backlog Markdown',async()=>{
 const bundle=bundleOf([{step:'timeout',detail:'private detail',title:'private name'}]);
 const upload=randomUUID();
 assert.equal((await uploadBundle(bundle,upload)).status,201);
 const item=await ENV.DB.prepare("SELECT id,body FROM seed_admin_items WHERE kind='probe-backlog' AND json_extract(body,'$.step')='timeout'").first();
 const response=await admin('/api/seed-admin/probe-backlog?item='+item.id,null,'GET');
 assert.equal(response.status,200);
 assert.equal(await response.text(),JSON.parse(item.body).markdown);
 assert.match(JSON.parse(item.body).markdown,/timeout[\s\S]*probe-identity/);
 assert.doesNotMatch(item.body,/private detail|private name/);
 assert.equal((await (await uploadBundle(bundle,upload)).json()).duplicate,true);
});

test('signed GitHub events persist a skeleton or one Markdown record before closing and retry failed closure',async t=>{
 const originalFetch=ENV.fetch;
 t.after(()=>{ENV.fetch=originalFetch;delete ENV.ADAPTER_PROBE_WEBHOOK_SECRET;delete ENV.ADAPTER_PROBE_ISSUE_AUTHOR;});
 ENV.ADAPTER_PROBE_WEBHOOK_SECRET='fixture-webhook';ENV.ADAPTER_PROBE_ISSUE_AUTHOR='probe-fixture';
 const issueOf=number=>({number,html_url:'https://github.com/o/r/issues/'+number,user:{login:'probe-fixture'},
  state:'open',labels:[{name:'adapter-probe'}],body:'MeguLit desensitized probe uploaded through the relay\n- step: **parse-failed** private detail'});
 const stored=issueOf(900),fallback=issueOf(901),ordinary={...issueOf(902),labels:[{name:'bug'}]};
 const rows=[stored,fallback,ordinary],patches=[];
 const upload=randomUUID(),identity=sha('legacy-probe');
 const bundle=bundleOf([{identity,step:'parse-failed'}]);
 assert.equal((await uploadBundle(bundle,upload)).status,201);
 ENV.DB.raw.prepare('UPDATE probe_bundles SET issue_url=? WHERE id=?').run(stored.html_url,upload);
 ENV.DB.raw.prepare("DELETE FROM seed_admin_items WHERE json_extract(body,'$.probeIdentity')=?").run(identity);
 const job=number=>ENV.DB.raw.prepare('SELECT * FROM probe_issue_disposition WHERE issue=?').get(number);
 let failClose=true;
 ENV.fetch=async(url,init)=>{
  const issue=rows.find(x=>url.endsWith('/'+x.number));assert.ok(issue);
  if(init.method==='GET')return Response.json(issue);
  assert.equal(init.method,'PATCH');assert.ok(job(issue.number),'disposition before any PATCH');
  assert.equal(JSON.parse(init.body).state_reason,'not_planned');
  patches.push(issue.number);
  if(issue===fallback&&failClose)return new Response(null,{status:503});
  issue.state='closed';return Response.json(issue);
 };
 const event=(issue,valid=true)=>{
  const body=JSON.stringify({action:'opened',repository:{full_name:'o/r'},issue});
  return fetcher('https://relay.test/api/probe/issue-webhook',{method:'POST',body,headers:{'x-github-event':'issues',
   'x-hub-signature-256':'sha256='+createHmac('sha256',valid?'fixture-webhook':'wrong').update(body).digest('hex')}});
 };
 assert.equal((await event(stored,false)).status,401);
 assert.equal((await (await event(ordinary)).json()).ignored,true);
 ENV.DB.raw.exec("CREATE TRIGGER fail_disposition BEFORE INSERT ON probe_issue_disposition BEGIN SELECT RAISE(ABORT,'test disposition failure'); END");
 try { assert.equal((await event(stored)).status,500); } finally { ENV.DB.raw.exec('DROP TRIGGER fail_disposition'); }
 assert.deepEqual(patches,[]);
 assert.equal((await event(stored)).status,200);assert.equal(job(900).markdown,null);
 assert.equal(ENV.DB.raw.prepare("SELECT state FROM seed_admin_items WHERE json_extract(body,'$.probeIdentity')=?").get(identity).state,'pending');
 assert.equal((await event(fallback)).status,502);assert.equal(job(901).closed_at,null);
 const markdown=await admin('/api/seed-admin/probe-backlog?issue=901',null,'GET');
 assert.match(markdown.headers.get('content-type'),/^text\/markdown/);
 const record=await markdown.text();
 assert.match(record,/#901[\s\S]+parse-failed[\s\S]+probe-identity/);assert.doesNotMatch(record,/private detail/);
 failClose=false;assert.equal((await event(fallback)).status,200);
 assert.equal((await event(fallback)).status,200);
 assert.deepEqual(patches,[900,901,901]);assert.equal(job(901).markdown,record);assert.ok(job(901).closed_at);
 assert.equal(job(902),undefined);
});
test('relay admin: publishing needs the token; feed lists packs; packs are served as signed',async()=>{
 const p=packs.sign({...fx.fixturePack(),id:'mgpk-reader',version:1},K.privateKey,'test');
 assert.equal((await fetcher('https://relay.test/api/adapters/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pack:p})})).status,401);
 assert.equal((await admin('/api/adapters/publish',{pack:{...p,signature:undefined}})).status,400,'unsigned refused');
 assert.equal((await admin('/api/adapters/publish',{pack:p})).status,201);
 assert.equal((await admin('/api/adapters/publish',{pack:{...p,title:'changed'}})).status,409,'a published version cannot change');
 const future=packs.sign({...fx.fixturePack(),id:'future-pack',version:1,format:2},K.privateKey,'test');assert.equal((await admin('/api/adapters/publish',{pack:future})).status,201);
 const f=await (await fetcher('https://relay.test/api/adapters/feed?app=1.4.9&format=1')).json();assert.equal(f.schema,'megulit.adapter-feed');assert.equal(f.packs.length,2);
 const served=await (await fetcher('https://relay.test/api/adapters/pack/mgpk-reader/1')).json();assert.equal(packs.admit(served,{app:APP}).ok,true);
});
test('sync: installs what this app can use, skips the rest, rebuilds the game with the pack and reports the numbers',async()=>{
 const r=await feed.sync(R,{fetch:fetcher,db:DB});assert.equal(r.state,'ok',JSON.stringify(r));
 assert.deepEqual(r.installed,[{id:'mgpk-reader',version:1}]);assert.ok(r.skipped.some(s=>s.id==='future-pack'&&s.reason==='FORMAT_NEWER'));
 const st=feed.status(R);assert.equal(st.games['g-mgpk'].state,'kept');assert.equal(st.games['g-mgpk'].after.lines,mg.lines);assert.equal(st.games['g-mgpk'].before.lines,0);
 const ot=JSON.parse(fs.readFileSync(path.join(R,'data','config','original-text.json'),'utf8'));assert.equal(ot['g-mgpk'].runtime.engine,'adapter-pack');
 const rep=await (await admin('/api/adapters/reports',null,'GET')).json();assert.equal(rep.reports.length,1);assert.equal(rep.reports[0].after.lines,mg.lines);assert.deepEqual(Object.keys(rep.reports[0].before).sort(),['japanese','lines','paired','total']);
 assert.equal((await feed.sync(R,{fetch:fetcher,db:DB})).installed.length,0,'nothing new the second time');
});
test('auto rollback: a new version that reads fewer lines is turned off for that game, the old one keeps working',async()=>{
 const worse={...fx.fixturePack(),id:'mgpk-reader',version:2,grammar:{...fx.fixturePack().grammar,text:'^(.{0,6})$'}};
 assert.equal((await admin('/api/adapters/publish',{pack:packs.sign(worse,K.privateKey,'test')})).status,201);
 const r=await feed.sync(R,{fetch:fetcher,db:DB});assert.deepEqual(r.installed,[{id:'mgpk-reader',version:2}]);
 const g=feed.status(R).games['g-mgpk'];assert.equal(g.state,'rolled-back');assert.equal(g.after.lines,mg.lines,'back to the full read');
 assert.ok(packs.readState(R).dirs[packs.dirKey(mg.dir)].off.includes('mgpk-reader@2'));
});
test('withdrawn: the maintainer takes a version off the feed, apps roll back to the previous one',async()=>{
 assert.equal((await admin('/api/adapters/withdraw',{id:'mgpk-reader',version:2})).status,200);
 const f=await (await fetcher('https://relay.test/api/adapters/feed?app=1.4.9&format=1')).json();assert.ok(f.withdrawn.some(w=>w.id==='mgpk-reader'&&w.version===2));
 await feed.sync(R,{fetch:fetcher,db:DB});const s=packs.readState(R);assert.equal(s.active['mgpk-reader'],1);assert.ok(s.blocked['mgpk-reader@2']);
});
test('probe requests: with the automatic upload off, a game without follow-up consent waits for the user; reports and requests carry no text',async()=>{
 fs.rmSync(path.join(R,'data','adapter-probe','consent.json'),{force:true});require('../services/probe-auto.cjs').setEnabled(R,false);
 const key=require('../services/shared-adaptation.cjs').fingerprint(mg.exe).key;
 assert.equal((await admin('/api/adapters/probe-request',{id:'req-1',keys:[key]})).status,201);
 await feed.sync(R,{fetch:fetcher,db:DB});const pending=feed.pendingProbes(R);assert.equal(pending.length,1);assert.equal(pending[0].gameId,'g-mgpk');
 assert.equal((await admin('/api/adapters/probe-request',{id:'req-1',close:true})).status,200);
 require('../services/probe-auto.cjs').setEnabled(R,true);
});
test('compatibility for old apps: a feed entry this app cannot use never reaches the store',async()=>{
 const newer=packs.sign({...fx.fixturePack(),id:'needs-new-op',version:1,requires:[...fx.fixturePack().requires,'transform:aes-ctr']},K.privateKey,'test');
 await admin('/api/adapters/publish',{pack:newer});const r=await feed.sync(R,{fetch:fetcher,db:DB});
 assert.ok(r.skipped.some(s=>s.id==='needs-new-op'&&s.reason==='CAPABILITY'));assert.deepEqual(packs.installedVersions(R,'needs-new-op'),[]);
});
test('overview hook: each row carries the last probe and the pack in use',()=>{
 assert.equal(probe.brief(R,'g-mgpk').step,'unknown-pack');assert.equal(feed.status(R).games['g-mgpk'].tag.startsWith('mgpk-reader@'),true);
});
