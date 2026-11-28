/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
/* 2026-11-27 新手引导: the in-game tour shows at the first five game launches and never again, stops at once when skipped or finished,
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
    skip:document.querySelector('.mg-tour-skip')?.textContent||''};})()`);
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
  await cdp.evaluate(`document.querySelector('.mg-tour-skip').click()`);await sleep(80);
  assert.equal(await tour(),null,'gone right after the click');
  assert.equal(await cdp.evaluate(`!!document.querySelector('.tomoyo-cn-dialog[open]')`),false,'the menu the tour did not open stays closed');
  await sleep(600);assert.equal(saved()?.stopped,true,'the choice is in ui-state.json');
  await launch('pid2|b');assert.equal(await tour(),null,'second launch: no tour after skipping');
 });
});

test('the spotlight: the hole sits on each step’s element, click steps go on only from the lit place or the real hotkey, nothing reaches the game',{skip:!hasEdge&&'Edge not installed',timeout:240000},async()=>{
 await withReader(async({cdp,launch,tour,saved})=>{
  await launch('pid1|a');
  const step=async()=>(await tour())?.step;
  /* the hole (the undimmed place) against the element it lights: the capsule reports its drawn shape, others their box */
  const hole=()=>cdp.evaluate(`(()=>{const h=document.querySelector('.mg-tour-hole');if(!h||h.hidden)return null;const sel=h.dataset.target;
   const box=x=>x.id==='mg-cap'?(c=>c&&{left:c.x,top:c.y,right:c.x+c.w,bottom:c.y+c.h,width:c.w,height:c.h})(window.__megulitCapsule.rect()):x.getBoundingClientRect();
   const el=[...document.querySelectorAll(sel)].find(x=>{const b=box(x);return b&&b.width>4&&b.height>4;});const r=h.getBoundingClientRect(),e=el&&box(el);
   const dim=getComputedStyle(h).boxShadow;
   return {sel,exists:!!el,r:{x:r.left,y:r.top,w:r.width,h:r.height},e:e&&{x:e.left,y:e.top,w:e.width,h:e.height},dims:/200vmax|\\d{3,}px/.test(dim),
    next:!document.querySelector('.mg-tour-next').hidden,wait:!document.querySelector('.mg-tour-wait').hidden};})()`);
  /* the hole moves with a short animation and the menu opens with one: wait until it has settled on its element */
  const settled=async name=>{let h;for(let k=0;k<20;k++){h=await hole();if(h&&h.exists&&h.e&&['x','y','w','h'].every(q=>Math.abs(h.r[q]-(h.e[q]+(q==='x'||q==='y'?-6:12)))<=2.5))return h;await sleep(150);}
   assert.fail(name+': the hole is not on its element '+JSON.stringify(h));};
  const click=async(x,y)=>{for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',clickCount:1});await sleep(250);};
  const centre=h=>[h.r.x+h.r.w/2,h.r.y+h.r.h/2];
  const menuOpen=()=>cdp.evaluate(`!!document.querySelector('.tomoyo-cn-dialog[open]')`);
  const altT=async()=>{for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,modifiers:1,key:'t',code:'KeyT',windowsVirtualKeyCode:84});await sleep(500);};
  const lookupOpen=()=>cdp.evaluate(`!!document.querySelector('.tomoyo-selection-card')`);

  /* 1 capsule: a click step */
  assert.equal(await step(),'capsule');let h=await settled('capsule');
  assert.ok(h.dims,'the screen around the hole is dimmed');assert.equal(h.next,false,'no 下一步 before the capsule is clicked');assert.equal(h.wait,true,'the card says what to do');
  const line=await cdp.evaluate(`(()=>{const r=document.querySelector('.sentence-text .char-token').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];})()`);
  await click(...line);assert.equal(await lookupOpen(),false,'a click on the dimmed line looks nothing up');
  await click(60,60);assert.equal(await step(),'capsule','a click on the dim does not move on');assert.equal(await menuOpen(),false);
  await click(...centre(h));await sleep(700);
  assert.equal(await menuOpen(),true,'clicking the lit capsule opens the menu');assert.equal(await step(),'hotkey','and the tour moves on');

  /* 2 hotkey: only the real hotkey moves on; the lit capsule is not clickable here */
  h=await settled('hotkey');assert.equal(h.next,false);
  await click(...centre(h));assert.equal(await menuOpen(),true,'the lit place does not take clicks in the hotkey step');assert.equal(await step(),'hotkey');
  assert.match((await tour()).body,/Alt\+T/,'the hotkey named by MeguLitHotkeys');
  await cdp.evaluate(`(()=>{window.__realHotkeys=window.MeguLitHotkeys;window.MeguLitHotkeys={label:a=>({menu:'Ctrl+Q',cover:'Ctrl+W'})[a]||''};dispatchEvent(new Event('megulit-hotkeys-changed'));return 1;})()`);
  await sleep(200);const changed=await tour();assert.match(changed.body,/Ctrl\+Q[\s\S]*Ctrl\+W/,'a rebound hotkey shows at once');assert.doesNotMatch(changed.body,/Alt\+T|Alt\+H/,'no hotkey written into the words');
  await cdp.evaluate(`(()=>{window.MeguLitHotkeys=window.__realHotkeys;dispatchEvent(new Event('megulit-hotkeys-changed'));return 1;})()`);
  await altT();assert.equal(await menuOpen(),false,'Alt+T closes the menu');assert.equal(await step(),'hotkey','one press is not enough');
  await altT();assert.equal(await menuOpen(),true,'Alt+T opens it again');await sleep(500);assert.equal(await step(),'pages','the real hotkey moved the tour on');

  /* 3 pages: an explaining step, 下一步 moves on; 上一步 goes back to a done step without asking again */
  h=await settled('pages');assert.equal(h.next,true);
  await cdp.evaluate(`document.querySelector('.mg-tour-prev').click()`);await sleep(400);assert.equal(await step(),'hotkey');assert.equal((await hole()).next,true,'a step already done keeps 下一步');
  await cdp.evaluate(`document.querySelector('.mg-tour-next').click()`);await sleep(400);assert.equal(await step(),'pages');
  await cdp.evaluate(`document.querySelector('.mg-tour-next').click()`);await sleep(600);

  /* 4 text: click the lit 文字 tab; the hole then moves to the text settings */
  assert.equal(await step(),'text');h=await settled('text tab');assert.match(h.sel,/data-menu-key="text"/);assert.equal(h.next,false);
  const other=await cdp.evaluate(`(()=>{const r=document.querySelector('.tomoyo-cn-dialog[open] [data-menu-key="voice"]').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];})()`);
  await click(...other);assert.notEqual(await cdp.evaluate(`document.querySelector('.tomoyo-cn-dialog[open]').dataset.menuTab`),'voice','a dimmed tab does not take the click');
  await click(...centre(h));
  assert.equal(await cdp.evaluate(`document.querySelector('.tomoyo-cn-dialog[open]').dataset.menuTab`),'text','the lit tab took the click');
  h=await settled('text settings');assert.match(h.sel,/mg-subtabs|menu-content/,'the hole moved to the text settings');assert.equal(h.next,true);
  await cdp.evaluate(`document.querySelector('.mg-tour-next').click()`);await sleep(600);

  /* 5 lookup, 6 help: explaining steps */
  assert.equal(await step(),'lookup');h=await settled('lookup');assert.match(h.sel,/sentence-text/);
  await cdp.evaluate(`document.querySelector('.mg-tour-next').click()`);await sleep(700);
  assert.equal(await step(),'help');h=await settled('help');assert.match(h.sel,/data-menu-key="calibrate"/);
  const t=await tour();assert.equal(t.dots,6);assert.match(t.img,/assets\/onboarding\/help\.webp$/);
  assert.ok(await cdp.evaluate(`(async()=>{const i=document.querySelector('.mg-tour-shot img');if(!i.complete)await new Promise(r=>{i.onload=i.onerror=r;});return i.naturalWidth>300;})()`),'the picture loads');
  assert.ok(await cdp.evaluate(`(()=>{const c=document.querySelector('.mg-tour-card').getBoundingClientRect(),d=document.querySelector('.tomoyo-cn-dialog[open]').getBoundingClientRect();return c.left>=0&&c.top>=0&&c.right<=innerWidth&&c.bottom<=innerHeight&&(c.right<=d.left||c.left>=d.right);})()`),'the card is on screen and beside the menu');
  await cdp.evaluate(`document.querySelector('.mg-tour-next').click()`);await sleep(700);
  assert.equal(await tour(),null,'开始玩 closes the tour');assert.equal(await menuOpen(),false,'and the menu opened during the tour');
  await sleep(600);assert.equal(saved()?.stopped,true,'a finished tour is stopped like a skipped one');
  await launch('pid2|b');assert.equal(await tour(),null,'second launch after finishing: no tour');

  /* Alt+T menu → 教程 opens it again, also after the five launches are used up */
  await cdp.evaluate(`(()=>{localStorage.setItem('tomoyo-onboarding',JSON.stringify({shown:5,stopped:true,seen:true}));window.__tomoyoChinese.toggleGalMenu();return 1;})()`);await sleep(1200);
  assert.ok(await cdp.evaluate(`!!document.querySelector('.tomoyo-cn-dialog[open] #mg-menu-tour')`),'the menu has a 教程 button');
  await cdp.evaluate(`document.querySelector('.tomoyo-cn-dialog[open] #mg-menu-tour').click()`);await sleep(900);
  assert.equal(await step(),'capsule','教程 in the Alt+T menu starts the tour again');
  assert.equal((await hole()).next,true,'with the menu already open the capsule step is done');
 });
});

