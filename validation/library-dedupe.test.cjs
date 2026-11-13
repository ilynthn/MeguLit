// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14: いろとりどりのヒカリ showed as two identical cards. Fixtures rebuild the real shape: one work installed
   twice in different folders (2012 Chinese-patched copy + 2022 HD), both active, same VNDB id. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('../services/store.cjs'),{reconcile}=require('../services/library.cjs'),dedupe=require('../services/library-dedupe.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-dedupe-')),closers=[];
 t.after(()=>{for(const c of closers)try{c();}catch{}fs.rmSync(root,{recursive:true,force:true});});
 const write=(rel,data='MZ')=>{const file=path.join(root,'GAL',rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);return file;};
 const open=()=>{const db=openStore(root);closers.push(()=>db.close());return db;};
 return {root,write,open};
}
const insert=(db,id,title,exe,library,extra={})=>db.prepare('INSERT INTO games(id,title,executable,cover,source,original,hidden_at,last_launched_at) VALUES(?,?,?,?,?,?,?,?)')
 .run(id,title,exe,extra.cover||'',library.source||'folder',JSON.stringify({...(extra.original||{}),library:{dir:path.dirname(exe),exe,...library}}),extra.hidden??null,extra.launched??null);
const active=db=>db.prepare('SELECT * FROM games WHERE removed_at IS NULL ORDER BY id').all();
const lib=row=>JSON.parse(row.original).library;

test('two installs of one work (old Chinese copy + HD) become one card with both editions, stats merged',t=>{
 const {root,write,open}=fixture(t);
 const old=write('[120831][FAVORITE] いろとりどりのヒカリ/五彩斑斓的曙光/五彩斑斓的曙光.exe','old'),hd=write('[220930][FAVORITE] いろとりどりのヒカリHD/いろとりどりのヒカリHD/irohika_HD.exe','hd');
 let db=open();
 insert(db,'game-old','いろとりどりのヒカリ',old,{key:'aaa',vndbId:'v10028',engine:'FVP'},{cover:'old.jpg'});
 insert(db,'game-hd','いろとりどりのヒカリ',hd,{key:'bbb',vndbId:'v10028',engine:'FVP'},{cover:'hd.jpg'});
 db.prepare('INSERT INTO reading_sessions(game_id,started_at,active_seconds,characters) VALUES(?,?,?,?)').run('game-old',100,600,1200);
 db.prepare("INSERT INTO saved_sentences(game_id,text,created_at,original) VALUES('game-hd','光',1,'{}')").run();
 db.close();
 db=open();
 const rows=active(db);
 assert.equal(rows.length,1,'one work = one card');
 assert.equal(rows[0].id,'game-old','the row with reading time keeps the card');
 assert.deepEqual(lib(rows[0]).variants.map(v=>v.exe),[old,hd]);
 assert.equal(lib(rows[0]).variants[1].label,'HD版');
 assert.equal(db.prepare('SELECT SUM(active_seconds) s FROM reading_sessions WHERE game_id=?').get('game-old').s,600);
 assert.equal(db.prepare('SELECT game_id FROM saved_sentences').get().game_id,'game-old');
 const merged=db.prepare('SELECT * FROM games WHERE id=?').get('game-hd');
 assert.notEqual(merged.removed_at,null,'soft-removed, not deleted');
 assert.equal(JSON.parse(merged.original).mergedInto,'game-old');
 assert(fs.readdirSync(path.join(root,'data','backups')).some(f=>/^megulit-before-dedupe-/.test(f)),'backup written before the merge');
 db.close();
 /* rescans of both folders keep one card and never drop the merged edition */
 reconcile(root,[{key:'aaa',source:'folder',title:'いろとりどりのヒカリ',dir:path.dirname(old),exe:old,engine:'FVP',vndbId:'v10028',variants:[]},
  {key:'bbb',source:'folder',title:'いろとりどりのヒカリ',dir:path.dirname(hd),exe:hd,engine:'FVP',vndbId:'v10028',variants:[]}],{restoreRemoved:true});
 db=open();
 assert.equal(active(db).length,1);
 assert.deepEqual(lib(active(db)[0]).variants.map(v=>v.exe),[old,hd]);
 assert.equal(dedupe.dedupe(db,root).length,0,'idempotent');
});

test('an untouched pair prefers the visible, Japanese, newer install; user cover and hidden state carry over',t=>{
 const {root,write,open}=fixture(t);
 const zh=write('Novel/Novel_chs.exe','zh'),jp=write('Novel HD/Novel.exe','jp');
 let db=open();
 insert(db,'game-zh','Novel',zh,{key:'k1',vndbId:'V77'},{cover:'mine.png',original:{coverCustom:true}});
 insert(db,'game-jp','Novel',jp,{key:'k2',vndbId:'v77'});
 insert(db,'game-hidden','Novel',write('copy/Novel.exe','copy'),{key:'k3',vndbId:'v77'},{hidden:5});
 db.close();db=open();
 const rows=active(db);
 assert.equal(rows.length,1);assert.equal(rows[0].id,'game-jp');
 assert.equal(rows[0].hidden_at,null);
 assert.equal(rows[0].cover,'mine.png');assert.equal(JSON.parse(rows[0].original).coverCustom,true);
 assert.equal(lib(rows[0]).variants.find(v=>v.exe===zh).label,'中文版');
});

test('legacy id and last launch move to the kept row; per-folder scanner duplicates merge too',t=>{
 const {write,open}=fixture(t);
 const exe=write('Same/Game.exe');
 let db=open();
 insert(db,'game-a','Same',exe,{key:'same'},{launched:50});
 db.prepare('INSERT INTO games(id,legacy_id,title,executable,original) VALUES(?,?,?,?,?)').run('game-b',9,'Same',exe,JSON.stringify({library:{key:'same',dir:path.dirname(exe)}}));
 db.prepare('INSERT INTO reading_sessions(game_id,started_at,active_seconds) VALUES(?,?,?)').run('game-b',1,30);
 db.close();db=open();
 const rows=active(db);
 assert.equal(rows.length,1);assert.equal(rows[0].id,'game-b');
 assert.equal(rows[0].legacy_id,9);assert.equal(rows[0].last_launched_at,50);
});

test('different works, Japanese-import sources and rows without identity are never merged',t=>{
 const {write,open}=fixture(t);
 let db=open();
 insert(db,'game-1','A',write('A/a.exe'),{key:'a',vndbId:'v1'});
 insert(db,'game-2','A fandisc',write('B/b.exe'),{key:'b',vndbId:'v2'});
 insert(db,'game-3','A',write('C/a.exe'),{key:'c',vndbId:'v1',originalFor:'game-1'},{hidden:1});
 insert(db,'game-4','Loose',write('D/d.exe'),{});
 insert(db,'game-5','Loose',write('E/d.exe'),{});
 db.close();db=open();
 assert.equal(active(db).length,5);
});
