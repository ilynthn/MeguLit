// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// corpus() on a very large dump (review item 11: push(...lines) threw RangeError past ~100k lines), and line cutting / pairing
// on real captured game text from earlier hook replays (H:\MeguLit-Work\scratch\replay, E:\MeguLit\data\hook-streams).
// Replay-based tests are skipped when those folders are not on this machine. No game is involved.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const REPLAY=(process.env.MEGULIT_WORK||'H:/MeguLit-Work')+'/scratch/replay',KANA=/[぀-ヿ]/;
function setup(){const base=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-replay-'));process.env.MEGULIT_RUNTIME_DUMP=path.join(base,'dump');
 const game=path.join(base,'Game');fs.mkdirSync(game);
 for(const m of ['../services/runtime-dump.cjs','../services/script-harvest.cjs'])delete require.cache[require.resolve(m)];
 return{game,rd:require('../services/runtime-dump.cjs'),h:require('../services/script-harvest.cjs')};}
function write(rd,game,items){const d=rd.enable(game);fs.writeFileSync(path.join(d,'game.txt'),game);
 fs.writeFileSync(path.join(d,'index.jsonl'),items.map((it,i)=>{const file=`${String(i+1).padStart(5,'0')}_${it.how}.bin`;fs.writeFileSync(path.join(d,file),it.data);
  return JSON.stringify({seq:i+1,file,source:it.source,how:it.how,offset:0,size:it.data.length,enc:'utf-8'});}).join('\n')+'\n');}
// Lines a hook replay captured (text of hookSource / hookAuxText / hookEngineLine / embedRequest messages), one string per line
function replayLines(file){const out=[];for(const raw of fs.readFileSync(file,'utf8').split('\n')){if(!raw.trim())continue;let m;try{m=JSON.parse(raw);}catch{continue;}m=m.m||m;
  if(typeof m.text==='string'&&m.text.length>=4&&KANA.test(m.text))for(const p of m.text.split('\n'))if(p.trim())out.push(p.trim());}
 return[...new Set(out)];}

test('corpus() survives more lines than a spread push can take',()=>{
 const{game,rd}=setup();const n=150000,lines=[];for(let i=0;i<n;i++)lines.push(`これは${i}番目のテスト用の台詞です`);
 write(rd,game,[{source:'big',how:'alloc',data:Buffer.from(lines.join('\n'),'utf8')}]);
 const c=rd.corpus(game);assert.equal(c.ja.length,n);assert.equal(c.zh.length,0);});

for(const name of ['euphoria-read.jsonl','joouhachi-read.jsonl','euphoria.jsonl','joouhachi.jsonl']){
 const file=path.join(REPLAY,name);
 test(`replay ${name}: captured lines come out of a compiled-script dump cleanly and are reported unpaired without a translation`,{skip:!fs.existsSync(file)},()=>{
  const lines=replayLines(file);if(lines.length<3)return;
  const{game,rd,h}=setup(),data=Buffer.concat(lines.flatMap(l=>[Buffer.from([0x10,0x02,0,0]),Buffer.from(l,'utf8'),Buffer.from([0])]));
  write(rd,game,[{source:'memory@1000',how:'seed',data}]);
  const v=h.harvest(game),got=v.scenes.flatMap(s=>s.lines);
  assert.ok(got.length>0&&got.length<=lines.length,'every captured line at most once');
  for(const l of got){assert.ok(!/[\x00-\x1f]/.test(l.ja),'no control bytes');assert.ok(!/[<>]|\[[a-z]/i.test(l.ja)||/[<>]/.test(lines.join()),'markup stripped');}
  assert.equal(new Set(got.map(l=>l.ja)).size,got.length,'deduplicated');
  assert.equal(v.report.total,got.length);assert.equal(v.report.paired,0);assert.equal(v.report.reasons['no-translation-loaded'],got.length);
  // doubling the buffer (seed blocks overlap) changes nothing
  write(rd,game,[{source:'memory@1000',how:'seed',data},{source:'memory@8000',how:'seed',data}]);
  assert.equal(h.harvest(game,{rebuild:true}).report.total,got.length);
 });}

test('replay lines paired with a stand-in translation pair (every line accounted for)',{skip:!fs.existsSync(path.join(REPLAY,'euphoria-read.jsonl'))},()=>{
 const lines=replayLines(path.join(REPLAY,'euphoria-read.jsonl')).slice(0,12);if(lines.length<4)return;
 const{game,rd,h}=setup(),enc=(arr)=>Buffer.concat(arr.flatMap(l=>[Buffer.from([0x10,0x02,0,0]),Buffer.from(l,'utf8'),Buffer.from([0])]));
 const zh=lines.map((l,i)=>'译'+String.fromCharCode(0x4e00+i*7)+'文'.repeat(Math.max(2,Math.round([...l].length*.8))));
 write(rd,game,[{source:'memory@1000',how:'seed',data:enc(lines)},{source:'chs.pak',how:'alloc',data:enc(zh)}]);
 const r=h.harvest(game).report;/* the aligner works on lengths, so a stand-in translation may merge a pair; it must pair nearly everything and account for every line */
 assert.equal(r.total,lines.length);assert.ok(r.paired>=lines.length-1,'paired '+r.paired+'/'+r.total);assert.equal(r.paired+r.unpaired,r.total);});
