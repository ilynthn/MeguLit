'use strict';
/* #1128 (two different translations of one sentence on screen): a later, better answer must replace the compositor's copy as well as the
   overlay row, so only one translation per sentence is ever shown. */
const test = require('node:test'), assert = require('node:assert/strict');
const { Reader } = require('../services/reader.cjs');
const make = () => { const r = Object.create(Reader.prototype), calls = [], emitted = [];
  Object.assign(r, { active: () => true, prefs: () => ({ provider: 'google' }), langOptions: o => o, embedCached() {}, stats: { translation() {} }, emit: (n, e) => emitted.push(e),
    gal: { compositor: { text: (s, t) => calls.push([s, t]) } } });
  return { r, calls, emitted }; };
test('a late fill also replaces the compositor line', () => {
  const { r, calls, emitted } = make(); r.fillTranslation('力なく笑って', { text: '她无力地笑了笑', source: 'mt' }, {});
  assert.deepEqual(calls, [['力なく笑って', '她无力地笑了笑']]); assert.equal(emitted.filter(e => e.method === 'deliverBackfill').length, 1);
});
test('another target language never reaches the compositor', () => {
  const { r, calls } = make(); r.compositorText('a', 'b', 'en'); assert.deepEqual(calls, []);
});
