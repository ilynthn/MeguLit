// SPDX-License-Identifier: GPL-3.0-or-later
// About dialog: MeguLit's own card with its links, then a credits roll read from web/credits.json (add names there, not here).
(function installAbout(){
 'use strict';
 if(window.__tomeAbout)return;
 if(!document.documentElement||!document.body){document.addEventListener('DOMContentLoaded',installAbout,{once:true});return;}
 window.__tomeAbout=true;
 const T={
  zh:{date:'2026年10月26日',title:'MeguLit',credit:'Galgame 阅读与日语学习工具',version:'版本',tome:'MeguLit',tomeBy:'魚魚棟',tomeDesc:'Galgame 阅读层与覆盖翻译、原文隐藏、自动注音、点读查词、AI 讲解与义项归纳、Anki 制卡、语音朗读、游戏原版字体导入和多种翻译引擎',license:'均以 GPL-3.0 许可发布',bili:'bilibili',thanks:'特别鸣谢',rollLabel:'致谢名单，悬停暂停，滚轮翻看'},
  en:{date:'Oct 26, 2026',title:'MeguLit',credit:'A visual novel reader and Japanese study tool',version:'Version',tome:'MeguLit',tomeBy:'魚魚棟',tomeDesc:'Reader overlay and translation for visual novels, original-text hiding, auto furigana, click lookups, AI explanations and sense summaries, Anki cards, text-to-speech, game font import and many translation engines',license:'All released under GPL-3.0',bili:'bilibili',thanks:'With thanks to',rollLabel:'Credits. Hover to pause, scroll to browse'},
  ja:{date:'2026年10月26日',title:'MeguLit',credit:'ギャルゲー読書・日本語学習ツール',version:'バージョン',tome:'MeguLit',tomeBy:'魚魚棟',tomeDesc:'ギャルゲー用の読書レイヤーと翻訳オーバーレイ、原文隠し、自動ふりがな、クリック辞書、AI 解説・語義まとめ、Anki カード作成、読み上げ、ゲームフォント取り込み、多数の翻訳エンジン',license:'すべて GPL-3.0 で公開',bili:'bilibili',thanks:'スペシャルサンクス',rollLabel:'クレジット。ホバーで一時停止、ホイールでスクロール'}
 };
 const open=url=>{try{const inv=window.__TAURI_INTERNALS__?.invoke;if(inv){inv('plugin:opener|open_url',{url}).catch(()=>navigator.clipboard?.writeText(url));return;}}catch{}try{navigator.clipboard.writeText(url);}catch{}};
 const style=document.createElement('style');style.textContent=`
 .about-modal.tome-about{width:min(620px,calc(100vw - 32px))!important;max-width:none!important}
 .about-modal.tome-about .about-links{display:none!important}
 .about-modal.tome-about .about-logo{display:none!important}
 .about-modal.tome-about .about-body{display:block!important}
 .tome-credits{display:flex;flex-direction:column;gap:10px;margin-top:4px}
 .tome-credit{padding:12px 14px;border-radius:12px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 10%,transparent);background:color-mix(in srgb,var(--theme-text,#eee) 3%,transparent)}
 .tome-credit.main{border-color:color-mix(in srgb,var(--theme-primary,#e0495a) 45%,transparent);background:color-mix(in srgb,var(--theme-primary,#e0495a) 7%,transparent)}
 .tome-credit-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
 .tome-credit-head b{font-size:14.5px}
 .tome-credit-head span{font-size:12px;color:var(--theme-textSecondary,#999)}
 .tome-credit-head span strong{color:var(--theme-text,#eee)}
 .about-modal.tome-about .credit{display:none!important}
 .tome-credit{text-align:left}
 .tome-about-page{max-width:640px;padding:6px 0 48px}
 .tome-about-page h2{margin:0 0 10px;font-size:24px;font-weight:800;color:var(--theme-text,#eee)}
 .tome-about-version{display:flex;align-items:baseline;gap:10px;margin-bottom:18px;color:var(--theme-textSecondary,#999);font-size:12.5px}
 .tome-about-version b{font-size:20px;color:var(--theme-text,#eee)}
 .tome-credit p{margin:5px 0 8px;font-size:12px;line-height:1.6;color:var(--theme-textSecondary,#aaa)}
 .tome-credit-links{display:flex;gap:14px;flex-wrap:wrap}
 .tome-credit-links button{all:unset;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--tome-picture-accent,var(--theme-primary,#e0495a))}
 .tome-credit-links button:hover{text-decoration:underline}
 .tome-roll-label{margin:14px 0 0;font-size:11px;font-weight:600;letter-spacing:.16em;text-align:center;color:var(--tome-gold,#d6b46a)}
 .tome-roll{position:relative;height:240px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;outline:none;text-align:center;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 16%,#000 84%,transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 16%,#000 84%,transparent 100%)}
 .tome-roll::-webkit-scrollbar{display:none}
 .tome-roll:focus-visible{box-shadow:0 0 0 2px color-mix(in srgb,var(--theme-primary,#e0495a) 55%,transparent);border-radius:10px}
 .tome-roll-track{padding:150px 12px 170px}
 .tome-roll-group{margin:0 0 30px}
 .tome-roll-head{margin:0 0 12px;font-size:11.5px;font-weight:600;letter-spacing:.14em;color:var(--tome-gold,#d6b46a)}
 .tome-roll-item{margin:0 0 10px;line-height:1.45}
 .tome-roll-item b{display:block;font-family:'Noto Serif JP',serif;font-size:14px;font-weight:600;color:var(--theme-text,#eee);overflow-wrap:anywhere}
 .tome-roll-item span{display:block;margin-top:1px;font-size:11.5px;color:var(--theme-textSecondary,#999);overflow-wrap:anywhere}
 .tome-roll.static{height:auto;overflow:visible;-webkit-mask-image:none;mask-image:none;text-align:left}
 .tome-roll.static .tome-roll-track{padding:4px 0 0}
 .tome-roll.static .tome-roll-group{margin:0 0 18px}
 .tome-roll.static .tome-roll-item{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;margin:0 0 6px}
 .tome-roll.static .tome-roll-item b{display:inline;font-size:13px}
 .tome-roll.static .tome-roll-item span{display:inline;margin:0}
 .tome-roll-label{text-align:center}
 .tome-roll-label:has(+.tome-roll.static){text-align:left}
 .tome-credit-note{font-size:11px;color:var(--theme-textSecondary,#888);margin-top:2px}`;
 (document.head||document.documentElement).appendChild(style);
 function card(main,name,by,desc,links,note){const c=document.createElement('div');c.className='tome-credit'+(main?' main':'');const head=document.createElement('div');head.className='tome-credit-head';const b=document.createElement('b');b.textContent=name;const s=document.createElement('span');s.append('by ');const st=document.createElement('strong');st.textContent=by;s.append(st);head.append(b,s);const p=document.createElement('p');p.textContent=desc;const l=document.createElement('div');l.className='tome-credit-links';for(const [label,url] of links){const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.title=url;btn.onclick=()=>open(url);l.append(btn);}c.append(head,p);if(note){const n=document.createElement('small');n.className='tome-credit-based';n.textContent=note;c.append(n);}c.append(l);return c;}
 function decorate(modal){
  const lang=window.__tomeI18n?.get?.()||'zh',t=T[lang]||T.zh;
  if(modal.dataset.tomeAboutLang===lang)return;modal.dataset.tomeAboutLang=lang;modal.classList.add('tome-about');
  const h=modal.querySelector('.modal-title');if(h)h.textContent=t.title;
  const credit=modal.querySelector('.credit');if(credit)credit.textContent=t.credit;
  const label=modal.querySelector('.version-label');if(label)label.textContent=t.version;
  // Show MeguLit's own version; remember the tomoyo version/date the legacy modal carried.
  const value=modal.querySelector('.version-value'),date=modal.querySelector('.version-date');
  if(value&&!modal.dataset.tomoyoVersion){modal.dataset.tomoyoVersion=value.textContent.trim();modal.dataset.tomoyoDate=(date?.textContent||'').trim();}
  for(const node of [label,value,date])if(node){node.textContent='';node.hidden=true;}
  if(modal.dataset.tomoyoVersion)try{localStorage.setItem('tome-tomoyo-version',JSON.stringify([modal.dataset.tomoyoVersion,modal.dataset.tomoyoDate||'']));}catch{}
  modal.querySelector('.tome-credits')?.remove();
  (modal.querySelector('.about-info')||modal.querySelector('.about-body')||modal).append(credits(t));
 }
 /* Credits roll: web/credits.json is the list; the roll creeps upward like the end of a film, stops while hovered or
    focused, follows the wheel, and is a plain list when the system asks for reduced motion. */
 const ROLL_SPEED=0.022,ROLL_REST=2600;
 let creditsData=null,creditsLoad=null;
 const loadCredits=()=>creditsLoad||(creditsLoad=fetch('/credits.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{creditsData=j&&Array.isArray(j.groups)?j:null;if(!creditsData)creditsLoad=null;return creditsData;}).catch(()=>{creditsLoad=null;return null;}));
 const pick=(v,lang)=>v==null?'':typeof v==='string'?v:String(v[lang]||v.en||v.zh||'');
 function fillRoll(track,data,lang){
  track.replaceChildren();
  for(const g of data.groups||[]){const items=(g.items||[]).filter(i=>i&&pick(i.name,lang));if(!items.length)continue;
   const sec=document.createElement('section');sec.className='tome-roll-group';sec.dataset.group=String(g.id||'');
   const h=document.createElement('div');h.className='tome-roll-head';h.textContent=pick(g.title,lang);sec.append(h);
   for(const i of items){const row=document.createElement('div');row.className='tome-roll-item';const n=document.createElement('b');n.textContent=pick(i.name,lang);row.append(n);
    const sub=[i.by,pick(i.note,lang)].filter(Boolean).join(' · ');if(sub){const s=document.createElement('span');s.textContent=sub;row.append(s);}sec.append(row);}
   track.append(sec);}
 }
 function startRoll(roll){
  const calm=matchMedia('(prefers-reduced-motion: reduce)');let held=false,pos=0,last=0,restUntil=0,wrapAt=0;
  const hold=on=>{held=on;if(!on)pos=roll.scrollTop;};
  roll.addEventListener('pointerenter',()=>hold(true));roll.addEventListener('pointerleave',()=>hold(roll.contains(document.activeElement)));
  roll.addEventListener('focusin',()=>hold(true));roll.addEventListener('focusout',()=>hold(roll.matches(':hover')));
  roll.addEventListener('wheel',()=>{restUntil=performance.now()+ROLL_REST;wrapAt=0;},{passive:true});
  roll.addEventListener('scroll',()=>{if(held||Math.abs(roll.scrollTop-pos)>2)pos=roll.scrollTop;},{passive:true});
  const tick=now=>{if(!roll.isConnected)return;
   const still=calm.matches;roll.classList.toggle('static',still);
   if(still||document.hidden||!roll.offsetParent){last=0;setTimeout(()=>requestAnimationFrame(tick),400);return;}
   const dt=last?Math.min(64,now-last):0;last=now;const max=roll.scrollHeight-roll.clientHeight;
   if(!held&&now>restUntil&&max>0){
    if(pos>=max-1){if(!wrapAt)wrapAt=now+ROLL_REST;else if(now>wrapAt){wrapAt=0;pos=0;roll.scrollTop=0;restUntil=now+ROLL_REST/2;}}
    else{pos=Math.min(max,pos+dt*ROLL_SPEED);roll.scrollTop=pos;}}
   requestAnimationFrame(tick);};
  requestAnimationFrame(tick);
 }
 function credits(t){
  const lang=window.__tomeI18n?.get?.()||'zh';
  const box=document.createElement('div');box.className='tome-credits';box.dataset.noI18n='';
  box.append(card(false,t.tome,t.tomeBy,t.tomeDesc,[['GitHub','https://github.com/ilynthn'],[t.bili,'https://space.bilibili.com/10739534']]));
  const label=document.createElement('div');label.className='tome-roll-label';label.textContent=t.thanks;
  const roll=document.createElement('div');roll.className='tome-roll';roll.tabIndex=0;roll.setAttribute('role','region');roll.setAttribute('aria-label',t.rollLabel);
  const track=document.createElement('div');track.className='tome-roll-track';roll.append(track);
  const note=document.createElement('div');note.className='tome-credit-note';note.textContent=t.license;
  box.append(label,roll,note);
  const show=data=>{if(!data){label.hidden=roll.hidden=true;return;}label.hidden=roll.hidden=false;fillRoll(track,data,lang);startRoll(roll);};
  if(creditsData)show(creditsData);else{label.hidden=roll.hidden=true;loadCredits().then(show);}
  return box;
 }
 // Settings page "关于" tab: title, version and the same credits.
 window.__tomeAboutPanel=()=>{const lang=window.__tomeI18n?.get?.()||'zh',t=T[lang]||T.zh;let ver='1.4.0',date='2026年 10月 18日';try{const v=JSON.parse(localStorage.getItem('tome-tomoyo-version')||'null');if(v){ver=v[0]||ver;date=v[1]||date;}}catch{}
  const wrap=document.createElement('div');wrap.className='tome-about-page';wrap.dataset.noI18n='';const h=document.createElement('h2');h.textContent=t.title;const vl=document.createElement('div');vl.className='tome-about-version';const lab=document.createElement('span');lab.textContent=t.version;const val=document.createElement('b');val.textContent='';const dt=document.createElement('span');dt.className='date';dt.textContent=t.date;vl.append(lab,val,dt);wrap.append(h,credits(t));return wrap;};
 const scan=()=>{for(const m of document.querySelectorAll('.about-modal'))decorate(m);};
 new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
 const prev=window.__tomeI18n?.set;if(prev)window.__tomeI18n.set=v=>{prev(v);for(const m of document.querySelectorAll('.about-modal'))delete m.dataset.tomeAboutLang;scan();};
 scan();
})();
