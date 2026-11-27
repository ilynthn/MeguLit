/* 2026-11-27 (user: 换卡像卷帘门往下拉 → 要溶解; 快速切换会卡) the home cover changes by dissolving: the old picture breaks up into grains that glow
   and vanish while the new one shows through the holes. Each change is one canvas layer laid over the art. A change that comes while another is
   still running slides its layer in under the running ones, so what is on screen never jumps: the older grains keep falling on their own clock and
   the newer picture shows through them. Nothing queues and nothing is reset. Reduced motion: a plain cross-fade. */

const GRAIN=2;
const layers=new Set();let frame=0;
const images=new Map();
const noises=new Map();

/* the picture behind `url("...") center/cover`, or '' for a gradient */
export function coverURL(background){const m=String(background||'').match(/url\("([^"]+)"\)/);return m?m[1].replace(/%22/g,'"'):'';}

/* a decoded image if it is ready now (covers on screen always are), else null; the load is started for next time */
export function readyImage(url){if(!url)return null;let img=images.get(url);
 if(!img){img=new Image();img.decoding='async';img.src=url;img.decode?.().catch(()=>{});images.set(url,img);if(images.size>40)images.delete(images.keys().next().value);}
 return img.complete&&img.naturalWidth>0?img:null;}

/* grain field: low-frequency value noise (clumps) mixed with per-grain randomness (grit), normalised to 0..1; cached per size */
function noiseField(w,h){const key=w+'x'+h;let n=noises.get(key);if(n)return n;
 const rand=(x,y,s)=>{let t=(x*374761393+y*668265263+s*982451653)|0;t=(t^(t>>>13))*1274126177|0;return ((t^(t>>>16))>>>0)/4294967295;};
 const smooth=(x,y,cell,s)=>{const gx=x/cell,gy=y/cell,x0=Math.floor(gx),y0=Math.floor(gy),fx=gx-x0,fy=gy-y0,ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
  const a=rand(x0,y0,s),b=rand(x0+1,y0,s),c=rand(x0,y0+1,s),d=rand(x0+1,y0+1,s);return a+(b-a)*ux+(c-a)*uy+(a-b-c+d)*ux*uy;};
 n=new Float32Array(w*h);let lo=Infinity,hi=-Infinity;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=smooth(x,y,26,1)*.5+smooth(x,y,9,2)*.22+rand(x,y,3)*.28;n[y*w+x]=v;if(v<lo)lo=v;if(v>hi)hi=v;}
 for(let i=0;i<n.length;i++)n[i]=(n[i]-lo)/(hi-lo||1);
 noises.set(key,n);if(noises.size>6)noises.delete(noises.keys().next().value);return n;}

function ms(face){const v=parseFloat(getComputedStyle(face).getPropertyValue('--tv-dissolve-ms'));return v>0?v:720;}
const calm=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
/* starts at once (a click shows grains on the next frames), lands softly */
const ease=t=>Math.sin(t*Math.PI/2);

/* draws `img` like background-size:cover; background-position:center */
function cover(ctx,img,w,h){const s=Math.max(w/img.naturalWidth,h/img.naturalHeight),sw=w/s,sh=h/s;
 ctx.drawImage(img,(img.naturalWidth-sw)/2,(img.naturalHeight-sh)/2,sw,sh,0,0,w,h);}

function place(face,el){const running=face.querySelector(':scope>.tv-dissolve');face.insertBefore(el,running||face.querySelector(':scope>.tv-foil'));}

