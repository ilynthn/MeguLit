// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 (user picked) game detail 关联单词 = "ESR 巨字名录" and 收录句子 = "Grail 巨字台词" (mocks in scratch/detail-options-v2).
   Words: a stacked list of giant words, only the current one full-bright with ruby and a red bar; meanings, mastery and ×count run on fixed
   tracks; the right column carries the big serif word, times met in this game, meanings, 查词典, the first / latest line and a "met by day" strip.
   Sentences: three layers (see the sentences section): the chosen line set huge, a scene wall grouped by saved frame, a searchable windowed list.
   Data is only what services/game-detail.cjs returns: no speaker or furigana are stored for saved lines; the only pictures are sentence.scene frames.
   Motion: GSAP (loaded by gsap-loader.js) on transform / opacity only, one gsap.context per mount, reverted on tab change or page swap;
   reduced motion or no GSAP = the same page without movement. */
import {loadGsap} from './gsap-loader.js';
import {exAttr,setExample} from './example-ruby.js';

const L={
 zh:{words:'关联单词',sentences:'收录句子',total:'本作单词',all:'全部',groups:['新词','学习中','已掌握'],levels:['新收录','学习中','熟悉','掌握','熟练'],
  order:'按最近遇见排列 · 悬停预览，点击或 ↑ ↓ 选中',search:'搜索单词、读音或释义',filter:'按掌握度筛选',list:'单词列表',shown:'已显示',more:n=>`再加载 ${n} 个`,
  recent:n=>`最近遇见的 ${n} 个`,current:'当前单词',inAnki:'已在 Anki',notAnki:'未加入 Anki',met:'本作遇见',metTitle:n=>`本作中遇见 ${n} 次`,otherMeans:n=>`另 ${n} 义`,
  less:'收起',dict:'查词典',first:'首见',latest:'最近',mastery:'掌握度',byDay:'遇见日期',byDayAria:'按日期的遇见次数',created:'收录',
  none:q=>`这部作品里还没遇到过「${q}」`,noneSub:'关联单词只收你在本作里查过的词，可以换成读音或中文释义再找，或者去词典里查它',clear:'清除搜索',dictQ:q=>`在词典中查「${q}」`,
  noWords:'还没有关联单词',noWordsSub:'在游戏里点一个词或拖选一段台词查词，查过的词会和这部作品关联起来，按最近遇见排在这里',launch:'启动游戏',
  count:n=>`<b>${n}</b> 句`,autoShare:'加卡时留下',lede:'你最近收下的一句',ledeOther:'收下的台词',ledeSub:'点下方卡片换上来',noTr:'没有保存译文',
  manual:'手动收藏',auto:'加卡时留下',play:'朗读',playTitle:'朗读（有游戏原声时播原声）',copy:'复制',copied:'已复制这一句',remove:'取消收藏',confirm:'确认取消收藏',removed:'已取消收藏',
  playFail:'暂时无法朗读这一句',copyFail:'复制失败',removeFail:'暂时无法取消收藏',moreS:n=>`再加载 ${n} 句`,cards:'全部收录的台词',current2:'正在看',today:'今天',yesterday:'昨天',
  emptyLede:'这一作还空着',emptyBig:['还没有收下','任何一句','台词。'],emptyTeach:'读到喜欢的台词，随手收下。整句原文和译文会一起存进来，之后能朗读、复习、做成 Anki 卡片',
  how:[['在游戏里','点一个词','或在台词上拖选一段文字，弹出查词卡'],['查词卡底部 · 最常用','☆ 收藏句子','这一整句和它的译文一起存进来'],['加卡时顺手留下','加入 Anki','把词加入 Anki 时，它所在的那一句会自动收进来']],
  emptyEnd:'收下第一句后，这里会换成',emptyWall:'你的台词墙'},
 ja:{words:'関連単語',sentences:'保存した例文',total:'この作品の単語',all:'すべて',groups:['新語','学習中','習得済み'],levels:['新規','学習中','見覚えあり','習得','熟知'],
  order:'最近出会った順 · ホバーでプレビュー、クリックか ↑ ↓ で選択',search:'単語・読み・意味で検索',filter:'習得度で絞り込む',list:'単語リスト',shown:'表示中',more:n=>`さらに ${n} 語`,
  recent:n=>`最近の ${n} 語`,current:'選択中の単語',inAnki:'Anki に追加済み',notAnki:'Anki 未追加',met:'この作品で',metTitle:n=>`この作品で ${n} 回`,otherMeans:n=>`ほか ${n} 件`,
  less:'閉じる',dict:'辞書で調べる',first:'初出',latest:'最近',mastery:'習得度',byDay:'出会った日',byDayAria:'日ごとの回数',created:'登録',
  none:q=>`この作品では「${q}」にまだ出会っていません`,noneSub:'関連単語はこの作品で調べた語だけです。読みや意味で探すか、辞書で調べてください',clear:'検索をクリア',dictQ:q=>`辞書で「${q}」を調べる`,
  noWords:'関連単語はまだありません',noWordsSub:'ゲーム中に単語をクリックするか台詞をドラッグして調べると、この作品に関連付けられて最近出会った順に並びます',launch:'ゲームを起動',
  count:n=>`<b>${n}</b> 文`,autoShare:'カード追加時',lede:'最近保存した一文',ledeOther:'保存した台詞',ledeSub:'下のカードで切り替え',noTr:'訳文は保存されていません',
  manual:'手動で保存',auto:'カード追加時',play:'読み上げ',playTitle:'再生（ゲーム音声があれば原音）',copy:'コピー',copied:'コピーしました',remove:'保存を解除',confirm:'解除を確定',removed:'保存を解除しました',
  playFail:'再生できませんでした',copyFail:'コピーできませんでした',removeFail:'解除できませんでした',moreS:n=>`さらに ${n} 文`,cards:'保存したすべての台詞',current2:'表示中',today:'今日',yesterday:'昨日',
  emptyLede:'まだ空です',emptyBig:['まだ一文も','保存して','いません。'],emptyTeach:'気に入った台詞をそのまま保存。原文と訳文が一緒に残り、読み上げ・復習・Anki カードに使えます',
  how:[['ゲーム中に','単語をクリック','または台詞をドラッグすると辞書カードが開きます'],['辞書カードの下 · いちばん手軽','☆ 文を保存','その一文と訳文を保存します'],['カード追加のついでに','Anki に追加','単語を Anki に追加すると、その文も自動で保存されます']],
  emptyEnd:'最初の一文を保存すると、ここが',emptyWall:'あなたの台詞の壁に'},
 en:{words:'Linked words',sentences:'Saved sentences',total:'Words in this game',all:'All',groups:['New','Learning','Mastered'],levels:['New','Learning','Familiar','Known','Mastered'],
  order:'Most recently met first · hover to preview, click or ↑ ↓ to select',search:'Search words, readings or meanings',filter:'Filter by mastery',list:'Word list',shown:'Showing',more:n=>`Load ${n} more`,
  recent:n=>`the ${n} most recent`,current:'Current word',inAnki:'In Anki',notAnki:'Not in Anki',met:'Met here',metTitle:n=>`Met ${n} times in this game`,otherMeans:n=>`${n} more`,
  less:'Collapse',dict:'Dictionary',first:'First met',latest:'Latest',mastery:'Mastery',byDay:'Days met',byDayAria:'Times met per day',created:'Saved',
  none:q=>`“${q}” has not come up in this game`,noneSub:'Linked words are the words you looked up in this game. Try a reading or a meaning, or look it up in the dictionary',clear:'Clear search',dictQ:q=>`Look up “${q}”`,
  noWords:'No linked words yet',noWordsSub:'Click a word or drag across a line in the game to look it up; looked-up words are linked to this game and listed here, most recent first',launch:'Launch game',
  count:n=>`<b>${n}</b> lines`,autoShare:'Kept from cards',lede:'The line you saved last',ledeOther:'A saved line',ledeSub:'Pick a card below to bring it up',noTr:'No translation saved',
  manual:'Saved by hand',auto:'Kept from a card',play:'Play',playTitle:'Play (the game voice when there is one)',copy:'Copy',copied:'Line copied',remove:'Remove',confirm:'Confirm remove',removed:'Removed',
  playFail:'Could not play this line',copyFail:'Copy failed',removeFail:'Could not remove it',moreS:n=>`Load ${n} more`,cards:'All saved lines',current2:'Showing',today:'Today',yesterday:'Yesterday',
  emptyLede:'Nothing here yet',emptyBig:['No lines','saved','yet.'],emptyTeach:'Keep the lines you like as you play. The line and its translation are saved together, ready to play back, review or turn into Anki cards',
  how:[['In the game','Click a word','or drag across a line to open the lookup card'],['Lookup card · the usual way','☆ Save sentence','keeps the whole line and its translation'],['Kept while carding','Add to Anki','adding a word to Anki keeps its line here too']],
  emptyEnd:'After your first line this becomes',emptyWall:'your wall of lines'}};
const tx=locale=>L[locale]||L.zh;

const ICON=(d,c='')=>`<svg class="dc-ic${c?' '+c:''}" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square">${d}</svg>`;
const IC={chev:ICON('<path d="M4 6l4 4 4-4"/>','dc-ic-chev'),book:ICON('<path d="M2.5 3.5h4.5v9H2.5zM9 3.5h4.5v9H9z"/>'),x:ICON('<path d="M4 4l8 8M12 4l-8 8"/>'),
 search:ICON('<circle cx="7" cy="7" r="4"/><path d="M10 10l3.5 3.5"/>'),play:ICON('<path d="M5 3.5l7 4.5-7 4.5z"/>'),copy:ICON('<path d="M5.5 5.5h7v7h-7z"/><path d="M3.5 10.5v-7h7"/>'),
 trash:ICON('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/>')};

