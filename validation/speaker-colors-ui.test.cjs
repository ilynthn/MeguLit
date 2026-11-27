// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 分角色, in Alt+T → 文字 → 颜色 (web/reader/modules/speaker-colors.js), in the real reader page in headless Edge:
   a work that colours by speaker lists them (name, swatch, 改色, 恢复默认); a work that does not says 「该作品不分角色字体颜色」;
   the game's colour of a speaker is learned from the painted line; a colour the user picks repaints the line on screen at once
   and is sent for this work only; 恢复默认 brings the game's colour back. Set MEGULIT_SPEAKER_SHOTS=<folder> for screenshots. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),os=require('node:os'),path=require('node:path'),test=require('node:test');
const {setTimeout:sleep}=require('node:timers/promises');
const {startEdge}=require('./library-views-perf.cjs');
const web=path.join(__dirname,'..','web');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(f=>f&&fs.existsSync(f));
const menu='.tomoyo-cn-dialog[open]',box=`${menu} [data-text-speaker-colors] .mg-speakers`,KEY='c'.repeat(64),AYAME='#ff5ea8',LINE='「わたしはアヤメちゃん。迷える蓮君を導く為にやってきた」';

function stub(){return `<script>(${function(){
 localStorage.clear();window.__sent=[];
 window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{
  if(cmd!=='service')return null;const {action,message}=args.request;
  if(action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};
  if(action==='ui_state')return {};
  if(action==='reader_bootstrap')return {engines:[],native:{}};
  if(action==='reader_message'){window.__sent.push(message);return {replies:[]};}
  return {};}};
}.toString()})();</script>`;}

async function waitFor(cdp,condition,timeout=8000){const end=performance.now()+timeout;do{if(await cdp.evaluate(condition).catch(()=>false))return;await sleep(50);}while(performance.now()<end);assert.fail(condition+' did not become true');}
const text=cdp=>cdp.evaluate(`(()=>{const b=document.querySelector('${box}');return b?{state:b.dataset.state,say:b.querySelector('.mg-speakers-say').hidden?'':b.querySelector('.mg-speakers-say').textContent,rows:[...b.querySelectorAll('.mg-speaker')].map(r=>({name:r.dataset.name,color:r.querySelector('input').value,reset:getComputedStyle(r.querySelector('[data-act=reset]')).visibility==='visible',change:r.querySelector('[data-act=change]').textContent}))}:null;})()`);
const lineColor=cdp=>cdp.evaluate(`document.body.classList.contains('tome-line-color')?getComputedStyle(document.documentElement).getPropertyValue('--tomoyo-gal-line-color').trim():''`);
const status=(cdp,speakers)=>cdp.evaluate(`window.__tomoyoChinese.gameStyleStatus({type:'gameStyleStatus',gameStyleState:'speakers',gameStyleKey:'${KEY}',gameStyleSpeakers:${JSON.stringify(speakers)}})`);
async function shot(cdp,name){const dir=process.env.MEGULIT_SPEAKER_SHOTS;if(!dir)return;await cdp.evaluate(`document.querySelector('${box}')?.scrollIntoView({block:'center'})`);await waitFor(cdp,`(()=>{const p=document.querySelector("${menu}");return !!p&&getComputedStyle(p).opacity==="1"&&!p.dataset.surfacePending&&document.querySelector("${box}").getBoundingClientRect().height>0;})()`);await sleep(400);const r=await cdp.send('Page.captureScreenshot',{format:'png'});fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(r.data,'base64'));}

