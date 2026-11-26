// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {paragraphs,extract}=require('../services/news-article.cjs');

test('paragraphs removes <rt> and <rp> ruby readings while keeping base text intact',()=>{
  const html=`
    <p><ruby>紅魔族<rt>こうまぞく</rt></ruby>の<ruby>爆裂魔法<rp>（</rp><rt>エクスプロージョン</rt><rp>）</rp></ruby>が炸裂する。</p>
    <p><ruby><rb>聖</rb><rt>せい</rt><rb>剣</rb><rt>けん</rt></ruby>と<ruby>魔王<rt>まおう</ruby>の物語。</p>
    <p>普通の<ruby class="x">日本語<rt class="y">にほんご</rt></ruby>テキスト。</p>
  `;
  assert.deepEqual(paragraphs(html),[
    '紅魔族の爆裂魔法が炸裂する。',
    '聖剣と魔王の物語。',
    '普通の日本語テキスト。'
  ]);
});

test('unclosed <rt> never swallows following body text or paragraphs',()=>{
  const html=`
    <p><ruby>魔王<rt>まおう</ruby>が世界を覆う。</p>
    <p><ruby>騎士<rt>きし</p>
    <p>途中の本文はそのまま残る。</p>
    <p><ruby>勇者<rt>ゆうしゃ</rt></ruby>が現れた。</p>
  `;
  const out=paragraphs(html);
  assert.equal(out[0],'魔王が世界を覆う。');
  assert.equal(out[2],'途中の本文はそのまま残る。');
  assert.equal(out[3],'勇者が現れた。');
});

test('extract drops ruby readings inside article bodies without disturbing plain paragraphs',()=>{
  const page=`<!doctype html><html><head><title>新作ニュース</title></head><body><article>
    <p>『<ruby>蒼穹<rp>(</rp><rt>そうきゅう</rt><rp>)</rp></ruby>の彼方』が発表されました。</p>
    <p>発売日は来月を予定しています。</p>
  </article></body></html>`;
  const res=extract(page,'https://example.com/news/1');
  assert.equal(res.title,'新作ニュース');
  assert.deepEqual(res.paragraphs,[
    '『蒼穹の彼方』が発表されました。',
    '発売日は来月を予定しています。'
  ]);
});
