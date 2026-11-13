// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS games (
 id TEXT PRIMARY KEY, legacy_id INTEGER UNIQUE, title TEXT NOT NULL,
 executable TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '',
 source TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
 last_launched_at INTEGER, original TEXT NOT NULL DEFAULT '{}', removed_at INTEGER, hidden_at INTEGER
);
CREATE TABLE IF NOT EXISTS vocabulary (
 id INTEGER PRIMARY KEY, spelling TEXT NOT NULL, reading TEXT NOT NULL,
 definitions TEXT NOT NULL, status INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, image TEXT, original TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS examples (
 id INTEGER PRIMARY KEY, word_id INTEGER NOT NULL, game_id TEXT,
 text TEXT NOT NULL, translation TEXT, highlight_start INTEGER, highlight_end INTEGER,
 created_at INTEGER, original TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS saved_sentences (
 id INTEGER PRIMARY KEY, game_id TEXT, text TEXT NOT NULL,
 translation TEXT, created_at INTEGER NOT NULL, original TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reading_sessions (
 id INTEGER PRIMARY KEY, game_id TEXT, started_at INTEGER NOT NULL,
 ended_at INTEGER, active_seconds INTEGER NOT NULL DEFAULT 0,
 characters INTEGER NOT NULL DEFAULT 0, sentences INTEGER NOT NULL DEFAULT 0,
 original TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS reading_events (
 id INTEGER PRIMARY KEY, session_id INTEGER, game_id TEXT, text TEXT NOT NULL,
 read_at INTEGER NOT NULL, active_seconds INTEGER, original TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS lookup_events (
 id INTEGER PRIMARY KEY, game_id TEXT, word_id INTEGER, surface TEXT NOT NULL,
 occurred_at INTEGER NOT NULL, operation_id TEXT UNIQUE, original TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS preserved_records (
 collection TEXT NOT NULL, record_key TEXT NOT NULL, payload TEXT NOT NULL,
 PRIMARY KEY(collection,record_key)
);
CREATE TABLE IF NOT EXISTS word_trash (
 id INTEGER PRIMARY KEY AUTOINCREMENT, word_id INTEGER NOT NULL, deleted_at INTEGER NOT NULL,
 snapshot TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reading_by_game ON reading_sessions(game_id,started_at);
CREATE INDEX IF NOT EXISTS events_by_time ON reading_events(read_at);
CREATE INDEX IF NOT EXISTS lookups_by_time ON lookup_events(occurred_at);
CREATE TABLE IF NOT EXISTS dictionary_entries (id INTEGER PRIMARY KEY, spelling TEXT NOT NULL, reading TEXT NOT NULL, definition TEXT NOT NULL, frequency INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS dictionary_forms (form TEXT NOT NULL, entry_id INTEGER NOT NULL, PRIMARY KEY(form,entry_id));
CREATE TABLE IF NOT EXISTS review_events (id INTEGER PRIMARY KEY, word_id INTEGER NOT NULL, reviewed_at INTEGER NOT NULL);
`;
const jsonify = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item instanceof Uint8Array ? { base64: Buffer.from(item).toString('base64') } : item);
const readJSON = (filename, fallback = {}) => { try { return JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { return fallback; } };
const safeBasename = filename => path.win32.basename(String(filename || ''));
const gameId = id => id == null ? null : 'game-' + id;

function openStore(root) {
  const folder = path.join(root, 'data');
  fs.mkdirSync(folder, { recursive: true });
  const brand=require('./brand-migration.cjs');brand.relocateConfig(root);
  const db = new DatabaseSync(brand.databasePath(root));
  db.exec('PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;');
  db.exec(SCHEMA);
  if(!db.prepare("SELECT value FROM meta WHERE key='megulit-path-migration'").get()){
    const update=db.prepare('UPDATE games SET executable=?,cover=? WHERE id=?');
    for(const row of db.prepare('SELECT id,executable,cover FROM games').all())update.run(brand.relocated(row.executable,root),brand.relocated(row.cover,root),row.id);
    const images=db.prepare('UPDATE vocabulary SET image=? WHERE id=?');for(const row of db.prepare('SELECT id,image FROM vocabulary WHERE image IS NOT NULL').all())images.run(brand.relocated(row.image,root),row.id);
    db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('megulit-path-migration',root);
  }
  if(!db.prepare('PRAGMA table_info(games)').all().some(column=>column.name==='removed_at'))db.exec('ALTER TABLE games ADD COLUMN removed_at INTEGER');
  if(!db.prepare('PRAGMA table_info(games)').all().some(column=>column.name==='hidden_at'))db.exec('ALTER TABLE games ADD COLUMN hidden_at INTEGER');
  require('./saved-sentences.cjs').migrate(db);
  require('./series-migration.cjs').migrateSeries(db,root);
  try{require('./wait-marker-migration.cjs').migrateWaitMarker(db,root);}catch(error){console.warn('wait marker migration',error.message);}
  try{require('./font-follow-migration.cjs').migrateFontFollow(db,root);}catch(error){console.warn('font follow migration',error.message);}
  reconcileRemovedGames(db);
  try{require('./library-dedupe.cjs').dedupe(db,root);}catch(error){console.warn('library dedupe',error.message);}
  return db;
}

function reconcileRemovedGames(db){
  if(!db.prepare("SELECT value FROM meta WHERE key='migration-complete'").get()||db.prepare("SELECT value FROM meta WHERE key='reconciled-library-deletions-v1'").get())return;
  const counts=JSON.parse(db.prepare("SELECT value FROM meta WHERE key='migration-counts'").get()?.value||'{}');
  if(Object.hasOwn(counts,'media')){
    db.prepare(`UPDATE games SET removed_at=? WHERE removed_at IS NULL AND legacy_id IS NOT NULL
      AND json_type(original,'$.library')='object'
      AND NOT EXISTS (SELECT 1 FROM preserved_records p WHERE p.collection='media' AND CAST(json_extract(p.payload,'$.id') AS INTEGER)=games.legacy_id)`).run(Math.floor(Date.now()/1000));
  }
  db.prepare('INSERT INTO meta VALUES (?,?)').run('reconciled-library-deletions-v1',new Date().toISOString());
}

function finalizeMigration(root,snapshot,db,counts){
  const assets=path.join(root,'data','assets');fs.mkdirSync(assets,{recursive:true});
  for(const dir of ['covers','profile','word-images'])if(fs.existsSync(path.join(snapshot,dir)))fs.cpSync(path.join(snapshot,dir),path.join(assets,dir),{recursive:true});
  const prefsFile=path.join(root,'data','preferences.json');
  if(!fs.existsSync(prefsFile)){
    const native=readJSON(path.join(snapshot,'config','native-preferences.json'));
    const translation=readJSON(path.join(snapshot,'config','preferences.json'));
    const ui=readJSON(path.join(snapshot,'config','ui-state.json'));
    const language=['zh','ja','en'].includes(ui['tomoyo-ui-language'])?ui['tomoyo-ui-language']:['zh','ja','en'].includes(native.uiLanguage)?native.uiLanguage:'zh';
    fs.writeFileSync(prefsFile,JSON.stringify({schema:1,language,accent:translation.themeColor||'#ad1539',closeToTray:typeof native.closeToTray==='boolean'?native.closeToTray:true,username:typeof native.username==='string'?native.username:'',fontFamily:'',homeBackground:'',backgroundDim:.78},null,2));
  }
  fs.writeFileSync(path.join(root,'migration','migration-report.json'),JSON.stringify({schema:1,createdAt:db.prepare("SELECT value FROM meta WHERE key='migration-complete'").get().value,counts,games:db.prepare('SELECT COUNT(*) AS n FROM games').get().n,independentSchema:true,legacyRuntimeRequired:false,localStorage:'Checkpoint preserved; restored values require WebView verification',inheritedGameTests:'235 reported in source handoff; not rerun in a game'},null,2));
}

function migrate(root, snapshot = path.join(root, 'migration', 'baseline-20261103')) {
  const db = openStore(root);
  try {
    if(db.prepare("SELECT value FROM meta WHERE key='migration-complete'").get()){
      const counts=JSON.parse(db.prepare("SELECT value FROM meta WHERE key='migration-counts'").get().value);
      finalizeMigration(root,snapshot,db,counts);return {alreadyMigrated:true};
    }
    const sourceFile = path.join(snapshot, 'legacy.sqlite');
    if (!fs.existsSync(sourceFile)) throw Error('MIGRATION_SOURCE_MISSING');
    const source = new DatabaseSync(sourceFile, { readOnly: true });
    const tables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name));
    const rows = table => tables.has(table) ? source.prepare('SELECT * FROM "' + table + '"').all() : [];
    const library = readJSON(path.join(snapshot, 'config', 'library.json'));
    const media = new Map(rows('media').map(g => [g.id, g]));
    const archive = db.prepare('INSERT INTO preserved_records VALUES (?,?,?)');
    const counts = {};
    db.exec('BEGIN IMMEDIATE');
    try {
      const addGame = db.prepare('INSERT INTO games(id,legacy_id,title,executable,cover,source,status,original) VALUES (?,?,?,?,?,?,?,?)');
      const seen = new Set();
      for (const g of library.games || []) {
        const old = media.get(g.mediaId) || {};
        const id = g.mediaId == null ? 'library-' + (g.key || seen.size) : gameId(g.mediaId);
        if (seen.has(id)) continue;
        seen.add(id);
        addGame.run(id, g.mediaId ?? null, old.title || g.title || '', g.exe || '', safeBasename(g.cover || old.cover_path), g.source || '', old.status || 'active', jsonify({ library: g, media: old }));
      }
      for (const old of media.values()) if (!seen.has(gameId(old.id))) {
        addGame.run(gameId(old.id), old.id, old.title, '', safeBasename(old.cover_path), '', old.status, jsonify({ media: old }));
      }
      const word = db.prepare('INSERT INTO vocabulary VALUES (?,?,?,?,?,?,?,?)');
      for (const w of rows('words')) word.run(w.id,w.spelling,w.reading,w.definitions,w.status || 0,w.created_at,w.image_path || null,jsonify(w));
      const example = db.prepare('INSERT INTO examples VALUES (?,?,?,?,?,?,?,?,?)');
      for (const e of rows('word_sentences')) example.run(e.id,e.word_id,gameId(e.media_id),e.sentence_text,e.translation,e.highlight_start,e.highlight_end,e.created_at,jsonify(e));
      const sentence = db.prepare('INSERT INTO saved_sentences(id,game_id,text,translation,created_at,original) VALUES (?,?,?,?,?,?)');
      for (const s of rows('sentences')) sentence.run(s.id,gameId(s.media_id),s.sentence_text,s.translation,s.created_at,jsonify(s));
      const session = db.prepare('INSERT INTO reading_sessions VALUES (?,?,?,?,?,?,?,?)');
      for (const s of rows('sessions')) session.run(s.id,gameId(s.media_id),s.started_at,s.ended_at,Math.max(0,(s.ended_at ?? s.started_at)-s.started_at),s.moji_read,s.sentences_read,jsonify(s));
      const event = db.prepare('INSERT INTO reading_events VALUES (?,?,?,?,?,?,?)');
      for (const e of rows('sentence_read_events')) event.run(e.id,e.session_id,gameId(e.media_id),e.sentence_text,e.read_at,null,jsonify(e));
      const lookup = db.prepare('INSERT INTO lookup_events(id,game_id,word_id,surface,occurred_at,original) VALUES (?,?,?,?,?,?)');
      for (const e of rows('lookup_events')) lookup.run(e.id,gameId(e.media_id),e.word_id,e.surface_text,e.looked_up_at,jsonify(e));
      const trash = db.prepare('INSERT INTO word_trash(id,word_id,deleted_at,snapshot) VALUES (?,?,?,?)');
      for (const e of rows('tome_word_trash')) trash.run(e.id,e.word_id,e.deleted_at,e.snapshot);
      // Preserve every original record for verification and later feature adapters.
      // No upstream migration SQL or executable application code is used.
      for (const table of tables) if (!table.startsWith('sqlite_') && table !== '_sqlx_migrations') {
        const items = rows(table); counts[table] = items.length;
        items.forEach((item,index) => archive.run(table,String(index),jsonify(item)));
      }
      db.prepare('INSERT INTO meta VALUES (?,?)').run('migration-counts',jsonify(counts));
      db.prepare('INSERT INTO meta VALUES (?,?)').run('migration-complete',new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    finally { source.close(); }
    finalizeMigration(root,snapshot,db,counts);
    reconcileRemovedGames(db);
    return { counts, games:db.prepare('SELECT COUNT(*) AS n FROM games').get().n };
  } finally { db.close(); }
}

function dayBounds(now = new Date()) {
  const start = new Date(now); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(end.getDate()+1);
  return { start:Math.floor(start.getTime()/1000), end:Math.floor(end.getTime()/1000) };
}
function activeOnDay(session, start, end) {
  const finish = session.ended_at ?? session.started_at;
  const overlap = Math.max(0,Math.min(finish,end)-Math.max(session.started_at,start));
  const span = Math.max(0,finish-session.started_at);
  return span ? Math.min(session.active_seconds,Math.round(session.active_seconds*overlap/span)) : 0;
}
/* E-home: games the user picked for the home screen; ids only, bounded */
function cleanHomeShowcase(value){const v=value&&typeof value==='object'?value:{},ids=list=>Array.isArray(list)?[...new Set(list.filter(x=>typeof x==='string'&&x.length<200))].slice(0,500):[];return {mode:v.mode==='pick'?'pick':'auto',order:ids(v.order),pinned:ids(v.pinned),hidden:ids(v.hidden)};}
/* defaults for each page's veil (web/page-veils.js lists the same pages) */
const PAGE_VEILS={home:{a:.35,s:0,b:14},detail:{a:.25,s:0,b:8},leaderboard:{a:.3,s:0,b:10},history:{a:.3,s:0,b:10}};
function publicPreferences(root) {
  const p=readJSON(path.join(root,'data','preferences.json'));
  const veil=(v,d,max)=>Number.isFinite(v)?Math.max(0,Math.min(max,v)):d;
  return { homeShowcase:cleanHomeShowcase(p.homeShowcase), pageVeils:Object.fromEntries(Object.entries(PAGE_VEILS).map(([k,d])=>{const v=p.pageVeils&&typeof p.pageVeils==='object'&&p.pageVeils[k]||{};return [k,{a:veil(v.a,d.a,1),s:veil(v.s,d.s,1),b:veil(v.b,d.b,40)}];})), language:['zh','ja','en'].includes(p.language)?p.language:'zh', accent:/^#[0-9a-f]{6}$/i.test(p.accent)?p.accent:'#ad1539',closeToTray:p.closeToTray!==false,closeAsk:p.closeAsk!==false,glow:p.glow!==false,homeFontScale:Number.isFinite(p.homeFontScale)?Math.max(.85,Math.min(1.3,p.homeFontScale)):1,glowSpeed:Number.isFinite(p.glowSpeed)?Math.max(.25,Math.min(3,p.glowSpeed)):1,goldColor:/^#[0-9a-f]{6}$/i.test(p.goldColor)?p.goldColor:'',barColor:/^#[0-9a-f]{6}$/i.test(p.barColor)?p.barColor:'#1a1110',glassColor:/^#[0-9a-f]{6}$/i.test(p.glassColor)?p.glassColor:'',username:typeof p.username==='string'?p.username.slice(0,80):'',themeMode:['dark','black','light'].includes(p.themeMode)?p.themeMode:'dark',fontFamily:typeof p.fontFamily==='string'?p.fontFamily.slice(0,120):'',homeBackground:typeof p.homeBackground==='string'&&(p.homeBackground||p.defaultBackground110)?p.homeBackground:'background.jpg',backgroundDim:Math.max(0,Math.min(1,Number(p.backgroundDim ?? .78))),defaultBackground110:p.defaultBackground110===true,accentPresets:cleanAccentPresets(p.accentPresets) };
}
// User-saved accent colours, newest first; the oldest drops off past eight.
function cleanAccentPresets(list){return [...new Set((Array.isArray(list)?list:[]).filter(v=>/^#[0-9a-f]{6}$/i.test(v)).map(v=>v.toLowerCase()))].slice(0,8);
}
function imageData(root,folder,name) {
  if(!name || name!==safeBasename(name))return '';
  const file=path.join(root,'data','assets',folder,name);
  if(!fs.existsSync(file)||fs.statSync(file).size>12*1024*1024)return '';
  const type={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[path.extname(file).toLowerCase()];
  return type?'data:'+type+';base64,'+fs.readFileSync(file).toString('base64'):'';
}
function games(db,root,{includeRemoved=false}={}) {
  return db.prepare(`SELECT g.*, MAX(s.started_at) AS last_read_at, COALESCE(SUM(s.active_seconds),0) AS reading_seconds, COALESCE(SUM(s.characters),0) AS characters,(SELECT COUNT(DISTINCT e.word_id) FROM examples e JOIN vocabulary v ON v.id=e.word_id WHERE e.game_id=g.id) AS learned_words FROM games g LEFT JOIN reading_sessions s ON g.id=s.game_id ${includeRemoved?'':'WHERE g.removed_at IS NULL'} GROUP BY g.id ORDER BY MAX(COALESCE(g.last_launched_at,0),COALESCE(MAX(s.started_at),0)) DESC,g.title`).all().map(g=>{let catalog={},vndbManual='';try{const original=JSON.parse(g.original||'{}');catalog=original.library||{};vndbManual=original.vndbManual||'';}catch{}return({id:g.id,title:g.title,vndbId:String(vndbManual||catalog.vndbId||''),executable:g.executable,source:g.source,aliases:Array.isArray(catalog.names)?catalog.names:[],status:g.status,removed:g.removed_at!=null,hidden:g.hidden_at!=null,lastLaunchedAt:g.last_launched_at||null,lastPlayedAt:Math.max(g.last_launched_at||0,g.last_read_at||0)||null,readingSeconds:g.reading_seconds,characters:g.characters,learnedWords:g.learned_words,engine:String(catalog.engine||''),localeMode:catalog.localeMode||(catalog.localeJapanese===true?'japanese':'auto'),hookSupport:String(catalog.hook||'unknown'),cover:imageData(root,'covers',g.cover),available:!!g.executable&&fs.existsSync(g.executable)});});
}
function home(db,root,now = new Date()) {
  const {start,end}=dayBounds(now);
  const sessions=db.prepare('SELECT * FROM reading_sessions WHERE started_at<? AND COALESCE(ended_at,started_at)>=?').all(end,start);
  let background={};try{background=JSON.parse(readJSON(path.join(root,'data','ui-state.json'))['tome-background']||'{}');}catch{}
  return {games:games(db,root).filter(game=>!game.hidden),collections:require('./series.cjs').snapshot(db,root),preferences:publicPreferences(root),background,historyAppearance:{...require('./native-defaults.cjs'),...readJSON(path.join(root,'data','config','native-preferences.json'))},stats:{readingSeconds:sessions.reduce((n,s)=>n+activeOnDay(s,start,end),0),words:db.prepare('SELECT COUNT(*) AS n FROM vocabulary').get().n,lookups:db.prepare('SELECT COUNT(*) AS n FROM lookup_events WHERE occurred_at>=? AND occurred_at<?').get(start,end).n},capabilities:{launcher:true,library:true,history:true,vocabulary:true,overlay:false,advancedSettings:true},migration:readJSON(path.join(root,'migration','migration-report.json'))};
}
module.exports={SCHEMA,openStore,migrate,dayBounds,activeOnDay,publicPreferences,cleanHomeShowcase,imageData,games,home,readJSON,jsonify,gameId,reconcileRemovedGames};
