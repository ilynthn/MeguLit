// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 owner: 「加个手动重新连接的按钮啊 大哥 而且现在anki软件老是显示出来」.
   1. 复习 → 尚未连接 has 重新连接 Anki: it starts Anki in the background when it is not running, waits about 10 s for
      AnkiConnect, loads the review in that block, and otherwise says why (no Anki, no AnkiConnect, port taken, timeout).
   2. Anki never jumps to the front: MeguLit spawns it hidden, keeps it hidden or puts it in the taskbar minimized without
      activation, never shows or hides an Anki the user opened, and never spawns a second one while one is starting.
   Anki itself is never started here: every process, window and AnkiConnect call is a mock. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {AnkiProcess}=require('../core/anki-process.cjs');
const {cleanV4}=require('../core/v4-config.cjs');

function rig({online=()=>false,running=false,exe='C:\\Anki\\anki.exe',owners=[],hidden=true}={}){
 let t=0,isRunning=running;const spawns=[],modes=[];
 const p=new AnkiProcess({config:()=>cleanV4({ankiPath:exe,ankiHidden:hidden}),anki:{call:async()=>{if(online(t,isRunning))return 6;throw Error('ANKI_OFFLINE');}},
  windowControl:async m=>{modes.push(m);return 1;},portOwners:async()=>owners,running:()=>isRunning,now:()=>t,wait:async ms=>{t+=ms;},
  watcher:()=>({kill(){}}),spawner:(file,args,opts)=>{spawns.push(opts);isRunning=true;const e=new EventEmitter();queueMicrotask(()=>e.emit('spawn'));return e;}});
 p.find=()=>exe;
 return {p,spawns,modes,clock:()=>t};
}

test('重新连接 starts a missing Anki once, hidden, and connects when AnkiConnect answers within 10 s',async()=>{
 const r=rig({online:(t,run)=>run&&t>=3000});
 assert.deepEqual(await r.p.reconnect({hide:true,installed:()=>true}),{connected:true,started:true});
 assert.equal(r.spawns.length,1,'Anki is started exactly once');
 assert.equal(r.spawns[0].windowsHide,true,'started hidden, never in front');
 assert.ok(!r.modes.includes('show'),'never shown');
 assert.ok(r.clock()<=10000);
});

test('重新连接 says why it could not connect',async()=>{
 const missing=rig({exe:''});missing.p.find=()=>'';
 await assert.rejects(missing.p.reconnect({installed:()=>true}),/ANKI_EXECUTABLE_MISSING/);
 await assert.rejects(rig().p.reconnect({installed:()=>false}),/ANKI_CONNECT_MISSING/);
 const taken=rig({owners:[{pid:4242,name:'other.exe',path:'C:\\other.exe'}]});
 await assert.rejects(taken.p.reconnect({installed:()=>true}),/ANKI_PORT_TAKEN/);assert.equal(taken.spawns.length,0,'nothing is started when the port is taken');
 const slow=rig();
 await assert.rejects(slow.p.reconnect({installed:()=>true}),/ANKI_RECONNECT_TIMEOUT/);
 assert.ok(slow.clock()>=10000&&slow.clock()<=11000,'gives up after about 10 s, not the 90 s of a cold start');
 assert.equal(slow.spawns.length,1,'one Anki, not one per retry');
 await assert.rejects(slow.p.reconnect({installed:()=>true}),/ANKI_RECONNECT_TIMEOUT/);
 assert.equal(slow.spawns.length,1,'pressing 重新连接 again while Anki is still starting never spawns a second Anki');
});

test('an Anki the user opened is never shown, raised, hidden or restarted',async()=>{
 const r=rig({running:true,online:(t)=>t>=1000});
 assert.deepEqual(await r.p.reconnect({hide:true,installed:()=>true}),{connected:true,started:false});
 assert.equal(r.spawns.length,0);assert.deepEqual(r.modes,[]);
 const s=rig({running:true,online:(t)=>t>=1500});
 assert.deepEqual(await s.p.start({hide:false}),{running:true,started:false});
 assert.deepEqual(s.modes,[],'start() leaves a user-opened Anki alone');
 assert.equal(await s.p.rehide(),0,'rehide only touches an Anki MeguLit started');assert.deepEqual(s.modes,[]);
});

test('an Anki MeguLit starts with 隐藏 off ends minimized without activation, never shown in front',async()=>{
 const r=rig({hidden:false,online:(t,run)=>run&&t>=2000});
 assert.deepEqual(await r.p.start({hide:false}),{running:true,started:true});
 assert.equal(r.spawns[0].windowsHide,true,'spawned hidden so it never flashes in front while loading');
 assert.equal(r.modes.at(-1),'mini');assert.ok(!r.modes.includes('show'));
 const h=rig({online:(t,run)=>run&&t>=2000});
 await h.p.start({hide:true});
 assert.ok(h.modes.includes('hideall')&&!h.modes.includes('mini')&&!h.modes.includes('show'),'hidden mode stays hidden');
 h.modes.length=0;await h.p.rehide();assert.deepEqual(h.modes,['hideall'],'MeguLit hides its own Anki again after a review action');
});

