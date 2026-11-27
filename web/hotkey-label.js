/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Display names of the reader hotkeys for the in-game tour and the tutorial page: window.MeguLitHotkeys.label(action)
   with action 'menu' | 'cover' | 'bind' | 'log'. It reads the user's bindings from MeguHotkeys (web/hotkeys.js) whenever
   that is loaded, and today's defaults otherwise; web/hotkeys.js fires 'megulit-hotkeys-changed' after a rebind. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else if(root)root.MeguLitHotkeys=root.MeguLitHotkeys||api;})(typeof window==='object'?window:typeof globalThis==='object'?globalThis:this,function(root){
 'use strict';
 const DEFAULTS={menu:'Alt+T',cover:'Alt+H',bind:'Alt+M',log:'Alt+L'};
 const live=()=>{if(root&&root.MeguHotkeys&&typeof root.MeguHotkeys.display==='function')return root.MeguHotkeys;try{if(typeof require==='function')return require('./hotkeys.js');}catch(e){}return null;};
 const label=action=>{if(!DEFAULTS[action])return '';const h=live();if(h){try{const v=h.display(action);if(v)return String(v);}catch(e){}}return DEFAULTS[action];};
 return {label,DEFAULTS};
});
