#!/usr/bin/env node
'use strict';
/* Text contrast check (2026-11-13 user report: a light custom background / panel colour left text unreadable).
   Opens the real web/ UI in headless Edge on fake data (the real services on an empty temp root, three made-up games),
   under several user backgrounds, screenshots every page at 1920x1080, and for every visible text node compares its colour
   with the pixels actually behind it (a second screenshot with all text made transparent).
   WCAG: body and small text >= 4.5:1, large text (>= 24px, or >= 18.66px bold) >= 3:1.
   Usage: node validation/contrast-check.cjs [--out DIR] [--scenes dark,white,...] [--pages home,about,...] [--strict]
   Never touches a real MeguLit window. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),zlib=require('node:zlib'),{spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),WEB=path.join(ROOT,'web');
const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback;};
const OUT=path.resolve(arg('out',path.join(os.tmpdir(),'megulit-contrast')));
const SCENES={
 dark:{},
 white:{color:'#ffffff'},
 gray:{color:'#d4d4d4'},
 yellow:{color:'#ffe600'},
 sky:{color:'#4fc3ff'},
 light:{theme:'light'}
};
const PAGES=['notice','home','library','game','history','leaderboard','daily','learning:words','learning:sentences','learning:readwords','learning:dictionary','learning:grammar',
 'learning:kana','learning:trash','statistics','settings','about','tools','guide','feedback','profile'];
const pick=(list,all)=>list?list.split(',').filter(Boolean):all;
const sceneNames=pick(arg('scenes'),['dark','white','gray','yellow','sky']),pageNames=pick(arg('pages'),PAGES);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------- colour maths ---------- */
const lin=c=>{c/=255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4;};
const lum=([r,g,b])=>.2126*lin(r)+.7152*lin(g)+.0722*lin(b);
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const over=(fg,a,bg)=>fg.map((c,i)=>c*a+bg[i]*(1-a));

/* ---------- PNG decode (8-bit RGB/RGBA, not interlaced: what Chromium writes) ---------- */
function decodePNG(buf){let p=8,w=0,h=0,type=0;const idat=[];
 while(p<buf.length){const len=buf.readUInt32BE(p),kind=buf.toString('ascii',p+4,p+8),data=buf.subarray(p+8,p+8+len);p+=12+len;
  if(kind==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);type=data[9];if(data[8]!==8||data[12])throw Error('PNG_FORMAT');}else if(kind==='IDAT')idat.push(data);else if(kind==='IEND')break;}
 const bpp=type===6?4:type===2?3:0;if(!bpp)throw Error('PNG_TYPE');const raw=zlib.inflateSync(Buffer.concat(idat)),stride=w*bpp,px=Buffer.alloc(w*h*3);let prev=Buffer.alloc(stride),q=0;
 for(let y=0;y<h;y++){const f=raw[q++],line=Buffer.from(raw.subarray(q,q+stride));q+=stride;
  for(let x=0;x<stride;x++){const a=x>=bpp?line[x-bpp]:0,b=prev[x],c=x>=bpp?prev[x-bpp]:0;let v=line[x];
   if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}line[x]=v&255;}
  for(let x=0;x<w;x++)for(let k=0;k<3;k++)px[(y*w+x)*3+k]=line[x*bpp+k];prev=line;}
 return {w,h,px};}

/* ---------- services on a temp root ---------- */
function startService(root){const child=spawn(process.execPath,[path.join(ROOT,'services','server.cjs')],{env:{...process.env,MEGULIT_ROOT:root},stdio:['pipe','pipe','ignore']});
 let next=1,buf='';const waits=new Map();
 child.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);let m;try{m=JSON.parse(line);}catch{continue;}const w=waits.get(m.id);if(w){waits.delete(m.id);m.ok?w[0](m.data):w[1](Error(m.error));}}});
 const call=(request,ms=20000)=>new Promise((res,rej)=>{const id=next++;waits.set(id,[res,rej]);child.stdin.write(JSON.stringify({id,request})+'\n');setTimeout(()=>{if(waits.delete(id))rej(Error('SERVICE_TIMEOUT'));},ms);});
 return {call,stop:async()=>{await call({action:'__shutdown'},5000).catch(()=>{});child.kill();}};}

