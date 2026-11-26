// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-26 Cardinal's YU-RIS, BGI and generic replay models (tools/reader-replay/engine-models.cjs) against the control file core
   really writes (core/engine-draw.cjs KrkrTransport) and the native parsers they port (draw-control.cjs) */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const C=require('../tools/reader-replay/draw-control.cjs'),M=require('../tools/reader-replay/engine-models.cjs'),ED=require('../core/engine-draw.cjs');
const S=require('../core/cardinal/score.cjs'),D=require('../core/profiles/defaults.cjs');
const u16=s=>Buffer.from(s,'utf16le'),bom=s=>Buffer.concat([Buffer.from([0xff,0xfe]),u16(s)]);
const tmp=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'cardinal-models-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
const write=(dir,pid,cfg,viaRoles)=>{const t=new ED.KrkrTransport(pid,{tmp:dir});t.flush({...ED.settings({draw:{roles:cfg}}),...(viaRoles?{viaRoles}:{})},new Map([['本文',{zh:'译文',ruby:[]}]]));clearTimeout(t.timer);return t;};

test('the ports still match the shipped native parsers',()=>{assert.equal(C.source('yuris'),true);assert.equal(C.source('bgi'),true);});

test('YU-RIS control: the cases of native/megulithook/selftest/yurisdraw-control.cpp',()=>{
 assert.equal(C.yuris(bom('#cfg roles=1\r\n')),true);assert.equal(C.yuris(bom('#cfg roles=1 embed=0 zh=1\r\n本文\t译文\r\n')),true);assert.equal(C.yuris(u16('#cfg roles=1 embed=0\n')),true);
 for(const s of ['#cfg roles=0\r\n','#cfg roles=10\r\n','#cfg roles=0\r\n#cfg roles=1\r\n','body #cfg roles=1\r\n','#cfg roles=1','#cfg roles=1 roles=0\r\n','#cfg roles=1 roles=1\r\n','#cfgjunk roles=1\r\n','#cfg roles\r\n'])
  assert.equal(C.yuris(bom(s)),false,JSON.stringify(s));
 assert.equal(C.yuris(bom('#cfg roles=1 '+' '.repeat(9000)+'\r\n')),false,'an incomplete first line in the 1024-byte read');
 assert.equal(C.yuris(Buffer.from('#cfg roles=1\n','latin1')),false,'raw ASCII');
 assert.equal(C.yuris(Buffer.from([0xff,0xfe,0x23,0,0x63,0,0x66,0,0x67,0,0x20,0,0x72,0,0x6f,0,0x6c,0,0x65,0,0x73,0,0x3d,0,0x31,0,0x0a])),false,'odd-byte newline');
});

test('BGI control: roles map with the JS viaRoles grammar, stops at body lines',()=>{
 const c=C.bgi(bom('#cfg roles=1 embed=0 zh=1\r\n#clearline\r\n#role 3d40d,31e44=line\r\n#role 3d40d=name\r\n#role XYZ=line\r\n#role 3d40d=dialog\r\n本文\t\t译文\r\n#role 1=line\r\n'));
 assert.equal(c.on,true);assert.deepEqual(c.roles,[{via:'3d40d,31e44',role:'line'},{via:'3d40d',role:'name'}]);
 assert.equal(C.roleOf(c.roles,'3d40d,31e44,1234'),'line');assert.equal(C.roleOf(c.roles,'3d40d,9'),'name');assert.equal(C.roleOf(c.roles,'3d40,1'),null);
 assert.equal(C.bgi(bom('#cfg roles=0\r\n#role 1=line\r\n')).on,false);assert.equal(C.validRole('1,2,3,4,5,6,7','line'),false);assert.equal(C.validRole('123456789','line'),false);
});

test('YU-RIS model: draw rows only while core authorizes them, a written-back text on an EmbedYURIS line is a fault',t=>{
 const dir=tmp(t),pid=4711,rows=[];const m=new M.YurisModel({pid,tmp:dir,report:r=>rows.push(r)});
 assert.deepEqual(m.line('「おはよう」'),[],'no control file: nothing hooked');
 write(dir,pid,true);const out=m.line('「おはよう」');assert.equal(out.length,1);assert.match(out[0],/^ToMe_DRAWRUN engine=yuris run=1 n=6 x0=0 y0=0 x1=120 y1=0 size=24 text=「おはよう」$/);
 assert.ok(Buffer.byteLength(m.line('あ'.repeat(100))[0].split(' text=')[1])<=120,'text cut at 120 bytes like Flush');
 write(dir,pid,false);assert.deepEqual(m.line('次'),[]);assert.equal(m.summary().observing,false);
 m.threads([{id:'1',name:'EmbedYURIS6',selected:true}]);m.sent({type:'embedReply',id:3,trans:'',hide:true});assert.deepEqual(m.summary().bad,[]);
 m.sent({type:'embedReply',id:4,trans:'早上好'});assert.match(m.summary().bad[0],/YU-RIS line 4/);
 assert.equal(rows.length,2);
});

test('BGI model: rows with the role this game maps, faults for translation on a hide-only stream',t=>{
 const dir=tmp(t),pid=5150,m=new M.BgiModel({pid,tmp:dir});write(dir,pid,true,['3d40d,31e44=line','3d40d=name']);
 const out=m.line('　朝が来た。');assert.equal(out.length,2);assert.match(out[0],/ via=3d40d,31e44 role=line text=　朝が来た。$/);assert.equal(out[1],'ToMe_DRAWRUN engine=bgi end run=1 rows=1');
 m.threads([{id:'2',name:'BGI2',selected:true,hideOnly:true}]);m.sent({type:'embedMode',mode:'hide'});assert.deepEqual(m.summary().bad,[]);
 m.sent({type:'embedMode',mode:'translate'});m.sent({type:'embedReply',id:1,trans:'早晨来了'});assert.equal(m.summary().bad.length,2);
 const plain=new M.BgiModel({pid:1,tmp:dir});plain.threads([{id:'3',name:'BGI2',selected:true}]);plain.sent({type:'embedMode',mode:'translate'});assert.deepEqual(plain.summary().bad,[],'a stream that can draw may embed');
});

test('model choice by engine and stream names; the generic model models nothing and says so in the result',()=>{
 assert.equal(M.pick({engine:'yuris'}),'yuris');assert.equal(M.pick({engine:'',threads:[{name:'EmbedYURIS6'}]}),'yuris');assert.equal(M.pick({engine:'BGI'}),'bgi');assert.equal(M.pick({engine:'ethornell'}),'bgi');
 assert.equal(M.pick({engine:'kirikiri'}),'krkr');assert.equal(M.pick({engine:'siglus'}),'generic');assert.equal(M.pick({}),'generic');
 const g=new M.GenericModel({pid:1});assert.deepEqual(g.line('本文'),[]);assert.equal(g.summary().label,'通用模型');
 const steps=[{line:1,text:'これは本文です',t:1795253000000,hb:{type:'hookSource',text:'これは本文です'}}];
 const r=S.score({name:'g',steps,o:{model:g.summary(),samples:[],sourceEpisodes:[{step:0,line:1,text:'これは本文です',at:0}],choiceOffers:[],hookEvents:[],hbSent:[],hidden:{lines:0,visible:0}}},D.cardinal);
 assert.equal(r.detail.model.label,'通用模型');assert.equal(r.explain.model.name,'generic');
});
