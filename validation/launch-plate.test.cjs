'use strict';
// 2026-11-13 launch plate (user pick F1 切角·实心): every big primary / launch button shares one folded-corner plate.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=f=>fs.readFileSync(path.join(__dirname,'../web',f),'utf8');

test('launch-plate.css loads after controls-b.css and before settings-dict.css',()=>{
 const html=web('index.html');const b=html.indexOf('controls-b.css'),l=html.indexOf('launch-plate.css'),d=html.indexOf('settings-dict.css');
 assert.ok(b>0&&l>b&&d>l);
});

test('one plate covers launch, wizard, goal, Anki and dialog primaries; the big launch keeps its own size',()=>{
 const css=web('launch-plate.css');
 for(const s of ['button.primary','.dev-notice-actions button[data-ok]','[data-lg-ok]','.main .detail-actions>button.primary'])assert.ok(css.includes(s),s);
 assert.match(css,/clip-path:polygon\(0 0,calc\(100% - var\(--fold\)\) 0,100% var\(--fold\)/);
 assert.match(css,/detail-actions>button\.primary:not\(\.icon-button\):not\(\.titlebar \*\):not\(\.mgl-x\)\{height:52px/);
 assert.match(css,/\[aria-busy=true\]::before\{width:40%/);
 assert.match(css,/@property --fold\{syntax:"<length>";inherits:true/,'the fold size must reach ::after');
 assert.match(css,/:hover:not\(:disabled\)\{--fold:42px\}/,'hover folds the launch corner down');
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(web('controls-b.css'),/diamond seal \*\/\r?\n& body \.main \.detail-actions/);
});

test('startGame marks the button busy and restores its label',()=>{
 const app=web('app.js');
 assert.match(app,/launchInFlight=true;if\(button\)button\.disabled=true;markLaunching\(button,true\);/);
 assert.match(app,/finally\{launchInFlight=false;if\(button\)button\.disabled=false;markLaunching\(button,false\);\}/);
 assert.match(app,/const LAUNCHING=\{zh:'启动中…',ja:'起動中…',en:'Starting…'\}/);
});
