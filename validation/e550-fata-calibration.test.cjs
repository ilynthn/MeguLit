process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* E550 ファタモルガーナの館 manual calibration: wrong font (MS Gothic over ＭＳ Ｐ明朝), box away from the game's text, every line
   white although narration is grey. Font: profile/default values no longer replace the engine's font, a KiriKiri default-font
   report is ignored, the Krkr DLL must carry the E475 lineLayer reader. Position: ADV lines carry canvas coordinates and size, so
   the reader maps them without calibration. Colour: engine colour per line, else the colour learned for speech / narration. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ef=require('../core/engine-font.cjs'),profile=require('../core/game-profile.js'),gs=require('../core/game-style.js'),{combine}=require('../core/game-style-sync.cjs');
const {HookNative}=require('../core/hook-native.cjs');

test('KiriKiri default font (ＭＳ Ｐゴシック 12px, no font set on that layer) is not a dialogue font report',()=>{
 assert.equal(ef.engineDefault({type:'hookFont',engine:'krkr',face:'ＭＳ Ｐゴシック',size:12}),true);
 assert.equal(ef.engineDefault({type:'hookFont',engine:'krkr',face:'ＭＳ Ｐ明朝',size:22,prerendered:'mincho2.tft'}),false);
 assert.equal(ef.engineDefault({type:'hookFont',engine:'krkr',face:'ＭＳ Ｐゴシック',size:24}),false);
 assert.equal(ef.engineDefault({type:'hookFont',engine:'gdi',probe:true,face:'ＭＳ Ｐゴシック',size:12}),false);
 assert.match(read('services/reader.cjs'),/ef\.engineDefault\?\.\(message\)/);});

