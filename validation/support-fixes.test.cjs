'use strict';
// Regression tests for the 2026-11-08 support fixes: AnkiConnect detection, Anki cold-path candidates, and the
// reader status naming missing native components.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const anki=require('../core/anki-process.cjs');

test('AnkiConnect is detected only when its add-on folder has an entry script',()=>{
 const app=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-'));
 try{
  const env={APPDATA:app};
  assert.equal(anki.ankiConnectInstalled(env),null,'no Anki profile yet');
  fs.mkdirSync(path.join(app,'Anki2','addons21','123'),{recursive:true});
  assert.equal(anki.ankiConnectInstalled(env),false);
  const addon=path.join(app,'Anki2','addons21','2055492159');
  fs.mkdirSync(addon);
  assert.equal(anki.ankiConnectInstalled(env),false,'empty directory is not a complete add-on');
  fs.writeFileSync(path.join(addon,'config.json'),'{}');
  assert.equal(anki.ankiConnectInstalled(env),false,'partial folder without __init__.py is not installed');
  fs.mkdirSync(path.join(addon,'__init__.py'));
  assert.equal(anki.ankiConnectInstalled(env),false,'__init__.py directory is not a valid entry file');
  fs.rmSync(path.join(addon,'__init__.py'),{recursive:true,force:true});
  fs.writeFileSync(path.join(addon,'__init__.py'),'# AnkiConnect');
  assert.equal(anki.ankiConnectInstalled(env),true);
 }finally{fs.rmSync(app,{recursive:true,force:true});}
});

test('cold Anki candidates cover other drives and stay absolute paths',()=>{
 const list=anki.coldCandidates({WINDIR:process.env.WINDIR,USERPROFILE:'C:\\Users\\x'});
 assert.ok(list.includes('D:\\Anki\\anki.exe'));
 assert.ok(list.every(p=>path.isAbsolute(p)&&/anki(w)?\.exe$/i.test(p)));
});

test('a reader that never started names quarantined native files',()=>{
 const {Runtime}=require('../services/runtime.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-rt-'));
 try{
  fs.mkdirSync(path.join(root,'native'));fs.writeFileSync(path.join(root,'native','GalWindowBridge.exe'),'');
  const status=new Runtime(root).readerStatus();
  assert.equal(status.ready,false);
  assert.match(status.error,/^READER_NATIVE_MISSING: HookBridge\.exe, HookInjector32\.exe, HookInjector64\.exe$/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a registered Anki takes precedence over a copy inside MeguLit',t=>{
 const env={},root='R:\\Apps\\MeguLit';
 const known='Q:\\Installed Anki\\anki.exe',local=path.join(root,'Anki','anki.exe');
 const queries=t.mock.method(require('node:child_process'),'execFileSync',(_exe,args)=>
  args[1].includes('App Paths')?'    (Default)    REG_SZ    '+known:'');
 assert.equal(anki.find('',env,file=>file===known||file===local,root),known);
 assert.ok(queries.mock.callCount()>0);
});

test('a manually placed Anki is found at either MeguLit location without a registry entry',t=>{
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-local-anki-'));
 t.after(()=>fs.rmSync(scratch,{recursive:true,force:true}));
 const source=path.join(scratch,'original'),target=path.join(scratch,'moved');
 const exe=path.join(source,'Anki','anki.exe'),movedExe=path.join(target,'Anki','ankiw.exe');
 for(const file of [exe,movedExe]){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'MZ');}
 const manual=[exe,movedExe];
 const exists=file=>manual.includes(file)&&fs.statSync(file).isFile();
 t.mock.method(require('node:child_process'),'execFileSync',()=>'');
 assert.ok(anki.coldCandidates({},source).includes(exe));
 assert.ok(anki.coldCandidates({},target).includes(movedExe));
 assert.equal(anki.find('',{},exists,source),exe);
 assert.equal(anki.find('',{},exists,target),movedExe,'the previous MeguLit location is not reused');
 const stat=fs.statSync,read=fs.readFileSync;
 t.mock.method(fs,'statSync',(file,...args)=>{
  if(typeof file==='string' && /[\\/]anki(w)?\.exe$/i.test(file) && !manual.includes(file))return {isFile:()=>false};
  return stat(file,...args);
 });
 t.mock.method(fs,'readFileSync',(file,...args)=>
  typeof file==='string' && /[\\/]Anki\.lnk$/i.test(file)?Buffer.alloc(0):read(file,...args));
 const {Runtime}=require('../services/runtime.cjs');
 assert.equal(new Runtime(target).ankiProcess().find(),movedExe);
});
