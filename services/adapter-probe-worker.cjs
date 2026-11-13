// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E560 probe worker: a child process at idle priority that probes the games the service sends it, one at a time, and
   answers each with its result. It never downloads anything (the on-demand GARbro pack is used only when it is already
   installed) and never writes outside the caches the readers keep. The service kills it when a game runs over its
   budget or the user cancels; a new worker resumes with the next game. */
const path=require('node:path');
/* no runtime-pack downloads from a probe: a game that needs GARbro and does not have it is reported as such */
try{const {RuntimePacks}=require('../core/runtime-packs.cjs');RuntimePacks.prototype.download=function(){return this.status();};RuntimePacks.prototype.ensure=async function(id){if(this.installed(id))return true;throw Error('PROBE_NO_DOWNLOAD');};}catch{}
const {probeGame}=require('./adapter-probe-core.cjs');
process.on('message',m=>{
 if(m?.type==='probe'){let result;try{result=probeGame({dir:m.dir,executable:m.executable},{budgetMs:m.budgetMs});}catch(e){result={schema:'megulit.probe-result',version:1,step:'parse-failed',detail:'PROBE_ERROR:'+String(e?.message||e).slice(0,60),engines:[],inventory:{files:0,bytes:0,ext:{},archives:[]},lines:0,japaneseLines:0};}
  try{process.send({type:'result',id:m.id,result});}catch{}}
 else if(m?.type==='sample'){let result=null;try{result=require('./adapter-sample.cjs').sampleGame({dir:m.dir,executable:m.executable,result:m.result});}catch{}try{process.send({type:'result',id:m.id,result});}catch{}}
 else if(m?.type==='exit')process.exit(0);
});
process.on('disconnect',()=>process.exit(0));
try{process.send({type:'ready',pid:process.pid,root:path.resolve(__dirname,'..')});}catch{}
