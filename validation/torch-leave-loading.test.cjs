// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 user: 现在点传火碑会卡住强制加载 不让切走. The real web/ in headless Edge (startEdge, --headless=new): open 传火碑,
   and while the hall is still loading click 首页 in the top bar. The click must take the page off 传火碑 within 200 ms (measured
   from the click's own timestamp, so time the main thread was busy counts), the hall must not go on building in the background,
   and every WebGL context it opened must be released. A hall that finished loading is still kept for the next visit. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {startService,startWeb,startEdge}=require('./library-views-perf.cjs');
const {renderTemp}=require('./helpers/render-temp.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const CI=!!process.env.CI;

const TRACK=`
 window.__gl=[];
 const getContext=HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext=function(type,...rest){const c=getContext.call(this,type,...rest);if(c&&/webgl/.test(type)&&!__gl.includes(c))__gl.push(c);return c;};
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-route=home]'))window.__clickAt=e.timeStamp;},true);
 new MutationObserver(()=>{if(window.__clickAt&&window.__leftAt===undefined&&!document.querySelector('.torch-monument'))window.__leftAt=performance.now();})
  .observe(document,{childList:true,subtree:true});
`;

async function session(run){
 const temp=renderTemp('megulit-torch-leave-');
 const service=startService(temp.dir);
 let web,cdp;
 try{
  web=await startWeb({call:request=>{
   if(request.action==='torch_page')return {ok:true,total:2,items:[{torchNo:1,name:'First',game:'Public work fixture'},{torchNo:2,name:'Second'}]};
   if(request.action.startsWith('torch_'))return {ok:true,items:[],available:false};
   return service.call(request);
  }});
  cdp=await startEdge(path.join(temp.dir,'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:TRACK});
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+web.address().port+'/'});
  const evaluate=expression=>cdp.evaluate(expression);
  async function wait(expression,ms=CI?180000:30000){
   const deadline=Date.now()+ms;
   for(;;){const value=await evaluate(expression);if(value)return value;if(Date.now()>deadline)throw Error('timed out: '+expression);await pause(40);}
  }
  await wait('!!document.querySelector("[data-route=torch]")&&!!document.querySelector("[data-route=home]")');
  await evaluate('document.querySelector("#reader-notice")?.remove();document.querySelectorAll("dialog[open]").forEach(d=>d.close());');
  const home=await evaluate('(()=>{const r=document.querySelector("[data-route=home]").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()');
  /* a real mouse click: it is stamped when it is sent, and handled only when the page's main thread gets to it */
  const clickHome=async()=>{for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:home.x,y:home.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});};
  const hallState=`(async()=>{const m=await import('./torch-monument.js');return {kept:['zh','en','ja'].some(l=>m.hasTorchMonument(l)),
   live:__gl.filter(c=>!c.isContextLost()).length,contexts:__gl.length,builds:performance.getEntriesByName('torch:build-scene').length};})()`;
  await run({evaluate,wait,clickHome,hallState});
 }finally{
  try{await cdp?.stop();}catch{}
  web?.close();
  await service.stop();
  temp.remove();
 }
}

test('leaving 传火碑 while the hall is loading switches away within 200 ms and releases the hall',{timeout:CI?400000:120000},async()=>{
 await session(async({evaluate,wait,clickHome,hallState})=>{
  await evaluate('document.querySelector("[data-route=torch]").click()');
  /* the local assets are in: the hall is now being put together */
  await wait('performance.getEntriesByName("torch:bake-assets").length>0',CI?180000:30000);
  await clickHome();
  const took=await wait('window.__leftAt!==undefined&&window.__leftAt-window.__clickAt');
  /* whatever was still queued has run by now */
  await pause(1500);
  const after=await evaluate(hallState);
  assert.ok(took<200,'took '+Math.round(took)+' ms to leave 传火碑');
  assert.equal(await evaluate('document.querySelector("main").classList.contains("torch-page")'),false);
  assert.deepEqual({kept:after.kept,builds:after.builds,live:after.live},{kept:false,builds:0,live:0},JSON.stringify(after));
 });
});

test('a hall that has finished loading is kept when 传火碑 is left and shown again without a rebuild',{timeout:CI?400000:120000},async()=>{
 await session(async({evaluate,wait,clickHome,hallState})=>{
  await evaluate('document.querySelector("[data-route=torch]").click()');
  await wait('!!document.querySelector(".torch-monument .tm-canvas")&&!document.querySelector(".torch-monument .tm-canvas").inert');
  await clickHome();
  await wait('window.__leftAt!==undefined');
  const left=await evaluate(hallState);
  assert.deepEqual({kept:left.kept,builds:left.builds,live:left.live},{kept:true,builds:1,live:1},JSON.stringify(left));
  await evaluate('document.querySelector("[data-route=torch]").click()');
  await wait('!!document.querySelector(".torch-monument .tm-canvas")&&!document.querySelector(".torch-monument .tm-canvas").inert');
  const back=await evaluate(hallState);
  assert.equal(back.builds,1);
  /* no new WebGL context: the same hall came back */
  assert.equal(back.contexts,left.contexts);
  assert.equal(back.live,1);
 });
});
