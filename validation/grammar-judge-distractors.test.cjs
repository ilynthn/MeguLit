// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 学习 › 语法 › 动手玩「哪一句是日本人会说的？」(owner: 「？这边算法啥情况」). From 9-nine-ゆきいろゆきはなゆきのあと, the real
   line 「というわけで、練度を上げるわよ。私が手伝ってあげる」 was set against 「…私が手伝っ敬语助动词「れる」」: a deck card's wrong
   forms were other cards' words, one of them a Chinese gloss, pasted into the line. Now (web/grammar.js judgeRounds):
   - a wrong line swaps the grammar for a Japanese look-alike at the same place (てあげる → てくれる / てもらう / てやる);
   - nothing that is not plain Japanese gets in (a gloss, a tag, brackets, simplified Chinese);
   - a line with no believable wrong form is not asked. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const web=f=>pathToFileURL(path.join(__dirname,'..','web',f)).href;

const LINE='というわけで、練度を上げるわよ。私が手伝ってあげる',TITLE='9-nine-ゆきいろゆきはなゆきのあと';
const at=(text,part)=>{const i=[...text].join('').indexOf(part);return [...text.slice(0,i)].length;};
/* two deck cards of one level: the other card's 「word」 is a Chinese gloss, as in the owner's deck */
const CARDS=[
 {id:'bb-901',level:'N1',word:'～てあげる',form:['动て形＋あげる'],explain:['为别人做某事'],notes:[],examples:[{ja:'荷物を持ってあげる。',hl:'てあげる',zh:'我帮你拿行李。'}],hits:['てあげる'],order:1},
 {id:'bb-902',level:'N1',word:'敬语助动词「れる」',form:['动ない形＋れる'],explain:['表示尊敬'],notes:[],examples:[{ja:'先生が来られる。',hl:'られる',zh:'老师来。'}],hits:['敬语助动词「れる」'],order:2},
 {id:'bb-903',level:'N1',word:'～ずにはおかない',form:['动ない形＋ずにはおかない'],explain:['必然会'],notes:[],examples:[{ja:'彼の言葉は人を感動させずにはおかない。',hl:'ずにはおかない',zh:'他的话必然让人感动。'}],hits:['ずにはおかない'],order:3},
];
async function setup(t){const g=await import(web('grammar.js'));g.useAnkiCards(CARDS);t.after(()=>g.useAnkiCards([]));return g;}
const point=(g,id)=>g.pointsOf('N1').find(p=>p.id===id);

test('the 9-nine line: the wrong lines are てくれる / てもらう / てやる in the same place, never a Chinese gloss', async t=>{
 const g=await setup(t),p=point(g,'bb-901');assert.ok(p,'the deck card is its own lesson');
 const start=at(LINE,'てあげる'),real=[{text:LINE,start,end:start+4,conf:1,title:TITLE,translation:'所以说，要提高熟练度哦。我来帮你'}];
 const rounds=g.judgeRounds(p,real),round=rounds.find(r=>r.options.some(o=>o.ok&&o.text===LINE));
 assert.ok(round,'the line is asked');
 const wrong=round.options.filter(o=>!o.ok);
 assert.ok(wrong.length>=1&&wrong.length<=2);
 for(const o of wrong){
  assert.doesNotMatch(o.text,/敬语|助动词|「|」/,o.text);
  assert.ok(['てくれる','てもらう','てやる'].includes(o.form),o.form);
  assert.equal(o.text,'というわけで、練度を上げるわよ。私が手伝っ'+o.form,'only the grammar is swapped');
 }
 const html=g.lessonHTML(p,{progress:{}},{locale:'zh',esc:s=>String(s)});
 assert.doesNotMatch(html,/手伝っ敬语/,'the lesson page never shows the gloss in a line');
});

test('look-alikes: same place, Japanese only; て and で forms; particles swap only as a whole', async t=>{
 const g=await setup(t);
 assert.deepEqual(g.lookAlikes('てあげる').sort(),['てくれる','てもらう','てやる'].sort());
 assert.deepEqual(g.lookAlikes('んでいる').sort(),['んである','んでおく','んでしまう'].sort(),'読んでいる keeps its で');
 assert.deepEqual(g.lookAlikes('は'),['が']);
 assert.deepEqual(g.lookAlikes('ばは'),[],'a one-kana particle is swapped only when it is the whole answer');
 for(const bad of ['敬语助动词「れる」','敬语助动词れる','被动','表示尊敬','れる (honorific)','','〜てあげる'])assert.equal(g.plainJapanese(bad),false,bad);
 for(const good of ['てもらう','られる','ように','ばかり'])assert.equal(g.plainJapanese(good),true,good);
});

test('no believable wrong form: the line is not asked (the card says so instead of a made-up round)', async t=>{
 const g=await setup(t),p=point(g,'bb-903'),line='その映画は観客を泣かせずにはおかない',start=at(line,'ずにはおかない');
 const rounds=g.judgeRounds(p,[{text:line,start,end:start+7,conf:1,title:'x'}]);
 assert.equal(rounds.length,0,'ずにはおかない has no look-alike and a deck card has no hand-picked wrong forms');
});

test('built-in lessons still get rounds, every wrong line plain Japanese', async t=>{
 const g=await setup(t),{N5}=await import(web('grammar-n5.js')),lv=await import(web('grammar-levels.js'));
 for(const p of [...N5,...['N4','N3','N2'].flatMap(l=>lv.levelPoints(l))])for(const r of g.judgeRounds(p))for(const o of r.options.filter(x=>!x.ok))
  assert.ok(g.plainJapanese(o.form),p.id+': '+o.form);
 assert.ok(g.judgeRounds(N5.find(x=>x.id==='kosoado')).length>=1,'こそあど still asked');
});

test('the fill-in exercise of a deck card never offers another card\'s Chinese gloss either', async t=>{
 const g=await setup(t),p=point(g,'bb-901');
 for(const x of [...p.wrong,...p.choices])assert.ok(g.plainJapanese(x),x);
});
