// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 the tester's one double-click (owner: 测试版打开就要能测：不弹引导、游戏已经在库里、热键不被正式版占着).
   开始测试.cmd beside test-start.json runs this with the test build's own node:
     node test-start.cjs <folder with test-start.json> [--prepare] [--shot <png>] [--close]
   test-start.json: {root: <test MeguLit folder>, exe: <the game copy's exe>, title: <the work's name>, port: <debug port>}
   1. every other MeguLit running on this PC (the installed one, other test builds) is asked to exit through its own command file
      (<its folder>\cache\desktop-command.json {"command":"exit"}: the same thing `MeguLit.exe --stop-instance` sends), so Alt+T / H / M
      are free (READER_HOTKEY_IN_USE otherwise); nothing is killed
   2. the test build starts side by side (MEGULIT_SIDE_BY_SIDE=1, its own MEGULIT_ROOT) with WebView2's debugging port on 127.0.0.1
      (MEGULIT_WEBVIEW_ARGS), the page's own service call adds the game when it is not in the library yet (title = the work's name,
      not the copy's folder name), and the game's own 「开始」 button is clicked: the launch is the app's, with its reader
   --prepare adds the game and leaves the app open without starting the game; --shot saves the page (main UI) as PNG and prints what
   the page shows (first-run dialog, games, the hotkey notice); --close asks the test build to exit at the end. */
const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const same=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();

function running(){const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-CimInstance Win32_Process -Filter \"Name='MeguLit.exe'\" | ForEach-Object { \"$($_.ProcessId)|$($_.ExecutablePath)\" }"],{encoding:'utf8',windowsHide:true,timeout:60000});
 return String(r.stdout||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>{const [pid,...p]=l.split('|');return {pid:Number(pid),exe:p.join('|')};}).filter(x=>x.pid&&x.exe);}
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
function askExit(root){fs.mkdirSync(path.join(root,'cache'),{recursive:true});const f=path.join(root,'cache','desktop-command.json'),tmp=f+'.'+process.pid+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify({command:'exit',nonce:String(Date.now())+String(process.pid)}));fs.renameSync(tmp,f);}
async function closeOthers(own,log){const others=running().filter(p=>!same(path.dirname(p.exe),own));
 for(const p of others){log('# 关掉 '+p.exe+'（pid '+p.pid+'）');try{askExit(path.dirname(p.exe));}catch(e){log('#   没写进命令文件：'+e.message);}}
 const until=Date.now()+20000;while(others.some(p=>alive(p.pid))&&Date.now()<until)await sleep(300);
 const left=others.filter(p=>alive(p.pid));for(const p of left)log('#   '+p.exe+' 20 秒内没退出：请手动关掉它，否则 Alt+T 会被它占着');return {closed:others.length-left.length,left:left.length};}

/* ---- a small DevTools client (WebSocket is global in the test build's node) ---------------------------------------------- */
async function page(port,ms=90000){const until=Date.now()+ms;while(Date.now()<until){try{const list=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const p=list.find(x=>x.type==='page'&&/index\.html|tauri\.localhost|^http:\/\/tauri/.test(x.url))||list.find(x=>x.type==='page');if(p&&p.webSocketDebuggerUrl)return p;}catch{}await sleep(500);}
 throw Error('测试版 90 秒内没打开界面（调试端口 '+port+'）');}
function connect(url){return new Promise((resolve,reject)=>{const ws=new WebSocket(url);let n=0;const wait=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&wait.has(m.id)){wait.get(m.id)(m);wait.delete(m.id);}};ws.onerror=()=>reject(Error('连不上调试端口'));
 ws.onopen=()=>resolve({send:(method,params={})=>new Promise(r=>{const id=++n;wait.set(id,r);ws.send(JSON.stringify({id,method,params}));}),close:()=>ws.close()});});}
