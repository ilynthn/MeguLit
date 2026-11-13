/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 学习 → 语法 (2026-11-11): N5 → N0 levels, N5 complete, made to be played with (user: 要可互动):
   - 日语核心体系总览: a map of nine nodes; click to open one, its N5 points light up once learned, a point opens its lesson
   - 活用演示台: pick a verb or adjective, switch ます／て／ない／た, only the ending moves and is marked
   - 助词放置: drag or tap a particle into the gap; the right one lights the line and shows its translation
   - real galgame lines: tap or hover the highlighted grammar for an explanation, 朗读 reads the line aloud
   - exercises: instant feedback; a wrong answer shows how it attaches and gives another line of the same kind
   Every line from a game says the game and the minute it was read. */
import {N5,LEVELS,GROUPS,blankOf,choicesFor} from './grammar-n5.js';
import {LEVEL_LIST,LEVEL_GROUPS,levelPoints,findHit} from './grammar-levels.js';
/* N4 → N0 (2026-11-11): every level is a list of points; N5 keeps its own file, the others are in grammar-levels.js */
const basePoints=level=>level==='N5'?N5:levelPoints(level);
export const pointsOf=level=>[...basePoints(level),...ankiPoints(level)];
export const ALL_POINTS=[...N5,...LEVEL_LIST.flatMap(levelPoints)];
export const levelOf=point=>point.level||(N5.includes(point)?'N5':LEVEL_LIST.find(l=>levelPoints(l).includes(point))||'N5');
const nodeFor=p=>p.node||nodeOf(p.id),nodesFor=p=>POINT_NODES[p.id]||[p.node].filter(Boolean);
import {MAP,POINT_NODES,nodeOf} from './grammar-map.js';
import {WORDS,FORMS,FORM_LABEL,conjugate} from './conjugate.js';
import {readTime} from './read-time.js';
import {levelName} from './learning-level.js';
import {stamp,floatGain,quote,manaHTML,albumHTML} from './rewards.js';
import {pointerDrag} from './drag.js';
import {goalBarHTML,orderByGoal} from './learning-goal.js';
import {howToHTML,fillRuby} from './grammar-howto.js';
import {pageNav} from './page-nav.js';
export const grammarMessages={
 zh:{level:'等级',soon:'这一级的课程还在写，先把 N5 学扎实',done:'已学完',progress:'完成度',accuracy:'练习正确率',noAnswers:'还没做练习',back:'← 课程列表',form:'接法',uses:'常见用法',pitfalls:'容易错的地方',fromGames:'你玩过的游戏里',
  builtin:'通用例句',builtinHelp:'你读过的台词里还没找到这个语法，先看这几句',practice:'练习',check:'选一个填进空里',right:'答对了',wrong:'不对，正确答案是',next:'下一题',retry:'再练一句同类台词',markDone:'标记为已学完',unmark:'取消已学完',
  anki:'加入 Anki',ankiDone:'已加入 Anki',ankiFail:'加入 Anki 失败',counting:'正在从读过的台词里找例句……',real:'句来自你的游戏',human:'汉化 / 官方译文',machine:'机器翻译',noTranslation:'暂无译文',finished:'这一组练完了',
  script:'剧本',map:'日语核心体系总览',mapLead:'先看全局：一句日语由哪几块拼成，每个 N5 语法点在哪一块。点开一块看看',mapOpen:'打开体系地图',onMap:'在体系地图上',learnedOf:'已学',conj:'活用演示台',conjLead:'选一个词，切换变形，只有词尾会动',
  pickWord:'选一个词',reading:'读音',particles:'助词放置',particlesLead:'把助词拖进空位，或者先点助词再点空位',placeHere:'放这里',notHere:'放不进这里：',speak:'朗读',speakFail:'朗读需要语音引擎（设置 → 语音）',explain:'点开看解释',
  close:'关闭',correctForm:'正确的接法',lit:'句子亮了'},
 ja:{level:'レベル',soon:'このレベルの講座は準備中です。まずは N5 を固めましょう',done:'学習済み',progress:'達成度',accuracy:'練習の正答率',noAnswers:'まだ練習していません',back:'← 講座一覧',form:'接続',uses:'よくある使い方',
  pitfalls:'間違えやすい点',fromGames:'あなたが遊んだゲームから',builtin:'基本の例文',builtinHelp:'読んだセリフにはまだこの文法が見つかりません。まずはこちらを',practice:'練習',check:'空欄に入るものを選んでください',right:'正解',wrong:'残念、正解は',
  next:'次の問題',retry:'同じ種類のセリフでもう一問',markDone:'学習済みにする',unmark:'学習済みを取り消す',anki:'Anki に追加',ankiDone:'Anki に追加しました',ankiFail:'Anki に追加できませんでした',counting:'読んだセリフから例文を探しています……',
  real:'文があなたのゲームから',human:'翻訳グループ／公式訳',machine:'機械翻訳',noTranslation:'訳文なし',finished:'このセットは終わりです',script:'シナリオ',map:'日本語の全体マップ',mapLead:'まず全体像から。文がどんな部品でできていて、N5 の文法がどこにあるか。ブロックを開いてみましょう',
  mapOpen:'全体マップを開く',onMap:'マップ上の位置',learnedOf:'学習済み',conj:'活用ラボ',conjLead:'語を選んで形を切り替えると、語尾だけが動きます',pickWord:'語を選ぶ',reading:'読み',particles:'助詞パズル',particlesLead:'助詞を空欄にドラッグ、または助詞→空欄の順にタップ',
  placeHere:'ここに置く',notHere:'ここには入りません：',speak:'読み上げ',speakFail:'読み上げには音声エンジンが必要です（設定 → 音声）',explain:'タップで解説',close:'閉じる',correctForm:'正しい接続',lit:'文が光りました'},
 en:{level:'Level',soon:'Lessons for this level are on the way; get N5 solid first',done:'Learned',progress:'Progress',accuracy:'Exercise accuracy',noAnswers:'No exercises yet',
  back:'← All lessons',form:'How it attaches',uses:'Common uses',pitfalls:'Easy mistakes',fromGames:'From games you played',builtin:'Basic examples',builtinHelp:'Your lines do not show this point yet, so start with these',
  practice:'Practice',check:'Pick what fills the blank',right:'Correct',wrong:'Not quite, the answer is',next:'Next',retry:'Another line of the same kind',markDone:'Mark as learned',
  unmark:'Unmark learned',anki:'Add to Anki',ankiDone:'Added to Anki',ankiFail:'Could not add to Anki',counting:'Looking for examples in the lines you read…',real:'lines from your games',
  human:'Fan / official translation',machine:'Machine translation',noTranslation:'No translation',finished:'Set finished',script:'script',map:'Map of Japanese grammar',
  mapLead:'The big picture first: the parts a Japanese sentence is built from, and where each N5 point sits. Open a block',mapOpen:'Open the map',onMap:'On the map',
  learnedOf:'learned',conj:'Conjugation lab',conjLead:'Pick a word and switch forms; only the ending moves',pickWord:'Pick a word',reading:'Reading',particles:'Particle puzzle',
  particlesLead:'Drag a particle into the gap, or tap a particle then the gap',placeHere:'Place here',notHere:'Does not fit here: ',speak:'Read aloud',speakFail:'Reading aloud needs the voice engine (Settings → Voice)',
  explain:'Tap for the explanation',close:'Close',correctForm:'How it attaches',lit:'The line lights up'}
};
/* 2026-11-11 redesign (user: hard to read, slow, reloads on return, beginners do not know how to start): a lesson is a
   guided path of six short steps, practice is dragging the answer into the gap, and the teacher speaks like Megumin. */
const EXTRA={
 zh:{right:'答对了！爆裂命中！',check:'把答案拖进空里（点一下也行）',dropHere:'拖到这里',steps:{intro:'认识它',form:'怎么接',play:'动手玩',uses:'怎么用',games:'你的台词',practice:'拖进空里'},prev:'← 上一步',nextStep:'下一步',
  finishStep:'学完了，标记掌握！',stepOf:'第 {n} / {t} 步',startHere:'从这里开始',nextLesson:'下一课',allDone:'N5 全部学完了！',continueLesson:'开始这一课',myLevel:'我的水平',levelProgress:'本级进度',nextLevel:'接着学 {l}',allDoneLead:'这一级学完了：接着学下一级，或点下面任一课复习',changeLevel:'修改',noLevel:'还没选',
  split:'拆开看看',merge:'合起来',splitLead:'点「拆开看看」，看这个语法在句子里占哪一块',wrongQuip:'唔……魔力回路接错了！',pathLead:'按顺序一课一课走，每课六小步，大约五分钟'},
 ja:{steps:{intro:'知る',form:'つなぎ方',play:'触ってみる',uses:'使い方',games:'あなたのセリフ',practice:'ドラッグ'},check:'答えを空欄へドラッグ（タップでも可）',dropHere:'ここへ',prev:'← 戻る',nextStep:'次へ',
  finishStep:'学習済みにする',stepOf:'{n} / {t}',startHere:'ここから',nextLesson:'次の課',allDone:'N5 完了！',continueLesson:'始める',myLevel:'レベル',levelProgress:'進捗',nextLevel:'{l} へ進む',allDoneLead:'このレベルは全部終わりました。次のレベルへ進むか、下の課を開いて復習しましょう',changeLevel:'変更',noLevel:'未設定',split:'分解する',
  merge:'戻す',splitLead:'文のどこに文法があるか見てみよう',wrongQuip:'惜しい！',pathLead:'一課ずつ、六つの小さなステップで'},
 en:{steps:{intro:'Meet it',form:'Attach',play:'Play',uses:'Use',games:'Your lines',practice:'Drag in'},check:'Drag the answer into the gap (or tap it)',dropHere:'Drop here',
  prev:'← Back',nextStep:'Next',finishStep:'Mark as learned',stepOf:'Step {n} / {t}',startHere:'Start here',nextLesson:'Next lesson',allDone:'All of N5 done!',continueLesson:'Start',
  myLevel:'My level',levelProgress:'Progress',nextLevel:'Go on to {l}',allDoneLead:'Every lesson of this level is done. Go on to the next level, or open any lesson below to review',changeLevel:'Change',noLevel:'Not set',split:'Take it apart',merge:'Put back',splitLead:'See which part of the line is the grammar',wrongQuip:'Not quite!',
  pathLead:'One lesson at a time, six short steps each'}
};
for(const l of Object.keys(EXTRA))Object.assign(grammarMessages[l],EXTRA[l]);
export const STEPS=['intro','form','play','uses','games','practice'];
const GROUP_FLAVOR={particle:'助词就是咒文里的符文——贴错一个位置，整发魔法都会炸偏！',form:'活用就是给词换装备：词干不动，只换词尾。看清规律，变形就是一瞬间的事！'};
/* The opening line: Megumin introduces the point and, when your reading has it, the games you met it in. */
export function meguminIntro(point,real,locale){
 const t=loc(point.title,locale),games=[...new Set((real||[]).map(e=>e.title).filter(Boolean))];
 if(locale==='en')return games.length?`I am Megumin! Today's spell: ${t}. You have already met it in ${games.slice(0,2).join(' and ')}, so we practise with your own lines.`:`I am Megumin! Today's spell: ${t}. No lines from your games yet, so we start with mine.`;
 if(locale==='ja')return games.length?`我が名はめぐみん！今日の魔法は「${t}」。『${games.slice(0,2).join('』『')}』でもう出会っているはず！`:`我が名はめぐみん！今日の魔法は「${t}」。まずは基本の例文から！`;
 const open=`吾名惠惠！红魔族第一的魔法使，今天传授你的禁咒是——「${t}」！`;
 const hook=games.length?`其实你早就见过它了：在《${games.slice(0,2).join('》和《')}》里，它至少出场了 ${real.length} 次。待会儿就拿你自己读过的台词来练！`:'你的游戏记录里还没捉到它——先用我准备的例句练手，之后玩 gal 时留意它出场！';
 return `${open}${GROUP_FLAVOR[point.group]||'这是拼出一句话的基础魔法阵之一，记住它，台词会突然好懂很多！'}${hook}`;
}
/* The lesson to start from: the first N5 point not learned yet. */
export function nextPoint(prog,points=N5){return points.find(p=>!prog?.[p.id]?.learned)||null;}
const PARTICLES=['は','が','を','に','で','へ','と','も','の'],PARTICLE_POINT={'は':'wa','が':'ga','を':'wo','に':'ni','で':'de','へ':'he','と':'to','も':'mo','の':'no'};
const CONJ_POINTS={masu:['godan','ichidan','suru','kuru'],te:['godan','ichidan','suru','kuru'],nai:['godan','ichidan','suru','kuru'],ta:['godan','ichidan','suru',
 'kuru'],iadj:['i'],naadj:['na']};
