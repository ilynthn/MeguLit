'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const wait=async(m,phase)=>{for(let i=0;i<100;i++){if(m.status().phase===phase)return;await new Promise(r=>setTimeout(r,20));}};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'anki 安装-'));
 const appdata=process.env.APPDATA;process.env.APPDATA=root;
 t.after(()=>{if(appdata===undefined)delete process.env.APPDATA;else process.env.APPDATA=appdata;fs.rmSync(root,{recursive:true,force:true});});
 fs.mkdirSync(path.join(root,'logs'));
 fs.mkdirSync(path.join(root,'Anki2','addons21','2055492159'),{recursive:true});
 fs.writeFileSync(path.join(root,'Anki2','addons21','2055492159','__init__.py'),'# AnkiConnect');
 delete require.cache[require.resolve('../core/anki-installer.cjs')];
 return {root,m:require('../core/anki-installer.cjs')};
}
test('one-click Anki: an existing Anki skips the download; a download that fails the checksum is never installed',async t=>{
 const {root,m}=fixture(t);
 assert.equal(m.PACKAGE.size,201621504);assert.match(m.SOURCES[0],/^https:\/\/dl\.megulit\.com\/files\/anki\//);assert.match(m.SOURCES[1],/^https:\/\/cn-dl\.megulit\.com\/files\/anki\//);assert.match(m.SOURCES[2],/^https:\/\/github\.com\/ankitects\/anki\/releases\/download\//);
 let fetched=0;m.start(root,{find:()=>'C:\Anki\anki.exe',fetcher:async()=>{fetched++;throw Error('no');}});await wait(m,'done');
 assert.equal(m.status().phase,'done');assert.equal(fetched,0,'installed already: nothing downloaded');
 const bad=()=>new Response(new Uint8Array(1024));m.start(root,{find:()=>'',fetcher:async()=>bad()});await wait(m,'error');
 assert.equal(m.status().phase,'error');assert.match(m.status().error,/ANKI_DOWNLOAD_FAILED/);
 assert.equal(fs.existsSync(path.join(root,'data','cache','anki-installer',m.PACKAGE.name)),false,'a wrong file is never kept');
});
test('one-click Anki reports a connection failure and lets the installed app connect on retry',async t=>{
 const {root,m}=fixture(t);
 const {Anki}=require('../core/anki.cjs');
 const actions=[];
 let ready=false,downloads=0;
 const anki=new Anki(async(_url,{body})=>{
  actions.push(JSON.parse(body).action);
  return ready?Response.json({result:6,error:null}):new Response(null,{status:503});
 });
 const runtime={ankiProcess:()=>({start:async()=>{
  await anki.call({},'version').catch(()=>{throw Error('ANKI_OFFLINE');});
 }})};
 const options={runtime,find:()=>'anki.exe',fetcher:async()=>{downloads++;throw Error('unexpected download');}};
 m.start(root,options);
 await wait(m,'error');
 assert.equal(m.status().phase,'error');
 assert.equal(m.status().error,'ANKI_OFFLINE');
 ready=true;
 m.start(root,options);
 await wait(m,'done');
 assert.equal(m.status().phase,'done');
 assert.equal(m.status().error,'');
 assert.deepEqual(actions,['version','version']);
 assert.equal(downloads,0);
});

for(const scenario of [
 {name:'installs under MeguLit on another drive'},
 {name:'installs under MeguLit on the system drive too',sameDrive:true},
 {name:'reports the chosen directory on an MSI write failure',code:1603,error:'ANKI_INSTALL_TARGET_FAILED {folder} (1603)'},
 {name:'does not retry a cancelled installation',code:1602,error:'ANKI_INSTALL_CANCELLED'},
 {name:'keeps the cancellation message when elevation is declined',code:1223,error:'ANKI_INSTALL_CANCELLED'},
 {name:'accepts a successful MSI installation that requests a reboot',code:3010},
 {name:'reports success without an executable as an error',noExecutable:true,error:'ANKI_EXECUTABLE_MISSING'},
 {name:'reports a failure to start Windows Installer',spawnError:true,error:'MSI launch failed'},
 {name:'accepts an existing empty folder',entry:'empty'},
 {name:'leaves a nonempty Anki folder alone',entry:'occupied',blocked:true},
 {name:'rejects a file in place of the Anki folder',entry:'file',blocked:true},
 {name:'rejects an Anki directory junction',entry:'junction',blocked:true},
 {name:'reports an unreadable folder without starting MSI',entry:'denied',blocked:true},
]){
 test('one-click Anki '+scenario.name,{skip:process.platform!=='win32'},async t=>{
  const {EventEmitter}=require('node:events'),calls=[];
  let installed=false;
  const childProcess=require('node:child_process');
  const probe=t.mock.method(childProcess,'execFile',(_exe,_args,_options,callback)=>{
   queueMicrotask(()=>callback(Error('unexpected disk probe')));
  });
  t.mock.method(childProcess,'spawn',(exe,args)=>{
   calls.push({exe,args});
   const child=new EventEmitter();
   queueMicrotask(()=>{
    if(scenario.spawnError){child.emit('error',Error('MSI launch failed'));return;}
    installed=(!scenario.code||scenario.code===3010)&&!scenario.noExecutable;
    child.emit('exit',scenario.code||0);
   });
   return child;
  });
  t.mock.method(require('../core/fast-download.cjs'),'download',async()=>{});
  const {root,m}=fixture(t),drive=path.parse(root).root;
  const folder=path.join(root,'Anki'),marker=path.join(folder,'keep.txt');
  const junctionTarget=path.join(root,'junction-target');
  if(scenario.entry==='empty')fs.mkdirSync(folder);
  if(scenario.entry==='occupied'){fs.mkdirSync(folder);fs.writeFileSync(marker,'existing files');}
  if(scenario.entry==='file')fs.writeFileSync(folder,'existing file');
  if(scenario.entry==='junction'){fs.mkdirSync(junctionTarget);fs.symlinkSync(junctionTarget,folder,'junction');}
  if(scenario.entry==='denied'){
   const lstat=fs.lstatSync;
   t.mock.method(fs,'lstatSync',(file,options)=>{
    if(file===folder)throw Object.assign(Error('access denied'),{code:'EACCES'});
    return lstat(file,options);
   });
  }
  const systemDrive=process.env.SystemDrive;
  t.after(()=>{if(systemDrive===undefined)delete process.env.SystemDrive;else process.env.SystemDrive=systemDrive;});
  process.env.SystemDrive=scenario.sameDrive?drive.slice(0,2):(drive[0].toUpperCase()==='C'?'D:':'C:');
  m.start(root,{find:()=>installed?path.join(folder,'anki.exe'):'',china:false});
  const error=(scenario.blocked?'ANKI_INSTALL_TARGET_FAILED {folder}':scenario.error||'').replace('{folder}',folder);
  const phase=error?'error':'done';
  await wait(m,phase);
  assert.equal(m.status().phase,phase);
  assert.equal(m.status().error,error);
  if(scenario.blocked)assert.equal(calls.length,0);
  else{
   assert.equal(calls.length,1);
   assert.equal(path.basename(calls[0].exe),'msiexec.exe');
   assert.deepEqual(calls[0].args,['/i',path.join(root,'data','cache','anki-installer',m.PACKAGE.name),'/passive','/norestart','INSTALLFOLDER='+folder]);
  }
  assert.equal(probe.mock.callCount(),0);
  if(scenario.entry==='occupied')assert.equal(fs.readFileSync(marker,'utf8'),'existing files');
  if(scenario.entry==='file')assert.equal(fs.readFileSync(folder,'utf8'),'existing file');
  if(scenario.entry==='junction')assert.deepEqual(fs.readdirSync(junctionTarget),[]);
 });
}

test('the install dialog shows the failed Anki directory and a way forward',async t=>{
 const messages={
  zh:/无法安装到 E:\\Anki \(1603\)。请确认目录为空且可写/,
  en:/Could not install to E:\\Anki \(1603\)\. Check that the folder is empty and writable/,
  ja:/E:\\Anki \(1603\) にインストールできませんでした。フォルダーが空で書き込み可能か確認/,
 };
 const generic={zh:/没有装成功/,en:/The installation did not complete/,ja:/インストールできませんでした/};
 const noop=()=>{};
 const document={documentElement:{lang:''},addEventListener:noop,removeEventListener:noop};
 const globals={document,window:{addEventListener:noop,removeEventListener:noop},addEventListener:noop,
  localStorage:{getItem:()=>null},MeguHud:require('../web/hud-drag.js'),MeguAnkiHud:require('../web/anki-hud-model.js')};
 for(const [name,value] of Object.entries(globals)){
  const previous=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{value,configurable:true});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,name,previous);else delete globalThis[name];});
 }
 const ticks=[];
 t.mock.method(globalThis,'setInterval',fn=>{ticks.push(fn);return ticks.length;});
 t.mock.method(globalThis,'clearInterval',noop);
 const {renderAnkiReview}=await import('../web/anki-review.js');
 for(const [language,message] of Object.entries(messages)){
  document.documentElement.lang=language;
  const ask={addEventListener(_event,handler){this.onclick=handler;}},go={},line={},bar={querySelector:()=>({style:{}})};
  const elements={'[data-install-ask]':ask,'[data-install-go]':go,'[data-install-state]':line,'.anki-install-bar':bar,'[data-connect]':{},'[data-launch]':{}};
  const querySelector=selector=>elements[selector]||null;
  const landing={matches:()=>true,classList:{add:noop,remove:noop},removeAttribute:noop,querySelector};
  const target={firstElementChild:landing,querySelector};
  landing.parentElement=target;
  let error;
  const api=async action=>{
   if(action==='anki_status')return {connected:false};
   if(action==='anki_install')return {phase:'installing'};
   assert.equal(action,'anki_install_status');
   return {phase:'error',error};
  };
  await renderAnkiReview({target,api,text:{},esc:String,isCurrent:()=>true,toast:assert.fail,quiet:true});
  for(const [value,expected] of [
   ['ANKI_INSTALL_TARGET_FAILED E:\\Anki (1603)',message],['ANKI_INSTALL_FAILED 1603',generic[language]],
   ['ANKI_RUNNING',{zh:/请先关闭 Anki/,en:/close Anki first/,ja:/先に Anki を閉じて/}[language]],
   ['ANKICONNECT_DOWNLOAD_FAILED: HTTP 502',{zh:/AnkiConnect 插件下载或安装失败/,en:/Could not download or install AnkiConnect/,ja:/AnkiConnect のダウンロードまたは導入に失敗/}[language]],
   ['ANKICONNECT_INSTALL_FAILED: target exists',{zh:/AnkiConnect 插件下载或安装失败/,en:/Could not download or install AnkiConnect/,ja:/AnkiConnect のダウンロードまたは導入に失敗/}[language]],
   [1603,generic[language]],[undefined,generic[language]],
  ]){
   error=value;
   ask.onclick();
   await go.onclick();
   await ticks.at(-1)();
   assert.match(line.textContent,expected);
   assert.equal(go.disabled,false);
  }
 }
});

