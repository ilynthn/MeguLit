'use strict';
/* 2026-11-14 (user: 「怎么做部分太空了 完全不知道啥意思」): 怎么接 on a 蓝宝书 lesson showed one box saying する. Every lesson
   now teaches the connection: plain-words formula, the verb form shown on 行く／食べる, examples with Chinese and
   furigana, a line from your own reading, one 注意 line. The step list has no numbers. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const web=f=>pathToFileURL(path.join(__dirname,'..','web',f)).href;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LEVELS=['N5','N4','N3','N2','N1','N0'];

test('every MeguLit grammar point has a 怎么接 with a rule and at least one translated example',async()=>{
 const g=await import(web('grammar.js')),h=await import(web('grammar-howto.js'));g.useAnkiCards([]);
 let n=0;for(const level of LEVELS)for(const p of g.pointsOf(level)){n++;const x=h.howTo(p,[]);
  assert.ok(x.rows.length&&x.rows.every(r=>r.formula.trim()),`${p.id}: no rule`);
  assert.ok(x.examples.length>=1&&x.examples.every(e=>e.ja&&e.zh),`${p.id}: needs an example with Chinese`);
  const html=h.howToHTML(p,[],{esc});assert.match(html,/class="gm-how-ex"/,p.id);}
 assert.ok(n>=260,'all levels counted');
});

test('verb patterns show which form the verb takes, on 行く and 食べる',async()=>{
 const h=await import(web('grammar-howto.js'));
 const to=f=>h.demoOf(f).map(d=>d.to);
 assert.deepEqual(to('動ます形/名＋がてら'),['行きがてら','食べがてら']);
 assert.deepEqual(to('动词て形 + みる'),['行ってみる','食べてみる']);
 assert.deepEqual(to('動ない形－ない＋ずにはいられない'),['行かずにはいられない','食べずにはいられない']);
 assert.deepEqual(to('Ⅰ类动词「ない形」 + れる'),['行かれる'],'class I only, ない dropped before れる');
 assert.deepEqual(to('动词普通形 + の/名词 + はおろか'),['行くのはおろか','行ったのはおろか'],'kana between joins in');
 assert.deepEqual(to('名词 + について'),[],'no verb, no demo');
 assert.equal(h.plainFormula('動辞書形·た形/イ形/ナ形語幹（である）/名（である）＋か否か'),'动词辞书形（原形）、た形/い形容词/な形容词词干（である）/名词（である） + か否か');
});

test('a 蓝宝书 card without a connection field gets one from its explanation, or its place in an example',async()=>{
 const g=await import(web('grammar.js')),h=await import(web('grammar-howto.js'));
 const card=(o)=>({id:'bb-'+o.word,level:'N5',form:[],notes:[],hits:[o.word],order:1,...o});
 g.useAnkiCards([
  card({word:'する',explain:['以「をする」形式接在表示动作或行为的名词之后，意为“做……”。'],notes:['意思随宾语变化'],examples:[{ja:'運動をしてもいいですか。',hl:'して',zh:'我可以做运动吗？'}]}),
  card({word:'しかし',hits:['しかし'],explain:['“但是……”，表示转折。'],examples:[{ja:'高いです。しかし、おいしいです。',hl:'しかし',zh:'贵。但是好吃。'}]})]);
 const suru=g.pointsOf('N5').find(p=>p.id==='bb-する'),x=h.howTo(suru,[]);
 assert.equal(x.rows[0].formula,'名词 + をする');assert.match(x.rows[0].rule,/接在表示动作/);
 assert.equal(x.examples[0].zh,'我可以做运动吗？');assert.equal(x.note,'意思随宾语变化');
 const html=h.howToHTML(suru,[],{esc});
 assert.match(html,/<span class="gm-block"[^>]*>名词<\/span>/);assert.doesNotMatch(html,/<span class="gm-block"[^>]*>する<\/span><\/div><\/li><\/ol>$/);
 assert.match(html,/data-ruby="運動をしてもいいですか。"/,'a line without furigana asks the service for it');
 const but=h.howTo(g.pointsOf('N5').find(p=>p.id==='bb-しかし'),[]);
 assert.equal(but.rows[0].place,true);assert.equal(but.rows[0].formula,'…高いです。 + しかし + おいしいで…');
 g.useAnkiCards([]);
});

test('furigana: Anki markup becomes ruby, the grammar stays marked, a line from your own reading is shown',async()=>{
 const h=await import(web('grammar-howto.js')),{RUBY}=await import(web('grammar-ruby.js'));
 assert.equal(h.rubyHTML('先輩は',{rb:' 先輩[せんぱい]は',start:2,end:3,esc}),'<ruby>先輩<rt>せんぱい</rt></ruby><mark class="gm-hl">は</mark>');
 assert.equal(h.rubyHTML('別の行',{rb:' 違[ちが]う',esc}),'別の行','markup that does not match the line is ignored');
 assert.ok(Object.keys(RUBY).length>1000,'MeguLit\'s own lines ship with generated furigana');
 for(const [text,rb] of Object.entries(RUBY))assert.equal(h.rubyParts(rb).map(p=>p.t).join(''),text,text);
 const g=await import(web('grammar.js')),p=g.pointsOf('N4')[0];
 const html=h.howToHTML(p,[{text:'もし雨が降ったら、帰ろう。',start:5,end:7,translation:'下雨就回去',title:'ATRI',origin:'game'}],{esc,source:e=>e.title});
 assert.match(html,/gm-how-mine[\s\S]*下雨就回去[\s\S]*ATRI/);
});

test('step list: names and ✓, no numbers and no step counter',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','grammar.js'),'utf8');
 assert.doesNotMatch(src,/data-step="\$\{i\}"[^`]*<b>\$\{i\+1\}<\/b>/);
 assert.doesNotMatch(src,/data-stepof/);
 assert.doesNotMatch(src,/<em>\$\{String\(i\+1\)\.padStart\(2,'0'\)\}<\/em>/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','grammar.css'),'utf8'),/\.gm-step-dot\.passed span::after\{content:' ✓'/);
 const bridge=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 assert.match(bridge,/case 'grammar_ruby':return \{rubies:await require\('\.\.\/core\/grammar-ruby\.cjs'\)\.rubies\(/);
});

test('the ruby rule keeps only dictionary readings the tokenizer agrees with',async()=>{
 const {rubyLine,bracket}=require('../core/grammar-ruby.cjs');
 assert.equal(bracket('食べる','たべる'),' 食[た]べる');assert.equal(bracket('陽キャ','ようきゃ'),' 陽[よう]キャ');
 const fake={tokenize:async()=>[{surface:'私',start:0,end:1,reading:'ワタシ'},{surface:'が',start:1,end:2,reading:'ガ'},{surface:'来',start:2,end:3,reading:'キ'},{surface:'ます',start:3,end:5,reading:'マス'}],
  readings:{resolve:t=>t.map(x=>x.surface==='私'?{...x,reading:'わたし',readingSource:'dictionary'}:x.surface==='来'?{...x,reading:'らい',readingSource:'dictionary'}:x)}};
 const r=await rubyLine(fake,'私が来ます');
 assert.equal(r.rb,'私[わたし]が来ます','来 read らい by the dictionary but き by the tokenizer stays bare');
 assert.equal(r.bare.length,1);
});

test('the map opened from a lesson returns to that lesson at the same step',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','grammar.js'),'utf8');
 assert.match(src,/data-map\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{openNode=b\.dataset\.map;scene=null;piece=-1;memo\.mapFrom='lesson';go\('map'\);\}\)/);
 assert.match(src,/back\.onclick=\(\)=>\{memo\.mapFrom='';go\(fromLesson\?'lesson':'list'\);\}/);
 assert.match(src,/function showStep\(n,animate=true\)\{\n  step=Math\.max\(0,Math\.min\(STEPS\.length-1,n\)\);save\(\);/,'the step is kept in memo');
});
