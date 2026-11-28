/* SPDX-License-Identifier: GPL-3.0-or-later */
export const MIRROR_LEVEL=-4;
export const TERRACE={halfWidth:15,back:-8,front:42.6,run:23};
/* the meadow in front of the west door: a broad round of grass running on from the terrace */
export const MEADOW={x:0,z:72,flat:34,run:24};
/* 2026-11-29 user: 把外面草地搞好看. The island no longer melts into the water down long smooth slopes (from afar a green disc
   floating on the sky in the mirror): its edge is an uneven cliff (`drop` metres across, so the face is near vertical) that
   shows earth and rock strata (torch-hall.js) and goes on below the water to `foot`. The meadow rolls gently away from the door;
   the terrace under the hall stays level. */
export const CLIFF={drop:3.4,foot:MIRROR_LEVEL-.6};
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

/* signed distance to the island's edge (negative inside): the terrace with a margin round it, and the round of the meadow,
   both with uneven outlines */
export function islandEdge(x,z){
 const {halfWidth,back,front}=TERRACE;
 const dx=Math.max(0,Math.abs(x)-halfWidth),dz=Math.max(0,back-z,z-front);
 const terrace=Math.hypot(dx,dz)-(5.6+1.1*Math.sin(x*.17+z*.084)+.8*Math.cos(z*.21-x*.14)+.45*Math.sin(x*.53-z*.37));
 const a=Math.atan2(z-MEADOW.z,x-MEADOW.x);
 const reach=MEADOW.flat+5.5+1.7*Math.sin(a*3+.7)+1.2*Math.cos(a*5-.4)+.7*Math.sin(a*9+1.3)+.35*Math.cos(a*17+.2);
 return Math.min(terrace,Math.hypot(x-MEADOW.x,z-MEADOW.z)-reach);
}
/* the walked trail from the west door to a small clearing in the middle of the meadow */
export const TRAIL={from:42.6,to:MEADOW.z-2,clearing:2.6};
export const trailX=z=>{const s=Math.max(0,z-TRAIL.from);return .85*Math.sin(s*.24)+1.6*Math.sin(s*.085);};
export function trailDistance(x,z){
 if(z<TRAIL.from-2.6)return Infinity;
 const end=Math.min(z,TRAIL.to),along=Math.abs(x-trailX(end))+Math.max(0,z-TRAIL.to);
 return Math.min(along,Math.hypot(x-trailX(TRAIL.to),z-TRAIL.to)-TRAIL.clearing);
}
/* gentle swells over the meadow, none on the terrace or near the door */
function roll(x,z){
 const k=smooth(52,62,z)*smooth(-1,-6,islandEdge(x,z));
 return k*(.34*Math.sin(x*.11+z*.07)*Math.cos(z*.09-x*.05)+.2*Math.sin(x*.23-z*.19+1.3)+.08*Math.sin(x*.61+z*.53));
}

export function torchGroundHeight(x,z){
 const d=islandEdge(x,z);
 if(d<=0)return roll(x,z);
 const t=Math.min(1,d/CLIFF.drop);
 return roll(x,z)*(1-t)+CLIFF.foot*(1-(1-t)*(1-t));
}

/* the box the ground's turf has to cover */
export const GROUND_BOUNDS=(()=>{const {halfWidth,back,front}=TERRACE,r=MEADOW.flat+5.5+4.5+CLIFF.drop+1,m=5.6+2.5+CLIFF.drop+1;
 return {x:Math.max(halfWidth+m,Math.abs(MEADOW.x)+r),z0:back-m,z1:Math.max(front+m,MEADOW.z+r)};})();
