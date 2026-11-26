// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 开测前把这部游戏的存档目录快照下来，测完和中止时原样还回去；找不到存档位置的游戏不测) the save guard of the
   idle-time cold test (docs/cold-test.md).

   locate(game, env) finds where a game keeps its saves, from the engine and the game's own files:
     game folder     savedata / save / saves / userdata / … one level deep; RPG Maker www/save; Ren'Py game/saves;
                     loose save files in the folder itself (*.sav, *.ksd, save*.dat …) and its small settings files
     user folders    %APPDATA%, %LOCALAPPDATA%, LocalLow, Documents (+ My Games), Saved Games: a folder (one or two levels
                     deep) named like the exe, the title, the Unity company/product (<exe>_Data/app.info) or the Ren'Py
                     config.save_directory
     predicted       where the engine will write on a first start (Unity LocalLow/<company>/<product>, Ren'Py
                     %APPDATA%/RenPy/<dir>, KiriKiri savedata): it does not exist yet, so restoring = removing it again
   A game with no place found and none predicted is not tested.

   snapshot(root, places) copies every existing place into data/cold-test/snap/<id>/ and writes a journal first, so a crash
   in the middle is undone at the next start (pending() + restore()). restore(journal) puts every place back exactly:
   an existing one replaced by its copy (times kept), a predicted one removed, the loose files of the game folder rewritten,
   new loose files removed. sweep() lists user folders written during the run that were not guarded (reported, never
   touched: the game is then not cold-tested again). */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

const MAX_BYTES=512*1024*1024,LOOSE_MAX=4*1024*1024,LOOSE_TOTAL=32*1024*1024;
const IN_GAME=/^(save|saves|savedata|save_data|savefile|savefiles|sav|userdata|user_data|usersave|playdata|systemdata)$/i;
const LOOSE_SAVE=/(\.(sav|ksd|kdt|rvdata2?|rpgsave|rmmzsave|save)$)|(^(save|system|global|config|sys)[\w-]*\.(dat|bin|ini|cfg|json)$)|(\.(ini|cfg)$)/i;
const NEVER=/\.(exe|dll|xp3|arc|pak|pck|npa|ypf|int|cpk|pac|nsa|sar|mpk|afs|gxp|ain|ogg|wav|mp4|wmv|mpg|png|jpg|bmp|ttf|otf)$/i;
const GENERIC=new Set(['data','game','games','save','saves','system','config','user','setup','launcher','start','main','app','player','windows','microsoft','temp','cache','steam','unity','renpy','renpyy']);

const fold=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s　・_\-.:：!！?？~〜「」『』【】()（）\[\]'"`,、。]/g,'');

/* the user folders saves live in */
function userRoots(env=process.env){const home=env.USERPROFILE||'';const docs=env.MEGULIT_DOCUMENTS||(home?path.join(home,'Documents'):'');const out=[];
 const add=(p,kind)=>{if(p)out.push({path:p,kind});};
 add(env.APPDATA,'roaming');add(env.LOCALAPPDATA,'local');if(env.LOCALAPPDATA)add(path.join(path.dirname(env.LOCALAPPDATA),'LocalLow'),'locallow');
 add(docs,'documents');if(docs)add(path.join(docs,'My Games'),'documents');if(home)add(path.join(home,'Saved Games'),'savedgames');return out;}

/* Unity: <exe>_Data/app.info = company \n product */
function unityInfo(exe){try{const t=fs.readFileSync(path.join(path.dirname(exe),path.basename(exe,path.extname(exe))+'_Data','app.info'),'utf8').split(/\r?\n/);if(t[0]&&t[1])return {company:t[0].trim(),product:t[1].trim()};}catch{}return null;}
/* Ren'Py: config.save_directory in game/options.rpy (or any .rpy at the top of game/) */
function renpyDir(folder){let files=[];try{files=fs.readdirSync(path.join(folder,'game')).filter(f=>/\.rpy$/i.test(f));}catch{return '';}
 for(const f of files.sort((a,b)=>(a==='options.rpy'?-1:0)-(b==='options.rpy'?-1:0))){try{const m=/config\.save_directory\s*=\s*["']([^"']+)["']/.exec(fs.readFileSync(path.join(folder,'game',f),'utf8'));if(m)return m[1];}catch{}}return '';}

const isDir=p=>{try{return fs.statSync(p).isDirectory();}catch{return false;}};
const list=p=>{try{return fs.readdirSync(p,{withFileTypes:true});}catch{return [];}};

/* names a user folder of this game may carry */
function namesOf(game){const exe=String(game.exe||'');const out=new Set();const add=s=>{const f=fold(s);if(f.length>=3&&!GENERIC.has(f))out.add(f);};
 add(path.basename(exe,path.extname(exe)));add(game.title);for(const t of game.titles||[])add(t);
 const u=exe?unityInfo(exe):null;if(u){add(u.product);}return out;}

