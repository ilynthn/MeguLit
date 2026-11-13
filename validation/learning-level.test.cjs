'use strict';
/* 学习 → 日语水平 and the grammar redesign (2026-11-11): the first-visit level choice marks what lies below it as known,
   lessons are six guided steps, practice drags the answer into the gap, the page is kept between visits, and the
   kana chart on the learning home can be clicked to hear a kana and set its familiarity. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const L=require('../services/learning-level.cjs'),G=require('../services/grammar.cjs'),K=require('../services/kana.cjs'),{openStore}=require('../services/store.cjs');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
function temp(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-level-'));return root;}

test('levels: none → N0, unset at first, and where each one starts',()=>{
 assert.deepEqual(L.LEVELS,['none','kana','N5','N4','N3','N2','N1','N0']);
 const root=temp();assert.equal(L.get(root).level,null,'first visit has no level, so the picker is shown');
 assert.equal(L.recommend('none').tab,'kana');assert.equal(L.recommend('kana').tab,'kana');
 assert.deepEqual([L.recommend('N5').tab,L.recommend('N5').grammar],['grammar','N4']);
 assert.equal(L.recommend('N2').grammar,'N1');assert.equal(L.recommend('N0').reason,'native');
});

test('choosing a level marks what lies below it as known, and never lowers anything',async()=>{
 const root=temp(),db=openStore(path.join(root,'test.sqlite'));
 try{
  K.save(root,{mastery:{'あ':1}});
  let r=await L.set(db,root,{level:'kana',kana:['あ','い']});assert.deepEqual(r.applied,{kana:0,grammar:0},'partial kana marks nothing');
  assert.equal(L.get(root).level,'kana');
  r=await L.set(db,root,{level:'N5',kana:['あ','い','ア','きゃ','bad!']});assert.equal(r.applied.kana,4);assert.equal(r.applied.grammar,0,'N5 itself is still to learn');
  assert.deepEqual(K.read(root).mastery,{'あ':3,'い':3,'ア':3,'きゃ':3});
  r=await L.set(db,root,{level:'N4',kana:[]});assert.equal(r.applied.grammar,G.POINTS.length,'from N4 up every N5 point is learned');
  assert.ok(G.POINTS.every(p=>G.progress(db)[p].learned));
  r=await L.set(db,root,{level:'none',kana:['あ']});assert.equal(K.read(root).mastery['あ'],3,'a lower level later erases nothing');assert.ok(G.progress(db).wa.learned);
  await assert.rejects(()=>L.set(db,root,{level:'N9'}),/INVALID_LEARNING_LEVEL/);
  const bridge=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');assert.match(bridge,/case 'learning_level':/);assert.match(bridge,/case 'learning_level_set':/);
 }finally{db.close?.();}
});

test('the picker offers all eight levels and is asked from the learning page',async()=>{
 const lv=await import('../web/learning-level.js');
 assert.deepEqual(lv.LEVEL_CHOICES.map(l=>l.id),L.LEVELS);
 const html=lv.pickerHTML(null,esc);for(const id of L.LEVELS)assert.match(html,new RegExp(`data-level-pick="${id}"`));assert.match(html,/完全不懂/);assert.match(html,/母语/);
 const kana=lv.allKana();assert.ok(kana.includes('あ')&&kana.includes('ア')&&kana.includes('きゃ')&&kana.includes('ぱ'));
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8'),/import\('\.\/learning-level\.js'\)\.then\(m=>m\.ensureLevel/);
});

test('a lesson is six guided steps with Megumin, built from your own games when it can',async()=>{
 const {N5}=await import('../web/grammar-n5.js'),g=await import('../web/grammar.js'),wo=N5.find(p=>p.id==='wo');
 const real=[{text:'本を閉じた。',start:1,end:2,title:'魔法使いの夜',readAt:1794300000,origin:'history'}];
 const html=g.lessonHTML(wo,{examples:{wo:real},progress:{}},{locale:'zh',esc,step:2});
 assert.deepEqual(g.STEPS,['intro','form','play','uses','games','practice']);
 assert.equal((html.match(/data-stepbody=/g)||[]).length,6);assert.match(html,/data-stepbody="2">/,'the chosen step is shown');assert.match(html,/data-stepbody="0" hidden/);
 assert.match(html,/gm-step-dot active[^"]*" data-step="2"/);assert.match(html,/第 3 \/ 6 步/);
 assert.match(g.meguminIntro(wo,real,'zh'),/吾名惠惠/);assert.match(g.meguminIntro(wo,real,'zh'),/《魔法使いの夜》/,'names the game you met it in');
 assert.match(g.meguminIntro(wo,[],'zh'),/还没捉到它/,'falls back to built-in lines');
 assert.match(html,/<span class="gm-block" style="--i:0">名词<\/span>/,'how it attaches is drawn as blocks');
 const desu=g.lessonHTML(N5.find(p=>p.id==='kosoado'),{progress:{}},{locale:'zh',esc});assert.match(desu,/data-jd/,'points without a lab: pick the natural line');assert.match(desu,/data-ok="1"/);
});

test('practice drags the answer into the gap; the list says what to learn next',async()=>{
 const {N5}=await import('../web/grammar-n5.js'),g=await import('../web/grammar.js'),wo=N5.find(p=>p.id==='wo');
 const q=g.exercisesFor(wo,[])[0],open=g.quizHTML(wo,q,{locale:'zh',esc});
 assert.match(open,/data-drop>拖到这里/);assert.match(open,/data-choice=/);assert.doesNotMatch(open,/draggable/,'no HTML5 drag: it does not work in WebView2');assert.match(open,/把答案拖进空里/);
 
 assert.equal(g.nextPoint({}).id,N5[0].id);assert.equal(g.nextPoint({[N5[0].id]:{learned:true}}).id,N5[1].id);
 const list=g.listHTML({progress:{},completion:g.completion({})},{locale:'zh',esc,userLevel:'N5'});
 assert.match(list,/class="gm-hero"/);assert.match(list,/class="primary gm-hero-go" data-point="wa"/);assert.match(list,/gm-hero-level">N5</);assert.match(list,/data-change-level/);
 assert.match(list,/gm-card next" data-point="wa"/);
});

test('the grammar page is kept between visits instead of loading again',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','grammar.js'),'utf8');
 assert.match(src,/const memo=\{data:null/);assert.match(src,/if\(!data\)await load\(false\)/,'the report is fetched only when nothing is kept');
 const g=await import('../web/grammar.js');assert.equal(typeof g.grammarMemo,'function');
});

test('the 平假名熟悉度 chart on the learning home can be clicked, heard and set',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','kana','views','index.js'),'utf8');
 assert.match(src,/<button type="button" class="m\$\{lv\(c\)\}" data-mk=/);assert.match(src,/ctx\.speech\.say\(k\)/);assert.match(src,/data-mk-lv/);assert.match(src,/S\.put\(KEY\.m,m\)/);
 assert.match(src,/\['未学','见过','熟悉','掌握'\]/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','kana','kana.css'),'utf8'),/\.mk-card\{/);
});

test('the system map is real lines to take apart, covering all nine parts, in the megu-edit look',async()=>{
 const g=await import('../web/grammar.js'),{MAP}=await import('../web/grammar-map.js');
 const used=new Set(g.SCENES.flatMap(s=>s.pieces.map(p=>p[2])));for(const n of MAP)assert.ok(used.has(n.id),n.id+' appears in some line');
 for(const s of g.SCENES)assert.equal(s.pieces.map(p=>p[0]).join(''),s.ja,'pieces spell the line');
 const html=g.mapHTML({progress:{}},{locale:'zh',esc,open:'conjugation',piece:8});
 assert.match(html,/gm-piece n-conjugation on picked" data-piece="8"/);assert.match(html,/<i class="gm-piece-no">IV<\/i><b>読み<\/b>/);assert.match(html,/词干不动，只换尾巴/,'Megumin explains the tapped piece');
 assert.match(html,/megulit · grammar lab/);assert.match(g.mapHTML({progress:{}},{locale:'zh',esc,open:'clauses'}),/gm-scene active" data-scene="3"/,'a part opens the line it is in');
 for(const k of ['invert','glitch','push','focus','type','burst'])assert.equal(typeof g.fx[k],'function');
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','grammar.css'),'utf8'),/--mg-red:#c8323c/);
});

test('the map takes apart lines you read in your games, cut by the tokenizer and cached',async()=>{
 const T=spec=>{let at=0;return spec.map(([surface,base,p1,p2,norm])=>{const t={surface,base_form:base,normalized:norm||base,pos:p1,grammar:[p1,p2||'*'],start:at,end:at+[...surface].length};at=t.end;return t;});};
 const line=T([['雨','雨','名詞','普通名詞'],['が','が','助詞','格助詞'],['降っ','降る','動詞','一般'],['て','て','助詞','接続助詞'],['いる','いる','動詞','非自立可能','居る'],['から','から','助詞','接続助詞'],['、','、','補助記号','読点'],['待ち','待つ','動詞','一般'],['ます','ます','助動詞'],['。','。','補助記号','句点']]);
 const cut=G.cutLine(line);assert.deepEqual(cut.map(p=>[p[0],p[2]]),[['雨','classes'],['が','particles'],['降っ','conjugation'],['て','conjugation'],['いる','aspect'],['から','clauses'],['、','order'],['待ち','conjugation'],['ます','politeness'],['。','order']]);
 const root=temp(),db=openStore(path.join(root,'t.sqlite'));
 try{let calls=0;const list=[{text:'雨が降っているから、待ちます。',title:'サクラノ詩',gameId:'g1',origin:'history',translation:'在下雨，我等着。'}];
  const sc=await G.scenes(db,list,async()=>{calls++;return line;});assert.equal(sc.length,1);assert.equal(sc[0].label,'サクラノ詩');assert.equal(sc[0].real,true);
  await G.scenes(db,list,async()=>{calls++;return line;});assert.equal(calls,1,'a cut line is cached');
  const g=await import('../web/grammar.js');const html=g.mapHTML({progress:{},scenes:sc},{locale:'zh',esc});assert.match(html,/title="サクラノ詩"/);assert.match(html,/data-piece="4" data-node="aspect"/);
  assert.match(g.mapHTML({progress:{}},{locale:'zh',esc}),/普通的一句/,'built-in lines only before anything is read');
 }finally{db.close?.();}
});

test('假名游戏 is part of 五十音: no own tab, old links open the practice block',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');
 assert.doesNotMatch(app.match(/const LEARNING_TABS=\[[^\]]*\]/)[0],/kanagames/);
 assert.match(app,/if\(subtab==='kanagames'\)\{subtab='kana';kanaFocus='practice';\}/);
 const kana=fs.readFileSync(path.join(__dirname,'..','web','kana','kana.js'),'utf8');assert.doesNotMatch(kana,/openTab\('kanagames'\)/);
 const idx=fs.readFileSync(path.join(__dirname,'..','web','kana','views','index.js'),'utf8');
 for(const g of ['pos','seq','conv'])assert.ok(idx.includes(`['${g}',`),g);assert.match(idx,/id="practice"/);assert.match(idx,/ctx\.go\(`play\.html\?g=\$\{b\.dataset\.game\}&d=\$\{diff\}/);
});

test('N4 → N0: lessons, hits found in lines you read, drag-in exercises, and picking a level marks the ones below',async()=>{
 const lv=await import('../web/grammar-levels.js'),g=await import('../web/grammar.js');
 for(const level of lv.LEVEL_LIST)for(const p of lv.levelPoints(level)){
  assert.match(p.id,/^n[0-4]-[a-z0-9-]+$/);assert.ok(lv.LEVEL_GROUPS[p.group],p.id+' group');assert.ok(['order','particles','classes','conjugation','auxiliary','politeness','aspect','viewpoint','clauses'].includes(p.node),p.id+' node');
  for(const l of ['zh','ja','en'])assert.ok(p.title[l]&&p.gist[l],p.id+' '+l);
  assert.ok(p.form.length&&p.uses.length>=2&&p.pitfalls.length>=2&&p.builtin.length>=3,p.id+' content');
  for(const b of p.builtin)assert.ok(lv.findHit(p,b.ja),p.id+' finds itself in 「'+b.ja+'」');
  assert.ok(!p.wrong.some(x=>p.hits.includes(x)),p.id+' distractors are not its own forms');
  const q=g.exercisesFor(p,[],3);assert.ok(q.length>=2,p.id+' has exercises');for(const x of q)assert.ok(x.choices.includes(x.answer)&&x.choices.filter(c=>p.hits.includes(c)).length===1,p.id+' one right answer');
 }
 const ba=lv.levelPoints('N4').find(p=>p.id==='n4-ba');assert.equal(lv.findHit(ba,'ばかじゃない'),null,'ば needs a verb before it');assert.equal(lv.findHit(ba,'行けばいい').text,'ば');
 const list=[{text:'雨が止んだら、外に出よう。',title:'G',gameId:'g',origin:'history',translation:'雨停了就出去。',translationSource:'group'}];
 const ex=G.levelExamples(list,await G.levels());assert.equal(ex['n4-tara'][0].title,'G');assert.deepEqual([ex['n4-tara'][0].start,ex['n4-tara'][0].end],[4,6]);
 assert.equal(g.startLevel('N5'),'N4');assert.equal(g.startLevel('none'),'N5');assert.equal(g.startLevel('N0'),'N0');
 const html=g.listHTML({progress:{}},{locale:'zh',esc,level:'N4'});assert.match(html,/data-point="n4-tara"/);assert.match(html,/N4 · 01 \/ /);
 assert.ok(G.validPoint('n4-tara'));assert.ok(!G.validPoint('n9-x'));
 const root=temp(),db=openStore(path.join(root,'t.sqlite'));try{await L.set(db,root,{level:'N3',kana:[]});const pr=G.progress(db);assert.ok(pr.wa.learned&&pr['n4-tara'].learned,'N3 marks N5 and N4');}finally{db.close?.();}
});

test('grammar cards from the learner\'s own Anki are read at run time and merged into the lessons',async()=>{
 const B=require('../services/bluebook.cjs'),{DatabaseSync}=require('node:sqlite');
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE notetypes(id INTEGER,name TEXT);CREATE TABLE fields(ntid INTEGER,ord INTEGER,name TEXT);CREATE TABLE notes(id INTEGER,mid INTEGER,flds TEXT);');
 const names=['Level','Word','ConnectiveType1','Explain1','Example1','Chinese1','Example2','Chinese2','Note1','TotalOrder'];db.prepare('INSERT INTO notetypes VALUES(1,?)').run('文法');names.forEach((n,i)=>db.prepare('INSERT INTO fields VALUES(1,?,?)').run(i,n));
 const note=(id,vals)=>db.prepare('INSERT INTO notes VALUES(?,1,?)').run(id,names.map(n=>vals[n]||'').join('\x1f'));
 note(11,{Level:'蓝宝书【N4】',Word:' ～たら',ConnectiveType1:'动词た形＋ら',Explain1:'表示假定条件，“如果……的话”。',Example1:'雨が 降[ふ]っ<b>たら</b>行かない。',Chinese1:'下雨就不去。',TotalOrder:'5'});
 note(12,{Level:'蓝宝书【N2】',Word:' ～あげく（に）',ConnectiveType1:'动词た形＋あげく',Explain1:'表示“最后……”。',Example1:'さんざん迷った<b>あげく</b>、やめた。',Chinese1:'犹豫了半天，最后放弃了。',Example2:'喧嘩した<b>あげく</b>、別れた。',Chinese2:'吵到最后分手了。',Note1:'多用于不好的结果。',TotalOrder:'9'});
 const cards=B.parse(db);assert.equal(cards.length,2);const ageku=cards.find(c=>c.level==='N2');
 assert.equal(cards.find(c=>c.level==='N4').examples[0].ja,'雨が降ったら行かない。','furigana is removed');assert.ok(ageku.hits.includes('あげく'));assert.equal(ageku.examples[0].hl,'あげく');
 const ex=B.examplesFor(cards,[{text:'悩んだあげく、告白した。',title:'G',gameId:'g',origin:'history'}]);assert.equal(ex[ageku.id][0].title,'G');
 const g=await import('../web/grammar.js'),r=g.useAnkiCards(cards);assert.deepEqual(r,{merged:1,own:1},'たら joins the N4 lesson, あげく gets its own');
 const tara=g.pointsOf('N4').find(p=>p.id==='n4-tara');assert.equal(tara.anki.length,1);assert.match(g.lessonHTML(tara,{progress:{}},{locale:'zh',esc}),/蓝宝书 · 来自你的 Anki · ～たら|蓝宝书 · 来自你的 Anki · たら/);
 const own=g.pointsOf('N2').find(p=>p.id==='bb-12');assert.ok(own);assert.match(g.listHTML({progress:{}},{locale:'zh',esc,level:'N2'}),/class="gm-stg[^"]*" data-gtab="[a-z]+"/,'cards join the same kinds as the lessons, shown as stages');
 assert.ok(g.exercisesFor(own,[],2).every(q=>q.choices.includes(q.answer)));
 assert.ok(G.validPoint('bb-12'));g.useAnkiCards([]);
 const bridge=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');assert.match(bridge,/case 'grammar_bluebook'/);
 assert.equal(fs.readdirSync(path.join(__dirname,'..','web')).some(f=>/bluebook|蓝宝书/i.test(f)),false,'no card text ships with MeguLit');
});

test('without the deck the grammar page offers it on AnkiWeb, with a notice that the learner is responsible',async()=>{
 const g=await import('../web/grammar.js');
 const off=g.listHTML({progress:{}},{locale:'zh',esc,level:'N5',anki:{available:false,points:[]}});
 assert.match(off,/data-anki-get/);assert.match(off,/data-anki-reload/);assert.match(off,/责任由你自己承担/);assert.equal(g.ANKI_DECK,'https://ankiweb.net/shared/info/1748349244');
 assert.match(g.listHTML({progress:{}},{locale:'zh',esc,level:'N5',anki:{available:true,points:[1,2]}}),/已读取你的 Anki：蓝宝书等语法卡 2 条/);
 assert.doesNotMatch(g.listHTML({progress:{}},{locale:'zh',esc,level:'N5',anki:null}),/data-anki-get/,'nothing while still reading');
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8'),/'ankiweb\.net'\]\.includes\(url\.hostname\)/,'the page may open AnkiWeb');
});

test('the 五十音 voice choice (女声 / 男声 / AI 合成) can be changed and is kept',()=>{
 const K=require('../services/kana.cjs');assert.equal(K.clean({prefs:{voice:'male'}}).prefs.voice,'male');assert.equal(K.clean({prefs:{voice:'ai'}}).prefs.voice,'ai');assert.equal(K.clean({prefs:{voice:'x'}}).prefs.voice,'female');
 const src=fs.readFileSync(path.join(__dirname,'..','web','kana','kana.js'),'utf8');assert.match(src,/ctx\.store\.put\(KEY\.p,\{\.\.\.p,voice:b\.dataset\.voice\}\)/);assert.doesNotMatch(src,/ctx\.store\.set\(/,'the store has get/put, no set');
});

test('rewards: magic points, titles, the line collection, and 惠惠\'s real lines',async()=>{
 const R=require('../services/learning-rewards.cjs'),root=temp(),db=openStore(path.join(root,'r.sqlite'));
 try{assert.deepEqual([R.state(db).mana,R.state(db).title],[0,'见习魔法使']);
  let r=R.add(db,{kind:'answer',ref:'wa',streak:1,line:{text:'私はずっと待っていた。',title:'G',origin:'history',readAt:1}});assert.equal(r.gained,5);assert.equal(r.collected,true);
  r=R.add(db,{kind:'answer',ref:'wa',streak:4,line:{text:'私はずっと待っていた。',title:'G',origin:'history'}});assert.equal(r.bonus,6,'streak bonus');assert.equal(r.collected,false,'a line is collected once');
  R.add(db,{kind:'answer',ref:'wa',line:{text:'内置',origin:'builtin'}});assert.equal(R.album(db).length,1,'only lines from your games');
  for(let k=0;k<3;k++)r=R.add(db,{kind:'learned',ref:'x'});assert.equal(r.title,'红魔族学徒');
  assert.throws(()=>R.add(db,{kind:'cheat'}),/INVALID_REWARD/);
  const b=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');for(const c of ['learning_rewards','learning_reward','learning_album'])assert.match(b,new RegExp(`case '${c}'`));
 }finally{db.close?.();}
 const w=await import('../web/rewards.js');for(const k of ['praise','clear','cheer'])for(const [line,src] of w.QUOTES[k]){assert.ok([...line].length<=30,line);assert.match(src,/^(TV \d期 \d+話|映画 紅伝説)$/,line+' says where it is from');}
 const g=await import('../web/grammar.js');assert.match(g.listHTML({progress:{}},{locale:'zh',esc,level:'N5',rewards:{mana:12,album:3,rank:1,title:'见习魔法使',floor:0,next:150}}),/战利品 <b>3<\/b>/);
});

test('the 蓝宝书 deck is detected before offering a download: profile folders, AnkiConnect, and the reason when it cannot be read',async()=>{
 const B=require('../services/bluebook.cjs');
 const none=B.fromFiles(temp(),{APPDATA:path.join(temp(),'nope')});assert.equal(none.available,false);assert.ok(none.errors.length);
 const anki={call:async(c,action,params)=>action==='deckNames'?['默认','蓝宝书_N1-N5_超值白金版','蓝宝书_N1-N5_超值白金版::文法カード']:action==='findNotes'?[7]:[{noteId:7,modelName:'双类型文法卡组Note',fields:{Level:{value:'蓝宝书【N3】'},Word:{value:' ～ばかり'},Explain1:{value:'光……'},Example1:{value:'嘘<b>ばかり</b>だ。'},Chinese1:{value:'净是谎话。'}}}]};
 const r=await B.fromAnkiConnect(anki,{});assert.equal(r.available,true);assert.equal(r.points[0].id,'bb-7');assert.equal(r.points[0].level,'N3');assert.deepEqual(r.decks.length,2);
 const g=await import('../web/grammar.js');const html=g.listHTML({progress:{}},{locale:'zh',esc,level:'N0',anki:{available:false,points:[],profiles:['megumin'],decks:['蓝宝书_N1-N5_超值白金版'],errors:['megumin：EBUSY']}});
 assert.match(html,/找到了「蓝宝书_N1-N5_超值白金版」/);assert.match(html,/data-anki-reload>重试/);assert.doesNotMatch(html,/data-anki-get/,'never asks to download a deck that is already there');
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8'),/await B\.readAll\(root/);
});

test('动手玩 picks the natural line (no cutting lines into pieces), and dragging uses pointer events, not HTML5 drag',async()=>{
 const g=await import('../web/grammar.js'),{N5}=await import('../web/grammar-n5.js'),lv=await import('../web/grammar-levels.js');
 for(const p of [N5.find(x=>x.id==='kosoado'),lv.levelPoints('N4')[0],lv.levelPoints('N0').find(x=>x.era)]){const rs=g.judgeRounds(p);assert.ok(rs.length>=1,p.id);
  for(const r of rs){assert.equal(r.options.filter(o=>o.ok).length,1,p.id+' one natural line');assert.ok(r.options.length>=2);assert.equal(new Set(r.options.map(o=>o.text)).size,r.options.length,p.id+' the lines differ');}}
 const era=lv.levelPoints('N0').find(x=>x.era&&x.group==='e90');assert.match(g.lessonHTML(era,{progress:{}},{locale:'zh',esc}),/最可能是谁在说/,'N0 words ask who would say it');
 const src=fs.readFileSync(path.join(__dirname,'..','web','grammar.js'),'utf8');assert.doesNotMatch(src,/dataTransfer|ondragstart|draggable="true"|data-find/);assert.match(src,/pointerDrag\(b,\{over:'\[data-drop\]'/);assert.match(src,/pointerDrag\(t,\{over:'\[data-slot\]'/);
 const d=fs.readFileSync(path.join(__dirname,'..','web','drag.js'),'utf8');for(const k of ['pointerdown','pointermove','pointerup','setPointerCapture','elementFromPoint'])assert.ok(d.includes(k),k);
});
