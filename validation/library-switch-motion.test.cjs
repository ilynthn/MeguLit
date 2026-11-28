// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startService,startWeb,startEdge,png}=require('./library-views-perf.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/* Library view switch and library entrance, in the real web UI in headless Edge on fake data.
   2026-11-29 (owner recordings of 1.4.26): #1085 had replaced the switch with "fade the old view out completely, render,
   fade the new one in", so every switch painted frames with no library at all for the whole render, and the list and the
   wall lost their own motion; opening the library from another page showed the list or the tracks all at once. The test
   that came with #1085 only read DOM state at the replacement (and required the old view to be fully faded there), so it
   passed while the screen was empty. These tests look at what is presented: screencast frames for blank frames, and card
   positions over time for motion. */

// Saturated covers: the page chrome is dark and grey, so coloured pixels on screen are covers.
const COLOURS=[[[235,40,60],[60,70,235]],[[240,200,40],[220,50,160]],[[40,200,90],[40,90,230]],[[230,110,30],[150,40,220]],[[40,190,220],[230,50,90]]];

async function openLibrary(t,{games=5,view='list',slowCovers=false}={}){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megu-library-switch-')),data=path.join(temp,'data');fs.mkdirSync(data);
 let service,server,edge;
 t.after(async()=>{await edge?.stop();server?.close();await service?.stop();fs.rmSync(temp,{recursive:true,force:true,maxRetries:3,retryDelay:200});});
 try{edge=await startEdge(path.join(temp,'browser'));}catch(error){if(error.message==='EDGE_NOT_FOUND'){t.skip('Edge unavailable');return null;}throw error;}
 service=startService(data);
 for(let i=0;i<games;i++){
  const folder=path.join(temp,'games',String(i));fs.mkdirSync(folder,{recursive:true});const executable=path.join(folder,'game.exe');fs.writeFileSync(executable,'MZ');
  await service.call({action:'save_game',title:'Switch fixture '+i,executable});
 }
 for(const [i,game] of (await service.call({action:'home'})).games.entries()){
  const file=path.join(temp,'cover'+i+'.png');fs.writeFileSync(file,png(80,120,...COLOURS[i%COLOURS.length]));
  await service.call({action:'game_cover',id:game.id,path:file});
 }
 server=await startWeb(service);const {send,evaluate}=edge;
 const wait=async(expression,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await evaluate(expression))return;await sleep(25);}throw Error('Timed out: '+expression);};
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/#%7B%7D`});
 await wait('!!window.__megulitTest');
 await evaluate(`document.documentElement.classList.remove('app-boot-pre');document.querySelectorAll('dialog').forEach(d=>{d.close();d.remove()});
  localStorage.setItem('megulit-library-view',${JSON.stringify(view)});window.__megulitTest.navigate('home');`);
 // The motion module loads on idle; the entrance under test is the one a running app plays.
 await wait("(async()=>{try{await import('/library-switch-motion.js');return true;}catch{return false;}})()");
 await sleep(600);
 if(slowCovers){
  // Covers answer late, so the library arrives before them.
  await send('Fetch.enable',{patterns:[{urlPattern:'*cover*',requestStage:'Request'}]});
  edge.onEvent=m=>{if(m.method==='Fetch.requestPaused')setTimeout(()=>send('Fetch.continueRequest',{requestId:m.params.requestId}).catch(()=>{}),900);};
 }
 const settled="(async()=>!(await import('/library-switch-motion.js')).isBusy())()";
 return {edge,send,evaluate,wait,settled};
}

// Share of coloured pixels (any cover above ~15 % opacity on the dark page) below the top bar of a screencast frame,
// decoded in the page itself. The capsule (its coloured lamps) is masked out: mask is a page rectangle.
const COVER_SHARE=`window.__coverShare=async(data,mask)=>{const image=new Image();image.src='data:image/jpeg;base64,'+data;await image.decode();
 const w=image.naturalWidth,h=image.naturalHeight,c=new OffscreenCanvas(w,h),g=c.getContext('2d');g.drawImage(image,0,0);
 const k=w/innerWidth,top=Math.round(h*.1),px=g.getImageData(0,top,w,h-top).data;let hit=0;
 for(let i=0;i<px.length;i+=4){const x=(i/4)%w/k,y=(Math.floor(i/4/w)+top)/k;
  if(mask&&x>=mask.left&&x<=mask.right&&y>=mask.top&&y<=mask.bottom)continue;
  const hi=Math.max(px[i],px[i+1],px[i+2]),lo=Math.min(px[i],px[i+1],px[i+2]);if(hi>48&&hi-lo>26)hit++;}
 return hit/(px.length/4);};1`;
