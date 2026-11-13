// SPDX-License-Identifier: GPL-3.0-or-later
import {enhanceSelects} from './select-control.js';
import './hud-drag.js';
import './anki-hud-model.js';
let stopMessages=()=>{};
/* 2026-11-13 (user: anki界面要大改…放大 去掉背景 实现全屏 排版字体背景可自定义 像游戏 HUD 一样拖动) */
const hudCopy={
 zh:{look:'外观',layout:'调整布局',done:'完成',reset:'恢复默认',full:'全屏',exitFull:'退出全屏',jaFont:'日文字体',zhFont:'中文字体',systemFonts:'读取系统字体',
  sizes:'字号',size:{word:'单词',info:'读音释义',example:'例句',card:'整卡模式',controls:'按钮'},colors:'颜色',color:{word:'单词',text:'正文',dim:'次要',accent:'高亮'},
  bg:'背景',bgModes:['无','纯色','游戏背景','卡片截图','自选图片'],pick:'选择图片…',blur:'模糊',dim:'暗度',shadow:'文字阴影',
  labels:{progress:'进度',word:'单词',info:'读音 · 释义',example:'例句 · 译文',shot:'截图',card:'整张卡片',controls:'按钮'},
  hint:'拖动方块移动，拖边角缩放 · 方向键微调，Shift+方向键改大小',reviewed:'已复习 {n}',noResult:'词典里没有找到',close:'关闭',
  keys:'空格 翻面/良好 · 1–4 评分 · F 全屏 · L 布局 · Esc 退出',fontsFailed:'没能读取系统字体，可直接输入字体名'},
 en:{look:'Appearance',layout:'Edit layout',done:'Done',reset:'Restore defaults',full:'Full screen',exitFull:'Exit full screen',jaFont:'Japanese font',zhFont:'Chinese font',systemFonts:'Load installed fonts',
  sizes:'Text size',size:{word:'Word',info:'Reading & meaning',example:'Example',card:'Whole card',controls:'Buttons'},colors:'Colours',color:{word:'Word',text:'Text',dim:'Secondary',accent:'Highlight'},
  bg:'Background',bgModes:['None','Colour','Game art','Card screenshot','Own picture'],pick:'Choose picture…',blur:'Blur',dim:'Darken',shadow:'Text shadow',
  labels:{progress:'Progress',word:'Word',info:'Reading · meaning',example:'Example · translation',shot:'Screenshot',card:'Whole card',controls:'Buttons'},
  hint:'Drag a block to move it, drag its edges to resize · arrows nudge, Shift+arrows resize',reviewed:'{n} reviewed',noResult:'Not in the dictionary',close:'Close',
  keys:'Space flip/Good · 1–4 rate · F full screen · L layout · Esc leave',fontsFailed:'Could not read installed fonts; type a font name instead'},
 ja:{look:'外観',layout:'レイアウト調整',done:'完了',reset:'既定に戻す',full:'全画面',exitFull:'全画面を終了',jaFont:'日本語フォント',zhFont:'中国語フォント',systemFonts:'インストール済みフォントを読む',
  sizes:'文字サイズ',size:{word:'単語',info:'読み・意味',example:'例文',card:'カード全体',controls:'ボタン'},colors:'色',color:{word:'単語',text:'本文',dim:'補助',accent:'強調'},
  bg:'背景',bgModes:['なし','単色','ゲーム画像','カードのスクショ','画像を選ぶ'],pick:'画像を選ぶ…',blur:'ぼかし',dim:'暗さ',shadow:'文字の影',
  labels:{progress:'進捗',word:'単語',info:'読み · 意味',example:'例文 · 訳',shot:'スクリーンショット',card:'カード全体',controls:'ボタン'},
  hint:'ブロックをドラッグで移動、端をドラッグで拡大縮小 · 矢印キーで微調整、Shift+矢印でサイズ',reviewed:'{n} 枚復習',noResult:'辞書に見つかりません',close:'閉じる',
  keys:'Space 裏返す/普通 · 1–4 評価 · F 全画面 · L レイアウト · Esc 終了',fontsFailed:'フォント一覧を読めませんでした。名前を直接入力できます'}
};
const mixKey='tome-anki-audio-mix',mixChannels=['master','word','sentence','game'];
const mixLabels={
 zh:['音量混音器','总音量','单词读音','合成例句','游戏原声','控制 MeguLit 卡片内播放的声音'],
 en:['Volume mixer','Master','Word pronunciation','Synthesized example','Original game voice','Controls audio played in MeguLit cards'],
 ja:['音量ミキサー','全体','単語の発音','合成例文','ゲーム音声','MeguLit のカード内で再生する音声を調整']
};
/* (user 2026-11-12) what plays by itself: after the card turns to its answer, and when the next card comes up */
const autoKey='megulit-anki-autoplay',autoModes=['off','word','sentence','both'];
const autoLabels={
 zh:['Anki 设置','翻面后自动播放','下一张自动播放',['不播放','读音','例句','读音和例句'],'只在 MeguLit 里复习时生效'],
 en:['Anki settings','Play after turning the card','Play when the next card comes',['Nothing','Word','Example','Word and example'],'Applies when reviewing in MeguLit'],
 ja:['Anki 設定','裏面を表示したら自動再生','次のカードで自動再生',['再生しない','読み','例文','読みと例文'],'MeguLit で復習するときのみ']
};
export async function renderAnkiReview({target,api,text,esc,isCurrent,toast,quiet=false,cover=()=>'',windowAction=null}){
 stopMessages();
 const landing=target.firstElementChild?.matches('.review-card')?target.firstElementChild:document.createElement('section');
 if(!quiet&&!target.firstElementChild){
  target.replaceChildren(landing);
  landing.className='panel review-card anki-loading';landing.setAttribute('aria-busy','true');
  landing.innerHTML='<div class="eyebrow">'+text.loading+'</div><h2>'+text.ankiReview+'</h2><p class="muted">'+text.ankiStartHint+'</p><div class="review-controls"><span class="spinner"></span></div>';
 }
 landing.classList.add('panel','review-card');
 let status=await api('anki_status');if(!isCurrent())return;
 const reason=error=>({ANKI_CARD_CHANGED:text.ankiChanged,ANKI_ANSWER_REQUIRED:text.ankiRequiresAnswer,ANKI_UNSUPPORTED:text.ankiUnsupported,ANKI_AUTH:text.ankiAuth,
  ANKI_PORT_TAKEN:({zh:'AnkiConnect 端口被其他程序占用，请关闭占用 8765 端口的程序后重启 Anki',ja:'AnkiConnect のポートが他のプログラムに使われています',en:'Another program is using the AnkiConnect port'})[document.documentElement.lang.slice(0,
  2)]||'AnkiConnect port is taken',ANKI_OFFLINE:text.ankiOfflineHint,ANKI_RATING_UNCERTAIN:text.ankiChanged,ANKI_ACTION_PENDING:text.ankiChanged})[typeof error==='string'?error:error?.message]||text.ankiFailed;
 async function reload(){try{drawCard(await api('anki_current'));}catch(error){failed(error);}}
 const locale=document.documentElement.lang.startsWith('ja')?'ja':document.documentElement.lang.startsWith('en')?'en':'zh';
 const copy={zh:{hideAnki:'隐藏 Anki',hidden:'Anki 已隐藏，制卡和复习照常可用；点「在 Anki 中打开」可再显示',hideNone:'没有找到可隐藏的 Anki 窗口',launch:'启动 Anki 并连接',launching:'正在启动 Anki…',repairing:'正在关闭占用端口的程序并重启 Anki…',
  missing:'没有找到 Anki，请在 设置 → Anki 里自动查找或选择路径',play:'播放音频',fit:'适应窗口',original:'原始大小',failed:'音频播放失败',stop:'中断学习',settings:'学习设置',addons:'插件管理',openAnki:'在 Anki 中打开',
  custom:'自定义学习（Anki）',practice:'再练一遍（不影响排程）',practiceTag:'练习',next:'下一张',endPractice:'结束练习',practiceDone:'这个牌组已经练完一遍',limits:'每日上限',newPerDay:'每天新卡数',revPerDay:'每天最多复习数',
  save:'保存到 Anki',saved:'已保存到 Anki',preset:'选项预设',presetHint:'同一预设的牌组会一起改变',back:'返回',focusHint:'已在 Anki 窗口中打开；如果没有弹出，请在 Anki 里点对应按钮',total:'共 {n} 张'},en:{hideAnki:'Hide Anki',
  hidden:'Anki is hidden; mining and review keep working. Use Open in Anki to show it again',hideNone:'No Anki window to hide',launch:'Start Anki and connect',launching:'Starting Anki…',
  repairing:'Closing what holds the port and restarting Anki…',missing:'Anki was not found; set its path in Settings → Anki',play:'Play audio',fit:'Fit to window',
  original:'Original size',failed:'Audio playback failed',stop:'Stop studying',settings:'Study settings',addons:'Add-ons',openAnki:'Open in Anki',custom:'Custom study (Anki)',
  practice:'Practise again (schedule unchanged)',practiceTag:'Practice',next:'Next card',endPractice:'End practice',practiceDone:'You went through the whole deck',
  limits:'Daily limits',newPerDay:'New cards per day',revPerDay:'Maximum reviews per day',save:'Save to Anki',saved:'Saved to Anki',preset:'Options preset',presetHint:'Decks sharing this preset change together',
  back:'Back',focusHint:'Opened in Anki; if nothing appeared, use the button in Anki',total:'{n} cards'},ja:{hideAnki:'Anki を隠す',hidden:'Anki を隠しました。カード作成と復習はそのまま使えます。「Anki で開く」で再表示できます',
  hideNone:'隠せる Anki ウィンドウがありません',launch:'Anki を起動して接続',launching:'Anki を起動しています…',repairing:'ポートを使っているプログラムを閉じて Anki を再起動しています…',missing:'Anki が見つかりません。設定 → Anki でパスを設定してください',
  play:'音声を再生',fit:'全体を表示',original:'元のサイズ',failed:'音声を再生できませんでした',stop:'学習を中断',settings:'学習設定',addons:'アドオン',openAnki:'Anki で開く',custom:'カスタム学習（Anki）',practice:'もう一度練習（スケジュールは変わりません）',
  practiceTag:'練習',next:'次のカード',endPractice:'練習を終了',practiceDone:'デッキを一通り練習しました',limits:'1日の上限',newPerDay:'1日の新規カード数',revPerDay:'1日の最大復習数',save:'Anki に保存',saved:'Anki に保存しました',
  preset:'オプションプリセット',presetHint:'同じプリセットのデッキも一緒に変わります',back:'戻る',focusHint:'Anki で開きました。表示されない場合は Anki のボタンを使ってください',total:'全 {n} 枚'}}[locale];
 let currentFrame=null,currentCard=null,fit=true;
 let mix={};
 try{mix=JSON.parse(localStorage.getItem(mixKey))||{};}catch{}
 mix=Object.fromEntries(mixChannels.map(key=>[key,Number.isFinite(mix[key])?Math.min(100,Math.max(0,Math.round(mix[key]))):100]));
 /* (user 2026-11-12) what plays by itself after turning a card and on the next one; per viewer in localStorage */
 let auto={flip:'off',next:'off'};try{const a=JSON.parse(localStorage.getItem(autoKey))||{};for(const k of ['flip','next'])if(autoModes.includes(a[k]))auto[k]=a[k];
  }catch{}
 function mountAutoplay(toolbar){
  const L=autoLabels[locale]||autoLabels.zh,box=document.createElement('details');box.className='anki-mixer anki-autoplay';
  const group=(key,label)=>'<fieldset><legend>'+label+'</legend><div class="anki-seg" role="radiogroup">'+autoModes.map((m,i)=>'<button type="button" role="radio" data-auto="'+key+'" data-mode="'+m+'" aria-checked="'+(auto[key]===m)+'">'+L[3][i]+'</button>').join('')+'</div></fieldset>';
  box.innerHTML='<summary>'+L[0]+'</summary><div class="anki-mixer-controls">'+group('flip',L[1])+group('next',L[2])+'<small>'+L[4]+'</small></div>';
  toolbar.prepend(box);
  box.addEventListener('click',event=>{const b=event.target.closest('[data-auto]');if(!b)return;auto[b.dataset.auto]=b.dataset.mode;box.querySelectorAll('[data-auto="'+b.dataset.auto+'"]').forEach(x=>x.setAttribute('aria-checked',
   String(x===b)));try{localStorage.setItem(autoKey,JSON.stringify(auto));}catch{}});
  box.addEventListener('keydown',event=>{if(event.key==='Escape'){box.open=false;box.querySelector('summary').focus();}});
  box.addEventListener('toggle',()=>{if(box.open)toolbar.querySelectorAll('details[open]').forEach(d=>{if(d!==box)d.open=false;});});
 }
 function mountMixer(){
  const toolbar=target.querySelector('.anki-toolbar'),labels=mixLabels[locale];
  const mixer=document.createElement('details');mixer.className='anki-mixer';
  mixer.innerHTML='<summary>'+labels[0]+'</summary><div class="anki-mixer-controls">'+mixChannels.map((key,i)=>'<label><span>'+labels[i+1]+'</span><input type="range" min="0" max="100" step="1" data-mix="'+key+'" value="'+mix[key]+'"><output>'+mix[key]+'%</output></label>').join('')+'<small>'+labels[5]+'</small></div>';
  toolbar.prepend(mixer);try{mountAutoplay(toolbar);}catch{}
  mixer.addEventListener('toggle',()=>{if(mixer.open)toolbar.querySelectorAll('details[open]').forEach(d=>{if(d!==mixer)d.open=false;});});
  mixer.addEventListener('input',event=>{
   const input=event.target,key=input.dataset.mix;if(!key)return;
   mix[key]=Number(input.value);input.nextElementSibling.value=input.value+'%';
   try{localStorage.setItem(mixKey,JSON.stringify(mix));}catch{}
   currentFrame?.contentWindow?.postMessage({type:'tome-anki-mix',nonce:currentFrame.dataset.nonce,mix},'*');
  });
  mixer.addEventListener('keydown',event=>{if(event.key==='Escape'){mixer.open=false;mixer.querySelector('summary').focus();}});
 }
 // E215.11 (user: Anki was closed but the page still said connected): any request that finds Anki offline switches
 // to the offline view, and the deck view re-checks the connection every few seconds.
 /* 2026-11-12 (user: must be a foolproof one-click install) no Anki on this computer: download, install, AnkiConnect, connect */
 const INST={zh:{ask:'还没装 Anki？一键安装',title:'还没有安装 Anki',text:'点一下就好：MeguLit 会下载 Anki 官方安装包（约 190 MB）并装好，再自动装上 AnkiConnect 插件、启动并连接，全程不用自己找路径。',tips:['Windows 弹窗问「是否允许更改」时，点「是」',
  'Anki 第一次启动会出现一个黑色窗口，直接按回车，等它下载完','装好后这里会自动连上，就可以开始复习了'],go:'一键安装 Anki',downloading:'正在下载 Anki',installing:'正在安装（稍等一下，Windows 可能会询问权限）',connecting:'正在启动 Anki 并连接…',
  done:'装好了，正在连接',failed:'没有装成功',retry:'重试',cancelled:'安装被取消了：Windows 询问权限时请点「是」'},
  ja:{ask:'Anki がまだ？ワンクリックで導入',title:'Anki がインストールされていません',text:'押すだけ：MeguLit が Anki 公式インストーラー（約 190 MB）をダウンロードしてインストールし、AnkiConnect も入れて起動・接続します。パスを探す必要はありません。',
   tips:['Windows が「変更を許可しますか」と聞いたら「はい」','Anki の初回起動で黒いウィンドウが出たら Enter を押して、ダウンロードが終わるまで待つ','終わるとここで自動的に接続され、復習を始められます'],go:'Anki をワンクリックで導入',downloading:'Anki をダウンロード中',
   installing:'インストール中（Windows が許可を求めることがあります）',connecting:'Anki を起動して接続しています…',done:'完了。接続しています',failed:'インストールできませんでした',retry:'再試行',cancelled:'キャンセルされました：Windows の確認では「はい」を押してください'},
  en:{ask:'No Anki yet? Install it in one click',title:'Anki is not installed',text:'One click: MeguLit downloads the official Anki installer (about 190 MB), installs it, adds AnkiConnect, starts Anki and connects. No paths to look for.',
   tips:['When Windows asks to allow changes, choose Yes','On Anki’s first start a black window appears: press Enter and wait for it to finish downloading','When it is done this page connects by itself and you can start reviewing'],
   go:'Install Anki',downloading:'Downloading Anki',installing:'Installing (Windows may ask for permission)',connecting:'Starting Anki and connecting…',done:'Installed, connecting',
   failed:'The installation did not complete',retry:'Try again',cancelled:'Cancelled: choose Yes when Windows asks for permission'}}[locale]||null;
 const inst=()=>INST||{ask:'',title:'',text:'',tips:[],go:'',downloading:'',installing:'',connecting:'',done:'',failed:'',retry:'',cancelled:''};
 function showInstall(){const t=inst();if(landing.parentElement!==target)target.replaceChildren(landing);
  landing.innerHTML='<h2>'+esc(t.title)+'</h2><p class="muted">'+esc(t.text)+'</p><ol class="anki-install-tips">'+t.tips.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol><div class="anki-install-bar" hidden><i></i></div><p class="muted u-status" data-install-state hidden></p><div class="review-controls"><button class="primary" data-install-go>'+esc(t.go)+'</button></div>';
  const go=landing.querySelector('[data-install-go]'),bar=landing.querySelector('.anki-install-bar'),fill=bar.querySelector('i'),line=landing.querySelector('[data-install-state]');
  const paint=r=>{bar.hidden=false;line.hidden=false;const pct=r.total?Math.min(100,Math.round(r.received/r.total*100)):0;fill.style.width=(r.phase==='downloading'?pct:100)+'%';
   line.textContent=r.phase==='downloading'?t.downloading+' · '+pct+'% · '+(r.received/1048576).toFixed(0)+' / '+(r.total/1048576).toFixed(0)+' MB':r.phase==='installing'?t.installing:r.phase==='connecting'?t.connecting:r.phase==='done'?t.done:r.phase==='error'?(/CANCELLED/.test(r.error)?t.cancelled:t.failed+'（'+r.error+'）'):'';
    };
  go.onclick=async()=>{go.disabled=true;go.hidden=true;try{paint(await api('anki_install'));}catch(error){go.disabled=false;go.hidden=false;toast(reason(error));
   return;}
   let busy=false;const tick=setInterval(async()=>{if(busy)return;if(!isCurrent()){clearInterval(tick);return;}let r;busy=true;try{r=await api('anki_install_status');
    }catch{busy=false;return;}busy=false;paint(r);
    if(r.phase==='done'){clearInterval(tick);for(let i=0;i<40&&isCurrent();i++){status=await api('anki_status').catch(()=>status);if(status.connected)break;await new Promise(z=>setTimeout(z,
     3000));}if(isCurrent())drawDecks();}
    else if(r.phase==='error'){clearInterval(tick);go.textContent=t.retry;go.disabled=false;go.hidden=false;}},700);};}
 function failed(error){const code=typeof error==='string'?error:error?.message;if(code==='ANKI_EXECUTABLE_MISSING'){if(INST&&isCurrent())showInstall();else toast(copy.missing);
  return;}toast(reason(error));if(code==='ANKI_OFFLINE'&&isCurrent()){status={connected:false,reason:code};drawDecks();}}
 const poll=setInterval(async()=>{if(!isCurrent()){clearInterval(poll);return;}if(currentCard)return;try{const next=await api('anki_status');if(!isCurrent()||currentCard)return;
  if(next.connected!==status.connected){status=next;drawDecks();}}catch{}},4000);
 async function replay(card,button){if(!isCurrent()||currentCard!==card||button?.disabled)return;if(button)button.disabled=true;try{await api('anki_play_audio',
  {cardId:card.cardId});}catch(error){if(isCurrent())failed(error);}finally{if(button)button.disabled=false;}}
 function playCardAudio(card){
  if(!currentFrame||currentCard!==card)return;
  currentFrame.contentWindow.postMessage({type:'tome-anki-play-all',nonce:currentFrame.dataset.nonce},'*');
 }
 /* ---- HUD stage (2026-11-13): no panel box, every part is a block placed by percentage; full screen; custom look ---- */
 const H=globalThis.MeguHud,M=globalThis.MeguAnkiHud,ankiKeyAction=M.keyAction,hc=hudCopy[locale]||hudCopy.zh;
 let sysFonts=null,hud=M.load(localStorage),editing=false,immersive=false,shotSrc='',reviewed=0;
 const saveHud=()=>M.save(localStorage,hud);
 const hudMessage=()=>({layout:hud.layout,vars:M.cssVars(hud.style),edit:editing,labels:hc.labels});
 const post=data=>{try{currentFrame?.contentWindow?.postMessage({...data,nonce:currentFrame.dataset.nonce},'*');}catch{}};
 function frame(card){
  const iframe=document.createElement('iframe'),nonce=crypto.randomUUID();iframe.className='anki-hud-frame';iframe.title=text.ankiReview;iframe.sandbox='allow-scripts';
   iframe.allow='autoplay';iframe.referrerPolicy='no-referrer';
  iframe.src='anki-card.html#'+nonce;iframe.dataset.nonce=nonce;
  const play=card.when&&typeof auto==='object'?auto[card.when]||'off':'off';iframe.onload=()=>{if(isCurrent()&&currentFrame===iframe)iframe.contentWindow.postMessage({
   type:'tome-anki-card',nonce,html:card.html,fit,copy,mix,auto:play,hud:hudMessage()},'*');};return iframe;
 }
 function stage(){return target.querySelector('.anki-hud');}
 function shell(){
  let s=stage();if(s)return s;
  s=document.createElement('section');s.className='anki-hud';s.setAttribute('aria-label',text.ankiReview);
  s.innerHTML='<div class="anki-hud-bg" aria-hidden="true"></div><div class="anki-hud-bar anki-toolbar"></div><div class="anki-hud-canvas"><div class="anki-hud-frame-slot"></div><div class="anki-hud-layer"><div class="anki-hud-block" data-hud="progress"><div class="anki-hud-progress" aria-live="polite"></div></div><div class="anki-hud-block" data-hud="controls"><div class="review-controls" data-controls></div></div></div><div class="anki-hud-edit" hidden><span>'+esc(hc.hint)+'</span><button type="button" class="text-button" data-hud-reset>'+esc(hc.reset)+'</button><button type="button" class="primary" data-hud-done>'+esc(hc.done)+'</button></div><div class="anki-hud-keys" aria-hidden="true">'+esc(hc.keys)+'</div></div>';
  target.replaceChildren(s);
  for(const el of s.querySelectorAll('.anki-hud-block')){const id=el.dataset.hud;el.insertAdjacentHTML('beforeend','<span class="hud-label">'+esc(hc.labels[id]||id)+'</span>');
   H.attach(el,{stage:()=>s.querySelector('.anki-hud-canvas'),rect:()=>hud.layout[id],editing:()=>editing,onCommit:r=>{hud.layout[id]=r;saveHud();}});}
  s.querySelector('[data-hud-done]').onclick=()=>setEditing(false);s.querySelector('[data-hud-reset]').onclick=resetHud;
  applyHud();return s;
 }
 function placeBlocks(){const s=stage();if(!s)return;for(const el of s.querySelectorAll('.anki-hud-block'))H.applyRect(el,hud.layout[el.dataset.hud]);}
 function paintBg(){
  const s=stage();if(!s)return;const bg=s.querySelector('.anki-hud-bg'),b=hud.style.bg;
  const src=b.mode==='game'?String(cover()||''):b.mode==='shot'?shotSrc:b.mode==='image'?b.image:'';
  bg.style.backgroundColor=b.mode==='color'?b.color:'';bg.style.backgroundImage=src&&!/[\n\r]/.test(src)?'url('+JSON.stringify(src)+')':'';
  bg.style.setProperty('--hud-bg-blur',b.blur+'px');bg.style.setProperty('--hud-bg-dim',String(b.mode==='none'?0:b.dim/100));
  s.dataset.bg=src||b.mode==='color'?b.mode:'none';
 }
 function applyHud(){
  const s=stage();if(!s)return;for(const [k,v] of Object.entries(M.cssVars(hud.style)))s.style.setProperty(k,v);
  placeBlocks();paintBg();post({type:'tome-anki-hud',...hudMessage()});
 }
 function setEditing(on){
  editing=!!on;const s=stage();if(!s)return;s.classList.toggle('editing',editing);s.querySelector('.anki-hud-edit').hidden=!editing;
  s.querySelectorAll('.anki-hud-bar details[open]').forEach(d=>d.open=false);s.querySelector('[data-hud-layout]')?.setAttribute('aria-pressed',String(editing));
  post({type:'tome-anki-hud',edit:editing});if(editing)s.querySelector('[data-hud-done]').focus();
 }
 function resetHud(){hud={layout:M.cleanLayout({}),style:M.cleanStyle({})};saveHud();applyHud();const bar=stage()?.querySelector('.anki-hud-bar');if(bar){bar.querySelector('.anki-look')?.remove();mountLook(bar);}}
 /* Full screen: the stage covers the window (fixed, above the top bar) and the window itself goes full screen through
    the desktop shell, or the browser Fullscreen API outside it. Esc leaves. */
 async function setImmersive(on){
  on=!!on;if(on===immersive)return;immersive=on;const s=stage();s?.classList.toggle('immersive',on);document.documentElement.classList.toggle('anki-immersive',on);
  s?.querySelector('[data-hud-full]')?.setAttribute('aria-pressed',String(on));const b=s?.querySelector('[data-hud-full]');if(b)b.textContent=on?hc.exitFull:hc.full;
  let native=false;if(windowAction){try{await windowAction(on?'fullscreen_on':'fullscreen_off');native=true;}catch{}}
  if(!native)try{if(on&&!document.fullscreenElement)await document.documentElement.requestFullscreen?.();else if(!on&&document.fullscreenElement)await document.exitFullscreen();}catch{}
 }
 const fullscreenSync=()=>{if(!document.fullscreenElement&&immersive&&!windowAction)setImmersive(false);};
 document.addEventListener('fullscreenchange',fullscreenSync);
 function leaveHud(){setEditing(false);if(immersive)setImmersive(false);}
 function lookup(word){
  const s=stage();if(!s||!word)return;s.querySelector('.anki-hud-lookup')?.remove();const box=document.createElement('div');box.className='anki-hud-lookup';box.setAttribute('role','dialog');
  box.innerHTML='<header><strong lang="ja"></strong><button type="button" class="text-button" data-close>'+esc(hc.close)+'</button></header><div class="anki-hud-lookup-body"><span class="spinner"></span></div>';
  box.querySelector('strong').textContent=word;box.querySelector('[data-close]').onclick=()=>box.remove();box.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();box.remove();}});
  s.querySelector('.anki-hud-canvas').append(box);box.querySelector('[data-close]').focus();
  api('dictionary',{query:word,source:'local',operationId:crypto.randomUUID()}).then(items=>{if(!box.isConnected)return;const list=(Array.isArray(items)?items:[]).slice(0,4);
   box.querySelector('.anki-hud-lookup-body').innerHTML=list.length?'<ol>'+list.map(i=>'<li><div><b lang="ja">'+esc(i.spelling||'')+'</b> <span lang="ja">'+esc(i.reading||'')+'</span></div><p>'+esc(i.definition||'')+'</p></li>').join('')+'</ol>':'<p class="muted">'+esc(hc.noResult)+'</p>';
  }).catch(()=>{if(box.isConnected)box.querySelector('.anki-hud-lookup-body').innerHTML='<p class="muted">'+esc(hc.noResult)+'</p>';});
 }
 /* Appearance panel: fonts, sizes, colours, background; same pop-over as the volume mixer */
 function mountLook(bar){
  const st=hud.style,box=document.createElement('details');box.className='anki-mixer anki-look';
  const opts=(list,cur)=>[...new Set([...list,cur].filter(Boolean))].map(f=>'<option value="'+esc(f)+'">').join('');
  const range=(group,key,min,max,val,label,unit)=>'<label><span>'+esc(label)+'</span><input type="range" min="'+min+'" max="'+max+'" step="1" data-look="'+group+'.'+key+'" value="'+val+'"><output>'+val+unit+'</output></label>';
  box.innerHTML='<summary>'+esc(hc.look)+'</summary><div class="anki-mixer-controls anki-look-controls">'+
   '<fieldset><legend>'+esc(hc.jaFont)+'</legend><input data-look-font="jaFont" list="anki-hud-ja-fonts" value="'+esc(st.jaFont)+'" maxlength="80" aria-label="'+esc(hc.jaFont)+'"><datalist id="anki-hud-ja-fonts">'+opts(sysFonts||M.FONTS_JA,st.jaFont)+'</datalist></fieldset>'+
   '<fieldset><legend>'+esc(hc.zhFont)+'</legend><input data-look-font="zhFont" list="anki-hud-zh-fonts" value="'+esc(st.zhFont)+'" maxlength="80" aria-label="'+esc(hc.zhFont)+'"><datalist id="anki-hud-zh-fonts">'+opts(sysFonts||M.FONTS_ZH,st.zhFont)+'</datalist></fieldset>'+
   (typeof window.queryLocalFonts==='function'?'<button type="button" class="text-button" data-look-sysfonts>'+esc(hc.systemFonts)+'</button>':'')+
   '<fieldset><legend>'+esc(hc.sizes)+'</legend>'+range('size','word',20,160,st.size.word,hc.size.word,'px')+range('size','info',12,80,st.size.info,hc.size.info,'px')+range('size','example',12,80,st.size.example,hc.size.example,'px')+range('size','card',12,60,st.size.card,hc.size.card,'px')+range('size','controls',11,32,st.size.controls,hc.size.controls,'px')+'</fieldset>'+
   '<fieldset><legend>'+esc(hc.colors)+'</legend><div class="anki-look-colors">'+['word','text','dim','accent'].map(k=>'<label><input type="color" data-look="color.'+k+'" value="'+st.color[k]+'"><span>'+esc(hc.color[k])+'</span></label>').join('')+'</div>'+
   '<label class="anki-look-check"><input type="checkbox" data-look-shadow'+(st.shadow?' checked':'')+'><span>'+esc(hc.shadow)+'</span></label></fieldset>'+
   '<fieldset><legend>'+esc(hc.bg)+'</legend><div class="anki-seg anki-seg-5" role="radiogroup">'+M.BG_MODES.map((m,i)=>'<button type="button" role="radio" data-look-bg="'+m+'" aria-checked="'+(st.bg.mode===m)+'">'+esc(hc.bgModes[i])+'</button>').join('')+'</div>'+
   '<div class="anki-look-bgrow"><input type="color" data-look="bg.color" value="'+st.bg.color+'" aria-label="'+esc(hc.bgModes[1])+'"><button type="button" class="text-button" data-look-pick>'+esc(hc.pick)+'</button><input type="file" accept="image/png,image/jpeg,image/webp" data-look-file hidden></div>'+
   range('bg','blur',0,40,st.bg.blur,hc.blur,'px')+range('bg','dim',0,90,st.bg.dim,hc.dim,'%')+'</fieldset>'+
   '<button type="button" class="text-button" data-look-reset>'+esc(hc.reset)+'</button></div>';
  bar.prepend(box);try{enhanceSelects(box);}catch{}
  const commit=()=>{hud.style=M.cleanStyle(hud.style);saveHud();applyHud();};
  box.addEventListener('input',event=>{const el=event.target;
   if(el.dataset.lookFont){hud.style[el.dataset.lookFont]=el.value==='__custom__'?'':el.value;commit();return;}
   if(el.dataset.look){const [g,k]=el.dataset.look.split('.');hud.style[g][k]=el.type==='range'?Number(el.value):el.value;if(el.type==='range')el.nextElementSibling.value=el.value+(g==='bg'&&k==='dim'?'%':'px');commit();}
   if(el.hasAttribute('data-look-shadow')){hud.style.shadow=el.checked;commit();}});
  box.addEventListener('change',event=>{if(event.target.hasAttribute('data-look-shadow')){hud.style.shadow=event.target.checked;commit();}});
  box.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;
   if(b.dataset.lookBg){hud.style.bg.mode=b.dataset.lookBg;box.querySelectorAll('[data-look-bg]').forEach(x=>x.setAttribute('aria-checked',String(x===b)));if(b.dataset.lookBg==='image'&&!hud.style.bg.image)box.querySelector('[data-look-file]').click();commit();}
   else if(b.hasAttribute('data-look-pick'))box.querySelector('[data-look-file]').click();
   else if(b.hasAttribute('data-look-reset')){hud.style=M.cleanStyle({});saveHud();applyHud();box.remove();mountLook(bar);bar.querySelector('.anki-look').open=true;}
   else if(b.hasAttribute('data-look-sysfonts')){try{sysFonts=[...new Set((await window.queryLocalFonts()).map(f=>f.family))].sort();if(!sysFonts.length)throw Error('none');const open=box.open;box.remove();mountLook(bar);bar.querySelector('.anki-look').open=open;}catch{toast(hc.fontsFailed);}}});
  box.querySelector('[data-look-file]').addEventListener('change',event=>{const file=event.target.files?.[0];if(!file)return;const img=new Image(),url=URL.createObjectURL(file);
   img.onload=()=>{/* Kept small enough for local storage: at most 1920 px wide, JPEG */const k=Math.min(1,1920/img.width,1080/img.height),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);hud.style.bg.image=c.toDataURL('image/jpeg',.84);hud.style.bg.mode='image';
    box.querySelectorAll('[data-look-bg]').forEach(x=>x.setAttribute('aria-checked',String(x.dataset.lookBg==='image')));commit();};img.onerror=()=>URL.revokeObjectURL(url);img.src=url;});
  box.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();box.open=false;box.querySelector('summary').focus();}});
  box.addEventListener('toggle',()=>{if(box.open)bar.querySelectorAll('details[open]').forEach(d=>{if(d!==box)d.open=false;});});
 }
 function toolbar(s,buttons){
  const bar=s.querySelector('.anki-hud-bar');bar.innerHTML=buttons+'<button class="text-button" data-hud-layout aria-pressed="'+editing+'">'+esc(hc.layout)+'</button><button class="text-button" data-hud-full aria-pressed="'+immersive+'">'+esc(immersive?hc.exitFull:hc.full)+'</button>';
  bar.querySelector('[data-hud-layout]').onclick=()=>setEditing(!editing);bar.querySelector('[data-hud-full]').onclick=()=>setImmersive(!immersive);
  mountMixer();mountLook(bar);return bar;
 }
 function key(k){
  const s=stage();if(!s||!isCurrent())return;const controls=s.querySelector('[data-controls]'),ratings=[...controls.querySelectorAll('.anki-rating')].map(b=>Number(b.dataset.ease));
  const action=ankiKeyAction(k,{answerShown:ratings.length>0,ratings,editing,immersive});if(!action)return false;
  if(action==='fullscreen')setImmersive(!immersive);else if(action==='layout')setEditing(!editing);else if(action==='replay')s.querySelector('[data-replay]')?.click();
  else if(action==='primary')controls.querySelector('button.primary:not(:disabled)')?.click();else controls.querySelector('.rating-'+action.slice(5)+':not(:disabled)')?.click();
  return true;
 }
 const keydown=event=>{if(!isCurrent()||!stage()){return;}if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,select,textarea,[contenteditable],details[open],.anki-hud-lookup,.select-popup'))return;
  if(event.key!=='Escape'&&event.target.closest?.('button')&&(event.key===' '||event.key==='Enter'))return;if(key(event.key))event.preventDefault();};
 document.addEventListener('keydown',keydown);
 const messages=event=>{if(!isCurrent()){window.removeEventListener('message',messages);return;}
  if(!currentFrame||event.source!==currentFrame.contentWindow||event.data?.nonce!==currentFrame.dataset.nonce)return;const d=event.data;
  if(d.type==='tome-anki-replay')replay(currentCard,target.querySelector('[data-replay]'));
  else if(d.type==='tome-anki-hud-move'&&Object.hasOwn(M.LAYOUT,d.id)){hud.layout[d.id]=H.normRect(d.rect,M.LAYOUT[d.id]);saveHud();}
  else if(d.type==='tome-anki-shot'){shotSrc=/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(d.src||''))?d.src:'';paintBg();}
  else if(d.type==='tome-anki-key')key(String(d.key||''));
  else if(d.type==='tome-anki-lookup')lookup(String(d.word||'').slice(0,60));};
 window.addEventListener('message',messages);
 stopMessages=()=>{window.removeEventListener('message',messages);document.removeEventListener('keydown',keydown);document.removeEventListener('fullscreenchange',fullscreenSync);clearInterval(poll);leaveHud();};
 function progress(s,html){s.querySelector('.anki-hud-progress').innerHTML=html;}
 function mountFrame(s,card){currentFrame=frame(card);s.querySelector('.anki-hud-frame-slot').replaceChildren(currentFrame);}
 function drawCard(card){
  if(!isCurrent())return;currentCard=card;currentFrame=null;
  if(card.done){drawDone(card);return;}
  const s=shell();
  toolbar(s,(card.hasAudio?'<button class="text-button" data-replay>'+copy.play+'</button>':'')+'<button class="text-button" data-fit aria-pressed="'+fit+'">'+(fit?copy.fit:copy.original)+'</button><button class="text-button" data-reload>'+text.ankiRefresh+'</button><button class="text-button" data-stop>'+copy.stop+'</button>');
  progress(s,'<span class="anki-hud-deck">Anki · '+esc(card.deck)+'</span>'+(reviewed?'<b>'+esc(hc.reviewed.replace('{n}',reviewed))+'</b>':''));
  mountFrame(s,{...card,when:card.answerShown?'flip':'next'});s.querySelector('[data-reload]').onclick=reload;s.querySelector('[data-stop]').onclick=stopStudy;
  const play=s.querySelector('[data-replay]');if(play)play.onclick=()=>card.manualAudio?playCardAudio(card):replay(card,play);
  s.querySelector('[data-fit]').onclick=event=>{fit=!fit;event.currentTarget.textContent=fit?copy.fit:copy.original;event.currentTarget.setAttribute('aria-pressed',
   String(fit));currentFrame.contentWindow.postMessage({type:'tome-anki-fit',nonce:currentFrame.dataset.nonce,fit},'*');};
  const controls=s.querySelector('[data-controls]');controls.replaceChildren();
  if(!card.answerShown){const button=document.createElement('button');button.className='primary';button.textContent=text.showAnswer;button.onclick=async()=>{button.disabled=true;
   try{drawCard(await api('anki_show_answer',{cardId:card.cardId}));}catch(error){button.disabled=false;failed(error);}};controls.append(button);}
  else for(const[ease,index]of card.buttons.map((ease,index)=>[ease,index])){
   const button=document.createElement('button');button.className='anki-rating rating-'+ease;button.dataset.ease=String(ease);button.innerHTML='<strong>'+esc([null,text.ankiAgain,text.ankiHard,
    text.ankiGood,text.ankiEasy][ease])+'</strong><small>'+esc(card.intervals[index]||'')+'</small>';
   button.onclick=async()=>{controls.querySelectorAll('button').forEach(b=>b.disabled=true);try{const next=await api('anki_grade',{cardId:card.cardId,ease,operationId:crypto.randomUUID()});reviewed++;drawCard(next);
    }catch(error){failed(error);target.querySelector('[data-reload]')?.focus();}};controls.append(button);
  }
 }
 function drawDecks(){
  if(!isCurrent())return;
  currentCard=null;currentFrame=null;leaveHud();
  if(landing.parentElement!==target)target.replaceChildren(landing);
  landing.classList.remove('anki-loading');landing.removeAttribute('aria-busy');
  if(!status.connected){landing.innerHTML='<h2>'+text.ankiOffline+'</h2><p class="muted">'+esc(reason(status.reason))+'</p><p class="muted u-status" data-state="off">AnkiConnect'+(status.url?' · '+esc(status.url):'')+'</p><div class="review-controls"><button class="primary" data-launch>'+copy.launch+'</button><button class="secondary" data-connect>'+text.reconnect+'</button></div>'+(INST?'<p class="anki-install-ask"><button type="button" class="text-button" data-install-ask>'+esc(inst().ask)+'</button></p>':'');
   target.querySelector('[data-install-ask]')?.addEventListener('click',showInstall);/* Reconnect repairs the connection (user): closes programs holding AnkiConnect's port, cold-starts Anki, then reloads */
   target.querySelector('[data-connect]').onclick=async event=>{const button=event.currentTarget;target.querySelectorAll('.review-controls button').forEach(b=>b.disabled=true);
    button.setAttribute('aria-busy','true');button.textContent=copy.repairing;try{await api('anki_repair');}catch(error){failed(error);}if(isCurrent())renderAnkiReview({
    target,api,text,esc,isCurrent,toast,cover,windowAction});};
   target.querySelector('[data-launch]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=copy.launching;
    try{await api('anki_launch',{reason:status.reason});}catch(error){failed(error);if(String(error?.message||error)==='ANKI_EXECUTABLE_MISSING'&&INST)return;}status=await api('anki_status').catch(()=>status);
    if(isCurrent())drawDecks();};return;}
  landing.innerHTML='<div class="eyebrow">'+text.ankiConnected+'</div><h2>'+text.ankiReview+'</h2><p class="muted">'+text.ankiStartHint+'</p><div class="review-controls"><select data-deck aria-label="'+text.chooseDeck+'">'+status.decks.map(deck=>'<option'+(deck===status.defaultDeck?' selected':'')+'>'+esc(deck)+'</option>').join('')+'</select><button class="primary" data-start>'+text.startAnki+'</button></div><button class="text-button" data-current>'+text.ankiRefresh+'</button><div class="review-controls anki-tools"><button class="text-button" data-limits>'+copy.settings+'</button><button class="text-button" data-open="addons">'+copy.addons+'</button><button class="text-button" data-open="overview">'+copy.openAnki+'</button><button class="text-button" data-hide-anki>'+copy.hideAnki+'</button></div>';
  const sync=document.createElement('button');sync.className='secondary';sync.textContent=document.documentElement.lang.startsWith('ja')?'単語と復習履歴を同期':document.documentElement.lang.startsWith('en')?'Sync vocabulary and review history':'同步单词与复习记录';
   sync.onclick=async()=>{sync.disabled=true;try{const result=await api('anki_sync');toast(`${sync.textContent} · +${result.imported} / ${result.reviews}`);window.dispatchEvent(new Event('tome-word-status-changed'));
   }catch(error){failed(error);}finally{sync.disabled=false;}};target.querySelector('.review-controls').append(sync);
  target.querySelector('[data-start]').onclick=async event=>{event.currentTarget.disabled=true;try{drawCard(await api('anki_start',{deck:target.querySelector('[data-deck]').value}));
   }catch(error){failed(error);drawDecks();}};target.querySelector('[data-current]').onclick=reload;
  const selected=()=>target.querySelector('[data-deck]').value;target.querySelector('[data-limits]').onclick=()=>drawLimits(selected(),drawDecks);target.querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>openAnki(button.dataset.open,
   selected(),button));
  // E215.12 (user): hide an Anki that was started normally, keeping AnkiConnect running.
  target.querySelector('[data-hide-anki]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{const r=await api('anki_hide');toast(r?.hidden?copy.hidden:copy.hideNone);
   }catch(error){failed(error);}finally{button.disabled=false;}};
  enhanceSelects(target);
 }
 async function stopStudy(){try{await api('anki_stop');}catch{}drawDecks();}
 async function openAnki(targetName,deck,button){if(button)button.disabled=true;try{const r=await api('anki_open',{target:targetName,deck});if(!r?.focused)toast(copy.focusHint);
  }catch(error){failed(error);}finally{if(button)button.disabled=false;}}
 function drawDone(card){
  currentCard=card;currentFrame=null;leaveHud();
  const heading=card.practiceDone?copy.practiceDone:card.finished?text.ankiFinished:text.ankiEmpty;
  target.innerHTML='<section class="panel review-card">'+(card.deck?'<div class="eyebrow">'+esc(card.deck)+(card.total?' · '+esc(copy.total.replace('{n}',card.total)):'')+'</div>':'')+'<h2>'+heading+'</h2>'+(card.finished?'<p class="muted">'+text.ankiFinishedHint+'</p>':'')+'<div class="review-controls">'+(card.deck&&card.total!==0?'<button class="primary" data-practice>'+copy.practice+'</button>':'')+(card.deck?'<button class="secondary" data-custom>'+copy.custom+'</button><button class="secondary" data-limits>'+copy.limits+'</button>':'')+'<button class="secondary" data-decks>'+text.chooseDeck+'</button></div></section>';
  target.querySelector('[data-decks]').onclick=drawDecks;
  target.querySelector('[data-practice]')?.addEventListener('click',()=>practice(card.deck,false));
  target.querySelector('[data-custom]')?.addEventListener('click',event=>openAnki('custom',card.deck,event.currentTarget));
  target.querySelector('[data-limits]')?.addEventListener('click',()=>drawLimits(card.deck,()=>drawDone(card)));
 }
 async function practice(deck,advance){try{const card=await api('anki_practice',{deck,advance});if(isCurrent())card.done?drawDone(card):drawPractice(card);}catch(error){
  failed(error);}}
 function drawPractice(card){
  if(!isCurrent())return;currentCard=card;let shown=false;
  const s=shell();toolbar(s,'<button class="text-button" data-stop>'+copy.endPractice+'</button>');
  progress(s,'<span class="anki-hud-deck">'+esc(copy.practiceTag)+' · '+esc(card.deck)+'</span><b class="anki-hud-count">'+esc(card.position)+' / '+esc(card.total)+'</b>');
  const show=()=>{mountFrame(s,{html:shown?card.answer:card.question,when:shown?'flip':'next'});
   const controls=s.querySelector('[data-controls]');controls.replaceChildren();const button=document.createElement('button');button.className='primary';button.textContent=shown?copy.next:text.showAnswer;
   button.onclick=()=>{if(shown)practice(card.deck,true);else{shown=true;show();}};controls.append(button);};
  s.querySelector('[data-stop]').onclick=async()=>{try{await api('anki_practice',{end:true});}catch{}drawDecks();};show();
 }
 async function drawLimits(deck,back){
  if(!deck)return;leaveHud();let config;try{config=await api('anki_deck_config',{deck});}catch(error){failed(error);return;}if(!isCurrent())return;
  target.innerHTML='<section class="panel review-card anki-limits"><div class="eyebrow">'+esc(deck)+'</div><h2>'+copy.limits+'</h2><p class="muted">'+copy.preset+' · '+esc(config.preset)+' · '+copy.presetHint+'</p><div class="review-controls"><label>'+copy.newPerDay+' <input type="number" min="0" max="9999" step="1" data-new value="'+config.newPerDay+'"></label><label>'+copy.revPerDay+' <input type="number" min="0" max="99999" step="1" data-rev value="'+config.revPerDay+'"></label></div><div class="review-controls"><button class="primary" data-save>'+copy.save+'</button><button class="secondary" data-options>'+copy.openAnki+'</button><button class="secondary" data-back>'+copy.back+'</button></div></section>';
  target.querySelector('[data-back]').onclick=back;target.querySelector('[data-options]').onclick=event=>openAnki('options',deck,event.currentTarget);
  target.querySelector('[data-save]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await api('anki_deck_limits',{deck,newPerDay:Number(target.querySelector('[data-new]').value),
   revPerDay:Number(target.querySelector('[data-rev]').value)});toast(copy.saved);back();}catch(error){failed(error);button.disabled=false;}};
 }
 // E215.7 (user): leaving Learning mid-review and coming back continues the card Anki is on.
 if(status.connected){try{const card=await api('anki_current');if(!isCurrent())return;if(!card.done){drawCard(card);return;}}catch{}
  try{const card=await api('anki_practice',{resume:true});if(!isCurrent())return;if(!card.done){drawPractice(card);return;}}catch{}}
 drawDecks();
}
