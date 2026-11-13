#!/usr/bin/env node
'use strict';
/* Multi-track drift evidence: idle drift frame cost, search -> rails, clear -> drift, interrupted typing; strips + perf.json.
   create-NN.png, perf.json. The real web/ UI in headless Edge on 60 fake games with generated covers (bright, dark and mid tones).
   Every animation runs twice: once measured (low-cost screencast for presented-frame gaps + rAF main-thread frames + LoAF),
   once captured as full-size PNG frames. Temp data lives under H:/MeguLit-Work/tmp unless --tmp is given. Never touches a real MeguLit window.
   Usage: node validation/library-select-blueprint.cjs --out DIR [--tmp DIR] */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),{spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),WEB=path.join(ROOT,'web');
const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback;};
const OUT=path.resolve(arg('out',path.join(os.tmpdir(),'megulit-library-views')));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* ---------- services on a temp root ---------- */
function startService(root){const child=spawn(process.execPath,[path.join(ROOT,'services','server.cjs')],{env:{...process.env,MEGULIT_ROOT:root},stdio:['pipe','pipe','ignore']});
 let next=1,buf='';const waits=new Map();
 child.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);let m;try{m=JSON.parse(line);}catch{continue;}const w=waits.get(m.id);if(w){waits.delete(m.id);m.ok?w[0](m.data):w[1](Error(m.error));}}});
 const call=(request,ms=20000)=>new Promise((res,rej)=>{const id=next++;waits.set(id,[res,rej]);child.stdin.write(JSON.stringify({id,request})+'\n');setTimeout(()=>{if(waits.delete(id))rej(Error('SERVICE_TIMEOUT'));},ms);});
 return {call,stop:async()=>{await call({action:'__shutdown'},5000).catch(()=>{});child.kill();}};}

/* ---------- static server + test transport ---------- */
const TRANSPORT=`<script>(()=>{const S=JSON.parse(decodeURIComponent((location.hash.slice(1))||'%7B%7D'));const svg=c=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="100%" height="100%" fill="'+c+'"/></svg>');
 window.__TOME_TEST_TRANSPORT__=async(command,args)=>{if(command!=='service')return null;const r=(args&&args.request)||{};
  if(r.action==='background'&&S.color)return svg(S.color);if(r.action==='site_updates')return fetch('/__site-updates.json').then(x=>x.ok?x.json():[]).catch(()=>[]);if(/^(update_check|update_status|launch|focus_game)$/.test(r.action))return {};
  let out;try{out=await fetch('/svc',{method:'POST',body:JSON.stringify(r)}).then(x=>x.json());}catch{out={ok:false,error:'SERVICE_FAILED'};}if(!out.ok)throw Error(out.error);let d=out.data;
  if(r.action==='home'&&d&&d.preferences){if(S.color){d.preferences.glassColor=S.color;d.preferences.homeBackground='custom.png';d.preferences.backgroundDim=0;d.background={...(d.background||{}),dim:0};}if(S.theme)d.preferences.themeMode=S.theme;}
  return d;};})();</script>`;
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json','.mp3':'audio/mpeg','.gif':'image/gif'};
function startWeb(service){const server=http.createServer(async(req,res)=>{try{
  if(req.method==='POST'&&req.url==='/svc'){let body='';for await(const c of req)body+=c;let reply;try{reply={ok:true,data:await service.call(JSON.parse(body))};}catch(e){reply={ok:false,error:e.message};}
   res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(reply===undefined?null:reply));}
  let rel=decodeURIComponent(new URL(req.url,'http://x').pathname);if(rel==='/__site-updates.json'){res.writeHead(200,{'content-type':'application/json'});return res.end(fs.readFileSync(path.join(ROOT,'site','public','assets','updates.json')));}if(rel==='/')rel='/index.html';const file=path.join(WEB,path.normalize(rel));
  if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  let data=fs.readFileSync(file);if(rel==='/index.html')data=Buffer.from(String(data).replace(/<script type="module"/,TRANSPORT+'<script type="module"'));
  res.writeHead(200,{'content-type':TYPES[path.extname(file).toLowerCase()]||'application/octet-stream'});res.end(data);}catch{res.writeHead(500);res.end();}});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}

