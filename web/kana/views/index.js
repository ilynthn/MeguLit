/* SPDX-License-Identifier: GPL-3.0-or-later
   MeguLit kana module · view: index (学习主页). 2026-11-11 rebuilt from scratch in the megu-edit look (user: 推翻现有排版，
   全部重新设计; 假名游戏 merged in): a HUD strip, a black stage with the lesson to continue, a lesson rail, the kana board
   as the centre (click a kana: hear it, set 未学/见过/熟悉/掌握), the three practice games inline, review and kanji. */
/* 2026-11-11 the lab speaks the interface language (it was Chinese under every language) */
const KL=()=>{const l=String(globalThis.document?.documentElement?.lang||'zh');return l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';};
const KT={
 zh:{lv:['未学','见过','熟悉','掌握'],games:[['pos','行段识别','き → か行 · い段','看到假名，说出它在哪一行、哪一段'],['seq','前后假名','？き？ → か · く','按五十音顺序，说出前一个和后一个'],['conv','平片转换','か ⇄ カ','平假名和片假名互相认']],diffs:[['intro','入门'],['std','标准'],['adv','进阶'],['chal','挑战']],
  streak:'连续天数',week:'本周答题',avg:'平均用时',best:'最长连对',beta:'五十音学习还在开发中',cont:'继续学习',kata:'片假名',daku:'浊音',hira:'平假名',left:n=>`这一课还有 ${n} 个假名不熟`,steps:'认识 → 辨认 → 回忆 → 混合，四步学完一行，大约五分钟',confuse:'容易混',go:'继续',start:'开始',familiar:'已熟悉',lessons:'课程',more:'片假名 · 浊音 · 拗音',board:'平假名熟悉度',boardAria:'平假名熟悉度，点格子查看',empty:'点左边任意一个假名：听发音、标熟悉度、看笔顺',practice:'练习',renshu:'练习',diffAria:'难度',rules:'看每种玩法的规则和难度 →',review:'复习 · fukushū',dueYes:'个假名到了复习时间，先复习再学新课',dueNo:'今天没有到期的假名',weak:'薄弱假名',weakN:n=>`专项训练这 ${n} 个`,chart:'五十音图 · gojūon',chartSub:'平片对照、浊音、拗音、易混对比',kanji:'汉字读音 · kanji',kanjiSub:'打开《漢字でGO!》官方网页（Micelle · PLiCy，含广告，需联网）',level:'熟悉度',stroke:'看笔顺和例词 →'},
 ja:{lv:['未学習','見た','なじみ','習得'],games:[['pos','行と段','き → か行 · い段','仮名を見て、何行・何段かを答える'],['seq','前後の仮名','？き？ → か · く','五十音順で前と後の仮名を答える'],['conv','ひらがな⇄カタカナ','か ⇄ カ','ひらがなとカタカナを相互に読む']],diffs:[['intro','入門'],['std','標準'],['adv','上級'],['chal','挑戦']],
  streak:'連続日数',week:'今週の解答',avg:'平均時間',best:'最長連続正解',beta:'五十音学習は開発中です',cont:'続きから',kata:'カタカナ',daku:'濁音',hira:'ひらがな',left:n=>`この課はまだ ${n} 文字があやふや`,steps:'覚える → 見分ける → 思い出す → まとめ。4 ステップで 1 行、約 5 分',confuse:'まぎらわしい',go:'続ける',start:'はじめる',familiar:'なじみ済み',lessons:'レッスン',more:'カタカナ · 濁音 · 拗音',board:'ひらがな習熟度',boardAria:'ひらがな習熟度。マスを押して確認',empty:'左の仮名を押すと、発音・習熟度・書き順が見られます',practice:'練習',renshu:'練習',diffAria:'難易度',rules:'それぞれの遊び方と難易度 →',review:'復習 · fukushū',dueYes:'文字が復習の時期です。先に復習してから新しい課へ',dueNo:'今日の復習はありません',weak:'苦手な仮名',weakN:n=>`この ${n} 文字を集中練習`,chart:'五十音図 · gojūon',chartSub:'ひらがな・カタカナ対照、濁音、拗音、まぎらわしい字',kanji:'漢字の読み · kanji',kanjiSub:'「漢字でGO!」公式ページを開く（Micelle · PLiCy、広告あり、要ネット接続）',level:'習熟度',stroke:'書き順と例語 →'},
 en:{lv:['New','Seen','Familiar','Known'],games:[['pos','Row and column','き → か row · い column','See a kana, name its row and column'],['seq','Before and after','？き？ → か · く','Name the kana before and after it in order'],['conv','Hiragana ⇄ katakana','か ⇄ カ','Read each script as the other']],diffs:[['intro','Intro'],['std','Standard'],['adv','Advanced'],['chal','Challenge']],
  streak:'day streak',week:'answers this week',avg:'average time',best:'best run',beta:'Kana study is still in development',cont:'Continue learning',kata:'Katakana',daku:'Voiced',hira:'Hiragana',left:n=>`${n} kana in this lesson are still shaky`,steps:'Meet → tell apart → recall → mix: one row in four steps, about five minutes',confuse:'easy to confuse',go:'Continue',start:'Start',familiar:'familiar',lessons:'Lessons',more:'Katakana · voiced · contracted',board:'Hiragana familiarity',boardAria:'Hiragana familiarity, click a cell to open it',empty:'Click any kana on the left: hear it, set how well you know it, see the strokes',practice:'Practice',renshu:'Practice',diffAria:'Difficulty',rules:'Rules and difficulty of each game →',review:'Review · fukushū',dueYes:'kana are due. Review them before a new lesson',dueNo:'Nothing is due today',weak:'Weak kana',weakN:n=>`Drill these ${n}`,chart:'Kana chart · gojūon',chartSub:'Hiragana and katakana side by side, voiced, contracted, look-alikes',kanji:'Kanji readings · kanji',kanjiSub:'Opens the official 漢字でGO! page (Micelle · PLiCy, with ads, needs internet)',level:'Familiarity',stroke:'Strokes and example words →'}
};
const kt=()=>KT[KL()]||KT.zh;
export function view(el,ctx){
const t=kt();
const {store:S,data:D}=ctx,KEY=S.KEY;
const m=S.get(KEY.m,{}),boxes=S.get(KEY.b,{}),runs=S.get(KEY.r,[]),lessons=S.get(KEY.l,{}),now=Date.now();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lv=k=>m[k]||0;
const LV=t.lv;
const seionH=D.SEION_LIST,known=seionH.filter(k=>lv(k)>=2).length;
const next=D.LESSONS.find(l=>!lessons[l.id])||D.LESSONS[0],started=Object.keys(lessons).length>0;
const nextUnknown=next.kana.find(k=>lv(k)<2)||next.kana[0];
const confuseIn=next.kana.map(k=>D.confusables(k)).find(Boolean);
const due=Object.entries(boxes).filter(([,v])=>v.due<=now).map(([k])=>k);
const week=runs.filter(r=>now-r.id<7*S.DAY),qWeek=week.reduce((s,r)=>s+r.log.length,0);
const tWeek=week.flatMap(r=>r.log.map(l=>l.t)),avg=tWeek.length?tWeek.reduce((a,b)=>a+b,0)/tWeek.length:0;
const days=new Set(runs.map(r=>new Date(r.id).toDateString()).concat(Object.values(lessons).map(t=>new Date(t).toDateString())));let streak=0;for(const d=new Date();days.has(d.toDateString());d.setDate(d.getDate()-1))streak++;
const bestStreak=week.reduce((b,r)=>Math.max(b,r.best||0),0);
const wk={};week.forEach(r=>r.log.filter(l=>!l.ok).forEach(l=>{wk[l.show]=(wk[l.show]||0)+1;}));
const weak=Object.entries(wk).sort((a,b)=>b[1]-a[1]).slice(0,4);
const bestAcc=runs.filter(r=>!(r.only&&r.only.length)&&r.log.length).reduce((b,r)=>Math.max(b,D.achievement(r.log).pct),0);
const ROMAN=['I','II','III','IV','V','VI','VII','VIII','IX','X'];
const hira=D.LESSONS.filter(l=>l.id.startsWith('h'));
const grid='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもや　ゆ　よらりるれろわ　　　をん';
const GAMES=t.games;
/* 2026-11-13 (user: the lesson rail was useless and jumped straight into practice): the board switches 平假名 / 片假名 / 浊音,
   the title arrows and a click on the board only move the current lesson; only the 继续 button (or Enter) starts one */
const SETS=[[t.hira,grid,'h'],[t.kata,D.toKata(grid),'k'],[t.daku,D.DAKU_LIST.join(''),'d']];
const lessonOf=k=>D.LESSONS.find(l=>l.kana.includes(k));
const DIFFS=t.diffs;

el.className='v-index mg';
el.innerHTML=`<main class="mg-page">
 <header class="mg-hud">
  <span class="mg-tag">${esc(t.hira)}</span>
  <span class="mg-hud-stats"><span><b>${streak}</b>${t.streak}</span><span><b>${qWeek}</b>${t.week}</span><span><b>${avg?avg.toFixed(1)+'s':'—'}</b>${t.avg}</span><span><b>${bestStreak}</b>${t.best}</span></span>
  <span class="mg-hud-note" title="${t.beta}">Beta</span>
 </header>

 <section class="mg-stage" aria-label="${t.cont}" data-stage></section>

 <section class="mg-board">
  <div class="mg-board-grid">
   <header><span class="mg-seg" role="radiogroup" aria-label="${t.board}">${SETS.map((x,i)=>`<button type="button" role="radio" data-set="${i}" aria-checked="${i===0}">${x[0]}</button>`).join('')}</span><span class="mg-legend">${LV.map((t,i)=>`<span><i class="m${i}"></i>${t}</span>`).join('')}<span><i class="m4"></i>${({zh:'当前课',ja:'現在の課',en:'Current'})[KL()]||'当前课'}</span></span></header>
   <div class="mastery" role="grid" aria-label="${t.boardAria}" data-board></div>
  </div>
  <aside class="mg-board-side">
   <div class="mk-card" data-mk-card hidden></div>
   <div class="mg-board-empty" data-mk-empty><b>あ</b><p>${t.empty}</p></div>
   <div class="mg-voice"></div>
  </aside>
 </section>

 <section class="mg-practice" id="practice" aria-label="${t.practice}">
  <header><span class="mg-tag">${t.renshu}</span><span class="mg-diffs" role="radiogroup" aria-label="${t.diffAria}">${DIFFS.map(([id,t],i)=>`<button type="button" role="radio" aria-checked="${i===0}" class="${i===0?'on':''}" data-diff="${id}">${t}</button>`).join('')}</span><small class="mg-num">最佳达成率 ${bestAcc?D.fmtPct(bestAcc):'—'}</small></header>
  <div class="mg-games">${GAMES.map(([id,name,sample,desc],i)=>`<button class="mg-game" data-game="${id}" style="--i:${i}"><span class="mg-sample" lang="ja">${esc(sample)}</span><b>${name}</b><small>${desc}</small></button>`).join('')}</div>
  <button class="mg-link" data-go="games.html">${t.rules}</button>
 </section>

 <section class="mg-extra">
  <button class="mg-tile${due.length?' hot':''}" data-go="${due.length?`play.html?g=conv&d=intro&only=${encodeURIComponent(due.join(','))}`:'records.html'}"><em>${t.review}</em><b class="mg-num">${due.length}</b><small>${due.length?t.dueYes:t.dueNo}</small></button>
  ${weak.length?`<button class="mg-tile" data-go="play.html?g=conv&d=intro&only=${encodeURIComponent(weak.map(x=>x[0]).join(','))}"><em>${t.weak}</em><b lang="ja">${weak.map(([k])=>esc(k)).join(' ')}</b><small>${t.weakN(weak.length)}</small></button>`:''}
  <button class="mg-tile" data-go="gojuon.html"><em>${t.chart}</em><b lang="ja">あ ア</b><small>${t.chartSub}</small></button>
  <button class="mg-tile" data-go="kanji.html"><em>${t.kanji}</em><b lang="ja">漢</b><small>${t.kanjiSub}</small></button>
 </section>
</main>`;
let cur=next,set=0;
const stage=el.querySelector('[data-stage]'),board=el.querySelector('[data-board]');
function drawStage(L){cur=L;const nu=L.kana.find(k=>lv(k)<2)||L.kana[0],cf=L.kana.map(k=>D.confusables(k)).find(Boolean),ks=SETS.find(x=>x[2]===L.id[0])[1].replace(/　/g,'').split(''),kn=ks.filter(k=>lv(k)>=2).length,i=D.LESSONS.indexOf(L);
 stage.innerHTML=`<div class="mg-stage-kana" aria-hidden="true"><span class="mg-ghost">${esc(nu)}</span><b>${esc(nu)}</b></div>
  <div class="mg-stage-copy">
   <h1><span class="mg-title">${esc(L.title)}</span><small class="mg-script">${esc(L.script==='k'?t.kata:L.id.startsWith('d')?t.daku:t.hira)}</small><span class="mg-pick"><button type="button" data-step="-1" aria-label="prev"${i?'':' disabled'}>‹</button><small class="mg-num">${i+1}/${D.LESSONS.length}</small><button type="button" data-step="1" aria-label="next"${i<D.LESSONS.length-1?'':' disabled'}>›</button></span></h1>
   <p class="mg-sub">${started?t.left(L.kana.filter(k=>lv(k)<2).length):t.steps}${cf&&cf.tip?` · ${esc(cf.g.join(' / '))} ${t.confuse}`:''}</p>
   <div class="mg-row"><button class="mg-cta" data-go="lesson.html?id=${L.id}">${started?t.go:t.start}<kbd>Enter</kbd></button>
    <div class="mg-prog"><div class="mg-barcode" aria-label="${kn} / ${ks.length} ${t.familiar}"><i style="width:${ks.length?kn/ks.length*100:0}%"></i></div><small class="mg-num">${String(kn).padStart(2,'0')}<em>/${ks.length}</em></small></div></div>
  </div>`;
 stage.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{const n=D.LESSONS[i+ +b.dataset.step];if(!n)return;const s2=SETS.findIndex(x=>x[2]===n.id[0]);drawStage(n);if(s2!==set)drawBoard(s2);else markRow();});}
function markRow(){board.querySelectorAll('[data-mk]').forEach(x=>x.classList.toggle('row',lessonOf(x.dataset.mk)===cur));}
function drawBoard(n){set=n;const g=SETS[n][1];board.classList.toggle('d',n===2);
 el.querySelectorAll('[data-set]').forEach(b=>b.setAttribute('aria-checked',String(+b.dataset.set===n)));
 board.innerHTML=[...g].map(c=>c==='　'?'<span class="gap"></span>':`<button type="button" class="m${lv(c)}" data-mk="${c}" title="${c} · ${LV[lv(c)]}" aria-label="${c} ${D.romaOf(c)} ${LV[lv(c)]}">${c}</button>`).join('');markRow();}
drawStage(next);drawBoard(Math.max(0,SETS.findIndex(x=>x[2]===next.id[0])));
el.querySelectorAll('[data-set]').forEach(b=>b.onclick=()=>{const n=+b.dataset.set;const L=D.LESSONS.find(l=>l.id[0]===SETS[n][2]&&!lessons[l.id])||D.LESSONS.find(l=>l.id[0]===SETS[n][2]);drawStage(L);drawBoard(n);open='';card.hidden=true;empty.hidden=false;});
ctx.onKey?.(e=>{const tg=e.target;if(e.key==='Enter'&&!e.isComposing&&!(tg&&tg.closest&&tg.closest('button,input,select,textarea,a'))){e.preventDefault();stage.querySelector('.mg-cta')?.click();}});
el.querySelector('.mg-voice')?.append(ctx.voicePicker({note:false}));

/* practice: pick a difficulty, then a game starts right here (the old 假名游戏 tab) */
let diff='intro';
el.querySelectorAll('[data-diff]').forEach(b=>b.onclick=()=>{diff=b.dataset.diff;el.querySelectorAll('[data-diff]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-checked',String(x===b));});beat(b);});
el.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>{beat(b);ctx.go(`play.html?g=${b.dataset.game}&d=${diff}&s=h`);});

