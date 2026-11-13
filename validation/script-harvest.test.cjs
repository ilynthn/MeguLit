// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// services/script-harvest.cjs on dump folders laid out the way MeguLitDump32/64.dll writes them: a compiled Japanese
// script found by seed expansion (several overlapping copies), a Chinese patch decrypted from a file, engine markup.
// No game is involved; the last test reads the native self-test's real DLL output when it is on this machine.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');

const SELF=(process.env.MEGULIT_WORK||'H:/MeguLit-Work')+'/runtime-dump-selftest';
// The self-test folder is shared with other branches' runs; use it only when it holds a run of this DLL (seed blocks).
const seedRun=()=>{try{const d=SELF+'/out64';return fs.readdirSync(d).some(k=>/"how":"seed"/.test(fs.readFileSync(path.join(d,k,'index.jsonl'),'utf8')));}catch{return false;}};
function setup(){const base=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-harvest-'));process.env.MEGULIT_RUNTIME_DUMP=path.join(base,'dump');
 const game=path.join(base,'Game');fs.mkdirSync(game);
 for(const m of ['../services/runtime-dump.cjs','../services/script-harvest.cjs'])delete require.cache[require.resolve(m)];
 return{game,rd:require('../services/runtime-dump.cjs'),h:require('../services/script-harvest.cjs')};}
function write(rd,game,items){const d=rd.enable(game);fs.writeFileSync(path.join(d,'game.txt'),game);
 const lines=items.map((it,i)=>{const file=`${String(i+1).padStart(5,'0')}_${it.how}.bin`;fs.writeFileSync(path.join(d,file),it.data);
  return JSON.stringify({seq:i+1,file,source:it.source,how:it.how,offset:0,size:it.data.length,enc:it.enc});});
 fs.writeFileSync(path.join(d,'index.jsonl'),lines.join('\n')+'\n');return d;}
const JA=[['*scene01',''],['陽菜','「傘、持ってくればよかったね」'],['','窓の外を眺めながら、彼女は小さく[笑/わら]った。'],['陽菜','「でも、こういう日も嫌いじゃないよ」'],
 ['*scene02',''],['','教室には僕たち二人しか残っていない。'],['','時計の針の音だけが、静かに響いている。'],['先生','「早く帰りなさい、もう六時ですよ」']];
const ZH=[['*scene01',''],['阳菜','「早知道带伞来就好了」'],['','她望着窗外，轻轻地笑了。'],['阳菜','「不过，这样的日子我也不讨厌哦」'],
 ['*scene02',''],['','教室里只剩下我们两个人。'],['','只有时钟指针的声音在静静回响。'],['老师','「快点回家吧，已经六点了」']];
// Compiled-script style: opcode bytes, then the string; names as their own string before the line.
const compiled=(rows,enc)=>{const parts=[];for(const [a,b] of rows){const op=Buffer.from([0x10,0x02,0,0]);
 if(!b){parts.push(op,Buffer.from(a+'\0','latin1'));continue;}if(a)parts.push(op,Buffer.from(new TextEncoder().encode(`【${a}】`)),Buffer.from([0]));parts.push(op,Buffer.from(b,'utf8'),Buffer.from([0]));}
 return Buffer.concat(parts);};

test('markup is stripped, ruby keeps its base, speakers are split',()=>{const{h}=setup(),{clean}=h._internal;
 assert.deepEqual(clean('【陽菜】「傘、[持/も]ってきた？」'),{speaker:'陽菜',text:'「傘、持ってきた？」'});
 assert.deepEqual(clean('先生「早く帰りなさい」\\n[l]'),{speaker:'先生',text:'「早く帰りなさい」'});
 assert.equal(clean('|教室《きょうしつ》には<color=red>誰</color>もいない%K;').text,'教室には誰もいない');
 assert.equal(clean('[ruby text="とけい"]時計[/ruby]の音').text,'時計の音');});

test('overlapping seed blocks collapse to one script; Japanese and Chinese pair by scene with a full report',()=>{
 const{game,rd,h}=setup();const ja=compiled(JA),zh=compiled(ZH);
 write(rd,game,[{source:'memory@1000',how:'seed',enc:'utf-8',data:ja},{source:'memory@9000',how:'seed',enc:'utf-8',data:ja.subarray(0,Math.floor(ja.length*.6))},
  {source:'chs.pak',how:'alloc',enc:'utf-8',data:zh}]);
 const v=h.harvest(game);assert.equal(v.scenes.length,2);assert.deepEqual(v.scenes.map(s=>s.label),['scene01','scene02']);
 assert.deepEqual(v.report,{...v.report,total:6,paired:6,unpaired:0});
 const first=v.scenes[0].lines[0];assert.equal(first.speaker,'陽菜');assert.equal(first.zh,'「早知道带伞来就好了」');
 assert.equal(v.scenes[0].lines[1].ja,'窓の外を眺めながら、彼女は小さく笑った。');
 assert.ok(fs.existsSync(path.join(rd.dirFor(game),'harvest.json')),'saved per game');});

test('without a translation every line is reported unpaired with the reason',()=>{const{game,rd,h}=setup();
 write(rd,game,[{source:'memory@1000',how:'seed',enc:'utf-8',data:compiled(JA)}]);
 const r=h.report(game);assert.equal(r.total,6);assert.equal(r.paired,0);assert.deepEqual(r.reasons,{'no-translation-loaded':6});});

test('provider answers captured lines at once and feeds them back as seeds; reload reads harvest.json',()=>{
 const{game,rd,h}=setup();write(rd,game,[{source:'s',how:'seed',enc:'utf-8',data:compiled(JA)},{source:'c',how:'alloc',enc:'utf-8',data:compiled(ZH)}]);
 const p=h.provider(game),r=p.resolve('陽菜「でも、こういう日も嫌いじゃないよ」');
 assert.equal(r.status,'exact');assert.equal(r.translation,'「不过，这样的日子我也不讨厌哦」');
 assert.equal(p.resolve('見たことのない台詞です').status,'none');
 assert.match(fs.readFileSync(path.join(rd.dirFor(game),'seeds.txt'),'utf8'),/見たことのない台詞です\n$/);
 const saved=JSON.parse(fs.readFileSync(path.join(rd.dirFor(game),'harvest.json'),'utf8'));
 delete require.cache[require.resolve('../services/script-harvest.cjs')];const again=require('../services/script-harvest.cjs').harvest(game);
 assert.equal(again.builtAt,saved.builtAt,'not rebuilt while the dump did not grow');});

test('switched off: no seeds are written',()=>{const{game,rd,h}=setup();write(rd,game,[]);rd.disable(game);
 h.seed(game,'教室には僕たち二人しか残っていない。');assert.equal(fs.existsSync(path.join(rd.dirFor(game),'seeds.txt')),false);});

test('real DLL output of the native self-test (seed blocks from a stand-in game) harvests the whole script',{skip:!seedRun()},()=>{
 const out=path.resolve(SELF+'/out64');process.env.MEGULIT_RUNTIME_DUMP=out;
 for(const m of ['../services/runtime-dump.cjs','../services/script-harvest.cjs'])delete require.cache[require.resolve(m)];
 const h=require('../services/script-harvest.cjs'),game=path.resolve(SELF+'/game64');
 const v=h.build(game),lines=v.scenes.flatMap(s=>s.lines.map(l=>l.ja));
 for(const n of [0,37,203,399])assert.ok(lines.some(l=>l.endsWith(`第${n}話`)),'line '+n);
 assert.ok(v.report.total>=400,'total '+v.report.total);});