test('the 教程 button in the Alt+T menu carries a red dot until the tour has been seen once',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 await withReader(async({cdp,launch,saved})=>{
  await launch('pid1|a',{before:"localStorage.setItem('tomoyo-onboarding',JSON.stringify({shown:5}));"});
  await cdp.evaluate(`(()=>{window.__tomoyoChinese.toggleGalMenu();return 1;})()`);await sleep(1200);
  const dot=()=>cdp.evaluate(`(()=>{const b=document.querySelector('.tomoyo-cn-dialog[open] #mg-menu-tour');if(!b)return null;const a=getComputedStyle(b.querySelector('span'),'::after');return {data:b.hasAttribute('data-new'),painted:a.content!=='none'&&parseFloat(a.width)>0,label:b.textContent.trim(),h:b.getBoundingClientRect().height};})()`);
  let d=await dot();assert.ok(d,'教程 button');assert.equal(d.label,'教程');assert.ok(d.data&&d.painted,'red dot before the tour was ever seen');assert.ok(d.h<=26,'a slim button, about the height of ×');
  await cdp.evaluate(`document.querySelector('#mg-menu-tour').click()`);await sleep(700);
  d=await dot();assert.equal(d.data,false,'the dot goes once the tour is on screen');await sleep(600);assert.equal(saved()?.seen,true,'remembered in ui-state.json');
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

test('the launch count and the pictures: five launches, a repeated status counts once, skip and replay, a picture per step and language',()=>{
 const O=require('../web/onboarding-steps.js');
 let s={};const shown=[];for(const id of ['a','a','b','c','d','e','f']){const r=O.launch(s,id);shown.push(r.show);s=r.state;}
 assert.deepEqual(shown,[true,false,true,true,true,true,false]);assert.equal(s.shown,5);
 assert.equal(O.launch(O.stop({}),'x').show,false,'skipped before the first count: never');
 const again=O.launch(O.replay(O.stop({shown:5})),'y');assert.deepEqual([again.show,again.state.replay,again.state.shown],[true,false,5],'a replay shows once without counting');
 assert.deepEqual(O.clean('{"shown":99,"stopped":"yes"}'),{shown:5,stopped:false,last:'',replay:false,seen:false},'bad stored values are cleaned');
 for(const s of O.STEPS)for(const l of ['zh','en','ja']){const f=path.join(WEB,'assets','onboarding',O.image(s.image,l));assert.ok(fs.existsSync(f)&&fs.statSync(f).size>1500,s.id+' '+l+' picture');
  assert.ok(O.TEXT[l].steps[s.id][0]&&O.TEXT[l].steps[s.id][1],s.id+' '+l+' words');}
});
