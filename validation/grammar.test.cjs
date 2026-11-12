'use strict';
/* 学习 → 语法 (2026-11-11): N5 lessons, grammar found in the lines you read (with the minute you read them), exercises
   cut from real lines, progress and Anki cards. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const G=require('../services/grammar.cjs'),{openStore}=require('../services/store.cjs');
/* tokens as SudachiDict Full gives them (checked against the real tokenizer) */
const T=(spec)=>{let at=0;return spec.map(([surface,base,p1,p2,norm])=>{const t={surface,base_form:base,normalized:norm||base,pos:p1,grammar:[p1,p2||'*'],start:at,end:at+[...surface].length};at=t.end;return t;});};
const S={
 mashou:T([['一緒','一緒','名詞','普通名詞'],['に','に','助詞','格助詞'],['帰り','帰る','動詞','一般'],['ましょう','ます','助動詞'],['。','。','補助記号','句点']]),
 kudasai:T([['先輩','先輩','名詞','普通名詞'],['、','、','補助記号','読点'],['待っ','待つ','動詞','一般'],['て','て','助詞','接続助詞'],['ください','くださる','動詞','非自立可能','下さる'],['。','。','補助記号','句点']]),
 teiru:T([['雨','雨','名詞','普通名詞'],['が','が','助詞','格助詞'],['降っ','降る','動詞','一般'],['て','て','助詞','接続助詞'],['いる','いる','動詞','非自立可能','居る'],['。','。','補助記号','句点']]),
 tai:T([['行き','行く','動詞','非自立可能'],['たく','たい','助動詞'],['ない','ない','形容詞','非自立可能','無い'],['。','。','補助記号','句点'],['静か','静か','形状詞','一般'],['な','だ','助動詞'],['部屋','部屋','名詞','普通名詞'],['でし','です','助動詞'],['た','た','助動詞'],['。','。','補助記号','句点']]),
 ta:T([['読ん','読む','動詞','一般'],['で','で','助詞','接続助詞'],['、','、','補助記号','読点'],['飲ん','飲む','動詞','一般'],['だ','だ','助動詞','*','た'],['。','。','補助記号','句点'],['誰','誰','代名詞'],['も','も','助詞','係助詞'],['来','来る','動詞','非自立可能'],['ない','ない','助動詞'],['。','。','補助記号','句点']]),
 misc:T([['それ','それ','代名詞','*','其れ'],['は','は','助詞','係助詞'],['寒かっ','寒い','形容詞','一般'],['た','た','助動詞'],['けど','けど','助詞','接続助詞'],['、','、','補助記号','読点'],['彼女','彼女','代名詞'],['と','と','助詞','格助詞'],['学校','学校','名詞','普通名詞'],['へ','へ','助詞','格助詞'],['本当','本当','名詞','普通名詞'],['に','に','助詞','格助詞'],['私','私','代名詞'],['の','の','助詞','格助詞'],['家','家','名詞','普通名詞'],['だ','だ','助動詞']])
};
const spans=(tokens,id)=>(G.matchPoints(tokens)[id]||[]);
const text=tokens=>tokens.map(t=>t.surface).join('');
const cut=(tokens,[a,b])=>[...text(tokens)].slice(a,b).join('');

