// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 学习 → 语法 (2026-11-11): finds N5 grammar points in the lines you really read, so each lesson's examples and
   exercises come from your own galgames. Sources: the recorded lines (reading_events, with the translation recorded
   for them) and the zero-latency script up to the furthest line you reached. A cheap text filter picks candidate
   lines; the tokenizer confirms the point and gives its position. Results are cached per line (grammar_lines);
   progress per point is kept in grammar_progress. Lesson text lives in web/grammar-n5.js. */
const insights=require('./learning-insights.cjs');
const {plainWithRuby}=require('../core/example-ruby.cjs');
const POINTS=['wa','ga','wo','ni','de','he','to','mo','no','desu','masu','te','nai','ta','iadj','naadj','kosoado','tai','teiru','tekudasai','mashou'];
const KOSOADO=new Set(['これ','それ','あれ','どれ','この','その','あの','どの','ここ','そこ','あそこ','どこ','こっち','そっち','あっち','どっち','こちら','そちら','あちら','どちら','こんな','そんな','あんな','どんな']);
/* に after these is an adverb ending (本当に, 一緒に), not the particle に */
const ADVERBIAL_NI=new Set(['本当','一緒','特','別','実','急','既','共','更','確か','一気','一斉','同時','次第','真剣','素直','勝手','大事','普通','すぐ','絶対','綺麗','静か','丁寧','簡単','完全','自由','必死','無理','上手','適当','大切','正直']);
/* Fixed expressions that are not the plain ない form of a verb, and ような／みたいな (not な adjectives). */
const FIXED_NAI=new Set(['しれる','知れる','たまる','堪る','いける','行ける','すまる','済む','かなう','叶う','しょうがる']);
const LIKE=new Set(['よう','様','みたい','そう']);
/* A quick text test per point: lines without it are never tokenized for that point. */
const PREFILTER={wa:/は/,ga:/が/,wo:/を/,ni:/に/,de:/で/,he:/へ/,to:/と/,mo:/も/,no:/の/,desu:/です|でし|だ/,masu:/ま[すしせ]/,te:/[てで]/,nai:/ない|なかっ|なく/,ta:/[ただ]/,iadj:/[いくか]/,naadj:/な|だ/,kosoado:/[こそあど][れのこんっち]|あそこ/,tai:/た[いくか]/,teiru:/[てで](い|る)/,tekudasai:/[てで](ください|下さい)/,mashou:/ましょ/};
const gram=t=>Array.isArray(t?.grammar)?t.grammar:[];
const pos=t=>t?.pos||gram(t)[0]||'';
const sub=t=>gram(t)[1]||'';
const isVerbish=t=>['動詞','形容詞','助動詞'].includes(pos(t));
/* Token positions of each N5 point in one tokenized line: {id:[[start,end],…]}. */
function matchPoints(tokens){
  const out={},add=(id,a,b)=>{(out[id]??=[]).push([a,b]);},T=(tokens||[]).filter(t=>t&&typeof t.surface==='string');
  for(let i=0;i<T.length;i++){
    const t=T[i],prev=T[i-1],next=T[i+1],s=t.surface,b=t.base_form||s,n=t.normalized||b;
    if(pos(t)==='助詞'){
      if(s==='は'&&sub(t)==='係助詞')add('wa',t.start,t.end);
      if(s==='が'&&sub(t)==='格助詞')add('ga',t.start,t.end);
      if(s==='を'&&sub(t)==='格助詞')add('wo',t.start,t.end);
      if(s==='に'&&sub(t)==='格助詞'&&!(prev&&(ADVERBIAL_NI.has(prev.surface)||pos(prev)==='形状詞')))add('ni',t.start,t.end);
      if(s==='で'&&sub(t)==='格助詞')add('de',t.start,t.end);
      if(s==='へ'&&sub(t)==='格助詞')add('he',t.start,t.end);
      if(s==='と'&&sub(t)==='格助詞')add('to',t.start,t.end);
      if(s==='も'&&sub(t)==='係助詞')add('mo',t.start,t.end);
      if(s==='の'&&sub(t)==='格助詞'&&next&&['名詞','代名詞'].includes(pos(next)))add('no',t.start,t.end);
      if((s==='て'||s==='で')&&sub(t)==='接続助詞'&&prev&&isVerbish(prev)){
        add('te',prev.start,t.end);
        if(next&&((next.normalized||next.base_form)==='居る'||next.base_form==='いる'))add('teiru',prev.start,next.end);
        if(next&&(next.base_form==='くださる'||next.normalized==='下さる')&&/^(ください|下さい)$/.test(next.surface))add('tekudasai',prev.start,next.end);
      }
    }
    if(pos(t)==='助動詞'){
      /* です／だ as the sentence's copula only: not the に／な／で forms of だ (かわいそうに, 静かな) */
      if((b==='です'||b==='だ'&&n==='だ')&&/^(です|でし|だ|だっ)$/.test(s))add('desu',t.start,t.end);
      if(b==='ます'){if(/^ましょ/.test(s))add('mashou',prev&&pos(prev)==='動詞'?prev.start:t.start,t.end);else add('masu',prev&&pos(prev)==='動詞'?prev.start:t.start,t.end);}
      if(b==='ない'&&prev&&pos(prev)==='動詞'&&!FIXED_NAI.has(prev.base_form))add('nai',prev.start,t.end);
      if(n==='た'&&prev&&['動詞','形容詞'].includes(pos(prev)))add('ta',prev.start,t.end);
      if(b==='たい'&&prev&&pos(prev)==='動詞')add('tai',prev.start,t.end);
      if(b==='てる'&&prev&&pos(prev)==='動詞')add('teiru',prev.start,t.end);
    }
    if(pos(t)==='形容詞'&&sub(t)!=='非自立可能'&&/[㐀-鿿]/.test(b)&&/い$/.test(b))add('iadj',t.start,t.end);
    if(pos(t)==='形状詞'&&!LIKE.has(b)&&next&&next.surface==='な'&&pos(next)==='助動詞')add('naadj',t.start,next.end);
    if(KOSOADO.has(s)&&['代名詞','連体詞','形状詞'].includes(pos(t)))add('kosoado',t.start,t.end);
  }
  return out;
}
/* Ruby pairs the game wrote into a recorded line (<rしも>霜</r>), for furigana on cards. */
function rubyPairs(text){return plainWithRuby(text,true).ruby;}
/* ---- database ---- */
function ensure(db){
  db.exec(`CREATE TABLE IF NOT EXISTS grammar_lines(text TEXT PRIMARY KEY,hits TEXT NOT NULL,checked_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS grammar_progress(point TEXT PRIMARY KEY,learned_at INTEGER,attempts INTEGER NOT NULL DEFAULT 0,correct INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS grammar_answer_events(id INTEGER PRIMARY KEY AUTOINCREMENT,point TEXT NOT NULL,correct INTEGER NOT NULL,at INTEGER NOT NULL);`);
}
const fitLength=t=>{const n=[...t].length;return n>=6&&n<=60;};
/* Lines to look in: recorded lines first (newest first), then the script up to the furthest line reached. */
/* E459: built in steps so the service can answer other pages in between; candidates() runs them all at once */
function candidates(db,opts={}){const it=candidateSteps(db,opts);for(;;){const s=it.next();if(s.done)return s.value;}}
async function candidatesAsync(db,opts={}){const it=candidateSteps(db,opts),breathe=require('./cooperative.cjs').breather();for(;;){const s=it.next();if(s.done)return s.value;await breathe();}}
function* candidateSteps(db,{root=null,scriptPairs=null,limitScript=4000}={}){
  const titles=new Map(db.prepare('SELECT id,title,executable FROM games').all().map(g=>[g.id,g]));const out=[],seen=new Set();
  const rows=db.prepare('SELECT id,game_id,text,original,read_at FROM reading_events ORDER BY id DESC LIMIT 5000').all();
  let n=0;for(const r of rows){if(++n%200===0)yield;const captured=plainWithRuby(r.text,true),text=insights.plainLine(captured.text);if(!fitLength(text)||!insights.readableLine(text)||seen.has(text))continue;seen.add(text);let o={};try{o=JSON.parse(r.original||'{}');}catch{}
    const human=insights.isHuman(o.translationSource),picked=insights.pickTranslation({human:human?{text:o.translation,source:o.translationSource}:null,machine:human?'':o.translation});
    out.push({text,origin:'history',gameId:r.game_id,title:titles.get(r.game_id)?.title||'',ruby:captured.ruby,readAt:r.read_at,readBy:false,...picked});}
  if(root&&scriptPairs){
    const byGame=new Map();for(const r of rows)if(r.game_id){if(!byGame.has(r.game_id))byGame.set(r.game_id,[]);byGame.get(r.game_id).push({text:insights.plainLine(r.text),at:r.read_at});}
    for(const [gameId,read] of byGame){yield;const game=titles.get(gameId);if(!game?.executable)continue;let pairs=null;try{pairs=scriptPairs(root,game.executable);}catch{}if(!pairs?.ja?.length)continue;
      /* the furthest script line matching a recorded line is the reading position */
      const key=t=>String(t||'').replace(/[\s「」『』（）()、。…―ー！？!?♪〜～]/g,''),want=new Map();for(const r of read){const k=key(r.text);if(k.length>=4&&(!want.has(k)||r.at<want.get(k)))want.set(k,r.at);}let last=-1;const seenAt=new Map();
      yield;for(let i=0;i<pairs.ja.length;i++){if(i%2000===0)yield;const k=key(insights.plainLine(pairs.ja[i]));if(k.length>=4&&want.has(k)){last=i;seenAt.set(i,want.get(k));}}
      /* a script line that was not recorded itself was read by the time of the next recorded line after it */
      let nextAt=null;const byTime=new Map();for(let i=last;i>=0;i--){if(seenAt.has(i))nextAt=nextAt==null?seenAt.get(i):Math.min(nextAt,seenAt.get(i));byTime.set(i,nextAt);}
      let added=0;for(let i=last;i>=0&&added<limitScript;i--){if(i%500===0)yield;const text=insights.plainLine(pairs.ja[i]);if(!fitLength(text)||!insights.readableLine(text)||seen.has(text))continue;seen.add(text);added++;
        const tr=pairs.tr?.[i]||'';out.push({text,origin:'script',gameId,title:game.title,ruby:[],readAt:byTime.get(i)||null,readBy:true,translation:tr,translationSource:tr?pairs.source:''});}}
  }
  return out;
}
/* E459: the candidate list is built once per change of the recorded lines or the imported scripts (the page asks again
   every few seconds while lines are still being checked), and building it lets other requests run in between. */
