'use strict';
/* 2026-11-14 (user, ダストマニア on beta38): the reader's 对话记录 stayed a 70 px translucent strip with squashed rows.
   Cause: the 推镜 GSAP push tweened the panel while its CSS open animation ran; GSAP read the running keyframe scale
   (1 0.03…1), baked it into an inline transform and the panel kept that squash. The real reader page (every module of
   web/reader, stub Tauri transport) runs in headless Edge; no MeguLit window, no game. Skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));

const now=Date.now();
const entries=[...Array.from({length:6},(_,i)=>({src:'千春\n「ン……ん、く……っ──。その'+i+'」',tr:'唔……嗯……咳……！'+i,at:now-60000+i*1000})),
 /* one hook delivery holding three lines (BRUNS page / skipping): must show as three rows */
 {src:'[千春]……とりあえず、研究室に戻らないと……っしょ、と……っ、……え、え？[千春]な……なにこれ……なんの冗談よ……。[千春]──両手、と……両脚まで……っ。',
  tr:'……总之，得回研究室才行……好，走吧……呃，诶？\n什……什么啊这是……开什么玩笑啊……。\n──双手，还有……连双脚也……。',at:now-5000},
 {src:'なんでこんな……ガッチリ、留めてあるのっ……、外れないじゃない……！',tr:'为什么弄得这么……牢牢固定的……根本解不开嘛……！',at:now}];
const seed={'tomoyo-backlog-session':JSON.stringify(entries)};
const STUB=`<script>window.__seedState=${JSON.stringify(seed)};window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return window.__seedState;
  if(r.action==='reader_bootstrap')return {engines:[],native:{}};if(r.action==='reader_message')return {replies:[]};return {};}return null;}};</script>`;
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
function serve({missing,requests=[]}={}){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
 if(rel.startsWith('/reader/modules/'))requests.push(rel);
 if(rel===missing){res.writeHead(200,{'content-type':'text/javascript'});return res.end(fs.readFileSync(path.join(WEB,'index.html')));}
 if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404);return res.end();}
 let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}

