'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-27 (owner: 关于页感谢太少了 除了我以外保留跳转链接 其他需要感谢的就类似电影结尾致谢名单那样就行了):
   the Alt+T 关于 page keeps MeguLit's own card with its GitHub / bilibili links, and everyone else is a credits roll read from
   web/credits.json. Checks: the data file is well formed and credits every THIRD-PARTY.md bullet; the real reader page in
   headless Edge renders every name, the roll creeps upward, stops while hovered, follows the wheel, and is a still list
   under prefers-reduced-motion. CREDITS_SHOTS=<dir> also saves screenshots. Browser parts are skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const LANGS=['zh','en','ja'],nameOf=i=>typeof i.name==='string'?i.name:i.name?.zh;
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));

/* the hosts services/bridge.cjs open_source lets the About page open in the browser */
const OPENABLE=JSON.parse(fs.readFileSync(path.join(ROOT,'services/bridge.cjs'),'utf8').match(/case 'open_source':.*?\.includes\(url\.hostname\)/s)[0].match(/\[('[^\]]*')\]/)[1].replace(/'/g,'"').replace(/^/,'[').replace(/$/,']'));
const readCredits=()=>JSON.parse(fs.readFileSync(path.join(WEB,'credits.json'),'utf8'));
/* Top-level THIRD-PARTY.md entries: "- " bullets (with their indented sub-bullets) and the "E194:" style paragraph. */
function thirdPartyEntries(){const out=[];for(const line of fs.readFileSync(path.join(ROOT,'THIRD-PARTY.md'),'utf8').split(/\r?\n/)){
 if(/^(- |E\d+:)/.test(line))out.push(line);else if(/^\s+- /.test(line)&&out.length)out[out.length-1]+=' '+line.trim();}return out;}

test('web/credits.json: groups with three-language titles, named items, notes in every UI language',()=>{
 const data=readCredits();assert.equal(data.version,1);assert.ok(Array.isArray(data.groups)&&data.groups.length>=6,'groups');
 const ids=new Set(),names=new Set();
 for(const g of data.groups){
  assert.match(String(g.id),/^[a-z][a-z0-9-]*$/,'group id '+g.id);assert.ok(!ids.has(g.id),'duplicate group '+g.id);ids.add(g.id);
  for(const l of LANGS)assert.ok(typeof g.title?.[l]==='string'&&g.title[l].trim(),g.id+': title.'+l);
  assert.ok(Array.isArray(g.items)&&g.items.length,g.id+': items');
  for(const i of g.items){
   if(typeof i.name!=='string')for(const l of LANGS)assert.ok(typeof i.name?.[l]==='string'&&i.name[l].trim(),g.id+': name.'+l);
   const name=nameOf(i);assert.ok(typeof name==='string'&&name.trim(),g.id+': item without a name');assert.ok(!names.has(name),'listed twice: '+name);names.add(name);
   assert.ok(!('links' in i),name+': one project page at most, as url');
   if(i.url!==undefined){const u=new URL(i.url);assert.equal(u.protocol,'https:',name+': url is https');assert.ok(OPENABLE.includes(u.hostname),name+': '+u.hostname+' is not a host open_source opens (services/bridge.cjs)');}
   if(i.by!==undefined)assert.ok(typeof i.by==='string'&&i.by.trim(),i.name+': by');
   if(i.note!==undefined)for(const l of LANGS)assert.ok(typeof i.note[l]==='string'&&i.note[l].trim(),i.name+': note.'+l);
   if(i.match!==undefined)assert.ok(Array.isArray(i.match)&&i.match.every(m=>typeof m==='string'&&m.length>=3),i.name+': match');
  }
 }
 for(const id of ['inspiration','hook','contributors','libraries','data','fonts','feedback'])assert.ok(ids.has(id),'group '+id);
 for(const n of ['tomoyo','LunaTranslator / LunaHook','RRFZ','sugar787878','JMdict','GARbro','AivisSpeech','Anki','Tauri · Wry'])assert.ok(names.has(n),n+' is credited');
 assert.ok(!names.has('MeguLit'),'MeguLit keeps its own card above the roll');
 /* owner 2026-11-29 (把tomoyo移动到中间 → 整份名单的中间): tomoyo is not the first name but sits in the middle of the roll */
 const all=data.groups.flatMap(g=>g.items.map(nameOf)),at=all.indexOf('tomoyo')/(all.length-1);
 assert.ok(at>=0.35&&at<=0.65,'tomoyo is in the middle of the roll, not at '+(all.indexOf('tomoyo')+1)+' / '+all.length);
});

test('web/credits.json credits every THIRD-PARTY.md entry (or names why it is not a credit)',()=>{
 const data=readCredits(),entries=thirdPartyEntries(),items=data.groups.flatMap(g=>g.items),md=fs.readFileSync(path.join(ROOT,'THIRD-PARTY.md'),'utf8');
 assert.ok(entries.length>=50,'THIRD-PARTY.md entries parsed: '+entries.length);
 const missing=entries.filter(e=>!items.some(i=>(i.match||[]).some(m=>e.includes(m)))&&!(data.exempt||[]).some(x=>e.includes(x.match)));
 assert.deepEqual(missing.map(e=>e.slice(0,90)),[],'THIRD-PARTY.md entries with nobody credited in web/credits.json');
 for(const i of items)for(const m of i.match||[])assert.ok(md.includes(m),i.name+': "'+m+'" is not in THIRD-PARTY.md any more');
 for(const x of data.exempt||[]){assert.ok(md.includes(x.match),'exempt entry gone: '+x.match);assert.ok(String(x.why||'').trim(),'exempt without a reason: '+x.match);}
 /* The match check above is real: an entry nobody covers is reported. */
 const probe='- Foo-Bar-Credits-Probe (someone, MIT): used somewhere';assert.ok(!items.some(i=>(i.match||[]).some(m=>probe.includes(m))));
});

/* ---------- the real reader page ---------- */
const STUB=`<script>window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};
  if(r.action==='reader_bootstrap')return {engines:[],native:{}};if(r.action==='reader_message')return {replies:[]};return {};}return null;}};</script>`;
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
function serve(){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
 if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}res.writeHead(404);return res.end();}
 let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}

