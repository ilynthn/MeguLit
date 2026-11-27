// SPDX-License-Identifier: GPL-3.0-or-later
// Visual layer for MeguLit: the Alt+T menu, word cards and every slider in
// Tomoyo itself. Colours come from Tomoyo's own theme variables, so all themes
// (dark and light) keep working; this file only restyles, it changes no behaviour.
(function installPolish(){
 'use strict';
 if(!document.documentElement){document.addEventListener('DOMContentLoaded',installPolish,{once:true});return;}
 if(window.__tomoyoPolish)return;window.__tomoyoPolish=true;
 const css=String.raw`
 :root{--mg-accent:var(--theme-primary,#5b8dd6);--mg-accent-2:var(--theme-accent,var(--mg-accent));--mg-text:var(--theme-text,#eef2fa);--mg-sub:var(--theme-textSecondary,#9aa8c0);--mg-line:color-mix(in srgb,var(--theme-border,#2c4468) 80%,transparent);--mg-surface:var(--theme-surface,#1c2f4f);--mg-base:var(--theme-background,#12213a);--mg-tint:color-mix(in srgb,var(--mg-accent) 14%,transparent);--mg-ease:cubic-bezier(.2,.7,.2,1)}
 ::selection{background:color-mix(in srgb,var(--mg-accent) 38%,transparent)}

 /* ── Sliders, everywhere (Tomoyo settings included) ───────────────────── */
 /* Sliders: a slim 4px bar without decorative tick marks, and a small upright 6x16 block as the handle.
    The fill ends exactly under the handle's centre (--fill-r is the 0..1 ratio, the handle travels 100% - 6px). */
 input[type=range]{-webkit-appearance:none!important;appearance:none!important;height:18px!important;background:transparent!important;border:0!important;padding:0!important;margin:6px 0 0!important;cursor:pointer;accent-color:var(--mg-accent);--fill:50%;--fill-r:.5;touch-action:none}
 input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:
   linear-gradient(90deg,color-mix(in srgb,var(--mg-accent) 88%,#000 12%),var(--mg-accent-2)) 0/calc(3px + (100% - 6px) * var(--fill-r)) 100% no-repeat,
   color-mix(in srgb,var(--mg-text) 10%,transparent);transition:background-color .15s}
 input[type=range]:hover::-webkit-slider-runnable-track{background-color:color-mix(in srgb,var(--mg-text) 15%,transparent)}
 html body input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:6px!important;height:16px!important;margin-top:-6px;border-radius:2px!important;border:0;
   background:linear-gradient(180deg,var(--mg-accent) 0 3px,transparent 3px) top/100% 3px no-repeat,linear-gradient(180deg,#fff,#dfe4ec);background-size:100% 0,100% 100%;
   box-shadow:0 0 0 1px color-mix(in srgb,#000 28%,transparent),0 1px 3px rgba(0,0,0,.35);transition:height .14s var(--mg-ease),margin-top .14s var(--mg-ease),box-shadow .14s var(--mg-ease),background-size .14s var(--mg-ease)}
 html body input[type=range]:hover::-webkit-slider-thumb{box-shadow:0 0 0 1px color-mix(in srgb,#000 28%,transparent),0 1px 3px rgba(0,0,0,.35),0 0 0 4px color-mix(in srgb,var(--mg-accent) 18%,transparent)}
 html body input[type=range]:active::-webkit-slider-thumb{height:20px!important;margin-top:-8px;background-size:100% 3px,100% 100%;box-shadow:0 0 0 1px color-mix(in srgb,var(--mg-accent) 70%,#000 30%),0 2px 6px rgba(0,0,0,.4),0 0 0 5px color-mix(in srgb,var(--mg-accent) 24%,transparent)}
 input[type=range]:focus-visible{outline:none}
 html body input[type=range]:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 1px color-mix(in srgb,#000 28%,transparent),0 0 0 4px color-mix(in srgb,var(--mg-accent) 40%,transparent)}
 input[type=range]:disabled{opacity:.4;cursor:default}
 html body input[type=range]:disabled::-webkit-slider-thumb{background:linear-gradient(180deg,#ddd,#bbb)}
 .mg-bubble{position:fixed;z-index:2147483647;pointer-events:none;transform:translate(-50%,-100%) translateY(4px) scale(.9);opacity:0;padding:3px 9px;border-radius:8px;background:color-mix(in srgb,var(--mg-base) 92%,#000 8%);border:1px solid color-mix(in srgb,var(--mg-accent) 45%,transparent);color:var(--mg-text);font:600 12px/1.5 Consolas,"Cascadia Mono",monospace;box-shadow:0 6px 18px rgba(0,0,0,.35);transition:opacity .12s,transform .16s var(--mg-ease);white-space:nowrap}
 .mg-bubble::after{content:"";position:absolute;left:50%;bottom:-5px;width:8px;height:8px;margin-left:-4px;transform:rotate(45deg);background:inherit;border-right:inherit;border-bottom:inherit}
 .mg-bubble.mg-on{opacity:1;transform:translate(-50%,-100%) translateY(-6px) scale(1)}

 /* ── Alt+T menu ───────────────────────────────────────────────────────── */
 .tomoyo-cn-dialog{--menu-accent:var(--mg-accent)!important;width:580px!important;border-radius:18px!important;border:1px solid color-mix(in srgb,var(--mg-text) 9%,transparent)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--mg-surface) 100%,#fff 3%),var(--mg-surface) 120px)!important;box-shadow:0 24px 70px rgba(0,0,0,.45),0 2px 0 color-mix(in srgb,#fff 5%,transparent) inset!important;font-family:"Microsoft YaHei UI","Yu Gothic UI","Microsoft YaHei",sans-serif!important;}
 @keyframes mg-in{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}
 .tomoyo-cn-dialog form{grid-template-columns:112px minmax(0,1fr)!important}
 .tomoyo-menu-header{display:flex;flex-direction:column;gap:6px;padding:20px 24px 14px!important;border-bottom:1px solid var(--mg-line)}
 .tomoyo-menu-header h3{display:flex;align-items:center;gap:10px;font-size:17px!important;font-weight:700;letter-spacing:.02em}
 .tomoyo-menu-header h3::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--mg-accent);box-shadow:0 0 0 4px var(--mg-tint)}
 .tomoyo-menu-header small{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center}
 .tomoyo-menu-header kbd{font:600 10.5px/1 Consolas,"Cascadia Mono",monospace;padding:3px 6px;border-radius:5px;border:1px solid var(--mg-line);border-bottom-width:2px;color:var(--mg-text);background:color-mix(in srgb,var(--mg-base) 60%,transparent);margin-right:5px}
 .tomoyo-menu-tabs{width:auto!important;gap:4px!important;padding:14px 10px!important;border-right:1px solid var(--mg-line)!important}
 .tomoyo-menu-tabs button{position:relative;flex:0 0 auto!important;display:flex!important;flex-direction:column;align-items:center;gap:4px;padding:9px 4px!important;border-radius:12px!important;font-size:12.5px!important;color:var(--mg-sub)!important;transition:background .15s,color .15s}
 .tomoyo-menu-tabs button svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;opacity:.85}
 .tomoyo-menu-tabs button{background:transparent!important;border:0!important}
 .tomoyo-menu-tabs button:hover{background:color-mix(in srgb,var(--mg-text) 5%,transparent)!important;color:var(--mg-text)!important}
 .tomoyo-menu-tabs button[aria-selected=true]{background:var(--mg-tint)!important;color:var(--tome-picture-accent,var(--mg-accent))!important;font-weight:700}
 .tomoyo-menu-tabs button[aria-selected=true]::before{content:"";position:absolute;left:-10px;top:22%;bottom:22%;width:3px;border-radius:0 3px 3px 0;background:var(--mg-accent)}
 .tomoyo-menu-content{padding:8px 24px 22px!important;scroll-behavior:smooth}
 .tomoyo-cn-dialog label{font-size:12.5px!important;color:var(--mg-text)!important;letter-spacing:.01em}
 .tomoyo-cn-dialog .tomoyo-slider-value{float:right;min-width:30px;text-align:center;padding:0 6px;border-radius:3px;background:var(--mg-tint);color:var(--tome-picture-accent,var(--mg-accent))!important;font:600 11.5px/1.6 Consolas,"Cascadia Mono",monospace!important}
 .tomoyo-cn-dialog input:not([type=range]):not([type=checkbox]):not([type=color]),.tomoyo-cn-dialog select{min-height:36px;border-radius:10px!important;border:1px solid var(--mg-line)!important;background-color:color-mix(in srgb,var(--mg-base) 75%,transparent)!important;transition:border-color .15s,box-shadow .15s}
 .tomoyo-cn-dialog input:not([type=range]):not([type=checkbox]):focus,.tomoyo-cn-dialog select:focus{outline:none;border-color:var(--mg-accent)!important;box-shadow:0 0 0 3px var(--mg-tint)}
 .tomoyo-cn-dialog select{-webkit-appearance:none;appearance:none;padding-right:32px!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")!important;background-repeat:no-repeat!important;background-position:right 11px center!important}
 .tomoyo-cn-dialog input[type=color]{-webkit-appearance:none;appearance:none;height:36px!important;padding:4px!important;border-radius:10px!important;border:1px solid var(--mg-line)!important;background:transparent!important;cursor:pointer}
 .tomoyo-cn-dialog input[type=color]::-webkit-color-swatch-wrapper{padding:0}.tomoyo-cn-dialog input[type=color]::-webkit-color-swatch{border:0;border-radius:7px}
 /* Checkboxes become switches */
 .tomoyo-cn-dialog input[type=checkbox]{-webkit-appearance:none;appearance:none;position:relative;flex:none;display:inline-block!important;width:32px!important;height:18px!important;margin:0 9px 0 0!important;padding:0!important;vertical-align:-4px;border-radius:99px!important;border:0!important;background:color-mix(in srgb,var(--mg-text) 18%,transparent)!important;cursor:pointer;transition:background .18s var(--mg-ease)}
 .tomoyo-cn-dialog input[type=checkbox]::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .18s var(--mg-ease)}
 .tomoyo-cn-dialog input[type=checkbox]:checked{background:var(--mg-accent)!important}
 .tomoyo-cn-dialog input[type=checkbox]:checked::after{transform:translateX(14px)}
 .tomoyo-cn-dialog input[type=checkbox]:focus-visible{outline:none;box-shadow:0 0 0 3px var(--mg-tint)}
 .tomoyo-cn-dialog input[type=checkbox]:disabled{opacity:.45;cursor:default}
 /* Collapsible groups read as cards */
 .tomoyo-cn-dialog details{margin-top:14px!important;padding:0 14px 14px!important;border:1px solid var(--mg-line)!important;border-radius:14px;background:color-mix(in srgb,var(--mg-text) 2.5%,transparent);overflow:hidden}
 .tomoyo-cn-dialog details:not([open]){padding-bottom:0!important}
 .tomoyo-cn-dialog details>summary{margin:0 -14px;list-style:none;display:flex;align-items:center;gap:8px;padding:12px 14px;cursor:pointer;font-size:13px!important;font-weight:650;user-select:none;transition:background .15s}
 .tomoyo-cn-dialog details>summary::-webkit-details-marker{display:none}
 .tomoyo-cn-dialog details>summary::after{content:"";margin-left:auto;width:7px;height:7px;border-right:1.6px solid var(--mg-sub);border-bottom:1.6px solid var(--mg-sub);transform:rotate(45deg) translateY(-2px);transition:transform .2s var(--mg-ease)}
 .tomoyo-cn-dialog details[open]>summary::after{transform:rotate(225deg) translateY(-1px)}
 .tomoyo-cn-dialog details>summary:hover{background:color-mix(in srgb,var(--mg-text) 4%,transparent)}
 .tomoyo-cn-dialog details[open]>summary{border-bottom:1px solid var(--mg-line)}
 .tomoyo-cn-dialog details details{background:transparent}
 .tomoyo-ruby-position{padding-top:2px}
 .tomoyo-ruby-hint{margin-top:10px!important}
 .tomoyo-cn-dialog .tomoyo-cn-grid{gap:4px 16px!important}
 .tomoyo-cn-dialog button:not(.tomoyo-menu-tabs button){border-radius:10px;transition:background .15s,border-color .15s,color .15s}
 .tomoyo-cn-dialog section button,.tomoyo-cn-dialog fieldset button,.tomoyo-v4-settings button{padding:7px 14px;margin:10px 8px 0 0;border:1px solid var(--mg-line);background:transparent;color:var(--mg-text);cursor:pointer}
 .tomoyo-cn-dialog section button:hover,.tomoyo-cn-dialog fieldset button:hover,.tomoyo-v4-settings button:hover{border-color:var(--mg-accent);color:var(--tome-picture-accent,var(--mg-accent))}
  /* Filled accent buttons (save) keep white text on hover/press: red text on the red fill made the label vanish. */
  .tomoyo-v4-settings button.tome-voice-save:is(:hover,:active,:focus-visible),.tomoyo-cn-dialog button.tome-voice-save:is(:hover,:active,:focus-visible){color:var(--tome-picture-on-accent,#fff)!important;border-color:transparent!important;filter:brightness(1.08)}
 .tomoyo-cn-dialog footer{padding:14px 22px!important;gap:10px!important;background:color-mix(in srgb,var(--mg-surface) 92%,#000 8%)!important}
 .tomoyo-cn-dialog footer button{min-width:84px;border-radius:10px!important;font-weight:600}
 .tomoyo-cn-dialog footer button:hover{border-color:color-mix(in srgb,var(--mg-text) 30%,transparent)!important}
 .tomoyo-cn-dialog footer button[type=submit]{background:linear-gradient(180deg,color-mix(in srgb,var(--mg-accent) 88%,#fff 12%),var(--mg-accent))!important;box-shadow:0 4px 14px color-mix(in srgb,var(--mg-accent) 35%,transparent)}
 .tomoyo-cn-dialog footer button[type=submit]:hover{filter:brightness(1.07)}
 .tomoyo-cn-dialog h4{margin:22px 0 4px;font-size:11.5px;font-weight:700;letter-spacing:.12em;color:var(--mg-sub)}
 .tomoyo-v4-settings{border-top:1px solid var(--mg-line)!important}
 .tomoyo-cn-dialog label:has(>input[type=checkbox]){display:flex!important;align-items:center;gap:10px}
 .tomoyo-cn-dialog label:has(>input[type=checkbox])>input{margin:0!important}
 .tomoyo-cn-dialog [data-gal-hook-select]{font-size:12.5px!important}
 .tomoyo-cn-dialog .tomoyo-hook-state,.tomoyo-cn-dialog [data-gal-wait-state]{margin-top:10px;padding:9px 12px;border-radius:10px;font-size:12px!important;line-height:1.6;color:var(--mg-text)!important;background:color-mix(in srgb,var(--mg-text) 4%,transparent);border-left:3px solid var(--mg-accent)}

 /* ── Word cards ───────────────────────────────────────────────────────── */
 .mg-ai-lines{display:flex;flex-direction:column;gap:7px;white-space:normal}
 .mg-ai-row{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:baseline;line-height:1.65;font-size:13.5px}
 .mg-ai-tag{font-size:11px;font-weight:700;padding:1px 7px;border-radius:6px;color:var(--tome-picture-accent,var(--mg-accent));background:var(--mg-tint);white-space:nowrap}
 .tomoyo-selection-card{border-radius:16px!important;border:1px solid color-mix(in srgb,var(--mg-text) 9%,transparent)!important;box-shadow:0 18px 50px rgba(0,0,0,.42)!important;animation:mg-in .16s var(--mg-ease)}
 .tomoyo-selection-card footer button,.tomoyo-v4-actions button{border-radius:10px!important;transition:border-color .15s,color .15s,background .15s}
 .tomoyo-selection-card footer button:hover,.tomoyo-anki-button:hover{border-color:var(--mg-accent)!important;color:var(--tome-picture-accent,var(--mg-accent))!important}
 .tomoyo-speak-button{border-radius:50%!important;background:var(--mg-tint)!important;border-color:transparent!important;color:var(--tome-picture-accent,var(--mg-accent))}
 .tomoyo-speak-button:hover:not(:disabled){background:color-mix(in srgb,var(--mg-accent) 24%,transparent)!important}
 .tomoyo-card-bar{gap:7px!important}
 .tomoyo-card-bar .mg-ai-btn{display:inline-flex!important;align-items:center;gap:6px;padding:6px 12px 6px 10px!important;border-radius:999px!important;border:1px solid color-mix(in srgb,var(--mg-text) 16%,transparent)!important;background:color-mix(in srgb,var(--mg-text) 6%,transparent)!important;color:var(--mg-text)!important;font-weight:600!important;font-size:12.5px!important;line-height:1.2;cursor:pointer;box-shadow:0 1px 0 color-mix(in srgb,#fff 6%,transparent) inset,0 1px 2px rgba(0,0,0,.25);transition:background .15s,border-color .15s,color .15s,transform .08s}
 .tomoyo-card-bar .mg-ai-btn:hover{border-color:color-mix(in srgb,var(--mg-accent) 70%,transparent)!important;background:var(--mg-tint)!important;color:var(--tome-picture-accent,var(--mg-accent))!important}
 .tomoyo-card-bar .mg-ai-btn:active{transform:translateY(1px)}
 .tomoyo-card-bar .mg-ai-btn[aria-pressed=true]{border-color:var(--mg-accent)!important;background:var(--mg-tint)!important;color:var(--tome-picture-accent,var(--mg-accent))!important}
 .tomoyo-card-bar .mg-ai-btn svg,.tomoyo-anki-button svg{width:14px;height:14px;flex:none;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
 .tomoyo-card-bar .mg-ai-btn[data-loading] svg,.tomoyo-anki-button:disabled svg{animation:mg-spin .9s linear infinite}
 @keyframes mg-spin{to{transform:rotate(360deg)}}
 .tomoyo-selection-card .tomoyo-anki-button{display:inline-flex!important;align-items:center;gap:5px;padding:6px 14px 6px 11px!important;border-radius:999px!important;border:1px solid var(--mg-accent)!important;background:var(--mg-accent)!important;color:var(--tome-picture-on-accent,#fff)!important;font-weight:700!important;font-size:12.5px!important;cursor:pointer;box-shadow:0 2px 8px color-mix(in srgb,var(--mg-accent) 35%,transparent);transition:filter .15s,transform .08s}
 .tomoyo-selection-card .tomoyo-anki-button:hover{filter:brightness(1.1);color:var(--tome-picture-on-accent,#fff)!important}
 .tomoyo-selection-card .tomoyo-anki-button:active{transform:translateY(1px)}
 .tomoyo-selection-card .tomoyo-anki-button:disabled{opacity:.7;cursor:progress}
 .tomoyo-selection-card .tomoyo-ai-result{margin:12px 16px 14px!important;padding:12px 14px!important;border:1px solid color-mix(in srgb,var(--mg-accent) 26%,transparent)!important;border-left:1px solid color-mix(in srgb,var(--mg-accent) 26%,transparent)!important;border-radius:12px!important;background:color-mix(in srgb,var(--mg-accent) 6%,transparent)!important;white-space:normal!important}
 .tomoyo-selection-card .tomoyo-ai-result>strong{display:flex!important;align-items:center;gap:6px;font-size:11.5px!important;letter-spacing:.04em;margin:0 0 10px!important;color:var(--tome-picture-accent,var(--mg-accent))!important}
 .tomoyo-selection-card .tomoyo-ai-result>strong::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 6px currentColor}
 .mg-ai-row{grid-template-columns:44px 1fr!important}.mg-ai-tag{text-align:center}
 .mg-sum{display:flex;flex-direction:column;gap:6px}
 .mg-sum-row{display:grid;grid-template-columns:22px 1fr;gap:10px;align-items:start;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--mg-text) 4%,transparent);border:1px solid transparent}
 .mg-sum-row[data-match]{border-color:color-mix(in srgb,var(--mg-accent) 55%,transparent);background:var(--mg-tint)}
 .mg-sum-num{font-style:normal;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11.5px;font-weight:700;color:var(--mg-sub);background:color-mix(in srgb,var(--mg-text) 9%,transparent)}
 .mg-sum-row[data-match] .mg-sum-num{color:var(--tome-picture-on-accent,#fff);background:var(--mg-accent)}
 .mg-sum-row b{display:block;font-size:13.5px;line-height:1.5;color:var(--mg-text)}
 .mg-sum-row span{display:block;font-size:12.5px;line-height:1.6;color:var(--mg-sub)}
 .mg-sum-note{margin-top:4px;padding:8px 10px;border-radius:10px;font-size:12.5px;line-height:1.65;color:var(--mg-text);background:color-mix(in srgb,var(--mg-accent) 10%,transparent)}
 .mg-sum-note em{font-style:normal;font-weight:700;color:var(--tome-picture-accent,var(--mg-accent));margin-right:6px}
 .mg-sum-extra{font-size:12.5px;line-height:1.65;color:var(--mg-sub)}
 .tomoyo-speak-button svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
 `;
 const style=document.createElement('style');style.id='tomoyo-megumin-polish';style.textContent=css;
 // Last in <head> so it wins over earlier injected styles.
 const attach=()=>{(document.head||document.documentElement).appendChild(style);};attach();
 new MutationObserver(records=>{if(records.some(r=>r.target===document.head)&&style.nextElementSibling)attach();}).observe(document.documentElement,{childList:true,subtree:true});

 // The filled part of a slider needs its value as a percentage.
 function fill(input){const min=Number(input.min||0),max=Number(input.max||100),v=Number(input.value);const pct=max>min?Math.max(0,Math.min(100,(v-min)/(max-min)*100)):0;const text=pct.toFixed(2)+'%';if(input.style.getPropertyValue('--fill')!==text){input.style.setProperty('--fill',text);input.style.setProperty('--fill-r',(pct/100).toFixed(4));}}
 document.addEventListener('input',e=>{if(e.target?.type==='range')fill(e.target);},true);
 document.addEventListener('change',e=>{if(e.target?.type==='range')fill(e.target);},true);
 // Values restored by code do not fire input events: refresh on every value assignment and when sliders are added,
 // so a freshly opened menu never shows the 50% default fill for a moment. The interval stays as a fallback.
 {const desc=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');if(desc?.set&&!HTMLInputElement.prototype.__mgFillPatched){Object.defineProperty(HTMLInputElement.prototype,'value',{...desc,set(v){desc.set.call(this,v);if(this.type==='range')fill(this);}});HTMLInputElement.prototype.__mgFillPatched=true;}}
 new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1){if(n.matches?.('input[type=range]'))fill(n);for(const i of n.querySelectorAll?.('input[type=range]')||[])fill(i);}}).observe(document.documentElement,{childList:true,subtree:true});
 (window.__megulitReaderIntervals?.set||setInterval)(()=>{for(const r of document.querySelectorAll('input[type=range]'))fill(r);},400);
 // While dragging, a small bubble follows the thumb with the live value.
 const bubble=document.createElement('div');bubble.className='mg-bubble';let dragging=null;
 function format(input){const out=input.parentElement?.querySelector?.('.tomoyo-slider-value');const text=out?.textContent?.trim();if(text)return text;const v=Number(input.value),step=Number(input.step)||1;return step<1?v.toFixed(Math.min(2,String(step).split('.')[1]?.length||2)):String(v);}
 function place(input){const host=input.closest('dialog[open]')||document.body;if(host&&bubble.parentNode!==host)host.appendChild(bubble);const r=input.getBoundingClientRect(),min=Number(input.min||0),max=Number(input.max||100),pct=max>min?(Number(input.value)-min)/(max-min):0,thumb=6;bubble.style.left=(r.left+thumb/2+pct*(r.width-thumb))+'px';bubble.style.top=(r.top+r.height/2-12)+'px';bubble.textContent=format(input);}
 document.addEventListener('pointerdown',e=>{if(e.target?.type!=='range'||e.target.disabled)return;dragging=e.target;requestAnimationFrame(()=>{place(dragging);bubble.classList.add('mg-on');});},true);
 document.addEventListener('input',e=>{if(e.target===dragging)requestAnimationFrame(()=>dragging&&place(dragging));},true);
 const release=()=>{if(!dragging)return;dragging=null;bubble.classList.remove('mg-on');};
 document.addEventListener('pointerup',release,true);document.addEventListener('pointercancel',release,true);addEventListener('blur',release);

 const icons={calibrate:'<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="2"/>',translate:'<path d="M4 5h9M8.5 3v2M6 5c.6 3 2.6 5.6 5.5 7M11 5c-.7 3.5-3.2 6.5-6.5 8"/><path d="m12 21 4.5-10 4.5 10M13.6 17.5h5.8"/>',text:'<path d="M4 19 9 5l5 14M5.8 14h6.4"/><path d="M15.5 12.2a3 3 0 1 1 0 4.6M20 10v9"/>',layout:'<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 14h18M7 17h6"/>',mask:'<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/>',learn:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 7h8M8 11h5"/>',log:'<path d="M5 4h11l3 3v13H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4.5"/>',voice:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',hotkeys:'<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>',misc:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',about:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'};
 const aiIcons={explain:'<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',summary:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',anki:'<path d="M12 5v14M5 12h14"/>'};
 const speaker='<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>';
 function svg(paths){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+paths+'</svg>';}
 /* the key row under the menu title: the keys chosen in 热键 (web/hotkeys.js), written in the page language; repainted when either changes */
 function paintKeys(h){const H=window.MeguHotkeys;h.innerHTML=(H?H.hintRow(window.__tomeI18n?.get?.()||'zh'):'')+'<span>拖动滑块即时预览</span><span>在台词上拖选文字：查词、加 Anki 或收藏句子</span>';}
 const repaintKeys=()=>{for(const h of document.querySelectorAll('.tomoyo-menu-header small[data-mg-keys]'))paintKeys(h);};
 window.MeguHotkeys?.onChange(repaintKeys);addEventListener('tome-language-change',repaintKeys);
 function decorate(){
  for(const b of document.querySelectorAll('.tomoyo-menu-tabs button[data-menu-key]:not([data-mg-icon])')){const icon=icons[b.dataset.menuKey];if(!icon)continue;b.dataset.mgIcon='1';b.insertAdjacentHTML('afterbegin',svg(icon));}
  for(const h of document.querySelectorAll('.tomoyo-menu-header small:not([data-mg-keys])')){h.dataset.mgKeys='1';paintKeys(h);}
  for(const s of document.querySelectorAll('.tomoyo-speak-button:not([data-mg-icon])')){s.dataset.mgIcon='1';s.innerHTML=svg(speaker);}
  // Selection card: AI buttons become pills with icons and show which result is open / loading.
  for(const card of document.querySelectorAll('.tomoyo-selection-card')){
   const ai=card.querySelector('.tomoyo-ai-result');
   for(const btn of card.querySelectorAll('button')){
    const kind=btn.textContent.trim()==='上下文解释'?'explain':/归纳/.test(btn.textContent)?'summary':'';
    if(kind&&!btn.dataset.mgAi){btn.dataset.mgAi=kind;btn.classList.add('mg-ai-btn');btn.innerHTML=svg(aiIcons[kind])+'<span>'+(kind==='explain'?'上下文解释':'归纳义项')+'</span>';btn.setAttribute('aria-pressed','false');btn.addEventListener('click',()=>{card.dataset.mgAiKind=kind;},true);}
   }
   const anki=card.querySelector('.tomoyo-anki-button:not([data-mg-icon])');if(anki){anki.dataset.mgIcon='1';anki.innerHTML=svg(aiIcons.anki)+'<span>Anki</span>';anki.title=anki.title||'加入 Anki 牌组';}
   const open=ai&&!ai.hidden,loading=open&&!ai.querySelector('strong');
   for(const btn of card.querySelectorAll('[data-mg-ai]')){const on=open&&card.dataset.mgAiKind===btn.dataset.mgAi;if(btn.getAttribute('aria-pressed')!==String(on))btn.setAttribute('aria-pressed',String(on));if(on&&loading)btn.dataset.loading='';else delete btn.dataset.loading;}
  }
  // AI 归纳: "① 概括｜解释" lines become numbered rows; the "本句" line highlights the group this sentence uses.
  for(const box of document.querySelectorAll('.tomoyo-ai-result > div:not([data-mg-lines])')){const title=box.previousElementSibling?.textContent||'';if(!/归纳|summary/i.test(title))continue;
   const rows=(box.textContent||'').split(/\n+/).map(t=>t.trim()).filter(Boolean),item=/^([①-⑨]|[1-9][.、．)）])\s*(.+?)\s*[｜|]\s*(.+)$/,note=/^(本句|In this line)\s*[：:]\s*(.+)$/i;
   if(!rows.some(r=>item.test(r)))continue;box.dataset.mgLines='1';box.textContent='';box.classList.add('mg-sum');const nums='①②③④⑤⑥⑦⑧⑨';let match=0;const built=[];
   for(const r of rows){let m=item.exec(r);if(m){const n=nums.includes(m[1])?nums.indexOf(m[1])+1:parseInt(m[1]);const row=document.createElement('div');row.className='mg-sum-row';row.dataset.n=n;const num=document.createElement('i');num.className='mg-sum-num';num.textContent=n;const t=document.createElement('div'),b=document.createElement('b'),d=document.createElement('span');b.textContent=m[2];d.textContent=m[3];t.append(b,d);row.append(num,t);built.push(row);box.append(row);continue;}
    m=note.exec(r);if(m){const n=/[①-⑨]/.exec(m[2])?nums.indexOf(/[①-⑨]/.exec(m[2])[0])+1:parseInt((/第?\s*([1-9])\s*(类|項|项)?/.exec(m[2])||[])[1]);if(n)match=n;const div=document.createElement('div');div.className='mg-sum-note';const em=document.createElement('em');em.textContent=/^In/i.test(m[1])?'In this line':'本句';div.append(em,document.createTextNode(m[2].replace(/^[①-⑨][，,、—\-\s]*/,'')));box.append(div);continue;}
    const extra=document.createElement('div');extra.className='mg-sum-extra';extra.textContent=r;box.append(extra);}
   for(const row of built)if(Number(row.dataset.n)===match)row.dataset.match='';}
  // AI explanations come back as labelled lines (意思 / 语气 / 要点 / 注意); show each as its own tidy row.
  for(const box of document.querySelectorAll('.tomoyo-ai-result > div:not([data-mg-lines])')){box.dataset.mgLines='1';let text=box.textContent||'';if(!/\n/.test(text)&&/ \/ /.test(text))text=text.split(/ \/ /).join('\n');
   const rows=text.split(/\n+/).map(t=>t.trim()).filter(Boolean),label=/^(意思|语气|要点|注意|Meaning|Tone|Key point|Watch out)\s*[：:]\s*/;
   if(!rows.some(r=>label.test(r)))continue;box.textContent='';box.classList.add('mg-ai-lines');
   for(const r of rows){const m=label.exec(r),row=document.createElement('div');row.className='mg-ai-row';if(m){const tag=document.createElement('span');tag.className='mg-ai-tag';tag.textContent=m[1];row.append(tag,document.createTextNode(r.slice(m[0].length)));}else row.textContent=r;box.append(row);}}
 }
 new MutationObserver(decorate).observe(document.documentElement,{childList:true,subtree:true});decorate();

 // ── Drop-down lists ────────────────────────────────────────────────────────────────────────────────────────────
 // The native <select> pop-up is a grey Windows list that cannot be styled. Every single-choice <select> keeps its
 // value and events, but opens this list instead. "Name（style）" options show the part in brackets as a quiet suffix.
 {const sheet=document.createElement('style');sheet.textContent=String.raw`
  .mg-select-pop{position:fixed;z-index:2147483600;box-sizing:border-box;max-height:min(320px,calc(100vh - 16px));overflow:auto;overscroll-behavior:contain;padding:5px;border-radius:10px;border:1px solid color-mix(in srgb,var(--mg-text) 12%,transparent);background:color-mix(in srgb,var(--mg-surface) 55%,var(--mg-base) 45%);color:var(--mg-text);font:13px/1.45 "Microsoft YaHei UI","Yu Gothic UI",sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.38);transform-origin:50% 0;animation:mg-pop-in .14s var(--mg-ease) both;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--mg-text) 22%,transparent) transparent;-webkit-app-region:no-drag;pointer-events:auto}
  .mg-select-pop[data-up]{transform-origin:50% 100%;animation-name:mg-pop-up}
  body.tomoyo-ui-translation .mg-select-pop{box-shadow:none}
  @keyframes mg-pop-in{from{opacity:0;transform:translateY(-4px) scaleY(.97)}}
  @keyframes mg-pop-up{from{opacity:0;transform:translateY(4px) scaleY(.97)}}
  /* Long names (a work's file description) stay inside the menu: one line, ellipsis. */
  .tomoyo-cn-dialog~.mg-select-pop .mg-opt,.mg-select-pop .mg-opt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mg-select-pop .mg-opt{position:relative;display:flex;align-items:baseline;gap:6px;padding:7px 30px 7px 12px;border-radius:6px;white-space:nowrap;cursor:pointer;transition:background .1s}
  .mg-select-pop .mg-opt small{color:var(--mg-sub);font-size:11.5px}
  .mg-select-pop .mg-opt[data-active]{background:color-mix(in srgb,var(--mg-text) 8%,transparent)}
  .mg-select-pop .mg-opt[aria-selected=true]{color:var(--tome-picture-accent,var(--mg-accent));font-weight:650;background:var(--mg-tint)}
  .mg-select-pop .mg-opt[aria-selected=true]::before{content:"";position:absolute;left:3px;top:9px;bottom:9px;width:3px;border-radius:2px;background:var(--mg-accent)}
  .mg-select-pop .mg-opt[aria-selected=true]::after{content:"";position:absolute;right:11px;top:50%;width:9px;height:5px;margin-top:-4px;border:solid var(--mg-accent);border-width:0 0 2px 2px;transform:rotate(-45deg)}
  .mg-select-pop .mg-opt[aria-disabled=true]{opacity:.4;cursor:default}
  .mg-select-pop .mg-group{padding:8px 12px 3px;color:var(--mg-sub);font-size:11px;font-weight:650;letter-spacing:.04em}
  .mg-select-pop .mg-group:not(:first-child){margin-top:4px;border-top:1px solid color-mix(in srgb,var(--mg-text) 8%,transparent)}
  select[data-mg-open]{border-color:var(--mg-accent)!important;box-shadow:0 0 0 3px var(--mg-tint)!important}`;
  (document.head||document.documentElement).appendChild(sheet);
  let pop=null,owner=null,items=[],active=-1;
  const usable=s=>s instanceof HTMLSelectElement&&!s.multiple&&!(s.size>1)&&!s.disabled;
  function close(){if(!pop)return;pop.remove();pop=null;items=[];active=-1;if(owner){owner.removeAttribute('data-mg-open');owner=null;}}
  function mark(i){if(!items.length)return;active=Math.max(0,Math.min(items.length-1,i));items.forEach((n,k)=>n.toggleAttribute('data-active',k===active));const n=items[active];if(n.offsetTop<pop.scrollTop)pop.scrollTop=n.offsetTop-5;else if(n.offsetTop+n.offsetHeight>pop.scrollTop+pop.clientHeight)pop.scrollTop=n.offsetTop+n.offsetHeight-pop.clientHeight+5;}
  function pick(i){const s=owner,o=items[i]?.__option;if(!s||!o||o.disabled)return;close();if(s.value!==o.value){s.value=o.value;s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));}s.focus({preventScroll:true});}
  function row(o){const d=document.createElement('div');d.className='mg-opt';d.setAttribute('role','option');d.__option=o;const m=/^(.*?)\s*[（(]([^（()）]+)[)）]\s*$/.exec(o.textContent.trim());if(o.dataset.fontName){d.append(o.dataset.fontName);if(o.dataset.fontNote){const sub=document.createElement('small');sub.textContent=o.dataset.fontNote;d.append(sub);}}else if(m){d.append(m[1]);const sub=document.createElement('small');sub.textContent=m[2];d.append(sub);}else d.textContent=o.textContent;if(o.selected)d.setAttribute('aria-selected','true');if(o.disabled)d.setAttribute('aria-disabled','true');return d;}
  function open(s){close();owner=s;s.setAttribute('data-mg-open','');pop=document.createElement('div');pop.className='mg-select-pop';pop.setAttribute('role','listbox');
   for(const child of s.children){if(child.tagName==='OPTGROUP'){const g=document.createElement('div');g.className='mg-group';g.textContent=child.label;pop.append(g);for(const o of child.children)if(o.tagName==='OPTION'&&!o.hidden)pop.append(row(o));}else if(child.tagName==='OPTION'&&!child.hidden)pop.append(row(child));}
   items=[...pop.querySelectorAll('.mg-opt')];
   pop.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();});
   pop.addEventListener('click',e=>{const i=items.indexOf(e.target.closest('.mg-opt'));if(i>=0)pick(i);});
   pop.addEventListener('pointermove',e=>{const i=items.indexOf(e.target.closest('.mg-opt'));if(i>=0&&i!==active)mark(i);});
   document.body.append(pop);
   const r=s.getBoundingClientRect(),box=s.closest('dialog')?.getBoundingClientRect(),w=Math.max(r.width,Math.min(pop.scrollWidth+2,box?box.width-16:innerWidth-16)),below=innerHeight-r.bottom-8,above=r.top-8,h=pop.offsetHeight,up=h>below&&above>below;
   pop.style.width=w+'px';pop.style.left=(box?Math.max(box.left+8,Math.min(r.left,box.right-w-8)):Math.max(8,Math.min(r.left,innerWidth-w-8)))+'px';
   if(up){pop.dataset.up='';pop.style.maxHeight=Math.min(320,above)+'px';pop.style.top=Math.max(8,r.top-4-Math.min(h,above))+'px';}else{pop.style.maxHeight=Math.min(320,below)+'px';pop.style.top=(r.bottom+4)+'px';}
   mark(Math.max(0,items.findIndex(n=>n.hasAttribute('aria-selected'))));}
  document.addEventListener('mousedown',e=>{const s=e.target;if(pop&&!pop.contains(s)&&s!==owner)close();if(e.button!==0||!usable(s))return;e.preventDefault();if(owner===s){close();return;}s.focus({preventScroll:true});open(s);},true);
  // Window-level capture runs before the menu's own Escape handler, so Esc closes the list and not the whole menu.
  window.addEventListener('keydown',e=>{
   if(pop){if(e.key==='ArrowDown'||e.key==='ArrowUp'){mark(active+(e.key==='ArrowDown'?1:-1));}else if(e.key==='Home'||e.key==='End'){mark(e.key==='Home'?0:items.length-1);}else if(e.key==='Enter'||e.key===' '){pick(active);}else if(e.key==='Escape'||e.key==='Tab'){const s=owner;close();if(e.key==='Escape')s?.focus({preventScroll:true});else return;}else return;e.preventDefault();e.stopImmediatePropagation();return;}
   const s=document.activeElement;if(usable(s)&&(e.key==='Enter'||e.key===' '||e.key==='F4'||(e.altKey&&e.key==='ArrowDown'))){e.preventDefault();e.stopImmediatePropagation();open(s);}},true);
  document.addEventListener('scroll',e=>{if(pop&&!pop.contains(e.target))close();},true);
  addEventListener('resize',close);addEventListener('blur',close);
  new MutationObserver(()=>{if(owner&&(!owner.isConnected||!owner.getClientRects().length))close();}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden','class']});}
})();
