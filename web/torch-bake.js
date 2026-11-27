// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 传火碑: what can be worked out ahead of time is baked (tools/torch-bake.cjs writes web/assets/torch/):
   - every procedural texture of the hall and the stele, as image files (no seconds of canvas maths when the page opens);
   - ambient occlusion as a world-space volume (one byte per 30 cm cell) sampled by every stone material: it takes the place of a
     screen-space AO pass, costs a texture fetch, and works on the light tier too;
   - the light of the wall torches as a second volume (60 cm cells, rays marched through the solid cells so walls and piers cast
     shadows): only the two braziers by the stair stay real lights, which keeps the shaders short (fast to compile, cheap to run).
   The bake is tied to the source of the scene (torch-hall.js, torch-textures.js, this file): when the hash in the manifest does not
   match, the page quietly falls back to drawing the textures and computing the volume itself (validation/torch-bake.test.cjs keeps
   the shipped bake current). */
import * as THREE from './vendor/three/three.module.min.js';

const BASE=new URL('./assets/torch/',import.meta.url);
export const BAKE_SOURCES=['torch-hall.js','torch-ground.js','torch-meadow.js','torch-textures.js','torch-bake.js'];
/* the volume covers the whole church (x ±14.7, floor to vault crown, apse to the west wall) */
export const AO_BOX={min:[-14.7,-.3,-18.3],max:[14.7,40.2,41.4],res:.3};
export const TORCH_RES=.6;

let baked=null,record=null;
const hex=buf=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
/* same as tools/torch-bake.cjs and the test: sha-256 over the sources with \r\n folded, first 24 hex digits */
export async function sourceHash(){const parts=await Promise.all(BAKE_SOURCES.map(f=>fetch(new URL('./'+f,import.meta.url),{cache:'no-store'}).then(r=>r.text())));
 return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(parts.map(t=>t.replace(/\r\n/g,'\n')).join('\n--\n')))).slice(0,24);}
const bakedCanvases=new WeakSet();
export const isBakedTorchCanvas=canvas=>bakedCanvases.has(canvas);
const shrink=img=>{const c=document.createElement('canvas');c.width=Math.max(1,img.width>>1);c.height=Math.max(1,img.height>>1);c.getContext('2d').drawImage(img,0,0,c.width,c.height);bakedCanvases.add(c);return c;};
async function inflate(buf){return new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}

/* Keep one tier's CPU assets across route visits. GPU textures are owned by the scene. */
let cached=null;
export function loadBaked(low){
 if(window.__TORCH_BAKE)return Promise.resolve({ok:false,reason:'baking'});
 if(cached?.low===low)return cached.promise;
 const entry={low,promise:readBaked(low).then(result=>{if(!result.ok&&cached===entry)cached=null;return result;})};
 cached=entry;
 return entry.promise;
}
async function readBaked(low){
 try{const [man,hash]=await Promise.all([fetch(new URL('manifest.json',BASE),{cache:'no-store'}).then(r=>r.json()),sourceHash()]);
  if(!man||man.hash!==hash)return {ok:false,reason:'stale'};
  const tex={};
  const textures=Promise.all(Object.entries(man.textures).map(async([key,fields])=>{tex[key]={};await Promise.all(Object.entries(fields).map(async([f,file])=>{
   const img=new Image();img.decoding='async';img.src=new URL(file,BASE).href;await img.decode();tex[key][f]=low&&img.width>=512?shrink(img):img;}));}));
  const volume=async(key,channels=1)=>{const {file,dims,box}=man[key];
   const data=await inflate(await (await fetch(new URL(file,BASE))).arrayBuffer());
   if(data.length!==dims[0]*dims[1]*dims[2]*channels)throw Error(key+'-size');
   return {data,dims,box};};
  const [ao,torch,stele]=await Promise.all([volume('ao'),volume('torch'),volume('stele',4),textures]);
  return {ok:true,assets:{tex,ao,torch,stele}};}
 catch(e){return {ok:false,reason:String(e&&e.message||e)};}}

/* Hall builders read these assets synchronously. A cancelled visit can never install them. */
export function withBaked(result,build){
 baked=result.assets||null;
 record=window.__TORCH_BAKE?new Map():null;
 try{return build();}finally{baked=null;}
}
/* a set of maps by name: the baked images when there are some, else drawn now (and noted when baking) */
export function maps(key,make){if(baked&&baked.tex[key])return baked.tex[key];const t0=performance.now();const o=make();if(record){record.set(key,o);console.log('BAKESTEP texture',key,Math.round(performance.now()-t0),'ms');}return o;}
export function bakedAO(){return baked?{ao:baked.ao,torch:baked.torch,stele:baked.stele}:null;}
export function recorded(){return record;}

