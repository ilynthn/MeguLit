// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #1128 (QQ essence 2026-11-24, 死に逝く君、館に芽吹く憎悪（濒死之君、馆中萌芽的憎恶） 汉化硬盘版: 「力なく笑って、美亜は近くの樹にもたれかかった。」 was shown
   with two translations under it, 「她无力地笑了笑，靠在了附近的一棵树上。」 and 「美亚无力地笑了笑，靠在了附近的一棵树上。」). The owner's
   reading history stored them as ONE machine translation, 「她…。\n\n美亚…。」: the LLM was sent the line as `current` and the same line
   again among its `previous` context lines, and translated both. A line reached its own context when something else was written into the
   shared sentence history between the reader's galSource for it and a later request for it (a guard retry, an earlier page line, the
   game's own drawn copy 「…もたれかった。」 sent for embedding, a doubled 「X　X」 frame), or when a detached request asked for a line the history
   already held. The context never carries the line being translated, in any of those forms; other earlier lines stay.
   The fake model below does what the real one did: a context line that is the current line gets its own translation in the answer. */
const test = require('node:test'), assert = require('node:assert/strict');
const { createTranslationService } = require('../core/providers.cjs');

const P = '「こんなのが現実だったら……世界が、無茶苦茶になっちゃうじゃない」';
const A = '力なく笑って、美亜は近くの樹にもたれかかった。';
const DRAWN = '力なく笑って、美亜は近くの樹にもたれかった。';
const flat = s => String(s || '').replace(/[\s　「」『』]/g, '');
const rendering = s => '译〈' + flat(s).slice(0, 6) + '〉';

function fixture() {
  const prompts = [];
  const service = createTranslationService(async (url, request) => {
    const user = JSON.parse(request.body).messages.at(-1).content;
    let current = user, previous = [];
    try { const j = JSON.parse(user); current = j.current; previous = j.previous || []; } catch {}
    prompts.push({ current, previous: previous.map(p => p.source) });
    /* like the real model: a context line that is (a form of) the current line is translated too */
    const again = previous.filter(p => { const a = flat(p.source), b = flat(current); return a.includes(b.slice(0, 8)) || b.includes(a.slice(0, 8)); });
    const content = [...again.map(p => p.translation || rendering(p.source).replace('译', '另')), rendering(current)].join('\n\n');
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  }, 'fixture-key');
  const o = { provider: 'gpt', contextEnabled: true, contextLines: 8 };
  return { service, prompts, o };
}
const lastPrompt = prompts => prompts.at(-1);

test('#1128: a guard retry after another request does not put the line into its own context', async () => {
  const { service, prompts, o } = fixture();
  service.observeSource(P); await service.translate(P, o);
  service.observeSource(A); /* the reader shows A (galSource) */
  await service.translate(A, o); /* the first request */
  await service.translate(P, o); /* the page's earlier line asked again (page guard / late fill) */
  const shown = await service.translate(A, o); /* the guard retry for the visible line */
  assert.equal(shown, rendering(A), 'one translation for the line, got ' + JSON.stringify(shown));
  assert.ok(!lastPrompt(prompts).previous.some(s => flat(s) === flat(A)), 'the line is not its own context: ' + JSON.stringify(lastPrompt(prompts).previous));
  assert.ok(lastPrompt(prompts).previous.includes(P), 'the line before it stays the context');
});

test('#1128: the game\'s own drawn copy of the line (one character apart) is not its context', async () => {
  const { service, prompts, o } = fixture();
  service.observeSource(P); await service.translate(P, o);
  await service.translate(DRAWN, o); /* the hook's embed request carries the text as the game drew it */
  service.observeSource(A);
  const shown = await service.translate(A, o);
  assert.equal(shown, rendering(A), JSON.stringify(shown));
  assert.deepEqual(lastPrompt(prompts).previous, [P]);
});

test('#1128: a doubled frame 「X　X」 of the line is not its context', async () => {
  const { service, prompts, o } = fixture();
  service.observeSource(P); await service.translate(P, o);
  service.observeSource(DRAWN + '　' + DRAWN + '　');
  service.observeSource(A);
  const shown = await service.translate(A, o);
  assert.equal(shown, rendering(A), JSON.stringify(shown));
  assert.deepEqual(lastPrompt(prompts).previous, [P]);
});

test('#1128: a detached request for a line the history holds does not send it as its own context', async () => {
  const { service, prompts, o } = fixture();
  for (const line of [P, A, '一度立ち止まってしまうと、それ以上動くことができない。']) { service.observeSource(line); await service.translate(line, o); }
  const shown = await service.translate(A, { ...o, detached: true }); /* the log fills a line it still has without translation */
  assert.equal(shown, rendering(A), JSON.stringify(shown));
  const prev = lastPrompt(prompts).previous;
  assert.ok(!prev.some(s => flat(s) === flat(A)), JSON.stringify(prev));
  assert.ok(prev.includes(P) && prev.includes('一度立ち止まってしまうと、それ以上動くことができない。'), 'the other recent lines stay: ' + JSON.stringify(prev));
});

test('#1128 control: different earlier lines, even similar ones, stay the context (worked before)', async () => {
  const { service, prompts, o } = fixture();
  const lines = ['「はい」', '「いいえ」', '美亜は近くの樹にもたれかかった。', '美亜は近くの樹から離れた。'];
  for (const line of lines) { service.observeSource(line); await service.translate(line, o); }
  const next = '力なく笑って、美亜は歩き出した。';
  service.observeSource(next); await service.translate(next, o);
  assert.deepEqual(lastPrompt(prompts).previous, lines);
  /* a line the script really says twice in a row is one entry, as before */
  const again = fixture();
  for (const line of ['「はい」', '「はい」']) { again.service.observeSource(line); await again.service.translate(line, again.o); }
  assert.deepEqual(lastPrompt(again.prompts).previous, []);
});
