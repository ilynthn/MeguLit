// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E596 runtime harvest: detectors on a synthetic running game, the privacy line (a text detector over everything that
   could be uploaded), the pack format additions, the bundle / relay / feed loop, and — on Windows with the reader
   built — the native read-only reader against a live stand-in process. No game is launched. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{fork}=require('node:child_process'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const fx=require('./helpers/adapter-fixtures.cjs'),rf=require('./helpers/runtime-fixtures.cjs');
const R=fx.root('megulit-runtime-');process.env.MEGULIT_ROOT=R;process.env.MEGULIT_ADAPTER_PACKS_DIR=path.join(R,'data','adapter-packs');
const S=require('../services/runtime-harvest-scan.cjs'),rh=require('../services/runtime-harvest.cjs'),packs=require('../services/adapter-packs.cjs'),d=require('../services/desensitize.cjs');
const K=fx.key();packs._trust([K.entry]);
const APP='1.4.9';fs.writeFileSync(path.join(R,'data','update-installed.json'),JSON.stringify({version:APP}));
fs.writeFileSync(path.join(R,'data','config','online.json'),JSON.stringify({relayUrl:'https://relay.test'}));

const G=rf.game(R),MEM=rf.memory(G),PAIRS=rf.dumpPairs(G.dir);
const ARCH=[{name:'data/scene.rhp',file:G.archive,size:G.archiveSize}];
function scanSynthetic(opts={}){const sc=S.createScanner({archives:ARCH,pairs:PAIRS,...opts});const p=S.streamParser({onHeader:h=>sc.header(h),onRegion:r=>sc.region(r)});const s=rf.stream(MEM);
 /* in uneven pieces, as a pipe delivers them */for(let at=0;at<s.length;at+=77777)p.push(s.subarray(at,at+77777));p.end();return sc.finish();}
const LOCAL=scanSynthetic();

/* ---- an independent text detector: the privacy test does not trust the code it tests -------------------------------- */
const sjis=fx.sjis;
const PLACE=new Set([...'あア亜Ａ０□가ｱĀ啊']);
function decodings(buf){const out=[];for(const enc of ['shift_jis','utf-8','utf-16le','gbk','euc-jp'])try{out.push(new TextDecoder(enc).decode(buf));}catch{}out.push(buf.subarray(1).toString('utf16le'));out.push(buf.toString('latin1'));return out;}
/* every 2-character piece of every line the stand-in game holds (Japanese) and every 3-word piece of its English */
const NEEDLES=[...new Set(rf.JP_LINES.flatMap(l=>{const c=[...l].filter(ch=>!PLACE.has(ch)&&!'、。！？「」…ー'.includes(ch));const out=[];for(let i=0;i+1<c.length;i++)out.push(c[i]+c[i+1]);return out;}))];
const EN_NEEDLES=rf.ENGLISH.flatMap(e=>{const w=e.split(/\s+/);const out=[];for(let i=0;i+2<w.length;i++)out.push(w.slice(i,i+3).join(' '));return out;});
/* every string in a JSON value, and every base64 / hex field decoded, in every encoding */
function surfaces(value){const out=[];const walk=(v,k)=>{if(v&&typeof v==='object'&&typeof v.gzip==='string'){for(const t of decodings(d.partBytes(v)))out.push(t);}if(typeof v==='string'){out.push(v);if(v.length>=8&&/^[A-Za-z0-9+/]+=*$/.test(v)&&v.length%4===0)for(const t of decodings(Buffer.from(v,'base64')))out.push(t);if(/^(?:[0-9a-f]{2}){4,}$/.test(v))for(const t of decodings(Buffer.from(v,'hex')))out.push(t);}
 else if(Array.isArray(v))v.forEach(x=>walk(x,k));else if(v&&typeof v==='object')for(const [kk,x] of Object.entries(v))walk(x,kk);};walk(value,'');return out;}
function leaks(value){const found=[];for(const s of surfaces(value)){for(const n of NEEDLES)if(s.includes(n))found.push(n);for(const n of EN_NEEDLES)if(s.includes(n))found.push(n);
 /* any kana run of 3+ that is not placeholders */const m=s.match(/[ぁ-ゖァ-ヺ]{3,}/g);if(m)for(const r of m)if([...r].some(ch=>!PLACE.has(ch)))found.push(r);}
 return [...new Set(found)];}

/* ---- detectors -------------------------------------------------------------------------------------------------------- */
test('constants: the cipher tables a module carries, with module + RVA and a code pattern that references them',()=>{
 const algos=new Set(LOCAL.constants.map(c=>c.algo));for(const a of ['blowfish','camellia','tea'])assert.ok(algos.has(a),a);
 const tea=LOCAL.constants.find(c=>c.algo==='tea');assert.deepEqual(tea.where,{module:0,rva:0x1301});
 const disp=LOCAL.dispatch[0];assert.equal(disp.count,64);assert.equal(disp.where.rva,0x12000);assert.equal(disp.targets[1]-disp.targets[0],0x40);
 assert.ok(disp.sig?.[0]&&/^[0-9a-f]{12}\?{8}[0-9a-f]{8}$/.test(disp.sig[0].pattern),'push imm32 of the table, address wildcarded');assert.equal(disp.sig[0].kind,'abs32');
});
test('keys: Blowfish schedule by self-consistency, its pass phrase, the heap slot that finds it again',()=>{
 const bf=LOCAL.keys.find(k=>k.algo==='blowfish');assert.ok(bf);assert.equal(bf.layout,'PS');assert.match(bf.verified,/self-consistent/);
 assert.equal(Buffer.from(bf.key,'hex').toString(),rf.PASS,'the key string in .rdata reproduces the schedule');
 assert.ok(bf.state.equals(G.state));assert.deepEqual({module:bf.locator.module,rva:bf.locator.rva,add:bf.locator.add},{module:0,rva:0x21020,add:16},'.data slot → context struct, state 16 bytes in');
 /* random data never passes the check */
 const sc=S.createScanner({});sc.header({bits:64,modules:[],regions:[{base:'0x100000',size:4<<20,protect:4,type:0x20000}]});sc.region({base:0x100000,bytes:crypto.randomBytes(4<<20),index:0});
 assert.equal(sc.finish().keys.filter(k=>k.algo==='blowfish').length,0);
});
test('keys: Camellia-128 key schedule by the rotation relations of KL; KA kept as an alternate',()=>{
 const c=LOCAL.keys.filter(k=>k.algo==='camellia');assert.equal(c.length,1);assert.equal(c[0].key,rf.CAMELLIA_KEY.toString('hex'));assert.equal(c[0].alternates.length,1);
});
test('keys: TEA by known plaintext (a dump buffer next to the archive bytes), XOR by known plaintext',()=>{
 const tea=LOCAL.keys.find(k=>k.algo==='tea');assert.equal(tea.key,rf.TEA_KEY.toString('hex'));assert.equal(tea.verified,'known-plaintext');assert.equal(tea.rounds,32);
 const xor=LOCAL.keys.find(k=>k.algo==='xor');assert.equal(xor.key,'4d6567754c6974');assert.equal(xor.period,7);
 assert.deepEqual(S.fromKnownPlaintext(Buffer.from([5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]),Buffer.alloc(16)).algo,'xor-index');
 const p=crypto.randomBytes(64);assert.deepEqual(S.fromKnownPlaintext(Buffer.from(p.map(x=>(x+9)&255)),p),{algo:'sub',value:9,confidence:1});
});
test('index: the decrypted table in memory — stride, fields, count field, names, entry kinds, locator by pattern',()=>{
 assert.equal(LOCAL.indexes.length,1);const ix=LOCAL.indexes[0];
 assert.equal(ix.count,G.records.length);assert.equal(ix.stride,32);assert.deepEqual(ix.fields.size,{word:1,type:'u32le'});assert.deepEqual(ix.fields.unpacked,{word:2,type:'u32le'});assert.equal(ix.countAt,-4);
 assert.deepEqual(ix.entries.map(e=>e[0]),G.records.map(r=>r.offset));assert.deepEqual(ix.names.list.map(String),G.records.map(r=>r.name));
 assert.equal(ix.kinds.filter(([k])=>k==='text').length,G.scenes,'scenes open as text with the Blowfish key');assert.equal(ix.kinds[G.scenes][0],'png');
 assert.deepEqual({module:ix.locator.module,rva:ix.locator.rva},{module:0,rva:0x21010});assert.match(ix.slotSig[0].pattern,/^[0-9a-f]{12}\?{8}[0-9a-f]{8}$/);
});
test('scripts: decoded bytecode — opcode before the length byte, u8 length prefix, NUL terminator',()=>{
 const s=LOCAL.scripts[0];assert.ok(s);assert.equal(s.encoding,'sjis');assert.equal(s.lengthPrefix,'u8');assert.equal(s.terminator,'nul');assert.equal(s.opcodes[0].byte,'10');
});
test('budget: the scanner stops on its time budget and says so',()=>{let t=0;const sc=S.createScanner({budgetMs:5,now:()=>t});sc.header(MEM.header);t=10;for(const r of MEM.regions)sc.region(r);const out=sc.finish();assert.equal(out.stats.stop,'budget');assert.ok(out.stats.skipped>0);});

/* ---- privacy ---------------------------------------------------------------------------------------------------------- */
test('privacy: the uploadable findings hold no natural language — independent detector over every field in every encoding',()=>{
 /* the stand-in memory really holds the lines (the detector finds them there) */
 assert.ok(leaks({raw:MEM.regions[3].bytes.toString('base64')}).length>0,'detector sees the lines in raw memory');
 const pub=rh.gate(rh.publicize(LOCAL));
 assert.deepEqual(leaks(pub),[],'nothing of any line survives');
 assert.ok(pub.keys.length>=4&&pub.indexes.length===1&&pub.scripts.length===1,'and the structure is still there');
 const sample=d.partBytes(pub.scripts[0].sample.parts[0]);assert.equal(d.textRuns(sample).length,0);assert.ok(pub.scripts[0].sample.parts[0].packed<sample.length/4,'placeholders compress: '+pub.scripts[0].sample.parts[0].packed+' of '+sample.length);
 /* the script sample still carries the layout: same length, opcodes and lengths in place */
 const at=sample.indexOf(Buffer.from('SCB1'));assert.ok(at>=0);assert.equal(sample[at+16],0x11);assert.equal(sample[at+17],sjis('めぐみん').length);
 /* names are masked, module names too */
 assert.ok(pub.modules.every(m=>!/[ぁ-ゖァ-ヺ]/.test(m.name.replace(/[あア]/g,''))));
});
test('privacy: the gate drops a finding that reads as language, whatever field it hides in',()=>{
 const pub=rh.publicize(LOCAL);const line=sjis(rf.JP_LINES[0]);
 const bad={...pub,keys:[...pub.keys,{algo:'tea',form:'key',key:line.subarray(0,16).toString('hex'),verified:'oracle'}],dispatch:[...pub.dispatch,{count:1,targets:Buffer.from(rf.JP_LINES[1],'utf16le').toString('base64')}]};
 const g=rh.gate(bad);assert.equal(g.dropped.gate,2);assert.deepEqual(leaks(g),[]);
 const leaky={...pub,scripts:[{encoding:'sjis',sample:{parts:[{at:0,len:line.length,base64:line.toString('base64')}]}}]};assert.equal(rh.gate(leaky).scripts.length,0,'a sample that was not desensitized never passes');
 assert.equal(rh.gate({...pub,indexes:[{...pub.indexes[0],archive:{name:'台詞.txt'}}]}).indexes.length,0);
});
test('privacy: naturalLanguage() flags real lines in every encoding and passes random key material',()=>{
 for(const l of rf.JP_LINES){assert.ok(rh.naturalLanguage(sjis(l)),l);assert.ok(rh.naturalLanguage(Buffer.from(l,'utf16le')),l);assert.ok(rh.naturalLanguage(Buffer.from(l,'utf8')),l);}
 for(const e of rf.ENGLISH)assert.ok(rh.naturalLanguage(Buffer.from(e)));
 let fp=0;for(let i=0;i<300;i++)if(rh.naturalLanguage(crypto.randomBytes(4168)))fp++;assert.ok(fp<=3,'random Blowfish-sized states: '+fp+' of 300 flagged');
 assert.equal(rh.naturalLanguage(d.desensitize(Buffer.concat(rf.JP_LINES.map(l=>Buffer.concat([sjis(l),Buffer.alloc(1)])))).bytes),false,'placeholders are not language');
});

/* ---- pack format ------------------------------------------------------------------------------------------------------ */
test('pack: block-cipher transforms and the index container decrypt what the game decrypts',()=>{
 const plain=Buffer.concat([sjis(rf.JP_LINES[2]),Buffer.alloc(3)]);const padded=rf.pad8(plain);
 assert.ok(packs.transform(rf.bfEncrypt(padded,G.state),[{op:'blowfish',key:Buffer.from(rf.PASS).toString('hex')}]).equals(padded));
 assert.ok(packs.transform(rf.bfEncrypt(padded,G.state),[{op:'blowfish',state:G.state.toString('base64')}]).equals(padded));
 assert.ok(packs.transform(rf.teaEncrypt(padded,rf.TEA_KEY),[{op:'tea',key:rf.TEA_KEY.toString('hex')}]).equals(padded));
 const c=crypto.createCipheriv('camellia-128-ecb',rf.CAMELLIA_KEY,null);c.setAutoPadding(false);const p16=Buffer.concat([padded,Buffer.alloc((16-padded.length%16)%16)]);
 assert.ok(packs.transform(Buffer.concat([c.update(p16),c.final()]),[{op:'camellia',key:rf.CAMELLIA_KEY.toString('hex')}]).equals(p16));
 const k=Buffer.from('a1b2c3','hex');const at=1001,x=Buffer.from(plain.map((v,i)=>v^k[(at+i)%3]));assert.ok(packs.transform(x,[{op:'xor',key:'a1b2c3',phase:'file'}],{offset:at}).equals(plain));
 assert.deepEqual(packs.needs({transforms:[{op:'xor',key:'aa',phase:'file'}]}),['transform:xor','transform:xor-file']);
 assert.equal(packs.validate({...fx.fixturePack(),transforms:[{op:'blowfish',key:'00',state:'x'}],requires:[...fx.fixturePack().requires,'transform:blowfish']}).ok,false);
});
test('pack compatibility: an app without the runtime capabilities skips such a pack instead of misreading it',()=>{
 const old=packs.CAPABILITIES.filter(c=>!['container:index','transform:blowfish','transform:xor-file'].includes(c));
 const draft=require('../services/runtime-pack-draft.cjs').draft(rh.gate(rh.publicize(LOCAL)),{id:'rhpk-runtime',grammar:fx.fixturePack().grammar});
 assert.equal(packs.compatible(draft.pack,{capabilities:old}).reason,'CAPABILITY');assert.equal(packs.compatible(draft.pack).ok,true);
 /* an xor key aligned to the file offset is a capability of its own: an old app never applies it as a plain xor */
 assert.equal(packs.compatible({requires:packs.needs({transforms:[{op:'xor',key:'aa',phase:'file'}]})},{capabilities:packs.CAPABILITIES.filter(c=>c!=='transform:xor-file')}).reason,'CAPABILITY');
});
test('draft: findings → a valid pack (index source, Blowfish key, scripts only, trimmed to the unpacked size)',()=>{
 const r=require('../services/runtime-pack-draft.cjs').draft(rh.gate(rh.publicize(LOCAL)),{id:'rhpk-runtime',grammar:fx.fixturePack().grammar});
 assert.ok(r.pack,JSON.stringify(r));assert.ok(!r.error,r.error);const p=r.pack;
 assert.equal(p.source.container,'index');assert.equal(p.source.index.trim,'unpacked');assert.equal(Buffer.from(p.source.index.select,'base64').length/4,G.scenes,'the PNG is left out');
 assert.deepEqual(p.transforms,[{op:'blowfish',key:Buffer.from(rf.PASS).toString('hex')}]);assert.equal(p['x-origin'],'runtime');
 assert.ok(packs.match(p,G.dir)>0);let lines=0;for(const s of packs.scenesOf(p,G.dir))lines+=packs.parse(p,s.read()).lines.length;assert.equal(lines,G.lines);
 const guess=require('../services/runtime-pack-draft.cjs').grammarOf(LOCAL.scripts);assert.deepEqual(guess,{mode:'strings',encoding:'shift_jis',opcode:'10',length:'u8'});
});

/* ---- the loop: store → bundle → relay → pack → feed → rebuild → verdict -------------------------------------------- */
const relayDir=path.join(__dirname,'..','relay'),MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATION);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});return {prepare:sql=>stmt(sql),raw:db};}
function r2(){const store=new Map();return {store,put:async(k,b)=>{store.set(k,new Uint8Array(b));},get:async k=>store.has(k)?{body:store.get(k)}:null,delete:async k=>{store.delete(k);}};}
const issues=[];const ENV={DB:d1(),BUCKET:r2(),LINK_SECRET:'link',HASH_SALT:'salt',ADAPTER_ADMIN_TOKEN:'admin-token',GITHUB_TOKEN:'gh',GITHUB_REPO:'o/r',fetch:async(url,init)=>{issues.push(JSON.parse(init.body));return new Response(JSON.stringify({html_url:'https://github.com/o/r/issues/7'}),{status:201});}};
let handle;const relay=async()=>handle??=(await import(pathToFileURL(path.join(relayDir,'src','worker.js')).href)).handle;
const fetcher=async(url,init={})=>{const h=await relay();return h(new Request(url,{method:init.method||'GET',headers:{'cf-connecting-ip':'198.51.100.7',...(init.headers||{})},body:init.body}),ENV,new Date());};
const admin=(route,body,method='POST')=>fetcher('https://relay.test'+route,{method,headers:{authorization:'Bearer admin-token','content-type':'application/json'},body:body?JSON.stringify(body):undefined});
const GAMES=[{id:'g-rhpk',title:'実行時ロックのゲーム',executable:G.exe}];const DB=fx.db(GAMES);