/* lays the outgoing picture over `face` and dissolves it; returns the layer element. `background` is the art that is leaving */
export function dissolveOut(face,background){
 const w=Math.max(1,Math.round(face.clientWidth)),h=Math.max(1,Math.round(face.clientHeight)),dur=ms(face),img=readyImage(coverURL(background));
 if(calm()||!img){const el=document.createElement('div');el.className='tv-old tv-dissolve';el.style.background=background;place(face,el);
  const a=el.animate([{opacity:1},{opacity:0}],{duration:calm()?220:dur*.8,easing:'ease-in-out',fill:'forwards'});
  const done=()=>el.remove();a.finished.then(done,done);el.__stop=()=>{a.cancel();el.remove();};return el;}
 const dpr=Math.min(2,devicePixelRatio||1),cw=Math.round(w*dpr),ch=Math.round(h*dpr),gw=Math.ceil(w/GRAIN),gh=Math.ceil(h/GRAIN);
 const el=document.createElement('canvas');el.className='tv-old tv-dissolve';el.width=cw;el.height=ch;el.setAttribute('aria-hidden','true');
 const ctx=el.getContext('2d');cover(ctx,img,cw,ch);place(face,el);
 const pic=document.createElement('canvas');pic.width=cw;pic.height=ch;cover(pic.getContext('2d'),img,cw,ch);
 const mask=document.createElement('canvas');mask.width=gw;mask.height=gh;const mx=mask.getContext('2d'),md=mx.createImageData(gw,gh),m32=new Uint32Array(md.data.buffer);
 const glow=document.createElement('canvas');glow.width=gw;glow.height=gh;const gx=glow.getContext('2d'),gd=gx.createImageData(gw,gh),g32=new Uint32Array(gd.data.buffer);
 const noise=noiseField(gw,gh),EDGE=.07,HALO=.06;
 const layer={el,t0:performance.now(),dur,draw(t){
  /* t runs a little past both ends so the first frame is the whole picture and the last one is empty */
  const cut=-EDGE+t*(1+EDGE+HALO);
  for(let i=0;i<noise.length;i++){const d=noise[i]-cut;
   m32[i]=d>=EDGE?0xff000000:d>0?((d/EDGE*255)|0)<<24:0;
   if(d<=0&&d>-HALO){const k=1+d/HALO,a=(k*k*200)|0;g32[i]=(a<<24)|0xa0d6ff;}else g32[i]=0;}
  mx.putImageData(md,0,0);gx.putImageData(gd,0,0);
  ctx.globalCompositeOperation='copy';ctx.drawImage(pic,0,0);
  ctx.imageSmoothingEnabled=false;ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0,cw,ch);
  ctx.globalCompositeOperation='lighter';ctx.drawImage(glow,0,0,cw,ch);ctx.imageSmoothingEnabled=true;ctx.globalCompositeOperation='source-over';}};
 el.__stop=()=>{layers.delete(layer);el.remove();};
 layers.add(layer);
 /* more than three running: the oldest ones finish quickly instead of piling up */
 const live=[...layers].filter(l=>l.el.isConnected&&l.el.parentNode===face);
 if(live.length>3){const now=performance.now();live.slice(0,live.length-3).forEach(l=>{const p=Math.min(1,(now-l.t0)/l.dur),left=Math.min(l.dur*(1-p),160);l.dur=(now-l.t0)+left;});}
 if(!frame)frame=requestAnimationFrame(tick);
 return el;}

function tick(now){frame=0;
 for(const l of layers){if(!l.el.isConnected){layers.delete(l);continue;}const p=Math.min(1,Math.max(0,(now-l.t0)/l.dur));
  if(p>=1){layers.delete(l);l.el.remove();continue;}l.draw(ease(p));}
 if(layers.size)frame=requestAnimationFrame(tick);}

/* builds the grain field for this card size while the page is idle, so the first change does not pay for it */
export function warmDissolve(face){const w=Math.max(1,Math.round(face.clientWidth)),h=Math.max(1,Math.round(face.clientHeight));if(w<8||h<8)return;
 const go=()=>noiseField(Math.ceil(w/GRAIN),Math.ceil(h/GRAIN));(globalThis.requestIdleCallback||(f=>setTimeout(f,200)))(go);}

/* drops every running layer on this face at once (a draw flips the card instead) */
export function clearDissolve(face){face.querySelectorAll(':scope>.tv-dissolve').forEach(el=>el.__stop?el.__stop():el.remove());}
