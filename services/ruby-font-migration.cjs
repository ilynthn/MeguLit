// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Furigana default: Noto Sans JP, bundled in web/fonts (SIL OFL 1.1), so it is the same on every PC whether or not the font is
   installed. Before v1.2.2 the default was 'round' (Meiryo), and every saved settings object carried it. Once for every user,
   a furigana font still on that old default moves to Noto Sans JP: the global session settings, the home page's text preset and
   every work's saved Alt+T settings (and its history). Any other font the user picked is kept, and so is anything picked after
   the run (the meta flag keeps it to one run). A saved 'round' cannot be told apart from a hand-picked Meiryo; it is treated as
   the old default. A locked file throws, so the flag is not set and the next start retries; the original file is only replaced
   by a complete rewrite (write to a temporary file, then rename). */
const path=require('node:path');
const {rewrite}=require('./font-follow-migration.cjs');
const FLAG='ruby-font-noto-v1',OLD_DEFAULT='round',NEW_DEFAULT='notoSansJP';
function move(prefs){if(!prefs||typeof prefs!=='object'||prefs.rubyFont!==OLD_DEFAULT)return false;prefs.rubyFont=NEW_DEFAULT;return true;}
function migrateFiles(folder){
 const result={global:false,preset:false,profiles:0};
 result.global=rewrite(path.join(folder,'gal-preferences.json'),move);
 result.preset=rewrite(path.join(folder,'text-defaults.json'),move);
 rewrite(path.join(folder,'game-style-profiles.json'),doc=>{let changed=false;for(const entry of Object.values(doc.entries||{})){if(!entry||typeof entry!=='object')continue;let hit=false;if(entry.prefs&&typeof entry.prefs==='object')hit=move(entry.prefs)||hit;for(const old of Array.isArray(entry.history)?entry.history:[])if(old?.prefs)hit=move(old.prefs)||hit;if(hit){changed=true;result.profiles++;}}return changed;});
 return result;
}
function migrateRubyFont(db,root){
 if(db.prepare('SELECT value FROM meta WHERE key=?').get(FLAG))return null;
 const result=migrateFiles(path.join(root,'data','config'));
 db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(FLAG,JSON.stringify({at:new Date().toISOString(),...result}));
 return result;
}
module.exports={FLAG,OLD_DEFAULT,NEW_DEFAULT,migrateRubyFont,migrateFiles,move};
