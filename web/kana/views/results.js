/* SPDX-License-Identifier: GPL-3.0-or-later
   MeguLit kana module · view: results (ported from the approved prototype) */
export function view(el,ctx){
const go=ctx.go,params=ctx.params;
el.className='v-results';
el.innerHTML=`<div class="wrap" id="app"></div>`;

const S=ctx.store;
const all=S.get(S.KEY.r,[]);let run=all.find(r=>String(r.id)===String(params.run))||all[all.length-1]||null;
let demo=false;
if(!run){el.innerHTML=`<div class="wrap"><a class="back" href="games.html">← 练习</a><p class="empty" style="margin-top:24px">还没有练习成绩，先去玩一局吧</p><a class="btn" href="games.html" style="margin-top:12px">去练习 →</a></div>`;return;}
const st=S.stats(run),prevBest=S.bestOf(run.G,run.D,run.id),changes=S.applyRun(run,demo);
const KD=ctx.data,A=KD.achievement(run.log),P=KD.fmtPct; /* before newRecord reads A */
const isRetry=run.only&&run.only.length;
const newRecord=!isRetry&&(!prevBest||A.pct>prevBest.score);const diff=prevBest?Math.abs(A.pct-prevBest.score).toFixed(1):"";
/* 2026-11-13 user: AP 是惠惠盖章，不是字体 — a red hanko slammed onto the score: explosion burst + magic ring, inked by SVG noise */
const apSeal=()=>`<div class="ap-stamp" role="img" aria-label="All Perfect 全完璧"><i class="ap-ink"></i><svg class="ap-seal" viewBox="0 0 160 160" aria-hidden="true">
<defs><filter id="apk-ink" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="7" result="w"/><feDisplacementMap in="SourceGraphic" in2="w" scale="3.2" result="d"/><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="3" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -7 5.1" result="s"/><feComposite in="d" in2="s" operator="in"/></filter>
<path id="apk-arc" d="M80 80 m-55 0 a55 55 0 1 1 110 0 a55 55 0 1 1 -110 0"/>
<mask id="apk-cut"><rect width="160" height="160" fill="#fff"/><text x="80" y="92" text-anchor="middle" font-size="44" font-weight="900" font-family="Georgia,'Noto Serif JP','Yu Mincho',serif" letter-spacing="1" fill="#000">AP</text><text x="80" y="113" text-anchor="middle" font-size="12" font-weight="900" font-family="'Noto Serif JP','Yu Mincho',serif" letter-spacing="3" fill="#000">全完璧</text></mask></defs>
<g filter="url(#apk-ink)" fill="currentColor" stroke="currentColor">
<circle cx="80" cy="80" r="73" fill="none" stroke-width="5.5"/><circle cx="80" cy="80" r="64" fill="none" stroke-width="1.4"/><circle cx="80" cy="80" r="47" fill="none" stroke-width="1.2" stroke-dasharray="2 3"/>
<text font-size="9.5" font-weight="800" letter-spacing="2.2" stroke="none" font-family="'IBM Plex Mono',Consolas,'Yu Mincho',monospace"><textPath href="#apk-arc">EXPLOSION · 爆裂魔法 · 紅魔族 · EXPLOSION ·</textPath></text>
<polygon stroke="none" mask="url(#apk-cut)" points="${Array.from({length:24},(_,i)=>{const a=i/24*Math.PI*2-Math.PI/2,r=i%2?32:47+(i%4?0:4);return `${(80+Math.cos(a)*r).toFixed(1)},${(80+Math.sin(a)*r).toFixed(1)}`;}).join(' ')}"/>
<path d="M80 2v8M80 150v8M2 80h8M150 80h8" stroke-width="2"/></g></svg></div>`;
const fmt=n=>(Math.round(n*10)/10).toString();

/* 错误类型 → 解释与建议 */
const TYPE={
 "段错":{name:"段判断错",tip:"认得辅音但元音判断不稳。<em>建议</em>：在五十音图里按竖列（あいうえお 段）读一遍"},
 "行错":{name:"行判断错",tip:"元音对了、辅音混了，多半是字形相近（如 ぬ/め）。<em>建议</em>：看详情面板里的易混对比"},
 "行段都错":{name:"整个认错",tip:"这个假名还不认识。<em>建议</em>：回到对应的一课重新学"},
 "超时":{name:"超时",tip:"能认出但太慢。<em>建议</em>：先用入门难度（不限时）练熟，再回来"},
 "前一个错":{name:"前一个错",tip:"往回数比往后数难，<em>建议</em>：按行倒着念几遍"},
 "后一个错":{name:"后一个错",tip:"顺序没背熟，<em>建议</em>：按行顺着念，特别注意 や行、わ行 的空位"},
 "平片写反":{name:"平片写反",tip:"字是对的，只是没切到片假名。这不是不会，<em>建议</em>：输入法里用 F7 / F6 切换"},
 "写错":{name:"写错",tip:"写成了别的字。<em>建议</em>：看看错成了哪个，多半是易混组"},
 "选错":{name:"选错",tip:"<em>建议</em>：放慢一点，先在心里读出来再选"}
};
const wrongs=run.log.filter(l=>!l.ok);
const byType={};wrongs.forEach(l=>{byType[l.why]=(byType[l.why]||0)+1});
const byKana={};wrongs.forEach(l=>{(byKana[l.show]||(byKana[l.show]={n:0,why:{}})).n++;byKana[l.show].why[l.why]=(byKana[l.show].why[l.why]||0)+1});
const wrongKana=Object.entries(byKana).sort((a,b)=>b[1].n-a[1].n);
/* 历史薄弱（近 7 天，不含本局）*/
const hist={};S.get(S.KEY.r,[]).filter(r=>r.id!==run.id&&Date.now()-r.id<7*S.DAY).forEach(r=>r.log.filter(l=>!l.ok).forEach(l=>hist[l.show]=(hist[l.show]||0)+1));
const weak=[...new Set([...wrongKana.map(x=>x[0]),...Object.entries(hist).sort((a,b)=>b[1]-a[1]).map(x=>x[0])])].slice(0,6);
const retryURL=`play.html?g=${run.G}&d=${run.D==="chal"?"std":run.D}&s=${run.script}&only=${encodeURIComponent(wrongKana.map(x=>x[0]).join(","))}`;
const weakURL=`play.html?g=conv&d=intro&only=${encodeURIComponent(weak.join(","))}`;

const L=run.log,maxT=Math.max(...L.map(l=>l.t),1);
el.querySelector("#app").innerHTML=`
 <a class="back" href="games.html">← 练习</a>
 <section class="hero${A.ap?" ap-hit":""}">
  <div class="ribbon"></div>
  <div class="h-main">
   <div class="h-meta"><b>${S.GAME[run.G]}</b> · ${S.DIFF[run.D]}${isRetry?" · 错题再挑战":""} · ${run.ended}</div>
   <div class="h-score"><span class="n num">${P(A.pct)}</span></div>${A.ap?apSeal():""}
   <div class="record ${newRecord?"new":""}">${isRetry?"错题练习不计入个人最佳":newRecord?(prevBest?`新纪录 · 比之前的 ${P(prevBest.score)} 高 ${diff}%`:"这个难度的第一份成绩"):`个人最佳 ${P(prevBest.score)} · 还差 ${diff}%`}</div>
   <div class="h-stats">
    <div><b class="num">${st.ok}/${st.total}</b>答对</div>
    <div><b class="num">${Math.floor(run.secs/60)}:${String(Math.round(run.secs%60)).padStart(2,"0")}</b>总用时</div>
    <div><b class="num">${fmt(st.avg)}s</b>平均每题</div>
    <div><b class="num">${run.best}</b>最长连对</div>
   </div>
  </div>
  <div class="h-side">
   <div class="label">达成率怎么来的<span>满分 101.0000%</span></div>
   <div class="ledger">
    ${KD.JUDGES.map(j=>`<div><span class="judge j-${j.split(" ").join("-").toLowerCase()}">${j}</span><b class="num">${A.counts[j]}</b></div>`).join("")}
    <div><span>基础<small>按判定计分，BREAK（易混假名）占 5 倍</small></span><b class="num">${P(A.basePct)}</b></div>
    <div><span>BREAK 奖励<small>${A.breaks?`${A.breaks} 个 BREAK 的平均判定 × 1%`:"本局没有 BREAK，按全部题目计算"}</small></span><b class="num">+${P(A.bonusPct)}</b></div>
    <div class="sum"><span>达成率</span><b class="num">${P(A.pct)}</b></div>
   </div>
  </div>
 </section>

 <section class="track">
  <div class="sec-title"><h2>答题轨迹</h2><span>柱子越高用时越长 · 颜色是判定</span></div>
  <div class="cells">${L.map((l,i)=>`<div class="qc ${l.ok?"ok":"bad"} q-${A.rows[i].judge.split(" ").join("-").toLowerCase()}" data-i="${i}"><i style="height:${Math.max(6,l.t/maxT*54)}px"></i><span>${l.show}</span></div>`).join("")}</div>
  <div class="track-cap" id="cap">把鼠标移到柱子上看每题详情</div>
 </section>

 <div class="cols">
  <div>
   <div class="sec-title"><h2>错误类型</h2><span>${wrongs.length} 处错误</span></div>
   <div class="types">${Object.keys(byType).length?Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<div class="type"><b>${TYPE[k]?.name||k}</b><div class="bar"><i style="width:${n/wrongs.length*100}%"></i></div><span class="c num">${n}</span><p>${TYPE[k]?.tip||""}</p></div>`).join(""):`<p class="empty">这一局没有答错</p>`}</div>

   <div class="sec-title" style="margin-top:30px"><h2>答错的假名</h2><span>${wrongKana.length} 个</span></div>
   <div class="wk">${wrongKana.length?wrongKana.map(([k,v])=>`<div class="wrow"><div class="k">${k}</div><div class="d">错 ${v.n} 次 · ${Object.keys(v.why).map(w=>TYPE[w]?.name||w).join("、")}${S.CONFUSE.has(k)?`<span class="tag">易混字</span>`:""}${hist[k]?`<span class="tag">近 7 天还错过 ${hist[k]} 次</span>`:""}<small>${explain(k)}</small></div><a href="gojuon.html">在五十音图里看 →</a></div>`).join(""):`<p class="empty">全对</p>`}</div>
  </div>

  <aside>
   <div class="side">
    <h3>接下来</h3>
    <div class="act">
     ${wrongKana.length?`<a class="primary" href="${retryURL}"><span class="ks">${wrongKana.map(x=>x[0]).join(" ")}</span><span>错题再挑战<small>同一玩法，只出这 ${wrongKana.length} 个，每个至少 2 次</small></span><em>开始 →</em></a>`:""}
     ${weak.length?`<a href="${weakURL}"><span class="ks">${weak.join(" ")}</span><span>薄弱假名专项<small>本局错题 + 近 7 天常错，平片转换 · 入门</small></span><em>开始 →</em></a>`:""}
     <a href="records.html"><span class="ks" style="font-family:var(--sans);font-size:13px">手帐</span><span>学习记录<small>熟悉度、复习安排、历史成绩</small></span><em>查看 →</em></a>
    </div>
   </div>
   <div class="side">
    <h3>熟悉度变化</h3>
    <div class="chg">${changes.sort((a,b)=>b.bad-a.bad).slice(0,10).map(c=>`<div><span class="k">${c.k}</span><span class="lv"><i class="l${c.from}"></i><span class="arr">→</span><i class="l${c.to}"></i> ${["未学","见过","熟悉","掌握"][c.to]}</span><span class="${c.bad?"down":"up"}">${c.bad?"明天复习":c.days+" 天后复习"}</span></div>`).join("")}${changes.length>10?`<div style="grid-template-columns:1fr">…另 ${changes.length-10} 个</div>`:""}</div>
   </div>
  </aside>
 </div>

 <div class="foot"><a class="ghost" href="games.html">返回练习</a><a class="btn" href="play.html?g=${run.G}&d=${run.D}&s=${run.script}">再来一局</a></div>
 `;

function explain(k){
  const m={ね:"和 れ、わ 左半边相同，看右边收尾：ね 带小圈",れ:"和 ね、わ 左半边相同：れ 右边向上挑",わ:"和 ね、れ 左半边相同：わ 右边是圆弧",ぬ:"和 め 很像：ぬ 末尾有小圈",め:"和 ぬ 很像：め 没有小圈",そ:"读 so，在 さ行 · お段",ち:"读 chi，在 た行 · い段；是 さ 的左右镜像",シ:"点竖排、末笔从下往上挑；ツ 的点横排、末笔往下撇",ツ:"点横排、末笔往下撇；シ 的点竖排",ソ:"两笔都从上往下；ン 的第二笔从下往上",ン:"第二笔从左下往右上挑；ソ 两笔都往下"};
  return m[k]||"";
}
const cap=el.querySelector("#cap");
el.querySelectorAll(".qc").forEach(el=>el.onmouseenter=()=>{const l=L[+el.dataset.i];cap.innerHTML=`第 ${+el.dataset.i+1} 题 · <span class="ja">${l.show}</span> · ${l.t}s · ${A.rows[+el.dataset.i].brk?"BREAK · ":""}${A.rows[+el.dataset.i].judge}${l.ok?"":` · `}${l.ok?``:`<span style="color:var(--ink-accent)">${TYPE[l.why]?.name||l.why}</span>`}${l.hint?" · 用了提示":""}`});

}
