// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 card wall: the inspect eject goes the direct way (the card stays put, the sleeve is drawn down off it), a
   second click turns it round from where it is, and scuffs are random per toploader with many sleeves clean.
   The page's own spring and motion code runs here on a manual frame clock with plain objects for the DOM parts. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const js = fs.readFileSync(path.join(__dirname, '..', 'web', 'card-wall.js'), 'utf8');
const cut = (from, to) => { const a = js.indexOf(from), b = js.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return js.slice(a, b); };
const src = [
  cut('const live=new Set()', '/* ---------- a card'),
  'const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));',
  'function hash(s){let h=2166136261;for(const ch of String(s))h=Math.imul(h^ch.codePointAt(0),16777619);return h>>>0;}',
  cut('const TL_W=', 'function buildToploader'),
  cut('function motion(parts){', '/* ---------- the motions'),
  cut('const ticket=', 'async function insertMotion'),
  cut('const FREE_AT=', '/* ---------- inspect (user correction'),
  cut('const SCUFFS=', 'function scuffOf('),
].join('\n');

function rig() {
  let frames = [];
  const raf = cb => { frames.push(cb); return frames.length; };
  const make = new Function('requestAnimationFrame', 'reduce', src + ';return {motion,sleeveY,inMouth,binProgress,coastEnd,FREE_AT,CARD_H,CARD_TOP,scuffPicks,live};');
  const api = make(raf, () => false);
  const style = () => ({ setProperty() {} });
  const el = () => ({ style: style(), classList: { add() {}, remove() {} } });
  const parts = { el: el(), card: el(), shell: el(), sweep: el(), hang: el(), lift: el(), drop: el(), thick: el() };
  api.motion(parts).jump({ co: 1, so: 1 });
  let now = 0;
  const step = n => { for (let i = 0; i < n; i++) { const f = frames; frames = []; now += 16.7; for (const cb of f) cb(now); } };
  return { api, parts, step };
}

test('pull: the plastic holds the first 14 px, then 1:1; pushing in gives only a hair', () => {
  const { api } = rig();
  assert.equal(api.sleeveY(0), 0);
  assert.ok(Math.abs(api.sleeveY(-10) - -4) < 1e-9, 'held: 40 % of the first pull');
  assert.ok(Math.abs(api.sleeveY(-100) - -91.6) < 1e-9, 'then 1:1 with the grip left behind');
  assert.ok(api.sleeveY(50) > 0 && api.sleeveY(50) < 3, 'pushing in: under 3 px');
  let prev = 1; for (let r = 0; r > -300; r -= 3) { const y = api.sleeveY(r); assert.ok(y <= prev + 1e-9, 'monotonic'); prev = y; }
});

test('the card is free once its bottom edge clears the mouth, and goes back in only over the mouth', () => {
  const { api } = rig();
  assert.equal(api.FREE_AT, -(api.CARD_H + api.CARD_TOP));
  assert.ok(api.inMouth(0, api.FREE_AT + 10));
  assert.ok(api.inMouth(30, api.FREE_AT - 40));
  assert.ok(!api.inMouth(80, api.FREE_AT), 'off to the side');
  assert.ok(!api.inMouth(0, api.FREE_AT - 200), 'far above');
});

test('bin: the ring closes as the card nears a window edge; only a closed ring discards', () => {
  const { api } = rig();
  assert.equal(api.binProgress(400), 0);
  assert.equal(api.binProgress(150), 0);
  assert.ok(api.binProgress(92) > .45 && api.binProgress(92) < .55);
  assert.equal(api.binProgress(34), 1);
  assert.equal(api.binProgress(0), 1);
  let prev = -1; for (let d = 300; d >= 0; d -= 5) { const p = api.binProgress(d); assert.ok(p >= prev); prev = p; }
});

test('a thrown card coasts to where friction stops it (no spring back)', () => {
  const { api } = rig();
  assert.equal(api.coastEnd(10, 550, 5.5), 110);
  const s = api.motion(rig().parts);
  void s;
});

test('scuffs: random per toploader, stable, many clean, never more than two', () => {
  const { api } = rig();
  const counts = [0, 0, 0];
  for (let i = 0; i < 400; i++) {
    const a = api.scuffPicks('t' + i), b = api.scuffPicks('t' + i);
    assert.deepEqual(a, b);
    assert.ok(a.picks.length <= 2);
    assert.equal(new Set(a.picks).size, a.picks.length);
    counts[a.picks.length]++;
  }
  assert.ok(counts[0] > 100 && counts[0] < 220, 'about four in ten are clean: ' + counts);
  assert.ok(counts[1] > 0 && counts[2] > 0, 'some have one or two: ' + counts);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'web', 'card-wall.css'), 'utf8'), /\.cw-shell\{[^}]*stroke-opacity/);
});

test('viewer: no buttons for the card; drag pulls, pushes, throws; edge drag asks before discarding; loose closes into 我的卡', () => {
  const v = cut('function openViewer(cell){', '/* test hooks');
  assert.doesNotMatch(v, /cw-eject|cw-delete|pullBack/);
  assert.ok(v.includes("if(e.target.closest('.cw-ghost .cw-card')){turn.stop();startDrag(e);return;}"));
  assert.ok(v.includes("const rel=sleeveY(Math.min(cy,40)*(1+PULL_K));cy=rel/(1+PULL_K);sh=cy-rel;"));
  assert.ok(v.includes("if(Math.abs(cx)<=RIM_PASS){drag.mode='push'"), "on the axis the card goes onto the rail");
  assert.ok(v.includes("else{cy=sh+FREE_AT+rubber(rel-FREE_AT,4);"), "off the axis it rests on the rim");
  assert.ok(v.includes("gs.wall('cy',over?gs.x.sh+FREE_AT:null,.38);"), "a thrown card bounces off the rim");
  assert.ok(v.includes("const park=()=>"), "the sleeve parks with its mouth at the bottom");
  assert.ok(v.includes("if(rel<FREE_AT){drag.mode='free';drag.pulled=true;free();"));
  assert.ok(v.includes("if(armed){askDiscard();return;}"));
  assert.ok(v.includes("const discard=async()=>"));
  assert.ok(v.includes("call('cards_delete',{cardId:card.id})"));
  assert.ok(v.includes("out=state==='free',into=out?pocket:home;"));
  assert.match(v, /role="alertdialog"/);
});
