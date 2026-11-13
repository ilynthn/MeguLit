/* SPDX-License-Identifier: GPL-3.0-or-later
   MeguLit kana module · view: play (ported from the approved prototype) */
export function view(el,ctx){
const go=ctx.go,params=ctx.params,KD=ctx.data;
el.className='v-play';
el.innerHTML=`<div class="wrap">
  <div class="hud">
    <a class="exit" href="games.html">← 退出</a>
    <div class="title" id="title"></div>
    ${ctx.volumeHTML()}<div class="stats" id="stats"></div>
  </div>
  <div class="timeline" id="timeline"><i id="tbar"></i></div>
  <div class="qline"><span id="qcount"></span><span id="tlabel"></span></div>
  <section class="sheet"><div class="ribbon"></div><div id="stage" style="width:100%;display:flex;flex-direction:column;align-items:center;flex:1"></div></section>
  <div class="vk" id="vk"></div>
  <p class="note"><kbd>Esc</kbd> 退出</p>
</div>`;

/* ================= 基础数据 ================= */
const ROWS=[["あ","あいうえお"],["か","かきくけこ"],["さ","さしすせそ"],["た","たちつてと"],["な","なにぬねの"],["は","はひふへほ"],["ま","まみむめも"],["や","や_ゆ_よ"],["ら","らりるれろ"],["わ","わ___を"]];
const DROWS=[["が","がぎぐげご"],["ざ","ざじずぜぞ"],["だ","だぢづでど"],["ば","ばびぶべぼ"],["ぱ","ぱぴぷぺぽ"]];
const DAN="あいうえお";
const ROMA={あ:"a",い:"i",う:"u",え:"e",お:"o",か:"ka",き:"ki",く:"ku",け:"ke",こ:"ko",さ:"sa",し:"shi",す:"su",せ:"se",そ:"so",た:"ta",ち:"chi",つ:"tsu",て:"te",と:"to",な:"na",に:"ni",ぬ:"nu",ね:"ne",の:"no",は:"ha",ひ:"hi",ふ:"fu",へ:"he",ほ:"ho",ま:"ma",み:"mi",む:"mu",め:"me",も:"mo",や:"ya",ゆ:"yu",よ:"yo",ら:"ra",り:"ri",る:"ru",れ:"re",ろ:"ro",わ:"wa",を:"o",ん:"n",が:"ga",ぎ:"gi",ぐ:"gu",げ:"ge",ご:"go",ざ:"za",じ:"ji",ず:"zu",ぜ:"ze",ぞ:"zo",だ:"da",ぢ:"ji",づ:"zu",で:"de",ど:"do",ば:"ba",び:"bi",ぶ:"bu",べ:"be",ぼ:"bo",ぱ:"pa",ぴ:"pi",ぷ:"pu",ぺ:"pe",ぽ:"po"};
const ORDER="あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん".split(""); /* 前后假名的标准顺序：空位直接跳过 */
const SEION=ORDER.slice();
const DAKU="がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ".split("");
const YOON="きゃきゅきょしゃしゅしょちゃちゅちょにゃにゅにょひゃひゅひょみゃみゅみょりゃりゅりょぎゃぎゅぎょじゃじゅじょびゃびゅびょぴゃぴゅぴょ".match(/../g);
const CONFUSE=new Set(["シ","ツ","ソ","ン","ク","ケ","タ","ぬ","め","ね","れ","わ","る","ろ","あ","お","さ","ち","き"]);
const MAST=ctx.store.get(ctx.store.KEY.m,{});const LEARNED=ORDER.filter(k=>(MAST[k]||0)>=1).length>=4?ORDER.filter(k=>(MAST[k]||0)>=1):ORDER.slice(0,5);
const toKata=s=>s.replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60));
const toHira=s=>s.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const isKata=s=>/[ァ-ヺ]/.test(s);
const isHira=s=>/[ぁ-ゖ]/.test(s);
const romaOf=k=>{const h=toHira(k);if(h.length===2){const b=ROMA[h[0]],y={ゃ:"a",ゅ:"u",ょ:"o"}[h[1]];return /^(shi|chi|ji)$/.test(b)?b.slice(0,-1)+y:b.slice(0,-1)+"y"+y}return ROMA[h]||""};
/* 规范化：NFKC 统一全/半角（ｼ→シ），NFC 把 か+゛ 合成 が，去掉空白和长音符号外的标点 */
const norm=s=>s.normalize("NFKC").normalize("NFC").replace(/[\s　、。・]/g,"");

