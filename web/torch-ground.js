/* SPDX-License-Identifier: GPL-3.0-or-later */
export const MIRROR_LEVEL=-4;
export const TERRACE={halfWidth:15,back:-8,front:42.6,run:23};
/* the meadow in front of the west door: a broad round of level grass running on from the terrace and sloping down to the
   water on every side */
export const MEADOW={x:0,z:72,flat:34,run:24};

export function torchGroundHeight(x,z){
 const {halfWidth,back,front,run}=TERRACE;
 const dx=Math.max(0,Math.abs(x)-halfWidth);
 const dz=Math.max(0,back-z,z-front);
 const shore=run-2.3+1.35*Math.sin(x*.17+z*.084)+.85*Math.cos(z*.21-x*.14);
 const s=Math.min(1,Math.hypot(dx,dz)/shore);
 const terrace=MIRROR_LEVEL*s*s*(3-2*s);
 const a=Math.atan2(z-MEADOW.z,x-MEADOW.x),reach=MEADOW.run-2+1.2*Math.sin(a*3+.7)+.8*Math.cos(a*5-.4);
 const m=Math.min(1,Math.max(0,Math.hypot(x-MEADOW.x,z-MEADOW.z)-MEADOW.flat)/reach);
 return Math.max(terrace,MIRROR_LEVEL*m*m*(3-2*m));
}

/* the box the ground's turf has to cover */
export const GROUND_BOUNDS=(()=>{const {halfWidth,back,front,run}=TERRACE,r=MEADOW.flat+MEADOW.run+2;
 return {x:Math.max(halfWidth+run+1,Math.abs(MEADOW.x)+r),z0:back-run-1,z1:Math.max(front+run+1,MEADOW.z+r)};})();
