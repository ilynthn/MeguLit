// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),os=require('node:os'),path=require('node:path');
const {startEdge}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};

function startHarness(webDir){
 const indexHtml=fs.readFileSync(path.join(webDir,'index.html'),'utf8');
 const links=[...indexHtml.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)">/g)].map(m=>m[0]).join('\n');
 const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark">${links}</head><body><div id="main" class="main"><div id="target"></div></div></body></html>`;
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

test('sentence list play button expands on a single line for game voice and CV? badge without overflowing',{skip:!hasEdge,timeout:90000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-slist-btn-'));
 let server,browser;
 t.after(async()=>{
  await browser?.stop();
  server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 server=await startHarness(path.join(__dirname,'..','web'));
 browser=await startEdge(path.join(root,'edge'));
 const origin='http://127.0.0.1:'+server.address().port;

 for(const [lang,locale,expectedWord] of [['zh-CN','zh','原声'],['ja','ja','原音声'],['en','en','Game voice']]){
  const url=`${origin}/__test.html?locale=${locale}`;
  const nav=await browser.send('Page.navigate',{url});
  assert.ok(!nav.errorText,`${locale} navigation failed (${nav.errorText})`);
  let pageState=null;
  for(const deadline=Date.now()+30000;Date.now()<deadline;){
   pageState=await browser.evaluate('({href:location.href,ready:document.readyState,target:!!document.getElementById("target")})').catch(()=>null);
   if(pageState?.href===url&&pageState.ready==='complete'&&pageState.target)break;
   await new Promise(r=>setTimeout(r,50));
  }
  assert.ok(pageState?.href===url&&pageState.ready==='complete'&&pageState.target,`${locale} harness page ready: ${JSON.stringify(pageState)}`);
  const rows=await browser.evaluate(`(async()=>{
   document.documentElement.lang=${JSON.stringify(lang)};
   if(document.fonts?.ready)await document.fonts.ready;
   const {mountSentences}=await import('/sentences-page.js');
   const wav='UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
   HTMLMediaElement.prototype.play=()=>Promise.resolve();
   const sentences=[
    {id:1,game_id:'g1',title:'Sample',text:'「こんにちは。」',translation:'你好。',source:'manual',created_at:1700000000},
    {id:2,game_id:'g1',title:'Sample',text:'「ありがとう。」',translation:'谢谢。',source:'manual',created_at:1700000001},
    {id:3,game_id:'g1',title:'Sample',text:'静かな夜。',translation:'静夜。',source:'auto',created_at:1700000002},
   ];
   const api=async(action,req)=>{
    if(action==='sentences')return sentences;
    if(action==='sentence_voice_has')return {has:[]};
    if(action==='sentence_voice'){
     if(req.id===1)return {data:wav,mime:'audio/wav',source:'game',estimated:false};
     if(req.id===2)return {data:wav,mime:'audio/wav',source:'game',estimated:true};
     return {data:wav,mime:'audio/wav',source:'synthesized'};
    }
    return {};
   };
   const target=document.getElementById('target');
   await mountSentences(target,{
    api,locale:${JSON.stringify(locale)},esc:String,toast:()=>{},errorMessage:String,empty:()=>'',emptyLabel:'',
    readTime:()=>'1h',datetime:()=>'2026-11-26',icon:()=>'<svg class="icon" viewBox="0 0 16 16"></svg>',
    isCurrent:()=>true,rerender:()=>{},lookup:()=>{},openGame:()=>{},games:[{id:'g1',title:'Sample'}],cover:()=>''
   });
   const list=target.querySelector('.sp-all');
   const btns=[1,2,3].map(id=>list.querySelector('[data-sentence-play="'+id+'"]'));
   for(const b of btns){
    b.click();
    for(const deadline=Date.now()+15000;Date.now()<deadline&&b.getAttribute('aria-busy')==='true';){
     await new Promise(r=>setTimeout(r,20));
    }
    if(b.getAttribute('aria-busy')==='true')throw new Error('sentence play timed out for id='+b.dataset.sentencePlay);
   }
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   return btns.map(b=>{
    const del=b.parentElement.querySelector('[data-sentence-delete]');
    const r=b.getBoundingClientRect(),dr=del.getBoundingClientRect();
    return {
     id:Number(b.dataset.sentencePlay),text:b.textContent,game:b.classList.contains('is-game-voice'),
     width:Math.round(r.width),height:Math.round(r.height),
     scrollWidth:b.scrollWidth,clientWidth:b.clientWidth,
     scrollHeight:b.scrollHeight,clientHeight:b.clientHeight,
     overlapsDelete:r.right>dr.left+0.5,whiteSpace:getComputedStyle(b).whiteSpace
    };
   });
  })()`);

  const [exact,estimated,synth]=rows;
  assert.equal(exact.game,true,`${locale} exact game voice marks button`);
  assert.equal(exact.text,expectedWord);
  assert.equal(exact.height,30,`${locale} exact button stays 30px tall`);
  assert.ok(exact.scrollWidth<=exact.clientWidth+1,`${locale} exact button must not overflow horizontally (${exact.scrollWidth}>${exact.clientWidth})`);
  assert.ok(exact.scrollHeight<=exact.clientHeight+1,`${locale} exact button must not overflow vertically (${exact.scrollHeight}>${exact.clientHeight})`);
  assert.equal(exact.overlapsDelete,false);
  assert.equal(exact.whiteSpace,'nowrap');

  assert.equal(estimated.game,true,`${locale} estimated game voice marks button`);
  assert.equal(estimated.text,expectedWord+'CV?');
  assert.equal(estimated.height,30,`${locale} estimated button stays 30px tall`);
  assert.ok(estimated.scrollWidth<=estimated.clientWidth+1,`${locale} estimated button must not overflow horizontally (${estimated.scrollWidth}>${estimated.clientWidth})`);
  assert.ok(estimated.scrollHeight<=estimated.clientHeight+1,`${locale} estimated button must not overflow vertically (${estimated.scrollHeight}>${estimated.clientHeight})`);
  assert.equal(estimated.overlapsDelete,false);

  assert.equal(synth.game,false,`${locale} synthesized row keeps compact icon button`);
  assert.equal(synth.text,'▶');
  assert.equal(synth.width,30);
  assert.equal(synth.height,30);
 }
});
