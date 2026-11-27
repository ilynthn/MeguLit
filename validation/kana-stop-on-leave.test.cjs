// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),os=require('node:os'),path=require('node:path');
const {startEdge}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};

const HARNESS_SCRIPT=`<script>
(() => {
 const audios = [];
 const pendingSpeak = [];
 const saves = [];
 const spokenSystem = [];
 let speakMode = 'defer';
 let speakCalls = 0;
 window.__kanaTest = {
  audios,
  pendingSpeak,
  saves,
  spokenSystem,
  get speakCalls(){ return speakCalls; },
  setSpeakMode(m){ speakMode = m; },
  activeAudios(){ return audios.filter(a => a.played && !a.paused); }
 };
 class FakeAudio {
  constructor(src){
   this.src = src;
   this.volume = 1;
   this.played = false;
   this.paused = true;
   audios.push(this);
  }
  play(){
   this.played = true;
   this.paused = false;
   return Promise.resolve();
  }
  pause(){ this.paused = true; }
 }
 window.Audio = FakeAudio;
 try {
  Object.defineProperty(window, 'speechSynthesis', {
   configurable: true,
   value: { cancel(){}, speak(u){ spokenSystem.push(u.text); } }
  });
 } catch {}
 const wav = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
 window.__TOME_TEST_TRANSPORT__ = async (command, args = {}) => {
  if (command !== 'service') return null;
  const req = args.request || {};
  switch (req.action) {
   case 'ui_state':
   case 'preserve_ui':
    return {};
   case 'home':
    return {games:[],stats:{readingSeconds:0,words:0,lookups:0},preferences:{language:'zh',accent:'#ad1539',theme:'dark'}};
   case 'update_required_status':
    return null;
   case 'learning_level':
    return {level:'N3',asked:true};
   case 'learning_goal':
    return {asked:true};
   case 'kana_progress':
    return {mastery:{},boxes:{},runs:[],applied:[],lessons:{},prefs:{volume:0.4,voice:'ai'}};
   case 'kana_progress_save':
    saves.push(req.data);
    return {saved:true};
   case 'kana_game_words':
    return {words:{}};
   case 'kana_speak':
    speakCalls++;
    if (speakMode === 'defer') {
     return new Promise((resolve, reject) => pendingSpeak.push({text:req.text, resolve:() => resolve({data:wav}), reject}));
    }
    if (speakMode === 'fail') return Promise.reject(new Error('AIVIS_NOT_READY'));
    return {data:wav};
   case 'unknown_words':
   case 'vocabulary':
   case 'jp_auto_notices':
    return [];
   default:
    return {};
  }
 };
})();
</script>`;

function startAppServer(webDir){
 // Exercise the real app and kana routing without waiting on the desktop page's unrelated styles and scripts.
 const testHtml=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body>
  <div id="app" aria-busy="true"></div><div id="toast" role="status" aria-live="polite"></div>
  ${HARNESS_SCRIPT}
  <script>import('./app.js').catch(error => { window.__kanaBootError = String(error); });</script>
 </body></html>`;
 const server=http.createServer((req,res)=>{
  const urlPath=(req.url||'/').split('?')[0];
  if(urlPath==='/__test-kana.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(testHtml);return;}
  const file=path.join(webDir,urlPath.replace(/^\/+/,''));
  if(!file.startsWith(webDir)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
 });
 return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}

test('kana speech.stop cancels in-flight kana_speak and leaving kana tab stops playback and flushes progress',{skip:!hasEdge,timeout:90000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-stop-'));
 let server,browser;
 t.after(async()=>{
  await browser?.stop();
  server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 server=await startAppServer(path.join(__dirname,'..','web'));
 browser=await startEdge(path.join(root,'edge'));
 const origin='http://127.0.0.1:'+server.address().port;

 const url=origin+'/__test-kana.html';
 const nav=await browser.send('Page.navigate',{url});
 assert.ok(!nav.errorText,`kana harness navigation failed (${nav.errorText})`);
 let readyState=null;
 for(const deadline=Date.now()+30000;Date.now()<deadline;){
  readyState=await browser.evaluate('({href:location.href,readyState:document.readyState,ready:!!window.__TOME_READY__,hasTest:!!window.__megulitTest,bootError:window.__kanaBootError,startupFailed:!!document.querySelector("#startup-retry")})').catch(()=>null);
  if(readyState?.href===url&&(readyState.bootError||(readyState.ready&&readyState.hasTest)))break;
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(readyState?.href===url&&readyState.ready&&readyState.hasTest,`kana harness ready: ${JSON.stringify(readyState)}`);

 const report=await browser.evaluate(`(async()=>{
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, label, ms = 15000) => {
   const end = Date.now() + ms;
   while (Date.now() < end) { const v = fn(); if (v) return v; await wait(20); }
   throw new Error('TIMEOUT: ' + label);
  };
  await window.__megulitTest.navigate('learning', 'kana');
  const shadow = () => document.querySelector('.kana-host')?.shadowRoot;
  await waitFor(() => shadow()?.querySelector('[data-voice="ai"]'), 'kana voice picker');

  // 1. Trigger in-flight kana_speak by clicking AI voice option, then switch internal view (show() -> speech.stop())
  const beforeCount = window.__kanaTest.audios.length;
  shadow().querySelector('[data-voice="ai"]').click();
  await waitFor(() => window.__kanaTest.pendingSpeak.length >= 1, 'pending kana_speak');
  const inflight = window.__kanaTest.pendingSpeak.shift();

  const navLink = shadow().querySelector('a[href="gojuon.html"], [data-go="gojuon.html"], a[href*="gojuon"]');
  navLink.click();
  await wait(40);
  inflight.resolve();
  await wait(40);
  const playedAfterSubviewSwitch = window.__kanaTest.audios.length - beforeCount;

  // 2. Start actual playback and modify volume (debounced 400ms save), then leave kana tab via navigate('home')
  window.__kanaTest.setSpeakMode('resolve');
  const ruler = await waitFor(() => shadow()?.querySelector('.kn-ruler'), 'volume ruler');
  const savesBefore = window.__kanaTest.saves.length;
  ruler.value = '60';
  ruler.dispatchEvent(new Event('input', {bubbles:true}));
  ruler.dispatchEvent(new Event('change', {bubbles:true}));
  await waitFor(() => window.__kanaTest.audios.length > beforeCount, 'playback start');
  const activeClip = window.__kanaTest.audios.at(-1);
  const playingBeforeLeave = activeClip.played && !activeClip.paused;

  await window.__megulitTest.navigate('home');
  await waitFor(() => activeClip.paused && window.__kanaTest.saves.length > savesBefore, 'leave kana pause and flush', 250).catch(() => {});
  const pausedAfterLeave = activeClip.paused;
  const flushedImmediately = window.__kanaTest.saves.length > savesBefore;

  return {playedAfterSubviewSwitch, playingBeforeLeave, pausedAfterLeave, flushedImmediately};
 })()`);

 assert.equal(report.playedAfterSubviewSwitch,0,'switching kana view must cancel in-flight kana_speak so it never plays late');
 assert.equal(report.playingBeforeLeave,true);
 assert.equal(report.pausedAfterLeave,true,'leaving kana tab must pause active playback immediately');
 assert.equal(report.flushedImmediately,true,'leaving kana tab must flush pending kana progress immediately');
});
