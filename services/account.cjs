// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E378 MeguLit account (email + code) and cloud sync. Server: relay/src/accounts.js, notes: relay/ACCOUNTS.md.

   Without an account nothing here runs and MeguLit stays fully local. With one, only the kinds the user leaves on
   are synced: words (vocabulary + examples), sentences (saved_sentences), reading (per-day totals of this device's
   reading_sessions), settings (per-game style profiles with every path removed).

   Local state:
     data/config/account/profile.json   email, accountId, sessionId, deviceId, kinds, cursors, lastSyncAt, lastError
     data/config/account/secrets.dpapi  the session token, sealed with Windows DPAPI (core/secrets.cjs, KeyVault.exe)
     SQLite account_sync(kind,key,hash,updated_at,pending)  what was last synced; pending=1 rows are the offline queue

   A sync per kind: scan (diff local records against account_sync; changes get updated_at=now and pending=1, records
   that vanished become tombstones) → pull since the cursor (last writer wins on updated_at; words union their
   examples so two PCs never drop each other's sentences) → push pending in chunks. Failures leave pending rows for
   the next sync. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

const KINDS=['words','sentences','reading','settings'];
const DEFAULT_KINDS={words:true,sentences:true,reading:true,settings:true};
const RECORD_CAP={words:32<<10,sentences:8<<10,reading:1<<10,settings:32<<10};
const USERNAME=/^[A-Za-z][A-Za-z0-9_]{2,19}$/;
const PUSH_RECORDS=200,PUSH_BYTES=1500<<10,TIMEOUT=20000;

/* ---- relay base: the leaderboard branch's services/relay-config.cjs when present, same rules otherwise ---------- */
const LOCAL=['127.0.0.1','localhost','[::1]'];
function normalizeBase(value){
 if(typeof value!=='string'||!value.trim()||value.length>300)return '';let url;try{url=new URL(value.trim());}catch{return '';}
 if(url.username||url.password||url.search||url.hash)return '';
 if(!(url.protocol==='https:'||url.protocol==='http:'&&LOCAL.includes(url.hostname)))return '';
 return url.href.replace(/\/+$/,'');
}
function relayBase(root,env=process.env){
 let shared=null;try{shared=require('./relay-config.cjs');}catch{}
 if(shared?.relayBase)return shared.relayBase(root,env);
 const fromEnv=normalizeBase(env.MEGULIT_RELAY_BASE||'');if(fromEnv)return fromEnv;
 return root?normalizeBase(readJSON(path.join(root,'data','config','online.json')).relayUrl||''):'';
}

/* ---- small helpers ---------------------------------------------------------------------------------------------- */
function readJSON(file){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:{};}catch{return {};}}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,1));fs.renameSync(tmp,file);}
const sha=(value,n=64)=>crypto.createHash('sha256').update(String(value)).digest('hex').slice(0,n);
/* stable JSON (sorted keys) so the same record always hashes the same */
function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value??null);}
const hashData=data=>data==null?'':sha(stable(data),40);
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
function normalizeEmail(value){
 if(typeof value!=='string')return '';const email=value.trim().toLowerCase();
 if(email.length<6||email.length>254||!/^[^\s@]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email))return '';return email;
}
/* same rule as the server: last writer wins on updated_at; a tie goes to the tombstone, then the larger JSON */
function newerRecord(a,b){
 if(!a)return b;if(!b)return a;
 if(a.updated_at!==b.updated_at)return a.updated_at>b.updated_at?a:b;
 if(!!a.deleted!==!!b.deleted)return a.deleted?a:b;
 return JSON.stringify(a.data??null)>=JSON.stringify(b.data??null)?a:b;
}

/* ---- privacy: per-game settings never carry paths --------------------------------------------------------------- */
/* whole keys (path, exe…), camelCase suffixes (gamePath, coverImage…) and snake_case suffixes (save_dir…) */
const PATH_KEY=/^(?:paths?|exe|executable|process|pid|hwnd|dir|directory|folder|files?|filename|cover|image|url|uri)$|[a-z0-9](?:Path|Paths|Exe|Executable|Process|Pid|Hwnd|Dir|Directory|Folder|File|Files|FileName|Filename|Cover|Image|Url|Uri)$|_(?:path|exe|dir|folder|file|url)$/;
function looksLikePath(value){
 if(typeof value!=='string')return false;const v=value.trim();
 return /^[a-z]:[\\/]/i.test(v)||/^\\\\/.test(v)||/^\/(?:[^/\s]+\/)+/.test(v)||/^file:/i.test(v)||/[\\/][^\\/]*\.(?:exe|dll|bat|lnk|png|jpe?g|webp|bmp|ttf|otf|ttc|json|xp3|dat|log|txt|zip)$/i.test(v)||/^[a-z][a-z0-9+.-]*:\/\//i.test(v);
}
function cleanSettings(value,depth=0){
 if(depth>6)return undefined;
 if(Array.isArray(value)){const out=[];for(const item of value.slice(0,200)){const c=cleanSettings(item,depth+1);if(c!==undefined)out.push(c);}return out;}
 if(value&&typeof value==='object'){const out={};for(const[k,v]of Object.entries(value)){if(PATH_KEY.test(k)||k==='gameProcess'||k==='bindEnabled')continue;const c=cleanSettings(v,depth+1);if(c!==undefined)out[k]=c;}return out;}
 if(typeof value==='string')return looksLikePath(value)?undefined:value.slice(0,2000);
 if(typeof value==='number'||typeof value==='boolean'||value===null)return value;
 return undefined;
}
const cleanTitle=value=>{const t=String(value||'').trim();return (looksLikePath(t)?path.win32.parse(t).name:t).slice(0,180);};

