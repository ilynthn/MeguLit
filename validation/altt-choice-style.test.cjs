// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 (user: 选项下面的译文颜色啊位置 大小 字体啥的也要能修改才对啊 包括选项的注音 有的时候位置不对也应该可以修改啊): the option
   overlay (choice-overlay.js) takes its translation's colour, size, font and offsets and its furigana's size, font and offsets from
   Alt+T: 选项译文 on the 翻译 page, 选项注音 in 文字 → 注音设置 (user: 这他妈不该放在翻译或者字体里面吗). The values are reader text settings: cleaned like the others, the default for every game, and saved per work.
   The page test runs the real reader in headless Edge with a stub Tauri transport; skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const ROOT=path.join(__dirname,'..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const KEYS=['choiceCnColor','choiceCnScale','choiceCnFont','choiceCnX','choiceCnY','choiceRubyScale','choiceRubyFont','choiceRubyX','choiceRubyY'];

test('option settings: defaults keep the old look, values are cleaned the same in the app and the reader, and a work saves them',()=>{
 for(const file of ['core/game-style.js','web/reader/modules/game-style.js']){
  const style=require(path.join(ROOT,file));
  assert.deepEqual(KEYS.map(k=>style.defaults[k]),['',100,'',0,0,100,'',0,0],file+': defaults change nothing');
  const c=style.clean({choiceCnColor:'#FF3366',choiceCnScale:999,choiceCnFont:'kaiti',choiceCnX:-999,choiceCnY:7,choiceRubyScale:10,choiceRubyFont:'mincho',choiceRubyX:61,choiceRubyY:'-3'});
  assert.deepEqual(KEYS.map(k=>c[k]),['#FF3366',200,'kaiti',-200,7,50,'mincho',60,-3],file+': clamped to their ranges');
  const bad=style.clean({choiceCnColor:'red;x:y',choiceCnFont:'Arial"',choiceRubyFont:'nope',choiceCnScale:'big'});
  assert.deepEqual([bad.choiceCnColor,bad.choiceCnFont,bad.choiceRubyFont,bad.choiceCnScale],['','','',100],file+': anything else falls back');
 }
 for(const file of ['core/game-profile.js','web/reader/modules/game-profile.js']){
  const profile=require(path.join(ROOT,file)),prefs=Object.fromEntries(KEYS.map(k=>[k,k.endsWith('Scale')?120:k.endsWith('Color')?'#112233':k.endsWith('Font')?'kaiti':5]));
  assert.deepEqual(Object.keys(profile.pick(prefs,'text')).sort(),[...KEYS].sort(),file+': saved with a work\'s text settings');
 }
});

const {startEdge}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const STUB=`<script>window.__sent=[];window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{const r=args&&args.request||{};
 if(cmd==='service'){if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};
  if(r.action==='reader_bootstrap')return {engines:[],native:{}};if(r.action==='reader_message'){window.__sent.push(r.message);return {replies:[]};}return {};}return null;}};</script>`;
const TYPES={'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
function serve(){const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://x').pathname),file=path.join(WEB,rel);
 if(!file.startsWith(WEB)||!fs.existsSync(file)||!fs.statSync(file).isFile()){if(/^\/reader\/modules\/[a-z0-9-]+\.js$/.test(rel)){res.writeHead(200,{'content-type':'text/javascript'});return res.end('');}res.writeHead(404);return res.end();}
 let data=fs.readFileSync(file);if(rel==='/reader/index.html')data=Buffer.from(String(data).replace('<head>','<head>'+STUB));
 res.writeHead(200,{'content-type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(data);});
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));}

test('Alt+T 翻译 → 选项译文, 文字 → 注音设置 → 选项注音: every control changes the option overlay that is up, and is saved',{skip:!hasEdge&&'Edge not installed',timeout:180000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-choice-style-'));let server,cdp;
 try{
  server=await serve();cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<160&&!ready;i++){await sleep(250);ready=await cdp.evaluate('!!window.__TOME_READER_READY__').catch(()=>false);}
  assert.ok(ready,'Reader bootstrap did not finish');
  // Two options are up (the host's hookChoices), with furigana on 一緒 and their translations delivered.
  await cdp.evaluate(`(()=>{const b=window.__tomoyoChinese;window.__tomoyoMode.set('translation');b.galStatus({bound:true,interfaceMode:'translation'});
   b.galLayout({clientX:0,clientY:0,clientWidth:1366,clientHeight:768,readerX:110,readerY:540,readerWidth:1140,readerHeight:170,surfaceWidth:1366,surfaceHeight:768});
   b.rubyAnnotations=t=>{const i=t.indexOf('一緒');return i<0?[]:[{start:i,end:i+2,reading:'いっしょ'}];};
   b.galStatus({hookChoices:{sw:1366,sh:768,items:[{text:'はい、一緒に行きます',x0:120,y0:200,x1:420,y1:236},{text:'いいえ、一緒に残ります',x0:120,y0:300,x1:440,y1:336}]}});})()`);
  await sleep(100);
  await cdp.evaluate(`(()=>{const b=window.__tomoyoChinese,m=window.__sent.filter(x=>x.type==='choiceTranslations').at(-1);b.deliverChoiceTranslations(m.request,{target:b.translationTarget(),rows:[{text:'好，一起去吧'},{text:'不，一起留下'}]});})()`);
  let up=false;for(let i=0;i<40&&!up;i++){await sleep(100);up=await cdp.evaluate(`!!document.querySelector('.megulit-choice rt')&&document.querySelector('.megulit-choice-cn')?.textContent==='好，一起去吧'`);}
  assert.ok(up,'options drawn with furigana and translation');
  await cdp.evaluate(`window.__tomoyoChinese.toggleGalMenu()`);await sleep(800);
  await cdp.evaluate(`document.querySelector('.tomoyo-cn-dialog[open] [data-menu-key=translate]').click()`);
  let built=false;for(let i=0;i<40&&!built;i++){await sleep(100);built=await cdp.evaluate(`document.querySelectorAll('.tomoyo-cn-dialog[open] .tome-look-choice').length===2`);}
  assert.ok(built,'both option groups built');
  // 选项译文 on the 翻译 page, 选项注音 next to the line's furigana settings in 文字 → 注音设置, nothing on 外观.
  const where=await cdp.evaluate(`(()=>{const d=document.querySelector('.tomoyo-cn-dialog[open]'),cn=d.querySelector('[data-look-group=choice-cn]'),ruby=d.querySelector('[data-look-group=choice-ruby]');
   return {cn:cn.closest('[data-menu-category]').dataset.menuCategory,cnTitle:cn.querySelector('.tome-look-title').textContent,ruby:ruby.closest('[data-menu-category]').dataset.menuCategory,
    rubyPane:!!ruby.closest('details')?.querySelector('[name=galRubyFont]'),rubyTitle:ruby.querySelector('.tome-look-title').textContent,onLook:!!d.querySelector('[data-menu-category=misc] .tome-look-choice'),
    cnKeys:[...cn.querySelectorAll('[data-choice-key]')].map(n=>n.dataset.choiceKey).sort(),rubyKeys:[...ruby.querySelectorAll('[data-choice-key]')].map(n=>n.dataset.choiceKey).sort()};})()`);
  assert.deepEqual(where,{cn:'translate',cnTitle:'选项译文',ruby:'text',rubyPane:true,rubyTitle:'选项注音',onLook:false,
   cnKeys:KEYS.filter(k=>k.startsWith('choiceCn')).sort(),rubyKeys:KEYS.filter(k=>k.startsWith('choiceRuby')).sort()},'placement');

  const READ=`(()=>{const node=document.querySelector('.megulit-choice'),cn=node.querySelector('.megulit-choice-cn'),rt=node.querySelector('rt'),jp=node.querySelector('.megulit-choice-jp');
   const c=cn.getBoundingClientRect(),r=rt.getBoundingClientRect(),cs=getComputedStyle(cn),rs=getComputedStyle(rt);
   return {cnColor:cs.color,cnSize:parseFloat(cs.fontSize),cnFont:cs.fontFamily,cnX:c.left,cnY:c.top,rubySize:parseFloat(rs.fontSize),rubyFont:rs.fontFamily,rubyX:r.left,rubyY:r.top,
    jpSize:parseFloat(getComputedStyle(jp).fontSize),jpColor:getComputedStyle(jp).color,
    translationColor:getComputedStyle(document.documentElement).getPropertyValue('--tomoyo-translation-color').trim()||'#ffe9a8'};})()`;
  const SAVED=`(()=>{const s=JSON.parse(localStorage.getItem('tomoyo-gal-settings')||'{}'),c=window.__sent.filter(m=>m.type==='galConfigure').at(-1)?.settings||{};return {s,c};})()`;
  const at=async()=>{await sleep(120);return cdp.evaluate(READ);};
  const ui=(selector,value,event='change')=>cdp.evaluate(`(()=>{const n=document.querySelector('.tomoyo-cn-dialog[open] .tome-look-choice ${selector}');if(!n)throw Error('missing ${selector}');n.value=${JSON.stringify(String(value))};n.dispatchEvent(new Event('${event}',{bubbles:true}));})()`);
  const saved=async(key,value)=>{const {s,c}=await cdp.evaluate(SAVED);assert.equal(s[key],value,key+' kept as the default');assert.equal(c[key],value,key+' sent to the app');};

  // Untouched: the overlay looks as before (furigana half the option's size, translation in the line translation's colour).
  const base=await at();
  assert.ok(Math.abs(base.rubySize-base.jpSize*.5)<.6,'furigana at half the option size: '+JSON.stringify(base));
  assert.equal(base.jpColor,'rgba(0, 0, 0, 0)','the option copy stays invisible (the game draws the option)');

  // Every control on the page exists.
  const controls=await cdp.evaluate(`[...document.querySelectorAll('.tomoyo-cn-dialog[open] .tome-look-choice [data-choice-key]')].map(n=>n.dataset.choiceKey).sort()`);
  assert.deepEqual(controls,[...KEYS].sort(),'one control per setting');

  // Translation colour, then back to the line translation's colour.
  await ui('input[type=color][data-choice-key=choiceCnColor]','#ff3366','input');
  assert.equal((await at()).cnColor,'rgb(255, 51, 102)','translation colour');await saved('choiceCnColor','#ff3366');
  assert.equal(await cdp.evaluate(`getComputedStyle(document.querySelector('.tomoyo-cn-dialog[open] .tome-look-choice-cn')).color`),'rgb(255, 51, 102)','sample follows');
  await cdp.evaluate(`document.querySelector('.tomoyo-cn-dialog[open] [data-choice-follow]').click()`);
  assert.equal((await at()).cnColor,base.cnColor,'back to the line translation colour');await saved('choiceCnColor','');

  // Sizes (typed into the value fields).
  await ui('[data-choice-num=choiceCnScale]',150);let v=await at();
  assert.ok(Math.abs(v.cnSize-base.cnSize*1.5)<1,'translation size 150%: '+v.cnSize+' vs '+base.cnSize);await saved('choiceCnScale',150);
  await ui('[data-choice-num=choiceRubyScale]',160);v=await at();
  assert.ok(Math.abs(v.rubySize-base.rubySize*1.6)<1,'furigana size 160%: '+v.rubySize+' vs '+base.rubySize);await saved('choiceRubyScale',160);
  await ui('[data-choice-num=choiceCnScale]',100);await ui('[data-choice-num=choiceRubyScale]',100);
  const still=await at();

  // Fonts.
  await ui('select[data-choice-key=choiceCnFont]','kaiti');v=await at();assert.match(v.cnFont,/KaiTi/,'translation font');await saved('choiceCnFont','kaiti');
  await ui('select[data-choice-key=choiceRubyFont]','mincho');v=await at();assert.match(v.rubyFont,/MS Mincho/,'furigana font');await saved('choiceRubyFont','mincho');
  await ui('select[data-choice-key=choiceCnFont]','');await ui('select[data-choice-key=choiceRubyFont]','');
  v=await at();assert.equal(v.cnFont,base.cnFont,'translation font follows the option again');assert.equal(v.rubyFont,base.rubyFont,'furigana font follows again');

  // Offsets: each moves only its own text, by the set amount (sliders and value fields both).
  await ui('input[type=range][data-choice-key=choiceCnX]',30,'input');await ui('[data-choice-num=choiceCnY]',-12);v=await at();
  assert.deepEqual([Math.round(v.cnX-still.cnX),Math.round(v.cnY-still.cnY),Math.round(v.rubyX-still.rubyX),Math.round(v.rubyY-still.rubyY)],[30,-12,0,0],'translation moved, furigana not');
  await saved('choiceCnX',30);await saved('choiceCnY',-12);
  await ui('[data-choice-num=choiceRubyX]',-7);await ui('input[type=range][data-choice-key=choiceRubyY]',-9,'input');v=await at();
  assert.deepEqual([Math.round(v.rubyX-still.rubyX),Math.round(v.rubyY-still.rubyY),Math.round(v.cnX-still.cnX)],[-7,-9,30],'furigana moved, translation stays where it was put');
  await saved('choiceRubyX',-7);await saved('choiceRubyY',-9);

  // Out of range input is clamped; the second option gets the same settings.
  await ui('[data-choice-num=choiceRubyY]',-500);await saved('choiceRubyY',-60);
  const second=await cdp.evaluate(`(()=>{const n=document.querySelectorAll('.megulit-choice')[1];return getComputedStyle(n.querySelector('.megulit-choice-jp')).translate;})()`);
  assert.equal(second,'-7px -60px','every option follows');

  // A work's saved settings restored by the app reach the options that are up.
  await cdp.evaluate(`window.__tomoyoChinese.restoreGalSettings({choiceCnX:0,choiceCnY:0,choiceRubyX:0,choiceRubyY:0})`);v=await at();
  assert.deepEqual([Math.round(v.cnX-still.cnX),Math.round(v.cnY-still.cnY),Math.round(v.rubyX-still.rubyX),Math.round(v.rubyY-still.rubyY)],[0,0,0,0],'restored work settings applied');
  await sleep(700);
  assert.equal(await cdp.evaluate(`document.querySelector('.tomoyo-cn-dialog[open] [data-choice-num=choiceRubyY]').value`),'0','the page shows the restored value');
 }finally{await cdp?.stop();server?.close();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
