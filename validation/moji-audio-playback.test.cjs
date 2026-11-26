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
 const pendingAudio = [];
 const bootErrors = [];
 let nextAudioMode = 'resolve';
 let dictCalls = 0;
 window.addEventListener('error', e => bootErrors.push(String(e?.message || e)));
 window.addEventListener('unhandledrejection', e => bootErrors.push(String(e?.reason?.message || e?.reason || e)));
 window.__testState = {
  audios,
  pendingAudio,
  bootErrors,
  get dictCalls(){ return dictCalls; },
  setAudioMode(m){ nextAudioMode = m; },
  activeAudios(){ return audios.filter(a => a.played && !a.paused); }
 };
 class FakeAudio {
  constructor(src){
   this.src = src;
   this.played = false;
   this.paused = true;
   audios.push(this);
  }
  addEventListener(){}
  play(){
   if (this.src === 'fail://play') return Promise.reject(new Error('PLAY_FAIL'));
   this.played = true;
   this.paused = false;
   return Promise.resolve();
  }
  pause(){ this.paused = true; }
 }
 window.Audio = FakeAudio;
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
   case 'moji_status':
    return {signedIn:false};
   case 'unknown_words':
   case 'vocabulary':
   case 'jp_auto_notices':
    return [];
   case 'dictionary':
    dictCalls++;
    return [
     {id:'w1',spelling:'食べる',reading:'たべる',pron:'たべる',definition:'吃'},
     {id:'w2',spelling:'飲む',reading:'のむ',pron:'のむ',definition:'喝'}
    ];
   case 'moji_word':
    return {meanings:[{zh:req.id==='w1'?'吃':'喝'}],comments:[],notes:[]};
   case 'moji_audio':
    if (nextAudioMode === 'defer') {
     return new Promise((resolve, reject) => pendingAudio.push({id:req.id, resolve, reject}));
    }
    if (nextAudioMode === 'play-fail') return {audio:'fail://play'};
    return {audio:'data:audio/mpeg;base64,' + req.id};
   default:
    return {};
  }
 };
})();
</script>`;

function startAppServer(webDir){
 const indexHtml=fs.readFileSync(path.join(webDir,'index.html'),'utf8');
 const testHtml=indexHtml.replace('<script type="module" src="app.js"></script>',HARNESS_SCRIPT+'\n  <script type="module" src="app.js"></script>');
 const server=http.createServer((req,res)=>{
  const urlPath=(req.url||'/').split('?')[0];
  if(urlPath==='/__test-dict.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(testHtml);return;}
  const file=path.join(webDir,urlPath.replace(/^\/+/,''));
  if(!file.startsWith(webDir)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
 });
 return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}

test('MOJi dictionary audio stops previous playback, drops stale responses, and stops on new search',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-moji-audio-'));
 let server,browser;
 t.after(async()=>{
  await browser?.stop();
  server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 server=await startAppServer(path.join(__dirname,'..','web'));
 browser=await startEdge(path.join(root,'edge'));
 const origin='http://127.0.0.1:'+server.address().port;

 await browser.send('Page.navigate',{url:origin+'/__test-dict.html'});
 const bootDeadline=Date.now()+30000;
 let booted=false,lastState=null;
 while(Date.now()<bootDeadline){
  try{
   lastState=await browser.evaluate(`({path:location.pathname,readyState:document.readyState,ready:!!window.__TOME_READY__,hasTest:!!window.__megulitTest,errors:(window.__testState?.bootErrors||[]).slice(0,5)})`);
   if(lastState.path==='/__test-dict.html'&&lastState.readyState==='complete'&&lastState.ready&&lastState.hasTest){booted=true;break;}
  }catch(e){lastState={evalError:String(e?.message||e)};}
  await new Promise(r=>setTimeout(r,50));
 }
 assert.equal(booted,true,'dict test page did not finish booting within 30s: '+JSON.stringify(lastState));

 const report=await browser.evaluate(`(async()=>{
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, label = 'condition', ms = 20000) => {
   const end = Date.now() + ms;
   while (Date.now() < end) { const v = fn(); if (v) return v; await wait(20); }
   throw new Error('TIMEOUT: ' + label);
  };
  await waitFor(() => window.__TOME_READY__ && window.__megulitTest, 'app ready');
  await window.__megulitTest.navigate('learning', 'dictionary');
  const openResults = async q => {
   const input = await waitFor(() => document.querySelector('#lookup-input'), 'lookup input');
   const form = document.querySelector('#lookup-form');
   const before = window.__testState.dictCalls;
   input.value = q;
   form.requestSubmit(form.querySelector('button[value=moji]'));
   await waitFor(() => window.__testState.dictCalls > before && document.querySelector('.esr-d [data-play]'), 'dictionary results for ' + q);
  };
  const selectRow = async key => {
   const row = await waitFor(() => document.querySelector('.esr-row[data-key="' + key + '"]'), 'row ' + key);
   row.click();
   await waitFor(() => row.classList.contains('is-cur') && document.querySelector('.esr-d [data-play]:not([disabled])'), 'selected row ' + key);
  };
  const clickPlay = async ({expectToast = false} = {}) => {
   const btn = await waitFor(() => document.querySelector('.esr-d [data-play]:not([disabled])'), 'play button');
   const beforeAudios = window.__testState.audios.length;
   btn.click();
   if (expectToast) {
    await waitFor(() => toastEl().classList.contains('visible'), 'error toast');
   } else {
    await waitFor(() => window.__testState.audios.length > beforeAudios && !window.__testState.audios.at(-1).paused, 'audio playing');
   }
  };
  const toastEl = () => document.querySelector('#toast');
  const clearToast = () => { const el = toastEl(); el.textContent = ''; el.classList.remove('visible'); };

  await openResults('食べる');

  // 1. Cross-entry rapid clicks pause previous audio before starting the new one
  await clickPlay();
  const a1 = window.__testState.audios.at(-1);
  await selectRow(1);
  await clickPlay();
  const a2 = window.__testState.audios.at(-1);
  const step1 = {a1Paused: a1.paused, a2Paused: a2.paused, activeCount: window.__testState.activeAudios().length};

  // 2. Slow out-of-order responses (resolve and reject) are discarded without playing or toasting
  window.__testState.setAudioMode('defer');
  await selectRow(0);
  document.querySelector('.esr-d [data-play]').click();
  await waitFor(() => window.__testState.pendingAudio.length === 1, 'first deferred audio');
  const slowOk = window.__testState.pendingAudio.shift();
  const a2PausedOnNewReq = a2.paused;

  await selectRow(1);
  document.querySelector('.esr-d [data-play]').click();
  await waitFor(() => window.__testState.pendingAudio.length === 1, 'second deferred audio');
  const slowErr = window.__testState.pendingAudio.shift();

  window.__testState.setAudioMode('resolve');
  await selectRow(0);
  await clickPlay();
  const a3 = window.__testState.audios.at(-1);
  const countBeforeStale = window.__testState.audios.length;
  clearToast();
  slowOk.resolve({audio:'data:audio/mpeg;base64,stale-ok'});
  slowErr.reject(new Error('STALE_FAIL'));
  await wait(40);
  const step2 = {
   a2PausedOnNewReq,
   createdAfterStale: window.__testState.audios.length - countBeforeStale,
   a3Paused: a3.paused,
   activeCount: window.__testState.activeAudios().length,
   staleToast: toastEl().textContent
  };

  // 3. Re-searching pauses currently playing audio
  await openResults('飲む');
  await waitFor(() => a3.paused, 'a3 paused after search');
  const step3 = {a3PausedAfterSearch: a3.paused, activeCount: window.__testState.activeAudios().length};

  // 4. Current playback failure still shows the error toast
  clearToast();
  window.__testState.setAudioMode('play-fail');
  await clickPlay({expectToast: true});
  const step4 = {errorToast: toastEl().textContent, toastVisible: toastEl().classList.contains('visible')};

  return {step1, step2, step3, step4};
 })()`);

 assert.equal(report.step1.a1Paused,true,'first audio must pause when second entry plays');
 assert.equal(report.step1.a2Paused,false,'second audio must be playing');
 assert.equal(report.step1.activeCount,1);

 assert.equal(report.step2.a2PausedOnNewReq,true,'starting a new request pauses previous audio');
 assert.equal(report.step2.createdAfterStale,0,'stale resolved response must not construct or play Audio');
 assert.equal(report.step2.a3Paused,false,'latest audio must keep playing');
 assert.equal(report.step2.activeCount,1);
 assert.equal(report.step2.staleToast,'','stale rejected response must not toast');

 assert.equal(report.step3.a3PausedAfterSearch,true,'re-searching pauses active playback');
 assert.equal(report.step3.activeCount,0);

 assert.equal(report.step4.errorToast,'发音暂时无法播放');
 assert.equal(report.step4.toastVisible,true);
});
