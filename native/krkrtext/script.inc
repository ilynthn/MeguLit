// SPDX-License-Identifier: GPL-3.0-or-later
// TJS run by KrkrText.cpp through Scripts.eval on the game's own thread. It wraps each KAG message layer's processCh
// and clear and the window's showLineBreak / showPageBreak, and reports one sentence at a time (begin: first character
// drawn; end: the click wait or the layer being cleared) with where the game drew it, in game-screen pixels:
//   ToMe_KRKR begin|end line=N same=0|1 nvl=0|1 x0= y0= x1= y1= size= sw= sh= n= [text=...]
// same=0 when the layer was cleared since its last sentence (a new page). nvl=1 for message layers at least 45 % of the
// screen high (full-screen pages); layers under 20 % (name plates) are not reported. Nothing the game saves is
// touched: the state lives in global.__megulitKrkrState and every wrapper falls back to the game's own method.
// Field names follow the KAG3 MessageLayer (lineLayer, lineLayerPos, lineLayerOriginY, lineLayerBase, fontSize,
// marginR, vertical); a layer without lineLayer is measured with its x / y cursor. Vertical text is not reported.
// The end text keeps the game's own line breaks: a character drawn on a new row starts with a newline.
// E321/E550: begin and end lines carry color=rrggbb, the layer's chColor for the sentence's last character: games draw read and
// unread text in different colours, and the reader paints each page line in the colour the game used.
LR"MGLT((function(){
 try {
  if(typeof global.kag!='Object' || global.kag===void || global.kag===null) return 'wait kag';
  var k=global.kag;
  if(typeof k.fore!='Object' || k.fore===void) return 'wait fore';
  /* 2026-11-12 (ファタモルガーナの館: "メンバ __megulitKrkrState が見つかりません"): reading a missing member throws on some
     KiriKiri builds; typeof does not */
  var st=(typeof global.__megulitKrkrState=='Object')?global.__megulitKrkrState:void;
  if(st===void) {
   st=%['skipped'=>0,'skippedCls'=>'','lastFont'=>'','pfontName'=>void,'art'=>0,'artText'=>'','artSeen'=>[],'calls'=>0,'hid'=>0,'wrapped'=>[],'recs'=>[],'active'=>void,'lastVis'=>-1,'timer'=>void,'line'=>0,'report'=>global.__megulitKrkrReport,'kag'=>k,'hooked'=>0,'oldLB'=>void,'oldPB'=>void,'oldPBC'=>void];
   st.screen=function(){
    var sw=+this.kag.scWidth,sh=+this.kag.scHeight;
    if(!(sw>0) || !(sh>0)) {sw=+this.kag.primaryLayer.width;sh=+this.kag.primaryLayer.height;}
    return [sw,sh];
   } incontextof st;
   st.abs=function(L){
    var ax=0,ay=0,l=L;
    for(var i=0;i<16;i++) {var p=l.parent;if(p===void || p===null) break;ax+=l.left;ay+=l.top;l=p;}
    return [ax,ay];
   } incontextof st;
   st.send=function(kind,rec,x0,x1){
    var s='ToMe_KRKR '+kind+' line='+rec.line+' same='+rec.same+' nvl='+rec.nvl+' x0='+int(x0)+' y0='+int(rec.y0)+' x1='+int(x1)+' y1='+int(rec.y1)+' size='+int(rec.size)+' sw='+int(rec.sw)+' sh='+int(rec.sh)+' n='+rec.n;
    if(rec.color>=0) {var h='',v=rec.color;for(var i=0;i<6;i++) {h='0123456789abcdef'.charAt(v&15)+h;v=v>>4;} s+=' color='+h;}
    if(kind=='end') s+=' text='+rec.text;
    this.report(s);
   } incontextof st;
   st.track=function(rec,ch,lm,p0,oy){
    var L=rec.target;
    if(L.vertical) return;
    var scr=this.screen(),sw=scr[0],sh=scr[1];
    if(!(sw>0) || !(sh>0) || L.height<sh*0.2) return;
    var size=+L.fontSize;
    if(!(size>0)) size=Math.abs(+L.font.height);
    if(!(size>0)) return;
    var cx,cy;
    if(lm) {
     var ll=L.lineLayer;
     if(+L.lineLayerOriginY!=oy) p0=4;
     else if(+L.lineLayerPos==p0) return;
     cx=ll.left+p0;cy=ll.top+(+L.lineLayerBase)-size;
    } else {
     if(+L.y!=oy) {cx=+L.x-L.font.getTextWidth(ch);cy=+L.y;}
     else {if(+L.x==p0) return;cx=p0;cy=oy;}
    }
    var a=this.abs(L);cx+=a[0];cy+=a[1];
    if(rec.n==0) {
     this.fontReport(L);
     rec.line=++this.line;this.active=rec;rec.x0=cx;rec.y0=cy;rec.x1=cx;rec.y1=cy;rec.size=size;rec.text='';rec.sw=sw;rec.sh=sh;
     rec.nvl=L.height>=sh*0.45?1:0;rec.same=rec.cleared?0:1;rec.cleared=false;
     if(typeof L.chColor=='Integer') rec.color=L.chColor&0xffffff; /* E550: begin carries the colour too (narration grey / speech white), before the line is shown */
     var right=a[0]+L.width-(+L.marginR)-size;
     if(!(right>cx)) right=cx;
     this.send('begin',rec,cx,right);
    }
    if(ch!='\n' && ch!='\r') {if(rec.n>0 && cy!=rec.ly) rec.text+='\n';rec.text+=ch;}
    rec.ly=cy;
    rec.n++;
    if(typeof L.chColor=='Integer') rec.color=L.chColor&0xffffff;
    if(cx<rec.x0) rec.x0=cx;
    if(cx>rec.x1) rec.x1=cx;
    if(cy<rec.y0) rec.y0=cy;
    if(cy>rec.y1) rec.y1=cy;
   } incontextof st;
   st.flush=function(rec){
    if(rec.n>0) this.send('end',rec,rec.x0,rec.x1);
    rec.n=0;rec.text='';
   } incontextof st;
   st.flushAll=function(){for(var i=0;i<this.recs.count;i++) this.flush(this.recs[i]);} incontextof st;
   /* 2026-11-12 (user: the game must think it draws its text while the output is ours): while MeguLit asks for it
      (__megulitKrkrHide()==1, only with HookBridge connected), a message layer draws its glyphs, ruby and shadows at opacity
      0. Layout, wrapping and the click wait are the engine's own; MeguLit draws the readable text at the reported place.
      Never break the game (a probe that wrapped a layer twice once raised "メンバ old が見つかりません"): each layer is
      wrapped once, its own method is kept on the layer (__mgOld), the wrapper is bound to that layer, and when it is called
      on anything else, or anything fails, the engine's native Layer.drawText draws with the game's own arguments. */
   st.hideOn=function(){try {return typeof global.__megulitKrkrHide=='Object' && global.__megulitKrkrHide()==1;} catch(e) {return false;}} incontextof st;
   if(typeof global.__megulitDraw!='Object') global.__megulitDraw=function(args*){
    var self=this,old=void;
    try {if(typeof self.__mgOld=='Object') old=self.__mgOld;} catch(e) {}
    if(old===void) old=global.Layer.drawText;
    try {
     var st=global.__megulitKrkrState;
     if(typeof st=='Object' && st!==void) {
      if(self.__mgKind=='msg') {
       st.calls++;
       if(st.hideOn()) {
        var a=[];a.assign(args);
        while(a.count<7) a.add(a.count==4?255:(a.count==5?true:0));
        a[4]=0;a[6]=0;st.hid++;
        return (old incontextof self)(a*);
       }
      } else st.art++;
     }
    } catch(e) {}
    return (old incontextof self)(args*);
   };
   st.wrapAs=function(o,kind){
    try {
     if(o===void || o===null || !isvalid o || typeof o.drawText!='Object') return;
     if(typeof o.__mgKind=='String') {if(kind=='msg') o.__mgKind='msg';return;}
     /* 2026-11-12 (千恋＊万花: "Member checkUpdate does not exist" at start.ks 43 after a custom message-layer class got our
        drawText): only the plain Layer a message layer draws its line on (lineLayer, new Layer in KAG) is touched, never a
        message-layer class (a game's own subclass keeps its methods; such a game is embedded the other ways). */
     var isL=0,isK=0,isM=0;
     try {isL=(o instanceof "Layer")?1:0;} catch(e) {isL=2;}
     try {isK=(o instanceof "KAGLayer")?1:0;} catch(e) {isK=2;}
     try {isM=(o instanceof "MessageLayer")?1:0;} catch(e) {isM=2;}
     if(isL!=1 || isM!=0) {this.skipped++;this.skippedCls='L'+isL+'K'+isK+'M'+isM;return;}
     o.__mgOld=o.drawText;o.__mgKind=kind;
     o.drawText=(global.__megulitDraw incontextof o);
     if(kind=='msg') this.wrapped.add(o); else this.artSeen.add(o);
    } catch(e) {}
   } incontextof st;
   st.wrapDraw=function(o){this.wrapAs(o,'msg');} incontextof st;
   st.artWalk=function(L,d){
    try {
     if(L===void || L===null || d>8 || !isvalid L) return;
     this.wrapAs(L,'art');
     var c=L.children;if(typeof c!='Object' || c===void) return;
     for(var i=0;i<c.count && i<64;i++) this.artWalk(c[i],d+1);
    } catch(e) {}
   } incontextof st;
)MGLT" LR"MGLT(
   st.install=function(L){
    try {if(typeof L.lineLayer=='Object') this.wrapDraw(L.lineLayer);} catch(e) {}
    for(var i=0;i<this.recs.count;i++) if(this.recs[i].target===L) return;
    if(typeof L.processCh!='Object') return;
    var rec=%['target'=>L,'st'=>this,'oldCh'=>L.processCh,'oldClear'=>void,'n'=>0,'text'=>'','line'=>0,'same'=>0,'cleared'=>true,'nvl'=>0,'x0'=>0,'y0'=>0,'x1'=>0,'y1'=>0,'size'=>0,'sw'=>0,'sh'=>0,'ly'=>0,'color'=>-1];
    rec.ch=function(ch){
     var L=this.target,lm=false,p0=0,oy=0;
     try {
      var t=typeof L.lineLayerPos;
      if(typeof L.lineLayer=='Object' && L.lineLayer!==void && L.lineLayer!==null && (t=='Integer' || t=='Real')) {lm=true;p0=+L.lineLayerPos;oy=+L.lineLayerOriginY;}
      else {p0=+L.x;oy=+L.y;}
     } catch(e) {}
     if(typeof this.oldCh!='Object') return (global.MessageLayer.processCh incontextof this)(...);
     var result=(this.oldCh incontextof L)(...);
     try {this.st.track(this,ch,lm,p0,oy);} catch(e) {}
     return result;
    } incontextof rec;
    rec.clr=function(){
     try {this.st.flush(this);this.cleared=true;} catch(e) {}
     if(typeof this.oldClear!='Object') return (global.MessageLayer.clear incontextof this)(...);
     return (this.oldClear incontextof this.target)(...);
    } incontextof rec;
    L.processCh=rec.ch;
    if(typeof L.clear=='Object') {rec.oldClear=L.clear;L.clear=rec.clr;}
    this.recs.add(rec);
   } incontextof st;
   st.lb=function(){if(typeof this.oldLB!='Object') return (global.KAGWindow.showLineBreak incontextof this)(...);try {this.flushAll();} catch(e) {} return (this.oldLB incontextof this.kag)(...);} incontextof st;
   st.pb=function(){if(typeof this.oldPB!='Object') return (global.KAGWindow.showPageBreak incontextof this)(...);try {this.flushAll();} catch(e) {} return (this.oldPB incontextof this.kag)(...);} incontextof st;
   st.pbc=function(){if(typeof this.oldPBC!='Object') return (global.KAGWindow.showPageBreakAndClear incontextof this)(...);try {this.flushAll();} catch(e) {} return (this.oldPBC incontextof this.kag)(...);} incontextof st;
   /* 2026-11-12 (user, ファタモルガーナの館: the last line stayed on screen through the opening, where the game had hidden its
      text window): every 100 ms the layer of the latest sentence is checked on the front page, itself and every parent
      visible and not transparent; a change is reported as ToMe_DIALOG engine=krkr visible=0|1. */
   st.shown=function(L){
    try {
     var fore=this.kag.fore.messages,on=false;
     for(var i=0;i<fore.count;i++) if(fore[i]===L) {on=true;break;}
     if(!on) return 0;
     var l=L;
     for(var i=0;i<16;i++) {
      if(!l.visible) return 0;
      if(typeof l.opacity!='undefined' && +l.opacity<=0) return 0;
      var p=l.parent;if(p===void || p===null) break;l=p;
     }
     return 1;
    } catch(e) {return 1;}
   } incontextof st;
   st.vis=function(){
    try {
     var r=this.active;if(r===void || r===null || !isvalid r.target) return;
     var v=this.shown(r.target);
     if(v!=this.lastVis) {this.lastVis=v;this.report('ToMe_DIALOG engine=krkr visible='+v);}
    } catch(e) {}
   } incontextof st;
   /* the face the latest sentence was drawn with, reported when it changes (checked with every refresh) */
   /* E475: the font that draws is the KAG lineLayer's (MessageLayer.userFace, e.g. ＭＳ Ｐ明朝), not the message layer's own
      (ＭＳ Ｐゴシック in ファタモルガーナの館); a game may also map pre-rendered glyphs over it with [mappfont storage=x.tft]
      (KAGWindow.mapPrerenderedFont), found read-only in first.ks. Nothing is wrapped or written. */
   st.drawFont=function(L){var f=void;try {if(typeof L.lineLayer=='Object' && L.lineLayer!==void && L.lineLayer!==null) f=L.lineLayer.font;} catch(e) {f=void;}if(f===void || f===null) f=L.font;return f;} incontextof st;
   st.pfont=function(){if(this.pfontName!==void) return this.pfontName;this.pfontName='';try {var a=[].load('first.ks');for(var i=0;i<a.count && i<4000;i++) {var t=''+a[i],j=t.indexOf('mappfont');if(j<0 || t.charAt(0)==';') continue;var m=/storage\s*=\s*["']?([^"'\s\]]+)/.exec(t.substring(j));if(m!==void && m!==null && m.count>1) {this.pfontName=''+m[1];break;}}} catch(e) {}return this.pfontName;} incontextof st;
   st.fontReport=function(L){try {var f=this.drawFont(L),face=''+f.face,h=+f.height;if(h<0) h=-h;h=int(h);var b=f.bold?1:0,key=face+'/'+h+'/'+b;if(face!='' && key!=this.lastFont) {this.lastFont=key;var pf=this.pfont();this.report('ToMe_KRKR font size='+h+' bold='+b+(pf!=''?' pfont='+pf:'')+' face='+face);}return key;} catch(e) {return 'err '+e.message;}} incontextof st;
   st.fontCheck=function(){var r=this.active;if(r===void || r===null) return;this.fontReport(r.target);} incontextof st;
   st.fontNow=function(){var r=this.active;if(r===void || r===null) return '-';return this.fontReport(r.target);} incontextof st;
   st.refresh=function(){
    try {
     var k=this.kag;
     if(global.kag!==k) return 'kag changed';
     if(!this.hooked) {
      if(typeof k.showLineBreak=='Object') {this.oldLB=k.showLineBreak;k.showLineBreak=this.lb;}
      if(typeof k.showPageBreak=='Object') {this.oldPB=k.showPageBreak;k.showPageBreak=this.pb;}
      if(typeof k.showPageBreakAndClear=='Object') {this.oldPBC=k.showPageBreakAndClear;k.showPageBreakAndClear=this.pbc;}
      this.hooked=1;
     }
     if(this.timer===void && typeof global.Timer=='Object') {
      try {this.timer=new global.Timer(this.vis,'');this.timer.interval=100;this.timer.enabled=true;} catch(e) {this.timer=null;}
     }
     for(var i=this.recs.count-1;i>=0;i--) if(!isvalid this.recs[i].target) this.recs.erase(i);
     for(var i=this.wrapped.count-1;i>=0;i--) if(!isvalid this.wrapped[i]) this.wrapped.erase(i);
     for(var i=this.artSeen.count-1;i>=0;i--) if(!isvalid this.artSeen[i]) this.artSeen.erase(i);
     var pages=[k.fore,k.back];
     for(var i=0;i<pages.count;i++) {
      var ms=pages[i].messages;
      if(typeof ms!='Object' || ms===void || ms===null) continue;
      for(var j=0;j<ms.count && j<32;j++) this.install(ms[j]);
     }
     return 'ok layers='+this.recs.count+' lines='+this.line+' wait='+(this.oldLB!==void?1:0)+(this.oldPB!==void?1:0)+' wrapped='+this.wrapped.count+' draws='+this.calls+' hidden='+this.hid+' art='+this.art+' artLayers='+this.artSeen.count+' font='+this.fontNow()+' skipped='+this.skipped+(this.skippedCls!=''?'('+this.skippedCls+')':'');
    } catch(e) {return 'error '+e.message;}
   } incontextof st;
   global.__megulitKrkrState=st;
  }
  return st.refresh();
 } catch(e) {return 'error '+e.message;}
})())MGLT"
