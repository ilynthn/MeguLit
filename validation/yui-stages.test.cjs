// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 Yui: the service's own stages in the desktop session log, local frontend details that are never sent, the split
   rejection kinds of #1090, and the run records a cold test / automatic adaptation can keep */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const yui=require('../services/yui.cjs'),J=require('../core/yui-journal.cjs'),Run=require('../core/yui-run.cjs');
const tmp=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'yui-stages-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};

test('service stages join the desktop session, capped, only with both variables, and become reportable faults',async t=>{
 const root=tmp(t),dir=path.join(root,'logs/yui');fs.mkdirSync(dir,{recursive:true});const start=Date.now()-5000,session=start+'-77';
 fs.writeFileSync(path.join(dir,session+'.log'),'0 native-entry\n3388 window-revealed\n');J._reset();
 const env={MEGULIT_YUI_SESSION:session,MEGULIT_YUI_DIR:dir};
 assert.equal(J.mark('game-hook-failed',{env:{MEGULIT_YUI_SESSION:session}}),false,'no directory, nothing written');
 assert.equal(J.mark('Bad Stage',{env}),false);
 for(let i=0;i<10;i++)J.mark('game-hook-failed',{env,now:start+6000+i});
 const s=yui.sessions(root,session)[0];assert.equal(s.events.filter(e=>e.stage==='game-hook-failed').length,8);assert.equal(s.events.at(-1).ms,6007);
 for(const f of ['game-hook-failed','game-hook-stopped','hook-components-missing','native-panic','document-timeout','reveal-timeout','frontend-rejection-service','frontend-rejection-abort'])assert.ok(yui.faults.has(f),f);
 const {yuiPost}=await import('../relay/src/yui.js');let stored=null;
 const env2={DB:{prepare:()=>({bind:(...v)=>({run:()=>{stored=v;}})})}};
 const ok=await yuiPost({},env2,{readJSON:async()=>({value:{id:'a'.repeat(64),stage:'game-hook-failed',previous:'window-revealed',ms:6000}}),fail:()=>false,json:v=>v.ok,hit:async()=>true},'ip',new Date());
 assert.equal(ok,true);assert.equal(stored[1],'game-hook-failed');
});

test('frontend details stay local: sessions() lists them, flush() never sends them',async t=>{
 const root=tmp(t),dir=path.join(root,'logs/yui');fs.mkdirSync(dir,{recursive:true});yui.setEnabled(root,true);t.after(()=>yui.setEnabled(root,false));
 const session=Date.now()+'-5';
 fs.writeFileSync(path.join(dir,session+'.log'),'0 native-entry\r\n3388 window-revealed\r\n113362 frontend-rejection-service\r\n113363 ~frontend-rejection-service string SERVICE_TIMEOUT\r\n115000 ~frontend-error TypeError x.y is undefined @home-tv.js:201:5\r\n');
 const s=yui.sessions(root,session)[0];assert.deepEqual(s.events.map(e=>e.stage),['native-entry','window-revealed','frontend-rejection-service']);
 assert.equal(s.details.length,2);assert.match(s.details[1].detail,/home-tv\.js:201/);
 const sent=[];await yui.flush(root,{urls:['mock'],fetcher:async(u,a)=>{sent.push(a.body);return {ok:true,json:async()=>({ok:true})};}});
 assert.equal(sent.length,1);assert.deepEqual(JSON.parse(sent[0]).stage,'frontend-rejection-service');assert.equal(JSON.parse(sent[0]).previous,'window-revealed');
 assert.ok(!sent.join('').includes('SERVICE_TIMEOUT')&&!sent.join('').includes('home-tv'),'no detail leaves the PC');
});

test('#1090 the init script splits rejections by kind and keeps only a code and a script location locally',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../desktop/src/yui-init.js'),'utf8');const calls=[],listeners={};
 const win={invoked:calls,__TAURI_INTERNALS__:{invoke:(cmd,args)=>{calls.push([cmd,args]);return Promise.resolve();}},addEventListener:(k,f)=>{listeners[k]=f;}};win.window=win;win.top=win;
 vm.runInNewContext(src,{window:win,Error,Promise,String,RegExp,JSON});
 const fire=reason=>{calls.length=0;listeners.unhandledrejection({reason});return calls;};
 assert.deepEqual(fire('SERVICE_TIMEOUT').map(c=>c[1].stage),['frontend-rejection-service','frontend-rejection-service']);
 assert.equal(fire('SERVICE_TIMEOUT')[1][1].detail,'string SERVICE_TIMEOUT');
 const abort=Object.assign(new Error('The operation was aborted.'),{name:'AbortError'});assert.equal(fire(abort)[0][1].stage,'frontend-rejection-abort');
 const e=new TypeError('Cannot read properties of null (reading \'x\') at C:\\Users\\Megumin\\game');e.stack='TypeError: x\n    at deal (http://tauri.localhost/home-tv.js:201:17)';
 const c=fire(e);assert.equal(c[0][1].stage,'frontend-rejection');assert.match(c[1][1].detail,/^TypeError .*@home-tv\.js:201:17$/);assert.ok(!c[1][1].detail.includes('Megumin'),'paths are cut');
 assert.equal(fire('私の名前は秘密')[1][1].detail,'string text(7)','free text is only measured');
 assert.equal(calls.every(([cmd])=>cmd==='yui_stage'||cmd==='yui_detail'),true);
});

test('run records: a failed, a closed and a silent run each say where they stopped',t=>{
 const dir=tmp(t);let clock=1000;const now=()=>clock;
 const r=Run.start(dir,{kind:'cold-test',now});clock=1200;r.mark('launch');clock=1500;r.mark('hook-attach');clock=9000;r.fail('no-first-line','no hookSource in 7.5 s');r.mark('late');
 const a=Run.read(dir);assert.equal(a.kind,'cold-test');assert.equal(a.state,'failed');assert.equal(a.stage,'no-first-line');assert.equal(a.previous,'hook-attach');assert.equal(a.failed.reason,'no hookSource in 7.5 s');assert.equal(a.failed.ms,8000);
 const d2=tmp(t),r2=Run.start(d2,{now});r2.mark('launch');r2.close();assert.equal(Run.read(d2).state,'closed');
 const d3=tmp(t),r3=Run.start(d3,{now});r3.mark('launch');r3.mark('window');
 assert.equal(Run.read(d3).state,'interrupted');assert.equal(Run.read(d3).stage,'window');assert.equal(Run.read(d3,{alive:true}).state,'running');
 assert.equal(r3.mark('Bad stage'),false);for(let i=0;i<20;i++)r3.mark('advance');assert.equal(Run.read(d3).events.filter(e=>e.stage==='advance').length,8);
 assert.equal(Run.read(path.join(dir,'none')),null);
});
