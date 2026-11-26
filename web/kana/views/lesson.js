/* SPDX-License-Identifier: GPL-3.0-or-later
   MeguLit kana module · view: lesson (ported from the approved prototype) */
export function exampleHTML(example,word,esc){
 if(!example)return `<mark>${esc(word)}</mark>`;
 let html='',end=0;
 for(const at of example.matches||[]){
  html+=esc(example.text.slice(end,at))+'<mark>'+esc(word)+'</mark>';
  end=at+word.length;
 }
 return (html+esc(example.text.slice(end))).trim().replace(/^「/,'').replace(/」$/,'');
}
export function view(el,ctx){
const go=ctx.go,params=ctx.params,D=ctx.data,S=ctx.store;
const lesson=D.LESSONS.find(l=>l.id===params.id)||D.LESSONS[0],li=D.LESSONS.indexOf(lesson),nextLesson=D.LESSONS[li+1];
const isK=lesson.script==='k',scriptName=isK?'片假名':lesson.id.startsWith('d')?'浊音':'平假名';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
el.className='v-lesson';
el.innerHTML=`<div class="wrap">
  <div class="lesson-head">
    <div><a class="back" href="index.html">← 学习</a><h1>第 ${li+1} 课 · ${esc(lesson.title)}<small>${scriptName} · ${lesson.kana.length} 个</small></h1></div>
    <div class="head-right">${ctx.volumeHTML()}<nav class="steps" id="steps"></nav></div>
  </div>
  <section class="sheet" id="sheet"><div class="ribbon" aria-hidden="true"></div><div id="stage"></div></section>
  <p class="note">笔顺数据：KanjiVG（© Ulrich Apel，CC BY-SA 3.0）</p>
</div>`;

/* ---------- 课程数据（来自 data.js） ---------- */
const K=lesson.kana.map(k=>{const h=D.toHira(k),w=D.wordOf(k);return {k,kata:isK?h:D.toKata(k),r:D.romaOf(k),src:(isK?D.ORIGIN_K:D.ORIGIN_H)[k]||'',hint:D.hintOf(k),words:w?[w]:[],game:null};});
let gameHits={};
const STEPS=[["一","认识"],["二","辨认"],["三","回忆"],["四","混合"]];
const confuseR=k=>{const c=D.confusables(k);return c?c.g.filter(x=>x!==k).map(D.romaOf):[];};
let step=0,idx=0,seen=new Set([0]),queue=[],qi=0,stats={};K.forEach(x=>stats[x.k]={ok:0,bad:0});

const $=s=>el.querySelector(s),stage=$("#stage");
const speaker='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
function say(t){ctx.speech.say(t)}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];}return a}

function renderSteps(){$("#steps").innerHTML=STEPS.map(([n,l],i)=>`<span class="step ${i<step?'done':i===step?'on':''}"><i>${i<step?'✓':n}</i>${l}</span>`).join("")}

