// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E667 (beta37/38 shipped MeguLitFont and MeguLitHook32 builds older than their merged sources: *.dll / *.exe are not tracked
   and Release.ps1 packages whatever sits in native/). For every native binary in native/native-builds.json: it must exist,
   be at least as new as the last commit that touched its sources (and as any uncommitted source file), and carry its marker
   string when one is listed. Build.ps1 rebuilds them first; Release.ps1 runs this and stops on any problem.
   Usage: node tools/native-stale.cjs [--ci]   (--ci: entries with "ci": false may be missing, they are not built there) */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const root=path.join(__dirname,'..');
function git(args){try{return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return '';}}
function sourceTime(sources){
 let t=Number(git(['log','-1','--format=%ct','--',...sources]))*1000||0;
 for(const line of git(['status','--porcelain','--',...sources]).split(/\r?\n/)){const f=line.slice(3).trim();if(!f)continue;
  try{t=Math.max(t,fs.statSync(path.join(root,f)).mtimeMs);}catch{}}
 return t;}
function check({ci=false}={}){
 const entries=JSON.parse(fs.readFileSync(path.join(root,'native','native-builds.json'),'utf8'));const problems=[],ok=[];
 for(const e of entries){const src=sourceTime(e.sources);
  for(const out of e.outputs){const f=path.join(root,out);
   if(!fs.existsSync(f)){if(!(ci&&e.ci===false))problems.push(out+' missing (build: '+e.build+')');continue;}
   const m=fs.statSync(f).mtimeMs;
   if(src&&m+1000<src)problems.push(out+' is older than its sources ('+new Date(m).toISOString()+' < '+new Date(src).toISOString()+'): rebuild with '+e.build);
   else if(e.marker&&!fs.readFileSync(f).includes(Buffer.from(e.marker,'latin1')))problems.push(out+' lacks "'+e.marker+'": an old build; rebuild with '+e.build);
   else ok.push(out);}}
 return {problems,ok,entries};}
module.exports={check,sourceTime};
if(require.main===module){const r=check({ci:process.argv.includes('--ci')});
 for(const o of r.ok)console.log('fresh '+o);for(const p of r.problems)console.error('STALE '+p);process.exit(r.problems.length?1:0);}
