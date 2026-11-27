/* SPDX-License-Identifier: GPL-3.0-or-later */
/* MeguLit hotkeys: the one owner of what each global key is, how it is written and how it is shown.
   (2026-11-27, owner: 支持Alt+T alt+H L之类的热键可以自定义设置 也可以绑定在鼠标上)
   Used by the service (core/hotkeys.cjs keeps data/config/hotkeys.json and sends the keys to GalWindowBridge), by the
   Alt+T menu and Settings (the same panel, web/hotkeys-panel.js) and by every hint that names a key: the menu header row,
   the reading dialog, the guide / tutorial, toasts. Hints read MeguHotkeys.display(action), never a literal "Alt+T".
   A binding is a string: modifiers in the order Ctrl+Alt+Shift+Win, then one key (A-Z, 0-9, F1-F24, a few named keys)
   or one mouse button (MouseX1 / MouseX2 side buttons, MouseMiddle). '' = not bound. */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MeguHotkeys=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const ACTIONS=['bind','menu','cover','log'];
 const DEFAULTS={bind:'Alt+M',menu:'Alt+T',cover:'Alt+H',log:'Alt+L'};
 const NAMES={
  bind:{zh:'绑定窗口',en:'Bind window',ja:'ウィンドウ割り当て'},
  menu:{zh:'开关菜单',en:'Toggle menu',ja:'メニュー開閉'},
  cover:{zh:'开关内嵌 / 覆盖',en:'Toggle inline / overlay',ja:'埋め込み・オーバーレイ切替'},
  log:{zh:'打开日志',en:'Open log',ja:'ログを開く'}};
 /* where a key works: the first three anywhere (as before), the log key only while the bound game is in front;
    a mouse button only ever while the bound game (or MeguLit's own layer) is in front */
 const SCOPE={bind:'global',menu:'global',cover:'global',log:'game'};
 const MODS=['Ctrl','Alt','Shift','Win'];
 const MOD_BITS={Alt:1,Ctrl:2,Shift:4,Win:8};
 const MOUSE={MouseMiddle:1,MouseX1:2,MouseX2:3};
 const MOUSE_NAMES={
  MouseX1:{zh:'鼠标侧键 1',en:'Mouse 4',ja:'マウスボタン 4'},
  MouseX2:{zh:'鼠标侧键 2',en:'Mouse 5',ja:'マウスボタン 5'},
  MouseMiddle:{zh:'鼠标中键',en:'Middle click',ja:'ホイールクリック'}};
 const NAMED={Space:0x20,PageUp:0x21,PageDown:0x22,End:0x23,Home:0x24,Left:0x25,Up:0x26,Right:0x27,Down:0x28,Insert:0x2D,Delete:0x2E,
  Backquote:0xC0,Minus:0xBD,Equal:0xBB,BracketLeft:0xDB,BracketRight:0xDD,Backslash:0xDC,Semicolon:0xBA,Quote:0xDE,Comma:0xBC,Period:0xBE,Slash:0xBF,
  Tab:0x09,Escape:0x1B,Enter:0x0D,Backspace:0x08,Pause:0x13};
 const KEY_SHOW={Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:'\'',Comma:',',Period:'.',Slash:'/',Escape:'Esc'};
 /* Windows keeps these for itself (RegisterHotKey fails or would break the desktop): never accepted */
 const RESERVED=new Set(['Alt+Tab','Alt+Shift+Tab','Ctrl+Alt+Tab','Alt+Escape','Ctrl+Escape','Ctrl+Shift+Escape','Ctrl+Alt+Delete','Alt+F4','Win+L','Win+D','Win+Tab','Win+R','Win+E','Win+Space','Alt+Space','Ctrl+Alt+Escape']);
 /* accepted, with a note: Windows shortcuts many people use, and keys galgames use themselves */
 const SYSTEM=new Set(['Ctrl+C','Ctrl+V','Ctrl+X','Ctrl+Z','Ctrl+Y','Ctrl+A','Ctrl+F','Ctrl+W','Ctrl+N','Ctrl+P','Ctrl+T','Ctrl+Shift+T','Alt+PrintScreen','Win+Shift+S','Win+V','Win+G','Alt+Left','Alt+Right']);
 const GAME=new Set(['Alt+Enter','Ctrl+S','Ctrl+L','Ctrl+Q','Ctrl+R','Ctrl+Space','Ctrl+Enter','Ctrl+A','Ctrl+D']);
 const lang2=lang=>{const l=String(lang||'zh').slice(0,2);return l==='en'||l==='ja'?l:'zh';};

 function keyOf(name){
  if(/^[A-Z]$/.test(name))return name.charCodeAt(0);
  if(/^[0-9]$/.test(name))return name.charCodeAt(0);
  const f=/^F([1-9]|1[0-9]|2[0-4])$/.exec(name);if(f)return 0x6F+Number(f[1]);
  return NAMED[name]||0;
 }
 /* 'Ctrl+Alt+T' -> {ctrl,alt,shift,win,key,mouse}; null when it is not a binding at all */
 function parse(text){
  const raw=String(text==null?'':text).trim();if(!raw)return null;
  const parts=raw.split('+').map(s=>s.trim()).filter(Boolean);if(!parts.length)return null;
  const out={ctrl:false,alt:false,shift:false,win:false,key:'',mouse:''};
  for(let i=0;i<parts.length;i++){
   const p=parts[i],low=p.toLowerCase(),last=i===parts.length-1;
   if(low==='ctrl'||low==='control'){if(last)return null;out.ctrl=true;continue;}
   if(low==='alt'){if(last)return null;out.alt=true;continue;}
   if(low==='shift'){if(last)return null;out.shift=true;continue;}
   if(low==='win'||low==='meta'){if(last)return null;out.win=true;continue;}
   if(!last)return null;
   const mouse=Object.keys(MOUSE).find(m=>m.toLowerCase()===low);
   if(mouse){out.mouse=mouse;continue;}
   const key=p.length===1?p.toUpperCase():/^f\d+$/i.test(p)?p.toUpperCase():Object.keys(NAMED).find(n=>n.toLowerCase()===low)||(low==='esc'?'Escape':'');
   if(!key||!keyOf(key))return null;
   out.key=key;
  }
  if(!out.key&&!out.mouse)return null;
  return out;
 }
 function format(p){if(!p)return '';const mods=[];if(p.ctrl)mods.push('Ctrl');if(p.alt)mods.push('Alt');if(p.shift)mods.push('Shift');if(p.win)mods.push('Win');return mods.concat(p.mouse||p.key).join('+');}
 const normalize=text=>format(parse(text));
 /* ok / why not: 'invalid' | 'modifier' (a keyboard key needs Ctrl, Alt or Win; the middle button needs any modifier) | 'reserved' */
 function check(text){
  const value=String(text==null?'':text).trim();if(!value)return {ok:true,value:''};
  const p=parse(value);if(!p)return {ok:false,reason:'invalid'};
  const canonical=format(p);
  if(RESERVED.has(canonical))return {ok:false,reason:'reserved',value:canonical};
  if(p.mouse==='MouseMiddle'&&!(p.ctrl||p.alt||p.shift||p.win))return {ok:false,reason:'modifier',value:canonical};
  if(p.key&&!(p.ctrl||p.alt||p.win))return {ok:false,reason:'modifier',value:canonical};
  return {ok:true,value:canonical};
 }
 /* a note for a binding that works but may get in the way: 'system' | 'game' | '' */
 function warning(text){
  const v=normalize(text);if(!v)return '';
  if(SYSTEM.has(v)||/^Win\+/.test(v))return 'system';
  if(GAME.has(v))return 'game';
  const p=parse(v);if(p&&p.mouse&&p.mouse!=='MouseMiddle'&&!(p.ctrl||p.alt||p.shift||p.win))return 'mouse';
  return '';
 }
 /* the stored object -> every action with a valid binding; a missing or broken one falls back to its default, '' stays off */
 function clean(value){
  const src=value&&typeof value==='object'?value:{};const out={};
  for(const a of ACTIONS){
   if(!Object.prototype.hasOwnProperty.call(src,a)){out[a]=DEFAULTS[a];continue;}
   const r=check(src[a]);out[a]=r.ok?r.value:DEFAULTS[a];
  }
  /* two actions on one binding: the later one in ACTIONS order goes back to its default, or off when that is taken too */
  const seen=new Map();
  for(const a of ACTIONS){const v=out[a];if(!v)continue;if(seen.has(v)){const d=DEFAULTS[a];out[a]=d&&![...seen.keys()].includes(d)&&!ACTIONS.some(b=>b!==a&&out[b]===d)?d:'';}if(out[a])seen.set(out[a],a);}
  return out;
 }
 /* the other action already using this binding, or '' */
 function conflict(bindings,action,text){const v=normalize(text);if(!v)return '';const b=bindings||{};for(const a of ACTIONS)if(a!==action&&normalize(b[a])===v)return a;return '';}
 /* the whole set as GalWindowBridge reads it: <action>Mods (Alt 1, Ctrl 2, Shift 4, Win 8), <action>Key (VK), <action>Mouse (1 middle, 2 X1, 3 X2) */
 function nativeSpec(bindings){
  const b=clean(bindings),out={};
  for(const a of ACTIONS){const p=parse(b[a]);let mods=0;if(p){if(p.alt)mods|=1;if(p.ctrl)mods|=2;if(p.shift)mods|=4;if(p.win)mods|=8;}
   out[a+'Mods']=p?mods:0;out[a+'Key']=p&&p.key?keyOf(p.key):0;out[a+'Mouse']=p&&p.mouse?MOUSE[p.mouse]:0;}
  return out;
 }
 /* a pressed key (KeyboardEvent) -> binding text; '' while only modifiers are down */
 function fromKeyboard(e){
  const code=String(e&&e.code||'');let key='';
  let m=/^Key([A-Z])$/.exec(code);if(m)key=m[1];
  if(!key&&(m=/^(?:Digit|Numpad)([0-9])$/.exec(code)))key=m[1];
  if(!key&&/^F([1-9]|1[0-9]|2[0-4])$/.test(code))key=code;
  if(!key&&code==='ArrowUp')key='Up';if(!key&&code==='ArrowDown')key='Down';if(!key&&code==='ArrowLeft')key='Left';if(!key&&code==='ArrowRight')key='Right';
  if(!key&&NAMED[code])key=code;
  if(!key)return '';
  return format({ctrl:!!e.ctrlKey,alt:!!e.altKey,shift:!!e.shiftKey,win:!!e.metaKey,key,mouse:''});
 }
 /* a pressed mouse button (MouseEvent.button: 1 middle, 3 back / X1, 4 forward / X2) -> binding text; '' for left / right */
 function fromMouse(e){const button=e&&e.button;const mouse=button===1?'MouseMiddle':button===3?'MouseX1':button===4?'MouseX2':'';if(!mouse)return '';return format({ctrl:!!e.ctrlKey,alt:!!e.altKey,shift:!!e.shiftKey,win:!!e.metaKey,key:'',mouse});}
 /* how a binding is written for people: 'Alt+T', 'Ctrl+鼠标中键', '鼠标侧键 1' */
 function label(text,lang){
  const p=parse(text);if(!p)return '';const l=lang2(lang),mods=[];
  if(p.ctrl)mods.push('Ctrl');if(p.alt)mods.push('Alt');if(p.shift)mods.push('Shift');if(p.win)mods.push('Win');
  const tail=p.mouse?MOUSE_NAMES[p.mouse][l]:(KEY_SHOW[p.key]||p.key);
  return mods.concat(tail).join('+');
 }
 const actionName=(action,lang)=>(NAMES[action]||{})[lang2(lang)]||'';
 const off={zh:'未设置',en:'Not set',ja:'未設定'};

 /* the live set in a page (the Alt+T menu, the main window): set by the service, read by every hint */
 let current=clean(null);
 const listeners=new Set();
 function set(bindings){const next=clean(bindings);const changed=ACTIONS.some(a=>next[a]!==current[a]);current=next;if(!changed)return false;
  for(const fn of [...listeners])try{fn(current);}catch(e){}
  try{if(root&&typeof root.dispatchEvent==='function'&&typeof root.CustomEvent==='function'){root.dispatchEvent(new root.CustomEvent('megu-hotkeys',{detail:{...current}}));root.dispatchEvent(new root.CustomEvent('megulit-hotkeys-changed',{detail:{...current}}));}}catch(e){}
  return true;}
 const get=action=>action?current[action]:{...current};
 const pageLang=()=>{try{return root.__tomeI18n&&root.__tomeI18n.get?root.__tomeI18n.get():(root.document&&root.document.documentElement.lang)||'zh';}catch(e){return 'zh';}};
 /* THE function for hints: the current key of an action as people read it; '未设置' when it has none */
 function display(action,lang){const l=lang||pageLang();const v=current[action];return v?label(v,l):off[lang2(l)];}
 /* a text written with the default keys (Alt+M / Alt+T / Alt+H / Alt+L) -> the same text with the current ones, in one pass */
 const DEFAULT_TO_ACTION=Object.fromEntries(ACTIONS.map(a=>[DEFAULTS[a],a]));
 function localizeWith(bindings,text,lang){const b=clean(bindings),l=lang||pageLang();return String(text==null?'':text).replace(/Alt ?\+ ?([MTHL])\b/g,(all,k)=>{const a=DEFAULT_TO_ACTION['Alt+'+k];if(!a)return all;return b[a]?label(b[a],l):off[lang2(l)];});}
 const localize=(text,lang)=>localizeWith(current,text,lang);
 const onChange=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};

 return {ACTIONS,DEFAULTS,SCOPE,parse,format,normalize,check,warning,clean,conflict,nativeSpec,fromKeyboard,fromMouse,label,actionName,
  set,get,display,localize,localizeWith,onChange,keyOf};
});
