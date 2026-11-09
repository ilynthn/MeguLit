// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');

test('setup applies background and text colors to its native caption and border',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../setup/setup-runtime.ps1'),'utf8');
 assert.match(source,/\$form\.add_HandleCreated\(/);
 assert.match(source,/\$frameBackground\s*=\s*\[Drawing.ColorTranslator\]::ToWin32\(\$form.BackColor\)/);
 assert.match(source,/\$frameText\s*=\s*\[Drawing.ColorTranslator\]::ToWin32\(\$form.ForeColor\)/);
 for(const attribute of [34,35])assert(source.includes(`DwmSetWindowAttribute($form.Handle,${attribute},[ref]$frameBackground,4)`));
 assert(source.includes('DwmSetWindowAttribute($form.Handle,36,[ref]$frameText,4)'));
 assert.match(source,/\$form.FormBorderStyle\s*=\s*'FixedDialog'/);
});
