'use strict';
/* 11-27 (user: 勾选框勾选成这样了 不止这里 方框还是个长方形): the native checkbox / radio skin in controls-b.css must
   stay a 17px square (other input rules add padding that stretched it to 28x24) and its tick must not inherit the
   grimoire-controls.css mask, which squeezed the check into a dot in the corner */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'web', 'controls-b.css'), 'utf8');

test('checkbox and radio skins zero the padding and lock the size', () => {
  for (const type of ['checkbox', 'radio']) {
    const at = css.indexOf('input[type=' + type + ']');
    assert.ok(at > 0, type + ' rule exists');
    const rule = css.slice(at, css.indexOf('}', at));
    assert.match(rule, /padding:0!important/, type + ' padding');
    assert.match(rule, /min-width:17px!important/, type + ' min-width');
    assert.match(rule, /box-sizing:border-box!important/, type + ' box-sizing');
  }
});

test('checkbox tick drops the grimoire mask and background', () => {
  const at = css.indexOf('input[type=checkbox]:not(.switch)');
  const after = css.slice(css.indexOf('&::after', at), css.indexOf('}', css.indexOf('&::after', at)));
  assert.match(after, /mask:none!important/);
  assert.match(after, /background:transparent!important/);
});