/* ---------- headless Edge over CDP ---------- */
function edgePath(){for(const p of [process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'])if(p&&fs.existsSync(p))return p;throw Error('EDGE_NOT_FOUND');}
async function startEdge(profile){const child=spawn(edgePath(),['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size='+String(arg('size','1920x1080')).replace('x',','),'--hide-scrollbars','--force-device-scale-factor=1',
  '--no-first-run','--no-default-browser-check','--disable-extensions','--mute-audio','about:blank'],{stdio:'ignore'});
 const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++)await sleep(100);const port=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0];
 let target;for(let i=0;i<50&&!target;i++){target=(await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json()).catch(()=>[])).find(t=>t.type==='page');if(!target)await sleep(100);}
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let next=1;const waits=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method&&globalThis.__cdpEvent)globalThis.__cdpEvent(m);const w=m.id&&waits.get(m.id);if(w){waits.delete(m.id);m.error?w[1](Error(m.error.message)):w[0](m.result);}};
 const send=(method,params={})=>new Promise((res,rej)=>{const id=next++;waits.set(id,[res,rej]);ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('EVAL: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result.value;};
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:Number(String(arg('size','1920x1080')).split('x')[0]),height:Number(String(arg('size','1920x1080')).split('x')[1]),deviceScaleFactor:1,mobile:false});
 const api={send,evaluate,set onEvent(f){globalThis.__cdpEvent=f;},get onEvent(){return globalThis.__cdpEvent;},stop:()=>{try{ws.close();}catch{}child.kill();}};return api;}


/* tiny PNG writer: a vertical two-colour gradient cover */
function crc(buf){let c,t=crc.t;if(!t){t=crc.t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}}c=-1;for(const b of buf)c=t[(c^b)&255]^(c>>>8);return (c^-1)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c]);}
function png(w,h,a,b){const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;const t=y/h;for(let x=0;x<w;x++){const o=y*(w*3+1)+1+x*3;for(let k=0;k<3;k++)raw[o+k]=Math.min(255,Math.round(a[k]*(1-t)+b[k]*t+((x*7+y*3)%17)));}}
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}

const PROBE=`(()=>{if(window.__probe)return 1;window.__probe=1;window.__frames=[];window.__loaf=[];let last=0,on=true;const tick=t=>{if(last)window.__frames.push(t-last);last=t;if(on)requestAnimationFrame(tick);};requestAnimationFrame(tick);
 try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__loaf.push({d:Math.round(e.duration),block:Math.round(e.blockingDuration||0),style:Math.round(e.styleAndLayoutStart?e.startTime+e.duration-e.styleAndLayoutStart:0),scripts:(e.scripts||[]).filter(x=>x.duration>4).map(x=>({fn:(x.sourceFunctionName||x.invoker||'').slice(0,40),src:String(x.sourceURL||'').split('/').pop(),d:Math.round(x.duration),forced:Math.round(x.forcedStyleAndLayoutDuration||0)}))});}).observe({type:'long-animation-frame'});}catch{}
 window.__stop=()=>{};return 1;})()`;
/* headless-only: hide toasts and the native-components notice (#reader-notice, 游戏内功能未就绪) with one style rule, never in the app */
const HIDE=`(()=>{document.querySelectorAll('dialog').forEach(d=>{try{d.close();}catch{}d.remove();});const st=document.createElement('style');st.textContent='.toast,.toast-stack,[class*=toast],#reader-notice{display:none!important}';document.head.append(st);return 1;})()`;
const pct=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return Math.round(s[Math.min(s.length-1,Math.ceil(p/100*s.length)-1)]*10)/10;};

