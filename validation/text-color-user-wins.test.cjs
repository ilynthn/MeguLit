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
 fs.writeFileSync(path.join(s.folder,'game-style-profiles.json'),JSON.stringify({version:3,entries:{[key]:{name:'x',savedAt:1,textSavedAt:1,prefs:{japaneseSize:30}}}}));
 assert.equal(s.read('text',key).colorSource,'user','a work with no colours of its own shows the global ones, marked');
 s.save({scope:'text',profile:key,values:{readTextColor:'#a0a0ff'}});
 assert.equal(s.read('text',key).colorSource,'user');
});

const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
/* the real reader page in headless Edge (no game, no service): Alt+T opened, fields changed the way a user changes them */
test('Alt+T: picking a text colour marks it as the user\'s; other edits and a calibrated read colour do not',{skip:!hasEdge&&'Edge not installed',timeout:120000},async t=>{
 const http=require('node:http'),{startEdge}=require('./library-views-perf.cjs'),WEB=path.join(root,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json','.webp':'image/webp'};
 const STUB=`<script>try{localStorage.clear();}catch{}window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
  if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};
   if(r.action==='reader_bootstrap')return {engines:[],native:{new_game_tip:false}};if(r.action==='reader_message')return {replies:[]};return {};}return null;}};</script>`;
 const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
  if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}res.writeHead(404);return res.end();}
  let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
  res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-colour-altt-'));const cdp=await startEdge(path.join(temp,'edge'));
 t.after(async()=>{await cdp.stop();server.close();await sleep(300);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}});
 await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
 let ready=false;for(let i=0;i<160&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
 assert.ok(ready,'reader loaded');
 const source=()=>cdp.evaluate('window.__tomoyoChinese.galPreferences().colorSource');
 const edit=(name,value)=>cdp.evaluate(`(()=>{const f=document.querySelector('.tomoyo-cn-dialog [name=${name}]');f.value=${JSON.stringify(value)};f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}));return 1;})()`);
 /* a calibration stored the same colour for read and unread lines (core/game-style-sync.cjs), then the menu is opened */
 await cdp.evaluate(`(()=>{window.__tomoyoMode.set('translation');window.__tomoyoChinese.applyGalPreferences({textColor:'#ffffff',readTextColor:'#ffffff'},{preview:false});window.__tomoyoChinese.openSettings();return 1;})()`);
 await sleep(800);
 assert.equal(await source(),'','nothing picked yet');
 await edit('galJapaneseSize','30');await sleep(100);
 assert.equal(await source(),'','a size change does not mark the colours');
 await edit('galTextColor','#ff2020');await sleep(100);
 assert.equal(await source(),'user','a picked colour does');
 assert.equal(await cdp.evaluate('window.__tomoyoChinese.galPreferences().textColor'),'#ff2020');
});

test('home Settings: saving the whole text form marks the colour only when a colour changed; a work\'s own measured colours are not locked',t=>{
 const {Settings}=require('../services/settings.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-colour-form-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const s=new Settings(dir),form=()=>{const v=s.read('text');return {textColor:v.textColor,readTextColor:v.readTextColor||v.textColor,textGradient:v.textGradient,textGradientTop:v.textGradientTop,textGradientBottom:v.textGradientBottom,textGradientStart:v.textGradientStart,japaneseSize:v.japaneseSize};};
 s.save({scope:'text',values:{...form(),japaneseSize:26}});
 assert.equal(s.read('text').colorSource,'','a size change saved with the whole form, read colour shown as the unread one');
 s.save({scope:'text',values:{...form(),textColor:'#ff2020'}});assert.equal(s.read('text').colorSource,'user');
 const key='c'.repeat(64);
 fs.writeFileSync(path.join(s.folder,'game-style-profiles.json'),JSON.stringify({version:3,entries:{[key]:{name:'x',savedAt:1,textSavedAt:1,prefs:{textColor:'#ffffff'}}}}));
 assert.equal(s.read('text',key).colorSource,'','a work with its own (measured) colour keeps following the game');
 const sa=require('../services/shared-adaptation.cjs');
 const exe=path.join(dir,'game.exe');fs.writeFileSync(exe,'MZ sample');
 const shared=p=>sa.build({fingerprint:sa.fingerprint(exe,'kirikiri'),stream:null,embed:'verified',profile:{textSavedAt:1,prefs:p}})?.layout?.colors||null;
 assert.equal(shared({textColor:'#ffffff'}).textColor,'#ffffff');
 assert.equal(shared({textColor:'#ff2020',colorSource:'user'}),null,'a colour the user picked is not shared as the game\'s');
});

test('Alt+T calibration: an automatic measurement keeps colours the user picked, a sync the user starts hands them back',()=>{
 const sync=require('./flat-source.cjs')(path.join(root,'web/reader/modules/game-style-sync-ui.js'));
 assert.match(sync,/if\(m\.gameStyleAutomatic===true&&b\.galPreferences\(\)\.colorSource==='user'\)\{for\(const k of \['textColor','readTextColor',[^\]]*\]\)delete out\[k\];\}\s*else if\(m\.gameStyleAutomatic!==true\)out\.colorSource='';/);
});

test('隐藏原文: the 整块底板颜色 row that changed nothing is gone with its setting (maskMode "full" never survives clean)',()=>{
 for(const file of ['web/reader/modules/game-style.js','core/game-style.js']){const style=require('../'+file);
  assert.equal(style.clean({maskMode:'full'}).maskMode,'hook');
  assert.equal('maskColor' in style.defaults,false);
  assert.equal('maskColor' in style.clean({maskColor:'#3ae899'}),false,'an old saved colour is ignored on read');}
 for(const file of ['web/reader/modules/game-profile.js','core/game-profile.js'])assert.equal('maskColor' in require('../'+file).pick({maskColor:'#3ae899',maskStyle:'blend'}),false);
 const gal=read('web/reader/modules/gal.js');
 assert.doesNotMatch(gal,/整块底板颜色|galMaskColor|data-gal-full-color|tomoyo-gal-mask\b/);
 assert.doesNotMatch(read('web/reader/modules/menu-layout.js'),/data-gal-full-color/);
});
