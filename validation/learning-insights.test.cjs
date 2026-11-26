'use strict';
/* Learning from reading (2026-11-10): human translation first on sentence cards, word frequency from the lines read,
   JLPT coverage maths, the weekly review list and the Anki field mapping. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const I=require('../services/learning-insights.cjs'),{openStore}=require('../services/store.cjs');

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-insights-'));const db=openStore(root);t.after(()=>{try{db.close();}catch{}fs.rmSync(root,{recursive:true,force:true});});
 db.prepare("INSERT INTO games(id,title) VALUES('g1','Game One'),('g2','Game Two')").run();return {root,db};}
const tok=(surface,base,pos,start,extra={})=>({surface,base_form:base,normalized:extra.normalized||base,pos,grammar:[pos,...(extra.grammar||[])],start,end:start+[...surface].length,reading:extra.reading||''});

test('human translation (group patch, official Chinese) is preferred over machine translation',()=>{
 assert.deepEqual(I.pickTranslation({human:{text:'拂去覆盖在她脸上的雪。',source:'group'},machine:'拂去她脸上的雪'}),{translation:'拂去覆盖在她脸上的雪。',translationSource:'group'});
 assert.deepEqual(I.pickTranslation({human:{text:'官方译文',source:'official'},machine:'机翻'}),{translation:'官方译文',translationSource:'official'});
 assert.deepEqual(I.pickTranslation({human:null,machine:'机翻'}),{translation:'机翻',translationSource:'machine'});
 assert.deepEqual(I.pickTranslation({human:{text:'まだ日本語のままだ',source:'group'},machine:'机翻'}),{translation:'机翻',translationSource:'machine'},'a line still in Japanese is no translation');
 assert.deepEqual(I.pickTranslation({}),{translation:'',translationSource:''});
 /* zero-latency provider results */
 assert.deepEqual(I.humanFromResolve('patch',{status:'exact',translation:'汉化组的话'}),{text:'汉化组的话',source:'group'});
 assert.equal(I.humanFromResolve('patch',{status:'exact',translation:'机器补的',machine:true}),null,'machine-filled lines are not human');
 assert.equal(I.humanFromResolve('patch',{status:'low',translation:'不确定'}),null);
 assert.deepEqual(I.humanFromResolve('original',{status:'high',captured:'官方中文'}),{text:'官方中文',source:'official'});
 assert.equal(I.humanFromResolve('original',{status:'exact',captured:'日本語です'}),null);
});

test('a machine translation never overwrites the human one recorded for a read line',t=>{
 const {root,db}=fixture(t);db.close();
 const {ReadingStatistics}=require('../services/reading-statistics.cjs'),s=new ReadingStatistics(root,()=>1_800_000_000_000);
 s.translation('g1','彼女の顔を覆う雪を払う。','拂去覆盖在她脸上的雪。','group');s.translation('g1','彼女の顔を覆う雪を払う。','机器翻译','machine');
 assert.equal(s.line({gameId:'g1',text:'彼女の顔を覆う雪を払う。',sequence:1}),true);
 const check=openStore(root);try{const o=JSON.parse(check.prepare('SELECT original FROM reading_events').get().original);assert.deepEqual(o,{translation:'拂去覆盖在她脸上的雪。',translationSource:'group'});}finally{check.close();}
 s.translation('g1','彼女の顔を覆う雪を払う。','另一个机翻','machine');
 const again=openStore(root);try{assert.equal(JSON.parse(again.prepare('SELECT original FROM reading_events').get().original).translation,'拂去覆盖在她脸上的雪。');}finally{again.close();}
});

