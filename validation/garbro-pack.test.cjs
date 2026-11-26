'use strict';
/* E470 GARbro as the on-demand "archives" runtime pack: manifest, download + SHA-256 check + source fallback, install
   into runtime/garbro, ensure(), uninstall, and the fallback reader's text scan. A live check runs against a real GARbro
   when MEGULIT_GARBRO_TEST_DIR points at an unpacked release (no network, no game needed). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const repo=path.join(__dirname,'..');
const manifest=()=>JSON.parse(fs.readFileSync(path.join(repo,'setup','runtime.json'),'utf8').replace(/^\uFEFF/,''));

test('runtime.json lists GARbro as an on-demand pack beside base/reading/voice',()=>{
 const m=manifest(),p=m.packs.archives;
 assert.deepEqual(Object.keys(m.packs).slice(0,3),['base','reading','voice']);
 assert.ok(p,'archives pack');assert.equal(p.onDemand,true);assert.equal(p.dest,'runtime/garbro');
 assert.match(p.sha256,/^[0-9A-F]{64}$/);assert.ok(p.size>1e6&&p.unpacked>p.size);
 /* 2026-11-27 GARbro-Mod 1.0.2.3 (crskycode, MIT; ships no licence text, so the pack names the one in core/runtime-licenses); 1.5.44 stays as the hidden legacy pack */
 assert.ok(p.urls.every(u=>u.startsWith('https://github.com/crskycode/GARbro/releases/download/')),'upstream release only');
 assert.ok(fs.existsSync(path.join(__dirname,'..','core','runtime-licenses',p.licenseFile)),'licence text kept');
 const l=m.packs['archives-legacy'];assert.equal(l.hidden,true);assert.equal(l.dest,'runtime/garbro-legacy');assert.ok(l.urls.every(u=>u.startsWith('https://github.com/morkt/GARbro/releases/download/v1.5.44/')));
 assert.match(p.license,/MIT/);
 assert.match(fs.readFileSync(path.join(repo,'THIRD-PARTY.md'),'utf8'),/runtime\/garbro/,'THIRD-PARTY names the downloaded pack');
});
test('first-launch installer lists stay base/reading/voice (GARbro never in "full")',()=>{
 const ps=fs.readFileSync(path.join(repo,'setup','setup-runtime.ps1'),'utf8');assert.match(ps,/\$full = @\('base','reading','voice'\)/);
});

function zipOf(files){/* build a small zip with the system tar so the test needs nothing else */
 const src=fs.mkdtempSync(path.join(os.tmpdir(),'gbz-'));for(const [name,body] of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(src,name)),{recursive:true});fs.writeFileSync(path.join(src,name),body);}
 const out=path.join(os.tmpdir(),'gbz-'+crypto.randomUUID()+'.zip');
 const r=spawnSync(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-a','-cf',out,'-C',src,'.'],{windowsHide:true});assert.equal(r.status,0,String(r.stderr));
 fs.rmSync(src,{recursive:true,force:true});return fs.readFileSync(out);
}
function serve(routes){return new Promise(r=>{const s=http.createServer((q,res)=>{const body=routes[q.url];if(!body){res.writeHead(404);return res.end();}res.writeHead(200,{'content-length':body.length});res.end(body);});s.listen(0,'127.0.0.1',()=>r(s));});}
function rootWith(pack){const root=fs.mkdtempSync(path.join(os.tmpdir(),'gbp-'));fs.mkdirSync(path.join(root,'setup'));fs.writeFileSync(path.join(root,'setup','runtime.json'),JSON.stringify({version:'t',packs:{base:{size:1,unpacked:1,sha256:'0',urls:[]},archives:pack},mirrors:[]}));return root;}

