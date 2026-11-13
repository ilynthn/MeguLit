// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14 日文原版与语言环境 dialog (ダストマニア・グロテスク, BRUNS): buttons were dead and then fired all at once (the patch
   search held the one service thread), and the Chinese launcher exe was rejected as the wrong file. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.join(__dirname,'..');
const kit=require('../services/original-engines/kit.cjs');
const tmp=prefix=>fs.mkdtempSync(path.join(os.tmpdir(),prefix));

const JA=['「おはよう、千春ちゃん」','今日はとても良い天気だね。','わたしはここで待っているよ。','「ねえ、どこへ行くの？」','それは秘密だよ。','雨が降りそうだから傘を持っていこう。','この本はとても面白かった。','明日もまた会えるといいな。','「ありがとう、助かったよ」','ゆっくり休んでください。'];
/* Chinese written with characters Shift-JIS has (the test encodes every scene the same way) */
const ZH=['「早上好，千春」','今天天気真好。','我在此等候。','「要去何処？」','那是秘密。','好像要下雨了，帯上傘。','這本書非常有趣。','希望明天也能見面。','「謝謝，幇大忙了」','請好好休息。'];
const scene=lines=>kit.encodeSjis(lines.map(t=>'(a3:send-string "'+t+'$N" n)\n(a3:send-string wait-w)\n').join(''));
function game(dir,lines){fs.mkdirSync(path.join(dir,'scene'),{recursive:true});fs.writeFileSync(path.join(dir,'gameplay.exe'),Buffer.from('MZ game'));
 for(let i=0;i<3;i++)fs.writeFileSync(path.join(dir,'scene','bruns010'+i+'.bso'),scene(lines.map(t=>t.replace(/。|$/,String(i)+'$&'))));return path.join(dir,'gameplay.exe');}
function library(exe){const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at TEXT)');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('1',exe);return db;}

test('a Chinese launcher beside the Japanese game is kept and explained, not called the wrong file',()=>{
 const ot=require('../services/original-text.cjs'),dir=tmp('bruns-'),exe=game(dir,JA),db=library(exe),data=tmp('ot-');
 fs.writeFileSync(path.join(dir,'解体插入新书中文版.exe'),Buffer.concat([Buffer.from('MZ'),require('node:crypto').randomBytes(4096)]));
 const s=ot.status(data,db,'1');assert.strictEqual(s.engine||s.runtime?.engine,'bruns');assert.strictEqual(s.status,'native-japanese');
 assert.throws(()=>ot.importPatch(data,db,'1',path.join(dir,'解体插入新书中文版.exe')),/PATCH_PACKED_LAUNCHER/);
 assert.match(ot.status(data,db,'1').patchLauncher?.file||'',/中文版\.exe$/);
 assert.throws(()=>ot.importPatch(data,db,'1',dir),/PATCH_IS_RUNNING_COPY/);
 assert.throws(()=>ot.importPatch(data,db,'1',path.join(dir,'scene','bruns0100.bso')),/PATCH_SAME_AS_RUNNING/);
});

test('a launcher exe picked in a patched copy stands for its folder, scene\\ included',()=>{
 const ot=require('../services/original-text.cjs'),base=tmp('bruns-'),exe=game(path.join(base,'ja'),JA),db=library(exe),data=tmp('ot-');
 game(path.join(base,'zh'),ZH);fs.writeFileSync(path.join(base,'zh','中文版.exe'),Buffer.from('MZ launcher'));
 const r=ot.importPatch(data,db,'1',path.join(base,'zh','中文版.exe'));
 assert.ok(r.patch&&r.patch.lines>0,JSON.stringify(r.patch));
});

