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
 const pendingDict = [];
 const bootErrors = [];
 let audioMode = 'resolve';
 let dictMode = 'resolve';
 let dictCalls = 0;
 window.addEventListener('error', e => bootErrors.push(String(e?.message || e)));
 window.addEventListener('unhandledrejection', e => bootErrors.push(String(e?.reason?.message || e?.reason || e)));
 window.__dictStopTest = {
  audios,
  pendingAudio,
  pendingDict,
  bootErrors,
  get dictCalls(){ return dictCalls; },
  setAudioMode(m){ audioMode = m; },
  setDictMode(m){ dictMode = m; },
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
  play(){ this.played = true; this.paused = false; return Promise.resolve(); }
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
   case 'study_words':
    return {words:[],lookupOnly:[],counts:{total:0,byStatus:{}}};
   case 'unknown_words':
   case 'vocabulary':
   case 'jp_auto_notices':
    return [];
   case 'dictionary':
    dictCalls++;
    if (dictMode === 'defer') {
     return new Promise((resolve, reject) => pendingDict.push({query:req.query, source:req.source, resolve, reject}));
    }
    if (dictMode === 'fail') return Promise.reject(new Error('DICT_DOWN'));
    return [{id:'w1',spelling:'食べる',reading:'たべる',pron:'たべる',definition:'吃'}];
   case 'moji_word':
    return {meanings:[{zh:'吃'}],comments:[],notes:[]};
   case 'moji_audio':
    if (audioMode === 'defer') {
     return new Promise((resolve, reject) => pendingAudio.push({id:req.id, resolve, reject}));
    }
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
  if(urlPath==='/__test-dict-stop.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(testHtml);return;}
  const file=path.join(webDir,urlPath.replace(/^\/+/,''));
  if(!file.startsWith(webDir)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
 });
 return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}

