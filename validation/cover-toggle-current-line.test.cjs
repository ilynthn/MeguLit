'use strict';
/* #1132 (QQ essence 2026-11-23: 「按下alt h … 再按一下我可以显示日文，但其实是啥文本都没有了」). With the cover off the hook stops hiding,
   the game repaints the current line itself and core says so (textPlace clear, then visible with hiding); Alt+H again puts the hide
   back but the game does not repaint the line, so no hidden report ever came for it and the reader kept its Japanese hidden with no
   place. The reader now takes the current line back from its last place as soon as the cover is on again. The real reader page runs
   in headless Edge with a stub Tauri transport. Skipped without Edge. */
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
const STATE=`(()=>{const w=document.querySelector('.sentence-window.tomoyo-hook-reader'),s=w.querySelector('.sentence-text'),t=s.querySelector('.char-token');
 return {gameDrawn:document.body.classList.contains('megulit-place-game-drawn'),visible:getComputedStyle(s).visibility!=='hidden'&&getComputedStyle(w).visibility!=='hidden',left:Math.round(t.getBoundingClientRect().left),top:Math.round(t.getBoundingClientRect().top)};})()`;

test('#1132: Alt+H off and on again brings the current line back at once',{skip:!hasEdge&&'Edge not installed',timeout:60000},async t=>{
 const cdp=await reader(t,fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-1132-')));
 await cdp.evaluate(`__tomoyoChinese.restoreGalSettings({display:'bilingual',translationBlur:false,furigana:false})`);
 const text='ふふ……、どうしたのですか。';
 await cdp.evaluate(`(()=>{const text=${JSON.stringify(text)},win=document.createElement('div');win.className='sentence-window tomoyo-hook-reader';
  win.innerHTML='<div class="sentence-text">'+[...text].map((c,i)=>'<span class="char-token" data-index="'+i+'">'+c+'</span>').join('')+'</div><div class="tomoyo-cn-row"><span class="tomoyo-cn-output" data-state="ready">呵呵……您怎么了？</span></div>';
  document.body.append(win);const b=__tomoyoChinese;b.textPlaceMode({on:true,game:'test'});b.galStatus({coverEnabled:true});
  b.textPlace({text,engine:'krkr',rects:[...text].map((_,i)=>[70+i*24,440,24,24]),client:[800,600]});})()`);
 await sleep(400);await nextFrame(cdp);
 const placed=await cdp.evaluate(STATE);assert.equal(placed.visible,true,JSON.stringify(placed));assert.equal(placed.gameDrawn,false,JSON.stringify(placed));
 /* Alt+H: the cover goes off, the hook stops hiding and the game repaints the line itself */
 await cdp.evaluate(`(()=>{const b=__tomoyoChinese,text=${JSON.stringify(text)};b.galStatus({coverEnabled:false});b.textPlace({clear:true});b.textPlace({visible:true,text,hiding:true});})()`);
 await nextFrame(cdp);
 assert.equal((await cdp.evaluate(STATE)).visible,false,'the cover is hidden');
 /* Alt+H again: the hide is back, no new report for the line */
 await cdp.evaluate(`__tomoyoChinese.galStatus({coverEnabled:true})`);await sleep(400);await nextFrame(cdp);
 const back=await cdp.evaluate(STATE);
 assert.equal(back.gameDrawn,false,'the reader takes the line back: '+JSON.stringify(back));
 assert.equal(back.visible,true,JSON.stringify(back));
 assert.ok(Math.abs(back.left-placed.left)<=2&&Math.abs(back.top-placed.top)<=2,'at its last place: '+JSON.stringify({placed,back}));
});

test('#1132: a game read without hiding keeps its own line when the cover comes back',{skip:!hasEdge&&'Edge not installed',timeout:60000},async t=>{
 const cdp=await reader(t,fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-1132b-')));
 await cdp.evaluate(`__tomoyoChinese.restoreGalSettings({display:'bilingual',translationBlur:false,furigana:false})`);
 const text='まだ頭がはっきりされてないのかしら。';
 await cdp.evaluate(`(()=>{const text=${JSON.stringify(text)},win=document.createElement('div');win.className='sentence-window tomoyo-hook-reader';
  win.innerHTML='<div class="sentence-text">'+[...text].map((c,i)=>'<span class="char-token" data-index="'+i+'">'+c+'</span>').join('')+'</div><div class="tomoyo-cn-row"><span class="tomoyo-cn-output" data-state="ready">是还没有完全睡醒吗？</span></div>';
  document.body.append(win);const b=__tomoyoChinese;b.textPlaceMode({on:true,game:'test'});b.galStatus({coverEnabled:true});
  b.textPlace({text,engine:'krkr',rects:[...text].map((_,i)=>[70+i*24,440,24,24]),client:[800,600]});b.galStatus({coverEnabled:false});b.textPlace({clear:true});b.textPlace({visible:true,text});})()`);
 await sleep(300);await nextFrame(cdp);
 assert.equal(await cdp.evaluate(`document.body.classList.contains('megulit-place-game-drawn')`),true);
 await cdp.evaluate(`__tomoyoChinese.galStatus({coverEnabled:true})`);await sleep(300);await nextFrame(cdp);
 assert.equal(await cdp.evaluate(`document.body.classList.contains('megulit-place-game-drawn')`),true,'a line the game really draws (no hiding) stays the game\'s');
});
