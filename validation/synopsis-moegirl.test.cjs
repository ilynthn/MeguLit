// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 the Chinese synopsis comes from Moegirlpedia (CC BY-NC-SA 3.0, source named) when the work has a page there; otherwise the machine
   translation of VNDB's text as before. No network. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Synopses}=require('../core/library.cjs'),policy=require('../core/synopsis-policy.cjs');
const lib=require('../core/library.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'syn-'));
const MG='这是一部由某社制作的视觉小说作品，讲述了一位女科学家被她的前同事绑架，并被迫接受长生医学实验的故事。后面还有很多内容。';
const mk=(moegirl,translate)=>new Synopses({config:tmp()},{bangumi:async()=>null,lookup:async()=>({text:'A scientist is kidnapped by her former colleague.',alttitle:'ダストマニア'}),moegirl,translate:translate||(async(t,l)=>l==='zh'?'机翻文本':'')});
test('the VNDB names (titles in every language, aliases) are searched on Moegirlpedia too',async()=>{let asked=null;const s=new Synopses({config:tmp()},{bangumi:async()=>null,lookup:async()=>({text:'x y z',alttitle:'',names:['魔法使いの夜','魔法使之夜']}),moegirl:async t=>{asked=t;return null;},translate:async()=>''});await s.get({mediaId:'3',titles:['原题'],vndbId:'v3',lang:'zh',moegirl:true});assert.ok(asked.includes('魔法使之夜')&&asked.includes('原题'));});
test('the policy accepts the Moegirlpedia source',()=>{assert.equal(policy.approved('萌娘百科 · CC BY-NC-SA 3.0'),true);assert.equal(policy.approved('某个随便的网站'),false);});
test('zh: the Moegirlpedia text, its source, no machine translation',async()=>{let asked=null;const s=mk(async t=>{asked=t;return {text:MG,title:'x'};});const r=await s.get({mediaId:'1',titles:['ダストマニア・グロテスク'],vndbId:'v1',lang:'zh',moegirl:true});
 assert.equal(r.text,MG);assert.match(r.source,/^萌娘百科/);assert.ok(asked.includes('ダストマニア'),'the VNDB alternative title is tried too');
 const en=await s.get({mediaId:'1',titles:['x'],vndbId:'v1',lang:'en'});assert.equal(en.source,'VNDB');assert.match(en.text,/scientist/);
 const forced=await s.get({mediaId:'1',titles:['x'],vndbId:'v1',lang:'en',moegirl:true});assert.equal(forced.text,MG,'the switch shows Moegirlpedia in any UI language');assert.equal(forced.lang,'zh');
 const vndbOnly=await s.get({mediaId:'1',titles:['x'],vndbId:'v1',lang:'zh',moegirl:false});assert.ok(!/萌娘/.test(vndbOnly.source),'VNDB only: no Moegirlpedia text');});
test('no Moegirlpedia page: the machine translation of VNDB text, as before',async()=>{const s=mk(async()=>null);const r=await s.get({mediaId:'2',titles:['t'],vndbId:'v2',lang:'zh',moegirl:true});assert.equal(r.text,'机翻文本');assert.ok(!/萌娘/.test(r.source));});
test('moegirlText: titles joined, a disambiguation page and a stub are skipped, the best title wins, three paragraphs at most',async()=>{
 const pages={a:{ns:0,title:'Other',extract:'某某可以指：1.作品 2.人物 3.更多更多更多更多'},b:{ns:0,title:'短',extract:'太短'},c:{ns:0,title:'Dust',extract:MG+'\n\n第二段。'+'字'.repeat(60)+'\n\n第三段。'+'字'.repeat(60)+'\n\n第四段。'+'字'.repeat(60)},d:{ns:0,title:'Other2',extract:MG}};
 let url='';const f=async u=>{url=u;return {ok:true,json:async()=>({query:{pages}})};};
 const r=await lib._moegirlText?.(['[090522][B]Dust','Dust2'],{fetcher:f});if(!lib._moegirlText)return;assert.match(url,/titles=Dust%7CDust2/);assert.equal(r.title,'Dust');assert.equal(r.text.split(String.fromCharCode(10,10)).length,3);});