test('download, verify, install into runtime/garbro, ensure, uninstall',async()=>{
 const zip=zipOf({'GARbro/GameRes.dll':'g','GARbro/ArcFormats.dll':'a','GARbro/GameData/Formats.dat':'f'}),sha=crypto.createHash('sha256').update(zip).digest('hex').toUpperCase();
 const server=await serve({'/good.zip':zip,'/bad.zip':Buffer.from('not the file')}),base='http://127.0.0.1:'+server.address().port;
 const {RuntimePacks}=require('../core/runtime-packs.cjs');
 try{
  /* a failing source (404) and a source with the wrong bytes are skipped; the third one is used */
  const root=rootWith({size:zip.length,unpacked:3,sha256:sha,onDemand:true,dest:'runtime/garbro',urls:[base+'/missing.zip',base+'/bad.zip',base+'/good.zip']});
  const packs=new RuntimePacks(root);
  assert.equal(packs.status().packs.find(p=>p.id==='archives').onDemand,true);
  packs.download([]);assert.equal(packs.jobs.archives,undefined,'"download all" leaves on-demand packs alone');await packs.running;
  assert.equal(packs.installed('archives'),false);
  await packs.ensure('archives',{timeout:20000});
  assert.equal(packs.installed('archives'),true);
  for(const f of ['GameRes.dll','ArcFormats.dll','GameData/Formats.dat'])assert.ok(fs.existsSync(path.join(root,'runtime','garbro',f)),f);
  await packs.running;assert.deepEqual(fs.readdirSync(root).filter(n=>/\.part$|\.unpack$/.test(n)),[],'temp files cleaned');
  assert.equal(await packs.ensure('archives'),true,'cached: no second download');
  packs.uninstall('archives');assert.equal(packs.installed('archives'),false);assert.ok(!fs.existsSync(path.join(root,'runtime','garbro')));
  assert.throws(()=>packs.uninstall('base'),/PACK_NOT_REMOVABLE/);
  fs.rmSync(root,{recursive:true,force:true});
  /* only a wrong hash: install fails, nothing left behind, ensure rejects */
  const bad=rootWith({size:12,unpacked:3,sha256:sha,onDemand:true,dest:'runtime/garbro',urls:[base+'/bad.zip']}),p2=new RuntimePacks(bad);
  await assert.rejects(p2.ensure('archives',{timeout:20000}),/校验/);
  assert.equal(p2.installed('archives'),false);assert.ok(!fs.existsSync(path.join(bad,'runtime-archives.part')));
  fs.rmSync(bad,{recursive:true,force:true});
  /* a pack whose dest points outside runtime/ is refused */
  const evil=rootWith({size:zip.length,unpacked:3,sha256:sha,onDemand:true,dest:'../escape',urls:[base+'/good.zip']}),p3=new RuntimePacks(evil);
  await assert.rejects(p3.ensure('archives',{timeout:20000}),/PACK_DEST_OUTSIDE/);fs.rmSync(evil,{recursive:true,force:true});
 }finally{server.close();}
});
test('shared store: Settings and the reader see the same download job',()=>{
 const {RuntimePacks}=require('../core/runtime-packs.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'gbs-'));
 assert.equal(RuntimePacks.shared(root),RuntimePacks.shared(root.toUpperCase()));fs.rmSync(root,{recursive:true,force:true});
 assert.match(fs.readFileSync(path.join(repo,'services','runtime.cjs'),'utf8'),/RuntimePacks\.shared\(this\.root\)[\s\S]*pack_uninstall/);
});

test('fallback reader: text scan, archive pick, media skipped, registered last',()=>{
 const g=require('../services/original-engines/garbro.cjs');
 const sjis=Buffer.concat([Buffer.from([0,1,2]),Buffer.from('82b182f182c982bf82cd814190a28a4581420000','hex'),Buffer.from('@cmd 12\n')]);
 assert.deepEqual(g.decodeRuns(sjis),['こんにちは、世界。']);
 assert.deepEqual(g.decodeRuns(Buffer.from('「おはよう」と言った。\0「うん」\0','utf16le')),['「おはよう」と言った。','「うん」']);
 assert.deepEqual(g.decodeRuns(Buffer.from('plain ascii only')),[]);
 const re=new RegExp(g.MATCH,'i');assert.ok(re.test('scene/a01.scn'));assert.ok(!re.test('bg/sky.png'));assert.ok(!re.test('voice/x.ogg'));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gbg-'));fs.mkdirSync(path.join(dir,'movie'));
 fs.writeFileSync(path.join(dir,'script.npk'),Buffer.alloc(20000));fs.writeFileSync(path.join(dir,'tiny.pak'),Buffer.alloc(100));
 fs.writeFileSync(path.join(dir,'movie','op.dat'),Buffer.alloc(20000));fs.writeFileSync(path.join(dir,'unins000.dat'),Buffer.alloc(20000));fs.writeFileSync(path.join(dir,'game.exe'),Buffer.alloc(20000));
 assert.deepEqual(g.archives(dir).map(f=>path.basename(f)),['script.npk']);fs.rmSync(dir,{recursive:true,force:true});
 const sc=require('../services/original-engines/scenes.cjs');assert.equal(Object.keys(sc.ENGINES).pop(),'garbro','own readers first, GARbro last');
 assert.match(fs.readFileSync(path.join(repo,'web','game-language.js'),'utf8'),/kind==='garbro'[\s\S]*garbroDownload/);
});

const dialogue=['今日は晴れています。','「ここで待とう。」'];
for(const fixture of [
 {name:'PVNS',dir:'pack',archive:'SCRIPT.PBZ',magic:'PBZ1',file:'start.SCR',format:'PBZ',script:[';file:001 ver1.00',';ここはコメントです。',':開始ラベル','title 表示用の章名',...dialogue],extra:{'README.TXT':'内部エラーがありました。'}},
 {name:'Ivory',dir:'misc',archive:'script.pk',magic:'fPK ',file:'a01.TXT',format:'PK/IVORY',script:['unique 1','#ここはコメントです。','savetext "表示用の章名"',...dialogue],extra:{'A01.HPB':'fAGS','A01.NTK':'fAGS','ERR.TXT':'内部エラーがありました。','PACKFILEW.EXE':'配布用のプログラムです。'}}
])test(`${fixture.name} archive supplies the probe and original entry with dialogue`,t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'garbro-legacy-')),game=path.join(root,'game');
 const previous=process.env.MEGULIT_GARBRO_CACHE;
 process.env.MEGULIT_GARBRO_CACHE=path.join(root,'cache');
 t.after(()=>{if(previous==null)delete process.env.MEGULIT_GARBRO_CACHE;else process.env.MEGULIT_GARBRO_CACHE=previous;fs.rmSync(root,{recursive:true,force:true});});
 const g=require('../services/original-engines/garbro.cjs'),kit=require('../services/original-engines/kit.cjs');
 const probe=require('../services/adapter-probe-core.cjs'),original=require('../services/original-text.cjs');
 const archive=path.join(game,fixture.dir,fixture.archive),executable=path.join(game,'game.exe');
 fs.mkdirSync(path.dirname(archive),{recursive:true});
 fs.writeFileSync(executable,'MZ');
 const header=Buffer.alloc(20000);header.write(fixture.magic);fs.writeFileSync(archive,header);
 const files={[fixture.file]:fixture.script.join('\r\n'),...fixture.extra},cache=g.cacheDir(archive);
 fs.mkdirSync(cache,{recursive:true});
 for(const [name,body] of Object.entries(files))fs.writeFileSync(path.join(cache,name),kit.encodeSjis(body));
 fs.writeFileSync(path.join(cache,'done.json'),JSON.stringify({format:fixture.format,files:Object.keys(files)}));
 const result=probe.probeGame({dir:game,executable});
 assert.equal(result.step,'ok');
 assert.equal(result.detected,'garbro');
 assert.equal(result.engines.find(e=>e.id==='garbro').scenes,1);
 assert.equal(result.japaneseLines,2);
 const state=original.scanRunning(root,'1',executable);
 assert.equal(state.status,'native-japanese');
 assert.deepEqual(JSON.parse(fs.readFileSync(state.runtime.index,'utf8')).lines,dialogue);
});

