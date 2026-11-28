// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 作品和游戏社的介绍默认中文界面取萌娘百科、其他语言取 VNDB，并且能手动切换) where the introductions come from.
   2026-11-28 (owner: 再加一个来源 Bangumi) library.json infoSource:
     'auto'          the default. Chinese UI: Bangumi when its introduction is written in Chinese (many Bangumi game entries carry
                     the Japanese official story text instead), else Moegirlpedia, else VNDB. Every other language: VNDB.
     'moegirl'       Moegirlpedia first in any UI language, then VNDB
     'bangumi'       Bangumi first in any UI language, then VNDB
     'bangumi-only'  Bangumi only
     'vndb'          VNDB only
   order() is the list the pages walk, first source with a text wins. 'bangumi-zh' is Bangumi only when its text is Chinese.
   The setting is independent of the UI language. */
const fs=require('node:fs'),path=require('node:path');
const VALUES=['auto','moegirl','bangumi','bangumi-only','vndb'];
function get(root){try{const v=JSON.parse(fs.readFileSync(path.join(root,'data','config','library.json'),'utf8')).infoSource;return VALUES.includes(v)?v:'auto';}catch{return 'auto';}}
function order(source,locale){
 if(source==='moegirl')return ['moegirl','vndb'];
 if(source==='bangumi')return ['bangumi','vndb'];
 if(source==='bangumi-only')return ['bangumi'];
 if(source==='vndb')return ['vndb'];
 return locale==='zh'?['bangumi-zh','moegirl','vndb']:['vndb'];
}
const prefersMoegirl=(source,locale)=>order(source,locale).find(s=>s!=='bangumi-zh')==='moegirl';
module.exports={get,VALUES,order,prefersMoegirl,forRoot:(root,locale)=>order(get(root),locale)};
