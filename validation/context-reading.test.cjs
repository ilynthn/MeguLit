'use strict';
/* #1123 (user 2026-11-24, screenshot: 生に縋ろう annotated なま / すが; it is せいにすがろう). The tokens below are SudachiDict Full
   20261015 output for real game lines (taken from E:\MeguLit\data\original-text on 2026-11-26): it reads the lone noun 生 ナマ
   everywhere, 人気 ニンキ in 人気のない, and 四月一日 as しがつ いちにち. core/context-reading.cjs reads them from the words around
   them; core/learning-native.cjs tokenize() runs it, so furigana, the speech button and lookup get the same reading. */
const test=require('node:test'),assert=require('node:assert/strict');
const {contextReadings}=require('../core/context-reading.cjs');
const {numberTokens}=require('../core/counter-reading.cjs');
const {createReadingResolver}=require('../core/reading.cjs');
const {splitReading}=require('../core/furigana.js');

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

/* User 2026-11-26: いつのまにか / 何時の間にか annotated なんじのあいだ. Tokens are SudachiDict Full 20261015 output as LocalLearning.tokenize
   hands them to contextReadings (after the JMdict joins: 何時か, 何時まで, 何時も are one token). Corpus check, 10083 lines from 54 games
   (E:\MeguLit\data\original-text, every line with 何時 / の間に / 何処 / 何故 / 其処 / 此処 / 彼処 / 一寸 / 兎に角 / 矢張 / 流石 / 呉々 /
   可笑し / 所謂 / 暫く / 勿論 / 成程 / 一体, 10% of the 出来 lines): 263 tokens changed, read one by one: 間 あいだ→ま 7, 何時 → いつ 1
   (何時の間に), 何時 → なんじ 132 (+ 何時か 2, 何時まで 2, 何時頃 1), 矢張 やばり→やはり 112 (逆転裁判 矢張政志), 彼処 あすこ→あそこ 4,
   一寸 → いっすん 1, 出来 しゅったい→でき 1. None wrong; 何時に呼び出されてよーが is なんじ or いつ. Left alone: 56 何時 いつ (何時から,
   何時だった, 何時です…: either reading) and 9 Japanese 何時 なんどき (何時になったら, 何時届くか, 毎朝何時から…: no plain clue). */
/* 2026-11-27: 何時の間にか, いつの間に and the other phrases are joined into their JMdict word by LocalLearning.dictionaryWords before
   this runs (validation/dictionary-phrases.test.cjs); contextReadings no longer lists phrases and leaves 間 as it is. */
test('phrases are the dictionary path\'s; 何 before a particle is なに, 言う is いう',()=>{
 const P='助詞,格助詞,*',N='名詞,普通名詞,一般';
 assert.equal(read(line(`いつ/イツ/代名詞,*,* の/ノ/${P} 間/アイダ/${N} に/ニ/${P} か/カ/助詞,副助詞,*`)),'いつ:イツ の:ノ 間:アイダ に:ニ か:カ');
 assert.equal(read(line(`二人/フタリ/${N} の/ノ/${P} 間/アイダ/${N} に/ニ/${P}`)).split(' ')[2],'間:アイダ','between two people stays あいだ');
 assert.equal(read(line(`何/ナン/代名詞,*,* を/ヲ/${P} 言う/ユウ/動詞,一般,*`)),'何:なに を:ヲ 言う:いう');
 assert.equal(read(line(`何/ナン/代名詞,*,* より/ヨリ/${P}`)).split(' ')[0],'何:なに');
 assert.equal(read(line(`何/ナン/代名詞,*,* で/デ/${P}`)).split(' ')[0],'何:ナン','なん before d, t, n');
 assert.equal(read(line(`何/ナン/代名詞,*,* か/カ/助詞,副助詞,*`)).split(' ')[0],'何:ナン','なんか');
 assert.equal(read(line(`何/ナン/代名詞,*,* 回/カイ/名詞,普通名詞,助数詞可能`)).split(' ')[0],'何:ナン','before a counter');
 const a=contextReadings(line(`何/ナン/代名詞,*,* を/ヲ/${P}`));assert.deepEqual(contextReadings(a),a,'running it twice changes nothing');
});