/* ================= 配置（与入口页一致） ================= */
const CFG={
 pos:{name:"行段识别",
  intro:{n:10,t:0,hints:Infinity,pool:()=>LEARNED,script:"h"},
  std:{n:20,t:10,hints:3,pool:()=>SEION.filter(k=>k!=="ん")},
  adv:{n:25,t:8,hints:1,pool:()=>[...SEION.filter(k=>k!=="ん"),...DAKU],script:"m",daku:true},
  chal:{n:Infinity,total:90,lives:3,hints:0,pool:()=>[...SEION.filter(k=>k!=="ん"),...DAKU],script:"m",daku:true}},
 seq:{name:"前后假名",
  intro:{n:10,t:0,hints:Infinity,pool:()=>LEARNED.slice(0,-1),script:"h",mode:"next",input:false},
  std:{n:15,t:12,hints:3,pool:()=>ORDER,mode:"both",input:false},
  adv:{n:20,t:10,hints:1,pool:()=>ORDER,script:"m",mode:"both",input:true},
  chal:{n:Infinity,total:90,lives:3,hints:0,pool:()=>ORDER,script:"m",mode:"both",input:true}},
 conv:{name:"平片转换",
  intro:{n:10,t:0,hints:Infinity,pool:()=>LEARNED,input:false},
  std:{n:20,t:10,hints:3,pool:()=>SEION,input:true},
  adv:{n:25,t:8,hints:1,pool:()=>[...SEION,...DAKU,...YOON],input:true,confuse:3},
  chal:{n:Infinity,total:90,lives:3,hints:0,pool:()=>[...SEION,...DAKU,...YOON],input:true,confuse:3}}
};
const DNAME={intro:"入门",std:"标准",adv:"进阶",chal:"挑战"};

const P={get:k=>params[k]??null};
const G=P.get("g")||"pos",D=P.get("d")||"intro",S=P.get("s")||"h";
const C={...CFG[G][D]},script=C.script||S;
const ONLY=(P.get("only")||"").split(",").filter(Boolean).map(toHira);
if(ONLY.length){const base=C.pool;C.pool=()=>G==="seq"?ONLY.filter(k=>ORDER.includes(k)):ONLY;if(C.n!==Infinity)C.n=Math.min(C.n,Math.max(6,ONLY.length*2));C.confuse=0}

/* ================= 状态 ================= */
let st={i:0,score:0,ok:0,bad:0,streak:0,best:0,lives:C.lives||0,hints:C.hints,start:performance.now(),times:[],wrong:[],log:[],over:false};
let q=null,qStart=0,raf=0,locked=false,usedHint=false;
const $=s=>el.querySelector(s),stage=$("#stage");
function say(t){ctx.speech.say(t)}
const rnd=a=>a[Math.random()*a.length|0];
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
/* 2026-11-13 (user: some questions had 3 choices, some 4): always 4 distinct choices; a short pool is topped up from the nearest kana in the chart */
const nearOf=k=>{const i=ORDER.indexOf(toHira(k));return i<0?ORDER.slice():ORDER.slice().sort((a,b)=>Math.abs(ORDER.indexOf(a)-i)-Math.abs(ORDER.indexOf(b)-i))};
const fill4=(t,pri,...fb)=>KD.pickChoices(t,shuffle(pri.slice()),...fb);
const show=k=>script==="k"?toKata(k):script==="m"?(Math.random()<.5?toKata(k):k):k;

