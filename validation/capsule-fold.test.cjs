/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Owner P0 (11-28): 「隐藏了alt+t胶囊所有功能就全部隐藏了」 and 「常驻显示开关也无法打开 隐藏了之后还是显示开着常驻 但是我开关了一下
   胶囊还是被隐藏了」. The capsule's hide button toggled the whole overlay cover (the Alt+H hide), so text, readings, translation
   and lookup all went, and 常驻 (a separate flag) could not bring anything back while the cover was off. Now the capsule's button
   only tucks the capsule into a faint handle, 常驻 and that button are one state, and turning it on brings a hidden cover back.
   The state logic runs everywhere; the page part runs in headless Edge when playwright-core is there. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),core=require('../web/reader/modules/capsule.js');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('tucking the capsule only changes the capsule; the whole-layer hide is a separate action',()=>{
 const on=core.clean({});
 assert.deepEqual(core.press(on,'fold'),{prefs:{...on,on:false},send:null},'no cover toggle: the reading layer keeps working');
 assert.deepEqual(core.press(on,'cover').send,{type:'galToggleCover'},'the explicit Alt+H action still hides everything');
 assert.equal(core.press(on,'cover').prefs,on);
});

test('常驻 and the tuck button share one state; turning it on also brings a hidden cover back',()=>{
 const off=core.clean({on:false});
 assert.equal(core.press(off,'unfold').prefs.on,true);
 assert.equal(core.press(off,'unfold',{coverHidden:false}).send,null);
 assert.deepEqual(core.press(off,'unfold',{coverHidden:true}).send,{type:'galToggleCover'},'switching it on while Alt+H hid the layer makes it really appear');
 assert.equal(core.shownAs(core.press(core.clean({}),'fold').prefs),'handle','tucked: a handle, never nothing');
 assert.equal(core.shownAs(off,{menu:true}),'capsule','the Alt+T menu still shows the whole capsule');
 assert.equal(core.shownAs(core.clean({})),'capsule');
});

