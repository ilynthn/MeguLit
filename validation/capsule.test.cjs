/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Issue #1138 Alt+T capsule: preferences (default A, personal only), placement that never covers the dialogue, the three styles,
   dragging and the saved position, and the link to the Alt+T menu. The page part runs in headless Edge when playwright-core is there. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),core=require('../web/reader/modules/capsule.js');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('preferences default to style A, always shown, and clean bad values',()=>{
 assert.deepEqual(core.clean({}),{on:true,style:'a',a:{x:.5},b:{side:'right',y:.42},c:{corner:'tl'},out:{on:false,x:0,y:0}});
 assert.deepEqual(core.clean({on:false,style:'c',a:{x:9},b:{side:'left',y:-1},c:{corner:'br'}}),{on:false,style:'c',a:{x:1},b:{side:'left',y:0},c:{corner:'br'},out:{on:false,x:0,y:0}});
 assert.deepEqual(core.clean({style:'z',a:{x:null},b:{side:'top',y:'x'},c:{corner:'mid'}}),core.clean({}));
 assert.equal(core.KEY,'tomoyo-capsule','mirrored to ui-state.json like the other personal reader settings');
});

test('the capsule is a personal setting: no seed or shared-diff key carries it',()=>{
 assert.doesNotMatch(read('core/profiles/domains.cjs'),/capsule/i);
 for(const dir of ['The Seed'])assert.ok(fs.existsSync(path.join(root,dir)));
 assert.doesNotMatch(read('web/reader/modules/capsule.js'),/galConfigure|saveGameProfile|game-style-profiles/);
});

test('A slides along the top to the nearest spot that keeps clear of the reading layer',()=>{
 const view={w:1280,h:720},size={w:140,h:32,y:16};
 assert.deepEqual(core.placeA(640,size,view,[]),{x:570,y:16,fits:true});
 const line={x:420,y:0,w:440,h:80};
 const p=core.placeA(640,size,view,[line]);assert.equal(p.fits,true);assert.ok(!core.overlaps({...p,w:140,h:32},[line]));
 assert.ok(Math.abs(p.x+70-640)<=300,'stays close to where the user put it');
 const full={x:0,y:0,w:1280,h:200};assert.equal(core.placeA(640,size,view,[full]).fits,false,'no free spot: tucked, not over the text');
 assert.equal(core.placeA(5000,size,view,[]).x,1280-10-140,'clamped inside the window');
});

test('B keeps to its edge, moves along it, and only then tries the other side',()=>{
 const view={w:1280,h:720},size={w:48,h:280};
 assert.deepEqual(core.placeB('right',300,size,view,[]),{side:'right',x:1222,y:160,fits:true});
 const right={x:1100,y:0,w:180,h:720},p=core.placeB('right',300,size,view,[right]);
 assert.equal(p.side,'left');assert.equal(p.x,10);
 const band={x:0,y:100,w:1280,h:300},q=core.placeB('right',260,size,view,[band]);
 assert.equal(q.side,'right');assert.ok(!core.overlaps({x:q.x,y:q.y,...size},[band]));
});

test('C snaps to the nearest corner and falls back to a free corner',()=>{
 const view={w:1280,h:720};
 assert.equal(core.snapCorner(100,600,view),'bl');assert.equal(core.snapCorner(1200,40,view),'tr');
 assert.equal(core.sideOf(200,view),'left');assert.equal(core.sideOf(900,view),'right');
 const size={w:32,h:32},p=core.placeC('tl',size,view,[{x:0,y:0,w:300,h:200}]);
 assert.equal(p.corner,'tr');assert.equal(p.fits,true);
 assert.deepEqual(core.placeC('br',size,view,[]),{corner:'br',x:1238,y:678,fits:true});
});

test('clip-path shapes are insets of the open surface',()=>{
 assert.equal(core.clip({w:400,h:44},{x:130,y:6,w:140,h:32,r:16}),'inset(6px 130px 6px 130px round 16px)');
});

