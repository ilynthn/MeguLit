// SPDX-License-Identifier: GPL-3.0-or-later
/* E407 choice overlay, for every engine. The host sends hookChoices {items:[{text,x0,y0,x1,y1}],sw,sh} once OCR has found
   each choice text (taken read-only from the hook's other streams) on its own row of the game picture; null clears it.
   Each choice keeps the game's own text (2026-11-13: nothing is covered); MeguLit adds the ruby over it and,
   the row, the translation right under it. The boxes are game pixels, re-read by the host while the choices are up,
   so a button that moves on hover or animation is followed. Nothing here takes pointer input: clicks reach the game. */
(function(root){
 'use strict';
 function rubyHtml(text,notes){
  const chars=[...String(text||'')],esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const list=(Array.isArray(notes)?notes:[]).filter(n=>n&&Number.isInteger(n.start)&&Number.isInteger(n.end)&&n.end>n.start&&n.end<=chars.length&&n.reading).sort((a,b)=>a.start-b.start);
  let out='',i=0;
  for(const n of list){if(n.start<i)continue;out+=esc(chars.slice(i,n.start).join(''))+'<ruby>'+esc(chars.slice(n.start,n.end).join(''))+'<rt>'+esc(n.reading)+'</rt></ruby>';i=n.end;}
  return out+esc(chars.slice(i).join(''));
 }
 /* game pixel box -> page CSS px, the same fit as the page view (island-page place()) */
 function mapBox(item,sw,sh,info,dpr){
  const cw=(info?.clientWidth||sw)/dpr,ch=(info?.clientHeight||sh)/dpr,ox=(info?.clientX||0)/dpr,oy=(info?.clientY||0)/dpr,k=Math.min(cw/sw,ch/sh),left=ox+(cw-sw*k)/2,top=oy+(ch-sh*k)/2;
  return {x:left+item.x0*k,y:top+item.y0*k,width:(item.x1-item.x0)*k,height:(item.y1-item.y0)*k};
 }
 function install(w){
  const d=w.document,b=w.__tomoyoChinese;if(!b||!d.body){if(d&&!install.waiting){install.waiting=true;d.addEventListener('DOMContentLoaded',()=>{install.waiting=false;install(w);},{once:true});}return;}
  if(b.choiceOverlay)return;
  let layer=null,current=null,request=0,translations=[],key='';
  const send=m=>{try{w.__tomoyoTranslateRequest(JSON.stringify(m));}catch{}};
  const translationOn=()=>b.isEnabled?.()!==false&&b.isTranslationVisible?.()!==false;
  {const st=d.getElementById('megulit-choice-style')||d.createElement('style');st.id='megulit-choice-style';st.textContent=
   /* 2026-11-13 (user: never cover the game's text) the layer only adds: no backing, no mask, the game's own option stays as
      drawn. The Japanese copy is invisible (it only places the ruby over the game's glyphs); ruby above, translation below. */
   '.megulit-choice-layer{position:fixed;inset:0;pointer-events:none;z-index:30;background:none}'+
   '.megulit-choice{position:fixed;pointer-events:none;box-sizing:border-box;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;background:none}'+
   '.megulit-choice-jp{position:relative;white-space:nowrap;line-height:1;color:transparent;text-shadow:none;background:none}'+
   '.megulit-choice-jp rt{font-size:.5em;line-height:1;color:var(--tomoyo-gal-color,#fffaf2);text-shadow:var(--tomoyo-gal-shadow,0 0 2px #000,0 0 1px #000)}'+
   '.megulit-choice-cn{position:absolute;top:calc(100% + .1em);left:50%;transform:translateX(-50%);white-space:nowrap;color:var(--tomoyo-translation-color,#ffe9a8);text-shadow:0 0 3px #000,0 0 2px #000,0 0 1px #000;font-size:.8em;line-height:1.2;background:none}'+
   /* options stacked line on line (CLANNAD's text box) leave no room below: the translation follows the option's last glyph on its row */
   '.megulit-choice-side .megulit-choice-cn{top:50%;left:calc(100% + .4em);transform:translateY(-50%)}'+
   /* the game cleared its text box for the options: the line MeguLit drew there goes while they are up */
   'body.megulit-choice-covers-line .sentence-window:not(.tome-island-page),body.megulit-choice-only .sentence-window:not(.tome-island-page){visibility:hidden!important}'+
   /* the art-text scan reads the option rows as art text: its copies go while the options are up */
   'body.megulit-choices-up .megulit-art{visibility:hidden!important}';
   if(!st.isConnected)d.head.append(st);}
  function clear(){d.body.classList.remove('megulit-choice-covers-line','megulit-choices-up');current=null;key='';translations=[];layer?.remove();layer=null;}
  function translate(texts){if(!translationOn()){translations=[];return;}const id=++b.serial;request=id;send({id,text:texts.join('\n'),options:b.options?.()||{}});}
  function place(){
   if(!current){clear();return;}
   d.body.classList.add('megulit-choices-up');
   if(!layer||!layer.isConnected){layer=d.createElement('div');layer.className='megulit-choice-layer';d.body.append(layer);}
   const info=b.galLayoutInfo?.(),dpr=w.devicePixelRatio||1,p=b.galPreferences?.()||{},nodes=[...layer.children];
   /* one text size for every option, from the lowest row (OCR boxes differ by a few pixels; CLANNAD drew one option larger) */const low=Math.min(...current.items.map(it=>mapBox(it,current.sw,current.sh,info,dpr).height));
   {const win=[...d.querySelectorAll('.sentence-window')].find(n=>!n.classList.contains('tome-island-page')),r=win?.getBoundingClientRect(),hit=!!r&&r.width>0&&current.items.some(it=>{const q=mapBox(it,current.sw,current.sh,info,dpr);return q.x<r.right&&q.x+q.width>r.left&&q.y<r.bottom&&q.y+q.height>r.top;});d.body.classList.toggle('megulit-choice-covers-line',hit);}
   current.items.forEach((item,i)=>{
    let node=nodes[i];if(!node){node=d.createElement('div');node.className='megulit-choice';node.innerHTML='<div class="megulit-choice-jp"></div><div class="megulit-choice-cn"></div>';layer.append(node);}
    const box=mapBox(item,current.sw,current.sh,info,dpr),size=Math.max(10,low*.86);
    node.style.cssText='left:'+box.x+'px;top:'+box.y+'px;width:'+box.width+'px;height:'+box.height+'px;font-size:'+size+'px;font-family:'+(p.japaneseFont?'"'+String(p.japaneseFont).replace(/"/g,'')+'",':'')+'sans-serif';
    const next=current.items.slice(i+1).find(o=>o.y0>=item.y1),gap=next?mapBox(next,current.sw,current.sh,info,dpr).y-(box.y+box.height):Infinity;/* an option OCR could not box may sit right under: then the translation stays on the row */node.classList.toggle('megulit-choice-side',gap<size*.8*1.25*.5||current.unboxed>0&&!next);const prev=current.items.slice(0,i).reverse().find(o=>o.y1<=item.y0),before=prev?box.y-(mapBox(prev,current.sw,current.sh,info,dpr).y+mapBox(prev,current.sw,current.sh,info,dpr).height):Infinity;node.classList.toggle('megulit-choice-tight',Math.min(gap,before)<size*.3);
    const jp=node.querySelector('.megulit-choice-jp');if(jp.dataset.text!==item.text){jp.dataset.text=item.text;jp.textContent=item.text;
     const ask=item.text;Promise.resolve(b.rubyAnnotations?.(ask)).then(notes=>{if(jp.dataset.text===ask&&Array.isArray(notes)){jp.innerHTML=rubyHtml(ask,notes);if(current)place();}}).catch(()=>{});}
    /* 2026-11-13 the drawn text never runs past the game's own row (ファタ: 35 px text over a 168 px row spilled out) */const fit=()=>{const wide=jp.scrollWidth;if(wide>0&&Math.abs(wide-box.width)>box.width*.04)node.style.fontSize=Math.max(10,Math.min(size*1.4,size*box.width/wide))+'px';};/* the invisible copy spans the game's row, so the ruby lands on the game's glyphs */fit();
    const cn=node.querySelector('.megulit-choice-cn');/* the translation follows the row's height, not the fitted copy (a row of dots fits a smaller copy) */cn.style.fontSize=Math.max(12,size*.8)+'px';cn.textContent=translations[i]||'';cn.hidden=!translationOn()||!translations[i];
    /* a translation on the row must stay inside the game picture: smaller text first, then under the option */if(!cn.hidden&&node.classList.contains('megulit-choice-side')){const game=mapBox({x0:0,y0:0,x1:current.sw,y1:current.sh},current.sw,current.sh,info,dpr),right=game.x+game.width-4;let fs=parseFloat(cn.style.fontSize)||12;while(cn.getBoundingClientRect().right>right&&fs>11){fs-=1;cn.style.fontSize=fs+'px';}if(cn.getBoundingClientRect().right>right)node.classList.remove('megulit-choice-side');}
   });
   for(const extra of nodes.slice(current.items.length))extra.remove();
   w.__tomoyoHitRegionsRefresh?.();
  }
  function accept(value){
   if(!value||!Array.isArray(value.items)||value.items.length<1||!(value.sw>0)||!(value.sh>0)){clear();return;}
   const items=value.items.filter(i=>i&&typeof i.text==='string'&&i.x1>i.x0&&i.y1>i.y0).slice(0,12);/* 2026-11-13 one box when the other options are only ellipses (the host decides) */if(items.length<1){clear();return;}
   const nextKey=items.map(i=>i.text).join('\n');current={items,sw:value.sw,sh:value.sh,unboxed:Number(value.unboxed)||0};
   if(nextKey!==key){key=nextKey;translations=[];translate(items.map(i=>i.text));}
   place();
  }
  const deliverPrevious=b.deliverPageTranslation;
  b.deliverPageTranslation=(id,text,error,message)=>{
   if(id===request&&request){request=0;if(!error&&current){const lines=String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);translations=lines.length===current.items.length?lines:[];place();}return true;}
   return deliverPrevious?deliverPrevious(id,text,error,message):false;};
  const previous=b.galStatus;
  b.galStatus=m=>{previous?.(m);if(!m||typeof m!=='object')return;
   if(m.type==='gameClosed'||m.hookSource===null){clear();return;}
   if(Object.prototype.hasOwnProperty.call(m,'hookChoices'))accept(m.hookChoices);};
  /* E407 diagnostics for lines drawn off the game's text (女装山脈: the replacement sat half a line above the original,
     which was not hidden): once per line, after it settles, log where the Japanese was drawn, the ruby room above it,
     the game's own ruby in the line and the hide check state, to reader-host.log. */
  let lineTimer=0,lastLine='',checkState='';
  function lineDiagnostic(text){
   const win=[...d.querySelectorAll('.sentence-window')].find(n=>!n.classList.contains('tome-island-page')),jp=win?.querySelector('.sentence-text');if(!jp)return;
   const cs=getComputedStyle(jp),first=jp.querySelector('.char-token')?.getBoundingClientRect(),box=jp.getBoundingClientRect(),root=getComputedStyle(d.documentElement),info=b.galLayoutInfo?.()||{},dpr=w.devicePixelRatio||1,p=b.galPreferences?.()||{};
   const gameRuby=b.gameRuby&&typeof b.gameRuby==='object'?Object.keys(b.gameRuby).filter(k=>text.includes(k)):[];
   send({type:'layoutDiagnostic',chars:[...text].length,furigana:jp.classList.contains('tomoyo-furigana'),rubyNodes:jp.querySelectorAll('[data-tomoyo-reading]').length,gameRuby:gameRuby.join(',').slice(0,200),
    lineHeight:parseFloat(cs.lineHeight)||0,paddingTop:parseFloat(cs.paddingTop)||0,marginBottom:parseFloat(cs.marginBottom)||0,fontSize:parseFloat(cs.fontSize)||0,
    textTop:Math.round(box.top*10)/10,firstGlyphTop:first?Math.round(first.top*10)/10:-1,firstGlyphHeight:first?Math.round(first.height*10)/10:-1,
    readerY:parseFloat(root.getPropertyValue('--tomoyo-reader-y'))||0,readerYGame:Number.isFinite(info.readerY)?info.readerY/dpr:-1,clientY:Number.isFinite(info.clientY)?info.clientY/dpr:-1,
    rubyLift:parseFloat(jp.querySelector('[data-tomoyo-reading]')?.style.getPropertyValue('--megulit-ruby-lift'))||0,settingY:Number(p.y)||0,settingLineHeight:Number(p.lineHeight)||0,
    hideCheck:checkState,readMarked:d.body.classList.contains('tome-line-read'),text:text.slice(0,60)});
  }
  const statusBefore=b.galStatus;
  b.galStatus=m=>{statusBefore?.(m);if(!m||typeof m!=='object')return;if(typeof m.hookCheckState==='string')checkState=m.hookCheckState;
   if(typeof m.hookSource==='string'&&m.hookSource.trim()&&m.hookSource!==lastLine){lastLine=m.hookSource;checkState='';clearTimeout(lineTimer);const t=m.hookSource;lineTimer=setTimeout(()=>{if(lastLine===t)lineDiagnostic(t);},2500);}};
  w.addEventListener('resize',()=>{if(current)place();});
  b.choiceOverlay={accept,clear,active:()=>!!current};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={rubyHtml,mapBox,install};
 if(root&&root.document)install(root);
})(typeof window!=='undefined'?window:null);
