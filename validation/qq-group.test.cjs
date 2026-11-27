// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 QQ 交流群 entry: the home page pill (web/qq-group.js) asks the service to open the desktop QQ's join window
   (core/qq-group.cjs, tencent://groupwpa); without QQ, or when that fails, the group number is copied, QQ's site opens and
   the toast says 「群号已复制」. The app, the README and the website show the same number. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),{groupUrl,openGroup}=require('../core/qq-group.cjs');
const web=()=>import('../web/qq-group.js');

test('the service opens QQ\'s join window for the group only when QQ is installed',()=>{
 const launched=[];
 assert.deepEqual(openGroup('1131267542',{hasHandler:()=>true,launch:url=>launched.push(url)}),{opened:true,url:'tencent://groupwpa/?subcmd=all&uin=1131267542'});
 assert.deepEqual(launched,['tencent://groupwpa/?subcmd=all&uin=1131267542'],'the address QQ opens the group from');
 launched.length=0;
 assert.deepEqual(openGroup('1131267542',{hasHandler:()=>false,launch:url=>launched.push(url)}),{opened:false,reason:'NO_QQ'});
 assert.equal(launched.length,0,'nothing launched without QQ');
 assert.deepEqual(openGroup('1131267542',{hasHandler:()=>true,launch:()=>{throw Error('spawn failed');}}),{opened:false,reason:'LAUNCH_FAILED'});
 for(const bad of ['','abc','1234','1131267542&cmd=x','1131267542 ','../1131267542',null])
  assert.throws(()=>openGroup(bad,{hasHandler:()=>true,launch:()=>assert.fail('launched '+bad)}),/INVALID_QQ_GROUP/,'only a group number goes into the address: '+bad);
 assert.equal(groupUrl('123456'),'tencent://groupwpa/?subcmd=all&uin=123456');
});

test('the home pill: QQ opens when it can; otherwise the number is copied, QQ\'s site opens and the toast says so',async()=>{
 const {QQ_GROUP,QQ_WEB,joinQQGroup,qqPillHTML,qqWords}=await web();
 const run=async(answer,{copyFails=false,locale='zh'}={})=>{const calls=[],copied=[],toasts=[];
  const api=async(action,params)=>{calls.push([action,params]);if(action==='open_qq_group'){if(answer instanceof Error)throw answer;return answer;}return {opened:true};};
  const result=await joinQQGroup({api,locale,toast:m=>toasts.push(m),copy:async t=>{if(copyFails)throw Error('denied');copied.push(t);}});
  return {result,calls,copied,toasts};};
 let r=await run({opened:true,url:'tencent://groupwpa/?subcmd=all&uin='+QQ_GROUP});
 assert.deepEqual(r,{result:'qq',calls:[['open_qq_group',{uin:QQ_GROUP}]],copied:[],toasts:[]},'QQ installed: only the join window');
 for(const answer of [{opened:false,reason:'NO_QQ'},{opened:false,reason:'LAUNCH_FAILED'},Error('service down'),null]){
  r=await run(answer);
  assert.deepEqual(r,{result:'web',calls:[['open_qq_group',{uin:QQ_GROUP}],['open_source',{url:QQ_WEB}]],copied:[QQ_GROUP],toasts:['群号已复制：'+QQ_GROUP]},'fallback after '+JSON.stringify(answer?.reason||String(answer)));
 }
 r=await run({opened:false},{copyFails:true});
 assert.deepEqual(r.toasts,['QQ 群号：'+QQ_GROUP],'when the clipboard is refused the toast still gives the number');
 r=await run({opened:false},{locale:'ja'});assert.deepEqual(r.toasts,[qqWords('ja').copied]);
 r=await run({opened:false},{locale:'en'});assert.deepEqual(r.toasts,['Group number copied: '+QQ_GROUP]);
 const html=qqPillHTML('zh',s=>String(s));
 assert.match(html,/class="qq-pill"/);assert.match(html,/data-qq-join/);assert.ok(html.includes('QQ 群')&&html.includes(QQ_GROUP),'the pill shows QQ 群 and the number');
 // the fallback page is one the service may open
 const bridge=fs.readFileSync(path.join(ROOT,'services','bridge.cjs'),'utf8');
 assert.ok(bridge.includes(`'${new URL(QQ_WEB).hostname}'`),'QQ\'s site is in open_source\'s list');
 assert.match(bridge,/case 'open_qq_group':return require\('\.\.\/core\/qq-group\.cjs'\)\.openGroup\(request\.uin\);/);
});

test('the app, the README and the website give the same group number',async()=>{
 const {QQ_GROUP}=await web();
 const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
 const readme=read('README.md'),site=read('site/public/index.html');
 assert.ok(readme.includes(`QQ%20%E7%BE%A4-${QQ_GROUP}-`),'README badge');assert.match(readme,new RegExp(`## 交流群[\\s\\S]{0,40}QQ 群：\\*\\*${QQ_GROUP}\\*\\*`),'README 交流群');
 const numbers=s=>[...s.matchAll(/(?:uin=|data-qq="|QQ[^0-9\n<]{0,6})(\d{5,12})/g)].map(m=>m[1]);
 for(const [name,text] of [['README',readme],['site',site]]){const found=numbers(text);assert.ok(found.length>=2,name+' mentions the group');assert.deepEqual([...new Set(found)],[QQ_GROUP],name+' shows only this number');}
 assert.ok(site.includes(`class="qq-btn js-qq" href="tencent://groupwpa/?subcmd=all&uin=${QQ_GROUP}"`),'header button');
 assert.match(site,/<footer[\s\S]*class="js-qq"[\s\S]*<\/footer>/,'footer link');
});
