// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('grammar map sentenceHTML marks piece numbers and Chinese role labels data-exr-skip so furigana stays on Japanese words',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-gm-map-ruby-'));
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
  const [{sentenceHTML},{applySpans}]=await Promise.all([import('/grammar.js'),import('/example-ruby.js')]);
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  /* Real-world collision: Chinese role tag <small>不</small> on ない matches 不 in 不思議 later in the sentence,
     stealing ruby onto the Chinese label and skipping every Japanese kanji (明日/世界) in between;
     and Roman numeral <i class="gm-piece-no">I</i> can match I in a line containing English I. */
  const scene={
   pieces:[
    ['行か','动作','conjugation',''],
    ['ない','不','auxiliary',''],
    ['明日','名词','classes',''],
    ['の','助词','particles',''],
    ['不思議','名词','classes',''],
    ['な','是','order',''],
    ['I','名词','classes',''],
    ['世界','名词','classes','']
   ]
  };
  const text=scene.pieces.map(p=>p[0]).join('');
  const wrap=document.createElement('div');
  wrap.innerHTML=sentenceHTML(scene,esc);
  const p=wrap.querySelector('.gm-sentence');
  const spans=[
   {start:0,end:1,reading:'い'},
   {start:4,end:6,reading:'あした'},
   {start:7,end:10,reading:'ふしぎ'},
   {start:12,end:14,reading:'せかい'}
  ];
  applySpans(p,text,spans);
  return {
   smallRubies:[...p.querySelectorAll('small ruby')].map(r=>r.textContent),
   noRubies:[...p.querySelectorAll('.gm-piece-no ruby')].map(r=>r.textContent),
   wordRubies:[...p.querySelectorAll('b ruby')].map(r=>r.textContent),
   noHasSkip:[...p.querySelectorAll('.gm-piece-no')].every(n=>n.hasAttribute('data-exr-skip')),
   smallHasSkip:[...p.querySelectorAll('small')].every(n=>n.hasAttribute('data-exr-skip'))
  };
 })()`);

 assert.deepEqual(out.smallRubies,[],'Chinese role labels must never receive Japanese furigana');
 assert.deepEqual(out.noRubies,[],'Roman numerals must never receive furigana');
 assert.deepEqual(out.wordRubies,['行い','明日あした','不思議ふしぎ','世界せかい'],'all Japanese kanji words must receive their furigana');
 assert.equal(out.noHasSkip,true,'piece Roman numerals must carry data-exr-skip');
 assert.equal(out.smallHasSkip,true,'Chinese role labels must carry data-exr-skip');
});
