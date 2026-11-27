/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Owner beta test on ISLAND (11-28): the Alt+T capsule can be dragged out of the game window and floats there; the spot is
   remembered, it docks again when dragged back or from Alt+T → 外观, and it stays on the screen. The pure placement runs
   everywhere; the page part runs in headless Edge when playwright-core is there. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),core=require('../web/reader/modules/capsule.js');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const game={x:200,y:120,w:880,h:500},screen={x:0,y:0,w:1920,h:1080};

test('a handle dropped outside the game floats at that spot; one dropped on the game docks',()=>{
 assert.deepEqual(core.dropAt({x:1300,y:400,w:140,h:32},game,screen),{out:true,x:1300,y:400},'right of the game');
 assert.deepEqual(core.dropAt({x:40,y:30,w:140,h:32},game,screen),{out:true,x:40,y:30},'above and left of the game');
 assert.deepEqual(core.dropAt({x:600,y:300,w:140,h:32},game,screen),{out:false},'on the game');
 assert.deepEqual(core.dropAt({x:1010,y:300,w:140,h:32},game,screen),{out:false},'half over the right edge with its centre still inside');
 assert.deepEqual(core.dropAt({x:1020,y:300,w:140,h:32},game,screen),{out:true,x:1020,y:300},'centre just past the edge');
});

test('a floating capsule is kept on the screen, with room for its open shape',()=>{
 const size={w:140,h:32};
 assert.deepEqual(core.placeOut({x:1300,y:400},size,screen),{x:1300,y:400,fits:true,out:true});
 assert.deepEqual(core.placeOut({x:5000,y:-40},size,screen),{x:1920-10-140,y:10,fits:true,out:true},'saved on a bigger desktop, now clamped');
 const open={w:520,h:44,ax:190,ay:6},p=core.placeOut({x:1900,y:1070},size,screen,open);
 assert.ok(p.x-open.ax>=10&&p.x-open.ax+open.w<=1910,'the open island stays on screen: '+JSON.stringify(p));
 assert.ok(p.y-open.ay>=10&&p.y-open.ay+open.h<=1070);
 assert.deepEqual(core.placeOut({x:0,y:0},size,{w:100,h:20}),{x:10,y:10,fits:true,out:true},'a screen smaller than the capsule pins it to the corner');
});

test('the floating spot is a personal preference that survives cleaning, and docking keeps the spot',()=>{
 assert.deepEqual(core.clean({out:{on:true,x:1300.5,y:400}}).out,{on:true,x:1300.5,y:400});
 assert.deepEqual(core.clean({out:{on:'yes',x:'a',y:-5}}).out,{on:false,x:0,y:0},'only a real true floats it');
 assert.deepEqual(core.clean({style:'b',out:{on:false,x:1300,y:400}}).out,{on:false,x:1300,y:400});
 assert.deepEqual(core.clean({}).out,{on:false,x:0,y:0},'docked by default: nothing changes for users who never drag it out');
});

test('the capsule tooltips go through the shared tip component, in three languages',()=>{
 const js=read('web/reader/modules/capsule.js');
 assert.doesNotMatch(js,/\.title=/,'no native title boxes on the capsule');
 for(const k of ['menuTipOut','setOut','setOutHint','dock'])assert.equal((js.match(new RegExp('\\b'+k+':\'','g'))||[]).length,3,k+' in zh, en and ja');
 assert.doesNotMatch(js,/(^|[^:])\/\/(?!\S*\.)/m,'no // line comments');
});

