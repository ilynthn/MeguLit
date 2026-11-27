// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 传火碑 hall: an old European church in stone, all original geometry.
   A square bay with four great arches; over them pendentives, a drum of sixteen windows and a ribbed, coffered dome open to a lantern
   (the plan of the great domed churches); the east arch (behind the stele, -z) opens into an apse whose polygonal clerestory of
   stained-glass windows carries a coffered semidome; the side arches hold rose windows; the west arch leads down a coffered nave.
   Fluted black-violet marble columns with Attic bases and Corinthian capitals carry arcades; piers with engaged columns; full
   entablatures (architrave, carved frieze, dentil cornice). Iron torches on the piers and columns, two braziers by the stair.

   Light follows the PC's clock: the sun (or the moon) moves east → south → west and only gets in through the windows (shadows on
   the full tier), the sky light, glass, fog and exposure go through dawn / day / noon / afternoon / dusk / night / small hours,
   and the torches are lit from dusk to morning. Everything is interpolated, so the room changes as slowly as the day. */
import * as THREE from './vendor/three/three.module.min.js';
import {mergeGeometries} from './vendor/three/addons/utils/BufferGeometryUtils.js';
import {ashlar,relief,coffers,rose,lancet,quarries,marble,marbleHQ,floorHQ,inlay,glowSprite,basalt,basketRelief} from './torch-textures.js';
import {MIRROR_LEVEL,TERRACE,GROUND_BOUNDS,torchGroundHeight} from './torch-ground.js';
import {maps,isBakedTorchCanvas} from './torch-bake.js';
import {buildMeadow,MEADOW_TURF,meadowPatch} from './torch-meadow.js';

/* Twilight sky stays warm after sunset, but a sun below the horizon cannot cast direct light into the vault. */
export function directSunVisibility(el){const t=Math.max(0,Math.min(1,el/2));return t*t*(3-2*t);}

export const WEST_PORTAL={radius:2.15,spring:4.25,depth:.8};
export const HALL={HX:10,BACK:-6.5,FRONT:14.5,SPRING:9.3,NZ1:40,AX:13.2};

/* uv from local position, projected along the dominant normal axis (so stone blocks keep their size on any box or wall) */
function worldUV(g,scale,ox=0,oy=0){const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;if(!uv||!n)return g;
 for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));let u,v;
  if(ax>=ay&&ax>=az){u=p.getZ(i);v=p.getY(i);}else if(ay>=az){u=p.getX(i);v=p.getZ(i);}else{u=p.getX(i);v=p.getY(i);}uv.setXY(i,(u+ox)/scale,(v+oy)/scale);}
 uv.needsUpdate=true;return g;}
const scaleUV=(g,su,sv)=>{const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*su,uv.getY(i)*sv);uv.needsUpdate=true;return g;};

/* a wall w×h (bottom-left at the origin) with round-headed openings {x,y,w,h}, extruded d */
function wallWithArchesG(w,h,holes,d){const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(w,0);s.lineTo(w,h);s.lineTo(0,h);s.closePath();
 for(const o of holes){const p=new THREE.Path();p.moveTo(o.x,o.y);p.lineTo(o.x+o.w,o.y);p.lineTo(o.x+o.w,o.y+o.h-o.w/2);p.absarc(o.x+o.w/2,o.y+o.h-o.w/2,o.w/2,0,Math.PI,false);p.closePath();s.holes.push(p);}
 return new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false,curveSegments:16});}

/* ---------- column parts (built once, instanced) ---------- */
function flutedShaft(r,h,flutes=20){const g=new THREE.CylinderGeometry(r,r,h,flutes*5,10,true),p=g.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),y=p.getY(i),a=Math.atan2(x,z),t=(y+h/2)/h;
  const fl=Math.pow(.5+.5*Math.cos(a*flutes),.55),k=(1-.05*fl)*(1+.022*Math.sin(Math.PI*t)-.06*t);p.setX(i,x*k);p.setZ(i,z*k);}
 g.computeVertexNormals();return g;}
function lathe(points,scale,seg=48){return new THREE.LatheGeometry(points.map(([x,y])=>new THREE.Vector2(x*scale,y*scale)),seg);}
const arcPts=(cx,cy,r,a0,a1,n=10)=>{const o=[];for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n;o.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}return o;};
/* Attic base: torus, scotia, torus (radius 1 = the shaft radius) */
function atticBase(r){const pts=[[0,0],[1.36,0],...arcPts(1.28,.1,.1,-Math.PI/2,Math.PI/2,8),[1.18,.21],...arcPts(1.18,.29,.07,-Math.PI/2,-Math.PI*1.5,8).map(([x,y])=>[x+.0,y]),
 [1.13,.37],...arcPts(1.1,.43,.06,-Math.PI/2,Math.PI/2,8),[1.03,.5],[0,.5]];return lathe(pts,r);}
/* Corinthian capital: bell, astragal, two rows of acanthus leaves, corner volutes, abacus */
function acanthus(w,h,out){const g=new THREE.PlaneGeometry(1,1,6,10),p=g.attributes.position;
 for(let i=0;i<p.count;i++){const u=p.getX(i),v=p.getY(i)+.5;const width=Math.pow(Math.sin(Math.PI*Math.min(1,v*.92+.04)),.7)*(1-.25*v)*(1+.18*Math.sin(v*Math.PI*6)*v);
  let x=u*width*w,y=v*h,z=out*v*v+Math.abs(u)*-.04*w;if(v>.72){const c=(v-.72)/.28;z+=c*c*out*1.4;y-=c*c*h*.18;}
  z+=(1-Math.abs(u*2))*.05*w*Math.sin(v*Math.PI);p.setXYZ(i,x,y,z);}g.computeVertexNormals();return g;}
class Spiral extends THREE.Curve{constructor(r,turns){super();this.r=r;this.turns=turns;}getPoint(t,o=new THREE.Vector3()){const a=t*Math.PI*2*this.turns,rr=this.r*(1-t*.8);return o.set(0,Math.sin(a)*rr,Math.cos(a)*rr+this.r);}}
function corinthian(r){const parts=[];const bellH=r*2.1;
 parts.push(lathe([[0,0],[1.02,0],[1.02,.08],[1.0,.1],[1.05,.5],[1.18,1.2],[1.32,2.0],[1.35,2.1],[0,2.1]],r,40));
 parts.push(new THREE.TorusGeometry(r*1.04,r*.07,8,40).rotateX(Math.PI/2));
 for(let row=0;row<2;row++)for(let i=0;i<8;i++){const a=(i+row*.5)/8*Math.PI*2,lh=bellH*(row?.78:.5),lw=r*(row?.95:.85),L=acanthus(lw,lh,r*.42);
  L.translate(0,bellH*(row?.12:.04),r*(1.02+row*.06));L.rotateY(a);parts.push(L);}
 for(let i=0;i<4;i++){const v=new THREE.TubeGeometry(new Spiral(r*.26,1.6),40,r*.07,6,false);v.rotateY(Math.PI/4+i*Math.PI/2);v.translate(Math.sin(Math.PI/4+i*Math.PI/2)*r*1.25,bellH*.86,Math.cos(Math.PI/4+i*Math.PI/2)*r*1.25);parts.push(v);}
 const ab=new THREE.BoxGeometry(r*3.0,r*.32,r*3.0);ab.translate(0,bellH+r*.16,0);parts.push(ab);
 const ab2=new THREE.BoxGeometry(r*2.7,r*.12,r*2.7);ab2.translate(0,bellH-r*.02,0);parts.push(ab2);
 const flat=parts.map(p=>p.index?p.toNonIndexed():p),m=mergeGeometries(flat,false);parts.forEach(p=>p.dispose());flat.forEach(p=>p.dispose());return m;}

/* Byzantine basket capital (height 2.42 r, as the old one): a bowl that turns from round at the neck to square at the top, slightly
   swelling, carved all over (relief texture), on an astragal; and an impost block that widens to carry the arches */
function basketCapital(r){const M=24,N=64,hb=r*1.85,hi=r*.57,pos=[],uv=[],idx=[];
 for(let j=0;j<=M;j++){const t=j/M,p=2+Math.pow(t,1.5)*12,sm=t*t*(3-2*t),s=r*1.04*(1-sm)+r*1.5*sm+Math.sin(Math.PI*t)*r*.1;
  for(let i=0;i<=N;i++){const a=i/N*Math.PI*2,c=Math.cos(a),sn=Math.sin(a),k=Math.pow(Math.pow(Math.abs(c),p)+Math.pow(Math.abs(sn),p),-1/p);
   pos.push(c*k*s,t*hb,sn*k*s);uv.push(i/N*4,t);}}
 for(let j=0;j<M;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;idx.push(a,b,a+1,b,b+1,a+1);}
 const bowl=new THREE.BufferGeometry();bowl.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));bowl.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));bowl.setIndex(idx);bowl.computeVertexNormals();
 const neck=new THREE.TorusGeometry(r*1.04,r*.09,8,40).rotateX(Math.PI/2).translate(0,r*.04,0);
 const imp=new THREE.CylinderGeometry(r*1.86*Math.SQRT2,r*1.5*Math.SQRT2,hi,4,1).rotateY(Math.PI/4).translate(0,hb+hi/2,0);
 const slab=new THREE.BoxGeometry(r*3.9,r*.1,r*3.9).translate(0,hb+hi+r*.05-r*.1,0);
 const flat=g=>g.index?g.toNonIndexed():g;
 return {bowl:mergeGeometries([flat(bowl),flat(neck)]),impost:mergeGeometries([flat(imp),flat(slab)])};}

/* moulding profiles (x = out from the wall, y = up), extruded along a straight run */
function profileShape(pts){const s=new THREE.Shape();s.moveTo(pts[0][0],pts[0][1]);for(const q of pts.slice(1))if(q.length===4)s.quadraticCurveTo(q[0],q[1],q[2],q[3]);else s.lineTo(q[0],q[1]);s.closePath();return s;}
const CORNICE=[[0,0],[.1,0],[.1,.05],[.14,.05,.2,.16],[.24,.16],[.24,.2],[.46,.2],[.46,.36],[.5,.36],[.5,.4,.66,.54],[.68,.54],[.68,.6],[0,.6]];
const ARCHITRAVE=[[0,0],[.08,0],[.08,.22],[.12,.22],[.12,.46],[.16,.46],[.16,.62],[.2,.64],[.22,.7],[0,.7]];
const BASEMOLD=[[0,0],[.3,0],[.3,.3],[.26,.3,.24,.44],[.18,.46],[.16,.52],[0,.52]];
function run(profile,len){const g=new THREE.ExtrudeGeometry(profileShape(profile),{depth:len,bevelEnabled:false,curveSegments:8});return g;}

/* textures: one GPU upload per image (repeats get clones of the same source); a drawn canvas is emptied once it is on the GPU,
   unless it is marked keep (the stele face reuses the basalt as a pattern) */
function textureMaker(keep,maxAniso=8){const seen=new Map();
 return (c,srgb=true,rep=1,keepImage=false)=>{let base=seen.get(c);let x;
  if(base){x=keep(base.clone());}else{x=keep(new THREE.Texture(c));x.needsUpdate=true;seen.set(c,x);
   if(!keepImage&&!window.__TORCH_BAKE&&c instanceof HTMLCanvasElement&&!isBakedTorchCanvas(c))x.onUpdate=()=>{c.width=c.height=1;};}
  x.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;x.wrapS=x.wrapT=THREE.RepeatWrapping;x.anisotropy=maxAniso;x.repeat.set(rep,rep);return x;};}

