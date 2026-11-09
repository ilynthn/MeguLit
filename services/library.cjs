// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {openStore}=require('./store.cjs');
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
function signature(file,saved){try{const stat=fs.statSync(file);if(!stat.isFile())return null;if(saved?.size===stat.size&&saved?.mtime===stat.mtimeMs)return saved;const hash=crypto.createHash('sha256'),chunk=Buffer.alloc(1024*1024),fd=fs.openSync(file,'r');try{let length;while((length=fs.readSync(fd,chunk,0,chunk.length,null)))hash.update(chunk.subarray(0,length));}finally{fs.closeSync(fd);}return {size:stat.size,mtime:stat.mtimeMs,hash:hash.digest('hex')};}catch{return saved||null;}}
const canonical=file=>file?require('./launch-path.cjs').canonical(file).toLowerCase():'';
function knownPrograms(row,lib){
 return [row.executable,lib.languageLaunch?.exe,...Object.values(lib.languageExecutables||{}),...(lib.variants||[]).map(v=>v.exe)].filter(file=>typeof file==='string'&&file);
}
function matchGame(db,item,{manual=false}={}){
 if(item.mediaId!=null){const row=db.prepare('SELECT * FROM games WHERE legacy_id=?').get(item.mediaId);if(row)return row;}
 if(!item.exe)return null;
 const target=canonical(item.exe),exact=db.prepare("SELECT * FROM games WHERE lower(executable)=lower(?) AND executable!=''").all(item.exe);
 if(exact.length===1)return exact[0];
 if(exact.length>1)return null;
 const names=new Set([item.title,...item.names||[]].map(normalize).filter(Boolean));
 let sig;
 const matches=db.prepare('SELECT * FROM games').all().filter(row=>{
  if(item.mediaId!=null&&row.legacy_id!=null&&item.mediaId!==row.legacy_id)return false;
  const lib=JSON.parse(row.original||'{}').library||{};
  if(knownPrograms(row,lib).some(file=>canonical(file)===target))return true;
  if(!item.missing&&row.executable&&canonical(lib.dir)===canonical(item.dir)&&(item.variants||[]).some(variant=>canonical(variant.exe)===canonical(row.executable)))return true;
  // The scanner keys a work by its install folder; another program in that same folder (crack/original/launcher
  // swap) is the same work, never a second library entry.
  if(item.key&&lib.key===item.key&&!(item.vndbId&&lib.vndbId&&item.vndbId!==lib.vndbId)&&!(item.appid&&lib.appid&&String(item.appid)!==String(lib.appid))&&canonical(lib.dir)===canonical(item.dir||path.dirname(item.exe)))return true;
  if(item.missing||(!row.removed_at&&fs.existsSync(row.executable)))return false;
  if(item.appid&&lib.appid)return String(item.appid)===String(lib.appid);
  if(item.vndbId&&lib.vndbId)return item.vndbId===lib.vndbId;
  if(![row.title,...lib.names||[]].some(name=>names.has(normalize(name))))return false;
  const dir=item.dir||path.dirname(item.exe),oldDir=lib.dir||(row.executable&&path.dirname(row.executable));
  if(oldDir&&canonical(oldDir)===canonical(dir)&&(manual||item.engine&&item.engine===lib.engine))return true;
  if(!lib.executableSignature?.hash)return false;
  sig??=signature(item.exe)||{};
  return lib.executableSignature.hash===sig.hash;
 });
 // Legacy duplicates of one folder key: keep updating one row instead of adding a third.
 if(matches.length>1&&item.key&&matches.every(row=>JSON.parse(row.original||'{}').library?.key===item.key))return matches.find(row=>canonical(row.executable)===target&&row.removed_at==null)||matches.find(row=>row.removed_at==null)||matches[0];
 return matches.length===1?matches[0]:null;
}
function activeGameForProgram(db,exe){
 if(!exe)return null;
 const target=canonical(exe),rows=db.prepare('SELECT * FROM games WHERE removed_at IS NULL').all();
 const exact=rows.filter(row=>canonical(row.executable)===target);
 if(exact.length)return exact.length===1?exact[0]:null;
 const variants=rows.filter(row=>knownPrograms(row,JSON.parse(row.original||'{}').library||{}).some(file=>canonical(file)===target));
 return variants.length===1?variants[0]:null;
}
function reconcile(root,items,{restoreRemoved=false}={}){const db=openStore(root);let added=0,updated=0,committed=false;db.exec('BEGIN IMMEDIATE');try{
 if(restoreRemoved){const revive=db.prepare('UPDATE games SET removed_at=NULL WHERE id=?');for(const row of db.prepare('SELECT id,executable FROM games WHERE removed_at IS NOT NULL').all())if(row.executable&&fs.statSync(row.executable,{throwIfNoEntry:false})?.isFile())revive.run(row.id);}
 for(const item of items){
 const existing=matchGame(db,item);
 if(item.steamRejected){
  if(existing&&existing.source!=='manual'){
   const original=JSON.parse(existing.original||'{}');
   if(!original.vndbManual){
    original.library={...original.library,...item};
    db.prepare('UPDATE games SET removed_at=COALESCE(removed_at,?),original=? WHERE id=?').run(Math.floor(Date.now()/1000),JSON.stringify(original),existing.id);
    updated++;
   }
  }
  continue;
 }
 // Passive scans leave a removed installation hidden until its executable changes.
 if(existing?.removed_at!=null){if(item.missing||!item.exe||String(existing.executable||'').toLowerCase()===String(item.exe).toLowerCase()||!fs.existsSync(item.exe))continue;db.prepare('UPDATE games SET removed_at=NULL WHERE id=?').run(existing.id);existing.removed_at=null;}
 if(item.missing&&existing?.executable&&existing.executable.toLowerCase()!==String(item.exe||'').toLowerCase()&&fs.existsSync(existing.executable))continue;
 const cover=path.win32.basename(item.cover||''),original=existing?JSON.parse(existing.original):{},saved=original.library||{};original.library={...saved,...item,executableSignature:signature(item.exe,saved.executableSignature)};if(saved.localeMode)original.library.localeMode=saved.localeMode;
 const selected=existing&&saved.contentLanguage&&saved.languageExecutables?.[saved.contentLanguage];
 const preserve=existing&&((saved.originalExecutableVerified&&fs.existsSync(existing.executable))||selected&&canonical(saved.dir)===canonical(item.dir));
 const executable=preserve?existing.executable:item.exe||existing?.executable||'';
 if(preserve){original.library.dir=saved.dir;original.library.exe=executable;original.library.contentLanguage=saved.contentLanguage;}
 if(!item.missing&&executable&&item.source!=='steam'){
  const patch=require('./patch-swap.cjs'),dir=patch.gameDirectory(root,existing?.id||'',executable,item.dir);
  const check=patch.status(root,existing?.id||'',dir,executable,item.engine);
  if(check.issue&&check.issue!==saved.patchIssue)patch.diagnostic(root,existing?.id||item.key||'','patch-scan',check.issue);
  original.library.patchIssue=check.issue||'';
 }
 const coverChanged=item.source==='steam'&&saved.vndbId!==item.vndbId&&!original.coverCustom&&!original.vndbManual;
 if(existing){db.prepare("UPDATE games SET title=?,executable=?,cover=CASE WHEN ? THEN ? WHEN cover='' AND ?!='' THEN ? ELSE cover END,source=?,original=? WHERE id=?").run(existing.title||item.title,executable,Number(coverChanged),cover,cover,cover,existing.source==='manual'?'manual':item.source||existing.source,JSON.stringify(original),existing.id);updated++;}
 else if(!item.missing){
  const legacy=Number.isSafeInteger(item.mediaId)?item.mediaId:null,preferred=legacy==null?'':'game-'+legacy;
  const id=preferred&&!db.prepare('SELECT 1 FROM games WHERE id=?').get(preferred)?preferred:'game-'+crypto.randomUUID();
  db.prepare('INSERT INTO games(id,legacy_id,title,executable,cover,source,original) VALUES(?,?,?,?,?,?,?)').run(id,legacy,item.title||path.win32.basename(item.exe||''),executable,cover,item.source||'scan',JSON.stringify(original));added++;
 }
 }db.exec('COMMIT');committed=true;require('./series.cjs').autoGroup(db,root);return {added,updated};}catch(e){if(!committed)db.exec('ROLLBACK');throw e;}finally{db.close();}}
module.exports={reconcile,matchGame,activeGameForProgram,signature};
