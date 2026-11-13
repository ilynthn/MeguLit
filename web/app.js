import {fitLibraryGrid} from './library-grid-fit.js';
import {definitionHtml} from './dictionary-format.js';
import './primary-buttons.js';
import {embedStatus} from './embed-status.js';
import {statisticsHTML,statisticsResultsHTML,bindStatistics,bindStatisticsCharts} from './statistics-view.js';
import {renderActivity} from './learning-activity.js';
import {mountStatistics} from './statistics-grimoire.js';
import {mountHistoryTranslations} from './history-translation.js';
import {updateHomeOverview,createHomeRefresh} from './home-refresh.js';
import {recentGames} from './home-library.js';
import {renderHomeTV,homeTVSignature} from './home-tv.js';
import {historyHTML} from './history-view.js';
import {readTime} from './read-time.js';
import {createSeriesLibrary} from './series-library.js';
import {createLibraryRefresh} from './library-refresh.js';
import {mountSettingsAutosave,leaveSettings,flushSettings} from './settings-autosave.js';
// SPDX-License-Identifier: GPL-3.0-or-later
import {messages,locales} from './i18n.js';
import {icon} from './icons.js';
import {enhanceSelects} from './select-control.js';
import {renderAnkiReview} from './anki-review.js';
import {createHomeMotion} from './home-motion.js';
import {renderGamePage} from './game-detail.js';
import {words as grimoireWords,paintGlow,stopGlow,setupMarquees,fitShelf,placeGreeting,closeDialog,toolsHTML,dockPageTools,pageEnter,subpageEnter,watchHomeFade,
 matchJacket,fieldify,stopField,moveTabInk} from './grimoire.js';
import {aboutHTML,aboutLabel,mountAbout,VERSION} from './about.js';
import {dailyLabel,mountDaily} from './daily-view.js';
import {mountDevNotice,openGuide,openFeedback} from './feedback-ui.js';
import {openAdaptationOverview,overviewLabel} from './adaptation-overview.js';
import {checkForUpdates} from './update-notice.js';
import {leaderboardLabel,mountLeaderboard,setView as setLeaderboardView} from './leaderboard-view.js';
import {setForumFilter} from './forum-view.js';
import {maybeFirstRun} from './first-run.js';
let selectedGameId='',gameOrigin='library',selectedSeriesId='';
import {renderSettings} from './settings.js';
import {openProfilePanel} from './profile-panel.js';
import {avatarHTML} from './leaderboard-view.js';
import {openBackgroundCrop,backgroundGeometry} from './background-crop.js';

const app=document.querySelector('#app');
let model={games:[],stats:{readingSeconds:0,words:0,lookups:0},preferences:{language:'zh',accent:'#ad1539'}};
let stopHistoryTranslations=()=>{};
let pendingLookup='';/* E415 日报 hot word → 学习 › 查词 */
let route='home',subtab='',search='',pageToken=0,toastTimer;
let pendingDictionaryQuery=''; /* 学习 → 句子: a word clicked there opens the dictionary on it */
/* v1.1.6 (user: coming back to Settings started from scratch): the last section is remembered, also across restarts */
let settingsSection=(()=>{try{return localStorage.getItem('megulit-settings-section')||'';}catch{return '';}})(),settingsProfile='';
const LIBRARY_WALL_KEY='tome-library-wall';
let libraryBusy=false,navigationTicket=0;
const libraryCopy=()=>({zh:{refresh:'刷新游戏库',settings:'游戏库设置',done:'游戏库已刷新',added:n=>'已发现 '+n+' 个新游戏'},en:{refresh:'Refresh library',settings:'Library settings',
 done:'Library refreshed',added:n=>'Found '+n+' new games'},ja:{refresh:'ライブラリを更新',settings:'ライブラリ設定',done:'ライブラリを更新しました',added:n=>n+' 件の新しいゲームを追加'}}[locale]);
function libraryBusyState(busy){libraryBusy=busy;const button=document.querySelector('#refresh-library');if(button){button.disabled=busy;button.setAttribute('aria-busy',
 String(busy));}}
const refreshLibrary=createLibraryRefresh({api:(...args)=>api(...args),onBusy:libraryBusyState,onUpdated:next=>{model=next;if(route==='library')renderGames();else if(route==='home')home();
 }});

let locale='zh',text=messages.zh;
let homeImageDimensions=null,backgroundPreview=null,currentBackgroundSrc='',backgroundRequest=0,backgroundEditRequest=0;
function placeBackground(){const layer=document.querySelector('.app-backdrop');if(!layer||!homeImageDimensions)return;const crop=backgroundPreview?.crop||model.background?.crop||{
 },g=backgroundGeometry(homeImageDimensions,crop,{width:innerWidth,height:innerHeight},model.background?.blur||0);layer.style.setProperty('--home-image-position',
 `${g.ox}px ${g.oy}px`);layer.style.setProperty('--home-image-size',`${Math.ceil(g.dw)}px ${Math.ceil(g.dh)}px`);}
/* v1.1.0: with no picture of the user's own, the bundled default follows the light/dark theme */
const defaultBackground=()=>document.documentElement.dataset.theme==='light'?'assets/default-background-light.webp':'assets/default-background-dark.webp';let backgroundIsDefault=false;
 const themeBackground=()=>{if(backgroundIsDefault)applyBackground('');};
/* E274 (user: some pictures would not become the background): a picture over ~1.5 MB becomes a data: URL over 2 MB,
   which CSS url() refuses (the crop window's <img> still showed it). Hand CSS a blob: URL of the same bytes instead. */
let cssBlob={src:'',url:''};
function cssImage(src){if(typeof src!=='string'||!src.startsWith('data:')||src.length<1500000)return src;if(cssBlob.src===src)return cssBlob.url;
 const comma=src.indexOf(','),mime=(src.slice(5,comma).split(';')[0])||'image/jpeg',bin=atob(src.slice(comma+1)),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;
  i++)bytes[i]=bin.charCodeAt(i);
 const url=URL.createObjectURL(new Blob([bytes],{type:mime})),old=cssBlob.url;cssBlob={src,url};if(old)setTimeout(()=>URL.revokeObjectURL(old),10000);return url;
  }
async function applyBackground(image){const revision=++backgroundRequest;backgroundIsDefault=!image&&!backgroundPreview&&!!model.preferences.homeBackground;if(backgroundIsDefault)image=defaultBackground();
 if(!model.preferences.homeBackground&&!backgroundPreview)image='';const layer=document.querySelector('.app-backdrop');if(!layer)return false;if(!image){layer.style.setProperty('--home-image',
 'none');homeImageDimensions=null;if(!backgroundPreview)currentBackgroundSrc='';return true;}try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;
 img.onerror=reject;img.src=image;});if(revision!==backgroundRequest||!layer.isConnected)return false;layer.style.setProperty('--home-image',`url("${cssImage(image)}")`);
 homeImageDimensions=[img.naturalWidth,img.naturalHeight];if(!backgroundPreview)currentBackgroundSrc=image;placeBackground();return true;}catch{return false;}}

addEventListener('resize',placeBackground);
addEventListener('tome-background-preview',event=>{const next={...model.background,crop:{...model.background?.crop}};for(const[key,value]of Object.entries(event.detail||{
 })){if(key.startsWith('crop.'))next.crop[key.slice(5)]=value;else next[key]=value;}model.background=next;setAppearance();});
async function editHomeBackground(path=null){
 const ticket=++backgroundEditRequest;
 try{
  const previousImage=currentBackgroundSrc;
  // Reopen the very image painted behind the editor; never replace it with a legacy fallback.
  const src=path?await api('asset_preview',{path}):currentBackgroundSrc||await api('background');
  if(ticket!==backgroundEditRequest)return;
  if(!src){toast({zh:'请先选择背景图片',en:'Choose a background image first',ja:'先に背景画像を選択してください'}[locale]);return;}
  openBackgroundCrop({src,crop:path?{x:50,y:50,zoom:1}:model.background?.crop,blur:model.background?.blur||0,locale,
   onPreview:value=>{backgroundPreview=value;applyBackground(value?.src||previousImage);},
   onCommit:async crop=>{try{
    // Use the exact result of the save rather than racing a second background read.
    const saved=path?await api('asset_set',{slot:'home',path}):null,committedSrc=saved?.src||src;
    await api('settings_save',{scope:'background',values:{'crop.x':crop.x,'crop.y':crop.y,'crop.zoom':crop.zoom}});
    await api('save_preferences',{values:{homeBackground:true}});
    const ui=await api('ui_state');for(const[key,value]of Object.entries(ui))localStorage.setItem(key,value);
    model=await api('home');backgroundPreview=null;setAppearance();
    // The image was already decoded in the crop preview and persisted above.
    // A superseded paint is not a failed save and must not strand the crop dialog.
    if(ticket!==backgroundEditRequest)return;
    currentBackgroundSrc=committedSrc;
    await applyBackground(committedSrc);
    const main=document.querySelector('#main');if(main)delete main.__settingsData;
    renderRoute();toast(text.saved);
   }catch(error){toast(errorMessage(error));throw error;}}
  });
 }catch(error){toast(errorMessage(error));}
}

addEventListener('tome-open-home-crop',()=>editHomeBackground());
addEventListener('tome-pick-home-picture',async()=>{try{const path=await invoke('pick_image');if(path)editHomeBackground(path);}catch(error){toast(errorMessage(error));
 }});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const invoke=(command,args={})=>{
  if(window.__TOME_TEST_TRANSPORT__)return window.__TOME_TEST_TRANSPORT__(command,args);
  const native=window.__TAURI_INTERNALS__?.invoke;
  if(!native)return Promise.reject(Error('DESKTOP_REQUIRED'));
  return native(command,args);
};
import {launchCopy,launchReason} from './launch-feedback.js';
import {stageFor,applyVeil,veilSettingsHTML,veilsFromForm} from './page-veils.js';
const quickActions=new Set(['settings_get','vocabulary','unknown_words','home','preferences','ui_state','history','dialogue','sentences','word_trash','statistics',
 'game_detail','reader_status']);
/* E459: the learning pages' heavier reads get a longer limit, so a page never waits on them for good */
const slowReads=new Set(['reading_insights','grammar_report','grammar_bluebook','learning_rewards','learning_level','learning_goal','learning_activity','sentences_page']);
const api=(action,params={})=>{const request=invoke('service',{request:{action,...params}});if(!quickActions.has(action)&&!slowReads.has(action)&&action!=='launch')return request;
 let timer;return Promise.race([request,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('SERVICE_TIMEOUT')),action==='launch'?48000:slowReads.has(action)?40000:12000);
 })]).finally(()=>clearTimeout(timer));};
const number=value=>new Intl.NumberFormat(locales[locale]).format(value||0);
const cover=(game,cls='cover')=>game.cover?`<img class="${cls}" src="${esc(game.cover)}" alt="" loading="lazy">`:`<div class="${cls} hero-placeholder">${icon('game')}<span class="ph-title" lang="ja">${esc(String(game.title||'').replace(/^(\s*\[[^\]]*\])+\s*/,''))}</span></div>`;
function relativeTime(timestamp){
  if(!timestamp)return text.neverPlayed;
  const date=new Date(timestamp*1000),today=new Date();today.setHours(0,0,0,0);
  const time=date.toLocaleTimeString(locales[locale],{hour:'2-digit',minute:'2-digit'});
  if(date>=today)return `${text.today} ${time}`;
  const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
  if(date>=yesterday)return `${text.yesterday} ${time}`;
  return date.toLocaleDateString(locales[locale],{year:'numeric',month:'short',day:'numeric'});
}
const datetime=timestamp=>timestamp?new Date(timestamp*1000).toLocaleString(locales[locale],{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):text.unknownTime;
function duration(seconds){const min=Math.floor((seconds||0)/60);return min>=60?`${Math.floor(min/60)} ${text.hours} ${min%60} ${text.minutes}`:`${min} ${text.minutes}`;
 }
function toast(message){clearTimeout(toastTimer);const element=document.querySelector('#toast');element.textContent=message;element.classList.add('visible');toastTimer=setTimeout(()=>element.classList.remove('visible'),
 4600);}
function errorMessage(error){const code=typeof error==='string'?error:error?.message;return ({LOCALE_EMULATOR_REQUIRED:({zh:'日文转区组件（Locale Emulator）没能装好：再点一次启动会自动重新安装；仍不行请把 logs\\locale-emulator.log 发给作者',
 en:'Locale Emulator could not be set up: press Start again to retry the automatic install; if it still fails, send logs\\locale-emulator.log',ja:'Locale Emulator を準備できませんでした。もう一度起動すると自動で再インストールします'}[locale]),
 LOCALE_EMULATOR_DOWNLOAD_FAILED:({zh:'日文转区组件（Locale Emulator）下载失败：检查网络后再点一次启动，会自动重试（含国内镜像）',en:'Locale Emulator could not be downloaded: check your connection and press Start again',
 ja:'Locale Emulator をダウンロードできませんでした。接続を確認してもう一度起動してください'}[locale]),LE_X86_ONLY:({zh:'Locale Emulator 仅支持 32 位程序，请关闭此游戏的日语环境选项',en:'Locale Emulator supports 32-bit programs only',
 ja:'Locale Emulator は32ビット専用です'}[locale]),INVALID_IMAGE:({zh:'无法读取图片，请重新选择 PNG、JPG、WebP、GIF 或 BMP 图片',en:'Cannot read this image. Choose a PNG, JPG, WebP, GIF or BMP file',
 ja:'画像を読み込めません。PNG・JPG・WebP・GIF・BMP を選び直してください'}[locale]),EXECUTABLE_MISSING:text.missingExe,LOCALE_ADAPTER_PENDING:text.localePending,GAME_WINDOW_NOT_READY:({
 zh:"未确认稳定的游戏窗口，主页已保留，请检查游戏启动方式或单独运行游戏",en:"No stable game window was confirmed. Home remains open; check the launch mode or run the game directly",ja:"安定したゲームウィンドウを確認できません。ホームは開いたままです。起動設定を確認してください"}[locale]),
 GAME_LAUNCH_FAILED:text.startFailed,INVALID_EXECUTABLE:text.invalidExe,INVALID_VNDB_ID:({zh:'VNDB 编号格式不对，例如 v12345 或 https://vndb.org/v12345',en:'Enter a VNDB ID such as v12345 or https://vndb.org/v12345',
 ja:'VNDB の ID は v12345 や https://vndb.org/v12345 の形で入力してください'}[locale]),INVALID_TITLE:text.invalidTitle,READER_HOTKEY_IN_USE:({zh:'游戏已启动，但 Alt+T 被其他程序占用，请关闭其他 MeguLit 实例后重新打开',
 en:'Game launched, but Alt+T is already in use. Close other MeguLit instances and reopen',ja:'ゲームは起動しましたが Alt+T は使用中です。ほかの MeguLit を閉じて開き直してください'}[locale]),READER_START_TIMEOUT:({
 zh:'游戏已启动，但游戏内功能未就绪，请重新打开 MeguLit 后再试',en:'Game launched, but the in-game bridge is not ready. Reopen MeguLit and retry',ja:'ゲームは起動しましたが、ゲーム内機能の準備ができていません。MeguLit を開き直してください'}[locale]),
 LEGACY_TRASH_ADAPTER_PENDING:text.serviceFailed})[code]||(text.serviceFailed+(/^[A-Z_]+$/.test(code)?` (${code})`:''));}
document.addEventListener('focusin',e=>{const t=e.target;if(t?.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),textarea')&&!t.hasAttribute('autocomplete'))t.setAttribute('autocomplete',
 'off');});
