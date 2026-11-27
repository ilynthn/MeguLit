// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Cardinal's hidden reader host (2026-11-21): a headless Microsoft Edge (Chromium, the engine of the app's WebView2) driven over the
   DevTools protocol with Node's own WebSocket, so the replay runs on a player's PC without Playwright or any download. No window is
   ever shown (--headless), it inherits the replay process's lowered priority, its profile is a temporary folder removed afterwards,
   and close() ends the whole process tree. Only what services/cardinal/driver.cjs needs: request routing (Fetch), a binding the
   page calls (Runtime.addBinding), init scripts, evaluate, console / page errors. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn,spawnSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* Edge first (every Windows 10/11 has it), then Chrome; MEGULIT_CARDINAL_BROWSER overrides */
function findBrowser(env=process.env){const list=[env.MEGULIT_CARDINAL_BROWSER];
 for(const base of [env['ProgramFiles(x86)'],env.ProgramFiles,env.LOCALAPPDATA].filter(Boolean)){list.push(path.join(base,'Microsoft','Edge','Application','msedge.exe'));list.push(path.join(base,'Google','Chrome','Application','chrome.exe'));}
 return list.find(f=>f&&fs.existsSync(f))||'';}
function bounded(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));}
class Conn{
 constructor(url,{WebSocketCtor=globalThis.WebSocket,connectMs=10000,commandMs=15000}={}){this.id=0;this.calls=new Map();this.handlers=new Map();this.closed=false;this.commandMs=commandMs;this.ws=new WebSocketCtor(url);
  this.ready=new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>this.close(Error('cdp connect timeout')),connectMs);
   this.settleReady=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};
   this.ws.addEventListener('open',()=>this.settleReady(),{once:true});});
  this.ready.catch(()=>{});
  this.ws.addEventListener('error',()=>this.close(Error('cdp connect failed')),{once:true});
  this.ws.addEventListener('message',ev=>{let m;try{m=JSON.parse(String(ev.data));}catch{return;}
   if(m.id&&this.calls.has(m.id)){const c=this.calls.get(m.id);this.calls.delete(m.id);clearTimeout(c.timer);m.error?c.rej(Error(m.error.message||'cdp error')):c.res(m.result||{});return;}
   for(const fn of this.handlers.get(m.method)||[])try{fn(m.params||{});}catch{}});
  this.ws.addEventListener('close',()=>this.fail(Error('cdp closed')));}
 fail(error){if(this.closed)return;this.closed=true;this.settleReady(error);for(const c of this.calls.values()){clearTimeout(c.timer);c.rej(error);}this.calls.clear();}
 send(method,params={},timeout=this.commandMs){if(this.closed)return Promise.reject(Error('cdp closed'));const id=++this.id;return new Promise((res,rej)=>{
  const timer=setTimeout(()=>{if(!this.calls.delete(id))return;rej(Error('cdp command timeout: '+method));},timeout);this.calls.set(id,{res,rej,timer});
  try{this.ws.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);this.calls.delete(id);rej(error);}});}
 on(method,fn){if(!this.handlers.has(method))this.handlers.set(method,[]);this.handlers.get(method).push(fn);}
 close(error=Error('cdp closed')){this.fail(error);try{this.ws.close();}catch{}}
}