test('分角色: listed with the game\'s colours, an honest note for a work that does not colour by speaker, a picked colour applies at once and resets',{skip:!hasEdge&&'Edge is not installed',timeout:90000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-speaker-ui-'));let cdp;
 const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.join(web,rel);
  if(!file.startsWith(web+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  const content=fs.readFileSync(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(rel==='/reader/index.html'?String(content).replace('<head>','<head>'+stub()):content);});
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const url=`http://127.0.0.1:${server.address().port}/reader/index.html`;await cdp.send('Page.navigate',{url});
  await waitFor(cdp,'!!window.__TOME_READER_READY__&&!!window.__tomoyoChinese?.speakerColorsReceived',20000);
  await cdp.evaluate(`(()=>{const f=document.createElement('div');f.style.cssText='position:fixed;inset:0;z-index:-2147483647;pointer-events:none;background:linear-gradient(160deg,#3b2a35,#14161d)';document.body.prepend(f);
   const b=window.__tomoyoChinese;window.__tomoyoMode.set('translation');b.galStatus({bound:true,interfaceMode:'translation'});
   b.galLayout({clientX:0,clientY:0,clientWidth:innerWidth,clientHeight:innerHeight,surfaceWidth:innerWidth,surfaceHeight:innerHeight});})()`);
  const key={code:'KeyT',key:'t',modifiers:1,windowsVirtualKeyCode:84};
  await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',...key});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',...key});
  await waitFor(cdp,`!!document.querySelector('${menu} [data-menu-key=text]')`);
  await cdp.evaluate(`document.querySelector('${menu} [data-menu-key=text]').click()`);
  await waitFor(cdp,`[...document.querySelectorAll('${menu} [data-menu-category=text] .mg-subtabs > button')].some(b=>b.textContent.trim()==='颜色')`);
  await cdp.evaluate(`[...document.querySelectorAll('${menu} [data-menu-category=text] .mg-subtabs > button')].find(b=>b.textContent.trim()==='颜色').click()`);
  await waitFor(cdp,`!!document.querySelector('${box}')&&document.querySelector('${box}').getBoundingClientRect().height>0`);

  /* not bound to a work yet, then bound with nothing seen */
  assert.equal((await text(cdp)).state,'unbound');
  await status(cdp,{seen:{},user:{}});
  assert.equal((await text(cdp)).state,'none');

  /* every speaker in one colour: the entry stays and says so */
  await status(cdp,{seen:{'蓮':'#ffffff','アヤ':'#ffffff'},user:{}});
  let s=await text(cdp);assert.equal(s.state,'uniform');assert.equal(s.say,'该作品不分角色字体颜色');assert.deepEqual(s.rows,[]);
  await shot(cdp,'speaker-colors-uniform');

  /* a work that colours by speaker: the game's pink is learned from アヤメ's painted line */
  await status(cdp,{seen:{'蓮':'#ffffff'},user:{}});
  await cdp.evaluate(`(()=>{const b=window.__tomoyoChinese;b.galStatus({hookSource:${JSON.stringify(LINE)},hookSpeaker:'アヤメ',hookSequence:41});b.lineStyleSample({type:'lineStyleSample',text:${JSON.stringify(LINE)},style:{fill:'${AYAME}',alpha:1},origin:'draw-gpu'});})()`);
  await waitFor(cdp,`document.querySelectorAll('${box} .mg-speaker').length===2`);
  s=await text(cdp);assert.equal(s.state,'list');
  assert.deepEqual(s.rows.map(r=>[r.name,r.color,r.reset]),[['蓮','#ffffff',false],['アヤメ',AYAME,false]]);
  assert.equal(s.rows[0].change,'改色');
  assert.equal(await lineColor(cdp),AYAME,'the line is painted the game\'s own pink');
  await waitFor(cdp,`window.__sent.some(m=>m.type==='speakerColorsSave'&&m.table?.seen?.['アヤメ']==='${AYAME}')`,4000);
  const learned=await cdp.evaluate(`window.__sent.filter(m=>m.type==='speakerColorsSave').at(-1)`);
  assert.equal(learned.key,KEY,'saved for this work');
  await shot(cdp,'speaker-colors-list');

  /* the user picks a colour for アヤメ: the line on screen changes at once and the choice is saved for the work */
  await cdp.evaluate(`window.__sent.length=0;(()=>{const i=document.querySelector('${box} .mg-speaker[data-name="アヤメ"] input');i.value='#00aaff';i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  assert.equal(await lineColor(cdp),'#00aaff','applies to the line on screen at once');
  s=await text(cdp);assert.deepEqual(s.rows.find(r=>r.name==='アヤメ'),{name:'アヤメ',color:'#00aaff',reset:true,change:'改色'});
  await waitFor(cdp,`window.__sent.some(m=>m.type==='speakerColorsSave'&&m.table?.user?.['アヤメ']==='#00aaff'&&m.table?.seen?.['アヤメ']==='${AYAME}')`,4000);
  assert.ok(!(await cdp.evaluate(`window.__sent.some(m=>m.type==='galPreview'||m.type==='galConfigure')`)),'the speaker rows do not touch the global text settings');
  await shot(cdp,'speaker-colors-changed');

  /* the next line by アヤメ, drawn pink by the game, still shows the user's colour; another speaker's line keeps the game's */
  await cdp.evaluate(`(()=>{const b=window.__tomoyoChinese,t='「蓮君もついに３年生」';b.galStatus({hookSource:t,hookSpeaker:'アヤメ',hookSequence:42});b.lineStyleSample({type:'lineStyleSample',text:t,style:{fill:'${AYAME}',alpha:1},origin:'draw-gpu'});})()`);
  assert.equal(await lineColor(cdp),'#00aaff');
  await cdp.evaluate(`(()=>{const b=window.__tomoyoChinese,t='「誰だ？」';b.galStatus({hookSource:t,hookSpeaker:'蓮',hookSequence:43});b.lineStyleSample({type:'lineStyleSample',text:t,style:{fill:'#ffffff',alpha:1},origin:'draw-gpu'});})()`);
  assert.equal(await lineColor(cdp),'#ffffff');

  /* 恢复默认: the game's colour again, for the list and the next line */
  await cdp.evaluate(`document.querySelector('${box} .mg-speaker[data-name="アヤメ"] [data-act=reset]').click()`);
  s=await text(cdp);assert.deepEqual(s.rows.find(r=>r.name==='アヤメ'),{name:'アヤメ',color:AYAME,reset:false,change:'改色'});
  await cdp.evaluate(`(()=>{const b=window.__tomoyoChinese,t='「ありましたね……？」';b.galStatus({hookSource:t,hookSpeaker:'アヤメ',hookSequence:44});b.lineStyleSample({type:'lineStyleSample',text:t,style:{fill:'${AYAME}',alpha:1},origin:'draw-gpu'});})()`);
  assert.equal(await lineColor(cdp),AYAME);

  /* the language follows the reader */
  await cdp.evaluate(`window.__tomeI18n?.set?.('ja');dispatchEvent(new Event('tome-language-change'))`);
  assert.equal(await cdp.evaluate(`document.querySelector('${box} .mg-speakers-head').textContent`),'キャラ別');
 }finally{
  await cdp?.stop();server.closeAllConnections();await new Promise(r=>server.close(r));
  try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:150});}catch(e){if(!['EBUSY','EPERM','ENOTEMPTY'].includes(e?.code))throw e;}
 }
});
