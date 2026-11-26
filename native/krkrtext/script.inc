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
// The pieces below are separate literals (KrkrText.cpp ScriptParts, joined at run time): MSVC limits one piece to 8,190
// wide units and a concatenated literal to 32,767.
// The end text keeps the game's own line breaks: a character drawn on a new row starts with a newline.
// E321/E550: begin and end lines carry color=rrggbb, the layer's chColor for the sentence's last character: games draw read and
// unread text in different colours, and the reader paints each page line in the colour the game used.
// Text architecture ③ (docs/text-architecture.md): every sentence also ends with one record holding the box of each
// character it drew (x, y, the drawing font's width of the character, the font size), in game-screen pixels:
//   ToMe_CHARS engine=krkr line=N hidden=0|1 sw= sh= vx=0 vy=0 vw=0 vh=0 n= rects=x,y,w,h;... text=...
// hidden=1 only when the sentence's glyphs really went through the opacity-0 drawing below (st.hid grew) and it is still on.
LR"MGLT((function(){
 try {
  if(typeof global.kag!='Object' || global.kag===void || global.kag===null) return 'wait kag';
  var k=global.kag;
  if(typeof k.fore!='Object' || k.fore===void) return 'wait fore';
  /* 2026-11-12 (ファタモルガーナの館: "メンバ __megulitKrkrState が見つかりません"): reading a missing member throws on some
     KiriKiri builds; typeof does not */
  var st=(typeof global.__megulitKrkrState=='Object')?global.__megulitKrkrState:void;
  if(st===void) {
   st=%['skipped'=>0,'drawArgs'=>void,'drawOp'=>0,'drawLo'=>256,'drawQuiet'=>0,'lastEnd'=>void,'charsSent'=>0,'charsErr'=>'','trWrapped'=>0,'trLine'=>0,'trText'=>'','trKey'=>'','trOp'=>void,'trT'=>void,'trOwner'=>void,'trRec'=>void,'skippedCls'=>'','lastFont'=>'','pfontName'=>void,'art'=>0,'artText'=>'','artSeen'=>[],'calls'=>0,'hid'=>0,'link'=>0,'choiceDraws'=>0,'clears'=>0,'wrapped'=>[],'recs'=>[],'active'=>void,'lastVis'=>-1,'timer'=>void,'line'=>0,'report'=>global.__megulitKrkrReport,'kag'=>k,'hooked'=>0,'oldLB'=>void,'oldPB'=>void,'oldPBC'=>void];
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
    if(rec.role=='name') return; /* engine-draw: a name plate is no sentence of the page */
    var s='ToMe_KRKR '+kind+' line='+rec.line+' same='+rec.same+' nvl='+rec.nvl+' x0='+int(x0)+' y0='+int(rec.y0)+' x1='+int(x1)+' y1='+int(rec.y1)+' size='+int(rec.size)+' sw='+int(rec.sw)+' sh='+int(rec.sh)+' n='+rec.n;
    if(rec.color>=0) {var h='',v=rec.color;for(var i=0;i<6;i++) {h='0123456789abcdef'.charAt(v&15)+h;v=v>>4;} s+=' color='+h;}
    if(typeof rec.paint=='String' && rec.paint!='') s+=' paint='+rec.paint;
    if(kind=='end') s+=' text='+rec.text;
    this.report(s);
   } incontextof st;
   /* What this sentence is really drawn with, for the reader to paint it the same (read / unread colours, dimming, outline):
      paint=f:rrggbbaa[,e:rrggbbaa:width][,s:rrggbbaa:dx:dy]. From the arguments of the line layer's own drawText call
      (this.drawArgs, kept by __megulitDraw before anything is changed); a layer that is not wrapped reports the KAG fields
      processCh draws from (chColor, edge / edgeColor / edgeExtent / edgeEmphasis, shadow / shadowColor). */
   st.hex=function(v,n){var h='';v=int(v);for(var i=0;i<n;i++) {h='0123456789abcdef'.charAt(v&15)+h;v=v>>4;} return h;} incontextof st;
   st.paintOf=function(L){
    try {
     var a=this.drawArgs;this.drawArgs=void;
     if(a!==void && a.count>=4) {
      /* a game that fades each character in draws it several times with a rising opacity: the sentence's opacity is the
         highest one it was drawn with (a dimmed read line is drawn at one constant opacity) */
      var op=a.count>4?+a[4]:255;if(op<this.drawOp) op=this.drawOp;if(op<0) op=0;if(op>255) op=255;
      var s='f:'+this.hex(+a[3]&0xffffff,6)+this.hex(op,2);
      var lv=a.count>6?+a[6]:0;if(lv>255) lv=255;
      if(lv>0) {
       var sc=a.count>7?(+a[7]&0xffffff):0,sw=a.count>8?+a[8]:0,ox=a.count>9?+a[9]:0,oy=a.count>10?+a[10]:0;
       if(ox==0 && oy==0) s+=',e:'+this.hex(sc,6)+this.hex(lv,2)+':'+int(sw);
       else s+=',s:'+this.hex(sc,6)+this.hex(lv,2)+':'+int(ox)+':'+int(oy);
      }
      return op<255?s+',a:1':s; /* not settled until st.fade says so */
     }
     if(typeof L.chColor!='Integer') return '';
     var s='f:'+this.hex(L.chColor&0xffffff,6)+'ff';
     if(L.edge && typeof L.edgeColor=='Integer') {var em=(typeof L.edgeEmphasis=='Integer')?+L.edgeEmphasis:255;if(em>255) em=255;if(em>0) s+=',e:'+this.hex(L.edgeColor&0xffffff,6)+this.hex(em,2)+':'+((typeof L.edgeExtent=='Integer')?int(L.edgeExtent):1);}
     else if(L.shadow && typeof L.shadowColor=='Integer') s+=',s:'+this.hex(L.shadowColor&0xffffff,6)+'ff:2:2';
     return s;
    } catch(e) {return '';}
   } incontextof st;
)MGLT", LR"MGLT(
   st.track=function(rec,ch,lm,p0,oy,nativeRuby){
    var L=rec.target;
    if(L.vertical) return;
    var scr=this.screen(),sw=scr[0],sh=scr[1],role='line';
    if(!(sw>0) || !(sh>0)) return;
    /* engine-draw roles (draw.roles, docs/engine-draw-protocol.md): a layer under 20 % of the screen is a name plate, reported as
       role=name; without roles it is left out as before */
    var il=-1;try {if(typeof L.inLink!='undefined') il=+L.inLink;} catch(e) {}
    var choice=il>=0 || this.choicePage(L);if(choice && !this.cfg.roles) return;
    if(!choice && L.height<sh*0.2) {if(!this.cfg.roles) return;role='name';}
    var size=+L.fontSize;
    if(!(size>0)) {size=+L.font.height;if(size<0) size=-size;} /* no Math here: in a function bound to the state dictionary a bare global name reads as void */
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
    /* engine-draw: a character drawn inside [link]...[endlink] (KAG MessageLayer.inLink >= 0) is a choice, never dialogue */
    if(this.cfg.roles) {if(il>=0) {this.linkCh(rec,L,il,ch,cx,cy,size,sw,sh);return;}if(this.choicePage(L)) {this.linkCh(rec,L,'R'+int(cy),ch,cx,cy,size,sw,sh);return;}}
    if(rec.n==0) {
     if(role=='line') this.fontReport(L);
     rec.role=role;rec.ra=[];rec.rb=[];rec.args=void;
     rec.line=++this.line;this.active=rec;rec.x0=cx;rec.y0=cy;rec.x1=cx;rec.y1=cy;rec.size=size;rec.text='';rec.sw=sw;rec.sh=sh;
     rec.nvl=L.height>=sh*0.45?1:0;rec.same=rec.cleared?0:1;rec.cleared=false;rec.rs='';rec.cn=0;rec.hc=0;rec.ct='';
     rec.color=-1;rec.paint=''; /* a missing colour belongs to this sentence, never the previous draw */
     {var pt=this.paintOf(L);if(pt!='') rec.paint=pt;}
     if(typeof L.chColor=='Integer') rec.color=L.chColor&0xffffff; /* E550: begin carries the colour too (narration grey / speech white), before the line is shown */
     var right=a[0]+L.width-(+L.marginR)-size;
     if(!(right>cx)) right=cx;
     rec.bx0=cx;rec.bx1=right;rec.settled=0;
     this.send('begin',rec,cx,right);
    }
    if(ch!='\n' && ch!='\r') {
     if(rec.n>0 && cy!=rec.ly) rec.text+='\n';rec.text+=ch;
     var cw=size;try {cw=+this.drawFont(L).getTextWidth(ch);} catch(e) {cw=size;}if(!(cw>0)) cw=size;
     /* blanks get no box (the record's text has none); a character counts as hidden when it was drawn while hiding was on */
     if(ch!=' ' && ch!='　' && ch!="\t") {if(role=='line' && typeof nativeRuby=='String' && nativeRuby!='' && rec.rb.count<64) rec.rb.add([rec.cn,1,nativeRuby]);rec.rs+=(rec.cn>0?';':'')+int(cx)+','+int(cy)+','+int(cw)+','+int(size);rec.cn++;rec.ct+=ch;rec.ra.add([cx,cy,cw,size]);if(role=='line' && this.hideMsg()) rec.hc++;} else rec.ct+='';
     if(this.embArgs!==void) rec.args=this.embArgs;
    }
    rec.ly=cy;
    rec.n++;
    {var pt=this.paintOf(L);if(rec.settled && this.drawLo!=this.drawOp) rec.settled=0;if(pt!='') rec.paint=rec.settled?this.settle(pt):pt;}
    if(typeof L.chColor=='Integer') rec.color=L.chColor&0xffffff;
    if(cx<rec.x0) rec.x0=cx;
    if(cx>rec.x1) rec.x1=cx;
    if(cy<rec.y0) rec.y0=cy;
    if(cy>rec.y1) rec.y1=cy;
   } incontextof st;
   st.chars=function(rec){
    if(!(rec.cn>0)) return;
    /* the glyphs stay as drawn: a sentence is hidden when every one of its characters went through the opacity-0 draw */
    var h=(rec.role!='name' && rec.hc>=rec.cn)?1:0;this.charsSent++;
    var t='',row='',c;
    for(var j=0;j<rec.text.length;j++) {c=rec.text.charAt(j);if(c=="\n") {if(row!='') t+=(t!=''?"\n":'')+row;row='';} else if(c!=' ' && c!='　' && c!="\t") row+=c;}
    if(row!='') t+=(t!=''?"\n":'')+row;
    rec.head='ToMe_CHARS engine=krkr line='+rec.line+' hidden='+h+' sw='+int(rec.sw)+' sh='+int(rec.sh)+' vx=0 vy=0 vw=0 vh=0 n='+rec.cn+' rects='+rec.rs;rec.tt=t;
    var prefix=rec.head+(rec.role=='name'?' role=name':'');rec.rubyField=this.rubyWire(rec.rb);
    if((prefix+rec.rubyField+' text='+t).length>=28000) rec.rubyField='';
    this.report(prefix+rec.rubyField+' text='+t);
    if(rec.role!='name') rec.sentLine=rec.line;
   } incontextof st;
   /* 2026-11-21 (owner's recording, ファタモルガーナの館 1.4.22 v3, 02:57Z: after every click the line just read came back for about
      0.7 s in white without ruby, and now and then the game's own text took over): the game clears its message layer at the click
      ([cm] -> MessageLayer.clear) after the sentence was already reported (its end came at the click wait), so nothing said the
      line had left the screen. The placement kept it as the current line while the reader moved on, and the reader's orphan path
      drew that hidden line from its boxes after 450 ms (or gave way to the game when it could not). With page.reportClear (the
      game's diff, control file #clearline) the cleared line is reported once more, empty and not hidden: it leaves the placement */
   st.clearSent=function(rec){
    if(!this.cfg.clear || !(rec.sentLine>0) || rec.sentLine!=rec.line) return;
    rec.sentLine=0;this.clears++;
    this.report('ToMe_CHARS engine=krkr line='+rec.line+' hidden=0 sw='+int(rec.sw)+' sh='+int(rec.sh)+' vx=0 vy=0 vw=0 vh=0 n=0 rects= text=');
   } incontextof st;
)MGLT", LR"MGLT(
   st.flush=function(rec,clearing){
    /* kept for st.fade: a game that fades characters in is still raising their opacity after the click wait began */
    if(rec.n>0) {try {this.lastEnd=%['line'=>rec.line,'same'=>rec.same,'nvl'=>rec.nvl,'y0'=>rec.y0,'y1'=>rec.y1,'size'=>rec.size,'sw'=>rec.sw,'sh'=>rec.sh,'n'=>rec.n,'color'=>rec.color,'paint'=>rec.paint,'text'=>rec.text,'x0'=>rec.x0,'x1'=>rec.x1,'op'=>this.drawOp,'lo'=>this.drawLo,'q'=>0,'done'=>(this.drawOp>=255 || rec.settled)?1:0];} catch(e) {this.lastEnd=void;}}
    if(rec.n>0) {this.send('end',rec,rec.x0,rec.x1);try {this.chars(rec);} catch(e) {this.charsErr=e.message;}}
    var q=void;if(rec.n>0 && !clearing) {try {q=this.embQueue(rec);} catch(e) {q=void;}}
    rec.n=0;rec.text='';rec.rs='';rec.cn=0;rec.hc=0;rec.ct='';rec.settled=0;this.drawOp=0;this.drawLo=256;this.drawQuiet=0;
    if(q!==void) {this.embPend=q;this.embTry();}
   } incontextof st;
   /* the finished sentence was drawn again with a higher opacity (fade-in still running): its end record is sent again with the
      opacity it has now, so the reader never keeps a sentence at the faint first step */
   /* Is a sentence drawn below full opacity dimmed (read text) or still fading in? One draw cannot tell, so the paint carries
      a:1 ("opacity not settled") until it is known, and the reader paints such a sentence opaque:
        - draws at different opacities = a fade-in: it settles only at full opacity;
        - every draw at one opacity and nothing drawn for three ticks (0.3 s) = dimmed: settled, a:1 dropped, sent again
          (as a begin while the sentence is still being typed, as an end after its click wait began).
      Run every 100 ms from the visibility timer. */
   st.settle=function(p){p=''+p;var n=p.length;return (n>4 && p.substring(n-4)==',a:1')?p.substring(0,n-4):p;} incontextof st;
   st.fade=function(){
    var a=this.active;
    if(a!==void && a!==null && a.n>0) {
     this.lastEnd=void;
     if(this.drawQuiet<1000) this.drawQuiet++;
     if(!a.settled && this.drawQuiet>=3 && this.drawOp>0 && this.drawOp<255 && this.drawLo==this.drawOp && (''+a.paint).substring(0,2)=='f:') {a.settled=1;a.paint=this.settle(a.paint);this.send('begin',a,a.bx0,a.bx1);}
     return;
    }
    var r=this.lastEnd;if(r===void || r===null) return;
    var p=''+r.paint;if(p.length<10 || p.substring(0,2)!='f:') return;
    if(this.drawOp>0) {
     if(this.drawLo<r.lo) r.lo=this.drawLo;
     var up=this.drawOp>r.op;if(up) r.op=this.drawOp;
     this.drawOp=0;this.drawLo=256;r.q=0;
     if(up) {p=this.settle(p);r.paint=p.substring(0,8)+this.hex(r.op>255?255:r.op,2)+p.substring(10)+(r.op<255?',a:1':'');r.done=r.op>=255?1:0;this.send('end',r,r.x0,r.x1);}
     return;
    }
    if(r.done) return;
    if(++r.q>=3 && r.op<255 && r.lo==r.op) {r.done=1;r.paint=this.settle(p);this.send('end',r,r.x0,r.x1);}
   } incontextof st;
   st.flushAll=function(){for(var i=0;i<this.recs.count;i++) this.flush(this.recs[i]);} incontextof st;
   /* 2026-11-12 (user: the game must think it draws its text while the output is ours): while MeguLit asks for it
      (__megulitKrkrHide()==1, only with HookBridge connected), a message layer draws its glyphs, ruby and shadows at opacity
      0. Layout, wrapping and the click wait are the engine's own; MeguLit draws the readable text at the reported place.
      Never break the game (a probe that wrapped a layer twice once raised "メンバ old が見つかりません"): each layer is
      wrapped once, its own method is kept on the layer (__mgOld), the wrapper is bound to that layer, and when it is called
      on anything else, or anything fails, the engine's native Layer.drawText draws with the game's own arguments. */
   st.hideOn=function(){try {return typeof global.__megulitKrkrHide=='Object' && global.__megulitKrkrHide()==1;} catch(e) {return false;}} incontextof st;
   /* engine-draw: with draw.embed on the game draws its own (and MeguLit's) text on the processCh path, so it is never hidden there */
   st.hideMsg=function(){return !this.cfg.embed && this.hideOn();} incontextof st;
   /* engine-draw roles: a name plate or [link] text is never hidden (the reader only annotates it, the game keeps drawing it) */
)MGLT", LR"MGLT(
   /* a choice page = a message layer showing a frame picture the game's diff names (choice.pageFrames, regular expressions on
      MessageLayer.frameGraphic; ファタモルガーナの館: ^選択肢$, the frame its [choice] macro puts on message0). No list = no choice page */
   st.choicePage=function(P){try {var rs=this.cfg.choiceFrames;if(typeof rs!='Object' || rs===void || rs.count==0 || typeof P.frameGraphic=='undefined') return false;var f=''+P.frameGraphic;if(f=='') return false;for(var i=0;i<rs.count;i++) if(rs[i].test(f)) return true;return false;} catch(e) {return false;}} incontextof st;
   st.uiDraw=function(ll){
    try {var P=ll.parent;if(P===void || P===null || !isvalid P) return '';
     if(typeof P.inLink!='undefined' && +P.inLink>=0) return 'link';
     /* 2026-11-21 (1.4.22 owner test, ファタモルガーナの館: the option box empty but for its lines, krkr link=0 hidden=all): the
        options are plain message text on a choice page (no [link]), drawn as the game asks like link text */
     if(this.choicePage(P)) return 'choice';
     if(!this.cfg.roles) return '';
     var sh=this.screen()[1];return (sh>0 && P.height<sh*0.2)?'name':'';} catch(e) {return '';}
   } incontextof st;
   if(typeof global.__megulitDraw!='Object') global.__megulitDraw=function(args*){
    var self=this,old=void;
    try {if(typeof self.__mgOld=='Object') old=self.__mgOld;} catch(e) {}
    if(old===void) old=global.Layer.drawText;
    try {
     var st=global.__megulitKrkrState;
     if(typeof st=='Object' && st!==void) {
      if(self.__mgKind=='msg') {
       st.calls++;
       {var d=[];d.assign(args);st.drawArgs=d;st.embArgs=d;var o=d.count>4?+d[4]:255;if(o>st.drawOp) st.drawOp=o;if(o<st.drawLo) st.drawLo=o;st.drawQuiet=0;}
       /* 2026-11-21 (ファタモルガーナの館 incr11 23:33:41Z: the option 「……おはよう………………」 was drawn at opacity 0 with the dialogue and
          nothing drew it back: link text has no click wait, so no sentence end, no box). Text drawn while the message layer is
          inside a link (KAG MessageLayer.inLink >= 0) is a choice button: the game draws it as it is (its text and its click area
          stay), the choice overlay adds ruby and translation next to it. engine-draw: one rule with the role report (st.uiDraw):
          link text always, name plates with draw.roles */
       var ui=st.uiDraw(self);if(ui=='link') st.link++;else if(ui=='choice') st.choiceDraws++;
       if(st.hideMsg() && ui=='') {
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
)MGLT", LR"MGLT(
   st.install=function(L){
    try {if(typeof L.lineLayer=='Object') this.wrapDraw(L.lineLayer);} catch(e) {}
    for(var i=0;i<this.recs.count;i++) if(this.recs[i].target===L) return;
    if(typeof L.processCh!='Object') return;
    var rec=%['target'=>L,'st'=>this,'oldCh'=>L.processCh,'oldClear'=>void,'n'=>0,'text'=>'','line'=>0,'same'=>0,'cleared'=>true,'nvl'=>0,'x0'=>0,'y0'=>0,'x1'=>0,'y1'=>0,'size'=>0,'sw'=>0,'sh'=>0,'ly'=>0,'color'=>-1,'paint'=>'','role'=>'line','ra'=>[],'args'=>void,'lk'=>void,'lkDirty'=>0,'lkQuiet'=>0,'lkSw'=>0,'lkSh'=>0,'head'=>'','tt'=>'','sentLine'=>0];
    rec.ch=function(ch){
     /* engine-draw: the Chinese drawn under the last sentence goes when the next sentence of the same page starts */
     try {var bk=this.st.embBk;if(bk!==void && bk.L===this.target) this.st.embRestore();} catch(e) {}
     var L=this.target,lm=false,p0=0,oy=0,nativeRuby='';
     try {if(typeof L.currentRuby=='String') nativeRuby=''+L.currentRuby;} catch(e) {}
     try {
      var t=typeof L.lineLayerPos;
      if(typeof L.lineLayer=='Object' && L.lineLayer!==void && L.lineLayer!==null && (t=='Integer' || t=='Real')) {lm=true;p0=+L.lineLayerPos;oy=+L.lineLayerOriginY;}
      else {p0=+L.x;oy=+L.y;}
     } catch(e) {}
     if(typeof this.oldCh!='Object') return (global.MessageLayer.processCh incontextof this)(...);
     var result=(this.oldCh incontextof L)(...);
     try {this.st.track(this,ch,lm,p0,oy,nativeRuby);} catch(e) {}
     return result;
    } incontextof rec;
    rec.clr=function(){
     try {this.st.flush(this,true);this.st.clearSent(this);this.cleared=true;this.st.linkClear(this);var bk=this.st.embBk;if(bk!==void && bk.L===this.target) {if(bk.tr) this.st.embRestore(); else this.st.embDrop();}} catch(e) {}
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
   /* Text architecture ③, engines on the TextRender plugin (textrender.dll; Yuzusoft KiriKiri Z, live 千恋＊万花
      2026-11-14): the message layer's text is drawn natively into its textLayer, never through processCh / drawText.
      TextRender.done (wrapped once on the class, which reaches every instance) is followed by getCharacters(0, n):
      each entry has text, x, y (render box), cw, size. The box sits at the message layer's margins; PreRenderFontEx
      pads its glyph cells by resizePadding. Hiding = that textLayer at opacity 0 (only the dialogue is on it), back
      to the game's own opacity as soon as MeguLit stops asking. */
   st.trLayer=function(){
    try {
     var c=this.kag.current;if(c!==void && c!==null && isvalid c && typeof c.textLayer=='Object' && c.textLayer!==void && c.textLayer!==null) return c;
     var ms=this.kag.fore.messages;for(var i=0;i<ms.count;i++) {var L=ms[i];if(L.visible && typeof L.textLayer=='Object' && L.textLayer!==void && L.textLayer!==null) return L;}
    } catch(e) {}
    return void;
   } incontextof st;
   st.trOwn=function(inst,L){
    try {if(inst===L.textLayer || (typeof inst.textLayer=='Object' && inst.textLayer!==void && inst.textLayer===L.textLayer)) return true;
     /* 2026-11-19 live 千恋＊万花: the plugin's renderers are bound to no layer (no textLayer member); one is the dialogue's
        only while KAG is writing to that very message layer */
     return typeof inst.textLayer=='undefined' && L===this.kag.current;} catch(e) {return false;}
   } incontextof st;
   st.trRestore=function(){
    try {if(this.trOp!==void && isvalid this.trT) {if(this.trT.opacity==0) this.trT.opacity=this.trOp;}} catch(e) {}
    this.trOp=void;this.trT=void;
   } incontextof st;
   /* A TextRender buffer can hold both dialogue and clickable link text. Keep that buffer visible while
      the engine owns links; opacity zero would erase choices together with the dialogue. */
   st.trUi=function(L){try {return typeof L.numLinks!='undefined' && +L.numLinks>0;} catch(e) {return false;}} incontextof st;
   st.trHide=function(){
    try {
     if(typeof this.trRolesOff=='Object') this.trRolesOff();
     var L=this.trLayer();
     /* 2026-11-26 (integration live test, 死に逝く君、館に芽吹く憎悪, every line of 血塗れの男: trwhy switch cur=f0 owner=b0): the game writes the
        line on the back page and [trans] copies that page onto the front one, so the glyphs on screen are the front twin's, never rendered
        there. The record moves to the front twin and that one is hidden (same line, same boxes) instead of the line being retired */
     if(this.trRec!==void && L!==void && this.trOwner!==L && this.shown(L) && this.trTwin(this.trOwner,L)) {this.trRestore();this.trOwner=L;if(this.trAllL!==void) {this.trAllL=L;try {L.__mgTrAll=this.trAll;} catch(e) {}}this.trNote('carry');}
     if(this.trRec!==void && (L===void || this.trOwner!==L || !this.shown(L))) {this.trNote(L===void?'away':(this.trOwner!==L?'switch':'unshown'));this.trClear(this.trOwner);return;}
     if(L===void || this.trOwner!==L || this.trRec===void) {this.trRestore();return;}
     if(this.trUi(L)) {this.trClear(L);return;}
     var T=L.textLayer,on=this.hideOn() && !(typeof this.cfg=='Object' && this.cfg.embed);
     if(this.trUi(L)) on=false;
     if(this.trT!==void && this.trT!==T) this.trRestore();
     if(on) {if(this.trOp===void || this.trT!==T) {this.trT=T;this.trOp=T.opacity;}
      /* a value other than 0 was set by the game since the last tick (its text window came back after a scene change): that is the game's own opacity now */
      if(T.opacity!=0) this.trOp=T.opacity;if(T.opacity!=0) T.opacity=0;}
     else this.trRestore();
     /* the line on screen changes its hidden state without a new render: send its record again */
     var h=(on && T.opacity==0)?1:0;
     if(this.trRec!==void && h!=this.trRec[0]) {this.trRec[0]=h;var r=this.trRec;this.trKey='';this.report('ToMe_CHARS engine=krkr line='+r[1]+' hidden='+h+r[2]);}
    } catch(e) {}
   } incontextof st;
)MGLT", LR"MGLT(
   st.trTwin=function(a,b){try {var bk=this.kag.back.messages,fr=this.kag.fore.messages;for(var i=0;i<bk.count && i<fr.count;i++) if(bk[i]===a) return fr[i]===b;} catch(e) {}return false;} incontextof st;
   st.trNote=function(k){
    try {if(typeof this.trWhy!='Object' || this.trWhy===void) this.trWhy=%[];var n=(+this.trWhy[k])+1;this.trWhy[k]=n;
     if(n==1 || n==2 || n==4 || n==8 || n==16 || n==64 || n==256) this.report('ToMe_KRKR status trwhy '+k+'='+n+' sent='+(+this.charsSent));} catch(e) {}
   } incontextof st;
)MGLT", LR"MGLT(
   st.trClear=function(L){
    try {L.__mgTrAll=void;} catch(e) {}
    if(this.trOwner!==L) return;
    var line=this.trRec!==void?this.trRec[1]:0,scr=this.screen();this.trRestore();
    if(typeof this.embTrOff=='Object') this.embTrOff();this.embPend=void;
    this.trRec=void;this.trText='';this.trKey='';this.trPts=void;this.trCol=void;this.trAll=void;this.trAllL=void;
    if(line>0) this.report('ToMe_CHARS engine=krkr line='+line+' hidden=0 sw='+int(scr[0])+' sh='+int(scr[1])+' vx=0 vy=0 vw=0 vh=0 n=0 rects= text=');
   } incontextof st;
   st.trDone=function(inst){
    try {
     /* 2026-11-19 why a TextRender line was not reported (live 千恋＊万花: no record at all, the reader stayed in its own box): counted per reason, on the status line */
     if(typeof this.trWhy!='Object' || this.trWhy===void) this.trWhy=%[];
     var L=this.trLayer();if(L===void) {this.trNote('layer');return;}if(!this.trOwn(inst,L)) {this.trNote('own');return;}
     var scr=this.screen();if(!(scr[1]>0)) {this.trNote('scr');return;}if(L.height<scr[1]*0.2) {this.trNote('small');return;}if(!this.shown(L)) {this.trClear(L);this.trNote('hid');return;}
     var cs=(inst.getCharacters incontextof inst)(0,100000);if(typeof cs!='Object' || cs===null) {this.trClear(L);this.trNote('empty');return;}
     if(cs.count==0) {this.trClear(L);this.trNote('empty');return;}
     if(cs.count>4000) {this.trClear(L);this.trNote('limit');return;}
     var a=this.abs(L),ox=a[0]+(+L.marginL),oy=a[1]+(+L.marginT),pad=0;
     try {var pf=L.textLayer._preRenderFontEx;if(typeof pf=='Object' && pf!==void && typeof pf.resizePadding=='Integer') pad=pf.resizePadding;} catch(e) {}
     var rs='',n=0,t='',ly=void,all=[],pts=[];
     for(var i=0;i<cs.count;i++) {
      var c=cs[i],ch=''+c.text;if(ch=='' || ch==' ' || ch=='　' || ch=="\t" || ch=="\n") continue;
      var y=+c.y;if(ly!==void && y!=ly) t+="\n";ly=y;t+=ch;
      rs+=(n>0?';':'')+int(ox+(+c.x))+','+int(oy+y+pad)+','+int(+c.cw)+','+int(+c.size);n++;
      if(all.count<4000) all.add([ox+(+c.x),oy+y+pad,+c.cw,+c.size,ch]);
     }
     /* 2026-11-21 (owner incr9, 千恋＊万花): a line written back blank (the hide fell back to write-back) lays out only spaces: counted, so the status line says so */
     if(n==0) {this.trClear(L);this.trNote('blank');return;}
     /* A mixed link buffer stays native. Retire its dialogue proof and retain glyphs only for the choice producer. */
     if(this.trUi(L)) {if(this.trOwner!==void) this.trClear(this.trOwner);this.trRestore();this.trAll=all;this.trAllL=L;L.__mgTrAll=all;return;}
     if(this.trOwner!==L) {if(this.trOwner!==void) this.trClear(this.trOwner);this.trRestore();this.trRec=void;this.trOwner=L;this.trText='';this.trKey='';}
     var flat=t.replace(/\n/g,'');
     var from=0;
     if(!(this.trText!='' && (flat.indexOf(this.trText)==0 || this.trText.indexOf(flat)==0))) {this.trLine++;this.trCol=void;this.trTry=0;if(typeof this.embTrOff=='Object') this.embTrOff();}
     /* a page that grew by a sentence: its colour is that sentence's own (a read line above a new one keeps its yellow) */
     else if(flat.length>this.trText.length+1 && flat.indexOf(this.trText)==0) {from=this.trText.length;this.trCol=void;this.trTry=0;}
     for(var i=from;i<all.count && pts.count<6;i++) pts.add(all[i]);
     var T=L.textLayer,h=(this.hideOn() && T.opacity==0)?1:0,scr=this.screen();
     var key=this.trLine+'|'+h+'|'+rs+'|'+t;if(key==this.trKey) return;this.trKey=key;this.trText=flat;this.charsSent++;
     this.trPts=pts;this.trAbsL=a;this.trTailA=' sw='+int(scr[0])+' sh='+int(scr[1])+' vx=0 vy=0 vw=0 vh=0 n='+n+' rects='+rs;this.trTailB=' text='+t;
     var tail=this.trTailA+(this.trCol!==void?' color='+this.trCol:'')+this.trTailB;
      var record='ToMe_CHARS engine=krkr line='+(100000+this.trLine)+' hidden='+h+tail;
      /* The native report function drops records at 28000 UTF-16 units. Never hide a snapshot it cannot forward. */
      if(record.length>=28000) {this.trClear(L);this.trNote('wire');return;}
     this.trRec=[h,100000+this.trLine,tail];
      this.report(record);
     this.trAll=all;this.trAllL=L;
     /* Keep link characters with their actual message-layer owner, not whichever layer rendered last. */
     L.__mgTrAll=all;
     try {if(typeof this.cfg=='Object' && this.cfg.embed) {this.embPend=this.embTrQueue(L,all,flat,from,t,h);this.embTry();}} catch(e) {this.charsErr='trEmb '+e.message;}
     this.trHide();
    } catch(e) {try {if(L!==void && this.trOwner===L) this.trClear(L);} catch(ignored) {}this.charsErr='tr '+e.message;}
   } incontextof st;
)MGLT", LR"MGLT(
   /* 2026-11-19 live 死に逝く君、館に芽吹く憎悪: a TextRender game paints read lines yellow and new ones white without touching
      chColor, so the record carries the colour the glyphs really have: the most common opaque pixel inside the first
      characters' boxes of the (possibly opacity-0) text layer, sampled once the typewriter has drawn them. */
   st.trSample=function(){
    if(this.trRec===void || this.trCol!==void || this.trPts===void || this.trOwner===void) return;
    if(this.trTry===void) this.trTry=0;if(++this.trTry>40) return;
    var T=this.trOwner.textLayer;if(typeof T!='Object' || T===void || T===null) return;
    /* a text layer that is not a child of its message layer is that layer's own buffer, laid at the message layer's origin */
    var at=T.parent===this.trOwner?this.abs(T):this.trAbsL,cnt=%[],rep=%[],best='',bn=0,bestL='',bnL=0,lit=0,lv=-1,lb=0,w=+T.imageWidth,hh=+T.imageHeight,amin=this.trTry>10?0x40:0xc0,need=this.trPts.count<=4?3:6;
    for(var i=0;i<this.trPts.count;i++) {
     var p=this.trPts[i];
     for(var gy=1;gy<=6;gy++) for(var gx=1;gx<=6;gx++) {
      var x=int(p[0]-at[0]+p[2]*gx/7),y=int(p[1]-at[1]+p[3]*gy/7);
      if(x<0 || y<0 || x>=w || y>=hh) continue;
      var px=T.getMainPixel(x,y),rgb=px&0xffffff;
      /* a buffer drawn with holdAlpha keeps alpha 0: there the glyph body is its brightest pixel (edges blend to the background) */
      if(rgb!=0) {lit++;var lum=((rgb>>16)&255)+((rgb>>8)&255)+(rgb&255);if(lum>lv) {lv=lum;lb=rgb;}}
      /* a short sentence that fades in (live 死に逝く君: 窃盗。 器物破損。 got no colour) has few glyph pixels, still half transparent,
         in several anti-aliased shades: after a second half-transparent pixels count too (their colour is already the glyph's),
         and near shades are one colour (5 bits a channel, reported as the first full value seen) */
      if(((px>>24)&255)<amin) continue;
      var k=''+(((rgb>>19)&31)<<10 | ((rgb>>11)&31)<<5 | ((rgb>>3)&31)),c=cnt[k];if(c===void) {c=0;rep[k]=rgb;}c++;cnt[k]=c;if(c>bn) {bn=c;best=''+rep[k];}
      /* the most common colour that is not near black, kept apart: a dark outline can outnumber a thin fill */
      if(((rgb>>16)&255)+((rgb>>8)&255)+(rgb&255)>=144 && c>bnL) {bnL=c;bestL=''+rep[k];}
     }
    }
    /* opaque glyph pixels already have their final colour: taken at the first tick (live 死に逝く君: 父親が死んだ。 was on screen for
       170 ms and got none); the brightest-pixel fallback still waits for the typewriter and any fade-in */
    /* ToMe_KRKR colorlog: one diagnostic record a sentence, what the sampler saw (HookBridge writes it to the log). Its own
       record: the status line is left alone (a status change stopped this path on live 千恋＊万花, see the report). */
    if(this.trTry==20 && bn<need && lit<3) this.report('ToMe_KRKR colorlog line='+this.trRec[1]+' col=- try=20 opaque='+bn+'/'+need+' lit='+lit);
    if(bn<need && (lit<3 || this.trTry<3)) return; /* a few ticks in: the typewriter and any fade-in have drawn the first glyphs */
    var h='',v=bn>=need?+best:lb,dk=0;
    /* the outline or shadow pass is drawn first and is near black; the reader drops a near-black colour as an outline, which
       leaves the sentence with no colour at all. A brighter colour holding a third as many pixels is the text. */
    if(bn>=need && bestL!='' && bnL*3>=bn) {var bd=+best;if(((bd>>16)&255)+((bd>>8)&255)+(bd&255)<144) {v=+bestL;dk=1;}}
    for(var i=0;i<6;i++) {h='0123456789abcdef'.charAt(v&15)+h;v=v>>4;}
    this.report('ToMe_KRKR colorlog line='+this.trRec[1]+' col='+h+' try='+this.trTry+' opaque='+bn+'/'+need+' lit='+lit+' bright='+bnL+' dark='+dk);
    this.trCol=h;var r=this.trRec;r[2]=this.trTailA+' color='+h+this.trTailB;this.trKey='';
    this.report('ToMe_CHARS engine=krkr line='+r[1]+' hidden='+r[0]+r[2]);
   } incontextof st;
   st.trWrap=function(){
    try {
     if(this.trWrapped || typeof global.TextRender!='Object' || global.TextRender===void) return;
     if(typeof global.TextRender.done!='Object' || typeof global.TextRender.getCharacters!='Object') return;
     /* bound to no context, so `this` is the TextRender instance the game calls done on; installed once per run */
     if(typeof global.__megulitTrHook!='Object') global.__megulitTrHook=function(args*){
      var r=(global.__megulitTrDone incontextof this)(args*);
      try {var st=global.__megulitKrkrState;if(typeof st=='Object' && st!==void) st.trDone(this);} catch(e) {}
      return r;
     };
     var d=global.TextRender.done;
     if(typeof global.__megulitTrDone!='Object') global.__megulitTrDone=d;
     global.TextRender.done=(global.__megulitTrHook incontextof null);
     this.trWrapped=1;
    } catch(e) {this.charsErr='trwrap '+e.message;}
   } incontextof st;
)MGLT", LR"MGLT(
   /* engine-draw (docs/engine-draw-protocol.md, owner 2026-11-21: the game's own renderer draws MeguLit's dialogue; buttons
      and choices are only reported, never replaced). MeguLit writes the control file global.__megulitKrkrCtlPath (set by
      KrkrText.cpp, UTF-16LE, read every 500 ms; no file = the behaviour before engine-draw):
        #cfg roles=0|1 embed=0|1 zh=0|1
        <sentence without blanks> TAB <start:len:reading|...> TAB <Chinese, U+001F = newline>
      roles: name plates (role=name), [link] text (role=choice, one record per link) and ButtonLayer captions (role=button)
      are reported as ToMe_CHARS with role / id / box. embed: at the sentence's click wait its ruby is drawn above it and its
      Chinese under it on the message layer itself, with the layer's font and the colour / edge / shadow arguments the
      sentence was drawn with; the sentence's record is then sent again with emb=1 (ruby) or emb=2 (ruby and Chinese). The
      Chinese is taken off again (the pixels under it put back) when the next sentence of the same page starts. */
   st.cfg=%['roles'=>0,'embed'=>0,'zh'=>1];st.embMap=%[];st.ctlRaw='';st.ctlTick=0;st.uiLine=0;st.btnKey='';st.embPend=void;st.embBk=void;st.embArgs=void;st.nameKey='';st.trLinkKey='';st.trAll=void;st.trAllL=void;
   /* ruby-v1, shared with TextRender: [[rect codepoint start,length,reading],...]. No pixel/hide authority. */
   st.rubyWire=function(spans){
    if(typeof spans!='Object' || spans===void || spans===null || spans.count==0 || spans.count>64) return '';
    var out='',end=0;
    for(var i=0;i<spans.count;i++) {
     var s=spans[i];if(typeof s!='Object' || s.count!=3) return '';
     var start=+s[0],len=+s[1],rd=s[2];if(start!=int(start) || len!=int(len) || start<end || len<1 || len>80 || start+len>4000 || typeof rd!='String' || rd=='' || rd.length>320) return '';
     var hex='',cp=0;
     for(var j=0;j<rd.length;j++) {
      var c=rd.charAt(j),u=#c;if(u<32 || (u>=127 && u<=159)) return '';
      if(u>=0xd800 && u<=0xdbff) {if(j+1>=rd.length) return '';var next=rd.charAt(j+1),v=#next;if(v<0xdc00 || v>0xdfff) return '';}
      else if(u>=0xdc00 && u<=0xdfff) {if(j==0) return '';var prev=rd.charAt(j-1),v=#prev;if(v<0xd800 || v>0xdbff) return '';}
      if(!(u>=0xdc00 && u<=0xdfff)) cp++;if(cp>160) return '';
      var h='';for(var k=0;k<4;k++) {h='0123456789abcdef'.charAt(u&15)+h;u=u>>4;}hex+=h;
     }
     out+=(i>0?'|':'')+int(start)+':'+int(len)+':'+hex;if(out.length>8192) return '';end=start+len;
    }
    return out!=''?' ruby='+out:'';
   } incontextof st;
)MGLT", LR"MGLT(
   st.ctlOff=function(){this.cfg=%['roles'=>0,'embed'=>0,'zh'=>1];this.embMap=%[];this.embPend=void;try {this.embRestore();} catch(e) {}} incontextof st;
   st.ctl=function(){
    var p=global.__megulitKrkrCtlPath;if(typeof p!='String' || p=='') {this.ctlOff();return;}
    var a;try {a=[].load(p);} catch(e) {this.ctlRaw='';this.ctlOff();return;}
    var raw=a.join("\n");if(raw==this.ctlRaw) return;this.ctlRaw=raw;
    if(a.count<1 || a.count>4000 || raw.length>524288) {this.ctlOff();return;}
    var t=''+a[0];if(t.length>0 && #t==0xfeff) t=t.substring(1);
    if(t!='#cfg' && t.substring(0,5)!='#cfg ') {this.ctlOff();return;}
    if(t.length>100) {this.ctlOff();return;}
    var c=%['roles'=>0,'embed'=>0,'zh'=>1],m=%[],seen=0,tail=t.substring(4);
    while(tail!='') {
     if(tail.charAt(0)!=' ') {this.ctlOff();return;}tail=tail.substring(1);var cut=tail.indexOf(' '),one=cut<0?tail:tail.substring(0,cut);tail=cut<0?'':tail.substring(cut);
     var bit=0;if(one=='roles=0' || one=='roles=1') {bit=1;c.roles=one=='roles=1'?1:0;}
     else if(one=='embed=0' || one=='embed=1') {bit=2;c.embed=one=='embed=1'?1:0;}
     else if(one=='zh=0' || one=='zh=1') {bit=4;c.zh=one=='zh=1'?1:0;}
     else if(one=='advhdInput=0' || one=='advhdInput=1') bit=8;
     else {this.ctlOff();return;}
     if((seen&bit)!=0) {this.ctlOff();return;}seen=seen|bit;
    }
    for(var i=1;i<a.count;i++) {
     t=''+a[i];if(t=='') continue;
     if(t.indexOf('#cfg')==0) {this.ctlOff();return;}
     if(t.charAt(0)=='#') {
      if(t=='#clearline') c.clear=1;
      else if(t.indexOf('#choiceframe ')==0) {try {if(typeof c.choiceFrames!='Object') c.choiceFrames=[];if(c.choiceFrames.count<20) c.choiceFrames.add(new global.RegExp(t.substring(13)));} catch(e) {}}
      continue;
     }
     var j=t.indexOf("\t");if(j<=0) continue;
     var k=t.substring(0,j),r=t.substring(j+1),z='',j2=r.indexOf("\t");if(j2>=0) {z=r.substring(j2+1);r=r.substring(0,j2);}
     m[k]=[r,z];
    }
    if(!c.embed) {this.embPend=void;try {this.embRestore();} catch(e) {}}
    this.cfg=c;this.embMap=m;
   } incontextof st;
   /* ---- roles: [link] text ---- */
   st.linkCh=function(rec,L,id,ch,cx,cy,size,sw,sh){
    if(rec.lk===void || rec.lk===null) rec.lk=%[];
    var o=rec.lk[id];if(o===void) {o=%['rs'=>'','cn'=>0,'t'=>'','x0'=>cx,'y0'=>cy,'x1'=>cx,'y1'=>cy,'ly'=>cy];rec.lk[id]=o;}
    rec.lkDirty=1;rec.lkQuiet=0;rec.lkSw=sw;rec.lkSh=sh;
    if(ch=="\n" || ch=="\r" || ch==' ' || ch=='　' || ch=="\t") return;
    var cw=size;try {cw=+this.drawFont(L).getTextWidth(ch);} catch(e) {cw=size;}if(!(cw>0)) cw=size;
    if(o.cn>0 && cy!=o.ly) o.t+="\n";o.ly=cy;o.t+=ch;
    o.rs+=(o.cn>0?';':'')+int(cx)+','+int(cy)+','+int(cw)+','+int(size);o.cn++;
    if(cx<o.x0) o.x0=cx;if(cy<o.y0) o.y0=cy;if(cx+cw>o.x1) o.x1=cx+cw;if(cy+size>o.y1) o.y1=cy+size;
   } incontextof st;
   st.layerIx=function(rec){for(var i=0;i<this.recs.count;i++) if(this.recs[i]===rec) return i;return 0;} incontextof st;
   /* one snapshot = every link of the layer under one line number; the reader replaces its older snapshot with it */
   st.sendLinks=function(rec){
    rec.lkDirty=0;if(rec.lk===void || rec.lk===null) return;
    var ix=this.layerIx(rec),line=++this.uiLine,ks=[],kl=-1;ks.assign(rec.lk);
    try {if(typeof rec.target.keyLink=='Integer') kl=+rec.target.keyLink;} catch(e) {}
    for(var i=0;i+1<ks.count;i+=2) {
     var id=ks[i],o=ks[i+1];if(o.cn==0) continue;
     this.report('ToMe_CHARS engine=krkr line='+line+' hidden=0 sw='+int(rec.lkSw)+' sh='+int(rec.lkSh)+' vx=0 vy=0 vw=0 vh=0 n='+o.cn+' rects='+o.rs+' role=choice id=L'+ix+':'+id+' box='+int(o.x0)+','+int(o.y0)+','+int(o.x1-o.x0)+','+int(o.y1-o.y0)+(kl>=0?' sel='+(kl==+id?1:0):'')+' text='+o.t);
    }
   } incontextof st;
   /* the layer was cleared: its links are gone (an empty snapshot) */
   st.linkClear=function(rec){
    if(rec.lk===void || rec.lk===null) return;rec.lk=void;rec.lkDirty=0;
    var scr=this.screen();
    this.report('ToMe_CHARS engine=krkr line='+(++this.uiLine)+' hidden=0 sw='+int(scr[0])+' sh='+int(scr[1])+' vx=0 vy=0 vw=0 vh=0 n=0 rects= role=choice id=L'+this.layerIx(rec)+': box=0,0,0,0 text=');
   } incontextof st;
   /* ---- roles: ButtonLayer captions on the front page (text buttons; picture buttons carry no text) ---- */
   st.btnWalk=function(L,d,out){
    try {
     if(L===void || L===null || d>6 || out.count>=40 || !isvalid L || !L.visible) return;
     var isB=0;try {isB=(L instanceof "ButtonLayer")?1:0;} catch(e) {isB=0;}
     if(isB && typeof L.caption=='String' && L.caption!='') {var a=this.abs(L);out.add('box='+int(a[0])+','+int(a[1])+','+int(L.width)+','+int(L.height)+' text='+L.caption);}
     var c=L.children;if(typeof c!='Object' || c===void || c===null) return;
     for(var i=0;i<c.count && i<128;i++) this.btnWalk(c[i],d+1,out);
    } catch(e) {}
   } incontextof st;
   st.btnScan=function(){
    var out=[],key='',scr=this.screen();
    this.btnWalk(this.kag.fore.base,0,out);
    for(var i=0;i<out.count;i++) key+=out[i]+"\x01";
    if(key==this.btnKey) return;this.btnKey=key;
    var line=++this.uiLine,head='ToMe_CHARS engine=krkr line='+line+' hidden=0 sw='+int(scr[0])+' sh='+int(scr[1])+' vx=0 vy=0 vw=0 vh=0 n=0 rects= role=button';
    if(out.count==0) {this.report(head+' box=0,0,0,0 text=');return;}
    for(var i=0;i<out.count;i++) this.report(head+' id=B'+i+' '+out[i]);
   } incontextof st;
)MGLT", LR"MGLT(
   /* ---- embed: ruby and Chinese drawn by the message layer itself ---- */
   st.embQueue=function(rec){
    if(!this.cfg.embed || rec.role=='name' || !(rec.cn>0) || rec.ra.count!=rec.cn) return void;
    var L=rec.target;if(L.vertical) return void;
    var x0=rec.ra[0][0];for(var i=1;i<rec.ra.count;i++) if(rec.ra[i][0]<x0) x0=rec.ra[i][0];
    return %['rec'=>rec,'L'=>L,'k'=>rec.ct,'ra'=>rec.ra,'size'=>rec.size,'nvl'=>rec.nvl,'args'=>rec.args,'head'=>rec.head,'t'=>rec.tt,'nativeRuby'=>rec.rb,'rubyField'=>(rec.rubyField!==void?rec.rubyField:this.rubyWire(rec.rb)),'x0'=>x0,'y1'=>rec.y1,'tries'=>0];
   } incontextof st;
   /* the replacement may come late (MeguLit looks it up when the sentence's record arrives): tried at the click wait and every
      tick after it until the page moves on */
   st.embTry=function(){
    var p=this.embPend;if(p===void || p===null) return;if(!this.cfg.embed) {this.embPend=void;return;}
    var r=p.rec;if(!isvalid p.L || (p.tr?(p.line!=this.trLine):(r.cleared || r.n>0)) || ++p.tries>40) {this.embPend=void;return;}
    var e=this.embMap[p.k];if(e===void || e===null) return;
    this.embPend=void;
    var lvl=this.embDraw(p,e);
    if(lvl>0) {var head=p.head+' emb='+lvl,field=p.rubyField!==void?p.rubyField:'';if((head+field+' text='+p.t).length>=28000) field='';this.report(head+field+' text='+p.t);}
   } incontextof st;
   st.embSpans=function(s){
    var out=[],t=''+s;
    while(t!='') {
     var j=t.indexOf('|'),one=j>=0?t.substring(0,j):t;t=j>=0?t.substring(j+1):'';
     var a=one.indexOf(':');if(a<=0) continue;var b=one.indexOf(':',a+1);if(b<=a) continue;
     var rd=one.substring(b+1);if(rd=='') continue;
     out.add([+one.substring(0,a),+one.substring(a+1,b-a-1),rd]);
    }
    return out;
   } incontextof st;
   /* greedy rows by the drawing font; a closing mark never starts a row */
   st.embWrap=function(f,z,w){
    var rows=[],row='',rw=0,t=''+z;
    for(var i=0;i<t.length;i++) {
     var c=t.charAt(i);
     if(c=="\x1f" || c=="\n") {rows.add(row);row='';rw=0;continue;}
     var cw=+f.getTextWidth(c);
     if(row!='' && rw+cw>w && '，。、！？；：」』）】…'.indexOf(c)<0) {rows.add(row);row='';rw=0;}
     row+=c;rw+=cw;
    }
    if(row!='') rows.add(row);
    return rows;
   } incontextof st;
   st.embDraw=function(p,e){
    var L=p.L,a=this.abs(L),f=L.font,oh=f.height,of=f.face,ob=f.bold,size=p.size,lvl=0,A=p.args;
    var col=(A!==void && A.count>3)?(+A[3]):((p.col!==void)?+p.col:((typeof L.chColor=='Integer')?+L.chColor:0xffffff));
    if(p.tr) this.embBackup(L,0,0,L.width,L.height,true);
    var aa=(A!==void && A.count>5)?A[5]:true,sl=(A!==void && A.count>6)?+A[6]:0,sc=(A!==void && A.count>7)?+A[7]:0,sw=(A!==void && A.count>8)?+A[8]:0,ox=(A!==void && A.count>9)?+A[9]:0,oy=(A!==void && A.count>10)?+A[10]:0;
    if(p.tr && A===void && p.edge!==void) {sl=255;sc=+p.edge;sw=1;}
    var dt=global.Layer.drawText;
    try {
     var df=this.drawFont(L);f.face=df.face;f.bold=df.bold;
     /* ruby: the layer's own ruby size when the game set one (KAG rubySize), centred over its base characters on their row */
     var rs=(typeof L.rubySize=='Integer' && L.rubySize>0)?+L.rubySize:int(size*0.45);if(rs<8) rs=8;
     var sp=this.embSpans(e[0]);f.height=rs;
     for(var i=0;i<sp.count;i++) {
      var s=sp[i],s0=int(s[0]),n=int(s[1]);if(s0<0 || n<1 || s0+n>p.ra.count) continue;
      var native=false;if(p.nativeRuby!==void) for(var ri=0;ri<p.nativeRuby.count;ri++) {var nr=p.nativeRuby[ri];if(s0<nr[0]+nr[1] && nr[0]<s0+n) native=true;}if(native) continue;
      var r0=p.ra[s0],m=1;while(m<n && p.ra[s0+m][1]==r0[1]) m++;
      var r1=p.ra[s0+m-1],bw=r1[0]+r1[2]-r0[0],tw=+f.getTextWidth(s[2]);
      (dt incontextof L)(int(r0[0]+(bw-tw)/2-a[0]),int(r0[1]-rs-1-a[1]),s[2],col,255,aa,sl,sc,sw,ox,oy);
     }
     lvl=1;
     /* Chinese under the sentence, on a full-screen page left to the reader (other sentences follow right under it) */
     if(this.cfg.zh && e[1]!='' && !p.nvl && this.embZh(p,L,a,f,e[1],[col,aa,sl,sc,sw,ox,oy])) lvl=2;
    } catch(err) {this.charsErr='emb '+err.message;}
    try {f.height=oh;f.face=of;f.bold=ob;} catch(err) {}
    return lvl;
   } incontextof st;
   st.embZh=function(p,L,a,f,z,g){
    var size=p.size,left=p.x0-a[0],mr=(typeof L.marginR=='Integer')?+L.marginR:0,mb=(typeof L.marginB=='Integer')?+L.marginB:0;
    var w=L.width-mr-left;if(w<size*4) return false;
    var gap=(typeof L.lineSpacing=='Integer')?+L.lineSpacing:int(size*0.3);if(gap<2) gap=2;
    var top=p.y1-a[1]+size+gap,bottom=L.height-mb;
    /* the game's size first; smaller only when the box has no room (never below 60 %) */
    for(var cs=int(size*0.8);cs>=int(size*0.6) && cs>=10;cs-=2) {
     f.height=cs;var rows=this.embWrap(f,z,w),pitch=cs+int(cs/4),h=rows.count*pitch;
     if(rows.count==0 || top+h-int(cs/4)>bottom) continue;
     if(!p.tr) this.embBackup(L,left,top,w,h);
     for(var i=0;i<rows.count;i++) (global.Layer.drawText incontextof L)(int(left),int(top+i*pitch),rows[i],g[0],255,g[1],g[2],g[3],g[4],g[5],g[6]);
     return true;
    }
    return false;
   } incontextof st;
   st.embBackup=function(L,x,y,w,h,tr){
    this.embRestore();
    try {
     var b=new global.Layer(this.kag,this.kag.primaryLayer);b.visible=false;b.setImageSize(int(w),int(h));
     b.copyRect(0,0,L,int(x),int(y),int(w),int(h));
     this.embBk=%['L'=>L,'b'=>b,'x'=>int(x),'y'=>int(y),'w'=>int(w),'h'=>int(h),'tr'=>tr?1:0];
    } catch(e) {this.embBk=void;}
   } incontextof st;
   st.embDrop=function(){var bk=this.embBk;this.embBk=void;try {if(bk!==void && isvalid bk.b) invalidate bk.b;} catch(e) {}} incontextof st;
   st.embRestore=function(){
    var bk=this.embBk;if(bk===void || bk===null) return;
    try {if(isvalid bk.L && isvalid bk.b) bk.L.copyRect(bk.x,bk.y,bk.b,0,0,bk.w,bk.h);} catch(e) {}
    this.embDrop();
   } incontextof st;
)MGLT", LR"MGLT(
   /* ---- engine-draw, KiriKiri Z TextRender (Yuzusoft; members read from 千恋＊万花's MessageLayer / TextRender bytecode: nameLayer,
      processNameText, links / numLinks / keyLink, defaultChColor / defaultEdge / defaultEdgeColor / defaultRubySize) ---- */
   st.embTrOff=function(){var bk=this.embBk;if(bk!==void && bk.tr) this.embRestore();} incontextof st;
   st.embTrQueue=function(L,all,flat,from,t,h){
    if(L.vertical || all.count!=flat.length || from>=all.count) return void;
    var ra=[],x0=1e9,y1=-1e9,size=0;
    for(var i=from;i<all.count;i++) {var a=all[i];ra.add(a);if(a[0]<x0) x0=a[0];if(a[1]>y1) y1=a[1];if(a[3]>size) size=a[3];}
    var col=void;try {if(this.trCol!==void) {col=0;var hx=''+this.trCol;for(var z=0;z<hx.length;z++) col=col*16+'0123456789abcdef'.indexOf(hx.charAt(z));}else if(typeof L.defaultChColor=='Integer') col=+L.defaultChColor;} catch(e) {}
    var edge=void;try {if(L.defaultEdge && typeof L.defaultEdgeColor=='Integer') edge=+L.defaultEdgeColor;} catch(e) {}
    var scr=this.screen();
    return %['tr'=>1,'line'=>this.trLine,'L'=>L,'rec'=>void,'k'=>flat.substring(from),'ra'=>ra,'size'=>size,'nvl'=>(L.height>=scr[1]*0.45)?1:0,'args'=>void,'col'=>col,'edge'=>edge,
     'head'=>'ToMe_CHARS engine=krkr line='+(100000+this.trLine)+' hidden='+h+this.trTailA+(this.trCol!==void?' color='+this.trCol:''),'t'=>t,'x0'=>x0,'y1'=>y1,'tries'=>0];
   } incontextof st;
   /* name plate: the name the layer was given (processNameText / processName, wrapped on the instance, the game's own method
      always called) and the plate's box; one snapshot per change, an empty one when the plate goes */
   st.nameWrap=function(L){
    try {
     if(typeof L.__mgName!='undefined') return;L.__mgName='';
     var names=['processNameText','processName'];
     for(var i=0;i<names.count;i++) {
      var n=names[i];if(typeof L[n]!='Object') continue;
      var old=L[n],o=%['L'=>L,'old'=>old];
      o.fn=function(args*){try {var a=args.count>0?args[0]:void;var s=(typeof a=='String')?a:((typeof a=='Object' && a!==void && a!==null && typeof a.text=='String')?a.text:'');if(typeof a=='String' || (typeof a=='Object' && a!==void && a!==null && typeof a.text=='String')) this.L.__mgName=s;} catch(e) {}return (this.old incontextof this.L)(args*);} incontextof o;
      L[n]=o.fn;
     }
    } catch(e) {}
   } incontextof st;
   st.nameScan=function(){
    var out='',ix=0,scr=this.screen(),ms=this.kag.fore.messages;
    for(var i=0;i<ms.count && i<8;i++) {
     var L=ms[i];if(!isvalid L || typeof L.textLayer!='Object') continue;this.nameWrap(L);
     var nl=void;try {nl=L.nameLayer;} catch(e) {nl=void;}
     var t=''+L.__mgName;if(t=='' || nl===void || nl===null || !isvalid nl || !nl.visible || !this.shown(L)) continue;
     var a=this.abs(nl);out='box='+int(a[0])+','+int(a[1])+','+int(nl.width)+','+int(nl.height)+' text='+t;ix=i;break;
    }
    if(out==this.nameKey) return;this.nameKey=out;
    var head='ToMe_CHARS engine=krkr line='+(++this.uiLine)+' hidden=0 sw='+int(scr[0])+' sh='+int(scr[1])+' vx=0 vy=0 vw=0 vh=0 n=0 rects= role=name';
    this.report(head+(out==''?' id=N: box=0,0,0,0 text=':' id=N:'+ix+' '+out));
   } incontextof st;
   /* Retire only TextRender-owned UI groups on permission loss. KAG's L groups and buttons have their own producers. */
   st.trRolesOff=function(){
    if(typeof this.cfg!='Object' || this.cfg.roles) return;
    var prev=this.trLinkGroups,named=typeof this.nameKey=='String' && this.nameKey!='';
    if(!named && (typeof prev!='Object' || prev===void || prev.count==0)) return;
    var scr=this.screen(),head='ToMe_CHARS engine=krkr line='+(++this.uiLine)+' hidden=0 sw='+int(scr[0])+' sh='+int(scr[1])+' vx=0 vy=0 vw=0 vh=0 n=0 rects=';
    this.nameKey='';this.trLinkKey='';this.trLinkGroups=[];
    if(named) this.report(head+' role=name id=N: box=0,0,0,0 text=');
    if(typeof prev=='Object' && prev!==void) for(var i=0;i<prev.count;i++) this.report(head+' role=choice id=K'+prev[i]+': box=0,0,0,0 text=');
   } incontextof st;
   /* KAG links on a TextRender layer: the hot spots (links[i].x / y / w / h, one entry a row) and the characters inside them */
   st.trLinkScan=function(){
    var scr=this.screen(),ms=this.kag.fore.messages,items=[],groups=[],key='';
    for(var i=0;i<ms.count && i<8;i++) {
     var L=ms[i];if(!isvalid L || typeof L.textLayer!='Object' || !this.shown(L)) continue;
     var n=0;try {n=+L.numLinks;} catch(e) {n=0;}if(!(n>0) || typeof L.links!='Object') continue;
     var a=this.abs(L),kl=-1;try {if(typeof L.keyLink!='undefined') kl=+L.keyLink;} catch(e) {}
     for(var j=0;j<n && j<16;j++) {
      var lk=L.links[j];if(lk===void || lk===null || typeof lk.x!='Object') continue;
      var x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
      for(var r=0;r<lk.x.count;r++) {var x=a[0]+(+lk.x[r]),y=a[1]+(+lk.y[r]),w=+lk.w[r],hh=+lk.h[r];if(x<x0) x0=x;if(y<y0) y0=y;if(x+w>x1) x1=x+w;if(y+hh>y1) y1=y+hh;}
      if(!(x1>x0)) continue;
      var all=void;try {if(typeof L.__mgTrAll=='Object') all=L.__mgTrAll;} catch(e) {}
      if(all===void && this.trAllL===L) all=this.trAll;
      /* Test each engine hot-spot row separately. Its union box can contain unrelated text between rows. */
      var t='',rs='',cn=0,ly=void;if(all!==void) for(var c=0;c<all.count;c++) {var q=all[c],cx=q[0]+q[2]/2,cy=q[1]+q[3]/2,inside=false;
       for(var r=0;r<lk.x.count;r++) {var x=a[0]+(+lk.x[r]),y=a[1]+(+lk.y[r]);if(cx>=x && cx<x+(+lk.w[r]) && cy>=y && cy<y+(+lk.h[r])) {inside=true;break;}}
       if(inside) {if(ly!==void && q[1]!=ly) t+="\n";ly=q[1];t+=q[4];rs+=(cn>0?';':'')+int(q[0])+','+int(q[1])+','+int(q[2])+','+int(q[3]);cn++;}}
      if(t=='') continue;
      var seen=false;for(var g=0;g<groups.count;g++) if(groups[g]==i) seen=true;if(!seen) groups.add(i);
      var rec='n='+cn+' rects='+rs+' role=choice id=K'+i+':'+j+' box='+int(x0)+','+int(y0)+','+int(x1-x0)+','+int(y1-y0)+(kl>=0?' sel='+(kl==j?1:0):'')+' text='+t;items.add(rec);key+=rec;
     }
    }
    if(key==this.trLinkKey) return;this.trLinkKey=key;
    var prev=this.trLinkGroups;this.trLinkGroups=groups;
    var head='ToMe_CHARS engine=krkr line='+(++this.uiLine)+' hidden=0 sw='+int(scr[0])+' sh='+int(scr[1])+' vx=0 vy=0 vw=0 vh=0 ';
    if(typeof prev=='Object' && prev!==void) for(var p=0;p<prev.count;p++) {var seen=false;for(var g=0;g<groups.count;g++) if(groups[g]==prev[p]) seen=true;if(!seen) this.report(head+'n=0 rects= role=choice id=K'+prev[p]+': box=0,0,0,0 text=');}
    if(items.count==0) return;
    for(var i=0;i<items.count;i++) this.report(head+items[i]);
   } incontextof st;
)MGLT", LR"MGLT(
   st.vis=function(){
    try {if(this.cfg.roles && this.ctlTick%5==2) {this.nameScan();this.trLinkScan();}} catch(e) {}
    try {if(++this.ctlTick%5==1) this.ctl();} catch(e) {}
    try {this.embTry();} catch(e) {}
    try {for(var i=0;i<this.recs.count;i++) {var r=this.recs[i];if(r.lkDirty && ++r.lkQuiet>=2) this.sendLinks(r);}} catch(e) {}
    try {if(this.cfg.roles && this.ctlTick%10==3) this.btnScan();} catch(e) {}
    try {this.trHide();} catch(e) {}
    try {this.fade();} catch(e) {}
    try {this.trSample();} catch(e) {this.trTry=99;}
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
     if(!this.trWrapped) {this.trWrap();
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
     return 'ok layers='+this.recs.count+' lines='+this.line+' wait='+(this.oldLB!==void?1:0)+(this.oldPB!==void?1:0)+' wrapped='+this.wrapped.count+' tr='+(this.trWrapped?1:0)+(typeof this.trWhy=='Object' && this.trWhy!==void?'/layer'+(+this.trWhy.layer)+'/own'+(+this.trWhy.own)+'/scr'+(+this.trWhy.scr)+'/small'+(+this.trWhy.small)+'/hid'+(+this.trWhy.hid)+'/empty'+(+this.trWhy.empty)+'/blank'+(+this.trWhy.blank):'')+'/sent'+(+this.charsSent)+(this.charsErr!==void?'/err:'+this.charsErr:'')+' draws='+this.calls+' hidden='+this.hid+' link='+this.link+' choice='+(+this.choiceDraws)+' clr='+(+this.clears)+' art='+this.art+' artLayers='+this.artSeen.count+' font='+this.fontNow()+' chars='+this.charsSent+(this.charsErr!=''?' charsErr='+this.charsErr:'')+' skipped='+this.skipped+(this.skippedCls!=''?'('+this.skippedCls+')':'');
    } catch(e) {return 'error '+e.message;}
   } incontextof st;
   global.__megulitKrkrState=st;
  }
  return st.refresh();
 } catch(e) {return 'error '+e.message;}
})())MGLT"
