'use strict';
/* 2026-11-27 home cover card, driven with real mouse input in headless Edge on the real home page:
   - (user: 按住卡牌往下压 打光有分界) pressed, turned or rotated, the light on the card has no hard line: brightness sampled along lines across the card never jumps
   - (user: 快速切换会卡 / 卷帘门 → 溶解) a change that interrupts a running one picks up from what is on screen, quick changes leave nothing behind
   - (user: 倾斜不要锁死) a drag turns the card freely and it springs back; a drag never counts as a click or a double-click; clicks still work
   - (user: 抽卡和换卡的过渡别出 bug) clicks, drags and quick draws in the middle of a draw never leave the card halfway
   Screenshots: MEGULIT_SHOTS=<dir> node --test validation/home-card-motion.test.cjs */
const assert=require('node:assert/strict'),test=require('node:test');
const {openHome,MEAN,dist,sleep}=require('./helpers/home-card-page.cjs');
const SHOTS=process.env.MEGULIT_SHOTS||'';
const RED=[[200,40,50],[190,36,46]],GREEN=[[40,160,70],[36,150,64]],BLUE=[[50,80,200],[46,74,190]],GREY=[[126,126,130],[132,132,136]];

/* the biggest brightness step between neighbouring samples along lines across the card (3x3 averages every 2 px, edges and corners left out) */
const SEAM=`(d,w,h)=>{const L=(x,y)=>{let s=0;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const k=((y+j)*w+(x+i))*4;s+=.299*d[k]+.587*d[k+1]+.114*d[k+2];}return s/9;};
 const card=(x,y)=>L(x,y)>60;let worst={step:0};
 const run=(pts,name)=>{const inside=pts.filter(([x,y])=>x>1&&y>1&&x<w-2&&y<h-2&&card(x,y));if(inside.length<40)return;const body=inside.slice(8,-8);
  for(let i=1;i<body.length;i++){const a=L(...body[i-1]),b=L(...body[i]),s=Math.abs(a-b);if(s>worst.step)worst={step:Math.round(s*10)/10,at:body[i],line:name,from:Math.round(a),to:Math.round(b)};}};
 for(const f of [.3,.42,.5,.58,.7]){const x=Math.round(w*f),pts=[];for(let y=2;y<h-2;y+=2)pts.push([x,y]);run(pts,'x'+f);}
 for(const f of [.25,.45,.65,.8,.9]){const y=Math.round(h*f),pts=[];for(let x=2;x<w-2;x+=2)pts.push([x,y]);run(pts,'y'+f);}
 return worst;}`;

test('pressed, turned or rotated, the light on the card is continuous',async t=>{
 const page=await openHome(t,{covers:[GREY,GREY]});if(!page)return;const {mouse,glide}=page;
 const c=await page.cover(),clip={x:c.l-40,y:c.t-40,width:c.w+80,height:c.h+80},seam=()=>page.pixels(clip,SEAM);
 await mouse('mouseMoved',20,20);await sleep(800);
 const rest=await seam();assert.ok(rest.step<14,'resting card is evenly lit: '+JSON.stringify(rest));
 const poses=[];
 /* the user's case: press near the bottom (the title band) and hold */
 for(const [u,v] of [[.5,.94],[.3,.9],[.7,.92],[.5,.08]]){const x=c.l+c.w*u,y=c.t+c.h*v;await glide(x-20,y-20,x,y,{steps:4});await sleep(300);await mouse('mousePressed',x,y,1);await sleep(900);
  poses.push({pose:`press ${u},${v}`,...await seam()});await page.shot(SHOTS,`seam-press-${u}-${v}`,clip);await mouse('mouseReleased',x,y);await mouse('mouseMoved',20,20);await sleep(1500);}
 /* turned by hand, held at an angle */
 for(const [dx,dy] of [[0,130],[0,-130],[140,0],[-140,0],[110,110]]){await glide(20,20,c.cx,c.cy,{steps:4});await mouse('mousePressed',c.cx,c.cy,1);
  await glide(c.cx,c.cy,c.cx+dx,c.cy+dy,{buttons:1});await sleep(250);poses.push({pose:`turn ${dx},${dy}`,...await seam()});await page.shot(SHOTS,`seam-turn-${dx}-${dy}`,clip);
  await mouse('mouseReleased',c.cx+dx,c.cy+dy);await mouse('mouseMoved',20,20);await sleep(2000);}
 for(const p of poses)assert.ok(p.step<14,'no lighting seam on the card: '+JSON.stringify(p));
});

