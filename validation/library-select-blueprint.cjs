#!/usr/bin/env node
'use strict';
/* Library multi-select "Blueprint" evidence (rubric set): normal.png, enter-NN.png, selected-bright.png, selected-dark.png, bar.png,
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

async function main(){fs.mkdirSync(OUT,{recursive:true});const tmpRoot=path.resolve(arg('tmp','H:/MeguLit-Work/tmp'));fs.mkdirSync(tmpRoot,{recursive:true});
 const temp=fs.mkdtempSync(path.join(tmpRoot,'megulit-blueprint-'));const root=path.join(temp,'root');fs.mkdirSync(root);
 const service=startService(root);const N=Number(arg('games',60));
 const palette=[[200,50,60],[40,90,160],[230,170,60],[60,150,110],[130,70,170],[220,110,150],[30,40,60],[240,230,210]];
 for(let i=0;i<N;i++){const dir=path.join(temp,'games','g'+i);fs.mkdirSync(dir,{recursive:true});const exe=path.join(dir,'game.exe');fs.writeFileSync(exe,'MZ');
  await service.call({action:'save_game',title:'テストゲーム '+(i+1),executable:exe}).catch(e=>console.error('seed',e.message));}
 const home=await service.call({action:'home'});const tone={};
 for(const [i,g] of (home.games||[]).entries()){const file=path.join(temp,'c'+i+'.png');const top=i%8,bot=(i*3+1)%8;
  if(top===7){tone[g.id]='bright';fs.writeFileSync(file,png(240,340,[250,248,240],[232,224,206]));}
  else{tone[g.id]=top===2?'bright':(top===6?'dark':'mid');fs.writeFileSync(file,png(240,340,palette[top],palette[top===6?6:bot]));}
  await service.call({action:'game_cover',id:g.id,path:file}).catch(e=>console.error('cover',e.message));}
 const web=await startWeb(service),port=web.address().port,cdp=await startEdge(path.join(temp,'edge'));const perf={size:arg('size','1920x1080'),games:N,runs:{}};
 const shoot=async(name,clip)=>{const r=await cdp.send('Page.captureScreenshot',clip?{format:'png',clip:{...clip,scale:2}}:{format:'png'});fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(r.data,'base64'));};
 /* measured run: tiny screencast frames give presented-frame times; rAF gives main-thread frames */
 /* --trace NAME: run that step under a DevTools trace instead and print the heaviest main-thread events */
 const traced=async(name,fn,span)=>{const events=[];let done;const complete=new Promise(r=>{done=r;});cdp.onEvent=m=>{if(m.method==='Tracing.dataCollected')events.push(...m.params.value);if(m.method==='Tracing.tracingComplete')done();};
  await cdp.send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline,blink,v8.execute'+(arg('why')?',disabled-by-default-devtools.timeline.invalidationTracking':''),transferMode:'ReportEvents'});await sleep(200);
  await fn();await sleep(span);await cdp.send('Tracing.end');await complete;cdp.onEvent=null;
  if(arg('why')){const why=new Map();for(const e of events.filter(e=>/InvalidationTracking/.test(e.name))){const d=e.args?.data||{};const k=e.name.replace('InvalidationTracking','')+' | '+(d.reason||'')+' | '+(d.invalidatedSelectorId||d.changedClass||d.changedAttribute||d.changedId||d.changedPseudo||'')+' | '+String(d.nodeName||'').slice(0,40);why.set(k,(why.get(k)||0)+1);}console.log([...why].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([k,v])=>'   '+String(v).padStart(5)+'  '+k).join(String.fromCharCode(10)));}
  const agg=new Map();for(const e of events.filter(e=>e.ph==='X'&&e.dur>=1500)){const d=e.args?.data||{},key=e.name+(d.functionName?' '+d.functionName:'')+(d.url?' '+String(d.url).split('/').pop():'');const v=agg.get(key)||{n:0,t:0,max:0};v.n++;v.t+=e.dur/1000;v.max=Math.max(v.max,e.dur/1000);agg.set(key,v);}
  for(const e of events.filter(e=>(e.name==='UpdateLayoutTree'||e.name==='Layout'||e.name==='Paint'||e.name==='HitTest')&&e.dur>=4000).sort((x,y)=>y.dur-x.dur).slice(0,8))console.log('   '+e.name+' '+(e.dur/1000).toFixed(1)+'ms '+JSON.stringify(e.args?.elementCount??e.args?.beginData??e.args?.data??{}).slice(0,200));
  console.log('TRACE '+name+String.fromCharCode(10)+[...agg].sort((x,y)=>y[1].max-x[1].max).slice(0,28).map(([k,v])=>'   max '+v.max.toFixed(1).padStart(6)+'  total '+v.t.toFixed(1).padStart(6)+'  n '+v.n+'  '+k).join(String.fromCharCode(10)));};
 /* the window is the animation itself: until the page's motion flag (__bpBusy) clears, plus 100 ms; steps without the flag use span */
 const measure=async(name,fn,span,untilIdle=true)=>{await cdp.evaluate(PROBE);if(arg('trace')===name)return traced(name,fn,span);if(arg('profile')===name)return profiled(name,fn,span);const shots=[];cdp.onEvent=m=>{if(m.method==='Page.screencastFrame'){shots.push(m.params.metadata.timestamp*1000);cdp.send('Page.screencastFrameAck',{sessionId:m.params.sessionId}).catch(()=>{});}};
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:5,maxWidth:480,maxHeight:270,everyNthFrame:1});await sleep(300);shots.length=0;await cdp.evaluate('(()=>{window.__frames=[];window.__loaf=[];return 1;})()');
  const t0=Date.now();await fn();const busy=await cdp.evaluate(`new Promise(r=>{const s=performance.now(),w=()=>window.__bpBusy&&performance.now()-s<${span}?requestAnimationFrame(w):r(Math.round(performance.now()-s));requestAnimationFrame(w);})`);
  const win=untilIdle?Math.min(span,busy+100):span;await sleep(Math.max(0,win-busy)+250);await cdp.send('Page.stopScreencast');cdp.onEvent=null;
  const w=shots.filter(t=>t>=t0-5&&t<=t0+win),gaps=w.slice(1).map((t,i)=>t-w[i]);const r=await cdp.evaluate('({frames:window.__frames,loaf:window.__loaf})');const f=r.frames.slice(0,Math.max(1,Math.round(win/16.7)));
  const row={windowMs:win,animationMs:untilIdle?busy:null,presented:{frames:w.length,p95:pct(gaps,95),max:Math.round(Math.max(0,...gaps)*10)/10,over17:gaps.filter(g=>g>17.5).length,over33:gaps.filter(g=>g>33.4).length,at:w.slice(1).map((t,i)=>[Math.round(w[i]-t0),Math.round(t-w[i])]).filter(x=>x[1]>33.4)},
   main:{frames:f.length,p95:pct(f,95),max:Math.round(Math.max(0,...f)*10)/10,over25:f.filter(x=>x>25).length},loaf:r.loaf};
  (perf.runs[name]=perf.runs[name]||{rounds:[]}).rounds.push(row);(raw[name]=raw[name]||{gaps:[],frames:[]});raw[name].gaps.push(...gaps);raw[name].frames.push(...f);console.log(name.padEnd(8),JSON.stringify(row));};
 const raw={};
 /* --profile NAME: CPU profile of that step, top self time */
 const profiled=async(name,fn,span)=>{await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:100});await cdp.send('Profiler.start');await fn();await sleep(span);const {profile}=await cdp.send('Profiler.stop');
  const self=new Map(),byId=new Map(profile.nodes.map(n=>[n.id,n]));profile.samples.forEach((id,i)=>{const c=byId.get(id).callFrame,k=(c.functionName||'(anon)')+' '+c.url.split('/').pop()+':'+c.lineNumber;self.set(k,(self.get(k)||0)+(profile.timeDeltas[i+1]||0)/1000);});
  console.log('PROFILE '+name+String.fromCharCode(10)+[...self].sort((a,b)=>b[1]-a[1]).slice(0,22).map(([k,v])=>'   '+v.toFixed(1).padStart(7)+' ms  '+k).join(String.fromCharCode(10)));};
 /* every measured step is repeated; the summary pools all rounds (p95 over every frame interval, max of all) */
 const summarise=()=>{for(const [name,r] of Object.entries(raw)){const run=perf.runs[name];run.presented={p95:pct(r.gaps,95),max:Math.round(Math.max(0,...r.gaps)*10)/10,intervals:r.gaps.length,over33:r.gaps.filter(g=>g>33.4).length};
  run.main={p95:pct(r.frames,95),max:Math.round(Math.max(0,...r.frames)*10)/10,frames:r.frames.length,over25:r.frames.filter(x=>x>25).length};run.roundMax=run.rounds.map(x=>({presented:x.presented.max,main:x.main.max}));}};
 /* captured run: full-size PNG screencast, keep `keep` evenly spaced frames from the first `span` ms */
 /* captured run: the page runs in slow motion (CSS/WAAPI via the Animation domain, GSAP via its global timeScale) so the
    full-size PNG screencast gets enough frames; frames are picked at evenly spaced animation times and named NN in order */
 const SLOW=Number(arg('slow',10));
 const capture=async(name,fn,span,keep)=>{const frames=[];
  await cdp.send('Animation.enable');await cdp.send('Animation.setPlaybackRate',{playbackRate:1/SLOW});await cdp.evaluate('(()=>{if(window.gsap)gsap.globalTimeline.timeScale('+(1/SLOW)+');return 1;})()');
  const t0=Date.now();await fn();
  /* full-size screenshots back to back while the page runs slowed down; each one is stamped with its animation time */
  while(Date.now()-t0<span*SLOW+200){const a=Date.now();const r=await cdp.send('Page.captureScreenshot',{format:'png'});frames.push({v:((a+Date.now())/2-t0)/SLOW,d:r.data});}
  await cdp.send('Animation.setPlaybackRate',{playbackRate:1});await cdp.evaluate('(()=>{if(window.gsap)gsap.globalTimeline.timeScale(1);return 1;})()');
  const w=frames.filter(x=>x.v<=span+5);const pick=[];
  for(let k=0;k<keep&&w.length;k++){const target=k*span/(keep-1);const p=w.reduce((best,x)=>Math.abs(x.v-target)<Math.abs(best.v-target)?x:best,w[0]);if(!pick.includes(p))pick.push(p);}
  const list=pick.map((p,k)=>{const file=name+'-'+String(k).padStart(2,'0')+'.png';fs.writeFileSync(path.join(OUT,file),Buffer.from(p.d,'base64'));return {file,ms:Math.max(0,Math.round(p.v))};});
  perf.frames=perf.frames||{};perf.frames[name]=list;console.log(name,'frames',list.map(x=>x.ms+'ms').join(' '));};
 const clickSel=sel=>cdp.evaluate(`(()=>{document.querySelector(${JSON.stringify(sel)}).click();return 1;})()`);
 const card=id=>`.series-game[data-member-id="${id}"]`;
 const clickId=id=>clickSel(card(id)+' .game-card');
 const rectOf=(sel,pad=18)=>cdp.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.left-${pad},y:r.top-${pad},width:r.width+${2*pad},height:r.height+${2*pad}};})()`);
 const unionOf=(sels,pad=18)=>cdp.evaluate(`(()=>{const rs=${JSON.stringify(sels)}.map(s=>document.querySelector(s).getBoundingClientRect());const l=Math.min(...rs.map(r=>r.left)),t=Math.min(...rs.map(r=>r.top)),R=Math.max(...rs.map(r=>r.right)),B=Math.max(...rs.map(r=>r.bottom));return {x:l-${pad},y:t-${pad},width:R-l+${2*pad},height:B-t+${2*pad}};})()`);
 const hover=async(sel)=>{const p=await cdp.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/3};})()`);await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});};
 const unhover=()=>cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:5,y:1075});
 const visibleIds=()=>cdp.evaluate(`(()=>{const tone=${JSON.stringify(tone)};const nodes=[...document.querySelectorAll('.series-game')].filter(n=>{const r=n.querySelector('.cover-frame').getBoundingClientRect();return r.top>140&&r.bottom<innerHeight-130;});
   const by=t=>nodes.filter(n=>tone[n.dataset.memberId]===t).map(n=>n.dataset.memberId);return {bright:by('bright'),dark:by('dark'),mid:by('mid')};})()`);
 const pickSet=async(ids)=>{for(const id of ids){await clickId(id);await sleep(220);}await sleep(500);};
 const create=async(name)=>{await clickSel('[data-create]');await sleep(450);await cdp.evaluate(`(()=>{document.querySelector('.bp-bar .bp-input').value=${JSON.stringify(name)};return 1;})()`);};
 const submit=()=>clickSel('.bp-bar [data-name-confirm]');
 const probe=arg('probe');
 try{await cdp.send('Page.navigate',{url:`http://127.0.0.1:${port}/#%7B%7D`});
  for(let i=0;i<80;i++){await sleep(250);if(await cdp.evaluate('!!(window.__megulitTest&&document.querySelector("#main"))').catch(()=>false))break;}await sleep(2000);
  await cdp.evaluate(`(()=>{localStorage.setItem('megulit-library-view','list');localStorage.setItem('tome-library-wall','off');return 1;})()`);await cdp.evaluate(HIDE);if(arg('css'))await cdp.evaluate('(()=>{const s=document.createElement("style");s.textContent='+JSON.stringify(arg('css'))+';document.head.append(s);return 1;})()');
  await cdp.evaluate(`(async()=>{await window.__megulitTest.navigate('library');return 1;})()`);await sleep(3000);await unhover();
  if(probe){if(arg('trace')==='probe'){await traced('probe',()=>cdp.evaluate(fs.readFileSync(probe,'utf8')),300);return;}console.log(JSON.stringify(await cdp.evaluate(fs.readFileSync(probe,'utf8')),null,1));return;}
  await shoot('normal');
  /* enter: measured, leave (measured), then enter captured */
  const ROUNDS=Number(arg('rounds',3));
  for(let r=0;r<ROUNDS;r++){await measure('enter',()=>clickSel('#select-games'),900);await sleep(400);await measure('leave',()=>clickSel('[data-select-cancel]'),600);await sleep(500);}
  await capture('enter',()=>clickSel('#select-games'),720,10);await sleep(300);
  const ids=await visibleIds();console.log('visible tones',Object.fromEntries(Object.entries(ids).map(([k,v])=>[k,v.length])));
  const firstPick=ids.bright[0],toggles=[firstPick,ids.mid[1],ids.mid[2],ids.mid[3]].slice(0,ROUNDS);
  for(const id of toggles){await measure('toggle',()=>clickId(id),380,false);await sleep(250);}
  const picks=[ids.dark[0],ids.bright[1],ids.dark[1]].filter(Boolean);await pickSet(picks);
  await shoot('selected-bright',await unionOf([card(firstPick)+' .cover-frame'],26));
  const neighbour=await cdp.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(card(ids.dark[0]))});const s=[n.nextElementSibling,n.previousElementSibling].find(x=>x&&x.dataset.memberId&&!x.classList.contains('is-selected'));return s?s.dataset.memberId:'';})()`);
  if(neighbour)await hover(card(neighbour)+' .cover-frame');await sleep(350);
  await shoot('selected-dark',await unionOf([card(ids.dark[0])+' .cover-frame',...(neighbour?[card(neighbour)+' .cover-frame']:[])],26));await unhover();await sleep(300);
  await shoot('bar',await rectOf('.bp-bar',28));
  if(arg('extra')){await clickSel('[data-create]');await sleep(500);await cdp.evaluate(`(()=>{document.querySelector('.bp-bar .bp-input').value='テスト合集';return 1;})()`);await shoot('bar-naming',await rectOf('.bp-bar',28));await clickSel('[data-name-back]');await sleep(400);await shoot('selected-full');}
  /* create: measured on this selection, captured on a second one, measured again on a third */
  await create('テスト合集 A');await measure('create',submit,1400);await sleep(900);if(arg('extra'))await shoot('after-create');
  const pick5=async()=>{await clickSel('#select-games');await sleep(900);const v=await visibleIds();await pickSet([...v.bright.slice(0,2),...v.dark.slice(0,1),...v.mid.slice(0,2)]);};
  await pick5();await create('テスト合集 B');await capture('create',submit,1250,12);await sleep(900);
  await pick5();await create('テスト合集 C');await measure('create',submit,1400);await sleep(900);
  summarise();
  const check=await cdp.evaluate(`(()=>({selecting:!!document.querySelector('.lib-selecting'),collections:document.querySelectorAll('.series-collection').length,games:document.querySelectorAll('.series-game').length}))()`);perf.final=check;console.log('final',JSON.stringify(check));
 }finally{if(!probe)fs.writeFileSync(path.join(OUT,'perf.json'),JSON.stringify(perf,null,1));cdp.stop();web.close();await service.stop();await sleep(500);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
 console.log('evidence in '+OUT);}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=2;});