const candidateCache=new Map(),reportCache=new Map();
function candidateStamp(db,root){
  const r=db.prepare("SELECT COALESCE(MAX(id),0) m,COUNT(*) n,(SELECT value FROM meta WHERE key='grammar-reading-revision') rev FROM reading_events").get();let s=0;
  try{s=require('fs').statSync(require('path').join(String(root||''),'data','config','original-text.json')).mtimeMs;}catch{}
  return r.m+':'+r.n+':'+(r.rev||0)+':'+s;
}
async function candidatesCached(db,{root=null,scriptPairs=null}={}){
  const key=String(root)+'|'+(scriptPairs?1:0),stamp=candidateStamp(db,root),hit=candidateCache.get(key);
  if(hit&&hit.stamp===stamp)return hit.list;
  const list=await candidatesAsync(db,{root,scriptPairs});candidateCache.set(key,{stamp,list});return list;
}
/* Every checked line's hits in one query (instead of one query per line, twice per report). */
function checkedLines(db){ensure(db);const map=new Map();for(const r of db.prepare('SELECT text,hits FROM grammar_lines').all())map.set(r.text,r.hits);return map;}
/* Tokenizes candidate lines not checked yet, until every point has `want` confirmed lines or the deadline. */
async function refresh(db,list,tokenize,{want=8,deadline=Date.now()+8000}={}){
  ensure(db);const breathe=require('./cooperative.cjs').breather(),known=checkedLines(db),get={get:text=>known.has(text)?{hits:known.get(text)}:undefined},put0=db.prepare('INSERT OR REPLACE INTO grammar_lines(text,hits,checked_at) VALUES(?,?,?)'),put={run:(text,hits,at)=>{put0.run(text,hits,at);known.set(text,hits);}};
  const found=Object.fromEntries(POINTS.map(p=>[p,0]));let checked=0,pending=0;
  for(const c of list){await breathe();const row=get.get(c.text);if(row){let hits={};try{hits=JSON.parse(row.hits);}catch{}for(const p of Object.keys(hits))if(found[p]!==undefined)found[p]++;}}
  for(const c of list){
    await breathe();
    if(POINTS.every(p=>found[p]>=want))break;
    if(get.get(c.text))continue;
    if(!POINTS.some(p=>found[p]<want&&PREFILTER[p].test(c.text)))continue;
    if(Date.now()>deadline||!tokenize){pending++;continue;}
    let hits;try{hits=matchPoints(await tokenize(c.text));}catch{pending++;break;}
    put.run(c.text,JSON.stringify(hits),Math.floor(Date.now()/1000));checked++;for(const p of Object.keys(hits))if(found[p]!==undefined)found[p]++;
  }
  return {checked,pending};
}
/* Up to `max` examples per point: human translation first, recorded lines before script lines, different games,
   lines of sentence length. */
