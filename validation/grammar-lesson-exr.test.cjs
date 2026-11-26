// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('grammar lesson judgeHTML marked options and merged bluebook examples carry exAttr and hydrate ruby',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-grammar-exr-'));
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
  const [{lessonHTML,useAnkiCards},{N5},{applySpans}]=await Promise.all([
   import('/grammar.js'),
   import('/grammar-n5.js'),
   import('/example-ruby.js')
  ]);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pt=N5.find(p=>p.id==='kosoado');
  useAnkiCards([{
   id:'bb-99',level:'N5',word:'こ・そ・あ・ど',order:1,deck:'蓝宝书',
   form:['指示词'],explain:['指示远近的词'],notes:[],hits:['これ'],
   examples:[{ja:'これは明日の天気です。',hl:'これ',zh:'这是明天的天气。'}]
  }]);
  const html=lessonHTML(pt,{progress:{},examples:{}},{locale:'zh',esc});
  useAnkiCards([]);

  const box=document.createElement('div');
  box.innerHTML=html;
  document.body.append(box);

  /* 1. judgeHTML .gm-jd-marked keeps data-exr and data-exr-ruby="none" and hydrates ruby around <mark> */
  const allMarked=[...box.querySelectorAll('.gm-jd-marked')];
  const allMarkedHaveExr=allMarked.length>0&&allMarked.every(el=>(el.getAttribute('data-exr')||'').length>0&&el.getAttribute('data-exr-ruby')==='none');
  const marked=allMarked.find(el=>el.getAttribute('data-exr')==='あの時の約束、覚えてる？');
  const markedExr=marked?.getAttribute('data-exr')||'';
  const markedRubyAttr=marked?.getAttribute('data-exr-ruby')||'';
  let markedHydrated=0;
  if(marked&&markedExr){
   markedHydrated=applySpans(marked,markedExr,[{start:2,end:3,reading:'とき'},{start:4,end:6,reading:'やくそく'}]);
  }
  const markedHasHighlight=Boolean(marked?.querySelector('mark.gm-jd-hl'));
  const markedTextAfter=marked?.textContent||'';

  /* 2. ankiMore merged bluebook example carries data-exr and hydrates ruby */
  const ankiJa=box.querySelector('.gm-anki .gm-ja');
  const ankiExr=ankiJa?.getAttribute('data-exr')||'';
  let ankiHydrated=0;
  if(ankiJa&&ankiExr){
   ankiHydrated=applySpans(ankiJa,ankiExr,[{start:3,end:5,reading:'あした'},{start:6,end:8,reading:'てんき'}]);
  }
  const ankiTextAfter=ankiJa?.textContent||'';
  box.remove();

  return {allMarkedCount:allMarked.length,allMarkedHaveExr,markedExr,markedRubyAttr,markedHydrated,markedHasHighlight,markedTextAfter,ankiExr,ankiHydrated,ankiTextAfter};
 })()`);

 assert.ok(out.allMarkedCount>0,'expected judgeHTML to render .gm-jd-marked options');
 assert.equal(out.allMarkedHaveExr,true,'every .gm-jd-marked must carry data-exr and data-exr-ruby="none"');
 assert.equal(out.markedExr,'あの時の約束、覚えてる？','.gm-jd-marked must carry data-exr so ruby stays after answering');
 assert.equal(out.markedRubyAttr,'none','.gm-jd-marked must keep data-exr-ruby="none" like .gm-jd-plain');
 assert.equal(out.markedHydrated,2,'applySpans must hydrate ruby inside .gm-jd-marked');
 assert.equal(out.markedHasHighlight,true,'<mark class="gm-jd-hl"> must stay intact after ruby hydration');
 assert.equal(out.markedTextAfter,'あの時ときの約束やくそく、覚えてる？');
 assert.equal(out.ankiExr,'これは明日の天気です。','merged bluebook example must carry data-exr');
 assert.equal(out.ankiHydrated,2,'applySpans must hydrate kanji spans in merged bluebook example');
 assert.equal(out.ankiTextAfter,'これは明日あしたの天気てんきです。');
});
