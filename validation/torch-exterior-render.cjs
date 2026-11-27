/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
// Usage: node validation/torch-exterior-render.cjs [--low] [--keep]
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {startService,startWeb,startEdge,png}=require('./library-views-perf.cjs');
const {renderTemp}=require('./helpers/render-temp.cjs');
const tier=process.argv.includes('--low')?'low':'high';
/* removed when the run ends, whatever the outcome; --keep leaves it for the screenshots */
const temp=renderTemp('megulit-torch-exterior-'),out=temp.dir;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function main(){
 const service=startService(out);
 let web,cdp;
 try{
  const cover='data:image/png;base64,'+png(48,64,[164,88,78],[45,79,136]).toString('base64');
  web=await startWeb({call:request=>{
   if(request.action==='torch_page')return {ok:true,total:1,items:[{torchNo:1,game:'Public work fixture',gameVndb:'v42'}]};
   if(request.action==='seed_cover')return cover;
   if(request.action.startsWith('torch_'))return {ok:true,items:[],available:false};
   return service.call(request);
  }});
  cdp=await startEdge(path.join(out,'edge'));
  const send=(method,params)=>cdp.send(method,params);
  const evaluate=expression=>cdp.evaluate(expression);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
   window.__TORCH_HOUR=12;localStorage.setItem('megulit-torch-quality','${tier}');
   window.glErrors=[];const error=console.error;console.error=(...args)=>{
    if(/WebGLProgram|Shader Error|THREE.WebGLRenderer/.test(args.map(String).join(' ')))glErrors.push(args.map(String).join(' '));
    error(...args);
   };
  `});
  await send('Page.navigate',{url:'http://127.0.0.1:'+web.address().port+'/'});
  async function wait(expression){
   /* a deadline, not a count: with software WebGL on a busy runner one evaluate takes seconds, 200 tries were 24 s of pauses plus whatever they cost */
   const deadline=Date.now()+(process.env.CI?180000:30000);
   for(;;){const value=await evaluate(expression);if(value)return value;if(Date.now()>deadline)break;await pause(120);}
   throw Error(expression+' '+JSON.stringify(await evaluate('window.glErrors')));
  }
  await wait('!!document.querySelector("[data-route=torch]")');
  await evaluate('document.querySelector("[data-route=torch]").click()');
  await wait('!!document.querySelector(".torch-monument")?.__torch');
  await evaluate(`
   window.hall=document.querySelector('.torch-monument').__torch;window.d=hall.debug;window.canvas=d.renderer.domElement;
   window.heading=()=>d.camera.getWorldDirection(d.camera.position.clone()).toArray();
   document.querySelector('#reader-notice')?.remove();
   document.querySelectorAll('dialog[open]').forEach(el=>el.close());
  `);
  await wait('!canvas.inert&&d.courtyard.sky.position.distanceTo(d.camera.position)<.01&&d.covers.group.children.length===1');
  await pause(1550);
  const mouse=(type,x,button,buttons)=>send('Input.dispatchMouseEvent',{type,x,y:460,button,buttons,clickCount:1});
  async function drag(button,mask,x,end){
   await mouse('mousePressed',x,button,mask);
   await mouse('mouseMoved',end,button,mask);
   await mouse('mouseReleased',end,button,0);
  }
  await drag('right',2,380,890);
  await wait('heading()[0]>.8');
  await evaluate('hall.resetView()');
  await wait('heading()[2]<-.95');
  await drag('middle',4,380,780);
  await wait('Math.abs(heading()[0])>.1&&Math.abs(heading()[0])<.35');
  await evaluate('hall.resetView()');
  await wait('heading()[2]<-.95');

  const facts=await evaluate(`(()=>{
   const object=name=>d.scene.getObjectByName(name);
   const wall=object('West facade');wall.geometry.computeBoundingBox();
   const frieze=object('Plinth carved frieze').material;
   const glass=d.covers.group.children[0].material;
   const meadow=object('Meadow grass');
   return {tier:hall.tier,baked:d.ao.baked,roof:wall.geometry.boundingBox.max.y,grass:meadow.count,
    opacity:glass.opacity,seeThrough:glass.transparent&&!glass.depthWrite,
    friezeCount:d.scene.getObjectsByProperty('name','Plinth carved frieze').length,
    relief:[frieze.map.image.width,frieze.map.image.height,frieze.normalMap.image.width,frieze.normalMap.image.height],
    aniso:frieze.normalMap.anisotropy};
  })()`);
  assert.equal(facts.tier,tier);
  assert.equal(facts.baked,true);
  assert.ok(facts.roof<24);
  assert.ok(facts.grass>0&&facts.grass<=(tier==='low'?9000:19000));
  assert.equal(facts.opacity,.65);
  assert.ok(facts.seeThrough&&facts.friezeCount===2);
  const relief=tier==='low'?[2048,256]:[4096,512];
  assert.deepEqual(facts.relief,[...relief,...relief]);
  assert.equal(facts.aniso,tier==='low'?4:16);

  await evaluate(`
   window.pose=null;const camera=d.camera;
   const look=camera.lookAt.bind(camera),target=camera.position.clone();
   camera.lookAt=point=>{
    if(!window.pose)return look(point);
    camera.position.fromArray(window.pose[0]);look(target.fromArray(window.pose[1]));
   };
   window.moonPose=()=>{
    const body=d.courtyard.sky.material.uniforms.body.value,up=camera.up;
    const dome=d.scene.getObjectByName('Dome exterior').position.clone();dome.y+=6;
    let best=null,bestScore=-Infinity;
    for(const offset of [.72,-.72,.95,-.95,1.16,-1.16]){
     const from=dome.clone(),radial=body.clone();radial.y=0;radial.normalize().applyAxisAngle(up,offset);
     const range=Math.max(22,(dome.y-2.5)/Math.tan(Math.asin(body.y)-.27));
     from.addScaledVector(radial,-range);from.y=2.5;
     if(Math.abs(from.x)<17&&from.z>-9&&from.z<43)continue;
     const aim=dome.clone().sub(from).normalize().add(body).normalize();
     const target=from.clone().add(aim),trial=camera.clone();
     trial.position.copy(from);trial.lookAt(target);trial.updateMatrixWorld(true);
     const m=from.clone().addScaledVector(body,260).project(trial),b=dome.clone().project(trial);
     const score=(b.x-m.x)+(m.y-b.y)-Math.max(Math.abs(m.x),Math.abs(m.y),Math.abs(b.x),Math.abs(b.y));
     if(score>bestScore){bestScore=score;best={pose:[from.toArray(),target.toArray()],moon:m.toArray(),dome:b.toArray()};}
    }
    if(!best)throw Error('No exterior moon and dome camera');
    window.moonFraming=best;
    return best.pose;
   };
   window.coverPose=()=>{
    const p=d.covers.group.children[0].position;
    return [[p.x+1.7,p.y+1,p.z+8],[p.x,p.y,p.z]];
   };
  `);
  async function capture(name,pose){
   await evaluate('window.pose='+pose);
   await pause(240);
   const photo=await send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(photo.data,'base64'));
  }
  const width=await evaluate('canvas.clientWidth');
  const turn=()=>drag('right',2,70,Math.round(70+Math.PI*width/4));
  await turn();await wait('heading()[2]>.97');
  await evaluate(`for(let i=0;i<100;i++)canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,bubbles:true,cancelable:true}));true`);
  await wait('d.camera.position.z>420');
  await turn();await wait('heading()[2]<-.97');
  await capture('day-after-400m','null');
  await evaluate('window.__TORCH_HOUR=0');
  await wait('d.courtyard.sky.material.uniforms.night.value>.98');
  await pause(1400);
  await capture('night-after-400m','null');
  const far=await evaluate(`({
   z:d.camera.position.z,fog:d.scene.fog.density,
   sky:d.courtyard.sky.position.distanceTo(d.camera.position),
   light:d.sun.position.clone().sub(d.sun.target.position).normalize().distanceTo(d.courtyard.sky.material.uniforms.body.value)
  })`);
  assert.ok(far.z>420&&far.fog<.002&&far.sky<1e-6&&far.light<1e-6,JSON.stringify(far));
  await evaluate('hall.resetView()');
  await wait('Math.abs(d.camera.position.z-20.5)<.02');
  for(const [period,hour] of [['day',12],['night',0]]){
   await evaluate('window.__TORCH_HOUR='+hour);
   await wait('d.courtyard.sky.material.uniforms.night.value'+(hour?'<.02':'>.98'));
   await pause(1450);
   await capture(period+'-northeast',JSON.stringify([[-53,15,-37],[0,15,13]]));
   await capture(period+'-southwest',JSON.stringify([[48,18,67],[0,13,17]]));
   await capture(period+'-portal',JSON.stringify([[0,5.5,72],[0,6,39]]));
   await capture(period+'-meadow',JSON.stringify([[25,2,11],[17,1.8,19]]));
   await capture(period+'-plinth-oblique',JSON.stringify([[6.4,1.57,3.3],[4.2,1.25,.44]]));
   await capture(period+'-plinth',JSON.stringify([[.68,1.58,2.22],[0,1.23,.44]]));
   await capture(period+'-default','null');
   await capture(period+'-cover','coverPose()');
   assert.ok(await evaluate(`d.sun.position.clone().sub(d.sun.target.position).normalize()
    .distanceTo(d.courtyard.sky.material.uniforms.body.value)<1e-6`));
   if(!hour){
    await capture('night-moon-and-dome','moonPose()');
    const framing=await evaluate('moonFraming');
    assert.ok(framing.moon[0]<framing.dome[0]&&framing.moon[1]>framing.dome[1],JSON.stringify(framing));
    await capture('night-moon-and-dome-shift','(()=>{const p=moonPose();p[0][0]+=3;p[1][0]+=3;return p;})()');
   }
  }
  assert.deepEqual(await evaluate('window.glErrors'),[]);
  console.log(JSON.stringify({out,facts,far}));
 }finally{await cdp?.stop();web?.close();await service.stop();temp.remove();}
}
main().catch(error=>{console.error(error);if(temp.keep)console.error(out);process.exitCode=1;});