function examples(db,list,{max=5,known=checkedLines(db)}={}){
  const by=Object.fromEntries(POINTS.map(p=>[p,[]]));
  for(const c of list){const row=known.has(c.text)?{hits:known.get(c.text)}:null;if(!row)continue;let hits={};try{hits=JSON.parse(row.hits);}catch{}
    for(const [p,spans] of Object.entries(hits))if(by[p]&&spans.length)by[p].push({...c,start:spans[0][0],end:spans[0][1]});}
  const score=e=>(insights.isHuman(e.translationSource)?4:e.translation?1:0)+(e.origin==='history'?2:0)+([...e.text].length<=40?1:0);
  const out={};
  for(const p of POINTS){const list2=by[p].map((e,i)=>({e,i})).sort((a,b)=>score(b.e)-score(a.e)||a.i-b.i).map(x=>x.e),pick=[],games=new Map();
    for(const e of list2){if(pick.length>=max)break;if((games.get(e.gameId)||0)>=2&&list2.some(x=>!pick.includes(x)&&(games.get(x.gameId)||0)<2))continue;pick.push(e);games.set(e.gameId,(games.get(e.gameId)||0)+1);}
    for(const e of list2){if(pick.length>=max)break;if(!pick.includes(e))pick.push(e);}
    out[p]=pick.map(({text,origin,gameId,title,translation,translationSource,start,end,ruby,readAt,readBy})=>({text,origin,gameId,title,translation,translationSource,start,end,ruby,readAt,readBy}));}
  return out;
}
/* ---- progress ---- */
function progress(db){ensure(db);const rows=db.prepare('SELECT * FROM grammar_progress').all();return Object.fromEntries(rows.map(r=>[r.point,{learned:r.learned_at!=null,attempts:r.attempts,correct:r.correct}]));}
const validPoint=p=>POINTS.includes(p)||/^n[0-4]-[a-z0-9-]{1,40}$/.test(p)||/^bb-\d{1,20}$/.test(p);
function setLearned(db,point,learned=true){if(!validPoint(point))throw Error('INVALID_GRAMMAR_POINT');ensure(db);const now=Math.floor(Date.now()/1000);
  db.prepare('INSERT INTO grammar_progress(point,learned_at,updated_at) VALUES(?,?,?) ON CONFLICT(point) DO UPDATE SET learned_at=excluded.learned_at,updated_at=excluded.updated_at').run(point,learned?now:null,now);return progress(db)[point];}
