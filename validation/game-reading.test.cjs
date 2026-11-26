'use strict';
/* #1134 / #1135 (user 2026-11-23: 「人名/特殊名词等注音优先扫描游戏文本+VNDB数据 不要靠自己猜」) and #1131 (2026-11-24: the speech button,
   the furigana and the lookup card each read differently). Readings come from, in order: the game's ruby on this line, ruby it
   printed before, ruby its whole script always gives the word, VNDB names, the dictionary; a name the tokenizer only guessed has
   none. The token rows are SudachiDict Full 20261015 output for real lines (STEINS;GATE 0, euphoria, Cafe Stella; taken from
   E:\MeguLit\data\original-text on 2026-11-26). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {scriptReadings,readingsIn,gameTokens,unknownNames}=require('../core/game-reading.cjs');
const {LocalLearning}=require('../core/learning-native.cjs');

function line(spec){let at=0;return spec.split(' ').map(piece=>{const [surface,reading,grammar='名詞,普通名詞,一般']=piece.split('/'),start=at;at+=[...surface].length;
 return {surface,reading,base_form:surface,normalized:surface,grammar:grammar.split(','),pos:grammar.split(',')[0],start,end:at,pitch:[1]};});}
const shown=tokens=>tokens.map(t=>t.surface+':'+t.reading).join(' ');
const NAME='名詞,固有名詞,人名,名',SURNAME='名詞,固有名詞,人名,姓',NUM='名詞,数詞,*',CTR='接尾辞,名詞的,助数詞';

test('the whole script gives a word its reading only when it always reads it one way',()=>{
 const map=scriptReadings([null,[['櫻羽','おうば'],['空港','ここ']],[['櫻羽','オウバ']],[['空港','くうこう']],null,[['あの','あの']]]);
 assert.equal(map.get('櫻羽'),'おうば','katakana and hiragana of one reading are one reading');
 assert.equal(map.has('空港'),false,'a word the script reads two ways (a gikun on one line) is left to the line');
 assert.equal(map.has('あの'),false);
});

test('this line’s ruby comes before ruby seen earlier, which comes before the script’s',()=>{
 const found=readingsIn('四月一日胡頽子が呼ぶ',{line:[['胡頽子','ぐみ']],learned:{'胡頽子':'こたいし','四月一日':'わたぬき','島':'しま'},script:new Map([['四月一日','しがつついたち'],['呼ぶ','よぶ']])});
 assert.deepEqual(found,[['胡頽子','ぐみ','line'],['四月一日','わたぬき','learned'],['呼ぶ','よぶ','script']]);
});

test('a game reading takes whole tokens and nothing downstream reads them again',async()=>{
 const raw=line(`四/ヨン/${NUM} 月/ガツ/${CTR} 一/イチ/${NUM} 日/ニチ/${CTR} 胡/コ/${SURNAME} 頽/タイ 子/コ/接尾辞,名詞的,一般 が/ガ/助詞,格助詞,*`);
 const out=gameTokens(raw,[['四月一日','わたぬき','learned'],['胡頽子','ぐみ','script']]);
 assert.equal(shown(out),'四月一日:わたぬき 胡頽子:ぐみ が:ガ');assert.equal(out[0].readingSource,'game');
 assert.equal(shown(gameTokens(line('島民/トウミン の/ノ/助詞,格助詞,*'),[['島','しま','learned']])),'島民:トウミン の:ノ','the ruby of 島 is not the 島 of 島民');
 const L=new LocalLearning(path.join(os.tmpdir(),'megulit-game-reading'));L.ready=async()=>{};
 L.worker={stdin:{write(text){const {id}=JSON.parse(text),p=L.pending.get(id);clearTimeout(p.timer);L.pending.delete(id);p.resolve(JSON.parse(JSON.stringify(raw)));}}};
 L.load=function(){if(this.index)return;this.index=new Map();this.byId=new Map();this.english=new Map();};
 L.useGameReadings(()=>({learned:{'四月一日':'わたぬき'}}));
 const N={names:true},text='四月一日胡頽子が';
 assert.equal((await L.tokenize(text,N))[0].reading,'わたぬき','not しがつ ついたち: the game’s reading comes before numbers');
 assert.equal((await L.tokenize(text))[0].reading,'しがつ','pages other than the reader do not use the game');
 L.useGameReadings(()=>({learned:{'四月一日':'しがつついたち'}}));
 assert.equal((await L.tokenize(text,N))[0].reading,'しがつついたち','ruby learned later replaces the cached line');
 L.useGameReadings(null);assert.equal((await L.tokenize(text,N))[0].reading,'しがつ');
});

test('a name the tokenizer only guessed has no reading; a name it knows keeps its own',()=>{
 /* 紅莉栖 (Kurisu) came as クレナイ / リー / スミカ, 桐生萌郁 (Kiryuu Moeka) as キリュウ / モエ / カオル, 昂晴 (Kousei) as ノボル + 晴 ハレ */
 assert.equal(shown(unknownNames(line(`紅/クレナイ/${NAME} 莉/リー/${NAME} 栖/スミカ/${NAME} を/ヲ/助詞,格助詞,*`))),'紅: 莉: 栖: を:ヲ');
 assert.equal(shown(unknownNames(line(`桐生/キリュウ/${SURNAME} 萌/モエ/${NAME} 郁/カオル/${NAME}`))),'桐生:キリュウ 萌: 郁:','the surname SudachiDict knows keeps its reading');
 assert.equal(shown(unknownNames(line(`昂/ノボル/${NAME} 晴/ハレ は/ハ/助詞,係助詞,*`))),'昂: 晴: は:ハ');
 assert.equal(shown(unknownNames(line(`佐藤/サトウ/${SURNAME} さん/サン/接尾辞,名詞的,一般`))),'佐藤:サトウ さん:サン');
 assert.equal(shown(unknownNames(line(`頼/ライ/${NAME} むっ/ムッ/動詞,一般,*`))),'頼:ライ むっ:ムッ','a stem before its okurigana is no name');
 const named=unknownNames([{...line(`昂晴/こうせい/${NAME}`)[0],readingSource:'name'}]);assert.equal(named[0].reading,'こうせい','a VNDB name stays');
 const dropped=unknownNames(line(`鈴/スズ/${NAME} さん/サン/接尾辞,名詞的,一般`))[0];
 assert.equal(dropped.readingSource,'unknown-name');assert.equal(dropped.guess,'スズ');assert.equal(dropped.reading_ambiguous,true,'speech lets the engine say it');
});

