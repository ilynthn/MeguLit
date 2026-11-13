// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-12 (user: "游戏过程中的各种艺术字" — opening titles, credits, title cards must be readable too). The game keeps
// drawing its art text untouched; PageLocator finds where (art mode, artText). Over each line MeguLit lays the same text,
// invisible but readable (click a character to look it up, drag to select and add), placed row by row where the game
// drew it, plus the translation, shown like the game's own text. Both leave when the picture no longer shows the line.
(function installArtText(){
 'use strict';
 if(!document.body||!window.__tomoyoChinese){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installArtText,{once:true});else setTimeout(installArtText,50);return;}
 const b=window.__tomoyoChinese;if(b.artText)return;
 const style=document.createElement('style');
 style.textContent=`.megulit-art{position:fixed;inset:0;pointer-events:none;z-index:40}
.megulit-art-item{position:absolute;inset:0;transition:opacity .45s ease;opacity:0}
.megulit-art-item.is-shown{opacity:1}
.megulit-art .megulit-art-row{position:absolute;white-space:pre;line-height:1;pointer-events:auto;margin:0;padding:0;font-family:var(--tomoyo-gal-jp-font,"MS Mincho",serif)}
.megulit-art .megulit-art-row,.megulit-art .megulit-art-row *{color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important;filter:none!important;background:none!important}
.megulit-art .megulit-art-row ::selection,.megulit-art .megulit-art-row::selection{color:transparent;background:rgba(255,214,120,.35)}
.megulit-art-cn{position:absolute;white-space:pre-wrap;text-align:center;pointer-events:none;font-family:var(--tomoyo-gal-cn-font,"Microsoft YaHei",sans-serif);color:#fff;text-shadow:0 0 3px rgba(0,0,0,.9),0 0 8px rgba(0,0,0,.6);line-height:1.35}
.megulit-art-ja{position:absolute;white-space:pre-wrap;pointer-events:auto;line-height:1.3;font-family:var(--tomoyo-gal-jp-font,"Yu Mincho","MS Mincho",serif)}`;
 document.head.append(style);
 const layer=document.createElement('div');layer.className='megulit-art';layer.setAttribute('aria-live','off');document.body.append(layer);
 const items=new Map();
 const HIDE=[['color','transparent'],['-webkit-text-fill-color','transparent'],['-webkit-text-stroke-width','0'],['text-shadow','none'],['filter','none'],['background','none']];
 const scale=m=>{const sw=+m.sw||1,sh=+m.sh||1;return {x:innerWidth/sw,y:innerHeight/sh};};
 function remove(id){const it=items.get(id);if(!it)return;items.delete(id);it.classList.remove('is-shown');setTimeout(()=>it.remove(),500);}
 /* an item read again (OCR art scan: a poem growing line by line, a better read) is replaced in place, without a new fade */
 function show(m){
  const old=items.get(m.id);if(old){items.delete(m.id);old.remove();}
  const rows=Array.isArray(m.rows)?m.rows.filter(r=>r&&typeof r.text==='string'&&r.text.trim()&&Number.isFinite(r.x)&&Number.isFinite(r.y)):[];
  if(!rows.length)return;
  const k=scale(m),item=document.createElement('div');item.className='megulit-art-item';item.dataset.artId=String(m.id);
  let top=Infinity,bottom=0,left=Infinity,right=0;
  for(const r of rows){
   const row=document.createElement('div');row.className='sentence-text megulit-art-row';row.dataset.noI18n='';
   const size=Math.max(8,r.h*k.y);row.style.left=(r.x*k.x)+'px';row.style.top=(r.y*k.y)+'px';row.style.fontSize=size+'px';
   /* E311 (live test 2026-11-13, STEINS;GATE: sign art showed as white outlined 来原駅 / 買戸 over the picture): the game-style
      sync paints .sentence-text .char-token with its own !important colour, fill and stroke, which beat the stylesheet above.
      Inline !important on each glyph keeps the copy invisible whatever the synced style says. */
   for(const ch of [...r.text]){const s=document.createElement('span');s.className='char-token';s.textContent=ch;for(const [p,v] of HIDE)s.style.setProperty(p,v,'important');row.append(s);}
   for(const [p,v] of HIDE)row.style.setProperty(p,v,'important');
   item.append(row);
   /* the invisible copy spans the width the game drew the row at */
   requestAnimationFrame(()=>{const want=r.w*k.x,have=row.getBoundingClientRect().width;if(want>0&&have>0)row.style.letterSpacing=((want-have)/Math.max(1,[...r.text].length))+'px';});
   top=Math.min(top,r.y*k.y);bottom=Math.max(bottom,(r.y+r.h)*k.y);left=Math.min(left,r.x*k.x);right=Math.max(right,(r.x+r.w)*k.x);
  }
  /* 2026-11-13 (user: openings bilingual for every game, "译文设计和特效要尽量和原文一样"): the second line takes the drawn
     line's look as PageLocator read it (ink colour, halo, size, centred or flush left) and sits right under it (above it
     when the line is low on the screen); the item fades in and out with the line. A foreign group (the game drew the line
     in another language) shows its Japanese line that way instead, readable like the reader's own text. */
  const ink=(rows.find(r=>/^#[0-9a-f]{6}$/i.test(r.color||''))||{}).color||'#ffffff',halo=(rows.find(r=>/^#[0-9a-f]{6}$/i.test(r.glow||''))||{}).glow||'';
  const lum=c=>{const n=parseInt(c.slice(1),16);return ((n>>16&255)*.3+(n>>8&255)*.59+(n&255)*.11)/255;};
  /* a halo the colour of the ink (a soft glow) is drawn as that glow; a distinct one (dark outline) a bit tighter */const shadow=halo?(Math.abs(lum(halo)-lum(ink))>.08?'0 0 2px '+halo+',0 0 6px '+halo+',0 0 12px '+halo:'0 0 6px '+halo+',0 0 14px '+halo+',0 0 22px rgba(255,255,255,.6)'):(lum(ink)>.55?'0 0 3px rgba(0,0,0,.85),0 0 8px rgba(0,0,0,.5)':'0 0 3px rgba(255,255,255,.85),0 0 8px rgba(255,255,255,.5)');
  const rowH=(bottom-top)/Math.max(1,rows.length),gameW=(+m.sw||innerWidth)*k.x,gameRight=gameW,cx=gameW/2,half=gameW*.46,centred=Math.abs((left+right)/2-cx)<gameW*.05,low=bottom+rowH*1.6>innerHeight*.97;
  /* inline !important: the synced game style paints .sentence-text with its own alignment, colour and stroke */
  const set=(el,p,v)=>el.style.setProperty(p,v,'important');
  const place=(el,size,lines)=>{set(el,'font-size',size+'px');set(el,'color',ink);set(el,'text-shadow',shadow);set(el,'-webkit-text-stroke-width','0');set(el,'position','absolute');set(el,'display','block');set(el,'margin','0');set(el,'padding','0');set(el,'background','none');
   if(centred){set(el,'left',(cx-half)+'px');set(el,'width',(2*half)+'px');set(el,'text-align','center');}else{set(el,'left',Math.max(4,left)+'px');set(el,'width',Math.max(160,gameRight-left-8)+'px');set(el,'text-align','left');}
   set(el,'top',(low?top-size*1.4*lines-size*.25:bottom+size*.3)+'px');};
  const shown=String(m.shown||'').trim();
  if(shown){
   for(const row of [...item.querySelectorAll('.megulit-art-row')])row.remove();
   const ja=document.createElement('div');ja.className='sentence-text megulit-art-ja';ja.dataset.noI18n='';
   for(const ch of [...String(m.text||'')]){const s=document.createElement('span');s.className='char-token';s.textContent=ch;s.style.setProperty('color',ink,'important');s.style.setProperty('-webkit-text-fill-color',ink,'important');s.style.setProperty('text-shadow',shadow,'important');s.style.setProperty('-webkit-text-stroke-width','0','important');s.style.setProperty('filter','none','important');s.style.setProperty('background','none','important');ja.append(s);}
   place(ja,Math.max(12,rowH*.92),1);item.append(ja);
  }
  const translation=String(m.translation||'').trim();
  if(translation&&translation!==shown&&document.body.classList.contains('tomoyo-ui-translation')!==false){
   const cn=document.createElement('div');cn.className='megulit-art-cn';cn.textContent=translation;
   const size=Math.max(12,rowH*(shown?.7:.8));place(cn,size,Math.max(1,Math.ceil([...translation].length*size/(innerWidth*.9))));
   if(shown){const jaEl=item.querySelector('.megulit-art-ja');if(jaEl)cn.style.top=(parseFloat(jaEl.style.top)+(low?-size*1.45:rowH*1.2))+'px';}
   item.append(cn);
  }
  if(old)item.classList.add('is-shown');layer.append(item);items.set(m.id,item);if(!old)requestAnimationFrame(()=>item.classList.add('is-shown'));
 }
 b.artText=m=>{try{if(!m||m.id==null)return;if(m.visible===true)show(m);else remove(m.id);}catch{}};
})();
