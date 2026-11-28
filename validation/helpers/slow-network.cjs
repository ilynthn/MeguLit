// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Preloaded into a test service (NODE_OPTIONS=--require): the network as a slow line. Every request waits SLOW_NETWORK_MS; VNDB
   knows the works named "作品<n>" (search by name, by id, with a cover), every other host answers 404. The requests are counted
   per host and kind into SLOW_NETWORK_LOG (JSON), so a test can tell which lookups a refresh made (vndb:scan is the library
   scan's own name lookup, vndb:search any other VNDB search such as the details enrichment). Used by
   validation/library-refresh-speed.test.cjs. */
const fs=require('node:fs');
const LAT=Number(process.env.SLOW_NETWORK_MS||1000),LOG=process.env.SLOW_NETWORK_LOG;
const counts={};
const count=key=>{counts[key]=(counts[key]||0)+1;if(LOG)try{fs.writeFileSync(LOG,JSON.stringify(counts));}catch{}};
const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,0xff,0xd9]);
globalThis.fetch=async(url,init={})=>{
 const u=new URL(String(url));
 await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,LAT);init.signal?.addEventListener?.('abort',()=>{clearTimeout(timer);reject(init.signal.reason||Error('aborted'));});});
 let body={};try{body=init.body?JSON.parse(init.body):{};}catch{}
 if(u.host==='api.vndb.org'&&u.pathname==='/kana/vn'){
  /* the library scan's name lookup (core/library.cjs vndb) is told apart by the fields it asks for */
  const f=body.filters||[];count('vndb:'+(f[0]!=='search'?'other':body.fields==='title,alttitle,titles.title,image.url,image.sexual'?'scan':'search'));
  const m=f[0]==='search'?/作品(\d+)/.exec(String(f[2])):f[0]==='id'?/^v1(\d{3})$/.exec(String(f[2])):null;
  if(!m)return Response.json({results:[]});const n=Number(m[1]);
  return Response.json({results:[{id:'v'+(1000+n),title:'Work '+n,alttitle:'作品'+n,titles:[{title:'作品'+n,lang:'ja'}],aliases:[],image:{url:'https://t.vndb.org/cv/'+n+'.jpg',sexual:0},description:'A story.'}]});
 }
 count(u.host);
 if(u.host==='api.vndb.org')return Response.json({results:[]});
 if(u.host==='t.vndb.org')return new Response(jpeg,{headers:{'content-type':'image/jpeg'}});
 return new Response('',{status:404});
};
