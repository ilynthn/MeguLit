// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 群友 report on 1.4.26 (京梅's scenes, 「全自动：自动读台词、同步原文样式、替换原文」 on): 「会设置的颜色跟原文颜色变来变去」 — the reader
   showed a line in the colour the user had picked (red), then switched it to the game's white while the same line was on screen, and
   「不隐藏原文这个文字颜色还是会跟着原文的颜色变」. Rule: a colour the user picked paints every line; only without one, with 同步原文样式 on,
   a line follows the game's colour. The game's colour is still learned for 分角色. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {HookNative}=require('../core/hook-native.cjs');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

function fixture(t,prefs={}){
 t.mock.timers.enable({apis:['setTimeout']});
 const classes=new Set(),vars=new Map(),learned=[];
 const preferences={textColor:'#ff2020',readTextColor:'',autoGameStyle:true,...prefs};
 const document={documentElement:{style:{setProperty:(k,v)=>vars.set(k,v),removeProperty:k=>vars.delete(k)}},head:{append(){}},
  body:{classList:{toggle(c,on){on?classes.add(c):classes.delete(c);},contains:c=>classes.has(c)}},
  querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({}),addEventListener(){}};
 const b={galStatus(){},galPreferences:()=>preferences,galLayoutInfo:()=>({clientWidth:1280,clientHeight:720}),previewGalPosition(){}};
 const window={__tomoyoChinese:b,devicePixelRatio:1,__tomoyoTranslateRequest(){}};
 const ctx={window,document,MutationObserver:class{observe(){}},getComputedStyle:()=>({getPropertyValue:()=>'',fontSize:'28px'}),Date,setTimeout,clearTimeout};
 vm.createContext(ctx);
 vm.runInContext(read('web/reader/modules/game-style.js'),ctx);window.TomoyoGameStyle=ctx.TomoyoGameStyle;
 vm.runInContext(read('web/reader/modules/speaker-colors.js'),ctx);window.MeguLitSpeakerColors=ctx.MeguLitSpeakerColors;
 let user={};b.speakerColorsLearn=(name,color)=>learned.push([name,color]);b.speakerColorsOverride=name=>user[name]||'';
 for(const f of ['island-source','hook-reader','text-position'])vm.runInContext(read('web/reader/modules/'+f+'.js'),ctx);
 let now=100000;
 const route=m=>{if(m.type==='hookTextPos')b.textPosition(m);else b.galStatus(m);};
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-color-fixture-log'},route,()=>{},()=>now);
 hook.trace=()=>{};hook.send=()=>{};t.after(()=>hook.stop());
 const box={nvl:false,same:false,x0:120,y0:540,x1:1000,y1:540,size:28,sw:1280,sh:720,count:0};
 /* the colour the line is shown in: the per-line colour when one is set, else the paint from the settings (gal.js --tomoyo-gal-color) */
 const shown=()=>classes.has('tome-line-color')?vars.get('--tomoyo-gal-line-color'):ctx.TomoyoGameStyle.paintFor(ctx.TomoyoGameStyle.clean(preferences),false,'').color;
 return {b,preferences,learned,shown,setUser:(n,c)=>{user={...user,[n]:c};},
  source(text){now+=1000;hook.source({text,sourceName:'KiriKiriZ',origin:'live'},'');},
  draw(line,color,phase='begin'){hook.pageLine({type:'hookEngineLine',engine:'krkr',line,phase,...box,...(color?{color}:{})});},
  /* the glyph colour of a line the hide layer blanked (core/hook-native.cjs glyphColor), matched by text */
  glyph(text,fill){b.lineStyleSample({text,style:{fill,alpha:1}});}};
}

const LINE='京梅「そういうこと言ってると、寮長権限で休日外出禁止にしちゃいますから」',NEXT='小鳩「うわっ！　オーボー！」';

test('a colour the user picked stays on the line while the game draws it white (draw call and hidden-glyph sample)',t=>{
 const f=fixture(t,{colorSource:'user'});
 f.source(LINE);assert.equal(f.shown(),'#ff2020','the line starts in the user colour');
 f.draw(1,'#ffffff');assert.equal(f.shown(),'#ff2020','the engine draw call does not repaint it');
 f.draw(1,'#ffffff','end');assert.equal(f.shown(),'#ff2020','nor the end of the draw');
 f.glyph(LINE,'#ffffff');assert.equal(f.shown(),'#ff2020','nor the colour of the hidden glyphs');
 f.source(NEXT);f.glyph(NEXT,'#ffffff');f.draw(2,'#ffffff');f.draw(2,'#ffffff','end');
 assert.equal(f.shown(),'#ff2020','the next line too: no switching between the two colours');
});

test('the user colour holds with hiding off as well (the game colour arrives as pixels of the visible text)',t=>{
 const f=fixture(t,{colorSource:'user',hookHide:false});
 f.source(NEXT);f.b.lineColorDrawn(NEXT,'#f0f0f0',null);assert.equal(f.shown(),'#ff2020');
});