const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
/* GSAP only when it is already loaded (warmed by the detail page): an intro must start in the same frame as the markup or it would flash */
const motion=()=>!reduced()&&window.gsap?window.gsap:null;
const toMs=ts=>{const n=Number(ts)||0;return n>1e12?n:n*1000;};
const dayKey=ms=>{const d=new Date(ms);return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();};
const md=ms=>{const d=new Date(ms);return `${d.getMonth()+1}/${d.getDate()}`;};
function when(ts,locale,t){const ms=toMs(ts);if(!ms)return '';const d=new Date(ms),now=new Date(),hm=d.toLocaleTimeString(locale==='en'?'en-US':locale==='ja'?'ja-JP':'zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
 if(dayKey(ms)===dayKey(now.getTime()))return `${t.today} ${hm}`;if(dayKey(ms)===dayKey(now.getTime()-86400000))return `${t.yesterday} ${hm}`;
 const date=d.toLocaleDateString(locale==='en'?'en-US':locale==='ja'?'ja-JP':'zh-CN',{month:locale==='en'?'short':'long',day:'numeric',...(d.getFullYear()!==now.getFullYear()?{year:'numeric'}:{})});
 return `${date} ${hm}`;}
function dateOnly(ts,locale){const ms=toMs(ts);if(!ms)return '';const d=new Date(ms),now=new Date();
 return d.toLocaleDateString(locale==='en'?'en-US':locale==='ja'?'ja-JP':'zh-CN',{month:locale==='en'?'short':'long',day:'numeric',...(d.getFullYear()!==now.getFullYear()?{year:'numeric'}:{})});}

/* ---------- shared text helpers ---------- */
export function meanings(value){let list=value;if(typeof list==='string'){try{list=JSON.parse(list);}catch{list=list.split(/[;；\n]/);}}
 if(!Array.isArray(list))list=[];return list.flatMap(item=>typeof item==='string'?[item]:Array.isArray(item?.glossary)?item.glossary:item?.gloss?[item.gloss]:item?.text?[item.text]:[])
  .map(s=>String(s).replace(/<[^>]+>/g,'').trim()).filter(Boolean);}
const hira=s=>String(s||'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const isKana=c=>/[ぁ-ゟ゠-ヿ]/.test(c);
/* the dictionary reading over the kanji only: kana shared at the start or end of spelling and reading stays outside the ruby (眩しい → 眩(まぶ)しい) */
export function rubyHTML(spelling,reading,esc){const s=[...String(spelling||'')],r=[...String(reading||'')];
 if(!r.length||!s.some(c=>/[㐀-鿿々]/.test(c))||hira(spelling)===hira(reading))return esc(spelling);
 let a=0;while(a<s.length&&a<r.length&&isKana(s[a])&&hira(s[a])===hira(r[a]))a++;
 let b=0;while(b<s.length-a&&b<r.length-a&&isKana(s[s.length-1-b])&&hira(s[s.length-1-b])===hira(r[r.length-1-b]))b++;
 const base=s.slice(a,s.length-b).join(''),rt=r.slice(a,r.length-b).join('');if(!base||!rt)return esc(spelling);
 return esc(s.slice(0,a).join(''))+`<ruby>${esc(base)}<rt>${esc(rt)}</rt></ruby>`+esc(s.slice(s.length-b).join(''));}
/* a line with its highlight [start,end) in code points; out-of-range highlights are ignored */
function marked(text,ranges,esc,tag='em'){const chars=[...String(text||'')],ok=(ranges||[]).filter(h=>Number.isInteger(h.start)&&Number.isInteger(h.end)&&h.start>=0&&h.end>h.start&&h.end<=chars.length)
  .sort((x,y)=>x.start-y.start);let out='',i=0;for(const h of ok){if(h.start<i)continue;out+=esc(chars.slice(i,h.start).join(''))+`<${tag}>${esc(chars.slice(h.start,h.end).join(''))}</${tag}>`;i=h.end;}
 return out+esc(chars.slice(i).join(''));}

/* ---------- lifecycle: one gsap.context per mount, reverted when the tab changes or the page is replaced ---------- */
function lifecycle(root){const gsap=window.gsap,ctx=gsap?gsap.context(()=>{},root):null,offs=[];let done=false;
 const main=root.closest('.main')||root.parentElement;const watch=main?new MutationObserver(()=>{if(!root.isConnected)stop();}):null;watch?.observe(main,{childList:true});
 function stop(){if(done)return;done=true;watch?.disconnect();offs.splice(0).forEach(f=>{try{f();}catch{}});try{ctx?.revert();}catch{}}
 return {add:fn=>ctx?ctx.add(fn):fn(),off:f=>offs.push(f),stop,get live(){return !done&&root.isConnected;}};}

/* ===================================================================== words ===================================================================== */
const level=s=>Math.max(0,Math.min(4,Number(s)||0));
const group=s=>{const v=level(s);return v>=3?'2':v>=1?'1':'0';};
const ticks=s=>[0,1,2,3,3][level(s)];
const meter=(s,t,esc,lg=false)=>`<span class="esr-mt${lg?' lg':''}" data-s="${ticks(s)}" role="img" aria-label="${esc(t.mastery+'：'+t.levels[level(s)])}"><span class="esr-mt-b" aria-hidden="true"><i></i><i></i><i></i></span>${esc(t.levels[level(s)])}</span>`;
function meansFit(list,k,max){const out=[];let n=0;for(const m of list.slice(0,k)){if(out.length&&n+m.length>max)break;out.push(m);n+=m.length+2;}return out;}
const STEP=40,TOP=18;

export function mountWords(target,{words=[],counts,locale='zh',esc,state,animate=false,onLookup,onLaunch,canLaunch=true}){
 const t=tx(locale),life=lifecycle(target);
 const all=words.map(w=>({...w,means:meanings(w.definitions),met:Number(w.met)||0}));
 const byStatus=counts?.byStatus||null,groupCount=k=>byStatus?Object.entries(byStatus).filter(([s])=>group(s)===k).reduce((a,[,n])=>a+Number(n||0),0):all.filter(w=>group(w.status)===k).length;
 const total=Number(counts?.total)||all.length;
 state.filter??='all';state.q??='';state.shown??=STEP;state.open=false;
 const matches=w=>{if(state.filter!=='all'&&group(w.status)!==state.filter)return false;const q=state.q.trim().toLowerCase();if(!q)return true;
  return String(w.spelling||'').toLowerCase().includes(q)||String(w.reading||'').toLowerCase().includes(q)||hira(w.reading).includes(hira(q))||w.means.some(m=>m.toLowerCase().includes(q));};
 let list=[];const curWord=()=>list.find(w=>w.id===state.cur)||null;

 if(!all.length){
  target.innerHTML=`<section class="esr is-empty" aria-label="${esc(t.words)}"><header class="esr-h"><div class="esr-hl"><span class="esr-tot"><span class="esr-k">${esc(t.total)}</span><b>0</b></span></div></header>
   <div class="esr-none" role="status"><span class="esr-w esr-w-none" lang="${locale==='en'?'en':'zh'}">${esc(t.noWords)}</span><p>${esc(t.noWordsSub)}</p>${canLaunch&&onLaunch?`<div class="esr-act"><button type="button" class="primary" data-launch>${esc(t.launch)}</button></div>`:''}</div></section>`;
  target.querySelector('[data-launch]')?.addEventListener('click',e=>onLaunch(e.currentTarget));
  const gsap=animate&&motion();if(gsap)life.add(()=>{gsap.timeline({defaults:{duration:.6,ease:'power3.out'}}).from(target.querySelectorAll('.esr-h > *, .esr-none > *'),{y:18,opacity:0,stagger:.08});});
  return life.stop;}

 const chips=()=>[['all',t.all,total],...t.groups.map((name,i)=>[String(i),name,groupCount(String(i))])].map(([key,name,n])=>
  `<button type="button" role="tab" class="esr-fb${state.filter===key?' on':''}" data-f="${key}" aria-selected="${state.filter===key}" tabindex="${state.filter===key?0:-1}">${esc(name)}<b>${n}</b></button>`).join('');
 target.innerHTML=`<section class="esr" aria-label="${esc(t.words)}">
  <header class="esr-h"><div class="esr-hl"><span class="esr-tot"><span class="esr-k">${esc(t.total)}</span><b>${total}</b></span><div class="esr-f" role="tablist" aria-label="${esc(t.filter)}">${chips()}</div></div>
   <div class="esr-hr"><p class="esr-k">${esc(t.order)}</p><label class="esr-q">${IC.search}<input type="search" autocomplete="off" spellcheck="false" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}" value="${esc(state.q)}"></label></div></header>
  <div class="esr-body"><div class="esr-lw"><div class="esr-vp"></div><div class="esr-foot"></div></div><aside class="esr-d" aria-live="polite"></aside></div></section>`;
 const root=target.querySelector('.esr'),vp=root.querySelector('.esr-vp'),foot=root.querySelector('.esr-foot'),side=root.querySelector('.esr-d'),input=root.querySelector('.esr-q input');

 const row=w=>{const len=[...String(w.spelling||'')].length,sel=w.id===state.cur;
  return `<li class="esr-row${sel?' is-cur':''}" role="option" id="esr-o-${w.id}" data-id="${w.id}" aria-selected="${sel}" tabindex="${sel?0:-1}" style="--len:${Math.max(3,len)}">`+
   `<span class="esr-w" lang="ja">${rubyHTML(w.spelling,w.reading,esc)}</span><span class="esr-g"><span class="esr-gm">${meansFit(w.means,3,15).map(esc).join('<i class="sep">·</i>')||'—'}</span>${meter(w.status,t,esc)}`+
   `<span class="cnt" title="${esc(t.metTitle(w.met))}">×${w.met}</span></span></li>`;};

 /* the met-by-day strip: the last six days this word turned up here, its first day marked when it is among them */
 function strip(w){const times=(w.times||[]).map(toMs).filter(Boolean);if(!times.length)return '';const days=new Map();for(const ms of times){const k=dayKey(ms);days.set(k,{ms,n:(days.get(k)?.n||0)+1});}
  const keys=[...days.keys()].sort((a,b)=>a-b),shown=keys.slice(-6),max=Math.max(...shown.map(k=>days.get(k).n)),firstKey=dayKey(toMs(w.first_at)||times[0]);
  const range=keys.length>1?`${md(days.get(keys[0]).ms)}–${md(days.get(keys[keys.length-1]).ms)}`:md(days.get(keys[0]).ms);
  return `<div class="esr-st-day"><dt class="esr-ch-h"><span>${esc(t.byDay)}</span><span>${range}</span></dt><dd><ol class="esr-ch" aria-label="${esc(t.byDayAria)}" style="--cols:${Math.max(shown.length,3)}">${shown.map(k=>{const d=days.get(k);
   return `<li class="${k===firstKey?'first':''}" style="--esr-bh:${(d.n/max).toFixed(3)}"><b>${d.n}</b><i></i><span>${md(d.ms)}</span></li>`;}).join('')}</ol></dd></div>`;}
 function exampleLine(line,label){if(!line?.text)return '';return `<p class="esr-ex" lang="ja"${exAttr(line.text,line.ruby,esc)}>「${marked(line.text,[line],esc)}」</p><p class="esr-src">${esc(label)} ${esc(dateOnly(line.at,locale))}</p>`;}
 const meanList=w=>(state.open?w.means:w.means.slice(0,4)).map((m,i)=>`<li${i===0?' class="lead"':''}>${esc(m)}</li>`).join('')||'<li class="lead">—</li>';
 function detail(w){if(!w)return '';const extra=w.means.length-4;
  const more=extra>0?`<button type="button" class="esr-more" aria-expanded="${state.open}">${esc(state.open?t.less:t.otherMeans(extra))}${IC.chev}</button>`:'';
  const plate=w.jlpt?`<div class="esr-plate" role="img" aria-label="JLPT ${esc(w.jlpt)}"><small>JLPT</small><strong>${esc(w.jlpt)}</strong><small>${esc(t.created)} ${esc(md(toMs(w.created_at)))}</small></div>`:'';
  const latest=w.latest&&w.first&&(w.latest.text!==w.first.text)?exampleLine(w.latest,t.latest):'';
  return `<div class="esr-cap"><span>${esc(t.current)}</span><span${w.inAnki?' class="on"':''}>${esc(w.inAnki?t.inAnki:t.notAnki)}</span></div>
   <div class="esr-th"><h3 class="esr-t" lang="ja" style="--len:${Math.max(2,[...String(w.spelling||'')].length)}">${rubyHTML(w.spelling,w.reading,esc)}</h3><span class="esr-n" title="${esc(t.metTitle(w.met))}">${esc(t.met)}<b>×${w.met}</b></span></div>
   <i class="esr-bar" aria-hidden="true"></i>
   <div class="esr-mid${plate?'':' no-plate'}">${plate}<div class="esr-ms"><ol class="esr-mean">${meanList(w)}</ol>${more}</div></div>
   ${onLookup?`<div class="esr-act"><button type="button" class="secondary" data-dict>${IC.book}${esc(t.dict)}</button></div>`:''}
   ${exampleLine(w.first,t.first)}${latest}
   <dl class="esr-stats"><div><dt>${esc(t.mastery)}</dt><dd>${meter(w.status,t,esc,true)}</dd></div>${strip(w)}</dl>`;}
 function noResults(){const q=state.q.trim();return `<div class="esr-none" role="status"><span class="esr-w" lang="ja">${esc(q||'—')}</span><p>${esc(q?t.none(q):t.noneSub)}</p>${q?`<p class="esr-none-sub">${esc(t.noneSub)}</p>`:''}
  <div class="esr-act">${q?`<button type="button" class="secondary" data-clear>${IC.x}${esc(t.clear)}</button>${onLookup?`<button type="button" class="secondary" data-dict-q>${IC.book}${esc(t.dictQ(q))}</button>`:''}`:`<button type="button" class="secondary" data-clear>${IC.x}${esc(t.clear)}</button>`}</div></div>`;}

 const listEl=()=>vp.querySelector('.esr-list');
 /* the current row's centre sits at 40% of the window; near the head of the list the list rests at the top instead of leaving a void above */
 const centreY=()=>{const r=vp.querySelector('.esr-row.is-cur');if(!r)return 0;const y=Math.min(TOP,vp.clientHeight*.4-(r.offsetTop+r.offsetHeight/2));vp.classList.toggle('at-top',y>=TOP);return y;};
 function place(glide){const l=listEl();if(!l)return;const y=centreY(),gsap=motion();
  if(gsap&&glide)life.add(()=>gsap.to(l,{y,duration:.7,ease:'power4.inOut',overwrite:true}));else if(window.gsap)window.gsap.set(l,{y});else l.style.transform=`translateY(${y}px)`;}
 function cutIn(tl,at){const d=side,g=window.gsap;if(!d.firstElementChild)return tl;
  tl.from(d.querySelector('.esr-t'),{yPercent:60,rotationX:-80,opacity:0,transformPerspective:700,transformOrigin:'50% 100%',duration:.6,ease:'power4.out'},at)
   .from(d.querySelector('.esr-bar'),{scaleX:0,transformOrigin:'0 50%',duration:.4,ease:'expo.out'},'<.12')
   .from(d.querySelector('.esr-n b'),{yPercent:100,opacity:0,duration:.35,ease:'power3.out'},'<');
  const plate=d.querySelector('.esr-plate');if(plate)tl.from(plate,{rotationY:-95,transformPerspective:600,transformOrigin:'0% 50%',duration:.55,ease:'expo.out'},'<.04');
  tl.from(d.querySelectorAll('.esr-mean li, .esr-more, .esr-act > *'),{x:-14,opacity:0,duration:.35,stagger:.04,ease:'power3.out'},'<.08')
   .from(d.querySelectorAll('.esr-ex, .esr-src'),{y:8,opacity:0,duration:.4,stagger:.04,ease:'power3.out'},'<.04')
   .from(d.querySelectorAll('.esr-stats > div'),{opacity:0,y:8,duration:.4,stagger:.05,ease:'power3.out'},'<');
  const bars=d.querySelectorAll('.esr-ch li i');if(bars.length)tl.from(bars,{scaleY:0,transformOrigin:'50% 100%',duration:.5,stagger:.04,ease:'expo.out'},'<.1');
  return tl;}
 function paintDetail(){side.innerHTML=detail(curWord());}
 function renderList(){list=all.filter(matches);if(!list.some(w=>w.id===state.cur))state.cur=list[0]?.id??null;
  const idx=list.findIndex(w=>w.id===state.cur);if(idx>=state.shown)state.shown=Math.ceil((idx+1)/STEP)*STEP;
  const shown=list.slice(0,state.shown);
  vp.innerHTML=list.length?`<ul class="esr-list" role="listbox" aria-label="${esc(t.list)}"${state.cur!=null?` aria-activedescendant="esr-o-${state.cur}"`:''}>${shown.map(row).join('')}</ul>`:noResults();
  const capped=total>all.length&&state.filter==='all'&&!state.q.trim();
  foot.innerHTML=list.length?`<span class="esr-prog"><span>${esc(t.shown)} <b>${shown.length}</b> / ${list.length}${capped?` <small>（${esc(t.recent(all.length))}）</small>`:''}</span><i style="--p:${(shown.length/Math.max(1,list.length)).toFixed(4)}"></i></span>`+
   (shown.length<list.length?`<button type="button" class="text-button" data-more>${esc(t.more(Math.min(STEP,list.length-shown.length)))}${IC.chev}</button>`:''):'';
  root.classList.toggle('is-none',!list.length);paintDetail();place(false);}

 let hoverTimer=0;
 function select(id,{focus=false,glide=false,punch=true}={}){const w=list.find(x=>x.id===id);if(!w)return;const changed=id!==state.cur;
  if(changed){state.cur=id;state.open=false;}
  const l=listEl();if(!l)return;
  l.querySelectorAll('.esr-row').forEach(r=>{const on=Number(r.dataset.id)===id||r.dataset.id===String(id);r.classList.toggle('is-cur',on);r.setAttribute('aria-selected',String(on));r.tabIndex=on?0:-1;});
  l.setAttribute('aria-activedescendant',`esr-o-${id}`);
  const r=l.querySelector(`.esr-row[data-id="${CSS.escape(String(id))}"]`);if(focus)r?.focus({preventScroll:true});
  if(changed)paintDetail();if(glide)place(true);
  const gsap=motion();if(!gsap||!changed||!punch||!r)return;
  life.add(()=>{const tl=gsap.timeline();tl.fromTo(r.querySelector('.esr-w'),{skewX:-10,x:-16,scale:1.06},{skewX:0,x:0,scale:1,duration:.45,ease:'expo.out',overwrite:'auto'});cutIn(tl,0);});}
 function step(delta){const i=list.findIndex(w=>w.id===state.cur),next=Math.max(0,Math.min(list.length-1,i+delta));if(next===i)return;
  if(next>=state.shown){state.shown=Math.ceil((next+1)/STEP)*STEP;renderList();}select(list[next].id,{focus:true,glide:true});}

 /* events */
 root.querySelector('.esr-f').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b||b.dataset.f===state.filter)return;state.filter=b.dataset.f;state.shown=STEP;
  root.querySelectorAll('.esr-fb').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-selected',String(on));x.tabIndex=on?0:-1;});renderList();swapIn();});
 root.querySelector('.esr-f').addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;const bs=[...root.querySelectorAll('.esr-fb')],i=bs.indexOf(document.activeElement);if(i<0)return;
  e.preventDefault();const b=bs[(i+(e.key==='ArrowRight'?1:-1)+bs.length)%bs.length];b.focus();b.click();});
 let qTimer=0;input.addEventListener('input',()=>{clearTimeout(qTimer);qTimer=setTimeout(()=>{state.q=input.value;state.shown=STEP;renderList();},120);});
 input.addEventListener('keydown',e=>{if(e.key==='Escape'&&input.value){e.preventDefault();e.stopPropagation();input.value='';state.q='';renderList();}
  else if(e.key==='ArrowDown'){e.preventDefault();vp.querySelector('.esr-row.is-cur')?.focus({preventScroll:true});}});
 life.off(()=>{clearTimeout(qTimer);clearTimeout(hoverTimer);});
 vp.addEventListener('mouseover',e=>{const r=e.target.closest('.esr-row');if(!r||r.classList.contains('is-cur'))return;clearTimeout(hoverTimer);
  hoverTimer=setTimeout(()=>{if(life.live&&r.isConnected)select(Number(r.dataset.id)||r.dataset.id);},90);});
 vp.addEventListener('mouseleave',()=>clearTimeout(hoverTimer));
 vp.addEventListener('click',e=>{const r=e.target.closest('.esr-row');if(r){clearTimeout(hoverTimer);select(Number(r.dataset.id)||r.dataset.id,{focus:true,glide:true});return;}
  if(e.target.closest('[data-clear]')){input.value='';state.q='';renderList();input.focus();return;}
  if(e.target.closest('[data-dict-q]'))onLookup?.(state.q.trim());});
 vp.addEventListener('keydown',e=>{if(!e.target.closest('.esr-row'))return;const k=e.key;
  if(k==='ArrowDown'||k==='ArrowUp'){e.preventDefault();step(k==='ArrowDown'?1:-1);}
  else if(k==='PageDown'||k==='PageUp'){e.preventDefault();step(k==='PageDown'?5:-5);}
  else if(k==='Home'||k==='End'){e.preventDefault();step(k==='Home'?-1e6:1e6);}
  else if(k==='Enter'){e.preventDefault();const w=curWord();if(w)onLookup?.(w.spelling);}
  else if(k==='Escape'&&state.q){e.preventDefault();input.value='';state.q='';renderList();input.focus();}});
 /* wheel over the list steps through the words, but only once the whole frame is on screen; otherwise the page keeps scrolling */
 let wheelAt=0;vp.addEventListener('wheel',e=>{if(!list.length)return;const scroller=root.closest('.main'),fr=root.querySelector('.esr-body').getBoundingClientRect(),
  view=scroller?scroller.getBoundingClientRect():{top:0,bottom:innerHeight};if(fr.top<view.top-2||fr.bottom>view.bottom+2)return;
  const i=list.findIndex(w=>w.id===state.cur),dir=Math.sign(e.deltaY);if(!dir||(dir<0&&i<=0)||(dir>0&&i>=list.length-1))return;e.preventDefault();
  const now=performance.now();if(now-wheelAt<110)return;wheelAt=now;step(dir);},{passive:false});
 foot.addEventListener('click',e=>{if(!e.target.closest('[data-more]'))return;const before=state.shown;state.shown+=STEP;renderList();
  const gsap=motion(),rows=[...vp.querySelectorAll('.esr-row')].slice(before);if(gsap&&rows.length)life.add(()=>gsap.from(rows,{opacity:0,x:-20,duration:.4,stagger:.02,ease:'power3.out'}));});
 side.addEventListener('click',e=>{const w=curWord();if(!w)return;
  if(e.target.closest('[data-dict]')){onLookup?.(w.spelling);return;}
  const m=e.target.closest('.esr-more');if(m){state.open=!state.open;side.querySelector('.esr-mean').innerHTML=meanList(w);m.setAttribute('aria-expanded',String(state.open));
   m.innerHTML=esc(state.open?t.less:t.otherMeans(w.means.length-4))+IC.chev;const gsap=motion();
   if(state.open&&gsap)life.add(()=>gsap.from(side.querySelectorAll('.esr-mean li:nth-child(n+5)'),{y:10,opacity:0,duration:.3,stagger:.05,ease:'power3.out'}));}});
 const ro=new ResizeObserver(()=>place(false));ro.observe(vp);life.off(()=>ro.disconnect());
 document.fonts?.ready?.then(()=>{if(life.live)place(false);});

 function swapIn(){const gsap=motion();if(!gsap)return;life.add(()=>{const tl=gsap.timeline();
  tl.from(vp.querySelectorAll('.esr-w'),{yPercent:60,opacity:0,duration:.45,stagger:.025,ease:'power4.out'});cutIn(tl,0);});}
 renderList();
 /* intro: the block rises row by row on a 3D hinge while the list dollies up to the current word, the current word punches in,
    the detail column slides in and cuts to the title */
 const gsap=animate&&motion();
 if(gsap&&listEl())life.add(()=>{const l=listEl(),y=centreY(),cur=l.querySelector('.esr-row.is-cur');gsap.set(l,{y});
  const tl=gsap.timeline({defaults:{duration:.6,ease:'power3.out'}});
  tl.from(root.querySelectorAll('.esr-h > *'),{y:16,opacity:0,stagger:.08,duration:.5})
   .from(l,{y:y+220,duration:1.1,ease:'power4.out'},'<')
   .from(l.querySelectorAll('.esr-w'),{yPercent:80,rotationX:-70,opacity:0,transformPerspective:800,transformOrigin:'50% 100%',stagger:.04,duration:.65,ease:'power4.out'},'<.05')
   .from(l.querySelectorAll('.esr-g'),{opacity:0,x:12,stagger:.04,duration:.4},'<.25');
  if(cur)tl.from(cur.querySelector('.esr-w'),{scale:1.14,skewX:-10,duration:.5,ease:'expo.out'},'-=.4');
  tl.from(side,{opacity:0,x:40,duration:.7,ease:'power4.out'},'-=.45');cutIn(tl,'-=.3');
  const fill=foot.querySelector('.esr-prog i');if(fill)tl.from(fill,{opacity:0,duration:.6},'<');});
 else if(!window.gsap)loadGsap().catch(()=>{});
 return life.stop;}

