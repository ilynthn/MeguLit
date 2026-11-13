// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const SUFFIX='.megulit-zh', MODIFIED='.megulit-ja-modified';
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const excluded=/^(?:saves?|savedata|savegames?|profiles?|userdata|manual|bgm|wav|koe|mov|movie|voice|license)(?:$|[._ -])|(?:\.sav|\.save|\.dat\.save|\.megulit-.+)$/i;
const utility=/^(?:unins|setup|install|config|launcher|patch|update)/i;
const regular=file=>fs.lstatSync(file,{throwIfNoEntry:false})?.isFile()===true;
function hash(file){
 const h=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024),fd=fs.openSync(file,'r');
 try{for(let n;(n=fs.readSync(fd,buffer,0,buffer.length,null));)h.update(buffer.subarray(0,n));return h.digest('hex');}
 finally{fs.closeSync(fd);}
}
/* E580 kit.peInfo */
function programType(file){const i=require('./original-engines/kit.cjs').peInfo(file);return i&&i.pe&&i.program?i.machine:0;}
function resolveIn(dir,rel){
 let cur=dir;
 for(const part of rel.split(/[\\/]/)){
  if(!part||part==='.'||part==='..'||part.includes(':'))throw Error('PATCH_UNSAFE_PATH');
  let hit;try{hit=fs.readdirSync(cur).find(n=>n.toLowerCase()===part.toLowerCase());}catch(e){if(e.code!=='ENOENT')throw e;}
  cur=path.join(cur,hit||part);
  if(fs.lstatSync(cur,{throwIfNoEntry:false})?.isSymbolicLink())throw Error('PATCH_UNSAFE_PATH');
 }
 return cur;
}
function walk(dir,depth=0,base=dir,out=[]){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(excluded.test(entry.name))continue;
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()&&depth<4)walk(file,depth+1,base,out);
  else if(entry.isFile())out.push(path.relative(base,file));
  if(out.length>5000)throw Error('PATCH_BACKUP_TOO_LARGE');
 }
 return out;
}
// DLL names embedded in both static imports and LoadLibrary calls can be inspected without executing the patch.
function localDlls(exe,dirs){
 if(!exe||!regular(exe)||fs.statSync(exe).size>32*1024*1024)return [];
 const bytes=fs.readFileSync(exe),names=new Set();
 for(const text of [bytes.toString('latin1'),bytes.toString('utf16le'),bytes.subarray(1).toString('utf16le')])
  for(const match of text.matchAll(/(?:^|[^a-z0-9_.-])([a-z0-9_][a-z0-9_.-]{0,63}\.dll)(?![a-z0-9_.-])/gi))names.add(match[1].toLowerCase());
 return [...names].filter(name=>dirs.some(dir=>regular(resolveIn(dir,name))));
}
function analyze(gameDir,patchedExe='',engine=''){
 const candidates=[];
 const rootEntries=fs.readdirSync(gameDir,{withFileTypes:true});
 const hosts=patchedExe?[patchedExe]:rootEntries.filter(e=>e.isFile()&&/\.exe$/i.test(e.name)&&/(?:[_ .-](?:sc|chs|cht|cn|zh)|汉化)\.exe$/i.test(e.name)).map(e=>path.join(gameDir,e.name));
 const directories=rootEntries.filter(e=>e.isDirectory()&&!excluded.test(e.name)).map(e=>path.join(gameDir,e.name));
 const hint=/bak|backup|orig|原版|备份|備份|japanese|(?:^|[_ -])jp(?:$|[_ -])/i;
 let incomplete='',hostDlls;
 const dirs=[gameDir,...hosts.map(file=>path.dirname(file))];
 for(const outer of directories){
  const nested=fs.readdirSync(outer,{withFileTypes:true}).filter(e=>e.isDirectory()&&!excluded.test(e.name));
  for(const backup of [outer,...nested.map(e=>path.join(outer,e.name))]){
   let files;try{files=walk(backup);}catch{continue;}
   const programs=files.filter(f=>/\.exe$/i.test(f)&&!utility.test(path.basename(f)));
   if(!programs.length)continue;
   const mirrored=files.filter(f=>!/\.exe$/i.test(f)&&regular(resolveIn(gameDir,f))).length;
   const named=hint.test(path.relative(gameDir,backup));
   if(!named&&mirrored<Math.max(1,Math.ceil((files.length-programs.length)*0.6)))continue;
   hostDlls??=hosts.flatMap(file=>localDlls(file,dirs));
   if(!mirrored&&!(named&&hostDlls.length))continue;
   const rank=f=>Number(/(?:^|[_. -])(?:original|ja|jp)(?:[_. -]|$)/i.test(path.basename(f)))*4+
      Number(/RealLive/i.test(engine)&&/^reallive\.exe$/i.test(path.basename(f)))*4+
      Number(hosts.some(host=>samePath(host,resolveIn(gameDir,f))))*2+
      Number(!f.includes(path.sep));
   programs.sort((a,b)=>rank(b)-rank(a));
   if(programs.length>1&&rank(programs[0])===rank(programs[1])){incomplete='PATCH_BACKUP_AMBIGUOUS';continue;}
   const exe=programs[0],original=path.join(backup,exe),originalDir=path.dirname(resolveIn(gameDir,exe));
   if(hosts.some(programType)&&!programType(original)){incomplete='PATCH_ORIGINAL_INCOMPLETE';continue;}
   const realLive=/RealLive/i.test(engine)||/^reallive\.exe$/i.test(path.basename(exe));
   const required=realLive?['SEEN.TXT','GAMEEXE.INI']:[],critical=[];
   for(const name of required){
    const rel=path.join(path.dirname(exe),name);
    const source=resolveIn(backup,rel),target=resolveIn(gameDir,rel);
    if(regular(source)&&fs.statSync(source).size>0)critical.push(rel);
    else if(regular(target)&&fs.statSync(target).size>0&&hostDlls.length&&!files.some(f=>!/\.(?:exe|dll|manifest)$/i.test(f)))critical.push(rel);
    else incomplete='PATCH_ORIGINAL_INCOMPLETE';
   }
   if(critical.length!==required.length)continue;
   const originalDlls=localDlls(original,[path.dirname(original),originalDir,gameDir]);
   const patchDlls=[...new Set(hostDlls)].filter(name=>!originalDlls.includes(name));
   if(!mirrored&&!patchDlls.length){incomplete='PATCH_ORIGINAL_NOT_IDENTIFIED';continue;}
   // DLLs loaded by the translated host can stay beside a separate original. Common DLLs
   // are swapped only when the backup provides their original bytes.
   const picked=files.filter(f=>!/\.exe(?:\.manifest)?$/i.test(f)||f===exe||f.toLowerCase()===exe.toLowerCase()+'.manifest');
   const kind=patchDlls.length?(picked.some(f=>!/\.exe$/i.test(f)&&(!regular(resolveIn(gameDir,f))||hash(resolveIn(gameDir,f))!==hash(path.join(backup,f))))?'mixed':'host-dll'):'file-backup';
   candidates.push({backup,files:picked,exe,critical,kind,patchDlls,score:mirrored*4+Number(named)*2+rank(exe)});
  }
 }
 candidates.sort((a,b)=>b.score-a.score);
 if(candidates.length>1&&candidates[0].score===candidates[1].score)return {issue:'PATCH_BACKUP_AMBIGUOUS'};
 if(candidates.length)return {plan:candidates[0]};
 return {issue:incomplete||(hosts.some(file=>/(?:[_ .-](?:sc|chs|cht|cn|zh)|汉化)\.exe$/i.test(path.basename(file))&&localDlls(file,[gameDir,path.dirname(file)]).length)?'PATCH_ORIGINAL_NOT_IDENTIFIED':'')};
}
function detect(gameDir,patchedExe='',engine=''){
 try{return analyze(gameDir,patchedExe,engine).plan||null;}catch{return null;}
}
const stateFile=root=>path.join(root,'data/config/patch-swap.json');
function readState(root){
 try{return JSON.parse(fs.readFileSync(stateFile(root),'utf8'))||{};}
 catch(error){if(error.code==='ENOENT')return {};throw Error('PATCH_STATE_INVALID');}
}
function save(root,id,value){
 const all=readState(root);if(value)all[id]=value;else delete all[id];
 fs.mkdirSync(path.dirname(stateFile(root)),{recursive:true});
 const temp=stateFile(root)+'.'+process.pid+'.tmp';
 fs.writeFileSync(temp,JSON.stringify(all,null,1));fs.renameSync(temp,stateFile(root));
}
function assertStopped(root,programs){
 const native=path.join(root,'native','GameProcess.exe'),tool=fs.existsSync(native)?native:path.join(__dirname,'../native/GameProcess.exe');
 for(const file of new Set(programs.filter(Boolean))){
  let out;
  /* E382 one retry with a longer wait: under load the check can time out once */
  const check=()=>execFileSync(tool,['--patch-check',file],{windowsHide:true,encoding:'utf8',timeout:8000}).trim();
  try{out=check();}catch{try{out=check();}catch{throw Error('PROCESS_QUERY_FAILED');}}
  if(out==='running')throw Error('GAME_RUNNING');
  if(out!=='absent')throw Error('PROCESS_QUERY_FAILED');
 }
}
function diagnostic(root,id,stage,error){
 try{fs.mkdirSync(path.join(root,'logs'),{recursive:true});fs.appendFileSync(path.join(root,'logs','game-launch.log'),JSON.stringify({at:new Date().toISOString(),gameId:id,stage,error})+'\n');}catch{}
}
function issueFor(dir,state){
 if(state.active!=='ja')return 'PATCH_RECOVERY_REQUIRED';
 const program=resolveIn(dir,state.exe);
 if(state.patchedExe&&programType(state.patchedExe+(regular(state.patchedExe+SUFFIX)?SUFFIX:''))&&!programType(program))return 'PATCH_ORIGINAL_INCOMPLETE';
 const required=state.critical||(/^reallive\.exe$/i.test(path.basename(state.exe))?['SEEN.TXT','GAMEEXE.INI'].map(n=>path.join(path.dirname(state.exe),n)):[]);
 return [state.exe,...required].some(rel=>{const file=resolveIn(dir,rel);return !regular(file)||!fs.statSync(file).size;})?'PATCH_ORIGINAL_INCOMPLETE':'';
}
function status(root,id,gameDir,patchedExe='',engine='',{activeOnly=false}={}){
 try{
  const state=readState(root)[id];
  if(state){
   const dir=state.gameDir||path.dirname(state.backup);
   if(!samePath(dir,gameDir))return {available:false,active:state.active,issue:'PATCH_DIRECTORY_CHANGED'};
   return {available:true,active:state.active,backup:state.backup,exe:state.exe,patchedExe:state.patchedExe,japaneseExecutable:resolveIn(dir,state.exe),issue:issueFor(dir,state),kind:state.kind};
  }
  if(activeOnly)return {available:false};
  const {plan,issue}=analyze(gameDir,patchedExe,engine);
  return plan?{available:true,active:'zh',backup:plan.backup,exe:plan.exe,japaneseExecutable:resolveIn(gameDir,plan.exe),kind:plan.kind}:{available:false,issue};
 }catch(error){return {available:false,issue:error.code==='ENOENT'?'':['PATCH_STATE_INVALID','PATCH_UNSAFE_PATH'].includes(error.message)?error.message:'PATCH_INSPECTION_FAILED'};}
}
function gameDirectory(root,id,exe,configured){
 let state;try{state=readState(root)[id];}catch{}
 if(state){const dir=state.gameDir||path.dirname(state.backup);if([state.patchedExe,path.join(dir,state.exe)].filter(Boolean).some(file=>samePath(file,exe)))return dir;}
 if(configured&&path.isAbsolute(configured)&&path.resolve(exe).toLowerCase().startsWith(path.resolve(configured).toLowerCase()+path.sep))return configured;
 return path.dirname(exe);
}
function restore(root,id,gameDir,state){
 if(!samePath(gameDir,state.gameDir||path.dirname(state.backup)))throw Error('PATCH_DIRECTORY_CHANGED');
 const files=[...state.files].reverse();
 for(const f of files){
  if(!samePath(resolveIn(gameDir,f.rel),f.target))throw Error('PATCH_UNSAFE_PATH');
  if(f.hadPatched&&!regular(f.target+SUFFIX)&&(!regular(f.target)||!f.patched||hash(f.target)!==f.patched))throw Error('PATCH_BACKUP_MISSING');
 }
 for(const f of files){
  if(f.hadPatched&&!regular(f.target+SUFFIX)){
   if(f.stage&&regular(f.stage))fs.unlinkSync(f.stage);
   continue; // The original rename never ran, or recovery already restored it.
  }
  if(regular(f.target)){
   if(hash(f.target)===f.original)fs.unlinkSync(f.target);
   else{
    let keep=f.target+MODIFIED;
    for(let i=1;fs.existsSync(keep);i++)keep=f.target+MODIFIED+'.'+i;
    fs.renameSync(f.target,keep);
   }
  }
  if(f.hadPatched)fs.renameSync(f.target+SUFFIX,f.target);
  if(f.stage&&regular(f.stage))fs.unlinkSync(f.stage);
  state.files=state.files.filter(entry=>entry!==f);save(root,id,state);
 }
 save(root,id,null);
}
function toJapanese(root,id,gameDir,patchedExe,engine=''){
 const current=readState(root)[id];
 if(current?.active==='ja')return status(root,id,gameDir);
 if(current)throw Error('PATCH_RECOVERY_REQUIRED');
 const {plan:d,issue}=analyze(gameDir,patchedExe,engine);
 if(!d)throw Error(issue||'PATCH_BACKUP_NOT_FOUND');
 assertStopped(root,[patchedExe,resolveIn(gameDir,d.exe)]);
 const journal={active:'switching-ja',gameDir,backup:d.backup,exe:d.exe,patchedExe:patchedExe||'',files:[],critical:d.critical,kind:d.kind};
 const changes=[];
 for(const rel of d.files){
  const source=resolveIn(d.backup,rel),target=resolveIn(gameDir,rel),hadPatched=regular(target);
  if(!regular(source)||(!hadPatched&&fs.existsSync(target))||fs.existsSync(target+SUFFIX))throw Error('PATCH_SWAP_CONFLICT');
  const original=hash(source),patched=hadPatched?hash(target):'';
  if(original!==patched)changes.push({rel,target,hadPatched,original,patched,stage:target+'.megulit-stage-'+crypto.randomUUID()});
 }
 save(root,id,journal);
 try{
  for(const f of changes){
   journal.files.push(f);save(root,id,journal);
   fs.mkdirSync(path.dirname(f.target),{recursive:true});
   fs.copyFileSync(resolveIn(d.backup,f.rel),f.stage,fs.constants.COPYFILE_EXCL);
   if(hash(f.stage)!==f.original)throw Error('PATCH_COPY_CHANGED');
   if(f.hadPatched)fs.renameSync(f.target,f.target+SUFFIX);
   fs.renameSync(f.stage,f.target);
  }
  journal.active='ja';
  const issue=issueFor(gameDir,journal);if(issue)throw Error(issue);
  save(root,id,journal);return status(root,id,gameDir);
 }catch(error){
  try{restore(root,id,gameDir,journal);}catch(rollback){diagnostic(root,id,'patch-rollback-failed',rollback.message);throw Error('PATCH_RECOVERY_REQUIRED');}
  throw error;
 }
}
function toTranslated(root,id,gameDir){
 const s=readState(root)[id];if(!s||s.active==='zh')return status(root,id,gameDir);
 assertStopped(root,[resolveIn(gameDir,s.exe),s.patchedExe]);
 if(s.patchedExe&&!regular(s.patchedExe)&&!regular(s.patchedExe+SUFFIX))throw Error('PATCH_TRANSLATED_MISSING');
 for(const f of s.files)if(f.hadPatched&&!f.patched&&regular(f.target+SUFFIX))f.patched=hash(f.target+SUFFIX);
 s.active='switching-zh';save(root,id,s);
 restore(root,id,gameDir,s);return status(root,id,gameDir,s.patchedExe);
}
module.exports={detect,status,toJapanese,toTranslated,resolveIn,gameDirectory,diagnostic,SUFFIX};
