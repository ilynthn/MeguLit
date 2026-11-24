/* SPDX-License-Identifier: GPL-3.0-or-later
   Alt+T 文字 / 校准 tabs: denser layout only. Layout picked by the owner (top common rows + in-panel sub-tabs). Off switch: localStorage
   'megulit-altt-layout'='off' or ?alttUi=0 (old layout). No control is created, removed or renamed
   (except the sub-tab chips this file adds, marked data-ac-added): nodes may be moved, never rebuilt, so every id,
   name, binding and event stays. Scoped to .tome-ac, so the 内嵌 / 画面与排版 tab and the shared panel CSS are untouched. */
(function installAlttCompact(){
 'use strict';
 if(window.__megulitAlttCompact)return;window.__megulitAlttCompact=true;
 const pick=()=>{try{const q=new URLSearchParams(location.search).get('alttUi');const v=q!==null?q:localStorage.getItem('megulit-altt-layout');return v==='0'||v==='off'?'':'b';}catch{return 'b';}};
 const V=pick();if(!V)return;
 const T='.tome-ac:not(#q1):not(#q2):not(#q3) [data-menu-category=text]',C='.tome-ac:not(#q1):not(#q2):not(#q3) [data-menu-category=calibrate]';
 const SLIDER='label:has(>output.tomoyo-slider-value)';
 const style=document.createElement('style');style.textContent=`
 .tome-ac:not(#q1):not(#q2):not(#q3) :is(${T},${C}) [hidden]{display:none!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tomoyo-menu-content{container-type:inline-size;padding-top:6px}
 /* label | slider | value on one line */
 .tome-ac:not(#q1):not(#q2):not(#q3) ${SLIDER}{display:grid!important;grid-template-columns:clamp(6.8em,24cqw,10em) minmax(0,1fr) 3.2em;align-items:center;column-gap:12px;margin-top:4px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) ${SLIDER}>input[type=range]{order:2;margin:0!important;width:100%;min-width:0}
 .tome-ac:not(#q1):not(#q2):not(#q3) ${SLIDER}>output{order:3;position:static!important;float:none!important;margin:0!important;text-align:right}
 .tome-ac:not(#q1):not(#q2):not(#q3) :is(${T},${C}) label:has(>select){display:grid!important;grid-template-columns:clamp(6.8em,24cqw,10em) minmax(0,1fr);align-items:center;column-gap:12px;margin-top:6px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) :is(${T},${C}) label>select{margin:0!important;min-width:0;padding:6px 10px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) :is(${T},${C}) label{margin-top:6px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) :is(${T},${C}) label:has(>input[type=checkbox]){margin-top:4px!important}
 /* 文字: common switches */
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-text-general .tomoyo-cn-grid{display:flex!important;flex-wrap:wrap;gap:4px 24px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-text-general .tomoyo-cn-grid>label{margin:0!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-ac-pair{display:grid;grid-template-columns:minmax(0,1fr);column-gap:24px}
 @container (min-width:600px){.tome-ac:not(#q1):not(#q2):not(#q3) .tome-ac-pair{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.tome-ac:not(#q1):not(#q2):not(#q3) .tome-ac-pair.tome-ac-switch-slider{grid-template-columns:max-content minmax(0,1fr)}}
 .tome-ac:not(#q1):not(#q2):not(#q3):not(#q4) .tome-ac-group>label:has(>input[type=checkbox])+*,.tome-ac:not(#q1):not(#q2):not(#q3):not(#q4) .tome-ac-group>label:has(>select)+label{margin-top:12px!important;padding-top:10px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3):not(#q4) .tome-ac-pane label:has(>input[type=checkbox]){margin-top:14px!important;margin-bottom:6px!important;padding-top:10px!important;padding-bottom:6px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-ac-mode{padding:10px 0}
 .tome-ac:not(#q1):not(#q2):not(#q3):not(#q4) .tome-ac-mode>*+*{margin-top:10px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-ac-group{padding:10px 0;border-top:1px solid color-mix(in srgb,var(--theme-text,#eee) 9%,transparent)}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-text-general>.tome-ac-group:first-of-type{border-top:0;padding-top:6px}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-ac-group>:is(label,.tome-ac-pair,.tomoyo-cn-grid){margin-top:0!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-ac-group>*+*{margin-top:10px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-ac-group>small{margin-top:8px!important;line-height:1.6!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-text-general>.tome-ac-group .tomoyo-cn-grid{gap:6px 22px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) details>summary{min-height:0!important;padding:7px 12px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) details{margin-top:8px!important;padding-top:0!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) details[open]>:is(div.tomoyo-cn-grid,.tomoyo-ruby-position){margin-top:0}
 .tome-ac:not(#q1):not(#q2):not(#q3) details .tomoyo-cn-grid{gap:0 20px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) details .tomoyo-cn-grid>label{margin-top:6px!important}
 @container (min-width:600px){.tome-ac:not(#q1):not(#q2):not(#q3) [data-text-spacing]>.tomoyo-cn-grid{grid-template-columns:1fr 1fr 1fr!important}}
 /* 校准 */
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-game-style-sync{display:flex!important;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px!important;margin:0!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-game-style-sync>label{flex:1 1 100%;margin:0!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-game-style-sync>button{margin:0!important;padding:6px 12px!important;min-height:0!important;height:32px}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-game-style-sync>small{flex:1 1 100%;margin:0!important;order:5}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-game-style-sync>label{order:0}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-game-style-sync>small:empty{display:none}
 .tome-ac:not(#q1):not(#q2):not(#q3) [data-calibration-position] .tomoyo-cn-grid{display:block!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-window-bind-row,.tome-ac:not(#q1):not(#q2):not(#q3) .tome-window-bind-list{display:flex!important;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-window-bind-list>label{flex:1 1 15em;margin:0!important}
 @container (max-width:560px){.tome-ac:not(#q1):not(#q2):not(#q3) .tome-window-bind-list>label{flex-basis:100%}.tome-ac:not(#q1):not(#q2):not(#q3) .tome-import-row{grid-template-columns:minmax(0,1fr) auto}}
 .tome-ac:not(#q1):not(#q2):not(#q3) :is(.tome-window-bind-row,.tome-window-bind-list)>button{margin:0!important;padding:6px 12px!important;min-height:0!important;height:32px}
 .tome-ac:not(#q1):not(#q2):not(#q3) [data-calibration-window-bind]{margin-top:4px}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-import-row{display:grid!important;grid-template-columns:9em minmax(0,1fr) auto;align-items:center;gap:10px;margin-top:6px!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-import-row>span{grid-column:auto!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-import-row>:is(select,button){margin:0!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-import-row>button{padding:5px 12px!important;height:32px}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-calibration-imports{margin-top:6px}
 /* reusable in-panel second-level tabs (.mg-subtabs): one segmented control. A single trough holds every tab in equal cells (4 a row in a narrow panel, one row when wide); the selected cell is filled. It must not look like the action buttons below it. */
 /* a pane under the segmented control already says which tab it is: its own fold header is not shown */
 details.tome-ac-pane:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7)>summary{display:none!important}
 /* colour rows take one line: name on the left, a small swatch + hex on the right (with a small copy button) */
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) label:has(>.tome-color-field){display:flex!important;flex-direction:row!important;align-items:center;justify-content:space-between;gap:10px;min-height:32px}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .tome-color-field{display:inline-flex!important;align-items:center;gap:6px;width:auto!important;flex:none;margin:0!important}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .tome-color-field>.tome-color-swatch{width:24px!important;height:24px!important;min-width:0!important;min-height:0!important;padding:0!important;border-radius:6px!important}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .tome-color-field>.tome-color-text{width:84px!important;height:28px!important;padding:0 8px!important;font-size:12px!important;font-family:ui-monospace,Consolas,monospace}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .tome-color-field>.tome-color-copy{height:28px!important;min-height:0!important;padding:0 10px!important;font-size:12px!important}
 /* furigana per-row tweaks: one line each — name, row chips, slider, value — like every other slider row */
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .megulit-ruby-rows{display:grid!important;grid-template-columns:64px minmax(0,1fr) 44px!important;align-items:center;column-gap:10px;row-gap:6px}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .megulit-ruby-rows>.megulit-ruby-rows-title{grid-row:1!important;grid-column:1!important;white-space:nowrap}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .megulit-ruby-rows>.megulit-ruby-rows-chips{grid-row:1!important;grid-column:2/-1!important}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .megulit-ruby-rows>.megulit-ruby-axis{grid-column:1!important;padding-left:12px;color:var(--theme-textSecondary,#aaa);white-space:nowrap}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .megulit-ruby-rows>.megulit-ruby-axis[data-a=y],.tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .megulit-ruby-rows>.megulit-ruby-rows-slider:not([data-axis-x]),.tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .megulit-ruby-rows>.megulit-ruby-rows-value:not([data-axis-x]){grid-row:2!important}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .megulit-ruby-rows>.megulit-ruby-axis[data-a=x],.tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .megulit-ruby-rows>.megulit-ruby-rows-slider[data-axis-x],.tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .megulit-ruby-rows>.megulit-ruby-rows-value[data-axis-x]{grid-row:3!important}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .megulit-ruby-rows>.megulit-ruby-rows-slider{grid-column:2!important;width:100%!important;margin:0!important}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .megulit-ruby-rows>.megulit-ruby-rows-value{grid-column:3!important;text-align:right}
 /* 2026-11-21 (user: 同类的不能左右双列吗): paired settings inside a tab page sit side by side; each cell stacks name+value over its slider */
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .tome-ac-pane .tomoyo-cn-grid:not(.tomoyo-type-sizes):not(:has(.tome-color-field)){display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;column-gap:18px!important;row-gap:10px!important}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .tome-ac-pane .tomoyo-cn-grid:not(.tomoyo-type-sizes):not(:has(.tome-color-field))>label:has(input[type=range]){display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center;row-gap:4px;column-gap:6px;min-width:0}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .tome-ac-pane .tomoyo-cn-grid:not(.tomoyo-type-sizes):not(:has(.tome-color-field))>label:has(input[type=range])>input[type=range]{grid-row:2!important;grid-column:1/-1!important;width:100%!important;margin:0!important}
 .tomoyo-cn-dialog:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5):not(#q6):not(#q7) .tome-ac-pane .tomoyo-cn-grid:not(.tomoyo-type-sizes):not(:has(.tome-color-field))>label:has(input[type=range])>:not(input[type=range]){grid-row:1!important;grid-column:2!important}
 .mg-subtabs:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5){display:grid;grid-template-columns:repeat(var(--mg-seg-cols,4),minmax(0,1fr));gap:2px;margin:8px 0 10px;padding:3px;border:0;border-radius:10px;background:color-mix(in srgb,var(--theme-text,#e8e9ec) 7%,transparent);overflow:visible}
 .mg-subtabs:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>button{min-width:0;margin:0!important;padding:7px 4px!important;border:1px solid transparent!important;border-radius:7px!important;background:transparent!important;box-shadow:none!important;color:var(--theme-textSecondary,#aaa)!important;cursor:pointer;font-size:13px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
 .mg-subtabs:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>button:hover{color:var(--theme-text,#e8e9ec)!important;background:color-mix(in srgb,var(--theme-text,#e8e9ec) 6%,transparent)!important}
 .mg-subtabs:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>button[aria-selected=true]{color:var(--theme-text,#f2f3f5)!important;background:color-mix(in srgb,var(--menu-accent,#e0495a) 22%,transparent)!important;border-color:color-mix(in srgb,var(--menu-accent,#e0495a) 55%,transparent)!important;font-weight:700}
 .mg-subtabs:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>button:focus-visible{outline:2px solid var(--menu-accent,#e0495a);outline-offset:1px}
 @media (pointer:coarse){.mg-subtabs:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>button{padding:11px 4px!important}}
 /* action buttons on the calibration page: an even two-column grid instead of ragged rows; toggles, hints and selects keep the full width */
 .tome-game-style-sync:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5){display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 8px;align-items:center}
 .tome-game-style-sync:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>:not(button){grid-column:1/-1}
 .tome-game-style-sync:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>button,.tome-window-bind-row:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>button{width:100%;min-width:0;margin:0!important;justify-content:center;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 /* one obvious action: 校准当前句 is the main button (full width, filled); the partial ones sit under it as quiet small buttons */
 .tome-game-style-sync:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>[data-game-style-sync]{grid-column:1/-1;height:38px!important;font-weight:700;color:#fff!important;background:color-mix(in srgb,var(--menu-accent,#e0495a) 80%,transparent)!important;border-color:transparent!important}
 .tome-game-style-sync:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>[data-game-style-sync]:hover:not(:disabled){background:var(--menu-accent,#e0495a)!important}
 .tome-game-style-sync:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>[data-calibrate-text],.tome-game-style-sync:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>[data-gal-position-sync],.tome-game-style-sync:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>[data-calibrate-stream]{height:28px!important;font-size:12px!important;font-weight:400!important;color:var(--theme-textSecondary,#aaa)!important;background:transparent!important;border-color:var(--menu-border,#34343a)!important}
 .tome-window-bind-row:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5){display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px!important}
 .tome-window-bind-row:not(#q1):not(#q2):not(#q3):not(#q4):not(#q5)>:not(button){grid-column:1/-1}
 .tome-ac:not(#q1):not(#q2):not(#q3) output.tomoyo-slider-value{color:var(--theme-text,#f1f1f4)!important;background:color-mix(in srgb,var(--menu-accent,#e0495a) 30%,transparent)!important;border-radius:6px;padding:1px 6px;font-weight:600}
 .tome-ac:not(#q1):not(#q2):not(#q3) [data-menu-category=text] details.tome-ac-pane .tomoyo-cn-grid{display:block!important}
 @container (min-width:600px){.tome-ac:not(#q1):not(#q2):not(#q3) [data-menu-category=text] details[data-text-colours] .tomoyo-cn-grid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:0 24px!important}.tome-ac:not(#q1):not(#q2):not(#q3) [data-menu-category=text] details[data-text-colours] .tomoyo-cn-grid>label:has(>output){grid-column:1/-1}}
 .tome-ac:not(#q1):not(#q2):not(#q3) [data-menu-category=text] details.tome-ac-pane small{display:block;margin:6px 0 0!important}
 .tome-ac-bindbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0 2px;margin-bottom:-6px}
 .tome-ac-bindbar>small{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px!important;color:var(--theme-text,#e8e9ec)!important}
 .tome-ac-bindbar>small::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;background:#d9a441;vertical-align:1px}
 .tome-ac-bindbar[data-bound=true]>small::before{background:#45c47f}
 .tome-ac-bindbar>button{flex:none;padding:4px 10px!important;border:0!important;background:transparent!important;color:color-mix(in srgb,var(--menu-accent,#e0495a) 55%,#fff)!important;cursor:pointer;font-size:12.5px;border-radius:6px!important}
 .tome-ac-bindbar>button:hover{background:color-mix(in srgb,var(--menu-accent,#e0495a) 14%,transparent)!important}
 .tome-ac-bindbar>button.tome-ac-bind-cta{color:#fff!important;background:color-mix(in srgb,var(--menu-accent,#e0495a) 80%,transparent)!important;border-radius:6px!important;font-weight:700}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-ac-off{display:none!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) details.tome-ac-pane{border:0!important;background:transparent!important;margin-top:0!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) details.tome-ac-pane>summary{display:none!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) details.tome-ac-static>summary{pointer-events:none;cursor:default}
 .tome-ac:not(#q1):not(#q2):not(#q3) details.tome-ac-static>summary::after,.tome-ac:not(#q1):not(#q2):not(#q3) details.tome-ac-static>summary::marker{display:none!important;content:none!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-ac-cols .tomoyo-cn-grid{grid-template-columns:minmax(0,1fr)!important}
 .tome-ac:not(#q1):not(#q2):not(#q3) .tome-ac-cols{display:grid;grid-template-columns:minmax(0,1fr);gap:0 28px}
 @container (min-width:640px){.tome-ac:not(#q1):not(#q2):not(#q3) .tome-ac-cols{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
 @media (pointer:coarse){.tome-ac:not(#q1):not(#q2):not(#q3) .mg-subtabs>button{padding:11px 4px!important}}
 `;(document.head||document.documentElement).appendChild(style);
 const strip=s=>(s||'').replace(/\s*(设置|設定|settings?)$/i,'').trim();
 const mk=(tag,cls,attrs)=>{const e=document.createElement(tag);if(cls)e.className=cls;for(const k in attrs||{})e.setAttribute(k,attrs[k]);return e;};
 const wrapPair=(a,b,cls)=>{if(!a||!b||a.parentElement!==b.parentElement||a.parentElement.classList.contains('tome-ac-pair'))return;const w=mk('div','tome-ac-pair '+(cls||''));a.before(w);w.append(a,b);};
 const byName=(root,n)=>root.querySelector('[name='+n+']')?.closest('label');
 /* sub-tab bar: items = [{label, nodes:[...], get label()}]; idempotent, re-run on every mutation */
 /* short names for the segmented control (the full name stays as the tooltip) */
 const SHORT={'沉浸与等待图标':'沉浸模式','显示方式':'显示','行距与间距':'间距','游戏字体':'字体','校准与位置':'校准','导入与历史':'沿用设置'};
 function chips(host,before,id,items,state){
  let bar=host.querySelector(':scope>.mg-subtabs[data-ac-id='+id+']');
  if(!bar){bar=mk('div','mg-subtabs',{role:'tablist','data-ac-id':id,'data-ac-added':''});before.before(bar);bar.style.setProperty('--mg-seg-cols',String(items.length<=4?items.length:Math.ceil(items.length/2)));
   items.forEach((it,i)=>{const b=mk('button','',{type:'button',role:'tab','data-ac-added':''});b.onclick=()=>{state.i=i;paint();save();};bar.append(b);});
   const sk='megulit-altt-subtab-'+id,save=()=>{try{localStorage.setItem(sk,String(state.i));}catch{}};
   try{const v=Number(localStorage.getItem(sk));if(Number.isInteger(v)&&v>=0&&v<items.length)state.i=v;}catch{}
   bar.addEventListener('keydown',e=>{const k=e.key;if(!['ArrowRight','ArrowLeft','Home','End'].includes(k))return;const n=k==='Home'?0:k==='End'?items.length-1:(state.i+(k==='ArrowRight'?1:items.length-1))%items.length;state.i=n;paint();save();bar.children[n].focus();bar.children[n].scrollIntoView({block:'nearest',inline:'nearest'});e.preventDefault();});}
  function paint(){[...bar.children].forEach((b,i)=>{
   const full=items[i].label();
   // The locale observer can translate both the label and its tooltip after this paint.
   if(b.__compactLabel!==full){
    b.__compactLabel=full;const label=SHORT[full]||full;b.textContent=label;
    if(label!==full)b.title=full;else b.removeAttribute('title');
   }
   b.setAttribute('aria-selected',String(i===state.i));b.tabIndex=i===state.i?0:-1;
  });
   items.forEach((it,i)=>{for(const n of it.nodes()){n.classList.toggle('tome-ac-off',i!==state.i);if(n.tagName==='DETAILS'&&it.pane){n.classList.add('tome-ac-pane');const sm=n.querySelector(':scope>summary');if(sm)sm.style.setProperty('display','none','important');if(i===state.i){n.open=true;for(const d of n.querySelectorAll('details'))if(!d.dataset.acOpened){d.dataset.acOpened='1';d.open=true;}}}}});}
  paint();return bar;}
 window.__megulitSubTabs={mount:chips};
 const st={text:{i:0},cal:{i:0}},bst={open:null,last:null,expanded:false};
 function organize(dialog){
  const text=dialog.querySelector('[data-menu-category=text]'),cal=dialog.querySelector('[data-menu-category=calibrate]');if(!text||!cal)return;
  const general=text.querySelector('.tome-text-general');if(!general)return;
  /* pairs of short rows share a line when the panel is wide */
  const tw=byName(general,'galTypewriter'),sp=byName(general,'galTypewriterSpeed');
  if(tw&&sp&&!tw.parentElement.classList.contains('tome-ac-pair')){wrapPair(tw,sp,'tome-ac-switch-slider');}
 /* top common rows: three loose groups with air and a hairline between them (nodes are moved, never rebuilt) */
  if(!general.querySelector(':scope>.tome-ac-group')){
   const grp=(first,nodes)=>{const nn=nodes.filter(Boolean);if(!first||!nn.length)return;const g=mk('div','tome-ac-group');first.before(g);g.append(...nn);};
   const bold=general.querySelector(':scope>.tomoyo-cn-grid'),pair=tw?.parentElement?.classList.contains('tome-ac-pair')?tw.parentElement:tw,hintA=pair?.nextElementSibling?.tagName==='SMALL'?pair.nextElementSibling:null;
   const disp=byName(general,'galDisplay'),au=byName(general,'galAutoScale');
   /* rarely used rows leave the top: blur goes to the top of the translation page, embed-by-game + Alt+H note to a display-mode tab */
   const blurL=byName(general,'galTranslationBlur')?.closest('label'),embL=byName(general,'galEmbedTranslation')?.closest('label');
   const hots=[...general.querySelectorAll(':scope>small.tomoyo-hotkey-hint')];
   if(embL){const m=mk('div','tome-ac-mode');m.append(embL,...hots);general.after(m);}
   grp(bold,[bold]);grp(pair,[pair,hintA]);grp(disp,[disp,byName(general,'galTranslationInline')?.closest('label'),au&&au.closest('label')||au]);}
  const det=n=>text.querySelector(':scope>details[data-text-'+n+']'),jp=det('japanese'),cn=det('chinese'),en=det('megulit-english')||text.querySelector(':scope>details[data-megulit-english]'),ruby=det('ruby'),pal=det('colours'),spc=det('spacing'),gf=det('game-font');
  const modeBox=text.querySelector('.tome-ac-mode');{const anchor=ruby||pal||gf;if(modeBox&&anchor&&modeBox.nextElementSibling!==anchor)anchor.before(modeBox);}const modeBox2=modeBox,blurLb=byName(text,'galTranslationBlur')?.closest('label');{const tr=dialog.querySelector('[data-menu-category=translate]');if(tr&&blurLb&&tr.firstElementChild!==blurLb)tr.prepend(blurLb);}/* bold switches live in their own language tab, not on top of the page */{const into=(name,box)=>{const l=byName(text,name)?.closest('label');if(!l||!box||box.contains(l))return;const sum=box.querySelector(':scope>summary');const holder=sum?.nextElementSibling&&sum.nextElementSibling.tagName!=='LABEL'?sum.nextElementSibling:box;holder===box&&sum?sum.after(l):holder.prepend(l);};into('galJapaneseBold',jp);into('galChineseBold',cn);const bg=text.querySelector('.tome-text-general .tomoyo-cn-grid');if(bg&&!bg.querySelector('input')){const g=bg.closest('.tome-ac-group');(g||bg).remove();}}
  const groups=[jp,cn,en,modeBox2,ruby,pal,spc,gf].filter(Boolean);
  const calNodes={sync:cal.querySelector(':scope>.tome-game-style-sync'),pos:cal.querySelector(':scope>[data-calibration-position]'),bind:cal.querySelector('[data-calibration-window-bind]'),imp:cal.querySelector('.tome-calibration-imports'),hist:cal.querySelector('.tome-calibration-history')};
  if(V==='b'){
   chips(text,groups[0],'text',groups.map(g=>({pane:true,label:()=>g.classList.contains('tome-ac-mode')?I('显示方式'):strip(g.querySelector('summary')?.textContent),nodes:()=>[g]})),st.text);
      chips(cal,calNodes.sync||cal.firstElementChild,'cal',[
    {label:()=>I('校准与位置'),nodes:()=>[calNodes.sync,calNodes.pos].filter(Boolean)},
    {label:()=>I('导入与历史'),nodes:()=>[calNodes.imp,calNodes.hist].filter(Boolean)}],st.cal);
  }
  if(V==='b'&&calNodes.bind){
   let bar=cal.querySelector(':scope>.tome-ac-bindbar');
   if(!bar){bar=mk('div','tome-ac-bindbar',{'data-ac-added':''});const stat=calNodes.bind.querySelector('[data-gal-bound-window]'),btn=mk('button','',{type:'button','data-ac-added':'','aria-expanded':'false'});if(stat)bar.append(stat);bar.append(btn);
    btn.onclick=()=>{bst.open=!bst.expanded;run();};cal.prepend(bar);}
   if(bar.nextElementSibling!==calNodes.bind)bar.after(calNodes.bind);
   const bound=!!window.__tomoyoChinese?.galBoundTitle;if(bst.last!==bound){bst.open=null;bst.last=bound;}
   bst.expanded=bst.open===null?false:bst.open;bar.dataset.bound=String(bound);calNodes.bind.classList.toggle('tome-ac-off',!bst.expanded);
   const btn=bar.querySelector('button'),t=I(bst.expanded?'收起':bound?'换一个窗口':'绑定游戏窗口');btn.classList.toggle('tome-ac-bind-cta',!bound&&!bst.expanded);if(btn.textContent!==t)btn.textContent=t;btn.setAttribute('aria-expanded',String(bst.expanded));}
  for(const s of dialog.querySelectorAll('[data-menu-category=text] small,[data-menu-category=calibrate] small'))if(!s.dataset.acT){s.dataset.acT='1';s.addEventListener('mouseover',()=>{if(!s.title&&s.scrollHeight>s.clientHeight+1)s.title=s.textContent.trim();});s.addEventListener('click',()=>s.classList.toggle('tome-ac-open'));}
 }
 const L={en:{'校准与位置':'Calibrate & position','导入与历史':'Import & history','换一个窗口':'Change window','绑定游戏窗口':'Bind game window','收起':'Hide','显示方式':'Display mode','更多文字设置':'More text settings','绑定与导入':'Binding & import'},ja:{'校准与位置':'調整と位置','导入与历史':'取り込みと履歴','换一个窗口':'ウィンドウを変更','绑定游戏窗口':'ゲーム画面をバインド','收起':'閉じる','显示方式':'表示方法','更多文字设置':'その他の文字設定','绑定与导入':'バインドと取り込み'}};
 const I=k=>(L[document.documentElement.lang.slice(0,2)]||{})[k]||k;
 let queued=0;
 const run=()=>{queued=0;const d=document.querySelector('.tomoyo-cn-dialog[data-menu-organized]:not([data-leaving])');if(!d)return;d.classList.add('tome-ac');d.dataset.alttUi=V;try{organize(d);}catch(e){console.error('altt-compact',e);}};
 new MutationObserver(()=>{if(!queued)queued=requestAnimationFrame(run);}).observe(document.documentElement,{subtree:true,childList:true});
 run();
})();

