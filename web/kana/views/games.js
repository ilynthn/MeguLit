/* SPDX-License-Identifier: GPL-3.0-or-later
   MeguLit kana module · view: games (ported from the approved prototype) */
export function view(el,ctx){
const go=ctx.go,params=ctx.params;
el.className='v-games';
el.innerHTML=`<div class="wrap">
  <a class="back" href="index.html">← 学习</a>
  <h1>练习<small>Renshū</small></h1>
  <p class="lede">选一个玩法和难度。题目只从你学过的假名里出，难度越高题库越大、时间越紧</p>

  <div class="body">
    <div>
      <div class="games-head"><h2>玩法</h2><span>3 种</span></div>
      <div id="games"></div>
      <div class="review" id="review"></div>
    </div>
    <section class="sheet" id="sheet"><div class="ribbon"></div><div id="cfg"></div></section>
  </div>
  
</div>
<div class="toast" id="toast"></div>`;

/* ===== 题库 ===== */
const SEION="あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん".split("");
const DAKU="がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ".split("");
const YOON="きゃきゅきょしゃしゅしょちゃちゅちょにゃにゅにょひゃひゅひょみゃみゅみょりゃりゅりょぎゃぎゅぎょじゃじゅじょびゃびゅびょぴゃぴゅぴょ".match(/../g);
const CONFUSE=["あ","お","め","ぬ","ね","れ","わ","る","ろ","さ","ち","き","は","ほ","シ","ツ","ソ","ン","ク","ケ","タ"];
const MAST=ctx.store.get(ctx.store.KEY.m,{});const LEARNED=SEION.filter(k=>(MAST[k]||0)>=1).length>=4?SEION.filter(k=>(MAST[k]||0)>=1):SEION.slice(0,5);
const toKata=s=>s.replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60));