test('GARbro keeps its existing archive types and avoids media and redistributables',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'garbro-select-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'DirectX9'));
 for(const [file,magic] of Object.entries({'script.npk':'NPK2','script.pbz':'PBZ0','script.pk':'none','bg.pbz':'PBZ1','voice.pk':'fPK ','DirectX9/dxnt.cab':'MSCF','DirectX9/script.pak':'PACK'})){
  const data=Buffer.alloc(20000);data.write(magic);fs.writeFileSync(path.join(root,file),data);
 }
 const g=require('../services/original-engines/garbro.cjs');
 assert.deepEqual(g.archives(root).map(f=>path.relative(root,f)).sort(),[path.join('DirectX9','script.pak'),'script.npk']);
});

test('a legacy script pack does not displace a readable generic archive from the probe',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'garbro-archive-limit-')),game=path.join(root,'game');
 const previous=process.env.MEGULIT_GARBRO_CACHE;
 process.env.MEGULIT_GARBRO_CACHE=path.join(root,'cache');
 t.after(()=>{if(previous==null)delete process.env.MEGULIT_GARBRO_CACHE;else process.env.MEGULIT_GARBRO_CACHE=previous;fs.rmSync(root,{recursive:true,force:true});});
 const g=require('../services/original-engines/garbro.cjs'),kit=require('../services/original-engines/kit.cjs');
 fs.mkdirSync(game);
 for(let i=1;i<=11;i++)fs.writeFileSync(path.join(game,`script${i}.pak`),Buffer.alloc(20000));
 const existing=path.join(game,'script.pak');fs.writeFileSync(existing,Buffer.alloc(50000));
 const cached=g.cacheDir(existing);fs.mkdirSync(cached,{recursive:true});
 fs.writeFileSync(path.join(cached,'start.txt'),kit.encodeSjis(dialogue.join('\r\n')));
 fs.writeFileSync(path.join(cached,'done.json'),JSON.stringify({format:'ZIP',files:['start.txt']}));
 const header=Buffer.alloc(20000);header.write('PBZ1');
 const legacy=path.join(game,'script.pbz');fs.writeFileSync(legacy,header);
 const empty=g.cacheDir(legacy);fs.mkdirSync(empty,{recursive:true});
 fs.writeFileSync(path.join(empty,'start.scr'),'; comment only');
 fs.writeFileSync(path.join(empty,'done.json'),JSON.stringify({format:'PBZ',files:['start.scr']}));
 const result=require('../services/adapter-probe-core.cjs').probeGame({dir:game});
 assert.equal(result.step,'ok');
 assert.equal(result.detected,'garbro');
 assert.equal(result.japaneseLines,2);
});