const OPEN_ABOUT=`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');
 setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);
 window.__tomoyoChinese.toggleGalMenu();await w(1200);const d=document.querySelector('.tomoyo-cn-dialog[open]');const tab=d&&d.querySelector('.tomoyo-menu-tabs button[data-menu-key=about]');if(!tab)return 'no about tab';tab.click();
 for(let i=0;i<40&&!document.querySelector('.tomoyo-cn-dialog[open] .tome-roll-item');i++)await w(100);return 'ok';})()`;
const STATE=`(()=>{const d=document.querySelector('.tomoyo-cn-dialog[open]'),roll=d&&d.querySelector('.tome-roll');const r=roll?roll.getBoundingClientRect():null;
 return {cards:[...d.querySelectorAll('.tome-credit')].map(c=>({name:c.querySelector('b')?.textContent,links:[...c.querySelectorAll('button')].map(b=>b.textContent)})),
  names:[...d.querySelectorAll('.tome-roll-item b')].map(b=>b.textContent),heads:[...d.querySelectorAll('.tome-roll-head')].map(h=>h.textContent),
  rollButtons:roll?roll.querySelectorAll('button,a').length:-1,note:d.querySelector('.tome-credit-note')?.textContent||'',
  top:roll?roll.scrollTop:-1,max:roll?roll.scrollHeight-roll.clientHeight:-1,height:r?Math.round(r.height):0,static:!!roll&&roll.classList.contains('static'),
  centre:r?[Math.round(r.left+r.width/2),Math.round(r.top+Math.min(r.height,300)/2)]:null};})()`;

