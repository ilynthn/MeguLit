process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-28 排行榜 → 新收录单词 (owner: 「这个地方的算法要改改 tm は是个啥单词」): the big word in the middle of the board was the
   particle は (the week's most looked-up term), and every 「N 个」 counted each saved row. Now (core/content-word.cjs):
   - only nouns, verbs, い/な-adjectives and adverbs count, each once by its dictionary form;
   - は, です, する, 。, a single kana, interjections and the stop words never count;
   - the big word is the hardest (JLPT) of the ten content words most players looked up.
   The tokenizer stub answers tokenize_text with SudachiDict Full's own part-of-speech fields (pos, grammar, base_form) for the
   words below, in the same shape core/learning-native.cjs returns. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const lb=require('../services/leaderboard.cjs'),{SCHEMA}=require('../services/store.cjs');
const BASE_ENV={MEGULIT_RELAY_BASE:'https://relay.test'};

const T=(surface,pos,sub,base=surface)=>({surface,pos,grammar:[pos,sub,'*','*','*','*'],base_form:base,normalized:base});
const SUDACHI={
 'は':[T('は','助詞','係助詞')],'が':[T('が','助詞','格助詞')],'です':[T('です','助動詞','*')],'ます':[T('ます','助動詞','*')],
 'する':[T('する','動詞','非自立可能')],'した':[T('し','動詞','非自立可能','する'),T('た','助動詞','*')],'こと':[T('こと','名詞','普通名詞')],
 'ああ':[T('ああ','感動詞','フィラー')],'ねえ':[T('ねえ','感動詞','一般')],'3':[T('3','名詞','数詞')],'三':[T('三','名詞','数詞')],
 '食べる':[T('食べる','動詞','一般')],'食べた':[T('食べ','動詞','一般','食べる'),T('た','助動詞','*')],'食べて':[T('食べ','動詞','一般','食べる'),T('て','助詞','接続助詞')],
 '食べました':[T('食べ','動詞','一般','食べる'),T('まし','助動詞','*','ます'),T('た','助動詞','*')],
 '静かな':[T('静か','形状詞','一般'),T('な','助動詞','*','だ')],'静か':[T('静か','形状詞','一般')],'猫':[T('猫','名詞','普通名詞')],
 'ゆっくり':[T('ゆっくり','副詞','*')],'美しかった':[T('美しかっ','形容詞','一般','美しい'),T('た','助動詞','*')],
 '諦める':[T('諦める','動詞','一般')],'言う':[T('言う','動詞','一般')],'気をつけて':[T('気','名詞','普通名詞'),T('を','助詞','格助詞'),T('つけ','動詞','一般','つける'),T('て','助詞','接続助詞')],
};
/* tokenize_text over terms joined by 。, with code-point offsets, as the reader's tokenizer returns them */
function tokenizer(){
 const asked=[];
 return {asked,installed:()=>true,async request(command,{text}){
  assert.equal(command,'tokenize_text');asked.push(text);const out=[];let at=0;
  for(const [i,part]of text.split('。').entries()){
   if(i){out.push({...T('。','補助記号','句点'),start:at,end:at+1});at++;}
   const toks=SUDACHI[part];if(!toks)throw Error('no tokens for '+JSON.stringify(part));
   for(const k of toks){const n=[...k.surface].length;out.push({...k,start:at,end:at+n});at+=n;}}
  return out;}};
}
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-lb-words-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const db=new DatabaseSync(':memory:');db.exec(SCHEMA);t.after(()=>db.close());return {root,db};
}
const NOW=new Date('2026-11-10T12:00:00Z'),IN_WEEK=Math.floor(new Date('2026-11-10T01:00:00Z').getTime()/1000);
const V5=["Godan verb with 'u' ending",'transitive verb'],V1=['Ichidan verb','transitive verb'];
function save(db,spelling,pos,at=IN_WEEK){db.prepare('INSERT INTO vocabulary(spelling,reading,definitions,created_at,original) VALUES(?,?,?,?,?)').run(spelling,'','[]',at,JSON.stringify(pos?{entry:{spellings:[spelling],pos}}:{}));}

test('「N 个」 counts saved content words only: は, です, する, 。, ああ and a single kana are left out', t=>{
 const {db}=fixture(t);
 for(const [w,pos]of [['は',['particle']],['です',['copula','auxiliary verb']],['する',['suru verb - included','transitive verb']],['。',null],['ああ',['interjection (kandoushi)']],['ね',null],
  ['食べる',V1],['静か',['adjectival nouns or quasi-adjectives (keiyodoshi)']],['猫',['noun (common) (futsuumeishi)']],['ゆっくり',['adverb (fukushi)','adverb taking the \'to\' particle']],['諦める',V1]])save(db,w,pos);
 const s=lb.collectStats(db,NOW);
 assert.equal(s.stats.week.words,5,'食べる, 静か, 猫, ゆっくり, 諦める');
 assert.equal(s.totals.words,11,'the saved rows themselves are all kept');
});

