'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto'),{EventEmitter}=require('node:events');
const {Services}=require('../core/services.cjs'),{prepareDefaultVoices}=require('../core/voice-pack.cjs');

const ids=['a59cb814-0083-4369-8542-f51a29e72af7','22e8ed77-94fe-4ef2-871f-a86f94e9a579'];
const files=ids.map(id=>id+'.aivmx').sort(),data=Buffer.from('synthetic voice model bytes');
const checksum=createHash('sha256').update(data).digest('hex');
const meta=()=>Response.json({model_files:[{model_type:'AIVMX',license_type:'ACML 1.0',file_size:data.length,checksum}]});
const model=(bytes=data)=>new Response(bytes,{status:206,headers:{'Content-Range':`bytes 0-${data.length-1}/${data.length}`}});

function rig(t,answer=()=>{},ready=false){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-speech-first-'));
 const appData=process.env.APPDATA;
 process.env.APPDATA=root;
 const dir=path.join(root,'AivisSpeech-Engine','Models'),exe=path.join(root,'aivis-engine.exe');
 const calls=[],starts=[];
 fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(path.join(root,'logs'));fs.writeFileSync(exe,'');
 const services=new Services(root,{exe,prepare:async()=>{},killTree:async()=>{},portOpen:async()=>false,
  fetch:async(url,opts)=>{
   if(url.endsWith('/version'))return {ok:ready||starts.length>0};
   const [,id,download]=/^https:\/\/api\.aivis-project\.com\/v1\/aivm-models\/([a-f\d-]+)(\/download\?model_type=AIVMX)?$/.exec(url)||[];
   assert.ok(ids.includes(id),'unexpected model request: '+url);
   calls.push(id);
   return answer({id,download,opts})??(download?model():meta());
  },
  spawn:()=>{starts.push(fs.readdirSync(dir).filter(name=>/\.aivmx$/i.test(name)).sort());return new EventEmitter();},
 });
 t.after(async()=>{
  await services.stop();
  if(appData===undefined)delete process.env.APPDATA;else process.env.APPDATA=appData;
  fs.rmSync(root,{recursive:true,force:true});
 });
 return {dir,calls,starts,services,log:()=>fs.readFileSync(path.join(root,'logs','speech-engine.log'),'utf8')};
}

test('the local engine sees both verified defaults at its first spawn',async t=>{
 const {dir,calls,starts,services}=rig(t);
 fs.rmdirSync(dir);
 await services.ensureSpeech(undefined,false);
 assert.deepEqual(starts,[files]);
 assert.deepEqual([...new Set(calls)],ids);
 for(const file of files)assert.deepEqual(fs.readFileSync(path.join(dir,file)),data);
});

test('one bad checksum leaves neither default and starts the engine fallback',async t=>{
 const {dir,starts,services,log}=rig(t,({id,download})=>{
  if(id===ids[1]&&download)return model(Buffer.alloc(data.length));
 });
 await services.ensureSpeech(undefined,false);
 assert.deepEqual(starts,[[]]);
 assert.deepEqual(fs.readdirSync(dir),[]);
 assert.match(log(),/default voice preparation failed.*校验失败/);
});

test('an installed user model skips preparation',async t=>{
 const {dir,calls,starts,services}=rig(t);
 fs.writeFileSync(path.join(dir,'user.AIVMX'),'my voice');
 await services.ensureSpeech(undefined,false);
 assert.deepEqual(starts,[['user.AIVMX']]);
 assert.deepEqual(calls,[]);
 assert.equal(fs.readFileSync(path.join(dir,'user.AIVMX'),'utf8'),'my voice');
});

test('a manually chosen default does not trigger installation of the other voice',async t=>{
 const {dir,calls,starts,services}=rig(t),file=ids[0]+'.aivmx';
 fs.writeFileSync(path.join(dir,file),'manual model');
 await services.ensureSpeech(undefined,false);
 assert.deepEqual(starts,[[file]]);
 assert.deepEqual(calls,[]);
 assert.equal(fs.readFileSync(path.join(dir,file),'utf8'),'manual model');
});

test('an already running remote engine leaves the local models alone',async t=>{
 const {calls,starts,services}=rig(t,undefined,true);
 await services.ensureSpeech('http://voice.example.test:10101');
 assert.deepEqual(starts,[]);
 assert.deepEqual(calls,[]);
});

test('the default-model time budget leaves the original engine fallback available',async t=>{
 const deadline=new AbortController(),timeout=AbortSignal.timeout;
 t.mock.method(AbortSignal,'timeout',milliseconds=>milliseconds===45000?deadline.signal:timeout(milliseconds));
 const waiting=Promise.withResolvers();
 const {dir,starts,services,log}=rig(t,({download,opts})=>{
  if(!download)return;
  waiting.resolve();
  return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(opts.signal.reason),{once:true}));
 });
 const job=services.ensureSpeech(undefined,false);
 await Promise.race([waiting.promise,job]);
 deadline.abort(Error('voice preparation timed out'));
 await job;
 assert.deepEqual(starts,[[]]);
 assert.deepEqual(fs.readdirSync(dir),[]);
 assert.match(log(),/default voice preparation failed/);
});

