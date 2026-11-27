import {statisticsMessages} from './statistics-i18n.js';
const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const language={zh:'zh-CN',ja:'ja-JP',en:'en-US'};
export function shiftPeriod({range,date},direction){const d=new Date(date+'T12:00:00');if(range==='year')d.setFullYear(d.getFullYear()+direction);else if(range==='month'){const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+direction);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));}else d.setDate(d.getDate()+direction*(range==='week'?7:1));return {range,date:dateKey(d)};}
export function statisticsModel(data){return {...data,seconds:data.totals.seconds,characters:data.totals.characters,games:[...data.games].sort((a,b)=>b.readingSeconds-a.readingSeconds||b.characters-a.characters)};}
export function plotIndex(clientX,left,width,count){return Math.max(0,Math.min(count-1,Math.floor((clientX-left)/Math.max(1,width)*count)));}
export function periodLabel(period,locale){const d=new Date(period.date+'T12:00:00');if(period.range==='week')return `${period.start} ～ ${period.end}`;return new Intl.DateTimeFormat(language[locale],period.range==='year'?{year:'numeric'}:period.range==='month'?{year:'numeric',month:'long'}:{year:'numeric',month:'long',day:'numeric'}).format(d);}
const shortMonth={zh:m=>m+'月',ja:m=>m+'月',en:m=>new Intl.DateTimeFormat('en-US',{month:'short'}).format(new Date(2026,m-1,1))};
function slotLabel(day,range,locale='zh'){return range==='day'?day.slice(-2)+':00':range==='year'?shortMonth[locale](Number(day.slice(5,7))):day.slice(5);}
// Plot geometry is in real pixels: the SVG viewBox equals the rendered size, so
// axis text stays 11px at any window width instead of scaling with the chart.
const PAD={top:10,right:10,bottom:24},GAP=10;
const PLOT_HEIGHT={area:210,rhythm:120};
function niceStep(raw){if(!(raw>0))return 1;const p=10**Math.floor(Math.log10(raw)),f=raw/p;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p;}
const TIME_STEPS=[60,120,300,600,900,1200,1800,3600,7200,10800,14400,21600,43200];
function timeStep(raw){return TIME_STEPS.find(v=>v>=raw)||niceStep(raw/3600)*3600;}
export function axisTicks(max,kind){const step=kind==='rhythm'?timeStep(Math.max(max,60)/2):niceStep(Math.max(max,2)/2),n=Math.max(1,Math.ceil(max/step-1e-9));return Array.from({length:n+1},(_,i)=>i*step);}
function shortDuration(seconds,locale){if(!seconds)return '0';const h=seconds/3600;if(seconds>=3600)return ({zh:`${+h.toFixed(1)}小时`,ja:`${+h.toFixed(1)}時間`,en:`${+h.toFixed(1)}h`})[locale];const m=Math.round(seconds/60);return ({zh:`${m}分`,ja:`${m}分`,en:`${m}m`})[locale];}
function tickLabel(value,kind,locale){return kind==='rhythm'?shortDuration(value,locale):new Intl.NumberFormat(language[locale],{notation:'compact',maximumFractionDigits:1}).format(value);}
const textWidth=t=>[...String(t)].reduce((n,c)=>n+(c.charCodeAt(0)>255?11:6.4),0);
// Both charts share the left gutter so their columns line up vertically.
export function plotGutter(rows,locale){const labels=[...axisTicks(Math.max(0,...rows.map(r=>r.characters||0)),'area').map(v=>tickLabel(v,'area',locale)),...axisTicks(Math.max(0,...rows.map(r=>r.seconds||0)),'rhythm').map(v=>tickLabel(v,'rhythm',locale))];return Math.ceil(Math.max(...labels.map(textWidth)))+GAP+4;}
function monotonePath(points){if(points.length===1)return `M${points[0][0]},${points[0][1]}`;const n=points.length,s=[],m=[];for(let i=0;i<n-1;i++)s[i]=(points[i+1][1]-points[i][1])/(points[i+1][0]-points[i][0]);m[0]=s[0];m[n-1]=s[n-2];for(let i=1;i<n-1;i++)m[i]=s[i-1]*s[i]<=0?0:(s[i-1]+s[i])/2;for(let i=0;i<n-1;i++){if(s[i]===0){m[i]=0;m[i+1]=0;continue;}const a=m[i]/s[i],b=m[i+1]/s[i],h=a*a+b*b;if(h>9){const t=3/Math.sqrt(h);m[i]=t*a*s[i];m[i+1]=t*b*s[i];}}
 const f=v=>Math.round(v*10)/10;let d=`M${f(points[0][0])},${f(points[0][1])}`;for(let i=0;i<n-1;i++){const [x0,y0]=points[i],[x1,y1]=points[i+1],dx=(x1-x0)/3;d+=` C${f(x0+dx)},${f(y0+m[i]*dx)} ${f(x1-dx)},${f(y1-m[i+1]*dx)} ${f(x1)},${f(y1)}`;}return d;}