test('grammar points are found in tokenized lines, with the right span',()=>{
 assert.deepEqual(spans(S.mashou,'mashou').map(s=>cut(S.mashou,s)),['帰りましょう']);
 assert.deepEqual(spans(S.mashou,'masu'),[],'ましょう is its own point');
 assert.deepEqual(spans(S.mashou,'ni').map(s=>cut(S.mashou,s)),[],'一緒に is an adverb, not the particle に');
 assert.deepEqual(spans(S.kudasai,'tekudasai').map(s=>cut(S.kudasai,s)),['待ってください']);
 assert.deepEqual(spans(S.kudasai,'te').map(s=>cut(S.kudasai,s)),['待って']);
 assert.deepEqual(spans(S.teiru,'teiru').map(s=>cut(S.teiru,s)),['降っている']);
 assert.deepEqual(spans(S.teiru,'ga').map(s=>cut(S.teiru,s)),['が']);
 assert.deepEqual(spans(S.tai,'tai').map(s=>cut(S.tai,s)),['行きたく']);
 assert.deepEqual(spans(S.tai,'nai'),[],'たくない is the い-adjective ない of たい, not the ない form of a verb');
 assert.deepEqual(spans(S.tai,'naadj').map(s=>cut(S.tai,s)),['静かな']);
 assert.deepEqual(spans(S.tai,'desu').map(s=>cut(S.tai,s)),['でし'],'静かな is not the copula');
 assert.deepEqual(spans(S.ta,'ta').map(s=>cut(S.ta,s)),['飲んだ'],'飲んだ: た written だ');
 assert.deepEqual(spans(S.ta,'desu'),[],'and not です／だ');
 assert.deepEqual(spans(S.ta,'te').map(s=>cut(S.ta,s)),['読んで']);
 assert.deepEqual(spans(S.ta,'nai').map(s=>cut(S.ta,s)),['来ない']);
 assert.deepEqual(spans(S.ta,'mo').map(s=>cut(S.ta,s)),['も']);
 const m=G.matchPoints(S.misc);
 assert.deepEqual(['wa','to','he','no','kosoado','iadj','desu'].map(id=>(m[id]||[]).map(s=>cut(S.misc,s))),[['は'],['と'],['へ'],['の'],['それ'],['寒かっ'],['だ']]);
 assert.equal(m.ni,undefined,'本当に is not the particle に');
 for(const id of G.POINTS)assert.ok(G.PREFILTER[id],id);
});

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-grammar-'));const db=openStore(root);t.after(()=>{try{db.close();}catch{}fs.rmSync(root,{recursive:true,force:true});});
 db.prepare("INSERT INTO games(id,title,executable) VALUES('g1','魔法使いの夜','C:/Games/mahoyo/game.exe'),('g2','女装山脈','C:/Games/jsm/game.exe')").run();return {root,db};}

test('examples come from recorded lines and the script read so far, each with the minute it was read',async t=>{
 const {db}=fixture(t);const add=db.prepare('INSERT INTO reading_events(session_id,game_id,text,read_at,original) VALUES(1,?,?,?,?)');
 add.run('g1','一緒に帰りましょう。',1794300000,JSON.stringify({translation:'一起回去吧。',translationSource:'group'}));
 add.run('g1','先輩、ちょっと待ってください。',1794300060,JSON.stringify({translation:'学长，请等一下。',translationSource:'machine'}));
 add.run('g2','雨が降っている。',1794300120,JSON.stringify({translation:''}));
 /* the script of g2: line 2 was recorded (read at …120), lines 0 and 1 came before it, line 3 was not reached */
 const scriptPairs=(root,exe)=>exe.includes('jsm')?{source:'group',ja:['静かな部屋でした。','誰も来ない夜だった。','雨が降っている。','まだ読んでいない行です。'],tr:['那是个安静的房间。','','正在下雨。','还没读到的一行。']}:null;
 const list=G.candidates(db,{root:'X',scriptPairs});
 const by=new Map(list.map(c=>[c.text,c]));
 assert.equal(by.get('一緒に帰りましょう。').readAt,1794300000);assert.equal(by.get('一緒に帰りましょう。').readBy,false);
 assert.equal(by.get('静かな部屋でした。').origin,'script');assert.equal(by.get('静かな部屋でした。').readAt,1794300120,'read by the next recorded line');assert.equal(by.get('静かな部屋でした。').readBy,true);
 assert.equal(by.get('静かな部屋でした。').translationSource,'group');assert.equal(by.get('誰も来ない夜だった。').translation,'');
 assert.ok(!by.has('まだ読んでいない行です。'),'lines after the reading position are not used');
 const dict={'一緒に帰りましょう。':S.mashou,'先輩、ちょっと待ってください。':S.kudasai,'雨が降っている。':S.teiru,'静かな部屋でした。':T([['静か','静か','形状詞','一般'],['な','だ','助動詞'],['部屋','部屋','名詞','普通名詞'],['でし','です','助動詞'],['た','た','助動詞'],['。','。','補助記号','句点']]),'誰も来ない夜だった。':T([['誰','誰','代名詞'],['も','も','助詞','係助詞'],['来','来る','動詞','非自立可能'],['ない','ない','助動詞'],['夜','夜','名詞','普通名詞'],['だっ','だ','助動詞'],['た','た','助動詞'],['。','。','補助記号','句点']])};
 let calls=0;const tokenize=async s=>{calls++;return dict[s]||[];};
 const r=await G.report(db,{root:'X',scriptPairs,tokenize});
 assert.equal(calls,5);assert.equal(r.lines.history,3);assert.equal(r.lines.script,2);
 assert.equal(r.examples.mashou[0].text,'一緒に帰りましょう。');assert.equal(r.examples.mashou[0].readAt,1794300000);assert.equal(r.examples.mashou[0].title,'魔法使いの夜');
 assert.deepEqual([r.examples.naadj[0].text,r.examples.naadj[0].start,r.examples.naadj[0].end,r.examples.naadj[0].readBy],['静かな部屋でした。',0,3,true]);
 assert.equal(r.real,Object.values(r.examples).reduce((n,l)=>n+l.length,0));
 await G.report(db,{root:'X',scriptPairs,tokenize});assert.equal(calls,5,'lines are tokenized once');
 /* human translation first */
 const two=G.examples(db,[{text:'雨が降っている。',origin:'history',translation:'机翻',translationSource:'machine',gameId:'g2'},{text:'先輩、ちょっと待ってください。',origin:'history',translation:'学长等等',translationSource:'group',gameId:'g1'}]);
 assert.equal(two.te[0].translationSource,'group');
});