/* marble palettes; HQ: full size when baking (tools/torch-bake.cjs), a quarter when a stale bake has to draw them on the spot */
/* violet: pavonazzo, an ivory marble veined in purple-grey (the theme's violet, in a stone real churches use) */
const PAL={violet:{ground:[228,220,208],vein:[112,86,108],hair:[178,164,168],tint:[146,106,116],k:2,warp:4.2,veinPow:16,hairAmt:.42},
 cream:{ground:[222,212,194],vein:[150,140,128],hair:[186,176,162],tint:[200,178,140],k:2,warp:3,veinPow:30,hairAmt:.35},
 floor:{ground:[182,178,188],vein:[118,110,130],hair:[150,144,160],tint:[170,150,120],k:2,warp:3.4,veinPow:32,hairAmt:.4}};
const HQ=()=>window.__TORCH_BAKE?1:.25;

/* ---------- the stele: a long black slab on two square posts, a wide low stair in front ---------- */
export function buildStele({scene,keep,tier}){const low=tier==='low',T=textureMaker(keep,low?4:16);
 const bas=maps('basalt',()=>basalt(512,37)),stoneW=maps('steleMarble',()=>marbleHQ(2048*HQ(),62,PAL.cream));
 const basaltBody=keep(new THREE.MeshPhysicalMaterial({map:T(bas.map,true,2,true),normalMap:T(bas.normal,false,2),normalScale:new THREE.Vector2(.12,.12),roughnessMap:T(bas.rough,false,2,true),
  roughness:1,metalness:0,clearcoat:low?0:1,clearcoatRoughness:.05,envMapIntensity:1}));
 const stepMat=keep(new THREE.MeshPhysicalMaterial({map:T(stoneW.map,true,.25),roughnessMap:T(stoneW.rough,false,.25),normalMap:T(stoneW.normal,false,.25),roughness:1,metalness:0,clearcoat:low?0:.6,clearcoatRoughness:.06,envMapIntensity:.7}));
 const inlayRed=keep(new THREE.MeshStandardMaterial({color:0x6e1222,roughness:.35,metalness:.05}));
 const gilt=keep(new THREE.MeshStandardMaterial({color:0xb48a4a,roughness:.3,metalness:.9,envMapIntensity:1.2}));
 const stele=new THREE.Group();scene.add(stele);
 const STEP_N=7,STEP_H=.085,SW=12.6,SH=3.2,SD=.44,POST_Y=STEP_N*STEP_H,BASE_Y=1.75;
 const mesh=(g,m,x,y,z,cast=true)=>{const o=new THREE.Mesh(keep(g),m);o.position.set(x,y,z);o.castShadow=cast;o.receiveShadow=true;stele.add(o);return o;};
 /* each step is a solid block to the floor with a rounded nosing and a small shadow line under it, extruded along its width */
 const stepUV=(g,sc)=>{const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
  let a,b;if(ay>=ax&&ay>=az){a=p.getX(i);b=p.getZ(i);}else if(ax>=az){a=p.getZ(i);b=p.getY(i);}else{a=p.getX(i);b=p.getY(i);}uv.setXY(i,a/sc,b/sc);}uv.needsUpdate=true;return g;};
 for(let i=0;i<STEP_N;i++){const w=15.6-i*.12,front=3.6-i*.36,back=-.9,top=STEP_H*(i+1),rn=.028;
  const sh=new THREE.Shape();sh.moveTo(-back,0);sh.lineTo(-(front-.012),0);sh.lineTo(-(front-.012),top-STEP_H+.012);sh.lineTo(-front,top-STEP_H+.02);sh.lineTo(-front,top-rn);sh.quadraticCurveTo(-front,top,-(front-rn),top);sh.lineTo(-back,top);sh.closePath();
  const g=new THREE.ExtrudeGeometry(sh,{depth:w,bevelEnabled:false,curveSegments:6});g.rotateY(Math.PI/2);g.translate(-w/2,0,0);stepUV(g,1);
  mesh(g,stepMat,0,0,0,i===STEP_N-1);}
 mesh(new THREE.BoxGeometry(15.62,.012,.03),gilt,0,.006,3.63,false);
  /* the slab sits along its whole length on a continuous base: plinth, moulded base, a dado divided by short pilasters into five sunk
     panels (gilt frame and rosette, front and back), a moulded cap with a red band */
  const rbox=(w,h,d,r)=>{const sh=new THREE.Shape(),x=w/2-r,y=h/2-r;sh.moveTo(-x,-y);sh.lineTo(x,-y);sh.lineTo(x,y);sh.lineTo(-x,y);sh.closePath();
   const g=new THREE.ExtrudeGeometry(sh,{depth:d-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:3,curveSegments:4});g.translate(0,0,-(d-2*r)/2);return stepUV(g,1);};
  /* Keep the same world-space scale on the base and steps. Offset the matching maps so the two stone cuts differ. */
  const baseMat=keep(stepMat.clone());
  for(const key of ['map','roughnessMap','normalMap']){
   baseMat[key]=keep(stepMat[key].clone());baseMat[key].offset.set(.31,.17);
  }
  baseMat.normalScale.set(.52,.52);
  { const L=SW+.7;let y=POST_Y;const part=(w,h,d,r,m=baseMat)=>{mesh(rbox(w,h,d,r),m,0,y+h/2,0);y+=h;};
   part(L+.5,.2,1.2,.02);part(L+.3,.07,1.04,.03);part(L+.2,.06,.98,.025);
   const dieH=BASE_Y-POST_Y-(.2+.07+.06)-(.06+.07+.1);part(L,dieH,.86,.012);
   /* Continuous carved vine friezes with gilt fillets above and below. */
   { const cy=y-dieH/2,fh=dieH*.58,rel=maps('plinthRelief',()=>relief(low?2048:4096,low?256:512,5,{normalStrength:low?7:14}));
     const carvedB=keep(new THREE.MeshStandardMaterial({map:T(rel.map),normalMap:T(rel.normal,false),color:0xe8e0d2,roughness:.7,metalness:0,normalScale:new THREE.Vector2(.82,.82),envMapIntensity:.4}));
     carvedB.map.repeat.set((L-.3)/(fh*8),1);carvedB.normalMap.repeat.set((L-.3)/(fh*8),1);
     for(const fz of [-1,1]){const z=fz*.432,ry=fz<0?Math.PI:0;
      const f=new THREE.Mesh(keep(new THREE.PlaneGeometry(L-.3,fh)),carvedB);f.name='Plinth carved frieze';f.position.set(0,cy,z);f.rotation.y=ry;f.receiveShadow=true;stele.add(f);
      for(const dy of [fh/2+.015,-fh/2-.015])mesh(new THREE.BoxGeometry(L-.26,.018,.016),gilt,0,cy+dy,z,false);}
   }
   part(L+.1,.06,.94,.02);part(L+.2,.07,1.0,.03,inlayRed);part(L+.3,.1,1.06,.035);}
 const s=new THREE.Shape(),w=SW,h=SH,b=.04;s.moveTo(-w/2+b,-h/2);s.lineTo(w/2-b,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+b);s.lineTo(w/2,h/2-b);s.quadraticCurveTo(w/2,h/2,w/2-b,h/2);
 s.lineTo(-w/2+b,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-b);s.lineTo(-w/2,-h/2+b);s.quadraticCurveTo(-w/2,-h/2,-w/2+b,-h/2);
 const g=new THREE.ExtrudeGeometry(s,{depth:SD-.06,bevelEnabled:true,bevelThickness:.03,bevelSize:.03,bevelSegments:3,curveSegments:6});g.translate(0,0,-(SD-.06)/2);
 const slab=mesh(g,basaltBody,0,BASE_Y+SH/2,0);
 /* the stele's light comes off its face and its outline: points just in front of the face and around the edge, in four groups along x */
 const emit=[[],[],[],[]],grp=x=>Math.max(0,Math.min(3,Math.floor((x+SW/2)/SW*4))),cy=BASE_Y+SH/2;
 for(let x=-SW/2+.45;x<=SW/2-.4;x+=.85){for(const dy of [-.95,0,.95])emit[grp(x)].push({x,y:cy+dy,z:SD/2+.25,w:.1});emit[grp(x)].push({x,y:BASE_Y+SH+.25,z:0,w:.08});emit[grp(x)].push({x,y:cy,z:-SD/2-.25,w:.05});}
 for(const sx of [-1,1])for(const dy of [-1.2,0,1.2])emit[grp(sx*SW/2*.99)].push({x:sx*(SW/2+.25),y:cy+dy,z:0,w:.08});
 return {stele,slab,SW,SH,SD,basaltBody,bas,emit};}