const CONJ_FORM={masu:'masu',te:'te',nai:'nai',ta:'ta',iadj:'nai',naadj:'nai'};
const pct=v=>`${Math.round((Number(v)||0)*100)}%`;
const loc=(o,l)=>o?.[l]||o?.zh||'';
const motion=()=>typeof matchMedia!=='function'||!matchMedia('(prefers-reduced-motion: reduce)').matches;
const pointById=id=>ALL_POINTS.find(p=>p.id===id)||LEVELS.flatMap(ankiPoints).find(p=>p.id===id);
/* A line with the point highlighted; the highlight is a button that opens the explanation. */
export function highlight(text,start,end,esc,pointId=''){const c=[...String(text||'')];return esc(c.slice(0,start).join(''))+`<mark class="gm-hl"${pointId?` role="button" tabindex="0" data-explain="${esc(pointId)}"`:''}>`+esc(c.slice(start,
 end).join(''))+'</mark>'+esc(c.slice(end).join(''));}
export function builtinExamples(point){return point.builtin.map(b=>{const h=[...b.hl],at=b.ja.indexOf(b.hl),start=at<0?0:[...b.ja.slice(0,at)].length;return {text:b.ja,
 start,end:start+h.length,translation:b.zh,translationSource:'',origin:'builtin',title:'',readAt:null};});}
/* Exercises: blanks cut from real lines first (only where the blank is one of the point's choices), built-in after. */
export function exercisesFor(point,real,count=4){
 const out=[];for(const e of [...(real||[]),...builtinExamples(point)]){if(out.length>=count)break;
  if(point.hits){const h=findHit(point,e.text);if(!h||out.some(x=>x.text===e.text))continue;const n=[...e.text].length+out.length;out.push({...e,start:h.start,end:h.end,
   blankStart:h.start,blankEnd:h.end,answer:h.text,choices:choicesFor({choices:[h.text,...point.wrong]},h.text,n)});continue;}
  const b=blankOf(point,e.text,e.start,e.end);if(!point.choices.includes(b.answer))continue;if(out.some(x=>x.text===e.text))continue;
  out.push({...e,blankStart:b.start,blankEnd:b.end,answer:b.answer,choices:choicesFor(point,b.answer,[...e.text].length+out.length)});}
 return out;
}
/* Gap sentences for the particle puzzle: lines whose blank is a particle. */
export function particleGaps(point,real,count=3){return exercisesFor(point,real,count).filter(q=>PARTICLES.includes(q.answer));}
export function sourceLabel(e,w,locale){const parts=[];if(e.title)parts.push(e.title);if(e.origin==='script')parts.push(w.script);const t=readTime(e.readAt,locale,
 {by:e.readBy});if(t)parts.push(t);return parts.join(' · ');}
const trLabel=(e,w)=>e.translationSource==='group'||e.translationSource==='official'?w.human:e.translationSource==='machine'?w.machine:'';
function exampleHTML(e,i,{w,esc,locale,pointId,anki=true}){
 const tr=e.translation?`<p class="gm-tr">${esc(e.translation)}<small>${esc(trLabel(e,w))}</small></p>`:e.origin==='builtin'?'':`<p class="gm-tr gm-none">${esc(w.noTranslation)}</p>`;
 const src=sourceLabel(e,w,locale),ankiBtn=anki&&e.origin!=='builtin'?`<button type="button" class="gm-link" data-anki="${i}">${esc(w.anki)}</button>`:'';
 return `<li class="gm-ex"><p class="gm-ja" lang="ja">${highlight(e.text,e.start,e.end,esc,pointId)}</p>${tr}<div class="gm-ex-meta"><span>${esc(src)}</span><span class="gm-ex-actions"><button type="button" class="gm-link" data-speak="${esc(e.text)}">${esc(w.speak)}</button>${ankiBtn}</span></div></li>`;
}
/* megu-edit beats (2026-11-11, user: 用 megu-edit 做排版和特效): single-frame invert, short RGB-split glitch, expo-out push,
   focus pull and 1 char/frame typing with a ▮ block. Only on a user action, never as filler; all off with reduced motion. */
const EXPO='cubic-bezier(.16,1,.3,1)';
export const fx={
 invert:el=>{if(!el||!motion())return;el.animate([{filter:'invert(1)'},{filter:'invert(1)'},{filter:'none'}],{duration:70,easing:'steps(1,end)'});},
 glitch:el=>{if(!el||!motion())return;el.animate([{transform:'translateX(0)',textShadow:'none'},{transform:'translateX(-3px)',textShadow:'3px 0 #c8323c,-3px 0 #fff'},
  {transform:'translateX(2px)',textShadow:'-2px 0 #c8323c,2px 0 #fff'},{transform:'none',textShadow:'none'}],{duration:130,easing:'steps(3,end)'});},
 push:el=>{if(!el||!motion())return;el.animate([{transform:'scale(1.07)'},{transform:'scale(1)'}],{duration:520,easing:EXPO});},
 focus:el=>{if(!el||!motion())return;el.animate([{filter:'blur(6px)',opacity:.3,transform:'scale(1.02)'},{filter:'none',opacity:1,transform:'none'}],{duration:420,
  easing:EXPO});},
 type:(el,text)=>{if(!el)return;if(!motion()){el.textContent=text;return;}const c=[...text];let n=0;el.textContent='▮';const tick=()=>{n+=2;el.textContent=c.slice(0,
  n).join('')+(n<c.length?'▮':'');if(n<c.length)requestAnimationFrame(tick);};requestAnimationFrame(tick);},
 burst:el=>{if(!el||!motion())return;const b=document.createElement('span');b.className='gm-burst';b.setAttribute('aria-hidden','true');el.appendChild(b);b.animate([{
  opacity:1,transform:'translate(-50%,-50%) scale(.4)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.6)'}],{duration:380,easing:EXPO}).finished.then(()=>b.remove(),
  ()=>b.remove());}
};
/* Grammar cards from the learner's own Anki (蓝宝书 and decks with the same fields), read at run time by
   services/bluebook.cjs and never shipped. A card whose form is already a lesson is merged into it (its explanation,
   attachment and example lines join that lesson); the others become lessons of their own in a 「来自你的 Anki」 group,
   taught the same way: six steps, your own lines first, drag the form into the gap. */
let ANKI=[];
export const ANKI_DECK='https://ankiweb.net/shared/info/1748349244';
/* The offer under the hero: where to get the deck (AnkiWeb, the learner downloads it), or what was read from it. */
export function ankiBannerHTML(anki,{esc}){
 if(anki?.available)return `<p class="gm-anki-on"><i></i>已读取你的 Anki：蓝宝书等语法卡 ${anki.points.length} 条，已并进各级课程</p>`;
 /* the deck is there (or Anki is) but could not be read: say why and offer a retry, not a download */
 if(anki&&(anki.decks?.length||anki.errors?.length&&anki.profiles?.length))return `<section class="gm-anki-offer"><div><b>${anki.decks?.length?`在你的 Anki 里找到了「${esc(anki.decks[0])}」，但这次没读出来`:'找到了你的 Anki，但没读出语法卡'}</b><p>不用重新下载。多半是 Anki 正在写入或文件被占用：关掉 Anki 再点「重试」；如果装了 AnkiConnect，开着 Anki 点「重试」也行。</p><p class="gm-anki-note">原因：${esc((anki.errors||[]).slice(0,3).join('；')||'牌组字段不是蓝宝书格式')}</p></div><div class="gm-anki-actions"><button type="button" class="primary" data-anki-reload>重试</button>${anki.decks?.length?'':'<button type="button" class="secondary" data-anki-get>没有牌组？下载并导入</button>'}</div></section>`;
 return `<section class="gm-anki-offer"><div><b>想要更多课？把蓝宝书 N5–N1 语法（约 760 条）加进来</b><p>点「下载并自动导入」会打开 AnkiWeb 上的共享牌组「【超值白金版】蓝宝书语法 N1–N5」，在页面上点 Download 就好——MeguLit 发现下载完成后会自动导入你的 Anki，每一条都会变成和这里一样的互动课。</p><p class="gm-anki-state" data-anki-state aria-live="polite"></p><p class="gm-anki-note">该牌组由 AnkiWeb 用户分享，内容来自已出版的蓝宝书，版权归原作者和出版方；MeguLit 不提供也不保存这些内容，只读取你自己 Anki 里的卡片。下载和使用请自行确认来源与授权，责任由你自己承担。</p></div><div class="gm-anki-actions"><button type="button" class="secondary" data-anki-get>下载并自动导入</button><button type="button" class="secondary" data-anki-reload>我已导入，刷新</button></div></section>`;
}
export const ANKI_GROUP={zh:'蓝宝书 · 来自你的 Anki',ja:'Anki の文法カード',en:'From your Anki'};
/* Cards are sorted into the same kinds of groups as the written lessons, by what their explanation talks about. */
const ANKI_KINDS=[['voice',/被动|使役|可能态|受身/],['give',/授受|为.{0,4}做|给予|恩惠/],['formal',/书面|郑重|尊敬|自谦|敬语|文语|古语|公文|正式/],['cond',/条件|假定|假设|如果|要是|只要|即使|即便|无论|不管/],['perm',
 /许可|禁止|必须|义务|不得不|不允许|不准/],['guess',/推测|推量|好像|似乎|据说|传闻|看样子|估计|大概|也许|可能/],['time',/时间|期间|之前|之后|同时|一.{0,2}就|随着|范围|限定|仅仅|程度/],['aspect',/正在|持续|完了|完成|开始|结束|状态|变化|一直/],
 ['link',/原因|理由|结果|转折|虽然|尽管|但是|然而|因为|由于|目的|为了|并列|列举|添加|不仅/],['stance',/感情|心情|强调|评价|主张|态度|感叹|惊讶|遗憾|后悔|意志|愿望|建议|劝/]];
const ANKI_GROUPS={misc:{zh:'其他句型',ja:'その他',en:'Other patterns'}};
const kindOf=c=>{const w=String(c.word||'').replace(/^[～~〜]/,'');const parts=w.split(/[、，,・／/\s]+/).filter(Boolean);if(parts.length&&parts.every(x=>/^(こ|そ|あ|ど)(の|れ|こ|ちら|っち|んな)$|^あそこ$/.test(x)))return 'word';
 const main=String(c.explain[0]||''),t=[c.explain.join(' '),c.notes.join(' ')].join(' ');
 return (ANKI_KINDS.find(([,re])=>re.test(main))||ANKI_KINDS.find(([,re])=>re.test(t))||['misc'])[0];};
