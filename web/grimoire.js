// SPDX-License-Identifier: GPL-3.0-or-later
// 魔导书 (grimoire) home: words, explosion glow, title marquee, shelf fit, greeting placement, close dialog, tools page.
// Everything here is presentation only; actions still go through app.js (launch, detail, navigate, preferences).

export const words={
 zh:{kicker:'上次读到',recent:'最近游玩',all:'全部游戏',today:'今天',full:'完整统计',read:'今日阅读',words:'已收录单词',lookups:'今日查词',total:'累计阅读',chars:'已读字数',linked:'关联单词',min:'分钟',hour:'小时',unitWord:'个',unitTimes:'次',tools:'工具',settings:'设置',empty:'书架还是空的',emptySub:'添加游戏后，这里会接着你上次读到的地方',
  closeTitle:'关闭 MeguLit',closeSub:'关闭窗口后，要让 MeguLit 留在托盘里吗',tray:'最小化到托盘',trayHint:'继续在后台运行，游戏内的阅读和查词不受影响',quit:'彻底退出',quitHint:'关闭 MeguLit 和阅读窗口',remember:'不再提醒',rememberHint:'之后可以在 设置 → 常规 里重新打开提醒',cancel:'取消',ok:'确定',
  toolsCount:n=>n+' 项',researching:'研究中',toolPending:'这个工具还在研究，确认方案后实现',
  toolList:[['日文原版恢复','游戏自带日文数据时，把显示语言恢复为日文原文，供 Hook 与内嵌双语使用。自动备份，可一键还原','检测游戏内是否含日文数据 · 只改选中的游戏'],['修复内嵌替换','选择游戏 EXE，自动诊断内嵌为什么变成只读，能修就修，修不了说明原因','预检 → 备份 → 修复 → 重启游戏验证 · 失败自动回滚']]},
 en:{kicker:'Last read',recent:'Recently played',all:'All games',today:'Today',full:'Full statistics',read:'Read today',words:'Saved words',lookups:'Lookups today',total:'Total reading',chars:'Characters read',linked:'Linked words',min:'min',hour:'h',unitWord:'',unitTimes:'',tools:'Tools',settings:'Settings',empty:'The shelf is empty',emptySub:'Add a game and this is where you pick up where you left off',
  closeTitle:'Close MeguLit',closeSub:'Keep MeguLit in the tray after closing the window?',tray:'Minimize to tray',trayHint:'Keeps running; in-game reading and lookups keep working',quit:'Quit',quitHint:'Close MeguLit and the reading window',remember:'Don\'t ask again',rememberHint:'You can turn this back on in Settings → General',cancel:'Cancel',ok:'OK',
  toolsCount:n=>n+' tools',researching:'In research',toolPending:'This tool is still being researched',
  toolList:[['Restore Japanese original','When a game ships its Japanese data, switch the displayed language back to the Japanese original for Hook and bilingual embedding. Backed up, one-click restore','Checks for Japanese data in the game · only changes the selected game'],['Repair embedded replacement','Pick the game EXE; MeguLit finds why embedding became read-only and repairs it, or explains why it cannot','Check → back up → repair → relaunch and verify · rolls back on failure']]},
 ja:{kicker:'前回の続き',recent:'最近プレイ',all:'すべてのゲーム',today:'今日',full:'詳しい統計',read:'今日の読書',words:'収録した単語',lookups:'今日の辞書引き',total:'累計読書',chars:'読んだ文字数',linked:'関連単語',min:'分',hour:'時間',unitWord:'語',unitTimes:'回',tools:'ツール',settings:'設定',empty:'本棚はまだ空です',emptySub:'ゲームを追加すると、ここから続きを読めます',
  closeTitle:'MeguLit を閉じる',closeSub:'ウィンドウを閉じたあと、MeguLit をトレイに残しますか',tray:'トレイに格納',trayHint:'バックグラウンドで動き続け、ゲーム内の読書と辞書は使えます',quit:'終了',quitHint:'MeguLit と読書ウィンドウを閉じます',remember:'次回から確認しない',rememberHint:'設定 → 一般 でもう一度オンにできます',cancel:'キャンセル',ok:'OK',
  toolsCount:n=>n+' 件',researching:'調査中',toolPending:'このツールはまだ調査中です',
  toolList:[['日本語原版に戻す','ゲームに日本語データが入っている場合、表示言語を日本語原文に戻して Hook と埋め込み二言語表示に使います。自動バックアップ、ワンクリックで復元','ゲーム内の日本語データを確認 · 選んだゲームだけを変更'],['埋め込み置換の修復','ゲームの EXE を選ぶと、埋め込みが読み取り専用になった原因を調べ、直せるものは直し、直せないものは理由を示します','事前確認 → バックアップ → 修復 → 再起動して確認 · 失敗時は自動で戻す']]}
};