test('opt-in: off by default, per game off, explained; triggers do nothing while off',()=>{
 assert.equal(rh.settings(R).enabled,false);assert.equal(rh.needed(R,'g-rhpk',G.exe,{force:true}),process.platform==='win32'?'OFF':'PLATFORM');
 assert.equal(rh.onGameBound(R,{gameId:'g-rhpk',executable:G.exe,pid:process.pid}),null);
 rh.setEnabled(R,true);assert.equal(rh.settings(R).enabled,true);assert.equal(JSON.parse(fs.readFileSync(path.join(R,'data','config','library.json'),'utf8')).runtimeHarvest,true,'the Settings switch');
 rh.setGame(R,'g-rhpk',false);assert.equal(rh.allowed(R,'g-rhpk'),false);rh.setGame(R,'g-rhpk',true);assert.equal(rh.allowed(R,'g-rhpk'),true);
 for(const loc of ['zh','en']){const t=rh.explain(loc);assert.ok(t.reads.length&&t.uploads.length&&t.never.length&&t.consent);}
 assert.match(rh.explain('zh').reads[0],/只读/);
});
test('loop: findings join the probe bundle, every item listed, relay accepts it, issue shows a runtime line',async()=>{
 const probe=require('../services/adapter-probe.cjs'),sample=require('../services/adapter-sample.cjs');
 probe.start(R,DB,{reason:'test',perGameMs:60000});for(let i=0;i<400&&probe.status(R).state==='running';i++)await new Promise(r=>setTimeout(r,100));
 assert.equal(probe.results(R)['g-rhpk'].step,'unknown-pack','the offline probe cannot open it');
 rh.save(R,'g-rhpk',G.exe,rh.publicize(LOCAL));assert.ok(rh.load(R,'g-rhpk').indexes.length);
 const prep=await sample.prepare(R,DB,{sampler:probe.sampleInWorker});assert.ok(prep.hash,JSON.stringify(prep));
 const body=fs.readFileSync(path.join(R,'data','adapter-probe','outbox',prep.hash+'.json'),'utf8'),bundle=JSON.parse(body);
 assert.deepEqual(bundle.features,['runtime-1']);assert.equal(bundle.games[0].runtime.schema,'megulit.runtime-findings');
 assert.deepEqual(leaks({...bundle,games:bundle.games.map(({title,...g})=>g)}),[],'no line anywhere in the bundle');
 const kinds=prep.manifest[0].items.map(i=>i.kind);for(const k of ['runtime-key','runtime-index','runtime-dispatch','runtime-script','runtime-constants'])assert.ok(kinds.includes(k),k);
 assert.ok(prep.manifest[0].items.filter(i=>i.kind.startsWith('runtime')).every(i=>i.name&&i.bytes>0),'each runtime item has a name and a size the dialog shows');
 const u=await sample.upload(R,{hash:prep.hash,fetcher});assert.equal(u.state,'uploaded',JSON.stringify(u));
 assert.match(issues.at(-1).body,/runtime \(v1\): keys blowfish/);assert.deepEqual(leaks({b:issues.at(-1).body.replace(/^### .*$/gm,'')}),[],'only the title the user chose to share');
 test.bundle=bundle;
});
test('loop: the pack built from those findings comes back, the game is read offline, the verdict is reported',async()=>{
 const feed=require('../services/adapter-feed.cjs'),g=test.bundle.games[0];
 const r=require('../services/runtime-pack-draft.cjs').draft(g.runtime,{id:'rhpk-runtime',grammar:fx.fixturePack().grammar});assert.ok(!r.error,r.error);
 const signed=packs.sign({...r.pack,createdAt:'2026-11-14T00:00:00Z'},K.privateKey,'test');assert.equal((await admin('/api/adapters/publish',{pack:signed})).status,201);
 const s=await feed.sync(R,{fetch:fetcher,db:DB});assert.equal(s.state,'ok',JSON.stringify(s));assert.deepEqual(s.installed,[{id:'rhpk-runtime',version:1}]);
 const st=feed.status(R).games['g-rhpk'];assert.equal(st.state,'kept');assert.equal(st.after.lines,G.lines);assert.equal(st.origin,'runtime');assert.equal(st.verdict,'read','all Japanese lines read; nothing to pair');
 assert.equal(rh.load(R,'g-rhpk').outcome.verdict,'read','the findings learn how it ended');
 const rep=await (await admin('/api/adapters/reports?pack=rhpk-runtime',null,'GET')).json();assert.equal(rep.reports[0].after.verdict,'read');assert.equal(rep.reports[0].after.origin,'runtime');
 assert.equal(feed.verdict({lines:100,japanese:100,total:100,paired:99}),'solved');assert.equal(feed.verdict({lines:100,japanese:100,total:100,paired:90}),'partial');assert.equal(feed.verdict({lines:0}),'failed');
});
test('service actions: status / explain / switches / findings go through adapter-actions',async()=>{
 const a=require('../services/adapter-actions.cjs');
 assert.equal((await a.handle(DB,R,{action:'adapter_runtime_status'})).enabled,true);
 assert.ok((await a.handle(DB,R,{action:'adapter_runtime_explain',locale:'en'})).uploads.length);
 assert.equal((await a.handle(DB,R,{action:'adapter_runtime_findings',gameId:'g-rhpk'})).schema,'megulit.runtime-findings');
 assert.equal((await a.handle(DB,R,{action:'adapter_runtime_game',gameId:'g-rhpk',enabled:false})).off['g-rhpk'],true);
 await a.handle(DB,R,{action:'adapter_runtime_game',gameId:'g-rhpk',enabled:true});
 assert.equal((await a.handle(DB,R,{action:'adapter_runtime_enable',enabled:false})).enabled,false);
});

/* ---- native reader --------------------------------------------------------------------------------------------------- */
const NATIVE=path.join(__dirname,'..','native','RuntimeHarvest.exe');
test('native reader: read-only by construction (no write, allocate, thread or suspend right; nothing injected)',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','native','RuntimeHarvest.cs'),'utf8');
 assert.match(src,/READ_ONLY_RIGHTS=0x0400\|0x0010\|0x00100000/);assert.equal((src.match(/OpenProcess\(/g)||[]).length,2,'declared once, called once');
 for(const bad of ['WriteProcessMemory','VirtualAllocEx','CreateRemoteThread','SuspendThread','NtSuspendProcess','VirtualProtectEx','DebugActiveProcess'])assert.ok(!src.includes(bad),bad);
 const build=fs.readFileSync(path.join(__dirname,'..','Build.ps1'),'utf8'),rel=fs.readFileSync(path.join(__dirname,'..','Release.ps1'),'utf8');
 assert.match(build,/'RuntimeHarvest\.exe','\/platform:x64','RuntimeHarvest\.cs'/);assert.match(rel,/'native\/RuntimeHarvest\.exe'/);
});
test('native reader: a live stand-in process — keys, index and script layout found; nothing of its text in the result',{skip:process.platform!=='win32'||!fs.existsSync(NATIVE)?'needs Windows and native/RuntimeHarvest.exe':false,timeout:120000},async()=>{
 const file=path.join(R,'heap.bin');fs.writeFileSync(file,rf.heapBlob(G).blob);
 const child=fork(path.join(__dirname,'helpers','runtime-target.cjs'),[file],{stdio:['ignore','ignore','ignore','ipc']});
 try{await new Promise((res,rej)=>{child.once('message',res);child.once('exit',()=>rej(Error('target exited')));});
  const local=await rh.scan({pid:child.pid,archives:ARCH,budgetMs:90000});
  assert.equal(local.bits,64);assert.ok(local.stats.native.read>0);
  assert.ok(local.keys.some(k=>k.algo==='blowfish'&&k.state.equals(G.state)),'the schedule held by the live process');
  assert.ok(local.indexes.some(i=>i.count===G.records.length&&i.stride===32),'the index held by the live process: '+JSON.stringify({stats:local.stats,ix:local.indexes.map(i=>[i.count,i.stride,i.archive.name])}));
  assert.ok(local.scripts.length>=1);
  const pub=rh.gate(rh.publicize(local));assert.deepEqual(leaks(pub),[]);
  /* cancel: a second read stops at once */
  const ac=new AbortController();const t=Date.now();const p=rh.scan({pid:child.pid,archives:ARCH,budgetMs:90000,signal:ac.signal});setTimeout(()=>ac.abort(),300);const c=await p;
  assert.equal(c.stats.error,'CANCELLED');assert.ok(Date.now()-t<30000);
  /* the stand-in kept running the whole time: the reader never stopped or changed it */
  assert.equal(child.exitCode,null);
 }finally{child.kill();}
});
test('native reader: a process that is gone or a missing reader fails quietly',async()=>{
 const r=await rh.scan({pid:0});assert.equal(r.stats.error,'NO_PID');
 const m=await rh.scan({pid:process.pid,exe:path.join(R,'nope.exe')});assert.equal(m.stats.error,'NO_READER');
 if(process.platform==='win32'&&fs.existsSync(NATIVE)){const x=await rh.scan({pid:999999,archives:[],budgetMs:5000});assert.deepEqual(x.keys,[]);}
});
test('stream: a big region reaches the scanner in overlapping windows, every byte seen, chunked pipe input',()=>{
 const big=crypto.randomBytes(3<<20),mem={header:{v:1,bits:64,modules:[],regions:[{base:'0x10000000',size:big.length,protect:4,type:0x20000}]},regions:[{base:0x10000000,bytes:big,index:0}]};
 const got=[];const p=S.streamParser({onHeader:()=>{},onRegion:r=>got.push(r),window:1<<20,overlap:64<<10});const s=rf.stream(mem);for(let at=0;at<s.length;at+=65536)p.push(s.subarray(at,at+65536));p.end();
 assert.ok(got.length>=3);assert.equal(got[0].base,0x10000000);for(let i=1;i<got.length;i++)assert.equal(got[i].base,got[i-1].base+got[i-1].bytes.length-(64<<10),'windows overlap');
 for(const r of got)assert.ok(r.bytes.equals(big.subarray(r.base-0x10000000,r.base-0x10000000+r.bytes.length)));
 const last=got.at(-1);assert.equal(last.base+last.bytes.length,0x10000000+big.length);
});
