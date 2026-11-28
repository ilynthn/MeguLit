import {sessionsView,durHTML} from './detail-sessions.js';
import {mountWords,mountSentences} from './detail-collect.js';
import {mountStory,ensureStoryStyles} from './detail-story.js';
import {loadGsap} from './gsap-loader.js';
import {attachEmbedPopover} from './embed-popover.js';
import {launchReason,launchShort,launchRestorable} from './launch-feedback.js';
import {embedStatus} from './embed-status.js';
import {originalLabel,zeroLatencyLabel,zeroActivityLabel,localeToggleHTML,bindLocaleToggle,openGameLanguage} from './game-language.js';
import {mountCnGuide} from './cn-version-guide.js';
import {mountFirstPlayer} from './first-player.js';
import {mountDetailDeveloper} from './developer.js';
import {synopsisHTML,synopsisContentHTML,bindSynopsis,missingSynopsis} from './synopsis-view.js';
import {receptionHTML,receptionMessages,bindReception} from './game-reception.js';
import {openDiagnostics,diagnosticsLabel} from './diagnostics-ui.js';
import {cardify} from './home-tv.js';
import {flipCard} from './detail-flip.js';
const labels={zh:{back:'返回',launch:'启动游戏',edit:'编辑作品',japanese:'日文原版',overview:'作品资料',sessions:'阅读记录',words:'关联单词',sentences:'收录句子',reading:'累计阅读',characters:'已读字数',source:'收录来源',
 engine:'游戏引擎',hook:'Hook 适配记录',supported:'已适配',pending:'待实测',unsupported:'未适配',executable:'启动程序',status:'作品状态',aliases:'其他名称',developer:'开发商',released:'发行日期',synopsis:'作品简介',
 refresh:'更新简介',noSynopsis:'暂无本地简介，可点击更新获取作品介绍',noItems:'还没有这项记录',last:'上次游玩',remove:'从游戏库移除',count:'次阅读',failed:'暂时无法更新简介',missing:'游戏文件不存在，请编辑启动路径'},en:{back:'Back',
 launch:'Launch game',edit:'Edit game',japanese:'Japanese original',zeroAction:'Zero latency',overview:'Game information',sessions:'Reading history',words:'Linked words',sentences:'Saved sentences',reading:'Total reading',
 characters:'Characters read',source:'Library source',engine:'Game engine',hook:'Hook compatibility record',supported:'Supported',pending:'Unverified',unsupported:'Unsupported',
 executable:'Executable',status:'Status',aliases:'Other titles',developer:'Developer',released:'Release date',synopsis:'Synopsis',refresh:'Update synopsis',noSynopsis:'No cached synopsis. Update to retrieve the game description',
 noItems:'No records yet',last:'Last played',remove:'Remove from library',count:'reading sessions',failed:'Could not update the synopsis',missing:'Game file is missing; edit its path'},
 ja:{back:'戻る',launch:'ゲームを起動',edit:'作品を編集',japanese:'日本語版',overview:'作品情報',sessions:'読書履歴',words:'関連単語',sentences:'保存した例文',reading:'累計読書',characters:'読んだ文字数',source:'登録元',engine:'ゲームエンジン',
 hook:'Hook 対応情報',supported:'対応済み',pending:'未検証',unsupported:'未対応',executable:'実行ファイル',status:'状態',aliases:'別タイトル',developer:'開発元',released:'発売日',synopsis:'あらすじ',
 refresh:'あらすじを更新',noSynopsis:'保存済みの紹介文がありません。更新すると取得します',noItems:'まだ記録がありません',last:'前回のプレイ',remove:'ライブラリから削除',count:'回の読書',failed:'紹介文を更新できませんでした',missing:'実行ファイルが見つかりません。パスを編集してください'}};