/* ---- ambient occlusion volume ----
   Solid surfaces are marked in a voxel grid (every triangle sampled finer than a cell, clipping planes honoured), then occlusion is how
   much more solid surrounds a cell than a single flat wall would (two box blurs, 1 and 3 cells): 1 in the open and on plain walls,
   darker in corners, under cornices, between columns, under the stele. */
export function computeVolumes(scene,torches=[],stele=[[],[],[],[]]){const {min,max,res}=AO_BOX,nx=Math.ceil((max[0]-min[0])/res),ny=Math.ceil((max[1]-min[1])/res),nz=Math.ceil((max[2]-min[2])/res),N=nx*ny*nz;
 const occ=new Float32Array(N),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),p=new THREE.Vector3(),m=new THREE.Matrix4(),im=new THREE.Matrix4();
 scene.updateMatrixWorld(true);
 scene.traverse(o=>{if(!o.isMesh||o.userData.noAO)return;const mt=o.material;if(Array.isArray(mt)||!mt||!mt.isMeshStandardMaterial)return;
  const clip=mt.clippingPlanes||null,g=o.geometry,pos=g.attributes.position,idx=g.index,tris=(idx?idx.count:pos.count)/3,count=o.isInstancedMesh?o.count:1;
  for(let n=0;n<count;n++){m.copy(o.matrixWorld);if(o.isInstancedMesh){o.getMatrixAt(n,im);m.multiply(im);}
   for(let t=0;t<tris;t++){const i0=idx?idx.getX(t*3):t*3,i1=idx?idx.getX(t*3+1):t*3+1,i2=idx?idx.getX(t*3+2):t*3+2;
    a.fromBufferAttribute(pos,i0).applyMatrix4(m);b.fromBufferAttribute(pos,i1).applyMatrix4(m);c.fromBufferAttribute(pos,i2).applyMatrix4(m);
    const L=Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a)),s=Math.max(1,Math.ceil(L/(res*.6)));
    for(let u=0;u<=s;u++)for(let v=0;v<=s-u;v++){const w=s-u-v;p.set((a.x*u+b.x*v+c.x*w)/s,(a.y*u+b.y*v+c.y*w)/s,(a.z*u+b.z*v+c.z*w)/s);
     if(clip&&clip.some(pl=>pl.distanceToPoint(p)<0))continue;
     const i=Math.floor((p.x-min[0])/res),j=Math.floor((p.y-min[1])/res),k=Math.floor((p.z-min[2])/res);if(i<0||j<0||k<0||i>=nx||j>=ny||k>=nz)continue;occ[(k*ny+j)*nx+i]=1;}}}});
 /* separable box average with radius r along each axis */
 const blur=(src,r)=>{let cur=src;for(const [len,stride,lines] of [[nx,1,(f)=>{for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)f((k*ny+j)*nx);}],[ny,nx,(f)=>{for(let k=0;k<nz;k++)for(let i=0;i<nx;i++)f(k*ny*nx+i);}],[nz,nx*ny,(f)=>{for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)f(j*nx+i);}]]){
   const out=new Float32Array(N),w=2*r+1;lines(base=>{let s=0;for(let q=0;q<=r&&q<len;q++)s+=cur[base+q*stride];
    for(let q=0;q<len;q++){out[base+q*stride]=s/w;const add=q+r+1,rem=q-r;if(add<len)s+=cur[base+add*stride];if(rem>=0)s-=cur[base+rem*stride];}});cur=out;}return cur;};
 console.log('BAKESTEP voxelized');const b1=blur(occ,1),b3=blur(occ,3),out=new Uint8Array(N);
 for(let i=0;i<N;i++){const e1=Math.max(0,(b1[i]-1/3)*3),e3=Math.max(0,(b3[i]-1/7)*7);out[i]=Math.round((1-Math.min(.8,.2*e1+.3*e3))*255);}
 console.log('BAKESTEP ao done');
 /* torch light: for every 60 cm cell, each torch's 1/d² seen through the solid cells (each solid cell crossed lets 20% through);
    stored as sqrt(min(1, I/2)) so the dim far light keeps some precision (the shader squares it back) */
 const tr=TORCH_RES,tx=Math.ceil((max[0]-min[0])/tr),ty=Math.ceil((max[1]-min[1])/tr),tz=Math.ceil((max[2]-min[2])/tr),tl=new Uint8Array(tx*ty*tz);
 const solid=(x,y,z)=>{const i=Math.floor((x-min[0])/res),j=Math.floor((y-min[1])/res),k=Math.floor((z-min[2])/res);return i>=0&&j>=0&&k>=0&&i<nx&&j<ny&&k<nz&&occ[(k*ny+j)*nx+i]>0;};
 for(let k=0;k<tz;k++)for(let j=0;j<ty;j++)for(let i=0;i<tx;i++){const cx=min[0]+(i+.5)*tr,cy=min[1]+(j+.5)*tr,cz=min[2]+(k+.5)*tr;let I=0;
  for(const t of torches){const dx=t.x-cx,dy=t.y-cy,dz=t.z-cz,d2=dx*dx+dy*dy+dz*dz;if(d2>196)continue;const d=Math.sqrt(d2),n=Math.ceil(d/(res*.8));let tr2=1;
   for(let q=1;q<n;q++){const f=q/n,dist=d*f;if(dist<.45||d-dist<.55)continue;if(solid(cx+dx*f,cy+dy*f,cz+dz*f)){tr2*=.2;if(tr2<.02)break;}}
   I+=tr2*(t.w||1)/(d2+.5);}
  tl[(k*ty+j)*tx+i]=Math.round(Math.sqrt(Math.min(1,I/2))*255);}
 /* the stele's own light, in four groups along its length (RGBA), so each part can breathe on its own at run time */
 const sl=new Uint8Array(tx*ty*tz*4);
 for(let k=0;k<tz;k++)for(let j=0;j<ty;j++)for(let i=0;i<tx;i++){const cx=min[0]+(i+.5)*tr,cy=min[1]+(j+.5)*tr,cz=min[2]+(k+.5)*tr,o=((k*ty+j)*tx+i)*4;
  for(let g=0;g<4;g++){let I=0;for(const t of stele[g]||[]){const dx=t.x-cx,dy=t.y-cy,dz=t.z-cz,d2=dx*dx+dy*dy+dz*dz;if(d2>144)continue;const d=Math.sqrt(d2),n=Math.ceil(d/(res*.8));let tr2=1;
    for(let q=1;q<n;q++){const f=q/n,dist=d*f;if(dist<.3||d-dist<.35)continue;if(solid(cx+dx*f,cy+dy*f,cz+dz*f)){tr2*=.2;if(tr2<.02)break;}}I+=tr2*(t.w||1)/(d2+.4);}
   sl[o+g]=Math.round(Math.sqrt(Math.min(1,I/2))*255);}}
 return {ao:{data:out,dims:[nx,ny,nz],box:{min,max}},torch:{data:tl,dims:[tx,ty,tz],box:{min,max}},stele:{data:sl,dims:[tx,ty,tz],box:{min,max}}};}