const BAR="(()=>{const r=document.querySelector('.field-search').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()";

// Positions of the visible cards, sampled every frame for `ms`, in the page. With after=true the clock starts when the
// view is replaced, so the old view's own motion (the drifting tracks) is not counted for the new one.
const TRACK=(ms,after=false)=>`window.__track=[];(()=>{let t0=performance.now();const tick=()=>{const t=performance.now()-t0;
 const host=document.querySelector('#library-results');const cards=host?[...host.querySelectorAll('.library-card')].slice(0,40):[];
 window.__track.push({t,cards:cards.map(c=>{const r=c.getBoundingClientRect();return [Math.round(r.left*10)/10,Math.round(r.top*10)/10,Math.round(r.width*10)/10];})});
 if(t<${ms})requestAnimationFrame(tick);};
 if(!${after})return requestAnimationFrame(tick);
 const host=document.querySelector('#library-results'),seen=new MutationObserver(()=>{seen.disconnect();t0=performance.now();requestAnimationFrame(tick);});
 seen.observe(host,{childList:true});})();1`;
// Frames (within the first `ms`) in which some card is somewhere else than in the frame before it.
const moving=(track,ms)=>track.filter((f,i)=>i&&f.t<=ms&&f.cards.length&&f.cards.length===track[i-1].cards.length&&
 f.cards.some((c,k)=>Math.abs(c[0]-track[i-1].cards[k][0])+Math.abs(c[1]-track[i-1].cards[k][1])+Math.abs(c[2]-track[i-1].cards[k][2])>.5)).length;

test('switching views never paints a frame without covers, and the list and the wall arrive in motion', {timeout:180000}, async t=>{
 // Enough games that the render takes a few frames, as on a real library: that is when an empty frame shows.
 const page=await openLibrary(t,{games:30});if(!page)return;const {edge,send,evaluate,wait,settled}=page;
 await evaluate("window.__megulitTest.navigate('library');1");
 await wait("document.querySelectorAll('.library-grid .library-card').length===30");await sleep(1200);await wait(settled);
 await evaluate(COVER_SHARE);
 const frames=[];
 edge.onEvent=m=>{if(m.method!=='Page.screencastFrame')return;
  frames.push({t:m.params.metadata.timestamp*1000,data:m.params.data});send('Page.screencastFrameAck',{sessionId:m.params.sessionId}).catch(()=>{});};
 try{
  for(const view of ['tracks','wall','list']){
   await send('Page.startScreencast',{format:'jpeg',quality:70,maxWidth:640,maxHeight:360,everyNthFrame:1});await sleep(300);
   const bar0=await evaluate(BAR);frames.length=0;const started=Date.now();
   await evaluate(TRACK(900,true));
   await evaluate(`(async()=>{const motion=await import('/library-switch-motion.js'),end=performance.now()+5000;document.querySelector('.library-wall-toggle').click();
    while(!motion.isBusy()){if(performance.now()>end)throw Error('switch did not start');await new Promise(requestAnimationFrame);}})()`);
   await wait(settled);await sleep(300);await send('Page.stopScreencast');
   const bar1=await evaluate(BAR),mask={left:Math.min(bar0.left,bar1.left)-24,right:Math.max(bar0.right,bar1.right)+24,top:Math.min(bar0.top,bar1.top)-24,bottom:Math.max(bar0.bottom,bar1.bottom)+24};
   assert.equal(await evaluate("document.querySelector('.library-wall-toggle').dataset.view"),view);
   // The first screencast frame after a start can be an empty placeholder; the check begins at the first frame with covers.
   const shown=frames.filter(f=>f.t>=started-20);
   assert.ok(shown.length>=5,`the ${view} switch presented frames (${shown.length})`);
   const shares=[];for(const f of shown)shares.push({at:Math.round(f.t-started),share:await evaluate(`window.__coverShare(${JSON.stringify(f.data)},${JSON.stringify(mask)})`)});
   const first=shares.findIndex(s=>s.share>.01);
   assert.ok(first>=0,`covers were measured during the ${view} switch`);
   // An empty library on screen: a run of presented frames without covers, three or more frames or 40 ms or longer.
   // (A single dim frame at the cut, where the new covers are just starting to light, is not that.) Small coloured marks
   // stay on the page whatever the library shows, so "without covers" is: at that floor (the lowest share of the switch)
   // and under 0.4 % of the frame.
   const floor=Math.min(...shares.slice(first).map(s=>s.share)),empty=s=>s.share<.004&&s.share<floor+.0008;
   let run=[],worst=[];for(const s of shares.slice(first)){if(empty(s))run.push(s);else run=[];if(run.length>worst.length)worst=[...run];}
   const span=worst.length?worst.at(-1).at-worst[0].at:0;
   assert.ok(worst.length<3&&span<40,`the library was empty on screen while switching to ${view} (${worst.length} frames, ${span} ms): `+
    JSON.stringify(shares.map(s=>[s.at,Math.round(s.share*10000)/10000])));
   // The list and the wall spread out / gather in: their covers travel, frame after frame, while they arrive.
   if(view!=='tracks'){const track=await evaluate('window.__track');
    assert.ok(moving(track,900)>=4,`covers move while the ${view} arrives (frames with movement: ${moving(track,900)})`);}
  }
 }finally{edge.onEvent=null;}
});

