// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Full uninstall (user 2026-11-12: "再加个全面清理的uninstall程序 删除的时候可以选要不要保留账户数据在本地").
   plan() lists everything MeguLit put on this PC and nothing else:
   - the install folder (with "keep data": data\ minus caches, and secrets\, stay where they are, next to a note);
   - what it changed in game folders, undone with the same code the app uses (patch swap back to the patch, Japanese
     restore / import backups put back, DirectPlay / .NET config files from .megulit-compat.json removed or restored);
   - its shortcuts (only .lnk files that point into this install), the Apps & features entry, registry values keyed by
     this install's own paths (compatibility mode, MUI cache, Program Compatibility Assistant), Tauri's per-user folders
     named after the app id, and megulit-* temp folders.
   A game file is only touched when a MeguLit manifest names it, and a file the user changed since is left in place.
   execute() runs the plan; registry, shortcut lookups and environment folders are injected so tests use fakes.
   setup/uninstall.ps1 is the window; it stops MeguLit first and removes the install folder itself after this exits
   (node.exe runs from inside it), using plan.root.remove. */
const fs=require('node:fs'),path=require('node:path');

const UNINSTALL_KEY='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MeguLit';
/* registry keys whose value NAMES are program paths; only values naming a file inside this install are removed */
const PATH_VALUE_KEYS=['HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers',
 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Compatibility Assistant\\Store',
 'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache'];
const SHORTCUTS=['MeguLit.lnk','Uninstall MeguLit.lnk'];
const APP_ID='app.megulit';
const KEEP_NOTE='MeguLit 保留的数据 - Kept data.txt';
/* data\ entries that are caches (rebuilt on demand) or version stamps: removed even when data is kept */
const DATA_CACHES=['cache','cg-cache','voice-cache','vocal-sep','diagnostics','hook-streams','update-installed.json','icon-refresh.json'];
const KEEP_TOP=['data','secrets'];
/* temp names the app itself creates (anki-process, bluebook, CX key cache, Unity voice); megulit-* folders made by
   the test suite or release script are not the app's and stay */
const TEMP_NAMES=/^megulit-(?:anki-|ankiconnect-|anki-hidden.txt$|cx|unity-voice)/i;
const LEFTOVER=/\.megulit-(?:tmp|new|stage-[0-9a-f-]{8,})$/i;

const norm=p=>path.resolve(String(p||'')).replace(/[\\/]+$/,'').toLowerCase();
const inside=(child,parent)=>{const c=norm(child),p=norm(parent);return c===p||c.startsWith(p+path.sep);};
const exists=p=>{try{fs.lstatSync(p);return true;}catch{return false;}};
const isDir=p=>{try{return fs.statSync(p).isDirectory();}catch{return false;}};
const readJSON=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return null;}};
const list=d=>{try{return fs.readdirSync(d);}catch{return [];}};

/* ---------- install folder ---------- */
function rootPlan(root,keepData){
 const remove=[],kept=[];
 for(const name of list(root)){
  const full=path.join(root,name);
  if(keepData&&KEEP_TOP.includes(name.toLowerCase())){
   if(name.toLowerCase()==='data'){for(const n of list(full)){const f=path.join(full,n);(DATA_CACHES.includes(n.toLowerCase())?remove:kept).push(f);}}
   else kept.push(full);
   continue;
  }
  if(keepData&&name===KEEP_NOTE){kept.push(full);continue;}
  remove.push(full);
 }
 return {path:root,remove,kept,note:keepData?path.join(root,KEEP_NOTE):''};
}

