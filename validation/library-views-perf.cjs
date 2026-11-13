#!/usr/bin/env node
'use strict';
/* Library view switch smoothness (2026-11-13): the real web/ UI in headless Edge on fake data (60 games with generated
   covers), cycles the three views (tracks -> wall -> list -> tracks) with the LED switch, records every frame interval
   and long animation frame for 1.6 s after each click, and screenshots each settled view.
   Usage: node validation/library-views-perf.cjs [--out DIR] [--rounds 3]
   Never touches a real MeguLit window. */
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
function png(w,h,a,b){const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;const t=y/h;for(let x=0;x<w;x++){const o=y*(w*3+1)+1+x*3;for(let k=0;k<3;k++)raw[o+k]=Math.round(a[k]*(1-t)+b[k]*t+((x*7+y*3)%17));}}
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}

const PROBE=`(()=>{if(window.__probe)return 1;window.__probe=1;window.__frames=[];window.__loaf=[];let last=0,on=true;const tick=t=>{if(last)window.__frames.push(t-last),(window.__stamps||(window.__stamps=[])).push(t);last=t;if(on)requestAnimationFrame(tick);};requestAnimationFrame(tick);
 try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__loaf.push({d:Math.round(e.duration),block:Math.round(e.blockingDuration||0)});}).observe({type:'long-animation-frame'});}catch{}
 window.__stop=()=>{};return 1;})()`;