/* ================= HUD 与计时 ================= */
function hud(bump){
  $("#title").innerHTML=`${CFG[G].name}<small>${DNAME[D]}${script==="m"?" · 平片混出":script==="k"?" · 片假名":""}</small>`;
  const hintTxt=st.hints===Infinity?"∞":st.hints;
  $("#stats").innerHTML=`<div class="stat"><b class="num ${bump==="score"?"bump":""}">${st.log.length?KD.fmtPct(KD.achievement(st.log).pct):"—"}</b>达成率</div>
   <div class="stat"><b class="num ${bump==="streak"?"bump":""}">${st.streak}</b>连对</div>
   ${C.lives?`<div class="stat"><b class="lives">${[...Array(C.lives)].map((_,i)=>`<i class="${i>=st.lives?"off":""}"></i>`).join("")}</b>机会</div>`:`<div class="stat"><b class="num">${hintTxt}</b>提示</div>`}`;
  $("#qcount").textContent=C.n===Infinity?`第 ${st.i+1} 题 · 错 3 次结束`:`${st.i+1} / ${C.n}`;
}
function tick(){
  cancelAnimationFrame(raf);const bar=$("#tbar");
  if(!C.t&&!C.total){bar.style.transform="scaleX(0)";$("#tlabel").textContent="不限时";return}
  (function f(){if(st.over)return;let left,frac;
    if(C.total){left=C.total-(performance.now()-st.start)/1000;frac=left/C.total}
    else{left=C.t-(performance.now()-qStart)/1000;frac=left/C.t}
    bar.style.transform=`scaleX(${Math.max(0,frac)})`;bar.classList.toggle("low",frac<.25);
    $("#tlabel").textContent=`${Math.max(0,left).toFixed(C.total?0:1)} 秒`;
    if(left<=0){if(C.total)return finish();if(!locked)return timeout()}
    raf=requestAnimationFrame(f)})();
}
function timeout(){locked=true;resolve(false,"超时")}

/* ================= 计分（与入口页规则一致） ================= */
function points(){
  const used=(performance.now()-qStart)/1000;let speed=0,mult=1,hintCut=0;
  if(D!=="intro"){const remain=C.t?C.t-used:Math.max(0,6-used);speed=Math.min(5,Math.max(0,remain*.5))}
  let p=10+speed;
  if(usedHint&&D==="std"){hintCut=p/2;p/=2}
  if(D==="adv"&&st.streak>=5)mult=1.2;
  if(D==="chal")mult=st.streak>=20?2:st.streak>=10?1.5:st.streak>=5?1.2:1;
  return {base:10,speed,hintCut,mult,total:p*mult};
}
function resolve(ok,why,detail){
  const used=(performance.now()-qStart)/1000;st.times.push(used);
  let pts=0,br=null;
  if(ok){st.streak=usedHint&&D==="intro"?st.streak:st.streak+1;br=points();pts=br.total;st.score+=pts;st.ok++;st.best=Math.max(st.best,st.streak)}
  else{st.bad++;st.streak=0;st.wrong.push({k:q.show,why});if(D==="chal"){st.score=Math.max(0,st.score-5);st.lives--}}
  st.log.push({k:q.k,show:q.show,ok,why:ok?"":why,t:+used.toFixed(2),limit:C.t||null,hint:usedHint,brk:KD.isBreak(q.show),br,streak:st.streak});
  const jg=KD.judge(st.log[st.log.length-1]),brk=st.log[st.log.length-1].brk;
  hud(ok?"score":"");
  const fb=$("#fb");
  fb.innerHTML=ok?`<span class="ok">正确</span>${detail?" · "+detail:""}<span class="pts judge j-${jg.split(" ").join("-").toLowerCase()}">${brk?"BREAK · ":""}${jg}</span>`:
    `<b>${why==="超时"?"超时":"不对"}</b> · ${q.explain}<span class="pts judge j-miss">${brk?"BREAK · ":""}MISS</span>`;
  if(ok&&q.speak)say(q.speak);
  setTimeout(next,ok?700:1900);
}
function next(){
  if(st.over)return;
  if(D==="chal"&&st.lives<=0)return finish();
  st.i++;if(st.i>=C.n)return finish();
  ask();
}

