'use strict';
/* 2026-11-29 The Seed live sync was ~18% of the relay's free daily quota: the change-log cursor now survives a restart,
   so a new process asks only for what is new. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {subscribe}=require('../services/seed-live.cjs');
const KEY='f'.repeat(64);
async function run(root,seqs){
 const asked=[];
 const fetcher=async url=>{const after=Number(new URL(url).searchParams.get('after'));asked.push(after);
  return new Response(JSON.stringify({changes:seqs.filter(s=>s>after).map(seq=>({seq,game_key:KEY}))}),{headers:{'content-type':'application/json'}});};
 class Socket{constructor(){setImmediate(()=>this.onopen?.());}close(){}}
 const stop=subscribe(root,{base:'https://relay.test',Socket,fetcher,apply:async()=>{}});
 for(let i=0;i<100&&!asked.length;i++)await new Promise(r=>setTimeout(r,10));
 await new Promise(r=>setTimeout(r,30));await stop();return asked;
}
test('the change-log cursor is kept on disk across restarts',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-seedlive-'));
 try{
  assert.deepEqual(await run(root,[3,7]),[0]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data','cache','seed-live.json'),'utf8')).cursor,7);
  assert.deepEqual(await run(root,[3,7,9]),[7],'a restart starts after the last change it saw');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
