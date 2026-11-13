(function installGal() {
  'use strict';
  if (!document.documentElement) { document.addEventListener('DOMContentLoaded', installGal, { once: true }); return; }
  const bridge = window.__tomoyoChinese;
  if (!bridge || bridge.galInstalled) return;
  bridge.galInstalled = true;
  const appearance = window.TomoyoGameStyle;
  const defaults = appearance.defaults;
  let preferences = { ...defaults }, dialogFields, commitSynchronizedStyle=null, refreshTimer, renderSerial = 0, lastText = '', bound = false;
  bridge.isGalBound = () => bound;
  const tokenCache = new Map();
  const readingRequests = new Map(); let readingSerial=0;
  bridge.deliverReadings=(id,tokens)=>{const entry=readingRequests.get(id);if(entry){clearTimeout(entry.timer);readingRequests.delete(id);entry.resolve(tokens);
   }};
  function spellingReadings(tokens){return new Promise(resolve=>{const id=++readingSerial;const timer=setTimeout(()=>{readingRequests.delete(id);resolve(tokens.map(t=>({
   ...t,reading:String(t.reading||'').includes('ー')?'':t.reading})));},6000);readingRequests.set(id,{resolve,timer});send({type:'galReadings',id,tokens});});}
  try { preferences = appearance.clean(JSON.parse(localStorage.getItem('tomoyo-gal-settings') || '{}')); } catch {}
  preferences = appearance.clean(preferences);
  let gameScale = 1;
  let layoutInfo, maskImage, maskGeometry, maskFrameId = 0;
  const send = message => { if(['galConfigure','galPreview'].includes(message.type)&&bridge.gameProfileKey?.())message={...message,gameStyleKey:bridge.gameProfileKey()};
   try { window.__tomoyoTranslateRequest(JSON.stringify(message)); } catch {} };
  // Story text that is not Japanese (a Chinese/English translation patch) cannot be read: furigana, lookups and
  // translation turn into garbage. Several Han-only lines in a row with no kana at all mean the story is translated;
  // a translated interface alone never trips this, because the dialogue still carries kana. (user, 2026-11-08)
  let nonJapaneseRun=0,nonJapaneseDismissed=false;
  function checkStoryLanguage(text){
    const t=String(text||''),kana=(t.match(/[ぁ-ゖァ-ヺ]/g)||[]).length,han=(t.match(/[一-鿿]/g)||[]).length,latin=(t.match(/[A-Za-z]/g)||[]).length;
    if(kana>=2){nonJapaneseRun=0;document.querySelector('.megulit-language-warning')?.remove();return;}
    if(han>=6||latin>=20)nonJapaneseRun++;
    if(nonJapaneseRun<4||nonJapaneseDismissed||document.querySelector('.megulit-language-warning'))return;
    const lang=(document.documentElement.lang||'zh').slice(0,2),copy={
      zh:['游戏剧情不是日文','MeguLit 只能读取日文原文。检测到最近几句台词都不是日文，可能装了汉化或翻译补丁，注音、点读和翻译都会出错。只汉化菜单界面不受影响。可以试试「工具 → 恢复日文（实验性）」，或改用日文原版启动','知道了'],
      ja:['シナリオが日本語ではありません','MeguLit は日本語原文のみ読み取れます。直近の台詞が日本語ではないため、翻訳パッチが入っている可能性があります。ふりがな・辞書・翻訳が正しく動きません。UI だけの翻訳なら問題ありません。「ツール → 日本語に戻す（実験的）」か日本語版での起動をお試しください',
       '閉じる'],
      en:['The story text is not Japanese','MeguLit only reads original Japanese text. The last few lines were not Japanese, so a translation patch is probably installed; furigana, lookups and translation will break. A translated interface alone is fine. Try Tools → Restore Japanese (experimental), or launch the Japanese edition.',
       'Got it']}[lang]||null;
    const [title,body,ok]=copy||['游戏剧情不是日文','MeguLit 只能读取日文原文，汉化或翻译后的剧情无法使用','知道了'];
    const box=document.createElement('div');box.className='megulit-language-warning';box.setAttribute('role','alert');
    box.innerHTML='<b></b><p></p><button type="button"></button>';box.querySelector('b').textContent='⚠ '+title;box.querySelector('p').textContent=body;
    const button=box.querySelector('button');button.textContent=ok;button.onclick=()=>{nonJapaneseDismissed=true;box.remove();};
    if(!document.querySelector('#megulit-language-warning-style')){const st=document.createElement('style');st.id='megulit-language-warning-style';st.textContent='.megulit-language-warning{position:fixed;z-index:2147481500;left:50%;top:24px;transform:translateX(-50%);box-sizing:border-box;width:min(560px,calc(100vw - 32px));padding:16px 18px 14px;border-radius:14px;background:#2a1215f2;border:1px solid #e0495a;color:#fff;font:14px/1.6 system-ui,sans-serif;box-shadow:0 18px 40px -12px #000c;pointer-events:auto}.megulit-language-warning b{display:block;font-size:16px;margin-bottom:6px;color:#ff8a95}.megulit-language-warning p{margin:0 0 10px;color:#f1dcdc}.megulit-language-warning button{float:right;padding:6px 16px;border:0;border-radius:8px;background:#e0495a;color:#fff;font:inherit;font-weight:600;cursor:pointer}';
     document.head.append(st);}
    document.body.append(box);
  }
  bridge.onSourceText = text => {if(text!==lastText&&!bridge.pageTranslationActive?.()){renderSerial++;clearRuby();}checkStoryLanguage(text);alignText();send({ type:'galSource',
   text });};
  if (bridge.sourceText) bridge.onSourceText(bridge.sourceText);
  function placeLayers() {
    const dpr = Math.max(.5, Number(window.devicePixelRatio) || 1);
    if (layoutInfo) for (const [name,key] of Object.entries({x:'readerX',y:'readerY',width:'readerWidth'})) document.documentElement.style.setProperty('--tomoyo-reader-'+name,
     (layoutInfo[key]/dpr)+'px');
    if (maskImage && maskGeometry) {
      maskImage.style.left = (maskGeometry.x/dpr)+'px'; maskImage.style.top = (maskGeometry.y/dpr)+'px';
      maskImage.style.width = (maskGeometry.width/dpr)+'px'; maskImage.style.height = (maskGeometry.height/dpr)+'px';
    }
  }
  bridge.galMaskFrame = frame => {
    if (!Number.isSafeInteger(frame?.id) || frame.id < maskFrameId) return;
    maskFrameId = frame.id;
    if (frame.clear) { maskImage?.remove(); maskImage = null; maskGeometry = null; return; }
    if (!bound || typeof frame.png !== 'string' || frame.png.length > 2500000 || !/^[A-Za-z0-9+/]+=*$/.test(frame.png)) return;
    if (![frame.x,frame.y,frame.width,frame.height].every(Number.isFinite) || frame.width <= 0 || frame.height <= 0 || frame.width > 7680 || frame.height > 4320) return;
    const image = document.createElement('img');
    image.className = 'tomoyo-native-mask'; image.alt = ''; image.setAttribute('aria-hidden','true');
    image.onload = () => {
      if (frame.id !== maskFrameId || !bound) return;
      maskImage?.remove(); maskImage = image; maskGeometry = frame;
      placeLayers(); document.body.appendChild(image);
      bridge.maskMessage = (frame.provisional?'极速预遮已加载：':'遮罩图像已加载：')+frame.count+' 个原文小区域';
      if (dialogFields) dialogFields.maskState.textContent = bridge.maskMessage;
      send({type:'galMaskLoaded',id:frame.id,count:frame.count,x:frame.x,y:frame.y,width:frame.width,height:frame.height,provisional:frame.provisional===true});
    };
    image.onerror = () => { if (frame.id !== maskFrameId) return; bridge.maskMessage = '阅读层无法加载遮罩图像，请把此状态发给助手'; if(dialogFields)dialogFields.maskState.textContent=bridge.maskMessage;
     send({type:'galMaskError',id:frame.id}); };
    image.src = 'data:image/png;base64,'+frame.png;
  };
  bridge.galLayout = layout => {
    if (![layout?.readerX,layout?.readerY,layout?.readerWidth,layout?.readerHeight].every(Number.isFinite)) return;
    if(maskGeometry&&[layout.maskX,layout.maskY].every(Number.isFinite))maskGeometry={...maskGeometry,x:layout.maskX,y:layout.maskY};
    layoutInfo = layout;
    // The window resize and these coordinates arrive separately when Alt+T or the LOG grows/shrinks the overlay. Until
    // both match, the text would be drawn at the old place inside the new window for a frame (the flash): keep the
    // reading layer hidden until the viewport has the size these coordinates were computed for (600 ms at most).
    if (surfaceMismatch(layout)) { holdSurface(); return; }
    releaseSurface(); placeLayers(); apply();bridge.islandPage?.refresh();
  };
  let surfaceTimer = 0;
  const surfaceMismatch = layout => { const dpr = Math.max(.5, Number(window.devicePixelRatio)||1); return Number.isFinite(layout?.surfaceWidth) && Number.isFinite(layout?.surfaceHeight) && (Math.abs(window.innerWidth*dpr - layout.surfaceWidth) > 80 || Math.abs(window.innerHeight*dpr - layout.surfaceHeight) > 80);
   };
  const holdSurface = () => { document.body?.classList.add('tome-surface-pending'); clearTimeout(surfaceTimer); surfaceTimer = setTimeout(() => { releaseSurface();
   placeLayers(); apply(); }, 600); };
  const releaseSurface = () => { clearTimeout(surfaceTimer); surfaceTimer = 0; document.body?.classList.remove('tome-surface-pending'); };
  addEventListener('resize', () => { if (!layoutInfo) return; if (surfaceMismatch(layoutInfo)) holdSurface(); else if (document.body?.classList.contains('tome-surface-pending')) {
   releaseSurface(); placeLayers(); apply(); } });
  const style = document.createElement('style');
  style.textContent = `
    .tome-island-layout-hint { display:none; }
    body.tome-island-active .tome-island-layout-hint { display:block; }
    body.tome-island-active label:has(>select[name=galPreset]),body.tome-island-active [data-gal-drag],body.tome-island-active [data-gal-position-sync],body.tome-island-active .tome-live-position,body.tome-island-active .tome-manual-region-hint { display:none!important; }
    .sentence-window .sentence-text.tomoyo-furigana {
      --megulit-ruby-line:var(--tomoyo-gal-ruby-line-height,2.55);
      line-height:calc(var(--megulit-ruby-line) * 1em)!important;
      padding-top:.55em;
    }
    body.tomoyo-game-style .sentence-window .sentence-text.tomoyo-furigana { margin-bottom:calc((2.55 - var(--megulit-ruby-line)) * .5em)!important; }
    body .sentence-window.tomoyo-cn-active .sentence-text,body.tomoyo-gal-bound .sentence-window .sentence-text { padding-left:max(0px,calc(var(--tomoyo-jp-indent,0px) + var(--megulit-jp-hang,0px)))!important; text-indent:calc(var(--tomoyo-jp-indent,0px) - max(0px,calc(var(--tomoyo-jp-indent,0px) + var(--megulit-jp-hang,0px))))!important; }
    .megulit-ruby-rows { grid-column:1/-1; display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:6px 10px; margin-top:2px; }
    .megulit-ruby-rows-title { font-size:12px; opacity:.8; }
    .megulit-ruby-rows-chips { display:flex; flex-wrap:wrap; gap:4px; }
    .megulit-ruby-rows .megulit-ruby-row-chip, .megulit-ruby-rows .megulit-ruby-row-chip::before, .megulit-ruby-rows .megulit-ruby-row-chip::after { all:unset; box-sizing:border-box; } /* E269 global button styles (icon cell, padding) shifted the label off its highlight */
    .megulit-ruby-rows .megulit-ruby-row-chip { display:inline-flex!important; align-items:center; justify-content:center; text-align:center; min-width:24px; height:22px; padding:0 6px; border-radius:6px; border:1px solid #ffffff26; background:transparent; color:inherit; font:600 11px/1 ui-monospace,monospace; cursor:pointer; transition:background-color .15s,border-color .15s,transform .1s; }
    .megulit-ruby-rows .megulit-ruby-row-chip:active { transform:scale(.96); }
    .megulit-ruby-rows .megulit-ruby-row-chip.is-set { border-color:#c8303c99; }
    .megulit-ruby-rows .megulit-ruby-row-chip.is-on { background:#c8303c; border-color:#c8303c; color:#fff; }
    .megulit-ruby-rows .megulit-ruby-row-chip:focus-visible { outline:2px solid #c8303c; outline-offset:2px; }
    .megulit-ruby-rows-value { font:11px ui-monospace,monospace; color:#c8303c; min-width:3ch; text-align:right; }
    .megulit-ruby-rows-slider { grid-column:1/-1; width:100%; }
    body.tomoyo-game-style .sentence-window .sentence-text:not(.tomoyo-furigana) { margin-top:calc((1.95 - var(--tomoyo-gal-line-height,1.95)) * .5em)!important; margin-bottom:calc((1.95 - var(--tomoyo-gal-line-height,1.95)) * .5em)!important; } /* furigana needs room between wrapped rows even with a tight line height */
    .sentence-text .megulit-ruby-base { position:relative;display:inline-block;white-space:nowrap;vertical-align:baseline;padding-right:var(--megulit-ruby-trailing-space,0px);text-indent:0!important; } /* E259: the sentence's hanging indent (text-indent:-17px for 「) was inherited by every inline-block base and shifted its kanji left over the previous glyph: the real cause of kana/kanji overlap */ /* E257: an inline-block drops the letter-spacing after its last glyph, so the next glyph overlapped; give it back */
    .sentence-text .megulit-ruby-base::before { transition:opacity 70ms linear; }
    .sentence-text .megulit-ruby-base:has(> .tome-typewriter-pending:first-child)::before { opacity:0;transition:none; }
    @media (prefers-reduced-motion:reduce) { .sentence-text .megulit-ruby-base::before { transition:none; } }
    body.tome-line-read .sentence-window:not(.tome-island-page) { --tomoyo-gal-color:var(--tomoyo-gal-read-color); --tomoyo-gal-gradient:var(--tomoyo-gal-read-gradient); --tomoyo-gal-fill:var(--tomoyo-gal-read-fill); --tomoyo-gal-jp-stroke:var(--tomoyo-gal-read-jp-stroke); --tomoyo-gal-cn-stroke:var(--tomoyo-gal-read-cn-stroke); --tomoyo-gal-jp-filter:var(--tomoyo-gal-read-jp-filter); --tomoyo-gal-cn-filter:var(--tomoyo-gal-read-cn-filter); }
    body.tome-line-color .sentence-window:not(.tome-island-page) { --tomoyo-gal-color:var(--tomoyo-gal-line-color); --tomoyo-gal-gradient:none; --tomoyo-gal-fill:currentColor; } /* E550 per-line colour (text-position.js paintLine) */
    body.tome-surface-pending .sentence-window, body.tome-surface-pending .tomoyo-native-mask, body.tome-surface-pending .tome-inline-wait { visibility:hidden!important; }
    body.tome-box-dragging .sentence-window { outline:2px dashed var(--theme-primary,#e0495a)!important; outline-offset:2px; cursor:move!important; }
    body.tome-box-dragging .sentence-window * { cursor:move!important; pointer-events:none!important; }
    [data-gal-drag].tome-dragging { background:var(--theme-primary,#e0495a)!important; color:#fff!important; border-color:transparent!important; }
    .sentence-text .megulit-ruby-base[data-tomoyo-reading]::before { content:attr(data-tomoyo-reading); position:absolute; left:calc(50% - var(--megulit-ruby-trailing-space,0px)/2 + var(--tomoyo-ruby-offset-x,0px) + var(--megulit-ruby-row-x,0px)); top:calc(var(--megulit-ruby-top,0px) - var(--megulit-ruby-lift,calc(.22em - var(--tomoyo-ruby-offset-y,0px)))); transform:translate(-50%,-100%); font-size:var(--tomoyo-ruby-actual-size,max(6px,var(--tomoyo-ruby-scale,.52em))); line-height:1; font-weight:var(--tomoyo-jp-weight,400); white-space:nowrap; pointer-events:none; letter-spacing:var(--megulit-ruby-letter-spacing,0em); margin-left:calc(var(--megulit-ruby-letter-spacing,0em)/2); text-shadow:var(--tomoyo-gal-shadow,0 1px 2px #000e); }
    body.tomoyo-gal-bound [data-gal-reader-container] > :not([data-gal-reader-container]):not(.sentence-window):not(.tomoyo-cn-dialog):not(.word-image-preview-portal):not(.tomoyo-native-mask):not(.tome-backlog):not(.tome-box-deco):not(.tome-mode-veil):not(.mg-bubble) { display:none!important; }
    body.tomoyo-gal-bound [data-gal-reader-container] { transform:none!important; perspective:none!important; filter:none!important; opacity:1!important; isolation:auto!important; contain:none!important; will-change:auto!important; mix-blend-mode:normal!important; z-index:auto!important; }
    .tomoyo-native-mask { position:fixed!important; z-index:10!important; pointer-events:none!important; user-select:none!important; max-width:none!important; margin:0!important; padding:0!important; border:0!important; opacity:1!important; filter:none!important; }
    body:not(.tomoyo-gal-bound) .tomoyo-native-mask { display:none!important; }
    body.tomoyo-gal-bound .sentence-window { position:fixed!important; z-index:20!important; inset:auto!important; left:var(--tomoyo-reader-x,0px)!important; top:var(--tomoyo-reader-y,0px)!important; margin:var(--tomoyo-gal-out-y,0px) var(--tomoyo-gal-out-x,0px)!important; width:calc(var(--tomoyo-reader-width,100vw) - var(--tomoyo-gal-out-x,0px) * 2)!important; height:auto!important; max-height:none!important; flex-direction:column!important; justify-content:flex-start!important; max-width:none!important; min-height:0!important; padding:var(--tomoyo-gal-pad-y,10px) var(--tomoyo-gal-pad-x,20px)!important; box-sizing:border-box!important; border:0!important; border-radius:0!important; align-items:stretch!important; overflow:visible!important; scrollbar-width:none; -webkit-app-region:no-drag; }
    body.tomoyo-gal-bound .sentence-window::-webkit-scrollbar { display:none; }
    html:has(body.tomoyo-gal-bound), body.tomoyo-gal-bound, body.tomoyo-gal-bound [data-gal-reader-container], body.tomoyo-gal-bound .sentence-window { background-color:transparent!important; background-image:none!important; box-shadow:none!important; backdrop-filter:none!important; -webkit-backdrop-filter:none!important; }
    body.tomoyo-gal-bound .lookup-limit-badge { display:none!important; }
    body.tomoyo-ui-translation.tomoyo-cover-hidden .sentence-window, body.tomoyo-ui-translation.tomoyo-cover-hidden .tomoyo-native-mask { visibility:hidden!important; pointer-events:none!important; }
    body.tomoyo-gal-bound, body.tomoyo-gal-bound [data-gal-reader-container] { overflow:hidden!important; }
    body.tomoyo-game-style .sentence-text, body.tomoyo-gal-bound .sentence-text { letter-spacing:var(--tomoyo-gal-jp-spacing,.035em)!important; line-height:var(--tomoyo-gal-line-height,1.95)!important; }
    body.tomoyo-gal-bound .sentence-text { flex:none!important; max-height:none!important; overflow:visible!important; font-size:var(--tomoyo-gal-jp-size,26px)!important; }
    body.tomoyo-game-style .sentence-text { font-family:var(--tomoyo-gal-jp-font)!important; font-size:var(--tomoyo-gal-jp-size,26px)!important; font-weight:400!important; color:var(--tomoyo-gal-color,#fffaf2)!important; text-align:left!important; line-height:var(--tomoyo-gal-line-height,1.95)!important; letter-spacing:var(--tomoyo-gal-jp-spacing,.035em)!important; text-shadow:var(--tomoyo-gal-shadow)!important; margin:0!important; width:100%!important; white-space:pre-wrap; overflow-wrap:anywhere; line-break:strict; }
    body.tomoyo-game-style .sentence-text .char-token { color:inherit!important; border-bottom:0!important; padding-bottom:0!important; }
    body.tomoyo-game-style .sentence-text .char-token:not(.hovered) { background-color:transparent!important; }
    body.tomoyo-game-style .sentence-text .char-token.hovered { background-color:#fff2!important; box-shadow:0 0 0 2px #fff2; border-radius:2px; }
    body.tomoyo-game-style .tomoyo-cn-row { margin:var(--tomoyo-gal-gap,6px) 0 0!important; padding:0!important; line-height:calc(1.65 + var(--megulit-translation-line-offset,0))!important; }
    body.tomoyo-game-style .tomoyo-cn-output { font-family:var(--tomoyo-gal-cn-font)!important; font-size:var(--tomoyo-gal-cn-size,24px)!important; font-weight:400!important; color:var(--tomoyo-gal-color,#fffaf2)!important; letter-spacing:var(--tomoyo-gal-cn-spacing,0px)!important; line-height:calc(1.65 + var(--megulit-translation-line-offset,0))!important; text-shadow:var(--tomoyo-gal-shadow)!important; }
    body.tomoyo-game-style .tomoyo-cn-output[data-state=error] { color:#e3bdb3!important; font:14px/1.5 'Microsoft YaHei',sans-serif!important; }
    body.tomoyo-game-style .tomoyo-cn-row:has(.tomoyo-cn-output:empty) { visibility:hidden; }
    body.tomoyo-gal-ja-only .tomoyo-cn-row { display:none!important; }
    body.tomoyo-gal-zh-only .sentence-text { display:none!important; }
    body.tomoyo-gal-none :is(.sentence-text,.tomoyo-cn-row) { visibility:hidden!important; }
    body.tomoyo-gal-zh-only .tomoyo-cn-row { margin-top:0!important; }
    body.tomoyo-gal-mask .sentence-window { background:var(--tomoyo-gal-mask,#171923)!important; }
    body.tomoyo-game-style .sentence-text .char-token,body.tomoyo-game-style .tomoyo-cn-output,body.tomoyo-gal-bound .sentence-text .char-token,body.tomoyo-gal-bound .tomoyo-cn-output {
      background-image:var(--tomoyo-gal-gradient,none)!important;background-clip:text!important;-webkit-background-clip:text!important;
      -webkit-text-fill-color:var(--tomoyo-gal-fill,currentColor)!important;
    }
    /* E409 (user: 一开渐变注音直接变全黑): the gradient outline is an SVG dilate filter at the Japanese outline width; on the whole line it also swelled the small ruby (::before of the ruby base) into blobs of the outline colour. It now goes on the characters only; ruby keeps its own fill and stroke. */
    body.tomoyo-game-style .sentence-text .char-token,body.tomoyo-gal-bound .sentence-text .char-token { filter:var(--tomoyo-gal-jp-filter,none)!important; }
    body.tomoyo-game-style .tomoyo-cn-output,body.tomoyo-gal-bound .tomoyo-cn-output { filter:var(--tomoyo-gal-cn-filter,none)!important;background-size:100% calc((1.65 + var(--megulit-translation-line-offset,0)) * 1em)!important;background-repeat:repeat-y!important; }
    .sentence-text .megulit-ruby-base[data-tomoyo-reading]::before { -webkit-text-fill-color:var(--tomoyo-gal-color,#fffaf2)!important;background-image:none!important; }
    /* E578 (live beta38, ダストマニア: the game's line and MeguLit's copy a few px apart looked doubled and smeared): where the hook cannot hide the game's
       text (megulit-readonly-hook) the Japanese line stays laid out on the game's own text for lookups and ruby, but its glyphs are not painted. */
    body.tomoyo-gal-bound.megulit-readonly-hook .sentence-window:not(.tome-island-page) .sentence-text .char-token { -webkit-text-fill-color:transparent!important;background-image:none!important;filter:none!important;-webkit-text-stroke:0!important;text-shadow:none!important; }
    .tomoyo-gal-fields { border:1px solid #505465; border-radius:8px; padding:10px 12px; margin:14px 0; }
    .tomoyo-gal-fields legend { padding:0 5px; }
    .tomoyo-gal-fields button { background:#343847; color:#eef1fa; border:1px solid #505465; border-radius:5px; padding:5px 8px; margin:6px 6px 0 0; cursor:pointer; }
    .tomoyo-gal-state { margin-top:6px; color:#b5d8fc; }
    body.tomoyo-gal-bound .sentence-text, body.tomoyo-game-style .sentence-text { font-weight:var(--tomoyo-jp-weight,400)!important; }
    body.tomoyo-ui-translation .tomoyo-cn-output,body.tomoyo-ui-translation .tomoyo-cn-output *,body.tomoyo-game-style .tomoyo-cn-output,body.tomoyo-game-style .tomoyo-cn-output * { font-weight:var(--tomoyo-cn-weight,400)!important; font-synthesis:weight!important; font-synthesis-weight:auto!important; }
    .sentence-window.tomoyo-cn-active .sentence-text, .sentence-window.tomoyo-cn-active .tomoyo-cn-row { box-sizing:border-box!important; align-self:stretch!important; min-width:0!important; width:100%!important; margin-left:0!important; margin-right:0!important; padding-left:0!important; padding-right:0!important; border-left:0!important; border-right:0!important; text-indent:0!important; text-align:left!important; }
    .tomoyo-cn-output { margin:0!important; padding:0!important; text-indent:0!important; text-align:left!important; white-space:pre-line!important; }
    body.tomoyo-gal-bound .sentence-window .sentence-text[data-megulit-native-breaks] { white-space:pre!important; }
    .sentence-text .char-token[data-tomoyo-leading-space] { display:none!important; }
    .sentence-window.tomoyo-cn-active .sentence-text { text-indent:var(--tomoyo-jp-indent,0px)!important; }
    .tomoyo-cn-output { text-indent:var(--tomoyo-cn-indent,0px)!important; }
    body.tomoyo-gal-bound .tomoyo-cn-dialog { top:12px; right:12px; left:auto; bottom:auto; margin:0; width:390px; max-height:calc(100vh - 24px); }
    body.tomoyo-gal-bound .tomoyo-cn-dialog::backdrop { background:transparent; }
    .tomoyo-cn-dialog input[type=range] { padding:0; accent-color:#b6c8e8; cursor:ew-resize; }
    body.tomoyo-game-style .sentence-text,body.tomoyo-gal-bound .sentence-text,body.tomoyo-game-style .sentence-text .char-token,body.tomoyo-gal-bound .sentence-text .char-token { -webkit-text-stroke:var(--tomoyo-gal-jp-stroke,var(--tomoyo-jp-stroke,0px)) var(--tomoyo-jp-stroke-color,#fff)!important; paint-order:stroke fill!important; text-shadow:none!important; -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision; }
    body.tomoyo-game-style .tomoyo-cn-output,body.tomoyo-gal-bound .tomoyo-cn-output { -webkit-text-stroke:var(--tomoyo-gal-cn-stroke,var(--tomoyo-cn-stroke,0px)) var(--tomoyo-cn-stroke-color,#fff)!important; paint-order:stroke fill!important; text-shadow:none!important; -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision; }
    .sentence-text .megulit-ruby-base[data-tomoyo-reading]::before { -webkit-text-stroke:var(--tomoyo-ruby-stroke,0px) var(--tomoyo-ruby-stroke-color,#fff)!important; paint-order:stroke fill!important; text-shadow:none!important; }
    .tomoyo-slider-value { color:#dfc9a7; font-variant-numeric:tabular-nums; float:right; }
    body.tomoyo-game-style .sentence-text,body.tomoyo-gal-bound .sentence-text { font-family:var(--tomoyo-gal-jp-font)!important; }
    body.tomoyo-game-style .tomoyo-cn-output,body.tomoyo-gal-bound .tomoyo-cn-output { font-family:var(--tomoyo-gal-cn-font)!important; }
    .sentence-text .megulit-ruby-base[data-tomoyo-reading]::before { font-family:var(--tomoyo-ruby-font,"Meiryo",sans-serif)!important; font-synthesis:none; text-rendering:optimizeLegibility; -webkit-font-smoothing:antialiased; font-weight:400!important; }
  `;
  (document.head || document.documentElement).appendChild(style);
  function sourceText(sentence) { return Array.from(sentence?.querySelectorAll('.char-token') || [], node => node.textContent).join(''); }
  function clearRuby(scope=document) {
    for(const base of scope.querySelectorAll('.megulit-ruby-base'))base.replaceWith(...base.childNodes);
  }
  function rubyTargets() {
    const page=[...document.querySelectorAll('.tome-island-page .sentence-text')];
    if(page.length)return page;
    const one=document.querySelector('.sentence-text');return one?[one]:[];
  }
  function paint(tokens,sentence=document.querySelector('.sentence-text'),all=true) {
    if(!sentence){if(all)clearRuby();return;}
    sentence.classList.toggle('tomoyo-furigana',!!preferences.furigana);
    sentence.style.setProperty('--tomoyo-ruby-scale',preferences.rubyScale+'em');
    const chars=[...sentence.querySelectorAll('.char-token')],text=sourceText(sentence);
    preserveNativeBreaks(sentence,text);
    if(!preferences.furigana){clearRuby(all?document:sentence);return;}
    const annotations=window.TomoyoFurigana.withGameRuby(text,window.TomoyoFurigana.annotations(text,tokens),bridge.gameRuby)
      .filter(({start,end})=>chars[start]&&chars[end-1]&&!chars.slice(start,end).some(n=>n.textContent.includes('\n')));
    const key=JSON.stringify(annotations),bases=()=>[...sentence.querySelectorAll('.megulit-ruby-base')];
    if(sentence.__megulitRubyBases!==key||bases().length!==annotations.length){
      clearRuby(sentence);sentence.__megulitRubyBases=key;
      for(const annotation of annotations){
        const nodes=chars.slice(annotation.start,annotation.end),first=nodes[0];
        if(nodes.some((n,i)=>i>0&&nodes[i-1].nextSibling!==n))continue;
        const base=document.createElement('span');
        base.className='megulit-ruby-base';base.__megulitReading=annotation.reading;
        first.before(base);base.append(...nodes);
      }
    }
    const canvas=document.createElement('canvas').getContext('2d');
    const root=getComputedStyle(document.documentElement),family=root.getPropertyValue('--tomoyo-ruby-font').trim()||'Meiryo';
    const offset=parseFloat(root.getPropertyValue('--tomoyo-ruby-offset-x'))||0,items=[];
    const yOffset=parseFloat(root.getPropertyValue('--tomoyo-ruby-offset-y'))||0;
    const sentenceStyle=getComputedStyle(sentence);
    const stroke=name=>parseFloat(sentenceStyle.getPropertyValue(name))||0;
    const baseStroke=Math.max(stroke('--tomoyo-jp-stroke'),stroke('--tomoyo-gal-jp-stroke'));
    const rubyStroke=stroke('--tomoyo-ruby-stroke'),strokeGap=(baseStroke+rubyStroke)/2;
    const minGap=3+strokeGap+Math.max(0,Math.min(2,stroke('--tomoyo-gal-jp-spacing')/4));
    const travel=5;
    // Every row keeps its readings (E215.1, user: wrapped rows lost all furigana at a tight line spacing). Tighter
    // Japanese line spacing still tightens, down to the room one readable reading needs between rows.
    {const em=parseFloat(sentenceStyle.fontSize)||16,minRuby=Math.max(8,em*preferences.rubyScale*.5);
     sentence.style.setProperty('--megulit-ruby-floor',Math.ceil(em*1.08+minRuby+2*minGap+travel)+'px');}
    // The glyph's em box excludes the leading in its line box.
    const rows=[];
    /* E276 (user: every row chip moved every row): a page draws each line as its own .sentence-text, so rows counted per
       element always started at row 1. Rows are counted over the whole page, so row 2 is the page's second line. */
    const page=sentence.closest('.tome-island-page'),rowChars=page?[...page.querySelectorAll('.sentence-text .char-token')]:chars;
    for(const char of rowChars){
      if(!char.textContent.trim())continue;
      const r=char.getBoundingClientRect();if(!r.width||!r.height)continue;
      const size=parseFloat(getComputedStyle(char).fontSize)||16;
      const em=size*(r.height/(char.offsetHeight||r.height)),bottom=(r.top+r.bottom+em)/2;
      /* E270 (user, ATRI: two rows showed 16 row chips and the per-row Y did nothing): rows were keyed by each glyph's
         exact top, so glyphs mid typewriter rise, small kana and punctuation each opened a row of their own and the row
         numbers no longer matched the visual rows. Group glyphs whose centres sit within half a glyph of each other. */
      const center=(r.top+r.bottom)/2,row=rows.find(r0=>Math.abs(r0.center-center)<Math.max(4,Math.max(r0.height,r.height)*.5));
      if(row){row.top=Math.min(row.top,r.top);row.bottom=Math.max(row.bottom,bottom);}else rows.push({top:r.top,bottom,center,height:r.height});
    }
    rows.sort((a,b)=>a.center-b.center);
    const rowOf=g=>{const c=(g.top+g.bottom)/2;let best=0;for(let i=1;i<rows.length;i++)if(Math.abs(rows[i].center-c)<Math.abs(rows[best].center-c))best=i;return best;
     };
    for(const node of bases()){
      const first=node.firstElementChild,style=getComputedStyle(first),rect=node.getBoundingClientRect(),glyph=first.getBoundingClientRect();
      const baseFont=parseFloat(style.fontSize)||16;
      const trailing=parseFloat(style.letterSpacing)||0,scale=rect.width/(node.offsetWidth||1)||1;
      const spacing=Math.max(-.08,trailing/baseFont),reading=node.__megulitReading;
      node.style.setProperty('--megulit-ruby-trailing-space',trailing+'px');
      node.style.setProperty('--megulit-ruby-letter-spacing',spacing+'em');
      const scaleY=rect.height/(node.offsetHeight||1)||1,boxTop=(glyph.top+glyph.bottom)/2-baseFont*scaleY*.58;
      // The reading sits above the kanji's full em box: Japanese kanji ink nearly fills it, so anchoring on the estimated
      // ink top left readings touching their kanji (user, E215.3).
      node.style.setProperty('--megulit-ruby-top',(boxTop-rect.top)/scaleY+'px');
      const rowIndex=rows.length?rowOf(glyph):0,previous=rows[rowIndex-1];
      // Keep the Y offset independent of line height and constrain it to the space between the outlined glyphs.
      const space=previous?(boxTop-previous.bottom)/scaleY:Infinity;
      const font=Math.max(6,baseFont*preferences.rubyScale); /* E256: the user sets the size; no auto shrink */
      const maxLift=Math.max(minGap,space-minGap-font);
      const rest=Math.min(Math.max(minGap+travel,baseFont*.22),maxLift);
      const rowOffset=(Number(String(preferences.rubyRowOffsets||'').split(',')[rowIndex])||0)*(parseFloat(root.getPropertyValue('--megulit-ruby-unit'))||1);
      const lift=rest-yOffset-rowOffset; /* E255 free ±100; E264 plus this row's own offset */
      /* E396 (群友: 按行微调 X) this row's own horizontal offset, added to the global X */
      const rowX=(Number(String(preferences.rubyRowOffsetsX||'').split(',')[rowIndex])||0)*(parseFloat(root.getPropertyValue('--megulit-ruby-unit'))||1);
      node.style.setProperty('--megulit-ruby-row-x',rowX+'px');
      node.style.setProperty('--megulit-ruby-lift',lift+'px');
      canvas.font=font+'px '+family;
      items.push({node,reading,left:rect.left+(offset+rowX)*scale,right:rect.right+(offset+rowX-trailing)*scale,
        top:glyph.top,font,width:(canvas.measureText(reading).width+([...reading].length-1)*spacing*font)*scale,
        limitLeft:0,limitRight:window.innerWidth,priority:node.childElementCount});
    }
    // One reading size for the whole sentence (user: 一样大最好): the smallest that fits any of its rows.
    const common=Math.min(...items.map(i=>i.font));for(const i of items){i.width*=common/i.font;i.font=common;}
    {const n=Math.min(16,rows.length);if(n&&n!==window.__megulitRubyRows){window.__megulitRubyRows=n;dispatchEvent(new Event('megulit-ruby-rows'));}} /* E270: the rows of the current sentence, not the most ever seen */
    for(const item of window.TomoyoRubyLayout.layout(items,{minFont:1e9})){
      if(!item.visible){item.node.removeAttribute('data-tomoyo-reading');continue;}
      item.node.setAttribute('data-tomoyo-reading',item.reading);
      item.node.style.setProperty('--tomoyo-ruby-actual-size',item.font+'px');
    }
  }
  // Preserve the authored rows even when their rendered extent crosses the game client.
  function preserveNativeBreaks(sentence,text){
    sentence.toggleAttribute('data-megulit-native-breaks',text.includes('\n'));
  }
  async function updateRuby() {
    const targets = rubyTargets(), page = !!targets[0]?.closest('.tome-island-page');
    if (!page) return updateLineRuby();
    const id = ++renderSerial;
    for (const sentence of targets) {
      const text = sourceText(sentence);
      if (!preferences.furigana || !text) { paint([], sentence, false); continue; }
      const cacheKey = (bridge.options?.().readingEngine || 'sudachi') + '\0' + text;
      if (sentence.__tomeRubyText === text && sentence.__tomeRubyKey === cacheKey && tokenCache.has(cacheKey)) { paint(tokenCache.get(cacheKey), sentence, false);
       continue; }
      try {
        const tokens = await rubyTokens(text);
        if (id !== renderSerial) return;
        if (!sentence.isConnected || sourceText(sentence) !== text) continue;
        sentence.__tomeRubyText = text; sentence.__tomeRubyKey = cacheKey; paint(tokens, sentence, false);
      } catch(error) { clearRuby(sentence); bridge.learningStatus?.({learningMessage:error.message||'Full 注音尚未就绪'}); if (dialogFields) dialogFields.state.textContent = error.message||'本地注音暂未就绪';
       return; }
    }
    bridge.islandPage?.refresh?.(); // furigana changes each pair's height and reserved band
  }
  // Furigana must appear with its characters as the typewriter reveals them, not after the whole line (user,
  // 2026-11-02). Tokenizing starts when the line's text arrives (prefetch); the island page awaits prepareRuby before
  // its reveal, so the readings are already attached to the still-hidden characters. One request per text.
  const rubyInflight = new Map();
  const rubyKey = text => (bridge.options?.().readingEngine || 'sudachi') + '\0' + text;
  function rubyTokens(text) {
    const key = rubyKey(text);if (tokenCache.has(key)) return Promise.resolve(tokenCache.get(key));
    if (!rubyInflight.has(key)) rubyInflight.set(key, tokenize(text, key).finally(() => rubyInflight.delete(key)));
    return rubyInflight.get(key);
  }
  bridge.prefetchRuby = text => { if (preferences.furigana && typeof text === 'string' && text.trim()) rubyTokens(text).catch(() => {}); };
  bridge.prepareRuby = async sentence => {
    const text = sourceText(sentence);if (!preferences.furigana || !text) return false;
    const key = rubyKey(text), tokens = await rubyTokens(text);
    if (!sentence.isConnected || sourceText(sentence) !== text) return false;
    sentence.__tomeRubyText = text; sentence.__tomeRubyKey = key; paint(tokens, sentence, false); bridge.islandPage?.refresh?.(); return true;
  };
  // The backlog annotates past lines with the same readings as the current one: the game's own ruby first, then the
  // tokenizer with its whole-word dictionary readings (E138). null while furigana is off.
  bridge.rubyAnnotations = async text => {
    if (!preferences.furigana || typeof text !== 'string' || !text.trim()) return null;
    const tokens = await rubyTokens(text);
    return window.TomoyoFurigana.withGameRuby(text, window.TomoyoFurigana.annotations(text, tokens), bridge.gameRuby);
  };
  async function tokenize(text, cacheKey) {
    const full=(bridge.options?.().readingEngine||'sudachi')==='sudachi';
    const raw = full?await bridge.localTokenize(text):await window.__TAURI_INTERNALS__.invoke('tokenize_text', { text });
    if(full&&(!Array.isArray(raw)||raw.some(t=>t.source!=='SudachiDict Full')))throw Error('注音未取得 Full 原生分词结果');
    const tokens = window.TomoyoFurigana.contextual(text, full?raw:await spellingReadings(Array.isArray(raw)?raw:[]));
    const result = Array.isArray(tokens) ? tokens : [];
    tokenCache.set(cacheKey, result);
    if (tokenCache.size > 400) tokenCache.delete(tokenCache.keys().next().value);
    return result;
  }
  async function updateLineRuby() {
    const sentence=document.querySelector('.sentence-text'),text=sourceText(sentence),id=++renderSerial;
    if(!preferences.furigana||!text){paint([],sentence);return;}
    preserveNativeBreaks(sentence,text);
    if(text!==lastText)clearRuby(sentence);
    const current=()=>id===renderSerial&&preferences.furigana&&document.querySelector('.sentence-text')===sentence&&sourceText(sentence)===text;
    try {
      const tokens=await rubyTokens(text);
      if(current()){lastText=text;paint(tokens,sentence);}
    } catch(error) {
      if(!current())return;
      clearRuby(sentence);bridge.learningStatus?.({learningMessage:error.message||'Furigana unavailable'});
      if(dialogFields)dialogFields.state.textContent=error.message||'Furigana unavailable';
    }
  }
  function markReader() {
    for (const node of document.querySelectorAll('[data-gal-reader-container]')) node.removeAttribute('data-gal-reader-container');
    if (!bound) return;
    let node = document.querySelector('.sentence-window')?.parentElement;
    while (node) { node.setAttribute('data-gal-reader-container', ''); node = node.parentElement; }
  }
  function alignText() {
    /* E323 (user, WoH: every click pushed the previous line one space to the right): "leading" ran on across the whole
       page, so only the first sentence in DOM order (the newest) lost its indent and every older one got it back.
       It is per sentence now, and a flow page keeps the game's own paragraph indent on every line. */
    const spans=[...document.querySelectorAll('.sentence-text .char-token')];
    for(const sentence of document.querySelectorAll('.sentence-text')){
      let leading=!sentence.closest('.tome-island-flow');
      for(const span of sentence.querySelectorAll('.char-token')){
        const text=span.textContent||'';
        const hide=leading&&/^[ \t\u00a0\u3000]+$/.test(text);
        if(hide)span.setAttribute('data-tomoyo-leading-space','');else span.removeAttribute('data-tomoyo-leading-space');
        if(text.includes('\n'))leading=true;else if(!hide&&text)leading=false;
      }
    }
    const context=document.createElement('canvas').getContext?.('2d');
    if(context){
      /* E416 (user 2026-11-11: one rule for every engine): each line is aligned by its OWN first character. The indent and
         the hanging opening bracket used to be measured on the first sentence only and applied to every line, so a name
         row, a 「…」 line and a narration line drawn together could not all sit on the game's text (穢翼のユースティア:
         spoken lines off, narration on). The root values stay as the fallback for elements measured before layout. */
      const measure=(node,text)=>{if(!node||!text)return null;const s=getComputedStyle(node);context.font=s.fontWeight+' '+s.fontSize+' '+s.fontFamily;const left=context.measureText(Array.from(text)[0]).actualBoundingBoxLeft;
       return Number.isFinite(left)?Math.max(-60,Math.min(5,left))+'px':null;};
      /* only where the hook cannot hide the game's text (its own text stays under ours); every other game keeps the page-wide measure */
      const perLine=document.body.classList.contains('megulit-readonly-hook');let first=true;
      for(const sentence of document.querySelectorAll('.sentence-text')){if(!perLine){sentence.style.removeProperty('--tomoyo-jp-indent');sentence.style.removeProperty('--megulit-jp-hang');
       }
        const japanese=[...sentence.querySelectorAll('.char-token')].find(span=>!span.hasAttribute('data-tomoyo-leading-space')&&span.textContent.trim());
        const indent=measure(sentence,japanese?.textContent),open=japanese&&(perLine?/^[「『（“‘〈《【〔［(]$/:/^[「『（“‘〈《【(]$/).test(japanese.textContent.trim()),hang=open?japanese.getBoundingClientRect().width+'px':'0px';
        if(indent){if(perLine)sentence.style.setProperty('--tomoyo-jp-indent',indent);if(first)document.documentElement.style.setProperty('--tomoyo-jp-indent',indent);
         }
        if(perLine)sentence.style.setProperty('--megulit-jp-hang',hang);if(first)document.documentElement.style.setProperty('--megulit-jp-hang',hang);
        if(japanese)first=false;
      }
      let firstCn=true;
      for(const cn of document.querySelectorAll('.tomoyo-cn-output')){const indent=measure(cn,cn.textContent?.trimStart());if(!indent)continue;if(perLine)cn.style.setProperty('--tomoyo-cn-indent',
       indent);else cn.style.removeProperty('--tomoyo-cn-indent');if(firstCn){document.documentElement.style.setProperty('--tomoyo-cn-indent',indent);firstCn=false;
       }}
    }
  }
  bridge.alignText=alignText;
  // Transparent text fill exposes a centred WebKit stroke underneath thin glyphs. Dilate the final painted alpha
  // instead and merge the coloured glyph ON TOP, keeping the gradient visible even with a light outline.
  function gradientOutline(name,on,width,color) {
    const ns='http://www.w3.org/2000/svg',id='tome-gradient-'+name+'-outline';let svg=document.getElementById('tome-gradient-filters');
    if(!svg){svg=document.createElementNS(ns,'svg');svg.id='tome-gradient-filters';svg.setAttribute('width','0');svg.setAttribute('height','0');svg.style.cssText='position:absolute;pointer-events:none;';
     document.body.append(svg);}
    let filter=document.getElementById(id);if(!filter){filter=document.createElementNS(ns,'filter');filter.id=id;filter.setAttribute('x','-100%');filter.setAttribute('y',
     '-100%');filter.setAttribute('width','300%');filter.setAttribute('height','300%');filter.setAttribute('color-interpolation-filters','sRGB');
      for(const [tag,attrs]of [['feMorphology',{in:'SourceAlpha',operator:'dilate',radius:'0',result:'expanded'}],['feFlood',{'flood-color':'#ffffff',result:'ink'}],
       ['feComposite',{in:'ink',in2:'expanded',operator:'in',result:'outline'}]]){const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,
       v);filter.append(n);}
      const merge=document.createElementNS(ns,'feMerge');for(const input of ['outline','SourceGraphic']){const n=document.createElementNS(ns,'feMergeNode');n.setAttribute('in',
       input);merge.append(n);}filter.append(merge);svg.append(filter);}
    const radius=on?Math.max(0,width):0,m=filter.querySelector('feMorphology'),f=filter.querySelector('feFlood');if(m.getAttribute('radius')!==String(radius))m.setAttribute('radius',
     String(radius));if(f.getAttribute('flood-color')!==color)f.setAttribute('flood-color',color);
    document.documentElement.style.setProperty('--tomoyo-gradient-'+name+'-outline',radius>0?'url(#'+id+')':'none');
  }
  function apply() {
    preferences = appearance.clean(preferences);
    gameScale = appearance.gameScaleFor({settings:preferences,layout:layoutInfo,bound,dpr:window.devicePixelRatio,innerWidth:window.innerWidth,dialogOpen:!!document.querySelector('.tomoyo-cn-dialog[open]'),
     previous:gameScale}); /* E477 */
    placeLayers();
    const root = document.documentElement.style;
    const scaled = value => (value * gameScale).toFixed(2) + 'px';
    root.setProperty('--tomoyo-gal-jp-size', scaled(preferences.japaneseSize));
    root.setProperty('--tomoyo-gal-cn-size', scaled(preferences.translationSize));
    const insets=appearance.insets(preferences);
    root.setProperty('--tomoyo-gal-pad-x', scaled(insets.padX));
    root.setProperty('--tomoyo-gal-pad-y', scaled(insets.padY));
    root.setProperty('--tomoyo-gal-out-x', scaled(insets.outX));
    root.setProperty('--tomoyo-gal-out-y', scaled(insets.outY));
    window.TomeTypewriter?.configure({enabled:preferences.typewriter,speed:preferences.typewriterSpeed});
    root.setProperty('--tomoyo-gal-gap', scaled(preferences.gap));
    root.setProperty('--megulit-translation-line-offset',preferences.translationLineHeight);root.setProperty('--tomoyo-gal-line-height', appearance.lineHeightFor(preferences));
     root.setProperty('--tomoyo-gal-ruby-line-height',appearance.lineHeightFor(preferences,true));root.setProperty('--tomoyo-ruby-offset-x',scaled(preferences.rubyOffsetX));
     root.setProperty('--tomoyo-ruby-offset-y',scaled(preferences.rubyOffsetY));root.setProperty('--megulit-ruby-unit',scaled(1));
    root.setProperty('--tomoyo-gal-jp-spacing',scaled(Math.max(-preferences.japaneseSize*.45,preferences.japaneseSpacingPx)));
    root.setProperty('--tomoyo-gal-cn-spacing',scaled(Math.max(-preferences.translationSize*.45,preferences.chineseSpacingPx)));
    root.setProperty('--tomoyo-jp-outline',appearance.outlineFor(preferences.japaneseOutline&&String(preferences.japaneseOutlineColor||'').toLowerCase()!==String(preferences.textColor||'').toLowerCase(),
     preferences.japaneseOutlineColor,preferences.japaneseOutlineWidth*gameScale,window.devicePixelRatio));
    root.setProperty('--tomoyo-cn-outline',appearance.outlineFor(preferences.chineseOutline,preferences.chineseOutlineColor,preferences.chineseOutlineWidth*gameScale,
     window.devicePixelRatio));
    root.setProperty('--tomoyo-ruby-outline',appearance.outlineFor(preferences.rubyOutline,preferences.rubyOutlineColor,preferences.rubyOutlineWidth*gameScale,window.devicePixelRatio));
     root.setProperty('--tomoyo-ruby-stroke-color',preferences.rubyOutlineColor);
    // The stroke is centred on the glyph edge and drawn under the fill, so half of it shows. An outline thinner than
    // one screen pixel covers each edge pixel by a different fraction and looks ragged; draw an even one-pixel ring
    // instead and make it as much fainter as it is thinner.
    const stroke=(name,on,width,color)=>{const dpr=Math.max(.5,Number(window.devicePixelRatio)||1),visible=on?width*gameScale:0,pixel=1/dpr;
     const safe=/^#[0-9a-f]{6}$/i.test(color)?color:'#ffffff',thin=visible>0&&visible<pixel;
     root.setProperty('--tomoyo-'+name+'-stroke',(thin?pixel*2:visible*2)+'px');
     root.setProperty('--tomoyo-'+name+'-stroke-color',thin?safe+Math.round(Math.max(.2,visible/pixel)*255).toString(16).padStart(2,'0'):safe);};
    stroke('jp',preferences.japaneseOutline,preferences.japaneseOutlineWidth,preferences.japaneseOutlineColor);
    stroke('cn',preferences.chineseOutline,preferences.chineseOutlineWidth,preferences.chineseOutlineColor);
    stroke('ruby',preferences.rubyOutline,preferences.rubyOutlineWidth,preferences.rubyOutlineColor);
    document.body.classList.toggle('megulit-english-style',preferences.englishEnabled);
    root.setProperty('--megulit-en-font',appearance.englishFonts[preferences.englishFont]);
    root.setProperty('--megulit-en-size',scaled(preferences.englishSize));
    root.setProperty('--megulit-en-spacing',scaled(preferences.englishSpacingPx));
    root.setProperty('--megulit-en-weight',preferences.englishBold?'700':'400');
    root.setProperty('--megulit-en-stroke',preferences.englishOutline?scaled(preferences.englishOutlineWidth):'0px');
    root.setProperty('--megulit-en-stroke-color',preferences.englishOutlineColor);
    root.setProperty('--tomoyo-jp-weight', preferences.japaneseBold?'700':'400');
    root.setProperty('--tomoyo-cn-weight', preferences.chineseBold?'700':'400');
    /* Immersive mode (#79): the translation stays blurred until the pointer is over it */
    /* E416 (user 2026-11-11: every display mode). Translations are blurred wherever MeguLit draws them (dialogue, full page, choices); the rule is !important and more specific than the outline filter that overrode it. Overlays let clicks through (pointer-events:none), so :hover never fires there: the pointer position decides, from mousemove on the document. When the game itself draws the translation, hook-native stops that while blur is on, since the game's pixels cannot be blurred. */if(!document.getElementById('megulit-translation-blur-style')){
     const st=document.createElement('style');st.id='megulit-translation-blur-style';const T=['.tomoyo-cn-output','.megulit-choice-cn'],on=T.map(t=>'html.megulit-translation-blur body '+t+',html.megulit-translation-blur body.tomoyo-gal-bound '+t).join(','),
     shown=T.map(t=>'html.megulit-translation-blur body '+t+'.megulit-reveal,html.megulit-translation-blur body.tomoyo-gal-bound '+t+'.megulit-reveal,html.megulit-translation-blur body.tomoyo-gal-bound '+t+':hover').join(',');
     st.textContent=on+'{filter:blur(7px)!important;transition:filter .18s ease!important}'+shown+'{filter:var(--tomoyo-gal-cn-filter,none)!important}';document.head.append(st);
     let readingSent=0;/* #134 (user: reading a word card's context explanation, a long one, the embedded subtitles vanished): while a look-up card or the selection card is open the reader is reading, wherever the pointer is; without this the marker rule hid the layer 8 s after the game's wait marker went out of sight */setInterval(()=>{
     if(document.hidden||!document.body.classList.contains('tomoyo-gal-bound')||Date.now()-readingSent<1200)return;for(const n of document.querySelectorAll('.tomoyo-selection-card,.tooltip-entries')){
     const r=n.getBoundingClientRect();if(r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden'){readingSent=Date.now();try{window.__tomoyoTranslateRequest(JSON.stringify({
     type:'readerReading'}));}catch{}break;}}},1000);document.addEventListener('mousemove',e=>{/* Issue 127: the pointer on MeguLit's own text keeps the layer up (core/immersion.cjs reading) */{
     const now=Date.now();if(now-readingSent>800&&document.body.classList.contains('tomoyo-gal-bound')){for(const n of document.querySelectorAll('.sentence-text,'+T.join(','))){
     const r=n.getBoundingClientRect();if(r.width>0&&e.clientX>=r.left-6&&e.clientX<=r.right+6&&e.clientY>=r.top-6&&e.clientY<=r.bottom+6){readingSent=now;try{window.__tomoyoTranslateRequest(JSON.stringify({
     type:'readerReading'}));}catch{}break;}}}}if(!document.documentElement.classList.contains('megulit-translation-blur'))return;for(const n of document.querySelectorAll(T.join(','))){
     const r=n.getBoundingClientRect(),inside=r.width>0&&e.clientX>=r.left-6&&e.clientX<=r.right+6&&e.clientY>=r.top-6&&e.clientY<=r.bottom+6;n.classList.toggle('megulit-reveal',
     inside);}},{passive:true});}
    document.documentElement.classList.toggle('megulit-translation-blur',preferences.translationBlur===true);
    const translated=document.querySelector('.tomoyo-cn-output');if(translated){translated.style.setProperty('font-weight',preferences.chineseBold?'700':'400','important');
     translated.style.setProperty('font-synthesis','weight','important');}
    root.setProperty('--tomoyo-gal-color', preferences.textColor);root.setProperty('--tomoyo-gal-read-color', preferences.readTextColor||preferences.textColor);
    gradientOutline('jp',preferences.japaneseOutline,preferences.japaneseOutlineWidth*gameScale,preferences.japaneseOutlineColor);
    gradientOutline('cn',preferences.chineseOutline,preferences.chineseOutlineWidth*gameScale,preferences.chineseOutlineColor);
    const unreadPaint=appearance.paintFor(preferences),readPaint=appearance.paintFor(preferences,true);
    for(const [key,value]of Object.entries(appearance.paintVariables(unreadPaint)))root.setProperty(key,value);
    for(const [key,value]of Object.entries(appearance.paintVariables(readPaint)))root.setProperty(key.replace('--tomoyo-gal-','--tomoyo-gal-read-'),value);
    root.setProperty('--tomoyo-gal-gradient',unreadPaint.gradient);root.setProperty('--tomoyo-gal-fill',unreadPaint.fill);
    root.setProperty('--tomoyo-gal-read-gradient',readPaint.gradient);root.setProperty('--tomoyo-gal-read-fill',readPaint.fill);
    root.setProperty('--tomoyo-gal-shadow', appearance.shadowFor(preferences.textColor, preferences.shadow));
    root.setProperty('--tomoyo-gal-mask', preferences.maskColor);
    if (preferences.style !== 'custom') {
      root.setProperty('--tomoyo-gal-jp-font', appearance.fonts[preferences.style].ja);
      root.setProperty('--tomoyo-gal-cn-font', appearance.fonts[preferences.style].zh);
    }
    root.setProperty('--tomoyo-gal-jp-font',appearance.japaneseFonts[preferences.japaneseFont]||(/^engine:/.test(preferences.japaneseFont||'')?(/ゴシック|gothic|sans|meiryo|メイリオ/i.test(preferences.japaneseFont)?'"'+preferences.japaneseFont.slice(7)+'","MS Gothic","ＭＳ ゴシック",sans-serif':'"'+preferences.japaneseFont.slice(7)+'","MS Mincho","ＭＳ 明朝",serif'):appearance.japaneseFonts.originalGothic));
    root.setProperty('--tomoyo-gal-cn-font',appearance.chineseFonts[preferences.chineseFont]);
    root.setProperty('--tomoyo-ruby-font',appearance.japaneseFonts[preferences.rubyFont]|| (preferences.rubyFont==='round'?'Meiryo,\"Yu Gothic UI\",sans-serif':preferences.rubyFont==='inherit'?appearance.japaneseFonts[preferences.japaneseFont]:appearance.japaneseFonts[preferences.rubyFont==='mincho'?'originalMincho':'originalGothic']));
    document.body.classList.toggle('tomoyo-game-style', preferences.interfaceMode==='translation' && preferences.style !== 'custom');
    document.body.classList.toggle('tomoyo-gal-ja-only', preferences.interfaceMode==='translation' && preferences.display === 'japanese');
    /* E285 (user: English counterparts, and a way to show nothing while the game draws the translation itself) */
    document.body.classList.toggle('tomoyo-gal-zh-only', preferences.interfaceMode==='translation' && (preferences.display === 'chinese' || preferences.display === 'english'));
    document.body.classList.toggle('tomoyo-gal-none', preferences.interfaceMode==='translation' && preferences.display === 'none');
    bridge.quietTranslation = preferences.style !== 'custom';
    bridge.setTranslationVisible(preferences.display !== 'japanese' && preferences.display !== 'none');
    document.body.classList.toggle('tomoyo-gal-bound', bound);
    document.body.classList.toggle('tomoyo-gal-mask', bound && preferences.maskMode === 'full');bridge.islandPage?.refresh();
    markReader();
    alignText();
    bridge.applyTransparency?.();
    updateRuby();bridge.islandPage?.refresh();
  }
  // Interface for automatic/manual game-style measurement. The sampler reports supported measured values and
  // calls this to apply them. Every field is optional; units follow game-style.js: x / y in percent of the game
  // client, japaneseSize and japaneseSpacingPx in px of a 1280-wide game, lineHeight as a signed adjustment from the 1.95 em baseline,
  // colours as #rrggbb. The text colour in use becomes the "restore previous colour" entry, and the result is saved
  // like the menu's save button. Returns the settings that changed.
  bridge.applyGameStyle = (style = {}) => {
    const map = { textColor:'textColor',textGradient:'textGradient',textGradientTop:'textGradientTop',textGradientBottom:'textGradientBottom',readTextColor:'readTextColor',
     readTextGradient:'readTextGradient',readTextGradientTop:'readTextGradientTop',readTextGradientBottom:'readTextGradientBottom', outlineColor:'japaneseOutlineColor',
     x:'x', y:'y', japaneseSize:'japaneseSize', japaneseSpacingPx:'japaneseSpacingPx', lineHeight:'lineHeight', width:'width', height:'height', paddingX:'paddingX',
     paddingY:'paddingY', autoScale:'autoScale', japaneseFont:'japaneseFont', japaneseBold:'japaneseBold', japaneseOutline:'japaneseOutline', japaneseOutlineWidth:'japaneseOutlineWidth',
     translationSize:'translationSize', chineseSpacingPx:'chineseSpacingPx' };
    const next = { ...preferences };
    for (const [from,to] of Object.entries(map)) if (style[from] !== undefined && style[from] !== null) next[to] = style[from];
    if (style.outlineColor) next.japaneseOutline = true;
    if(Number.isFinite(style.lineHeight))next.lineHeight=style.lineHeight-1.95;
    const cleaned = appearance.clean(next), changed = {};
    for (const key of Object.values(map).concat('japaneseOutline')) if (cleaned[key] !== preferences[key]) changed[key] = cleaned[key];
    if (changed.textColor) try { localStorage.setItem('tome-previous-text-color', preferences.textColor); } catch {}
    if(commitSynchronizedStyle)commitSynchronizedStyle(changed);syncOpenForm(changed);
    preferences = cleaned; localStorage.setItem('tomoyo-gal-settings', JSON.stringify({...preferences,translationPrompt:undefined})); send({ type:'galConfigure',
     settings:preferences }); apply();
    return changed;
  };
  // Settings saved for one game (style sync profile) applied as they are, then saved like the menu's save button.
  // Values applied from outside the menu (style sync, saved game style) also go into an open menu's fields and its
  // saved snapshot; otherwise the next preview would rebuild settings from the stale fields (the synced colour turned
  // back to black as soon as the outline was touched) and Cancel would undo the sync.
  let syncingForm=false;
  const syncOpenForm = values => { const dialog = document.querySelector('.tomoyo-cn-dialog[open]'); if (!dialog) return;
    syncingForm=true;try{for (const [key, value] of Object.entries(values)) { const name = key === 'translationSize' ? 'ChineseSize' : key[0].toUpperCase()+key.slice(1),
     field = dialog.querySelector('[name="gal'+name+'"]'); if (!field) continue; if (field.type === 'checkbox') field.checked = !!value; else field.value = key==='readTextColor'&&!value?preferences.textColor:key==='japaneseFont'&&preferences.japaneseFontSource!=='user'&&field.querySelector?.('option[value="@game"]')?'@game':value;
     field.dispatchEvent(new Event('input', { bubbles:true })); }}finally{syncingForm=false;} };
  // Interface mode and window binding are runtime state owned by the launcher: a saved profile, import or form snapshot
  // carrying stale values (interfaceMode normal, bindEnabled false) dropped game style, so colours and embedding stopped.
  const styleOnly = values => { const { interfaceMode, bindEnabled, gameProcess, ...rest } = values || {}; return rest; };
  bridge.applyGalPreferences = (values = {}, options = {}) => { values = styleOnly(values); preferences = appearance.clean({ ...preferences, ...values }); const applied = {
   }; for (const key of Object.keys(values)) if (preferences[key] !== undefined) applied[key] = preferences[key]; if (!options.preview&&commitSynchronizedStyle) commitSynchronizedStyle(applied);
   syncOpenForm(applied); if(!options.preview)localStorage.setItem('tomoyo-gal-settings', JSON.stringify({...preferences,translationPrompt:undefined})); if(options.preview)send({
   type:'galPreview',settings:preferences});else if(options.persist!==false)send({ type:'galConfigure', settings:preferences }); apply(); return { ...preferences };
   };
  bridge.galPreferences = () => ({ ...preferences });
  /* 2026-11-12 values the engine told us (its own font): applied and kept like a choice in the menu */
  bridge.enginePreferences=m=>{try{if(m&&m.values&&typeof m.values==='object')bridge.applyGalPreferences(m.values,{persist:true});}catch{}};
  bridge.workTranslationPrompt=(key,prompt)=>{bridge.workPromptKey=key;bridge.applyGalPreferences({translationPrompt:prompt},{persist:false});};
  bridge.workPromptSaveFailed=()=>{const hint=document.querySelector('[name=galTranslationPrompt]')?.parentElement.querySelector('small');if(hint)hint.textContent=({
   zh:'提示词保存失败，请重试',ja:'追加指示を保存できませんでした',en:'Could not save the prompt. Try again'})[document.documentElement.lang.slice(0,2)];};
  // Live position tracking (text-position.js): moves the text box for the current line without saving each move.
  bridge.galLayoutInfo = () => layoutInfo ? { ...layoutInfo } : null;
  bridge.previewGalPosition = values => { preferences = appearance.clean({ ...preferences, ...styleOnly(values) }); send({ type:'galPreview', settings:preferences });
   apply(); };
  bridge.restoreGalSettings = saved => { for (const key of Object.keys(defaults)) if (saved?.[key] !== undefined) preferences[key] = saved[key]; localStorage.setItem('tomoyo-gal-settings',
   JSON.stringify({...preferences,translationPrompt:undefined})); apply(); };
  bridge.galStatus = message => {
    if(message?.type==='modeRequest'){if(window.__tomoyoMode?.requestToggle)window.__tomoyoMode.requestToggle();else send({type:'galToggleMode'});return;}
    if(message?.type==='regionApplied'){window.dispatchEvent(new CustomEvent('tome-region-applied',{detail:message}));return;}
    if(typeof message.hookActive==='boolean'){bridge.hookActive=message.hookActive;if(!message.hookActive)bridge.hookSourceText='';}
    if(typeof message.hookSource==='string'){bridge.hookSourceText=message.hookSource;bridge.hookSpeaker=typeof message.hookSpeaker==='string'?message.hookSpeaker:'';
     }
    if(message.hookRubyDict&&typeof message.hookRubyDict==='object')bridge.gameRuby=message.hookRubyDict;
    /* Borrowed-code (Chinese patch) text was dropped: say why in the sentence window; the next real line clears it. */
    if(message.hookNotice){let n=document.querySelector('.megulit-hook-notice');const host=document.querySelector('.sentence-window');if(host&&!n){n=document.createElement('div');
     n.className='megulit-hook-notice';n.setAttribute('role','status');n.style.cssText='font:13px/1.6 Meiryo,"Microsoft YaHei",sans-serif;color:#ffd9a8;background:rgba(40,20,10,.72);border:1px solid rgba(255,190,120,.35);border-radius:8px;padding:6px 10px;margin-top:8px;pointer-events:none;text-shadow:none;-webkit-text-stroke:0;';
     host.appendChild(n);}if(n)n.textContent=message.hookNotice;}
    if(typeof message.hookSource==='string'&&message.hookSource)document.querySelector('.megulit-hook-notice')?.remove();
    /* E285: the translation tab says when the imported script supplies the translations (the engine still covers the rest). */
    if(typeof message.scriptSource==='boolean'){document.body.classList.toggle('megulit-script-source',message.scriptSource);if(!document.getElementById('megulit-script-source-style')){
     const st=document.createElement('style');st.id='megulit-script-source-style';st.textContent='.megulit-script-toggle{display:none!important}body.megulit-script-source .megulit-script-toggle{display:flex!important}.megulit-script-hint{display:none;margin:0 0 8px;padding:8px 10px;border-radius:8px;background:rgba(92,184,120,.1);color:#bfe8c8;font-size:12px;line-height:1.5}body.megulit-script-source .megulit-script-hint{display:block}';
     document.head.append(st);}}
    if(typeof message.embedTranslating==='boolean'){document.body.classList.toggle('megulit-embed-translation',message.embedTranslating);if(!document.getElementById('megulit-embed-translation-style')){
     const st=document.createElement('style');st.id='megulit-embed-translation-style';st.textContent='body.megulit-embed-translation .tomoyo-cn-output{display:none!important}';
     document.head.append(st);}}
    if(message.hookMessage)bridge.hookMessage=message.hookMessage;if(message.waitMarkerMessage){bridge.waitMarkerMessage=message.waitMarkerMessage;if(dialogFields?.waitMarkerState)dialogFields.waitMarkerState.textContent=message.waitMarkerMessage;
     }
    if(message.hookThreads)bridge.hookThreads=message.hookThreads;
    if(dialogFields?.hookState&&message.hookMessage)dialogFields.hookState.textContent=message.hookMessage;
    if(dialogFields?.hookThreads&&message.hookThreads){const select=dialogFields.hookThreads,previous=select.value;select.replaceChildren(new Option('选择对话文本流',''));
     for(const item of message.hookThreads)select.add(new Option(item.name+/* glyph hide: 仅读取 -> trying while the DLL has not hidden a draw yet -> 隐藏原文 once it did */(item.hideOnly?' [隐藏原文]':item.embeddable?' [可清空]':item.hideTrying?' [仅读取 · 尝试隐藏原文]':' [仅读取]')+' · '+(item.sample||'推进一句以查看内容'),item.id));select.value=message.hookThreads.find(t=>t.selected)?.id||previous;
     }
    if(['normal','translation'].includes(message.interfaceMode)){
      preferences.interfaceMode=message.interfaceMode;
      localStorage.setItem('tomoyo-gal-settings',JSON.stringify(preferences));
      window.__tomoyoMode?.set(message.interfaceMode,message.type==='interfaceMode');
    }
    if(message.type==='gameClosed')window.__tomoyoMode?.gameClosed?.();
    if (typeof message.coverEnabled === 'boolean') document.body.classList.toggle('tomoyo-cover-hidden',!message.coverEnabled);
    /* Issue 127 (user): Alt+H hides MeguLit's layer, but the game drew the current line blank, so its original only comes back with the next line. Say so, and where to show only the original or only the translation instead. */
    if (typeof message.coverEnabled === 'boolean') { const was=document.body.dataset.megulitCover; document.body.dataset.megulitCover=String(message.coverEnabled);
     document.querySelector('.megulit-cover-hint')?.remove(); if (!message.coverEnabled && was!=='false') { const lang=(window.__tomeI18n?.get?.()||document.documentElement.lang||'zh').slice(0,
     2), words={zh:['已隐藏 MeguLit 字幕','这一句游戏已经画成空白，原文要从下一句起才由游戏显示。只想看原文或只看译文：按 Alt+T，在「显示内容」里切换。'],en:['MeguLit subtitles hidden','The game already drew this line blank: its original shows again from the next line. To see only the original or only the translation, press Alt+T and change “Show”.'],
     ja:['MeguLit の字幕を隠しました','この行はゲーム側で空白として描画済みのため、原文は次の行から表示されます。原文だけ・訳文だけにしたいときは Alt+T の「表示内容」で切り替えてください。']}[lang]||null; const w=words||['已隐藏 MeguLit 字幕','这一句游戏已经画成空白，原文要从下一句起才由游戏显示。只想看原文或只看译文：按 Alt+T，在「显示内容」里切换。'];
     const tip=document.createElement('div'); tip.className='megulit-cover-hint'; tip.dataset.noI18n=''; tip.setAttribute('role','status'); tip.style.cssText='position:fixed;left:50%;bottom:9%;transform:translateX(-50%);z-index:2147483000;max-width:min(560px,86vw);padding:12px 18px;border-radius:12px;background:rgba(18,12,14,.92);color:#f3e6da;font:400 13.5px/1.65 "Microsoft YaHei",sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.45);pointer-events:none;transition:opacity .3s';
     const b=document.createElement('b'); b.textContent=w[0]; b.style.cssText='display:block;margin-bottom:4px;font-weight:600'; const t=document.createElement('span');
     t.textContent=w[1]; tip.append(b,t); document.body.append(tip); setTimeout(()=>{tip.style.opacity='0';setTimeout(()=>tip.remove(),350);},7000); } }
    if (typeof message.bound === 'boolean') { bound = message.bound; if(!bound){maskImage?.remove();maskImage=null;maskGeometry=null;} apply(); }
    // Binding keeps the menu open; the window was just resized to the game, so report the click regions again.
    if(message.activateGame===true&&message.bound===true)window.__tomoyoHitRegionsRefresh?.(true);
    if (message.layout) bridge.galLayout(message.layout);
    if (dialogFields && message.message) dialogFields.state.textContent = message.message;
    if (message.maskMessage) { bridge.maskMessage = message.maskMessage; if (dialogFields) dialogFields.maskState.textContent = message.maskMessage; }
    if (dialogFields && message.windows) {
      const select = dialogFields.game;
      select.replaceChildren(new Option('选择正在运行的游戏窗口', ''));
      for (const item of message.windows) select.add(new Option(item.title + ' [' + item.processName + ']', item.hwnd));
    }
  };
  const open = bridge.openSettings;
  bridge.openSettings = () => {
    open();
    send({type:'galMenu',open:true});
    const dialog = document.querySelector('.tomoyo-cn-dialog:not([data-leaving])');
    if (!dialog || dialog.querySelector('.tomoyo-gal-fields')) return;
    const group = document.createElement('fieldset');
    group.className = 'tomoyo-gal-fields';
    group.innerHTML = `<legend>Gal 通用阅读</legend>
      <label><input type="checkbox" name="galFurigana">汉字上方自动注音（本地）</label>
      <label>日文字号<input type="number" name="galJapaneseSize" min="14" max="60"></label>
      <label>版式预设<select name="galPreset"><option value="custom">自定义位置</option><option value="bottom">底部对话框（ADV）</option><option value="full">全屏文本（NVL）</option><option value="top">画面上方字幕</option></select></label>
      <label>游戏窗口<select name="galGame"><option value="">点击刷新选择窗口</option></select></label>
      <button type="button" data-gal-refresh>刷新窗口</button><button type="button" data-gal-bind>绑定此窗口</button><button type="button" data-gal-unbind>解除绑定</button>
      <small class="tomoyo-hotkey-hint" data-gal-bind-hint>内嵌没生效，或译文、对话框位置乱跑（部分紫社等作品自动识别不准）：展开「窗口绑定（高级）」，选中游戏窗口，点「绑定此窗口」手动绑定即可</small>
      <div class="tomoyo-cn-grid"><label>文本框左边距<input type="number" name="galX" min="0" max="95" step="0.1"></label><label>文本框上边距<input type="number" name="galY" min="0" max="95" step="0.1"></label><label>文字换行宽度<input type="number" name="galWidth" min="20" max="100" step="0.1"></label><input type="hidden" name="galHeight"><small class="tome-manual-region-hint">显示区域随实际文字增长，高度自动调整</small><small class="tome-island-layout-hint">按原文位置排布，文字可自然延伸到游戏窗口外</small></div>
      <button type="button" data-gal-drag>拖动文本框</button>
      <div class="tome-position-sync"><button type="button" data-gal-position-sync>同步位置</button><small data-position-state></small></div>
      <div class="tome-game-style-sync"><label class="tome-auto-style-switch"><input type="checkbox" name="galAutoGameStyle">自动同步游戏原文样式</label><button type="button" data-game-style-sync>从游戏同步</button><small data-game-style-state></small></div>
      <label>原文替换方式<select name="galMaskMode"><option value="hook">Hook 引擎与原文替换内嵌</option></select></label>
      <label class="tome-auto-style-switch" data-embed-translation><input type="checkbox" name="galEmbedTranslation">译文由游戏自己显示（写回游戏文本框）</label>
      <small class="tomoyo-hotkey-hint">开启后游戏文本框直接显示译文，位置和字体都由游戏自己处理；Alt+H 只开关 MeguLit 自己的显示，不影响游戏写回的译文</small>
      <small class="tomoyo-hotkey-hint" data-mask-hotkey><kbd>Alt+H</kbd> 随时一键关闭 / 恢复内嵌（连同全部 MeguLit 覆盖），用来对比游戏原文；开着「译文由游戏自己显示」时，游戏里的译文不受 Alt+H 影响，只由这个开关控制</small>
      <div data-gal-hook-options><label>对话文本流<select name="galHookThread"><option value="">先绑定游戏并推进一句</option></select></label><button type="button" data-gal-hook-select>使用这条对话流</button><div class="tomoyo-hook-state" role="status"></div><small>选择前请核对内容是完整对话。仅读取的流可以显示台词，不能清空游戏原文；可清空的流仅在覆盖模式启用替换。Alt+H 隐藏覆盖或 Alt+M 返回普通界面会关闭替换，台词读取继续。</small></div>
      <label data-gal-full-color>整块底板颜色<input type="color" name="galMaskColor"></label>
      <label><input name="galRelocateWaitMarker" type="checkbox">将原等待符移到 MeguLit 句末</label>
      <label><input name="galHideWaitMarker" type="checkbox">隐藏点击等待图标</label>
      <details><summary>局部模糊与原文字扫描范围</summary>
        <label><input type="checkbox" name="galScanAuto">扫描范围自动跟随文字框（推荐；随窗口移动、缩放和全屏自动调整，整页游戏自动扫整个画面）</label>
        <label><input type="checkbox" name="galFastMask">极速预遮（先沿用原文位置，随后识别校正）</label>
        <label>遮字外观<select name="galMaskStyle"><option value="blend">融合对话框背景（推荐）</option><option value="blur">模糊遮字</option></select></label>
        <small>扫描的是游戏原文字位置，与上方新文字位置分开；百分比相对游戏画面<br>只遮挡 OCR 匹配到的原文词块；未识别的字可能漏遮，不会自动铺整块底板</small>
        <div class="tomoyo-cn-grid"><label>扫描左边距<input name="galScanX" type="number" min="0" max="95"></label><label>扫描上边距<input name="galScanY" type="number" min="0" max="95"></label><label>扫描宽度<input name="galScanWidth" type="number" min="5" max="100"></label><label>扫描高度<input name="galScanHeight" type="number" min="5" max="100"></label><label>模糊强度<input name="galBlurRadius" type="number" min="5" max="30"></label><label>遮字扩边 px<input name="galMaskPadding" type="number" min="0" max="10"></label></div>
      </details>
      <small>局部模糊只在本机处理游戏画面，不额外调用翻译 API；部分游戏可能无法读取<br>遮罩随游戏移动，不接收点击；这不会关闭游戏内部的文字绘制</small>
      <div class="tomoyo-mask-state" role="status"></div>
      <div class="tomoyo-gal-state" role="status"></div>`;
    const form = dialog.querySelector('form');
    group.querySelector('legend').textContent = '画面与排版';
    group.querySelector('legend').insertAdjacentHTML('afterend', `
      <label>字体搭配<select name="galStyle"><option value="classic">MS Mincho（日文明朝）／素晴汉化字体</option><option value="clean">MS Gothic（日文黑体）／素晴汉化字体</option><option value="custom">自定义 · 沿用下方译文设置</option></select></label>
      <div class="tomoyo-cn-grid"><label><input name="galJapaneseBold" type="checkbox">日文加粗</label><label><input name="galChineseBold" type="checkbox">中文加粗</label><label title="译文默认模糊，鼠标移上去才显示"><input name="galTranslationBlur" type="checkbox">译文模糊（悬停显示）</label></div>
      <label><input name="galTypewriter" type="checkbox">文字逐字显示</label>
      <label>显示速度（字/秒）<input name="galTypewriterSpeed" type="number" min="5" max="120" step="1"></label>
      <small>点击游戏或按空格可补全当前文字；按住 Ctrl 快速显示，不拦截游戏操作</small>
      <label>显示内容<select name="galDisplay"><option value="bilingual">日文＋假名／中文</option><option value="japanese">仅日文＋假名</option><option value="chinese">仅中文 · 接近汉化版</option><option value="bilingual-en">日文＋假名／英文</option><option value="english">仅英文</option><option value="none">不显示（只看游戏文本框）</option></select></label>
      <div class="tomoyo-cn-grid tomoyo-type-sizes"><label>中文字号<input name="galChineseSize" type="number" min="12" max="60"></label></div>
      <div class="tomoyo-cn-grid"><label>未读渐变<input name="galTextGradient" type="checkbox"></label><label>已读渐变<input name="galReadTextGradient" type="checkbox"></label><label>未读渐变上色<input name="galTextGradientTop" type="color"></label><label>未读渐变下色<input name="galTextGradientBottom" type="color"></label><label>已读渐变上色<input name="galReadTextGradientTop" type="color"></label><label>已读渐变下色<input name="galReadTextGradientBottom" type="color"></label><label>未读渐变起点（%）<input name="galTextGradientStart" type="number" min="0" max="95" step="1"></label><label>已读渐变起点（%）<input name="galReadTextGradientStart" type="number" min="0" max="95" step="1"></label></div>
      <div class="tomoyo-cn-grid"><label>文字颜色<input name="galTextColor" type="color"></label><label>已读文字颜色<input name="galReadTextColor" type="color"></label><label>文字阴影<select name="galShadow"><option value="outline">细描边 · 适合复杂背景</option><option value="soft">柔和阴影</option><option value="none">无阴影</option></select></label></div>
      <label><input name="galAutoScale" type="checkbox">字号跟随游戏窗口缩放</label>
      <details class="tomoyo-gal-spacing"><summary>行距与留白</summary><div class="tomoyo-cn-grid">
        <label>日文行距调整<input name="galLineHeight" type="number" min="-1.9" max="4" step="0.05"></label>
        <label>译文行距<input name="galTranslationLineHeight" type="number" min="-0.8" max="3" step="0.05"></label><label>原文与译文间距<input name="galGap" type="number" min="-28" max="40"></label><label>译文换行宽度（0 = 跟随日文）<input name="galTranslationWidth" type="number" min="0" max="100"></label><label>左右留白<input name="galPaddingX" type="number" min="-200" max="200"></label><label>上下留白<input name="galPaddingY" type="number" min="-40" max="60"></label>
      </div></details>
      <small>绑定游戏后，MeguLit 会自动到游戏根目录查找原版日文字体和汉化中文字体并导入；导入的字体会以「字体名（游戏名原版／汉化）」出现在下面的日文、中文字体选项里，上方的指示灯变绿表示已经在用游戏原版字体。找不到时可点「重新查找游戏字体」<br>仅中文模式仍需在翻译页开启中文翻译</small>`);
    group.querySelector('.tomoyo-type-sizes').prepend(group.querySelector('[name=galJapaneseSize]').closest('label'));
    // Furigana position sliders sit directly under the furigana switch instead of inside a collapsed section.
    const rubyBlock=document.createElement('div');rubyBlock.className='tomoyo-ruby-position';
    rubyBlock.innerHTML='<div class="tomoyo-ruby-size"><label>假名大小（相对正文）<input name="galRubyScale" type="number" min="0.2" max="0.85" step="0.01"></label></div><div class="tomoyo-cn-grid"><label>假名水平位置 X（右＋，px）<input name="galRubyOffsetX" type="number" min="-40" max="40" step="0.5"></label><label>假名垂直位置 Y（下＋，px）<input name="galRubyOffsetY" type="number" min="-100" max="100" step="0.5"></label><div class="megulit-ruby-rows" data-ruby-rows><span class="megulit-ruby-rows-title">按行微调 Y</span><div class="megulit-ruby-rows-chips" role="tablist"></div><output class="megulit-ruby-rows-value">0</output><input type="range" class="megulit-ruby-rows-slider" min="-60" max="60" step="0.5" value="0" aria-label="所选行的假名垂直位置"><input type="hidden" name="galRubyRowOffsets"><span class="megulit-ruby-rows-title">按行微调 X</span><span></span><output class="megulit-ruby-rows-value" data-axis-x>0</output><input type="range" class="megulit-ruby-rows-slider" data-axis-x min="-60" max="60" step="0.5" value="0" aria-label="所选行的假名水平位置"><input type="hidden" name="galRubyRowOffsetsX"></div></div><label><input name="galRubyOutline" type="checkbox">假名描边</label><div class="tomoyo-cn-grid"><label>假名描边颜色<input name="galRubyOutlineColor" type="color"></label><label>假名描边粗细<input name="galRubyOutlineWidth" type="number" min="0" max="2" step="0.05"></label></div>';
    const rubyMenu=document.createElement('details');rubyMenu.className='tomoyo-ruby-menu';rubyMenu.innerHTML='<summary>注音字体与描边</summary>';
    const furiganaLabel=group.querySelector('[name=galFurigana]').closest('label');furiganaLabel.before(rubyMenu);rubyMenu.append(furiganaLabel,rubyBlock);
    const layout = document.createElement('details');
    layout.className = 'tomoyo-gal-layout';
    layout.innerHTML = '<summary>游戏窗口与对话框位置</summary>';
    let layoutNode = group.querySelector('[name=galPreset]').closest('label');
    while (layoutNode && !layoutNode.classList?.contains('tomoyo-gal-state')) {
      const next = layoutNode.nextSibling; layout.appendChild(layoutNode); layoutNode = next;
    }
    if (!bound) layout.open = true;
    group.insertBefore(layout, group.querySelector('.tomoyo-gal-state'));
    form.insertBefore(group, form.querySelector('[name=enabled]').closest('label'));
    group.insertAdjacentHTML('beforeend', `
      <details><summary>日文字体与描边</summary>
      <label>日文字体<select name="galJapaneseFont"><option value="originalGothic">MS Gothic（原版字体·黑体）</option><option value="originalMincho">MS Mincho（原版字体·明朝）</option><option value="yuMincho">游明朝</option><option value="yuGothic">游黑体</option><option value="meiryo">Meiryo</option></select></label><label>日文字距（px）<input name="galJapaneseSpacingPx" type="number" min="-15" max="25" step="0.25"></label>
      <label>注音字体<select name="galRubyFont"><option value="round">Meiryo（圆滑清晰假名）</option><option value="gothic">MS Gothic（原版字体·清晰假名）</option><option value="mincho">MS Mincho（原版字体·明朝）</option><option value="inherit">跟随日文字体</option></select></label>
      <label><input name="galJapaneseOutline" type="checkbox">开启日文描边</label>
      <div class="tomoyo-cn-grid"><label>日文描边颜色<input name="galJapaneseOutlineColor" type="color"></label><label>日文描边粗细<input name="galJapaneseOutlineWidth" type="number" min="0" max="4" step="0.1"></label></div>
      <small>带「原版」字样的是当前游戏自带或引擎默认的字体；MS Gothic / MS Mincho 是 BGI、YU-RIS 等引擎的默认字体，游戏里用哪套以游戏设置为准</small></details>
      <details><summary>中文字体与描边</summary>
      <label>中文字体<select name="galChineseFont"><option value="patch">素晴日汉化 font.ttf（原版字体·汉化）</option><option value="simhei">系统黑体</option><option value="yahei">微软雅黑</option><option value="simsun">宋体</option><option value="kaiti">楷体</option></select></label><label>中文字距（px）<input name="galChineseSpacingPx" type="number" min="-15" max="25" step="0.25"></label>
      <label><input name="galChineseOutline" type="checkbox">开启中文描边</label>
      <div class="tomoyo-cn-grid"><label>中文描边颜色<input name="galChineseOutlineColor" type="color"></label><label>中文描边粗细<input name="galChineseOutlineWidth" type="number" min="0" max="4" step="0.1"></label></div>
      <small>汉化字体按本机原始字形校正 Unicode 映射，缺字使用黑体补齐</small></details>`);
    // Same shape as the Japanese and translation sections: font first, then size, X | Y, colour | width; no hint line.
    rubyMenu.querySelector('summary').after(group.querySelector('[name=galRubyFont]').closest('label'));
    const english=document.createElement('details');english.dataset.megulitEnglish='';english.dataset.noI18n='';
    const en=({
      zh:['英文设置','独立设置拉丁字母','字体','跟随正文','字号','字距（px）','加粗','描边','描边颜色','描边宽度'],
      en:['English typography','Style Latin letters separately','Font','Follow body text','Size','Letter spacing (px)','Bold','Outline','Outline colour','Outline width'],
      ja:['英字設定','英字を個別に設定','フォント','本文に合わせる','サイズ','字間（px）','太字','縁取り','縁取りの色','縁取りの幅']
    })[document.documentElement.lang.slice(0,2)]||[];
    const fields=[
      ['Enabled','checkbox'],['Font','select'],['Size','number',12,60,.5],['SpacingPx','number',-15,25,.25],
      ['Bold','checkbox'],['Outline','checkbox'],['OutlineColor','color'],['OutlineWidth','number',0,4,.1]
    ];
    const enSummary=document.createElement('summary');enSummary.textContent=en[0]||'English';english.append(enSummary);
    const fieldLabels=[en[1],en[2],en[4],en[5],en[6],en[7],en[8],en[9]];
    for(const [index,[key,type,min,max,step]] of fields.entries()){
      const label=document.createElement('label'),input=document.createElement(type==='select'?'select':'input');
      input.name='galEnglish'+key;label.textContent=fieldLabels[index]||key;
      if(type==='select'){
        for(const [id,family] of appearance.fontOptions.englishFont)input.add(new Option(family||en[3]||'Inherit',id));
        input.addEventListener('change',()=>{if(input.value==='inherit')return;const enabled=form.elements.namedItem('galEnglishEnabled');if(!enabled.checked){enabled.checked=true;
         enabled.dispatchEvent(new Event('input',{bubbles:true}));}});
      }else{input.type=type;if(type==='number'){input.min=min;input.max=max;input.step=step;}}
      if(type==='checkbox')label.prepend(input);else label.append(input);
      english.append(label);
    }
    group.append(english);
    const f = name => form.elements.namedItem(name);
    f('galStyle').closest('label').hidden=true;
    f('galShadow').closest('label').hidden=true;
    const uiCopy={zh:['自定义翻译提示词','追加到默认提示词，当前作品独立保存，仅用于大模型。可填写术语、人名译法和语气','选项字体','跟随原版','已选颜色','未选颜色','恢复原版配色'],en:['Custom translation instructions','Appended to the default prompt for this game and used by language models. Add terms, names, or tone preferences.',
     'Choice font','Follow game','Selected colour','Unselected colour','Restore game colours'],ja:['翻訳用の追加指示','既定の指示に追加され、作品ごとに保存されます。言語モデル用の用語や文体を指定できます','選択肢のフォント',
     '原版に合わせる','選択済みの色','未選択の色','原版の配色に戻す']}[document.documentElement.lang.slice(0,2)]||[];
    const prompt=document.createElement('label');prompt.dataset.noI18n='';prompt.textContent=uiCopy[0]||'Custom translation instructions';
    const extra=document.createElement('textarea');extra.name='galTranslationPrompt';extra.maxLength=2000;extra.rows=4;prompt.append(extra);
    const hint=document.createElement('small');hint.textContent=uiCopy[1]||'';prompt.append(hint);form.querySelector('[name=contextLines]').closest('label').after(prompt);
    const choice=document.createElement('div');choice.dataset.megulitChoiceFields='';choice.dataset.noI18n='';
    const fontLabel=document.createElement('label'),font=document.createElement('select');font.name='galChoiceFont';fontLabel.textContent=uiCopy[2]||'Choice font';
    for(const [value,label] of [['game',uiCopy[3]||'Follow game'],['originalGothic','MS Gothic'],['originalMincho','MS Mincho'],['yuGothic','Yu Gothic'],['yuMincho',
     'Yu Mincho'],['meiryo','Meiryo']])font.add(new Option(label,value));fontLabel.append(font);choice.append(fontLabel);
    for(const [i,state] of ['Selected','Unselected'].entries()){
      const row=document.createElement('label'),value=document.createElement('input'),picker=document.createElement('input');
      row.textContent=uiCopy[i+4]||state;value.type='hidden';value.name='galChoice'+state+'Color';picker.type='color';picker.setAttribute('aria-label',row.textContent);
      picker.value=preferences['choice'+state+'Color']||'#f0f0f0';picker.addEventListener('input',()=>{value.value=picker.value;});
      value.addEventListener('input',()=>{picker.value=value.value||'#f0f0f0';});row.append(value,picker);choice.append(row);
    }
    const resetChoice=document.createElement('button');resetChoice.type='button';resetChoice.textContent=uiCopy[6]||'Restore game colours';
    resetChoice.onclick=()=>{for(const input of choice.querySelectorAll('input[type=hidden]')){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));
     }};choice.append(resetChoice);group.append(choice);
    const additional = { translationPrompt:'galTranslationPrompt',choiceFont:'galChoiceFont',choiceSelectedColor:'galChoiceSelectedColor',choiceUnselectedColor:'galChoiceUnselectedColor',
     textGradient:'galTextGradient',readTextGradient:'galReadTextGradient',textGradientTop:'galTextGradientTop',textGradientBottom:'galTextGradientBottom',readTextGradientTop:'galReadTextGradientTop',
     readTextGradientBottom:'galReadTextGradientBottom',textGradientStart:'galTextGradientStart',readTextGradientStart:'galReadTextGradientStart',typewriter:'galTypewriter',
     typewriterSpeed:'galTypewriterSpeed', japaneseFont:'galJapaneseFont', chineseFont:'galChineseFont', rubyFont:'galRubyFont', japaneseOutline:'galJapaneseOutline',
     chineseOutline:'galChineseOutline', japaneseOutlineColor:'galJapaneseOutlineColor', chineseOutlineColor:'galChineseOutlineColor', japaneseOutlineWidth:'galJapaneseOutlineWidth',
     rubyOutline:'galRubyOutline', rubyOutlineColor:'galRubyOutlineColor', rubyOutlineWidth:'galRubyOutlineWidth', chineseOutlineWidth:'galChineseOutlineWidth',
     style:'galStyle', display:'galDisplay', translationSize:'galChineseSize', textColor:'galTextColor', shadow:'galShadow', autoScale:'galAutoScale', lineHeight:'galLineHeight',
     translationLineHeight:'galTranslationLineHeight', japaneseSpacingPx:'galJapaneseSpacingPx', chineseSpacingPx:'galChineseSpacingPx', rubyScale:'galRubyScale',
     rubyOffsetX:'galRubyOffsetX',rubyOffsetY:'galRubyOffsetY',rubyRowOffsets:'galRubyRowOffsets',rubyRowOffsetsX:'galRubyRowOffsetsX',embedTranslation:'galEmbedTranslation',
     gap:'galGap', translationWidth:'galTranslationWidth', paddingX:'galPaddingX', paddingY:'galPaddingY', autoGameStyle:'galAutoGameStyle', maskColor:'galMaskColor',
     maskMode:'galMaskMode', scanX:'galScanX', scanY:'galScanY', scanWidth:'galScanWidth', scanHeight:'galScanHeight', blurRadius:'galBlurRadius', maskPadding:'galMaskPadding',
     fastMask:'galFastMask', maskStyle:'galMaskStyle', japaneseBold:'galJapaneseBold', chineseBold:'galChineseBold', translationBlur:'galTranslationBlur' };
    for(const [key] of fields)additional['english'+key[0].toLowerCase()+key.slice(1)]='galEnglish'+key;
    additional.scanAuto='galScanAuto';{const auto=f('galScanAuto'),sync=()=>{for(const n of ['galScanX','galScanY','galScanWidth','galScanHeight'])f(n).disabled=auto.checked;
     };auto.addEventListener('change',sync);setInterval(sync,1000);}additional.relocateWaitMarker='galRelocateWaitMarker';additional.hideWaitMarker='galHideWaitMarker';
     const waitState=document.createElement('div');waitState.className='tomoyo-mask-state';waitState.setAttribute('data-gal-wait-state','');waitState.textContent='这两个开关一般不用开。只有像《素晴らしき日々》那样替换原文后，等待提示符一直在替换过的文字背景下面闪烁、影响阅读时，才推荐打开';
     f('galHideWaitMarker').closest('label').after(waitState);
    for (const [key,name] of Object.entries(additional)) {
      if (typeof defaults[key] === 'boolean') f(name).checked = preferences[key];
      else f(name).value = key==='japaneseFont'&&preferences.japaneseFontSource!=='user'&&f(name).querySelector?.('option[value="@game"]')?'@game':preferences[key];
    }
    f('galReadTextColor').value = preferences.readTextColor || preferences.textColor;
    {const box=group.querySelector('[data-ruby-rows]');if(box){const chips=box.querySelector('.megulit-ruby-rows-chips'),slider=box.querySelector('.megulit-ruby-rows-slider'),
     out=box.querySelector('.megulit-ruby-rows-value'),hidden=f('galRubyRowOffsets'),sliderX=box.querySelector('.megulit-ruby-rows-slider[data-axis-x]'),outX=box.querySelector('.megulit-ruby-rows-value[data-axis-x]'),
     hiddenX=f('galRubyRowOffsetsX');
      if(!Number.isInteger(box.__pick))box.__pick=0;
      const values=(field=hidden)=>String(field?.value||'').split(',').map(n=>Number(n)||0);
      /* E396 one row choice drives both the Y and the X slider; a chip is marked when either axis is set */
      const draw=()=>{const v=values(),vx=values(hiddenX),n=Math.max(2,Math.min(16,window.__megulitRubyRows||2,16),v.length,vx.length);chips.textContent='';for(let i=0;
       i<n;i++){const b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.className='megulit-ruby-row-chip'+(i===box.__pick?' is-on':'')+(v[i]||vx[i]?' is-set':'');
       b.textContent=String(i+1);b.title='第 '+(i+1)+' 行'+(v[i]?' Y '+v[i]+'px':'')+(vx[i]?' X '+vx[i]+'px':'');b.onclick=()=>{box.__pick=i;draw();};chips.append(b);
       }slider.value=String(v[box.__pick]||0);out.textContent=String(v[box.__pick]||0);if(sliderX){sliderX.value=String(vx[box.__pick]||0);outX.textContent=String(vx[box.__pick]||0);
       }};
      if(!box.__bound){box.__bound=true;
      const bind=(range,field,output)=>{if(!range||!field)return;range.addEventListener('input',e=>{e.stopPropagation();const v=values(field);while(v.length<=box.__pick)v.push(0);
       v[box.__pick]=Number(range.value);while(v.length&&!v[v.length-1])v.pop();field.value=v.join(',');output.textContent=range.value;field.dispatchEvent(new Event('input',
       {bubbles:true}));draw();});range.addEventListener('dblclick',()=>{range.value='0';range.dispatchEvent(new Event('input'));});};
      bind(slider,hidden,out);bind(sliderX,hiddenX,outX);
      addEventListener('megulit-ruby-rows',()=>box.__draw?.());}
      /* E276 (user: rows 1, 2 and 3 all moved every row): this block runs on every menu open; each run used to add
         another set of listeners with its own row choice starting at row 1. Listeners are added once, the chosen row
         lives on the box, and draw() is refreshed per open. */
      box.__draw=draw;draw();}}
    let committed = { ...preferences };
    commitSynchronizedStyle=changed=>Object.assign(committed,changed);
    const colorHistoryKey='tome-previous-text-color';
    let previousColor=localStorage.getItem(colorHistoryKey)||'';
    if(!/^#[0-9a-f]{6}$/i.test(previousColor))previousColor='';
    const colorUndo=document.createElement('button');colorUndo.type='button';colorUndo.setAttribute('data-gal-color-undo','');colorUndo.textContent='恢复上一个颜色';colorUndo.disabled=!previousColor;
    f('galTextColor').closest('label').append(colorUndo);
    colorUndo.onclick=()=>{if(!previousColor)return;f('galTextColor').value=previousColor;f('galTextColor').dispatchEvent(new Event('input',{bubbles:true}));};
    f('galFurigana').checked = preferences.furigana; f('galJapaneseSize').value = preferences.japaneseSize;
    for (const [key, name] of Object.entries({ x: 'galX', y: 'galY', width: 'galWidth', height: 'galHeight' })) f(name).value = preferences[key];
    const sliderOutputs = [];
    for(const input of group.querySelectorAll('input[type=number]')){
      const output=document.createElement('output');output.className='tomoyo-slider-value';output.htmlFor=input.name;
      input.type='range';
      input.step='any';
      
      input.insertAdjacentElement('beforebegin',output);
      /* E270 (user: values like 30.597 are too exact to read): the slider keeps full precision, the label is rounded */
      const span=Math.abs(Number(input.max)-Number(input.min))||100,shown=v=>String(span>=10?Math.round(v):Math.round(v*100)/100);
      const update=()=>{input.value=String(Number(Number(input.value).toFixed(3)));output.value=shown(Number(input.value));output.textContent=output.value;};
      /* E270 (user: a slider stopped half way with a no-entry cursor): a drag that strayed over the label selected its text
         and turned into a native text drag; clear the selection and never start one from the settings. */
      input.addEventListener('pointerdown',()=>getSelection()?.removeAllRanges());
      input.addEventListener('input',update);sliderOutputs.push(update);update();
    }
    f('galPreset').onchange = () => {
      const presets = { bottom:{galX:4,galY:70,galWidth:92,galHeight:27}, full:{galX:5,galY:5,galWidth:90,galHeight:90}, top:{galX:4,galY:3,galWidth:92,galHeight:27} };
      const preset = presets[f('galPreset').value];
      if(preset)for(const [name,value] of Object.entries(preset))f(name).value=value;
      for(const update of sliderOutputs)update();
    };
    dialogFields = { game: f('galGame'), state: group.querySelector('.tomoyo-gal-state'), maskState: group.querySelector('.tomoyo-mask-state:not([data-gal-wait-state])'),
     hookState:group.querySelector('.tomoyo-hook-state'),waitMarkerState:group.querySelector('[data-gal-wait-state]'),hookThreads:f('galHookThread') };
    bridge.galStatus({hookMessage:bridge.hookMessage||'选择 Hook 后会检查本地组件；尚未选择对话流时不会清空文字',hookThreads:bridge.hookThreads||[]});
    group.querySelector('[data-gal-hook-select]').onclick=()=>send({type:'hookSelect',id:f('galHookThread').value});
    dialogFields.maskState.textContent = bridge.maskMessage || '局部遮字会在绑定游戏并收到原文后启动';
    const current = () => appearance.clean({ ...preferences, readTextColor: f('galReadTextColor').value.toLowerCase() === f('galTextColor').value.toLowerCase() ? '' : f('galReadTextColor').value,
     furigana: f('galFurigana').checked, japaneseSize: Number(f('galJapaneseSize').value), sizeSource: Number(f('galJapaneseSize').value)!==preferences.japaneseSize||Number(f('galChineseSize')?.value??preferences.translationSize)!==preferences.translationSize?'user':preferences.sizeSource,
      x: Number(f('galX').value), y: Number(f('galY').value), width: Number(f('galWidth').value), height: Number(f('galHeight').value),
      ...Object.fromEntries(Object.entries(additional).map(([key,name]) => [key, typeof defaults[key] === 'boolean' ? f(name).checked : f(name).value])) });
    const save = event => { if(bridge.gameStyleCommitReady?.()===false){event?.preventDefault();event?.stopImmediatePropagation();return;}preferences = current();
     if(event?.type==='submit'&&dialog.dataset.menuTab==='calibrate'&&bridge.saveGameProfileFromMenu){event.preventDefault();event.stopImmediatePropagation();bridge.saveGameProfileFromMenu(preferences);
     return;} if(preferences.textColor.toLowerCase()!==committed.textColor.toLowerCase()){previousColor=committed.textColor;localStorage.setItem(colorHistoryKey,
     previousColor);colorUndo.disabled=false;} committed = { ...preferences }; localStorage.setItem('tomoyo-gal-settings', JSON.stringify({...preferences,translationPrompt:undefined}));
     send({ type: 'galConfigure', settings: preferences }); bridge.saveGameProfileFromMenu?.(preferences); apply(); };
    const updateMaskForm = () => { group.querySelector('[data-gal-full-color]').hidden = f('galMaskMode').value !== 'full';group.querySelector('[data-gal-hook-options]').hidden=f('galMaskMode').value!=='hook';
     };
    updateMaskForm();
    let previewFrame=0;
    const preview = () => { if(syncingForm)return;preferences = current(); updateMaskForm(); apply(); if(bound&&!previewFrame)previewFrame=requestAnimationFrame(()=>{
     previewFrame=0;send({type:'galPreview',settings:preferences});}); };
    extra.addEventListener('input',preview);
    group.addEventListener('input', preview);
    group.addEventListener('change', preview);
    group.querySelector('[data-gal-refresh]').onclick = () => send({ type: 'galWindows' });
    group.querySelector('[data-gal-bind]').onclick = () => {
      if (!f('galGame').value) { dialogFields.state.textContent = '先刷新并选择游戏窗口'; return; }
      preferences = current(); preferences.bindEnabled = true;
      committed = { ...preferences };
      localStorage.setItem('tomoyo-gal-settings', JSON.stringify({...preferences,translationPrompt:undefined}));
      send({ type: 'galBind', hwnd: f('galGame').value, settings: preferences });
    };
    group.querySelector('[data-gal-unbind]').onclick = () => { preferences.bindEnabled = false; send({ type: 'galUnbind' }); save(); };
    // Drag the text box with the mouse: first click starts, dragging moves it live, second click keeps the position.
    const dragButton = group.querySelector('[data-gal-drag]'), dragWords = {zh:['拖动文本框','确定位置'],en:['Drag text box','Confirm position'],ja:['テキスト枠をドラッグ','位置を確定']};
    const dragLabel = on => { const w = dragWords[(window.__tomeI18n?.get?.()||'zh').slice(0,2)] || dragWords.zh; dragButton.dataset.noI18n = ''; dragButton.textContent = w[on?1:0];
     dragButton.classList.toggle('tome-dragging', on); };
    let dragStart = null, dragFrame = 0;
    const dragDown = e => { if (e.button !== 0 || e.target.closest('.tomoyo-cn-dialog')) return; e.preventDefault(); e.stopPropagation(); dragStart = { x:e.clientX,
     y:e.clientY, gx:Number(f('galX').value), gy:Number(f('galY').value) }; try { e.target.setPointerCapture(e.pointerId); } catch {} };
    const dragMove = e => { if (!dragStart) return; e.preventDefault(); e.stopPropagation(); const dpr = Math.max(.5, Number(window.devicePixelRatio)||1), cw = layoutInfo?.clientWidth||window.innerWidth*dpr,
     ch = layoutInfo?.clientHeight||window.innerHeight*dpr;
      f('galX').value = Math.round(Math.max(0, Math.min(95, dragStart.gx + (e.clientX-dragStart.x)*dpr*100/cw))*10)/10; f('galY').value = Math.round(Math.max(0,
       Math.min(95, dragStart.gy + (e.clientY-dragStart.y)*dpr*100/ch))*10)/10; if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; preview();
       }); };
    const dragUp = e => { if (!dragStart) return; e.stopPropagation(); dragStart = null; };
    const dragMode = on => { document.body.classList.toggle('tome-box-dragging', on); dragLabel(on); for (const [type, fn] of [['pointerdown',dragDown],['pointermove',
     dragMove],['pointerup',dragUp]]) { if (on) window.addEventListener(type, fn, true); else window.removeEventListener(type, fn, true); } if (!on) dragStart = null;
     };
    dragButton.onclick = () => { const on = !document.body.classList.contains('tome-box-dragging'); dragMode(on); if (!on) save(); };
    dragLabel(false); dialog.addEventListener('close', () => dragMode(false), { once:true });
    form.addEventListener('submit', save, true);
    dialog.addEventListener('close', () => { if(previewFrame){cancelAnimationFrame(previewFrame);previewFrame=0;}preferences = {...committed,interfaceMode:preferences.interfaceMode};
     dialogFields = null;commitSynchronizedStyle=null;if(bound)send({type:'galPreview',settings:preferences});setTimeout(()=>send({ type: 'galMenu', open: !!document.querySelector('.tomoyo-cn-dialog[open],.tome-backlog[data-open],.tomoyo-cn-dialog[data-leaving],.tome-backlog[data-leaving]') }),
     340);apply(); }, { once: true });
    send({ type: 'galWindows' }); send({ type: 'galMenu', open: true });
  };
  let lastMenuToggle = 0;
  bridge.toggleGalMenu = () => {
    if(Date.now()-lastMenuToggle<180)return;
    lastMenuToggle=Date.now();
    const dialog = document.querySelector('.tomoyo-cn-dialog:not([data-leaving])');
    if (dialog?.open) dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    else bridge.openSettings();
  };
  new MutationObserver(records => {
    if (records.every(record => (record.target.nodeType === 3 ? record.target.parentElement : record.target)?.closest?.('.tomoyo-cn-dialog,.tomoyo-cn-row'))) return;
    clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { markReader(); alignText(); updateRuby(); }, 100);
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  window.addEventListener('resize', apply);document.fonts?.ready.then(()=>updateRuby());{let rubyFrame=0;const again=()=>{cancelAnimationFrame(rubyFrame);rubyFrame=requestAnimationFrame(()=>updateRuby());
   };const seen=new WeakSet(),boxes=new ResizeObserver(again);const watch=()=>{for(const n of document.querySelectorAll('.sentence-text,.sentence-window'))if(!seen.has(n)){
   seen.add(n);boxes.observe(n);}};new MutationObserver(watch).observe(document.documentElement,{childList:true,subtree:true});watch();addEventListener('megulit-reveal-progress',
   e=>{if(!e.detail?.typing)again();});}document.fonts?.addEventListener('loadingdone',()=>updateRuby());
  send({ type: 'loadGalPreferences' });
  apply();
})();
