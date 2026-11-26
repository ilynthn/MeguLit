// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// 2026-11-14 (user: 所有地方提取例句出来的时候记得注音啊): one renderer gives every example line furigana.
// Reading order: the game's ruby → the dictionary reading for the word in context → nothing (names, tokenizer guesses).
const test=require('node:test');
const assert=require('node:assert');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {exampleSpans,exampleHtml,exampleCardHtml,plainWithRuby}=require('../core/example-ruby.cjs');
const {createReadingResolver}=require('../core/reading.cjs');

const LINE='人間の少女なら泣くか怯えるかしているだろうが、アトリは俺の反応の意味が分からず困惑しているようだった。';
/* what the tokenizer hands over (katakana readings, its own guesses included) */
function tokenize(text,list){const out=[];let at=0;const chars=[...text];
  for(const [surface,reading,base,grammar] of list){const len=[...surface].length;assert.equal(chars.slice(at,at+len).join(''),surface);
    out.push({surface,reading,base_form:base||surface,start:at,end:at+len,pos:(grammar||['名詞'])[0],grammar:grammar||['名詞','普通名詞']});at+=len;}
  assert.equal(at,chars.length);return out;}
const ATRI=[['人間','ニンゲン'],['の','ノ'],['少女','ショウジョ'],['なら','ナラ'],['泣く','ナク','泣く',['動詞']],['か','カ'],['怯える','オビエル','怯える',['動詞']],['か','カ'],
  ['し','シ','する',['動詞']],['て','テ'],['いる','イル'],['だろう','ダロウ'],['が','ガ'],['、',''],['アトリ','アトリ','アトリ',['名詞','固有名詞','人名']],['は','ハ'],['俺','オレ'],['の','ノ'],
  ['反応','ハンノウ'],['の','ノ'],['意味','イミ'],['が','ガ'],['分から','ワカラ','分かる',['動詞']],['ず','ズ'],['困惑','コンワク'],['し','シ','する',['動詞']],['て','テ'],['いる','イル'],['よう','ヨウ'],['だっ','ダッ'],['た','タ'],['。','']];
let resolver;
test.before(()=>{const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'exr-')),'jmdict.json');
  fs.writeFileSync(file,JSON.stringify([['人間','にんげん'],['少女','しょうじょ'],['泣く','なく'],['怯える','おびえる'],['俺','おれ'],['反応','はんのう'],['意味','いみ'],['分かる','わかる'],['困惑','こんわく'],['夏生','なつお']]
    .map(([s,r])=>({spellings:[s],readings:[r]}))));resolver=createReadingResolver(file);});
const byBase=(text,spans)=>Object.fromEntries(spans.map(s=>[[...text].slice(s.start,s.end).join(''),s.reading+'/'+s.source]));

test('dictionary-only line: every kanji word gets its dictionary reading, okurigana stays outside, kana and names bare',()=>{
  const spans=exampleSpans(LINE,resolver.resolve(tokenize(LINE,ATRI)),[]);
  assert.deepStrictEqual(byBase(LINE,spans),{'人間':'にんげん/dictionary','少女':'しょうじょ/dictionary','泣':'な/dictionary','怯':'おび/dictionary','俺':'おれ/dictionary',
    '反応':'はんのう/dictionary','意味':'いみ/dictionary','分':'わ/dictionary','困惑':'こんわく/dictionary'});
  /* the grammar highlight (して) keeps its highlight, ruby around it */
  const chars=[...LINE],at=LINE.indexOf('して'),start=[...LINE.slice(0,at)].length;
  const html=exampleHtml(LINE,spans,{start,end:start+2});
  assert.match(html,/<b class="tm-hl">して<\/b>/);
  assert.match(html,/<ruby>困惑<rt>こんわく<\/rt><\/ruby>/);
  assert.match(html,/<ruby>泣<rt>な<\/rt><\/ruby>く/);
  assert.match(html,/アトリは/);assert.doesNotMatch(html,/<rt>[^<]*<\/rt><\/ruby>トリ/);
  assert.equal(chars.length,[...html.replace(/<rt>[^<]*<\/rt>/g,'').replace(/<[^>]+>/g,'')].length);
});

