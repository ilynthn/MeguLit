// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {launch}=require('../services/cardinal/cdp.cjs');
const web=path.join(__dirname,'../web'),read=f=>fs.readFileSync(path.join(web,f),'utf8');
const styles=[...read('index.html').matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(m=>m[1]).concat('detail-story.css');
const template=read('game-detail.js').split(/\r?\n/).find(line=>line.startsWith(' main.innerHTML='));
const labels=read('game-detail.js').slice(read('game-detail.js').indexOf('const labels='),read('game-detail.js').indexOf('export '));
const original={zh:'日文原版与恢复',ja:'日本語版と復元',en:'Japanese original & restore'};
const zero={zh:'零延迟翻译',ja:'ゼロ遅延翻訳',en:'Zero-latency translation'};
const languageUI=read('game-language.js');
const {localeToggleHTML}=vm.runInNewContext(languageUI.slice(languageUI.indexOf('const localeWords='),languageUI.indexOf('export function bindLocaleToggle')).replaceAll('export ','')+'\n({localeToggleHTML})');
const durationSource=read('detail-sessions.js').split(/\r?\n/);
const durationStart=durationSource.findIndex(line=>line.startsWith('export function durHTML'));
const durHTML=vm.runInNewContext(durationSource.slice(durationStart,durationStart+2).join('\n').replace('export ','')+'\ndurHTML');
function hero(locale,title){
 const context={main:{},game:{title,available:true,engine:'KiriKiri',readingSeconds:137520,characters:412906,learnedWords:1284},data:{counts:{sessions:57}},locale,embed:{kind:'pending'},hook:'未测',esc:s=>String(s??''),cover:()=>'<div class="cover"></div>',icon:()=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6Z"/></svg>',relativeTime:()=>'',originalLabel:()=>original[locale],zeroLatencyLabel:()=>zero[locale],zeroActivityLabel:()=>'',localeToggleHTML,launchReason:()=>'',durHTML,number:String};
 // The production template and its localized labels are used without starting the app or a game
 vm.runInNewContext(labels+'\nconst w=labels[locale];'+template,context);
 return context.main.innerHTML;
}
async function assertLaunchMotion(page){
 await page.evaluate(html=>{document.querySelector('main').innerHTML=html;},hero('zh','海市蜃楼之馆'));
 const center=await page.evaluate(()=>{
  const {x,y,width,height}=document.querySelector('.detail-launch').getBoundingClientRect();
  return {x:x+width/2,y:y+height/2};
 });
 const move=point=>page.c.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
 const motion=()=>page.evaluate(()=>{
  const button=document.querySelector('.detail-launch'),star=button.querySelector('svg'),dust=getComputedStyle(button,'::after');
  return {hover:button.matches(':hover'),turn:getComputedStyle(star).transform,dust:dust.animationName,paint:dust.backgroundImage};
 });
 await page.c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await move(center);
 const hover=await motion();
 assert.equal(hover.hover,true);
 assert.equal(hover.dust,'detail-launch-stardust');
 assert.match(hover.paint,/radial-gradient/);
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.detail-launch-mark')).transform==='matrix(0, 1.2, -1.2, 0, 0, 0)');
 await page.c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 const reduced=await motion();
 assert.equal(reduced.turn,'none');
 assert.equal(reduced.dust,'none');
 const app=read('app.js');
 await page.evaluate(app.slice(app.indexOf('const LAUNCHING='),app.indexOf('async function startGame'))+
  '\nconst locale="zh";markLaunching(document.querySelector(".detail-launch"),true);');
 const progress=await page.evaluate(()=>{
  const button=document.querySelector('.detail-launch'),label=button.querySelector('span');
  button.disabled=true;
  return [.25,.75].map(value=>{
   button.style.setProperty('--lp-progress',value);
   const overlay=getComputedStyle(button,'::before');
   return {
    scale:new DOMMatrix(overlay.transform).a,
    fullHeight:parseFloat(overlay.height)===button.clientHeight,
    paint:overlay.backgroundColor,
    belowLabel:overlay.zIndex==='-1'&&getComputedStyle(button).isolation==='isolate',
    label:label.textContent
   };
  });
 });
 assert.deepEqual(progress.map(state=>state.scale),[.25,.75]);
 for(const state of progress){
  assert.equal(state.fullHeight,true);
  assert.equal(state.belowLabel,true);
  assert.equal(state.paint,'rgba(237, 181, 110, 0.22)');
  assert.equal(state.label,'启动中…');
 }
 await move({x:0,y:0});
}
async function assertMemoriesScrollbars(page){
 const results=await page.evaluate(()=>{
  const host=document.querySelector('main');
  host.innerHTML='<div class="story-ending-list"></div><div class="story-page"></div><div class="tomoyo-selection-card"></div>';
  return ['dark','light'].map(theme=>{
   document.documentElement.dataset.theme=theme;
   return [...host.children].map(el=>{
    const style=getComputedStyle(el),bar=getComputedStyle(el,'::-webkit-scrollbar'),thumb=getComputedStyle(el,'::-webkit-scrollbar-thumb');
    return [style.scrollbarWidth,style.scrollbarColor,bar.width,bar.height,thumb.backgroundColor];
   });
  });
 });
 for(const [index,thumb] of ['rgba(255, 255, 255, 0.42)','rgba(0, 0, 0, 0.38)'].entries()){
  assert.deepEqual(results[index][0],['auto','auto','12px','12px',thumb],'horizontal ending list');
  assert.deepEqual(results[index][1],['auto','auto','12px','12px',thumb],'vertical memories viewport');
  assert.deepEqual(results[index][2].slice(0,4),['none','auto','0px','0px'],'selection overlay');
 }
}

async function assertDetailTheme(page){
 const failures=await page.evaluate(async()=>{
  const origin='https://detail.invalid/';
  const {sessionsView}=await import(origin+'detail-sessions.js');
  const {mountDetailDeveloper}=await import(origin+'developer.js');
  const {receiptView}=await import(origin+'seed-receipt.js');
  const main=document.querySelector('main'),root=document.documentElement;
  const opts={locale:'zh',esc:String,number:String,duration:n=>n+' 秒'};
  const receipt=receiptView({state:'bundled',bundled:{revision:1}},opts);
  const mount=body=>{main.innerHTML='<div class="game-detail-content">'+body+'</div>';};
  const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
  const paint=color=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);};
  const luminance=()=>{
   const v=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
   return .2126*v[0]+.7152*v[1]+.0722*v[2];
  };
  const results=[],style=selector=>getComputedStyle(main.querySelector(selector));
  root.dataset.theme='light';
  const check=(ink,surface)=>{
   const panel=style(surface),stops=panel.backgroundImage.match(/(?:rgba?|color)\([^)]*\)/g)||[];
   paint(getComputedStyle(root).getPropertyValue('--bg').trim());
   paint(stops.at(-1)||panel.backgroundColor);
   const back=luminance();
   paint(style(ink).color);
   const text=luminance(),ratio=(Math.max(text,back)+.05)/(Math.min(text,back)+.05);
   if(ratio<4.5)results.push({ink,surface,ratio});
  };
  mount('<div class="detail-overview"><div class="detail-main"><section class="first-player">'+receipt.html+'</section></div><aside class="detail-aside"></aside></div>');
  const api=async action=>action==='game_developer'?{pid:'p1',name:'Sample studio'}:
   action==='seed_producer'?{intro:'Sample description',source:'moegirl',links:[{kind:'vndb'}]}:null;
  mountDetailDeveloper({main,id:'7',api,...opts});
  await new Promise(resolve=>requestAnimationFrame(resolve));
  for(const ink of ['.dev-card-head small','.dev-card-head b','.dev-card .sc-intro','.dev-card .sc-intro small','.dev-card .sc-link','.dev-card .dev-logo'])
   check(ink,'.dev-card');
  for(const ink of ['.first-player-from','.first-player-receipt-source'])check(ink,'.first-player');
  const now=Date.now(),started_at=Math.floor(now/1000)-120;
  mount(sessionsView([{started_at,active_seconds:90,characters:225,sentences:14}],{...opts,now}));
  for(const ink of ['.ds-fig>span','.ds-fig>strong','.ds-chart-k','.ds-bar b'])check(ink,'.ds-summary');
  for(const ink of ['.ds-time','.ds-dur','.ds-num','.ds-num small'])check(ink,'.ds-rows');
  mount(sessionsView([],opts));
  check('.ds-empty h3','.ds-empty');check('.ds-empty p','.ds-empty');
  root.dataset.theme='dark';
  return results;
 });
 assert.deepEqual(failures,[]);
}