test('an expired preparation budget leaves an absent model folder untouched',async t=>{
 const {dir}=rig(t);
 fs.rmdirSync(dir);
 const signal=AbortSignal.abort(new Error('voice preparation timed out'));
 await assert.rejects(prepareDefaultVoices({dir,signal,fetch:()=>assert.fail('unexpected download')}),/voice preparation timed out/);
 assert.equal(fs.existsSync(dir),false);
});

test('a budget that expires after validation stops publication and starts the fallback',async t=>{
 const deadline=new AbortController(),timeout=AbortSignal.timeout,rename=fs.renameSync;
 t.mock.method(AbortSignal,'timeout',milliseconds=>milliseconds===45000?deadline.signal:timeout(milliseconds));
 const {dir,starts,services,log}=rig(t);
 t.mock.method(fs,'renameSync',(source,target)=>{
  rename(source,target);
  if(path.basename(target)===ids[1]+'.aivmx'&&path.basename(path.dirname(target)).startsWith('.megulit-first-voices-')){
   deadline.abort(new Error('voice preparation timed out'));
  }
 });
 await services.ensureSpeech(undefined,false);
 assert.deepEqual(starts,[[]]);
 assert.deepEqual(fs.readdirSync(dir),[]);
 assert.match(log(),/voice preparation timed out/);
});

test('a user model installed during download skips publication of the defaults',async t=>{
 const {dir,starts,services}=rig(t,({id,download})=>{
  if(id===ids[1]&&download)fs.writeFileSync(path.join(dir,'user.aivmx'),'my voice');
 });
 await services.ensureSpeech(undefined,false);
 assert.deepEqual(starts,[['user.aivmx']]);
 assert.equal(fs.readFileSync(path.join(dir,'user.aivmx'),'utf8'),'my voice');
});

test('a model installed at publication keeps its original bytes',async t=>{
 const {dir,starts,services}=rig(t);
 const link=fs.linkSync;
 t.mock.method(fs,'linkSync',(source,target)=>{
  if(path.basename(target)===files[0])fs.writeFileSync(target,'concurrent install',{flag:'wx'});
  return link(source,target);
 });
 await services.ensureSpeech(undefined,false);
 assert.deepEqual(starts,[files]);
 assert.equal(fs.readFileSync(path.join(dir,files[0]),'utf8'),'concurrent install');
 assert.deepEqual(fs.readFileSync(path.join(dir,files[1])),data);
});

test('failed publication retries only the missing default and preserves the installed model',async t=>{
 const {dir,calls,starts,services,log}=rig(t),link=fs.linkSync;
 let fail=true;
 const installed=ids[0]+'.aivmx';
 t.mock.method(fs,'linkSync',(source,target)=>{
  if(fail&&target===path.join(dir,ids[1]+'.aivmx'))throw Object.assign(Error('could not publish defaults'),{code:'EACCES'});
  return link(source,target);
 });
 await services.ensureSpeech(undefined,false);
 assert.deepEqual(starts,[[installed]]);
 assert.deepEqual(fs.readdirSync(dir).sort(),['.megulit-default-voices-pending',installed]);
 assert.match(log(),/could not publish defaults/);
 const manual=path.join(dir,'manual.tmp');
 fs.writeFileSync(manual,'manually replaced default');
 fs.renameSync(manual,path.join(dir,installed));
 await services.stopSpeech();
 starts.length=0;
 calls.length=0;
 fail=false;
 await services.ensureSpeech(undefined,false);
 assert.deepEqual(starts,[files]);
 assert.deepEqual([...new Set(calls)],[ids[1]]);
 assert.deepEqual(fs.readdirSync(dir),files);
 assert.equal(fs.readFileSync(path.join(dir,installed),'utf8'),'manually replaced default');
});

test('closing during a download waits for staging cleanup and never spawns the engine',async t=>{
 const opaque=Promise.withResolvers();
 const {dir,starts,services}=rig(t,({id,download,opts})=>{
  if(id!==ids[1]||!download)return;
  opaque.resolve();
  return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(opts.signal.reason),{once:true}));
 });
 const job=services.ensureSpeech(undefined,false);
 const stopped=assert.rejects(job,/语音启动已取消/);
 await Promise.race([opaque.promise,job]);
 const staging=fs.readdirSync(dir).find(name=>name.startsWith('.megulit-first-voices-'));
 assert.ok(staging);
 assert.deepEqual(fs.readdirSync(path.join(dir,staging)),[ids[0]+'.aivmx']);
 await services.stop();
 assert.deepEqual(starts,[]);
 assert.deepEqual(fs.readdirSync(dir),[]);
 await stopped;
});

test('closing while BERT prepares does not wait for its uncancellable work',async t=>{
 const {dir,starts,services}=rig(t),entered=Promise.withResolvers(),bert=Promise.withResolvers();
 services.prepare=()=>{entered.resolve();return bert.promise;};
 const job=services.ensureSpeech(undefined,false),stopped=assert.rejects(job,/语音启动已取消/);
 await entered.promise;
 await services.stop();
 assert.deepEqual(starts,[]);
 assert.deepEqual(fs.readdirSync(dir),[]);
 bert.resolve();
 await stopped;
});