/* =================================================================== sentences =================================================================== */
/* 2026-11-13 three layers so the tab holds thousands of lines: one giant line on stage (newest, or 抽一句), a scene wall grouped by the frame
   each line was saved on (VN CG-gallery style; lines with no frame group by day as type-only cards), and a searchable windowed list for the
   long tail. Card images come only from sentence.scene (the dialogue-free frame saved with the line), fetched lazily per file. */
const KINSOKU=/^[、。，．！？!?…‥ー)）」』】〕〉》っゃゅょぁぃぅぇぉッャュョァィゥェォ～〜・]/;
/* break a line into rows for the giant set: after punctuation where it can, never inside a collected word, never before a closing mark */
function rowsOf(text,ranges){const chars=[...text],n=chars.length;if(n<=9||n>150)return [chars.join('')];
 const count=n<=20?2:Math.min(6,Math.max(3,Math.ceil(n/18))),target=n/count,INF=1e9;
 const cut=i=>{const p=chars[i-1],q=chars[i];const hi=x=>/[ぁ-ゟ]/.test(x);let c=/[、。，！？!?…」』）)]/.test(p)?-6:hi(q)?3:hi(p)?.5:1.5;
  if(KINSOKU.test(q))c+=60;if(ranges.some(h=>i>h.start&&i<h.end))c+=60;return c;};
 /* rows close to even length, cut after punctuation where it can: a small DP over the cut points */
 const dp=Array.from({length:count+1},()=>new Array(n+1).fill(INF)),from=Array.from({length:count+1},()=>new Array(n+1).fill(-1));dp[0][0]=0;
 for(let k=1;k<=count;k++)for(let i=2*k;i<=n;i++){if(k===count&&i!==n)continue;for(let j=2*(k-1);j<=i-2;j++){if(dp[k-1][j]>=INF)continue;const d=i-j-target,c=dp[k-1][j]+d*d/target+(i<n?cut(i):0);
  if(c<dp[k][i]){dp[k][i]=c;from[k][i]=j;}}}
 if(dp[count][n]>=INF)return [chars.join('')];const cuts=[];for(let k=count,i=n;k>0;k--){cuts.unshift(i);i=from[k][i];}
 const out=[];let a=0;for(const c of cuts){out.push(chars.slice(a,c).join(''));a=c;}return out;}
