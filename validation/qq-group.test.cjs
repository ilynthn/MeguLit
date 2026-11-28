// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 QQ 交流群 entry. The home page pill (web/qq-group.js) opens a card with the group's QR code, the number with a
   copy button and 「用电脑 QQ 加群」, which opens the group's join page (qm.qq.com) and lets it hand over to the desktop QQ;
   when the page cannot be opened the number is copied with the toast 「群号已复制」. The tencent://groupwpa route is gone:
   the new desktop QQ answers it with 「加群参数不合法」 (owner, 2026-11-28). The app, the README and the website show the same
   number, join link and QR code (tools/build-qq-qr.py made the code from the link and read it back). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const ROOT=path.join(__dirname,'..');
const web=()=>import('../web/qq-group.js');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

test('the app no longer opens QQ through tencent://groupwpa (the new QQ refuses its parameters)',()=>{
 for(const f of ['web/qq-group.js','web/home-tv.js','services/bridge.cjs'])assert.doesNotMatch(read(f),/tencent:\/\/|open_qq_group/,f);
 assert.equal(fs.existsSync(path.join(ROOT,'core','qq-group.cjs')),false,'the tencent:// launcher is removed');
});

test('「用电脑 QQ 加群」 opens the group\'s join page; when it cannot, the number is copied and the toast says so',async()=>{
 const {QQ_GROUP,QQ_WEB,joinQQGroup,qqPillHTML,qqWords}=await web();
 assert.equal(QQ_WEB,'https://qm.qq.com/q/C95LXYb5Sg','the group\'s own join page');
 const run=async(answer,{copyFails=false,locale='zh'}={})=>{const calls=[],copied=[],toasts=[];
  const api=async(action,params)=>{calls.push([action,params]);if(answer instanceof Error)throw answer;return answer;};
  const result=await joinQQGroup({api,locale,toast:m=>toasts.push(m),copy:async t=>{if(copyFails)throw Error('denied');copied.push(t);}});
  return {result,calls,copied,toasts};};
 let r=await run({opened:true});
 assert.deepEqual(r,{result:'web',calls:[['open_source',{url:QQ_WEB}]],copied:[],toasts:[]},'the join page opens, nothing else');
 for(const answer of [{opened:false},Error('INVALID_SOURCE_URL')]){
  r=await run(answer);
  assert.deepEqual(r,{result:'copied',calls:[['open_source',{url:QQ_WEB}]],copied:[QQ_GROUP],toasts:['群号已复制：'+QQ_GROUP]},'page not opened: '+String(answer?.message||JSON.stringify(answer)));
 }
 r=await run(Error('down'),{copyFails:true});
 assert.deepEqual(r.toasts,['QQ 群号：'+QQ_GROUP],'when the clipboard is refused the toast still gives the number');
 r=await run(Error('down'),{locale:'ja'});assert.deepEqual(r.toasts,[qqWords('ja').copied]);
 r=await run(Error('down'),{locale:'en'});assert.deepEqual(r.toasts,['Group number copied: '+QQ_GROUP]);
 const html=qqPillHTML('zh',s=>String(s));
 for(const part of ['class="qq-pill tv-cap"','<span class="cap-txt">QQ 交流群</span>',`title="群号 ${QQ_GROUP}"`,'<code>'+QQ_GROUP+'</code>','src="assets/qq-group-qr.svg"','data-qq-copy','data-qq-open','用电脑 QQ 加群'])assert.ok(html.includes(part),'pill and card: '+part);
 assert.ok(!html.includes('<em>'),'the number is not printed on the capsule, only in its hover tip and the card');
 assert.ok(read('services/bridge.cjs').includes(`'${new URL(QQ_WEB).hostname}'`),'the join page is in open_source\'s list');
});