const WINDOW=Number(arg('window',700));const p95=a=>{if(!a||!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return Math.round(s[Math.min(s.length-1,Math.floor(s.length*.95))]*10)/10;};
const VIEW=`(()=>{const t=document.querySelector('.library-wall-toggle');return t?t.dataset.view:'';})()`;

async function main(){fs.mkdirSync(OUT,{recursive:true});const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-views-'));const root=path.join(temp,'root');fs.mkdirSync(root);
 const service=startService(root);const N=Number(arg('games',60));
 const palette=[[200,50,60],[40,90,160],[230,170,60],[60,150,110],[130,70,170],[220,110,150],[30,40,60],[240,230,210]];
 for(let i=0;i<N;i++){const dir=path.join(temp,'games','g'+i);fs.mkdirSync(dir,{recursive:true});const exe=path.join(dir,'game.exe');fs.writeFileSync(exe,'MZ');
  await service.call({action:'save_game',title:'テストゲーム '+(i+1),executable:exe}).catch(e=>console.error('seed',e.message));}
 const home=await service.call({action:'home'});
 for(const [i,g] of (home.games||[]).entries()){const file=path.join(temp,'c'+i+'.png');fs.writeFileSync(file,png(240,340,palette[i%8],palette[(i*3+1)%8]));await service.call({action:'game_cover',id:g.id,path:file}).catch(e=>console.error('cover',e.message));}
 const web=await startWeb(service),port=web.address().port,cdp=await startEdge(path.join(temp,'edge'));const report={rounds:[]};
 try{await cdp.send('Page.navigate',{url:`http://127.0.0.1:${port}/#%7B%7D`});
  for(let i=0;i<80;i++){await sleep(250);if(await cdp.evaluate('!!(window.__megulitTest&&document.querySelector("#main"))').catch(()=>false))break;}await sleep(2000);
  await cdp.evaluate(`(()=>{document.querySelectorAll('dialog').forEach(d=>{try{d.close();}catch{}d.remove();});localStorage.setItem('megulit-library-view','tracks');const st=document.createElement('style');st.textContent='.toast,.toast-stack,[class*=toast],#reader-notice{display:none!important}';document.head.append(st);return 1;})()`);
  await cdp.evaluate(`(async()=>{await window.__megulitTest.navigate('library');return 1;})()`);await sleep(3000);
  const shoot=async name=>{const r=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(r.data,'base64'));};
  await shoot('settled-'+await cdp.evaluate(VIEW));
  const rounds=Number(arg('rounds',3));
  for(let k=0;k<rounds*3;k++){const from=await cdp.evaluate(VIEW);await cdp.evaluate(PROBE);await sleep(300);
   if(arg('profile')===String(k)){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:200});await cdp.send('Profiler.start');}
   const tracing=arg('trace')===String(k);let events=[];if(tracing){cdp.onEvent=m=>{if(m.method==='Tracing.dataCollected')events.push(...m.params.value);};await cdp.send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline,blink,v8.execute',transferMode:'ReportEvents'});}
   const shots=[];if(!tracing){cdp.onEvent=m=>{if(m.method==='Page.screencastFrame'){shots.push(m.params.metadata.timestamp*1000);cdp.send('Page.screencastFrameAck',{sessionId:m.params.sessionId}).catch(()=>{});}};
    await cdp.send('Page.startScreencast',{format:'jpeg',quality:5,maxWidth:480,maxHeight:270,everyNthFrame:1});await sleep(200);shots.length=0;}
   const t0=Date.now();await cdp.evaluate(`(()=>{window.__frames=[];window.__loaf=[];window.__stamps=[];window.__t0=performance.now();document.querySelector('.library-wall-toggle').click();return 1;})()`);await sleep(1600);
   let comp=null;if(!tracing){await cdp.send('Page.stopScreencast');cdp.onEvent=null;const w=shots.filter(t=>t>=t0-5&&t<=t0+1100);const win=[t0,...shots.filter(t=>t>t0&&t<=t0+WINDOW)],gaps=win.slice(1).map((t,i)=>t-win[i]);comp={frames:w.length,max:Math.round(Math.max(0,...gaps)*10)/10,over17:gaps.filter(g=>g>17.5).length,p95:p95(gaps),gaps};}
   if(tracing){const done=new Promise(r=>{const prev=cdp.onEvent;cdp.onEvent=m=>{prev(m);if(m.method==='Tracing.tracingComplete')r();};});await cdp.send('Tracing.end');await done;
    const main=events.filter(e=>e.ph==='X'&&e.dur>=1000&&/^(ParseHTML|Layout|UpdateLayoutTree|RecalculateStyles|Paint|PrePaint|Layerize|Commit|FunctionCall|EvaluateScript|TimerFire|FireAnimationFrame|HitTest|UpdateLayerTree|ScheduleStyleRecalculation|v8.callFunction)$/.test(e.name));
    const agg=new Map();for(const e of main){const key=e.name+(e.args?.data?.functionName?' '+e.args.data.functionName:'');const v=agg.get(key)||{n:0,t:0,max:0};v.n++;v.t+=e.dur/1000;v.max=Math.max(v.max,e.dur/1000);agg.set(key,v);}
    for(const e of main.filter(e=>e.name==='UpdateLayoutTree'||e.name==='Layout'||e.name==='ParseHTML').sort((a,b)=>b.dur-a.dur).slice(0,6))console.log('   '+e.name+' '+(e.dur/1000).toFixed(1)+'ms '+JSON.stringify(e.args?.elementCount??e.args?.beginData??e.args?.data??{}).slice(0,160));
    console.log([...agg].sort((a,b)=>b[1].max-a[1].max).slice(0,20).map(([k,v])=>'   max '+v.max.toFixed(1).padStart(6)+'  total '+v.t.toFixed(1).padStart(6)+'  n '+v.n+'  '+k).join(String.fromCharCode(10)));}
   if(arg('profile')===String(k)){const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(OUT,'switch-'+k+'.cpuprofile'),JSON.stringify(profile));
    const self=new Map(),dt=profile.timeDeltas,byId=new Map(profile.nodes.map(n=>[n.id,n]));profile.samples.forEach((id,i)=>{const n=byId.get(id),f=n.callFrame,key=f.functionName+' '+f.url.split('/').pop()+':'+f.lineNumber;self.set(key,(self.get(key)||0)+(dt[i+1]||0)/1000);});
    console.log([...self].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([k,v])=>'   '+v.toFixed(1).padStart(7)+' ms  '+k).join(String.fromCharCode(10)));}
   const r=await cdp.evaluate(`(()=>{window.__stop();const s=window.__stamps||[],t0=window.__t0;const anim=s.slice(1).map((t,i)=>[t,t-s[i]]).filter(([t])=>t>t0&&t<=t0+${WINDOW}).map(([,d])=>d);return {frames:window.__frames,loaf:window.__loaf,anim};})()`);const to=await cdp.evaluate(VIEW);
   const f=r.frames,max=Math.max(...f),over=f.filter(x=>x>16.7*1.5).length;const row={from,to,presented:comp,main:{p95:p95(r.anim),max:Math.round(Math.max(0,...r.anim)*10)/10,frames:r.anim.length,intervals:r.anim.map(x=>Math.round(x*10)/10)},frames:f.length,max:Math.round(max*10)/10,over25:over,loaf:r.loaf};report.rounds.push(row);
   console.log(`${from.padEnd(6)} -> ${to.padEnd(6)} presented ${comp?comp.frames+' max '+comp.max+'ms >17.5ms '+comp.over17:'-'} | main frames ${String(f.length).padStart(3)}  max ${row.max.toFixed(1).padStart(6)} ms  >25ms ${over}  LoAF ${r.loaf.map(l=>l.d).join(',')||'-'}`);
   if(k<3){await sleep(800);await shoot('settled-'+to);}}
  /* frame strips: a full-size PNG screencast of one switch each way; frames nearest fixed target times, stable names every round */
  if(arg('strip')!=='off'){const TARGETS=[0,40,80,120,160,200,260,320,400,500,650];report.strips=[];
   for(let s=0;s<3;s++){const from=await cdp.evaluate(VIEW),frames=[];cdp.onEvent=m=>{if(m.method==='Page.screencastFrame'){frames.push({t:m.params.metadata.timestamp*1000,d:m.params.data});cdp.send('Page.screencastFrameAck',{sessionId:m.params.sessionId}).catch(()=>{});}};
    await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:1920,maxHeight:1080,everyNthFrame:1});await sleep(400);frames.length=0;const t0=Date.now();
    await cdp.evaluate(`(()=>{document.querySelector('.library-wall-toggle').click();return 1;})()`);await sleep(1200);await cdp.send('Page.stopScreencast');cdp.onEvent=null;const to=await cdp.evaluate(VIEW);
    const picks=[];TARGETS.forEach((T,n)=>{let best=null;for(const fr of frames){const d=fr.t-t0;if(d<=T+8&&(!best||d>best.t-t0))best=fr;}if(!best)best=frames[0];if(!best)return;
     const name=`strip-${from}-${to}-${String(n+1).padStart(2,'0')}-${String(T).padStart(3,'0')}ms.png`;picks.push({name,d:best.d});report.strips.push({name,target:T,actual:Math.round(best.t-t0)});});
    /* JPEG keeps the screencast fast enough to sample every frame; the picked frames are re-encoded as PNG in the page */
    for(const p of picks){const b64=await cdp.evaluate(`(async()=>{const i=new Image();i.src='data:image/jpeg;base64,${p.d}';await i.decode();const c=new OffscreenCanvas(i.naturalWidth,i.naturalHeight);c.getContext('2d').drawImage(i,0,0);const b=await c.convertToBlob({type:'image/png'});const a=new Uint8Array(await b.arrayBuffer());let s='';for(let k=0;k<a.length;k+=32768)s+=String.fromCharCode.apply(null,a.subarray(k,k+32768));return btoa(s);})()`);fs.writeFileSync(path.join(OUT,p.name),Buffer.from(b64,'base64'));}
    await sleep(900);}}
  /* search box focus/blur on the wall */
 }finally{const all=(k,from=0)=>report.rounds.slice(from).flatMap(r=>k(r)||[]);report.summary={window_ms:WINDOW,presented:{p95:p95(all(r=>r.presented?.gaps)),max:Math.round(Math.max(0,...all(r=>r.presented?.gaps))*10)/10},main:{p95:p95(all(r=>r.main?.intervals)),max:Math.round(Math.max(0,...all(r=>r.main?.intervals))*10)/10}};
  /* the same numbers without the first cycle (cold caches, first GSAP/raster warm-up) */
  report.summaryWarm={presented:{p95:p95(all(r=>r.presented?.gaps,3)),max:Math.round(Math.max(0,...all(r=>r.presented?.gaps,3))*10)/10},main:{p95:p95(all(r=>r.main?.intervals,3)),max:Math.round(Math.max(0,...all(r=>r.main?.intervals,3))*10)/10}};
  report.perSwitch=report.rounds.map(r=>({from:r.from,to:r.to,presented_p95:r.presented?.p95,presented_max:r.presented?.max,main_p95:r.main?.p95,main_max:r.main?.max,loaf:r.loaf.map(l=>l.d)}));
  fs.writeFileSync(path.join(OUT,'perf.json'),JSON.stringify({summary:report.summary,summaryWarm:report.summaryWarm,perSwitch:report.perSwitch,strips:report.strips,rounds:report.rounds},null,1));cdp.stop();web.close();await service.stop();await sleep(500);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
 console.log('screenshots and report.json in '+OUT);}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=2;});