/* ===== 配置表：难度真的改变题目和机制 ===== */
const DIFFS=[
 {id:"intro",name:"入门",tag:"只考学过的，不限时",pips:1},
 {id:"std",name:"标准",tag:"全部清音，适中限时",pips:2},
 {id:"adv",name:"进阶",tag:"加入浊音与易混",pips:3},
 {id:"chal",name:"挑战",tag:"总时长限时，连续作答",pips:4}
];
const GAMES=[
 {id:"pos",no:"壱",name:"行段识别",desc:"看到假名，判断它属于哪一行、哪一段",
  sample:`<span class="q">き</span>→<span class="a">か行</span><span class="a">い段</span>`,
  cfg:{
   intro:{count:10,time:"不限时",timeSub:"想多久都可以",hints:"每题可看提示",hintSub:"显示罗马音首字母",pool:"learned",pick:"点选两次：先选行，再选段"},
   std:{count:20,time:"每题 10 秒",timeSub:"超时算错",hints:"3 次",hintSub:"整局共用",pool:"seion",pick:"点选或键盘：行用字母键，段用 a/i/u/e/o"},
   adv:{count:25,time:"每题 8 秒",timeSub:"超时算错",hints:"1 次",hintSub:"整局共用",pool:"seion+daku+kata",pick:"浊音行算作独立的行，如 が行；平片混出"},
   chal:{count:"不定",countSub:"错 3 次或时间到结束",time:"总计 90 秒",timeSub:"答得越快题越多",hints:"无",hintSub:"",pool:"all-no-yoon",pick:"全部清音 + 浊音 + 半浊音，平片混出"}
  },
  noYoon:"拗音不属于单一的段，这个玩法不出拗音"},
 {id:"seq",no:"弐",name:"前后假名",desc:"按五十音顺序，说出它的前一个和后一个",
  sample:`<span class="a">？</span><span class="q">き</span><span class="a">？</span>→ か · く`,
  cfg:{
   intro:{count:10,time:"不限时",timeSub:"",hints:"每题可看提示",hintSub:"显示所在的那一行",pool:"learned",pick:"只问「后一个」，四选一"},
   std:{count:15,time:"每题 12 秒",timeSub:"超时算错",hints:"3 次",hintSub:"整局共用",pool:"seion",pick:"前后都要答，四选一"},
   adv:{count:20,time:"每题 10 秒",timeSub:"超时算错",hints:"1 次",hintSub:"整局共用",pool:"seion+kata",pick:"前后都要输入，用键盘或假名键盘；平片混出"},
   chal:{count:"不定",countSub:"错 3 次或时间到结束",time:"总计 90 秒",timeSub:"",hints:"无",hintSub:"",pool:"seion+kata",pick:"前后都要输入，偶尔改问「前两个」"}
  },
  order:true},
 {id:"conv",no:"参",name:"平片转换",desc:"看到平假名写出片假名，看到片假名写出平假名",
  sample:`<span class="q">し</span>→<span class="a">シ</span>　<span class="q">ソ</span>→<span class="a">そ</span>`,
  cfg:{
   intro:{count:10,time:"不限时",timeSub:"",hints:"每题可看提示",hintSub:"显示罗马音",pool:"learned",pick:"四选一，选项里不放易混字"},
   std:{count:20,time:"每题 10 秒",timeSub:"超时算错",hints:"3 次",hintSub:"整局共用",pool:"seion",pick:"输入作答：日语输入法或屏幕假名键盘"},
   adv:{count:25,time:"每题 8 秒",timeSub:"超时算错",hints:"1 次",hintSub:"整局共用",pool:"seion+daku+yoon+confuse",pick:"输入作答，易混字（シ/ツ、ソ/ン）出现概率 ×3"},
   chal:{count:"不定",countSub:"错 3 次或时间到结束",time:"总计 90 秒",timeSub:"",hints:"无",hintSub:"",pool:"all",pick:"输入作答，答案会做 Unicode 规范化（NFKC、全半角统一）"}
  }}
];
const SCORE={
 intro:["满分 101.0000%：基础 100% + BREAK 奖励 1%","2 秒内答对是 CRITICAL PERFECT，4 秒内 PERFECT，再慢 GREAT","用提示算 GOOD，答错或超时 MISS；易混假名是 BREAK，占 5 倍，并决定最后的 1%"],
 std:["满分 101.0000%：基础 100% + BREAK 奖励 1%","在限时的 35% 内答对 CRITICAL PERFECT，60% 内 PERFECT，再慢 GREAT","用提示算 GOOD（BREAK 的 GOOD 更低），答错或超时 MISS"],
 adv:["满分 101.0000%：基础 100% + BREAK 奖励 1%","限时更短：35% 内 CRITICAL PERFECT，60% 内 PERFECT","易混假名出现得更多，BREAK 越多，最后 1% 越难拿满"],
 chal:["满分 101.0000%：基础 100% + BREAK 奖励 1%","2 秒内 CRITICAL PERFECT，4 秒内 PERFECT，再慢 GREAT","总计 90 秒，错满 3 次结束"]
};
const KD=ctx.data,BEST={},BESTV={};for(const r of ctx.store.get(ctx.store.KEY.r,[])){if(r.only&&r.only.length||!r.log.length)continue;const key=r.G+"-"+r.D,A=KD.achievement(r.log);if(BESTV[key]===undefined||BESTV[key]<A.pct){BESTV[key]=A.pct;BEST[key]=KD.fmtPct(A.pct);}}

function poolOf(p){
  const has=x=>p.includes(x)||p==="all";
  if(p==="learned")return {list:LEARNED,label:`你已学的 ${LEARNED.length} 个平假名${LEARNED.length<=5&&!SEION.some(k=>(MAST[k]||0)>=1)?"（还没学过，先用 あ行）":""}`};
  if(p==="all-no-yoon")return {list:[...SEION,...DAKU],label:`清音 46 + 浊音·半浊音 25，平片混出`,kata:true};
  let l=[...SEION],parts=["清音 46"];
  if(has("daku")){l.push(...DAKU);parts.push("浊音·半浊音 25")}
  if(has("yoon")){l.push(...YOON);parts.push("拗音 33")}
  return {list:l,label:parts.join(" + ")+(has("kata")||p==="all"?"，平片混出":""),kata:has("kata")||p==="all",hot:has("confuse")||p==="all"};
}