async function evaluate(c,expr){const r=await c.send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text);return r.result?.result?.value;}
const service=(c,action,params={})=>evaluate(c,'window.__TAURI_INTERNALS__.invoke("service",{request:'+JSON.stringify({action,...params})+'})');

/* 开始测试.cmd always opens the newest: main or the PR moved -> the build is made again (test-build-fresh.cjs, a new app-<main>-<pr>
   folder; the running one is not touched); a failed check or build starts the old one with a word */
function refresh(dir,cfg,log){const r=cfg.refresh;if(!r||!r.builder||!fs.existsSync(r.builder))return cfg;
 const ls=spawnSync('git',['ls-remote','https://github.com/ilynthn/MeguLit.git','refs/heads/main','refs/pull/'+cfg.pr+'/head'],{encoding:'utf8',windowsHide:true,timeout:60000});
 if(ls.status!==0){log('# 查不到 main / PR 有没有新提交（网络？），照旧打开现在这一版');return cfg;}
 const heads=Object.fromEntries(String(ls.stdout).trim().split('\n').map(l=>l.split('\t').reverse()));
 const main=heads['refs/heads/main'],pr=heads['refs/pull/'+cfg.pr+'/head'];if((!main||main===r.main)&&(!pr||pr===r.pr))return cfg;
 log('# main 或 PR 有新提交，重新做测试版（几分钟）…');const b=spawnSync(process.execPath,[r.builder,'--card',dir],{stdio:'inherit',windowsHide:true,timeout:3600000});
 if(b.status!==0){log('# 新版没做出来，照旧打开现在这一版');return cfg;}
 return JSON.parse(fs.readFileSync(path.join(dir,'test-start.json'),'utf8'));}