test('a change that interrupts a running one picks up from the screen, and quick changes leave nothing behind',async t=>{
 const page=await openHome(t,{covers:[RED,GREEN,BLUE]});if(!page)return;const {evaluate}=page;
 const chips=await page.chips(),c=await page.cover(),clip={x:c.l,y:c.t,width:c.w,height:c.h},mean=()=>page.pixels(clip,MEAN);
 const red=await mean(),green=[40,160,70];
 /* hold the first dissolve open (a slow CI machine takes seconds over the screenshot) so it is still running when it is interrupted */
 await evaluate(`document.querySelector('.tv-cover').style.setProperty('--tv-dissolve-ms','10000');1`);
 await page.chip(1);await sleep(600);
 let before=await mean();for(let k=0;k<40&&dist(before,red)<=8;k++){await sleep(100);before=await mean();}await page.shot(SHOTS,'switch-1-before-interrupt',clip);
 assert.ok(dist(before,red)>8,'the change to the second game has started: '+JSON.stringify({before,red}));
 await evaluate(`document.querySelector('.tv-cover').style.removeProperty('--tv-dissolve-ms');1`);
 await page.chip(2);
 const layers=await page.state();
 const after=await mean();await page.shot(SHOTS,'switch-2-after-interrupt',clip);
 /* the red of the first game only keeps fading: dropping the running change (as the old wipe did) jumps the card back to red */
 assert.ok(dist(after,red)>=dist(before,red)-12,'no jump back when a change is interrupted: '+JSON.stringify({before,after,red}));
 assert.ok(layers.dissolve>=2,'the interrupted change keeps going under the new one: '+JSON.stringify(layers));
 /* quick changes, one every 90 ms, then let it settle */
 await evaluate(`(()=>{window.__gaps=[];let last=0;const f=t=>{if(last)__gaps.push(t-last);last=t;if(!window.__stopGaps)requestAnimationFrame(f);};requestAnimationFrame(f);return 1;})()`);
 const order=[0,1,2,0,2,1,0,1];for(const i of order){await page.chip(i);await sleep(90);}
 await sleep(2500);const gaps=await evaluate('(window.__stopGaps=1,__gaps)');
 const s=await page.state(),final=await mean();await page.shot(SHOTS,'switch-3-settled',clip);
 assert.equal(s.onChip,order[order.length-1],'the last pick is the one shown');
 assert.ok(dist(final,[40,160,70])<45,'the card shows the last pick, with no leftover of the others: '+JSON.stringify(final));
 assert.deepEqual({dissolve:s.dissolve,old:s.old,ghosts:s.ghosts,busy:s.busy},{dissolve:0,old:0,ghosts:0,busy:false},'nothing is left behind');
 const worst=Math.max(...gaps);t.diagnostic(`frame gaps during quick changes: max ${worst.toFixed(1)} ms, ${gaps.length} frames`);
 assert.ok(worst<400,'the page keeps painting during quick changes (worst frame gap '+worst.toFixed(1)+' ms)');
});

test('a drag turns the card freely and springs back; a drag is never a click or a double-click',async t=>{
 const page=await openHome(t,{covers:[RED,GREEN,BLUE]});if(!page)return;const {mouse,glide}=page;
 const c=await page.cover(),start=await page.state();
 const rot=s=>{const m=String(s).match(/rotateZ\((-?[\d.]+)deg\) rotateX\((-?[\d.]+)deg\) rotateY\((-?[\d.]+)deg\)/);return m?{rz:+m[1],rx:+m[2],ry:+m[3]}:{rz:0,rx:0,ry:0};};
 /* drag on the card: turns in 3D, far past the old fixed tilt */
 await glide(20,20,c.cx,c.cy,{steps:4});await mouse('mousePressed',c.cx,c.cy,1);await glide(c.cx,c.cy,c.cx+150,c.cy-60,{buttons:1});
 const turned=rot((await page.state()).inline);await page.shot(SHOTS,'turn-held');
 assert.ok(turned.ry>30&&turned.rx>10,'a drag turns the card freely: '+JSON.stringify(turned));
 /* back to where it started and let go there, then a quick second click on the same spot (the OS would call it a double-click) */
 await glide(c.cx+150,c.cy-60,c.cx,c.cy,{buttons:1});await mouse('mouseReleased',c.cx,c.cy,0,1);await sleep(60);await page.click(c.cx,c.cy,2);
 await sleep(1600);let s=await page.state();
 assert.ok(s.home,'a drag never opens the detail');assert.equal(s.title,start.title,'a drag followed by a click is not a double-click draw');
 await sleep(1200);s=await page.state();assert.equal(s.inline.includes('rotateZ'),false,'the card springs back to rest: '+s.inline);
 /* the ring just outside the card: rotates it in its plane */
 const rx=c.l+c.w+24,ry=c.cy-40;await glide(20,20,rx,ry,{steps:4});await mouse('mousePressed',rx,ry,1);
 for(let k=1;k<=14;k++){const a=-.35+k*.07;await mouse('mouseMoved',c.cx+Math.cos(a)*(c.w/2+24),c.cy+Math.sin(a)*(c.w/2+24),1);await sleep(16);}
 const spun=rot((await page.state()).inline);await page.shot(SHOTS,'ring-held');
 assert.ok(Math.abs(spun.rz)>20,'dragging the ring rotates the card in its plane: '+JSON.stringify(spun));
 await mouse('mouseReleased',c.cx+Math.cos(.63)*(c.w/2+24),c.cy+Math.sin(.63)*(c.w/2+24));await mouse('mouseMoved',20,20);await sleep(2600);
 s=await page.state();assert.equal(s.inline,'','back at rest after the ring');
 /* a plain double-click still draws, a plain click still opens the detail */
 await glide(20,20,c.cx,c.cy,{steps:4});await sleep(200);await page.dblclick(c.cx,c.cy);await sleep(3500);s=await page.state();
 assert.notEqual(s.title,start.title,'a double-click draws another card');
 assert.equal(s.running,0,'the draw has finished');
 await page.click(c.cx,c.cy);await sleep(1500);s=await page.state();assert.equal(s.home,false,'a click opens the detail page');
});