/* ---------- 第一步：认识 ---------- */
let animToken=0,left=false,speakTimer=0,nextTimer=0,strokeTimer=0;
ctx.onLeave?.(()=>{left=true;animToken++;clearTimeout(speakTimer);clearTimeout(nextTimer);clearTimeout(strokeTimer);});
const kvgCache={};
async function kvg(ch){
  if(kvgCache[ch])return kvgCache[ch];
  const hex=ch.codePointAt(0).toString(16).padStart(5,"0");
  const txt=await fetch(ctx.base+`kanjivg/${hex}.svg`).then(r=>r.text());
  const doc=new DOMParser().parseFromString(txt,"image/svg+xml");
  const ds=[...doc.querySelectorAll("path[id*='-s']")].sort((a,b)=>+a.id.split("-s")[1]-+b.id.split("-s")[1]).map(p=>p.getAttribute("d"));
  return kvgCache[ch]=ds;
}
async function drawStrokes(x){
  /* KanjiVG 笔顺数据（CC BY-SA 3.0），viewBox 109×109 */
  const tok=++animToken,ds=await kvg(x.k);if(left||tok!==animToken)return;
  const box=$("#strokes");$("#scount").textContent=ds.length+" 画";
  box.innerHTML=ds.map(d=>`<path d="${d}" class="gh"/>`).join("")+ds.map((d,i)=>`<path d="${d}" class="st" id="s${i}"/>`).join("")+
    ds.map((d,i)=>{const m=d.match(/M\s*([\d.]+)[ ,]([\d.]+)/);return `<text x="${+m[1]-7}" y="${+m[2]-2}" class="sn" id="n${i}" opacity="0">${i+1}</text>`}).join("");
  const paths=[...box.querySelectorAll(".st")];
  paths.forEach(p=>{const L=p.getTotalLength();p.style.strokeDasharray=L;p.style.strokeDashoffset=L;});
  if(matchMedia("(prefers-reduced-motion:reduce)").matches){paths.forEach((p,i)=>{p.style.strokeDashoffset=0;$("#n"+i)?.setAttribute("opacity","1")});return}
  let i=0;(function next(){if(left||tok!==animToken||i>=paths.length){paths.forEach(p=>p.classList.remove("cur"));return}
    const p=paths[i],L=p.getTotalLength(),t0=performance.now(),dur=Math.max(420,L*8);p.classList.add("cur");$("#n"+i)?.setAttribute("opacity","1");
    (function f(now){if(left||tok!==animToken)return;const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,2);p.style.strokeDashoffset=L*(1-e);if(k<1)requestAnimationFrame(f);else{p.classList.remove("cur");i++;clearTimeout(strokeTimer);strokeTimer=setTimeout(next,200)}})(t0);})();
}
function renderLearn(){
  const x=K[idx],last=idx===K.length-1;
  stage.innerHTML=`<div class="learn">
   <div class="stroke-col">
     <div class="grid-box"><svg viewBox="0 0 109 109" id="strokes"></svg></div>
     <div class="stroke-ctl"><button class="pill" id="replay">重播笔顺</button><span id="scount"></span></div>
     ${x.src?`<div class="origin"><b>${x.src}</b>字源 · 「${x.src}」→ <span>${x.k}</span></div>`:""}
   </div>
   <div class="info-col">
     <div class="kana-line"><span class="ja">${x.k}</span><span class="ja kata">${x.kata}</span><span class="romaji">${x.r}</span>
       <button class="sound" id="snd" aria-label="播放发音" title="播放发音 (空格)">${speaker}</button></div>
     <p class="hint">${x.hint}</p>
     ${x.words.length?`<div class="label">例词</div>
     <div class="words">${x.words.map(([w,rd,zh])=>`<div class="word">${w===rd?`<span class="ja" style="font-size:22px;color:var(--paper-ink)">${esc(w).split(x.k).join(`<mark>${x.k}</mark>`)}</span>`:`<ruby>${esc(w)}<rt>${esc(rd).split(D.toHira(x.k)).join(`<mark>${D.toHira(x.k)}</mark>`)}</rt></ruby>`}<span>${esc(zh)}</span><button class="pill" style="height:24px;padding:0 8px;margin-left:auto" data-say="${esc(w)}">♪</button></div>`).join("")}</div>`:""}
     <div class="label">在你的游戏里</div>
     <div class="found-slot">${foundHTML(x)}</div>
     <div class="learn-foot">
       <div class="dots">${K.map((y,i)=>`<button class="${i===idx?'on':seen.has(i)?'seen':''}" data-idx="${i}">${y.k}</button>`).join("")}</div>
       <button class="btn" id="nx">${last?'开始辨认':'下一个'} <kbd>Enter</kbd></button>
     </div>
   </div></div>`;
  drawStrokes(x);
  $("#replay").onclick=()=>drawStrokes(x);
  $("#snd").onclick=()=>say(x.k);
  stage.querySelectorAll("[data-say]").forEach(b=>b.onclick=()=>say(b.dataset.say));
  stage.querySelectorAll("[data-idx]").forEach(b=>b.onclick=()=>{idx=+b.dataset.idx;seen.add(idx);renderLearn()});
  $("#nx").onclick=nextLearn;
}
function foundHTML(x){
  const h=D.toHira(x.k);let best=null;
  for(const [w,v] of Object.entries(gameHits))if(w.includes(h)&&(!best||v.count>best[1].count))best=[w,v];
  if(!best)return `<p class="found-empty">${gameLoaded?`你读过的游戏文本里还没遇到含「${esc(x.k)}」的常用词`:'正在查找你读过的游戏文本…'}</p>`;
  const [w,v]=best,ex=v.example;
  const line=exampleHTML(ex,w,esc);
  const when=ex&&ex.read_at?new Date(ex.read_at*1000).toLocaleDateString('zh-CN',{month:'long',day:'numeric'}):'';
  return `<div class="found"><q>${line}</q><small><span>${esc(ex?.title||'')}</span>${when?`<span>·</span><span>${when}</span>`:''}<span>·</span><span>「${esc(w)}」共出现 ${v.count} 次</span></small></div>`;
}
let gameLoaded=false;
ctx.gameWords().then(r=>{if(left)return;gameHits=r||{};gameLoaded=true;const slot=el.querySelector(".found-slot");if(slot&&step===0)slot.innerHTML=foundHTML(K[idx]);});
function nextLearn(){if(idx<K.length-1){idx++;seen.add(idx);renderLearn()}else{goStep(1)}}

