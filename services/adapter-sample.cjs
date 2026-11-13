// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E560 desensitized probe upload. Nothing of a game's text ever leaves the PC:
     sampleGame({dir,executable,result})  (probe worker) structural samples of the files that failed: archive heads and
                                          tails, script files a reader opened but could not parse — each through
                                          desensitize.sample(), which drops anything that does not pass verify() — and
                                          decrypt parameter candidates derived on this PC (desensitize.keyCandidates)
     prepare(root,db,{ids})               (service) bundles the problem games' probe results and samples, checks the
                                          whole bundle once more for text, stores it under its sha256 and returns the
                                          manifest the user sees: every item, its size, the total and the hash
     upload(root,{hash,followUp})         sends exactly that stored bundle, in chunks under the relay's size limit,
                                          only after the user confirmed it in the dialog (the hash must match)
   Bundle (schema megulit.probe-bundle v1): {app, createdAt, features, games:[{key,title,step,detail,detected,reader,lines,
   japaneseLines,sizes,pairing,inventory,engines,unsupported,preparing,samples:[{name,role,size,head,sample}],keys,runtime?}]}.
   runtime (E596, optional, versioned on its own: {schema:'megulit.runtime-findings',version}) is what the opt-in runtime
   harvest (runtime-harvest.cjs) kept of a running game: keys, index layouts, dispatch tables, desensitized script layouts.
   Additive: a reader that does not know it skips it; "features" lists what a bundle carries.
   key is the anonymous shared-adaptation fingerprint (exe name + size + first-MiB hash); no path, user name or line. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const d=require('./desensitize.cjs');
/* E596 (user 2026-11-14): after desensitizing, a script is long runs of the same placeholder bytes and gzip takes it to
   about 1/150 (index tables of numbers about 1/6, archives whose encrypted blocks were zero-filled about 1/90; measured on
   synthetic Shift-JIS / UTF-16 / bytecode / index data), so whole scripts and whole archive heads and tails go up,
   compressed. Caps count what is sent (compressed), not the raw size: SAMPLE_PACKED_MAX per sample (a sample over it is
   taken again with a quarter of the window), MAX_BUNDLE for the bundle (the relay limit). GAME_RAW_MAX / GAME_MS bound
   the work on this PC per game. */
const MAX_BUNDLE=8<<20,CHUNK=512*1024,SAMPLE_HEAD=8<<20,SAMPLE_TAIL=8<<20,SCRIPT_MAX=16<<20,PER_GAME_SAMPLES=8,SAMPLE_PACKED_MAX=2<<20,GAME_RAW_MAX=64<<20,GAME_MS=80000,MIN_WINDOW=64*1024;
const outbox=root=>path.join(root,'data','adapter-probe','outbox');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const readHead=(file,n)=>require('./original-engines/kit.cjs').readAt(file,0,n);/* E580 */
const readRange=(file,at,n)=>require('./original-engines/kit.cjs').readAt(file,at,n);/* E580 */

/* ---- worker side ------------------------------------------------------------------------------------------------ */
const SCRIPTY=/script|scenario|scene|scn|story|text|txt|msg|data|sys|main|game/i;
/* a compressed sample that fits SAMPLE_PACKED_MAX: the window is quartered until it does (null when even MIN_WINDOW does
   not, or verify() refused it) */
const packedSize=s=>s?d.sampleSizes(s).packed:0;
function fitted(make,window){for(let w=window;w>=MIN_WINDOW;w=Math.floor(w/4)){const s=make(w);if(!s)return null;if(packedSize(s)<=SAMPLE_PACKED_MAX)return s;}return null;}
const sized=(entry,s)=>{if(s){const z=d.sampleSizes(s);entry.raw=z.raw;entry.packed=z.packed;}return entry;};
/* an archive: whole when head + tail cover it, else its head and its tail (indexes live at either end) */
function archiveSample(file,dir,budget){
 const st=fs.statSync(file),name=d.maskString(path.relative(dir,file).replace(/\\/g,'/')).slice(0,120);
 const s=fitted(w=>{const head=Math.min(w,SAMPLE_HEAD),tail=Math.min(w,SAMPLE_TAIL);
  if(st.size<=head+tail){budget.raw+=st.size;return d.sample(fs.readFileSync(file),{max:st.size,compress:true});}
  budget.raw+=head+tail;const h=d.sample(readRange(file,0,head),{max:head,compress:true});if(!h)return null;
  const t=d.sample(readRange(file,st.size-tail,tail),{max:tail,compress:true});if(t){for(const p of t.parts)p.at+=st.size-tail;for(const o of t.opaque)o.at+=st.size-tail;}
  return {size:st.size,parts:[...h.parts,...(t?.parts||[])],opaque:[...h.opaque,...(t?.opaque||[])],entropy:h.entropy};},Math.max(SAMPLE_HEAD,SAMPLE_TAIL));
 if(!s)return {name,role:'archive',size:st.size,dropped:'VERIFY'};
 return sized({name,role:'archive',size:st.size,head:sha(readHead(file,1<<20)),sample:{parts:s.parts,opaque:s.opaque,entropy:s.entropy}},s);}