function recordAnswer(db,point,correct){if(!validPoint(point))throw Error('INVALID_GRAMMAR_POINT');ensure(db);const now=Math.floor(Date.now()/1000);
  db.prepare('INSERT INTO grammar_progress(point,attempts,correct,updated_at) VALUES(?,1,?,?) ON CONFLICT(point) DO UPDATE SET attempts=attempts+1,correct=correct+excluded.correct,updated_at=excluded.updated_at').run(point,correct?1:0,now);
  /* 2026-11-15 one timestamped row per answer for the 学习练习 board (services/leaderboard.cjs studyTimes) */
  db.prepare('INSERT INTO grammar_answer_events(point,correct,at) VALUES(?,?,?)').run(point,correct?1:0,now);return progress(db)[point];}
/* Completion of a level: a point counts once it is marked learned; accuracy over all answers. */
function completion(prog,points=POINTS){let learned=0,attempts=0,correct=0;for(const p of points){const r=prog[p];if(r?.learned)learned++;attempts+=r?.attempts||0;correct+=r?.correct||0;}return {learned,total:points.length,share:points.length?learned/points.length:0,accuracy:attempts?correct/attempts:null};}
/* ---- 体系图的台词 (2026-11-11, user: every example comes from the games you played, the part you reached) ----
   A few lines you read are cut into pieces, each tagged with the part of Japanese it belongs to, so the map takes
   apart your own lines. Pieces are cached per line in grammar_scenes. */
const PIECE_SAY={
  classes:'名词这类词不变形，稳如红魔之里！',particles:'贴在名词后面的角色牌，说明它在句子里演什么。',order:'修饰的、语气的，都围着谓语摆好位置。',
  conjugation:'动词换了词尾，好让后面的零件接上来。词干不动，只换尾巴！',auxiliary:'粘在词尾后面的小零件：想、不、被、让……',politeness:'です・ます 一粘，就是对前辈的礼貌话。',
  aspect:'时间和状态：已经发生了，还是正在进行？',viewpoint:'谁为谁做——主语不写，靠这些词判断。',clauses:'在这里切一刀，长台词就拆成了短句。'};
