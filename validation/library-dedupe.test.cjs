// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14: いろとりどりのヒカリ showed as two identical cards. Fixtures rebuild the real shape: one work installed
   twice in different folders (2012 Chinese-patched copy + 2022 HD), both active, same VNDB id. Different installs of
   one work go into one automatic 合集 with edition notes; rows of the very same install merge into one. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('../services/store.cjs'),{reconcile}=require('../services/library.cjs'),dedupe=require('../services/library-dedupe.cjs');
const series=require('../services/series.cjs');
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
const editions=db=>Object.fromEntries(db.prepare('SELECT game_id,edition FROM series_memberships').all().map(m=>[m.game_id,m.edition]));

test('two installs of one work (2012 Chinese copy + 2022 HD) become one 合集 noting each edition',t=>{
 const {root,write,open}=fixture(t);
 const old=write('[120831][FAVORITE] いろとりどりのヒカリ/五彩斑斓的曙光/五彩斑斓的曙光.exe','old'),hd=write('[220930][FAVORITE] いろとりどりのヒカリHD/いろとりどりのヒカリHD/irohika_HD.exe','hd');
 let db=open();
 insert(db,'game-old','いろとりどりのヒカリ',old,{key:'aaa',vndbId:'v10028',engine:'FVP',developer:'FAVORITE'});
 insert(db,'game-hd','いろとりどりのヒカリ',hd,{key:'bbb',vndbId:'v10028',engine:'FVP'});
 db.prepare('INSERT INTO reading_sessions(game_id,started_at,active_seconds) VALUES(?,?,?)').run('game-old',100,600);
 db.close();
 db=open();
 assert.equal(active(db).length,2,'both installs stay playable');
 const state=series.snapshot(db,root);
 assert.equal(state.series.length,1);
 assert.equal(state.series[0].name,'いろとりどりのヒカリ');assert.equal(state.series[0].developer,'FAVORITE');assert.equal(state.series[0].count,2);
 assert.deepEqual(editions(db),{'game-old':'中文版 · 2012','game-hd':'HD版 · 2022'});
 assert.equal(db.prepare('SELECT SUM(active_seconds) s FROM reading_sessions WHERE game_id=?').get('game-old').s,600,'reading rows untouched');
 db.close();
 /* rescans and later opens never add a second 合集 or a third card */
 reconcile(root,[{key:'aaa',source:'folder',title:'いろとりどりのヒカリ',dir:path.dirname(old),exe:old,engine:'FVP',vndbId:'v10028',variants:[]},
  {key:'bbb',source:'folder',title:'いろとりどりのヒカリ',dir:path.dirname(hd),exe:hd,engine:'FVP',vndbId:'v10028',variants:[]}],{restoreRemoved:true});
 db=open();
 assert.equal(active(db).length,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM series').get().n,1);
 assert.deepEqual(dedupe.dedupe(db,root),{merged:[],collections:[]},'idempotent');
});

test('a third install joins the same 合集; Steam, version and duplicate notes stay apart',t=>{
 const {root,write,open}=fixture(t);
 let db=open();
 insert(db,'game-a','月姬 v1.6',write('[001229][TYPE-MOON] 月姬 v1.6/月姬 v1.6/Tsukihime.exe'),{key:'a',vndbId:'v7'});
 insert(db,'game-b','月姬',write('月姬 v1.4/Tsukihime.exe'),{key:'b',vndbId:'v7'});
 db.close();db=open();
 assert.equal(db.prepare('SELECT name FROM series').get().name,'月姬');
 assert.deepEqual(editions(db),{'game-a':'v1.6 · 2000','game-b':'v1.4'});
 insert(db,'game-c','Tsukihime',write('steamapps/common/Tsukihime/Tsukihime.exe'),{key:'c',vndbId:'V7',source:'steam'});
 db.close();db=open();
 assert.equal(db.prepare('SELECT COUNT(*) n FROM series').get().n,1);
 assert.equal(editions(db)['game-c'],'Steam版');
});

test('a dissolved 合集 or a card the user took out is not grouped again; autoSeries off is respected',t=>{
 const {root,write,open}=fixture(t);
 let db=open();
 insert(db,'game-1','Novel',write('A/n.exe'),{key:'1',vndbId:'v5'});
 insert(db,'game-2','Novel',write('B/n.exe'),{key:'2',vndbId:'v5'});
 db.close();db=open();
 const id=db.prepare('SELECT id FROM series').get().id;
 series.handle(db,root,{action:'series_dissolve',id});
 db.close();db=open();
 assert.equal(db.prepare('SELECT COUNT(*) n FROM series').get().n,0);
 fs.mkdirSync(path.join(root,'data/config'),{recursive:true});fs.writeFileSync(path.join(root,'data/config/library.json'),JSON.stringify({autoSeries:false}));
 insert(db,'game-3','Other',write('C/o.exe'),{key:'3',vndbId:'v6'});
 insert(db,'game-4','Other',write('D/o.exe'),{key:'4',vndbId:'v6'});
 db.close();db=open();
 assert.equal(db.prepare('SELECT COUNT(*) n FROM series').get().n,0);
});

test('rows of the very same install merge into the used row: records, legacy id, last launch, custom cover',t=>{
 const {root,write,open}=fixture(t);
 const exe=write('Same/Game.exe');
 let db=open();
 insert(db,'game-a','Same',exe,{key:'same',vndbId:'v9'},{launched:50,cover:'mine.png',original:{coverCustom:true}});
 db.prepare('INSERT INTO games(id,legacy_id,title,executable,original) VALUES(?,?,?,?,?)').run('game-b',9,'Same',exe,JSON.stringify({library:{key:'same',dir:path.dirname(exe),vndbId:'v9'}}));
 db.prepare('INSERT INTO reading_sessions(game_id,started_at,active_seconds) VALUES(?,?,?)').run('game-b',1,30);
 db.close();db=open();
 const rows=active(db);
 assert.equal(rows.length,1);assert.equal(rows[0].id,'game-b');
 assert.equal(rows[0].legacy_id,9);assert.equal(rows[0].last_launched_at,50);assert.equal(rows[0].cover,'mine.png');
 assert.equal(JSON.parse(db.prepare('SELECT original FROM games WHERE id=?').get('game-a').original).mergedInto,'game-b');
 assert(fs.readdirSync(path.join(root,'data','backups')).some(f=>/^megulit-before-dedupe-/.test(f)),'backup written before the merge');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM series').get().n,0,'one install is no 合集');
});

test('different works, Japanese-import sources, hidden cards and rows without identity are left alone',t=>{
 const {write,open}=fixture(t);
 let db=open();
 insert(db,'game-1','A',write('A/a.exe'),{key:'a',vndbId:'v1'});
 insert(db,'game-2','A fandisc',write('B/b.exe'),{key:'b',vndbId:'v2'});
 insert(db,'game-3','A',write('C/a.exe'),{key:'c',vndbId:'v1',originalFor:'game-1'},{hidden:1});
 insert(db,'game-4','A',write('E/a.exe'),{key:'e',vndbId:'v1'},{hidden:1});
 insert(db,'game-5','Loose',write('D/d.exe'),{});
 insert(db,'game-6','Loose',write('F/d.exe'),{});
 db.close();db=open();
 assert.equal(active(db).length,6);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM series').get().n,0);
});