async function main(argv){const dir=path.resolve(argv[0]||__dirname);let cfg=JSON.parse(fs.readFileSync(path.join(dir,'test-start.json'),'utf8'));
 if(!argv.includes('--no-refresh'))cfg=refresh(dir,cfg,m=>console.log(m));
 const prepare=argv.includes('--prepare'),shotAt=argv.indexOf('--shot'),shot=shotAt>=0?argv[shotAt+1]:'',closeAtEnd=argv.includes('--close');const log=m=>console.log(m);
 const root=cfg.root,exe=path.join(root,'MeguLit.exe');if(!fs.existsSync(exe))throw Error('找不到测试版 '+exe);if(!fs.existsSync(cfg.exe))throw Error('找不到游戏 '+cfg.exe);
 if(!argv.includes('--keep-others')){log('# 1/3 先正常退出正式版和别的测试版（释放 Alt+T）');await closeOthers(root,log);}
 /* the test build itself: restarted when it runs without the debugging port */
 if(running().some(p=>same(path.dirname(p.exe),root))){let up=false;try{await (await fetch('http://127.0.0.1:'+cfg.port+'/json/version')).json();up=true;}catch{}
  if(!up){log('# 测试版已经开着（没有调试端口），先关掉重开');askExit(root);const until=Date.now()+20000;while(running().some(p=>same(path.dirname(p.exe),root))&&Date.now()<until)await sleep(300);}}
 log('# 2/3 打开测试版 '+root);
 if(!running().some(p=>same(path.dirname(p.exe),root))){const env={...process.env,MEGULIT_SIDE_BY_SIDE:'1',MEGULIT_ROOT:root,MEGULIT_TEST_BUILD:cfg.label||'测试版 · PR #'+(cfg.pr||'?'),MEGULIT_WEBVIEW_ARGS:'--remote-debugging-port='+cfg.port+' --remote-allow-origins=http://127.0.0.1:'+cfg.port};
  spawn(exe,[],{cwd:root,env,detached:true,stdio:'ignore'}).unref();}
 const p=await page(cfg.port),c=await connect(p.webSocketDebuggerUrl);
 try{let home=null;const until=Date.now()+60000;while(Date.now()<until){try{home=await service(c,'home');if(home)break;}catch{}await sleep(1000);}
  if(!home)throw Error('测试版的服务 60 秒内没起来');
  let game=(home.games||[]).find(g=>g.executable&&same(g.executable,cfg.exe));
  if(!game){log('# 游戏库加上「'+cfg.title+'」');await service(c,'save_game',{title:cfg.title,executable:cfg.exe});home=await service(c,'home');game=(home.games||[]).find(g=>g.executable&&same(g.executable,cfg.exe));
   if(!game)throw Error('加进游戏库失败');await evaluate(c,'location.reload(),true');await sleep(3000);}
  else if(game.title!==cfg.title){await service(c,'save_game',{id:game.id,title:cfg.title,executable:cfg.exe});await evaluate(c,'location.reload(),true');await sleep(3000);}
  /* the game's detail page (web/app.js: a click on [data-blank-go="game:<id>"] opens it, the same as the library card) and its
     「开始」 ([data-play] -> startGame, the app's own launch with its reader) */
  const openDetail=()=>evaluate(c,'(()=>{const a=document.createElement("button");a.dataset.blankGo="game:'+game.id+'";a.hidden=true;document.body.append(a);a.click();a.remove();return true;})()');
  const playButton=async(click,ms=30000)=>{const t=Date.now()+ms;while(Date.now()<t){const ok=await evaluate(c,'(()=>{const b=document.querySelector("[data-play]");if(!b||b.disabled)return false;'+(click?'b.click();':'')+'return true;})()');if(ok)return true;await sleep(700);}return false;};
  if(argv.includes('--check-button')){await openDetail();const ok=await playButton(false);
   log(JSON.stringify({playButton:ok,detail:await evaluate(c,'(()=>{const b=document.querySelector("[data-play]");const r=b&&b.getBoundingClientRect();return b?{text:b.innerText.trim(),visible:!!(r&&r.width&&r.height),page:document.querySelector("main")?.className||"",heading:(document.querySelector("main h1,main h2")||{}).innerText||""}:null;})()')}));}
  if(!prepare){log('# 3/3 从测试版启动游戏');await openDetail();const clicked=await playButton(true);
   log(clicked?'# 已点「开始」，游戏会自己打开；测完关掉测试版就行':'# 首页没找到这部游戏的「开始」按钮：请在测试版游戏库里点它');}
  /* --prepare: the app's metadata pass (engine, seed -> 已适配) runs after the add; wait for it so the library is right before anyone tests */
  if(prepare){const t3=Date.now()+120000;while(Date.now()<t3){const g=((await service(c,'home')).games||[]).find(x=>x.executable&&same(x.executable,cfg.exe));if(g&&g.engine&&g.hookSupport!=='unknown')break;await sleep(2000);}
   await evaluate(c,'location.reload(),true');await sleep(4000);}
  if(shot){await sleep(1000);const state=await evaluate(c,`(()=>{const t=document.body.innerText;return {firstRun:!!document.querySelector('dialog.first-run[open]'),hotkeyNotice:/游戏内功能未就绪|READER_HOTKEY_IN_USE/.test(t),title:document.title,label:document.querySelector('.test-build-label')?.textContent||'',updateNotice:!!document.querySelector('.update-notice,[data-update-notice]')}})()`);
   const games=(await service(c,'home')).games||[];const g=games.find(x=>x.executable&&same(x.executable,cfg.exe));
   const r=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(shot,Buffer.from(r.result.data,'base64'));
   log(JSON.stringify({...state,games:games.length,game:g?{id:g.id,title:g.title,engine:g.engine,hookSupport:g.hookSupport}:null,shot}));}}
 finally{c.close();}
 if(closeAtEnd){askExit(root);log('# 已让测试版退出');}
 return 0;}
if(require.main===module)main(process.argv.slice(2)).then(c=>{process.exitCode=c;},e=>{console.error('开始测试失败：'+(e.message||e));process.exitCode=1;});
module.exports={main,askExit,closeOthers,running};