function setAppearance(preferences=model.preferences){
  locale=['zh','ja','en'].includes(preferences.language)?preferences.language:'zh';text=messages[locale];
  document.documentElement.lang=locales[locale];
  {const theme=preferences.themeMode||'dark',was=document.documentElement.dataset.theme;document.documentElement.dataset.theme=theme;if(was&&was!==theme&&typeof themeBackground==='function')themeBackground();
   }
  document.documentElement.style.setProperty('--g-bar',/^#[0-9a-f]{6}$/i.test(preferences.barColor||'')?preferences.barColor:'#1a1110');
  document.documentElement.dataset.glow=preferences.glow===false?'off':'on';document.documentElement.style.setProperty('--home-font-scale',Number(preferences.homeFontScale)||1);
   document.documentElement.style.setProperty('--glow-speed',Number(preferences.glowSpeed)||1);
  document.documentElement.style.setProperty('--accent',preferences.accent);
  const rootStyle=document.documentElement.style,accent=preferences.accent||'#ad1539';
  for(const [key,fallback]of Object.entries({'--e-red':'#c8303c','--e-red-btn':'#b72a36','--g-wine':'#9e1b32','--g-wine-hi':'#c02a43','--g-wine-deep':'#5e0f1d'}))rootStyle.setProperty(key,
   accent==='#ad1539'?fallback:accent);
  /* Decorative gold (thin rules, diamonds, open headings). Empty keeps the theme's own gold; the highlight is a lighter shade of it. */
  {const gold=/^#[0-9a-f]{6}$/i.test(preferences.goldColor||'')?preferences.goldColor:'';
   if(gold){rootStyle.setProperty('--gold-accent',gold);rootStyle.setProperty('--g-gold',gold);rootStyle.setProperty('--gold-hi',`color-mix(in srgb,${gold} 50%,#fff)`);
    }
   else for(const key of ['--gold-accent','--g-gold','--gold-hi'])rootStyle.removeProperty(key);}
  const chosenFont=String(preferences.fontFamily||'').replace(/["\\;{}]/g,'');
  for(const key of ['--g-zh','--g-serif','--g-serif-ja']){if(chosenFont)rootStyle.setProperty(key,'"'+chosenFont+'",sans-serif');else rootStyle.removeProperty(key);
   }

  const value=preferences.accent?.slice(1)||'ad1539';const rgb=[0,2,4].map(i=>parseInt(value.slice(i,i+2),16));
  document.documentElement.style.setProperty('--accent-light',`rgb(${rgb.map(c=>Math.round(c+(255-c)*.54)).join(',')})`);
  if(preferences.fontFamily)document.documentElement.style.fontFamily=`"${preferences.fontFamily.replace(/["\\]/g,'')}","Segoe UI","Yu Gothic UI","Microsoft YaHei UI",sans-serif`;
  else document.documentElement.style.removeProperty('font-family');
  document.documentElement.style.setProperty('--background-dim',preferences.backgroundDim??.78);if(typeof applyVeil==='function')applyVeil(preferences);
  const bg=model.background||{},clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
  document.documentElement.style.setProperty('--background-blur',clamp(bg.blur,0,40,0)+'px');
  document.documentElement.style.setProperty('--background-saturation',clamp(bg.saturate,0,200,100)+'%');
  if(Object.hasOwn(bg,'dim'))document.documentElement.style.setProperty('--background-dim',clamp(bg.dim,0,100,35)/100);
  document.documentElement.style.setProperty('--home-glass-blur',clamp(bg.glassBlur,0,40,14)+'px');
  document.documentElement.style.setProperty('--home-glass-alpha',clamp(bg.glassAlpha,0,100,55)+'%');
  {const glassColor=/^#[0-9a-f]{6}$/i.test(preferences.glassColor||'')?preferences.glassColor:'';document.documentElement.classList.toggle('custom-glass',!!glassColor);
   if(glassColor)rootStyle.setProperty('--glass-tint',glassColor);else rootStyle.removeProperty('--glass-tint');}
  document.documentElement.classList.toggle('home-glass',bg.glass!==false); /* v1.1.5: same default as Settings (on), so the switch and the screen agree */
  const reading=model.historyAppearance||{};const font=String(reading.history_font_family||'Yu Gothic').replace(/["\\;{}]/g,'');
  document.documentElement.style.setProperty('--history-font-family','"'+font+'","Yu Gothic","Microsoft YaHei",sans-serif');
  document.documentElement.style.setProperty('--history-font-size',clamp(reading.history_font_size,12,32,16)+'px');
  document.documentElement.style.setProperty('--history-line-height',clamp(reading.history_line_height,1.3,2.6,1.9));
  placeBackground();
}
/* Reader start failures (user, 2026-11-08: players only saw 「游戏内功能未就绪」 and could not tell why): say which cause it is and what to do, with the code visible. */
const READER_HINTS={
 READER_NATIVE_MISSING:{zh:'MeguLit 的游戏组件不见了，多半被杀毒软件隔离：从隔离区恢复，并把 MeguLit 文件夹加入信任后重开',en:'MeguLit game components are missing, most likely quarantined by antivirus: restore them and trust the MeguLit folder, then reopen',
  ja:'ゲーム用コンポーネントが見つかりません。ウイルス対策ソフトの隔離を解除し、MeguLit フォルダーを除外に追加して再起動してください'},
 READER_NATIVE_EXITED:{zh:'游戏组件启动后被关闭，多半是杀毒软件拦截：把 MeguLit 文件夹加入信任后点「重新连接」',en:'The game component was stopped right after starting, usually by antivirus: trust the MeguLit folder and press Reconnect',
  ja:'ゲーム用コンポーネントが停止されました。ウイルス対策ソフトで MeguLit フォルダーを除外して「再接続」を押してください'},
 READER_HOTKEY_IN_USE:{zh:'Alt+T 快捷键暂时被别的程序占着，MeguLit 会自动关掉多开的旧 MeguLit 并每隔 2 秒重试，通常几秒内就好；一直不好的话，重启电脑后只打开一个 MeguLit',en:'Alt+T is held by another program for now. MeguLit closes any older MeguLit left running and retries every 2 s, usually fixed in seconds; if it stays, restart the PC and open only one MeguLit',
  ja:'Alt+T が他のアプリか 2 つ目の MeguLit に使われています。閉じてから「再接続」を押してください'},
 READER_START_TIMEOUT:{zh:'游戏组件启动太慢（第一次启动或电脑较忙时常见）：稍等后点「重新连接」',en:'The game component is slow to start (common on first launch): wait a moment and press Reconnect',
  ja:'ゲーム用コンポーネントの起動が遅れています。少し待ってから「再接続」を押してください'}};
let readerFailures=0;
function readerNotice(error){const panel=document.querySelector('#reader-notice');if(!panel)return;panel.hidden=!error;if(!error){readerFailures=0;return;}
 const text=String(error),code=(text.match(/READER_[A-Z_]+/)||[''])[0],label={zh:'游戏内功能未就绪',en:'In-game features are not ready',ja:'ゲーム内機能が準備できていません'}[locale];
 panel.querySelector('span').textContent=label;panel.title=text;panel.querySelector('button').disabled=false;
 let detail=panel.querySelector('small');if(!detail){detail=document.createElement('small');detail.style.cssText='display:block;flex-basis:100%;margin-top:4px;font-size:12px;line-height:1.5;opacity:.85;white-space:normal';
  panel.insertBefore(detail,panel.querySelector('button'));}
 detail.textContent=((READER_HINTS[code]||{})[locale]||text)+(code?' ('+code+')':'');
 let copy=panel.querySelector('[data-reader-diagnostics]');
 if(readerFailures>=2&&!copy){copy=document.createElement('button');copy.type='button';copy.dataset.readerDiagnostics='';copy.textContent={zh:'复制诊断信息',en:'Copy diagnostics',
  ja:'診断情報をコピー'}[locale];copy.onclick=async()=>{const status=await api('reader_status').catch(e=>({error:String(e)}));const info=['MeguLit '+(document.querySelector('[data-app-version]')?.textContent||''),
  'error: '+text,'status: '+JSON.stringify(status),'logs: MeguLit/logs/reader-startup.log, MeguLit/logs/reader-native.log'].join('\n');try{await navigator.clipboard.writeText(info);
  copy.textContent={zh:'已复制，可粘贴到反馈里',en:'Copied',ja:'コピーしました'}[locale];}catch{}};panel.append(copy);}
}
let readerWaits=0;
async function waitReader(){let state;const deadline=Date.now()+(readerWaits++?20000:45000);do{state=await api('reader_status');if(state.error)throw Error(state.error);
 if(state.ready){readerNotice('');return state;}await new Promise(resolve=>setTimeout(resolve,120));}while(Date.now()<deadline);throw Error('READER_START_TIMEOUT');
 }
async function retryReader(button){button.disabled=true;try{await invoke('reader_restart');await waitReader();}catch(error){readerFailures++;readerNotice(error.message||error);
 }finally{button.disabled=false;}}
function shell(){
  app.setAttribute('aria-busy','false');
  app.innerHTML=`${["nw","ne","sw","se"].map(c=>`<div class="window-corner corner-${c}" data-resize="${c}" aria-hidden="true"></div>`).join('')}<div class="app-backdrop" aria-hidden="true"></div><div class="app-frame">
    <header class="titlebar"><div class="grimoire-glow" aria-hidden="true"></div>
    <img class="brand-logo" src="assets/megulit-logo.svg" alt="MeguLit" width="3424" height="1452" draggable="false">
    <nav class="nav-history" aria-label="${({zh:'页面历史',ja:'ページ履歴',en:'Page history'})[locale]}"><button type="button" class="nav-step" data-nav-step="-1" disabled aria-label="${({zh:'返回上一页',ja:'前のページへ',en:'Back'})[locale]}" title="${({zh:'返回上一页',ja:'前のページへ',en:'Back'})[locale]} (Alt+←)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5"/></svg></button><button type="button" class="nav-step" data-nav-step="1" disabled aria-label="${({zh:'前往下一页',ja:'次のページへ',en:'Forward'})[locale]}" title="${({zh:'前往下一页',ja:'次のページへ',en:'Forward'})[locale]} (Alt+→)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5 15 12l-5.5 5.5"/></svg></button></nav>
    <span class="tab-ink" aria-hidden="true"></span>${(tabButton=>`<nav class="top-tabs top-tabs-main" aria-label="MeguLit">${['home','library','history','learning'].map(tabButton).join('')}<span class="top-sep" aria-hidden="true"></span>${['leaderboard','daily'].map(tabButton).join('')}</nav>`)(item=>`<button class="top-tab" data-route="${item}" ${route===item?'aria-current="page"':''}>${item==='daily'?(dailyLabel[locale]||dailyLabel.zh)/* E415 */:item==='tools'?(grimoireWords[locale]||grimoireWords.zh).tools/* E377 */:item==='leaderboard'?(leaderboardLabel[locale]||leaderboardLabel.zh):item==='about'?(aboutLabel[locale]||aboutLabel.zh):text[item]}</button>`)}<div class="bar-tools" id="bar-tools"></div><div class="titlebar-end"><nav class="top-tabs top-tabs-util" aria-label="MeguLit"><button type="button" class="top-tab" data-top-feedback>${({zh:'反馈',ja:'不具合報告',en:'Report'})[locale]||'反馈'}</button><button type="button" class="top-tab" data-top-guide>${({zh:'指南',ja:'ガイド',en:'Guide'})[locale]||'指南'}</button>${['tools','settings','about'].map(item=>`<button class="top-tab" data-route="${item}" ${route===item?'aria-current="page"':''}>${item==='daily'?(dailyLabel[locale]||dailyLabel.zh)/* E415 */:item==='tools'?(grimoireWords[locale]||grimoireWords.zh).tools/* E377 */:item==='leaderboard'?(leaderboardLabel[locale]||leaderboardLabel.zh):item==='about'?(aboutLabel[locale]||aboutLabel.zh):text[item]}</button>`).join('')}</nav><button type="button" class="top-me" data-top-me aria-label="${({zh:'个人主页',ja:'プロフィール',en:'Profile'})[locale]}" title="${({zh:'个人主页',ja:'プロフィール',en:'Profile'})[locale]}"><span class="leaderboard-avatar is-default" aria-hidden="true"></span><span class="top-me-name">${({zh:'个人主页',ja:'プロフィール',en:'Profile'})[locale]}</span></button><div class="window-actions">${[['minimize','minus'],['maximize','maximize'],['close','close']].map(([action,symbol])=>`<button class="window-action" data-window="${action}" aria-label="${text[action]}" title="${text[action]}">${icon(symbol)}</button>`).join('')}</div></div></header><aside class="reader-notice" id="reader-notice" hidden role="status"><span></span><button type="button">${{zh:'重新连接',en:'Reconnect',ja:'再接続'}[locale]}</button></aside>
    <div class="workspace"><div class="stage-cover" aria-hidden="true" hidden><i class="dtv-glyph"></i><span class="stage-marks"><i></i><i></i><i></i><i></i></span></div><main class="main" id="main" tabindex="-1"></main></div></div>`;
  document.querySelectorAll('[data-window]').forEach(button=>button.addEventListener('click',async()=>{try{if(route==='settings')await flushSettings().catch(()=>{
   });if(button.dataset.window==='close'&&model.preferences.closeAsk!==false){const choice=await closeDialog(locale);if(!choice)return;const values={closeToTray:choice.tray};
   if(choice.remember)values.closeAsk=false;model.preferences=await api('save_preferences',{values});}await invoke('window_action',{action:button.dataset.window});
   }catch(error){toast(errorMessage(error));}}));
  document.querySelectorAll('[data-route]').forEach(button=>button.addEventListener('click',()=>{navigate(button.dataset.route);}));
  document.querySelector('[data-top-guide]')?.addEventListener('click',()=>openGuide({api,locale,esc,toast,version:VERSION}));
  document.querySelector('[data-top-feedback]')?.addEventListener('click',()=>openFeedback({api,locale,esc,toast,version:VERSION}));
  if(model.preferences.homeBackground)api('background').then(image=>{if(!backgroundPreview)applyBackground(image);}).catch(()=>{});
  document.querySelector('#reader-notice button').onclick=event=>retryReader(event.currentTarget);
  /* E273 (user: the close button did nothing when maximized): the invisible top-right resize corner sat over the close
     button and swallowed the click, and resizing is a no-op while maximized. Hide the corners while maximized. */
  {const mark=()=>document.documentElement.classList.toggle('is-maximized',outerWidth>=screen.availWidth-2&&outerHeight>=screen.availHeight-2);mark();bindGlobalOnce('resize',()=>addEventListener('resize',
   mark));}
  document.querySelectorAll('[data-resize]').forEach(handle=>handle.addEventListener('mousedown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();
   invoke('window_action',{action:'resize_'+handle.dataset.resize}).catch(error=>toast(errorMessage(error)));}));
  {const logo=document.querySelector('.titlebar .brand-logo'),hist=document.querySelector('.titlebar .nav-history');if(logo&&hist)logo.after(hist);}
  bindTopProfile();
  bindDrag();
  moveTabInk();
  document.querySelectorAll('[data-nav-step]').forEach(button=>button.addEventListener('click',()=>stepNavigation(Number(button.dataset.navStep))));updateNavButtons();
  // Mouse side buttons and Alt+arrows step through the same history.
  bindGlobalOnce('history-keys',()=>{addEventListener('mouseup',event=>{if(event.button===3||event.button===4){event.preventDefault();stepNavigation(event.button===3?-1:1);}});
  addEventListener('keydown',event=>{if(event.altKey&&!event.ctrlKey&&(event.key==='ArrowLeft'||event.key==='ArrowRight')&&!event.target.closest?.('input,textarea,select,[contenteditable]')){
   event.preventDefault();stepNavigation(event.key==='ArrowLeft'?-1:1);}});});
}
/* shell() runs again on every language change: window/document listeners must be added only once or back/forward steps twice */
const boundGlobals=new Set();function bindGlobalOnce(key,bind){if(boundGlobals.has(key))return;boundGlobals.add(key);bind();}
function bindDrag(){
 const drag=event=>{if(event.button!==0||event.detail>1||event.target.closest('button,input,select,textarea,a,summary'))return;event.preventDefault();window.__TAURI_INTERNALS__?.invoke('plugin:window|start_dragging',
  {label:'main'}).catch(error=>toast(errorMessage(error)));};
 const titlebar=document.querySelector('.titlebar');titlebar.addEventListener('mousedown',drag);titlebar.addEventListener('dblclick',event=>{if(!event.target.closest('button'))invoke('window_action',
  {action:'maximize'}).catch(error=>toast(errorMessage(error)));});
 document.querySelector('.app-frame').addEventListener('mousedown',event=>{if(event.target.matches('.app-frame,.workspace,.main'))drag(event);});
 /* 2026-11-12 (user: the start notice stopped the whole window from moving or resizing) a modal dialog makes the rest of the page inert and its backdrop takes every press: over a resize handle the window still resizes, over a title-bar button that button still works, anywhere else on the title bar the window still moves. Every dialog, not only the notice. */
 bindGlobalOnce('dialog-backdrop',()=>document.addEventListener('mousedown',event=>{const d=event.target;if(!(d instanceof HTMLDialogElement)||!d.open||event.button!==0)return;const x=event.clientX,
  y=event.clientY,r=d.getBoundingClientRect();if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return;const inside=q=>q.width>0&&x>=q.left&&x<=q.right&&y>=q.top&&y<=q.bottom;
  for(const h of document.querySelectorAll('[data-resize]'))if(inside(h.getBoundingClientRect())){event.preventDefault();event.stopPropagation();invoke('window_action',
   {action:'resize_'+h.dataset.resize}).catch(()=>{});return;}
  const bar=document.querySelector('.titlebar');if(!bar||!inside(bar.getBoundingClientRect()))return;event.preventDefault();event.stopPropagation();
  const button=[...bar.querySelectorAll('button')].find(b=>inside(b.getBoundingClientRect()));if(button){button.click();return;}
  window.__TAURI_INTERNALS__?.invoke('plugin:window|start_dragging',{label:'main'}).catch(()=>{});},true));
}

function empty(label,symbol='library',sub=''){const kind={[text.emptyWords]:'words',[text.emptySentences]:'sentences',[text.emptyTrash]:'trash',[text.emptyHistory]:'history',
 [text.emptyDialogue]:'history'}[label];if(kind)return blankPage(kind);return `<div class="empty-state">${icon(symbol)}<h2>${esc(label)}</h2>${sub?`<p>${esc(sub)}</p>`:''}</div>`;
 }
/* v1.0.5 空状态：说明这里会出现什么、怎么让它出现，并给出可以直接点的入口 */
const BLANK={
 zh:{sentences:['句','句子','还没有收藏句子','在游戏里读到喜欢、想记住的台词，收藏下来，会连同作品名、时间和译文一起留在这里，也能做成 Anki 卡片',[['启动游戏','从游戏库打开一部作品'],['在游戏里拖动选取一段文字','用鼠标拖过台词里的几个字'],['点弹窗里的「收藏句子」',
  '整句原文和译文会存到这里；再点一次取消。任何一次加 Anki 也会自动留下所在的句子']],[['library','去游戏库']]],
  words:['詞','单词','生词本还是空的','在游戏里点一下不认识的词，在查词卡片上收录，它就会带着读音、释义和出处例句来到这里',[['点一下生词','阅读层里直接点'],['拖一段短语','可以查整句里的搭配'],['收录','之后可以同步到 Anki']],[['library','去游戏库'],['kana',
   '先学五十音']]],
  trash:['屑','回收站','回收站是空的','从生词本删掉的词会先放在这里，不会马上消失。点「恢复」就能放回去，连同例句和掌握程度',[],[['words','← 回到单词本',1]]],
  history:['頁','历史','还没有阅读记录','每次用 MeguLit 打开游戏，读了多久、读了多少字、每一句原文和译文，都会自动记在这里，不用手动保存',[['选一部作品','游戏库里点封面'],['启动游戏','阅读层会自动接上'],['开始读','记录自动生成']],[['library','去游戏库']]]},
 ja:{sentences:['句','文','保存した文はまだありません','気に入った台詞を保存すると、作品名・日時・訳文と一緒にここに残り、Anki カードにもできます',[['ゲームを起動','ライブラリから作品を開く'],['ゲーム内で文字をドラッグして選択','台詞の一部をマウスでなぞる'],['ポップアップの「文を保存」を押す',
  '文全体と訳文がここに入り、もう一度押すと解除。Anki に追加した語の文も自動で残ります']],[['library','ライブラリへ']]],
  words:['詞','単語','単語帳はまだ空です','ゲーム中にわからない語をクリックし、辞書カードで登録すると、読み・意味・出典の例文と一緒にここに入ります',[['語をクリック','読書レイヤーで直接'],['フレーズをドラッグ','組み合わせも調べられます'],['登録','Anki にも同期できます']],
   [['library','ライブラリへ'],['kana','五十音から始める']]],
  trash:['屑','ごみ箱','ごみ箱は空です','単語帳から削除した語はいったんここに入ります。「復元」で例文や習熟度ごと戻せます',[],[['words','← 単語帳へ',1]]],
  history:['頁','履歴','読書の記録はまだありません','MeguLit でゲームを開くと、読書時間・文字数・原文と訳文が自動でここに記録されます',[['作品を選ぶ','ライブラリでカバーをクリック'],['ゲームを起動','読書レイヤーが自動で接続'],['読み始める','記録は自動で作られます']],
   [['library','ライブラリへ']]]},
 en:{sentences:['句','Sentences','No saved sentences yet','Save a line you like while reading. It stays here with the game, time and translation, and can become an Anki card',
  [['Launch a game','Open one from the library'],['Drag to select some text in the game','Sweep the mouse over part of a line'],['Click “Save sentence” in the popup',
  'The whole line and its translation land here; click again to remove. Every word you add to Anki keeps its line here too']],[['library','Go to library']]],
  words:['詞','Words','Your word list is empty','Click an unknown word in the game and add it from the lookup card. It arrives here with its reading, meaning and the line it came from',
   [['Click a word','Right in the overlay'],['Drag a phrase','Look up whole expressions'],['Add it','Sync to Anki later']],[['library','Go to library'],['kana',
   'Start with kana']]],
  trash:['屑','Recycle bin','The recycle bin is empty','Words you delete wait here first. Restore brings them back with their examples and progress',[],[['words',
   '← Back to words',1]]],
  history:['頁','History','No reading yet','Every time MeguLit opens a game, reading time, characters and every line with its translation are recorded here automatically',
   [['Pick a game','Click a cover in the library'],['Launch it','The overlay attaches by itself'],['Start reading','Records appear automatically']],[['library',
   'Go to library']]]}
};
function blankPage(kind){const [glyph,eyebrow,title,lede,steps,acts]=(BLANK[locale]||BLANK.zh)[kind],nums=['壱','弐','参'];
 return `<section class="g-blank"><span class="glyph" aria-hidden="true">${glyph}</span><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2><p class="lede">${esc(lede)}</p>${steps.length?`<div class="steps">${steps.map(([b,s],i)=>`<div><i>${nums[i]}</i><b>${esc(b)}</b>${esc(s)}</div>`).join('')}</div>`:''}<div class="acts">${acts.map(([to,label,alt],i)=>`<button type="button" class="${i||alt?'alt':'go'}" data-blank-go="${to}">${esc(label)}</button>`).join('')}</div></section>`;
  }
document.addEventListener('click',event=>{const b=event.target.closest?.('[data-blank-go]');if(!b)return;const to=b.dataset.blankGo;if(to==='library')navigate('library');
 else navigate('learning',to==='kana'?'kana':'words');});
function heading(title,tools=''){return `<div class="page-header"><h1>${esc(title)}</h1><div class="page-tools">${tools}</div></div>`;}
function card(game,library=false){
 const copy={zh:{hook:'Hook 可用',pending:'Hook 待实测',unsupported:'Hook 未适配',hookHint:'依据已有作品适配记录；实时连接状态请在游戏内查看',reading:'累计阅读',words:'关联单词',engine:'游戏引擎',last:'上次游玩',
  details:'点击查看详情'},en:{hook:'Hook supported',pending:'Hook unverified',unsupported:'Hook unsupported',hookHint:'From the saved compatibility record; check live status in game',
  reading:'Total reading',words:'Linked words',engine:'Engine',last:'Last played',details:'Click for details'},ja:{hook:'Hook 対応',pending:'Hook 未検証',unsupported:'Hook 未対応',
  hookHint:'保存済みの対応情報です。現在の接続はゲーム内で確認できます',reading:'累計読書',words:'関連単語',engine:'エンジン',last:'前回のプレイ',details:'クリックで詳細'}}[locale],embed=embedStatus(game,locale),hook=embed.label;
 return `<div class="${library?'library-card':''}"><button class="game-card" data-game="${esc(game.id)}" aria-label="${esc(game.title)}"><span class="cover-frame">${cover(game)}${library?`<span class="game-hover"><strong>${esc(game.title)}</strong>${game.engine?`<span>${copy.engine} · ${esc(game.engine)}</span>`:''}<span>${copy.last} · ${relativeTime(game.lastPlayedAt)}</span><span>${copy.reading} · ${duration(game.readingSeconds)}</span><span>${copy.words} · ${number(game.learnedWords||0)}</span><small>${copy.details} →</small></span>`:''}</span><span class="game-caption mq-box"><span class="mq">${esc(game.title)}</span></span>${library?`<span class="library-card-meta"><span class="hook-support ${embed.kind==='verified'||embed.kind==='supported'?'supported':embed.kind==='unsupported'?'unsupported':'pending'}" title="${esc(embed.tooltip)}">${game.available?hook:({zh:"游戏已删除或移动",ja:"削除または移動済み",en:"Game deleted or moved"})[locale]}</span><span class="library-card-numbers"><span title="${copy.reading}">${icon('clock')}${duration(game.readingSeconds)}</span><span title="${copy.words}">${icon('word')}${number(game.learnedWords||0)}</span></span></span>`:''}</button></div>`;
}

let stopShelf=()=>{},homeSignature='';
function home(){
  const main=document.querySelector('#main'),hour=new Date().getHours();
  const greeting=(hour>=5&&hour<12?text.morning:hour>=12&&hour<18?text.afternoon:text.evening).split(/[，,、]/)[0]+(model.preferences.username?`${locale==='en'?', ':locale==='ja'?'、':'，'}${model.preferences.username}`:'');
  const signature=homeTVSignature(model)+locale+greeting;
  if(main.querySelector('.tv-home')&&signature===homeSignature)return;
  homeSignature=signature;stopShelf();stopShelf=()=>{};
  renderHomeTV(main,{model,api,locale,esc,icon,number,duration,relativeTime,greeting,navigate,onLaunch:(id,button)=>startGame(id,button),onDetail:id=>gameDetail(id),
   onAdd:()=>editGame(),onGame:g=>paintGlow(g.cover||''),savePreferences:values=>api('save_preferences',{values}).catch(error=>toast(errorMessage(error)))});
  maybeFirstRun({gamesCount:model.games.length,api,invoke,locale,esc,toast,onDone:()=>renderRoute()});
}
const homeView=()=>route==='home'?pageToken:null;
const refreshHomeActivity=createHomeRefresh({load:()=>{const target=document.querySelector('#home-activity'),date=target?.dataset.activityDate,range=target?.dataset.activityRange;
 return range==='day'?api('statistics',{range,date}).then(data=>data.buckets):api('learning_activity',{range,date});},view:()=>route==='home'?pageToken+':'+(document.querySelector('#home-activity')?.dataset.activityRange||'year')+':'+(document.querySelector('#home-activity')?.dataset.activityDate||''):null,
 apply:records=>{const target=document.querySelector('#home-activity');if(target)renderActivity(target,records,{locale,esc,duration,number},api);}});
const refreshFocusedHome=createHomeRefresh({load:()=>api('home'),view:homeView,apply:next=>{model=next;home();}});

function attachGameActions(main){
  main.querySelectorAll('[data-game]').forEach(button=>button.addEventListener('click',()=>gameDetail(button.dataset.game)));
  main.querySelectorAll('[data-edit]').forEach(button=>button.addEventListener('click',()=>editGame(button.dataset.edit)));
  main.querySelectorAll('[data-launch]').forEach(button=>button.addEventListener('click',()=>startGame(button.dataset.launch,button)));
}
let launchInFlight=false,pendingHomeGame='';
const playHomeMotion=createHomeMotion({frame:()=>document.querySelector('.app-frame'),reduced:()=>matchMedia('(prefers-reduced-motion:reduce)').matches});
async function collapseHome(){await invoke('window_action',{action:'enter_overlay'});}
async function startGame(id,button){
 if(launchInFlight)return;
 launchInFlight=true;if(button)button.disabled=true;
 let started=false;
 try{
  await invoke('reader_open',{background:true});
  const result=await api('launch',{id});started=true;await waitReader();
  toast(result.action==='focused'?text.focusDone:result.action==='running'?text.runningDone:text.launchDone);
  /* v1.1.6 (user): launching a game no longer hides the home window; the game is just brought to the front */
  api('focus_game',{id}).catch(()=>{});model=await api('home');if(route==='home')home();
 }catch(error){
  const code=typeof error==='string'?error:error?.message;
  const [failure,close]=launchCopy(locale),title=started?({zh:'游戏已启动，MeguLit 连接失败',ja:'ゲームは起動済みです。MeguLit の接続に失敗しました',en:'Game started. MeguLit could not connect.'})[locale]:failure,
   reason=launchReason(code,locale)||errorMessage(error);
  const dialog=modal('<h2>'+title+'</h2><p>'+esc(reason)+'</p><div class="dialog-actions"><button class="secondary" data-launch-close>'+close+'</button></div>');
  dialog.querySelector('[data-launch-close]').onclick=()=>dialog.close();
  /* 2026-11-12 the game imports DirectPlay and Windows has none: install it here (no restart), then launch again */
  if((code==='DIRECTPLAY_REQUIRED'||code==='WINDOWS_FEATURE_REQUIRED')&&dialog.open){const dp=code==='DIRECTPLAY_REQUIRED',words=({zh:[dp?'安装 DirectPlay':'安装所需组件',
   '正在安装…','没有装上（权限请求被取消，或安装失败）'],ja:[dp?'DirectPlay をインストール':'必要なコンポーネントをインストール','インストール中…','インストールできませんでした（許可が取り消されたか、失敗しました）'],en:[dp?'Install DirectPlay':'Install the component',
   'Installing…','It was not installed (the permission prompt was cancelled, or it failed)']})[locale]||['Install','Installing…','It was not installed'];
   const add=document.createElement('button');add.className='primary';add.textContent=words[0];
   add.onclick=async()=>{add.disabled=true;add.textContent=words[1];try{await api('windows_feature_install',{id});dialog.close();startGame(id,button);}catch{add.disabled=false;
    add.textContent=words[0];const p=dialog.querySelector('p');if(p)p.textContent=words[2];}};
   dialog.querySelector('.dialog-actions').append(add);}
  if(code==='JAPANESE_EXECUTABLE_REQUIRED'){
   const {gameLanguageLabel,openGameLanguage}=await import('./game-language.js');
   if(dialog.open){const choose=document.createElement('button');choose.className='secondary';choose.textContent=gameLanguageLabel(locale);choose.onclick=()=>{dialog.close();
    openGameLanguage({id,api,invoke,locale,esc,toast,onChanged:async()=>{model=await api('home');renderRoute();}}).catch(()=>toast(text.serviceFailed));};dialog.querySelector('.dialog-actions').append(choose);
    }
  }
 }finally{launchInFlight=false;if(button)button.disabled=false;}
}

const seriesUI=createSeriesLibrary({model:()=>model,locale:()=>locale,text:()=>text,esc,icon,api,invoke,card,modal,duration,number,relativeTime,search:()=>search,
 toast,bindGames:attachGameActions,onLibraryRendered:showLibraryResults,openSeries:id=>{selectedSeriesId=id;navigate('series');},back:()=>navigate('library'),reload:async()=>{
 model=await api('home');const main=document.querySelector('#main'),scroll=main.scrollTop;if(route==='library')renderGames();else if(route==='series')seriesUI.renderDetail(main,
 selectedSeriesId);main.scrollTop=scroll;}});
function library(){
  const main=document.querySelector('#main');
  main.innerHTML=heading(text.library,`<span class="lib-left"></span><input id="game-search" type="search" placeholder="${text.searchGames}" aria-label="${text.searchGames}" value="${esc(search)}"><button class="icon-button" id="refresh-library" aria-label="${libraryCopy().refresh}" title="${libraryCopy().refresh}" aria-busy="${libraryBusy}" ${libraryBusy?'disabled':''}>${icon('refresh')}</button><button class="icon-button" id="library-settings" aria-label="${libraryCopy().settings}" title="${libraryCopy().settings}">${icon('settings')}</button><button class="icon-button" id="adaptation-overview" aria-label="${esc(overviewLabel(locale))}" title="${esc(overviewLabel(locale))}">${icon('stats')}</button><button class="icon-button" id="select-games" aria-label="${text.series.select}" title="${text.series.select}">${icon('multiselect')}</button><button class="icon-button" id="add-game" aria-label="${text.addGame}">${icon('plus')}</button>`)+`<div id="library-results"></div>`;
  const input=main.querySelector('#game-search');
  const wallToggle=document.createElement('button');
  const wallLabel={zh:'无限墙',en:'Infinite wall',ja:'無限ウォール'}[locale];
  wallToggle.type='button';wallToggle.className='library-wall-toggle';import('./library-switch-motion.js').catch(()=>{});
  wallToggle.setAttribute('role','switch');wallToggle.setAttribute('aria-label',wallLabel);
  wallToggle.setAttribute('aria-checked',String(localStorage.getItem(LIBRARY_WALL_KEY)!=='off'));
  wallToggle.onclick=async()=>{
    // E275: ignore clicks while a switch is running, otherwise the stored state and the shown layout drift apart
    let motion=null;try{motion=await import('./library-switch-motion.js');}catch{}
    if(motion?.isBusy())return;
    const enabled=wallToggle.getAttribute('aria-checked')!=='true';
    localStorage.setItem(LIBRARY_WALL_KEY,enabled?'on':'off');
    wallToggle.setAttribute('aria-checked',String(enabled));
    if(motion)motion.switchLibrary(enabled,()=>renderGames()).catch(()=>renderGames());else renderGames();
  };

  const pod=document.createElement('div'),left=document.createElement('span'),right=document.createElement('span');
  pod.className='field-search';left.className=right.className='side';
  left.append(main.querySelector('#refresh-library'),main.querySelector('#library-settings'),main.querySelector('#adaptation-overview'),wallToggle);
  right.append(main.querySelector('#select-games'),main.querySelector('#add-game'));
  pod.append(left,input,right);main.append(pod);main.classList.add('field-page');
  const searchAppearance=()=>main.classList.toggle('searching',document.activeElement===input||!!input.value);
  input.addEventListener('focus',searchAppearance);
  input.addEventListener('blur',searchAppearance);
  let searchTimer=0;input.addEventListener('input',()=>{search=input.value;main.classList.toggle('searching',!!search);clearTimeout(searchTimer);searchTimer=setTimeout(()=>{
   if(input.isConnected)renderGames();},140);});
  input.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    event.preventDefault();
    input.value='';
    input.dispatchEvent(new Event('input'));
    input.blur();
  });
  searchAppearance();
  main.querySelector('#select-games').onclick=()=>seriesUI.toggleSelection(main.querySelector('#library-results'));main.querySelector('#add-game').addEventListener('click',
   ()=>editGame());main.querySelector('#refresh-library').onclick=()=>refreshLibrary().then(result=>toast(result.added?libraryCopy().added(result.added):libraryCopy().done)).catch(error=>toast(errorMessage(error)));
   main.querySelector('#library-settings').onclick=()=>{settingsSection='library';settingsProfile='';navigate('settings');};
  /* E362 adaptation overview: a hidden game is not in model.games, so open its page directly */
  main.querySelector('#adaptation-overview').onclick=()=>openAdaptationOverview({api,locale,esc,toast,relativeTime,onOpenGame:id=>{gameOrigin='library';selectedGameId=id;
   navigate('game');}}).catch(()=>{});renderGames();
  /* v1.1.6 (user): opening the library straight into the wall plays the same outside-in gathering as switching to it */
  /* hidden from the first paint (cards start at opacity 0) and revealed only once each card holds its start frame, so the laid-out wall never flashes */
  if(localStorage.getItem(LIBRARY_WALL_KEY)!=='off'&&!search.trim()&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const h0=document.querySelector('#library-results');
   h0?.classList.add('lib-entering');const reveal=()=>document.querySelector('#library-results')?.classList.remove('lib-entering');setTimeout(reveal,900);requestAnimationFrame(()=>requestAnimationFrame(async()=>{
   try{const m=await import('./library-switch-motion.js');const h=document.querySelector('#library-results');if(h&&route==='library')m.wallIn(h);}catch{}finally{
   reveal();}}));}
}
// E245.5 (user): entering a search, the wall fades out in place as dominoes from the centre outwards, then the matches
// fade in on the orbit; clearing it, the orbit fades out, then the wall returns as dominoes from the edges inwards.
let gameTransition=null;
function renderGames(){
  const host=document.querySelector('#library-results');if(!host)return;
  if(gameTransition){gameTransition.cancel();gameTransition=null;}
  const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches,plane=host.querySelector('.field-plane');
  const orbit=host.classList.contains('field-orbit'),wall=!!plane&&!orbit&&!host.querySelector('.field-feature'),filtered=!!search.trim();
  const cells=plane?[...plane.children].filter(c=>!c.hasAttribute('data-parked')):[];
  if(!animate||!cells.length||!((wall&&filtered)||(orbit&&!filtered)))return renderGamesNow();
  const b=host.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2;
  const dist=cells.map(c=>{const r=c.getBoundingClientRect();return Math.hypot(r.left+r.width/2-cx,r.top+r.height/2-cy);}),max=Math.max(1,...dist);
  /* E272: leaving the orbit, covers fall back into the capsule (reverse of their entrance) */
  const runs=cells.map((c,i)=>{const n=c.firstElementChild||c;if(wall)return n.animate([{opacity:1,transform:'none'},{opacity:0,transform:'scale(.9)'}],{duration:260,
   delay:dist[i]/max*360,easing:'ease-in',fill:'forwards'});const r=c.getBoundingClientRect(),ox=r.left+r.width/2-cx,oy=r.top+r.height/2-cy,ol=Math.hypot(ox,oy)||1,
   push=Math.max(innerWidth,innerHeight)*.35;return n.animate([{opacity:1,transform:'none'},{opacity:0,transform:`translate(${ox/ol*push}px,${oy/ol*push}px) scale(1.04)`}],
   {duration:380,delay:dist[i]/max*80,easing:'cubic-bezier(.55,0,.8,.3)',fill:'forwards'});}); /* E273 (user): clearing the search, orbit covers fly outward, never into the capsule */
  let done=false;const finish=()=>{if(done)return;done=true;gameTransition=null;renderGamesNow(orbit&&!filtered?'domino':'fresh');};
  gameTransition={cancel(){runs.forEach(r=>r.cancel());done=true;}};
  Promise.all(runs.map(r=>r.finished)).then(finish,()=>{});setTimeout(finish,wall?(260+360)*.82:300); /* E271 overlap: no blank frame between out and in */
}
function renderGamesNow(mode=''){
  const host=document.querySelector('#library-results');
  if(!host)return;
  const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const oldSingle=host.querySelector('.field-feature > [data-member-id]');
  const oldRect=oldSingle?.getBoundingClientRect();
  const wallCards=animate&&!oldSingle?[...host.querySelectorAll('.field-plane > [data-member-id]:not([data-parked]), .field-plane > :not([data-parked]) > [data-member-id]')].map(card=>({card,rect:card.getBoundingClientRect()})):[];
  // E245.3: covers that stay on screen fly from where they were (orbit <-> orbit, orbit <-> single); the orbit skips its
  // grow-from-centre entrance when it inherits covers.
  const wasOrbit=host.classList.contains('field-orbit');
  window.__megulitOrbitWarm=mode!=='fresh'&&animate&&(wallCards.length>0||!!oldSingle);
  seriesUI.renderLibrary(host);
  if(!animate)return;
  if(mode==='domino'){dominoIn(host,host.getBoundingClientRect());return;}
  if(mode==='fresh'){
    /* E271 (user: entering a search looked like it hitched): the new results appeared all at once on the frame their
       covers finished decoding. Hold them invisible until the covers decode (at most 160 ms), then let them grow in from
       the centre outward, mirroring the wall that just left. The orbit keeps its own entrance. */
    if(host.classList.contains('field-orbit'))return;
    const cards=[...host.querySelectorAll('.field-plane > [data-member-id]:not([data-parked]), .field-plane > :not([data-parked]) > [data-member-id], .field-feature > [data-member-id]')];if(!cards.length)return;
    const inners=cards.map(c=>c.firstElementChild||c);inners.forEach(n=>{n.style.opacity='0';});
    const imgs=[...host.querySelectorAll('img')].slice(0,80);
    Promise.race([Promise.all(imgs.map(i=>i.decode?.().catch(()=>{}))),new Promise(r=>setTimeout(r,160))]).then(()=>requestAnimationFrame(()=>{
      const b=host.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2;
      const dist=cards.map(c=>{const r=c.getBoundingClientRect();return Math.hypot(r.left+r.width/2-cx,r.top+r.height/2-cy);}),max=Math.max(1,...dist);
      inners.forEach((n,i)=>{n.style.opacity='';n.animate([{opacity:0,transform:'scale(.88)'},{opacity:1,transform:'none'}],{duration:420,delay:dist[i]/max*320,
       easing:'cubic-bezier(.22,.72,.24,1)',fill:'backwards'});});
    }));
    return;
  }
  const single=host.querySelector('.field-feature > [data-member-id]');
  if(oldSingle&&oldSingle.dataset.memberId===single?.dataset.memberId)return; /* E276.1: orbit -> orbit has no single on either side; undefined===undefined used to skip every orbit change */
  const bounds=host.getBoundingClientRect();
  const matching=(id,cards)=>cards.filter(({card})=>card.dataset.memberId===id).reduce((closest,{card,rect})=>{
    const distance=Math.hypot(rect.left+rect.width/2-bounds.left-bounds.width/2,rect.top+rect.height/2-bounds.top-bounds.height/2);
    return !closest||distance<closest.distance?{card,rect,distance}:closest;
  },null);
  if(single){
    animateFeatureCard(single,matching(single.dataset.memberId,wallCards)?.rect,bounds);
  }else if(host.classList.contains('field-orbit')){
    // E245.4: entering the orbit, covers that did not match scatter out of the window as ghosts; matches fly into place.
    const before=oldSingle?[{card:oldSingle,rect:oldRect}]:wallCards,kept=new Set();
    const cx0=bounds.left+bounds.width/2,cy0=bounds.top+bounds.height/2,far0=Math.max(innerWidth,innerHeight)*.55;let fresh=0;
    for(const card of host.querySelectorAll('.field-plane > [data-member-id]:not([data-parked]), .field-plane > :not([data-parked]) > [data-member-id]')){const from=matching(card.dataset.memberId,before);if(from){kept.add(from.card);
     flyInner(card,from.rect);continue;}
      /* E276 (user): a cover that comes back into the results flies in from outside onto the orbit */
      const inner=card.firstElementChild;if(!inner)continue;const r=card.getBoundingClientRect(),dx=r.left+r.width/2-cx0,dy=r.top+r.height/2-cy0,l=Math.hypot(dx,
       dy)||1;
      inner.animate([{transform:`translate(${dx/l*far0}px,${dy/l*far0}px) scale(1.05)`,opacity:0},{transform:'none',opacity:1}],{duration:640,delay:Math.min(240,
       fresh++*45),easing:'cubic-bezier(.16,.84,.3,1)',fill:'backwards'});}
    /* E276 (user): covers that drop out of a narrowing search fly outward off the window */
    if(wasOrbit)scatterGhosts(before.filter(x=>!kept.has(x.card)),bounds);
  }else if(wasOrbit&&!search.trim()){
    // leaving the orbit: orbit covers fly out, then the wall returns from the edges inwards like dominoes
    dominoIn(host,bounds);
  }else if(oldSingle){
    const match=matching(oldSingle.dataset.memberId,[...host.querySelectorAll('.field-plane > [data-member-id]:not([data-parked]), .field-plane > :not([data-parked]) > [data-member-id]')].map(card=>({card,rect:card.getBoundingClientRect()})));
    if(match)animateFeatureCard(match.card,oldRect,bounds);
    else host.querySelector('.field-plane')?.animate([{opacity:.35},{opacity:1}],{duration:250,easing:'ease-out'});
  }
}
function scatterGhosts(cards,bounds){
  if(!cards.length)return;const layer=document.createElement('div');layer.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden';
   layer.style.clipPath=`inset(${Math.max(0,bounds.top)}px ${Math.max(0,innerWidth-bounds.right)}px ${Math.max(0,innerHeight-bounds.bottom)}px ${Math.max(0,bounds.left)}px)`;
   /* stay inside the library, never over the top bar */document.body.append(layer);
  const cx=bounds.left+bounds.width/2,cy=bounds.top+bounds.height/2,far=Math.hypot(innerWidth,innerHeight);let done=0;
  for(const {card,rect} of cards.slice(0,80)){const g=card.cloneNode(true);g.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;transform:none;opacity:1`;
   layer.append(g);
   const dx=rect.left+rect.width/2-cx,dy=rect.top+rect.height/2-cy,len=Math.hypot(dx,dy)||1,push=far*.55;
   g.animate([{transform:'none',opacity:1},{transform:`translate(${dx/len*push}px,${dy/len*push}px) scale(.85)`,opacity:0}],{duration:460+Math.random()*120,easing:'cubic-bezier(.55,0,.8,.3)',
    fill:'forwards'}).onfinish=()=>{if(++done>=Math.min(80,cards.length))layer.remove();};}
}
function dominoIn(host,bounds){
  const cx=bounds.left+bounds.width/2,cy=bounds.top+bounds.height/2,cards=[...host.querySelectorAll('.field-plane > [data-member-id]:not([data-parked]), .field-plane > :not([data-parked]) > [data-member-id]')].map(card=>{
   const r=card.getBoundingClientRect(),dx=r.left+r.width/2-cx,dy=r.top+r.height/2-cy;return {card,dx,dy,d:Math.hypot(dx,dy)};});
  const max=Math.max(1,...cards.map(c=>c.d));
  for(const {card,dx,dy,d} of cards){const inner=card.firstElementChild;if(!inner)continue;const len=d||1,out=Math.max(innerWidth,innerHeight)*.5;
   /* E272: a short settle from just outside instead of a long flight, no idle lead-in */const k=Math.min(70,out*.12);inner.animate([{transform:`translate(${dx/len*k}px,${dy/len*k}px) scale(.9)`,
    opacity:0},{transform:'none',opacity:1}],{duration:560,delay:(1-d/max)*380,easing:'cubic-bezier(.16,.84,.3,1)',fill:'backwards'});}
}
function flyInner(card,from){
  const inner=card.firstElementChild;if(!inner)return;const to=card.getBoundingClientRect();
  if(!from||!to.width){inner.animate([{opacity:0,transform:'scale(.7)'},{opacity:1,transform:'none'}],{duration:420,easing:'cubic-bezier(.22,.72,.24,1)'});return;
   }
  const x=from.left+from.width/2-to.left-to.width/2,y=from.top+from.height/2-to.top-to.height/2,k=from.width/to.width;
  inner.animate([{transform:`translate(${x}px,${y}px) scale(${k})`},{transform:'none'}],{duration:560,easing:'cubic-bezier(.22,.72,.24,1)'});
}
function animateFeatureCard(card,from,bounds){
  const to=card.getBoundingClientRect(),base=getComputedStyle(card).transform;
  const scale=from?.width&&to.width?from.width/to.width:.68;
  const x=(from?.width?from.left+from.width/2:bounds.left+bounds.width/2)-to.left-to.width/2;
  const y=(from?.height?from.top+from.height/2:bounds.top+bounds.height/2)-to.top-to.height/2;
  const transform=base==='none'?'':base;
  card.animate([{transform:`translate(${x}px,${y}px) scale(${scale}) ${transform}`,opacity:.66},{transform:base,opacity:getComputedStyle(card).opacity}],{duration:330,
   easing:'cubic-bezier(.22,.72,.24,1)'});
}
let stopSimpleGrid=()=>{};
function showLibraryResults(grid,selecting){
  stopSimpleGrid();stopSimpleGrid=()=>{};
  const host=grid.parentElement,main=host.closest('.main');
  const wall=!selecting&&localStorage.getItem(LIBRARY_WALL_KEY)!=='off';
  host.classList.toggle('lib-field',wall);
  host.classList.toggle('lib-list',!wall);
  if(!wall)stopSimpleGrid=fitLibraryGrid(grid);
  host.classList.toggle('lib-selecting',selecting);
  main.classList.toggle('field-list',!wall);
  main.classList.toggle('field-selecting',selecting);
  const single=wall&&!!search.trim()&&grid.childElementCount===1&&grid.firstElementChild.hasAttribute('data-member-id');
  main.classList.toggle('field-single',single);
  if(single){
    stopField();grid.classList.add('field-feature');
    grid.firstElementChild.draggable=false;
    grid.querySelectorAll('img').forEach(img=>{img.draggable=false;});
    return;
  }
  if(wall){fieldify(grid,!!search.trim());return;}
  stopField();
  if(selecting)grid.querySelectorAll('[draggable],img').forEach(node=>{node.draggable=false;});
}

// E237 Tools → restore Japanese: list library games that ship Japanese data, check one, then apply or undo.
/* Where to look for a game's Japanese release: fill in the site name or address between the quotes.
   Left empty, no search suggestion is shown. */
const JP_SOURCE_SITE='www.shinnku.com、lzacg.cc、www.touchgal.ink';
const jpSourceNote=()=>JP_SOURCE_SITE?({zh:'。建议去（'+JP_SOURCE_SITE+'）搜索这部作品的日文原版(资源左下角会提示是生肉/熟肉,但有时候熟肉也会被判断成生肉,MeguLit只分享平台,不承担任何法律责任。)',en:'. Suggested place to search for the Japanese release: ('+JP_SOURCE_SITE+')',
 ja:'。日本語版は（'+JP_SOURCE_SITE+'）で探すことをおすすめします'})[locale]||'':'';
/* E525 language switch (KiriKiri / Unity setting, Steam language) wording for the restore dialog */
const lsWords={zh:{eng:{kirikiri:'KiriKiri',unity:'Unity'},
 restorable:n=>n.mode==='steam'?'可以切换：这个游戏的语言跟随 Steam，商店有日语。会把本机 Steam 里这个游戏的语言设为日本語（只改本地设置，先备份，可以还原）':'可以切换：游戏自带日文，'+lsEng(n,'zh')+' 的语言设置是 '+lsVal(n)+'，会改成日文（先备份，可以还原）',
 steam:n=>'这个游戏的语言跟随 Steam（现在是 '+(n.steamLanguage||'默认')+'），商店有日语。Steam 正在运行时 MeguLit 不能改：请在 Steam 库里右键这个游戏 → 属性 → 通用 → 语言，选「日本語」；或者完全退出 Steam 后回来点「恢复日文」',
 firstRun:()=>'游戏自带日文，但还没有生成设置文件。请先启动一次游戏到标题画面再退出，然后回来切换',applied:n=>n.engine?'已把游戏语言切换为日文':'已经恢复为日文',open:'打开 Steam 游戏页',done:n=>n.mode==='steam'?'已把 Steam 语言设为日本語，下次启动 Steam 后生效':'已切换为日文，下次启动游戏生效'},
 en:{eng:{kirikiri:'KiriKiri',unity:'Unity'},
 restorable:n=>n.mode==='steam'?'Switchable: this game follows the Steam language and the store lists Japanese. The game’s language in your local Steam is set to Japanese (local setting only, backed up, can be undone)':'Switchable: the game ships Japanese; its '+lsEng(n,'en')+' language setting is '+lsVal(n)+' and will be set to Japanese (backed up, can be undone)',
 steam:n=>'This game follows the Steam language (now '+(n.steamLanguage||'default')+') and the store lists Japanese. MeguLit cannot change it while Steam runs: in the Steam library right-click the game → Properties → General → Language → 日本語, or quit Steam completely and choose Restore Japanese',
 firstRun:()=>'The game ships Japanese but has not written its settings yet. Start it once to the title screen, quit, then switch here',applied:n=>n.engine?'Game language switched to Japanese':'Restored to Japanese',open:'Open Steam game page',done:n=>n.mode==='steam'?'Steam language set to Japanese; takes effect when Steam starts':'Switched to Japanese; takes effect the next time the game starts'},
 ja:{eng:{kirikiri:'KiriKiri',unity:'Unity'},
 restorable:n=>n.mode==='steam'?'切り替えられます：このゲームの言語は Steam に従い、ストアに日本語があります。この PC の Steam でゲームの言語を日本語にします（ローカル設定のみ、バックアップあり、元に戻せます）':'切り替えられます：ゲームに日本語が入っています。'+lsEng(n,'ja')+' の言語設定（'+lsVal(n)+'）を日本語にします（バックアップあり、元に戻せます）',
 steam:n=>'このゲームの言語は Steam に従います（現在 '+(n.steamLanguage||'既定')+'）。Steam 起動中は変更できません。Steam ライブラリでゲームを右クリック → プロパティ → 一般 → 言語 で「日本語」を選ぶか、Steam を完全に終了してから「日本語に戻す」を押してください',
 firstRun:()=>'日本語は入っていますが、設定ファイルがまだありません。一度ゲームをタイトル画面まで起動して終了してから切り替えてください',applied:n=>n.engine?'ゲームの言語を日本語に切り替えました':'日本語に戻してあります',open:'Steam のゲームページを開く',done:n=>n.mode==='steam'?'Steam の言語を日本語にしました。次に Steam を起動したとき有効になります':'日本語に切り替えました。次にゲームを起動したとき有効になります'}};
const lsEng=(n,l)=>(lsWords[l]||lsWords.zh).eng[n.engine]||n.engine||'';
const lsVal=n=>{const c=(n.changes||[])[0];return c?String(c.key)+' = '+String(c.from):'';};
function japaneseRestore(){
 const w={zh:{title:'日文原版恢复',search:'搜索游戏',nomatch:'没有匹配的游戏',sub:'游戏自带日文数据时，把显示的文字换回日文。会先备份，可以随时还原。请先关闭游戏',pick:'选择游戏',none:'游戏库里没有找到带日文数据的游戏',check:'检测中…',apply:'恢复日文',
  undo:'还原',close:'关闭',working:'处理中…',
  st:{'steam-guide':n=>(lsWords[locale]||lsWords.zh).steam(n),'first-run':n=>(lsWords[locale]||lsWords.zh).firstRun(n),restorable:n=>n.adapter==='language-switch'?(lsWords[locale]||lsWords.zh).restorable(n):n.adapter==='yuris-update'?'可以恢复：找到汉化补丁 '+n.files+' 个，会移到备份里，游戏改读自带的日文剧本':'可以恢复：'+n.files+' 个文件，'+n.cells.toLocaleString()+' 处文字',applied:n=>n?.adapter==='language-switch'?(lsWords[locale]||lsWords.zh).applied(n):'已经恢复为日文',
   already:()=>'已经是日文，不需要恢复',unsupported:()=>'这个游戏按语言分文件存放，暂不支持',none:r=>r?.reason==='NO_JAPANESE_TEXT'?'这份游戏文件里没有日文文本，没有可恢复的内容（Steam 版 CLANNAD 就是这样）。需要自己准备这部作品的日文原版或日文化补丁，然后点「从日文原版导入」选它（压缩包、程序或文件夹都行）'+jpSourceNote():'游戏目录里没有扫描到日文剧本。手上有日文原版的话，可以点「从日文原版导入」手动添加（压缩包、程序或文件夹都行）'+jpSourceNote(),
   missing:()=>'找不到游戏目录','translated-only':()=>'这是纯汉化包，里面没有日文文字，没法恢复。请安装日文原版'+jpSourceNote(),importable:()=>'这是纯汉化包，里面没有日文文字。有日文原版的话，点「从日文原版导入」选择原版的启动程序，会把原版剧本导进来（先备份，可以还原）'+jpSourceNote(),
   imported:()=>'已从日文原版导入剧本'},
  done:n=>'已恢复 '+n.applied+' 个文件',undone:n=>n.skipped.length?'已还原 '+n.restored+' 个，'+n.skipped.length+' 个文件被游戏更新改过，保留未动':'已还原 '+n.restored+' 个文件',import:'从日文原版导入',
   imported:n=>'已导入 '+n.imported+' 个剧本文件，之后会用日文原版启动',errs:{IMPORT_SOURCE_NOT_JAPANESE:'请选择日文原版的启动程序，不要选汉化版',IMPORT_SOURCE_SAME_FOLDER:'请选择另一个文件夹里的日文原版',IMPORT_SOURCE_NO_SCRIPT:'这个文件夹里没有剧本文件（nss.npa），请选择完整的日文原版',
   IMPORT_EXE_CONFLICT:'游戏目录里已有同名但内容不同的程序，没有导入',IMPORT_FILE_TOO_LARGE:'剧本文件太大，没有导入',GAME_RUNNING:'游戏正在运行，请先关闭游戏',NOTHING_TO_RESTORE:'没有需要恢复的内容',NOT_APPLIED:'这个游戏还没有恢复过'}},
  en:{title:'Restore Japanese original',search:'Search games',nomatch:'No matching game',sub:'When a game ships its Japanese text, switch the displayed text back to Japanese. Backed up first; undo any time. Close the game first',
   pick:'Game',none:'No game in the library ships Japanese data',check:'Checking…',apply:'Restore Japanese',undo:'Undo',close:'Close',working:'Working…',
  st:{'steam-guide':n=>(lsWords[locale]||lsWords.zh).steam(n),'first-run':n=>(lsWords[locale]||lsWords.zh).firstRun(n),restorable:n=>n.adapter==='language-switch'?(lsWords[locale]||lsWords.zh).restorable(n):n.adapter==='yuris-update'?'Restorable: '+n.files+' Chinese patch archive(s) will be moved to the backup so the game reads its own Japanese scripts':'Restorable: '+n.files+' files, '+n.cells.toLocaleString()+' strings',
   applied:n=>n?.adapter==='language-switch'?(lsWords[locale]||lsWords.zh).applied(n):'Restored to Japanese',already:()=>'Already Japanese',unsupported:()=>'This game stores each language in separate files; not supported yet',none:r=>r?.reason==='NO_JAPANESE_TEXT'?'These game files contain no Japanese text, so there is nothing to restore (the Steam CLANNAD is like this). Get the Japanese release or Japanese patch of this game yourself, then choose Import from Japanese release and pick it (archive, program or folder)'+jpSourceNote():'No Japanese script was found in the game folder. If you have the Japanese release, add it by hand with Import from Japanese release (an archive, the program or a folder all work)'+jpSourceNote(),
   missing:()=>'Game folder not found','translated-only':()=>'This is a Chinese-only package with no Japanese text to restore. Install the Japanese release',importable:()=>'This is a Chinese-only package with no Japanese text. If you have the Japanese release, choose Import from Japanese release and pick its game program; its script files are copied in (backed up, can be undone)',
   imported:()=>'Script imported from the Japanese release'},
  done:n=>'Restored '+n.applied+' files',undone:n=>n.skipped.length?'Undid '+n.restored+'; '+n.skipped.length+' files changed by a game update were left alone':'Undid '+n.restored+' files',
   import:'Import from Japanese release',imported:n=>'Imported '+n.imported+' script files; the game now starts from the Japanese program',errs:{IMPORT_SOURCE_NOT_JAPANESE:'Pick the Japanese release’s game program, not a translated one',
   IMPORT_SOURCE_SAME_FOLDER:'Pick the Japanese release in another folder',IMPORT_SOURCE_NO_SCRIPT:'That folder has no script file (nss.npa); pick a complete Japanese release',
   IMPORT_EXE_CONFLICT:'A different program with the same name is already in the game folder; nothing imported',IMPORT_FILE_TOO_LARGE:'Script file too large; nothing imported',
   GAME_RUNNING:'The game is running; close it first',NOTHING_TO_RESTORE:'Nothing to restore',NOT_APPLIED:'This game has not been restored'}},
  ja:{title:'日本語原版に戻す',search:'ゲームを検索',nomatch:'一致するゲームがありません',sub:'ゲームに日本語データが入っている場合、表示テキストを日本語に戻します。先にバックアップし、いつでも元に戻せます。先にゲームを閉じてください',pick:'ゲーム',none:'日本語データを含むゲームが見つかりません',
   check:'確認中…',apply:'日本語に戻す',undo:'元に戻す',close:'閉じる',working:'処理中…',
  st:{'steam-guide':n=>(lsWords[locale]||lsWords.zh).steam(n),'first-run':n=>(lsWords[locale]||lsWords.zh).firstRun(n),restorable:n=>n.adapter==='language-switch'?(lsWords[locale]||lsWords.zh).restorable(n):n.adapter==='yuris-update'?'復元できます：中国語パッチ '+n.files+' 個をバックアップへ移し、ゲーム本来の日本語スクリプトを読ませます':'復元できます：'+n.files+' ファイル、'+n.cells.toLocaleString()+' 箇所',
   applied:n=>n?.adapter==='language-switch'?(lsWords[locale]||lsWords.zh).applied(n):'日本語に戻してあります',already:()=>'すでに日本語です',unsupported:()=>'言語ごとにファイルが分かれているため、まだ対応していません',none:r=>r?.reason==='NO_JAPANESE_TEXT'?'このゲームファイルには日本語テキストが入っていないため、復元できる内容がありません（Steam 版 CLANNAD など）。この作品の日本語版か日本語化パッチを用意し、「日本語版から取り込む」で選んでください（圧縮ファイル・実行ファイル・フォルダのいずれも可）'+jpSourceNote():'ゲームフォルダに日本語のスクリプトが見つかりませんでした。日本語版をお持ちなら「日本語版から取り込む」で手動で追加できます（圧縮ファイル・実行ファイル・フォルダのいずれも可）'+jpSourceNote(),
   missing:()=>'ゲームフォルダが見つかりません','translated-only':()=>'中国語だけのパッケージで、日本語テキストが入っていません。日本語版をインストールしてください'+jpSourceNote(),importable:()=>'中国語だけのパッケージで、日本語テキストが入っていません。日本語版があれば「日本語版から取り込む」で実行ファイルを選ぶと、シナリオを取り込みます（バックアップあり、元に戻せます）',
   imported:()=>'日本語版からシナリオを取り込みました'},
  done:n=>n.applied+' ファイルを戻しました',undone:n=>n.skipped.length?n.restored+' ファイルを戻しました。更新で変わった '+n.skipped.length+' ファイルはそのままです':n.restored+' ファイルを元に戻しました',import:'日本語版から取り込む',
   imported:n=>n.imported+' 個のシナリオファイルを取り込みました。今後は日本語版で起動します',errs:{IMPORT_SOURCE_NOT_JAPANESE:'中国語版ではなく日本語版の実行ファイルを選んでください',IMPORT_SOURCE_SAME_FOLDER:'別のフォルダにある日本語版を選んでください',
   IMPORT_SOURCE_NO_SCRIPT:'シナリオファイル（nss.npa）がありません。完全な日本語版を選んでください',IMPORT_EXE_CONFLICT:'同じ名前の別の実行ファイルがあるため取り込みませんでした',IMPORT_FILE_TOO_LARGE:'ファイルが大きすぎるため取り込みませんでした',
   GAME_RUNNING:'ゲームが起動中です。先に閉じてください',NOTHING_TO_RESTORE:'戻す内容がありません',NOT_APPLIED:'まだ戻していません'}}};
 const t=w[locale]||w.zh;
 const d=modal(`<header class="jr-head"><span class="jr-eyebrow">${({zh:'工具',en:'Tool',ja:'ツール'})[locale]||'工具'}</span><h2>${t.title}</h2><p class="settings-help">${t.sub}</p></header><p class="tool-key-note">${({zh:'在 Steam 买的、只显示中文 / 英文的游戏（比如 Key 社的 Summer Pockets），一定要先运行这个工具，否则 MeguLit 读到的是中文或英文，用不了',en:'Games bought on Steam that only show Chinese or English (such as Key’s Summer Pockets) must go through this tool first, otherwise MeguLit only gets the translated text',ja:'Steam 版で中国語・英語しか表示されないゲーム（Key の Summer Pockets など）は、先にこのツールを実行してください。実行しないと翻訳文しか取得できません'})[locale]||''}</p><div data-jr-body><p class="muted">${t.check}</p></div><div class="dialog-actions"><button type="button" class="secondary jr-close" data-jr-close>${t.close}</button><button type="button" class="secondary" data-jr-undo hidden>${t.undo}</button><button type="button" class="primary" data-jr-import hidden>${t.import}</button><button type="button" class="secondary" data-jr-steam hidden>${(lsWords[locale]||lsWords.zh).open}</button><button type="button" class="primary" data-jr-apply hidden>${t.apply}</button></div>`);
 d.classList.add('jr-dialog'); /* E271 (user: the window behind the tool card needs the same care) */
 d.showModal();d.querySelector('[data-jr-close]').onclick=()=>d.close();
 let lastState='';const body=d.querySelector('[data-jr-body]'),applyBtn=d.querySelector('[data-jr-apply]'),undoBtn=d.querySelector('[data-jr-undo]'),importBtn=d.querySelector('[data-jr-import]'),steamBtn=d.querySelector('[data-jr-steam]');
  let id='';
 const fail=e=>{const c=typeof e==='string'?e:e?.message;toast(t.errs[c]||errorMessage(e));};
 /* E328 the files moved aside were the translation patch: say when zero-latency translation now uses it */
 const zeroNote=r=>r?.patch?({zh:'；被换下的汉化补丁已用作零延迟翻译',en:'; the translation patch that was moved aside now gives zero-latency translation',ja:'。外した中国語パッチをゼロ遅延翻訳に使います'})[locale]||'':'';
 const show=async()=>{applyBtn.hidden=undoBtn.hidden=importBtn.hidden=steamBtn.hidden=true;const status=body.querySelector('[data-jr-status]');status.dataset.state='checking';status.textContent=t.check;
  try{const r=await api('jp_restore_detect',{id});status.dataset.state=t.st[r.state]?r.state:'none';status.textContent=(t.st[r.state]||t.st.none)(r);applyBtn.hidden=r.state!=='restorable';steamBtn.hidden=!(r.adapter==='language-switch'&&r.appid&&(r.state==='steam-guide'||r.mode==='steam'));
   undoBtn.hidden=r.state!=='applied'&&r.state!=='imported';lastState=r.state;importBtn.hidden=['imported','applied'].includes(r.state)||r.adapter==='language-switch';}catch(e){status.dataset.state='';
   status.textContent='';fail(e);}};
 const run=async(action,button,message)=>{applyBtn.disabled=undoBtn.disabled=true;const label=button.textContent;button.textContent=t.working;
  try{const r=await api(action,{id});toast(message(r)+zeroNote(r));}catch(e){fail(e);}finally{button.textContent=label;applyBtn.disabled=undoBtn.disabled=false;
   show();}};
 applyBtn.onclick=()=>run('jp_restore_apply',applyBtn,r=>r?.mode?(lsWords[locale]||lsWords.zh).done(r):t.done(r));
 steamBtn.onclick=()=>api('jp_restore_steam',{id}).catch(fail);
 /* E280: Chinese-only package, the user picks the Japanese original's program and its script archives are copied in */
 /* E327 import from a Japanese original the user already has: an archive (zip/7z/rar), its game program or its folder.
    The files to swap are listed first; nothing is written until the user confirms. Nitroplus Chinese-only packages keep
    the E280 program pick. */
 const iw=({zh:{lead:'选择你手上的日文原版：可以是下载好的压缩包（zip / 7z / rar）、它的启动程序，或者解压后的文件夹。MeguLit 会先列出要换的文件，确认后才替换；被换下的文件都会备份，可以一键还原'+jpSourceNote(),file:'选压缩包或程序',folder:'选文件夹',
  title:'选择日文原版的压缩包（zip / 7z / rar）或启动程序',reading:'正在读取（压缩包较大时需要解压，请稍等）…',sum:p=>'将替换 '+p.replace.length+' 个文件，新增 '+p.add.length+' 个，把 '+p.remove.length+' 个汉化补丁移到备份'+(p.exe?'；之后用 '+p.exe+' 启动':''),
  list:'查看文件列表',confirm:'确认导入',cancel:'取消',done:n=>'已导入：替换 '+n.replaced+' 个，新增 '+n.added+' 个，移走 '+n.removed+' 个',kinds:{replace:'替换',add:'新增',remove:'移到备份'},errs:{
  IMPORT_SOURCE_NO_MATCH:'没在里面找到这个游戏的文件，请确认选的是同一部作品的日文原版',IMPORT_SAYA_NEEDS_PAK:'Steam 版沙耶之歌要从 2003 年日文原版移植剧本：请选原版文件夹（里面有 script.pak 和 saya.exe）或它的压缩包',SAYA_VERIFY_HASH:'生成的日文剧本校验失败，游戏文件没有改动',
  RESTORE_HASH_MISMATCH:'还原后的 script.npk 和备份的原文件不一致，请勿启动游戏并反馈',IMPORT_DISC_UNREADABLE:'读不出这个光盘镜像的内容，可以先用虚拟光驱挂载后选里面的文件夹',IMPORT_DISC_INSTALLER:'这张光盘里是安装程序，请先安装游戏再选安装好的文件夹',
  IMPORT_DISC_IMAGE:'这是光盘镜像（bin / cue / iso 等），里面是安装程序，不是游戏本体。请先用虚拟光驱挂载（iso 可以直接双击）并安装游戏，再在这里选安装好的文件夹或游戏程序',IMPORT_SOURCE_TYPE:'请选择压缩包（zip / 7z / rar）、游戏程序或文件夹',
  IMPORT_SOURCE_MISSING:'找不到选择的文件',IMPORT_EXTRACT_FAILED:'解压失败（可能有密码或文件损坏），可以先自己解压，再选解压后的文件夹',IMPORT_TOO_LARGE:'需要新增的文件超过 4 GB，看起来不是同一个游戏，没有导入',IMPORT_TOO_MANY_FILES:'文件太多，看起来选的不是单个游戏',
  NOTHING_TO_IMPORT:'日文原版和现在的文件一样，不需要导入',ALREADY_IMPORTED:'已经导入过，先还原再重新导入'}},
  en:{lead:'Pick the Japanese release you have: a downloaded archive (zip / 7z / rar), its game program, or its unpacked folder. MeguLit lists the files to swap first and only replaces them after you confirm; every replaced file is backed up and can be undone'+jpSourceNote(),
   file:'Archive or program',folder:'Folder',title:'Pick the Japanese release archive (zip / 7z / rar) or game program',reading:'Reading (large archives take a moment to unpack)…',
   sum:p=>'Replaces '+p.replace.length+' files, adds '+p.add.length+', moves '+p.remove.length+' Chinese patch files to the backup'+(p.exe?'; then starts with '+p.exe:''),
   list:'Show files',confirm:'Import',cancel:'Cancel',done:n=>'Imported: '+n.replaced+' replaced, '+n.added+' added, '+n.removed+' moved aside',kinds:{replace:'replace',
   add:'add',remove:'move aside'},errs:{IMPORT_SOURCE_NO_MATCH:'No files of this game were found there; pick the Japanese release of the same title',IMPORT_SAYA_NEEDS_PAK:'Steam The Song of Saya takes its Japanese script from the 2003 release: pick that folder (with script.pak and saya.exe) or its archive',
   SAYA_VERIFY_HASH:'The generated Japanese script failed its check; game files were not changed',RESTORE_HASH_MISMATCH:'The restored script.npk does not match the backed-up original; do not start the game and report this',
   IMPORT_DISC_UNREADABLE:'This disc image could not be read; mount it with a virtual drive and pick the folder inside',IMPORT_DISC_INSTALLER:'This disc holds an installer; install the game first and pick the installed folder',
   IMPORT_DISC_IMAGE:'This is a disc image (bin / cue / iso and similar) holding an installer, not the game. Mount it with a virtual drive (an iso opens with a double-click), install the game, then pick the installed folder or game program here',
   IMPORT_SOURCE_TYPE:'Pick an archive (zip / 7z / rar), the game program or a folder',IMPORT_SOURCE_MISSING:'The selected file was not found',IMPORT_EXTRACT_FAILED:'Could not unpack (password or damaged archive); unpack it yourself and pick the folder',
   IMPORT_TOO_LARGE:'More than 4 GB would be added, which does not look like the same game; nothing imported',IMPORT_TOO_MANY_FILES:'Too many files; that does not look like a single game',
   NOTHING_TO_IMPORT:'The Japanese release matches the current files; nothing to import',ALREADY_IMPORTED:'Already imported; undo first to import again'}},
  ja:{lead:'お手元の日本語版を選んでください：ダウンロードした圧縮ファイル（zip / 7z / rar）、実行ファイル、または展開済みフォルダ。差し替えるファイルを先に一覧表示し、確認後に置き換えます。置き換えたファイルはバックアップされ、元に戻せます'+jpSourceNote(),file:'圧縮ファイル・実行ファイル',
   folder:'フォルダ',title:'日本語版の圧縮ファイル（zip / 7z / rar）または実行ファイルを選択',reading:'読み込み中（大きな圧縮ファイルは展開に時間がかかります）…',sum:p=>p.replace.length+' ファイルを置き換え、'+p.add.length+' 個を追加、中国語パッチ '+p.remove.length+' 個をバックアップへ移動'+(p.exe?'。以後 '+p.exe+' で起動':''),
   list:'ファイル一覧',confirm:'取り込む',cancel:'キャンセル',done:n=>'取り込み完了：置き換え '+n.replaced+'、追加 '+n.added+'、移動 '+n.removed,kinds:{replace:'置き換え',add:'追加',remove:'移動'},errs:{
   IMPORT_SOURCE_NO_MATCH:'このゲームのファイルが見つかりません。同じ作品の日本語版を選んでください',IMPORT_SAYA_NEEDS_PAK:'Steam 版『沙耶の唄』は 2003 年の日本語版からシナリオを移植します。script.pak と saya.exe のあるフォルダかその圧縮ファイルを選んでください',
   SAYA_VERIFY_HASH:'生成した日本語シナリオの検証に失敗しました。ゲームファイルは変更していません',RESTORE_HASH_MISMATCH:'復元した script.npk がバックアップの元ファイルと一致しません。ゲームを起動せず報告してください',IMPORT_DISC_UNREADABLE:'このディスクイメージを読めません。仮想ドライブでマウントして中のフォルダを選んでください',
   IMPORT_DISC_INSTALLER:'このディスクはインストーラーです。先にインストールしてからインストール先のフォルダを選んでください',IMPORT_DISC_IMAGE:'これはディスクイメージ（bin / cue / iso など）で、中身はインストーラーです。仮想ドライブでマウントして（iso はダブルクリックで開けます）インストールしてから、インストール先のフォルダか実行ファイルを選んでください',
   IMPORT_SOURCE_TYPE:'圧縮ファイル（zip / 7z / rar）、実行ファイル、フォルダのいずれかを選んでください',IMPORT_SOURCE_MISSING:'選択したファイルが見つかりません',IMPORT_EXTRACT_FAILED:'展開できませんでした（パスワード付きか破損）。先に展開してフォルダを選んでください',
   IMPORT_TOO_LARGE:'追加が 4 GB を超えるため、同じゲームではなさそうです。取り込みませんでした',IMPORT_TOO_MANY_FILES:'ファイルが多すぎます。単体のゲームではなさそうです',NOTHING_TO_IMPORT:'日本語版と現在のファイルが同じため、取り込む必要はありません',
   ALREADY_IMPORTED:'取り込み済みです。元に戻してから再度取り込んでください'}}})[locale]||null;
 const IWD=iw||{};Object.assign(t.errs,IWD.errs||{});
 const panel=()=>body.querySelector('[data-jr-import-panel]');
 const closePanel=()=>{const el=panel();if(el){el.hidden=true;el.innerHTML='';}};
 const previewFrom=async source=>{const el=panel();if(!source||!el)return;el.innerHTML=`<p class="settings-help">${IWD.reading}</p>`;
  try{const p=await api('jp_import_preview',{id,source});
   /* E338: a Japanese release of another build (Steam Saya vs the 2003 disc) shares no files: set it up as its own copy */
   /* E339: the disc holds an installer: it was turned into an .iso the user mounts and installs from */
   if(p.state==='installer'){const IT=({zh:{text:x=>'这张光盘里是安装程序（游戏本体装在安装包里），不能直接拿来用。已经转换成「'+x.iso+'」：双击它就能像光盘一样打开，运行里面的 Setup.exe 安装游戏，装好后回到这里点「选文件夹」，选安装好的游戏文件夹',
    show:'在文件夹中显示'},en:{text:x=>'This disc holds an installer (the game is packed inside it), so it cannot be used directly. It has been turned into "'+x.iso+'": double-click it to open it like a disc, run Setup.exe inside to install the game, then come back, choose Folder and pick the installed game folder',
    show:'Show in folder'},ja:{text:x=>'このディスクの中身はインストーラーで（ゲーム本体はパッケージ内）、そのままでは使えません。「'+x.iso+'」に変換しました。ダブルクリックでディスクとして開けるので、中の Setup.exe でインストールしてから、ここで「フォルダ」を選びインストール先を指定してください',
    show:'フォルダで表示'}})[locale]||null;
    el.innerHTML=`<p class="jr-import-sum">${esc(IT.text(p))}</p><div class="jr-import-actions"><button type="button" class="secondary" data-jr-cancel>${IWD.cancel}</button><button type="button" class="primary" data-jr-reveal>${IT.show}</button></div>`;
    el.querySelector('[data-jr-cancel]').onclick=()=>{api('jp_import_cancel',{id}).catch(()=>{});closePanel();};
    el.querySelector('[data-jr-reveal]').onclick=()=>api('jp_import_reveal',{id,path:p.iso}).catch(fail);
    return;}
   /* E409: Steam Saya + the 2003 Japanese script.pak: the Japanese script is ported into the Steam script.npk (HD kept) */
   if(p.state==='port'){const pct=x=>(Math.round((x.rate||0)*1000)/10)+'%',PT=({zh:{text:x=>'识别到 Steam 版《沙耶之歌》和 2003 年日文原版：可以把原版的日文剧本移植进 Steam 版的 script.npk，保留高清画面和现在的启动程序。Steam 版 '+x.textLines+' 句里对上了 '+x.matched+' 句（'+pct(x)+'）'+(x.cut?'；原版另有 '+x.cut+' 句是 Steam 版删减的内容，无法加入':'')+'。原来的 script.npk 会先备份，随时可以还原',
    ok:'移植日文剧本',done:x=>'已移植日文剧本（对齐 '+pct(x)+'）'},en:{text:x=>'Steam The Song of Saya and the 2003 Japanese release found: the Japanese script can be ported into the Steam script.npk, keeping the HD pictures and the current program. '+x.matched+' of '+x.textLines+' Steam lines matched ('+pct(x)+')'+(x.cut?'; '+x.cut+' Japanese lines belong to scenes the Steam release cut and cannot be added':'')+'. The current script.npk is backed up and can be restored any time',
    ok:'Port Japanese script',done:x=>'Japanese script ported ('+pct(x)+' aligned)'},ja:{text:x=>'Steam 版『沙耶の唄』と 2003 年の日本語版を検出しました。日本語版のシナリオを Steam 版の script.npk に移植でき、HD 画質と今の実行ファイルはそのままです。Steam 版 '+x.textLines+' 行中 '+x.matched+' 行が一致（'+pct(x)+'）'+(x.cut?'。日本語版の '+x.cut+' 行は Steam 版でカットされた場面のため追加できません':'')+'。今の script.npk はバックアップされ、いつでも戻せます',
    ok:'日本語シナリオを移植',done:x=>'日本語シナリオを移植しました（一致 '+pct(x)+'）'}})[locale]||null;
    el.innerHTML=`<p class="jr-import-sum">${esc(PT.text(p))}</p><div class="jr-import-actions"><button type="button" class="secondary" data-jr-cancel>${IWD.cancel}</button><button type="button" class="primary" data-jr-confirm>${esc(PT.ok)}</button></div>`;
    el.querySelector('[data-jr-cancel]').onclick=()=>{api('jp_import_cancel',{id}).catch(()=>{});closePanel();};
    el.querySelector('[data-jr-confirm]').onclick=async event=>{const b=event.currentTarget;b.disabled=true;b.textContent=t.working;
     try{const r=await api('jp_import_apply',{id,source});toast(PT.done(r)+zeroNote(r));model=await api('home');closePanel();}catch(e){fail(e);b.disabled=false;
      b.textContent=PT.ok;}finally{show();}};
    return;}
   if(p.state==='separate'){const SW=({zh:{text:x=>'这个日文原版和你现在的游戏不是同一个版本（文件完全不同），没法逐个替换。'+(x.copy?'可以把它解压到「'+x.target+'」':'可以直接使用这个文件夹')+'，以后这部作品就用它的 '+x.exe+' 以日文环境启动；原来的游戏文件不动，随时可以在「日文原版启动程序」里换回去',
    ok:x=>x.copy?'解压并设为日文原版':'设为日文原版',done:x=>'已设为日文原版：'+x.exe},en:{text:x=>'This Japanese release is a different build from your game (no shared files), so files cannot be swapped. '+(x.copy?'It can be unpacked to "'+x.target+'"':'This folder can be used as it is')+', and the game will then start from its '+x.exe+' in the Japanese environment. Your current game files stay untouched; switch back any time under Japanese original program',
    ok:x=>x.copy?'Unpack and use as Japanese release':'Use as Japanese release',done:x=>'Japanese release set: '+x.exe},ja:{text:x=>'この日本語版は現在のゲームと別のビルドで、共通のファイルがないため置き換えできません。'+(x.copy?'「'+x.target+'」に展開し':'このフォルダをそのまま使い')+'、以後この作品は '+x.exe+' を日本語環境で起動します。今のゲームファイルはそのままで、「日本語版の実行ファイル」からいつでも戻せます',
    ok:x=>x.copy?'展開して日本語版に設定':'日本語版に設定',done:x=>'日本語版に設定しました：'+x.exe}})[locale]||null;
    el.innerHTML=`<p class="jr-import-sum">${esc(SW.text(p))}</p><div class="jr-import-actions"><button type="button" class="secondary" data-jr-cancel>${IWD.cancel}</button><button type="button" class="primary" data-jr-confirm>${esc(SW.ok(p))}</button></div>`;
    el.querySelector('[data-jr-cancel]').onclick=()=>{api('jp_import_cancel',{id}).catch(()=>{});closePanel();};
    el.querySelector('[data-jr-confirm]').onclick=async event=>{const b=event.currentTarget;b.disabled=true;b.textContent=t.working;
     try{const r=await api('jp_import_apply',{id,source});toast(SW.done(r));model=await api('home');closePanel();}catch(e){fail(e);b.disabled=false;b.textContent=SW.ok(p);
      }finally{show();}};
    return;}
   const rows=[...p.replace.map(f=>['replace',f]),...p.remove.map(f=>['remove',f]),...p.add.map(f=>['add',f])];
   el.innerHTML=`<p class="jr-import-sum">${esc(IWD.sum(p))}</p><details class="jr-import-list"><summary>${IWD.list}</summary><ul>${rows.slice(0,300).map(([k,f])=>`<li><span class="jr-kind" data-kind="${k}">${IWD.kinds[k]}</span>${esc(f.file)}</li>`).join('')}${rows.length>300?`<li>… ${rows.length-300}</li>`:''}</ul></details><div class="jr-import-actions"><button type="button" class="secondary" data-jr-cancel>${IWD.cancel}</button><button type="button" class="primary" data-jr-confirm ${p.changes?'':'disabled'}>${IWD.confirm}</button></div>`;
   el.querySelector('[data-jr-cancel]').onclick=()=>{api('jp_import_cancel',{id}).catch(()=>{});closePanel();};
   el.querySelector('[data-jr-confirm]').onclick=async event=>{const b=event.currentTarget;b.disabled=true;b.textContent=t.working;
    try{const r=await api('jp_import_apply',{id,source});toast(IWD.done(r)+zeroNote(r));model=await api('home');closePanel();}catch(e){fail(e);b.disabled=false;
     b.textContent=IWD.confirm;}finally{show();}};}
  catch(e){closePanel();fail(e);}};
 importBtn.onclick=async()=>{
  if(lastState==='importable'){let source='';try{source=await invoke('pick_executable',{});}catch(e){fail(e);return;}if(!source)return;importBtn.disabled=true;const label=importBtn.textContent;
   importBtn.textContent=t.working;
   try{const r=await api('jp_import_apply',{id,source});toast(t.imported(r)+zeroNote(r));model=await api('home');}catch(e){fail(e);}finally{importBtn.textContent=label;
    importBtn.disabled=false;show();}return;}
  const el=panel();if(!el)return;el.hidden=false;el.innerHTML=`<p class="settings-help">${IWD.lead}</p><div class="jr-import-actions"><button type="button" class="secondary" data-jr-folder>${IWD.folder}</button><button type="button" class="primary" data-jr-file>${IWD.file}</button></div>`;
  el.querySelector('[data-jr-file]').onclick=async()=>{let source='';try{source=await invoke('pick_patch_file',{title:IWD.title});}catch(e){fail(e);return;}previewFrom(source);
   };
  el.querySelector('[data-jr-folder]').onclick=async()=>{let list=[];try{list=await invoke('pick_directories',{multiple:false});}catch(e){fail(e);return;}previewFrom(list?.[0]);
   };};
 undoBtn.onclick=()=>run('jp_restore_undo',undoBtn,t.undone);

 api('jp_restore_list').then(list=>{if(!list.length){body.innerHTML=`<p class="muted">${t.none}</p>`;return;}
  // E238 picker: a small searchable library (covers, title filter) instead of a long select
  const games=list.map(g=>({...g,...(model.games.find(m=>m.id===g.id)||{})}));
  body.innerHTML=`<input type="search" class="jr-search" placeholder="${t.search}" aria-label="${t.search}" autocomplete="off"><div class="jr-grid" role="listbox" aria-label="${t.pick}"></div><p data-jr-status class="settings-help" role="status"></p><div class="jr-import" data-jr-import-panel hidden></div>`;
  const grid=body.querySelector('.jr-grid'),search=body.querySelector('.jr-search');
  const pick=gid=>{id=gid;grid.querySelectorAll('[role=option]').forEach(o=>o.setAttribute('aria-selected',String(o.dataset.id===gid)));show();};
  const draw=()=>{const q=search.value.trim().toLowerCase(),shown=games.filter(g=>!q||String(g.title).toLowerCase().includes(q));
   grid.innerHTML=shown.length?shown.map(g=>`<button type="button" role="option" class="jr-item" data-id="${esc(g.id)}" aria-selected="${g.id===id}"><span class="jr-art">${cover(g,'jr-cover')}<i class="jr-check" aria-hidden="true"></i></span><span class="jr-name">${esc(g.title)}</span></button>`).join(''):`<p class="muted">${t.nomatch}</p>`;
   grid.querySelectorAll('[role=option]').forEach(o=>o.onclick=()=>pick(o.dataset.id));};
  search.oninput=draw;id=games[0].id;draw();show();}).catch(fail);
}
function modal(html){const dialog=document.createElement('dialog');dialog.innerHTML=html;document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),
 {once:true});dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
 }});dialog.showModal();return dialog;}
function gameDetail(id){if(!model.games.some(game=>game.id===id))return;gameOrigin=route==='home'?'home':route==='series'?'series':'library';selectedGameId=id;navigate('game');
 }

const libraryActions={
 zh:['移出游戏库','彻底删除本地记录','刷新游戏库后，仍安装的作品会重新出现。阅读和学习记录会保留','将清除此作品在 MeguLit 的阅读、关联例句和统计。游戏文件及存档会保留','隐藏作品','已隐藏。可在设置 → 学习与数据 → 游戏库恢复','请先关闭正在记录的游戏'],
 en:['Remove from library','Delete local records','If the game is still installed, refreshing the library brings it back with its records.','This clears reading history, linked examples and statistics in MeguLit. Game files and saves are kept.',
  'Hide game','Hidden. Restore it in Settings → Study and data → Library.','Close the game before deleting its active reading records.'],
 ja:['ライブラリから除外','ローカル記録を完全に削除','ゲームが残っていれば、更新で記録と一緒に再表示されます','読書履歴、関連例文、統計を削除します。ゲームファイルとセーブは残ります','作品を非表示','非表示にしました。設定 → 学習・データ → ライブラリで復元できます','記録中のゲームを閉じてください']
};
function removeGame(id){
 const game=model.games.find(g=>g.id===id);if(!game)return;
 const [remove,purge,removeHint,purgeHint]=libraryActions[locale];
 const dialog=modal(`<h2>${text.removeGameTitle}</h2><p>${esc(game.title)}</p><div class="dialog-actions"><button class="secondary" data-cancel>${text.cancel}</button><button class="secondary" data-remove>${remove}</button><button class="primary" data-purge>${purge}</button></div>`);
 dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
 function confirm(permanent){
  dialog.close();
  const label=permanent?purge:remove;
  const next=modal(`<h2>${label}</h2><p>${esc(game.title)}</p><p>${permanent?purgeHint:removeHint}</p><div class="dialog-actions"><button class="secondary" data-cancel>${text.cancel}</button><button class="primary" data-confirm>${label}</button></div>`);
  next.querySelector('[data-cancel]').onclick=()=>next.close();
  next.querySelector('[data-confirm]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;
   try{await api('remove_game',{id,permanent});next.close();model=await api('home');if(route==='game')navigate('library');else renderRoute();toast(text.removedGame);
    }
   catch(error){button.disabled=false;toast((error?.message||error)==='GAME_RECORDING_ACTIVE'?libraryActions[locale][6]:errorMessage(error));}
  };
 }
 dialog.querySelector('[data-remove]').onclick=()=>confirm(false);
 dialog.querySelector('[data-purge]').onclick=()=>confirm(true);
}
let contextMenu=null;
function closeContextMenu(){contextMenu?.remove();contextMenu=null;}
document.addEventListener('contextmenu',event=>{
  event.preventDefault();closeContextMenu();
  const card=event.target.closest('[data-game],[data-edit],[data-launch]');
  const id=card?.dataset.game||card?.dataset.edit||card?.dataset.launch||event.target.closest('.hero')?.querySelector('[data-launch]')?.dataset.launch;
  const items=id?[
    {label:text.continue,symbol:'play',run:button=>startGame(id,button)},
    {label:text.detail,symbol:'game',run:()=>gameDetail(id)},
    {label:text.editGame,symbol:'edit',run:()=>editGame(id)},
    {label:messages[locale].series.addTo,symbol:'layers',run:()=>seriesUI.chooseCollection([id])},
    {label:libraryActions[locale][4],symbol:'game',run:async()=>{await api('set_game_hidden',{id,hidden:true});model=await api('home');renderRoute();toast(libraryActions[locale][5]);
     }},
    {label:text.removeGame,symbol:'trash',danger:true,run:()=>removeGame(id)},
  ]:[{label:text.contextRefresh,symbol:'refresh',run:async()=>{await refreshLibrary();renderRoute();}}];
  const menu=contextMenu=document.createElement('div');menu.className='context-menu';menu.setAttribute('role','menu');
  menu.innerHTML=items.map((item,index)=>`<button role="menuitem" data-index="${index}" ${item.danger?'class="danger"':''}>${icon(item.symbol)}<span>${esc(item.label)}</span></button>`).join('');
   document.body.append(menu);
  const rect=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(event.clientX,innerWidth-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,
   innerHeight-rect.height-8))+'px';
  menu.querySelectorAll('button').forEach(button=>button.onclick=async()=>{const item=items[Number(button.dataset.index)];closeContextMenu();try{await item.run(button);
   }catch(error){toast(errorMessage(error));}});
  menu.querySelector('button')?.focus();
},true);
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.context-menu'))closeContextMenu();},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeContextMenu();else if(contextMenu&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();
 const buttons=[...contextMenu.querySelectorAll('button')];let index=buttons.indexOf(document.activeElement);buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
 }});
addEventListener('blur',closeContextMenu);addEventListener('resize',closeContextMenu);addEventListener('scroll',closeContextMenu,true);
function editGame(id){
  const game=model.games.find(g=>g.id===id);
  /* E281 (user: polish the add game dialog): the program comes first as one large card that shows the file name and its
     folder; picking it fills the name from the folder when the name is still empty. Paths can still be typed. */
  const words=({zh:{kicker:'书架',sub:'选好游戏程序，名字会自动填上',pick:'选择游戏程序',pickSub:'游戏文件夹里的 .exe',change:'更换',path:'或直接粘贴路径',name:'游戏名称',namePh:'选好程序后自动填写'},
   en:{kicker:'Library',sub:'Pick the game program; the name fills itself in',pick:'Choose the game program',pickSub:'The .exe in the game folder',change:'Change',
    path:'or paste a path',name:'Game name',namePh:'Filled in after picking the program'},
   ja:{kicker:'ライブラリ',sub:'実行ファイルを選ぶと名前が自動で入ります',pick:'実行ファイルを選択',pickSub:'ゲームフォルダ内の .exe',change:'変更',path:'またはパスを貼り付け',name:'作品名',namePh:'実行ファイルを選ぶと自動入力'}})[locale]||{
    };
  const dialog=modal(`<header class="game-dialog-head"><span class="game-dialog-kicker">${words.kicker}</span><h2>${game?text.editGame:text.addGame}</h2><p>${words.sub}</p></header><form id="game-form" class="game-form"><button type="button" class="exe-card" id="pick-exe" aria-label="${text.selectFile}"><span class="exe-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/><path d="M12 11v5M9.5 13.5h5"/></svg></span><span class="exe-card-text"><strong data-exe-name>${words.pick}</strong><small data-exe-dir>${words.pickSub}</small></span><span class="exe-card-action" data-exe-action>${({zh:'浏览…',en:'Browse…',ja:'参照…'})[locale]}</span></button><label class="form-label game-path-label" for="game-exe">${text.executable} · ${words.path}</label><input id="game-exe" class="form-input game-path" required spellcheck="false" autocomplete="off" value="${esc(game?.executable||'')}"><label class="form-label" for="game-title">${words.name||text.gameTitle}</label><input id="game-title" class="form-input game-name" required maxlength="240" placeholder="${esc(words.namePh||'')}" value="${esc(game?.title||'')}">${game?`<label class="form-label" for="game-vndb">VNDB</label><input id="game-vndb" class="form-input" spellcheck="false" autocomplete="off" value="${esc(game.vndbId||'')}" placeholder="${({zh:'v12345 或 https://vndb.org/v12345，留空则自动匹配',en:'v12345 or https://vndb.org/v12345; leave empty to match automatically',ja:'v12345 または https://vndb.org/v12345（空欄で自動）'})[locale]}"><span class="form-label">${({zh:'封面',en:'Cover',ja:'カバー画像'})[locale]}</span><div class="image-picker"><img id="game-cover-preview" alt="" src="${esc(game.cover||'')}" ${game.cover?'':'hidden'}><button type="button" class="secondary" id="pick-cover">${({zh:'更换封面…',en:'Change cover…',ja:'画像を変更…'})[locale]}</button></div>`:''}<div class="dialog-actions"><button type="button" class="secondary" id="cancel-game">${text.cancel}</button><button class="primary" type="submit">${text.save}</button></div></form>`);
  dialog.classList.add('game-dialog');
  const exeInput=dialog.querySelector('#game-exe'),titleInput=dialog.querySelector('#game-title');
  const showExe=()=>{const value=exeInput.value.trim(),parts=value.split(/[\\/]+/).filter(Boolean),card=dialog.querySelector('#pick-exe');card.classList.toggle('picked',
   !!value);
   dialog.querySelector('[data-exe-name]').textContent=value?parts.at(-1):words.pick;dialog.querySelector('[data-exe-dir]').textContent=value?parts.slice(0,-1).join('\\'):words.pickSub;
   dialog.querySelector('[data-exe-action]').textContent=value?words.change:({zh:'浏览…',en:'Browse…',ja:'参照…'})[locale];};
  const folderName=value=>{const parts=String(value).split(/[\\/]+/).filter(Boolean);return (parts.at(-2)||'').trim();};
  exeInput.addEventListener('input',showExe);showExe();
  dialog.querySelector('#cancel-game').addEventListener('click',()=>dialog.close());
  // A picked cover is saved at once, like a series cover; automatic metadata refresh keeps it.
  dialog.querySelector('#pick-cover')?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{const path=await invoke('pick_image');
   if(!path)return;const result=await api('game_cover',{id,path});const preview=dialog.querySelector('#game-cover-preview');preview.src=result.cover;preview.hidden=!result.cover;
   model=await api('home');renderRoute();toast(text.saved);}catch(error){toast(errorMessage(error));}finally{button.disabled=false;}});
  dialog.querySelector('#pick-exe').addEventListener('click',async()=>{try{const directory=game?(await api('game_original_executable',{id})).directory:undefined;
   const file=await invoke('pick_executable',{directory});if(file){exeInput.value=file;showExe();if(!titleInput.value.trim()){titleInput.value=folderName(file);
   }}}catch{toast(text.serviceFailed);}});
  // The VNDB entry is sent only when it was edited; a new entry refreshes the game's metadata right away.
  dialog.querySelector('#game-form').addEventListener('submit',async event=>{event.preventDefault();try{const vndbInput=dialog.querySelector('#game-vndb'),vndb=vndbInput&&vndbInput.value.trim()!==(game?.vndbId||'')?vndbInput.value:undefined;
   const saved=await api('save_game',{id,title:dialog.querySelector('#game-title').value,executable:dialog.querySelector('#game-exe').value,vndb});dialog.close();
   model=await api('home');renderRoute();toast(text.gameSaved);if(saved?.vndbChanged)api('game_enrich',{id,locale,refresh:true}).then(async()=>{model=await api('home');
   renderRoute();}).catch(()=>{});}catch(error){toast(errorMessage(error));}});
}
async function history(token){
  const main=document.querySelector('#main');if(!['sessions','dialogue'].includes(subtab))subtab='sessions';
  main.innerHTML=heading(text.history,`<button class="text-button" data-history-font>${({zh:'字体与排版',en:'Font and spacing',ja:'フォントと行間'})[locale]}</button>`)+tabs(['sessions',
   'dialogue'])+`<div id="history-content">${loading()}</div>`;bindTabs('history');main.querySelector('[data-history-font]').onclick=()=>{settingsSection='reader';
   navigate('settings');};
  const items=await api(subtab==='sessions'?'history':'dialogue');if(token!==pageToken)return;
  const target=main.querySelector('#history-content');
  /* E458 历史 in the home / detail language: the latest game's blurred cover as the stage, a big outline 史, crop marks */
  {const latest=items.map(i=>model.games.find(g=>g.id===i.game_id)).find(g=>g?.cover);main.querySelector('.dtv-bg')?.remove();main.querySelector('.dtv-marks')?.remove();
   main.insertAdjacentHTML('afterbegin',`<div class="dtv-bg history-backdrop" aria-hidden="true" style="--dtv-cover:${latest?`url(&quot;${esc(latest.cover)}&quot;)`:'none'}"><i class="dtv-glyph">史</i></div><div class="dtv-marks" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`);
    }
  target.innerHTML=historyHTML(items,{mode:subtab,locale,text,esc,icon,duration,datetime,number,games:model.games,cover,empty});attachGameActions(target);if(subtab==='dialogue')stopHistoryTranslations=mountHistoryTranslations({
   root:target,viewport:main,api,isCurrent:()=>token===pageToken,locale});
}
const tabs=names=>`<div class="tabs">${names.map(k=>`<button class="tab ${subtab===k?'active':''}" data-tab="${k}">${text[k]}</button>`).join('')}</div>`;
const LEARNING_TABS=['review','kana','grammar','words','sentences','readwords','dictionary','trash','statistics'];
const ACCENT_DEFAULTS=['#ad1539','#9d314d','#7b5ba7','#347b91','#398775'];
function accentChipsHTML(prefs){return [...new Set([...(prefs.accentPresets||[]),...ACCENT_DEFAULTS])].map(color=>`<button type="button" class="swatch ${color===String(prefs.accent).toLowerCase()?'active':''}" data-color="${color}" style="--swatch:${color}" aria-label="${color}" title="${color.toUpperCase()}"></button>`).join('');
 }
/* E272 (user: the sub-tab bar should drop down, retract when leaving, and retract then drop again between pages):
   the bar of learning / history unrolls from under the top bar; leaving for another page rolls it up first. */
let tabsGroup=null;
const tabsMotion=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;
const tabsFrames=[{clipPath:'inset(0 0 100% 0)',transform:'translateY(-12px)',opacity:.3},{clipPath:'inset(0 0 -40px 0)',transform:'none',opacity:1}];
function dropTabs(bar){if(tabsMotion())bar.animate(tabsFrames,{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});}
async function retractTabs(next){const bar=document.querySelector('#main>.tabs');if(!bar||!tabsGroup||tabsGroup===next){return;}tabsGroup=null;if(!tabsMotion())return;
 await bar.animate([...tabsFrames].reverse(),{duration:170,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'}).finished.catch(()=>{});}
/* E272 (user: starting MeguLit should not end on a progress bar and an avatar; the home page needs an entrance): the
   backdrop settles, the top bar and the hero rise in, then the shelf cards one by one. Starts on the first painted frame
   so a window that is still hidden does not play it unseen. */
function bootEntrance(){const html=document.documentElement;if(!tabsMotion()){html.classList.remove('app-boot-pre');return;}
 document.querySelectorAll('#main .shelf .book').forEach((book,i)=>book.style.setProperty('--boot-i',String(Math.min(i,10))));
 const go=()=>{if(!html.classList.contains('app-boot-pre'))return;html.classList.remove('app-boot-pre');html.classList.add('app-boot');setTimeout(()=>html.classList.remove('app-boot'),
  2000);};
 const later=()=>requestAnimationFrame(()=>requestAnimationFrame(go));
 /* E391 the startup island keeps this window cloaked until its bar finishes, so painting is no sign the window can be
    seen: the host sends home-revealed when the island starts fading the window in, and the entrance plays then */
 const callback=window.__TAURI_INTERNALS__?.transformCallback?.(()=>later());
 if(callback){invoke('plugin:event|listen',{event:'home-revealed',target:{kind:'Any'},handler:callback}).catch(later);setTimeout(go,8000);return;}
 if(document.visibilityState==='hidden')document.addEventListener('visibilitychange',later,{once:true});else later();
 setTimeout(go,3000);}
function bindTabs(page){{const group=page==='statistics'?'learning':page,bar=document.querySelector('#main>.tabs');if(bar&&tabsGroup!==group)dropTabs(bar);tabsGroup=group;
 }document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>page==='learning'&&button.dataset.tab==='statistics'?navigate('statistics'):navigate(page==='statistics'?'learning':page,
 button.dataset.tab)));alignSubtabs(); /* align as soon as the bar exists, not after the page finishes loading (复习 jumped right once Anki answered) */}
function definitions(value){
  try{const d=JSON.parse(value);if(Array.isArray(d))return d.map(x=>typeof x==='string'?x:typeof x==='object'?x.gloss||x.definition||x.meaning||Object.values(x).filter(v=>typeof v==='string').join(' · '):'').filter(Boolean).join('\n');
   if(d&&typeof d==='object')return Object.values(d).flat().filter(v=>typeof v==='string').join('\n');}
  catch{}return String(value||'');
}
async function learning(token){
  /* 2026-11-11 假名游戏 is no longer its own tab: old links open 五十音 at its practice block */
  let kanaFocus='';if(subtab==='kanagames'){subtab='kana';kanaFocus='practice';}
  if(!['review','kana','grammar','words','sentences','readwords','dictionary','trash'].includes(subtab))subtab='review';
  const tab=subtab,slot=learningSlot(),target=document.createElement('div');
  /* 2026-11-11 first visit: ask the Japanese level once (learning-level.js); the answer opens the tab to start from */
  import('./learning-level.js').then(m=>m.ensureLevel({api,esc,toast,openTab:t=>navigate('learning',t)})).then(()=>import('./learning-goal.js')).then(m=>m.ensureGoal({
   api,esc,toast,locale})).catch(()=>{});
 const commit=()=>{slot.closest('.main').classList.toggle('review-page',tab==='review');slot.replaceChildren(target);};
  /* E459: switching tabs shows the new tab's loading state at once, never the previous tab's content */
  if(slot.dataset.tab!==tab){slot.innerHTML=loading();slot.dataset.tab=tab;}
  if(subtab==='dictionary'){dictionary(target);commit();return;}
  /* 读过的词: frequency, this week's new words and JLPT coverage from the lines read */
  /* 语法: N5 → N0 lessons with examples and exercises from the lines you read */
  if(subtab==='grammar'){commit();try{const {mountGrammar}=await import('./grammar.js');if(token===pageToken)await mountGrammar(target,{api,locale,esc,toast,isCurrent:()=>token===pageToken});
   }catch(error){target.textContent=String(error?.message||error);}return;}
  if(subtab==='readwords'){commit();try{const {mountReadingInsights}=await import('./reading-insights.js');if(token===pageToken)await mountReadingInsights(target,
   {api,locale,esc,number,toast,isCurrent:()=>token===pageToken,enhance:enhanceSelects});}catch(error){target.textContent=String(error?.message||error);}return;
   }
  if(subtab==='kana'){commit();try{const {mountKana}=await import('./kana/kana.js');if(token===pageToken)await mountKana(target,{api,invoke,toast,start:'index',
   focus:kanaFocus,openTab:tab=>navigate('learning',tab)});}catch(error){target.textContent=String(error?.message||error);}return;}
  if(subtab==='review'){await review(token,target);if(token===pageToken){enhanceSelects(target);commit();}return;}
  if(subtab==='sentences'){try{const {mountSentences}=await import('./sentences-page.js');if(token!==pageToken)return;await mountSentences(target,{api,locale,esc,
   toast,errorMessage,empty,emptyLabel:text.emptySentences,readTime,datetime,icon,isCurrent:()=>token===pageToken,rerender:()=>renderRoute(),lookup:word=>{pendingDictionaryQuery=word;
   navigate('learning','dictionary');},openGame:id=>{gameOrigin='library';selectedGameId=id;navigate('game');}});}catch(error){learningFailed(target,error,token);
   }if(token===pageToken)commit();return;}
  let items,pending;try{[items,pending]=await Promise.all([api(subtab==='words'?'vocabulary':subtab==='trash'?'word_trash':'sentences'),subtab==='words'?api('unknown_words').catch(()=>[]):[]]);
   }catch(error){learningFailed(target,error,token);if(token===pageToken)commit();return;}if(token!==pageToken)return;
  target.innerHTML=!items.length?empty(subtab==='words'?text.emptyWords:subtab==='trash'?text.emptyTrash:text.emptySentences,'learning'):`<div class="record-list">${items.map(item=>subtab==='sentences'?`<article class="record"><div class="record-meta"><span>${esc(item.title||'')}</span><span>${esc(readTime(item.created_at,locale))||datetime(item.created_at)}</span></div><p>${esc(item.text)}</p>${item.translation?`<p class="muted">${esc(item.translation)}</p>`:''}<div class="word-actions"><button class="icon-button" data-sentence-delete="${item.id}" aria-label="${{zh:'取消收藏',en:'Remove',ja:'保存を解除'}[locale]}" title="${{zh:'取消收藏',en:'Remove',ja:'保存を解除'}[locale]}">${icon('trash')}</button></div></article>`:`<article class="record word-row"><div><div class="word-spelling">${esc(item.spelling||item.reading)}</div><div class="word-reading">${esc(item.spelling&&item.spelling!==item.reading?item.reading:"")}${subtab==='words'?`<span class="word-jlpt${item.jlpt?'':' is-off'}">${esc(item.jlpt||({zh:'考级外',en:'Beyond JLPT',ja:'試験外'})[locale])}</span>`:''}</div>${subtab==='words'?`<div class="word-def">${esc(definitions(item.definitions))}</div>${item.example_text?`<div class="word-source"><button type="button" class="link-button" data-word-sentence="${item.id}" title="${{zh:'在句子页打开这句',en:'Open this line in Sentences',ja:'文のページで開く'}[locale]}">「${esc((t=>t.length>60?t.slice(0,60)+'…':t)(String(item.example_text).replace(/^[\s　「『]+|[」』\s　]+$/g,'')))}」</button>${item.example_game_id&&item.example_title?` · <button type="button" class="link-button" data-word-game="${esc(item.example_game_id)}">${esc(item.example_title)}</button>`:''}</div>`:''}`:`<div class="record-meta">${datetime(item.deleted_at)}</div>`}</div><div class="word-actions"><button class="icon-button" data-${subtab==='trash'?'restore':'delete'}="${item.id}" aria-label="${subtab==='trash'?text.restore:text.delete}">${icon(subtab==='trash'?'restore':'trash')}</button></div></article>`).join('')}</div>`;
  if(subtab==='words'){if(pending.length){const section=document.createElement('details');section.className='panel revisit-words';section.innerHTML=`<summary><span class="revisit-title">${{zh:'常查单词',en:'Frequently looked up',ja:'よく調べる単語'}[locale]}</span><small class="muted">${number(pending.length)} ${{zh:'个',en:'words',ja:'語'}[locale]}</small><svg class="revisit-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></summary><p class="settings-help">${{zh:'查过多次、还没标为已掌握的词。打开查词卡片或搜索词典时计数，2 秒内重复点同一个词只算一次',en:'Words you looked up often and have not marked as known. Counted when a lookup card opens or you search the dictionary; repeats within 2 seconds count once',ja:'何度も調べ、まだ覚えた印を付けていない語です。辞書カードを開くか検索したときに数え、2秒以内の重複は1回とします'}[locale]}</p><div class="revisit-list">${pending.map(word=>`<span class="revisit-chip"><b>${esc(word.surface)}</b><small>${number(word.lookups)}</small></span>`).join('')}</div>`;
   target.prepend(section);}}
  target.querySelectorAll('[data-delete]').forEach(button=>button.addEventListener('click',()=>confirmDelete(items.find(w=>w.id===Number(button.dataset.delete)))));
  if(subtab==='words')target.querySelectorAll('.word-row').forEach((row,index)=>{const word=items[index],select=document.createElement('select');select.setAttribute('aria-label',
   {zh:'掌握程度',en:'Mastery',ja:'習得度'}[locale]);const labels={zh:['新收录','学习中','熟悉','掌握','熟练'],en:['New','Learning','Familiar','Known','Mastered'],ja:['新規','学習中','見覚えあり',
   '習得','熟知']}[locale];select.innerHTML=labels.map((label,status)=>`<option value="${status}" ${word.status===status?'selected':''}>${label}</option>`).join('');
   select.onchange=async()=>{select.disabled=true;try{await api('set_word_status',{id:word.id,status:Number(select.value)});word.status=Number(select.value);}catch(error){
   select.value=String(word.status);toast(errorMessage(error));}finally{select.disabled=false;}};row.querySelector('.word-actions').prepend(select);});
  target.querySelectorAll('[data-word-sentence]').forEach(button=>button.addEventListener('click',async()=>{const word=items.find(w=>w.id===Number(button.dataset.wordSentence));
   if(!word)return;try{(await import('./sentences-page.js')).focusSentence(word.example_text);}catch{}navigate('learning','sentences');}));
  target.querySelectorAll('[data-word-game]').forEach(button=>button.addEventListener('click',()=>{gameOrigin='library';selectedGameId=button.dataset.wordGame;navigate('game');
   }));
  target.querySelectorAll('[data-sentence-delete]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await api('sentence_delete',
   {id:Number(button.dataset.sentenceDelete)});renderRoute();}catch(error){button.disabled=false;toast(errorMessage(error));}}));
  target.querySelectorAll('[data-restore]').forEach(button=>button.addEventListener('click',async()=>{try{await api('restore_word',{id:Number(button.dataset.restore)});
   model=await api('home');renderRoute();toast(text.restoreDone);}catch(error){toast(errorMessage(error));}}));
  enhanceSelects(target);commit();
}
function confirmDelete(word){if(!word)return;
  const dialog=modal(`<h2>${text.deleteTitle}</h2><p>${text.deleteHint}</p><p class="dialog-word">${esc(word.spelling)}</p><p>${esc(word.reading)}</p><div class="dialog-actions"><button class="secondary" id="cancel-delete">${text.cancel}</button><button class="primary" id="confirm-delete">${text.deleteConfirm}</button></div>`);
  dialog.classList.add('word-delete');
  dialog.querySelector('#cancel-delete').addEventListener('click',()=>dialog.close());
  dialog.querySelector('#confirm-delete').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{await api('delete_word',
   {id:word.id});dialog.close();model=await api('home');renderRoute();toast(text.deleteDone);}catch(error){button.disabled=false;toast(errorMessage(error));}});
}
function dictionary(target){
  const L={zh:{online:'MOJi 联网查词',local:'本地查词',play:'播放 MOJi 发音',audioFail:'发音暂时无法播放',notes:'MOJi 用户笔记',noNotes:'暂无笔记',likes:'赞',fail:'MOJi 暂时无法查询',login:'扫码登录 MOJi',
   logout:'退出登录',signed:'已登录 MOJi',anon:'未登录 · 匿名查询',scan:'用 MOJi 辞書 App「我的 → 扫一扫」扫码',scanned:'已扫描，请在手机上确认',expired:'二维码已过期',refresh:'刷新二维码',bind:'该账号需先在 MOJi App 绑定手机',
   cancel:'取消',back:'返回结果',examples:'例句',detailFail:'详情暂时无法打开',expiredSession:'MOJi 登录已过期，请重新扫码'},
    en:{online:'Search Jisho online',local:'Offline dictionary',play:'Play MOJi audio',audioFail:'Audio is unavailable right now',notes:'MOJi user notes',noNotes:'No notes yet',
     likes:'likes',fail:'Jisho is temporarily unavailable',login:'Sign in to MOJi',logout:'Sign out',signed:'Signed in to MOJi',anon:'Not signed in · anonymous',
     scan:'Scan with the MOJi app (Me → Scan)',scanned:'Scanned, confirm on your phone',expired:'QR code expired',refresh:'Refresh QR code',bind:'Bind a phone number in the MOJi app first',
     cancel:'Cancel',back:'Back to results',examples:'Examples',detailFail:'Could not open the entry',expiredSession:'MOJi session expired, scan again'},
    ja:{online:'MOJi でオンライン検索',local:'ローカル辞書',play:'MOJi の発音を再生',audioFail:'発音を再生できません',notes:'MOJi ユーザーノート',noNotes:'ノートはありません',likes:'いいね',fail:'MOJi に接続できません',
     login:'MOJi にログイン',logout:'ログアウト',signed:'MOJi にログイン済み',anon:'未ログイン · 匿名検索',scan:'MOJi 辞書アプリ「マイページ → スキャン」で読み取る',scanned:'読み取り済み、スマホで確認してください',expired:'QR コードの期限切れ',
     refresh:'QR コードを更新',bind:'先に MOJi アプリで電話番号を登録してください',cancel:'キャンセル',back:'結果に戻る',examples:'例文',detailFail:'詳細を開けません',expiredSession:'MOJi のログインが切れました'}}[locale];
  /* 2026-11-13 English interface: online lookups use Jisho (English definitions); Chinese keeps MOJi, Japanese the existing MOJi path */
  const onlineSource=locale==='en'?'jisho':'moji';
  let ticket=0,poll=0,lastItems=[],lastOnline=false;
  target.innerHTML=`<div class="moji-account" id="moji-account"></div><form class="lookup-form" id="lookup-form"><input type="search" id="lookup-input" autocomplete="off" spellcheck="false" placeholder="${text.lookupHint}" aria-label="${text.dictionary}" maxlength="100"><button type="submit" value="moji" class="primary">${L.online}</button><button type="submit" value="local" class="secondary">${L.local}</button></form><div id="lookup-results"></div>`;
  const account=target.querySelector('#moji-account'),results=target.querySelector('#lookup-results');
  if(pendingDictionaryQuery){const word=pendingDictionaryQuery,form=target.querySelector('#lookup-form');pendingDictionaryQuery='';target.querySelector('#lookup-input').value=word;
   setTimeout(()=>{if(form.isConnected)(form.querySelector('button[type=submit]:not([value=local])')||form.querySelector('button[value=local]')).click();},0);}
  /* v1.0.5：还没输入时，列出常查的词，点一下直接查 */
  api('unknown_words').then(list=>{if(!list?.length||!results.isConnected||results.children.length)return;const chips=document.createElement('div');chips.className='g-dict-chips';
   chips.innerHTML=`<span>${{zh:'你常查的',ja:'よく調べる語',en:'Often looked up'}[locale]}</span>`+list.slice(0,10).map(w=>`<button type="button" data-chip="${esc(w.surface)}">${esc(w.surface)}<small>${number(w.lookups)}</small></button>`).join('');
   chips.onclick=e=>{const c=e.target.closest('[data-chip]');if(!c)return;const input=target.querySelector('#lookup-input'),form=target.querySelector('#lookup-form');
   input.value=c.dataset.chip;(form.querySelector('button[type=submit]:not([value=local])')||form.querySelector('button[value=local]')).click();};target.querySelector('#lookup-form').after(chips);
   }).catch(()=>{});
  /* 2026-11-13 评委第二轮：词典还没查时，下面列出常查词释义、最近收的生词、近两周查词，点一下就查；有结果时整块收起（dict-home.js） */
  import('./dict-home.js').then(({mountDictHome})=>{if(!results.isConnected)return;return mountDictHome(target,results,{api,esc,number,locale,look:word=>{const input=target.querySelector('#lookup-input'),form=target.querySelector('#lookup-form');if(!input||!form)return;input.value=word;(form.querySelector('button[type=submit]:not([value=local])')||form.querySelector('button[value=local]')).click();}});}).catch(()=>{});
  const stopPoll=()=>{clearTimeout(poll);poll=0;};
  const showStatus=state=>{stopPoll();account.innerHTML=state?.signedIn?`<span class="moji-state signed">${L.signed}${state.name?' · '+esc(state.name):''}</span><button type="button" class="text-button" data-moji-logout>${L.logout}</button>`:`<span class="moji-state">${L.anon}</span><button type="button" class="text-button" data-moji-login>${L.login}</button>`;
    account.querySelector('[data-moji-login]')?.addEventListener('click',startLogin);
    account.querySelector('[data-moji-logout]')?.addEventListener('click',async()=>{try{showStatus(await api('moji_logout'));}catch(error){toast(errorMessage(error));
     }});};
  async function startLogin(){
    stopPoll();account.innerHTML=`<div class="moji-qr-panel"><span class="spinner"></span></div>`;
    let code;try{code=await api('moji_login_start');}catch{toast(L.fail);showStatus(await api('moji_status').catch(()=>({})));return;}
    if(!account.isConnected)return;
    const {qrSvg}=await import('./qr.js'),deadline=Date.now()+code.expiresIn;
    account.innerHTML=`<div class="moji-qr-panel"><div class="moji-qr">${qrSvg(code.content)}</div><div class="moji-qr-side"><p class="moji-qr-hint" data-qr-hint>${L.scan}</p><div class="moji-qr-actions"><button type="button" class="secondary" data-qr-refresh hidden>${L.refresh}</button><button type="button" class="text-button" data-qr-cancel>${L.cancel}</button></div></div></div>`;
    const hint=account.querySelector('[data-qr-hint]'),panel=account.querySelector('.moji-qr-panel');
    account.querySelector('[data-qr-refresh]').onclick=startLogin;
    account.querySelector('[data-qr-cancel]').onclick=async()=>showStatus(await api('moji_status').catch(()=>({})));
    const expire=()=>{stopPoll();panel.classList.add('expired');hint.textContent=L.expired;account.querySelector('[data-qr-refresh]').hidden=false;};
    const tick=async()=>{
      if(!account.isConnected)return stopPoll();
      if(Date.now()>deadline)return expire();
      try{const r=await api('moji_login_poll',{qrcodeId:code.qrcodeId});if(!account.isConnected||!panel.isConnected)return;
        if(r.state==='signed-in')return showStatus(r);
        if(r.state==='expired')return expire();
        if(r.state==='bind'){stopPoll();hint.textContent=L.bind;return;}
        if(r.state==='scanned'){panel.classList.add('scanned');hint.textContent=L.scanned;}
      }catch{}
      poll=setTimeout(tick,3000);
    };
    poll=setTimeout(tick,3000);
  }
  const tags=w=>[w.jlpt?'JLPT '+w.jlpt:'',w.common?'common':'',...(w.partOfSpeech||[]),w.verbType,w.verbGroup].filter(Boolean).map(t=>`<span class="moji-tag">${esc(t)}</span>`).join('');
  const renderList=()=>{
    results.innerHTML=lastItems.length?`${lastOnline?'<small class="muted">'+(onlineSource==='jisho'?'Jisho.org':'MOJi 辞書')+'</small>':''}<div class="record-list">${lastItems.map((w,i)=>{const link=lastOnline&&w.id&&w.source!=='jisho';return `<article class="record dict-entry${link?' moji-entry':''}"${link?` tabindex="0" role="button" data-moji-index="${i}"`:''}><div class="word-spelling">${esc(w.spelling||w.reading)}</div><div class="word-reading">${esc(w.spelling&&w.spelling!==w.reading?w.reading:"")}</div>${lastOnline&&tags(w)?`<div class="moji-tags">${tags(w)}</div>`:''}${lastOnline?`<div class="word-def">${esc(w.definition)}</div>`:(definitionHtml(w.definition,esc)||`<div class="word-def">${esc(w.definition)}</div>`)}</article>`;}).join('')}</div>`:empty(text.noDefinition,
     'word');
    results.querySelectorAll('[data-moji-index]').forEach(card=>{const open=()=>openDetail(lastItems[Number(card.dataset.mojiIndex)]);card.onclick=open;card.onkeydown=e=>{
     if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};});
  };
  async function openDetail(item){
    const scroller=document.scrollingElement,scroll=scroller.scrollTop,request=++ticket;results.innerHTML=loading();
    let d;try{d=await api('moji_word',{id:item.id});}catch(error){if(request!==ticket)return;if(String(error?.message||error).includes('MOJI_SESSION_EXPIRED')){
     toast(L.expiredSession);showStatus({});}else toast(L.detailFail);renderList();return;}
    if(request!==ticket||!results.isConnected)return;
    const head={...item,...Object.fromEntries(Object.entries(d).filter(([,v])=>Array.isArray(v)?v.length:v))};
    const meanings=(d.meanings||[]).map(m=>`<li><div class="moji-meaning">${esc(m.zh||m.ja)}</div>${m.zh&&m.ja?`<div class="moji-meaning-ja" lang="ja">${esc(m.ja)}</div>`:''}${m.examples.length?`<details class="moji-ex"><summary>${L.examples} <b>${m.examples.length}</b></summary><ul class="moji-examples" aria-label="${L.examples}">${m.examples.map(x=>`<li><span lang="ja">${esc(x.ja)}</span>${x.zh?`<small>${esc(x.zh)}</small>`:''}</li>`).join('')}</ul></details>`:''}</li>`).join('')||`<li><div class="moji-meaning">${esc(d.excerpt||item.definition)}</div></li>`;
    results.innerHTML=`<article class="moji-detail"><button type="button" class="text-button moji-back" data-moji-back>← ${L.back}</button><header><div class="moji-head-row"><div class="word-spelling">${esc(head.spelling)}</div><button type="button" class="moji-play" data-moji-play aria-label="${L.play}" title="${L.play}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg></button></div><div class="word-reading">${esc(head.reading||[head.pron,head.accent].filter(Boolean).join('  '))}</div>${tags(head)?`<div class="moji-tags">${tags(head)}</div>`:''}</header><ol class="moji-meanings">${meanings}</ol><section class="moji-notes"><h3>${L.notes}</h3>${(d.notes||[]).map(n=>`<div class="moji-note mine">${n.title?`<div class="moji-note-title">${esc(n.title)}</div>`:''}<div class="moji-note-body">${esc(n.content)}</div></div>`).join('')}${(d.comments||[]).map(c=>`<div class="moji-note"><div class="moji-note-meta"><span>${esc(c.author)}</span><small class="muted">${esc(c.date)} · ${c.likes} ${L.likes}</small></div><div class="moji-note-body" lang="ja">${esc(c.content)}</div>${c.replies.length?`<div class="moji-note-replies">${c.replies.map(r=>`<div><span>${esc(r.author)}</span>：${esc(r.content)}</div>`).join('')}</div>`:''}</div>`).join('')}${!(d.notes||[]).length&&!(d.comments||[]).length?`<p class="muted">${L.noNotes}</p>`:''}</section></article>`;
    let audio=null;const play=results.querySelector('[data-moji-play]');
    play.onclick=async()=>{if(play.disabled)return;play.disabled=true;try{if(!audio){const r=await api('moji_audio',{id:item.id});audio=new Audio(r.audio);}audio.currentTime=0;
     await audio.play();}catch{toast(L.audioFail);}finally{play.disabled=false;}};
    results.querySelector('[data-moji-back]').onclick=()=>{ticket++;renderList();scroller.scrollTop=scroll;};
  }
  if(onlineSource==='jisho')account.hidden=true;else api('moji_status').then(state=>{if(account.isConnected&&!account.querySelector('.moji-qr-panel'))showStatus(state);}).catch(()=>showStatus({}));
  target.querySelector('#lookup-form').addEventListener('submit',async event=>{
    event.preventDefault();const query=target.querySelector('#lookup-input').value.trim();if(!query)return;
    const request=++ticket,online=event.submitter?.value!=='local';
    results.innerHTML=loading();
    try{
      let items,used=online;
      try{items=await api('dictionary',{query,source:online?onlineSource:'local',operationId:crypto.randomUUID()});}
      catch(error){if(!online)throw error;if(request===ticket)toast(L.fail);used=false;items=await api('dictionary',{query,source:'local',operationId:crypto.randomUUID()});
       }
      if(online&&used&&!items.length){const local=await api('dictionary',{query,source:'local',operationId:crypto.randomUUID()}).catch(()=>[]);if(local.length){
       items=local;used=false;}}
      if(request!==ticket||!results.isConnected)return;
      lastItems=items;lastOnline=used;renderList();
      api('home').then(next=>{if(request===ticket&&results.isConnected)model=next;}).catch(()=>{});
    }catch(error){if(request===ticket&&results.isConnected)results.innerHTML=empty(online?L.fail:text.serviceFailed,'word');}
  });
  if(pendingLookup){const word=pendingLookup;pendingLookup='';const input=target.querySelector('#lookup-input');input.value=word;/* the form is attached by commit() after this returns */setTimeout(()=>{
   const form=target.querySelector('#lookup-form');if(form.isConnected)form.requestSubmit(form.querySelector('button[value=moji]'));},0);}
}
/* 2026-11-13 Anki review HUD: the latest played game's art for its background, and the window's own full screen */
 const ankiCover=()=>recentGames(model.games||[]).find(g=>g.cover)?.cover||'',ankiWindow=action=>invoke('window_action',{action});
 async function review(token,target){
  target.innerHTML=`<div class="tabs review-sources"><button class="tab active" data-review-source="anki">${text.ankiReview}</button><button class="tab" data-review-source="local">${text.localReview}</button></div><div id="review-content"></div>`;
  const content=target.querySelector('#review-content');
  target.querySelectorAll('[data-review-source]').forEach(button=>button.onclick=()=>{target.querySelectorAll('[data-review-source]').forEach(b=>b.classList.toggle('active',
   b===button));if(button.dataset.reviewSource==='anki')renderAnkiReview({target:content,api,text,esc,isCurrent:()=>token===pageToken&&button.classList.contains('active'),
   toast,cover:ankiCover,windowAction:ankiWindow}).catch(error=>toast(errorMessage(error)));else localReview(token,content);});
  await renderAnkiReview({target:content,api,text,esc,isCurrent:()=>token===pageToken&&target.querySelector('[data-review-source="anki"]').classList.contains('active'),
   toast,quiet:true,cover:ankiCover,windowAction:ankiWindow});
}
async function localReview(token,target){
  const words=await api('vocabulary');if(token!==pageToken)return;
  if(!words.length){target.innerHTML=empty(text.emptyWords,'learning');return;}
  let index=0,revealed=false;
  function draw(){const word=words[index];if(!word){target.innerHTML=empty(text.reviewDone,'check');return;}
    target.innerHTML=`<section class="panel review-card"><div class="muted">${index+1} / ${words.length}</div><h2>${esc(word.spelling)}</h2>${revealed?`<div class="word-reading">${esc(word.reading)}</div><div class="word-def">${esc(definitions(word.definitions))}</div>`:`<p class="muted">${text.reviewSub}</p>`}<div class="review-controls"><button class="primary" id="review-next">${revealed?text.next:text.showAnswer}</button></div></section>`;
    target.querySelector('#review-next').addEventListener('click',async()=>{if(revealed){await api('record_review',{id:word.id});index++;revealed=false;}else revealed=true;
     draw();});
  }draw();
}
const settingsScroll=new Map();
function rememberSettingsScroll(){const c=document.querySelector('#main .settings-content');if(c&&settingsSection)settingsScroll.set(settingsSection,c.scrollTop);
 }