test('the bridge connects an existing Anki using the runtime path',async t=>{
 const {root,m}=fixture(t);
 const previousRoot=process.env.MEGULIT_ROOT;
 process.env.MEGULIT_ROOT=root;
 t.after(()=>{if(previousRoot===undefined)delete process.env.MEGULIT_ROOT;else process.env.MEGULIT_ROOT=previousRoot;});
 const {dispatch}=require('../services/bridge.cjs');
 const anki=require('../core/anki-process.cjs');
 const exe='R:\\Existing Anki\\anki.exe';
 let connectPath='',launched=false;
 t.mock.method(anki,'installAnkiConnect',async (_env,{locate})=>{
  connectPath=locate();
  return {already:true};
 });
 const runner={find:()=>exe,start:async options=>{
  assert.equal(connectPath,exe);
  assert.deepEqual(options,{hide:false});
  launched=true;
 }};
 await dispatch({action:'anki_install'},{ankiProcess:()=>runner});
 await wait(m,'done');
 assert.equal(m.status().phase,'done');
 assert.equal(launched,true);
 const cliFind=t.mock.method(anki,'find',(_configured,_env,_exists,appRoot)=>{
  assert.equal(appRoot,root);
  return exe;
 });
 await dispatch({action:'anki_install'});
 await wait(m,'done');
 assert.equal(m.status().phase,'done');
 assert.ok(cliFind.mock.callCount()>0);
 assert.deepEqual(await dispatch({action:'anki_find'}),{path:exe});
 assert.deepEqual(await dispatch({action:'anki_install_connect'}),{already:true});
 assert.equal(connectPath,exe);
});

