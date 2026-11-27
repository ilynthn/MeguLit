// SPDX-License-Identifier: GPL-3.0-or-later
// Usage: node validation/torch-ground-render.cjs after high
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {startService,startWeb,startEdge,png}=require('./library-views-perf.cjs');
const {renderTemp}=require('./helpers/render-temp.cjs');
const phase=process.argv[2]||'after',tier=process.argv[3]||'high',out=path.join(os.tmpdir(),'megu-ground-evidence',phase+'-'+tier);
/* the screenshots stay in one fixed folder per phase and tier (overwritten each run) for the before/after comparison;
   the service root and browser profile are removed when the run ends */
fs.mkdirSync(out,{recursive:true});const temp=renderTemp('megu-ground-test-'),profile=temp.dir;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const service=startService(profile);let cdp,web;
 try{
  const cover='data:image/png;base64,'+png(48,64,[164,88,78],[45,79,136]).toString('base64');
  web=await startWeb({call:r=>r.action==='torch_page'?{ok:true,total:1,items:[{torchNo:1,game:'Fixture',gameVndb:'v42'}]}:r.action==='seed_cover'?cover:r.action.startsWith('torch_')?{ok:true,items:[]}:service.call(r)});
  cdp=await startEdge(path.join(profile,'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__TORCH_HOUR=0;localStorage.setItem('megulit-torch-quality','${tier}');window.glErrors=[];const err=console.error;console.error=(...a)=>{if(/WebGLProgram|Shader Error/.test(a.join(' ')))glErrors.push(a.join(' '));err(...a);};`});
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+web.address().port+'/'});
  const ev=x=>cdp.evaluate(x);
  async function wait(x){for(let i=0;i<240;i++){const v=await ev(x);if(v)return v;await delay(125);}throw Error(x+' '+JSON.stringify(await ev('glErrors')));}
  await wait('!!document.querySelector("[data-route=torch]")');await ev('document.querySelector("[data-route=torch]").click()');
  await wait('!!document.querySelector(".torch-monument")?.__torch');
  await ev(`window.hall=document.querySelector('.torch-monument').__torch;window.d=hall.debug;window.canvas=d.renderer.domElement;
   document.querySelector('#reader-notice')?.remove();document.querySelectorAll('dialog[open]').forEach(e=>e.close());`);
  await wait('!canvas.inert&&d.courtyard.sky.position.distanceTo(d.camera.position)<.01&&d.covers.group.children.length===1');
  await delay(1700);
  await ev(`window.pose=null;const cam=d.camera,look=cam.lookAt.bind(cam),target=cam.position.clone();
  cam.lookAt=p=>{if(!pose)return look(p);cam.position.fromArray(pose[0]);return look(target.fromArray(pose[1]));};`);
  let facts;
  if(phase==='after'){
   facts=await ev(`(async()=>{
    const T=await import('/vendor/three/three.module.min.js');
    const ground=await import('/torch-ground.js');
    const p=d.covers.group.children[0].position.clone().project(d.camera);
    const rose=d.scene.getObjectsByProperty('name','Side rose glass');
    const gaskets=d.scene.getObjectsByProperty('name','Side rose gasket');
    const noLeak=rose.length===2&&rose.every(pane=>{
     const point=pane.position.clone(),radius=2.7;
     for(const viewerZ of [-5,13]){
      const from=new T.Vector3(0,4,viewerZ);
      for(let i=0;i<40;i++){
       const a=i*Math.PI/20;
       const goal=point.clone().add(new T.Vector3(0,Math.sin(a)*radius,Math.cos(a)*radius));
       const ray=new T.Raycaster(from,goal.clone().sub(from).normalize());
       if(!ray.intersectObjects([pane,...gaskets]).length)return false;
      }
     }
     return true;
    });
    const friezes=d.scene.getObjectsByProperty('name','Plinth carved frieze');
    const front=friezes.find(mesh=>mesh.position.z>0);
    const continuous=friezes.length===2&&[-.32,-.16,0,.16,.32].every(x=>{
     const ray=new T.Raycaster(new T.Vector3(x,front.position.y,1.3),new T.Vector3(0,0,-1));
     return ray.intersectObject(front.parent)[0]?.object===front;
    });
    return {baked:d.ao.baked,noLeak,rose:rose.length,
     cover:[p.x,p.y],opacity:d.covers.group.children[0].material.opacity,
     terrain:[ground.torchGroundHeight(0,40),ground.torchGroundHeight(0,50),ground.torchGroundHeight(0,72),ground.torchGroundHeight(0,140),ground.torchGroundHeight(70,72)],
     singleCap:!d.scene.getObjectByName('West exterior stone'),
     continuous};
   })()`);
   assert.ok(facts.baked&&facts.noLeak&&facts.singleCap&&facts.continuous,JSON.stringify(facts));
   assert.ok(await ev(`document.querySelector('.tm-help').textContent.startsWith('WASD')&&canvas.getAttribute('aria-label').includes('WASD')`));
   assert.ok(Math.abs(facts.cover[0])<.7&&facts.cover[1]>.15&&facts.cover[1]<.75&&facts.opacity===.65,JSON.stringify(facts));
   assert.deepEqual(facts.terrain,[0,0,0,-4,-4]);
  }
  async function cap(name,pose){await ev('window.pose='+JSON.stringify(pose));await delay(105);const r=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
  for(let i=0;i<15;i++)await cap('night-track-'+String(i).padStart(2,'0'),[[94+i*.65,2.4,133+i*.81],[8,10,11]]);
  await cap('night-front',null);await cap('night-plinth',[[.8,1.55,2.6],[0,1.23,.44]]);
  await cap('night-slope',[[29,2.4,59],[0,3,32]]);
  if(phase==='after'){
   for(const sx of [-1,1]){
    await cap('night-rose-'+sx,[[0,4,14],[sx*10.85,14,4]]);
    await cap('night-rose-shift-'+sx,[[1,5,10],[sx*10.85,14,4]]);
    await cap('night-rose-outside-'+sx,[[sx*36,9,10],[sx*10.85,14,4]]);
   }
  }
  await ev('window.__TORCH_HOUR=12');await delay(1500);
  await cap('day-track',[[102,2.4,143],[8,10,11]]);
  await cap('day-slope',[[29,2.4,59],[0,3,32]]);
  await cap('day-front',null);await cap('day-plinth',[[.8,1.55,2.6],[0,1.23,.44]]);
  if(phase==='after'){
   for(const sx of [-1,1]){
    await cap('day-rose-'+sx,[[0,4,14],[sx*10.85,14,4]]);
    await cap('day-rose-outside-'+sx,[[sx*36,9,10],[sx*10.85,14,4]]);
   }
   await ev('pose=null;hall.resetView()');
   await wait('d.camera.position.z===20.5');
   const mouse=(type,x,y,button,buttons)=>cdp.send('Input.dispatchMouseEvent',{type,x,y,button,buttons,clickCount:1});
   async function drag(button,mask,from,to){
    await mouse('mousePressed',...from,button,mask);
    await mouse('mouseMoved',...to,button,mask);
    await mouse('mouseReleased',...to,button,0);
   }
   await drag('left',1,[500,480],[590,480]);await wait('Math.abs(d.camera.position.x)>1');
   await ev('hall.resetView()');await wait('Math.abs(d.camera.position.x)<.01');
   await drag('middle',4,[500,480],[795,480]);await wait('Math.abs(d.camera.getWorldDirection(d.camera.position.clone()).x)>.1');
   await ev('hall.resetView()');await wait('Math.abs(d.camera.getWorldDirection(d.camera.position.clone()).x)<.01');
   const key=(type,c)=>cdp.send('Input.dispatchKeyEvent',{type,code:'Key'+c.toUpperCase(),key:c,text:type==='keyDown'?c:undefined});
   await key('keyDown','w');await key('keyDown','d');
   await wait('d.camera.position.x>.4&&d.camera.position.z<20.1');
   await key('keyUp','w');await key('keyUp','d');
   const released=await ev('d.camera.position.toArray()');
   await delay(180);assert.deepEqual(await ev('d.camera.position.toArray()'),released);
   await key('keyDown','s');await delay(210);
   await ev("dispatchEvent(new Event('blur'));dispatchEvent(new Event('focus'))");
   const blurred=await ev('d.camera.position.toArray()');
   await delay(210);assert.deepEqual(await ev('d.camera.position.toArray()'),blurred);
   await key('keyUp','s');
   await ev("const input=document.createElement('input');input.id='wasd-fixture';document.querySelector('.torch-monument').append(input);input.focus()");
   await key('keyDown','a');await key('keyUp','a');
   assert.equal(await ev("document.querySelector('#wasd-fixture').value"),'a');
   assert.deepEqual(await ev('d.camera.position.toArray()'),blurred);
   await ev("document.querySelector('#wasd-fixture').remove();hall.resetView()");
   await wait('d.camera.position.z===20.5');
   const w=await ev('canvas.clientWidth'),h=await ev('canvas.clientHeight');
   await drag('right',2,[100,480],[Math.round(100+Math.PI*w/4),Math.round(480-.075*h/3)]);
   await wait('d.camera.getWorldDirection(d.camera.position.clone()).z>.98');
   const wheel=n=>ev(`for(let i=0;i<${n};i++)canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,bubbles:true,cancelable:true}));true`);
   /* out of the door and on across the meadow: over level grass the camera stays near eye height (the old slope took it below 3 m) */
   await wheel(9);
   const walked=await wait('d.camera.position.z>58&&d.camera.position.toArray()');
   assert.ok(walked[1]>5&&walked[1]<6,JSON.stringify(walked));
   facts.walked=walked;
   await ev(`canvas.dispatchEvent(new MouseEvent('dblclick',{button:0,bubbles:true}));true`);
   await wait('d.camera.position.z===20.5&&d.camera.position.y===5.45');
  }
  assert.deepEqual(await ev('glErrors'),[]);console.log(JSON.stringify({out,tier,baked:await ev('d.ao.baked'),facts}));
 }finally{await cdp?.stop();web?.close();await service.stop();temp.remove();}
})().catch(e=>{console.error(e,out);process.exitCode=1});