/* ---------- 第二～四步：测验 ---------- */
const POOLK=(lesson.id.startsWith("d")?D.DAKU_LIST:D.SEION_LIST).map(k=>isK?D.toKata(k):k),ALLR=[...new Set(POOLK.map(D.romaOf))],EXTRA_K=POOLK;
function buildQueue(){
  if(step===1)return shuffle(K.map(x=>({x,mode:"k2r"})));
  if(step===2)return shuffle(K.map(x=>({x,mode:Math.random()<.5?"snd2k":"r2k"})));
  return shuffle([...K.map(x=>({x,mode:"k2r"})),...K.map(x=>({x,mode:"snd2k"}))]).slice(0,8);
}
function options(q){
  if(q.mode==="k2r"){const pool=shuffle(ALLR.filter(r=>r!==q.x.r)),c=confuseR(q.x.k).filter(r=>pool.includes(r));const pick=[...new Set([...c,...pool])].slice(0,3);return shuffle([q.x.r,...pick])}
  const near=(D.confusables(q.x.k)?.g||[]).filter(k=>k!==q.x.k);const pool=[...new Set([...shuffle(near),...shuffle([...K.map(y=>y.k),...EXTRA_K])])].filter(k=>k!==q.x.k&&D.romaOf(k)!==q.x.r);return shuffle([q.x.k,...pool.slice(0,3)]);
}
let locked=false,cur=null,opts=[],total=0;
function renderQuiz(){
  cur=queue[qi];opts=options(cur);locked=false;
  const ask={k2r:"这个假名读作？",r2k:"哪个假名读作这个音？",snd2k:"听发音，选出假名"}[cur.mode];
  let big=cur.mode==="k2r"?`<div class="big">${cur.x.k}</div>`:cur.mode==="r2k"?`<div class="big latin">${cur.x.r}</div>`:`<button class="sound" id="qs" aria-label="再听一次">${speaker}</button><div class="ask" style="margin-top:8px"><kbd>空格</kbd> 再听一次</div>`;
  stage.innerHTML=`<div class="quiz">
    <div class="q-meta"><span>${STEPS[step][1]} · ${step===3?'本课 + 已学假名混合，答错的稍后会再出现':step===1?'看假名选读音':'看罗马音或听音选假名'}</span><span class="num">${qi+1} / ${queue.length}</span></div>
    <div class="q-bar"><i style="width:${qi/queue.length*100}%"></i></div>
    <div class="prompt"><div class="ask">${ask}</div>${big}</div>
    <div class="choices">${opts.map((o,i)=>`<button class="choice ${cur.mode==='k2r'?'latin':'kana'}" data-i="${i}"><kbd>${i+1}</kbd>${o}</button>`).join("")}</div>
    <div class="feedback" id="fb"></div></div>`;
  clearTimeout(speakTimer);
  if(cur.mode==="snd2k"){$("#qs").onclick=()=>say(cur.x.k);speakTimer=setTimeout(()=>{if(!left)say(cur.x.k)},250)}
  stage.querySelectorAll(".choice").forEach(b=>b.onclick=()=>answer(+b.dataset.i));
}
function answer(i){
  if(locked)return;locked=true;total++;
  const correct=cur.mode==="k2r"?cur.x.r:cur.x.k,ok=opts[i]===correct,btns=stage.querySelectorAll(".choice");
  btns.forEach((b,j)=>{if(opts[j]===correct)b.classList.add("right")});
  const fb=$("#fb");
  if(ok){stats[cur.x.k].ok++;fb.innerHTML=`<span class="okt">正确</span> · ${cur.x.k} = ${cur.x.r}`;if(cur.mode!=="k2r")say(cur.x.k)}
  else{stats[cur.x.k].bad++;btns[i].classList.add("wrong");
    const tip=cur.mode==="k2r"&&confuseR(cur.x.k).includes(opts[i])?`「${cur.x.k}」和读作 ${opts[i]} 的假名形近：${cur.x.hint.split("。").pop()||cur.x.hint}`:cur.x.hint;
    fb.innerHTML=`<b>是「${cur.x.k}」(${cur.x.r})</b><br>${tip}`+(step===3?`<br><span class="requeue">这一题会在稍后再出现</span>`:"");
    if(step===3)queue.push({x:cur.x,mode:cur.mode});}
  clearTimeout(nextTimer);
  nextTimer=setTimeout(()=>{if(left)return;qi++;if(qi<queue.length)renderQuiz();else if(step<3)goStep(step+1);else renderDone()},ok?650:1700);
}

