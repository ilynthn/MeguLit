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
   assert.ok(!('url' in i)&&!('links' in i),name+': the roll has no links (only MeguLit itself keeps them)');
   if(i.by!==undefined)assert.ok(typeof i.by==='string'&&i.by.trim(),i.name+': by');
   if(i.note!==undefined)for(const l of LANGS)assert.ok(typeof i.note[l]==='string'&&i.note[l].trim(),i.name+': note.'+l);
   if(i.match!==undefined)assert.ok(Array.isArray(i.match)&&i.match.every(m=>typeof m==='string'&&m.length>=3),i.name+': match');
  }
 }
 for(const id of ['inspiration','hook','contributors','libraries','data','fonts','feedback'])assert.ok(ids.has(id),'group '+id);
 for(const n of ['tomoyo','LunaTranslator / LunaHook','RRFZ','JMdict','GARbro'])assert.ok(names.has(n),n+' is credited');
 assert.ok(!names.has('MeguLit'),'MeguLit keeps its own card above the roll');
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