test('saving a word from the overlay keeps the game line and its human translation',t=>{
 const {root,db}=fixture(t);db.close();
 const sql=require('../services/legacy-reader-sql.cjs'),args=values=>({db:'sqlite:immersion.db',query:'INSERT INTO word_sentences (word_id, sentence_text, highlight_start, highlight_end, media_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)',values});
 sql.request(root,'plugin:sql|execute',args([7,'雪を払う。',0,1,null,1]),{sentenceTranslation:()=>({translation:'拂去雪。',translationSource:'official'})});
 const check=openStore(root);try{const row=check.prepare('SELECT text,translation,original FROM examples').get();assert.equal(row.text,'雪を払う。');assert.equal(row.translation,'拂去雪。');assert.equal(JSON.parse(row.original).translationSource,'official');}finally{check.close();}
});

test('readings: the game ruby comes first, then the dictionary; the tokenizer guess is dropped',()=>{
 const tokens=[{surface:'雪',reading:'ゆき',readingSource:'dictionary'},{surface:'菜々',reading:'ナナ',readingSource:'tokenizer'},{surface:'彼女',reading:'かのじょ',readingSource:'dictionary'}];
 const out=I.applyGameRuby(tokens,{'彼女':'ひと'},[['雪','せつ']]);
 assert.deepEqual(out.map(t=>t.reading),['せつ','','ひと']);
 assert.equal(out[0].readingSource,'game');
 /* the resolver marks which readings came from the dictionary */
 const {createReadingResolver}=require('../core/reading.cjs'),file=path.join(os.tmpdir(),'megulit-jmdict-'+process.pid+'.json');fs.writeFileSync(file,JSON.stringify([{spellings:['雪'],readings:['ゆき']}]));
 try{const r=createReadingResolver(file).resolve([{surface:'雪',reading:'ユキ'},{surface:'菜々',reading:'ナナ'}]);assert.equal(r[0].readingSource,'dictionary');assert.equal(r[1].readingSource,'tokenizer');}finally{fs.rmSync(file,{force:true});}
});

test('Anki sentence card fields: sentence, reading, translation, game title and source',async()=>{
 const available=['Word','Pitch','PartOfSpeech','Meaning','Sentence','Audio','SentenceFurigana','SentenceTranslation','WordReading','Game','TranslationSource'];
 assert.deepEqual(I.ankiSentenceFields({sentence:'雪を払う。',sentenceHtml:'<ruby>雪<rt>ゆき</rt></ruby>を払う。',translation:'拂去雪。',translationSource:'group',gameTitle:'Game One',word:'払う',reading:'ハラウ'},available),
  {Sentence:'雪を払う。',SentenceFurigana:'<ruby>雪<rt>ゆき</rt></ruby>を払う。',SentenceTranslation:'拂去雪。',WordReading:'はらう',Game:'Game One',TranslationSource:'汉化组译文'});
 assert.deepEqual(I.ankiSentenceFields({sentence:'x',translation:'',gameTitle:'G'},['Sentence','Game','TranslationSource']),{Sentence:'x',Game:'G',TranslationSource:''});
 assert.equal(I.ankiSentenceFields({translation:'t',translationSource:'machine'},['TranslationSource']).TranslationSource,'机器翻译');
 /* the note sent to AnkiConnect */
 const {Anki,extraFields,BACK}=require('../core/anki.cjs');assert.ok(extraFields.includes('Game')&&extraFields.includes('TranslationSource'));assert.match(BACK,/\{\{Game\}\}/);
 const anki=new Anki();let sent;anki.prepareModel=async()=>({available,owned:true});
 anki.call=async(c,action,p)=>{if(action==='findNotes')return [];if(action==='addNote'){sent=p.note.fields;return 42;}return null;};
 await anki.sync({surface:'払う',reading:'はらう',sentence:'雪を払う。',meaning:'拂',pos:'动词',pitch:[2]},{ankiModel:'MeguLit',ankiDeck:'MeguLit'},null,{translation:'拂去雪。',translationSource:'official',gameTitle:'Game One',sentenceHtml:'雪を払う。'});
 assert.equal(sent.SentenceTranslation,'拂去雪。');assert.equal(sent.Game,'Game One');assert.equal(sent.TranslationSource,'官方中文');assert.equal(sent.Sentence,'雪を払う。');
});

