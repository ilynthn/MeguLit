// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{DatabaseSync,backup}=require('node:sqlite');
const {openStore}=require('./store.cjs'),MAGIC=Buffer.from('MEGUBAK1'),LEGACY_MAGIC=Buffer.from('TOMEBAK1');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function safeRemove(root,target){const base=path.resolve(root),value=path.resolve(target);if(!value.startsWith(base+path.sep))throw Error('INVALID_BACKUP_PATH');fs.rmSync(value,{recursive:true,force:true});}
function stage(root,prefix){const folder=path.join(root,'cache');fs.mkdirSync(folder,{recursive:true});return fs.mkdtempSync(path.join(folder,prefix));}
function inventory(folder,prefix='',out={}){for(const item of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,item.name),relative=prefix+item.name;if(item.isSymbolicLink())throw Error('BACKUP_LINK_NOT_ALLOWED');if(item.isDirectory())inventory(file,relative+'/',out);else{const bytes=fs.readFileSync(file);out[relative]={sha256:sha(bytes),base64:bytes.toString('base64')};}}return out;}
async function exportBackup(root,destination){
 if(typeof destination!=='string'||!path.isAbsolute(destination)||!/\.(?:megulitbak|tomebak)$/i.test(destination))throw Error('INVALID_BACKUP_PATH');const temporary=stage(root,'backup-export-');
 try{const data=path.join(temporary,'data');fs.mkdirSync(data);const db=openStore(root);try{await backup(db,path.join(data,'megulit.sqlite'));}finally{db.close();}
  for(const name of ['config','assets','sentence-scenes','saved-voice','user-dictionaries','preferences.json','ui-state.json']){const source=path.join(root,'data',name);if(fs.existsSync(source))fs.cpSync(source,path.join(data,name),{recursive:true,dereference:false});}
  const files=inventory(data,'data/'),payload=Buffer.from(JSON.stringify({schema:1,createdAt:new Date().toISOString(),files})),output=Buffer.concat([MAGIC,zlib.gzipSync(payload,{level:1})]);
  const file=destination+'.'+crypto.randomUUID()+'.tmp';
  try{fs.writeFileSync(file,output);fs.renameSync(file,destination);}
  catch(error){
   try{fs.rmSync(file,{force:true});}catch(cleanup){console.warn('Backup output cleanup failed',cleanup.code);}
   throw error;
  }
  return {path:destination,bytes:output.length,files:Object.keys(files).length};
 }finally{
  try{safeRemove(path.join(root,'cache'),temporary);}catch(error){console.warn('Backup staging cleanup failed',error.code);}
 }
}
function previewBackup(root,source){
 if(typeof source!=='string'||!path.isAbsolute(source)||!fs.statSync(source).isFile()||fs.statSync(source).size>512*1024*1024)throw Error('INVALID_BACKUP_FILE');const bytes=fs.readFileSync(source);if(!bytes.subarray(0,8).equals(MAGIC)&&!bytes.subarray(0,8).equals(LEGACY_MAGIC))throw Error('INVALID_BACKUP_FILE');
 let document;try{document=JSON.parse(zlib.gunzipSync(bytes.subarray(8),{maxOutputLength:768*1024*1024}).toString('utf8'));}catch{throw Error('INVALID_BACKUP_FILE');}
 if(document.files?.['data/tome.sqlite']&&!document.files['data/megulit.sqlite']){document.files['data/megulit.sqlite']=document.files['data/tome.sqlite'];delete document.files['data/tome.sqlite'];}const entries=Object.entries(document.files||{});if(document.schema!==1||entries.length>50000||!document.files?.['data/megulit.sqlite'])throw Error('INVALID_BACKUP_FILE');const folder=stage(root,'backup-import-');let total=0;
 try{for(const[name,item]of entries){if(!/^data\/(?:megulit\.sqlite|preferences\.json|ui-state\.json|(?:config|assets|sentence-scenes|saved-voice|user-dictionaries)\/.+)$/.test(name)||name.includes('\\')||name.split('/').some(part=>part==='..'||part==='.'||!part)||!item||typeof item.base64!=='string')throw Error('INVALID_BACKUP_FILE');const data=Buffer.from(item.base64,'base64');total+=data.length;if(data.length>128*1024*1024||total>512*1024*1024||sha(data)!==item.sha256)throw Error('BACKUP_INTEGRITY_FAILED');const file=path.join(folder,...name.split('/'));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);}
  const db=new DatabaseSync(path.join(folder,'data','megulit.sqlite'),{readOnly:true});let counts;try{if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('BACKUP_INTEGRITY_FAILED');counts={games:db.prepare('SELECT COUNT(*) n FROM games WHERE removed_at IS NULL').get().n,words:db.prepare('SELECT COUNT(*) n FROM vocabulary').get().n,sessions:db.prepare('SELECT COUNT(*) n FROM reading_sessions').get().n};}finally{db.close();}
  const id=path.basename(folder);fs.writeFileSync(path.join(folder,'preview.json'),JSON.stringify({id,createdAt:document.createdAt,counts}));return {id,createdAt:document.createdAt,counts};
 }catch(error){safeRemove(path.join(root,'cache'),folder);throw error;}
}
function previewFolder(root,id){
 if(typeof id!=='string'||!/^backup-import-[A-Za-z0-9]+$/.test(id))throw Error('INVALID_BACKUP_ID');
 return path.join(root,'cache',id);
}
function discardBackup(root,id){
 const folder=previewFolder(root,id);
 const discarded=folder+'.discarding';
 if(fs.existsSync(path.join(folder,'preview.json')))fs.renameSync(folder,discarded);
 if(fs.existsSync(discarded))safeRemove(path.join(root,'cache'),discarded);
}
function applyBackup(root,id){
 const folder=previewFolder(root,id);if(!fs.existsSync(path.join(folder,'preview.json'))||!fs.existsSync(path.join(folder,'data','megulit.sqlite')))throw Error('INVALID_BACKUP_ID');
 const data=path.join(root,'data'),checkpoint=path.join(root,'migration','checkpoints','before-import-'+Date.now()+'-'+crypto.randomUUID());
 const previous=path.join(checkpoint,'data');fs.mkdirSync(checkpoint,{recursive:true});
 try{fs.renameSync(data,previous);fs.renameSync(path.join(folder,'data'),data);}
 catch(error){
  if(fs.existsSync(previous))fs.renameSync(previous,data);
  try{fs.rmdirSync(checkpoint);}catch{}
  throw error;
 }
 try{safeRemove(path.join(root,'cache'),folder);}catch(error){console.warn('Backup restored; preview cleanup failed',error.code);}
 return {restored:true,rollback:path.join(checkpoint,'data')};
}
module.exports={exportBackup,previewBackup,discardBackup,applyBackup};
