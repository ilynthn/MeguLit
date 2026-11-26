// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 Cardinal's YU-RIS, BGI and generic replay models (tools/reader-replay/engine-models.cjs) against the control file core
   really writes (core/engine-draw.cjs KrkrTransport) and the native parsers they port (draw-control.cjs) */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const M=require('../tools/reader-replay/engine-models.cjs'),ED=require('../core/engine-draw.cjs');
const S=require('../core/cardinal/score.cjs'),D=require('../core/profiles/defaults.cjs');
const u16=s=>Buffer.from(s,'utf16le'),bom=s=>Buffer.concat([Buffer.from([0xff,0xfe]),u16(s)]);
const tmp=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'cardinal-models-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
const write=(dir,pid,cfg,viaRoles)=>{const t=new ED.KrkrTransport(pid,{tmp:dir});t.flush({...ED.settings({draw:{roles:cfg}}),...(viaRoles?{viaRoles}:{})},new Map([['本文',{zh:'译文',ruby:[]}]]));clearTimeout(t.timer);return t;};

test('model choice by engine and stream names; the generic model models nothing and says so in the result',()=>{
 
 assert.equal(M.pick({engine:'kirikiri'}),'krkr');assert.equal(M.pick({engine:'siglus'}),'generic');assert.equal(M.pick({}),'generic');
 const g=new M.GenericModel({pid:1});assert.deepEqual(g.line('本文'),[]);assert.equal(g.summary().label,'通用模型');
 const steps=[{line:1,text:'これは本文です',t:1795253000000,hb:{type:'hookSource',text:'これは本文です'}}];
 const r=S.score({name:'g',steps,o:{model:g.summary(),samples:[],sourceEpisodes:[{step:0,line:1,text:'これは本文です',at:0}],choiceOffers:[],hookEvents:[],hbSent:[],hidden:{lines:0,visible:0}}},D.cardinal);
 assert.equal(r.detail.model.label,'通用模型');assert.equal(r.explain.model.name,'generic');
});
