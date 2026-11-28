// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { startEdge } = require('./library-views-perf.cjs');
const web = path.join(__dirname, '..', 'web');
const edgeInstalled = [
  process.env.MEGULIT_EDGE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].some(file => file && fs.existsSync(file));
const html = '<!doctype html><meta charset="utf-8"><link data-novel-style rel="stylesheet" href="/novel.css"><style>body{margin:0}#host{height:100vh}</style><div id="host"></div><main id="main"></main><script type="module" src="/test.mjs"></script>';
const js = [
 "import {openReader} from '/novel-reader.js'; import {paintDiscoveryDetail,discoverMessages} from '/novel-discover.js'; import {mountNovel} from '/novel-page.js';",
 "const h=document.getElementById('host');",
 "const esc=s=>String(s??''); const w=new Proxy({}, {get:(_x,k)=>k==='chapters'?n=>n:String(k)});",
 "const paragraphs=Array.from({length:50},(_,i)=>'Paragraph '+i+'. '+'A short sentence of test reading material. '.repeat(10));",
 "const calls=[];window.calls=calls; let illustrated=false; let acceptChapter; let acceptImage; const waitingImages=new Map();",
 "window.releaseChapter=()=>acceptChapter(); window.releaseImage=(name='fixture.png',color='#173458')=>{const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=3200;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,2400,3200);waitingImages.get(name)({mime:'image/png',data:canvas.toDataURL().split(',')[1]});};",
 "const api=async (action,args)=>{calls.push([action,args]);switch(action){case 'novel_detail':return illustrated==='bilingual'?{book:{languages:'ja',chapterCount:1},editions:[{languages:'zh',format:'epub'}]}:{book:{languages:'en',chapterCount:3}};case 'novel_bookmarks':return [];case 'novel_chapter':if(illustrated===true&&args.index===1)await new Promise(resolve=>acceptChapter=resolve);return {idx:args.index,paragraphs:illustrated==='bilingual'?['夕凪図書館に着いた。時計塔へ向かった。']:(illustrated==='adjacent'?[]:illustrated&&args.index===0?paragraphs.slice(0,1):paragraphs).map(text=>'CH'+args.index+' '+text),images:illustrated==='adjacent'&&args.index===0?[{after:0,file:'first.png'},{after:0,file:'second.png'}]:illustrated===true&&args.index===1?[{after:0,file:'fixture.png'}]:[]};case 'novel_bilingual':return {available:true,sentences:{'0:0':'到了夕凪图书馆。','0:10':'向时钟塔走去。'}};case 'daily_translate':if(args.mode==='google') await new Promise(resolve=>{window.releaseTranslation=resolve;});return {texts:args.texts.map(text=>args.mode+' '+text)};case 'novel_image':return new Promise(resolve=>{acceptImage=resolve;waitingImages.set(args.name,resolve);});default:return {};}};",
 "window.mount=async (turn,hasIllustration=false)=>{window.reader?.exit();illustrated=hasIllustration;acceptChapter=acceptImage=null;waitingImages.clear();localStorage.setItem('megulit-novel-reader',JSON.stringify({turn,spread:'single'}));window.reader=await openReader(h,{api,esc,w,id:'fixture',toast:message=>{window.err=message},onExit:()=>h.replaceChildren()});};",
 "window.turnState=()=>{const r=h.querySelector('.novel-reader'),b=r.querySelector('[data-nr-body]');return {x:Number(/-?[0-9.]+/.exec(b.style.transform)?.[0]||0),active:r.getAnimations({subtree:true}).length,first:b.querySelector('p')?.textContent.slice(0,3),paper:getComputedStyle(r).backgroundColor,ink:getComputedStyle(r).color}};",
 "window.wheel=(dy)=>h.querySelector('[data-nr-stage]').dispatchEvent(new WheelEvent('wheel',{deltaY:dy,bubbles:true,cancelable:true}));",
 "window.key=(key,repeat=false)=>window.dispatchEvent(new KeyboardEvent('keydown',{key,repeat,cancelable:true}));",
 "window.glyph=(i)=>{const word=h.querySelectorAll('p:first-of-type .nr-word')[i],r=word.getBoundingClientRect();return {x:r.x+r.width*.44,y:r.y+r.height/2};};",
 "window.panelTitle=()=>h.querySelector('.nr-pop strong')?.textContent||'';",
 "window.hasReader=()=>Boolean(h.querySelector('.novel-reader'));",
 "window.hasHighlight=()=>Boolean(h.querySelector('.nr-selection-layer span')); window.picture=()=>h.querySelector('.nr-viewport figure :is(img,canvas)'); window.picturePending=()=>typeof acceptImage==='function'; window.adjacentRequests=()=>[...waitingImages.keys()];",
 "window.unhandled=[];window.addEventListener('unhandledrejection',event=>window.unhandled.push(event.reason?.message));",
 "window.versionFixture=()=>{window.reader?.exit();const editions=[{id:'1',hash:'aaa111',title:'Clock 2',language:'Japanese',extension:'epub',downloadable:true},{id:'2',hash:'bbb222',title:'时钟 第二卷',language:'Chinese',extension:'epub',downloadable:true}];let controller;window.chosenDownload=null;const run=book=>{controller?.abort();controller=new AbortController();const service=async(action,args)=>{if(action==='novel_source_editions')return {books:editions};if(action==='novel_source_download_start'){window.chosenDownload=args;return {phase:'done',bookId:'fixture'};}if(action==='novel_source_download_status')return {phase:'idle'};return {};};paintDiscoveryDetail(h,{selection:{origin:'https://books.example.org',provider:'book-site',book,editions},signal:controller.signal,api:service,esc,w:discoverMessages('zh'),locale:'zh',backButton:()=>'<button data-nv-back>Back</button>',onImported:()=>{},onEdition:run});};run(editions[0]);};",
 "window.mountShelfFixture=async view=>{window.disposeShelf?.();localStorage.setItem('megulit-novel-view',view);const rows=[{id:'v1',title:'夢のシリーズ 1'},{id:'v2',title:'夢のシリーズ 2'}].map(book=>({...book,author:'作家',format:'epub',chapterCount:1,chars:30}));const api=async action=>action==='novel_shelf'?{books:rows,collections:[{id:'collection-test',title:'夢のシリーズ',books:['v1','v2']}]}:{};window.disposeShelf=await mountNovel(document.querySelector('#main'),{api,invoke:async()=>{},esc,locale:'zh',toast:()=>{}});};",
 "window.ready=true;",
].join('\n');
const files=new Set(['novel.css','novel-reader.js','novel-reader-controls.js','novel-reader-turn.js','novel-reader-image-worker.js','novel-reader-selection.js','novel-discover.js','novel-i18n.js','novel-page.js','novel-online.js','novel-shelf.js','novel-flow-liquid.js','novel-pdf-reader.js','capsule-spring.js','game-reception.js','synopsis-view.js']);
const server = http.createServer((req,res) => {
 if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);return;}
 if(req.url==='/test.mjs'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'}).end(js);return;}
 const file=req.url.slice(1);
 if(!files.has(file)){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});
 fs.createReadStream(path.join(web,file)).pipe(res);
});
test('文库点读、选句、Escape 和三种翻页模式', { skip: !edgeInstalled && 'Edge not installed', timeout: 60000 }, async () => {
 const temp = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), 'novel-reader-regression-'));
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await startEdge(path.join(temp, 'edge'));
  await browser.send('Emulation.setDeviceMetricsOverride',{width:940,height:760,deviceScaleFactor:1,mobile:false});
  await browser.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && !await browser.evaluate('window.ready===true')) await sleep(100);
  assert.equal(await browser.evaluate('window.ready===true'), true);
  await browser.evaluate('(async()=>{await mount("curl");return true})()');
  const first=await browser.evaluate('glyph(1)');
  const last=await browser.evaluate('glyph(4)');
  const mouse=(type,point,button='none',buttons=0)=>browser.send('Input.dispatchMouseEvent',{type,...point,button,buttons,clickCount:1});
  await mouse('mousePressed',first,'left',1);
  await mouse('mouseReleased',first,'left');
  await sleep(70);
  assert.equal(await browser.evaluate('panelTitle()'),'Paragraph',JSON.stringify(await browser.evaluate('window.unhandled')));
  await browser.evaluate('key("Escape");key("Escape",true)');
  assert.equal(await browser.evaluate('panelTitle()'),'');
  assert.equal(await browser.evaluate('hasReader()'),true);
  await mouse('mousePressed',first,'left',1);
  await mouse('mouseMoved',last,'none',1);
  await mouse('mouseReleased',last,'left');
  await sleep(70);
  assert.equal(await browser.evaluate('panelTitle()'),'sentence');
  assert.equal(await browser.evaluate('hasHighlight()'),true);
  assert.deepEqual(await browser.evaluate('window.unhandled'),[]);
  for(const mode of ['slide','fade','curl']){
    assert.equal(await browser.evaluate('(async()=>{await mount("'+mode+'");return !!window.reader})()'),true);
    const steps=await browser.evaluate('(()=>{const a=turnState();wheel(100);const b=turnState();wheel(100);const c=turnState();key("ArrowRight",true);return [a,b,c,turnState()]})()');
    assert(await browser.evaluate('document.querySelectorAll(".nr-page-turn [data-off]").length < 15'),
      mode+' animated only the visible page instead of the chapter');
    assert(steps[1].x<0,mode+' accepted the first input immediately');
    assert.equal(steps[2].x,steps[1].x*2,mode+' accepted the second input immediately');
    assert.equal(steps[3].x,steps[2].x,mode+' ignored repeated keydown');
    assert(steps[1].active>0,mode+' animated with the page switch');
    await sleep(365);
    assert.equal((await browser.evaluate('turnState()')).x,steps[2].x,mode+' did not replay delayed inputs');
    assert.equal(await browser.evaluate('turnState().active'),0,mode+' released its transition after the burst');
    const smooth=await browser.evaluate('(()=>{const a=turnState();wheel(-12);wheel(-14);wheel(-16);wheel(-8);const b=turnState();return [a,b]})()');
    assert.equal(smooth[1].x,steps[1].x,mode+' smooth input and inertial tail caused one page');
    await browser.evaluate('key("ArrowRight")');
    await browser.evaluate('key("a")');
    const colors=await browser.evaluate('(()=>{document.querySelector("[data-setting=paper][data-value=night]").click();return turnState()})()');
    assert.equal(colors.paper,'rgb(20, 18, 22)');
    assert.equal(colors.ink,'rgb(215, 210, 204)');
    assert.equal(colors.x,steps[2].x);
    await browser.evaluate('key("Escape")');
    await browser.evaluate('key("End")');
    await browser.evaluate('key("ArrowRight")');
    for(let i=0;i<25&&(await browser.evaluate('turnState()')).first!=='CH1';i++)await sleep(20);
    assert.equal((await browser.evaluate('turnState()')).first,'CH1');
    assert.equal((await browser.evaluate('turnState()')).x,0);
    await browser.evaluate('key("ArrowLeft")');
    for(let i=0;i<25&&(await browser.evaluate('turnState()')).first!=='CH0';i++)await sleep(20);
    assert.equal((await browser.evaluate('turnState()')).first,'CH0');
    assert((await browser.evaluate('turnState()')).x<0);
  }
  await browser.evaluate('(async()=>{await mount("curl",true);return !!window.reader})()');
  await browser.evaluate('wheel(100);wheel(100);wheel(100);releaseChapter()');
  for(let i=0;i<25&&(await browser.evaluate('turnState()')).first!=='CH1';i++)await sleep(20);
  const afterBurst=await browser.evaluate('turnState()');
  assert.equal(afterBurst.first,'CH1','an unfinished illustration did not block the next chapter');
  assert(afterBurst.x<0,'turns during the chapter request were applied');
  const pageAfter=await browser.evaluate('turnState().x');
  await browser.evaluate('key("Home")');
  for(let i=0;i<25&&!await browser.evaluate('picturePending()');i++)await sleep(20);
  await browser.evaluate('releaseImage()');
  for(let i=0;i<25&&!await browser.evaluate('Boolean(picture()?.matches("canvas") || picture()?.complete)');i++)await sleep(20);
  assert.equal(await browser.evaluate('Boolean(picture()?.naturalWidth || picture()?.width)'),true,'the high-resolution illustration arrived in its page');
  assert.equal(await browser.evaluate('turnState().x'),0,'decoding the picture did not move the reader');
  await browser.evaluate('wheel(100);wheel(100)');
  assert.equal(await browser.evaluate('turnState().x'),pageAfter,'the same inputs returned to the same page after loading the image');

  await browser.evaluate('(async()=>{await mount("fade","adjacent");return true})()');
  for (let i=0;i<20&&(await browser.evaluate('adjacentRequests()')).length<2;i++) await sleep(20);
  assert.deepEqual(await browser.evaluate('adjacentRequests()'),['first.png','second.png'],
    'both adjacent illustrations began loading before either one decoded');
  await browser.evaluate(`releaseImage('second.png','#da5534'); releaseImage('first.png','#173458')`);
  for (let i=0;i<35&&(await browser.evaluate('document.querySelectorAll(".nr-viewport figure canvas").length'))<2;i++) await sleep(20);
  assert.equal(await browser.evaluate('document.querySelectorAll(".nr-viewport figure canvas").length'),2,
    'both illustration surfaces were prepared before turning');
  await browser.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const visible = await browser.evaluate(`(()=>{
    const viewport=document.querySelector('.nr-viewport');
    const atCenter=()=>document.elementFromPoint(innerWidth/2,160)?.closest('figure')?.dataset.nrImg;
    const turns=[];
    for(const input of [100,-100,100,-100]){
      wheel(input);
      const fade=viewport.getAnimations()[0];
      if(fade){fade.pause();fade.currentTime=32;}
      const leaving=viewport.querySelector('canvas').getAnimations()[0] || [...viewport.querySelectorAll('canvas')].at(-1).getAnimations()[0];
      if(leaving){leaving.pause();leaving.currentTime=32;}
      const prior=leaving?.effect.target;
      turns.push({file:atCenter(),opacity:Number(getComputedStyle(viewport).opacity),outgoing:prior&&Number(getComputedStyle(prior).opacity)});
    }
    return turns;
  })()`);
  assert.deepEqual(visible.map(turn=>turn.file),['second.png','first.png','second.png','first.png'],
    'every input selected the correct illustration in that input frame');
  assert(visible.every(turn=>turn.opacity<.85),'quick fade-ins remained visible on consecutive turns');
  assert(visible.every(turn=>turn.outgoing>0 && turn.outgoing<.88),'the previous illustration faded out on its existing surface');
  const samplePaint = async () => {
    const {data} = await browser.send('Page.captureScreenshot',{format:'png',clip:{x:465,y:155,width:10,height:10,scale:1}});
    return browser.evaluate(`(async()=>{
      const image=new Image();
      image.src="data:image/png;base64,${data}";
      await image.decode();
      const canvas=document.createElement("canvas");
      const ctx=canvas.getContext("2d");
      ctx.drawImage(image,0,0);
      return [...ctx.getImageData(5,5,1,1).data].slice(0,3);
    })()`);
  };
  const blended = await samplePaint();
  await browser.evaluate('document.querySelector(".nr-viewport").getAnimations({subtree:true}).forEach(animation=>animation.finish())');
  const settled = await samplePaint();
  assert.deepEqual(settled,[23,52,88],'the final painted page contains the original blue illustration');
  assert(blended[0]>settled[0]+35 && blended[2]<200,'the captured in-between frame blends the outgoing orange illustration with the blue destination');
  await browser.evaluate('(async()=>{await mount("slide","bilingual");calls.length=0;document.querySelector("[data-reader-action=language]").click();return true})()');
  const pairs = 'Array.from(document.querySelectorAll(".nr-sentence-pair")).map(pair=>[pair.firstElementChild.textContent,pair.lastElementChild.textContent])';
  for(let i=0;i<40&&!(await browser.evaluate(pairs))[0]?.[1];i++) await sleep(20);
  assert.deepEqual(await browser.evaluate(pairs),[['夕凪図書館に着いた。','到了夕凪图书馆。'],['時計塔へ向かった。','向时钟塔走去。']]);
  assert.equal(await browser.evaluate('Boolean(document.querySelector(".nr-translation"))'),false);
  assert.equal(await browser.evaluate('calls.filter(item=>item[0]==="daily_translate").length'),0,'offline mode did not call the software translator');
  await browser.evaluate('key("a");document.querySelector("[data-setting=custom]").click()');
  assert.deepEqual(await browser.evaluate('Array.from(document.querySelectorAll("[data-setting=translationSource]"),button=>button.dataset.value)'),
    ['edition','google','model','api'], 'custom settings show all four translation modes');
  const selectTranslation = mode => browser.evaluate(`document.querySelector('[data-setting=translationSource][data-value="${mode}"]').click()`);
  await selectTranslation('google');
  assert(await browser.evaluate('Array.from(document.querySelectorAll(".nr-inline-translation")).every(span=>!span.hidden&&!span.textContent&&span.clientHeight>0)'),
    'waiting translations already occupy one line each');
  const callsFor = mode => browser.evaluate(`calls.filter(([action,args])=>action==='daily_translate'&&args.mode==='${mode}').at(-1)?.[1].texts`);
  for(let i=0;i<60&&!await callsFor('google');i++) await sleep(25);
  assert.deepEqual(await callsFor('google'),['夕凪図書館に着いた。','時計塔へ向かった。']);
  for(const mode of ['model','api']){
    await selectTranslation(mode);
    for(let i=0;i<60&&!(await browser.evaluate(pairs))[0]?.[1]?.startsWith(mode+' ');i++) await sleep(25);
    assert.deepEqual(await callsFor(mode),['夕凪図書館に着いた。','時計塔へ向かった。']);
    assert.deepEqual((await browser.evaluate(pairs)).map(pair=>pair[1]),[mode+' 夕凪図書館に着いた。',mode+' 時計塔へ向かった。']);
  }
  await browser.evaluate('releaseTranslation()');
  await sleep(160);
  assert.equal((await browser.evaluate(pairs))[0][1], 'api 夕凪図書館に着いた。', 'a late result cannot overwrite the selected mode');
  await browser.evaluate('key("Escape")');
  const download = await browser.evaluate(`(async()=>{
    versionFixture();
    document.querySelector('[data-source-download]').click();
    await new Promise(resolve=>setTimeout(resolve,0));
    return { picker:!!document.querySelector('[data-nv-edition]'), args:chosenDownload };
  })()`);
  assert.equal(download.picker,false);
  assert.equal(download.args.id,'1');
  assert.equal(download.args.hash,'aaa111','the download belongs to the individual discovery card');
  for (const layout of ['cover','list','flow']) {
    await browser.evaluate(`(async()=>{await mountShelfFixture("${layout}");return true})()`);
    const rendered = `document.querySelector('[data-nv-layout="${layout}"] [data-nv-collection-card]')`;
    for(let i=0;i<35&&!await browser.evaluate('Boolean(' + rendered + ')');i++) await sleep(20);
    assert.equal(await browser.evaluate('Boolean(' + rendered + ')'),true,layout+' exposes a collection card');
    await browser.evaluate(rendered + '.click()');
    assert.equal(await browser.evaluate('document.querySelector("[data-nv-collection-head] h2")?.textContent'),'夢のシリーズ');
    assert.deepEqual(await browser.evaluate('Array.from(document.querySelectorAll("#main [data-nv-book]"),node=>node.dataset.nvBook)'),['v1','v2']);
    if (layout === 'flow') {
      const active = 'document.querySelector(".nv-flow-rail [data-active]")?.dataset.nvBook';
      assert.equal(await browser.evaluate(active), 'v1', 'entering a collection selects its first volume');
      await browser.evaluate('document.querySelector("#main").dispatchEvent(new WheelEvent("wheel",{deltaY:100,bubbles:true,cancelable:true}))');
      assert.equal(await browser.evaluate(active), 'v2', 'one wheel notch selects the next volume in the collection');
    }
    await browser.evaluate('document.querySelector("[data-nv-collection-head] button").click()');
    assert.equal(await browser.evaluate('Boolean(' + rendered + ')'),true,layout+' returns to the grouped shelf');
    if (layout === 'flow') {
      assert.equal(await browser.evaluate('document.querySelector(".nv-flow-rail [data-active]")?.dataset.nvBook'),
        'collection-test', 'returning to the shelf restores the collection card as the selection');
    }
  }
 }finally{
  await browser?.stop();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 }
});
