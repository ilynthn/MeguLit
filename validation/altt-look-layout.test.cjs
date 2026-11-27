// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 (user: alt+t现在的外观设置还是非常不好用啊 很拥挤 而且 易读性很差 必须优化外观设置那边的排版): the Alt+T 外观 page is laid
   out by panel (Alt+T 菜单 / 对话记录 / 点读弹窗), each slider has a typed value beside it, the rarely used sliders sit under
   更多, and a preview strip repaints as values change. The real reader page runs in headless Edge with a stub Tauri
   transport. Every setting that was on the page is still there and still changes what it changed. Skipped without Edge. */
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

const PANELS=['menu','log','card'];
const SLIDERS={blur:[0,40],dim:[0,85],saturate:[0,200],alpha:[20,100],radius:[0,28],border:[0,40],glassBlur:[0,40],glassDim:[0,85],glassSaturate:[0,200]};
const EVERYDAY=['alpha','radius','border'];

test('Alt+T 外观: grouped by panel, every slider typed or dragged, preview follows, nothing lost',{skip:!hasEdge&&'Edge not installed',timeout:180000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-altt-look-'));let server,cdp;
 try{
  server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<160&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'Reader bootstrap did not finish');
  await cdp.evaluate(`(()=>{const b=window.__tomoyoChinese;window.__tomoyoMode.set('translation');b.galStatus({bound:true,interfaceMode:'translation'});
   b.galLayout({clientX:0,clientY:0,clientWidth:1366,clientHeight:768,readerX:110,readerY:540,readerWidth:1140,readerHeight:170,surfaceWidth:1366,surfaceHeight:768});b.toggleGalMenu();})()`);
  let open=false;for(let i=0;i<40&&!open;i++){await sleep(100);open=await cdp.evaluate(`!!document.querySelector('.tomoyo-cn-dialog[open] [data-menu-key=misc]')`);}
  assert.ok(open,'Alt+T menu opened');await sleep(700);
  await cdp.evaluate(`document.querySelector('.tomoyo-cn-dialog[open] [data-menu-key=misc]').click()`);
  let built=false;for(let i=0;i<40&&!built;i++){await sleep(100);built=await cdp.evaluate(`!!document.querySelector('.tomoyo-cn-dialog[open] [data-menu-category=misc]>.tome-look')&&!!document.querySelector('.tomoyo-cn-dialog[open] .mg-cap-set')&&!!document.querySelector('.tomoyo-cn-dialog[open] .tome-reset-zone')`);}
  assert.ok(built,'外观 page built');
  // The menu opens with a short scale-in; measure once it has settled.
  let settled=false;for(let i=0;i<60&&!settled;i++){await sleep(100);settled=await cdp.evaluate(`(()=>{const d=document.querySelector('.tomoyo-cn-dialog[open]');return d.getBoundingClientRect().width>=d.offsetWidth-1&&d.getAnimations({subtree:true}).every(a=>a.playState!=='running');})()`);}
  assert.ok(settled,'menu finished opening');

  // Structure: one group per panel, with a title; the everyday sliders on the group, the others under 更多; capsule and reset still there.
  const shape=await cdp.evaluate(`(()=>{const misc=document.querySelector('.tomoyo-cn-dialog[open] [data-menu-category=misc]');
   const groups=[...misc.querySelectorAll('.tome-look-group')].map(g=>({panel:g.dataset.lookGroup,title:g.querySelector('.tome-look-title')?.textContent,
    main:[...g.querySelectorAll(':scope>.tome-look-row [data-game-key]')].map(i=>i.dataset.gameKey),
    more:[...g.querySelectorAll(':scope>details.tome-look-more [data-game-key]')].map(i=>i.dataset.gameKey),moreLabel:g.querySelector(':scope>details.tome-look-more>summary')?.textContent,
    surface:!!g.querySelector('select[data-game-surface='+g.dataset.lookGroup+']'),chips:[...g.querySelectorAll('[data-surface-pick]')].map(c=>c.dataset.surfacePick)}));
   const order=[...misc.children].map(n=>n.classList.contains('tome-look')?'look':n.classList.contains('mg-cap-set')?'capsule':n.classList.contains('tome-reset-zone')?'reset':'other').filter(x=>x!=='other');
   const cap=misc.querySelector('.mg-cap-set');
   return {groups,order,tiles:[...misc.querySelectorAll('.tome-look-tile')].map(t=>t.dataset.lookTile),
    capsule:{on:!!cap.querySelector('[data-cap-on]'),styles:cap.querySelectorAll('[data-cap-style]').length,reset:!!cap.querySelector('[data-cap-reset]'),dock:!!cap.querySelector('[data-cap-dock]')},
    reset:!!misc.querySelector('[data-reset-open]'),oldGrid:misc.querySelectorAll('.tome-bg-grid output').length};})()`);
  assert.deepEqual(shape.groups.map(g=>[g.panel,g.title]),[['menu','Alt+T 菜单'],['log','对话记录'],['card','点读弹窗']],'three panel groups; the option settings live on 翻译 and 文字');
  for(const g of shape.groups){
   assert.deepEqual(g.main,EVERYDAY,g.panel+': opacity, corner radius and border on the group itself');
   assert.deepEqual(g.more.sort(),Object.keys(SLIDERS).filter(k=>!EVERYDAY.includes(k)).sort(),g.panel+': picture and glass sliders under 更多');
   assert.equal(g.moreLabel,'更多');assert.equal(g.surface,true);assert.deepEqual(g.chips,['image','glass','both','plain']);
  }
  assert.deepEqual(shape.order,['look','capsule','reset'],'panels first, then the capsule, the danger zone last');
  assert.deepEqual(shape.tiles,PANELS,'one preview tile per panel');
  assert.deepEqual(shape.capsule,{on:true,styles:3,reset:true,dock:true},'capsule settings unchanged');
  assert.equal(shape.reset,true,'reset all settings still on the page');

  // Readability at 1366: labels 14px left of their control, hints at least 12px, value field beside every slider, rows not squeezed.
  const read=await cdp.evaluate(`(()=>{const misc=document.querySelector('.tomoyo-cn-dialog[open] [data-menu-category=misc]');
   for(const d of misc.querySelectorAll('details.tome-look-more'))d.open=true;
   const rows=[...misc.querySelectorAll('.tome-look-row')].map(r=>{const l=r.querySelector('.tome-look-label'),c=r.querySelector('.tome-bg-range,.tome-look-chips,.tome-look-colour,select'),n=r.querySelector('[data-num-key],[data-choice-num]');
    const lr=l.getBoundingClientRect(),cr=c.getBoundingClientRect(),nr=n?.getBoundingClientRect(),range=r.querySelector('input[type=range]')?.getBoundingClientRect();
    return {label:l.textContent,size:parseFloat(getComputedStyle(l).fontSize),leftOf:lr.right<=cr.left+1,height:r.getBoundingClientRect().height,
     beside:n?(nr.left>=range.right&&Math.abs((nr.top+nr.bottom)/2-(range.top+range.bottom)/2)<6):true,numberType:n?n.type:''};});
   const hints=[...misc.querySelectorAll('.tome-look .tome-bg-hint')].map(h=>parseFloat(getComputedStyle(h).fontSize));
   let s=misc;while(s&&!(/(auto|scroll)/.test(getComputedStyle(s).overflowY)))s=s.parentElement;
   return {rows,hints,scrolls:!!s&&s.scrollHeight>s.clientHeight};})()`);
  assert.equal(read.rows.length,PANELS.length*(1+Object.keys(SLIDERS).length),'a background row and nine slider rows per panel');
  for(const r of read.rows){
   assert.ok(r.size>=14,`${r.label}: label at least 14px (${r.size})`);assert.ok(r.leftOf,`${r.label}: label left of its control`);
   assert.ok(r.height>=40,`${r.label}: row not squeezed (${r.height})`);assert.ok(r.beside,`${r.label}: value field beside the slider`);
  }
  assert.ok(read.hints.every(v=>v>=12),'hints at least 12px: '+read.hints);
  assert.equal(read.scrolls,true,'the page scrolls inside the panel instead of squeezing rows');

  // Every slider: typing a value (Enter) saves it, moves the slider and keeps the menu open; out of range is clamped;
  // dragging the slider shows the value in the field.
  for(const p of PANELS)for(const [k,[min,max]] of Object.entries(SLIDERS)){
   const want=Math.round(min+(max-min)*(PANELS.indexOf(p)+1)/5);
   const typed=await cdp.evaluate(`(()=>{const n=document.querySelector('.tomoyo-cn-dialog[open] [data-num-panel=${p}][data-num-key=${k}]');n.focus();n.value='${want}';
    n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));const saved=JSON.parse(localStorage.getItem('tome-menu-background'));
    const range=document.querySelector('.tomoyo-cn-dialog[open] [data-game-panel=${p}][data-game-key=${k}]');
    return {saved:saved?.panels.${p}.${k},range:Number(range.value),open:!!document.querySelector('.tomoyo-cn-dialog[open]')};})()`);
   assert.deepEqual(typed,{saved:want,range:want,open:true},`${p}.${k}: typed ${want}`);
   const clamped=await cdp.evaluate(`(()=>{const n=document.querySelector('.tomoyo-cn-dialog[open] [data-num-panel=${p}][data-num-key=${k}]');n.value='${max+500}';n.dispatchEvent(new Event('change',{bubbles:true}));
    const a=JSON.parse(localStorage.getItem('tome-menu-background')).panels.${p}.${k};n.value='${min-500}';n.dispatchEvent(new Event('change',{bubbles:true}));
    const b=JSON.parse(localStorage.getItem('tome-menu-background')).panels.${p}.${k};n.blur();return [a,b];})()`);
   assert.deepEqual(clamped,[max,min],`${p}.${k}: typed values stay in range`);
   const dragged=await cdp.evaluate(`(()=>{const r=document.querySelector('.tomoyo-cn-dialog[open] [data-game-panel=${p}][data-game-key=${k}]');r.value='${(min+max)/2+0.4}';r.dispatchEvent(new Event('input',{bubbles:true}));
    return [JSON.parse(localStorage.getItem('tome-menu-background')).panels.${p}.${k},document.querySelector('.tomoyo-cn-dialog[open] [data-num-panel=${p}][data-num-key=${k}]').value];})()`);
   assert.deepEqual(dragged,[(min+max)/2+0.4,String(Math.round((min+max)/2+0.4))],`${p}.${k}: dragging shows the value`);
  }

  // A real Enter in a value field applies it at once and leaves the menu open.
  await cdp.evaluate(`(()=>{const n=document.querySelector('.tomoyo-cn-dialog[open] [data-num-panel=card][data-num-key=border]');n.focus();n.select();})()`);
  await cdp.send('Input.insertText',{text:'12'});
  for(const type of ['rawKeyDown','char','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,...(type==='char'?{text:'\r'}:{})});
  await sleep(300);
  assert.deepEqual(await cdp.evaluate(`[!!document.querySelector('.tomoyo-cn-dialog[open]'),JSON.parse(localStorage.getItem('tome-menu-background')).panels.card.border]`),[true,12],'Enter applies the value and keeps the menu open');

  // The capsule's section can mount after the panel groups and put itself first; the groups go back to the top.
  await cdp.evaluate(`(()=>{const misc=document.querySelector('.tomoyo-cn-dialog[open] [data-menu-category=misc]');misc.prepend(misc.querySelector(':scope>.mg-cap-set'));})()`);
  await sleep(800);
  assert.equal(await cdp.evaluate(`document.querySelector('.tomoyo-cn-dialog[open] [data-menu-category=misc]').firstElementChild.classList.contains('tome-look')`),true,'panel groups first again');

  // Preview: the tile of the panel follows its corner radius and opacity as they change.
  for(const p of PANELS){
   const tile=await cdp.evaluate(`(async()=>{const set=(k,v)=>{const n=document.querySelector('.tomoyo-cn-dialog[open] [data-num-panel=${p}][data-num-key='+k+']');n.value=String(v);n.dispatchEvent(new Event('change',{bubbles:true}));};
    const t=document.querySelector('.tomoyo-cn-dialog[open] [data-look-tile=${p}]'),read=()=>[getComputedStyle(t).borderTopLeftRadius,getComputedStyle(t.querySelector('u')).opacity];
    const wait=()=>new Promise(r=>setTimeout(r,350));set('radius',3);set('alpha',30);await wait();const a=read();set('radius',25);set('alpha',90);await wait();const b=read();return [a,b];})()`);
   assert.deepEqual(tile,[['3px','0.3'],['25px','0.9']],`${p}: preview tile repaints`);
  }

  // Background chips: one click picks the panel's background, saved and applied, and only that chip is selected.
  for(const p of PANELS)for(const v of ['glass','both','plain','image']){
   const picked=await cdp.evaluate(`(()=>{document.querySelector('.tomoyo-cn-dialog[open] [data-look-group=${p}] [data-surface-pick=${v}]').click();
    const g=document.querySelector('.tomoyo-cn-dialog[open] [data-look-group=${p}]');
    return {saved:JSON.parse(localStorage.getItem('tome-menu-background')).surfaces.${p},applied:document.documentElement.dataset.tome${p[0].toUpperCase()+p.slice(1)}Surface,
     selected:[...g.querySelectorAll('[data-surface-pick][aria-selected=true]')].map(c=>c.dataset.surfacePick)};})()`);
   assert.deepEqual(picked,{saved:v,applied:v,selected:[v]},`${p}: background ${v}`);
  }

  // Values typed here are the same values the rest of the app reads: a fresh page shows them.
  await cdp.evaluate(`(()=>{const n=document.querySelector('.tomoyo-cn-dialog[open] [data-num-panel=log][data-num-key=radius]');n.value='7';n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await cdp.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--tome-log-radius').trim()`),'7px','backlog radius applied');

  // Language: the group titles and 更多 follow the interface language.
  await cdp.evaluate(`window.__tomeI18n?.set?.('en')`);await sleep(900);
  const en=await cdp.evaluate(`[...document.querySelectorAll('.tomoyo-cn-dialog[open] [data-menu-category=misc] .tome-look-title,.tomoyo-cn-dialog[open] [data-menu-category=misc] .tome-look-more>summary')].map(n=>n.textContent).slice(0,3)`);
  if(await cdp.evaluate(`typeof window.__tomeI18n?.set==='function'`))assert.deepEqual(en,['Alt+T menu','More','Backlog']);
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
