// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const G=require('../services/grammar.cjs');
const B=require('../services/bluebook.cjs');

test('grammar scenes() and bluebook examplesFor() preserve candidate game ruby pairs',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const ruby=[['紅魔','こうま'],['爆裂','ばくれつ']];
  const list=[{
   text:'紅魔の爆裂をあげくに見た。',
   title:'SampleVN',
   gameId:1,
   origin:'history',
   translation:'结果看到了红魔的爆裂。',
   translationSource:'group',
   ruby,
   readAt:1700000000,
   readBy:false
  }];
  const tokens=[
   {surface:'紅魔',base_form:'紅魔',pos:'名詞',grammar:['名詞','固有名詞']},
   {surface:'の',base_form:'の',pos:'助詞',grammar:['助詞','格助詞']},
   {surface:'爆裂',base_form:'爆裂',pos:'名詞',grammar:['名詞','普通名詞']},
   {surface:'を',base_form:'を',pos:'助詞',grammar:['助詞','格助詞']},
   {surface:'あげく',base_form:'あげく',pos:'名詞',grammar:['名詞','普通名詞']},
   {surface:'に',base_form:'に',pos:'助詞',grammar:['助詞','格助詞']},
   {surface:'見',base_form:'見る',pos:'動詞',grammar:['動詞','一般']},
   {surface:'た',base_form:'た',pos:'助動詞',grammar:['助動詞']},
   {surface:'。',base_form:'。',pos:'補助記号',grammar:['補助記号','句点']}
  ];

  const sc=await G.scenes(db,list,async()=>tokens);
  assert.equal(sc.length,1);
  assert.deepEqual(sc[0].ruby,ruby,'grammar scenes() must carry candidate game ruby to sentenceHTML');

  const ex=B.examplesFor([{id:'bb-1',hits:['あげく']}],list);
  assert.equal(ex['bb-1']?.length,1);
  assert.deepEqual(ex['bb-1'][0].ruby,ruby,'bluebook examplesFor() must carry candidate game ruby to exAttr');

  const g=await import('../web/grammar.js');
  const html=g.sentenceHTML(sc[0],v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  assert.match(html,/data-exr-ruby="/,'sentenceHTML must emit data-exr-ruby when scene carries game ruby');
 }finally{
  db.close();
 }
});
