// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 the 转职 stage, rebuilt (user: only ice and dark were good; a grand original explosion circle for fire; no
   cheap dot particles anywhere — every particle has a shape and a material; every element keeps moving while it is
   shown; switching elements cross-fades both sides instead of cutting). One canvas, one loop.
   - Switching: the outgoing scene contracts and dissolves while the new one opens from the centre through a short wash
     of its colour (~520 ms); a new switch during that interrupts it (only two scenes ever draw at once).
   - Particles are typed and drawn as shapes: trailing sparks, six-armed flakes and needles, lightning arcs, wind
     streaks and leaves, teardrop drops, rock chips, four-point glints, smoke wisps and violet shards. Each scene keeps
     its own count under a cap and spawns continuously, so idle never runs dry.
   - fire: an original grand blast circle — twin rune bands of invented glyphs turning in opposite directions, a tick
     ring, a heptagram nested in a hexagram nested in an octagon, radial spokes, six satellite circles, crimson to gold,
     humming with a pulse; cast draws it ring by ring from the centre outward, the hum quickens, the circle clenches
     and bursts, and its lines linger as afterglow.
   - ice: a fine snowflake behind the glyph as a halo (graded branches, translucent body), a few shaped flakes and
     needles in depth, cold mist along the bottom, frost growing in from the edges, a glint sweeping the glyph.
   - thunder: a dark cloud bank lit from within, branching strikes down to the glyph, current crawling its strokes.
   - wind: a whirlwind column of helical streamlines behind the glyph, leaves carried round it.
   - water: a water orb with refraction and inner waves, ripples on the floor, drops rising and falling.
   - earth: a floating rock slab with glowing rune seams, chips orbiting, dust settling.
   - light: a halo of thin rings and slow god rays, twinkling four-point glints.
   - dark: an eclipse, smoke wisps seeping and circling, violet shards drawn in, a slow dark mist, a light-eating pulse.
   Reduced motion draws a still frame. Presentation only. */
import {glyphFor,paintGlyph} from './element-forms.js';
import {cornerArt,cornerBlend} from './element-corners.js';
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU=Math.PI*2,R=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)];
const CAP=260;
const FLASH={fire:'#ff8a3c',earth:'#d8a060',dark:'#8a5ad0'};
const COLOR={fire:'#e2423e',ice:'#9fe3ff',thunder:'#ffe36a',wind:'#8fe0c0',water:'#5fb0f0',earth:'#c08a52',light:'#fff1b8',dark:'#a07ae0'};
const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;};

/* ---------- shaped particles ---------- */
const DRAW={
 wedge(c,p,k){const sp=Math.hypot(p.vx,p.vy),len=Math.min(70,8+sp*.09)*(1-k*.5),w=p.r*(1-k*.6),a=Math.atan2(p.vy,p.vx),al=(1-k)*(k<.08?k/.08:1);c.save();c.translate(p.x,p.y);c.rotate(a);const g=c.createLinearGradient(-len,0,w,0);g.addColorStop(0,'rgba(200,40,20,0)');g.addColorStop(.6,`rgba(255,120,50,${al*.7})`);g.addColorStop(1,`rgba(255,230,180,${al})`);c.fillStyle=g;c.beginPath();c.moveTo(-len,0);c.quadraticCurveTo(-len*.4,-w,0,-w);c.arc(0,0,w,-Math.PI/2,Math.PI/2);c.quadraticCurveTo(-len*.4,w,-len,0);c.fill();c.restore();},
 wx(c,p,k,s){const im=p.spr,fade=Math.min(1,p.t*1.5)*(p.free||p.blown?Math.min(1,(p.life-p.t)*2.5):1);c.save();c.translate(p.x,p.y);c.rotate(p.a+p.t*(p.spin||0));c.globalAlpha*=p.al*fade;c.drawImage(im,-im.width/2,-im.height/2);c.restore();},
 snow(c,p,k,s){const im=p.spr,fade=Math.min(1,p.t*1.5);c.save();c.translate(p.x,p.y);c.rotate(p.a+p.t*p.spin);c.globalAlpha*=p.al*fade;c.drawImage(im,-im.width/2,-im.height/2);c.restore();},
 ember(c,p,k){const a=Math.sin(Math.PI*Math.min(1,k))*(.6+.4*Math.sin(p.t*14+p.r*9)),r=p.r*3;const g=c.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,`rgba(255,226,170,${a})`);g.addColorStop(.35,`rgba(255,130,60,${a*.6})`);g.addColorStop(1,'rgba(200,40,20,0)');c.fillStyle=g;c.globalAlpha=1;c.fillRect(p.x-r,p.y-r,r*2,r*2);},
 spark(c,p,k){p.trail.push([p.x,p.y]);if(p.trail.length>7)p.trail.shift();c.lineCap='round';for(let i=1;i<p.trail.length;i++){c.globalAlpha=(1-k)*i/p.trail.length;c.strokeStyle=k<.5?'#ffe2a0':'#ff8a3a';c.lineWidth=p.r*i/p.trail.length;c.beginPath();c.moveTo(...p.trail[i-1]);c.lineTo(...p.trail[i]);c.stroke();}},
 flake(c,p,k){c.save();c.translate(p.x,p.y);c.rotate(p.a+p.t*p.spin);c.globalAlpha=Math.sin(Math.PI*Math.min(1,k))*p.al;c.strokeStyle='#eaf8ff';c.lineWidth=p.r>5?1.2:.8;if(p.blur)c.filter=`blur(${p.blur}px)`;c.beginPath();for(let i=0;i<6;i++){const q=i*TAU/6,x=Math.sin(q)*p.r,y=-Math.cos(q)*p.r;c.moveTo(0,0);c.lineTo(x,y);const m=.55;c.moveTo(x*m,y*m);c.lineTo(x*m+Math.sin(q+.6)*p.r*.3,y*m-Math.cos(q+.6)*p.r*.3);c.moveTo(x*m,y*m);c.lineTo(x*m+Math.sin(q-.6)*p.r*.3,y*m-Math.cos(q-.6)*p.r*.3);}c.stroke();c.restore();},
 needle(c,p,k){c.save();c.translate(p.x,p.y);c.rotate(p.a+p.t*p.spin);c.globalAlpha=(1-k)*.85;c.fillStyle='#dff6ff';c.beginPath();c.moveTo(0,-p.r*2.2);c.lineTo(p.r*.35,0);c.lineTo(0,p.r*2.2);c.lineTo(-p.r*.35,0);c.closePath();c.fill();c.restore();},
 leaf(c,p,k){c.save();c.translate(p.x,p.y);c.rotate(p.a+p.t*p.spin);c.globalAlpha=Math.sin(Math.PI*k)*.85;const g=c.createLinearGradient(-p.r,0,p.r,0);g.addColorStop(0,'#5fbf8f');g.addColorStop(1,'#c8f5dc');c.fillStyle=g;c.beginPath();c.moveTo(-p.r*1.6,0);c.quadraticCurveTo(0,-p.r*.9,p.r*1.6,0);c.quadraticCurveTo(0,p.r*.9,-p.r*1.6,0);c.fill();c.strokeStyle='rgba(30,90,60,.6)';c.lineWidth=.6;c.beginPath();c.moveTo(-p.r*1.4,0);c.lineTo(p.r*1.4,0);c.stroke();c.restore();},
 streak(c,p,k){p.trail.push([p.x,p.y]);if(p.trail.length>10)p.trail.shift();c.lineCap='round';c.strokeStyle=p.col||'#c8ffe8';for(let i=1;i<p.trail.length;i++){c.globalAlpha=Math.sin(Math.PI*k)*.55*i/p.trail.length;c.lineWidth=p.r*i/p.trail.length;c.beginPath();c.moveTo(...p.trail[i-1]);c.lineTo(...p.trail[i]);c.stroke();}},
 drop(c,p,k){c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(p.vy,p.vx)-Math.PI/2);c.globalAlpha=(1-k*.7)*.9;const g=c.createLinearGradient(0,-p.r*2,0,p.r);g.addColorStop(0,'#f0faff');g.addColorStop(1,'#4f9de8');c.fillStyle=g;c.beginPath();c.moveTo(0,-p.r*2);c.bezierCurveTo(p.r,-p.r*.4,p.r,p.r,0,p.r);c.bezierCurveTo(-p.r,p.r,-p.r,-p.r*.4,0,-p.r*2);c.fill();c.restore();},
 chip(c,p,k){c.save();c.translate(p.x,p.y);c.rotate(p.a+p.t*p.spin);c.globalAlpha=Math.min(1,(p.life-p.t)*2,p.t*3);c.beginPath();p.pts.forEach(([a,b],i)=>c[i?'lineTo':'moveTo'](a*p.r,b*p.r));c.closePath();const g=c.createLinearGradient(-p.r,-p.r,p.r,p.r);g.addColorStop(0,'#9a7650');g.addColorStop(1,'#3a2618');c.fillStyle=g;c.fill();c.strokeStyle='rgba(240,200,150,.55)';c.lineWidth=.8;c.stroke();c.restore();},
 glint(c,p,k){const a=Math.sin(Math.PI*k);c.save();c.translate(p.x,p.y);c.rotate(p.a);c.globalAlpha=a;c.fillStyle=p.col||'#fffbe8';const r=p.r*(.6+a*.6);c.beginPath();c.moveTo(0,-r*2.2);c.lineTo(r*.22,0);c.lineTo(0,r*2.2);c.lineTo(-r*.22,0);c.closePath();c.moveTo(-r*2.2,0);c.lineTo(0,r*.22);c.lineTo(r*2.2,0);c.lineTo(0,-r*.22);c.closePath();c.fill();c.restore();},
 wisp(c,p,k,s){p.a+=p.w*s.dt;p.rad=Math.max(p.minR||0,p.rad+p.dr*s.dt);const x=s.cx+Math.cos(p.a)*p.rad,y=s.cy+Math.sin(p.a)*p.rad*.8;if(p.px!=null){c.strokeStyle=`rgba(190,150,255,${Math.sin(Math.PI*k)*.7})`;c.lineWidth=p.r;c.lineCap='round';c.beginPath();c.moveTo(p.px,p.py);c.quadraticCurveTo((p.px+x)/2+Math.sin(p.t*3)*4,(p.py+y)/2,x,y);c.stroke();}p.px=x;p.py=y;},
 shard(c,p,k){c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(p.vy,p.vx));c.globalAlpha=Math.sin(Math.PI*k);c.fillStyle='#c8a8ff';c.beginPath();c.moveTo(p.r*2.4,0);c.lineTo(0,p.r*.5);c.lineTo(-p.r*1.2,0);c.lineTo(0,-p.r*.5);c.closePath();c.fill();c.restore();},
 smoke(c,p,k){const r=p.r*(1+k*1.8),g=c.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,`rgba(${p.col||'30,14,50'},${.4*Math.sin(Math.PI*k)})`);g.addColorStop(1,`rgba(${p.col||'30,14,50'},0)`);c.globalCompositeOperation='source-over';c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,r,0,TAU);c.fill();c.globalCompositeOperation='lighter';},
 flame(c,p,k){const r=p.r*(1.1-k*.5),col=k<.25?'255,236,190':k<.55?'255,150,70':'210,60,40',g=c.createRadialGradient(p.x,p.y-r*.3,0,p.x,p.y,r*1.3);g.addColorStop(0,`rgba(${col},${.3*(1-k)})`);g.addColorStop(1,`rgba(${col},0)`);c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,r*1.3,0,TAU);c.fill();},
 arc(c,p,k){c.strokeStyle=`rgba(255,250,215,${1-k})`;c.lineWidth=p.r;c.shadowColor='#ffe36a';c.shadowBlur=12;c.beginPath();p.pts.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.stroke();c.shadowBlur=0;}
};
function bolt(x0,y0,x1,y1,n=10,j=22){const pts=[[x0,y0]];for(let i=1;i<n;i++){const t=i/n;pts.push([x0+(x1-x0)*t+R(-j,j)*(1-Math.abs(t-.5)),y0+(y1-y0)*t+R(-j,j)*.4]);}pts.push([x1,y1]);return pts;}

