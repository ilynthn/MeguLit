// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 The 传火碑 render scripts left their scratch folders (service root, Edge profile, screenshots; 50–75 MB each) in TEMP
   after every run, and a day of runs filled the system drive. Each script here runs with TEMP pointed at an empty folder of
   our own; afterwards none of its scratch folders may be left in it: after a full passing run, and after a run that fails
   halfway because the browser never starts (MEGULIT_EDGE points at node, so Edge gives no debugging port).
   Each script starts its own headless Edge (--headless=new), so CI runs this file in the browser lane. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const ROOT=path.join(__dirname,'..');

function run(script,args,{temp,env={}}){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(ROOT,'validation',script),...args],{cwd:ROOT,windowsHide:true,
   env:{...process.env,TEMP:temp,TMP:temp,TMPDIR:temp,...env},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  child.once('error',reject);child.once('close',code=>resolve({code,output}));
 });
}
const left=(temp,prefix)=>fs.readdirSync(temp).filter(name=>name.startsWith(prefix));

let base;
test.before(()=>{base=fs.mkdtempSync(path.join(os.tmpdir(),'torch-render-temp-'));});
test.after(()=>{fs.rmSync(base,{recursive:true,force:true,maxRetries:10,retryDelay:200});});
const fresh=name=>{const dir=path.join(base,name);fs.mkdirSync(dir);return dir;};

test('a passing exterior render leaves nothing in TEMP',{timeout:600000},async()=>{
 const temp=fresh('pass');
 const {code,output}=await run('torch-exterior-render.cjs',['--low'],{temp});
 assert.equal(code,0,output.slice(-2000));
 assert.deepEqual(left(temp,'megulit-torch-exterior-'),[]);
});

for(const [script,args,prefix] of [
 ['torch-exterior-render.cjs',['--low'],'megulit-torch-exterior-'],
 ['torch-courtyard-render.cjs',[],'megulit-courtyard-'],
 ['torch-ground-render.cjs',['after','low'],'megu-ground-test-'],
]){
 test(`${script} that fails halfway still removes its scratch folder`,{timeout:300000},async()=>{
  const temp=fresh('fail-'+prefix);
  const {code,output}=await run(script,args,{temp,env:{MEGULIT_EDGE:process.execPath}});
  assert.notEqual(code,0,output.slice(-2000));
  assert.match(output,/EDGE_NO_PORT/);
  assert.deepEqual(left(temp,prefix),[]);
 });
}

test('--keep leaves the folder for its screenshots',{timeout:300000},async()=>{
 const temp=fresh('keep');
 const {code}=await run('torch-courtyard-render.cjs',['--keep'],{temp,env:{MEGULIT_EDGE:process.execPath}});
 assert.notEqual(code,0);
 assert.equal(left(temp,'megulit-courtyard-').length,1);
});