/* ---- kinds: collect local records / apply remote ones ------------------------------------------------------------ */
function gameTitles(db){const map=new Map();for(const g of db.prepare('SELECT id,title FROM games').all())map.set(g.id,cleanTitle(g.title));return map;}
function gameByTitle(db){const map=new Map();for(const g of db.prepare('SELECT id,title FROM games WHERE removed_at IS NULL ORDER BY last_launched_at DESC').all()){const k=cleanTitle(g.title).toLowerCase();if(k&&!map.has(k))map.set(k,g.id);}return map;}
/* #116 (user: on a new PC the games' data was gone): a synced row whose game is not in this library yet keeps the game's
   title, so it is sent back unchanged (never as "no game", which overwrote the cloud copy) and is linked once the game
   is added (relinkGames, run before every sync). */
/* #116 (user: nickname, avatar and settings were gone on a new PC): besides the per-game styles the settings kind
   carries the profile (leaderboard nickname, its switches, a small avatar) and the global reading style. Paths never
   leave the PC (cleanSettings), and a value already set on this PC is kept when an older cloud copy arrives. */
const EXTRA_FILES={'learning-goal':root=>[path.join(root,'data','config','learning-goal.json')],profile:root=>[path.join(root,'data','config','online.json'),require('./assets.cjs').find(root,'avatar')].filter(Boolean),'global-style':root=>[path.join(root,'data','config','gal-preferences.json')]};
const AVATAR_CAP=24<<10;
function accountExtras(root){
 const out={},online=readJSON(path.join(root,'data','config','online.json')),profile={};
 if(typeof online.leaderboardName==='string'&&online.leaderboardName.trim())profile.nickname=online.leaderboardName.trim().slice(0,32);
 for(const k of ['leaderboardEnabled','leaderboardShareGames'])if(typeof online[k]==='boolean')profile[k]=online[k];
 try{const file=require('./assets.cjs').find(root,'avatar');if(file&&fs.statSync(file).size<=AVATAR_CAP*3/4-200)profile.avatar=require('./assets.cjs').get(root,'avatar');}catch{}
 if(Object.keys(profile).length)out.profile=profile;
 const goal=require('./learning-goal.cjs').synced(root);if(goal)out['learning-goal']=goal;
 const style=cleanSettings(readJSON(path.join(root,'data','config','gal-preferences.json')));if(style&&Object.keys(style).length)out['global-style']={prefs:style};
 return out;
}
function applyExtra(root,key,record){
 if(record.deleted)return;const d=record.data||{};
 if(key==='learning-goal'){require('./learning-goal.cjs').applySynced(root,d);return;}
 if(key==='profile'){
  const file=path.join(root,'data','config','online.json'),online=readJSON(file),patch={};
  if(typeof d.nickname==='string'&&d.nickname.trim()&&!(typeof online.leaderboardName==='string'&&online.leaderboardName.trim())){patch.leaderboardName=d.nickname.trim().slice(0,32);for(const k of ['leaderboardEnabled','leaderboardShareGames'])if(typeof d[k]==='boolean')patch[k]=d[k];}
  if(Object.keys(patch).length)atomic(file,{...online,...patch});
  if(typeof d.avatar==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(d.avatar)&&!require('./assets.cjs').find(root,'avatar')){
   const ext={png:'.png',jpeg:'.jpg',webp:'.webp',gif:'.gif'}[d.avatar.slice(11,d.avatar.indexOf(';'))],temp=path.join(root,'data','cache','synced-avatar'+ext);
   try{fs.mkdirSync(path.dirname(temp),{recursive:true});fs.writeFileSync(temp,Buffer.from(d.avatar.slice(d.avatar.indexOf(',')+1),'base64'));require('./assets.cjs').set(root,'avatar',temp);}catch{}finally{fs.rmSync(temp,{force:true});}
  }
 }else if(key==='global-style'){
  const file=path.join(root,'data','config','gal-preferences.json'),old=readJSON(file),kept=Object.fromEntries(Object.entries(old).filter(([k])=>PATH_KEY.test(k)||k==='gameProcess'||k==='bindEnabled'));
  atomic(file,{...kept,...cleanSettings(d.prefs||{})});
 }
}
const syncOriginal=title=>JSON.stringify({sync:true,...(cleanTitle(title)?{game:cleanTitle(title)}:{})});
const syncedTitle=original=>{const v=parse(original);return typeof v.game==='string'?cleanTitle(v.game):'';};
function relinkGames(db){
 const games=gameByTitle(db);if(!games.size)return 0;let linked=0;
 for(const table of ['examples','saved_sentences']){const update=db.prepare(`UPDATE ${table} SET game_id=? WHERE id=?`);
  for(const r of db.prepare(`SELECT id,original FROM ${table} WHERE game_id IS NULL AND original LIKE '%"game"%'`).all()){const id=games.get(syncedTitle(r.original).toLowerCase());if(id!=null){update.run(id,r.id);linked++;}}}
 const update=db.prepare('UPDATE reading_sessions SET game_id=? WHERE id=?');
 for(const r of db.prepare(`SELECT id,original FROM reading_sessions WHERE game_id IS NULL AND original LIKE '%"sync"%'`).all()){const v=parse(r.original).sync,id=v&&typeof v.game==='string'?games.get(cleanTitle(v.game).toLowerCase()):null;if(id!=null){update.run(id,r.id);linked++;}}
 return linked;
}
const parse=text=>{try{const v=JSON.parse(text||'{}');return v&&typeof v==='object'?v:{};}catch{return {};}};
const wordKey=(spelling,reading)=>String(spelling)+'\t'+String(reading);
function fitExamples(data,cap){while(data.examples.length&&bytes(data)>cap)data.examples.pop();if(bytes(data)>cap)delete data.entry;return data;}
function unionExamples(a=[],b=[]){const seen=new Map();for(const e of [...a,...b])if(e&&typeof e.text==='string'&&!seen.has(e.text))seen.set(e.text,e);return [...seen.values()].sort((x,y)=>(y.created_at||0)-(x.created_at||0)).slice(0,20);}