/* ---------- game folders ---------- */
function libraryGames(root){
 const out=[];const file=path.join(root,'data','megulit.sqlite');if(!exists(file))return out;
 let db;try{const {DatabaseSync}=require('node:sqlite');db=new DatabaseSync(file,{readOnly:true});
  for(const r of db.prepare("SELECT id,title,executable FROM games WHERE executable<>''").all())out.push({id:String(r.id),title:String(r.title||''),dir:path.dirname(String(r.executable))});
 }catch{}finally{try{db&&db.close();}catch{}}
 return out;
}
function patchStates(root){return readJSON(path.join(root,'data','config','patch-swap.json'))||{};}
function gameDirs(root,games){
 const map=new Map(),add=(dir,id,title)=>{if(!dir||!path.isAbsolute(dir))return;const k=norm(dir);if(!map.has(k))map.set(k,{dir:path.resolve(dir),ids:new Set(),title:title||''});const e=map.get(k);if(id)e.ids.add(id);if(title&&!e.title)e.title=title;};
 for(const g of games)add(g.dir,g.id,g.title);
 for(const [id,s] of Object.entries(patchStates(root)))if(s&&typeof s==='object')add(s.gameDir||(s.backup?path.dirname(s.backup):''),id,'');
 return [...map.values()];
}
function compatFiles(dir){
 for(const n of ['.megulit-compat.json','.megulit-directplay.json']){const m=readJSON(path.join(dir,n));if(!m)continue;
  const files=(Array.isArray(m.files)?m.files:[]).map(String).filter(f=>{const t=path.resolve(dir,f);return inside(t,dir)&&exists(t);});
  const configs=Object.keys(m.configs&&typeof m.configs==='object'?m.configs:{}).filter(f=>inside(path.resolve(dir,f),dir));
  return {files,configs};}
 return null;
}
function gamePlan(root,entry){
 const dir=entry.dir,actions=[];if(!isDir(dir))return null;
 const states=patchStates(root);
 for(const id of entry.ids){const s=states[id];if(s&&s.active!=='zh'&&norm(s.gameDir||path.dirname(s.backup||''))===norm(dir))actions.push({kind:'patch-swap',id});}
 if(exists(path.join(dir,'.megulit-japanese','manifest.json')))actions.push({kind:'jp-restore'});
 else if(isDir(path.join(dir,'.megulit-japanese')))actions.push({kind:'remove',path:path.join(dir,'.megulit-japanese'),what:'jp-restore-empty'});
 const im=readJSON(path.join(dir,'.megulit-japanese-import','manifest.json'));
 if(im)actions.push({kind:im.adapter==='original-files'?'jp-import-original':'jp-import'});
 else if(isDir(path.join(dir,'.megulit-japanese-import')))actions.push({kind:'remove',path:path.join(dir,'.megulit-japanese-import'),what:'jp-import-empty'});
 if(isDir(path.join(dir,'.megulit-japanese-staging')))actions.push({kind:'remove',path:path.join(dir,'.megulit-japanese-staging'),what:'staging'});
 const compat=compatFiles(dir);if(compat)actions.push({kind:'compat',...compat});
 for(const n of list(dir))if(LEFTOVER.test(n))actions.push({kind:'remove',path:path.join(dir,n),what:'leftover'});
 return actions.length?{dir,title:entry.title,actions}:null;
}

/* ---------- outside the install ---------- */
function shortcutPlan(root,env,readShortcuts){
 const files=[];for(const d of [env.desktop,env.programs,env.commonDesktop,env.commonPrograms].filter(Boolean))for(const n of SHORTCUTS){const f=path.join(d,n);if(exists(f))files.push(f);}
 if(!files.length)return [];
 const info=readShortcuts(files)||{};
 return files.filter(f=>{const s=info[f]||{};return [s.target,s.workdir].some(p=>p&&inside(p,root))||String(s.args||'').toLowerCase().includes(norm(root));});
}
function externalPlan(root,env){
 const out=[];
 for(const base of [env.localAppData,env.appData].filter(Boolean)){const f=path.join(base,APP_ID);if(exists(f))out.push({path:f,what:'app-data'});const w=path.join(base,'MeguLit.exe.WebView2');if(exists(w))out.push({path:w,what:'webview'});}
 if(env.temp)for(const n of list(env.temp))if(TEMP_NAMES.test(n)&&!inside(path.join(env.temp,n),root))out.push({path:path.join(env.temp,n),what:'temp'});
 return out;
}
function registryPlan(root,registry){
 const out=[];
 try{if(registry.exists(UNINSTALL_KEY))out.push({op:'deleteKey',key:UNINSTALL_KEY});}catch{}
 for(const key of PATH_VALUE_KEYS){let values=[];try{values=registry.values(key)||[];}catch{}
  for(const v of values){const name=String(v.name||'').replace(/\.(?:FriendlyAppName|ApplicationCompany)$/i,'');if(path.isAbsolute(name)&&inside(name,root))out.push({op:'deleteValue',key,name:v.name});}}
 return out;
}

