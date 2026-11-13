// SPDX-License-Identifier: GPL-3.0-or-later
/* E362 adaptation overview, option C 魔导书目录 (user pick 2026-11-13, judges 8.6 / 8.5).
   One row per library game with reading / embed / zero-latency states. Games that need work sort first and say why
   under their title; one tally line per column names every state that is not plain 正常 in the same words the rows
   use; a red block counts the games that need work and filters to them. Colour is state only: grey works, gold is a
   fallback or not yet verified (hollow gold = a fallback), red needs work, hollow grey = not tested.
   Scanning / uploading belongs to the probe pipeline: the row button and the scan button only call probe-hook.js. */
import {embedStatus} from './embed-status.js';
import {requestProbe} from './probe-hook.js';
const T={
 zh:{button:'适配总览',title:'适配总览',search:'搜索游戏或引擎',sort:'排序',sorts:{need:'要处理的在前',seen:'上次运行',title:'名称',engine:'引擎'},
  cols:{game:'游戏',reading:'读取',embed:'内嵌',zero:'零延迟',seen:'上次运行'},hidden:'含隐藏',hiddenTag:'已隐藏',close:'关闭',
  need:n=>`款要处理`,needTitle:'只看要处理的游戏',scanAll:n=>`扫描这 ${n} 款`,scan:'扫描本机',scanTitle:'在本机检查这个游戏，确认后再决定要不要上传',
  meta:(n,at)=>`${n} 款 · ${at} 更新`,okOf:(ok,n,names)=>`/ ${n} ${names}`,never:'从未',empty:'没有符合条件的游戏',clear:'清除筛选',failed:'总览加载失败',
  launch:'上次启动停在',stream:'文本流',chars:'已读字数',stages:{['new-window-ready']:'游戏窗口已出现',['game-process-seen']:'游戏进程已启动',['launch-process-started']:'启动程序已运行',['launch-request']:'刚发出启动'},
  reading:{reads:'能读取',['no-text']:'没读到',missing:'找不到程序',untested:'未测'},
  embed:{verified:'可内嵌',supported:'待验证',pending:'未测',readonly:'内嵌失败',unsupported:'引擎不支持',unknown:'未测'},
  zero:{patch:'汉化就绪',['patch-unreliable']:'汉化不匹配',['patch-removed']:'汉化已移除',machine:'提前机翻',['needs-japanese']:'需日文原版',preparing:'读剧本中',none:'无法读剧本',unknown:'未测'},
  why:{missing:'游戏程序可能被移动或删除了；到详情页重新指定',['no-text']:'启动过，但没读到游戏文字',readonly:'文字只能读取，不能内嵌',unsupported:'这个引擎还不支持内嵌',['needs-japanese']:'装的是中文版；零延迟需要日文原版',['patch-unreliable']:'找到的汉化和剧本对不上',none:'这个引擎的剧本还读不了'}},
 ja:{button:'対応状況一覧',title:'対応状況一覧',search:'ゲーム名やエンジンで検索',sort:'並べ替え',sorts:{need:'要対応を先頭に',seen:'最後の起動',title:'名前',engine:'エンジン'},
  cols:{game:'ゲーム',reading:'読み取り',embed:'埋め込み',zero:'ゼロ遅延',seen:'最後の起動'},hidden:'非表示も含む',hiddenTag:'非表示',close:'閉じる',
  need:n=>`本が要対応`,needTitle:'要対応のゲームだけ表示',scanAll:n=>`この ${n} 本をスキャン`,scan:'この PC でスキャン',scanTitle:'この PC でゲームを調べ、確認してから送るか決めます',
  meta:(n,at)=>`${n} 本 · ${at} 更新`,okOf:(ok,n,names)=>`/ ${n} ${names}`,never:'なし',empty:'条件に合うゲームはありません',clear:'絞り込みを解除',failed:'一覧を読み込めませんでした',
  launch:'最後の起動の到達点',stream:'テキストストリーム',chars:'読んだ文字数',stages:{['new-window-ready']:'ゲームのウィンドウが出た',['game-process-seen']:'ゲームのプロセスが起動',['launch-process-started']:'起動プログラムが動いた',['launch-request']:'起動を要求した'},
  reading:{reads:'読み取り可',['no-text']:'取得できず',missing:'プログラムなし',untested:'未テスト'},
  embed:{verified:'埋め込み可',supported:'未検証',pending:'未テスト',readonly:'埋め込み失敗',unsupported:'エンジン非対応',unknown:'未テスト'},
  zero:{patch:'翻訳あり',['patch-unreliable']:'翻訳が合わない',['patch-removed']:'翻訳を外した',machine:'先行機械翻訳',['needs-japanese']:'日本語版が必要',preparing:'スクリプト読み込み中',none:'スクリプト非対応',unknown:'未テスト'},
  why:{missing:'ゲームのプログラムが移動または削除された可能性があります。詳細画面で指定し直してください',['no-text']:'起動したが、ゲームの文字を取得できませんでした',readonly:'文字は読み取れますが、埋め込めません',unsupported:'このエンジンはまだ埋め込みに対応していません',['needs-japanese']:'中国語版です。ゼロ遅延には日本語版が必要です',['patch-unreliable']:'見つかった翻訳がスクリプトと一致しません',none:'このエンジンのスクリプトはまだ読めません'}},
 en:{button:'Adaptation overview',title:'Adaptation overview',search:'Search games or engines',sort:'Sort',sorts:{need:'Needs work first',seen:'Last run',title:'Title',engine:'Engine'},
  cols:{game:'Game',reading:'Reading',embed:'Embed',zero:'Zero-latency',seen:'Last run'},hidden:'Include hidden',hiddenTag:'Hidden',close:'Close',
  need:n=>n===1?'game needs work':'games need work',needTitle:'Show only games that need work',scanAll:n=>`Scan these ${n}`,scan:'Scan on this PC',scanTitle:'Check this game on this PC; you decide whether to upload after seeing the result',
  meta:(n,at)=>`${n} games · updated ${at}`,okOf:(ok,n,names)=>`/ ${n} ${names}`,never:'never',empty:'No games match',clear:'Clear filter',failed:'Could not load the overview',
  launch:'Last launch reached',stream:'Text stream',chars:'Characters read',stages:{['new-window-ready']:'game window shown',['game-process-seen']:'game process started',['launch-process-started']:'launcher started',['launch-request']:'launch requested'},
  reading:{reads:'Reads text',['no-text']:'No text',missing:'Program missing',untested:'Not tested'},
  embed:{verified:'Embeds',supported:'Unverified',pending:'Not tested',readonly:'Embed failed',unsupported:'Engine unsupported',unknown:'Not tested'},
  zero:{patch:'Translation ready',['patch-unreliable']:'Patch mismatch',['patch-removed']:'Patch removed',machine:'Machine ahead',['needs-japanese']:'Needs Japanese build',preparing:'Reading script',none:'Script unreadable',unknown:'Not tested'},
  why:{missing:'The game program may have been moved or deleted; set it again on the game page',['no-text']:'Launched, but no game text was read',readonly:'Text can be read but not embedded',unsupported:'This engine cannot be embedded yet',['needs-japanese']:'This is a Chinese build; zero-latency needs the Japanese one',['patch-unreliable']:'The Chinese patch found does not match the script',none:'This engine\'s script cannot be read yet'}}};