function fakeAddonZip(){
 return Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),Buffer.alloc(4100)]);
}
function unpackFiles(files){
 return (_zip,out)=>{
  fs.mkdirSync(out,{recursive:true});
  for(const [name,content] of Object.entries(files)){
   const file=path.join(out,name);
   fs.mkdirSync(path.dirname(file),{recursive:true});
   fs.writeFileSync(file,content);
  }
 };
}

test('one-click Anki surfaces AnkiConnect install failures instead of falling through to ANKI_OFFLINE',async t=>{
 const {root,m}=fixture(t),anki=require('../core/anki-process.cjs');
 for(const failure of ['ANKI_RUNNING','ANKICONNECT_DOWNLOAD_FAILED: HTTP 502']){
  let startCalls=0;
  t.mock.method(anki,'installAnkiConnect',async()=>{throw Error(failure);});
  const runtime={ankiProcess:()=>({online:async()=>false,start:async()=>{startCalls++;throw Error('ANKI_OFFLINE');}})};
  m.start(root,{runtime,find:()=>'C:\\Anki\\anki.exe',china:false});
  await wait(m,'error');
  assert.equal(m.status().phase,'error');
  assert.equal(m.status().error,failure);
  assert.equal(startCalls,0,'should not try to start Anki when AnkiConnect failed to install');
  t.mock.restoreAll();
 }
 let installCalls=0,startCalls=0;
 t.mock.method(anki,'installAnkiConnect',async()=>{installCalls++;return {installed:true};});
 const runtime={ankiProcess:()=>({online:async()=>true,start:async()=>{startCalls++;}})};
 m.start(root,{runtime,find:()=>'C:\\Anki\\anki.exe',china:false});
 await wait(m,'done');
 assert.equal(m.status().phase,'done');
 assert.equal(installCalls,0,'already online Anki skips add-on installation');
 assert.equal(startCalls,0,'already online Anki skips launching again');
});

