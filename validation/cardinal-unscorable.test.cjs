// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 a tape without one dialogue line says so (トリック･オア･アリス, Adobe AIR: the hook caught a save path) instead of a bare 0 */
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../core/cardinal/score.cjs'),D=require('../core/profiles/defaults.cjs');
const run=(text,model)=>({name:'air',steps:[{t:1,hb:{type:'hookSource',text,sourceName:'Adobe AIR'},line:1,text}],o:{model,samples:[],sourceEpisodes:[{step:0,line:1,text,at:0}],choiceOffers:[],hookEvents:[],hbSent:[],hidden:{lines:0,visible:0}}});

test('the generic model with no dialogue line: 无引擎钩子, total 0, the stream and its text named',()=>{
 const r=S.score(run('.unifun.littlecheese.TrickOrAlice\\Local Store',{name:'generic',label:'通用模型'}),D.cardinal);
 assert.equal(r.total,0);assert.equal(r.unscorable.reason,'no-engine-hook');assert.deepEqual(r.unscorable.streams,['Adobe AIR']);assert.match(r.unscorable.text,/^无引擎钩子（通用模型）/);assert.match(r.unscorable.text,/Local Store/);
 assert.match(r.explain.unscorable.text,/无引擎钩子/);
});
test('an engine model with no dialogue line says there is nothing to score; a tape with a line is scorable',()=>{
 const r=S.score(run('ysr003',{name:'yuris',label:'YU-RIS 模型'}),D.cardinal);assert.equal(r.unscorable.reason,'no-dialogue');assert.match(r.unscorable.text,/^没有台词可评/);
 assert.equal(S.score(run('これは本当の台詞です',{name:'generic',label:'通用模型'}),D.cardinal).unscorable,undefined);
});
