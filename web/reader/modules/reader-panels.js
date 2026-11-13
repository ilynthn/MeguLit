// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 reader panels「推镜 Push-cut」(option D, judges 8.5 / 8.7): 点读卡, 对话记录 and Alt+T share one quiet ink
   surface. Opacity, radius and border stay the user's own (--tome-p-*). Alt+T gets a one-line header, its hotkeys move to
   the footer; no ordinal numbers, corner marks or stripes. Motion: the panel cuts in at 97% and pushes to 100% (220 ms),
   one red line runs under the header, the word card's headword slides 10 px. GSAP is loaded on idle from ../vendor; until
   it is there (or with reduced motion) panels simply appear. Timelines are killed on completion: nothing keeps running. */
(function installReaderPanels(){
 'use strict';if(!document.head||!document.body){document.addEventListener('DOMContentLoaded',installReaderPanels,{once:true});return;}
 if(window.__megulitPanels)return;window.__megulitPanels=true;
 const R='html:not(#mgp1):not(#mgp2):not(#mgp3):not(#mgp4):not(#mgp5):not(#mgp6):not(#mgp7):not(#mgp8):not(#mgp9) body';
 const P=':is(.tomoyo-cn-dialog,.tomoyo-selection-card,.tome-backlog)';
 const css=String.raw`
${R} ${P}{--ink:#f3efe8;--ink2:#cfc8bd;--ink3:#b0aaa0;--line:rgba(243,239,232,.13);--red:#d8343e;--redi:#ff7880;
 color:var(--ink)!important;border:1px solid rgba(243,239,232,var(--tome-p-border,.08))!important;border-radius:var(--tome-p-radius,18px)!important;
 box-shadow:0 24px 64px rgba(0,0,0,.5)!important}
${R} ${P} .tome-menu-bg{background-color:#0a090a!important}
${R} .mgp-line{position:absolute;left:0;bottom:-1px;height:2px;width:100%;background:var(--red);transform-origin:0 50%;pointer-events:none}
${R} ${P} :is(.hint,small,.tomoyo-muted,.tome-imm-hint,.tome-bg-hint,.tome-speaker-hint,.tome-voice-note,.tomoyo-card-meta *,.tome-log-tr){letter-spacing:0!important}

/* ---------- Alt+T: one-line header, hotkeys live in the footer's left column ---------- */
${R} .tomoyo-cn-dialog form{position:relative!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-header{position:static!important;display:flex!important;align-items:baseline!important;gap:12px!important;padding:16px 22px 14px!important;min-height:0!important;border-bottom:1px solid var(--line)!important;background:transparent!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-header h3{display:flex!important;align-items:baseline!important;gap:12px!important;margin:0!important;font:700 17px/1.2 "Microsoft YaHei UI",sans-serif!important;color:var(--ink)!important;letter-spacing:.01em!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-header h3 span{font:400 12px/1.4 "Microsoft YaHei UI",sans-serif!important;color:var(--ink3)!important;letter-spacing:0!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-header small{position:absolute!important;left:22px!important;right:22px!important;bottom:66px!important;top:auto!important;width:auto!important;max-height:42px!important;overflow:hidden!important;margin:0!important;display:block!important;
 font:400 11.5px/1.75 "Microsoft YaHei UI",sans-serif!important;color:var(--ink3)!important;pointer-events:none;z-index:2}
${R} .tomoyo-cn-dialog .tomoyo-menu-header small>span{margin-right:14px!important;white-space:nowrap}
${R} .tomoyo-cn-dialog .tomoyo-menu-header small kbd{margin-right:4px!important;font-size:10.5px!important;height:18px!important;min-width:18px!important;padding:0 4px!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-tabs{border-right:1px solid var(--line)!important;padding:12px 8px!important;background:transparent!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-tabs button[aria-selected=true]{box-shadow:none!important;background:rgba(243,239,232,.08)!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-tabs button[aria-selected=true]::after{display:none!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-tabs button[aria-selected=true] :is(span,svg){color:var(--ink)!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-tabs button[aria-selected=true] svg{color:var(--redi)!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content{padding:18px 22px!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content fieldset{border:0!important;padding:0!important;background:transparent!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content :is(.tome-mask-card,.tome-hook-main,.tomoyo-dictionary-card,.tome-voice-pack,.tome-calibration-imports,.tome-game-style-sync,.tome-bg-panels){border:1px solid var(--line)!important;border-radius:2px!important;background:rgba(243,239,232,.03)!important;box-shadow:none!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content :is(legend,h4,h5,.megulit-ruby-rows-title,.tome-gamefont-head,.tome-voice-pack-head){font:700 13px/1.4 "Microsoft YaHei UI",sans-serif!important;letter-spacing:0!important;text-transform:none!important;color:var(--ink)!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content details{border:0!important;border-top:1px solid var(--line)!important;border-radius:0!important;background:transparent!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content details>summary{font:700 13.5px/1.3 "Microsoft YaHei UI",sans-serif!important;padding:12px 2px!important;color:var(--ink)!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content :is(.hint,small,.tomoyo-muted,.tome-imm-hint,.tome-bg-hint,.tome-speaker-hint,.tome-voice-note){font-size:12px!important;line-height:1.65!important;color:var(--ink3)!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content label{font-size:13.5px!important;font-weight:500!important;color:var(--ink)!important}
${R} .tomoyo-cn-dialog :is(.tomoyo-slider-value,output){color:var(--ink)!important;background:rgba(243,239,232,.08)!important;font:600 12px/1 "Cascadia Mono",Consolas,monospace!important;border-radius:2px!important}
${R} .tomoyo-cn-dialog form>footer{position:relative;min-height:0!important;border-top:1px solid var(--line)!important;padding:58px 22px 14px!important;background:transparent!important;align-items:center!important}

/* ---------- 点读卡 ---------- */
${R} .tomoyo-selection-card>header{position:relative;padding:10px 14px!important;border-bottom:1px solid var(--line)!important;background:transparent!important}
${R} .tomoyo-selection-card .tomoyo-selection-body{padding:18px 22px 10px!important}
${R} .tomoyo-selection-card .tomoyo-word-heading strong{position:relative;font:700 32px/1.1 "Noto Sans JP","Yu Gothic UI","Microsoft YaHei UI",sans-serif!important;color:#fff!important;letter-spacing:.01em!important}
${R} .tomoyo-selection-card .tomoyo-word-heading strong::after{content:"";position:absolute;left:0;bottom:-7px;width:24px;height:3px;background:var(--red)}
${R} .tomoyo-selection-card .tomoyo-word-reading{margin-top:14px!important;font:500 14px/1.5 "Noto Sans JP","Yu Gothic UI",sans-serif!important;letter-spacing:.06em!important;color:var(--ink2)!important}
${R} .tomoyo-selection-card .tomoyo-word-pos{font:400 12px/1 "Microsoft YaHei UI",sans-serif!important;letter-spacing:0!important;color:var(--ink3)!important;border:0!important;padding:0!important}
${R} .tomoyo-selection-card .tomoyo-senses{margin-top:14px!important}
${R} .tomoyo-selection-card .tomoyo-sense{padding:9px 0!important;border-top:1px solid var(--line)!important;align-items:baseline!important}
${R} .tomoyo-selection-card .tomoyo-sense-number{font:700 12px/1 "Cascadia Mono",Consolas,monospace!important;color:var(--redi)!important;min-width:28px!important}
${R} .tomoyo-selection-card .tomoyo-sense>div{font:400 14.5px/1.7 "Microsoft YaHei UI",sans-serif!important;color:var(--ink)!important}
${R} .tomoyo-selection-card .tomoyo-card-meta{padding:6px 22px 12px!important}
${R} .tomoyo-selection-card .tomoyo-card-meta :is(small,span){font:400 12px/1.4 "Microsoft YaHei UI",sans-serif!important;color:var(--ink3)!important}

/* ---------- 对话记录 ---------- */
${R} .tome-backlog>header{position:relative;padding:16px 22px 14px!important;border-bottom:1px solid var(--line)!important;background:transparent!important}
${R} .tome-backlog .tome-log-heading span{display:none!important}
${R} .tome-backlog .tome-log-heading h3{margin:0!important;font:700 17px/1.2 "Microsoft YaHei UI",sans-serif!important}
${R} .tome-backlog .tome-log-count{font:400 12px/1 "Microsoft YaHei UI",sans-serif!important;color:var(--ink3)!important}
${R} .tome-backlog .tome-log-break{font:400 12px/1 "Cascadia Mono",Consolas,monospace!important;letter-spacing:0!important;color:var(--ink3)!important}
${R} .tome-backlog .tome-log-item{background:transparent!important;border-radius:0!important;border-bottom:1px solid var(--line)!important;padding:14px 22px!important;box-shadow:none!important}
${R} .tome-backlog .tome-log-item:last-of-type .tome-log-src{font-weight:700!important;color:#fff!important}
${R} .tome-backlog .tome-log-item:last-of-type .tome-log-name i{color:var(--redi)!important}
${R} .tome-backlog .tome-log-item:hover{background:rgba(243,239,232,.04)!important}
${R} .tome-backlog .tome-log-name i{font:500 12px/1.4 "Microsoft YaHei UI",sans-serif!important;font-style:normal!important;letter-spacing:0!important;color:var(--ink3)!important}
${R} .tome-backlog .tome-log-src{font:500 18px/1.75 "Noto Sans JP","Yu Gothic UI",sans-serif!important;color:var(--ink)!important}
${R} .tome-backlog .tome-log-tr{margin-top:4px!important;font:400 13.5px/1.6 "Microsoft YaHei UI",sans-serif!important;color:var(--ink2)!important}
${R} .tome-backlog>footer{border-top:1px solid var(--line)!important;font:400 12px/1 "Microsoft YaHei UI",sans-serif!important;color:var(--ink3)!important;background:transparent!important}
/* ---------- round 3 ---------- */
/* weights: body 400, options 500, section titles 600, headword 800 */
${R} .tomoyo-cn-dialog .tomoyo-menu-content :is(label,p,div,span){font-weight:400}
${R} .tomoyo-cn-dialog .tomoyo-menu-content label{font-weight:500!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content :is(legend,h4,h5,.megulit-ruby-rows-title,.tome-gamefont-head,.tome-voice-pack-head),${R} .tomoyo-cn-dialog .tomoyo-menu-content details>summary{font-weight:600!important;font-size:14px!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content details>summary::before{content:none!important;display:none!important;border:0!important;transform:none!important;background:none!important;height:auto!important;position:static!important;opacity:1!important;box-shadow:none!important;mask:none!important;-webkit-mask:none!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content details>summary{list-style:none!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content details>summary::-webkit-details-marker{display:none!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content details>summary>:is(svg:first-child,i:first-child,.chevron-left){display:none!important}
/* content fades out above the footer: there is more below */
${R} .tomoyo-cn-dialog .tomoyo-menu-content{-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 26px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 26px),transparent)}
/* hotkeys: one line of keys; the two tips go to the tooltip */
${R} .tomoyo-cn-dialog .tomoyo-menu-header small{max-height:22px!important;bottom:62px!important;white-space:nowrap!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-header small>span:not(:has(kbd)){display:none!important}
${R} .tomoyo-cn-dialog form>footer{padding-top:44px!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-tabs button{padding-block:7px!important}
/* word card: reading in gilt (the one gold text), no underline under the headword, meta fully opaque */
${R} .tomoyo-selection-card .tomoyo-word-heading strong{font-weight:800!important}
${R} .tomoyo-selection-card .tomoyo-word-heading strong::after{display:none!important}
${R} .tomoyo-selection-card .tomoyo-word-reading{margin-top:8px!important;color:#d9b46a!important}
${R} .tomoyo-selection-card .tomoyo-card-meta,${R} .tomoyo-selection-card .tomoyo-card-meta *{opacity:1!important;color:var(--ink3)!important}
/* backlog: no stripes at all; current line = speaker in red + brighter text */
${R} .tome-backlog .tome-log-item,${R} .tome-backlog .tome-log-item:last-of-type{border-left:0!important;box-shadow:none!important;background-image:none!important;background-color:transparent!important;outline:0!important}
${R} .tome-backlog .tome-log-item::before,${R} .tome-backlog .tome-log-item::after{display:none!important;content:none!important}
${R} .tome-backlog .tome-log-tr{border-left:0!important;padding-left:0!important;color:#c5beb3!important}
${R} .tome-backlog .tome-log-item:last-of-type .tome-log-src{font-weight:500!important}

/* ---------- round 4 ---------- */
${R} .tomoyo-cn-dialog .tomoyo-menu-content :is(legend,h4,h5,.megulit-ruby-rows-title,.tome-gamefont-head,.tome-voice-pack-head),${R} .tomoyo-cn-dialog .tomoyo-menu-content details>summary{font-size:15px!important;font-weight:600!important;color:#fff!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content label{font-weight:400!important;color:var(--ink)!important}
${R} .tomoyo-cn-dialog .tome-bg-surfaces .setting-row{display:grid!important;grid-template-columns:96px minmax(0,1fr)!important;align-items:center!important;gap:12px!important}
${R} .tomoyo-cn-dialog .tomoyo-dictionary-title span{display:inline-block;padding:3px 7px!important;border:1px solid var(--line)!important;border-radius:2px!important;background:rgba(243,239,232,.06)!important;color:var(--ink2)!important;font:400 12px/1 "Microsoft YaHei UI",sans-serif!important}
${R} .tome-backlog :is(.tome-log-tr,.tome-log-tr *){font-size:13px!important}
${R} .tomoyo-selection-card .tomoyo-word-heading strong{font-size:40px!important;line-height:1.05!important}

${R} .tome-backlog :is(.tome-log-tr,.tome-log-tr *){opacity:1!important;color:var(--ink3)!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content :is(.tome-bg-panels,.tome-mask-card,.tome-voice-pack,.tome-calibration-imports)>details:first-of-type{border-top:0!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content :is(.tome-bg-panels,.tome-mask-card,.tome-voice-pack,.tome-calibration-imports)>:first-child{border-top:0!important;margin-top:0!important}

/* ---------- round 5: small layout fixes ---------- */
${R} .tomoyo-cn-dialog .tomoyo-menu-content details{border:0!important;border-top:1px solid var(--line)!important;background:transparent!important;border-radius:0!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content details>summary{display:flex!important;align-items:center!important;min-height:48px!important;padding:0 2px!important}
${R} .tomoyo-cn-dialog .tome-bg-panels{border:0!important;background:transparent!important;padding:0!important}
${R} .tomoyo-cn-dialog .tome-bg-surfaces .setting-row>*{align-self:center!important;margin-block:0!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content :is(.hint,.tome-bg-hint)+:is(.hint,.tome-bg-hint){margin-top:8px!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content p.tome-bg-hint,${R} .tomoyo-cn-dialog .tomoyo-menu-content .tome-bg-hint p{margin-block:0 8px!important}
${R} .tomoyo-selection-card .tomoyo-word-heading{align-items:center!important}
${R} .tomoyo-selection-card .tomoyo-word-pos{align-self:center!important}

${R} .tomoyo-cn-dialog .tomoyo-menu-content [class*=tome-bg] details>summary{padding:0 14px!important}
${R} .tomoyo-cn-dialog .tomoyo-menu-content [class*=tome-bg] details>:not(summary){padding-inline:14px!important}
`;
 const style=document.createElement('style');style.id='megulit-reader-panels';style.textContent=css;document.head.appendChild(style);
 let gsap=window.gsap||null,reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const load=()=>{if(gsap||load.p)return;load.p=1;const s=document.createElement('script');s.src=new URL('../vendor/gsap.min.js',document.baseURI).href;s.async=true;
  s.onload=()=>{gsap=window.gsap||null;};s.onerror=()=>{load.p=0;};document.head.append(s);};
 (window.requestIdleCallback||setTimeout)(load,{timeout:4000});
 const once=(parent,cls)=>{let n=parent.querySelector(':scope>.'+cls);if(!n){n=document.createElement('i');n.className=cls;n.setAttribute('aria-hidden','true');parent.appendChild(n);}return n;};
 const E='expo.out',PUSH=.22,LINE=.22;
 const play=(el,head,lineHost,extra)=>{
  if(!gsap||reduce.matches||!el.isConnected)return;
  const line=lineHost?once(lineHost,'mgp-line'):null;
  if(line&&head&&lineHost!==head){line.style.top=(head.offsetTop+head.offsetHeight-1)+'px';line.style.bottom='auto';}
  const tl=gsap.timeline({defaults:{ease:E},onComplete:()=>tl.kill()});
  tl.fromTo(el,{scale:.97},{scale:1,duration:PUSH,clearProps:'transform'});
  if(line)tl.fromTo(line,{scaleX:0},{scaleX:1,duration:LINE,clearProps:'transform'},0);
  if(extra)extra(tl);
 };
 const seen=new WeakSet();
 const open=n=>{
  if(n.nodeType!==1)return;
  const card=n.matches('.tomoyo-selection-card')?n:n.querySelector?.('.tomoyo-selection-card');
  if(card&&!seen.has(card)){seen.add(card);const w=card.querySelector('.tomoyo-word-heading strong'),h=card.querySelector(':scope>header');
   requestAnimationFrame(()=>play(card,h,h,tl=>{if(w)tl.fromTo(w,{x:-10},{x:0,duration:.24,clearProps:'transform'},.02);}));}
  const log=n.matches('.tome-backlog')?n:n.querySelector?.('.tome-backlog');
  if(log&&!seen.has(log)){seen.add(log);const h=log.querySelector(':scope>header');requestAnimationFrame(()=>play(log,h,h));}
 };
 new MutationObserver(list=>{for(const m of list){
  if(m.type==='childList'){for(const n of m.addedNodes)open(n);continue;}
  const d=m.target;if(!d.matches?.('dialog.tomoyo-cn-dialog')||!d.open)continue;
  const form=d.querySelector('form'),head=d.querySelector('.tomoyo-menu-header');
  const sm=head?.querySelector('small');if(sm&&!sm.title)sm.title=[...sm.querySelectorAll(':scope>span')].filter(x=>!x.querySelector('kbd')).map(x=>x.textContent.trim()).join(' · ');
  requestAnimationFrame(()=>play(d,head,form));
 }}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
 document.addEventListener('click',e=>{if(!gsap||reduce.matches||!e.target.closest?.('.tomoyo-cn-dialog .tomoyo-menu-tabs button'))return;
  requestAnimationFrame(()=>{const c=document.querySelector('.tomoyo-cn-dialog .tomoyo-menu-content');if(!c)return;
   const tl=gsap.timeline({onComplete:()=>tl.kill()});tl.fromTo(c,{x:-8},{x:0,duration:.18,ease:E,clearProps:'transform'});});},true);
})();
