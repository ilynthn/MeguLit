/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 2026-11-27 传火碑 meadow: a blue-hour lawn with fireflies, over the terrace and the round meadow before the west door.
   Slender blades in deep teal and sage; by day it is a cool, quiet lawn that sets off the warm stone. As the torches are lit the
   blade tips pick up a moonlit sheen, pale flowers glow faintly, and fireflies rise out of the grass round the hall, drifting and
   blinking (one points draw, additive, gone by day). Wind is a long slow swell; reduced motion stills it. The grass is one
   instanced draw, thinned with distance from where the camera walks, and stays out of the mirror pass. */
import * as THREE from './vendor/three/three.module.min.js';
import {mergeGeometries} from './vendor/three/addons/utils/BufferGeometryUtils.js';
import {MIRROR_LEVEL,MEADOW,torchGroundHeight} from './torch-ground.js';

export const MEADOW_TURF={dark:0x2f5040,green:0x5d8456,soil:0x4d4536,path:0x8d8270};

const rand=seed=>{const f=Math.sin(seed*127.1+311.7)*43758.5453123;return f-Math.floor(f);};
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
/* large slow patches, the same field the turf uses so blades and ground agree */
export function meadowPatch(x,z){
 return .5+.28*Math.sin(x*.13+1.7*Math.sin(z*.09))+.22*Math.cos(z*.17-x*.11+.6);
}

/* one blade: a tapered strip of `seg` segments that curls forward; aH is 0 at the root and 1 at the tip */
function blade(w,h,curl,seg){
 const pos=[],hs=[],idx=[];
 for(let i=0;i<=seg;i++){
  const t=i/seg,width=w*(1-Math.pow(t,1.6)),y=h*t,z=curl*t*t;
  if(i<seg){pos.push(-width/2,y,z,width/2,y,z);hs.push(t,t);}else{pos.push(0,y,z);hs.push(t);}
 }
 for(let i=0;i<seg;i++){const a=i*2,b=a+1,c=a+2,d=a+3;if(i<seg-1)idx.push(a,b,c,b,d,c);else idx.push(a,b,c);}
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('aH',new THREE.Float32BufferAttribute(hs,1));
 g.setIndex(idx);return g;
}
function upNormals(g){const n=new Float32Array(g.attributes.position.count*3);for(let i=0;i<n.length;i+=3)n[i+1]=1;g.setAttribute('normal',new THREE.BufferAttribute(n,3));return g;}

function clump(count,seed,{w,h,curl,seg,spread}){
 const parts=[];
 for(let i=0;i<count;i++){
  const s=seed+i*13,b=blade(w*(.8+rand(s)*.5),h*(.55+rand(s+1)*.6),curl*(.4+rand(s+2)),seg);
  b.rotateX(-(.05+rand(s+3)*.22));b.rotateY(rand(s+4)*Math.PI*2);
  const a=rand(s+5)*Math.PI*2,r=Math.sqrt(rand(s+6))*spread;b.translate(Math.cos(a)*r,0,Math.sin(a)*r);
  parts.push(b);
 }
 const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return upNormals(g);
}

