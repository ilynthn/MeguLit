'use strict';
/* #1128 (QQ essence 2026-11-24: 「偶发性双重译文」, the screenshot shows one 死に逝く君 sentence with two different Chinese lines). With the
   translation written back into the game (embedTranslation, or the E352 auto embed from an imported patch table) the game draws its
   own translation and the overlay hides its own. That was one page-wide switch: each line the game's font could not draw, and the
   embed mode going off, switched it off while the game still showed its translation of the line on screen, and MeguLit's
   translation came up as a second one. Now it is decided per line (core embedLine.drawn). The real reader page runs in headless
   Edge with a stub Tauri transport (skipped without Edge); core's side is a plain unit test. */
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
const LINE=(text,translation)=>`(()=>{let win=document.querySelector('.sentence-window.tomoyo-hook-reader');if(!win){win=document.createElement('div');win.className='sentence-window tomoyo-hook-reader';document.body.append(win);}
 win.innerHTML='<div class="sentence-text">'+[...${JSON.stringify(text)}].map((c,i)=>'<span class="char-token" data-index="'+i+'">'+c+'</span>').join('')+'</div><div class="tomoyo-cn-row"><span class="tomoyo-cn-output" data-state="ready">'+${JSON.stringify(translation)}+'</span></div>';})()`;
const SHOWN=`(()=>{const o=document.querySelector('.sentence-window.tomoyo-hook-reader .tomoyo-cn-output');return getComputedStyle(o).display!=='none'&&o.getBoundingClientRect().height>0;})()`;
const settle=async cdp=>{await sleep(220);await nextFrame(cdp);};

