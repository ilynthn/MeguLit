// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Font probe (user 2026-11-13: 自动读内存来导入游戏字体) and "the game's own font comes first" (font-follow migration).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

function fakeDb(){const meta=new Map();return {meta,prepare(sql){return {get:k=>meta.has(k)?{value:meta.get(k)}:undefined,run:(k,v)=>{meta.set(k,v);}};}};}
function tempRoot(global,profiles){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'font-follow-'));const cfg=path.join(dir,'data','config');fs.mkdirSync(cfg,{recursive:true});
 fs.writeFileSync(path.join(cfg,'gal-preferences.json'),JSON.stringify(global));fs.writeFileSync(path.join(cfg,'game-style-profiles.json'),JSON.stringify(profiles));return {dir,cfg};}

test('font-follow migration resets hand-picked Japanese fonts once, globally and per game (with history)',()=>{
 const {migrateFontFollow}=require('../services/font-follow-migration.cjs');
 const {dir,cfg}=tempRoot({japaneseFont:'yuMincho',chineseFont:'simhei'},{entries:{a:{prefs:{japaneseFont:'meiryo'},history:[{savedAt:1,prefs:{japaneseFont:'notoSerifJP'}}]},b:{prefs:{japaneseFont:'game:0123456789'}}}});
 const db=fakeDb();const first=migrateFontFollow(db,dir);
 assert.deepEqual(first,{global:true,profiles:2});
 const g=JSON.parse(fs.readFileSync(path.join(cfg,'gal-preferences.json'),'utf8')),p=JSON.parse(fs.readFileSync(path.join(cfg,'game-style-profiles.json'),'utf8'));
 assert.equal(g.japaneseFont,'originalGothic');assert.equal(g.japaneseFontSource,'game');assert.equal(g.chineseFont,'simhei');
 assert.equal(p.entries.a.prefs.japaneseFont,'originalGothic');assert.equal(p.entries.a.history[0].prefs.japaneseFont,'originalGothic');
 assert.equal(p.entries.b.prefs.japaneseFont,'game:0123456789');assert.equal(p.entries.b.prefs.japaneseFontSource,'game');
 /* the user picks a font after the migration: a second start must keep it */
 fs.writeFileSync(path.join(cfg,'gal-preferences.json'),JSON.stringify({japaneseFont:'yuGothic',japaneseFontSource:'user'}));
 assert.equal(migrateFontFollow(db,dir),null);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cfg,'gal-preferences.json'),'utf8')),{japaneseFont:'yuGothic',japaneseFontSource:'user'});
 assert.match(read('services/store.cjs'),/font-follow-migration\.cjs'\)\.migrateFontFollow\(db,root\)/);
});

test('japaneseFontSource is kept by clean() and per-game profiles; default follows the game',()=>{
 for(const f of ['../core/game-style.js','../web/reader/modules/game-style.js']){const gs=require(f);
  assert.equal(gs.clean({}).japaneseFontSource,'game');assert.equal(gs.clean({japaneseFontSource:'user'}).japaneseFontSource,'user');assert.equal(gs.clean({japaneseFontSource:'x'}).japaneseFontSource,'game');}
 for(const f of ['../core/game-profile.js','../web/reader/modules/game-profile.js'])assert.ok(require(f).textKeys.includes('japaneseFontSource'));
});

test('the reader: user choice only after a change in the settings; @game restores; engine report outranks the probe',()=>{
 const r=read('services/reader.cjs');
 assert.match(r,/settings\.japaneseFont==='@game'\)\{settings\.japaneseFont=g\.preferences\.japaneseFont;settings\.japaneseFontSource='game';\}/);
 assert.match(r,/settings\.japaneseFont!==g\.preferences\.japaneseFont\?'user'/);
 assert.match(r,/japaneseFontSource==='user'\)return;this\.applyEngineFont/);
 assert.match(r,/case 'gameFontFollow'/);assert.match(r,/hookFontFile'\)this\.engineFontFile/);
 const {rank,pick}=require('../core/engine-font.cjs');assert.ok(rank({probe:true})<rank({engine:'krkr'}));const {uiFace}=require('../core/engine-font.cjs');assert.ok(uiFace('Segoe UI'));assert.ok(!uiFace('ＭＳ 明朝'));assert.match(r,/message\.probe&&ef\.uiFace\(message\.face\)\)return;/);
 assert.equal(pick({face:'ＭＳ Ｐ明朝',fonts:[{id:'abc',lang:'ja',family:'MS PMincho',names:['MS PMincho','ＭＳ Ｐ明朝']}]}).key,'game:abc');
 const ui=read('web/reader/modules/game-fonts-ui.js');assert.match(ui,/option\('@game'/);assert.match(ui,/type:'gameFontFollow'/);assert.match(ui,/恢复为游戏原字体/);
});

test('GameFonts.addFile imports a font the game loaded itself (memory dump or private file)',()=>{
 const src=['C:/Windows/Fonts/msgothic.ttc','C:/Windows/Fonts/YuGothR.ttc','C:/Windows/Fonts/meiryo.ttc'].find(f=>fs.existsSync(f));if(!src)return;
 const {GameFonts}=require('../core/game-fonts.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gf-'));const changes=[];
 const gf=new GameFonts({config:dir,cache:dir},c=>changes.push(c),async()=>'');gf.current={status:'ready',root:'E:/Games/X',fonts:[]};
 const added=gf.addFile(src,'mem');assert.ok(added.length>=1);assert.equal(added[0].lang,'ja');assert.ok(added[0].names.length>=1);assert.match(added[0].source,/^内存 /);
 assert.equal(changes.length,1);assert.equal(gf.addFile(src,'mem').length,0,'same faces are not added twice');
 assert.ok(gf.payload(false).fonts[0].names.length>=1);
});

test('font probe DLL: hooks, pipe protocol, injection allow-list, bridge parsing and release packaging',()=>{
 const c=read('native/fontprobe/FontProbe.cpp');
 for(const n of ['CreateFontIndirectA','CreateFontA','ExtTextOutW','ExtTextOutA','TextOutW','GetGlyphOutlineW','GetGlyphOutlineA','AddFontMemResourceEx','AddFontResourceExW','AddFontResourceExA','GdipPrivateAddMemoryFont','GdipPrivateAddFontFile','GdipDrawString','DWriteCreateFactory'])assert.ok(c.includes('"'+n+'"'),n);
 assert.match(c,/for \(UINT cp : \{932u, \(UINT\)CP_ACP\}\)/,'ANSI faces decode as CP932 first');assert.match(c,/MeguLitFont-%lu/);
 const hb=read('native/HookBridge.cs');assert.match(hb,/FontProbe\(bit,loader,args\);/);assert.ok(hb.includes(String.raw`^ToMe_FONT src=(gdi|gdip|dwrite) size=(\d{1,4}) weight=(\d{1,4}) chars=(\d+) face=(.{1,64})$`));assert.ok(hb.includes(String.raw`^ToMe_FONTFILE kind=(mem|file) path=(.{4,900})$`));
 assert.match(read('native/HookInjector.cs'),/"MeguLitFont64\.dll"/);assert.match(read('native/HookInjector.cs'),/"MeguLitFont32\.dll"/);
 assert.match(read('Release.ps1'),/'native\/MeguLitFont32\.dll','native\/MeguLitFont64\.dll'/);
});
