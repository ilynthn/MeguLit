/* SPDX-License-Identifier: GPL-3.0-or-later
   学习 → 学习统计（v1.0.5 重设计）：魔导书 × 毛玻璃。
   每块面板可以单独切换 年 / 月 / 周 / 日；顶部的总开关一次切换全部。数据按「范围 + 日期」缓存，一次请求供多块面板共用。 */
import {shiftPeriod,periodLabel} from './statistics-view.js';

const LANG={zh:'zh-CN',ja:'ja-JP',en:'en-US'};
const M={
 zh:{year:'年',month:'月',week:'周',day:'日',prev:'上一段时间',next:'下一段时间',chars:'阅读字数',time:'阅读时长',lookups:'查词',last:'最后阅读',calendar:'阅读日历',calHint:'颜色越深，读得越多',books:{year:'今年读的书',month:'这个月读的书',week:'这周读的书',day:'今天读的书'},trend:'字数走势',dial:'阅读时段',week7:'星期分布',feel:'阅读手感',top:'最常查的词',analysis:{year:'今年的阅读',month:'这个月的阅读',week:'这周的阅读',day:'今天的阅读'},less:'少',more:'多',hover:'把鼠标移到格子上看详情',noData:'这段时间还没有阅读记录',more3:n=>`还有 ${n} 部 · 展开`,fold:'收起',unit:'字',min:'分钟',hourU:'小时',minU:'分',times:'次',peak:'最多',speed:'阅读速度',speedU:'字 / 分钟',density:'查词密度',densityU:'次 / 千字',newWords:'新收录单词',newU:'个',sentLen:'平均句长',sentU:'字 / 句',distinct:(n,d)=>`${n} 次查词 · ${d} 个不同的词`,
  lead:(p,c,h,m,l,t)=>`${p}，你读了<b>${c}</b>字，<br>花了${h?`<b>${h}</b>小时`:''}<b>${m}</b>分，查了<b>${l}</b>次词。${t?`<br>读得最多的是<em>《${t}》</em>`:''}`,
  periodName:{year:'今年',month:'这个月',week:'这周',day:'今天'},sentences:'句',sentencesLabel:'读过的台词',lastLabel:'最后一次阅读',daysLabel:'有阅读记录',dayU:'天',
  footMax:{year:'单月最多（字）',month:'单日最多（字）',week:'单日最多（字）',day:'单小时最多（字）'},perHour:'平均每小时（字）',perSentence:'平均每句（字）',streak:{year:'最长连续月份',month:'最长连续阅读',week:'最长连续阅读',day:'最长连续小时'},
  dialNote:(a,b,n)=>`最常在 <b>${a}</b>${b?` 和 <b>${b}</b>`:''} 读${n?`，深夜占 ${n}%`:''}`,weekNote:(a,z)=>`周${a}读得最多${z.length?`，${z.map(x=>'周'+x).join('、')}还没开过书`:''}`,wd:['日','一','二','三','四','五','六'],dialCenter:'读得最多'},
 ja:{year:'年',month:'月',week:'週',day:'日',prev:'前の期間',next:'次の期間',chars:'読んだ文字数',time:'読書時間',lookups:'辞書検索',last:'最後の読書',calendar:'読書カレンダー',calHint:'色が濃いほどたくさん読んだ日',books:{year:'今年読んだ作品',month:'今月読んだ作品',week:'今週読んだ作品',day:'今日読んだ作品'},trend:'文字数の推移',dial:'読書の時間帯',week7:'曜日別',feel:'読み心地',top:'よく調べた語',analysis:{year:'今年の読書',month:'今月の読書',week:'今週の読書',day:'今日の読書'},less:'少',more:'多',hover:'マスにカーソルを合わせると詳細を表示',noData:'この期間の記録はありません',more3:n=>`ほか ${n} 作品 · 表示`,fold:'閉じる',unit:'文字',min:'分',hourU:'時間',minU:'分',times:'回',peak:'最多',speed:'読書速度',speedU:'文字 / 分',density:'辞書密度',densityU:'回 / 千字',newWords:'新しい単語',newU:'語',sentLen:'平均の文の長さ',sentU:'文字 / 文',distinct:(n,d)=>`${n} 回 · ${d} 語`,
  lead:(p,c,h,m,l,t)=>`${p}は <b>${c}</b> 文字を読み、<br>${h?`<b>${h}</b> 時間 `:''}<b>${m}</b> 分、辞書を <b>${l}</b> 回引きました。${t?`<br>いちばん読んだのは<em>『${t}』</em>`:''}`,
  periodName:{year:'今年',month:'今月',week:'今週',day:'今日'},sentences:'文',sentencesLabel:'読んだ台詞',lastLabel:'最後に読んだ日',daysLabel:'読書した日',dayU:'日',
  footMax:{year:'月の最多（文字）',month:'1日の最多（文字）',week:'1日の最多（文字）',day:'1時間の最多（文字）'},perHour:'1時間あたり（文字）',perSentence:'1文あたり（文字）',streak:{year:'連続した月',month:'連続読書日数',week:'連続読書日数',day:'連続した時間'},
  dialNote:(a,b,n)=>`よく読むのは <b>${a}</b>${b?` と <b>${b}</b>`:''}${n?`、深夜が ${n}%`:''}`,weekNote:(a,z)=>`${a}曜日がいちばん多い${z.length?`、${z.map(x=>x+'曜').join('・')}はまだ読んでいません`:''}`,wd:['日','月','火','水','木','金','土'],dialCenter:'いちばん多い'},
 en:{year:'Year',month:'Month',week:'Week',day:'Day',prev:'Previous',next:'Next',chars:'Characters',time:'Reading time',lookups:'Lookups',last:'Last read',calendar:'Reading calendar',calHint:'Darker means more reading',books:{year:'Read this year',month:'Read this month',week:'Read this week',day:'Read today'},trend:'Reading flow',dial:'Time of day',week7:'By weekday',feel:'Reading feel',top:'Most looked up',analysis:{year:'This year',month:'This month',week:'This week',day:'Today'},less:'Less',more:'More',hover:'Hover a cell for details',noData:'No reading in this period',more3:n=>`${n} more · show`,fold:'Show less',unit:'chars',min:'min',hourU:'h',minU:'m',times:'×',peak:'peak',speed:'Reading speed',speedU:'chars / min',density:'Lookup density',densityU:'per 1k chars',newWords:'New words',newU:'',sentLen:'Avg. line length',sentU:'chars / line',distinct:(n,d)=>`${n} lookups · ${d} words`,
  lead:(p,c,h,m,l,t)=>`${p} you read <b>${c}</b> characters<br>in ${h?`<b>${h}</b>h `:''}<b>${m}</b>m and looked up <b>${l}</b> words.${t?`<br>Most read: <em>${t}</em>`:''}`,
  periodName:{year:'This year',month:'This month',week:'This week',day:'Today'},sentences:'lines',sentencesLabel:'lines read',lastLabel:'last read',daysLabel:'days with reading',dayU:'days',
  footMax:{year:'Best month (chars)',month:'Best day (chars)',week:'Best day (chars)',day:'Best hour (chars)'},perHour:'Per hour (chars)',perSentence:'Per line (chars)',streak:{year:'Longest month streak',month:'Longest streak',week:'Longest streak',day:'Longest hour streak'},
  dialNote:(a,b,n)=>`Most often at <b>${a}</b>${b?` and <b>${b}</b>`:''}${n?`, ${n}% late at night`:''}`,weekNote:(a,z)=>`${a} is your busiest day${z.length?`; nothing yet on ${z.join(', ')}`:''}`,wd:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],dialCenter:'busiest'}
};
const RANGES=['year','month','week','day'];
const PANELS=['keys','calendar','books','trend','dial','week','feel','top','analysis'];