function restoreSettingsScroll(section){const target=settingsScroll.get(section)||0;let tries=0;const step=()=>{const c=document.querySelector('#main .settings-content');
 if(c&&c.querySelector('form,section,.panel')){c.classList.remove('g-enter');void c.offsetWidth;c.classList.add('g-enter');if(target)c.scrollTo({top:target,behavior:'smooth'});
 return;}if(++tries<60)requestAnimationFrame(step);};requestAnimationFrame(step);}
async function settings(token){
  await renderSettings({main:document.querySelector('#main'),api,invoke,text,locale,esc,toast,heading,basicSettings,isCurrent:()=>token===pageToken,section:settingsSection,
   setSection:value=>{rememberSettingsScroll();try{localStorage.setItem('megulit-settings-section',value||'');}catch{}settingsSection=value;restoreSettingsScroll(value);
   },profile:settingsProfile,setProfile:value=>settingsProfile=value,onSaved:async result=>{const next=await api('home'),reload=!result?.scope||result.scope==='background-toggle';
   const image=reload?(next.preferences.homeBackground?await api('background'):''):undefined;model=next;setAppearance();if(reload)applyBackground(image);}});
  if(token===pageToken&&settingsSection)restoreSettingsScroll(settingsSection);
}
function basicSettings(main=document.querySelector('#main')){
  const prefs=model.preferences;
  const extra={zh:{theme:'明暗模式',dark:'深灰',black:'纯黑',light:'浅色',avatar:'头像',choose:'选择图片',home:'主页背景图片'},ja:{theme:'配色モード',dark:'ダーク',black:'ブラック',light:'ライト',avatar:'プロフィール画像',
   choose:'画像を選択',home:'ホーム背景画像'},en:{theme:'Color mode',dark:'Dark',black:'Black',light:'Light',avatar:'Avatar',choose:'Choose image',home:'Home background image'}}[locale];
  main.innerHTML=heading(text.settings)+`<form id="settings-form"><section class="panel"><h2 class="panel-title">${text.general}</h2>
  <label class="settings-row"><div class="settings-label">${text.language}</div><select name="language"><option value="zh" ${locale==='zh'?'selected':''}>简体中文</option><option value="ja" ${locale==='ja'?'selected':''}>日本語</option><option value="en" ${locale==='en'?'selected':''}>English</option></select></label>
  <label class="settings-row"><div><div class="settings-label">${text.username}</div><div class="settings-help">${text.usernameHint}</div></div><input name="username" maxlength="80" value="${esc(prefs.username)}"></label>
  <label class="settings-row"><div><div class="settings-label">${({zh:'顶部栏颜色',en:'Top bar colour',ja:'トップバーの色'})[locale]}</div><div class="settings-help">${({zh:'顶部横栏的底色，logo 周围的光会跟着变化',en:'Base colour of the top bar; the light around the logo follows it',ja:'トップバーの地色。ロゴ周りの光も追従します'})[locale]}</div></div><input type="color" name="barColor" value="${esc(prefs.barColor||'#1a1110')}"></label>
  <label class="settings-row"><div><div class="settings-label">${({zh:'首页光效',en:'Home glow',ja:'ホームの光'})[locale]}</div><div class="settings-help">${({zh:'取上次游玩封面的颜色，从顶部栏向下蔓延',en:'Colours from the last-played cover, spreading down from the top bar',ja:'前回のゲームの表紙の色がトップバーから広がります'})[locale]}</div></div><input type="checkbox" class="switch" name="glow" ${prefs.glow!==false?'checked':''}></label>
  <label class="settings-row"><div><div class="settings-label">${({zh:'光效速度',en:'Glow speed',ja:'光の速さ'})[locale]}</div><div class="settings-help">${({zh:'数值越大变化越快',en:'Higher is faster',ja:'大きいほど速く変化'})[locale]}</div></div><span class="setting-slider"><input type="range" name="glowSpeed" min="0.25" max="3" step="any" value="${Number(prefs.glowSpeed)||1}"><input type="number" data-basic-slider="glowSpeed" min="0.25" max="3" step="any" value="${Number(prefs.glowSpeed)||1}" aria-label="${({zh:'光效速度',en:'Glow speed',ja:'光の速さ'})[locale]}"></span></label>
  <label class="settings-row"><div><div class="settings-label">${({zh:'主页字体大小',en:'Home text size',ja:'ホームの文字サイズ'})[locale]}</div><div class="settings-help">${({zh:'只影响首页，1 为默认（100%）',en:'Home page only; 1 is the default (100%)',ja:'ホームのみ。1 が既定（100%）'})[locale]}</div></div><span class="setting-slider"><input type="range" name="homeFontScale" min="0.85" max="1.3" step="any" value="${Number(prefs.homeFontScale)||1}"><input type="number" data-basic-slider="homeFontScale" min="0.85" max="1.3" step="any" value="${Number(prefs.homeFontScale)||1}" aria-label="${({zh:'主页字体大小',en:'Home text size',ja:'ホームの文字サイズ'})[locale]}"></span></label>
  ${veilSettingsHTML(prefs,locale)}
  <label class="settings-row"><div><div class="settings-label">${text.closeToTray}</div><div class="settings-help">${text.closeHint}</div></div><input type="checkbox" class="switch" name="closeToTray" ${prefs.closeToTray?'checked':''}></label><label class="settings-row"><div><div class="settings-label">${({zh:'关闭窗口时询问',en:'Ask when closing the window',ja:'閉じるときに確認する'})[locale]}</div><div class="settings-help">${({zh:'点右上角关闭时，先问是收进托盘还是退出',en:'Ask whether to go to the tray or quit when you click close',ja:'閉じるボタンでトレイ格納か終了かを確認します'})[locale]}</div></div><input type="checkbox" class="switch" name="closeAsk" ${prefs.closeAsk!==false?'checked':''}></label></section>
  <section class="panel"><h2 class="panel-title">${text.appearance}</h2><div class="settings-row"><div class="settings-label">${text.accent}</div><div class="color-swatches"><span class="accent-chips" data-accent-chips>${accentChipsHTML(prefs)}</span><label class="accent-custom">${({zh:'自定义…',ja:'カスタム…',en:'Custom…'})[locale]}<input type="color" name="accent" data-color-action="saveAccent" aria-label="${text.accent}" value="${esc(prefs.accent)}"></label></div></div>
  <div class="settings-row"><div><div class="settings-label">${({zh:'玻璃面板颜色',en:'Glass panel colour',ja:'すりガラスの色'})[locale]}</div><div class="settings-help">${({zh:'毛玻璃面板的底色，与强调色分开；透明度在“主页背景”里调',en:'Tint of the frosted panels, separate from the accent; opacity is under Home background',ja:'すりガラスパネルの地色（強調色とは別）。不透明度は「ホーム背景」で調整'})[locale]}</div></div><span class="glass-color-control"><button type="button" class="setting-link" data-glass-reset ${prefs.glassColor?'':'hidden'}>${({zh:'恢复默认',en:'Reset',ja:'既定に戻す'})[locale]}</button><input type="color" name="glassColor" data-empty="${prefs.glassColor?'false':'true'}" value="${esc(prefs.glassColor||(prefs.themeMode==='light'?'#fff7f2':'#2a1c1b'))}"></span></div>
  <div class="settings-row"><div><div class="settings-label">${({zh:'点缀色',en:'Detail colour',ja:'装飾色'})[locale]}</div><div class="settings-help">${({zh:'细线、菱形、展开的分类标题等点缀，默认金色，与强调色分开',en:'Thin rules, diamonds and open headings (gold by default); separate from the accent',ja:'細線・菱形・開いた見出しなどの装飾（既定は金色）。強調色とは別'})[locale]}</div></div><span class="glass-color-control"><button type="button" class="setting-link" data-gold-reset ${prefs.goldColor?'':'hidden'}>${({zh:'恢复默认',en:'Reset',ja:'既定に戻す'})[locale]}</button><input type="color" name="goldColor" data-empty="${prefs.goldColor?'false':'true'}" value="${esc(prefs.goldColor||'#edb56e')}"></span></div>
  <label class="settings-row"><div class="settings-label">${text.font}</div><input name="fontFamily" list="interface-fonts" placeholder="${text.systemFont}" value="${esc(prefs.fontFamily||'')}" maxlength="120"><datalist id="interface-fonts"><option value="Microsoft YaHei UI"><option value="Segoe UI"><option value="Yu Gothic UI"><option value="Meiryo"></datalist></label>
  <div class="settings-row"><span class="settings-label">${extra.home}</span><button type="button" class="setting-link" data-background-settings>${{zh:'调整背景',en:'Customize background',ja:'背景を調整'}[locale]} ${icon('arrow')}</button></div></section>
  </form>`;
  const form=main.querySelector('#settings-form');
  form.querySelectorAll('[name=username],[name=fontFamily],[name=themeMode]').forEach(input=>input.closest('.settings-row')?.classList.add('compact-setting'));
  const glassInput=form.elements.glassColor,glassReset=form.querySelector('[data-glass-reset]');
  glassInput.addEventListener('input',()=>{glassInput.dataset.empty='false';glassReset.hidden=false;});
  glassReset.onclick=()=>{glassInput.dataset.empty='true';glassReset.hidden=true;glassInput.dispatchEvent(new Event('change',{bubbles:true}));};
  const previewAppearance=()=>setAppearance({...model.preferences,pageVeils:veilsFromForm(form,model.preferences),goldColor:form.elements.goldColor.dataset.empty==='true'?'':form.elements.goldColor.value,
   glassColor:glassInput.dataset.empty==='true'?'':glassInput.value,accent:form.elements.accent.value,themeMode:form.elements.themeMode.value,fontFamily:form.elements.fontFamily.value});
  form.addEventListener('input',previewAppearance);form.addEventListener('change',previewAppearance);form.addEventListener('input',e=>{const m=/^veil_([a-z]+)_[asb]$/.exec(e.target?.name||'');
   if(!m)return;document.documentElement.dataset.stage=m[1];applyVeil({...model.preferences,pageVeils:veilsFromForm(form,model.preferences)},m[1]);syncStage();});
  const goldInput=form.elements.goldColor,goldReset=form.querySelector('[data-gold-reset]');
  goldInput.addEventListener('input',()=>{goldInput.dataset.empty='false';goldReset.hidden=false;});
  goldReset.onclick=()=>{goldInput.dataset.empty='true';goldReset.hidden=true;goldInput.dispatchEvent(new Event('change',{bubbles:true}));};


  form.querySelectorAll('[data-basic-slider]').forEach(number=>{const range=form.elements.namedItem(number.dataset.basicSlider);range.addEventListener('input',()=>{
   range.value=String(Number(Number(range.value).toFixed(3)));number.value=range.value;});number.addEventListener('input',()=>{if(number.value!==''&&number.checkValidity()){
   range.value=number.value;range.dispatchEvent(new Event('input',{bubbles:true}));}});});

  const row=document.createElement('label');row.className='settings-row';row.innerHTML=`<span class="settings-label">${extra.theme}</span><select name="themeMode">${['dark','black','light'].map(mode=>`<option value="${mode}" ${prefs.themeMode===mode?'selected':''}>${extra[mode]}</option>`).join('')}</select>`;
   form.querySelectorAll('.panel')[1].querySelector('h2').after(row);
  form.querySelector('[data-background-settings]').onclick=()=>main.closest('.settings-layout').querySelector('[data-section=background]').click();
  for(const[slot,label]of []){
    const row=document.createElement('div');row.className='settings-row';row.innerHTML=`<span class="settings-label">${label}</span><div class="image-picker"><img alt="" hidden><button type="button" class="secondary">${extra.choose}</button></div>`;
     form.querySelector('.panel').append(row);
    api('asset_get',{slot}).then(image=>{if(row.isConnected&&image){row.querySelector('img').src=image;row.querySelector('img').hidden=false;}}).catch(()=>{});
    row.querySelector('button').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{const path=await invoke('pick_image');if(path){await api('asset_set',
     {slot,path});row.querySelector('img').src=await api('asset_get',{slot});row.querySelector('img').hidden=false;toast(text.saved);}}catch(error){toast(errorMessage(error));
     }finally{button.disabled=false;}};
  }
  const bindAccentChips=()=>form.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>{form.elements.accent.value=button.dataset.color;
   form.elements.accent.dispatchEvent(new Event('input'));form.elements.accent.dispatchEvent(new Event('change',{bubbles:true}));}));bindAccentChips();
  // The picker's "save to accent colours" keeps up to eight custom accents, newest first.
  form.elements.accent.addEventListener('tome-color-action',async event=>{const value=String(event.detail).toLowerCase(),list=[value,...(model.preferences.accentPresets||[]).filter(v=>v!==value)].slice(0,
   8);try{const saved=await api('save_preferences',{values:{accentPresets:list}});model.preferences.accentPresets=saved.accentPresets||list;form.querySelector('[data-accent-chips]').innerHTML=accentChipsHTML({
   ...model.preferences,accent:form.elements.accent.value});bindAccentChips();}catch(error){toast(errorMessage(error));}});
  form.elements.accent.addEventListener('input',()=>{document.documentElement.style.setProperty('--accent',form.elements.accent.value);form.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',
   s.dataset.color===form.elements.accent.value));});
  const saveStatus=main.closest('.settings-content').parentElement.parentElement.querySelector('.settings-autosave-status');
  mountSettingsAutosave({form,locale,status:saveStatus,save:async values=>{const languageChanged=values.language!==model.preferences.language;model.preferences=await api('save_preferences',
   {values});setAppearance();if(languageChanged){shell();renderRoute();await invoke('set_tray_language',{language:locale});}}});
}
function learningSlot(){
 const main=document.querySelector('#main');
 if(main.dataset.page!=='learning'||!main.querySelector('#learning-content')){
  main.innerHTML=heading(text.learning)+tabs(LEARNING_TABS)+'<div id="learning-content">'+loading()+'</div>';
  main.dataset.page='learning';bindTabs('learning');
 }
 main.querySelectorAll(':scope > .tabs > [data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===subtab));
 return main.querySelector('#learning-content');
}
let statisticsSelection={range:'month',date:new Date().toLocaleDateString('en-CA')};
async function statistics(token){
 subtab='statistics';const main=learningSlot();main.closest('.main').classList.remove('review-page');
 const env={locale,text,esc,icon,duration,number,cover,gameById:id=>(model.games||[]).find(g=>g.id===id)};
 if(main.dataset.tab!=='statistics'){main.innerHTML=loading();main.dataset.tab='statistics';}
 if(token!==pageToken)return;try{await mountStatistics(main,{api,env,selection:statisticsSelection,onSelection:selection=>{statisticsSelection=selection;}});}catch(error){
  learningFailed(main,error,token);}
}
/* E459 (user, v1.4.3: 单词 / 句子 / 读过的词 / 学习统计 stayed on 「…」): a learning page whose data did not arrive says
   so and offers to try again, instead of leaving the previous page's placeholder on screen */
function learningFailed(target,error,token){if(token!==pageToken||!target)return;target.innerHTML=`<section class="panel learning-failed"><p>${esc(errorMessage(error))}</p><button type="button" class="secondary" data-learning-retry>${{zh:'重试',ja:'再試行',en:'Retry'}[locale]}</button></section>`;
 target.querySelector('[data-learning-retry]').onclick=()=>renderRoute();}

function loading(){return '<div class="loading-screen"><span class="spinner" aria-label="'+text.loading+'"></span></div>';}
/* v1.1.6 (user): the second-level tab bar starts under the first top tab (首页), on every page and size */
/* the 个人主页 pill at the right of the top bar: same panel as the 排行榜 chip; shows your picture and name once known */
async function paintTopProfile(){
 const me=document.querySelector('[data-top-me]');if(!me)return;
 let data;try{data=await api('leaderboard_view',{tab:'board'});}catch{return;}
 if(!data?.name)return;
 me.querySelector('.leaderboard-avatar')?.replaceWith(document.createRange().createContextualFragment(avatarHTML({name:data.name,avatar:data.self?.avatar||null},
  data.avatars||{},esc)));
 me.querySelector('.top-me-name').textContent=data.name;me.title=data.name;
}
function bindTopProfile(){
 const me=document.querySelector('[data-top-me]');if(!me)return;
 me.addEventListener('click',()=>openProfilePanel({api,locale,esc,toast,openSettings:()=>navigate('settings'),onClose:()=>{paintTopProfile();if(route==='leaderboard')renderRoute();
  }}).catch(()=>toast(text.serviceFailed)));
 paintTopProfile();
}
function alignSubtabs(){const bar=document.querySelector('#main>.tabs'),home=document.querySelector('.top-tabs .top-tab');if(!bar||!home)return;bar.style.setProperty('margin-left',
 '0px','important');const first=bar.querySelector('.tab');if(!first)return;const textLeft=el=>el.getBoundingClientRect().left+(parseFloat(getComputedStyle(el).paddingLeft)||0),
 delta=textLeft(home)-textLeft(first);bar.style.setProperty('margin-left',Math.max(0,Math.round(delta))+'px','important'); /* the theme sets margin with !important */}
addEventListener('resize',()=>requestAnimationFrame(alignSubtabs));
function syncStage(){const main=document.querySelector('#main'),layer=document.querySelector('.stage-cover');if(!main||!layer)return;const stage=document.documentElement.dataset.stage||'',
 src=main.querySelector(':scope>.dtv-bg');layer.hidden=!stage;layer.dataset.stage=stage;if(src){layer.dataset.kind=[...src.classList].filter(c=>c!=='dtv-bg').join(' ');
 layer.querySelector('.dtv-glyph').textContent=src.querySelector('.dtv-glyph')?.textContent||'';}else{layer.dataset.kind='';layer.querySelector('.dtv-glyph').textContent='';
 }layer.dataset.glyphStage=stage;}
let stageWatch=null;function watchStage(){const main=document.querySelector('#main');if(!main||stageWatch?.main===main)return;stageWatch?.observer.disconnect();
 const observer=new MutationObserver(syncStage);observer.observe(main,{childList:true});stageWatch={main,observer};}
async function renderRoute(){watchStage();
  stopHistoryTranslations();stopHistoryTranslations=()=>{};
  const token=++pageToken,main=document.querySelector('#main');document.documentElement.dataset.stage=stageFor(route);applyVeil(model.preferences);syncStage();{
   const group=route==='statistics'?'learning':route,leaving=!!main.dataset.lastRoute&&main.dataset.lastRoute!==group,out=!leaving?null:main.querySelector(':scope>.tv-home')||(main.querySelector(':scope>.dtv-bg')?main:null);
   if(out&&!matchMedia('(prefers-reduced-motion:reduce)').matches){const targets=out===main?[...main.children].filter(el=>!el.matches('.tabs,.dtv-bg,.dtv-marks')):[out];
   targets.forEach(el=>el.style.pointerEvents='none');await Promise.race([Promise.all(targets.map(el=>el.animate([{opacity:1},{opacity:0}],{duration:200,easing:'cubic-bezier(.4,0,1,1)',
   fill:'forwards'}).finished.catch(()=>{}))),new Promise(r=>setTimeout(r,260))]);if(token!==pageToken)return;}}main.classList.toggle('home-page',route==='home');
   if(route!=='home'){stopShelf();stopShelf=()=>{};main.onscroll=null;if(route==='game'){const g=model.games.find(x=>x.id===selectedGameId);paintGlow(g?.cover||'');
   }else stopGlow();main.closest('.workspace')?.classList.remove('home-fade','fade-off');}if(route!=='library'){stopSimpleGrid();stopSimpleGrid=()=>{};stopField();
   main.classList.remove('searching','field-page','field-list','field-selecting','field-single');}main.classList.toggle('statistics-page',route==='statistics');
   if(route!=='learning'&&route!=='statistics')main.classList.remove('review-page');if(route!=='learning'&&route!=='statistics')delete main.dataset.page;main.scrollTop=0;
  try{
    if(route==='home')home();else if(route==='library')library();else if(route==='series')seriesUI.renderDetail(main,selectedSeriesId);else if(route==='game'){main.innerHTML=loading();
     await renderGamePage({main,id:selectedGameId,api,invoke,locale,text,esc,icon,cover,duration,datetime,relativeTime,number,definitions,isCurrent:()=>token===pageToken,
     onBack:()=>navigate(gameOrigin),onLaunch:startGame,onEdit:editGame,onRemove:removeGame,onForum:game=>{setForumFilter({game:String(game?.title||''),engine:'',
     tag:'',mine:false});setLeaderboardView({tab:'forum'});navigate('leaderboard');},onOriginalChanged:async()=>{model=await api('home');if(token===pageToken)renderRoute();
     },toast});}else if(route==='history')await history(token);else if(route==='learning')await learning(token);else if(route==='settings')await settings(token);
     else if(route==='leaderboard')await mountLeaderboard(main,{api,locale,esc,toast,isCurrent:()=>token===pageToken,lookup:word=>{pendingLookup=word;navigate('learning',
     'dictionary');},openSettings:section=>{settingsSection=section;settingsProfile='';try{localStorage.setItem('megulit-settings-section',section);}catch{}navigate('settings');
     }});else if(route==='daily')await mountDaily(main,{api,locale,esc,toast,isCurrent:()=>token===pageToken,lookup:word=>{pendingLookup=word;navigate('learning',
     'dictionary');},openSettings:section=>{settingsSection=section;settingsProfile='';try{localStorage.setItem('megulit-settings-section',section);}catch{}navigate('settings');
     }});else if(route==='about'){main.innerHTML=aboutHTML(locale,esc);mountAbout(main,api,toast);}else if(route==='tools'){main.innerHTML=toolsHTML(locale,esc);
     main.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>b.dataset.tool==='0'?japaneseRestore():toast((grimoireWords[locale]||grimoireWords.zh).toolPending)));
     }else if(route==='statistics')await statistics(token);
    if(token===pageToken){enhanceSelects(main);dockPageTools(main);moveTabInk();alignSubtabs();{const group=route==='statistics'?'learning':route,view=group+':'+subtab;
     if(!main.querySelector(':scope>.tabs'))tabsGroup=null;if(main.dataset.lastRoute!==group){main.dataset.lastRoute=group;if(!document.documentElement.classList.contains('app-boot-pre'))pageEnter(main);
     }else if(main.dataset.lastView!==view&&(group==='learning'||group==='history')){subpageEnter(main.querySelector(group==='learning'?'#learning-content':'#history-content'));
     }main.dataset.lastView=view;}requestAnimationFrame(()=>setupMarquees(main));}
  }catch(error){if(token!==pageToken)return;main.innerHTML=empty(text.loadingFailed,'refresh')+`<button class="primary" id="retry">${text.retry}</button>`;main.querySelector('#retry').addEventListener('click',
   renderRoute);}
}
const navStack=[];let navIndex=-1;
const navEntry=()=>({route,subtab,game:selectedGameId,series:selectedSeriesId,origin:gameOrigin});
const sameEntry=(a,b)=>a&&b&&a.route===b.route&&(a.subtab||'')===(b.subtab||'')&&(a.route!=='game'||a.game===b.game)&&(a.route!=='series'||a.series===b.series);
function updateNavButtons(){document.querySelectorAll('[data-nav-step]').forEach(button=>{const target=navIndex+Number(button.dataset.navStep);button.disabled=target<0||target>=navStack.length;
 });}
