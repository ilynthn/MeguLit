'use strict';
/* RRFZ #1176: a late translation for an older line went to the newest compositor line that merely contained it, so the answer for
   「はい」 replaced the translation of the line on screen, 「はい、わかりました」. The exact line is matched first now. */
const test=require('node:test'),assert=require('node:assert/strict'),{CompositorHost}=require('../core/compositor-host.cjs');
const host=()=>{const sent=[],fake={available:()=>true,start:()=>true,stop(){},send(){},style(){},hookGlyphDots(){},choices(){},annotate:o=>sent.push(o)};
 const h=new CompositorHost({make:()=>fake});h.cc=fake;return {h,sent};};
test('a late answer for the older short line goes to that line, not the newer one holding it',()=>{
 const {h,sent}=host();h.remember(1,'「はい」');h.remember(2,'「はい、わかりました」');
 h.text('「はい」','是。');
 assert.deepEqual(sent.map(o=>[o.id,o.tl]),[[1,'是。']]);
 h.text('「はい、わかりました」','好的，我明白了。');
 assert.deepEqual(sent.at(-1),{id:2,tl:'好的，我明白了。'});
});
test('without an exact line the newest line that holds the text still gets it',()=>{
 const {h,sent}=host();h.remember(1,'別の台詞');h.remember(2,'名前「はい、わかりました」');
 h.text('「はい、わかりました」','好的。');
 assert.equal(sent.at(-1).id,2);
 assert.equal(h.lineFor('全然違う'),null);
});
test('ruby uses the same exact-first line',()=>{
 const {h}=host();h.remember(1,'はい');h.remember(2,'はい、わかりました');
 assert.equal(h.lineFor('はい'),1);assert.equal(h.lineFor('はい、わかりました'),2);
});
