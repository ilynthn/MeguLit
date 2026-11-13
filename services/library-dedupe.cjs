// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14 (user, beta36: いろとりどりのヒカリ showed as two identical cards, "又是重复游戏"; then "有这种情况就自动生成合集啊，
   然后备注一下都是啥版本"). Cause: the library keys a work by its install folder, and matchGame() never folds a scan into a
   row whose program still exists. Two installs of one work in different folders (2012 release + 2022 HD remaster, a
   Chinese-patched copy, a Steam copy beside a disc copy, Tsukihime v1.4 + v1.6) each became an active row with the same
   VNDB id, title and cover.
   - Different installs of one work (same VNDB id, the user's manual pick first, or same Steam app id): every install
     stays playable, and they are put into one automatic 合集 whose member cards say which edition each one is
     (HD版 / 中文版 / Steam版 / v1.4 / 2012). A 合集 the user dissolved or a card the user took out stays that way.
   - Rows for the very same install (same program, or the same scanner key + folder) are one game: they merge into the
     row the user actually uses, every per-game record moves over, and the extra row is only soft-removed
     (removed_at + mergedInto). A backup copy of the database is written before that first change.
   Sources of a Japanese import (library.originalFor) and hidden cards are left alone. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const parse=row=>{try{return JSON.parse(row.original||'{}');}catch{return {};}};
const canonical=p=>String(p||'').replace(/\//g,'\\').replace(/\\+$/,'').toLowerCase();
const KANA=/[぀-ヿ]/,HAN=/\p{Script=Han}/u;
const HD=/(?:(?:^|[^a-z])hd(?:[^a-z]|$)|高清|リマスター|remaster)/i;
function work(o){
 const lib=o.library||{};if(lib.originalFor)return '';
 const vndb=String(o.vndbManual||lib.vndbId||'').trim().toLowerCase();
 if(/^v\d+$/.test(vndb))return 'vndb:'+vndb;
 if(lib.appid!=null&&String(lib.appid).trim())return 'steam:'+String(lib.appid).trim();
 return '';
}
const install=(row,o)=>{const lib=o.library||{};return lib.key&&lib.dir?'dir:'+lib.key+'|'+canonical(lib.dir):row.executable?'exe:'+canonical(row.executable):'';};
function gameTables(db){
 return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name)
  .filter(t=>t!=='games'&&!t.startsWith('sqlite_')&&db.prepare(`PRAGMA table_info("${t}")`).all().some(c=>c.name==='game_id'));
}
function translatedTest(){
 try{return require('../core/library.cjs').isTranslated;}
 catch{const {languageHint}=require('../core/launcher-language.cjs');return p=>String(p||'').split(/[\\/]+/).some(n=>languageHint(n)==='zh');}
}
function rank(db,entries){
 const tables=gameTables(db),isTranslated=translatedTest();
 const records=id=>tables.reduce((n,t)=>n+db.prepare(`SELECT count(*) n FROM "${t}" WHERE game_id=?`).get(id).n,0);
 const read=id=>db.prepare('SELECT COALESCE(SUM(active_seconds),0) s,COALESCE(MAX(started_at),0) last FROM reading_sessions WHERE game_id=?').get(id);
 const exists=file=>{try{return fs.statSync(file).isFile();}catch{return false;}};
 const scored=entries.map(({row,o})=>{const r=read(row.id),lib=o.library||{};
  return {row,o,seconds:r.s,used:records(row.id),played:Math.max(row.last_launched_at||0,r.last||0),visible:row.hidden_at==null,exists:exists(row.executable),
   japanese:!isTranslated(row.executable),custom:Number(!!(o.coverCustom||o.vndbManual))+Number(row.source==='manual'),built:Number(lib.executableSignature?.mtime)||0};});
 /* the row the user plays and reads wins; then a visible, installed, Japanese, user-edited, newer build */
 scored.sort((a,b)=>b.seconds-a.seconds||b.used-a.used||b.played-a.played||Number(b.visible)-Number(a.visible)||Number(b.exists)-Number(a.exists)||
  Number(b.japanese)-Number(a.japanese)||b.custom-a.custom||b.built-a.built||(a.row.legacy_id==null)-(b.row.legacy_id==null)||String(a.row.id).localeCompare(String(b.row.id)));
 return {scored,tables};
}
function backup(db,root){
 if(!root)return '';
 const folder=path.join(root,'data','backups');fs.mkdirSync(folder,{recursive:true});
 const file=path.join(folder,`megulit-before-dedupe-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
 db.exec(`VACUUM INTO '${file.replace(/'/g,"''")}'`);return file;
}
/* rows of one install: merge into the best row, soft-remove the rest */
function mergeInstall(db,group,now){
 const {scored,tables}=rank(db,group),keep=scored[0],row=keep.row,orig=keep.o,lib=orig.library||(orig.library={});
 const variants=[...(lib.variants||[])],has=exe=>canonical(exe)===canonical(row.executable)||variants.some(v=>canonical(v.exe)===canonical(exe));
 let cover=row.cover,legacy=row.legacy_id,launched=row.last_launched_at,hidden=row.hidden_at;
 for(const d of scored.slice(1)){
  const drow=d.row,dorig=d.o,dlib=dorig.library||{};
  for(const v of [{label:path.basename(drow.executable||''),dir:dlib.dir,exe:drow.executable},...(dlib.variants||[])])if(v?.exe&&!has(v.exe))variants.push({...v,merged:true});
  for(const t of tables)db.prepare(`UPDATE OR IGNORE "${t}" SET game_id=? WHERE game_id=?`).run(row.id,drow.id);
  /* user choices the kept row does not have yet (custom cover, manual VNDB pick, notes) carry over */
  for(const [k,v] of Object.entries(dorig))if(k!=='library'&&k!=='mergedInto'&&!(k in orig)){orig[k]=v;if(k==='coverCustom'&&drow.cover)cover=drow.cover;}
  if(!cover&&drow.cover)cover=drow.cover;
  if(legacy==null&&drow.legacy_id!=null){legacy=drow.legacy_id;db.prepare('UPDATE games SET legacy_id=NULL WHERE id=?').run(drow.id);}
  if((drow.last_launched_at||0)>(launched||0))launched=drow.last_launched_at;
  if(drow.hidden_at==null)hidden=null;
  dorig.mergedInto=row.id;
  db.prepare('UPDATE games SET removed_at=?,original=? WHERE id=?').run(now,JSON.stringify(dorig),drow.id);
 }
 lib.variants=variants;
 db.prepare('UPDATE games SET original=?,cover=?,legacy_id=?,last_launched_at=?,hidden_at=? WHERE id=?').run(JSON.stringify(orig),cover||'',legacy,launched??null,hidden??null,row.id);
 return {keep:row.id,merged:scored.slice(1).map(d=>d.row.id)};
}
/* edition note for one install among others of the same work: kind (HD版 / 中文版 / Steam版), version, release year */
function edition(entry,all,isTranslated){
 const {row,o}=entry,lib=o.library||{},exe=row.executable||lib.exe||'',dir=lib.dir||path.dirname(exe);
 const names=[path.basename(dir),path.basename(path.dirname(dir)),path.basename(exe).replace(/\.exe$/i,'')];
 const parts=[],titleKana=all.some(e=>KANA.test(e.row.title||''));
 if(row.source==='steam'||lib.source==='steam')parts.push('Steam版');
 if(names.some(n=>HD.test(n)))parts.push('HD版');
 /* a Chinese build: marked as translated, or its own folder/program name is a Han-only title of a work whose title has kana */
 if(isTranslated(exe)||titleKana&&names.slice(0,1).concat(names[2]).some(n=>HAN.test(n)&&!KANA.test(n)&&!/^\[/.test(n)))parts.push('中文版');
 const version=names.map(n=>/(?:^|[^a-z0-9])(v(?:er)?\.?\s?\d+(?:\.\d+)+)/i.exec(n)?.[1]).find(Boolean);
 if(version)parts.push(version.replace(/^ver\.?\s?/i,'v').replace(/^v\.?\s?/i,'v'));
 const dated=names.map(n=>/^\[(\d{2})(\d{2})(\d{2})\]/.exec(n)).find(Boolean)||/^\[(\d{2})(\d{2})(\d{2})\]/.exec(path.basename(path.dirname(path.dirname(dir))));
 if(dated)parts.push(String(Number(dated[1])>=80?1900+Number(dated[1]):2000+Number(dated[1])));
 else if(lib.release_date&&!all.every(e=>(e.o.library||{}).release_date===lib.release_date))parts.push(String(lib.release_date).slice(0,4));
 return (parts.length?parts.join(' · '):path.basename(dir)||row.title||'').slice(0,100);
}
/* installs of one work: one automatic 合集, each card noting its edition */
function collect(db,root,group){
 const enabled=require('./store.cjs').readJSON(path.join(root||'','data/config/library.json')).autoSeries!==false;if(!enabled)return null;
 const member=id=>db.prepare('SELECT * FROM series_memberships WHERE game_id=?').get(id);
 const blocked=id=>!!db.prepare('SELECT blocked FROM series_overrides WHERE game_id=?').get(id)?.blocked;
 const key='work:'+group.key,{scored}=rank(db,group.entries),lead=scored[0];
 let series=db.prepare('SELECT * FROM series WHERE recognition_key=?').get(key);
 if(!series){const ids=new Set(scored.map(e=>member(e.row.id)?.series_id).filter(Boolean));if(ids.size===1)series=db.prepare('SELECT * FROM series WHERE id=?').get([...ids][0]);}
 const free=scored.filter(e=>!member(e.row.id)&&!blocked(e.row.id));
 const inside=series?scored.filter(e=>member(e.row.id)?.series_id===series.id):[];
 if(!series&&free.length<2)return null;
 if(series&&!free.length&&!inside.some(e=>!member(e.row.id)?.edition))return null;
 const t=Date.now();
 if(!series){
  const lib=lead.o.library||{},id='series-'+crypto.randomUUID();
  db.prepare('INSERT INTO series(id,name,original_name,aliases,developer,recognition_key,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
   .run(id,String(lead.row.title||'').replace(/\s*\(?v(?:er)?\.?\s?\d+(?:\.\d+)+\)?$/i,'').trim().slice(0,200)||String(lead.row.title||'').slice(0,200)||id,'','[]',String(lib.developer||'').slice(0,200),key,'automatic',t,t);
  series=db.prepare('SELECT * FROM series WHERE id=?').get(id);
 }
 const isTranslated=translatedTest(),notes=new Map(scored.map(e=>[e.row.id,edition(e,scored,isTranslated)]));
 /* two installs with the same note get their folder name added so they stay apart */
 for(const e of scored){const n=notes.get(e.row.id);if(scored.filter(x=>notes.get(x.row.id)===n).length>1){const dir=(e.o.library||{}).dir||path.dirname(e.row.executable||'');if(path.basename(dir)!==n)notes.set(e.row.id,(n+' · '+path.basename(dir)).slice(0,100));}}
 let order=db.prepare('SELECT COALESCE(MAX(custom_order),0) n FROM series_memberships WHERE series_id=?').get(series.id).n;
 const added=[];
 for(const e of free){db.prepare('INSERT INTO series_memberships(game_id,series_id,custom_order,source,evidence,edition) VALUES(?,?,?,?,?,?)').run(e.row.id,series.id,++order,'automatic',group.key,notes.get(e.row.id));db.prepare('DELETE FROM series_suggestions WHERE game_id=?').run(e.row.id);added.push(e.row.id);}
 for(const e of inside)if(!member(e.row.id).edition)db.prepare('UPDATE series_memberships SET edition=? WHERE game_id=?').run(notes.get(e.row.id),e.row.id);
 db.prepare('UPDATE series SET updated_at=? WHERE id=?').run(t,series.id);
 return {series:series.id,added,editions:Object.fromEntries(scored.map(e=>[e.row.id,member(e.row.id)?.series_id===series.id?member(e.row.id).edition:'']))};
}
/* plan(db): {installs:[[...entries]], works:[{key,entries}]} */
function plan(db){
 const rows=db.prepare('SELECT * FROM games WHERE removed_at IS NULL').all().map(row=>({row,o:parse(row)}));
 const by=(list,fn)=>{const m=new Map();for(const e of list){const k=fn(e);if(!k)continue;if(!m.has(k))m.set(k,[]);m.get(k).push(e);}return m;};
 const installs=[...by(rows.filter(e=>!(e.o.library||{}).originalFor),e=>install(e.row,e.o)).values()].filter(g=>g.length>1&&new Set(g.map(e=>work(e.o)).filter(Boolean)).size<=1);
 const works=[...by(rows.filter(e=>e.row.hidden_at==null),e=>work(e.o)).entries()].map(([key,entries])=>({key,entries})).filter(g=>new Set(g.entries.map(e=>install(e.row,e.o)||e.row.id)).size>1);
 return {installs,works};
}
/* dedupe(db,root): same install → one row; same work in several installs → one 合集 with edition notes */
function dedupe(db,root,{now=Math.floor(Date.now()/1000),makeBackup=true}={}){
 if(db.isTransaction)return {merged:[],collections:[]};
 let {installs}=plan(db);const out={merged:[],collections:[]};
 if(installs.length){
  if(makeBackup)try{backup(db,root);}catch(error){console.warn('library dedupe backup',error.message);installs=[];}
  if(installs.length){db.exec('BEGIN IMMEDIATE');try{for(const g of installs)out.merged.push(mergeInstall(db,g,now));db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}}
 }
 const {works}=plan(db);
 if(works.length){db.exec('BEGIN IMMEDIATE');try{for(const g of works){const r=collect(db,root,g);if(r)out.collections.push(r);}db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}}
 return out;
}
/* a rescan rebuilds library.variants from one folder; programs merged in from a duplicate row stay known */
function keepMergedEditions(saved,next){
 const merged=(saved?.variants||[]).filter(v=>v?.merged&&v.exe&&!(next.variants||[]).some(x=>canonical(x.exe)===canonical(v.exe))&&canonical(v.exe)!==canonical(next.exe));
 if(!merged.length)return next;
 return {...next,variants:[...(next.variants||[]),...merged]};
}
module.exports={dedupe,plan,edition,keepMergedEditions};