test('profile values never replace a followed game font; a user-picked font travels with the profile',()=>{
 const followed=profile.followFont({japaneseFont:'originalGothic',japaneseFontSource:'game',textColor:'#ffffff'});
 assert.deepEqual(followed,{textColor:'#ffffff'});
 assert.deepEqual(profile.followFont({japaneseFont:'yuMincho',japaneseFontSource:'user'}),{japaneseFont:'yuMincho',japaneseFontSource:'user'});
 assert.deepEqual(profile.followFont({x:1}),{x:1});
 assert.equal(read('core/game-profile.js'),read('web/reader/modules/game-profile.js'),'web copy of game-profile.js matches core');
 assert.match(read('core/gal-native.cjs'),/followFont\(m\.gameStyleEffectivePrefs\)/,'profile load at bind keeps the engine font');
 const ui=read('web/reader/modules/game-style-sync-ui.js');
 assert.match(ui,/applyGalPreferences\(tools\.followFont/,'calibration preview/cancel/history keep the engine font');
 assert.equal((ui.match(/followFont\(/g)||[]).length>=3,true);});

test('speech / narration kind and the colour of each line',()=>{
 for(const g of [gs,loadWebGameStyle()]){
  assert.equal(g.lineKind('「待って」'),'speech');assert.equal(g.lineKind('ミシェル「待って」'),'speech');assert.equal(g.lineKind('（そうか……）'),'speech');
  assert.equal(g.lineKind('……戻らねばならないと。'),'narration');assert.equal(g.lineKind('彼は「はい」と言った。'),'narration');assert.equal(g.lineKind(''),'');
  const p={textColor:'#ffffff',narrationTextColor:'#9d9d9d',speechTextColor:''};
  assert.equal(g.lineColor(p,'……戻らねばならないと。'),'#9d9d9d');assert.equal(g.lineColor(p,'「待って」'),'');
  assert.equal(g.lineColor(p,'「待って」','#FFFFFF'),'#ffffff','engine colour first');
  assert.equal(g.lineColor({textColor:'#ffffff'},'x','#242424'),'','near-black engine colour over light text is an outline');
  assert.equal(g.lineColor({...p,readTextColor:'#88aaff'},'……','#9d9d9d'),'','user read colour wins');
  assert.equal(g.lineColor({...p,autoGameStyle:false},'……','#9d9d9d'),'');
  assert.equal(g.clean({speechTextColor:'#ffffff',narrationTextColor:'nope'}).narrationTextColor,'');
  assert.equal(g.clean({speechTextColor:'#ffffff'}).speechTextColor,'#ffffff');}
 assert.ok(profile.textKeys.includes('speechTextColor')&&profile.textKeys.includes('narrationTextColor'));});

test('calibration learns the colour for the kind of line it measured',()=>{
 const sample=(color,kind)=>({width:800,height:600,inkLeft:300,inkTop:480,lineKind:kind,style:{x:37,y:80,width:30,textColor:color,japaneseSize:22}});
 assert.equal(combine([sample('#9d9d9d','narration')]).style.narrationTextColor,'#9d9d9d');
 assert.equal(combine([sample('#ffffff','speech')]).style.speechTextColor,'#ffffff');
 const mixed=combine([sample('#9d9d9d','narration'),sample('#ffffff','speech')]).style;
 assert.equal(mixed.narrationTextColor,undefined);assert.equal(mixed.speechTextColor,undefined);
 assert.match(read('core/game-style-sync.cjs'),/m\.result\.lineKind=gameStyle\.lineKind/);});

test('KiriKiri ADV lines go to the reader with canvas size and colour (no calibration needed)',()=>{
 let now=1000;const ev=[];const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/none'},m=>ev.push(m),()=>{},()=>now);h.trace=()=>{};h.send=()=>{};
 h.pageLine({type:'hookEngineLine',engine:'krkr',phase:'begin',line:3,same:false,nvl:false,x0:312,y0:487,x1:740,y1:487,size:22,sw:800,sh:600,count:0,color:'#9d9d9d'});
 const pos=ev.find(e=>e.type==='hookTextPos');assert.ok(pos,'ADV begin emits a position');
 assert.equal(pos.engine,'krkr_adv_v1');assert.equal(pos.color,'#9d9d9d');assert.equal(pos.sw,800);assert.equal(pos.x0,312);
 ev.length=0;h.pageLine({type:'hookEngineLine',engine:'ocr',phase:'begin',line:4,same:false,nvl:false,x0:1,y0:1,x1:2,y1:2,size:22,sw:800,sh:600,count:0});
 assert.equal(ev.some(e=>e.type==='hookTextPos'),false,'OCR boxes are not engine canvas coordinates');});

test('reader maps ADV canvas coordinates to the client and paints the line colour',()=>{
 const {api,doc,b}=loadTextPosition({clientWidth:1600,clientHeight:1000});
 const map=api.canvasMap({engine:'krkr_adv_v1',sw:800,sh:600},{clientWidth:1600,clientHeight:1000},{x:10,y:4});
 assert.equal(map.s,1600/800>1000/600?1000/600:2);assert.ok(Math.abs(map.bx-(1600-map.s*800)/2)<1e-9);assert.equal(map.by,0);assert.equal(map.dx,10);
 assert.equal(api.canvasMap({engine:'krkr_screen_v1',sw:800,sh:600},{clientWidth:1600,clientHeight:1000}),null,'page engines keep their own path');
 assert.equal(api.state().calibrated,false);
 b.textPosition({type:'hookTextPos',engine:'krkr_adv_v1',line:1,token:1,x0:312,y0:487,x1:740,y1:487,size:22,sw:800,sh:600,color:'#9d9d9d'});
 assert.equal(api.state().calibrated,true,'canvas-size engines count as calibrated');
 assert.equal(b.previewed.length,1,'box follows the line without a calibration map');const s=1000/600;
 assert.ok(Math.abs(b.previewed[0].x-Math.round(((s*312+(1600-s*800)/2)*100/1600)*10)/10)<0.11);
 assert.equal(doc.body.classes.has('tome-line-color'),true);assert.equal(doc.vars['--tomoyo-gal-line-color'],'#9d9d9d');
 b.textPosition({type:'hookTextPos',engine:'krkr_adv_v1',line:2,token:2,x0:60,y0:487,x1:740,y1:487,size:22,sw:800,sh:600,color:'#ffffff'});
 assert.equal(doc.body.classes.has('tome-line-color'),false,'white = the text colour: no override');
 assert.match(read('web/reader/modules/gal.js'),/body\.tome-line-color \.sentence-window:not\(\.tome-island-page\) \{ --tomoyo-gal-color:var\(--tomoyo-gal-line-color\)/);});

test('Krkr script reports the colour at begin, and built DLLs carry the E475 font reader',()=>{
 const inc=read('native/krkrtext/script.inc');
 assert.match(inc,/if\(rec\.color>=0\) \{/);assert.match(inc,/rec\.color=L\.chColor&0xffffff; \/\* E550/);
 for(const dll of ['native/MeguLitKrkr32.dll','native/MeguLitKrkr64.dll']){const p=path.join(root,dll);if(!fs.existsSync(p))continue;const d=fs.readFileSync(p);
  for(const k of ['drawFont','fontReport','mappfont'])assert.ok(d.includes(Buffer.from(k,'utf16le')),dll+' is stale: rebuild native/krkrtext (missing '+k+')');}});

function loadWebGameStyle(){const ctx={window:{},globalThis:{}};ctx.globalThis=ctx;vm.runInNewContext(read('web/reader/modules/game-style.js'),ctx);return ctx.TomoyoGameStyle||ctx.window.TomoyoGameStyle;}
function loadTextPosition(layout){
 const classes=new Set(),vars={};
 const doc={readyState:'complete',addEventListener(){},querySelector:()=>null,body:{classes,classList:{toggle:(c,on)=>{if(on)classes.add(c);else classes.delete(c);return on;},contains:c=>classes.has(c)}},
  documentElement:{style:{setProperty:(k,v)=>{vars[k]=v;},removeProperty:k=>{delete vars[k];}}},vars};
 const prefs={textColor:'#ffffff',autoGameStyle:true};
 const b={previewed:[],galPreferences:()=>prefs,galLayoutInfo:()=>layout,previewGalPosition:v=>b.previewed.push(v)};
 const g=gs;const ctx={window:{__tomoyoChinese:b,TomoyoGameStyle:g,devicePixelRatio:1,__tomoyoTranslateRequest(){}},document:doc,getComputedStyle:()=>({getPropertyValue:()=>'',fontSize:'22px'}),Date,Math,Number,String,Map,JSON,Object};
 vm.runInNewContext(read('web/reader/modules/text-position.js'),ctx);return {api:ctx.window.__tomeTextPosition,doc,b};}