test('the game\'s ruby wins over the dictionary and is found wherever its base appears',()=>{
  const spans=exampleSpans(LINE,resolver.resolve(tokenize(LINE,ATRI)),[['少女','おとめ'],['怯える','おびえる']]);
  const m=byBase(LINE,spans);
  assert.equal(m['少女'],'おとめ/game');assert.equal(m['怯'],'おび/game');assert.equal(m['困惑'],'こんわく/dictionary');
  /* captured markup: <rよみ>漢字</r> (HuneX), ｜漢字《よみ》 */
  const p=plainWithRuby('<rおとめ>少女</r>は｜微笑《ほほえ》んだ');
  assert.equal(p.text,'少女は微笑んだ');assert.deepStrictEqual([...p.ruby].sort(),[['少女','おとめ'],['微笑','ほほえ']].sort());
  const s2=exampleSpans(p.text,[],p.ruby);assert.deepStrictEqual(byBase(p.text,s2),{'少女':'おとめ/game','微笑':'ほほえ/game'});
});

test('names and tokenizer guesses stay bare; a name gets ruby only from the game',()=>{
  const text='夏生は斑鳩を見た';
  const raw=tokenize(text,[['夏生','ナツキ','夏生',['名詞','固有名詞','人名']],['は','ハ'],['斑鳩','イカルガ'],['を','ヲ'],['見','ミ','見る',['動詞']],['た','タ']]);
  const resolved=resolver.resolve(raw);
  assert.deepStrictEqual(exampleSpans(text,resolved,[]),[]);
  assert.deepStrictEqual(byBase(text,exampleSpans(text,resolved,[['夏生','なつき']])),{'夏生':'なつき/game'});
  /* kana-only lines never get ruby */
  assert.deepStrictEqual(exampleSpans('ありがとう',[{surface:'ありがとう',reading:'アリガトウ',start:0,end:5,readingSource:'dictionary'}],[]),[]);
});

test('merged dictionary words use their own length (月曜日 is one word, not 月曜 with 月曜日\'s reading)',()=>{
  const text='月曜日に行く';
  const tokens=[{surface:'月曜日',reading:'げつようび',start:0,end:2,readingSource:'dictionary'},{surface:'に',start:3,end:4},{surface:'行く',reading:'いく',start:4,end:6,readingSource:'dictionary'}];
  assert.deepStrictEqual(byBase(text,exampleSpans(text,tokens,[])),{'月曜日':'げつようび/dictionary','行':'い/dictionary'});
});

test('Anki SentenceFurigana goes through the same rule (game dict, names bare, highlight)',()=>{
  const text='夏生は困惑した';
  const tokens=resolver.resolve(tokenize(text,[['夏生','ナツキ','夏生',['名詞','固有名詞','人名']],['は','ハ'],['困惑','コンワク'],['し','シ','する',['動詞']],['た','タ']]));
  const html=exampleCardHtml(text,tokens,{start:3,end:5});
  assert.equal(html,'夏生は<b class="tm-hl"><ruby>困惑<rt>こんわく</rt></ruby></b>した');
  assert.equal(exampleCardHtml(text,tokens,{gameRuby:{'夏生':'なつき'}}),'<ruby>夏生<rt>なつき</rt></ruby>は<ruby>困惑<rt>こんわく</rt></ruby>した');
});