function plan({root,keepData=true,env=defaultEnv(),registry=realRegistry(),readShortcuts=realShortcuts,games}={}){
 root=path.resolve(String(root||''));
 if(!exists(path.join(root,'MeguLit.exe'))&&!exists(path.join(root,'services','bridge.cjs')))throw Error('NOT_A_MEGULIT_FOLDER');
 const dirs=gameDirs(root,games||libraryGames(root)).filter(g=>!inside(g.dir,root));
 return {root:rootPlan(root,keepData),keepData:!!keepData,
  games:dirs.map(g=>gamePlan(root,g)).filter(Boolean),
  shortcuts:shortcutPlan(root,env,readShortcuts),
  external:externalPlan(root,env),
  registry:registryPlan(root,registry)};
}

/* ---------- execute ---------- */
function removePath(p){fs.rmSync(p,{recursive:true,force:true,maxRetries:3,retryDelay:200});}
function undoCompat(dir,a){
 const m=readJSON(path.join(dir,'.megulit-compat.json'))||readJSON(path.join(dir,'.megulit-directplay.json'))||{};
 const kept=[];
 for(const f of a.files){const t=path.resolve(dir,f);if(!inside(t,dir))continue;try{fs.rmSync(t,{force:true});}catch(e){kept.push(f);}}
 for(const f of a.configs){const t=path.resolve(dir,f),before=m.configs?.[f];if(typeof before==='string'&&inside(t,dir)){try{fs.writeFileSync(t,before);}catch{kept.push(f);}}}
 if(!kept.length)for(const n of ['.megulit-compat.json','.megulit-directplay.json'])fs.rmSync(path.join(dir,n),{force:true});
 return {skipped:kept};
}
function undoGame(root,g,modules){
 const M={patchSwap:()=>require('./patch-swap.cjs'),jpRestore:()=>require('../core/japanese-restore.cjs'),jpImport:()=>require('../core/japanese-import.cjs'),jpOriginal:()=>require('../core/japanese-import-original.cjs'),...modules};
 const results=[];
 for(const a of g.actions){
  try{
   let r={};
   if(a.kind==='patch-swap')r=M.patchSwap().toTranslated(root,a.id,g.dir)||{};
   else if(a.kind==='jp-restore')r=M.jpRestore().restore(g.dir)||{};
   else if(a.kind==='jp-import')r=M.jpImport().restore(g.dir)||{};
   else if(a.kind==='jp-import-original'){r=M.jpOriginal().restore(g.dir)||{};M.jpOriginal().cleanup(g.dir);}
   else if(a.kind==='compat')r=undoCompat(g.dir,a);
   else if(a.kind==='remove'){if(!inside(a.path,g.dir))throw Error('OUTSIDE_GAME');removePath(a.path);}
   const skipped=Array.isArray(r.skipped)?r.skipped:[];
   if(a.kind==='patch-swap'&&r.active&&r.active!=='zh')throw Error(r.issue||'PATCH_NOT_RESTORED');
   results.push({dir:g.dir,kind:a.kind,ok:!skipped.length,skipped});
  }catch(e){results.push({dir:g.dir,kind:a.kind,ok:false,error:e.message});}
 }
 return results;
}
function keepNote(file,root){
 const text=['MeguLit 已卸载，这里保留了你的本地数据（账户登录、游戏库、阅读记录、生词本、设置）',
  '把新的 MeguLit 解压或安装到这个文件夹（'+root+'）就能接着用；不需要的话直接删除整个文件夹即可',
  '  data\\      游戏库与阅读记录（megulit.sqlite）、生词本、设置与账户（data\\config，含 secrets.dpapi 登录令牌）、自定义封面',
  '  secrets\\   中继服务的本地密钥','',
  'MeguLit was uninstalled. Your local data (account sign-in, library, reading history, vocabulary, settings) is kept here.',
  'Install MeguLit into this folder again to continue, or delete the whole folder if you no longer need it.',''].join('\r\n');
 fs.writeFileSync(file,'\ufeff'+text);
}
function execute(p,{leaveRoot=false,registry=realRegistry(),modules={}}={}){
 const report={games:[],registry:[],files:[],failed:[]};
 for(const g of p.games)for(const r of undoGame(p.root.path,g,modules)){report.games.push(r);if(!r.ok)report.failed.push({what:'game',path:r.dir,kind:r.kind,error:r.error||'SKIPPED_CHANGED_FILES',skipped:r.skipped});}
 for(const r of p.registry){try{if(r.op==='deleteKey')registry.deleteKey(r.key);else registry.deleteValue(r.key,r.name);report.registry.push(r);}catch(e){report.failed.push({what:'registry',key:r.key,name:r.name,error:e.message});}}
 for(const f of [...p.shortcuts,...p.external.map(e=>e.path)]){try{removePath(f);report.files.push(f);}catch(e){report.failed.push({what:'file',path:f,error:e.message});}}
 if(!leaveRoot){
  for(const f of p.root.remove){try{removePath(f);report.files.push(f);}catch(e){report.failed.push({what:'file',path:f,error:e.message});}}
  if(!p.keepData)try{fs.rmdirSync(p.root.path);}catch{}
 }
 if(p.keepData){try{keepNote(p.root.note,p.root.path);}catch(e){report.failed.push({what:'file',path:p.root.note,error:e.message});}}
 return report;
}


