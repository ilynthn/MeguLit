// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 card wall (user: Toploaders hang on a wall, 50 by default; the player turns a CG they like, the game's
   cover or a MeguLit scene shot into a card and slides it into a Toploader). Everything lives in data/cards:
   cards.json (Toploaders, cards, wall mode), img/ (each card's face and its moving picture), thumbs/ (picker
   thumbnails), seen/ (pictures an engine reported on screen). Pictures reach the page as data: URLs like covers do.

   NO SPOILERS: a picture is offered only when this computer has proof the player saw it:
    'shot'  MeguLit's own scene shots (services/scene-shots): taken from the game window while it was read
    'save'  the game's own save marks the CG unlocked (services/game-cg: KiriKiri, HuneX, Siglus, YU-RIS readers)
    'seen'  an engine reported the picture on screen (noteSeen), resolved to a loose file of that exact name
    'memory' the runtime dump DLL watched the game window show it (services/runtime-cg, native/runtimedump/modules/Cg.cpp)
    'cover' the game's cover
   Anything else (gallery tables, archive listings, images merely loaded) is never offered, and cards_create only
   accepts a source id the unlocked list gives right now. With the R18 filter on, 'save' CGs follow the local rating
   model like the detail card and 'seen'/'memory' pictures (never rated) are left out. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
/* the face is drawn at up to ~3x on the inspect stage and the whole CG is toured at that size: keep both sharp there */
const DEFAULT_TOPLOADERS=50,MAX_TOPLOADERS=500,FACE_W=750,FACE_H=1000,THUMB=480,FULL=2048,VIEW=1600;
const sha=v=>crypto.createHash('sha1').update(String(v)).digest('hex');
const dirOf=root=>path.join(root,'data','cards');
const stateFile=root=>path.join(dirOf(root),'cards.json');
const exeKey=exe=>sha(path.resolve(String(exe)).toLowerCase()).slice(0,16);

/* ---- storage: one writer at a time across processes (lock file), every write via tmp + rename ---- */
const sleep=ms=>{try{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);}catch{}};
function withLock(root,fn){
 const dir=dirOf(root);fs.mkdirSync(dir,{recursive:true});const lock=path.join(dir,'.lock');let fd=null;
 for(let i=0;i<200&&fd===null;i++){try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code!=='EEXIST')throw e;
  try{if(Date.now()-fs.statSync(lock).mtimeMs>30000)fs.rmSync(lock,{force:true});}catch{}sleep(25);}}
 if(fd===null)throw Error('CARDS_BUSY');
 try{return fn();}finally{try{fs.closeSync(fd);}catch{}try{fs.rmSync(lock,{force:true});}catch{}}}
function atomicWrite(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.'+Date.now().toString(36)+'.tmp';fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);}
const newId=p=>p+Date.now().toString(36)+crypto.randomBytes(3).toString('hex');
function clean(raw){
 const v=raw&&typeof raw==='object'?raw:{};
 const cards=(Array.isArray(v.cards)?v.cards:[]).filter(c=>c&&typeof c.id==='string');const ids=new Set(cards.map(c=>c.id));
 let tops=(Array.isArray(v.toploaders)?v.toploaders:[]).filter(t=>t&&typeof t.id==='string');
 if(!Array.isArray(v.toploaders))for(let i=0;i<DEFAULT_TOPLOADERS;i++)tops.push({id:'t'+i,cardId:null,order:i});
 const used=new Set();tops=tops.sort((a,b)=>(a.order||0)-(b.order||0)).map((t,i)=>{let cardId=typeof t.cardId==='string'&&ids.has(t.cardId)&&!used.has(t.cardId)?t.cardId:null;if(cardId)used.add(cardId);return {id:t.id,cardId,order:i};});
 return {version:1,toploaders:tops,cards,mode:v.mode==='b'?'b':'a'};}
function readState(root){try{return clean(JSON.parse(fs.readFileSync(stateFile(root),'utf8')));}catch{return clean(null);}}
function writeState(root,s){atomicWrite(stateFile(root),JSON.stringify(s));}
const mutate=(root,fn)=>withLock(root,()=>{const s=readState(root);const out=fn(s);writeState(root,s);return out;});

/* ---- pictures ---- */
function dataUrl(file){try{const b=fs.readFileSync(file);const t=b[0]===0x89?'image/png':b[0]===0xff?'image/jpeg':b[0]===0x42?'image/bmp':b.toString('latin1',8,12)==='WEBP'?'image/webp':'';return t?'data:'+t+';base64,'+b.toString('base64'):'';}catch{return '';}}
/* runs services/card-image.ps1 over a batch of jobs; returns [{ok,w,h}] (tests may replace it) */
let runner=function(jobs){
 if(!jobs.length)return [];const tmp=path.join(require('node:os').tmpdir(),'megulit-card-'+process.pid+'-'+Date.now().toString(36)+'.json');
 fs.writeFileSync(tmp,JSON.stringify(jobs),'utf8');
 try{const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'card-image.ps1'),tmp],{encoding:'utf8',windowsHide:true,timeout:120000});
  const out=jobs.map(()=>({ok:false,w:0,h:0}));for(const m of String(r.stdout||'').matchAll(/(\d+)\t(ok|error)\t(\d+)\t(\d+)/g)){const [,i,st,w,h]=m;if(out[+i])out[+i]={ok:st==='ok',w:+w||0,h:+h||0};}return out;}
 finally{try{fs.rmSync(tmp,{force:true});}catch{}}};