/* ---- the page side: a tiny DOM, enough for applySpans ---- */
class Node0{constructor(doc){this.ownerDocument=doc;this.parentNode=null;}get parentElement(){return this.parentNode;}
  get nextSibling(){const p=this.parentNode;if(!p)return null;const i=p.childNodes.indexOf(this);return p.childNodes[i+1]||null;}
  get nextElementSibling(){let n=this.nextSibling;while(n&&n.nodeType!==1)n=n.nextSibling;return n;}
  remove(){if(this.parentNode){this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),1);this.parentNode=null;}}
  after(...nodes){const p=this.parentNode;let i=p.childNodes.indexOf(this)+1;for(const n of nodes){n.remove();n.parentNode=p;p.childNodes.splice(i++,0,n);}}
  before(...nodes){const p=this.parentNode;let i=p.childNodes.indexOf(this);for(const n of nodes){n.remove();n.parentNode=p;p.childNodes.splice(i++,0,n);}}}
class Text0 extends Node0{constructor(doc,data){super(doc);this.nodeType=3;this.data=data;}get textContent(){return this.data;}}
class El0 extends Node0{constructor(doc,tag,attrs={}){super(doc);this.nodeType=1;this.tagName=tag.toUpperCase();this.attrs=attrs;this.childNodes=[];this.className='';}
  append(...nodes){for(const n of nodes){n.remove();n.parentNode=this;this.childNodes.push(n);}}
  set textContent(v){this.childNodes=[];this.append(new Text0(this.ownerDocument,v));}
  get textContent(){return this.childNodes.map(n=>n.textContent).join('');}
  matches(sel){return sel.split(',').some(s=>{s=s.trim();const a=s.match(/^\[([\w-]+)\]$/);return a?Object.hasOwn(this.attrs,a[1]):this.tagName===s.toUpperCase();});}
  closest(sel){let n=this;while(n){if(n.matches(sel))return n;n=n.parentNode;}return null;}
  contains(x){while(x){if(x===this)return true;x=x.parentNode;}return false;}
  html(){return this.childNodes.map(n=>n.nodeType===3?n.data:`<${n.tagName.toLowerCase()}>${n.html()}</${n.tagName.toLowerCase()}>`).join('');}}
class Doc0{createElement(t){return new El0(this,t);}createTextNode(d){return new Text0(this,d);}
  createTreeWalker(root){const list=[];const walk=n=>{for(const c of n.childNodes){if(c.nodeType===3)list.push(c);else walk(c);}};walk(root);let i=-1;return {nextNode:()=>list[++i]||null};}}
const h=(doc,tag,attrs,...kids)=>{const e=new El0(doc,tag,attrs||{});for(const k of kids)e.append(typeof k==='string'?new Text0(doc,k):k);return e;};

test('pages: ruby goes into the page\'s own markup, the highlight stays, blanks and letters are handled',async()=>{
  const {applySpans,exAttr}=await import('../web/example-ruby.js');
  const doc=new Doc0(),spans=exampleSpans(LINE,resolver.resolve(tokenize(LINE,ATRI)),[]);
  const at=LINE.indexOf('して');
  /* grammar lesson: <p class="gm-ja"> text <mark>して</mark> text */
  const p=h(doc,'p',{},LINE.slice(0,at),h(doc,'mark',{},'して'),LINE.slice(at+2));
  assert.equal(applySpans(p,LINE,spans),9);
  assert.match(p.html(),/<mark>して<\/mark>/);assert.match(p.html(),/<ruby>人間<rt>にんげん<\/rt><\/ruby>の/);assert.match(p.html(),/<ruby>困惑<rt>こんわく<\/rt><\/ruby>/);
  /* word card: 「…」 quotes added by the page */
  const q=h(doc,'p',{},'「'+LINE+'」');assert.equal(applySpans(q,LINE,spans),9);assert.match(q.html(),/^「<ruby>人間/);
  /* 拖进空里: the blank (answer) is not in the page and gets nothing; the rest still lines up */
  const b0=LINE.indexOf('は俺'),gap=h(doc,'p',{},LINE.slice(0,b0),h(doc,'button',{'data-exr-skip':''},'＿'),LINE.slice(b0+1));
  assert.equal(applySpans(gap,LINE,spans),9);assert.match(gap.html(),/<button>＿<\/button><ruby>俺<rt>おれ<\/rt><\/ruby>/);
  /* letter-by-letter hero: one ruby around the letters */
  const big=h(doc,'h2',{},...[...'困惑した'].map(c=>h(doc,'span',{},c)));
  assert.equal(applySpans(big,'困惑した',[{start:0,end:2,reading:'こんわく'}]),1);
  assert.match(big.html(),/^<ruby><span>困<\/span><span>惑<\/span><rt>こんわく<\/rt><\/ruby><span>し<\/span>/);
  /* attribute */
  assert.equal(exAttr('a"b',null),' data-exr="a&quot;b"');
  assert.match(exAttr('少女',[['少女','おとめ']]),/data-exr-ruby="\[\[&quot;少女&quot;,&quot;おとめ&quot;\]\]"/);
  assert.equal(exAttr('x','none'),' data-exr="x" data-exr-ruby="none"');
});

