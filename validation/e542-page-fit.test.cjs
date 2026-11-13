// SPDX-License-Identifier: GPL-3.0-or-later
/* E542 CLANNAD HD prologue (live, embed mode, game window ~1240x930): the narration page is one line from the game and
   MeguLit's text must stay inside the game client area. Fixture: the recorded HookBridge messages of that page. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {replay}=require('./helpers/hook-replay.cjs');
const fit=require('../web/reader/modules/game-fit.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const PAGE='そう、雪だ。今なお、それは降り続け、僕の体を白く覆っていく。ああ…僕はこんなところで何をしているのだろう…。いつからこんなところに、ひとりぼっちで居るのだろう…。………。雪に埋もれた…僕の手。それが、何かを掴んでいた。引き上げる。';

const PARTS=['そう、雪だ。','今なお、それは降り続け、僕の体を白く覆っていく。','ああ…','僕はこんなところで何をしているのだろう…。','いつからこんなところに、ひとりぼっちで居るのだろう…。','………。','雪に埋もれた…僕の手。','それが、何かを掴んでいた。','引き上げる。'];
const shownLines=r=>r.events.filter(e=>e&&typeof e.hookSource==='string'&&e.hookSource).map(e=>e.hookSource);
test('E542 replay (recorded, old HookBridge without parts): the flushed batch is one line, each new game line replaces it',()=>{
 const r=replay(path.join(__dirname,'helpers','prologue-replay','clannad-prologue.jsonl'),{name:'SiglusEngine_Steam.exe'});
 assert.deepStrictEqual(shownLines(r),['一面、白い世界…','…','雪…',PAGE,'真っ白な手。','女の子の手だった。']);
});
test('E542 replay ADV: the batch of nine callbacks shows one sentence per player click, in order, never the whole page',()=>{
 assert.strictEqual(PARTS.join(''),PAGE);
 const r=replay(path.join(__dirname,'helpers','prologue-replay','clannad-prologue-adv.jsonl'),{name:'SiglusEngine_Steam.exe'});
 const lines=shownLines(r);
 assert.ok(!lines.includes(PAGE),'the whole page is never drawn');
 assert.deepStrictEqual(lines,['一面、白い世界…','…','雪…',...PARTS,'真っ白な手。','女の子の手だった。']);
});
test('E542 page parts: clicks made before the flush are caught up; a held skip jumps to the last part; a new line drops the queue',()=>{
 const {HookNative}=require('../core/hook-native.cjs');let now=100000;const ev=[];
 const h=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/none'},m=>ev.push(m),()=>{},()=>now);h.trace=()=>{};h.send=()=>{};
 const src=()=>ev.filter(e=>e&&typeof e.hookSource==='string'&&e.hookSource).map(e=>e.hookSource);
 h.advance();now+=1000;h.advance();now+=1000;
 h.sourcePage({type:'hookSource',text:PAGE,parts:PARTS,partsAgeMs:2500,sourceName:'EmbedSiglus',sourceCode:'X'},'g.exe');
 assert.strictEqual(src().pop(),PARTS[2],'two clicks since the first callback');
 now+=100;assert.strictEqual(h.advance(),false,'a double click is one advance');
 now+=1000;h.advance();assert.strictEqual(src().pop(),PARTS[3]);
 now+=1000;h.skipHeld(true);assert.strictEqual(src().pop(),PARTS[8]);h.skipHeld(false);
 now+=1000;assert.strictEqual(h.advance(),false);
 h.sourcePage({type:'hookSource',text:PAGE,parts:PARTS,partsAgeMs:0,sourceName:'EmbedSiglus',sourceCode:'X'},'g.exe');now+=1000;
 h.sourcePage({type:'hookSource',text:'真っ白な手。',sourceName:'EmbedSiglus',sourceCode:'X'},'g.exe');now+=1000;
 assert.strictEqual(h.advance(),false);assert.strictEqual(src().pop(),'真っ白な手。');
});
test('E542 HookBridge sends the separate callbacks of a flushed batch; the reader forwards player advances',()=>{
 assert.match(read('native/HookSourceFrames.cs'),/public List<string> Parts\(string output,DateTime now,out double ageMs\)/);
 assert.match(read('native/HookBridge.cs'),/parts=pageParts\.ToArray\(\),partsAgeMs=/);
 assert.match(read('services/reader.cjs'),/this\.gal\?\.hooks\?\.advance\?\.\(\)/);
});

test('E542 fit: the logged layout (top 818, 4 lines of 46.5 px + translation, client bottom 1004) shrinks into the client',()=>{
 const client={top:74,bottom:74+930};
 const jp=4*46.47+2*17.63,cn=3*24*1.65;let win={top:818,bottom:818+jp+cn},f=1,p;
 for(let i=0;i<6;i++){p=fit.plan(win,client,f);if(p.fit===f)break;const k=p.fit/f;win={top:win.top,bottom:win.top+(win.bottom-win.top)*k};f=p.fit;}
 assert.ok(f<1&&f>=fit.MIN,'scaled '+f);
 const moved={top:win.top+p.shift,bottom:win.bottom+p.shift-p.room};
 assert.ok(moved.bottom<=client.bottom,'bottom '+moved.bottom);assert.ok(moved.top>=client.top);
});

test('E542 fit: a block that fits stays as it is; one too tall at 60 % moves up, then the translation scrolls',()=>{
 const client={top:0,bottom:900};
 assert.deepStrictEqual(fit.plan({top:700,bottom:880},client,1),{fit:1,shift:0,room:0});
 const p=fit.plan({top:700,bottom:1100},client,fit.MIN);assert.strictEqual(p.fit,fit.MIN);assert.strictEqual(p.shift,-204);assert.strictEqual(p.room,0);
 const q=fit.plan({top:50,bottom:1100},client,fit.MIN);assert.strictEqual(q.shift,-46);assert.ok(q.room>0,'the rest scrolls inside the translation');
});

test('E542 fit: loaded in the reader, only for the bound dialogue window, reset by a new line',()=>{
 assert.ok(JSON.parse(read('web/reader/modules.json')).includes('game-fit'));assert.match(read('web/reader/module-list.js'),/"game-fit"/);
 const src=read('web/reader/modules/game-fit.js');
 assert.match(src,/body\.tomoyo-gal-bound\.megulit-fit-on \.sentence-window:not\(\.tome-island-page\)/);
 assert.match(src,/m\.hookSource!==line\)\{line=m\.hookSource;reset\(\);/);
 assert.doesNotMatch(src,/background:/,'nothing is drawn over the game');
});