const INDENT=[[14],[14,36],[14,0,36],[14,0,24,36],[14,0,24,8,36],[14,0,24,8,30,36]];

const SCENE_STEP=18,ROW_H=46,ROW_BUF=6,SCENE_CAP=240,SCENE_PARALLEL=4;
const SWAP={out:.32,in:.7,meta:.4},EASE_OUT='power4.out';
/* scene frames: one promise per game + file, kept across mounts (most recently used last, the oldest dropped past the cap) */
const SCENE_CACHE=new Map();
function sceneURL(api,gameId,file){const key=gameId+'|'+file;let p=SCENE_CACHE.get(key);
 if(p){SCENE_CACHE.delete(key);SCENE_CACHE.set(key,p);return p;}
 p=Promise.resolve().then(()=>api('sentence_scene',{id:gameId,file})).then(r=>{if(!r?.data)throw Error('NO_SCENE');return `data:${r.mime||'image/jpeg'};base64,${r.data}`;});
 p.catch(()=>{if(SCENE_CACHE.get(key)===p)SCENE_CACHE.delete(key);});
 SCENE_CACHE.set(key,p);if(SCENE_CACHE.size>SCENE_CAP)SCENE_CACHE.delete(SCENE_CACHE.keys().next().value);return p;}
/* at most four frames in flight per mount; whatever is still queued when the tab goes away is dropped */
function sceneLoader(api,gameId,life){const queue=[];let busy=0;
 const pump=()=>{while(busy<SCENE_PARALLEL&&queue.length){if(!life.live){queue.length=0;return;}const [file,ok,fail]=queue.shift();busy++;
  sceneURL(api,gameId,file).then(ok,fail).finally(()=>{busy--;pump();});}};
 return file=>SCENE_CACHE.has(gameId+'|'+file)?sceneURL(api,gameId,file):new Promise((ok,fail)=>{queue.push([file,ok,fail]);pump();});}

