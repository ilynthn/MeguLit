'use strict';
/* #1129 (external log: some lines, narration among them, never got a translation): the log asks for every line it holds without a translation
   (the reader's translateGuard) and keeps every late answer. The real reader page runs in headless Edge, stub transport; skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const WEB=path.join(__dirname,'..','web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));
const now=Date.now();
const entries=[{src:'千春\n「おはよう」',tr:'早上好',at:now-9000},{src:'雨が降り始めた。',tr:'',at:now-6000},{src:'誰もいない教室に、足音だけが響いた。',tr:'',at:now-3000},{src:'「行こう」',tr:'',at:now}];
const stubFor=list=>`<script>window.__seedState=${JSON.stringify({'tomoyo-backlog-session':JSON.stringify(list)})};window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return window.__seedState;
  if(r.action==='reader_bootstrap')return {engines:[],native:{}};if(r.action==='reader_message')return {replies:[]};return {};}return null;}};</script>`;
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
const serve=(list=entries)=>new Promise(res=>{const server=http.createServer((req,r)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
 if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){r.writeHead(404);return r.end();}
 let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+stubFor(list)));
 r.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});r.end(data);});server.listen(0,'127.0.0.1',()=>res(server));});
test('the log asks for lines without a translation and keeps late answers',{skip:!hasEdge&&'Edge not installed',timeout:60000},async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-log-missing-')),cdp=await startEdge(temp),server=await serve();
 try{
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  for(let i=0;i<100&&!(await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false));i++)await sleep(100);
  const out=await cdp.evaluate(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),b=window.__tomoyoChinese,sent=[];window.__tomoyoMode.set('translation');
   window.__tomoyoTranslateRequest=m=>{try{sent.push(JSON.parse(m));}catch{}};
   b.openBacklog();await w(300);
   const asked=sent.filter(m=>m.type==='translateGuard').map(m=>m.text);
   b.deliverBackfill('雨が降り始めた。','雨开始下了。','guard',null);await w(300);
   b.deliverBackfill('誰もいない教室に、足音だけが響いた。','空无一人的教室里，只回荡着脚步声。','late',null);await w(300);
   const rows=[...document.querySelectorAll('.tome-log-item')].map(r=>({src:r.querySelector('.tome-log-src').textContent,tr:r.querySelector('.tome-log-tr').textContent}));
   return {asked,rows};})()`);
  assert.deepEqual(out.asked.sort(),['誰もいない教室に、足音だけが響いた。','雨が降り始めた。'].sort(),'the two untranslated lines (not the newest) are asked');
  assert.equal(out.rows.find(r=>/雨が/.test(r.src)).tr,'雨开始下了。');
  assert.match(out.rows.find(r=>/誰もいない/.test(r.src)).tr,/脚步声/);
 }finally{server.close();await cdp.stop();}
});
/* Codex #1176: more than six lines missing a translation: the first batch of six is followed by the rest a moment later */
test('a log with more than six untranslated lines asks for all of them in batches',{skip:!hasEdge&&'Edge not installed',timeout:60000},async()=>{
 const many=Array.from({length:10},(_,i)=>({src:'これは'+(i+1)+'番目の地の文である。',tr:'',at:now-(10-i)*1000}));
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-log-batches-')),cdp=await startEdge(temp),server=await serve(many);
 try{
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  for(let i=0;i<100&&!(await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false));i++)await sleep(100);
  const out=await cdp.evaluate(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),b=window.__tomoyoChinese,sent=[];window.__tomoyoMode.set('translation');
   window.__tomoyoTranslateRequest=m=>{try{sent.push(JSON.parse(m));}catch{}};
   b.openBacklog();await w(300);const first=sent.filter(m=>m.type==='translateGuard').length;await w(4600);
   return {first,all:[...new Set(sent.filter(m=>m.type==='translateGuard').map(m=>m.text))].length};})()`);
  assert.equal(out.first,6,'one bounded batch first');
  assert.equal(out.all,9,'then every untranslated line but the newest');
 }finally{server.close();await cdp.stop();}
});