const short=s=>{const t=String(s||''),q=t.match(/[“"「]([^”"」]{1,24})[”"」]/);return (q?q[1]:t.split(/[。；;]/)[0]).slice(0,30);};
export function useAnkiCards(cards){
 for(const p of [...N5,...LEVEL_LIST.flatMap(levelPoints)])delete p.anki;ANKI=[];
 const list=(cards||[]).filter(c=>c&&/^N[1-5]$/.test(c.level));
 for(const c of list){
  const base=basePoints(c.level),word=c.word.replace(/^[～~〜]/,'');
  const twin=base.find(p=>(p.hits||[]).some(h=>c.hits.includes(h))||loc(p.title,'zh').split(/\s*——\s*/)[0].split(/\s*[／/]\s*/).some(h=>h&&h===word));
  if(twin){(twin.anki||(twin.anki=[])).push(c);continue;}
  const builtin=c.examples.filter(e=>e.ja).slice(0,4).map(e=>({ja:e.ja,hl:e.hl||c.hits.find(h=>e.ja.includes(h))||'',zh:e.zh,rb:e.rb||''}));
  const others=list.filter(o=>o.level===c.level&&o!==c).map(o=>o.hits[0]).filter(h=>h&&!c.hits.includes(h));
  const wrong=[0,7,19].map(k=>others[(c.order+k)%Math.max(1,others.length)]).filter((v,i,a)=>v&&a.indexOf(v)===i);
  const title=`${word} —— ${short(c.explain[0])}`,gist=c.explain[0]||'';
  const kind=kindOf(c);ANKI.push({id:c.id,level:c.level,group:kind,node:{cond:'clauses',link:'clauses',time:'clauses',perm:'auxiliary',guess:'auxiliary',voice:'auxiliary',
   give:'viewpoint',aspect:'aspect',formal:'order',stance:'order',misc:'order'}[kind]||'order',source:'anki',title:{zh:title,ja:word,en:word},gist:{zh:gist,ja:gist,
   en:gist},
   form:(c.form.length?c.form:[word]).map(f=>[f.replace(/[＋+]/g,' + '),'']),uses:builtin.slice(0,3).map((e,i)=>({t:c.explain[Math.min(c.explain.length-1,Math.floor(i*c.explain.length/Math.max(1,c.examples.length)))]||'',ja:e.ja,zh:e.zh,rb:e.rb})),pitfalls:c.notes.length?c.notes:c.explain.slice(1),explain:c.explain,
   builtin,hits:c.hits,wrong:wrong.length?wrong:['のに','ので','ために'],choices:[...c.hits,...wrong]});
 }
 return {merged:list.length-ANKI.length,own:ANKI.length};
}
export const ankiPoints=level=>ANKI.filter(p=>p.level===level);
/* The merged cards' example lines, used as extra lines for a lesson's examples and exercises. */
export const ankiLines=point=>(point.anki||[]).flatMap(c=>c.examples.map(e=>{const h=e.hl||c.hits.find(x=>e.ja.includes(x))||'',at=h?e.ja.indexOf(h):-1,start=at<0?0:[...e.ja.slice(0,
 at)].length;return {text:e.ja,start,end:start+[...h].length,translation:e.zh,translationSource:'anki',origin:'anki',title:'蓝宝书'};}));
/* ---- map ---- */
/* 2026-11-11 (user: the outline was ugly, hard to read and taught like a textbook): the system is shown inside real
   lines. Each piece of a line is a block coloured by the part of Japanese it belongs to; tap a block and Megumin says
   what it is doing there, with the lessons for that part. The nine parts are pills under the line. */
export const SCENES=[
 {label:'普通的一句',ja:'私は昨日、図書館で本を読みたくなかった。',zh:'我昨天不想在图书馆看书。',pieces:[
  ['私','谁','classes','名词。一个字都不会变，稳如红魔之里！'],['は','话题牌','particles','贴在名词后面的角色牌：「说到我嘛……」'],['昨日','何时','order','修饰的东西全堆在前面——主角（动词）要压轴登场！'],['、','','order',''],
  ['図書館','哪里','classes','又一个名词。名词本身从不变形。'],['で','舞台','particles','で = 动作发生的舞台。在图书馆「做」某事。'],['本','什么','classes','名词：书。'],['を','瞄准','particles','を 是魔法的瞄准镜：动作打在谁身上。'],
  ['読み','读','conjugation','読む 换了个词尾变成 読み，后面的零件才接得上。词干不动，只换尾巴！'],['たく','想','auxiliary','零件「たい（想）」粘上来了，自己也变了形：たく。'],['なかっ','不','auxiliary','再粘一个否定零件「ない」，同样变形。'],['た',
   '过去','aspect','た = 已经过去了。日语只有「过去」和「非过去」两种时间。'],['。','句尾','order','真正的意思藏在句尾：读到最后才知道是「不想」——所以先看句尾！']]},
 {label:'换成敬语',ja:'先輩、明日も来ますか。',zh:'学长，明天也来吗？',plain:'对朋友就说：明日も来る？',pieces:[
  ['先輩','称呼','classes','直接叫对方的身份，比「你」自然得多。'],['、','','order',''],['明日','何时','order','时间放前面，照旧。'],['も','也','particles','も =「也」，顶替了 は／が 的位置。'],
  ['来','来','conjugation','来る 是三类动词，变 ます形 就成了 来（き）。'],['ます','礼貌','politeness','ます 一粘，整句就变成对前辈说的礼貌话。突然不用 ます 了？那就是关系变了！'],['か','疑问','particles','句尾的 か 把话变成问题，不用问号也行。'],
   ['。','','order','']]},
 {label:'拜托别人',ja:'ちょっと待ってください。',zh:'请稍等一下。',pieces:[
  ['ちょっと','一下','order','副词放在前面，软化语气：就一下下！'],['待っ','等','conjugation','待つ 变 て形：つ → って。'],['て','て形','conjugation','て形 是万能接口，后面能接一大堆东西。'],['ください','请为我','viewpoint',
   '请对方「为我」做。主语没写，但谁帮谁一清二楚。'],['。','','order','']]},
 {label:'连成长句',ja:'雨が降っているから、家で待っててね。',zh:'在下雨，你就在家等着吧。',pieces:[
  ['雨','什么','classes','名词：雨。'],['が','主语','particles','が 指出「是谁 / 是什么」——是雨在下。'],['降っ','下','conjugation','降る 变 て形：る → って。'],['ている','正在','aspect','ている = 正在进行。雨现在正下着。'],
  ['から','因为','clauses','から 在这里切一刀：前半句是原因。长台词就在这些地方拆开读！'],['、','','order',''],['家','哪里','classes','名词：家。'],['で','舞台','particles','在家「做」某事。'],
  ['待っ','等','conjugation','待つ → 待っ，准备接 て。'],['てて','等着','viewpoint','ていて 的口语缩写，对朋友的随口请求：「等着嘛」。'],['ね','语气','order','句尾的 ね 求认同，「好吧？」的感觉。'],['。','','order','']]}
];
const nodeById=id=>MAP.find(n=>n.id===id);
/* Lines from your own reading come first (cut by the backend); the built-in lines only when there are none yet. */
export const scenesOf=data=>data?.scenes?.length?data.scenes:SCENES;
const ROMAN=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'],romanOf=id=>ROMAN[MAP.findIndex(n=>n.id===id)]||'';
const sceneOf=(node,list=SCENES)=>Math.max(0,list.findIndex(s=>s.pieces.some(p=>p[2]===node)));
function nodeStats(node,prog){const pts=N5.filter(p=>nodeFor(p)===node.id||nodesFor(p).includes(node.id));return {pts,learned:pts.filter(p=>prog?.[p.id]?.learned).length};
 }
export function sentenceHTML(scene,esc,{open='',piece=-1,mini=false}={}){
 return `<p class="gm-sentence${mini?' mini':''}${open?' focus':''}" lang="ja">${scene.pieces.map(([t,role,n],i)=>t==='、'||t==='。'||!role?`<span class="gm-punct">${esc(t)}</span>`:mini?`<span class="gm-piece n-${n}">${esc(t)}</span>`:`<button type="button" class="gm-piece n-${n}${n===open?' on':''}${i===piece?' picked':''}" data-piece="${i}" data-node="${n}" style="--i:${i}"><i class="gm-piece-no">${romanOf(n)}</i><b>${esc(t)}</b><small>${esc(role)}</small></button>`).join('')}</p>`;
}
export function mapHTML(data,{locale,esc,open='',scene=null,piece=-1}){
 const w=grammarMessages[locale]||grammarMessages.zh,prog=data?.progress||{},list=scenesOf(data),si=Math.min(list.length-1,scene==null?(open?sceneOf(open,list):0):scene),
  s=list[si];
 const node=nodeById(open),stats=node&&nodeStats(node,prog),said=piece>=0&&s.pieces[piece]?.[2]===open?s.pieces[piece][3]:'';
 const panel=node?`<div class="gm-node open${stats.learned?' lit':''}" data-node="${node.id}"><div class="gm-node-head"><span class="gm-node-no n-${node.id}">${romanOf(node.id)}</span><b>${esc(loc(node.title,locale))}</b><span class="gm-node-count">${stats.pts.length?`${stats.learned}/${stats.pts.length}`:''}</span><button type="button" class="gm-link" data-toggle="${node.id}" aria-expanded="true">${esc(w.close)}</button></div>
<div class="gm-megu"><span class="gm-megu-seal" aria-hidden="true">惠</span><p class="gm-bubble">${esc(said||loc(node.line,locale))}</p></div><p class="gm-node-say">${esc(loc(node.body,locale))}</p>
${stats.pts.length?`<div class="gm-chips">${stats.pts.map(p=>`<button type="button" class="gm-chip${prog[p.id]?.learned?' lit':''}${nodeOf(p.id)===node.id?'':' side'}" data-point="${p.id}">${esc(loc(p.title,locale).split(' —— ')[0])} →</button>`).join('')}</div>`:''}</div>`
 :`<div class="gm-megu gm-map-hint"><span class="gm-megu-seal" aria-hidden="true">惠</span><p class="gm-bubble">${esc(locale==='zh'?'别背目录！这是一句真台词——点任意一块，我告诉你它是日语的哪根骨头。颜色一样的，就是同一类东西。':loc(MAP[0].line,locale))}</p></div>`;
 const pills=`<div class="gm-pills">${MAP.map(n=>{const st=nodeStats(n,prog);return `<button type="button" class="gm-pill n-${n.id}${n.id===open?' open':''}${st.learned?' lit':''}" data-toggle="${n.id}" aria-expanded="${n.id===open}"><i>${romanOf(n.id)}</i>${esc(loc(n.title,locale).split(/[：:]/)[0])}${st.pts.length?`<small>${st.learned}/${st.pts.length}</small>`:''}</button>`;}).join('')}</div>`;
 return `<button type="button" class="gm-link gm-back" data-back>${esc(w.back)}</button><section class="gm-map"><header><h2>${esc(w.map)}</h2><div class="gm-scenes" role="tablist">${list.map((x,i)=>`<button type="button" role="tab" class="gm-scene${i===si?' active':''}" data-scene="${i}" aria-selected="${i===si}" title="${esc(x.label)}">${esc(x.real?([...x.label].length>10?[...x.label].slice(0,10).join('')+'…':x.label)||'#'+(i+1):x.label)}</button>`).join('')}</div></header>
<div class="gm-stage"><span class="gm-badge" aria-hidden="true">megulit · grammar lab</span><span class="gm-runno" aria-hidden="true">${String(si+1).padStart(2,'0')} / ${String(list.length).padStart(2,'0')}</span>${sentenceHTML(s,esc,{open,piece})}<p class="gm-tr">${esc(s.zh||'')}${s.real?` <span class="gm-cap">· ${esc(sourceLabel({title:s.label,origin:s.origin,readAt:s.readAt,readBy:s.readBy},w,locale))}</span>`:''}${s.plain?` <span class="gm-cap">· ${esc(s.plain)}</span>`:''}</p></div>${pills}${panel}</section>`;
}
/* ---- list ---- */
const FOLD=12;
/* stage nicknames (2026-11-13, user: keep the gal-game flavour, but every nickname must hint at what its grammar does;
   the small line under it names the grammar plainly). [zh, ja, en] */
const STAGE_NICK={particle:["人物关系图","相関図","Relationship chart"],form:["变身形态","変身フォーム","Transformation forms"],adj:["人设描写","キャラ設定","Character profile"],word:["视线诱导","視線誘導","Pointing gaze"],pattern:["台词模板","セリフのテンプレ","Line templates"],cond:["if线","ifルート","If-route"],perm:["BAD END 回避","BAD END 回避","Avoid the BAD END"],give:["好感度事件","好感度イベント","Affection event"],aspect:["剧情进度条","進行度バー","Progress bar"],guess:["推理环节","推理パート","Deduction scene"],voice:["视角切换","視点切替","POV switch"],link:["伏笔与反转","伏線と反転","Setups and twists"],stance:["内心独白","心の声","Inner voice"],time:["时间线与限定","時間軸と限定","Timeline and limits"],formal:["古风咏唱","古風な詠唱","Archaic chant"],speech:["吞音模式","早口モード","Fast-talk mode"],ending:["语尾属性","語尾属性","Verbal tics"],slang:["圈内黑话","仲間内スラング","Insider slang"],net:["弹幕","弾幕","Live chat"],trend:["本季新番","今期の流行","This season"],d_kansai:["浪速之魂","浪速魂","Osaka spirit"],d_kago:["萨摩隼人","薩摩隼人","Satsuma warrior"],d_shikoku:["四国遍路","四国遍路","Shikoku pilgrimage"],d_okinawa:["海风岛语","島の言葉","Island words"],d_hakata:["屋台之夜","屋台の夜","Food-stall night"],d_nagoya:["金鯱之城","金シャチの城","Golden-orca city"],d_tohoku:["雪国乡音","雪国訛り","Snow-country accent"],d_hokkaido:["北国之春","北国の春","Northern spring"],d_chugoku:["濑户内","瀬戸内","Seto Inland Sea"],e80:["昭和泡沫","昭和バブル","Bubble era"],e90:["辣妹时代","ギャル時代","Gyaru era"],e00:["2ch 黄金期","2ch黄金期","2ch golden age"],e10:["SNS 元年","SNS元年","Social-media dawn"],e20:["Z 世代","Z世代","Gen Z"],misc:["隐藏要素","隠し要素","Hidden extras"]};
const nickOf=(g,locale)=>{const n=STAGE_NICK[g];return n?n[locale==='ja'?1:locale==='en'?2:0]:'';};
/* the big Japanese on a stage card: the representative forms of the stage's own written lessons, joined (never an Anki
   card, never cut — long ones shrink). E-live 2026-11-13: an Anki card 「この、その」 sorted into perm sat under 「BAD END 回避」,
   and the old 5-char cut turned こ・そ・あ・ど into こ・そ・あ */
const STAGE_GLYPH={particle:"は・が・を",form:"ます・て・た",adj:"い・な",word:"こ・そ・あ・ど",pattern:"〜たい",cond:"たら・ば・なら",perm:"てもいい",give:"あげる・くれる",aspect:"ている",guess:"らしい・そう",voice:"れる・させる",link:"から・ので",stance:"べき・わけ",time:"ながら",formal:"において",speech:"んない",ending:"じゃん",slang:"マジ",net:"草",trend:"メロい",misc:"〜"};
const STAGE_MEAN={particle:["给词贴上「主语、宾语、地点」等角色","語の役割（主語・目的語・場所）を示す","Tag each word's role: subject, object, place"],form:["活用变形：です・ます 礼貌，ない 否定，た 过去，て 连接","動詞の形：丁寧・否定・過去・接続","Verb forms: polite, negative, past, linking"],adj:["形容词：描写人和事物的样子","形容詞：人や物の様子を表す","Adjectives: what people and things are like"],word:["指示词：按远近指人、物、地点","指示語：近い・遠いで人や物、場所を指す","Demonstratives: this, that, which — by distance"],pattern:["常用句型：想做、请求、邀请","よく使う文型：願望・依頼・勧誘","Everyday patterns: want, request, invite"],cond:["条件和假设：如果……就……","条件・仮定：〜なら、〜する","Conditions: if A, then B"],perm:["许可、禁止、义务：可以 / 不行 / 必须","許可・禁止・義務：いい・だめ・しなければ","Permission, prohibition, duty"],give:["授受：谁给谁做了什么","やりもらい：誰が誰のために","Giving and receiving favours"],aspect:["动作的阶段：开始、进行、完成","動作の段階：始め・途中・完了","Stages of an action: start, ongoing, done"],guess:["推测和传闻：好像、听说、应该","推量・伝聞：〜らしい・〜そう・はず","Guessing and hearsay"],voice:["被动、使役：被谁做／让谁做","受身・使役：される・させる","Passive and causative"],link:["接续：因为、虽然、明明、为了","接続・理由：から・のに・ために","Linking clauses: because, although, so that"],stance:["语气和态度：说话人怎么看这件事","話し手の気持ち・態度","Speaker's stance and feeling"],time:["时间和范围：刚刚、一边、之后、只有","時間・範囲：ながら・てから・しか","Time and scope: while, after, only"],formal:["书面和郑重的说法","書き言葉・改まった表現","Formal and written expressions"],speech:["口语缩约：说快了的形式","縮約形：話し言葉の短い形","Spoken contractions"],ending:["句尾语气：一听就知道角色口吻","文末表現：キャラの口調が出る","Sentence endings that show a character's voice"],slang:["日常俗语：朋友之间的说法","くだけた言い方","Everyday slang"],net:["网络用语","ネットスラング","Internet slang"],trend:["最新流行语","最新の流行語","Latest buzzwords"],misc:["其他句型","その他の文型","Other patterns"]};
const headOf=p=>loc(p.title,'zh').split(/\s*——\s*/)[0].split(/\s+[／/]\s+/)[0].trim().replace(/(.)形$/,'$1');
/* the stage's own lessons shown on its card: up to three whose heads fit; the big Japanese and the meaning line come from
   the same picks, so they always match. A head that is a Chinese term (い形容词, 受身) falls back to the group's forms */
const picksOf=(g,items)=>{const own=items.filter(p=>p.source!=='anki'),seen=new Set(),out=[];let len=0;
 for(const p of own){const h=headOf(p);if(seen.has(h))continue;if(/[词詞]/.test(h)||!/[\u3040-\u30ff]/.test(h))return null;const n=[...h].length+(out.length?1:0);
  if(out.length&&(out.length>=3||len+n>9))break;seen.add(h);out.push(p);len+=n;}return out.length?out:null;};
const glyphOf=(g,items)=>{const ps=picksOf(g,items);return ps?ps.map(headOf).join('・'):STAGE_GLYPH[g]||headOf(items[0]);};
/* the real meaning line: the group's plain name, then what the shown lessons mean */
const meanOf=(g,G,locale,items)=>{const m=STAGE_MEAN[g],li=locale==='ja'?1:locale==='en'?2:0,ps=picksOf(g,items),name=loc(G[g],locale);
 const tails=ps?[...new Set(ps.map(p=>(loc(p.title,locale).split(/\s*——\s*/)[1]||'').split(/\s+\/\s+/)[0].trim().replace(/\s*\/\s*/g,'／').replace(/\s*[（(][^）)]*[）)]\s*$/,'').replace(/……/g,'～').replace(/～$/,'')).filter(Boolean))]:[];
 if(!tails.length)return m?m[li]:name;return name+(locale==='en'?': ':'：')+tails.join(locale==='en'?'; ':'／');};
/* the level's stages in goal order and its lessons in that same order: the list, the hero and 「下一课」 after a lesson
   all walk this one order */
export function stageOrder(level,goal){const pts=pointsOf(level),G={...GROUPS,...LEVEL_GROUPS,...ANKI_GROUPS},
 keys=orderByGoal(Object.keys(G).filter(g=>pts.some(p=>p.group===g)),goal?.plan);return {G,keys,order:keys.flatMap(g=>pts.filter(p=>p.group===g))};}
/* after finishing a lesson: the next unlearned one in its own stage, else the next in stage order */
export function nextAfter(prog,point,level,goal){const {order}=stageOrder(level,goal);return nextPoint(prog,order.filter(p=>p.group===point.group))||nextPoint(prog,order);}
export function listHTML(data,opts){const {locale,esc,level='N5',userLevel=null}=opts;
 const w=grammarMessages[locale]||grammarMessages.zh,prog=data?.progress||{},pts=pointsOf(level),comp=level==='N5'&&data?.completion||completion(prog,pts);
 const levels=`<div class="gm-levels" role="tablist">${LEVELS.map(l=>`<button type="button" role="tab" class="gm-level${l===level?' active':''}" data-level="${l}" aria-selected="${l===level}">${l}</button>`).join('')}</div>`;
 const hud=`<header class="gm-hud"><span class="gm-tag"><i></i>megulit · grammar lab</span>${levels}<span class="gm-hud-stats${data?.progress?'':' wait'}"><span><b>${String(comp.learned).padStart(2,'0')}</b>/${pts.length} ${esc(w.done)}</span><span><b>${comp.accuracy==null?'—':pct(comp.accuracy)}</b>${esc(w.accuracy)}</span><span><b>${data?.real||0}</b>${esc(w.real)}</span></span></header>`;
 if(!pts.length)return `${hud}<section class="gm-soon"><p>${esc(w.soon)}</p></section>`;
 const overview=`<button type="button" class="gm-overview" data-map><span class="gm-overview-kicker">${esc(w.map)}</span>${sentenceHTML(scenesOf(data)[0],esc,{mini:true})}<span class="gm-cap">${esc(locale==='zh'?'一句你读过的台词，拆成九种零件——点开，一块一块戳着玩 →':w.mapLead)}</span></button>`;
 let no=0;
 const goalFirst=new Set(opts.goal?.plan?.groups||[]),{G,keys,order}=stageOrder(level,opts.goal);
 /* E500 (live check 2026-11-13: the hero said 「下一课 01 / 186」 while NEXT sat on stage 02): stages follow the goal order, so the
    next lesson and its number are taken from that same order, never from the raw level list */
 const nextId=nextPoint(prog,order)?.id,nextGroup=order.find(p=>p.id===nextId)?.group,
  cur=keys.includes(opts.group)?opts.group:keys.includes(nextGroup)?nextGroup:keys[0];
 /* 2026-11-14 (recording: clicking stage 05, 15, 18 … changed nothing in view, nothing started): a stage the reader picked
    is where 下一课 / 开始这一课 point — its first unlearned lesson, or the overall next one once that stage is clear */
 const focusId=keys.includes(opts.group)&&nextPoint(prog,order.filter(p=>p.group===cur))?.id||nextId;
 const starts={};{let k=0;for(const g of keys){starts[g]=k;k+=pts.filter(p=>p.group===g).length;}}
 /* 2026-11-11 (user: the category list read like a syllabus, nobody wants to click it): categories are stages — a
    nickname, the grammar of its first lesson huge, a segment per lesson filling as you learn; the strip scrolls sideways */
 const gtabs=`<nav class="gm-stgs">${keys.map((g,gi)=>{const items=pts.filter(p=>p.group===g),done=items.filter(p=>prog[p.id]?.learned).length,nick=nickOf(g,locale)||loc(G[g],locale),glyph=glyphOf(g,items),gl=[...glyph].length;return `<button type="button" class="gm-stg${g===cur?' on':''}${items.some(p=>p.id===nextId)?' has-next':''}${done===items.length?' clear':''}${goalFirst.has(g)?' goal':''}" data-gtab="${g}" aria-expanded="${g===cur}" aria-controls="gm-stage-panel" style="--i:${gi}"><span class="gm-stg-no">stage ${String(gi+1).padStart(2,'0')}</span><b class="gm-stg-glyph${gl>7?' xlong':gl>4?' long':''}" lang="ja">${esc(glyph)}</b><span class="gm-stg-nick">${esc(nick)}</span><span class="gm-stg-mean">${esc(meanOf(g,G,locale,items))}</span><span class="gm-stg-sub">${done} / ${items.length}</span><span class="gm-stg-bar">${items.slice(0,24).map(p=>`<i class="${prog[p.id]?.learned?'on':p.id===nextId?'cur':''}"></i>`).join('')}</span>${items.some(p=>p.id===nextId)?'<span class="gm-stg-flag">next</span>':done===items.length?'<span class="gm-stg-flag">clear</span>':''}</button>`;}).join('')}`;
 const groups=keys.filter(g=>g===cur).map(g=>{const gi=keys.indexOf(g),items=pts.filter(p=>p.group===g);no=starts[g];return `<section class="gm-group"><h3><em>${ROMAN[gi]}</em>${esc(loc(G[g],locale))}<small>${items.filter(p=>prog[p.id]?.learned).length}/${items.length}</small></h3><div class="gm-cards${items.length>FOLD?' folded':''}" data-group="${g}">${items.map((p,k)=>{no++;const r=prog[p.id]||{},n=data?.examples?.[p.id]?.length||0,node=MAP.find(m=>m.id===nodeFor(p)),[head,tail]=loc(p.title,locale).split(/\s*——\s*/);return `<button type="button" class="gm-card${r.learned?' learned':''}${p.id===focusId?' next':''}${k>=FOLD&&p.id!==focusId?' extra':''}" data-point="${p.id}"><span class="gm-card-no">${String(no).padStart(2,'0')}</span><span class="gm-card-title${[...head].length>7?' long':''}" lang="ja">${esc(head)}</span><span class="gm-card-gist"><small class="gm-card-lbl">${esc(locale==='en'?'Means':locale==='ja'?'意味':'意思')}</small>${esc((tail||loc(p.gist,locale)).split(/\s+\/\s+/)[0].replace(/\s*[（(][^）)]*[）)]\s*$/,''))}</span><span class="gm-card-node">${p.era?`${esc(p.era)} · ${esc(p.who)}`:`<small class="gm-card-lbl">${esc(locale==='en'?'Use':locale==='ja'?'使い方':'用法')}</small>${esc(loc(p.gist,locale))}`}</span><span class="gm-card-meta">${r.learned?`<b>${esc(w.done)}</b>`:p.id===focusId?`<b>${esc(w.nextLesson)}</b>`:''}${r.attempts?`<span>${pct(r.correct/r.attempts)}</span>`:''}${n?`<span>${n} ${locale==='en'?'lines':'句'}</span>`:''}</span></button>`;}).join('')}</div>${items.length>FOLD?`<button type="button" class="gm-more" data-more="${g}">展开全部 ${items.length} 课 ↓</button>`:''}</section>`;
  }).join('');
 const n0note=level==='N0'?`<p class="gm-n0note"><i></i>N0 词库还在收集中：JLPT 官方只有 N5–N1，N0 是 MeguLit 自己整理的「考级不考、生活和 gal 里天天用」的说法，会持续补充（最新收录：JC・JK 流行语大赏 2025 / 2026 上半期、渋谷トレンドリサーチ 2026 秋）。遇到想加的词，欢迎在反馈里告诉我们。</p>`:'';
 /* the chosen stage's lessons open inside the stage map, right under that stage's row (mountGrammar places it): before
    2026-11-14 the map grew to five columns and the list sat a screen below every card */
 const tracks=`${n0note}${gtabs}<div class="gm-tracks one" id="gm-stage-panel">${groups}</div></nav>`;
 return `${hud}${goalBarHTML(opts.goal,{locale,esc})}${manaHTML(opts.rewards,esc)}${opts.anki?ankiBannerHTML(opts.anki,{esc}):''}${data?.pending&&data?.counting?`<p class="gm-cap gm-status">${esc(w.counting)}</p>`:''}${heroHTML(data,{locale,esc,userLevel,level,order,pick:focusId})}${overview}${tracks}`;
}
/* ---- widgets ---- */
export function conjHTML(pointId,{locale,esc,wordIndex=null,form=null}){
 const w=grammarMessages[locale]||grammarMessages.zh,types=CONJ_POINTS[pointId]||['godan','ichidan','suru','kuru','i','na'],words=WORDS.filter(x=>types.includes(x.type));
 const entry=words[wordIndex??0]||words[0],f=form||CONJ_FORM[pointId]||'masu',c=conjugate(entry,f),r=conjugate({...entry,word:entry.reading},f);
 const reading=entry.type==='kuru'&&f!=='dict'?c.reading:r.stem+r.ending;
 return `<section class="gm-widget gm-conj" data-conj><h3>${esc(w.conj)}</h3><p class="gm-cap">${esc(w.conjLead)}</p><div class="gm-word-picks" role="listbox" aria-label="${esc(w.pickWord)}">${words.map((x,i)=>`<button type="button" class="gm-pick${x===entry?' active':''}" data-word="${i}" aria-selected="${x===entry}" lang="ja">${esc(x.word)}</button>`).join('')}</div>
<div class="gm-conj-stage" aria-live="polite"><p class="gm-conj-word" lang="ja"><span class="gm-stem">${esc(c.stem)}</span><span class="gm-ending">${esc(c.ending)}</span></p><p class="gm-conj-reading" lang="ja">${esc(reading)}</p><p class="gm-cap gm-conj-rule">${esc(c.rule||entry.zh)}${entry.note?` · ${esc(entry.note)}`:''}</p></div>
<div class="gm-forms" role="tablist">${FORMS.map(x=>`<button type="button" role="tab" class="gm-form-btn${x===f?' active':''}" data-form="${x}" aria-selected="${x===f}">${esc(loc(FORM_LABEL[x],locale))}</button>`).join('')}</div></section>`;
}
export function particleHTML(point,real,{locale,esc}){
 const w=grammarMessages[locale]||grammarMessages.zh,gaps=particleGaps(point,real);if(!gaps.length)return '';
 return `<section class="gm-widget gm-particles" data-particles><h3>${esc(w.particles)}</h3><p class="gm-cap">${esc(w.particlesLead)}</p><div class="gm-palette">${PARTICLES.map(p=>`<button type="button" class="gm-tile" data-tile="${p}" lang="ja">${p}</button>`).join('')}</div>
<ol class="gm-gaps">${gaps.map((q,i)=>{const c=[...q.text];return `<li class="gm-gap-line" data-gap="${i}"><p class="gm-ja" lang="ja">${esc(c.slice(0,q.blankStart).join(''))}<button type="button" class="gm-slot" data-slot="${i}" aria-label="${esc(w.placeHere)}">＿</button>${esc(c.slice(q.blankEnd).join(''))}</p><p class="gm-tr gm-gap-tr" hidden>${esc(q.translation||'')}</p><p class="gm-cap gm-gap-msg" aria-live="polite"></p>${sourceLabel(q,w,locale)?`<p class="gm-cap">${esc(sourceLabel(q,w,locale))}</p>`:''}</li>`;}).join('')}</ol></section>`;
}
function formulaHTML(a,esc){return a.split(/\s*\+\s*/).map((part,i)=>`${i?'<i class="gm-plus" aria-hidden="true">+</i>':''}<span class="gm-block" style="--i:${i}">${esc(part)}</span>`).join('');
 }