test('progress: learned points and exercise accuracy make the N5 completion',t=>{
 const {db}=fixture(t);
 G.setLearned(db,'wa');G.setLearned(db,'ga');G.setLearned(db,'ga',false);G.recordAnswer(db,'wa',true);G.recordAnswer(db,'wa',false);G.recordAnswer(db,'wo',true);
 const p=G.progress(db);assert.deepEqual(p.wa,{learned:true,attempts:2,correct:1});assert.equal(p.ga.learned,false);
 const c=G.completion(p);assert.equal(c.learned,1);assert.equal(c.total,21);assert.equal(c.share,1/21);assert.equal(c.accuracy,2/3);
 assert.equal(G.completion({}).accuracy,null);
 assert.throws(()=>G.setLearned(db,'nope'),/INVALID_GRAMMAR_POINT/);
});

test('a grammar line becomes its own Anki note with the sentence, translation, game and source',async()=>{
 const {Anki}=require('../core/anki.cjs'),anki=new Anki(),sent=[];const available=['Word','Pitch','PartOfSpeech','Meaning','Sentence','Audio','SentenceFurigana','SentenceTranslation','WordReading','Game','TranslationSource'];
 anki.prepareModel=async()=>({available,owned:true});anki.call=async(c,action,p)=>{if(action==='findNotes')return [];if(action==='addNote'){sent.push(p.note);return sent.length;}return null;};
 const word=e=>G.ankiWord('wo','を —— 动作的对象','「を」标出动作作用在什么上',{text:e});
 await anki.sync(word('彼女は本を閉じた。'),{ankiModel:'MeguLit',ankiDeck:'MeguLit'},null,{translation:'她合上了书。',translationSource:'group',gameTitle:'魔法使いの夜',sentenceHtml:'彼女は本<b class="tm-hl">を</b>閉じた。'});
 await anki.sync(word('手紙を書く。'),{ankiModel:'MeguLit',ankiDeck:'MeguLit'},null,{});
 assert.equal(sent.length,2,'two lines of one point are two notes');assert.notEqual(sent[0].tags[1],sent[1].tags[1]);
 const f=sent[0].fields;assert.equal(f.Word,'を —— 动作的对象');assert.equal(f.Sentence,'彼女は本を閉じた。');assert.equal(f.SentenceTranslation,'她合上了书。');assert.equal(f.Game,'魔法使いの夜');assert.equal(f.TranslationSource,'汉化组译文');assert.equal(f.WordReading,'');assert.equal(f.PartOfSpeech,'N5 语法');
 assert.deepEqual(G.rubyPairs('車の窓は<rしも>霜</r>だらけ'),[['霜','しも']]);
});

