// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 openings bilingual in every game: a line a localized build draws as a picture in another language (Summer
   Pockets Steam Chinese, the opening poem) is read by OCR, mapped back to its Japanese table line in order, and shown with
   the drawn line's own look. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const ot=require('../services/original-text.cjs');
const {HookNative}=require('../core/hook-native.cjs');

/* a table's other-language column as the Siglus reader builds it: every row in order, duplicates kept in seq */
function table(rows){const m=new Map(),seq=[];for(const [zh,ja] of rows){const k=ot.foreignKey(zh);seq.push([k,ja,zh]);if(!m.has(k))m.set(k,ja);}m.seq=seq;return m;}
const prologue=[['很久以前。','ずっと昔。'],['小的时候。','小さな頃。'],['在仿佛不会结束的夏天里肆意奔跑。','永遠みたいな夏を、駆け回っていた。'],['和家人一起。','家族と。']];
const poem=[['很久以前','ずっと昔'],['小的时候','小さな頃'],['曾经在似乎永远不会结束的夏日里尽情玩耍','永遠みたいな夏を、駆け回っていた'],['和家人一起','家族と'],['和朋友一起','友達と'],
 ['太阳每天都会把耀眼的光芒洒向大地','太陽はそんな毎日を、まぶしく照らし続けてくれた'],['不知从何时起那些回忆都埋在了记忆深处','いつの間にか、そんな思い出は記憶の彼方へ']];

test('Chinese punctuation does not split a key: the drawn line without its full stop finds the table line',()=>{
 assert.equal(ot.foreignKey('太阳每天都会把耀眼的光芒洒向大地。'),ot.foreignKey('太阳每天都会把耀眼的光芒洒向大地'));
 assert.equal(ot.foreignKey('无论怎么玩耍，也从不会无事可做'),ot.foreignKey('无论怎么玩耍也从不会无事可做'));
 const m=table(prologue);assert.equal(ot.foreignNear(m,'在仿佛不会结東的夏天里肆意奔跑'),'永遠みたいな夏を、駆け回っていた。','an OCR slip still finds it');
 assert.equal(ot.foreignNear(m,'完全不同的一句话内容'),'');
});
test('a poem follows its table: OCR slips and the picture own wording keep their place in the sequence',()=>{
 let now=0;const f=ot.foreignSeq(table([...prologue,...poem]),()=>now);
 const said=['很久以前','小的时候','曾经畅游在亻方永．1亘的夏日、一中','和家人一起','和朋友一起','阳每天都一会把耀眼的光芒洒向一地。','不知不觉间，这份回忆也飞向了脑海的彼岸'].map(t=>{now+=4000;return f(t);});
 assert.deepEqual(said,poem.map(r=>r[1]));
 now+=1000;assert.equal(f('为了寻找那份光芒，我飞了起来'),'','a line with nothing alike after the last find is not guessed');
 now+=60000;assert.equal(f('一句毫无关系的长长的中文文字'),'','long after the last find nothing is guessed');
});
test('one item read again keeps its line; the reader drops foreign items with no table line and keeps the drawn line',()=>{
 const asked=[];const h=Object.create(HookNative.prototype);h.originalText={foreign:(t,o)=>{asked.push(t);return o?.fuzzy?(asked.length===1?'ずっと昔':'小さな頃'):'';}};h.scriptAllowed=()=>true;
 assert.equal(h.foreignArt('很久以前',7),'ずっと昔');assert.equal(h.foreignArt('很久以',7),'ずっと昔');assert.equal(asked.length,1);
 assert.equal(h.artScanState(0).foreign,true);
 const src=read('services/reader.cjs');assert.match(src,/message\.foreign===true/);assert.match(src,/shown=text;text=ja/);assert.match(src,/\.\.\.\(shown&&\{shown\}\)/);
});
test('the art layer takes the drawn line look and the bridge reads foreign rows with the Chinese OCR',()=>{
 const js=read('web/reader/modules/art-text.js');assert.match(js,/r\.color/);assert.match(js,/r\.glow/);assert.match(js,/megulit-art-ja/);assert.match(js,/'text-align','center'/);assert.match(js,/cx=g\.left\+gameW\/2/,'centred on the game window, not the screen origin (E578)');
 const cs=read('native/PageLocator.cs');assert.match(cs,/zh-Hans-CN/);assert.match(cs,/static void Paint\(Bitmap image, Row r\)/);assert.match(cs,/foreign = it\.Foreign/);
 assert.match(read('native/GalWindowBridge.cs'),/Bool\(d,"foreign"\)\)/);
 assert.match(read('services/original-engines/scenes.cjs'),/out\.seq=seq/);
});
