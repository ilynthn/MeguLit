'use strict';
/* 2026-11-27 (user: "按住卡牌往下压的话 这里会有bug") the real home page in headless Edge: pointer on the big cover card, press,
   drag down past the card, let go. The 单击/双击 hint box must never sit on the card while it is pressed or dragged, and after
   letting go both the card and the hint are back where they were. Same for a double-click draw.
   Screenshots: MEGULIT_SHOTS=<dir> node --test validation/home-card-press.test.cjs */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),test=require('node:test');
const {startService,startWeb,startEdge,png}=require('./library-views-perf.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SHOTS=process.env.MEGULIT_SHOTS||'';

/* the drawn card (3D tilt included) and the hint box, both in viewport pixels */
const PROBE=`(()=>{const face=document.querySelector('.tv-cover .tv-face'),pop=document.querySelector('.tv-pop');
 const box=e=>{const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};};
 const f=box(face),p=box(pop),cover=face.closest('.tv-cover'),flip=face.parentElement,cs=getComputedStyle(pop),shown=+cs.opacity>.02&&cs.visibility!=='hidden'&&cs.display!=='none';
 const ix=Math.max(0,Math.min(f.r,p.r)-Math.max(f.l,p.l)),iy=Math.max(0,Math.min(f.b,p.b)-Math.max(f.t,p.t));
 return {face:f,pop:p,flip:getComputedStyle(flip).transform,faceCss:getComputedStyle(face).transform,touch:cover.classList.contains('touch'),shown,opacity:+cs.opacity,overlap:Math.round(ix*iy),transform:face.style.transform};})()`;

test('pressing and dragging the home cover card never lets the hint box sit on the card',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megu-card-press-'));const root=path.join(temp,'root');fs.mkdirSync(root);
 const service=startService(root);let web,edge;
 t.after(async()=>{await edge?.stop();web?.close();await service.stop();await sleep(300);try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});}catch{}});
 for(let i=0;i<3;i++){const dir=path.join(temp,'games','g'+i);fs.mkdirSync(dir,{recursive:true});const exe=path.join(dir,'game.exe');fs.writeFileSync(exe,'MZ');
  await service.call({action:'save_game',title:'テストゲーム '+(i+1),executable:exe});}
 const home=await service.call({action:'home'});
 for(const [i,g] of (home.games||[]).entries()){const file=path.join(temp,'c'+i+'.png');fs.writeFileSync(file,png(240,320,[200,60+i*50,90],[240,230,210]));
  await service.call({action:'game_cover',id:g.id,path:file});}
 web=await startWeb(service);
 try{edge=await startEdge(path.join(temp,'edge'));}catch(error){if(error.message==='EDGE_NOT_FOUND')return t.skip('Edge unavailable');throw error;}
 const {send,evaluate}=edge;
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await send('Page.navigate',{url:`http://127.0.0.1:${web.address().port}/#%7B%7D`});
 const deadline=Date.now()+60000;
 while(!await evaluate(`!!document.querySelector('.tv-cover .tv-face')&&!!document.querySelector('.tv-pop')`).catch(()=>false)){assert.ok(Date.now()<deadline,'home page with its cover card');await sleep(200);}
 await sleep(2500);
 await evaluate(`(()=>{document.querySelectorAll('dialog').forEach(d=>{try{d.close();}catch{}d.remove();});const st=document.createElement('style');
  st.textContent='.toast,.toast-stack,[class*=toast],#reader-notice{display:none!important}';document.head.append(st);return 1;})()`);
 const shot=async name=>{if(!SHOTS)return;fs.mkdirSync(SHOTS,{recursive:true});const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(SHOTS,name+'.png'),Buffer.from(r.data,'base64'));};
 const mouse=(type,x,y,buttons=0,clickCount=1)=>send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'&&!buttons?'none':'left',buttons,clickCount,pointerType:'mouse'});
 /* the page leans with the pointer (parallax), so the resting pose is read with the pointer parked where the test ends */
 await mouse('mouseMoved',20,20);await sleep(1500);const rest=await evaluate(PROBE);
 /* aim at the lower part of the card, near the cover's title band, like the user's screenshot */
 const x=Math.round(rest.face.l+rest.face.w*.5),y0=Math.round(rest.face.t+rest.face.h*.82);
 for(let k=0;k<=8;k++){await mouse('mouseMoved',x-40+k*5,y0-40+k*5);await sleep(30);}
 await sleep(900);
 let hover=await evaluate(PROBE);for(let k=0;k<30&&!hover.shown;k++){await sleep(100);hover=await evaluate(PROBE);}await shot('1-hover');
 assert.ok(hover.shown,'hovering the card shows the 单击/双击 hint');
 assert.equal(hover.overlap,0,'the hovering hint stays clear of the card: '+JSON.stringify(hover));
 /* the bottom edge tilts the card the most towards the viewer */
 {const yb=Math.round(rest.face.t+rest.face.h*.97);await mouse('mouseMoved',x,yb);await sleep(900);const edgeHover=await evaluate(PROBE);
  assert.ok(edgeHover.shown&&edgeHover.overlap===0,'hovering the bottom edge keeps the hint clear of the card: '+JSON.stringify(edgeHover));await mouse('mouseMoved',x,y0);await sleep(300);}
 await mouse('mousePressed',x,y0,1);
 const samples=[];
 for(let k=1;k<=60;k++){await mouse('mouseMoved',x,y0+k*3,1);await sleep(16);if(k%6===0)samples.push({k,...await evaluate(PROBE)});}
 await sleep(900);samples.push({k:'held',...await evaluate(PROBE)});await shot('2-pressed-dragged');
 /* drag back up onto the card while still holding */
 for(let k=60;k>=0;k--){await mouse('mouseMoved',x,y0+k*3,1);await sleep(12);if(k%10===0)samples.push({k:'back'+k,...await evaluate(PROBE)});}
 await sleep(900);samples.push({k:'back-held',...await evaluate(PROBE)});await shot('3-pressed-on-card');
 for(const s of samples)assert.ok(!s.shown||s.overlap===0,`while pressed the hint never sits on the card (sample ${s.k}): `+JSON.stringify(s));
 await mouse('mouseReleased',x,y0,0);
 for(let k=1;k<=10;k++){await mouse('mouseMoved',x,y0+k*2);await sleep(30);}
 await sleep(1200);const after=await evaluate(PROBE);await shot('4-released');
 assert.ok(!after.shown||after.overlap===0,'after letting go the hint is clear of the card: '+JSON.stringify(after));
 /* pointer leaves: the card goes back to its resting pose and size */
 await mouse('mouseMoved',20,20);await sleep(1500);const home2=await evaluate(PROBE);await shot('5-left');
 assert.equal(home2.shown,false,'the hint hides once the pointer leaves the card');
 /* the page itself drifts with the pointer and breathes when idle (parallax), so "back in place" is read from the card's own transforms */
 assert.deepEqual({transform:home2.transform,face:home2.faceCss,flip:home2.flip,touch:home2.touch},{transform:'',face:rest.faceCss,flip:rest.flip,touch:false},'the card is back in its resting pose');
 /* double-click draws another card; the hint never covers the new card either */
 for(let k=0;k<=6;k++){await mouse('mouseMoved',x-30+k*5,y0-30+k*5);await sleep(30);}await sleep(900);
 await mouse('mousePressed',x,y0,1,1);await mouse('mouseReleased',x,y0,0,1);await mouse('mousePressed',x,y0,1,2);await mouse('mouseReleased',x,y0,0,2);
 const draw=[];for(let k=0;k<40;k++){await sleep(50);if(k%2)await mouse('mouseMoved',x,y0+(k%4));draw.push({k,...await evaluate(PROBE)});}
 await shot('6-after-draw');
 for(const s of draw)assert.ok(!s.shown||s.overlap===0,`during the draw the hint never sits on the card (sample ${s.k}): `+JSON.stringify(s));
});