/* sample the volume in every stone/marble material: indirect light (and a little of the direct) is darkened by it */
const vol3d=(v,rgba=false)=>{const t=new THREE.Data3DTexture(v.data,...v.dims);t.format=rgba?THREE.RGBAFormat:THREE.RedFormat;t.type=THREE.UnsignedByteType;t.minFilter=t.magFilter=THREE.LinearFilter;
 t.wrapS=t.wrapT=t.wrapR=THREE.ClampToEdgeWrapping;t.unpackAlignment=1;t.needsUpdate=true;return t;};
export function applyAO(scene,vols){const ao=vol3d(vols.ao),torch=vol3d(vols.torch),stele=vol3d(vols.stele,true),mn=vols.ao.box.min,mx=vols.ao.box.max;
 const uni={uAoVol:{value:ao},uTorchVol:{value:torch},uAoMin:{value:new THREE.Vector3(...mn)},uAoSize:{value:new THREE.Vector3(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2])},uAoStrength:{value:1},
  uTorchColor:{value:new THREE.Color(0xa68ae8)},uTorchLevel:{value:0},uSteleVol:{value:stele},uSteleColor:{value:new THREE.Color(0x9a6cf0)},uSteleLevels:{value:new THREE.Vector4()}};
 const done=new Set();scene.traverse(o=>{const m=o.material;if(!m||Array.isArray(m)||!m.isMeshStandardMaterial||done.has(m))return;done.add(m);patch(m,uni);});
 return {textures:[ao,torch,stele],uniforms:uni};}