const byTime=(a,b)=>toMs(a.created_at)-toMs(b.created_at)||(a.id>b.id?1:a.id<b.id?-1:0);
/* same scene.file = same scene; lines without a frame share a card per day. Newest activity first, lines inside in story order */
function groupScenes(list){const map=new Map();
 for(const s of list){const f=s.scene&&s.scene.file?String(s.scene.file):'';const ms=toMs(s.created_at),key=f?'f:'+f:'d:'+dayKey(ms);let g=map.get(key);
  if(!g){g={key,file:f||null,items:[],last:0,first:Infinity};map.set(key,g);}g.items.push(s);if(ms>g.last)g.last=ms;if(ms<g.first)g.first=ms;}
 const out=[...map.values()];out.forEach(g=>g.items.sort(byTime));out.sort((a,b)=>b.last-a.last);return out;}
const pad=n=>String(n).padStart(2,'0');
/* the dense list's time column: hh:mm today, m/d hh:mm this year, y/m/d before */
function stamp(ts){const ms=toMs(ts);if(!ms)return '';const d=new Date(ms),now=new Date(),hm=`${pad(d.getHours())}:${pad(d.getMinutes())}`;
 if(dayKey(ms)===dayKey(now.getTime()))return hm;return d.getFullYear()===now.getFullYear()?`${d.getMonth()+1}/${d.getDate()} ${hm}`:`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;}
function hit(str,q,esc){const s=String(str||'');if(!q)return esc(s);const low=s.toLowerCase();let out='',i=0,j;
 while((j=low.indexOf(q,i))>=0){out+=esc(s.slice(i,j))+`<mark>${esc(s.slice(j,j+q.length))}</mark>`;i=j+q.length;}return out+esc(s.slice(i));}

const SL={zh:{shuffle:'抽一句',ledeRandom:'随手抽到的一句',ledeSub:'点场景或列表里的一句换上来',scenes:'场景回想',scenesSub:n=>`${n} 个场景 · 同一画面里收下的句子放在一起`,
  nLines:n=>`${n} 句`,noScene:'没有存下画面',moreScenes:n=>`再显示 ${n} 个场景`,shownScenes:(a,b)=>`已显示 ${a} / ${b}`,close:'收起',stripK:n=>`这一幕 · ${n} 句`,
  dayK:n=>`这一天 · ${n} 句`,inScene:n=>`同场景 ${n} 句`,all:'全部台词',searchS:'搜索原文或译文',fAll:'全部',fCg:'有 CG',time:['全部时间','今天','7 天内','30 天内'],
  sortL:'排序',sorts:['最近','最早','按场景'],shownN:(a,b)=>a===b?`<b>${a}</b> 句`:`<b>${a}</b> / ${b} 句`,noneQ:q=>`没有找到「${q}」`,noneF:'没有符合筛选的台词',clearF:'清除搜索和筛选',
  manualShort:'手动',autoShort:'加卡',cgTitle:'有场景画面',listAria:'全部台词列表',filters:'筛选',scenesAria:'按场景分组的台词'},
 ja:{shuffle:'ランダム',ledeRandom:'ランダムに選んだ一文',ledeSub:'場面やリストの一文で切り替え',scenes:'シーン回想',scenesSub:n=>`${n} シーン · 同じ場面で保存した文をまとめています`,
  nLines:n=>`${n} 文`,noScene:'場面画像なし',moreScenes:n=>`さらに ${n} シーン`,shownScenes:(a,b)=>`表示中 ${a} / ${b}`,close:'閉じる',stripK:n=>`この場面 · ${n} 文`,
  dayK:n=>`この日 · ${n} 文`,inScene:n=>`同じ場面 ${n} 文`,all:'すべての台詞',searchS:'原文・訳文で検索',fAll:'すべて',fCg:'CG あり',time:['全期間','今日','7 日以内','30 日以内'],
  sortL:'並び順',sorts:['新しい順','古い順','場面順'],shownN:(a,b)=>a===b?`<b>${a}</b> 文`:`<b>${a}</b> / ${b} 文`,noneQ:q=>`「${q}」は見つかりません`,noneF:'条件に合う台詞はありません',clearF:'検索と絞り込みをクリア',
  manualShort:'手動',autoShort:'カード',cgTitle:'場面画像あり',listAria:'すべての台詞',filters:'絞り込み',scenesAria:'場面ごとの台詞'},
 en:{shuffle:'Shuffle',ledeRandom:'A line drawn at random',ledeSub:'Pick a scene or a row below to bring it up',scenes:'Scenes',scenesSub:n=>`${n} scenes · lines saved on the same frame sit together`,
  nLines:n=>n===1?'1 line':`${n} lines`,noScene:'No frame saved',moreScenes:n=>`Show ${n} more scenes`,shownScenes:(a,b)=>`Showing ${a} / ${b}`,close:'Close',stripK:n=>`This scene · ${n}`,
  dayK:n=>`This day · ${n}`,inScene:n=>`${n} in this scene`,all:'All lines',searchS:'Search the line or its translation',fAll:'All',fCg:'With CG',time:['Any time','Today','7 days','30 days'],
  sortL:'Sort',sorts:['Newest','Oldest','By scene'],shownN:(a,b)=>a===b?`<b>${a}</b> lines`:`<b>${a}</b> / ${b} lines`,noneQ:q=>`Nothing matches “${q}”`,noneF:'No lines match these filters',clearF:'Clear search and filters',
  manualShort:'Hand',autoShort:'Card',cgTitle:'Has a scene frame',listAria:'All saved lines',filters:'Filters',scenesAria:'Lines grouped by scene'}};
const IC_S={dice:ICON('<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><circle cx="5.5" cy="5.5" r=".6" fill="currentColor"/><circle cx="10.5" cy="10.5" r=".6" fill="currentColor"/><circle cx="8" cy="8" r=".6" fill="currentColor"/>','gl-dice'),
 scene:ICON('<rect x="2" y="3.5" width="12" height="9"/><path d="M2 10.5l3.5-3 3 2.5 2-1.5 3.5 3"/>')};
const DAYS=[0,1,7,30],SORTS=['new','old','scene'],SRC=['all','manual','auto'];

export function mountSentences(target,{sentences=[],locale='zh',esc,state,animate=false,api,gameId,toast,onLaunch,canLaunch=true,onRemoved}){
 const t={...tx(locale),...(SL[locale]||SL.zh)},life=lifecycle(target);
 if(!sentences.length)return emptySentences(target,{t,esc,locale,life,animate,onLaunch,canLaunch});
 const t0=performance.now();
 const newest=[...sentences].sort((a,b)=>byTime(b,a)),byId=new Map(sentences.map(s=>[String(s.id),s])),groups=groupScenes(sentences),groupOf=new Map();
 groups.forEach(g=>g.items.forEach(s=>groupOf.set(s.id,g)));const groupBy=new Map(groups.map(g=>[g.key,g]));
 if(!byId.has(String(state.cur)))state.cur=newest[0].id;
 state.scenesShown??=SCENE_STEP;state.q??='';state.src??='all';state.cg??=false;state.days??=0;state.sort??='new';state.why??='';
 if(state.open&&!groupBy.has(state.open))state.open=null;
 const autoN=sentences.filter(s=>s.source==='auto').length,loadScene=sceneLoader(api,gameId,life),scroller=target.closest('.main');
 const isAuto=s=>s.source==='auto',srcTag=s=>isAuto(s)?t.auto:t.manual;
 const chip=(attr,val,on,label,extra='')=>`<button type="button" class="gl-fb${on?' on':''}" ${attr}="${val}" aria-pressed="${on}">${extra}${esc(label)}</button>`;

 target.innerHTML=`<section class="gl" aria-label="${esc(t.sentences)}">
  <div class="gl-bar"><span class="gl-count">${t.count(sentences.length)}</span>${autoN?`<span class="gl-prog"><i class="gl-prog-track"><i class="gl-prog-fill" style="--p:${(autoN/sentences.length).toFixed(4)}"></i></i>${esc(t.autoShare)} <b>${autoN} / ${sentences.length}</b></span>`:''}
   ${sentences.length>1?`<button type="button" class="secondary gl-shuffle" data-shuffle>${IC_S.dice}${esc(t.shuffle)}</button>`:''}</div>
  <div class="gl-stage"><p class="gl-lede"></p><h2 class="gl-big" lang="ja" aria-live="polite"></h2>
   <div class="gl-meta"><p class="gl-zh"></p><div class="gl-line"><p class="gl-who"></p><div class="gl-act">
    <button type="button" class="text-button" data-play title="${esc(t.playTitle)}">${IC.play}${esc(t.play)}</button><button type="button" class="text-button" data-copy>${IC.copy}${esc(t.copy)}</button><button type="button" class="text-button gl-del" data-remove>${IC.trash}<span>${esc(t.remove)}</span></button></div></div></div></div>
  <section class="gl-scenes" aria-label="${esc(t.scenesAria)}"><header class="gl-h"><p class="gl-k">${esc(t.scenes)}</p><p class="gl-sub">${esc(t.scenesSub(groups.length))}</p></header>
   <div class="gl-wall"></div><div class="gl-wall-foot"></div></section>
  <section class="gl-all" aria-label="${esc(t.all)}"><header class="gl-h"><p class="gl-k">${esc(t.all)}</p><p class="gl-shown"></p>
    <label class="gl-q">${IC.search}<input type="search" autocomplete="off" spellcheck="false" placeholder="${esc(t.searchS)}" aria-label="${esc(t.searchS)}" value="${esc(state.q)}"></label></header>
   <div class="gl-tools" role="group" aria-label="${esc(t.filters)}"><div class="gl-fg">${SRC.map((k,i)=>chip('data-src',k,state.src===k,[t.fAll,t.manual,t.auto][i])).join('')}</div>
    <div class="gl-fg">${chip('data-cg','1',state.cg,t.fCg,'<i class="gl-box" aria-hidden="true"></i>')}</div>
    <div class="gl-fg">${DAYS.map((d,i)=>chip('data-days',d,state.days===d,t.time[i])).join('')}</div>
    <div class="gl-fg gl-sort"><span class="gl-sort-k">${esc(t.sortL)}</span>${SORTS.map((k,i)=>chip('data-sort',k,state.sort===k,t.sorts[i])).join('')}</div></div>
   <div class="gl-lv" role="listbox" tabindex="0" aria-label="${esc(t.listAria)}"><div class="gl-lv-in"></div></div><div class="gl-none" hidden></div></section></section>`;
 const root=target.querySelector('.gl'),stage=root.querySelector('.gl-stage'),big=root.querySelector('.gl-big'),zh=root.querySelector('.gl-zh'),who=root.querySelector('.gl-who'),
  lede=root.querySelector('.gl-lede'),meta=root.querySelector('.gl-meta'),del=root.querySelector('[data-remove]'),wall=root.querySelector('.gl-wall'),wallFoot=root.querySelector('.gl-wall-foot'),
  lv=root.querySelector('.gl-lv'),lvIn=root.querySelector('.gl-lv-in'),none=root.querySelector('.gl-none'),shown=root.querySelector('.gl-shown'),input=root.querySelector('.gl-q input'),
  shuffleBtn=root.querySelector('[data-shuffle]');
 const cur=()=>byId.get(String(state.cur))||newest[0];

 /* ---------- layer 1: the giant line ---------- */
 function heroHTML(s){const text=String(s.text||''),ranges=(s.words||[]).filter(h=>Number.isInteger(h.start)&&h.end>h.start),rows=rowsOf(text,ranges),ind=INDENT[Math.min(rows.length,6)-1];
  let at=0;return rows.map((r,i)=>{const len=[...r].length,local=ranges.map(h=>({start:h.start-at,end:h.end-at})).filter(h=>h.end>0&&h.start<len).map(h=>({start:Math.max(0,h.start),end:Math.min(len,h.end)}));at+=len;
   /* every character is its own unit so the set can rise and fall; collected words keep one underline across their characters */
   const html=[...r].map((c,k)=>{const em=local.some(h=>k>=h.start&&k<h.end);return `<span class="u${em?' em':''}">${esc(c)}</span>`;}).join('');
   return `<span class="gl-row" style="--ind:${ind[i]??36}%"><span class="gl-mask">${html}</span></span>`;}).join('');}
 /* the set is as large as the longest row allows: measured at the base size, scaled down to fit, never below a reading size */
 function fit(){big.style.removeProperty('--gl-fit');const masks=[...big.querySelectorAll('.gl-mask')];if(!masks.length)return;const W=big.clientWidth;let ratio=1;
  masks.forEach(m=>{const ind=parseFloat(m.parentElement.style.getPropertyValue('--ind'))||0,room=W*(1-ind/100)-8;if(m.scrollWidth>room)ratio=Math.min(ratio,room/m.scrollWidth);});
  if(ratio<1)big.style.setProperty('--gl-fit',ratio.toFixed(4));big.classList.toggle('is-wrap',ratio<.42);}
 function fillHero(){const s=cur(),g=groupOf.get(s.id);
  const head=s.id===newest[0].id?t.lede:state.why==='random'?t.ledeRandom:t.ledeOther;
  lede.innerHTML=`${esc(head)} <span>${esc(t.ledeSub)}</span>`;big.innerHTML=heroHTML(s);setExample(big,s?.text);fit();
  zh.textContent=s.translation||t.noTr;zh.classList.toggle('is-none',!s.translation);
  const link=g&&g.items.length>1||g?.file?`<button type="button" class="text-button gl-goscene" data-scene="${esc(g.key)}">${g.file?IC_S.scene:''}${esc(g.file?t.inScene(g.items.length):t.dayK(g.items.length))}</button>`:'';
  who.innerHTML=`<time>${esc(when(s.created_at,locale,t))}</time><span class="gl-src${isAuto(s)?' on':''}">${esc(srcTag(s))}</span>${link}`;
  resetDelete();}

 let swapTl=null;
 /* swap: the old line's characters lift out of their masks, the new set rises in; a shuffle throws them sideways at loose angles instead */
 function swapTo(id,{why='picked',reveal=true}={}){if(id==null||String(id)===String(state.cur))return;const gsap=motion();
  const commit=()=>{state.cur=byId.get(String(id))?.id??id;state.why=why;markCurrent();fillHero();};
  if(reveal&&stage.getBoundingClientRect().top<(scroller?.getBoundingClientRect().top||0))stage.scrollIntoView({block:'start',behavior:reduced()?'auto':'smooth'});
  if(!gsap){commit();return;}
  swapTl?.progress(1).kill();
  life.add(()=>{const shuffle=why==='random',units=big.querySelectorAll('.u'),rnd=gsap.utils.random;
   swapTl=gsap.timeline({defaults:{ease:'power3.in'}})
    .to(units,shuffle?{yPercent:()=>rnd(-140,-90),x:()=>rnd(-40,40),rotation:()=>rnd(-24,24),autoAlpha:0,duration:SWAP.out,stagger:{amount:Math.min(.24,units.length*.01),from:'random'}}
     :{yPercent:-118,duration:SWAP.out,stagger:{amount:Math.min(.3,units.length*.012)}})
    .to(meta,{autoAlpha:0,duration:.2},0)
    .add(()=>{if(life.live)commit();})
    .fromTo(stage,{rotationY:shuffle?3:-3,transformPerspective:1600},{rotationY:0,duration:SWAP.in,ease:'elastic.out(1,.5)'})
    .add(()=>{if(!life.live)return;const fresh=big.querySelectorAll('.u');life.add(()=>gsap.from(fresh,{yPercent:118,rotation:shuffle?()=>rnd(-14,14):6,duration:SWAP.in,
     stagger:{amount:Math.min(.6,fresh.length*.03),from:shuffle?'random':'start'},ease:EASE_OUT}));},'<')
    .to(meta,{autoAlpha:1,duration:SWAP.meta,ease:'power2.out'},'<.2');});}
 function shuffle(){if(newest.length<2)return;let pick;do{pick=newest[Math.floor(Math.random()*newest.length)];}while(String(pick.id)===String(state.cur));
  const gsap=motion(),dice=shuffleBtn?.querySelector('.gl-dice');if(gsap&&dice)life.add(()=>gsap.fromTo(dice,{rotation:0},{rotation:360,duration:.6,ease:'back.out(1.6)'}));
  swapTo(pick.id,{why:'random',reveal:false});}

 /* ---------- layer 2: scene wall ---------- */
 const sceneCard=g=>{const lead=g.items[0],has=g.items.some(s=>String(s.id)===String(state.cur)),open=state.open===g.key;
  const pic=g.file?`<span class="gs-pic" data-file="${esc(g.file)}"><img alt="" decoding="async" draggable="false"></span>`
   :`<span class="gs-pic is-text"><span class="gs-q" lang="ja"${exAttr(lead.text,null,esc)}>${esc(lead.text)}</span></span>`;
  return `<button type="button" class="gs${has?' has-cur':''}${open?' is-open':''}${g.file?'':' is-day'}" data-k="${esc(g.key)}" aria-expanded="${open}">`+
   `<span class="gs-frame">${pic}<b class="gs-n">${esc(t.nLines(g.items.length))}</b></span>`+
   `<span class="gs-cap"${g.file?' lang="ja"':''}>${esc(g.file?lead.text:t.noScene)}</span><span class="gs-date">${esc(dateOnly(g.last,locale))}</span></button>`;};
 const io='IntersectionObserver' in window?new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;io.unobserve(e.target);paintScene(e.target);}),{root:scroller,rootMargin:'400px 0px'}):null;
 life.off(()=>io?.disconnect());
 /* fill one frame from its file; a frame that cannot be read turns into the type-only card, never into some other picture */
 function paintScene(pic){const file=pic.dataset.file;if(!file||pic.dataset.state)return;pic.dataset.state='wait';
  loadScene(file).then(url=>{if(!life.live||!pic.isConnected)return;const img=pic.querySelector('img');img.src=url;pic.dataset.state='ok';
   const gsap=motion();if(gsap)life.add(()=>gsap.fromTo(img,{autoAlpha:0,scale:1.06},{autoAlpha:1,scale:1,duration:.6,ease:'power2.out',clearProps:'transform'}));},
  ()=>{if(!life.live||!pic.isConnected)return;const g=groupBy.get(pic.closest('[data-k]')?.dataset.k||'');pic.dataset.state='fail';pic.classList.add('is-text');
   pic.innerHTML=`<span class="gs-q" lang="ja"${exAttr(g?.items[0]?.text,null,esc)}>${esc(g?.items[0]?.text||'')}</span>`;});}
 const watchScenes=scope=>scope.querySelectorAll('.gs-pic[data-file]:not([data-state])').forEach(p=>io?io.observe(p):paintScene(p));
 function renderWall(){const list=groups.slice(0,state.scenesShown);wall.innerHTML=list.map(sceneCard).join('');watchScenes(wall);
  const left=groups.length-list.length;
  wallFoot.innerHTML=`<span class="gl-wall-n">${esc(t.shownScenes(list.length,groups.length))}</span>`+(left>0?`<button type="button" class="text-button" data-more>${esc(t.moreScenes(Math.min(SCENE_STEP,left)))}${IC.chev}</button>`:'');
  placeStrip();}
 const cols=()=>Math.max(1,getComputedStyle(wall).gridTemplateColumns.split(' ').filter(Boolean).length);
 function stripHTML(g){const pic=g.file?`<span class="gs-pic gl-strip-pic" data-file="${esc(g.file)}"><img alt="" decoding="async" draggable="false"></span>`
   :`<span class="gs-pic gl-strip-pic is-text"><span class="gs-q" lang="ja"${exAttr(g.items[0].text,null,esc)}>${esc(g.items[0].text)}</span></span>`;
  const range=dayKey(g.first)===dayKey(g.last)?dateOnly(g.last,locale):`${dateOnly(g.first,locale)} – ${dateOnly(g.last,locale)}`;
  return `<div class="gl-strip" role="region" aria-label="${esc(g.file?t.stripK(g.items.length):t.dayK(g.items.length))}">${pic}<div class="gl-strip-body">
   <div class="gl-strip-h"><span class="gl-k">${esc(g.file?t.stripK(g.items.length):t.dayK(g.items.length))}</span><span class="gl-strip-d">${esc(range)}</span>
    <button type="button" class="text-button gl-strip-x" data-close>${IC.x}${esc(t.close)}</button></div>
   <ol class="gl-strip-list">${g.items.map(s=>`<li><button type="button" class="gl-sl${String(s.id)===String(state.cur)?' is-cur':''}" data-id="${esc(String(s.id))}">`+
    `<span class="gl-sl-ja" lang="ja"${exAttr(s.text,null,esc)}>${marked(s.text,s.words,esc,'b')}</span>${s.translation?`<span class="gl-sl-zh">${esc(s.translation)}</span>`:''}<time>${esc(stamp(s.created_at))}</time></button></li>`).join('')}</ol></div></div>`;}
 /* the open scene unfolds as a full-width strip under the row its card sits in, like a CG gallery opening one picture */
 let stripKey=null;
 function placeStrip(animateIn=false){const old=wall.querySelector('.gl-strip');const g=state.open&&groupBy.get(state.open);
  if(!g){old?.remove();stripKey=null;return;}
  const cards=[...wall.querySelectorAll('.gs')],idx=cards.findIndex(c=>c.dataset.k===g.key);if(idx<0){old?.remove();stripKey=null;return;}
  const n=cols(),anchor=cards[Math.min(cards.length-1,Math.floor(idx/n)*n+n-1)];
  let strip=old;if(!strip||stripKey!==g.key){old?.remove();anchor.insertAdjacentHTML('afterend',stripHTML(g));strip=anchor.nextElementSibling;stripKey=g.key;watchScenes(strip);
   const gsap=animateIn&&motion();if(gsap)life.add(()=>gsap.timeline({defaults:{ease:'expo.out'}})
    .from(strip.querySelector('.gl-strip-pic'),{autoAlpha:0,x:-30,duration:.6})
    .from(strip.querySelectorAll('.gl-strip-h > *, .gl-strip-list li'),{autoAlpha:0,y:12,duration:.45,stagger:{each:.03,amount:.4}},'<.08'));}
  else if(anchor.nextElementSibling!==strip)anchor.after(strip);}
 function openGroup(key,{scroll=false}={}){const g=groupBy.get(key);if(!g)return;
  if(state.open===key&&!scroll){state.open=null;}else{state.open=key;const i=groups.indexOf(g);if(i>=state.scenesShown){state.scenesShown=Math.ceil((i+1)/SCENE_STEP)*SCENE_STEP;renderWall();}}
  wall.querySelectorAll('.gs').forEach(c=>{const on=c.dataset.k===state.open;c.classList.toggle('is-open',on);c.setAttribute('aria-expanded',String(on));});
  placeStrip(true);
  if(scroll&&state.open){const card=wall.querySelector(`.gs[data-k="${CSS.escape(key)}"]`);card?.scrollIntoView({block:'start',behavior:reduced()?'auto':'smooth'});}}

 /* ---------- layer 3: the long tail, searched and filtered in memory, drawn as a window of rows ---------- */
 let sorted=null;const sortedBy=k=>{sorted??={};return sorted[k]??=k==='old'?[...newest].reverse():k==='scene'?groups.flatMap(g=>g.items):newest;};
 const hay=new Map();const hayOf=s=>{let h=hay.get(s.id);if(h==null){h=(String(s.text||'')+'\n'+String(s.translation||'')).toLowerCase();hay.set(s.id,h);}return h;};
 let rows=[],range=[-1,-1],kbd=-1;
 function filtered(){const q=state.q.trim().toLowerCase(),now=Date.now(),today=dayKey(now),since=state.days>1?now-state.days*86400000:0;
  return sortedBy(state.sort).filter(s=>{if(state.src==='auto'&&!isAuto(s))return false;if(state.src==='manual'&&isAuto(s))return false;if(state.cg&&!s.scene?.file)return false;
   if(state.days===1&&dayKey(toMs(s.created_at))!==today)return false;if(since&&toMs(s.created_at)<since)return false;return !q||hayOf(s).includes(q);});}
 function rowHTML(s,i){const q=state.q.trim().toLowerCase(),prev=rows[i-1],sep=state.sort==='scene'&&prev&&groupOf.get(prev.id)!==groupOf.get(s.id),on=String(s.id)===String(state.cur);
  return `<div class="gl-r${on?' is-cur':''}${i===kbd?' is-kbd':''}${sep?' sep':''}" role="option" id="gl-r-${i}" aria-selected="${on}" data-id="${esc(String(s.id))}" style="top:${i*ROW_H}px">`+
   `<time>${esc(stamp(s.created_at))}</time><span class="gl-r-src${isAuto(s)?' on':''}">${esc(isAuto(s)?t.autoShort:t.manualShort)}</span>`+
   `<i class="gl-r-cg${s.scene?.file?' on':''}"${s.scene?.file?` title="${esc(t.cgTitle)}"`:''}></i>`+
   `<span class="gl-r-ja" lang="ja"${exAttr(s.text,null,esc)}>${q?hit(s.text,q,esc):marked(s.text,s.words,esc,'b')}</span><span class="gl-r-zh">${hit(s.translation||'',q,esc)}</span></div>`;}
 function paintRows(force=false){const n=rows.length,top=lv.scrollTop,h=lv.clientHeight||ROW_H*12;
  const a=Math.max(0,Math.floor(top/ROW_H)-ROW_BUF),b=Math.min(n,Math.ceil((top+h)/ROW_H)+ROW_BUF);if(!force&&a===range[0]&&b===range[1])return;range=[a,b];
  let html='';for(let i=a;i<b;i++)html+=rowHTML(rows[i],i);lvIn.innerHTML=html;}
 function renderList(keepTop=false){rows=filtered();kbd=Math.min(kbd,rows.length-1);lvIn.style.height=rows.length*ROW_H+'px';
  shown.innerHTML=t.shownN(rows.length,sentences.length);const q=state.q.trim(),filteredOut=!rows.length;
  lv.hidden=filteredOut;none.hidden=!filteredOut;
  if(filteredOut)none.innerHTML=`<p class="gl-none-t"${q?' lang="ja"':''}>${esc(q?t.noneQ(q):t.noneF)}</p><button type="button" class="secondary" data-clear>${IC.x}${esc(t.clearF)}</button>`;
  lv.removeAttribute('aria-activedescendant');if(!keepTop)lv.scrollTop=0;range=[-1,-1];paintRows(true);}
 let rowRaf=0;lv.addEventListener('scroll',()=>{if(rowRaf)return;rowRaf=requestAnimationFrame(()=>{rowRaf=0;if(life.live)paintRows();});},{passive:true});
 life.off(()=>cancelAnimationFrame(rowRaf));
 function moveKbd(i){if(!rows.length)return;kbd=Math.max(0,Math.min(rows.length-1,i));const y=kbd*ROW_H;
  if(y<lv.scrollTop)lv.scrollTop=y;else if(y+ROW_H>lv.scrollTop+lv.clientHeight)lv.scrollTop=y+ROW_H-lv.clientHeight;
  paintRows(true);lv.setAttribute('aria-activedescendant',`gl-r-${kbd}`);}

 function markCurrent(){const id=String(state.cur),g=groupOf.get(cur().id);
  wall.querySelectorAll('.gs').forEach(c=>c.classList.toggle('has-cur',!!g&&c.dataset.k===g.key));
  wall.querySelectorAll('.gl-sl').forEach(b=>b.classList.toggle('is-cur',b.dataset.id===id));
  lvIn.querySelectorAll('.gl-r').forEach(r=>{const on=r.dataset.id===id;r.classList.toggle('is-cur',on);r.setAttribute('aria-selected',String(on));});}

 /* ---------- events ---------- */
 /* removal asks once: the first press turns into a confirm for a few seconds, Esc or leaving cancels */
 let armTimer=0;function resetDelete(){clearTimeout(armTimer);del.classList.remove('armed');del.querySelector('span').textContent=t.remove;}
 del.addEventListener('click',async()=>{if(!del.classList.contains('armed')){del.classList.add('armed');del.querySelector('span').textContent=t.confirm;clearTimeout(armTimer);armTimer=setTimeout(resetDelete,4000);return;}
  const s=cur();resetDelete();del.disabled=true;try{await api('sentence_delete',{id:Number(s.id)});}catch{del.disabled=false;toast?.(t.removeFail);return;}
  toast?.(t.removed);onRemoved?.(s.id);});
 del.addEventListener('keydown',e=>{if(e.key==='Escape'&&del.classList.contains('armed')){e.preventDefault();e.stopPropagation();resetDelete();}});
 del.addEventListener('blur',()=>{if(del.classList.contains('armed'))setTimeout(()=>{if(document.activeElement!==del)resetDelete();},150);});
 life.off(()=>clearTimeout(armTimer));
 root.querySelector('[data-play]').addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;try{await (await import('./sentence-voice.js')).playSentence(api,cur().text,b);}catch{toast?.(t.playFail);}finally{b.disabled=false;}});
 root.querySelector('[data-copy]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(cur().text);toast?.(t.copied);}catch{toast?.(t.copyFail);}});
 shuffleBtn?.addEventListener('click',shuffle);
 who.addEventListener('click',e=>{const b=e.target.closest('[data-scene]');if(b)openGroup(b.dataset.scene,{scroll:true});});
 wall.addEventListener('click',e=>{const sl=e.target.closest('.gl-sl');if(sl){swapTo(byId.get(sl.dataset.id)?.id);return;}
  if(e.target.closest('[data-close]')){const k=state.open;state.open=null;placeStrip();wall.querySelectorAll('.gs').forEach(c=>{c.classList.remove('is-open');c.setAttribute('aria-expanded','false');});
   wall.querySelector(`.gs[data-k="${CSS.escape(k||'')}"]`)?.focus({preventScroll:true});return;}
  const c=e.target.closest('.gs');if(c)openGroup(c.dataset.k);});
 wall.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open){e.preventDefault();e.stopPropagation();wall.querySelector('[data-close]')?.click();}});
 wallFoot.addEventListener('click',e=>{if(!e.target.closest('[data-more]'))return;const before=wall.querySelectorAll('.gs').length;state.scenesShown+=SCENE_STEP;renderWall();
  const gsap=motion(),fresh=[...wall.querySelectorAll('.gs')].slice(before);if(gsap&&fresh.length)life.add(()=>gsap.from(fresh,{autoAlpha:0,y:30,duration:.6,stagger:.03,ease:'expo.out'}));});
 /* hover: the frame inside a card leans in a little; transform only, and only with GSAP */
 const lean=(c,on)=>{const gsap=motion(),pic=c.querySelector('.gs-frame');if(gsap&&pic)life.add(()=>gsap.to(pic,{y:on?-6:0,duration:on?.35:.5,ease:'power3.out',overwrite:'auto'}));};
 wall.addEventListener('mouseover',e=>{const c=e.target.closest('.gs');if(c&&!c.contains(e.relatedTarget))lean(c,true);});
 wall.addEventListener('mouseout',e=>{const c=e.target.closest('.gs');if(c&&!c.contains(e.relatedTarget))lean(c,false);});
 const tools=root.querySelector('.gl-tools');
 tools.addEventListener('click',e=>{const b=e.target.closest('.gl-fb');if(!b)return;const d=b.dataset;
  if(d.src!=null)state.src=d.src;else if(d.cg!=null)state.cg=!state.cg;else if(d.days!=null)state.days=Number(d.days);else if(d.sort!=null)state.sort=d.sort;
  tools.querySelectorAll('.gl-fb').forEach(x=>{const k=x.dataset,on=k.src!=null?k.src===state.src:k.cg!=null?state.cg:k.days!=null?Number(k.days)===state.days:k.sort===state.sort;
   x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on));});
  kbd=-1;renderList();});
 let qTimer=0;input.addEventListener('input',()=>{clearTimeout(qTimer);qTimer=setTimeout(()=>{if(!life.live)return;state.q=input.value;kbd=-1;renderList();},120);});
 input.addEventListener('keydown',e=>{if(e.key==='Escape'&&input.value){e.preventDefault();e.stopPropagation();input.value='';state.q='';renderList();}
  else if(e.key==='ArrowDown'&&rows.length){e.preventDefault();lv.focus({preventScroll:true});moveKbd(0);}});
 life.off(()=>clearTimeout(qTimer));
 none.addEventListener('click',e=>{if(!e.target.closest('[data-clear]'))return;state.q='';input.value='';state.src='all';state.cg=false;state.days=0;
  tools.querySelectorAll('.gl-fb').forEach(x=>{const k=x.dataset,on=k.src==='all'||k.days==='0'||(k.sort!=null&&k.sort===state.sort);x.classList.toggle('on',on);x.setAttribute('aria-pressed',String(on));});
  renderList();input.focus();});
 lv.addEventListener('click',e=>{const r=e.target.closest('.gl-r');if(!r)return;kbd=Number(r.id.slice(5));swapTo(byId.get(r.dataset.id)?.id);});
 lv.addEventListener('keydown',e=>{const k=e.key,page=Math.max(1,Math.floor(lv.clientHeight/ROW_H)-1);
  const to={ArrowDown:kbd+1,ArrowUp:kbd-1,PageDown:kbd+page,PageUp:kbd-page,Home:0,End:rows.length-1}[k];
  if(to!=null){e.preventDefault();moveKbd(kbd<0&&k!=='End'&&k!=='Home'?Math.floor(lv.scrollTop/ROW_H):to);return;}
  if((k==='Enter'||k===' ')&&rows[kbd]){e.preventDefault();swapTo(rows[kbd].id);}
  else if(k==='Escape'&&state.q){e.preventDefault();input.value='';state.q='';renderList();input.focus();}});
 lv.addEventListener('focus',()=>{if(kbd<0&&rows.length)moveKbd(Math.floor(lv.scrollTop/ROW_H));});
 let lastW=0,lastCols=0;const ro=new ResizeObserver(()=>{const w=big.clientWidth;if(w!==lastW){lastW=w;fit();}const c=cols();if(c!==lastCols){lastCols=c;placeStrip();}});
 ro.observe(big);ro.observe(wall);life.off(()=>ro.disconnect());
 document.fonts?.ready?.then(()=>{if(life.live)fit();});

 fillHero();renderWall();renderList();
 root.dataset.renderMs=(performance.now()-t0).toFixed(1);
 const gsap=animate&&motion();
 if(gsap)life.add(()=>{const units=big.querySelectorAll('.u'),cards=[...wall.querySelectorAll('.gs')].slice(0,10);
  const tl=gsap.timeline({defaults:{ease:'expo.out'}});
  tl.from(stage,{scale:1.06,rotationX:6,transformPerspective:1600,transformOrigin:'50% 0%',duration:1.2},0)
   .from(units,{yPercent:118,rotation:7,duration:1.05,stagger:{amount:Math.min(.9,units.length*.035)},ease:EASE_OUT},.05)
   .from(lede,{autoAlpha:0,y:14,duration:.6},.1)
   .from(root.querySelectorAll('.gl-bar > *'),{autoAlpha:0,y:-8,duration:.5,stagger:.08},.1);
  const fill=root.querySelector('.gl-prog-fill');if(fill)tl.from(fill,{scaleX:0,transformOrigin:'0 50%',duration:1.1,ease:'power3.out'},.3);
  /* the translation types in character by character, then goes back to plain text */
  const plain=zh.textContent;zh.innerHTML=[...plain].map(c=>`<span class="ch">${esc(c)}</span>`).join('');
  tl.from(zh.querySelectorAll('.ch'),{autoAlpha:0,y:10,duration:.4,stagger:{amount:Math.min(.8,plain.length*.012)},onComplete:()=>{if(life.live&&zh.querySelector('.ch'))zh.textContent=plain;}},.6)
   .from(root.querySelectorAll('.gl-who, .gl-act'),{autoAlpha:0,y:8,duration:.5,stagger:.08},.8)
   .from(root.querySelectorAll('.gl-scenes > .gl-h > *'),{autoAlpha:0,y:12,duration:.5,stagger:.06},.5)
   .from(cards,{autoAlpha:0,y:40,rotationX:-12,transformPerspective:1200,transformOrigin:'50% 0%',duration:.9,stagger:.05,clearProps:'transform'},.55);});
 else if(!window.gsap)loadGsap().catch(()=>{});
 return life.stop;}

function emptySentences(target,{t,esc,locale,life,animate,onLaunch,canLaunch}){
 const [a,b,c]=t.emptyBig,units=s=>[...s].map(ch=>`<span class="u">${esc(ch)}</span>`).join('');
 target.innerHTML=`<section class="gl gl-empty" aria-label="${esc(t.sentences)}"><div class="gl-stage gl-stage-empty">
  <i class="gl-zero" aria-hidden="true">0</i><p class="gl-lede">${esc(t.sentences)} <span>${esc(t.emptyLede)}</span></p>
  <h2 class="gl-big gl-big-zh" lang="${locale==='ja'?'ja':locale==='en'?'en':'zh'}"><span class="gl-row" style="--ind:14%"><span class="gl-mask">${units(a)}</span></span><span class="gl-row" style="--ind:24%"><span class="gl-mask"><span class="gl-em">${units(b)}</span>${units(c)}</span></span></h2>
  <p class="gl-teach">${esc(t.emptyTeach)}</p>
  <div class="gl-how">${t.how.map(([k,title,sub],i)=>`<article class="gc gc-how h${i+1}"><p class="gc-k">${esc(k)}</p><p class="gc-how-t">${i===1?`<span class="gl-chip">${esc(title)}</span>`:esc(title)}</p><p class="gc-zh">${esc(sub)}</p></article>`).join('')}</div>
  <div class="gl-empty-cta">${canLaunch&&onLaunch?`<button type="button" class="primary" data-launch>${esc(t.launch)}</button>`:''}<p class="gl-cta-end">${esc(t.emptyEnd)}<b>${esc(t.emptyWall)}</b></p></div></div></section>`;
 target.querySelector('[data-launch]')?.addEventListener('click',e=>onLaunch(e.currentTarget));
 const gsap=animate&&motion();
 if(gsap)life.add(()=>{const root=target.querySelector('.gl');gsap.timeline({defaults:{ease:'expo.out'}})
  .from(root.querySelector('.gl-stage'),{scale:1.06,rotationX:6,transformPerspective:1600,transformOrigin:'50% 0%',duration:1.2},0)
  .from(root.querySelectorAll('.gl-big .u'),{yPercent:118,rotation:7,duration:1.05,stagger:.035,ease:'power4.out'},.05)
  .from(root.querySelector('.gl-lede'),{autoAlpha:0,y:14,duration:.6},.1)
  .from(root.querySelector('.gl-zero'),{autoAlpha:0,scale:1.3,duration:1.4},0)
  .from(root.querySelectorAll('.gl-teach, .gl-empty-cta'),{autoAlpha:0,y:10,duration:.6,stagger:.1},.6)
  .from(root.querySelectorAll('.gc-how'),{z:-500,rotationY:i=>i%2?-60:60,autoAlpha:0,transformPerspective:1400,duration:1.1,stagger:.08},.45);});
 else if(!window.gsap)loadGsap().catch(()=>{});
 return life.stop;}
