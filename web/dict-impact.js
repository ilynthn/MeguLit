// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: no cracks; a 3D camera move and a spring impact, like a drawer kicked open — only when the search
   starts from the centre — slamming into the top bar and bouncing back to its place, different every time).
   When a search starts from the empty, centred dictionary, the box is kicked upward: the camera tilts and pulls back,
   the box flies up tilting in 3D, hits the top bar (the bar jolts, a line of light flares where it was struck, shards of
   kana burst out), and stops there (see launch()). Presentation only:
   the layout is the app's; this only animates the box from where it was to where the layout puts it. */
import {fxPref} from './fx-prefs.js';
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const KANA='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソ';
try{localStorage.removeItem('megulit.dict.cracks.v1');}catch{}
const rand=(a,b)=>a+Math.random()*(b-a);
const f1=n=>n.toFixed(2);
let busy=false,fxK=1;

function shards(x,y,power){
 const words=[...document.querySelectorAll('.g-dict-chips button')].map(b=>b.textContent.replace(/\d+/g,'').trim()).filter(Boolean);
 const fx=document.createElement('div');fx.className='dict-shards';fx.setAttribute('aria-hidden','true');
 const n=Math.round(10+power*14);let html='';
 const pool=[...words.join(''),...KANA];for(let i=0;i<n;i++){const t=pool[Math.floor(Math.random()*pool.length)];const depth=i%3;html+=`<i class="d${depth}" style="left:${x}px;top:${y}px;font-size:${Math.round([rand(26,40),rand(15,24),rand(10,14)][depth])}px">${t}</i>`;}
 fx.innerHTML=html;document.body.append(fx);
 for(const g of fx.querySelectorAll('i')){
  const dir=Math.random()<.5?-1:1,v=rand(180,520)*(.6+power*.6),tx=dir*v,ty=rand(-30,40),fall=rand(120,240),spin=rand(-540,540);
  g.animate([{transform:'translate(-50%,-50%) scale(.3)',opacity:0},{transform:`translate(calc(-50% + ${f1(tx*.3)}px),calc(-50% + ${f1(ty*.3)}px)) rotate(${f1(spin*.3)}deg) scale(1)`,opacity:1,offset:.15},{transform:`translate(calc(-50% + ${f1(tx*.75)}px),calc(-50% + ${f1(ty+fall*.35)}px)) rotate(${f1(spin*.7)}deg) scale(.85)`,opacity:.6,offset:.6},{transform:`translate(calc(-50% + ${f1(tx)}px),calc(-50% + ${f1(ty+fall)}px)) rotate(${f1(spin)}deg) scale(.6)`,opacity:0}],{duration:rand(560,720),easing:'cubic-bezier(.15,.6,.5,1)',fill:'forwards'});
 }
  setTimeout(()=>fx.remove(),1600);
}
function barHit(bar,x,power){
 if(!bar)return;const r=bar.getBoundingClientRect(),y=r.bottom;
 const wrap=document.createElement('div');wrap.className='dict-hit';wrap.setAttribute('aria-hidden','true');wrap.style.cssText=`left:${x-600}px;top:${y}px`;
 wrap.innerHTML='<i class="dict-hit-flash"></i><i class="dict-hit-ring"></i><i class="dict-hit-line"></i>';document.body.append(wrap);
 wrap.querySelector('.dict-hit-flash').animate([{transform:'translateX(-50%) scaleX(.15)',opacity:1},{transform:`translateX(-50%) scaleX(${f1(1+power*.6)})`,opacity:1,offset:.3},{transform:`translateX(-50%) scaleX(${f1(1.3+power*.8)})`,opacity:0}],{duration:620,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
 wrap.querySelector('.dict-hit-ring').animate([{transform:'translate(-50%,-50%) scale(.2,.12)',opacity:1},{transform:`translate(-50%,-50%) scale(${f1(2.6+power*2)},${f1(.55+power*.4)})`,opacity:0}],{duration:620,easing:'cubic-bezier(.1,.7,.3,1)',fill:'forwards'});
 /* the line runs out from the hit, holds a moment at full strength, then fades as it spreads further (easing per
    segment, so the hold really holds) */
 wrap.querySelector('.dict-hit-line').animate([{transform:'translateX(-50%) scaleX(.06)',opacity:1,easing:'cubic-bezier(.2,.8,.2,1)'},{transform:`translateX(-50%) scaleX(${f1(.7+power*.5)})`,opacity:1,offset:.24},{transform:`translateX(-50%) scaleX(${f1(.8+power*.6)})`,opacity:1,offset:.44,easing:'cubic-bezier(.4,0,.6,1)'},{transform:`translateX(-50%) scaleX(${f1(1.2+power*.9)})`,opacity:0}],{duration:1000,fill:'forwards'});
 setTimeout(()=>wrap.remove(),1040);
 power*=fxK;const k=power*8,side=(x-r.left)/r.width-.5,frames=[];
 for(let i=0;i<=10;i++){const d=Math.exp(-i*.45),sgn=i%2?1:-1;frames.push({transform:i===10?'none':`translateY(${f1(sgn*k*d)}px) rotate(${f1(sgn*side*k*.1*d)}deg)`});}
 bar.animate(frames,{duration:560,easing:'linear'});
}
/* 2026-11-12 (user: the top bar is a wall — it is hit once, there is no bounce, no gravity pulls it back). The box
   gives a small wind-up, then accelerates straight up with its own lean and twist; the moment it reaches its place
   under the bar it stops dead: it squashes against the wall and recovers, the wall slaps its 3D angles flat, the bar
   and the view jolt, light flares along the bar and kana shards burst out. The camera (tilt, swing, dolly) rides the
   flight and settles on its own spring. Speed, curve, lean, twist and the point of impact are random each time. */
function dropResults(){
 const list=[...document.querySelectorAll('#lookup-results .record, #lookup-results > *:not(.record-list)')].slice(0,8);
 list.forEach((el,i)=>el.animate([{transform:'translateY(-14px)',opacity:0},{transform:'translateY(2px)',opacity:1,offset:.7},{transform:'none',opacity:1}],{duration:420,delay:60+i*45,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'}));
}
function launch(form){
 const host=form.closest('#learning-content'),bar=document.querySelector('header.titlebar');if(!host)return;
 const start=form.getBoundingClientRect();
 host.classList.add('dict-launch');
 const end=form.getBoundingClientRect(),delta=start.top-end.top;
 if(delta<40){host.classList.remove('dict-launch');return;}
 busy=true;
 const hitX=rand(.12,.88),side=hitX<.5?-1:1,windup=rand(60,110),flight=rand(210,330)*Math.min(1.4,Math.max(.8,delta/300)),curve=rand(1.8,2.8),dip=rand(6,14);
 /* the bar is wide: a small roll keeps the field and its button reading as one block */
 const leanX=rand(10,20),twist=side*rand(.4,1.1),yaw=side*rand(3,7);
 const cam={rx:0,vrx:0,ry:0,vry:0,s:1,vs:0},CK=80,CC=8;
 let sq=0,vsq=0,hit=false,flat=1,flatV=0;
 form.style.transformOrigin=`${f1(hitX*100)}% 0%`;host.style.transformOrigin='50% 30%';
 const t0=performance.now();let prev=t0,quiet=0;
 const frame=now=>{
  const dt=Math.min(.05,(now-prev)/1000);prev=now;const t=now-t0;let y,tilt=0;
  if(t<windup){const k=t/windup;y=delta+dip*Math.sin(k*Math.PI*.5);tilt=-k*.3;cam.rx+=(-2*k-cam.rx)*.2;}
  else if(!hit){const k=Math.min(1,(t-windup)/flight),e=Math.pow(k,curve);y=(delta+dip)*(1-e);tilt=Math.min(1,k*1.6);
   cam.rx=6*Math.sin(Math.min(1,k)*Math.PI*.5);cam.s=1-.035*k;cam.ry=side*-2.5*k;
   if(k>=1){hit=true;y=0;const speed=(delta+dip)*curve/flight*1000,power=Math.min(1.4,speed/2600),ix=end.left+end.width*hitX;
    vsq=-rand(9,14)*power;sq=0;flat=0;flatV=0;
    cam.vrx=-rand(60,100)*power;cam.vry=side*rand(30,60)*power;cam.vs=rand(.5,.9)*power;
    barHit(bar,ix,power);document.dispatchEvent(new CustomEvent('megulit:dict-gust',{detail:{x:ix,y:end.top}}));host.classList.add('dict-landed');dropResults();
    host.animate([{translate:'0 0'},{translate:`${f1(side*-3*power)}px ${f1(-5*power)}px`},{translate:`${f1(side*2*power)}px ${f1(2*power)}px`},{translate:'0 0'}],{duration:300,easing:'cubic-bezier(.3,.7,.2,1)',composite:'add'});}}
  else y=0;
  if(hit){for(let s=0;s<4;s++){const h=dt/4;const a=-420*sq-22*vsq;vsq+=a*h;sq+=vsq*h;
    for(const [p,vp,target] of [['rx','vrx',0],['ry','vry',0],['s','vs',1]]){const ac=-CK*(cam[p]-target)-CC*cam[vp];cam[vp]+=ac*h;cam[p]+=cam[vp]*h;}}}
  if(!hit&&t>=windup){const k=Math.min(1,(t-windup)/flight),vy=-(delta+dip)*curve*Math.pow(k,curve-1)/flight*1000;document.dispatchEvent(new CustomEvent('megulit:dict-wind',{detail:{x:end.left+end.width/2,hw:end.width/2,y:end.top+y+end.height/2,vx:twist*40,vy}}));}
  const lean=hit?0:tilt,squash=hit?Math.max(-.2,Math.min(.06,sq*.25)):0;
  form.style.transform=`translate3d(0,${f1(y)}px,0) rotateX(${f1(-leanX*lean)}deg) rotateY(${f1(yaw*lean)}deg) rotateZ(${f1(twist*lean)}deg) scale(${(1-squash*.35).toFixed(3)},${(1+squash).toFixed(3)})`;
  host.style.transform=`perspective(1400px) rotateX(${f1(cam.rx)}deg) rotateY(${f1(cam.ry)}deg) scale(${cam.s.toFixed(4)})`;
  const still=hit&&Math.abs(sq)<.02&&Math.abs(vsq)<.2&&Math.abs(cam.rx)<.05&&Math.abs(cam.ry)<.05&&Math.abs(cam.s-1)<.001;
  quiet=still?quiet+1:0;
  if(quiet>4||!form.isConnected){form.style.transform='';form.style.transformOrigin='';host.style.transform='';host.style.transformOrigin='';busy=false;
   const done=()=>{const r=document.querySelector('#lookup-results');if(!r||r.children.length||r.textContent.trim()||!host.isConnected){host.classList.remove('dict-launch','dict-landed');}else setTimeout(done,200);};done();return;}
  requestAnimationFrame(frame);
 };
 form.style.transform=`translate3d(0,${f1(delta)}px,0)`;
 requestAnimationFrame(frame);
}
document.addEventListener('submit',e=>{
 const form=e.target;if(calm||busy||form?.id!=='lookup-form')return;
 const pref=fxPref('dictImpact');if(!pref.on)return;fxK=pref.k;
 const results=document.querySelector('#lookup-results');
 /* only from the empty, centred state */
 if(!results||results.children.length||results.textContent.trim())return;
 launch(form);
},true);
