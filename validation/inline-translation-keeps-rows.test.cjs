'use strict';
/* #1104 (sugar, 2026-11-24, ファタモルガーナの館 with 中文紧随日文 on: 「鬼畜文字框会把文本一齐靠左挤在一起」). Reproduced live on
   2026-11-26 (isolated install, fata_jp.exe, new game): the line 「目の前にある事実を\n受け入れている」 kept its two rows with the option
   off and ran into one row with it on, because the inline rule set the Japanese to white-space:normal (the "\n" token collapsed to a
   space) and hid every <br> in it (the game's own row breaks). Only the translation follows on: the Japanese keeps its rows and the
   Chinese starts right after the last one. The real reader page runs in headless Edge with a stub Tauri transport. Skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(cdp,expr,ms=5000)=>{const end=Date.now()+ms;while(Date.now()<end){const v=await cdp.evaluate(expr).catch(()=>false);if(v)return v;await sleep(25);}return false;};
const nextFrame=cdp=>cdp.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
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

const ROWS=`(()=>{const w=document.querySelector('.sentence-window.tomoyo-hook-reader'),s=w.querySelector('.sentence-text');
 const toks=[...s.querySelectorAll('.char-token')].filter(t=>t.textContent.trim()),rect=t=>t.getBoundingClientRect();
 const rows=[];for(const t of toks){const r=rect(t);const row=rows.find(x=>Math.abs(x.top-r.top)<r.height/2);if(row)row.n++;else rows.push({top:r.top,n:1});}
 const last=rect(toks.at(-1)),cn=w.querySelector('.tomoyo-cn-output').getClientRects()[0];
 return {inline:document.body.classList.contains('megulit-inline-translation'),rows:rows.map(r=>r.n),cnOnLastRow:!!cn&&cn.top<last.bottom&&cn.bottom>last.top,cnAfter:!!cn&&cn.left>=last.right-1};})()`;

async function reader(t,temp){
 const server=await serve(),cdp=await startEdge(path.join(temp,'edge'));
 t.after(async()=>{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}});
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 const url=`http://127.0.0.1:${server.address().port}/reader/index.html`;
 const navigation=await cdp.send('Page.navigate',{url});
 assert.ok(!navigation.errorText,`Reader navigation failed (${navigation.errorText})`);
 const ready=await waitFor(cdp,`location.href === ${JSON.stringify(url)} &&
  (window.__TOME_READER_READY__ === true || document.querySelector('#reader-status')?.textContent)`,30000);
 assert.equal(ready,true,ready ? `Reader bootstrap failed (${ready})` : 'Reader bootstrap did not finish');
 await cdp.evaluate(`(()=>{const b=__tomoyoChinese;__tomoyoMode.set('translation');
  b.galStatus({bound:true,interfaceMode:'translation'});
  b.galLayout({clientX:80,clientY:80,clientWidth:800,clientHeight:600,readerX:120,readerY:500,readerWidth:700,readerHeight:140,surfaceWidth:1280,surfaceHeight:800});})()`);
 return cdp;
}
const line=(text,translation)=>`(()=>{const text=${JSON.stringify(text)},win=document.createElement('div');win.className='sentence-window tomoyo-hook-reader';
 win.innerHTML='<div class="sentence-text">'+[...text].map((c,i)=>'<span class="char-token" data-index="'+i+'">'+c+'</span>').join('')+'</div><div class="tomoyo-cn-row"><span class="tomoyo-cn-output" data-state="ready">'+${JSON.stringify(translation)}+'</span></div>';
 document.body.append(win);})()`;

test('#1104: with 中文紧随日文 a line keeps its own newline; the Chinese follows its last row',{skip:!hasEdge&&'Edge not installed',timeout:60000},async t=>{
 const cdp=await reader(t,fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-1104a-')));
 await cdp.evaluate(`__tomoyoChinese.restoreGalSettings({display:'bilingual',translationInline:false,translationBlur:false,furigana:false})`);
 await cdp.evaluate(line('目の前にある事実を\n受け入れている','接受了眼前的事实'));await nextFrame(cdp);
 const off=await cdp.evaluate(ROWS);assert.deepEqual(off.rows,[9,7],JSON.stringify(off));assert.equal(off.cnOnLastRow,false,JSON.stringify(off));
 await cdp.evaluate(`__tomoyoChinese.restoreGalSettings({display:'bilingual',translationInline:true,translationBlur:false,furigana:false})`);await nextFrame(cdp);
 const on=await cdp.evaluate(ROWS);
 assert.equal(on.inline,true);
 assert.deepEqual(on.rows,[9,7],'the Japanese keeps its two rows: '+JSON.stringify(on));
 assert.equal(on.cnOnLastRow,true,'the Chinese follows the last Japanese row: '+JSON.stringify(on));assert.equal(on.cnAfter,true,JSON.stringify(on));
});

test('#1104: the live case, the dialogue band of an anchored line, keeps the newline with 中文紧随日文',{skip:!hasEdge&&'Edge not installed',timeout:60000},async t=>{
 const cdp=await reader(t,fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-1104b-')));
 await cdp.evaluate(`__tomoyoChinese.restoreGalSettings({display:'bilingual',translationInline:true,translationBlur:false,furigana:false})`);
 await cdp.evaluate(line('館は数多の運命を飲み込み\n存在し続けている','这座宅邸吞噬着无数命运，继续存在'));
 /* the classes the live window had (fata_jp.exe, 2026-11-26): the fallback band of an anchored line */
 await cdp.evaluate(`document.querySelector('.sentence-window.tomoyo-hook-reader').classList.add('megulit-dialogue-band','megulit-anchor-window','tomoyo-cn-active')`);await nextFrame(cdp);
 const on=await cdp.evaluate(ROWS);
 assert.equal(on.inline,true);
 assert.deepEqual(on.rows,[12,8],'the Japanese keeps its two rows: '+JSON.stringify(on));
 assert.equal(on.cnOnLastRow,true,JSON.stringify(on));
});
