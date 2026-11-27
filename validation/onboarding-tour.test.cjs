/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
/* 2026-11-27 新手引导: the in-game tour shows at the first five game launches and never again, stops at once when skipped,
   lights a real element of the reader at every step, names hotkeys through MeguLitHotkeys.label, and can be opened again
   from the main window's top bar (教程) and from the Alt+T menu. The real reader page and the real main window (with the
   real local service on a temporary root) run in headless Edge; ui-state.json is the only memory between launches, as in
   the app, because every reader page starts with an empty localStorage here. Skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge,startService,startWeb}=require('./library-views-perf.cjs');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json','.webp':'image/webp','.png':'image/png'};

/* The reader page with a stand-in for the desktop host: ui_state / preserve_ui read and write a ui-state.json on disk
   (the same file the service keeps), everything else answers empty. new_game_tip is off so the per-work tip stays out of the way. */
function readerServer(uiFile){
 const STUB=`<script>try{localStorage.clear();}catch{}window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};
  if(r.action==='ui_state')return await fetch('/__ui').then(x=>x.json());
  if(r.action==='preserve_ui'){await fetch('/__ui',{method:'POST',body:JSON.stringify(r.values||{})});return {};}
  if(r.action==='reader_bootstrap')return {engines:[],native:{new_game_tip:false}};if(r.action==='reader_message')return {replies:[]};return {};}return null;}};</script>`;
 const server=http.createServer(async(req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname);
  if(rel==='/__ui'){if(req.method==='POST'){let body='';for await(const c of req)body+=c;fs.writeFileSync(uiFile,body);res.writeHead(200);return res.end('{}');}
   res.writeHead(200,{'content-type':'application/json'});return res.end(fs.existsSync(uiFile)?fs.readFileSync(uiFile):'{}');}
  const file=path.join(WEB,rel);
  if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}res.writeHead(404);return res.end();}
  let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
  res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));
}
async function withReader(fn){
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-tour-')),uiFile=path.join(temp,'ui-state.json');let server,cdp;
 try{server=await readerServer(uiFile);cdp=await startEdge(path.join(temp,'edge'));
  const url=`http://127.0.0.1:${server.address().port}/reader/index.html`;
  /* one game launch: a fresh reader page (empty localStorage), bound, a line on screen, then the status that names the launch */
  const launch=async(identity,{before=''}={})=>{await cdp.send('Page.navigate',{url});
   let ready=false;for(let i=0;i<160&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
   assert.ok(ready,'reader page loaded');
   await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');/* no real game here: keep the page bound */setInterval(()=>document.body.classList.add('tomoyo-gal-bound'),50);
    const line=document.querySelector('.sentence-window .sentence-text');line.innerHTML='<span class="char-token">今日は</span><span class="char-token">、いい</span><span class="char-token">天気ですね。</span>';
    setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);${before}
    const s={gameStyleState:'profile',gameStyleKey:'a'.repeat(64),gameStyleIdentity:${JSON.stringify(identity)},gameStyleGameName:'Test'};
    window.__tomoyoChinese.gameStyleStatus(s);setTimeout(()=>window.__tomoyoChinese.gameStyleStatus(s),300);return 1;})()`);
   await sleep(2200);};
  const tour=()=>cdp.evaluate(`(()=>{const c=document.querySelector('.mg-tour-card');if(!c||!c.getClientRects().length)return null;
   return {step:c.dataset.step,title:c.querySelector('.mg-tour-title')?.textContent||'',body:c.querySelector('.mg-tour-body')?.textContent||'',
    img:c.querySelector('.mg-tour-shot img')?.getAttribute('src')||'',dots:c.querySelectorAll('.mg-tour-dots i').length,
    skip:c.querySelector('.mg-tour-skip')?.textContent||''};})()`);
  const saved=()=>{try{return JSON.parse(JSON.parse(fs.readFileSync(uiFile,'utf8'))['tomoyo-onboarding']||'null');}catch{return null;}};
  await fn({cdp,launch,tour,saved,uiFile});
 }finally{await cdp?.stop();server?.close();await sleep(300);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
}

test('the tour shows at the first five game launches, once per launch, and not at the sixth',{skip:!hasEdge&&'Edge not installed',timeout:240000},async()=>{
 await withReader(async({cdp,launch,tour,saved})=>{
  for(let n=1;n<=6;n++){
   await launch('pid'+n+'|2026-11-27T10:0'+n);
   const t=await tour();
   if(n<=5){assert.ok(t,'launch '+n+': the tour is on screen');assert.equal(t.step,'capsule','launch '+n+' starts at the first step');
    assert.equal(saved()?.shown,n,'launch '+n+' is counted once in ui-state.json although its status came twice');
    }
   else{assert.equal(t,null,'launch 6: no tour');assert.equal(saved()?.shown,5);}
  }
 });
});

test('skip stops the tour at once and for good',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 await withReader(async({cdp,launch,tour,saved})=>{
  await launch('pid1|a');const t=await tour();assert.ok(t,'first launch shows the tour');assert.match(t.skip,/跳过教程/);
  await cdp.evaluate(`document.querySelector('.mg-tour-card .mg-tour-skip').click()`);await sleep(80);
  assert.equal(await tour(),null,'gone right after the click');
  assert.equal(await cdp.evaluate(`!!document.querySelector('.tomoyo-cn-dialog[open]')`),false,'the menu the tour did not open stays closed');
  await sleep(600);assert.equal(saved()?.stopped,true,'the choice is in ui-state.json');
  await launch('pid2|b');assert.equal(await tour(),null,'second launch: no tour after skipping');
 });
});

test('every step lights a real element on screen, names the hotkeys from MeguLitHotkeys, and has a picture',{skip:!hasEdge&&'Edge not installed',timeout:180000},async()=>{
 await withReader(async({cdp,launch,tour})=>{
  /* a user who moved the menu to Ctrl+Q: the tour says Ctrl+Q, not Alt+T */
  await launch('pid1|a',{before:"window.MeguLitHotkeys={label:a=>({menu:'Ctrl+Q',cover:'Ctrl+W'})[a]||''};"});
  const seen=[];
  for(let i=0;i<6;i++){
   await sleep(900);const t=await tour();assert.ok(t,'step '+i+' on screen');seen.push(t.step);
   assert.equal(t.dots,6,'six progress dots');assert.ok(t.title.length>1&&t.body.length>8,'step '+t.step+' has words');
   assert.match(t.img,/assets\/onboarding\/[a-z]+\.webp$/,'step '+t.step+' has a picture');
   assert.ok(await cdp.evaluate(`(async()=>{const i=document.querySelector('.mg-tour-shot img');if(!i.complete)await new Promise(r=>{i.onload=i.onerror=r;});return i.naturalWidth>300;})()`),t.step+': the picture loads');
   assert.doesNotMatch(t.body,/Alt\+T|Alt\+H/,'step '+t.step+': no hotkey written into the text');
   if(t.step==='hotkey')assert.match(t.body,/Ctrl\+Q[\s\S]*Ctrl\+W/,'the hotkey step names the user’s keys');
   /* the menu opens with a short animation and the light follows it: give it up to 3 s to settle */
   const probe=()=>cdp.evaluate(`(()=>{const out=[];for(const ring of document.querySelectorAll('.mg-tour-ring')){const sel=ring.dataset.target,all=sel?[...document.querySelectorAll(sel)]:[];
     /* the capsule is laid out at its open size and clipped: its drawn shape is what the capsule reports */
     const box=x=>x.id==='mg-cap'?(c=>c&&{left:c.x,top:c.y,right:c.x+c.w,bottom:c.y+c.h,width:c.w,height:c.h})(window.__megulitCapsule.rect()):x.getBoundingClientRect();
     const el=all.find(x=>{const b=box(x);return b&&b.width>4&&b.height>4;})||all[0];
     const r=ring.getBoundingClientRect(),e=el&&box(el);const visible=!!e&&e.width>4&&e.height>4&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[hidden]');
     out.push({sel,exists:!!el,visible,covers:!!e&&r.left<=e.left+2&&r.top<=e.top+2&&r.right>=e.right-2&&r.bottom>=e.bottom-2&&r.width<=e.width+40&&r.height<=e.height+40});}return out;})()`);
   let lit=await probe();for(let k=0;k<10&&!(lit.length&&lit.every(x=>x.exists&&x.visible&&x.covers));k++){await sleep(300);lit=await probe();}
   assert.ok(lit.length>=1,t.step+': something is lit');
   for(const x of lit){assert.ok(x.exists,t.step+': '+x.sel+' exists');assert.ok(x.visible,t.step+': '+x.sel+' is on screen');assert.ok(x.covers,t.step+': the light sits on '+x.sel);}
   const card=await cdp.evaluate(`(()=>{const c=document.querySelector('.mg-tour-card').getBoundingClientRect();return c.left>=0&&c.top>=0&&c.right<=innerWidth&&c.bottom<=innerHeight;})()`);
   assert.ok(card,t.step+': the card is inside the window');
   if(t.step==='text')assert.equal(await cdp.evaluate(`document.querySelector('.tomoyo-cn-dialog[open]')?.dataset.menuTab`),'text','the text step shows the 文字 page');
   if(i===1){await cdp.evaluate(`document.querySelector('.mg-tour-prev').click()`);await sleep(500);assert.equal((await tour()).step,'capsule','back goes one step back');
    await cdp.evaluate(`document.querySelector('.mg-tour-next').click()`);await sleep(500);}
   if(i<5)await cdp.evaluate(`document.querySelector('.mg-tour-next').click()`);
  }
  assert.deepEqual(seen,['capsule','hotkey','pages','text','lookup','help']);
  /* the last step's next ends the tour and closes the menu the tour opened */
  await cdp.evaluate(`document.querySelector('.mg-tour-next').click()`);await sleep(700);
  assert.equal(await tour(),null,'done closes the tour');
  assert.equal(await cdp.evaluate(`!!document.querySelector('.tomoyo-cn-dialog[open]')`),false,'the menu the tour opened is closed again');
  /* Alt+T menu → 教程 opens it again, also after the five launches are used up */
  await cdp.evaluate(`(()=>{localStorage.setItem('tomoyo-onboarding',JSON.stringify({shown:5,stopped:true}));window.__tomoyoChinese.toggleGalMenu();return 1;})()`);await sleep(1200);
  assert.ok(await cdp.evaluate(`!!document.querySelector('.tomoyo-cn-dialog[open] .tome-menu-tour')`),'the menu has a 教程 button');
  await cdp.evaluate(`document.querySelector('.tomoyo-cn-dialog[open] .tome-menu-tour').click()`);await sleep(900);
  assert.equal((await tour())?.step,'capsule','教程 in the Alt+T menu starts the tour again');
 });
});

test('the top bar 教程 opens the illustrated tour, and asking for it in the game brings it back after skipping',{skip:!hasEdge&&'Edge not installed',timeout:240000},async()=>{
 const root=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-tour-main-'));fs.mkdirSync(path.join(root,'data'),{recursive:true});
 const uiFile=path.join(root,'data','ui-state.json');fs.writeFileSync(uiFile,JSON.stringify({'tomoyo-onboarding':JSON.stringify({shown:2,stopped:true,last:'pid0|x'})}));
 let service,web,cdp;
 try{service=startService(root);web=await startWeb(service);cdp=await startEdge(path.join(root,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${web.address().port}/#%7B%7D`});
  let ok=false;for(let i=0;i<120&&!ok;i++){await sleep(250);ok=await cdp.evaluate('!!document.querySelector("[data-top-guide]")').catch(()=>false);}
  assert.ok(ok,'main window with its top bar');await sleep(1500);
  await cdp.evaluate(`(()=>{document.querySelectorAll('dialog').forEach(d=>{try{d.close();}catch{}d.remove();});return 1;})()`);await sleep(300);
  await cdp.evaluate(`document.querySelector('[data-top-guide]').click()`);await sleep(900);
  const gallery=()=>cdp.evaluate(`(()=>{const g=document.querySelector('dialog[open] .tour-gallery');if(!g||!g.getClientRects().length)return null;
   const img=g.querySelector('.tour-gallery-shot img');return {step:g.dataset.step,title:g.querySelector('.tour-gallery-title')?.textContent||'',body:g.querySelector('.tour-gallery-body')?.textContent||'',
    img:img?.getAttribute('src')||'',loaded:!!img&&img.complete&&img.naturalWidth>300,dots:g.querySelectorAll('.tour-gallery-dots button').length};})()`);
  let g=await gallery();assert.ok(g,'教程 in the top bar shows the illustrated tour');assert.equal(g.step,'capsule');assert.equal(g.dots,6);
  for(let i=0;i<20&&!g.loaded;i++){await sleep(150);g=await gallery();}assert.ok(g.loaded,'its picture loads');
  assert.match(g.body,/MeguLit/);
  await cdp.evaluate(`document.querySelector('dialog[open] .tour-gallery [data-tour-next]').click()`);await sleep(200);
  g=await gallery();assert.equal(g.step,'hotkey','next turns the page');assert.match(g.body,/Alt\+T/,'default hotkey name from MeguLitHotkeys');
  await cdp.evaluate(`document.querySelector('dialog[open] .tour-gallery-dots button:nth-child(5)').click()`);await sleep(200);
  assert.equal((await gallery()).step,'lookup','a dot jumps to its step');
  await cdp.evaluate(`document.querySelector('dialog[open] [data-tour-replay]').click()`);
  let state=null;for(let i=0;i<40&&!state?.replay;i++){await sleep(150);try{state=JSON.parse(JSON.parse(fs.readFileSync(uiFile,'utf8'))['tomoyo-onboarding']);}catch{}}
  assert.equal(state?.replay,true,'再带我走一遍 is saved in ui-state.json for the next game');
  assert.equal(state?.shown,2,'the launch count is kept');
 }finally{await cdp?.stop();web?.close();await service?.stop();await sleep(400);try{fs.rmSync(root,{recursive:true,force:true});}catch{}}
 /* that ui-state.json at the next launch: the tour shows although it was skipped before, and only that once */
 await withReader(async({cdp,launch,tour,saved,uiFile:file})=>{
  fs.writeFileSync(file,JSON.stringify({'tomoyo-onboarding':JSON.stringify({shown:2,stopped:true,last:'pid0|x',replay:true})}));
  await launch('pid1|a');assert.equal((await tour())?.step,'capsule','the asked-for replay shows');
  await sleep(700);
  assert.deepEqual({replay:saved()?.replay,stopped:saved()?.stopped,shown:saved()?.shown},{replay:false,stopped:true,shown:2},'a replay is used once and does not count');
  await launch('pid2|b');assert.equal(await tour(),null,'and the next launch stays quiet');
 });
});
