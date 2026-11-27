// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 per-speaker text colours (owner, アイキス3 sexy (アイキス3 sexy): アヤメ's lines are bright pink in the game, the reader
   showed a grey pink; 分角色 under Alt+T → 文字 → 字体 lists the speakers with their colours, per work).
   The texel side of the colour (a grey-pink mean of stroke edges) is native/gpuhide/selftest/tracecolor.cpp (CI: run.cmd → run-color.cmd).
   Here: the colour reaches the reader unchanged, NeXAS scripts say who speaks each line, the hook names that speaker for a hooked line,
   the table is learned and kept per work, and a user colour wins. The reader block itself: speaker-colors-ui.test.cjs. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const SC=require('../web/reader/modules/speaker-colors.js'),style=require('../web/reader/modules/game-style.js');
const {HookNative}=require('../core/hook-native.cjs'),Profiles=require('../core/profiles/index.cjs'),{GameStyleSync}=require('../core/game-style-sync.cjs');
const nexas=require('../services/original-engines/nexas.cjs'),F=require('./helpers/engine-fixtures-g2.cjs'),original=require('../services/original-text.cjs');
const AYAME='#ff5ea8',KEY='a'.repeat(64),OTHER='b'.repeat(64);
const tmp=(t,name)=>{const r=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),name));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;};

function bridge(t){
 const root=tmp(t,'speaker-hook-'),events=[],child=new EventEmitter();let clock=100000;
 for(const name of ['HookBridge.exe','LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'])fs.writeFileSync(path.join(root,name),'synthetic component, never executed');
 child.stdout=new PassThrough();child.stdin=new PassThrough();child.pid=undefined;
 const h=new HookNative({native:root,hook:root,logs:root},m=>events.push(m),()=>child,()=>clock);
 h.trace=()=>{};h.drawSync=()=>{};
 t.mock.method(HookNative,'syncShippedHook',()=>{});t.mock.method(HookNative,'fetchRuntimeDump',()=>{});
 h.profile=Profiles.profileFor({engine:'nexas'});h.preferences={hookProfile:'read'};h.wanted=true;
 h.start({pid:123,hwnd:'123',name:'Aikiss3.exe',started:'1795280000000'});
 t.after(async()=>{child.stdout.end();h.process=null;await h.stop();});
 return {h,events,send:async m=>{clock+=1500;child.stdout.write(JSON.stringify(m)+'\n');await new Promise(r=>setImmediate(r));}};
}

test('the GPU draw colour of アヤメ\'s line reaches the reader as the same value, not a dimmed or blended one',async t=>{
 const {h,events}=bridge(t),line='「わたしはアヤメちゃん。迷える蓮君を導く為にやってきた」';
 h.state.hookGlyphDots={seq:7,text:line,dots:[]};
 h.glyphColor({seq:7,color:'#FF5EA8',alpha:255,src:'gpu'});
 const sample=events.find(m=>m.type==='lineStyleSample');
 assert.ok(sample,'the line gets a style sample');assert.equal(sample.style.fill,AYAME);assert.equal(sample.style.alpha,1);
 const paint=style.linePaint(style.clean({}),line,'',sample.style);
 assert.equal(paint.color,AYAME,'the reader paints the game\'s own pink');assert.equal(paint.sampled,true);
 /* a white narration line keeps white (before the fix too) */
 assert.equal(style.linePaint(style.clean({}),'目が光りに慣れてきた。','',{fill:'#ffffff',alpha:1}).color,'#ffffff');
});

test('NeXAS scripts name the speaker of each line ((0,name)(5,1)(0,message)); narration and the name line itself have none',()=>{
 const NJA=['','bg01','九条','「おはよう、兄さん」','朝の光が差し込む。','アヤメ','「わたしはアヤメちゃん」','se_door'];
 for(const layout of ['v1','v2','ver']){const r=nexas.parse(F.nexasBin(NJA,{layout,names:[2,5]}));
  assert.deepEqual(r.lines,['九条','「おはよう、兄さん」','朝の光が差し込む。','アヤメ','「わたしはアヤメちゃん」'],layout);
  assert.deepEqual(r.who,['','九条','','','アヤメ'],layout);}
 assert.equal(nexas.parse(F.nexasBin(['','bg01','朝の光が差し込む。'])).who,undefined,'a script without speakers stores nothing');
});

test('the script index keeps the speakers and the provider gives them with a resolved line',t=>{
 const root=tmp(t,'speaker-script-'),dir=path.join(root,'game');fs.mkdirSync(dir,{recursive:true});
 const executable=path.join(dir,'Aikiss3.exe');fs.writeFileSync(executable,'MZ');
 fs.writeFileSync(path.join(dir,'script.pac'),F.nexasPac({'scene.bin':F.nexasBin(['','アヤメ','「わたしはアヤメちゃん」','蓮','「誰だ？」','窓の外は雨だ。'],{names:[1,3]})}));
 const state=original.scanRunning(root,'1',executable);assert.equal(state.runtime?.engine,'nexas');
 assert.deepEqual(JSON.parse(fs.readFileSync(state.runtime.index,'utf8')).who,['','アヤメ','','蓮','']);
 const p=original.provider(root,executable,{id:'1'});assert.ok(p);
 assert.equal(p.resolve('「わたしはアヤメちゃん」')?.speaker,'アヤメ');
 assert.equal(p.resolve('「誰だ？」')?.speaker,'蓮');
 assert.equal(p.resolve('窓の外は雨だ。')?.speaker,undefined,'narration has no speaker');
});