test('the app, the README, the website and the QR code give the same number and join link',async()=>{
 const {QQ_GROUP,QQ_WEB,QQ_QR}=await web();
 const readme=read('README.md'),site=read('site/public/index.html'),tool=read('tools/build-qq-qr.py');
 assert.ok(tool.includes(`LINK = '${QQ_WEB}'`)&&tool.includes(`GROUP = '${QQ_GROUP}'`),'the QR code is made from this link');
 const appSvg=read('web/'+QQ_QR),siteSvg=read('site/public/assets/img/qq-group-qr.svg');
 assert.equal(appSvg,siteSvg,'the app and the website show the same code');
 assert.match(appSvg,new RegExp(`aria-label="MeguLit QQ 群 ${QQ_GROUP}"`));
 const png=fs.readFileSync(path.join(ROOT,'docs/assets/qq-group-qr.png'));
 assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.readUInt32BE(16)>=400,'README picture sharp enough at 200 px on a 2x screen');
 assert.ok(readme.includes(`QQ%20%E7%BE%A4-${QQ_GROUP}-c8323c?style=flat-square)](${QQ_WEB})`),'README badge links to the join page');
 assert.match(readme,new RegExp(`## 交流群\\r?\\n\\r?\\n<a href="${QQ_WEB}"><img src="docs/assets/qq-group-qr.png" width="200"`),'README 交流群 with the QR code');
 assert.ok(readme.includes(`QQ 群：**${QQ_GROUP}**`));
 const numbers=s=>[...s.matchAll(/(?:uin=|data-qq="|QQ[^0-9\n<]{0,6})(\d{5,12})/g)].map(m=>m[1]);
 const links=s=>[...s.matchAll(/https:\/\/qm\.qq\.com\/[^\s"')<]+/g)].map(m=>m[0]);
 for(const [name,text] of [['README',readme],['site',site]]){
  assert.ok(numbers(text).length>=2,name+' mentions the group');assert.deepEqual([...new Set(numbers(text))],[QQ_GROUP],name+' shows only this number');
  assert.ok(links(text).length>=2,name+' links the join page');assert.deepEqual([...new Set(links(text))],[QQ_WEB],name+' links only this join page');
 }
 assert.ok(site.includes(`class="qq-btn js-qq-open" href="${QQ_WEB}"`),'header button: the join page without script and on phones');
 assert.match(site,/<footer[\s\S]*class="foot-qq js-qq-open"[\s\S]*qq-group-qr\.svg[\s\S]*<\/footer>/,'small QR code in the footer');
 assert.match(site,/<dialog class="qq-dialog"[\s\S]*qq-group-qr\.svg[\s\S]*js-qq-copy[\s\S]*https:\/\/qm\.qq\.com\/q\/C95LXYb5Sg[\s\S]*<\/dialog>/,'card: QR code, copy, join page');
});

const {startEdge}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));

test('the home card opens on pointing and on click, copies the number, and its button joins through QQ or the join page',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-qq-card-'));let server,cdp;
 const page=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/web/qq-group.css"><body style="margin:0;background:#111"><main class="tv-home" style="position:relative;height:600px"></main><div id="out"></div>
<script type="module">import {qqPillHTML,wireQQCard} from '/web/qq-group.js';
window.calls=[];window.copied=[];window.toasts=[];window.answer={opened:true};
const root=document.querySelector('.tv-home');root.insertAdjacentHTML('beforeend',qqPillHTML('zh',s=>String(s)));
window.card=wireQQCard(root.querySelector('.qq-anchor'),{locale:'zh',api:async(a,p)=>{calls.push([a,p]);if(answer instanceof Error)throw answer;return answer;},toast:m=>toasts.push(m),copy:async t=>{copied.push(t);}});
window.ready=true;</script>`;
 try{
  server=await new Promise(r=>{const s=http.createServer((req,res)=>{const u=new URL(req.url,'http://x').pathname;if(u==='/'){res.writeHead(200,{'content-type':'text/html'});return res.end(page);}
   const f=path.join(ROOT,u.startsWith('/assets/')?'web'+u:u);if(!f.startsWith(path.join(ROOT,'web'))||!fs.existsSync(f)){res.writeHead(404);return res.end();}
   res.writeHead(200,{'content-type':u.endsWith('.js')?'text/javascript':u.endsWith('.css')?'text/css':u.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});res.end(fs.readFileSync(f));});s.listen(0,'127.0.0.1',()=>r(s));});
  cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:900,height:600,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  let ready=false;for(let i=0;i<80&&!ready;i++){await new Promise(r=>setTimeout(r,100));ready=await cdp.evaluate('window.ready===true').catch(()=>false);}
  assert.ok(ready,'card page loaded');
  const state=()=>cdp.evaluate(`(()=>{const c=document.querySelector('.qq-card'),p=document.querySelector('.qq-pill'),img=c.querySelector('.qq-qr');return {open:!c.hidden,expanded:p.getAttribute('aria-expanded'),qr:img.complete&&img.naturalWidth>0}})()`);
  const box=await cdp.evaluate(`(()=>{const r=document.querySelector('.qq-pill').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
  const mouse=(type,x,y)=>cdp.send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  {const first=await state();assert.deepEqual([first.open,first.expanded],[false,'false'],'closed at first');}
  await mouse('mouseMoved',box[0],box[1]);await new Promise(r=>setTimeout(r,300));
  let s=await state();assert.equal(s.open,true,'pointing opens it');assert.equal(s.expanded,'true');assert.equal(s.qr,true,'the QR code loads');
  await mouse('mouseMoved',5,590);await new Promise(r=>setTimeout(r,500));
  assert.equal((await state()).open,false,'leaving closes it');
  await mouse('mouseMoved',box[0],box[1]);await mouse('mousePressed',box[0],box[1]);await mouse('mouseReleased',box[0],box[1]);
  await mouse('mouseMoved',5,590);await new Promise(r=>setTimeout(r,500));
  assert.equal((await state()).open,true,'a click keeps it open');
  await cdp.evaluate(`document.querySelector('[data-qq-copy]').click()`);await new Promise(r=>setTimeout(r,50));
  assert.deepEqual(await cdp.evaluate(`[copied,document.querySelector('[data-qq-copy]').textContent]`),[['1131267542'],'已复制'],'copy button');
  await cdp.evaluate(`document.querySelector('[data-qq-open]').click()`);await new Promise(r=>setTimeout(r,100));
  assert.deepEqual(await cdp.evaluate('[calls,toasts]'),[[['open_source',{url:'https://qm.qq.com/q/C95LXYb5Sg'}]],[]],'the join page opens');
  await cdp.evaluate(`calls.length=0;toasts.length=0;copied.length=0;answer=new Error('down');document.querySelector('[data-qq-open]').click()`);await new Promise(r=>setTimeout(r,100));
  assert.deepEqual(await cdp.evaluate('[calls,copied,toasts]'),[[['open_source',{url:'https://qm.qq.com/q/C95LXYb5Sg'}]],['1131267542'],['群号已复制：1131267542']],'page not opened: number copied, toast');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await new Promise(r=>setTimeout(r,50));
  assert.equal((await state()).open,false,'Escape closes it');
  await cdp.evaluate(`document.querySelector('.qq-pill').click()`);await mouse('mousePressed',600,500);await mouse('mouseReleased',600,500);await new Promise(r=>setTimeout(r,50));
  assert.equal((await state()).open,false,'a click elsewhere closes a pinned card');
 }finally{await cdp?.stop();server?.close();await new Promise(r=>setTimeout(r,400));try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
