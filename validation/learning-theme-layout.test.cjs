'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),test=require('node:test');
const {startEdge,startWeb}=require('./library-views-perf.cjs');

test('learning map keeps the selected words in place and learning pages follow the theme',async t=>{
 const server=await startWeb({});
 t.after(()=>server.close());
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megu-learning-'));
 let edge;
 t.after(async()=>{await edge?.stop();fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});});
 try{edge=await startEdge(profile);}catch(error){if(error.message==='EDGE_NOT_FOUND')return t.skip('Edge unavailable');throw error;}
 const {send,evaluate}=edge;
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await send('Emulation.setDeviceMetricsOverride',{width:1180,height:690,deviceScaleFactor:1,mobile:false});
 const links=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8').match(/<link rel="stylesheet" href="[^"]+">/g).join('');
 const html='<html lang="zh-CN"><head>'+links+'</head><body><div class="app-frame"><div class="workspace"><main class="main" id="main" data-page="learning"><nav class="tabs"><button class="tab active">Grammar</button><button class="tab">Kana</button></nav><div id="learning-content"></div></main></div></div></body></html>';
 const [serve]=server.listeners('request');
 server.off('request',serve).on('request',(req,res)=>{
  if(req.url!=='/learning-test')return serve(req,res);
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(html);
 });
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/learning-test'});
 for(let i=0;i<50&&!await evaluate("!!document.querySelector('#learning-content')&&document.readyState==='complete'");i++)
  await new Promise(resolve=>setTimeout(resolve,20));
 const map=await evaluate(`(async()=>{
  const q=s=>document.querySelector(s),target=q('#learning-content'),frame=q('#main');
  const opts={locale:'zh',esc:String,number:String,api:async action=>action==='grammar_report'?{progress:{}}:{}};
  await (await import('/grammar.js')).mountGrammar(target,opts);
  await new Promise(resolve=>setTimeout(resolve,300));
  q('.gm-overview').click();
  for(const anim of target.getAnimations({subtree:true}))anim.finish();
  frame.scrollTop=30;
  const stage=q('.gm-stage'),words=[...stage.querySelectorAll('[data-piece]')],first=words[0],next=words.find(b=>b.dataset.node!==first.dataset.node);
  const y=frame.scrollTop,rect=el=>JSON.stringify(el.getBoundingClientRect()),positions=words.map(rect);
  first.focus({preventScroll:true});
  first.click();
  const firstSelected=first.getAttribute('aria-pressed')==='true'&&document.activeElement===first&&q('.gm-node').dataset.node===first.dataset.node;
  next.click();
  const stationary=y===frame.scrollTop&&q('.gm-stage')===stage&&words.every((word,i)=>rect(word)===positions[i]);
  const nextSelected=next.getAttribute('aria-pressed')==='true'&&first.getAttribute('aria-pressed')==='false'&&q('.gm-node').dataset.node===next.dataset.node;
  const style=s=>getComputedStyle(q(s)),colors=()=>{
   const pop=document.createElement('div');pop.className='gm-pop';pop.innerHTML='<p>Explanation</p>';stage.appendChild(pop);
   const value=[style('.gm-piece b').color,style('.gm-node').backgroundImage,style('.gm-node .gm-chip').color,style('.gm-scene').color,style('.gm-pop p').color];
   pop.remove();return value;
  };
  const setTheme=async theme=>{
   document.documentElement.dataset.theme=theme;
   // Read the final palette once the browser has finished its CSS transitions.
   await Promise.all(target.getAnimations({subtree:true})
    .filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished));
  };
  const dark=colors();await setTheme('light');const light=colors();
  q('.gm-node [data-toggle]').click();
  const closed=!q('.gm-node')&&q('.gm-map-hint')&&document.activeElement.matches('.gm-pill');
  const word={key:'house',base:'屋敷',reading:'やしき',meaning:'House',count:4};
  const report={lines:4,weekly:[word],frequent:[word]};
  const {readingInsightsHTML}=await import('/reading-insights.js');
  target.innerHTML=readingInsightsHTML(report,opts);
  const ink=el=>getComputedStyle(el).color;
  const reading=()=>['.ri-hud-stats b','.ri-top-reading','.ri-top-def','.ri-top-count b','.ri-head h2','.ri-count b','.ri-known'].map(s=>ink(q(s)));
  const lightReading=reading();await setTheme('black');const blackReading=reading();
  const {mountKana}=await import('/kana/kana.js');
  await mountKana(target,{...opts,api:async()=>({mastery:{},boxes:{},runs:[],applied:[],lessons:{},prefs:{volume:0.4}})});
  const shadow=q('.kana-host').shadowRoot;
  shadow.querySelector('[data-go^="lesson.html"]').click();
  for(let i=0;i<30&&!shadow.querySelector('.v-lesson');i++)await new Promise(resolve=>setTimeout(resolve,30));
  const heading=shadow.querySelector('.lesson-head h1'),sheet=shadow.querySelector('.v-lesson .sheet');
  const blackKana=ink(heading);
  await setTheme('light');
  const lightKana=ink(heading),lightSheet=getComputedStyle(sheet).backgroundImage;
  const tabs=q('.tabs'),top=tabs.getBoundingClientRect().top;
  frame.scrollTop=100;const sticky=frame.scrollTop>0&&tabs.getBoundingClientRect().top===top;
  const backing=getComputedStyle(tabs,'::before').boxShadow;
  const tab=tabs.querySelector('.tab'),rectTab=tab.getBoundingClientRect();
  const tabClickable=document.elementFromPoint(rectTab.left+rectTab.width/2,rectTab.top+rectTab.height/2)===tab;
  return {firstSelected,nextSelected,stationary,closed,dark,light,lightReading,blackReading,blackKana,lightKana,lightSheet,sticky,backing,tabClickable};
 })()`);
 assert.ok(map.firstSelected&&map.nextSelected&&map.stationary&&map.closed,JSON.stringify(map));
 assert.ok(map.light.every((value,i)=>value!==map.dark[i]),JSON.stringify(map));
 assert.ok(map.lightReading.every((value,i)=>value!==map.blackReading[i]),JSON.stringify(map));
 assert.notEqual(map.lightKana,map.blackKana);
 assert.match(map.lightSheet,/gradient/);
 assert.ok(map.sticky&&map.backing!=='none'&&map.tabClickable,JSON.stringify(map));
});