function plotFrame(kind,rows,width,height,locale){const key=kind==='area'?'characters':'seconds',left=plotGutter(rows,locale),W=Math.max(160,Math.round(width)),H=Math.max(80,Math.round(height)),plotW=W-left-PAD.right,plotH=H-PAD.top-PAD.bottom,base=PAD.top+plotH,step=plotW/rows.length,ticks=axisTicks(Math.max(0,...rows.map(r=>r[key]||0)),kind),top=ticks.at(-1)||1;return {key,left,W,H,plotW,plotH,base,step,ticks,top,x:i=>left+step*(i+.5),y:v=>base-(v||0)/top*plotH};}
export function plotSVG(kind,rows,period,env,width=640,height=PLOT_HEIGHT[kind]){
 const {locale,esc,number,duration}=env,w=statisticsMessages[locale],F=plotFrame(kind,rows,width,height,locale),{left,W,H,plotW,base,step,ticks,top,x,y}=F,r=v=>Math.round(v*10)/10;
 const grid=ticks.map(v=>`<line x1="${left}" x2="${W-PAD.right}" y1="${r(y(v))}" y2="${r(y(v))}" class="plot-grid${v===0?' plot-base':''}"/><text x="${left-GAP}" y="${r(y(v))}" dy="0.35em" text-anchor="end" class="plot-axis">${esc(tickLabel(v,kind,locale))}</text>`).join('');
 const every=Math.max(1,Math.ceil(rows.length/Math.max(2,Math.floor(plotW/64))));
 const xLabels=rows.map((row,i)=>i%every===0?`<text x="${r(x(i))}" y="${H-6}" text-anchor="middle" class="plot-axis">${esc(slotLabel(row.day,period.range,locale))}</text>`:'').join('');
 const hits=rows.map((row,i)=>`<rect x="${r(left+step*i)}" y="0" width="${r(step)}" height="${H}" class="plot-hit" tabindex="0" data-chart-index="${i}" aria-label="${esc(row.day+' · '+(kind==='area'?number(row.characters||0)+' '+w.unit:duration(row.seconds||0)))}"/>`).join('');
 let marks;
 if(kind==='area'){const points=rows.map((row,i)=>[x(i),y(row.characters)]),line=monotonePath(points);marks=`<defs><linearGradient id="reading-area-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--accent)" stop-opacity=".26"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs><path d="${line} L${r(points.at(-1)[0])},${base} L${r(points[0][0])},${base} Z" fill="url(#reading-area-fill)"/><path d="${line}" class="reading-curve"/><g class="chart-cursor" visibility="hidden"><line y1="${PAD.top}" y2="${base}"/><circle r="4"/></g>`;}
 else{const bw=Math.max(2,Math.min(28,step*.58)),rad=Math.min(4,bw/2);marks=rows.map((row,i)=>{const v=row.seconds||0;if(!v)return '';const h=Math.max(rad+1,v/top*F.plotH),x0=r(x(i)-bw/2),y0=r(base-h);return `<path class="rhythm-bar" data-bar-index="${i}" d="M${x0},${base} V${r(y0+rad)} Q${x0},${y0} ${r(x0+rad)},${y0} H${r(x0+bw-rad)} Q${r(x0+bw)},${y0} ${r(x0+bw)},${r(y0+rad)} V${base} Z"/>`;}).join('');}
 return `<svg class="statistics-plot" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(w[kind==='area'?'trend':'rhythm'])}">${grid}${marks}${xLabels}${hits}</svg>`;
}
function detailHTML(row,w,{esc,number,duration}){return `<strong>${esc(row.day.replace('T',' '))}${row.day.includes('T')?':00':''}</strong><span>${esc(number(row.characters||0))} ${w.unit}</span><span>${esc(duration(row.seconds||0))}</span><span>${esc(number(row.sentences||0))} ${w.sentences} · ${esc(number(row.lookups||0))} ${w.lookupUnit}</span>`;}
function chart(rows,period,env,kind){
 const {locale,esc,number,duration}=env,w=statisticsMessages[locale],sum=rows.reduce((n,r)=>n+(kind==='area'?r.characters||0:r.seconds||0),0);
 return `<section class="panel statistics-chart statistics-${kind}" data-chart="${kind}" data-chart-range="${esc(period.range)}" data-chart-rows="${esc(JSON.stringify(rows))}"><div class="chart-heading"><div><h2 class="panel-title">${w[kind==='area'?'trend':'rhythm']}</h2><small>${esc(periodLabel(period,locale))}${period.range==='day'?' · '+w.hourNote:''}</small></div><strong>${esc(kind==='area'?number(sum)+' '+w.unit:duration(sum))}</strong></div><div class="chart-stage">${plotSVG(kind,rows,period,env)}<div class="chart-tooltip" role="status" hidden></div></div></section>`;
}
export function statisticsResultsHTML(data,env){const {locale,esc,number,duration,icon}=env,w=statisticsMessages[locale],model=statisticsModel(data),max=Math.max(1,...model.games.map(g=>g.readingSeconds)),maxNovel=Math.max(1,...(model.novels||[]).map(n=>n.seconds||0));
 return `<section class="statistics-summary">${[[w.characters,number(model.characters),'word'],[w.reading,duration(model.seconds),'clock'],[w.lookups,number(data.totals.lookups),'lookup'],[w.last,data.last||'—','history']].map(([label,value,glyph])=>`<article class="panel"><span>${icon(glyph)}${esc(label)}</span><strong>${esc(value)}</strong></article>`).join('')}</section><div class="statistics-panels"><section class="panel statistics-ranking"><div class="section-header"><h2 class="panel-title">${w.perGame}</h2><small>${model.games.length} ${w.gameUnit}</small></div><div class="statistics-game-list">${model.games.length?model.games.map(g=>`<div class="statistics-game"><div class="statistics-game-heading"><span title="${esc(g.title)}">${esc(g.title)}</span><strong>${esc(duration(g.readingSeconds))}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${g.readingSeconds/max*100}%"></div></div><small>${esc(number(g.characters||0))} ${w.unit}</small></div>`).join(''):`<p class="statistics-empty">${w.noData}</p>`}</div><footer>${w.period}<br><strong>${esc(periodLabel(data.period,locale))}</strong></footer></section>${chart(data.buckets,data.period,env,'area')}${chart(data.buckets,data.period,env,'rhythm')}${(model.novels&&model.novels.length)?`<section class="panel statistics-ranking"><div class="section-header"><h2 class="panel-title">${w.novels}</h2><small>${model.novels.length} ${w.novelUnit}</small></div><div class="statistics-game-list">${model.novels.map(n=>`<div class="statistics-game"><div class="statistics-game-heading"><span title="${esc(n.title)}">${esc(n.title)}</span><strong>${esc(duration(n.seconds||0))}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${(n.seconds||0)/maxNovel*100}%"></div></div><small>${esc(number(n.characters||0))} ${w.unit}${n.author?` · ${esc(n.author)}`:''}</small></div>`).join('')}</div></section>`:''}</div>`;
}
export function statisticsHTML(data,env){const {locale,esc,heading,text}=env,w=statisticsMessages[locale];return heading(text.statistics)+`<div class="statistics-dashboard"><div class="statistics-toolbar"><div class="statistics-ranges" role="group" aria-label="${w.period}">${['year','month','week','day'].map(range=>`<button type="button" data-stat-range="${range}" aria-pressed="${range===data.period.range}">${w[range]}</button>`).join('')}</div><div class="statistics-date" data-stat-date="${esc(data.period.date)}"><button class="icon-button" data-stat-shift="-1" aria-label="${w.previous}">‹</button><details class="statistics-picker"><summary aria-label="${w.date}"><span data-period-label>${esc(periodLabel(data.period,locale))}</span></summary><div class="statistics-calendar"><div class="statistics-calendar-head"><button type="button" data-calendar-shift="-1" aria-label="${w.previous}">‹</button><strong data-calendar-month></strong><button type="button" data-calendar-shift="1" aria-label="${w.next}">›</button></div><div class="statistics-calendar-days" data-calendar-days></div></div></details><button class="icon-button" data-stat-shift="1" aria-label="${w.next}">›</button></div></div><div class="statistics-results">${statisticsResultsHTML(data,env)}</div><div id="statistics-activity"></div></div>`;}
export function bindStatistics(root,{env,onChange}={}){
 const dates=root.querySelector('[data-stat-date]'),picker=dates.querySelector('details'),trigger=picker.querySelector('summary'),label=trigger.querySelector('[data-period-label]');
 const days=picker.querySelector('[data-calendar-days]'),monthLabel=picker.querySelector('[data-calendar-month]');
 const ranges=[...root.querySelectorAll('[data-stat-range]')];
 let pending={range:ranges.find(b=>b.getAttribute('aria-pressed')==='true').dataset.statRange,date:dates.dataset.statDate},month,widthAnimation;
 const format=new Intl.DateTimeFormat(language[env.locale],{year:'numeric',month:'long'});
 const weekday=new Intl.DateTimeFormat(language[env.locale],{weekday:'short'});
 function drawCalendar(){
  monthLabel.textContent=format.format(month);
  const year=month.getFullYear(),index=month.getMonth(),start=(month.getDay()+6)%7,total=new Date(year,index+1,0).getDate();
  const today=dateKey(new Date());
  days.innerHTML=Array.from({length:7},(_,i)=>`<span>${env.esc(weekday.format(new Date(2024,0,i+1)))}</span>`).join('')
   +'<span aria-hidden="true"></span>'.repeat(start)+Array.from({length:total},(_,i)=>{
    const date=dateKey(new Date(year,index,i+1));
    return `<button type="button" data-calendar-date="${date}" aria-label="${date}" aria-pressed="${date===pending.date}" ${date===today?'aria-current="date"':''}>${i+1}</button>`;
   }).join('');
 }
 const change=selection=>{pending=selection;onChange?.(selection);};
 const updateSelection=selection=>{
  pending=selection;
  ranges.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.statRange===selection.range)));
  const previous=trigger.getBoundingClientRect().width;
  widthAnimation?.cancel();
  label.textContent=periodLabel(selection,env.locale);
  const next=trigger.getBoundingClientRect().width;
  if(Math.abs(previous-next)>1&&!matchMedia('(prefers-reduced-motion: reduce)').matches)widthAnimation=trigger.animate([{width:previous+'px'},{width:next+'px'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'});
 };
 ranges.forEach(b=>b.onclick=()=>change({range:b.dataset.statRange,date:pending.date}));
 dates.querySelectorAll('[data-stat-shift]').forEach(b=>b.onclick=()=>change(shiftPeriod(pending,Number(b.dataset.statShift))));
 trigger.addEventListener('click',()=>{if(picker.open)return;month=new Date(pending.date.slice(0,7)+'-01T12:00:00');drawCalendar();});
 picker.querySelectorAll('[data-calendar-shift]').forEach(b=>b.onclick=()=>{month.setMonth(month.getMonth()+Number(b.dataset.calendarShift));drawCalendar();});
 days.onclick=event=>{const button=event.target.closest('[data-calendar-date]');if(button){change({range:pending.range,date:button.dataset.calendarDate});picker.open=false;trigger.focus();}};
 picker.addEventListener('focusout',event=>{if(event.relatedTarget&&!picker.contains(event.relatedTarget))picker.open=false;});
 picker.addEventListener('keydown',event=>{if(event.key==='Escape'){picker.open=false;trigger.focus();}});
 root.addEventListener('pointerdown',event=>{if(!picker.contains(event.target))picker.open=false;});
 bindStatisticsCharts(root,env);return {updateSelection};
}
export function bindStatisticsCharts(root,env){
 const w=statisticsMessages[env.locale];let current=-1,owner=null;
 const state=[...root.querySelectorAll('[data-chart]')].map(panel=>({panel,kind:panel.dataset.chart,rows:JSON.parse(panel.dataset.chartRows),period:{range:panel.dataset.chartRange},stage:panel.querySelector('.chart-stage'),tooltip:panel.querySelector('.chart-tooltip')}));
 // One selection drives both charts so the same period lights up in each.
 const mark=(item,index)=>{const svg=item.stage.querySelector('svg');if(!svg)return;svg.querySelectorAll('.is-active').forEach(el=>el.classList.remove('is-active'));const cursor=svg.querySelector('.chart-cursor');if(index<0){cursor?.setAttribute('visibility','hidden');return;}
  svg.querySelector('[data-chart-index="'+index+'"]')?.classList.add('is-active');svg.querySelector('[data-bar-index="'+index+'"]')?.classList.add('is-active');
  if(cursor){const F=plotFrame('area',item.rows,Number(svg.getAttribute('width')),Number(svg.getAttribute('height')),env.locale),cx=F.x(index),cy=F.y(item.rows[index].characters);cursor.setAttribute('visibility','visible');const line=cursor.querySelector('line');line.setAttribute('x1',cx);line.setAttribute('x2',cx);const c=cursor.querySelector('circle');c.setAttribute('cx',cx);c.setAttribute('cy',cy);}};
 const select=(index,from,x,y)=>{if(!from.rows[index])return;if(current!==index){current=index;state.forEach(item=>mark(item,index));}state.forEach(item=>{if(item!==from)item.tooltip.hidden=true;});owner=from;const tip=from.tooltip;tip.innerHTML=detailHTML(from.rows[index],w,env);tip.hidden=false;const sw=from.stage.clientWidth,sh=from.stage.clientHeight;tip.style.left=Math.max(0,Math.min(x+14,sw-tip.offsetWidth))+'px';tip.style.top=Math.max(0,Math.min(y-12-tip.offsetHeight,sh-tip.offsetHeight))+'px';};
 const clear=()=>{current=-1;owner=null;state.forEach(item=>{item.tooltip.hidden=true;mark(item,-1);});};
 const bindKeys=item=>item.stage.querySelectorAll('[data-chart-index]').forEach(hit=>{const index=Number(hit.dataset.chartIndex);hit.onfocus=()=>{const box=item.stage.getBoundingClientRect(),b=hit.getBoundingClientRect();select(index,item,b.left-box.left+b.width/2,item.stage.clientHeight*.35);};hit.onblur=()=>{if(owner===item)clear();};hit.onkeydown=event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();item.stage.querySelector('[data-chart-index="'+Math.max(0,Math.min(item.rows.length-1,index+(event.key==='ArrowRight'?1:-1)))+'"]')?.focus();}};});
 const draw=item=>{const width=item.stage.clientWidth,height=item.stage.clientHeight;if(!width||!height)return;item.stage.querySelector('svg')?.remove();item.stage.insertAdjacentHTML('afterbegin',plotSVG(item.kind,item.rows,item.period,env,width,height));bindKeys(item);mark(item,current);};
 state.forEach(item=>{
  item.stage.onpointermove=event=>{const svg=item.stage.querySelector('svg');if(!svg)return;const box=svg.getBoundingClientRect(),left=plotGutter(item.rows,env.locale),sx=event.clientX-box.left;select(plotIndex(sx,left,box.width-left-PAD.right,item.rows.length),item,sx,event.clientY-box.top);};
  item.stage.onpointerleave=clear;bindKeys(item);
  if(typeof ResizeObserver==='function'){let last='';const observer=new ResizeObserver(()=>{if(!item.panel.isConnected){observer.disconnect();return;}const size=item.stage.clientWidth+'x'+item.stage.clientHeight;if(size!==last){last=size;draw(item);}});observer.observe(item.stage);}else draw(item);
 });
}