/* ---------- static server + test transport ---------- */
const TRANSPORT=`<script>(()=>{const S=JSON.parse(decodeURIComponent((location.hash.slice(1))||'%7B%7D'));const svg=c=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="100%" height="100%" fill="'+c+'"/></svg>');
 window.__TOME_TEST_TRANSPORT__=async(command,args)=>{if(command!=='service')return null;const r=(args&&args.request)||{};
  if(r.action==='background'&&S.color)return svg(S.color);if(/^(update_check|update_status|site_updates|launch|focus_game)$/.test(r.action))return {};
  let out;try{out=await fetch('/svc',{method:'POST',body:JSON.stringify(r)}).then(x=>x.json());}catch{out={ok:false,error:'SERVICE_FAILED'};}if(!out.ok)throw Error(out.error);let d=out.data;
  if(r.action==='home'&&d&&d.preferences){if(S.color){d.preferences.glassColor=S.color;d.preferences.homeBackground='custom.png';d.preferences.backgroundDim=0;d.background={...(d.background||{}),dim:0};}if(S.theme)d.preferences.themeMode=S.theme;}
  return d;};})();</script>`;
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json','.mp3':'audio/mpeg','.gif':'image/gif'};
function startWeb(service){const server=http.createServer(async(req,res)=>{try{
  if(req.method==='POST'&&req.url==='/svc'){let body='';for await(const c of req)body+=c;let reply;try{reply={ok:true,data:await service.call(JSON.parse(body))};}catch(e){reply={ok:false,error:e.message};}
   res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(reply===undefined?null:reply));}
  let rel=decodeURIComponent(new URL(req.url,'http://x').pathname);if(rel==='/')rel='/index.html';const file=path.join(WEB,path.normalize(rel));
  if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  let data=fs.readFileSync(file);if(rel==='/index.html')data=Buffer.from(String(data).replace(/<script type="module"/,TRANSPORT+'<script type="module"'));
  res.writeHead(200,{'content-type':TYPES[path.extname(file).toLowerCase()]||'application/octet-stream'});res.end(data);}catch{res.writeHead(500);res.end();}});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}

