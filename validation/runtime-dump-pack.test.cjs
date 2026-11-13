'use strict';
/* 2026-11-13 MeguLitDump32/64.dll as the cold "runtime-dump" runtime pack (docs/runtime-dump-pack.md): listed in
   runtime.json but hidden from Settings, not removable, never in "download full", installed into runtime/runtime-dump
   from its own file list, fetched in the background by HookNative.fetchRuntimeDump once per launch and silently given
   up on failure. No game and no network beyond a local test server. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const repo=path.join(__dirname,'..');
const manifest=()=>JSON.parse(fs.readFileSync(path.join(repo,'setup','runtime.json'),'utf8').replace(/^\uFEFF/,''));
function zipOf(files){const src=fs.mkdtempSync(path.join(os.tmpdir(),'rdz-'));for(const [n,b] of Object.entries(files))fs.writeFileSync(path.join(src,n),b);
 const out=path.join(os.tmpdir(),'rdz-'+crypto.randomUUID()+'.zip'),r=spawnSync(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-a','-cf',out,'-C',src,'.'],{windowsHide:true});
 assert.equal(r.status,0,String(r.stderr));fs.rmSync(src,{recursive:true,force:true});return fs.readFileSync(out);}
function serve(routes){return new Promise(r=>{const s=http.createServer((q,res)=>{const b=routes[q.url];if(!b){res.writeHead(404);return res.end();}res.writeHead(200,{'content-length':b.length});res.end(b);});s.listen(0,'127.0.0.1',()=>r(s));});}
const FILES=['MeguLitDump32.dll','MeguLitDump64.dll','pack.json'];
function rootWith(pack){const root=fs.mkdtempSync(path.join(os.tmpdir(),'rdp-'));fs.mkdirSync(path.join(root,'setup'));fs.mkdirSync(path.join(root,'native'));
 fs.writeFileSync(path.join(root,'setup','runtime.json'),JSON.stringify({version:'t',packs:{base:{size:1,unpacked:1,sha256:'0',urls:[]},'runtime-dump':pack},mirrors:[]}));return root;}
const fresh=()=>{for(const m of ['../core/runtime-packs.cjs'])delete require.cache[require.resolve(m)];return require('../core/runtime-packs.cjs');};

test('runtime.json carries runtime-dump as a hidden on-demand pack of our own release',()=>{
 const p=manifest().packs['runtime-dump'];assert.ok(p,'entry');assert.equal(p.onDemand,true);assert.equal(p.hidden,true);
 assert.equal(p.dest,'runtime/runtime-dump');assert.deepEqual(p.files,FILES);assert.match(p.sha256,/^[0-9A-F]{64}$/);
 assert.ok(p.urls.every(u=>/^https:\/\/github\.com\/ilynthn\/MeguLit\/releases\/download\/runtime-dump-v[\d.]+\/MeguLit-runtime-dump-v[\d.]+\.zip$/.test(u)));
 assert.ok(!/MeguLitDump/.test(fs.readFileSync(path.join(repo,'Release.ps1'),'utf8')),'not shipped in the app zip any more');});

test('hidden: not in status(), not in "download full", not removable; installs from its own file list',async()=>{
 const zip=zipOf(Object.fromEntries(FILES.map(f=>[f,f]))),sha=crypto.createHash('sha256').update(zip).digest('hex').toUpperCase();
 const server=await serve({'/p.zip':zip}),base='http://127.0.0.1:'+server.address().port;
 try{const {RuntimePacks}=fresh(),root=rootWith({size:zip.length,unpacked:3,sha256:sha,onDemand:true,hidden:true,dest:'runtime/runtime-dump',files:FILES,urls:[base+'/p.zip']}),packs=new RuntimePacks(root);
  assert.equal(packs.status().packs.some(p=>p.id==='runtime-dump'),false,'no row in Settings');
  packs.download([]);assert.equal(packs.jobs['runtime-dump'],undefined);await packs.running;
  await packs.ensure('runtime-dump',{timeout:20000});assert.equal(packs.installed('runtime-dump'),true);
  for(const f of FILES)assert.ok(fs.existsSync(path.join(root,'runtime','runtime-dump',f)),f);
  assert.throws(()=>packs.uninstall('runtime-dump'),/PACK_NOT_REMOVABLE/);
  fs.rmSync(path.join(root,'runtime','runtime-dump','pack.json'));assert.equal(packs.installed('runtime-dump'),false,'incomplete = not installed');
  fs.rmSync(root,{recursive:true,force:true});}finally{server.close();}});

test('HookNative.fetchRuntimeDump: background download once, silent when offline, retried next launch',async()=>{
 const zip=zipOf(Object.fromEntries(FILES.map(f=>[f,f]))),sha=crypto.createHash('sha256').update(zip).digest('hex').toUpperCase();
 let hits=0;const server=await new Promise(r=>{const s=http.createServer((q,res)=>{hits++;if(s.down){res.writeHead(503);return res.end();}res.writeHead(200,{'content-length':zip.length});res.end(zip);});s.listen(0,'127.0.0.1',()=>r(s));});
 try{const {RuntimePacks}=fresh();delete require.cache[require.resolve('../core/hook-native.cjs')];const HookNative=require('../core/hook-native.cjs');const H=HookNative.HookNative||HookNative;
  const root=rootWith({size:zip.length,unpacked:3,sha256:sha,onDemand:true,hidden:true,dest:'runtime/runtime-dump',files:FILES,urls:['http://127.0.0.1:'+server.address().port+'/p.zip']}),folder=path.join(root,'native');
  server.down=true;H.fetchRuntimeDump(folder);H.fetchRuntimeDump(folder);await H.dumpFetch;assert.equal(hits,1,'one try per launch, no error thrown');
  assert.equal(RuntimePacks.shared(root).installed('runtime-dump'),false);
  server.down=false;H.fetchRuntimeDump(folder);await H.dumpFetch;assert.equal(RuntimePacks.shared(root).installed('runtime-dump'),true,'next launch gets it');
  H.fetchRuntimeDump(folder);assert.equal(H.dumpFetch,null,'installed: nothing more to do');
  H.fetchRuntimeDump(path.join(os.tmpdir(),'no-such-megulit','native'));fs.rmSync(root,{recursive:true,force:true});}finally{server.close();}});
