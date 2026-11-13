// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
const probe=provider=>{const h=Object.create(HookNative.prototype);h.state={};h.trace=()=>{};h.sent=[];h.originalText=provider;h.notify=m=>{h.sent.push(m);Object.assign(h.state,m);};return h;};

test('a captured line in another language becomes its Japanese line when the script has parallel tables',()=>{
 const {foreignKey}=require('../services/original-text.cjs');
 const map=new Map([[foreignKey('Okay, everyone!'),'「よし、みんな！」']]);
 const h=probe({kind:'patch',foreign:t=>map.get(foreignKey(t))||''});
 assert.equal(h.foreignJapanese('Okay,  everyone!'),'「よし、みんな！」');
 assert.equal(h.foreignJapanese('「よし、みんな！」'),'','Japanese lines are left alone');
 assert.equal(probe(null).foreignJapanese('Okay, everyone!'),'');
});

test('three unmapped non-Japanese story lines raise the switch-to-Japanese notice; Japanese clears it',()=>{
 const h=probe(null);
 for(let i=0;i<3;i++)h.languageCheck('I wonder what Monika wants to talk about today.');
 assert.equal(h.state.sourceForeign,true);assert.match(h.state.hookMessage,/切换成日文/);
 h.languageCheck('今日は、いつもの活動はお休み');assert.equal(h.state.sourceForeign,false);
 const j=probe(null);for(let i=0;i<5;i++)j.languageCheck('OK');assert.equal(j.sent.length,0,'short menu words are not story lines');
});

test('the reader shows the foreign notice; DDLC Plus offers its other language bundles',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../web/reader/modules/hook-panel.js'),'utf8');
 assert.match(src,/m\.sourceForeign===true\)chineseNotice\('foreign'\)/);
 assert.equal(typeof require('../services/original-engines/vgprompter.cjs').foreign,'function');
});

test('a Steam game with a companion launcher is started with the launcher own command line and SteamAppId (no Steam chooser)',()=>{
 const {argsIn}=require('../services/steam-companion.cjs');
 assert.deepEqual(argsIn(Buffer.from('\0WinExec\0Game.exe mages_sgate\0E:\\windev\0','latin1'),'C:/g/Game.exe'),['mages_sgate']);
 assert.equal(argsIn(Buffer.from('\0Game.exe\0nothing here','latin1'),'C:/g/Game.exe'),null,'no command line: keep the Steam path');
 const s=fs.readFileSync(path.join(__dirname,'../services/bridge.cjs'),'utf8');assert.match(s,/companion\?companionArgs:\[\]/);
 assert.match(s,/SteamAppId:String\(profile\.appid\)/);assert.match(s,/const steam=steamApp&&!companion/);
 assert.match(s,/vc_\?redist\|dxsetup\|launcher\)\/i/,'Launcher.exe is never taken for the game');
});

test('no stream selected and the game in English: the stream whose sample maps back to Japanese is picked',()=>{
 const {foreignKey}=require('../services/original-text.cjs');
 const long='I wonder what Monika wants to talk about today, since the club meeting was cancelled again and nobody told me';
 const map=new Map([[foreignKey(long+' anything at all.'),'「モニカは何を話したいんだろう」']]);
 const h=probe({kind:'patch',foreign:(t,o)=>{const k=foreignKey(t);if(map.has(k))return map.get(k);if(o?.prefix)for(const [key,v] of map)if(key.startsWith(k))return v;return '';}});
 const picked=[];h.select=id=>picked.push(id);
 h.state.hookThreads=[{id:'ui',sample:'Options',selected:false},{id:'tmp',sample:long.slice(0,110),selected:false}];
 assert.equal(h.foreignPick(),true);assert.deepEqual(picked,['tmp']);
 assert.equal(h.foreignPick(),false,'each stream is tried once');
 h.manualThread='x';h.state.hookThreads=[{id:'x',sample:long,selected:true}];assert.equal(h.foreignPick(),false,'a stream the player selected is kept');
});

test('a provisional foreign pick (boot screen text) gives way to the dialogue stream that maps to more Japanese',()=>{
 const {foreignKey}=require('../services/original-text.cjs');
 const line='I always tell myself it is about time I meet some girls or something like that.';
 const line2='Mornings are usually the worst, being surrounded by couples.';const map=new Map([[foreignKey(line2),'「朝はいつも最悪だ、カップルに囲まれて」'],[foreignKey('Skip Intro'),'スキップ'],[foreignKey(line),'「そろそろ女の子と知り合うべきだって、いつも自分に言い聞かせてる」']]);
 const h=probe({kind:'patch',foreign:t=>map.get(foreignKey(t))||''});
 const picked=[];h.select=id=>picked.push(id);
 h.state.hookThreads=[{id:'boot',sample:'Skip Intro',selected:false}];
 assert.equal(h.foreignPick(),true);assert.deepEqual(picked,['boot']);
 h.state.hookThreads=[{id:'boot',sample:'Skip Intro',selected:true},{id:'menu',sample:'Skip Intro',selected:false}];
 assert.equal(h.foreignPick(),false,'a short sample never takes over');
 const bios=['Commander Legacy BIOS v2d rev4','Type: Binary Thin Client','Chip RAM: 2MB','Fast RAM: 8MB'];bios.forEach(b=>map.set(foreignKey(b),b));
 h.state.hookThreads.push({id:'bios',sample:bios.slice(0,3).join('\n'),selected:false});h.foreignPick();h.state.hookThreads[2]={id:'bios',sample:bios.join('\n'),selected:false};
 assert.equal(h.foreignPick(),false,'a changing BIOS dump is not prose');
 h.state.hookThreads.push({id:'say',sample:line,selected:false});
 /* E501 (DDLC Plus live: waiting for a second sample lost the first story line and left 「Skip Intro」 in the reader):
    while the pick is a short label, the first mapped prose sample takes over */
 assert.equal(h.foreignPick(),true,'one prose sample replaces a label pick');assert.deepEqual(picked,['boot','say']);
 h.state.hookThreads=[{id:'boot',sample:'Skip Intro',selected:false},{id:'say',sample:line2,selected:true}];
 assert.equal(h.foreignPick(),false,'never goes back');
 h.manualThread='mine';h.state.hookThreads=[{id:'mine',sample:'Skip Intro',selected:true},{id:'say2',sample:line,selected:false}];
 assert.equal(h.foreignPick(),false,'a stream the player chose is kept');
});
