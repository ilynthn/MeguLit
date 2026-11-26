'use strict';
/* 2026-11-15 (user: alt+t现在调整位置和尺寸非常卡): dragging the Alt+T panel by its header sends no glass message per frame (each one
   went through Tauri to the bridge and moved its magnifier read) and does not re-place the picture, which rides along
   with the panel's transform; release sends one update. The real reader page runs in headless Edge with a stub Tauri
   transport and a stand-in for the bridge's glass pictures. Skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(cdp,expr,ms=5000)=>{const end=Date.now()+ms;while(Date.now()<end){const v=await cdp.evaluate(expr).catch(()=>false);if(v)return v;await sleep(25);}return false;};
const nextFrame=cdp=>cdp.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const STUB=`<script>window.__sent=[];window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};
  if(r.action==='reader_bootstrap')return {engines:[],native:{}};if(r.action==='reader_message'){window.__sent.push(r.message);return {replies:[]};}return {};}return null;}};</script>`;
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
function serve(){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
 if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}res.writeHead(404);return res.end();}
 let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}

test('Fata keeps the latest sentence in the dialogue box during calibration drags',
 {skip:!hasEdge&&'Edge not installed',timeout:120000}, async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-fata-drag-'));
 let server,cdp;
 try{
  server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  const url=`http://127.0.0.1:${server.address().port}/reader/index.html`;
  const navigation=await cdp.send('Page.navigate',{url});
  assert.ok(!navigation.errorText,`Reader navigation failed (${navigation.errorText})`);
  const ready=await waitFor(cdp,`location.href === ${JSON.stringify(url)} &&
   (window.__TOME_READER_READY__ === true || document.querySelector('#reader-status')?.textContent)`,30000);
  assert.equal(ready,true,ready ? `Reader bootstrap failed (${ready})` : 'Reader bootstrap did not finish');
  await cdp.evaluate(`(()=>{const b=__tomoyoChinese;window.__tomoyoMode.set('translation');
   const diff=${JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT,'The Seed','kirikiri','fata-morgana','game.json'))).settings)};
   window.MeguLitProfile={get:(key,fallback)=>{let v=diff;for(const k of key.split('.'))v=v?.[k];return v??fallback;}};
   b.galStatus({bound:true,interfaceMode:'translation'});
   b.galLayout({clientX:80,clientY:80,clientWidth:800,clientHeight:600,readerX:290,readerY:530,readerWidth:720,readerHeight:130,surfaceWidth:1280,surfaceHeight:800});
   b.restoreGalSettings({display:'bilingual',furigana:false});
   const win=document.createElement('div');win.className='sentence-window tomoyo-hook-reader';win.innerHTML='<div class="sentence-text" data-sequence="1" data-megulit-native-breaks>'+[...${JSON.stringify('だって、わたくし、この時を待ちわびていたのですから……。\n'.repeat(2))}].map(c=>'<span class="char-token">'+c+'</span>').join('')+'</div><div class="tomoyo-cn-row"><span class="tomoyo-cn-output" data-state="ready">'+'我一直在等这一刻的到来。'.repeat(7)+'</span></div>';document.body.append(win);
   b.textPlaceMode({on:true,game:'fata'});b.textPlacePage({engineRows:true,awake:true,armed:true,client:[800,600],lines:[{id:1,text:'前の台詞',rects:[[720,490,20,24]]}]});})()`);
  // The mode cover hides the guide from the region reporter even while its DOM rectangle exists.
  assert.ok(await waitFor(cdp,`document.documentElement.matches('.tomoyo-ui-translation:not(.tome-mode-cover,.tome-mode-in-translation)')`),
   'reader finished switching to translation mode');
  await cdp.evaluate(`__tomoyoChinese.toggleGalMenu();document.querySelector('[data-gal-drag]').click()`);
  const get=()=>cdp.evaluate(`(()=>{const win=document.querySelector('.megulit-dialogue-band'),guide=document.querySelector('.tome-subtitle-drag-guide');
   const sentence=win.querySelector('.sentence-text');
   const first=sentence.querySelector('.char-token').getBoundingClientRect();
   const tokens=[...sentence.querySelectorAll('.char-token')].filter(n=>n.textContent.trim()).map(n=>n.getBoundingClientRect());
   const r=guide.getBoundingClientRect(),box=win.getBoundingClientRect(),cn=win.querySelector('.tomoyo-cn-output');
   const regions=__sent.findLast(m=>m.type==='galHitRegions')?.regions.filter(g=>g.menu)||[];
   return {x:first.left,y:first.top,rows:new Set(tokens.map(p=>Math.round(p.top))).size,
    textRight:Math.max(...tokens.map(p=>p.right)),right:box.right,cnMax:Math.max(...[...cn.getClientRects()].map(p=>p.right)),
    guide:[r.left,r.top,r.width,r.height],dialogue:[box.left,box.top,box.right,box.bottom],
    menuRegions:regions.map(g=>[g.x,g.y,g.x+g.width,g.y+g.height]),
    region:regions.some(g=>g.x<=r.left&&g.y<=r.top&&g.x+g.width>=r.right&&g.y+g.height>=r.bottom)};})()`);
  await nextFrame(cdp);
  const before=await get();assert.ok(before.x>=148&&before.x<=155&&before.textRight<=before.right+1&&before.right<880,JSON.stringify(before));
  assert.ok(before.cnMax<=before.right+1&&before.rows>=2,JSON.stringify(before));
  assert.equal(before.region,true,`native region covers all four sides ${JSON.stringify(before)}`);
  const [l,t,w,h]=before.guide,x=l+Math.min(w/2,18),y=t+Math.min(h/2,15);
  const mouse=(type,x,y,buttons)=>cdp.send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons,clickCount:1});
  await mouse('mouseMoved',x,y,0);await mouse('mousePressed',x,y,1);
  assert.ok(await cdp.evaluate("__sent.findLast(m=>m.type==='galHitRegions')?.regions.some(g=>g.width===1280&&g.height===800)"),'keep the Windows paint region open while the border is moving');
  await mouse('mouseMoved',x-30,y-35,1);await mouse('mouseReleased',x-30,y-35,0);
  // Let the drag preview and the guide repaint run before comparing the released geometry.
  await nextFrame(cdp);
  const after=await get();assert.ok(Math.abs(after.guide[0]-before.guide[0]+30)<2&&Math.abs(after.guide[1]-before.guide[1]+35)<2,JSON.stringify({before,after}));
  assert.ok(Math.abs(after.guide[2]-before.guide[2])<=1,'dragging translates the whole box at its current width');
  assert.equal(after.region,true,`native region covers all four sides after release ${JSON.stringify(after)}`);
  await cdp.evaluate('document.querySelector("[data-gal-drag]").click()');await sleep(100);
  assert.equal(await cdp.evaluate('!!document.querySelector(".tome-subtitle-drag-guide")'),false);
  await cdp.evaluate(`(()=>{const b=__tomoyoChinese;b.restoreGalSettings({anchorDX:0,anchorDY:0});
   b.galLayout({clientX:0,clientY:0,clientWidth:1280,clientHeight:720,readerX:90,readerY:480,readerWidth:1152,readerHeight:192});})()`);
  await sleep(100);
  const fullscreen=await cdp.evaluate(`(()=>{const r=document.querySelector('.megulit-dialogue-band').getBoundingClientRect();return [r.left,r.right,r.bottom];})()`);
  assert.ok(Math.abs(fullscreen[0]-244)<2 && Math.abs(fullscreen[1]-1048)<2 && fullscreen[2]<=720,JSON.stringify(fullscreen));
  const next='わたくしは幸せでございました。';
  await cdp.evaluate(`(()=>{const b=__tomoyoChinese,s=document.querySelector('.megulit-dialogue-band .sentence-text');
   b.textPlace({gone:true,text:s.textContent});b.textPlacePage({engineRows:true,armed:true,awake:false,lines:[],client:[800,600]});
   s.dataset.sequence='2';s.replaceChildren(...[...${JSON.stringify(next)}].map(c=>{const n=document.createElement('span');n.className='char-token';n.textContent=c;return n;}));})()`);
  await sleep(90);
  const current=await cdp.evaluate("(()=>{const w=document.querySelector('.megulit-dialogue-band'),s=w.querySelector('.sentence-text');return [s.textContent,getComputedStyle(s).visibility,w.querySelectorAll('.sentence-text').length];})()");
  assert.deepEqual(current,[next,'visible',1],'a delayed page-clear and old native boxes cannot hide a new recorded sentence');
  await cdp.evaluate(`(()=>{const b=__tomoyoChinese;b.textPlaceMode({on:false});
   b.galLayout({clientX:80,clientY:80,clientWidth:800,clientHeight:600,readerX:120,readerY:540,readerWidth:700,readerHeight:130});})()`);
  await sleep(90);
  await cdp.evaluate(`(()=>{const w=document.querySelector('.tomoyo-hook-reader');
   for(const [key,v] of Object.entries({left:'60px',top:'635px',height:'140px',width:'940px'}))w.style.setProperty(key,v,'important');
   document.querySelector('[data-gal-drag]').click();})()`);
  await sleep(100);
  const generic=await cdp.evaluate(`(()=>{const g=document.querySelector('.tome-subtitle-drag-guide'),r=g.getBoundingClientRect();
   const registered=__sent.findLast(m=>m.type==='galHitRegions')?.regions.some(h=>h.menu&&h.x===r.left&&h.y===r.top&&h.width===r.width&&h.height===r.height);
   return [r.left,r.top,r.right,r.bottom,registered,getComputedStyle(g).borderBottomStyle];})()`);
  assert.deepEqual(generic,[80,635,880,680,true,'dashed'],'all four edges remain in the window region when an ordinary game box extends beyond its client');
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});

test('Alt+T header drag: no glass message or picture re-placement per frame, one update on release',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-altt-drag-'));let server,cdp;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');document.documentElement.dataset.tomeMenuSurface='glass';
   setInterval(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth,surfaceHeight:innerHeight}})),100);window.__tomoyoChinese.toggleGalMenu();
   const c=document.createElement('canvas');c.width=40;c.height=30;c.getContext('2d').fillRect(0,0,40,30);const image=c.toDataURL('image/jpeg').split(',')[1];
   setInterval(()=>{const g=window.__sent.filter(m=>m.type==='galGlass'&&m.rects.length).at(-1);if(g){const r=g.rects[0];window.__tomoyoChinese.glassFrame({type:'glassFrame',x:r.fx,y:r.fy,w:r.fw,h:r.fh,image});}},33);return 1})()`);
  await sleep(2500);
  const STATE=`(()=>{const d=document.querySelector('.tomoyo-cn-dialog[open]'),b=d.querySelector(':scope>.tome-menu-bg>b');return {glass:window.__sent.filter(m=>m.type==='galGlass').length,pos:b.style.backgroundPosition,img:!!b.style.backgroundImage,dragging:d.classList.contains('tome-menu-dragging'),fx:window.__sent.filter(m=>m.type==='galGlass'&&m.rects.length).at(-1)?.rects[0].fx/devicePixelRatio,box:(r=>[r.left,r.top].map(Math.round))(d.getBoundingClientRect())};})()`;
  const [x,y]=await cdp.evaluate(`(()=>{const r=document.querySelector('.tomoyo-cn-dialog[open] .tomoyo-menu-header').getBoundingClientRect();return [Math.round(r.left+r.width/2),Math.round(r.top+r.height/2)]})()`);
  const mouse=(type,a,b)=>cdp.send('Input.dispatchMouseEvent',{type,x:a,y:b,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,pointerType:'mouse'});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await mouse('mousePressed',x,y);
  for(let i=1;i<=5;i++){await mouse('mouseMoved',x-i*4,y+i*2);await sleep(30);}await sleep(400);
  const first=await cdp.evaluate(STATE);assert.ok(first.dragging&&first.img,'dragging with a glass picture: '+JSON.stringify(first));
  for(let i=1;i<=60;i++){await mouse('mouseMoved',x-20-i*8,y+10+i*3);await sleep(16);}
  const mid=await cdp.evaluate(STATE);
  assert.ok(mid.box[0]<first.box[0]-300,'the panel moved: '+JSON.stringify([first.box,mid.box]));
  assert.equal(mid.glass,first.glass,'no glass message while dragging');assert.equal(mid.pos,first.pos,'picture not re-placed while dragging (it moves with the panel)');
  await mouse('mouseReleased',x-500,y+190);await sleep(500);
  const after=await cdp.evaluate(STATE);assert.equal(after.dragging,false);assert.ok(after.glass>mid.glass,'release sends the new glass read');assert.ok(after.fx<first.fx-300,'the read moved with the panel: '+JSON.stringify([first.fx,after.fx]));
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});

test('lookup background stays in the viewport before the scroll event and at the end of the card',
 {skip:!hasEdge&&'Edge not installed',timeout:90000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-lookup-scroll-'));
 let server,cdp;
 try{
  server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/reader/index.html'});
  const ready=await waitFor(cdp,'!!window.__TOME_READER_READY__',30000);
  assert.ok(ready,'reader page loaded: '+await cdp.evaluate('document.querySelector("#reader-status")?.textContent||""').catch(()=>''));
  await cdp.evaluate("(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');document.documentElement.dataset.tomeCardSurface='image';const card=document.createElement('div');card.className='tomoyo-selection-card';card.style.cssText='top:80px;left:100px;width:320px;height:190px';const content=document.createElement('div');content.style.height='760px';content.textContent='Scroll fixture';card.append(content);document.body.append(card);return true})()");
  assert.ok(await waitFor(cdp,"!!document.querySelector('.tomoyo-selection-card .tome-menu-bg')"),'card background mounted');
  await nextFrame(cdp);
  const result=await cdp.evaluate("(()=>{const card=document.querySelector('.tomoyo-selection-card'),bg=card.querySelector('.tome-menu-bg'),content=bg.nextElementSibling,top=content.getBoundingClientRect().top;return [35,200,10000].map(at=>{card.scrollTop=at;const a=card.getBoundingClientRect(),b=bg.getBoundingClientRect();return {offset:b.top-a.top-card.clientTop,height:b.height,viewport:card.clientHeight,contentShift:top-content.getBoundingClientRect().top,scroll:card.scrollTop}})})()");
  for(const sample of result){
   assert.ok(sample.scroll>0);
   assert.equal(sample.contentShift,sample.scroll);
   assert.ok(Math.abs(sample.offset)<1,JSON.stringify(sample));
   assert.equal(sample.height,sample.viewport);
  }
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});

test('lookup drags on the first press and routes wheel input at its new position',
 {skip:!hasEdge&&'Edge not installed',timeout:90000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-lookup-drag-'));
 let server,cdp;
 try{
  server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/reader/index.html'});
  const ready=await waitFor(cdp,'!!window.__TOME_READER_READY__',30000);
  assert.ok(ready,'reader page loaded: '+await cdp.evaluate('document.querySelector("#reader-status")?.textContent||""').catch(()=>''));
  await cdp.evaluate("(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');window.__tomoyoChinese.localLookup=async()=>({entries:[]});window.__tomoyoChinese.openLocalSelection({text:'台詞です',start:0,end:2},{left:innerWidth/2,right:innerWidth/2+30,top:innerHeight*.72,bottom:innerHeight*.72+20,width:30,height:20});return true})()");
  assert.ok(await waitFor(cdp,"!!document.querySelector('.tomoyo-selection-card .tomoyo-selection-body')&&!!document.querySelector('.tomoyo-selection-card>header')"),'selection card rendered');
  await cdp.evaluate("(()=>{const p=document.querySelector('.tomoyo-selection-card'),spacer=document.createElement('div');p.style.height='180px';p.querySelector('header').style.setProperty('padding-top','24px','important');spacer.style.height='1000px';p.querySelector('.tomoyo-selection-body').append(spacer);})()");
  await nextFrame(cdp);
  await cdp.evaluate("(()=>{const p=document.querySelector('.tomoyo-selection-card');p.style.top='';p.style.bottom='180px';})()");
  await nextFrame(cdp);
  const bounds="(()=>{const p=document.querySelector('.tomoyo-selection-card'),r=p.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top)]})()";
  const start=await cdp.evaluate(bounds),[x,y]=await cdp.evaluate("(()=>{const r=document.querySelector('.tomoyo-selection-card>header').getBoundingClientRect();return [Math.round(r.left+r.width/3),Math.round(r.top+8)]})()");
  assert.ok(await cdp.evaluate("parseFloat(document.querySelector('.tomoyo-selection-card').style.bottom)>0"),'fixture starts anchored by its bottom');
  const mouse=(type,x,y,buttons)=>cdp.send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons,clickCount:1});
  const native=(phase,x,y)=>cdp.evaluate(`window.__megulitLookupDrag(${JSON.stringify(phase)},${x},${y})`);
  const grip=await waitFor(cdp,"window.__sent.findLast(m=>m.type==='galHitRegions'&&m.lookupGrip)?.lookupGrip");
  assert.ok(grip&&grip.area.width>0&&grip.controls.length>0,'report the visible grip and its interactive controls to Windows');
  await native('start',x,y);
  assert.deepEqual(await cdp.evaluate(bounds),start,'pressing the header must not clear the card position');
  await cdp.evaluate("(()=>{const extra=document.createElement('div');extra.style.height='38px';document.querySelector('.tomoyo-selection-body').append(extra);})()");
  await nextFrame(cdp);
  assert.deepEqual(await cdp.evaluate(bounds),start,'a dictionary update during the press must not re-anchor the card');
  const reports=()=>cdp.evaluate("window.__sent.filter(m=>m.type==='galHitRegions'&&m.lookupDrag).length");
  const beforeMove=await waitFor(cdp,"window.__sent.filter(m=>m.type==='galHitRegions'&&m.lookupDrag).length");
  assert.ok(beforeMove>0,'expand the paint region on press');
  await mouse('mouseMoved',x+120,y+43,0);
  await cdp.evaluate("dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:1,buttons:0}));dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,buttons:0}));");
  await native('move',x+120,y+43);
  await nextFrame(cdp);
  const moved=await cdp.evaluate(bounds);
  assert.deepEqual(moved,[start[0]+120,start[1]+43],'follow the first drag before any native acknowledgement');
  assert.equal(await reports(),beforeMove,'moving does not rebuild the window region');
  assert.deepEqual(await cdp.evaluate(`(()=>{const p=document.querySelector('.tomoyo-selection-card'),surface=document.elementFromPoint(12,12);
   return [getComputedStyle(surface).cursor,getComputedStyle(p.querySelector('header button')).cursor];})()`),['grabbing','grabbing']);
  await native('end',x+120,y+43);
  assert.ok(await cdp.evaluate("!document.querySelector('.tome-lookup-drag-surface')"));
  const wheel=await cdp.evaluate(`(()=>{const p=document.querySelector('.tomoyo-selection-card'),r=p.getBoundingClientRect();
   __megulitResolveWheel(1,r.right-.5,r.top+.5);__megulitResolveWheel(2,r.right-36,r.top+60);__megulitResolveWheel(3,${start[0]}+8,${start[1]}+8);
   return {targets:window.__sent.filter(m=>m.type==='galWheelDecision').map(m=>m.panel),inside:[r.right-36,r.top+60]};})()`);
  assert.deepEqual(wheel.targets,[true,true,false],'the current card edge and body own the wheel, its old position is outside');
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:wheel.inside[0],y:wheel.inside[1],deltaX:0,deltaY:120});
  assert.ok(await waitFor(cdp,"document.querySelector('.tomoyo-selection-card').scrollTop>0"),'wheel scrolled the card');
  await cdp.evaluate("document.querySelector('.tomoyo-selection-card').scrollTop=0");
  await mouse('mouseMoved',x+220,y+110,0);
  assert.deepEqual(await cdp.evaluate(bounds),moved);
  assert.equal(await cdp.evaluate("!!document.querySelector('[data-lookup-drag]')"),false);
  await mouse('mousePressed',x+120,y+43,1);
  await mouse('mouseReleased',x+147,y+59,0);
  await mouse('mouseMoved',x+250,y+150,0);
  await nextFrame(cdp);
  assert.deepEqual(await cdp.evaluate(bounds),[moved[0]+27,moved[1]+16],'a fast release commits the final pointer coordinates even if no move was relayed');
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});

test('Alt+T switches between stacked and inline Chinese in the current native dialogue', {skip:!hasEdge&&'Edge not installed',timeout:60000}, async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-inline-cn-'));
 let server,cdp;
 try{
  server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  const url=`http://127.0.0.1:${server.address().port}/reader/index.html`;
  const navigation=await cdp.send('Page.navigate',{url});
  assert.ok(!navigation.errorText,`Reader navigation failed (${navigation.errorText})`);
  const ready=await waitFor(cdp,`location.href === ${JSON.stringify(url)} &&
   (window.__TOME_READER_READY__ === true || document.querySelector('#reader-status')?.textContent)`,30000);
  assert.equal(ready,true,ready ? `Reader bootstrap failed (${ready})` : 'Reader bootstrap did not finish');
  await cdp.evaluate(`(()=>{const b=__tomoyoChinese;__tomoyoMode.set('translation');
   b.galStatus({bound:true,interfaceMode:'translation'});
   b.galLayout({clientX:80,clientY:80,clientWidth:800,clientHeight:600,readerX:120,readerY:500,readerWidth:700,readerHeight:140,surfaceWidth:1280,surfaceHeight:800});
   b.restoreGalSettings({display:'bilingual',translationInline:false,translationBlur:true,furigana:false});
   const text='扉を開ける。',win=document.createElement('div');win.className='sentence-window tomoyo-hook-reader';
   win.innerHTML='<div class="sentence-text">'+[...text].map(c=>'<span class="char-token">'+c+'</span>').join('')+'</div><div class="tomoyo-cn-row"><span class="tomoyo-cn-output" data-state="ready">推开房门。</span></div>';
   document.body.append(win);b.textPlaceMode({on:true,game:'test'});
   b.textPlacePage({engineRows:true,awake:true,armed:true,client:[800,600],lines:[{id:1,text,rects:[...text].map((_,i)=>[70+i*26,420,26,26])}]});
   b.toggleGalMenu();})()`);
  const geometry=()=>cdp.evaluate(`(()=>{const w=document.querySelector('.tomoyo-hook-reader'),ja=w.querySelector('.char-token:last-child').getBoundingClientRect(),cn=w.querySelector('.tomoyo-cn-output'),r=cn.getClientRects()[0];return {sameRow:r.top<ja.bottom&&r.bottom>ja.top,after:r.left>=ja.right-1,filter:getComputedStyle(cn).filter,mode:w.classList.contains('megulit-place-window')};})()`);
  await nextFrame(cdp);
  assert.equal((await geometry()).sameRow,false);
  await cdp.evaluate("document.querySelector('[name=galTranslationInline]').click()");await nextFrame(cdp);
  const following=await geometry();assert.equal(following.sameRow,true,JSON.stringify(following));assert.equal(following.after,true,JSON.stringify(following));assert.match(following.filter,/blur\(/);
  await cdp.evaluate(`(()=>{const menu=document.querySelector('.tomoyo-cn-dialog[open]');menu.dataset.menuTab='text';menu.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()`);
  assert.equal(await cdp.evaluate("JSON.parse(localStorage.getItem('tomoyo-gal-settings')).translationInline"),true);
  await cdp.evaluate("document.querySelector('[name=galTranslationInline]').click()");await nextFrame(cdp);
  const restored=await geometry();assert.equal(restored.sameRow,false,JSON.stringify(restored));assert.equal(restored.mode,true);
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