test('Reader reaches ready after the optional font fallback but stops for a required script fallback',{skip:!hasEdge&&'Edge not installed',timeout:90000},async()=>{
 const {modules}=await import('../web/reader/module-list.js');
 const urls=modules.map(name=>'/reader/modules/'+name+'.js');
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-reader-bootstrap-'));
 const cdp=await startEdge(temp);
 try{
  for(const name of ['local-font','save-sentence']){
   const missing='/reader/modules/'+name+'.js',requests=[],server=await serve({missing,requests});
   try{
    const url=`http://127.0.0.1:${server.address().port}/reader/index.html`;
    const navigation=await cdp.send('Page.navigate',{url});
    assert.ok(!navigation.errorText,`Reader navigation failed (${navigation.errorText})`);
    let state;
    for(const deadline=Date.now()+30000;Date.now()<deadline;){
     state=await cdp.evaluate(`({href:location.href,readyState:document.readyState,ready:!!window.__TOME_READER_READY__,error:document.querySelector("#reader-status")?.textContent||""})`).catch(()=>null);
     if(state?.href===url&&(state.ready||state.error.startsWith('Error:')))break;
     await sleep(100);
    }
    assert.equal(state?.ready,name==='local-font',`${name}: ${JSON.stringify({state,requested:requests.length})}`);
    if(name!=='local-font')assert.match(state.error,/save-sentence.*Unexpected token '<'/);
    assert.deepEqual([...new Set(requests)],name==='local-font'?urls:urls.slice(0,urls.indexOf(missing)+1));
   }finally{server.close();}
  }
 }finally{await cdp.stop();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});

const TRANSLATION=`(async()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');
 /* wait for GSAP (loaded on idle by reader-panels.js): the bug needs it */
 for(let i=0;i<80&&!window.gsap;i++)await new Promise(r=>setTimeout(r,50));return !!window.gsap;})()`;
/* effective opacity: the product over the element and its ancestors */
const EFF=`const eff=n=>{let o=1;for(let x=n;x&&x.nodeType===1;x=x.parentElement)o*=Number(getComputedStyle(x).opacity);return Math.round(o*1000)/1000;};`;
const LOG=`(async()=>{${EFF}const w=ms=>new Promise(r=>setTimeout(r,ms));
 /* a low saved panel opacity (面板不透明度) only changes the backdrop, above a readability floor; text stays opaque */
 document.documentElement.style.setProperty('--tome-log-alpha','.35');
 const b=window.__tomoyoChinese;
 /* the surface acknowledgement arrives at once (the fast path where GSAP met the running keyframes) */
 setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);
 b.openBacklog();const p=document.querySelector('.tome-backlog');const early=[];
 for(const t of [40,90,140]){await w(t-(early.at(-1)?.t||0));const cs=getComputedStyle(p);if(cs.opacity>.5)early.push({t,h:p.getBoundingClientRect().height});else early.push({t,h:null});}
 await w(900);const cs=getComputedStyle(p),bg=p.querySelector(':scope>.tome-menu-bg');
 const rows=[...p.querySelectorAll('.tome-log-item')].map(r=>{const x=r.getBoundingClientRect();return {top:x.top,bottom:x.bottom,h:x.height,text:r.querySelector('.tome-log-src').textContent,
  name:r.querySelector('.tome-log-name').textContent,tr:r.querySelector('.tome-log-tr').hidden?'':r.querySelector('.tome-log-tr').textContent}});
 const text=[...p.querySelectorAll('.tome-log-src,.tome-log-tr:not([hidden]),header h3')].map(eff);
 const out={h:p.getBoundingClientRect().height,want:Math.min(Math.round(innerHeight*.88),innerHeight-32),transform:cs.transform,scale:cs.scale,inline:['transform','scale','translate','rotate'].map(k=>p.style.getPropertyValue(k)).join(''),
  shown:p.hasAttribute('data-shown'),anims:p.getAnimations().filter(a=>a.playState==='running').length,early,rows,minText:Math.min(...text),panel:eff(p),bg:bg?Number(getComputedStyle(bg).opacity):null};
 b.closeBacklog();await w(400);return out;})()`;
const MENU=`(async()=>{${EFF}const w=ms=>new Promise(r=>setTimeout(r,ms));const b=window.__tomoyoChinese;
 setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);
 b.toggleGalMenu();await w(1200);const d=document.querySelector('.tomoyo-cn-dialog[open]');const cs=getComputedStyle(d),r=d.getBoundingClientRect();
 d.querySelector('[data-menu-key=misc]').click();await w(500);const z=d.querySelector('.tome-reset-zone');z.scrollIntoView({block:'center'});await w(100);
 const h4=getComputedStyle(z.querySelector('h4')),btn=z.querySelector('[data-reset-open]'),row=z.querySelector('.tome-reset-row').getBoundingClientRect(),br=btn.getBoundingClientRect();
 return {transform:cs.transform,scale:cs.scale,inline:['transform','scale','translate','rotate'].map(k=>d.style.getPropertyValue(k)).join(''),h:r.height,
  label:eff(d.querySelector('.tomoyo-menu-header h3')),h4Top:h4.marginTop,btnMargin:getComputedStyle(btn).margin,btnCentre:Math.abs((br.top+br.bottom)/2-(row.top+row.bottom)/2),btnRight:row.right-br.right};})()`;
const CARD=`(async()=>{${EFF}const w=ms=>new Promise(r=>setTimeout(r,ms));const b=window.__tomoyoChinese;
 document.documentElement.style.setProperty('--tome-card-alpha','.3');
 b.localLookup=async()=>({entries:[{spellings:['ガッチリ'],readings:['がっちり'],pos:['副詞'],definitions:['牢固；结实；壮实','紧紧；绷紧；牢牢','精明；精于算计；老练']}]});
 b.openLocalSelection({text:'ガッチリ',start:0,end:4,selection:'ガッチリ'},{left:700,top:300,bottom:330});await w(900);
 const c=document.querySelector('.tomoyo-selection-card'),cs=getComputedStyle(c);
 return {transform:cs.transform,scale:cs.scale,inline:['transform','scale','translate','rotate'].map(k=>c.style.getPropertyValue(k)).join(''),h:c.getBoundingClientRect().height,
  minText:Math.min(...[...c.querySelectorAll('button,.tomoyo-sense>div')].map(eff)),senses:c.querySelectorAll('.tomoyo-sense').length,numbers:c.querySelectorAll('.tomoyo-sense-number').length,
  tint:Number(getComputedStyle(c.querySelector(':scope>.tome-menu-bg')).opacity)};})()`;

test('reader 对话记录 / Alt+T / 点读卡 open at full size, readable, rows apart',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-reader-log-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<120&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'reader page loaded every module: '+await cdp.evaluate('document.querySelector("#reader-status")?.textContent||""').catch(()=>''));
  assert.ok(await cdp.evaluate(TRANSLATION),'GSAP loaded (the push that caused the strip)');

  const log=await cdp.evaluate(LOG);
  assert.ok(Math.abs(log.h-log.want)<=2,`log height ${log.h}px, want ${log.want}px`);
  assert.equal(log.transform,'none','no transform left on the log');assert.ok(log.scale==='none'||log.scale==='1','log scale '+log.scale);
  assert.equal(log.inline,'','no inline transform/scale on the log');assert.ok(log.shown,'open animation settled');assert.equal(log.anims,0,'no animation still running');
  for(const e of log.early)if(e.h!=null)assert.ok(e.h>=log.want*.9,`at ${e.t} ms the visible log was ${e.h}px tall (a strip)`);
  assert.equal(log.rows.length,entries.length+2,'the merged entry shows as one row per line');
  for(const [i,r] of log.rows.entries()){assert.ok(r.h>=40,`row ${i} only ${r.h}px tall`);assert.doesNotMatch(r.text,/^[[【]/,`row ${i} still starts with the speaker mark`);
   if(i)assert.ok(r.top>=log.rows[i-1].bottom-.5,`row ${i} overlaps row ${i-1}`);}
  const split=log.rows.slice(6,9);assert.deepEqual(split.map(r=>r.name),['千春','千春','千春']);assert.match(split[1].tr,/什……什么啊这是/);
  assert.equal(log.minText,1,'log text keeps full opacity');assert.equal(log.panel,1,'the panel itself is not faded');
  assert.ok(log.bg>=.9,'log tint floor: the game text never reads through the rows ('+log.bg+')');

  const menu=await cdp.evaluate(MENU);
  assert.equal(menu.transform,'none','no transform left on Alt+T');assert.ok(menu.scale==='none'||menu.scale==='1','Alt+T scale '+menu.scale);assert.equal(menu.inline,'');
  assert.ok(menu.h>300,'Alt+T height '+menu.h);assert.equal(menu.label,1);
  assert.equal(menu.h4Top,'0px','危险区 heading has no stray top margin');assert.equal(menu.btnMargin,'0px','危险区 button has no stray margin');
  assert.ok(menu.btnCentre<=1,'危险区 button centred on its row');assert.ok(menu.btnRight<=1,'危险区 button flush right');

  const card=await cdp.evaluate(CARD);
  assert.equal(card.transform,'none');assert.ok(card.scale==='none'||card.scale==='1','card scale '+card.scale);assert.ok(card.h>60,'card height '+card.h);assert.equal(card.minText,1,'card text keeps full opacity');
  assert.equal(card.senses,3);assert.equal(card.numbers,0,'no 01/02/03 prefixes on the senses');assert.ok(card.tint>=.88,'card tint floor over a bright game: '+card.tint);

  /* 2026-11-26 (死に逝く君、館に芽吹く憎悪): the name box drawn 15 ms after its line arrives as a late hookSpeaker; the log row of that
     line takes it, and an older row or a row with its own name does not */
  const late=await cdp.evaluate(`(()=>{const b=window.__tomoyoChinese;b.hookActive=true;
   const say=(src,who)=>{b.hookSourceText=src;b.hookSpeaker=who||'';b.onSourceText(src);};
   say('消し炭になってしまった人間の腕を見て、その男は溜息混じりにつぶやいた。');b.onLateSpeaker('血塗れの男');const narration=b.backlogEntries().at(-1).name||'';
   say('「……焼き過ぎたか」');b.onLateSpeaker('血塗れの男');const quoted=b.backlogEntries().at(-1).name||'';
   say('「あんな奴に……」','美亜');b.onLateSpeaker('血塗れの男');const own=b.backlogEntries().at(-1).name||'';
   b.hookSourceText='「次の行」';b.onLateSpeaker('血塗れの男');const stale=b.backlogEntries().at(-1).name||'';
   return {narration,quoted,own,stale};})()`);
  assert.deepEqual(late,{narration:'血塗れの男',quoted:'血塗れの男',own:'美亜',stale:'美亜'});

  /* #1136: the open 对话记录 goes to the bridge as a relayed panel (presses kept from a polling game), its scrollbar and the
     log settings' sliders / drop-downs as native spots inside it */
  const hit=await cdp.evaluate(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const b=window.__tomoyoChinese;const sent=[];const real=window.__tomoyoTranslateRequest;
   window.__tomoyoTranslateRequest=s=>{try{const m=JSON.parse(s);if(m.type==='galHitRegions')sent.push(m);}catch{}return real?.(s);};
   for(let i=0;i<60;i++)b.onSourceText('これは記録を伸ばすための地の文その'+i+'です。');
   setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);
   b.openBacklog();await w(1200);const last=sent.at(-1)?.regions||[];b.closeBacklog();await w(400);window.__tomoyoTranslateRequest=real;
   return {relay:last.filter(r=>r.relay).length,spots:last.filter(r=>r.nativeSpot).length,spotsMenu:last.filter(r=>r.nativeSpot).every(r=>r.menu)};})()`);
  assert.ok(hit.relay>=1,'log panel region marked relay: '+JSON.stringify(hit));assert.ok(hit.spots>=1,'the log scrollbar is a native spot: '+JSON.stringify(hit));assert.ok(hit.spotsMenu);
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
