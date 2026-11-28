/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const web=path.join(__dirname,'../web');
const source=fs.readFileSync(path.join(web,'torch-monument.js'),'utf8')
 .split('/* ================= the scene ================= */')[0]
 .replace(/^import .*\r?\n/gm,'').replaceAll('export ','');
const deferred=()=>Promise.withResolvers();

function fixture({holdBuild=false,simpleAfter=0}={}){
 const gate=deferred();
 const calls=[],globalEvents=new EventTarget(),documentEvents=new EventTarget(),bake=deferred(),font=deferred(),page=deferred();
 const mounts=[],scenes=[],search=deferred(),jump=deferred();
 let builds=0,disposals=0,lookups=0,intros=0,active=false,paints=0;
 function node(){
  const classes=new Set();
  return Object.assign(new EventTarget(),{style:{},classes,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},setAttribute(){},remove(){
   if(this.parent?.child===this)this.parent.child=null;
   this.removed=true;
  }});
 }
 const nodes=new Map();
 const context={
  performance,setTimeout,clearTimeout,setInterval,clearInterval,console,window:{},localStorage:{getItem:()=> 'high'},matchMedia:()=>({matches:false}),
  document:{fonts:{load(){calls.push('font');return font.promise;}},hasFocus:()=>true,
   createElement(tag){
    if(tag==='canvas')return {getContext:()=>({measureText:()=>({width:10})})};
    const host=node(),children=new Map();nodes.set(host,children);
    host.querySelector=key=>{if(!children.has(key))children.set(key,node());return children.get(key);};
    host.contains=()=>true;
    return host;
   },
   addEventListener:documentEvents.addEventListener.bind(documentEvents),removeEventListener:documentEvents.removeEventListener.bind(documentEvents)},
  addEventListener:globalEvents.addEventListener.bind(globalEvents),removeEventListener:globalEvents.removeEventListener.bind(globalEvents),
  ResizeObserver:class{observe(){this.observing=true;} disconnect(){this.observing=false;}},
  loadGsap(){calls.push('gsap');return Promise.resolve(null);},
  loadBaked(){calls.push('bake');return bake.promise;},
  bakeProgress:()=>0,
  withBaked:(result,build)=>build(),
  async buildScene({onFirstFrame,alive}){
   builds++;
   if(holdBuild){await gate.promise;if(!alive()){disposals++;throw hall.CANCELLED;}}
   const scene={tier:'high',firstFrame:onFirstFrame,prepare(fn){this.ready=fn;},intro(){intros++;},resize(){},
    setActive(on){active=on;},suspend(){active=false;},reading(){lookups++;return false;},
    paintFace(){paints++;},dispose(){disposals++;}};
   scenes.push(scene);return scene;
  }
 };
 const code=simpleAfter?source.replace('SIMPLE_AFTER=10000','SIMPLE_AFTER='+simpleAfter):source;
 const hall=vm.runInNewContext(code+'\n({openTorchMonument,closeTorchMonument,suspendTorchMonument,leaveTorchMonument,hasTorchMonument,invalidateTorchMonument,CANCELLED})',context);
 const api=(name,params)=>{
  calls.push(name);
  if(name==='torch_page')return params.cursor?jump.promise:page.promise;
  if(name==='torch_find'&&!params.probe)return search.promise;
  return Promise.resolve({ok:false});
 };
 const notes=[];
 const open=(locale='en',onContextLost)=>{
  const mount={append(el){el.parent=this;this.child=el;el.removed=false;}};
  mounts.push(mount);
  return hall.openTorchMonument({locale,mount,api,toast:note=>notes.push(note),onContextLost});
 };
 const emit=(type,props={})=>globalEvents.dispatchEvent(Object.assign(new Event(type),props));
 return {open,close:hall.closeTorchMonument,suspend:hall.suspendTorchMonument,leave:hall.leaveTorchMonument,has:hall.hasTorchMonument,invalidate:hall.invalidateTorchMonument,emit,
  finishBuild:()=>gate.resolve(),
  get host(){return [...nodes.keys()].at(-1);},get nodes(){return nodes.get(this.host);},
  mounts,calls,bake,font,page,search,jump,notes,ready:()=>scenes.at(-1).ready(),firstFrame:()=>scenes.at(-1).firstFrame(),
  get active(){return active;},get builds(){return builds;},get disposals(){return disposals;},
  get lookups(){return lookups;},get intros(){return intros;},get paints(){return paints;}};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
