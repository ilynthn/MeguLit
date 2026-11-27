// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The name a library game is shown by. One owner for every way a title gets into the library (manual add, folder scan,
   Steam import, seed match, VNDB enrichment), so the first of these that exists wins:
     1. a name the user typed or edited                    titleSource 'user'   never replaced
     2. the work's name: the seed's Japanese name, else    titleSource 'work'
        VNDB's original-script name (alttitle)
     3. the name a scan found (Steam's name, a VNDB match  titleSource 'scan'
        the scanner made)
     4. the folder or program name                         titleSource 'folder'
   The title source is kept in games.original.titleSource. A game saved before this existed has none: its title counts as a
   folder name when it equals one (Ozmafia-ozmafia-joki for OZMAFIA!!), and as the user's otherwise, so nothing a user typed
   is lost. A replaced title is kept in games.original.titleAliases, which the library search reads like other aliases. */
const path=require('node:path');
const {gameTitle}=require('./game-title.cjs');
const RANK={folder:0,scan:1,work:2,user:3};
const fold=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
/* the folder and program names a title may have been taken from: the program without .exe, its folder and the folder above
   (a scan names a work by its install folder, which can hold the program one level down), each also without the edition
   words the folder scanner drops (core/library.cjs label) */
function fallbackNames(executable){
 const file=String(executable||'');if(!file)return [];
 const parts=file.split(/[\\/]+/).filter(Boolean),exe=parts.at(-1)||'',dirs=parts.slice(-3,-1);
 const names=[exe,exe.replace(/\.exe$/i,''),...dirs];
 return [...new Set(names.flatMap(n=>[n,n.replace(/[_\- ]?(hd|hd版|高清版|steam版|dl版|パッケージ版)$/i,'')]).map(n=>n.trim()).filter(Boolean))];
}
function isFallback(title,executable){const t=fold(title);return !t||fallbackNames(executable).some(n=>fold(n)===t);}
/* where the title of a stored game came from; old rows have no titleSource */
function sourceOf(title,executable,original={}){
 const s=original?.titleSource;if(Object.hasOwn(RANK,s))return s;
 return isFallback(title,executable)?'folder':'user';
}
/* the source of a title a scan or a non-UI caller wrote */
const scanned=(title,executable)=>isFallback(title,executable)?'folder':'scan';
/* the work name a seed gives: its Japanese name among match.titles (喫茶ステラと死神の蝶, not Cafe Stella) */
function seedName(seed){const titles=(seed?.match?.titles||[]).filter(t=>typeof t==='string'&&t.trim());return titles.length?gameTitle(titles[0],titles.slice(1)).ja:'';}
/* the seed game this copy matches (core/profiles/index.cjs findGame, the same rule that applies its settings) */
function seedFor({executable,title,engine,exeSha256,vndb}={}){
 try{const P=require('./profiles/index.cjs');const hit=P.findGame({exe:executable,title,engine,exeSha256,vndb,folder:executable?path.dirname(executable):''});
  return hit?.game?.seed?hit.game:null;}catch{return null;}
}
const seedTitle=input=>seedName(seedFor(input));
/* VNDB's name in the original script, else its main title */
const vndbTitle=vn=>String(vn?.alttitle||vn?.title||'').trim();
/* the work name, or '' when neither the seed nor VNDB knows it */
function workTitle({seed='',vn=null}={}){return String(seed||'').trim()||vndbTitle(vn);}
/* a stored game given a work name: the new title and original, or null when the title stays (the user's own name, the same
   name, no work name). The title it replaces goes to titleAliases, so a search for the folder name still finds the game. */
function upgrade({title,executable,original={}},work){
 const next=String(work||'').trim().slice(0,240);if(!next||next===title)return null;
 if(RANK[sourceOf(title,executable,original)]>=RANK.user)return null;
 const aliases=[...new Set([...(Array.isArray(original.titleAliases)?original.titleAliases:[]),title].filter(t=>t&&t!==next))].slice(-12);
 return {title:next,original:{...original,titleSource:'work',titleAliases:aliases}};
}
module.exports={fallbackNames,isFallback,sourceOf,scanned,seedName,seedFor,seedTitle,vndbTitle,workTitle,upgrade,RANK};
