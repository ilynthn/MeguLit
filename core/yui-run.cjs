// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 Yui-style stage records for a run that is not the desktop app: a cold test, an automatic adaptation (tools/megulit-adapter (cold stage))
   or any tool that wants "how far did it get and where did it stop" when it fails. Same shape as the desktop's logs/yui sessions
   (services/yui.cjs sessions()): one line "<ms> <stage>" per stage into <dir>/yui-run.log, ms from the run's start, so a run that
   died without a word still says its last stage, and read() calls it interrupted. Local only: nothing here sends anything, and
   the Yui consent / relay are not involved.
     const run=YuiRun.start(dir,{kind:'cold-test'});run.mark('launch');run.mark('hook-attach');run.fail('no-first-line','why');run.close();
     YuiRun.read(dir) -> {kind, state:'closed'|'failed'|'interrupted'|'running', stage (the last), previous, failed:{stage, reason, ms}|null,
                          events:[{ms, stage}], ms (to the last record)}
   A stage is [a-z][a-z0-9-]{1,40}; a failure reason is kept to 300 characters (it stays on this PC). Each stage at most PER_STAGE
   times; the file at most MAX_BYTES. Writing never throws into the run. */
const fs=require('node:fs'),path=require('node:path');
const LOG='yui-run.log',STAGE=/^[a-z][a-z0-9-]{1,40}$/,PER_STAGE=8,MAX_BYTES=64*1024;
function start(dir,{kind='run',now=Date.now}={}){
 const file=path.join(dir,LOG),t0=now(),counts=new Map();let bytes=0,ended=false;
 const write=line=>{try{if(bytes+line.length>MAX_BYTES)return false;fs.appendFileSync(file,line);bytes+=Buffer.byteLength(line);return true;}catch{return false;}};
 try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,'');}catch{}
 write('0 #'+JSON.stringify({kind:String(kind).slice(0,40),at:new Date(t0).toISOString(),pid:process.pid})+'\n');
 const mark=stage=>{if(ended||!STAGE.test(String(stage)))return false;const n=counts.get(stage)||0;if(n>=PER_STAGE)return false;counts.set(stage,n+1);return write((now()-t0)+' '+stage+'\n');};
 const fail=(stage,reason='')=>{if(ended||!STAGE.test(String(stage)))return false;ended=true;return write((now()-t0)+' !'+stage+' '+String(reason||'').replace(/[\r\n]+/g,' ').slice(0,300)+'\n');};
 const close=()=>{if(ended)return false;ended=true;return write((now()-t0)+' closed\n');};
 return {file,mark,fail,close};}
function read(dir,{alive=null}={}){let text;try{text=fs.readFileSync(path.join(dir,LOG),'utf8');}catch{return null;}
 let kind='',failed=null,closed=false;const events=[];
 for(const line of text.split(/\r?\n/)){let m;
  if((m=/^0 #(\{.*\})$/.exec(line))){try{kind=String(JSON.parse(m[1]).kind||'');}catch{}continue;}
  if((m=/^(\d{1,12}) !([a-z][a-z0-9-]{1,40}) ?(.*)$/.exec(line))){failed={stage:m[2],reason:m[3],ms:+m[1]};events.push({ms:+m[1],stage:m[2]});continue;}
  if((m=/^(\d{1,12}) ([a-z][a-z0-9-]{1,40})$/.exec(line))){if(m[2]==='closed')closed=true;events.push({ms:+m[1],stage:m[2]});}}
 const work=events.filter(e=>e.stage!=='closed'),last=failed?failed.stage:work.at(-1)?.stage||null;
 const previous=failed?work.filter(e=>e.stage!==failed.stage||e.ms!==failed.ms).at(-1)?.stage||null:work.at(-2)?.stage||null;
 const state=failed?'failed':closed?'closed':alive===true?'running':'interrupted';
 return {kind,state,stage:last,previous,failed,events,ms:events.at(-1)?.ms||0};}
module.exports={start,read,LOG};