test('clicks, drags and quick draws in the middle of a draw never leave the card halfway',async t=>{
 const page=await openHome(t,{covers:[RED,GREEN,BLUE]});if(!page)return;const {mouse,glide}=page;
 const c=await page.cover(),chips=await page.chips(),clip={x:c.l,y:c.t,width:c.w,height:c.h};
 const settled=async(label)=>{const s=await page.state();
  assert.deepEqual({running:s.running,busy:s.busy,flip:s.flipCss,face:s.faceCss==='none'||/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(s.faceCss),opacity:s.faceOpacity,dissolve:s.dissolve,old:s.old},
   {running:0,busy:false,flip:'none',face:true,opacity:1,dissolve:0,old:0},label+': the card is back at rest, whole and alone: '+JSON.stringify(s));return s;};
 /* drag in the middle of a draw */
 await glide(20,20,c.cx,c.cy,{steps:4});await sleep(200);await page.dblclick(c.cx,c.cy);await sleep(250);
 await mouse('mousePressed',c.cx,c.cy,1);await glide(c.cx,c.cy,c.cx+120,c.cy+40,{buttons:1});await page.shot(SHOTS,'draw-drag-mid');await mouse('mouseReleased',c.cx+120,c.cy+40);
 await mouse('mouseMoved',20,20);await sleep(4000);await settled('drag during a draw');
 /* a pick from the strip in the middle of a draw */
 await glide(20,20,c.cx,c.cy,{steps:4});await sleep(200);await page.dblclick(c.cx,c.cy);await sleep(350);await page.chip(2);
 await mouse('mouseMoved',20,20);await sleep(3500);let s=await settled('pick during a draw');assert.equal(s.onChip,2,'the pick wins');
 const m=await page.pixels(clip,MEAN);assert.ok(dist(m,[50,80,200])<50,'the picked cover is what shows: '+JSON.stringify(m));
 /* four quick draws, a click in between */
 await glide(20,20,c.cx,c.cy,{steps:4});await sleep(200);
 for(let k=0;k<4;k++){await page.dblclick(c.cx,c.cy);await sleep(60);}
 await page.click(c.cx,c.cy);await mouse('mouseMoved',20,20);await sleep(4500);await page.shot(SHOTS,'draws-settled');
 s=await settled('quick draws');assert.ok(s.home,'a click in the middle of a draw does not open the detail');
 await glide(20,20,c.cx,c.cy+c.h*.3,{steps:6});await sleep(1200);s=await page.state();assert.ok(!s.popShown||s.popOverlap===0,'the hint is not on the card after the draws: '+JSON.stringify(s));
});

test('with reduced motion a change is a short plain cross-fade',async t=>{
 const page=await openHome(t,{covers:[RED,GREEN]});if(!page)return;const {send,evaluate}=page;
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 const chips=await page.chips(),c=await page.cover(),clip={x:c.l,y:c.t,width:c.w,height:c.h};
 await page.chip(1);await sleep(60);
 const mid=await evaluate(`[...document.querySelectorAll('.tv-cover .tv-dissolve')].map(e=>e.tagName)`);
 assert.deepEqual(mid,['DIV'],'one cross-fade layer, no grain canvas');
 /* the fade itself is short; how long a loaded CI machine takes to run it out is not what is measured */
 const len=await evaluate(`document.querySelector('.tv-cover .tv-dissolve').getAnimations()[0].effect.getTiming().duration`);assert.ok(len<=300,'the cross-fade lasts a fraction of a second: '+len);
 let s=await page.state();for(let k=0;k<40&&s.dissolve;k++){await sleep(100);s=await page.state();}const m=await page.pixels(clip,MEAN);
 assert.equal(s.dissolve,0,'the cross-fade is over quickly');assert.ok(dist(m,[40,160,70])<45,'the new cover shows: '+JSON.stringify(m));
});