test('word frequency counts content words from read lines, per game and overall, and leaves saved words out',()=>{
 const words=I.lineWords([tok('彼女','彼女','代名詞',0),tok('雪','雪','名詞',3),tok('払う','払う','動詞',5),tok('する','する','動詞',8),tok('二','二','名詞',10,{grammar:['数詞']}),tok('菜々','菜々','名詞',11,{grammar:['固有名詞']}),tok('わかっ','わかる','動詞',13,{normalized:'分かる'})]);
 assert.deepEqual(words.map(w=>w[0]),['雪','払う','分かる'],'pronouns, する, numbers and names are not counted');
 const rows=[
  {gameId:'g1',readAt:100,words:[['雪','雪',0,1],['払う','払う',2,4],['雪','雪',5,6]]},
  {gameId:'g1',readAt:150,words:[['雪','雪',0,1]]},
  {gameId:'g2',readAt:200,words:[['雪','雪',0,1],['分かる','わかる',1,4]]},
  {gameId:'g2',readAt:300,words:[['分かる','わかる',0,3],['分かる','分かる',3,6]]}];
 const all=I.countWords(rows);
 assert.deepEqual(all.map(w=>[w.key,w.count]),[['雪',3],['分かる',2],['払う',1]],'a word counts once per line');
 assert.equal(all.find(w=>w.key==='分かる').base,'わかる','shows the spelling used most');
 assert.deepEqual(all.find(w=>w.key==='雪').games,[{id:'g1',count:2},{id:'g2',count:1}]);
 assert.deepEqual(I.countWords(rows,{gameId:'g1'}).map(w=>[w.key,w.count]),[['雪',2],['払う',1]]);
 assert.deepEqual(I.countWords([{gameId:'g1',readAt:1,words:Array(9).fill(['粘着力','粘着力',0,3])}]).map(w=>w.count),[1],'a repeated capture is one line');
 const saved=I.savedForms([{spelling:'雪',reading:'ゆき'},{spelling:'',reading:'ワカル'}]);
 assert.deepEqual(I.countWords(rows,{saved}).map(w=>w.key),['払う'],'saved spellings and kana readings are excluded');
 assert.deepEqual(I.countWords(rows,{since:200}).map(w=>[w.key,w.count]),[['分かる',2],['雪',1]],'the weekly list counts only this week');
});

test('recorded lines lose the game ruby markup and mojibake is not counted',()=>{
 assert.equal(I.plainLine('　車の窓はびっしり<rしも>霜</r>だらけで、\n出かける'),'車の窓はびっしり霜だらけで、出かける');
 assert.equal(I.readableLine('彼女の顔を覆う雪を払う。'),true);
 assert.equal(I.readableLine('縲\u0080縲\u0080謌第裏豕慕峩隗・ｻ厄ｼ瑚凶'),false);
 assert.equal(I.readableLine('2026/11/10 05:13:04<選択肢>ｲｻﾌ瞎ﾑｲｻﾌ'),false);
});

test('the week starts on Monday 00:00 local time',()=>{
 const wed=new Date(2026,10,11,15,30),mon=new Date(2026,10,9,0,0,0);
 assert.equal(I.weekStart(wed),Math.floor(mon.getTime()/1000));
 assert.equal(I.weekStart(new Date(2026,10,15,23,0)),Math.floor(mon.getTime()/1000),'Sunday belongs to the week before');
});

