// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('kana play only= drill filters invalid kana per mode, enables daku rows for pos, and falls back on empty pool',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-kana-only-'));
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
  const [{view},D]=await Promise.all([import('/kana/views/play.js'),import('/kana/data.js')]);
  const run=(params)=>{
   const el=document.createElement('div');document.body.append(el);
   const leaves=[];
   const store={KEY:{m:'m',b:'b',r:'r',a:'a',l:'l',p:'p'},get:(_,f)=>f,put(){},addRun(){}};
   const ctx={params,data:D,store,speech:{say(){},prefetch(){},stop(){}},go(){},onKey(){},onLeave:h=>leaves.push(h),volumeHTML:()=>''};
   let error=null;
   try{view(el,ctx);}catch(e){error=String(e?.message||e);}
   const res={
    error,
    prompt:el.querySelector('.prompt')?.textContent||'',
    mid:el.querySelector('.mid')?.textContent||'',
    hasGaRow:!!el.querySelector('[data-row="が"]'),
    opts:[...el.querySelectorAll('#opts .ch')].map(b=>b.textContent)
   };
   for(const h of leaves)h();
   el.remove();
   return res;
  };
  return {
   posN:run({g:'pos',d:'intro',s:'h',only:'ん'}),
   posDaku:run({g:'pos',d:'std',s:'h',only:'が'}),
   seqEmpty:run({g:'seq',d:'std',s:'h',only:'が,きゃ'}),
   seqIntroN:run({g:'seq',d:'intro',s:'h',only:'ん'})
  };
 })()`);

 assert.equal(out.posN.error,null,'pos only=ん must not throw TypeError');
 assert.ok(out.posN.prompt&&out.posN.prompt!=='ん'&&!/undefined/.test(out.posN.prompt),'pos only=ん must fall back to a valid non-ん kana');
 assert.equal(out.posDaku.error,null);
 assert.equal(out.posDaku.prompt,'が');
 assert.equal(out.posDaku.hasGaRow,true,'pos with dakuten in only= must render dakuten row buttons');
 assert.equal(out.seqEmpty.error,null);
 assert.ok(out.seqEmpty.mid&&!/undefined/.test(out.seqEmpty.mid),'seq with non-seion only= must fall back to ORDER pool');
 assert.equal(out.seqIntroN.error,null);
 assert.ok(out.seqIntroN.mid&&out.seqIntroN.mid!=='ん','seq intro (next-only) must exclude ん');
 assert.ok(out.seqIntroN.opts.every(o=>!/null|undefined/.test(o)),'seq intro options must not contain null/undefined');
});
