// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-29 user: 现在这个整体不错就是不好去看排行 最好加个自由模式切换啥的 进来的时候运镜不用改. The real web/ in headless Edge
   (startEdge, --headless=new): 传火碑 opens in free mode as before (the controls line shown, no panel). 看榜 lays the ranking over
   the scene; picking a bearer flies the camera to their name and opens a card whose previous / next walk the list; closing
   the panel goes back to the view from before. A roster served from the last copy (relay unreachable) is shown, marked. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {startService,startWeb,startEdge}=require('./library-views-perf.cjs');
const {renderTemp}=require('./helpers/render-temp.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const CI=!!process.env.CI;
const NAMES=['白露','Aster','千早','Aster','夜宵','Mio','柊','Lyra','七海','Rin','葵','Nao','Aster','雪','Kai','桜'];

test('ranking mode lists the bearers, flies to one with a card, and closing it returns to the free view',{timeout:CI?400000:150000},async()=>{
 const temp=renderTemp('megulit-torch-rank-');
 const service=startService(temp.dir);
 let web,cdp;
 try{
  web=await startWeb({call:request=>{
   if(request.action==='torch_page')return {ok:true,cached:true,cachedAt:1764000000,total:NAMES.length,
    items:NAMES.map((name,i)=>({torchNo:i+1,name,game:i%2?'Public work fixture':'',at:1764000000+i*86400}))};
   if(request.action.startsWith('torch_'))return {ok:true,items:[],available:false};
   return service.call(request);
  }});
  cdp=await startEdge(path.join(temp.dir,'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__TORCH_HOUR=22;localStorage.setItem('megulit-torch-quality','low');"});
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+web.address().port+'/'});
  const evaluate=expression=>cdp.evaluate(expression);
  async function wait(expression,ms=CI?180000:30000){
   const deadline=Date.now()+ms;
   for(;;){const value=await evaluate(expression);if(value)return value;if(Date.now()>deadline)throw Error('timed out: '+expression);await pause(80);}
  }
  await wait('!!document.querySelector("[data-route=torch]")');
  await evaluate('document.querySelector("#reader-notice")?.remove();document.querySelectorAll("dialog[open]").forEach(d=>d.close());document.querySelector("[data-route=torch]").click()');
  await wait('!!document.querySelector(".torch-monument")?.__torch&&!document.querySelector(".torch-monument .tm-canvas").inert');
  await evaluate(`window.$=s=>document.querySelector('.torch-monument '+s);window.hall=document.querySelector('.torch-monument').__torch;
   window.cam=()=>hall.debug.camera.position.toArray();window.shown=el=>!!el&&!el.hidden&&el.offsetParent!==null;`);

  /* free mode by default: the scene as before, its controls line, no panel */
  assert.deepEqual(await evaluate(`({free:$('.tm-mode-free').getAttribute('aria-pressed'),help:shown($('.tm-help')),panel:shown($('.tm-rank')),
   count:$('.tm-count').textContent})`),{free:'true',help:true,panel:false,count:await evaluate("$('.tm-count').textContent")});
  assert.match(await evaluate("$('.tm-count').textContent"),/离线|Offline|オフライン/);
  await pause(300);
  const before=await evaluate('cam()');

  /* 看榜: the first page of the ranking, in order */
  await evaluate("$('.tm-mode-rank').click()");
  const list=await evaluate(`({help:shown($('.tm-help')),panel:shown($('.tm-rank')),rows:[...document.querySelectorAll('.tm-rank-row')].map(b=>b.textContent),range:$('.tm-rank-range').textContent})`);
  assert.equal(list.help,false);assert.equal(list.panel,true);assert.equal(list.rows.length,12);assert.equal(list.range,'1 / 2');
  assert.match(list.rows[0],/白露/);assert.match(list.rows[1],/Aster.*3/);

  /* a bearer: the card, and the camera goes to read the name */
  await evaluate("document.querySelectorAll('.tm-rank-row')[2].click()");
  await wait("shown($('.tm-card'))&&hall.reading()");
  await pause(1200);
  const at=await evaluate(`({name:$('.tm-card-name').textContent,no:$('.tm-card-no').textContent,cam:cam()})`);
  assert.equal(at.name,'千早');assert.match(at.no,/3/);
  assert.ok(Math.hypot(...at.cam.map((v,i)=>v-before[i]))>.5,JSON.stringify({before,at:at.cam}));
  await evaluate("$('.tm-card-next').click()");
  await wait("$('.tm-card-name').textContent==='Aster'&&$('.tm-card-no').textContent.includes('4')");

  /* search narrows the list */
  await evaluate("const i=$('.tm-rank-find');i.value='Aster';i.dispatchEvent(new Event('input',{bubbles:true}))");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.tm-rank-row b')].map(b=>b.textContent)"),['Aster','Aster','Aster']);

  /* closing the panel: the card goes, the view comes back, free mode again */
  await evaluate("$('.tm-rank-close').click()");
  await wait("!hall.reading()");
  await pause(1500);
  const after=await evaluate(`({card:shown($('.tm-card')),panel:shown($('.tm-rank')),help:shown($('.tm-help')),free:$('.tm-mode-free').getAttribute('aria-pressed'),cam:cam()})`);
  assert.deepEqual({card:after.card,panel:after.panel,help:after.help,free:after.free},{card:false,panel:false,help:true,free:'true'});
  assert.ok(Math.hypot(...after.cam.map((v,i)=>v-before[i]))<.2,JSON.stringify({before,after:after.cam}));
 }finally{
  try{await cdp?.stop();}catch{}
  web?.close();
  await service.stop();
  temp.remove();
 }
});