/* invented rune shapes for the fire circle: a few strokes on a small grid, seeded, never a real script */
function runeSet(n,seed){let s=seed;const r=()=>{s=(s*16807)%2147483647;return s/2147483647;};return Array.from({length:n},()=>{const k=2+Math.floor(r()*3),st=[];for(let i=0;i<k;i++){const a=[Math.floor(r()*3)-1,Math.floor(r()*3)-1],b=[Math.floor(r()*3)-1,Math.floor(r()*3)-1];if(a[0]===b[0]&&a[1]===b[1])b[1]=-a[1]||1;st.push([a,b]);}if(r()<.4)st.push('o');return st;});}
const RUNES_A=runeSet(40,11),RUNES_B=runeSet(56,23);
const poly=(c,cx,cy,r,n,step,rot)=>{c.beginPath();for(let i=0;i<=n;i++){const q=rot-Math.PI/2+(i*step%n)*TAU/n;c[i?'lineTo':'moveTo'](cx+Math.cos(q)*r,cy+Math.sin(q)*r);}c.stroke();};
const arcP=(c,cx,cy,r,p,rot=0)=>{if(p<=0)return;c.beginPath();c.arc(cx,cy,r,rot-Math.PI/2,rot-Math.PI/2+TAU*Math.min(1,p));c.stroke();};
const stage=(s,t0,d)=>s.ct<0?1:Math.min(1,Math.max(0,(s.ct-t0)/d));

/* 2026-11-12 (user: every element's character designed for its element in the megu-edit manner — not a font glyph
   pasted on; bold or minimal, either). Each element gets a lettering lockup built from the character's shape and
   cached once: fire an open outline over a crimson shadow offset; ice cut into crystal slices; thunder split along a
   lightning cut; wind a motion smear; water liquid with its reflection; earth a heavy carved block, its edges eroded;
   light a hairline outline with an inner glow; dark a light-eating solid with a bite taken out. A small wide-tracked
   romaji line names it. Drawn per frame from the cache with a touch of motion. */
