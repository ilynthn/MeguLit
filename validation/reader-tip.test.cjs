/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Owner beta test on ISLAND (11-28): the reading layer's hover tips were the system's black-and-white box. One tip component
   now draws them: it stays on the screen, flips away from the edge, never covers the element pointed at, and shows shortcuts
   as key caps. Pure placement and parsing run everywhere; the page part runs in headless Edge when playwright-core is there. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),core=require('../web/reader/modules/tip.js');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const view={x:0,y:0,w:1920,h:1080},tip={w:240,h:52};
const inView=(p,t=tip,v=view,m=6)=>p.x>=v.x+m&&p.y>=v.y+m&&p.x+t.w<=v.x+v.w-m&&p.y+t.h<=v.y+v.h-m;
const covers=(p,a,t=tip)=>p.x<a.x+a.w&&p.x+t.w>a.x&&p.y<a.y+a.h&&p.y+t.h>a.y;

test('the tip opens on the asked side when there is room',()=>{
 const a={x:900,y:500,w:120,h:32};
 assert.deepEqual(core.placeTip(a,tip,view),{x:840,y:440,side:'top',fits:true});
 assert.deepEqual(core.placeTip(a,tip,view,{side:'bottom'}),{x:840,y:540,side:'bottom',fits:true});
 assert.equal(core.placeTip(a,tip,view,{side:'left'}).side,'left');
});

test('at every screen edge it flips or slides to stay on screen and off the anchor',()=>{
 const cases=[
  [{x:900,y:10,w:120,h:32},'top','bottom','capsule at the top of the screen'],
  [{x:900,y:1040,w:120,h:32},'bottom','top','bottom edge'],
  [{x:4,y:500,w:40,h:40},'left','right','left edge'],
  [{x:1876,y:500,w:40,h:40},'right','left','right edge'],
  [{x:0,y:0,w:40,h:40},'top','bottom','top-left corner'],
  [{x:1880,y:1040,w:40,h:40},'bottom','top','bottom-right corner'],
 ];
 for(const [a,want,got,label] of cases){const p=core.placeTip(a,tip,view,{side:want});
  assert.equal(p.side,got,label);assert.ok(inView(p),label+' stays on screen: '+JSON.stringify(p));assert.ok(!covers(p,a),label+' leaves the anchor visible');}
 const p=core.placeTip({x:1900,y:500,w:16,h:30},tip,view,{side:'top'});
 assert.equal(p.side,'top');assert.equal(p.x,1920-6-240,'slides along the edge instead of hanging off it');
});

test('a monitor offset (a desktop that does not start at 0,0) is respected',()=>{
 const v={x:-1920,y:0,w:1920,h:1080},a={x:-1915,y:5,w:30,h:30},p=core.placeTip(a,tip,v,{side:'top'});
 assert.ok(inView(p,tip,v)&&!covers(p,a),JSON.stringify(p));
});

test('when nothing fits whole it takes the roomiest side and is still clamped on screen',()=>{
 const small={x:0,y:0,w:300,h:120},a={x:20,y:40,w:260,h:40},p=core.placeTip(a,tip,small,{side:'top'});
 assert.equal(p.fits,false);assert.ok(inView(p,tip,small),JSON.stringify(p));
});

test('shortcuts become key caps; plain text and brackets stay text',()=>{
 assert.deepEqual(core.parseTip('打开 / 收起 Alt+T 菜单'),[[{text:'打开 / 收起 '},{keys:['Alt','T']},{text:' 菜单'}]]);
 assert.deepEqual(core.parseTip('对话记录（L）'),[[{text:'对话记录'},{keys:['L']}]]);
 assert.deepEqual(core.parseTip('Hide every overlay; Alt + H brings it back'),[[{text:'Hide every overlay; '},{keys:['Alt','H']},{text:' brings it back'}]]);
 assert.deepEqual(core.parseTip('Ctrl+Shift+F5'),[[{keys:['Ctrl','Shift','F5']}]]);
 assert.deepEqual(core.parseTip('外观与胶囊设置（可拖动）'),[[{text:'外观与胶囊设置（可拖动）'}]],'a bracketed word is not a key');
 assert.deepEqual(core.parseTip('第一行\n第二行'),[[{text:'第一行'}],[{text:'第二行'}]],'line breaks make lines');
 assert.deepEqual(core.parseTip(''),[]);
});

