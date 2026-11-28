// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const P=require('../core/profiles/index.cjs'),{clean}=require('../core/profiles/domains.cjs');
const {HookNative}=require('../core/hook-native.cjs');

test('only CMVS enables GPU body recheck and its profile accepts boolean overrides',()=>{
 const bp=profile=>HookNative.prototype.bridgeProfile.call({profile});
 const opt=gpuBodyRecheck=>({hide:{gpuBodyRecheck}});
 const cmvs=P.profileFor({engine:'CMVS'});
 assert.equal(cmvs.hide.gpuBodyRecheck,true);
 assert.equal(bp(cmvs).gpuBodyRecheck,true);
 for(const engine of ['','nexas','kirikiri','mages']){
  assert.equal(P.profileFor({engine}).hide.gpuBodyRecheck,false);
  assert.equal('gpuBodyRecheck' in bp(P.profileFor({engine,official:opt(true)})),false);
 }
 assert.deepEqual(clean(opt(false)),{value:opt(false),rejected:[]});
 assert.deepEqual(clean(opt('true')),{value:{},rejected:['hide.gpuBodyRecheck']});
 assert.equal('gpuBodyRecheck' in bp(P.profileFor({engine:'CMVS',official:opt(false)})),false);
});

test('HookBridge gets the CMVS option at spawn and when its profile changes',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cmvs-gpu-'));
 const native=path.join(root,'native'),hook=path.join(root,'hook');
 for(const dir of [native,hook])fs.mkdirSync(dir);
 fs.writeFileSync(path.join(native,'HookBridge.exe'),'');
 for(const name of ['LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'])fs.writeFileSync(path.join(hook,name),'');
 const sent=[],child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough()});
 child.stdin.on('data',data=>sent.push(JSON.parse(data.toString())));
 let startup;
 const h=new HookNative({native,hook,logs:path.join(root,'logs')},()=>{},(_file,_args,options)=>{
  startup=JSON.parse(options.env.MEGULIT_PROFILE);
  return child;
 });
 clearInterval(h.timer);
 h.trace=()=>{};
 t.after(()=>{
  child.stdin.destroy();
  child.stdout.destroy();
  fs.rmSync(root,{recursive:true,force:true});
 });
 const cmvs=P.profileFor({engine:'cmvs'}),other=P.profileFor({engine:'nexas'});
 h.setProfile(cmvs);
 h.start({pid:process.pid,hwnd:'1',name:'fixture.exe',started:'1234567890123'});
 assert.equal(startup.gpuBodyRecheck,true);
 h.setProfile(other);
 h.setProfile(cmvs);
 h.setProfile(cmvs);
 assert.deepEqual(sent.filter(m=>m.type==='profile').map(m=>m.gpuBodyRecheck),[undefined,true]);
});

test('the reader places the cold CMVS row across every drawn glyph using the hook character count',()=>{
 const {parseChars}=require('../core/text-paths.cjs'),{OverlayPlacement}=require('../core/overlay-placement.cjs');
 const fixture=path.join(__dirname,'../native/gpuhide/selftest/replay-fixtures/aoitori-cmvs-cold-start.expected');
 const wire=fs.readFileSync(fixture,'utf8').split(/\r?\n/).find(line=>line.startsWith('ToMe_CHARS engine=gpu line=1 '));
 const record=parseChars(wire);
 assert.ok(record?.hidden);
 const sent=[],p=new OverlayPlacement({send:m=>sent.push(m)});
 p.wanted=()=>true;
 p.configure({}, {bound:true,clientWidth:1280,clientHeight:720});
 p.hook(record);
 p.stop();
 const placed=sent.find(m=>m.type==='textPlace'&&m.id==='gpu:1');
 assert.ok(placed);
 assert.equal(placed.text,record.text);
 assert.equal([...placed.text].length,19);
 assert.equal(placed.rects.length,19);
 assert.equal(placed.rects[0][0],302);
 assert.equal(Math.max(...placed.rects.map(([x,,w])=>x+w)),950);
});
