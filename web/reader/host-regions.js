// The original normal mode shared the homepage HWND; this host uses a separate transparent HWND.
// Keep original module behavior and add only the missing normal-mode panel hit regions here.
export function hostRegionMessage(message,env=window){
 if(message.type!=='galHitRegions'||env.document.body?.classList.contains('tomoyo-ui-translation')||!message.menuOpen||message.regions?.length)return message;
 const scale=Number(env.devicePixelRatio)||1,regions=[];
 if(env.document.querySelector?.('.tome-menu-dragging,.tomoyo-menu-resizing'))return {...message,regions:[{x:0,y:0,width:Math.ceil(env.innerWidth*scale),height:Math.ceil(env.innerHeight*scale),menu:true}]};
 const panels=env.document.querySelectorAll('.tomoyo-cn-dialog[open],.tomoyo-cn-dialog[data-leaving],.tome-backlog[data-open],.tome-backlog[data-leaving],.mg-select-pop,.tome-qq-pop,.tome-color-panel,.tomoyo-selection-card,.tome-crop');
 for(const panel of panels){
  const style=env.getComputedStyle(panel);if(style.display==='none'||style.visibility==='hidden'||panel.closest('[hidden]')||!panel.getClientRects().length)continue;
  // As in the original interaction module, preserve untransformed fixed-panel bounds during animation.
  // The QQ card layer (关于) is scaled down in a small window: its painted box is the region, transform included.
  const fixed=panel.offsetParent===null&&style.position==='fixed'&&!panel.classList?.contains('tome-qq-pop'),r=fixed?{left:panel.offsetLeft,top:panel.offsetTop,right:panel.offsetLeft+panel.offsetWidth,bottom:panel.offsetTop+panel.offsetHeight}:panel.getBoundingClientRect();
  const x=Math.max(0,r.left),y=Math.max(0,r.top),right=Math.min(env.innerWidth,r.right),bottom=Math.min(env.innerHeight,r.bottom);
  if(right>x&&bottom>y)regions.push({x:Math.floor(x*scale),y:Math.floor(y*scale),width:Math.ceil((right-x)*scale),height:Math.ceil((bottom-y)*scale),menu:true});
 }
 return {...message,regions};
}

// In original normal mode the reporter deduplicates empty region arrays. It therefore cannot notify this
// separate host when switching tabs changes a panel's size. Observe only host geometry, without editing it.
export function installHostRegions(send,env=window){
 let queued=false,last='',watched=new Set();const resize=new env.ResizeObserver(schedule);
 function schedule(){if(!queued){queued=true;env.requestAnimationFrame(report);}}
 function report(){queued=false;if(env.document.body?.classList.contains('tomoyo-ui-translation')){last='';return;}
  const panels=[...env.document.querySelectorAll('.tomoyo-cn-dialog[open],.tomoyo-cn-dialog[data-leaving],.tome-backlog[data-open],.tome-backlog[data-leaving]')],next=new Set(panels);
  for(const panel of watched)if(!next.has(panel))resize.unobserve(panel);for(const panel of next)if(!watched.has(panel))resize.observe(panel);watched=next;
  const message=hostRegionMessage({type:'galHitRegions',menuOpen:panels.length>0,regions:[]},env),key=JSON.stringify(message);
  if(last!==key){last=key;send(message);}
 }
 new env.MutationObserver(schedule).observe(env.document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','hidden','open','data-open','data-leaving']});
 env.addEventListener('resize',schedule);env.document.addEventListener('scroll',schedule,true);schedule();
}
