// SPDX-License-Identifier: GPL-3.0-or-later
// Each ISLAND sentence owns its source, draw extent and asynchronous translation for the lifetime of its page.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.TomeIslandPage=api;api.install(root);}})(typeof window==='object'?window:this,function(){
 'use strict';
 // Engines that report per-line positions and pages: ISLAND (cs2), KiriKiri KAG message layers (krkr, E300) Ren'Py NVL pages (renpy, E301) and OCR-located pages of any other engine (ocr, E306).
 // E305 'nvl': full-screen games with no line positions or page turns (魔法使いの夜); lines stack in the text box (FLOW).
 const POSITIONED=new Set(['cs2','krkr','renpy','ocr']),FLOW=new Set(['nvl']),PAGED=new Set([...POSITIONED,...FLOW]);
 /* E351 (user: auto calibration put WoH's overlay mid-line, offset right, over the game's own text). A full-screen page
    game draws on a fixed grid, the same at every window size: measured on two screenshots (1378 and 1546 px wide
    clients) WITCH ON THE HOLY NIGHT's text column starts at 14.45 % of the width, the first row's centre at 17.4 % of
    the height, rows 7.4 % apart, 27 cells of 2.57 % of the width per row (punctuation may hang in a 28th). A sentence
    that opens with the paragraph indent or a quote starts a new row; any other continues the row the last one ended
    on (「数分後。」 then 「お父さんが…」 on one row). The overlay is laid out on that grid, wrapped where the game wraps. */
 const GRIDS={woh:{left:.1445,top:.174,row:.074,pitch:.0257,cells:27,rows:11}};
 const OPENS=/^[\u3000「『“（(〝【]/,HANGS=/^[、。，．」』）)”〟】！？!?…]$/;
 /* E410: rows[i] from the game's script ('continue' = @x, 'new'), else the indent/quote guess. */
 function gridLayout(texts,cells,rows=[]){let row=0,col=0;const out=[];for(const [k,text]of texts.entries()){const chars=[...String(text||'')],how=rows[k];if(col>0&&(how==='new'||how!=='continue'&&OPENS.test(chars[0]||''))){row++;col=0;}const start={row,col},breaks=[];
  chars.forEach((c,i)=>{if(c==='\n'){row++;col=0;return;}const width=/[\x20-\x7e\uff61-\uff9f]/.test(c)?.5:1;if(col+width>cells+1e-6&&!(HANGS.test(c)&&col<=cells)){row++;col=0;breaks.push(i);}col+=width;});
  out.push({row:start.row,col:start.col,breaks,endRow:row,endCol:col});}return out;}
 const token=value=>{value=value.replace(/[ \u3000\r\n]/g,'');let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return h>>>0;};
 class Page{
  constructor(){this.reset();}
  reset(){this.records=[];this.reports=new Map();this.positions=new Map();this.sequence=0;this.line=0;this.floor=0;this.epoch=(this.epoch||0)+1;}
  source(text,sequence,nativeLine=0){
   const last=this.records.at(-1);if(last&&last.source===text&&last.sourceSequence===sequence&&(!nativeLine||last.line===nativeLine))return last;
   // A second delivery for a line already shown (same native line, same text) is that line, not another copy.
   if(nativeLine){const shown=this.records.find(p=>p.line===nativeLine&&p.source===text);if(shown)return shown;}
   const r={source:text,sequence:++this.sequence,sourceSequence:sequence,token:token(text),translation:'',state:'pending',position:null,settled:false,line:nativeLine||null};
   if(nativeLine&&nativeLine<this.floor){r.obsolete=true;return r;}
   this.records=this.records.filter(p=>p.position||p.settled||!p.timedOut);this.records.push(r);
   const report=nativeLine?this.reports.get(nativeLine):[...this.reports.values()].find(m=>m.token===r.token);
   if(report&&report.token===r.token){this.reports.delete(report.line);this.apply(r,report);}
   const pos=r.line?this.positions.get(r.line):[...this.positions.values()].find(m=>m.token===r.token);
   if(pos&&pos.token===r.token){r.position=pos;this.positions.delete(pos.line);}return r;
  }
  apply(r,m){if(!this.records.includes(r)||r.settled||r.token!==m.token)return false;r.settled=true;r.line=m.line;if(!m.same)this.records=this.records.filter(p=>p.sequence>=r.sequence||(p.line&&p.line>m.line));return true;}
  page(m){
   if(!m||typeof m.same!=='boolean'||!Number.isSafeInteger(m.token)||!Number.isSafeInteger(m.line)||m.line<=this.line)return false;
   // The same run restarted right away (same text, next native line, within 400 ms) is a re-composition of the line
   // just begun, not a page turn: clearing here erased the page's earlier lines (user report, Opus 5.5 2026-11-02).
   const now=Date.now(),prev=this.lastPage;this.lastPage={line:m.line,token:m.token,at:now};
   if(!m.same&&prev&&prev.token===m.token&&m.line===prev.line+1&&now-prev.at<400){
    this.line=m.line;for(const p of this.records)if(p.line===prev.line)p.line=m.line;
    const pos=this.positions.get(prev.line);if(pos){this.positions.delete(prev.line);this.positions.set(m.line,{...pos,line:m.line});}
    const rep=this.reports.get(prev.line);if(rep){this.reports.delete(prev.line);this.reports.set(m.line,{...rep,line:m.line});}
    return true;}
   this.line=m.line;const r=[...this.records].reverse().find(p=>p.token===m.token&&!p.settled&&(p.line==null||p.line===m.line));
   // Clear the old page at the native turn, even if its new source frame has not reached the host yet.
   if(!m.same){this.floor=m.line;this.epoch++;this.records=this.records.filter(p=>p===r||(p.line!=null?p.line>=m.line:r&&p.sequence>r.sequence));for(const [line]of this.positions)if(line<m.line)this.positions.delete(line);for(const [line]of this.reports)if(line<m.line)this.reports.delete(line);}
   if(r)return this.apply(r,m);this.reports.set(m.line,m);if(this.reports.size>64)this.reports.delete(this.reports.keys().next().value);return false;
  }
  // The sentence the game is on now: the newest one shown on the page (the newest at all before any has a place).
  // Full-screen pages dim every other sentence, as the game itself does (魔法使いの夜: read lines grey, the current one white).
  current(){const shown=this.records.filter(r=>r.position&&!r.obsolete),pool=shown.length?shown:this.records;let top=null;for(const r of pool)if(!top||r.sequence>top.sequence)top=r;return top;}
  past(r){return this.records.length>1&&this.records.includes(r)&&r!==this.current();}
  // FLOW pages: each line is shown at once (no page report will settle it) under the one before; the view turns the
  // page when the next line no longer fits (turn keeps only the newest line).
  /* E410: o.pageStart = the game's script clears the page before this line; o.index = its script line: a line already on
     the page (same script line, or the same longer text) is that line again, not another copy below it. */
  flow(text,sequence,o={}){const index=Number.isSafeInteger(o.index)&&o.index>=0?o.index:null;
   /* E423 (issue #97, WoH: "中文字幕会反复播放"). When the game redraws the page it is on (back from a menu, the backlog, a
     window switch) the hook hands the page's lines over again from the first one. That first line starts a page in the
     script, so the page was cleared and every line built anew: each translation typed itself out again. A page start
     whose script line is already on the page is that page being redrawn: nothing is cleared, nothing is typed again. */
   if(o.pageStart===true){const shown=index!==null?this.records.find(p=>p.index===index):null;if(shown)return shown;const last=this.records.at(-1);if(!(last&&last.source===text&&(index===null||last.index===index)&&this.records.length===1)){this.records=[];this.epoch++;}}
   else{const letters=s=>String(s||'').replace(/[^\p{L}\p{N}]/gu,'');const shown=this.records.find(p=>index!==null&&p.index!==undefined&&p.index!==null?p.index===index:p.source===text&&letters(text).length>=6);if(shown)return shown;}
   const r=this.source(text,sequence,0);if(index!==null)r.index=index;if(o.row==='continue'||o.row==='new')r.row=o.row;if(!r.obsolete){r.settled=true;r.at=Date.now();if(this.records.length>24)this.records=this.records.slice(-24);}return r;}
  turn(){const top=this.current();if(!top||this.records.length<2)return false;this.records=[top];this.epoch++;return true;}
  // E323: the game turned the page (wait marker moved up). The marker is seen a moment after the new page's first line
  // arrived, so a line younger than 1.5 s is that page's first line and stays; everything older goes.
  clearFlow(now=Date.now()){const keep=this.records.filter(r=>now-(r.at||0)<1500).slice(-1);if(!this.records.length)return false;this.records=keep;this.epoch++;return true;}
  position(m){
   if(!m||!/^(?:cs2_screen_v[13]|(?:krkr|renpy|ocr)_screen_v1)$/.test(m.engine)||!Number.isSafeInteger(m.token)||!Number.isSafeInteger(m.line)||m.line<this.floor||![m.x0,m.y0,m.x1,m.y1,m.size].every(Number.isFinite)||m.x0< -2000||m.y0< -2000||m.x1>10000||m.y1>10000||m.x1<m.x0||m.y1<m.y0||m.size<6||m.size>160)return false;
   const r=[...this.records].reverse().find(p=>p.token===m.token&&(p.line==null||p.line===m.line));
   if(r){if(m.replacementRequested===false&&r.position&&r.position.replacementRequested!==false)m={...m,replacementRequested:true};r.position=m;return true;}
   this.positions.set(m.line,m);if(this.positions.size>64)this.positions.delete(this.positions.keys().next().value);return false;
  }
 }
 // Injected at document start, before inject.js has created the bridge on DOMContentLoaded: wait for it instead of
 // giving up, or every ISLAND line falls back to the single-line reader.
 function install(w){const d=w.document,b=w.__tomoyoChinese;if(!b||!d.head){if(d&&!install.waiting){install.waiting=true;d.addEventListener('DOMContentLoaded',()=>{install.waiting=false;install(w);},{once:true});}return;}if(b.islandPage)return;const model=new Page();let active=false,engine='',root=null,source='',sequence=0,session=0,revision=0,scope='',scopeCurrent=null,scopeRevision=0,layoutQueued=false;const nodes=new Map(),requests=new Map(),timers=new Map();let flowObserver=null,flowGrid='';/* E358: per line (letters only), the translation the game drew (string) or null when MeguLit draws it. */const embedLines=new Map(),lineKey=s=>String(s||'').replace(/<r[^<>]*>|<\/r>/g,'').replace(/[^\p{L}\p{N}]/gu,'');
  const send=m=>{try{w.__tomoyoTranslateRequest(JSON.stringify(m));}catch{}};
  const translationOn=()=>b.isEnabled?.()!==false&&b.isTranslationVisible?.()!==false;
  const pageScope=()=>{const next=translationOn()?'cs2:'+session+':'+model.epoch+':'+revision:'',row=model.current();
   const currentId=next&&row?.requested&&!row.preview&&row.requestScope===next?row.request:null;
   if(next!==scope){scope=next;scopeCurrent=null;scopeRevision=0;send({type:'pageTranslationScope',key:scope});}
   if(currentId!==scopeCurrent){scopeCurrent=currentId;send({type:'pageTranslationCurrent',key:scope,currentId,revision:++scopeRevision});}};
  function dropView(){for(const node of root?.querySelectorAll('.sentence-text,.tomoyo-cn-output')||[])w.TomeTypewriter?.stop(node);nodes.clear();root?.remove();root=null;}
  function reset(){for(const timer of timers.values())clearTimeout(timer);timers.clear();model.reset();requests.clear();dropView();source='';sequence=0;scope='';scopeCurrent=null;scopeRevision=0;session++;send({type:'pageTranslationScope',key:''});}
  function ensure(){if(root?.isConnected)return;dropView();const native=[...d.querySelectorAll('.sentence-window')].find(n=>!n.classList.contains('tomoyo-hook-reader'));if(!native)return;root=d.createElement('div');root.className='sentence-window tomoyo-hook-reader tome-island-page';native.before(root);}
  /* E411 (user, WoH 『■■■■■―――』): a line with no letters (censor blocks, dashes, dots) is shown as it is; it asks for no translation. */
  function translate(r){if(r.preview||!translationOn()||r.requested||!nodes.has(r))return;if(!/[\p{L}\p{N}]/u.test(r.source)){r.requested=true;r.state='ready';r.translation='';return;}r.requested=true;const id=++b.serial;r.request=id;r.requestScope=scope;requests.set(id,r);pageScope();send({id,text:r.source,pageKey:r.requestScope,options:b.options?.()||{}});}
  function synchronize(){if(!active)return;ensure();if(!root)return;d.body.classList.add('tomoyo-hook-reader-active','tome-island-active');d.body.classList.toggle('tome-flow-page',FLOW.has(engine));d.body.classList.toggle('tome-flow-grid-page',FLOW.has(engine)&&!!GRIDS[flowGrid]);for(const [r,node]of nodes){if(!model.records.includes(r)){w.TomeTypewriter?.stop(node.querySelector('.sentence-text'));w.TomeTypewriter?.stop(node.querySelector('.tomoyo-cn-output'));node.remove();nodes.delete(r);for(const [id,value]of requests)if(value===r)requests.delete(id);clearTimeout(timers.get(r));timers.delete(r);}}
   pageScope();for(const r of model.records){if(r.requested&&r.state==='pending'&&r.requestScope!==scope){requests.delete(r.request);r.requested=false;}if(!nodes.has(r)){const node=d.createElement('div');node.className='tome-island-pair';node.dataset.token=String(r.token);const jp=d.createElement('div');jp.className='sentence-text';for(const [i,c]of [...r.source].entries()){const span=d.createElement('span');span.className=/^\p{Script=Latin}$/u.test(c)?'char-token megulit-latin':'char-token';span.dataset.index=String(i);span.textContent=c;jp.append(span);}const row=d.createElement('div');row.className='tomoyo-cn-row';const cn=d.createElement('div');cn.className='tomoyo-cn-output';row.append(cn);node.append(jp,row);root.prepend(node);nodes.set(r,node);node.hidden=true;}
    const node=nodes.get(r),cn=node.querySelector('.tomoyo-cn-output');{const v=embedLines.get(lineKey(r.source));node.classList.toggle('tome-island-game-drawn',typeof v==='string');node.classList.toggle('tome-island-overlay-drawn',v===null);}cn.hidden=!translationOn();/* E426 (user, WoH 1.4.2: the translation kept typing itself out, half way, again and again; reader-perf: \1800 DOM
       mutations every 2 s with no new line). A page may show a line's translation changed (the grid drops the translator's
       leading 「　」), so the box's text never equalled r.translation: every status message reset it and the next layout typed
       it again. The box is reset when the translation itself changes, not when what is shown differs from it. */
    if(cn.dataset.translation!==r.translation){w.TomeTypewriter?.stop(cn);cn.textContent=r.translation;cn.dataset.translation=r.translation;delete cn.dataset.revealValue;}cn.dataset.state=r.state;
    if(r.settled||r.timedOut){clearTimeout(timers.get(r));timers.delete(r);translate(r);}else if(!timers.has(r))timers.set(r,setTimeout(()=>{timers.delete(r);if(!model.records.includes(r))return;r.timedOut=true;synchronize();},1200));}
   place();for(const [r,node]of nodes)if(r.cardinalPair)b.cardinalPair?.bind(r.cardinalPair,node.querySelector('.sentence-text'),node.querySelector('.tomoyo-cn-output'));scheduleLayout();w.__tomoyoHitRegionsRefresh?.();}
  let retryQueued=false;function scheduleRetry(){if(retryQueued)return;retryQueued=true;setTimeout(()=>{retryQueued=false;synchronize();},400);}
  function scheduleLayout(){if(layoutQueued)return;layoutQueued=true;w.requestAnimationFrame(()=>{layoutQueued=false;place();});}
  // Readings first, then the typewriter: the characters stay hidden while their furigana is attached (at most 300 ms;
  // a slower first tokenization still paints the readings when ready), so each reading appears with its characters.
  function revealWithRuby(jp){const chars=[...jp.querySelectorAll('.char-token')];for(const c of chars)c.classList.add('tome-typewriter-pending');
   const go=()=>{if(jp.isConnected&&!jp.dataset.tomeRubyRevealed){jp.dataset.tomeRubyRevealed='1';w.TomeTypewriter?.reveal(jp,chars,{instant:false});}};
   const ready=b.prepareRuby?.(jp);if(!ready){go();return;}Promise.race([ready.catch(()=>false),new Promise(r=>setTimeout(r,80))]).then(go);}
  /* FLOW: no engine positions. Lines start at the top of the calibrated text box and each one sits under the last (its measured height, translation included), as the game itself writes them down the page. When the newest line runs past the bottom of the game area the earlier lines go (the page turned). */
  /* Issue 119: page modes take their text size from the game; a Japanese size the user set by hand (Alt+T or the home settings) wins, at the same scale as the normal reader. */
  function userSize(p,cn){if(p.sizeSource!=='user')return 0;const v=parseFloat(w.getComputedStyle(d.documentElement).getPropertyValue(cn?'--tomoyo-gal-cn-size':'--tomoyo-gal-jp-size'));return Number.isFinite(v)&&v>4?v:0;}
  function placeGrid(G){let info=b.galLayoutInfo?.(),p=b.galPreferences?.()||{},dpr=w.devicePixelRatio||1,cw=(info?.clientWidth||1280)/dpr,ch=(info?.clientHeight||720)/dpr,cx=(info?.clientX??0)/dpr,cy=(info?.clientY??0)/dpr,gw=Math.min(cw,ch*16/9),gh=gw*9/16,gx=cx+(cw-gw)/2,gy=cy+(ch-gh)/2,pitch=G.pitch*gw,rowH=G.row*gh,left=gx+G.left*gw,top0=gy+G.top*gh-rowH/2,current=model.current();let size=pitch*.92;{const own=userSize(p);if(own){const f=own/size;size=own;pitch*=f;rowH*=f;}}
   const readOnly=p.hookHide===false,dim=p.pageDimPast!==false,records=[...model.records].sort((a,c)=>a.sequence-c.sequence),lay=gridLayout(records.map(r=>{const v=embedLines.get(lineKey(r.source));return typeof v==='string'&&v.trim()?(String(r.source).match(/^[\u3000 ]*/)[0]+v.trim()):r.source;}),G.cells,records.map(r=>r.row||''));
   /* The game turns the page before its grid runs out; if it did not report it (no wait marker), keep the newest line. */if(lay.length>1&&lay.at(-1).endRow>=G.rows&&records.at(-1)===current&&model.turn()){synchronize();return;}
   records.forEach((r,i)=>{const node=nodes.get(r);if(!node)return;const at=lay[i];node.hidden=false;node.classList.remove('tome-island-wrap');node.classList.add('tome-island-flow','tome-flow-grid');node.classList.toggle('tome-island-current',r===current);
    node.style.cssText='left:'+left+'px;top:'+(top0+at.row*rowH)+'px;width:'+((G.cells+1)*pitch)+'px;transform:none;';
    for(const [k,v]of Object.entries({'--tome-flow-size':size+'px','--tome-flow-row':rowH+'px','--tome-flow-spacing':(pitch-size)+'px','--tome-flow-indent':(at.col*pitch)+'px','--tome-island-jp-size':size+'px','--tome-island-cn-size':'var(--tomoyo-gal-cn-size,24px)','--tome-island-align':'left','--tome-island-cn-width':((G.cells+1)*pitch)+'px'}))node.style.setProperty(k,v);
    const paint=w.TomoyoGameStyle.paintFor(p,r.read===true,'');for(const [key,value]of Object.entries(w.TomoyoGameStyle.paintVariables(paint)))node.style.setProperty(key,value);
    node.classList.toggle('tome-island-past',dim&&r!==current);node.classList.toggle('tome-island-original-visible',readOnly);
    const jp=node.querySelector('.sentence-text');jp.style.minHeight='0px';
    /* The game's own row breaks, as line breaks before those characters (text-indent puts the first row where the last sentence ended). */const key=at.breaks.join(',');if(jp.__tomeFlowBreaks!==key){jp.__tomeFlowBreaks=key;for(const br of jp.querySelectorAll('.tome-flow-br'))br.remove();for(const i of at.breaks){const c=jp.querySelector('.char-token[data-index="'+i+'"]');if(c){const br=d.createElement('br');br.className='tome-flow-br';c.before(br);}}}
    if(!r.revealed){r.revealed=true;revealWithRuby(jp);}const cn=node.querySelector('.tomoyo-cn-output'),row=node.querySelector('.tomoyo-cn-row');if(row)row.hidden=cn.hidden;/* The translation's indent follows the original's place on the grid: a sentence that starts its row with the paragraph indent gets one, one that goes on after the last sentence gets none (the translator's own leading spaces are dropped). */const shown=r.translation?(at.col===0&&/^　/.test(String(r.source||''))?'　':'')+r.translation.replace(/^[ 　]+/,''):'';if(!cn.hidden&&r.state==='ready'&&shown&&cn.dataset.revealValue!==shown){cn.dataset.revealValue=shown;w.TomeTypewriter?.text(cn,shown);}});
   w.__tomoyoHitRegionsRefresh?.();}
  function placeFlow(){const G=GRIDS[flowGrid];if(G){placeGrid(G);return;}const info=b.galLayoutInfo?.(),p=b.galPreferences?.()||{},dpr=w.devicePixelRatio||1,cw=(info?.clientWidth||1280)/dpr,ch=(info?.clientHeight||720)/dpr,cx=(info?.clientX??0)/dpr,cy=(info?.clientY??0)/dpr,x=Number.isFinite(info?.readerX)?info.readerX/dpr:cx+cw*.1,top=Number.isFinite(info?.readerY)?info.readerY/dpr:cy+ch*.08,width=Number.isFinite(info?.readerWidth)&&info.readerWidth>0?info.readerWidth/dpr:cw*.8,limit=cy+ch-ch*.03,current=model.current();let y=top,last=null;
   const readOnly=p.hookHide===false,dim=p.pageDimPast!==false;
   for(const r of [...model.records].sort((a,c)=>a.sequence-c.sequence)){const node=nodes.get(r);if(!node)continue;node.hidden=false;node.classList.add('tome-island-wrap','tome-island-flow');node.classList.toggle('tome-island-current',r===current);
    /* E323: a translation typed out after its line was measured made the next line overlap it: re-lay the page whenever a pair changes height. */if(!node.__tomeFlowObserved&&typeof w.ResizeObserver==='function'){node.__tomeFlowObserved=true;(flowObserver||(flowObserver=new w.ResizeObserver(()=>scheduleLayout()))).observe(node);}
    node.style.cssText='left:'+x+'px;top:'+y+'px;width:'+Math.max(40,width)+'px;transform:none;';node.style.setProperty('--tome-island-jp-size','var(--tomoyo-gal-jp-size,28px)');node.style.setProperty('--tome-island-cn-size','var(--tomoyo-gal-cn-size,24px)');node.style.setProperty('--tome-island-align','left');node.style.setProperty('--tome-island-cn-width',Math.max(40,width)+'px');
    const paint=w.TomoyoGameStyle.paintFor(p,r.read===true,'');for(const [key,value]of Object.entries(w.TomoyoGameStyle.paintVariables(paint)))node.style.setProperty(key,value);
    node.classList.toggle('tome-island-past',dim&&r!==current);node.classList.toggle('tome-island-original-visible',readOnly);
    const jp=node.querySelector('.sentence-text');jp.style.minHeight='0px';if(!r.revealed){r.revealed=true;revealWithRuby(jp);}const cn=node.querySelector('.tomoyo-cn-output');/* E323: the 原文与译文间距 slider is the gap under each Japanese line only; without a translation the row takes no room. */const row=node.querySelector('.tomoyo-cn-row');if(row)row.hidden=cn.hidden;if(!cn.hidden&&r.state==='ready'&&r.translation&&cn.dataset.revealValue!==r.translation){cn.dataset.revealValue=r.translation;w.TomeTypewriter?.text(cn,r.translation);}
    // The game writes its lines one under the other with no extra space; the slider gap sits inside each pair.
    const h=node.getBoundingClientRect().height||0;last={r,bottom:y+h};y+=h;}
   if(last&&last.bottom>limit&&last.r===current&&model.turn()){synchronize();return;}
   w.__tomoyoHitRegionsRefresh?.();}
  function place(){if(!active||!root)return;if(FLOW.has(engine)){placeFlow();return;}const info=b.galLayoutInfo?.(),p=b.galPreferences?.()||{},dpr=w.devicePixelRatio||1,cw=(info?.clientWidth||1280)/dpr,ch=(info?.clientHeight||720)/dpr,ox=(info?.clientX??((info?.readerX||0)-(p.x||0)*(info?.clientWidth||1280)/100))/dpr,oy=(info?.clientY??((info?.readerY||0)-(p.y||0)*(info?.clientHeight||720)/100))/dpr,ref=model.records.find(r=>r.position)?.position,bw=ref?.sw>0?ref.sw:1280,bh=ref?.sh>0?ref.sh:720,k=Math.min(cw/bw,ch/bh),left=ox+(cw-bw*k)/2,top=oy+(ch-bh*k)/2;
   /* NVL pages (every paged engine but ISLAND's ADV-style pages) dim earlier sentences unless the engine reports each line's own colour (then that colour already is the game's read/unread look) or the user turned it off. */const dim=engine!=='cs2'&&p.pageDimPast!==false&&!model.records.some(r=>r.position?.color);
   const readOnly=p.hookHide===false;for(const r of model.records){const node=nodes.get(r);if(!node)continue;const pos=r.position;node.hidden=!pos;if(!pos)continue;let x,y,width,size;
    if(pos){const mapped=w.__tomeTextPosition?.mapExtent?.(pos);if(mapped){x=mapped.x/dpr+ox;y=mapped.y/dpr+oy;width=mapped.width/dpr;size=mapped.size/dpr;}else{x=left+pos.x0*k;y=top+pos.y0*k;width=(pos.x1-pos.x0+pos.size)*k;size=pos.size*k;}}
    width=Math.max(size*2,width+size*.6);const centered=model.records.filter(r=>r.position).length===1&&pos.y1===pos.y0&&Math.abs((pos.x0+pos.x1+pos.size)/2-bw/2)<=Math.max(12,pos.size*.75);
    x+=(Number(p.paddingX)||0)*k;{const tp=w.__tomeTextPosition,m0=tp?.getMap?.();/* One base for the whole life of the map (user: saving the work settings made the page jump, because the base switched from the session's first values to the map's). A map without one gets the current values written into it and saved. */if(m0&&!Number.isFinite(m0.px)){const fixed={...m0,px:Number(p.x)||0,py:Number(p.y)||0,pw:Number(p.width)||100};tp.setMap?.(fixed);try{w.__tomoyoTranslateRequest?.(JSON.stringify({type:'textPosMapSave',map:fixed,key:b.gameProfileKey?.()}));}catch{}}const m1=tp?.getMap?.(),base=Number.isFinite(m1?.px)?{x:m1.px,y:m1.py,w:m1.pw}:(w.__megulitPageBase||(w.__megulitPageBase={x:Number(p.x)||0,y:Number(p.y)||0,w:Number(p.width)||100}));x+=((Number(p.x)||0)-base.x)*cw/100;y+=((Number(p.y)||0)-base.y)*ch/100;if(base.w>0&&Number(p.width)>0)width*=Number(p.width)/base.w;node.classList.toggle('tome-island-wrap',(base.w>0&&Number(p.width)<base.w-.05)||(!r.source.includes('\n')&&pos.y1>pos.y0));}y+=(Number(p.paddingY)||0)*k;width=Math.max(size*2,width-2*(Number(p.paddingX)||0)*k);/* ISLAND 2026-11-28 (owner: 「现在为啥老超出去会话框啊 原文我记得是两行啊」, a quoted line the game drew on two rows ran on one row over the SKIP/AUTO buttons): a line the game drew on more rows than its text has breaks wraps at its drawn width (tome-island-wrap above, ISLAND included), and no line runs past the game's client on the right */{const room=ox+cw-x;if(room>=size*2)width=Math.min(width,room);}
    node.style.cssText='left:'+x+'px;top:'+y+'px;width:'+width+'px;transform:none;';{const own=userSize(p);if(own){width*=own/size;size=own;}}node.style.setProperty('--tome-island-jp-size',size+'px');/* issue 468: a translation size the user set (home settings or Alt+T) is used as it is; the game's size only caps an automatic one */node.style.setProperty('--tome-island-cn-size',(userSize(p,true)||Math.min(size, (p.translationSize||24)*k))+'px');node.style.setProperty('--tome-island-align',centered?'center':'left');
    // The engine reports each line's own fill colour (read lines and unread lines differ in many games): follow it while
    // game style sync is on, otherwise keep the user's single text colour.
    const paint=w.TomoyoGameStyle.paintFor(p,r.read===true,pos.color||'');for(const [key,value]of Object.entries(w.TomoyoGameStyle.paintVariables(paint)))node.style.setProperty(key,value);
    /* the opacity and outline the game drew this page line with (read lines dimmed or outlined differently); furigana follows */
    {const lp=pos.style&&w.TomoyoGameStyle.linePaint?w.TomoyoGameStyle.linePaint(p,'',pos.color||'',pos.style):null;if(lp?.sampled)node.style.setProperty('--tomoyo-gal-color',lp.color);for(const key of ['--tomoyo-jp-stroke-color','--tomoyo-ruby-stroke-color'])if(lp?.sampled&&lp.edge)node.style.setProperty(key,lp.edge);else node.style.removeProperty(key);}
    // Translation wrap width (user, 2026-11-03: it ran far past the Japanese with no setting): 0 follows the Japanese
    // line's width; otherwise it may run on to that share of the game width (75 % by default, the old fixed value),
    // never narrower than the Japanese.
    const share=Number.isFinite(Number(p.translationWidth))?Number(p.translationWidth):75;
    /* the translation keeps to the same text area: a wrapped line's translation wraps at that line's width, any other never runs past the client's right edge */node.style.setProperty('--tome-island-cn-width',(centered||share<=0||node.classList.contains('tome-island-wrap')?width:Math.max(width,Math.min(cw*share/100,ox+cw-x)))+'px');
    // Read-only capture keeps the original Japanese visible; the overlay owns only its Chinese in that mode. Decided by
    // the user's hide setting, not by each report's hidden flag: that flag is 0 for lines laid out before the stream
    // was selected and during skip bursts, and the game then still erases the original, leaving no Japanese at all.
    node.classList.toggle('tome-island-past',dim&&model.past(r));node.classList.toggle('tome-island-original-visible',readOnly);const jp=node.querySelector('.sentence-text');if(!r.revealed){r.revealed=true;revealWithRuby(jp);}const cn=node.querySelector('.tomoyo-cn-output');if(!cn.hidden&&r.state==='ready'&&r.translation&&cn.dataset.revealValue!==r.translation){cn.dataset.revealValue=r.translation;w.TomeTypewriter?.text(cn,r.translation);}jp.style.minHeight=readOnly?((pos.y1-pos.y0+pos.size)*k)+'px':'0px';}
   w.__tomoyoHitRegionsRefresh?.();}
  b.pageTranslationActive=()=>active;
  b.refreshPageTranslations=()=>{if(!active)return false;revision++;for(const r of model.records){r.requested=false;r.translation='';r.state='pending';b.markTranslationSource?.(nodes.get(r)?.querySelector('.tomoyo-cn-output'),null);}requests.clear();synchronize();return true;};
  b.deliverPageTranslation=(id,text,error,message,context=null)=>{if(b.acceptTranslationTarget?.(context)===false)return true;const r=requests.get(id);if(!r)return false;requests.delete(id);if(!active||!model.records.includes(r))return true;/* E349: "Superseded sentence" showed under a line as its translation. */if(error&&/Superseded sentence|AbortError|aborted|已跳过过期/i.test(String(message||''))){r.requested=false;r.state='pending';scheduleRetry();return true;}r.translation=error?(message||''):String(text||'');b.markTranslationSource?.(nodes.get(r)?.querySelector('.tomoyo-cn-output'),error?null:context);b.refreshTranslationOrigin?.();r.state=error?'error':'ready';if(!error&&r.translation.trim())b.backlogTranslated?.(r.source,r.translation);b.lastTranslationError=error?message:'';synchronize();return true;};
  b.islandPage={model,accept(m){if(m.type==='gameClosed'||m.hookSource===null){embedLines.clear();flowGrid='';if(PAGED.has(engine)){active=false;engine='';reset();d.body.classList.remove('tome-island-active','tomoyo-hook-reader-active');}return false;}
    if(m.embedLine&&typeof m.embedLine.source==='string'){const k=lineKey(m.embedLine.source);if(k){embedLines.delete(k);embedLines.set(k,m.embedLine.drawn===true?String(m.embedLine.text||''):null);if(embedLines.size>400)embedLines.delete(embedLines.keys().next().value);}if(active&&PAGED.has(engine)&&typeof m.hookSource!=='string')synchronize();}if(typeof m.hookSourceEngine==='string'&&m.hookSourceEngine!==engine){if(PAGED.has(engine)){active=false;reset();d.body.classList.remove('tome-island-active');}engine=m.hookSourceEngine;}
    if(!PAGED.has(engine))return false;
    // The coordinate page renderer already owns these rows and their translation.
    const spatial=!b.textPlaceEngineRowsActive?.()&&d.body.classList.contains('tomoyo-ui-translation')&&(b.isGalBound?.()??d.body.classList.contains('tomoyo-gal-bound'));
    if(active&&!spatial){active=false;for(const timer of timers.values())clearTimeout(timer);timers.clear();requests.clear();dropView();scope='';scopeCurrent=null;scopeRevision=0;send({type:'pageTranslationScope',key:''});d.body.classList.remove('tome-island-active','tomoyo-hook-reader-active');if(typeof m.hookSource!=='string'){m.hookSource=source;m.hookSequence=sequence;}}
    if(!active&&spatial){active=true;session++;}
    if(typeof m.hookSource==='string'){const next=w.TomeIslandSource?.spoken(m.hookSource)??b.splitDialogue?.(m.hookSource).text??m.hookSource,nextSequence=m.hookSequence??sequence+1;if(next.trim()&&(next!==source||nextSequence!==sequence)){source=next;sequence=nextSequence;if(typeof m.hookFlowGrid==='string')flowGrid=m.hookFlowGrid;const rec=FLOW.has(engine)?model.flow(next,nextSequence,{pageStart:m.hookFlowPageStart===true,index:m.hookSourceIndex,row:m.hookFlowRow}):model.source(next,nextSequence,m.hookSourceLine);rec.preview=m.hookSourcePreview===true;rec.cardinalPair=m.cardinalPair;b.prefetchRuby?.(next);if(typeof m.hookSourceRead==='boolean')rec.read=m.hookSourceRead;if(active&&!rec.obsolete){b.sourceText=next;b.onSourceText?.(next);}}}
    else if(m.hookSourcePreview===false){const rec=model.current();if(rec)rec.preview=false;}
    if(!active)return false;
    synchronize();return true;},page(m){if(!PAGED.has(m.engine))return false;if(FLOW.has(m.engine)){if(m.same===false&&model.clearFlow())synchronize();return true;}model.page(m);synchronize();return true;},position(m){if(!/^(?:cs2_screen_v[13]|(?:krkr|renpy|ocr)_screen_v1)$/.test(m?.engine))return false;model.position(m);if(active)pageScope();place();scheduleLayout();return true;},refresh:()=>{place();b.cardinalPair?.refresh();scheduleLayout();},status:()=>({active,sequence,chars:source.length,rendered:!!root?.isConnected,pairs:model.records.length,positioned:model.records.filter(r=>r.position).length,typing:null})};
  const style=d.createElement('style');style.textContent=`
body.tomoyo-gal-bound .sentence-window.tome-island-page{left:0!important;top:0!important;width:0!important;height:0!important;min-width:0!important;margin:0!important;padding:0!important;overflow:visible!important}
.tome-island-pair[hidden]{display:none!important}
/* E349 (user: earlier lines are made transparent, not darker: 30 % opacity, colours unchanged). */
.tome-island-pair{position:fixed;box-sizing:border-box;overflow:visible;background:transparent;transform-origin:top left;transition:opacity .6s ease}
.tome-island-pair.tome-island-past{opacity:var(--tome-island-past-opacity,.3)}
/* FLOW pages wrap like the game: at the calibrated box width, strict kinsoku, continuation rows without the leading indent (the indent is the line's own first character). */
body.tomoyo-gal-bound .sentence-window .tome-island-pair.tome-island-flow .sentence-text,body.tomoyo-gal-bound .sentence-window .tome-island-pair.tome-island-flow .sentence-text[data-megulit-native-breaks]{white-space:pre-wrap!important;line-break:strict;word-break:normal;overflow-wrap:anywhere}
.tome-island-pair.tome-island-flow .tomoyo-cn-row[hidden]{display:none!important}
/* E352/E358: a line the game draws in translation is not drawn again on top; a line its font cannot draw (the game hides it) is
   drawn by MeguLit. While the game draws translations, a line not answered yet stays hidden until it is. */
.tome-island-pair.tome-island-game-drawn{visibility:hidden!important}
/* E422 (user, WoH: the drag highlight flew off the screen): on a page the text window is a 0x0 point and each line is placed on
   its own; the dashed frame goes around the lines instead. */
body.tome-box-dragging .sentence-window.tome-island-page{outline:none!important}
body.tome-box-dragging .sentence-window.tome-island-page .tome-island-pair:not([hidden]){outline:2px dashed var(--theme-primary,#e0495a)!important;outline-offset:2px}
body.megulit-embed-translation .sentence-window.tome-island-page .tome-island-pair:not(.tome-island-overlay-drawn){visibility:hidden!important}
/* E351 page grid: one fixed cell per character, the game's row height, its breaks only; a line's translation shows while it is the current line (an earlier one would cover the rows the game writes next). */
body.tomoyo-gal-bound .sentence-window .tome-island-pair.tome-flow-grid .sentence-text,body.tomoyo-gal-bound .sentence-window .tome-island-pair.tome-flow-grid .sentence-text.tomoyo-furigana,body.tomoyo-gal-bound .sentence-window .tome-island-pair.tome-flow-grid .sentence-text[data-megulit-native-breaks]{font-size:var(--tome-flow-size)!important;line-height:var(--tome-flow-row)!important;letter-spacing:var(--tome-flow-spacing)!important;text-indent:var(--tome-flow-indent)!important;white-space:pre!important;margin-top:0!important}
.tome-island-pair.tome-flow-grid.tome-island-past .tomoyo-cn-row{display:none!important}
@media (prefers-reduced-motion:reduce){.tome-island-pair{transition:none}}
body.tomoyo-gal-bound .tome-island-pair .sentence-text{width:100%!important;font-size:var(--tome-island-jp-size,28px)!important;line-height:var(--tomoyo-gal-line-height,1.25)!important;padding:0!important;letter-spacing:var(--tomoyo-gal-jp-spacing,0px)!important;text-indent:0!important;text-align:left!important}
body.tomoyo-gal-bound .tome-island-pair .sentence-text{white-space:pre!important}/* a wrapped line (narrowed width, or drawn on more rows than its text has breaks) must win over the rule above in the bound reader, where its body selector made it the stronger one */body.tomoyo-gal-bound .tome-island-pair.tome-island-wrap .sentence-text,.tome-island-pair.tome-island-wrap .sentence-text{white-space:pre-wrap!important;line-break:strict;overflow-wrap:anywhere}
.tome-island-pair .tomoyo-cn-output{font-size:var(--tome-island-cn-size,24px)!important;line-height:calc(1.3 + var(--megulit-translation-line-offset,0))!important;background-size:100% calc((1.3 + var(--megulit-translation-line-offset,0)) * 1em)!important;text-align:var(--tome-island-align,left)!important;text-align-last:auto!important;white-space:pre-wrap!important;text-indent:0!important}
body.tomoyo-gal-bound .tome-island-pair .sentence-text.tomoyo-furigana{line-height:max(calc(var(--megulit-ruby-line) * 1em),var(--megulit-ruby-floor,0px))!important;margin-top:-.3em!important}
body.tomoyo-gal-bound .tome-island-pair .sentence-text .megulit-ruby-base[data-tomoyo-reading]::before{font-size:min(var(--tomoyo-ruby-actual-size,.52em),var(--tome-island-ruby-cap,999px))!important}
body.tomoyo-gal-bound .tome-island-pair .tomoyo-cn-row{width:var(--tome-island-cn-width,100%)!important;margin:var(--tomoyo-gal-gap,4px) 0 0!important}
.tome-island-pair.tome-island-original-visible .sentence-text{visibility:hidden!important;pointer-events:none!important}
`;d.head.append(style);w.addEventListener('resize',scheduleLayout);new MutationObserver(()=>{if(active&&model.records.length&&!root?.isConnected)synchronize();}).observe(d.documentElement,{childList:true,subtree:true});}
 return {Page,token,install,gridLayout,GRIDS};
});
