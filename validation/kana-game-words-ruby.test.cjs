// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {gameWords}=require('../services/kana.cjs');

function makeDb(lines){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE games(id INTEGER PRIMARY KEY,title TEXT);CREATE TABLE reading_events(id INTEGER PRIMARY KEY,game_id INTEGER,text TEXT,read_at INTEGER);');
 db.prepare('INSERT INTO games VALUES(1,?)').run('SampleVN');
 const ins=db.prepare('INSERT INTO reading_events(id,game_id,text,read_at) VALUES(?,1,?,?)');
 lines.forEach((line,i)=>ins.run(i+1,line,1700000000+i));
 return db;
}

test('gameWords strips engine ruby markup and control metadata before matching and returning examples',()=>{
 const db=makeDb([
  '<rきょう>今日</r>、ありがとう！',
  '<rありがとう>感謝</r>している。',
  '｜本当《ほんとう》「すごい！」',
  'おはよう！\x1d感謝\x1cかんしゃ'
 ]);
 try{
  const {words}=gameWords(db,['ありがとう','ほんとう','すごい','おはよう']);
  assert.equal(words['ありがとう']?.count,1,'ruby reading tag <rありがとう> must not count as a match');
  assert.equal(words['ありがとう']?.example?.text,'今日、ありがとう！','returned example must not expose raw <r> markup');
  assert.deepEqual(words['ありがとう']?.example?.matches,[3],'match offset must align with cleaned text');
  assert.equal(words['ほんとう'],undefined,'ruby reading inside 《ほんとう》 must not be matched as plain kana');
  assert.equal(words['すごい']?.example?.text,'本当「すごい！」','returned example must strip ｜base《reading》 markup');
  assert.equal(words['おはよう']?.example?.text,'おはよう！','returned example must strip \\x1d metadata trailer');
 }finally{
  db.close();
 }
});
