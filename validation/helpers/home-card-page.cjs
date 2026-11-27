'use strict';
/* The real home page on a temp data root in headless Edge, with a few fake games whose covers are flat colours, plus real-input helpers
   (CDP mouse events) and pixel sampling of screenshots. Used by the home cover card tests. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startService,startWeb,startEdge,png}=require('../library-views-perf.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* covers: [[topRGB,bottomRGB],...]; returns null when Edge is missing */
async function openHome(t,{covers}){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megu-card-'));const root=path.join(temp,'root');fs.mkdirSync(root);
 const service=startService(root);let web,edge;
 t.after(async()=>{await edge?.stop();web?.close();await service.stop();await sleep(300);try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:300});}catch{}});
 for(let i=0;i<covers.length;i++){const dir=path.join(temp,'games','g'+i);fs.mkdirSync(dir,{recursive:true});const exe=path.join(dir,'game.exe');fs.writeFileSync(exe,'MZ');
  await service.call({action:'save_game',title:'テストゲーム '+(i+1),executable:exe});}
 const home=await service.call({action:'home'});
 for(const [i,g] of (home.games||[]).entries()){const file=path.join(temp,'c'+i+'.png');fs.writeFileSync(file,png(240,320,...covers[i%covers.length]));
  await service.call({action:'game_cover',id:g.id,path:file});}
 web=await startWeb(service);
 try{edge=await startEdge(path.join(temp,'edge'));}catch(error){if(error.message==='EDGE_NOT_FOUND'){t.skip('Edge unavailable');return null;}throw error;}
 const {send,evaluate}=edge;
 /* a CI Windows session can have animations switched off, which the browser reports as reduced motion: the tests pin the normal motion unless one asks for reduced */
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await send('Page.navigate',{url:`http://127.0.0.1:${web.address().port}/#%7B%7D`});
 const deadline=Date.now()+60000;
 while(!await evaluate(`!!document.querySelector('.tv-cover .tv-face')&&document.querySelectorAll('.tv-chip').length>=${Math.min(covers.length,10)}`).catch(()=>false)){
  if(Date.now()>deadline)throw Error('home page with its cover card did not load');await sleep(200);}
 await sleep(2500);
 await evaluate(`(()=>{document.querySelectorAll('dialog').forEach(d=>{try{d.close();}catch{}d.remove();});const st=document.createElement('style');
  st.textContent='.toast,.toast-stack,[class*=toast],#reader-notice{display:none!important}';document.head.append(st);return 1;})()`);
 const mouse=(type,x,y,buttons=0,clickCount=1)=>send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'&&!buttons?'none':'left',buttons,clickCount,pointerType:'mouse'});
 const page={send,evaluate,mouse,sleep,
  /* pointer path in small steps, like a hand */
  async glide(x0,y0,x1,y1,{steps=12,ms=16,buttons=0}={}){for(let k=1;k<=steps;k++){await mouse('mouseMoved',x0+(x1-x0)*k/steps,y0+(y1-y0)*k/steps,buttons);if(ms)await sleep(ms);}},
  /* the events go out back to back and are awaited together: a loaded CI machine must not stretch the gap between the two clicks of a double-click past the 260 ms single-click delay */
  async click(x,y,count=1){await Promise.all([mouse('mouseMoved',x,y),mouse('mousePressed',x,y,1,count),mouse('mouseReleased',x,y,0,count)]);},
  /* the strip can reflow when a new title lands, so a chip is measured right before it is pressed */
  async chip(i){const p=(await page.chips())[i];await page.click(p.x,p.y);},
  async dblclick(x,y){await Promise.all([page.click(x,y,1),page.click(x,y,2)]);},
  cover:()=>evaluate(`(()=>{const r=document.querySelector('.tv-cover').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2};})()`),
  chips:()=>evaluate(`[...document.querySelectorAll('.tv-chip')].map(b=>{const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})`),
  state:()=>evaluate(`(()=>{const c=document.querySelector('.tv-cover');if(!c)return {home:!!document.querySelector('.tv-home')};const face=c.querySelector('.tv-face'),flip=c.querySelector('.tv-flip'),art=c.querySelector('.tv-art'),pop=document.querySelector('.tv-pop');
   const fr=face.getBoundingClientRect(),pr=pop?pop.getBoundingClientRect():null,ps=pop?getComputedStyle(pop):null,shown=!!pop&&+ps.opacity>.02;
   const ix=pr?Math.max(0,Math.min(fr.right,pr.right)-Math.max(fr.left,pr.left)):0,iy=pr?Math.max(0,Math.min(fr.bottom,pr.bottom)-Math.max(fr.top,pr.top)):0;
   return {home:!!document.querySelector('.tv-home'),title:document.querySelector('.tv-h1')?.textContent||'',art:art.style.background,inline:face.style.transform,
    faceCss:getComputedStyle(face).transform,flipCss:getComputedStyle(flip).transform,faceOpacity:+getComputedStyle(face).opacity,
    running:[flip,face,art].reduce((n,e)=>n+e.getAnimations().filter(a=>a.playState==='running').length,0),busy:!!c.dataset.busy,
    dissolve:c.querySelectorAll('.tv-dissolve').length,old:document.querySelectorAll('.tv-cover .tv-old').length,ghosts:document.querySelectorAll('.tv-ghost').length,
    popShown:shown,popOverlap:Math.round(ix*iy),onChip:[...document.querySelectorAll('.tv-chip')].findIndex(b=>b.classList.contains('on'))};})()`),
  /* screenshot of a viewport rect, decoded in the page; fn receives (data,w,h) as source text and runs there */
  async pixels(clip,fn){const r=await send('Page.captureScreenshot',{format:'png',clip:{...clip,scale:1}});
   return evaluate(`(async()=>{const i=new Image();i.src='data:image/png;base64,${r.data}';await i.decode();const c=new OffscreenCanvas(i.naturalWidth,i.naturalHeight),x=c.getContext('2d');
    x.drawImage(i,0,0);const d=x.getImageData(0,0,c.width,c.height).data;return (${fn})(d,c.width,c.height);})()`);},
  async shot(dir,name,clip){if(!dir)return;fs.mkdirSync(dir,{recursive:true});const r=await send('Page.captureScreenshot',{format:'png',...(clip?{clip:{...clip,scale:1}}:{})});
   fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(r.data,'base64'));}};
 return page;}

/* mean colour of the card's middle (a box well inside the face) */
const MEAN=`(d,w,h)=>{let r=0,g=0,b=0,n=0;for(let y=Math.floor(h*.3);y<h*.7;y+=2)for(let x=Math.floor(w*.3);x<w*.7;x+=2){const i=(y*w+x)*4;r+=d[i];g+=d[i+1];b+=d[i+2];n++;}return [r/n,g/n,b/n];}`;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

module.exports={openHome,MEAN,dist,sleep};
