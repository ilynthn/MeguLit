// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw, Artemis (core/artemis-draw.lua appended to boot.lua by core/artemis-language.cjs { bilingual }).
   1. always: the block is well-formed Lua 5.1 (luac-free check: the interpreter loads it) and the plan wiring is there;
   2. on this PC, when THE SHELL Part I and the Lua 5.1 interpreter are here: the game's own msg/message.lua, msg/lang.lua and
      image/boot.lua (read from its archives, MeguLit's own archives left out; nothing written to the game), with the E591 "ja"
      lines and the block, run under Lua 5.1 with a stand-in engine:
      - the boot path: get_fontdata("sub01") (the sub window font the game never defined) gives the Chinese face of adv01,
        smaller, no ruby; adv01 itself is unchanged;
      - a real text block (ja with the game's ruby, cn): the adv layer prints the Japanese and the ruby tag, the adv_sub layer
        prints the Chinese, placed under the main text (lyprop top). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const LUA=[process.env.MEGULIT_LUA51,'H:/MeguLit-Work/deps/lua/bin/lua51.exe'].find(p=>p&&fs.existsSync(p));
const SHELL='E:/Steam/steamapps/common/The Shell Part I';
const A=require('../core/artemis-language.cjs');

test('the block loads in Lua 5.1 and the plan wiring is there',{skip:!LUA&&'no Lua 5.1 interpreter'},()=>{
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'megulit-artemis-'));
 const f=path.join(dir,'block.lua');fs.writeFileSync(f,A._internal.drawBlock('cn',0.8));
 const r=spawnSync(LUA,['-e','assert(loadfile(arg and arg[1] or "'+f.replace(/\\/g,'/')+'"))'],{encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,r.stderr);
 const src=fs.readFileSync(path.join(root,'core/artemis-language.cjs'),'utf8');
 assert.ok(src.includes('function plan(gameDir,options={})')&&src.includes('hasTrack(gameDir,set.files,sub)?sub:null'),'no Chinese track or no boot.lua: the Japanese fix alone');
 const jr=fs.readFileSync(path.join(root,'core/japanese-restore.cjs'),'utf8'),br=fs.readFileSync(path.join(root,'services/bridge.cjs'),'utf8');
 assert.ok(jr.includes('artemis().apply(gameDir,{bilingual:options.bilingual})')&&br.includes("lsOptions.bilingual='cn'"),'the game diff (draw.embed) asks for it through 日文原版恢复');
 assert.ok(!A._internal.drawBlock('tw',0.75).includes('@SUB@')&&A._internal.drawBlock('tw',0.75).includes('local MEGULIT_SUB   = "tw"'));
});

const HARNESS=String.raw`
local out = {}
local function emit(s) io.write(s, "\n") end
local cur, vars = "none", {}
e = {}
function e:tag(t)
	if type(t) ~= "table" then return end
	local n = t[1]
	if n == "chgmsg" then cur = t.id
	elseif n == "/chgmsg" then cur = "none"
	elseif n == "print" then emit("PRINT\t"..cur.."\t"..tostring(t.data))
	elseif n == "ruby" then emit("RUBY\t"..cur.."\t"..tostring(t.text))
	elseif n == "font" then emit("FONTTAG\t"..cur.."\t"..tostring(t.face).."\t"..tostring(t.size))
	elseif n == "lyprop" then emit("LYPROP\t"..tostring(t.id).."\t"..tostring(t.top))
	elseif n == "var" and t.system == "get_message_layer_height" then vars[t.name] = 46
	end
end
function e:var(n) return vars[n] end
function e:debug() end
function e:include() end
function e:isFileExists() return false end
tag = function(t) e:tag(t) end
estag = function(t)
	if type(t) == "table" and type(t[1]) == "string" and type(_G[t[1]]) == "function" then _G[t[1]](t[2])
	elseif type(t) == "table" then e:tag(t) end
end
function tcopy(t) local r = {} for k, v in pairs(t or {}) do r[k] = v end return r end
function tcopy2(t) if type(t) ~= "table" then return nil end local r = {} for k, v in pairs(t) do r[k] = type(v) == "table" and tcopy2(v) or v end return r end
function sysmessage(...) emit("SYSMSG\t"..table.concat({...}, " ")) end
function message() end
tn = tonumber
function getGameMode() return "adv" end
function getAread() return false end
function getNovelData() return nil end
flg, scr, tags = {}, { ip = {} }, {}
conf = { font = 1, language = "ja", mw_aread = 0 }
ex = { fontmodetable = { adv = 0 } }
fonttable = {}
local dir = ...
dofile(dir.."/list_windows.tbl")
dofile(dir.."/list_windows_ja.tbl")
game = { mwid = init.mwid or "1.80" }
init.game_fontdeco = nil
dofile(dir.."/message.lua")
dofile(dir.."/lang.lua")
dofile(dir.."/ui.lua")
dofile(dir.."/boot.lua")
mw_areadfastcheck = function() end
-- the boot path: the sub window's font
local f = get_fontdata("sub01", "adv")
emit("FONT\tsub01\t"..tostring(f and f.face).."\t"..tostring(f and f.size).."\t"..tostring(f and f.rubysize))
local a = get_fontdata("adv01", "adv")
emit("FONT\tadv01\t"..tostring(a and a.face).."\t"..tostring(a and a.size).."\t"..tostring(a and a.rubysize))
emit("SUBLANG\t"..tostring(get_sub_lang()).."\t"..tostring(init.game_sublangview))
-- the boot path itself: setMWFont registers every window font of the message window, the sub one too
local okf, errf = pcall(set_textfont, "sub01", game.mwid..".mw.adv_sub", "adv")
emit("SETFONT\t"..tostring(okf).."\t"..tostring(errf))
-- a text block of the game (ja with ruby, cn)
local block = dofile(dir.."/block.lua")
message_control(block, true)
`;
function luaOf(list,name){const e=list.files.find(f=>f.name.toLowerCase()===name.toLowerCase());return e?e:null;}

test('THE SHELL Part I: the game\'s own Lua with the block: sub font from adv01 in Chinese, Japanese with ruby on adv, Chinese on adv_sub',{skip:(!LUA&&'no Lua 5.1 interpreter')||(!require('./helpers/installed.cjs').installed(SHELL)&&'THE SHELL Part I not on this PC')},()=>{
 const sc=require('../services/original-engines/scenes.cjs');
 const sets=A._internal.archives(SHELL),set=sets.find(s=>s.base==='TheShell.pfs');assert.ok(set);
 /* the game's own archives: those holding a MeguLit mark are left out */
 const want={'system\\msg\\message.lua':'message.lua','system\\msg\\lang.lua':'lang.lua','system\\image\\boot.lua':'boot.lua','system\\table\\list_windows.tbl':'list_windows.tbl','system\\table\\list_windows_ja.tbl':'list_windows_ja.tbl','system\\msg\\ui.lua':'ui.lua'};
 const got={};
 for(const f of set.files){const full=path.join(SHELL,f),list=sc.pfsList(full);if(!list)continue;
  const lua=list.files.filter(e=>/\.lua$/i.test(e.name)).map(e=>sc.pfsRead(full,e,list.key).toString('utf8'));
  if(lua.some(t=>/MeguLit (ja|draw)/.test(t)))continue;
  for(const [n,out] of Object.entries(want)){const e=luaOf(list,n);if(e)got[out]=sc.pfsRead(full,e,list.key);}}
 assert.deepEqual(Object.keys(got).sort(),Object.values(want).sort());
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'megulit-artemis-run-'));
 for(const [n,b] of Object.entries(got)){let data=b;if(/\.lua$/.test(n)){const p=A._internal.patchLua(b);if(p)data=p.data;}
  if(n==='boot.lua')data=Buffer.concat([data,Buffer.from('\n'+A._internal.drawBlock('cn',0.8),'utf8')]);fs.writeFileSync(path.join(dir,n),data);}
 /* a real block of the game: 0001_00006 (ja with the game's ruby, cn) */
 fs.writeFileSync(path.join(dir,'block.lua'),'return { ja = { { "礼拝堂の役割も果たす、私立", {"ruby", text="おうば"}, "櫻羽", {"/ruby"}, "女学院の講堂。" } }, cn = { { "既作为礼拜堂使用的私立樱羽女学院的礼堂。" } } }');
 fs.writeFileSync(path.join(dir,'harness.lua'),HARNESS);
 const r=spawnSync(LUA,[path.join(dir,'harness.lua'),dir.replace(/\\/g,'/')],{encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,r.stderr+r.stdout);
 const lines=r.stdout.replace(/\r/g,'').trim().split('\n').map(l=>l.split('\t'));
 const font=n=>lines.find(l=>l[0]==='FONT'&&l[1]===n);
 assert.deepEqual(font('sub01').slice(2),['font/notoserifsc-semibold.otf','30','0'],'adv01\'s Chinese face (font06 = Noto Serif SC), 80 % size, no ruby');
 assert.deepEqual(font('adv01').slice(2),['font/sourcehanserif-light.otf','38','14'],'the main window font is the game\'s own');
 assert.deepEqual(lines.find(l=>l[0]==='SUBLANG').slice(1),['cn','on']);
 assert.ok(!lines.some(l=>l[0]==='SYSMSG'),'no font error');
 assert.equal(lines.find(l=>l[0]==='SETFONT')[1],'true',"the boot call set_textfont('sub01') runs through (setMWFont registers it at startup): "+lines.find(l=>l[0]==='SETFONT').join(' '));
 assert.ok(lines.some(l=>l[0]==='FONTTAG'&&/adv_sub$/.test(l[1])&&l[2]==='font/notoserifsc-semibold.otf'&&l[3]==='30'),'the sub layer gets the Chinese face');
 const adv=lines.filter(l=>l[0]==='PRINT'&&/adv_adv$/.test(l[1])).map(l=>l[2]).join(''),sub=lines.filter(l=>l[0]==='PRINT'&&/adv_sub$/.test(l[1])).map(l=>l[2]).join('');
 assert.equal(adv,'礼拝堂の役割も果たす、私立櫻羽女学院の講堂。','the Japanese on the main layer');
 assert.ok(lines.some(l=>l[0]==='RUBY'&&/adv_adv$/.test(l[1])&&l[2]==='おうば'),'with the game\'s own ruby');
 assert.equal(sub,'既作为礼拜堂使用的私立樱羽女学院的礼堂。','the Chinese on the sub layer');
 assert.ok(lines.some(l=>l[0]==='LYPROP'&&/adv_sub$/.test(l[1])&&l[2]==='46'),'the sub layer placed under the main text');
 /* control: the same game Lua without the block fails exactly where the plan said it would (the sub font the game never defined) */
 const boot=fs.readFileSync(path.join(dir,'boot.lua'),'utf8');fs.writeFileSync(path.join(dir,'boot.lua'),boot.slice(0,boot.indexOf('-- MeguLit draw')));
 const c=spawnSync(LUA,[path.join(dir,'harness.lua'),dir.replace(/\\/g,'/')],{encoding:'utf8',windowsHide:true});
 const cl=c.stdout.replace(/\r/g,'').split('\n').map(l=>l.split('\t'));
 assert.equal(cl.find(l=>l[0]==='SETFONT')?.[1],'false','without the block set_textfont("sub01") breaks');
});
