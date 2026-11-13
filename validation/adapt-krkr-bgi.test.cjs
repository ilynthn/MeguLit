// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 adapt/krkr-bgi: live recordings (HookBridge messages, MEGULIT_HOOK_RECORD format) replayed through HookNative.
   - サノバウィッチ (KiriKiri Z, Steam 日简繁): the hook's container string holds the game's own Simplified Chinese track,
     which pairs each Japanese line with the official translation (scriptTranslation), no machine translation needed.
   - 女王蜂の王房 めのう編 (KiriKiri 2): the picked stream was a name-entry label; the engine's own line draws carry every
     sentence, so the reader still gets each line once.
   - YU-RIS embed streams never take a written-back translation (euphoria: any write-back stopped the engine). */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {replay}=require('./helpers/hook-replay.cjs');const {HookNative}=require('../core/hook-native.cjs');const lt=require('../core/language-tracks.cjs');
const dir=path.join(__dirname,'helpers','krkr-bgi-replay');
const lines=r=>{const out=[];for(const e of r.events)if(typeof e?.hookSource==='string'&&e.hookSource&&out[out.length-1]!==e.hookSource)out.push(e.hookSource);return out;};
function withInstance(fn){const orig=HookNative.prototype.sourcePage;let inst=null;HookNative.prototype.sourcePage=function(...a){inst=this;return orig.apply(this,a);};try{const r=fn();return {r,inst};}finally{HookNative.prototype.sourcePage=orig;}}

test('chineseTrack: the first Chinese track of a jp×4 + 简×2 + 繁×2 container; nothing for a plain or Japanese-only line',()=>{
 const raw='「あの……保科君、ちょっといいかな？」'.repeat(4)+'「那个……保科，可以跟你说点事吗？」'.repeat(2)+'「那個……保科，可以跟你講點事情嗎？」'.repeat(2);
 assert.equal(lt.chineseTrack(raw,'「あの……保科君、ちょっといいかな？」'),'「那个……保科，可以跟你说点事吗？」');
 assert.equal(lt.chineseTrack('「うん？」','「うん？」'),'');
 assert.equal(lt.chineseTrack('だから理由は……'.repeat(4),'だから理由は……'),'','no Chinese track');
 assert.equal(lt.chineseTrack('あいう、えお。かきく。','あいう、えお。'),'','a remainder with kana is not a track');
});

test('サノバウィッチ replay: every line reaches the reader once in Japanese and pairs with the game\'s own Chinese',()=>{
 const {r,inst}=withInstance(()=>replay(path.join(dir,'sanoba-multilang.jsonl'),{name:'SabbatOfTheWitch_crack.exe'}));
 const got=lines(r);assert.equal(got.length,9);assert.ok(got.every(l=>!/[这个們们說说吗嗎]/.test(l)),'no Chinese in the reader line');
 const paired=got.filter(l=>inst.scriptTranslation(l));
 assert.equal(inst.scriptTranslation(got[0]),'「那个……保科，可以跟你说点事吗？」');
 assert.equal(paired.length,8,'the last line\'s frame was recorded before its Chinese track arrived');
 inst.scriptAllowed=()=>false;assert.equal(inst.scriptTranslation(got[0]),'','the 零延迟翻译 switch turns it off');
});

test('女王蜂の王房 replay: a silent label stream does not hide the dialogue drawn by the engine',()=>{
 const r=replay(path.join(dir,'joouhachi-engine-lines.jsonl'),{name:'女王蜂の王房 めのう編.exe'});const got=lines(r);
 assert.equal(got[0],'めのう輝夜','the label stream line itself');
 assert.equal(got.length,13);assert.equal(new Set(got).size,13,'each drawn line once (the engine draws each line on two layers)');
 assert.equal(got[1],'穏やかな昼下がり。\n輝夜とふたり、窮屈な城から抜け出し城壁を抜ける。');
 assert.equal(got[12],'輝夜の美しさは、彼女の心のなかに宿る\n深い闇からくる美しさだなどと、\n幼い私、思考回路を狂わされた私には分かるはずもなく。');
});

test('engine draw fallback stays quiet while the hook stream delivers the line',()=>{
 const rows=[{type:'hookSource',text:'「おはよう」',sourceName:'KiriKiri1',sourceCode:'HW@1:game.exe'},{type:'hookEngineLine',engine:'krkr',phase:'begin',line:1,nvl:false,x0:0,y0:0,x1:0,y1:0,size:20,sw:800,sh:600,count:0,text:''},{type:'hookEngineLine',engine:'krkr',phase:'end',line:1,nvl:false,x0:0,y0:0,x1:100,y1:20,size:20,sw:800,sh:600,count:6,text:'「おはよう」'}];
 const fs=require('node:fs'),os=require('node:os');const f=path.join(os.tmpdir(),'megulit-adv-'+process.pid+'.jsonl');let t=1000;fs.writeFileSync(f,rows.map(m=>JSON.stringify({t:t+=50,m})).join('\n'));
 try{const r=replay(f,{name:'game.exe'});assert.deepEqual(lines(r),['「おはよう」']);assert.ok(!r.traces.some(x=>/from the engine draw/.test(x)));}finally{fs.unlinkSync(f);}
});

test('YU-RIS embed stream: a translation is never written back; the game hides the line and MeguLit draws it',()=>{
 const sent=[];const h=new HookNative({native:__dirname,hook:__dirname},()=>{},()=>({}),()=>0);h.process={};h.send=m=>sent.push(m);h.embedModeSent=true;h.notify=()=>{};
 h.state.hookThreads=[{id:'a',name:'EmbedYURIS6',selected:true}];h.embedReply(1,'什么都没有的房间',{source:'何もない部屋だ。'});
 assert.deepEqual(sent.pop(),{type:'embedReply',id:1,trans:'',hide:true});
 h.state.hookThreads=[{id:'b',name:'EmbedKrkrZ',selected:true}];h.embedReply(2,'什么都没有的房间',{source:'何もない部屋だ。'});
 assert.deepEqual(sent.pop(),{type:'embedReply',id:2,trans:'什么都没有的房间'});
 h.state.hookThreads=[{id:'a',name:'EmbedYURIS6',selected:true}];h.embedReply(3,'',{source:'x'});assert.deepEqual(sent.pop(),{type:'embedReply',id:3,trans:''},'a timeout passthrough stays a passthrough');
});
