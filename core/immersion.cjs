'use strict';
// Automatic hiding of the reading layer when the game shows no dialogue.
// CS2 (ISLAND) reports its message sprite's visibility (ToMe_DIALOG). The sprite blinks off and on within one draw
// burst for every line, so only an "off" that lasts 600 ms with no "on" and no new line hides the layer (OP, CG,
// window hidden); markers and screen comparison are not used while the engine reports this.
// Never hides on a reading pause alone. Modes:
//  hook   – only an explicit empty-text signal from the hook hides it
//  visual – calibrated dialog-box edge comparison
//  marker – the game's waiting marker (▼): once it has been seen for the current line and then
//           disappears without a new line following, the dialogue box is gone (CG, menu, transition).
//           If the marker is never seen for a line, nothing is hidden.
class Immersion{
 constructor(emit,now=Date.now){this.emit=emit;this.now=now;this.visible=true;this.pending=null;this.enabled=false;this.mode='hook';this.target='';this.markerPresent=false;this.resetLine();}
 // markerPresent mirrors the screen and is kept: the native side reports only changes, and a new line's marker is
 // often detected a little before the hook text arrives.
 resetLine(){this.lineAt=this.now?this.now():0;this.lineLength=0;this.markerSeen=false;this.markerGoneAt=0;this.drawnAt=0;this.typing=false;this.lineReadyAt=this.lineAt;this.currentText='';}
 configure(v){const enabled=v.immersion===true,mode=['hook','visual','marker'].includes(v.dialogDetection)?v.dialogDetection:'hook';if(enabled!==this.enabled||mode!==this.mode){this.enabled=enabled;this.mode=mode;this.pending=null;this.skipAt=null;this.sceneHidden=false;this.resetLine();if(enabled&&this.engineSignal===false)this.evidence(false,'engine');else this.set(true);}}
 bind(target){if(target!==this.target){this.target=target;this.resumeAt=0;this.pending=null;this.markerPresent=false;this.engineSignal=null;this.engineText=undefined;this.skipAt=null;this.sceneHidden=false;this.resetLine();this.set(true);}}
 /* 2026-11-13 choices on screen (hookChoices): MeguLit draws over them, so the reader is not hidden while they are up */
 choices(on){this.choiceUp=on===true;if(this.choiceUp&&!this.visible){this.set(true);this.choiceOnly=true;this.emit({dialogVisible:true,choiceOnly:true});}else if(!this.choiceUp&&this.choiceOnly){this.choiceOnly=false;this.emit({dialogVisible:true,choiceOnly:false});}}
 /* a hide while choices are up keeps the reader for them but not its dialogue line (the game hid its text box) */set(visible,why=''){if(!visible&&this.choiceUp){if(!this.choiceOnly){this.choiceOnly=true;this.emit({dialogVisible:true,choiceOnly:true});}return;}if(visible&&this.choiceOnly&&!this.choiceUp)this.choiceOnly=false;this.reason=visible?'':why;this.showAt=0;if(visible){this.hiddenByMarker=false;this.hiddenByAuto=false;this.resumeAt=0;}if(this.visible!==visible){this.visible=visible;this.emit(visible?{dialogVisible:true}:{dialogVisible:false,reason:why||'unknown'});}}
 // CS2 re-sends the current line's text several times per line and again on redraws: only a different line counts as
 // a new line, or a repeat would cancel every pending hide (OP, CG) right after the sprite went off.
 input(){this.inputAt=this.now();}
 /* Issue 127 (user: with blurred translations, hovering back and forth over them sometimes lost the subtitles). The pointer on
    MeguLit's own text means the line is being read: a marker that left meanwhile (many engines drop it while the pointer
    moves) does not hide the layer, and a marker hide already in place is lifted. */
 reading(){this.readingAt=this.now();if(this.enabled&&this.hiddenByMarker&&!this.visible&&!this.sceneHidden&&this.skipAt==null){this.hiddenByMarker=false;this.markerGoneAt=0;this.set(true);}}
 skip(held){if(!this.enabled)return;if(held){this.skipAt??=this.now();}else this.skipAt=null;}
 /* E422 (user, WoH: the layer still hid by itself; reader log: "scene changed 98%"). A scene hide that came before the first
    page line stayed: once the game was known as a page game every "scene back" was ignored. The page game is known from
    the hook (flowGame) before any line, and a hide already in place is lifted. */
 isFlow(){return this.flow===true||this.flowGame?.()===true;}
 scene(visible,why='scene'){if(!this.enabled||typeof visible!=='boolean')return;if(this.isFlow()){if(this.sceneHidden){this.sceneHidden=false;if(this.skipAt==null)this.set(true);}return;}this.sceneHidden=!visible;if(!visible){this.pending=null;this.resumeAt=0;this.set(false,why);}else if(this.skipAt==null)this.set(true);}
 /* E323: a flow page (WoH) has no dialogue box; the box probes (auto box, scene) hid and showed the layer at random there. */
 source(text,engine){const flow=engine==='nvl';if(flow&&this.sceneHidden){this.sceneHidden=false;this.hiddenByMarker=false;this.hiddenByAuto=false;}this.flow=flow;if(this.sceneHidden&&text===this.currentText)return;/* E282 (user: 爱上火车 kept the layer on the title screen): KiriKiri redraws hand the same line over again and again; only a different line restarts the line timers */if(engine!=='cs2'&&typeof text==='string'&&text.trim()&&text===this.currentText&&this.now()-this.lineAt<60000)return;if(engine==='cs2'&&typeof text==='string'){if(text===this.engineText)return;this.engineText=text;}if(engine==='cs2'){this.engineSignal=true;this.pending=null;}if(typeof text==='string'&&text.trim()){this.pending=null;this.resetLine();this.currentText=text;this.lineLength=[...text].length;this.lineReadyAt=this.lineAt+Math.min(15000,Math.max(0,(this.lineLength-40)*35));this.sceneHidden=false;if(this.skipAt==null)this.showWhenDrawn();}else if(typeof text==='string'&&text==='')this.evidence(false,'hook');}
 /* E277 (user, 2026-11-09): the hook often reads the next line while the game is still in a transition or on a black
    screen, and the layer showed before the game drew a single character. While the layer is auto-hidden, a new line
    shows it only once something proves it is on screen (wait marker, dialog box, engine signal, scene) or after
    0.7 s at the latest, so games without those signals still show it. */
 showWhenDrawn(){if(!this.enabled||this.visible){this.set(true);return;}this.showAt=this.now()+700;}
 drawn(){if(this.showAt&&!this.sceneHidden&&this.skipAt==null)this.set(true);}
 reveal(text,typing){if(text!==this.currentText||typeof typing!=='boolean')return;this.typing=typing;if(typing){this.markerSeen=false;this.markerGoneAt=0;this.drawnAt=0;}else this.lineReadyAt=Math.min(this.lineReadyAt,this.now());}
 /* E411 (user, WoH: the layer kept hiding by itself). A full-screen page has no dialogue box to see: the visual box edge
    and the auto box never hide it. */
 evidence(visible,source){if(!this.enabled||visible&&(this.sceneHidden||this.skipAt!=null))return;if(!visible&&this.isFlow()&&(source==='visual'||source==='auto'))return;if(this.engineLive()&&source!=='engine')return;if(visible){this.pending=null;this.set(true);}else if(!this.pending||this.pending.source!==source)this.pending={at:this.now(),source};}
 // A marker that comes back after a marker-based hide means the same line's dialogue box is back (window restored
 // after Hide W., a menu or the backlog closed): show the layer again instead of waiting for the next line.
 // The engine signal covers only the window it watches (ISLAND: the narration page). Lines drawn elsewhere (ADV box,
 // OP credits) report no visibility at all: for those lines fall back to the wait marker instead of never hiding.
 engineLive(){return this.engineSignal!=null&&(this.engineAt||0)>=this.lineAt-1500;}
 engine(visible,engine){if(!/^[a-z][a-z0-9_-]{1,40}$/i.test(engine||'')||typeof visible!=='boolean')return;this.engineAt=this.now();this.engineSignal=visible;/* 2026-11-12 (user: our text must do what the game's does) when the engine itself shows or hides its text window, so do our lines, whatever the immersion setting */if(!this.enabled){this.set(visible,visible?'':'engine');return;}if(visible){this.drawn();if(this.sceneHidden||this.skipAt!=null)return;this.pending=null;if(this.visible)this.set(true);else if(!this.resumeAt)this.resumeAt=this.now()+150;}else{this.resumeAt=0;this.evidence(false,'engine');}}
 // E263: the auto-calibrated box probe (any game, no setup). A visible wait marker or an engine signal wins.
 autoBox(visible){if(!this.enabled||typeof visible!=='boolean'||this.engineLive()||this.isFlow())return;if(visible){this.drawn();if(this.hiddenByAuto){this.hiddenByAuto=false;if(!this.sceneHidden&&this.skipAt==null)this.set(true);}if(this.pending?.source==='auto')this.pending=null;return;}if(this.typing||this.present())return;this.hiddenByAuto=true;this.evidence(false,'auto');}
 marker(present){if(this.engineLive())return;this.markerPresent=!!present;if(present)this.drawn();if(this.typing||this.now()<this.lineReadyAt)return;if(present){this.markerSeen=true;if(this.hiddenByMarker&&this.enabled&&this.mode==='marker'&&!this.sceneHidden&&this.skipAt==null){this.hiddenByMarker=false;this.set(true);}}else if(this.markerSeen)this.markerGoneAt=this.now();}
 markerDrawn(){this.drawn();if(this.engineLive()||this.typing||this.now()<this.lineReadyAt)return;this.drawnAt=this.now();this.markerSeen=true;}
 present(){return this.markerPresent||this.now()-this.drawnAt<1500;}
 tick(){
  if(!this.enabled)return;
  if(this.skipAt!=null&&this.now()-this.skipAt>=350){this.set(false,'skip');return;}
  if(this.sceneHidden)return;
  if(this.showAt&&this.now()>=this.showAt){this.set(true);return;}
  // A show precedes a new line. Let its confirmed source replace the old page before restoring the layer.
  if(this.resumeAt&&this.now()>=this.resumeAt){this.resumeAt=0;this.set(true);}
  if(this.pending&&this.now()-this.pending.at>=(this.pending.source==='engine'?600:350)){const why=this.pending.source;this.pending=null;this.set(false,why);return;}
  if(this.engineLive())return;
  /* E411: on a full-screen page the wait marker leaves at every click while the page's text stays (reader log: "marker"
     hides every few seconds); its absence is no sign that the text is gone. Skip and the page's own lines still decide. */
  if(this.isFlow())return;
  if(this.typing||this.now()<this.lineReadyAt)return;
  // A marker still on screen 0.4 s into a line belongs to this line (the previous one is cleared when the game advances).
  if(this.mode==='marker'&&!this.markerSeen&&this.markerPresent&&this.now()-this.lineAt>=400)this.markerSeen=true;
  if(this.mode!=='marker'||!this.visible||!this.markerSeen||this.present())return;
  // The marker has left: give the next line time to arrive (clicking on normally produces it within ~0.2 s).
  const gone=Math.max(this.markerGoneAt,this.drawnAt?this.drawnAt+1500:0);
  /* E277: 0.6 s, not 1.2 s (user: the layer stayed up well into the transition) */
  /* #114 (user: hovering a game's own settings button, or a button outside the window, made the layer vanish): many
     engines drop the wait marker while the pointer is over their buttons. Without a click, Space or Enter in the game
     shortly before, a missing marker only hides after 8 s (auto mode, a long hover); after such an advance input 0.6 s. */
  const advanced=this.inputAt!=null&&this.inputAt>=gone-2500&&this.inputAt<=gone+600;
  if(this.readingAt!=null&&this.now()-this.readingAt<3000)return;
  if(gone&&this.now()-gone>=(advanced?600:8000)){this.hiddenByMarker=true;this.set(false,'marker');}
 }
}
module.exports={Immersion};
