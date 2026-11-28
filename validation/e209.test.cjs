// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const patch=require('../services/patch-swap.cjs'),{openStore}=require('../services/store.cjs');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-e209-')),closers=[];
 t.after(()=>{for(const close of closers)close();fs.rmSync(root,{recursive:true,force:true});});
 t.closeBeforeCleanup=fn=>closers.push(fn);
 const game=path.join(root,'game');fs.mkdirSync(game);
 function write(rel,data){
  const file=path.join(game,rel);
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);
  return file;
 }
 return {root,game,write};
}
test('nested RealLive original, mixed casing, alternate programs and identical files round-trip',t=>{
 const {root,game,write}=fixture(t),host=write('play_cn.exe','translated');
 write('stash/Original build/bin/RealLive.ExE','original');write('stash/Original build/bin/SETUP.exe','installer');
 write('stash/Original build/bin/seen.txt','original-script');write('stash/Original build/bin/gameexe.ini','same');
 write('stash/Original build/bin/SaveData/save.sav','not the live save');
 const script=write('BIN/SEEN.TXT','translated-script'),ini=write('BIN/GAMEEXE.INI','same'),save=write('BIN/SaveData/save.sav','player save');
 const plan=patch.detect(game,host,'RealLive');
 assert.equal(plan.exe,path.join('bin','RealLive.ExE'));
 const result=patch.toJapanese(root,'g',game,host,'RealLive');
 assert.equal(result.active,'ja');assert.equal(result.issue,'');
 assert.equal(fs.readFileSync(script,'utf8'),'original-script');
 assert.equal(fs.existsSync(ini+patch.SUFFIX),false);
 assert.equal(fs.existsSync(path.join(game,'BIN/SETUP.exe')),false);
 assert.equal(fs.readFileSync(save,'utf8'),'player save');
 patch.toTranslated(root,'g',game);
 assert.equal(fs.readFileSync(script,'utf8'),'translated-script');
 assert.equal(fs.existsSync(result.japaneseExecutable),false);
});
test('a host DLL stays with the translated host and shared files are reused',t=>{
 const {root,game,write}=fixture(t),host=write('play_chs.exe','MZ\0TextPatch.DLL\0');
 const dll=write('textpatch.dll','translation runtime'),payload=write('textpatch.bin','translation payload');
 const scenario=write('SEEN.TXT','shared script');write('GAMEEXE.INI','shared config');
 write('Backup-JP/RealLive.exe','MZ\0original');
 assert.equal(patch.detect(game,host,'RealLive').kind,'host-dll');
 const result=patch.toJapanese(root,'g',game,host,'RealLive');assert.equal(result.issue,'');
 assert.equal(fs.existsSync(scenario+patch.SUFFIX),false);
 assert.equal(fs.readFileSync(dll,'utf8'),'translation runtime');assert.equal(fs.readFileSync(payload,'utf8'),'translation payload');
 patch.toTranslated(root,'g',game);assert.equal(fs.readFileSync(host,'utf8'),'MZ\0TextPatch.DLL\0');
});
test('a mixed patch replaces script bytes and leaves host-specific DLL bytes untouched',t=>{
 const {root,game,write}=fixture(t),host=write('play_sc.exe','MZ\0Xlat.DLL\0');
 const dll=write('xlat.dll','translation runtime'),script=write('seen.txt','patched');
 write('gameexe.ini','configuration');write('old-files/RealLive.exe','original');
 write('old-files/SEEN.TXT','Japanese');write('old-files/GAMEEXE.INI','configuration');
 assert.equal(patch.detect(game,host,'RealLive').kind,'mixed');
 patch.toJapanese(root,'g',game,host,'RealLive');assert.equal(fs.readFileSync(script,'utf8'),'Japanese');
 patch.toTranslated(root,'g',game);assert.equal(fs.readFileSync(script,'utf8'),'patched');assert.equal(fs.readFileSync(dll,'utf8'),'translation runtime');
});
test('missing RealLive data and ambiguous backup launchers produce distinct preflight reasons',t=>{
 const {root,game,write}=fixture(t),host=write('launch_sc.exe','translated');
 write('original/RealLive.exe','original');write('original/SEEN.TXT','scenario');write('SEEN.TXT','translated scenario');
 assert.equal(patch.status(root,'g',game,host,'RealLive').issue,'PATCH_ORIGINAL_INCOMPLETE');
 assert.throws(()=>patch.toJapanese(root,'g',game,host,'RealLive'),/PATCH_ORIGINAL_INCOMPLETE/);
 fs.unlinkSync(path.join(game,'original/RealLive.exe'));write('original/alpha.exe','a');write('original/beta.exe','b');
 assert.equal(patch.status(root,'g',game,host).issue,'PATCH_BACKUP_AMBIGUOUS');
 assert.equal(fs.existsSync(path.join(game,'SEEN.TXT'+patch.SUFFIX)),false);
});
test('a partial copy rolls back the entire switch and leaves no stage files',t=>{
 const {root,game,write}=fixture(t),host=write('run_sc.exe','translated'),data=write('data.pak','patched');
 write('backup/original.exe','original');write('backup/data.pak','Japanese');
 const copy=fs.copyFileSync;
 t.mock.method(fs,'copyFileSync',(src,dst,...args)=>{if(src.endsWith('original.exe')){fs.writeFileSync(dst,'partial');throw Error('fixture copy failure');}return copy(src,dst,...args);});
 assert.throws(()=>patch.toJapanese(root,'g',game,host),/fixture copy failure/);
 assert.equal(fs.readFileSync(data,'utf8'),'patched');
 assert(!fs.readdirSync(game).some(file=>file.includes('.megulit-')));
 assert.equal(patch.status(root,'g',game,host).active,'zh');
});
test('language endpoint restores same-path hosts whose translated EXE is kept in the journal',t=>{
 const {root,game,write}=fixture(t),host=write('play.exe','translated');
 write('archive-original/play.exe','Japanese');write('archive-original/data.pak','Japanese data');write('data.pak','translated data');
 const db=openStore(root);t.closeBeforeCleanup(()=>db.close());
 db.prepare('INSERT INTO games(id,title,executable,original) VALUES(?,?,?,?)').run('g','Fixture',host,JSON.stringify({library:{dir:game,contentLanguage:'zh'}}));
 const {select}=require('../services/game-language.cjs');
 assert.equal(select(db,'g','ja',null,root).current,'ja');
 assert.equal(select(db,'g','ja',null,root).notice,'ALREADY_JAPANESE');
 assert.equal(select(db,'g','zh',null,root).current,'zh');
 assert.equal(fs.readFileSync(host,'utf8'),'translated');
});
test('native readiness separates nonzero locale exit, clean launcher exit and an invisible game',async()=>{
 const {waitForVisibleGame}=require('../services/game-readiness.cjs'),events=[],opts={attempts:4,sleep:async()=>{},trace:(...v)=>events.push(v)};
 await assert.rejects(waitForVisibleGame(async()=>[],{...opts,helper:true,exit:()=>({code:1})}),/LE_HELPER_FAILED/);
 assert.deepEqual(events[0],['launch-helper-exited',{code:1}]);
 assert.deepEqual(await waitForVisibleGame(async()=>[{pid:12,visible:true}],{...opts,helper:true,exit:()=>({code:0})}),{pid:12});
 await assert.rejects(waitForVisibleGame(async()=>[{pid:12,visible:false}],opts),/GAME_WINDOW_NOT_READY/);
 await assert.rejects(waitForVisibleGame(async()=>[],{...opts,exit:()=>({code:0})}),/GAME_PROCESS_EXITED/);
});
test('elevation manifests are detected in preflight without modifying either launch program',async t=>{
 const {root,write}=fixture(t),exe=write('engine.exe','fixture');
 write('engine.exe.manifest',Buffer.from('<assembly><requestedExecutionLevel level="requireAdministrator" /></assembly>','utf16le'));
 const {requiresAdministrator}=require('../services/locale-launch.cjs');
 assert.equal(requiresAdministrator(exe),true);
 const other=write('other.exe','fixture');write('other.exe.manifest','<requestedExecutionLevel level="asInvoker" />');
 assert.equal(requiresAdministrator(other),false);
 const {detail}=require('../services/game-detail.cjs'),db=openStore(root);t.closeBeforeCleanup(()=>db.close());
 db.prepare('INSERT INTO games(id,title,executable) VALUES(?,?,?)').run('g','Fixture',exe);
 assert.equal(detail(db,root,'g','zh').launchIssue,'GAME_ELEVATION_REQUIRED');
});
test('free Edge uses the current endpoint and does not request a token',async()=>{
 const {machineTranslate}=require('../core/engines.cjs');
 const value=await machineTranslate('microsoft','原文','',async(url,opt)=>{
  assert.equal(new URL(url).pathname,'/translate/translatetext');
  assert.equal(new URL(url).searchParams.get('to'),'zh-Hans');
  assert.deepEqual(JSON.parse(opt.body),['原文']);assert.equal(opt.headers.Authorization,undefined);
  return {ok:true,json:async()=>[{translations:[{text:'译文'}]}]};
 });
 assert.equal(value,'译文');
});
test('all free consumers share cooldown, fallback and success-only caching',async()=>{
 const {translateFree,createTranslator}=require('../core/translate.cjs'),calls=[];
 const fetcher=async url=>{
  const host=new URL(url).hostname;calls.push(host);
  if(host==='translate.googleapis.com')return {ok:false,status:429,headers:new Headers({'Retry-After':'120'})};
  return {ok:true,json:async()=>[{translations:[{text:'译文'}]}]};
 };
 const reader=createTranslator(fetcher);
 assert.equal(await reader('日本語'), '译文');
 assert.equal(await reader('日本語'), '译文');
 assert.equal(await translateFree('Review',{fetcher,source:'en',target:'zh-CN'}),'译文');
 assert.deepEqual(calls,['translate.googleapis.com','edge.microsoft.com','edge.microsoft.com']);
 const fail=async()=>({ok:false,status:404});
 await assert.rejects(translateFree('same',{fetcher:fail}),/TRANSLATION_HTTP_404/);
 await assert.rejects(translateFree('same',{fetcher:fail}),/TRANSLATION_HTTP_404/);
});
test('synopsis retries its missing target and never caches untranslated source as a Chinese success',async t=>{
 const {root}=fixture(t),{Synopses}=require('../core/library.cjs');let available=false;
 const s=new Synopses({config:root},{lookup:async()=>({text:'Original synopsis'}),bangumi:async()=>null,translate:async(text,target)=>available&&target==='zh'?'这是作品简介':text});
 assert.equal((await s.get({mediaId:1,lang:'zh'})).lang,'en');assert.equal(s.read()['1'].zh,undefined);
 available=true;const entry=s.read()['1'];entry.at-=601000;s.write('1',entry);
 assert.equal((await s.get({mediaId:1,lang:'zh'})).text,'这是作品简介');
});
test('legacy ID, moved install and changed executable preserve one existing set of reading rows',t=>{
 const {root,game,write}=fixture(t),exe=write('original/reader.exe','first binary');
 const {reconcile,activeGameForProgram}=require('../services/library.cjs');
 reconcile(root,[{mediaId:27,title:'Fixture Novel',exe,dir:path.dirname(exe),engine:'Fixture',vndbId:'v9001'}]);
 let db=openStore(root);
 db.prepare('INSERT INTO reading_sessions(game_id,started_at,active_seconds) VALUES(?,?,?)').run('game-27',1,90);
 db.prepare('INSERT INTO reading_events(game_id,text,read_at) VALUES(?,?,?)').run('game-27','過去',2);
 db.prepare('UPDATE games SET removed_at=3 WHERE id=?').run('game-27');db.close();
 const moved=write('moved/jp.exe','first binary');fs.unlinkSync(exe);
 reconcile(root,[{title:'Fixture Novel',exe:moved,dir:path.dirname(moved),engine:'Fixture'}]);
 const variant=write('moved/chs.exe','second binary');
 reconcile(root,[{title:'Fixture Novel',exe:variant,dir:path.dirname(variant),engine:'Fixture',vndbId:'v9001',variants:[{exe:moved}]}]);
 db=openStore(root);t.closeBeforeCleanup(()=>db.close());
 assert.equal(db.prepare('SELECT COUNT(*) n FROM games').get().n,1);
 assert.equal(activeGameForProgram(db,moved).id,'game-27');
 assert.equal(activeGameForProgram(db,variant).legacy_id,27);
 assert.equal(db.prepare('SELECT active_seconds FROM reading_sessions WHERE game_id=?').get('game-27').active_seconds,90);
 assert.equal(db.prepare('SELECT text FROM reading_events WHERE game_id=?').get('game-27').text,'過去');
});