test('N5 lessons: every point is complete, exercises are answerable, levels N4–N0 have their own lessons',async()=>{
 const {N5,LEVELS,blankOf,choicesFor}=await import('../web/grammar-n5.js'),g=await import('../web/grammar.js');
 assert.deepEqual(LEVELS,['N5','N4','N3','N2','N1','N0']);assert.equal(N5.length,21);assert.deepEqual(N5.map(p=>p.id),G.POINTS,'lessons and the matcher cover the same points');
 for(const p of N5){
  for(const l of ['zh','ja','en']){assert.ok(p.title[l],p.id+' title '+l);assert.ok(p.gist[l],p.id+' gist '+l);}
  assert.ok(p.form.length>=1&&p.uses.length>=2&&p.uses.length<=3&&p.pitfalls.length>=1,p.id);
  assert.ok(p.builtin.length>=2,p.id);for(const b of p.builtin)assert.ok(b.ja.includes(b.hl)&&b.zh,p.id+' '+b.ja);
  const ex=g.exercisesFor(p,[]);assert.ok(ex.length>=1,p.id+' has an exercise');
  for(const q of ex){assert.ok(q.choices.includes(q.answer),p.id);assert.equal(new Set(q.choices).size,q.choices.length);assert.ok(q.choices.length>=3);}
 }
 const wo=N5.find(p=>p.id==='wo');assert.deepEqual(blankOf(wo,'本を閉じた',1,2),{start:1,end:2,answer:'を'});
 const te=N5.find(p=>p.id==='te');assert.deepEqual(blankOf(te,'呼んで走る',0,3),{start:2,end:3,answer:'で'},'a form blanks only its ending');
 assert.deepEqual(choicesFor(wo,'を',7),choicesFor(wo,'を',7),'stable for a line');
 /* real lines first in exercises; a real line whose blank is not a choice is skipped */
 const real=[{text:'一段と厳しかった。',start:3,end:7,title:'G',readAt:1},{text:'外は寒い。',start:2,end:4,title:'G',readAt:1794300000}];
 assert.equal(g.exercisesFor(N5.find(p=>p.id==='iadj'),real)[0].text,'外は寒い。');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 assert.match(g.listHTML({progress:{},completion:G.completion({}),examples:{}},{locale:'zh',esc,level:'N0'}),/data-point="n0-nnai"/,'N0 has its own lessons now (E500: the next lesson is the first of stage 01)');
 const list=g.listHTML({progress:{wa:{learned:true,attempts:2,correct:1}},completion:G.completion({wa:{learned:true,attempts:2,correct:1}}),examples:{wa:[{}]},real:1},{locale:'zh',esc});
 assert.match(list,/data-point="wa"/);assert.match(list,/已学完/);assert.match(list,/50%/);
 for(const l of ['zh','ja','en'])assert.deepEqual(Object.keys(g.grammarMessages[l]).sort(),Object.keys(g.grammarMessages.zh).sort(),l);
});

