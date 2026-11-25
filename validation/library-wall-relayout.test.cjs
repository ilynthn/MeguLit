// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E426: switching the library from the simple list to the infinite wall drew only the top two rows until the next
// resize. The wall's row range mirrored the space above the search capsule, which is still gliding mid-switch.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const web = name => fs.readFileSync(path.join(__dirname, '..', 'web', name), 'utf8');
const grimoire = web('grimoire.js');
const motion = web('library-switch-motion.js');
const pick = re => { const m = grimoire.match(re); assert.ok(m, 'missing ' + re); return m[0]; };
const rowRange = new Function('filtered', 'rows', 'y', 'z', 'ch', 'cy', 'height',
  pick(/const firstRow=[^\n]*/) + '\n' + pick(/const lastRow=[^\n]*/) + '\nreturn [firstRow,lastRow];');

test('rows reach the bottom edge even when the capsule sits near the top', () => {
  const ch = 300, height = 1000, y = -150, z = 1;
  for (const cy of [40, 120, 500, 900]) {
    const [first, last] = rowRange(false, 4, y, z, ch, cy, height);
    assert.ok((last * ch - y) * z + ch / 2 >= height - cy, `cy=${cy}: last row ${last} stops short of the bottom`);
    assert.ok((first * ch - y) * z - ch / 2 <= -cy, `cy=${cy}: first row ${first} starts below the top`);
  }
});

test('filtered walls still clamp to their own rows', () => {
  const [first, last] = rowRange(true, 2, 150, 1, 300, 40, 1000);
  assert.strictEqual(first, 0);
  assert.strictEqual(last, 1);
});

test('the wall measures again after layout settles and after the switch glide', () => {
  assert.match(grimoire, /settle=requestAnimationFrame\(\(\)=>\{settle=requestAnimationFrame\(\(\)=>\{settle=0;measure\(\);queue\(\);\}\);\}\)/);
  assert.match(grimoire, /pod\?\.addEventListener\('transitionend',\(\)=>\{measure\(\);queue\(\);\},\{signal\}\)/);
  assert.match(grimoire, /cancelAnimationFrame\(settle\)/);
  assert.match(motion, /for\(const \[el,saved\] of restores\)for\(const \[key,value\] of saved\)el\.style\[key\]=value/);
  assert.match(motion, /if\(view!=='list'&&alive\(next\)\)remeasure\(\)/);
});

test('the service exits on its own when the host is gone, even if stopping hangs', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'services', 'server.cjs'), 'utf8');
  assert.match(server, /input\.on\('close',\(\)=>\{closing=true;setTimeout\(\(\)=>process\.exit\(0\),6000\)\.unref\(\);(?:try\{require\('\.\/cold-test\.cjs'\)\.stop\(\);\}catch\{\})?runtime\.stop\(\)/);
});