/* 动手玩 for lessons without a lab: tap the grammar inside each line (the line is cut into small chunks). */
/* 动手玩 (2026-11-11, user: 动手玩太蠢了，全面优化): no more cutting lines into pieces. Each round shows the same line two
   or three ways — the real one and the grammar swapped for a look-alike — and you pick the one a Japanese speaker would
   say; the right one lights its grammar and says why, a wrong pick says why not. N0 words add one more round: who
   would say it (the era and the crowd). */
export function judgeRounds(point,real=[]){
 const lines=[...real.filter(e=>e.end>e.start),...builtinExamples(point)].filter((e,k,a)=>e.end>e.start&&a.findIndex(x=>x.text===e.text)===k);
 const out=[],max=point.era?1:3;
 for(const e of lines){if(out.length>=max)break;
  let start=e.start,end=e.end,answer=[...e.text].slice(start,end).join(''),others=[];
  if(point.hits){const h=e.conf!=null&&e.end>e.start?{start:e.start,end:e.end,text:[...e.text].slice(e.start,e.end).join('')}:findHit(point,e.text);if(!h)continue;
   start=h.start;end=h.end;answer=h.text;others=point.wrong||[];}
  else{const b=blankOf(point,e.text,e.start,e.end);if(!point.choices.includes(b.answer))continue;start=b.start;end=b.end;answer=b.answer;others=point.choices.filter(c=>c!==b.answer);
   }
  const c=[...e.text],wrong=others.filter(x=>x!==answer).slice(0,24),n=[...e.text].length+out.length,pick=[wrong[n%Math.max(1,wrong.length)],wrong[(n+3)%Math.max(1,
   wrong.length)]].filter((x,i,a)=>x&&a.indexOf(x)===i);
  if(!pick.length)continue;
  const opts=[{text:e.text,ok:true,start,end},...pick.map(x=>({text:c.slice(0,start).join('')+x+c.slice(end).join(''),ok:false,start,end:start+[...x].length,form:x}))];
  const k=n%opts.length;[opts[0],opts[k]]=[opts[k],opts[0]];
  out.push({answer,translation:e.translation||'',title:e.title||'',options:opts});}
 return out;
}
function judgeHTML(point,real,{esc,locale}){
 const rounds=judgeRounds(point,real),name=loc(point.title,locale).split(/\s*——\s*/)[0];
 const mark=(o)=>{const c=[...o.text];return esc(c.slice(0,o.start).join(''))+`<mark class="gm-jd-hl">${esc(c.slice(o.start,o.end).join(''))}</mark>`+esc(c.slice(o.end).join(''));
  };
 const who=point.era?(()=>{const others=['昭和一代 / 中老年','女高中生 / 辣妹','2ch 网民','御宅族 / 推圈','Z 世代','体育会 / 后辈','关西人'].filter(x=>!point.who.includes(x.split(' ')[0]));const opts=[point.who,
  others[[...point.id].length%others.length],others[([...point.id].length+2)%others.length]].filter((x,i,a)=>a.indexOf(x)===i);const k=[...point.id].length%opts.length;
  [opts[0],opts[k]]=[opts[k],opts[0]];
   return `<li class="gm-jd" data-jd><p class="gm-jd-q">「<b lang="ja">${esc(name)}</b>」——最可能是谁在说？</p><div class="gm-jd-opts">${opts.map(o=>`<button type="button" class="gm-jd-opt gm-jd-who" data-ok="${o===point.who?1:0}">${esc(o)}</button>`).join('')}</div><p class="gm-jd-why" hidden>${esc(point.era)} · ${esc(point.who)}</p></li>`;
    })():'';
 const meanRound=point.era?(()=>{const mine=loc(point.gist,'zh').split('：').pop(),pool=LEVEL_LIST.flatMap(levelPoints).filter(x=>x.era&&x!==point).map(x=>loc(x.gist,
  'zh').split('：').pop()),n=[...point.id].length,opts=[mine,pool[n%pool.length],pool[(n*7+3)%pool.length]].filter((x,i,a)=>x&&a.indexOf(x)===i);const k=n%opts.length;
  [opts[0],opts[k]]=[opts[k],opts[0]];
   return `<li class="gm-jd" data-jd><p class="gm-jd-q">「<b lang="ja">${esc(name)}</b>」是什么意思？</p><div class="gm-jd-opts">${opts.map(o=>`<button type="button" class="gm-jd-opt gm-jd-who" data-ok="${o===mine?1:0}">${esc(o)}</button>`).join('')}</div><p class="gm-jd-why" hidden>${esc(loc(point.gist,locale))}</p></li>`;
    })():'';
 if(!rounds.length&&!who)return `<p class="gm-cap">${esc(loc(point.gist,locale))}</p>`;
 return `<p class="gm-play-lead">哪一句是日本人会说的？选对了，惠惠告诉你为什么</p><ol class="gm-jds">${rounds.map((rd,i)=>`<li class="gm-jd" data-jd><p class="gm-jd-q">${rd.title?`来自《${esc(rd.title)}》的一句`:'哪句自然？'}</p><div class="gm-jd-opts">${rd.options.map(o=>`<button type="button" class="gm-jd-opt" data-ok="${o.ok?1:0}"${o.form?` data-form="${esc(o.form)}"`:''} lang="ja"><span class="gm-jd-plain">${esc(o.text)}</span><span class="gm-jd-marked" hidden>${mark(o)}</span></button>`).join('')}</div><p class="gm-jd-why" hidden>${rd.translation?`<span class="gm-tr">${esc(rd.translation)}</span>`:''}<span>${esc(loc(point.gist,locale))}</span></p></li>`).join('')}${meanRound}${who}</ol>`;
}
/* A lesson: six short steps, one shown at a time; every step is in the page so returning to it is instant. */
export function lessonHTML(point,data,{locale,esc,step=0,reached=0}){
 const w=grammarMessages[locale]||grammarMessages.zh,real=data?.examples?.[point.id]||[],r=data?.progress?.[point.id]||{};
 const nodes=nodesFor(point).map(id=>MAP.find(n=>n.id===id)).filter(Boolean);
 const lead=real[0]||builtinExamples(point)[0];
 const intro=`<div class="gm-megu"><span class="gm-megu-seal" aria-hidden="true">惠</span><p class="gm-bubble">${esc(meguminIntro(point,real,locale))}</p></div><p class="gm-gist">${esc(loc(point.gist,locale))}</p>${lead?`<div class="gm-lead-line"><p class="gm-ja" lang="ja">${highlight(lead.text,lead.start,lead.end,esc,point.id)}</p>${lead.translation?`<p class="gm-tr">${esc(lead.translation)}</p>`:''}${lead.title?`<p class="gm-cap">${esc(sourceLabel(lead,w,locale))}</p>`:''}<button type="button" class="gm-link" data-speak="${esc(lead.text)}">${esc(w.speak)}</button></div>`:''}`;
 /* 怎么接 (2026-11-14): the plain-words connection, the verb form on 行く / 食べる, examples with furigana and Chinese, a line
    from your own reading and one 注意 — built by grammar-howto.js for every lesson, 蓝宝书 cards included */
 const form=howToHTML(point,real,{esc,locale,source:e=>sourceLabel(e,w,locale)});
 const widget=CONJ_POINTS[point.id]?conjHTML(point.id,{locale,esc}):point.group==='particle'?particleHTML(point,real,{locale,esc}):'';
 const play=widget||judgeHTML(point,real,{esc,locale});
 const ankiMore=(point.anki||[]).map(c=>`<section class="gm-anki"><h4>${esc(ANKI_GROUP.zh)} · ${esc(c.word)}</h4>${c.form.length?`<div class="gm-formula">${formulaHTML(c.form[0].replace(/[＋+]/g,' + '),esc)}</div>`:''}${c.explain.map(x=>`<p>${esc(x)}</p>`).join('')}${c.examples.slice(0,2).map(e=>`<p class="gm-ja" lang="ja">${esc(e.ja)}</p><p class="gm-tr">${esc(e.zh)}</p>`).join('')}</section>`).join('');
 const uses=`<ol class="gm-uses">${point.uses.map(u=>`<li><p>${esc(u.t)}</p><p class="gm-ja" lang="ja">${esc(u.ja)}</p><p class="gm-tr">${esc(u.zh)}</p></li>`).join('')}</ol><h4>${esc(w.pitfalls)}</h4><ul class="gm-pitfalls">${point.pitfalls.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>${ankiMore}`;
 const games=real.length?`<p class="gm-cap">${esc(w.fromGames)}</p><ul class="gm-examples">${real.map((e,i)=>exampleHTML(e,i,{w,esc,locale,pointId:point.id})).join('')}</ul>`:`<p class="gm-cap">${esc(w.builtin)} · ${esc(w.builtinHelp)}</p><ul class="gm-examples">${builtinExamples(point).map((e,i)=>exampleHTML(e,i,{w,esc,locale,pointId:point.id,anki:false})).join('')}</ul>`;
 const practice=`<div data-quiz aria-live="polite"></div><div class="gm-actions"><button type="button" class="${r.learned?'secondary':'primary'}" data-learned="${r.learned?'0':'1'}">${esc(r.learned?w.unmark:w.finishStep)}</button></div>`;
 const bodies={intro,form,play,uses,games,practice},s=Math.max(0,Math.min(STEPS.length-1,step));
 const nav=`<ol class="gm-steps" role="tablist">${STEPS.map((k,i)=>`<li><button type="button" role="tab" class="gm-step-dot${i===s?' active':''}${i!==s&&i<Math.max(s,reached)?' passed':''}" data-step="${i}" aria-selected="${i===s}"><span>${esc(w.steps[k])}</span></button></li>`).join('')}</ol>`;
 return `<button type="button" class="gm-link gm-back" data-back>${esc(w.back)}</button><article class="gm-lesson"><header class="gm-lesson-head"><span class="gm-tag"><i></i>megulit · ${levelOf(point).toLowerCase()} · lesson ${String(pointsOf(levelOf(point)).indexOf(point)+1).padStart(2,'0')}</span><div class="gm-onmap"><span class="gm-cap">${esc(w.onMap)}</span>${nodes.map(n=>`<button type="button" class="gm-chip" data-map="${n.id}">${esc(n.no)} · ${esc(loc(n.title,locale))}</button>`).join('')}</div>${point.era?`<span class="gm-era"><b>${esc(point.era)}</b> · ${esc(point.who)}</span>`:''}<h2><span lang="ja">${esc(loc(point.title,locale).split(/\s*——\s*/)[0])}</span><small>${esc(loc(point.title,locale).split(/\s*——\s*/)[1]||'')}</small></h2></header>
${nav}<div class="gm-lesson-main">${STEPS.map((k,i)=>`<section class="gm-stepbody gm-step-${k}" data-stepbody="${i}"${i===s?'':' hidden'}>${bodies[k]}</section>`).join('')}
<footer class="gm-stepnav"><button type="button" class="secondary" data-prev${s===0?' disabled':''}>${esc(w.prev)}</button><button type="button" class="primary" data-nextstep${s===STEPS.length-1?' hidden':''}>${esc(w.nextStep)}</button></footer></div></article>`;
}
export function quizHTML(point,q,{locale,esc,answered=null,index=0,total=1,retry=false}){
 const w=grammarMessages[locale]||grammarMessages.zh,c=[...q.text],ok=answered===q.answer,blank=`<span class="gm-blank${answered==null?' gm-drop':ok?' ok':' bad'}"${answered==null?' data-drop':''}>${answered==null?esc(w.dropHere||'＿＿'):esc(q.answer)}</span>`;
 const line=esc(c.slice(0,q.blankStart).join(''))+blank+esc(c.slice(q.blankEnd).join(''));
 const src=sourceLabel(q,w,locale);
 const verdict=answered==null?'':ok?`<div class="gm-verdict ok"><b>${esc(w.right)}</b><p>${esc(loc(point.gist,locale))}</p>${q.translation?`<p class="gm-tr">${esc(q.translation)}</p>`:''}<button type="button" class="primary" data-next>${esc(w.next)}</button></div>`
  :`<div class="gm-verdict bad"><b>${esc(w.wrongQuip||'')} ${esc(`${w.wrong}「${q.answer}」`)}</b><p class="gm-cap">${esc(w.correctForm)}</p><table class="gm-form gm-form-mini"><tbody>${point.form.slice(0,3).map(([a,b])=>`<tr><th>${esc(a)}</th><td lang="ja">${esc(b)}</td></tr>`).join('')}</tbody></table>${point.pitfalls[0]?`<p class="gm-cap">${esc(point.pitfalls[0])}</p>`:''}${q.translation?`<p class="gm-tr">${esc(q.translation)}</p>`:''}<button type="button" class="primary" data-retry>${esc(w.retry)}</button></div>`;
 return `<p class="gm-cap">${esc(w.check)} · ${index+1}/${total}${retry?' · '+esc(w.retry):''}</p><p class="gm-ja gm-q" lang="ja">${line}</p>${src?`<p class="gm-cap">${esc(src)}</p>`:''}<div class="gm-choices">${q.choices.map(ch=>`<button type="button" class="gm-choice gm-drag${answered!=null&&ch===q.answer?' right':''}${answered===ch&&!ok?' wrong':''}" data-choice="${esc(ch)}"${answered!=null?' disabled':''} lang="ja">${esc(ch)}</button>`).join('')}</div>${verdict}`;
}
export function completion(prog,points=N5){let learned=0,attempts=0,correct=0;for(const p of points){const r=prog?.[p.id];if(r?.learned)learned++;attempts+=r?.attempts||0;
 correct+=r?.correct||0;}return {learned,total:points.length,share:points.length?learned/points.length:0,accuracy:attempts?correct/attempts:null};}
