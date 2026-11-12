'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   E243 multilingual containers: only the Japanese track reaches the reader. */
const test=require('node:test'),assert=require('node:assert/strict');
const {japaneseTrack}=require('../core/language-tracks.cjs');
const {RepeatNormalizer}=require('../core/repeat-normalizer.cjs');
const JP='「ついてないわね。こうも見事に直撃されるなんて」',SC='「真够不走运的。竟然赶得这么分毫不差」',TC='「真夠不走運的。竟然趕得這麼分毫不差」';
test('maitetsu: ？ separated tracks keep one Japanese copy',()=>{
 assert.equal(japaneseTrack(JP+JP+'？？？？？？'+JP+JP+'？？？？？？？'+SC+SC+'？？？？？？？'+TC+TC),JP);
 assert.equal(japaneseTrack(JP+'���'+SC),JP);
 assert.equal(japaneseTrack('「確認します」「確認します」'),'「確認します」');
});
test('maitetsu: %l inline alternatives keep the Japanese one',()=>{
 assert.equal(japaneseTrack('「確認開始%l砂撒き;放沙;放沙%l;。……」'),'「確認開始砂撒き。……」');
 assert.equal(japaneseTrack('「粘着力が低下しています」;「粘合力明显下降」;「粘合力明顯下降」'),'「粘着力が低下しています」');
});
test('ordinary lines are untouched',()=>{
 for(const s of ['「えっ？？？」','「？？？」','？？？「誰だ」','そうか;うん','「50%lightだね」',JP+JP,'「そうだ」「そうだ」'])assert.equal(japaneseTrack(s),s);
});
test('container then repeat normalizer gives one line from the first block',()=>{
 const r=new RepeatNormalizer();assert.equal(r.normalize('k',japaneseTrack(JP+JP+'？？？？？？'+JP+JP+'？？？？？？'+SC+SC)),JP);
});
test('v1.1.5: a whole Chinese line is another language track; Japanese kanji-only lines are not',()=>{
 const {foreignLine}=require('../core/language-tracks.cjs');
 assert.equal(foreignLine('「您好，這裡是Soleil。需要訂購什麼嗎？」'),true);assert.equal(foreignLine('「您好，这里是Soleil。请问需要订购什么呢？」'),true);
 for(const s of ['「はい、ソレイユです。」','「一期一会」','「本日開店、大盛況」','具体的な話'])assert.equal(foreignLine(s),false);
});
test('E270 ATRI: Traditional Chinese with few function words, and a Chinese row after the Japanese rows',()=>{
 const {foreignLine,foreignRows,japaneseTrack}=require('../core/language-tracks.cjs');
 assert.equal(foreignLine('沒有光。一絲也沒有。我從完全封閉、一無所有的黑暗中，試圖爬出來。'),true);
 assert.equal(foreignLine('我從黑暗中試圖爬出來'),true);
 for(const s of ['「国立海洋研究所」','高性能アンドロイド','東京都千代田区一番町','時間学会与党'])assert.equal(foreignLine(s),false);
 assert.equal(foreignRows('光はない。一条も差さない。\n沒有光。一絲也沒有。我從黑暗中，試圖爬出來。'),'光はない。一条も差さない。');
 assert.equal(japaneseTrack('光はない。\n我從黑暗中，試圖爬出來。'),'光はない。');
 assert.equal(foreignRows('「はい」\n「そうです」'),'「はい」\n「そうです」');
});

// User report (2026-11-09, WHITE ALBUM2): a save made under a Chinese "borrowed code" patch reads back as random JIS
// kanji with Chinese commas. It is not Japanese: never captured, and the reader says why.
test('borrowed-code Chinese patch text is recognised; Japanese and real Chinese are not',()=>{
 const {borrowedCode}=require('../core/language-tracks.cjs');
 assert.equal(borrowedCode('根劃痩，扇晃顧顕亜錘廠笠盛列嬉棲能料寂，化麟晴咽廠痩己姿莉刃仔含春，'),true);
 assert.equal(borrowedCode('盛嬉枯液瑛莉既移頑凧，化麟晴咽廠痩己姿莉刃仔含春。'),true);
 assert.equal(borrowedCode('空港に着いたときから、いつ泣き出すかもしれなかった空は、'),false);
 assert.equal(borrowedCode('東京、大阪、名古屋'),false);
 assert.equal(borrowedCode('从抵达机场时起，那片随时都可能哭出来的天空，稍稍逞强了一下'),false,'plain Chinese is handled by foreignLine');
});
test('9-nine: a Chinese track starting on the Japanese closing row is cut with its next row',()=>{
 assert.equal(japaneseTrack('「ハァイ、こんにちは。\n　それともこんばんはかしら」「嗨，午安啊。\n　还是说，该说晚上好呢？」'),'「ハァイ、こんにちは。\n　それともこんばんはかしら」');
 assert.equal(japaneseTrack('「そうか」「了解」\n次の行です'),'「そうか」「了解」\n次の行です');
});
test('script identifiers are not story lines',()=>{
 const {scriptIdentifier}=require('../core/language-tracks.cjs');
 assert.equal(scriptIdentifier('10_プロローグ0725___for_summerpockets_language___for_summerpockets'),true);
 assert.equal(scriptIdentifier('ト80_幻想パー'),true);
 assert.equal(scriptIdentifier('「ねぇねぇ。なにブツブツ言ってるのー？」'),false);
 assert.equal(scriptIdentifier('第1話'),false);
});
test('underscore-led identifiers',()=>{const {scriptIdentifier}=require('../core/language-tracks.cjs');assert.equal(scriptIdentifier('_幻想パート80'),true);});
