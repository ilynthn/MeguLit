// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// 2026-11-13 Purple software CMVS (Steam Aoi Tori showed an empty engine): cmvs32.exe / cmvs64.exe, or cmvs.cfg beside a program.
// Replay of the live attach (H:\MeguLit-Work\scratch\replay\aoitori-cmvs-attach.jsonl): LunaHook inserts the CMVS hook EDNHSX4@647D0.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const library=require('../core/library.cjs');
function folder(files){const d=fs.mkdtempSync(path.join(os.tmpdir(),'cmvs-'));for(const f of files){fs.mkdirSync(path.dirname(path.join(d,f)),{recursive:true});fs.writeFileSync(path.join(d,f),'');}return d;}
test('CMVS 32-bit build is recognised and hooked',()=>{const e=library.engineOf(folder(['cmvs32.exe','cmvs.cfg','data/pack/ps.cpz']));assert.equal(e?.name,'Purple software (CMVS)');assert.equal(e.hook,true);});
test('CMVS 64-bit build is recognised',()=>{assert.equal(library.engineOf(folder(['cmvs64.exe']))?.name,'Purple software (CMVS)');});
test('a renamed CMVS program is recognised by cmvs.cfg',()=>{assert.equal(library.engineOf(folder(['aoitori.exe','cmvs.cfg']))?.name,'Purple software (CMVS)');});
test('cmvs.cfg alone is not a game',()=>{assert.notEqual(library.engineOf(folder(['cmvs.cfg']))?.name,'Purple software (CMVS)');});