/* ---------- headless Edge over CDP ---------- */
function edgePath(){for(const p of [process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'])if(p&&fs.existsSync(p))return p;throw Error('EDGE_NOT_FOUND');}
async function startEdge(profile){const child=spawn(edgePath(),['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1920,1080','--hide-scrollbars','--force-device-scale-factor=1',
  '--no-first-run','--no-default-browser-check','--disable-extensions','--mute-audio','about:blank'],{stdio:'ignore'});
 const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++)await sleep(100);const port=fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0];
 let target;for(let i=0;i<50&&!target;i++){target=(await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json()).catch(()=>[])).find(t=>t.type==='page');if(!target)await sleep(100);}
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let next=1;const waits=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);const w=m.id&&waits.get(m.id);if(w){waits.delete(m.id);m.error?w[1](Error(m.error.message)):w[0](m.result);}};
 const send=(method,params={})=>new Promise((res,rej)=>{const id=next++;waits.set(id,[res,rej]);ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('EVAL: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result.value;};
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 return {send,evaluate,stop:()=>{try{ws.close();}catch{}child.kill();}};}

/* ---------- in-page: list the visible text ---------- */
const COLLECT=`(()=>{const out=[],dlg=[...document.querySelectorAll('dialog[open]')].pop(),W=innerWidth,H=innerHeight;
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const seen=new Map();let n;
 const parse=s=>{const m=s.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(/[ ,/]+/).filter(Boolean).map(Number);return [p[0],p[1],p[2],p.length>3?p[3]:1];};
 const pathOf=el=>{const parts=[];for(let e=el;e&&e!==document.body&&parts.length<5;e=e.parentElement){let s=e.tagName.toLowerCase();if(e.id)s+='#'+e.id;else if(e.classList.length)s+='.'+[...e.classList].slice(0,2).join('.');parts.unshift(s);}return parts.join('>');};
 while((n=walker.nextNode())){const text=n.nodeValue.replace(/\\s+/g,' ').trim();if(!text||!/[\\p{L}\\p{N}]/u.test(text))continue;const el=n.parentElement;if(!el)continue;
  if(el.closest('[aria-hidden=true],script,style,noscript,template,option,select,svg,canvas,:disabled,[hidden]'))continue;if(dlg&&!dlg.contains(el))continue;
  const cs=getComputedStyle(el);if(cs.visibility!=='visible')continue;let op=1;for(let e=el;e;e=e.parentElement){op*=Number(getComputedStyle(e).opacity);if(op<.02)break;}if(op<.05)continue;
  const fill=cs.webkitTextFillColor&&cs.webkitTextFillColor!==cs.color?parse(cs.webkitTextFillColor):null;if(fill&&fill[3]===0)continue;const c=parse(cs.color);if(!c||c[3]===0)continue;
  const r=document.createRange();r.selectNodeContents(n);const rects=[...r.getClientRects()].map(x=>({x:Math.max(0,x.left),y:Math.max(0,x.top),r:Math.min(W,x.right),b:Math.min(H,x.bottom)})).filter(x=>x.r-x.x>=3&&x.b-x.y>=5);
  if(!rects.length)continue;const k=rects[0];
  /* clipped by a scrolling/overflow ancestor? */
  let clipped=false;for(let e=el.parentElement;e&&e!==document.documentElement;e=e.parentElement){const s=getComputedStyle(e);if(s.overflow!=='visible'||s.overflowX!=='visible'||s.overflowY!=='visible'){const b=e.getBoundingClientRect();if(k.b<=b.top+1||k.y>=b.bottom-1||k.r<=b.left+1||k.x>=b.right-1){clipped=true;break;}}}
  if(clipped)continue;
  const cx=(k.x+k.r)/2,cy=(k.y+k.b)/2,hit=document.elementFromPoint(cx,cy);if(hit&&!(el.contains(hit)||hit.contains(el))&&cs.pointerEvents!=='none'&&getComputedStyle(hit).pointerEvents!=='none')continue;
  const size=parseFloat(cs.fontSize),weight=Number(cs.fontWeight)||400,large=size>=24||(size>=18.66&&weight>=700);
  const key=el;const prev=seen.get(key);if(prev){prev.text=(prev.text+' '+text).slice(0,60);prev.rects.push(...rects);continue;}
  const item={path:pathOf(el),text:text.slice(0,60),color:fill&&fill[3]?fill:c,op,size,weight,need:large?3:4.5,rects,top:!!el.closest('.titlebar,.app-titlebar,header.titlebar')};seen.set(key,item);out.push(item);}
 return out;})()`;
const HIDE_ID='__contrast_hide';
const HIDE=`(()=>{const s=document.createElement('style');s.id='${HIDE_ID}';s.textContent='*,*::before,*::after,*::placeholder,*::marker{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important;text-decoration-color:transparent!important}';document.head.appendChild(s);return 1;})()`;
const SHOW=`(()=>{document.getElementById('${HIDE_ID}')?.remove();return 1;})()`;

async function shot(cdp,file){const r=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});const b=Buffer.from(r.data,'base64');if(file)fs.writeFileSync(file,b);return b;}
const nextFrames=cdp=>cdp.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,120))))');

async function measure(cdp,file){await shot(cdp,file);const items=await cdp.evaluate(COLLECT);await cdp.evaluate(HIDE);await nextFrames(cdp);const bg=decodePNG(await shot(cdp));await cdp.evaluate(SHOW);
 const res=[];for(const it of items){const samples=[];for(const k of it.rects){const sx=Math.max(1,Math.floor((k.r-k.x)/24)),sy=Math.max(1,Math.floor((k.b-k.y)/6));
   for(let y=Math.floor(k.y);y<Math.min(bg.h,k.b);y+=sy)for(let x=Math.floor(k.x);x<Math.min(bg.w,k.r);x+=sx){const i=(y*bg.w+x)*3;samples.push([bg.px[i],bg.px[i+1],bg.px[i+2]]);}}
  if(!samples.length)continue;const a=it.color[3]*it.op,ratios=samples.map(b=>ratio(over(it.color.slice(0,3),a,b),b)).sort((x,y)=>x-y);
  const low=ratios[Math.floor(ratios.length*.2)],mid=samples[Math.floor(samples.length/2)];
  res.push({path:it.path,text:it.text,ratio:Math.round(low*100)/100,need:it.need,size:it.size,top:it.top,fg:it.color.slice(0,3).map(Math.round).join(',')+(a<1?'@'+a.toFixed(2):''),bg:mid.join(',')});}
 return res;}

