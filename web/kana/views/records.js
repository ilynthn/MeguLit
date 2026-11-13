/* SPDX-License-Identifier: GPL-3.0-or-later
   MeguLit kana module · view: records (ported from the approved prototype) */
export function view(el,ctx){
const go=ctx.go,params=ctx.params;
el.className='v-records';
el.innerHTML=`<div class="wrap" id="app"></div>`;

const S=ctx.store,m=S.get(S.KEY.m,{}),boxes=S.get(S.KEY.b,{}),runs=S.get(S.KEY.r,[]),now=Date.now();
const toKata=s=>s.replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60));
const GRID="あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもや_ゆ_よらりるれろわ___をん____".split("");
const SEION=GRID.filter(k=>k!=="_");
const DAKU="がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ".split("");
const YOON="きゃきゅきょしゃしゅしょちゃちゅちょにゃにゅにょひゃひゅひょみゃみゅみょりゃりゅりょぎゃぎゅぎょじゃじゅじょびゃびゅびょぴゃぴゅぴょ".match(/../g);
let script="h";
const lvOf=k=>m[k]||0;
const count=list=>{const c=[0,0,0,0];list.forEach(k=>c[lvOf(k)]++);return c};
const due=Object.entries(boxes).filter(([k,v])=>v.due<=now).map(([k])=>k);
const boxCount=[1,2,3,4].map(n=>Object.values(boxes).filter(v=>v.box===n).length);
const week=runs.filter(r=>now-r.id<7*S.DAY);
const qWeek=week.reduce((s,r)=>s+r.log.length,0),okWeek=week.reduce((s,r)=>s+r.log.filter(l=>l.ok).length,0);
const days=new Set(runs.map(r=>new Date(r.id).toDateString()));let streak=0;for(let d=new Date();days.has(d.toDateString());d.setDate(d.getDate()-1))streak++;
const wk={};week.forEach(r=>r.log.filter(l=>!l.ok).forEach(l=>wk[l.show]=(wk[l.show]||0)+1));
const weak=Object.entries(wk).sort((a,b)=>b[1]-a[1]).slice(0,6),wmax=weak[0]?.[1]||1;
const cS=count(SEION),known=cS[2]+cS[3];
const KD=ctx.data,best=(G,D)=>{const rs=runs.filter(r=>r.G===G&&r.D===D&&!(r.only&&r.only.length)&&r.log.length);if(!rs.length)return null;const As=rs.map(r=>KD.achievement(r.log)),b=As.reduce((a,x)=>x.pct>a.pct?x:a);return {score:KD.fmtPct(b.pct),n:rs.length}};
function nextStep(){
  if(due.length)return {seal:"復",text:`先清掉今天到期的 ${due.length} 个复习，大约 2 分钟`,href:`play.html?g=conv&d=intro&only=${encodeURIComponent(due.join(","))}`,go:"开始复习"};
  const lessons=S.get(S.KEY.l,{}),nextL=ctx.data.LESSONS.find(l=>!lessons[l.id]);
  if(nextL)return {seal:"新",text:`学下一课：${nextL.title}`,href:"lesson.html?id="+nextL.id,go:"去学习"};
  return {seal:"進",text:"清音都熟悉了，试试进阶难度，加入浊音和拗音",href:"games.html",go:"去练习"};
}
const ns=nextStep();
function render(){
  const disp=k=>script==="k"?toKata(k):k;
  const cK=count(SEION.map(toKata));
  el.querySelector("#app").innerHTML=`
  <a class="back" href="index.html">← 学习</a>
  <h1>学习手帐<small>Techō</small></h1>
  <p class="summary">你已经熟悉 <b>${known}</b> 个清音平假名，其中 <b>${cS[3]}</b> 个已掌握；今天有 <b>${due.length}</b> 个假名到了复习时间</p>
  <div class="grid"><div>
   <section class="due"><div class="ribbon"></div>
    <div><div class="eyebrow">今日复习</div><h2>${due.length?`${due.length} 个假名到期`:"今天没有到期的复习"}</h2><p>复习间隔 1 → 3 → 7 → 21 天，答对进下一档，答错回到 1 天</p>
     <div class="due-k">${due.map(k=>`<span>${k}</span>`).join("")}</div></div>
    ${due.length?`<a class="btn" href="play.html?g=conv&d=intro&only=${encodeURIComponent(due.join(","))}">开始复习 →</a>`:""}
   </section>

   <section>
    <div class="sec-title"><h2>熟悉度</h2><span>颜色越深越熟</span></div>
    <div class="mgrid">${GRID.map(k=>k==="_"?`<span class="gap"></span>`:`<span class="l${lvOf(disp(k))}" title="${disp(k)} · ${["未学","见过","熟悉","掌握"][lvOf(disp(k))]}">${disp(k)}</span>`).join("")}</div>
    <div class="mrow"><div class="legend"><span><i style="background:var(--raise)"></i>未学</span><span><i style="background:var(--raise-2)"></i>见过</span><span><i style="background:color-mix(in srgb,var(--gold-accent,#edb56e) 35%,transparent)"></i>熟悉</span><span><i style="background:var(--accent)"></i>掌握</span></div>
     <div class="seg" id="scr"><button data-v="h" aria-pressed="${script==="h"}">平假名</button><button data-v="k" aria-pressed="${script==="k"}">片假名</button></div></div>
    <div class="bars">${[["清音 · 平假名",SEION,cS],["清音 · 片假名",SEION.map(toKata),cK],["浊音 · 半浊音",DAKU,count(DAKU)],["拗音",YOON,count(YOON)]].map(([n,l,c])=>`<div class="barrow"><span>${n}</span><div class="stack"><i style="width:${c[3]/l.length*100}%;background:var(--m3)"></i><i style="width:${c[2]/l.length*100}%;background:var(--m2)"></i><i style="width:${c[1]/l.length*100}%;background:var(--m1)"></i></div><b class="num">${c[2]+c[3]} / ${l.length}</b></div>`).join("")}</div>
   </section>

   <section>
    <div class="sec-title"><h2>个人最佳</h2><span>分数 · 正确率 · 玩过几次</span></div>
    <table><thead><tr><th>玩法</th>${Object.values(S.DIFF).map(d=>`<th>${d}</th>`).join("")}</tr></thead><tbody>
     ${Object.entries(S.GAME).map(([g,n])=>`<tr><td>${n}</td>${Object.keys(S.DIFF).map(d=>{const b=best(g,d);return b?`<td><b class="num">${b.score}</b><small>${b.acc} · ${b.n} 次</small></td>`:`<td class="none">—</td>`}).join("")}</tr>`).join("")}
    </tbody></table>
   </section>

   <section>
    <div class="sec-title"><h2>练习记录</h2><span>最近 ${Math.min(12,runs.length)} 局</span></div>
    <div class="log">${runs.slice().reverse().slice(0,12).map(r=>{const ok=r.log.filter(l=>l.ok).length,acc=KD.fmtPct(KD.achievement(r.log).pct),d=new Date(r.id);return `<div class="logrow"><time>${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}</time><span class="g">${S.GAME[r.G]}<small>${S.DIFF[r.D]}</small>${r.only&&r.only.length?`<span class="tag">错题</span>`:""}</span><span class="a num">${acc}</span></div>`}).join("")}</div>
   </section>
  </div>

  <aside>
   <div class="side"><h3>本周</h3><div class="big">
    <div><b class="num">${streak}</b><span>连续学习天数</span></div>
    <div><b class="num">${week.length}</b><span>练习局数</span></div>
    <div><b class="num">${qWeek}</b><span>答题数</span></div>
    <div><b class="num">${qWeek?Math.round(okWeek/qWeek*100):0}%</b><span>正确率</span></div></div></div>
   <div class="side"><h3>近期薄弱</h3><div class="weak">${weak.length?weak.map(([k,n])=>`<div><span class="k">${k}</span><div class="bar"><i style="width:${n/wmax*100}%"></i></div><span>错 ${n} 次</span></div>`).join(""):`<p style="color:var(--t3);font-size:13px;margin-top:10px">近 7 天没有错题</p>`}</div>
    ${weak.length?`<a href="play.html?g=conv&d=intro&only=${encodeURIComponent(weak.map(x=>x[0]).join(","))}" style="display:inline-block;margin-top:10px;color:var(--gold);font-size:13px">专项训练这 ${weak.length} 个 →</a>`:""}</div>
   <div class="side"><h3>复习盒</h3><div class="boxes">${boxCount.map((n,i)=>`<div><b class="num">${n}</b>${S.INTERVAL[i]} 天</div>`).join("")}</div><p class="boxnote">右边的盒子越多，记得越牢</p></div>
   <div class="side next"><h3>下一步</h3><div style="margin-top:12px"><span class="seal">${ns.seal}</span></div><p>${ns.text}</p><a href="${ns.href}">${ns.go} →</a></div>
  </aside></div>
  `;
  el.querySelectorAll("#scr button").forEach(b=>b.onclick=()=>{script=b.dataset.v;render()});
}
render();

}