/* ================= 出题 ================= */
let recent=[];
function pickKana(){
  let pool=C.pool();
  if(C.confuse){const extra=pool.filter(k=>CONFUSE.has(k)||CONFUSE.has(toKata(k)));for(let i=1;i<C.confuse;i++)pool=pool.concat(extra)}
  let k;for(let n=0;n<20;n++){k=rnd(pool);if(!recent.includes(k))break}
  recent.push(k);if(recent.length>Math.min(6,C.pool().length-1))recent.shift();return k;
}
function ask(){
  locked=false;usedHint=false;qStart=performance.now();
  ({pos:askPos,seq:askSeq,conv:askConv})[G]();
  hud();tick();
}
function frame(inner,{hint=true}={}){
  stage.innerHTML=inner+`<div class="tools">${hint&&C.hints!==0?`<button class="pill" id="hintBtn" ${st.hints<=0?"disabled":""}>提示 <kbd>H</kbd></button>`:""}<button class="pill" id="sndBtn">听发音 <kbd>Space</kbd></button></div><div class="hintbox" id="hintbox"></div><div class="feedback" id="fb"></div>`;
  const hb=$("#hintBtn");if(hb)hb.onclick=useHint;$("#sndBtn").onclick=()=>say(q.show);
}
function useHint(){if(locked||usedHint||st.hints<=0)return;usedHint=true;if(st.hints!==Infinity)st.hints--;$("#hintbox").innerHTML=q.hint;hud();const hb=$("#hintBtn");if(hb)hb.disabled=true}

/* ---------- 游戏 1：行段识别 ---------- */
function locate(h){for(const [r,s] of [...ROWS,...DROWS]){const i=s.indexOf(h);if(i>=0)return {row:r,dan:DAN[i]}}}
function askPos(){
  const k=pickKana(),s=show(k),loc=locate(k),rows=C.daku?[...ROWS,...DROWS]:ROWS,kk=isKata(s);
  const lab=x=>kk?toKata(x):x;
  q={k,show:s,speak:s,ans:loc,phase:0,picked:{},explain:`「${s}」在 ${lab(loc.row)}行 · ${lab(loc.dan)}段（${romaOf(k)}）`,
     hint:`读音是 <b>${romaOf(k)}</b>，看辅音找行、看元音找段`};
  frame(`<div class="ask">它在哪一行、哪一段？</div><div class="prompt enter">${s}</div>
   <div class="phase"><span class="on" id="ph0">① 行</span><span id="ph1">② 段</span></div>
   <div class="choices rows" id="rowc">${rows.map((r,i)=>`<button class="ch" data-row="${r[0]}"><kbd>${"aksthnmyrwgzdbp"[i]}</kbd>${lab(r[0])}行</button>`).join("")}</div>
   <div class="choices c5" id="danc" style="opacity:.4;pointer-events:none">${[...DAN].map((d,i)=>`<button class="ch" data-dan="${d}"><kbd>${"aiueo"[i]}</kbd>${lab(d)}段</button>`).join("")}</div>`);
  stage.querySelectorAll("[data-row]").forEach(b=>b.onclick=()=>pickRow(b.dataset.row));
  stage.querySelectorAll("[data-dan]").forEach(b=>b.onclick=()=>pickDan(b.dataset.dan));
}
function pickRow(r){if(locked||q.phase!==0)return;q.picked.row=r;q.phase=1;
  stage.querySelectorAll("[data-row]").forEach(b=>b.classList.toggle("picked",b.dataset.row===r));
  $("#ph0").className="done";$("#ph0").textContent="① "+(isKata(q.show)?toKata(r):r)+"行";$("#ph1").className="on";
  const dc=$("#danc");dc.style.opacity=1;dc.style.pointerEvents="auto";}
function pickDan(d){if(locked||q.phase!==1)return;locked=true;q.picked.dan=d;
  const okR=q.picked.row===q.ans.row,okD=d===q.ans.dan;
  stage.querySelectorAll("[data-row]").forEach(b=>{b.classList.remove("picked");if(b.dataset.row===q.ans.row)b.classList.add("right");else if(b.dataset.row===q.picked.row)b.classList.add("wrong")});
  stage.querySelectorAll("[data-dan]").forEach(b=>{if(b.dataset.dan===q.ans.dan)b.classList.add("right");else if(b.dataset.dan===d)b.classList.add("wrong")});
  resolve(okR&&okD,!okR&&!okD?"行段都错":!okR?"行错":"段错");}

