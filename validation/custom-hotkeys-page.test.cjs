'use strict';
/* 2026-11-27 Settings → 热键 in the real main window (headless Edge, the real service): click a key, press the keys or a mouse
   side button, and the key is saved and shown at once; a key another action holds is refused with that action named; 恢复默认
   puts the default back. The Alt+T menu mounts the same panel (web/reader/modules/menu-layout.js).
   Screenshots: MEGULIT_SHOTS=<dir> node --test validation/custom-hotkeys-page.test.cjs */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),test=require('node:test');
const {startService,startWeb,startEdge}=require('./library-views-perf.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SHOTS=process.env.MEGULIT_SHOTS||'';

test('Settings → 热键 records a combination and a mouse side button, refuses a taken key, restores the default',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megu-hotkeys-page-'));const root=path.join(temp,'root');fs.mkdirSync(root);
 const service=startService(root);let web,edge;
 t.after(async()=>{await edge?.stop();web?.close();await service.stop();await sleep(300);fs.rmSync(temp,{recursive:true,force:true,maxRetries:3,retryDelay:200});});
 web=await startWeb(service);
 try{edge=await startEdge(path.join(temp,'edge'));}catch(error){if(error.message==='EDGE_NOT_FOUND')return t.skip('Edge unavailable');throw error;}
 const {send,evaluate}=edge;
 const until=async(what,expr,ms=60000)=>{const end=Date.now()+ms;for(;;){const v=await evaluate(expr).catch(()=>false);if(v)return v;assert.ok(Date.now()<end,what);await sleep(200);}};
 const shot=async name=>{if(!SHOTS)return;fs.mkdirSync(SHOTS,{recursive:true});const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(SHOTS,name+'.png'),Buffer.from(r.data,'base64'));};
 /* a busy CI shard can leave the first load stuck: load again once before giving up, and say what the page had */
 const ready=`!!document.querySelector('#main')&&typeof window.MeguHotkeys==='object'`;
 for(let attempt=0;;attempt++){await send('Page.navigate',{url:`http://127.0.0.1:${web.address().port}/#%7B%7D`});const end=Date.now()+60000;let up=false;
  while(Date.now()<end&&!(up=await evaluate(ready).catch(()=>false)))await sleep(250);
  if(up)break;const seen=await evaluate(`JSON.stringify({state:document.readyState,url:location.href,main:!!document.querySelector('#main'),hotkeys:typeof window.MeguHotkeys})`).catch(e=>e.message);
  assert.ok(attempt<1,'the main window: '+seen);}
 await sleep(1500);
 await evaluate(`(()=>{document.querySelectorAll('dialog').forEach(d=>{try{d.close();}catch{}d.remove();});const st=document.createElement('style');st.textContent='#toast,[class*=toast],#reader-notice{display:none!important}';document.head.append(st);return 1;})()`);
 /* to Settings, then its 热键 section (in 游戏中) */
 await until('the settings tab',`(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>/^(设置|Settings)$/.test(e.textContent.trim()));if(!b)return false;b.click();return true;})()`);
 await until('the 热键 section in the settings nav',`(()=>{const b=document.querySelector('.settings-nav [data-section=hotkeys]');if(!b)return false;b.click();return true;})()`);
 await until('the hotkeys panel',`document.querySelectorAll('.megu-hotkeys-row').length===4`);
 /* the page fades in after the route change: wait until the key box is what a click would hit */
 await until('the panel on screen',`(()=>{/* the first-start notices open late; they are not what is tested here */document.querySelectorAll('dialog').forEach(d=>{try{d.close();}catch{}d.remove();});const e=document.querySelector('.megu-hotkeys-row[data-action=menu] [data-record]');e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return !!hit&&e.contains(hit);})()`);
 await sleep(1500);
 const keyOf=a=>evaluate(`document.querySelector('.megu-hotkeys-row[data-action=${a}] [data-record]').textContent.trim()`);
 const msgOf=a=>evaluate(`document.querySelector('.megu-hotkeys-row[data-action=${a}] .megu-hotkeys-msg').textContent`);
 const saved=async()=>(await service.call({action:'hotkeys_get'})).bindings;
 assert.deepEqual([await keyOf('bind'),await keyOf('menu'),await keyOf('cover'),await keyOf('log')],['Alt+M','Alt+T','Alt+H','Alt+L'],'the keys MeguLit always had');
 await evaluate(`document.querySelector('.megu-hotkeys').scrollIntoView({block:'start'})`);await shot('1-settings-hotkeys');
 const click=async selector=>{const r=await evaluate(`(()=>{document.querySelectorAll('dialog').forEach(d=>{try{d.close();}catch{}d.remove();});const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x,y:r.y});await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',buttons:0,clickCount:1});await sleep(150);return r;};
 const press=async(code,key,keyCode,modifiers)=>{for(const [type,m] of [['rawKeyDown',modifiers],['keyUp',modifiers]])await send('Input.dispatchKeyEvent',{type,modifiers:m,code,key,windowsVirtualKeyCode:keyCode});await sleep(400);};
 /* 1: 开关菜单 → Ctrl+Shift+K (CDP modifiers: Alt 1, Ctrl 2, Meta 4, Shift 8) */
 await click('.megu-hotkeys-row[data-action=menu] [data-record]');
 assert.match(await keyOf('menu'),/按下按键或鼠标键/,'waiting for a key');await shot('2-recording');
 await send('Input.dispatchKeyEvent',{type:'rawKeyDown',modifiers:2,code:'ControlLeft',key:'Control',windowsVirtualKeyCode:17});
 assert.match(await keyOf('menu'),/按下按键或鼠标键/,'a modifier alone keeps waiting');
 await press('KeyK','K',75,10);
 await until('saved Ctrl+Shift+K',`document.querySelector('.megu-hotkeys-row[data-action=menu] [data-record]').textContent.trim()==='Ctrl+Shift+K'`);
 assert.equal((await saved()).menu,'Ctrl+Shift+K','kept by the service');
 assert.match(await msgOf('menu'),/已保存/);
 assert.equal(await evaluate(`window.MeguHotkeys.display('menu')`),'Ctrl+Shift+K','every hint reads the new key');
 /* 2: 开关内嵌 / 覆盖 → the same key: refused, 开关菜单 named */
 await click('.megu-hotkeys-row[data-action=cover] [data-record]');
 await press('KeyK','K',75,10);
 await until('the conflict message',`/开关菜单/.test(document.querySelector('.megu-hotkeys-row[data-action=cover] .megu-hotkeys-msg').textContent)`);
 assert.equal(await keyOf('cover'),'Alt+H','not changed');assert.equal((await saved()).cover,'Alt+H');
 await shot('3-conflict');
 /* 3: 打开日志 → mouse side button (X1, "back") */
 await click('.megu-hotkeys-row[data-action=log] [data-record]');
 assert.match(await keyOf('log'),/按下按键或鼠标键/);
 const r=await evaluate(`(()=>{const b=document.querySelector('.megu-hotkeys-row[data-action=log] [data-record]').getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()`);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x,y:r.y});
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'back',buttons:8,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'back',buttons:0,clickCount:1});
 await until('saved the side button: '+await evaluate(`document.querySelector('.megu-hotkeys-row[data-action=log]').textContent`)+JSON.stringify(await saved()),`document.querySelector('.megu-hotkeys-row[data-action=log] [data-record]').textContent.trim()==='鼠标侧键 1'`);
 assert.equal((await saved()).log,'MouseX1');
 assert.match(await msgOf('log'),/鼠标键只给 MeguLit 用/,'a side button alone gets its note');
 await shot('4-mouse-side-button');
 /* 4: 恢复默认 */
 await click('.megu-hotkeys-row[data-action=menu] [data-reset]');
 await until('back to Alt+T',`document.querySelector('.megu-hotkeys-row[data-action=menu] [data-record]').textContent.trim()==='Alt+T'`);
 assert.equal((await saved()).menu,'Alt+T');
 assert.equal(fs.existsSync(path.join(root,'data','config','hotkeys.json')),true,'in data/config/hotkeys.json');
});