function patch(m,uni){const prev=m.onBeforeCompile,prevKey=m.customProgramCacheKey.bind(m);m.onBeforeCompile=(sh,r)=>{prev.call(m,sh,r);Object.assign(sh.uniforms,uni);
 sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vAoWorld;')
  .replace('#include <project_vertex>','#include <project_vertex>\n{vec4 aw=vec4(transformed,1.);\n#ifdef USE_INSTANCING\naw=instanceMatrix*aw;\n#endif\naw=modelMatrix*aw;vAoWorld=aw.xyz;}');
 sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vAoWorld;uniform highp sampler3D uAoVol;uniform highp sampler3D uTorchVol;uniform vec3 uAoMin;uniform vec3 uAoSize;uniform float uAoStrength;uniform vec3 uTorchColor;uniform float uTorchLevel;uniform highp sampler3D uSteleVol;uniform vec3 uSteleColor;uniform vec4 uSteleLevels;')
  .replace('#include <aomap_fragment>',`{vec3 aoN=inverseTransformDirection(normal,viewMatrix);float vao=texture(uAoVol,clamp((vAoWorld+aoN*.33-uAoMin)/uAoSize,0.,1.)).r;
   float tq=texture(uTorchVol,clamp((vAoWorld+aoN*.45-uAoMin)/uAoSize,0.,1.)).r;vec4 sv=texture(uSteleVol,clamp((vAoWorld+aoN*.4-uAoMin)/uAoSize,0.,1.));
   float ambientOcclusion=mix(1.,vao,uAoStrength);
   #ifdef USE_AOMAP
   ambientOcclusion*=(texture2D(aoMap,vAoMapUv).r-1.)*aoMapIntensity+1.;
   #endif
   reflectedLight.indirectDiffuse*=ambientOcclusion;reflectedLight.directDiffuse*=mix(1.,ambientOcclusion,.3);
   /* baked torch light: what the old point lights gave (16 cd, 1/d²), with an average cosine of .6 */
   reflectedLight.indirectDiffuse+=uTorchColor*(uTorchLevel*16.*.6*tq*tq*2.)*BRDF_Lambert(material.diffuseColor)*mix(1.,ambientOcclusion,.5);
   reflectedLight.indirectDiffuse+=uSteleColor*(dot(sv*sv*2.,uSteleLevels)*7.)*BRDF_Lambert(material.diffuseColor)*mix(1.,ambientOcclusion,.5);
   #if defined(USE_CLEARCOAT)
   clearcoatSpecularIndirect*=ambientOcclusion;
   #endif
   #if defined(USE_ENVMAP)&&defined(STANDARD)
   {float dotNV=saturate(dot(geometryNormal,geometryViewDir));reflectedLight.indirectSpecular*=computeSpecularOcclusion(dotNV,ambientOcclusion,material.roughness);}
   #endif
  }`);};
 m.customProgramCacheKey=()=>prevKey()+'|torch-ao';m.needsUpdate=true;}

const b64=u8=>{let bin='';for(let i=0;i<u8.length;i+=8192)bin+=String.fromCharCode(...u8.subarray(i,i+8192));return btoa(bin);};
/* used by tools/torch-bake.cjs inside a headless browser: every recorded canvas as webp, the volume deflated, and the manifest */
export async function exportBake(scene,torches,stele){const out={files:{},textures:{}};
 /* encode every canvas at once (the browser encodes off the main thread, in parallel) */
 const jobs=[];for(const [key,o] of record||[]){out.textures[key]={};for(const [f,c] of Object.entries(o)){if(!c||!c.toBlob)continue;
  const lossless=f==='normal'&&(key==='plinthRelief'||key==='steleMarble');
  const format=lossless?'png':'webp',name=key+'.'+f+'.'+format,q=f==='normal'||key==='plinthRelief'?.96:.9;
  out.textures[key][f]=name;
  jobs.push(new Promise(r=>c.toBlob(r,'image/'+format,q)).then(async blob=>{out.files[name]=b64(new Uint8Array(await blob.arrayBuffer()));}));}}
 const te=performance.now();await Promise.all(jobs);console.log('BAKESTEP encoded',jobs.length,'images',Math.round(performance.now()-te),'ms');
 const tv=performance.now();const vols=computeVolumes(scene,torches,stele);console.log('BAKESTEP volumes',Math.round(performance.now()-tv),'ms');const zip=async u8=>new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
 out.files['ao.bin']=b64(await zip(vols.ao.data));out.files['torch.bin']=b64(await zip(vols.torch.data));out.files['stele.bin']=b64(await zip(vols.stele.data));
 out.manifest={hash:await sourceHash(),textures:out.textures,ao:{file:'ao.bin',dims:vols.ao.dims,box:vols.ao.box,res:AO_BOX.res},torch:{file:'torch.bin',dims:vols.torch.dims,box:vols.torch.box,res:TORCH_RES},stele:{file:'stele.bin',dims:vols.stele.dims,box:vols.stele.box,res:TORCH_RES}};return out;}