/* -> {ok, places:[{path, kind, exists, predicted?, loose?}], why} */
function locate(game,env=process.env){const exe=String(game?.exe||'');if(!exe)return {ok:false,places:[],why:'没有游戏程序'};
 const folder=path.dirname(exe),engine=String(game.engine||'').toLowerCase(),places=[],seen=new Set();
 const put=(p,kind,extra={})=>{const k=path.resolve(p).toLowerCase();if(seen.has(k))return;seen.add(k);places.push({path:path.resolve(p),kind,exists:isDir(p),...extra});};
 /* the game folder */
 for(const e of list(folder))if(e.isDirectory()&&IN_GAME.test(e.name))put(path.join(folder,e.name),'game');
 for(const sub of [['www','save'],['save'],['game','saves']]){const p=path.join(folder,...sub);if(isDir(p))put(p,'game');}
 /* user folders named after the game */
 const names=namesOf(game);
 for(const r of userRoots(env)){for(const a of list(r.path)){if(!a.isDirectory())continue;const fa=fold(a.name);
   if(names.has(fa)){put(path.join(r.path,a.name),r.kind);continue;}
   /* a vendor folder: <vendor>/<game> */
   for(const b of list(path.join(r.path,a.name)))if(b.isDirectory()&&names.has(fold(b.name)))put(path.join(r.path,a.name,b.name),r.kind);}}
 /* predicted by the engine (may not exist yet) */
 const roots=Object.fromEntries(userRoots(env).map(r=>[r.kind,r.path]));
 const u=unityInfo(exe);if(u&&roots.locallow)put(path.join(roots.locallow,u.company,u.product),'locallow',{predicted:true});
 const rd=renpyDir(folder);if(rd&&env.APPDATA)put(path.join(env.APPDATA,'RenPy',rd),'roaming',{predicted:true});
 if(/kirikiri|krkr/.test(engine))put(path.join(folder,'savedata'),'game',{predicted:true});
 /* 2026-11-26 (バトラーズ～召しませお嬢様: no save place, the cold test refused) BGI / Ethornell writes UserData next to the program on a first start */
 if(/^bgi|ethornell/.test(engine))put(path.join(folder,'UserData'),'game',{predicted:true});
 /* loose save and settings files in the game folder itself */
 const loose=list(folder).filter(e=>e.isFile()&&LOOSE_SAVE.test(e.name)&&!NEVER.test(e.name)).map(e=>e.name);
 const usable=places.filter(p=>p.exists||p.predicted);
 /* settings files alone are not a save place: a game that keeps its saves elsewhere (the registry) is not tested */
 if(!usable.length&&!loose.some(n=>!/\.(ini|cfg)$/i.test(n)))return {ok:false,places:[],why:'找不到存档位置'};
 return {ok:true,places:usable,loose:{folder,names:loose},why:'',game:{exe,title:game.title||'',titles:game.titles||[]}};}

function sizeOf(p,cap=MAX_BYTES){let n=0;const walk=d=>{for(const e of list(d)){const f=path.join(d,e.name);if(e.isDirectory())walk(f);else{try{n+=fs.statSync(f).size;}catch{}}if(n>cap)return;}};walk(p);return n;}
function copyTree(from,to){fs.cpSync(from,to,{recursive:true,force:true,preserveTimestamps:true,errorOnExist:false});}
/* a fingerprint of a tree: relative path + size + mtime + content hash of each file (restore is checked against it) */
function treeStamp(p){const h=crypto.createHash('sha256');const walk=(d,rel)=>{for(const e of list(d).sort((a,b)=>a.name<b.name?-1:1)){const f=path.join(d,e.name),r=rel+'/'+e.name;if(e.isDirectory()){h.update('D'+r);walk(f,r);}else{try{h.update('F'+r+'|'+fs.readFileSync(f).toString('base64'));}catch{h.update('X'+r);}}}};if(isDir(p))walk(p,'');else h.update('none');return h.digest('hex');}

const snapDir=root=>path.join(root,'data','cold-test','snap');
const journalFile=(root,id)=>path.join(snapDir(root),id,'journal.json');

/* -> {ok, journal, why}; the journal is on disk before anything is copied */
function snapshot(root,located,{id=Date.now().toString(36),key='',cap=MAX_BYTES}={}){
 const places=located.places||[];let total=0;for(const p of places)if(p.exists){total+=sizeOf(p.path,cap+1);if(total>cap)return {ok:false,why:'存档太大（超过 '+Math.round(cap/1048576)+' MB）'};}
 const base=path.join(snapDir(root),id);fs.mkdirSync(base,{recursive:true});
 const loose=[];let looseBytes=0;const lf=located.loose||{folder:'',names:[]};
 for(const name of lf.names||[]){const f=path.join(lf.folder,name);let st;try{st=fs.statSync(f);}catch{continue;}if(st.size>LOOSE_MAX||(looseBytes+=st.size)>LOOSE_TOTAL)continue;loose.push({name,copy:'loose-'+loose.length});}
 const looseBefore=lf.folder?list(lf.folder).filter(e=>e.isFile()).map(e=>e.name):[];
 const journal={schema:'megulit.cold-snapshot',version:1,id,key,at:new Date().toISOString(),state:'writing',
  places:places.map((p,i)=>({path:p.path,kind:p.kind,existed:p.exists,copy:p.exists?'place-'+i:'',stamp:''})),loose:{folder:lf.folder||'',files:loose,before:looseBefore}};
 fs.writeFileSync(journalFile(root,id),JSON.stringify(journal,null,1));
 try{for(const p of journal.places)if(p.existed){copyTree(p.path,path.join(base,p.copy));p.stamp=treeStamp(p.path);}
  for(const f of journal.loose.files)fs.copyFileSync(path.join(journal.loose.folder,f.name),path.join(base,f.copy));
  journal.state='ready';fs.writeFileSync(journalFile(root,id),JSON.stringify(journal,null,1));}
 catch(e){try{fs.rmSync(base,{recursive:true,force:true});}catch{}return {ok:false,why:'存档快照失败：'+String(e?.message||e).slice(0,80)};}
 return {ok:true,journal};}

