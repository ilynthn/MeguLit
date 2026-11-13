(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TomoyoGameStyle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const defaults = Object.freeze({
    translationPrompt:'',choiceFont:'game',choiceSelectedColor:'',choiceUnselectedColor:'',
    typewriter:true,typewriterSpeed:35, layoutVersion: 22, style: 'classic', display: 'bilingual', furigana: true, japaneseSize: 34,
    translationSize: 30, rubyScale: .55, rubyOffsetX:0, rubyOffsetY:0, rubyRowOffsets:'',rubyRowOffsetsX:'', lineHeight: 0, lineHeightMode:'offset', translationLineHeight:0, japaneseSpacing:0, japaneseSpacingPx:0,chineseSpacingPx:0, gap: 6, translationWidth: 75,
    paddingX: 20, paddingY: 10, textColor: '#fffaf2', readTextColor: '', speechTextColor: '', narrationTextColor: '', textGradient:false, textGradientTop:'#fffaf2', textGradientBottom:'#a8c8ff', readTextGradient:false, readTextGradientTop:'#b0e2ff', readTextGradientBottom:'#639bd1', textGradientStart:0, readTextGradientStart:0, shadow: 'outline', autoScale: true,
    bindEnabled: false, interfaceMode:'normal', gameProcess: 'BGI', x: 4, y: 70, width: 92, height: 27,
    autoGameStyle:true, livePosition:false, hookProfile:'read', embedTranslation:false, hookAutoStart:true, hookHide:true, hookFast:true, mask: false, maskMode: 'hook', maskColor: '#171923',
    scanAuto: true, scanX: 2, scanY: 60, scanWidth: 96, scanHeight: 38, blurRadius: 13, maskPadding: 6, fastMask:true,
    maskVersion:26, maskStyle:'blend', japaneseBold:false, chineseBold:false, translationBlur:false,
    hideWaitMarker:false,relocateWaitMarker:false,waitCoverStyle:'frame',
    japaneseFont:'originalGothic', japaneseFontSource:'game', chineseFont:'notoSansSC', rubyFont:'notoSansJP', englishFont:'inherit',
    englishEnabled:false, englishSize:34, englishSpacingPx:0, englishBold:false,
    englishOutline:true, englishOutlineColor:'#ffffff', englishOutlineWidth:1,
    japaneseOutline:true, chineseOutline:true, japaneseOutlineColor:'#ffffff', chineseOutlineColor:'#ffffff', rubyOutline:true, rubyOutlineColor:'#ffffff', rubyOutlineWidth:.45,
    japaneseOutlineWidth:1, chineseOutlineWidth:1
  });
  const ranges = { typewriterSpeed:[5,120], japaneseSize:[14,60], translationSize:[12,60], englishSize:[12,60], englishSpacingPx:[-15,25],englishOutlineWidth:[0,4],rubyScale:[.2,.85], rubyOffsetX:[-40,40],rubyOffsetY:[-100,100],
    lineHeight:[-1.9,4], translationLineHeight:[-.8,3], japaneseSpacing:[-.05,.5],japaneseSpacingPx:[-15,25],chineseSpacingPx:[-15,25], gap:[-28,40], translationWidth:[0,100], paddingX:[-200,200], paddingY:[-40,60],
    x:[0,95], y:[0,95], width:[20,100], height:[10,90],
    scanX:[0,95], scanY:[0,95], scanWidth:[5,100], scanHeight:[5,100], blurRadius:[5,30], maskPadding:[0,10],japaneseOutlineWidth:[0,4],chineseOutlineWidth:[0,4],rubyOutlineWidth:[0,2] };
  function clean(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    // Signed em adjustment from the old 1.95 baseline. Migrate old ratios exactly once.
    if(value.lineHeightMode!=='offset'&&Number(value.lineHeight)>=0&&Number.isFinite(Number(value.lineHeight))&&value.lineHeight!=null&&value.lineHeight!=='')value={...value,lineHeight:Number(value.lineHeight)-1.95};
    const result = { ...defaults };
    for (const [key, [min,max]] of Object.entries(ranges)) {
      const number = value[key] === '' || value[key] == null ? NaN : Number(value[key]);
      if (Number.isFinite(number)) result[key] = Math.max(min, Math.min(max, number));
    }
    for (const key of ['typewriter','furigana','autoScale','fastMask','scanAuto']) result[key] = value[key] !== false;
    for (const key of ['hideWaitMarker','relocateWaitMarker']) result[key] = value[key] === true;
    for(const key of ['textGradient','readTextGradient'])result[key]=value[key]===true;
    // Where the top colour starts turning into the bottom colour, as % of the line height (0 = from the top).
    for(const key of ['textGradientStart','readTextGradientStart'])if(Number.isFinite(Number(value[key])))result[key]=Math.max(0,Math.min(95,Number(value[key])));
    for(const key of ['textGradientTop','textGradientBottom','readTextGradientTop','readTextGradientBottom'])if(/^#[0-9a-f]{6}$/i.test(value[key]))result[key]=value[key];
    if(typeof value.translationPrompt==='string')result.translationPrompt=value.translationPrompt.trim().slice(0,2000);
    if(['game','originalGothic','originalMincho','yuGothic','yuMincho','meiryo'].includes(value.choiceFont)||/^game:[0-9a-f]{10}$/.test(value.choiceFont))result.choiceFont=value.choiceFont;
    for(const key of ['choiceSelectedColor','choiceUnselectedColor'])if(/^#[0-9a-f]{6}$/i.test(value[key]))result[key]=value[key];
    /* E264 per-row furigana Y offsets, px, comma separated, row 1 first */
    if(typeof value.rubyRowOffsets==='string')result.rubyRowOffsets=value.rubyRowOffsets.split(',').slice(0,16).map(n=>Math.max(-100,Math.min(100,Number(n)||0))).join(',').replace(/^(0,)*0$/,'');
if(typeof value.rubyRowOffsetsX==='string')result.rubyRowOffsetsX=value.rubyRowOffsetsX.split(',').slice(0,16).map(n=>Math.max(-100,Math.min(100,Number(n)||0))).join(',').replace(/^(0,)*0$/,'');
    result.bindEnabled = value.bindEnabled === true;
    result.autoGameStyle=value.autoGameStyle!==false;result.livePosition=value.livePosition===true;
    if(['read','euphoria474','embed','off'].includes(value.hookProfile))result.hookProfile=value.hookProfile;
    result.embedTranslation=value.embedTranslation===true;result.hookAutoStart=value.hookAutoStart!==false;result.hookFast=value.hookFast!==false;
    result.hookHide=value.hookHide!==false;
    result.interfaceMode=value.interfaceMode==='translation'?'translation':'normal';
    result.japaneseBold = value.japaneseBold === true;
    result.chineseBold = value.chineseBold === true;
    /* user 2026-11-13: the game's own font wins unless the user picked another one after the font-follow migration */
    result.japaneseFontSource = value.japaneseFontSource === 'user' ? 'user' : 'game';
    result.translationBlur = value.translationBlur === true;
    result.englishEnabled = value.englishEnabled === true;
    result.englishBold = value.englishBold === true;
    for(const key of ['japaneseOutline','chineseOutline','englishOutline'])result[key]=value[key]!==false;
    for(const key of ['japaneseFont','chineseFont','rubyFont','englishFont']){
      if(fontOptions[key].some(([id])=>id===value[key])||key!=='englishFont'&&/^game:[0-9a-f]{10}$/.test(value[key])||(key==='japaneseFont'||key==='rubyFont')&&/^engine:[^"\<>;{}]{1,64}$/.test(value[key]))result[key]=value[key];
    }
    if(value.maskVersion!==26&&value.rubyFont==='gothic')result.rubyFont='round';
    if(value.japaneseSpacingPx==null&&Number.isFinite(Number(value.japaneseSpacing)))result.japaneseSpacingPx=Math.max(-15,Math.min(25,Number(value.japaneseSpacing)*result.japaneseSize));
    result.rubyOutline=value.rubyOutline!==false;for(const key of ['japaneseOutlineColor','chineseOutlineColor','rubyOutlineColor','englishOutlineColor'])if(/^#[0-9a-f]{6}$/i.test(value[key]))result[key]=value[key];
    if(['blend','blur'].includes(value.maskStyle))result.maskStyle=value.maskStyle;
    if(['frame','blend'].includes(value.waitCoverStyle))result.waitCoverStyle=value.waitCoverStyle;
    if(value.maskVersion!==26)result.maskPadding=Math.max(6,result.maskPadding);
    if (['local','hook'].includes(value.maskMode)) result.maskMode = value.maskMode;
    // OCR cover only by the user's own choice (user, 2026-11-05). Older automatic writes carry no source and revert to Hook.
    result.maskModeSource = value.maskModeSource === 'user' ? 'user' : '';
    /* 2026-11-12 (user: "禁止使用ocr遮盖") the original is never covered by OCR, not even by an older saved choice */
    if (result.maskMode === 'local') { result.maskMode = 'hook'; result.maskModeSource = ''; }
    result.mask = false;
    // 'user' once the user set a text size by hand: automatic calibration then keeps it (issue 119).
    result.sizeSource = value.sizeSource === 'user' ? 'user' : '';
    if (value.layoutVersion !== 22) {
      result.japaneseSize = Math.max(34, result.japaneseSize);
      result.translationSize = Math.max(30, result.translationSize);
    }
    for (const key of ['textColor','maskColor']) if (/^#[0-9a-f]{6}$/i.test(value[key])) result[key] = value[key];
    // Colour of lines the game marks as already read; empty = same as textColor.
    if (value.readTextColor === '' || /^#[0-9a-f]{6}$/i.test(value.readTextColor)) result.readTextColor = value.readTextColor;
    for (const key of ['speechTextColor','narrationTextColor']) if (value[key] === '' || /^#[0-9a-f]{6}$/i.test(value[key])) result[key] = value[key];
    if (['classic','clean','custom'].includes(value.style)) result.style = value.style;
    if (['bilingual','japanese','chinese','bilingual-en','english','none'].includes(value.display)) result.display = value.display;
    if (['outline','soft','none'].includes(value.shadow)) result.shadow = value.shadow;
    if (typeof value.gameProcess === 'string') result.gameProcess = value.gameProcess.slice(0,100);
    return result;
  }
  /* E550 per-line colour (ファタモルガーナの館: narration grey #9d9d9d, speech white). lineKind: 'speech' for a line in
     brackets (「」『』（）, also after a speaker name), 'narration' otherwise. lineColor: the engine's colour for this line when
     it reported one (not near black over light text: that is an outline), else the colour learned for the line's kind, else ''
     (the plain text colour applies). A user's own read/gradient colours always win, as in paintFor. */
  function lineKind(text) {
    const t = String(text || '').replace(/^[\s　]+/, '');
    if (!t) return '';
    return /^(?:[^\s　「『（(“"]{1,16}[\s　]*)?[「『（(“"]/.test(t) && /[」』）)”"][\s　。、！？!?…―ー]*$/.test(t) ? 'speech' : 'narration';
  }
  function lineColor(settings, text='', engineColor='') {
    if (!settings || settings.autoGameStyle === false) return '';
    const own = settings.textGradient || settings.readTextGradient || !!settings.readTextColor && String(settings.readTextColor).toLowerCase() !== String(settings.textColor).toLowerCase();
    if (own) return '';
    const hex = c => /^#[0-9a-f]{6}$/i.test(String(c || ''));
    const lum = c => { const v = [1,3,5].map(i => parseInt(String(c).slice(i, i + 2), 16)); return v[0] * .2126 + v[1] * .7152 + v[2] * .0722; };
    if (hex(engineColor) && !(lum(engineColor) < 48 && !(hex(settings.textColor) && lum(settings.textColor) < 96))) return engineColor.toLowerCase();
    const kind = lineKind(text), learned = kind && settings[kind + 'TextColor'];
    return hex(learned) ? learned.toLowerCase() : '';
  }
  function paintFor(settings, read=false, engineColor='') {
    // An actual engine colour takes priority over a learned/manual gradient for that sentence.
    // ...unless the user set read and unread apart (or a gradient): then their own colours win (user, 2026-11-02).
    const own=settings.textGradient||settings.readTextGradient||!!settings.readTextColor&&String(settings.readTextColor).toLowerCase()!==String(settings.textColor).toLowerCase();
    /* An engine colour near black over a light text setting is a shadow/outline or an unset field, not the text (user: ISLAND sometimes came out black) */const lum=c=>{const v=[1,3,5].map(i=>parseInt(String(c).slice(i,i+2),16));return v[0]*.2126+v[1]*.7152+v[2]*.0722;};if(/^#[0-9a-f]{6}$/i.test(engineColor)&&lum(engineColor)<48&&!(/^#[0-9a-f]{6}$/i.test(settings.textColor)&&lum(settings.textColor)<96))engineColor='';
    if(settings.autoGameStyle!==false&&!own&&/^#[0-9a-f]{6}$/i.test(engineColor))return {color:engineColor,gradient:'none',fill:'currentColor'};
    const prefix=read?'readText':'text',on=settings[prefix+'Gradient'];
    return {color:read?(settings.readTextColor||settings.textColor):settings.textColor,
      gradient:on?'linear-gradient(to bottom, '+settings[prefix+'GradientTop']+' '+(Number(settings[prefix+'GradientStart'])||0)+'%, '+settings[prefix+'GradientBottom']+' 100%)':'none',fill:on?'transparent':'currentColor'};
  }
  function paintVariables(paint) {
    const gradient=paint.gradient!=='none';
    return {'--tomoyo-gal-color':paint.color,'--tomoyo-gal-gradient':paint.gradient,'--tomoyo-gal-fill':paint.fill,
      '--tomoyo-gal-jp-stroke':gradient?'0px':'var(--tomoyo-jp-stroke)',
      '--tomoyo-gal-cn-stroke':gradient?'0px':'var(--tomoyo-cn-stroke)',
      '--tomoyo-gal-jp-filter':gradient?'var(--tomoyo-gradient-jp-outline)':'none',
      '--tomoyo-gal-cn-filter':gradient?'var(--tomoyo-gradient-cn-outline)':'none'};
  }
  function lineHeightFor(settings, ruby=false) {
    return Math.max(.05, 1.95 + settings.lineHeight + (ruby ? .6 : 0));
  }
  function insets(settings, scale=1) {
    const x=settings.paddingX*scale,y=settings.paddingY*scale;
    return {padX:Math.max(0,x),padY:Math.max(0,y),outX:Math.min(0,x),outY:Math.min(0,y)};
  }
  function scaleForViewport(viewportWidth, settings, bound) {
    if (!bound || !settings.autoScale) return 1;
    const width = Number(viewportWidth);
    if (!Number.isFinite(width) || width <= 0) return 1;
    const scale=width / (settings.width / 100) / 1280;
    return settings.autoGameStyle!==false?Math.max(.05,Math.min(16,scale)):Math.max(.6,Math.min(2,scale));
  }
  /* E477 (player, small ~470x350 window: MeguLit's embedded line came out ~30 px over the game's ~13 px and every re-fit
     kept it). The scale froze while the Alt+T menu was open and started at 1 (a desktop-sized font): binding and calibrating
     both happen with the menu open, so a re-fit re-used the stale scale. The game client size never depends on the menu,
     so the scale follows it whenever it is known; only the reader-width fallback is held while the menu is open. An
     automatic size is also capped by the client height, so the whole block stays inside a small game window. */
  function gameScaleFor(o) {
    const s=o.settings||defaults,layout=o.layout,dpr=Math.max(.5,Number(o.dpr)||1),previous=Number.isFinite(o.previous)&&o.previous>0?o.previous:1;
    const cw=Number(layout?.clientWidth),ch=Number(layout?.clientHeight);let scale;
    if(layout&&cw>0)scale=scaleForViewport(cw*s.width/100/dpr,s,o.bound);
    else if(o.dialogOpen)return previous;
    else scale=scaleForViewport(layout?Number(layout.readerWidth)/dpr:o.innerWidth,s,o.bound);
    if(o.bound&&ch>0&&s.sizeSource!=='user'){const largest=Math.max(Number(s.japaneseSize)||0,s.display==='japanese'?0:Number(s.translationSize)||0);if(largest>0)scale=Math.min(scale,ch/dpr*.06/largest);}
    return Math.max(.05,scale);
  }
  const fonts = {
    /* 2026-11-13 (9-nine zh-TW line drew 問 as 履, 千恋 lines had single smaller glyphs): a system font named "SubahibiFont" is a
       borrowed-code patch font (PostScript SimHei) that covers only some characters with other glyphs; Chinese never falls back
       to it, and Microsoft YaHei (full GBK, simplified and traditional) comes before SimHei (GB2312 only), so a line keeps one font. */
    classic: { ja:'"MS Mincho","ＭＳ 明朝","Yu Mincho","Noto Serif JP",serif', zh:'"TomoyoSubahibiCN","Microsoft YaHei","SimHei",sans-serif' },
    clean: { ja:'"MS Gothic","ＭＳ ゴシック","Yu Gothic","Meiryo",sans-serif', zh:'"TomoyoSubahibiCN","Microsoft YaHei","SimHei",sans-serif' }
  };
  const shadows = {
    outline:'-1px 0 0 #171721b3,1px 0 0 #171721b3,0 -1px 0 #171721b3,0 1px 0 #171721b3,0 2px 3px #0009',
    soft:'0 1px 3px #000c', none:'none'
  };
  const japaneseFonts={originalGothic:'"MS Gothic","ＭＳ ゴシック",sans-serif',originalMincho:'"MS Mincho","ＭＳ 明朝",serif',yuMincho:'"Yu Mincho",serif',yuGothic:'"Yu Gothic",sans-serif',meiryo:'Meiryo,sans-serif'};
  const chineseFonts={patch:fonts.classic.zh,simhei:'SimHei,sans-serif',yahei:'"Microsoft YaHei",sans-serif',simsun:'SimSun,serif',kaiti:'KaiTi,serif'};
  const fontOptions={
    japaneseFont:[
      ['originalGothic','MS Gothic','sans'],['originalMincho','MS Mincho','serif'],
      ['yuGothic','Yu Gothic','sans'],['yuMincho','Yu Mincho','serif'],['meiryo','Meiryo','sans'],
      ['yuGothicUI','Yu Gothic UI','sans'],['meiryoUI','Meiryo UI','sans'],['msPGothic','MS PGothic','sans'],
      ['msUIGothic','MS UI Gothic','sans'],['msPMincho','MS PMincho','serif'],['bizUDGothic','BIZ UDゴシック','sans'],
      ['bizUDPGothic','BIZ UDPゴシック','sans'],['bizUDMincho','BIZ UD明朝','serif'],['bizUDPMincho','BIZ UDP明朝','serif'],
      ['notoSansJP','Noto Sans JP','sans'],['notoSerifJP','Noto Serif JP','serif'],
    ],
    chineseFont:[
      ['patch','font.ttf','patch'],['simhei','SimHei','sans'],['yahei','Microsoft YaHei','sans'],
      ['simsun','SimSun','serif'],['kaiti','KaiTi','serif'],['yaheiUI','Microsoft YaHei UI','sans'],
      ['dengxian','DengXian','sans'],['nsimsun','NSimSun','serif'],['fangsong','FangSong','serif'],
      ['jhenghei','Microsoft JhengHei','sans'],['jhengheiUI','Microsoft JhengHei UI','sans'],
      ['mingliu','MingLiU','serif'],['pmingliu','PMingLiU','serif'],['notoSansSC','Noto Sans SC','sans',true],
      ['notoSerifSC','Noto Serif SC','serif',true],['notoSansTC','Noto Sans TC','sans',true],['notoSerifTC','Noto Serif TC','serif',true],
    ],
    englishFont:[
      ['inherit','','inherit'],['segoeUI','Segoe UI','sans'],['segoeVariable','Segoe UI Variable','sans'],
      ['arial','Arial','sans'],['calibri','Calibri','sans'],['cambria','Cambria','serif'],['georgia','Georgia','serif'],
      ['times','Times New Roman','serif'],['verdana','Verdana','sans'],['tahoma','Tahoma','sans'],
      ['trebuchet','Trebuchet MS','sans'],['bahnschrift','Bahnschrift','sans'],['candara','Candara','sans'],
      ['corbel','Corbel','sans'],['constantia','Constantia','serif'],['palatino','Palatino Linotype','serif'],
      ['bookAntiqua','Book Antiqua','serif',true],['centuryGothic','Century Gothic','sans',true],
      ['garamond','Garamond','serif',true],['aptos','Aptos','sans',true],['consolas','Consolas','mono'],
      ['cascadia','Cascadia Mono','mono'],['courier','Courier New','mono'],['lucidaConsole','Lucida Console','mono'],
    ],
  };
  fontOptions.rubyFont=[
    ['round','Meiryo','round'],['gothic','MS Gothic','sans'],['mincho','MS Mincho','serif'],['inherit','','inherit'],
    ...fontOptions.japaneseFont.filter(([id])=>!['originalGothic','originalMincho','meiryo'].includes(id)),
    ['meiryo','Meiryo','sans'],
  ];
  const englishFonts={inherit:'inherit'};
  const generics={sans:'sans-serif',serif:'serif',mono:'monospace'};
  for(const [key,map,fallback] of [['japaneseFont',japaneseFonts,'"Yu Gothic",'],['chineseFont',chineseFonts,'"Microsoft YaHei",'],['englishFont',englishFonts,'']]){
    for(const [id,family,kind] of fontOptions[key])if(!Object.hasOwn(map,id))map[id]='"'+family+'",'+fallback+generics[kind];
  }
  function outlineFor(enabled,color,width,dpr){
    if(!enabled||!(width>0))return 'none';
    // Crisp outline snapped to whole device pixels. Sub-pixel offsets plus a blur layer were what produced the
    // fuzzy "hairy" edge at small widths. Widths under one device pixel keep a 1px ring and fade it instead.
    const scale=Math.max(.5,Number(dpr)||1),safe=/^#[0-9a-f]{6}$/i.test(color)?color:'#ffffff';
    const device=Math.min(8,width)*scale,radius=Math.max(1,Math.round(device));
    const alpha=device<1?Math.max(.25,device):1,paint=alpha<1?safe+Math.round(alpha*255).toString(16).padStart(2,'0'):safe;
    const parts=[],limit=(radius+.5)*(radius+.5);
    for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
      if((x===0&&y===0)||x*x+y*y>limit)continue;
      parts.push(+(x/scale).toFixed(3)+'px '+(+(y/scale).toFixed(3))+'px 0 '+paint);
    }
    return parts.join(',');
  }
  function shadowFor(color, kind) {
    if (kind === 'none') return 'none';
    const valid = /^#[0-9a-f]{6}$/i.test(color) ? color : defaults.textColor;
    const values = [1,3,5].map(i => parseInt(valid.slice(i,i+2),16));
    const dark = values[0]*.2126 + values[1]*.7152 + values[2]*.0722 < 120;
    if (!dark) return shadows[kind] || shadows.outline;
    return kind === 'soft' ? '0 1px 3px #fff9' : '-1px 0 0 #fff9,1px 0 0 #fff9,0 -1px 0 #fff9,0 1px 0 #fff9';
  }
  return { defaults, clean, lineKind, lineColor, paintFor, paintVariables, lineHeightFor, insets, scaleForViewport, gameScaleFor, fonts, shadows, shadowFor, japaneseFonts,chineseFonts,englishFonts,fontOptions,outlineFor };
});