function stampOf(file){try{const s=fs.statSync(file);return file+'|'+s.size+'|'+s.mtimeMs;}catch{return null;}}
const thumbsDir=root=>path.join(dirOf(root),'thumbs');
function readMeta(root){try{return JSON.parse(fs.readFileSync(path.join(thumbsDir(root),'meta.json'),'utf8'))||{};}catch{return {};}}
/* cached JPEGs of at most max px for picture files: {file -> {out,w,h}} */
function scaled(root,files,max){
 const meta=readMeta(root),jobs=[],map=new Map();
 for(const f of files){const st=stampOf(f);if(!st)continue;const k=sha(st+'|'+max+'|v2').slice(0,24),out=path.join(thumbsDir(root),k+'.jpg');
  if(meta[k]&&fs.existsSync(out))map.set(f,{out,w:meta[k].w,h:meta[k].h});else if(!jobs.some(j=>j.in===f))jobs.push({mode:'thumb',in:f,out,max,k});}
 if(jobs.length){fs.mkdirSync(thumbsDir(root),{recursive:true});const res=runner(jobs.map(({k,...j})=>j));
  withLock(root,()=>{const m=readMeta(root);jobs.forEach((j,i)=>{if(res[i]?.ok){m[j.k]={w:res[i].w,h:res[i].h};map.set(j.in,{out:j.out,w:res[i].w,h:res[i].h});}});atomicWrite(path.join(thumbsDir(root),'meta.json'),JSON.stringify(m));});}
 return map;}

/* ---- 'seen': pictures an engine reported on screen ---- */
const seenFile=(root,exe)=>path.join(dirOf(root),'seen',exeKey(exe)+'.json');
function readSeen(root,exe){try{const v=JSON.parse(fs.readFileSync(seenFile(root,exe),'utf8'));return Array.isArray(v)?v:[];}catch{return [];}}
/* the generic record point: an engine hook says this picture is on the game's screen now (reader 'imageShown') */
function noteSeen(root,exe,name){
 const b=path.basename(String(name||'').replace(/\\/g,'/')).replace(/\.[^.]+$/,'').toLowerCase();if(!root||!exe||!/^[\w\-.]{1,80}$/.test(b))return false;
 return withLock(root,()=>{const list=readSeen(root,exe);if(list.includes(b))return false;list.push(b);atomicWrite(seenFile(root,exe),JSON.stringify(list.slice(-5000)));return true;});}
const IMG=/\.(?:png|jpe?g|bmp)$/i;
function looseByName(dir,names,depth=3,out=new Map()){if(!names.size)return out;let l;try{l=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of l){const p=path.join(dir,e.name);if(e.isDirectory()){if(depth>0&&!/^(?:save|savedata|movie|bgm|voice|sound|se)$/i.test(e.name))looseByName(p,names,depth-1,out);}
  else if(IMG.test(e.name)){const b=e.name.replace(/\.[^.]+$/,'').toLowerCase();if(names.has(b)&&!out.has(b))out.set(b,p);}}return out;}

