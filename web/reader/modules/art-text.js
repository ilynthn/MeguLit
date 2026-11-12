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
.megulit-art-cn{position:absolute;white-space:pre-wrap;text-align:center;pointer-events:none;font-family:var(--tomoyo-gal-cn-font,"Microsoft YaHei",sans-serif);color:#fff;text-shadow:0 0 3px rgba(0,0,0,.9),0 0 8px rgba(0,0,0,.6);line-height:1.35}`;
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
  const translation=String(m.translation||'').trim();
  if(translation&&document.body.classList.contains('tomoyo-ui-translation')!==false){
   const cn=document.createElement('div');cn.className='megulit-art-cn';cn.textContent=translation;
   const size=Math.max(12,Math.min(34,(bottom-top)/Math.max(1,rows.length)*0.62));cn.style.fontSize=size+'px';
   cn.style.left=Math.max(4,left-40)+'px';cn.style.width=Math.max(120,right-left+80)+'px';cn.style.top=(bottom+size*0.35)+'px';
   item.append(cn);
  }
  if(old)item.classList.add('is-shown');layer.append(item);items.set(m.id,item);if(!old)requestAnimationFrame(()=>item.classList.add('is-shown'));
 }
 b.artText=m=>{try{if(!m||m.id==null)return;if(m.visible===true)show(m);else remove(m.id);}catch{}};
})();