/* a script: the whole file up to SCRIPT_MAX */
function scriptSample(bytes,max=SCRIPT_MAX){return fitted(w=>d.sample(bytes.subarray(0,Math.min(w,bytes.length)),{max:Math.min(w,bytes.length),compress:true}),Math.min(max,bytes.length));}
/* encrypted entries of an XP3 archive, for known-plaintext key candidates: [{data,ext}] */
function xp3Entries(file){try{const xp3=require('./original-engines/xp3.cjs'),t=xp3.list(file);if(!t)return [];return t.files.filter(e=>e.encrypted&&e.size>=16).slice(0,24).map(e=>{try{return {data:xp3.read(file,e).subarray(0,256),ext:path.extname(e.name).slice(1)};}catch{return null;}}).filter(Boolean);}catch{return [];}}
function opaqueBlocks(file){try{const st=fs.statSync(file),out=[];for(const at of [0,4096,65536,1<<20,st.size>>1].filter(x=>x+4096<=st.size)){const b=readRange(file,at,4096);if(d.entropy(b)>7.2)out.push({data:b,ext:''});}return out;}catch{return [];}}
function sampleGame({dir,executable,result}){
 const samples=[],entries=[];const archives=(result?._archives||[]).filter(f=>{try{return fs.statSync(f).isFile();}catch{return false;}});
 const budget={raw:0,start:Date.now()},room=()=>budget.raw<GAME_RAW_MAX&&Date.now()-budget.start<GAME_MS;
 const step=result?.step||'';
 if(['unknown-pack','decrypt-failed','timeout','parse-failed'].includes(step)){
  const pick=archives.filter(f=>!/\.(ogg|png|wav|mp4|webm|avi|wmv)$/i.test(f)).sort((a,b)=>SCRIPTY.test(path.basename(b))-SCRIPTY.test(path.basename(a))).slice(0,3);
  for(const f of pick){if(room())try{samples.push(archiveSample(f,dir,budget));}catch{}entries.push(...xp3Entries(f),...opaqueBlocks(f));}}
 if(step==='parse-failed'){
  /* the scenes a reader opened but could not cut into lines */
  try{const scenes=require('./original-engines/scenes.cjs'),opened=(result.engines||[]).filter(e=>e.scenes>0&&!e.lines).map(e=>e.id);
   for(const id of opened){const list=scenes.ENGINES[id]?.scenes(dir)||[];for(const s of list.slice(0,PER_GAME_SAMPLES-samples.length>0?PER_GAME_SAMPLES-samples.length:0)){if(!room())break;let b;try{b=s.read();}catch{continue;}budget.raw+=Math.min(b.length,SCRIPT_MAX);const sm=scriptSample(b);
     samples.push(sm?sized({name:d.maskString(String(s.name)).slice(0,120),role:'script:'+id,size:b.length,head:sha(b.subarray(0,1<<20)),sample:sm},sm):{name:d.maskString(String(s.name)).slice(0,120),role:'script:'+id,size:b.length,dropped:'VERIFY'});}}}catch{}
  /* loose script-looking files no reader took */
  if(samples.length<PER_GAME_SAMPLES)try{const list=fs.readdirSync(dir).filter(n=>/\.(ks|scr|ss|s|sc|txt|ws2|bsc|asb|mjo|hcb)$/i.test(n)).slice(0,PER_GAME_SAMPLES-samples.length);
   for(const n of list){if(!room())break;const f=path.join(dir,n),b=readHead(f,SCRIPT_MAX);budget.raw+=b.length;const sm=scriptSample(b);samples.push(sm?sized({name:d.maskString(n),role:'script',size:fs.statSync(f).size,head:sha(readHead(f,1<<20)),sample:sm},sm):{name:d.maskString(n),role:'script',size:fs.statSync(f).size,dropped:'VERIFY'});}}catch{}}
 const keys=entries.length?d.keyCandidates(entries):[];
 return {samples:samples.slice(0,PER_GAME_SAMPLES+3),keys};}