test('the reader binds the game’s readings and the speech button reads the line as furigana does',()=>{
 const reader=fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8');
 assert.match(reader,/learning\.useNames\(null\);this\.bindReadings\(learning,game\);/);
 assert.match(reader,/hooks\?\.sourceRuby/);assert.match(reader,/gameRuby\?\.dict\(this\.gal\?\.styleSync\?\.profileKey\)/);assert.match(reader,/scriptRuby\(this\.root,exe,game\?\.id\)/);
 assert.equal(reader.match(/useGameReadings\?\.\(null\)/g)?.length,2,'game change and game exit');
 const learning=fs.readFileSync(path.join(__dirname,'..','core','learning-native.cjs'),'utf8');
 assert.match(learning,/tokens=await this\.tokenizeWhole\(args\.text,options\)/,'a line the game wrapped is one word for the speech button too');
 assert.equal(typeof require('../services/original-text.cjs').scriptRuby,'function');
});
/* RRFZ #1192: a short word of an earlier source took the place of a longer one (島 learned cut the script's 島津); a game switched while a
   line was being tokenized had the old game's readings cached for the new one */
test('equal lengths keep line > learned > script; a short word alone still applies (the longest-word case is the #1287 test below)',()=>{
 const raw=line(`島/シマ/${SURNAME} 津/ツ が/ガ/助詞,格助詞,* 来る/クル/動詞,非自立可能,*`);
 const tie=readingsIn('島津が',{line:[['島津','しまつ']],learned:{'島津':'しまづ'}});
 assert.equal(shown(gameTokens(raw.slice(0,3),tie)),'島津:しまつ が:ガ','this line’s ruby first');
 assert.equal(shown(gameTokens(raw,[['島','しま','learned']])),'島:しま 津:ツ が:ガ 来る:クル','alone the short word still applies');
});
test('a game switched while a line is tokenized never caches the old game’s readings',async()=>{
 const raw=line(`島/シマ/${SURNAME} 津/ツ が/ガ/助詞,格助詞,*`);
 const L=new LocalLearning(path.join(os.tmpdir(),'megulit-game-reading-switch'));L.ready=async()=>{};
 let answer=null;L.worker={stdin:{write(text){const {id}=JSON.parse(text);answer=()=>{const p=L.pending.get(id);clearTimeout(p.timer);L.pending.delete(id);p.resolve(JSON.parse(JSON.stringify(raw)));};}}};
 L.load=function(){if(this.index)return;this.index=new Map();this.byId=new Map();this.english=new Map();};
 L.useGameReadings(()=>({script:new Map([['島津','しまづ']])}));
 const N={names:true},pending=L.tokenize('島津が',N);
 for(let i=0;i<50&&!answer;i++)await new Promise(r=>setTimeout(r,5));
 L.useGameReadings(null);answer();
 const out=await pending;
 assert.notEqual(out[0].reading,'しまづ','made with the readings of the game now bound');
 assert.notEqual((await L.tokenize('島津が',N))[0].reading,'しまづ','and nothing of the old game is in the cache');
});

test('gameTokens prefers a longer match across sources before shorter higher-priority pieces',()=>{
 const r=readingsIn('島津が来る',{learned:{'島':'しま'},script:new Map([['島津','しまづ']])});
 assert.equal(shown(gameTokens(line('島/シマ 津/ツ が/ガ/助詞,格助詞,* 来る/クル/動詞,一般,*'),r)),'島津:しまづ が:ガ 来る:クル');
 assert.equal(shown(gameTokens(line('島/トウ に/ニ/助詞,格助詞,* 行く/イク/動詞,一般,*'),readingsIn('島に行く',{learned:{'島':'しま'},script:new Map([['島津','しまづ']])}))),'島:しま に:ニ 行く:イク');
 assert.equal(shown(gameTokens(line('島/シマ 津/ツ'),[['島津','しまづ','line'],['島津','とうしん','script']])),'島津:しまづ','same-length candidates keep source priority');
});