/* puts everything back; -> {ok, errors[]}. Safe to run twice (a crash during restore runs it again at the next start) */
function restore(root,journal){const base=path.join(snapDir(root),journal.id),errors=[];
 if(Object.prototype.hasOwnProperty.call(journal,'coldCleanup')&&journal.coldCleanup?.state!=='confirmed')return {ok:false,errors:['COLD_CLEANUP_UNCONFIRMED']};
 if(journal.state==='writing'){/* the game never started: nothing to undo, only the half copy to drop */try{fs.rmSync(base,{recursive:true,force:true});}catch{}return {ok:true,errors};}
 journal.state='restoring';try{fs.writeFileSync(journalFile(root,journal.id),JSON.stringify(journal,null,1));}catch{}
 for(const p of journal.places){try{
   if(p.existed){const copy=path.join(base,p.copy);if(!isDir(copy)){errors.push('missing copy '+p.copy);continue;}fs.rmSync(p.path,{recursive:true,force:true});copyTree(copy,p.path);
    if(p.stamp&&treeStamp(p.path)!==p.stamp)errors.push('restored tree differs '+p.copy);}
   else if(fs.existsSync(p.path))fs.rmSync(p.path,{recursive:true,force:true});}
  catch(e){errors.push(String(e?.message||e).slice(0,120));}}
 const L=journal.loose||{};if(L.folder){
  for(const f of L.files||[]){try{const src=path.join(base,f.copy),dst=path.join(L.folder,f.name);const st=fs.statSync(src);fs.copyFileSync(src,dst);fs.utimesSync(dst,st.atime,st.mtime);}catch(e){errors.push(String(e?.message||e).slice(0,120));}}
  const before=new Set((L.before||[]).map(s=>s.toLowerCase()));
  for(const e of list(L.folder))if(e.isFile()&&!before.has(e.name.toLowerCase())&&!NEVER.test(e.name)){try{fs.rmSync(path.join(L.folder,e.name),{force:true});}catch(x){errors.push(String(x?.message||x).slice(0,120));}}}
 if(!errors.length){try{fs.rmSync(base,{recursive:true,force:true});}catch{}}
 else{journal.state='failed';journal.errors=errors;try{fs.writeFileSync(journalFile(root,journal.id),JSON.stringify(journal,null,1));}catch{}}
 return {ok:!errors.length,errors};}

/* snapshots a crash left behind (restored first at the next start) */
function pending(root){const out=[];for(const e of list(snapDir(root))){if(!e.isDirectory())continue;try{const j=JSON.parse(fs.readFileSync(journalFile(root,e.name),'utf8'));if(j&&j.schema==='megulit.cold-snapshot'&&j.state!=='failed')out.push(j);}catch{}}return out;}
function failed(root){const out=[];for(const e of list(snapDir(root))){try{const j=JSON.parse(fs.readFileSync(journalFile(root,e.name),'utf8'));if(j?.state==='failed')out.push(j);}catch{}}return out;}

/* user folders (two levels) written after `since` (ms) that no place covers: what the game may have written unguarded */
function sweep(located,since,env=process.env,{ignore=[]}={}){const guarded=(located.places||[]).map(p=>path.resolve(p.path).toLowerCase());const out=[];
 const covered=p=>{const k=path.resolve(p).toLowerCase();return guarded.some(g=>k===g||k.startsWith(g+path.sep)||g.startsWith(k+path.sep));};
 const names=namesOf(located.game||{});
 for(const r of userRoots(env))for(const a of list(r.path)){if(!a.isDirectory())continue;const pa=path.join(r.path,a.name);
  const hit=names.size?names.has(fold(a.name))||list(pa).some(b=>b.isDirectory()&&names.has(fold(b.name))):false;if(!hit)continue;
  let st;try{st=fs.statSync(pa);}catch{continue;}if(st.mtimeMs>=since&&!covered(pa)&&!ignore.includes(pa))out.push(pa);}
 return out;}

module.exports={MAX_BYTES,locate,snapshot,restore,pending,failed,sweep,userRoots,unityInfo,renpyDir,treeStamp,fold,namesOf,snapDir};
