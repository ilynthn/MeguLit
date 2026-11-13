// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14 one identity per game for the automatic probe upload (owner: 去重，不要把每个人的同一个游戏都加一加一加一).
   The relay keeps one probe per identity, so every player of the same game must land on the same id, wherever the game
   is installed, and two different games must not:
     engine    what the offline probe detected (or the archive formats it saw), 'unknown' when neither
     exe       sha256 over the main exe's size, first MiB and last MiB (content, not the file name or the folder)
     names     sha256 over the sorted archive names relative to the game folder (already masked by the probe) — what
               tells two games apart that share one engine exe
   id = sha256('megulit.probe-id/1|' + engine + '|' + exe + '|' + names). Nothing in it can be read back: no path, no
   title, no user name. The VNDB id is not part of the hash (one player may have it matched and the next not, which
   would split the game in two); it travels next to the id as a hint for the maintainer. */
const fs=require('node:fs'),crypto=require('node:crypto');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const MIB=1<<20;
/* exe content hash: size + first MiB + last MiB ('' when it cannot be read) */
function exeHash(executable){let fd;try{fd=fs.openSync(executable,'r');const size=fs.fstatSync(fd).size,h=crypto.createHash('sha256');h.update(String(size)+'|');
 const head=Buffer.alloc(Math.min(MIB,size));fs.readSync(fd,head,0,head.length,0);h.update(head);
 if(size>MIB){const n=Math.min(MIB,size-MIB),tail=Buffer.alloc(n);fs.readSync(fd,tail,0,n,size-n);h.update(tail);}
 return h.digest('hex');}catch{return '';}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}}
const ENGINE=/^[a-z0-9:._-]{1,40}$/i;
function engineOf(result){const d=String(result?.detected||result?.unsupported?.engine||'').toLowerCase();if(d&&ENGINE.test(d))return d;
 const formats=[...new Set((result?.inventory?.archives||[]).map(a=>String(a.format||'')).filter(f=>/^[a-z0-9-]{1,20}$/.test(f)))].sort();
 return formats.length?'fmt:'+formats.join('+'):'unknown';}
/* archive names, folder-relative with forward slashes, lower case, sorted; without archives the extension census */
function namesOf(result){const inv=result?.inventory||{};const names=(inv.archives||[]).map(a=>String(a.name||'').replace(/\\/g,'/').toLowerCase()).filter(Boolean).sort();
 if(names.length)return sha('archives|'+names.join('\n'));
 const ext=Object.entries(inv.ext||{}).map(([k,v])=>String(k).toLowerCase()+':'+(v|0)).sort();return sha('ext|'+ext.join('\n'));}
const VNDB=/^v[1-9]\d{0,7}$/;
/* identity({executable,result,vndb}) → {id,engine,vndb} ({id:''} when the exe cannot be read) */
function identity({executable,result,vndb=''}={}){const exe=exeHash(executable);if(!exe)return {id:'',engine:'',vndb:''};
 const engine=engineOf(result);return {id:sha('megulit.probe-id/1|'+engine+'|'+exe+'|'+namesOf(result)),engine,vndb:VNDB.test(String(vndb))?String(vndb):''};}
/* the game's VNDB id from the library row (games.original JSON: vndbManual, else library.vndbId) */
function vndbOf(db,gameId){try{const row=db.prepare('SELECT original FROM games WHERE id=?').get(gameId);const o=JSON.parse(row?.original||'{}');const v=String(o.vndbManual||o.library?.vndbId||'');return VNDB.test(v)?v:'';}catch{return '';}}
module.exports={identity,exeHash,engineOf,namesOf,vndbOf};