test('every example taken from a game says when it was read, to the minute',async()=>{
 const {readTime}=await import('../web/read-time.js'),{N5}=await import('../web/grammar-n5.js'),g=await import('../web/grammar.js');
 const at=Math.floor(new Date(2026,10,10,5,13,40).getTime()/1000);
 assert.equal(readTime(at,'zh'),'2026年11月10日 05:13 读到');
 assert.equal(readTime(at,'ja'),'2026年11月10日 05:13 に読んだ');
 assert.equal(readTime(at,'en'),'Read on Nov 10, 2026, 05:13');
 assert.equal(readTime(at,'zh',{by:true}),'2026年11月10日 05:13 前读过','a script line not recorded itself says "by then"');
 assert.equal(readTime(null,'zh'),'');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';'),p=N5.find(x=>x.id==='wo');
 const html=g.lessonHTML(p,{examples:{wo:[{text:'本を閉じた。',start:1,end:2,title:'魔法使いの夜',readAt:at,translation:'合上了书。',translationSource:'group',origin:'history'}]},progress:{}},{locale:'zh',esc});
 assert.match(html,/魔法使いの夜 · 2026年11月10日 05:13 读到/);assert.match(html,/data-explain="wo">を<\/mark>/);assert.match(html,/加入 Anki/);
 /* 读过的词 shows the last time each word was read; the 句子 page shows when the line was saved while reading */
 const ri=await import('../web/reading-insights.js');
 assert.match(ri.readingInsightsHTML({lines:1,pending:0,weekly:[{key:'雪',base:'雪',count:1,lastAt:at,games:[{id:'g',title:'G'}]}],frequent:[],jlpt:[],games:[]},{locale:'zh',esc,number:String}),/最近一次： 2026年11月10日 05:13 读到/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8'),/readTime\(item\.created_at,locale\)/);
});

test('the learning page has the 语法 tab in zh/ja/en and loads its styles',async()=>{
 const {messages}=await import('../web/i18n.js');assert.deepEqual(['zh','ja','en'].map(l=>messages[l].grammar),['语法','文法','Grammar']);
 const app=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');assert.match(app,/LEARNING_TABS=\[[^\]]*'grammar'/);assert.match(app,/import\('\.\/grammar\.js'\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','index.html'),'utf8'),/grammar\.css/);
});

test('interactive: the core-system map places every N5 point, nodes light up as points are learned',async()=>{
 const {MAP,POINT_NODES,nodeOf}=await import('../web/grammar-map.js'),{N5}=await import('../web/grammar-n5.js'),g=await import('../web/grammar.js');
 assert.deepEqual(MAP.map(n=>n.id),['order','particles','classes','conjugation','auxiliary','politeness','aspect','viewpoint','clauses']);
 for(const n of MAP)for(const l of ['zh','ja','en'])assert.ok(n.title[l]&&n.line[l]&&n.body[l],n.id+' '+l);
 for(const p of N5){assert.ok(POINT_NODES[p.id]?.length,p.id);for(const id of POINT_NODES[p.id])assert.ok(MAP.some(n=>n.id===id),p.id+' → '+id);}
 assert.equal(nodeOf('wo'),'particles');assert.equal(nodeOf('teiru'),'aspect');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const html=g.mapHTML({progress:{wa:{learned:true}}},{locale:'zh',esc,open:'particles'});
 assert.match(html,/data-node="particles"[^>]*>/);assert.match(html,/gm-node open lit/);assert.match(html,/aria-expanded="true"/);
 assert.match(html,/class="gm-chip lit" data-point="wa"/,'a learned point is lit on the map');assert.match(html,/data-point="wo"/,'points open their lesson');
 assert.doesNotMatch(g.mapHTML({progress:{}},{locale:'zh',esc}),/gm-node-body/,'closed nodes show only their line');
 const lesson=g.lessonHTML(N5.find(p=>p.id==='teiru'),{progress:{},examples:{}},{locale:'zh',esc});assert.match(lesson,/data-map="aspect"/,'each lesson shows where it sits on the map');
 assert.match(g.listHTML({progress:{},completion:g.completion({}),examples:{}},{locale:'zh',esc}),/class="gm-overview" data-map/,'the overview comes first in the list');
});