test('cold adapter probe leaves GARbro extraction to the synchronous fallback',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'garbro-cold-probe-')),game=path.join(root,'game');
 const previous=process.env.MEGULIT_GARBRO_CACHE;
 process.env.MEGULIT_GARBRO_CACHE=path.join(root,'cache');
 t.after(()=>{if(previous==null)delete process.env.MEGULIT_GARBRO_CACHE;else process.env.MEGULIT_GARBRO_CACHE=previous;fs.rmSync(root,{recursive:true,force:true});});
 const {RuntimePacks}=require('../core/runtime-packs.cjs'),g=require('../services/original-engines/garbro.cjs');
 t.mock.method(RuntimePacks.prototype,'installed',()=>false);
 const ensure=t.mock.method(RuntimePacks.prototype,'ensure',async()=>false);
 fs.mkdirSync(game);
 const archive=path.join(game,'script.pak');fs.writeFileSync(archive,Buffer.alloc(20000));
 const result=require('../services/adapter-probe-core.cjs').probeGame({dir:game});
 assert.equal(result.needs,'garbro');
 assert.equal(ensure.mock.callCount(),0);
 assert.equal(g.jobs.has(archive),false);
});

test('GARbro can retry a missing temporary directory from an earlier extraction',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'garbro-stale-failure-')),game=path.join(root,'game');
 const previous=process.env.MEGULIT_GARBRO_CACHE;
 process.env.MEGULIT_GARBRO_CACHE=path.join(root,'cache');
 t.after(()=>{if(previous==null)delete process.env.MEGULIT_GARBRO_CACHE;else process.env.MEGULIT_GARBRO_CACHE=previous;fs.rmSync(root,{recursive:true,force:true});});
 const {RuntimePacks}=require('../core/runtime-packs.cjs'),g=require('../services/original-engines/garbro.cjs');
 t.mock.method(RuntimePacks.prototype,'installed',()=>false);
 t.mock.method(RuntimePacks.prototype,'ensure',async()=>{throw Error('PACK_NOT_INSTALLED');});
 const probe=require('../services/adapter-probe-core.cjs'),original=require('../services/original-text.cjs');
 fs.mkdirSync(game);
 const archive=path.join(game,'script.pak'),executable=path.join(game,'game.exe');
 fs.writeFileSync(archive,Buffer.alloc(20000));fs.writeFileSync(executable,'MZ');
 const cache=g.cacheDir(archive);fs.mkdirSync(cache,{recursive:true});
 const fail=error=>fs.writeFileSync(path.join(cache,'failed.json'),JSON.stringify({version:g.version(),error}));
 fail('GARBRO_NO_SCRIPTS');
 assert.equal(probe.probeGame({dir:game,executable}).needs,undefined);
 assert.equal(original.scanRunning(root,'1',executable).status,'unsupported');
 fail("ENOENT: no such file or directory, rename '"+cache+".part' -> '"+cache+"'");
 assert.equal(probe.probeGame({dir:game,executable}).needs,'garbro');
 assert.equal(original.scanRunning(root,'1',executable).status,'preparing');
});

