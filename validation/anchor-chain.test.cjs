'use strict';
/* 2026-11-19 (user, 死に逝く君 / 素晴らしき日々: 校准 moved only the box while the line sat on the engine's glyph places, and a stray
   offset came along to the next game): one chain on the real reader page in headless Edge. A line anchored on engine places ->
   校准 (the game's first ink is 30 px right / 100 px up) lands in the offset and the line moves there -> the 上边距 slider moves it
   by its percent -> 回到游戏原字位置 puts it back on the engine place and saves 0 -> another game starts on its engine place ->
   back to the first game, its saved offset is used again. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {startEdge}=require('./library-views-perf.cjs');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const STUB=`<script>window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};
  if(r.action==='reader_bootstrap')return {engines:[],native:{}};if(r.action==='reader_message')return {replies:[]};return {};}return null;}};</script>`;
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
function serve(){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
 if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}res.writeHead(404);return res.end();}
 let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}
const PROBE=`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const b=window.__tomoyoChinese,dpr=devicePixelRatio||1,W=innerWidth,H=innerHeight,out={};
 b.galLayoutInfo=()=>({clientX:0,clientY:0,clientWidth:W*dpr,clientHeight:H*dpr});
 const KEY_A='a'.repeat(64),KEY_B='b'.repeat(64),eff=o=>({x:20,y:76,width:60,height:24,anchorDX:0,anchorDY:0,...o});
 b.gameStyleStatus({gameStyleState:'profile',gameStyleKey:KEY_A,gameStyleIdentity:'1|1',gameStyleEffectivePrefs:eff({})});await w(100);
 const text='今日は晴れです';b.galStatus({hookActive:true,hookSource:text,hookSequence:1});await w(400);
 const place=()=>{b.textPlaceMode({on:true});b.textPlaceAnchor(true);b.textPlace({text,client:[W*dpr,H*dpr],rects:[...text].map((c,i)=>[(300+i*36)*dpr,(420)*dpr,36*dpr,36*dpr])});};
 place();await frames();await w(200);
 const tok=()=>{const r=document.querySelector('.sentence-text .char-token')?.getBoundingClientRect();return r?[Math.round(r.left),Math.round(r.top)]:null;};
 out.anchored=document.body.classList.contains('megulit-anchored');const p0=tok();out.p0=p0;
 const r0=document.querySelector('.sentence-text .char-token').getBoundingClientRect();
 const T={inkLeft:r0.left*dpr+4,inkTop:r0.top*dpr+6,width:W*dpr,height:H*dpr};out.first=await b.alignToGameInk(T);await frames();const pr0=b.galPreferences();out.cal1={pos:tok(),prefs:[pr0.anchorDX,pr0.anchorDY]};
 out.aligned=await b.alignToGameInk({...T,inkLeft:T.inkLeft+30*dpr,inkTop:T.inkTop-100*dpr});await frames();
 const pr=()=>{const p=b.galPreferences();return [p.anchorDX,p.anchorDY,p.x,p.y];};out.afterCal={pos:tok(),prefs:pr()};
 b.toggleGalMenu();await w(400);const d=document.querySelector('.tomoyo-cn-dialog[open]');d.querySelector('[data-menu-key=calibrate]').click();await w(300);
 const q=s=>d.querySelector(s),y=q('[name=galY]');out.fieldY=Number(y.value);y.value=String(Number(y.value)+2);y.dispatchEvent(new Event('input',{bubbles:true}));await frames();await w(100);out.afterSlider={pos:tok(),prefs:pr()};
 const saveProfile=b.saveGameProfileFromMenu;let saved=null;b.saveGameProfileFromMenu=p=>{saved=[p.anchorDX,p.anchorDY];return true;};q('[data-gal-anchor-reset]').click();await frames();await w(100);out.afterReset={pos:tok(),prefs:pr(),saved,field:Number(y.value)};
 b.saveGameProfileFromMenu=saveProfile;d.close?.();await w(200);
 b.gameStyleStatus({gameStyleState:'profile',gameStyleKey:KEY_B,gameStyleIdentity:'2|2',gameStyleEffectivePrefs:eff({})});place();await frames();await w(200);out.gameB={pos:tok(),prefs:pr()};
 b.gameStyleStatus({gameStyleState:'profile',gameStyleKey:KEY_A,gameStyleIdentity:'3|3',gameStyleEffectivePrefs:eff({anchorDX:4,anchorDY:-10})});place();await frames();await w(200);out.backA={pos:tok(),prefs:pr()};
 b.toggleGalMenu();await w(350);
 const reopened=document.querySelector('.tomoyo-cn-dialog[open]');
 reopened.querySelector('[data-menu-key=calibrate]').click();await w(150);
 const requests=[],transport=window.__tomoyoTranslateRequest;
 window.__tomoyoTranslateRequest=raw=>{requests.push(JSON.parse(raw));return transport(raw);};
 reopened.querySelector('[data-game-style-sync]').click();await frames();
 out.click=requests.map(r=>r.type);const start=requests.find(r=>r.type==='gameStyleSync');
 b.gameStyleStatus({gameStyleState:'measured',gameStyleKey:KEY_A,gameStyleOwner:start.owner,gameStylePurpose:start.part,gameStyle:{width:W,height:H,inkLeft:300,inkTop:420,style:{x:16,y:40,width:45,textColor:'#f2f2f2'}}});
 await w(1000);reopened.querySelector('footer button[type=submit]').click();await frames();
 out.confirm=requests.filter(r=>r.type==='gameStyleConfirm').map(r=>[r.key,r.prefs.textColor]);
 window.__tomoyoTranslateRequest=transport;
 out.W=W;out.H=H;return out;})()`;
test('anchored chain: calibrate -> slider -> 回到游戏原字位置 -> another game -> back',{skip:!hasEdge&&'Edge not installed',timeout:120000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-anchor-chain-'));let server,cdp;
 try{server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  const url=`http://127.0.0.1:${server.address().port}/reader/index.html`;
  const navigation=await cdp.send('Page.navigate',{url});
  assert.ok(!navigation.errorText,`Reader navigation failed (${navigation.errorText})`);
  let state;
  for(const deadline=Date.now()+45000;Date.now()<deadline;){
   state=await cdp.evaluate(`({href:location.href,readyState:document.readyState,ready:!!window.__TOME_READER_READY__,error:document.querySelector('#reader-status')?.textContent||''})`).catch(()=>null);
   if(state?.href===url&&(state.ready||state.error))break;
   await sleep(100);
  }
  assert.equal(state?.ready,true,`reader page loaded (${JSON.stringify(state)})`);
  await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');setTimeout(()=>dispatchEvent(new CustomEvent('tome-region-applied',{detail:{surfaceWidth:innerWidth*devicePixelRatio,surfaceHeight:innerHeight*devicePixelRatio}})),0);return 1})()`);
  await sleep(1500);const s=await cdp.evaluate(PROBE);console.log(JSON.stringify(s));
  const near=(a,b,tol,msg)=>assert.ok(a&&Math.abs(a[0]-b[0])<=tol&&Math.abs(a[1]-b[1])<=tol,msg+' '+JSON.stringify([a,b]));
  assert.ok(s.anchored,'the line sits on engine places');near(s.p0,[300,420],2,'on the engine first glyph');
  assert.equal(s.first,true);assert.equal(s.aligned,true,'calibration converged');
  near(s.afterCal.pos,[s.cal1.pos[0]+30,s.cal1.pos[1]-100],3,'the game ink 30 px right / 100 px up: the line follows it');
  assert.ok(Math.abs(s.afterCal.prefs[0]-s.cal1.prefs[0]-30*100/s.W)<0.25&&Math.abs(s.afterCal.prefs[1]-s.cal1.prefs[1]+100*100/s.H)<0.25,'as the offset '+s.afterCal.prefs);
  assert.deepEqual(s.afterCal.prefs.slice(2),[20,76],'the box x/y is left alone');
  assert.ok(Math.abs(s.fieldY-s.afterCal.prefs[1])<0.2,'the 上边距 field shows the offset');
  near(s.afterSlider.pos,[s.afterCal.pos[0],s.afterCal.pos[1]+2*s.H/100],3,'the slider moves it by 2 %');
  near(s.afterReset.pos,s.p0,2,'回到游戏原字位置: on the engine place');assert.deepEqual(s.afterReset.saved,[0,0]);assert.equal(s.afterReset.field,0);
  near(s.gameB.pos,s.p0,2,'another game starts on its engine place');assert.deepEqual(s.gameB.prefs.slice(0,2),[0,0]);
  near(s.backA.pos,[s.p0[0]+4*s.W/100,s.p0[1]-10*s.H/100],3,'back to the first game: its saved offset');
  assert.ok(s.click.includes('gameStyleSync'));assert.ok(!s.click.includes('gameStyleConfirm'),'measuring must not save the previous settings');
  assert.deepEqual(s.confirm,[['a'.repeat(64),'#f2f2f2']],'explicit save commits the measured preview once');
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
