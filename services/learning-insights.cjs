// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Learning from what was read (2026-11-10): sentence cards keep the game's own line and, when zero-latency translation
   has it, the human translation (translation group's patch or the official Chinese) instead of the machine one; the
   lines MeguLit recorded are tokenized once into line_words, which feeds word frequency, JLPT coverage and the
   weekly review list. Pure functions are exported for the tests; the DB helpers take the tokenizer and lookup as
   arguments so they run offline. */
const path=require('node:path'),fs=require('node:fs');

/* ---- translation source ---- */
const HUMAN=new Set(['group','official']);
const KANA_OR_KANJI=/[぀-ヿ㐀-鿿]/,JAPANESE_KANA=/[぀-ゟ゠-ヿ]/;
const isHuman=source=>HUMAN.has(source);
/* A Chinese/English translation; a line that is still Japanese (kana) is not one. */
const usable=text=>typeof text==='string'&&!!text.trim()&&!JAPANESE_KANA.test(text.replace(/[「」『』（）、。！？…―ー〜～]/g,''));
/* The human translation the zero-latency provider holds for a line: kind 'patch' is a translation group's patch read
   next to the Japanese game (machine-filled lines are not human), kind 'original' is a Chinese release whose captured
   line is the official Chinese. */
function humanFromResolve(kind,r){
  if(!r||(r.status!=='exact'&&r.status!=='high'))return null;
  if(kind==='patch'){if(r.machine===true||!usable(r.translation))return null;return {text:r.translation.trim(),source:'group'};}
  if(kind==='original'){if(!usable(r.captured))return null;return {text:r.captured.trim(),source:'official'};}
  return null;
}
/* Human first, machine second. */
function pickTranslation({human,machine}={}){
  if(human&&usable(human.text)&&isHuman(human.source))return {translation:human.text.trim(),translationSource:human.source};
  if(typeof machine==='string'&&machine.trim())return {translation:machine.trim(),translationSource:'machine'};
  return {translation:'',translationSource:''};
}
const SOURCE_LABEL={group:'汉化组译文',official:'官方中文',machine:'机器翻译'};

/* ---- readings: the game's ruby first, then the context/dictionary reading; never the raw tokenizer reading ---- */
/* tokens: resolved tokens (readings.resolve); gameRuby: surface→reading from the game; rubyPairs: [[base,ruby],…]
   from the matched script line. A token whose reading the resolver did not settle (raw) keeps no furigana. */
function applyGameRuby(tokens,gameRuby={},rubyPairs=[]){
  const pairs=new Map();for(const p of Array.isArray(rubyPairs)?rubyPairs:[])if(Array.isArray(p)&&p[0]&&p[1])pairs.set(String(p[0]),String(p[1]));
  return (tokens||[]).map(t=>{const surface=String(t.surface||'');const game=pairs.get(surface)||(gameRuby&&Object.hasOwn(gameRuby,surface)?gameRuby[surface]:'');
    if(game)return {...t,reading:game,readingSource:'game'};
    if(t.readingSource==='tokenizer'||t.rawReading===true)return {...t,reading:''};
    return t;});
}

/* ---- Anki field mapping for a sentence card ---- */
const ANKI_EXTRA=['Game','TranslationSource'];
function ankiSentenceFields({sentence='',sentenceHtml='',translation='',translationSource='',gameTitle='',reading='',word=''}={},available=[]){
  const has=name=>available.includes(name),out={};
  out.Sentence=sentence;
  if(has('SentenceFurigana'))out.SentenceFurigana=sentenceHtml||'';
  if(has('SentenceTranslation'))out.SentenceTranslation=translation||'';
  if(has('WordReading'))out.WordReading=/[㐀-鿿々〆ヶ]/.test(word)?String(reading||'').replace(/[ァ-ヴ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)):'';
  if(has('Game'))out.Game=gameTitle||'';
  if(has('TranslationSource'))out.TranslationSource=translation?SOURCE_LABEL[translationSource]||'':'';
  return out;
}

/* ---- counting the words that were read ---- */
const CONTENT=new Set(['名詞','動詞','形容詞','形状詞','副詞']);
const STOP=new Set(['する','為る','ある','有る','いる','居る','なる','成る','ない','無い','こと','事','もの','物','よう','様','そう','ここ','そこ','あそこ','これ','それ','あれ','どれ','この','その','あの','ため','為','とき','時','ところ','所','ほう','方','くる','来る','いく','行く','いう','言う','思う','おもう','できる','出来る','みる','見る','やる','もう','まだ','ちょっと','よく','なんか','ん','の','わけ','訳','はず']);
const hira=s=>String(s||'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
/* The text of a recorded line without spaces and without the game's ruby markup (<rしも>霜</r> → 霜). */
const plainLine=text=>String(text||'').replace(/<r[^>]*>([^<]*)<\/r>/g,'$1').replace(/<\/?[a-z][^>]*>/gi,'').replace(/\s+/g,'');
/* A line that is real Japanese text: mojibake (a Chinese script read as Shift-JIS shows half-width kana and C1 control
   characters, and almost no hiragana) is not counted. */
function readableLine(text){const t=String(text||'').replace(/\s+/g,'');if(!t)return false;if(/[\u0080-\u009f｡-ﾟ�]/.test(t))return false;const chars=[...t].length,kana=(t.match(/[ぁ-ゟ]/g)||[]).length;return chars<8||kana/chars>=.08;}
/* Content words of one tokenized line:[key (normalized form), base form, start, end]. */
function lineWords(tokens){
  const out=[];
  for(const t of tokens||[]){
    const base=String(t.base_form||t.surface||''),key=String(t.normalized||base),grammar=Array.isArray(t.grammar)?t.grammar:[],pos=t.pos||grammar[0]||'';
    if(!CONTENT.has(pos)||!base||!KANA_OR_KANJI.test(base))continue;
    if(grammar.includes('数詞')||grammar.includes('固有名詞')||grammar.includes('非自立可能')||grammar.includes('助数詞'))continue;
    if(STOP.has(base)||STOP.has(key))continue;
    if([...base].length<2&&!/[㐀-鿿]/.test(base))continue;
    out.push([key,base,Number(t.start)||0,Number(t.end)||0]);
  }
  return out;
}
/* Words already saved: spellings, plus the readings of kana-only entries. */
function savedForms(vocabulary){
  const set=new Set();
  for(const v of vocabulary||[]){if(v.spelling)set.add(String(v.spelling));if(v.reading&&(!v.spelling||!/[㐀-鿿]/.test(v.spelling)))set.add(hira(v.reading));}
  return set;
}
const wordSaved=(saved,key,base)=>saved.has(key)||saved.has(base)||(!/[㐀-鿿]/.test(base)&&saved.has(hira(base)));
/* rows: [{gameId, readAt, words:[[key,base,start,end],…]}]. Counts each word, keeps its most used spelling. */
function countWords(rows,{saved=new Set(),gameId=null,since=0,until=Infinity,includeSaved=false}={}){
  const map=new Map();
  for(const row of rows||[]){
    if(gameId&&row.gameId!==gameId)continue;if(row.readAt<since||row.readAt>=until)continue;
    /* a word counts once per line: a line recorded with repeats (multi-language captures) does not inflate it */
    const inLine=new Set();
    for(const [key,base] of row.words||[]){
      let w=map.get(key);if(!w){w={key,count:0,spellings:new Map(),games:new Map(),lastAt:0};map.set(key,w);}
      if(inLine.has(key))continue;inLine.add(key);
      w.count++;w.spellings.set(base,(w.spellings.get(base)||0)+1);w.games.set(row.gameId,(w.games.get(row.gameId)||0)+1);if(row.readAt>w.lastAt)w.lastAt=row.readAt;
    }
  }
  const out=[];
  for(const w of map.values()){
    const base=[...w.spellings.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0],isSaved=[...w.spellings.keys()].some(b=>wordSaved(saved,w.key,b));
    if(isSaved&&!includeSaved)continue;
    out.push({key:w.key,base,count:w.count,saved:isSaved,lastAt:w.lastAt,games:[...w.games.entries()].sort((a,b)=>b[1]-a[1]).map(([id,n])=>({id,count:n}))});
  }
  return out.sort((a,b)=>b.count-a.count||b.lastAt-a.lastAt||a.key.localeCompare(b.key));
}
/* Monday 00:00 local time of the week holding `now`, in seconds. */
function weekStart(now=new Date()){const d=new Date(now);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return Math.floor(d.getTime()/1000);}

/* ---- JLPT ---- */
let jlptCache=null;
function loadJlpt(file=path.join(__dirname,'..','core','jlpt-words.json')){
  if(jlptCache&&jlptCache.file===file)return jlptCache.index;
  const index=jlptIndex(JSON.parse(fs.readFileSync(file,'utf8')));jlptCache={file,index};return index;
}
const LEVELS=['N5','N4','N3','N2','N1'];
/* data.levels: {N5:['会う|あう','足/脚|あし',…],…}. Each word belongs to its easiest level. */
function jlptIndex(data){
  const levels={},byForm=new Map();
  for(const level of LEVELS){levels[level]=[];
    for(const item of data?.levels?.[level]||[]){const [spell,reading='']=String(item).split('|'),forms=spell.split('/').filter(Boolean);if(!forms.length)continue;
      const kanaOnly=!forms.some(f=>/[㐀-鿿]/.test(f));if(forms.every(f=>byForm.has(f)&&byForm.get(f).reading===hira(reading)||kanaOnly&&byForm.has(f)))continue;
      const word={level,forms,reading:hira(reading)};levels[level].push(word);
      for(const f of forms)if(!byForm.has(f))byForm.set(f,word);
      if(!forms.some(f=>/[㐀-鿿]/.test(f))&&word.reading&&!byForm.has(word.reading))byForm.set(word.reading,word);}}
  return {levels,byForm};
}
const jlptWordOf=(index,key,base)=>index.byForm.get(base)||index.byForm.get(key)||null;
/* For each level: how many of its words were met in reading, and how many are saved. */
function jlptCoverage(index,rows,saved=new Set()){
  const met=new Set();
  for(const row of rows||[])for(const [key,base] of row.words||[]){const w=jlptWordOf(index,key,base);if(w)met.add(w);}
  return LEVELS.map(level=>{const words=index.levels[level],total=words.length;let m=0,s=0;
    for(const w of words){if(met.has(w))m++;if(w.forms.some(f=>saved.has(f))||(!w.forms.some(f=>/[㐀-鿿]/.test(f))&&saved.has(w.reading)))s++;}
    return {level,total,met:m,saved:s,metShare:total?m/total:0,savedShare:total?s/total:0};});
}
/* Which levels a game's vocabulary leans on: distinct words met in it, split by level; words outside the list are
   counted as beyond. Shares add up to 1. */
function gameLevels(index,rows,gameId){
  const seen=new Map();
  for(const row of rows||[]){if(row.gameId!==gameId)continue;for(const [key,base] of row.words||[]){if(seen.has(key))continue;const w=jlptWordOf(index,key,base);seen.set(key,w?w.level:'beyond');}}
  const counts=Object.fromEntries([...LEVELS,'beyond'].map(l=>[l,0]));for(const l of seen.values())counts[l]++;
  const total=seen.size;
  return {total,levels:[...LEVELS,'beyond'].map(level=>({level,count:counts[level],share:total?counts[level]/total:0}))};
}

/* ---- database ---- */
function ensure(db){
  db.exec(`CREATE TABLE IF NOT EXISTS line_words(event_id INTEGER PRIMARY KEY,game_id TEXT,read_at INTEGER NOT NULL,words TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS line_words_by_time ON line_words(read_at);
CREATE TABLE IF NOT EXISTS word_info(key TEXT PRIMARY KEY,entry_id INTEGER,spelling TEXT NOT NULL DEFAULT '',reading TEXT NOT NULL DEFAULT '',meaning TEXT NOT NULL DEFAULT '',checked_at INTEGER NOT NULL);`);
}
/* Tokenizes the recorded lines not counted yet, newest first, until the deadline. Returns how many remain. */
async function refresh(db,tokenize,{limit=1500,deadline=Date.now()+8000}={}){
  ensure(db);
  const todo=db.prepare('SELECT e.id,e.game_id,e.text,e.read_at FROM reading_events e LEFT JOIN line_words l ON l.event_id=e.id WHERE l.event_id IS NULL ORDER BY e.id DESC LIMIT ?').all(limit);
  const put=db.prepare('INSERT OR REPLACE INTO line_words(event_id,game_id,read_at,words) VALUES(?,?,?,?)');let done=0;
  for(const row of todo){if(Date.now()>deadline)break;let words=[];
    const text=plainLine(row.text);if(readableLine(text)){try{words=lineWords(await tokenize(text));}catch{break;}}
    put.run(row.id,row.game_id,row.read_at,JSON.stringify(words));done++;}
  return pending(db);
}
const pending=db=>db.prepare('SELECT COUNT(*) n FROM reading_events e LEFT JOIN line_words l ON l.event_id=e.id WHERE l.event_id IS NULL').get().n;
function lineRows(db){ensure(db);return db.prepare('SELECT l.event_id,l.game_id,l.read_at,l.words FROM line_words l JOIN reading_events e ON e.id=l.event_id').all().map(r=>{let words=[];try{words=JSON.parse(r.words);}catch{}return {eventId:r.event_id,gameId:r.game_id,readAt:r.read_at,words};});}
/* A dictionary entry is this word only when it lists the spelling (or, for a kana word, the reading): the lookup's
   nearest entry for an unknown compound (砂撒き → 砂) must not lend it its reading. */
function entryMatches(entry,base,key){if(!entry)return false;const forms=[base,key].filter(Boolean);return forms.some(f=>entry.spellings?.includes(f))||forms.some(f=>!/[㐀-鿿]/.test(f)&&(entry.readings||[]).some(r=>hira(r)===hira(f)));}
/* Dictionary reading and meaning for the listed words (JMdict through the lookup), cached. */
async function describe(db,words,lookup,{deadline=Date.now()+4000}={}){
  ensure(db);const get=db.prepare('SELECT * FROM word_info WHERE key=?'),put=db.prepare('INSERT OR REPLACE INTO word_info(key,entry_id,spelling,reading,meaning,checked_at) VALUES(?,?,?,?,?,?)');
  for(const w of words){let info=get.get(w.key);
    if(!info&&lookup&&Date.now()<deadline){try{let entry=await lookup(w.base,w.key);if(!entryMatches(entry,w.base,w.key))entry=null;const d=Array.isArray(entry?.definitions)?entry.definitions:[];
      put.run(w.key,entry?.id??null,entry?.spellings?.[0]||'',entry?.readings?.[0]||'',d.slice(0,2).map(x=>typeof x==='string'?x:x?.gloss||'').filter(Boolean).join('；').slice(0,160),Math.floor(Date.now()/1000));info=get.get(w.key);}catch{}}
    if(info){w.entryId=info.entry_id;w.reading=info.reading;w.meaning=info.meaning;}}
  return words;
}
function vocabularyRows(db){return db.prepare('SELECT spelling,reading FROM vocabulary').all();}
/* The whole learning-from-reading report. */
function report(db,{now=new Date(),gameId=null,limit=40,jlpt=loadJlpt()}={}){
  const rows=lineRows(db),saved=savedForms(vocabularyRows(db)),since=weekStart(now);
  const titles=new Map(db.prepare('SELECT id,title FROM games').all().map(g=>[g.id,g.title]));
  const lines=new Map();for(const r of rows)lines.set(r.gameId,(lines.get(r.gameId)||0)+1);
  const games=[...lines.entries()].filter(([id])=>id&&titles.has(id)).sort((a,b)=>b[1]-a[1]).map(([id,n])=>({id,title:titles.get(id),lines:n,...gameLevels(jlpt,rows,id)}));
  const tag=list=>list.map(w=>{const j=jlptWordOf(jlpt,w.key,w.base);return {...w,jlpt:j?j.level:'',games:w.games.slice(0,3).map(g=>({...g,title:titles.get(g.id)||''}))};});
  return {
    lines:rows.length,pending:pending(db),
    frequent:tag(countWords(rows,{saved,gameId}).slice(0,limit)),
    weekly:tag(countWords(rows,{saved,since}).slice(0,limit)),
    weekStart:since,
    jlpt:jlptCoverage(jlpt,gameId?rows.filter(r=>r.gameId===gameId):rows,saved),
    games
  };
}
/* 2026-11-14 (user: JLPT 覆盖 → click a level to see its words and mark them): every word of one level, with how often
   it was read (in one game when gameId is given), where, and whether it is saved or marked known (status ≥ 3).
   The client filters (读到过 / 已收录 / 未读到), searches, sorts and virtualises; meanings come from word_info. */
const KNOWN=3;
function jlptWords(db,{level,gameId=null,jlpt=loadJlpt()}={}){
  if(!LEVELS.includes(level))throw Error('INVALID_JLPT_LEVEL');
  ensure(db);const rows=lineRows(db),titles=new Map(db.prepare('SELECT id,title FROM games').all().map(g=>[g.id,g.title]));
  const met=new Map();
  for(const row of rows){if(gameId&&row.gameId!==gameId)continue;const inLine=new Set();
    for(const [key,base] of row.words||[]){const w=jlptWordOf(jlpt,key,base);if(!w||w.level!==level||inLine.has(w))continue;inLine.add(w);
      let m=met.get(w);if(!m){m={key,count:0,games:new Map(),lastAt:0};met.set(w,m);}m.count++;m.games.set(row.gameId,(m.games.get(row.gameId)||0)+1);if(row.readAt>m.lastAt)m.lastAt=row.readAt;}}
  const vocab=new Map();for(const v of db.prepare('SELECT id,spelling,reading,status FROM vocabulary').all()){const put=f=>{const o=vocab.get(f);if(!o||(v.status||0)>(o.status||0))vocab.set(f,{id:v.id,status:v.status||0});};
    if(v.spelling)put(String(v.spelling));if(v.reading&&(!v.spelling||!/[㐀-鿿]/.test(v.spelling)))put(hira(v.reading));}
  const info=db.prepare('SELECT reading,meaning FROM word_info WHERE key=?');
  const words=jlpt.levels[level].map(w=>{const m=met.get(w),kanaOnly=!w.forms.some(f=>/[㐀-鿿]/.test(f)),v=w.forms.map(f=>vocab.get(f)).find(Boolean)||(kanaOnly?vocab.get(w.reading):null)||null;
    const key=m?.key||w.forms[0],i=info.get(key)||(m?null:info.get(w.forms[0]));
    return {key,base:w.forms[0],forms:w.forms,reading:i?.reading||w.reading,meaning:i?.meaning||'',count:m?.count||0,lastAt:m?.lastAt||0,
     games:m?[...m.games.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id,n])=>({id,count:n,title:titles.get(id)||''})):[],saved:!!v,known:!!v&&v.status>=KNOWN,vocabId:v?.id??null};});
  const totals={all:words.length,met:0,saved:0,unmet:0};for(const w of words){if(w.count)totals.met++;else totals.unmet++;if(w.saved)totals.saved++;}
  return {level,gameId,gameTitle:gameId?titles.get(gameId)||'':'',totals,words};
}
/* Meanings for words shown in the JLPT list that were never looked up yet (cached in word_info by describe). */
async function jlptDescribe(db,items,lookup,{deadline=Date.now()+3000}={}){
  const words=(Array.isArray(items)?items:[]).slice(0,60).map(x=>({key:String(x?.key||'').slice(0,40),base:String(x?.base||x?.key||'').slice(0,40)})).filter(x=>x.key);
  await describe(db,words,lookup,{deadline});return words.map(w=>({key:w.key,reading:w.reading||'',meaning:w.meaning||''}));
}
/* The line a word was read in, newest first (the given game first), with the translation recorded for it. */
function exampleLine(db,key,gameId=null){
  /* the given game first, then a line of sentence length (a long capture of several lines makes a poor card), newest */
  const fits=r=>{const e=db.prepare('SELECT length(text) n FROM reading_events WHERE id=?').get(r.eventId);return e&&e.n<=120;};
  const candidates=lineRows(db).filter(r=>r.words.some(w=>w[0]===key)).sort((a,b)=>(b.gameId===gameId)-(a.gameId===gameId)||fits(b)-fits(a)||b.readAt-a.readAt);
  for(const r of candidates){
    const hit=r.words.find(w=>w[0]===key);
    const e=db.prepare('SELECT text,original,game_id,read_at FROM reading_events WHERE id=?').get(r.eventId);if(!e)continue;let o={};try{o=JSON.parse(e.original||'{}');}catch{}
    const text=plainLine(e.text);
    return {text,gameId:e.game_id,readAt:e.read_at,start:hit[2],end:hit[3],...pickTranslation({human:isHuman(o.translationSource)?{text:o.translation,source:o.translationSource}:null,machine:isHuman(o.translationSource)?'':o.translation})};
  }
  return null;
}
/* Saves a word met in reading: dictionary entry, plus its line as the example. */
function saveWord(db,entry,example,{status=null}={}){
  if(!entry?.id)throw Error('WORD_NOT_FOUND');
  db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare('INSERT OR IGNORE INTO vocabulary(id,spelling,reading,definitions,status,created_at,original) VALUES(?,?,?,?,0,?,?)').run(entry.id,entry.spellings?.[0]||'',entry.readings?.[0]||'',JSON.stringify(entry.definitions||[]),Math.floor(Date.now()/1000),JSON.stringify({entry,from:'reading'}));
    if(example?.text&&!db.prepare('SELECT 1 FROM examples WHERE word_id=? AND text=?').get(entry.id,example.text))
      db.prepare('INSERT INTO examples(word_id,game_id,text,translation,highlight_start,highlight_end,created_at,original) VALUES(?,?,?,?,?,?,?,?)').run(entry.id,example.gameId||null,example.text,example.translation||'',example.start||0,example.end||0,Math.floor(Date.now()/1000),JSON.stringify({translationSource:example.translationSource||'',from:'reading',readAt:example.readAt||null}));
    if(Number.isInteger(status)&&status>=0&&status<=4)db.prepare('UPDATE vocabulary SET status=? WHERE id=?').run(status,entry.id);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {id:entry.id,status:Number.isInteger(status)&&status>=0&&status<=4?status:undefined,spelling:entry.spellings?.[0]||'',reading:entry.readings?.[0]||''};
}
module.exports={plainLine,entryMatches,readableLine,isHuman,usable,humanFromResolve,pickTranslation,SOURCE_LABEL,applyGameRuby,ANKI_EXTRA,ankiSentenceFields,lineWords,savedForms,countWords,weekStart,loadJlpt,jlptIndex,jlptCoverage,gameLevels,LEVELS,ensure,refresh,pending,lineRows,describe,report,exampleLine,saveWord,jlptWords,jlptDescribe};
