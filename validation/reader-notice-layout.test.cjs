'use strict';
/* 2026-11-15 (user: 优化一下这里的排版): the 「游戏内功能未就绪」 notice squeezed its title to three characters a line, showed a bare
   SERVICE_FAILED and pressed the two buttons into vertical text. Now the title and button labels stay on one line, a code other
   than READER_* reads as a sentence (raw text only in the tooltip and diagnostics), and on a narrow window the buttons move
   together to a second row on the right. The real web/ UI runs in headless Edge. Skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startService,startWeb,startEdge}=require('./library-views-perf.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const PROBE=err=>`(async()=>{const old=document.querySelector('#reader-notice [data-reader-diagnostics]');old&&old.remove();window.__megulitTest.readerNotice(${JSON.stringify(err)},2);await new Promise(r=>setTimeout(r,300));
 const p=document.querySelector('#reader-notice'),q=n=>n.getBoundingClientRect(),lines=n=>Math.round(q(n).height/parseFloat(getComputedStyle(n).lineHeight==='normal'?parseFloat(getComputedStyle(n).fontSize)*1.4:getComputedStyle(n).lineHeight));
 const title=p.querySelector('.reader-notice-title'),buttons=[...p.querySelectorAll('.reader-notice-actions>button')];
 return {panel:q(p).toJSON(),title:q(title).toJSON(),titleH:title.scrollHeight,fs:parseFloat(getComputedStyle(title).fontSize),detail:p.querySelector('.reader-notice-detail').textContent,tip:p.title,
  buttons:buttons.map(b=>({r:q(b).toJSON(),ws:getComputedStyle(b).whiteSpace,fit:b.scrollWidth<=b.clientWidth+1,fs:parseFloat(getComputedStyle(b).fontSize)}))};})()`;
test('reader notice: one-line title and buttons, readable message, buttons wrap together on a narrow window',{skip:!hasEdge&&'Edge not installed',timeout:180000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-reader-notice-'));const root=path.join(temp,'root');fs.mkdirSync(root);
 const service=startService(root);let web,cdp;
 // Let the app finish its initial reader health check before injecting the errors under test.
 const startupError='READER_NATIVE_MISSING';
 try{web=await startWeb({call:request=>request.action==='reader_status'?{error:startupError}:service.call(request)});cdp=await startEdge(path.join(temp,'edge'));
  const url=`http://127.0.0.1:${web.address().port}/#%7B%7D`;
  const navigation=await cdp.send('Page.navigate',{url});
  assert.ok(!navigation.errorText,`Home navigation failed (${navigation.errorText})`);
  let state;
  for(const deadline=Date.now()+45000;Date.now()<deadline;){
   state=await cdp.evaluate(`({href:location.href,readyState:document.readyState,hasTest:!!window.__megulitTest,title:document.querySelector('#reader-notice')?.title||''})`).catch(()=>null);
   if(state?.href===url&&state.hasTest&&state.title===startupError)break;
   await sleep(100);
  }
  assert.equal(state?.hasTest&&state?.title===startupError,true,`initial reader status displayed (${JSON.stringify(state)})`);
  for(const [w,narrow] of [[330,true],[760,false],[1920,false]]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:w,height:720,deviceScaleFactor:1,mobile:false});await sleep(400);
   for(const err of ['SERVICE_FAILED','READER_START_TIMEOUT']){
    const s=await cdp.evaluate(PROBE(err)),tag=w+' '+err;
    assert.ok(s.title.height<s.fs*2,tag+': title on one line, height '+s.title.height);
    assert.equal(s.buttons.length,2,tag+': reconnect + copy diagnostics');
    for(const b of s.buttons){assert.equal(b.ws,'nowrap',tag+': button label nowrap');assert.ok(b.fit&&b.r.height<=40,tag+': button label on one line '+JSON.stringify(b.r));}
    assert.ok(s.panel.right<=w&&s.panel.left>=0,tag+': panel inside the window');
    const [a,b]=s.buttons.map(x=>x.r);assert.ok(Math.abs(a.top-b.top)<1,tag+': buttons on the same row');
    assert.ok(Math.abs(b.right-(s.panel.right-15))<2,tag+': buttons aligned right');
    if(narrow)assert.ok(a.top>=s.title.bottom-1,tag+': buttons moved below the title');else assert.ok(a.top<s.title.bottom,tag+': buttons beside the title');
    if(err==='SERVICE_FAILED'){assert.doesNotMatch(s.detail,/SERVICE_FAILED/,'no bare error code in the message');assert.match(s.detail,/游戏连接服务启动失败/);assert.equal(s.tip,'SERVICE_FAILED','raw code kept in the tooltip');}
    else assert.match(s.detail,/READER_START_TIMEOUT/);
   }}
 }finally{await cdp?.stop();web?.close();await service.stop();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