/* ---------- 游戏 2：前后假名 ---------- */
function askSeq(){
  const k=pickKana(),i=ORDER.indexOf(k),s=show(k),kk=isKata(s),lab=x=>kk?toKata(x):x;
  const prev=i>0?ORDER[i-1]:null,nxt=i<ORDER.length-1?ORDER[i+1]:null;
  let need=C.mode==="next"?["next"]:[prev&&"prev",nxt&&"next"].filter(Boolean);
  q={k,show:s,speak:s,prev,next:nxt,need,slot:0,given:{},kk,
     explain:`顺序是 ${prev?lab(prev)+" → ":""}<b style="color:var(--paper-ink)">${s}</b>${nxt?" → "+lab(nxt):""}`,
     hint:`它在 ${lab(rowOf(k))}行：${[...rowStr(k)].map(c=>c==="_"?"·":lab(c)).join(" ")}${i%5===0&&i>0||ORDER[i-1]&&rowOf(ORDER[i-1])!==rowOf(k)?"（前一个在上一行末尾）":""}`};
  const slot=(w)=>need.includes(w)?`<div class="slot ${need[0]===w?"active":""}" id="slot-${w}">？</div>`:`<div class="slot none">${w==="prev"?(prev?"":"（开头）"):(nxt?"":"（结尾）")}</div>`;
  const askTxt=need.length===1?(need[0]==="next"?"它的后一个假名是？":"它的前一个假名是？"):"它的前一个和后一个假名是？";
  let ans="";
  if(C.input){ans=inputBox(`先填${need[0]==="prev"?"前":"后"}一个`)}
  else ans=`<div class="choices c4" id="opts"></div>`;
  frame(`<div class="ask">${askTxt}</div><div class="seqline enter">${slot("prev")}<span class="arrow">→</span><span class="mid">${s}</span><span class="arrow">→</span>${slot("next")}</div>${ans}`);
  if(C.input)bindInput(submitSeq);else seqOptions();
}
function rowOf(k){for(const [r,s] of ROWS)if(s.includes(k))return r;return "ん"}
function rowStr(k){for(const [r,s] of ROWS)if(s.includes(k))return s;return "ん"}
function seqOptions(){
  const w=q.need[q.slot],target=q[w],i=ORDER.indexOf(target);
  const near=[ORDER[i-1],ORDER[i+1],ORDER[i+5],ORDER[i-5],ORDER[i+2],ORDER[i-2]].filter(x=>x&&x!==target&&x!==q.k);
  const opts=fill4(target,near,nearOf(target).filter(x=>x!==q.k));q.opts=opts;
  const lab=x=>q.kk?toKata(x):x;
  $("#opts").innerHTML=opts.map((o,j)=>`<button class="ch" data-o="${j}"><kbd>${j+1}</kbd>${lab(o)}</button>`).join("");
  $("#opts").querySelectorAll(".ch").forEach(b=>b.onclick=()=>submitSeq(opts[+b.dataset.o],b));
}
function submitSeq(val,btn){
  if(locked)return;const w=q.need[q.slot],target=q[w];
  const v=toHira(norm(val||""));if(!v)return;
  const ok=v===target,el=$("#slot-"+w),lab=x=>q.kk?toKata(x):x;
  if(!C.input){if(btn)btn.classList.add(ok?"right":"wrong");if(!ok)$("#opts").querySelectorAll(".ch").forEach((b,j)=>{if(q.opts[j]===target)b.classList.add("right")})}
  el.textContent=lab(target);el.classList.remove("active");el.classList.add(ok?"right":"wrong");
  q.given[w]=ok;
  if(!ok){locked=true;return resolve(false,w==="prev"?"前一个错":"后一个错")}
  q.slot++;
  if(q.slot<q.need.length){const nw=q.need[q.slot];$("#slot-"+nw).classList.add("active");
    setTimeout(()=>{if(C.input){const inp=$("#ans");inp.value="";inp.placeholder=`再填${nw==="prev"?"前":"后"}一个`;inp.classList.remove("right");inp.focus()}else seqOptions()},350);return}
  locked=true;resolve(true,"",q.explain);
}

