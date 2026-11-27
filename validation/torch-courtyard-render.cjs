/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {startService,startWeb,startEdge,png}=require('./library-views-perf.cjs');
const {renderTemp}=require('./helpers/render-temp.cjs');
// Usage: node validation/torch-courtyard-render.cjs [--high] [--keep]
/* removed when the run ends, whatever the outcome; --keep leaves it for the screenshots */
const temp=renderTemp('megulit-courtyard-'),out=temp.dir;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const tier=process.argv.includes('--high')?'high':'low';
const seedCover='data:image/png;base64,'+png(32,48,[145,36,116],[24,52,84]).toString('base64');
(async()=>{
 const service=startService(out);
 let web,cdp;
 try{
  const calls=[];
  web=await startWeb({call:r=>{
   if(r.action==='torch_page')return {ok:true,items:[
    {torchNo:1,game:'Public work',gameVndb:'v42'},{torchNo:2,game:'Same work',gameVndb:'v42'},
    {torchNo:3,game:'Missing cover',gameVndb:'v77'},{torchNo:4,game:null,gameVndb:'v99'},
    {torchNo:5,game:'Unknown ID'}],total:5};
   if(r.action==='seed_cover'){assert.equal(r.nsfw,false);assert.equal(r.resolveMissing,true);calls.push(r.vndb);return r.vndb==='v42'?seedCover:null;}
   if(r.action.startsWith('torch_'))return {ok:true,items:[],available:false};
   return service.call(r);
  }});
  cdp=await startEdge(path.join(out,'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1100,height:680,deviceScaleFactor:1,mobile:false});
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`
   window.__TORCH_HOUR=12;localStorage.setItem('megulit-torch-quality','${tier}');
   window.errors=[];window.addEventListener('error',e=>errors.push(e.message));
   const error=console.error;console.error=(...args)=>{errors.push(args.map(String).join(' '));error(...args)};
  `});
  await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+web.address().port+'/'});
  const evaluate=s=>cdp.evaluate(s);
  async function wait(expr){
   for(let i=0;i<200;i++){const r=await evaluate(expr);if(r)return r;await delay(150);}
   throw Error(expr+' '+JSON.stringify(await evaluate('({errors:window.errors,focus:document.hasFocus(),hidden:document.hidden,inert:window.canvas?.inert,sky:window.d?.courtyard.sky.position,cam:window.d?.camera.position})')));
  }
  await wait('!!document.querySelector("[data-route=torch]")');
  await evaluate('document.querySelector("[data-route=torch]").click()');
  await wait('!!document.querySelector(".torch-monument")?.__torch');
  await evaluate(`window.hall=document.querySelector('.torch-monument').__torch;window.d=hall.debug;
   window.canvas=d.renderer.domElement;window.thumbCount=()=>d.covers.group.children.length;
   window.direction=()=>d.camera.getWorldDirection(d.camera.position.clone()).toArray();
   window.pos=()=>d.camera.position.toArray();
   document.querySelectorAll('dialog[open]').forEach(el=>el.close());
   document.querySelector('#reader-notice')?.remove();`);
  await wait('!canvas.inert&&d.courtyard.sky.position.z===d.camera.position.z');
  await evaluate('hall.resetView()');
  await wait('Math.abs(pos()[2]-20.5)<.02');
  await wait('thumbCount()===1');
  assert.deepEqual(calls.slice().sort(),['v42','v77']);
  const coords=await evaluate('d.covers.group.children[0].position.toArray()');
  assert.ok(Math.abs(coords[0])>=4.8&&coords[1]>8&&coords[2]<-6.5);
  assert.deepEqual(coords,await evaluate('d.covers.update(500),d.covers.group.children[0].position.toArray()'));
  const geometry=await evaluate(`(async()=>{
   const T=await import('/vendor/three/three.module.min.js');
   const facade=d.scene.getObjectByName('West facade');
   const doors=['West door left','West door right'].map(n=>d.scene.getObjectByName(n));
   const ray=(x,y,z,dir)=>new T.Raycaster(new T.Vector3(x,y,z),new T.Vector3(0,0,dir),0,4);
   return {
    clear:ray(0,2.3,38,1).intersectObjects([facade,...doors]).length===0,
    reverseClear:ray(0,2.3,42,-1).intersectObjects([facade,...doors]).length===0,
    masonry:ray(4,2.3,42,-1).intersectObject(facade).length>0,
    lintel:ray(0,6.8,42,-1).intersectObject(facade).length>0,
    eastOpen:new T.Raycaster(new T.Vector3(8,2,-5),new T.Vector3(0,0,-1),0,35)
     .intersectObject(facade.parent).length===0,
    continuousFrieze:d.scene.getObjectsByProperty('name','Plinth carved frieze').length===2,
    noChair:!d.scene.getObjectByName('Courtyard chair')&&!d.scene.getObjectByName('Reflected courtyard chair')
   };
  })()`);
  assert.ok(Object.values(geometry).every(Boolean),JSON.stringify(geometry));
  async function capture(name,points=[]){
   await evaluate('document.querySelectorAll("dialog[open]").forEach(el=>el.close())');
   const image=await cdp.send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(image.data,'base64'));
   if(!points.length)return;
   return evaluate(`(async()=>{
    const img=new Image();img.src='data:image/png;base64,${image.data}';await img.decode();
    const buf=document.createElement('canvas');buf.width=img.width;buf.height=img.height;
    const ctx=buf.getContext('2d');ctx.drawImage(img,0,0);
    return ${JSON.stringify(points)}.map(([x,y])=>[...ctx.getImageData(Math.round(img.width*x),Math.round(img.height*y),1,1).data]);
   })()`);
  }
  const [eastDay]=await capture('east-day',[[.49,.31]]);
  await evaluate('window.__TORCH_HOUR=0');
  await wait('d.courtyard.sky.material.uniforms.night.value>.97');
  await delay(1300);
  const [eastNight]=await capture('east-night',[[.49,.31]]);
  assert.ok(eastDay[2]>eastDay[0]+12,JSON.stringify(eastDay));
  assert.ok(eastNight[2]>eastNight[0]+12&&eastNight[0]<eastDay[0]-35,JSON.stringify({eastDay,eastNight}));
  assert.ok(await evaluate(`d.sun.position.clone().sub(d.sun.target.position).normalize()
   .distanceTo(d.courtyard.sky.material.uniforms.body.value)<1e-6`));
  await evaluate('window.__TORCH_HOUR=12');
  await wait('d.courtyard.sky.material.uniforms.night.value<.01');
  assert.ok(await evaluate(`d.sun.position.clone().sub(d.sun.target.position).normalize()
   .distanceTo(d.courtyard.sky.material.uniforms.body.value)<1e-6`));
  const mouse=(type,x,y,button,buttons)=>cdp.send('Input.dispatchMouseEvent',{type,x,y,button,buttons,clickCount:1});
  async function drag(button,mask,x,y,toX,toY){
   await mouse('mousePressed',x,y,button,mask);
   await mouse('mouseMoved',toX,toY,button,mask);
   await mouse('mouseReleased',toX,toY,button,0);
  }
  await drag('right',2,80,310,340,310);
  await wait('direction()[0]>.5');
  await evaluate('hall.resetView()');
  await wait('direction()[2]<-.9');
  const w=await evaluate('canvas.clientWidth'),h=await evaluate('canvas.clientHeight');
  await drag('right',2,80,310,Math.round(80+Math.PI*w/4),Math.round(310-.075*h/3));
  await wait('direction()[2]>.98');
  await capture('portal-day');
  const wheel=(count,delta)=>evaluate(`for(let i=0;i<${count};i++)canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:${delta},bubbles:true,cancelable:true}));true`);
  function assertPortalCrossing(a,b){
   const t=(40-a[2])/(b[2]-a[2]);
   assert.ok(t>0&&t<1,JSON.stringify({a,b}));
   const x=a[0]+t*(b[0]-a[0]),y=a[1]+t*(b[1]-a[1]);
   assert.ok(Math.abs(x)<1.3&&y>=1.2&&y<4.25+Math.sqrt(2.15**2-x*x),JSON.stringify({x,y}));
  }
  const beforeExit=await evaluate('pos()');
  await wheel(9,-120);
  const afterExit=await wait('pos()[2]>57&&pos()');
  assertPortalCrossing(beforeExit,afterExit);
  await capture('courtyard-day');
  await evaluate('window.__TORCH_HOUR=0');
  await wait('d.courtyard.sky.material.uniforms.night.value>.97');
  await capture('courtyard-night');
  await wheel(110,-120);
  await wait('pos()[2]>500');
  assert.ok(await evaluate('d.courtyard.sky.position.distanceTo(d.camera.position)<1e-6'));
  await drag('right',2,70,320,Math.round(70+Math.PI*w/4),320);
  await wait('direction()[2]<-.95');
  await wheel(112,-120);
  await wait('pos()[2]<65');
  await capture('look-back-night');
  const outsideY=await evaluate('pos()[1]');
  const panY=Math.round((2.7-outsideY)*h/14);
  await drag('left',1,470,500,470,500+panY);
  const beforeEntry=await wait('Math.abs(pos()[1]-2.7)<.1&&pos()');
  await wheel(5,-120);
  const afterEntry=await wait('pos()[2]<38&&pos()');
  assertPortalCrossing(beforeEntry,afterEntry);
  /* the sky checks look at the moon and its reflection from over the water beyond the meadow */
  await evaluate(`hall.setActive(false);
   const cam=d.camera;
   cam.position.set(0,2.3,170);
   d.courtyard.sky.position.copy(cam.position);
   const point=d.courtyard.sky.material.uniforms.body.value.clone();
   cam.lookAt(point.clone().add(cam.position));d.renderer.render(d.scene,cam);
   true`);
  const [moon,sky]=await capture('moon-night',[[.5,.54],[.42,.54]]);
  assert.ok(moon[2]>sky[2]+35,JSON.stringify({moon,sky}));
  await evaluate(`(()=>{const point=d.courtyard.sky.material.uniforms.body.value.clone();
   point.y=-point.y;d.camera.lookAt(point.add(d.camera.position));d.renderer.render(d.scene,d.camera);return true;})()`);
  const [reflection,ground]=await capture('moon-reflection-night',[[.5,.54],[.42,.54]]);
  assert.ok(reflection[2]>ground[2]+25,JSON.stringify({reflection,ground}));
  await evaluate('hall.setActive(true);true');
  await evaluate('hall.resetView()');
  await wait('Math.abs(pos()[2]-20.5)<.02');
  await drag('middle',4,320,360,420,360);
  await wait('Math.abs(direction()[0])>.04');
  const prior=await evaluate('pos()[0]');
  await drag('left',1,380,360,485,565);
  await wait(`Math.abs(pos()[0]-(${prior}))>1`);
  await drag('right',2,350,260,350,580);
  await wheel(10,-120);
  await wait(`(async()=>{const {torchGroundHeight}=await import('/torch-ground.js');const [x,y,z]=pos();return Math.abs(y-torchGroundHeight(x,z)-1.2)<1e-7;})()`);
  await evaluate(`canvas.dispatchEvent(new MouseEvent('dblclick',{button:0,bubbles:true}));true`);
  await wait('pos()[2]===20.5&&pos()[1]===5.45');
  await evaluate('hall.setRead({x:1,y:3});true');
  await wait('hall.reading()&&Math.abs(pos()[2]-5.2)<.02');
  await evaluate('hall.resetView();true');
  await evaluate(`window.freed=0;const m=d.covers.group.children[0];for(const x of [m.geometry,m.material,m.material.map])x.addEventListener('dispose',()=>freed++);
   document.querySelector('[data-route=home]').click();true`);
  await wait('thumbCount()===0&&freed===3');
  await evaluate(`document.querySelector('[data-route=torch]').click();true`);
  await wait('thumbCount()===1');
  assert.equal(calls.filter(id=>id==='v42').length,1);
  assert.equal(calls.includes('v99'),false);
  const errors=await evaluate('window.errors.filter(e=>/WebGLProgram|Shader Error|THREE.WebGLRenderer/.test(e))');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({tier,geometry,eastDay,eastNight,coverCalls:calls,out}));
 }finally{await cdp?.stop();web?.close();await service.stop();temp.remove();}
})().catch(error=>{console.error(error);if(temp.keep)console.error(out);process.exitCode=1;});