test('#1128: a line the game drew translated keeps only the game\'s translation, whatever the next line does',{skip:!hasEdge&&'Edge not installed',timeout:60000},async t=>{
 const cdp=await reader(t,fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-1128-')));
 await cdp.evaluate(`__tomoyoChinese.restoreGalSettings({display:'bilingual',translationBlur:false,furigana:false})`);
 const A='力なく笑って、美亜は近くの樹にもたれかかった。',B='よほど利口な選択と言えるはずだった。';
 await cdp.evaluate(LINE(A,'她无力地笑了笑，靠在了附近的一棵树上。'));
 await cdp.evaluate(`__tomoyoChinese.galStatus({embedTranslating:true,embedLine:{source:${JSON.stringify(A)},text:'美亚无力地笑了笑，靠在了附近的一棵树上。',drawn:true}})`);await settle(cdp);
 assert.equal(await cdp.evaluate(SHOWN),false,'the game drew this line\'s translation: the overlay adds none');
 /* the bridge asks for the next line before the window shows it; the game's font cannot draw that one (hide) */
 await cdp.evaluate(`__tomoyoChinese.galStatus({embedTranslating:false,embedLine:{source:${JSON.stringify(B)},text:'',drawn:false}})`);await settle(cdp);
 assert.equal(await cdp.evaluate(SHOWN),false,'still the game\'s translation on screen for the line shown: no second one');
 await cdp.evaluate(LINE(B,'这本该是更明智的选择。'));await cdp.evaluate(`__tomoyoChinese.galStatus({hookSource:${JSON.stringify(B)}})`);await settle(cdp);
 assert.equal(await cdp.evaluate(SHOWN),true,'the game kept this line as it was: MeguLit translates it');
});

test('#1128: the embed mode going off leaves the line on screen as the game drew it; later lines are MeguLit\'s',{skip:!hasEdge&&'Edge not installed',timeout:60000},async t=>{
 const cdp=await reader(t,fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-1128b-')));
 await cdp.evaluate(`__tomoyoChinese.restoreGalSettings({display:'bilingual',translationBlur:false,furigana:false})`);
 const A='それならば、せめて苦痛のないままに死んでしまったほうが、',B='美亜は小さく息をついた。';
 await cdp.evaluate(LINE(A,'既然如此，至少在毫无痛苦之中死去，'));
 await cdp.evaluate(`__tomoyoChinese.galStatus({embedTranslating:true,embedLine:{source:${JSON.stringify(A)},text:'那样的话，至少毫无痛苦地死去，',drawn:true}})`);await settle(cdp);
 await cdp.evaluate(`__tomoyoChinese.galStatus({embedTranslating:false})`);await settle(cdp);
 assert.equal(await cdp.evaluate(SHOWN),false,'the game\'s translation is still the one on screen');
 await cdp.evaluate(LINE(B,'美亚轻轻叹了口气。'));await cdp.evaluate(`__tomoyoChinese.galStatus({hookSource:${JSON.stringify(B)}})`);await settle(cdp);
 assert.equal(await cdp.evaluate(SHOWN),true,'with the mode off the next line is MeguLit\'s to translate');
});

test('#1128 core: a written-back line the game keeps as it was is reported as not drawn',()=>{
 const {HookNative}=require('../core/hook-native.cjs');
 const h=Object.create(HookNative.prototype),sent=[],notes=[];
 Object.assign(h,{process:{},embedModeSent:true,state:{hookThreads:[]},send:m=>sent.push(m),notify:m=>notes.push(m),trace(){}});
 h.embedReply(7,'',{source:'よほど利口な選択と言えるはずだった。',text:''});
 assert.deepEqual(sent,[{type:'embedReply',id:7,trans:''}]);
 assert.deepEqual(notes,[{embedLine:{source:'よほど利口な選択と言えるはずだった。',text:'',drawn:false}}]);
 h.embedReply(8,'美亚无力地笑了笑。',{source:'力なく笑って。',text:'美亚无力地笑了笑。'});
 assert.equal(notes.at(-1).embedTranslating,true);assert.equal(notes.at(-1).embedLine.drawn,true);
});

test('#1268 review: a per-line hide reply keeps the other lines\' results (A drawn, B hidden, C drawn)',{skip:!hasEdge&&'Edge not installed',timeout:60000},async t=>{
 const cdp=await reader(t,fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-1268a-')));
 await cdp.evaluate(`__tomoyoChinese.restoreGalSettings({display:'bilingual',translationBlur:false,furigana:false})`);
 const A='力なく笑って、美亜は近くの樹にもたれかかった。',B='よほど利口な選択と言えるはずだった。',C='美亜は小さく息をついた。';
 await cdp.evaluate(LINE(A,'她无力地笑了笑，靠在了附近的一棵树上。'));
 await cdp.evaluate(`__tomoyoChinese.galStatus({embedTranslating:true,embedLine:{source:${JSON.stringify(A)},text:'美亚无力地笑了笑。',drawn:true}})`);await settle(cdp);
 await cdp.evaluate(`__tomoyoChinese.galStatus({embedTranslating:false,embedLine:{source:${JSON.stringify(B)},text:'',drawn:false}})`);await settle(cdp);
 await cdp.evaluate(LINE(B,'这本该是更明智的选择。'));await cdp.evaluate(`__tomoyoChinese.galStatus({hookSource:${JSON.stringify(B)}})`);await settle(cdp);
 assert.equal(await cdp.evaluate(SHOWN),true);
 await cdp.evaluate(`__tomoyoChinese.galStatus({embedTranslating:true,embedLine:{source:${JSON.stringify(C)},text:'美亚轻轻叹了口气。',drawn:true}})`);await settle(cdp);
 assert.equal(await cdp.evaluate(SHOWN),true,'B was never drawn by the game: its overlay translation stays when C turns write-back on again');
});

test('#1268 review: a line painted late (page report wait) gets its own per-line decision',{skip:!hasEdge&&'Edge not installed',timeout:60000},async t=>{
 const cdp=await reader(t,fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-1268b-')));
 await cdp.evaluate(`__tomoyoChinese.restoreGalSettings({display:'bilingual',translationBlur:false,furigana:false})`);
 const A='それならば、せめて苦痛のないままに死んでしまったほうが、',B='よほど利口な選択と言えるはずだった。';
 await cdp.evaluate(LINE(A,'既然如此，至少在毫无痛苦之中死去，'));
 await cdp.evaluate(`__tomoyoChinese.galStatus({embedTranslating:true,embedLine:{source:${JSON.stringify(A)},text:'那样的话，至少毫无痛苦地死去，',drawn:true}})`);await settle(cdp);
 assert.equal(await cdp.evaluate(SHOWN),false);
 await cdp.evaluate(`__tomoyoChinese.galStatus({embedLine:{source:${JSON.stringify(B)},text:'',drawn:false}})`);
 await cdp.evaluate(`__tomoyoChinese.galStatus({hookSource:${JSON.stringify(B)}})`);await sleep(600);
 await cdp.evaluate(LINE(B,'这本该是更明智的选择。'));await nextFrame(cdp);await nextFrame(cdp);
 assert.equal(await cdp.evaluate(SHOWN),true,'the window painted after the status delays shows B\'s overlay translation');
});

test('#1268 review: a new game session does not inherit the last game\'s write-back results',{skip:!hasEdge&&'Edge not installed',timeout:60000},async t=>{
 const cdp=await reader(t,fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-1268c-')));
 await cdp.evaluate(`__tomoyoChinese.restoreGalSettings({display:'bilingual',translationBlur:false,furigana:false})`);
 const A='美亜は小さく息をついた。';
 await cdp.evaluate(LINE(A,'美亚轻轻叹了口气。'));
 await cdp.evaluate(`__tomoyoChinese.galStatus({embedTranslating:true,embedLine:{source:${JSON.stringify(A)},text:'美亚轻轻叹了口气。',drawn:true}})`);await settle(cdp);
 await cdp.evaluate(`__tomoyoChinese.galStatus({embedTranslating:false})`);await settle(cdp);
 assert.equal(await cdp.evaluate(SHOWN),false,'the line on screen keeps what the game drew');
 await cdp.evaluate(`__tomoyoChinese.galStatus({hookSource:null})`);await settle(cdp);
 await cdp.evaluate(LINE(A,'美亚轻轻叹了口气。'));await cdp.evaluate(`__tomoyoChinese.galStatus({hookSource:${JSON.stringify(A)}})`);await settle(cdp);
 assert.equal(await cdp.evaluate(SHOWN),true,'the next game only draws Japanese: MeguLit translates the shared sentence');
});