const resolveAssets=f=>{f.bake.resolve({ok:true});f.font.resolve();};
async function prepared(f){
 const opening=f.open();
 resolveAssets(f);f.page.resolve({ok:true,items:[{torchNo:0,name:'First'}],total:1});
 await opening;f.ready();
}

test('prepare local assets and page 1 together, then discard a visit cancelled during startup',async()=>{
 const f=fixture();
 const pending=f.open();
 assert.deepEqual(f.calls,['font','gsap','bake','torch_page']);
 assert.equal(f.nodes.get('.tm-status').textContent,'Preparing the hall…');
 assert.doesNotMatch(f.host.innerHTML,/tm-close/);
 f.close();
 f.bake.resolve({ok:true});f.font.resolve();f.page.resolve({ok:true,items:[]});
 assert.equal(await pending,null);
 assert.equal(f.host.removed,true);
 assert.equal(f.builds,0);
 assert.deepEqual(f.calls,['font','gsap','bake','torch_page']);
});

test('scene preparation can finish before names arrive, and explicit close owns teardown',async()=>{
 const f=fixture();
 const pending=f.open();
 f.bake.resolve({ok:true});f.font.resolve();
 await pending;
 assert.equal(f.builds,1);
 f.ready();
 assert.equal(f.nodes.get('.tm-status').textContent,'Loading…');
 f.close();f.close();
 f.page.resolve({ok:true,items:[]});
 assert.equal(f.host.removed,true);
 assert.equal(f.disposals,1);
});

test('a missing route, a connection failure and an empty page have distinct status',async()=>{
 for(const [response,message] of [
  [{ok:false,error:'NOT_DEPLOYED'},'This list feature is not available on the server yet.'],
  [{ok:false,error:'OFFLINE'},'Cannot reach the server right now. Try again later.'],
  [{ok:true,total:0,items:[]},'']
 ]){
  const f=fixture();
  const pending=f.open();
  f.bake.resolve({ok:true});f.font.resolve();f.page.resolve(response);
  await pending;
  f.ready();
  assert.equal(f.nodes.get('.tm-status').textContent,message);
  assert.equal(f.nodes.get('.tm-status').hidden,!message);
  f.close();
 }
});


test('leave and reenter reuse a prepared scene and its first frame without repolling',async()=>{
 const f=fixture();await prepared(f);
 const host=f.host,calls=[...f.calls],veil=f.nodes.get('.tm-veil'),paints=f.paints;
 assert.equal(f.active,true);
 assert.equal(f.intros,0);
 f.suspend();
 assert.equal(f.active,false);
 assert.equal(f.mounts[0].child,null);
 f.emit('focus');
 f.emit('keydown',{key:'Escape'});
 assert.equal(f.active,false);
 assert.equal(f.lookups,0);
 await f.open();
 assert.equal(f.mounts[1].child,host);
 assert.equal(f.intros,0);
 f.firstFrame();
 assert.equal(f.intros,1);
 assert.equal(veil.style.opacity,'0');
 f.suspend();
 await f.open();
 assert.equal(f.mounts[2].child,host);
 assert.deepEqual(f.calls,calls);
 assert.equal(f.paints,paints);
 assert.equal(f.intros,1);
 assert.equal(f.builds,1);
 assert.equal(f.disposals,0);
 assert.equal(f.active,true);
 f.close();
});

test('in-flight preparation is shared and does not build into a route that has already left',async()=>{
 const f=fixture(),first=f.open();
 f.suspend();
 resolveAssets(f);f.page.resolve({ok:true,items:[]});
 await flush();await flush();
 assert.equal(f.builds,0);
 assert.equal(f.active,false);
 const second=f.open();
 assert.equal(await first,await second);
 assert.equal(f.builds,1);
 assert.equal(f.calls.filter(call=>call==='torch_page').length,1);
 f.close();
});

test('late search and jump replies cannot toast or change the roster after a new visit',async()=>{
 const f=fixture();await prepared(f);
 const form=f.nodes.get('.tm-find');
 const input=f.host.querySelector('.tm-find input');
 input.value='someone';form.dispatchEvent(new Event('submit'));
 input.value='#100';form.dispatchEvent(new Event('submit'));
 assert.equal(f.calls.filter(name=>name==='torch_page').length,2);
 f.suspend();await f.open();
 const paints=f.paints;
 f.search.resolve({ok:false});
 f.jump.resolve({ok:true,total:1,items:[{torchNo:100,name:'Late'}]});
 await flush();
 assert.match(f.nodes.get('.tm-range').textContent,/0/);
 assert.deepEqual(f.notes,[]);
 assert.equal(f.paints,paints);
 assert.equal(f.nodes.get('.tm-status').hidden,true);
 f.close();
});