/* 2026-11-21 (owner: Alt+T sliders did not move): a slider value that code writes back within 300 ms of the user's input is
   logged (reader-host.log layoutDiagnostic kind=sliderOverwrite: field, the user's value, the written value, the writer's
   first frames), so a slider held by a sync loop names that loop. */
(function sliderOverwriteWatch(){
 'use strict';
 if(window.__megulitSliderWatch)return;window.__megulitSliderWatch=true;
 const recent=new WeakMap(),desc=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
 const report=m=>{try{window.__tomoyoTranslateRequest(JSON.stringify(Object.assign({type:'layoutDiagnostic',kind:'sliderOverwrite'},m)));}catch{}};
 document.addEventListener('input',e=>{const t=e.target;if(!(t instanceof HTMLInputElement)||t.type!=='range'||!t.closest('.tomoyo-cn-dialog'))return;
  recent.set(t,{v:desc.get.call(t),at:performance.now()});
  if(t.__megulitWatched)return;t.__megulitWatched=true;
  Object.defineProperty(t,'value',{configurable:true,get(){return desc.get.call(this);},set(v){const r=recent.get(this);
   if(r&&performance.now()-r.at<300&&String(v)!==String(r.v)){const by=(new Error().stack||'').split('\n').slice(2,5).map(s=>s.trim().replace(/^at /,'')).join(' < ').slice(0,190);report({field:this.name||'',user:String(r.v),wrote:String(v),by});}
   desc.set.call(this,v);}});},true);
})();