/* ---- sources ---- */
function gameRow(db,id){const g=db.prepare('SELECT id,title,executable,cover FROM games WHERE id=? AND removed_at IS NULL').get(String(id||''));if(!g)throw Error('GAME_NOT_FOUND');return g;}
function safeOn(root){try{return JSON.parse(fs.readFileSync(path.join(root,'data','config','native-preferences.json'),'utf8')).safe_cg===true;}catch{return false;}}
/* every picture the player is known to have seen: [{id,kind,source,file?|name}] (save CGs keep their name; the
   file is decoded only when a picture is needed) */
function sources(root,game,opts={}){
 const out=[],exe=game.executable,safe=opts.safe??safeOn(root);
 if(game.cover){const f=path.join(root,'data','assets','covers',path.basename(game.cover));if(fs.existsSync(f))out.push({id:'cover',kind:'cover',source:'cover',file:f});}
 if(exe){
  try{const shots=require('./scene-shots.cjs'),d=path.join(root,'data','scene-shots',exeKey(exe));for(const s of shots.list(root,exe)){const f=path.join(d,s.file);if(fs.existsSync(f))out.push({id:'shot:'+s.file,kind:'shot',source:'shot',file:f});}}catch{}
  const saved=new Set();
  if(fs.existsSync(exe)){try{const cg=require('./game-cg.cjs'),r=cg.scan(exe);let names=r.supported?[...r.items.keys()]:[];
   /* KiriKiri: only explicit cg_ unlock marks count on the wall (the detail card keeps its wider rule) */
   if(r.engine==='KiriKiri'){const marked=cg.kirikiriMarked(exe)||new Set();names=names.filter(n=>marked.has(n));}
   if(safe&&names.length){const rating=require('./cg-rating.cjs'),known=rating.ratings(path.join(root,'data','cg-cache',sha(path.dirname(String(exe)).toLowerCase()).slice(0,16)));names=names.filter(n=>rating.isSafe(known[n]));}
   for(const n of names){saved.add(n);out.push({id:'save:'+n,kind:'cg',source:'save',name:n});}}catch{}}
  if(!safe){const want=new Set(readSeen(root,exe).filter(n=>!saved.has(n)));const found=looseByName(path.dirname(exe),want);
   for(const [n,f] of found)out.push({id:'seen:'+n,kind:'cg',source:'seen',file:f});
   try{out.push(...require('./runtime-cg.cjs').sources(exe,{settle:opts.settle}));}catch{}}
 }
 return out;}
function fileOf(root,game,s){if(s.file)return s.file;try{return require('./game-cg.cjs').pictureFile(root,game.executable,s.name)||null;}catch{return null;}}

/* save CGs not decoded yet go to a background worker: the list answers at once with what is ready (cover, shots,
   decoded CGs) and the page asks cards_pending, then cards_unlocked again, until pending is 0 */
const warmFile=(root,exe)=>path.join(dirOf(root),'warm-'+exeKey(exe)+'.json');
function warmBusy(root,exe){try{const v=JSON.parse(fs.readFileSync(warmFile(root,exe),'utf8'));if(Date.now()-v.at<10*60000){try{process.kill(v.pid,0);return true;}catch{}}}catch{}return false;}
let spawnWarm=function(root,exe,names){
 if(warmBusy(root,exe))return;const job=path.join(dirOf(root),'warm-'+exeKey(exe)+'-job.json');atomicWrite(job,JSON.stringify({root,exe,names}));
 const child=require('node:child_process').spawn(process.execPath,[__filename,'--warm',job],{detached:true,stdio:'ignore',windowsHide:true});
 atomicWrite(warmFile(root,exe),JSON.stringify({pid:child.pid,at:Date.now()}));child.unref();};
function warm(root,exe,names){const cg=require('./game-cg.cjs');/* decoded in batches of 24, each batch thumbnailed by one PowerShell run (one run per picture took minutes) */
 for(let i=0;i<names.length;i+=24){const files=[];for(const n of names.slice(i,i+24)){try{const f=cg.pictureFile(root,exe,n);if(f)files.push(f);}catch{}}if(files.length)scaled(root,files,THUMB);}}
