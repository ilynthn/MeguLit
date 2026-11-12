'use strict';
// 2026-11-13: OCR rows (art text, e.g. the STEINS;GATE prologue) snap to the script line they read.
const test=require('node:test');const assert=require('node:assert');
const {Matcher}=require('../services/original-text.cjs');

test('an OCR row with a recognition slip gives back the script line near the reading position',()=>{
 const rt=['バタフライ効果という言葉を知っているか？','知らないなら調べるのだ。それぐらいの慎重さが求められているのだ','「ねぇねぇ。なにブツブツ言ってるのー？」'];
 const m=new Matcher(rt,rt);
 assert.equal(m.near('知らないなら調べるのた。それぐらいの慎重さが求められているのだ'),1);
 assert.equal(m.near('バタフライ効果という言葉を知っているか?'),0);
 assert.equal(m.near('まったく関係のない看板の文字です'),-1,'unrelated text is not snapped');
 assert.equal(m.near('知らない'),-1,'too short');
 assert.equal(m.near('知らないなら調べ'),-1,'a small part of a line is not the line');
});

test('the reader replaces an OCR row by its script line before translating',()=>{
 const s=require('node:fs').readFileSync(require('node:path').join(__dirname,'../services/reader.cjs'),'utf8');
 assert.match(s,/message\.source==='ocr'&&message\.visible===true&&text\.trim\(\)\)\{const snapped=this\.gal\?\.hooks\?\.ocrSnap\?\.\(text\)/);
});