/* wind in world space after the instance transform; uniforms are shared by every meadow material */
function sway(mat,uniforms,{base,tipLight,shimmer,sheen,glow=0}){
 mat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms,{uBase:{value:base},uTip:{value:new THREE.Color(tipLight)},uShimmer:{value:shimmer},uSheen:{value:new THREE.Color(sheen)},uGlow:{value:glow}});
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nattribute float aH;uniform float uTime,uWind;varying float vH,vGust;')
   .replace('#include <project_vertex>',`vec4 mvPosition=vec4(transformed,1.);
    vec3 root=vec3(0.);
    #ifdef USE_INSTANCING
     mvPosition=instanceMatrix*mvPosition;root=instanceMatrix[3].xyz;
    #endif
    float ph=dot(root.xz,vec2(.23,.15));
    float gust=.5+.5*sin(uTime*.4-ph*.35+.6*sin(root.z*.07));
    float flutter=sin(uTime*1.6-ph*1.7+root.x*1.7)*.22;
    float k=aH*aH*uWind;
    vec2 bend=vec2(.84,.54)*(gust*1.05+flutter)*k*.17;
    mvPosition.xz+=bend;mvPosition.y-=dot(bend,bend)*1.6;
    vH=aH;vGust=gust*uWind;
    mvPosition=modelViewMatrix*mvPosition;gl_Position=projectionMatrix*mvPosition;`);
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nuniform float uBase,uShimmer,uNight,uGlow;uniform vec3 uTip,uSheen;varying float vH,vGust;')
   .replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n normal=normalize(vNormal);')
   .replace('#include <color_fragment>',`#include <color_fragment>
    diffuseColor.rgb*=mix(uBase,1.,smoothstep(0.,.75,vH));
    diffuseColor.rgb=mix(diffuseColor.rgb,uTip,vH*vH*(.22+uShimmer*vGust));`)
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    totalEmissiveRadiance+=uSheen*uNight*(vH*vH*(.55+.45*vGust)+uGlow*step(.97,vH));`);
 };
 mat.customProgramCacheKey=()=>'meadow-c'+(glow?'g':'');
}

export function buildMeadow({hall,keep,low,skyFill,blocked,reduced}){
 const uniforms={uTime:{value:0},uWind:{value:reduced?0:1},uNight:{value:0}};
 const mat=keep(new THREE.MeshStandardMaterial({color:0xffffff,roughness:.92,side:THREE.DoubleSide}));
 sway(mat,uniforms,{base:.5,tipLight:0x9cc7a8,shimmer:.3,sheen:0x16304a});
 skyFill(mat,0x355a5e,.3);

 const geo=keep(clump(low?5:8,7,{w:.05,h:.5,curl:.2,seg:low?2:3,spread:.2}));
 /* scatter: jittered grid over the terrace and its slopes, thinning far from where the camera walks */
 const spots=[],step=low?.68:.46;
 for(let gx=-60;gx<=60;gx+=step)for(let gz=-30;gz<=132;gz+=step){
  const seed=Math.round(gx*1013+gz*7919);
  const x=gx+(rand(seed)-.5)*step*1.2,z=gz+(rand(seed+1)-.5)*step*1.2,y=torchGroundHeight(x,z);
  if(y<MIRROR_LEVEL+.36||blocked(x,z))continue;
  const far=Math.min(Math.hypot(x*.8,(z-44)*.9),Math.hypot(x-MEADOW.x,z-MEADOW.z)*.8),keepP=.92-.45*smooth(22,52,far)-.4*smooth(-3.85,-3.55,y);
  if(rand(seed+2)>keepP)continue;
  spots.push([x,y-.02,z,rand(seed+3)*Math.PI*2,(rand(seed+4)-.5)*.16,(rand(seed+5)-.5)*.16,.65+rand(seed+6)*.6]);
 }
 const grass=new THREE.InstancedMesh(geo,mat,spots.length),o=new THREE.Object3D(),c=new THREE.Color();
 const lush=new THREE.Color(0x3f8a66),sun=new THREE.Color(0x86a67a),shade=new THREE.Color(0x2c6a5a);
 spots.forEach((p,i)=>{
  o.position.set(p[0],p[1],p[2]);o.rotation.set(p[4],p[3],p[5]);o.scale.setScalar(p[6]);o.updateMatrix();grass.setMatrixAt(i,o.matrix);
  const patch=meadowPatch(p[0],p[2]),j=rand(i*3.1);
  c.copy(shade).lerp(lush,smooth(.15,.55,patch)).lerp(sun,smooth(.55,.95,patch)*.85);
  c.offsetHSL((j-.5)*.03,0,(j-.5)*.08);grass.setColorAt(i,c);
 });
 grass.instanceMatrix.needsUpdate=true;grass.instanceColor.needsUpdate=true;
 grass.castShadow=false;grass.receiveShadow=true;grass.name='Meadow grass';hall.add(grass);

 /* pale flowers in small drifts: their heads glow faintly once the torches are lit, and they sway with the grass */
 const head=[];
 for(let j=0;j<3;j++){const a=j*Math.PI*2/3;head.push(new THREE.SphereGeometry(.085,6,4).scale(1,1.25,1).translate(Math.cos(a)*.1,-j*.07,Math.sin(a)*.1));}
 const stem=new THREE.CylinderGeometry(.02,.03,1,3).translate(0,.5,0);
 const flower=mergeGeometries([stem.toNonIndexed(),...head.map(p=>(p.index?p.toNonIndexed():p).translate(0,1,0))]);
 head.forEach(p=>p.dispose());stem.dispose();
 { const p=flower.attributes.position,h=new Float32Array(p.count);for(let i=0;i<p.count;i++)h[i]=Math.min(1,p.getY(i));flower.setAttribute('aH',new THREE.BufferAttribute(h,1));}
 const flowerGeo=keep(upNormals(flower));
 const fmat=keep(new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8,side:THREE.DoubleSide}));
 sway(fmat,uniforms,{base:.55,tipLight:0xffffff,shimmer:0,sheen:0x7fb6ff,glow:.9});skyFill(fmat,0x8a8a9a,.32);
 const blooms=[],tints=[0xdfeeff,0xc5d6ff,0xeae2ff];
 for(let k=0;k<(low?110:270);k++){
  const seed=9000+k*17,cx=(rand(seed)-.5)*96,cz=-14+rand(seed+1)*130;
  const n=3+Math.floor(rand(seed+2)*6),tint=tints[k%3];
  for(let j=0;j<n;j++){
   const x=cx+(rand(seed+3+j)-.5)*1.6,z=cz+(rand(seed+9+j)-.5)*1.6,y=torchGroundHeight(x,z);
   if(y<MIRROR_LEVEL+.5||blocked(x,z))continue;
   blooms.push([x,y-.02,z,rand(seed+j)*6.28,.22+rand(seed+20+j)*.16,tint]);
  }
 }
 const fl=new THREE.InstancedMesh(flowerGeo,fmat,blooms.length);
 blooms.forEach((p,i)=>{o.position.set(p[0],p[1],p[2]);o.rotation.set(0,p[3],0);o.scale.setScalar(p[4]);o.updateMatrix();fl.setMatrixAt(i,o.matrix);fl.setColorAt(i,c.setHex(p[5]));});
 fl.instanceMatrix.needsUpdate=true;fl.instanceColor.needsUpdate=true;fl.castShadow=false;fl.receiveShadow=true;fl.name='Meadow flowers';hall.add(fl);

 /* fireflies: drift in slow loops just above the grass near the hall and blink; only drawn once the torches are lit */
 const flyCount=low?160:380,fp=new Float32Array(flyCount*3),fs=new Float32Array(flyCount*4);
 for(let i=0,n=0;n<flyCount&&i<flyCount*20;i++){
  const a=rand(i*5.3)*Math.PI*2,r=4+Math.sqrt(rand(i*7.1))*44,x=Math.cos(a)*r*.9,z=46+Math.sin(a)*r*1.3,y=torchGroundHeight(x,z);
  if(y<MIRROR_LEVEL+.5||blocked(x,z))continue;
  fp.set([x,y+.25+rand(i*2.9)*1.3,z],n*3);fs.set([rand(i*1.7)*6.28,.4+rand(i*3.3)*.8,.7+rand(i*4.1)*.6,rand(i*6.7)],n*4);n++;
 }
 const flyGeo=keep(new THREE.BufferGeometry());
 flyGeo.setAttribute('position',new THREE.BufferAttribute(fp,3));flyGeo.setAttribute('aSeed',new THREE.BufferAttribute(fs,4));
 const flyMat=keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  uniforms:{uTime:uniforms.uTime,uNight:uniforms.uNight,uPx:{value:1},uMove:{value:reduced?0:1}},
  vertexShader:`attribute vec4 aSeed;uniform float uTime,uNight,uPx,uMove;varying float vA;
   void main(){float t=uTime*aSeed.y*uMove+aSeed.x;
    vec3 p=position+vec3(sin(t*.7)*.9+sin(t*1.9)*.25,sin(t*1.1)*.35,cos(t*.6)*.9+cos(t*1.7)*.25);
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
    float blink=pow(.5+.5*sin(uTime*aSeed.z*1.3+aSeed.x*3.),3.);
    vA=uNight*(.25+.75*blink)*smoothstep(75.,12.,-mv.z);
    gl_PointSize=uPx*(1.+aSeed.w)*64./max(1.,-mv.z);}`,
  fragmentShader:`varying float vA;
   void main(){vec2 d=gl_PointCoord-.5;float r=length(d)*2.;float core=exp(-r*r*14.),halo=exp(-r*r*3.2)*.35;
    gl_FragColor=vec4(vec3(1.,.95,.6)*core*1.6+vec3(.7,1.,.4)*halo,1.)*vA;}`}));
 const flies=new THREE.Points(flyGeo,flyMat);flies.name='Fireflies';flies.frustumCulled=false;flies.renderOrder=3;hall.add(flies);

 return {grass,flowers:fl,flies,mirrorSkip:[grass,fl,flies],update(time,state,renderer){
  uniforms.uTime.value=time%1000;uniforms.uNight.value=state?state.torch:0;flies.visible=uniforms.uNight.value>.02;
  if(renderer)flyMat.uniforms.uPx.value=renderer.domElement.height/520;}};
}