const kinds={
 words:{
  collect(db){
   const titles=gameTitles(db),out=new Map(),examples=new Map();
   for(const e of db.prepare('SELECT word_id,game_id,text,translation,highlight_start,highlight_end,created_at,original FROM examples ORDER BY created_at DESC,id DESC').all()){
    if(!examples.has(e.word_id))examples.set(e.word_id,[]);
    examples.get(e.word_id).push({text:e.text,translation:e.translation||'',start:e.highlight_start??0,end:e.highlight_end??0,created_at:e.created_at||0,game:titles.get(e.game_id)||syncedTitle(e.original)});
   }
   for(const w of db.prepare('SELECT id,spelling,reading,definitions,status,created_at,original FROM vocabulary ORDER BY id').all()){
    const key=wordKey(w.spelling,w.reading),old=out.get(key),entry=parse(w.original).entry;
    const data=old||{entryId:w.id,spelling:w.spelling,reading:w.reading,definitions:w.definitions,status:w.status,created_at:w.created_at,examples:[]};
    if(old){data.status=Math.max(old.status,w.status);data.created_at=Math.min(old.created_at,w.created_at);}
    else if(entry&&typeof entry==='object'&&bytes(entry)<12000)data.entry=entry;
    data.examples=unionExamples(data.examples,examples.get(w.id));
    out.set(key,fitExamples(data,RECORD_CAP.words));
   }
   return out;
  },
  merge(local,remote,localWins){const base=localWins?local:remote;return fitExamples({...base,examples:unionExamples(base.examples,localWins?remote.examples:local.examples)},RECORD_CAP.words);},
  apply(db,key,record,root,ctx){
   const [spelling,reading]=key.split('\t'),rows=db.prepare('SELECT * FROM vocabulary WHERE spelling=? AND reading=?').all(spelling??'',reading??'');
   if(record.deleted){
    for(const word of rows){const examples=db.prepare('SELECT * FROM examples WHERE word_id=?').all(word.id);
     db.prepare('INSERT INTO word_trash(word_id,deleted_at,snapshot) VALUES (?,?,?)').run(word.id,Math.floor(ctx.now()/1000),JSON.stringify({word,examples}));
     db.prepare('DELETE FROM examples WHERE word_id=?').run(word.id);db.prepare('DELETE FROM vocabulary WHERE id=?').run(word.id);}
    db.exec('DELETE FROM word_trash WHERE id NOT IN (SELECT id FROM word_trash ORDER BY deleted_at DESC,id DESC LIMIT 30)');return;
   }
   const d=record.data,status=Math.max(0,Math.min(4,Number(d.status)||0)),definitions=typeof d.definitions==='string'?d.definitions:JSON.stringify(d.definitions??[]);
   let id=rows[0]?.id;
   if(id==null){
    const free=Number.isSafeInteger(d.entryId)&&d.entryId>0&&!db.prepare('SELECT 1 FROM vocabulary WHERE id=?').get(d.entryId);
    const original=JSON.stringify({sync:true,...(d.entry&&typeof d.entry==='object'?{entry:d.entry}:{})});
    id=Number(db.prepare('INSERT INTO vocabulary(id,spelling,reading,definitions,status,created_at,original) VALUES(?,?,?,?,?,?,?)').run(free?d.entryId:null,String(d.spelling??spelling),String(d.reading??reading),definitions,status,Number(d.created_at)||Math.floor(ctx.now()/1000),original).lastInsertRowid);
   }else db.prepare('UPDATE vocabulary SET definitions=?,status=? WHERE id=?').run(definitions,status,id);
   const games=gameByTitle(db),have=new Set(db.prepare('SELECT text FROM examples WHERE word_id IN ('+[id,...rows.slice(1).map(r=>r.id)].join(',')+')').all().map(r=>r.text));
   for(const e of Array.isArray(d.examples)?d.examples:[]){if(typeof e?.text!=='string'||have.has(e.text))continue;have.add(e.text);
    db.prepare('INSERT INTO examples(word_id,game_id,text,translation,highlight_start,highlight_end,created_at,original) VALUES(?,?,?,?,?,?,?,?)').run(id,games.get(String(e.game||'').toLowerCase())||null,e.text.slice(0,4000),String(e.translation||''),Number(e.start)||0,Number(e.end)||0,Number(e.created_at)||Math.floor(ctx.now()/1000),syncOriginal(e.game));}
  }
 },
 sentences:{
  collect(db){
   const titles=gameTitles(db),out=new Map();
   for(const s of db.prepare('SELECT game_id,text,translation,created_at,source,original FROM saved_sentences ORDER BY created_at,id').all()){const key='s:'+sha(s.text,32);if(!out.has(key))out.set(key,{text:s.text.slice(0,3000),translation:String(s.translation||'').slice(0,3000),created_at:s.created_at,game:titles.get(s.game_id)||syncedTitle(s.original),/* only auto rows carry it, so older (manual) records keep their hash */...(s.source==='auto'?{source:'auto'}:{})});}
   return out;
  },
  apply(db,key,record){
   const rows=db.prepare('SELECT id,text FROM saved_sentences').all().filter(r=>'s:'+sha(r.text,32)===key),source=record.data?.source==='auto'?'auto':'manual';
   if(record.deleted){for(const r of rows)db.prepare('DELETE FROM saved_sentences WHERE id=?').run(r.id);return;}
   const d=record.data;
   if(rows.length)db.prepare('UPDATE saved_sentences SET translation=?,source=? WHERE id=?').run(String(d.translation||''),source,rows[0].id);
   else db.prepare('INSERT INTO saved_sentences(game_id,text,translation,created_at,original,source) VALUES(?,?,?,?,?,?)').run(gameByTitle(db).get(String(d.game||'').toLowerCase())||null,String(d.text),String(d.translation||''),Number(d.created_at)||0,syncOriginal(d.game),source);
  }
 },
 reading:{
  /* per local day and game, only this device's own sessions (rows imported from other devices carry original.sync) */
  collect(db,root,ctx){
   const titles=gameTitles(db),out=new Map(),device=ctx.deviceId();
   for(const s of db.prepare('SELECT game_id,started_at,active_seconds,characters,sentences,original FROM reading_sessions').all()){
    if(parse(s.original).sync)continue;const d=new Date(s.started_at*1000),day=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const game=titles.get(s.game_id)||'',key=`${device.slice(0,12)}|${day}|${sha(game.toLowerCase(),12)}`;
    const row=out.get(key)||{device:device.slice(0,12),day,game,seconds:0,characters:0,sentences:0,sessions:0};
    row.seconds+=s.active_seconds||0;row.characters+=s.characters||0;row.sentences+=s.sentences||0;row.sessions++;out.set(key,row);
   }
   return out;
  },
  skip:(record,ctx)=>String(record.key).startsWith(ctx.deviceId().slice(0,12)+'|'),
  apply(db,key,record){
   db.prepare("DELETE FROM reading_sessions WHERE original LIKE '%\"sync\"%' AND CASE WHEN json_valid(original) THEN json_extract(original,'$.sync.key') END=?").run(key);
   if(record.deleted)return;const d=record.data,m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d.day||''));if(!m)return;
   const start=Math.floor(new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12).getTime()/1000),secs=Math.max(0,Math.min(86400,Number(d.seconds)||0));
   db.prepare('INSERT INTO reading_sessions(game_id,started_at,ended_at,active_seconds,characters,sentences,original) VALUES(?,?,?,?,?,?,?)').run(gameByTitle(db).get(String(d.game||'').toLowerCase())||null,start,start+secs,secs,Math.max(0,Number(d.characters)||0),Math.max(0,Number(d.sentences)||0),JSON.stringify({sync:{key,device:String(d.device||''),game:String(d.game||'').slice(0,180)}}));
  }
 },
 settings:{
  collect(db,root){
   const out=new Map(),entries=readJSON(path.join(root,'data','config','game-style-profiles.json')).entries||{};
   for(const[key,entry]of Object.entries(entries)){if(!/^[a-f0-9]{64}$/.test(key)||!entry||typeof entry!=='object')continue;const data={name:cleanTitle(entry.name),prefs:cleanSettings(entry.prefs||{})||{}};if(bytes(data)<=RECORD_CAP.settings)out.set(key,data);}
   for(const[key,data]of Object.entries(accountExtras(root)))if(data&&bytes(data)<=RECORD_CAP.settings)out.set(key,data);
   return out;
  },
  times(db,root){const t=new Map(Object.entries(readJSON(path.join(root,'data','config','game-style-profiles.json')).entries||{}).map(([k,e])=>[k,Number(e?.savedAt)||0]));for(const[k,files]of Object.entries(EXTRA_FILES))t.set(k,Math.max(0,...files(root).map(f=>{try{return fs.statSync(f).mtimeMs;}catch{return 0;}})));return t;},
  apply(db,key,record,root){
   if(key in EXTRA_FILES){applyExtra(root,key,record);return;}
   if(!/^[a-f0-9]{64}$/.test(key))return;const file=path.join(root,'data','config','game-style-profiles.json'),doc=readJSON(file);doc.entries=doc.entries&&typeof doc.entries==='object'?doc.entries:{};
   if(record.deleted){if(!doc.entries[key])return;delete doc.entries[key];}
   else{const old=doc.entries[key]||{},kept=Object.fromEntries(Object.entries(old.prefs||{}).filter(([k])=>PATH_KEY.test(k)||k==='gameProcess'||k==='bindEnabled'));
    doc.entries[key]={...old,name:cleanTitle(record.data.name)||old.name||key.slice(0,12),prefs:{...kept,...cleanSettings(record.data.prefs||{})},savedAt:record.updated_at};}
   doc.version=doc.version||3;atomic(file,doc);
  }
 }
};

