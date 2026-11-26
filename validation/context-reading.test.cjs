'use strict';
/* #1123 (user 2026-11-24, screenshot: 生に縋ろう annotated なま / すが; it is せいにすがろう). The tokens below are SudachiDict Full
   20261015 output for real game lines (taken from E:\MeguLit\data\original-text on 2026-11-26): it reads the lone noun 生 ナマ
   everywhere, 人気 ニンキ in 人気のない, and 四月一日 as しがつ いちにち. core/context-reading.cjs reads them from the words around
   them; core/learning-native.cjs tokenize() runs it, so furigana, the speech button and lookup get the same reading. */
const test=require('node:test'),assert=require('node:assert/strict');
const {contextReadings}=require('../core/context-reading.cjs');
const {numberTokens}=require('../core/counter-reading.cjs');
const {createReadingResolver}=require('../core/reading.cjs');

/* tokens from 'surface/READING/grammar' pieces, start and end counted in code points */
function line(spec){let at=0;return spec.split(' ').map(piece=>{const [surface,reading,grammar='名詞,普通名詞,一般']=piece.split('/'),start=at;at+=[...surface].length;
 return {surface,reading,base_form:surface,grammar:grammar.split(','),pos:grammar.split(',')[0],start,end:at,pitch:[1]};});}
const read=tokens=>contextReadings(tokens).map(t=>t.surface+':'+t.reading).join(' ');

test('生 is せい as life, なま as raw',()=>{
 const NOUN='名詞,普通名詞,形状詞可能';
 assert.equal(read(line(`生/ナマ/${NOUN} に/ニ/助動詞,*,* 縋ろう/スガロウ/動詞,一般,*`)),'生:せい に:ニ 縋ろう:スガロウ');
 assert.equal(read(line(`生/ナマ/${NOUN} を/ヲ/助詞,格助詞,* 諦め/アキラメ/動詞,一般,*`)),'生:せい を:ヲ 諦め:アキラメ');
 assert.equal(read(line(`生/ナマ/${NOUN} へ/ヘ/助詞,格助詞,* の/ノ/助詞,格助詞,* 執着/シュウチャク`)),'生:せい へ:ヘ の:ノ 執着:シュウチャク');
 assert.equal(read(line(`人/ヒト の/ノ/助詞,格助詞,* 生/ナマ/${NOUN} が/ガ/助詞,格助詞,* 終わる/オワル/動詞,一般,*`)),'人:ヒト の:ノ 生:せい が:ガ 終わる:オワル');
 assert.equal(read(line(`生/ナマ/${NOUN} が/ガ/助詞,格助詞,* 終わる/オワル/動詞,一般,*`)),'生:ナマ が:ガ 終わる:オワル','が without の before it is left alone');
 assert.equal(read(line(`生/ナマ/${NOUN} で/デ/助詞,格助詞,* 食べる/タベル/動詞,一般,*`)),'生:ナマ で:デ 食べる:タベル');
 assert.equal(read(line(`生/ナマ/${NOUN} の/ノ/助詞,格助詞,* 声/コエ`)),'生:ナマ の:ノ 声:コエ');
 assert.equal(read(line(`生/ナマ/${NOUN} を/ヲ/助詞,格助詞,* もう/モウ/副詞,*,* １/イチ/名詞,数詞,* つ/ツ/接尾辞,名詞的,助数詞`)).split(' ')[0],'生:ナマ','an order is beer');
 const changed=contextReadings(line(`生/ナマ/${NOUN} に/ニ/助動詞,*,*`))[0];
 assert.equal(changed.readingSource,'context');assert.deepEqual(changed.pitch,[],'the UniDic accent of なま does not fit せい');
});

test('人気 is ひとけ before のない, にんき otherwise',()=>{
 assert.equal(read(line('人気/ニンキ の/ノ/助詞,格助詞,* ない/ナイ/形容詞,非自立可能,* 廊下/ロウカ')),'人気:ひとけ の:ノ ない:ナイ 廊下:ロウカ');
 assert.equal(read(line('人気/ニンキ の/ノ/助詞,格助詞,* 絶え/タエ/動詞,一般,* た/タ/助動詞,*,*')).split(' ')[0],'人気:ひとけ');
 assert.equal(read(line('人気/ニンキ が/ガ/助詞,格助詞,* ない/ナイ/形容詞,非自立可能,*')).split(' ')[0],'人気:ニンキ','人気がない is also "not popular"');
 assert.equal(read(line('人気/ニンキ の/ノ/助詞,格助詞,* 店/ミセ')).split(' ')[0],'人気:ニンキ');
});

test('the first of a month is ついたち, a day on its own いちにち',()=>{
 const NUM='名詞,数詞,*',CTR='接尾辞,名詞的,助数詞';
 const date=numberTokens(line(`四/ヨン/${NUM} 月/ガツ/${CTR} 一/イチ/${NUM} 日/ニチ/${CTR} に/ニ/助詞,格助詞,*`));
 assert.deepEqual(date.map(t=>t.surface+':'+t.reading),['四月:しがつ','一日:ついたち','に:ニ']);
 assert.equal(numberTokens(line(`4/ヨン/${NUM} 月/ガツ/${CTR} 1/イチ/${NUM} 日/ニチ/${CTR}`))[1].reading,'ついたち');
 assert.equal(numberTokens(line(`一/イチ/${NUM} 日/ニチ/${CTR} 中/チュウ/接尾辞,名詞的,副詞可能`))[0].reading,'いちにち');
});

test('the resolver keeps a context reading (sentence cards, UniDic engine)',()=>{
 const resolver=createReadingResolver(require('node:path').join(__dirname,'fixtures','missing-jmdict.json'));
 const out=resolver.resolve(line('生/ナマ/名詞,普通名詞,形状詞可能 に/ニ/助動詞,*,* 縋ろう/スガロウ/動詞,一般,*'));
 assert.equal(out[0].reading,'せい');assert.equal(out[0].readingSource,'context');
});
