// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const sourceRoot=process.env.MEGULIT_PEER_SOURCE_ROOT||path.resolve(__dirname,'..');
const fixtureRoot=path.resolve(__dirname,'peer-fixture-root'),executable=path.join(fixtureRoot,'game.exe');
if(typeof vm.SourceTextModule!=='function'){
 test('shared receiver wiring executes all fourteen cases in an owned bounded VM child',()=>{
  assert.notEqual(process.env.MEGULIT_TORCH_PEER_VM_CHILD,'1','VM_CHILD_UNAVAILABLE');
  const env={...process.env,MEGULIT_PEER_SOURCE_ROOT:sourceRoot,MEGULIT_TORCH_PEER_VM_CHILD:'1'};delete env.NODE_TEST_CONTEXT;
  const child=require('node:child_process').spawnSync(process.execPath,['--max-old-space-size=128','--experimental-vm-modules','--test-timeout=4000','--test-reporter=tap','--test',__filename],{env,windowsHide:true,timeout:5000,maxBuffer:1024*1024,encoding:'utf8'});
  assert.ifError(child.error);assert.equal(child.signal,null);assert.equal(child.status,0,child.stdout+'\n'+child.stderr);
  for(const line of ['tests 14','pass 14','fail 0','cancelled 0','skipped 0','todo 0'])assert.match(child.stdout,new RegExp('^# '+line+'\\r?$','m'));
  assert.match(child.stdout,/PEER_SOURCE_SHA256/);console.log(child.stdout);
 });
}else{
const sources=new Map();
function source(file){if(!sources.has(file))sources.set(file,fs.readFileSync(path.join(sourceRoot,file),'utf8'));return sources.get(file);}
function cjs(file,deps){const module={exports:{}};const req=id=>{if(Object.hasOwn(deps,id))return deps[id];if(id.startsWith('node:'))return require(id);throw Error('UNEXPECTED_DEPENDENCY:'+id);};req.main=null;vm.runInNewContext('(function(require,module,exports,__dirname,__filename,process){'+source(file)+'\n})',{console,Buffer,setTimeout,clearTimeout,setImmediate},{filename:file})(req,module,module.exports,path.dirname(path.join(sourceRoot,file)),path.join(sourceRoot,file),{env:{MEGULIT_ROOT:fixtureRoot}});return module.exports;}
function bridge({fail='',match=false}={}){
 const events=[],queued=[],existing={id:'g1',original:'{"library":{}}'};
 const db={close(){events.push('close');},prepare(sql){return {get(){events.push('get');return sql.includes('SELECT original')?{original:'{}'}:existing;},run(){events.push('write');if(fail==='write')throw Error('DB_WRITE_FAILED');return {changes:1};}};}};
 const receiver={enqueue(...args){events.push('enqueue');queued.push(args);}};
 const dispatch=cjs('services/bridge.cjs',{
  'node:fs':{existsSync:()=>true,statSync:()=>({isFile:()=>true})},
  './store.cjs':{openStore(){if(fail==='open')throw Error('DB_OPEN_FAILED');return db;}},
  './relay-gate.cjs':{install(){}},'./torch-receive.cjs':receiver,
  './first-player.cjs':{async state(){events.push('state');if(fail==='state')throw Error('DB_READ_FAILED');return {state:'hidden'};}},
  './library.cjs':{signature:()=>({size:1}),matchGame:()=>match?existing:null},
  '../core/library-title.cjs':require(path.join(sourceRoot,'core/library-title.cjs')),
  './series.cjs':{autoGroup(){events.push('series');}},
  './game-language.cjs':{originalExecutable(){events.push('mutation');if(fail==='mutation')throw Error('DB_MUTATION_FAILED');return {saved:true};}}
 }).dispatch;
 return {dispatch,events,queued};
}
for(const id of ['g1',undefined])for(const match of id?[false]:[false,true]){
 test('actual save_game '+(id?'explicit-id':match?'matched':'insert')+' queues user after DB success',async()=>{
  const h=bridge({match});await h.dispatch({action:'save_game',id,title:'Fixture',executable});
  assert.equal(h.queued.length,1);assert(h.events.indexOf('write')<h.events.indexOf('enqueue'));assert.equal(h.events.at(-1),'close');assert.equal(h.queued[0][2].priority,'user');assert.equal(h.queued[0][2].force,true);
 });
 test('actual save_game '+(id?'explicit-id':match?'matched':'insert')+' failed write cannot queue',async()=>{
  const h=bridge({match,fail:'write'});await assert.rejects(h.dispatch({action:'save_game',id,title:'Fixture',executable}),/DB_WRITE_FAILED/);assert.equal(h.queued.length,0);assert.equal(h.events.at(-1),'close');
 });
}
test('actual first_player DB-open failure cannot queue; state-read error occurs after user queue',async()=>{
 let h=bridge({fail:'open'});await assert.rejects(h.dispatch({action:'first_player',id:'g1'}),/DB_OPEN_FAILED/);assert.equal(h.queued.length,0);
 h=bridge({fail:'state'});await assert.rejects(h.dispatch({action:'first_player',id:'g1',poll:true}),/DB_READ_FAILED/);assert.equal(h.queued.length,1);assert.equal(h.queued[0][2].priority,'user');assert.deepEqual(h.events,['enqueue','state','close']);
});
test('actual originalExecutable read stays local; successful selection queues force/user after mutation',async()=>{
 const select={action:'game_original_executable',id:'g1',mode:'select',executable};
 let h=bridge({fail:'mutation'});await assert.rejects(h.dispatch(select),/DB_MUTATION_FAILED/);assert.equal(h.queued.length,0);
 h=bridge();await h.dispatch({action:'game_original_executable',id:'g1'});assert.equal(h.queued.length,0);
 await h.dispatch(select);assert.equal(h.queued.length,1);assert(h.events.lastIndexOf('mutation')<h.events.indexOf('enqueue'));assert.equal(h.queued[0][2].force,true);assert.equal(h.queued[0][2].priority,'user');
});
function runtime(fail=''){
 const events=[],queued=[];let release,releaseStory;
 const receiver={resume(root){events.push('resume');},enqueue(...args){events.push('enqueue');queued.push(args);},stop(){events.push('receiver-stop');return new Promise(resolve=>{release=()=>{events.push('receiver-ended');resolve();};});}};
 const store={readJSON:()=>({}),openStore(){
  events.push('open');
  return {close(){events.push('close');},prepare(){return {all(){events.push('query');if(fail==='query')throw Error('DB_READ_FAILED');return [{id:'g1',executable}];}};}};
 }};
 const deps={'./story-analysis.cjs':{stop(){events.push('story-stop');return new Promise(resolve=>{releaseStory=()=>{events.push('story-ended');resolve();};});}},'./torch-receive.cjs':receiver,'./store.cjs':store,'./library-scan.cjs':require(path.join(sourceRoot,'services/library-scan.cjs')),'./library.cjs':{reconcile(){events.push('reconcile');if(fail==='reconcile')throw Error('DB_RECONCILE_FAILED');return {};}}};
 const {Runtime}=cjs('services/runtime.cjs',deps),r=new Runtime(fixtureRoot);
 r.config=()=>({});r.libraryOnly=()=>false;r.library=()=>({scan:async()=>events.push('scan'),load:()=>({games:[]}),read:()=>({folders:[]})});r.metadata=()=>({enqueue(){events.push('metadata');}});
 return {r,events,queued,release:()=>release(),releaseStory:()=>releaseStory()};
}
test('actual library_scan reconciles/reads DB before bulk-default receiver queue',async()=>{
 const h=runtime();await h.r.call({action:'library_scan'});assert.equal(h.queued.length,1);assert.equal(h.queued[0].length,2);assert(h.events.indexOf('reconcile')<h.events.indexOf('enqueue'));assert(h.events.indexOf('query')<h.events.indexOf('enqueue'));assert.equal(h.events.at(-1),'close');assert.equal(h.events[0],'resume');
});
test('actual library_scan reconcile/read failures cannot enqueue',async()=>{
 for(const fail of ['reconcile','query']){const h=runtime(fail);await assert.rejects(h.r.call({action:'library_scan'}),/DB_(?:RECONCILE|READ)_FAILED/);assert.equal(h.queued.length,0);}
});
test('actual Runtime.stop awaits receiver, keeps first failure and still completes every cleanup stage',async()=>{
 const h=runtime(),r=h.r,error=Error('READER_STOP_INCOMPLETE');r.stopReading=async()=>{h.events.push('reader');throw error;};r.ankiRunner={stop:async()=>{h.events.push('anki');throw Error('ANKI_FAILED');}};r.gameEnrichment={stop:async()=>h.events.push('enrichment')};r.gameReviews={stop:async()=>h.events.push('reviews')};r.localLearning={stop:async()=>h.events.push('learning')};r.modelStore={jobs:{owned:{}},cancel:async()=>h.events.push('model')};r.localEngine={cancel:async()=>h.events.push('engine-cancel'),stop:async()=>h.events.push('engine-stop')};r.serviceManager={stop:async()=>h.events.push('services')};
 let done=false;const p=r.stop().then(()=>{done=true;},e=>{done=true;assert.equal(e,error);});await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false);assert.equal(r.stopped,true);assert(!h.events.includes('services'));await assert.rejects(r.call({action:'library_scan'}),/RUNTIME_STOPPED/);h.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false);assert(!h.events.includes('services'));h.releaseStory();await p;for(const e of ['receiver-ended','story-stop','story-ended','reader','anki','enrichment','reviews','learning','model','engine-cancel','engine-stop','services'])assert(h.events.includes(e));assert(h.events.indexOf('receiver-ended')<h.events.indexOf('services'));assert(h.events.indexOf('story-ended')<h.events.indexOf('services'));
});
test('actual receiver-stop rejection still awaits delayed reader and runs later cleanup before returning its error',async()=>{
 const events=[],error=Error('TORCH_STOP_FAILED');let releaseReader;
 // Replace only the external receiver dependency by loading the same full Runtime source again
 const {Runtime}=cjs('services/runtime.cjs',{'./story-analysis.cjs':{stop:async()=>events.push('story-after-failure')},'./store.cjs':{readJSON:()=>({})},'./torch-receive.cjs':{resume(){},stop:async()=>{throw error;}}});
 const subject=new Runtime(fixtureRoot);subject.stopReading=()=>new Promise(resolve=>{releaseReader=resolve;});subject.localLearning={stop:async()=>events.push('learning-after-failure')};subject.serviceManager={stop:async()=>{events.push('service-after-failure');throw Error('SERVICE_STOP_FAILED');}};
 let returned=false;const result=subject.stop().then(()=>{throw Error('UNEXPECTED_SUCCESS');},e=>{returned=true;assert.equal(e,error);});await new Promise(resolve=>setImmediate(resolve));assert.equal(returned,false);assert(!events.includes('learning-after-failure'));releaseReader();await result;assert(events.includes('learning-after-failure'));assert(events.includes('service-after-failure'));
});
test('actual relay Worker routes torch-release paths to handler with real request/env; adjacent prefix is not routed',async()=>{
 assert.equal(typeof vm.SourceTextModule,'function','run with --experimental-vm-modules');const calls=[],context=vm.createContext({Request,Response,Headers,URL,TextEncoder,crypto:crypto.webcrypto,console,Buffer,setTimeout,clearTimeout,fetch:()=>{throw Error('NETWORK_FORBIDDEN');}}),text=source('relay/src/worker.js'),modules=new Map();
 const worker=new vm.SourceTextModule(text,{context,identifier:'actual-worker'});
 await worker.link(async spec=>{
  if(modules.has(spec))return modules.get(spec);
  if(spec==='./update-policy.js'){
   const policy=await import('../relay/src/update-policy.js');
   return new vm.SyntheticModule(['updateGuard','updatePolicy'],function(){
    this.setExport('updateGuard',policy.updateGuard);this.setExport('updatePolicy',policy.updatePolicy);
   },{context});
  }
  const declarations=Array.from(text.matchAll(/(?:import|export)\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g));
  const names=[...new Set(declarations.filter(m=>m[2]===spec).flatMap(m=>m[1].split(',').map(name=>name.trim())))];
  assert(names.length);const values=Object.fromEntries(names.map(n=>[n,()=>{throw Error('UNEXPECTED_ROUTE_DEPENDENCY:'+n);} ]));values.isAccountsPath=()=>false;values.ROTATED=new WeakMap();values.torchReleaseRoute=async(...args)=>{calls.push(args);return new Response('fixture',{status:209});};const mod=new vm.SyntheticModule(names,function(){for(const name of names)this.setExport(name,values[name]);},{context});modules.set(spec,mod);return mod;});await worker.evaluate();
 const env={RL_IP:{limit:async()=>({success:true})}};
 for(const route of ['/api/torch-release','/api/torch-release/current']){const req=new Request('https://fixture.invalid'+route);const res=await worker.namespace.default.fetch(req,env,{});assert.equal(res.status,209);const args=calls.at(-1);assert.equal(args[0],req);assert.equal(args[1],env);assert.equal(args[4],route);assert.equal(typeof args[5].json,'function');}
 const res=await worker.namespace.default.fetch(new Request('https://fixture.invalid/api/torch-releasex'),env,{});assert.equal(res.status,404);assert.equal(calls.length,2);
});
test('source identity receipt contains exact full-source SHA256',()=>{
 const hashes=Object.fromEntries([...sources].map(([file,text])=>[file,crypto.createHash('sha256').update(text).digest('hex')]));console.log('PEER_SOURCE_SHA256 '+JSON.stringify(hashes));assert.equal(Object.keys(hashes).length,3);
});
}