/* ---- sync state in SQLite ---------------------------------------------------------------------------------------- */
function ensureState(db){db.exec('CREATE TABLE IF NOT EXISTS account_sync (kind TEXT NOT NULL, key TEXT NOT NULL, hash TEXT NOT NULL, updated_at INTEGER NOT NULL, pending INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,key))');}
function stateMap(db,kind){return new Map(db.prepare('SELECT key,hash,updated_at,pending FROM account_sync WHERE kind=?').all(kind).map(r=>[r.key,r]));}
function setState(db,kind,key,hash,updatedAt,pending){db.prepare('INSERT INTO account_sync(kind,key,hash,updated_at,pending) VALUES(?,?,?,?,?) ON CONFLICT(kind,key) DO UPDATE SET hash=excluded.hash,updated_at=excluded.updated_at,pending=excluded.pending').run(kind,key,hash,updatedAt,pending?1:0);}

/* diff local records against the last synced state: changed → pending with a fresh updated_at; vanished → tombstone */
const EPOCH=Date.UTC(2020,0,2);
function scan(db,kind,local,now,times){
 const state=stateMap(db,kind);let changed=0;
 for(const[key,data]of local){const h=hashData(data),st=state.get(key);if(!st||st.hash!==h){
  /* a kind that knows when a record was saved (settings: savedAt) uses that, so an old local copy never beats a newer cloud one */
  const known=Number(times?.get(key)),base=Number.isFinite(known)&&known>0?Math.min(now,Math.max(EPOCH,known)):now;
  setState(db,kind,key,h,st?Math.max(base,st.updated_at+1):base,true);changed++;}}
 for(const[key,st]of state)if(st.hash!==''&&!local.has(key)){setState(db,kind,key,'',Math.max(now,st.updated_at+1),true);changed++;}
 return changed;
}
/* apply remote records (already newest-first resolved per key by the server) with last-writer-wins against local state */
function applyRemote(db,root,kind,records,ctx,{force=false}={}){
 const spec=kinds[kind],state=stateMap(db,kind),local=spec.collect(db,root,ctx),touched=new Map();let applied=0;
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const r of records){
   if(!r||typeof r.key!=='string'||!Number.isSafeInteger(r.updated_at)||spec.skip?.(r,ctx))continue;
   if(!r.deleted&&(!r.data||typeof r.data!=='object'))continue;
   const st=state.get(r.key),mine=local.get(r.key),localRecord=st?{updated_at:st.updated_at,deleted:!mine,data:mine??null}:null;
   const remoteWins=force||!localRecord||newerRecord(localRecord,{updated_at:r.updated_at,deleted:!!r.deleted,data:r.data})!==localRecord;
   if(!remoteWins){
    /* ours is newer: words still pick up the other device's example sentences, and push the union */
    if(spec.merge&&mine&&!r.deleted){const merged=spec.merge(mine,r.data,true);if(hashData(merged)!==hashData(mine)){spec.apply(db,r.key,{key:r.key,updated_at:st.updated_at,data:merged},root,ctx);touched.set(r.key,{updated_at:Math.max(ctx.now(),st.updated_at+1),pending:true});applied++;}}
    continue;
   }
   if(st&&!force&&st.updated_at===r.updated_at&&!st.pending)continue;
   const data=!r.deleted&&spec.merge&&mine?spec.merge(mine,r.data,false):r.data;
   spec.apply(db,r.key,{key:r.key,updated_at:r.updated_at,deleted:!!r.deleted,data},root,ctx);applied++;
   const extra=!r.deleted&&spec.merge&&mine&&hashData(data)!==hashData(r.data);
   touched.set(r.key,{updated_at:extra?Math.max(ctx.now(),r.updated_at+1):r.updated_at,pending:extra});
  }
  if(touched.size){const after=spec.collect(db,root,ctx);for(const[key,t]of touched)setState(db,kind,key,hashData(after.get(key)),t.updated_at,t.pending);}
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
 return applied;
}
function pendingRecords(db,root,kind,ctx){
 const local=kinds[kind].collect(db,root,ctx),out=[];
 for(const r of db.prepare('SELECT key,hash,updated_at FROM account_sync WHERE kind=? AND pending=1 ORDER BY updated_at').all(kind)){
  const data=r.hash?local.get(r.key):null;
  out.push(data?{key:r.key,updated_at:r.updated_at,data}:{key:r.key,updated_at:r.updated_at,deleted:true});
 }
 return out;
}
function chunks(records){const out=[];let part=[],size=0;for(const r of records){const n=bytes(r);if(part.length&&(part.length>=PUSH_RECORDS||size+n>PUSH_BYTES)){out.push(part);part=[];size=0;}part.push(r);size+=n;}if(part.length)out.push(part);return out;}

