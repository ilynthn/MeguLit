// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14 (user, beta36: いろとりどりのヒカリ showed as two identical cards, "又是重复游戏"). Cause: the library keys a
   work by its install folder, and matchGame() never folds a scan into a row whose program still exists. Two installs of
   one work in different folders (2012 release + 2022 HD remaster, a Chinese-patched copy beside the original, a Steam
   copy beside a disc copy, Tsukihime v1.4 + v1.6) each became an active row with the same VNDB id, the same title and
   the same cover. One work is one card: rows that share a VNDB id (the user's manual pick wins over the lookup), a Steam
   app id, or the same scanner key + folder are merged into the row the user actually uses. The other installs become
   editions (library.variants) of that card, every per-game record (reading sessions, words, sentences, series) moves to
   the kept row, and the merged row is only soft-removed (removed_at + mergedInto), never deleted. A backup copy of the
   database is written before the first change. Sources of a Japanese import (library.originalFor) are left alone. */
const fs=require('node:fs'),path=require('node:path');
const parse=row=>{try{return JSON.parse(row.original||'{}');}catch{return {};}};
const canonical=p=>String(p||'').replace(/\//g,'\\').replace(/\\+$/,'').toLowerCase();
const HD=/(?:\bhd\b|hd版|高清|リマスター|remaster)/i;
function identity(o){
 const lib=o.library||{};if(lib.originalFor)return '';
 const vndb=String(o.vndbManual||lib.vndbId||'').trim().toLowerCase();
 if(/^v\d+$/.test(vndb))return 'vndb:'+vndb;
 if(lib.appid!=null&&String(lib.appid).trim())return 'steam:'+String(lib.appid).trim();
 if(lib.key&&lib.dir)return 'dir:'+lib.key+'|'+canonical(lib.dir);
 return '';
}
function gameTables(db){
 return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name)
  .filter(t=>t!=='games'&&!t.startsWith('sqlite_')&&db.prepare(`PRAGMA table_info("${t}")`).all().some(c=>c.name==='game_id'));
}
/* plan(db): groups of active rows that are one work, best row first */
function plan(db){
 const groups=new Map();
 for(const row of db.prepare('SELECT * FROM games WHERE removed_at IS NULL').all()){
  const o=parse(row),id=identity(o);if(!id)continue;
  if(!groups.has(id))groups.set(id,[]);groups.get(id).push({row,o});
 }
 const multi=[...groups.values()].filter(g=>g.length>1);if(!multi.length)return [];
 const tables=gameTables(db),isTranslated=translatedTest();
 const records=id=>tables.reduce((n,t)=>n+db.prepare(`SELECT count(*) n FROM "${t}" WHERE game_id=?`).get(id).n,0);
 const read=id=>db.prepare('SELECT COALESCE(SUM(active_seconds),0) s,COALESCE(MAX(started_at),0) last FROM reading_sessions WHERE game_id=?').get(id);
 const exists=file=>{try{return fs.statSync(file).isFile();}catch{return false;}};
 return multi.map(all=>{
  const scored=all.map(({row,o})=>{const r=read(row.id),lib=o.library||{};
   return {row,o,seconds:r.s,used:records(row.id),played:Math.max(row.last_launched_at||0,r.last||0),visible:row.hidden_at==null,exists:exists(row.executable),
    japanese:!isTranslated(row.executable),custom:Number(!!(o.coverCustom||o.vndbManual))+Number(row.source==='manual'),built:Number(lib.executableSignature?.mtime)||0};});
  /* the row the user plays and reads keeps the card; then a visible, installed, Japanese, user-edited, newer build */
  scored.sort((a,b)=>b.seconds-a.seconds||b.used-a.used||b.played-a.played||Number(b.visible)-Number(a.visible)||Number(b.exists)-Number(a.exists)||
   Number(b.japanese)-Number(a.japanese)||b.custom-a.custom||b.built-a.built||(a.row.legacy_id==null)-(b.row.legacy_id==null)||String(a.row.id).localeCompare(String(b.row.id)));
  return {keep:scored[0],drop:scored.slice(1),tables};
 });
}
function translatedTest(){
 try{return require('../core/library.cjs').isTranslated;}
 catch{const {languageHint}=require('../core/launcher-language.cjs');return p=>String(p||'').split(/[\\/]+/).some(n=>languageHint(n)==='zh');}
}
function editionLabel(entry,isTranslated){
 const lib=entry.o.library||{},dir=lib.dir||path.dirname(entry.row.executable||''),where=path.basename(dir)+' '+path.basename(path.dirname(dir))+' '+path.basename(entry.row.executable||'');
 if(isTranslated(entry.row.executable))return '中文版';
 if(HD.test(where))return 'HD版';
 if(entry.row.source==='steam'||lib.source==='steam')return 'Steam版';
 return '';
}
function editions(keep,drop){
 const isTranslated=translatedTest(),all=[keep,...drop];
 /* no '原版' guess: game-language reads a label as a language hint, and an unmarked folder can still be a Chinese build */
 const labels=all.map(e=>editionLabel(e,isTranslated)||path.basename((e.o.library||{}).dir||path.dirname(e.row.executable||''))||e.row.title);
 return all.map((e,i)=>{const lib=e.o.library||{};
  const label=labels.filter(l=>l===labels[i]).length>1?labels[i]+' · '+path.basename(lib.dir||path.dirname(e.row.executable||'')):labels[i];
  return {label,dir:lib.dir||path.dirname(e.row.executable||''),exe:e.row.executable,merged:true,...(i?{mergedFrom:e.row.id}:{})};});
}
function backup(db,root){
 if(!root)return '';
 const folder=path.join(root,'data','backups');fs.mkdirSync(folder,{recursive:true});
 const file=path.join(folder,`megulit-before-dedupe-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
 db.exec(`VACUUM INTO '${file.replace(/'/g,"''")}'`);return file;
}
/* dedupe(db,root): merge duplicate active rows in place; returns [{keep,merged:[ids]}] */
function dedupe(db,root,{now=Math.floor(Date.now()/1000),makeBackup=true}={}){
 if(db.isTransaction)return [];
 const groups=plan(db);if(!groups.length)return [];
 if(makeBackup)try{backup(db,root);}catch(error){console.warn('library dedupe backup',error.message);return [];}
 const out=[];
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const {keep,drop,tables} of groups){
   const row=keep.row,orig=keep.o,lib=orig.library||(orig.library={});
   const variants=[...(lib.variants||[])],has=exe=>variants.some(v=>canonical(v.exe)===canonical(exe));
   for(const v of editions(keep,drop))if(v.exe&&!has(v.exe))variants.push(v);
   let cover=row.cover,legacy=row.legacy_id,launched=row.last_launched_at;
   for(const d of drop){
    const drow=d.row,dorig=d.o,dlib=dorig.library||{};
    for(const v of dlib.variants||[])if(v?.exe&&!has(v.exe))variants.push({...v,merged:true,mergedFrom:drow.id});
    for(const t of tables)db.prepare(`UPDATE OR IGNORE "${t}" SET game_id=? WHERE game_id=?`).run(row.id,drow.id);
    /* user choices the kept row does not have yet (custom cover, manual VNDB pick, notes) carry over */
    for(const [k,v] of Object.entries(dorig))if(k!=='library'&&k!=='mergedInto'&&!(k in orig)){orig[k]=v;if(k==='coverCustom'&&drow.cover)cover=drow.cover;}
    if(!cover&&drow.cover)cover=drow.cover;
    if(legacy==null&&drow.legacy_id!=null){legacy=drow.legacy_id;db.prepare('UPDATE games SET legacy_id=NULL WHERE id=?').run(drow.id);}
    if((drow.last_launched_at||0)>(launched||0))launched=drow.last_launched_at;
    dorig.mergedInto=row.id;
    db.prepare('UPDATE games SET removed_at=?,original=? WHERE id=?').run(now,JSON.stringify(dorig),drow.id);
   }
   lib.variants=variants;
   db.prepare('UPDATE games SET original=?,cover=?,legacy_id=?,last_launched_at=? WHERE id=?').run(JSON.stringify(orig),cover||'',legacy,launched??null,row.id);
   out.push({keep:row.id,merged:drop.map(d=>d.row.id)});
  }
  db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
 return out;
}
/* a rescan rebuilds library.variants from one folder; editions merged from other folders stay on the card */
function keepMergedEditions(saved,next){
 const merged=(saved?.variants||[]).filter(v=>v?.merged&&v.exe);if(!merged.length)return next;
 const list=[...(next.variants||[])];for(const v of merged)if(!list.some(x=>canonical(x.exe)===canonical(v.exe)))list.push(v);
 return {...next,variants:list};
}
module.exports={dedupe,plan,identity,keepMergedEditions};