test('JLPT coverage: share of each level met in reading and saved; game level lean adds up to 1',()=>{
 const index=I.jlptIndex({levels:{N5:['雪|ゆき','ある|ある','分かる/判る|わかる','食べる|たべる'],N4:['払う|はらう','雪|ゆき'],N3:[],N2:[],N1:['覆う|おおう']}});
 assert.equal(index.levels.N4.length,1,'雪 is already N5');assert.equal(index.byForm.get('雪').level,'N5','a word belongs to its easiest level');
 const rows=[{gameId:'g1',readAt:1,words:[['雪','雪'],['払う','払う'],['有る','ある']]},{gameId:'g2',readAt:2,words:[['分かる','わかる'],['珍品','珍品']]}];
 const cov=I.jlptCoverage(index,rows,new Set(['雪','食べる']));
 const n5=cov.find(c=>c.level==='N5');assert.deepEqual([n5.total,n5.met,n5.saved],[4,3,2]);assert.equal(n5.metShare,.75);assert.equal(n5.savedShare,.5);
 const n4=cov.find(c=>c.level==='N4');assert.deepEqual([n4.total,n4.met,n4.saved],[1,1,0]);
 const n3=cov.find(c=>c.level==='N3');assert.deepEqual([n3.total,n3.metShare],[0,0],'an empty level does not divide by zero');
 const g2=I.gameLevels(index,rows,'g2');assert.equal(g2.total,2);
 assert.deepEqual(g2.levels.filter(l=>l.count).map(l=>[l.level,l.share]),[['N5',.5],['beyond',.5]]);
 assert.equal(I.gameLevels(index,rows,'g1').levels.reduce((n,l)=>n+l.share,0),1);
 /* the shipped list */
 const real=I.loadJlpt();for(const level of I.LEVELS)assert.ok(real.levels[level].length>500,level);assert.ok(real.byForm.has('会う'));
 assert.match(fs.readFileSync(path.join(__dirname,'..','THIRD-PARTY.md'),'utf8'),/open-anki-jlpt-decks/);
});

test('the counting pass tokenizes each read line once, and the report, example and one-click save use it',async t=>{
 const {db}=fixture(t);
 const add=db.prepare('INSERT INTO reading_events(session_id,game_id,text,read_at,original) VALUES(1,?,?,?,?)');
 const now=new Date(),at=Math.floor(now.getTime()/1000);
 add.run('g1','雪を払う。',at-60,JSON.stringify({translation:'拂去雪。',translationSource:'group'}));
 add.run('g1','雪が降る。',at-30,JSON.stringify({translation:'下雪了。',translationSource:'machine'}));
 add.run('g2','雪だ。',at-10*86400,JSON.stringify({translation:''}));
 const dict={'雪を払う。':[tok('雪','雪','名詞',0),tok('払う','払う','動詞',2)],'雪が降る。':[tok('雪','雪','名詞',0),tok('降る','降る','動詞',2)],'雪だ。':[tok('雪','雪','名詞',0)]};
 let calls=0;const tokenize=async text=>{calls++;return dict[text]||[];};
 assert.equal(await I.refresh(db,tokenize),0);assert.equal(calls,3);
 await I.refresh(db,tokenize);assert.equal(calls,3,'lines already counted are not tokenized again');
 const r=I.report(db,{now,jlpt:I.jlptIndex({levels:{N5:['雪|ゆき'],N4:['払う|はらう']}})});
 assert.equal(r.lines,3);assert.deepEqual(r.frequent.map(w=>[w.key,w.count]),[['雪',3],['降る',1],['払う',1]]);
 assert.deepEqual(r.weekly.map(w=>[w.key,w.count]),[['雪',2],['降る',1],['払う',1]]);
 assert.equal(r.frequent[0].jlpt,'N5');assert.equal(r.games[0].title,'Game One');
 assert.equal(r.jlpt.find(l=>l.level==='N4').met,1);
 /* the example is the game line, with the human translation recorded for it */
 const ex=I.exampleLine(db,'払う');assert.deepEqual([ex.text,ex.translation,ex.translationSource,ex.start,ex.end],['雪を払う。','拂去雪。','group',2,4]);
 await I.describe(db,r.frequent,async base=>base==='降る'?{id:3,spellings:['降'],readings:['ふ']}:{id:base==='雪'?1:2,spellings:[base],readings:['よみ'],definitions:['意味']});assert.equal(r.frequent[0].reading,'よみ');
 assert.ok(!r.frequent.find(w=>w.key==='降る').reading,'a nearby entry that is not the word lends no reading');
 I.saveWord(db,{id:1386010,spellings:['払う'],readings:['はらう'],definitions:['拂']},ex);
 const saved=db.prepare('SELECT v.spelling,e.text,e.translation,e.original FROM vocabulary v JOIN examples e ON e.word_id=v.id').get();
 assert.deepEqual([saved.spelling,saved.text,saved.translation,JSON.parse(saved.original).translationSource],['払う','雪を払う。','拂去雪。','group']);
 assert.ok(!I.report(db,{now,jlpt:I.jlptIndex({levels:{}})}).frequent.some(w=>w.key==='払う'),'a saved word leaves the list');
 /* E426 Known: saved already mastered (status 3) and gone from the weekly list */
 assert.equal(I.saveWord(db,{id:2,spellings:['降る'],readings:['ふる'],definitions:['下']},null,{status:3}).status,3);
 assert.equal(db.prepare('SELECT status FROM vocabulary WHERE id=2').get().status,3);
 assert.ok(!I.report(db,{now,jlpt:I.jlptIndex({levels:{}})}).weekly.some(w=>w.key==='降る'),'a known word leaves the weekly list');
});

