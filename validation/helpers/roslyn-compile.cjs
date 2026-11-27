// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');

const compilers=[process.env.MEGULIT_ROSLYN_CSC,'E:/Apps/build-tools/vs2022/MSBuild/Current/Bin/Roslyn/csc.exe'].filter(Boolean);

function findRoslynCompiler(){
 return compilers.find(file=>fs.existsSync(file));
}

function compileRoslyn(args){
 const r=spawnSync(compilers[0],args,{windowsHide:true,encoding:'utf8',timeout:60000});
 assert.ifError(r.error);
 assert.equal(r.status,0,r.stdout+r.stderr);
}

module.exports={compileRoslyn,findRoslynCompiler};