/* The hero on top of the list: the lesson to take next, and your level (changeable here). */
export function heroHTML(data,{locale,esc,userLevel=null,level='N5',order=null,pick=''}){
 const w=grammarMessages[locale]||grammarMessages.zh,prog=data?.progress||{},pts=order?.length?order:pointsOf(level),p=pick&&pts.find(x=>x.id===pick&&!prog[x.id]?.learned)||nextPoint(prog,pts),i=p?pts.indexOf(p):pts.length;
 const [head,rawTail]=p?loc(p.title,locale).split(/\s*——\s*/):[w.allDone,''],gist=p?loc(p.gist,locale):'';
 /* 2026-11-13 (user: 易读性非常差 找不到重点): some titles carry the first half of the gist as their subtitle, so the
    card said the same sentence three times; a subtitle the gist already starts with is dropped */
 const stem=(rawTail||'').replace(/[，,、。…\s]+$/,'').slice(0,8),tail=rawTail&&!(stem.length>=4&&gist.startsWith(stem))?rawTail:'';
 const learned=pts.filter(x=>prog[x.id]?.learned).length;
 const bars=`<div class="gm-barcode" aria-hidden="true">${/* a progress bar: learned segments fill from the left, then the next lesson */
  [...pts].sort((a,b)=>(prog[b.id]?.learned?2:b===p?1:0)-(prog[a.id]?.learned?2:a===p?1:0)).map(x=>`<i class="${prog[x.id]?.learned?'on':x===p?'cur':''}"></i>`).join('')}</div>`;
 const main=p?`<span class="gm-kicker">${esc(w.nextLesson)} · ${level} · ${String(i+1).padStart(2,'0')} / ${pts.length}</span><h2><span class="gm-hero-ja" lang="ja" data-type data-len="${[...head].length>16?'xl':[...head].length>8?'l':'s'}" title="${esc(head)}">${esc(head)}</span>${tail?`<small>${esc(tail)}</small>`:''}</h2><p class="gm-hero-gist">${esc(gist)}</p><div class="gm-hero-row"><button type="button" class="primary gm-hero-go" data-point="${p.id}">${esc(w.continueLesson)} <span aria-hidden="true">→</span></button></div>`:(()=>{const up=LEVELS[LEVELS.indexOf(level)+1];/* all done: the card still ends on one button, the next level */
  return `<span class="gm-kicker">${level} · ${pts.length} / ${pts.length}</span><h2><span class="gm-hero-ja" data-len="l">${esc(level==='N5'?w.allDone:`${level} ✓`)}</span></h2><p class="gm-hero-gist">${esc(w.allDoneLead)}</p><div class="gm-hero-row">${up?`<button type="button" class="primary gm-hero-go" data-level="${up}">${esc(w.nextLevel.replace('{l}',up))} <span aria-hidden="true">→</span></button>`:''}</div>`;})();
 return `<section class="gm-hero"><span class="gm-hero-ghost" aria-hidden="true" lang="ja">${esc([...head][0]||'文')}</span><div class="gm-hero-main">${main}</div><div class="gm-hero-side"><span class="gm-cap gm-hero-progk">${esc(w.levelProgress)} · ${level}</span><b class="gm-hero-prog">${learned}<small>/${pts.length}</small></b>${bars}<span class="gm-hero-me"><span class="gm-cap">${esc(w.myLevel)}</span><b class="gm-hero-level">${esc(userLevel?levelName(userLevel):w.noLevel)}</b><button type="button" class="gm-link" data-change-level>${esc(w.changeLevel)}</button></span><p class="gm-cap">${esc(w.pathLead)}</p></div><span class="gm-corner tl"></span><span class="gm-corner br"></span></section>`;
}
/* The level to open: the one above yours (N5 for beginners, N0 stays N0). */
export function startLevel(user){if(!user||user==='none'||user==='kana')return 'N5';const i=LEVELS.indexOf(user);return i<0?'N5':LEVELS[Math.min(LEVELS.length-1,
 i+1)];}
