'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startService,startWeb,startEdge,png}=require('./library-views-perf.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Real library DOM and WAAPI: a replacement must stay invisible, row clocks must agree,
// and removing the animation must leave the same search input at its CSS destination.
test('library views fade completely, wall strips alternate, and the elastic bar lands exactly', {timeout:120000}, async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megu-library-switch-')),data=path.join(temp,'data');fs.mkdirSync(data);
 let service,server,edge;
 t.after(async()=>{await edge?.stop();server?.close();await service?.stop();fs.rmSync(temp,{recursive:true,force:true,maxRetries:3,retryDelay:200});});
 try{edge=await startEdge(path.join(temp,'browser'));}catch(error){if(error.message==='EDGE_NOT_FOUND')return t.skip('Edge unavailable');throw error;}
 service=startService(data);
 for(let i=0;i<5;i++){
  const folder=path.join(temp,'games',String(i));fs.mkdirSync(folder,{recursive:true});const executable=path.join(folder,'game.exe');fs.writeFileSync(executable,'MZ');
  await service.call({action:'save_game',title:'Switch fixture '+i,executable});
 }
 for(const [i,game] of (await service.call({action:'home'})).games.entries()){
  const file=path.join(temp,'cover'+i+'.png');fs.writeFileSync(file,png(80,120,[50+i*20,70,90],[80,40,60+i*15]));
  await service.call({action:'game_cover',id:game.id,path:file});
 }
 server=await startWeb(service);const {send,evaluate}=edge;
 const wait=async expression=>{const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await sleep(25);}throw Error('Timed out: '+expression);};
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/#%7B%7D`});
 await wait('!!window.__megulitTest');
 await evaluate(`document.documentElement.classList.remove('app-boot-pre');document.querySelectorAll('dialog').forEach(d=>{d.close();d.remove()});
  localStorage.setItem('megulit-library-view','list');window.__megulitTest.navigate('library');`);
 await wait("!!document.querySelector('.library-wall-toggle')");
 await wait("document.querySelectorAll('.library-grid .library-card').length===5");
 await sleep(400); // Finish the page's initial deferred render before observing switch replacements.
 await evaluate(`window.__input=document.querySelector('#game-search');__input.focus();window.__motions=[];window.__cuts=[];
  const animate=Element.prototype.animate;Element.prototype.animate=function(keys,options){
   const kind=this.id==='library-results'?'host':this.classList.contains('field-search')?'bar':this.matches('mg-cell[data-wall-row]')?'row':null;
   if(kind){const r=this.getBoundingClientRect();__motions.push({kind,row:this.dataset.wallRow,keys,options,rect:{left:r.left,top:r.top,width:r.width,height:r.height}});}
   return animate.call(this,keys,options);
  };
  new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.matches?.('.games-grid'))))
   __cuts.push(+getComputedStyle(document.querySelector('#library-results')).opacity);
  }).observe(document.querySelector('#library-results'),{childList:true});`);
 const settled="(async()=>!(await import('/library-switch-motion.js')).isBusy())()",leaders=[],orders=[];
 for(const preference of ['reduce','no-preference']){
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:preference}]});
  for(const view of ['tracks','wall','list']){
   await evaluate("__motions=[];__cuts=[];document.querySelector('.library-wall-toggle').click()");
   await wait("__motions.some(x=>x.kind==='bar')");
   if(view==='wall'){
    await wait("document.querySelectorAll('mg-cell[data-wall-row]:not([data-parked])').length>0");
    const clocks=await evaluate("[...document.querySelectorAll('mg-cell[data-wall-row]:not([data-parked])')].map(n=>n.getAnimations()[0]?.startTime)");
    assert.ok(clocks.every(n=>n!=null),'all wall cells, including deferred margin cells, animate');
    assert.ok(Math.max(...clocks)-Math.min(...clocks)<1,'rows share one entrance clock');
   }
   await wait(settled);
   const result=await evaluate(`(()=>{const bar=document.querySelector('.field-search'),root=document.querySelector('#library-results'),r=bar.getBoundingClientRect();
    return {motions:__motions,cuts:__cuts,view:document.querySelector('.library-wall-toggle').dataset.view,stored:localStorage.getItem('megulit-library-view'),
     same:__input===document.querySelector('#game-search'),focus:document.activeElement===__input,barAnimations:bar.getAnimations().length,hostAnimations:root.getAnimations().length,
     transition:bar.style.transition,pointerEvents:root.style.pointerEvents,opacity:root.style.opacity,rect:{left:r.left,top:r.top,width:r.width,height:r.height},
     leader:root.querySelector('mg-cell[data-wall-row="0"][data-wall-col="0"] [data-member-id]')?.dataset.memberId,
     order:[...root.querySelectorAll('.library-grid .library-card')].map(n=>n.dataset.memberId)};})()`);
   assert.equal(result.view,view);assert.equal(result.stored,view);assert.ok(result.same&&result.focus,'input and focus survive the switch');
   assert.ok(result.cuts.length&&result.cuts.every(n=>n<.001),'old view is fully faded before DOM replacement: '+JSON.stringify({view,cuts:result.cuts}));
   const bar=result.motions.find(m=>m.kind==='bar');assert.ok(bar.options.duration>=1000,'bar settles at a readable pace');
   assert.equal(bar.keys.at(-1).scale,'1 1');assert.ok(bar.keys.some(k=>parseFloat(k.scale)>1),'bar stretches while moving');
   for(const key of ['left','top','width','height'])assert.ok(Math.abs(bar.rect[key]-result.rect[key])<.5,`exact final ${key}`);
   assert.equal(result.barAnimations,0);assert.equal(result.hostAnimations,0);assert.equal(result.transition,'');assert.equal(result.pointerEvents,'');assert.equal(result.opacity,'');
   const rows=result.motions.filter(m=>m.kind==='row');
   if(view!=='tracks'){
    assert.ok(rows.length>0);const entering=view==='wall',directions=new Map();
    for(const row of rows){const pose=row.keys[entering?0:1],x=parseFloat(pose.translate);
     assert.ok(Math.abs(x)>1000,'strips travel from/to outside the viewport');assert.equal(pose.opacity,0);
     if(directions.has(+row.row))assert.equal(directions.get(+row.row),x);directions.set(+row.row,x);
     assert.equal(row.options.easing,entering?'cubic-bezier(.16,1,.3,1)':'cubic-bezier(.55,0,.85,.35)');
    }
    for(const [row,x] of directions)if(directions.has(row+1))assert.ok(x*directions.get(row+1)<0,'neighbouring strips have opposite directions');
   }else assert.equal(rows.length,0);
   if(view==='wall')leaders.push(result.leader);
   if(view==='list')orders.push(result.order);
  }
 }
 assert.ok(leaders.every(Boolean));assert.notEqual(leaders[0],leaders[1],'wall leader changes on re-entry');
 assert.deepEqual(orders[0],orders[1],'random wall phase never reorders the list');
 assert.equal(await evaluate(`(async()=>{try{await(await import('/library-switch-motion.js')).switchLibrary('tracks',()=>{throw Error('render fixture')});}
  catch(e){return e.message==='render fixture';}})()`),true);
 await wait(settled);
 assert.equal(await evaluate("document.querySelector('#library-results').style.opacity"),'','failed render restores opacity');
 await evaluate("for(let i=0;i<6;i++)document.querySelector('.library-wall-toggle').click()");
 await wait("__motions.filter(m=>m.kind==='bar').length>1");await wait(settled);
 assert.equal(await evaluate("document.querySelector('.library-wall-toggle').dataset.view===localStorage.getItem('megulit-library-view')"),true);
 await evaluate("document.querySelector('.library-wall-toggle').click()");
 await wait("(async()=>(await import('/library-switch-motion.js')).isBusy())()");
 await evaluate("window.__megulitTest.navigate('home')");await wait(settled);
 assert.equal(await evaluate("!!document.querySelector('#library-results')"),false,'leaving the page does not render a stale library');
});
