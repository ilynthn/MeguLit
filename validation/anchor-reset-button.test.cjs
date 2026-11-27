'use strict';
/* 2026-11-19 (user, 素晴らしき日々: 「默认的位置贼偏」; asked for a button): 校准 has 「回到游戏原字位置」 next to 拖动文本框. It is greyed
   with 「本作品尚无引擎坐标」 until the line sits on the engine's glyph places; then one click sets this game's anchored offset to
   0, fills the fields with 0, applies it and saves it to the game's style profile. The real reader page runs in headless Edge. */
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
const PROBE=`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const b=window.__tomoyoChinese,d=document.querySelector('.tomoyo-cn-dialog[open]');d.querySelector('[data-menu-key=calibrate]').click();await w(300);
 const p=d.querySelector('[data-menu-category=calibrate]'),q=s=>p.querySelector(s),reset=q('[data-gal-anchor-reset]'),drag=q('[data-gal-drag]');
 const out={text:reset?.textContent,before:[reset?.disabled,reset?.dataset.mgTip??reset?.title],sameRow:reset?.parentElement===drag?.parentElement,
  look:(()=>{const s=getComputedStyle(reset),o=getComputedStyle(drag);return [s.borderRadius===o.borderRadius,s.fontSize===o.fontSize,s.height===o.height];})()};
 /* the game's place is in use (text-place: placement on, anchored; the fields read this stable mode since 2026-11-21) and the line sits on it (the class) */
 b.textPlaceMode?.({on:true});b.textPlaceAnchor?.(true);await w(100);document.body.classList.add('megulit-anchored');await w(100);out.enabled=[reset.disabled,reset.dataset.mgTip??reset.title];
 const y=q('[name=galY]');y.value='43';y.dispatchEvent(new Event('input',{bubbles:true}));await w(50);out.offsetBefore=b.galPreferences().anchorDY;
 let saved=null;b.saveGameProfileFromMenu=pr=>{saved=pr;return true;};reset.click();await w(50);
 out.after={anchorDX:b.galPreferences().anchorDX,anchorDY:b.galPreferences().anchorDY,fields:[q('[name=galX]').value,y.value],saved:saved&&[saved.anchorDX,saved.anchorDY],global:(()=>{try{return JSON.parse(localStorage.getItem('tomoyo-gal-settings')||'{}').anchorDY;}catch{return 'err';}})()};
 return out;})()`;
test('校准: 回到游戏原字位置 is greyed without engine places; with them it clears the offset, applies and saves it to the profile',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-anchor-reset-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);window.__tomoyoChinese.toggleGalMenu();return 1})()`);
  await sleep(1500);const s=await cdp.evaluate(PROBE);
  assert.equal(s.text,'回到游戏原字位置');assert.deepEqual(s.before,[true,'本作品尚无引擎坐标'],'disabled, the reason as tooltip (the look is the menu-wide :disabled style)');
  assert.ok(s.sameRow,'in the row of 拖动文本框');assert.deepEqual(s.look,[true,true,true],'looks like 拖动文本框');
  assert.deepEqual(s.enabled,[false,''],'usable on engine places');assert.equal(s.offsetBefore,43,'a large offset was set');
  assert.deepEqual(s.after.saved,[0,0],'saved to the game profile as 0');assert.equal(s.after.anchorDX,0);assert.equal(s.after.anchorDY,0,'applied at once');
  assert.deepEqual(s.after.fields.map(Number),[0,0]);assert.equal(s.after.global,undefined,'the global preferences never hold an offset');
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
