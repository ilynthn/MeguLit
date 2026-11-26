// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {WebTextPath}=require('../core/text-paths-web.cjs');
const {BOOTSTRAP}=require('../core/cdp-report.cjs');
function socketFixture(t,{legacy=false,denied=false,rejected=false,stallSync=false}={}){
 const sockets=[],calls=[],old=global.WebSocket;
 class Socket{
  constructor(){sockets.push(this);this.resetDocument();queueMicrotask(()=>this.onopen());}
  resetDocument(){this.ctx={document:{documentElement:null,addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}},setInterval(){return 1;},clearInterval(){},setTimeout(){return 1;},clearTimeout(){}};this.ctx.window=this.ctx;vm.createContext(this.ctx);}
  send(raw){const m=JSON.parse(raw);calls.push(m);let result={},error;
   if(m.method==='Runtime.addBinding'){
    if(denied)error={code:-32000,message:'Access denied'};
    else if(legacy)error={code:-32601,message:"'Runtime.addBinding' wasn't found"};
    else this.ctx.__megulitReport=payload=>this.onmessage({data:JSON.stringify({method:'Runtime.bindingCalled',params:{name:'__megulitReport',payload}})});
   }else if(m.method==='Page.addScriptToEvaluateOnNewDocument'){
    if(legacy)error={code:-32601,message:"'Page.addScriptToEvaluateOnNewDocument' wasn't found"};
    else result={identifier:'script-'+m.id};
   }else if(m.method==='Runtime.evaluate'){
    try{result=rejected?{wasThrown:true,result:{description:'legacy script failed'}}:{result:{value:vm.runInContext(m.params.expression,this.ctx)}};}
    catch(e){result={wasThrown:true,result:{description:e.message}};}
   }
   if(stallSync&&m.method==='Runtime.evaluate'&&m.params.expression.includes('__megulitText.want('))return;
   queueMicrotask(()=>this.onmessage({data:JSON.stringify({id:m.id,result,error})}));
  }
  close(){queueMicrotask(()=>this.onclose());}
 }
 global.WebSocket=Socket;t.after(()=>{global.WebSocket=old;});return {sockets,calls};
}
test('Chrome 41 missing methods use bounded reporting and install acknowledgement, then stop restores',async t=>{
 const f=socketFixture(t,{legacy:true}),status=[],p=new WebTextPath({port:1,onStatus:s=>status.push(s)});t.after(()=>p.stop());
 await p.attachPage({id:'page',webSocketDebuggerUrl:'ws://fixture'});
 assert.equal(p.pages.size,1);assert.ok(status.includes('ok'));assert.equal(f.sockets[0].ctx.__megulitRpgm.state().patched,false);
 assert.equal(vm.runInContext('typeof Array.from',f.sockets[0].ctx),'function','host fallback does not replace page built-ins');
 await p.stop();assert.equal(p.pages.size,0);assert.equal(f.calls.filter(m=>m.method==='Page.removeScriptToEvaluateOnNewDocument').length,0);
});
test('modern CDP retains bindings and removes each registered preload only after restoration',async t=>{
 const f=socketFixture(t),status=[],p=new WebTextPath({port:1,onStatus:s=>status.push(s)});t.after(()=>p.stop());
 await p.attachPage({id:'page',webSocketDebuggerUrl:'ws://fixture'});assert.ok(status.includes('ok'));assert.equal(p.pages.size,1);
 await p.stop();const removes=f.calls.filter(m=>m.method==='Page.removeScriptToEvaluateOnNewDocument');assert.equal(removes.length,2);
 assert.ok(f.calls.findIndex(m=>m.method==='Runtime.evaluate'&&m.params.expression.includes('__megulitText.stop'))<f.calls.indexOf(removes[0]));
});
test('binding access denial never selects legacy fallback or marks a page ready',async t=>{
 const f=socketFixture(t,{denied:true}),p=new WebTextPath({port:1});t.after(()=>p.stop());
 await assert.rejects(p.attachPage({id:'p',webSocketDebuggerUrl:'ws://fixture'}),/Access denied/);assert.equal(p.pages.size,0);assert.equal(f.calls.some(m=>m.method==='Runtime.evaluate'),false);
});
test('legacy wasThrown refuses readiness and closes the failed connection',async t=>{
 const f=socketFixture(t,{legacy:true,rejected:true}),p=new WebTextPath({port:1});t.after(()=>p.stop());
 await assert.rejects(p.attachPage({id:'p',webSocketDebuggerUrl:'ws://fixture'}),/CDP_SCRIPT_REJECTED/);await new Promise(r=>setImmediate(r));assert.equal(p.pages.size,0);assert.equal(p.connections.size,0);assert.ok(f.calls.some(m=>m.method==='Runtime.evaluate'));
});
test('legacy restoration wasThrown propagates incomplete stop instead of claiming acknowledgement',async()=>{
 const p=new WebTextPath({port:1});let closed=false;p.pages.set('p',{send:async()=>({wasThrown:true}),close(){closed=true;}});
 await assert.rejects(p.stop(),/READER_STOP_INCOMPLETE/);assert.equal(closed,true);assert.equal(p.pages.size,0);
});
test('legacy reload reinstalls its missing document hooks while roles and embedding stay off',async t=>{
 const f=socketFixture(t,{legacy:true}),status=[],p=new WebTextPath({port:1,onStatus:s=>status.push(s)});t.after(()=>p.stop());
 await p.attachPage({id:'p',webSocketDebuggerUrl:'ws://fixture'});const socket=f.sockets[0];
 socket.resetDocument();
 socket.onmessage({data:JSON.stringify({method:'Runtime.executionContextCreated',params:{context:{id:2}}})});
 await new Promise(r=>setTimeout(r,400));assert.equal(status.filter(s=>s==='ok').length,2,JSON.stringify(status));assert.equal(socket.ctx.__megulitRpgm.state().patched,false);assert.equal(p.pages.size,1);
});
test('legacy report overflow clears its bounded queue and restores rendering',()=>{
 const restored=[],ctx={__megulitText:{hide:on=>restored.push(['hide',on])},__megulitRpgm:{config:cfg=>restored.push(['config',cfg])}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(BOOTSTRAP,ctx);
 for(let i=0;i<257;i++)ctx.__megulitReport(JSON.stringify({text:'line '+i}));
 const batch=JSON.parse(ctx.__megulitCdpTake());assert.equal(batch.length,1);assert.match(JSON.parse(batch[0]).status,/queue exceeded/);assert.equal(restored[0][1],false);assert.equal(restored[1][1].roles,false);assert.equal(restored[1][1].embed,false);assert.equal(ctx.__megulitCdpTake(),'[]');
 ctx.__megulitReport('x'.repeat(262145));assert.equal(JSON.parse(ctx.__megulitCdpTake()).length,1);
});

async function discoveryServer(t,respond){
 const server=require('node:http').createServer(respond);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 return server.address().port;
}
test('Luise NW SDK entry in the saved session is counted as an excluded page before any socket opens',async t=>{
 const f=socketFixture(t);
 let clock=0;
 const port=await discoveryServer(t,(req,res)=>{
  assert.equal(req.url,'/json/list');
  clock=250;
  res.end(JSON.stringify([{id:'game',type:'page',url:'chrome-extension://njgcanhfjdabfmnlmpmdedalocpafnhl/index.html',webSocketDebuggerUrl:'ws://fixture'}]));
 });
 const p=new WebTextPath({port,now:()=>clock});
 assert.equal(await p.attach({timeout:250}),false);
 assert.deepEqual(p.discovery,{phase:'no-page',attempts:1,targets:1,pages:1,extensionPages:1,eligible:0});
 assert.equal(f.sockets.length,0);
});
test('an HTTP error and a connection without a response leave distinct discovery evidence',async t=>{
 const invalid=new WebTextPath({port:await discoveryServer(t,(req,res)=>{res.writeHead(403);res.end('[]');})});
 assert.equal(await invalid.attach({timeout:250}),false);
 assert.equal(invalid.discovery.phase,'invalid-endpoint');assert.equal(invalid.discovery.reason,'CDP_HTTP_403');
 const stalled=new WebTextPath({port:await discoveryServer(t,()=>{})});
 assert.equal(await stalled.attach({timeout:250}),false);
 assert.equal(stalled.discovery.phase,'no-endpoint');assert.equal(stalled.discovery.reason,'CDP_HTTP_TIMEOUT');
});
test('a listed page whose first protocol command stalls closes at the initialization deadline',async t=>{
 const old=global.WebSocket,calls=[];let closed=false;
 class StalledSocket{constructor(){queueMicrotask(()=>this.onopen());}send(raw){calls.push(JSON.parse(raw).method);}close(){closed=true;this.onclose();}}
 global.WebSocket=StalledSocket;t.after(()=>{global.WebSocket=old;});
 const port=await discoveryServer(t,(req,res)=>res.end(JSON.stringify([{type:'page',id:'fixture',url:'file:///fixture.html',webSocketDebuggerUrl:'ws://fixture'}])));
 const p=new WebTextPath({port});
 assert.equal(await p.attach({timeout:250}),false);assert.equal(p.discovery.phase,'initialization');assert.equal(p.discovery.reason,'CDP_INIT_TIMEOUT');
 assert.deepEqual(calls,['Runtime.enable']);assert.equal(closed,true);assert.equal(p.pages.size,0);
});
test('a missing initialization reply after scripts were installed restores the page and unregisters preloads',async t=>{
 const f=socketFixture(t,{stallSync:true}),p=new WebTextPath({port:1});
 await assert.rejects(p.attachPage({id:'fixture',webSocketDebuggerUrl:'ws://fixture'},250),/CDP_INIT_TIMEOUT/);
 assert.ok(f.calls.some(m=>m.params?.expression?.includes('__megulitText.stop')));
 assert.equal(f.calls.filter(m=>m.method==='Page.removeScriptToEvaluateOnNewDocument').length,2);
 assert.equal(p.pages.size,0);
});