/* ---------- 游戏 3：平片转换 ---------- */
function askConv(){
  const k=pickKana(),toK=script==="k"?false:script==="h"?true:Math.random()<.5;
  const s=toK?k:toKata(k),target=toK?toKata(k):k;
  q={k,show:s,speak:s,target,toK,explain:`「${s}」→「${target}」（${romaOf(k)}）`,hint:`读音 <b>${romaOf(k)}</b>`};
  const askTxt=toK?"写出对应的<b style='color:var(--paper-ink)'>片假名</b>":"写出对应的<b style='color:var(--paper-ink)'>平假名</b>";
  let ans;
  if(C.input)ans=inputBox(toK?"输入片假名":"输入平假名");
  else{const pool=C.pool().filter(x=>x!==k&&!CONFUSE.has(toKata(x))&&!CONFUSE.has(x));const opts=fill4(k,pool,nearOf(k).filter(x=>!CONFUSE.has(toKata(x))&&!CONFUSE.has(x)),nearOf(k));q.opts=opts;
    ans=`<div class="choices c4" id="opts">${opts.map((o,j)=>`<button class="ch" data-o="${j}"><kbd>${j+1}</kbd>${toK?toKata(o):o}</button>`).join("")}</div>`}
  frame(`<div class="ask">${askTxt}</div><div class="prompt enter">${s}</div>${ans}`);
  if(C.input)bindInput(submitConv);
  else $("#opts").querySelectorAll(".ch").forEach(b=>b.onclick=()=>submitConv(null,b));
}
let formatWarned=false;
function submitConv(val,btn){
  if(locked)return;
  if(btn){const j=+btn.dataset.o,ok=q.opts[j]===q.k;locked=true;btn.classList.add(ok?"right":"wrong");if(!ok)$("#opts").querySelectorAll(".ch").forEach((b,x)=>{if(q.opts[x]===q.k)b.classList.add("right")});return resolve(ok,"选错")}
  const v=norm(val||"");if(!v)return;
  const inp=$("#ans");
  /* 写对了字但用错了文字系统：提醒一次，不算错 */
  if(toHira(v)===q.k&&v!==q.target&&!formatWarned){formatWarned=true;$("#hintbox").innerHTML=q.toK?"这是平假名哦：输入法里按 <b>F7</b> 转成片假名，或用下方假名键盘":"这是片假名哦：输入法里按 <b>F6</b> 转成平假名";inp.select();return}
  locked=true;const ok=v===q.target;
  inp.classList.add(ok?"right":"wrong");if(!ok)inp.value=`${v} → ${q.target}`;
  resolve(ok,toHira(v)===q.k?"平片写反":"写错",q.explain);
}

/* ---------- 输入框（IME 友好） ---------- */
function inputBox(ph){
  return `<div class="answer"><input id="ans" lang="ja" autocomplete="off" spellcheck="false" placeholder="${ph}"><button class="btn" id="submit">确定</button></div>
   <div class="ime">日语输入法直接打 · 片假名按 <b>F7</b>、平假名按 <b>F6</b> · 也可以用 <button class="pill" id="vkBtn" style="height:22px;padding:0 8px">假名键盘 <kbd>K</kbd></button></div>`;
}
let composing=false;
function bindInput(fn){
  const inp=$("#ans");inp.focus();
  inp.addEventListener("compositionstart",()=>composing=true);
  inp.addEventListener("compositionend",()=>composing=false);
  inp.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.isComposing&&!composing){e.preventDefault();fn(inp.value)}});
  $("#submit").onclick=()=>fn(inp.value);
  $("#vkBtn").onclick=toggleVK;
  renderVK();
}

