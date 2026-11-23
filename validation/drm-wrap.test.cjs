// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E-DRM: DRM-wrapped programs and the launcher that starts them (core/drm-wrap.cjs), with fake PE files. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const drm=require('../core/drm-wrap.cjs'),library=require('../core/library.cjs');

/* A minimal PE image: MZ header, PE signature, one section, then the given text (ASCII and/or UTF-16) and padding. */
function pe(size,{ascii=[],wide=[],section='.text'}={}){
 const head=Buffer.alloc(0x40+24+40);head.write('MZ',0,'latin1');head.writeUInt32LE(0x40,0x3c);head.write('PE\0\0',0x40,'latin1');
 head.writeUInt16LE(0x14c,0x44);head.writeUInt16LE(1,0x46);head.writeUInt16LE(0,0x54);head.write(section,0x40+24,'latin1');
 const body=Buffer.concat([...ascii.map(s=>Buffer.from('\0'+s+'\0','latin1')),...wide.map(s=>Buffer.from('\0\0'+s+'\0\0','utf16le'))]);
 const out=Buffer.alloc(Math.max(size,head.length+body.length));head.copy(out,0);body.copy(out,head.length);return out;
}
const SIG='-- SIGNATURE - SHA256/PSS/RSA --\r\nAAAA\r\n';
function folder(name,files){const dir=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'megulit-drm-')),name);fs.mkdirSync(dir,{recursive:true});
 for(const [n,v] of Object.entries(files))fs.writeFileSync(path.join(dir,n),v);return dir;}
/* The real layout of 死に逝く君、館に芽吹く憎悪 [汉化硬盘版] (KiriKiri, SoftDenchi), scaled down. */
function softdenchi(extra={},name='[160729][バグシステム]死に逝く君、館に芽吹く憎悪 [汉化硬盘版]'){return folder(name,{
 '死に逝く君、館に芽吹く憎悪.exe':pe(244224,{wide:['bug02_yakata_srp.exe','\\*.emb']}),'死に逝く君、館に芽吹く憎悪.sig':SIG,
 'bug02_yakata.exe':pe(3782656,{ascii:['krmovie.dll','data.exe']}),'bug02_yakata.exe.emb':SIG,
 'bug02_yakata_srp.exe':pe(516608,{ascii:['https://charge1.soft-denchi.jp/DenchiSystem/satxControler','SdWrap'],wide:['SdWrap Version 1.0']}),'bug02_yakata_srp.exe.sig':SIG,
 '打开游戏.exe':pe(209408,{section:'.MPRESS1'}),'2DJGAME.exe':pe(233984,{wide:['krkrprelnch%ld']}),
 'data.xp3':Buffer.from('XP3\r\n'),'data.xp3.sig':SIG,...extra});}
const base=f=>f?path.basename(f):'';