/* the learning slot survives sub-tab switches: drop the previous mount's click handler before adding a new one */
let mounted=null;
export async function mountStatistics(root,{api,env,selection,onSelection}){
 mounted?.abort();const life=new AbortController();mounted=life;const seq={};
 const {locale,esc}=env,w=M[locale]||M.zh,num=v=>new Intl.NumberFormat(LANG[locale]).format(Math.round(v||0));
 const state={date:selection.date,global:selection.range,ranges:Object.fromEntries(PANELS.map(p=>[p,selection.range])),cache:new Map(),openBooks:false};
 const load=range=>{const key=range+'|'+state.date;if(!state.cache.has(key))state.cache.set(key,api('statistics',{range,date:state.date}).catch(error=>{state.cache.delete(key);throw error;}));return state.cache.get(key);};
 const switcher=panel=>`<span class="stg-rs" role="group" data-panel="${panel}">${RANGES.map(r=>`<button type="button" data-r="${r}" aria-pressed="${state.ranges[panel]===r}">${w[r]}</button>`).join('')}</span>`;
 const head=(panel,title,extra='')=>`<div class="stg-head"><h2>${esc(title)}</h2>${switcher(panel)}${extra?`<span class="stg-sub">${extra}</span>`:''}</div>`;

 root.innerHTML=`<div class="stg">
  <div class="stg-period"><div class="stg-tabs" role="group">${RANGES.map(r=>`<button type="button" data-global="${r}" aria-pressed="${state.global===r}">${w[r]}</button>`).join('')}</div>
   <div class="stg-nav"><button type="button" data-shift="-1" aria-label="${w.prev}">‹</button><b data-label></b><button type="button" data-shift="1" aria-label="${w.next}">›</button></div></div>
  <hr class="stg-rule">
  <div class="stg-keys stg-glass" data-p="keys"></div>
  <div class="stg-grid"><section class="stg-glass" data-p="calendar"></section><section class="stg-glass" data-p="books"></section></div>
  <section class="stg-glass" data-p="trend"></section>
  <div class="stg-trio"><section class="stg-glass" data-p="dial"></section><section class="stg-glass" data-p="week"></section><section class="stg-glass" data-p="feel"></section></div>
  <section class="stg-glass" data-p="top"></section>
  <section class="stg-glass" data-p="analysis"></section>
 </div>`;
 const el=p=>root.querySelector(`[data-p="${p}"]`);
 const label=()=>{const box=root.querySelector('[data-label]');load(state.global).then(d=>{if(box.isConnected)box.textContent=periodLabel(d.period,locale);}).catch(()=>{});};

 const duration=s=>{const h=Math.floor((s||0)/3600),m=Math.round(((s||0)%3600)/60);return {h,m};};
 const slot=(day,range)=>range==='day'?Number(day.slice(-2))+':00':range==='year'?Number(day.slice(5,7))+(locale==='en'?'':'月'):day.slice(5).replace('-','/');
 const level=(v,max)=>!v?0:v<max*.1?1:v<max*.3?2:v<max*.65?3:4;
 const short=v=>v>=10000&&locale!=='en'?(v/10000).toFixed(1)+(locale==='ja'?'万':' 万'):num(v);
 const empty=()=>`<p class="stg-empty">${esc(w.noData)}</p>`;

 const render={
  keys(d){const t=duration(d.totals.seconds),lastDay=d.last?d.last.slice(5).split('-').map(Number):null;
   el('keys').innerHTML=`<div><span>${w.chars}</span><b class="num">${num(d.totals.characters)}</b></div>
    <div><span>${w.time}</span><b class="num">${t.h?`${t.h}<small>${w.hourU}</small>`:''}${t.m}<small>${w.minU}</small></b></div>
    <div><span>${w.lookups}</span><b class="num">${num(d.totals.lookups)}<small>${w.times}</small></b></div>
    <div><span>${w.last}</span><b class="num">${lastDay?(locale==='en'?`${lastDay[0]}/${lastDay[1]}`:`${lastDay[0]}<small>月</small>${lastDay[1]}<small>日</small>`):'—'}</b></div>`;},
  calendar(d,range){const rows=d.buckets,max=Math.max(1,...rows.map(r=>r.characters||0)),maxS=Math.max(1,...rows.map(r=>r.seconds||0)),today=new Date();
   let cells='';
   if(range==='month'){const first=new Date(rows[0].day+'T12:00:00'),offset=(first.getDay()+6)%7;cells=[1,2,3,4,5,6,0].map(i=>`<div class="wd">${esc(w.wd[i])}</div>`).join('')+'<div class="cell blank"></div>'.repeat(offset);}
   cells+=rows.map((r,i)=>{const isToday=range==='month'||range==='week'?r.day===`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`:false;
    const name=range==='month'?String(Number(r.day.slice(8))):range==='week'?esc(w.wd[(i+1)%7])+' '+r.day.slice(8):slot(r.day,range);
    return `<div class="cell l${level(r.characters,max)}${isToday?' is-today':''}" data-i="${i}"><span class="d">${name}</span><span class="v">${r.characters?short(r.characters):''}</span>${r.seconds?`<i class="ink" style="width:${Math.min(100,r.seconds/maxS*100)}%"></i>`:''}</div>`;}).join('');
   el('calendar').innerHTML=head('calendar',w.calendar)+`<div class="stg-cal ${range}">${cells}</div><div class="stg-legend"><span data-cap>${esc(w.hover)}</span><span>${w.less} ${[0,1,2,3,4].map(l=>`<i class="l${l}"></i>`).join('')} ${w.more}</span></div>`;
   const cap=el('calendar').querySelector('[data-cap]');
   /* 2026-11-14: the caption went stale (kept the last cell after the pointer left the calendar); now it returns to the hint */
   el('calendar').querySelectorAll('[data-i]').forEach(c=>c.addEventListener('mouseenter',()=>{const r=rows[+c.dataset.i],t=duration(r.seconds);cap.textContent=`${slot(r.day,range==='month'||range==='week'?'week':range)} · ${num(r.characters)} ${w.unit} · ${t.h?t.h+w.hourU+' ':''}${t.m}${w.minU} · ${num(r.lookups)} ${w.times}`;}));
   el('calendar').querySelector('.stg-cal')?.addEventListener('mouseleave',()=>{cap.textContent=w.hover;});},
  books(d,range){const games=[...d.games].sort((a,b)=>b.readingSeconds-a.readingSeconds||b.characters-a.characters),max=Math.max(1,...games.map(g=>g.readingSeconds||0)),shown=state.openBooks?games:games.slice(0,5);
   el('books').innerHTML=head('books',w.books[range])+(games.length?`<div class="stg-books">${shown.map((g,i)=>{const game=env.gameById?.(g.id),t=duration(g.readingSeconds);
    return `<div class="stg-book"><span class="no">${i+1}</span>${game?env.cover(game,'stg-cv'):'<span class="stg-cv"></span>'}<span class="t"><b title="${esc(g.title)}">${esc(g.title)}</b><small>${num(g.characters)} ${w.unit}</small><span class="share" style="width:${(g.readingSeconds||0)/max*100}%"></span></span><span class="n">${t.h?t.h+'<small>'+w.hourU+'</small>':''}${t.m}<small>${w.min}</small></span></div>`;}).join('')}${games.length>5?`<button type="button" class="stg-more">${state.openBooks?esc(w.fold):esc(w.more3(games.length-5))}</button>`:''}</div>`:empty());
   el('books').querySelector('.stg-more')?.addEventListener('click',()=>{state.openBooks=!state.openBooks;draw('books');});},
  trend(d,range){const rows=d.buckets,W=1000,H=230,pad={l:8,r:8,t:38,b:12},n=rows.length,vals=rows.map(r=>r.characters||0),top=Math.max(1,...vals),mx=top*1.15;
   const x=i=>n<2?W/2:pad.l+i*(W-pad.l-pad.r)/(n-1),y=v=>H-pad.b-(v/mx)*(H-pad.t-pad.b);
   let path=`M${x(0)},${y(vals[0])}`;for(let i=1;i<n;i++){const cx=(x(i-1)+x(i))/2;path+=` C${cx},${y(vals[i-1])} ${cx},${y(vals[i])} ${x(i)},${y(vals[i])}`;}
   const k=vals.indexOf(top),every=Math.max(1,Math.ceil(n/7));
   const grid=[0,.25,.5,.75,1].map(f=>{const yy=y(top*f);return `<line x1="0" x2="${W}" y1="${yy}" y2="${yy}" class="${f?'g':'g0'}"/>`;}).join('');
   const ticks=rows.map((_,i)=>`<line x1="${x(i)}" x2="${x(i)}" y1="${H-pad.b}" y2="${H-pad.b+(i%every===0?7:3)}" class="tk"/>`).join('');
   const sum=vals.reduce((a,b)=>a+b,0);
   el('trend').innerHTML=head('trend',w.trend,`<b class="num">${num(sum)}</b> ${w.unit}`)+(sum?`<div class="stg-plot"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(w.trend)}"><defs><pattern id="stg-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><line x1="0" y1="0" x2="0" y2="7" class="hatch"/></pattern><linearGradient id="stg-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${grid}${ticks}<path d="${path} L${x(n-1)},${H-pad.b} L${x(0)},${H-pad.b} Z" fill="url(#stg-fade)"/><path d="${path} L${x(n-1)},${H-pad.b} L${x(0)},${H-pad.b} Z" fill="url(#stg-hatch)"/><path d="${path}" class="line" vector-effect="non-scaling-stroke"/><line class="cursor" y1="${pad.t}" y2="${H-pad.b}" x1="-10" x2="-10" vector-effect="non-scaling-stroke"/></svg>
    <span class="stg-peak" style="left:${x(k)/W*100}%;top:${y(top)/H*100}%"><i></i><b class="num">${num(top)} ${w.unit}</b><small>${esc(slot(rows[k].day,range))} · ${w.peak}</small></span><span class="stg-tip" hidden></span></div><div class="stg-axis">${rows.map((r,i)=>i%every===0||i===n-1?`<span style="left:${x(i)/W*100}%">${esc(slot(r.day,range))}</span>`:'').join('')}</div>`:empty());
   const plot=el('trend').querySelector('.stg-plot');if(!plot)return;const tip=plot.querySelector('.stg-tip'),cursor=plot.querySelector('.cursor');
   plot.addEventListener('pointermove',e=>{const b=plot.getBoundingClientRect(),i=Math.max(0,Math.min(n-1,Math.round((e.clientX-b.left)/b.width*(n-1))));cursor.setAttribute('x1',x(i));cursor.setAttribute('x2',x(i));tip.hidden=false;tip.innerHTML=`<b>${esc(slot(rows[i].day,range))}</b> ${num(vals[i])} ${w.unit}`;tip.style.left=Math.min(b.width-140,Math.max(0,x(i)/W*b.width+10))+'px';});
   plot.addEventListener('pointerleave',()=>{tip.hidden=true;cursor.setAttribute('x1',-10);cursor.setAttribute('x2',-10);});},
  dial(d){const h=d.hours||Array(24).fill(0),mx=Math.max(1,...h),cx=110,cy=110,r1=56,r2=96,total=h.reduce((a,b)=>a+b,0);
   const seg=i=>{const a0=(i/24)*Math.PI*2-Math.PI/2+.012,a1=((i+1)/24)*Math.PI*2-Math.PI/2-.012,rr=r1+(r2-r1)*(h[i]/mx)+0.01,p=(r,a)=>`${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)).toFixed(1)}`;return `<path d="M${p(r1,a0)} L${p(rr,a0)} A${rr},${rr} 0 0 1 ${p(rr,a1)} L${p(r1,a1)} A${r1},${r1} 0 0 0 ${p(r1,a0)}Z" class="${h[i]?'on':'off'}" style="${h[i]?`opacity:${(.3+.7*h[i]/mx).toFixed(2)}`:''}"><title>${i}:00 · ${Math.round(h[i]/60)} ${w.min}</title></path>`;};
   const order=h.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]),hh=i=>String(i).padStart(2,'0')+':00',night=total?Math.round([0,1,2,3,4,5].reduce((a,i)=>a+h[i],0)/total*100):0;
   el('dial').innerHTML=head('dial',w.dial)+(total?`<div class="stg-dial"><svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="${r2}" class="ring"/><circle cx="110" cy="110" r="${r1-6}" class="ring2"/>${h.map((_,i)=>seg(i)).join('')}${[0,6,12,18].map(v=>{const a=(v/24)*Math.PI*2-Math.PI/2;return `<text class="hr" x="${(cx+(r2+12)*Math.cos(a)).toFixed(1)}" y="${(cy+(r2+12)*Math.sin(a)+3).toFixed(1)}" text-anchor="middle">${v}</text>`;}).join('')}<text class="c1" x="110" y="114" text-anchor="middle">${hh(order[0][1])}</text><text class="c2" x="110" y="132" text-anchor="middle">${esc(w.dialCenter)}</text></svg></div><p class="stg-note">${w.dialNote(hh(order[0][1]),order[1][0]?hh(order[1][1]):'',night)}</p>`:empty());},
  week(d){const v=d.weekdays||Array(7).fill(0),order=[1,2,3,4,5,6,0],mx=Math.max(1,...v),total=v.reduce((a,b)=>a+b,0),best=order.reduce((a,i)=>v[i]>v[a]?i:a,order[0]);
   el('week').innerHTML=head('week',w.week7)+(total?`<div class="stg-week">${order.map(i=>`<div><b>${v[i]?Math.round(v[i]/60):''}</b><i class="${v[i]?'':'zero'}" style="height:${v[i]?Math.max(6,v[i]/mx*120):2}px"></i><span>${esc(w.wd[i])}</span></div>`).join('')}</div><p class="stg-note">${w.weekNote(w.wd[best],order.filter(i=>!v[i]).map(i=>w.wd[i]))}</p>`:empty());},
  feel(d){const rows=d.buckets.filter(r=>r.seconds||r.characters),c=d.totals.characters,s=d.totals.seconds,sp=s?c/(s/60):0,den=c?d.totals.lookups/(c/1000):0,sl=d.totals.sentences?c/d.totals.sentences:0;
   const spark=(arr,cls)=>{const a=arr.filter(Number.isFinite);if(a.length<2)return '<svg viewBox="0 0 92 30"></svg>';const mx=Math.max(...a),mn=Math.min(...a),pts=a.map((v,i)=>[(i/(a.length-1)*88+2).toFixed(1),(27-(v-mn)/(mx-mn||1)*23).toFixed(1)]);return `<svg viewBox="0 0 92 30"><polyline points="${pts.map(p=>p.join(',')).join(' ')}" class="${cls}"/><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="2.5" class="${cls}-dot"/></svg>`;};
   let cum=0;const cumWords=d.buckets.map(r=>cum+=r.newWords||0);
   const items=[[sp?num(sp):'—',w.speedU,w.speed,spark(rows.map(r=>r.seconds?r.characters/(r.seconds/60):NaN),'a')],[den?den.toFixed(2):'—',w.densityU,w.density,spark(rows.map(r=>r.characters?r.lookups/(r.characters/1000):NaN),'b')],[num(d.newWords||0),w.newU,w.newWords,spark(cumWords,'a')],[sl?sl.toFixed(1):'—',w.sentU,w.sentLen,spark(rows.map(r=>r.sentences?r.characters/r.sentences:NaN),'c')]];
   el('feel').innerHTML=head('feel',w.feel)+`<div class="stg-feel">${items.map(([n,u,l,sv])=>`<div><p><b class="num">${n}<small>${u}</small></b><span>${l}</span></p>${sv}</div>`).join('')}</div>`;},
  top(d){const list=d.topLookups||[];
   el('top').innerHTML=head('top',w.top,esc(w.distinct(num(d.totals.lookups),num(d.distinctLookups||0))))+(list.length?`<div class="stg-top">${list.slice(0,8).map((r,i)=>`<div class="lk"><em>${i+1}</em><b>${esc(r.surface)}<small>${esc(r.title||'')}</small></b><span class="num">${num(r.count)} ${w.times}</span></div>`).join('')}</div>`:empty());},
  analysis(d,range){const c=d.totals.characters,t=duration(d.totals.seconds),games=[...d.games].sort((a,b)=>b.characters-a.characters),rows=d.buckets,days=rows.filter(r=>r.seconds||r.characters).length;
   let streak=0,run=0;for(const r of rows){run=r.characters||r.seconds?run+1:0;streak=Math.max(streak,run);}
   const pname=range==='month'?new Intl.DateTimeFormat(LANG[locale],{month:'long'}).format(new Date(state.date+'T12:00:00')):w.periodName[range];
   const lastDay=d.last?d.last.slice(5).split('-').map(Number):null,maxBucket=Math.max(0,...rows.map(r=>r.characters||0));
   el('analysis').innerHTML=head('analysis',w.analysis[range])+(c||d.totals.seconds?`<div class="stg-an"><p>${w.lead(esc(pname),num(c),t.h,t.m,num(d.totals.lookups),games[0]?esc(games[0].title):'')}</p>
    <aside><b class="num">${num(d.totals.sentences)} ${w.sentences}</b>${w.sentencesLabel}<br><b class="num">${lastDay?(locale==='en'?lastDay.join('/'):`${lastDay[0]} 月 ${lastDay[1]} 日`):'—'}</b>${w.lastLabel}<br><b class="num">${days} ${range==='year'?(locale==='en'?'months':'个月'):range==='day'?(locale==='en'?'hours':'小时'):w.dayU}</b>${w.daysLabel}</aside></div>
    <div class="stg-foot"><div><b class="num">${num(maxBucket)}</b>${w.footMax[range]}</div><div><b class="num">${d.totals.seconds?num(c/(d.totals.seconds/3600)):'—'}</b>${w.perHour}</div><div><b class="num">${d.totals.sentences?(c/d.totals.sentences).toFixed(1):'—'}</b>${w.perSentence}</div><div><b class="num">${streak} <small>${range==='year'?(locale==='en'?'months':'个月'):range==='day'?(locale==='en'?'h':'小时'):w.dayU}</small></b>${w.streak[range]}</div></div>`:empty());}
 };
 async function draw(panel){const range=panel==='keys'?state.global:state.ranges[panel],box=el(panel);box.classList.add('stg-loading');const mine=seq[panel]=(seq[panel]||0)+1;
  try{const data=await load(range);if(!root.isConnected||life.signal.aborted||mine!==seq[panel])return;render[panel](data,range);}catch(error){box.innerHTML=`<p class="stg-empty">${esc(String(error?.message||error))}</p>`;}finally{box.classList.remove('stg-loading');}}
 const drawAll=()=>{label();PANELS.forEach(draw);};
 root.addEventListener('click',e=>{
  const sw=e.target.closest('.stg-rs [data-r]');if(sw){const panel=sw.parentElement.dataset.panel;state.ranges[panel]=sw.dataset.r;draw(panel);return;}
  const g=e.target.closest('[data-global]');if(g){state.global=g.dataset.global;PANELS.forEach(p=>state.ranges[p]=state.global);root.querySelectorAll('[data-global]').forEach(b=>b.setAttribute('aria-pressed',String(b===g)));onSelection?.({range:state.global,date:state.date});drawAll();return;}
  const s=e.target.closest('[data-shift]');if(s){const next=shiftPeriod({range:state.global,date:state.date},Number(s.dataset.shift));state.date=next.date;onSelection?.({range:state.global,date:state.date});drawAll();}
 },{signal:life.signal});
 drawAll();
}