test('the capsule button is labelled as tucking, in three languages, and only the labelled card row hides the layer',()=>{
 const js=read('web/reader/modules/capsule.js');
 assert.match(js,/button\('fold',/);assert.match(js,/key\('fold',/);assert.match(js,/row\('cover','Alt\+H'/);
 assert.doesNotMatch(js,/name==='hide'/,'the old hide action that toggled the cover is gone');
 for(const k of ['handleTip'])assert.equal((js.match(new RegExp('\\b'+k+':\'','g'))||[]).length,3,k+' in zh, en and ja');
 assert.match(js,/hide:'收起'/);assert.match(js,/hide:'Tuck'/);assert.match(js,/hide:'しまう'/);
});

let chromium;try{({chromium}=require(process.env.MEGULIT_PLAYWRIGHT||'H:/MeguLit-Work/pw/node_modules/playwright-core'));}catch{}
const BASE='http://megulit.test/web/reader/index.html';
function harness(){return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#3a5a8a}.sentence-window{position:fixed;left:80px;right:80px;bottom:36px;height:150px}
.sentence-text{font:28px sans-serif;color:#fff;padding:24px}.tomoyo-cn-dialog{position:fixed;inset:0;margin:auto;width:600px;height:500px;background:#222}</style></head>
<body class="tomoyo-ui-translation tomoyo-gal-bound"><div class="sentence-window"><div class="sentence-text"><span class="char-token">今日は、いい天気ですね。</span></div></div>
<script>window.__regions=[];window.__sent=[];window.__tomoyoTranslateRequest=s=>{const m=JSON.parse(s);window.__sent.push(m);if(m.type==='galHitRegions')window.__regions=m.regions;
 if(m.type==='galToggleCover')document.body.classList.toggle('tomoyo-cover-hidden');};
window.__tomoyoChinese={toggleBacklog(){},toggleGalMenu(){let d=document.querySelector('.tomoyo-cn-dialog');if(d){d.remove();return;}d=document.createElement('dialog');d.className='tomoyo-cn-dialog';d.dataset.menuTab='misc';
 d.innerHTML='<section data-menu-category="misc"></section>';document.body.append(d);d.show();}};</script></body></html>`;}
const page=(name,fn,saved)=>test(name,{skip:!chromium&&'no playwright-core'},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const p=await browser.newPage({viewport:{width:1280,height:720}});
  await p.route('http://megulit.test/**',route=>{const u=new URL(route.request().url());if(u.pathname==='/web/reader/index.html')return route.fulfill({contentType:'text/html',body:harness()});
   const f=path.join(root,decodeURIComponent(u.pathname));return fs.existsSync(f)?route.fulfill({path:f}):route.fulfill({status:404,body:''});});
  await p.goto(BASE,{waitUntil:'load'});
  if(saved)await p.evaluate(v=>localStorage.setItem('tomoyo-capsule',JSON.stringify(v)),saved);
  for(const m of ['interaction','tip','capsule'].filter(m=>fs.existsSync(path.join(root,'web/reader/modules',m+'.js'))))await p.addScriptTag({content:read('web/reader/modules/'+m+'.js')});
  await p.waitForFunction(()=>window.__megulitCapsule?.state().visible);await p.waitForTimeout(150);await fn(p);}
 finally{await browser.close();}
});
const state=p=>p.evaluate(()=>window.__megulitCapsule.state());
const textInRegion=p=>p.evaluate(()=>{const r=document.querySelector('.char-token').getBoundingClientRect();return window.__regions.some(g=>g.x<=r.left+1&&g.y<=r.top+1&&g.x+g.width>=r.right-1&&g.y+g.height>=r.bottom-1);});
async function openIsland(p){const r=await p.evaluate(()=>window.__megulitCapsule.rect());await p.mouse.move(r.x+r.w/2,r.y+r.h/2);await p.waitForTimeout(700);}

page('the capsule’s 收起 keeps the reading layer working and leaves a handle that brings the capsule back',async p=>{
 await openIsland(p);
 await p.evaluate(()=>document.querySelector('#mg-cap :is([data-act=fold],[data-act=hide])').click());await p.waitForTimeout(300);await p.mouse.move(640,400);await p.waitForTimeout(300);
 assert.equal(await p.evaluate(()=>window.__sent.some(m=>m.type==='galToggleCover')),false,'the overlay cover is untouched');
 assert.equal(await p.evaluate(()=>document.body.classList.contains('tomoyo-cover-hidden')),false);
 assert.equal(await textInRegion(p),true,'the line is still a live region, so lookup keeps working');
 let s=await state(p);assert.equal(s.visible,true,'the capsule area is still there');assert.equal(s.folded,true);assert.equal(s.state,'idle');
 assert.equal(await p.evaluate(()=>getComputedStyle(document.getElementById('mg-cap')).display),'block');
 const alpha=Number(await p.evaluate(()=>getComputedStyle(document.querySelector('#mg-cap .mg-cap-b')).opacity));assert.ok(alpha>0&&alpha<.5,'faint: '+alpha);
 const hit=await p.evaluate(()=>{const r=document.querySelector('#mg-cap .mg-cap-hit').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
 await p.mouse.move(hit.x,hit.y);await p.waitForTimeout(300);
 assert.equal(Number(await p.evaluate(()=>getComputedStyle(document.querySelector('#mg-cap .mg-cap-b')).opacity)),1,'clear while pointed at');
 await p.mouse.click(hit.x,hit.y);await p.waitForTimeout(400);
 s=await state(p);assert.equal(s.folded,false,'one click opens it again');assert.notEqual(s.state,'idle');
 assert.equal(JSON.parse(await p.evaluate(()=>localStorage.getItem('tomoyo-capsule'))).on,true);
});

page('常驻 in Alt+T → 外观 always matches the capsule: tuck → off, switch on → shown, tuck again → off',async p=>{
 await openIsland(p);await p.evaluate(()=>document.querySelector('#mg-cap :is([data-act=fold],[data-act=hide])').click());await p.waitForTimeout(200);
 await p.evaluate(()=>window.__tomoyoChinese.toggleGalMenu());await p.waitForTimeout(250);
 assert.equal(await p.evaluate(()=>document.querySelector('[data-cap-on]').checked),false,'tucked shows as off');
 await p.evaluate(()=>window.__tomoyoChinese.toggleGalMenu());await p.waitForTimeout(250);
 assert.equal((await state(p)).folded,true,'back to the handle once the menu closes');
 await p.evaluate(()=>window.__tomoyoChinese.toggleGalMenu());await p.waitForTimeout(250);
 await p.evaluate(()=>document.querySelector('[data-cap-on]').click());await p.waitForTimeout(150);
 await p.evaluate(()=>window.__tomoyoChinese.toggleGalMenu());await p.waitForTimeout(400);
 let s=await state(p);assert.equal(s.folded,false,'switching it on shows the capsule');assert.notEqual(s.state,'idle');
 await p.evaluate(()=>window.__tomoyoChinese.toggleGalMenu());await p.waitForTimeout(250);
 await p.evaluate(()=>document.querySelector('#mg-cap :is([data-act=fold],[data-act=hide])').click());await p.waitForTimeout(250);
 assert.equal(await p.evaluate(()=>document.querySelector('[data-cap-on]').checked),false,'tucking again turns the switch off at once');
});

page('switching 常驻 on while Alt+H hid everything brings the layer back',async p=>{
 await p.evaluate(()=>window.__tomoyoTranslateRequest(JSON.stringify({type:'galToggleCover'})));
 assert.equal(await p.evaluate(()=>document.body.classList.contains('tomoyo-cover-hidden')),true);
 await p.evaluate(()=>window.__tomoyoChinese.toggleGalMenu());await p.waitForTimeout(250);
 await p.evaluate(()=>document.querySelector('[data-cap-on]').click());await p.waitForTimeout(150);
 await p.evaluate(()=>document.querySelector('[data-cap-on]').click());await p.waitForTimeout(150);
 assert.equal(await p.evaluate(()=>document.body.classList.contains('tomoyo-cover-hidden')),false,'the cover is shown again');
 assert.equal(await p.evaluate(()=>document.querySelector('[data-cap-on]').checked),true);
},{on:true});

page('a tucked capsule is still a visible handle after restarting the game',async p=>{
 const s=await state(p);assert.equal(s.visible,true);assert.equal(s.folded,true);assert.equal(s.state,'idle');
 assert.equal(await p.evaluate(()=>document.getElementById('mg-cap').hidden),false);
 assert.match(await p.evaluate(()=>document.querySelector('#mg-cap .mg-cap-hit').dataset.mgTip||''),/展开/);
},{on:false});

page('the corner card keeps the labelled Alt+H row for hiding the whole layer',async p=>{
 await p.evaluate(()=>window.__megulitCapsule.set({style:'c'}));await p.waitForTimeout(200);
 await p.evaluate(()=>document.querySelector('#mg-cap [data-act=cover]').click());await p.waitForTimeout(100);
 assert.equal(await p.evaluate(()=>window.__sent.filter(m=>m.type==='galToggleCover').length),1);
});