test('a detached scene is disposed on locale change, shutdown or context loss',async()=>{
 for(const dispose of [
  f=>f.invalidate('ja'),
  f=>f.emit('pagehide',{persisted:false}),
  f=>f.emit('megulit-game-launch'),
  f=>f.nodes.get('.tm-canvas').dispatchEvent(new Event('webglcontextlost'))
 ]){
  const f=fixture();await prepared(f);
  f.suspend();
  f.emit('pagehide',{persisted:true});
  assert.equal(f.disposals,0);
  dispose(f);
  assert.equal(f.disposals,1);
  assert.equal(f.active,false);
  await f.open();
  assert.equal(f.builds,2);
  f.close();
 }
});

test('context loss calls only the current route recovery handler',async()=>{
 const f=fixture();await prepared(f);
 const canvas=f.nodes.get('.tm-canvas');
 f.suspend();
 let recoveries=0;
 await f.open('en',()=>recoveries++);
 canvas.dispatchEvent(new Event('webglcontextlost'));
 canvas.dispatchEvent(new Event('webglcontextlost'));
 assert.equal(recoveries,1);
 assert.equal(f.disposals,1);
 assert.equal(f.mounts.at(-1).child,null);
});

/* 2026-11-28 user: 现在点传火碑会卡住强制加载 不让切走. Leaving the route (another top-bar page) while the hall is still being built gives
   the visit up at once: the build stops at its next slice and releases what it made, nothing of it is kept for the next visit. */
test('leaving while the hall is still being built gives it up and releases it, a ready hall is kept',async()=>{
 const f=fixture({holdBuild:true});
 const opening=f.open();
 resolveAssets(f);f.page.resolve({ok:true,items:[{torchNo:0,name:'First'}],total:1});
 for(let i=0;i<6&&!f.builds;i++)await flush();
 assert.equal(f.builds,1);
 f.leave();
 assert.equal(f.has('en'),false);
 assert.equal(f.host.removed,true);
 f.finishBuild();
 assert.equal(await opening,null);
 assert.equal(f.disposals,1);
 /* the next visit builds afresh, and once ready leaving keeps it */
 const again=fixture();await prepared(again);
 again.leave();
 assert.equal(again.has('en'),true);
 assert.equal(again.disposals,0);
 again.close();
});

test('a bake that cannot be read shows the names as a simple list instead of working the hall out on the page',async()=>{
 for(const [reason,reads] of [['stale',1],['ashlar.map.webp: decode failed',2]]){
  const f=fixture();
  const opening=f.open();
  f.bake.resolve({ok:false,reason});f.font.resolve();f.page.resolve({ok:true,items:[{torchNo:0,name:'First',game:'Some game'}],total:1});
  assert.equal(await opening!==null,true);
  await flush();
  assert.equal(f.builds,0);
  assert.equal(f.calls.filter(call=>call==='bake').length,reads);
  assert.equal(f.host.classes.has('tm-simple'),true);
  assert.match(f.nodes.get('.tm-list').innerHTML,/First.*Some game/);
  assert.equal(f.nodes.get('.tm-status').hidden,true);
  /* the rest of this session goes straight to the list */
  f.close();
  const before=f.calls.filter(call=>call==='bake').length;
  await f.open();
  assert.equal(f.calls.filter(call=>call==='bake').length,before);
  assert.equal(f.builds,0);
  f.close();
 }
});

test('a hall that is not ready after the wait offers the simple list; picking it releases the hall',async()=>{
 const f=fixture({simpleAfter:30});
 const opening=f.open();
 resolveAssets(f);f.page.resolve({ok:true,items:[{torchNo:0,name:'First'}],total:1});
 await opening;
 const go=f.nodes.get('.tm-simple-go');
 assert.equal(go.hidden,undefined);
 await new Promise(resolve=>setTimeout(resolve,60));
 assert.equal(go.hidden,false);
 go.dispatchEvent(new Event('click'));
 assert.equal(f.disposals,1);
 assert.equal(f.host.classes.has('tm-simple'),true);
 assert.match(f.nodes.get('.tm-list').innerHTML,/First/);
 f.ready();
 assert.equal(f.active,false);
 f.close();
 /* a hall that gets ready in time never shows the offer */
 const g=fixture({simpleAfter:30});await prepared(g);
 await new Promise(resolve=>setTimeout(resolve,60));
 assert.notEqual(g.nodes.get('.tm-simple-go').hidden,false);
 g.close();
});