test('the game colour is still learned for 分角色, and a colour picked for one speaker wins over the general one',t=>{
 const f=fixture(t,{colorSource:'user'});
 f.source(LINE);f.draw(1,'#ffeeaa');f.draw(1,'#ffeeaa','end');
 assert.deepEqual(f.learned.at(-1),['京梅','#ffeeaa'],'the game colour for 京梅 is learned while the user colour is shown');
 assert.equal(f.shown(),'#ff2020');
 f.setUser('京梅','#40a0ff');f.b.lineColorRepaint();assert.equal(f.shown(),'#40a0ff');
});

test('without a colour the user picked, 同步原文样式 follows the game (unchanged)',t=>{
 const f=fixture(t,{textColor:'#fffaf2'});
 f.source(LINE);f.draw(1,'#ffeeaa');f.draw(1,'#ffeeaa','end');assert.equal(f.shown(),'#ffeeaa');
 f.source(NEXT);f.glyph(NEXT,'#d0e0ff');assert.equal(f.shown(),'#d0e0ff');
});

test('with 同步原文样式 off the saved colour applies',t=>{
 const off=fixture(t,{textColor:'#fffaf2',autoGameStyle:false});
 off.source(LINE);off.draw(1,'#ffeeaa');off.draw(1,'#ffeeaa','end');assert.equal(off.shown(),'#fffaf2');
});

for(const file of ['web/reader/modules/game-style.js','core/game-style.js']){
 test(file+': colorSource is kept only as "user" and stops the engine colour',()=>{
  const style=require('../'+file);
  assert.equal(style.clean({colorSource:'user'}).colorSource,'user');
  assert.equal(style.clean({colorSource:'game'}).colorSource,'');
  assert.equal(style.clean({}).colorSource,'');
  assert.equal(style.lineColor(style.clean({colorSource:'user'}),'「台詞」','#ffffff'),'');
  assert.equal(style.lineColor(style.clean({}),'「台詞」','#ffffff'),'#ffffff');
  assert.equal(style.paintFor(style.clean({textColor:'#ff2020',colorSource:'user'}),false,'#ffffff').color,'#ff2020');
  assert.equal(style.paintFor(style.clean({textColor:'#ff2020'}),false,'#ffffff').color,'#ffffff');
 });
}

test('the mark travels with a work\'s settings and the home settings set it when a text colour is saved',t=>{
 const profile=require('../core/game-profile.js'),web=require('../web/reader/modules/game-profile.js');
 assert.equal(profile.pick({colorSource:'user'},'text').colorSource,'user');
 assert.equal(web.pick({colorSource:'user'},'text').colorSource,'user');
 const {Settings}=require('../services/settings.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-colour-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const s=new Settings(dir);
 s.save({scope:'text',values:{typewriter:false}});assert.equal(s.read('text').colorSource,'','another text setting does not mark the colour');
 s.save({scope:'text',values:{textColor:'#ff2020'}});
 assert.equal(s.read('text').colorSource,'user');assert.equal(s.read('text').textColor,'#ff2020');
 const key='b'.repeat(64);
 fs.writeFileSync(path.join(s.folder,'game-style-profiles.json'),JSON.stringify({version:3,entries:{[key]:{name:'x',savedAt:1,textSavedAt:1,prefs:{textColor:'#ffffff'}}}}));
 assert.equal(s.read('text',key).colorSource,'user','a work without its own mark follows the global one');
 s.save({scope:'text',profile:key,values:{readTextColor:'#a0a0ff'}});
 assert.equal(s.read('text',key).colorSource,'user');
});

test('Alt+T: a colour changed in the menu is marked as the user\'s; an automatic measurement keeps it, a sync the user starts hands it back',()=>{
 const flat=f=>require('./flat-source.cjs')(path.join(root,f));
 const gal=flat('web/reader/modules/gal.js');
 assert.match(gal,/const current = \(\) => \{ const form = currentForm\(\); return colourPicked\(form\) \? appearance\.clean\(\{ \.\.\.form, colorSource:'user' \}\) : form; \};/);
 assert.match(gal,/const colourKeys = \['textColor','textGradient',/);
 const sync=flat('web/reader/modules/game-style-sync-ui.js');
 assert.match(sync,/if\(m\.gameStyleAutomatic===true&&b\.galPreferences\(\)\.colorSource==='user'\)\{for\(const k of \['textColor','readTextColor',[^\]]*\]\)delete out\[k\];\}\s*else if\(m\.gameStyleAutomatic!==true\)out\.colorSource='';/);
});

test('隐藏原文: the 整块底板颜色 row that changed nothing is gone (maskMode "full" never survives clean)',()=>{
 for(const file of ['web/reader/modules/game-style.js','core/game-style.js'])assert.equal(require('../'+file).clean({maskMode:'full'}).maskMode,'hook');
 const gal=read('web/reader/modules/gal.js');
 assert.doesNotMatch(gal,/整块底板颜色|galMaskColor|data-gal-full-color|tomoyo-gal-mask\b/);
 assert.doesNotMatch(read('web/reader/modules/menu-layout.js'),/data-gal-full-color/);
});