function stepNavigation(step){const target=navIndex+step,entry=navStack[target];if(!entry)return;navIndex=target;selectedGameId=entry.game;selectedSeriesId=entry.series;
 gameOrigin=entry.origin;navigate(entry.route,entry.subtab,true);}
async function navigate(next,tab='',replay=false){if(next!=='learning'||tab!=='kana')invoke('kanji_go_hide').catch(()=>{});const ticket=++navigationTicket;if(!replay&&navIndex<0){
 navStack.push(navEntry());navIndex=0;}if(route==='settings'){rememberSettingsScroll();try{await leaveSettings();}catch{toast({zh:'设置保存失败，请稍后重试',en:'Could not save settings. Please retry',
 ja:'設定を保存できませんでした'}[locale]);return;}}await retractTabs(next==='statistics'?'learning':next);if(ticket!==navigationTicket)return;route=next;subtab=tab;if(!replay){
 const entry=navEntry();if(!sameEntry(navStack[navIndex],entry)){navStack.splice(navIndex+1);navStack.push(entry);if(navStack.length>60)navStack.shift();navIndex=navStack.length-1;
 }else navStack[navIndex]=entry;}updateNavButtons();document.querySelectorAll('[data-route]').forEach(button=>{if(button.dataset.route===route||(route==='game'||route==='series')&&button.dataset.route==='library'||route==='statistics'&&button.dataset.route==='learning')button.setAttribute('aria-current',
 'page');else button.removeAttribute('aria-current');});renderRoute();}