function split(root,g){
 const list=sources(root,g),files=new Map(),later=[];
 for(const s of list){if(s.file){files.set(s.id,s.file);continue;}const f=require('./game-cg.cjs').cachedPicture(root,g.executable,s.name);if(f)files.set(s.id,f);else later.push(s.name);}
 return {list,files,later};}
function unlocked(db,root,gameId){
 const g=gameRow(db,gameId),{list,files,later}=split(root,g);
 const th=scaled(root,[...files.values()],THUMB),ready=list.flatMap(s=>{const t=th.get(files.get(s.id));if(!t)return [];return [{id:s.id,kind:s.kind,source:s.source,src:dataUrl(t.out),w:t.w,h:t.h}];});
 if(later.length)spawnWarm(root,g.executable,later);
 return ready;}
function pending(db,root,gameId){const g=gameRow(db,gameId),{later}=split(root,g);if(later.length)spawnWarm(root,g.executable,later);return {pending:later.length};}
/* one unlocked picture at viewing size, for the framing step */
function image(db,root,gameId,srcId){
 const g=gameRow(db,gameId),s=sources(root,g).find(x=>x.id===String(srcId||''));if(!s)throw Error('CARD_SOURCE_LOCKED');
 const f=fileOf(root,g,s),t=f&&scaled(root,[f],VIEW).get(f);if(!t)throw Error('CARD_SOURCE_UNREADABLE');return {id:s.id,src:dataUrl(t.out),w:t.w,h:t.h};}

function games(db,root){
 const store=require('./store.cjs'),out=[];
 for(const g of store.games(db,root)){if(g.hidden)continue;const row=db.prepare('SELECT id,title,executable,cover FROM games WHERE id=?').get(g.id);let n=0;try{n=sources(root,row,{settle:false}).length;}catch{}
  if(n)out.push({gameId:g.id,title:g.title,cover:g.cover||'',unlockedCount:n});}
 return out;}

/* ---- cards ---- */
const initialOf=t=>{const c=[...String(t||'').trim()][0]||'?';return c.toUpperCase();};
const num=(v,d,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):d;};
function publicCard(root,c){const img=path.join(dirOf(root),'img');return {id:c.id,gameId:c.gameId,title:c.title,initial:c.initial,kind:c.kind,source:c.source,srcId:c.srcId,src:dataUrl(path.join(img,c.face)),w:c.w,h:c.h,fullW:c.fullW,fullH:c.fullH,still:c.still,finish:c.finish||'plain',createdAt:c.createdAt};}
function state(root){const s=readState(root);return {toploaders:s.toploaders,cards:s.cards.map(c=>publicCard(root,c)),mode:s.mode};}
function create(db,root,req){
 const g=gameRow(db,req.gameId),srcId=String(req.srcId||'');
 const s=sources(root,g).find(x=>x.id===srcId);if(!s)throw Error('CARD_SOURCE_LOCKED');
 if(req.kind&&req.kind!==s.kind)throw Error('CARD_KIND_MISMATCH');
 const file=fileOf(root,g,s);if(!file)throw Error('CARD_SOURCE_UNREADABLE');
 const st=req.still||{},still={x:num(st.x,0.5,0,1),y:num(st.y,0.5,0,1),scale:num(st.scale,1,1,8)};
 /* the card's finish: plain, 'shine' (闪卡) or 'holo' (镭射); drawn by the page, nothing is baked into the picture */
 const finish=req.finish==='shine'||req.finish==='holo'?req.finish:'plain';
 const id=newId('c'),img=path.join(dirOf(root),'img');fs.mkdirSync(img,{recursive:true});
 const face=id+'-face.jpg',full=id+'-full.jpg';
 const res=runner([{mode:'crop',in:file,out:path.join(img,face),x:still.x,y:still.y,scale:still.scale,w:FACE_W,h:FACE_H},{mode:'thumb',in:file,out:path.join(img,full),max:FULL}]);
 if(!res[0]?.ok||!res[1]?.ok){for(const f of [face,full])try{fs.rmSync(path.join(img,f),{force:true});}catch{}throw Error('CARD_IMAGE_FAILED');}
 const k=Math.min(1,FULL/Math.max(res[1].w,res[1].h));
 const card={id,gameId:g.id,title:g.title,initial:initialOf(g.title),kind:s.kind,source:s.source,srcId,face,full,w:FACE_W,h:FACE_H,fullW:Math.round(res[1].w*k),fullH:Math.round(res[1].h*k),still,finish,createdAt:Date.now()};
 mutate(root,x=>{x.cards.push(card);});return publicCard(root,card);}
