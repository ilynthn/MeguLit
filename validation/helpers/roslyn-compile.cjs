// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');

const compilers=[process.env.MEGULIT_ROSLYN_CSC,'E:/Apps/build-tools/vs2022/MSBuild/Current/Bin/Roslyn/csc.exe'].filter(Boolean);

function findRoslynCompiler(){
 return compilers.find(file=>fs.existsSync(file));
}

function compileRoslyn(args,{retryTimeout=false}={}){
 const timeout=60000,options={windowsHide:true,encoding:'utf8',timeout};
 const deadline=retryTimeout?performance.now()+2*timeout:0;
 const csc=compilers[0];
 let r=spawnSync(csc,args,options);
 if(retryTimeout&&r.error?.code==='ETIMEDOUT'){
  const remaining=Math.floor(deadline-performance.now());
  if(remaining>0)r=spawnSync(csc,args,{...options,timeout:Math.min(timeout,remaining)});
 }
 assert.ifError(r.error);
 assert.equal(r.status,0,r.stdout+r.stderr);
}

module.exports={compileRoslyn,findRoslynCompiler};