const ROLE={'名詞':'名词','代名詞':'代词','形容詞':'形容词','形状詞':'な形容','副詞':'副词','連体詞':'连体','接続詞':'接续','感動詞':'感叹','接頭辞':'前缀','接尾辞':'后缀'};
function pieceOf(t,prev,next){
  const s=t.surface,b=t.base_form||s,n=t.normalized||b,p=pos(t),q=sub(t);
  if(p==='補助記号'||p==='空白')return [s,'','order',''];
  if(p==='助詞'){
    if(q==='接続助詞'&&(s==='て'||s==='で'))return [s,'て形','conjugation','て形 是万能接口，后面能接一大堆东西。'];
    if(q==='接続助詞')return [s,'连接','clauses',PIECE_SAY.clauses];
    if(q==='終助詞')return [s,'语气','order','句尾的小尾巴，带出说话人的语气。'];
    return [s,'助词','particles',PIECE_SAY.particles];}
  if(p==='助動詞'){
    if(b==='ます'||b==='です')return [s,'礼貌','politeness',PIECE_SAY.politeness];
    if(n==='た')return [s,'过去','aspect','た = 已经过去。日语只有「过去」和「非过去」。'];
    if(b==='だ')return [s,'是','order','句尾的 だ：断定「就是这样」。'];
    return [s,b==='ない'||b==='ぬ'||b==='ん'?'不':b==='たい'?'想':'零件','auxiliary',PIECE_SAY.auxiliary];}
  if(p==='動詞'){
    if(prev&&pos(prev)==='助詞'&&(prev.surface==='て'||prev.surface==='で')){
      if(b==='いる'||n==='居る')return [s,'正在','aspect','ている = 正在进行，或保持着某个状态。'];
      if(/^(くれる|あげる|もらう|くださる|下さる|呉れる|貰う)$/.test(b)||/^(くれる|あげる|もらう|下さる)$/.test(n))return [s,'为谁','viewpoint',PIECE_SAY.viewpoint];}
    if(/^(くださる|下さる)$/.test(b)||n==='下さる')return [s,'请','viewpoint',PIECE_SAY.viewpoint];
    return [s,'动作','conjugation',PIECE_SAY.conjugation];}
  if(p==='形容詞'&&q==='非自立可能')return [s,'零件','auxiliary',PIECE_SAY.auxiliary];
  if(p==='副詞'||p==='連体詞'||p==='感動詞'||p==='接続詞')return [s,ROLE[p],'order','这类词不变形，放在前面给后面的话定调子。'];
  return [s,ROLE[p]||'词','classes',PIECE_SAY.classes];
}
function cutLine(tokens){
  const T=(tokens||[]).filter(t=>t&&typeof t.surface==='string'),out=[];
  T.forEach((t,i)=>{const pc=pieceOf(t,T[i-1],T[i+1]),last=out[out.length-1];
    /* a noun run (名詞 + 接尾辞, 図書 + 館) reads as one block */
    if(last&&pc[2]==='classes'&&last[2]==='classes'&&(pos(t)==='接尾辞'||pos(T[i-1])==='接頭辞'||pos(t)==='名詞'&&pos(T[i-1])==='名詞')){last[0]+=pc[0];return;}
    out.push(pc);});
  return out;
}
function ensureScenes(db){db.exec('CREATE TABLE IF NOT EXISTS grammar_scenes(text TEXT PRIMARY KEY,pieces TEXT NOT NULL)');}
/* Up to `max` lines from what you read: recorded lines first, different games, 8–30 characters, with the most kinds
   of pieces; tokenizes at most a few new lines per call. */
async function scenes(db,list,tokenize,{max=4,budget=12}={}){
  ensureScenes(db);const get=db.prepare('SELECT pieces FROM grammar_scenes WHERE text=?'),put=db.prepare('INSERT OR REPLACE INTO grammar_scenes(text,pieces) VALUES(?,?)');
  const pool=list.filter(c=>{const n=[...c.text].length;return n>=8&&n<=30;}).slice(0,400),found=[];let spent=0;
  for(const c of pool){let pieces=null;const row=get.get(c.text);
    if(row){try{pieces=JSON.parse(row.pieces);}catch{}}
    else if(tokenize&&spent<budget){spent++;try{pieces=cutLine(await tokenize(c.text));put.run(c.text,JSON.stringify(pieces));}catch{}}
    if(pieces&&pieces.map(p=>p[0]).join('')===c.text)found.push({c,pieces,kinds:new Set(pieces.filter(p=>p[1]).map(p=>p[2])).size});
    if(found.length>=40)break;}
  const pick=[],games=new Set();
  for(const f of found.sort((a,b)=>b.kinds-a.kinds||(b.c.translation?1:0)-(a.c.translation?1:0))){if(pick.length>=max)break;if(games.has(f.c.gameId)&&found.some(x=>!pick.includes(x)&&!games.has(x.c.gameId)))continue;pick.push(f);games.add(f.c.gameId);}
  return pick.map(({c,pieces})=>({label:c.title||'',ja:c.text,zh:c.translation||'',translationSource:c.translationSource||'',origin:c.origin,readAt:c.readAt,readBy:c.readBy,real:true,pieces}));
}
/* ---- N4 → N0 (2026-11-11) ----
   Those lessons live in web/grammar-levels.js (shared with the page). Each point lists the surface forms that mark it;
   the lines you read are searched for them directly (no tokenizer needed), the best few become its examples. */
let levelsMod=null;
async function levels(){if(!levelsMod){try{levelsMod=await import(require('url').pathToFileURL(require('path').join(__dirname,'..','web','grammar-levels.js')).href);}catch{levelsMod={LEVEL_LIST:[],levelPoints:()=>[],findHit:()=>null};}}return levelsMod;}
/* E462 (2026-11-12, user: 语法自动匹配的句子根本就不是这个语法 — N0 じゃん showed 由良「やんっ……！」, a moan): a form found in
   the text is only a candidate. The tokenizer then has to agree: the found span sits on word boundaries (not inside
   じゃんけん), none of its words is an interjection, filler or a name, and a sentence-ending point really ends the
   clause after a word it can attach to. Each match gets a confidence; below MIN it is not an example (one line fewer
   beats a wrong one). Without the tokenizer only long, clearly bounded forms pass. Results are kept per line in
   grammar_level_lines so each line is tokenized once. */
