/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 2026-11-13 (user: 落地 B) Control system B「红魔魔导书·进阶」in the in-game reader: Alt+T menu, word card, backlog, HUD.
   Same language as the launcher (web/controls-b.css, tokens in web/controls-b-tokens.css): one 2px radius, hover is a
   whisper, press settles, red = commit / you are here, gold = keyboard focus only, the diamond marks the current page,
   the switch knob and the radio core. In-game controls only change colour: nothing moves or glows over the game.
   Loaded last; rules sit under one high-specificity root so they win over the older module styles without editing them.
   The shared tokens follow the reader's own appearance (bootstrap.js sets --theme-* for light / dark / black). */
(function installControlsB(){
 'use strict';
 if(document.getElementById('megulit-controls-b'))return;
 const R='html:not(#mgr1):not(#mgr2):not(#mgr3):not(#mgr4):not(#mgr5):not(#mgr6):not(#mgr7):not(#mgr8)';
 const css=String.raw`
${R} body{
 & .tomoyo-cn-dialog,& .tomoyo-selection-card,& .tome-backlog{
  & :is(button,summary,input,select,textarea,[role=tab]):focus-visible{outline:var(--mgc-focus)!important;outline-offset:2px!important;box-shadow:var(--mgc-focus-halo)!important}
 }

 /* ---------- Alt+T rail: a hairline spine, the current page gets the red rule and the diamond ---------- */
 & .tomoyo-menu-tabs{border-right:0!important}
 & .tomoyo-menu-tabs button{position:relative;border:0!important;border-radius:var(--mgc-r)!important;background:transparent!important;color:var(--mgc-ink-2)!important;box-shadow:none!important;transform:none!important;
  font-family:var(--mgc-ui)!important;letter-spacing:.06em!important;transition:background-color var(--mgc-t),color var(--mgc-t)!important}
 & .tomoyo-menu-tabs button:hover{background:var(--mgc-tint)!important;color:var(--mgc-ink)!important}
 & .tomoyo-menu-tabs button:active{background:var(--mgc-tint-2)!important}
 & .tomoyo-menu-tabs button[aria-selected=true]{color:var(--mgc-ink)!important;font-weight:600!important;background:linear-gradient(90deg,color-mix(in srgb,var(--mgc-red) 18%,transparent),transparent)!important;box-shadow:inset 2px 0 0 var(--mgc-red)!important}
 & .tomoyo-menu-tabs button[aria-selected=true] svg{color:var(--mgc-red-ink)!important}
 & .tomoyo-menu-tabs button[aria-selected=true]::after{content:""!important;position:absolute!important;left:-4.5px!important;top:50%!important;width:7px!important;height:7px!important;margin-top:-3.5px!important;transform:rotate(45deg)!important;background:var(--mgc-red)!important;border:1px solid color-mix(in srgb,var(--mgc-red) 60%,#fff)!important;border-radius:0!important;display:block!important;opacity:1!important}

 /* ---------- buttons in the menu ---------- */
 & .tomoyo-cn-dialog button:not(.tomoyo-menu-tabs button):not(.tome-color-swatch):not(.tome-menu-close):not(.megulit-ruby-row-chip):not([type=submit]):not(.tome-reset-row>button){
  min-height:32px;padding:0 14px!important;border:1px solid var(--mgc-line)!important;border-radius:var(--mgc-r)!important;background:transparent!important;color:var(--mgc-ink)!important;
  font:500 13px/1 var(--mgc-ui)!important;letter-spacing:.03em!important;box-shadow:none!important;transform:none!important;transition:background-color var(--mgc-t),border-color var(--mgc-t)!important}
 & .tomoyo-cn-dialog button:not(.tomoyo-menu-tabs button):not(.tome-color-swatch):not(.tome-menu-close):not(.megulit-ruby-row-chip):not([type=submit]):not(.tome-reset-row>button):hover:not(:disabled){background:var(--mgc-tint)!important;border-color:color-mix(in srgb,var(--mgc-ink) 55%,transparent)!important}
 & .tomoyo-cn-dialog button:not(.tomoyo-menu-tabs button):not(.tome-color-swatch):not(.tome-menu-close):not(.megulit-ruby-row-chip):not([type=submit]):not(.tome-reset-row>button):active:not(:disabled){background:var(--mgc-tint-2)!important;border-color:var(--mgc-ink)!important}
 & .tomoyo-cn-dialog button:disabled{border-style:dashed!important;color:var(--mgc-ink-3)!important;background:transparent!important;opacity:1!important}
 /* the menu's save button is the crimson plate */
 & .tomoyo-cn-dialog footer button[type=submit],& .tomoyo-cn-dialog button[type=submit]{min-height:36px;padding:0 18px!important;border:1px solid var(--mgc-red)!important;border-radius:var(--mgc-r)!important;background:var(--mgc-red)!important;color:#fff!important;
  font:600 14px/1 var(--mgc-ui)!important;letter-spacing:.04em!important;box-shadow:none!important;transform:none!important;transition:background-color var(--mgc-t)!important}
 & .tomoyo-cn-dialog button[type=submit]:hover:not(:disabled){background:var(--mgc-red-hi)!important;border-color:var(--mgc-red-hi)!important;box-shadow:inset 0 -2px 0 var(--mgc-red-lo)!important}
 & .tomoyo-cn-dialog button[type=submit]:active:not(:disabled){background:var(--mgc-red-lo)!important;border-color:var(--mgc-red-lo)!important;box-shadow:none!important}
 & .tomoyo-cn-dialog button[type=submit]:disabled{background:transparent!important;border:1px dashed color-mix(in srgb,var(--mgc-ink) 25%,transparent)!important;color:var(--mgc-ink-3)!important}
 /* danger: crimson text on a hairline, the deep blood plate with a left rule when pressed */
 & .tomoyo-cn-dialog .tome-reset-row>button{min-height:34px;padding:0 14px!important;border:1px solid color-mix(in srgb,var(--mgc-red) 45%,transparent)!important;border-radius:var(--mgc-r)!important;background:transparent!important;color:var(--mgc-red-ink)!important;font:500 13px/1 var(--mgc-ui)!important;box-shadow:none!important}
 & .tomoyo-cn-dialog .tome-reset-row>button:hover{background:color-mix(in srgb,var(--mgc-red) 16%,transparent)!important;border-color:var(--mgc-red)!important}
 & .tomoyo-cn-dialog .tome-reset-row>button:active{background:var(--mgc-red-deep)!important;border-color:var(--mgc-red-deep)!important;border-left:4px solid #ff8a90!important;color:#fff!important}
 /* close buttons (menu, card, backlog) and backlog icon buttons */
 & :is(.tomoyo-cn-dialog .tome-menu-close,.tomoyo-selection-card header button:not(.tomoyo-anki-button):not(.mg-ai-btn):not(.tomoyo-speak-button):not(.tomoyo-save-sentence-button),.tome-backlog header button,.tome-log-actions button){border:1px solid transparent!important;border-radius:var(--mgc-r)!important;background:transparent!important;color:var(--mgc-ink-2)!important;box-shadow:none!important;transform:none!important;transition:background-color var(--mgc-t),color var(--mgc-t),border-color var(--mgc-t)!important}
 & :is(.tomoyo-cn-dialog .tome-menu-close,.tomoyo-selection-card header button:not(.tomoyo-anki-button):not(.mg-ai-btn):not(.tomoyo-speak-button):not(.tomoyo-save-sentence-button),.tome-backlog header button,.tome-log-actions button):hover{background:var(--mgc-tint)!important;border-color:color-mix(in srgb,var(--mgc-ink) 40%,transparent)!important;color:var(--mgc-ink)!important}
 & :is(.tomoyo-cn-dialog .tome-menu-close,.tomoyo-selection-card header button:not(.tomoyo-anki-button):not(.mg-ai-btn):not(.tomoyo-speak-button):not(.tomoyo-save-sentence-button),.tome-backlog header button,.tome-log-actions button):active{background:var(--mgc-tint-2)!important}
 /* ruby-row chips: a segmented row, the chosen count is solid crimson */
 & .megulit-ruby-row-chip{border:1px solid var(--mgc-line)!important;border-radius:var(--mgc-r)!important;background:transparent!important;color:var(--mgc-ink-2)!important;font:500 12px/1 var(--mgc-mono)!important;box-shadow:none!important}
 & .megulit-ruby-row-chip:hover{background:var(--mgc-tint)!important;color:var(--mgc-ink)!important}
 & .megulit-ruby-row-chip.is-on{background:var(--mgc-red)!important;border-color:var(--mgc-red)!important;color:#fff!important}

 /* ---------- switches (every menu checkbox is drawn as a switch): rounded rail, diamond knob ---------- */
 & .tomoyo-cn-dialog input[type=checkbox]{-webkit-appearance:none!important;appearance:none!important;width:42px!important;height:22px!important;border-radius:11px!important;background:color-mix(in srgb,var(--mgc-ink) 14%,transparent)!important;border:1px solid color-mix(in srgb,var(--mgc-ink) 30%,transparent)!important;box-shadow:none!important;transition:background-color var(--mgc-t),border-color var(--mgc-t)!important}
 & .tomoyo-cn-dialog input[type=checkbox]::after,& .tomoyo-cn-dialog input[type=checkbox]::before{content:none!important}
 & .tomoyo-cn-dialog input[type=checkbox]::after{content:""!important;position:absolute!important;top:4px!important;left:5px!important;width:12px!important;height:12px!important;border-radius:0!important;transform:rotate(45deg)!important;background:var(--mgc-ink-2)!important;box-shadow:none!important;transition:transform var(--mgc-t) var(--mgc-ease),background-color var(--mgc-t)!important;display:block!important}
 & .tomoyo-cn-dialog input[type=checkbox]:hover:not(:disabled){border-color:var(--mgc-ink)!important}
 & .tomoyo-cn-dialog input[type=checkbox]:checked{background:var(--mgc-red)!important;border-color:var(--mgc-red)!important}
 & .tomoyo-cn-dialog input[type=checkbox]:checked::after{transform:translateX(19px) rotate(45deg)!important;background:#fff!important}
 & .tomoyo-cn-dialog input[type=checkbox]:disabled{border-style:dashed!important;opacity:.5!important}

 /* ---------- fields ---------- */
 & :is(.tomoyo-cn-dialog,.tome-backlog) :is(input:not([type=range]):not([type=checkbox]):not([type=color]):not([type=radio]),select,textarea){border:1px solid var(--mgc-line)!important;border-radius:var(--mgc-r)!important;background-color:color-mix(in srgb,var(--mgc-well) 70%,transparent)!important;color:var(--mgc-ink)!important;box-shadow:none!important;font-family:var(--mgc-ui)!important;transition:border-color var(--mgc-t),background-color var(--mgc-t)!important}
 & :is(.tomoyo-cn-dialog,.tome-backlog) :is(input:not([type=range]):not([type=checkbox]):not([type=color]):not([type=radio]),select,textarea):hover:not(:disabled){border-color:color-mix(in srgb,var(--mgc-ink) 40%,transparent)!important}
 & :is(.tomoyo-cn-dialog,.tome-backlog) :is(input:not([type=range]):not([type=checkbox]):not([type=color]):not([type=radio]),select,textarea):focus{border-color:var(--mgc-ink)!important}
 & :is(.tomoyo-cn-dialog,.tome-backlog) :is(input,select,textarea)::placeholder{color:var(--mgc-ink-3)!important}
 & .tome-log-search{border-radius:var(--mgc-r)!important}

 /* ---------- sliders: 2px rail, diamond thumb ---------- */
 & .tomoyo-cn-dialog input[type=range]{accent-color:var(--mgc-red)!important}
 & .tomoyo-cn-dialog input[type=range]::-webkit-slider-thumb{width:14px!important;height:14px!important;border-radius:0!important;transform:rotate(45deg)!important;background:var(--mgc-ink)!important;border:1px solid var(--mgc-gold)!important;box-shadow:none!important}
 & .tomoyo-cn-dialog input[type=range]:hover::-webkit-slider-thumb{background:#fff!important;border-color:var(--mgc-red)!important}
 & .tomoyo-cn-dialog input[type=range]:active::-webkit-slider-thumb{background:var(--mgc-red)!important;border-color:#fff!important}

 /* ---------- marks ---------- */
 & :is(.tomoyo-menu-header,.tomoyo-cn-dialog,.tome-backlog) kbd{border:1px solid color-mix(in srgb,var(--mgc-ink) 35%,transparent)!important;border-bottom-width:2px!important;border-radius:var(--mgc-r)!important;background:transparent!important;color:var(--mgc-ink)!important;font:500 11px/1 var(--mgc-mono)!important;letter-spacing:.06em!important;box-shadow:none!important}
 & .tomoyo-download-track{height:4px!important;border-radius:0!important;background:var(--mgc-line)!important}
 & .tomoyo-download-track>*{border-radius:0!important;background:var(--mgc-red)!important}

 /* ---------- word card actions: compact plates, a whisper on hover, the fill only when pressed ---------- */
 & .tomoyo-selection-card footer button,& .tomoyo-selection-card :is(.mg-ai-btn,.tomoyo-save-sentence-button){border:1px solid var(--mgc-line)!important;border-radius:var(--mgc-r)!important;background:transparent!important;color:var(--mgc-ink-2)!important;box-shadow:none!important;transform:none!important;font-family:var(--mgc-ui)!important;transition:background-color var(--mgc-t),color var(--mgc-t),border-color var(--mgc-t)!important}
 & .tomoyo-selection-card footer button:hover,& .tomoyo-selection-card :is(.mg-ai-btn,.tomoyo-save-sentence-button):hover{background:var(--mgc-tint)!important;color:var(--mgc-ink)!important;border-color:color-mix(in srgb,var(--mgc-ink) 50%,transparent)!important}
 & .tomoyo-selection-card footer button:active,& .tomoyo-selection-card :is(.mg-ai-btn,.tomoyo-save-sentence-button):active{background:var(--mgc-tint-2)!important}
 & .tomoyo-selection-card :is(.mg-ai-btn,.tomoyo-save-sentence-button){display:inline-flex!important;flex-direction:row!important;align-items:center!important;justify-content:center!important;gap:6px!important;height:32px!important;min-height:32px!important;max-height:32px!important;width:auto!important;min-width:0!important;padding:0 12px!important;font:500 12.5px/1 var(--mgc-ui)!important;letter-spacing:.02em!important;white-space:nowrap!important}
 & .tomoyo-selection-card .mg-ai-btn svg{width:15px!important;height:15px!important;flex:none!important;margin:0!important;color:inherit!important;fill:currentColor!important;stroke:currentColor!important;stroke-width:1.6!important;stroke-linecap:round!important;stroke-linejoin:round!important}
 & .tomoyo-selection-card .mg-ai-btn[aria-pressed=true]{background:var(--mgc-red)!important;border-color:var(--mgc-red)!important;color:#fff!important}
 & .tomoyo-selection-card .tomoyo-anki-button{position:relative!important;display:inline-flex!important;align-items:center!important;gap:7px!important;height:32px!important;min-height:32px!important;padding:0 18px 0 12px!important;border:0!important;border-radius:var(--mgc-r) 0 var(--mgc-r) var(--mgc-r)!important;background:var(--mgc-red)!important;color:#fff!important;font:600 13px/1 var(--mgc-ui)!important;letter-spacing:.03em!important;box-shadow:none!important;outline:none!important;overflow:hidden!important;transform:none!important;filter:none!important;opacity:1!important;cursor:pointer!important;clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,0 100%)!important;transition:background-color var(--mgc-t),color var(--mgc-t),box-shadow var(--mgc-t)!important}
  /* 切角 (user pick 2026-11-13): a flash-card corner folded back in deeper red */
 & .tomoyo-selection-card .tomoyo-anki-button::after{content:''!important;position:absolute!important;top:0!important;right:0!important;width:9px!important;height:9px!important;background:linear-gradient(225deg,transparent 50%,var(--mgc-red-lo) 50%)!important;pointer-events:none!important}
 & .tomoyo-selection-card .tomoyo-anki-button svg{width:14px!important;height:14px!important;flex:none!important;fill:none!important;stroke:currentColor!important;stroke-width:2.6!important;stroke-linecap:round!important;stroke-linejoin:round!important;animation:none!important}
 & .tomoyo-selection-card .tomoyo-anki-button:focus-visible{box-shadow:inset 0 0 0 2px var(--mgc-focus)!important}
 & .tomoyo-selection-card .tomoyo-anki-button:hover:not(:disabled){background:var(--mgc-red-hi)!important}
 & .tomoyo-selection-card .tomoyo-anki-button:active:not(:disabled){background:var(--mgc-red-lo)!important}
 & .tomoyo-selection-card .tomoyo-anki-button:active:not(:disabled)::after{background:linear-gradient(225deg,transparent 50%,var(--mgc-red-deep) 50%)!important}
 & .tomoyo-selection-card .tomoyo-anki-button:disabled:not([data-state]){opacity:.55!important;cursor:default!important}
  /* syncing: deeper red, a short white line sweeps along the bottom edge */
 & .tomoyo-selection-card .tomoyo-anki-button[data-state=busy]{background:var(--mgc-red-lo)!important;color:rgba(255,255,255,.8)!important;cursor:progress!important}
 & .tomoyo-selection-card .tomoyo-anki-button[data-state=busy]::after{background:linear-gradient(225deg,transparent 50%,var(--mgc-red-deep) 50%)!important}
 & .tomoyo-selection-card .tomoyo-anki-button[data-state=busy]::before{content:''!important;position:absolute!important;left:0!important;bottom:0!important;width:40%!important;height:2px!important;background:rgba(255,255,255,.75)!important;animation:megulit-anki-sweep 1.1s cubic-bezier(.45,0,.55,1) infinite!important;pointer-events:none!important}
  /* added: neutral frame, red check; the cut corner is closed by a 1px diagonal so it reads as cut, not broken */
 & .tomoyo-selection-card .tomoyo-anki-button[data-state=done]{background:transparent!important;color:var(--mgc-ink-2)!important;box-shadow:inset 0 0 0 1px var(--mgc-line)!important;cursor:default!important}
 & .tomoyo-selection-card .tomoyo-anki-button[data-state=done] svg{color:var(--mgc-red-ink)!important}
 & .tomoyo-selection-card .tomoyo-anki-button[data-state=done]::after{background:linear-gradient(225deg,transparent calc(50% - .7px),var(--mgc-line) calc(50% - .7px) calc(50% + .7px),transparent calc(50% + .7px))!important}
 & .tomoyo-selection-card .tomoyo-speak-button{border-radius:var(--mgc-r)!important;border:1px solid var(--mgc-line)!important;background:transparent!important;box-shadow:none!important;transform:none!important}
 & .tomoyo-selection-card .tomoyo-word-facts>span{border-radius:var(--mgc-r)!important;border-color:var(--mgc-line)!important;color:var(--mgc-ink-2)!important;font-weight:600}
 & .tomoyo-selection-card .tomoyo-word-facts>.tomoyo-word-jlpt{border-color:color-mix(in srgb,var(--mgc-red) 55%,transparent)!important;color:var(--mgc-ink)!important;font-weight:800}
 & .tomoyo-selection-card .tomoyo-speak-button:hover{background:var(--mgc-tint)!important;border-color:color-mix(in srgb,var(--mgc-ink) 50%,transparent)!important}
 & .tomoyo-selection-card footer button:is(.active,.on,.is-on,[aria-pressed=true]){background:var(--mgc-red)!important;border-color:var(--mgc-red)!important;color:#fff!important}
}
@keyframes megulit-anki-sweep{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
@media (prefers-reduced-motion:reduce){${R} body :is(.tomoyo-cn-dialog,.tomoyo-selection-card,.tome-backlog) *{transition:none!important}${R} body .tomoyo-selection-card .tomoyo-anki-button[data-state=busy]::before{animation:none!important;width:100%!important;opacity:.5}}
`;
 const style=document.createElement('style');style.id='megulit-controls-b';style.textContent=css;document.head.appendChild(style);
 /* The reader's appearance is applied as --theme-* on <html> (bootstrap.js). Mirror its light / dark choice onto the
    shared control tokens: light when the theme background is light. */
 const root=document.documentElement;
 const sync=()=>{const bg=getComputedStyle(root).getPropertyValue('--theme-background').trim();const m=bg.match(/^#([0-9a-f]{6})$/i);let light=false;
  if(m){const n=parseInt(m[1],16);const l=(0.2126*((n>>16)&255)+0.7152*((n>>8)&255)+0.0722*(n&255))/255;light=l>0.6;}
  if(light)root.dataset.theme='light';else if(root.dataset.theme==='light')delete root.dataset.theme;};
 sync();new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['style','class']});
})();
