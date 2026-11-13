// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// 2026-11-13 card wall (卡面墙): entry, API contract, the library wall's motion rules, frame-cost rules and the spring.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const web = name => fs.readFileSync(path.join(__dirname, '..', 'web', name), 'utf8');
const js = web('card-wall.js');
const css = web('card-wall.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('entry sits in the library capsule, the top bar is untouched, the sheet is loaded', () => {
  const app = web('app.js');
  assert.match(app, /right\.append\(cardWallButton,/);
  assert.match(app, /import\('\.\/card-wall\.js'\)\.then\(m=>m\.openCardWall\(main\)\)/);
  assert.match(web('index.html'), /<link rel="stylesheet" href="card-wall\.css">/);
});

test('uses the spec actions and listens for the card maker', () => {
  for (const action of ['cards_state', 'cards_insert', 'cards_eject', 'cards_add_toploaders', 'cards_set_mode'])
    assert.ok(js.includes(`'${action}'`), action);
  assert.match(js, /addEventListener\('megulit:cards-changed'/);
  assert.match(js, /import\('\.\/card-maker\.js'\)/);
  assert.match(js, /openCardMaker\(\{toploaderId:id\}\)/);
  assert.match(js, /words\(\)\.loading/);
});

test('the wall moves like the library wall: same coast, same zoom chase, no snap on release', () => {
  const frame = js.slice(js.indexOf('function frame(now)'), js.indexOf('const queue=()=>'));
  assert.match(frame, /decay=Math\.exp\(-dt\/105\)/);
  assert.match(frame, /1-Math\.exp\(-dt\/85\)/);
  assert.doesNotMatch(frame, /Math\.round\(/);
  assert.match(js, /document\.createElement\('mg-cell'\)/);
  assert.match(js, /fxPref\('wallBlur'\)/);
});

test('frame rules: no :has(), nothing keyed on the moving or dragging state, no filter animation', () => {
  assert.doesNotMatch(css, /:has\(/);
  assert.doesNotMatch(css, /cw-moving/);
  assert.doesNotMatch(css.replace(/\.cw-page\.cw-dragging \.cw-field\{cursor:grabbing\}/, ''), /cw-dragging/);
  assert.doesNotMatch(css, /transition:[^;}]*\b(all|width|height|top|left|filter)\b/);
  assert.doesNotMatch(js, /style\.filter\s*=/);
  /* no mask on the shell: one mask layer per toploader made Layerize cost 4 ms a frame */
  assert.doesNotMatch(css, /(^|[;{\s])(-webkit-)?mask:/);
});

test('reduced motion is honoured', () => {
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
});

test('still framing keeps the picture covering the card', () => {
  const src = js.slice(js.indexOf('const clamp='), js.indexOf('function hash('));
  const stillTransform = new Function(src + ';return stillTransform;')();
  for (const scale of [1, 1.2, 2]) for (const x of [0, .5, 1]) {
    const m = stillTransform({ x, y: x, scale }).match(/scale\(([\d.]+)\) translate\((-?[\d.]+)%,(-?[\d.]+)%\)/);
    const s = +m[1], limit = (s - 1) / (2 * s) * 100 + 1e-6;
    assert.ok(Math.abs(+m[2]) <= limit && Math.abs(+m[3]) <= limit, `x=${x} scale=${scale}`);
  }
});

test('spring: settles on target, a friction coast (k=0) never springs back, retargeting keeps velocity', () => {
  const src = js.slice(js.indexOf('const live=new Set()'), js.indexOf('/* ---------- a card'));
  const make = new Function('requestAnimationFrame', 'reduce', src + ';return Spring;');
  const Spring = make(() => 1, () => false);
  const s = new Spring({ a: 0 }, () => {});
  s.to({ a: 100 }, { k: 170, c: 26 });
  let t = 0; for (let i = 0; i < 200; i++) s.tick(t += 16.7);
  assert.strictEqual(s.x.a, 100);
  const c = new Spring({ r: 0 }, () => {});
  c.to({ r: 900 / 4.2 }, { k: 0, c: 4.2, v: { r: 900 } });
  let prev = 0; t = 0;
  for (let i = 0; i < 300; i++) { c.tick(t += 16.7); assert.ok(c.x.r >= prev - 1e-9); prev = c.x.r; }
  const r = new Spring({ y: 0 }, () => {});
  r.to({ y: 100 }, { k: 170, c: 26 }); t = 0; for (let i = 0; i < 8; i++) r.tick(t += 16.7);
  const v = r.v.y; r.to({ y: -50 }, { k: 170, c: 26 });
  assert.strictEqual(r.v.y, v);
});

test('inspect: free turn on drag with inertia, wheel zoom, both the sleeve and the bare card', () => {
  assert.match(js, /const turnTarget=\(\)=>loose\?ghost\.flip:ghost\.tilt/);
  assert.match(js, /turn\.to\(\{rx:turn\.x\.rx\+vx\/c,ry:turn\.x\.ry\+vy\/c\},\{k:0,c,v:\{rx:vx,ry:vy\}\}\)/);
  assert.match(js, /stage\.addEventListener\('wheel'/);
  assert.match(css, /\.cw-back\{transform:rotateY\(180deg\)\}/);
  assert.match(css, /backface-visibility:hidden/);
  assert.match(css, /\.cw-pane\{/);
});

test('on the wall the card rests on its still; the CG moves only under the pointer', () => {
  assert.match(js, /if\(parts\.live\)kenBurns\(parts\.img,card,0\);else\{/);
  assert.match(js, /function liveCG\(tilt,on\)/);
});