test('lookups keep the game line they were made in',t=>{
 const {root,db}=fixture(t);db.close();require('../services/unknown-words.cjs').recordLookup(root,{surface:'払う',gameId:'g1',operationId:'op-12345678',sentence:'雪を払う。',translation:'拂去雪。',translationSource:'group'});
 const check=openStore(root);try{assert.deepEqual(JSON.parse(check.prepare('SELECT original FROM lookup_events').get().original),{trackUnknown:true,sentence:'雪を払う。',translation:'拂去雪。',translationSource:'group'});}finally{check.close();}
});

test('the learning page lists 读过的词 in zh/ja/en and renders coverage and the save button',async()=>{
 const {messages}=await import('../web/i18n.js');for(const l of ['zh','ja','en'])assert.ok(messages[l].readwords,l);
 const {readingInsightsHTML,insightMessages,coverageRows}=await import('../web/reading-insights.js');
 for(const l of ['zh','ja','en'])assert.deepEqual(Object.keys(insightMessages[l]).sort(),Object.keys(insightMessages.zh).sort(),l);
 assert.deepEqual(coverageRows([{level:'N5',total:8,met:3,saved:1,metShare:.375,savedShare:.125}])[0],{level:'N5',total:8,met:3,saved:1,metPct:'37.5%',savedPct:'12.5%'});
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';'),number=n=>String(n);
 const html=readingInsightsHTML({lines:3,pending:0,weekly:[{key:'雪',base:'雪',count:2,jlpt:'N5',games:[]}],frequent:[{key:'払う',base:'払う',count:1,reading:'はらう',games:[{id:'g1',title:'Game One'}]}],jlpt:[{level:'N5',total:1,met:1,saved:0,metShare:1,savedShare:0}],games:[{id:'g1',title:'Game One',lines:3,levels:[{level:'N5',count:1,share:1}]}]},{locale:'zh',esc,number});
 assert.match(html,/这周读到的生词/);assert.match(html,/data-save="払う"/);assert.match(html,/100%/);assert.match(html,/Game One/);
 assert.match(readingInsightsHTML({lines:0,pending:0},{locale:'en',esc,number}),/No lines read yet/);
});

