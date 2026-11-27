// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 the home page's QQ 交流群 pill (web/qq-group.js): open the desktop QQ's join window for the group. QQ registers the
   tencent:// protocol; when it is not registered there is no QQ to open, and the page falls back to copying the number and the
   QQ site. Only a group number goes into the address. */
const {spawn,execFileSync}=require('node:child_process');
const groupUrl=uin=>'tencent://groupwpa/?subcmd=all&uin='+uin;
function hasHandler(){
 try{execFileSync('reg',['query','HKCR\\tencent','/ve'],{windowsHide:true,stdio:'ignore',timeout:3000});return true;}catch{return false;}
}
function launch(url){const child=spawn('explorer.exe',[url],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();}
function openGroup(uin,deps={}){
 uin=String(uin??'');if(!/^\d{5,12}$/.test(uin))throw Error('INVALID_QQ_GROUP');
 if(!(deps.hasHandler||hasHandler)())return {opened:false,reason:'NO_QQ'};
 const url=groupUrl(uin);
 try{(deps.launch||launch)(url);}catch{return {opened:false,reason:'LAUNCH_FAILED'};}
 return {opened:true,url};
}
module.exports={groupUrl,openGroup};