/* ---------- the hall ---------- */
export function buildHall({scene,keep,tex,tier,maxAniso=8}){
 const {HX,BACK,FRONT,SPRING,NZ1,AX}=HALL,R=HX,low=tier==='low',Q=low?.5:1,BAYZ=(BACK+FRONT)/2;
 const hall=new THREE.Group();scene.add(hall);
 const skipInMirror=[],noAO=[],castAll=[];
 const T=textureMaker(keep,maxAniso);

 /* ---- textures ---- */
 /* baked images when web/assets/torch matches this source (torch-bake.js), else drawn here */
 const ash=maps('ashlar',()=>ashlar(1024*Q,31)),ashDark=maps('ashlarDark',()=>ashlar(512*Q,47,{base:[120,110,104]})),rel=maps('relief',()=>relief(2048*Q,256*Q,5)),
  vault=maps('domeCoffers',()=>coffers(2048*Q,1024*Q,{cols:32,rows:5,v0:.03,v1:.96})),
  nave=maps('naveVault',()=>coffers(1024*Q,1024*Q,{cols:6,rows:6,v0:0,v1:1})),
  col=maps('violetMarble',()=>marbleHQ(2048*HQ(),23,PAL.violet)),pale=maps('paleMarble',()=>marbleHQ(1024*HQ(),61,PAL.cream)),
  fl=maps('floor',()=>floorHQ(4096*HQ(),11,PAL.floor)),roseTex=T(maps('rose',()=>({map:rose(1024*Q,3)})).map),quarryTex=T(maps('quarries',()=>({map:quarries(256*Q,512*Q,9)})).map),
  lanTex=T(maps('lancet',()=>({map:lancet(Math.round(512*HQ()*2),Math.round(1280*HQ()*2),13)})).map);
 const stone=keep(new THREE.MeshStandardMaterial({map:T(ash.map),normalMap:T(ash.normal,false),roughnessMap:T(ash.rough,false),roughness:1,metalness:0,envMapIntensity:.35}));
 const stoneDark=keep(new THREE.MeshStandardMaterial({map:T(ashDark.map),normalMap:T(ashDark.normal,false),roughnessMap:T(ashDark.rough,false),roughness:1,metalness:0,envMapIntensity:.25}));
 const carved=keep(new THREE.MeshStandardMaterial({map:T(rel.map),normalMap:T(rel.normal,false),roughness:.82,metalness:0,envMapIntensity:.3}));
 const smooth=keep(new THREE.MeshStandardMaterial({map:T(pale.map),color:0xf2ebe0,roughness:.74,metalness:0,envMapIntensity:.45}));
 const violet=keep(new THREE.MeshPhysicalMaterial({map:T(col.map),roughnessMap:T(col.rough,false),normalMap:T(col.normal,false),roughness:1,metalness:0,clearcoat:low?0:.35,clearcoatRoughness:.12,envMapIntensity:.7}));
 /* shafts are 1.7 m round and 5 m tall: three repeats up the height keep the veins in proportion */
 for(const k of ['map','roughnessMap','normalMap'])violet[k].repeat.set(1,3);
 /* every instance reads its own part of the texture (offset and scale from aPat); meshes without aPat read it as it is */
 violet.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <common>',`#include <common>
attribute vec3 aPat;`).replace('#include <uv_vertex>',`#include <uv_vertex>
  #ifdef USE_MAP
  vMapUv=vMapUv*(1.+aPat.z)+aPat.xy;
  #endif
  #ifdef USE_NORMALMAP
  vNormalMapUv=vNormalMapUv*(1.+aPat.z)+aPat.xy;
  #endif
  #ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv=vRoughnessMapUv*(1.+aPat.z)+aPat.xy;
  #endif`);};violet.customProgramCacheKey=()=>'violet-pattern';
 const capMat=keep(new THREE.MeshStandardMaterial({map:T(pale.map),color:0xefe6d6,roughness:.75,metalness:0,side:THREE.DoubleSide,envMapIntensity:.4}));
 const bask=maps('basketCapital',()=>basketRelief(1024,512,19));
 const basketMat=keep(new THREE.MeshStandardMaterial({map:T(bask.map),normalMap:T(bask.normal,false),roughness:.78,metalness:0,envMapIntensity:.4}));
 const gilt=keep(new THREE.MeshStandardMaterial({color:0xb48a4a,roughness:.32,metalness:.9,envMapIntensity:1.2}));
 const iron=keep(new THREE.MeshStandardMaterial({color:0x1c1a1e,roughness:.55,metalness:.85,envMapIntensity:.6}));
 const domeMat=keep(new THREE.MeshStandardMaterial({map:T(vault.map),normalMap:T(vault.normal,false),roughness:.85,metalness:0,side:THREE.BackSide,envMapIntensity:.3}));
 /* pendentives: plain stone, clipped to the square bay (shadows clipped too) */
 const vaultMat=keep(new THREE.MeshStandardMaterial({map:T(pale.map),color:0xe6ddcf,roughness:.86,metalness:0,side:THREE.BackSide,envMapIntensity:.3,
  clippingPlanes:[new THREE.Plane(new THREE.Vector3(1,0,0),HX+.6),new THREE.Plane(new THREE.Vector3(-1,0,0),HX+.6),new THREE.Plane(new THREE.Vector3(0,0,1),-BACK+.7),new THREE.Plane(new THREE.Vector3(0,0,-1),FRONT+.7)]}));
 vaultMat.clipShadows=true;
 const naveTex={map:T(nave.map),normal:T(nave.normal,false)};naveTex.map.repeat.set(5,4);naveTex.normal.repeat.set(5,4);
 const naveMat=keep(new THREE.MeshStandardMaterial({map:naveTex.map,normalMap:naveTex.normal,roughness:.85,side:THREE.BackSide,envMapIntensity:.3}));
 /* glass: one material per window. The pane darkens toward its frame (the reveal and the cames shade it), is a little brighter at
    the top (more sky), and its brightness follows the sky plus how squarely it faces the sun or moon (applyTime). Clear glass lets
    the sun through to the shadow map; stained glass does not. `spill` is the soft coloured light the pane throws on its reveal and wall. */
 const glassWins=[];
 const GLASS_VS=`varying vec2 vUv;
  void main(){
   vUv=uv;vec4 local=vec4(position,1.);
   #ifdef USE_INSTANCING
   local=instanceMatrix*local;
   #endif
   gl_Position=projectionMatrix*modelViewMatrix*local;
  }`;
 function glassMat(tex,{round=false,normal,clear=false,avg=new THREE.Color(1,1,1)}){
  const u={map:{value:tex},uTint:{value:new THREE.Color(1,1,1)},uBright:{value:1},uRound:{value:round?1:0},uAvg:{value:avg}};
  const m=keep(new THREE.ShaderMaterial({uniforms:u,side:THREE.DoubleSide,vertexShader:GLASS_VS,
   fragmentShader:`uniform sampler2D map;uniform vec3 uTint;uniform float uBright;uniform float uRound;varying vec2 vUv;
    void main(){vec3 t=texture2D(map,vUv).rgb;t=mix(vec3(dot(t,vec3(.2126,.7152,.0722))),t,.82);float e=uRound>.5?(.5-length(vUv-.5)):min(min(vUv.x,1.-vUv.x)*.55,min(vUv.y,1.-vUv.y));
     float frame=smoothstep(0.,.09,e);float grad=mix(.7,1.08,vUv.y);gl_FragColor=vec4(t*uTint*uBright*grad*(.3+.7*frame),1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`}));
  m.userData.glass=true;m.userData.clear=clear;glassWins.push({u,n:normal.clone().normalize(),clear});return m;}
 const spillTex=T(glowSprite(128,'rgba(255,255,255,.9)','rgba(255,255,255,.25)'));
 function spillMat(glassM){const g=glassM.uniforms;return keep(new THREE.ShaderMaterial({uniforms:{map:{value:spillTex},uTint:g.uTint,uBright:g.uBright,uAvg:g.uAvg},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,
  vertexShader:GLASS_VS,fragmentShader:`uniform sampler2D map;uniform vec3 uTint;uniform float uBright;uniform vec3 uAvg;varying vec2 vUv;void main(){float a=texture2D(map,vUv).r;gl_FragColor=vec4(uAvg*uTint*uBright*a*.05,1.);}`}));}
 const ROSE_AVG=new THREE.Color(.42,.26,.56),LANCET_AVG=new THREE.Color(.30,.26,.62);

 const add=(geo,mat,pos,rot,{cast=true,recv=true}={})=>{const m=new THREE.Mesh(keep(geo),mat);if(pos)m.position.set(...pos);if(rot)m.rotation.set(...rot);m.castShadow=cast;m.receiveShadow=recv;hall.add(m);return m;};
 /* Split the extrusion itself so the exterior cap is the only rendered surface at that depth. */
 function masonry(geometry,outward,pos,rot,exterior,interior){
  const source=geometry.attributes,caps=[],rest=[];
  for(let i=0;i<source.position.count;i+=3)(source.normal.getZ(i)*outward>.999?caps:rest).push(i);
  function section(triangles){
   const part=new THREE.BufferGeometry();
   for(const [name,attribute] of Object.entries(source)){
    const data=new Float32Array(triangles.length*3*attribute.itemSize);
    let at=0;
    for(const vertex of triangles){
     const first=vertex*attribute.itemSize;
     data.set(attribute.array.subarray(first,first+3*attribute.itemSize),at);at+=3*attribute.itemSize;
    }
    part.setAttribute(name,new THREE.BufferAttribute(data,attribute.itemSize));
   }
   return part;
  }
  add(section(rest),interior,pos,rot);
  geometry.dispose();
  return add(section(caps),exterior,pos,rot);
 }
 const inst=(geo,mat,list,{cast=true,pattern=false}={})=>{const m=new THREE.InstancedMesh(keep(geo),mat,list.length),o=new THREE.Object3D();
  if(pattern){const pr=new Float32Array(list.length*3),rr=(i,k)=>{const v=Math.sin((i+1)*12.9898+k*78.233)*43758.5453;return v-Math.floor(v);};
   for(let i=0;i<list.length;i++){pr[i*3]=rr(i,1);pr[i*3+1]=rr(i,2)*3;pr[i*3+2]=(rr(i,3)-.4)*.35;}m.geometry=keep(geo.clone());m.geometry.setAttribute('aPat',new THREE.InstancedBufferAttribute(pr,3));}
  list.forEach((p,i)=>{o.position.set(p[0],p[1],p[2]);o.rotation.set(p[4]||0,p[3]||0,p[5]||0);const s=p[6]||1;o.scale.set(s,s,s);o.updateMatrix();m.setMatrixAt(i,o.matrix);});
  m.instanceMatrix.needsUpdate=true;m.castShadow=cast;m.receiveShadow=true;hall.add(m);return m;};
 const box=(w,h,d)=>worldUV(new THREE.BoxGeometry(w,h,d),4);
 /* a run of moulding along a wall: side 'back' (faces +z at z), 'left' (faces +x at x), 'right' (faces -x at x) */
 const molding=(profile,len,side,at,y,mat=smooth,start=0)=>{const g=worldUV(run(profile,len),4);
  if(side==='back')return add(g,mat,[start+len,y,at],[0,-Math.PI/2,0]);
  if(side==='left')return add(g,mat,[at,y,start],[0,0,0]);return add(g,mat,[at,y,start+len],[0,Math.PI,0]);};
 const friezePlane=(len,h,mat=carved)=>scaleUV(new THREE.PlaneGeometry(len,h),len/(h*8),1);

 const nicheMat=keep(new THREE.MeshStandardMaterial({color:0x120e16,roughness:.95}));
 /* Exterior materials share the hall's stone textures, with a soft night lift only outside. */
 const facadeStone=keep(stone.clone()),exteriorTrim=keep(smooth.clone()),roofStone=keep(stoneDark.clone());
 roofStone.color.setHex(0xb0b8c4);
 const litExterior=[];
 function skyFill(mat,color,strength){
  mat.emissiveMap=mat.map;
  litExterior.push({mat,tint:new THREE.Color(color),strength});
 }
 skyFill(facadeStone,0x6f829b,.65);skyFill(exteriorTrim,0x8b7966,.42);skyFill(roofStone,0x536788,.52);

 /* ---- column kit ---- */
 const COL_R=.27,COL_H=5.0;
 const shaftG=flutedShaft(COL_R,COL_H),baseG=atticBase(COL_R),capG=basketCapital(COL_R),plinthG=(()=>{const w=COL_R*2.9,r=.025,sh=new THREE.Shape(),x=w/2-r;sh.moveTo(-x,-x);sh.lineTo(x,-x);sh.lineTo(x,x);sh.lineTo(-x,x);sh.closePath();
  const g=new THREE.ExtrudeGeometry(sh,{depth:.3-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:3});g.rotateX(-Math.PI/2);g.translate(0,-.15+r,0);return worldUV(g,4);})();
 const colZ=[];for(let z=BACK+2.6;z<NZ1-2;z+=1.7)if(Math.abs(z-(FRONT-.4))>1.6)colZ.push(z);
 const colP=[];for(const z of colZ)for(const sx of [-1,1])colP.push([sx*HX,0,z]);
 inst(plinthG,smooth,colP.map(p=>[p[0],.15,p[2]]));inst(new THREE.TorusGeometry(COL_R*1.36,.022,6,32).rotateX(Math.PI/2),smooth,colP.map(p=>[p[0],.305,p[2]]),{cast:false});inst(baseG,smooth,colP.map(p=>[p[0],.3,p[2]]));
 inst(shaftG,violet,colP.map(p=>[p[0],.3+COL_R*.5+COL_H/2,p[2]]),{pattern:true});{const at=colP.map(p=>[p[0],.3+COL_R*.5+COL_H,p[2]]);inst(capG.bowl,basketMat,at);inst(capG.impost,smooth,at);}
 const CAP_TOP=.3+COL_R*.5+COL_H+COL_R*2.1+COL_R*.32;

 /* ---- the four piers, each with an engaged column on its two faces toward the bay ---- */
 const piers=[];for(const sx of [-1,1])for(const z of [BACK+.9,FRONT-.4])piers.push([sx*(HX+.2),z]);
 for(const [px,pz] of piers){add(box(2.4,SPRING-.9,2.4),stone,[px,(SPRING-.9)/2+.5,pz]);
  add(box(2.9,.5,2.9),smooth,[px,.25,pz]);add(box(2.7,.18,2.7),smooth,[px,.59,pz]);add(box(2.9,.5,2.9),smooth,[px,SPRING-.15,pz]);add(box(3.1,.3,3.1),smooth,[px,SPRING+.25,pz]);}
 /* pilasters: flat, fluted, on the two faces of each pier toward the bay, rising from the pier's base to a capital that carries the
    pier's cornice (a pier is faced, not leaned against) */
 { const P0=.68,PTOP=SPRING-.4,CAPH=.42,PH=PTOP-CAPH-P0,PW=1.0,PD=.14,pil=[],caps=[],plinths=[],flutes=[];
   for(const [px,pz] of piers){const sx=Math.sign(px),inZ=pz<BAYZ?1:-1;
    pil.push([px-sx*(1.2+PD/2),P0+PH/2,pz,Math.PI/2]);caps.push([px-sx*(1.2+PD),PTOP-CAPH/2,pz,Math.PI/2]);plinths.push([px-sx*(1.2+PD/2+.02),P0-.1,pz,Math.PI/2]);
    pil.push([px,P0+PH/2,pz+inZ*(1.2+PD/2),0]);caps.push([px,PTOP-CAPH/2,pz+inZ*(1.2+PD),0]);plinths.push([px,P0-.1,pz+inZ*(1.2+PD/2+.02),0]);
    for(let f=-2;f<=2;f++){const o=f*.17;flutes.push([px-sx*(1.2+PD+.005),P0+PH/2,pz+o,Math.PI/2]);flutes.push([px+o,P0+PH/2,pz+inZ*(1.2+PD+.005),0]);}}
   inst(worldUV(new THREE.BoxGeometry(PW,PH,PD),4),violet,pil,{pattern:true});inst(new THREE.BoxGeometry(PW+.14,.2,PD+.1),smooth,plinths);
   inst(new THREE.BoxGeometry(.07,PH-.3,.012),keep(new THREE.MeshStandardMaterial({color:0x140c1a,roughness:.4,metalness:0})),flutes,{cast:false});
   /* capital: a moulded block with a band of carved leaves (the frieze relief) and an abacus */
   const capG=mergeGeometries([new THREE.BoxGeometry(PW+.08,CAPH*.62,.28).translate(0,-CAPH*.19,0),new THREE.BoxGeometry(PW+.26,CAPH*.18,.36).translate(0,CAPH*.21,0),
    new THREE.BoxGeometry(PW+.34,CAPH*.2,.4).translate(0,CAPH*.4,0)].map(g=>g.index?g.toNonIndexed():g));inst(capG,capMat,caps);}

 /* ---- side arcades over the colonnades: ashlar spandrels with moulded archivolts, then the entablature ---- */
 const A0=CAP_TOP,ENT=A0+1.25;
 for(const sx of [-1,1])for(const [z0,z1] of [[BACK+1.8,FRONT-1.6],[FRONT+.8,NZ1-1]]){const cz=colZ.filter(z=>z>z0-.01&&z<z1+.01);if(cz.length<2)continue;
  const s=new THREE.Shape(),r=(1.7-.62)/2;s.moveTo(cz[0]-.85,ENT);s.lineTo(cz[0]-.85,A0);
  for(let i=0;i<cz.length;i++){s.lineTo(cz[i]+.31,A0);if(i<cz.length-1)s.absarc(cz[i]+.85,A0,r,Math.PI,0,true);}
  s.lineTo(cz[cz.length-1]+.85,A0);s.lineTo(cz[cz.length-1]+.85,ENT);s.closePath();
  add(worldUV(new THREE.ExtrudeGeometry(s,{depth:.66,bevelEnabled:false,curveSegments:18}),4),stone,[sx*HX+.33,0,0],[0,-Math.PI/2,0]);
  const arcs=[];for(let i=0;i<cz.length-1;i++)arcs.push([sx*(HX-.34),A0,cz[i]+.85,Math.PI/2]);inst(new THREE.TorusGeometry(r+.06,.07,8,24,Math.PI),smooth,arcs);
  const side=sx<0?'left':'right',at=sx*(HX-.33),L=z1-z0+1.7;
  molding(ARCHITRAVE,L,side,at,ENT,smooth,z0-.85);add(friezePlane(L,1.0),carved,[sx*(HX-.36),ENT+1.2,(z0+z1)/2],[0,sx<0?Math.PI/2:-Math.PI/2,0],{cast:false});
  molding(CORNICE,L,side,at,ENT+1.7,smooth,z0-.85);
  const dent=[];for(let z=z0-.8;z<=z1+.8;z+=.3)dent.push([sx*(HX-.33-.31),ENT+1.98,z]);inst(new THREE.BoxGeometry(.14,.16,.15),smooth,dent);}
 const ENT_TOP=ENT+2.3;
 /* Aisle openings continue into deep exterior reveals. The inner niche backing stays in place. */
 const aisleLength=NZ1-BACK,aisleCenter=(BACK+NZ1)/2,outerX=AX+.5;
 const openings=[];
 for(let z=1.2;z<aisleLength-2;z+=3.4)openings.push({x:z,y:.9,w:1.5,h:4.2});
 for(const sx of [-1,1]){
  const aisle=worldUV(wallWithArchesG(aisleLength,ENT_TOP,openings,.58),4);
  masonry(aisle,-sx,[sx*AX+(sx>0?.58:0),0,BACK],[0,-Math.PI/2,0],facadeStone,stoneDark).name='Aisle exterior';
  const windowGlass=glassMat(quarryTex,{normal:new THREE.Vector3(sx,0,0),avg:LANCET_AVG});
  const panes=[],sills=[],lintels=[],mullions=[],supports=[];
  openings.forEach(({x,w,h,y},index)=>{
   const z=BACK+x+w/2;
   add(new THREE.PlaneGeometry(w,h),nicheMat,[sx*(AX+.3),y+h/2,z],[0,-sx*Math.PI/2,0],{cast:false});
   panes.push([sx*(AX+.36),y+h/2,z,sx*Math.PI/2]);
   sills.push([sx*(outerX+.12),y-.08,z]);
   lintels.push([sx*(outerX+.095),y+h-w/2,z,sx*Math.PI/2]);
   mullions.push([sx*(AX+.42),y+1.64,z]);
   if(index%2===0)supports.push(BACK+x-.85);
  });
  inst(new THREE.PlaneGeometry(1.5,4.2),windowGlass,panes,{cast:false});
  inst(box(.62,.19,1.89),exteriorTrim,sills);
  inst(new THREE.TorusGeometry(.82,.095,6,24,Math.PI),exteriorTrim,lintels);
  inst(box(.14,3.32,.083),exteriorTrim,mullions);
  supports.push(NZ1-1.25);
  for(const [depth,height,width,bottom,mat] of [[1.18,.68,1.27,0,facadeStone],[.93,2.55,1.04,.68,facadeStone],[.7,2.75,.85,3.23,facadeStone],[.48,1.62,.67,5.98,facadeStone],[.55,.24,.83,7.60,exteriorTrim]]){
   inst(box(depth,height,width),mat,supports.map(z=>[sx*(outerX+depth/2-.06),bottom+height/2,z]));
  }
  const basement=[[1.62,.31,-.13],[1.30,.17,.11],[.84,.15,.25]];
  for(const [width,height,y] of basement)add(box(width,height,aisleLength+.8),facadeStone,[sx*(outerX+.22),y,aisleCenter]);
  for(const [width,height,y] of [[.49,.25,ENT_TOP-.35],[.68,.16,ENT_TOP-.16],[.83,.17,ENT_TOP]])
   add(box(width,height,aisleLength+.32),exteriorTrim,[sx*(outerX+.11),y,aisleCenter]);
  const aisleRoof=new THREE.Shape();
  aisleRoof.moveTo(sx*(HX+.56),ENT_TOP+1.42);aisleRoof.lineTo(sx*(outerX+.52),ENT_TOP+.12);
  aisleRoof.lineTo(sx*(outerX+.52),ENT_TOP+.29);aisleRoof.lineTo(sx*(HX+.56),ENT_TOP+1.61);aisleRoof.closePath();
  add(worldUV(new THREE.ExtrudeGeometry(aisleRoof,{depth:aisleLength,bevelEnabled:false}),4),roofStone,[0,0,BACK]).name='Aisle roof';
  add(box(AX-HX+.8,.4,aisleLength),stoneDark,[sx*(HX+AX)/2,ENT-.1,aisleCenter]);
 }

 /* ---- four great arches with stepped archivolts; lunettes with rose windows on the sides ---- */
 const archBand=(r0,r1,d)=>{const s=new THREE.Shape();s.moveTo(r1,0);s.absarc(0,0,r1,0,Math.PI,false);s.lineTo(-r0,0);s.absarc(0,0,r0,Math.PI,0,true);s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false,curveSegments:64});g.translate(0,0,-d/2);return worldUV(g,4);};
 const SP=ENT_TOP;
 const bigArch=(pos,rot)=>{add(archBand(R-.05,R+.55,1.5),stone,pos,rot);add(archBand(R+.55,R+.75,1.2),smooth,pos,rot);add(archBand(R+.75,R+.9,.9),smooth,pos,rot);
  add(new THREE.TorusGeometry(R-.05,.1,8,64,Math.PI),smooth,pos,rot);};
 bigArch([0,SP,BACK]);bigArch([0,SP,FRONT]);
 const windows={},roseRadius=2.7,roseDepth=.5;
 const sideRoseGlass=new THREE.CircleGeometry(roseRadius+.16,96);
 const roseReveal=new THREE.Shape();roseReveal.absarc(0,0,roseRadius+.20,0,Math.PI*2,false);
 const roseBore=new THREE.Path();roseBore.absarc(0,0,roseRadius-.12,0,Math.PI*2,true);roseReveal.holes.push(roseBore);
 const revealDepth=roseDepth+.14;
 const sideRoseGasket=worldUV(new THREE.ExtrudeGeometry(roseReveal,{depth:revealDepth,bevelEnabled:false,curveSegments:48}).translate(0,0,-revealDepth/2),4);
 for(const sx of [-1,1]){bigArch([sx*HX,SP,BAYZ],[0,Math.PI/2,0]);
  const s=new THREE.Shape();s.moveTo(-R,0);s.absarc(0,0,R,Math.PI,0,true);s.closePath();const ry=4.6,rr=roseRadius;const h=new THREE.Path();h.absarc(0,ry,rr,0,Math.PI*2,true);s.holes.push(h);
  add(worldUV(new THREE.ExtrudeGeometry(s,{depth:roseDepth,bevelEnabled:false,curveSegments:48}),4),stone,[sx<0?-(HX+1.1):HX+.6,SP,BAYZ],[0,Math.PI/2,0]);
  { const gm=glassMat(roseTex,{round:true,normal:new THREE.Vector3(sx,0,0),avg:ROSE_AVG});add(sideRoseGlass,gm,[sx*(HX+.6+roseDepth/2),SP+ry,BAYZ],[0,Math.PI/2,0],{cast:false,recv:false}).name='Side rose glass';
   add(sideRoseGasket,stoneDark,[sx*(HX+.6+roseDepth/2),SP+ry,BAYZ],[0,Math.PI/2,0]).name='Side rose gasket';
   const sp=add(new THREE.PlaneGeometry(rr*3.4,rr*3.4),spillMat(gm),[sx*(HX+.08),SP+ry,BAYZ],[0,-sx*Math.PI/2,0],{cast:false,recv:false});sp.renderOrder=2;noAO.push(sp);}
  add(new THREE.TorusGeometry(rr+.08,.16,10,64),smooth,[sx*(HX+.5),SP+ry,BAYZ],[0,Math.PI/2,0]);add(new THREE.TorusGeometry(rr*.22,.08,8,32),smooth,[sx*(HX+.55),SP+ry,BAYZ],[0,Math.PI/2,0]);
  const spokes=[];for(let i=0;i<12;i++)spokes.push([sx*(HX+.55),SP+ry,BAYZ,Math.PI/2,i/12*Math.PI*2,0]);
  inst(new THREE.BoxGeometry(.07,rr*.78,.07).translate(0,rr*.61,0),smooth,spokes.map(p=>[p[0],p[1],p[2],0,0,0]).map((p,i)=>{const a=i/12*Math.PI*2;return [p[0],p[1],p[2],Math.PI/2,a,0];}),{cast:false});
  windows[sx<0?'north':'south']={pos:new THREE.Vector3(sx*(HX+.85),SP+ry,BAYZ),normal:new THREE.Vector3(sx,0,0),r:rr};}
 /* ---- the crossing: pendentives carry a ring; on it a drum of sixteen arched windows with paired pilasters; a ribbed, coffered dome
    with an open eye under a lantern (the sun walks round the drum through the day, the lantern lights the middle at noon) ---- */
 const VR=Math.hypot(HX,(FRONT-BACK)/2),RING=Math.sqrt(VR*VR-R*R),RING_Y=SP+RING;
 /* pendentives: the part of the sphere through the arch crowns that lies below the ring, clipped to the square bay */
 add(new THREE.SphereGeometry(VR,96,36,0,Math.PI*2,Math.acos(RING/VR),Math.PI/2-Math.acos(RING/VR)),vaultMat,[0,SP,BAYZ],null,{cast:true,recv:true});
 const shoulder=keep(facadeStone.clone());shoulder.clippingPlanes=vaultMat.clippingPlanes;shoulder.clipShadows=true;
 skyFill(shoulder,0x62738c,.54);
 const shoulderShell=worldUV(new THREE.SphereGeometry(VR+.07,72,24,0,Math.PI*2,Math.acos(RING/VR),Math.PI/2-Math.acos(RING/VR)),4);
 add(shoulderShell,shoulder,[0,SP,BAYZ]).name='Dome shoulders';
 const DRUM_N=16,DRUM_H=5.2,DRUM_Y=RING_Y+.55,drumPanel=2*R*Math.tan(Math.PI/DRUM_N),DW=1.3,DWH=3.3,DWY=.85;
 add(new THREE.CylinderGeometry(R+.9,R+.9,.55,64,1,true),stone,[0,RING_Y+.27,BAYZ]);
 add(new THREE.TorusGeometry(R+.05,.22,10,96).rotateX(Math.PI/2),smooth,[0,RING_Y+.1,BAYZ]);add(new THREE.TorusGeometry(R+.1,.12,8,96).rotateX(Math.PI/2),gilt,[0,RING_Y+.42,BAYZ],null,{cast:false});
 const panelWall=(w,h,holes,d)=>{const g=wallWithArchesG(w,h,holes,d);g.translate(-w/2,0,0);return worldUV(g,4);};
 const drum=[],pil=[],pilCap=[];
 for(let i=0;i<DRUM_N;i++){const a=(i+.5)/DRUM_N*Math.PI*2,cx=Math.sin(a),cz=Math.cos(a);
  add(panelWall(drumPanel,DRUM_H,[{x:drumPanel/2-DW/2,y:DWY,w:DW,h:DWH}],.8),stone,[cx*(R+.8),DRUM_Y,BAYZ+cz*(R+.8)],[0,a+Math.PI,0]);
  add(new THREE.PlaneGeometry(DW,DWH),glassMat(quarryTex,{normal:new THREE.Vector3(cx,0,cz),clear:true}),[cx*(R+.42),DRUM_Y+DWY+DWH/2,BAYZ+cz*(R+.42)],[0,a+Math.PI,0],{cast:false,recv:false});
  add(new THREE.TorusGeometry(DW/2+.07,.07,6,20,Math.PI),smooth,[cx*(R-.02),DRUM_Y+DWY+DWH-DW/2,BAYZ+cz*(R-.02)],[0,a+Math.PI,0]);
  drum.push({pos:new THREE.Vector3(cx*(R-.1),DRUM_Y+DWY+DWH*.55,BAYZ+cz*(R-.1)),n:new THREE.Vector3(cx,0,cz),r:.55,str:.85});
  /* paired pilasters at each corner of the polygon */
  const ca=a+Math.PI/DRUM_N,ccx=Math.sin(ca),ccz=Math.cos(ca),tx=Math.cos(ca),tz=-Math.sin(ca);
  for(const off of [-.34,.34]){pil.push([ccx*(R-.08)+tx*off,DRUM_Y+DRUM_H/2,BAYZ+ccz*(R-.08)+tz*off,ca]);pilCap.push([ccx*(R-.12)+tx*off,DRUM_Y+DRUM_H-.35,BAYZ+ccz*(R-.12)+tz*off,ca]);}}
 inst(worldUV(new THREE.BoxGeometry(.32,DRUM_H-.7,.18),4),stone,pil);inst(new THREE.BoxGeometry(.44,.26,.28),smooth,pilCap);
 add(new THREE.TorusGeometry(R+.02,.2,10,96).rotateX(Math.PI/2),smooth,[0,DRUM_Y+DRUM_H-.05,BAYZ]);
 add(new THREE.TorusGeometry(R,.09,8,96).rotateX(Math.PI/2),gilt,[0,DRUM_Y+DRUM_H+.2,BAYZ],null,{cast:false});
 /* dome: coffered between sixteen ribs, open at the top */
 const DOME_Y=DRUM_Y+DRUM_H+.25,EYE=1.6,th0=Math.asin(EYE/R);
 add(new THREE.SphereGeometry(R+.05,96,40,0,Math.PI*2,th0,Math.PI/2-th0),domeMat,[0,DOME_Y,BAYZ]);
 { const ribs=[];for(let i=0;i<DRUM_N;i++)ribs.push([0,DOME_Y,BAYZ,i/DRUM_N*Math.PI*2]);
   inst(new THREE.TorusGeometry(R-.06,.17,8,64,Math.PI/2-th0).rotateY(Math.PI/2),smooth,ribs.map(p=>[p[0],p[1],p[2],p[3]+Math.PI/2]),{cast:true});}
 const domeShell=worldUV(new THREE.SphereGeometry(R+.15,72,28,0,Math.PI*2,th0,Math.PI/2-th0),4);
 add(domeShell,roofStone,[0,DOME_Y,BAYZ]).name='Dome exterior';
 const domeRibs=Array.from({length:DRUM_N},(_,i)=>[0,DOME_Y,BAYZ,i/DRUM_N*Math.PI*2+Math.PI/2]);
 inst(new THREE.TorusGeometry(R+.14,.10,6,36,Math.PI/2-th0).rotateY(Math.PI/2),exteriorTrim,domeRibs);
 add(new THREE.TorusGeometry(R+.2,.21,8,72).rotateX(Math.PI/2),exteriorTrim,[0,DOME_Y+.05,BAYZ]);
 /* the eye and the lantern above it: a ring, eight slit windows, a small dome */
 const EYE_Y=DOME_Y+Math.cos(th0)*R;
 add(new THREE.TorusGeometry(EYE+.05,.16,10,48).rotateX(Math.PI/2),gilt,[0,EYE_Y,BAYZ],null,{cast:false});
 const lantern=[],lanternRadius=(EYE+.1)*Math.cos(Math.PI/8),lanternWidth=2*(EYE+.1)*Math.sin(Math.PI/8);
 const lanternSlit=panelWall(lanternWidth,3.2,[{x:(lanternWidth-.42)/2,y:.54,w:.42,h:2.1}],.12);
 for(let i=0;i<8;i++){
  const a=(i+.5)*Math.PI/4,x=Math.sin(a),z=Math.cos(a);
  add(lanternSlit,facadeStone,[x*lanternRadius,EYE_Y,BAYZ+z*lanternRadius],[0,a+Math.PI,0]);
  add(new THREE.PlaneGeometry(.42,2.1),glassMat(quarryTex,{normal:new THREE.Vector3(x,.4,z),clear:true}),
   [x*(lanternRadius-.05),EYE_Y+1.59,BAYZ+z*(lanternRadius-.05)],[0,a+Math.PI,0],{cast:false,recv:false});
  lantern.push({pos:new THREE.Vector3(x*(EYE-.2),EYE_Y+1.4,BAYZ+z*(EYE-.2)),n:new THREE.Vector3(x,.35,z).normalize(),r:.35,str:.6});
 }
 add(new THREE.TorusGeometry(EYE+.11,.095,7,48).rotateX(Math.PI/2),exteriorTrim,[0,EYE_Y+3.18,BAYZ]);
 add(new THREE.SphereGeometry(EYE+.1,32,12,0,Math.PI*2,0,Math.PI/2),keep(new THREE.MeshStandardMaterial({map:T(pale.map),color:0xcfc6b8,roughness:.9,side:THREE.DoubleSide})),[0,EYE_Y+3.2,BAYZ]);
 add(new THREE.RingGeometry(R-.1,R+1.2,64).rotateX(Math.PI/2),stone,[0,RING_Y+.54,BAYZ]);add(new THREE.RingGeometry(R-.1,R+1.2,64).rotateX(Math.PI/2),stone,[0,DOME_Y-.02,BAYZ]);
 windows.drum={list:drum};windows.lantern={list:lantern};
 /* coffered barrel vault down the nave, transverse ribs, west wall with a rose */
 { const len=NZ1-FRONT;const g=new THREE.CylinderGeometry(R+.6,R+.6,len,64,1,true,-Math.PI/2,Math.PI).rotateX(-Math.PI/2);add(g,naveMat,[0,SP,(FRONT+NZ1)/2]);
   const shell=worldUV(new THREE.CylinderGeometry(R+.72,R+.72,len+.4,64,1,true,-Math.PI/2,Math.PI).rotateX(-Math.PI/2),4);
   add(shell,roofStone,[0,SP,(FRONT+NZ1)/2]).name='Nave exterior';
   const roofSeams=[];
   for(let seam=FRONT+.7;seam<NZ1;seam+=1.7)roofSeams.push([0,SP,seam]);
   inst(new THREE.TorusGeometry(R+.73,.065,6,40,Math.PI),exteriorTrim,roofSeams);
   const ribs=[];for(let z=FRONT+3.4;z<NZ1;z+=3.4)ribs.push([0,SP,z]);inst(new THREE.TorusGeometry(R+.5,.16,8,48,Math.PI),smooth,ribs);
   const {radius,spring,depth}=WEST_PORTAL,z=NZ1-depth/2,edge=AX+.5;
   const facade=new THREE.Shape(),wr=3.2,wy=SP+3.6,roofRadius=R+.72;
   facade.moveTo(-edge,0);facade.lineTo(-radius,0);facade.lineTo(-radius,spring);
   facade.absarc(0,spring,radius,Math.PI,0,true);facade.lineTo(radius,0);
   facade.lineTo(edge,0);facade.lineTo(edge,SP+.17);
   const springAngle=Math.asin(1.58/roofRadius);
   for(let i=0;i<=32;i++){
    const angle=springAngle+(Math.PI-2*springAngle)*i/32,x=roofRadius*Math.cos(angle),y=SP+roofRadius*Math.sin(angle);
    facade.lineTo(x,y);
   }
   facade.lineTo(-edge,SP+.17);facade.closePath();
   const roseOpening=new THREE.Path();roseOpening.absarc(0,wy,wr,0,Math.PI*2,true);facade.holes.push(roseOpening);
   add(box(2*edge+1.4,.36,2.5),facadeStone,[0,-.19,NZ1+.55]).name='Portal landing';
   add(box(2*edge+.6,.17,1.9),exteriorTrim,[0,-.095,NZ1+.51]);
   add(archBand(roofRadius-.25,roofRadius+.12,.27),exteriorTrim,[0,SP,NZ1+depth/2+.11]);
   const westWall=masonry(worldUV(new THREE.ExtrudeGeometry(facade,{depth,bevelEnabled:false,curveSegments:32}),4),1,[0,0,z],null,facadeStone,stoneDark);
   westWall.name='West facade';
   for(const face of [-1,1]){
    const front=NZ1+face*(depth/2+.04);
    add(archBand(radius,radius+.42,.34),stone,[0,spring,front]);
    add(archBand(radius+.42,radius+.53,.22),smooth,[0,spring,front]);
    for(const side of [-1,1]){
     add(box(.42,spring,.34),stone,[side*(radius+.21),spring/2,front]);
     add(box(.53,.27,.49),smooth,[side*(radius+.24),.135,front]);
     add(box(.53,.19,.46),smooth,[side*(radius+.24),spring-.095,front]);
    }
   }
   const oak=keep(new THREE.MeshStandardMaterial({color:0x514049,map:T(ashDark.map),roughness:.8}));
   const iron=keep(new THREE.MeshStandardMaterial({color:0x5b5060,metalness:.65,roughness:.46}));
   for(const side of [-1,1]){
    const leaf=new THREE.Group();leaf.name=side<0?'West door left':'West door right';
    leaf.position.set(side*(radius-.1),0,NZ1+.47);leaf.rotation.y=side*1.25;hall.add(leaf);
    const part=(w,h,d,x,y,z,mat)=>{
     const mesh=new THREE.Mesh(keep(new THREE.BoxGeometry(w,h,d)),mat);
     mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;leaf.add(mesh);
    };
    for(let i=0;i<5;i++){
     const x=(i+.5)*.398,h=spring+Math.sqrt(radius*radius-x*x)-.15;
     part(.389,h,.17,-side*x,h/2+.055,0,oak);
    }
    for(const y of [.45,2.65,4.03])part(1.99,.14,.22,-side*.995,y,0,iron);
    part(.14,.48,.28,-side*1.73,2.21,0,iron);
   }
   add(new THREE.CircleGeometry(wr+.015,48),glassMat(roseTex,{round:true,normal:new THREE.Vector3(0,0,1),avg:ROSE_AVG}),[0,wy,NZ1+.08],[0,Math.PI,0],{cast:false,recv:false});
   add(new THREE.TorusGeometry(wr+.22,.24,9,64),facadeStone,[0,wy,NZ1+.47]);
   add(new THREE.TorusGeometry(wr+.045,.105,8,64),exteriorTrim,[0,wy,NZ1+.62]);
   add(new THREE.TorusGeometry(wr+.1,.18,10,64),smooth,[0,wy,NZ1-.5]);windows.west={pos:new THREE.Vector3(0,wy,NZ1-.5),normal:new THREE.Vector3(0,0,1),r:wr};}

 /* The plateau and the meadow before the door share their height function with the camera. Their sloped body continues below water. */
 const {back}=TERRACE,{x:edge,z0,z1}=GROUND_BOUNDS,cell=low?1.7:1.05;
 const island=new THREE.PlaneGeometry(edge*2,z1-z0,Math.round(edge*2/cell),Math.round((z1-z0)/cell)).rotateX(-Math.PI/2).translate(0,0,(z0+z1)/2);
 const pts=island.attributes.position,colors=[];
 const dark=new THREE.Color(MEADOW_TURF.dark),green=new THREE.Color(MEADOW_TURF.green),soil=new THREE.Color(MEADOW_TURF.soil),path=new THREE.Color(MEADOW_TURF.path);
 for(let i=0;i<pts.count;i++){
  const x=pts.getX(i),z=pts.getZ(i),height=torchGroundHeight(x,z);
  const hallInset=(1-THREE.MathUtils.smoothstep(Math.abs(x),12.8,13.45))
   *THREE.MathUtils.smoothstep(z,back+1,back+2)*(1-THREE.MathUtils.smoothstep(z,39,40));
  pts.setY(i,Math.min(-.012,height)-.14*hallInset-.20*THREE.MathUtils.smoothstep(-height,3.75,4));
  const wave=.25+.5*meadowPatch(x,z)+.06*Math.sin(x*1.53-z*.96);
  const color=dark.clone().lerp(green,wave).lerp(soil,THREE.MathUtils.smoothstep(-height,3.4,4)*.6);
  const foot=Math.max(Math.abs(x)-13.9,back+1-z,z-41.2);
  color.multiplyScalar(.58+.42*THREE.MathUtils.smoothstep(foot,0,3));
  const trailX=.85*Math.sin(Math.max(0,z-42.6)*.24);
  const entry=(1-THREE.MathUtils.smoothstep(Math.abs(x-trailX),.85,2.2))*THREE.MathUtils.smoothstep(z,40,43)*(1-THREE.MathUtils.smoothstep(z,49,53));
  color.lerp(path,entry*.50);
  color.toArray(colors,colors.length);
 }
 island.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));island.computeVertexNormals();
 const turf=keep(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,
  clippingPlanes:[new THREE.Plane(new THREE.Vector3(0,1,0),-MIRROR_LEVEL+.005)]
 }));
 skyFill(turf,0x34472f,.23);
 add(island,turf,null,null,{cast:false}).name='Church ground';

 /* the meadow lives in torch-meadow.js; it keeps off the hall, its doorstep and the short trail that leaves the west door and fades into the meadow */
 const meadow=buildMeadow({hall,keep,low,skyFill,reduced:typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,
  blocked:(x,z)=>(Math.abs(x)<14.3&&z>BACK&&z<NZ1+1.5)||(z>NZ1&&z<52&&Math.abs(x-.85*Math.sin(Math.max(0,z-42.6)*.24))<1.15)});
 /* the water only shows the shore below the meadow, so blades stay out of the mirror pass */
 skipInMirror.push(...meadow.mirrorSkip);

 /* ---- floor: mirror under polished marble; an inlaid runner up the nave and a porphyry rota before the stair ---- */
 const FL_W=2*AX+1,FL_Z0=BACK,FL_L=NZ1-FL_Z0,FL_Z=(FL_Z0+NZ1)/2;
 const floorMat=keep(new THREE.MeshPhysicalMaterial({map:T(fl.map),roughnessMap:T(fl.rough,false),normalMap:T(fl.normal,false),normalScale:new THREE.Vector2(.6,.6),roughness:1,metalness:0,clearcoat:low?0:.7,clearcoatRoughness:.04,envMapIntensity:.6}));
 for(const k of ['map','roughnessMap','normalMap'])floorMat[k].repeat.set(FL_W/8,FL_L/8);
 const floor=add(new THREE.PlaneGeometry(FL_W,FL_L),floorMat,[0,0,FL_Z],[-Math.PI/2,0,0],{cast:false});floor.renderOrder=-2;skipInMirror.push(floor);
 const RUN_Z0=4.6,RUN_L=NZ1-1-RUN_Z0,units=Math.round(RUN_L/3.4);
 const inl=T(maps('inlay',()=>({map:inlay(256*Q,512*Q,units,17)})).map);
 const inlayMat=keep(new THREE.MeshPhysicalMaterial({map:inl,roughness:.25,metalness:0,clearcoat:low?0:.6,clearcoatRoughness:.06,envMapIntensity:.5,transparent:!low,opacity:low?1:.86,
  polygonOffset:true,polygonOffsetFactor:-2}));
 const runner=add(new THREE.PlaneGeometry(3.4,RUN_L),inlayMat,[0,.003,RUN_Z0+RUN_L/2],[-Math.PI/2,0,0],{cast:false});runner.renderOrder=-1;skipInMirror.push(runner);

 /* ---- torches: iron brackets on the piers and on every third column, two tall braziers by the stair ---- */
 const torchSpots=[];
 for(const [px,pz] of piers){const sx=Math.sign(px),inZ=pz<BAYZ?1:-1;torchSpots.push({pos:new THREE.Vector3(px-sx*1.34,4.6,pz+inZ*1.34),dir:new THREE.Vector3(-sx,0,inZ).normalize(),big:false,key:true});}
 colZ.forEach((z,i)=>{if(z>FRONT+1&&i%3===1)for(const sx of [-1,1])torchSpots.push({pos:new THREE.Vector3(sx*(HX-.36),3.9,z),dir:new THREE.Vector3(-sx,0,0),big:false,key:z<FRONT+12});});
 /* no free-standing braziers by the stair (removed 2026-11-21): the wall torches are the only fire */
 const braziers=[];
 let torchHeadMat=null;
 const bracketG=mergeGeometries([new THREE.BoxGeometry(.06,.06,.5).translate(0,0,.25),new THREE.BoxGeometry(.05,.34,.05).translate(0,-.16,.08).rotateX(-.6),
  new THREE.TorusGeometry(.1,.02,6,16).rotateX(Math.PI/2).translate(0,.02,.5),new THREE.LatheGeometry([[0,0],[.04,0],[.07,.12],[.13,.24],[.14,.28],[0,.28]].map(([x,y])=>new THREE.Vector2(x,y)),16).translate(0,-.1,.5)].map(g=>g.index?g.toNonIndexed():g));
 inst(bracketG,iron,torchSpots.map(t=>[t.pos.x-t.dir.x*.5,t.pos.y-.18,t.pos.z-t.dir.z*.5,Math.atan2(t.dir.x,t.dir.z)]));
 { const wood=keep(new THREE.MeshStandardMaterial({color:0x3b2718,roughness:.82,metalness:0})),char=keep(new THREE.MeshStandardMaterial({color:0x1d1510,roughness:.95,metalness:0,emissive:0x2c1648,emissiveIntensity:0}));
   const handle=new THREE.CylinderGeometry(.03,.024,.62,10).translate(0,-.17,0),head=mergeGeometries([new THREE.CylinderGeometry(.055,.045,.17,12).translate(0,.2,0),new THREE.TorusGeometry(.052,.012,6,14).rotateX(Math.PI/2).translate(0,.15,0),new THREE.TorusGeometry(.055,.012,6,14).rotateX(Math.PI/2).translate(0,.24,0)].map(g=>g.index?g.toNonIndexed():g));
   const at=torchSpots.map(t=>[t.pos.x,t.pos.y-.16,t.pos.z,0]);inst(handle,wood,at);inst(head,char,at);torchHeadMat=char;}
 const standG=mergeGeometries([new THREE.LatheGeometry([[0,0],[.42,0],[.42,.06],[.16,.14],[.1,.3],[.08,1.6],[.1,1.65],[.06,1.75],[.1,2.0],[.3,2.08],[.5,2.3],[.52,2.36],[0,2.36]].map(([x,y])=>new THREE.Vector2(x,y)),32)].map(g=>g.toNonIndexed()));
 if(braziers.length)inst(standG,iron,braziers.map(b=>[b[0],b[1],b[2]]));
 /* fire: a volume, not a picture. Each flame is a box; the shader marches the view ray through it and accumulates emission from a
    turbulent density (3D noise flowing upward) shaped like a flame, coloured by temperature (deep red at the edges and top, orange,
    a yellow-white core near the fuel). Sparks rise from every flame. */
 const flameMat=keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,side:THREE.FrontSide,uniforms:{uTime:{value:0},uOn:{value:1}},
  vertexShader:`attribute float aSeed;varying vec3 vP;varying vec3 vCam;varying float vSeed;
   void main(){vSeed=aSeed;mat4 M=modelMatrix*instanceMatrix;vP=position;vCam=(inverse(M)*vec4(cameraPosition,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*M*vec4(position,1.);}`,
  fragmentShader:`uniform float uTime;uniform float uOn;varying vec3 vP;varying vec3 vCam;varying float vSeed;
   float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
   float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
   float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n3(p);p=p*2.07+vec3(.3,.1,.7);a*=.5;}return s;}
   vec3 heat(float T){vec3 c=mix(vec3(.16,.05,.30),vec3(.50,.28,.86),smoothstep(.05,.45,T));c=mix(c,vec3(.74,.60,1.),smoothstep(.4,.75,T));return mix(c,vec3(.95,.92,1.),smoothstep(.75,1.05,T));}
   void main(){vec3 ro=vCam,rd=normalize(vP-vCam);vec3 bmin=vec3(-.5,0.,-.5),bmax=vec3(.5,1.,.5);
    vec3 inv=1./rd,t0=(bmin-ro)*inv,t1=(bmax-ro)*inv,tn=min(t0,t1),tx=max(t0,t1);float ta=max(max(tn.x,tn.y),max(tn.z,0.)),tb=min(min(tx.x,tx.y),tx.z);
    if(tb<=ta)discard;const int N=26;float dt=(tb-ta)/float(N),t=ta+dt*fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);vec3 acc=vec3(0.);float tm=uTime*1.7+vSeed*31.;
    for(int i=0;i<N;i++){vec3 p=ro+rd*t;float y=p.y;
     vec3 q=vec3(p.x*3.2,y*2.6-tm*1.25,p.z*3.2)+vSeed*9.;float n=fbm(q);float n2=n3(vec3(p.x*7.,y*6.-tm*2.4,p.z*7.)+vSeed*3.);
     vec2 off=vec2(n-.5,n2-.5)*.22*y;float r=.32*pow(max(0.,1.-y),.8)*smoothstep(0.,.1,y)+.01;
     float d=length(p.xz+off)/r;float dens=smoothstep(1.,.1,d+(n-.5)*.7)*smoothstep(1.,.45,y+(n2-.5)*.5);
     float T=dens*(1.2-y*.95)*(.75+.5*n);acc+=heat(T)*dens*dens*dt*7.;t+=dt;}
    float a=clamp(max(acc.r,max(acc.g,acc.b)),0.,1.)*uOn;if(a<.003)discard;gl_FragColor=vec4(acc*uOn*1.8,a);}`}));
 const flames=[...torchSpots.map(t=>({p:t.pos.clone().add(new THREE.Vector3(0,.12,0)),s:[.5,.8]})),...braziers.map(b=>({p:new THREE.Vector3(b[0],b[1]+2.32,b[2]),s:[1.0,1.55]}))];
 const flameMesh=new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1,1,1).translate(0,.5,0)),flameMat,flames.length);flameMesh.frustumCulled=false;
 { const o=new THREE.Object3D(),seed=new Float32Array(flames.length);flames.forEach((f,i)=>{o.position.copy(f.p);o.scale.set(f.s[0],f.s[1],f.s[0]);o.updateMatrix();flameMesh.setMatrixAt(i,o.matrix);seed[i]=Math.random();});
   flameMesh.geometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seed,1));}
 flameMesh.renderOrder=6;scene.add(flameMesh);noAO.push(flameMesh);
 /* sparks: each rises, drifts and fades on its own cycle */
 const SPARKS=14,sp=new Float32Array(flames.length*SPARKS*3),ss=new Float32Array(flames.length*SPARKS),sk=new Float32Array(flames.length*SPARKS);
 flames.forEach((f,i)=>{for(let j=0;j<SPARKS;j++){const k=i*SPARKS+j;sp[k*3]=f.p.x;sp[k*3+1]=f.p.y+f.s[1]*.25;sp[k*3+2]=f.p.z;ss[k]=Math.random();sk[k]=f.s[1];}});
 const sparkGeo=keep(new THREE.BufferGeometry());sparkGeo.setAttribute('position',new THREE.BufferAttribute(sp,3));sparkGeo.setAttribute('aSeed',new THREE.BufferAttribute(ss,1));sparkGeo.setAttribute('aScale',new THREE.BufferAttribute(sk,1));
 const sparkMat=keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,uniforms:{uTime:{value:0},uOn:{value:1},uPx:{value:1}},
  vertexShader:`uniform float uTime;uniform float uPx;attribute float aSeed;attribute float aScale;varying float vA;
   void main(){float life=fract(uTime*(.32+aSeed*.25)+aSeed*7.3);vec3 p=position;float s=aSeed*43.;
    p+=vec3(sin(s+uTime*1.3)*.12*life+sin(s*2.1+uTime*3.1)*.03,life*aScale*2.2,cos(s*1.7+uTime*1.1)*.12*life);
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;vA=(1.-life)*smoothstep(0.,.08,life)*step(.35,fract(aSeed*13.7));gl_PointSize=uPx*(1.2+2.*(1.-life))*(6./-mv.z);}`,
  fragmentShader:`uniform float uOn;varying float vA;void main(){vec2 c=gl_PointCoord-.5;float d=length(c);if(d>.5)discard;float a=smoothstep(.5,0.,d)*vA*uOn;gl_FragColor=vec4(vec3(.78,.64,1.)*a*2.,a);}`}));
 const sparks=new THREE.Points(sparkGeo,sparkMat);sparks.frustumCulled=false;sparks.renderOrder=7;scene.add(sparks);noAO.push(sparks);

 /* soft halo around each flame */
 const haloMat=keep(new THREE.SpriteMaterial({map:T(glowSprite(128,'rgba(200,170,255,.9)','rgba(140,100,220,.22)')),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,fog:false}));
 const halos=flames.map(f=>{const s=new THREE.Sprite(haloMat);s.position.copy(f.p).add(new THREE.Vector3(0,f.s[1]*.35,0));const k=f.s[1]*1.9;s.scale.set(k,k,1);s.renderOrder=6;scene.add(s);noAO.push(s);return s;});
 /* the wall torches' light is baked (torch-bake.js); the two braziers by the stair stay real lights */
 const torchPoints=torchSpots.map(t=>t.pos.clone().add(t.dir.clone().multiplyScalar(.25)).add(new THREE.Vector3(0,.5,0)));
 const lightSpots=braziers.map(b=>({p:new THREE.Vector3(b[0],b[1]+2.9,b[2]),k:1.4}));
 const torchLights=lightSpots.map((s,i)=>{const l=new THREE.PointLight(0xa68ae8,0,low?11:14,2);l.position.copy(s.p);l.userData={k:s.k,seed:i*1.7};scene.add(l);return l;});

 /* ---- sky, sun and moon ---- */
 const hemi=new THREE.HemisphereLight(0xb8b0e8,0x3a3238,.4);scene.add(hemi);
 const sun=new THREE.DirectionalLight(0xffffff,1);sun.target.position.set(0,0,10);scene.add(sun);scene.add(sun.target);
 { const sc=sun.shadow.camera;sc.left=-34;sc.right=34;sc.top=34;sc.bottom=-34;sc.near=1;sc.far=140;sun.shadow.bias=-.0003;sun.shadow.normalBias=.03;}
 /* shafts: one bundle per window side; they turn with the sun and fade with how squarely the sun faces that side */
 const beamMat=keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false,
  uniforms:{uTime:{value:0},uColor:{value:new THREE.Color(0xd2caf8)},uStrength:{value:0}},
  vertexShader:`varying vec2 vUv;varying vec3 vN;varying vec3 vV;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform float uTime;uniform vec3 uColor;uniform float uStrength;varying vec2 vUv;varying vec3 vN;varying vec3 vV;varying vec3 vW;
   float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
   void main(){float edge=pow(abs(dot(normalize(vN),normalize(vV))),2.2);float along=vUv.y;float fade=smoothstep(0.,.28,along)*smoothstep(1.,.72,along);
    float streak=.84+.16*n(vec2(vUv.x*14.,along*1.2-uTime*.02))+.05*n(vec2(vUv.x*48.,along*4.+uTime*.04));float floorFade=smoothstep(-.4,2.6,vW.y);
    float a=edge*fade*streak*floorFade*1.25*uStrength;gl_FragColor=vec4(uColor*a,a);}`}));
 const beams=new THREE.Group();scene.add(beams);noAO.push(beams);
 const poolTex=T(glowSprite(256,'rgba(255,250,240,.85)','rgba(220,210,255,.3)'));
 const beamGeo=keep(new THREE.CylinderGeometry(1,1.2,1,32,1,true).translate(0,-.5,0));
 const bundle=(points,r,str)=>points.map(p=>{const m=new THREE.Mesh(beamGeo,beamMat.clone());keep(m.material);m.position.copy(p);m.renderOrder=3;m.userData={r,str};beams.add(m);
  const pool=new THREE.Mesh(keep(new THREE.PlaneGeometry(1,1)),keep(new THREE.MeshBasicMaterial({map:poolTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0,fog:false})));
  pool.rotation.x=-Math.PI/2;pool.renderOrder=2;scene.add(pool);skipInMirror.push(pool);noAO.push(pool);m.userData.pool=pool;return m;});
 const shaftDefs=[...windows.drum.list,...windows.lantern.list,
  {pos:windows.south.pos,n:windows.south.normal,r:windows.south.r*.62,str:1},{pos:windows.north.pos,n:windows.north.normal,r:windows.north.r*.62,str:1},{pos:windows.west.pos,n:windows.west.normal,r:windows.west.r*.62,str:1}];
 /* the light in the air is drawn by torch-volumetric.js from the shadow map; these window records are kept for reference */
 const shaftBeams=[];

 /* ---- real sun ----
    The sun's place is computed from today's date and the PC's clock (solar declination + hour angle), at a latitude guessed from the
    time zone, so sunrise and sunset move with the seasons. The church is oriented the old way: the apse behind the stele faces east
    (-z), south is +x, west (the nave, behind the camera) is +z. There is one sun: all its light comes from one direction and gets in
    only through the windows that face it. Sky colour, glass, fog, exposure and the torches follow the sun's height, not the hour.
    After dark the moon (opposite the sun) gives a faint cold light and no shafts. */
 const C=h=>new THREE.Color(h);
 /* by solar elevation in degrees */
 const EKEYS=[
  [-90,{sky:C(0x1a1c3a),skyI:.13,gnd:C(0x0b0a10),lc:C(0xa6b8f0),li:1.45,glass:C(0x5060b0),gi:.42,fog:C(0x07060c),fd:.019,exp:.92,beam:.95}],
  [-12,{sky:C(0x1c1e40),skyI:.14,gnd:C(0x0b0a10),lc:C(0xa6b8f0),li:1.45,glass:C(0x5464b4),gi:.44,fog:C(0x08070e),fd:.019,exp:.92,beam:.95}],
  [-6, {sky:C(0x312a5c),skyI:.2,gnd:C(0x100d16),lc:C(0x8a90cc),li:.08,glass:C(0x6a62b0),gi:.45,fog:C(0x100c18),fd:.018,exp:.93,beam:0}],
  [-2.5,{sky:C(0x5e4a7e),skyI:.3,gnd:C(0x18131a),lc:C(0xff9a7a),li:0,glass:C(0xc89aa8),gi:.75,fog:C(0x221a26),fd:.016,exp:.96,beam:0}],
  [2,  {sky:C(0x8a6a98),skyI:.46,gnd:C(0x221a1e),lc:C(0xff9460),li:1.3,glass:C(0xffb890),gi:1.2,fog:C(0x34242e),fd:.014,exp:.99,beam:.9}],
  [8,  {sky:C(0xa896c8),skyI:.75,gnd:C(0x2a2228),lc:C(0xffc89c),li:2.0,glass:C(0xf6dcd0),gi:1.6,fog:C(0x3a3040),fd:.013,exp:1.03,beam:1}],
  [20, {sky:C(0xb8bcec),skyI:1.05,gnd:C(0x302a30),lc:C(0xfff0e2),li:2.8,glass:C(0xeceaff),gi:2.1,fog:C(0x3c3a4c),fd:.011,exp:1.08,beam:1}],
  [45, {sky:C(0xc4c8f0),skyI:1.25,gnd:C(0x343036),lc:C(0xffffff),li:3.2,glass:C(0xf4f2ff),gi:2.4,fog:C(0x403e50),fd:.010,exp:1.1,beam:.9}],
  [90, null]];
 EKEYS[EKEYS.length-1][1]=EKEYS[EKEYS.length-2][1];
 const cur={sky:new THREE.Color(),gnd:new THREE.Color(),lc:new THREE.Color(),glass:new THREE.Color(),fog:new THREE.Color()};let first=true;
 function sample(e){let i=0;while(i<EKEYS.length-2&&EKEYS[i+1][0]<=e)i++;const [e0,a]=EKEYS[i],[e1,b]=EKEYS[i+1];let t=Math.min(1,Math.max(0,(e-e0)/(e1-e0)));t=t*t*(3-2*t);
  const o={};for(const k in a)o[k]=a[k].isColor?a[k].clone().lerp(b[k],t):a[k]+(b[k]-a[k])*t;return o;}
 /* latitude from the time zone (the page cannot know where the PC is; this is close enough for the light) */
 const LAT=(()=>{let tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch{}
  const map=[[/Shanghai|Chongqing|Harbin|Urumqi/,31],[/Hong_Kong|Macau/,22.3],[/Taipei/,25],[/Tokyo/,35.7],[/Seoul/,37.5],[/Singapore|Kuala_Lumpur/,2],[/Sydney|Melbourne/,-34],[/Los_Angeles/,34],[/New_York/,40.7],[/London/,51.5],[/Paris|Berlin/,50]];
  for(const [re,v] of map)if(re.test(tz))return v;return 35;})();
 const D2R=Math.PI/180;
 /* time used: the PC clock, or window.__TORCH_HOUR (a test hook) on today's date */
 const nowDate=()=>{const d=new Date();if(typeof window.__TORCH_HOUR==='number'){const h=window.__TORCH_HOUR;d.setHours(Math.floor(h),Math.round((h%1)*60),0,0);}return d;};
 /* -> {el: elevation in degrees, az: azimuth from north, clockwise, in degrees}; solar time taken as the zone's clock time */
 function solar(d){const start=new Date(d.getFullYear(),0,0),n=Math.floor((d-start)/864e5),phi=LAT*D2R;
  const decl=23.44*D2R*Math.sin(2*Math.PI*(284+n)/365),lst=d.getHours()+d.getMinutes()/60+d.getSeconds()/3600,H=15*(lst-12)*D2R;
  const sinE=Math.sin(phi)*Math.sin(decl)+Math.cos(phi)*Math.cos(decl)*Math.cos(H),el=Math.asin(Math.max(-1,Math.min(1,sinE)));
  const az=Math.atan2(-Math.sin(H),Math.tan(decl)*Math.cos(phi)-Math.sin(phi)*Math.cos(H));return {el:el/D2R,az:((az/D2R)+360)%360};}
 /* sky direction (unit vector toward the body) in hall space: north -x, east -z, south +x, west +z */
 const skyDir=(az,el)=>{const a=az*D2R,e=el*D2R;return new THREE.Vector3(-Math.cos(a)*Math.cos(e),Math.sin(e),-Math.sin(a)*Math.cos(e)).normalize();};
 function sunAt(){const {el,az}=solar(nowDate());
  if(el>-2.5)return {pos:skyDir(az,Math.max(el,1.5)),moon:false,up:1,el};
  /* the moon (an approximation, no lunar tables): opposite the sun, kept 52–72° high so its light falls through the drum onto the floor */
  return {pos:skyDir((az+180)%360,Math.max(52,Math.min(72,20-el))),moon:true,up:1,el};}
 const hoursNow=()=>{const d=nowDate();return d.getHours()+d.getMinutes()/60;};
 const hallState={torch:0,beam:0,sunPos:new THREE.Vector3(0,1,0),skyColor:cur.sky,exposure:1,el:0};
 function applyTime(dt,renderer){const s=sunAt(),k=sample(s.el),a=first?1:1-Math.exp(-dt*1.5);first=false;
  if(!s.moon){const visible=directSunVisibility(s.el);k.li*=visible;k.beam*=visible;}
  /* torches: lit as the sun goes down (from 10° above the horizon, fully by 1°), out again in the morning */
  k.torch=1-THREE.MathUtils.smoothstep(s.el,1,10);hallState.el=s.el;
  cur.sky.lerp(k.sky,a);cur.gnd.lerp(k.gnd,a);cur.lc.lerp(k.lc,a);cur.glass.lerp(k.glass,a);cur.fog.lerp(k.fog,a);
  for(const key of ['skyI','li','gi','fd','exp','torch','beam'])hallState[key]=hallState[key]===undefined?k[key]:hallState[key]+(k[key]-hallState[key])*a;
  /* sun ↔ moon swap happens while the direct light is ~0 (elevation -2.5°), so the jump is invisible */
  if(s.moon!==hallState.moon){hallState.moon=s.moon;hallState.sunPos.copy(s.pos);}
  hallState.sunPos.lerp(s.pos,a).normalize();
  for(const {mat,tint,strength} of litExterior){
   mat.emissive.copy(tint).lerp(cur.sky,.20);
   mat.emissiveIntensity=strength*(.24+.76*hallState.torch);
  }
  hemi.color.copy(cur.sky);hemi.groundColor.copy(cur.gnd);hemi.intensity=hallState.skyI;
  /* the light tier has no shadows, so the sun would come through the roof: keep it to a soft key there */
  sun.color.copy(cur.lc);sun.intensity=hallState.li;sun.position.copy(sun.target.position).addScaledVector(hallState.sunPos,90);
  for(const g of glassWins){const face=Math.max(0,g.n.dot(hallState.sunPos)),lit=hallState.li*(hallState.moon?.5:.25)*face;g.u.uTint.value.copy(cur.glass);g.u.uBright.value=hallState.gi*(g.clear?.5:.32)+lit*(g.clear?.8:.5);}
  scene.fog.color.copy(cur.fog);scene.fog.density=hallState.fd;scene.background.copy(cur.fog);
  renderer.toneMappingExposure=hallState.exp;
  /* shafts: travel along -sunPos; a window side gets them when it faces the sun */
  const dir=hallState.sunPos.clone().negate();
  const steep=THREE.MathUtils.smoothstep(-dir.y,.28,.55);
  { for(const m of shaftBeams){const face=Math.max(0,m.userData.n.dot(hallState.sunPos)),w=Math.pow(face,.8)*hallState.beam*steep*(s.moon?.6:1);const len=dir.y<-.05?Math.min(48,m.position.y/-dir.y):0;m.visible=w>.01&&len>0;m.userData.pool.visible=m.visible;if(!m.visible)continue;
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),dir);m.scale.set(m.userData.r,len,m.userData.r);
    m.material.uniforms.uStrength.value=w*m.userData.str;m.material.uniforms.uColor.value.copy(cur.lc).lerp(new THREE.Color(s.moon?0xa8b8ff:0xd8d0ff),.35);
    const hit=m.position.clone().addScaledVector(dir,len),pool=m.userData.pool;pool.position.set(hit.x,.014,hit.z);
    const stretch=1/Math.max(.35,-dir.y);pool.scale.set(m.userData.r*2.6,m.userData.r*2.6*stretch,1);pool.rotation.z=-Math.atan2(dir.x,dir.z);pool.material.opacity=.18*w*m.userData.str;}}
  /* torches */
  flameMat.uniforms.uOn.value=hallState.torch;haloMat.opacity=hallState.torch*.5;flameMesh.visible=hallState.torch>.01;halos.forEach(x=>x.visible=flameMesh.visible);}
 function update(time,dt,renderer){applyTime(dt,renderer);meadow.update(time,hallState,renderer);flameMat.uniforms.uTime.value=time;sparkMat.uniforms.uPx.value=renderer.domElement.height/520;sparkMat.uniforms.uTime.value=time;sparkMat.uniforms.uOn.value=hallState.torch;sparks.visible=hallState.torch>.01;if(torchHeadMat)torchHeadMat.emissiveIntensity=hallState.torch*2.5;beams.children.forEach(b=>b.material.uniforms.uTime.value=time);
  for(const l of torchLights){const f=.82+.12*Math.sin(time*7.3+l.userData.seed)+.06*Math.sin(time*17.1+l.userData.seed*3);l.intensity=hallState.torch*16*l.userData.k*f;}
  hallState.flicker=.88+.07*Math.sin(time*6.1)+.05*Math.sin(time*13.7+1.3);}
 /* the sun moves about 0.25° a minute: its shadow map is drawn again only after it has moved ~0.1° (or the moon took over) */
 const shadowAt=new THREE.Vector3(),shadowState={dirty:true};
 function setShadows(on,size=2048){sun.castShadow=on;if(on){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;}shadowState.dirty=true;}
 function shadowDirty(){if(shadowState.dirty||shadowAt.angleTo(hallState.sunPos)>.0018){shadowAt.copy(hallState.sunPos);shadowState.dirty=false;return true;}return false;}

 /* clear glass (drum, lantern) lets the sun and moon through; stained glass holds most of it back */
 hall.traverse(o=>{if(o.isMesh&&o.material&&o.material.userData&&o.material.userData.glass)o.castShadow=!o.material.userData.clear;});
 return {hall,skipInMirror,noAO,floorMat,inlayMat,FL_W,FL_L,FL_Z,update,setShadows,shadowDirty,sun,state:hallState,torchPoints,
  shafts:shaftBeams,windows,colZ,hours:hoursNow};
}