export const overviewLabel=locale=>(T[locale]||T.en).button;
/* ok = works, part = works but not the best way (hollow when it is a fallback), wait = not tested yet, bad = needs work */
export const TONE={reads:'ok','no-text':'bad',missing:'bad',untested:'wait',verified:'ok',supported:'part',pending:'wait',readonly:'bad',unsupported:'bad',unknown:'wait',patch:'ok','patch-unreliable':'bad','patch-removed':'part',machine:'part','needs-japanese':'bad',preparing:'wait',none:'bad'};
export const FALLBACK=new Set(['machine','patch-removed']);
const KEYS=[['reading','reading'],['embedKind','embed'],['zeroLatency','zero']];
const ORDER={ok:0,bad:1,part:2,wait:3};
export const needsWork=g=>KEYS.some(([k])=>TONE[g[k]]==='bad');
export const sortByNeed=(a,b)=>(needsWork(b)-needsWork(a))||(b.lastSeenAt||0)-(a.lastSeenAt||0);
/* the reason under a title: what blocks, in the order a session meets it (read → embed → zero-latency), at most two */
export const reasonFor=(g,why)=>KEYS.map(([k])=>g[k]).filter(v=>TONE[v]==='bad'&&why[v]).slice(0,2).map(v=>why[v]).join('；');
const pad=n=>String(n).padStart(2,'0');
const mark=(v,t)=>t==='bad'||t==='ok'||(t==='part'&&!FALLBACK.has(v))?'solid':'hollow';
export async function openAdaptationOverview({api,locale,esc,toast,relativeTime,onOpenGame}){
 const t=T[locale]||T.en,dialog=document.createElement('dialog');dialog.className='game-dialog adapt-dialog';
 let rows=[],pick=null,sort='need',query='',hidden=false,updated='';
 dialog.innerHTML=`<header class="adapt-top"><h2>${esc(t.title)}</h2><span class="adapt-meta" data-meta></span><button type="button" class="adapt-close" data-close aria-label="${esc(t.close)}" title="${esc(t.close)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button></header>
<div class="adapt-tally" data-tally></div>
<div class="adapt-tools"><button type="button" class="adapt-need" data-need aria-pressed="false" title="${esc(t.needTitle)}"><b data-need-n>00</b><span data-need-label></span></button><button type="button" class="adapt-scan" data-scan-all hidden></button><input type="search" class="adapt-search" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}"><button type="button" class="adapt-clear" data-clear hidden>${esc(t.clear)}</button><label class="adapt-sort"><span>${esc(t.sort)}</span><select data-sort>${Object.entries(t.sorts).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></label><label class="adapt-hidden"><input type="checkbox" data-hidden> ${esc(t.hidden)}</label></div>
<div class="adapt-scroll"><div class="adapt-grid adapt-head" aria-hidden="true"><span></span><span>${esc(t.cols.game)}</span><span>${esc(t.cols.reading)}</span><span>${esc(t.cols.embed)}</span><span>${esc(t.cols.zero)}</span><span>${esc(t.cols.seen)}</span><span></span></div><div class="adapt-list" role="list" aria-busy="true"></div></div>`;
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 const $=s=>dialog.querySelector(s),list=$('.adapt-list');
 $('[data-close]').onclick=()=>dialog.close();
 const derive=g=>{const embed=embedStatus(g,locale);return {...g,embed,embedKind:embed.kind,reading:g.available===false?'missing':g.reading};};
 const label=(col,v)=>t[col][v]||v;
 const evidence=g=>{const e=g.evidence||{},out=[];if(e.launch)out.push(`${t.launch}: ${t.stages[e.launch.stage]||e.launch.stage}`);const s=e.hookStream||(e.hookVerifiedStream?{name:e.hookVerifiedStream}:null);if(s?.name)out.push(`${t.stream}: ${s.name}`);if(e.characters)out.push(`${t.chars}: ${e.characters}`);return out.join('\n');};
 const matches=g=>{if(!hidden&&g.hidden)return false;if(query&&!(g.title+' '+g.engine).toLowerCase().includes(query))return false;if(!pick)return true;if(pick.need)return needsWork(g);const v=g[pick.key];return pick.tone?TONE[v]===pick.tone:pick.values.includes(v);};
 const compare={need:sortByNeed,seen:(a,b)=>(b.lastSeenAt||0)-(a.lastSeenAt||0),title:(a,b)=>a.title.localeCompare(b.title,locale),engine:(a,b)=>(a.engine||'~').localeCompare(b.engine||'~')||a.title.localeCompare(b.title,locale)};
 const same=(a,b)=>!!a&&!!b&&a.key===b.key&&a.tone===b.tone&&String(a.values)===String(b.values)&&!!a.need===!!b.need;
 /* one tally per column: "能读取 9 / 16", a bar with one segment per tone (red, gold, grey after the normal one),
    then two fixed lines — what blocks, and the rest — each naming the state the rows use; segments and names filter */
 function tally(pool){
  return KEYS.map(([key,col])=>{
   const byLabel=new Map();for(const g of pool){const v=g[key],l=label(col,v),e=byLabel.get(l)||{values:[],n:0,tone:TONE[v]||'wait',hollow:false};if(!e.values.includes(v))e.values.push(v);e.n++;e.hollow=e.hollow||mark(v,e.tone)==='hollow';byLabel.set(l,e);}
   const entries=[...byLabel].sort((a,b)=>ORDER[a[1].tone]-ORDER[b[1].tone]||b[1].n-a[1].n),ok=entries.filter(([,e])=>e.tone==='ok'),okN=ok.reduce((s,[,e])=>s+e.n,0);
   const tones=['ok','bad','part','wait'].map(tone=>[tone,entries.filter(([,e])=>e.tone===tone).reduce((s,[,e])=>s+e.n,0)]).filter(([,n])=>n);
   const item=([l,e])=>{const p={key,values:e.values};return `<button type="button" data-pick='${esc(JSON.stringify(p))}' aria-pressed="${same(pick,p)}"><i data-t="${e.tone}"${e.hollow?' data-hollow':''}></i>${esc(l)} <b>${e.n}</b></button>`;};
   return `<div class="adapt-tl"><h3>${esc(t.cols[col])}<span><b>${okN}</b>${esc(t.okOf(okN,pool.length,ok.map(([l])=>l).join('、')))}</span></h3><div class="adapt-segs">${tones.map(([tone,n])=>{const p={key,tone};return `<button type="button" class="adapt-seg" style="--n:${n}" data-t="${tone}" data-pick='${esc(JSON.stringify(p))}' aria-pressed="${same(pick,p)}" aria-label="${esc(t.cols[col]+' '+n)}"></button>`;}).join('')}</div><div class="adapt-keys"><span>${entries.filter(([,e])=>e.tone==='bad').map(item).join('')}</span><span>${entries.filter(([,e])=>e.tone==='part'||e.tone==='wait').map(item).join('')}</span></div></div>`;
  }).join('');
 }
 const cell=(col,v)=>{const tone=TONE[v]||'wait';return `<span class="adapt-s" data-t="${tone}"${mark(v,tone)==='hollow'?' data-hollow':''}>${esc(label(col,v))}</span>`;};
 function render(){
  const pool=rows.filter(g=>hidden||!g.hidden),bad=pool.filter(needsWork);
  $('[data-meta]').textContent=t.meta(pool.length,updated);
  $('[data-tally]').innerHTML=tally(pool);
  $('[data-need-n]').textContent=pad(bad.length);$('[data-need-label]').textContent=t.need(bad.length);
  $('[data-need]').setAttribute('aria-pressed',String(!!pick?.need));
  const scanAll=$('[data-scan-all]');scanAll.hidden=!bad.length;scanAll.textContent=t.scanAll(bad.length);
  $('[data-clear]').hidden=!pick;
  const visible=pool.filter(matches).sort(compare[sort]);
  list.innerHTML=visible.length?visible.map((g,i)=>{const need=needsWork(g),why=need?reasonFor(g,t.why):'';return `<div class="adapt-grid adapt-row${need?' need':''}" role="listitem"><span class="adapt-n">${pad(i+1)}</span><button type="button" class="adapt-open" data-open="${esc(g.id)}" title="${esc(evidence(g))}"><span><strong>${esc(g.title)}</strong><small>${esc(g.engine||'—')}${g.hidden?` · ${esc(t.hiddenTag)}`:''}</small></span>${why?`<em>${esc(why)}</em>`:''}</button>${cell('reading',g.reading)}${cell('embed',g.embedKind)}${cell('zero',g.zeroLatency)}<span class="adapt-seen">${g.lastSeenAt?esc(relativeTime(Math.floor(g.lastSeenAt/1000))):esc(t.never)}</span><button type="button" class="adapt-probe" data-probe="${esc(g.id)}" title="${esc(t.scanTitle)}">${esc(t.scan)}</button></div>`;}).join(''):`<p class="adapt-empty">${esc(t.empty)}</p>`;
 }
 /* the probe pipeline calls onDone(result) when a scan finishes; the overview then reloads its rows */
 const probe=ids=>requestProbe({ids,source:'overview',api,locale,esc,toast,onDone:()=>reload()});
 dialog.addEventListener('click',e=>{
  const p=e.target.closest('[data-pick]');if(p){const next=JSON.parse(p.dataset.pick);pick=same(pick,next)?null:next;render();return;}
  const o=e.target.closest('[data-open]');if(o){dialog.close();onOpenGame(o.dataset.open);return;}
  const d=e.target.closest('[data-probe]');if(d){probe([d.dataset.probe]);return;}
 });
 $('[data-need]').onclick=()=>{pick=pick?.need?null:{need:true};render();};
 $('[data-scan-all]').onclick=()=>probe(rows.filter(g=>(hidden||!g.hidden)&&needsWork(g)).map(g=>g.id));
 $('[data-clear]').onclick=()=>{pick=null;render();};
 $('[data-sort]').onchange=e=>{sort=e.target.value;render();};
 $('[data-hidden]').onchange=e=>{hidden=e.target.checked;render();};
 let timer=0;$('.adapt-search').oninput=e=>{clearTimeout(timer);timer=setTimeout(()=>{query=e.target.value.trim().toLowerCase();render();},120);};
 const load=async()=>{const data=await api('adaptation_overview',{});rows=data.games.map(derive);updated=new Date(data.generatedAt||Date.now()).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'});};
 const reload=async()=>{if(!dialog.isConnected)return;try{await load();}catch{return;}if(dialog.isConnected)render();};
 try{await load();}catch{if(dialog.isConnected){dialog.close();toast(t.failed);}return;}
 if(!dialog.isConnected)return;list.removeAttribute('aria-busy');render();playIntro(dialog);
}
/* Opening, one authored moment (timeline built like a GSAP one, run on the Web Animations API so web/ needs no
   library): the panel wipes open, the tally bars grow, rows settle in a short stagger, the red count steps up and
   hits once. transform / opacity / clip-path only; skipped under prefers-reduced-motion. */
function playIntro(dialog){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||typeof dialog.animate!=='function')return;
 const EASE='cubic-bezier(.16,1,.3,1)',at=(el,frames,delay,duration=420)=>el.animate(frames,{duration,delay,easing:EASE,fill:'backwards'});
 at(dialog,[{clipPath:'inset(48% 0 48% 0)'},{clipPath:'inset(0 0 0 0)'}],0,480);
 dialog.querySelectorAll('.adapt-seg').forEach((el,i)=>at(el,[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],150+i*30,480));
 [...dialog.querySelectorAll('.adapt-row')].slice(0,12).forEach((el,i)=>at(el,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],180+i*35,380));
 const n=dialog.querySelector('[data-need-n]'),target=Number(n?.textContent)||0;if(!n||!target)return;
 const start=performance.now()+200,step=now=>{const k=Math.min(1,Math.max(0,(now-start)/600)),v=Math.round(target*(1-Math.pow(1-k,2)));n.textContent=pad(v);if(k<1)requestAnimationFrame(step);else n.animate([{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:350,easing:'cubic-bezier(.34,1.8,.64,1)'});};
 n.textContent=pad(0);requestAnimationFrame(step);
}