test('standalone language siblings override stale duplicate slots and skip backup switching',t=>{
 const {root,game,write}=fixture(t);
 const original=write('SnowNovel.EXE','original'),chinese=write('SnowNovel_ChS.exe','translated');
 write('SnowNovel_chspatch_v2.00.exe','patch installer');
 write('archive-original/SnowNovel.EXE','old original');write('archive-original/data.pak','old data');
 const data=write('data.pak','current data'),db=openStore(root);t.closeBeforeCleanup(()=>db.close());
 db.prepare('INSERT INTO games(id,title,executable,original) VALUES(?,?,?,?)').run('g','Fixture',original,JSON.stringify({library:{dir:game,contentLanguage:'zh',languageExecutables:{ja:original,zh:original}}}));
 const {inspect,select}=require('../services/game-language.cjs');
 assert.deepEqual(inspect(db,'g',root).versions,{ja:original,zh:chinese});
 assert.equal(inspect(db,'g',root).current,'ja');
 assert.equal(inspect(db,'g',root).swap,null);
 assert.equal(select(db,'g','zh',null,root).executable,chinese);
 assert.equal(select(db,'g','ja',null,root).executable,original);
 assert.equal(fs.readFileSync(data,'utf8'),'current data');
 assert(!fs.existsSync(path.join(root,'data/config/patch-swap.json')));
});
test('launcher classification handles regional suffixes, excludes installers, and skips unrelated launcher families',t=>{
 const {root,game,write}=fixture(t),original=write('Spring.exe','original'),db=openStore(root);t.closeBeforeCleanup(()=>db.close());
 const other=write('Other-zh-CN.EXE','separate game');
 const helper=write('Spring_chspatch_v2.00.exe','patch installer');
 db.prepare('INSERT INTO games(id,title,executable,original) VALUES(?,?,?,?)').run('g','Fixture',original,JSON.stringify({library:{dir:game,languageExecutables:{zh:helper}}}));
 const {inspect,select}=require('../services/game-language.cjs');
 assert.equal(inspect(db,'g',root).versions.zh,undefined);
 assert.throws(()=>select(db,'g','ja',other,root),/INVALID_EXECUTABLE/);
 const chinese=write('Spring.zh-CN.EXE','translated');
 assert.deepEqual(inspect(db,'g',root).versions,{ja:original,zh:chinese});
});
test('automatic original selection repairs a saved versioned updater using its exact sibling',t=>{
 const {root,game,write}=fixture(t),db=openStore(root);t.closeBeforeCleanup(()=>db.close());
 const updater=write('NovelUpdata1.01.exe','updater'),original=write('NOVEL.EXE','original');
 write('backup/NOVEL.EXE','old');write('Novel_JP.exe','different build');
 const insert=db.prepare('INSERT INTO games(id,title,executable,source,original) VALUES(?,?,?,?,?)');
 const data=JSON.stringify({library:{dir:game,originalExecutableVerified:true}});
 insert.run('g','Fixture',updater,'manual',data);
 const {originalExecutable}=require('../services/game-language.cjs');
 assert.equal(originalExecutable(db,'g',root).blocked,true);
 assert.equal(originalExecutable(db,'g',root,'find').executable,original);
 assert.equal(db.prepare('SELECT executable FROM games WHERE id=?').get('g').executable,original);
 const unrelated=write('UnrelatedUpdata1.01.exe','updater');
 write('べつの作品.exe','unrelated game');write('べつの作品.cf','its companion');
 insert.run('missing','Fixture',unrelated,'manual',data);
 assert.throws(()=>originalExecutable(db,'missing',root,'find'),/JAPANESE_EXECUTABLE_REQUIRED/);
 for(const language of ['zh','en']){
  insert.run(language,'Fixture',updater,'manual',JSON.stringify({library:{dir:game,contentLanguage:language}}));
  assert.throws(()=>originalExecutable(db,language,root,'find'),/JAPANESE_EXECUTABLE_REQUIRED/);
  assert.equal(db.prepare('SELECT executable FROM games WHERE id=?').get(language).executable,updater);
 }
 write('AliceStart.ini','GameName = "示例汉化版"');
 insert.run('patch','Fixture',updater,'manual',data);
 assert.throws(()=>originalExecutable(db,'patch',root,'find'),/JAPANESE_EXECUTABLE_REQUIRED/);
});
test('automatic updater recovery preserves an old entry in a translated folder with no language setting',t=>{
 const {root,write}=fixture(t),db=openStore(root);t.closeBeforeCleanup(()=>db.close());
 const {originalExecutable}=require('../services/game-language.cjs');
 const insert=db.prepare('INSERT INTO games(id,title,executable,source,original) VALUES(?,?,?,?,?)');
 const record=db.prepare('SELECT executable,original FROM games WHERE id=?');
 for(const folder of ['Novel-en','Novel-汉化']){
  const exe=write(folder+'/NovelUpdata1.01.exe','updater');
  write(folder+'/Novel.exe','translated game');
  const original=JSON.stringify({library:{dir:path.dirname(exe)}});
  insert.run(folder,'Fixture',exe,'manual',original);
  assert.throws(()=>originalExecutable(db,folder,root,'find'),/JAPANESE_EXECUTABLE_REQUIRED/);
  assert.deepEqual({...record.get(folder)},{executable:exe,original});
 }
});
test('automatic updater recovery follows the existing translation-launcher check',t=>{
 const {root,write}=fixture(t),db=openStore(root);t.closeBeforeCleanup(()=>db.close());
 const {originalExecutable}=require('../services/game-language.cjs');
 const insert=db.prepare('INSERT INTO games(id,title,executable,source,original) VALUES(?,?,?,?,?)');
 const record=db.prepare('SELECT executable,original FROM games WHERE id=?');
 const exe=write('marked/白昼恋歌Updata1.01.exe','updater');
 write('marked/白昼恋歌.exe','translated game');
 write('marked/title_cn.dll','translation marker');
 const original=JSON.stringify({library:{dir:path.dirname(exe)}});
 insert.run('marked','Fixture',exe,'manual',original);
 assert.throws(()=>originalExecutable(db,'marked',root,'find'),/JAPANESE_EXECUTABLE_REQUIRED/);
 assert.deepEqual({...record.get('marked')},{executable:exe,original});

 const cleanUpdater=write('clear/白昼恋歌Updata1.01.exe','updater');
 const cleanGame=write('clear/白昼恋歌.exe','original game');
 insert.run('clear','Fixture',cleanUpdater,'manual',JSON.stringify({library:{dir:path.dirname(cleanUpdater)}}));
 assert.equal(originalExecutable(db,'clear',root,'find').executable,cleanGame);
});