/* ---------- 完成 ---------- */
function renderDone(){
  step=4;renderSteps();
  /* 写入学习记录：本课假名至少「见过」，全对的「熟悉」，并放进复习盒 1 */
  const m=S.get(S.KEY.m,{}),b=S.get(S.KEY.b,{}),now=Date.now();
  K.forEach(x=>{const s=stats[x.k],l=s.bad===0?2:1;m[x.k]=Math.max(m[x.k]||0,l);if(!b[x.k])b[x.k]={box:1,due:now+S.DAY};});
  S.put(S.KEY.m,m);S.put(S.KEY.b,b);S.lessonDone(lesson.id);
  const learned=new Set(Object.entries(m).filter(([,v])=>v>=1).map(([k])=>D.toHira(k)));
  const mine=new Set(K.map(x=>D.toHira(x.k)));
  const readable=Object.entries(gameHits).filter(([w])=>[...w].every(c=>learned.has(c))&&[...w].some(c=>mine.has(c))).sort((a,b)=>b[1].count-a[1].count).slice(0,6);
  stage.innerHTML=`<div class="finish">
   <div><h2>${esc(lesson.title)} · 学完了</h2><p>${K.length} 个假名都已「见过」，答题全对的升为「熟悉」。明天复习一次全对就会成为「掌握」</p>
    <div class="mastery-change">${K.map(x=>{const s=stats[x.k],l=s.bad===0?2:1;return `<div class="mc"><b>${x.k}</b><div class="lv">${[0,1,2].map(j=>`<i class="${j<l?'f':''}"></i>`).join("")}</div><small>${l===2?'熟悉':'见过'} · 错 ${s.bad} 次</small></div>`}).join("")}</div>
    <p class="next-review">下次复习：<b>明天</b>（复习间隔 1 天，之后 3 天 → 7 天 → 21 天）</p></div>
   <div class="game-words"><h3>你的游戏里，现在能读出来的词</h3>
    ${readable.length?readable.map(([w,v])=>`<div class="gw"><span class="w">${[...w].map(c=>mine.has(c)?`<mark>${c}</mark>`:c).join("")}</span><small>${esc(v.example?.title||'')} · 出现 ${v.count} 次 · 红色是本课学过的假名</small></div>`).join(""):`<p class="found-empty">${isK?'游戏文本里的片假名词多是外来语，学完更多行就能读出来了':'再学几行，就能读出游戏里的常用词了'}</p>`}
   </div>
   <div class="done-actions"><button class="pill" data-go="@reload">重学本课</button>${nextLesson?`<button class="btn" data-go="lesson.html?id=${nextLesson.id}">下一课 · ${esc(nextLesson.title)} →</button>`:`<button class="btn" data-go="games.html">去练习 →</button>`}</div></div>`;
}

function goStep(s){step=s;renderSteps();if(s===0){renderLearn();return}queue=buildQueue();qi=0;renderQuiz()}

ctx.onKey(e=>{
  if(e.target.closest("input,textarea"))return;
  if(step===0){if(e.key==="Enter"){e.preventDefault();nextLearn()}if(e.key===" "){e.preventDefault();say(K[idx].k)}if(e.key==="ArrowRight"&&idx<K.length-1){idx++;seen.add(idx);renderLearn()}if(e.key==="ArrowLeft"&&idx>0){idx--;renderLearn()}}
  else if(step<4){if(/^[1-4]$/.test(e.key))answer(+e.key-1);if(e.key===" "&&cur?.mode==="snd2k"){e.preventDefault();say(cur.x.k)}}
});
goStep(0);
ctx.speech.prefetch([...K.map(x=>x.k),...K.flatMap(x=>x.words.map(w=>w[0]))]);

}
