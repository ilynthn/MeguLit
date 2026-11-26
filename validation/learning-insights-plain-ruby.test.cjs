// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const I=require('../services/learning-insights.cjs'),{openStore}=require('../services/store.cjs');

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-insights-ruby-'));
  const db=openStore(root);
  t.after(()=>{try{db.close();}catch{}fs.rmSync(root,{recursive:true,force:true});});
  db.prepare("INSERT INTO games(id,title) VALUES('g1','Game One')").run();
  return {root,db};
}

test('plainLine strips all engine ruby formats and trailing \\x1d metadata without leaking readings',()=>{
  assert.equal(I.plainLine('彼女の<ruby>顔<rt>かお</rt></ruby>を<ruby="おお">覆</ruby>う'), '彼女の顔を覆う');
  assert.equal(I.plainLine('｜蒼穹《そうきゅう》の|空《そら》を見上げる'), '蒼穹の空を見上げる');
  assert.equal(I.plainLine('雪を払う。\x1d雪\x1cゆき\x1d払\x1cはら'), '雪を払う。');
  assert.equal(I.plainLine('　車の窓はびっしり<rしも>霜</r>だらけで、\n出かける'), '車の窓はびっしり霜だらけで、出かける');
  assert.equal(I.plainLine('<b>雪</b><br>を払う'), '雪を払う');
});

test('refresh and exampleLine tokenize clean text and return clean examples with accurate highlight spans',async t=>{
  const {db}=fixture(t);
  const now=Math.floor(Date.now()/1000);
  const add=db.prepare('INSERT INTO reading_events(session_id,game_id,text,read_at,original) VALUES(1,?,?,?,?)');
  add.run('g1','<ruby>雪<rt>ゆき</rt></ruby>を払う。',now-60,JSON.stringify({translation:'拂去雪。',translationSource:'group'}));
  add.run('g1','｜蒼穹《そうきゅう》の空だ。\x1d蒼穹\x1cそうきゅう',now-30,JSON.stringify({translation:'苍穹的天空。',translationSource:'official'}));

  const seen=[];
  const tokenize=async text=>{
    seen.push(text);
    const out=[];
    for(const [word,pos] of [['雪','名詞'],['払う','動詞'],['蒼穹','名詞'],['空','名詞']]){
      const at=text.indexOf(word);
      if(at>=0){
        const start=[...text.slice(0,at)].length;
        out.push({surface:word,base_form:word,normalized:word,pos,grammar:[pos],start,end:start+[...word].length});
      }
    }
    return out;
  };

  const rem=await I.refresh(db,tokenize);
  assert.equal(rem,0);
  assert.deepEqual(seen,['蒼穹の空だ。','雪を払う。']);

  const exSnow=I.exampleLine(db,'雪','g1');
  assert.equal(exSnow.text,'雪を払う。');
  assert.equal([...exSnow.text].slice(exSnow.start,exSnow.end).join(''),'雪');

  const exSky=I.exampleLine(db,'蒼穹','g1');
  assert.equal(exSky.text,'蒼穹の空だ。');
  assert.equal([...exSky.text].slice(exSky.start,exSky.end).join(''),'蒼穹');
});
