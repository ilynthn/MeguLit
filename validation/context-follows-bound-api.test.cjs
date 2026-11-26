'use strict';
/* #1117: context explanations used the DeepSeek preset even when the player had bound another API for translations (quota or key errors from an API
   the player never set up). They now use the bound API; a source picked on purpose with its own key still wins. */
const test = require('node:test'), assert = require('node:assert/strict');
const m = require('../core/lookup-models.cjs');
const bound = { provider: 'gpt', baseUrl: 'https://example.com/v1', model: 'my-model' };
const keysFor = urls => o => urls.includes(o.baseUrl);
test('no context source chosen: the bound translation API is used', () => {
  const o = m.contextOptions({}, bound, keysFor(['https://example.com/v1']));
  assert.equal(o.baseUrl, 'https://example.com/v1'); assert.equal(o.model, 'my-model');
});
test('the default DeepSeek source without a key gives way to the bound API', () => {
  const o = m.contextOptions({ contextProvider: 'deepseek' }, bound, keysFor(['https://example.com/v1']));
  assert.equal(o.baseUrl, 'https://example.com/v1');
});
test('a context source picked on purpose with its own key is kept', () => {
  const o = m.contextOptions({ contextProvider: 'deepseek' }, bound, keysFor(['https://example.com/v1', 'https://api.deepseek.com']));
  assert.equal(o.provider, 'deepseek');
});
test('follow uses the bound API, and the DeepSeek preset when the translation engine is not a model', () => {
  assert.equal(m.contextOptions({ contextProvider: 'follow' }, bound, keysFor(['https://example.com/v1'])).model, 'my-model');
  assert.equal(m.contextOptions({ contextProvider: 'follow' }, { provider: 'google' }, () => true).provider, 'deepseek');
});
test('no bound model: the old default stays', () => {
  assert.equal(m.contextOptions({}, { provider: 'google' }, () => false).provider, 'deepseek');
  assert.equal(m.contextOptions({}, bound, () => false).provider, 'deepseek');
});
