// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 11-27 (user screenshot: a yellow rounded box around 「关闭」; 「把这些高亮框都去了 很丑 … 经常发生在按shift之后」): Chromium and
   WebView2 start matching :focus-visible on a button that was clicked as soon as any key is pressed, Shift and Ctrl included, so
   clicking a button and then holding Shift (or a game shortcut) drew a focus ring around it.
   This test opens the real pages in a headless Edge (its own temporary profile, services/cardinal/cdp.cjs) with every stylesheet
   and classic script the page loads, and drives real mouse and keyboard input over CDP:
   - click a button, then press Shift / Ctrl / Alt / a letter / Ctrl+Enter: the painted pixels around it must not change;
   - press Tab: the next control gets the new ring (thin, theme gold, not the old 2px yellow), fading in;
   - click with the mouse again: the ring is gone.
   It covers the main window (dark and light theme, a dialog's 「关闭」, a box-shadow ring drawn on a child), the reader overlay
   (Alt+T panel and point-read card) and the kana page's shadow root. MEGULIT_SHOT_DIR=<folder> saves the PR screenshots. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch}=require('../services/cardinal/cdp.cjs');
const web=path.join(__dirname,'../web');
const ORIGIN='https://focus.invalid';
const SCALE=2;

/* what a page really loads: its stylesheets and classic (non-module) scripts, in document order */
function assetsOf(htmlFile){
 const html=fs.readFileSync(path.join(web,htmlFile),'utf8'),dir=path.posix.dirname(htmlFile);
 const out=[];
 for(const m of html.matchAll(/<link[^>]+href="([^"]+\.css)"[^>]*>|<script(?![^>]*type="module")[^>]*src="([^"]+\.js)"[^>]*><\/script>/g)){
  const href=m[1]||m[2],file=path.posix.normalize(path.posix.join(dir,href));
  if(m[2]&&!/focus/.test(href))continue; /* page logic needs the app's backend; only the focus script matters here */
  out.push(m[1]?`<link rel="stylesheet" href="${ORIGIN}/${file}">`:`<script src="${ORIGIN}/${file}"></script>`);
 }
 return out.join('');
}
/* served from one origin like the app (tauri.localhost), so the page's scripts may read its stylesheets */
let pageHtml='';
function serve(page){
 page.route(url=>{const u=new URL(url);if(u.origin!==ORIGIN)return 'abort';if(u.pathname==='/__focus-test.html')return {body:Buffer.from(pageHtml),headers:{'content-type':'text/html; charset=utf-8'}};const file=path.resolve(web,'.'+decodeURIComponent(u.pathname));
  if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return {status:404,body:''};
  const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream';
  return {body:fs.readFileSync(file),headers:{'content-type':type,'access-control-allow-origin':'*'}};});
}
async function open(page,htmlFile,body,{theme='dark',lang='zh-CN',htmlClass=''}={}){
 const html=`<!doctype html><html lang="${lang}" class="${htmlClass}" data-theme="${theme}"><head><meta charset="utf-8">${assetsOf(htmlFile)}</head><body>${body}</body></html>`;
 pageHtml=html;await page.goto(ORIGIN+'/__focus-test.html');
 await page.evaluate(()=>document.fonts.ready.then(()=>new Promise(r=>setTimeout(r,300))));
}
const KEYS={Shift:['Shift','ShiftLeft',16],Control:['Control','ControlLeft',17],Alt:['Alt','AltLeft',18],a:['a','KeyA',65],Enter:['Enter','Enter',13],Tab:['Tab','Tab',9]};
const MOD={Alt:1,Control:2,Shift:8};
async function press(page,name,{ctrl=false,shift=false,wait=true}={}){
 const [key,code,vk]=KEYS[name];const modifiers=(ctrl?2:0)|(shift?8:0)|(MOD[name]||0);
 await page.c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code,windowsVirtualKeyCode:vk,modifiers});
 await page.c.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,modifiers:modifiers&~(MOD[name]||0)});
 if(wait)await settle(page);
}
async function click(page,where){
 const [x,y]=typeof where==='string'?await centre(page,where):where;
 await page.c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
 await page.c.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
 await page.c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
 /* then rest the pointer in a corner so hover effects (the primary button's page curl) are not part of the comparison */
 await page.c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2});
 await settle(page);
}
const settle=page=>page.evaluate(()=>new Promise(r=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(r)),700)));
/* selectors may pierce one shadow root with ' >>> ' */
const finder=`(s)=>{const [a,b]=s.split(' >>> ');const el=document.querySelector(a);return b?el.shadowRoot.querySelector(b):el;}`;
const centre=(page,sel)=>page.evaluate(new Function('s',`const r=(${finder})(s).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];`),sel);
const rectOf=(page,sel)=>page.evaluate(new Function('s',`const r=(${finder})(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};`),sel);
const focusState=(page,sel)=>page.evaluate(new Function('s',`const el=(${finder})(s),cs=getComputedStyle(el),root=el.getRootNode(),active=root.activeElement;
 return {focused:active===el,visible:el.matches(':focus-visible'),style:cs.outlineStyle,width:parseFloat(cs.outlineWidth)||0,color:cs.outlineColor};`),sel);
