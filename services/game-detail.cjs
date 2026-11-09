// SPDX-License-Identifier: GPL-3.0-or-later
const path=require('node:path'),store=require('./store.cjs');
function workIdentity(row,original){
 const library=original.library||{};
 const appid=String(library.appid||'')||require('../core/library.cjs').steamAppidFor(row.executable);
 const vndbId=original.vndbManual||(!appid||library.vndbSteamAppid===appid?library.vndbId:'');
 return {appid,vndbId:String(vndbId||'')};
}
function record(db,id){const row=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(id);if(!row)throw Error('GAME_NOT_FOUND');let original={};try{original=JSON.parse(row.original||'{}');}catch{}return{row,original};}
function synopsis(root,row,original,locale){const identity=workIdentity(row,original),saved=store.readJSON(path.join(root,'data/config/synopsis.json'))[String(row.legacy_id??row.id)]||{};const cached=!identity.appid||saved.steamIdentity===identity.appid+':'+identity.vndbId?saved:{},media=original.media||{},library=original.library||{};const lang=['zh','ja','en'].includes(locale)?locale:'zh';const source=cached.src?.[lang],approved=!cached[lang]||require('../core/synopsis-policy.cjs').approved(source);return {text:String(approved?cached[lang]||media.description||library.description||'':'').replace(/<[^>]+>/g,'').trim(),source:approved&&cached[lang]?String(source||''):'',lang};}
function detail(db,root,id,locale){const {row,original}=record(db,id),game=store.games(db,root).find(game=>game.id===id),library=original.library||{},media=original.media||{};
 const sessions=db.prepare('SELECT id,started_at,ended_at,active_seconds,characters,sentences FROM reading_sessions WHERE game_id=? ORDER BY started_at DESC LIMIT 60').all(id);
 const words=db.prepare('SELECT DISTINCT v.id,v.spelling,v.reading,v.definitions,v.status,v.created_at FROM vocabulary v JOIN examples e ON e.word_id=v.id WHERE e.game_id=? ORDER BY v.created_at DESC LIMIT 250').all(id);
 const sentences=db.prepare('SELECT id,text,translation,created_at FROM saved_sentences WHERE game_id=? ORDER BY created_at DESC LIMIT 250').all(id);
 const count=db.prepare('SELECT COUNT(*) sessions FROM reading_sessions WHERE game_id=?').get(id);
 const launchIssue=require('./game-language.cjs').originalExecutable(db,id,root).blocked?'JAPANESE_EXECUTABLE_REQUIRED':require('./locale-launch.cjs').requiresAdministrator(row.executable)?'GAME_ELEVATION_REQUIRED':'';
 const identity=workIdentity(row,original);game.vndbId=identity.vndbId;let reception=store.readJSON(path.join(root,'data/config/game-reception.json'))[id];if(reception&&identity.appid&&reception.vndb?.url!=='https://vndb.org/'+identity.vndbId)reception={...reception,vndb:null};return {game,launchIssue,reception:reception?{...reception,reviews:reception.reviews?.[locale]||[]}:null,synopsis:synopsis(root,row,original,locale),info:{names:Array.isArray(library.names)?library.names:[],source:row.source,executable:row.executable,status:row.status,appid:library.appid||'',vndbId:identity.vndbId,developer:media.developer||library.developer||'',released:media.release_date||library.release_date||''},sessions,words,sentences,counts:{sessions:count.sessions,sentences:db.prepare('SELECT COUNT(*) n FROM saved_sentences WHERE game_id=?').get(id).n}};
}
async function refreshSynopsis(db,root,id,locale){const {row,original}=record(db,id),library=original.library||{},identity=workIdentity(row,original);const {Synopses}=require('../core/library.cjs');return new Synopses({config:path.join(root,'data/config')}).get({mediaId:row.legacy_id??row.id,titles:library.names||[row.title],vndbId:identity.vndbId,appid:identity.appid,lang:locale,refresh:true});}
module.exports={detail,refreshSynopsis};
