// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {exampleSpans,exampleHtml}=require('../core/example-ruby.cjs');

function tok(surface,reading){
 return {surface,reading,readingSource:'dictionary'};
}

test('exampleSpans strips katakana affixes from mixed katakana-kanji words so only kanji get ruby',()=>{
 const cases=[
  ['メイド服',[tok('メイド服','めいどふく')],'メイド<ruby>服<rt>ふく</rt></ruby>'],
  ['アニメ化',[tok('アニメ化','あにめか')],'アニメ<ruby>化<rt>か</rt></ruby>'],
  ['ゲーム機',[tok('ゲーム機','げーむき')],'ゲーム<ruby>機<rt>き</rt></ruby>'],
  ['紙コップ',[tok('紙コップ','かみこっぷ')],'<ruby>紙<rt>かみ</rt></ruby>コップ'],
  ['ゴミ箱を',[tok('ゴミ箱','ごみばこ'),{surface:'を',reading:'を',readingSource:'dictionary'}],'ゴミ<ruby>箱<rt>ばこ</rt></ruby>を']
 ];
 for(const [text,tokens,want] of cases){
  const spans=exampleSpans(text,tokens);
  assert.equal(exampleHtml(text,spans),want,`expected katakana stripped for ${text}`);
 }
});

test('exampleSpans keeps counter ヶ inside kanji core, keeps fallback when katakana vowel expands, and rejects mismatched hiragana okurigana',()=>{
 const counter=exampleSpans('ヶ月',[tok('ヶ月','かげつ')]);
 assert.equal(exampleHtml('ヶ月',counter),'<ruby>ヶ月<rt>かげつ</rt></ruby>');

 const expanded=exampleSpans('ゲーム機',[tok('ゲーム機','げえむき')]);
 assert.equal(exampleHtml('ゲーム機',expanded),'<ruby>ゲーム機<rt>げえむき</rt></ruby>');

 const expandedWithOkurigana=exampleSpans('ゲーム化する',[tok('ゲーム化する','げえむかする')]);
 assert.equal(exampleHtml('ゲーム化する',expandedWithOkurigana),'<ruby>ゲーム化<rt>げえむか</rt></ruby>する');

 const badOkurigana=exampleSpans('歩く',[tok('歩く','あるい')]);
 assert.deepEqual(badOkurigana,[]);
});