/* ---------- 屏幕假名键盘 ---------- */
let vkOpen=false;
function renderVK(){
  const vk=$("#vk");if(!$("#ans")){vk.classList.remove("show");return}
  const kata=G==="conv"?q.toK:q.kk;const lab=x=>x==="_"?"":kata?toKata(x):x;
  const cols=[...ROWS.map(r=>r[1]),"ん____"];
  let cells="";for(let r=0;r<5;r++)for(const c of cols)cells+=c[r]==="_"?`<button class="e"></button>`:`<button data-k="${lab(c[r])}">${lab(c[r])}</button>`;
  vk.innerHTML=`<div class="vk-grid">${cells}</div>
   <div class="vk-row"><button data-k="゙">゛</button><button data-k="゚">゜</button>${["ゃ","ゅ","ょ","っ"].map(x=>`<button data-k="${lab(x)}">${lab(x)}</button>`).join("")}${kata?`<button data-k="ー">ー</button>`:""}<button class="wide" data-act="bs">⌫ 删除</button><button class="wide" data-act="ok" style="color:var(--gold)">确定</button></div>
   <div class="vk-note"><span>从右往左按五十音排列 · ゛゜ 会和前一个字合成（か + ゛ = が）</span><span>${kata?"片假名":"平假名"}键盘</span></div>`;
  vk.classList.toggle("show",vkOpen);
  vk.querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>{const inp=$("#ans");if(!inp||locked)return;inp.value=(inp.value+b.dataset.k).normalize("NFC");inp.focus()});
  vk.querySelector("[data-act=bs]").onclick=()=>{const inp=$("#ans");inp.value=[...inp.value].slice(0,-1).join("");inp.focus()};
  vk.querySelector("[data-act=ok]").onclick=()=>{const inp=$("#ans");(G==="seq"?submitSeq:submitConv)(inp.value)};
}
function toggleVK(){vkOpen=!vkOpen;el.querySelector(".sheet").style.minHeight=vkOpen?"0":"";if(vkOpen)setTimeout(()=>$("#vk").scrollIntoView({block:"nearest",behavior:"smooth"}),50);$("#vk").classList.toggle("show",vkOpen);const i=$("#ans");if(i)i.focus()}

/* ================= 结束（完整结算在下一阶段） ================= */
function finish(){
  if(st.over)return;st.over=true;cancelAnimationFrame(raf);$("#vk").classList.remove("show");
  const secs=(performance.now()-st.start)/1000;
  const run={id:Date.now(),at:new Date().toISOString(),G,D,script,only:ONLY,score:KD.achievement(st.log).pct,secs:+secs.toFixed(1),best:st.best,log:st.log,ended:D==="chal"?(st.lives<=0?"错满 3 次":"时间到"):"答完"};
  ctx.store.addRun(run);ctx.lastRun=run;
  go("results.html?run="+run.id);
}

/* ================= 键盘 ================= */
ctx.onKey(e=>{
  if(e.key==="Escape"){go("games.html");return}
  if(st.over)return;
  const typing=e.target.id==="ans";
  if(typing)return;
  if(e.key===" "){e.preventDefault();say(q.show);return}
  if(e.key==="h"&&G!=="pos"||e.key==="H"){useHint();return}
  if(e.key==="k"&&$("#ans")){toggleVK();return}
  if(G==="pos"){
    if(q.phase===0){const i="aksthnmyrwgzdbp".indexOf(e.key);const rows=C.daku?[...ROWS,...DROWS]:ROWS;if(i>=0&&i<rows.length)pickRow(rows[i][0])}
    else{const i="aiueo".indexOf(e.key);if(i>=0)pickDan(DAN[i])}
    if(e.key==="Backspace"&&q.phase===1&&!locked){q.phase=0;askPosReset()}
    return}
  if(/^[1-4]$/.test(e.key)){const b=stage.querySelectorAll("#opts .ch")[+e.key-1];if(b)b.click()}
});
function askPosReset(){stage.querySelectorAll("[data-row]").forEach(b=>b.classList.remove("picked"));$("#ph0").className="on";$("#ph0").textContent="① 行";$("#ph1").className="";const dc=$("#danc");dc.style.opacity=.4;dc.style.pointerEvents="none"}

ask();
ctx.speech.prefetch([...new Set(C.pool().flatMap(k=>[k,toKata(k)]))]);

}
