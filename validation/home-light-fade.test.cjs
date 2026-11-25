'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),test=require('node:test');
const {startEdge,startWeb}=require('./library-views-perf.cjs');

test('card glare and foil fade on hover and leave, including with reduced motion',async t=>{
 const server=await startWeb({});t.after(()=>server.close());
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megu-light-fade-'));let edge;
 t.after(async()=>{await edge?.stop();fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});});
 try{edge=await startEdge(profile);}catch(error){if(error.message==='EDGE_NOT_FOUND')return t.skip('Edge unavailable');throw error;}
 const {send,evaluate}=edge;
 const html='<html><head><link rel="stylesheet" href="app.css"><link rel="stylesheet" href="home-tv.css"></head><body><div class="tv-home" style="width:1000px;height:600px">'+
  ['cover','panel'].map((id,i)=>`<div id="${id}" class="tv-card touch ${i?'tv-heat-card':'tv-cover'}" style="position:absolute;left:${200+i*400}px;top:120px;width:220px;height:300px;transform:none"><div class="tv-face"><i class="tv-glare"></i>${i?'':'<i class="tv-foil"></i>'}</div></div>`).join('')+'</div></body></html>';
 const [serve]=server.listeners('request');server.off('request',serve).on('request',(req,res)=>{
  if(req.url!=='/light-fade-test')return serve(req,res);
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);
 });
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/light-fade-test'});
 const deadline=Date.now()+30000;
 while(!await evaluate("document.readyState==='complete'")){assert.ok(Date.now()<deadline,'styles loaded');await new Promise(r=>setTimeout(r,25));}
 // Pause on the event itself, so a busy runner cannot finish a 300 ms transition before it is sampled.
 await evaluate(`window.__freezeLight=()=>document.querySelectorAll('.tv-glare,.tv-foil').forEach(el=>{
  getComputedStyle(el).opacity;el.getAnimations().forEach(animation=>animation.pause());
 });for(const event of ['pointerover','pointerout'])document.addEventListener(event,__freezeLight,true);`);
 const move=(x,y)=>send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'none'});
 const read=(selector,progress)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});
  getComputedStyle(el).opacity;const animation=el.getAnimations().find(a=>a.transitionProperty==='opacity');
  if(animation&&${progress!==undefined})animation.currentTime=animation.effect.getTiming().duration*${progress??0};
  return {opacity:+getComputedStyle(el).opacity,duration:animation?.effect.getTiming().duration};})()`);
 const finish=()=>evaluate("document.querySelectorAll('.tv-glare,.tv-foil').forEach(el=>el.getAnimations().forEach(a=>a.finish()))");
 for(const motion of ['reduce','no-preference']){
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:motion}]});
  for(const [id,x] of [['cover',250],['panel',650]]){
   await move(40,40);await finish();
   const selectors=[`#${id} .tv-glare`,...(id==='cover'?[`#${id} .tv-foil`]:[])];
   for(const selector of selectors)assert.equal((await read(selector)).opacity,0);
   await move(x,220);
   for(const selector of selectors){const value=await read(selector,.5),max=selector.endsWith('.tv-foil')?.55:1;
    assert.equal(value.duration,300,`${motion}: opacity keeps its own transition`);assert.ok(value.opacity>0&&value.opacity<max,JSON.stringify(value));}
   await finish();
   for(const selector of selectors)assert.equal((await read(selector)).opacity,selector.endsWith('.tv-foil')?.55:1);
   await move(40,40);
   for(const selector of selectors){const value=await read(selector,.5),max=selector.endsWith('.tv-foil')?.55:1;
    assert.ok(value.opacity>0&&value.opacity<max,`${motion}: fading starts even while touch remains set`);}
   const before=await read(selectors[0]);await move(x,220);const after=await read(selectors[0]);
   assert.ok(Math.abs(after.opacity-before.opacity)<.03,'rapid re-entry reverses from the current brightness');await finish();
   await evaluate(`document.querySelector('#${id}').dataset.busy='1';__freezeLight()`);
   const busy=await read(selectors[0],.5);assert.ok(busy.opacity>0&&busy.opacity<1,'draw takeover fades the light');await finish();
   for(const selector of selectors)assert.equal((await read(selector)).opacity,0);
   await move(40,40);await evaluate(`delete document.querySelector('#${id}').dataset.busy`);
  }
 }
});
