'use strict';
/* E533 (ファタモルガーナの館 live, 2026-11-13): clicking the title button 館の扉を開く opened a word card for 扉 because the
   invisible art-text copy sat in the reader's hit region; the game never started. Art text now never takes the pointer,
   while its translation stays painted through a pass-through window region. */
const test=require('node:test');const assert=require('node:assert');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('art-text copy is left out of the hit region and takes no pointer',()=>{
 const interaction=read('web/reader/modules/interaction.js'),art=read('web/reader/modules/art-text.js');
 assert.match(interaction,/NODES='\.sentence-text:not\(\.megulit-art-row\) \.char-token,/);
 assert.match(art,/\.megulit-art \.megulit-art-row\{[^}]*pointer-events:none/);
});
test('art translations are painted through pass regions that the pointer gate ignores',()=>{
 const interaction=read('web/reader/modules/interaction.js'),bridge=read('native/GalWindowBridge.cs');
 assert.match(interaction,/\.megulit-art-item \.megulit-art-cn[\s\S]{0,600}pass:true/);
 assert.match(bridge,/class HitRegion\{public Rect Bounds;public bool Pass;\}/);
 assert.match(bridge,/Pass=Bool\(rect,"pass"\)/);
 const gates=bridge.match(/new ReaderPointerGate\.Context\([^;]*;/g)||[];
 assert.ok(gates.length>=2&&gates.every(g=>g.includes('FindAll(h=>!h.Pass)')));
 assert.match(bridge,/HitRegions\.Exists\(h=>!h\.Pass&&/);
});