test('Alt+T 关于: MeguLit card keeps its links, everyone else rolls like film credits',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const data=readCredits(),expected=data.groups.flatMap(g=>g.items.map(nameOf));
 const shots=process.env.CREDITS_SHOTS;if(shots)fs.mkdirSync(shots,{recursive:true});
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-credits-roll-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  const shoot=async name=>{if(!shots)return;const box=await cdp.evaluate(`(()=>{const r=document.querySelector('.tomoyo-cn-dialog[open]').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()`);
   const r=await cdp.send('Page.captureScreenshot',{format:'png',clip:{x:box[0],y:box[1],width:box[2],height:box[3],scale:1}});fs.writeFileSync(path.join(shots,name+'.png'),Buffer.from(r.data,'base64'));};
  const load=async()=>{await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
   let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
   assert.ok(ready,'reader page loaded');assert.equal(await cdp.evaluate(OPEN_ABOUT),'ok');};
  /* CI 2026-11-27: the Windows runner has animations off, so headless Edge reports prefers-reduced-motion: reduce by default.
     The moving roll is checked with no-preference set explicitly; reduce is checked at the end. */
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await load();await sleep(300);let s=await cdp.evaluate(STATE);
  assert.deepEqual(s.cards,[{name:'MeguLit',links:['GitHub','bilibili']}],'only MeguLit is a card, with GitHub and bilibili');
  assert.deepEqual(s.names,expected,'every name in web/credits.json is on the roll, in order');
  assert.deepEqual(s.heads,data.groups.map(g=>g.title.zh),'one heading per group');
  assert.ok(s.names.includes('tomoyo')&&s.names.includes('LunaTranslator / LunaHook'),'tomoyo and LunaTranslator moved into the roll');
  assert.equal(s.rollButtons,0,'no links in the roll');assert.match(s.note,/GPL-3\.0/,'licence note kept');
  assert.ok(s.height>=200&&s.height<=260&&s.max>500,'the roll is a window onto a long list: '+s.height+' / '+s.max);
  await shoot('after-start');
  /* creeps upward on its own */
  const t0=s.top;await sleep(1600);s=await cdp.evaluate(STATE);assert.ok(s.top>t0+10,'auto scroll: '+t0+' -> '+s.top);
  await cdp.evaluate(`document.querySelector('.tome-roll').scrollTop=${Math.round(s.max*0.45)}`);await sleep(900);await shoot('after-middle');
  /* hover stops it */
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:s.centre[0],y:s.centre[1]});await sleep(300);
  const h0=(await cdp.evaluate(STATE)).top;await sleep(1200);const h1=(await cdp.evaluate(STATE)).top;assert.ok(Math.abs(h1-h0)<=1,'paused while hovered: '+h0+' -> '+h1);
  /* the wheel scrolls it by hand */
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:s.centre[0],y:s.centre[1],deltaX:0,deltaY:-240});await sleep(500);
  const w1=(await cdp.evaluate(STATE)).top;assert.ok(w1<h1-100,'wheel scrolls back: '+h1+' -> '+w1);
  await sleep(1000);assert.ok(Math.abs((await cdp.evaluate(STATE)).top-w1)<=1,'still paused after the wheel while hovered');
  /* leaving resumes */
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:5});await sleep(3600);
  assert.ok((await cdp.evaluate(STATE)).top>w1+5,'resumes after the pointer leaves');
  /* reduced motion: a still, plain list */
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await load();await sleep(600);
  s=await cdp.evaluate(STATE);assert.ok(s.static,'reduced motion: plain list');assert.deepEqual(s.names,expected,'reduced motion: every name');
  assert.ok(s.max<=0&&s.height>1000,'reduced motion: the whole list, no inner window: '+s.height);
  const r0=s.top;await sleep(1200);assert.equal((await cdp.evaluate(STATE)).top,r0,'reduced motion: no auto scroll');
  await shoot('after-reduced');
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});

