// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),os=require('node:os'),path=require('node:path');
const {startEdge}=require('./library-views-perf.cjs');
const {Settings}=require('../services/settings.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};

function makeHarness(settingsData){
 return `<script>
(() => {
 const audios = [];
 const pendingPreview = [];
 const revoked = [];
 let previewMode = 'resolve';
 let blobSeq = 0;
 window.__speechLeaveTest = {
  audios,
  pendingPreview,
  revoked,
  setPreviewMode(m){ previewMode = m; }
 };
 URL.createObjectURL = () => 'blob:preview-' + (blobSeq++);
 URL.revokeObjectURL = u => revoked.push(u);
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
 const wav = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
 const settingsData = ${JSON.stringify(settingsData)};
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
   case 'settings_get':
    return settingsData;
   case 'speakers_cached':
   case 'speakers':
    return [{name:'まお',styles:[{id:888753760,name:'ノーマル'}]}];
   case 'pack_status':
    return {packs:[]};
   case 'reader_message':
    return {replies:[{method:'v4Deliver',args:[req.message?.id||1,{voices:[]},'']}]};
   case 'speech_preview':
    if (previewMode === 'defer') {
     return new Promise((resolve, reject) => pendingPreview.push({resolve:() => resolve({data:wav}), reject}));
    }
    return {data:wav};
   case 'jp_auto_notices':
   case 'unknown_words':
   case 'vocabulary':
    return [];
   default:
    return {};
  }
 };
})();
</script>`;
}

function startAppServer(webDir,settingsData){
 const indexHtml=fs.readFileSync(path.join(webDir,'index.html'),'utf8');
 const testHtml=indexHtml.replace('<script type="module" src="app.js"></script>',makeHarness(settingsData)+'\n  <script type="module" src="app.js"></script>');
 const server=http.createServer((req,res)=>{
  const urlPath=(req.url||'/').split('?')[0];
  if(urlPath==='/__test-settings.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(testHtml);return;}
  const file=path.join(webDir,urlPath.replace(/^\/+/,''));
  if(!file.startsWith(webDir)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
 });
 return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}

test('leaving Settings stops playing speech preview and cancels in-flight preview playback',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-settings-leave-'));
 let server,browser;
 t.after(async()=>{
  await browser?.stop();
  server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 const settingsData=new Settings(root).get('');
 server=await startAppServer(path.join(__dirname,'..','web'),settingsData);
 browser=await startEdge(path.join(root,'edge'));
 const origin='http://127.0.0.1:'+server.address().port;

 await browser.send('Page.navigate',{url:origin+'/__test-settings.html'});
 const bootDeadline=Date.now()+30000;
 let booted=false,lastState=null;
 while(Date.now()<bootDeadline){
  try{
   lastState=await browser.evaluate(`({path:location.pathname,readyState:document.readyState,ready:!!window.__TOME_READY__,hasTest:!!window.__megulitTest})`);
   if(lastState.path==='/__test-settings.html'&&lastState.readyState==='complete'&&lastState.ready&&lastState.hasTest){booted=true;break;}
  }catch(e){lastState={evalError:String(e?.message||e)};}
  await new Promise(r=>setTimeout(r,50));
 }
 assert.equal(booted,true,'settings test page did not finish booting within 30s: '+JSON.stringify(lastState));

 const report=await browser.evaluate(`(async()=>{
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, label = 'condition', ms = 20000) => {
   const end = Date.now() + ms;
   while (Date.now() < end) { const v = fn(); if (v) return v; await wait(20); }
   throw new Error('TIMEOUT: ' + label);
  };
  await waitFor(() => window.__TOME_READY__ && window.__megulitTest, 'app ready');
  localStorage.setItem('megulit-settings-section', 'speech');
  await window.__megulitTest.navigate('settings');
  const openSpeech = async () => {
   const navBtn = await waitFor(() => document.querySelector('[data-section="speech"]'), 'speech nav');
   if (!document.querySelector('[data-preview]')) navBtn.click();
   return waitFor(() => document.querySelector('[data-preview]'), 'preview button');
  };

  // 1. Playing preview audio pauses and revokes blob URL immediately upon leaving Settings
  const preview1 = await openSpeech();
  preview1.click();
  await waitFor(() => window.__speechLeaveTest.audios.length === 1, 'preview audio started');
  const a1 = window.__speechLeaveTest.audios[0];
  const playingBeforeLeave = a1.played && !a1.paused;

  await window.__megulitTest.navigate('home');
  await waitFor(() => a1.paused, 'paused after leave');
  const pausedAfterLeave = a1.paused;
  const revokedAfterLeave = window.__speechLeaveTest.revoked.includes(a1.src);

  // 2. In-flight speech_preview resolving after leaving Settings must not start playback
  await window.__megulitTest.navigate('settings');
  const preview2 = await openSpeech();
  window.__speechLeaveTest.setPreviewMode('defer');
  const countBeforeInflight = window.__speechLeaveTest.audios.length;
  preview2.click();
  await waitFor(() => window.__speechLeaveTest.pendingPreview.length === 1, 'pending preview');
  const inflight = window.__speechLeaveTest.pendingPreview.shift();

  await window.__megulitTest.navigate('home');
  await wait(40);
  inflight.resolve();
  await wait(40);
  const createdAfterLeave = window.__speechLeaveTest.audios.length - countBeforeInflight;

  return {playingBeforeLeave, pausedAfterLeave, revokedAfterLeave, createdAfterLeave};
 })()`);

 assert.equal(report.playingBeforeLeave,true);
 assert.equal(report.pausedAfterLeave,true,'leaving Settings must pause playing speech preview');
 assert.equal(report.revokedAfterLeave,true,'leaving Settings must revoke preview blob URL');
 assert.equal(report.createdAfterLeave,0,'in-flight speech preview resolving after leaving Settings must not play');
});