/* ---- account state on disk ---------------------------------------------------------------------------------------- */
class Account{
 constructor(root,options={}){
  this.root=root;this.folder=path.join(root,'data','config','account');this.env=options.env||process.env;
  this.fetcher=options.fetch||((...a)=>fetch(...a));this.vault=options.vault;this.now=options.now||(()=>Date.now());
  this.openDb=options.openDb||(()=>require('./store.cjs').openStore(root));this.running=null;
 }
 profile(){return readJSON(path.join(this.folder,'profile.json'));}
 saveProfile(patch){const next={...this.profile(),...patch};atomic(path.join(this.folder,'profile.json'),next);return next;}
 deviceId(){let id=this.profile().deviceId;if(!/^[0-9a-f-]{36}$/.test(id||'')){id=crypto.randomUUID();this.saveProfile({deviceId:id});}return id;}
 vaultStore(){const {SecretStore}=require('../core/secrets.cjs');fs.mkdirSync(this.folder,{recursive:true});return new SecretStore(this.folder,this.vault,path.join(this.root,'native','KeyVault.exe'));}
 token(){if(!fs.existsSync(path.join(this.folder,'secrets.dpapi')))return '';try{return Object.fromEntries(this.vaultStore().entries()).session||'';}catch{return '';}}
 setToken(token){this.vaultStore().set('session',token||'');}
 base(){return relayBase(this.root,this.env);}
 kinds(){return {...DEFAULT_KINDS,...(this.profile().kinds||{})};}

