'use strict';
/* A script switched to Chinese (Summer Pockets set to Simplified Chinese): no Japanese furigana on the Chinese line. */
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../web/reader/modules/furigana.js');
test('Chinese lines get no ruby, Japanese lines keep it',()=>{
  assert.equal(F.chineseLine('我们这个夏天还没有结束，对吧'),true);
  assert.equal(F.chineseLine('夏休みはまだ終わっていない'),false);
  assert.equal(F.chineseLine('東京駅前'),false,'a kanji-only Japanese name is still Japanese');
  assert.equal(F.chineseLine('会社員'),false);
  assert.deepEqual(F.annotations('我们这个夏天还没有结束，对吧',[{surface:'夏天',reading:'かてん'}]),[]);
  assert.deepEqual(F.withGameRuby('我们这个夏天还没有结束，对吧',[{start:0,end:1,reading:'x'}],{'夏天':'なつ'}),[]);
  assert.ok(F.annotations('夏休み',[{surface:'夏休み',reading:'なつやすみ'}]).length>0);
});