test('the switch keeps the search field, lands the capsule exactly and skips the motion under reduced motion', {timeout:120000}, async t=>{
 const page=await openLibrary(t);if(!page)return;const {send,evaluate,wait,settled}=page;
 await evaluate("window.__megulitTest.navigate('library');1");
 await wait("document.querySelectorAll('.library-grid .library-card').length===5");await sleep(1200);await wait(settled);
 // Startup notices open late and take focus with autofocus; they are not part of this test.
 await sleep(1500);await evaluate("document.querySelectorAll('dialog').forEach(d=>{try{d.close()}catch{}d.remove()});1");
 await evaluate("window.__input=document.querySelector('#game-search');__input.focus();1");
 for(const preference of ['no-preference','reduce']){
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:preference}]});
  for(const view of ['tracks','wall','list']){
   await evaluate(`window.__animated=0;if(!window.__wrapped){window.__wrapped=true;const animate=Element.prototype.animate;Element.prototype.animate=function(...a){
    if(this.closest?.('#library-results,.field-search'))window.__animated++;return animate.apply(this,a);};}1`);
   await evaluate("document.querySelector('.library-wall-toggle').click();1");
   await wait(`document.querySelector('.library-wall-toggle').dataset.view===${JSON.stringify(view)}`);await sleep(50);await wait(settled);await sleep(900);
   const r=await evaluate(`(()=>{const bar=document.querySelector('.field-search'),root=document.querySelector('#library-results');
    return {animated:window.__animated,stored:localStorage.getItem('megulit-library-view'),same:window.__input===document.querySelector('#game-search'),
     focus:document.activeElement===window.__input,active:document.activeElement?.outerHTML?.slice(0,80),bar:bar.getAnimations().filter(a=>a.playState==='running').length,
     translate:getComputedStyle(bar).translate,transition:bar.style.transition,origin:root.style.transformOrigin,
     host:root.getAnimations().filter(a=>a.playState==='running').length,cards:root.querySelectorAll('.library-card').length};})()`);
   assert.equal(r.stored,view);assert.ok(r.same&&r.focus,'the search field and its focus survive the switch: '+JSON.stringify({view,preference,same:r.same,focus:r.focus,active:r.active}));
   assert.ok(r.cards>=5,'the new view shows the games');
   assert.equal(r.bar,0);assert.equal(r.host,0,'nothing is left playing after the switch');
   assert.ok(r.translate==='none'||r.translate==='0px 0px'||r.translate==='0px','the capsule ends at its CSS position: '+r.translate);
   assert.equal(r.transition,'');assert.equal(r.origin,'');
   if(preference==='reduce')assert.equal(r.animated,0,'reduced motion swaps the view without animation');
   else assert.ok(r.animated>0,'the switch animates');
  }
 }
});