const ringed=s=>s.style!=='none'&&s.width>0;
async function shot(page,sel,pad=14){
 const r=await rectOf(page,sel);
 const clip={x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad),width:r.width+pad*2,height:r.height+pad*2,scale:SCALE};
 return (await page.c.send('Page.captureScreenshot',{format:'png',clip})).data;
}
const save=(name,png)=>{const dir=process.env.MEGULIT_SHOT_DIR;if(dir)fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(png,'base64'));};

/* the three steps the user does: click then modifier keys (no ring), Tab (new ring), click again (ring gone) */
async function scenario(page,{label,clickTarget,tabTarget,shiftWatch=[]}){
 const problems=[];
 await click(page,clickTarget);
 const before=await shot(page,clickTarget);
 const watched=[];for(const sel of shiftWatch)watched.push(await page.evaluate(new Function('s',`return getComputedStyle((${finder})(s)).boxShadow;`),sel));
 save(label+'-1-clicked',before);
 for(const [name,opt] of [['Shift'],['Control'],['Alt'],['a'],['Enter',{ctrl:true}]]){
  if(name==='Enter'){await click(page,clickTarget);}
  await press(page,name,opt);
  const st=await focusState(page,clickTarget);
  const tag=name+(opt&&opt.ctrl?' with Ctrl':'');
  if(!st.focused)problems.push(`${label}: ${tag} moved focus away from the clicked control`);
  if(ringed(st))problems.push(`${label}: after clicking and pressing ${tag}, the control has a ${st.width}px ${st.style} ${st.color} focus ring`);
  const now=await shot(page,clickTarget);
  if(now!==before){problems.push(`${label}: pressing ${tag} after the click changed how the control is painted`);save(label+'-2-after-'+name,now);}
  for(let i=0;i<shiftWatch.length;i++){const bs=await page.evaluate(new Function('s',`return getComputedStyle((${finder})(s)).boxShadow;`),shiftWatch[i]);if(bs!==watched[i])problems.push(`${label}: ${tag} changed the box-shadow of ${shiftWatch[i]} (${watched[i]} -> ${bs})`);}
 }
 save(label+'-2-after-shift',await shot(page,clickTarget));
 await click(page,clickTarget);
 /* the ring fades in: at the moment focus arrives it starts transparent, a moment later it is fully drawn */
 await page.evaluate(()=>{window.__ringStart=null;document.addEventListener('focusin',e=>{const el=e.composedPath()[0];window.__ringStart=parseFloat(getComputedStyle(el).getPropertyValue('--focus-ring-a'));},{capture:true,once:true});});
 await press(page,'Tab');
 const start=await page.evaluate(()=>window.__ringStart);
 if(!(start<0.5))problems.push(`${label}: the Tab ring appeared at full strength at once (--focus-ring-a=${start}), no fade-in`);
 const tab=await focusState(page,tabTarget);
 if(!tab.focused)problems.push(`${label}: Tab did not move focus to ${tabTarget}`);
 else if(!ringed(tab))problems.push(`${label}: Tab focus on ${tabTarget} shows no ring`);
 else if(!(tab.width>=1&&tab.width<=1.6))problems.push(`${label}: Tab ring is ${tab.width}px wide, not the thin 1.5px ring`);
 save(label+'-3-tab',await shot(page,tabTarget));
 await click(page,clickTarget);
 const back=await focusState(page,clickTarget);
 if(ringed(back))problems.push(`${label}: after clicking again the control still has a ${back.width}px ${back.style} ring`);
 const tabAfter=await focusState(page,tabTarget);
 if(ringed(tabAfter))problems.push(`${label}: after clicking, ${tabTarget} still has a ring`);
 save(label+'-4-clicked-again',await shot(page,clickTarget));
 return {problems,tab};
}

/* one headless Edge for the whole file: fewer launches and shutdowns on a busy CI runner */
let browser=null;
async function shared(){
 if(!browser){
  browser=await launch({viewport:{width:900,height:600}});serve(browser.page);
  // The fade-in assertion exercises normal motion, independent of the runner's OS preference.
  await browser.page.c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 }
 return browser.page;
}
test.after(async()=>{if(browser)await browser.close();});

