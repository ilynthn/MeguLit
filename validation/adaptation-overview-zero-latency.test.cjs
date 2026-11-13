// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 adaptation overview: the zero-latency column and the patch state behind it.
   - brief() tells a Chinese script that failed pairing and one the user removed from plain machine translation
   - the running-script index carries a reader stamp, so a reader fix reads the script again (Fata Morgana kept a stale index)
   - a script the user picked is never overwritten or cleared by the drive search
   - the overview UI gives every state its own tone (no all-green column) and has a real close button */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const ot=require('../services/original-text.cjs');
const src=fs.readFileSync(path.join(__dirname,'../services/original-text.cjs'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../web/adaptation-overview.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../web/diagnostics.css'),'utf8');
function root(state){const r=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'ov-'));fs.mkdirSync(path.join(r,'data/config'),{recursive:true});fs.writeFileSync(path.join(r,'data/config/original-text.json'),JSON.stringify(state));return r;}

test('brief separates ready, failed, removed and machine',()=>{
 const r=root({a:{status:'native-japanese',patchStatus:'ready',patch:{}},b:{status:'native-japanese',patchStatus:'unreliable',patch:{auto:false}},c:{status:'native-japanese',patchStatus:'none',patch:null,patchSearch:{declined:true}},d:{status:'native-japanese',patchStatus:'none'},e:{status:'chinese-only'}});
 assert.equal(ot.brief(r,'a'),'patch');assert.equal(ot.brief(r,'b'),'patch-unreliable');assert.equal(ot.brief(r,'c'),'patch-removed');
 assert.equal(ot.brief(r,'d'),'machine');assert.equal(ot.brief(r,'e'),'needs-japanese');assert.equal(ot.brief(r,'zz'),'unknown');
});
test('running-script index is keyed by the reader code too',()=>{
 assert.match(src,/const READER=/);
 assert.match(src,/current\.runtime\.reader\|\|''\)===READER/);
 assert.match(src,/reader:READER,index/);
 assert.match(src,/state\.patchSearch\.reader\|\|''\)===\(state\.runtime\.reader/,'a search cached for an older reader runs again');
});
test('a user-picked patch is kept by autoPatch and restored after a failed search',()=>{
 assert.match(src,/state\.patch&&!state\.patch\.auto&&!options\.force\)return \{manual:true\}/);
 assert.match(src,/\(stale\|\|state\.patchStatus==='ready'\)&&state\.patch\.auto\)/);
 assert.match(src,/patch:before\.patch\|\|null/);
});
/* option C (user pick 2026-11-13): state colours by meaning, problems first with a reason, scan only through the probe hook */
const ov=()=>import(require('node:url').pathToFileURL(path.join(__dirname,'../web/adaptation-overview.js')).href);
test('overview tones: grey works, gold fallback/unverified, red needs work, hollow grey untested',async()=>{
 const {TONE,FALLBACK}=await ov();
 assert.equal(TONE.patch,'ok');assert.equal(TONE.verified,'ok');assert.equal(TONE.reads,'ok');
 assert.equal(TONE.machine,'part');assert.equal(TONE['patch-removed'],'part');assert.equal(TONE.supported,'part');
 assert.ok(FALLBACK.has('machine')&&FALLBACK.has('patch-removed')&&!FALLBACK.has('supported'),'only fallbacks are hollow gold');
 for(const v of ['no-text','missing','readonly','unsupported','patch-unreliable','needs-japanese','none'])assert.equal(TONE[v],'bad',v);
 for(const v of ['untested','pending','unknown','preparing'])assert.equal(TONE[v],'wait',v);
 for(const t of ['ok','part','wait','bad'])assert.match(css,new RegExp(`adapt-s\[data-t=${t}\]|adapt-seg\[data-t=${t}\]`),t);
});
test('overview sorts games that need work first and says why, read → embed → zero-latency',async()=>{
 const {needsWork,sortByNeed,reasonFor}=await ov();
 const ok={id:'a',reading:'reads',embedKind:'verified',zeroLatency:'patch',lastSeenAt:9},bad={id:'b',reading:'missing',embedKind:'readonly',zeroLatency:'needs-japanese',lastSeenAt:1};
 assert.equal(needsWork(ok),false);assert.equal(needsWork(bad),true);
 assert.deepEqual([ok,bad].sort(sortByNeed).map(g=>g.id),['b','a']);
 assert.equal(reasonFor(bad,{missing:'A',readonly:'B','needs-japanese':'C'}),'A；B','first two blocking reasons in column order');
});
test('overview labels exist in zh/ja/en and a missing program reads as its own state',()=>{
 for(const k of ['patch-unreliable','patch-removed','needs-japanese','no-text'])assert.ok(ui.split("['"+k+"']:").length-1>=3,k);
 assert.ok(ui.split('missing:').length-1>=6,'missing: label + reason per locale');
 assert.match(ui,/reading:g\.available===false\?'missing':g\.reading/);
});
test('overview hands scanning to the probe pipeline and never uploads itself',()=>{
 assert.match(ui,/import \{requestProbe\} from '\.\/probe-hook\.js'/);
 assert.doesNotMatch(ui,/diagnostics_upload|openDiagnostics|导出诊断包|发给我们/);
 const hook=fs.readFileSync(path.join(__dirname,'../web/probe-hook.js'),'utf8');
 assert.match(hook,/window\.megulitProbe\.open\(\{ ids: list, source, onDone \}\)/);
 assert.match(hook,/import\('\.\/adapter-probe-ui\.js'\)/,'E563 the pipeline module checks locally and shows the manifest before any upload');
 assert.doesNotMatch(hook,/diagnostics_upload|fetch\(/,'the hook itself sends nothing');
});
test('overview keeps one scroll area with a sticky head and a header close button',()=>{
 assert.match(ui,/class="adapt-close" data-close/);assert.doesNotMatch(ui,/dialog-actions/);
 assert.match(ui,/<div class="adapt-scroll"><div class="adapt-grid adapt-head"/);
 assert.match(css,/\.adapt-head\{position:sticky/);
 assert.match(css,/@font-face\{font-family:"Adapt Digits"/,'lining digits for Sitka titles');
});
