'use strict';
/* 2026-11-15 (user video, "alt+t面板尺寸调整问题非常大"): resizing the Alt+T panel by an edge left blank areas, cut the
   footer off, flashed and made the panel jump. The window region was rebuilt from the panel on every frame of the
   resize (the bridge cannot keep up, so the visible part lagged the panel), and the frosted-glass picture only covered
   the old box. Now an edge resize holds one whole-layer region and one glass read that reaches the dragged screen edges,
   lays out once per frame, and keeps size and position. The real reader page runs in headless Edge with a stub Tauri
   transport that records every reader_message. Skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
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
const OPEN=`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const b=window.__tomoyoChinese;
 if(document.querySelector('.tomoyo-cn-dialog[open]')){b.toggleGalMenu();await w(700);}
 setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);
 b.toggleGalMenu();await w(300);
 /* wait until the panel has finished opening (CI runners are slow: a fixed wait read the box mid-animation, so the press missed the corner) */
 let box='',same=0;for(let i=0;i<100&&same<3;i++){const d=document.querySelector('.tomoyo-cn-dialog[open]');const r=d&&d.getBoundingClientRect(),k=r?[r.left,r.top,r.right,r.bottom].map(Math.round).join():'';
  const moving=d&&d.getAnimations({subtree:true}).some(a=>a.playState==='running'&&a.effect?.getTiming?.().iterations!==Infinity);same=k&&k===box&&!moving?same+1:0;box=k;await w(100);}
 const d=document.querySelector('.tomoyo-cn-dialog[open]'),r=d.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom].map(Math.round);})()`;
const AT=(x,y)=>`(()=>{const n=document.elementFromPoint(${x},${y});return n&&n.classList.contains('tomoyo-menu-resize')?n.dataset.edge:(n?n.tagName+'.'+n.className:'')})()`;
const STATE=`(()=>{const d=document.querySelector('.tomoyo-cn-dialog[open]'),q=n=>{const r=n.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom].map(Math.round);},c=d.querySelector('.tomoyo-menu-content');
 const hits=window.__sent.filter(m=>m.type==='galHitRegions'),glass=window.__sent.filter(m=>m.type==='galGlass'&&m.rects.length);
 return {panel:q(d),footer:q(d.querySelector('form>footer')),content:q(c),scroll:[c.scrollHeight,c.clientHeight,getComputedStyle(c).overflowY],region:hits.at(-1)?.regions,glass:glass.at(-1)?.rects[0],glassCount:glass.length,vw:innerWidth,vh:innerHeight,
  resizing:d.classList.contains('tomoyo-menu-resizing')};})()`;

test('Alt+T edge resize: whole-layer region and glass during the drag, footer pinned, min size, size and position kept',{skip:!hasEdge&&'Edge not installed',timeout:180000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-altt-resize-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  /* translation layer with a glass menu surface: the bridge's glass read follows the reported boxes */
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');document.documentElement.dataset.tomeMenuSurface='glass';return 1})()`);
  const mouse=(type,x,y)=>cdp.send('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,pointerType:'mouse'});
  const start=await cdp.evaluate(OPEN);
  /* the south-west corner: grows left and down, so the right edge must stay put */
  let x=start[0]+8,y=start[3]-8;assert.equal(await cdp.evaluate(AT(x,y)),'sw','the press lands on the south-west handle');await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await mouse('mousePressed',x,y);
  const during=[];
  for(let i=1;i<=24;i++){await mouse('mouseMoved',x-i*25,y+i*8);await sleep(20);if(i%4===0)during.push(await cdp.evaluate(STATE));}
  for(let i=1;i<=40;i++){await mouse('mouseMoved',x-600+i*40,y+192-i*30);await sleep(20);if(i%5===0)during.push(await cdp.evaluate(STATE));}
  await mouse('mouseReleased',x+1000,y-1000);await sleep(400);const after=await cdp.evaluate(STATE);
  for(const s of during){
   assert.ok(s.resizing,'resizing while the pointer is down');
   assert.deepEqual(s.region,[{x:0,y:0,width:s.vw,height:s.vh,menu:true}],'one whole-layer region during the resize: '+JSON.stringify(s.region));
   /* 2026-11-15 (user: alt+t现在调整位置和尺寸非常卡): the glass read is set once per gesture (no galGlass per frame) and reaches
      the screen edge on the dragged sides (west and south here), so the growing panel always has a picture */
   assert.deepEqual(s.glass,during[0].glass,'one glass read for the whole gesture: '+JSON.stringify(s.glass));assert.equal(s.glassCount,during[0].glassCount,'no glass message per frame');
   assert.ok(s.glass&&s.glass.fx===0&&s.glass.fy+s.glass.fh===s.vh&&s.glass.fx+s.glass.fw>=start[2],'glass read covers the dragged sides: '+JSON.stringify(s.glass));
   assert.equal(s.panel[2],start[2],'the opposite (right) edge stays put');
   assert.equal(s.footer[3],s.panel[3]-1,'footer pinned to the panel bottom');assert.ok(s.footer[1]>s.content[1],'footer below the content');
   assert.ok(s.content[3]<=s.footer[1],'content ends above the footer');
  }
  assert.equal(after.resizing,false);
  assert.equal(after.panel[2]-after.panel[0],440,'minimum width');assert.ok(after.panel[3]-after.panel[1]>=460,'minimum height '+(after.panel[3]-after.panel[1]));
  assert.ok(after.scroll[0]>after.scroll[1]&&/auto|scroll/.test(after.scroll[2]),'content scrolls at the minimum: '+after.scroll);
  assert.deepEqual(after.region.filter(r=>r.menu),[{x:after.panel[0],y:after.panel[1],width:after.panel[2]-after.panel[0],height:after.panel[3]-after.panel[1],menu:true}],'release: region is the panel again');
  assert.equal(after.footer[3],after.panel[3]-1);
  /* grow again by the west edge (the panel sits against the right of the layer), release, close and reopen: same box */
  x=after.panel[0]+3;y=Math.round((after.panel[1]+after.panel[3])/2);assert.equal(await cdp.evaluate(AT(x,y)),'w','the press lands on the west handle');await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await mouse('mousePressed',x,y);
  for(let i=1;i<=10;i++){await mouse('mouseMoved',x-i*20,y);await sleep(20);}await mouse('mouseReleased',x-200,y);await sleep(400);
  const grown=await cdp.evaluate(STATE);assert.equal(grown.panel[2]-grown.panel[0],640,'west edge grew the panel by 200 px');assert.equal(grown.panel[2],after.panel[2],'right edge kept');
  const reopened=await cdp.evaluate(OPEN);assert.deepEqual(reopened,grown.panel,'size and position kept after reopening');
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
