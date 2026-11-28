'use strict';
/* tools/no-live-relay.cjs: inside node --test nothing reaches api / cn-api.megulit.com */
const test=require('node:test'),assert=require('node:assert/strict');
require('../services/relay-config.cjs');
test('a fetch to the live relays is refused inside node --test',async()=>{
 const prev=process.exitCode;
 const caught=[];const onUncaught=e=>caught.push(e.code);process.prependListener('uncaughtException',onUncaught);
 const keep=process.listeners('uncaughtException').filter(l=>l!==onUncaught);keep.forEach(l=>process.removeListener('uncaughtException',l));
 try{
  for(const url of ['https://api.megulit.com/api/health','https://cn-api.megulit.com/api/news'])
   await assert.rejects(fetch(url),e=>e.code==='MEGULIT_LIVE_RELAY_IN_TEST');
  await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
  assert.deepEqual(caught,['MEGULIT_LIVE_RELAY_IN_TEST','MEGULIT_LIVE_RELAY_IN_TEST'],'raised as an uncaught error so a swallowed rejection still fails the test');
 }finally{process.removeListener('uncaughtException',onUncaught);keep.forEach(l=>process.on('uncaughtException',l));process.exitCode=prev;}
});