async function openPage(cdp,page){
 await cdp.evaluate(`(()=>{document.querySelectorAll('dialog[open]').forEach(d=>{try{d.close();}catch{}});document.querySelectorAll('.dev-notice,.lv-backdrop').forEach(d=>d.remove());return 1;})()`);
 const [route,tab]=page.split(':');
 if(page==='notice'){await cdp.evaluate(`(()=>{if(!document.querySelector('dialog.dev-notice[open]'))window.__megulitTest.notice();return 1;})()`);await sleep(1500);return;}
 if(['guide','feedback','profile'].includes(page)){await cdp.evaluate(`(async()=>{await window.__megulitTest.navigate('home');return 1;})()`);await sleep(1500);
  await cdp.evaluate(`(()=>{document.querySelector('[data-top-${page==='profile'?'me':page}]')?.click();return 1;})()`);await sleep(2500);return;}
 await cdp.evaluate(`(async()=>{await window.__megulitTest.navigate(${JSON.stringify(route)},${JSON.stringify(tab||'')});return 1;})()`);await sleep(route==='leaderboard'||route==='daily'?4500:2800);
 await cdp.evaluate(`(()=>{document.querySelectorAll('dialog.dev-notice').forEach(d=>{try{d.close();}catch{}d.remove();});return 1;})()`);}

async function main(){fs.mkdirSync(OUT,{recursive:true});const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-contrast-'));const root=path.join(temp,'root');fs.mkdirSync(root);
 const service=startService(root);
 for(const [i,title] of ['星降る夜のアトリエ','月影のソナタ','さくらの約束'].entries()){const dir=path.join(temp,'games','g'+i);fs.mkdirSync(dir,{recursive:true});const exe=path.join(dir,'game.exe');fs.writeFileSync(exe,'MZ');
  await service.call({action:'save_game',title,executable:exe}).catch(e=>console.error('seed',title,e.message));}
 const web=await startWeb(service),port=web.address().port,cdp=await startEdge(path.join(temp,'edge'));const report={};let failures=0;
 try{for(const scene of sceneNames){const S=SCENES[scene];if(!S)throw Error('UNKNOWN_SCENE '+scene);const dir=path.join(OUT,scene);fs.mkdirSync(dir,{recursive:true});
   await cdp.send('Page.navigate',{url:`http://127.0.0.1:${port}/?s=${scene}#${encodeURIComponent(JSON.stringify(S))}`});
   for(let i=0;i<80;i++){await sleep(250);if(await cdp.evaluate('!!(window.__megulitTest&&document.querySelector("#main"))').catch(()=>false))break;}await sleep(2500);
   report[scene]={};
   for(const page of pageNames){try{await openPage(cdp,page);const res=await measure(cdp,path.join(dir,page.replace(':','-')+'.png'));const bad=res.filter(r=>r.ratio<r.need&&!r.top);
     const min=res.filter(r=>!r.top).reduce((m,r)=>Math.min(m,r.ratio),Infinity);report[scene][page]={checked:res.length,min:Number.isFinite(min)?min:null,fail:bad};failures+=bad.length;
     console.log(`${scene.padEnd(6)} ${page.padEnd(20)} ${String(res.length).padStart(4)} texts  min ${Number.isFinite(min)?min.toFixed(2):'-'}  fail ${bad.length}`);
     for(const b of bad.slice(0,arg('verbose')?999:12))console.log(`   ${b.ratio.toFixed(2)}<${b.need} ${b.path} "${b.text}" fg ${b.fg} bg ${b.bg}`);}
    catch(e){console.log(`${scene} ${page} ERROR ${e.message}`);report[scene][page]={error:e.message};failures++;}}}
 }finally{fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,1));cdp.stop();web.close();await service.stop();await sleep(500);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
 console.log(`\n${failures} text(s) below the WCAG threshold. Screenshots and report.json in ${OUT}`);
 if(process.argv.includes('--strict')&&failures)process.exitCode=1;}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=2;});
module.exports={ratio,lum,over,decodePNG};
