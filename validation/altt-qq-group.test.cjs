'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-29 (owner: 在关于页的我那个介绍里面 加入个qq群群号复制和展示二维码功能 / 我说的是alt+t): the Alt+T 关于 page's
   MeguLit entry gets 「QQ 交流群 1131267542」 with 复制 (copies the number, says 已复制) and 二维码, which opens the home
   capsule's card (web/qq-group.js qqCardHTML), 用电脑 QQ 加群 included. The card must stay inside the game window and must
   not be cut by the panel: it lives in a fixed layer, is a click region of the overlay, shrinks in a small window and
   closes with the menu. The real reader page runs in headless Edge; skipped without Edge. QQ_SHOTS=<dir> saves pictures. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const WEB=path.join(__dirname,'..','web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const STUB=`<script>window.__calls=[];window.__copied=[];
Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{window.__copied.push(t);}},configurable:true});
window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='open_source'){window.__calls.push(r.url);return {opened:true};}if(r.action==='home')return {preferences:{language:new URLSearchParams(location.search).get('lang')||'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};
  if(r.action==='reader_bootstrap')return {engines:[],native:{}};if(r.action==='reader_message'){if(r.message&&r.message.type==='galHitRegions')window.__hits=r.message;return {replies:[]};}return {};}return null;}};</script>`;
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
function serve(){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
 if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}res.writeHead(404);return res.end();}
 let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}
const OPEN_ABOUT=`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));
 const send=window.__tomoyoTranslateRequest;if(send&&!send.__spy){window.__tomoyoTranslateRequest=m=>{try{const x=JSON.parse(m);if(x.type==='galHitRegions')window.__hits=x;}catch{}return send(m);};window.__tomoyoTranslateRequest.__spy=1;}
 window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');
 setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);
 if(!document.querySelector('.tomoyo-cn-dialog[open]'))window.__tomoyoChinese.toggleGalMenu();await w(1200);const d=document.querySelector('.tomoyo-cn-dialog[open]');const tab=d&&d.querySelector('.tomoyo-menu-tabs button[data-menu-key=about]');if(!tab)return 'no about tab';tab.click();
 for(let i=0;i<40&&!document.querySelector('.tomoyo-cn-dialog[open] [data-tome-qq-qr]');i++)await w(100);return document.querySelector('.tomoyo-cn-dialog[open] [data-tome-qq-qr]')?'ok':'no qq row';})()`;
const STATE=`(async()=>{const d=document.querySelector('.tomoyo-cn-dialog[open]'),row=document.querySelector('.tome-qq'),pop=document.querySelector('.tome-qq-pop'),card=pop&&pop.querySelector('.qq-card');
 const m=await import('/qq-group.js'),home=document.createElement('div');home.innerHTML=m.qqCardHTML('zh',s=>String(s));
 const shape=el=>[...el.querySelectorAll('*')].map(n=>n.tagName+'.'+n.className+(n.dataset.qqCopy!==undefined?'[copy]':'')+(n.dataset.qqOpen!==undefined?'[open]':'')).join(' ');
 const c=card&&!card.hidden?card.getBoundingClientRect():null,dpr=devicePixelRatio||1;
 const at=(x,y)=>{const e=document.elementFromPoint(x,y);return !!e&&card.contains(e);};
 /* the card has its own region, the size it is painted at (not the dialog's region, not the unscaled box) */
 const near=r=>!!c&&Math.abs(r.x-c.left*dpr)<=2&&Math.abs(r.y-c.top*dpr)<=2&&Math.abs(r.x+r.width-c.right*dpr)<=2&&Math.abs(r.y+r.height-c.bottom*dpr)<=2;
 const btn=sel=>{const b=document.querySelector(sel);if(!b)return null;const r=b.getBoundingClientRect();return [Math.round(r.left+r.width/2),Math.round(r.top+r.height/2)];};
 return {menuOpen:!!document.querySelector('.tomoyo-cn-dialog[open]:not([data-leaving])'),inMeguLit:!!row&&row.closest('.tome-credit')?.querySelector('b')?.textContent==='MeguLit',afterLinks:!!row&&row.previousElementSibling?.classList.contains('tome-credit-links'),
  text:row?[...row.children].map(n=>n.textContent):[],state:row?.querySelector('.tome-qq-state')?.textContent||'',
  open:!!c,outsidePanel:!!pop&&!(d&&d.contains(pop))&&pop.parentElement===document.body,sameCard:!!card&&shape(card)===shape(home.firstElementChild),
  qrLoaded:!!card&&card.querySelector('.qq-qr').complete&&card.querySelector('.qq-qr').naturalWidth>0,
  inWindow:!!c&&c.left>=0&&c.top>=0&&c.right<=innerWidth&&c.bottom<=innerHeight,
  coversButton:!!c&&(()=>{const b=document.querySelector('[data-tome-qq-qr]').getBoundingClientRect();return !(b.right<=c.left||b.left>=c.right||b.bottom<=c.top||b.top>=c.bottom);})(),
  uncut:!!c&&[[c.left+6,c.top+6],[c.right-6,c.top+6],[c.left+6,c.bottom-6],[c.right-6,c.bottom-6],[c.left+c.width/2,c.top+c.height/2]].every(([x,y])=>at(x,y)),
  scale:c?+(c.width/card.offsetWidth).toFixed(3):0,
  region:!!c&&!!(window.__hits?.regions||[]).find(near),
  hostRegion:!!c&&await (async()=>{const {hostRegionMessage}=await import('/reader/host-regions.js');const b=document.body,had=b.classList.contains('tomoyo-ui-translation');b.classList.remove('tomoyo-ui-translation');
   try{return !!hostRegionMessage({type:'galHitRegions',menuOpen:true,regions:[]}).regions.find(near);}finally{if(had)b.classList.add('tomoyo-ui-translation');}})(),
  pops:document.querySelectorAll('.tome-qq-pop').length,focusInCard:!!card&&card.contains(document.activeElement),
  expanded:document.querySelector('[data-tome-qq-qr]')?.getAttribute('aria-expanded'),
  copied:window.__copied.slice(),calls:window.__calls.slice(),qr:btn('[data-tome-qq-qr]'),copy:btn('[data-tome-qq-copy]'),
  cardCopy:c?btn('.tome-qq-pop [data-qq-copy]'):null,cardOpen:c?btn('.tome-qq-pop [data-qq-open]'):null};})()`;

test('Alt+T 关于: QQ group number with 复制, and 二维码 opens the home card inside the game window',{skip:!hasEdge&&'Edge not installed',timeout:150000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-altt-qq-'));let server,cdp;const shots=process.env.QQ_SHOTS;if(shots)fs.mkdirSync(shots,{recursive:true});
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  const size=async(width,height)=>cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const click=async([x,y])=>{await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});await sleep(300);};
  const shoot=async name=>{if(!shots)return;const r=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(shots,name+'.png'),Buffer.from(r.data,'base64'));};
  const load=async(lang='zh')=>{await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html?lang=${lang}`});
   let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}assert.ok(ready,'reader page loaded');
   assert.equal(await cdp.evaluate(OPEN_ABOUT),'ok');await sleep(400);};
  await size(1280,720);await load();let s=await cdp.evaluate(STATE);
  assert.ok(s.inMeguLit&&s.afterLinks,'the row is in MeguLit\'s own entry, under its links');
  assert.deepEqual(s.text,['QQ 交流群','1131267542','复制','二维码',''],'label, number, 复制, 二维码');
  assert.ok(!s.open&&s.expanded==='false','the card starts closed');
  await shoot('altt-qq-row');
  await click(s.copy);s=await cdp.evaluate(STATE);assert.deepEqual(s.copied,['1131267542'],'复制 copies the number');assert.equal(s.state,'已复制');
  await sleep(2000);assert.equal((await cdp.evaluate(STATE)).state,'','已复制 goes away');
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:s.qr[0],y:s.qr[1]});await sleep(500);assert.ok(!(await cdp.evaluate(STATE)).open,'hover alone does not open it');
  await click(s.qr);await sleep(400);s=await cdp.evaluate(STATE);
  assert.ok(s.open&&s.expanded==='true','二维码 opens the card');
  assert.ok(s.sameCard,'the home capsule\'s card (qqCardHTML), not another one');assert.ok(s.qrLoaded,'the QR picture loads');
  assert.ok(s.outsidePanel,'the card is not inside the scrolling panel');
  assert.ok(s.inWindow&&s.uncut,'the whole card is inside the game window and on top: '+JSON.stringify(s));
  assert.ok(!s.coversButton,'the card does not cover the 二维码 button');assert.equal(s.scale,1);
  await sleep(300);s=await cdp.evaluate(STATE);assert.ok(s.region,'the card is its own click region of the overlay (translation mode), so clicks reach it and not the game');assert.ok(s.hostRegion,'and in normal mode (host-regions.js)');
  assert.ok(s.focusInCard,'focus moves into the card, so the keyboard reaches its buttons');
  await shoot('altt-qq-card');
  await click(s.cardCopy);assert.deepEqual((await cdp.evaluate(STATE)).copied,['1131267542','1131267542'],'the card\'s own 复制');
  await click(s.cardOpen);assert.deepEqual((await cdp.evaluate(STATE)).calls,['https://qm.qq.com/q/C95LXYb5Sg'],'用电脑 QQ 加群 opens the join page');
  assert.ok((await cdp.evaluate(STATE)).open,'clicks inside the card keep it open');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(300);
  s=await cdp.evaluate(STATE);assert.ok(!s.open,'Escape closes the card');assert.ok(s.menuOpen,'and only the card: the Alt+T menu stays open');
  /* the panel is rebuilt (menu layout, language): old rows leave no cards or listeners behind */
  await cdp.evaluate(`(async()=>{const host=document.querySelector('.tomoyo-cn-dialog[open] .tomoyo-about');for(let i=0;i<5;i++){host.replaceChildren(window.__tomeAboutPanel());await new Promise(r=>setTimeout(r,50));}return 1})()`);
  await sleep(1800);s=await cdp.evaluate(STATE);assert.equal(s.pops,1,'one card layer, for the row on the page');
  await click(s.qr);await sleep(300);s=await cdp.evaluate(STATE);assert.ok(s.open&&s.inWindow&&s.uncut,'the card of the rebuilt row works');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(300);
  assert.ok(!(await cdp.evaluate(STATE)).open);
  /* a small game window: the card shrinks to fit and is still whole */
  await size(640,360);await sleep(500);s=await cdp.evaluate(STATE);
  if(!s.qr||!(await cdp.evaluate(`!!document.querySelector('.tomoyo-cn-dialog[open] [data-tome-qq-qr]')`)))assert.equal(await cdp.evaluate(OPEN_ABOUT),'ok');
  await cdp.evaluate(`document.querySelector('[data-tome-qq-qr]').scrollIntoView({block:'center'})`);await sleep(200);s=await cdp.evaluate(STATE);
  await click(s.qr);await sleep(400);s=await cdp.evaluate(STATE);
  assert.ok(s.open&&s.inWindow&&s.uncut,'640×360 window: the card is whole and inside: '+JSON.stringify(s));assert.ok(s.scale<1,'it shrinks to fit: '+s.scale);assert.ok(!s.coversButton,'640×360: the card does not cover the button');
  await sleep(300);s=await cdp.evaluate(STATE);assert.ok(s.region&&s.hostRegion,'640×360: the region is the shrunk card, not the unscaled box');
  await shoot('altt-qq-card-small');
  /* closing the menu closes the card */
  await cdp.evaluate('window.__tomoyoChinese.toggleGalMenu()');await sleep(300);
  assert.ok(!(await cdp.evaluate(STATE)).open,'the card goes with the menu, at once');
  /* the other languages use the card's own words */
  for(const [lang,label,copy,qr] of [['en','QQ group','Copy','QR code'],['ja','QQ グループ','コピー','QR コード']]){
   await size(1280,720);await load(lang);const txt=(await cdp.evaluate(STATE)).text;assert.deepEqual(txt,[label,'1131267542',copy,qr,''],lang);}
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
