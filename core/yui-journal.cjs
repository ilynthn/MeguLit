// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 Yui stages from the service side (game bridges, hooks): appended to the desktop session's own log, logs/yui/<session>.log,
   which desktop/src/yui.rs opens in append mode and names in MEGULIT_YUI_SESSION / MEGULIT_YUI_DIR. A line is "<ms> <stage>", ms
   counted from the session's start (its file name); each stage at most PER_STAGE times per process, like the desktop's own cap.
   Without both variables (a test, an older desktop, a cold-test worker) nothing is written. Stages only: never a text, a path, a title. */
const fs=require('node:fs'),path=require('node:path');
const PER_STAGE=8,STAGE=/^[a-z][a-z0-9-]{1,40}$/,SESSION=/^(\d{13})-\d{1,10}$/;
const counts=new Map();
function target(env=process.env){const session=String(env.MEGULIT_YUI_SESSION||''),dir=String(env.MEGULIT_YUI_DIR||''),m=SESSION.exec(session);
 if(!m||!dir)return null;return {file:path.join(dir,session+'.log'),start:Number(m[1])};}
function mark(stage,{env=process.env,now=Date.now()}={}){try{if(!STAGE.test(String(stage)))return false;const t=target(env);if(!t||!fs.existsSync(t.file))return false;
 const n=counts.get(stage)||0;if(n>=PER_STAGE)return false;counts.set(stage,n+1);fs.appendFileSync(t.file,Math.max(0,now-t.start)+' '+stage+'\n');return true;}catch{return false;}}
module.exports={mark,target,_reset:()=>counts.clear()};
