// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* validation/helpers/installed.cjs: a folder an uninstall left behind is no installed game */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {installed}=require('./helpers/installed.cjs');
test('only a folder with a program (up to two levels down) counts as an installed game',t=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-installed-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const mk=(rel,files)=>{const p=path.join(d,rel);fs.mkdirSync(p,{recursive:true});for(const f of files)fs.writeFileSync(path.join(p,f),'x');return p;};
 assert.equal(installed(path.join(d,'missing')),false);
 assert.equal(installed(mk('empty',[])),false,'an emptied folder');
 assert.equal(installed(mk('steam-left',['steam-achievement-blocker.log','steam_api_o.dll'])),false,'what a Steam uninstall leaves');
 assert.equal(installed(mk('shell-left',['TheShell.pfs.061'])),false,'a patch archive without the game');
 assert.equal(installed(mk('game',['game.exe','data.xp3'])),true);
 mk('nested/a/b',['game.exe']);assert.equal(installed(path.join(d,'nested')),true,'two levels down');
 mk('deep/a/b/c',['game.exe']);assert.equal(installed(path.join(d,'deep')),false,'three levels down is not this game');
});
