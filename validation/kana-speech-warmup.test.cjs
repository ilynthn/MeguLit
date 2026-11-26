// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),os=require('node:os'),path=require('node:path');
const {startEdge}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};

function startHarness(webDir){
 const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="host"></div></body></html>';
 const server=http.createServer((req,res)=>{
  const urlPath=(req.url||'/').split('?')[0];
  if(urlPath==='/__test.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);return;}
  const file=path.join(webDir,urlPath.replace(/^\/+/,''));
  if(!file.startsWith(webDir)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
 });
 return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}

test('kana module does not warm up AivisSpeech in recorded-voice modes or after unmount, but still warms up in AI mode',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-kana-warm-'));
 let server,browser;
 t.after(async()=>{
  await browser?.stop();
  server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 server=await startHarness(path.join(__dirname,'..','web'));
 browser=await startEdge(path.join(root,'edge'));
 const url='http://127.0.0.1:'+server.address().port+'/__test.html';
 const nav=await browser.send('Page.navigate',{url});
 assert.ok(!nav.errorText,`Harness navigation failed (${nav.errorText})`);
 let ready=false;
 for(let end=Date.now()+20000;Date.now()<end&&!ready;){
  ready=await browser.evaluate(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'&&!!document.getElementById('host')`).catch(()=>false);
  if(!ready)await new Promise(r=>setTimeout(r,50));
 }
 assert.ok(ready,'harness page loaded');

 const out=await browser.evaluate(`(async()=>{
  const {mountKana}=await import('/kana/kana.js');
  const wav='UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  const realSetTimeout=window.setTimeout.bind(window);
  const runCase=async(prefs,{start='gojuon',unmountEarly=false,unmountOnFirstSpeak=false}={})=>{
   const host=document.getElementById('host');
   host.innerHTML='';
   const calls=[],timers=[];
   let firstSpeakDone=null;
   const firstSpeak=new Promise(r=>{firstSpeakDone=r;});
   const api=async(action,req)=>{
    calls.push({action,req});
    if(action==='kana_progress')return {mastery:{},boxes:{},runs:[],applied:[],lessons:{},prefs};
    if(action==='kana_game_words')return {words:{}};
    if(action==='kana_speak'){
     if(unmountOnFirstSpeak){host.innerHTML='';await new Promise(r=>realSetTimeout(r,20));firstSpeakDone();}
     return {data:wav};
    }
    return {};
   };
   // Hold warmup timers scheduled inside mountKana so slow module import cannot fire them before unmountEarly runs.
   window.setTimeout=(fn,ms,...args)=>{
    if(Number(ms)>=50){timers.push(()=>fn(...args));return timers.length;}
    return realSetTimeout(fn,ms,...args);
   };
   try{
    await mountKana(host,{api,start});
   }finally{
    window.setTimeout=realSetTimeout;
   }
   if(unmountEarly)host.innerHTML='';
   if(unmountOnFirstSpeak)await Promise.race([firstSpeak,new Promise(r=>realSetTimeout(r,5000))]);
   for(const fire of timers)fire();
   await new Promise(r=>realSetTimeout(r,60));
   return calls.filter(c=>c.action==='kana_speak').map(c=>c.req.text);
  };
  const femaleDefault=await runCase({volume:0.4});
  const maleVoice=await runCase({volume:0.4,voice:'male'});
  const aiUnmounted=await runCase({volume:0.4,voice:'ai'},{start:'index',unmountEarly:true});
  const aiPrefetchAborted=await runCase({volume:0.4,voice:'ai'},{start:'gojuon',unmountOnFirstSpeak:true});
  const aiVoice=await runCase({volume:0.4,voice:'ai'},{start:'index'});
  return {femaleDefault,maleVoice,aiUnmounted,aiPrefetchAborted,aiVoice};
 })()`);

 assert.deepEqual(out.femaleDefault,[],'default female recorded voice must not trigger kana_speak warmup');
 assert.deepEqual(out.maleVoice,[],'male recorded voice must not trigger kana_speak warmup');
 assert.deepEqual(out.aiUnmounted,[],'leaving kana page before warmup timer fires must not trigger kana_speak');
 assert.equal(out.aiPrefetchAborted.length,1,'prefetch loop must stop after kana page unmounts');
 assert.deepEqual(out.aiVoice,['あ'],'AI voice mode still warms up AivisSpeech');
});
