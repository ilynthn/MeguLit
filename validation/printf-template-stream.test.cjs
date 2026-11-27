// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 (player report, たいせつなきみのために、ぼくにできるいちばんのこと（只要你不再悲伤）): with 隐藏原文 on, the translation kept
   switching between the player's colour and the game's own; with 全自动 on, the original was not fully hidden. Live run of the game
   (unknown engine, Dandelion 2011, DirectDraw + GDI TextOutA): the auto-selected stream was user32 wvsprintfA, the game's debug
   formatting, whose hook hands over printf templates ("%s%s%s%s%s%snone%s%s"). The reader showed the template as the Japanese line
   and its translation, and after three of them the no-Japanese guard switched hiding off ("selected stream has no Japanese: the game
   keeps its own text", render mode custom -> read) until the next real line switched it on again: the original came back on every
   few lines, and while it was back the per-line colour sampling took the game's colour for the translation.
   A printf template is never a line on screen: it is dropped before it is counted or shown. Lines from the live log are the fixtures. */
const test = require('node:test'), assert = require('node:assert/strict');
const { HookNative } = require('../core/hook-native.cjs');

/* hook-diagnostics 2026-11-27T04:43-04:53Z, stream wvsprintfA HS8@0:user32.dll:wvsprintfA */
const TEMPLATES = ['%s%s%s%s%s%snone%s%s', '%s%snone%s%s', '%s%s%s', '%s%s%s%s%s%s%s%sCSoundProcess::【♪】%s%snone%s%s%snone%s%s',
  '  ｜｜├ ReadScript [%s]%s%s%s%s%s%s【Read】%s 読込現在読み込み中のファイル[%s]行番号[%d]'];
/* the game's real lines around them (TextOutA, same run), and ordinary text with a percent sign (one conversion at most) */
const LINES = ['世界は、朱に包まれていた。', 'それは、『この世』のものとは思えない風景だった。'];
const PERCENT = ['全品50%OFFだって！', '「100%の確率で、%sって書いてあるよ」', '勝率は80%くらい。', '「ＨＰが０％になった」'];

function bound(t) {
  const ev = [], traces = []; let now = 100000;
  const hook = new HookNative({ native: __dirname, hook: __dirname, logs: 'Z:/no-fixture-log' }, e => ev.push(e), () => {}, () => now);
  hook.trace = m => traces.push(m); hook.enabled = true; hook.pid = 4242; /* bound to the game */ t.after(() => hook.stop());
  const line = (text, sourceName = 'wvsprintfA', sourceCode = 'HS8@0:user32.dll:wvsprintfA') => { hook.source({ text, sourceName, sourceCode, origin: 'live' }, ''); now += 4000; };
  return { hook, ev, traces, line, shown: () => ev.filter(e => typeof e.hookSource === 'string').map(e => e.hookSource.trim()) };
}

test('templates from the selected stream never reach the reader and never switch hiding off', t => {
  const { traces, line, shown } = bound(t);
  /* the order seen live: templates between the game's lines, three and more in a row */
  line(LINES[0]); for (const x of TEMPLATES.slice(0, 4)) line(x); line(LINES[1]); for (const x of TEMPLATES) line(x);
  for (const x of PERCENT) line(x);
  assert.equal(traces.some(m => /selected stream has no Japanese/.test(m)), false, 'hiding stays on: templates are not lines without Japanese');
  assert.deepEqual(shown().filter(s => /%s%s|%s.*%[sd]/.test(s)), [], 'the reader never shows a template as the line or translates it');
  for (const x of [...LINES, ...PERCENT]) assert.ok(shown().includes(x), 'still delivered: ' + x);
});

test('a stream whose real lines carry no Japanese still lets the game keep its own text (the guard itself is unchanged)', t => {
  const { hook, traces, line } = bound(t);
  for (const text of ['他说今天要下雨了，我们还是早点回家吧。', '这里的风景真美啊，就像画一样。', '我们明天再来这里看看好不好？']) line(text, 'TextOutA', 'HS10@0:gdi32.dll:TextOutA');
  assert.equal(hook.noJapaneseSource, true);
  assert.equal(traces.some(m => /selected stream has no Japanese/.test(m)), true);
});