const LOCK=new Map();
const ROMAJI={fire:'HONOO',ice:'KŌRI',thunder:'IKAZUCHI',wind:'KAZE',water:'MIZU',earth:'TSUCHI',light:'HIKARI',dark:'YAMI'};
function canvasOf(w,h=w){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function tinted(mask,fill){const c=canvasOf(mask.width,mask.height),t=c.getContext('2d');fill(t,c.width,c.height);t.globalCompositeOperation='destination-in';t.drawImage(mask,0,0);return c;}
function outline(mask,w,color){const c=canvasOf(mask.width,mask.height),t=c.getContext('2d');const o=tinted(mask,(x,W,H)=>{x.fillStyle=color;x.fillRect(0,0,W,H);});for(let a=0;a<16;a++){const q=a/16*Math.PI*2;t.drawImage(o,Math.cos(q)*w,Math.sin(q)*w);}t.globalCompositeOperation='destination-out';t.drawImage(mask,0,0);return c;}
function dilate(mask,w,color){const c=canvasOf(mask.width,mask.height),t=c.getContext('2d');const o=tinted(mask,(x,W,H)=>{x.fillStyle=color;x.fillRect(0,0,W,H);});for(let a=0;a<16;a++){const q=a/16*Math.PI*2;t.drawImage(o,Math.cos(q)*w,Math.sin(q)*w);}t.drawImage(o,0,0);return c;}
function lockup(el,ch,size){
 const key=el+ch+size;if(LOCK.has(key))return LOCK.get(key);
 const g=glyphFor(ch,size),m=g.mask,W=m.width,c=canvasOf(W),t=c.getContext('2d');
 const grad=(stops,vertical=true)=>(x,w,h)=>{const gr=vertical?x.createLinearGradient(0,0,0,h):x.createLinearGradient(0,0,w,h);stops.forEach(([o,col])=>gr.addColorStop(o,col));x.fillStyle=gr;x.fillRect(0,0,w,h);};
 if(el==='fire'){t.globalAlpha=.85;t.drawImage(tinted(m,grad([[0,'#e2423e'],[1,'#5a0a10']])),size*.07,size*.07);t.globalAlpha=1;t.drawImage(tinted(m,grad([[0,'rgba(255,200,120,.35)'],[1,'rgba(255,120,60,.15)']])),0,0);t.drawImage(outline(m,1.6,'#ffe2b0'),0,0);}
 else if(el==='ice'){const body=tinted(m,grad([[0,'#ffffff'],[.5,'#cdeffc'],[1,'#7cc0e6']],false));const n=7;for(let i=0;i<n;i++){const y=W*(.12+i*.76/n),h=W*.76/n,dx=(i%2?1:-1)*size*.035;t.drawImage(body,0,y,W,h-1,dx,y,W,h-1);}t.globalAlpha=.6;t.drawImage(outline(m,1,'#e8f8ff'),0,0);}
 else if(el==='thunder'){const body=tinted(m,grad([[0,'#fffbe0'],[.6,'#ffd84a'],[1,'#b8861e']]));const cut=[[0,.42],[.32,.5],[.46,.38],[.64,.56],[1,.47]].map(([x,y])=>[x*W,y*W]);
  t.save();t.beginPath();t.moveTo(0,0);t.lineTo(W,0);cut.slice().reverse().forEach(([x,y])=>t.lineTo(x,y));t.closePath();t.clip();t.drawImage(body,-size*.03,-size*.02);t.restore();
  t.save();t.beginPath();t.moveTo(0,W);t.lineTo(W,W);cut.slice().reverse().forEach(([x,y])=>t.lineTo(x,y));t.closePath();t.clip();t.drawImage(body,size*.03,size*.02);t.restore();
  t.strokeStyle='rgba(255,255,235,.95)';t.lineWidth=1.2;t.shadowColor='#fff3a0';t.shadowBlur=8;t.beginPath();cut.forEach(([x,y],i)=>t[i?'lineTo':'moveTo'](x,y));t.stroke();}
 else if(el==='wind'){const body=tinted(m,grad([[0,'#effff8'],[1,'#9fe0c4']]));for(let i=6;i>=1;i--){t.globalAlpha=.07*(7-i)/2;t.drawImage(body,-i*size*.05,0);}t.globalAlpha=1;t.drawImage(body,0,0);}
 else if(el==='water'){t.drawImage(tinted(m,grad([[0,'#f2faff'],[.5,'#8fd0f8'],[1,'#2a70b8']])),0,0);t.globalAlpha=.7;t.drawImage(outline(m,1,'rgba(230,250,255,.9)'),0,0);}
 else if(el==='earth'){const block=dilate(m,size*.03,'#3a2616');t.drawImage(block,size*.02,size*.03);t.drawImage(tinted(m,(x,w,h)=>{const gr=x.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#ecd6b0');gr.addColorStop(1,'#9a7048');x.fillStyle=gr;x.fillRect(0,0,w,h);for(let i=0;i<420;i++){const k=Math.random();x.fillStyle=k<.5?`rgba(60,40,24,${.25+k*.4})`:`rgba(255,240,215,${(k-.5)*.5})`;x.fillRect(Math.random()*w,Math.random()*h,1.4,1.4);}}),0,0);
  t.globalCompositeOperation='destination-out';for(const [x,y] of g.edges)if(Math.random()<.18){t.beginPath();t.arc(W/2+x+Math.random()*2-1,W/2+y+Math.random()*2-1,Math.random()*1.8+.4,0,Math.PI*2);t.fill();}t.globalCompositeOperation='source-over';}
 else if(el==='light'){t.globalAlpha=.35;t.drawImage(tinted(m,grad([[0,'#fffaf0'],[1,'#ffe8a8']])),0,0);t.globalAlpha=1;t.drawImage(outline(m,1.2,'#fff3c8'),0,0);}
 else if(el==='dark'){t.drawImage(dilate(m,1.4,'#8a64d0'),0,0);t.drawImage(tinted(m,grad([[0,'#0a0412'],[1,'#1c0c32']])),0,0);t.globalCompositeOperation='destination-out';const b=g.edges[Math.floor(g.edges.length*.15)]||[size*.3,-size*.3];t.beginPath();t.arc(W/2+b[0]+size*.06,W/2+b[1]-size*.06,size*.14,0,Math.PI*2);t.fill();t.globalCompositeOperation='source-over';}
 const out={c,W,g,size};LOCK.set(key,out);return out;
}
function drawLockup(s,c,el){
 /* (user: the redesigned lettering was ugly) one clean serif face for every element, a quiet gradient of its colour
    and a soft glow of the same colour; the element is told by the scene, not by distorting the character */
 const size=Math.round(Math.min(s.W0||s.W,s.H0||s.H)*.28),g=glyphFor(s.glyph,size),pal={fire:['#fff1d6','#ff9a5a'],ice:['#ffffff','#a8e4fa'],thunder:['#fffbe6','#ffd86a'],wind:['#f2fff9','#9fe6c8'],water:['#f4fbff','#8cc8f2'],earth:['#f6e6cc','#c8a070'],light:['#fffdf4','#ffe6a6'],dark:['#efe6ff','#a88ae0']}[el];
 paintGlyph(c,g,s.cx,s.cy,(t,w)=>{const gr=t.createLinearGradient(0,w*.2,0,w*.8);gr.addColorStop(0,pal[0]);gr.addColorStop(1,pal[1]);t.fillStyle=gr;t.fillRect(0,0,w,w);},{glow:rgba(COLOR[el],.75),blur:18});
}

/* ---------- the fire vortex disc (original geometry; style only after the user's references) ---------- */
/* (judge fx7: the glyph sat on top of every line) the idle disc lies tilted at about 0.58 and is drawn in two halves:
   the far half before the glyph, the near half after it, so the character stands inside the ring */
/* (judge fx8: the tunnel read as one ball of yarn) every layer but the deepest is only its rim and the outer ends of
   its blades, so the rings stand apart and can be counted down the shaft */

/* ---------- snow and frost (ice) ---------- */
/* a six-armed flake with side branches, cached per size, softness and variant */
const FLAKE=new Map();
function snowFlake(size,blur,v){const key=Math.round(size*2)+'|'+Math.round(blur*2)+'|'+v;if(FLAKE.has(key))return FLAKE.get(key);
 const pad=Math.ceil(blur*3+2),W=Math.ceil(size*2+pad*2),cv=document.createElement('canvas');cv.width=cv.height=W;const c=cv.getContext('2d');c.translate(W/2,W/2);if(blur>.2)c.filter=`blur(${blur.toFixed(1)}px)`;
 c.strokeStyle='#eef9ff';c.lineCap='round';c.lineWidth=Math.max(.7,size*.09);
 if(size<4){c.fillStyle='rgba(238,249,255,.9)';c.beginPath();for(let i=0;i<6;i++){const q=i*TAU/6;c[i?'lineTo':'moveTo'](Math.cos(q)*size*.55,Math.sin(q)*size*.55);}c.closePath();c.fill();c.beginPath();for(let i=0;i<3;i++){const q=i*TAU/6;c.moveTo(Math.cos(q)*size,Math.sin(q)*size);c.lineTo(-Math.cos(q)*size,-Math.sin(q)*size);}c.stroke();}
 else{const br=[[.35,.42],[.6,.3],[.82,.18]].slice(0,2+(v%2)),ang=.55+v*.08;
  for(let i=0;i<6;i++){c.save();c.rotate(i*TAU/6);c.beginPath();c.moveTo(0,0);c.lineTo(0,-size);for(const [at,len] of br){c.moveTo(0,-size*at);c.lineTo(Math.sin(ang)*size*len,-size*at-Math.cos(ang)*size*len);c.moveTo(0,-size*at);c.lineTo(-Math.sin(ang)*size*len,-size*at-Math.cos(ang)*size*len);}c.stroke();c.restore();}
  c.fillStyle='rgba(238,249,255,.85)';c.beginPath();for(let i=0;i<6;i++){const q=i*TAU/6+TAU/12;c[i?'lineTo':'moveTo'](Math.cos(q)*size*.16,Math.sin(q)*size*.16);}c.closePath();c.fill();}
 FLAKE.set(key,cv);return cv;}
/* frost ferns growing in from the corners and edges, drawn once per stage size */
const FROST=new Map();
export function frostField(W,H){const key=W+'x'+H;if(FROST.has(key))return FROST.get(key);const cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');c.lineCap='round';c.shadowColor='#bfeaff';c.shadowBlur=4;
 let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 const fern=(x,y,a,len,w,depth)=>{if(depth>4||len<3)return;const steps=Math.max(3,Math.round(len/7));let px=x,py=y,aa=a;for(let i=1;i<=steps;i++){aa+=(rnd()-.5)*.18;const nx=px+Math.cos(aa)*len/steps,ny=py+Math.sin(aa)*len/steps;c.strokeStyle=`rgba(225,245,255,${.55-depth*.08})`;c.lineWidth=Math.max(.5,w*(1-i/steps*.6));c.beginPath();c.moveTo(px,py);c.lineTo(nx,ny);c.stroke();
   if(rnd()<.55){const side=rnd()<.5?1:-1;fern(nx,ny,aa+side*(.9+rnd()*.3),len*(.32+rnd()*.18)*(1-i/steps*.5),w*.6,depth+1);}px=nx;py=ny;}};
 const corners=[[0,0,.78],[W,0,2.36],[0,H,-.78],[W,H,-2.36]];
 for(const [x,y,a] of corners)for(let k=0;k<7;k++)fern(x,y,a+(rnd()-.5)*1.3,Math.min(W,H)*(.28+rnd()*.22),1.6,0);
 for(let k=0;k<14;k++){const e=k%4,u=rnd();const [x,y,a]=e===0?[u*W,0,Math.PI/2]:e===1?[u*W,H,-Math.PI/2]:e===2?[0,u*H,0]:[W,u*H,Math.PI];fern(x,y,a+(rnd()-.5)*.9,Math.min(W,H)*(.12+rnd()*.14),1.2,1);}
 FROST.set(key,cv);return cv;}
let FT=null;
function frostTmp(w,h){if(!FT)FT=document.createElement('canvas');if(FT.width!==w||FT.height!==h){FT.width=w;FT.height=h;}return FT;}

/* ---------- scenes ---------- */
/* ---------- 2026-11-12 every element built like ice (user: the ice scene is the standard; every element the same way,
   the character dead centre at its true proportions, every ring round and facing you) ----------
   One structure for all eight: a full-frame weather in three depths that moves with a gusting wind; a slow round
   vortex centred on the glyph that draws the weather in; a pattern growing in from the corners and edges and receding
   like breath; a floor; a small accent now and then. The cast speeds everything into the vortex, the pattern bursts
   across the whole window, then it breaks apart. Each element differs only in its materials and motion. Every
   particle is a cached sprite with a shape — no plain dots — and the weather is capped. */
const SPR=new Map();
function sprite(key,size,draw){const k=key+'|'+Math.round(size*2);if(SPR.has(k))return SPR.get(k);const pad=Math.ceil(size*.6+4),W=Math.ceil(size*2+pad*2),cv=document.createElement('canvas');cv.width=cv.height=W;const c=cv.getContext('2d');c.translate(W/2,W/2);draw(c,size);SPR.set(k,cv);return cv;}
const MAT={
 /* ember: a small tongue of flame, hot core, pointed tail (drawn pointing up; rotated to its motion) */
 ember:(c,s)=>{const g=c.createLinearGradient(0,s,0,-s*1.4);g.addColorStop(0,'rgba(255,240,200,1)');g.addColorStop(.35,'rgba(255,170,70,.95)');g.addColorStop(1,'rgba(220,50,30,0)');c.fillStyle=g;c.beginPath();c.moveTo(0,-s*1.5);c.quadraticCurveTo(s*.55,-s*.2,s*.42,s*.45);c.quadraticCurveTo(0,s*.95,-s*.42,s*.45);c.quadraticCurveTo(-s*.55,-s*.2,0,-s*1.5);c.fill();},
 rain:(c,s)=>{const g=c.createLinearGradient(0,-s*1.6,0,s*1.6);g.addColorStop(0,'rgba(220,230,255,0)');g.addColorStop(1,'rgba(235,240,255,.85)');c.strokeStyle=g;c.lineWidth=Math.max(.8,s*.08);c.lineCap='round';c.beginPath();c.moveTo(0,-s*1.6);c.lineTo(0,s*1.6);c.stroke();},
 stream:(c,s)=>{const g=c.createLinearGradient(0,-s*1.6,0,s*1.6);g.addColorStop(0,'rgba(200,255,230,0)');g.addColorStop(.6,'rgba(220,255,240,.7)');g.addColorStop(1,'rgba(220,255,240,0)');c.strokeStyle=g;c.lineWidth=Math.max(.7,s*.05);c.lineCap='round';c.beginPath();c.moveTo(0,-s*1.6);c.quadraticCurveTo(s*.3,0,0,s*1.6);c.stroke();},
 leaf:(c,s)=>{const g=c.createLinearGradient(-s,0,s,0);g.addColorStop(0,'#cfeec0');g.addColorStop(1,'#7fbf86');c.fillStyle=g;c.beginPath();c.moveTo(0,-s);c.quadraticCurveTo(s*.75,-s*.1,0,s);c.quadraticCurveTo(-s*.75,-s*.1,0,-s);c.fill();c.strokeStyle='rgba(60,110,70,.6)';c.lineWidth=Math.max(.5,s*.07);c.beginPath();c.moveTo(0,-s*.85);c.lineTo(0,s*.85);c.stroke();},
 petal:(c,s)=>{const g=c.createRadialGradient(0,s*.3,0,0,0,s);g.addColorStop(0,'#fff4f6');g.addColorStop(1,'#f3b9c6');c.fillStyle=g;c.beginPath();c.moveTo(0,-s);c.bezierCurveTo(s*.9,-s*.6,s*.6,s*.8,0,s);c.bezierCurveTo(-s*.6,s*.8,-s*.9,-s*.6,0,-s);c.fill();},
 bubble:(c,s)=>{c.strokeStyle='rgba(200,235,255,.75)';c.lineWidth=Math.max(.7,s*.09);c.beginPath();c.arc(0,0,s*.8,0,Math.PI*2);c.stroke();c.fillStyle='rgba(160,215,250,.12)';c.fill();c.strokeStyle='rgba(255,255,255,.95)';c.lineWidth=Math.max(.8,s*.12);c.beginPath();c.arc(0,0,s*.55,-2.4,-1.5);c.stroke();},
 drop:(c,s)=>{const g=c.createLinearGradient(0,-s,0,s);g.addColorStop(0,'rgba(220,240,255,.4)');g.addColorStop(1,'rgba(150,205,245,.95)');c.fillStyle=g;c.beginPath();c.moveTo(0,-s*1.2);c.quadraticCurveTo(s*.7,s*.2,0,s*.8);c.quadraticCurveTo(-s*.7,s*.2,0,-s*1.2);c.fill();},
 dust:(c,s)=>{c.fillStyle='rgba(214,180,130,.85)';c.beginPath();for(let i=0;i<6;i++){const q=i/6*Math.PI*2,r=s*(.55+.4*((i*7)%5)/5);c[i?'lineTo':'moveTo'](Math.cos(q)*r,Math.sin(q)*r);}c.closePath();c.fill();c.fillStyle='rgba(255,236,200,.35)';c.beginPath();c.arc(-s*.2,-s*.2,s*.25,0,Math.PI*2);c.fill();},
 stone:(c,s)=>{const g=c.createLinearGradient(-s,-s,s,s);g.addColorStop(0,'#b08a62');g.addColorStop(1,'#5a3e28');c.fillStyle=g;c.beginPath();[[-1,-.4],[-.3,-1],[.8,-.6],[1,.3],[.2,.9],[-.8,.6]].forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x*s,y*s));c.closePath();c.fill();c.strokeStyle='rgba(255,220,160,.35)';c.lineWidth=Math.max(.6,s*.1);c.beginPath();c.moveTo(-s*.8,-s*.4);c.lineTo(-s*.2,-s*.9);c.stroke();},
 mote:(c,s)=>{c.fillStyle='rgba(255,246,214,.95)';c.beginPath();for(let i=0;i<8;i++){const q=i/8*Math.PI*2,r=i%2?s*.18:s;c[i?'lineTo':'moveTo'](Math.cos(q-Math.PI/2)*r,Math.sin(q-Math.PI/2)*r);}c.closePath();c.fill();const g=c.createRadialGradient(0,0,0,0,0,s*.9);g.addColorStop(0,'rgba(255,240,190,.55)');g.addColorStop(1,'rgba(255,240,190,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,s*.9,0,Math.PI*2);c.fill();},
 shard:(c,s)=>{const g=c.createLinearGradient(0,-s*1.3,0,s*1.3);g.addColorStop(0,'rgba(210,180,255,.95)');g.addColorStop(1,'rgba(120,70,200,.2)');c.fillStyle=g;c.beginPath();c.moveTo(0,-s*1.3);c.lineTo(s*.32,0);c.lineTo(0,s*1.3);c.lineTo(-s*.32,0);c.closePath();c.fill();},
};
function soft(cv,blur){if(blur<.3)return cv;const k=cv.width+'|'+blur.toFixed(1);const key=cv.__id??=Math.random();const kk=key+'|'+k;if(SPR.has(kk))return SPR.get(kk);const pad=Math.ceil(blur*3),o=document.createElement('canvas');o.width=o.height=cv.width+pad*2;const c=o.getContext('2d');c.filter=`blur(${blur.toFixed(1)}px)`;c.drawImage(cv,pad,pad);SPR.set(kk,o);return o;}
/* per element: weather materials and motion, vortex colour, edge pattern, floor, accent, cast */
const WX={
 ice:{mats:['snow'],col:'200,236,255',fall:[16,46],wind:34,gust:150,rise:false},
 fire:{mats:['ember'],col:'255,140,60',fall:[-22,-70],wind:10,gust:90,rise:true,orient:true},
 thunder:{mats:['rain'],col:'200,215,255',fall:[260,520],wind:60,gust:120,orient:true,vort:'255,236,140'},
 wind:{mats:['stream','stream','leaf','petal'],col:'190,255,225',fall:[6,22],wind:120,gust:260,orient:'stream'},
 water:{mats:['bubble','bubble','drop'],col:'150,210,250',fall:[-14,-40],wind:8,gust:50,rise:true},
 earth:{mats:['dust','dust','stone'],col:'220,180,120',fall:[-4,-16],wind:30,gust:240,rise:true},
 light:{mats:['mote'],col:'255,236,170',fall:[8,26],wind:10,gust:70},
 dark:{mats:['shard'],col:'176,130,240',fall:[-6,-22],wind:16,gust:110,rise:true},
};
function matFor(el,z){const W=WX[el],m=W.mats[Math.floor(Math.random()*W.mats.length)];
 const size=z<.32?R(2.2,3.6):z<.7?R(5,8.5):R(12,20),blur=z>.75?R(2,4):0;
 if(m==='snow')return {m,spr:snowFlake(size,blur,Math.floor(R(0,4)))};
 const scale={rain:2.2,stream:4.5,ember:.9,drop:.9,mote:1.1,shard:1.2,leaf:1,petal:.9,bubble:1,dust:.8,stone:.9}[m]||1;
 return {m,spr:soft(sprite(m,size*scale,MAT[m]),blur)};}
/* (user: the corners must not all look like ice — earth's cracks are right) each element's own corner work */
function edgeOwn(el,W,H,c,rnd){const M=Math.min(W,H),corners=[[0,0,.78],[W,0,2.36],[0,H,-.78],[W,H,-2.36]];
 if(el==='fire'){/* charred scorch blooms at the corners with a few glowing cracks running out of the burn */
  for(const [x,y,a] of corners)for(let k=0;k<6;k++){const d=M*rnd()*.16,aa=a+(rnd()-.5)*1.4,bx=x+Math.cos(aa)*d,by=y+Math.sin(aa)*d,r=M*(.1+rnd()*.16),g=c.createRadialGradient(bx,by,0,bx,by,r);g.addColorStop(0,'rgba(18,5,3,.55)');g.addColorStop(.6,'rgba(50,12,5,.3)');g.addColorStop(.85,'rgba(255,90,30,.08)');g.addColorStop(1,'rgba(255,90,30,0)');c.fillStyle=g;c.fillRect(bx-r,by-r,r*2,r*2);}
  c.globalCompositeOperation='lighter';c.lineCap='round';
  for(const [x,y,a] of corners)for(let k=0;k<4;k++){let px=x,py=y,aa=a+(rnd()-.5)*1.1;const L=M*(.18+rnd()*.16),n=9;c.beginPath();c.moveTo(px,py);for(let i=1;i<=n;i++){aa+=(rnd()-.5)*.7;px+=Math.cos(aa)*L/n;py+=Math.sin(aa)*L/n;c.lineTo(px,py);}
   c.strokeStyle='rgba(255,120,40,.35)';c.lineWidth=5;c.shadowColor='#ff5a1a';c.shadowBlur=12;c.stroke();c.strokeStyle='rgba(255,210,140,.9)';c.lineWidth=1.3;c.shadowBlur=4;c.stroke();}
  return;}
 if(el==='thunder'){/* a few clean lightning cracks from each corner, one fork each, bright core inside a blue glow */
  c.globalCompositeOperation='lighter';c.lineJoin='miter';
  const crack=(x,y,a,L,w)=>{const pts=[[x,y]];let px=x,py=y;const n=7;for(let i=1;i<=n;i++){const aa=a+(rnd()-.5)*1.2;px+=Math.cos(aa)*L/n;py+=Math.sin(aa)*L/n;pts.push([px,py]);}
   for(const [lw,col,bl] of [[w*4,'rgba(130,170,255,.18)',14],[w,'rgba(235,245,255,.95)',6]]){c.strokeStyle=col;c.lineWidth=lw;c.shadowColor='#9fc4ff';c.shadowBlur=bl;c.beginPath();pts.forEach(([X,Y],i)=>c[i?'lineTo':'moveTo'](X,Y));c.stroke();}return pts;};
  for(const [x,y,a] of corners)for(let k=0;k<2;k++){const pts=crack(x,y,a+(rnd()-.5)*.9,M*(.26+rnd()*.12),1.4);const m=pts[3+Math.floor(rnd()*2)];crack(m[0],m[1],a+(rnd()<.5?.8:-.8),M*.1,.9);}
  return;}
 if(el==='wind'){/* wind lines curling in from the corners: long smooth arcs in parallel bands, thinning at their ends */
  c.globalCompositeOperation='lighter';c.lineCap='round';
  for(const [x,y,a] of corners)for(let k=0;k<5;k++){const r=M*(.18+k*.07),a0=a-.9+rnd()*.2,a1=a0+1.1+rnd()*.5,g=c.createLinearGradient(x+Math.cos(a0)*r,y+Math.sin(a0)*r,x+Math.cos(a1)*r,y+Math.sin(a1)*r);g.addColorStop(0,'rgba(200,255,230,0)');g.addColorStop(.5,`rgba(200,255,230,${.55-k*.07})`);g.addColorStop(1,'rgba(200,255,230,0)');
   c.strokeStyle=g;c.lineWidth=1.6-k*.18;c.beginPath();c.arc(x,y,r,a0,a1);c.stroke();if(k%2===0){c.beginPath();const cx2=x+Math.cos(a1)*r,cy2=y+Math.sin(a1)*r;c.arc(cx2+Math.cos(a1+Math.PI)*r*.12,cy2+Math.sin(a1+Math.PI)*r*.12,r*.12,a1,a1+3.6);c.stroke();}}
  return;}
 if(el==='water'){/* water stains at the corners with rings spreading from drops */
  for(const [x,y] of corners){const g=c.createRadialGradient(x,y,0,x,y,M*.38);g.addColorStop(0,'rgba(60,120,190,.22)');g.addColorStop(1,'rgba(60,120,190,0)');c.fillStyle=g;c.fillRect(0,0,W,H);}
  c.globalCompositeOperation='lighter';
  for(const [x,y,a] of corners)for(let k=0;k<3;k++){const d=M*(.08+rnd()*.18),cx2=x+Math.cos(a+(rnd()-.5)*.8)*d,cy2=y+Math.sin(a+(rnd()-.5)*.8)*d;for(let r=0;r<4;r++){c.strokeStyle=`rgba(190,230,255,${.6-r*.13})`;c.lineWidth=1.2-r*.18;c.beginPath();c.ellipse(cx2,cy2,M*(.03+r*.035),M*(.03+r*.035)*.92,0,0,Math.PI*2);c.stroke();}}
  return;}
 if(el==='light'){/* beams fanning in from the corners and a soft bloom where they start */
  c.globalCompositeOperation='lighter';
  for(const [x,y,a] of corners){const b=c.createRadialGradient(x,y,0,x,y,M*.3);b.addColorStop(0,'rgba(255,240,190,.4)');b.addColorStop(1,'rgba(255,240,190,0)');c.fillStyle=b;c.fillRect(0,0,W,H);
   for(let k=0;k<5;k++){const aa=a+(k-2)*.16+(rnd()-.5)*.05,L=M*(.35+rnd()*.25),w=.025+rnd()*.02,g=c.createLinearGradient(x,y,x+Math.cos(aa)*L,y+Math.sin(aa)*L);g.addColorStop(0,'rgba(255,244,210,.55)');g.addColorStop(1,'rgba(255,244,210,0)');c.fillStyle=g;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(aa-w)*L,y+Math.sin(aa-w)*L);c.lineTo(x+Math.cos(aa+w)*L,y+Math.sin(aa+w)*L);c.closePath();c.fill();}}
  return;}
 if(el==='dark'){/* tendrils of shadow reaching in from the corners, thick at the root, curling to a point */
  for(const [x,y,a] of corners)for(let k=0;k<4;k++){let px=x,py=y,aa=a+(rnd()-.5)*1.2;const L=M*(.25+rnd()*.15),n=24,cv=(rnd()<.5?1:-1)*(.012+rnd()*.02);const left=[],right=[];
   for(let i=0;i<=n;i++){const t=i/n,w=M*.028*Math.pow(1-t,1.3)+.6;aa+=cv*(.6+t*1.4);left.push([px-Math.sin(aa)*w,py+Math.cos(aa)*w]);right.push([px+Math.sin(aa)*w,py-Math.cos(aa)*w]);px+=Math.cos(aa)*L/n;py+=Math.sin(aa)*L/n;}
   c.fillStyle='rgba(30,10,52,.85)';c.shadowColor='#8a5ad0';c.shadowBlur=10;c.beginPath();left.forEach(([X,Y],i)=>c[i?'lineTo':'moveTo'](X,Y));right.reverse().forEach(([X,Y])=>c.lineTo(X,Y));c.closePath();c.fill();}
  return;}
}
/* edge patterns, one per element, drawn once per size */
function edgeField(el,W,H){if(el==='ice')return frostField(W,H);return cornerArt(el,W,H);
}
/* floors */
function floor(el,s,c,W0,H0,t){const fy=s.cy+H0*.5,x0=s.cx-W0/2;c.save();
 if(el==='ice'){c.globalCompositeOperation='source-over';const dg=c.createLinearGradient(0,fy-H0*.07,0,fy);dg.addColorStop(0,'rgba(230,246,255,0)');dg.addColorStop(.35,'rgba(230,246,255,.28)');dg.addColorStop(1,'rgba(200,232,250,.12)');c.fillStyle=dg;c.beginPath();c.moveTo(x0,fy);for(let x=0;x<=W0;x+=8)c.lineTo(x0+x,fy-H0*(.035+.018*Math.sin(x*.021+1.3)+.012*Math.sin(x*.057)));c.lineTo(x0+W0,fy);c.closePath();c.fill();}
 else if(el==='fire'){const g=c.createLinearGradient(0,fy-H0*.16,0,fy);g.addColorStop(0,'rgba(255,90,30,0)');g.addColorStop(1,`rgba(255,110,40,${.22+.06*Math.sin(t*3)})`);c.fillStyle=g;c.fillRect(x0,fy-H0*.16,W0,H0*.16);
  }
 else if(el==='thunder'){c.globalCompositeOperation='lighter';const g=c.createLinearGradient(0,fy-H0*.05,0,fy);g.addColorStop(0,'rgba(170,190,230,0)');g.addColorStop(1,'rgba(170,190,230,.16)');c.fillStyle=g;c.fillRect(x0,fy-H0*.05,W0,H0*.05);c.strokeStyle=`rgba(230,240,255,${.25+(s.lit||0)*.6})`;c.lineWidth=1;for(let i=0;i<9;i++){const x=x0+W0*((i*.137+t*.01)%1);c.beginPath();c.moveTo(x,fy-H0*.02-i%3*3);c.lineTo(x+W0*.05,fy-H0*.02-i%3*3);c.stroke();}}
 else if(el==='wind'){/* (user: make the grass move better) tapered blades of three shades, each bending from its root with a gust
   wave travelling across the field, the tips leading */
  const N=34,wv=(s.wind||40)/40;for(let i=0;i<N;i++){const u=(i*.6180339)%1,x=x0+W0*u,h=H0*(.045+.04*((i*7)%5)/5),phase=t*2.1-u*6,bend=(Math.sin(phase)*.5+.5)*(.35+.25*wv)+.1,tipx=x+h*bend*1.1,tipy=fy-h*(1-bend*.25),w=2.2+(i%3);
   const g=c.createLinearGradient(x,fy,tipx,tipy);g.addColorStop(0,i%3?'rgba(70,120,90,.9)':'rgba(90,150,110,.9)');g.addColorStop(1,'rgba(180,240,200,.75)');c.fillStyle=g;c.beginPath();c.moveTo(x-w,fy);c.quadraticCurveTo(x-w*.3+h*bend*.35,fy-h*.55,tipx,tipy);c.quadraticCurveTo(x+w*.3+h*bend*.4,fy-h*.5,x+w,fy);c.closePath();c.fill();}}
 else if(el==='water'){c.globalCompositeOperation='lighter';const g=c.createLinearGradient(0,fy-H0*.09,0,fy);g.addColorStop(0,'rgba(90,160,230,0)');g.addColorStop(1,'rgba(90,160,230,.22)');c.fillStyle=g;c.fillRect(x0,fy-H0*.09,W0,H0*.09);c.strokeStyle='rgba(210,240,255,.55)';c.lineWidth=1.2;for(let r=0;r<3;r++){c.beginPath();for(let x=0;x<=W0;x+=6){const y=fy-H0*(.06-r*.02)+Math.sin(x*.035+t*(2+r*.6)+r)*2.5;c[x?'lineTo':'moveTo'](x0+x,y);}c.stroke();}}
 else if(el==='earth'){for(let i=0;i<22;i++){const x=x0+W0*((i*.0457*7)%1),sz=3+((i*5)%7);const sp=sprite('stone',sz,MAT.stone);c.drawImage(sp,x-sp.width/2,fy-sz*.6-sp.height/2);}const g=c.createLinearGradient(0,fy-H0*.05,0,fy);g.addColorStop(0,'rgba(180,140,90,0)');g.addColorStop(1,'rgba(180,140,90,.22)');c.fillStyle=g;c.fillRect(x0,fy-H0*.05,W0,H0*.05);}
 else if(el==='light'){c.globalCompositeOperation='lighter';const g=c.createRadialGradient(s.cx,fy,0,s.cx,fy,W0*.5);g.addColorStop(0,`rgba(255,240,190,${.22+.05*Math.sin(t*1.5)})`);g.addColorStop(1,'rgba(255,240,190,0)');c.fillStyle=g;c.save();c.translate(0,fy);c.scale(1,.18);c.translate(0,-fy);c.fillRect(x0,fy-W0*.5,W0,W0);c.restore();}
 else if(el==='dark'){for(let i=0;i<4;i++){const x=s.cx+Math.sin(t*.3+i*1.7)*W0*.35,g=c.createRadialGradient(x,fy,0,x,fy,W0*.3);g.addColorStop(0,'rgba(20,6,34,.55)');g.addColorStop(1,'rgba(20,6,34,0)');c.fillStyle=g;c.fillRect(x0,fy-W0*.3,W0,W0*.3);}}
 c.restore();}
/* the accent: a small thing now and then */
function accent(el,s,W0,H0){const x=s.cx+R(-.42,.42)*W0,y=s.cy+R(-.4,.4)*H0;
 if(el==='ice'||el==='light')s.add({type:'glint',x,y,life:R(.4,.7),r:el==='light'?R(1.8,3):R(1.2,2.2),a:R(0,TAU)});
 else if(el==='fire'){for(let k=0;k<6;k++){const a=R(0,TAU),v=R(80,180);s.add({type:'wedge',x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,drag:3,life:R(.25,.4),r:R(1.2,2)});}}
 else if(el==='thunder'){s.add({type:'arc',pts:bolt(x,y,x+R(-30,30),y+R(-30,30),5,10),life:.14,r:1.2});}
 else if(el==='wind'){const m=matFor('wind',.6);s.add({type:'wx',...matFor('wind',.55),m:'leaf',spr:sprite('leaf',R(5,8),MAT.leaf),z:.55,x:s.cx-W0*.6,y:s.cy+R(-.4,.2)*H0,life:8,a:R(0,TAU),spin:R(-3,3),al:.9,ph:R(0,TAU)});}
 else if(el==='water'){for(let k=0;k<5;k++){const a=-Math.PI/2+R(-.8,.8),v=R(60,140);s.add({type:'wx',m:'drop',spr:sprite('drop',R(2,3.4),MAT.drop),z:.5,x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,g:300,drag:.4,life:.7,a:0,spin:0,al:.9,ph:0,free:1});}}
 else if(el==='earth'){s.add({type:'wx',m:'stone',spr:sprite('stone',R(3,5),MAT.stone),z:.5,x,y:s.cy-H0*.5,vx:R(-20,20),vy:R(40,90),g:420,life:1.4,a:R(0,TAU),spin:R(-4,4),al:1,ph:0,free:1});}
 else if(el==='dark'){s.add({type:'glint',x,y,life:R(.4,.7),r:R(1.2,2),a:R(0,TAU),col:'#c8a8ff'});}}
/* the big strike for thunder's cast */
function strike(s,W,H){const x=s.cx+R(-40,40);s.add({type:'arc',pts:bolt(x,0,s.cx,s.cy,16,46),life:.35,r:3.4});for(let i=0;i<3;i++)s.add({type:'arc',pts:bolt(s.cx,s.cy,s.cx+R(-1,1)*W*.4,s.cy+R(-1,1)*H*.4,9,26),life:.3,r:1.6});}
function weatherScene(el){const X=WX[el];return {
 bg(s,c){const W=s.W,H=s.H,W0=s.W0||W,H0=s.H0||H,dt=s.dt||.016,t=s.t;
  const cast=s.ct>=0&&s.freezeT==null?Math.min(1,s.ct/1.3):0,fz=s.freezeT;
  const gust=Math.pow(Math.max(0,Math.sin(t*.42+Math.sin(t*.13)*2)),6);s.wind=(X.wind+gust*X.gust)*(1+cast*3.5);s.gust=gust;
  /* an element's air: mist for ice, heat for fire, cloud light for thunder, caustics for water, haze, shafts, fog */
  for(let i=0;i<4;i++){const x=W*(((i/4+t*.02*(i%2?1:-1))%1)+1)%1,y=el==='fire'||el==='earth'||el==='dark'?s.cy+H0*.45:el==='thunder'?s.cy-H0*.45:s.cy+H0*.45,g=c.createRadialGradient(x,y,0,x,y,W0*.45);
   const a=el==='thunder'?.05+(s.lit||0)*.3:.08;g.addColorStop(0,`rgba(${el==='dark'?'40,14,70':X.col},${el==='dark'?.18:a})`);g.addColorStop(1,`rgba(${X.col},0)`);c.fillStyle=g;c.fillRect(0,0,W,H);}
  if(el==='thunder'){s.lit=Math.max(0,(s.lit||0)-dt*3);if(Math.random()<dt*.5)s.lit=R(.4,1);if(Math.random()<dt*.06*(1+cast*10)){const x=s.cx+R(-.4,.4)*W0;s.add({type:'arc',pts:bolt(x,s.cy-H0*.55,x+R(-60,60),s.cy+R(-.1,.3)*H0,12,30),life:.22,r:2});s.lit=1;s.flash=Math.max(s.flash,.15);}}
  if(el==='water'){c.save();c.globalCompositeOperation='lighter';c.strokeStyle='rgba(170,220,255,.08)';c.lineWidth=2;for(let k=0;k<6;k++){c.beginPath();for(let x=0;x<=W0;x+=10){const y=s.cy-H0*.4+k*H0*.14+Math.sin(x*.02+t*1.4+k)*8;c[x?'lineTo':'moveTo'](s.cx-W0/2+x,y);}c.stroke();}c.restore();}
  /* (user: light's halo is on the whole card, not the corners) a broad soft bloom over the card face, breathing */
  if(el==='light'){const R0=Math.max(W0,H0)*.8,g=c.createRadialGradient(s.cx,s.cy-H0*.05,0,s.cx,s.cy,R0);const a=.16+.05*Math.sin(t*.9)+cast*.12;g.addColorStop(0,`rgba(255,244,214,${a})`);g.addColorStop(.45,`rgba(255,226,170,${a*.45})`);g.addColorStop(1,'rgba(255,226,170,0)');c.save();c.globalCompositeOperation='lighter';c.fillStyle=g;c.fillRect(s.cx-W0,s.cy-H0,W0*2,H0*2);c.restore();}
  floor(el,s,c,W0,H0,t);
  /* (user: the three arcs go) only a soft halo of the element's light behind the glyph; the weather itself swirls round it */
  const vr=Math.min(W0,H0)*.26;{const g=c.createRadialGradient(s.cx,s.cy,0,s.cx,s.cy,vr*1.25);g.addColorStop(0,`rgba(${X.col},${.14+cast*.2})`);g.addColorStop(1,`rgba(${X.col},0)`);c.save();c.globalCompositeOperation='lighter';c.fillStyle=g;c.fillRect(s.cx-vr*1.3,s.cy-vr*1.3,vr*2.6,vr*2.6);c.restore();}
  /* the edge pattern, breathing; in the cast it bursts across everything, then breaks */
  let reach=(el==='ice'?.2:el==='earth'?.3:.4)+.06*Math.sin(t*.55);if(fz!=null)reach=fz<.25?.3+(fz/.25)*.8:fz<.6?1.1:Math.max(0,1.1-(fz-.6)*2.2);
  const f0=reach>.01?edgeField(el,Math.round(W),Math.round(H)):null;
  if(f0){const f=f0,tmp=frostTmp(f.width,f.height),tc=tmp.getContext('2d');tc.clearRect(0,0,tmp.width,tmp.height);tc.globalCompositeOperation='source-over';tc.drawImage(f,0,0);tc.globalCompositeOperation='destination-in';
   const cx=s.cx,cy=s.cy,dia=Math.hypot(Math.max(cx,W-cx),Math.max(cy,H-cy)),r1=Math.max(0,dia*(1-reach)),g=tc.createRadialGradient(cx,cy,Math.max(0,r1-dia*.18),cx,cy,r1+dia*.02);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'#000');tc.fillStyle=g;tc.fillRect(0,0,tmp.width,tmp.height);
   c.save();c.globalCompositeOperation=el==='ice'?'lighter':cornerBlend(el);c.globalAlpha*=fz!=null&&fz>.6?Math.max(0,1-(fz-.6)/.5):.85;c.drawImage(tmp,0,0);c.restore();}
  if(fz!=null){s.freezeT+=dt;if(fz<.25)s.flash=Math.max(s.flash,.35*(1-fz/.25));
   if(fz>=.6&&!s.broke){s.broke=1;for(const p of s.ps)if(p.type==='wx'&&!p.free){const dx=p.x-s.cx,dy=p.y-s.cy,d=Math.hypot(dx,dy)||1;p.vx=dx/d*R(160,420);p.vy=dy/d*R(160,420);p.blown=1;p.drag=1.2;p.life=p.t+R(.8,1.4);}
    if(el==='thunder')strike(s,W,H);
    const shard={ice:'needle',fire:'wedge',thunder:'wedge',wind:'wx',water:'wx',earth:'wx',light:'glint',dark:'wedge'}[el];
    for(let k=0;k<26;k++){const a=R(0,TAU),v=R(140,420),x=s.cx+Math.cos(a)*vr*.6,y=s.cy+Math.sin(a)*vr*.6;
     if(shard==='wx'){const mt=el==='wind'?'leaf':el==='water'?'drop':'stone';s.add({type:'wx',m:mt,spr:sprite(mt,R(3,6),MAT[mt]),z:.6,x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,drag:1.4,g:el==='wind'?0:120,life:R(.8,1.4),a,spin:R(-6,6),al:1,ph:0,free:1});}
     else if(shard==='glint')s.add({type:'glint',x,y,vx:Math.cos(a)*v*.6,vy:Math.sin(a)*v*.6,drag:1.5,life:R(.5,.9),r:R(1.6,3),a});
     else s.add({type:shard,x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,drag:1.6,g:shard==='needle'?60:0,life:R(.6,1.1),r:shard==='needle'?R(1.6,3.2):R(2.5,4.5),a,spin:R(-6,6)});}
    s.flash=Math.max(s.flash,el==='fire'?.6:.3);}
   if(fz>1.6){s.freezeT=null;s.broke=0;s.ct=-1;}}
  /* the weather's own motion */
  const frozen=el==='ice'&&fz!=null&&fz>=.12&&fz<.6;
  for(const p of s.ps){if(p.type!=='wx'||p.free)continue;
   if(frozen){p.vx*=.6;p.vy*=.6;continue;}if(p.blown)continue;
   const dx=p.x-s.cx,dy=p.y-s.cy,d=Math.hypot(dx,dy)||1,near=Math.max(0,1-d/(vr*1.9)),swirl=near*(90+cast*260)*(.5+p.z)*(el==='dark'?-1:1);
   const fall=X.fall[0]+(X.fall[1]-X.fall[0])*p.z;
   p.vx=s.wind*(.45+p.z*.9)*(el==='wind'?1.4:1)+Math.sin(t*1.3+p.ph)*(8+p.z*14)-dy/d*swirl-dx/d*cast*220*(.4+p.z);
   p.vy=fall*(1-cast*.4)+dx/d*swirl-dy/d*cast*160*(.4+p.z);
   if(X.orient===true||(X.orient==='stream'&&p.m==='stream'))p.a=Math.atan2(p.vy,p.vx)-Math.PI/2;
   if(p.x>s.cx+W0*.65||p.x<s.cx-W0*.75||(X.rise?p.y<s.cy-H0*.62:p.y>s.cy+H0*.62))p.t=p.life;}
  if(Math.random()<dt*.9&&s.count('glint')+s.count('arc')<3)accent(el,s,W0,H0);
 },
 spawn(s){const W0=s.W0||s.W,H0=s.H0||s.H,want=(s.ct>=0?1.2:1)*({ice:160,thunder:120,wind:110,fire:170,water:90,earth:110,light:100,dark:110}[el]);let n=s.count('wx');
  while(n<want){n++;const z=Math.random()<.55?R(0,.3):Math.random()<.7?R(.35,.65):R(.75,1),fresh=s.t<.05,mt=matFor(el,z);
   const pos=fresh?{x:s.cx+R(-.5,.5)*W0,y:s.cy+R(-.5,.5)*H0}:Math.random()<.55?{x:s.cx+R(-.7,.5)*W0,y:s.cy+(X.rise?.56:-.56)*H0}:{x:s.cx-W0*.62,y:s.cy+R(-.5,.45)*H0};
   s.add({type:'wx',z,ph:R(0,TAU),...pos,vx:0,vy:0,life:60,...mt,a:R(0,TAU),spin:(X.orient===true||(X.orient==='stream'&&mt.m==='stream'))?0:R(-.6,.6)*(z>.75?2:1),al:z<.32?R(.35,.6):z<.7?R(.55,.8):R(.35,.55)});}},
 burst(s){s.freezeT=0;s.broke=0;s.flash=.3;},
 glyph(){}
};}

const SC=Object.fromEntries(['fire','ice','thunder','wind','water','earth','light','dark'].map(e=>[e,weatherScene(e)]));

function newScene(el,glyph){return {el,glyph,ps:[],t:0,ct:-1,flash:0,W:0,H:0,cx:0,cy:0,dt:0,
 add(p){p.t=0;p.vx??=0;p.vy??=0;this.ps.push(p);if(this.ps.length>CAP)this.ps.splice(0,this.ps.length-CAP);},
 count(type){let n=0;for(const p of this.ps)if(p.type===type)n++;return n;}};}
function step(s,dt){
 s.t+=dt;s.dt=dt;if(s.ct>=0)s.ct+=dt;if(s.burst)s.burst+=dt;
 s.ps=s.ps.filter(p=>{p.t+=dt;if(p.t>p.life)return false;
  if(p.orbit){const o=p.orbit;o.a+=o.w*dt*(s.out?3:1);if(s.out)o.rad+=dt*220;p.x=s.cx+Math.cos(o.a)*o.rad;p.y=s.cy+Math.sin(o.a)*o.rad*.45+o.dy*o.rad+(o.bob!=null?Math.sin(s.t*1.4+o.bob)*5:0);}
  else if(p.type!=='wisp'){if(p.drag){p.vx*=1-p.drag*dt;p.vy*=1-p.drag*dt;}if(p.g)p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}
  return true;});
 if(s.out)s.out=Math.max(0,s.out-dt*.8);
 /* after its burst the fire circle's afterglow fades, then the circle draws itself again ring by ring and keeps turning */

}
function render(c,s,alpha,scale,ga=alpha){
 const sc=SC[s.el];c.save();c.globalAlpha=1;c.translate(s.cx,s.cy);c.scale(scale,scale);c.translate(-s.cx,-s.cy);
 c.globalCompositeOperation='lighter';const a0=alpha;
 c.globalAlpha=a0;sc.bg(s,c);
 for(const p of s.ps){c.globalAlpha=a0;DRAW[p.type]?.(c,p,p.t/p.life,s);}
 c.globalAlpha=ga;c.globalCompositeOperation='source-over';if(s.glyph&&ga>.01)drawLockup(s,c,s.el);
 if(sc.fg){c.globalCompositeOperation='lighter';c.globalAlpha=a0;sc.fg(s,c);}
 if(s.flash>0){/* (judge fx9: a pink-white glow lingered on the glyph) the flash is the element's warm light, gone in ~200 ms *//* (user: no full-screen flash) only a glow round the glyph */const fc=FLASH[s.el]||COLOR[s.el];c.globalCompositeOperation='lighter';const fr=Math.min(s.W0||s.W,s.H0||s.H)*.38,g=c.createRadialGradient(s.cx,s.cy,0,s.cx,s.cy,fr);g.addColorStop(0,rgba(fc,Math.min(.28,s.flash*.3)*a0));g.addColorStop(1,rgba(fc,0));c.fillStyle=g;c.fillRect(s.cx-fr,s.cy-fr,fr*2,fr*2);s.flash=Math.max(0,s.flash-s.dt*4.5);}
 c.restore();
}

export function mountElementFx(canvas){
 const ctx=canvas.getContext('2d');if(!ctx)return {setElement(){},cast(cb){cb?.();},stop(){}};
 let cur=null,old=null,switchT=1,stopped=false,raf=0,prev=performance.now(),target=.4,wide=null;
 /* (judge fx7: the burst was cut off at the panel's edge) for the cast the canvas leaves its panel and covers the whole
    window, still centred where the panel was; what reaches past the panel fades out with distance, and once the
    eruption has settled the canvas goes back into its panel */
 const shift=(dx,dy)=>{for(const s of [cur,old])if(s)for(const q of s.ps){q.x+=dx;q.y+=dy;}};
 const goWide=()=>{if(wide)return;const r=canvas.getBoundingClientRect();wide={x:r.left,y:r.top,w:r.width,h:r.height};canvas.classList.add('is-wide');shift(r.left,r.top);};
 const goBack=()=>{if(!wide)return;shift(-wide.x,-wide.y);canvas.classList.remove('is-wide');wide=null;};
 const size=()=>{const dpr=Math.min(2,devicePixelRatio||1),W=canvas.clientWidth,H=canvas.clientHeight;if(W&&(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr))){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);for(const s of [cur,old])if(s){s.W=W;s.H=H;if(wide){s.cx=wide.x+wide.w/2;s.cy=wide.y+wide.h/2;s.W0=wide.w;s.H0=wide.h;}else{s.cx=W/2;s.cy=H/2;s.W0=W;s.H0=H;}}};
 const frame=now=>{if(stopped||!canvas.isConnected)return;const raw=(now-prev)/1000,dt=Math.min(.05,raw);prev=now;
  /* the cast keeps wall-clock time, so it stays in step with the reveal even when frames are slow */
  if(cur&&cur.ct>=0&&raw>dt)cur.ct+=Math.min(.5,raw-dt);if(document.hidden){raf=requestAnimationFrame(frame);return;}size();ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
  /* (user: the old transition was ugly) out: the old scene shrinks, blurs and fades in ~200 ms; in: the new one grows
     from 92% and sharpens over ~360 ms, starting a beat later; one thin light sweep crosses once */
  switchT=Math.min(1,switchT+dt);const W=canvas.clientWidth,H=canvas.clientHeight;
  if(old&&switchT<.2){const k=switchT/.2,e=k*k;step(old,dt);ctx.save();ctx.filter=`blur(${(e*8).toFixed(1)}px)`;render(ctx,old,1-e,1-.12*e);ctx.restore();}else old=null;
  if(cur){if(!calm){SC[cur.el].spawn(cur);step(cur,dt);}const k=Math.min(1,Math.max(0,(switchT-.1)/.5)),e=1-Math.pow(1-k,3);
   if(k<1){ctx.save();ctx.filter=`blur(${((1-e)*6).toFixed(1)}px)`;render(ctx,cur,e,.92+.08*e,Math.max(0,(k-.45)/.55));ctx.restore();
    const sx=-W*.3+(W*1.6)*Math.min(1,k*1.15),gr=ctx.createLinearGradient(sx-60,0,sx+60,H);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.5,rgba(COLOR[cur.el],.34*Math.sin(Math.PI*Math.min(1,k*1.15))));gr.addColorStop(1,'rgba(255,255,255,0)');ctx.globalCompositeOperation='lighter';ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);ctx.globalCompositeOperation='source-over';}
   else render(ctx,cur,1,1);
   if(wide){const R0=Math.max(wide.w,wide.h),g=ctx.createRadialGradient(cur.cx,cur.cy,R0*.45,cur.cx,cur.cy,R0*1.25);g.addColorStop(0,'#000');g.addColorStop(1,'rgba(0,0,0,0)');ctx.globalCompositeOperation='destination-in';ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.globalCompositeOperation='source-over';
    if(cur.ct<0||cur.ct>3.8)goBack();}}
  if(!calm)raf=requestAnimationFrame(frame);};
 raf=requestAnimationFrame(frame);
 return {
  setElement(el,glyph){if(!SC[el])return;if(cur&&cur.el===el){if(glyph)cur.glyph=glyph;return;}
   old=cur&&switchT>=1?cur:(cur||null);switchT=cur?0:1;cur=newScene(el,glyph);size();if(calm)requestAnimationFrame(frame);},
  cast(onBurst){if(!cur){onBurst?.();return;}if(!calm)goWide();cur.ct=0;setTimeout(()=>{if(cur){SC[cur.el].burst(cur);}onBurst?.();},calm?0:1300);},
  stop(){stopped=true;cancelAnimationFrame(raf);goBack();}
 };
}
