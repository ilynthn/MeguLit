(function installMenuLayout(){
 'use strict';
 if(!document.documentElement||!window.__tomoyoChinese?.openSettings){document.addEventListener('DOMContentLoaded',installMenuLayout,{once:true});return;}
 const bridge=window.__tomoyoChinese;if(bridge.menuLayoutInstalled)return;bridge.menuLayoutInstalled=true;
 const ABOUT_HTML='';
 const categories=[['translate','翻译'],['text','文字'],['calibrate','校准'],['mask','内嵌'],['learn','学习'],['voice','语音'],['log','记录'],['misc','外观'],['about','关于']];
 const style=document.createElement('style');style.textContent=`
 .tomoyo-cn-dialog { --menu-bg:var(--theme-surface,#18181b);--menu-border:var(--theme-border,#34343a);--menu-accent:var(--theme-primary,#e0495a); background:var(--menu-bg)!important;color:var(--theme-text,#e8e9ec)!important;border:1px solid var(--menu-border)!important;border-radius:16px!important;box-shadow:0 16px 60px #0005!important;padding:0!important;width:520px!important;max-width:calc(100vw - 24px)!important;max-height:calc(100vh - 24px)!important;overflow:hidden!important;font:14px/1.55 'Microsoft YaHei',sans-serif!important; }
 .tomoyo-cn-dialog form { display:flex;flex-direction:column;height:min(730px,calc(100vh - 26px));margin:0; }
 .tomoyo-menu-header { padding:19px 22px 12px;flex-shrink:0; }
 .tomoyo-menu-header h3 { font-size:18px!important;letter-spacing:.03em;margin:0 0 3px!important; }
    /* The menu itself takes focus when opened: no focus ring around its corners (user, 2026-11-02). */
    .tomoyo-cn-dialog:focus,.tomoyo-cn-dialog:focus-visible { outline:none!important; }
 .tomoyo-menu-header small { margin:0!important;color:var(--theme-textSecondary,#aaa)!important;font-size:11px; }
 .tomoyo-menu-tabs { display:flex;flex-direction:column;gap:4px;width:82px;padding:12px 8px;border-right:1px solid var(--menu-border);grid-column:1;grid-row:2; } .tomoyo-cn-dialog form{display:grid!important;grid-template-columns:98px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto}.tomoyo-menu-header{grid-column:1 / -1}.tomoyo-menu-content{grid-column:2;grid-row:2}.tomoyo-cn-dialog footer{grid-column:1 / -1}
 .tomoyo-menu-tabs button { flex:1;padding:8px 4px;border:0;border-radius:8px;background:transparent;color:var(--theme-textSecondary,#aaa);font:inherit;cursor:pointer; }
 .tomoyo-menu-tabs button[aria-selected=true] { background:color-mix(in srgb,var(--menu-accent) 17%,transparent);color:var(--menu-accent);font-weight:700; }
 .tomoyo-menu-content { overflow:auto;min-height:0;flex:1;padding:10px 22px 20px; }
 .tomoyo-cn-dialog .tomoyo-gal-fields,.tomoyo-cn-dialog .tomoyo-learning-panel { border:0!important;padding:0!important;margin:0!important;min-width:0; }
 .tomoyo-cn-dialog .tomoyo-gal-fields > legend { display:none; }
 .tomoyo-cn-dialog label { margin-top:12px!important;color:var(--theme-text,#e8e9ec)!important;font-size:13px; }
 .tomoyo-cn-dialog input,.tomoyo-cn-dialog select { background:var(--theme-background,#0d0d0f)!important;color:var(--theme-text,#e8e9ec)!important;border:1px solid var(--menu-border)!important;border-radius:8px!important;padding:8px 10px;accent-color:var(--menu-accent)!important; }
 .tomoyo-cn-dialog input[type=range] { padding:0!important;border:0!important;margin-top:10px; }
 .tomoyo-cn-dialog input[type=checkbox] { accent-color:var(--menu-accent)!important; }
 .tomoyo-cn-dialog input[type=color] { width:100%;height:35px!important;padding:4px!important; }
 .tomoyo-cn-dialog small { color:var(--theme-textSecondary,#aaa)!important;font-size:11px!important;line-height:1.6!important; }
 .tomoyo-cn-dialog details { border-color:var(--menu-border)!important;padding-top:13px!important;margin-top:16px!important; }
 .tomoyo-cn-dialog summary { color:var(--theme-text,#e8e9ec)!important;font-size:13px;font-weight:600; }
 .tomoyo-cn-dialog button { color:var(--theme-text,#e8e9ec);background:var(--theme-background,#0d0d0f);border-color:var(--menu-border);font:inherit; }
 .tomoyo-cn-dialog footer { border-top:1px solid var(--menu-border);padding:12px 20px;margin:0!important;background:var(--menu-bg);flex-shrink:0; }
 /* Over the game the menu is translucent; its picture and opacity come from background.js (Misc tab). No
    backdrop-filter: re-blurring the whole transparent overlay every frame made other video on the PC stutter. */
 body.tomoyo-ui-translation .tomoyo-cn-dialog { background:color-mix(in srgb,var(--theme-surface,#18181b) 72%,transparent)!important; }
 body.tomoyo-ui-translation .tomoyo-cn-dialog footer { background:transparent; }
 .tomoyo-cn-dialog footer button { border-radius:8px!important;padding:7px 16px!important;background:transparent!important;color:var(--theme-text,#e8e9ec)!important;border:1px solid var(--menu-border)!important; }
 .tomoyo-cn-dialog footer button[type=submit] { background:var(--menu-accent)!important;border-color:var(--menu-accent)!important;color:#fff!important; }
 .tomoyo-cn-dialog [data-menu-category][hidden],.tomoyo-cn-dialog .tomoyo-gal-fields[hidden] { display:none!important; }
 .tomoyo-menu-resize { position:absolute; z-index:20; touch-action:none }
 .tomoyo-menu-resize[data-edge=n],.tomoyo-menu-resize[data-edge=s] { left:12px; right:12px; height:7px; cursor:ns-resize }
 .tomoyo-menu-resize[data-edge=e],.tomoyo-menu-resize[data-edge=w] { top:12px; bottom:12px; width:7px; cursor:ew-resize }
 .tomoyo-menu-resize[data-edge=n] { top:0 } .tomoyo-menu-resize[data-edge=s] { bottom:0 } .tomoyo-menu-resize[data-edge=e] { right:0 } .tomoyo-menu-resize[data-edge=w] { left:0 }
 .tomoyo-menu-resize[data-edge=nw],.tomoyo-menu-resize[data-edge=ne],.tomoyo-menu-resize[data-edge=sw],.tomoyo-menu-resize[data-edge=se] { width:14px; height:14px }
 .tomoyo-menu-resize[data-edge=nw] { top:0; left:0; cursor:nwse-resize } .tomoyo-menu-resize[data-edge=se] { bottom:0; right:0; cursor:nwse-resize }
 .tomoyo-menu-resize[data-edge=ne] { top:0; right:0; cursor:nesw-resize } .tomoyo-menu-resize[data-edge=sw] { bottom:0; left:0; cursor:nesw-resize }
 .tomoyo-menu-header { cursor:move;touch-action:none;user-select:none;-webkit-app-region:no-drag; }
 body.tomoyo-ui-translation .tomoyo-cn-dialog { box-shadow:none!important; }
 /* The window region is a plain rectangle a few px larger than each card, so a soft shadow shows up as a dark band around it. */
 body.tomoyo-ui-translation :is(.lookup-tooltip,.tomoyo-selection-card) { box-shadow:none!important; }
 /* Alt+T: the panel unfolds from its horizontal centre line up and down, and folds back to it on close. */
 /* Only scale and opacity are animated, so the compositor runs it at full frame rate; clip-path and blur forced a
    repaint of the whole panel every frame (about 25 fps). "scale" leaves the drag offset in "transform" alone. */
 .tomoyo-cn-dialog.tome-menu-enter { transform-origin:50% 50%; will-change:scale,opacity; animation:tome-menu-unfold .3s cubic-bezier(.16,1,.3,1) both!important; }
 .tomoyo-cn-dialog[data-leaving] { display:block!important; pointer-events:none!important; transform-origin:50% 50%; will-change:scale,opacity; animation:tome-menu-fold .17s cubic-bezier(.5,0,.75,0) both!important; }
 @keyframes tome-menu-unfold { from { scale:.97; opacity:0; } to { scale:1; opacity:1; } }
 @keyframes tome-menu-fold { from { scale:1; opacity:1; } to { scale:.97; opacity:0; } }
 .tomoyo-cn-dialog.tome-menu-enter > * { animation:tome-menu-content .3s cubic-bezier(.3,0,.2,1) both; }
 @keyframes tome-menu-content { from { opacity:0; } 35% { opacity:0; } to { opacity:1; } }
 /* Dragging: the panel follows the pointer with a GPU transform and lifts slightly. */
 .tomoyo-cn-dialog.tome-menu-dragging { transition:box-shadow .16s ease,scale .16s ease!important; scale:1.006; cursor:grabbing; will-change:transform; }
 .tomoyo-cn-dialog.tome-menu-dragging .tomoyo-menu-header { cursor:grabbing; }
 .tomoyo-cn-dialog.tome-menu-settle { transition:scale .2s cubic-bezier(.2,.8,.2,1)!important; }
 body:not(.tomoyo-ui-translation) .tomoyo-cn-dialog.tome-menu-dragging { box-shadow:0 30px 80px rgba(0,0,0,.5)!important; }
 .tomoyo-cn-dialog .tome-mask-card { margin-top:14px; padding:2px 14px 14px; border:1px solid var(--mg-line,var(--menu-border)); border-radius:14px; background:color-mix(in srgb,var(--theme-text,#eee) 2.5%,transparent); }
 .tomoyo-cn-dialog .tome-mask-card > h4 { margin:12px 0 2px!important; }
 .tomoyo-cn-dialog .tome-mask-card .tome-hooks { margin:10px 0 0; padding:0; border:0; background:transparent; }
 .tomoyo-cn-dialog .tome-mask-card details { margin-top:12px!important; }
 .tomoyo-cn-dialog .tome-mask-legacy { margin-top:10px; padding-top:6px; border-top:1px dashed var(--mg-line,var(--menu-border)); }
 @media (prefers-reduced-motion: reduce) { .tomoyo-cn-dialog.tome-menu-enter,.tomoyo-cn-dialog[data-leaving] { animation-duration:1ms!important; } }
 .tomoyo-cn-dialog.tomoyo-menu-resizing, .tomoyo-cn-dialog.tomoyo-menu-resizing * { user-select:none!important }
 .tomoyo-menu-tabs { overflow-y:auto; overflow-x:hidden }
 .tomoyo-about h4 { margin:18px 0 6px!important; font-size:13px; color:var(--theme-text,#e8e9ec) }
 .tomoyo-about p,.tomoyo-about li { font-size:12px; line-height:1.7; color:var(--theme-textSecondary,#aaa); margin:4px 0; user-select:text }
 .tomoyo-about ul { padding-left:18px; margin:4px 0 }
 .tomoyo-about code { user-select:text; font-size:11.5px; padding:1px 5px; border-radius:5px; background:var(--theme-background,#0d0d0f); border:1px solid var(--menu-border); overflow-wrap:anywhere }
 .tomoyo-about .tomoyo-about-card { padding:12px 14px; border:1px solid var(--menu-border); border-radius:12px; margin-top:12px }
 .tomoyo-about .tomoyo-about-card b { color:var(--menu-accent) }
 .tomoyo-about button { margin-left:6px; padding:1px 8px; border-radius:6px; border:1px solid var(--menu-border); cursor:pointer; font-size:11px }
 .tomoyo-cn-dialog .tomoyo-slider-value { color:var(--menu-accent)!important;font-size:12px; }
 .tomoyo-cn-dialog .tomoyo-mask-state,.tomoyo-cn-dialog .tomoyo-gal-state,.tomoyo-cn-dialog .tomoyo-cn-status { font-size:11px;color:var(--theme-textSecondary,#aaa)!important;overflow-wrap:anywhere; }
 `;(document.head||document.documentElement).appendChild(style);
 function installMenuDrag(dialog){
  const header=dialog.querySelector('.tomoyo-menu-header');if(!header||header.dataset.menuDrag)return;header.dataset.menuDrag='true';
  const key='tomoyo-menu-position-'+(document.body.classList.contains('tomoyo-ui-translation')?'overlay':'normal');
  const clamp=(x,y,w,h)=>({x:Math.max(4,Math.min(Math.max(4,innerWidth-w-4),x)),y:Math.max(4,Math.min(Math.max(4,innerHeight-h-4),y))});
  /* A moved panel must move its click and glass regions too (user, 2026-11-09: clicks on a dragged or restored Alt+T menu
     went through to the game and advanced the story). ResizeObserver reports size, not position, so refresh here. */
  const regions=()=>requestAnimationFrame(()=>window.__tomoyoHitRegionsRefresh?.(true));
  const place=(x,y)=>{const r=dialog.getBoundingClientRect(),p=clamp(x,y,r.width,r.height);for(const [k,v]of [['left',p.x+'px'],['top',p.y+'px'],['right','auto'],['bottom','auto'],['margin','0']])dialog.style.setProperty(k,v,'important');regions();return p;};
  try{const pos=JSON.parse(localStorage.getItem(key)||'null');if(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y)){if(document.body.classList.contains('tomoyo-ui-translation')){dialog.style.setProperty('left',pos.x+'px','important');dialog.style.setProperty('top',pos.y+'px','important');dialog.style.setProperty('right','auto','important');dialog.style.setProperty('bottom','auto','important');dialog.style.setProperty('margin','0','important');regions();}else place(pos.x,pos.y);}}catch{}
  // The panel moves with a transform while the pointer is down (one compositor update per frame, no relayout and no
  // window-region change per event); the final position is written once on release.
  header.addEventListener('pointerdown',down=>{
   if(down.button!==0||down.target.closest('button,input,select,a,[data-edge]'))return;down.preventDefault();header.setPointerCapture(down.pointerId);
   const r=dialog.getBoundingClientRect(),start=place(r.left,r.top);let pos=start,frame=0,lastEvent=down;
   dialog.classList.remove('tome-menu-settle');dialog.classList.add('tomoyo-menu-resizing','tome-menu-dragging');
   const paint=()=>{frame=0;pos=clamp(start.x+lastEvent.clientX-down.clientX,start.y+lastEvent.clientY-down.clientY,r.width,r.height);dialog.style.setProperty('transform','translate3d('+(pos.x-start.x)+'px,'+(pos.y-start.y)+'px,0)','important');};
   const move=e=>{lastEvent=e.getCoalescedEvents?.().at(-1)||e;if(!frame)frame=requestAnimationFrame(paint);};
   const up=()=>{header.removeEventListener('pointermove',move);header.removeEventListener('pointerup',up);header.removeEventListener('pointercancel',up);if(frame){cancelAnimationFrame(frame);paint();}
    dialog.style.removeProperty('transform');place(pos.x,pos.y);dialog.classList.remove('tome-menu-dragging');dialog.classList.add('tome-menu-settle');dialog.classList.remove('tomoyo-menu-resizing');setTimeout(()=>dialog.classList.remove('tome-menu-settle'),220);try{localStorage.setItem(key,JSON.stringify(pos));}catch{}};
   header.addEventListener('pointermove',move);header.addEventListener('pointerup',up);header.addEventListener('pointercancel',up);
  });
 }
 function decorate(dialog){
  if(!dialog||dialog.dataset.menuOrganized)return;
  const form=dialog.querySelector('form'),group=dialog.querySelector('.tomoyo-gal-fields');if(!form||!group)return;
  dialog.dataset.menuOrganized='true';
  const header=document.createElement('header');header.className='tomoyo-menu-header';header.innerHTML='<h3>MeguLit</h3><small>Alt+M 开关主页 · Alt+T 开关菜单 · 拖动即时预览</small>';
  const nav=document.createElement('nav');nav.className='tomoyo-menu-tabs';nav.setAttribute('role','tablist');
  const content=document.createElement('div');content.className='tomoyo-menu-content';
  const footer=form.querySelector('footer');
  const panels={};for(const [key,label] of categories){const p=document.createElement('section');p.dataset.menuCategory=key;panels[key]=p;const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('role','tab');b.dataset.menuKey=key;nav.appendChild(b);b.onclick=()=>{activate(key);try{localStorage.setItem('tomoyo-menu-tab',key);content.scrollTop=0;}catch{}};}
  // 文字: font/size/outline per language, colours and spacing, each its own collapsed group (user, 2026-11-02).
  // 校准: calibration, position, live following, window binding, imports and history only.
  const text=panels.text,calibration=panels.calibrate;text.classList.add('tome-text-panel');calibration.classList.add('tome-calibration-panel');
  const section=(host,title,attr)=>{const d=document.createElement('details');d.dataset[attr]='';const summary=document.createElement('summary');summary.textContent=title;d.append(summary);host.append(d);return d;};
  const general=document.createElement('div');general.className='tome-text-general';text.append(general);
  const jp=section(text,'日文设置','textJapanese'),cn=section(text,'中文设置','textChinese'),ruby=section(text,'注音设置','textRuby'),palette=section(text,'颜色设置','textColours'),colours=section(palette,'已读 / 未读设置','textDialogueColours'),choiceColours=section(palette,'已选 / 未选设置','textChoiceColours'),spacing=section(text,'行距与间距','textSpacing'),gameFont=section(text,'游戏字体','textGameFont');
  // Position and live follow sit directly in the calibration page, not in a fold (user, 2026-11-02); only window binding folds.
  const position=document.createElement('div');position.dataset.calibrationPosition='';calibration.append(position);
  const advanced=document.createElement('details');advanced.innerHTML='<summary>窗口绑定（高级）</summary>';position.append(advanced);
  const layout=group.querySelector('.tomoyo-gal-layout');if(layout){for(const n of [...layout.children])if(n.tagName!=='SUMMARY')group.insertBefore(n,layout);layout.remove();}
  const unwrap=(node,host)=>{for(const child of [...node.children])if(child.tagName!=='SUMMARY')host.append(child);node.remove();};
  const sizes=[];
  for(const n of [...group.children]){
   if(n.tagName==='LEGEND')continue;
   const names=[...n.querySelectorAll('[name]')].map(x=>x.name);if(n.name)names.push(n.name);
   const mask=names.some(x=>/^gal(Mask|Scan|Blur|Fast|Hook|HideWait|RelocateWait|WaitCover)/.test(x))||n.hasAttribute('data-gal-hook-options')||n.classList.contains('tomoyo-mask-state')||(n.tagName==='SMALL'&&/遮罩|局部模糊|扫描/.test(n.textContent));
   if(mask){panels.mask.append(n);continue;}
   if(n.classList.contains('tome-game-style-sync')){calibration.prepend(n);continue;}
   const pos=names.some(x=>/^gal(X|Y|Width|Height|Preset|Game|LivePosition)$/.test(x))||['bind','unbind','refresh','drag'].some(k=>n.hasAttribute('data-gal-'+k))||n.classList.contains('tome-position-sync')||n.classList.contains('tomoyo-gal-state');
   if(pos){const windowControl=names.some(x=>/^gal(Game|Preset)$/.test(x))||['bind','unbind','refresh'].some(k=>n.hasAttribute('data-gal-'+k))||n.classList.contains('tomoyo-gal-state');(windowControl?advanced:position).append(n);continue;}
   if(n.classList.contains('tomoyo-gal-spacing')){unwrap(n,spacing);continue;}
   if(n.hasAttribute('data-megulit-english')){text.insertBefore(n,ruby);continue;}
   if(n.classList.contains('tomoyo-ruby-menu')){unwrap(n,ruby);continue;}
   if(n.tagName==='DETAILS'&&names.some(x=>/^galJapanese(Font|Outline)/.test(x))){unwrap(n,jp);continue;}
   if(n.tagName==='DETAILS'&&names.some(x=>/^galChinese(Font|Outline)/.test(x))){unwrap(n,cn);continue;}
   if(names.some(x=>/^gal(Japanese|Chinese)Size$/.test(x))){sizes.push(n);continue;}
   if(n.hasAttribute('data-megulit-choice-fields')){choiceColours.append(n);continue;}
   if(names.some(x=>/^gal(TextColor|ReadTextColor|TextGradient|ReadTextGradient|Shadow)/.test(x))){colours.append(n);continue;}
   if(names.includes('galFurigana')){ruby.append(n);continue;}
   if(n.tagName==='SMALL'&&/字体/.test(n.textContent)){gameFont.append(n);continue;}
   general.append(n);
  }
  const uiLang=document.documentElement.lang.slice(0,2),colourTitles={en:['Read / unread','Selected / unselected'],ja:['既読・未読','選択済み・未選択']}[uiLang];
  if(colourTitles)for(const [i,section] of [colours,choiceColours].entries()){const summary=section.querySelector('summary');summary.dataset.noI18n='';summary.textContent=colourTitles[i];}
  // Each size goes into its own language group, right under that language's font.
  const placeSize=(name,host,font)=>{for(const n of sizes){const field=n.querySelector('[name='+name+']');if(!field)continue;const label=field.closest('label');const anchor=host.querySelector('[name='+font+']')?.closest('label');if(anchor)anchor.after(label);else host.prepend(label);}};
  placeSize('galJapaneseSize',jp,'galJapaneseFont');placeSize('galChineseSize',cn,'galChineseFont');for(const n of sizes)if(!n.querySelector('[name]'))n.remove();
  const history=document.createElement('details');history.className='tome-calibration-history';history.dataset.noI18n='';history.innerHTML='<summary></summary><div data-calibration-history-list></div>';calibration.append(history);
  group.append(text,calibration,panels.mask);
  const about=panels.about;about.classList.add('tomoyo-about');about.replaceChildren(window.__tomeAboutPanel?.()||document.createTextNode('MeguLit'));
  for(const n of [...form.children]){
   if(n===footer||n===group)continue;
   if(n.tagName==='H3'||n.tagName==='SMALL'){n.remove();continue;}
   if(n.classList.contains('tomoyo-learning-panel')||n.querySelector('.tomoyo-learning-panel'))panels.learn.append(n);
   else if(n.querySelector('[name=font]')){n.style.display='none';general.append(n);}else panels.translate.append(n);
  }
  content.append(panels.translate,group,panels.learn,panels.voice,panels.log,panels.misc,panels.about);form.prepend(header,nav,content);if(footer)form.append(footer);
  bridge.calibrationMenuOpened?.(dialog);
  // Resizable like a normal window: drag any edge or corner. Size is remembered; double-click an edge to reset.
  // Normal window and translation overlay have very different sizes, so each mode remembers its own menu size.
  const MIN_W=380,MIN_H=360,SIZE_KEY='tomoyo-menu-size-'+(document.body.classList.contains('tomoyo-gal-bound')||document.body.classList.contains('tomoyo-ui-translation')?'overlay':'normal');
  const applySize=(w,h)=>{dialog.style.setProperty('width',w+'px','important');dialog.style.setProperty('max-width','calc(100vw - 8px)','important');dialog.style.setProperty('max-height','calc(100vh - 8px)','important');form.style.setProperty('height',h+'px','important');};
  // A size clamped to the minimum was recorded while the reader was confined to the floating text box (2026-11-02):
  // it is ignored, and nothing is recorded while the window itself is that small.
  try{const saved=JSON.parse(localStorage.getItem(SIZE_KEY)||'null');if(saved&&saved.w>=MIN_W&&saved.h>MIN_H+4)applySize(Math.min(saved.w,innerWidth-8),Math.min(saved.h,innerHeight-10));}catch{}
  for(const edge of ['n','s','e','w','nw','ne','sw','se']){
   const handle=document.createElement('div');handle.className='tomoyo-menu-resize';handle.dataset.edge=edge;dialog.appendChild(handle);
   handle.addEventListener('dblclick',()=>{for(const p of ['width','max-width','max-height','left','top','right','bottom','margin'])dialog.style.removeProperty(p);form.style.removeProperty('height');try{localStorage.removeItem(SIZE_KEY);}catch{}});
   handle.addEventListener('pointerdown',down=>{
    if(down.button!==0)return;down.preventDefault();down.stopPropagation();handle.setPointerCapture(down.pointerId);
    const r=dialog.getBoundingClientRect(),startH=form.getBoundingClientRect().height,extra=r.height-startH;
    // Pin the dialog where it is so growing one edge does not move the opposite one.
    for(const [p,v] of [['left',r.left+'px'],['top',r.top+'px'],['right','auto'],['bottom','auto'],['margin','0']])dialog.style.setProperty(p,v,'important');
    dialog.classList.add('tomoyo-menu-resizing');let w=r.width,h=startH;
    const move=e=>{const dx=e.clientX-down.clientX,dy=e.clientY-down.clientY;let left=r.left,top=r.top;w=r.width;h=startH;
     if(edge.includes('e'))w=Math.max(MIN_W,Math.min(innerWidth-r.left-4,r.width+dx));
     if(edge.includes('w')){w=Math.max(MIN_W,Math.min(r.right-4,r.width-dx));left=r.right-w;}
     if(edge.includes('s'))h=Math.max(MIN_H,Math.min(innerHeight-r.top-extra-4,startH+dy));
     if(edge.includes('n')){h=Math.max(MIN_H,Math.min(r.bottom-extra-4,startH-dy));top=r.bottom-extra-h;}
     dialog.style.setProperty('left',left+'px','important');dialog.style.setProperty('top',top+'px','important');applySize(Math.round(w),Math.round(h));};
    const up=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);dialog.classList.remove('tomoyo-menu-resizing');if(innerHeight>=520)try{localStorage.setItem(SIZE_KEY,JSON.stringify({w:Math.round(w),h:Math.round(h)}));}catch{}};
    handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);
   });
  }

  installMenuDrag(dialog);
  function activate(key){dialog.dataset.menuTab=key;for(const [name,panel] of Object.entries(panels))panel.hidden=name!==key;group.hidden=!['text','calibrate','mask'].includes(key);for(const b of nav.querySelectorAll('button'))b.setAttribute('aria-selected',String(b.dataset.menuKey===key));}
  // Reopen on the tab (and scroll position) used last time instead of always starting at 文字.
  let saved='calibrate';try{let t=localStorage.getItem('tomoyo-menu-tab');if(t==='layout')t='calibrate';if(categories.some(([k])=>k===t))saved=t;}catch{}activate(saved);
  content.scrollTop=0;
  // Expanded sections are remembered too.
  let openSections={};try{openSections=JSON.parse(localStorage.getItem('tomoyo-menu-sections')||'{}')||{};}catch{}
  for(const d of dialog.querySelectorAll('details')){const name=d.querySelector('summary')?.textContent?.trim();if(!name)continue;d.addEventListener('toggle',()=>{openSections[name]=d.open;try{localStorage.setItem('tomoyo-menu-sections',JSON.stringify(openSections));}catch{}});}
  let scrollTimer=0;content.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{try{localStorage.setItem('tomoyo-menu-scroll-'+(dialog.dataset.menuTab||'calibrate'),String(Math.round(content.scrollTop)));}catch{}},200);});
 }
 // 遮挡 page: one card for hiding the original text, one for the click-wait icon, immersion mode, then scan range, then diagnostics.
 // Idempotent: nodes are only moved when they are not already in place, so the observer that calls this settles.
 function organizeMask(panel){
  if(!panel)return;const q=sel=>panel.querySelector(sel);
  const card=(cls,title)=>{let c=panel.querySelector(':scope>.'+cls);if(!c){c=document.createElement('div');c.className='tome-mask-card '+cls;const h=document.createElement('h4');h.textContent=title;c.append(h);}return c;};
  const hide=card('tome-mask-hide','原文隐藏'),wait=card('tome-mask-wait','点击等待图标');
  const put=(parent,nodes)=>{for(const n of nodes)if(n&&n.parentElement!==parent)parent.append(n);};
  const opts=q('[data-gal-hook-options]');
  put(hide,[q('[name=galMaskMode]')?.closest('label'),opts,q('[data-gal-full-color]')]);
  put(wait,[q('[name=galRelocateWaitMarker]')?.closest('label'),q('[name=galHideWaitMarker]')?.closest('label'),q('[name=galWaitCoverStyle]')?.closest('label'),q('[data-gal-wait-state]')]);
  let diag=q(':scope>details.tome-mask-diag');if(!diag){diag=document.createElement('details');diag.className='tome-mask-diag';diag.innerHTML='<summary>状态与诊断</summary>';}
  put(diag,[q('.tomoyo-mask-state:not([data-gal-wait-state])'),q('.tomoyo-v4-hook')]);
  // The old single-stream picker duplicates the stream list; keep it, but inside the advanced section.
  const adv=opts?.querySelector('.tome-hook-advanced');
  if(adv){let legacy=adv.querySelector(':scope>.tome-mask-legacy');if(!legacy){legacy=document.createElement('div');legacy.className='tome-mask-legacy';adv.append(legacy);}
   put(legacy,[opts.querySelector('[name=galHookThread]')?.closest('label'),opts.querySelector('[data-gal-hook-select]'),opts.querySelector('.tomoyo-hook-state'),...[...opts.children].filter(n=>n.tagName==='SMALL')]);}
  const scan=[...panel.querySelectorAll(':scope>details')].find(d=>d!==diag);
  // Immersion mode sits in the embed tab right below the click-wait icon card (user, 2026-11-03), as a card of its own.
  const imm=q(':scope>.tomoyo-v4-immersion');if(imm&&!imm.classList.contains('tome-mask-card'))imm.classList.add('tome-mask-card');
  const order=[hide,wait,imm,scan,diag].filter(Boolean),kids=[...panel.children].filter(n=>order.includes(n));
  if(kids.length!==order.length||kids.some((n,i)=>n!==order[i]))for(const n of order)panel.append(n);
 }
 // Opening animation, and a short fold-away for closing (settings.js hands the closed dialog to menuLeave).
 const nativeShow=HTMLDialogElement.prototype.show;
 // The unfold animation can start one frame late (its clip-path runs on the compositor), and that first frame showed
 // the whole empty panel as a dark block over the dialogue text. An inline folded state covers that frame; the
 // running animation overrides it, and it is cleared together with the animation class.
 // The whole menu stays inside the window: a saved position (or a window made smaller since) could leave part of it
 // outside. Measured with offsetWidth/Height, which the opening scale does not change. When the window is smaller
 // than the menu, its top-left corner wins, so the header and the tabs stay reachable.
 function fitMenu(d){if(!d?.open||d.hasAttribute('data-leaving')||d.dataset.surfacePending)return;const w=d.offsetWidth,h=d.offsetHeight,cs=getComputedStyle(d),x=parseFloat(cs.left),y=parseFloat(cs.top);if(!w||!Number.isFinite(x)||!Number.isFinite(y))return;
  const nx=Math.max(4,Math.min(innerWidth-w-4,x)),ny=Math.max(4,Math.min(innerHeight-h-4,y));if(Math.abs(nx-x)<1&&Math.abs(ny-y)<1)return;for(const [k,v] of [['left',nx+'px'],['top',ny+'px'],['right','auto'],['bottom','auto'],['margin','0']])d.style.setProperty(k,v,'important');}
 addEventListener('resize',()=>fitMenu(document.querySelector('.tomoyo-cn-dialog[open]:not([data-leaving])')));
 HTMLDialogElement.prototype.show=function(){const menu=this.classList.contains('tomoyo-cn-dialog')&&!this.hasAttribute('data-leaving');
  if(menu){if(document.body.classList.contains('tomoyo-ui-translation'))this.dataset.surfacePending='true';this.style.setProperty('scale','1 .03');this.style.setProperty('opacity','0');}
  const result=nativeShow.apply(this,arguments);if(menu){fitMenu(this);this.classList.remove('tome-menu-enter');
   // Over a game the window only paints inside its region, which grows to the menu a little later (page → launcher →
   // GalWindowBridge). Hold the folded, transparent state until the bridge confirms the new region, or the opening
   // panel showed through the dialogue line as a dark bar. 250 ms is the fallback.
   const start=()=>{if(!this.open||this.hasAttribute('data-leaving'))return;delete this.dataset.surfacePending;fitMenu(this);void this.offsetWidth;this.classList.add('tome-menu-enter');let cleared=false;const done=()=>{if(cleared)return;cleared=true;this.classList.remove('tome-menu-enter');for(const k of ['scale','opacity','transform','translate','rotate'])this.style.removeProperty(k);};const end=e=>{if(e.target!==this)return;this.removeEventListener('animationend',end);done();};this.addEventListener('animationend',end);setTimeout(done,450);};
   if(document.body.classList.contains('tomoyo-ui-translation')){window.__tomeWaitForSurface(this,start);}
   else start();}return result;};
 bridge.menuLeave=dialog=>{if(!dialog?.isConnected){dialog?.remove();return;}dialog.classList.remove('tome-menu-enter','tome-menu-dragging','tomoyo-menu-resizing');dialog.setAttribute('data-leaving','');let gone=false;const finish=()=>{if(gone)return;gone=true;dialog.remove();};dialog.addEventListener('animationend',finish,{once:true});setTimeout(finish,320);};
 const finishLeaving=()=>{for(const ghost of document.querySelectorAll('.tomoyo-cn-dialog[data-leaving]'))ghost.remove();};
 function refresh(){
  const dialog=document.querySelector('.tomoyo-cn-dialog:not([data-leaving])');decorate(dialog);
  if(dialog?.dataset.menuOrganized){const panel=dialog.querySelector('[data-menu-category=learn]');for(const node of dialog.querySelectorAll('.tomoyo-learning-panel'))if(panel&&!panel.contains(node))panel.appendChild(node);const maskPanel=dialog.querySelector('[data-menu-category=mask]');for(const node of dialog.querySelectorAll('.tomoyo-v4-immersion'))if(maskPanel&&!maskPanel.contains(node))maskPanel.appendChild(node);for(const node of dialog.querySelectorAll('.tomoyo-v4-hook'))if(maskPanel&&!maskPanel.contains(node))maskPanel.appendChild(node);const voice=dialog.querySelector('[data-menu-category=voice]');for(const node of dialog.querySelectorAll('.tomoyo-v4-voice'))if(voice&&!voice.contains(node))voice.appendChild(node);organizeMask(maskPanel);}
 }
 const open=bridge.openSettings;bridge.openSettings=()=>{finishLeaving();open();refresh();};new MutationObserver(refresh).observe(document.documentElement,{subtree:true,childList:true});
})();