export async function renderGamePage({main,id,tab:startTab='',api,locale,text,esc,icon,cover,duration,datetime,relativeTime,number,definitions,isCurrent,onBack,onLaunch,onEdit,
 onRemove,onOriginalChanged,onForum,onLookup,toast,invoke,onJapaneseRestore}){
 ensureStoryStyles();
 /* 2026-11-13 关联单词 / 收录句子 keep their selection, filter and paging across re-renders; GSAP is warmed now so the tab intros start with the markup */
 const collect={words:{},sentences:{},story:{}};let unmount=()=>{};loadGsap().catch(()=>{});
 let activeTab='overview',loadingMetadata=true,synopsisExpanded=false;const w={...labels[locale],...({zh:{memories:'回想',flowchart:'分支图'},ja:{memories:'回想',flowchart:'分岐図'},en:{memories:'Memories',flowchart:'Flowchart'}}[locale]||{})},rw=receptionMessages[locale],data=await api('game_detail',{id,locale});
  if(!isCurrent())return;const game=data.game,info=data.info,embed=embedStatus(game,locale),hook=embed.label;
 main.innerHTML=`<div class="dtv-bg" aria-hidden="true" style="--dtv-cover:${game.cover?`url(&quot;${esc(game.cover)}&quot;)`:'none'}"><i class="dtv-glyph">${esc([...String(game.title||'')].find(c=>/[一-鿿぀-ヿ]/.test(c))||String(game.title||' ').trim().charAt(0).toUpperCase())}</i></div><div class="dtv-marks" aria-hidden="true"><i></i><i></i><i></i><i></i></div><button class="text-button detail-back" data-back><span class="back-arrow">${icon('arrow')}</span>${w.back}</button><section class="panel game-detail-hero"><div class="detail-cover tv-card tv-holo dtv-flipcard" role="button" tabindex="0" aria-pressed="false"><div class="tv-face dtv-tilt"><div class="dtv-flip"><div class="dtv-side dtv-front">${cover(game)}<i class="tv-foil"></i><i class="tv-glare"></i></div><div class="dtv-side dtv-back" aria-hidden="true"><div class="dtv-back-art"></div><i class="tv-foil"></i><i class="tv-glare"></i></div></div></div></div><div class="detail-title"><div class="detail-engine">${esc(game.engine||'—')} <span class="embed-status embed-${embed.kind}" aria-describedby="embed-pop" tabindex="0">· ${esc(hook)}</span><button type="button" class="detail-zero-indicator" data-zero-indicator title="${esc(zeroActivityLabel(locale))}" aria-label="${esc(zeroLatencyLabel(locale)+'. '+zeroActivityLabel(locale))}" aria-haspopup="dialog"><span aria-hidden="true" class="detail-zero-dot"></span><span data-zero-label>${esc(zeroLatencyLabel(locale))}</span></button></div><h1>${esc(game.title)}</h1><p class="settings-help">${w.last} · ${relativeTime(game.lastPlayedAt)}</p>${game.available?(launchReason(data.launchIssue,locale)?`<p class="settings-help detail-warn" role="status" title="${esc(launchReason(data.launchIssue,locale))}">${icon('alert','detail-warn-icon')}<span>${esc(launchShort(data.launchIssue,locale))}${launchRestorable(data.launchIssue)?` <a href="#" role="button" class="detail-warn-link" data-warn-restore>${originalLabel(locale)}</a>`:''}</span></p>`:''):`<p class="settings-help" role="status">${({zh:"游戏已删除或移动，请重新安装或选择启动程序",ja:"ゲームが削除または移動されました",en:"Game deleted or moved. Reinstall it or choose its executable."})[locale]}</p>`}<div class="detail-statistics">${[[w.reading,durHTML(game.readingSeconds,locale,true)],[w.words,number(game.learnedWords||0)],[w.characters,number(game.characters)],[w.sessions,number(data.counts.sessions)]].map(([name,value])=>`<section class="stat-card"><strong>${value}</strong><span>${name}</span></section>`).join('')}</div><div class="detail-action-strip"><div class="detail-actions"><button type="button" class="detail-launch" data-play ${game.available?'':'disabled'}><svg aria-hidden="true" viewBox="0 0 12 12" class="detail-launch-mark"><path d="M6 0c.7 3.6 2.4 5.3 6 6-3.6.7-5.3 2.4-6 6-.7-3.6-2.4-5.3-6-6 3.6-.7 5.3-2.4 6-6Z"/></svg><span>${w.launch}</span></button><button type="button" class="secondary" data-edit>${icon('edit')}${w.edit}</button><button type="button" class="detail-tool" data-language aria-haspopup="dialog" aria-label="${zeroLatencyLabel(locale)}">${w.zeroAction||zeroLatencyLabel(locale)}</button><button type="button" class="detail-tool" data-jp-restore aria-haspopup="dialog" title="${originalLabel(locale)}">${w.japanese}</button>${localeToggleHTML(locale,game.localeMode)}</div><small class="detail-locale-error" role="status"></small></div></div></section><div class="settings-page-tabs detail-tabs">${['overview','sessions','words','sentences','memories','flowchart'].map((tab,index)=>`<button type="button" data-detail-tab="${tab}" aria-selected="${index===0}">${w[tab]}</button>`).join('')}</div><div class="game-detail-content"></div>`;
  attachEmbedPopover(main.querySelector('.embed-status'),embed,esc);
  {const holo=main.querySelector('.detail-cover.tv-holo');if(holo){cardify(holo);flipCard(holo,{api,id,esc,game,locale});}}
  /* long titles shrink (down to a floor) until they fit the two-line title box; the box itself never changes size */
  {const h1=main.querySelector('.detail-title>h1'),host=main.querySelector('.detail-title');if(h1&&host){const fit=()=>{if(!h1.isConnected)return;h1.style.removeProperty('--dfit');const base=parseFloat(getComputedStyle(h1).fontSize);let size=base;while(h1.scrollHeight>h1.clientHeight+1&&size>26){size-=2;h1.style.setProperty('--dfit',size+'px');}};
   fit();document.fonts?.ready?.then(fit);if(window.ResizeObserver){let w=host.clientWidth;const ro=new ResizeObserver(()=>{if(!h1.isConnected){ro.disconnect();return;}if(Math.abs(host.clientWidth-w)>1){w=host.clientWidth;fit();}});ro.observe(host);}}}
 /* 2026-11-21 首位玩家 card (first player of an exe the engine reads, nobody has calibrated); asks the service once, never blocks */const firstPlayer=mountFirstPlayer({host:main.querySelector('.game-detail-hero'),id,api,locale,esc,isCurrent});
 /* 2026-11-21 the developer line under the title: logo, name, a small panel with VNDB's introduction and links */const devCard=mountDetailDeveloper({main,id,api,locale,esc,toast,isCurrent});
 const led=main.querySelector('[data-zero-indicator]');
 let activity,activityRequest=0,disposed=false;
 function paintActivity(value){
  if(disposed||!isCurrent())return;
  activity=value;
  const active=value?.active===true,label=zeroActivityLabel(locale,value);
  led.dataset.active=String(active);led.title=label;
  led.setAttribute('aria-label',zeroLatencyLabel(locale)+'. '+label);
  const short=({zh:['已开启','未开启'],en:['On','Off'],ja:['オン','オフ']})[locale]||['On','Off'];
  led.querySelector('[data-zero-label]').textContent=zeroLatencyLabel(locale)+(value?' · '+short[active?0:1]:'');
  const row=main.querySelector('[data-detail-zero-status] span:last-child');
  if(row)row.textContent=label;
 }
 async function refreshZero(){
  const serial=++activityRequest;
  try{const value=await api('text_source_activity',{id});if(serial===activityRequest)paintActivity(value);}
  catch{if(serial===activityRequest)paintActivity(null);}
 }
 const openOriginal=()=>onJapaneseRestore?.({id,title:game.title,onActivity:refreshZero,onChanged:onOriginalChanged});
 const openZero=()=>openGameLanguage({id,title:game.title,api,invoke,locale,esc,onOriginal:openOriginal,onActivity:value=>{++activityRequest;paintActivity(value);}});
 /* The guide and launch warning must still lead to the Japanese executable and restore actions. */
 mountCnGuide({host:main.querySelector('.game-detail-hero'),id,api,locale,esc,toast,isCurrent,onChanged:onOriginalChanged,openLanguage:openOriginal});
 bindLocaleToggle(main,{id,api,locale});
 led.onclick=openZero;main.querySelector('[data-language]').onclick=openZero;
 main.querySelector('[data-back]').onclick=onBack;main.querySelector('[data-edit]').onclick=()=>onEdit(id);
 const originalButton=main.querySelector('[data-jp-restore]'),warning=main.querySelector('[data-warn-restore]');
 if(originalButton)originalButton.onclick=openOriginal;
 if(warning)warning.onclick=event=>{event.preventDefault();openOriginal();};
 main.querySelector('[data-play]').onclick=event=>onLaunch(id,event.currentTarget);
 window.addEventListener('focus',refreshZero);
 void refreshZero();
 const target=main.querySelector('.game-detail-content'),row=(title,value)=>`<div class="detail-info-row"><span>${title}</span><span>${esc(Array.isArray(value)?value.join(' / '):value||'—')}</span></div>`;
 const sourceKey='megulit-synopsis-source:'+locale+':'+id;
 let sourceOverride='';
 try{const saved=localStorage.getItem(sourceKey);if(saved==='bangumi'||saved==='moegirl'||saved==='vndb')sourceOverride=saved;}catch{}
 const preferredSource=()=>sourceOverride||data.synopsisChoices?.preferred||(locale==='zh'?'moegirl':'vndb');
 function mountSynopsis(){
  const panel=target.querySelector('.synopsis-panel'),content=panel.querySelector('.synopsis-content');
  const select=panel.querySelector('[data-synopsis-source]');
  let disconnect=()=>{};
  const render=()=>{
   disconnect();
   const synopsis=sourceOverride?(data.synopsisChoices?.[sourceOverride]||{}):data.synopsis;
   const placeholder=loadingMetadata?rw.loading:sourceOverride?missingSynopsis(locale):rw.noSynopsis;
   panel.classList.toggle('is-expanded',synopsisExpanded);
   panel.classList.toggle('is-collapsed',!synopsisExpanded);
   content.innerHTML=synopsisContentHTML(synopsis,{locale,esc,placeholder,expanded:synopsisExpanded});
   disconnect=bindSynopsis(panel,locale,expanded=>synopsisExpanded=expanded);
  };
  select.onchange=()=>{
   sourceOverride=select.value;
   try{localStorage.setItem(sourceKey,sourceOverride);}catch{}
   render();
  };
  render();
  return ()=>disconnect();
 }

 function show(tab){const order=['overview','sessions','words','sentences','memories','flowchart'],dir=Math.sign(order.indexOf(tab)-order.indexOf(activeTab)),changed=tab!==activeTab;activeTab=tab;unmount();unmount=()=>{};requestAnimationFrame(()=>{firstPlayer?.place(tab);devCard?.place(tab);});
  /* E266 sliding tab bar + directional content swap */requestAnimationFrame(()=>{const tabs=main.querySelector('.detail-tabs'),on=tabs?.querySelector('[aria-selected="true"]');
  if(!tabs||!on)return;let bar=tabs.querySelector('.detail-tab-bar');if(!bar){bar=document.createElement('span');bar.className='detail-tab-bar';bar.setAttribute('aria-hidden',
  'true');tabs.append(bar);bar.style.transition='none';}bar.style.width=on.offsetWidth+'px';bar.style.transform='translateX('+on.offsetLeft+'px)';if(bar.style.transition==='none')requestAnimationFrame(()=>{
  bar.style.transition='';});});if(changed&&!matchMedia('(prefers-reduced-motion: reduce)').matches)queueMicrotask(()=>{target.animate([{opacity:0,transform:'translateX('+(dir*18)+'px)'},
  {opacity:1,transform:'none'}],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)'});});main.querySelectorAll('[data-detail-tab]').forEach(button=>button.setAttribute('aria-selected',
  String(button.dataset.detailTab===tab)));
  if(tab==='overview'){target.innerHTML=`<div class="detail-overview"><div class="detail-main">${synopsisHTML({locale,esc,icon,title:w.synopsis,refresh:w.refresh,source:preferredSource()})}${receptionHTML(data.reception,locale,esc,id)}</div><aside class="detail-aside"><details class="panel detail-technical" open><summary>${rw.technical}</summary>${row(w.aliases,info.names)}${row(w.engine,game.engine)}${row(w.hook,hook)}<div class="detail-info-row" data-detail-zero-status><span>${zeroLatencyLabel(locale)}</span><span>${esc(zeroActivityLabel(locale,activity))}</span></div>${row(w.source,info.source)}${info.appid?row('Steam App ID',info.appid):''}${info.vndbId?row('VNDB',info.vndbId):''}${info.developer?row(w.developer,info.developer):''}${info.released?row(w.released,info.released):''}${row(w.executable,info.executable)}</details><button class="text-button detail-forum" data-forum>${icon('lookup')}${esc(({zh:'这部作品的讨论',ja:'この作品の話題',en:'Discussions of this game'})[locale]||'这部作品的讨论')}</button><button class="text-button" data-story-entry>${esc(w.flowchart)}</button><button class="text-button detail-diag" data-diag>${icon('copy')}${esc(diagnosticsLabel(locale))}</button><button class="text-button detail-remove" data-remove>${icon('trash')}${w.remove}</button></aside></div>`;
   target.querySelector('[data-story-entry]').onclick=()=>show('flowchart');unmount=mountSynopsis();bindReception(target,{api,id,locale,esc,value:data.reception});target.querySelector('[data-remove]').onclick=()=>onRemove(id);
   target.querySelector('[data-forum]').onclick=()=>onForum?.(game);target.querySelector('[data-diag]').onclick=()=>openDiagnostics({api,id,locale,esc,toast}).catch(()=>{
   });target.querySelector('[data-refresh]').onclick=()=>enrich(true).catch(()=>toast(w.failed));target.querySelectorAll('[data-source-url]').forEach(button=>button.onclick=()=>api('open_source',
   {url:button.dataset.sourceUrl}).catch(()=>toast(w.failed)));return;}
  if(tab==='sessions'){target.innerHTML=sessionsView(data.sessions,{locale,esc,number,duration});return;}
  if(tab==='memories'||tab==='flowchart'){unmount=mountStory(target,{api,gameId:id,locale,esc,mode:tab==='flowchart'?'graph':'memories',state:collect.story,onGraph:()=>show('flowchart')});return;}
  const launch=button=>onLaunch(id,button),lookup=word=>{if(word)onLookup?.(word);};
  if(tab==='words'){unmount=mountWords(target,{words:data.words,counts:data.counts?.words,locale,esc,state:collect.words,animate:changed,onLookup:onLookup?lookup:null,onLaunch:launch,canLaunch:!!game.available});return;}
  if(tab==='sentences'){unmount=mountSentences(target,{sentences:data.sentences,locale,esc,state:collect.sentences,animate:changed,api,gameId:id,toast,onLaunch:launch,canLaunch:!!game.available,onRemoved:sid=>{
   data.sentences=data.sentences.filter(s=>s.id!==sid);if(data.counts)data.counts.sentences=Math.max(0,(data.counts.sentences||1)-1);if(isCurrent()&&activeTab==='sentences')show('sentences');}});return;}
  const items=data[tab];target.innerHTML=items.length?`<section class="record-list">${items.map(item=>tab==='sessions'?`<article class="record"><div class="record-meta"><span>${datetime(item.started_at)}</span><span>${duration(item.active_seconds)}</span></div><p>${number(item.characters)} ${text.characters} · ${number(item.sentences)} ${text.sentenceCount}</p></article>`:tab==='words'?`<article class="record"><div class="word-spelling">${esc(item.spelling)}</div><div class="word-reading">${esc(item.reading)}</div><div class="word-def">${esc(definitions(item.definitions))}</div></article>`:`<article class="record"><div class="record-meta">${datetime(item.created_at)}</div><p>${esc(item.text)}</p>${item.translation?`<p class="muted">${esc(item.translation)}</p>`:''}</article>`).join('')}</section>`:`<div class="empty-state"><p>${w.noItems}</p></div>`;
 }
 async function enrich(refresh=false){const result=await api('game_enrich',{id,locale,refresh});if(!isCurrent())return;Object.assign(data,result);Object.assign(info,
  result.info||{});loadingMetadata=false;const coverArea=main.querySelector('.detail-cover');if(coverArea&&result.game?.cover){const face=coverArea.querySelector('.dtv-front')||coverArea.querySelector('.tv-face');
  if(face){face.querySelectorAll(':scope>:not(.tv-foil):not(.tv-glare)').forEach(n=>n.remove());face.insertAdjacentHTML('afterbegin',cover(result.game));}else coverArea.innerHTML=cover(result.game);
  }const restoreSynopsisFocus=document.activeElement?.matches('[data-synopsis-source]')&&target.contains(document.activeElement);
  show(activeTab);
  if(restoreSynopsisFocus)target.querySelector('[data-synopsis-source]')?.focus({preventScroll:true});
 }
 main.querySelectorAll('[data-detail-tab]').forEach(button=>button.onclick=()=>show(button.dataset.detailTab));show(['sessions','words','sentences','memories','flowchart'].includes(startTab)?startTab:'overview');enrich().catch(()=>{if(isCurrent()){
  loadingMetadata=false;data.reception??={at:Date.now(),reviews:[]};show(activeTab);}});
 return ()=>{disposed=true;window.removeEventListener('focus',refreshZero);firstPlayer?.dispose?.();devCard?.dispose?.();unmount();};
}
