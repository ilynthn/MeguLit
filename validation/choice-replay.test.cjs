// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 live recordings of choice screens (MEGULIT_HOOK_RECORD) replayed through HookNative: the options asked of OCR
   and the boxes handed to the reader. Each fixture names the options its choice screen must end with. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {replay}=require('./helpers/hook-replay.cjs');
const dir=path.join(__dirname,'helpers','choice-replay');
const cases=fs.existsSync(path.join(dir,'expect.json'))?JSON.parse(fs.readFileSync(path.join(dir,'expect.json'),'utf8')):{};
for(const [file,want] of Object.entries(cases))test('choice replay '+file,()=>{
 const r=replay(path.join(dir,file),{name:want.exe||'game.exe'});
 if(want.locate){const asked=r.locates.some(l=>want.locate.every(o=>l.options.includes(o)));assert.ok(asked,'OCR asked for '+JSON.stringify(want.locate)+'; asked '+JSON.stringify(r.locates.map(l=>l.options)));}
 if(want.shown){const last=r.shown.filter(Boolean).pop();assert.ok(last,'choices shown');assert.deepStrictEqual(last.items.map(i=>i.text),want.shown);}
});
