'use strict';
/* 2026-11-15 (user: 优化点读卡尺寸啊 然后把滚动条隐藏了 这字尼玛太大了): the lookup card had a 40 px headword, a 520 px width
   and a visible scrollbar. Now: headword 24 px, body type one step down, width scaled with the screen (360-440 px), height at
   most half the game window, no scrollbar but a bottom fade while more is below, and placed above or below the whole
   sentence, never over it. The real reader page runs in headless Edge with a stub Tauri transport. Skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const STUB=`<script>window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};
  if(r.action==='reader_bootstrap')return {engines:[],native:{}};if(r.action==='reader_message'){const m=r.message||{};
   if(m.type==='v4'&&m.action==='word'&&Array.isArray(window.__TEST_PITCH__))return {replies:[{method:'v4Deliver',args:[m.id,{reading:'きく',surface:'きく',pitch:window.__TEST_PITCH__,pitchSource:'UniDic',pronunciationForm:'surface'},'']}]};
   if(m.type==='v4'&&m.action==='markSentence'){window.__MARKED__=(window.__MARKED__||0)+1;
    return {replies:[{method:'v4Deliver',args:window.__MARK_FAIL__?[m.id,null,'SENTENCE_EXPIRED']:[m.id,{ok:true},'']}]};}
   return {replies:[]};}return {};}return null;}};</script>`;
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
function serve(){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
 if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}res.writeHead(404);return res.end();}
 let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}
const WORDS={
 short:{entries:[{spellings:['猫'],readings:['ねこ'],pos:['名詞'],definitions:['猫；猫科动物']}]},
 long:{entries:[{spellings:['かける'],readings:['かける'],pos:['動詞'],definitions:['挂；悬挂','花费；耗费','打（电话）','坐；坐下','浇；泼','盖上；蒙上','乘；相乘','上锁','开动（机器）','施加（压力）','提交（会议）','担心；挂念','欺骗','设置；架设']}]}};
const OPEN=data=>`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const b=window.__tomoyoChinese;b.closeLocalSelection?.();await w(300);
 b.localLookup=async()=>(${JSON.stringify(data)});b.openLocalSelection({text:'x',start:0,end:1,selection:'x'},document.getElementById('w'));await w(900);
 const c=document.querySelector('.tomoyo-selection-card');for(const d of c.querySelectorAll('details'))d.open=true;await w(400);
 const r=c.getBoundingClientRect(),line=document.getElementById('line').getBoundingClientRect(),f=s=>parseFloat(getComputedStyle(c.querySelector(s)).fontSize);
 return {top:r.top,bottom:r.bottom,width:r.width,height:r.height,lineTop:line.top,lineBottom:line.bottom,head:f('.tomoyo-word-heading strong'),sense:f('.tomoyo-sense'),
  bar:c.offsetWidth-c.clientWidth-parseFloat(getComputedStyle(c).borderLeftWidth)-parseFloat(getComputedStyle(c).borderRightWidth),more:c.hasAttribute('data-more'),scrolls:c.scrollHeight>c.clientHeight};})()`;

test('lookup card: smaller type, width 360-440, at most half the game window, no scrollbar, never over the sentence',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-lookup-card-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');
   const s=document.createElement('div');s.id='line';s.className='sentence-text';s.innerHTML='「そんなこと、<span id=w>注意すれば</span>わかるはずでしょ？<br>だから言ったのに」';
   s.style.cssText='position:fixed;left:360px;top:640px;width:900px;font:36px/1.5 Meiryo;color:#fff';document.body.append(s);
   window.__tomoyoChinese.gameArea=()=>({left:200,top:100,width:1280,height:720});return 1})()`);
  for(const [name,data] of Object.entries(WORDS)){
   const c=await cdp.evaluate(OPEN(data));
   assert.equal(c.head,24,name+': headword 24 px');assert.ok(c.sense<=13,name+': sense text '+c.sense+' px');
   assert.ok(c.width>=360&&c.width<=440,name+': width '+c.width);assert.ok(c.height<=360+1,name+': at most half the 720 px game window, got '+c.height);
   assert.ok(c.bottom<=c.lineTop||c.top>=c.lineBottom,name+': the card does not cover the sentence');
   assert.equal(c.bar,0,name+': no scrollbar');
   if(name==='long'){assert.ok(c.scrolls,'long entry scrolls inside the card');assert.ok(c.more,'bottom fade while more is below');}
   else assert.equal(c.more,false,'no fade on a card that fits');
  }
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});

/* 2026-11-16 (user: 我点读窗口呢？, The Song of Saya ver1.00S): in overlay placement the sentence block was a full-window box
   (0,0,1920,1079, reader-pointer.log) with the glyphs placed at the top. The card took the block as "the sentence", fitted neither
   above nor below and was put above the window's top edge. Also: a reader window larger than the monitor's work area keeps the card
   on the work area. */
