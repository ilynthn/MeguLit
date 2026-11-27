// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const fields = [
  { key: 'width', label: '书流宽度', value: 100, min: 50, max: 100, step: 1, unit: '%' },
  { key: 'x', label: '左右位置', value: 0, min: -20, max: 20, step: 1, unit: '%' },
  { key: 'top', label: '顶部留白', value: 28, min: 0, max: 160, step: 1, unit: 'px' },
  { key: 'height', label: '书本高度', value: 225, min: 125, max: 320, step: 1, unit: 'px' },
  { key: 'spacing', label: '书本间距', value: 49, min: 24, max: 84, step: 1, unit: 'px' },
  { key: 'depth', label: '书本厚度', value: 22, min: 10, max: 42, step: 1, unit: 'px' },
  { key: 'angle', label: '普通书本角度', value: 68, min: 35, max: 82, step: 1, unit: '°' },
  { key: 'selectedAngle', label: '选中书本角度', value: 27, min: 12, max: 60, step: 1, unit: '°' },
  { key: 'scale', label: '选中书本倍率', value: 1.14, min: 1, max: 1.4, step: 0.01, unit: '×' },
  { key: 'lift', label: '选中书本抬升', value: 58, min: 15, max: 120, step: 1, unit: 'px' },
  { key: 'fade', label: '两端渐隐范围', value: 14, min: 4, max: 30, step: 1, unit: '%' },
  { key: 'titleGap', label: '书流与标题间距', value: 15, min: 0, max: 80, step: 1, unit: 'px' }
];

const settingsFile = root => path.join(root, 'data', 'novel-flow-settings.json');

function normalize(settings) {
  return Object.fromEntries(fields.map(({ key, value, min, max }) => {
    const candidate = settings?.[key];
    return [key, Number.isFinite(candidate) ? Math.min(max, Math.max(min, candidate)) : value];
  }));
}

function read(root) {
  try { return normalize(JSON.parse(fs.readFileSync(settingsFile(root), 'utf8'))); }
  catch { return normalize(); }
}

function save(root, settings) {
  const normalized = normalize(settings);
  const file = settingsFile(root);
  const temp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(normalized, null, 2) + '\n');
  fs.renameSync(temp, file);
  return normalized;
}

module.exports = { fields, normalize, read, save };
