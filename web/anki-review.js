// SPDX-License-Identifier: GPL-3.0-or-later
import {enhanceSelects} from './select-control.js';
import {reviewRest} from './empty-states.js';
import './hud-drag.js';
import './anki-hud-model.js';
let stopMessages=()=>{};
/* 2026-11-13 (user: anki界面要大改…放大 去掉背景 实现全屏 排版字体背景可自定义 像游戏 HUD 一样拖动) */
const hudCopy={
 zh:{look:'外观',layout:'调整布局',done:'完成',reset:'恢复默认',full:'全屏',exitFull:'退出全屏',jaFont:'日文字体',zhFont:'中文字体',systemFonts:'读取系统字体',
  sizes:'字号',size:{word:'单词',info:'读音释义',example:'例句',card:'整卡模式',controls:'按钮'},colors:'颜色',color:{word:'单词',text:'正文',dim:'次要',accent:'高亮'},
  bg:'背景',bgModes:['无','纯色','游戏背景','卡片截图','自选图片'],pick:'选择图片…',blur:'模糊',dim:'暗度',shadow:'文字阴影',
  labels:{progress:'进度',word:'单词',info:'读音 · 释义',example:'例句 · 译文',shot:'截图',card:'整张卡片',controls:'按钮'},
  presetLabel:'预设',presets:{classic:'经典居中',split:'左图右文',subtitle:'字幕式',minimal:'极简大字'},mine:'我的布局',pick:'选择…',none:'还没有',saveAs:'另存当前',savedOk:'已另存为我的布局',opacity:'透明度',place:'摆放',free:'无极摆放',gridMode:'网格对齐',gridSize:'网格',altHint:'按住 Alt 临时关闭吸附',
  hint:'拖动方块移动，拖边角缩放 · 方向键微调，Shift+方向键改大小',shotHint:'截图：拉边改比例，拉角缩放（Shift 保持比例）· 双击或按住 Alt 拖动取景，滚轮缩放',dockTitle:'布局',collapse:'折叠',expand:'展开布局工具',help:'操作说明',
  nudged:'已自动让位',space:'空格',reviewed:'已复习 {n}',noResult:'词典里没有找到',close:'关闭',
  keys:'空格 翻面/良好 · 1–4 评分 · F 全屏 · L 布局 · Esc 退出',fontsFailed:'没能读取系统字体，可直接输入字体名'},
 en:{look:'Appearance',layout:'Edit layout',done:'Done',reset:'Restore defaults',full:'Full screen',exitFull:'Exit full screen',jaFont:'Japanese font',zhFont:'Chinese font',systemFonts:'Load installed fonts',
  sizes:'Text size',size:{word:'Word',info:'Reading & meaning',example:'Example',card:'Whole card',controls:'Buttons'},colors:'Colours',color:{word:'Word',text:'Text',dim:'Secondary',accent:'Highlight'},
  bg:'Background',bgModes:['None','Colour','Game art','Card screenshot','Own picture'],pick:'Choose picture…',blur:'Blur',dim:'Darken',shadow:'Text shadow',
  labels:{progress:'Progress',word:'Word',info:'Reading · meaning',example:'Example · translation',shot:'Screenshot',card:'Whole card',controls:'Buttons'},
  presetLabel:'Presets',presets:{classic:'Classic',split:'Picture left',subtitle:'Subtitles',minimal:'Minimal'},mine:'My layouts',pick:'Choose…',none:'None yet',saveAs:'Save current',savedOk:'Saved to my layouts',opacity:'Opacity',place:'Placement',free:'Free',gridMode:'Grid',gridSize:'Grid',altHint:'Hold Alt to turn snapping off',
  hint:'Drag a block to move it, drag its edges to resize · arrows nudge, Shift+arrows resize',shotHint:'Screenshot: edges change the shape, corners scale (Shift keeps it) · double-click or Alt-drag to frame, wheel to zoom',dockTitle:'Layout',collapse:'Collapse',expand:'Open layout tools',help:'How it works',
  nudged:'moved to avoid overlap',space:'Space',reviewed:'{n} reviewed',noResult:'Not in the dictionary',close:'Close',
  keys:'Space flip/Good · 1–4 rate · F full screen · L layout · Esc leave',fontsFailed:'Could not read installed fonts; type a font name instead'},
 ja:{look:'外観',layout:'レイアウト調整',done:'完了',reset:'既定に戻す',full:'全画面',exitFull:'全画面を終了',jaFont:'日本語フォント',zhFont:'中国語フォント',systemFonts:'インストール済みフォントを読む',
  sizes:'文字サイズ',size:{word:'単語',info:'読み・意味',example:'例文',card:'カード全体',controls:'ボタン'},colors:'色',color:{word:'単語',text:'本文',dim:'補助',accent:'強調'},
  bg:'背景',bgModes:['なし','単色','ゲーム画像','カードのスクショ','画像を選ぶ'],pick:'画像を選ぶ…',blur:'ぼかし',dim:'暗さ',shadow:'文字の影',
  labels:{progress:'進捗',word:'単語',info:'読み · 意味',example:'例文 · 訳',shot:'スクリーンショット',card:'カード全体',controls:'ボタン'},
  presetLabel:'プリセット',presets:{classic:'中央揃え',split:'左に画像',subtitle:'字幕風',minimal:'大きな文字'},mine:'マイレイアウト',pick:'選択…',none:'まだありません',saveAs:'現在のを保存',savedOk:'マイレイアウトに保存しました',opacity:'透明度',place:'配置',free:'自由配置',gridMode:'グリッド',gridSize:'グリッド',altHint:'Alt を押している間は吸着しません',
  hint:'ブロックをドラッグで移動、端をドラッグで拡大縮小 · 矢印キーで微調整、Shift+矢印でサイズ',shotHint:'スクショ：辺で比率、角で拡大縮小（Shift で比率固定）· ダブルクリックか Alt ドラッグで位置、ホイールでズーム',dockTitle:'レイアウト',collapse:'たたむ',expand:'レイアウトツールを開く',help:'使い方',
  nudged:'重ならないよう移動',space:'Space',reviewed:'{n} 枚復習',noResult:'辞書に見つかりません',close:'閉じる',
  keys:'Space 裏返す/普通 · 1–4 評価 · F 全画面 · L レイアウト · Esc 終了',fontsFailed:'フォント一覧を読めませんでした。名前を直接入力できます'}
};
/* (user 2026-11-14) say why Anki could not do it, instead of the catch-all 「暂时无法完成此操作」 */
const ankiReasons={
 zh:{ANKI_REVIEW_INACTIVE:'Anki 现在不在复习界面，这一步只能在 Anki 复习中进行',ANKI_MEDIA_MISSING:'这张卡没有找到音频文件（MeguLit 和 Anki 媒体库里都没有）',ANKI_TIMEOUT:'AnkiConnect 超时：Anki 可能卡在弹窗或同步中',
  ANKI_UNAVAILABLE:'连接 AnkiConnect 失败，请确认 Anki 已打开',ANKI_INVALID_RESPONSE:'AnkiConnect 返回了无法识别的结果，请更新插件',ANKI_INVALID_CARD:'卡片编号无效，请刷新',ANKI_FAILED:'Anki 拒绝了这个操作（AnkiConnect 返回错误）'},
 ja:{ANKI_REVIEW_INACTIVE:'Anki が復習画面ではありません。この操作は Anki の復習中だけ使えます',ANKI_MEDIA_MISSING:'このカードの音声ファイルが見つかりません（MeguLit にも Anki のメディアにもありません）',ANKI_TIMEOUT:'AnkiConnect がタイムアウトしました。Anki がダイアログや同期で止まっている可能性があります',
  ANKI_UNAVAILABLE:'AnkiConnect に接続できません。Anki が起動しているか確認してください',ANKI_INVALID_RESPONSE:'AnkiConnect の応答を読めません。プラグインを更新してください',ANKI_INVALID_CARD:'カード番号が無効です。再読み込みしてください',ANKI_FAILED:'Anki がこの操作を拒否しました（AnkiConnect のエラー）'},
 en:{ANKI_REVIEW_INACTIVE:'Anki is not in review, and this only works during an Anki review',ANKI_MEDIA_MISSING:'No audio file was found for this card (neither in MeguLit nor in Anki media)',ANKI_TIMEOUT:'AnkiConnect timed out; Anki may be stuck on a dialog or syncing',
  ANKI_UNAVAILABLE:'Could not reach AnkiConnect; make sure Anki is open',ANKI_INVALID_RESPONSE:'AnkiConnect sent a reply MeguLit cannot read; update the add-on',ANKI_INVALID_CARD:'Invalid card id; refresh the page',ANKI_FAILED:'Anki refused this action (AnkiConnect error)'}};
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
  2)]||'AnkiConnect port is taken',ANKI_OFFLINE:text.ankiOfflineHint,ANKI_RATING_UNCERTAIN:text.ankiChanged,ANKI_ACTION_PENDING:text.ankiChanged,...ankiReasons[document.documentElement.lang.slice(0,2)]||ankiReasons.zh})[typeof error==='string'?error:error?.message]||
  text.ankiFailed+'（'+String((typeof error==='string'?error:error?.message)||'?').slice(0,80)+'）';
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
 /* (user 2026-11-14) the service sends the card's own clips (MeguLit's copy first); they play here, Anki's player only when none came back */
 let replaying=null;
 function playClips(clips){replaying?.pause();const channel=name=>/^tomoyo_g_/i.test(name)?'game':/^tomoyo_s_/i.test(name)?'sentence':/^tomoyo_/i.test(name)?'word':'';
  const level=key=>Number.isFinite(mix[key])?Math.min(1,Math.max(0,mix[key]/100)):1;const next=i=>{const clip=clips[i];if(!clip||!isCurrent())return;
   const audio=new Audio(clip.src);replaying=audio;audio.volume=level('master')*level(channel(clip.name));audio.onended=()=>{if(replaying===audio)next(i+1);};
   audio.play().catch(()=>{if(replaying===audio&&isCurrent())toast(copy.failed);});};next(0);}
 async function replay(card,button){if(!isCurrent()||currentCard!==card||button?.disabled)return;if(button)button.disabled=true;try{const r=await api('anki_play_audio',
  {cardId:card.cardId});if(isCurrent()&&currentCard===card&&Array.isArray(r?.clips)&&r.clips.length)playClips(r.clips);}catch(error){if(isCurrent())failed(error);}finally{if(button)button.disabled=false;}}
 function playCardAudio(card){
  if(!currentFrame||currentCard!==card)return;
  currentFrame.contentWindow.postMessage({type:'tome-anki-play-all',nonce:currentFrame.dataset.nonce},'*');
 }
 /* ---- HUD stage (2026-11-13): no panel box, every part is a block placed by percentage; full screen; custom look ---- */
 const H=globalThis.MeguHud,M=globalThis.MeguAnkiHud,ankiKeyAction=M.keyAction,hc=hudCopy[locale]||hudCopy.zh;
 let sysFonts=null,hud=M.load(localStorage),editing=false,immersive=false,shotSrc='',reviewed=0;
 const saveHud=()=>M.save(localStorage,hud);
 /* hostShown/cardFrames: the frames on screen (each block hugs its content), used for snapping on both sides */
 const hostShown={};let cardFrames={};
 const hudMessage=()=>({layout:hud.layout,vars:M.cssVars(hud.style),edit:editing,labels:{...hc.labels,nudged:hc.nudged},snap:hud.snap,frames:{...hostShown}});
 const post=data=>{try{currentFrame?.contentWindow?.postMessage({...data,nonce:currentFrame.dataset.nonce},'*');}catch{}};
 function frame(card){
  const iframe=document.createElement('iframe'),nonce=crypto.randomUUID();iframe.className='anki-hud-frame';iframe.title=text.ankiReview;iframe.sandbox='allow-scripts';
   iframe.allow='autoplay';iframe.referrerPolicy='no-referrer';
  iframe.src='anki-card.html#'+nonce;iframe.dataset.nonce=nonce;
  const play=card.when&&typeof auto==='object'?auto[card.when]||'off':'off';iframe.onload=()=>{if(isCurrent()&&currentFrame===iframe)iframe.contentWindow.postMessage({
   type:'tome-anki-card',nonce,html:card.html,fit,copy,mix,auto:play,hud:hudMessage()},'*');};return iframe;
 }
 function stage(){return target.querySelector('.anki-hud');}
 const canvas=()=>stage()?.querySelector('.anki-hud-canvas');
 /* (user 2026-11-13: the layout panel was ugly and covered the word) a compact floating tool dock, like a design app's:
    drag it by its head anywhere (remembered), it starts in the emptiest corner away from every block, folds to a pill;
    presets are thumbnails, placement a segmented switch, the grid slider shows only in grid mode, saved layouts sit in
    one small menu, the help is a tooltip. It fades while a block is dragged. */
 const dockKey='megulit-anki-hud-dock';
 let dock=(()=>{try{const d=JSON.parse(localStorage.getItem(dockKey))||{};return {px:Number.isFinite(d.px)?d.px:null,py:Number.isFinite(d.py)?d.py:null,op:Number.isFinite(d.op)?Math.min(100,Math.max(30,d.op)):100,collapsed:!!d.collapsed};}catch{return {px:null,py:null,op:100,collapsed:false};}})();
 const saveDock=()=>{try{localStorage.setItem(dockKey,JSON.stringify(dock));}catch{}};
 const thumb=name=>{const L=M.preset(name);return '<svg viewBox="0 0 100 62" aria-hidden="true" focusable="false">'+['shot','word','info','example','controls'].map(k=>{const r=L[k];if(!r)return '';
  return '<rect class="t-'+k+'" x="'+r.x+'" y="'+(r.y*.62)+'" width="'+r.w+'" height="'+Math.max(4,r.h*.62)+'"/>';}).join('')+'</svg>';};
 function editPanel(){
  const pre=Object.keys(M.PRESETS).map(k=>'<button type="button" class="hud-dock-preset" data-hud-preset="'+k+'" aria-label="'+esc(hc.presets[k])+'" data-tip="'+esc(hc.presets[k])+'">'+thumb(k)+'</button>').join('');
  const saved=hud.saved.map((x,i)=>'<button type="button" role="menuitem" data-hud-saved="'+i+'">'+esc(x.name)+'</button>').join('')||'<span class="hud-dock-empty">'+esc(hc.none)+'</span>';
  const grid=hud.snap.mode==='grid';
  return '<button type="button" class="hud-dock-pill" data-dock-expand aria-label="'+esc(hc.expand)+'"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h5v5H2zM9 2h5v3H9zM9 7h5v7H9zM2 9h5v5H2z"/></svg><span>'+esc(hc.dockTitle)+'</span></button>'+
   '<div class="hud-dock-panel" role="dialog" aria-label="'+esc(hc.layout)+'">'+
   '<header class="hud-dock-head" data-dock-grip><svg class="hud-dock-grip" viewBox="0 0 6 10" aria-hidden="true"><circle cx="1" cy="1" r="1"/><circle cx="5" cy="1" r="1"/><circle cx="1" cy="5" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="1" cy="9" r="1"/><circle cx="5" cy="9" r="1"/></svg>'+
   '<span class="hud-dock-title">'+esc(hc.layout)+'</span><span class="hud-dock-help" tabindex="0" role="button" aria-label="'+esc(hc.help)+'">?<span class="hud-dock-tip" role="tooltip">'+esc(hc.hint)+'<br>'+esc(hc.shotHint)+'<br>'+esc(hc.altHint)+'</span></span>'+
   '<button type="button" class="hud-dock-ico" data-dock-collapse aria-label="'+esc(hc.collapse)+'"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7"/></svg></button></header>'+
   '<div class="hud-dock-body">'+
   '<div class="hud-dock-row"><span class="hud-dock-k">'+esc(hc.presetLabel)+'</span><div class="hud-dock-presets" role="group" aria-label="'+esc(hc.presetLabel)+'">'+pre+'</div></div>'+
   '<div class="hud-dock-row"><span class="hud-dock-k">'+esc(hc.place)+'</span><div class="hud-dock-seg" role="radiogroup" aria-label="'+esc(hc.place)+'"><button type="button" role="radio" data-hud-mode="free" aria-checked="'+(!grid)+'">'+esc(hc.free)+'</button><button type="button" role="radio" data-hud-mode="grid" aria-checked="'+grid+'">'+esc(hc.gridMode)+'</button></div></div>'+
   '<label class="hud-dock-row hud-dock-grid"'+(grid?'':' hidden')+'><span class="hud-dock-k">'+esc(hc.gridSize)+'</span><input type="range" min="8" max="96" step="4" data-hud-grid value="'+hud.snap.grid+'" aria-label="'+esc(hc.gridSize)+'"><output>'+hud.snap.grid+'</output></label>'+
   '<div class="hud-dock-row"><span class="hud-dock-k">'+esc(hc.mine)+'</span><details class="hud-dock-menu"><summary>'+esc(hud.saved.length?hc.pick:hc.none)+'<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg></summary><div class="hud-dock-list" role="menu">'+saved+'<hr><button type="button" role="menuitem" data-hud-save>+ '+esc(hc.saveAs)+'</button></div></details></div>'+
   '<label class="hud-dock-row hud-dock-op"><span class="hud-dock-k">'+esc(hc.opacity)+'</span><input type="range" min="30" max="100" step="5" data-dock-op value="'+dock.op+'" aria-label="'+esc(hc.opacity)+'"><output>'+dock.op+'%</output></label>'+
   '</div><footer class="hud-dock-foot"><button type="button" class="hud-dock-ghost" data-hud-reset>'+esc(hc.reset)+'</button><button type="button" class="hud-dock-done" data-hud-done>'+esc(hc.done)+'</button></footer></div>';
 }
 /* where the dock goes: the saved spot, or the corner that covers the least of the blocks on screen */
 function dockOver(box,x,y,c){/* x,y are canvas-relative here */const W=box.offsetWidth,Hh=box.offsetHeight;box.classList.toggle('over-content',Object.values({...cardFrames,...hostShown}).some(r=>{const fx=r.x*c.width/100,fy=r.y*c.height/100;return fx<x+W&&x<fx+r.w*c.width/100&&fy<y+Hh&&y<fy+r.h*c.height/100;}));}
 /* the dock is position:fixed: it lives in viewport coordinates and is clamped to the window only, never to the HUD */
 const dockClamp=(box,x,y)=>{const W=box.offsetWidth,Hh=box.offsetHeight,m=6;return [Math.min(Math.max(m,innerWidth-W-m),Math.max(m,x)),Math.min(Math.max(m,innerHeight-Hh-m),Math.max(m,y))];};
 const dockSide=(box,x)=>x+box.offsetWidth/2>innerWidth/2?'right':'left';
 function placeDock(s,auto){
  const box=dockOf(s),c=s.querySelector('.anki-hud-canvas')?.getBoundingClientRect();if(!box||box.hidden||!c?.width)return;
  const W=box.offsetWidth,Hh=box.offsetHeight,m=14,maxX=Math.max(m,c.width-W-m),maxY=Math.max(m,c.height-Hh-m);let x,y;
  if(dock.px!==null&&!auto){[x,y]=dockClamp(box,Math.max(0,innerWidth-W)*dock.px,Math.max(0,innerHeight-Hh)*dock.py);dockOver(box,x-c.left,y-c.top,c);box.style.transform='translate3d('+Math.round(x)+'px,'+Math.round(y)+'px,0)';box.dataset.side=dockSide(box,x);return;}
  /* every block with a 10 px safety margin */const frames=Object.values({...cardFrames,...hostShown}).map(r=>({x:r.x*c.width/100-10,y:r.y*c.height/100-10,w:r.w*c.width/100+20,h:r.h*c.height/100+20}));
  /* 'keep': an auto-placed dock stays where it is while it still covers nothing (no jumping on every change) */
  if(auto==='keep'&&box.dataset.placed){const t=new DOMMatrixReadOnly(getComputedStyle(box).transform),px=t.m41-c.left,py=t.m42-c.top;let hit=0;
   for(const f of frames){hit+=Math.max(0,Math.min(px+W,f.x+f.w)-Math.max(px,f.x))*Math.max(0,Math.min(py+Hh,f.y+f.h)-Math.max(py,f.y));}if(hit<=0&&px<=maxX+1&&py<=maxY+1)return;}
  box.dataset.placed='1';
  /* corners first, then every spot on a 16 px grid; least covered wins, nearer an edge breaks ties */const cands=[[maxX,m],[m,m],[maxX,maxY],[m,maxY]];for(let gy=m;gy<=maxY;gy+=16)for(let gx=m;gx<=maxX;gx+=16)cands.push([gx,gy]);
  let best=null;for(const [cx,cy] of cands){let hit=0;for(const f of frames){const ox=Math.max(0,Math.min(cx+W,f.x+f.w)-Math.max(cx,f.x)),oy=Math.max(0,Math.min(cy+Hh,f.y+f.h)-Math.max(cy,f.y));hit+=ox*oy;}
   hit+=Math.min(cx-m,maxX-cx,cy-m,maxY-cy)*12;if(!best||hit<best.hit-1)best={hit,x:cx,y:cy};}
  x=best.x;y=best.y;
  const covered=best.hit-Math.min(best.x-m,maxX-best.x,best.y-m,maxY-best.y)*12;if(covered>0&&!dock.opened&&!box.classList.contains('collapsed')){box.classList.add('collapsed');box.dataset.autofold='1';x=maxX;y=m;}
  x=Math.min(maxX,Math.max(m,x));y=Math.min(maxY,Math.max(m,y));dockOver(box,x,y,c);[x,y]=dockClamp(box,x+c.left,y+c.top);box.style.transform='translate3d('+Math.round(x)+'px,'+Math.round(y)+'px,0)';box.dataset.side=dockSide(box,x);
 }
 function mountEdit(s){
  const box=dockOf(s);box.innerHTML=editPanel();box.classList.toggle('collapsed',dock.collapsed);
  box.querySelector('[data-hud-done]').onclick=()=>setEditing(false);box.querySelector('[data-hud-reset]').onclick=resetHud;
  const fold=on=>{dock.collapsed=on;saveDock();box.classList.toggle('collapsed',on);(on?box.querySelector('[data-dock-expand]'):box.querySelector('[data-hud-done]'))?.focus({preventScroll:true});};
  box.onclick=event=>{const b=event.target.closest('button');if(!b)return;
   if(b.hasAttribute('data-dock-collapse')){fold(true);return;}if(b.hasAttribute('data-dock-expand')){if(!box.dataset.dragged){dock.opened=true;delete box.dataset.autofold;fold(false);}return;}
   if(b.dataset.hudPreset){hud.layout=M.preset(b.dataset.hudPreset);saveHud();applyHud();}
   else if(b.dataset.hudMode){hud.snap={...hud.snap,mode:b.dataset.hudMode};saveHud();box.querySelectorAll('[data-hud-mode]').forEach(x=>x.setAttribute('aria-checked',String(x===b)));box.querySelector('.hud-dock-grid').hidden=b.dataset.hudMode!=='grid';applyHud();}
   else if(b.dataset.hudSaved!==undefined){const x=hud.saved[Number(b.dataset.hudSaved)];if(x){hud.layout=M.cleanLayout(x.layout);saveHud();applyHud();}b.closest('details').open=false;}
   else if(b.hasAttribute('data-hud-save')){hud.saved=[...hud.saved,{name:hc.mine+' '+(hud.saved.length+1),layout:JSON.parse(JSON.stringify(hud.layout))}].slice(-6);saveHud();hud=M.load(localStorage);mountEdit(s);placeDock(s);toast(hc.savedOk);}};
  box.querySelector('[data-hud-grid]').oninput=event=>{hud.snap={...hud.snap,grid:Number(event.target.value)};event.target.nextElementSibling.value=event.target.value;saveHud();applyHud();};
  const setOp=v=>{dock.op=Math.min(100,Math.max(30,Number(v)||100));box.style.setProperty('--dk-op',String(dock.op/100));};setOp(dock.op);
  box.querySelector('[data-dock-op]').oninput=event=>{setOp(event.target.value);event.target.nextElementSibling.value=dock.op+'%';saveDock();};
  /* on the opacity row the panel previews the chosen opacity instead of turning opaque (kept while the slider is held) */
  {const row=box.querySelector('.hud-dock-op');let held=false;const live=()=>box.classList.toggle('op-live',held||row.matches(':hover')||row.contains(document.activeElement));
   row.addEventListener('pointerenter',live);row.addEventListener('pointerleave',live);row.addEventListener('focusin',live);row.addEventListener('focusout',()=>setTimeout(live,0));
   row.addEventListener('pointerdown',()=>{held=true;live();addEventListener('pointerup',()=>{held=false;live();},{once:true});});}
  box.querySelector('.hud-dock-menu').addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.currentTarget.open=false;e.currentTarget.querySelector('summary').focus();}});
  /* drag by the head (or the folded pill); a click on the pill that did not move opens it */
  for(const grip of box.querySelectorAll('[data-dock-grip],[data-dock-expand]'))grip.addEventListener('pointerdown',down=>{
   if(down.button!==0||(grip.hasAttribute('data-dock-grip')&&down.target.closest('button,[role=button]')))return;
   const c=s.querySelector('.anki-hud-canvas').getBoundingClientRect(),m0=new DOMMatrixReadOnly(getComputedStyle(box).transform),sx=m0.m41,sy=m0.m42;let moved=false,frame=0,last=down;
   try{grip.setPointerCapture(down.pointerId);}catch{}box.classList.add('dragging');s.classList.add('dock-dragging');delete box.dataset.dragged;
   const paint=()=>{frame=0;const W=box.offsetWidth,Hh=box.offsetHeight,[x,y]=dockClamp(box,sx+last.clientX-down.clientX,sy+last.clientY-down.clientY);
    box.style.transform='translate3d('+Math.round(x)+'px,'+Math.round(y)+'px,0)';box.dataset.side=dockSide(box,x);
    dock.px=Math.min(1,Math.max(0,x/Math.max(1,innerWidth-W)));dock.py=Math.min(1,Math.max(0,y/Math.max(1,innerHeight-Hh)));};
   const move=e=>{last=e;if(Math.abs(e.clientX-down.clientX)+Math.abs(e.clientY-down.clientY)>3)moved=true;if(moved&&!frame)frame=requestAnimationFrame(paint);};
   const up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);box.classList.remove('dragging');s.classList.remove('dock-dragging');
    if(frame){cancelAnimationFrame(frame);paint();}if(moved){const t=new DOMMatrixReadOnly(getComputedStyle(box).transform);dockOver(box,t.m41-c.left,t.m42-c.top,c);saveDock();box.dataset.dragged='1';setTimeout(()=>delete box.dataset.dragged,0);}};
   /* window listeners: the drag keeps going even where pointer capture is refused */addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up);});
  try{enhanceSelects(box);}catch{}
 }
 /* (user 2026-11-14: 「anki的hud调节范围也要是全屏」) The layout space is the whole content area of the window: the page
    under the top bar and the learning sub-nav, edge to edge, down to the bottom, not the centred 1400 px column.
    The canvas (blocks, grid, card frame) and the background are offset out of the column to that area; offsets
    come from offsetLeft/Top so the column's enter transform cannot skew them. Block rects stay percentages of the
    canvas, i.e. fractions of that area, so they survive window resizes, and play mode uses the same canvas. */
 function spanCanvas(){
  const s=stage();if(!s)return;const main=s.closest('.main');
  const off=el=>{let x=0,y=0;while(el&&el!==main){x+=el.offsetLeft;y+=el.offsetTop;el=el.offsetParent;}return el===main?[x,y]:null;};
  const at=main&&!immersive?off(s):null;if(!at){s.classList.remove('span');return;}
  const tabs=main.querySelector(':scope>.tabs'),tb=tabs?off(tabs):null,bar=s.querySelector('.anki-hud-bar'),bb=bar?off(bar):null;
  /* under the sub-nav and under the HUD's own toolbar row, so no block can sit beneath 外观 … 全屏 */
  const top=Math.max(tb?tb[1]+tabs.offsetHeight+6:0,bb?bb[1]+bar.offsetHeight+2:0);
  const v={'--span-l':-at[0],'--span-t':top-at[1],'--span-w':main.clientWidth,'--span-h':Math.max(200,main.clientHeight-top)};
  for(const [k,n] of Object.entries(v))s.style.setProperty(k,Math.round(n)+'px');s.classList.add('span');
 }
 const moving=on=>{stage()?.classList.toggle('hud-moving',!!on);dockEl?.classList.toggle('hud-moving',!!on);};
 /* (user 2026-11-14: the panel covered the blocks and could not leave the HUD) the dock lives in a top-level layer:
    a child of <body> (or of the full-screen element), so no HUD overflow, transform or stacking context confines it.
    A watchdog hides and drops it once its review page is gone. */
 let dockEl=null,dockWatch=0;const owner={};
 function dockOf(s){if(!s.__dock){s.__dock=s.querySelector('.anki-hud-edit');if(s.__dock)s.__dock.__stage=s;}dockEl=s.__dock;return dockEl;}
 function dockHome(){if(!dockEl)return;const fs=document.fullscreenElement,home=fs&&fs!==document.documentElement?fs:document.body;if(dockEl.parentNode!==home)home.append(dockEl);}
 /* gone: this render is no longer current, or its own stage left the page (a newer render reuses the same target) */
 function dockGone(){const s=dockEl?.__stage;return !isCurrent()||!s||!s.isConnected||s!==stage()||!s.getClientRects().length;}
 function watchDock(){clearInterval(dockWatch);dockWatch=setInterval(()=>{if(!dockEl){clearInterval(dockWatch);return;}if(dockGone()){dockEl.hidden=true;const own=dockEl.__stage;if(!isCurrent()||!own?.isConnected||own!==stage()){dockEl.remove();clearInterval(dockWatch);}}else if(editing&&dockEl.hidden){dockEl.hidden=false;placeDock(stage());}},400);}
 document.addEventListener('fullscreenchange',dockHome);
 /* a smaller window pulls a saved spot back inside it */addEventListener('resize',()=>{const s=stage();if(editing&&s&&dockEl&&!dockEl.hidden)placeDock(s);});
 function shell(){
  /* only a stage this render built is reused: one left by an earlier render on the same target carries that render's handlers */
  let s=stage();if(s&&s.__owner===owner)return s;
  s=document.createElement('section');s.__owner=owner;s.className='anki-hud';s.setAttribute('aria-label',text.ankiReview);
  s.innerHTML='<div class="anki-hud-bg" aria-hidden="true"></div><div class="anki-hud-bar anki-toolbar"></div><div class="anki-hud-canvas"><div class="anki-hud-grid" aria-hidden="true"></div><div class="anki-hud-frame-slot"></div><div class="anki-hud-layer"><div class="anki-hud-block" data-hud="progress"><div class="anki-hud-progress hud-content" aria-live="polite"></div></div><div class="anki-hud-block" data-hud="controls"><div class="review-controls hud-content" data-controls></div></div><div class="anki-hud-guides" aria-hidden="true"></div></div><div class="anki-hud-edit" hidden></div><div class="anki-hud-keys" aria-hidden="true">'+esc(hc.keys)+'</div></div>';
  target.replaceChildren(s);
  dockEl?.remove();dockOf(s);dockHome();
  for(const el of s.querySelectorAll('.anki-hud-block')){const id=el.dataset.hud;el.insertAdjacentHTML('beforeend','<span class="hud-label">'+esc(hc.labels[id]||id)+'</span>');
   H.attach(el,{stage:canvas,rect:()=>hostShown[id]||hud.layout[id],editing:()=>editing,
    snap:(r,kind,alt)=>{if(alt)return null;const c=canvas().getBoundingClientRect();return H.snapRect(r,Object.entries({...cardFrames,...hostShown}).filter(([k])=>k!==id).map(([,v])=>v),kind,{...hud.snap,SW:c.width,SH:c.height});},
    guides:g=>H.drawGuides(s.querySelector('.anki-hud-guides'),g),onActive:moving,onCommit:(r,from)=>{hud.layout[id]=H.carry(hud.layout[id],from,r);saveHud();placeBlocks();}});}
  mountEdit(s);new ResizeObserver(()=>placeBlocks()).observe(s.querySelector('.anki-hud-canvas'));
  spanCanvas();requestAnimationFrame(spanCanvas);new ResizeObserver(()=>spanCanvas()).observe(s);s.closest('.main')&&new ResizeObserver(()=>spanCanvas()).observe(s.closest('.main'));
  applyHud();return s;
 }
 /* the page's own blocks (progress, buttons) hug their content the same way the card's blocks do */
 function placeBlocks(){
  const s=stage();if(!s)return;const c=canvas().getBoundingClientRect();if(!c.width)return;let changed=false;
  for(const el of s.querySelectorAll('.anki-hud-block')){const id=el.dataset.hud,box=el.querySelector('.hud-content'),r=hud.layout[id];if(!box||!r)continue;
   box.style.transform='none';const nw=box.offsetWidth,nh=box.offsetHeight;if(!nw||!nh||!box.textContent.trim()){H.applyRect(el,hostShown[id]||r);continue;}
   const h=H.hugRect(r,nw,nh,c.width,c.height,1.6);hostShown[id]=h.frame;H.applyRect(el,h.frame);box.style.transform='scale('+h.scale+')';box.style.left='0px';box.style.top='0px';if(h.fresh){hud.layout[id]=h.rect;changed=true;}}
  if(changed)saveHud();post({type:'tome-anki-hud',frames:{...hostShown}});if(editing&&dock.px===null)placeDock(s,'keep');
 }
 function paintBg(){
  const s=stage();if(!s)return;const bg=s.querySelector('.anki-hud-bg'),b=hud.style.bg;
  const src=b.mode==='game'?String(cover()||''):b.mode==='shot'?shotSrc:b.mode==='image'?b.image:'';
  bg.style.backgroundColor=b.mode==='color'?b.color:'';bg.style.backgroundImage=src&&!/[\n\r]/.test(src)?'url('+JSON.stringify(src)+')':'';
  bg.style.setProperty('--hud-bg-blur',b.blur+'px');bg.style.setProperty('--hud-bg-dim',String(b.mode==='none'?0:b.dim/100));
  s.dataset.bg=src||b.mode==='color'?b.mode:'none';syncBackdrop();
 }
 /* (user 2026-11-14: in 全屏 the custom background was gone) With no HUD background of its own the HUD shows the
    window's wallpaper (.app-backdrop, a sibling of the app frame). Full screen covers / is the HUD, so it carries a
    copy of that layer: same class, same inline image vars, same blur and dim rules. */
 function syncBackdrop(){
  const s=stage();if(!s)return;s.querySelector(':scope>.anki-hud-backdrop')?.remove();if(!immersive||s.dataset.bg!=='none')return;
  const src=document.querySelector('.app-backdrop:not(.anki-hud-backdrop)');if(!src)return;const copy=src.cloneNode(true);copy.classList.add('anki-hud-backdrop');copy.removeAttribute('id');s.prepend(copy);
 }
 function applyHud(){
  const s=stage();if(!s)return;for(const [k,v] of Object.entries(M.cssVars(hud.style)))s.style.setProperty(k,v);
  s.dataset.snap=hud.snap.mode;s.style.setProperty('--hud-grid',hud.snap.grid+'px');
  placeBlocks();paintBg();post({type:'tome-anki-hud',...hudMessage()});
 }
 function setEditing(on){
  editing=!!on;const s=stage();if(!s)return;s.classList.toggle('editing',editing);const box=dockOf(s);dockHome();box.hidden=!editing;if(editing)watchDock();
  s.querySelectorAll('.anki-hud-bar details[open]').forEach(d=>d.open=false);s.querySelector('[data-hud-layout]')?.setAttribute('aria-pressed',String(editing));
  post({type:'tome-anki-hud',edit:editing});if(editing){delete box.dataset.placed;placeDock(s);(dock.collapsed?box.querySelector('[data-dock-expand]'):box.querySelector('[data-hud-done]'))?.focus({preventScroll:true});}else moving(false);
 }
 function resetHud(){hud={...hud,layout:M.cleanLayout({}),style:M.cleanStyle({}),snap:M.cleanSnap({})};dock={...dock,px:null,py:null};saveDock();saveHud();const s=stage();if(s){mountEdit(s);placeDock(s,true);}applyHud();const bar=s?.querySelector('.anki-hud-bar');if(bar){bar.querySelector('.anki-look')?.remove();mountLook(bar);}}
 /* Full screen: the stage covers the window (fixed, above the top bar) and the window itself goes full screen through
    the desktop shell, or the browser Fullscreen API outside it. Esc leaves. */
 async function setImmersive(on){
  on=!!on;if(on===immersive)return;immersive=on;const s=stage();s?.classList.toggle('immersive',on);document.documentElement.classList.toggle('anki-immersive',on);spanCanvas();syncBackdrop();
  s?.querySelector('[data-hud-full]')?.setAttribute('aria-pressed',String(on));const b=s?.querySelector('[data-hud-full]');if(b)b.textContent=on?hc.exitFull:hc.full;
  /* (user 2026-11-13: the top bar stayed above the HUD, a white strip at the bottom, the window vanished) the desktop
     window covers the monitor; the stage itself goes to the top layer, above the top bar and every stacking context,
     without moving the card frame: as a popover, or as the browser's full-screen element when the window cannot */
  const pop=show=>{try{if(!s||typeof s.showPopover!=='function')return;if(show){if(!s.matches(':popover-open')){s.popover='manual';s.showPopover();}}else if(s.matches(':popover-open')){s.hidePopover();s.removeAttribute('popover');}}catch{}};
  if(on){let native=false;if(windowAction){try{await windowAction('fullscreen_on');native=true;}catch{}}
   if(!native&&!document.fullscreenElement&&s?.requestFullscreen){try{await s.requestFullscreen();browserFull=true;}catch{}}
   if(!document.fullscreenElement)pop(true);}
  else{pop(false);if(browserFull&&document.fullscreenElement){browserFull=false;try{await document.exitFullscreen();}catch{}}else if(windowAction){try{await windowAction('fullscreen_off');}catch{}}browserFull=false;}
 }
 let browserFull=false;
 const fullscreenSync=()=>{if(!document.fullscreenElement&&immersive&&browserFull){browserFull=false;setImmersive(false);}};
 document.addEventListener('fullscreenchange',fullscreenSync);
 function leaveHud(){setEditing(false);if(immersive)setImmersive(false);}
 function lookup(word){
  const s=stage();if(!s||!word)return;s.querySelector('.anki-hud-lookup')?.remove();const box=document.createElement('div');box.className='anki-hud-lookup';box.setAttribute('role','dialog');
  box.innerHTML='<header><strong lang="ja"></strong><button type="button" class="text-button" data-close>'+esc(hc.close)+'</button></header><div class="anki-hud-lookup-body"><span class="spinner"></span></div>';
  box.querySelector('strong').textContent=word;box.querySelector('[data-close]').onclick=()=>box.remove();box.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();box.remove();}});
  s.querySelector('.anki-hud-canvas').append(box);box.querySelector('[data-close]').focus();
  /* (user 2026-11-13) MOJi first, as the dictionary page's online lookup (anonymous when not signed in); the local dictionary if MOJi fails or finds nothing */
  const q=source=>api('dictionary',{query:word,source,operationId:crypto.randomUUID()});
  /* 2026-11-13 English interface looks up Jisho (English definitions) */q(locale==='en'?'jisho':'moji').then(items=>Array.isArray(items)&&items.length?items:Promise.reject(Error('EMPTY'))).catch(()=>q('local')).then(items=>{if(!box.isConnected)return;const list=(Array.isArray(items)?items:[]).slice(0,4);
   box.querySelector('.anki-hud-lookup-body').innerHTML=list.length?'<ol>'+list.map(i=>'<li><div><b lang="ja">'+esc(i.spelling||'')+'</b> <span lang="ja">'+esc(i.reading||'')+'</span>'+[i.jlpt?'JLPT '+i.jlpt:'',...(i.partOfSpeech||[]).slice(0,2)].filter(Boolean).map(t=>' <span class="moji-tag">'+esc(t)+'</span>').join('')+'</div><p>'+esc(i.definition||'')+'</p></li>').join('')+'</ol>':'<p class="muted">'+esc(hc.noResult)+'</p>';
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
  else if(action==='primary')controls.querySelector('button.hud-primary:not(:disabled),button.primary:not(:disabled)')?.click();else controls.querySelector('.rating-'+action.slice(5)+':not(:disabled)')?.click();
  return true;
 }
 const keydown=event=>{if(!isCurrent()){stop();return;}if(!stage()||event.repeat)return;if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,select,textarea,[contenteditable],details[open],.anki-hud-lookup,.select-popup'))return;
  if(event.key!=='Escape'&&event.target.closest?.('button')&&(event.key===' '||event.key==='Enter'))return;if(key(event.key))event.preventDefault();};
 document.addEventListener('keydown',keydown);
 const messages=event=>{if(!isCurrent()){stop();return;}
  if(!currentFrame||event.source!==currentFrame.contentWindow||event.data?.nonce!==currentFrame.dataset.nonce)return;const d=event.data;
  if(d.type==='tome-anki-replay')replay(currentCard,target.querySelector('[data-replay]'));
  else if(d.type==='tome-anki-hud-move'&&Object.hasOwn(M.LAYOUT,d.id)){hud.layout[d.id]=H.normRect(d.rect,M.LAYOUT[d.id]);saveHud();}
  else if(d.type==='tome-anki-hud-drag')moving(!!d.on);
  else if(d.type==='tome-anki-hud-frames'&&d.frames&&typeof d.frames==='object'){cardFrames=Object.fromEntries(Object.entries(d.frames).filter(([k])=>Object.hasOwn(M.LAYOUT,k)).map(([k,r])=>[k,H.normRect(r,M.LAYOUT[k],{w:.3,h:.3})]));}
  else if(d.type==='tome-anki-shot'){shotSrc=/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(d.src||''))?d.src:'';paintBg();}
  else if(d.type==='tome-anki-key')key(String(d.key||''));
  else if(d.type==='tome-anki-lookup')lookup(String(d.word||'').slice(0,60));};
 window.addEventListener('message',messages);
 const stop=()=>{window.removeEventListener('message',messages);document.removeEventListener('keydown',keydown);document.removeEventListener('fullscreenchange',fullscreenSync);clearInterval(poll);leaveHud();dockEl?.remove();clearInterval(dockWatch);};stopMessages=stop;
 function progress(s,html){s.querySelector('.anki-hud-progress').innerHTML=html;requestAnimationFrame(placeBlocks);}
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
  const controls=s.querySelector('[data-controls]');controls.replaceChildren();requestAnimationFrame(placeBlocks);
  if(!card.answerShown){const button=document.createElement('button');button.className='hud-primary';button.innerHTML='<strong>'+esc(text.showAnswer)+'</strong><kbd>'+esc(hc.space)+'</kbd>';button.onclick=async()=>{button.disabled=true;
   try{drawCard(await api('anki_show_answer',{cardId:card.cardId}));}catch(error){button.disabled=false;failed(error);}};controls.append(button);}
  else for(const[ease,index]of card.buttons.map((ease,index)=>[ease,index])){
   const button=document.createElement('button');button.className='anki-rating rating-'+ease;button.dataset.ease=String(ease);button.innerHTML='<strong>'+esc([null,text.ankiAgain,text.ankiHard,
    text.ankiGood,text.ankiEasy][ease])+'</strong><small>'+esc(card.intervals[index]||'')+'</small><kbd>'+ease+'</kbd>';
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
  /* 2026-11-13 (AI-feel review): the finished state says what was done today, when cards come back, and offers new words */
  const lang=document.documentElement.lang||'zh',loc=lang.startsWith('ja')?'ja':lang.startsWith('en')?'en':'zh';
  target.innerHTML=reviewRest({locale:loc,esc,kind:card.practiceDone?'practice':card.finished?'rest':'empty',deck:card.deck||'',reviewed:card.reviewedToday??null,nextDue:card.finished?card.nextDue:undefined,total:card.total??null,
   extra:(card.deck&&card.total!==0?'<button class="secondary" data-practice>'+copy.practice+'</button>':'')+'<span class="es-quiet">'+(card.deck?'<button class="text-button" data-custom>'+copy.custom+'</button><button class="text-button" data-limits>'+copy.limits+'</button>':'')+'<button class="text-button" data-decks>'+text.chooseDeck+'</button></span>'});
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
   const controls=s.querySelector('[data-controls]');controls.replaceChildren();requestAnimationFrame(placeBlocks);const button=document.createElement('button');button.className='primary';button.textContent=shown?copy.next:text.showAnswer;
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