/* ---- service side ----------------------------------------------------------------------------------------------- */
const ALLOWED_STEPS=['unknown-pack','decrypt-failed','parse-failed','not-japanese','low-pairing','timeout'];
/* the uploaded part of a probe result: counts and names that went through maskString, nothing else */
function publicResult(r){const inv=r.inventory||{};return {step:r.step,detail:String(r.detail||'').replace(/[^\x20-\x7e]/g,'?').slice(0,80),detected:r.detected||null,reader:String(r.reader||''),lines:r.lines|0,japaneseLines:r.japaneseLines|0,sizes:(r.sizes||[]).slice(0,4000).map(n=>n|0),
 pairing:r.pairing&&r.pairing.total?{total:r.pairing.total|0,paired:r.pairing.paired|0,unpaired:r.pairing.unpaired|0,rate:r.pairing.rate,reasons:r.pairing.reasons||{}}:null,
 inventory:{files:inv.files|0,bytes:inv.bytes||0,scripts:inv.scripts|0,ext:Object.fromEntries(Object.entries(inv.ext||{}).filter(([k])=>/^[\x20-\x7e]{1,12}$/.test(k)).slice(0,60)),archives:(inv.archives||[]).slice(0,48).map(a=>({name:d.maskString(a.name).slice(0,120),size:a.size||0,magic:/^[0-9a-f]{0,16}$/.test(a.magic||'')?a.magic:'',format:/^[a-z0-9-]{0,20}$/.test(a.format||'')?a.format:''}))},
 engines:(r.engines||[]).slice(0,60).map(e=>({id:String(e.id).slice(0,30),scenes:e.scenes|0,parsed:e.parsed|0,lines:e.lines|0,japaneseLines:e.japaneseLines|0,error:String(e.error||'').replace(/[^\x20-\x7e]/g,'?').slice(0,60),ms:e.ms|0})),
 unsupported:r.unsupported?{engine:String(r.unsupported.engine||'').slice(0,30),code:String(r.unsupported.code||'').replace(/[^\x20-\x7e]/g,'?').slice(0,40)}:null,preparing:r.preparing||null};}
/* last line of defence: outside titles, the bundle may hold no kana/kanji but placeholders and kept punctuation */
const TEXTISH=/[぀-ヿ㐀-鿿가-힯０-ｚ]/g;
function clean(bundle){const copy={...bundle,games:bundle.games.map(({title,...g})=>g)};const s=JSON.stringify(copy);const bad=(s.match(TEXTISH)||[]).filter(c=>!d.PLACEHOLDER_CPS.has(c.codePointAt(0)));return bad.length===0;}
function appVersion(root){try{return require('./shared-adaptation.cjs').appVersion(root);}catch{return '';}}
/* prepare(root,db,{ids,sampler}) → {hash,bytes,chunks,manifest:[...],games:n} or {empty:true}
   sampler(game,result) runs sampleGame in the probe worker (adapter-probe.cjs sampleInWorker) */
