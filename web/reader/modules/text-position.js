// SPDX-License-Identifier: GPL-3.0-or-later
// Live tracking of where the game draws its dialogue. Engine draw hooks report each line's extent in the engine's own
// units (hookTextPos, see ToMeTextPos.h). A position sync pairs those units with where the original text was measured
// on screen, once per game, which gives a scale and an offset (saved per game executable). With "follow original text
// coordinates" on, every new line then moves the text box to the mapped place; moves are previews, not saved settings.
(function install(){
 'use strict';const b=window.__tomoyoChinese;if(!b){document.addEventListener('DOMContentLoaded',install,{once:true});return;}if(b.textPosition)return;
 const send=m=>{try{window.__tomoyoTranslateRequest(JSON.stringify(m));}catch{}};
 const repaint=()=>window.__tomeStyleSyncPaint?.();
 let identity='',map=null,last=null,lastAt=0,cal=null,following=false,applied='',baseWidth=null,setWidth=null,dropped=null;
 // Engine units are pixels of the game's own canvas: a value far outside any canvas means the hook read something that
 // is not a coordinate (an early ISLAND build reported a pointer), and must never move the text box.
 const unit=v=>Number.isFinite(v)&&Math.abs(v)<=20000;
 const plausibleMap=v=>!!v&&[v.s,v.bx,v.by,v.dx,v.dy].every(Number.isFinite)&&v.s>.1&&v.s<10&&Math.abs(v.bx)<=20000&&Math.abs(v.by)<=20000&&Math.abs(v.dx)<=20000&&Math.abs(v.dy)<=20000&&v.cw>0&&v.ch>0;
 const api={
  resetSession(nextIdentity){stateStyle.clear();readState='';endAlpha=1;map=last=cal=null;lastAt=0;following=false;applied='';baseWidth=setWidth=dropped=null;if(nextIdentity!==undefined)identity=String(nextIdentity);b.lineColorReset?.();repaint();},
  refresh(){if(last)b.textPosition(last,true);},
  mapExtent(m){if(!plausibleMap(map)||map.engine!==m.engine)return null;const l=b.galLayoutInfo?.(),kx=(l?.clientWidth||map.cw)/map.cw,ky=(l?.clientHeight||map.ch)/map.ch;return {x:(map.s*m.x0+map.bx)*kx,y:(map.s*m.y0+map.by)*ky,width:map.s*(m.x1-m.x0+m.size)*kx,size:map.s*m.size*ky};},
  getMap:()=>map?{...map}:null,
  followState:()=>({baseWidth,setWidth,dropped:dropped?{...dropped}:null}),
  state:()=>({source:!!last&&Date.now()-lastAt<15*60*1000,calibrated:!!map&&(!last||map.engine===last.engine)||/_adv_v1$|^cs2_screen_v3$/.test(String(last?.engine||''))&&last.sw>0&&last.sh>0,following}),
  setMap(value){map=plausibleMap(value)?value:null;repaint();},
  startCalibration(){cal={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity,size:0,engine:'',lines:new Map()};},
  cancelCalibration(){cal=null;},
  // target: where the original's first glyph ink was measured (client px) and the measured text width; prefs: the
  // corrected box. Scale = measured width / reported width; offsets make the reported top-left land on the ink.
  finishCalibration(target,prefs,options={}){let c=cal;cal=null;
   // A measured sample is paired with that exact sentence's final extent. Do not calibrate using the union of
   // unrelated pages/positions, or one late event will distort every later coordinate.
   if(c?.lines&&Array.isArray(target.samples)){const pairs=target.samples.map(s=>({sample:s,line:c.lines.get(s.token)})).filter(p=>p.line&&p.sample.textWidth>0);if(!pairs.length)return;
    pairs.sort((a,b)=>a.line.y0-b.line.y0||a.line.x0-b.line.x0);const pair=pairs[0];c=pair.line;target={...target,...pair.sample};}
   if(!c||!Number.isFinite(c.x0)||!(target.width>0)||!(target.height>0))return;
   const reported=c.x1-c.x0+c.size,measured=Number(target.textWidth)||0;let s=reported>0&&measured>0?measured/reported:target.width/1280;s=Math.max(.1,Math.min(10,s));
   const next={px:Number(prefs.x),py:Number(prefs.y),pw:Number(prefs.width),engine:c.engine,s,bx:target.inkLeft-s*c.x0,by:target.inkTop-s*c.y0,dx:target.inkLeft-prefs.x*target.width/100,dy:target.inkTop-prefs.y*target.height/100,cw:target.width,ch:target.height};
   if(!plausibleMap(next))return;map=next;if(options.persist!==false)send({type:'textPosMapSave',map:next,key:b.gameProfileKey?.()});repaint();return next;}
 };
 window.__tomeTextPosition=api;
 const priorStatus=b.galStatus;b.galStatus=m=>{if(typeof m.hookSourceRead==='boolean')readState=m.hookSourceReadOrigin==='engine'?(m.hookSourceRead?'read':'unread'):'';else if(typeof m.hookSource==='string')readState='';
  /* the engine named the state of the sentence already on screen (no new source with it): paint it again under that state */
  if(typeof m.hookSourceRead==='boolean'&&m.hookSourceReadOrigin==='engine'&&typeof m.hookSource!=='string'&&colorSource)repaintCurrent();if(m.type==='gameClosed'){api.resetSession('');}else if(m.hookSource===null||typeof m.hookSource==='string'&&!m.hookSource.trim())b.lineColorReset?.();else if(typeof m.hookSource==='string')b.lineColorFor?.(m.hookSource,m.hookSequence);else if(m.gameStarted||m.gameProcessId){const old=identity.split('|'),next=String(m.gameProcessId||old[0]||'')+'|'+String(m.gameStarted||old[1]||'');if(identity&&next!==identity)api.resetSession(next);identity=next;}
  // The history marker can arrive after TextRender has identified this exact draw as read.
  if(typeof m.hookSourceRead==='boolean'&&m.hookSourceReadOrigin!=='engine'&&engineRead?.draw&&applyRead()){
   m={...m,hookSourceRead:engineRead.read,hookSourceReadOrigin:'engine'};
  }
  return priorStatus?.(m);};
 // ISLAND (CS2) reports dialogue in its message texture: pages sit in 720-high slots of a tall texture (y 4364-4837
 // seen for one on-screen page), and the message layer is drawn about 63 px right and 8 px down on the 1280x720
 // canvas (measured against the game's own screenshots). Normalized coordinates are reported as cs2_screen_v3, so
 // position maps calibrated on the old raw values are never applied to them.
 const cs2Canvas=m=>{if(m?.engine!=='cs2_screen_v2'||![m.y0,m.y1,m.x0,m.x1].every(Number.isFinite))return m;const slot=Math.floor(m.y0/720)*720;return {...m,engine:'cs2_screen_v3',x0:m.x0+63,x1:m.x1+63,y0:m.y0-slot+8,y1:m.y1-slot+8,sw:1280,sh:720};};
 /* E550 (user, ファタモルガーナの館: calibration failed, the box sat at the default place, every line white). An engine that
    reports its own canvas size with a line (sw/sh, ADV mode: <engine>_adv_v1) needs no calibration: canvas pixels map to the
    client by the uniform scale the engine uses (letterbox centred), and the box is placed so its first glyph lands on the
    line's first glyph. A calibrated map for the same engine still wins. */
 const inkOffset=()=>{const text=document.querySelector('.sentence-text'),tok=text?.querySelector('.char-token')||text;if(!tok)return {x:0,y:0};const r=tok.getBoundingClientRect(),
  root=getComputedStyle(document.documentElement),rx=parseFloat(root.getPropertyValue('--tomoyo-reader-x')),ry=parseFloat(root.getPropertyValue('--tomoyo-reader-y'));
  if(!r.width||!Number.isFinite(rx)||!Number.isFinite(ry))return {x:0,y:0};const size=parseFloat(getComputedStyle(tok).fontSize)||r.height,dpr=Math.max(.5,Number(window.devicePixelRatio)||1);
  return {x:(r.left-rx)*dpr,y:(r.top+Math.max(0,r.height-size)/2-ry)*dpr};};
 /* 2026-11-19 (ISLAND with its own hook, rig2 live: every line sat at the style box's default place, next to the name plate,
    because no calibration had ever stored a map) the CatSystem2 lines are canvas pixels too (1280x720 after cs2Canvas): they
    map like an ADV canvas until a calibration exists */
 const canvasMap=(m,layout,ink)=>{if(!/_adv_v1$|^cs2_screen_v3$/.test(String(m?.engine||''))||!(m.sw>0&&m.sh>0))return null;const cw=layout?.clientWidth,ch=layout?.clientHeight;if(!(cw>0&&ch>0))return null;
  const s=Math.min(cw/m.sw,ch/m.sh);return {engine:m.engine,s,bx:(cw-s*m.sw)/2,by:(ch-s*m.sh)/2,dx:ink?.x||0,dy:ink?.y||0,cw,ch,implicit:true};};
 api.canvasMap=canvasMap;
 /* E550 per-line colour: the colour the engine drew this line with (KiriKiri chColor: narration grey, speech white), else the
    colour learned for its kind (speech in 「」 or narration) at calibration, else the text colour. */
 /* A colour belongs to a draw transaction, never to a wall-clock cache. Source can arrive on either side of begin. */
 let colorSource='',colorSequence=null,colorDraw=null,latestDraw=null,retiredDraw=null,waitingDraw=false;
 const sourceToken=text=>text?window.TomeIslandSource?.token(text)??null:null;
 /* Read styles: every sentence is painted from its own evidence (the engine's draw call, else the game's pixels: fill, opacity,
    outline). A sentence with none takes the last reliable sample of the same engine-reported read state, never the other state's
    and never a guess; with no state or no sample the saved colours apply. Furigana reads the same variables. */
 const stateStyle=new Map();let readState='',pixelPaint=null,endAlpha=1;
 const paintLine=(color,text,style)=>{const gs=window.TomoyoGameStyle,p=b.galPreferences?.()||{},root=document.documentElement.style;
  let paint=gs?.linePaint?gs.linePaint(p,text||'',color,style||null):null;if(!gs?.linePaint&&gs?.lineColor){const c=gs.lineColor(p,text||'',color);paint=c?{color:c,edge:'',sampled:!!color}:null;}
  if(paint?.sampled&&readState)stateStyle.set(readState,paint);
  else if(!color&&!style&&text&&readState&&p.autoGameStyle!==false&&stateStyle.has(readState))paint=stateStyle.get(readState);
  const on=!!paint?.color,edge=on&&!!paint.edge;document.body.classList.toggle('tome-line-color',on);document.body.classList.toggle('tome-line-edge',edge);
  if(on)root.setProperty('--tomoyo-gal-line-color',paint.color);else root.removeProperty('--tomoyo-gal-line-color');
  if(edge)root.setProperty('--tomoyo-gal-line-edge',paint.edge);else root.removeProperty('--tomoyo-gal-line-edge');};
 api.lineStyleState=()=>({readState,states:Object.fromEntries(stateStyle),pixel:pixelPaint});
 api.paintLine=paintLine;
 /* The game's own pixels for a sentence, one slot for both ways of seeing them: the engine side reading the glyphs it just drew
    (ToMe_CHARS color, live 死に逝く君、館に芽吹く憎悪: TextRender, read yellow -> new white, chColor white for both) and the helper
    measuring the game window (core/game-style-sync.cjs lineStyle). Used when no engine draw call claimed the sentence.
    The source may carry ruby readings, a speaker name or stage notes the game does not draw, and a page that grew by a sentence
    draws the earlier ones too: most characters of either text found in the other is a match. */
 const compact=t=>String(t||'').replace(/\s+/g,''),sameText=(src,drawn)=>{const a=[...compact(src)],d=[...compact(drawn)];if(!a.length||!d.length)return false;
  const left=new Map();for(const c of a)left.set(c,(left.get(c)||0)+1);let hit=0;for(const c of d){const n=left.get(c);if(n){hit++;left.set(c,n-1);}}return hit>=Math.ceil(Math.min(a.length,d.length)*.8);};
 const placementClaims=new Map();let sourceGeneration=0,currentPlacement=null;
 const retired=x=>x?.draw&&placementClaims.has(x.draw)&&placementClaims.get(x.draw)!==sourceGeneration;
 const matchesSample=(x,src)=>!!x&&!!src&&!retired(x)&&(!x.draw||!currentPlacement||currentPlacement===x.draw)&&(x.token!=null?x.token===sourceToken(src):x.draw?compact(src)===compact(x.text):sameText(src,x.text));
 function claimPlacement(x){if(!x?.draw)return;currentPlacement=x.draw;placementClaims.set(x.draw,sourceGeneration);if(placementClaims.size>64)placementClaims.delete(placementClaims.keys().next().value);}
 const pixelFor=src=>matchesSample(pixelPaint,src)?pixelPaint:null;let pixelEarly=null;
 /* a sample that is not the current sentence's is either late (dropped at the next source) or early (its source comes next): it waits
    beside the current one and never replaces it */
 const pixelSeen=(sample)=>{if(retired(sample))return;if(matchesSample(sample,colorSource)||!pixelFor(colorSource))pixelPaint=sample;else pixelEarly=sample;const own=pixelFor(colorSource);claimPlacement(own);if(own&&!(colorDraw?.claimed&&(colorDraw.color||colorDraw.style)))paintLine(own.color,colorSource,own.style);};
 b.lineColorDrawn=(text,color,draw)=>{if(!/^#[0-9a-f]{6}$/i.test(String(color)))return;pixelSeen({text:String(text||''),token:draw?sourceToken(text):null,draw,color,style:null});};
 b.lineStyleSample=m=>{const style=m.style&&typeof m.style==='object'&&/^#[0-9a-f]{6}$/i.test(m.style.fill||'')?m.style:null,byText=typeof m.text==='string'&&!!m.text.trim();if(!style||!Number.isSafeInteger(m.sourceToken)&&!byText)return;
  pixelSeen(Number.isSafeInteger(m.sourceToken)?{text:'',token:m.sourceToken,color:style.fill,style}:{text:m.text,token:null,color:style.fill,style});}; /* by text: the draw colour of a blank-glyph / GPU-hidden line (core/hook-native.cjs glyphColor) */
 /* The game's own read flag for a line (ToMe_CHARS read=, KAG getCurrentRead): which of the game's two looks the sentence has, also
    when the line is written back hidden and nothing of it is ever drawn (live 千恋＊万花, hide mode: no pixels, no colour, the reader
    stayed white on read lines). It sets the read state of the matching sentence: the sentence then takes the last real sample of that
    state, else the saved read / unread colours, and a sample that does arrive is remembered under the right state. */
 let engineRead=null,readEarly=null;
 const repaintCurrent=()=>{if(!colorSource)return;if(colorDraw?.claimed&&(colorDraw.color||colorDraw.style)){paintLine(colorDraw.color,colorSource,colorDraw.style);return;}const own=pixelFor(colorSource);paintLine(own?.color||'',colorSource,own?.style);};
 const applyRead=()=>{if(!matchesSample(engineRead,colorSource))return false;claimPlacement(engineRead);readState=engineRead.read?'read':'unread';document.body.classList.toggle('tome-line-read',engineRead.read);return true;};
 b.lineReadDrawn=(text,read,draw)=>{
  if(typeof read!=='boolean')return;
  const sample={text:String(text||''),token:draw?sourceToken(text):null,draw,read};
  if(retired(sample))return;
  if(draw&&!matchesSample(sample,colorSource)){readEarly=sample;return;}
  engineRead=sample;if(applyRead())repaintCurrent();
 };
 b.lineColorReset=()=>{placementClaims.clear();currentPlacement=null;engineRead=readEarly=null;pixelPaint=pixelEarly=null;colorSource='';colorSequence=null;colorDraw=latestDraw=retiredDraw=null;waitingDraw=false;paintLine('','');};
 b.lineColorFor=(text,sequence)=>{const next=String(text||''),seq=Number.isSafeInteger(sequence)?sequence:null;
  if(next===colorSource&&(seq===null||seq===colorSequence))return;
  const previousNativeRead=engineRead?.draw&&matchesSample(engineRead,colorSource);
  sourceGeneration++;currentPlacement=null;colorSource=next;colorSequence=seq;
  if(matchesSample(readEarly,next))engineRead=readEarly;
  readEarly=null;
  if(!applyRead()&&previousNativeRead)document.body.classList.toggle('tome-line-read',false);
  if(!pixelFor(next))pixelPaint=matchesSample(pixelEarly,next)?pixelEarly:null;
  claimPlacement(pixelPaint);pixelEarly=null; /* pixels seen before their source arrived stay; another sentence's never carry over */
  if(colorDraw&&!colorDraw.claimed&&colorDraw.sourceToken!=null&&colorDraw.sourceToken===sourceToken(next)){colorDraw.claimed=true;waitingDraw=false;paintLine(colorDraw.color,next,colorDraw.style);return;}
  /* A draw already claimed by the previous sequence is retired: a late end for it must not recolour this one, even with the same text. */
  retiredDraw=colorDraw?.claimed?{engine:colorDraw.engine,line:colorDraw.line}:null;colorDraw=null;waitingDraw=true;{const own=pixelFor(next);paintLine(own?.color||'',next,own?.style);}
 };
 const lineColor=m=>{
  if(!/_adv_v1$/.test(String(m.engine||''))||!Number.isSafeInteger(m.line))return;
  if(latestDraw?.engine===m.engine&&m.line<latestDraw.line)return;
  const same=latestDraw?.engine===m.engine&&latestDraw.line===m.line;
  const matches=Number.isSafeInteger(m.sourceToken)&&m.sourceToken===sourceToken(colorSource);
  if(m.phase==='end'&&!same&&!Number.isSafeInteger(m.sourceToken))return;
  if(retiredDraw?.engine===m.engine&&retiredDraw.line===m.line)return;
  if(!same||!colorDraw&&matches){latestDraw={engine:m.engine,line:m.line};colorDraw={...latestDraw,claimed:waitingDraw,color:'',style:null,sourceToken:null};waitingDraw=false;}
  /* A late end for the previous source cannot recolour a sentence waiting for its own begin. */
  if(!colorDraw||colorDraw.engine!==m.engine||colorDraw.line!==m.line)return;
  if(typeof m.color==='string'&&/^#[0-9a-f]{6}$/i.test(m.color))colorDraw.color=m.color;
  if(m.style&&typeof m.style==='object'&&/^#[0-9a-f]{6}$/i.test(m.style.fill||'')){
   /* A game that fades characters in starts each one faint: the opacity at the first character is not the sentence's (live ファタモルガーナの館: begin 20 %, end opaque). Until the end says so it counts only when the last finished sentence was dimmed the same. */
   /* Rule (engine side decides, native/krkrtext/script.inc st.fade): an opacity below 1 marked animated is not the sentence's yet and
      is painted opaque; unmarked it is the game's dimming and applies at once, at a begin as well. One exception keeps a dimmed run
      steady: an animated opacity equal to the last settled one is taken as the same dimming. */
   const a=Number(m.style.alpha),dim=a<.98,settled=m.style.animated!==true;if(settled)endAlpha=Number.isFinite(a)?a:1;colorDraw.style=dim&&!settled&&!(Math.abs(a-endAlpha)<.03)?{...m.style,alpha:1}:{...m.style,animated:false};} /* the engine side sends the end again when the opacity rises after it */
  if(Number.isSafeInteger(m.sourceToken)){colorDraw.sourceToken=m.sourceToken;colorDraw.claimed=matches;}
  if(colorDraw.claimed){const own=colorDraw.color||colorDraw.style?null:pixelFor(colorSource);paintLine(colorDraw.color||own?.color||'',colorSource,colorDraw.style||own?.style);}
 };
 b.textPosition=(m,refresh=false)=>{/* an engine that reports a screen line with its own colour and source token (CatSystem2 layout, page lines) is draw evidence for that
     sentence in the single-line reader too: into the pixel slot, behind an ADV draw transaction */
  if(m&&!refresh&&/_screen_v[12]$/.test(String(m.engine||''))&&Number.isSafeInteger(m.token)&&m.token>0&&typeof m.color==='string'&&/^#[0-9a-f]{6}$/i.test(m.color))pixelSeen({text:'',token:m.token,color:m.color,style:m.style&&typeof m.style==='object'?m.style:null});
  m=cs2Canvas(m);
  if(!m||![m.x0,m.y0,m.x1,m.y1].every(unit)||m.x1<m.x0||m.y1<m.y0||!Number.isFinite(m.size)||m.size<=0||m.size>256)return;const firstSource=!last;last=m;lastAt=Date.now();
  if(!refresh)lineColor(m);
  if(cal){if(Number.isSafeInteger(m.token)&&m.token>=0)cal.lines.set(m.token,{...m});cal.engine=m.engine;cal.x0=Math.min(cal.x0,m.x0);cal.y0=Math.min(cal.y0,m.y0);cal.x1=Math.max(cal.x1,m.x1);cal.y1=Math.max(cal.y1,m.y1);cal.size=Math.max(cal.size,m.size||0);}
  if(b.textPlaceUsesDialogueArea?.()||document.body.classList.contains('tome-box-dragging')){following=false;return;}
  if(b.islandPage?.position(m)){repaint();return;}
  /* ADV lines (E550) arrive as the game starts drawing, before their text: no page token to match */
  if(!/_adv_v1$/.test(m.engine)){if(b.pagePositionReady?.()===false)return;const currentToken=b.currentPageToken?.();if(currentToken!=null&&m.token!==currentToken)return;}
  const layout0=b.galLayoutInfo?.(),use=map&&map.engine===m.engine?map:canvasMap(m,layout0,inkOffset()); /* E422 follows automatically once calibrated; no switch */
  if(!use){if(following||firstSource){following=false;repaint();}return;}
  // The game window may have been resized since calibration: the mapping scales with the client size.
  const layout=layout0,cw=layout?.clientWidth||use.cw,ch=layout?.clientHeight||use.ch,kx=cw/use.cw,ky=ch/use.ch;
  const boxX=(use.s*m.x0+use.bx-use.dx)*kx,boxY=(use.s*m.y0+use.by-use.dy)*ky-(b.pageHistoryHeight?.()||0)*(window.devicePixelRatio||1);
  const x=Math.round(Math.max(0,Math.min(95,boxX*100/cw))*10)/10,y=Math.round(Math.max(0,Math.min(95,boxY*100/ch))*10)/10,key=x+','+y;
  /* 2026-11-20 (user, a third-party game: after loading a save the text sat at the right edge, 「しばらく / 喪服の男 / 遺族と礼」 one
     short row under the other; Alt+T and calibration did not hold). Following a line used to move only x/y and keep the width, so a
     start far right pushed the rest of every row past the game window and only the first glyphs of each row showed. The width now
     follows the place: the box's own width (the one the user, a calibration or the profile set, never a width set here) as long as
     it fits, else up to the window's right edge. A place that leaves less than half that width (at most 30 %) to the right edge or
     starts below 95 % is never dialogue (a redraw from mid-line or a menu caption reported right after a load, a scene jump, a
     return from the save menu) and is dropped. Any other place, a real switch between layouts included, applies at once. */
  const current=Number(b.galPreferences?.()?.width);if(Number.isFinite(current)&&(baseWidth===null||current!==setWidth))baseWidth=current;
  const width=Math.max(5,Math.min(100,baseWidth||60)),rawX=boxX*100/cw,rawY=boxY*100/ch;
  if(100-rawX<Math.min(width,60)/2||rawY>95){dropped={x:Math.round(rawX*10)/10,y:Math.round(rawY*10)/10,at:Date.now()};return;}
  const fit=Math.round(Math.min(width,100-x)*10)/10,next=Number.isFinite(current)&&fit!==current?fit:undefined;
  if(key!==applied||next!==undefined){applied=key;if(next!==undefined)setWidth=next;b.previewGalPosition?.(next!==undefined?{x,y,width:next}:{x,y});}
  if(!following){following=true;repaint();}
 };
})();
