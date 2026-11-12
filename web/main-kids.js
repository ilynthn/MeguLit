/* Replaces ancestor :has() rules (.main:has(>.x), .workspace:has(>.main>.x), body:has(...), .app-frame:has(...)).
   Blink re-checks those on every DOM change anywhere below, so adding covers to the library wall recalculated the
   whole page. Here a childList-only observer on #main writes the same facts as attributes once per page switch:
   main[data-kids], .workspace/body[data-main-kids] = classes and #ids of #main's direct children,
   .app-frame[data-main-class] = #main's own classes. */
export function kidsOf(main){
  const out=new Set();
  for(const el of main.children){if(el.id)out.add('#'+el.id);for(const c of el.classList)out.add(c);}
  return [...out].join(' ');
}
export function syncMainKids(main){
  if(!main)return;
  const kids=kidsOf(main);
  if(main.getAttribute('data-kids')!==kids)main.setAttribute('data-kids',kids);
  const ws=main.closest('.workspace'),frame=main.closest('.app-frame'),cls=main.className;
  for(const el of [ws,document.body])if(el&&el.getAttribute('data-main-kids')!==kids)el.setAttribute('data-main-kids',kids);
  if(frame&&frame.getAttribute('data-main-class')!==cls)frame.setAttribute('data-main-class',cls);
}
function watch(main){
  if(main.__kidsWatch)return;main.__kidsWatch=true;
  syncMainKids(main);
  new MutationObserver(()=>syncMainKids(main)).observe(main,{childList:true,attributes:true,attributeFilter:['class']});
}
if(typeof document!=='undefined'){
  const find=()=>{const m=document.getElementById('main');if(m)watch(m);return m;};
  find();
  /* #main is created (and possibly rebuilt) by app.js inside #app: watch #app's direct children only */
  const app=document.getElementById('app');
  if(app)new MutationObserver(find).observe(app,{childList:true});
}