const MATCH_V=2,MIN_CONF=0.6;
const CONTENT=new Set(['名詞','代名詞','感動詞','副詞','接続詞','連体詞','形状詞']);
const ATTACH=new Set(['名詞','代名詞','動詞','形容詞','形状詞','助動詞','接尾辞']);
const FINAL_GROUPS=new Set(['ending']);
/* word lessons (slang, net words, era words) are words; every other lesson is grammar and must land on grammar */
const WORD_GROUPS=new Set(['slang','net','trend','e80','e90','e00','e10','e20']);
const BENDS=new Set(['動詞','形容詞','助動詞']);
const LONE=new Set(['副詞','代名詞','感動詞','接続詞','連体詞']);
/* lessons with their own conditions on top of the general ones */
const form=t=>Array.isArray(t?.grammar)?t.grammar[5]||'':'';
/* lessons that open a sentence on their own (てか、…) */
const START_OK=new Set(['n0-teka']);
const POINT_RULES={
  /* じゃん／やん: a sentence particle or auxiliary after a word it can follow, not 救ってやんねー (やる) or a moan */
  'n0-jan':({core,prev,P})=>(P(core)==='助詞'||P(core)==='助動詞')&&!!prev&&ATTACH.has(P(prev)),
  /* ってば／ったら as the topic-calling particle, not the conditional だったら */
  'n0-tteba':({core,P})=>P(core)==='助詞',
  /* として, not 〜ようとして (trying to) */
  'n2-toshite':({prev})=>!/意志推量形/.test(form(prev))&&!(prev&&/^(う|よう)$/.test(prev.surface)),
  /* ので／んで: の or ん followed by the auxiliary で (したいので, 途中なんで), not a te-form (痛んで) or なんで (why) */
  'n4-node':({core,after,next,P})=>(core.surface==='ので'||['の','ん'].includes(core.surface)&&P(core)!=='動詞'&&after?.surface==='で'&&P(after)==='助動詞')&&
    /* のである／のであれば／のではない／のでもいい: の + で…, not the reason ので (2026-11-15, 証なのであろうか) */
    !(next&&/^(あ|は|も|しょ|す|ござ)/.test(next.surface)),
  /* そう (looks like / I hear) after a stem or a plain form, not the adverb そう (そうだそうだ, そりゃそうだ) */
  'n4-sou':({prev,P})=>!!prev&&['動詞','形容詞','形状詞','助動詞'].includes(P(prev)),
};
/* lines whose explicit wording should not open a lesson (they can still be examples further down) */
const EXPLICIT=/[●○〇◯]{1,}|ちんぽ|チンポ|おちんちん|オチンチン|まんこ|マンコ|精液|ザーメン|膣|子宮|クリトリス|乳首|おっぱい|フェラ|射精|中出し|勃起|ペニス|♡/;
const isExplicit=t=>EXPLICIT.test(String(t||''));
const MOAN=/^[っッー〜~…・！!♡❤]*[…♡❤]|^っ[！!]/;
function confirmHit(point,text,hit,tokens){
  const chars=[...String(text||'')],before=chars.slice(0,hit.start).join(''),after=chars.slice(hit.end).join('');
  const final=FINAL_GROUPS.has(point.group)||point.final===true;
  if(!Array.isArray(tokens)||!tokens.length){
    /* no tokenizer: the form must follow a word and, for an ending, close the clause; a lone short ending (やん, わ, ぞ)
       is too easy to mistake and waits for the tokenizer */
    const len=hit.end-hit.start,kanaOnly=/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(hit.text||'');
    if(MOAN.test(after)||/[「『（(]$/.test(before)||!before)return 0;
    if(final&&!/^($|[。！？!?、…」』）)\s]|[よねなさぞわか])/.test(after))return 0;
    if(!/[\p{L}]$/u.test(before))return 0;
    return kanaOnly&&len<=2&&(final||WORD_GROUPS.has(point.group))?0.4:0.6;
  }
  const T=tokens.filter(t=>t&&typeof t.surface==='string'&&Number.isFinite(t.start)),cov=T.filter(t=>t.end>hit.start&&t.start<hit.end);
  if(!cov.length)return 0;
  const g=t=>Array.isArray(t.grammar)?t.grammar:[],P=t=>t.pos||g(t)[0]||'';
  if(cov.some(t=>P(t)==='感動詞'||g(t)[1]==='フィラー'||g(t)[1]==='固有名詞'))return 0;
  const first=cov[0],last=cov[cov.length-1];let conf=0.9;
  /* the core: the first word that starts inside the span (いぞ → ぞ after うるさい); a span may begin inside the word
     before it only when its core is a sentence particle or an auxiliary (うるさいぞ, 作ら|れる), never inside くん or じゃんけん;
     で after 痛ん is the te-form, not ので (n4-node), たら after だっ is a condition, not ってば (n0-tteba) */
  const core=cov.find(t=>t.start>=hit.start)||first;
  if(first.start<hit.start){if(!BENDS.has(P(first))||!WORD_GROUPS.has(point.group)&&!(P(core)==='助動詞'||P(core)==='助詞'&&['終助詞','副助詞'].includes(g(core)[1])))return 0;conf-=0.15;}
  if(last.end>hit.end){if(!BENDS.has(P(last))||WORD_GROUPS.has(point.group)&&cov.length>1)return 0;conf-=0.15;}
  const rule=POINT_RULES[point.id];if(rule&&!rule({core,after:T[T.indexOf(core)+1],prev:T[T.indexOf(core)-1],next:T[T.indexOf(last)+1],P,g}))return 0;
  if(cov.every(t=>P(t)==='補助記号'))return 0;
  const prev=T[T.indexOf(core)-1],next=T[T.indexOf(last)+1];
  if(MOAN.test(after)&&cov.some(t=>!ATTACH.has(P(t))&&P(t)!=='助詞'))return 0;
  if(!WORD_GROUPS.has(point.group)){
    /* grammar, not a word that looks like it: そりゃそうだ (adverb), どうでもいい (どう + でも) */
    if(point.group!=='speech'&&cov.every(t=>['副詞','代名詞','感動詞'].includes(P(t))))return 0;
    if(['助詞','助動詞'].includes(P(first))&&first.start>=hit.start&&(!prev||LONE.has(P(prev))||P(prev)==='補助記号')&&!/^[なだ]/.test(hit.text||'')&&!START_OK.has(point.id))return 0;
  }
  if(final){
    if(!prev||P(prev)==='補助記号'||P(prev)==='感動詞')return 0;
    if(!ATTACH.has(P(prev))&&!(P(prev)==='助詞'&&/^(の|ん|か|よ|ね)$/.test(prev.surface)))conf-=0.3;
    if(next&&!(P(next)==='補助記号'||P(next)==='助詞'&&['終助詞','副助詞'].includes(g(next)[1])||P(next)==='助動詞'))conf-=0.3;
    if(!cov.some(t=>P(t)==='助詞'||P(t)==='助動詞'||P(t)==='接尾辞'))conf-=0.2;
  }
  return Math.max(0,Math.round(conf*100)/100);
}
function cacheTable(db){if(!db)return null;db.exec('CREATE TABLE IF NOT EXISTS grammar_level_lines(point TEXT NOT NULL,text TEXT NOT NULL,v INTEGER NOT NULL,conf REAL NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,PRIMARY KEY(point,text))');
  return {get:db.prepare('SELECT conf,start,end FROM grammar_level_lines WHERE point=? AND text=? AND v=?'),put:db.prepare('INSERT OR REPLACE INTO grammar_level_lines(point,text,v,conf,start,end) VALUES(?,?,?,?,?,?)')};}
