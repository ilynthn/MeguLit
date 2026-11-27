'use strict';
/* Alt+T 文字 → 颜色 (user 2026-11-21): no folds; two flat sections with a state-by-row matrix; same setting names */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','menu-layout.js'),'utf8');
test('colour page is two flat matrices over the same inputs',()=>{
 assert.match(s,/dlg:'台词（已读 \/ 未读）',chc:'选项（已选 \/ 未选）'/);
 assert.match(s,/en:\{dlg:'Lines \(read \/ unread\)'/);assert.match(s,/ja:\{dlg:'台詞（既読・未読）'/);
 for(const n of ['galTextColor','galReadTextColor','galTextGradient','galReadTextGradient','galTextGradientTop','galReadTextGradientTop','galTextGradientBottom','galReadTextGradientBottom','galTextGradientStart','galReadTextGradientStart'])assert.ok(s.includes("'"+n+"'"),n);
 assert.match(s,/palette\.append\(d\.box,rest\);palette\.append\(choiceBox\|\|c\.box\);colours\.remove\(\);choiceColours\.remove\(\);/,'the two folds are gone');
 assert.ok(s.includes("choiceColours.remove();/* 2026-11-28 分角色")&&s.includes("{const s=block(C.spk,[]);s.grid.remove();s.box.dataset.textSpeakerColors='';palette.append(s.box);}"),'分角色 is a third group after the two (speaker-colors.js fills it)');
 assert.match(s,/\.tome-cm-label\{font-size:13px;white-space:nowrap\}/,'labels never wrap');
 assert.match(s,/cell\.classList\.toggle\('tome-cm-off',!on\)/,'gradient off dims its rows');
 assert.match(s,/undo\.classList\.add\('tome-cm-link'\);d\.head\.append\(undo\)/,'restore is a small link in the section head');
});