test('a hooked line without its name gets the speaker the script names; a name the engine sent first still wins',async t=>{
 const {h,send}=bridge(t),said={'「わたしはアヤメちゃん」':'アヤメ','「誰だ？」':'蓮'};
 h.originalText={kind:'original',resolve:text=>said[text]?{status:'exact',indices:[0],speaker:said[text]}:null};
 await send({type:'hookSource',sourceName:'NeXAS4',sourceCode:'HSX0@1FA4F0',text:'「わたしはアヤメちゃん」',hookActive:true});
 assert.equal(h.state.hookSpeaker,'アヤメ');
 await send({type:'hookSource',sourceName:'NeXAS4',sourceCode:'HSX0@1FA4F0',text:'窓の外は雨だ。',hookActive:true});
 assert.equal(h.state.hookSource,'窓の外は雨だ。');assert.equal(h.state.hookSpeaker,'','narration: no speaker');
 await send({type:'hookName',text:'【試験者】'});
 await send({type:'hookSource',sourceName:'NeXAS4',sourceCode:'HSX0@1FA4F0',text:'「誰だ？」',hookActive:true});
 assert.equal(h.state.hookSpeaker,'試験者','the engine\'s own name plate comes first');
});

test('the table: learned from the game, alpha dropped, the user colour wins and resets, one colour for all is not by speaker',()=>{
 let t=SC.learn(null,'アヤメ','#FF5EA8C0');
 assert.deepEqual(t,{seen:{'アヤメ':AYAME},user:{}},'read dimming (alpha) is the line\'s state, not the speaker\'s colour');
 assert.equal(SC.learn(t,'アヤメ',AYAME),t,'nothing new: the same table (no save)');
 assert.equal(SC.bySpeaker(t),false);
 t=SC.learn(t,'蓮','#ffffff');assert.equal(SC.bySpeaker(t),true,'two speakers in two colours');
 assert.equal(SC.bySpeaker(SC.learn(SC.learn(null,'蓮','#ffffff'),'アヤ','#FFFFFF')),false,'two speakers, one colour: not by speaker');
 assert.equal(SC.override(t,'アヤメ'),'');
 t=SC.setUser(t,'アヤメ','#00AAFF');assert.equal(SC.override(t,'アヤメ'),'#00aaff');assert.equal(SC.colorFor(t,'アヤメ'),'#00aaff');
 assert.deepEqual(SC.list(t).map(x=>[x.name,x.game,x.user]),[['アヤメ',AYAME,'#00aaff'],['蓮','#ffffff','']]);
 t=SC.setUser(t,'アヤメ','');assert.equal(SC.override(t,'アヤメ'),'');assert.equal(SC.colorFor(t,'アヤメ'),AYAME,'reset: the game\'s colour again');
 assert.equal(SC.nameIn('司「明日は晴れる。」'),'司');assert.equal(SC.nameIn('「明日は晴れる。」'),'');assert.equal(SC.nameIn('朝だ。'),'');
 assert.deepEqual(SC.normalize({seen:{'':'#ffffff','x':'red','y':'#123456'},user:'bad'}),{seen:{y:'#123456'},user:{}});
});

test('the table is kept per work, across restarts, apart from the work\'s style profile',t=>{
 const config=tmp(t,'speaker-store-'),emitted=[];
 const sync=new GameStyleSync({config},m=>emitted.push(m));
 sync.configure({autoGameStyle:true},{gameStyleKey:KEY,gameTitle:'アイキス3 sexy',gameProcessId:1,gameStarted:'1'});
 assert.deepEqual(sync.snapshot().gameStyleSpeakers,{seen:{},user:{}});
 const table=SC.setUser(SC.learn(SC.learn(null,'アヤメ',AYAME),'蓮','#ffffff'),'蓮','#88ccff');
 assert.equal(sync.saveSpeakers(table,OTHER),false,'only the bound work is written');
 assert.equal(sync.saveSpeakers(table,KEY),true);
 assert.deepEqual(emitted.at(-1).gameStyleSpeakers,table,'the reader gets the stored table back');
 assert.equal(fs.existsSync(path.join(config,'game-style-profiles.json')),false,'no style profile is made: a new work keeps its new-work defaults');
 const again=new GameStyleSync({config},()=>{});
 again.configure({autoGameStyle:true},{gameStyleKey:KEY,gameProcessId:2,gameStarted:'2'});
 assert.deepEqual(again.speakerTable(),table,'kept across restarts');
 const other=new GameStyleSync({config},()=>{});
 other.configure({autoGameStyle:true},{gameStyleKey:OTHER,gameProcessId:3,gameStarted:'3'});
 assert.deepEqual(other.speakerTable(),{seen:{},user:{}},'another work has its own (empty) table');
 fs.writeFileSync(path.join(config,'speaker-colors.json'),'{broken');
 const broken=new GameStyleSync({config},()=>{});broken.configure({},{gameStyleKey:KEY,gameProcessId:4,gameStarted:'4'});
 assert.deepEqual(broken.speakerTable(),{seen:{},user:{}},'a damaged file is read as empty, never a crash');
});
