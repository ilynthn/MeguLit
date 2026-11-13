'use strict';
// 2026-11-13 bug sweep: listener leaks, stale paints and exit hang guards.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('daily page keeps one online-recovery listener and never paints after the route changed',()=>{
 const s=read('web/daily-view.js');
 assert.match(s,/if\(onlineBack\)window\.removeEventListener\('online',onlineBack\)/);
 assert.match(s,/setTimeout\(\(\)=>\{if\(isCurrent\(\)\)paint\(\);\},160\)/);
});

test('Anki HUD drops its document listeners as soon as its page is gone',()=>{
 const s=read('web/anki-review.js');
 assert.match(s,/const keydown=event=>\{if\(!isCurrent\(\)\)\{stop\(\);return;\}/);
 assert.match(s,/const messages=event=>\{if\(!isCurrent\(\)\)\{stop\(\);return;\}/);
 assert.match(s,/stopMessages=stop;/);
});

test('pending lookup tolerates a re-rendered page; Japanese import errors fall back to English',()=>{
 assert.match(read('web/app.js'),/if\(form\?\.isConnected\)/);
 assert.match(read('web/game-language.js'),/locale==='ja'\?sourceWords\.en:sourceWords\.zh/);
});

test('broker shutdown waits for the lock with a deadline and refuses new requests while closing',()=>{
 const s=read('desktop/src/broker.rs');
 assert.match(s,/broker\.process\.try_lock\(\)/);
 assert.match(s,/if CLOSING\.load\(Ordering::SeqCst\)\{return Err\("SERVICE_CLOSING"/);
 assert.doesNotMatch(s,/if let Ok\(mut slot\)=broker\.process\.lock\(\)/);
});

test('font-follow migration: an unreadable (locked) preferences file throws so the one-time flag waits; missing or broken JSON is skipped',()=>{
 const os=require('node:os'),M=require('../services/font-follow-migration.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ffm-'));
 assert.deepEqual(M.migrateFiles(dir),{global:false,profiles:0});
 fs.writeFileSync(path.join(dir,'gal-preferences.json'),'{broken');assert.equal(M.migrateFiles(dir).global,false);
 fs.rmSync(path.join(dir,'gal-preferences.json'));fs.mkdirSync(path.join(dir,'gal-preferences.json'));
 assert.throws(()=>M.migrateFiles(dir));
 fs.rmSync(dir,{recursive:true,force:true});
});

test('first-line speaker strip trims leading whitespace, not the letter s',()=>{
 const s=read('services/original-text.cjs');
 assert.match(s,/o\.replace\(\/\^\[\\s　\]\*\/,''\)/);assert.doesNotMatch(s,/o\.replace\(\/\^s\*\//);
});