const mainBody=`<main class="main" style="padding:40px;display:flex;gap:18px;align-items:center">
 <button class="primary" id="go">开始</button><button class="secondary" id="sec">设置</button><button id="plain">更多</button>
</main>
<dialog class="game-dialog" id="dlg"><p>点击下面点提</p><div style="display:flex;gap:12px;justify-content:flex-end"><button class="secondary" id="close">关闭</button><button class="primary" id="ok">确定</button></div></dialog>
<dialog class="jr-dialog" id="jr" style="padding:24px"><button class="jr-item" id="jr-a"><span class="jr-art" style="display:block;width:60px;height:40px"></span>A</button><button class="jr-item" id="jr-b"><span class="jr-art" style="display:block;width:60px;height:40px"></span>B</button></dialog>`;

test('main window: Shift/Ctrl/Alt/shortcuts after a click draw no focus ring; Tab draws the new one; a click removes it',async()=>{
 const page=await shared();
 await page.c.send('Emulation.setDeviceMetricsOverride',{width:900,height:600,deviceScaleFactor:1,mobile:false});
  const problems=[],rings={};
  for(const theme of ['dark','light']){
   await open(page,'index.html',mainBody,{theme});
   let r=await scenario(page,{label:`main-${theme}`,clickTarget:'#go',tabTarget:'#sec'});problems.push(...r.problems);rings[theme]=r.tab.color;
   await page.evaluate(()=>{document.getElementById('dlg').showModal();document.activeElement?.blur();return new Promise(r=>setTimeout(r,450));});
   r=await scenario(page,{label:`dialog-close-${theme}`,clickTarget:'#close',tabTarget:'#ok'});problems.push(...r.problems);
   await page.evaluate(()=>document.getElementById('dlg').close());
   await page.evaluate(()=>{document.getElementById('jr').showModal();document.activeElement?.blur();return new Promise(r=>setTimeout(r,450));});
   r=await scenario(page,{label:`journal-item-${theme}`,clickTarget:'#jr-a',tabTarget:'#jr-b',shiftWatch:['#jr-a .jr-art']});problems.push(...r.problems);
   await page.evaluate(()=>document.getElementById('jr').close());
  }
  /* the ring follows the theme: gold on dark, deep bronze on light */
  if(rings.dark&&rings.light&&rings.dark===rings.light)problems.push(`the Tab ring has the same colour (${rings.dark}) in the dark and light themes`);
  assert.deepEqual(problems,[]);
});

test('reader overlay (Alt+T panel, point-read card): no ring after Shift, ring on Tab, gone after a click',async()=>{
 const page=await shared();
 await page.c.send('Emulation.setDeviceMetricsOverride',{width:700,height:400,deviceScaleFactor:1,mobile:false});
  await open(page,'reader/index.html',`<dialog class="tomoyo-cn-dialog" id="rd" style="left:40px;top:40px;margin:0;padding:24px"><div style="display:flex;gap:14px"><button id="r-copy">复制</button><button id="r-close">关闭</button></div></dialog>
   <div class="tomoyo-selection-card" id="card" style="position:fixed;left:300px;top:40px;padding:18px;display:flex;gap:10px"><button id="c-say">朗读</button><button id="c-add">加入生词本</button></div>`,{htmlClass:'megulit-ready'});
  await page.evaluate(()=>{document.getElementById('rd').show();document.activeElement?.blur();return new Promise(r=>setTimeout(r,300));});
  const problems=[];
  problems.push(...(await scenario(page,{label:'reader-altt',clickTarget:'#r-copy',tabTarget:'#r-close'})).problems);
  problems.push(...(await scenario(page,{label:'reader-card',clickTarget:'#c-say',tabTarget:'#c-add'})).problems);
  assert.deepEqual(problems,[]);
});

test('kana page shadow root follows the same rule',async()=>{
 const page=await shared();
 await page.c.send('Emulation.setDeviceMetricsOverride',{width:700,height:400,deviceScaleFactor:1,mobile:false});
  await open(page,'index.html','<div id="kana-host" style="padding:40px"></div>');
  await page.evaluate(o=>{const s=document.getElementById('kana-host').attachShadow({mode:'open'});
   s.innerHTML=`<link rel="stylesheet" href="${o}/kana/kana.css"><div class="kana-root"><button class="chapter" id="k1" style="padding:10px 18px">あ行</button> <button class="chapter" id="k2" style="padding:10px 18px">か行</button></div>`;
   return new Promise(r=>setTimeout(r,500));},ORIGIN);
  const {problems}=await scenario(page,{label:'kana',clickTarget:'#kana-host >>> #k1',tabTarget:'#kana-host >>> #k2'});
  assert.deepEqual(problems,[]);
});