const PLACE=`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const b=window.__tomoyoChinese;b.closeLocalSelection?.();await w(300);
 b.localLookup=async()=>(${JSON.stringify(WORDS.long)});const t=document.getElementById('t');b.openLocalSelection({text:'x',start:0,end:1,selection:'x'},t);await w(900);
 const c=document.querySelector('.tomoyo-selection-card'),r=c.getBoundingClientRect(),g=t.getBoundingClientRect();
 return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,gTop:g.top,gBottom:g.bottom,w:innerWidth,h:innerHeight};})()`;
test('lookup card: a page-sized sentence block (overlay placement) and a window bigger than the work area keep the card on screen',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-lookup-place-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');
   const s=document.createElement('div');s.className='sentence-text';s.style.cssText='position:fixed;inset:0;font:28px/1.4 Meiryo;color:#fff';
   const line=document.createElement('div');line.style.cssText='position:absolute;left:40px;top:60px';
   line.innerHTML='『<span class=char-token>耕</span><span class=char-token>司</span><span class=char-token>ニ</span>ソウ』<br><span class=char-token id=t>楽</span>シクッテ';
   s.append(line);document.body.append(s);window.__tomoyoChinese.gameArea=()=>({left:0,top:0,width:innerWidth,height:innerHeight});return 1})()`);
  let c=await cdp.evaluate(PLACE);
  assert.ok(c.top>=0&&c.bottom<=c.h&&c.left>=0&&c.right<=c.w,'card inside the window: '+JSON.stringify(c));
  assert.ok(c.top>=c.gBottom,'card below the line that sits at the top: '+JSON.stringify(c));
  /* the monitor's work area is the window's left/top 600x420 part (the rest hangs off screen) */
  await cdp.evaluate(`(()=>{for(const [k,v] of Object.entries({availLeft:0,availTop:0,availWidth:600,availHeight:420}))Object.defineProperty(screen,k,{get:()=>v,configurable:true});return 1})()`);
  c=await cdp.evaluate(PLACE);
  assert.ok(c.top>=0&&c.bottom<=420&&c.left>=0&&c.right<=600,'card inside the work area: '+JSON.stringify(c));
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});

/* #1140 Lookup card feedback button ("这句有问题"): moves to the bottom .tomoyo-card-meta beside translation origin so
   single-pitch cards have zero top .tomoyo-v4-actions height and multi-pitch cards only hold pitch chips there. */
test('lookup card: sentence feedback button sits in footer meta without inflating or colliding with pitch choices (#1140)',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-lookup-feedback-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');
   const s=document.createElement('div');s.className='sentence-text';s.innerHTML='<span id=w class=char-token>聞く</span>';
   s.style.cssText='position:fixed;left:220px;top:600px;font:32px/1.5 Meiryo;color:#fff';document.body.append(s);
   window.__tomoyoChinese.gameArea=()=>({left:0,top:0,width:1280,height:720});return 1})()`);

  const measure=(pitch,episode,text='音楽を聞く')=>`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),b=window.__tomoyoChinese;
   b.closeLocalSelection?.();await w(100);window.__TEST_PITCH__=${JSON.stringify(pitch)};window.__MARKED__=0;window.__MARK_DELAY__=0;window.__MARK_FAIL__=false;
   b.localLookup=async()=>({surface:'聞く',morphology:{base:'聞く',reading:'きく',wordClass:'五段动词'},entries:[{id:1591110,spellings:['聞く','聴く'],readings:['きく'],pos:['五段动词'],definitions:['听到；听见','听从；接受']},{id:1591100,spellings:['効く'],readings:['きく'],pos:['五段动词'],definitions:['有效']}]});
   const sm=${episode===undefined?`{text:${JSON.stringify(text)}}`:`{episode:${JSON.stringify(episode)},text:${JSON.stringify(text)}}`};
   b.openLocalSelection({text:${JSON.stringify(text)},start:0,end:2,sentenceMark:sm},document.getElementById('w'));
   await w(350);
   const c=document.querySelector('.tomoyo-selection-card'),act=c.querySelector('.tomoyo-v4-actions'),pitchBox=c.querySelector('.tomoyo-pitch-choices'),
    mark=c.querySelector('.tomoyo-mark-sentence'),meta=c.querySelector('.tomoyo-card-meta'),body=c.querySelector('.tomoyo-selection-body'),origin=c.querySelector('.tomoyo-translation-origin'),st=c.querySelector('.tomoyo-v4-status');
   const rect=n=>n?n.getBoundingClientRect():{top:0,bottom:0,left:0,right:0,width:0,height:0};
   return {actionsH:Math.round(rect(act).height),actionsDisplay:act?getComputedStyle(act).display:'',pitchDisplay:pitchBox?getComputedStyle(pitchBox).display:'',
    markInMeta:!!(meta&&mark&&meta.contains(mark)),markInActions:!!(act&&mark&&act.contains(mark)),markAfterOrigin:!!(origin&&mark&&origin.nextElementSibling===mark),
    markTop:Math.round(rect(mark).top),markBottom:Math.round(rect(mark).bottom),markH:Math.round(rect(mark).height),markDisabled:!!mark?.disabled,
    firstMetaTag:meta?.firstElementChild?.tagName||'',firstMetaText:meta?.firstElementChild?.textContent||'',
    metaInnerLeft:Math.round(rect(meta).left+(meta?parseFloat(getComputedStyle(meta).paddingLeft)||0:0)),
    originLeft:Math.round(rect(origin).left),originBottom:Math.round(rect(origin).bottom),statusLeft:Math.round(rect(st).left),statusTop:Math.round(rect(st).top),
    bodyBottom:Math.round(rect(body).bottom),pitchBottom:Math.round(rect(pitchBox).bottom),pitchCount:c.querySelectorAll('.tomoyo-pitch-choices button').length};})()`;

  // 1. Single pitch: top .tomoyo-v4-actions collapses to 0 px; feedback button sits in .tomoyo-card-meta and rows stay left-aligned
  await cdp.evaluate(`localStorage.removeItem('megulit-autospeak-hint')`);
  const single=await cdp.evaluate(measure([0],'ep-single'));
  assert.equal(single.actionsH,0,'single-pitch card has 0 px top actions bar');
  assert.equal(single.pitchDisplay,'none','hidden pitch box is display:none');
  assert.equal(single.markInMeta,true,'feedback button sits in bottom .tomoyo-card-meta');
  assert.equal(single.markInActions,false,'feedback button is not in top .tomoyo-v4-actions');
  assert.equal(single.markAfterOrigin,true,'feedback button sits right next to translation origin');
  assert.equal(single.markDisabled,false,'fresh sentence feedback button starts enabled');
  assert.ok(single.firstMetaText.trim().length>0,'meta has no empty leading span');
  assert.ok(Math.abs(single.originLeft-single.metaInnerLeft)<=1,'first meta item aligns flush with meta left padding ('+single.originLeft+' vs '+single.metaInnerLeft+')');
  if(single.statusTop>=single.originBottom-2)assert.ok(Math.abs(single.originLeft-single.statusLeft)<=1,'wrapped status row aligns with first row ('+single.originLeft+' vs '+single.statusLeft+')');
  assert.ok(single.markH>0&&single.markTop>=single.bodyBottom-1,'feedback button is visible below the card body');

  // Click feedback button -> sends markSentence, shows dashed disabled state & dimmed opacity; homograph switch keeps one button in meta and keeps status ahead of hint
  const afterClick=await cdp.evaluate(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));
   const c=document.querySelector('.tomoyo-selection-card'),mark=c.querySelector('.tomoyo-mark-sentence');
   mark.click();await w(150);
   const cs=getComputedStyle(mark),disabledAfterClick=!!mark.disabled,borderStyle=cs.borderTopStyle,opacity=parseFloat(cs.opacity);
   const sel=c.querySelector('.tomoyo-alternative select');sel.value='1';sel.dispatchEvent(new Event('change',{bubbles:true}));await w(200);
   const marks=[...c.querySelectorAll('.tomoyo-mark-sentence')];
   const origin=c.querySelector('.tomoyo-translation-origin'),st=c.querySelector('.tomoyo-v4-status'),hint=c.querySelector('.megulit-autospeak-hint');
   const orderOk=!hint||(st&&!!(st.compareDocumentPosition(hint)&Node.DOCUMENT_POSITION_FOLLOWING));
   const oRect=origin.getBoundingClientRect(),sRect=st.getBoundingClientRect();
   return {marked:window.__MARKED__,disabledAfterClick,borderStyle,opacity,count:marks.length,
    inMeta:!!c.querySelector('.tomoyo-card-meta .tomoyo-mark-sentence'),orderOk,
    originLeft:Math.round(oRect.left),originBottom:Math.round(oRect.bottom),statusLeft:Math.round(sRect.left),statusTop:Math.round(sRect.top)};})()`);
  assert.equal(afterClick.marked,1,'clicking feedback button sends markSentence');
  assert.equal(afterClick.disabledAfterClick,true,'clicking feedback button disables it');
  assert.equal(afterClick.borderStyle,'dashed','disabled feedback button uses dashed border');
  assert.ok(afterClick.opacity<0.9,'disabled feedback button is visibly dimmed (not locked to opacity 1 by reader-panels.js)');
  assert.equal(afterClick.count,1,'re-decorating does not duplicate feedback button');
  assert.equal(afterClick.inMeta,true,'feedback button stays in .tomoyo-card-meta after switch');
  assert.equal(afterClick.orderOk,true,'status stays before autospeak hint after homograph switch');
  if(afterClick.statusTop>=afterClick.originBottom-2)assert.ok(Math.abs(afterClick.originLeft-afterClick.statusLeft)<=1,'wrapped second row stays left-aligned after switch ('+afterClick.originLeft+' vs '+afterClick.statusLeft+')');

  // Failed markSentence restores enabled state; without translation origin, button prepends into .tomoyo-card-meta
  const edgeCases=await cdp.evaluate(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),b=window.__tomoyoChinese;
   window.__MARK_FAIL__=true;
   b.closeLocalSelection?.();await w(80);
   b.openLocalSelection({text:'失敗テスト',start:0,end:2,sentenceMark:{episode:'ep-fail',text:'失敗テスト'}},document.getElementById('w'));await w(250);
   const c=document.querySelector('.tomoyo-selection-card');c.querySelector('.tomoyo-mark-sentence').click();await w(150);
   const failRecovered=!c.querySelector('.tomoyo-mark-sentence').disabled;
   window.__MARK_FAIL__=false;
   c.querySelector('.tomoyo-translation-origin')?.remove();
   const sel=c.querySelector('.tomoyo-alternative select');sel.value='1';sel.dispatchEvent(new Event('change',{bubbles:true}));await w(150);
   const prepended=c.querySelector('.tomoyo-card-meta')?.firstElementChild?.classList.contains('tomoyo-mark-sentence')||false;
   return {failRecovered,prepended};})()`);
  assert.equal(edgeCases.failRecovered,true,'failed markSentence re-enables the button');
  assert.equal(edgeCases.prepended,true,'without translation origin, feedback button prepends into .tomoyo-card-meta');

  // 2. Multi-pitch (3 chips): top .tomoyo-v4-actions holds only pitch chips; feedback button stays in footer meta without overlap
  const multi=await cdp.evaluate(measure([0,1,2],'ep-multi'));
  assert.equal(multi.pitchCount,3,'all three pitch chips render');
  assert.equal(multi.markDisabled,false,'different episode starts enabled');
  assert.ok(multi.actionsH>0&&multi.actionsH<=56,'top actions bar fits only the pitch chips (got '+multi.actionsH+' px)');
  assert.equal(multi.markInMeta,true,'multi-pitch feedback button stays in bottom .tomoyo-card-meta');
  assert.equal(multi.markInActions,false,'multi-pitch feedback button is not in top .tomoyo-v4-actions');
  assert.ok(multi.markTop>multi.pitchBottom,'feedback button never overlaps pitch chips');
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