test('opening the library from another page plays the entrance of its view', {timeout:180000}, async t=>{
 const page=await openLibrary(t,{games:12});if(!page)return;const {evaluate,wait,settled}=page;
 for(const view of ['list','tracks','wall']){
  await evaluate(`localStorage.setItem('megulit-library-view',${JSON.stringify(view)});window.__megulitTest.navigate('home');1`);
  await wait("!document.querySelector('#library-results')");await sleep(900);
  await evaluate(TRACK(800)+";window.__megulitTest.navigate('library');1");
  await wait("!!document.querySelector('#library-results .library-card')");await sleep(1000);await wait(settled);
  const track=await evaluate('window.__track');
  assert.ok(moving(track,800)>=4,`covers move into place when the library opens in the ${view} view (frames with movement: ${moving(track,800)})`);
  // The entrance ends with nothing left hidden.
  assert.equal(await evaluate(`[...document.querySelectorAll('#library-results .library-card')].filter(c=>!c.closest('[data-parked]')).some(c=>{
   for(let n=c;n&&n.id!=='library-results';n=n.parentElement)if(+getComputedStyle(n).opacity<.99&&!n.closest('mg-cell'))return true;return false;})`),false);
 }
});

test('a cover that loads after its view has arrived fades in; one that is there in time shows with the view', {timeout:120000}, async t=>{
 const page=await openLibrary(t);if(!page)return;const {evaluate,wait}=page;
 await evaluate("window.__megulitTest.navigate('library');1");
 await wait("document.querySelectorAll('.library-grid .library-card').length===5");
 const r=await evaluate(`(async()=>{const motion=await import('/library-switch-motion.js');
  // A cover the browser has never seen (a fresh data URL) is not decoded in the task that inserts it.
  const c=new OffscreenCanvas(800,1200),g=c.getContext('2d');
  for(let i=0;i<200;i++){g.fillStyle='hsl('+(i*37%360)+' 80% 55%)';g.fillRect(i*13%800,i*29%1200,160,200);}
  const blob=await c.convertToBlob({type:'image/png'}),url=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(blob);});
  const known=document.querySelector('#library-results img.cover').src;
  const box=document.createElement('div');box.className='library-grid';box.style.cssText='position:fixed;left:0;top:120px;width:300px';
  box.innerHTML='<div class="library-card"><span class="cover-frame"><img class="cover late" alt=""></span></div><div class="library-card"><span class="cover-frame"><img class="cover known" alt=""></span></div>';
  document.body.append(box);const late=box.querySelector('.late'),ready=box.querySelector('.known');ready.src=known;await ready.decode().catch(()=>{});late.src=url;
  const faded=new Set();for(const img of [late,ready]){const animate=img.animate.bind(img);img.animate=(k,o)=>{if(JSON.stringify(k).includes('"opacity":0'))faded.add(img.className);return animate(k,o);};}
  motion.libraryIn(box,'list');const before={late:late.complete,opacity:late.style.opacity};
  // The late cover's load is moved past the threshold by moving the clock, not by waiting on a slow decode.
  const real=performance.now.bind(performance);performance.now=()=>real()+1000;
  try{await new Promise(res=>{if(late.complete&&late.naturalWidth)res();else late.addEventListener('load',res,{once:true});});}finally{performance.now=real;}
  await new Promise(requestAnimationFrame);const result={before,late:faded.has('cover late'),ready:faded.has('cover known')};box.remove();return result;})()`);
 assert.equal(r.before.late,false,'the new cover is still loading when its view arrives');
 assert.equal(r.before.opacity,'','nothing is hidden while it loads: the empty frame shows');
 assert.equal(r.late,true,'a cover that loads after its view arrived fades in instead of popping');
 assert.equal(r.ready,false,'a cover that is there in time shows with its view, without a second fade');
});
