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
  const o = m.contextOptions({ contextProvider: 'deepseek', contextProviderPicked: true }, bound, keysFor(['https://example.com/v1', 'https://api.deepseek.com']));
  assert.equal(o.provider, 'deepseek');
  assert.equal(m.contextOptions({ contextProvider: 'gpt' }, bound, keysFor(['https://example.com/v1', 'https://api.openai.com/v1'])).baseUrl, 'https://api.openai.com/v1', 'a non-default source can only have been picked');
});
/* Codex #1176: the reader passes cleanPreferences() output, which always carries contextProvider 'deepseek'; with both keys and no pick the bound API is used */
test('the normalised preferences of a player who never picked a source follow the bound API even with a DeepSeek key', () => {
  const {cleanPreferences} = require('../core/preferences.cjs');
  const prefs = cleanPreferences({ provider: 'gpt', baseUrl: 'https://example.com/v1', model: 'my-model' });
  assert.equal(prefs.contextProvider, 'deepseek');
  const o = m.contextOptions(prefs, prefs, keysFor(['https://example.com/v1', 'https://api.deepseek.com']));
  assert.equal(o.baseUrl, 'https://example.com/v1');
  const picked = cleanPreferences({ ...prefs, contextProviderPicked: true });
  assert.equal(m.contextOptions(picked, picked, keysFor(['https://example.com/v1', 'https://api.deepseek.com'])).provider, 'deepseek');
});
test('Settings marks the context source as picked only when the player changes it', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-ctx-pick-'));
  try {
    const {Settings} = require('../services/settings.cjs'), s = new Settings(root), file = () => JSON.parse(fs.readFileSync(path.join(root, 'data', 'config', 'preferences.json'), 'utf8'));
    s.save({ scope: 'dictionary', values: { contextProvider: 'deepseek' } });
    assert.notEqual(file().contextProviderPicked, true, 'saving the default unchanged is not a pick');
    s.save({ scope: 'dictionary', values: { contextProvider: 'follow' } });
    assert.equal(file().contextProviderPicked, true);
    s.save({ scope: 'dictionary', values: { contextProvider: 'deepseek' } });
    assert.equal(file().contextProvider, 'deepseek'); assert.equal(file().contextProviderPicked, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('follow uses the bound API, and the DeepSeek preset when the translation engine is not a model', () => {
  assert.equal(m.contextOptions({ contextProvider: 'follow' }, bound, keysFor(['https://example.com/v1'])).model, 'my-model');
  assert.equal(m.contextOptions({ contextProvider: 'follow' }, { provider: 'google' }, () => true).provider, 'deepseek');
});
test('no bound model: the old default stays', () => {
  assert.equal(m.contextOptions({}, { provider: 'google' }, () => false).provider, 'deepseek');
  assert.equal(m.contextOptions({}, bound, () => false).provider, 'deepseek');
});