/* ---------- the main About page (owner 2026-11-28: 关于这边致谢弄一个小的电影结尾式感谢名单滚动 太多了现在) ---------- */
const MAIN_HARNESS=()=>{const links=(fs.readFileSync(path.join(WEB,'index.html'),'utf8').match(/<link rel="stylesheet"[^>]*>/g)||[]).join('');
 return `<!doctype html><html lang="zh-CN" data-theme="dark"><head><meta charset="utf-8">${links}</head><body><main style="padding:40px"></main>
<script type="module">import {aboutHTML,mountAbout} from './about.js';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));window.opened=[];
const api=async(cmd,args)=>{if(cmd==='open_source'){window.opened.push(args.url);return {opened:true};}return {};};
const main=document.querySelector('main');main.innerHTML=aboutHTML('zh',esc);mountAbout(main,api,()=>{},{games:[],stats:{}});window.ready=1;</script></body></html>`;};
function serveMain(){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname);
 if(rel==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(MAIN_HARNESS());}
 const file=path.join(WEB,rel);if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}
const MAIN_STATE=`(()=>{const roll=document.querySelector('.ab-thanks [data-credits]');const r=roll.getBoundingClientRect();
 return {shown:!roll.closest('.ab-thanks').hidden,rows:[...roll.querySelectorAll('.ab-cr')].map(x=>[x.firstElementChild.tagName,x.firstElementChild.textContent,x.lastElementChild.tagName,x.lastElementChild.textContent,x.lastElementChild.dataset.url||'']),
  centred:[...roll.querySelectorAll('.ab-cr')].slice(0,5).every(x=>{const a=x.firstElementChild.getBoundingClientRect(),b=x.lastElementChild.getBoundingClientRect();return Math.abs((a.left+a.right)/2-(r.left+r.width/2))<2&&Math.abs((b.left+b.right)/2-(r.left+r.width/2))<2&&a.bottom<=b.top+1;}),
  top:roll.scrollTop,max:roll.scrollHeight-roll.clientHeight,height:Math.round(r.height),still:roll.classList.contains('ab-still'),centre:[Math.round(r.left+r.width/2),Math.round(r.top+r.height/2)],
  mask:getComputedStyle(roll).maskImage||getComputedStyle(roll).webkitMaskImage,oldList:!!document.querySelector('.ab-thanks dl'),weights:[...new Set([...roll.querySelectorAll('.ab-cr-name')].map(n=>getComputedStyle(n).fontWeight))]};})()`;