let g=0,d=0,script="h";
const $=s=>el.querySelector(s);
function renderGames(){
  $("#games").innerHTML=GAMES.map((x,i)=>{const bests=DIFFS.map(y=>BEST[x.id+"-"+y.id]).filter(Boolean);
    return `<button class="game${i===g?" on":""}" data-g="${i}"><div class="no">${x.no}</div><div><h3>${x.name}<kbd>${i+1}</kbd></h3><p>${x.desc}</p><div class="sample">${x.sample}</div><div class="best">${bests.length?`已玩 ${bests.length} 个难度 · 最佳 <b>${BEST[x.id+"-std"]||BEST[x.id+"-intro"]}</b>`:"还没玩过"}</div></div></button>`}).join("");
  el.querySelectorAll(".game").forEach(b=>b.onclick=()=>{g=+b.dataset.g;render()});
}
let prev={};
function renderCfg(){
  const G=GAMES[g],D=DIFFS[d],c=G.cfg[D.id],P=poolOf(c.pool),best=BEST[G.id+"-"+D.id];
  const shown=P.list.slice(0,48),hot=new Set(CONFUSE);
  const val={count:typeof c.count==="number"?c.count+" 题":c.count,time:c.time,hints:c.hints};
  $("#cfg").innerHTML=`
   <div class="s-title"><h2>${G.name}</h2><span>${D.name} · ${D.tag}</span></div>
   <div class="label">难度<span><kbd>←</kbd> <kbd>→</kbd> 切换</span></div>
   <div class="diffs">${DIFFS.map((x,i)=>`<button class="diff" data-d="${i}" aria-pressed="${i===d}"><b>${x.name}</b><small>${x.tag}</small><div class="pips">${[1,2,3,4].map(n=>`<i class="${n<=x.pips?"f":""}"></i>`).join("")}</div></button>`).join("")}</div>
   <dl class="rules">
     <div class="rule"><dt>题量</dt><dd data-k="count">${val.count}<small>${c.countSub||"固定题数"}</small></dd></div>
     <div class="rule"><dt>时间</dt><dd data-k="time">${val.time}<small>${c.timeSub||"&nbsp;"}</small></dd></div>
     <div class="rule"><dt>提示</dt><dd data-k="hints">${val.hints}<small>${c.hintSub||"&nbsp;"}</small></dd></div>
     <div class="rule how"><dt>作答方式</dt><dd style="font-size:14px;font-family:var(--sans);line-height:1.45">${c.pick}</dd></div>
   </dl>
   <div class="label">题库<span>${P.list.length}${P.kata?" × 2（平/片）":""} 个</span></div>
   <p class="pool">${P.label}${G.noYoon&&D.id!=="intro"?`。${G.noYoon}`:""}${P.hot?"。<b style='color:var(--ink-accent);font-weight:500'>红框</b>是易混字，出现概率更高":""}</p>
   <div class="pool-kana">${shown.map(k=>{const s=script==="k"&&!P.kata?toKata(k):k;return `<span class="${P.hot&&hot.has(s)?"hot":""}">${s}</span>`}).join("")}${P.list.length>48?`<span class="more">…另 ${P.list.length-48} 个</span>`:""}</div>
   ${G.order?`<div class="order-note"><b>顺序规则：</b>按 <span class="seq">あいうえお かきくけこ … や ゆ よ … わ を ん</span> 排，空位直接跳过（や 的后一个是 ゆ）。「あ」只问后一个，「ん」只问前一个；跨行照常连（お → か）。浊音没有公认的前后顺序，所以这个玩法只出清音</div>`:""}
   <div class="label">达成率<span>满分 101.0000%</span></div>
   <ul class="score">${SCORE[D.id].map(s=>`<li>${s}</li>`).join("")}</ul>
   <div class="label">选项</div>
   <div class="opts">
     ${P.kata?`<span class="check" style="cursor:default">这个难度固定平片混出</span>`:`<div class="seg" id="scr">${[["h","平假名"],["k","片假名"],["m","混合"]].map(([v,n])=>`<button data-v="${v}" aria-pressed="${script===v}">${n}</button>`).join("")}</div>`}
     <label class="check"><input type="checkbox" ${d<2?"checked":""}> 答完播放发音</label>
     <label class="check"><input type="checkbox"> 只练薄弱假名</label>
   </div>
   <div class="start-row"><span class="best">${best?`<b class="num">${best.split(" · ")[0]}</b>个人最佳 · ${best.split(" · ")[1]}`:"这个难度还没有成绩"}</span>
     <button class="btn lg" id="go">开始 <kbd style="opacity:.8">Enter</kbd></button></div>`;
  el.querySelectorAll(".diff").forEach(b=>b.onclick=()=>{d=+b.dataset.d;render()});
  el.querySelectorAll("#scr button").forEach(b=>b.onclick=()=>{script=b.dataset.v;renderCfg()});
  $("#go").onclick=start;
  /* 数值变化时闪一下，让人看到难度确实改了东西 */
  el.querySelectorAll("[data-k]").forEach(el=>{const k=el.dataset.k;if(prev[k]!==undefined&&prev[k]!==val[k])el.classList.add("changed");prev[k]=val[k]});
}
function render(){renderGames();renderCfg()}
function start(){go(`play.html?g=${GAMES[g].id}&d=${DIFFS[d].id}&s=${script}`)}
ctx.onKey(e=>{
  if(e.target.closest("input"))return;
  if(/^[1-3]$/.test(e.key)){g=+e.key-1;render()}
  if(e.key==="ArrowRight"&&d<3){d++;render()}
  if(e.key==="ArrowLeft"&&d>0){d--;render()}
  if(e.key==="Enter"&&!e.target.closest("button")){start()}
});
render();