async function start(){
  app.innerHTML=loading();
  try{
    const saved=await api('ui_state');
    for(const[key,value]of Object.entries(saved))if(localStorage.getItem(key)===null)localStorage.setItem(key,value);
    const recovered={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(/^(tome|tomoyo)-/.test(key)&&!/key|token|secret|password/i.test(key))recovered[key]=localStorage.getItem(key);
     }
    await api('preserve_ui',{values:recovered});
    model=await api('home');setAppearance();document.documentElement.classList.add('app-boot-pre');shell();await renderRoute();bootEntrance();
    /* E394 the website's "still in development" notice, once per version, after the entrance has played */
    {const notice=()=>{if(document.documentElement.classList.contains('app-boot-pre'))return setTimeout(notice,400);setTimeout(()=>{if(route==='home'&&!document.querySelector('dialog[open]'))mountDevNotice({
     api,locale,esc,toast,version:VERSION});},1800);};notice();}
    /* v1.1.0: look for a new release once per start; silent unless there is one */
    if(!window.__megulitUpdateChecked){window.__megulitUpdateChecked=true;setTimeout(()=>checkForUpdates({api,invoke,version:VERSION,toast}),4000);}
    const callback=window.__TAURI_INTERNALS__?.transformCallback(response=>{playHomeMotion(response.payload);if(response.payload==='hidden'&&pendingHomeGame){const id=pendingHomeGame;
     pendingHomeGame='';api('focus_game',{id}).catch(error=>toast(errorMessage(error)));}});if(callback)await invoke('plugin:event|listen',{event:'overlay-home',
     target:{kind:'Any'},handler:callback});const healthCallback=window.__TAURI_INTERNALS__?.transformCallback(response=>{const state=response.payload;if(state.ready)readerNotice('');
     else if(state.error)readerNotice(state.error);});if(healthCallback)await invoke('plugin:event|listen',{event:'reader-health',target:{kind:'Any'},handler:healthCallback});
     const pendingCallback=window.__TAURI_INTERNALS__?.transformCallback(response=>{if(response.payload?.type==='sentence-saved'&&route==='learning'&&subtab==='sentences'){
     renderRoute();return;}if(response.payload.type==='bindPending'&&document.hasFocus())toast(({zh:'等待游戏窗口。游戏已打开时，也可以用 Alt+T 手动绑定窗口',en:'Waiting for a game window. Use Alt+T to select a game window manually.',
     ja:'ゲームウィンドウを待機中です。Alt+T で手動選択できます'})[locale]);});if(pendingCallback)await invoke('plugin:event|listen',{event:'reader-event',target:{kind:'Any'},handler:pendingCallback});
     await invoke('window_action',{action:'ready'});const metadataCallback=window.__TAURI_INTERNALS__?.transformCallback(async()=>{try{model=await api('home');if(route==='library')renderGames();
     else if(route==='home')home();else if(route==='series')seriesUI.renderDetail(document.querySelector('#main'),selectedSeriesId);}catch{}});if(metadataCallback)await invoke('plugin:event|listen',
     {event:'library-updated',target:{kind:'Any'},handler:metadataCallback});window.__TOME_READY__=true;refreshLibrary({startup:true}).catch(()=>{});invoke('reader_open',
     {background:true}).then(()=>waitReader()).catch(error=>readerNotice(error.message||error)); 
  }
  catch(error){app.innerHTML=`<div class="loading-screen"><div>${text.loadingFailed}<button class="primary" id="startup-retry">${text.retry}</button></div></div>`;
   document.querySelector('#startup-retry').addEventListener('click',start);await invoke('window_action',{action:'ready'}).catch(()=>{});}
}
addEventListener('focus',()=>{refreshFocusedHome().catch(()=>{});});
start();
// E255: a settings row is a <label>; only the control itself should react, not the descriptive text
document.addEventListener('click',e=>{const row=e.target.closest?.('label.settings-row');if(!row)return;if(e.target.closest('input,select,textarea,button,a,.select-control,.switch,.toggle,[role=switch],.color-swatches,.setting-slider,.font-control'))return;
 e.preventDefault();},true);
