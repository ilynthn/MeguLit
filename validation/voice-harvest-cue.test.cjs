// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// services/voice-harvest.cjs, middleware cues (CRI / Wwise via modules/AudioMore.cpp): cue-only events.jsonl lines
// (no file, name "<acb>|<cue>" or a Wwise event) bound to hooked lines, with script names winning over time.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');

function fresh(){const base=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-voicecue-'));process.env.MEGULIT_RUNTIME_DUMP=path.join(base,'dump');
 for(const m of ['../services/runtime-dump.cjs','../services/voice-harvest.cjs'])delete require.cache[require.resolve(m)];
 const game=path.join(base,'Game');fs.mkdirSync(game);const vh=require('../services/voice-harvest.cjs');fs.mkdirSync(vh.voiceDir(game),{recursive:true});
 const ev=list=>fs.appendFileSync(path.join(vh.voiceDir(game),'events.jsonl'),list.map(e=>JSON.stringify({file:'',bytes:0,crc:'00000000',ms:0,raw:false,stopped:false,obj:'p',...e})+'\n').join(''));
 return{base,game,vh,ev};}
const T=1_700_000_000_000;

test('CRI cues bind to the line they start with; clicks heard on every line do not; no clip means no lookup',()=>{const{base,game,vh,ev}=fresh();
 const texts=['めぐみん「爆裂魔法！」','カズマ「やめろ」','アクア「えー」','ダクネス「ん……」'];
 texts.forEach((t,i)=>vh.noteLine(game,t,T+i*5000));
 ev(texts.map((t,i)=>({api:'cri',start:T+i*5000-30,name:'se.acb|click'})));
 ev([{api:'cri',start:T+120,name:'voice/ch01.acb|mgm_0001'},{api:'cri',start:T+5000+200,name:'voice/ch01.acb|id:42'},{api:'wwise',start:T+15000+90,name:'Play_VO_dks_0007'}]);
 const r=vh.build(game);assert.ok(r.added>=3);
 assert.deepEqual(vh.cueFor(game,texts[0]),{cue:'voice/ch01.acb|mgm_0001',api:'cri',src:'time'});
 assert.equal(vh.cueFor(game,texts[1]).cue,'voice/ch01.acb|id:42');
 assert.equal(vh.cueFor(game,texts[2]),null,'the click cue is a sound effect');
 assert.equal(vh.cueFor(game,texts[3]).api,'wwise');
 assert.equal(vh.lookup(game,texts[0]),null,'a cue alone has nothing to play');
 process.env.MEGULIT_TEST_ROOT=base;assert.equal(vh.publish(base,game),0);});

test('a cue keeps its first line; a script voice name or number moves it and beats time',()=>{const{game,vh,ev}=fresh();
 vh.noteLine(game,'一行目',T);vh.noteLine(game,'二行目',T+4000);
 ev([{api:'cri',start:T+100,name:'v.acb|line_0001'}]);vh.build(game);
 // A later session: the same cue lands (by time) on another line, e.g. after a skip; it stays with the first line.
 vh.noteLine(game,'三行目',T+100000);ev([{api:'cri',start:T+100050,name:'v.acb|line_0001'}]);vh.build(game);
 assert.equal(vh.cueFor(game,'一行目').cue,'v.acb|line_0001');assert.equal(vh.cueFor(game,'三行目'),null);
 // Time would give cue 42 to 二行目; the script says it is 四行目's voice ("0042"), and Wwise "Play_VO_9" is 五行目's.
 ev([{api:'cri',start:T+4100,name:'v.acb|id:42'},{api:'wwise',start:T+4200,name:'Play_VO_9'}]);
 vh.build(game,{script:[{text:'四行目',voice:'0042'},{text:'五行目',voice:'play_vo_9'},{text:'一行目',voice:'LINE_0001.ogg'}]});
 assert.deepEqual(vh.cueFor(game,'四行目'),{cue:'v.acb|id:42',api:'cri',src:'script'});
 assert.equal(vh.cueFor(game,'五行目').api,'wwise');
 assert.equal(vh.cueFor(game,'二行目'),null,'script-named cues never go to a line by time');
 assert.equal(vh.cueFor(game,'一行目').src,'script');});

test('a played clip for a cue-bound line keeps the cue; a cue never replaces a clip',()=>{const{game,vh,ev}=fresh();
 const dir=vh.voiceDir(game),b=Buffer.alloc(44+20000,1);b.write('RIFF',0);b.write('WAVE',8);fs.writeFileSync(path.join(dir,'00001.wav'),b);
 vh.noteLine(game,'台詞A',T);ev([{api:'cri',start:T+60,name:'v.acb|a'}]);vh.build(game);
 fs.appendFileSync(path.join(dir,'events.jsonl'),JSON.stringify({file:'00001.wav',api:'dsound',start:T+50,ms:2000,crc:'x1',stopped:false})+'\n');
 vh.build(game);
 const hit=vh.lookup(game,'台詞A');assert.equal(hit.file,'00001.wav');assert.equal(hit.cue,'v.acb|a');
 vh.noteLine(game,'台詞B',T+9000);fs.appendFileSync(path.join(dir,'events.jsonl'),JSON.stringify({file:'00001.wav',api:'dsound',start:T+9050,ms:2000,crc:'x2',stopped:false})+'\n');
 ev([{api:'cri',start:T+9040,name:'v.acb|b'}]);vh.build(game);
 assert.equal(vh.lookup(game,'台詞B').file,'00001.wav');assert.equal(vh.cueFor(game,'台詞B').cue,'v.acb|b');});