test('script work runs in a worker thread; the service thread stays free',async()=>{
 const off=require('../services/text-source-worker.cjs'),dir=tmp('bruns-'),exe=game(dir,JA),data=tmp('ws-');
 const db=require('../services/store.cjs').openStore(data);try{db.prepare("INSERT INTO games(id,title,executable) VALUES('w1','t',?)").run(exe);}finally{db.close();}
 let ticks=0;const timer=setInterval(()=>ticks++,5);
 const s=await off.run(data,'status',['w1']);clearInterval(timer);
 assert.strictEqual(s.status,'native-japanese');assert.ok(ticks>0,'event loop kept running while the worker read the script');
 await assert.rejects(off.run(data,'nope',[]),/INVALID_TEXT_SOURCE_TASK/);
 const bridge=fs.readFileSync(path.join(root,'services/bridge.cjs'),'utf8'),ot=fs.readFileSync(path.join(root,'services/original-text.cjs'),'utf8');
 assert.match(bridge,/text-source-worker\.cjs'\)\.run\(root,'status',\[id\]\)/);assert.match(bridge,/off\.run\(root,'importPatch',\[id,dir\]\)/);
 assert.match(ot,/function autoPatchLater[^]*?text-source-worker\.cjs'\)\.run\(root,'autoPatch'/);
});

test('dialog: opens once, buttons go busy on the click and drop clicks while busy',()=>{
 const ui=fs.readFileSync(path.join(root,'web/game-language.js'),'utf8').replace(/\r\n/g,'\n');
 assert.match(ui,/if\(openDialog\)return;/,'a second open while one is up is ignored');
 assert.ok(ui.indexOf('dialog.showModal()')<ui.indexOf("await api('game_original_executable',{id})"),'the dialog shows before the service answers');
 assert.match(ui,/const once=fn=>async\(\)=>\{if\(working\)return;busy\(true\)/);
 for(const b of ['patchBtn','originalBtn','searchBtn','clearBtn'])assert.match(ui,new RegExp(b+'\\.onclick=once\\('));
 assert.match(ui,/async function save\(mode\)\{\n  if\(working\)return;setBusy\(true\)/);
 for(const lang of ['zh','en','ja']){const block=ui.slice(ui.indexOf('\n '+lang+':{'),ui.indexOf("},failed:",ui.indexOf('\n '+lang+':{')));assert.match(block,/launcher:\(f,h\)=>/,lang);assert.match(block,/PATCH_PACKED_LAUNCHER:/,lang);}
});

/* 2026-11-14 same game, launch with 以日文系统环境启动: the first lines arrived as Shift-JIS read with the Chinese code page
   (僙乕僽丄…), the notice called the script Chinese, and 日文原版恢复 said no Japanese script was found. */
const MISREAD=['偙偺儊僢僙乕僕偼弶夞婲摦帪偺傒昞帵偝傟傑偡丅','墦偔偱彫偝偔丄儌乕僞乕壒偑偟偰偄傞偙偲偵婥偑偮偄偨丅','娐嫬愝掕偺乽僇乕僜儖堏摦惂尷乿傪乽偡傞乿偵愝掕偟偰偍偔偲','僙乕僽丄儘乕僪丄娐嫬愝掕側偳偺僔僗僥儉儊僯儏乕偼'];
const SIMPLIFIED=['这是一个中文句子的测试内容。','我们今天要去学校上课了。','他说这个问题很难解决。','请把门关上，外面风很大。'];
test('Shift-JIS read as GBK is decoded back; real Chinese is left alone',()=>{
 const {HookNative}=require('../core/hook-native.cjs');
 assert.strictEqual(HookNative.sjisAsGbk(MISREAD[0]),'このメッセージは初回起動時のみ表示されます。');
 assert.strictEqual(HookNative.sjisAsGbk(MISREAD[1]),'遠くで小さく、モーター音がしていることに気がついた。');
 for(const t of SIMPLIFIED)assert.strictEqual(HookNative.sjisAsGbk(t),'',t);
});
test('launch notice: misread Japanese or a known Japanese install never says the script is Chinese',()=>{
 const {HookNative}=require('../core/hook-native.cjs');
 const run=(lines,known)=>{const events=[];const h=new HookNative({native:os.tmpdir(),hook:os.tmpdir()},e=>events.push(e));h.japaneseInstall=known;for(const t of lines)h.languageCheck(t);return events.some(e=>e.sourceChinese===true);};
 assert.strictEqual(run(MISREAD,null),false,'misread Japanese');
 assert.strictEqual(run(SIMPLIFIED,null),true,'a Chinese build is still reported');
 assert.strictEqual(run(SIMPLIFIED,true),false,'the shared check knows this install has Japanese');
 const src=fs.readFileSync(path.join(root,'core/hook-native.cjs'),'utf8');assert.match(src,/const ja=HookNative\.sjisAsGbk\(m\.text\);if\(ja\)/,'the line itself is decoded again');
 assert.match(fs.readFileSync(path.join(root,'services/reader.cjs'),'utf8'),/hooks\.japaneseInstall=game\?\.id\?require\('\.\/japanese-presence\.cjs'\)\.verdict/);
});
test('one shared "has Japanese" answer: script state, captured history, else undecided',()=>{
 const p=require('../services/japanese-presence.cjs'),data=tmp('jp-');
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE reading_events(id INTEGER PRIMARY KEY,game_id TEXT,text TEXT)');
 assert.deepStrictEqual(p.verdict(data,db,'g'),{japanese:null,by:''});
 const ins=db.prepare('INSERT INTO reading_events(game_id,text) VALUES(?,?)');for(const t of SIMPLIFIED)ins.run('g',t);ins.run('g','这本书非常有趣。');
 assert.strictEqual(p.verdict(data,db,'g').japanese,null,'Chinese history does not decide yes');
 for(const t of JA)ins.run('g',t);assert.deepStrictEqual(p.verdict(data,db,'g'),{japanese:true,by:'history'});
 fs.mkdirSync(path.join(data,'data','config'),{recursive:true});fs.writeFileSync(path.join(data,'data','config','original-text.json'),JSON.stringify({h:{status:'native-japanese'},c:{status:'chinese-only'}}));
 assert.deepStrictEqual(p.verdict(data,db,'h'),{japanese:true,by:'script'});assert.strictEqual(p.verdict(data,db,'c').japanese,false);
 const bridge=fs.readFileSync(path.join(root,'services/bridge.cjs'),'utf8'),app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
 assert.match(bridge,/japanese-presence\.cjs'\)\.verdict\(root,db,id\);if\(v\.japanese===true\)return \{state:'already',by:v\.by,executable:row\.executable\}/);
 for(const w of ['已是日文原版，不需要恢复','Already the Japanese original','すでに日本語版です'])assert.ok(app.includes(w),w);
});
