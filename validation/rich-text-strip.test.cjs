// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #1248 (2026-11-27, Unity game with TextMeshPro): the reader showed
   「今日は芹香の希望で<space=0.8767014>山中<space=0.8767014>にある、」. Rich-text markup never reaches the reader or the translator,
   on Unity setter streams, IL2CPP streams and any other engine's stream. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { replay } = require('./helpers/hook-replay.cjs');
const { stripRichText } = require('../core/rich-text.cjs');
const { cleanSource } = require('../core/hook-native.cjs');

const LINE = '今日は芹香の希望で<space=0.8767014>山中<space=0.8767014>にある、水着で男女一緒に入れる温泉に向かっている。';
const BARE = '今日は芹香の希望で山中にある、水着で男女一緒に入れる温泉に向かっている。';

function shown(rows, exe = 'Game.exe') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-rich-'));
  try {
    const file = path.join(dir, 'r.jsonl');
    fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n'));
    const out = [];
    for (const e of replay(file, { name: exe }).events) if (e && typeof e.hookSource === 'string' && e.hookSource && e.hookSource !== out[out.length - 1]) out.push(e.hookSource);
    return out;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const UNITY = 'HMF2@Unity.TextMeshPro:TMPro:TMP_Text:set_text:1:JIT:UNITY';

test('TMP tags are layout: <space>, <voffset>, <size>, <color>, <sprite>, <#hex>, <br>, <noparse>', () => {
  assert.equal(stripRichText(LINE), BARE);
  assert.equal(stripRichText('<color=#FF8080FF>芹香</color>「<b>え</b>っ」'), '芹香「えっ」');
  assert.equal(stripRichText('<voffset=0.3em>あ</voffset><size=120%>い</size><cspace=-0.1em>う</cspace>'), 'あいう');
  assert.equal(stripRichText('ハート<sprite=3>だよ<sprite name="heart" color=#ff0000>'), 'ハートだよ');
  assert.equal(stripRichText('<#ff0000>赤</color>い<gradient="Fire">炎</gradient><rotate=10>だ</rotate>'), '赤い炎だ');
  assert.equal(stripRichText('一行目<br>二行目<br/>三行目'), '一行目\n二行目\n三行目');
  assert.equal(stripRichText('<font="NotoSans SDF"><font-weight=700><mark=#ffff0080>強調</mark></font-weight></font>'), '強調');
  assert.equal(stripRichText('<noparse><b>そのまま</b></noparse><b>太字</b>'), '<b>そのまま</b>太字');
  assert.equal(stripRichText('<line-height=120%><align=center><pos=10%><indent=1em><nobr>中央</nobr>'), '中央');
});

test('text that only looks like markup stays', () => {
  for (const s of ['好き<3', 'a < b > c', '<<魔王>>', '＜注意＞', '<ここ>は場所', '<R漢字|かんじ>']) assert.equal(stripRichText(s), s);
});

test('TMP ruby in relative sizes is ruby, not text', () => {
  assert.equal(cleanSource('山中<space=-2em><voffset=1em><size=50%>やまなか</size></voffset><space=1em>にある', '', UNITY), '山中にある');
  assert.equal(cleanSource('<size=36>　一月<size=12>ひとつき</size>が経った</size>', '', UNITY), '　一月が経った', 'absolute sizes as before');
  assert.equal(cleanSource('あ<size=50%>小さい</size>声', '', UNITY), 'あ小さい声', 'small text after kana is text');
});

test('Unity TMP setter: the reader never shows <space=…>', () => {
  const out = shown([{ t: 1000, m: { type: 'hookSource', text: LINE, sourceName: 'TMP_Text:set_text', sourceCode: UNITY } }]);
  assert.deepEqual(out, [BARE]);
});

test('other engines: tags on a LunaHook stream are stripped as well', () => {
  const out = shown([
    { t: 1000, m: { type: 'hookSource', text: '<color=#ffffff>「<voffset=2>大丈夫</voffset>だよ」</color>', sourceName: 'Text', sourceCode: 'HQ-14@0:GameAssembly.dll' } },
    { t: 4000, m: { type: 'hookSource', text: '結構<space=0.5>進んで<size=80%>きちゃった</size>ね', sourceName: 'Text', sourceCode: 'HQ-14@0:GameAssembly.dll' } },
  ]);
  assert.deepEqual(out, ['「大丈夫だよ」', '結構進んできちゃったね']);
});

test('#148 still holds: ASCII text with angle brackets on a non-Unity stream stays; a Unity setter strips it', () => {
  for (const s of ['a<b>c', 'x<br>y', 'C3と<5>', '<html>']) assert.equal(cleanSource(s, '', 'HQ-14@0:GameAssembly.dll'), s);
  assert.equal(cleanSource('<b>OK</b>', '', UNITY), 'OK');
});

test('translator gets the bare line', async () => {
  const { createTranslationService } = require('../core/providers.cjs'), bodies = [];
  const service = createTranslationService(async (url, init) => { bodies.push(String(init?.body || '')); return { ok: true, json: async () => ({ choices: [{ message: { content: '译文' } }] }) }; });
  const r = await service.translate(LINE, { provider: 'gpt', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b', contextEnabled: false }, () => true);
  assert.equal(r, '译文');
  assert.equal(bodies.length, 1);
  assert.doesNotMatch(bodies[0], /space=/);
  assert.match(bodies[0], /山中にある、水着で/);
});

/* the repeat in the report: the line was shown whole, then the box sent its first comma piece again (tagged), and the next line
   was joined to that piece: 「今日は芹香の希望で<space=…>山中<space=…>にある、……だが、登山道を…」 */
const NEXT = '……だが、登山道を道なりに進んでも一向に見えてこない。';
const row = (t, text) => ({ t, m: { type: 'hookSource', text, sourceName: 'TMP_Text:set_text', sourceCode: UNITY } });
test('an earlier typewriter state of the shown line is no new line (no repeat, no join)', () => {
  const B = '今日は芹香の希望で<space=0.8767014>山中<space=0.8767014>にある、';
  assert.deepEqual(shown([row(1000, BARE), row(1600, B), row(2200, NEXT)]), [BARE, NEXT]);
  assert.deepEqual(shown([row(1000, BARE), row(1600, B), row(1700, B + '水着で男女'), row(2200, NEXT)]), [BARE, NEXT], 'typed again in steps');
});
test('a comma piece that is not the shown line is still read and joined with its rest', () => {
  assert.deepEqual(shown([row(1000, BARE), row(1600, 'どうせ引き裂かれるなら、'), row(2200, '身を引き裂かされる方がいい。')]),
    [BARE, 'どうせ引き裂かれるなら、', 'どうせ引き裂かれるなら、身を引き裂かされる方がいい。']);
});

test('a tagged name on a side stream is the bare name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-rich-'));
  try {
    const file = path.join(dir, 'r.jsonl');
    fs.writeFileSync(file, [
      { t: 1000, m: { type: 'hookAuxText', text: '<color=#8080FF>【<b>芹香</b>】</color>', sourceName: 'TMP_Text:set_text' } },
      { t: 1100, m: { type: 'hookSource', text: '「うぅぅうう……ごめんやらかしたわ」', sourceName: 'TMP_Text:set_text', sourceCode: UNITY } },
    ].map(r => JSON.stringify(r)).join('\n'));
    const speakers = replay(file, { name: 'Game.exe' }).events.filter(e => e && typeof e.hookSpeaker === 'string' && e.hookSpeaker).map(e => e.hookSpeaker);
    assert.ok(speakers.length > 0, 'a speaker was shown');
    for (const s of speakers) assert.equal(s, '芹香');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
