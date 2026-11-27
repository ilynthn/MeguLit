/* SPDX-License-Identifier: GPL-3.0-or-later */
import {MIRROR_LEVEL} from './torch-ground.js';
import * as THREE from './vendor/three/three.module.min.js';

export function buildCourtyard(scene,west){
 const group=new THREE.Group();group.name='Courtyard';scene.add(group);
 const sky=new THREE.Mesh(new THREE.SphereGeometry(360,32,20),new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,
  uniforms:{body:{value:new THREE.Vector3(0,1,0)},night:{value:0},moon:{value:0},twilight:{value:0}},
  vertexShader:`varying vec3 direction;
   void main(){vec4 world=modelMatrix*vec4(position,1.);direction=world.xyz-cameraPosition;
    gl_Position=projectionMatrix*viewMatrix*world;}`,
  fragmentShader:`varying vec3 direction;
   uniform vec3 body;uniform float night,moon,twilight;
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
   float clouds(vec2 p){return .55*noise(p)+.26*noise(p*2.11)+.12*noise(p*4.3)+.07*noise(p*9.2);}
   void main(){
    vec3 d=normalize(direction);float reflection=1.-smoothstep(-.035,0.,d.y);
    d.y=abs(d.y);d.x+=reflection*.0015*sin(60.*d.z);
    float h=pow(d.y,.52),disc=length(d-body);
    vec3 farColor=mix(vec3(.45,.68,.87),vec3(.07,.12,.22),night);
    farColor=mix(farColor,vec3(.79,.44,.31),twilight*.36);
    vec3 top=mix(vec3(.014,.16,.48),vec3(.004,.007,.028),night);
    vec3 result=mix(farColor,top,h);
    vec2 starUV=vec2(atan(d.z,d.x)*120.,d.y*240.);
    vec2 cell=floor(starUV);
    vec2 star=vec2(hash(cell+19.),hash(cell+31.))*.64+.18;
    float spark=(1.-smoothstep(.025,.11,length(fract(starUV)-star)))*smoothstep(.93,1.,hash(cell));
    result+=spark*night*smoothstep(.03,.24,d.y)*vec3(.63,.75,.96);
    float glow=exp(-disc*mix(9.,24.,moon));
    result+=glow*mix(vec3(.76,.49,.22),vec3(.18,.26,.46),moon);
    float disk=1.-smoothstep(mix(.021,.016,moon),mix(.024,.019,moon),disc);
    result+=disk*mix(vec3(2.1,1.75,1.26),vec3(.68,.78,.98)*(.82+.18*noise(d.xz*420.)),moon);
    vec2 p=d.xz/(d.y+.15)*2.1;
    float cloud=smoothstep(.49,.64,clouds(p))*smoothstep(.006,.12,d.y);
    vec3 cloudLight=mix(vec3(.91,.94,1.),vec3(.07,.10,.17)+glow*.25,night);
    result=mix(result,cloudLight,cloud*.96);
    result=mix(result,result*vec3(.79,.87,.93)+vec3(.018,.028,.04)*(1.-night),reflection);
    gl_FragColor=vec4(result,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 }));
 sky.name='Reflected sky';sky.renderOrder=-100;sky.frustumCulled=false;group.add(sky);
 // A shallow tint above the mirrored sky gives the ground a continuous waterline.
 const surface=new THREE.Mesh(new THREE.PlaneGeometry(680,680),new THREE.MeshBasicMaterial({
  color:0x668bb1,transparent:true,opacity:.055,depthWrite:false,fog:false,side:THREE.DoubleSide
 }));
 surface.rotation.x=-Math.PI/2;surface.renderOrder=1;group.add(surface);
 const waterDay=new THREE.Color(0x789ebc),waterNight=new THREE.Color(0x354c76);

 function update(camera,state){
  sky.position.copy(camera.position);
  surface.position.set(camera.position.x,MIRROR_LEVEL-.008,camera.position.z);
  const u=sky.material.uniforms;
  u.body.value.copy(state.sunPos);
  u.moon.value=Number(state.moon);
  u.night.value=1-THREE.MathUtils.smoothstep(state.el,-13,1);
  u.twilight.value=1-THREE.MathUtils.smoothstep(Math.abs(state.el),1,13);
  surface.material.color.copy(waterDay).lerp(waterNight,u.night.value);
 }
 return {group,sky,update};
}
