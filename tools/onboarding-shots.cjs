// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 pictures of the 新手引导 (web/assets/onboarding/<step>.webp): the real reader page in headless Edge over
   MeguLit's own default background with a sample line, the tour walked to each step, its card hidden, and the lit part
   cropped to 16:9. The ring the tour draws is the annotation. Run again after the capsule or the Alt+T menu changes:
     node tools/onboarding-shots.cjs --lang zh   (and --lang en, --lang ja: one set per interface language)
   Each picture also lands as <step>-<lang>.png in --png when given; --full keeps the card and saves the whole screen
   there instead (the PR's screenshots of every step). */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('../validation/library-views-perf.cjs');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?process.argv[i+1]:d;};
const FULL=process.argv.includes('--full'),LANG=arg('lang','zh'),OUT=path.resolve(arg('out',path.join(WEB,'assets','onboarding'))),PNG=arg('png','');
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json','.webp':'image/webp'};
const STUB=`<script>try{localStorage.clear();}catch{}window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:${JSON.stringify(LANG)},themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};
  if(r.action==='reader_bootstrap')return {engines:[],native:{new_game_tip:false}};if(r.action==='reader_message')return {replies:[]};return {};}return null;}};</script>`;
function serve(){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
 if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}res.writeHead(404);return res.end();}
 let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}
