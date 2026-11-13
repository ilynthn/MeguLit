/* 2026-11-14 (user: "又是那个bug 明明修了咋又来了") a random draw of a game outside the hand sends the field card back into its slot (stow);
   the card it lands as must sit exactly where the flying one ended, and stay there. Real web/ UI in headless Edge on a temp library (no MeguLit window).
   Skipped when Edge is not installed. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startService,startWeb,startEdge}=require('./library-views-perf.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));

/* in the page: pick the next random draw, start it, and record every frame until the returning card has landed and settled */
const RUN=(titles,how,kind)=>`(async()=>{const cards=()=>[...document.querySelectorAll('.tv-hand .tv-hc:not(.tv-hc-extra)')];const titles=${JSON.stringify(titles)};
 const hand=new Set(cards().map(c=>c.title)),outEl=cards().find(c=>c.classList.contains('is-out'));if(!outEl)return {error:'no field card from the hand'};
 const id=outEl.dataset.id,shown=outEl.title;globalThis.__forceKind=${JSON.stringify(kind)};
 if(${JSON.stringify(how)}==='draw'){const rest=titles.filter(t=>t!==shown),i=rest.findIndex(t=>!hand.has(t));if(i<0)return {error:'every game is in the hand'};
  const orig=Math.random;let once=true;Math.random=()=>{if(once){once=false;Math.random=orig;return (i+.5)/rest.length;}return orig();};
  document.querySelector('.tv-cover').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}));}
 else{const other=cards().find(c=>!c.classList.contains('is-out'));other.click();}
 const el=document.querySelector('.tv-hand .tv-hc[data-id="'+CSS.escape(id)+'"]'),box=document.querySelector('.tv-hand'),R=r=>({x:r.left,y:r.top,w:r.width,h:r.height});
 const frames=[];const t0=performance.now();await new Promise(done=>{const tick=()=>{const g=[...document.querySelectorAll('.tv-ghosts .tv-ghost:not(.is-trail)')];
  /* the returning ghost is the one with the stowed card's art at the low z-index (6); the field-bound one is 8 */
  /* where it lands: a still copy of the flying card at its last keyframe (frame sampling never sees the very last animation frame) */
  const ret=g.find(x=>x.style.zIndex==='6'),land=ret&&(()=>{const k=ret.getAnimations()[0]?.effect.getKeyframes().at(-1);if(!k)return null;const c=ret.cloneNode(false);
   c.style.transform=k.transform;c.style.visibility='hidden';ret.parentNode.appendChild(c);try{return R(c.getBoundingClientRect());}finally{c.remove();}})();
  frames.push({t:performance.now()-t0,ghost:land||null,card:R(el.getBoundingClientRect()),shown:getComputedStyle(el).opacity!=='0',box:R(box.getBoundingClientRect())});if(performance.now()-t0<2600)requestAnimationFrame(tick);else done();};requestAnimationFrame(tick);});
 return {id,frames};})()`;

test('a card sent home by a random draw lands exactly on its slot',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-hand-')),root=path.join(temp,'root');fs.mkdirSync(root);const service=startService(root);
 let web,cdp;try{
  for(let i=0;i<14;i++){const dir=path.join(temp,'games','g'+i);fs.mkdirSync(dir,{recursive:true});const exe=path.join(dir,'game.exe');fs.writeFileSync(exe,'MZ');
   await service.call({action:'save_game',title:'テストゲーム '+(i+1),executable:exe});}
  const titles=((await service.call({action:'home'})).games||[]).filter(g=>g.available!==false).map(g=>g.title);
  web=await startWeb(service);cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${web.address().port}/#%7B%7D`});
  for(let i=0;i<120;i++){await sleep(250);if(await cdp.evaluate('document.querySelectorAll(".tv-hand .tv-hc").length>=10&&!!document.querySelector(".tv-hand .tv-hc.is-out")').catch(()=>false))break;}
  await cdp.evaluate(`(()=>{document.querySelectorAll('dialog').forEach(d=>{try{d.close();}catch{}d.remove();});return 1;})()`);await sleep(1500);
  const rows=[];
  for(const [how,kind] of [['draw','toss'],['play','slap'],['draw','float'],['draw','spin']]){
   /* a draw needs a field card from the hand: play one first when the last round left a drawn card on the field */
   if(!(await cdp.evaluate('!!document.querySelector(".tv-hand .tv-hc.is-out")'))){await cdp.evaluate(`(()=>{document.querySelector('.tv-hand .tv-hc:not(.tv-hc-extra)').click();return 1;})()`);await sleep(1800);}
   const r=await cdp.evaluate(RUN(titles,how,kind));assert.ok(!r.error,how+' '+kind+': '+r.error);
   const f=r.frames,lastGhost=[...f].reverse().find(x=>x.ghost),after=f[f.indexOf(lastGhost)+1],end=f[f.length-1];
   assert.ok(lastGhost&&after,'the returning flight ran and ended ('+how+' '+kind+')');
   /* hand-off: the frame after the flying card is removed shows the real card where the flying one was */
   const hand={dx:after.card.x-lastGhost.ghost.x,dy:after.card.y-lastGhost.ghost.y,dw:after.card.w-lastGhost.ghost.w,dh:after.card.h-lastGhost.ghost.h};
   /* settled: the card did not move inside the fan after landing (the fan as a whole may follow the pointer depth) */
   const rel=x=>({x:x.card.x-x.box.x,y:x.card.y-x.box.y}),settle={dx:rel(end).x-rel(after).x,dy:rel(end).y-rel(after).y};
   rows.push({how,kind,hand,settle,shownAfter:after.shown});}
  console.log(JSON.stringify(rows));
  for(const r of rows){for(const [k,v] of Object.entries(r.hand))assert.ok(Math.abs(v)<=.5,`${r.how}/${r.kind}: landed card ${k} ${v.toFixed(2)}px off the flying card`);
   for(const [k,v] of Object.entries(r.settle))assert.ok(Math.abs(v)<=.5,`${r.how}/${r.kind}: card moved ${k} ${v.toFixed(2)}px after landing`);
   assert.ok(r.shownAfter,`${r.how}/${r.kind}: real card visible after the flight`);}
 }finally{cdp?.stop();web?.close();await service.stop();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