let chromium;try{({chromium}=require(process.env.MEGULIT_PLAYWRIGHT||'H:/MeguLit-Work/pw/node_modules/playwright-core'));}catch{}
const BASE='http://megulit.test/web/reader/index.html';
function harness(){return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#22252e}#game{position:fixed;left:${game.x}px;top:${game.y}px;width:${game.w}px;height:${game.h}px;background:#3a5a8a}
.sentence-window{position:fixed;left:${game.x+60}px;width:${game.w-120}px;top:${game.y+game.h-170}px;height:140px}.sentence-text{font:26px sans-serif;color:#fff;padding:20px}
.tomoyo-cn-dialog{position:fixed;inset:0;margin:auto;width:600px;height:460px;background:#222}</style></head>
<body class="tomoyo-ui-translation tomoyo-gal-bound"><div id="game"></div><div class="sentence-window"><div class="sentence-text"><span class="char-token">今日は、いい天気ですね。</span></div></div>
<script>window.__regions=[];window.__tomoyoTranslateRequest=s=>{const m=JSON.parse(s);if(m.type==='galHitRegions')window.__regions=m.regions;};
window.__tomoyoChinese={galLayoutInfo:()=>({clientX:${game.x},clientY:${game.y},clientWidth:${game.w},clientHeight:${game.h}}),toggleBacklog(){},toggleGalMenu(){let d=document.querySelector('.tomoyo-cn-dialog');
 if(d){d.remove();return;}d=document.createElement('dialog');d.className='tomoyo-cn-dialog';d.dataset.menuTab='misc';d.innerHTML='<section data-menu-category="misc"></section>';document.body.append(d);d.show();}};</script></body></html>`;}
const page=(name,fn,saved)=>test(name,{skip:!chromium&&'no playwright-core'},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const ctx=await browser.newContext({viewport:{width:1280,height:720}});const p=await ctx.newPage();
  await p.route('http://megulit.test/**',route=>{const u=new URL(route.request().url());if(u.pathname==='/web/reader/index.html')return route.fulfill({contentType:'text/html',body:harness()});
   const f=path.join(root,decodeURIComponent(u.pathname));return fs.existsSync(f)?route.fulfill({path:f}):route.fulfill({status:404,body:''});});
  await p.goto(BASE,{waitUntil:'load'});
  const boot=async()=>{for(const m of ['interaction','tip','capsule'])await p.addScriptTag({content:read('web/reader/modules/'+m+'.js')});
   await p.waitForFunction(()=>window.__megulitCapsule?.state().visible);await p.waitForTimeout(150);};
  if(saved)await p.evaluate(v=>localStorage.setItem('tomoyo-capsule',JSON.stringify(v)),saved);
  await boot();await fn(p,{reload:async()=>{await p.reload({waitUntil:'load'});await boot();}});}
 finally{await browser.close();}
});
const rect=p=>p.evaluate(()=>window.__megulitCapsule.rect());
const outsideGame=r=>{const cx=r.x+r.w/2,cy=r.y+r.h/2;return cx<game.x||cx>game.x+game.w||cy<game.y||cy>game.y+game.h;};
async function drag(p,from,to){await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(to.x,to.y,{steps:14});await p.mouse.up();await p.waitForTimeout(650);}

page('dragging A off the game floats it there, remembers the spot after a reload, and dragging it back docks it',async(p,{reload})=>{
 let r=await rect(p);assert.ok(!outsideGame(r)&&r.y-game.y>=10&&r.y-game.y<=20,'starts docked at the top of the game: '+JSON.stringify(r));
 await drag(p,{x:r.x+r.w/2,y:r.y+r.h/2},{x:1180,y:60});
 r=await rect(p);assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().out),true);
 assert.ok(outsideGame(r)&&Math.abs(r.y+r.h/2-60)<4&&r.x+r.w/2<=1184,'stays where it was dropped, outside the game: '+JSON.stringify(r));
 const isl=await p.evaluate(()=>document.querySelector('#mg-cap .mg-cap-s').getBoundingClientRect().toJSON());
 assert.ok(isl.left>=10&&isl.right<=1270,'pulled in just enough for the island to open on screen: '+JSON.stringify(isl));
 assert.ok(await p.evaluate(r=>window.__regions.some(g=>g.x<=r.x&&g.y<=r.y&&g.x+g.width>=r.x+r.w&&g.y+g.height>=r.y+r.h),r),'the floating capsule is a clickable overlay region');
 const saved=JSON.parse(await p.evaluate(()=>localStorage.getItem('tomoyo-capsule')));assert.equal(saved.out.on,true);
 await reload();
 const again=await rect(p);assert.ok(Math.abs(again.x-r.x)<2&&Math.abs(again.y-r.y)<2,'same spot next time: '+JSON.stringify({again,r}));
 await drag(p,{x:again.x+again.w/2,y:again.y+again.h/2},{x:500,y:400});
 r=await rect(p);assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().out),false);
 assert.ok(!outsideGame(r)&&r.y-game.y>=10&&r.y-game.y<=20,'back on the game it docks to the top again: '+JSON.stringify(r));
});

page('the game moving does not move a floating capsule; a floating one never tucks for the dialogue',async p=>{
 await drag(p,await rect(p).then(r=>({x:r.x+r.w/2,y:r.y+r.h/2})),{x:1180,y:300});
 const before=await rect(p);
 await p.evaluate(()=>{const i={clientX:300,clientY:180,clientWidth:880,clientHeight:500};window.__tomoyoChinese.galLayoutInfo=()=>i;});await p.waitForTimeout(1700);
 const after=await rect(p);assert.deepEqual([Math.round(after.x),Math.round(after.y)],[Math.round(before.x),Math.round(before.y)]);
 assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().tucked),false);
});

page('Alt+T → 外观 shows the floating row and its button docks the capsule',async p=>{
 await p.evaluate(()=>window.__megulitCapsule.set({out:{on:true,x:1150,y:600}}));await p.waitForTimeout(200);
 assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().out),true);
 await p.evaluate(()=>window.__tomoyoChinese.toggleGalMenu());await p.waitForTimeout(250);
 assert.equal(await p.evaluate(()=>document.querySelector('[data-cap-outrow]').hidden),false,'the row says it is floating');
 assert.match(await p.evaluate(()=>document.querySelector('[data-cap-dock]').textContent),/收回游戏窗口/);
 await p.evaluate(()=>document.querySelector('[data-cap-dock]').click());await p.waitForTimeout(250);
 assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().out),false);
 assert.equal(await p.evaluate(()=>document.querySelector('[data-cap-outrow]').hidden),true);
 const r=await rect(p);assert.ok(!outsideGame(r),'docked: '+JSON.stringify(r));
 assert.deepEqual(JSON.parse(await p.evaluate(()=>localStorage.getItem('tomoyo-capsule'))).out,{on:false,x:1150,y:600},'the floating spot stays remembered');
});

page('a spot saved on a bigger desktop comes back on screen',async p=>{
 const r=await rect(p);assert.ok(r.x>=10&&r.y>=10&&r.x+r.w<=1270&&r.y+r.h<=710,'on screen: '+JSON.stringify(r));
 assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().out),true);
},{out:{on:true,x:3000,y:2000}});

page('style B and C float too and open toward the middle of the screen',async p=>{
 await p.evaluate(()=>window.__megulitCapsule.set({style:'b',out:{on:true,x:40,y:200}}));await p.waitForTimeout(250);
 assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().side),'left');
 await p.evaluate(()=>window.__megulitCapsule.set({style:'c',out:{on:true,x:1220,y:660}}));await p.waitForTimeout(250);
 assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().corner),'br');
 const r=await rect(p);assert.ok(r.x+r.w<=1270&&r.y+r.h<=710);
});
