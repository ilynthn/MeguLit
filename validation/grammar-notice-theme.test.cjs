'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),test=require('node:test');
const {startEdge,startWeb}=require('./library-views-perf.cjs');

test('grammar lesson and startup notice remain readable across themes',async t=>{
 const server=await startWeb({});
 t.after(()=>server.close());
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megu-grammar-theme-'));
 let edge;
 t.after(async()=>{await edge?.stop();fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});});
 try{edge=await startEdge(profile);}catch(error){if(error.message==='EDGE_NOT_FOUND')return t.skip('Edge unavailable');throw error;}
 const {send,evaluate}=edge;
 await send('Emulation.setDeviceMetricsOverride',{width:1180,height:690,deviceScaleFactor:1,mobile:false});
 const links=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8').match(/<link rel="stylesheet" href="[^"]+">/g).join('');
 const html='<html lang="zh-CN"><head>'+links+'</head><body><div class="app-frame"><div class="workspace"><main class="main" id="main" data-page="learning"><div id="learning-content"></div></main></div></div></body></html>';
 const [serve]=server.listeners('request');
 server.off('request',serve).on('request',(req,res)=>{
  if(req.url!=='/grammar-theme-test')return serve(req,res);
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(html);
 });
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/grammar-theme-test'});
 for(let i=0;i<50&&!await evaluate("!!document.querySelector('#learning-content')&&document.readyState==='complete'");i++)
  await new Promise(resolve=>setTimeout(resolve,20));
 const lowContrast=await evaluate(`(async()=>{
  const {listHTML,lessonHTML,pointsOf}=await import('/grammar.js');
  const {gameNoneHTML}=await import('/grammar-howto.js');
  const {mountDevNotice}=await import('/feedback-ui.js');
  const target=document.querySelector('#learning-content'),root=document.documentElement;
  const opts={locale:'zh',esc:String,level:'N0'};
  const point=pointsOf('N0').find(p=>p.title.zh.includes('キター'));
  const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
  const style=(selector,pseudo)=>getComputedStyle(document.querySelector(selector),pseudo);
  const luminance=()=>{
   const channels=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
   return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
  };
  const paint=color=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);};
  const failures=[];
  // Compare each label against the surface under it, including the footer gradient.
  for(const theme of ['light','dark','black']){
   root.dataset.theme=theme;
   const check=(ink,surface,pseudo)=>{
    const background=style(surface);
    const stops=background.backgroundImage.match(/(?:rgba?|color)\([^)]*\)/g)||[];
    paint(style('html').getPropertyValue('--bg').trim());
    paint(stops.at(-1)||background.backgroundColor);
    const base=luminance();
    paint(style(ink,pseudo).color);
    const text=luminance(),ratio=(Math.max(text,base)+.05)/(Math.min(text,base)+.05);
    if(ratio<4.5)failures.push({theme,ink,surface,ratio});
   };
   target.innerHTML='<div class="gm-page">'+listHTML({}, {...opts,group:'ending'})+'</div>';
   check('.gm-stg.on .gm-stg-glyph','.gm-stg.on');
   check('.gm-stg.has-next .gm-stg-glyph','.gm-stg.has-next');
   check('.gm-stg.has-next .gm-stg-flag','.gm-stg.has-next .gm-stg-flag');
   check('.gm-group h3','.gm-group');
   check('.gm-card.next .gm-card-no','.gm-card.next');
   check('.gm-card.next .gm-card-meta b','.gm-card.next');
   check('.gm-hero-go span','.gm-hero-go');
   target.innerHTML='<div class="gm-page">'+lessonHTML(point,{}, {...opts,step:2})+'</div>';
   const rounds=target.querySelectorAll('[data-jd]');
   const [correct,wrong]=rounds[0].querySelectorAll('.gm-jd-opt');
   correct.classList.add('hit');wrong.classList.add('miss');
   check('.gm-play-lead','.gm-lesson-main');
   check('.gm-jd-q','.gm-lesson-main');
   check('.gm-jd-opt.hit .gm-jd-plain','.gm-jd-opt.hit');
   check('.gm-jd-opt.miss .gm-jd-plain','.gm-jd-opt.miss');
   check('.gm-jd-who','.gm-jd-who');
   check('.gm-step-dot.passed span','.gm-steps','::after');
   check('.gm-stepnav button.secondary','.gm-stepnav');
   check('.gm-stepnav button.primary','.gm-stepnav button.primary');
   check('.gm-stepnav span','.gm-stepnav');
   target.querySelector('.gm-how-game').innerHTML=gameNoneHTML(opts);
   check('.gm-how-none','.gm-lesson-main');
   mountDevNotice({...opts,api:async()=>[],force:true});
   const notice=document.querySelector('.startup-notice');
   check('.startup-notice-close','.startup-notice');
   check('.startup-notice [data-report]','.startup-notice .dev-notice-actions');
   check('.startup-notice [data-next]','.startup-notice [data-next]');
   notice.close();notice.remove();
  }
  return failures;
 })()`);
 assert.deepEqual(lowContrast,[]);

});
