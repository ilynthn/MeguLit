// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openStore } = require('../services/store.cjs');
const insights = require('../services/learning-insights.cjs');
const { Reader } = require('../services/reader.cjs');

function makeRoot(prefix) {
  return fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(), prefix));
}

test('kana-only JMdict entries fall back to readings[0] as spelling in saveWord, describe, mine and migration', async () => {
  const root = makeRoot('megulit-kana-spell-');
  try {
    const db = openStore(root);
    try {
      const kanaEntry = {
        id: 1017590,
        spellings: [],
        readings: ['アニメ'],
        definitions: ['动画'],
      };
      const kanjiEntry = {
        id: 1358280,
        spellings: ['食べる'],
        readings: ['たべる'],
        definitions: ['吃'],
      };

      const saved = insights.saveWord(db, kanaEntry, null);
      assert.equal(saved.spelling, 'アニメ', 'saveWord return value must fall back to readings[0]');
      assert.equal(saved.reading, 'アニメ');
      const row = db.prepare('SELECT spelling, reading FROM vocabulary WHERE id=?').get(kanaEntry.id);
      assert.equal(row.spelling, 'アニメ', 'vocabulary.spelling must not be stored empty for kana-only words');
      assert.equal(row.reading, 'アニメ');

      const savedKanji = insights.saveWord(db, kanjiEntry, null);
      assert.equal(savedKanji.spelling, '食べる');
      assert.equal(db.prepare('SELECT spelling FROM vocabulary WHERE id=?').get(kanjiEntry.id).spelling, '食べる');

      await insights.describe(
        db,
        [{ key: 'アニメ', base: 'アニメ' }],
        async () => kanaEntry,
      );
      const info = db.prepare('SELECT spelling, reading FROM word_info WHERE key=?').get('アニメ');
      assert.equal(info.spelling, 'アニメ', 'word_info.spelling must fall back to readings[0]');
      assert.equal(info.reading, 'アニメ');
    } finally {
      db.close();
    }

    const mineRoot = makeRoot('megulit-kana-mine-');
    try {
      const reader = new Reader({ root: mineRoot, emit() {}, config() { return {}; } });
      const kanaEntry = {
        id: 1049190,
        spellings: [],
        readings: ['ゲーム'],
        definitions: ['游戏'],
      };
      await reader.mine({ entry: kanaEntry, args: {}, noteId: 9001 });
      const db2 = openStore(mineRoot);
      try {
        const row = db2.prepare('SELECT spelling, reading FROM vocabulary WHERE id=?').get(kanaEntry.id);
        assert.equal(row.spelling, 'ゲーム', 'Reader.mine must store readings[0] as spelling for kana-only entries');
        assert.equal(row.reading, 'ゲーム');
      } finally {
        db2.close();
      }
    } finally {
      fs.rmSync(mineRoot, { recursive: true, force: true });
    }

    const migRoot = makeRoot('megulit-kana-mig-');
    try {
      const db3 = openStore(migRoot);
      try {
        // Simulate an older DB before the one-time backfill migration ran.
        db3.prepare("DELETE FROM meta WHERE key='kana-word-spelling-backfill-v1'").run();
        db3.prepare('INSERT INTO vocabulary(id,spelling,reading,definitions,status,created_at,original) VALUES(?,?,?,?,0,?,?)')
          .run(1017590, '', 'アニメ', '["动画"]', 1700000000, '{}');
        db3.prepare('INSERT INTO vocabulary(id,spelling,reading,definitions,status,created_at,original) VALUES(?,?,?,?,0,?,?)')
          .run(1358280, '食べる', 'たべる', '["吃"]', 1700000000, '{}');
      } finally {
        db3.close();
      }
      const reopened = openStore(migRoot);
      try {
        assert.equal(reopened.prepare('SELECT spelling FROM vocabulary WHERE id=?').get(1017590).spelling, 'アニメ');
        assert.equal(reopened.prepare('SELECT spelling FROM vocabulary WHERE id=?').get(1358280).spelling, '食べる');
        assert.ok(reopened.prepare("SELECT value FROM meta WHERE key='kana-word-spelling-backfill-v1'").get());
      } finally {
        reopened.close();
      }
    } finally {
      fs.rmSync(migRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
