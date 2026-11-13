// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 user report: Chinese text in mono labels looked pixelated (no CJK glyph in IBM Plex Mono/Consolas, so the
   system monospace bitmap font was used); every mono stack names a CJK sans before the generic monospace */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const web=path.join(__dirname,'..','web');
const files=[...fs.readdirSync(web).filter(f=>f.endsWith('.css')).map(f=>path.join(web,f)),path.join(web,'kana','kana.css')];
test('no mono font stack ends straight in the generic monospace after Consolas',()=>{
 for(const f of files){const s=fs.readFileSync(f,'utf8');assert.doesNotMatch(s,/Consolas,monospace/,path.basename(f));}
});
test('the login heading is a real heading, not the mono kicker',()=>{
 const s=fs.readFileSync(path.join(web,'theme.css'),'utf8');assert.match(s,/\.profile-panel-intro h3\{font-family:var\(--t-serif\)/);
});