/* megu-edit motion (2026-11-11): focus-pull entrance, the lesson title typed with a ▮ block, the barcode rising,
   single-frame invert + push on a click; only on load or a click, none with reduced motion */
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,EXPO='cubic-bezier(.16,1,.3,1)';
function beat(b){if(calm||!b)return;b.animate([{filter:'invert(1)'},{filter:'invert(1)'},{filter:'none'}],{duration:70,easing:'steps(1,end)'});b.animate([{transform:'scale(1.08)'},{transform:'none'}],{duration:480,easing:EXPO});}
if(!calm){
 el.querySelector('.mg-stage-kana b')?.animate([{filter:'blur(14px)',opacity:0,transform:'scale(1.4) rotate(-6deg)'},{filter:'none',opacity:1,transform:'none'}],{duration:760,easing:EXPO});
 el.querySelector('.mg-ghost')?.animate([{transform:'translate(-40px,0) scale(1.1)',opacity:0},{transform:'none',opacity:.08}],{duration:1100,easing:EXPO,fill:'backwards'});
 el.querySelectorAll('.mg-lesson,.mg-game,.mg-tile,.mg-board>*').forEach((c,i)=>c.animate([{opacity:0,transform:'translateY(18px)',filter:'blur(6px)'},{opacity:1,transform:'none',filter:'none'}],{duration:520,delay:160+Math.min(i,16)*40,easing:EXPO,fill:'backwards'}));
 el.querySelectorAll('.mg-barcode i').forEach((b,i)=>b.animate([{transform:'scaleY(0)'},{transform:'none'}],{duration:320,delay:420+i*14,easing:EXPO,fill:'backwards'}));
 el.querySelectorAll('.mastery button').forEach((b,i)=>b.animate([{opacity:0,transform:'scale(.6)'},{opacity:1,transform:'none'}],{duration:360,delay:300+i*10,easing:EXPO,fill:'backwards'}));
 const h=el.querySelector('[data-type]');if(h){const c=[...h.textContent];let n=0;h.textContent='▮';const tick=()=>{n++;h.textContent=c.slice(0,n).join('')+(n<c.length?'▮':'');if(n<c.length)setTimeout(tick,45);};setTimeout(tick,260);}
}
/* old 假名游戏 tab links land on the practice block */
if(ctx.params?.focus==='practice'){const p=el.querySelector('#practice');setTimeout(()=>{p?.scrollIntoView?.({block:'start',behavior:calm?'auto':'smooth'});beat(p);},200);}

