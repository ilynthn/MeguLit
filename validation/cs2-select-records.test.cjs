// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* ISLAND（アイランド） 2026-11-27 live run (side-by-side MeguLit, the game's own copy): at the first three-way choice of the prologue the
   ISLAND source stream (EmbedToMeCS2_DrawPreserve) handed over the CatSystem2 select command's records, one per option,
     「0 com01_selC_1 俺は俺だ」「1 com01_selC_2 わからない」「2 com01_selC_3 ……せつな」
   and the kernel queued them as dialogue waiting for a native draw that never comes (choice buttons are no dialogue draw): no choice
   candidate, no locate, nothing on the reader while the game showed three buttons. The records are the choice. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Profiles=require('../core/profiles/index.cjs');
const {HookNative}=require('../core/hook-native.cjs');

const RECORDS=['0 com01_selC_1 俺は俺だ','1 com01_selC_2 わからない','2 com01_selC_3 ……せつな'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function rig(t,engine){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs2-select-'));
 const events=[],locates=[];const hook=new HookNative({native:root,hook:root,logs:root},m=>events.push(m));
 t.after(()=>{hook.stop();fs.rmSync(root,{recursive:true,force:true});});
 hook.profile=Profiles.profileFor({engine});hook.locateChoices=texts=>locates.push(texts);
 const send=text=>hook.source({type:'hookSource',sourceName:'EmbedToMeCS2_DrawPreserve',sourceCode:'EmbedToMeCS2_DrawPreserve',origin:'live',text},'EmbedToMeCS2_DrawPreserve');
 const shown=()=>events.filter(e=>e&&typeof e.hookSource==='string'&&e.hookSource).map(e=>e.hookSource);
 return {hook,events,locates,send,shown};}

test('CatSystem2: the select command records of ISLAND are the choice; the options are located on screen, never shown as dialogue',async t=>{
 const {locates,send,shown}=rig(t,'CatSystem2');
 for(const r of RECORDS)send(r);
 await sleep(900);
 assert.deepEqual(locates.at(-1),['俺は俺だ','わからない','……せつな'],'the three options go to the choice locate');
 assert.ok(!shown().some(s=>/com01_sel/.test(s)),'no record reaches the reader as a line');});

test('CatSystem2: two records whose labels differ (「0 com01_selB_1 凛音」「1 sum01 リンネ」) are a choice too; one record alone is not',async t=>{
 const a=rig(t,'CatSystem2');
 a.send('0 com01_selB_1 凛音');a.send('1 sum01 リンネ');await sleep(900);
 assert.deepEqual(a.locates.at(-1),['凛音','リンネ']);
 const b=rig(t,'CatSystem2');
 b.send('0 com01_selD_1 帰る');await sleep(900);
 assert.equal(b.locates.length,0,'a single option is no choice screen');});

test('CatSystem2: ordinary ISLAND lines that start with a number are dialogue as before (no record shape)',async t=>{
 const {locates,hook}=rig(t,'CatSystem2');
 const queued=[];const q=hook.queueIslandSource.bind(hook);hook.queueIslandSource=(text,o)=>{queued.push(text);return q(text,o);};
 for(const line of ['3 年前の夏だった。','「1 人で行くの？」','――――俺は、誰だ？'])hook.source({type:'hookSource',sourceName:'EmbedToMeCS2_DrawPreserve',origin:'live',text:line},'EmbedToMeCS2_DrawPreserve');
 await sleep(900);
 assert.deepEqual(queued,['3 年前の夏だった。','「1 人で行くの？」','――――俺は、誰だ？']);assert.equal(locates.length,0);});

test('other engines keep the kernel behaviour: a record-shaped text is not taken for a choice (choice.selectRecords is off by default)',async t=>{
 assert.equal(Profiles.profileFor({}).choice.selectRecords,false);
 assert.equal(Profiles.profileFor({engine:'CatSystem2'}).choice.selectRecords,true);
 const {locates,send}=rig(t,'KiriKiri');
 for(const r of RECORDS)send(r);await sleep(900);
 assert.equal(locates.length,0);});
