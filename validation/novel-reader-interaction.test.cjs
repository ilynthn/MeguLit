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
const html = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/novel.css"><style>body{margin:0}#host{height:100vh}</style><div id="host"></div><script type="module" src="/test.mjs"></script>';
const js = [
 "import {openReader} from '/novel-reader.js';",
 "const h=document.getElementById('host');",
 "const esc=s=>String(s??''); const w=new Proxy({}, {get:(_x,k)=>k==='chapters'?n=>n:String(k)});",
 "const paragraphs=Array.from({length:50},(_,i)=>'Paragraph '+i+'. '+'A short sentence of test reading material. '.repeat(10));",
 "const calls=[];window.calls=calls;",
 "const api=async (action,args)=>{calls.push([action,args]);switch(action){case 'novel_detail':return {book:{languages:'en',chapterCount:3}};case 'novel_bookmarks':return [];case 'novel_chapter':return {idx:args.index,paragraphs:paragraphs.map(text=>'CH'+args.index+' '+text),images:[]};default:return {};}};",
 "window.mount=async turn=>{window.reader?.exit();localStorage.setItem('megulit-novel-reader',JSON.stringify({turn,spread:'single'}));window.reader=await openReader(h,{api,esc,w,id:'fixture',toast:message=>{window.err=message},onExit:()=>h.replaceChildren()});};",
 "window.turnState=()=>{const r=h.querySelector('.novel-reader'),b=r.querySelector('[data-nr-body]');return {x:Number(/-?[0-9.]+/.exec(b.style.transform)?.[0]||0),active:r.getAnimations({subtree:true}).length,first:b.querySelector('p')?.textContent.slice(0,3),paper:getComputedStyle(r).backgroundColor,ink:getComputedStyle(r).color}};",
 "window.wheel=(dy)=>h.querySelector('[data-nr-stage]').dispatchEvent(new WheelEvent('wheel',{deltaY:dy,bubbles:true,cancelable:true}));",
 "window.key=(key,repeat=false)=>window.dispatchEvent(new KeyboardEvent('keydown',{key,repeat,cancelable:true}));",
 "window.glyph=(i)=>{const word=h.querySelectorAll('p:first-of-type .nr-word')[i],r=word.getBoundingClientRect();return {x:r.x+r.width*.44,y:r.y+r.height/2};};",
 "window.panelTitle=()=>h.querySelector('.nr-pop strong')?.textContent||'';",
 "window.hasReader=()=>Boolean(h.querySelector('.novel-reader'));",
 "window.hasHighlight=()=>Boolean(h.querySelector('.nr-selection-layer span'));",
 "window.unhandled=[];window.addEventListener('unhandledrejection',event=>window.unhandled.push(event.reason?.message));",
 "window.ready=true;",
].join('\n');
const files=new Set(['novel.css','novel-reader.js','novel-reader-controls.js','novel-reader-turn.js','novel-reader-selection.js']);
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
    assert(steps[1].x<0,mode+' accepted the first input immediately');
    assert.equal(steps[2].x,steps[1].x*2,mode+' accepted the second input immediately');
    assert.equal(steps[3].x,steps[2].x,mode+' ignored repeated keydown');
    assert(steps[1].active>0,mode+' animated with the page switch');
    await sleep(360);
    assert.equal((await browser.evaluate('turnState()')).x,steps[2].x,mode+' did not replay delayed inputs');
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
 }finally{
  await browser?.stop();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 }
});
