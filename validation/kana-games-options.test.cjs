// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('kana games options wire speak-after-answer and weak-only checkboxes through to play view',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-opts-'));
 let server,browser;
 t.after(async()=>{
  await browser?.stop();
  server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 server=await startWeb();
 browser=await startEdge(path.join(root,'edge'));
 const origin='http://127.0.0.1:'+server.address().port;
 await browser.send('Page.navigate',{url:origin+'/index.html'});

 const out=await browser.evaluate(`(async()=>{
  const [{view:gamesView},{view:playView},D]=await Promise.all([
   import('/kana/views/games.js'),
   import('/kana/views/play.js'),
   import('/kana/data.js')
  ]);
  const now=Date.now();
  const makeStore=runs=>({
   KEY:{m:'m',b:'b',r:'r',a:'a',l:'l',p:'p'},DAY:864e5,
   get:(k,f)=>k==='r'?runs:f,put(){},addRun(){}
  });

  /* 1. Without weak kana, weak-only checkbox is disabled */
  const el0=document.createElement('div');document.body.append(el0);
  gamesView(el0,{data:D,store:makeStore([]),go(){},onKey(){}});
  const weakDisabledWhenEmpty=el0.querySelectorAll('.opts input[type="checkbox"]')[1].disabled;
  el0.remove();

  /* 2. With weak kana: toggle checkboxes, switch script (rerender), click start */
  const runs=[{id:now-1000,G:'conv',D:'intro',script:'h',log:[
   {k:'ぬ',show:'ぬ',ok:false,t:2},{k:'ぬ',show:'ぬ',ok:false,t:2},{k:'め',show:'め',ok:false,t:2}
  ]}];
  const urls=[];
  const el1=document.createElement('div');document.body.append(el1);
  gamesView(el1,{data:D,store:makeStore(runs),go:u=>urls.push(u),onKey(){}});
  let cbs=el1.querySelectorAll('.opts input[type="checkbox"]');
  const introSpeakDefault=cbs[0].checked;
  cbs[0].click(); /* uncheck speak */
  cbs[1].click(); /* check weak-only */
  el1.querySelector('#scr button[data-v="k"]').click(); /* triggers renderCfg */
  cbs=el1.querySelectorAll('.opts input[type="checkbox"]');
  const speakKeptAfterRerender=cbs[0].checked===false;
  const weakKeptAfterRerender=cbs[1].checked===true;
  el1.querySelector('#go').click();
  const urlWithOpts=urls.pop()||'';

  /* 3. Switching to adv without manual speak override defaults speak to off */
  const el2=document.createElement('div');document.body.append(el2);
  gamesView(el2,{data:D,store:makeStore(runs),go:u=>urls.push(u),onKey(){}});
  el2.querySelector('.diff[data-d="2"]').click();
  el2.querySelector('#go').click();
  const advDefaultUrl=urls.pop()||'';
  el1.remove();el2.remove();

  /* 4. play.js respects say=0 (silent after correct answer) and default (speaks after correct answer) */
  const answerOnce=async(extraParams)=>{
   const said=[],leaves=[];
   const el=document.createElement('div');document.body.append(el);
   playView(el,{
    params:{g:'conv',d:'intro',s:'h',only:'ぬ',...extraParams},
    data:D,store:makeStore([]),
    speech:{say:x=>said.push(x),prefetch(){},stop(){}},
    volumeHTML:()=>'',go(){},onKey(){},onLeave:h=>leaves.push(h)
   });
   const shown=el.querySelector('.prompt').textContent;
   const want=D.isKata(shown)?D.toHira(shown):D.toKata(shown);
   [...el.querySelectorAll('#opts .ch')].find(b=>b.textContent.endsWith(want)).click();
   for(const h of leaves)h();
   el.remove();
   return said.length;
  };
  const saidWhenSay0=await answerOnce({say:'0'});
  const saidWhenDefault=await answerOnce({});

  return {
   weakDisabledWhenEmpty,introSpeakDefault,speakKeptAfterRerender,weakKeptAfterRerender,
   urlWithOpts,advDefaultUrl,saidWhenSay0,saidWhenDefault
  };
 })()`);

 assert.equal(out.weakDisabledWhenEmpty,true,'weak-only checkbox should be disabled when there are no recent mistakes');
 assert.equal(out.introSpeakDefault,true);
 assert.equal(out.speakKeptAfterRerender,true,'unchecking speak must survive config rerender');
 assert.equal(out.weakKeptAfterRerender,true,'checking weak-only must survive config rerender');
 const u1=new URL('http://x/'+out.urlWithOpts);
 assert.equal(u1.searchParams.get('say'),'0','unchecked speak must pass say=0');
 assert.equal(u1.searchParams.get('only'),'ぬ,め','checked weak-only must pass recent weak kana in only=');
 const u2=new URL('http://x/'+out.advDefaultUrl);
 assert.equal(u2.searchParams.get('say'),'0','adv default unchecked speak must pass say=0');
 assert.equal(out.saidWhenSay0,0,'play view must not auto-speak after answering when say=0');
 assert.equal(out.saidWhenDefault,1,'play view must still auto-speak by default');
});