/* ---- page ---- */
/* Kept between visits (user: going into a lesson and back reloaded everything): the report, the view, the step. */
const memo={data:null,at:0,level:'N5',view:'list',point:'',openNode:'',scene:null,piece:-1,step:0,userLevel:undefined};
/* 2026-11-14 (user: 「点开地图体系之后 回到课程列表又要从头开始」): every lesson keeps the step it was on and the furthest step
   reached (the ✓ marks), across the map, the list, 下一课 and restarts; kept in this computer's browser storage */
const STEP_KEY='megulit-grammar-steps';
const lessonSteps=(()=>{try{const v=JSON.parse(localStorage.getItem(STEP_KEY)||'{}');return v&&typeof v==='object'?v:{};}catch{return {};}})();
export const stepOf=id=>lessonSteps[id]||{step:0,max:0};
export function keepStep(id,n,max=n){if(!id)return;const prev=stepOf(id);lessonSteps[id]={step:n,max:Math.max(prev.max||0,max,n)};
 try{localStorage.setItem(STEP_KEY,JSON.stringify(lessonSteps));}catch{}}
const FRESH_MS=5*60*1000;
export function grammarMemo(){return memo;}
export async function mountGrammar(target,{api,locale,esc,toast,isCurrent=()=>true}){
 const w=grammarMessages[locale]||grammarMessages.zh;let data=memo.data,level=memo.level,view=memo.view,point=pointById(memo.point)||null,openNode=memo.openNode,
  scene=memo.scene,piece=memo.piece,step=memo.step,timer=0,audio=null;
 if(view==='lesson'&&!point)view='list';
 const save=()=>Object.assign(memo,{data,level,view,point:point?.id||'',openNode,scene,piece,step});
 const root=document.createElement('div');root.className='gm-page';target.replaceChildren(root);
 const load=async(count=true)=>{clearTimeout(timer);const had=!!data?.progress;try{const next=await api('grammar_report',{count});if(!isCurrent())return;data=memo.anki?.examples?{
  ...next,examples:{...memo.anki.examples,...next.examples}}:next;memo.at=Date.now();save();if(view==='list'||view==='map'||!had)render();if(next.pending&&next.counting&&count)timer=setTimeout(()=>{
  if(isCurrent())load(true);},2000);}catch(error){if(isCurrent()&&!data){data={};render();toast?.(String(error?.message||error));}}};
 const enter=()=>{if(!motion())return;root.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});
  };
 let switching=false,panelWatch=null;
 /* the chosen stage's lessons go right after the last card of its row in the stage map (5 or 3 columns), and move again
    when the column count changes */
 const placePanel=()=>{const nav=root.querySelector('.gm-stgs'),panel=nav?.querySelector(':scope>#gm-stage-panel'),on=nav?.querySelector(':scope>.gm-stg.on');
  if(!panel||!on)return;let last=on;for(const c of nav.querySelectorAll(':scope>.gm-stg'))if(Math.abs(c.offsetTop-on.offsetTop)<4)last=c;
  if(panel.previousElementSibling!==last)last.after(panel);};
 const watchPanel=()=>{panelWatch?.disconnect();panelWatch=null;const nav=root.querySelector('.gm-stgs');if(!nav||typeof ResizeObserver!=='function')return;
  let w=nav.clientWidth;panelWatch=new ResizeObserver(()=>{if(nav.clientWidth===w)return;w=nav.clientWidth;placePanel();});panelWatch.observe(nav);};
 const scroller=()=>root.closest('.main')||document.scrollingElement;
 /* the list comes back at the scroll it was left at (expanded stage included: memo.groupOf); async re-renders right after
    (rewards, goal, Anki) keep it, until the reader scrolls themself */
 let restoreY=null,restoreUntil=0;const stopRestore=()=>{restoreY=null;};
 root.addEventListener('wheel',stopRestore,{passive:true});root.addEventListener('touchstart',stopRestore,{passive:true});root.addEventListener('pointerdown',stopRestore);
 const restoreList=()=>{if(view!=='list'||restoreY==null)return;if(performance.now()>restoreUntil){restoreY=null;return;}const sc=scroller();if(sc)sc.scrollTop=restoreY;};
 const stateOf=()=>view==='list'?null:{view,level,point:view==='lesson'?point?.id||'':'',openNode:view==='map'?openNode:'',from:view==='map'?memo.mapFrom||'':''};
 const go=(next,replay=false)=>{if(view==='list'&&next!=='list')memo.listY=scroller()?.scrollTop||0;view=next;root.style.minHeight='';save();
  if(next==='list'&&memo.listY!=null){restoreY=memo.listY;restoreUntil=performance.now()+2500;}render();enter();
  if(next==='list'&&restoreY!=null)restoreList();else root.scrollIntoView?.({block:'start'});if(!replay)pageNav.push(stateOf());};
 /* ‹ › in the title bar: put the page back in the view of that history entry */
 const applyState=st=>{if(!st)return {view:'list'};const p=st.view==='lesson'?pointById(st.point):null;if(st.view==='lesson'&&!p)return {view:'list'};
  return {view:st.view==='lesson'||st.view==='map'||st.view==='album'?st.view:'list',level:LEVELS.includes(st.level)?st.level:level,point:p,openNode:st.openNode||'',from:st.from||''};};
 const takeState=st=>{const t=applyState(st);level=t.level||level;if(t.view==='lesson'){point=t.point;step=Math.min(STEPS.length-1,stepOf(point.id).step||0);}
  if(t.view==='map'){openNode=t.openNode;scene=null;piece=-1;memo.mapFrom=t.from;}return t.view;};
 const unlisten=pageNav.listen(st=>{if(!isCurrent()||!root.isConnected)return false;go(takeState(st),true);return true;});
 const openPoint=id=>{point=pointById(id);step=Math.min(STEPS.length-1,stepOf(id).step||0);memo.mapFrom='';go('lesson');};
 async function changeLevel(){const {openLevelPicker}=await import('./learning-level.js');const r=await openLevelPicker({api,esc,toast,current:memo.userLevel||null});
  if(!r||!isCurrent())return;memo.userLevel=r.level;level=startLevel(r.level);await load(false);render();}
 function render(){save();if(view==='lesson'&&point)return renderLesson();if(view==='map')return renderMap();if(view==='album')return renderAlbum();
  queueMicrotask(restoreList);root.innerHTML=listHTML(data||{},{locale,esc,level,userLevel:memo.userLevel,anki:memo.anki,group:(memo.groupOf||{})[level],rewards:memo.rewards,goal:memo.goal});
  root.querySelector('[data-album]')?.addEventListener('click',()=>go('album'));
  placePanel();watchPanel();
  root.querySelectorAll('[data-gtab]').forEach(b=>b.onclick=()=>{
   /* 2026-11-14 (recording: the stage map grew to five columns, so the chosen stage's lessons sat a screen below the card
      and every click looked dead; a 700 ms loop then forced the old scroll back against the wheel, the page jumping):
      the clicked card stays where it was on screen, its lessons open right under its row, and only when their first
      row would start below the window does the page glide down just enough to show it. Nothing holds the scroll after */
   const g=b.dataset.gtab,sc=root.closest('.main')||document.scrollingElement,before=b.getBoundingClientRect().top;
   memo.groupOf={...(memo.groupOf||{}),[level]:g};root.style.minHeight=root.offsetHeight+'px';switching=true;render();switching=false;
   const card=[...root.querySelectorAll('[data-gtab]')].find(x=>x.dataset.gtab===g),panel=root.querySelector('#gm-stage-panel');
   if(sc&&card)sc.scrollTop+=card.getBoundingClientRect().top-before;fx.push(card);
   if(sc&&panel){const box=sc===document.scrollingElement?{bottom:innerHeight}:sc.getBoundingClientRect(),r=panel.getBoundingClientRect(),
    over=r.top+Math.min(r.height,260)-box.bottom+16;if(over>0)sc.scrollBy({top:over,behavior:motion()?'smooth':'auto'});}});
  root.querySelector('[data-anki-get]')?.addEventListener('click',e=>{e.currentTarget.disabled=true;api('open_source',{url:ANKI_DECK}).catch(()=>toast?.('无法打开浏览器'));
   watchDownload();});
  root.querySelector('[data-anki-reload]')?.addEventListener('click',e=>{e.currentTarget.disabled=true;memo.anki=undefined;loadAnki(true);});
  root.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{level=b.dataset.level;memo.levelPicked=true;root.style.minHeight='';render();fx.focus(root.querySelector('.gm-hero'));
   });
  root.querySelector('[data-map]')?.addEventListener('click',()=>{openNode='';scene=null;piece=-1;memo.mapFrom='';go('map');});
  root.querySelector('[data-change-level]')?.addEventListener('click',changeLevel);
  root.querySelector('[data-goal-edit]')?.addEventListener('click',async()=>{const {openGoalPicker}=await import('./learning-goal.js');const g=await openGoalPicker({
   api,esc,toast,locale,current:memo.goal?.goal});if(g&&isCurrent()){memo.goal=g;render();}});
  if(!switching){const t=root.querySelector('[data-type]');if(t)fx.type(t,t.textContent);fx.focus(root.querySelector('.gm-hero-main'));if(motion())root.querySelectorAll('.gm-barcode i').forEach((b,
   i)=>b.animate([{transform:'scaleY(0)'},{transform:'none'}],{duration:320,delay:200+i*22,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));}
  root.querySelectorAll('[data-more]').forEach(b=>b.onclick=()=>{const box=root.querySelector(`[data-group="${b.dataset.more}"]`),open=box.classList.toggle('folded')===false;
   b.textContent=open?'收起 ↑':`展开全部 ${box.children.length} 课 ↓`;if(open&&motion())box.querySelectorAll('.extra').forEach((c,i)=>c.animate([{opacity:0,transform:'translateY(8px)'},
   {opacity:1,transform:'none'}],{duration:280,delay:Math.min(i,20)*20,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));});
  root.querySelectorAll('[data-point]').forEach(b=>b.onclick=()=>openPoint(b.dataset.point));
  if(motion())root.querySelectorAll('.gm-card:not(.extra)').forEach((c,i)=>c.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:260,
   delay:Math.min(i,20)*18,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards'}));}
 async function renderAlbum(){root.innerHTML=albumHTML([],{esc,readTime});root.querySelector('[data-back]').onclick=()=>go('list');let rows=[];try{rows=await api('learning_album');
  }catch{}if(!isCurrent()||view!=='album')return;root.innerHTML=albumHTML(rows,{esc,readTime});root.querySelector('[data-back]').onclick=()=>go('list');
  if(motion())root.querySelectorAll('.rw-card').forEach((c,i)=>c.animate([{opacity:0,transform:'translateY(14px) rotate(-1deg)',filter:'blur(4px)'},{opacity:1,transform:'none',
   filter:'none'}],{duration:420,delay:Math.min(i,24)*40,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));}
 /* rewards: every gain goes through here (the server keeps the total) */
 async function reward(kind,{ref='',streak=0,line=null,anchor=null}={}){try{const r=await api('learning_reward',{kind,ref,streak,line});memo.rewards=r;if(anchor)floatGain(anchor,
  r);if(r.collected)toast?.('收进战利品：'+[...line.text].slice(0,18).join('')+'…');return r;}catch{return null;}}
 function renderMap(anim=''){
  root.innerHTML=mapHTML(data||{},{locale,esc,open:openNode,scene,piece});save();
  /* 2026-11-14 (user: progress lost when going through the map): opened from a lesson, ← goes back to that lesson at
     the same step, not to the list */
  const fromLesson=memo.mapFrom==='lesson'&&point;const back=root.querySelector('[data-back]');
  if(fromLesson)back.textContent=locale==='en'?'← Back to the lesson':locale==='ja'?'← 講座に戻る':'← 回到这一课';
  back.onclick=()=>{memo.mapFrom='';go(fromLesson?'lesson':'list');};
  const pop=sel=>{const el=root.querySelector(sel);if(el&&motion())el.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:240,
   easing:'cubic-bezier(.2,.7,.2,1)'});};
  if(anim==='scene'&&motion())root.querySelectorAll('.gm-piece').forEach((b,i)=>b.animate([{opacity:0,transform:'translateY(14px) scale(.9)'},{opacity:1,transform:'none'}],
   {duration:320,delay:i*45,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'}));
  if(anim==='panel'){const card=root.querySelector('.gm-node.open');fx.focus(card);const say=card?.querySelector('.gm-bubble');if(say)fx.type(say,say.textContent);
   fx.push(root.querySelector('.gm-piece.picked'));fx.glitch(root.querySelector('.gm-piece.picked b'));}
  root.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>{scene=Number(b.dataset.scene);piece=-1;if(openNode&&!scenesOf(data)[scene].pieces.some(p=>p[2]===openNode))openNode='';
   renderMap('scene');fx.invert(root.querySelector('.gm-stage'));});
  root.querySelectorAll('[data-piece]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.piece);if(piece===i){piece=-1;openNode='';}else{piece=i;openNode=b.dataset.node;
   }renderMap('panel');});
  root.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{const id=b.dataset.toggle;if(openNode===id){openNode='';piece=-1;renderMap();return;}openNode=id;
   piece=-1;const L2=scenesOf(data),cur=scene??0;if(!L2[cur]?.pieces.some(p=>p[2]===id)&&L2.some(x=>x.pieces.some(p=>p[2]===id))){scene=L2.findIndex(s=>s.pieces.some(p=>p[2]===id));
   renderMap('scene');pop('.gm-node.open');}else renderMap('panel');});
  root.querySelectorAll('[data-point]').forEach(b=>b.onclick=()=>openPoint(b.dataset.point));
 }
 /* tap or hover the highlighted grammar → a small explanation */
 function explain(mark){
  root.querySelector('.gm-pop')?.remove();const p=pointById(mark.dataset.explain);if(!p)return;
  const pop=document.createElement('div');pop.className='gm-pop';pop.setAttribute('role','dialog');pop.innerHTML=`<b>${esc(loc(p.title,locale))}</b><p>${esc(loc(p.gist,locale))}</p><p class="gm-cap" lang="ja">${esc(p.form[0][0])} · ${esc(p.form[0][1])}</p>`;
  const host=mark.closest('.gm-ex')||mark.parentElement;host.style.position='relative';host.appendChild(pop);
  const a=mark.getBoundingClientRect(),h=host.getBoundingClientRect();pop.style.left=Math.max(0,Math.min(a.left-h.left,h.width-260))+'px';pop.style.top=(a.bottom-h.top+6)+'px';
  if(motion())pop.animate([{opacity:0,transform:'translateY(-3px)'},{opacity:1,transform:'none'}],{duration:150,easing:'ease-out'});
 }
 async function speak(text,button){button.disabled=true;try{audio?.pause();await (await import('./sentence-voice.js')).playSentence(api,text,button);}catch{toast?.(w.speakFail);
  }finally{button.disabled=false;}}
 function bindConj(){const box=root.querySelector('[data-conj]');if(!box)return;let wordIndex=0,form=CONJ_FORM[point.id]||'masu';
  const redraw=(animate)=>{const box=root.querySelector('[data-conj]');if(!box)return;const old=box.querySelector('.gm-ending')?.textContent;box.outerHTML=conjHTML(point.id,
   {locale,esc,wordIndex,form});const next=root.querySelector('[data-conj]');bindConjButtons(next);
   const end=next.querySelector('.gm-ending');if(animate&&motion()&&end&&end.textContent!==old)end.animate([{opacity:0,transform:'translateY(.4em)',filter:'blur(2px)'},
    {opacity:1,transform:'none',filter:'none'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'});};
  const bindConjButtons=b=>{b.querySelectorAll('[data-word]').forEach(x=>x.onclick=()=>{wordIndex=Number(x.dataset.word);redraw(true);});b.querySelectorAll('[data-form]').forEach(x=>x.onclick=()=>{
   form=x.dataset.form;redraw(true);});};
  bindConjButtons(box);}
 function bindParticles(real){const box=root.querySelector('[data-particles]');if(!box)return;const gaps=particleGaps(point,real);let held=null;
  const tiles=box.querySelectorAll('[data-tile]');
  const hold=t=>{held=t;tiles.forEach(x=>x.classList.toggle('held',x.dataset.tile===t));};
  const place=(slot,t)=>{const i=Number(slot.dataset.slot),q=gaps[i],line=slot.closest('.gm-gap-line'),msg=line.querySelector('.gm-gap-msg');if(!q||line.classList.contains('done'))return;
   if(t===q.answer){slot.textContent=t;slot.disabled=true;line.classList.add('done');line.querySelector('.gm-gap-tr').hidden=!q.translation;msg.textContent=w.lit;
    if(motion())line.animate([{backgroundColor:'color-mix(in srgb,var(--g-gold,#edb56e) 22%,transparent)'},{backgroundColor:'transparent'}],{duration:900,easing:'ease-out'});
    }
   else{const other=pointById(PARTICLE_POINT[t]);msg.textContent=w.notHere+`「${t}」`+(other?' —— '+loc(other.gist,locale):'');if(motion())slot.animate([{transform:'translateX(0)'},
    {transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:240});}
   hold(null);};
  tiles.forEach(t=>{t.onclick=()=>hold(held===t.dataset.tile?null:t.dataset.tile);pointerDrag(t,{over:'[data-slot]',onDrop:slot=>place(slot,t.dataset.tile)});});
  box.querySelectorAll('[data-slot]').forEach(s=>{s.onclick=()=>{if(held)place(s,held);};});}
 function showStep(n,animate=true){
  step=Math.max(0,Math.min(STEPS.length-1,n));save();keepStep(point?.id,step);const reached=stepOf(point?.id).max;
  root.querySelectorAll('[data-stepbody]').forEach(s=>s.hidden=Number(s.dataset.stepbody)!==step);
  root.querySelectorAll('[data-step]').forEach(b=>{const i=Number(b.dataset.step);b.classList.toggle('active',i===step);b.classList.toggle('passed',i!==step&&i<Math.max(step,reached));b.setAttribute('aria-selected',
   String(i===step));});
  root.querySelector('[data-prev]').disabled=step===0;root.querySelector('[data-nextstep]').hidden=step===STEPS.length-1;/* no step counter: the owner bans numbered steps and page counters */
  const body=root.querySelector(`[data-stepbody="${step}"]`);if(animate&&body){fx.focus(body);fx.push(root.querySelector('.gm-step-dot.active b'));}
  if(animate&&motion()&&STEPS[step]==='form')body.querySelectorAll('.gm-formulas li').forEach((li,i)=>li.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,
   transform:'none'}],{duration:300,delay:60+i*90,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards'}));
  root.querySelector('.gm-lesson')?.scrollIntoView?.({block:'nearest'});
 }
 function renderLesson(){
  root.innerHTML=lessonHTML(point,data||{},{locale,esc,step,reached:stepOf(point.id).max});fillRuby(root,{api,esc,isCurrent:()=>isCurrent()&&view==='lesson'});const real=data?.examples?.[point.id]||[];
  root.querySelector('[data-back]').onclick=()=>go('list');
  root.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{openNode=b.dataset.map;scene=null;piece=-1;memo.mapFrom='lesson';go('map');});
  root.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>showStep(Number(b.dataset.step)));
  root.querySelector('[data-prev]').onclick=()=>showStep(step-1);root.querySelector('[data-nextstep]').onclick=()=>showStep(step+1);
  root.querySelectorAll('[data-jd]').forEach(li=>li.querySelectorAll('.gm-jd-opt').forEach(b=>b.onclick=()=>{if(li.classList.contains('done'))return;const why=li.querySelector('.gm-jd-why');
   if(why.dataset.base==null)why.dataset.base=why.innerHTML;
   if(b.dataset.ok==='1'){li.classList.add('done');b.classList.add('hit');li.querySelectorAll('.gm-jd-opt').forEach(o=>{o.disabled=true;const p=o.querySelector('.gm-jd-plain'),
    m=o.querySelector('.gm-jd-marked');if(p&&m){p.hidden=true;m.hidden=false;}});why.hidden=false;why.innerHTML=`<b class="gm-jd-yes">${esc(quote('praise')[0])}</b>`+(why.dataset.base||'');
    fx.invert(b);fx.push(b);fx.burst(b);reward('find',{ref:point.id,anchor:b});}
   else{b.classList.add('miss');b.disabled=true;const f=b.dataset.form;why.hidden=false;why.innerHTML=`<b class="gm-jd-no">${f?`「${esc(f)}」放在这里不自然`:'不是这个哦'}</b><span>再看看另外的选项——${esc(loc(point.gist,locale))}</span>`;
    fx.glitch(b);}}));
  root.querySelector('[data-learned]').onclick=async event=>{const on=event.currentTarget.dataset.learned==='1';try{const r=await api('grammar_learned',{point:point.id,
   learned:on});data={...(data||{}),progress:{...(data?.progress||{}),[point.id]:r}};data.completion=completion(data.progress);const lv=levelOf(point),n=on?nextAfter(data.progress,point,lv,memo.goal):null;
   if(on){const same=pointsOf(lv).filter(p=>p.group===point.group),cleared=same.every(p=>data.progress?.[p.id]?.learned);const rr=await reward(cleared?'clear':'learned',
    {ref:point.id});const name=loc(point.title,locale).split(/\s*——\s*/)[0];stamp({kind:cleared?'clear':'praise',title:cleared?`${lv} · ${same.length} / ${same.length}`:`${name} · 掌握`,
    sub:n?`下一课：${loc(n.title,locale).split(/\s*——\s*/)[0]}`:'',r:rr,esc});}
   if(on)keepStep(point.id,step,STEPS.length);if(n){memo.groupOf={...(memo.groupOf||{}),[lv]:n.group};openPoint(n.id);}else renderLesson();}catch(error){toast?.(String(error?.message||error));}};
  root.querySelectorAll('[data-anki]').forEach(b=>b.onclick=async()=>{const e=real[Number(b.dataset.anki)];b.disabled=true;try{await api('grammar_anki',{point:point.id,
   title:loc(point.title,'zh'),gist:loc(point.gist,'zh'),example:e});b.textContent=w.ankiDone;}catch{b.disabled=false;toast?.(w.ankiFail);}});
  root.querySelectorAll('[data-speak]').forEach(b=>b.onclick=()=>speak(b.dataset.speak,b));
  root.querySelectorAll('[data-explain]').forEach(m=>{m.onclick=e=>{e.stopPropagation();explain(m);};m.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();
   explain(m);}};m.onmouseenter=()=>explain(m);});
  root.onclick=e=>{if(!e.target.closest('.gm-pop,[data-explain]'))root.querySelector('.gm-pop')?.remove();};
  bindConj();bindParticles(real);
  {const say=root.querySelector('.gm-step-intro:not([hidden]) .gm-bubble');if(say)fx.type(say,say.textContent);}
  /* practice: drag (or tap) the answer into the gap; a miss shows how it attaches, then a line of the same kind */
  const pool=exercisesFor(point,[...real,...ankiLines(point)],10);let order=pool.slice(0,4),rest=pool.slice(4),i=0,answered=null,retry=false,score=0,streak=0;
  /* after the last line: the score and what to do next, never back to the first line */
  const done=()=>{const all=order.length,good=score>=Math.ceil(all*0.75);box.innerHTML=`<div class="gm-done"><span class="gm-tag"><i></i>practice clear</span><b class="gm-done-score">${score}<small>/ ${all}</small></b><p>${good?'全部拿下！这个语法已经是你的魔法了——标记掌握，去下一课吧！':'还差一点点。再来一轮，魔力回路就接通了！'}</p><div class="gm-done-actions"><button type="button" class="primary" data-again>再练一轮</button></div></div>`;
   fx.focus(box.querySelector('.gm-done'));if(good){fx.burst(box.querySelector('.gm-done-score'));reward('practice',{ref:point.id,anchor:box.querySelector('.gm-done-score')});
   }box.querySelector('[data-again]').onclick=()=>{order=[...order.slice(1),order[0]];i=0;score=0;answered=null;retry=false;draw();};};const box=root.querySelector('[data-quiz]');
  const draw=()=>{if(!order.length){box.innerHTML=`<p class="gm-cap">${esc(w.finished)}</p>`;return;}box.innerHTML=quizHTML(point,order[i],{locale,esc,answered,
   index:i,total:order.length,retry});
   const pick=async ch=>{if(answered!=null)return;answered=ch;const right=ch===order[i].answer;if(right){score++;streak++;}else streak=0;draw();const blank=box.querySelector('.gm-blank');
    if(right){fx.invert(blank);fx.push(blank);fx.burst(blank);const q=order[i],head=box.querySelector('.gm-verdict.ok b');if(head&&streak>=2){const [line,src]=quote('praise');
    head.innerHTML=`${esc(line)} <small class="rw-src">めぐみん · ${esc(src)} · ${streak} 连对</small>`;}reward('answer',{ref:point.id,streak,line:q.origin==='history'||q.origin==='script'?{
    text:q.text,title:q.title,translation:q.translation,origin:q.origin,readAt:q.readAt}:null,anchor:blank});}else fx.glitch(box.querySelector('.gm-q'));try{const r=await api('grammar_answer',
    {point:point.id,correct:answered===order[i].answer});data={...(data||{}),progress:{...(data?.progress||{}),[point.id]:r}};data.completion=completion(data.progress);
    save();}catch{}};
   box.querySelectorAll('[data-choice]').forEach(b=>{b.onclick=()=>pick(b.dataset.choice);if(answered==null)pointerDrag(b,{over:'[data-drop]',onDrop:()=>pick(b.dataset.choice)});
    });
   box.querySelector('[data-next]')?.addEventListener('click',()=>{answered=null;retry=false;if(i+1>=order.length){done();return;}i++;draw();});
   box.querySelector('[data-retry]')?.addEventListener('click',()=>{const missed=order[i],next=rest.shift()||order.find((q,k)=>k!==i&&q.text!==missed.text)||missed;
    rest.push(missed);order.splice(i+1,0,next);answered=null;retry=true;i=i+1;draw();});};
  draw();
 }
 /* wait for the .apkg to land in Downloads, import it, then read the cards again (10 minutes at most) */
 function watchDownload(){const since=Date.now()-5000,until=Date.now()+600000;let size=-1;const say=t=>{const el=root.querySelector('[data-anki-state]');if(el)el.textContent=t;
  };say('等待下载……在打开的 AnkiWeb 页面上点 Download');
  const tick=async()=>{if(!isCurrent()||Date.now()>until){say('等太久了，下载好之后点「我已导入，刷新」');return;}try{const r=await api('grammar_bluebook_import',{since,size});
    if(!r.found){setTimeout(tick,2000);return;}if(!r.ready){size=r.size;say(`正在下载 ${r.file} ……`);setTimeout(tick,1500);return;}
    if(r.imported){say(`已导入 ${r.file}，正在读取……`);setTimeout(()=>loadAnki(true),2500);return;}
    say(`已用 Anki 打开 ${r.file}，在 Anki 里确认导入后点「我已导入，刷新」`);}catch{setTimeout(tick,3000);}};tick();}
 function loadAnki(tell){memo.anki=null;api('grammar_bluebook').then(r=>{memo.anki=r?.available?r:{available:false,points:[]};if(!r?.available){if(tell)toast?.('还没在你的 Anki 里找到蓝宝书语法牌组：导入后先关掉再打开一次 Anki 试试');
  if(isCurrent()&&view==='list')render();return;}if(tell)toast?.(`读到 ${r.points.length} 条语法卡，已并进课程`);useAnkiCards(r.points);if(data)data={...data,examples:{...(r.examples||{
  }),...(data.examples||{})}};memo.data=data;if(isCurrent()&&view!=='lesson')render();}).catch(()=>{memo.anki={available:false,points:[]};});}
 if(memo.anki===undefined)loadAnki(false);
 if(memo.rewards===undefined){memo.rewards=null;api('learning_rewards').then(r=>{memo.rewards=r;if(isCurrent()&&view==='list')render();}).catch(()=>{});}
 else if(memo.anki?.points)useAnkiCards(memo.anki.points);
 if(memo.goal===undefined){memo.goal=null;api('learning_goal').then(g=>{memo.goal=g;if(isCurrent()&&view==='list')render();}).catch(()=>{});}
 if(memo.userLevel===undefined)api('learning_level').then(r=>{memo.userLevel=r?.level||null;if(!memo.levelPicked){level=startLevel(memo.userLevel);save();}if(isCurrent()&&view==='list')render();
  }).catch(()=>{memo.userLevel=null;});
 {const p=pageNav.take();if(p){view=takeState(p.state);if(view==='list'&&memo.listY!=null){restoreY=memo.listY;restoreUntil=performance.now()+2500;}}
  else{if(view==='list'&&memo.listY!=null){restoreY=memo.listY;restoreUntil=performance.now()+2500;}pageNav.replace(stateOf());}}
 render();restoreList();
 if(!data)await load(false);
 if(isCurrent()&&(Date.now()-memo.at>FRESH_MS||data?.pending))load(true);
 return ()=>{clearTimeout(timer);unlisten();};
}