/* ---------- Apps & features entry ----------
   setup writes it on a fresh install; installs from before 1.4.7 (and a moved folder) get it here, from the update check.
   Written only for a real MeguLit folder that holds the uninstaller, never for test or temp folders. */
let registering=null;
function uninstallCommand(root){const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');return '"'+ps+'" -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "'+path.join(root,'setup','uninstall.ps1')+'" -Root "'+root+'"';}
function entryValues(root,version){return [['DisplayName','REG_SZ','MeguLit'],['DisplayIcon','REG_SZ',path.join(root,'MeguLit.exe')+',0'],['DisplayVersion','REG_SZ',String(version||'')],['Publisher','REG_SZ','ilynthn'],['InstallLocation','REG_SZ',root],['URLInfoAbout','REG_SZ','https://megulit.com'],['UninstallString','REG_SZ',uninstallCommand(root)],['NoModify','REG_DWORD','1'],['NoRepair','REG_DWORD','1']];}
function registrable(root){
 if(!root||process.env.NODE_TEST_CONTEXT||process.env.MEGULIT_NO_UNINSTALL_ENTRY)return false;
 if(!exists(path.join(root,'MeguLit.exe'))||!exists(path.join(root,'setup','uninstall.ps1')))return false;
 return !inside(root,require('node:os').tmpdir());
}
function register(root,version,{registry=realRegistry()}={}){
 root=path.resolve(String(root||''));const want=entryValues(root,version);
 const have=new Map((registry.values(UNINSTALL_KEY)||[]).map(v=>[v.name,String(v.data)]));
 const stale=want.filter(([n,type,d])=>type==='REG_DWORD'?!have.has(n):have.get(n)!==d);
 for(const [n,type,d] of stale)registry.set(UNINSTALL_KEY,n,type,d);
 return stale.length;
}
function registerSoon(root,version){
 if(registering||!registrable(path.resolve(String(root||''))))return registering;
 registering=new Promise(r=>setTimeout(r,15000).unref()).then(()=>register(root,version)).catch(()=>0);
 return registering;
}

/* ---------- real environment ---------- */
function defaultEnv(){
 const e=process.env,home=e.USERPROFILE||'',appData=e.APPDATA||path.join(home,'AppData','Roaming');
 return {localAppData:e.LOCALAPPDATA||path.join(home,'AppData','Local'),appData,temp:e.TEMP||require('node:os').tmpdir(),
  desktop:e.MEGULIT_DESKTOP||path.join(home,'Desktop'),programs:e.MEGULIT_PROGRAMS||path.join(appData,'Microsoft','Windows','Start Menu','Programs'),
  commonDesktop:e.PUBLIC?path.join(e.PUBLIC,'Desktop'):'',commonPrograms:e.ProgramData?path.join(e.ProgramData,'Microsoft','Windows','Start Menu','Programs'):''};
}
function reg(args){return require('node:child_process').execFileSync(path.join(process.env.SystemRoot||'C:\\Windows','System32','reg.exe'),args,{encoding:'utf8',windowsHide:true,timeout:15000,stdio:['ignore','pipe','ignore']});}
function realRegistry(){
 return {
  exists(key){try{reg(['query',key]);return true;}catch{return false;}},
  values(key){let out='';try{out=reg(['query',key]);}catch{return [];}
   const vals=[];for(const line of out.split(/\r?\n/)){const m=/^ {4}(.+?) {4}(REG_[A-Z_]+)(?: {4}(.*))?$/.exec(line);if(m)vals.push({name:m[1],type:m[2],data:m[3]||''});}return vals;},
  deleteKey(key){reg(['delete',key,'/f']);},
  deleteValue(key,name){reg(['delete',key,'/v',name,'/f']);},
  set(key,name,type,data){reg(['add',key,'/v',name,'/t',type,'/d',String(data),'/f']);}};
}
// The paths go through the environment, one per line. Passed after -Command they were split at every space, so the Start
// menu shortcuts ("...\Start Menu\Programs\...") and "Uninstall MeguLit.lnk" were never read and stayed behind.
function realShortcuts(files){
 const ps="[Console]::OutputEncoding=[Text.Encoding]::UTF8;$s=New-Object -ComObject WScript.Shell;$o=@{};foreach($f in ($env:MEGULIT_LNKS -split [char]10)){if(-not $f){continue};try{$l=$s.CreateShortcut($f);$o[$f]=@{target=$l.TargetPath;args=$l.Arguments;workdir=$l.WorkingDirectory}}catch{}};$o|ConvertTo-Json -Compress";
 try{const out=require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,MEGULIT_LNKS:files.join('\n')}});return JSON.parse(out.replace(/^\ufeff/,'')||'{}');}catch{return {};}
}