test('host loads the Formats.dat key database and tries every scheme GARbro lists',()=>{const h=fs.readFileSync(path.join(repo,'services','garbro-host.ps1'),'utf8');assert.match(h,/DeserializeScheme/);assert.match(h,/GetAccessWidget()/);assert.match(h,/NEEDS_SCHEME/);});

const live=process.env.MEGULIT_GARBRO_TEST_DIR;
test('live: real GARbro opens and extracts a zip through garbro-host.ps1',{skip:!live&&'set MEGULIT_GARBRO_TEST_DIR to an unpacked GARbro release'},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gbl-'));fs.mkdirSync(path.join(root,'runtime'),{recursive:true});fs.cpSync(live,path.join(root,'runtime','garbro'),{recursive:true});
 fs.mkdirSync(path.join(root,'setup'));fs.copyFileSync(path.join(repo,'setup','runtime.json'),path.join(root,'setup','runtime.json'));
 const game=path.join(root,'game');fs.mkdirSync(game);
 fs.writeFileSync(path.join(game,'script.pak'),zipOf({'scene01.txt':Buffer.from('82b182f182c982bf82cd814190a28a458142','hex'),'bg.png':crypto.randomBytes(20000)}));
 process.env.MEGULIT_GARBRO_ROOT=root;delete require.cache[require.resolve('../services/original-engines/garbro.cjs')];
 const g=require('../services/original-engines/garbro.cjs');
 assert.ok((await g.run(['-Mode','probe'])).formats>400);
 const info=await g.unpack(path.join(game,'script.pak'),{download:false});assert.equal(info.format,'ZIP');assert.deepEqual(info.files,['scene01.txt']);
 const scenes=g.engine.scenes(game);assert.deepEqual(scenes.map(s=>g.engine.parse(s.read()).lines),[['こんにちは、世界。']]);
 delete process.env.MEGULIT_GARBRO_ROOT;fs.rmSync(root,{recursive:true,force:true});
});

test('GARbro-Mod first; an archive it cannot open (or a pack that does not load) is tried once more with the 1.5.44 legacy pack, only when that is installed',async()=>{
 const G=require('../services/original-engines/garbro.cjs');const calls=[];
 const runner=async dir=>{calls.push(path.basename(dir));if(/garbro$/.test(dir))throw Error('UNSUPPORTED_ARCHIVE');return {format:'OLD',files:['a.ks']};};
 assert.deepEqual(await G.run(['-Mode','list'],{},{runner,legacy:()=>true}),{format:'OLD',files:['a.ks']});assert.deepEqual(calls,['garbro','garbro-legacy']);
 calls.length=0;await assert.rejects(G.run(['-Mode','list'],{},{runner,legacy:()=>false}),/UNSUPPORTED_ARCHIVE/);assert.deepEqual(calls,['garbro'],'no legacy pack: as before');
 calls.length=0;await assert.rejects(G.run([],{},{runner:async d=>{calls.push(d);throw Error('GARBRO_TIMEOUT');},legacy:()=>true}),/GARBRO_TIMEOUT/);assert.equal(calls.length,1,'a timeout is not retried');});
