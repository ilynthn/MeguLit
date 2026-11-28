// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-29 (api.megulit.com used up the free Workers quota of 100k requests a day; ~80k that day came from our own CI
   and local test runs, each fresh test data folder fetching every 日报 thumbnail again). Tests never reach the live
   relays: a fetch or WebSocket to api / cn-api.megulit.com throws, and the error is also raised as an uncaught
   exception so the test fails on the spot even when the code under test swallows the rejection.
   Loaded by services/relay-config.cjs inside node --test, and by CI for every node process (NODE_OPTIONS --require).
   A test that needs a relay hands in its own fetcher, stubs globalThis.fetch, or sets MEGULIT_RELAY_BASE to a stub. */
const LIVE_HOSTS=new Set(['api.megulit.com','cn-api.megulit.com']);
function hostOf(input){try{return new URL(typeof input==='string'?input:input?.url||String(input)).host;}catch{return '';}}
function refuse(host,how){
 const error=Object.assign(new Error(`tests must not reach the live relay (${how} ${host}); pass a fetcher or set MEGULIT_RELAY_BASE`),{code:'MEGULIT_LIVE_RELAY_IN_TEST'});
 process.exitCode=1;setImmediate(()=>{throw error;});
 return error;
}
function install(){
 if(typeof globalThis.fetch==='function'&&!globalThis.fetch.megulitNoLiveRelay){
  const inner=globalThis.fetch;
  const guarded=function(input,init){const host=hostOf(input);if(LIVE_HOSTS.has(host))return Promise.reject(refuse(host,'fetch'));return inner.call(this,input,init);};
  guarded.megulitNoLiveRelay=true;globalThis.fetch=guarded;
 }
 if(typeof globalThis.WebSocket==='function'&&!globalThis.WebSocket.megulitNoLiveRelay){
  const Inner=globalThis.WebSocket;
  class Guarded extends Inner{constructor(url,...rest){const host=hostOf(url);if(LIVE_HOSTS.has(host))throw refuse(host,'WebSocket');super(url,...rest);}}
  Guarded.megulitNoLiveRelay=true;globalThis.WebSocket=Guarded;
 }
}
install();
module.exports={install,LIVE_HOSTS};