test('the capsule is registered last and its hit box is part of the overlay region',()=>{
 const json=JSON.parse(read('web/reader/modules.json'));assert.equal(json.at(-1),'capsule');
 assert.match(read('web/reader/module-list.js'),/"controls-b","capsule"\]/);
 assert.match(read('web/reader/modules/interaction.js'),/\.mg-cap-hit,/);
 const js=read('web/reader/modules/capsule.js');
 assert.doesNotMatch(js,/(^|[^:])\/\/(?!\S*\.)/m,'no // line comments');
 assert.match(js,/prefers-reduced-motion: reduce/);assert.match(js,/new URL\('\.\.\/vendor\/gsap\.min\.js',document\.baseURI\)/);
 assert.doesNotMatch(js,/transition:all|transition: all/);
});

let chromium;try{({chromium}=require(process.env.MEGULIT_PLAYWRIGHT||'H:/MeguLit-Work/pw/node_modules/playwright-core'));}catch{}
const page=(name,fn)=>test(name,{skip:!chromium&&'no playwright-core'},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const p=await browser.newPage({viewport:{width:1280,height:720}});
  await p.route('http://megulit.test/**',route=>{const u=new URL(route.request().url());if(u.pathname==='/web/reader/index.html')return route.fulfill({contentType:'text/html',body:harness()});
   const f=path.join(root,decodeURIComponent(u.pathname));return fs.existsSync(f)?route.fulfill({path:f}):route.fulfill({status:404,body:''});});
  await p.goto(BASE,{waitUntil:'load'});await p.addScriptTag({content:read('web/reader/modules/interaction.js')});await p.addScriptTag({content:read('web/reader/modules/capsule.js')});
  await p.waitForFunction(()=>window.__megulitCapsule?.state().visible);await p.waitForTimeout(120);await fn(p);}
 finally{await browser.close();}
});
const BASE='http://megulit.test/web/reader/index.html';
function harness(){return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#3a5a8a}.sentence-window{position:fixed;left:80px;right:80px;bottom:36px;height:150px}
.sentence-text{font:28px sans-serif;color:#fff;padding:24px}.tomoyo-cn-dialog{position:fixed;inset:0;margin:auto;width:600px;height:500px;background:#222}</style></head>
<body class="tomoyo-ui-translation tomoyo-gal-bound"><div class="sentence-window"><div class="sentence-text"><span class="char-token">今日は、いい天気ですね。</span></div></div>
<script>window.__regions=[];window.__sent=[];window.__tomoyoTranslateRequest=s=>{const m=JSON.parse(s);window.__sent.push(m);if(m.type==='galHitRegions')window.__regions=m.regions;};
window.__menuToggles=0;window.__tomoyoChinese={toggleBacklog(){window.__log=(window.__log||0)+1;},toggleGalMenu(){window.__menuToggles++;let d=document.querySelector('.tomoyo-cn-dialog');
 if(d){d.remove();return;}d=document.createElement('dialog');d.className='tomoyo-cn-dialog';d.dataset.menuTab=localStorage.getItem('tomoyo-menu-tab')||'calibrate';
 d.innerHTML='<nav class="tomoyo-menu-tabs"><button data-menu-key="text">文字</button><button data-menu-key="misc">外观</button></nav><section data-menu-category="misc"></section>';
 for(const b of d.querySelectorAll('nav button'))b.onclick=()=>{d.dataset.menuTab=b.dataset.menuKey;};document.body.append(d);d.show();}};</script></body></html>`;}
const inside=(regions,r)=>regions.some(g=>r.x>=g.x&&r.y>=g.y&&r.x+r.w<=g.x+g.width&&r.y+r.h<=g.y+g.height);

page('default A sits top centre, clear of the dialogue, and is a clickable region',async p=>{
 const s=await p.evaluate(()=>window.__megulitCapsule.state());assert.equal(s.style,'a');
 const r=await p.evaluate(()=>window.__megulitCapsule.rect());assert.ok(Math.abs(r.x+r.w/2-640)<2,'centred: '+JSON.stringify(r));assert.ok(r.y<40);
 await p.waitForTimeout(80);const regions=await p.evaluate(()=>window.__regions);assert.ok(inside(regions,r),'region '+JSON.stringify(regions)+' covers '+JSON.stringify(r));
 const text=await p.evaluate(()=>{const b=document.querySelector('.sentence-text').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};});
 assert.ok(!(r.y+r.h>text.y&&r.y<text.y+text.h),'never over the dialogue');
});

page('clicking the capsule opens and closes the Alt+T menu, and a tab button opens that tab',async p=>{
 const r=await p.evaluate(()=>window.__megulitCapsule.rect());
 await p.mouse.click(r.x+r.w/2,r.y+r.h/2);await p.waitForTimeout(250);
 assert.equal(await p.evaluate(()=>window.__menuToggles),1);assert.ok(await p.evaluate(()=>!!document.querySelector('.tomoyo-cn-dialog[open]')));
 await p.waitForFunction(()=>document.querySelector('.mg-cap-set'));
 assert.equal(await p.evaluate(()=>document.querySelector('.mg-cap-set [data-cap-style=a]').getAttribute('aria-selected')),'true','settings live in 外观 with A selected');
 await p.evaluate(()=>document.querySelector('#mg-cap [data-act="tab:text"]').click());
 assert.equal(await p.evaluate(()=>document.querySelector('.tomoyo-cn-dialog').dataset.menuTab),'text');
 await p.evaluate(()=>document.querySelector('#mg-cap [data-act="menu"]').click());await p.waitForTimeout(250);
 assert.equal(await p.evaluate(()=>!!document.querySelector('.tomoyo-cn-dialog')),false);
});

page('hover opens the island under the pointer and it shrinks back to a thin line when left alone',async p=>{
 const r=await p.evaluate(()=>window.__megulitCapsule.rect());await p.mouse.move(r.x+r.w/2,r.y+r.h/2);await p.waitForTimeout(700);
 assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().state),'open');
 const open=await p.evaluate(()=>window.__megulitCapsule.rect());assert.ok(open.w>r.w+120,'the island grows sideways');assert.ok(Math.abs(open.x+open.w/2-(r.x+r.w/2))<2,'around the same centre');
 await p.mouse.move(640,400);await p.waitForTimeout(3600);
 assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().state),'idle');
 const idle=await p.evaluate(()=>window.__megulitCapsule.rect());assert.ok(idle.h<=6&&idle.w<=40,'idle is a small line: '+JSON.stringify(idle));
});

page('dragging A moves it along the top and the spot is remembered',async p=>{
 const r=await p.evaluate(()=>window.__megulitCapsule.rect());
 await p.mouse.move(r.x+20,r.y+r.h/2);await p.mouse.down();await p.mouse.move(r.x+20-150,r.y+r.h/2+200,{steps:8});await p.mouse.up();await p.waitForTimeout(600);
 const after=await p.evaluate(()=>window.__megulitCapsule.rect());assert.ok(Math.abs(after.x-(r.x-150))<4,'moved left by the drag: '+JSON.stringify(after));assert.ok(after.y<40,'still at the top');
 const saved=JSON.parse(await p.evaluate(()=>localStorage.getItem('tomoyo-capsule')));assert.ok(Math.abs(saved.a.x-(after.x+after.w/2)/1280)<.01);
 assert.equal(await p.evaluate(()=>window.__menuToggles),0,'a drag is not a click');
});

page('style B docks to an edge and switches side when dropped across the middle',async p=>{
 await p.evaluate(()=>window.__megulitCapsule.set({style:'b'}));await p.waitForTimeout(150);
 let s=await p.evaluate(()=>window.__megulitCapsule.state());assert.equal(s.style,'b');assert.equal(s.side,'right');
 const r=await p.evaluate(()=>window.__megulitCapsule.rect());assert.ok(Math.abs(r.x+r.w-1270)<2,'10 px from the right edge: '+JSON.stringify(r));
 await p.mouse.move(r.x+r.w/2,r.y+20);await p.mouse.down();await p.mouse.move(200,300,{steps:10});await p.mouse.up();await p.waitForTimeout(600);
 s=await p.evaluate(()=>window.__megulitCapsule.state());assert.equal(s.side,'left');
 const l=await p.evaluate(()=>window.__megulitCapsule.rect());assert.equal(Math.round(l.x),10);
 assert.equal(JSON.parse(await p.evaluate(()=>localStorage.getItem('tomoyo-capsule'))).b.side,'left');
});

page('style C sits in a corner, unfolds into the shortcut card and snaps to the corner it is dropped near',async p=>{
 await p.evaluate(()=>window.__megulitCapsule.set({style:'c'}));await p.waitForTimeout(150);
 const r=await p.evaluate(()=>window.__megulitCapsule.rect());assert.deepEqual([Math.round(r.x),Math.round(r.y),r.w],[10,10,32]);
 await p.mouse.click(r.x+16,r.y+16);await p.waitForTimeout(600);assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().state),'open');
 assert.ok(await p.evaluate(()=>[...document.querySelectorAll('#mg-cap .mg-cap-card button')].length>=5));
 await p.evaluate(()=>document.querySelector('#mg-cap [data-act=log]').click());assert.equal(await p.evaluate(()=>window.__log),1);
 await p.waitForTimeout(500);const dot=await p.evaluate(()=>window.__megulitCapsule.rect());
 await p.mouse.move(dot.x+16,dot.y+16);await p.mouse.down();await p.mouse.move(1100,640,{steps:10});await p.mouse.up();await p.waitForTimeout(600);
 assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().corner),'br');
 const br=await p.evaluate(()=>window.__megulitCapsule.rect());assert.ok(br.x>1200&&br.y>600,'bottom-right: '+JSON.stringify(br));
 assert.equal(JSON.parse(await p.evaluate(()=>localStorage.getItem('tomoyo-capsule'))).c.corner,'br');
});

page('a line drawn where the capsule sits pushes it aside; turning 常驻 off tucks it into a handle',async p=>{
 await p.evaluate(()=>{const w=document.createElement('div');w.className='tomoyo-cn-output';w.textContent='今天天气真好呢。今天天气真好呢。';w.style.cssText='position:fixed;left:440px;top:4px;width:400px;font:24px sans-serif;color:#fff';document.body.append(w);});
 await p.waitForTimeout(800);const r=await p.evaluate(()=>window.__megulitCapsule.rect());
 const t=await p.evaluate(()=>{const g=document.createRange();g.selectNodeContents(document.querySelector('.tomoyo-cn-output'));const b=g.getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};});
 assert.ok(!core.overlaps(r,[t]),'moved off the line: '+JSON.stringify({r,t}));
 await p.evaluate(()=>window.__megulitCapsule.set({on:false}));await p.waitForTimeout(100);
 assert.equal(await p.evaluate(()=>document.getElementById('mg-cap').hidden),false,'never gone: a handle stays');
 assert.equal(await p.evaluate(()=>window.__megulitCapsule.state().folded),true);
});

page('switching between window and full screen keeps each style on its spot',async p=>{
 await p.setViewportSize({width:1920,height:1080});await p.waitForTimeout(250);
 let r=await p.evaluate(()=>window.__megulitCapsule.rect());assert.ok(Math.abs(r.x+r.w/2-960)<2,'A centred at full screen: '+JSON.stringify(r));
 await p.evaluate(()=>window.__megulitCapsule.set({style:'b'}));await p.waitForTimeout(150);
 r=await p.evaluate(()=>window.__megulitCapsule.rect());assert.ok(Math.abs(r.x+r.w-1910)<2,'B on the right edge');
 await p.setViewportSize({width:1024,height:640});await p.waitForTimeout(250);
 r=await p.evaluate(()=>window.__megulitCapsule.rect());assert.ok(Math.abs(r.x+r.w-1014)<2&&r.y>=10&&r.y+r.h<=630,'B follows the smaller window: '+JSON.stringify(r));
 await p.evaluate(()=>window.__megulitCapsule.set({style:'c',c:{corner:'br'}}));await p.waitForTimeout(150);
 r=await p.evaluate(()=>window.__megulitCapsule.rect());
 const text=await p.evaluate(()=>{const b=document.querySelector('.sentence-text').getBoundingClientRect();return {x:b.left-8,y:b.top-8,w:b.width+16,h:b.height+16};});
 assert.ok(!core.overlaps(r,[text]),'C never sits on the dialogue: '+JSON.stringify({r,text}));
});