test('何時 is なんじ only where the time of day is plain',()=>{
 const P='助詞,格助詞,*',N='名詞,普通名詞,一般',Q='？/?/補助記号,句点,*',PRON='代名詞,*,*';
 const first=spec=>{const t=contextReadings(line(spec)).find(t=>t.surface.startsWith('何時'));return t.surface+':'+t.reading;};
 assert.equal(first(`今/イマ/${N} 何時/ナンドキ/${N} ${Q}`),'何時:なんじ','今何時？');
 assert.equal(first(`今/イマ/${N} 、/、/補助記号,読点,* 何時/イツ/${PRON} だ/ダ/助動詞,*,* ${Q}`),'何時:なんじ','今、何時だ？');
 assert.equal(first(`そもそも/ソモソモ/副詞,*,* 今/イマ/${N} は/ハ/助詞,係助詞,* 何時/イツ/${PRON} だ/ダ/助動詞,*,* 。/。/補助記号,句点,*`),'何時:なんじ');
 assert.equal(first(`今/イマ/${N} 何時か/いつか/副詞,*,* な/ナ/助詞,終助詞,*`),'何時か:なんじか','今何時かな');
 assert.equal(splitReading('何時か','なんじか')[0].reading,'なんじ','the ruby of 何時か sits on 何時');
 assert.equal(first(`何時/イツ/${PRON} だ/ダ/助動詞,*,* と/ト/${P} 思っ/オモッ/動詞,一般,* てる/テル/助動詞,*,*`),'何時:なんじ');
 assert.equal(first(`何日/ナンニチ/${N} の/ノ/${P} 何時/ナンドキ/${N} だ/ダ/助動詞,*,*`),'何時:なんじ');
 assert.equal(first(`バイト/バイト/${N} 終わる/オワル/動詞,一般,* の/ノ/${P} 何時/ナンドキ/${N} ${Q}`),'何時:なんじ');
 assert.equal(first(`何時/イツ/${PRON} に/ニ/${P} 起きる/オキル/動詞,一般,*`),'何時:なんじ');
 assert.equal(first(`何時/イツ/${PRON} くらい/クライ/助詞,副助詞,* に/ニ/${P} 寝る/ネル/動詞,一般,*`),'何時:なんじ');
 assert.equal(first(`何時/イツ/${PRON} の/ノ/${P} 便/ビン/${N}`),'何時:なんじ');
 assert.equal(first(`「/「/補助記号,括弧開,* ……/……/補助記号,一般,* 何時/ナンドキ/${N} な/ナ/助動詞,*,* の/ノ/助詞,準体助詞,* ${Q}`),'何時:なんじ');
 assert.equal(read(line(`何時/イツ/${PRON} から/カラ/${P} 何時まで/いつまで/副詞,*,*`)),'何時:なんじ から:カラ 何時まで:なんじまで');
 assert.equal(first(`何時/ナンドキ/${N} で/デ/${P} も/モ/助詞,係助詞,* いい/イイ/形容詞,非自立可能,*`),'何時:いつ','何時でも');
 assert.equal(first(`今/イマ/${N} は/ハ/助詞,係助詞,* 何時/イツ/${PRON} で/デ/${P} も/モ/助詞,係助詞,*`),'何時:イツ','今は何時でも');
 assert.equal(first(`何時も/イツモ/副詞,*,* 一緒/イッショ/${N} だ/ダ/助動詞,*,*`),'何時も:イツモ');
 assert.equal(first(`何時/イツ/${PRON} か/カ/助詞,副助詞,* 会える/アエル/動詞,一般,*`),'何時:イツ','何時か会える');
 assert.equal(first(`何時/イツ/${PRON} に/ニ/${P} なっ/ナッ/動詞,非自立可能,* たら/タラ/助動詞,*,*`),'何時:イツ','何時になったら');
 assert.equal(first(`何時まで/いつまで/副詞,*,* 待つ/マツ/動詞,一般,*`),'何時まで:いつまで');
 assert.equal(first(`先輩/センパイ/${N} は/ハ/助詞,係助詞,* 何時/イツ/${PRON} から/カラ/${P} 気付い/キヅイ/動詞,一般,*`),'何時:イツ','no clue: left alone');
 assert.equal(first(`郵便/ユウビン/${N} だ/ダ/助動詞,*,* と/ト/${P} 何時/ナンドキ/${N} 届く/トドク/動詞,一般,*`),'何時:ナンドキ','no clue: left alone');
 assert.equal(first(`何時間/ナンジカン/${N} も/モ/助詞,係助詞,*`),'何時間:ナンジカン');
});

test('other kanji spellings: SudachiDict reads them right, these four are fixed',()=>{
 const P='助詞,格助詞,*',ADV='副詞,*,*';
 assert.equal(read(line(`何処/ドコ/代名詞,*,* へ/ヘ/${P} 行く/イク/動詞,非自立可能,*`)),'何処:ドコ へ:ヘ 行く:イク');
 assert.equal(read(line(`一寸/チョット/${ADV} 待っ/マッ/動詞,一般,* て/テ/助詞,接続助詞,*`)).split(' ')[0],'一寸:チョット');
 assert.equal(read(line(`一寸/チョット/${ADV} たり/タリ/助詞,副助詞,* と/ト/${P} も/モ/助詞,係助詞,*`)).split(' ')[0],'一寸:いっすん','一寸たりとも');
 assert.equal(read(line(`一寸/チョット/${ADV} の/ノ/${P} こと/コト/名詞,普通名詞,一般 で/デ/助詞,格助詞,*`)).split(' ')[0],'一寸:チョット','一寸のことで is ちょっと (review #1266)');
 assert.equal(read(line(`一寸/チョット/${ADV} の/ノ/${P} 虫/ムシ/名詞,普通名詞,一般`)).split(' ')[0],'一寸:いっすん','一寸の虫 is いっすん');
 assert.equal(read(line(`彼処/アスコ/代名詞,*,* に/ニ/${P} 見える/ミエル/動詞,一般,*`)).split(' ')[0],'彼処:あそこ');
 assert.equal(read(line('彼処/アスコ/代名詞,*,*')),'彼処:あそこ','a line of its own');
 assert.equal(read(line(`矢張/ヤバリ/名詞,固有名詞,人名 の/ノ/${P} 撮っ/トッ/動詞,一般,*`)).split(' ')[0],'矢張:やはり');
 assert.equal(read(line(`料理/リョウリ/名詞,普通名詞,サ変可能 出来/シュッタイ/名詞,普通名詞,サ変可能 なく/ナク/助動詞,*,* ない/ナイ/形容詞,非自立可能,*`)).split(' ')[1],'出来:でき');
 for(const [w,r] of [['兎に角','トニカク'],['矢張り','ヤハリ'],['流石','サスガ'],['勿論','モチロン'],['成程','ナルホド'],['暫く','シバラク'],['一体','イッタイ'],['何故','ナゼ'],['此処','ココ'],['其処','ソコ']])
  assert.equal(read(line(`${w}/${r}/${ADV}`)),`${w}:${r}`);
});