test('the window helper minimizes with SW_SHOWMINNOACTIVE; the in-game 启动 Anki and the installer go through AnkiProcess',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','core','anki-process.cjs'),'utf8');
 assert.match(src,/else if\(mini\)\{ShowWindow\(h,7\)/,'mini = SW_SHOWMINNOACTIVE (7)');
 const reader=fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8'),launch=reader.slice(reader.indexOf("action==='ankiLaunch'"),reader.indexOf("action==='ankiLaunch'")+600);
 assert.doesNotMatch(launch,/\.show\(\)|windowsHide:false|spawn\(/,'ankiLaunch neither shows Anki nor spawns it visibly');
 assert.match(launch,/ankiProcess\(\)/);
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'..','core','anki-installer.cjs'),'utf8'),/start\(\{hide:false\}\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8'),/case 'anki_reconnect':return await runtime\.ankiProcess\(\)\.reconnect\(/);
});

/* the 复习 tab in headless Edge: 重新连接 loads the review into the Anki block, or says why, and the rest of the page stays */
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));
test('复习 tab: 重新连接 loads the review in place, or shows the reason',{skip:!hasEdge&&'Edge not installed',timeout:120000},async t=>{
 const {startEdge}=require('./library-views-perf.cjs'),http=require('node:http'),WEB=path.join(__dirname,'..','web');
 const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
 const startWeb=()=>new Promise(resolve=>{const sv=http.createServer((q,r)=>{const p=decodeURIComponent(new URL(q.url,'http://x').pathname);const file=path.resolve(WEB,p==='/'?'index.html':p.replace(/^\/+/,''));if(!file.startsWith(WEB+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream'});r.end(fs.readFileSync(file));});sv.listen(0,'127.0.0.1',()=>resolve(sv));});
 const root=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-anki-reconnect-'));
 let server,browser;
 t.after(async()=>{await browser?.stop();server?.close();await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});});
 server=await startWeb();browser=await startEdge(path.join(root,'edge'));
 await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__ctrl={connected:false,reconnect:null,calls:[]};
  window.__TOME_TEST_TRANSPORT__=async(c,a)=>{if(c!=='service')return {};const q=a?.request||{};__ctrl.calls.push(q.action);switch(q.action){
   case 'home':return {games:[],stats:{readingSeconds:0,words:0,lookups:0},preferences:{language:'zh',accent:'#ad1539'}};
   case 'anki_status':return __ctrl.connected?{connected:true,decks:['Default'],defaultDeck:'Default'}:{connected:false,reason:'ANKI_OFFLINE'};
   case 'anki_reconnect':{const r=__ctrl.reconnect;if(r==='ok'){__ctrl.connected=true;return {connected:true};}throw Error(r);}
   case 'anki_current':return {done:true};case 'update_required_status':return null;
   case 'vocabulary':case 'unknown_words':case 'learning_activity':return [];default:return {};}};`});
 await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
 const until=async(expr,label)=>{for(let i=0;i<300;i++){if(await browser.evaluate(expr).catch(()=>false))return;await new Promise(r=>setTimeout(r,50));}throw Error('timed out: '+label);};
 await until("window.__TOME_READY__===true&&!!document.querySelector('[data-route=\"learning\"]')",'boot');
 await browser.evaluate("document.querySelector('[data-route=\"learning\"]').click()");
 await until("!!document.querySelector('#review-content [data-reconnect]')",'尚未连接 with 重新连接');
 const press=async(code)=>{await browser.evaluate(`__ctrl.reconnect=${JSON.stringify(code)};document.querySelector('#review-content [data-reconnect]').click()`);};
 const seen=async()=>browser.evaluate(`({reason:document.querySelector('#review-content [data-anki-reason]')?.textContent||'',button:document.querySelector('#review-content [data-reconnect]')?.textContent||'',
  fix:!!document.querySelector('#review-content [data-connect]'),decks:!!document.querySelector('#review-content .anki-hud,#review-content [data-start]'),tabs:document.querySelectorAll('#main>.tabs [data-tab]').length,sources:!!document.querySelector('[data-review-source="local"]')})`);
 assert.equal((await seen()).button,'重新连接 Anki');
 for(const [code,pattern] of [['ANKI_EXECUTABLE_MISSING',/没有找到 Anki/],['ANKI_CONNECT_MISSING',/AnkiConnect 插件/],['ANKI_PORT_TAKEN',/端口被其他程序占用/],['ANKI_RECONNECT_TIMEOUT',/10 秒/]]){
  await press(code);
  await until(`(document.querySelector('#review-content [data-anki-reason]')?.textContent||'').length>0&&!document.querySelector('#review-content [data-reconnect][aria-busy]')&&__ctrl.reconnect===${JSON.stringify(code)}&&/${pattern.source}/.test(document.querySelector('#review-content [data-anki-reason]').textContent)`,code);
  const s=await seen();
  assert.match(s.reason,pattern,code+' is explained');
  assert.equal(s.fix,code==='ANKI_PORT_TAKEN','the port fix is offered only when the port is taken');
  assert.ok(s.tabs>0&&s.sources,'only the Anki block changes; the page and its tabs stay');
 }
 await press('ok');
 await until("!!document.querySelector('#review-content .anki-hud,#review-content [data-start]')",'review loads after reconnecting');
 const ok=await seen();assert.ok(ok.decks&&ok.tabs>0&&ok.sources);
 assert.ok((await browser.evaluate('__ctrl.calls')).filter(a=>a==='anki_launch'||a==='anki_repair').length===0,'重新连接 never calls the old launch or repair');
});
