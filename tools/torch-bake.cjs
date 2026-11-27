// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 传火碑 bake: builds the hall in a headless browser (the same code the app runs, web/torch-*.js), then writes
   web/assets/torch/: every procedural texture as webp, the ambient-occlusion volume (ao.bin, deflated) and manifest.json with
   the hash of the scene's source. Run it after changing web/torch-hall.js, web/torch-textures.js or web/torch-bake.js:

     node tools/torch-bake.cjs

   Uses Chrome or Edge (headless, its own throwaway profile; closed at the end). validation/torch-bake.test.cjs fails when the
   manifest's hash no longer matches the sources. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),os=require('node:os'),{spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),WEB=path.join(ROOT,'web'),OUT=path.join(WEB,'assets','torch');
const SOURCES=['torch-hall.js','torch-ground.js','torch-meadow.js','torch-textures.js','torch-bake.js'];
function sourceHash(root=ROOT){const txt=SOURCES.map(f=>fs.readFileSync(path.join(root,'web',f),'utf8').replace(/\r\n/g,'\n')).join('\n--\n');
 return crypto.createHash('sha256').update(txt,'utf8').digest('hex').slice(0,24);}
const BROWSERS=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.webp':'image/webp','.svg':'image/svg+xml','.bin':'application/octet-stream'};
const PAGE=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/web/torch-monument.css"><body style="position:relative;margin:0;width:1280px;height:720px">
<script type="module">
window.__TORCH_BAKE=true;window.__TORCH_HOUR=12;try{localStorage.setItem('megulit-torch-quality','high');}catch{}
const m=await import('/web/torch-monument.js');
const api=async a=>a==='torch_page'?{ok:true,total:0,items:[],next:null}:{ok:true,available:false,items:[],months:[]};
await m.openTorchMonument({api,locale:'zh',mount:document.body});
let host;for(let i=0;i<600&&!(host=document.querySelector('.torch-monument'))?.__torch;i++)await new Promise(r=>setTimeout(r,100));
const {exportBake}=await import('/web/torch-bake.js');
window.__bake=await exportBake(host.__torch.debug.scene,host.__torch.debug.torchPoints,host.__torch.debug.steleEmit);
</script>`;

async function main(){const browser=BROWSERS.find(b=>fs.existsSync(b));if(!browser)throw Error('Chrome or Edge not found');
 const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);if(u==='/bake.html'){r.writeHead(200,{'content-type':'text/html'});r.end(PAGE);return;}
  const f=path.join(ROOT,u);if(!f.startsWith(ROOT)){r.writeHead(403);r.end();return;}fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});r.end(d);});});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port,dport=20000+Math.floor(Math.random()*9000),prof=fs.mkdtempSync(path.join(os.tmpdir(),'torch-bake-'));
 const proc=spawn(browser,['--headless=new','--mute-audio','--no-first-run','--disable-extensions','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--remote-debugging-port='+dport,'--user-data-dir='+prof,'--window-size=1280,720','about:blank'],{stdio:'ignore',windowsHide:true});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 try{let tabs;for(let i=0;i<100;i++){try{tabs=await (await fetch('http://127.0.0.1:'+dport+'/json')).json();break;}catch{await sleep(200);}}
  const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Inspector.targetCrashed')console.error('renderer crashed');if(m.method==='Runtime.consoleAPICalled'){const t=m.params.args.map(x=>x.value).join(' ');if(/BAKESTEP/.test(t))console.log(t);}if(m.method==='Runtime.exceptionThrown')console.error('page error:',JSON.stringify(m.params.exceptionDetails).slice(0,400));if(pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
  await send('Runtime.enable');await send('Inspector.enable');await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/bake.html'});
  /* wait for the page, then take the files one by one (one huge string at once can bring the renderer down) */
  let names=null;for(let i=0;i<900;i++){await sleep(500);const r=await send('Runtime.evaluate',{expression:'window.__bake?JSON.stringify(Object.keys(window.__bake.files)):""',returnByValue:true});const v=r.result?.result?.value;if(v){names=JSON.parse(v);break;}}
  if(!names)throw Error('bake timed out');
  const res={files:{},manifest:(await send('Runtime.evaluate',{expression:'window.__bake.manifest',returnByValue:true})).result.result.value};
  for(const n of names){const r=await send('Runtime.evaluate',{expression:'window.__bake.files['+JSON.stringify(n)+']',returnByValue:true});res.files[n]=r.result.result.value;}
  const hash=sourceHash();if(res.manifest.hash!==hash)throw Error('hash mismatch: page '+res.manifest.hash+' vs node '+hash);
  fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT,{recursive:true});let bytes=0;
  for(const [name,b64] of Object.entries(res.files)){const buf=Buffer.from(b64,'base64');bytes+=buf.length;fs.writeFileSync(path.join(OUT,name),buf);}
  fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(res.manifest,null,1)+'\n');
  console.log('baked',Object.keys(res.files).length,'files,',(bytes/1048576).toFixed(2),'MB, hash',hash,'ao',res.manifest.ao.dims.join('×'));
  ws.close();}
 finally{try{proc.kill();}catch{}srv.close();await sleep(500);try{fs.rmSync(prof,{recursive:true,force:true});}catch{}}}
if(require.main===module)main().catch(e=>{console.error(e.message||e);process.exit(1);});
module.exports={sourceHash,SOURCES};