 async call(method,route,body,{auth=true}={}){
  const base=this.base();if(!base)throw Object.assign(Error('RELAY_NOT_CONFIGURED'),{code:'RELAY_NOT_CONFIGURED'});
  const headers={accept:'application/json','user-agent':'MeguLit'};if(body!==undefined)headers['content-type']='application/json';
  if(auth){const token=this.token();if(!token)throw Object.assign(Error('NOT_LOGGED_IN'),{code:'NOT_LOGGED_IN'});headers.authorization='Bearer '+token;}
  let response;
  try{response=await this.fetcher(base+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(TIMEOUT)});}
  catch{throw Object.assign(Error('NETWORK'),{code:'NETWORK'});}
  const rotated=response.headers?.get?.('x-megulit-token');if(auth&&rotated&&/^mgl_[A-Za-z0-9_-]{43}$/.test(rotated))this.setToken(rotated);
  let data={};try{data=await response.json();}catch{}
  if(response.status===401&&auth){this.forget();throw Object.assign(Error('UNAUTHORIZED'),{code:'UNAUTHORIZED'});}
  if(!response.ok||data.ok===false){const code=typeof data.error==='string'?data.error:'HTTP_'+response.status;throw Object.assign(Error(code),{code,status:response.status,detail:data,...(response.status===429?{retryAfter:require('./relay-gate.cjs').retryAfterSeconds(response)}:{})});}
  return data;
 }
 /* local logout: token, sync state and cursors go; deviceId and kind choices stay */
 forget(){try{this.setToken('');}catch{}const p=this.profile();atomic(path.join(this.folder,'profile.json'),{deviceId:p.deviceId,kinds:p.kinds});try{const db=this.openDb();try{ensureState(db);db.exec('DELETE FROM account_sync');}finally{db.close();}}catch{}}

 status(){
  const p=this.profile(),loggedIn=!!(p.email&&this.token()),base=this.base();let pending={};
  if(loggedIn)try{const db=this.openDb();try{ensureState(db);pending=Object.fromEntries(db.prepare('SELECT kind,COUNT(*) n FROM account_sync WHERE pending=1 GROUP BY kind').all().map(r=>[r.kind,r.n]));}finally{db.close();}}catch{}
  return {configured:!!base,loggedIn,email:loggedIn?p.email:'',accountId:loggedIn?p.accountId||'':'',sessionId:loggedIn?p.sessionId||'':'',lastSyncAt:p.lastSyncAt||0,lastError:p.lastError||'',kinds:this.kinds(),pending,syncing:!!this.running,
  username:loggedIn?p.username||'':'',hasPassword:loggedIn?!!p.hasPassword:false,passwordKnown:loggedIn&&typeof p.hasPassword==='boolean',
  /* a code sign-in in the last 10 minutes may set a new password without the current one (relay rule) */
  codeFresh:loggedIn&&p.signInMethod==='code'&&this.now()-(Number(p.signedInAt)||0)<9.5*60000};
 }
 async requestCode(email){const clean=normalizeEmail(email);if(!clean)throw Object.assign(Error('EMAIL_INVALID'),{code:'EMAIL_INVALID'});await this.call('POST','/api/auth/code',{email:clean},{auth:false});this.saveProfile({pendingEmail:clean});return {sent:true,email:clean,expiresIn:600};}
 async verify(email,code,kindChoice){
  const clean=normalizeEmail(email||this.profile().pendingEmail);if(!clean)throw Object.assign(Error('EMAIL_INVALID'),{code:'EMAIL_INVALID'});
  const digits=String(code||'').replace(/\s+/g,'');if(!/^\d{6}$/.test(digits))throw Object.assign(Error('WRONG_CODE'),{code:'WRONG_CODE'});
  const data=await this.call('POST','/api/auth/verify',{email:clean,code:digits,device:this.deviceName()},{auth:false});
  return this.signedIn(data,kindChoice,'code');
 }
 deviceName(){return 'Windows · '+this.deviceId().slice(0,4);}
 /* code and password sign-in store the answer the same way: token in the vault, ids in profile.json */
 signedIn(data,kindChoice,method){
  if(!data||typeof data.token!=='string'||!data.accountId)throw Object.assign(Error('SERVER_ERROR'),{code:'SERVER_ERROR'});
  const previous=this.profile();if(previous.accountId&&previous.accountId!==data.accountId)this.forget();
  this.setToken(data.token);
  const same=previous.accountId===data.accountId;
  this.saveProfile({email:data.email,accountId:data.accountId,sessionId:data.sessionId,pendingEmail:undefined,cursors:same?previous.cursors:{},lastError:'',
   signInMethod:method,signedInAt:this.now(),username:same?previous.username:undefined,hasPassword:method==='password'?true:same?previous.hasPassword:undefined,...(kindChoice?{kinds:cleanKinds(kindChoice)}:{})});
  return this.status();
 }
 /* 2026-11-12 password sign-in with the e-mail or the user name (relay: POST /api/auth/password) */
 async passwordLogin(login,password,kindChoice){
  const raw=String(login||'').trim(),secret=String(password||''),mail=raw.includes('@');
  const value=mail?normalizeEmail(raw):USERNAME.test(raw)?raw:'';
  if(!value){const code=mail?'EMAIL_INVALID':'LOGIN_INVALID';throw Object.assign(Error(code),{code});}
  if(!secret||secret.length>128)throw Object.assign(Error('WRONG_PASSWORD'),{code:'WRONG_PASSWORD'});
  const data=await this.call('POST','/api/auth/password',{login:value,password:secret,device:this.deviceName()},{auth:false});
  return this.signedIn(data,kindChoice,'password');
 }
 /* the user name is chosen once; the relay refuses any later change (USERNAME_LOCKED) */
 async setUsername(name){
  const clean=String(name||'').trim();if(!USERNAME.test(clean))throw Object.assign(Error('USERNAME_INVALID'),{code:'USERNAME_INVALID'});
  try{const data=await this.call('POST','/api/me/username',{username:clean});this.saveProfile({username:data.username||clean});}
  catch(error){if(error.code==='USERNAME_LOCKED')await this.me().catch(()=>{});throw error;}
  return this.status();
 }
 async setPassword(password,current){
  const secret=String(password||'');if(secret.length<8||secret.length>128)throw Object.assign(Error('PASSWORD_LENGTH'),{code:'PASSWORD_LENGTH'});
  await this.call('POST','/api/me/password',{password:secret,...(current?{current:String(current)}:{})});
  this.saveProfile({hasPassword:true});return this.status();
 }
 setKinds(choice){this.saveProfile({kinds:cleanKinds({...this.kinds(),...choice})});return this.status();}
 async me(){const data=await this.call('GET','/api/me');if(data&&typeof data==='object'&&this.profile().accountId===data.accountId)this.saveProfile({username:data.username||undefined,hasPassword:!!data.hasPassword});return data;}
 async logout(sessionId){
  if(sessionId&&sessionId!==this.profile().sessionId){await this.call('POST','/api/auth/logout',{sessionId});return this.status();}
  try{await this.call('POST','/api/auth/logout',{});}catch(error){if(!['NETWORK','UNAUTHORIZED','RELAY_NOT_CONFIGURED','NOT_LOGGED_IN'].includes(error.code))throw error;}
  this.forget();return this.status();
 }
 async remove(){await this.call('DELETE','/api/me');this.forget();return this.status();}

 sync(options={}){if(this.running)return this.running;this.running=this.syncNow(options).finally(()=>{this.running=null;});return this.running;}
 async syncNow({only}={}){
  if(!this.token()||!this.profile().email)throw Object.assign(Error('NOT_LOGGED_IN'),{code:'NOT_LOGGED_IN'});
  const chosen=this.kinds(),summary={};const db=this.openDb();
  const ctx={now:this.now,deviceId:()=>this.deviceId()};
  try{
   ensureState(db);try{relinkGames(db);}catch{}
   const active=KINDS.filter(kind=>chosen[kind]&&!(only&&!only.includes(kind)));
   /* scan every kind first, without network, so offline changes are all queued even when the relay is unreachable */
   for(const kind of active){
    const spec=kinds[kind];summary[kind]={pulled:0,pushed:0,changed:0};
    db.exec('BEGIN IMMEDIATE');try{summary[kind].changed=scan(db,kind,spec.collect(db,this.root,ctx),this.now(),spec.times?.(db,this.root));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   }
   for(const kind of active){
    const s=summary[kind];
    let cursor=Number(this.profile().cursors?.[kind])||0;
    for(let page=0;page<200;page++){
     const data=await this.call('GET',`/api/sync/${kind}?since=${cursor}`);
     s.pulled+=applyRemote(db,this.root,kind,data.records||[],ctx);
     cursor=Number(data.cursor)||cursor;this.saveProfile({cursors:{...this.profile().cursors,[kind]:cursor}});
     if(!data.more)break;
    }
    for(const part of chunks(pendingRecords(db,this.root,kind,ctx))){
     const data=await this.call('PUT',`/api/sync/${kind}`,{records:part});
     const lost=new Set((data.newer||[]).map(r=>r.key)),done=db.prepare('UPDATE account_sync SET pending=0 WHERE kind=? AND key=? AND updated_at=?');
     for(const r of part)if(!lost.has(r.key))done.run(kind,r.key,r.updated_at);
     if(data.newer?.length)applyRemote(db,this.root,kind,data.newer,ctx,{force:true});
     s.pushed+=data.accepted||0;
    }
   }
   this.saveProfile({lastSyncAt:this.now(),lastError:''});
   return {...this.status(),summary};
  }catch(error){if(error.code!=='UNAUTHORIZED')this.saveProfile({lastError:error.code||error.message});throw error;}
  finally{db.close();}
 }
}
function cleanKinds(choice){const out={};for(const k of KINDS)out[k]=typeof choice?.[k]==='boolean'?choice[k]:DEFAULT_KINDS[k];return out;}

