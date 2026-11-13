/* GSAP core (3.13, standard no-charge licence) loaded on demand for library motion. The UMD build sets window.gsap;
   loadGsap() injects it once and resolves with it. warmGsap() loads it on idle so the first switch never waits. */
let pending=null;
export function loadGsap(){
 if(window.gsap)return Promise.resolve(window.gsap);
 if(pending)return pending;
 pending=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('./vendor/gsap.min.js',import.meta.url).href;s.async=true;
  s.onload=()=>window.gsap?resolve(window.gsap):reject(Error('GSAP_MISSING'));s.onerror=()=>{pending=null;reject(Error('GSAP_LOAD'));};document.head.append(s);});
 return pending;
}
export function warmGsap(){(window.requestIdleCallback||setTimeout)(()=>loadGsap().catch(()=>{}));}