test('the tip is a reader module and a painted overlay region',()=>{
 const list=JSON.parse(read('web/reader/modules.json'));assert.ok(list.includes('tip')&&list.indexOf('tip')<list.indexOf('capsule'));
 assert.match(read('web/reader/module-list.js'),/"tip"/);
 assert.match(read('web/reader/modules/interaction.js'),/\.mg-tip,/);
 const js=read('web/reader/modules/tip.js');assert.doesNotMatch(js,/(^|[^:])\/\/(?!\S*\.)/m,'no // line comments');assert.doesNotMatch(js,/transition:\s*all/);
});

let chromium;try{({chromium}=require(process.env.MEGULIT_PLAYWRIGHT||'H:/MeguLit-Work/pw/node_modules/playwright-core'));}catch{}
const page=(name,fn)=>test(name,{skip:!chromium&&'no playwright-core'},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const p=await browser.newPage({viewport:{width:1280,height:720}});
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#3a5a8a}button{position:fixed;width:120px;height:32px}</style></head><body>
   <button id="top" style="left:580px;top:4px" title="打开 / 收起 Alt+T 菜单&#10;按住拖动换位置">MeguLit</button>
   <button id="right" style="right:2px;top:340px;width:40px" title="对话记录（L）">记</button>
   <button id="mid" style="left:580px;top:340px">mid</button>
   <script>window.__tomoyoTranslateRequest=()=>{};</script></body></html>`);
  for(const m of ['interaction','tip'])await p.addScriptTag({content:read('web/reader/modules/'+m+'.js')});
  await p.waitForFunction(()=>!!window.__megulitTip);await fn(p);}
 finally{await browser.close();}
});
const hover=async(p,id)=>{const b=await p.evaluate(id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};},id);await p.mouse.move(b.x,b.y);await p.waitForTimeout(700);};
const tipBox=p=>p.evaluate(()=>{const t=document.querySelector('.mg-tip');if(t.hidden)return null;const r=t.querySelector('.mg-tip-b').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height,side:t.dataset.side};});

page('native titles are taken over and the tip shows key caps, below a button at the top of the screen',async p=>{
 assert.equal(await p.evaluate(()=>document.querySelectorAll('[title]').length),0,'no native title left');
 await hover(p,'top');const t=await tipBox(p);assert.ok(t,'shown');assert.equal(t.side,'bottom');
 assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('.mg-tip kbd')].map(k=>k.textContent)),['Alt','T']);
 assert.equal(await p.evaluate(()=>document.querySelectorAll('.mg-tip .mg-tip-l').length),2);
 const a=await p.evaluate(()=>{const r=document.getElementById('top').getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};});
 assert.ok(t.y>=a.y+a.h,'does not cover the button');
 await p.mouse.move(640,600);await p.waitForTimeout(100);assert.equal(await tipBox(p),null,'leaves with the pointer');
});

page('at the right edge the tip slides to stay on screen; a title set later is taken over too',async p=>{
 await hover(p,'right');const t=await tipBox(p);assert.equal(t.side,'top');assert.ok(t.x>=0&&t.x+t.w<=1280,'on screen: '+JSON.stringify(t));
 await p.evaluate(()=>{document.getElementById('mid').title='校准位置';});await p.waitForTimeout(50);
 assert.equal(await p.evaluate(()=>document.getElementById('mid').hasAttribute('title')),false);
 assert.equal(await p.evaluate(()=>document.getElementById('mid').title),'校准位置','code reading el.title still gets the tooltip text');
 assert.equal(await p.evaluate(()=>{const b=document.getElementById('mid');b.title='回到游戏原字位置';const r=b.dataset.mgTip+'|'+b.title;b.title='校准位置';return r;}),'回到游戏原字位置|回到游戏原字位置','writing el.title updates the tip');
 await hover(p,'mid');assert.match(await p.evaluate(()=>document.querySelector('.mg-tip').textContent),/校准位置/);
 await p.evaluate(()=>{document.getElementById('mid').title='';});await p.waitForTimeout(500);assert.equal(await tipBox(p),null,'an emptied title closes it');
});
