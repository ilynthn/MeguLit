// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* User, 2026-11-13: the game's own font (reported by the font probe / engine, or imported from the game's memory or folder)
   comes first. Once for every user: every Japanese font chosen by hand, in the global settings and in every work's saved
   Alt+T settings (and its history), goes back to "follow the game's font". The meta flag keeps it to a single run, so a font
   the user picks afterwards (japaneseFontSource 'user') is kept. */
const fs=require('node:fs'),path=require('node:path');
const FLAG='font-follow-game-v1';
const automatic=v=>/^(engine:|game:)/.test(String(v||''))||['originalGothic','originalMincho'].includes(v);
function follow(prefs){if(!prefs||typeof prefs!=='object')return false;let changed=false;
 if(prefs.japaneseFontSource!=='game'){prefs.japaneseFontSource='game';changed=true;}
 if(prefs.japaneseFont!==undefined&&!automatic(prefs.japaneseFont)){prefs.japaneseFont='originalGothic';changed=true;}
 return changed;}
function rewrite(file,edit){/* only a missing or unparsable file means nothing to do; a locked file throws so the one-time flag is not set and the next start retries */let doc;try{doc=JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error?.code==='ENOENT'||error instanceof SyntaxError)return false;throw error;}if(!doc||typeof doc!=='object'||Array.isArray(doc)||!edit(doc))return false;const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(doc,null,2));try{fs.renameSync(tmp,file);}catch(error){try{fs.unlinkSync(tmp);}catch{}throw error;}return true;}
function migrateFiles(folder){
 const result={global:false,profiles:0};
 result.global=rewrite(path.join(folder,'gal-preferences.json'),follow);
 rewrite(path.join(folder,'game-style-profiles.json'),doc=>{let changed=false;for(const entry of Object.values(doc.entries||{})){if(!entry||typeof entry!=='object')continue;let hit=false;if(entry.prefs&&typeof entry.prefs==='object')hit=follow(entry.prefs)||hit;for(const old of Array.isArray(entry.history)?entry.history:[])if(old?.prefs)hit=follow(old.prefs)||hit;if(hit){changed=true;result.profiles++;}}return changed;});
 return result;
}
function migrateFontFollow(db,root){
 if(db.prepare('SELECT value FROM meta WHERE key=?').get(FLAG))return null;
 const result=migrateFiles(path.join(root,'data','config'));
 db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(FLAG,JSON.stringify({at:new Date().toISOString(),...result}));
 return result;
}
module.exports={FLAG,migrateFontFollow,migrateFiles,follow};
