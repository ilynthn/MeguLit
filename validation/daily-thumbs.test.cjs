'use strict';
/* 2026-11-29 日报 thumbnails used 72% of the relay's free daily quota. The app now reads the public copy
   (img.megulit.com, no Worker call) first, falls back to the Worker, keeps pictures 7 days and remembers a missing
   one for a day. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const daily=require('../services/daily.cjs');
const ID='a'.repeat(32),ENV={MEGULIT_RELAY_BASE:'https://relay.test'};
const json=o=>new Response(JSON.stringify(o),{headers:{'content-type':'application/json'}});
const png=()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
function relay(item,img){const calls=[];return {calls,fetch:async url=>{calls.push(url);
 if(url.endsWith('/api/news'))return json({items:[{title:'t',link:'https://moepedia.net/n',image:'/api/news/img/'+ID,...item}]});
 if(url.endsWith('/api/hotwords/daily'))return json({words:[]});return img(url);}};}
async function withRoot(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-thumbs-'));try{await fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}

test('the public copy is read first and the Worker is not asked',()=>withRoot(async root=>{
 const r=relay({imageUrl:`https://img.megulit.com/${ID}.png`},()=>png());
 const v=await daily.view(root,null,{env:ENV,fetch:r.fetch,glossBudget:0});
 assert.match(v.news.items[0].image,/^data:image\/png;base64,/);assert.equal(v.news.items[0].imageUrl,undefined);
 assert.deepEqual(r.calls.filter(u=>/img/.test(u)),[`https://img.megulit.com/${ID}.png`]);
}));

test('when the public host fails the Worker address is used',()=>withRoot(async root=>{
 const r=relay({imageUrl:`https://img.megulit.com/${ID}.png`},url=>url.startsWith('https://img.')?new Response('',{status:404}):png());
 const v=await daily.view(root,null,{env:ENV,fetch:r.fetch,glossBudget:0});
 assert.match(v.news.items[0].image,/^data:image\/png;base64,/);
 assert.equal(r.calls.filter(u=>u.includes('/api/news/img/')).length,1);
}));

test('an imageUrl on another host or for another id is dropped',()=>{
 const items=daily.cleanNews({items:[
  {title:'a',link:'https://moepedia.net/a',image:'/api/news/img/'+ID,imageUrl:`https://evil.example/${ID}.png`},
  {title:'b',link:'https://moepedia.net/b',image:'/api/news/img/'+ID,imageUrl:`https://img.megulit.com/${'b'.repeat(32)}.png`}]}).items;
 assert.equal(items[0].imageUrl,undefined);assert.equal(items[1].imageUrl,undefined);
});

test('a thumbnail missing on the relay is asked for once a day',()=>withRoot(async root=>{
 const r=relay({},()=>new Response('',{status:404}));
 await daily.view(root,null,{env:ENV,fetch:r.fetch,glossBudget:0});
 await daily.view(root,null,{env:ENV,fetch:r.fetch,glossBudget:0});
 assert.equal(r.calls.filter(u=>u.includes('/api/news/img/')).length,1);
}));

/* relay side: relay/src/daily.js mirrorImages writes the public copy and names it in imageUrl */
const {pathToFileURL}=require('node:url');
function bucket(){const m=new Map();return {m,
 head:async k=>m.has(k)?{httpMetadata:m.get(k).meta}:null,get:async k=>m.has(k)?{arrayBuffer:async()=>m.get(k).body,body:m.get(k).body,httpMetadata:m.get(k).meta}:null,
 put:async(k,body,o={})=>{m.set(k,{body,meta:o.httpMetadata||{},custom:o.customMetadata||{}});},delete:async k=>{m.delete(k);},
 list:async()=>({objects:[...m].map(([key,v])=>({key,customMetadata:v.custom})),truncated:false})};}
test('the relay copies a thumbnail to the public bucket, immutable, and names it in imageUrl',async()=>{
 const {mirrorImages}=await import(pathToFileURL(path.join(__dirname,'..','relay','src','daily.js')).href);
 const env={BUCKET:bucket(),IMG:bucket(),NEWS_IMG_BASE:'https://img.megulit.com'};
 const items=[{title:'t',link:'https://moepedia.net/n',image:'https://moepedia.net/p.png'}];
 await mirrorImages(env,items,new Date(),async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}}));
 const id=items[0].image.slice(14);
 assert.match(items[0].image,/^\/api\/news\/img\/[0-9a-f]{32}$/,'older apps keep the Worker address');
 assert.equal(items[0].imageUrl,`https://img.megulit.com/${id}.png`);
 assert.equal(env.IMG.m.get(id+'.png').meta.cacheControl,'public, max-age=604800, immutable');
 const plain={BUCKET:bucket()},again=[{title:'t',link:'https://moepedia.net/n',image:'https://moepedia.net/p.png'}];
 await mirrorImages(plain,again,new Date(),async()=>new Response(new Uint8Array([1]),{headers:{'content-type':'image/png'}}));
 assert.equal(again[0].imageUrl,undefined,'without IMG / NEWS_IMG_BASE nothing changes');
});