/* a line of our own (not from any game), drawn by the reader the way a hooked line is */
const LINE={zh:['今日は、いい天気ですね。','今天天气真好呢。'],en:['今日は、いい天気ですね。','Nice weather today, isn’t it.'],ja:['今日は、いい天気ですね。','今日は、いい天気ですね。']};
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});if(PNG)fs.mkdirSync(PNG,{recursive:true});
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-tour-shots-'));const server=await serve();const cdp=await startEdge(path.join(temp,'edge'));
 try{await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<160&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  if(!ready)throw Error('reader did not load');
  const [ja,tr]=LINE[LANG]||LINE.zh;
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');/* no real game here: keep the page bound */setInterval(()=>document.body.classList.add('tomoyo-gal-bound'),50);
   const line=document.querySelector('.sentence-window .sentence-text');line.innerHTML=${JSON.stringify(ja)}.split(/(?<=[、。])/).map(s=>'<span class="char-token">'+s+'</span>').join('');
   const bg=document.createElement('div');bg.style.cssText='position:fixed;inset:0;z-index:-1;background:#120b0d url(/assets/default-background-dark.webp) center/cover no-repeat';document.body.prepend(bg);
   const tr=document.createElement('div');tr.className='mg-shot-tr';tr.textContent=${JSON.stringify(tr)};line.after(tr);
   const st=document.createElement('style');st.textContent='.sentence-window{position:fixed!important;inset:auto 14% 7% 14%!important;transform:none!important;translate:none!important;margin:0!important;height:auto!important;padding:22px 32px!important;border-radius:14px!important;background:rgba(14,8,10,.62)!important;backdrop-filter:blur(8px)}.sentence-window .sentence-text{font:500 34px/1.5 "Noto Serif JP","Yu Mincho",serif!important;color:#fff!important;display:block!important;visibility:visible!important;opacity:1!important}.mg-shot-hand{position:fixed;z-index:2147483000;display:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))}body[data-shot=lookup] .mg-shot-hand{display:block}.mg-shot-tr{font:22px/1.5 "Microsoft YaHei UI",sans-serif;color:#f3d9c9;margin-top:6px}'+(${FULL}?'':'.mg-tour-card{visibility:hidden!important}')+'.mg-tour-dim path{fill:rgba(8,4,6,.42)!important}.sentence-window .tomoyo-cn-output{display:none!important}';document.head.append(st);
   /* the reader puts an unbound line where its calibration says; for the picture it sits low in the middle like a game's text box */
   const box=document.querySelector('.sentence-window');const pin=()=>{for(const [k,v] of Object.entries({position:'fixed',left:'16%',right:'16%',top:'auto',bottom:'8%',width:'auto',transform:'none',translate:'none'}))box.style.setProperty(k,v,'important');};pin();setInterval(pin,100);
   /* a pointer on 天気 for the lookup picture */const hand=document.createElement('div');hand.className='mg-shot-hand';hand.innerHTML='<svg viewBox="0 0 24 24" width="34" height="34"><path d="M5 3l13 7.5-6 1.6 3.6 6.4-2.6 1.5-3.6-6.4L5 18z" fill="#fff" stroke="#1a0d10" stroke-width="1.4" stroke-linejoin="round"/></svg>';document.body.append(hand);
   setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);return 1;})()`);
  await sleep(1500);
  await cdp.evaluate(`window.__megulitTour.start()`);
  const steps=require(path.join(WEB,'onboarding-steps.js')).STEPS;
  for(let i=0;i<steps.length;i++){
   if(i)await cdp.evaluate(`document.querySelector('.mg-tour-next').click()`);
   await sleep(1400);
   await cdp.evaluate(`(()=>{document.body.dataset.shot=${JSON.stringify(steps[i].id)};const tok=[...document.querySelectorAll('.sentence-text .char-token')].pop();const h=document.querySelector('.mg-shot-hand');if(tok){const r=tok.getBoundingClientRect();h.style.left=(r.left+r.width*.3)+'px';h.style.top=(r.top+r.height*.55)+'px';}return 1;})()`);
   /* the capsule opens into its quick bar when it is pointed at: show it open for the hotkey step */
   if(steps[i].id==='hotkey'){const r=await cdp.evaluate(`(()=>{const b=document.querySelector('#mg-cap .mg-cap-brand,#mg-cap .mg-cap-s').getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()`);
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x,y:r.y});await sleep(900);await cdp.evaluate('window.dispatchEvent(new Event("resize"))');await sleep(500);}
   const box=await cdp.evaluate(`(()=>{const rs=[...document.querySelectorAll('.mg-tour-ring')].map(e=>e.getBoundingClientRect());if(!rs.length)return null;
    return {x:Math.min(...rs.map(r=>r.left)),y:Math.min(...rs.map(r=>r.top)),r:Math.max(...rs.map(r=>r.right)),b:Math.max(...rs.map(r=>r.bottom)),W:innerWidth,H:innerHeight};})()`);
   let clip={x:0,y:0,width:1920,height:1080};
   if(box){const cx=(box.x+box.r)/2,cy=(box.y+box.b)/2;let w=Math.max(720,(box.r-box.x)*1.18,(box.b-box.y)*1.25*16/9);w=Math.min(box.W,w);const h=w*9/16;
    clip={x:Math.min(Math.max(0,cx-w/2),box.W-w),y:Math.min(Math.max(0,cy-h/2),box.H-h),width:w,height:h};}
   if(FULL){const full=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(PNG,steps[i].id+'-full-'+LANG+'.png'),Buffer.from(full.data,'base64'));console.log(steps[i].id,'full');continue;}
   const scale=960/clip.width;
   const shot=await cdp.send('Page.captureScreenshot',{format:'webp',quality:84,clip:{...clip,scale}});
   fs.writeFileSync(path.join(OUT,require(path.join(WEB,'onboarding-steps.js')).image(steps[i].image,LANG)),Buffer.from(shot.data,'base64'));
   if(PNG){const full=await cdp.send('Page.captureScreenshot',{format:'png',clip:{...clip,scale}});fs.writeFileSync(path.join(PNG,steps[i].id+'-'+LANG+'.png'),Buffer.from(full.data,'base64'));}
   console.log(steps[i].id,Math.round(clip.width)+'x'+Math.round(clip.height));
  }
 }finally{await cdp.stop();server.close();await sleep(300);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
})().catch(e=>{console.error(e);process.exit(1);});
