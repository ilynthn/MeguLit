'use strict';
/* 2026-11-15 (user: alt+t内部就不要按部分来加玻璃底框了 看的很烦 / anki这种就挺好): every Alt+T tab is scanned for section containers
   with a frame or a background (controls excluded). The real reader page runs in headless Edge. Skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const STUB=`<script>window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};
  if(r.action==='reader_bootstrap')return {engines:[],native:{}};if(r.action==='reader_message')return {replies:[]};return {};}return null;}};</script>`;
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
function serve(){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
 if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}res.writeHead(404);return res.end();}
 let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}
const PROBE="(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const d=document.querySelector('.tomoyo-cn-dialog[open]');const out={};\n const CTRL='input,select,textarea,button,kbd,code,svg,.switch,.slider,[role=switch],.mg-select,.mg-select *,.select-trigger,.tomoyo-slider-value,summary,img,canvas,.color-swatch,[class*=swatch],[class*=chip],.tome-color-panel *';\n for(const b of d.querySelectorAll('.tomoyo-menu-tabs button[data-menu-key]')){b.click();await w(250);\n  for(const det of d.querySelectorAll('.tomoyo-menu-content details'))det.open=true;await w(150);\n  const list={};for(const n of d.querySelectorAll('.tomoyo-menu-content *')){if(n.matches(CTRL)||n.closest('button,select,.mg-select,label.switch'))continue;if(!n.getClientRects().length)continue;\n   const cs=getComputedStyle(n);const bw=['Top','Right','Bottom','Left'].filter(s=>parseFloat(cs['border'+s+'Width'])>0&&cs['border'+s+'Style']!=='none');\n   const bg=cs.backgroundColor!=='rgba(0, 0, 0, 0)'&&cs.backgroundColor!=='transparent'||cs.backgroundImage!=='none';const full=bw.length>=3;\n   if(!(full||bg))continue;const r=n.getBoundingClientRect();if(r.width<120||r.height<28)continue;\n   const key=n.tagName.toLowerCase()+'.'+String(n.className).trim().split(/\\s+/).slice(0,3).join('.')+(full?' [border]':'')+(bg?' [bg '+cs.backgroundColor+']':'');list[key]=(list[key]||0)+1;}\n  out[b.dataset.menuKey]=list;}\n return out;})()";
test('Alt+T sections sit on the panel: no section frames or glass boxes in any tab (only 危险区, the 记录 preview, the 外观 panel previews and the segmented sub-tab trough keep one)',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-altt-sections-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);window.__tomoyoChinese.toggleGalMenu();return 1})()`);
  await sleep(1500);const tabs=await cdp.evaluate(PROBE);assert.ok(Object.keys(tabs).length>=8,'every tab visited: '+Object.keys(tabs));
  for(const [tab,list] of Object.entries(tabs))for(const key of Object.keys(list))assert.match(key,/tome-reset-zone|tome-log-preview|tome-log-item|tome-look-tile|mg-subtabs/,tab+': boxed section left: '+key);
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