test('main About page: credits are a small rolling window from web/credits.json; names with a page open it',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const data=readCredits(),rows=data.groups.flatMap(g=>g.items.map(i=>[i,g]));
 const shots=process.env.CREDITS_SHOTS;if(shots)fs.mkdirSync(shots,{recursive:true});
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-about-roll-'));let server,cdp;
 try{server=await serveMain();cdp=await startEdge(path.join(temp,'edge'));
  const shoot=async name=>{if(!shots)return;const box=await cdp.evaluate(`(()=>{const r=document.querySelector('.ab').getBoundingClientRect();return [r.left,r.top,r.width,Math.min(r.height,1000)]})()`);
   const r=await cdp.send('Page.captureScreenshot',{format:'png',clip:{x:box[0],y:box[1],width:box[2],height:box[3],scale:1}});fs.writeFileSync(path.join(shots,name+'.png'),Buffer.from(r.data,'base64'));};
  const load=async()=>{await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
   let ready=false;for(let i=0;i<80&&!ready;i++){await sleep(250);ready=await cdp.evaluate(`!!window.ready&&!!document.querySelector('.ab-cr')`).catch(()=>false);}assert.ok(ready,'about page rendered the credits');};
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await load();await sleep(400);let s=await cdp.evaluate(MAIN_STATE);
  assert.ok(s.shown&&!s.oldList,'the 致谢 section is the roll, not the old two-column list');
  assert.deepEqual(s.rows,rows.map(([i,g])=>['SMALL',(i.note&&i.note.zh)||g.title.zh,i.url?'BUTTON':'SPAN',nameOf(i),i.url||'']),'every web/credits.json entry: its use in small type over its name; a button only when it has a page');
  assert.ok(s.rows.some(r=>r[3]==='sugar787878')&&s.rows.some(r=>r[3]==='AivisSpeech'),'new names are in');
  assert.ok(s.centred,'use and name are centred, use above name');
  assert.deepEqual(s.weights,['400'],'names keep the regular weight of the old list');
  /* tomoyo is a roll entry like the rest, on the roll's middle axis */
  const tomoyo=await cdp.evaluate(`(()=>{const roll=document.querySelector('[data-credits]'),rr=roll.getBoundingClientRect(),row=[...roll.querySelectorAll('.ab-cr')].find(r=>r.lastElementChild.textContent==='tomoyo');if(!row)return null;
   const n=row.lastElementChild.getBoundingClientRect(),u=row.firstElementChild.getBoundingClientRect(),axis=rr.left+rr.width/2;return {inRoll:roll.contains(row),name:Math.abs((n.left+n.right)/2-axis),use:Math.abs((u.left+u.right)/2-axis),weight:getComputedStyle(row.lastElementChild).fontWeight,outside:[...document.querySelectorAll('.ab-thanks *')].some(e=>!roll.contains(e)&&e!==roll&&/tomoyo/i.test(e.textContent)&&!e.contains(roll))};})()`);
  assert.ok(tomoyo&&tomoyo.inRoll&&!tomoyo.outside,'tomoyo is in the roll, not on its own beside it');
  assert.ok(tomoyo.name<1&&tomoyo.use<1,'tomoyo is on the roll axis: '+JSON.stringify(tomoyo));assert.equal(tomoyo.weight,'400');
  assert.ok(s.height>=160&&s.height<=200&&s.max>1000,'a 160-200 px window onto the list: '+s.height);
  assert.match(String(s.mask),/linear-gradient/,'edges fade');
  const t0=s.top;await sleep(1600);s=await cdp.evaluate(MAIN_STATE);assert.ok(s.top>t0+10,'rolls upward by itself: '+t0+' -> '+s.top);
  await shoot('main-rolling');
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:s.centre[0],y:s.centre[1]});await sleep(300);
  const h0=(await cdp.evaluate(MAIN_STATE)).top;await sleep(1200);const h1=(await cdp.evaluate(MAIN_STATE)).top;assert.ok(Math.abs(h1-h0)<=1,'paused under the pointer');
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:s.centre[0],y:s.centre[1],deltaX:0,deltaY:400});await sleep(500);
  assert.ok((await cdp.evaluate(MAIN_STATE)).top>h1+100,'the wheel scrolls it');
  /* clicking a name with a page opens that page */
  const target=rows.find(([i])=>i.url&&i.name==='LunaTranslator / LunaHook')[0];
  const at=await cdp.evaluate(`(()=>{const b=[...document.querySelectorAll('.ab-cr button')].find(b=>b.textContent==='LunaTranslator / LunaHook');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return [Math.round(r.left+r.width/2),Math.round(r.top+r.height/2)]})()`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:at[0],y:at[1]});
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:at[0],y:at[1],button:'left',clickCount:1});await sleep(200);
  assert.deepEqual(await cdp.evaluate('window.opened'),[target.url],'opens the project page');
  /* the loop: at the bottom it rests, then starts again from the top */
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});await sleep(200);
  await cdp.evaluate(`(()=>{const r=document.querySelector('[data-credits]');r.scrollTop=r.scrollHeight;return 1})()`);
  let wrapped=false;for(let i=0;i<40&&!wrapped;i++){await sleep(250);wrapped=(await cdp.evaluate(MAIN_STATE)).top<50;}assert.ok(wrapped,'loops back to the top');
  /* reduced motion: no motion, still scrollable by hand */
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await load();await sleep(600);
  s=await cdp.evaluate(MAIN_STATE);assert.ok(s.still,'reduced motion');const r0=s.top;await sleep(1500);assert.equal((await cdp.evaluate(MAIN_STATE)).top,r0,'reduced motion: no auto scroll');
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:s.centre[0],y:s.centre[1],deltaX:0,deltaY:300});await sleep(400);assert.ok((await cdp.evaluate(MAIN_STATE)).top>r0+100,'reduced motion: the wheel still scrolls');
  await shoot('main-reduced');
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