/* for the tests (no tokenizer): the same choice as the report makes without one */
function levelExamples(list,mod,opts={}){const out={};for(const level of mod.LEVEL_LIST)for(const p of mod.levelPoints(level)){const found=[];for(const c of list){if(found.length>=40)break;if(p.hits?.length&&!p.hits.some(f=>c.text.includes(f)))continue;const h=mod.findHit(p,c.text);if(!h)continue;const conf=confirmHit(p,c.text,h,null);if(conf>=MIN_CONF)found.push(entry(c,h,conf));}out[p.id]=pickExamples(found,opts.max||5);}return out;}
const entry=(c,h,conf)=>({text:c.text,origin:c.origin,gameId:c.gameId,title:c.title,translation:c.translation,translationSource:c.translationSource,start:h.start,end:h.end,ruby:c.ruby,readAt:c.readAt,readBy:c.readBy,conf});
function pickExamples(found,max){
  const score=e=>(insights.isHuman(e.translationSource)?4:e.translation?1:0)+(e.origin==='history'?2:0)+([...e.text].length<=40?1:0)+(e.conf>=0.85?1:0)-(isExplicit(e.text)?3:0);
  /* the same line recorded with and without its speaker (軽音部員「…」 and 「…」) is one line */
  const key=e=>String(e.text).replace(/[\u0000-\u001f]/g,'').replace(/^(【[^】]{1,16}】|[^「『\s]{1,12})(?=[「『])/,''),seen=new Set();
  const pick=[],games=new Map();for(const e of found.sort((a,b)=>score(b)-score(a))){if(pick.length>=max)break;if(seen.has(key(e)))continue;seen.add(key(e));if((games.get(e.gameId)||0)>=2&&found.some(x=>!pick.includes(x)&&(games.get(x.gameId)||0)<2))continue;pick.push(e);games.set(e.gameId,(games.get(e.gameId)||0)+1);}
  /* the first example opens the lesson (认识它): a non-explicit one when there is any */
  const clean=pick.findIndex(e=>!isExplicit(e.text));if(clean>0)pick.unshift(...pick.splice(clean,1));
  return pick;
}
/* The report's version: tokenizer-confirmed, cached per line, stops at the deadline (pending lines come next poll). */
async function levelExamplesAsync(list,mod,{max=5,tokenize=null,db=null,deadline=Infinity,all=false}={}){
  const breathe=require('./cooperative.cjs').breather(),cache=cacheTable(db),out={};let pending=false;
  for(const level of mod.LEVEL_LIST)for(const p of mod.levelPoints(level)){const found=[];let total=0;await breathe();
    for(const c of list){if(!all&&found.length>=40)break;if(p.hits?.length&&!p.hits.some(f=>c.text.includes(f)))continue;const h=mod.findHit(p,c.text);if(!h)continue;
      let row=cache?.get.get(p.id,c.text,MATCH_V);
      if(!row){let tokens=null;if(tokenize){if(Date.now()>deadline){pending=true;continue;}try{tokens=await tokenize(c.text);}catch{tokens=null;}}
        row={conf:confirmHit(p,c.text,h,tokens),start:h.start,end:h.end};if(tokens&&cache)cache.put.run(p.id,c.text,MATCH_V,row.conf,row.start,row.end);}
      if(row.conf>=MIN_CONF){total++;found.push(entry(c,{start:row.start,end:row.end},row.conf));}}
    const pick=pickExamples(found,max);if(all)pick.total=total;out[p.id]=pick;}
  Object.defineProperty(out,'pending',{value:pending,enumerable:false});
  return out;
}
/* Ids of every point below a level: N5 first, then N4 → N1 (used when the learner picks a level). */
async function pointsBelow(level){const mod=await levels(),order=['N5',...mod.LEVEL_LIST],i=order.indexOf(level);return i<0?[]:order.slice(0,i).flatMap(l=>l==='N5'?POINTS:mod.levelPoints(l).map(p=>p.id));}
/* The page's data: examples per point from your reading, progress and completion. */
async function report(db,{root=null,scriptPairs=null,tokenize=null,deadline}={}){
  /* one tokenizer cache per report: the line cutter for the map reuses what the grammar scan already tokenized */
  const seen=new Map(),tk=tokenize&&(text=>{if(!seen.has(text))seen.set(text,tokenize(text));return seen.get(text);});
  const list=await candidatesCached(db,{root,scriptPairs});const state=await refresh(db,list,tk,{deadline});
  /* E459: examples only change when lines were checked or recorded; the page polls while lines are pending */
  const stamp=candidateStamp(db,root)+':'+db.prepare('SELECT COUNT(*) n FROM grammar_lines').get().n,key=String(root)+'|'+(scriptPairs?1:0);
  let cached=reportCache.get(key);if(!cached||cached.stamp!==stamp){const breathe=require('./cooperative.cjs').breather();await breathe();const ex=examples(db,list);await breathe();const lx=await levelExamplesAsync(list,await levels(),{tokenize:tk,db,deadline:deadline||Date.now()+8000});cached={stamp,ex,lx};if(!lx.pending)reportCache.set(key,cached);}
  /* E460 (user: an all-ages switch, off by default) with 全年龄例句 on explicit lines never appear as examples */
  let safe=false;try{safe=!!root&&require('./store.cjs').readJSON(require('node:path').join(root,'data','config','native-preferences.json')).safe_examples===true;}catch{}
  const clean=o=>safe?Object.fromEntries(Object.entries(o).map(([k,v])=>[k,Array.isArray(v)?Object.assign(v.filter(e=>!isExplicit(e?.text)),v.total!==undefined?{total:v.total}:{}):v])):o;
  const {ex:ex0,lx:lx0}=cached,ex=clean(ex0),lx=clean(lx0),prog=progress(db),sc0=await scenes(db,list,tk),sc=safe&&Array.isArray(sc0)?sc0.filter(x=>!isExplicit(x?.ja??x?.text)):sc0;
  return {scenes:sc,level:'N5',points:POINTS,examples:{...ex,...lx},progress:prog,completion:completion(prog),pending:state.pending||!!cached.lx.pending,lines:{history:list.filter(c=>c.origin==='history').length,script:list.filter(c=>c.origin==='script').length},real:Object.values({...ex,...lx}).reduce((n,l)=>n+l.length,0)};
}
/* An Anki note for a grammar line, through the existing card flow (one note per point and line). */
function ankiWord(point,title,gist,example,level){
  const label=String(title||point),lv=/^N[0-5]$/.test(String(level||''))?String(level):'N5';
  return {surface:label,base:label,reading:label,noReading:true,cardKey:'grammar:'+point+':'+example.text,meaning:String(gist||''),pos:lv+' 语法',pitch:[],sentence:example.text};
}
module.exports={confirmHit,isExplicit,MIN_CONF,candidatesCached,levelExamplesAsync,checkedLines,levels,levelExamples,pointsBelow,validPoint,cutLine,scenes,POINTS,PREFILTER,matchPoints,rubyPairs,ensure,candidates,refresh,examples,progress,setLearned,recordAnswer,completion,report,ankiWord};
