// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 传火碑: the shipped bake (web/assets/torch) must match the scene's source, or the page falls back to drawing everything
   when it opens (seconds on a slow PC). After changing web/torch-hall.js, web/torch-textures.js or web/torch-bake.js run
   `node tools/torch-bake.cjs`. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const {sourceHash}=require('../tools/torch-bake.cjs');
const vm=require('node:vm');
const DIR=path.join(__dirname,'..','web','assets','torch');
test('the torch bake matches the scene source',()=>{const man=JSON.parse(fs.readFileSync(path.join(DIR,'manifest.json'),'utf8'));
 assert.equal(man.hash,sourceHash(),'web/assets/torch is stale: run node tools/torch-bake.cjs');});
test('every baked file the manifest names is there',()=>{const man=JSON.parse(fs.readFileSync(path.join(DIR,'manifest.json'),'utf8'));
 const files=[man.ao.file,man.torch.file,man.stele.file,...Object.values(man.textures).flatMap(o=>Object.values(o))];assert.ok(files.length>20);
 for(const f of files)assert.ok(fs.statSync(path.join(DIR,f)).size>100,f);
 assert.equal(man.ao.dims.length,3);assert.equal(man.torch.dims.length,3);});

test('bake volumes start during image decode and repeat visits reuse the same CPU assets',async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(DIR,'manifest.json'),'utf8'));
 const web=path.resolve(DIR,'../..');
 const requests=[];
 let releaseImages;
 const images=new Promise(resolve=>{releaseImages=resolve;});
 const context={
  URL,Response,Blob,DecompressionStream,TextEncoder,crypto:globalThis.crypto,performance,window:{},
  fetch:async url=>{
   requests.push(path.basename(url.pathname));
   return new Response(fs.readFileSync(path.join(web,url.pathname)));
  },
  Image:class{decode(){return images;}}
 };
 const source=fs.readFileSync(path.join(web,'torch-bake.js'),'utf8')
  .replace(/^import .*\r?\n/m,'').replaceAll('export ','').replaceAll('import.meta.url','"http://fixture/torch-bake.js"');
 const {loadBaked,withBaked,bakedAO}=vm.runInNewContext(source+'\n({loadBaked,withBaked,bakedAO})',context);
 const cold=loadBaked(false);
 assert.equal(loadBaked(false),cold);
 try{
  const volumes=[manifest.ao.file,manifest.torch.file,manifest.stele.file];
  for(let attempts=0;attempts<100&&!volumes.every(file=>requests.includes(file));attempts++){
   await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.ok(volumes.every(file=>requests.includes(file)),'all volume requests start while the image decoders remain blocked');
 }finally{releaseImages();}
 const result=await cold;
 assert.equal(result.ok,true,result.reason);
 const warmCount=requests.length;
 assert.equal(await loadBaked(false),result);
 assert.equal(requests.length,warmCount);
 assert.equal(bakedAO(),null);
 assert.equal(await withBaked(result,()=>bakedAO().stele),result.assets.stele);
 assert.equal(bakedAO(),null);
});
