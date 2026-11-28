// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 每周热词 (owner: 「热词算法真的要改改」「短语短句也是」). Week 2026-W47 had 8 readers: 词汇 showed 「は」 (3 readers,
   3 lookups) alone with places 2 and 3 empty ("虚位以待"), 短语 and 短句 said 这一周还没有足够的短语: nothing reached 3 readers.
   Now (relay/src/community.js rankHot, web/leaderboard-view.js hotHTML):
   - 词汇 holds content words only, by the app's rule (core/content-word.cjs): は, です, する, 。 and single kana never rank;
   - in a week of fewer than 20 readers two readers are enough;
   - a list shorter than 10 is filled with the most looked-up of the rest, marked 本周候选; no empty stands;
   - 短语 / 短句 looked up by drag selection are sent as written (the app reads only 词汇 as one word). */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const load=f=>import(pathToFileURL(path.join(__dirname,'..',f)).href);
const esc=s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');

/* the W47 rows as the relay aggregates them: term, readers, lookups */
const W47=[
 {term:'は',users:3,lookups:3},{term:'です',users:2,lookups:4},{term:'する',users:2,lookups:2},{term:'ね',users:2,lookups:2},{term:'。',users:1,lookups:1},
 {term:'先輩',users:2,lookups:5},{term:'諦める',users:1,lookups:6},{term:'仕方ない',users:1,lookups:2},{term:'眩しい',users:1,lookups:1},
 {term:'気をつけて',users:1,lookups:2},{term:'胸が痛い',users:1,lookups:1},
 {term:'よろしくお願いします、先輩',users:1,lookups:1}
];

test('W47, 8 readers: 词汇 has no は / です / する / ね / 。; 先輩 (2 readers) ranks, the rest fill in as 本周候选', async()=>{
 const {rankHot}=await load('relay/src/community.js');const r=rankHot(W47,3,8);
 assert.deepEqual(r.word.map(a=>[a.rank,a.term,!!a.candidate]),[[1,'先輩',false],[2,'諦める',true],[3,'仕方ない',true],[4,'眩しい',true]]);
 assert.ok(!r.word.some(a=>['は','です','する','ね','。'].includes(a.term)));
});

test('短语 and 短句 are never left empty while someone looked one up; one reader is a 本周候选', async()=>{
 const {rankHot}=await load('relay/src/community.js');const r=rankHot(W47,3,8);
 assert.deepEqual(r.phrase.map(a=>[a.term,!!a.candidate]),[['気をつけて',true],['胸が痛い',true]]);
 assert.deepEqual(r.sentence.map(a=>[a.term,!!a.candidate]),[['よろしくお願いします、先輩',true]]);
});

test('a busy week keeps the 3-reader bar; candidates only fill a list shorter than 10', async()=>{
 const {rankHot}=await load('relay/src/community.js');
 const rows=[...'猫犬鳥魚馬牛羊虎龍蛇亀鹿'].map((ch,i)=>({term:ch+'語',users:3+i%3,lookups:10+i})).concat([{term:'先輩',users:2,lookups:99}]);
 const busy=rankHot(rows,3,40);assert.equal(busy.word.length,12);assert.ok(!busy.word.some(a=>a.term==='先輩'||a.candidate),'12 above the bar: no candidates, 2 readers not enough in a 40-reader week');
 const quiet=rankHot(rows,3,8);assert.equal(quiet.word.find(a=>a.term==='先輩').candidate,undefined,'8 readers: 先輩 ranks on its own');
});

test('the page: no empty stands, 本周候选 on filled-in entries, in Chinese, Japanese and English', async()=>{
 const view=await load('web/leaderboard-view.js');const {rankHot}=await load('relay/src/community.js');
 const awards=rankHot(W47,3,8).word;
 for(const [locale,tag]of [['zh','本周候选'],['ja','今週の候補'],['en','Candidate']]){
  const html=view.hotHTML({state:'ok',week:'2026-W47',weeks:[],settled:true,participants:8,awards},view.leaderboardWords(locale),locale,esc);
  assert.doesNotMatch(html,/虚位以待|is-vacant/);assert.doesNotMatch(html,/>は</);
  assert.equal((html.match(new RegExp('lb-candidate">'+tag,'g'))||[]).length,3,locale);
 }
 const one=view.hotHTML({state:'ok',week:'2026-W47',weeks:[],settled:true,participants:8,awards:[awards[0]]},view.leaderboardWords('zh'),'zh',esc);
 assert.equal((one.match(/role="listitem"/g)||[]).length,1,'one entry, one place');
});

test('the app sends 短语 and 短句 as written and only 词汇 as one word (with and without the tokenizer)', async()=>{
 const Content=require('../core/content-word.cjs');
 for(const term of ['気をつけて','胸が痛い','よろしくお願いします、先輩','先輩、待って！'])assert.notEqual(Content.hotCategory(term),'word',term);
 const {classifyTerm}=await load('relay/src/validate.js');
 for(const term of ['は','先輩','気をつけて','よろしくお願いします、先輩','先輩、待って！','あ'.repeat(13)])assert.equal(classifyTerm(term),Content.hotCategory(term),'relay and app agree: '+term);
});