function full(root,cardId){const s=readState(root),c=s.cards.find(x=>x.id===cardId);if(!c)throw Error('CARD_NOT_FOUND');return {id:c.id,full:dataUrl(path.join(dirOf(root),'img',path.basename(c.full))),w:c.fullW,h:c.fullH};}
function remove(root,cardId){
 const c=mutate(root,s=>{const c=s.cards.find(x=>x.id===cardId);if(!c)throw Error('CARD_NOT_FOUND');s.cards=s.cards.filter(x=>x!==c);for(const t of s.toploaders)if(t.cardId===cardId)t.cardId=null;return c;});
 for(const f of [c.face,c.full])try{fs.rmSync(path.join(dirOf(root),'img',path.basename(f)),{force:true});}catch{}return state(root);}
function insert(root,toploaderId,cardId){mutate(root,s=>{const t=s.toploaders.find(x=>x.id===toploaderId);if(!t)throw Error('TOPLOADER_NOT_FOUND');if(!s.cards.some(c=>c.id===cardId))throw Error('CARD_NOT_FOUND');if(t.cardId&&t.cardId!==cardId)throw Error('TOPLOADER_FULL');
 for(const o of s.toploaders)if(o.cardId===cardId)o.cardId=null;t.cardId=cardId;});return state(root);}
function eject(root,toploaderId){mutate(root,s=>{const t=s.toploaders.find(x=>x.id===toploaderId);if(!t)throw Error('TOPLOADER_NOT_FOUND');t.cardId=null;});return state(root);}
/* a made card's finish can be changed later: plain, shine (闪卡) or holo (镭射) */
function setFinish(root,cardId,finish){const f=finish==='shine'||finish==='holo'?finish:'plain';mutate(root,s=>{const c=s.cards.find(x=>x.id===cardId);if(!c)throw Error('CARD_NOT_FOUND');c.finish=f;});return state(root);}
function addToploaders(root,count){const n=Math.floor(num(count,1,1,100));mutate(root,s=>{if(s.toploaders.length+n>MAX_TOPLOADERS)throw Error('TOPLOADER_LIMIT');for(let i=0;i<n;i++)s.toploaders.push({id:newId('t'),cardId:null,order:s.toploaders.length});});return state(root);}
function setMode(root,mode){if(mode!=='a'&&mode!=='b')throw Error('INVALID_MODE');mutate(root,s=>{s.mode=mode;});return state(root);}

function handle(db,root,r){
 switch(r.action){
  case 'cards_state':return state(root);
  case 'cards_games':return games(db,root);
  case 'cards_unlocked':return unlocked(db,root,r.gameId);
  case 'cards_pending':return pending(db,root,r.gameId);
  case 'cards_image':return image(db,root,r.gameId,r.srcId);
  case 'cards_create':return create(db,root,r);
  case 'cards_full':return full(root,String(r.cardId||''));
  case 'cards_delete':return remove(root,String(r.cardId||''));
  case 'cards_insert':return insert(root,String(r.toploaderId||''),String(r.cardId||''));
  case 'cards_eject':return eject(root,String(r.toploaderId||''));
  case 'cards_add_toploaders':return addToploaders(root,r.count);
  case 'cards_set_finish':return setFinish(root,String(r.cardId||''),r.finish);
  case 'cards_set_mode':return setMode(root,r.mode);
 }
 throw Error('UNKNOWN_ACTION');}
module.exports={handle,state,games,unlocked,image,create,sources,noteSeen,readState,_setRunner:f=>{runner=f;},_setSpawnWarm:f=>{spawnWarm=f;},warm,DEFAULT_TOPLOADERS};
if(require.main===module&&process.argv[2]==='--warm'){try{const j=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));try{warm(j.root,j.exe,j.names);}finally{try{fs.rmSync(warmFile(j.root,j.exe),{force:true});fs.rmSync(process.argv[3],{force:true});}catch{}}}catch{}}