test('a saved word counts once by its spelling; a row with no JMdict part of speech goes by the tokenizer', async t=>{
 const {db}=fixture(t);save(db,'猫',['noun (common) (futsuumeishi)']);save(db,'猫',['noun (common) (futsuumeishi)']);save(db,'食べる',V1);
 save(db,'が',null);save(db,'言う',null);save(db,'静か',null);
 const content=await lb.contentIndex(db,NOW,tokenizer());
 assert.equal(lb.collectStats(db,NOW,'',content).stats.week.words,3,'猫 (saved twice), 食べる, 静か; が is a particle by the tokenizer, 言う a stop word');
});

test('the week\'s lookups go out by dictionary form: 食べた, 食べて, 食べました and 食べる are one word; は, です, する, 。 are not sent', async t=>{
 const {root,db}=fixture(t);const ins=db.prepare("INSERT INTO lookup_events(surface,occurred_at,original) VALUES(?,?,'{}')");
 for(const s of ['は','は','は','は','が','です','ます','する','した','こと','ああ','ねえ','三','。','3','食べた','食べて','食べました','食べる','静かな','猫','美しかった','気をつけて','よろしくお願いします、先輩','先輩、待って！'])ins.run(s,IN_WEEK);
 const learning=tokenizer(),content=await lb.contentIndex(db,NOW,learning);
 const hot=lb.collectLookups(db,NOW,content),terms=new Map(hot.terms.map(x=>[x.term,x.count]));
 assert.equal(terms.get('食べる'),4,'four forms of one verb');
 assert.deepEqual([...terms.keys()].sort(),['猫','美しい','気をつけて','静か','食べる','よろしくお願いします、先輩','先輩、待って!'].sort(),'短语 / 短句 go as written');
 assert.equal(learning.asked.length,1,'one tokenizer request for the whole week');
 // what reaches the relay is the same list
 lb.join(root,{name:'Kazuma',consent:true});const sent=[];
 await lb.submit(lb.collectStats(db,NOW,root,content),{root,env:BASE_ENV,account:null,now:NOW,fetch:async(u,i)=>{sent.push(JSON.parse(i.body));return new Response('{"ok":true}');}});
 assert.deepEqual(sent[0].hot.terms.map(x=>x.term).sort(),[...terms.keys()].sort());
});

test('without the tokenizer (SudachiDict not installed) は, です, する, 。, ああ and a single kana are still left out', t=>{
 const {db}=fixture(t);const ins=db.prepare("INSERT INTO lookup_events(surface,occurred_at,original) VALUES(?,?,'{}')");
 for(const s of ['は','が','です','する','。','ああ','ね','3','猫','仕方ない'])ins.run(s,IN_WEEK);
 assert.deepEqual(lb.collectLookups(db,NOW).terms.map(x=>x.term).sort(),['仕方ない','猫'].sort());
});

test('the big word of 新收录单词: never は; the hardest of the ten most looked-up content words', async t=>{
 const awards=['は','です','する','言う','猫','食べる','諦める','静か'].map((term,i)=>({rank:i+1,term,users:20-i,lookups:40-i}));
 const jlpt={byForm:new Map([['猫',{level:'N5'}],['食べる',{level:'N5'}],['諦める',{level:'N2'}],['静か',{level:'N5'}],['言う',{level:'N5'}]])};
 const pick=await lb.featuredWord(awards,tokenizer(),jlpt);
 assert.equal(pick.term,'諦める');assert.equal(pick.users,14);
 const plain=await lb.featuredWord(awards.filter(a=>a.term!=='諦める'),tokenizer(),jlpt);
 assert.equal(plain.term,'猫','all N5: the most looked-up content word');
 assert.equal(await lb.featuredWord(awards.slice(0,3),tokenizer(),jlpt),null,'only は, です, する: no big word');
 const old=await lb.featuredWord([{rank:1,term:'食べた',users:9},{rank:2,term:'は',users:30}],tokenizer(),jlpt);
 assert.equal(old.term,'食べる','an older client\'s inflected lookup is shown by its dictionary form');
});

test('the board page: 新收录单词 shows the picked word, not the relay\'s rank 1 は', async t=>{
 const {root,db}=fixture(t);lb.join(root,{name:'Kazuma',consent:true});
 const fetch=async url=>{const u=new URL(url);
  if(u.pathname==='/api/hotwords')return new Response(JSON.stringify({week:'2026-W46',settled:false,awards:[{rank:1,term:'は',users:30,lookups:90},{rank:2,term:'猫',users:12,lookups:20},{rank:3,term:'諦める',users:5,lookups:6}]}));
  if(u.pathname==='/api/leaderboard')return new Response(JSON.stringify({entries:[{name:'Kazuma',value:3,me:true}]}));
  return new Response('{"ok":true}');};
 const r=await lb.view(root,db,{period:'week',metric:'words'},{env:BASE_ENV,account:null,fetch,now:NOW,learning:tokenizer()});
 assert.equal(r.board.state,'ok');assert.notEqual(r.board.word?.term,'は');assert.equal(r.board.word?.term,'諦める','N3, over 猫 (N5)');
});
