/* 2026-11-13 (user) 阅读记录 in the house style: a summary panel (today / 7 days / speed / longest + chars-per-day bars) over day groups of compact session rows */
const L={zh:{today:'今天',yesterday:'昨天',before:'前天',days:'近 14 天每日字数',week:'近 7 天',speed:'平均速度',longest:'最长一次',chars:'字',sents:'句',per:'字/分',
  daySum:(n,d,c)=>`${n} 次 · ${d} · ${c} 字`,wk:['周日','周一','周二','周三','周四','周五','周六'],md:(m,d)=>`${m}月${d}日`,none:'还没有阅读记录',noneSub:'启动游戏开始阅读，MeguLit 会按次记下时长、字数和句数'},
 ja:{today:'今日',yesterday:'昨日',before:'一昨日',days:'過去 14 日の文字数',week:'過去 7 日',speed:'平均速度',longest:'最長',chars:'字',sents:'文',per:'字/分',
  daySum:(n,d,c)=>`${n} 回 · ${d} · ${c} 字`,wk:['日','月','火','水','木','金','土'],md:(m,d)=>`${m}月${d}日`,none:'まだ読書履歴がありません',noneSub:'ゲームを起動すると、読書時間・文字数・文数を回ごとに記録します'},
 en:{today:'Today',yesterday:'Yesterday',before:'2 days ago',days:'Characters per day, last 14 days',week:'Last 7 days',speed:'Avg speed',longest:'Longest',chars:'chars',sents:'lines',per:'chars/min',
  daySum:(n,d,c)=>`${n} sessions · ${d} · ${c} chars`,wk:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],md:(m,d)=>`${m}/${d}`,none:'No reading sessions yet',noneSub:'Launch the game; MeguLit records time, characters and lines for every session'}};
const dayKey=t=>{const d=new Date(t*1000);return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();};
const hm=t=>{const d=new Date(t*1000);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
const sum=(list,key)=>list.reduce((a,s)=>a+(s[key]||0),0);
export function sessionsView(items,{locale='zh',esc,number,duration,now=Date.now()}){const t=L[locale]||L.zh;
 if(!items?.length)return `<div class="ds-empty panel"><h3>${t.none}</h3><p>${t.noneSub}</p></div>`;
 const sec=now/1000,today=dayKey(sec),ago=n=>dayKey(sec-n*86400),label=k=>k===today?t.today:k===ago(1)?t.yesterday:k===ago(2)?t.before:'';
 const groups=new Map();for(const s of items){const k=dayKey(s.started_at);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);}
 const perDay=Array.from({length:14},(_,i)=>({chars:sum(groups.get(ago(13-i))||[],'characters'),d:new Date(now-(13-i)*86400000)}));
 const peak=Math.max(1,...perDay.map(d=>d.chars)),week=perDay.slice(7).reduce((a,d)=>a+d.chars,0);
 const timed=items.filter(s=>s.active_seconds>=60),secs=sum(timed,'active_seconds'),speed=secs?Math.round(sum(timed,'characters')/(secs/60)):0;
 const longest=items.reduce((m,s)=>Math.max(m,s.active_seconds||0),0),rowPeak=Math.max(1,...items.map(s=>s.characters||0));
 const fig=(k,v,u='')=>`<div class="ds-fig"><span>${k}</span><strong>${v}${u?`<small>${u}</small>`:''}</strong></div>`;
 const md=d=>t.md(d.getMonth()+1,d.getDate());
 const bars=perDay.map((d,i)=>`<i class="ds-bar${i===13?' is-today':''}${d.chars?'':' is-zero'}" style="--h:${d.chars?Math.max(6,Math.round(d.chars/peak*100)):0}%;--i:${i}" title="${esc(md(d.d))} · ${number(d.chars)} ${t.chars}">${i===0||i===13?`<b>${esc(i===13?t.today:md(d.d))}</b>`:''}</i>`).join('');
 const row=s=>{const sp=s.active_seconds>=60?Math.round((s.characters||0)/(s.active_seconds/60)):null;
  return `<li class="ds-row"><span class="ds-time">${hm(s.started_at)}<em>–</em>${hm(s.ended_at||s.started_at+(s.active_seconds||0))}</span><span class="ds-dur">${esc(duration(s.active_seconds))}</span>`+
   `<span class="ds-num">${number(s.characters||0)}<small>${t.chars}</small></span><span class="ds-num">${number(s.sentences||0)}<small>${t.sents}</small></span>`+
   `<span class="ds-num">${sp==null?`<span class="ds-na" title="不足 1 分钟，不计速度">—</span>`:`${number(sp)}<small>${t.per}</small>`}</span><span class="ds-vol" aria-hidden="true"><i style="--w:${Math.max(2,Math.round((s.characters||0)/rowPeak*100))}%"></i></span></li>`;};
 const days=[...groups.entries()].map(([k,list])=>{const d=new Date(list[0].started_at*1000),name=label(k),date=md(d)+' '+t.wk[d.getDay()];
  return `<section class="ds-day${k===today?' is-today':''}"><header class="ds-day-head"><h3>${esc(name||date)}</h3>${name?`<span class="ds-date">${esc(date)}</span>`:''}<span class="ds-day-sum">${esc(t.daySum(list.length,duration(sum(list,'active_seconds')),number(sum(list,'characters'))))}</span></header><ol class="ds-rows panel">${list.map(row).join('')}</ol></section>`;}).join('');
 return `<div class="ds"><section class="ds-summary panel"><div class="ds-figs">${fig(t.today,number(perDay[13].chars),t.chars)}${fig(t.week,number(week),t.chars)}${fig(t.speed,speed?number(speed):'—',t.per)}${fig(t.longest,durHTML(longest,locale))}</div><div class="ds-chart"><span class="ds-chart-k">${t.days}</span><div class="ds-bars">${bars}</div></div></section>${days}</div>`;}
/* numbers big, units small: 38小时12分 never pushes into the next stat column */
export function durHTML(seconds,locale='zh',wrap=false){const s=Math.max(0,Math.round(seconds||0)),u=({zh:['小时','分','秒'],ja:['時間','分','秒'],en:['h','m','s']})[locale]||['h','m','s'];
 const nw=x=>wrap?x:`<b class="dur-nw">${x}</b>`;if(s<60)return nw(`${s}<small>${u[2]}</small>`);const m=Math.round(s/60),h=Math.floor(m/60);return nw(h?`${h}<small>${u[0]}</small>${m%60?` ${m%60}<small>${u[1]}</small>`:''}`:`${m}<small>${u[1]}</small>`);}