/* 复习入口：近 7 天常错的假名 + 最近一局的错题（都来自本地练习记录） */
(()=>{const runs=ctx.store.get(ctx.store.KEY.r,[]),now=Date.now(),wk={};
 runs.filter(r=>now-r.id<7*ctx.store.DAY).forEach(r=>r.log.filter(l=>!l.ok).forEach(l=>{wk[l.show]=(wk[l.show]||0)+1;}));
 const weak=Object.entries(wk).sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]);
 const lastBad=[...runs].reverse().find(r=>r.log.some(l=>!l.ok));const wrong=lastBad?[...new Set(lastBad.log.filter(l=>!l.ok).map(l=>l.show))]:[];
 const box=el.querySelector("#review");if(!box)return;
 if(!weak.length&&!wrong.length){box.innerHTML='<h4>复习入口</h4><p class="rv-empty">还没有错题。玩几局之后，常错的假名会出现在这里</p>';return;}
 box.innerHTML='<h4>复习入口</h4>'+(weak.length?`<a class="rv" href="play.html?g=conv&d=intro&only=${encodeURIComponent(weak.join(","))}"><span class="ks">${weak.join(" ")}</span><span>薄弱假名专项 · ${weak.length} 个</span><em>开始 →</em></a>`:"")+(wrong.length?`<a class="rv" href="play.html?g=${lastBad.G}&d=${lastBad.D==="chal"?"std":lastBad.D}&s=${lastBad.script||"h"}&only=${encodeURIComponent(wrong.join(","))}"><span class="ks">${wrong.join(" ")}</span><span>上次错题再挑战 · ${wrong.length} 个</span><em>开始 →</em></a>`:"");
})();
}