test('MOJi dictionary audio stops on clearing search, while new search is pending/failing, and on leaving dictionary page',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-moji-stop-'));
 let server,browser;
 t.after(async()=>{
  await browser?.stop();
  server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 server=await startAppServer(path.join(__dirname,'..','web'));
 browser=await startEdge(path.join(root,'edge'));
 const origin='http://127.0.0.1:'+server.address().port;

 await browser.send('Page.navigate',{url:origin+'/__test-dict-stop.html'});
 const bootDeadline=Date.now()+30000;
 let booted=false,lastState=null;
 while(Date.now()<bootDeadline){
  try{
   lastState=await browser.evaluate(`({path:location.pathname,readyState:document.readyState,ready:!!window.__TOME_READY__,hasTest:!!window.__megulitTest,errors:(window.__dictStopTest?.bootErrors||[]).slice(0,5)})`);
   if(lastState.path==='/__test-dict-stop.html'&&lastState.readyState==='complete'&&lastState.ready&&lastState.hasTest){booted=true;break;}
  }catch(e){lastState={evalError:String(e?.message||e)};}
  await new Promise(r=>setTimeout(r,50));
 }
 assert.equal(booted,true,'dict stop test page did not finish booting within 30s: '+JSON.stringify(lastState));

 const report=await browser.evaluate(`(async()=>{
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, label = 'condition', ms = 20000) => {
   const end = Date.now() + ms;
   while (Date.now() < end) { const v = fn(); if (v) return v; await wait(20); }
   throw new Error('TIMEOUT: ' + label);
  };
  const toastEl = () => document.querySelector('#toast');
  const clearToast = () => { const el = toastEl(); el.textContent = ''; el.classList.remove('visible'); };
  const openDictAndPlay = async () => {
   window.__dictStopTest.setDictMode('resolve');
   window.__dictStopTest.setAudioMode('resolve');
   await window.__megulitTest.navigate('learning', 'dictionary');
   const input = await waitFor(() => document.querySelector('#lookup-input'), 'lookup input');
   const form = document.querySelector('#lookup-form');
   const beforeDict = window.__dictStopTest.dictCalls;
   input.value = '食べる';
   form.requestSubmit(form.querySelector('button[value=moji]'));
   await waitFor(() => window.__dictStopTest.dictCalls > beforeDict && document.querySelector('.esr-d [data-play]:not([disabled])'), 'play button');
   const beforeAudios = window.__dictStopTest.audios.length;
   document.querySelector('.esr-d [data-play]').click();
   await waitFor(() => window.__dictStopTest.audios.length > beforeAudios && !window.__dictStopTest.audios.at(-1).paused, 'audio playing');
   return {input, form, audio: window.__dictStopTest.audios.at(-1)};
  };

  // 1. Clearing the search box pauses playing MOJi audio immediately
  const s1 = await openDictAndPlay();
  s1.input.value = '';
  s1.input.dispatchEvent(new Event('input', {bubbles:true}));
  const pausedOnClear = s1.audio.paused;

  // 2. Submitting a new search pauses playing MOJi audio immediately while still pending (and stays paused if search fails)
  const s2 = await openDictAndPlay();
  window.__dictStopTest.setDictMode('defer');
  s2.input.value = '飲む';
  s2.form.requestSubmit(s2.form.querySelector('button[value=moji]'));
  await waitFor(() => window.__dictStopTest.pendingDict.length >= 1, 'deferred search');
  const pausedWhileSearchPending = s2.audio.paused;
  window.__dictStopTest.setDictMode('fail');
  window.__dictStopTest.pendingDict.shift().reject(new Error('DICT_DOWN'));
  await wait(40);
  const pausedAfterSearchFailed = s2.audio.paused;

  // 3. Leaving dictionary page (navigate to home / another tab) pauses playing MOJi audio
  const s3 = await openDictAndPlay();
  await window.__megulitTest.navigate('home');
  await wait(30);
  const pausedOnLeaveHome = s3.audio.paused;

  const s3b = await openDictAndPlay();
  await window.__megulitTest.navigate('learning', 'words');
  await wait(30);
  const pausedOnLeaveSubtab = s3b.audio.paused;

  // 4. In-flight moji_audio resolving or rejecting after leaving dictionary page does not play or show stale toast
  window.__dictStopTest.setDictMode('resolve');
  window.__dictStopTest.setAudioMode('defer');
  await window.__megulitTest.navigate('learning', 'dictionary');
  const in4 = await waitFor(() => document.querySelector('#lookup-input'), 'lookup input 4');
  const form4 = document.querySelector('#lookup-form');
  const beforeDict4 = window.__dictStopTest.dictCalls;
  in4.value = '食べる';
  form4.requestSubmit(form4.querySelector('button[value=moji]'));
  await waitFor(() => window.__dictStopTest.dictCalls > beforeDict4 && document.querySelector('.esr-d [data-play]'), 'play button 4');
  document.querySelector('.esr-d [data-play]').click();
  await waitFor(() => window.__dictStopTest.pendingAudio.length === 1, 'pending audio 4');
  const pendingOk = window.__dictStopTest.pendingAudio.shift();
  const countBeforeLeave4 = window.__dictStopTest.audios.length;
  clearToast();
  await window.__megulitTest.navigate('home');
  await wait(30);
  pendingOk.resolve({audio:'data:audio/mpeg;base64,late-ok'});
  await wait(40);
  const createdAfterLeaveOk = window.__dictStopTest.audios.length - countBeforeLeave4;

  // 5. Direct DOM detachment (!results.isConnected) without route cleanup also suppresses late playback and error toast
  window.__dictStopTest.setDictMode('resolve');
  window.__dictStopTest.setAudioMode('defer');
  await window.__megulitTest.navigate('learning', 'dictionary');
  const in5 = await waitFor(() => document.querySelector('#lookup-input'), 'lookup input 5');
  const form5 = document.querySelector('#lookup-form');
  const beforeDict5 = window.__dictStopTest.dictCalls;
  in5.value = '食べる';
  form5.requestSubmit(form5.querySelector('button[value=moji]'));
  await waitFor(() => window.__dictStopTest.dictCalls > beforeDict5 && document.querySelector('.esr-d [data-play]'), 'play button 5');
  document.querySelector('.esr-d [data-play]').click();
  await waitFor(() => window.__dictStopTest.pendingAudio.length === 1, 'pending audio 5a');
  const pendingDetachOk = window.__dictStopTest.pendingAudio.shift();
  const countBeforeDetach = window.__dictStopTest.audios.length;
  document.querySelector('#lookup-results').remove();
  pendingDetachOk.resolve({audio:'data:audio/mpeg;base64,detach-ok'});
  await wait(40);
  const createdAfterDetachOk = window.__dictStopTest.audios.length - countBeforeDetach;

  window.__dictStopTest.setDictMode('resolve');
  window.__dictStopTest.setAudioMode('defer');
  await window.__megulitTest.navigate('learning', 'dictionary');
  const in6 = await waitFor(() => document.querySelector('#lookup-input'), 'lookup input 6');
  const form6 = document.querySelector('#lookup-form');
  const beforeDict6 = window.__dictStopTest.dictCalls;
  in6.value = '食べる';
  form6.requestSubmit(form6.querySelector('button[value=moji]'));
  await waitFor(() => window.__dictStopTest.dictCalls > beforeDict6 && document.querySelector('.esr-d [data-play]'), 'play button 6');
  document.querySelector('.esr-d [data-play]').click();
  await waitFor(() => window.__dictStopTest.pendingAudio.length === 1, 'pending audio 6');
  const pendingDetachFail = window.__dictStopTest.pendingAudio.shift();
  clearToast();
  document.querySelector('#lookup-results').remove();
  pendingDetachFail.reject(new Error('LATE_AUDIO_FAIL'));
  await wait(40);
  const toastAfterDetachFail = toastEl().textContent;

  return {
   pausedOnClear,
   pausedWhileSearchPending,
   pausedAfterSearchFailed,
   pausedOnLeaveHome,
   pausedOnLeaveSubtab,
   createdAfterLeaveOk,
   createdAfterDetachOk,
   toastAfterDetachFail
  };
 })()`);

 assert.equal(report.pausedOnClear,true,'clearing search input must stop playing MOJi audio');
 assert.equal(report.pausedWhileSearchPending,true,'submitting a new search must stop playing MOJi audio immediately while pending');
 assert.equal(report.pausedAfterSearchFailed,true,'failed search must keep previous MOJi audio paused');
 assert.equal(report.pausedOnLeaveHome,true,'leaving dictionary page to home must stop playing MOJi audio');
 assert.equal(report.pausedOnLeaveSubtab,true,'switching from dictionary to another learning subtab must stop playing MOJi audio');
 assert.equal(report.createdAfterLeaveOk,0,'late moji_audio response after leaving dictionary must not play');
 assert.equal(report.createdAfterDetachOk,0,'late moji_audio response after results detach must not play');
 assert.equal(report.toastAfterDetachFail,'','late moji_audio failure after results detach must not show toast');
});