/* ---------- command line: node services/uninstall.cjs --root <dir> [--no-keep-data] [--dry-run] [--json] [--leave-root] ---------- */
function describe(p){
 const lines=['MeguLit uninstall plan for '+p.root.path,'keep local data: '+(p.keepData?'yes':'no'),'','Install folder - remove:'];
 for(const f of p.root.remove)lines.push('  - '+f);
 if(p.root.kept.length){lines.push('Install folder - keep:');for(const f of p.root.kept)lines.push('  = '+f);}
 lines.push('Game folders:');if(!p.games.length)lines.push('  (nothing MeguLit changed)');
 for(const g of p.games){lines.push('  '+g.dir+(g.title?'  ('+g.title+')':''));for(const a of g.actions)lines.push('    * '+a.kind+(a.path?' '+a.path:'')+(a.files?' files: '+a.files.join(', '):'')+(a.configs&&a.configs.length?' restore: '+a.configs.join(', '):''));}
 lines.push('Shortcuts:');for(const f of p.shortcuts)lines.push('  - '+f);
 lines.push('Other folders:');for(const e of p.external)lines.push('  - '+e.path+'  ['+e.what+']');
 lines.push('Registry:');for(const r of p.registry)lines.push('  - '+r.key+(r.name?'  value '+r.name:''));
 return lines.join('\n');
}
if(require.main===module){
 const argv=process.argv.slice(2),arg=n=>{const i=argv.indexOf(n);return i>=0?argv[i+1]:'';},has=n=>argv.includes(n);
 try{
  const p=plan({root:arg('--root')||path.join(__dirname,'..'),keepData:!has('--no-keep-data')});
  if(has('--dry-run')){process.stdout.write(has('--json')?JSON.stringify(p):describe(p)+'\n');}
  else{const r=execute(p,{leaveRoot:has('--leave-root')});process.stdout.write(has('--json')?JSON.stringify({plan:p,report:r}):describe(p)+'\n\nfailed: '+r.failed.length+'\n'+r.failed.map(f=>'  ! '+(f.path||f.key)+' '+f.error).join('\n')+'\n');}
 }catch(e){process.stdout.write(has('--json')?JSON.stringify({error:e.message}):'error: '+e.message+'\n');process.exitCode=1;}
}
module.exports={plan,execute,register,registerSoon,uninstallCommand,describe,keepNote,UNINSTALL_KEY,PATH_VALUE_KEYS,KEEP_NOTE,DATA_CACHES,_internal:{rootPlan,gamePlan,gameDirs,registryPlan,shortcutPlan,externalPlan,realRegistry,realShortcuts}};