test('JLPT word dialog keeps loading readings and meanings across rapid scrolls and retries after transient errors',async t=>{
 const {startEdge}=require('./library-views-perf.cjs');
 const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));
 if(!hasEdge)return t.skip('Edge not available');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jlpt-scroll-'));
 let browser;
 t.after(async()=>{try{await browser?.stop();}finally{await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:150});}});
 browser=await startEdge(profile);
 const source=fs.readFileSync(path.join(__dirname,'../web/jlpt-words.js'),'base64');
 const result=await browser.evaluate(`(async()=>{
  const {openJlptWords,JW_ROW}=await import('data:text/javascript;base64,${source}');
  const words=Array.from({length:60},(_,i)=>({key:'w'+i,base:'語'+i,reading:'',meaning:'',count:60-i,saved:false,known:false}));
  const asked=[];let failNext=false;
  const api=async(cmd,args)=>{
   if(cmd==='jlpt_words')return {words,gameTitle:''};
   if(cmd==='jlpt_describe'){
    const keys=args.items.map(x=>x.key);asked.push(keys);
    if(failNext){failNext=false;throw Error('TEMP_FAIL');}
    return args.items.map(x=>Number(x.key.slice(1))>=40?{key:x.key,meaning:'',reading:''}:{key:x.key,meaning:'释义-'+x.key,reading:'ヨミ-'+x.key});
   }
  };
  const dlg=await openJlptWords({api,locale:'zh',esc:String,number:String,level:'N1'});
  const scroll=dlg.querySelector('[data-jw-scroll]');
  scroll.style.cssText='height:300px;overflow:auto;display:block;';
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const waitFor=async(fn,ms=1500)=>{const end=Date.now()+ms;while(!fn()){if(Date.now()>end)break;await wait(15);}};
  // Wait for first rAF draw so space.style.height is set
  await waitFor(()=>!!dlg.querySelector('.jw-row'));
  void scroll.offsetHeight;
  await waitFor(()=>asked.length>=1);
  // Two rapid scrolls 20ms apart (strictly inside the 120ms debounce window): w20..w24 are visible in BOTH frames
  const beforeRapid=asked.length;
  scroll.scrollTop=JW_ROW*20;scroll.dispatchEvent(new Event('scroll'));
  await waitFor(()=>!!dlg.querySelector('[data-key="w20"]'));
  scroll.scrollTop=JW_ROW*22;scroll.dispatchEvent(new Event('scroll'));
  await waitFor(()=>asked.length>beforeRapid&&dlg.querySelector('[data-key="w22"] .jw-def')?.textContent==='释义-w22');
  const afterRapidDom=dlg.querySelector('[data-key="w22"] .jw-def')?.textContent==='释义-w22'&&dlg.querySelector('[data-key="w22"] i')?.textContent==='よみ-w22';
  // Scrolling over rows that returned empty meaning must NOT re-ask them endlessly (state.asked)
  const emptyAskedBefore=asked.length;
  scroll.scrollTop=JW_ROW*45;scroll.dispatchEvent(new Event('scroll'));
  await waitFor(()=>asked.length>emptyAskedBefore);
  const countAfterEmpty=asked.length;
  scroll.scrollTop=JW_ROW*45;scroll.dispatchEvent(new Event('scroll'));
  await wait(220);
  const noDuplicateEmptyAsk=asked.length===countAfterEmpty;
  // Transient jlpt_describe failure must not permanently mark rows as asked
  failNext=true;
  scroll.scrollTop=JW_ROW*35;scroll.dispatchEvent(new Event('scroll'));
  await waitFor(()=>!failNext);
  await wait(30);
  scroll.scrollTop=JW_ROW*36;scroll.dispatchEvent(new Event('scroll'));
  await waitFor(()=>dlg.querySelector('[data-key="w36"] .jw-def')?.textContent==='释义-w36');
  const afterRetryDom=dlg.querySelector('[data-key="w36"] .jw-def')?.textContent==='释义-w36';
  dlg.querySelector('[data-jw-close]').click();
  return {afterRapidDom,noDuplicateEmptyAsk,afterRetryDom};
 })()`);
 assert.deepEqual(result,{afterRapidDom:true,noDuplicateEmptyAsk:true,afterRetryDom:true});
});