/* 2026-11-11 (user: the familiarity chart should be usable): a cell opens a card to hear it and set 未学/见过/熟悉/掌握 */
const card=el.querySelector('[data-mk-card]'),empty=el.querySelector('[data-mk-empty]');let open='';
const drawCard=k=>{const l=lv(k),w=D.wordOf?D.wordOf(k):null;card.hidden=false;empty.hidden=true;
 card.innerHTML=`<div class="mk-head"><b class="mk-kana">${esc(k)}</b><div><span class="mk-roma">${esc(D.romaOf(k))}</span><small>${esc(D.toKata(k))}${w&&w[0]?' · '+esc(w[0])+(w[1]?'（'+esc(w[1])+'）':''):''}</small></div><button type="button" class="mk-say" data-mk-say aria-label="发音">▶ 发音</button></div>
<div class="mk-levels" role="radiogroup" aria-label="${t.level}">${LV.map((t,i)=>`<button type="button" role="radio" class="mk-lv l${i}${i===l?' on':''}" aria-checked="${i===l}" data-mk-lv="${i}">${t}</button>`).join('')}</div>
<button type="button" class="mk-go" data-go="gojuon.html?k=${encodeURIComponent(k)}">${t.stroke}</button>`;
 card.querySelector('[data-mk-say]').onclick=()=>ctx.speech.say(k);
 card.querySelectorAll('[data-mk-lv]').forEach(b=>b.onclick=()=>{m[k]=+b.dataset.mkLv;S.put(KEY.m,m);const cell=el.querySelector(`[data-mk="${k}"]`);if(cell){cell.className='m'+m[k]+' sel';cell.title=k+' · '+LV[m[k]];beat(cell);}drawCard(k);});
 if(!calm)card.animate([{opacity:0,filter:'blur(6px)',transform:'translateX(12px)'},{opacity:1,filter:'none',transform:'none'}],{duration:360,easing:EXPO});};
board.addEventListener('click',e=>{const b=e.target.closest('[data-mk]');if(!b)return;const k=b.dataset.mk;const L=lessonOf(k);if(L&&L!==cur){drawStage(L);markRow();}beat(b);board.querySelectorAll('[data-mk]').forEach(x=>x.classList.toggle('sel',x===b&&open!==k));if(open===k){open='';card.hidden=true;empty.hidden=false;return;}open=k;drawCard(k);ctx.speech.say(k);});
}
