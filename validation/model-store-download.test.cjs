'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ModelStore,MODELS}=require('../core/model-store.cjs');
const wait=async(store,id)=>{for(let i=0;i<200&&store.jobs[id].state==='downloading';i++)await new Promise(r=>setTimeout(r,10));};

test('cancelled download never installs the partial .part as the model',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ms-'));const old=global.fetch;const m=MODELS[0];
 global.fetch=async(url,opt)=>({ok:true,status:200,headers:new Map([['content-length','100']]),body:(async function*(){yield Buffer.alloc(10);await new Promise((_,rej)=>opt.signal.addEventListener('abort',()=>rej(Error('aborted'))));})()});
 try{const s=new ModelStore(root);s.download(m.id);await new Promise(r=>setTimeout(r,30));s.cancel(m.id);await wait(s,m.id);
  assert.equal(s.jobs[m.id].state,'cancelled');assert.equal(fs.existsSync(path.join(root,'models',m.file)),false);}
 finally{global.fetch=old;fs.rmSync(root,{recursive:true,force:true});}
});

test('a complete leftover .part answered with 416 is finished instead of failing forever',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ms-'));const old=global.fetch;const m=MODELS[0];
 fs.mkdirSync(path.join(root,'models'));fs.writeFileSync(path.join(root,'models',m.file+'.part'),'x'.repeat(50));
 global.fetch=async()=>({ok:false,status:416,headers:new Map(),body:null});
 try{const s=new ModelStore(root);s.download(m.id);await wait(s,m.id);
  assert.equal(s.jobs[m.id].state,'done');assert.equal(fs.statSync(path.join(root,'models',m.file)).size,50);}
 finally{global.fetch=old;fs.rmSync(root,{recursive:true,force:true});}
});