test('detail hero layout, launch motion and memories scrollbar styles',async()=>{
 const browser=await launch({viewport:{width:1360,height:900}}),page=browser.page;
 try{
  page.route(url=>{const u=new URL(url);if(u.origin!=='https://detail.invalid')return 'abort';const file=path.resolve(web,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return 'abort';return {body:fs.readFileSync(file),headers:{'content-type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream','access-control-allow-origin':'*'}};});
  const html='<!doctype html><html data-theme="dark"><head>'+styles.map(f=>`<link rel="stylesheet" href="https://detail.invalid/${f}">`).join('')+'</head><body><main class="main" data-kids="dtv-bg" style="width:calc(100% - 64px);margin:0 32px;padding:0"></main></body></html>';
  await page.goto('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  await page.evaluate(read('primary-buttons.js').replace('export function ','function '));
  await page.evaluate(()=>document.fonts.ready.then(()=>true));
  await assertLaunchMotion(page);
  for(const width of [1360,1244,1101,1100,1024,800,620,500]){
   await page.c.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   for(const locale of ['zh','ja','en'])for(const title of ['海市蜃楼之馆','ファタモルガーナの館 — The House in Fata Morgana — 長い作品名の折り返し確認']){
    await page.evaluate(html=>{document.querySelector('main').innerHTML=html;decoratePrimaryButtons(document.querySelector('main'));},hero(locale,title));
    await page.evaluate(()=>document.fonts.ready.then(()=>true));
    const result=await page.evaluate(()=>{
     const main=document.querySelector('main'),h=document.querySelector('.detail-title>h1'),actions=document.querySelector('.detail-actions'),b=actions.querySelector('[data-play]'),label=b.querySelector('span'),svg=b.querySelector('svg'),r=e=>e.getBoundingClientRect(),t=r(h),a=r(actions),p=r(b),l=r(label),i=r(svg),style=getComputedStyle(b);
     const caption=actions.querySelector(".detail-locale-help"),toggle=actions.querySelector(".detail-locale");
     const tools=[...actions.children].filter(e=>e!==caption).map(e=>({width:e.clientWidth,scroll:e.scrollWidth,rect:r(e).toJSON(),font:parseFloat(getComputedStyle(e).fontSize)}));
     const stats=[...document.querySelectorAll('.detail-statistics .stat-card strong')].map(e=>{const range=document.createRange();range.selectNodeContents(e);return {card:r(e.parentElement).toJSON(),box:r(e).toJSON(),text:range.getBoundingClientRect().toJSON()};});
     const beyond=[...main.querySelectorAll('.game-detail-hero *')].filter(e=>!actions.contains(e)&&r(e).right>r(main).right+1)
      .slice(0,10).map(e=>[e.tagName,String(e.className),e.textContent.slice(0,40),Math.round(r(e).right)]);
     const text=document.createRange();
     text.selectNodeContents(caption);
     const textFits=()=>[...text.getClientRects()].every(box=>box.left>=a.left-1&&box.right<=a.right+1);
     const beforeHelpFits=textFits(),beforeText=[...text.getClientRects()].map(box=>[box.left,box.right]);
     actions.scrollLeft=actions.scrollWidth;
     const lastReachable=r(toggle).right<=a.right+1;
     const help=r(caption),switchRect=r(toggle);
     const textBoxes=[...text.getClientRects()];
     const helpLines=new Set(textBoxes.map(box=>box.top)).size;
     const helpFits=beforeHelpFits&&textFits();
     const cover=r(main.querySelector('.detail-cover'));
     return {beforeText,afterText:textBoxes.map(box=>[box.left,box.right]),help:help.toJSON(),switchRect:switchRect.toJSON(),helpFits,helpLines,actionsWidth:a.width,actionsLeft:a.left,overflow:main.scrollWidth>main.clientWidth+1,beyond,titleScroll:h.scrollHeight,titleHeight:h.clientHeight,titleRight:t.right,mainRight:r(main).right,actionsTop:a.top,titleBottom:t.bottom,labelLeft:l.left,labelRight:l.right,iconRight:i.right,launchRight:p.right,launchHeight:p.height,clip:style.clipPath,radius:style.borderTopRightRadius,tools,stats,lastReachable,actionRight:a.right,tabsGap:r(main.querySelector('.detail-tabs')).top-a.bottom,coverBottom:cover.bottom,coverRight:cover.right};
    });
    const tag=width+'/'+locale+'/'+title;
    assert.equal(result.overflow,false,tag+' no hero overflow '+JSON.stringify(result.beyond));assert.ok(result.titleScroll<=result.titleHeight+1,tag+' complete title height');assert.ok(result.titleRight<=result.mainRight+1,tag+' title inside main');assert.ok(result.actionsTop>=result.titleBottom,tag+' title does not overlap actions');
    assert.ok(result.iconRight+6<=result.labelLeft&&result.labelRight+(width<=660?5:8)<=result.launchRight+1,tag+' star and complete launch label fit with padding');
    assert.equal(result.clip,'none',tag+' the launch label is unclipped');assert.equal(result.radius,'10px',tag+' rounded launch');
    assert.ok(result.launchHeight>=(width>1000?48:38),tag+' launch remains the primary action');
    assert.equal(result.tools.length,5,tag+' five controls');assert.ok(result.lastReachable,tag+' last control reachable');
    assert.ok(result.helpFits&&result.help.right<=result.actionRight+1,tag+' caption text stays inside the scroll viewport '+JSON.stringify([result.beforeText,result.afterText,result.actionsLeft,result.actionRight]));
    assert.ok(result.help.top>=result.switchRect.bottom&&result.help.top-result.switchRect.bottom<=10,tag+' caption just below switch');
    if(result.actionsWidth>=(width>1100?794:774)){
     assert.equal(result.helpLines,1,tag+' wide caption fits on one line');
     assert.ok(Math.abs(result.help.left-result.switchRect.left)<=1,tag+' caption left-aligned with switch');
    }else{
     assert.ok(result.helpLines<=(width>=620?1:2),tag+' narrow caption uses the whole row');
     assert.ok(Math.abs(result.help.left-result.actionsLeft-3)<=1,tag+' narrow caption starts at the row inset');
    }
    assert.ok(result.tabsGap<=22,tag+' tabs sit close to the actions');
    const center=t=>(t.rect.top+t.rect.bottom)/2;
    for(const t of result.tools){assert.ok(t.scroll<=t.width+1,tag+' tool label fits');assert.ok(t.font>=13,tag+' tool text stays readable');assert.ok(t.rect.height>=38,tag+' tool has a full hit target');assert.ok(Math.abs(center(t)-center(result.tools[0]))<=1,tag+' controls stay in one row');}
    assert.ok(result.tools[0].rect.left>=result.coverRight,tag+' controls sit to the right of the cover');
    if(width>=1100&&result.actionsWidth>=660||width>=620&&locale==='zh')assert.ok(result.tools.at(-1).rect.right<=result.actionRight+1,tag+` full row is visible (${result.tools.at(-1).rect.right} vs ${result.actionRight})`);
    if((width>=800||width===620&&locale==='zh')&&title.length<20)assert.ok(Math.abs(result.tools[0].rect.bottom-result.coverBottom)<=9,tag+` buttons align with the cover bottom (${result.tools[0].rect.bottom} vs ${result.coverBottom})`);
    for(const s of result.stats)assert.ok(s.text.right<=s.box.right+1,tag+' statistic does not run into the next column');
    for(const [i,s] of result.stats.entries()){
     assert.ok(Math.abs(s.card.left-result.stats[0].card.left)<=1,tag+' statistics share one column');
     if(i)assert.ok(s.card.top>=result.stats[i-1].card.bottom,tag+' statistics stack vertically');
    }
   }
  }
  await assertMemoriesScrollbars(page);
  await assertDetailTheme(page);
 }finally{await browser.close();console.log('Detail layout headless browser closed: '+browser.pid);}
});