test('SoftDenchi: wrapper, its starter and the protected engine program are told apart; .sig is not evidence',()=>{
 const dir=softdenchi(),roles=Object.fromEntries(drm.classify(dir).map(e=>[e.name,e.role+':'+e.kind]));
 assert.equal(roles['bug02_yakata_srp.exe'],'stub:softdenchi');
 assert.equal(roles['死に逝く君、館に芽吹く憎悪.exe'],'stub:softdenchi');
 assert.equal(roles['bug02_yakata.exe'],'protected:softdenchi');
 assert.equal(roles['打开游戏.exe'],'clean:');assert.equal(roles['2DJGAME.exe'],'clean:');
});
test('a protected engine program is started through the player-facing launcher (打开游戏.exe before 2DJGAME.exe)',()=>{
 const dir=softdenchi();
 for(const n of ['bug02_yakata.exe','bug02_yakata_srp.exe','死に逝く君、館に芽吹く憎悪.exe','打开游戏.exe']){
  const p=drm.plan(path.join(dir,n));assert.ok(p,n);assert.equal(p.kind,'softdenchi',n);
  assert.equal(base(p.executable),'bug02_yakata.exe',n);assert.equal(base(p.launchVia),'打开游戏.exe',n);assert.equal(p.changed,true,n);}
 assert.deepEqual(drm.plan(path.join(dir,'bug02_yakata.exe')).launcherNames,['打开游戏.exe','2DJGAME.exe']);
});
test('library scan records the engine program, never the SdWrap wrapper',()=>{
 // The wrapper made the largest: the scan still lands on the engine program.
 const dir=softdenchi({'bug02_yakata_srp.exe':pe(5000000,{ascii:['SdWrap','soft-denchi']})},'死に逝く君、館に芽吹く憎悪');
 assert.equal(base(library.findGame(dir).exe),'bug02_yakata.exe');
 const own=drm.plan(path.join(dir,'bug02_yakata_srp.exe'));assert.equal(base(own.executable),'bug02_yakata.exe');
});
test('versioned updaters beside a game are excluded from scanning and launch planning',()=>{
 const {isLauncher}=require('../core/launcher-language.cjs');
 const dir=folder('Novel',{'Novel.exe':pe(1400000,{ascii:['SdWrap']}),'Novel.exe.emb':SIG,'script.npa':'NPA',
  'NovelUpdata1.01.exe':pe(8000000),'NovelUpdate2.1.exe':pe(400000)});
 assert.equal(isLauncher('NovelUpdata1.01.exe'),false);
 assert.equal(isLauncher('NovelUpdate2.1.exe'),false);
 assert.equal(isLauncher('NovelUpdateChronicle.exe'),true);
 const exe=path.join(dir,'Novel.exe');
 assert.equal(library.findGame(dir).exe,exe);
 const plan=drm.plan(exe);
 assert.equal(plan.executable,exe);
 assert.equal(plan.launchVia,'');
 assert.deepEqual(plan.alternatives,[]);
});
test('an emulator target cannot select a versioned updater during scanning',t=>{
 const dir=folder('Novel',{'Novel.exe':pe(1400000),'NovelUpdata1.01.exe':pe(8000000),
  'launcher.ini':'Target=NovelUpdata1.01.exe\r\n','script.npa':'NPA'});
 t.after(()=>fs.rmSync(path.dirname(dir),{recursive:true,force:true}));
 assert.equal(library.findGame(dir).exe,path.join(dir,'Novel.exe'));

 const game=folder('Novel',{'Novel.exe':pe(1400000),'NovelAlternate.exe':pe(400000),
  'launcher.ini':'Target=NovelAlternate.exe\r\n','script.npa':'NPA'});
 t.after(()=>fs.rmSync(path.dirname(game),{recursive:true,force:true}));
 assert.equal(library.findGame(game).exe,path.join(game,'NovelAlternate.exe'));
});
test('a protected versioned updater cannot be the engine for a smaller clean game',t=>{
 const dir=folder('Novel',{'Novel.exe':pe(1400000),
  'NovelUpdata1.01.exe':pe(8000000),'NovelUpdata1.01.exe.emb':SIG,
  'NovelUpdate2.1.exe':pe(6000000,{ascii:['DMMGamePlayer']})});
 t.after(()=>fs.rmSync(path.dirname(dir),{recursive:true,force:true}));
 assert.deepEqual(drm.classify(dir).filter(e=>e.role==='protected').map(e=>e.kind).sort(),['dmm','softdenchi']);
 const exe=path.join(dir,'Novel.exe');
 assert.equal(drm.plan(exe),null);
 assert.equal(drm.plan(path.join(dir,'NovelUpdata1.01.exe')),null);
});
test('a cracked engine program of about the same size replaces the protected one directly',()=>{
 const dir=softdenchi({'bug02_yakata_crack.exe':pe(3782000)});const p=drm.plan(path.join(dir,'bug02_yakata.exe'));
 assert.equal(base(p.executable),'bug02_yakata_crack.exe');assert.equal(p.launchVia,'');
});
test('nothing to switch to: no change, and the hint asks for the runtime or another program',()=>{
 const dir=folder('Game',{'game.exe':pe(3000000),'game.exe.emb':SIG,'game_srp.exe':pe(500000,{ascii:['SdWrap']})});
 const p=drm.plan(path.join(dir,'game.exe'));assert.equal(p.changed,false);assert.equal(p.launchVia,'');
 assert.match(drm.hint(p,'zh'),/game\.exe 需要软电池（SoftDenchi）正版验证.*没找到破解或汉化启动器/);
});
function totono(folderName='TOTONO'){
 return folder(folderName,{
  'totono.exe':pe(98304,{ascii:['SdWrap','sdrt5030.exe']}),
  'sdrt5030.exe':pe(5*1024*1024,{ascii:['SoftDenchi']}),
  'totonoUpdata1.01.exe':pe(3*1024*1024),
 });
}
test('#776: TOTONO keeps its original starter when the only clean candidate is the updater',()=>{
 const dir=totono(),starter=path.join(dir,'totono.exe');
 const plan=drm.plan(starter);
 assert.equal(base(plan.wrapped),'sdrt5030.exe');
 assert.equal(base(plan.executable),'totono.exe');
 assert.equal(plan.changed,false);
 assert.equal(plan.launchVia,'');
 assert.deepEqual(plan.ignoredUpdaters,['totonoUpdata1.01.exe']);
});
test('#776: the saved updater can revert to the starter recorded by DRM correction',()=>{
 const dir=totono(),updater=path.join(dir,'totonoUpdata1.01.exe');
 const savedDrm={kind:'softdenchi',wrapped:path.join(dir,'sdrt5030.exe'),from:path.join(dir,'totono.exe')};
 const plan=drm.plan(updater,{savedDrm});
 assert.equal(base(plan.executable),'totono.exe');
 assert.equal(plan.changed,true);
 assert.equal(plan.restoredFromUpdater,true);
 assert.equal(plan.launchVia,'');

 assert.equal(drm.plan(updater),null);
 assert.equal(drm.plan(updater,{savedDrm:{...savedDrm,from:path.join(totono('Other'),'totono.exe')}}),null);
 assert.equal(drm.plan(updater,{savedDrm:{...savedDrm,wrapped:path.join(dir,'another.exe')}}),null);
});
test('#776: bridge saves the recovered starter before preparing the game process',async t=>{
 const dir=totono(),starter=path.join(dir,'totono.exe'),updater=path.join(dir,'totonoUpdata1.01.exe');
 const savedDrm={kind:'softdenchi',wrapped:path.join(dir,'sdrt5030.exe'),from:starter};
 const row={executable:updater,original:JSON.stringify({library:{exe:updater,source:'manual',drm:savedDrm}})};
 const writes=[];
 const db={prepare(sql){
  if(sql.startsWith('SELECT * FROM games'))return {get:()=>({...row})};
  if(sql.startsWith('UPDATE games SET executable'))return {run:(...values)=>writes.push(values)};
  throw Error('Unexpected SQL: '+sql);
 }};
 const previousRoot=process.env.MEGULIT_ROOT;
 process.env.MEGULIT_ROOT=dir;
 let launch;
 try{({launch}=require('../services/bridge.cjs'));}
 finally{
  if(previousRoot===undefined)delete process.env.MEGULIT_ROOT;
  else process.env.MEGULIT_ROOT=previousRoot;
 }
 t.mock.method(require('../services/background-games.cjs'),'foreground',async()=>{});
 t.mock.method(require('../services/game-language.cjs'),'originalExecutable',()=>({blocked:false}));
 const reachedPrepare=Error('Fixture ends before starting a process');
 let prepared;
 await assert.rejects(launch(db,'totono',{prepareGame(exe){prepared=exe;throw reachedPrepare;}}),e=>e===reachedPrepare);
 assert.equal(prepared,starter);
 assert.equal(writes.length,1);
 assert.equal(writes[0][0],starter);
 assert.equal(JSON.parse(writes[0][1]).library.exe,starter);
 const entries=fs.readFileSync(path.join(dir,'logs','game-launch.log'),'utf8').trim().split('\n').map(JSON.parse);
 const ignored=entries.find(entry=>entry.stage==='drm-updaters-ignored');
 assert.deepEqual(ignored.files,['totonoUpdata1.01.exe']);
 assert.equal(ignored.restoredPreviousLauncher,true);
});
test('a plain KiriKiri Z release with .sig files everywhere is not DRM',()=>{
 const dir=folder('krkrz',{'game.exe':pe(4000000),'game.sig':SIG,'data.xp3':'XP3','data.xp3.sig':SIG,'config.exe':pe(300000)});
 assert.equal(drm.plan(path.join(dir,'game.exe')),null);
});
test('DMM and DLsite text inside the game program; a translated launcher only for translated games',()=>{
 const dmm=folder('dmm',{'game.exe':pe(6000000,{ascii:['DMMGamePlayer']}),'loader.exe':pe(150000),'game_chs.exe':pe(160000)});
 let p=drm.plan(path.join(dmm,'game.exe'),{allowTranslated:false});assert.equal(p.kind,'dmm');assert.equal(base(p.launchVia),'loader.exe');
 p=drm.plan(path.join(dmm,'game.exe'),{allowTranslated:true});assert.deepEqual(p.launcherNames,['loader.exe','game_chs.exe']);
 const dl=folder('dl',{'game.exe':pe(6000000,{wide:['DLsiteDRM']})});assert.equal(drm.plan(path.join(dl,'game.exe')).kind,'dlsite');
});
test('SteamStub (.bind) is left to Steam for Steam games',()=>{
 const dir=folder('steam',{'game.exe':pe(5000000,{section:'.bind'}),'start.exe':pe(100000)});
 assert.equal(drm.plan(path.join(dir,'game.exe'),{source:'steam'}),null);
 assert.equal(base(drm.plan(path.join(dir,'game.exe'),{source:'folder'}).launchVia),'start.exe');
});
test('the failure words name the program, the check and the launcher used',()=>{
 const p=drm.plan(path.join(softdenchi(),'bug02_yakata.exe'));
 assert.equal(drm.hint(p,'zh'),'bug02_yakata.exe 需要软电池（SoftDenchi）正版验证，已改用同目录的 打开游戏.exe 启动。如果它也弹窗报错，请在「编辑作品」里换成其他能直接双击打开的程序');
 assert.match(drm.hint(p,'en'),/started it through 打开游戏\.exe/);assert.match(drm.hint(p,'ja'),/ソフト電池/);
 const alt=drm.plan(path.join(folder('x',{'g.exe':pe(3000000),'g.exe.emb':SIG,'g_srp.exe':pe(500000,{ascii:['SdWrap']}),'g_nodrm.exe':pe(2900000)}),'g_srp.exe'));
 assert.equal(base(alt.executable),'g_nodrm.exe');assert.match(drm.hint({...alt,changed:false,launchVia:''},'zh'),/请在「编辑作品」里换成 g_nodrm\.exe/);
});
test('launch: corrected once and recorded, started through the launcher, engine window waited for, DRM failure codes',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 assert.match(src,/require\('\.\.\/core\/drm-wrap\.cjs'\)\.plan\(game\.executable/);
 assert.match(src,/UPDATE games SET executable=\?,original=\? WHERE id=\?/);
 assert.match(src,/if\(launchVia&&!windowsLaunch\)\{/);
 assert.match(src,/waitForVisibleGame\(\(\)=>gameProcesses\(root,gameProcessExe\),\{\s*helper:true[^\n]*\n\s*\.\.\.\(languageTarget\?\{\}:\{attempts:360,timeout:90000\}\)/);
 assert.match(src,/GAME_DRM_LAUNCHER_FAILED':'GAME_DRM_WRAPPED'/);
 assert.match(src,/case 'launch_hint':/);
 const feedback=fs.readFileSync(path.join(__dirname,'..','web','launch-feedback.js'),'utf8');
 assert.match(feedback,/GAME_DRM_WRAPPED:\[/);assert.match(feedback,/GAME_DRM_LAUNCHER_FAILED:\[/);
});
test('real folder (read only): 死に逝く君、館に芽吹く憎悪 starts through 打开游戏.exe',{skip:!fs.existsSync('E:/GAL/死に逝く君、館に芽吹く憎悪')},()=>{
 const dir='E:/GAL/死に逝く君、館に芽吹く憎悪/[160729][バグシステム]死に逝く君、館に芽吹く憎悪 [汉化硬盘版]';
 const p=drm.plan(path.join(dir,'打开游戏.exe'));assert.equal(base(p.executable),'bug02_yakata.exe');assert.equal(base(p.launchVia),'打开游戏.exe');
});