const accounts=new Map();
function accountFor(root,options){const key=path.resolve(root);if(options)return new Account(key,options);if(!accounts.has(key))accounts.set(key,new Account(key));return accounts.get(key);}
/* bridge entry: account_status / account_code / account_verify / account_password_login / account_username /
   account_password / account_sync / account_kinds / account_me /
   account_logout / account_delete. A stale sync (>15 min) starts in the background when the page asks for status. */
async function handle(root,request,options){
 const a=accountFor(root,options),action=String(request.action);
 switch(action){
  case 'account_status':{const s=a.status();if(s.loggedIn&&s.configured&&!s.syncing&&a.now()-s.lastSyncAt>15*60000&&request.autoSync!==false)a.sync().catch(()=>{});return s;}
  case 'account_code':return a.requestCode(String(request.email||''));
  case 'account_verify':{const s=await a.verify(String(request.email||''),String(request.code||''),request.kinds&&typeof request.kinds==='object'?request.kinds:null);a.sync().catch(()=>{});return s;}
  case 'account_password_login':{const s=await a.passwordLogin(String(request.login||''),String(request.password||''),request.kinds&&typeof request.kinds==='object'?request.kinds:null);a.sync().catch(()=>{});return s;}
  case 'account_username':return a.setUsername(String(request.username||''));
  case 'account_password':return a.setPassword(String(request.password||''),typeof request.current==='string'?request.current:'');
  case 'account_sync':return a.sync();
  case 'account_kinds':return a.setKinds(request.kinds&&typeof request.kinds==='object'?request.kinds:{});
  case 'account_me':return a.me();
  case 'account_logout':return a.logout(typeof request.sessionId==='string'?request.sessionId:'');
  case 'account_delete':return a.remove();
  default:throw Error('ACCOUNT_ACTION_INVALID');
 }
}
function status(root){return accountFor(root).status();}
function token(root){return accountFor(root).token();}
module.exports={relinkGames,accountExtras,Account,handle,status,token,relayBase,normalizeBase,normalizeEmail,newerRecord,cleanSettings,looksLikePath,hashData,stable,kinds,scan,applyRemote,pendingRecords,ensureState,chunks,KINDS,DEFAULT_KINDS,RECORD_CAP};