async function prepare(root,db,{ids=null,sampler,titles=true}={}){
 const probe=require('./adapter-probe.cjs'),results=probe.results(root),games=probe.libraryGames(db);
 const want=ids?new Set(ids.map(String)):null,list=[];
 for(const g of games){const r=results[g.id];if(!r||!ALLOWED_STEPS.includes(r.step))continue;if(want&&!want.has(g.id))continue;
  let fp=null;try{fp=require('./shared-adaptation.cjs').fingerprint(g.executable);}catch{}
  let extra={samples:[],keys:[]};if(sampler&&r.step!=='low-pairing'&&r.step!=='not-japanese')try{extra=await sampler(g,r)||extra;}catch{}
  /* runtime findings of this game, through the privacy gate once more */
  let runtime=null;try{const rh=require('./runtime-harvest.cjs');runtime=rh.gate(rh.load(root,g.id));}catch{}
  list.push({key:fp?.key||sha('title:'+g.title).slice(0,64),title:titles?String(g.title).slice(0,120):'',...publicResult(r),samples:extra.samples||[],keys:extra.keys||[],...(runtime?{runtime}:{})});}
 if(!list.length)return {empty:true};
 let bundle={schema:'megulit.probe-bundle',version:1,features:list.some(g=>g.runtime)?['runtime-1']:[],app:appVersion(root),createdAt:new Date().toISOString(),games:list};
 /* over the relay limit: drop tails, then samples from the biggest games, until it fits */
 let body=Buffer.from(JSON.stringify(bundle));
 /* runtime script samples and name lists go first (the keys and index numbers are what solves a game) */
 for(const g of bundle.games){if(body.length<=MAX_BUNDLE)break;if(g.runtime){g.runtime.scripts=g.runtime.scripts.map(({sample,...s})=>s);for(const ix of g.runtime.indexes)delete ix.names;g.trimmed=true;body=Buffer.from(JSON.stringify(bundle));}}
 for(let guard=0;body.length>MAX_BUNDLE&&guard<200;guard++){const g=bundle.games.filter(x=>x.samples.length).sort((a,b)=>JSON.stringify(b.samples).length-JSON.stringify(a.samples).length)[0];if(!g)break;g.samples.pop();g.trimmed=true;body=Buffer.from(JSON.stringify(bundle));}
 if(body.length>MAX_BUNDLE)return {error:'TOO_LARGE'};
 if(!clean(bundle))return {error:'TEXT_FOUND'};
 const hash=sha(body);fs.mkdirSync(outbox(root),{recursive:true});fs.writeFileSync(path.join(outbox(root),hash+'.json'),body);
 return {hash,bytes:body.length,limit:MAX_BUNDLE,chunks:Math.ceil(body.length/CHUNK),games:list.length,manifest:manifestOf(bundle)};}
function manifestOf(bundle){return bundle.games.map(g=>({key:g.key.slice(0,12),title:g.title,step:g.step,detail:g.detail,
 items:[{kind:'result',bytes:Buffer.byteLength(JSON.stringify({...g,samples:undefined,keys:undefined,runtime:undefined}))},...g.samples.map(s=>({kind:s.dropped?'dropped':'sample',name:s.name,role:s.role,size:s.size,bytes:s.sample?Buffer.byteLength(JSON.stringify(s.sample)):0,...(s.sample?d.sampleSizes(s.sample):{raw:0,packed:0}),opaque:s.sample?.opaque?.length||0})),...(g.keys.length?[{kind:'keys',count:g.keys.length,algos:[...new Set(g.keys.map(k=>k.algo))]}]:[]),...runtimeItems(g.runtime)]}));}
/* every runtime finding as its own manifest row: what it is, how it was checked, its size (name is shown as is) */
function runtimeItems(rt){if(!rt)return [];const size=x=>Buffer.byteLength(JSON.stringify(x)),out=[];
 for(const k of rt.keys||[])out.push({kind:'runtime-key',name:'runtime · '+k.algo+' '+(k.form==='state'?'key schedule':k.form==='params'?'parameters':'key')+' · '+k.verified,role:'runtime',algo:k.algo,bytes:size(k)});
 for(const ix of rt.indexes||[])out.push({kind:'runtime-index',name:'runtime · index of '+ix.archive.name+' · '+ix.count+' entries'+(ix.names?' + masked names':''),role:'runtime',count:ix.count,bytes:size(ix)});
 for(const t of rt.dispatch||[])out.push({kind:'runtime-dispatch',name:'runtime · opcode table · '+t.count+' entries',role:'runtime',bytes:size(t)});
 for(const s of rt.scripts||[])out.push({kind:'runtime-script',name:'runtime · script layout'+(s.sample?' + text-free sample':'')+' · '+(s.encoding||'?'),role:'runtime',bytes:size(s),...(s.sample?d.sampleSizes(s.sample):{})});
 if((rt.constants||[]).length)out.push({kind:'runtime-constants',name:'runtime · cipher tables in modules · '+[...new Set(rt.constants.map(c=>c.algo))].join(', '),role:'runtime',bytes:size(rt.constants)});
 return out;}
