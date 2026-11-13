// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14 (ダストマニア・グロテスク, BRUNS): the launch notice said the script was Chinese and 工具 › 日文原版恢复 said
   「游戏目录里没有扫描到日文剧本」, while gameplay.exe is the Japanese original and MeguLit captured Japanese from it. One
   shared answer to "does this install have Japanese", for the launch notice, the game page and the restore tool:
   true   the script MeguLit read is Japanese, the restore check calls it Japanese already, or the captured history is
   false  the readable script is Chinese only (no kana)
   null   cannot tell yet: stay quiet and let the first captured lines decide (kana ratio). */
const fs=require('node:fs'),path=require('node:path');
const KANA=/[ぁ-ゖァ-ヺ]/;

// Saved zero-latency state only (no scan): what the script reader already found for this game.
function fromScript(root,id){
 let all={};try{all=JSON.parse(fs.readFileSync(path.join(root,'data','config','original-text.json'),'utf8'))||{};}catch{}
 const s=all[String(id)];if(!s)return null;
 if(s.status==='native-japanese'||s.status==='ready')return true;
 if(s.status==='chinese-only')return false;
 return null;
}
// Captured lines of this game: Japanese when enough of the story-length lines carry kana.
function fromHistory(db,id,{limit=200}={}){
 let rows=[];try{rows=db.prepare('SELECT text FROM reading_events WHERE game_id=? ORDER BY id DESC LIMIT ?').all(String(id),limit);}catch{return null;}
 const lines=rows.map(r=>String(r.text||'').trim()).filter(t=>t.length>=4);if(lines.length<5)return null;
 const ja=lines.filter(t=>KANA.test(t)).length;return ja>=Math.max(3,lines.length*.3)?true:null;
}
function verdict(root,db,id,{executable}={}){
 const script=fromScript(root,id);if(script!==null)return {japanese:script,by:'script'};
 if(fromHistory(db,id))return {japanese:true,by:'history'};
 if(executable){try{const r=require('../core/japanese-restore.cjs').detect(path.dirname(executable));if(r.state==='already')return {japanese:true,by:'restore'};}catch{}}
 return {japanese:null,by:''};
}
module.exports={verdict,fromScript,fromHistory};