test('installAnkiConnect stages atomically, cleans up partial copies, and rechecks state before publishing',async t=>{
 const anki=require('../core/anki-process.cjs');
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ac-stage-'));
 t.after(()=>fs.rmSync(work,{recursive:true,force:true}));
 const payload='# AnkiConnect web.WebServer\n';
 const validZip=fakeAddonZip();
 const validExtract=unpackFiles({'__init__.py':payload,'config.json':'{"webBindAddress":"127.0.0.1"}'});
 const noCfgExtract=unpackFiles({'__init__.py':payload});

 // 1. Partial copy failure leaves no target and no staging folder, allowing a clean retry.
 const app1=path.join(work,'app1'),env1={APPDATA:app1,WINDIR:process.env.WINDIR};
 fs.mkdirSync(path.join(app1,'Anki2','addons21'),{recursive:true});
 const origCp=fs.cpSync;
 let failOnce=true;
 t.mock.method(fs,'cpSync',(src,dest,opts)=>{
  if(failOnce){failOnce=false;fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'config.json'),'{}');throw Error('EIO copy failed');}
  return origCp(src,dest,opts);
 });
 await assert.rejects(anki.installAnkiConnect(env1,{locate:()=>'C:\\Anki\\anki.exe',running:()=>false,fetcher:async()=>new Response(validZip,{status:200}),extract:validExtract}),/EIO copy failed/);
 assert.equal(anki.ankiConnectInstalled(env1),false,'failed copy must not count as installed');
 assert.deepEqual(fs.readdirSync(path.join(app1,'Anki2','addons21')),[],'target and staging folders are both cleaned up');
 const retry=await anki.installAnkiConnect(env1,{locate:()=>'C:\\Anki\\anki.exe',running:()=>false,fetcher:async()=>new Response(validZip,{status:200}),extract:validExtract});
 assert.equal(retry.installed,true);assert.equal(retry.already,undefined);
 assert.equal(anki.ankiConnectInstalled(env1),true);
 t.mock.restoreAll();

 // 2. Anki starting during download/extraction is caught before publishing.
 const app2=path.join(work,'app2'),env2={APPDATA:app2,WINDIR:process.env.WINDIR};
 fs.mkdirSync(path.join(app2,'Anki2','addons21'),{recursive:true});
 let isRunning=false;
 await assert.rejects(anki.installAnkiConnect(env2,{locate:()=>'C:\\Anki\\anki.exe',running:()=>isRunning,fetcher:async()=>{isRunning=true;return new Response(validZip,{status:200});},extract:validExtract}),/ANKI_RUNNING/);
 assert.equal(anki.ankiConnectInstalled(env2),false);
 assert.deepEqual(fs.readdirSync(path.join(app2,'Anki2','addons21')),[]);

 // 3. Concurrent installation completing during download (even under an alternate AnkiConnect folder name) returns already:true without overwriting.
 const app3=path.join(work,'app3'),env3={APPDATA:app3,WINDIR:process.env.WINDIR};
 fs.mkdirSync(path.join(app3,'Anki2','addons21'),{recursive:true});
 const existing=path.join(app3,'Anki2','addons21','AnkiConnect');
 const concurrent=await anki.installAnkiConnect(env3,{locate:()=>'C:\\Anki\\anki.exe',running:()=>false,fetcher:async()=>{
  fs.mkdirSync(existing,{recursive:true});fs.writeFileSync(path.join(existing,'__init__.py'),'# existing');
  return new Response(validZip,{status:200});
 },extract:validExtract});
 assert.deepEqual(concurrent,{installed:true,already:true});
 assert.equal(fs.readFileSync(path.join(existing,'__init__.py'),'utf8'),'# existing');
 assert.deepEqual(fs.readdirSync(path.join(app3,'Anki2','addons21')),['AnkiConnect']);

 // 4. Legacy incomplete directory is replaced on retry; a regular file at target is rejected; missing config.json fails cleanly.
 const app4=path.join(work,'app4'),env4={APPDATA:app4,WINDIR:process.env.WINDIR};
 fs.mkdirSync(path.join(app4,'Anki2','addons21','2055492159'),{recursive:true});
 fs.writeFileSync(path.join(app4,'Anki2','addons21','2055492159','config.json'),'{}');
 assert.equal(anki.ankiConnectInstalled(env4),false);
 await assert.rejects(anki.installAnkiConnect(env4,{locate:()=>'C:\\Anki\\anki.exe',running:()=>false,fetcher:async()=>new Response(validZip,{status:200}),extract:noCfgExtract}),/ANKICONNECT_DOWNLOAD_FAILED: unexpected package/);
 const recovered=await anki.installAnkiConnect(env4,{locate:()=>'C:\\Anki\\anki.exe',running:()=>false,fetcher:async()=>new Response(validZip,{status:200}),extract:validExtract});
 assert.equal(recovered.installed,true);
 assert.equal(anki.ankiConnectInstalled(env4),true);

 const app5=path.join(work,'app5'),env5={APPDATA:app5,WINDIR:process.env.WINDIR};
 fs.mkdirSync(path.join(app5,'Anki2','addons21'),{recursive:true});
 fs.writeFileSync(path.join(app5,'Anki2','addons21','2055492159'),'not a folder');
 assert.equal(anki.ankiConnectInstalled(env5),false);
 await assert.rejects(anki.installAnkiConnect(env5,{locate:()=>'C:\\Anki\\anki.exe',running:()=>false,fetcher:async()=>new Response(validZip,{status:200}),extract:validExtract}),/ANKICONNECT_INSTALL_FAILED: target exists/);
 assert.equal(fs.readFileSync(path.join(app5,'Anki2','addons21','2055492159'),'utf8'),'not a folder');

 // 5. Network, HTTP status, bad payload, and extraction timeout errors wrap cleanly; fresh install works when Anki2 does not yet exist.
 const app6=path.join(work,'app6'),env6={APPDATA:app6,WINDIR:process.env.WINDIR};
 let freshFetch=0;
 await assert.rejects(anki.installAnkiConnect(env6,{locate:()=>'C:\\Anki\\anki.exe',fresh:true,running:()=>true,fetcher:async()=>{freshFetch++;return new Response(validZip,{status:200});},extract:validExtract}),/ANKI_RUNNING/);
 assert.equal(freshFetch,0);assert.equal(fs.existsSync(path.join(app6,'Anki2')),false);
 await assert.rejects(anki.installAnkiConnect(env6,{locate:()=>'C:\\Anki\\anki.exe',fresh:true,running:()=>false,fetcher:async()=>{throw new TypeError('fetch failed');},extract:validExtract}),/ANKICONNECT_DOWNLOAD_FAILED: fetch failed/);
 await assert.rejects(anki.installAnkiConnect(env6,{locate:()=>'C:\\Anki\\anki.exe',fresh:true,running:()=>false,fetcher:async()=>new Response('bad',{status:502}),extract:validExtract}),/ANKICONNECT_DOWNLOAD_FAILED: HTTP 502/);
 await assert.rejects(anki.installAnkiConnect(env6,{locate:()=>'C:\\Anki\\anki.exe',fresh:true,running:()=>false,fetcher:async()=>new Response('not-a-zip',{status:200}),extract:validExtract}),/ANKICONNECT_DOWNLOAD_FAILED: not an add-on package/);
 await assert.rejects(anki.installAnkiConnect(env6,{locate:()=>'C:\\Anki\\anki.exe',fresh:true,running:()=>false,fetcher:async()=>new Response(validZip,{status:200}),extract:()=>{throw Object.assign(Error('spawnSync powershell.exe ETIMEDOUT'),{code:'ETIMEDOUT'});}}),/ANKICONNECT_INSTALL_FAILED:.*ETIMEDOUT/);
 assert.equal(fs.existsSync(path.join(app6,'Anki2')),false);
 const freshOk=await anki.installAnkiConnect(env6,{locate:()=>'C:\\Anki\\anki.exe',fresh:true,running:()=>false,fetcher:async()=>new Response(validZip,{status:200}),extract:validExtract});
 assert.equal(freshOk.installed,true);assert.equal(anki.ankiConnectInstalled(env6),true);

 // 6. Junction at target is never deleted; renameSync race returns already:true, while real renameSync errors propagate.
 if(process.platform==='win32'){
  const app7=path.join(work,'app7'),env7={APPDATA:app7,WINDIR:process.env.WINDIR};
  const jTarget=path.join(work,'j-target');fs.mkdirSync(jTarget,{recursive:true});fs.writeFileSync(path.join(jTarget,'keep.txt'),'stay');
  fs.mkdirSync(path.join(app7,'Anki2','addons21'),{recursive:true});
  fs.symlinkSync(jTarget,path.join(app7,'Anki2','addons21','2055492159'),'junction');
  await assert.rejects(anki.installAnkiConnect(env7,{locate:()=>'C:\\Anki\\anki.exe',running:()=>false,fetcher:async()=>new Response(validZip,{status:200}),extract:validExtract}),/ANKICONNECT_INSTALL_FAILED: target exists/);
  assert.equal(fs.readFileSync(path.join(jTarget,'keep.txt'),'utf8'),'stay');
 }
 const app8=path.join(work,'app8'),env8={APPDATA:app8,WINDIR:process.env.WINDIR};
 fs.mkdirSync(path.join(app8,'Anki2','addons21'),{recursive:true});
 t.mock.method(fs,'renameSync',(from,to)=>{
  fs.mkdirSync(to,{recursive:true});fs.writeFileSync(path.join(to,'__init__.py'),'# raced');
  throw Object.assign(Error('EEXIST'),{code:'EEXIST'});
 });
 const raced=await anki.installAnkiConnect(env8,{locate:()=>'C:\\Anki\\anki.exe',running:()=>false,fetcher:async()=>new Response(validZip,{status:200}),extract:validExtract});
 t.mock.restoreAll();
 assert.deepEqual(raced,{installed:true,already:true});
 assert.equal(fs.readFileSync(path.join(app8,'Anki2','addons21','2055492159','__init__.py'),'utf8'),'# raced');
 assert.deepEqual(fs.readdirSync(path.join(app8,'Anki2','addons21')),['2055492159']);

 const app9=path.join(work,'app9'),env9={APPDATA:app9,WINDIR:process.env.WINDIR};
 fs.mkdirSync(path.join(app9,'Anki2','addons21'),{recursive:true});
 t.mock.method(fs,'renameSync',()=>{throw Object.assign(Error('EPERM rename'),{code:'EPERM'});});
 await assert.rejects(anki.installAnkiConnect(env9,{locate:()=>'C:\\Anki\\anki.exe',running:()=>false,fetcher:async()=>new Response(validZip,{status:200}),extract:validExtract}),/EPERM rename/);
 t.mock.restoreAll();
 assert.deepEqual(fs.readdirSync(path.join(app9,'Anki2','addons21')),[]);
});
