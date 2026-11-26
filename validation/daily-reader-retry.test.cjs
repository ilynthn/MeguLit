// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));
test('switching back to translation retries an incomplete article without reopening it',{skip:!hasEdge},async t=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-daily-reader-'));
 let browser;t.after(async()=>{try{await browser?.stop();}finally{await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150});}});
 browser=await startEdge(profile);
 const source=fs.readFileSync(path.join(__dirname,'../web/daily-view.js'),'base64');
 const result=await browser.evaluate(`(async()=>{
  const {openReader}=await import('data:text/javascript;base64,${source}'),notices=[];
  let calls=0,loaded;
  const api=async cmd=>{
   if(cmd==='daily_article')return new Promise(resolve=>{loaded=resolve;});
   if(cmd==='daily_translate')return ++calls===1?{texts:['','Second'],error:'TRANSLATION_HTTP_429'}:{texts:['First','Second']};
  };
  const {close}=openReader({title:'Fixture',link:'https://example.org/news'},{api,locale:'en',esc:String,toast:t=>notices.push(t)});
  const mode=m=>document.querySelector('[data-rd-mode="'+m+'"]').click();
  const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('reader state timed out');};
  mode('tr');
  loaded({state:'ok',via:'direct',paragraphs:[{text:'一。'},{text:'二。'}]});
  await wait(()=>notices.length);
  await wait(()=>!document.querySelector('.rd-text').classList.contains('rd-swap'));
  const initialCalls=calls;
  mode('ja');await wait(()=>document.querySelector('.rd-text').dataset.mode==='ja');
  mode('tr');await wait(()=>document.querySelector('.rd-tr')?.textContent==='First');
  const lines=[...document.querySelectorAll('.rd-tr')].map(p=>p.textContent);
  close();return {lines,calls,initialCalls,notices:notices.length};
 })()`);
 assert.deepEqual(result,{lines:['First','Second'],calls:2,initialCalls:1,notices:1});
});

test('daily reader in Edge reuses reader/modules/furigana.js splitReading and drops <rt> on phrase selection',{skip:!hasEdge},async t=>{
 const http=require('node:http'),webRoot=path.join(__dirname,'../web');
 const srv=http.createServer((req,res)=>{
  if(req.url==='/probe.html'){
   res.writeHead(200,{'content-type':'text/html;charset=utf-8'});
   res.end('<!doctype html><link rel="stylesheet" href="/daily.css"><script src="/reader/modules/furigana.js"></script><div id="out"></div>');
   return;
  }
  const f=path.join(webRoot,req.url.slice(1));
  if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':f.endsWith('.css')?'text/css;charset=utf-8':'text/javascript;charset=utf-8'});
  res.end(fs.readFileSync(f));
 });
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-daily-ruby-'));
 let browser;
 t.after(async()=>{srv.close();try{await browser?.stop();}finally{await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150});}});
 browser=await startEdge(profile);
 await browser.send('Page.navigate',{url:`http://127.0.0.1:${srv.address().port}/probe.html`});
 await new Promise(r=>setTimeout(r,200));
 const res=await browser.evaluate(`(async()=>{
  const {paragraphHTML,selectionText}=await import('/daily-view.js');
  const esc=s=>String(s);
  const html=paragraphHTML({text:'新しい発表',tokens:[{s:'新しい',b:'新しい',r:'あたらしい'},{s:'発表',b:'発表',r:'はっぴょう'}]},esc);
  const out=document.getElementById('out');
  out.innerHTML='<p class="rd-ja">'+html+'</p>';
  const range=document.createRange();range.selectNodeContents(out.firstChild);
  const sel=getSelection();sel.removeAllRanges();sel.addRange(range);
  return {hasSplit:typeof window.TomoyoFurigana?.splitReading,html,picked:selectionText(sel),raw:String(sel).trim()};
 })()`);
 assert.equal(res.hasSplit,'function');
 assert.match(res.html,/<ruby>新<rt>あたら<\/rt><\/ruby>しい/);
 assert.equal(res.picked,'新しい発表');
 assert.equal(res.raw,'新しい発表','user-select:none on .rd-ja rt also keeps native selection clean');
});
