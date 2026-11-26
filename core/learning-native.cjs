'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline');
const {createReadingResolver}=require('./reading.cjs');
const {kana,contextual}=require('./furigana.js');
const {numberTokens}=require('./counter-reading.cjs');
const {nameTokens}=require('./name-reading.cjs');
const {contextReadings}=require('./context-reading.cjs');
const {readingsIn,gameTokens,unknownNames}=require('./game-reading.cjs');
const {InstallProgress}=require('./install-progress.cjs');
const {conjugation}=require('./morphology.cjs');
const {definitionGroups}=require('./definitions.cjs');
const tags={ 'Ichidan verb':'一段动词（二类动词）','transitive verb':'他动词','intransitive verb':'自动词','noun (common) (futsuumeishi)':'名词','pronoun':'代词','particle':'助词','auxiliary verb':'助动词','auxiliary':'助动词','adverb (fukushi)':'副词','adjective (keiyoushi)':'い形容词','adjectival nouns or quasi-adjectives (keiyodoshi)':'な形容词／形容动词','expressions (phrases, clauses, etc.)':'惯用表达／短语','pre-noun adjectival (rentaishi)':'连体词','conjunction':'接续词','interjection (kandoushi)':'感叹词','suffix':'接尾词','prefix':'接头词','counter':'量词','noun, used as a suffix':'名词（接尾用法）','unclassified':'未分类'};
function chinesePos(tag){
 if(tags[tag])return tags[tag];
 if(/Godan verb/i.test(tag)){const end=/with ['"]?([^'",]+)['"]? ending/i.exec(tag);return '五段动词（一类动词）'+(end?' · '+end[1]+'结尾':'');}
 if(/suru verb/i.test(tag))return 'サ变动词（三类动词）';if(/Kuru verb/i.test(tag))return 'カ变动词（三类动词）';
 if(/Ichidan/i.test(tag))return '一段动词（二类动词）';
 if(/Nidan/.test(tag))return (/upper class/.test(tag)?'上二段动词':'下二段动词')+'（古语）';if(/Yodan/.test(tag))return '四段动词（古语）';
 const extra={"'ku' adjective (archaic)":'ク活用形容词（古语）',"'shiku' adjective (archaic)":'シク活用形容词（古语）',"'taru' adjective":'タリ形容动词','adjective (keiyoushi) - yoi/ii class':'い形容词（良い／いい特殊型）','adverb taking the \'to\' particle':'副词（可接と）','archaic/formal form of na-adjective':'な形容词（古语／正式形式）','auxiliary adjective':'补助形容词','copula':'断定助动词','irregular nu verb':'ナ变动词（古语）','irregular ru verb, plain form ends with -ri':'ラ变动词（古语）','noun or participle which takes the aux. verb suru':'名词／サ变动词','noun or verb acting prenominally':'连体用名词／动词','noun, used as a prefix':'名词（接头用法）',"nouns which may take the genitive case particle 'no'":'名词（可接の）','numeric':'数词','su verb - precursor to the modern suru':'サ变动词（す，古语）','verb unspecified':'动词（类别未指定）'};
 return extra[tag]||tag;
}
class LocalLearning{
 constructor(folder,onStatus=()=>{}){this.folder=folder;this.onStatus=onStatus;this.pending=new Map();this.serial=0;this.cache=new Map();this.readings=createReadingResolver();this.names=new Map();this.progress={stage:this.installed()?'ready':'idle',percent:this.installed()?100:null};}
 python(){const own=require('./layout.cjs').python;return fs.existsSync(own)?own:'python.exe';}
 runtimeFolder(){return require('./layout.cjs').reading;}
 installed(){return fs.existsSync(path.join(this.runtimeFolder(),'sudachidict_full/resources/system.dic'));}
 status(){
  const installed=this.installed();
  const progress=installed?{stage:'ready',percent:100}:{stage:'idle',percent:null};
  return {learningInstalled:installed,learningProgress:this.installing||this.progress.stage==='error'?this.progress:progress};
 }
 async install(retry=false,force=false,only=null){
  if(this.closed)throw Error('本地辞书已关闭');
  const SPECS={sudachi:['sudachidict_full==20261015'],unidic:['unidic-lite==1.0.8']},ALL=['sudachipy==0.7.0','sudachidict_full==20261015','fugashi==1.5.2','unidic-lite==1.0.8'];
  const packages=Array.isArray(only)&&only.length?[...new Set(only.flatMap(id=>SPECS[id]||[]))]:ALL;
  const previous=this.installing;
  if(!previous&&this.installError&&!retry)throw Error(this.installError);
  if(previous&&force===this.installRequest.force&&packages.every(pkg=>this.installRequest.packages.includes(pkg))){
   this.installRequest.retry||=retry;return previous;
  }
  const request={force,packages,retry};
  const start=async()=>{
   if(this.closed)throw Error('本地辞书已关闭');
   if(this.installError&&!request.retry)throw Error(this.installError);
   if(request.retry)this.installError='';
   const reporter=new InstallProgress(value=>{this.progress=value;this.onStatus({learningProgress:value,learningInstalled:value.stage==='ready'});});
   try{await this.runInstall(force,packages,reporter);}catch(e){reporter.finish(false);this.installError=e.message;this.onStatus({learningMessage:e.message});throw e;}
   finally{this.installer=null;}
  };
  this.installRequest=request;
  const job=(previous?previous.catch(()=>{}).then(start):start()).finally(()=>{
   if(this.installing===job){this.installing=null;this.installRequest=null;}
  });
  this.installing=job;return job;
 }
 async runInstall(force,packages,reporter){
  const ready=!force&&await require('./python-installer.cjs').dictionariesReady(this.python(),this.runtimeFolder());
  if(this.closed)throw Error('本地辞书已关闭');
  if(ready){this.progress={stage:'ready',percent:100};this.onStatus({learningProgress:this.progress,learningInstalled:true,learningMessage:'SudachiDict Full 已安装，离线词典可用'});return;}
  await require('./python-installer.cjs').ensurePip(this.python(),require('./layout.cjs').root);
  // Repair overwrites the dictionary files; the worker keeps them open (locked on Windows), so stop it first.
  if(force&&this.worker){const old=this.worker;this.worker=null;await new Promise(r=>{old.once('exit',r);try{old.stdin.end();old.kill();}catch{r();}setTimeout(r,3000);});this.cache.clear();}
  if(this.closed)throw Error('本地辞书已关闭');
  reporter.update({stage:'resolve',percent:null});
  this.onStatus({learningMessage:'正在安装 SudachiDict Full 本地组件，首次需要下载较大的词典；完成后分词、注音、查词均离线'});
  return new Promise((resolve,reject)=>{
   const child=spawn(this.python(),['-m','pip','install','--target',this.runtimeFolder(),'--upgrade','--no-compile','--disable-pip-version-check','--progress-bar','raw',...(force?['--force-reinstall','--no-deps','--no-cache-dir']:[]),...packages],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   // Keep pip's own output so a failed install says why (logs/dictionary-install.log and the error message).
   const logFile=path.join(require('./layout.cjs').logs,'dictionary-install.log');let tail='';const keep=(d)=>{const t=d.toString();tail=(tail+t).slice(-20000);try{fs.appendFileSync(logFile,t.replace(/\r(?!\n)/g,'\n').split('\n').filter(l=>!/^Progress \d+ of \d+/.test(l)).join('\n'));}catch{}};
   try{fs.appendFileSync(logFile,'\n===== '+new Date().toISOString()+' pip install '+(force?'(repair) ':'')+packages.join(' ')+'\n');}catch{}
   this.installer=child;child.stdout.on('data',data=>{reporter.feed(data,'out');keep(data);});child.stderr.on('data',data=>{reporter.feed(data,'err');keep(data);});
   child.on('error',()=>reject(Error('无法启动本地 Python，请安装 Python 3.13 并重启新版启动器')));
   child.on('exit',code=>{this.installer=null;if(code===0&&this.installed()){reporter.finish(true);this.onStatus({learningMessage:'SudachiDict Full 已安装，分词／注音／点读全部就绪'});resolve();}else{const lines=tail.split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!/^Progress \d+ of \d+/.test(l));const why=[...lines].reverse().find(l=>/error|could not|denied|permission|timed out|connection|ssl|winerror|拒绝|访问/i.test(l))||lines.at(-1)||'';reject(Error('词典下载或安装失败'+(why?'：'+why.slice(0,220):'')+'（完整输出见 logs\\dictionary-install.log）'));}});
  });
 }
 async ready(){
  if(this.closed)throw Error('本地辞书已关闭');
  while(this.installing)await this.installing.catch(()=>{});
  if(this.closed)throw Error('本地辞书已关闭');
  if(!this.installed()){await this.install();return this.ready();}
  if(this.worker)return this.starting;
  try{await this.spawnWorker();}
  catch(error){
   // User report (2026-11-09): the worker died on start (a half-finished install) and every lookup said
   // "reinstall in settings" without saying where. Repair the reading components once on our own, then retry.
   // A missing standard-library module (zipfile, encodings…) means MeguLit's own Python is damaged; reinstalling the
   // dictionaries cannot fix that, the base runtime has to be set up again (the launcher does it on next start).
   const missing=/No module named '([^'.]+)/.exec(String(error?.message||''))?.[1];
   if(missing&&!['sudachipy','sudachidict_full','fugashi','unidic_lite'].includes(missing))throw Error('MeguLit 自带的 Python 不完整（缺少 '+missing+'），重装词典修不好：请完全退出 MeguLit（托盘图标也退出）再打开，会自动重新下载基础组件');
   if(this.selfRepaired)throw this.workerError(error);
   this.selfRepaired=true;this.onStatus({learningMessage:'分词组件无法启动，正在自动修复（重新下载 Sudachi 组件）…'});
   try{await this.install(true,true);}catch(again){throw this.workerError(again);}
   return this.ready();
  }
 }
 workerError(error){const why=String(error?.message||'').slice(0,200);return Error('分词组件无法运行，自动修复后仍失败：请按 Alt+T → 设置 → 词典 → 「修复 / 重新下载」'+(why?'（'+why+'）':''));}
 // Starts reading-worker.py and resolves once it reports ready; a crash before that rejects with its last stderr
 // line, which is also kept in logs/reading-worker.log so a failed start can be diagnosed.
 spawnWorker(){
  const child=spawn(this.python(),[path.join(__dirname,'reading-worker.py')],{windowsHide:true,cwd:__dirname,env:{...process.env,TOMOYO_READING_RUNTIME:this.runtimeFolder()},stdio:['pipe','pipe','pipe']});this.worker=child;
  let stderr='',ready=false;child.stdin.on('error',()=>{});child.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-6000);});
  const log=text=>{try{fs.appendFileSync(path.join(require('./layout.cjs').logs,'reading-worker.log'),'\n===== '+new Date().toISOString()+'\n'+text+'\n');}catch{}};
  this.starting=new Promise((resolve,reject)=>{
   const fail=error=>{if(this.worker===child)this.worker=null;const last=stderr.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).at(-1)||(error?.message||'');if(stderr||error)log((error?.message||'exit')+'\n'+stderr);
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(this.workerError(Error(last)));}this.pending.clear();if(!ready)reject(Error(last||'worker exited'));};
   child.on('error',fail);child.on('exit',code=>fail(code?Error('exit code '+code):null));
   createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}if(m.type==='ready'){ready=true;this.runtimeInfo=m;this.onStatus({learningMessage:'实际运行：'+m.dictionary+' '+m.dictionaryVersion+' / SudachiPy '+m.engineVersion+' ＋本机 JMdict'});resolve();return;}const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.tokens);});
  });
  this.starting.catch(()=>{});return this.starting;
 }
 /* 2026-11-21 (user group: 「黒
ずんでいた」, 「見つ
めていた」, 「汗
ばんでいた」 wrapped by the game): a line break inside a sentence is the
    game's layout, not a word boundary; SudachiDict cut every word it ran through (黒 / ず / ん, 見 / つ / め). The sentence is tokenized
    without its line breaks and every token's start / end (code points) is mapped back onto the text as given; the breaks come back as
    blank tokens, so callers see the same text and indices as before. */
 async tokenizeWhole(text,options){
  const lineBreak=c=>c==='\u000d'||c==='\u000a';
  if(![...text].some(lineBreak))return this.tokenize(text,options);
  const chars=[...text],keep=[];chars.forEach((c,i)=>{if(!lineBreak(c))keep.push(i);});
  const flat=keep.map(i=>chars[i]).join('');if(!flat)return this.tokenize(text,options);
  const tokens=await this.tokenize(flat,options),at=k=>k>=keep.length?chars.length:keep[k],out=[];
  let pos=0;for(const t of tokens){const start=at(t.start),end=t.end>0?keep[Math.min(t.end,keep.length)-1]+1:start;
   if(start>pos){const gap=chars.slice(pos,start).join('');out.push({surface:gap,base_form:gap,normalized:gap,reading:'',pos:'空白',start:pos,end:start});}
   out.push({...t,start,end,surface:chars.slice(start,end).join('')});pos=end;}
  if(pos<chars.length){const gap=chars.slice(pos).join('');out.push({surface:gap,base_form:gap,normalized:gap,reading:'',pos:'空白',start:pos,end:chars.length});}
  return out;
 }
 /* names: read the running game's character names (the reader); other pages (daily news, examples, grammar counts)
    read the text without them. */
 async tokenize(text,{names=false}={}){
  /* the game's own readings (core/game-reading.cjs) apply to the reader page only, like names; they can grow while the game
     runs, so the ones found in this text are part of the cache key */
  const game=names&&typeof this.gameReadings==='function'?readingsIn(text,this.gameReadings(text)||{}):[];
  const key=(names?'names\u0000':'')+(game.length?JSON.stringify(game)+'\u0000':'')+text;
  if(this.cache.has(key))return this.cache.get(key);await this.ready();
  const tokens=await this.raw(text);
  /* 2026-11-23 (user: the speech button said わたくし and ぶん where furigana showed わたし and ふん): furigana, the speech
     button, lookup and cards all read these tokens, so the contextual readings (私 わたし, 10分 じゅっぷん) are settled here
     once instead of in the reader page only. Numbers first: JMdict would otherwise join the counter with what follows
     (10分だけ as 10 + 分だけ ぶんだけ, 3本の as 3 + 本の ほんの). */
  const plain=await this.strayAffixes(tokens);
  const own=names?unknownNames(this.withNames(gameTokens(plain,game))):plain;
  const corrected=contextual(text,this.readings.settle(contextReadings(this.dictionaryWords(numberTokens(own)))));this.cache.set(key,corrected);if(this.cache.size>200)this.cache.delete(this.cache.keys().next().value);return corrected;
 }
 /* SudachiDict tokens for a text as the worker gives them. */
 raw(text){return new Promise((resolve,reject)=>{const id=++this.serial,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('本地分词等待超时，请检查 Full 组件状态'));},45000);this.pending.set(id,{resolve,reject,timer});this.worker.stdin.write(JSON.stringify({id,text})+'\n');});}
 /* A noun-like suffix with no word before it, or a prefix with none after it, is the word itself (user, 2026-11-23):
    SudachiDict read そのうち上の二人 with 上 as the suffix ジョウ (理論上), いとしき人 with 人 as ニン (三人) and ばか者 with 者
    as シャ. A kana word, a mark or the line edge is no word to attach to, so the kanji takes the reading SudachiDict gives
    it on its own (上 ウエ, 人 ヒト, 者 モノ) when that is a common noun or an adjective. Productive suffixes stay: 的 and 風
    are 形状詞的 (ちゃん的には), a suffix after a 連用形 is the way of doing (さわり方 かた, 絡まれ方), one after a pronoun or an activity
    keeps its reading (あんた方, おでかけ中 ちゅう, しごと上 じょう), a prefix
    before more kana is a split word (小さき, 小じゃれた), and a lone reading that is a name or a particle
    (好 ヨシミ, 達 トオル, 宛 ズツ) is no word either. Judged on 44k real game lines. */
 async strayAffixes(tokens){
  if(!Array.isArray(tokens))return tokens;const out=[];this.alone??=new Map();
  const loose=t=>!t||/^[\p{Script=Hiragana}ー]+$/u.test(t.surface||'')||t.pos==='補助記号'||!String(t.surface||'').trim();
  const g=t=>Array.isArray(t?.grammar)?t.grammar:[];
  const stray=(t,before,after)=>g(t)[0]==='接尾辞'?g(t)[1]==='名詞的'&&loose(before)&&g(before)[0]!=='代名詞'&&g(before)[2]!=='サ変可能'&&!String(g(before)[5]).startsWith('連用形')&&!/^[\p{Script=Han}々]/u.test(after?.surface||''):
   g(t)[0]==='接頭辞'&&(!after||!after.surface.trim()||['補助記号','記号','助詞'].includes(g(after)[0]));
  for(let i=0;i<tokens.length;i++){
   const t=tokens[i];
   if(!t||!/[\p{Script=Han}々]/u.test(t.surface||'')||!stray(t,tokens[i-1],tokens[i+1])){out.push(t);continue;}
   if(!this.alone.has(t.surface)){const own=await this.raw(t.surface),o=own[0],k=g(o);this.alone.set(t.surface,own.length===1&&o.surface===t.surface&&o.reading&&(k[0]==='名詞'&&k[1]==='普通名詞'||k[0]==='形容詞')?o:null);if(this.alone.size>500)this.alone.delete(this.alone.keys().next().value);}
   const own=this.alone.get(t.surface);
   out.push(own&&own.reading!==t.reading?{...t,reading:own.reading,grammar:own.grammar,pos:own.pos,base_form:own.base_form,normalized:own.normalized,pitch:own.pitch||[],lexeme:own.lexeme||null}:t);
  }
  return out;
 }
 /* The running game's character names from VNDB (name-reading.cjs); null when no game is bound. Furigana made with the
    previous game's names is dropped; tokenize() reads the names after its last await, so a call still running when the
    game changes uses the new ones. */
 useNames(names){this.names=names instanceof Map?names:new Map();this.cache.clear();}
 /* fn(text) → {line, learned, script}: the running game's own readings (services/reader.cjs bindReadings); null when no game is bound */
 useGameReadings(fn){this.gameReadings=typeof fn==='function'?fn:null;this.cache.clear();}
 withNames(tokens){return nameTokens(tokens,this.names);}
 // Whole adjacent tokens that together spell one JMdict word with a single reading are that word: Sudachi split
 // 後一歩 into 後一 (ゴイチ) + 歩 (アユミ, a given name), so furigana and speech said ごいちあゆみ while the dictionary card
 // knew あといっぽ (user, 2026-11-03). Only when the joined guess differs from the dictionary reading; up to 4 tokens,
 // longest first, never across punctuation or a gap.
 dictionaryWords(tokens){
  if(!Array.isArray(tokens)||tokens.length<2)return tokens;this.load();const out=[];
  for(let i=0;i<tokens.length;i++){let best=null,stop=i;
   for(let j=Math.min(tokens.length,i+4)-1;j>i&&!best;j--){const part=tokens.slice(i,j+1);
    if(part.some((t,k)=>!t.surface?.trim()||t.pos==='補助記号'||t.readingSource==='game'||(k&&part[k-1].end!==t.start)))continue;
    const surface=part.map(t=>t.surface).join('');if(!/[\p{Script=Han}々]/u.test(surface))continue;
    const [reading,base]=this.idiomReading(part,surface);
    if(!reading||kana(part.map(t=>t.reading||'').join(''))===reading)continue;
    best={...tokens[i],surface,base_form:base,normalized:base,end:tokens[j].end,reading,reading_source:'JMdict 词语读音',subtokens:part};stop=j;}
   out.push(best||tokens[i]);i=stop;}
  return out;
 }
 /* The one JMdict reading of joined tokens, and the dictionary form it was found under. An idiom ending in a verb or an
    adjective is listed in its dictionary form: 性に合わない is 性に合う しょうにあう, which SudachiDict read せいにあわ
    (user, 2026-11-23). The inflected tail replaces the dictionary-form tail (あう → あわ) under a kanji stem that keeps its
    reading; 来る does not (来た き, 来ない こ), and a kana-only tail like なかっ has no stem to keep (気もない けもない). */
 idiomReading(part,surface){
  const exact=this.compoundReadings(surface);if(exact.length===1)return [exact[0],surface];if(exact.length||part.length<2)return [];
  const last=part.at(-1),g=last.grammar?.[0];if(g!=='動詞'&&g!=='形容詞'||last.grammar?.[4]==='カ行変格'||!last.base_form||last.base_form===last.surface)return [];
  let cut=0;while(cut<last.surface.length&&last.surface[cut]===last.base_form[cut])cut++;
  const from=last.base_form.slice(cut),to=last.surface.slice(cut);
  if(!/[\p{Script=Han}々]/u.test(last.surface.slice(0,cut))||!/^[\p{Script=Hiragana}]+$/u.test(from)||!/^[\p{Script=Hiragana}]*$/u.test(to))return [];
  const base=part.slice(0,-1).map(t=>t.surface).join('')+last.base_form,found=this.compoundReadings(base);
  if(found.length!==1||!found[0].endsWith(from))return [];
  return [found[0].slice(0,found[0].length-from.length)+to,base];
 }
 compounds(tokens){
  this.load();const output=[];
  for(let i=0;i<tokens.length;i++){
    let best=null,stop=i,surface=tokens[i].surface;
    const numeric=tokens[i].grammar?.[1]==='数詞'||/^[0-9０-９一二三四五六七八九十百千万]+$/.test(surface);
    if(numeric)for(let j=i+1;j<Math.min(tokens.length,i+5);j++){
      if(tokens[j-1].end!==tokens[j].start||!tokens[j].surface.trim())break;
      surface+=tokens[j].surface;
      const readings=this.compoundReadings(surface);
      if(readings.length===1){best={...tokens[i],surface,base_form:surface,normalized:surface,end:tokens[j].end,reading:readings[0],reading_source:'JMdict 复合词书写读音',subtokens:tokens.slice(i,j+1)};stop=j;}
    }
    output.push(best||tokens[i]);if(best)i=stop;
  }
  return output;
 }
 compoundReadings(surface){
  const entries=(this.index.get(surface)||[]).map(id=>this.byId.get(id));
  const headwords=entries.filter(e=>!e.spellings?.length||e.spellings[0]===surface);
  // A fully kanji compound can be a valid spelling variant of the same word.
  // Mixed spellings keep the headword rule so an inflected verb cannot borrow
  // the reading of a different verb that lists it as an alternative.
  const matches=headwords.length||!/^\p{Script=Han}+$/u.test(surface)?headwords:entries;
  return [...new Set(matches.flatMap(e=>e.readings).map(kana))];
 }
 load(){
  if(this.index)return;
  const root=require('./paths.cjs').resources,index=new Map(),byId=new Map(),english=new Map();
  for(const entry of JSON.parse(fs.readFileSync(path.join(root,'jmdict.json'),'utf8'))){byId.set(entry.id,entry);for(const key of [...entry.spellings,...entry.readings]){const ids=index.get(key)||[];ids.push(entry.id);index.set(key,ids);}}
  const backup=path.join(root,'jmdict.english.json'); // English senses for the English learner mode
  if(fs.existsSync(backup))for(const entry of JSON.parse(fs.readFileSync(backup,'utf8')))english.set(entry.id,entry);
  Object.assign(this,{index,byId,english});
 }
 adapt(entry,language){
  this.load();const selected=language==='en'?(this.english.get(entry.id)||entry):(this.byId.get(entry.id)||entry);
  return {...selected,pos:language==='en'?selected.pos:selected.pos.map(chinesePos),definition_groups:definitionGroups(selected)};
 }
 adaptResult(result,language){if(Array.isArray(result))return result.map(r=>this.adaptResult(r,language));if(!result)return result;return {...result,entries:(result.entries||[]).map(e=>this.adapt(e,language)),related_entries:(result.related_entries||[]).map(e=>this.adapt(e,language))};}
 /* #1111 (user 2026-11-24: 异表记 must not merge words only because they read alike): the index holds readings too, so a word
    written in kana (きる, ひきちぎる) found every entry read so, and the most frequent homophone (着る for 切る) headed the card. A
    word is now first found by a spelling an entry lists, the tokenizer's lemma included (Sudachi normalizes ひきちぎる to 引き千切る,
    服をきる to 着る); entries that only share the reading follow, marked match:'reading' (the card lists them as homophones, never
    as other spellings of the word). Only when no entry is spelled so do readings find the word, as before. */
 entries(token,language){
  this.load();const keys=[token.derived_from,token.lookup_from,token.base_form,token.normalized,token.surface].filter(Boolean);
  const spelled=key=>(this.index.get(key)||[]).filter(id=>this.byId.get(id)?.spellings?.includes(key));
  let ids=[],homophones=[];for(const key of keys){ids=spelled(key);if(ids.length)break;}
  if(!ids.length)for(const key of keys){ids=this.index.get(key)||[];if(ids.length)break;}
  else{const written=keys.find(k=>/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(k));if(written)homophones=(this.index.get(written)||[]).filter(id=>!ids.includes(id));}
  const reading=kana(token.reading||''),order=list=>[...list].sort((a,b)=>{
   const left=this.byId.get(a),right=this.byId.get(b),match=e=>e.readings.some(r=>kana(r)===reading)?0:1;
   return match(left)-match(right)||(left.freq_rank||999999)-(right.freq_rank||999999);
  });
  const reached=new Set(homophones);ids=[...order(ids),...order(homophones)];
  return ids.slice(0,20).map(id=>{if(reached.has(id))return {...this.entryFor(id,token,language),match:'reading'};return this.entryFor(id,token,language);});
 }
 entryFor(id,token,language){
  const entry=this.adapt(this.byId.get(id),language),conjugation=token.grammar?.[4]||'';
  if(language==='zh'&&/上一段|下一段|五段/.test(conjugation)){
   const match=conjugation.match(/(上一段|下一段|五段)(?:-(.+))?/),label=match[1]+'动词（'+(match[1]==='五段'?'一类':'二类')+'动词'+(match[2]?' · '+match[2]:'')+'）';
   return {...entry,pos:entry.pos.map(p=>/一段动词|五段动词/.test(p)?label:p)};
  }return entry;
 }
 // A noun that takes する (JMdict "takes the aux. verb suru", or Sudachi サ変可能) followed by する is one サ変 verb:
 // 検分して was explained as the noun 検分 plus する (user, 2026-11-03). Nouns that cannot take する stay separate.
 suruNoun(t,n){if(t?.pos!=='名詞'||n?.pos!=='動詞'||n.base_form!=='する'||n.start!==t.end)return false;if(t.grammar?.[2]==='サ変可能')return true;
  return (this.index?.get(t.base_form)||[]).some(id=>this.byId.get(id).pos.some(p=>/takes the aux. verb suru/.test(p)));}
 groups(tokens){
  const groups=[];
  for(let i=0;i<tokens.length;i++){
   let t=tokens[i];if(!t.surface.trim())continue;
   if(this.suruNoun(t,tokens[i+1])){const n=tokens[i+1];t={...n,start:t.start,surface:t.surface+n.surface,base_form:t.base_form+'する',normalized:(t.normalized||t.base_form)+'する',reading:(t.reading||'')+(n.reading||''),lookup_from:t.base_form,suru_noun:t};i++;}let end=t.end,surface=t.surface,aux=[],parts=[t];
   if(['動詞','形容詞','助動詞'].includes(t.pos))while(i+1<tokens.length){const n=tokens[i+1],connect=n.pos==='助詞'&&['て','で','ば'].includes(n.surface),support=parts.some(p=>['て','で'].includes(p.surface))&&n.pos==='動詞'&&n.grammar?.[1]==='非自立可能'&&['いる','居る','おく','置く','しまう','みる','見る','くる','来る','いく','行く'].includes(n.base_form);if(n.start!==end||!(n.pos==='助動詞'||connect||support||t.pos==='形容詞'&&n.pos==='形容詞'&&n.grammar?.[1]==='非自立可能'&&n.base_form==='ない'))break;i++;end=n.end;surface+=n.surface;aux.push(n.base_form);parts.push(n);}
   const group={...t,end,surface,aux,parts};if(!this.index?.has(t.base_form)&&/[上下]一段/.test(t.grammar?.[4]||'')&&t.base_form.endsWith('る')){const chars=[...t.base_form],e=chars.at(-2),map={'え':'う','け':'く','げ':'ぐ','せ':'す','て':'つ','ね':'ぬ','べ':'ぶ','め':'む','れ':'る'},last=map[e];if(last){const root=chars.slice(0,-2).join('')+last;const ids=this.index?.get(root)||[];if(ids.some(id=>this.byId.get(id).pos.some(p=>p.includes('Godan verb')))){group.derived_from=root;group.derivation='potential';}}}
   groups.push(group);
  }return groups;
 }
 /* #1131 (user 2026-11-24: the speech button, the furigana and the lookup card each said another reading): the line is read
    as furigana and lookup read it, without the game's line breaks (tokenizeWhole), so a word the game wrapped is one word here too. */
 async word(args,entryId,options){
  const result=await this.request('lookup_exact',args,'zh',options),tokens=await this.tokenizeWhole(args.text,options),token=tokens.find(t=>t.start===args.start&&t.end===args.end),head=tokens.find(t=>t.start===args.start),entry=result.entries?.find(e=>e.id===entryId)||result.entries?.[0],m=result.morphology||{};
  let chosen=token,reading=token?.reading||m.reading||'',surface=result.surface,pronunciationForm='surface';
  if(!chosen&&head?.lexeme?.base===m.base&&entry?.readings?.some(r=>kana(r)===kana(head.lexeme.reading))){chosen=head;reading=head.lexeme.reading;surface=m.base;pronunciationForm='lemma';}
  /* 2026-11-19 (user, 千恋＊万花: うたたね could not be mined, 「当前词没有确定读音」): Sudachi cut the line うたた｜ねし, so a selection
     ending inside a token had no reading. selectedReading(): a word written only in kana reads as written; with kanji, the
     dictionary reading when the entry is spelled as selected and has one reading (before the joined token readings: いつの間にか
     is いつのまにか, not いつのあいだにか). Nothing else: a token piece is never used, a rare word without an entry stays unread. */
  const selected=[...args.text].slice(args.start,args.end).join(''),fixed=!chosen?selectedReading(selected,entry):null;if(fixed){reading=fixed.reading;surface=selected;pronunciationForm=fixed.form;}
  // A selection spanning several tokens (e.g. 木曜日の空) reads as the sentence-context readings joined in order.
  let phrase=false;if(!chosen&&!fixed){const inside=tokens.filter(t=>t.start>=args.start&&t.end<=args.end).sort((a,b)=>a.start-b.start);if(inside.length>1&&inside[0].start===args.start&&inside.at(-1).end===args.end&&inside.every((t,i)=>i===0||inside[i-1].end===t.start)&&inside.every(t=>t.reading||!/[一-龯々]/.test(t.surface))){reading=inside.map(t=>t.reading||t.surface).join('');surface=[...args.text].slice(args.start,args.end).join('');phrase=true;pronunciationForm='phrase';}}
  // Separate digit tokens lose the counter pronunciation in a multi-digit minute count.
  const minute = /^([1-9][0-9]?)分$/u.exec(selected.normalize('NFKC'));
  if (minute) {
    const n = Number(minute[1]), tens = Math.floor(n / 10), ones = n % 10;
    const digits = ['', 'イチ', 'ニ', 'サン', 'ヨン', 'ゴ', 'ロク', 'ナナ', 'ハチ', 'キュウ'];
    const minutes = ['ジュップン','イップン','ニフン','サンプン','ヨンプン','ゴフン','ロップン','ナナフン','ハップン','キュウフン'];
    const fraction = [...args.text][args.end] === 'の' && tokens.some(t=>t.start===args.end+1 && t.grammar?.[1]==='数詞');
    const prefix = tens > 1 ? digits[tens] : '';
    reading = fraction ? prefix + (tens ? 'ジュウ' : '') + digits[ones] + 'ブン'
                       : prefix + (tens && ones ? 'ジュウ' : '') + minutes[ones];
    surface = selected; chosen = null; phrase = true; pronunciationForm = 'phrase';
  }
  // A VNDB character name is the reading even where the dictionary entry is another word (希 まれ for Nozomi).
  /* #1131: the word's own token is what the furigana shows, so the speech button says that reading even when the card's
     dictionary entry spells it otherwise; only the lemma path (a token the selection does not match) is checked against the entry */
  const ambiguous=!reading||!!chosen?.reading_ambiguous||!phrase&&!fixed&&!(chosen&&chosen===token)&&chosen?.readingSource!=='name'&&chosen?.readingSource!=='game'&&!!entry&&!entry.readings?.some(r=>kana(r)===kana(reading));
  /* A piece of a number word (分 of 10分): the furigana reads the whole word (じゅっぷん), so the speech button says that word;
     the card keeps the selected word. */
  const number=!token&&tokens.find(t=>(t.readingSource==='number'||t.readingSource==='name'||t.readingSource==='game')&&t.start<=args.start&&args.end<=t.end);
  const spoken=number?{surface:number.surface,reading:number.reading,pitch:[],ambiguous:false,...(number.parts?{parts:number.parts}:{})}:null;
  return {...(spoken?{spoken}:{}),...(chosen?.parts?{parts:chosen.parts}:{}),surface,clickedSurface:result.surface,base:m.base||result.surface,reading,pitch:chosen?.pitch||[],pitchSource:chosen?.pitch_source||(phrase?'词组 · 音调由语音引擎估计':'UniDic 未匹配 · 音调由语音引擎估计'),pronunciationForm,ambiguous,pos:m.wordClass||entry?.pos?.join('、')||'',meaning:entry?.definition_groups?.map(g=>g.text).join('\n')||entry?.definitions?.join('\n')||'',sentence:args.text};
 }

 async request(command,args,language='zh',options){
  const text=args.text;if(typeof text!=='string'||[...text].length>4000)throw Error('无效查词文本');
  const tokens=await this.tokenizeWhole(text,options);if(command==='tokenize_text')return tokens;
  this.load();const groups=this.groups(tokens).flatMap(t=>{
    const found=[t.base_form,t.normalized,t.surface].some(k=>this.index.has(k));
    return !found&&t.subtokens?.length>1?this.groups(t.subtokens):[t];
  });
  const make=t=>{const morphology=conjugation(t,language);return {start:t.start,end:t.end,surface:t.surface,entries:this.entries(t,language),related_entries:[],morphology,deconjugated_from:morphology.forms.length?[morphology.forms.join(' · '),morphology.rules.join('；')].filter(Boolean).join('｜'):null};};
  if(command==='scan_sentence')return groups.map(make).filter(r=>r.entries.length);
  let group=command==='lookup_exact'?groups.find(t=>t.start===args.start&&t.end===args.end):groups.find(t=>args.position>=t.start&&args.position<t.end);
  /* 2026-11-21 (user group, 「全身はじっとりと汗
ばんでいた」 wrapped after 汗: 汗 and ばんで looked up apart, 汗ばむ never found): SudachiDict Full
     splits 汗ばむ into 汗 + the suffix ばむ with or without the line break, and the merge below only joined surfaces (汗ばん is no
     headword). A run of groups is also tried as its earlier surfaces + the last group's dictionary form (汗 + ばむ); a line break or
     blank inside the run (the game's own wrap) is skipped, never a word boundary. */
  const blankGroup=t=>t.pos==='空白'||/^[\s　]+$/u.test(t.surface||'');
  const lemmaOf=(run)=>{const last=run[run.length-1],base=last.base_form||last.surface;return run.slice(0,-1).map(t=>t.surface).join('')+base;};
  if(command==='lookup_at_position'&&group){const index=groups.indexOf(group);let best=group;for(let a=Math.max(0,index-5);a<=index;a++){if(blankGroup(groups[a]))continue;let surface='',parts=[],run=[];for(let z=a;z<Math.min(groups.length,a+8);z++){const t=groups[z];if(z>a&&groups[z-1].end!==t.start&&[...text].slice(groups[z-1].end,t.start).join('').trim()||t.pos==='補助記号')break;if(blankGroup(t))continue;surface+=t.surface;run.push(t);parts.push(...(t.parts||[t]));if(surface.length>60)break;
    if(z<index||surface.length<=best.surface.length)continue;const key=this.index.has(surface)?surface:run.length>1&&this.index.has(lemmaOf(run))?lemmaOf(run):'';if(!key)continue;
    const readings=[...new Set(this.index.get(key).flatMap(id=>this.byId.get(id).readings))];best={...groups[a],start:groups[a].start,end:t.end,surface,base_form:key,normalized:key,reading:readings.length===1?readings[0]:parts.map(p=>p.reading||'').join(''),parts,aux:[]};}}group=best;}
  if(command==='lookup_at_position'&&Number(args.skip)>0)return null;
  if(command==='lookup_exact'){
   const length=[...text].length;if(!Number.isSafeInteger(args.start)||!Number.isSafeInteger(args.end)||args.start<0||args.end<=args.start||args.end>length)throw Error('无效选区');
   const surface=[...text].slice(args.start,args.end).join(''),inside=groups.filter(t=>t.end>args.start&&t.start<args.end);let analysis=inside.map(make),wholeMatch=!!group||this.index.has(surface),exact=group?make(group):make({surface,base_form:surface,start:args.start,end:args.end,aux:[],parts:[]});
   /* a selection over the game's line break (汗 / ばんで) or a stem + conjugated suffix: the run's surfaces + its last word's dictionary form */
   if(!exact.entries.length){const run=inside.filter(t=>!blankGroup(t));let key='';for(let k=run.length;k>=2&&!key;k--){const c=lemmaOf(run.slice(0,k));if(this.index.has(c))key=c;}const flat=surface.replace(/[\s　]+/gu,'');const k=this.index.has(flat)&&flat!==surface?flat:key&&this.index.has(key)?key:'';if(k){exact=make({surface,base_form:k,normalized:k,start:args.start,end:args.end,parts:run.flatMap(t=>t.parts||[t])});exact.match_note=k===flat?'':'辞书原形：'+k;wholeMatch=true;}}
   if(!exact.entries.length){const expressive=surface.replace(/っ(?=[か-こさ-そた-とは-ほ])/gu,'');if(expressive!==surface&&this.index.has(expressive)){exact=make({surface,base_form:expressive,start:args.start,end:args.end,parts:inside.flatMap(t=>t.parts||[t])});exact.match_note='口语促音强调写法；辞书原形：'+expressive;wholeMatch=true;}}
   if(!exact.entries.length)exact.entries=[...new Map(analysis.flatMap(a=>a.entries).map(e=>[e.id,e])).values()].slice(0,20);
   exact.selection_analysis={surface,exact:wholeMatch,parts:analysis,source:'SudachiDict Full ＋ JMdict（本地）'};return exact;
  }
  return group?make(group):null;
 }
 stop(){this.closed=true;this.worker?.stdin.end();this.installer?.kill();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('本地辞书已关闭'));}this.pending.clear();}
}
/* The reading a selection has by itself (see word()): kana as written, or the one dictionary reading of an entry spelled so. */
function selectedReading(text,entry){const t=String(text||'').trim();if(!t)return null;if(/^[\p{Script=Hiragana}\p{Script=Katakana}ー～〜]+$/u.test(t))return {reading:t,form:'kana'};
 const readings=[...new Set((entry?.readings||[]).map(kana).filter(Boolean))];return entry?.spellings?.includes(t)&&readings.length===1?{reading:readings[0],form:'dictionary'}:null;}
module.exports={LocalLearning,chinesePos,selectedReading};