/* in-page continuity probe: every frame, the largest jump of any cover that is on screen (px) - a restart or snap shows up here */
const JUMP=`(()=>{if(window.__jumpOn)return 1;window.__jumpOn=1;window.__jump={max:0,at:0,n:0};const last=new Map();const t0=performance.now();
 const tick=()=>{for(const n of document.querySelectorAll('.field-plane>mg-cell')){const m=/translate\\(([-\\d.]+)px,\\s*([-\\d.]+)px\\)/.exec(n.style.transform);if(!m)continue;const x=+m[1],y=+m[2],p=last.get(n);
  if(p&&x>-100&&x<innerWidth&&y>-100&&y<innerHeight&&p.x>-100&&p.y>-100&&p.y<innerHeight){const d=Math.hypot(x-p.x,y-p.y);if(d>window.__jump.max&&d<innerHeight*.6){window.__jump.max=d;window.__jump.at=Math.round(performance.now()-t0);}}last.set(n,{x,y});}
  window.__jump.n++;requestAnimationFrame(tick);};requestAnimationFrame(tick);return 1;})()`;
async function main(){fs.mkdirSync(OUT,{recursive:true});const tmpRoot=path.resolve(arg('tmp','H:/MeguLit-Work/tmp'));fs.mkdirSync(tmpRoot,{recursive:true});
 const temp=fs.mkdtempSync(path.join(tmpRoot,'megulit-drift-'));const root=path.join(temp,'root');fs.mkdirSync(root);
 const service=startService(root);const N=Number(arg('games',60));
 const palette=[[200,50,60],[40,90,160],[230,170,60],[60,150,110],[130,70,170],[220,110,150],[30,40,60],[240,230,210]];
 for(let i=0;i<N;i++){const dir=path.join(temp,'games','g'+i);fs.mkdirSync(dir,{recursive:true});const exe=path.join(dir,'game.exe');fs.writeFileSync(exe,'MZ');
  await service.call({action:'save_game',title:'テストゲーム '+(i+1),executable:exe}).catch(e=>console.error('seed',e.message));}
 const home=await service.call({action:'home'});
 for(const [i,g] of (home.games||[]).entries()){const file=path.join(temp,'c'+i+'.png');const top=i%8,bot=(i*3+1)%8;
  fs.writeFileSync(file,top===7?png(240,340,[250,248,240],[232,224,206]):png(240,340,palette[top],palette[top===6?6:bot]));
  await service.call({action:'game_cover',id:g.id,path:file}).catch(e=>console.error('cover',e.message));}
 const web=await startWeb(service),port=web.address().port,cdp=await startEdge(path.join(temp,'edge'));const perf={size:arg('size','1920x1080'),games:N,runs:{}};
 const shoot=async name=>{const r=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(r.data,'base64'));};
 const raw={};
 const measure=async(name,fn,span)=>{await cdp.evaluate(PROBE);await cdp.evaluate(JUMP);const shots=[];cdp.onEvent=m=>{if(m.method==='Page.screencastFrame'){shots.push(m.params.metadata.timestamp*1000);cdp.send('Page.screencastFrameAck',{sessionId:m.params.sessionId}).catch(()=>{});}};
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:5,maxWidth:480,maxHeight:270,everyNthFrame:1});await sleep(300);shots.length=0;await cdp.evaluate('(()=>{window.__frames=[];window.__loaf=[];window.__jump.max=0;return 1;})()');
  const t0=Date.now();await fn();await sleep(span);await cdp.send('Page.stopScreencast');cdp.onEvent=null;
  const w=shots.filter(t=>t>=t0-5&&t<=t0+span),gaps=w.slice(1).map((t,i)=>t-w[i]);const r=await cdp.evaluate('({frames:window.__frames,loaf:window.__loaf,jump:window.__jump})');const f=r.frames.slice(0,Math.round(span/16.7));
  const row={windowMs:span,presented:{frames:w.length,p95:pct(gaps,95),max:Math.round(Math.max(0,...gaps)*10)/10,over33:gaps.filter(g=>g>33.4).length},main:{frames:f.length,p95:pct(f,95),max:Math.round(Math.max(0,...f)*10)/10,over25:f.filter(x=>x>25).length},
   maxCoverJumpPx:Math.round(r.jump.max),loaf:r.loaf.map(x=>x.d)};
  (perf.runs[name]=perf.runs[name]||[]).push(row);(raw[name]=raw[name]||{gaps:[],frames:[]});raw[name].gaps.push(...gaps);raw[name].frames.push(...f);console.log(name.padEnd(10),JSON.stringify(row));};
 const SLOW=Number(arg('slow',6));
 const capture=async(name,fn,span,keep)=>{const frames=[];await cdp.send('Animation.enable');await cdp.send('Animation.setPlaybackRate',{playbackRate:1/SLOW});await cdp.evaluate('(()=>{if(window.gsap)gsap.globalTimeline.timeScale('+(1/SLOW)+');return 1;})()');
  const t0=Date.now();await fn(SLOW);while(Date.now()-t0<span*SLOW+200){const a=Date.now();const r=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:80});frames.push({v:((a+Date.now())/2-t0)/SLOW,d:r.data});}
  await cdp.send('Animation.setPlaybackRate',{playbackRate:1});await cdp.evaluate('(()=>{if(window.gsap)gsap.globalTimeline.timeScale(1);return 1;})()');
  const w=frames.filter(x=>x.v<=span+5),pick=[];for(let k=0;k<keep&&w.length;k++){const target=k*span/(keep-1);const p=w.reduce((b,x)=>Math.abs(x.v-target)<Math.abs(b.v-target)?x:b,w[0]);if(!pick.includes(p))pick.push(p);}
  const list=pick.map((p,k)=>{const ms=Math.max(0,Math.round(p.v)),file=name+'-'+String(k).padStart(2,'0')+'-'+String(ms).padStart(4,'0')+'ms.jpg';fs.writeFileSync(path.join(OUT,file),Buffer.from(p.d,'base64'));return {file,ms};});
  (perf.frames=perf.frames||{})[name]=list;console.log(name,'frames',list.map(x=>x.ms+'ms').join(' '));};
 const type=v=>cdp.evaluate('(()=>{const i=document.querySelector(".field-search input");i.value='+JSON.stringify(v)+';i.dispatchEvent(new Event("input",{bubbles:true}));return 1;})()');
 const Q=arg('query','1'),EMPTY='';
 const interrupt=async(s=1)=>{await type(Q);await sleep(420*s);await type(EMPTY);await sleep(380*s);await type('2');};
 try{await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+port+'/#%7B%7D'});
  for(let i=0;i<80;i++){await sleep(250);if(await cdp.evaluate('!!(window.__megulitTest&&document.querySelector("#main"))').catch(()=>false))break;}await sleep(2000);
  await cdp.evaluate('(()=>{localStorage.setItem("megulit-library-view","tracks");localStorage.setItem("tome-library-wall","on");return 1;})()');await cdp.evaluate(HIDE);
  await cdp.evaluate('(async()=>{await window.__megulitTest.navigate("library");return 1;})()');await sleep(3500);await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:1075});
  perf.covers=await cdp.evaluate('document.querySelectorAll(".field-drift .field-plane>mg-cell").length');console.log('covers in drift',perf.covers);
  await shoot('drift-idle');
  const ROUNDS=Number(arg('rounds',2));
  for(let r=0;r<ROUNDS;r++){await measure('idle',async()=>{},3000);await measure('search',()=>type(Q),1500);await shoot('rails');await measure('clear',()=>type(EMPTY),1500);await sleep(400);}
  if(arg('probe')){for(let i=0;i<3;i++){await cdp.evaluate('(()=>{document.querySelector(".library-wall-toggle").click();return 1;})()');await sleep(2000);console.log('PROBE',JSON.stringify(await cdp.evaluate(fs.readFileSync(arg('probe'),'utf8'))));}return;}
  if(arg('towall')){
   /* drift -> wall: every frame, the screen y of the wall's first visible covers; steps after the arrival are the bug */
   const samp='(()=>{window.__ys=[];const t0=performance.now();const f=()=>{const n=[...document.querySelectorAll(".field-plane>mg-cell")].filter(x=>!x.hasAttribute("data-parked")).slice(0,3);window.__ys.push([Math.round(performance.now()-t0),...n.map(x=>Math.round(x.getBoundingClientRect().top))]);if(performance.now()-t0<2000)requestAnimationFrame(f);};requestAnimationFrame(f);return 1;})()';
   for(let r=0;r<2;r++){const shots=[];let n=0;cdp.onEvent=m=>{if(m.method==='Page.screencastFrame'){const f=path.join(OUT,'tw'+r+'-'+String(n++).padStart(3,'0')+'-'+Math.round(m.params.metadata.timestamp*1000)+'.jpg');fs.writeFileSync(f,Buffer.from(m.params.data,'base64'));cdp.send('Page.screencastFrameAck',{sessionId:m.params.sessionId}).catch(()=>{});}};
    await cdp.send('Page.startScreencast',{format:'jpeg',quality:70,maxWidth:960,maxHeight:540,everyNthFrame:1});await sleep(300);fs.writeFileSync(path.join(OUT,'click'+r+'.txt'),String(Date.now()));
    await cdp.evaluate('(()=>{document.querySelector(".library-wall-toggle").click();return 1;})()');await sleep(30);await cdp.evaluate(samp);await sleep(2200);await cdp.send('Page.stopScreencast');cdp.onEvent=null;
    const ys=await cdp.evaluate('window.__ys');const steps=[];for(let i=1;i<ys.length;i++){const d=ys[i][1]-ys[i-1][1];if(Math.abs(d)>=1&&ys[i][0]>300)steps.push([ys[i][0],d]);}console.log('toWall steps after 300ms',JSON.stringify(steps));
    await cdp.evaluate('(()=>{document.querySelector(".library-wall-toggle").click();return 1;})()');await sleep(1500);await cdp.evaluate('(()=>{document.querySelector(".library-wall-toggle").click();return 1;})()');await sleep(1800);}
   return;}
  /* wheel dolly and drag parallax (user 2026-11-13) */
  const wheel=async(dy,n)=>{for(let i=0;i<n;i++){await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:960,y:760,deltaX:0,deltaY:dy});await sleep(40);}};
  const dragBy=async(dx,dy,steps,s=1)=>{await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:400,y:800,button:'left',clickCount:1});for(let i=1;i<=steps;i++){await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:400+dx*i/steps,y:800+dy*i/steps,button:'left',buttons:1});await sleep(16*s);}
   await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:400+dx,y:800+dy,button:'left',clickCount:1});};
  await measure('zoomIn',()=>wheel(-120,6),1200);await shoot('zoom-in');await measure('zoomOut',()=>wheel(120,12),1200);await shoot('zoom-out');await wheel(-120,6);await sleep(900);
  await measure('drag',()=>dragBy(520,-160,30),1600);
  await capture('drag',s=>dragBy(520,-160,30,s),1500,12);await sleep(1200);
  const held=await cdp.evaluate('(()=>{const n=document.querySelector(".field-drift .field-plane>mg-cell");return !!n;})()');
  await measure('interrupt',()=>interrupt(1),1800);await type(EMPTY);await sleep(1500);
  await capture('search',()=>type(Q),1200,12);await sleep(800);await shoot('rails-settled');
  await capture('clear',()=>type(EMPTY),1200,12);await sleep(800);
  await capture('interrupt',s=>interrupt(s),1800,14);
  for(const [name,r] of Object.entries(raw))perf.runs[name+'Pooled']={presented:{p95:pct(r.gaps,95),max:Math.round(Math.max(0,...r.gaps)*10)/10},main:{p95:pct(r.frames,95),max:Math.round(Math.max(0,...r.frames)*10)/10}};
 }finally{fs.writeFileSync(path.join(OUT,'perf.json'),JSON.stringify(perf,null,1));cdp.stop();web.close();await service.stop();await sleep(500);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
 console.log('evidence in '+OUT);}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=2;});