test('interactive: the conjugation lab changes only the ending, readings included',async()=>{
 const c=await import('../web/conjugate.js'),g=await import('../web/grammar.js');
 const by=w=>c.WORDS.find(x=>x.word===w),forms=w=>['masu','te','nai','ta'].map(f=>c.formText(by(w),f));
 assert.deepEqual(forms('書く'),['書きます','書いて','書かない','書いた']);
 assert.deepEqual(forms('読む'),['読みます','読んで','読まない','読んだ']);
 assert.deepEqual(forms('会う'),['会います','会って','会わない','会った']);
 assert.deepEqual(forms('行く'),['行きます','行って','行かない','行った']);
 assert.deepEqual(forms('泳ぐ'),['泳ぎます','泳いで','泳がない','泳いだ']);
 assert.deepEqual(forms('話す'),['話します','話して','話さない','話した']);
 assert.deepEqual(forms('食べる'),['食べます','食べて','食べない','食べた']);
 assert.deepEqual(forms('する'),['します','して','しない','した']);
 assert.deepEqual(forms('来る'),['来ます','来て','来ない','来た']);assert.equal(c.conjugate(by('来る'),'nai').reading,'こない');
 assert.deepEqual(forms('高い'),['高いです','高くて','高くない','高かった']);
 assert.deepEqual(forms('いい'),['いいです','よくて','よくない','よかった']);
 assert.deepEqual(forms('静か'),['静かです','静かで','静かじゃない','静かだった']);
 assert.deepEqual(c.conjugate(by('書く'),'te'),{stem:'書',ending:'いて',rule:'く → いて'},'the stem stays, the ending is what changes');
 const esc=s=>String(s??'');const html=g.conjHTML('te',{locale:'zh',esc,wordIndex:c.WORDS.filter(x=>['godan','ichidan','suru','kuru'].includes(x.type)).findIndex(x=>x.word==='行く'),form:'te'});
 assert.match(html,/<span class="gm-stem">行<\/span><span class="gm-ending">って<\/span>/);assert.match(html,/いって/,'reading follows the same rule');
 assert.match(g.conjHTML('iadj',{locale:'zh',esc}),/優しい/,'the い-adjective lesson offers adjectives');
});

test('interactive: particle puzzle gaps, explanations on the grammar, read aloud, and a same-kind retry after a miss',async()=>{
 const {N5}=await import('../web/grammar-n5.js'),g=await import('../web/grammar.js'),wo=N5.find(p=>p.id==='wo');
 const real=[{text:'本を閉じた。',start:1,end:2,translation:'合上了书。',translationSource:'group',title:'G',readAt:1794300000,origin:'history'}];
 const gaps=g.particleGaps(wo,real);assert.equal(gaps[0].text,'本を閉じた。');assert.equal(gaps[0].answer,'を');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const puzzle=g.particleHTML(wo,real,{locale:'zh',esc});assert.match(puzzle,/data-tile="を"/);assert.match(puzzle,/本<button type="button" class="gm-slot" data-slot="0"/);assert.match(puzzle,/<p class="gm-tr gm-gap-tr" hidden>合上了书。/,'the translation shows once the line lights up');
 const lesson=g.lessonHTML(wo,{examples:{wo:real},progress:{}},{locale:'zh',esc});
 assert.match(lesson,/<mark class="gm-hl" role="button" tabindex="0" data-explain="wo">を<\/mark>/,'the grammar part opens an explanation');assert.match(lesson,/data-speak="本を閉じた。"/);assert.match(lesson,/data-particles/);
 const q=g.exercisesFor(wo,real)[0],wrong=q.choices.find(c=>c!==q.answer);
 const miss=g.quizHTML(wo,q,{locale:'zh',esc,answered:wrong});assert.match(miss,/正确答案是「を」/);assert.match(miss,/正确的接法/);assert.match(miss,/data-retry/);assert.match(miss,/名词 \+ を \+ 他动词/,'shows how it attaches');
 const hit=g.quizHTML(wo,q,{locale:'zh',esc,answered:'を'});assert.match(hit,/答对了/);assert.match(hit,/data-next/);
 const src=fs.readFileSync(path.join(__dirname,'..','web','grammar.js'),'utf8');assert.match(src,/playSentence\(api,/,'read aloud plays the game voice first, then the voice engine');assert.match(src,/prefers-reduced-motion/);
});