/* ---------- explosion glow: three main colours of the last-played cover ---------- */
const paletteCache=new Map();
const FALLBACK=[{c:'#b22730',w:.4},{c:'#d05b34',w:.35},{c:'#edb56e',w:.25}];
function coverPalette(src){
 if(!src)return Promise.resolve(FALLBACK);
 if(paletteCache.has(src))return paletteCache.get(src);
 const job=new Promise(res=>{const analyse=img=>{
  try{
   const c=document.createElement('canvas');c.width=48;c.height=72;const x=c.getContext('2d',{willReadFrequently:true});
   x.drawImage(img,0,0,48,72);const d=x.getImageData(0,0,48,72).data;
   // E259: group by hue so three genuinely different colours win (white counts as one), each weighted by its share
   const hsl=(r,g,b)=>{r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,dd=mx-mn;if(!dd)return [0,0,l];const s=dd/(1-Math.abs(2*l-1));let h=mx===r?((g-b)/dd)%6:mx===g?(b-r)/dd+2:(r-g)/dd+4;return [(h*60+360)%360,s,l];};
   const light={n:0,r:0,g:0,b:0},hues=new Map();let total=0;
   for(let i=0;i<d.length;i+=4){if(d[i+3]<128)continue;const r=d[i],g=d[i+1],b=d[i+2],[h,sat,l]=hsl(r,g,b);total++;
    if(l>.9||(l>.78&&sat<.45)){light.n++;light.r+=r;light.g+=g;light.b+=b;continue;}
    if(l<.16||sat<.22)continue;const k=Math.floor(h/30)%12,e=hues.get(k)||{k,n:0,r:0,g:0,b:0,w:0};e.n++;e.r+=r*sat;e.g+=g*sat;e.b+=b*sat;e.w+=sat;hues.set(k,e);}
   const cands=[];if(light.n>total*.12)cands.push({score:light.n*.8,k:-1,rgb:[light.r/light.n,light.g/light.n,light.b/light.n],n:light.n});
   for(const e of hues.values())if(e.n>=total*.012)cands.push({score:e.w,k:e.k,rgb:[e.r/e.w,e.g/e.w,e.b/e.w],n:e.n});
   cands.sort((a,b)=>b.score-a.score);const out=[];
   for(const c of cands){if(c.k>=0&&out.some(o=>o.k>=0&&Math.min(Math.abs(o.k-c.k),12-Math.abs(o.k-c.k))<2))continue;out.push(c);if(out.length===3)break;}
   if(!out.length)throw Error('no colour');
   const vivid=([r,g,b])=>{let [h,sat,l]=hsl(r,g,b);sat=Math.max(sat,.5);l=Math.min(Math.max(l,.55),.72);const c=(1-Math.abs(2*l-1))*sat,X=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;const [a,bb,cc]=h<60?[c,X,0]:h<120?[X,c,0]:h<180?[0,c,X]:h<240?[0,X,c]:h<300?[X,0,c]:[c,0,X];return [(a+m)*255,(bb+m)*255,(cc+m)*255];};
   const sum=out.reduce((t,c)=>t+c.n,0);
   res(out.map(c=>{const [r,g,b]=c.k<0?c.rgb:vivid(c.rgb);return {c:`rgb(${r|0},${g|0},${b|0})`,w:Math.max(.18,c.n/sum)};}));
  }catch(e){console.warn('glow palette',e);res(FALLBACK);}
 };
  // a fetched blob is never cross-origin tainted; fall back to a plain image element
  const viaImage=()=>{const img=new Image();img.onload=()=>analyse(img);img.onerror=()=>res(FALLBACK);img.src=src;};
  fetch(src).then(r=>r.ok?r.blob():Promise.reject()).then(createImageBitmap).then(analyse,viaImage);});
 paletteCache.set(src,job);return job;
}
const glow={blobs:[],active:false,layer:null,cover:null,paintedCover:null,motions:new Map()};
const speed=()=>Math.max(.25,Number(getComputedStyle(document.documentElement).getPropertyValue('--glow-speed'))||1);
const glowOff=()=>document.documentElement.dataset.glow==='off';
const rnd=(a,b)=>a+Math.random()*(b-a);
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
function pulse(el){
 if(!glow.active||document.hidden||reduceMotion.matches||glow.motions.has(el))return;
 const to=`translate(-50%,${rnd(-6,22).toFixed(1)}%) scale(${rnd(.75,1.25).toFixed(2)},${rnd(.8,1.5).toFixed(2)})`,op=rnd(.35,1).toFixed(2);
 const a=el.animate([{transform:el.style.transform||'translate(-50%,0) scale(1)',opacity:el.style.opacity||.6},{transform:to,opacity:op}],{duration:rnd(2200,5200)/speed(),easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
 glow.motions.set(el,a);
 a.onfinish=()=>{el.style.transform=to;el.style.opacity=op;a.cancel();glow.motions.delete(el);pulse(el);};
}
function syncGlow(){
 const show=glow.active&&glow.paintedCover!==null;
 glow.layer?.classList.toggle('ready',show);
 const run=show&&!reduceMotion.matches&&!document.hidden;
 for(const motion of glow.motions.values()){
  if(run)motion.play();else motion.pause();
 }
 if(run)glow.blobs.forEach(pulse);
}
export function paintGlow(cover){
 const layer=document.querySelector('.grimoire-glow');if(!layer)return;
 if(layer!==glow.layer){
  for(const motion of glow.motions.values())motion.cancel();
  glow.motions.clear();glow.blobs=[];glow.layer=layer;glow.cover=null;glow.paintedCover=null;
 }
 if(glowOff()){stopGlow();return;}
 glow.active=true;
 syncGlow();
 if(glow.cover===cover)return;
 glow.cover=cover;
 coverPalette(cover).then(cols=>{
  if(glow.layer!==layer||glow.cover!==cover)return;
  if(!glow.blobs.length)for(let i=0;i<6;i++){const b=document.createElement('i');b.className='ember';layer.append(b);glow.blobs.push(b);}
  const slots=cols.map(c=>Math.max(1,Math.round(c.w*6)));while(slots.reduce((a,b)=>a+b,0)>6)slots[slots.indexOf(Math.max(...slots))]--;while(slots.reduce((a,b)=>a+b,0)<6)slots[0]++;
  const order=[];slots.forEach((n,j)=>{for(let k=0;k<n;k++)order.push(j);});
  if(Math.random()<.5)order.reverse();
  glow.blobs.forEach((b,i)=>{const col=cols[order[i]];b.style.setProperty('--c',col.c);b.style.setProperty('--w',`${(30+col.w*40+rnd(-4,4)).toFixed(1)}vw`);b.style.left=`${8+i*16.8+rnd(-3,3)}%`;if(!b.style.left){b.style.left=`${8+i*17+rnd(-5,5)}%`;b.style.setProperty('--w',`${rnd(34,56)}vw`);b.style.setProperty('--h',`${rnd(46,72)}vh`);}});
  glow.paintedCover=cover;
  syncGlow();
 });
}
export function stopGlow(){glow.active=false;syncGlow();}
document.addEventListener('visibilitychange',syncGlow);
reduceMotion.addEventListener('change',syncGlow);

/* ---------- long titles: rest 3 s at the start, scroll to the end, come back; hover starts it at once ---------- */
const marquees=new Map();
const mqObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(es=>es.forEach(e=>{const a=marquees.get(e.target);if(a){e.isIntersecting?a.play():a.pause();}})):null;
export function setupMarquees(root){
 if(!root)return;
 for(const [box,animation] of marquees)if(!box.isConnected){
  animation.cancel();mqObserver?.unobserve(box);marquees.delete(box);
 }
 for(const box of root.querySelectorAll('.mq-box')){
  const mq=box.querySelector('.mq');if(!mq)continue;
  marquees.get(box)?.cancel();marquees.delete(box);mqObserver?.unobserve(box);box.classList.remove('overflow');
  if(box.closest('[hidden]'))continue;
  const shift=mq.scrollWidth-box.clientWidth;if(shift<=2)continue;
  box.classList.add('overflow');
  const rest=3000,move=Math.max(1400,shift/36*1000),hold=900,back=500,total=rest+move+hold+back;
  const a=mq.animate([{transform:'translateX(0)',offset:0},{transform:'translateX(0)',offset:rest/total,easing:'cubic-bezier(.45,0,.55,1)'},
   {transform:`translateX(${-shift}px)`,offset:(rest+move)/total},{transform:`translateX(${-shift}px)`,offset:(rest+move+hold)/total,easing:'cubic-bezier(.45,0,.55,1)'},{transform:'translateX(0)',offset:1}],{duration:total,iterations:Infinity});
  if(reduceMotion.matches)a.pause();
  marquees.set(box,a);mqObserver?.observe(box);
  const host=box.closest('.book,.library-card')||box;
  host.addEventListener('mouseenter',()=>{const now=a.currentTime||0,t=now%total;if(t<rest)a.currentTime=now-t+rest;if(a.playState!=='running')a.play();});
  if(reduceMotion.matches)host.addEventListener('mouseleave',()=>{a.pause();a.currentTime=0;});
 }
}

/* ---------- shelf: one row whose column count follows the width ---------- */
export function fitShelf(row){
 if(!row)return ()=>{};
 const ro=new ResizeObserver(()=>setupMarquees(row));ro.observe(row);setupMarquees(row);return ()=>ro.disconnect();
}

/* ---------- narrow window: the greeting glides over to sit above the cover ---------- */
export function placeGreeting(root=document){
 const gr=root.querySelector('.g-hero .greet'),jk=root.querySelector('.g-hero .jacket');if(!gr||!jk)return;
 gr.style.transform='none';
 const dx=innerWidth<=1080?jk.getBoundingClientRect().left-gr.getBoundingClientRect().left:0;
 gr.style.transform=dx?`translateX(${dx}px)`:'none';
}


/* ---------- close dialog ---------- */
export function closeDialog(locale){
 const w=words[locale]||words.zh;
 return new Promise(resolve=>{
  const wrap=document.createElement('div');wrap.className='grimoire-scrim';
  wrap.innerHTML=`<div class="grimoire-modal" role="dialog" aria-modal="true" aria-labelledby="close-title">
   <h2 id="close-title">${w.closeTitle}</h2><p class="modal-sub">${w.closeSub}</p>
   <div class="choice" role="radiogroup">
    <label class="opt"><input type="radio" name="close-choice" value="tray" checked><span class="opt-body"><b>${w.tray}</b><small>${w.trayHint}</small></span></label>
    <label class="opt"><input type="radio" name="close-choice" value="quit"><span class="opt-body"><b>${w.quit}</b><small>${w.quitHint}</small></span></label>
   </div>
   <label class="remember"><input type="checkbox" data-remember><span>${w.remember}</span></label>
   <p class="modal-hint">${w.rememberHint}</p>
   <div class="modal-actions"><button type="button" class="g-btn quiet" data-x="cancel">${w.cancel}</button><button type="button" class="g-btn primary" data-x="ok">${w.ok}</button></div>
  </div>`;
  document.body.append(wrap);requestAnimationFrame(()=>wrap.classList.add('on'));
  const finish=value=>{removeEventListener('keydown',esc);wrap.classList.remove('on');setTimeout(()=>wrap.remove(),180);resolve(value);};
  const esc=e=>{if(e.key==='Escape')finish(null);};addEventListener('keydown',esc);
  wrap.addEventListener('mousedown',e=>{if(e.target===wrap)finish(null);});
  wrap.querySelector('[data-x=cancel]').onclick=()=>finish(null);
  wrap.querySelector('[data-x=ok]').onclick=()=>finish({tray:wrap.querySelector('input[name=close-choice]:checked').value==='tray',remember:wrap.querySelector('[data-remember]').checked});
  wrap.querySelector('[data-x=ok]').focus();
 });
}

/* ---------- tools page ---------- */
export function toolsHTML(locale,esc){
 const w=words[locale]||words.zh;
 return `<div class="grimoire-page"><div class="g-page-head"><h1>${w.tools}<span class="count">${w.toolsCount(w.toolList.length)}</span></h1></div>
  <h2 class="tools-title">${esc(({zh:'工具',en:'Tools',ja:'ツール'})[locale]||'工具')}</h2><p class="tools-intro"><span class="tools-kicker">MEGULIT · TOOLS</span>${esc(({zh:'两件直接处理游戏文件的工具：动手前都会先备份，改坏了可以一键还原。',en:'Two tools that work on the game files themselves. Both back up first and can be undone in one click.',ja:'ゲームのファイルを直接扱うツールです。どちらも先にバックアップし、ワンクリックで元に戻せます。'})[locale]||'')}</p>
  <div class="tools-grid">${w.toolList.map(([t,d,m],i)=>`<button type="button" class="tool-card" data-tool="${i}"><span class="tool-top"><b>${esc(t)}</b><em>${i===0?({zh:"实验性",en:"Experimental",ja:"実験的"})[locale]||"实验性":w.researching}</em></span><span class="tool-desc">${esc(d)}</span>${i===0?`<span class="tool-key-note">${({zh:'在 Steam 买的、只显示中文 / 英文的游戏（比如 Key 社的 Summer Pockets），一定要先运行这个工具，否则 MeguLit 读到的是中文或英文，用不了',en:'Games bought on Steam that only show Chinese or English (such as Key’s Summer Pockets) must go through this tool first, otherwise MeguLit only gets the translated text',ja:'Steam 版で中国語・英語しか表示されないゲーム（Key の Summer Pockets など）は、先にこのツールを実行してください。実行しないと翻訳文しか取得できません'})[locale]||''}</span>`:''}<span class="tool-meta">${esc(m)}</span><span class="tool-go" aria-hidden="true">${({zh:'打开',en:'Open',ja:'開く'})[locale]||'打开'}</span></button>`).join('')}</div></div>`;
}

/* ---------- page tools live in the top bar; pages don't repeat their own name ---------- */
export function dockPageTools(main){
 const slot=document.querySelector('#bar-tools');if(!slot)return;
 // page tools stay on their own page now; the top bar only carries navigation
 slot.replaceChildren();slot.classList.remove('on','centered');return;
 slot.replaceChildren();
 const tools=main.querySelector(':scope > .page-header .page-tools, :scope > * > .page-header .page-tools');
 if(tools?.querySelector('#game-search')){slot.classList.remove('on','centered');return;}
 if(tools&&tools.children.length){slot.append(...tools.children);}
 slot.classList.toggle('on',slot.children.length>0);
 const search=slot.querySelector('#game-search');
 slot.classList.toggle('centered',!!search);
 if(search){const btns=[...slot.querySelectorAll('button')];const left=document.createElement('span'),right=document.createElement('span');left.className='side left';right.className='side right';
  const half=Math.ceil(btns.length/2);btns.slice(0,half).forEach(b=>left.append(b));btns.slice(half).forEach(b=>right.append(b));slot.querySelector('.lib-left')?.remove();slot.replaceChildren(left,search,right);}
}

/* ---------- every page opens with a short fade and rise ---------- */
export function pageEnter(main){main.classList.remove('g-enter');void main.offsetWidth;main.classList.add('g-enter');}
const subpageMotions=new WeakMap();
export function subpageEnter(content){
 if(!content)return;
 subpageMotions.get(content)?.cancel();
 if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
 const motion=content.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
 subpageMotions.set(content,motion);
 const clear=()=>{if(subpageMotions.get(content)===motion)subpageMotions.delete(content);};
 motion.onfinish=clear;motion.oncancel=clear;
}


/* ---------- home: soft dark fade at the window bottom until you scroll or point at the shelf ---------- */
export function watchHomeFade(main){
 const ws=main.closest('.workspace');if(!ws)return;
 const shelf=main.querySelector('.home-library-section');
 const update=()=>ws.classList.toggle('fade-off',main.scrollTop>24||shelf?.matches(':hover'));
 ws.classList.add('home-fade');update();
 main.onscroll=update;if(shelf){shelf.onmouseenter=update;shelf.onmouseleave=()=>setTimeout(update,0);}
}

/* ---------- the jacket is always as tall as the "last read" block beside it ---------- */
let jacketRO;
export function matchJacket(root=document){
 const hero=root.querySelector('.g-hero'),jk=hero?.querySelector('.jacket'),k=hero?.querySelector('.kicker'),a=hero?.querySelector('.hero-actions');if(!jk||!k||!a)return;
 const today=hero.querySelector('.today');
 /* E249.3: the jacket and the today column span exactly from the top of the 'last read' line to the bottom of the
    buttons. Written inline with priority (stylesheet rules carry !important) and re-checked until it holds. */
 const put=(el,prop,value)=>el.style.setProperty(prop,value,'important');
 const fit=(pass=0)=>{const kt=k.getBoundingClientRect().top,ab=a.getBoundingClientRect().bottom,h=Math.round(ab-kt);if(h<=40)return;
  put(jk,'height',h+'px');put(jk,'width',Math.round(h*2/3)+'px');put(jk,'align-self','start');if(today){put(today,'height',h+'px');put(today,'align-self','start');}
  requestAnimationFrame(()=>{let off=0;for(const el of [jk,today]){if(!el)continue;const r=el.getBoundingClientRect(),dy=kt-r.top+(k.getBoundingClientRect().top-kt),cur=parseFloat(el.style.marginTop)||0;if(Math.abs(dy)>1){put(el,'margin-top',(cur+dy).toFixed(1)+'px');off++;}}
   const miss=Math.abs(a.getBoundingClientRect().bottom-jk.getBoundingClientRect().bottom)>1;if((off||miss)&&pass<3)fit(pass+1);});};
 jacketRO?.disconnect();jacketRO=new ResizeObserver(()=>fit());jacketRO.observe(hero.querySelector('.hero-copy'));/* E250.1: never observe the column it resizes (feedback loop froze startup) */fit();
}

/* ---------- library field: render only the cells near the viewport ---------- */
let fieldStop=()=>{};
const fieldState={x:0,y:0,z:1};
const modulo=(value,period)=>((value%period)+period)%period;
/* E279: row offset for the open wall; below / diagonal neighbours (stride, stride+-1 mod n) must not be the same game. */
export const wallStride=(cols,n)=>{for(let k=0;k<n;k++){const sd=modulo(cols+k,n);if(sd>1&&sd<n-1)return cols+k;}return cols;};
const fieldActions='[data-game],[data-edit],[data-launch],[data-series]';

// E245 (user): a search with 2+ matches puts them on an ellipse around the search capsule, slowly
// circling (about one turn a minute). Lower covers read nearer: a little larger, brighter and on top. Hovering a cover
// pauses the orbit so it can be clicked; reduced motion keeps the ring still. One match keeps the single-focus layout.
function orbit(host,main,plane,items,pod){
 const events=new AbortController(),signal=events.signal,sources=new WeakMap(),nodes=items.map(source=>{
  const node=source.cloneNode(true);node.draggable=false;node.querySelectorAll('img').forEach(img=>{img.draggable=false;});
  sources.set(node,source);plane.append(node);return node;});
 host.classList.add('field-orbit');
 let raf=0,angle=-Math.PI/2,last=0,paused=false,born=window.__megulitOrbitWarm?-1e9:0,width=0,height=0,podW=360,podH=44;
 const measure=()=>{width=host.clientWidth;height=host.clientHeight;podW=pod?.offsetWidth||360;podH=pod?.offsetHeight||44;};
 const place=()=>{
  const cw=168,chh=250,rx=Math.max(podW/2+cw*.75,Math.min(width*.36,podW/2+cw*2.2)),ry=Math.max(podH/2+chh*.62,Math.min(height*.36,chh*1.15));
  // E245.2: any number of matches orbits. Ring k holds 8+4k covers, each ring further out and turning the other way;
  // more rings shrink every cover. Entering, covers grow out of the capsule centre to their places (~0.6 s).
  const slots=[];for(let ring=0,left=nodes.length;left>0;ring++){const n=Math.min(left,8+4*ring);slots.push(n);left-=n;}
  const rings=slots.length,shrink=Math.max(.42,1-(rings-1)*.16),now=performance.now();if(!born)born=now+140; /* E271: let the first heavy frame and cover decoding pass before anything moves */
  const t0=still?1:Math.max(0,Math.min(1,(now-born)/1100)),t=1-(1-t0)*(1-t0);let index=0;
  slots.forEach((n,ring)=>{for(let k=0;k<n;k++,index++){const node=nodes[index];
   const spread=1+ring*.62*shrink,dir=ring%2?-1:1,a=dir*angle+k*2*Math.PI/n+ring*.37;
   /* E272/E274 (user): covers fly in from outside the window and settle onto the orbit, one after another */const start=nodes.length>1?index/(nodes.length-1)*.45:0,p=still?1:Math.max(0,Math.min(1,(t0-start)/.55)),grow=p<=0?0:1+2.2*Math.pow(p-1,3)+1.2*Math.pow(p-1,2),fade=Math.min(1,p*1.6);const x=Math.cos(a)*rx*spread*(1+1.4*(1-grow)),y=Math.sin(a)*ry*spread*(1+1.4*(1-grow)),depth=(Math.sin(a)+1)/2;
   const scale=(.78+.22*depth)*shrink*(1-ring*.05)*(.9+.1*fade);
   node.style.transform='translate('+(width/2+x-cw/2).toFixed(1)+'px,'+(height/2+y-chh/2).toFixed(1)+'px) scale('+scale.toFixed(3)+')';
   node.style.opacity=((.62+.38*depth)*fade).toFixed(2);node.style.zIndex=String(Math.round(depth*100)-ring*10+100);}});
 };
 const still=reduceMotion.matches;
 const tick=now=>{raf=0;const dt=last?Math.min(64,now-last):0;last=now;if(!paused&&!still)angle+=dt*2*Math.PI/60000;place();if(!still)raf=requestAnimationFrame(tick);};
 plane.addEventListener('pointerover',e=>{if(e.target.closest('.field-plane > *'))paused=true;},{signal});
 plane.addEventListener('pointerout',e=>{if(!e.relatedTarget||!plane.contains(e.relatedTarget)||!e.relatedTarget.closest('.field-plane > *'))paused=false;},{signal});
 host.addEventListener('click',e=>{const hit=e.target.closest(fieldActions),source=hit&&sources.get(hit.closest('.field-plane > *'));if(!source)return;
  const action=[...hit.attributes].find(attr=>['data-game','data-edit','data-launch','data-series'].includes(attr.name));if(action){e.preventDefault();e.stopPropagation();source.querySelector('['+action.name+']')?.click();}},{capture:true,signal});
 const ro=new ResizeObserver(()=>{measure();place();});ro.observe(host);if(pod)ro.observe(pod);
 measure();place();if(!still)raf=requestAnimationFrame(tick);
 fieldStop=()=>{events.abort();ro.disconnect();cancelAnimationFrame(raf);host.classList.remove('field-orbit');fieldStop=()=>{};};
}
export function fieldify(grid,filtered=false){
 fieldStop();
 if(!grid)return;
 const host=grid.closest('#library-results'),main=grid.closest('.main');
 if(!host||!main)return;
 const pod=main.querySelector(':scope > .field-search');
 const items=[...grid.children];
 if(!items.length)return;
 grid.classList.add('field-grid');
 const plane=document.createElement('div');
 plane.className='field-plane';
 grid.replaceChildren(plane);
 host.querySelector(':scope > .field-shield')?.remove();
 if(filtered&&items.length>=2){orbit(host,main,plane,items,pod);return;}

 const cw=200,ch=318,cardWidth=168,cardHeight=250;
 const count=filtered?items.length*(items.length===2?3:items.length<=5?2:1):items.length;
 const cols=Math.min(count,Math.max(2,Math.round(Math.sqrt(count*(filtered?1:1.5*host.clientWidth/Math.max(1,host.clientHeight))))));
 const rows=Math.ceil(count/cols);
 const stride=wallStride(cols,items.length);
 const cx0=(cols-1)*cw/2,cy0=(rows-1)*ch/2;
 const cells=new Map(),sources=new WeakMap();
 const state=filtered?{x:cx0,y:cy0,z:1}:fieldState;
 const events=new AbortController(),signal=events.signal;
 let drag=null,raf=0,suppressClick=false;
 let vx=0,vy=0,lastMove=0,coastAt=0,coastEnd=0,zoomTarget=state.z,zoomAt=0,painted='';
 /* 2026-11-12 (user: dragging the wall still lagged): covers that scroll out are parked off-screen and reused when the
    same game scrolls back in, and once the wall is idle enough spare covers for the widest zoom are made in one batch.
    Dragging and zooming then never insert DOM: with this page's :has() rules one inserted cover re-ran style for the
    whole document (about 30 ms each time). */
 const pool=new Map(),shield=document.createElement('i');
 shield.className='field-shield';shield.setAttribute('aria-hidden','true');host.append(shield);
 /* the capsule drops its backdrop blur while the wall moves; toggled on the capsule itself, since a :has() on .main
    restyled the whole page on every start and stop */
 const moving=on=>{if(host.classList.contains('field-moving')===on)return;
  if(on)for(const el of host.querySelectorAll('.cover-frame.is-tilting')){el.classList.replace('is-tilting','tilt-out');el.style.setProperty('--rx','0deg');el.style.setProperty('--ry','0deg');}
  host.classList.toggle('field-moving',on);pod?.classList.toggle('wall-moving',on);};
 let width,height,podWidth,podHeight,podY;
 function constrain(){
  if(!filtered)return;
  const rangeX=Math.max(0,(cols*cw-width/state.z)/2);
  const rangeY=Math.max(0,(rows*ch-height/state.z)/2);
  state.x=Math.max(cx0-rangeX,Math.min(cx0+rangeX,state.x));
  state.y=Math.max(cy0-rangeY,Math.min(cy0+rangeY,state.y));
 }
 function take(index){
  const list=pool.get(index);
  if(list?.length){const node=list.pop();node.removeAttribute('data-parked');return node;}
  return make(index);
 }
 function make(index){
  const source=items[index],node=source.cloneNode(true);
  node.draggable=false;node.classList.add('field-cell');
  node.querySelectorAll('img').forEach(img=>{img.draggable=false;img.decoding='async';});
  sources.set(node,source);return node;
 }
 function park(cell){parkNode(cell.node,cell.index);}
 function parkNode(node,index){
  node.style.transform='translate(-300vw,-300vh)';node.style.opacity='0';node.setAttribute('data-parked','');
  let list=pool.get(index);if(!list)pool.set(index,list=[]);
  list.push(node);
 }
 /* spare covers per game: enough for the window at the smallest zoom, plus two */
 function warm(deadline){
  warmIdle=0;
  if(filtered||!host.isConnected||!width)return;
  /* 2026-11-13 (CDP trace: a 147 ms frame 0.3 s into the first drag): the batch is one long style pass; while the wall
     moves it waits for the next quiet moment instead of landing mid-drag */
  if(drag||host.classList.contains('field-moving')||host.classList.contains('dragging')||performance.now()-lastMove<1200){warmLater();return;}
  const most=(Math.ceil(width/(cw*.55))+4)*(Math.ceil(height/(ch*.55))+4),per=Math.ceil(most/items.length)+2;
  const have=new Map();for(const cell of cells.values())have.set(cell.index,(have.get(cell.index)||0)+1);
  /* 2026-11-13: small batches, one per idle slot. Batching was worse before (16 x 50 ms) only because ancestor :has()
     rules restyled the whole page per batch; those are attributes now (main-kids.js), so a batch costs its own nodes */
  const spare=document.createDocumentFragment();let more=false;
  outer:for(let index=0;index<items.length;index++)for(let n=(have.get(index)||0)+(pool.get(index)?.length||0);n<per;n++){
   if(spare.childNodes.length>=12||(spare.childNodes.length>=4&&deadline&&deadline.timeRemaining&&deadline.timeRemaining()<3)){more=true;break outer;}
   const node=make(index);parkNode(node,index);spare.append(node);}
  if(spare.childNodes.length)plane.append(spare);
  if(more)warmIdle=idle(warm,{timeout:1500});
 }
 /* after the entrance has played, in an idle slot */
 let warmId=0,warmIdle=0;
 const idle=window.requestIdleCallback||(fn=>setTimeout(fn,0)),unidle=window.cancelIdleCallback||clearTimeout;
 const warmLater=()=>{if(filtered||warmId||warmIdle)return;warmId=setTimeout(()=>{warmId=0;warmIdle=idle(warm,{timeout:1500});},1400);};
 function paint(){
  constrain();
  const {x,y,z}=state,cx=width/2,cy=podY;
  /* 2026-11-13 (user: zooming the wall is very laggy): the zoom tier restyles every cover (captions, shadows, hover); while the wheel zoom is still gliding it waits, and changes once when the zoom settles */{const zoom=z>1.05?'large':z<.85?'tiny':'small';if(!zoomBusy&&host.dataset.zoom!==zoom)host.dataset.zoom=zoom;}
  /* 2026-11-12 (user: dragging the wall still lagged): every cover is placed on every frame, from transform and opacity
     only (each cover is its own compositor layer, so no paint). The old 90 ms plane-shift frames made the lens snap in
     steps, and the speed classes it toggled restyled every cover mid-drag; both are gone. */
  const stamp=x.toFixed(2)+' '+y.toFixed(2)+' '+z.toFixed(4)+' '+width+' '+height+' '+cy;
  if(stamp===painted)return;
  painted=stamp;
  const firstCol=Math.max(filtered?0:-Infinity,Math.floor((x-cx/z)/cw)-1);
  const lastCol=Math.min(filtered?cols-1:Infinity,Math.ceil((x+cx/z)/cw)+1);
  const firstRow=Math.max(filtered?0:-Infinity,Math.floor((y-Math.max(cy,height-cy)/z)/ch)-1);
  /* E426 (player: simple -> wall drew only the top two rows): rows below the capsule run to the host's bottom edge, not
    to a mirror of the space above it; mid-switch the capsule is still gliding up and podY was small */
  const lastRow=Math.min(filtered?rows-1:Infinity,Math.ceil((y+Math.max(cy,height-cy)/z)/ch)+1);
  const radius=Math.hypot(cx,cy)||1;
  for(const [key,cell] of cells){
   if(cell.col>=firstCol&&cell.col<=lastCol&&cell.row>=firstRow&&cell.row<=lastRow)continue;
   park(cell);cells.delete(key);
  }
  let added=null;
  for(let row=firstRow;row<=lastRow;row++)for(let col=firstCol;col<=lastCol;col++){
   /* E279 (user report 2026-11-09: the same game twice, side by side): a cols x ceil(n/cols) tile has more cells than
      games and refilled the spare ones from the start, right next to the originals. The open wall is one running
      sequence instead: +1 to the right, +stride down, every game once per run, no equal neighbour in any direction. */
   const index=filtered?modulo(row,rows)*cols+modulo(col,cols):modulo(row*stride+col,items.length);
   if(filtered&&index>=count)continue;
   const key=row+':'+col;
   let cell=cells.get(key);
   if(!cell){
    const game=index%items.length,node=take(game);
    if(!node.isConnected)(added||=document.createDocumentFragment()).append(node);
    cell={node,col,row,index:game,t:'',o:''};cells.set(key,cell);
   }
   const dx=(col*cw-x)*z,dy=(row*ch-y)*z;
   const d=Math.min(1,Math.hypot(dx,dy)/radius);
   // E222/E223 (user): covers stay on the grid; the wall is a plain background behind the search capsule.
   const t='translate('+(cx+dx-cardWidth/2).toFixed(1)+'px,'+(cy+dy-cardHeight/2).toFixed(1)+'px) scale('+(z*(1-.22*d*d)).toFixed(3)+')';
   const o=(1-.35*d*d).toFixed(2);
   if(cell.t!==t){cell.node.style.transform=t;cell.t=t;}
   if(cell.o!==o){cell.node.style.opacity=o;cell.o=o;}
  }
  if(added)plane.append(added);
 }
 /* 2026-11-13 (user: dragging is smooth now but wants a little motion blur): a directional blur along the movement, only when the wall moves fast, in half-pixel steps so the filter is not rebuilt every frame; none with reduced motion */let zoomBusy=false,blurKey='0 0';const blurNode=(()=>{let svg=document.getElementById('mg-wall-blur-svg');if(!svg){svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='mg-wall-blur-svg';svg.setAttribute('width','0');svg.setAttribute('height','0');svg.setAttribute('aria-hidden','true');svg.style.cssText='position:absolute;width:0;height:0;pointer-events:none';svg.innerHTML='<filter id="mg-wall-blur" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 0"/></filter>';document.body.append(svg);}return svg.querySelector('feGaussianBlur');})();const motionBlur=(sx,sy)=>{const step=v=>reduceMotion.matches?0:Math.min(6,Math.max(0,Math.round((Math.abs(v)-.35)*4)))/2;const key=step(sx)+' '+step(sy);if(key===blurKey)return;blurKey=key;blurNode?.setAttribute('stdDeviation',key);/* 2026-11-13 (user: dragging and zooming the wall still lag): an SVG url() filter on the whole plane is rasterised on the CPU and flattens every cover layer into one surface each frame, which was the drag/zoom stall. The blur is now a GPU CSS blur, only while the wall coasts or is flung fast, and it switches itself off for the session once frames run long while it is on. */const amt=Math.max(step(sx),step(sy));plane.style.filter=amt&&!wallBlurOff?`blur(${(amt*.5).toFixed(1)}px)`:'';};let wallBlurOff=false,slowFrames=0,lastFrameAt=0;const frameCost=now=>{const dt=lastFrameAt?now-lastFrameAt:16;lastFrameAt=now;if(plane.style.filter&&dt>22&&dt<200){if(++slowFrames>5){wallBlurOff=true;plane.style.filter='';}}else if(dt<=22)slowFrames=Math.max(0,slowFrames-1);};
  function frame(now){
  raf=0;
  if(coastEnd){
   const dt=Math.min(32,Math.max(0,now-coastAt)),decay=Math.exp(-dt/105);
   const x=state.x,y=state.y;
   state.x-=vx*105*(1-decay)/state.z;state.y-=vy*105*(1-decay)/state.z;
   constrain();
   if(state.x===x)vx=0;
   if(state.y===y)vy=0;
   vx*=decay;vy*=decay;coastAt=now;
   if(now>=coastEnd||Math.hypot(vx,vy)<.06)coastEnd=vx=vy=0;
  }else if(now-lastMove>72)vx=vy=0;
  let zooming=false;
  if(zoomTarget!==state.z){
   // Linear, inertial zoom: chase the accumulated target with exponential easing, never snapping per wheel notch.
   const dt=Math.min(40,Math.max(0,now-(zoomAt||now))),k=reduceMotion.matches?1:1-Math.exp(-dt/85);
   state.z+=(zoomTarget-state.z)*(zoomAt?k:0);
   if(Math.abs(zoomTarget-state.z)<.0008)state.z=zoomTarget;else zooming=true;
  }
  zoomAt=zooming?now:0;zoomBusy=zooming;
  /* 2026-11-13 (judge: the search capsule sat on the cover titles of the row above): once the wall rests it eases to the row gap, so the capsule never covers a cover or its title */if(!filtered&&!coastEnd&&!drag?.active&&!zooming){const goal=Math.round((state.y-ch/2)/ch)*ch+ch/2,gap=goal-state.y;if(Math.abs(gap)>.4){state.y+=reduceMotion.matches?gap:gap*.2;zooming=true;}else state.y=goal;}
  frameCost(now);paint();{const fast=drag?.active||coastEnd;motionBlur(fast?vx:0,fast?vy:0);}
  if(!coastEnd&&!drag?.active&&!zooming)moving(false);
  if(coastEnd||zooming||(drag?.active&&Math.hypot(vx,vy)>.75)||blurKey!=='0 0')queue();
 }
 const queue=()=>{if(!raf)raf=requestAnimationFrame(frame);};
 const measure=()=>{
  width=host.clientWidth;height=host.clientHeight;
  podWidth=pod?.offsetWidth||360;podHeight=pod?.offsetHeight||44;
  // E225: the capsule sits above centre; the wall is centred on the capsule, not on the window
  if(pod){const a=pod.getBoundingClientRect(),b=host.getBoundingClientRect();podY=a.top+a.height/2-b.top;}else podY=height/2;
  if(!(podY>0&&podY<height))podY=height/2;
 };
 const down=e=>{
  if(!e.isPrimary||e.button!==0)return;
  coastEnd=vx=vy=0;queue();
  lastMove=performance.now();
  suppressClick=false;
  if(e.target.closest('input,select,.edit-button,.series-select-bar,.series-suggestions'))return;
  drag={id:e.pointerId,sx:e.clientX,sy:e.clientY,x:state.x,y:state.y,active:false};
 };
 const move=e=>{
  if(drag?.id!==e.pointerId)return;
  const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
  if(!drag.active){
   if(Math.hypot(dx,dy)<6)return;
   drag.active=suppressClick=true;
   host.classList.add('dragging');moving(true);host.setPointerCapture(e.pointerId);
  }
  const now=performance.now(),dt=Math.max(4,now-lastMove);
  const x=state.x,y=state.y;
  state.x=drag.x-dx/state.z;state.y=drag.y-dy/state.z;
  constrain();
  if(dt>72)vx=vy=0;
  else{
   vx=Math.max(-3,Math.min(3,vx*.3+(x-state.x)*state.z/dt*.7));
   vy=Math.max(-3,Math.min(3,vy*.3+(y-state.y)*state.z/dt*.7));
  }
  lastMove=now;
  queue();
 };
 const end=e=>{
  if(drag?.id!==e.pointerId)return;
  const now=performance.now();
  if(e.type==='pointerup'&&drag.active&&!reduceMotion.matches&&now-lastMove<72&&Math.hypot(vx,vy)>.12){
   coastAt=now;coastEnd=now+430;
  }else coastEnd=vx=vy=0;
  drag=null;host.classList.remove('dragging');
  queue();
 };
 const click=e=>{
  if(suppressClick&&e.detail){e.preventDefault();e.stopPropagation();return;}
  const hit=e.target.closest(fieldActions);
  const source=hit&&sources.get(hit.closest('.field-plane > *'));
  if(!source)return;
  const action=[...hit.attributes].find(attr=>['data-game','data-edit','data-launch','data-series'].includes(attr.name));
  if(action)source.querySelector('['+action.name+']')?.click();
 };
 host.addEventListener('pointerdown',down,{signal});
 addEventListener('pointermove',move,{signal});
 addEventListener('pointerup',end,{signal});
 addEventListener('pointercancel',end,{signal});
 host.addEventListener('lostpointercapture',end,{signal});
 host.addEventListener('click',click,{capture:true,signal});
 grid.addEventListener('dragstart',e=>e.preventDefault(),{signal});
 host.addEventListener('wheel',e=>{
  if(e.target.closest('.series-select-bar,.series-suggestions'))return;
  e.preventDefault();
  if(drag)return;
  coastEnd=vx=vy=0;
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?host.clientHeight:1);
  zoomTarget=Math.max(.55,Math.min(1.8,zoomTarget*Math.exp(-delta*.0015)));
  if(!zoomAt)zoomAt=performance.now();
  moving(true);
  queue();
 },{passive:false,signal});
 const ro=new ResizeObserver(()=>{measure();queue();warmLater();});
 addEventListener('megulit-field-measure',()=>{measure();queue();},{signal});
 ro.observe(host);if(pod)ro.observe(pod);
 measure();
 // E218 (user): on first open the search bar sits in the gap just above the most recent games, which run centred under it.
 if(!filtered&&!fieldState.placed){const across=Math.max(1,Math.floor(width/cw));fieldState.x=(Math.min(across,cols)-1)*cw/2;fieldState.y=-ch/2;fieldState.placed=true;}
 paint();
 warmLater();
 /* E426 measure again once layout has settled: two frames after mounting, and when the capsule's switch glide ends */
 let settle=requestAnimationFrame(()=>{settle=requestAnimationFrame(()=>{settle=0;measure();queue();});});
 pod?.addEventListener('transitionend',()=>{measure();queue();},{signal});
 fieldStop=()=>{
  events.abort();ro.disconnect();cancelAnimationFrame(raf);cancelAnimationFrame(settle);clearTimeout(warmId);if(warmIdle)unidle(warmIdle);
  host.classList.remove('dragging','field-moving');pod?.classList.remove('wall-moving');shield.remove();
  fieldStop=()=>{};
 };
}
export function stopField(){fieldStop();}
/* ---------- top bar: one marker that glides to the current tab, carrying a soft light with it ---------- */
export function moveTabInk(){
 const bar=document.querySelector('.titlebar'),ink=bar?.querySelector('.tab-ink');if(!ink)return;
 const cur=bar.querySelector('.top-tab[aria-current=page]');
 if(!cur){ink.style.opacity='0';return;}
 const r=cur.getBoundingClientRect(),b=(ink.offsetParent||bar).getBoundingClientRect();const center=r.left-b.left+r.width/2;
 if(!moveTabInk.fontHook){moveTabInk.fontHook=1;document.fonts?.ready.then(()=>moveTabInk());addEventListener('resize',()=>moveTabInk());}
 ink.style.transform=`translateX(${center}px)`;
 if(!ink.classList.contains('positioned')){
  void ink.offsetWidth;
  ink.classList.add('positioned');
 }
 ink.style.opacity='1';
}
addEventListener('resize',()=>moveTabInk());
// follow aria-current wherever navigation sets it
new MutationObserver(()=>moveTabInk()).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['aria-current']});
