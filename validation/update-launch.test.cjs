'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   Player report (v1.4.19 -> v1.4.25): the update card said "下载失败 · UPDATE_LAUNCH_FAILED", "重启并更新" did nothing,
   and quitting and reopening MeguLit fixed it. The update script is started through WMI, which takes 6-11 s on a warm
   machine and more while WMI is cold; the launch was given up after 20 s, left running, and started again on each click.
   These tests drive services/update.cjs install() with a fake launcher whose timing is the real one's, on fake timers. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),{EventEmitter}=require('node:events');
const u=require('../services/update.cjs');

async function readyPackage(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'upd-launch-'));u.reset();
 const zip=Buffer.concat([Buffer.from('PK'),crypto.randomBytes(4096)]),digest='sha256:'+crypto.createHash('sha256').update(zip).digest('hex');
 const rel={tag_name:'v9.9.9',body:'',assets:[{name:'MeguLit-v9.9.9-win-x64.zip',size:zip.length,digest,browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v9.9.9/MeguLit-v9.9.9-win-x64.zip'}]};
 const fetcher=async url=>{if(/\/latest$/.test(url))return {ok:true,json:async()=>rel};if(/\/api\/|\/tags\//.test(url))return {ok:false,status:404,json:async()=>({})};let at=0;
  return {ok:true,url,headers:{get:()=>String(zip.length)},body:{getReader:()=>({read:async()=>{if(at>=zip.length)return {done:true};const v=zip.subarray(at);at=zip.length;return {done:false,value:v};}})}};};
 const s=await u.start(root,'1.4.19',fetcher);assert.equal(s.phase,'ready');
 return root;
}
/* a launcher like the real one: `scriptAt` ms after it starts, Windows has started the update script (which writes its
   mark file first); `exitAt` ms after it starts, the launcher exits with `code`. null = never. */
function launcher({scriptAt=null,exitAt=null,code=0}={}){
 const calls=[];
 const run=(cmd,args,opt)=>{const c=new EventEmitter();c.killed=false;c.kill=()=>{c.killed=true;return true;};calls.push({cmd,args,opt,child:c});
  const mark=/-Mark "([^"]+)"/.exec(opt.env.MEGULIT_UPDATE_COMMAND)?.[1];
  if(scriptAt!==null)setTimeout(()=>{if(!c.killed&&mark)fs.writeFileSync(mark,'4242');},scriptAt);
  if(exitAt!==null)setTimeout(()=>{if(!c.killed)c.emit('exit',code);},exitAt);
  return c;};
 return {run,calls};
}
async function advance(t,ms){for(let at=0;at<ms;at+=250){t.mock.timers.tick(250);await new Promise(r=>setImmediate(r));}}
const log=root=>{try{return fs.readFileSync(path.join(root,'logs','update.log'),'utf8');}catch{return '';}};
const settle=p=>p.then(v=>({ok:true,v}),e=>({ok:false,e:String(e?.message||e)}));

test('a slow WMI launch (script starts after 25 s) is not reported as UPDATE_LAUNCH_FAILED',async t=>{
 const root=await readyPackage();t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const l=launcher({scriptAt:25000,exitAt:25500});
 const r=settle(u.install(root,{run:l.run}));await advance(t,32000);
 const got=await r;
 assert.equal(got.ok,true,'install failed with '+got.e);assert.equal(got.v.phase,'installing');
 assert.match(log(root),/launch ok \(script started/);
 assert.equal(fs.readdirSync(path.join(root,'cache','update')).some(n=>n.startsWith('launched-')),false,'the mark file is removed');
 u.reset();fs.rmSync(root,{recursive:true,force:true});
});
test('clicking "重启并更新" again while the launch is still waiting starts no second update script',async t=>{
 const root=await readyPackage();t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const l=launcher({scriptAt:8000,exitAt:8200});
 const a=settle(u.install(root,{run:l.run})),b=settle(u.install(root,{run:l.run}));await advance(t,10000);
 assert.equal((await a).ok,true);assert.equal((await b).ok,true);
 assert.equal(l.calls.length,1,'one launcher, one update script');
 u.reset();fs.rmSync(root,{recursive:true,force:true});
});
test('a launcher that exits 0 without the script ever starting keeps MeguLit open with UPDATE_LAUNCH_FAILED',async t=>{
 const root=await readyPackage();t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const l=launcher({exitAt:500,code:0});
 const r=settle(u.install(root,{run:l.run}));await advance(t,40000);
 assert.deepEqual(await r,{ok:false,e:'UPDATE_LAUNCH_FAILED'});
 assert.equal(u.status().phase,'ready','the downloaded package stays ready for a retry');
 assert.match(log(root),/launch failed \(launcher exit 0, script never started/);
 u.reset();fs.rmSync(root,{recursive:true,force:true});
});
test('a launcher that never finishes is stopped, so no late script closes MeguLit; the retry then works',async t=>{
 const root=await readyPackage();t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const hang=launcher({});
 const r=settle(u.install(root,{run:hang.run}));await advance(t,95000);
 assert.deepEqual(await r,{ok:false,e:'UPDATE_LAUNCH_FAILED'});
 assert.equal(hang.calls[0].child.killed,true,'the launcher that gave no answer is stopped');
 const fast=launcher({scriptAt:3000,exitAt:3100});
 const again=settle(u.install(root,{run:fast.run}));await advance(t,4000);
 assert.equal((await again).ok,true);assert.equal(u.status().phase,'installing');
 u.reset();fs.rmSync(root,{recursive:true,force:true});
});
test('unchanged: a quick launch succeeds and a launch Windows refuses (WMI code 9) fails at once',async t=>{
 const root=await readyPackage();t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const refused=launcher({exitAt:1500,code:9});
 const r=settle(u.install(root,{run:refused.run}));await advance(t,2000);
 assert.deepEqual(await r,{ok:false,e:'UPDATE_LAUNCH_FAILED'});
 const quick=launcher({scriptAt:2000,exitAt:2100});
 const ok=settle(u.install(root,{run:quick.run}));await advance(t,2500);
 assert.equal((await ok).ok,true);
 const call=quick.calls[0];
 assert.match(call.args.join(' '),/Win32_Process -MethodName Create/,'still started by Windows through WMI');
 assert.match(call.opt.env.MEGULIT_UPDATE_COMMAND,/^conhost\.exe --headless powershell\.exe .*-File "[^"]+apply-update\.ps1" -Root "[^"]+" -Zip "[^"]+MeguLit-v9\.9\.9-win-x64\.zip"/);
 u.reset();fs.rmSync(root,{recursive:true,force:true});
});
