// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Execute the shipped TJS function bodies after translating its binding/undefined syntax.
function fixture(){
 const script=fs.readFileSync(path.join(__dirname,'../native/krkrtext/script.inc'),'utf8'),out=[];
 let layer={height:200,marginL:0,marginT:0,textLayer:{opacity:255}};
 const st={trT:undefined,trOp:undefined,trRec:undefined,trOwner:undefined,trText:'',trKey:'',trLine:0,charsSent:0,
  trLayer:()=>layer,screen:()=>[640,480],shown:()=>true,abs:()=>[0,280],hideOn:()=>true,report:s=>out.push(s)};
 const ctx=vm.createContext({st,int:Math.trunc});
 for(const name of ['trOwn','trRestore','trUi','trHide','trNote','trClear','trDone','trTwin']){
  const body=new RegExp('st\\.'+name+'=function\\(([^)]*)\\)\\{([\\s\\S]*?)\\} incontextof st;').exec(script);
  assert.ok(body,name);
  const source=body[2].replace(/%\[\]/g,'({})').replace(/'Object'/g,"'object'").replace(/\.count\b/g,'.length').replace(/\.add\(/g,'.push(').replace(/\bvoid\b/g,'undefined').replace(/isvalid this\.trT/g,'this.trT.valid!==false').replace(/\(inst\.getCharacters incontextof inst\)/g,'inst.getCharacters.bind(inst)');
  vm.runInContext('st.'+name+'=function('+body[1]+'){'+source+'};',ctx);
 }
 const renderer=target=>({textLayer:target.textLayer,getCharacters:()=>[..."これは台詞です"].map((text,i)=>({text,x:20*i,y:0,cw:20,size:24}))});
 return {st,out,renderer,get layer(){return layer;},set layer(v){layer=v;}};
}
test('title and menu TextRender instances cannot hide the current message layer',()=>{
 const f=fixture();f.st.trHide();assert.equal(f.layer.textLayer.opacity,255,'no confirmed record');
 const menu={textLayer:{opacity:255},getCharacters(){throw Error('menu must not be sampled');}};
 f.st.trDone(menu);assert.equal(f.layer.textLayer.opacity,255);assert.equal(f.out.length,0);
});
test('confirmed dialogue still hides, read mode and a layer switch restore its exact opacity',()=>{
 const f=fixture();f.layer.textLayer.opacity=192;f.st.trDone(f.renderer(f.layer));
 assert.equal(f.layer.textLayer.opacity,0);assert.ok(f.out.some(s=>s.includes('hidden=1')));
 f.st.hideOn=()=>false;f.st.trHide();assert.equal(f.layer.textLayer.opacity,192);
 f.st.hideOn=()=>true;f.st.trHide();assert.equal(f.layer.textLayer.opacity,0);
 const old=f.layer;f.layer={height:200,textLayer:{opacity:128}};f.st.trHide();
 assert.equal(old.textLayer.opacity,192);assert.equal(f.layer.textLayer.opacity,128,'unknown new layer kept');
});
test('live 千恋＊万花: a TextRender bound to no layer hides only the message layer KAG writes to (kag.current)',()=>{
 /* 2026-11-19: Yuzusoft's renderers have no textLayer member, so the strict check alone never hid any dialogue and
    MeguLit drew the line over the game's own copy */
 const loose=()=>({getCharacters:()=>[..."これは台詞です"].map((text,i)=>({text,x:20*i,y:0,cw:20,size:24}))});
 const f=fixture();f.st.kag={current:{}};f.st.trDone(loose());assert.equal(f.layer.textLayer.opacity,255,'another layer is current');assert.equal(f.out.length,0);
 f.st.kag.current=f.layer;f.st.trDone(loose());assert.equal(f.layer.textLayer.opacity,0);assert.ok(f.out.some(s=>s.includes('hidden=1')));
 const g=fixture();g.st.kag={current:g.layer};g.st.trDone({textLayer:{opacity:255},getCharacters(){throw Error('a renderer bound to another layer must not be sampled');}});
 assert.equal(g.layer.textLayer.opacity,255);
});
test('a name plate with the same renderer ownership stays visible',()=>{
 const f=fixture();f.layer.height=40;f.st.trDone(f.renderer(f.layer));assert.equal(f.layer.textLayer.opacity,255);assert.equal(f.out.length,0);
});
test('saved Chinese content metadata and chinese-only script verdict reach the hide bridge without an ini',()=>{
 const {Reader}=require('../services/reader.cjs'),{HookNative}=require('../core/hook-native.cjs');
 function run(lib,japanese){
  const sent=[],hooks=Object.create(HookNative.prototype);Object.assign(hooks,{process:{},send:m=>sent.push(m)});
  const modules={
   './original-text.cjs':{providerKey:()=>'',provider:()=>({})},
   './store.cjs':{openStore:()=>({close(){}})},
   './library.cjs':{activeGameForProgram:()=>({id:'game',original:JSON.stringify({library:lib})})},
   './japanese-presence.cjs':{verdict:()=>({japanese})}
  };
  const refresh=vm.runInNewContext('({'+Reader.prototype.refreshTextSource.toString()+'}).refreshTextSource',{require:id=>{assert.ok(modules[id],id);return modules[id];}});
  refresh.call({root:'H:\\fixture',gal:{hooks},prefs:()=>({})},{exe:'H:\\fixture\\game.exe'});
  return {hooks,sent};
 }
 assert.equal(run({contentLanguage:'zh'},null).sent[0]?.value,'zh!','the library knows the build is Chinese');
 assert.equal(run({},false).sent[0]?.value,'zh','chinese-only script verdict also blocks default hiding');
 assert.equal(run({contentLanguage:'ja',originalExecutableVerified:true},true).sent[0]?.value,'ja');
 assert.equal(run({},null).sent.length,0,'unknown language grants no Chinese/Japanese override');
 const f=run({contentLanguage:'zh'},false);f.hooks.setSourceLanguage('zh!');assert.equal(f.sent.length,1,'unchanged metadata cannot undo live Japanese confirmation');
 f.hooks.setSourceLanguage('ja');assert.equal(f.sent.at(-1)?.value,'ja','restoring Japanese changes the live bridge policy');
});


test('TextRender empty result retires the exact page and restores its saved opacity',()=>{
 const f=fixture();f.layer.textLayer.opacity=192;f.st.trDone(f.renderer(f.layer));
 const line=f.st.trRec[1];assert.equal(f.layer.textLayer.opacity,0);
 f.st.trDone({textLayer:f.layer.textLayer,getCharacters:()=>[]});
 assert.equal(f.layer.textLayer.opacity,192);assert.equal(f.st.trRec,undefined);
 assert.equal(f.st.trAll,undefined);assert.equal(f.layer.__mgTrAll,undefined);
 assert.ok(f.out.some(s=>s.includes('line='+line+' hidden=0')&&s.endsWith('n=0 rects= text=')));
 const before=f.out.filter(s=>s.endsWith('n=0 rects= text=')).length;f.st.trDone({textLayer:f.layer.textLayer,getCharacters:()=>[]});
 assert.equal(f.out.filter(s=>s.endsWith('n=0 rects= text=')).length,before,'retire once');
});

test('TextRender native link owner remains visible even when dialogue hiding is requested',()=>{
 const f=fixture();f.layer.numLinks=1;f.st.trDone(f.renderer(f.layer));
 assert.equal(f.layer.textLayer.opacity,255);assert.ok(!f.out.some(s=>s.includes('hidden=1')));
 f.layer.numLinks=0;f.st.trHide();assert.equal(f.layer.textLayer.opacity,255,'wait for a fresh dialogue layout');
 f.st.trDone(f.renderer(f.layer));assert.equal(f.layer.textLayer.opacity,0);
 f.layer.numLinks=1;f.st.trHide();assert.equal(f.layer.textLayer.opacity,255);
});

test('TextRender over-budget layout cannot hide unsent glyphs',()=>{
 const f=fixture();f.st.trDone({textLayer:f.layer.textLayer,getCharacters:()=>Array(4001).fill({})});
 assert.equal(f.layer.textLayer.opacity,255);assert.equal(f.st.charsSent,0);assert.ok(Object.hasOwn(f.st.trWhy,'limit'));
});

test('TextRender hidden owner and owner switches retire their exact old page before another render',()=>{
 for(const change of [f=>{f.st.shown=()=>false;},f=>{f.layer={height:200,marginL:0,marginT:0,textLayer:{opacity:127}};}]){
  const f=fixture();f.layer.textLayer.opacity=192;f.st.trDone(f.renderer(f.layer));const old=f.layer,line=f.st.trRec[1];
  change(f);f.st.trHide();assert.equal(old.textLayer.opacity,192);assert.equal(f.st.trRec,undefined);
  assert.ok(f.out.some(s=>s.includes('line='+line+' hidden=0')&&s.endsWith('n=0 rects= text=')));
  const n=f.out.length;f.st.trHide();assert.equal(f.out.length,n,'clear once');
 }
});

test('TextRender owned null/failed snapshots release hiding and cannot keep stale records',()=>{
 for(const getCharacters of [()=>null,()=>{throw Error('layout unavailable');}]){
  const f=fixture();f.layer.textLayer.opacity=192;f.st.trDone(f.renderer(f.layer));const line=f.st.trRec[1];
  f.st.trDone({textLayer:f.layer.textLayer,getCharacters});assert.equal(f.layer.textLayer.opacity,192);assert.equal(f.st.trRec,undefined);
  assert.ok(f.out.some(s=>s.includes('line='+line+' hidden=0')&&s.endsWith('n=0 rects= text=')));
 }
});

test('TextRender newly opened links never reuse the preceding hidden proof',()=>{
 const f=fixture();f.layer.textLayer.opacity=192;f.st.trDone(f.renderer(f.layer));assert.equal(f.layer.textLayer.opacity,0);
 const before=f.out.length;f.layer.numLinks=1;f.st.trDone(f.renderer(f.layer));
 assert.equal(f.layer.textLayer.opacity,192);assert.ok(f.out.slice(before).every(s=>!s.includes('hidden=1')));
});

test('TextRender record beyond native transport budget retires old hiding and can recover',()=>{
 const f=fixture();f.layer.textLayer.opacity=192;f.st.trDone(f.renderer(f.layer));
 f.st.trDone({textLayer:f.layer.textLayer,getCharacters:()=>Array.from({length:1600},(_,i)=>({text:'字',x:1000000+i*24,y:0,cw:24,size:24}))});
 assert.equal(f.layer.textLayer.opacity,192);assert.equal(f.st.trRec,undefined);assert.equal(f.st.trText,'');
 assert.ok(f.out.every(s=>s.length<28000),'no record that native ReportFunction would silently drop');
 f.st.trDone(f.renderer(f.layer));assert.ok(f.st.trRec);assert.equal(f.layer.textLayer.opacity,0);
});

test('TextRender retirement reaches real HookNative parsing and OverlayPlacement gone handling',()=>{
 const {HookNative}=require('../core/hook-native.cjs'),{OverlayPlacement}=require('../core/overlay-placement.cjs');
 for(const change of [f=>{f.st.shown=()=>false;f.st.trHide();},f=>{f.layer.numLinks=1;f.st.trHide();}]){
  const sent=[],placement=new OverlayPlacement({send:m=>sent.push(m)});
  placement.configure({textRenderer:'compositor'},{bound:true,layout:{clientWidth:640,clientHeight:480}});
  const hook=Object.create(HookNative.prototype);Object.assign(hook,{drawLog(){},engineDrawLine(){},gamePid:()=>123,now:()=>1,emit:m=>placement.hook(m)});
  const f=fixture();f.st.trDone(f.renderer(f.layer));for(const raw of f.out)hook.charRects(raw);
  assert.ok(sent.some(m=>m.type==='textPlace'&&m.rects?.length));
  const start=f.out.length;change(f);for(const raw of f.out.slice(start))hook.charRects(raw);
  assert.ok(sent.some(m=>m.type==='textPlace'&&m.gone===true),'old Japanese placement is retired, not just logged');
 }
});

/* 2026-11-26 (integration live test, 死に逝く君、館に芽吹く憎悪: every 血塗れの男 line, trwhy switch cur=f0 owner=b0): the line is rendered on the back
   page and [trans] copies it onto the front twin; the record moves there and the front copy is hidden instead of the line being retired */
test('a line rendered on the back page moves to its front twin after the transition and stays hidden',()=>{
 const f=fixture(),back={height:200,marginL:0,marginT:0,textLayer:{opacity:255}},fore={height:200,marginL:0,marginT:0,textLayer:{opacity:255}};
 f.st.kag={back:{messages:[back]},fore:{messages:[fore]}};f.layer=back;f.st.trDone(f.renderer(back));
 assert.equal(back.textLayer.opacity,0);const n=f.out.length;
 f.layer=fore;f.st.trHide();
 assert.equal(fore.textLayer.opacity,0,'the front copy is hidden');assert.equal(back.textLayer.opacity,255,'the back page gets its opacity back');
 assert.ok(!f.out.slice(n).some(s=>/hidden=0/.test(s)),'the line is not retired: '+JSON.stringify(f.out.slice(n)));
 const g=fixture(),other={height:200,textLayer:{opacity:128}};g.st.kag={back:{messages:[{}]},fore:{messages:[other]}};g.st.trDone(g.renderer(g.layer));g.layer=other;g.st.trHide();
 assert.equal(other.textLayer.opacity,128,'a layer that is not the twin is not hidden');assert.ok(g.out.some(s=>/hidden=0 .*n=0/.test(s)),'and the line is retired as before');
});