// E261: even when a control's box is larger than what is drawn, only a click inside its visible size counts
document.addEventListener('click',e=>{const input=e.target.closest?.('label.settings-row input.switch,label.settings-row input[type=range]');if(!input||e.detail===0)return;
 const r=input.getBoundingClientRect(),h=input.type==='range'?20:30,top=r.top+(r.height-h)/2;if(e.clientY<top-2||e.clientY>top+h+2)e.preventDefault();},true);

// E248 (user: after quitting a game the home window came back with only the shelf painted, the rest see-through):
// when the window becomes visible or focused again, force one full repaint of the page.
(()=>{let pending=0;const repaint=()=>{if(document.visibilityState!=='visible'||pending)return;pending=requestAnimationFrame(()=>{const root=document.documentElement;
 root.style.opacity='0.999';pending=requestAnimationFrame(()=>{root.style.opacity='';pending=0;});});};
 document.addEventListener('visibilitychange',repaint);addEventListener('focus',repaint);addEventListener('pageshow',repaint);})();
/* contrast check (validation/contrast-check.cjs): only the headless test transport gets page navigation and the start notice */
if(window.__TOME_TEST_TRANSPORT__)window.__megulitTest={navigate:(next,tab)=>{if(next==='game')selectedGameId=model.games[0]?.id||'';return navigate(next,tab||'');},notice:()=>mountDevNotice({api,locale,esc,toast,version:VERSION})};
