/* SPDX-License-Identifier: GPL-3.0-or-later */
/* The hotkeys panel: one component for the Alt+T menu (热键 page) and Settings → 热键. Click a key, then press the keys or
   the mouse button wanted (side buttons alone, the middle button with a modifier). A key another action uses is refused with
   its name; a key Windows or many games use is kept with a note; each row has 恢复默认. Needs web/hotkeys.js first.
   opts: {load() -> Promise<{bindings}>, save(changes) -> Promise<{bindings}> (rejects with HOTKEY_* codes), pause(on) while
   a key is being recorded (the bridge lets go of its keys so the one pressed reaches the page), lang() -> 'zh'|'en'|'ja'} */
(function(root){
 'use strict';
 const H=root.MeguHotkeys;if(!H)return;
 const W={
  zh:{title:'热键',note:'点一下按键框，再按下想要的组合键或鼠标键。鼠标侧键可以单独用，中键要加 Ctrl / Alt / Shift。鼠标键只在游戏窗口在前面时生效。',
   record:'按下按键或鼠标键…（Esc 取消）',reset:'恢复默认',clear:'清除',off:'未设置',saved:'已保存，立即生效',
   conflict:'和「{a}」冲突了：先给「{a}」换一个键',reserved:'这是 Windows 自己的快捷键，不能用',modifier:'键盘键要加 Ctrl、Alt 或 Win；鼠标中键要加修饰键',invalid:'这个键不能用',failed:'没保存成功，稍后再试',
   system:'提醒：这也是 Windows 或常用软件的快捷键，按下时那边就不会响应了',game:'提醒：不少游戏自己用这个键（存档、全屏、跳过等），游戏里按下会先被 MeguLit 用掉',mouse:'提醒：游戏窗口在前面时，这个鼠标键只给 MeguLit 用，游戏收不到',
   scopeGlobal:'任何时候',scopeGame:'游戏在前面时',defaultIs:'默认 {k}'},
  en:{title:'Hotkeys',note:'Click a key box, then press the keys or mouse button you want. Side buttons work alone; the middle button needs Ctrl / Alt / Shift. Mouse buttons only work while the game window is in front.',
   record:'Press keys or a mouse button… (Esc cancels)',reset:'Default',clear:'Clear',off:'Not set',saved:'Saved; works now',
   conflict:'Already used by “{a}”: give “{a}” another key first',reserved:'Windows keeps this shortcut for itself',modifier:'Keyboard keys need Ctrl, Alt or Win; the middle button needs a modifier',invalid:'This key cannot be used',failed:'Could not save; try again',
   system:'Note: Windows or common apps use this shortcut too; they will not see it while MeguLit has it',game:'Note: many games use this key themselves (save, full screen, skip…); in the game MeguLit takes it first',mouse:'Note: while the game is in front this button goes to MeguLit only, not to the game',
   scopeGlobal:'Anywhere',scopeGame:'While the game is in front',defaultIs:'Default {k}'},
  ja:{title:'ホットキー',note:'キー欄をクリックしてから、使いたいキーの組み合わせかマウスボタンを押してください。サイドボタンは単独で、ホイールクリックは Ctrl / Alt / Shift と一緒に使えます。マウスボタンはゲームのウィンドウが前面のときだけ有効です。',
   record:'キーかマウスボタンを押してください…（Esc で取り消し）',reset:'既定に戻す',clear:'解除',off:'未設定',saved:'保存しました。すぐ有効になります',
   conflict:'「{a}」と重なっています。先に「{a}」を別のキーにしてください',reserved:'Windows 自身のショートカットなので使えません',modifier:'キーボードのキーは Ctrl・Alt・Win と組み合わせてください。ホイールクリックも修飾キーが必要です',invalid:'このキーは使えません',failed:'保存できませんでした。もう一度お試しください',
   system:'注意：Windows やよく使うアプリのショートカットでもあります。MeguLit が使っている間はそちらに届きません',game:'注意：多くのゲームが自分で使うキーです（セーブ・全画面・スキップなど）。ゲーム中は MeguLit が先に使います',mouse:'注意：ゲームが前面のとき、このボタンは MeguLit だけが使い、ゲームには届きません',
   scopeGlobal:'いつでも',scopeGame:'ゲームが前面のとき',defaultIs:'既定 {k}'}};
 const L=lang=>{const l=String(lang||'zh').slice(0,2);return l==='en'||l==='ja'?l:'zh';};
 const w=(lang,k,v)=>{let s=(W[L(lang)]||W.zh)[k]||W.zh[k]||k;for(const [a,x] of Object.entries(v||{}))s=s.split('{'+a+'}').join(x);return s;};
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'})[c]);
 /* what to say about a key the user pressed for an action: {ok,level:'error'|'warn'|'',text,value} (no DOM; the panel and tests use it) */
 function judge(bindings,action,value,lang){
  const r=H.check(value);
  if(!r.ok)return {ok:false,level:'error',text:w(lang,r.reason)};
  const other=H.conflict(bindings,action,r.value);
  if(other)return {ok:false,level:'error',text:w(lang,'conflict',{a:H.actionName(other,lang)}),other};
  const note=H.warning(r.value);
  return {ok:true,level:note?'warn':'',text:note?w(lang,note):'',value:r.value};
 }
 /* a refused save (core/hotkeys.cjs codes) as words */
 function errorText(error,lang){const m=String(error&&error.message||error||'');
  if(/HOTKEY_CONFLICT/.test(m)){const other=error&&error.other||(/HOTKEY_CONFLICT:(\w+)/.exec(m)||[])[1];return w(lang,'conflict',{a:H.actionName(other,lang)||'?'});}
  if(/HOTKEY_RESERVED/.test(m))return w(lang,'reserved');if(/HOTKEY_MODIFIER/.test(m))return w(lang,'modifier');if(/HOTKEY_INVALID/.test(m))return w(lang,'invalid');return w(lang,'failed');}
 /* the key row under the Alt+T menu title: every action with its current key, read from MeguHotkeys */
 function hintRow(lang,extra){const l=L(lang);const parts=H.ACTIONS.filter(a=>H.get(a)).map(a=>'<span data-no-i18n=""><kbd>'+esc(H.display(a,l))+'</kbd>'+esc(H.actionName(a,l))+'</span>');
  for(const x of extra||[])parts.push('<span>'+esc(x)+'</span>');return parts.join('');}

 function mountPanel(host,opts){
  if(!host)return null;const o=opts||{};const lang=()=>L(typeof o.lang==='function'?o.lang():o.lang);
  let bindings=H.get(),recording=null,stopRecording=null;
  const box=document.createElement('div');box.className='megu-hotkeys';box.dataset.noI18n='';
  host.replaceChildren(box);
  function paint(){
   const l=lang();
   box.innerHTML='<p class="megu-hotkeys-note">'+esc(w(l,'note'))+'</p>'+H.ACTIONS.map(a=>{const v=bindings[a];
    return '<div class="megu-hotkeys-row" data-action="'+a+'"><div class="megu-hotkeys-name"><b>'+esc(H.actionName(a,l))+'</b><small>'+esc(w(l,H.SCOPE[a]==='game'?'scopeGame':'scopeGlobal'))+' · '+esc(w(l,'defaultIs',{k:H.label(H.DEFAULTS[a],l)}))+'</small></div>'+
     '<button type="button" class="megu-hotkeys-key" data-record="'+a+'" aria-label="'+esc(H.actionName(a,l))+'"'+(v?'':' data-off=""')+'>'+(v?'<span class="megu-hotkeys-k">'+esc(H.label(v,l))+'</span>':esc(w(l,'off')))+'</button>'+
     '<button type="button" class="megu-hotkeys-small" data-clear="'+a+'"'+(v?'':' disabled')+'>'+esc(w(l,'clear'))+'</button>'+
     '<button type="button" class="megu-hotkeys-small" data-reset="'+a+'"'+(v===H.DEFAULTS[a]?' disabled':'')+'>'+esc(w(l,'reset'))+'</button>'+
     '<p class="megu-hotkeys-msg" role="status" aria-live="polite"></p></div>';}).join('');
  }
  const row=a=>box.querySelector('.megu-hotkeys-row[data-action="'+a+'"]');
  function say(a,level,text){const p=row(a)&&row(a).querySelector('.megu-hotkeys-msg');if(!p)return;p.textContent=text||'';p.dataset.level=level||'';}
  async function commit(a,value){
   const l=lang();
   if(value!==null){const j=judge(bindings,a,value,l);if(!j.ok){paint();say(a,'error',j.text);return false;}}
   try{const state=await o.save({[a]:value});bindings=H.clean(state&&state.bindings);H.set(bindings);paint();
    const note=value?H.warning(bindings[a]):'';say(a,note?'warn':'ok',note?w(l,note):w(l,'saved'));return true;}
   catch(error){paint();say(a,'error',errorText(error,l));return false;}
  }
  function record(a){
   if(stopRecording)stopRecording();
   const button=row(a)&&row(a).querySelector('[data-record]');if(!button)return;
   recording=a;button.dataset.recording='';button.textContent=w(lang(),'record');say(a,'','');
   try{o.pause&&o.pause(true);}catch(e){}
   const done=value=>{stop();if(value===undefined){paint();return;}commit(a,value);};
   const onKey=e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation&&e.stopImmediatePropagation();
    if(e.type!=='keydown')return;
    if(e.code==='Escape'&&!e.ctrlKey&&!e.altKey&&!e.shiftKey&&!e.metaKey){done(undefined);return;}
    const v=H.fromKeyboard(e);if(v)done(v);};
   const onMouse=e=>{const v=H.fromMouse(e);
    if(e.button===0&&e.type==='mousedown'){if(!button.contains(e.target))done(undefined);return;}
    if(e.button===2)return;
    e.preventDefault();e.stopPropagation();if(e.type==='mousedown'&&v)done(v);};
   const block=e=>{if(e.button===1||e.button===3||e.button===4){e.preventDefault();e.stopPropagation();}};
   const blur=()=>done(undefined);
   document.addEventListener('keydown',onKey,true);document.addEventListener('keyup',onKey,true);
   document.addEventListener('mousedown',onMouse,true);document.addEventListener('mouseup',block,true);document.addEventListener('auxclick',block,true);
   root.addEventListener('blur',blur);
   const timer=setTimeout(()=>done(undefined),20000);
   function stop(){if(!recording)return;recording=null;stopRecording=null;clearTimeout(timer);
    document.removeEventListener('keydown',onKey,true);document.removeEventListener('keyup',onKey,true);
    document.removeEventListener('mousedown',onMouse,true);/* the release of the button pressed comes later: without this, X1 / X2 still went back / forward in the page */setTimeout(()=>{document.removeEventListener('mouseup',block,true);document.removeEventListener('auxclick',block,true);},1500);
    root.removeEventListener('blur',blur);try{o.pause&&o.pause(false);}catch(e){}}
   stopRecording=stop;
  }
  box.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('button');if(!t||!box.contains(t))return;
   if(t.dataset.record){if(recording===t.dataset.record)return;record(t.dataset.record);}
   else if(t.dataset.clear)commit(t.dataset.clear,'');
   else if(t.dataset.reset)commit(t.dataset.reset,null);});
  const offKeys=H.onChange(next=>{if(recording)return;bindings={...next};paint();}),offLang=onLangChange(()=>{if(!recording)paint();});
  const off=()=>{offKeys();offLang();};
  paint();
  Promise.resolve(o.load&&o.load()).then(state=>{if(state&&state.bindings){H.set(state.bindings);bindings=H.get();paint();}}).catch(()=>{});
  return {element:box,refresh:paint,destroy(){if(stopRecording)stopRecording();off();box.remove();},record};
 }
 /* the page language changed (the reader's i18n sets <html lang>): repaint what was written in the old one */
 function onLangChange(fn){try{const o=new root.MutationObserver(()=>fn());o.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});return()=>o.disconnect();}catch(e){return()=>{};}}
 Object.assign(H,{mountPanel,hintRow,judge,errorText,onLangChange,panelWords:W});
})(typeof globalThis!=='undefined'?globalThis:this);