/* what a stored bundle would upload (the dialog can show it again) */
function manifest(root,hash){if(!/^[a-f0-9]{64}$/.test(String(hash)))return null;let body;try{body=fs.readFileSync(path.join(outbox(root),hash+'.json'));}catch{return null;}if(sha(body)!==hash)return null;const b=JSON.parse(body);return {hash,bytes:body.length,limit:MAX_BUNDLE,chunks:Math.ceil(body.length/CHUNK),games:b.games.length,manifest:manifestOf(b)};}
const consentFile=root=>path.join(root,'data','adapter-probe','consent.json');
function consent(root){try{const v=JSON.parse(fs.readFileSync(consentFile(root),'utf8'));const now=Date.now();return Object.fromEntries(Object.entries(v.keys||{}).filter(([k,x])=>/^[a-f0-9]{64}$/.test(k)&&x.until>now));}catch{return {};}}
function grant(root,keys,days=180){const all=consent(root),until=Date.now()+days*86400000;for(const k of keys)if(/^[a-f0-9]{64}$/.test(k))all[k]={at:Date.now(),until};fs.mkdirSync(path.dirname(consentFile(root)),{recursive:true});fs.writeFileSync(consentFile(root),JSON.stringify({version:1,keys:all}));}
function revoke(root){try{fs.rmSync(consentFile(root),{force:true});}catch{}return {ok:true};}
/* upload(root,{hash,followUp}) → {state:'uploaded',id,issueUrl} | {state:'failed',error} | {state:'not-configured'} */
async function upload(root,{hash,followUp=false,fetcher=globalThis.fetch,endpoint}={}){
 if(!/^[a-f0-9]{64}$/.test(String(hash)))return {state:'failed',error:'HASH'};
 let body;try{body=fs.readFileSync(path.join(outbox(root),hash+'.json'));}catch{return {state:'failed',error:'NOT_PREPARED'};}
 if(sha(body)!==hash)return {state:'failed',error:'HASH_MISMATCH'};
 const url=endpoint||(()=>{try{return require('./relay-config.cjs').endpoint(root,'/api/probe');}catch{return '';}})();if(!url)return {state:'not-configured'};
 const parts=Math.ceil(body.length/CHUNK),upload=crypto.randomUUID();let last={};
 for(let i=0;i<parts;i++){const data=body.subarray(i*CHUNK,(i+1)*CHUNK).toString('base64');let r;
  for(let attempt=0;attempt<3;attempt++){try{r=await fetcher(url,{method:'POST',headers:{'content-type':'application/json','user-agent':'MeguLit','x-megulit-version':appVersion(root)},body:JSON.stringify({version:1,upload,part:i,parts,size:body.length,sha256:hash,data}),signal:AbortSignal.timeout(60000)});if(r.ok||r.status<500)break;}catch(e){r=null;if(attempt===2)return {state:'failed',error:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK'};}await new Promise(res=>setTimeout(res,800*(attempt+1)));}
  if(!r)return {state:'failed',error:'NETWORK'};let j={};try{j=await r.json();}catch{}
  if(!r.ok||j.ok===false)return {state:'failed',error:String(j.error||'HTTP_'+r.status).slice(0,60)};last=j;}
 if(followUp){try{grant(root,JSON.parse(body).games.map(g=>g.key));}catch{}}
 try{fs.writeFileSync(path.join(outbox(root),hash+'.sent'),JSON.stringify({at:Date.now(),id:last.id||''}));}catch{}
 return {state:'uploaded',id:String(last.id||''),issueUrl:/^https:\/\//.test(String(last.issueUrl||''))?String(last.issueUrl):''};}
module.exports={sampleGame,prepare,manifest,upload,consent,grant,revoke,publicResult,clean,runtimeItems,archiveSample,scriptSample,MAX_BUNDLE,CHUNK,SAMPLE_HEAD,SAMPLE_TAIL,SCRIPT_MAX,SAMPLE_PACKED_MAX};
