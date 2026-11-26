// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {openStore} = require('../services/store.cjs');
const {exportBackup, previewBackup, applyBackup} = require('../services/backup.cjs');
const scenes = require('../services/sentence-scenes.cjs');
const voice = require('../services/saved-line-voice.cjs');

function fixture(t) {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-backup-media-'));
 t.after(() => fs.rmSync(root, {recursive:true, force:true}));
 const db = openStore(root);
 db.prepare("INSERT INTO games(id,title) VALUES('one','Fixture')").run();
 db.close();
 return root;
}

test('full backup restores saved sentence pictures and captured voice with their database references', async t => {
 const root = fixture(t);
 const picture = Buffer.from('fixture-picture');
 const hash = 'a5a5a5a5a5a5a5a5';
 let db = openStore(root);
 const sentence = require('../services/saved-sentences.cjs').save(db, {gameId:'one', text:'Fixture sentence'});
 db.close();
 const scene = await scenes.attach({root, gameId:'one', sentenceScene:{gameId:'one', jpeg:picture.toString('base64'), topHash:hash, at:1700000000000}, gal:{sceneProbe:async () => ({topHash:hash})}}, sentence.id);
 assert.ok(scene);
 const clip = Buffer.alloc(48);
 clip.write('RIFF'); clip.writeUInt32LE(40, 4); clip.write('WAVEfmt ', 8);
 clip.writeUInt32LE(16, 16); clip.writeUInt16LE(1, 20); clip.writeUInt16LE(1, 22);
 clip.writeUInt32LE(24000, 24); clip.writeUInt32LE(48000, 28); clip.writeUInt16LE(2, 32); clip.writeUInt16LE(16, 34);
 clip.write('data', 36); clip.writeUInt32LE(4, 40);
 const record = {kind:'file', file:sentence.id+'.wav', from:'capture'};
 fs.mkdirSync(path.join(root, 'data/saved-voice'), {recursive:true});
 fs.writeFileSync(path.join(root, 'data/saved-voice', record.file), clip);
 db = openStore(root);
 const original = JSON.parse(db.prepare('SELECT original FROM saved_sentences WHERE id=?').get(sentence.id).original);
 db.prepare('UPDATE saved_sentences SET original=? WHERE id=?').run(JSON.stringify({...original, voice:record}), sentence.id);
 db.close();
 assert.ok(voice.read(root, record));
 const file = path.join(root, 'media.megulitbak');
 await exportBackup(root, file);
 const preview = previewBackup(root, file);
 const result = applyBackup(root, preview.id);
 db = openStore(root);
 const restored = JSON.parse(db.prepare('SELECT original FROM saved_sentences WHERE id=?').get(sentence.id).original);
 db.close();
 assert.deepEqual(Buffer.from(scenes.read(root, 'one', restored.scene.file).data, 'base64'), picture);
 assert.deepEqual(voice.read(root, restored.voice).data, clip);
 assert.ok(fs.existsSync(path.join(result.rollback, 'saved-voice', record.file)));
});

test('backups without saved media remain restorable', async t => {
 const root = fixture(t), file = path.join(root, 'old.megulitbak');
 await exportBackup(root, file);
 applyBackup(root, previewBackup(root, file).id);
 const db = openStore(root);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM games').get().n, 1);
 db.close();
});

test('media allowlist still rejects traversal and unrelated data directories', async t => {
 const root = fixture(t), file = path.join(root, 'bad.megulitbak');
 await exportBackup(root, file);
 const document = JSON.parse(zlib.gunzipSync(fs.readFileSync(file).subarray(8)));
 const bytes = Buffer.from('fixture');
 const item = {base64:bytes.toString('base64'), sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 for (const name of ['data/sentence-scenes/../../escape.jpg', 'data/saved-voice/../escape.wav', 'data/unrelated/file']) {
  const changed = {...document, files:{...document.files, [name]:item}};
  fs.writeFileSync(file, Buffer.concat([Buffer.from('MEGUBAK1'), zlib.gzipSync(Buffer.from(JSON.stringify(changed)))]));
  assert.throws(() => previewBackup(root, file), /INVALID_BACKUP_FILE/);
 }
 assert.equal(fs.existsSync(path.join(root, 'escape.jpg')), false);
});

test('personal dictionaries survive export and restore with their names, switches and order (Codex #1280)', async t => {
 const U = require('../services/user-dictionaries.cjs');
 const root = fixture(t), src = path.join(root, 'src');
 fs.mkdirSync(src);
 fs.writeFileSync(path.join(src, 'a.tsv'), 'A\tB\tC\n');
 fs.writeFileSync(path.join(src, 'b.tsv'), 'A\tB\tD\n');
 U._reset();
 const a = await U.importDictionary(root, path.join(src, 'a.tsv'));
 const b = await U.importDictionary(root, path.join(src, 'b.tsv'));
 U.move(root, b.id, -1); U.setEnabled(root, a.id, false); U.rename(root, b.id, 'renamed');
 const before = U.list(root).map(({importedAt, ...d}) => d);
 const file = path.join(root, 'dict.megulitbak');
 await exportBackup(root, file);
 U.remove(root, a.id); U.remove(root, b.id);
 assert.equal(U.list(root).length, 0);
 applyBackup(root, previewBackup(root, file).id);
 U._reset();
 assert.deepEqual(U.list(root).map(({importedAt, ...d}) => d), before);
 assert.deepEqual(U.lookup(root, 'A').map(h => h.dictionary.name), ['renamed']);
 U._reset();
});
