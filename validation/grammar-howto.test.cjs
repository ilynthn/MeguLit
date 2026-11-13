'use strict';
/* 2026-11-14 (user: 「怎么做部分太空了 完全不知道啥意思」): 怎么接 on a 蓝宝书 lesson showed one box saying する. Every lesson
   now teaches the connection: plain-words formula, the verb form shown on 行く／食べる, examples with Chinese and
   furigana (the shared example-ruby.js renderer), a line from your own reading, one 注意 line. The step list has no
   numbers. */
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
 assert.match(html,/<p class="gm-ja" lang="ja" data-exr="運動をしてもいいですか。">運動を<mark class="gm-hl">して<\/mark>もいいですか。<\/p>/,'the shared renderer adds the furigana');
 const but=h.howTo(g.pointsOf('N5').find(p=>p.id==='bb-しかし'),[]);
 assert.equal(but.rows[0].place,true);assert.equal(but.rows[0].formula,'…高いです。 + しかし + おいしいで…');
 g.useAnkiCards([]);
});

test('examples go through the shared furigana renderer, the grammar stays marked, a line from your own reading is shown',async()=>{
 const h=await import(web('grammar-howto.js'));
 assert.equal(h.markHTML('先輩は',{start:2,end:3,esc}),'先輩<mark class="gm-hl">は</mark>');
 const g=await import(web('grammar.js')),p=g.pointsOf('N4')[0];
 const html=h.howToHTML(p,[{text:'もし雨が降ったら、帰ろう。',start:5,end:7,translation:'下雨就回去',title:'ATRI',origin:'game',ruby:[['雨','あめ']]}],{esc,source:e=>e.title});
 assert.match(html,/gm-how-mine[\s\S]*data-exr="もし雨が降ったら、帰ろう。" data-exr-ruby="\[\[&quot;雨&quot;,&quot;あめ&quot;\]\]"[\s\S]*下雨就回去[\s\S]*ATRI/,'your own line keeps the game ruby');
 assert.doesNotMatch(html,/<ruby>/,'no second furigana path');
 for(const level of ['N5','N1'])for(const pt of g.pointsOf(level)){const x=h.howToHTML(pt,[],{esc});assert.ok((x.match(/class="gm-ja" lang="ja" data-exr=/g)||[]).length>=1,pt.id);}
 assert.ok(!fs.existsSync(path.join(__dirname,'..','web','grammar-ruby.js')),'no generated furigana table beside the shared renderer');
});

test('step list: names and ✓, no numbers; 第 n / 6 步 under the lesson',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','grammar.js'),'utf8');
 assert.doesNotMatch(src,/data-step="\$\{i\}"[^`]*<b>\$\{i\+1\}<\/b>/);
 assert.match(src,/data-stepof>/);
 assert.doesNotMatch(src,/<em>\$\{String\(i\+1\)\.padStart\(2,'0'\)\}<\/em>/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','grammar.css'),'utf8'),/\.gm-step-dot\.passed span::after\{content:' ✓'/);
});

test('the map opened from a lesson returns to that lesson at the same step',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','grammar.js'),'utf8');
 assert.match(src,/data-map\]'\)\.forEach\(b=>b\.onclick=\(\)=>\{openNode=b\.dataset\.map;scene=null;piece=-1;memo\.mapFrom='lesson';go\('map'\);\}\)/);
 assert.match(src,/back\.onclick=\(\)=>\{memo\.mapFrom='';go\(fromLesson\?'lesson':'list'\);\}/);
 assert.match(src,/function showStep\(n,animate=true\)\{\n  step=Math\.max\(0,Math\.min\(STEPS\.length-1,n\)\);save\(\);keepStep\(point\?\.id,step\);/,'the step is kept for the lesson');
});
