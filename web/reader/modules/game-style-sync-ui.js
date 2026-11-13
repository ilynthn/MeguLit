// SPDX-License-Identifier: GPL-3.0-or-later
(function install(){
 'use strict';if(!document.head||!window.__tomoyoChinese?.galPreferences||!window.TomeGameProfile){document.addEventListener('DOMContentLoaded',install,{once:true});
  return;}
 const b=window.__tomoyoChinese;if(b.gameStyleStatus)return;
 const tools=window.TomeGameProfile,session=new tools.Session(),owner=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),pick=tools.pick;
 const send=m=>{try{window.__tomoyoTranslateRequest(JSON.stringify(m));}catch{}};
 const lex={
  zh:{saved:'使用已保存设置 · {time}',preview:'正在预览设置 · 尚未保存',unsaved:'尚未保存作品设置',unbound:'绑定游戏后可按作品保存校准设置',firstRunTitle:'「{game}」新游戏提示',firstRunCount:'本作第 {n}/5 次启动时显示 · 可在设置「阅读记录」里关闭',
   firstRun:'请先从标题画面开一个新存档（Start / New Game），随意推进几句对话，让 MeguLit 自动捕捉文本并同步内嵌。捕捉结果会自动保存到这部作品的设置里，以后启动就不用再这样做了，直接读档也能自动内嵌',gotIt:'知道了',unknown:'当前作品',cancel:'取消修改目前的新设置',
   save:'保存本作品设置',saving:'正在保存…',failed:'保存失败，新设置仍在预览，可重试',history:'历史设置记录（最近 7 次保存）',empty:'还没有保存记录',current:'当前已保存',restore:'预览此记录',historyPreview:'已载入历史设置供预览，确认后保存；取消可恢复载入前的设置',
   automatic:'新作品自动校准，已有作品自动载入保存设置',sync:'校准当前句',textSync:'仅校准文字',positionSync:'仅校准位置',waiting:'等待游戏正文',waitingSource:'尚未收到正文，下一句到达后自动校准',revealing:'正在准备原文，若本句已被隐藏，请推进一句',
   measuring:'正在测量当前句…',sampling:'正在整理测量结果…',advance:'请在游戏里推进一句：内嵌时当前这句原文已被清空，会用下一句原文来测量',waitingOriginal:'本次未匹配，正在重试当前句',unmatched:'未能匹配当前原文，已恢复阅读；可推进一句再校准，或直接手动调整',
   timeout:'测量超时，已恢复阅读，可重试',unavailable:'校准组件不可用，仍可手动调整并保存',retrying:'本次校准未完成，已恢复阅读，可手动调整或重试',measured:'测量结果已预览，尚未保存',applied:'校准结果已应用',cancelled:'已恢复修改前的设置',aligning:'正在对齐文字位置…',
   positionReady:'已按当前句调整固定位置',noSource:'本作品尚无引擎坐标，仍可校准固定位置或拖动文本框',needMap:'本作品坐标已收到，校准后会自动跟随',following:'正在跟随本作品的引擎坐标',ready:'本作品的坐标映射已校准',hint:'当前句可测时直接校准字号、字距、行距、颜色和位置；纵向两色渐变为估测，字体可选游戏文件或系统字体',
   notSaved:'预览不会覆盖已保存设置，确认后请保存',importText:'文字外观导入',importPosition:'位置与换行导入',importPick:'选择本机已保存的作品…',importSave:'保存',importNone:'本机还没有其他已保存的作品',importPreview:'已导入「{source}」的{part}供预览，保存只写入当前作品，取消可恢复',
   partText:'文字外观',partPosition:'位置与换行',importMissing:'没有找到该作品的设置'},
  en:{saved:'Saved settings · {time}',preview:'Previewing unsaved settings',unsaved:'No saved settings for this game',unbound:'Bind a game to save its calibration',
   firstRunTitle:'New-game tip for {game}',firstRunCount:'Shown at launch {n} of 5 for this game · turn it off under Settings › Reading records',firstRun:'Start a new save from the title screen (Start / New Game) and advance a few lines so MeguLit can capture the text and sync the embedding. The result is saved to this game\u2019s settings automatically: next time you can simply load a save and embedding works right away',
   gotIt:'Got it',unknown:'this game',cancel:'Discard the current changes',save:'Save settings for this game',saving:'Saving…',failed:'Save failed; the new settings remain a preview. Retry',
   history:'Saved history (last 7 saves)',empty:'No saved history yet',current:'Current saved settings',restore:'Preview this version',historyPreview:'Previewing a saved version. Save to keep it or discard to restore the previous settings',
   automatic:'Calibrate new games automatically; restore saved settings for known games',sync:'Calibrate current line',textSync:'Text only',positionSync:'Position only',
   waiting:'Waiting for game dialogue',waitingSource:'No dialogue received yet; calibration starts with the next line',revealing:'Preparing original text; advance once if this line was already hidden',
   measuring:'Measuring the current line…',sampling:'Preparing measurement…',advance:'Advance one line in the game: embedding has cleared the current line, so the next original line is measured',
   waitingOriginal:'No match yet; retrying the current line',unmatched:'Original text did not match; reader restored. Try the next line or adjust manually',timeout:'Measurement timed out; reader restored. Retry',
   unavailable:'Calibration helper unavailable; manual adjustment and saving still work',retrying:'Calibration incomplete; reader restored. Retry or adjust manually',
   measured:'Measurement previewed; not saved',applied:'Calibration applied',cancelled:'Restored settings from before these changes',aligning:'Aligning text position…',
   positionReady:'Fixed position adjusted from the current line',noSource:'No engine coordinates for this game; calibrate a fixed position or drag the text box',
   needMap:'Coordinates received for this game; it follows them once calibrated',following:'Following this game’s engine coordinates',ready:'Coordinate mapping calibrated for this game',
   hint:'Measures size, character/line spacing, colour and position from a visible line. Vertical two-colour gradients are estimated; choose a game or system font',
   notSaved:'Preview does not replace saved settings. Save when ready',importText:'Import text appearance',importPosition:'Import position and wrapping',importPick:'Choose a saved work on this PC…',
   importSave:'Save',importNone:'No other saved works on this PC yet',importPreview:'Previewing {part} imported from “{source}”. Saving writes only the current work; Cancel restores',
   partText:'text appearance',partPosition:'position and wrapping',importMissing:'Settings for that work were not found'},
  ja:{saved:'保存済みの設定を使用中 · {time}',preview:'設定をプレビュー中・未保存',unsaved:'作品設定は未保存です',unbound:'ゲームを連携すると作品別に調整を保存できます',firstRunTitle:'「{game}」ニューゲームの案内',firstRunCount:'この作品の起動 {n}/5 回目に表示 · 設定の「読書記録」でオフにできます',
   firstRun:'まずタイトル画面から新しいセーブ（Start / New Game）を始めて、会話を何行か進めてください。MeguLit がテキストを自動で取得して埋め込みを合わせます。結果はこの作品の設定に自動で保存されるので、次回からはセーブをロードするだけで自動的に埋め込まれます',gotIt:'わかった',
   unknown:'この作品',cancel:'現在の変更を取り消す',save:'この作品の設定を保存',saving:'保存中…',failed:'保存に失敗しました。プレビューは保持しています。再試行できます',history:'設定履歴（最近7回の保存）',empty:'保存履歴はありません',current:'現在の保存設定',
   restore:'この設定をプレビュー',historyPreview:'履歴をプレビュー中です。保存で適用し、取り消すと元に戻ります',automatic:'新しい作品は自動調整し、登録済み作品は保存設定を復元',sync:'現在の文を調整',textSync:'文字のみ',positionSync:'位置のみ',
   waiting:'ゲーム本文を待機中',waitingSource:'本文は未受信です。次の文から自動調整します',revealing:'原文を準備中です。既に非表示の文なら一度進めてください',measuring:'現在の文を測定中…',sampling:'測定結果を整理中…',advance:'ゲームを 1 文進めてください。埋め込み中は今の文の原文が消えているため、次の文で測定します',
   waitingOriginal:'まだ一致しません。同じ文を再試行中',unmatched:'原文が一致しなかったため表示を復元しました。次の文で再試行するか手動調整できます',timeout:'測定がタイムアウトしました。表示は復元済みです',unavailable:'調整コンポーネントが利用できません。手動調整と保存は可能です',
   retrying:'調整は未完了です。表示を復元しました。再試行か手動調整を行えます',measured:'測定結果をプレビュー中・未保存',applied:'調整結果を適用しました',cancelled:'変更前の設定に戻しました',aligning:'文字位置を調整中…',positionReady:'現在の文から固定位置を調整しました',
   noSource:'この作品のエンジン座標は未対応です。固定位置の調整やドラッグは可能です',needMap:'この作品の座標を受信しました。調整すると自動で追従します',following:'この作品のエンジン座標に追従中',ready:'この作品の座標を調整済みです',hint:'表示中の文からサイズ・字間・行間・色・位置を調整します。縦2色のグラデーションは推定です。ゲームまたはシステムフォントを選択できます',
   notSaved:'プレビューは保存済みの設定を上書きしません。確認後に保存してください',importText:'文字の外観をインポート',importPosition:'位置と折り返しをインポート',importPick:'この PC に保存済みの作品を選択…',importSave:'保存',importNone:'ほかに保存済みの作品はまだありません',
   importPreview:'「{source}」の{part}をプレビュー中です。保存は現在の作品だけに書き込み、取り消しで元に戻します',partText:'文字の外観',partPosition:'位置と折り返し',importMissing:'その作品の設定が見つかりません'}
 };
 const lang=()=>{const l=window.__tomeI18n?.get?.()||'zh';return l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';};
 const t=(key,extra={})=>{let s=lex[lang()][key]||lex.zh[key]||key;for(const [k,v]of Object.entries({game:session.name||lex[lang()].unknown,...extra}))s=s.replaceAll('{'+k+'}',
  v);return s;};
 const date=at=>at?new Intl.DateTimeFormat({zh:'zh-CN',en:'en-GB',ja:'ja-JP'}[lang()],{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',
  minute:'2-digit',second:'2-digit',hour12:false}).format(at):'';
 const clamp=(v,a,z)=>Math.max(a,Math.min(z,v));
 let gameIdentity='',last={gameStyleState:'waiting'},message='',saving=null,saveSerial=0,aligning=false,correctionTimer=0,measurementSerial=0,repainting=false;
 const getMap=()=>window.__tomeTextPosition?.getMap?.()||null;
 function values(){const p=pick(b.galPreferences());if(window.__tomeTextPosition?.state?.().following){p.x=session.base.prefs.x;p.y=session.base.prefs.y;}return p;
  }
 const dirty=()=>session.dirty(values(),getMap());
 const apply=(prefs,map,preview=true)=>{if(map!==undefined)window.__tomeTextPosition?.setMap?.(map);return b.applyGalPreferences(tools.followFont?tools.followFont(pick(prefs)):pick(prefs),{preview,persist:!preview});
  };
 const isBusy=()=>['revealing','measuring','sampling','waitingOriginal','waitingSource'].includes(last.gameStyleState);
 // Shared measurement and ink-alignment routines are inserted here by the build script.
 function metrics(){const el=document.querySelector('.sentence-text .char-token')||document.querySelector('.sentence-text')||document.body;const cs=getComputedStyle(el);
  const c=document.createElement('canvas').getContext('2d');c.font=(cs.fontWeight||'400')+' 100px '+(cs.fontFamily||'sans-serif');
  const m=c.measureText('漢字あ国語の');const ink=(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)/100;const adv=c.measureText('漢').width/100;
  return {ink:ink>.4&&ink<1.4?ink:.9,adv:adv>.6&&adv<1.4?adv:1};}
 // Measurement (game client pixels) -> MeguLit settings (japaneseSize and spacing in px of a 1280-wide game).
 function convert(r){
  const s=r.style||{},cw=Number(r.width),ch=Number(r.height);if(!(cw>0&&ch>0))return null;const k=1280/cw,f=metrics(),out={autoScale:true,paddingX:0,paddingY:0};
  for(const key of ['textColor','readTextColor','speechTextColor','narrationTextColor','textGradient','textGradientTop','textGradientBottom','readTextGradient','readTextGradientTop','readTextGradientBottom'])if(s[key]!==undefined)out[key]=s[key];
  const size=r.inkHeight>0?r.inkHeight*k/f.ink:Number(s.japaneseSize);if(Number.isFinite(size)&&size>4){out.japaneseSize=Math.round(size*10)/10;out.translationSize=Math.round(Math.max(12,
   Math.min(60,out.japaneseSize))*10)/10;}
  if(out.japaneseSize&&r.advance>0)out.japaneseSpacingPx=Math.round(clamp(r.advance*k-out.japaneseSize*f.adv,-out.japaneseSize*.45,out.japaneseSize)*10)/10;
  if(out.japaneseSize&&r.lineStep>0)out.lineHeight=Math.round(clamp(r.lineStep*k/out.japaneseSize,1.45,3.5)*100)/100;else if(Number.isFinite(s.lineHeight))out.lineHeight=clamp(s.lineHeight,
   1.45,3.5); /* a measured step under 1.45 em is a mis-read (user: ISLAND came out with crushed line spacing); furigana needs the room */
  if(Number.isFinite(out.lineHeight)){out.lineHeight-=1.95;out.lineHeightMode='offset';}
  const x=Number(s.x),y=Number(s.y);if(Number.isFinite(x)&&Number.isFinite(y)){out.x=clamp(x,0,95);out.y=clamp(y,0,95);
   const step=(r.lineStep>0?r.lineStep:(out.japaneseSize||28)/k*(Number.isFinite(out.lineHeight)?1.95+out.lineHeight:1.6))*100/ch;
   // Width: where the game wraps (from a wrapped line) plus one character of slack for spacing differences; without a
   // wrapped line, the longest measured line plus two characters.
   const adv=r.advance>0?r.advance*100/cw:step*ch/cw,wrap=Number(r.wrapWidth)||0;out.width=Math.round(clamp(wrap>0?wrap+adv:Math.max(Number(b.galPreferences().width)||60,
    (Number(s.width)||0)+adv*2),20,100-out.x)*10)/10;}
  return out;}
 // Moves the box until MeguLit's first glyph ink sits where the game's first glyph ink was measured (client pixels).
 function correct(target){
  if(document.body.classList.contains('tome-style-probing'))return false;
  const text=document.querySelector('.sentence-text'),tok=text?.querySelector('.char-token');if(!tok)return false;const rect=tok.getBoundingClientRect();if(!rect.width||!rect.height)return false;
  const root=getComputedStyle(document.documentElement),rx=parseFloat(root.getPropertyValue('--tomoyo-reader-x')),ry=parseFloat(root.getPropertyValue('--tomoyo-reader-y'));
   if(!Number.isFinite(rx)||!Number.isFinite(ry))return false;
  const cs=getComputedStyle(tok),c=document.createElement('canvas').getContext('2d');c.font=cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;
  const line=(text.textContent||'').split('\n')[0].slice(0,40)||tok.textContent,ml=c.measureText(line),m1=c.measureText(tok.textContent||line[0]||'あ');
  // An inline token's box is the font's content area; an inline-block one is centred in its line box.
  const content=ml.fontBoundingBoxAscent+ml.fontBoundingBoxDescent,top=cs.display==='inline'?rect.top:rect.top+(rect.height-content)/2;
  const inkTop=top+(ml.fontBoundingBoxAscent-ml.actualBoundingBoxAscent),inkLeft=rect.left-m1.actualBoundingBoxLeft;
  const dpr=Math.max(.5,Number(window.devicePixelRatio)||1),p=b.galPreferences(),cw=target.width,ch=target.height;
  const ax=p.x*cw/100+(inkLeft-rx)*dpr,ay=p.y*ch/100+(inkTop-ry)*dpr,dx=target.inkLeft-ax,dy=target.inkTop-ay;
  if(Math.abs(dx)<2&&Math.abs(dy)<2)return true;
  b.applyGalPreferences({x:clamp(p.x+dx*100/cw,0,95),y:clamp(p.y+dy*100/ch,0,95)},{preview:true});return 'again';}
 function runCorrection(target,done){let tries=0,passes=0;clearInterval(correctionTimer);const timer=setInterval(()=>{const r=correct(target);if(r===true||r==='again'&&++passes>=3||++tries>=6){
  clearInterval(timer);done?.(r===true);}},120);correctionTimer=timer;return timer;}

 function stopMeasurement(){measurementSerial++;clearTimeout(correctionTimer);clearInterval(correctionTimer);aligning=false;document.body.classList.remove('tome-style-probing');
  send({type:'gameStyleCancel',key:session.key,owner});}
 b.gameProfileKey=()=>session.key;
 b.gameStyleCommitReady=()=>!saving&&!aligning;
 function save(prefs=b.galPreferences(),savePrompt=false){
  if(!session.key||saving||aligning){message=!session.key?t('unbound'):t('aligning');paint();return false;}
  const id=owner+':'+(++saveSerial),snapshot=pick(prefs),map=getMap();saving={id,prefs:snapshot,map,key:session.key};
  send({type:'gameStyleConfirm',key:session.key,part:'all',prefs:snapshot,map,saveId:id,...(savePrompt?{workKey:b.workPromptKey,translationPrompt:prefs.translationPrompt}:{
   })});paint();return true;
 }
 b.saveGameProfileFromMenu=prefs=>save(prefs,true);
 // First launch of a work (no saved settings yet): tell the user to start a new save and advance a few lines once.
 // Shown once per work key; dismissed with the button or after 30 s (user, 2026-11-02).
 function firstRunTip(m){const key=m.gameStyleKey||'';if(!key||window.__tomoyoNativePreferences?.new_game_tip===false)return;
  // Shown at each of a work's first five launches, so it is not missed after one glance (user, 2026-11-06); it can be
  // turned off in the home settings. A launch counts once, however many status updates it sends.
  let seen={};try{seen=JSON.parse(localStorage.getItem('megulit-new-game-tip')||'{}')||{};}catch{}if(!seen||typeof seen!=='object'||Array.isArray(seen))seen={};
  const launch=String(m.gameStyleIdentity||'')||'page:'+firstRunPage,entry=seen[key]&&typeof seen[key]==='object'?seen[key]:{count:0,last:''};
  if(entry.last===launch||entry.count>=5||document.querySelector('.tome-first-run')||isBusy())return;
  seen[key]={count:(Number(entry.count)||0)+1,last:launch};const keys=Object.keys(seen);if(keys.length>300)delete seen[keys[0]];
  try{localStorage.setItem('megulit-new-game-tip',JSON.stringify(seen));}catch{}
  const box=document.createElement('div');box.className='tome-first-run';box.dataset.noI18n='';box.setAttribute('role','status');box.innerHTML='<b></b><p></p><small></small><button type="button"></button>';
  const game=m.gameStyleGameName||t('unknown');box.querySelector('b').textContent=t('firstRunTitle').replace('{game}',game);box.querySelector('p').textContent=t('firstRun');
  box.querySelector('small').textContent=t('firstRunCount').replace('{n}',String(seen[key].count));const ok=box.querySelector('button');ok.textContent=t('gotIt');
  const close=()=>{box.remove();window.__tomoyoHitRegionsRefresh?.(true);};ok.onclick=close;setTimeout(close,30000);document.body.append(box);window.__tomoyoHitRegionsRefresh?.(true);
   }
 const firstRunPage=Date.now().toString(36);
 b.cancelGameSettings=()=>{if(saving)return false;stopMeasurement();importing=null;for(const select of document.querySelectorAll('[data-import-select]')){if(select.value){
  select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));}}for(const button of document.querySelectorAll('[data-import-save]'))button.disabled=true;
  const before=session.cancel();apply(before.prefs,before.map);message=t('cancelled');last={...last,gameStyleState:'cancelled'};paint();return true;};
 function restore(id){if(saving)return;const version=session.select(id);if(!version)return;stopMeasurement();apply(version.prefs,version.map);message=t('historyPreview');
  last={...last,gameStyleState:'measured'};paint();}
 function resync(part='all'){
  if(!session.key){message=t('unbound');paint();return;}
  /* The visible-client capture reads the screen: an overlay hint over the game was measured as its text and moved the box to the top (user, 2026-11-08). Close it before measuring. */document.querySelector('.tome-first-run')?.remove();
  stopMeasurement();window.__tomeTextPosition?.startCalibration?.();message='';last={...last,gameStyleState:'revealing'};send({type:'gameStyleSync',key:session.key,
   part,owner});paint();
 }
 function receivedMeasurement(m){
  if(m.gameStyleOwner&&m.gameStyleOwner!==owner)return;
  if(!m.gameStyleOwner&&!document.body.classList.contains('tomoyo-ui-translation'))return;
  const r=m.gameStyle,out=convert(r);if(!out)return;/* Issue 119: automatic calibration keeps a size the user set by hand; a sync the user starts measures it again */if(m.gameStyleAutomatic===true&&b.galPreferences().sizeSource==='user'){
   for(const k of ['japaneseSize','translationSize','japaneseSpacingPx'])delete out[k];}else if(m.gameStyleAutomatic!==true)out.sizeSource='';const part=m.gameStylePurpose||'all',
   generation=++measurementSerial,key=session.key;
  document.body.classList.remove('tome-style-probing');
  apply(pick(out,part));message=t('measured');aligning=part!=='text';
  const complete=()=>{if(generation!==measurementSerial||key!==session.key)return;aligning=false;
   if(part!=='text'){const target={...r,textWidth:Number(r.style?.width)*r.width/100,samples:r.positionSamples};const map=window.__tomeTextPosition?.finishCalibration?.(target,
    b.galPreferences(),{persist:false});message=t('positionReady');}
   if(m.gameStyleAutomatic===true)save();paint();};
  if(part!=='text'&&Number.isFinite(r.inkLeft)&&Number.isFinite(r.inkTop)&&!b.pageTranslationActive?.())runCorrection({inkLeft:r.inkLeft,inkTop:r.inkTop,width:r.width,
   height:r.height},complete);else complete();
 }
 function receiveImport(m){if(m.gameStyleState==='importList'){importList=Array.isArray(m.gameStyleImportList)?m.gameStyleImportList:[];paint();return true;}
  if(m.gameStyleState!=='importPreview')return false;if(!importing||importing.source!==m.gameStyleImportSource||importing.part!==m.gameStyleImportPart)return true;
  if(!m.gameStyleImportPrefs){message=t('importMissing');paint();return true;}stopMeasurement();
  apply(m.gameStyleImportPrefs,m.gameStyleImportPart==='position'?m.gameStyleImportMap||null:undefined);const source=importList.find(w=>w.key===importing.source)?.name||'';
   message=t('importPreview',{source,part:t(importing.part==='text'?'partText':'partPosition')});last={...last,gameStyleState:'measured'};paint();return true;}
 b.gameStyleStatus=m=>{if(receiveImport(m))return;
  if(m.gameStyleKey&&session.key&&m.gameStyleKey!==session.key&&m.gameStyleState!=='profile')return;
  if(typeof m.gameStylePreview==='boolean'){
   document.body.classList.toggle('tome-style-probing',m.gameStylePreview);window.__tomeGlassReport?.(); // drop or restore glass windows now, not on the next 120 ms tick
   if(m.gameStylePreview&&Number.isSafeInteger(m.gameStyleCaptureId)&&document.body.classList.contains('tomoyo-ui-translation'))requestAnimationFrame(()=>requestAnimationFrame(()=>send({
    type:'gameStyleCaptureReady',id:m.gameStyleCaptureId})));
  }
  if(m.gameStyleState==='profile')setTimeout(()=>firstRunTip(m),0);
  if(m.gameStyleState==='profile'){
   const changed=(m.gameStyleKey||'')!==session.key||!!m.gameStyleIdentity&&m.gameStyleIdentity!==gameIdentity;
   if(changed||!dirty()&&!saving){if(changed){measurementSerial++;clearInterval(correctionTimer);saving=null;aligning=false;gameIdentity=m.gameStyleIdentity||'';
    window.__tomeTextPosition?.resetSession?.(gameIdentity);}
    const p={...pick(b.galPreferences()),...(tools.followFont?tools.followFont(m.gameStyleEffectivePrefs):m.gameStyleEffectivePrefs)};session.load(m.gameStyleKey,m.gameStyleGameName,p,m.gameStylePositionMap,m.gameStyleSavedAt||Math.max(m.gameStyleTextSavedAt||0,
     m.gameStylePositionSavedAt||0),m.gameStyleHistory||[]);apply(p,m.gameStylePositionMap||null,false);message='';}
  }else if(m.gameStyleState==='saved'){
   if(saving&&m.gameStyleSaveId&&m.gameStyleSaveId!==saving.id)return;
   const prefs={...pick(b.galPreferences()),...tools.followFont(m.gameStyleEffectivePrefs||m.gameStyleProfile||saving?.prefs||values())},map=m.gameStylePositionMap===undefined?saving?.map||getMap():m.gameStylePositionMap;
   session.saved(m.gameStyleKey||session.key,prefs,map,m.gameStyleSavedAt,m.gameStyleHistory||[]);saving=null;apply(prefs,map,false);message='';
  }else if(m.gameStyleState==='saveFailed'){if(saving&&m.gameStyleSaveId&&m.gameStyleSaveId!==saving.id)return;saving=null;message=t('failed');}
  else if(m.gameStyleState==='measured'&&m.gameStyle)receivedMeasurement(m);
  else if(m.gameStyleState==='positionMap'&&!dirty())window.__tomeTextPosition?.setMap?.(m.gameStylePositionMap);
  last={...last,...m};paint();
 };
 const oldStatus=b.galStatus;b.galStatus=m=>{oldStatus?.(m);if(typeof m.gameStylePreview==='boolean')document.body.classList.toggle('tome-style-probing',m.gameStylePreview);
  if(m.type==='gameClosed'){measurementSerial++;clearInterval(correctionTimer);aligning=false;document.body.classList.remove('tome-style-probing');}};
 b.calibrationMenuOpened=dialog=>{if(!session.key)session.load('',session.name,values(),getMap(),0,[]);wire(dialog);buildImports(dialog);send({type:'gameStyleImportList'});
  paint();};
 // Two import groups (user, 2026-11-02): text appearance, and position/wrapping with its coordinate map. Each previews a
 // saved work's group and has its own save, which writes only that group of the current work (and its 7-version history).
 let importList=[],importing=null;
 function buildImports(dialog){const host=dialog.querySelector('[data-menu-category=calibrate]'),history=host?.querySelector('.tome-calibration-history');if(!host||host.querySelector('.tome-calibration-imports'))return;
  const box=document.createElement('div');box.className='tome-calibration-imports';box.dataset.noI18n='';
  for(const part of ['text','position']){const row=document.createElement('div');row.className='tome-import-row';row.dataset.importPart=part;const label=document.createElement('span');
   label.dataset.importLabel='';const select=document.createElement('select');select.dataset.importSelect='';const button=document.createElement('button');button.type='button';
   button.dataset.importSave='';button.disabled=true;
   select.onchange=()=>{if(!select.value||!session.key)return;importing={part,source:select.value};button.disabled=false;send({type:'gameStyleImportPreview',key:session.key,
    part,source:select.value});};
   button.onclick=()=>{if(!importing||importing.part!==part||!session.key||saving||aligning)return;const id=owner+':'+(++saveSerial),snapshot=pick(b.galPreferences(),
    part),map=part==='position'?getMap():undefined;saving={id,prefs:snapshot,map,key:session.key};send({type:'gameStyleConfirm',key:session.key,part,prefs:snapshot,
    map,saveId:id});importing=null;select.value='';button.disabled=true;paint();};
   row.append(label,select,button);box.append(row);}
  history?history.before(box):host.append(box);}
 function paintImports(dialog){const box=dialog.querySelector('.tome-calibration-imports');if(!box)return;for(const row of box.querySelectorAll('[data-import-part]')){
  const part=row.dataset.importPart,label=row.querySelector('[data-import-label]'),select=row.querySelector('[data-import-select]'),button=row.querySelector('[data-import-save]');
  const title=t(part==='text'?'importText':'importPosition');if(label.textContent!==title)label.textContent=title;if(button.textContent!==t('importSave'))button.textContent=t('importSave');
  const works=importList.filter(w=>part==='text'?w.textSavedAt:w.positionSavedAt),signature=JSON.stringify([lang(),works.map(w=>[w.key,w.name,part==='text'?w.textSavedAt:w.positionSavedAt])]);
   if(select.dataset.signature!==signature){const keep=select.value;select.dataset.signature=signature;select.replaceChildren();const first=document.createElement('option');
   first.value='';first.textContent=works.length?t('importPick'):t('importNone');select.append(first);for(const w of works){const o=document.createElement('option');
   o.value=w.key;o.textContent=w.name+' · '+date(part==='text'?w.textSavedAt:w.positionSavedAt);select.append(o);}select.value=works.some(w=>w.key===keep)?keep:'';
   select.disabled=!works.length;}}}
 function wire(dialog){
  if(!dialog||dialog.dataset.calibrationWired)return;dialog.dataset.calibrationWired='1';
  const cancel=dialog.querySelector('[data-cancel]');cancel?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();b.cancelGameSettings();
   },true);
  dialog.addEventListener('close',()=>{if(dirty()&&!saving)b.cancelGameSettings();},{once:true});
 }
 function paint(){
  if(repainting)return;repainting=true;
  try{for(const dialog of document.querySelectorAll('.tomoyo-cn-dialog:not([data-leaving])')){
   wire(dialog);const h=dialog.querySelector('.tomoyo-menu-header h3');let status=h?.querySelector('[data-calibration-current]');if(h&&!status){status=document.createElement('span');
    status.dataset.calibrationCurrent='';status.dataset.noI18n='';h.append(status);}
   if(status){const label=dirty()?t('preview'):session.key?session.savedAt?t('saved',{time:date(session.savedAt)}):t('unsaved'):t('unbound');if(status.textContent!==label)status.textContent=label;
    status.dataset.preview=String(dirty());}
   const cancel=dialog.querySelector('[data-cancel]');if(cancel){cancel.dataset.noI18n='';if(cancel.textContent!==t('cancel'))cancel.textContent=t('cancel');cancel.disabled=!!saving;
    }
   const submit=dialog.querySelector('footer button[type=submit]');if(submit){submit.disabled=!!saving||aligning;submit.dataset.noI18n='';const label=saving?t('saving'):t('save');
    if(submit.textContent!==label)submit.textContent=label;}
   const box=dialog.querySelector('.tome-game-style-sync');if(box){
    const sync=box.querySelector('[data-game-style-sync]');if(sync){sync.dataset.noI18n='';sync.textContent=t('sync');sync.disabled=!!saving||aligning;sync.onclick=()=>{
     send({type:'hookReselect',onlyIfBad:true});resync('all');};}
    let textButton=box.querySelector('[data-calibrate-text]');if(!textButton){textButton=document.createElement('button');textButton.type='button';textButton.dataset.calibrateText='';
     textButton.dataset.noI18n='';textButton.onclick=()=>resync('text');box.append(textButton);}textButton.textContent=t('textSync');textButton.disabled=!!saving||aligning;
    const positionButton=dialog.querySelector('[data-gal-position-sync]');if(positionButton){positionButton.dataset.noI18n='';positionButton.textContent=t('positionSync');
     positionButton.disabled=!!saving||aligning;positionButton.onclick=()=>resync('position');if(positionButton.parentElement!==box)box.append(positionButton);}
    let streamButton=box.querySelector('[data-calibrate-stream]');if(!streamButton){streamButton=document.createElement('button');streamButton.type='button';streamButton.dataset.calibrateStream='';
     streamButton.dataset.noI18n='';streamButton.onclick=()=>send({type:'hookReselect'});box.append(streamButton);}streamButton.textContent=({en:'Re-pick text stream',
     ja:'テキストストリームを選び直す'})[document.documentElement.lang?.slice(0,2)]||'重新选取文本流';
    const label=box.querySelector('.tome-auto-style-switch');if(label){label.dataset.noI18n='';const n=[...label.childNodes].find(n=>n.nodeType===3);if(n&&n.textContent!==t('automatic'))n.textContent=t('automatic');
     }
    /* E349: on a full-screen page the box position is the page's FIRST line; calibrating on a later line moved the whole page. */let flowHint=box.querySelector('[data-flow-hint]');
     if(!flowHint){flowHint=document.createElement('small');flowHint.dataset.flowHint='';flowHint.dataset.noI18n='';box.append(flowHint);}flowHint.hidden=!document.body.classList.contains('tome-flow-page');
     {const grid=document.body.classList.contains('tome-flow-grid-page'),lang=document.documentElement.lang?.slice(0,2);flowHint.textContent=grid?(({en:'Full-screen page: laid out on the game\'s own page grid; box calibration is not used.',
     ja:'全画面ページ：ゲーム自身のレイアウトに合わせます。位置の校正は不要です。'})[lang]||'整页游戏：按游戏自己的版面逐行对齐，不用校准位置'):(({en:'Full-screen page: calibrate on the first line of a page.',ja:'全画面ページ：ページの最初の行で校正してください。'})[lang]||'整页游戏：请在一页的第一句时校准');
     }
    let state=box.querySelector('[data-game-style-state]');if(!state){state=document.createElement('small');state.dataset.gameStyleState='';box.append(state);}state.dataset.noI18n='';
     state.setAttribute('role','status');const info=aligning?t('aligning'):message||t(last.gameStyleState==='profile'||last.gameStyleState==='saved'?'hint':last.gameStyleState);
     if(state.textContent!==info)state.textContent=info;
    state.dataset.error=String(['saveFailed','unmatched','timeout','unavailable','retrying'].includes(last.gameStyleState));state.title=last.gameStyleReason||'';
   }
   const position=dialog.querySelector('[data-position-state]');if(position){position.dataset.noI18n='';const tp=window.__tomeTextPosition?.state?.()||{},label=t(!tp.source?'noSource':!tp.calibrated?'needMap':tp.following?'following':'ready');
    if(position.textContent!==label)position.textContent=label;}
   paintImports(dialog);
   const history=dialog.querySelector('.tome-calibration-history');if(history){const title=history.querySelector('summary');if(title.textContent!==t('history'))title.textContent=t('history');
    const list=history.querySelector('[data-calibration-history-list]'),signature=JSON.stringify([lang(),session.savedAt,session.history.map(h=>h.id)]);if(list.dataset.signature!==signature){
    list.dataset.signature=signature;list.replaceChildren();if(!session.history.length){const empty=document.createElement('small');empty.textContent=t('empty');
    list.append(empty);}for(const [i,version]of session.history.entries()){const row=document.createElement('div');row.className='tome-calibration-version';const label=document.createElement('span');
    label.textContent=(i+1)+'. '+date(version.savedAt)+(version.savedAt===session.savedAt?' · '+t('current'):'');const button=document.createElement('button');button.type='button';
    button.textContent=t('restore');button.dataset.historyId=version.id;button.onclick=()=>restore(version.id);row.append(label,button);list.append(row);}}}
  }}finally{repainting=false;}
 }
 const style=document.createElement('style');style.textContent=`
 .tomoyo-menu-header h3{flex-wrap:wrap!important;align-items:center!important;gap:4px 10px!important}
 [data-calibration-current]{flex:1;min-width:160px;font-size:11px!important;font-weight:400!important;letter-spacing:0;line-height:1.55;color:var(--theme-textSecondary,#aaa);overflow-wrap:anywhere}
 [data-calibration-current][data-preview=true]{color:var(--theme-primary,#e0495a)}
 /* Window-sized containers never draw a focus ring (user, 2026-11-09): Alt+T is a keyboard action, so Chromium drew a
    light-blue focus-visible ring on a container as large as the reader window; the window only shows its hit regions,
    so the ring's top edge appeared as a blue line above the new-game tip, or above the menu dragged to the top. */
 html:focus,html:focus-visible,body:focus,body:focus-visible,dialog:focus,dialog:focus-visible,.sentence-window:focus,.sentence-window:focus-visible{outline:none!important}
 .tome-first-run{position:fixed;z-index:2147481000;left:50%;top:24px;transform:translateX(-50%);box-sizing:border-box;width:min(520px,calc(100vw - 32px));padding:14px 16px 12px;border-radius:14px;background:color-mix(in srgb,var(--theme-surface,#18181b) 94%,transparent);color:var(--theme-text,#eee);border:1px solid color-mix(in srgb,var(--theme-primary,#e0495a) 45%,transparent);box-shadow:none;font-size:13px;line-height:1.6}
 .tome-first-run b{display:block;margin-bottom:4px;font-size:14px}.tome-first-run p{margin:0 0 10px;color:var(--theme-textSecondary,#bbb)}
 .tome-first-run button{float:right;padding:5px 14px;border-radius:8px;border:0;background:var(--theme-primary,#e0495a);color:#fff;font:inherit;font-weight:600;cursor:pointer}
 .tome-game-style-sync{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 18px;padding:12px;border:1px solid var(--menu-border,#444);border-radius:12px}
 .tome-game-style-sync>label,.tome-game-style-sync>small{flex-basis:100%;margin:0!important;line-height:1.65}
 .tome-game-style-sync>button{margin:0!important;padding:7px 9px!important;font-size:12px!important}
 .tome-game-style-sync>button[data-game-style-sync]{border-color:var(--menu-accent)!important}
 [data-game-style-state][data-error=true]{color:#e6a56f!important}
 .tome-calibration-imports{display:flex;flex-direction:column;gap:10px;margin:0 0 16px;padding:12px;border:1px solid var(--menu-border,#444);border-radius:12px}
 .tome-import-row{display:grid;grid-template-columns:1fr auto;gap:6px 8px;align-items:center}
 .tome-import-row>span{grid-column:1/-1;font-size:12.5px;font-weight:600}
 .tome-import-row>select{min-width:0;width:100%}
 .tome-import-row>button{margin:0!important;padding:6px 14px!important;font-size:12px!important}
 .tome-calibration-version{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-top:1px solid var(--menu-border,#444)}
 .tome-calibration-version span{font-size:11.5px;font-variant-numeric:tabular-nums}
 .tome-calibration-version button{font-size:11.5px!important;margin:0!important}
 .tomoyo-cn-dialog footer{flex-wrap:wrap!important;gap:8px!important}
 body.tomoyo-ui-translation.tome-style-probing .sentence-window,body.tomoyo-ui-translation.tome-style-probing .tomoyo-cn-dialog,body.tomoyo-ui-translation.tome-style-probing .tomoyo-native-mask{visibility:hidden!important}
 /* The probe reads the screen (visible-client), overlays included. The backlog lists the current line too, so with it
    open the probe matched the source text inside the log and moved MeguLit's text onto it, again on every retry. Hide
    every panel that can show Japanese text over the game while measuring (its glass window goes with it). */
 body.tomoyo-ui-translation.tome-style-probing :is(.tome-backlog,.tomoyo-selection-card,.lookup-tooltip){visibility:hidden!important}
 `;document.head.append(style);
 let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;paint();});};
 for(const event of ['input','change','pointerup'])document.addEventListener(event,e=>{if(e.target?.closest?.('.tomoyo-cn-dialog'))schedule();},true);
 new MutationObserver(()=>{if(document.querySelector('.tomoyo-cn-dialog:not([data-calibration-wired])'))schedule();}).observe(document.documentElement,{subtree:true,
  childList:true});
 addEventListener('tome-language-change',paint);window.__tomeStyleSyncPaint=paint;
 b.calibrationState=()=>({key:session.key,savedAt:session.savedAt,preview:dirty(),saving:!!saving,aligning,history:session.history.length,state:last.gameStyleState});
 paint();send({type:'gameStyleProfileRequest'});
})();
