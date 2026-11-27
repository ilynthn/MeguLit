// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The Seed catalog dialog in a real browser (headless Edge), with a stub service layer: what normal mode asks for, the veil card and its click,
   the global NSFW setting, search, the R18 filter, closing. Skipped without playwright-core, like dialog-hidden-button.test.cjs. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;
try{({chromium}=require(process.env.MEGULIT_PLAYWRIGHT||'H:/MeguLit-Work/pw/node_modules/playwright-core'));}catch{}
const WEB=path.join(__dirname,'..','web');
const games=[
 {slug:'a',engine:'kirikiri',status:'verified',vndb:'v1',title:'Alpha',alttitle:'アルファ',developers:[{id:'p1',name:'Studio A',original:'スタジオA'}],cover:'safe'},
 {slug:'b',engine:'siglus',status:'skeleton',vndb:'v2',title:'Beta',alttitle:'ベータ',developers:[{id:'p1',name:'Studio A',original:'スタジオA'}],cover:'nsfw'},
 {slug:'c',engine:'bgi',status:'read',vndb:'v3',title:'Gamma',alttitle:'',developers:[{id:'p2',name:'Studio B',original:''}],cover:'safe'}];
const PIXEL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PAGE=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">${['app.css','game-dialog.css','controls-b-tokens.css','seed-catalog.css','scrollbar.css'].map(f=>`<link rel="stylesheet" href="${f}">`).join('')}</head><body>
<script type="module">
import {openSeedCatalog} from './seed-catalog.js';
import {initNsfw} from './nsfw.js';
window.setNsfw=(on)=>{window.__on=on;};
window.__on=false;
window.startNsfw=()=>initNsfw({locale:'zh',api:async a=>a==='nsfw_state'?{on:window.__on,flagged:[]}:null});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
window.calls=[];
window.open_=(answer,engine={})=>openSeedCatalog({locale:'zh',esc,api:async(a,p={})=>{calls.push([a,p]);if(a==='seed_catalog'){if(engine.failCatalog)throw Error('offline');return answer;}if(a==='seed_catalog_engines')return {engines:engine.engines||[]};if(a==='seed_catalog_engine'){const k=p.engine+'|'+p.page;if(engine.delay?.[k])await new Promise(r=>setTimeout(r,engine.delay[k]));return engine.pages?.[k];}if(a==='seed_cover')return ${JSON.stringify(PIXEL)};return null;}});
window.ready=true;
</script></body></html>`;

async function pageFor(browser){
  const page=await browser.newPage();
  await page.route('http://megulit.test/**',r=>{const f=new URL(r.request().url()).pathname.slice(1);
   if(f==='probe.html')return r.fulfill({contentType:'text/html',body:PAGE});
   const file=path.join(WEB,f);if(!file.startsWith(WEB)||!fs.existsSync(file))return r.fulfill({status:404,body:''});
   r.fulfill({contentType:f.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file)});});
  await page.goto('http://megulit.test/probe.html');await page.waitForFunction(()=>window.ready);
  return page;
}

test('catalog dialog: normal mode, the NSFW question, search, R18 filter, closing',{skip:!chromium&&'no playwright-core'},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await pageFor(browser);
  const state=()=>page.evaluate(()=>{const d=document.querySelector('dialog.seed-catalog');return d&&{open:d.open,mode:d.dataset.mode,sub:d.querySelector('[data-sub]').textContent,
   cards:d.querySelectorAll('.sc-card').length,imgs:d.querySelectorAll('.sc-grid .sc-cover img').length,hidden:d.querySelectorAll('.sc-cover[data-state=hidden]').length,veils:d.querySelectorAll('.sc-veil').length,
   covers:calls.filter(c=>c[0]==='seed_cover').map(c=>c[1].vndb+'|'+c[1].nsfw)};});
  const settle=()=>page.waitForTimeout(150);
  await page.evaluate(g=>{localStorage.clear();open_({games:g,offline:false,safeOnly:false});},games);await settle();
  let s=await state();
  assert.equal(s.open,true);assert.equal(s.sub,'3 部游戏 · 3 颗种子 · 2 个游戏社');assert.equal(s.cards,3);
  assert.equal(s.mode,'normal','the global setting is off');
  assert.equal(s.hidden,0);assert.equal(s.veils,0);assert.equal(s.imgs,2,'the open studio shows every cover, the adult one too; the folded one loads its covers when opened');assert.ok(s.covers.includes('v2|true'));
  await page.click('[data-close]');await settle();
  await page.evaluate(()=>{setNsfw(true);return startNsfw();});await settle();
  await page.evaluate(g=>{calls.length=0;open_({games:g,offline:false,safeOnly:false});},games);await settle();s=await state();
  assert.equal(s.mode,'nsfw','the global setting is on');assert.equal(s.veils,0);assert.equal(s.imgs,2);
  await page.fill('[data-search]','gamma');await settle();s=await state();assert.equal(s.cards,1);
  await page.click('[data-close]');await settle();s=await state();assert.equal(s,null,'Close removes the dialog');
  await page.evaluate(g=>{open_({games:g,offline:true,safeOnly:false});},games);await settle();
  assert.equal(await page.evaluate(()=>!document.querySelector('[data-offline]').hidden),true);
  await page.evaluate(g=>{calls.length=0;open_({games:g,offline:false,safeOnly:true});},games);await settle();s=await state();
  assert.equal(await page.evaluate(()=>document.querySelectorAll('dialog.seed-catalog').length),1,'opening again replaces the open one');
  assert.equal(s.mode,'normal');assert.equal(s.veils,1);assert.ok(!s.covers.some(c=>c.endsWith('|true')),'the R18 filter: no NSFW cover is asked for');
  assert.match(await page.textContent('.sc-veil'),/成人内容/);
  await page.mouse.click(5,5);await settle();s=await state();assert.equal(s,null,'a click on the backdrop closes it');
 }finally{await browser.close();}
});

/* 2026-11-27 (user: 太乱了 滚动条也隐藏了 打开的时候分社自动折叠 只展开第一排): each studio is one folded row, only the first open */
const many=[['p1','Studio A',['Alpha','Beta','Gamma']],['p2','Studio B',['Delta','Epsilon']],['p3','Studio C',['Kappa']],['p4','Studio D',['Eta']]]
 .flatMap(([id,name,titles])=>titles.map((title,i)=>({slug:title.toLowerCase(),engine:'kirikiri',status:'verified',vndb:'v'+id+i,title,alttitle:'',developers:[{id,name,original:''}],cover:'safe'})));
test('catalog dialog: studios open folded, only the first one open; a row folds, expand all, search, the scrollbar shows',{skip:!chromium&&'no playwright-core'},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
 try{
  const page=await pageFor(browser);await page.setViewportSize({width:1100,height:700});
  /* which rows are open, by the DOM state, by aria and by what is actually drawn */
  const rows=()=>page.evaluate(()=>[...document.querySelectorAll('dialog.seed-catalog .sc-group')].map(g=>{const b=g.querySelector('[data-toggle]'),f=g.querySelector('[data-fold]');
   return {key:g.dataset.group,open:g.hasAttribute('data-open'),aria:b.getAttribute('aria-expanded'),h:Math.round(f.getBoundingClientRect().height),shown:getComputedStyle(f).visibility==='visible',thumbs:g.querySelectorAll('.sc-peek .sc-thumb').length};}));
  const openKeys=async()=>(await rows()).filter(r=>r.open).map(r=>r.key);
  const settle=()=>page.waitForTimeout(400);
  await page.evaluate(g=>open_({games:g,offline:false,safeOnly:false}),many);await settle();
  let r=await rows();
  assert.deepEqual(r.map(x=>x.key),['p1','p2','p3','p4']);
  assert.deepEqual(r.map(x=>x.open),[true,false,false,false],'only the first studio is open');
  assert.deepEqual(r.map(x=>x.aria),['true','false','false','false']);
  assert.ok(r[0].h>100&&r[0].shown,'the first studio shows its covers');
  for(const x of r.slice(1)){assert.equal(x.h,0,x.key+' is one row');assert.equal(x.shown,false,x.key+' hides its cards');}
  assert.equal(r[1].thumbs,2,'a folded row previews its covers');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.sc-group:not([data-open]) .sc-grid img').length),0,'folded studios do not load their big covers yet');
  /* the scrollbar is drawn, thin */
  const bar=await page.evaluate(()=>{const b=document.querySelector('dialog.seed-catalog .sc-body');return b.offsetWidth-b.clientWidth;});
  assert.ok(bar>0&&bar<=10,'the list has a thin visible scrollbar, got '+bar);
  /* a click on the row opens it with a short height transition; again folds it */
  assert.ok(await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('[data-fold]')).transitionDuration)>0),'the height change is animated');
  await page.click('.sc-group[data-group="p2"] [data-toggle]');await settle();
  r=await rows();assert.deepEqual(await openKeys(),['p1','p2']);assert.equal(r[1].aria,'true');assert.ok(r[1].h>100&&r[1].shown);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.sc-group[data-group="p2"] .sc-grid img').length),2,'opening loads its covers');
  await page.click('.sc-group[data-group="p1"] [data-toggle]');await settle();
  r=await rows();assert.deepEqual(await openKeys(),['p2']);assert.equal(r[0].h,0);assert.equal(r[0].aria,'false');
  /* the introduction is its own button and does not fold the row */
  await page.click('.sc-group[data-group="p3"] [data-dev]');await settle();assert.deepEqual(await openKeys(),['p2']);
  /* expand all / fold all */
  await page.click('[data-fold-all="1"]');await settle();assert.deepEqual(await openKeys(),['p1','p2','p3','p4']);
  assert.equal(await page.evaluate(()=>document.querySelector('[data-fold-all="1"]').disabled),true);
  await page.click('[data-fold-all="0"]');await settle();assert.deepEqual(await openKeys(),[]);
  await page.click('.sc-group[data-group="p4"] [data-toggle]');await settle();assert.deepEqual(await openKeys(),['p4']);
  /* search: the studios with a match open, the rest go away; clearing it gives back the rows as the user left them */
  await page.fill('[data-search]','eta');await settle();
  r=await rows();assert.deepEqual(r.map(x=>x.key),['p1','p4'],'Beta and Eta match, the other studios are hidden');assert.deepEqual(r.map(x=>x.open),[true,true]);assert.ok(r.every(x=>x.h>0&&x.shown));
  await page.fill('[data-search]','studio c');await settle();r=await rows();assert.deepEqual(r.map(x=>[x.key,x.open]),[['p3',true]]);
  await page.fill('[data-search]','');await settle();
  r=await rows();assert.equal(r.length,4);assert.deepEqual(await openKeys(),['p4'],'what the user opened is remembered while the dialog is open');
  /* a new opening starts folded again */
  await page.click('[data-close]');await page.evaluate(g=>open_({games:g,offline:false,safeOnly:false}),many);await settle();
  assert.deepEqual(await openKeys(),['p1']);
  /* reduced motion: it just switches */
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('[data-fold]')).transitionDuration)),0);
  await page.click('.sc-group[data-group="p3"] [data-toggle]');
  assert.ok(await page.evaluate(()=>document.querySelector('.sc-group[data-group="p3"] [data-fold]').getBoundingClientRect().height>0),'open at once, no transition');
 }finally{await browser.close();}
});

test('the catalog tabs open one engine page at a time and follow the existing cover modes',{skip:!chromium&&'no playwright-core'},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await pageFor(browser);
  const choice=[
   {id:'rugp',name:'rUGP',count:2},
   {id:'kirikiri',name:'KiriKiri',count:101},
  ];
  const engine=(vndb,title,cover)=>({vndb,title,cover,engine:'KiriKiri'});
  const sets={
   'kirikiri|1':{page:1,count:101,more:true,games:[engine('v101','First engine game','safe'),engine('v102','Mature engine game','nsfw')]},
   'kirikiri|2':{page:2,count:101,more:false,games:[engine('v103','Second page','safe')]},
   'rugp|1':{page:1,count:2,more:false,games:[engine('v104','Small engine','safe')]},
  };
  const open=(safeOnly=false)=>page.evaluate(({games,choice,sets,safeOnly})=>{
   calls.length=0;open_({games,offline:false,safeOnly},{engines:choice,pages:sets});
  },{games,choice,sets,safeOnly});
  const view=page.locator('[data-engine-view]');
  const requests=()=>page.evaluate(()=>calls.filter(c=>c[0]==='seed_catalog_engine').map(c=>c[1]));
  const openEngine=async id=>{await page.getByRole('tab',{name:/引擎已适配/}).click();await page.locator(`.sc-etile[data-engine="${id}"]`).click();};
  await open();
  const enginesTab=page.getByRole('tab',{name:/引擎已适配/});
  await enginesTab.getByText('约 103 部').waitFor({timeout:4000});
  assert.equal(await page.getByRole('tab',{name:/已实测/}).getAttribute('aria-selected'),'true');
  assert.ok(await page.locator('[data-search]').isVisible(),'the seeded games tab keeps the search bar');
  assert.ok(await page.locator('[data-pane="engines"]').isHidden());
  await enginesTab.click();
  assert.ok(await page.locator('[data-search]').isHidden(),'the engine tab has no search bar');
  await page.getByText('引擎已适配（未逐部实测）',{exact:true}).waitFor();
  assert.deepEqual(await page.locator('.sc-etile .sc-etile-name').allTextContents(),['KiriKiri','rUGP'],'the biggest engine first');
  await page.locator('.sc-etile[data-engine="kirikiri"]').getByText('101').waitFor();
  assert.deepEqual(await requests(),[],'counts come without a VNDB page');
  await page.locator('.sc-etile[data-engine="kirikiri"]').click();
  await view.getByText('First engine game').waitFor();
  await view.locator('.sc-cover img').first().waitFor();
  assert.ok(await page.locator('[data-engine-list]').isHidden(),'one engine replaces the tiles');
  assert.deepEqual(await requests(),[{engine:'kirikiri',page:1}]);
  assert.equal(await view.locator('.sc-veil').count(),1);
  assert.equal(await view.locator('.sc-st').count(),0);
  assert.ok(!(await page.evaluate(()=>calls.some(c=>c[0]==='seed_cover'&&c[1].vndb==='v102'))),'normal mode never asks for the NSFW cover of an engine game');
  await view.locator('.sc-veil').click();
  await page.waitForFunction(()=>calls.some(c=>c[0]==='seed_cover'&&c[1].vndb==='v102'&&c[1].nsfw));
  await view.locator('.sc-veil').waitFor({state:'detached'});
  assert.equal(await page.locator('dialog.seed-catalog').getAttribute('data-mode'),'normal','a click shows that one cover; the setting stays off');
  await view.getByText('第 1 / 2 页',{exact:true}).waitFor();
  await view.getByRole('button',{name:'下一页'}).click();
  await view.getByText('Second page').waitFor();
  assert.deepEqual(await requests(),[{engine:'kirikiri',page:1},{engine:'kirikiri',page:2}]);
  assert.ok(await view.getByRole('button',{name:'下一页'}).isDisabled());
  await view.getByRole('button',{name:'上一页'}).click();
  await view.getByText('First engine game').waitFor();
  await view.getByRole('button',{name:/全部引擎/}).click();
  await page.locator('.sc-etile[data-engine="rugp"]').click();
  await view.getByText('Small engine').waitFor();
  assert.deepEqual((await requests()).at(-1),{engine:'rugp',page:1});
  assert.equal(await view.locator('.sc-pager').count(),0,'a single page has no pager');
  await page.getByRole('tab',{name:/已实测/}).click();
  assert.ok(await page.locator('[data-search]').isVisible());
  await page.locator('[data-close]').click();
  await page.evaluate(()=>{setNsfw(true);return startNsfw();});
  await open();
  await openEngine('kirikiri');
  await view.getByText('Mature engine game').waitFor();
  await page.waitForFunction(()=>calls.some(c=>c[0]==='seed_cover'&&c[1].vndb==='v102'&&c[1].nsfw));
  assert.equal(await view.locator('.sc-veil').count(),0);
  await page.locator('[data-close]').click();
  await open(true);
  await openEngine('kirikiri');
  await view.locator('.sc-veil').waitFor();
  assert.equal(await page.locator('dialog.seed-catalog').getAttribute('data-mode'),'normal');
  await view.locator('.sc-veil').click();
  assert.ok(!(await page.evaluate(()=>calls.some(c=>c[0]==='seed_cover'&&c[1].nsfw))));
 }finally{await browser.close();}
});

test('engine tiles load without the tested games, a late page never lands on another engine, and back shows new counts',{skip:!chromium&&'no playwright-core'},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await pageFor(browser);
  const choice=[{id:'kirikiri',name:'KiriKiri',count:101},{id:'rugp',name:'rUGP',count:2}];
  const sets={
   'kirikiri|1':{page:1,count:101,more:true,games:[{vndb:'v101',title:'Late page',cover:'none'}]},
   'rugp|1':{page:1,count:5,more:false,games:[{vndb:'v104',title:'Small engine',cover:'none'}]},
  };
  await page.evaluate(({choice,sets})=>{open_(null,{failCatalog:true,engines:choice,pages:sets,delay:{'kirikiri|1':300,'rugp|1':1200}});},{choice,sets});
  const enginesTab=page.getByRole('tab',{name:/引擎已适配/});
  await enginesTab.getByText('约 103 部').waitFor({timeout:4000});
  assert.equal(await page.textContent('[data-sub]'),'读取失败，稍后再试');
  await enginesTab.click();
  const view=page.locator('[data-engine-view]');
  await page.locator('.sc-etile[data-engine="kirikiri"]').click();
  await view.getByRole('button',{name:/全部引擎/}).click();
  await page.locator('.sc-etile[data-engine="rugp"]').click();
  await page.waitForTimeout(600);
  assert.equal(await view.getByText('Late page').count(),0,'the first engine answered late and stays out');
  assert.equal(await view.getAttribute('aria-busy'),'true','the open engine is still loading');
  await view.getByText('Small engine').waitFor();
  assert.equal(await view.getAttribute('aria-busy'),null);
  assert.equal(await view.locator('[data-engine-count]').textContent(),'5 部');
  await view.getByRole('button',{name:/全部引擎/}).click();
  await page.locator('.sc-etile[data-engine="rugp"]').getByText('5').waitFor();
  await enginesTab.getByText('约 106 部').waitFor();
  assert.equal(await page.getByRole('tab',{name:/已实测/}).locator('[data-tab-count]').textContent(),'','the tested tab keeps its own count'); }finally{await browser.close();}
});