/* ---- every place that shows a line from the user's reading calls the shared renderer ---- */
const web=name=>fs.readFileSync(path.join(__dirname,'..','web',name),'utf8');
test('the listed pages call the shared renderer',()=>{
  const uses={
    'grammar.js':['gm-ex"><p class="gm-ja" lang="ja"${exAttr(e.text,e.ruby,esc)}','gm-lead-line"><p class="gm-ja" lang="ja"${exAttr(lead.text','gm-gap-line" data-gap="${i}"><p class="gm-ja" lang="ja"${exAttr(q.text','gm-ja gm-q" lang="ja"${exAttr(q.text','gm-jd-plain"${exAttr(o.text,\'none\'','lang="ja"${exAttr(scene.pieces'],
    'sentences-page.js':['sp-card-ja" lang="ja"${exAttr(','sp-big" lang="ja" aria-live="polite"${exAttr(','sp-r-ja" lang="ja" data-sp-pick="${item.id}"${exAttr('],
    'detail-collect.js':['esr-ex" lang="ja"${exAttr(','gl-sl-ja" lang="ja"${exAttr(','gl-r-ja" lang="ja"${exAttr(','setExample(big,','gs-q" lang="ja"${exAttr(lead.text'],
    'app.js':['installExampleRuby({api})','<p lang="ja"${exAttr(item.text,null,esc)}>','<span lang="ja"${exAttr(String(item.example_text)'],
    'dict-home.js':['<q lang="ja"${exAttr(v.example_text'],
    'rewards.js':['gm-ja" lang="ja"${exAttr(x.text'],
    'home-tv.js':['tv-stxt" lang="ja"${exAttr(t,','setExample(line,s)'],
  };
  for(const [file,needles] of Object.entries(uses)){const src=web(file);assert.match(src,/from '\.\/example-ruby\.js'/,file);for(const n of needles)assert.ok(src.includes(n),file+': '+n);}
  /* blanks never get a reading */
  assert.ok(web('grammar.js').includes('aria-label="${esc(w.placeHere)}" data-exr-skip>'));assert.ok(web('grammar.js').includes('" data-exr-skip${answered==null'));
  /* Anki exports use the same rule */
  const svc=n=>fs.readFileSync(path.join(__dirname,'..','services',n),'utf8');
  assert.match(svc('bridge.cjs'),/case 'example_ruby'/);assert.match(svc('bridge.cjs'),/exampleCardHtml\(text,/);assert.match(svc('reader.cjs'),/exampleCardHtml\(args\.text,/);
  assert.doesNotMatch(svc('bridge.cjs')+svc('reader.cjs'),/furiganaHtml\(/);
});

test('grammar lesson steps: no 01–06 numbers, names and 第 n / 6 步 stay',()=>{
  const g=web('grammar.js');
  assert.doesNotMatch(g,/<b>\$\{i\+1\}<\/b><span>\$\{esc\(w\.steps\[k\]\)\}/);
  assert.match(g,/aria-selected="\$\{i===s\}"><span>\$\{esc\(w\.steps\[k\]\)\}<\/span>/);
  assert.match(g,/data-stepof>/);
});

test('inline readings stay with their own occurrence in study examples and history exports',async t=>{
 const {exampleRuby,gameRubyOf}=require('../services/example-ruby.cjs'),{DatabaseSync}=require('node:sqlite');
 const raw='🌙 今日と <rきょう>今日</r>、｜今日《こんにち》。',text='🌙 今日と 今日、今日。';
 const shown=async item=>(await exampleRuby(null,null,[item])).items[0];
 const inline=await shown({text:raw});assert.equal(inline.text,text);
 assert.deepEqual(inline.spans.map(s=>[s.start,s.end,s.reading]),[[6,8,'きょう'],[9,11,'こんにち']]);
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('CREATE TABLE reading_events(id INTEGER PRIMARY KEY,text TEXT)');
 db.prepare('INSERT INTO reading_events(text) VALUES(?)').run(raw);
 const compact=text.replace(/\s+/g,''),pairs=gameRubyOf(db,compact);
 assert.equal(exampleCardHtml(compact,[],{pairs}),'🌙今日と<ruby>今日<rt>きょう</rt></ruby>、<ruby>今日<rt>こんにち</rt></ruby>。');
 const plain=await shown({text:'今日も今日も。',ruby:[['今日','きょう']]});
 assert.deepEqual(plain.spans.map(s=>s.start),[0,3]);
 const grammar=require('../services/grammar.cjs'),given=grammar.rubyPairs(raw);
 const replay=await shown({text:compact,ruby:given});assert.deepEqual(replay.spans.map(s=>s.reading),['きょう','こんにち']);
 const exported=exampleCardHtml(compact,[],{pairs:given,gameRuby:{'今日':'こんじつ'}});
 assert.match(exported,/🌙<ruby>今日<rt>こんじつ<\/rt><\/ruby>と<ruby>今日<rt>きょう<\/rt>/);
 const {applySpans}=await import('../web/example-ruby.js'),rare=await shown({text:'𠮷と<ruby>𠮷<rt>よし</rt></ruby>。'});
 const doc=new Doc0(),el=h(doc,'p',{},rare.text);
 assert.equal(applySpans(el,rare.text,rare.spans),1);assert.equal(el.html(),'𠮷と<ruby>𠮷<rt>よし</rt></ruby>。');
 const wrapped='今\n日と今日と<rこんにち>今日</r>だ。';
 const compacted=await shown({text:'今日と今日と今日だ。',ruby:grammar.rubyPairs(wrapped)});
 assert.deepEqual(compacted.spans.map(s=>[s.start,s.end,s.reading]),[[6,8,'こんにち']]);
 const label=await shown({text:'これは人工知能だ。',ruby:grammar.rubyPairs('これは<rAI>人工知能</r>だ。')});
 assert.deepEqual(label.spans.map(s=>s.reading),['AI']);
 const rich='赤い<br>花と<rはな>花</r>と花と花だ。',rendered=await shown({text:rich});
 assert.equal(rendered.text,'赤い花と花と花と花だ。');assert.deepEqual(rendered.spans.map(s=>s.start),[4]);
 const replayed=await shown({text:rendered.text,ruby:grammar.rubyPairs(rich)});
 assert.deepEqual(replayed.spans,rendered.spans);
 const alternative=await shown({text:'花と<ruby="はな">花</ruby>。'});assert.deepEqual(alternative.spans.map(s=>s.start),[2]);
 const mismatched=await shown({text:'本と花。',ruby:[['花','はな',0],['花','はな',99],['花','はな',2],['花','か',2]]});
 assert.deepEqual(mismatched.spans.map(s=>[s.start,s.reading]),[[2,'はな']]);
});

test('hydrating a saved sentence uses the same text as the returned reading spans',{timeout:2500},async t=>{
 const {installExampleRuby}=await import('../web/example-ruby.js?saved-markup'),{exampleRuby}=require('../services/example-ruby.cjs');
 const raw='<br>見上げると花が揺れた。',doc=new Doc0(),el=h(doc,'p',{},raw);
 el.dataset={exr:raw,exrRuby:JSON.stringify([['花','はな']])};el.isConnected=true;
 Object.assign(doc,{head:{append(){}},documentElement:{style:{setProperty(){}},classList:{toggle(){}}},querySelectorAll:()=>[el],addEventListener(){}});
 for(const [name,value] of Object.entries({document:doc,MutationObserver:class{observe(){}}})){
  const old=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{value,configurable:true});
  t.after(()=>{if(old)Object.defineProperty(globalThis,name,old);else delete globalThis[name];});
 }
 let received;const called=new Promise(r=>{received=r;});
 installExampleRuby({api:async(action,args)=>{if(action==='settings_get')return {};const result=await exampleRuby(null,null,args.items);received();return result;}});
 await called;await new Promise(r=>setImmediate(r));
 assert.match(el.html(),/見上げると<ruby>花<rt>はな<\/rt><\/ruby>が揺れた/);
});

test('example-ruby chunks batches past 120 items and hydrates elements mounted while a duplicate request is in flight',{timeout:4000},async t=>{
 const {installExampleRuby,hydrateExamples}=await import('../web/example-ruby.js?batch-and-race');
 const {exampleRuby}=require('../services/example-ruby.cjs');
 const doc=new Doc0(),els=[];
 for(let i=0;i<150;i++){
  const text=`第${i}話の花。`,el=h(doc,'p',{},text);
  el.dataset={exr:text,exrRuby:JSON.stringify([['花','はな']])};el.isConnected=true;
  els.push(el);
 }
 Object.assign(doc,{head:{append(){}},documentElement:{style:{setProperty(){}},classList:{toggle(){}}},querySelectorAll:()=>els,addEventListener(){}});
 for(const [name,value] of Object.entries({document:doc,MutationObserver:class{observe(){}}})){
  const old=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{value,configurable:true});
  t.after(()=>{if(old)Object.defineProperty(globalThis,name,old);else delete globalThis[name];});
 }
 const batchSizes=[];let releaseFirst,firstStarted;
 const waitFirst=new Promise(r=>{releaseFirst=r;}),started=new Promise(r=>{firstStarted=r;});
 installExampleRuby({api:async(action,args)=>{
  if(action==='settings_get')return {};
  batchSizes.push(args.items.length);
  if(batchSizes.length===1){firstStarted();await waitFirst;}
  return exampleRuby(null,null,args.items);
 }});
 await started;
 // Mount a second element with the exact same sentence while the first batch is still in flight
 const lateText=els[0].dataset.exr,lateEl=h(doc,'p',{},lateText);
 lateEl.dataset={exr:lateText,exrRuby:els[0].dataset.exrRuby};lateEl.isConnected=true;
 els.push(lateEl);
 hydrateExamples();
 await new Promise(r=>setTimeout(r,50));
 releaseFirst();
 await new Promise(r=>setTimeout(r,80));
 assert.deepEqual(batchSizes,[120,30],'splits 150 lines into chunks of <= 120 so nothing is truncated by the service cap');
 assert.match(els[0].html(),/<ruby>花<rt>はな<\/rt><\/ruby>/);
 assert.match(els[149].html(),/<ruby>花<rt>はな<\/rt><\/ruby>/,'item past 120 gets ruby in the same pass without 4s retry');
 assert.match(lateEl.html(),/<ruby>花<rt>はな<\/rt><\/ruby>/,'duplicate element mounted mid-flight still gets ruby once the request finishes');
});
