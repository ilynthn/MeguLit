/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Display names of the reader hotkeys, read by every text that names a hotkey (the in-game tour, the tutorial page).
   TEMPORARY: the custom-hotkeys work (branch feat/custom-hotkeys) owns this file and its real version reads the user's
   bindings; until it lands this one returns today's fixed keys. Same names on both sides: window.MeguLitHotkeys.label(action)
   with action 'menu' | 'cover' | 'bind' | 'log', and a 'megulit-hotkeys-changed' window event after a rebind. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else if(root)root.MeguLitHotkeys=root.MeguLitHotkeys||api;})(typeof window==='object'?window:typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const DEFAULTS={menu:'Alt+T',cover:'Alt+H',bind:'Alt+M',log:'Alt+L'};
 const label=action=>DEFAULTS[action]||'';
 return {label,DEFAULTS};
});
