'use strict';
/* 2026-11-26 (オルフレール, KiriKiri without KAG, Cardinal r2: row 0.4). The bridge skips the game's DrawText of the dialogue at the
   source (MeguLit_DRAWSKIP, drawSkipped on the selected stream), so the game draws no Japanese, but the glyph path still reported every
   line as 「has no hidden glyph yet (the game draws it itself)」: the reader put megulit-place-game-drawn on the page and drew only the
   Chinese. With a source skip on the selected stream the glyph line is the reader's to draw. */
const test = require('node:test'), assert = require('node:assert/strict');
const { OverlayPlacement } = require('../core/overlay-placement.cjs');
const { HookNative } = require('../core/hook-native.cjs');
const run = skipping => { const sent = [], traces = [], p = new OverlayPlacement({ send: m => sent.push(m), trace: t => traces.push(t), skipping: () => skipping });
  p.configure({ textRenderer: 'compositor', hookProfile: 'embed' }, { bound: true, gameProcessId: 28956, layout: { clientWidth: 1280, clientHeight: 720 } });
  p.glyph({ seq: 60, text: '応なく私の目の前に立ち塞がる。', dots: [] }); return { sent: sent.filter(m => m.type === 'textPlace'), traces }; };
test('source skip active: the glyph line goes to the reader (fallback), never as "the game draws it itself"', () => {
  const { sent, traces } = run(true);
  assert.equal(sent.length, 1); assert.equal(sent[0].fallback, true); assert.equal(sent[0].text, '応なく私の目の前に立ち塞がる。');
  assert.ok(!sent.some(m => m.visible === true));
  assert.ok(traces.some(t => /skips the game's own draw at the source/.test(t)));
  assert.ok(!traces.some(t => /the game draws it itself/.test(t)));
});
test('no source skip: unchanged, the game draws its own line (visible note)', () => {
  const { sent } = run(false);
  assert.equal(sent.length, 1); assert.equal(sent[0].visible, true);
});
test('HookNative.drawSkipping: only a selected stream with drawSkipped > 0, and only while hiding', () => {
  const h = Object.create(HookNative.prototype);
  h.enabled = true; h.preferences = { hookHide: true };
  h.state = { hookThreads: [{ id: '538f14:0:90', selected: true, embeddable: false, hideTrying: true, drawSkipped: 16505 }] };
  assert.equal(h.drawSkipping(), true, 'a read-only DrawText stream after the stream switch still has the source skip');
  h.state.hookThreads = [{ id: '52c3a7:0:1c', selected: true, embeddable: true, hideOnly: true, drawSkipped: 823 }];
  assert.equal(h.drawSkipping(), true);
  h.state.hookThreads = [{ id: 'a', selected: true, embeddable: true }, { id: 'b', selected: false, drawSkipped: 9 }];
  assert.equal(h.drawSkipping(), false, 'no skip on the selected stream (every KAG game)');
  h.state.hookThreads = [{ id: 'a', selected: true, drawSkipped: 9 }];
  h.preferences = { hookHide: false }; assert.equal(h.drawSkipping(), false, 'reading without hiding');
  h.preferences = { hookHide: true }; h.enabled = false; assert.equal(h.drawSkipping(), false);
});
