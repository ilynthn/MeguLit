// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-fata-launch-'));
const previousRoot=process.env.MEGULIT_ROOT;
process.env.MEGULIT_ROOT=root;
const {launch}=require('../services/bridge.cjs');
if(previousRoot===undefined)delete process.env.MEGULIT_ROOT;
else process.env.MEGULIT_ROOT=previousRoot;
after(()=>{
 assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));
 fs.rmSync(root,{recursive:true,force:true});
});
const {launchTarget}=require('../services/original-engines/krkr-lang.cjs');
const {activeGameForProgram}=require('../services/library.cjs');
const readiness=require('../services/game-readiness.cjs'),processes=require('../services/game-process.cjs');
const {waitForVisibleGame}=readiness;

function fixture(){
 const dir=fs.mkdtempSync(path.join(root,'海市蜃楼-'));
 const file=name=>path.join(dir,name);
 const wrapper=Buffer.concat([Buffer.from('MZ'),Buffer.from('fata.exe\0','utf16le')]);
 for(const lang of ['jp','zh','ru'])fs.writeFileSync(file('fata_'+lang+'.exe'),wrapper);
 for(const name of ['fata.exe','data.xp3','data_jp.xp3'])fs.writeFileSync(file(name),'fixture');
 const game={id:'fata',title:'The House in Fata Morgana',executable:file('fata_jp.exe'),original:JSON.stringify({library:{engine:'KiriKiri',localeMode:'off'}})};
 return {dir,file,game,target:file('fata.exe')};
}

test('recognizes each language launcher that names the shared game executable',()=>{
 const {file,target}=fixture();
 for(const lang of ['jp','zh','ru'])assert.equal(launchTarget(file('fata_'+lang+'.exe')),target);
 assert.equal(launchTarget(target),'');
 fs.writeFileSync(file('fata_ru.exe'),'MZ\0unrelated.exe\0');
 assert.equal(launchTarget(file('fata_ru.exe')),'');
 fs.unlinkSync(file('data_jp.xp3'));
 assert.equal(launchTarget(file('fata_jp.exe')),'');
});

test('the shared game window maps back to a single library entry even without saved variants',()=>{
 const {game,file,target}=fixture();
 const db=(...rows)=>({prepare:()=>({all:()=>rows})});
 assert.equal(activeGameForProgram(db(game),target),game);
 assert.equal(activeGameForProgram(db(game),fixture().target),null);
 assert.equal(activeGameForProgram(db(game,{...game,id:'ru',executable:file('fata_ru.exe')}),target),null);
 const exact={...game,id:'engine',executable:target};
 assert.equal(activeGameForProgram(db(game,exact),target),exact);
});

for(const mode of ['wrapper','windows','japanese','already running'])test('launch monitors and binds the engine: '+mode,async t=>{
 const {dir,file,game,target}=fixture();
 const language=mode==='japanese'?'japanese':'off';
 game.original=JSON.stringify({library:{engine:'KiriKiri',localeMode:language,variants:[]}});
 const calls=[],writes=[],record=(...args)=>calls.push(args);
 const db={prepare(sql){
  if(sql.startsWith('SELECT * FROM games'))return {get:()=>({...game})};
  if(sql==='UPDATE games SET last_launched_at=? WHERE id=?')return {run:(...args)=>writes.push(args)};
  throw Error('Unexpected SQL: '+sql);
 }};
 const mock=(module,name,fn)=>t.mock.method(require(module),name,fn);
 mock('../services/import-source.cjs','backfill',()=>{});
 mock('../services/import-source.cjs','targetOf',()=>null);
 mock('../services/background-games.cjs','foreground',async()=>{});
 mock('../services/background-games.cjs','unmute',async()=>{});
 mock('../core/steam-owned.cjs','launchAppid',()=>'');
 mock('../services/game-language.cjs','originalExecutable',()=>({blocked:false}));
 mock('../core/drm-wrap.cjs','plan',()=>null);
 mock('../services/shared-adaptation.cjs','importFor',()=>{});
 mock('../core/japanese-restore.cjs','repairNameColumns',()=>({}));
 mock('../core/japanese-restore.cjs','repairShared',()=>({}));
 mock('../services/japanese-auto-run.cjs','beforeLaunch',()=>{});
 mock('../core/directplay.cjs','prepare',()=>({copied:[],declined:[],missing:[]}));
 mock('../core/windows-features.cjs','prepareDotnet',()=>[]);
 mock('../core/windows-features.cjs','watch',()=>({stop(){}}));
 mock('../core/locale-emulator.cjs','x86',()=>true);
 mock('../services/launcher-cleanup.cjs','endHidden',()=>{throw Error('Language launcher must not be cleaned up as DRM');});
 let queries=0;
 t.mock.method(processes,'gameProcess',async(_root,exe,{focus})=>{
  record('focus',exe,focus);
  return mode==='already running'?'focused':'absent';
 });
 t.mock.method(processes,'gameProcesses',async(_root,exe)=>{
  assert.equal(exe,target);
  return ++queries<3?[]:[{pid:42,visible:true}];
 });
 t.mock.method(processes,'shellOpen',async(_root,exe)=>record('shell',exe));
 t.mock.method(readiness,'startProcess',async(exe,args,cwd)=>{
  record('start',exe,args,cwd);
  return {pid:41,exit:{code:0,signal:null}};
 });
 t.mock.method(readiness,'waitForVisibleGame',(query,options)=>waitForVisibleGame(query,{...options,sleep:async()=>{}}));
 const runtime={
  prepareGame(exe){record('prepare',exe);},
  bindLaunched(pid){record('bind',pid);},
  library(){return {locale:{async launch(exe,{alsoExe}){record('locale',exe,alsoExe);return {gamePid:42};}}};}
 };
 const result=await launch(db,game.id,runtime,mode==='windows');
 assert.equal(result.action,mode==='already running'?'focused':'launched');
 assert.deepEqual(calls[0],['prepare',target]);
 assert.deepEqual(calls[1],['focus',target,true]);
 assert.deepEqual(calls.filter(([type])=>['start','shell','locale'].includes(type)),
  mode==='wrapper'?[['start',file('fata_jp.exe'),[],dir]]:
  mode==='windows'?[['shell',file('fata_jp.exe')]]:
  mode==='japanese'?[['locale',file('fata_jp.exe'),target]]:[]);
 assert.deepEqual(calls.slice(-2),[['prepare',target],['bind',42]]);
 assert.equal(writes.length,1);
 assert.equal(writes[0][1],game.id);
});