class Page{
 constructor(conn){this.c=conn;this.bindings=new Map();this.listeners={console:[],pageerror:[],response:[]};this.router=null;this.loaded=null;
  conn.on('Fetch.requestPaused',p=>this.paused(p));
  conn.on('Runtime.bindingCalled',p=>this.binding(p));
  conn.on('Runtime.consoleAPICalled',p=>{const text=(p.args||[]).map(a=>a.value!==undefined?String(a.value):a.description||'').join(' ');for(const fn of this.listeners.console)fn({type:()=>p.type==='warning'?'warning':p.type,text:()=>text});});
  conn.on('Runtime.exceptionThrown',p=>{const d=p.exceptionDetails||{};const e=Error(d.exception?.description||d.text||'page error');for(const fn of this.listeners.pageerror)fn(e);});
  conn.on('Page.loadEventFired',()=>{const l=this.loaded;this.loaded=null;l?.();});}
 on(kind,fn){(this.listeners[kind]||(this.listeners[kind]=[])).push(fn);}
 async init(viewport){await this.c.send('Page.enable');await this.c.send('Runtime.enable');await this.c.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  await this.c.send('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:false});
  await this.addInitScript(()=>{window.__cdpCalls=new Map();window.__cdpSeq=0;window.__cdpDone=(id,ok,v)=>{const c=window.__cdpCalls.get(id);if(!c)return;window.__cdpCalls.delete(id);ok?c.res(v):c.rej(Error(v));};});}
 /* handler(url, request) -> {status, body, headers} | 'abort' | null (continue) */
 route(handler){this.router=handler;}
 async paused(p){const u=p.request?.url||'';let r=null;try{r=this.router?await this.router(u,p.request):null;}catch{r={status:500,body:''};}
  try{if(r==='abort'){await this.c.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'Aborted'});return;}
   if(r){const body=Buffer.isBuffer(r.body)?r.body:Buffer.from(String(r.body??''));const headers=Object.entries(r.headers||{}).map(([name,value])=>({name,value:String(value)}));
    for(const fn of this.listeners.response)fn({status:()=>r.status||200,url:()=>u});
    await this.c.send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:r.status||200,responseHeaders:headers,body:body.toString('base64')});return;}
   await this.c.send('Fetch.continueRequest',{requestId:p.requestId});}catch{}}
 async exposeFunction(name,fn){const b='__cdpBinding_'+name;this.bindings.set(b,fn);await this.c.send('Runtime.addBinding',{name:b});
  await this.addInitScript('window['+JSON.stringify(name)+']=(...args)=>new Promise((res,rej)=>{const id=++window.__cdpSeq;window.__cdpCalls.set(id,{res,rej});window['+JSON.stringify(b)+'](JSON.stringify({id,args}));});');}
 async binding(p){const fn=this.bindings.get(p.name);if(!fn)return;let call;try{call=JSON.parse(p.payload);}catch{return;}let ok=true,v;try{v=await fn(...call.args);}catch(e){ok=false;v=String(e&&e.message||e);}
  try{await this.c.send('Runtime.evaluate',{expression:'window.__cdpDone('+call.id+','+ok+','+JSON.stringify(v===undefined?null:v)+')',contextId:p.executionContextId});}catch{}}
 addInitScript(fnOrSource){const source=typeof fnOrSource==='function'?'('+fnOrSource+')();':String(fnOrSource);return this.c.send('Page.addScriptToEvaluateOnNewDocument',{source});}
 async goto(url,timeout=30000){
  const loaded=new Promise(resolve=>{this.loaded=resolve;});
  try{
   const navigate=this.c.send('Page.navigate',{url},timeout).then(result=>{
    if(result.errorText)throw Error(result.errorText);
   });
   await bounded(Promise.all([navigate,loaded]),timeout,'cdp page navigation timeout');
  }finally{this.loaded=null;}
 }
 /* fn: a function (called with arg) or an expression string */
 async evaluate(fn,arg,timeout){const expression=typeof fn==='function'?'('+fn+')('+(arg===undefined?'':JSON.stringify(arg))+')':String(fn);
  const r=await this.c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeout);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text||'evaluate failed');return r.result?.value;}
 async waitForFunction(fn,arg,{timeout=30000}={}){const until=Date.now()+timeout;for(;;){try{if(await this.evaluate(fn,arg))return true;}catch{}if(Date.now()>until)throw Error('waitForFunction timeout');await sleep(100);}}
 addScriptTag({path:file}){return this.evaluate(fs.readFileSync(file,'utf8')+'\n;true');}
}
/* -> {page, close()} */
async function launch({executable=findBrowser(),viewport={width:1920,height:1080},userDataDir,timeouts={}}={},dependencies={}){if(!executable)throw Error('CARDINAL_NO_BROWSER');
 const io={fs,spawn,spawnSync,fetch:globalThis.fetch,sleep,...dependencies},limits={startup:30000,target:5000,connect:10000,command:15000,init:30000,close:2000,exit:2000,cleanupAttempts:20,...timeouts};
 const owned=!userDataDir,dir=userDataDir||io.fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cardinal-edge-'));const ownedPath=owned?path.resolve(dir):null;
 const args=['--headless=new','--remote-debugging-port=0','--user-data-dir='+dir,'--no-first-run','--no-default-browser-check','--disable-extensions','--disable-gpu','--mute-audio','--disable-sync','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-features=Translate,msEdgeSidebarV2,msImplicitSignin,EdgeCollections','--hide-scrollbars','--window-size='+viewport.width+','+viewport.height,'about:blank'];
 let child=null,conn=null,port=0,browserPath='',ended=false,spawnError=null,disposal=null;let finishExit;const exited=new Promise(resolve=>finishExit=resolve);
 const connect=url=>new Conn(url,{WebSocketCtor:io.WebSocket||globalThis.WebSocket,connectMs:limits.connect,commandMs:limits.command});
 const hasExited=()=>child&&(child.exitCode!=null||child.signalCode!=null);
 const kill=()=>{if(!child||ended||hasExited()||!child.pid)return;try{if(process.platform==='win32')io.spawnSync('taskkill',['/T','/F','/PID',String(child.pid)],{windowsHide:true,stdio:'ignore',timeout:limits.exit});else child.kill('SIGKILL');}catch{}};
 const waitExit=async()=>{if(ended||!child)return true;try{await bounded(exited,limits.exit,'CARDINAL_BROWSER_EXIT_TIMEOUT');}catch{}return ended;};
 const cleanup=async()=>{if(!owned)return;for(let i=0;i<limits.cleanupAttempts;i++){try{if(path.resolve(dir)!==ownedPath)throw Error('CARDINAL_PROFILE_PATH_CHANGED');io.fs.rmSync(dir,{recursive:true,force:true});return;}catch(error){if(i+1===limits.cleanupAttempts)throw Error('CARDINAL_PROFILE_CLEANUP: '+error.message);await io.sleep(250);}}};
 const dispose=graceful=>{if(disposal)return disposal;disposal=(async()=>{conn?.close();
  if(graceful&&port&&browserPath&&!ended&&!hasExited()){let browserConn;try{browserConn=connect('ws://127.0.0.1:'+port+browserPath);await bounded(browserConn.ready,limits.close,'cdp browser close connection timeout');await bounded(browserConn.send('Browser.close'),limits.close,'cdp browser close command timeout');}catch{}finally{browserConn?.close();}}
  if(child&&!ended){if(!graceful||!await waitExit())kill();await waitExit();}
  if(child&&!ended){const error=Error('CARDINAL_BROWSER_EXIT_TIMEOUT pid='+child.pid+' profile='+dir);error.cleanupFailure={browserPid:child.pid,profile:dir,processClosed:false,reason:'exit-timeout'};throw error;}
  try{await cleanup();}catch(error){error.cleanupFailure={browserPid:child?.pid||null,profile:dir,processClosed:true,reason:'profile-cleanup'};throw error;}})();return disposal;};
 try{
  child=io.spawn(executable,args,{stdio:'ignore',windowsHide:true});
  child.once('close',()=>{ended=true;finishExit();});child.once('error',error=>{spawnError=error;if(!child.pid){ended=true;finishExit();}});
  const until=Date.now()+limits.startup;while(Date.now()<until){try{const [p,b]=io.fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split(/\r?\n/);if(+p){port=+p;browserPath=b;break;}}catch{}if(ended||hasExited()||spawnError)break;await io.sleep(100);}
  if(!port)throw Error('CARDINAL_BROWSER_START'+(spawnError?': '+spawnError.message:''));
  let target=null;const targetUntil=Date.now()+limits.target;while(Date.now()<targetUntil&&!target){try{const remaining=Math.max(1,Math.min(1000,targetUntil-Date.now()));const response=await bounded(io.fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(remaining)}),remaining,'cdp target timeout');const list=await bounded(response.json(),remaining,'cdp target JSON timeout');target=list.find(t=>t.type==='page');}catch{}if(!target)await io.sleep(100);}
  if(!target)throw Error('CARDINAL_BROWSER_TARGET');
  conn=connect(target.webSocketDebuggerUrl);await conn.ready;const page=new Page(conn);await bounded(page.init(viewport),limits.init,'CARDINAL_PAGE_INIT_TIMEOUT');
  return {page,pid:child.pid,close:()=>dispose(true)};
 }catch(error){try{await dispose(false);}catch(cleanupError){const combined=Error(error.message+'; cleanup: '+cleanupError.message,{cause:error});combined.cleanupFailure=cleanupError.cleanupFailure;throw combined;}throw error;}
}
module.exports={launch,findBrowser,Conn};
