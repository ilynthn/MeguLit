// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-15 (user: alt+m从开关主页的快捷键改一下 改成绑定当前游戏窗口的快捷键): Alt+M binds the window in front, the same
   bind as picking it in Alt+T → 窗口绑定 (GalNative.bind). The bridge only reports the foreground top-level window
   (bindHotkey: hwnd, pid, title, className, processName, own); what may be bound is decided here. MeguLit's own windows,
   the desktop / taskbar and Explorer are refused with a hint. The library game is matched by the existing bound path
   (gameProcessId → executable → library). */
const WORDS={
 zh:{own:'现在在前面的是 MeguLit 自己的窗口：先点一下游戏窗口，再按 Alt+M',desktop:'现在在前面的是桌面：先点一下游戏窗口，再按 Alt+M',
  explorer:'现在在前面的是资源管理器：先点一下游戏窗口，再按 Alt+M',none:'没有找到在前面的窗口：先点一下游戏窗口，再按 Alt+M',bound:'已绑定：',failed:'绑定失败：',busy:'MeguLit 的游戏组件还没准备好，稍后再按 Alt+M'},
 ja:{own:'前面にあるのは MeguLit 自身のウィンドウです。ゲームのウィンドウをクリックしてから Alt+M を押してください',desktop:'前面にあるのはデスクトップです。ゲームのウィンドウをクリックしてから Alt+M を押してください',
  explorer:'前面にあるのはエクスプローラーです。ゲームのウィンドウをクリックしてから Alt+M を押してください',none:'前面のウィンドウが見つかりません。ゲームのウィンドウをクリックしてから Alt+M を押してください',bound:'割り当てました：',failed:'割り当てに失敗しました：',busy:'MeguLit のゲーム用コンポーネントがまだ準備中です。少し待ってから Alt+M を押してください'},
 en:{own:'MeguLit\'s own window is in front: click the game window, then press Alt+M',desktop:'The desktop is in front: click the game window, then press Alt+M',
  explorer:'File Explorer is in front: click the game window, then press Alt+M',none:'No window is in front: click the game window, then press Alt+M',bound:'Bound: ',failed:'Could not bind: ',busy:'MeguLit\'s game component is not ready yet; press Alt+M again in a moment'}};
const SHELL=new Set(['Progman','WorkerW','Shell_TrayWnd','Shell_SecondaryTrayWnd']);
/* 'ok' when the window may be bound, else why not: own | desktop | explorer | none */
function classify(m){
 const hwnd=String(m?.hwnd??'');if(!/^\d{1,19}$/.test(hwnd)||/^0+$/.test(hwnd))return 'none';
 const name=String(m.processName||'').toLowerCase().replace(/\.exe$/,''),cls=String(m.className||'');
 if(m.own===true||/^megulit/.test(name)||name==='msedgewebview2')return 'own';
 if(SHELL.has(cls))return 'desktop';
 if(name==='explorer')return 'explorer';
 return 'ok';
}
const words=lang=>WORDS[String(lang||'zh').slice(0,2)]||WORDS.zh;
/* 2026-11-27 the words are written with Alt+M; with the service root they name the key chosen in 热键 (services/hotkeys.cjs) */
function withKey(text,lang,root){if(!root)return text;let key;try{const keys=require('../web/hotkeys.js'),b=require('../core/hotkeys.cjs').read(require('node:path').join(root,'data','config')).bind;key=b?keys.label(b,lang):keys.actionName('bind',lang);}catch{return text;}return String(text).split('Alt+M').join(key);}
const message=(kind,lang,detail='',root)=>{const w=words(lang);if(kind==='bound')return w.bound+(String(detail||'').trim()||'?');if(kind==='failed')return w.failed+String(detail||'');return withKey(w[kind]||w.none,lang,root);};
/* One bind for Alt+M, the 校准 page's 点选 and its window list (2026-11-15, user: 方便先开游戏再开megulit 或者megulit不小心关了中途要链接).
   GalNative.bind → the bridge binds the window → 'bound' → HookNative.configure attaches HookBridge to that process (it connects
   first and injects only when Luna_CheckIfNeedInject says the DLL is not there yet, so a DLL left by an earlier MeguLit is
   reused, never injected twice; MeguLit's own DLLs reconnect their pipes by themselves), the overlay follows the window and
   reader.cjs matches the library game from the process. The process name is kept as gameProcess, so a MeguLit restart while
   the game runs binds it again by itself (the bridge's WantedProcess auto-bind).
   reader: the Reader (services/reader.cjs); emit(result) gets {type:'bindHotkeyResult',ok,kind,title,message} */
function bindWindow(reader,w,settings,emit){
 const g=reader.gal,title=String(w?.title||'').slice(0,200);if(!g)return false;
 reader.hotkeyBind={hwnd:String(w.hwnd),title,processName:String(w.processName||'').replace(/\.exe$/i,'').slice(0,120),at:Date.now()};
 try{reader.translator?.().clearContext?.();}catch{}
 g.bind(String(w.hwnd),{...(settings&&typeof settings==='object'?settings:g.preferences),bindEnabled:true});return true;
}
function request(reader,m,emit,lang){
 const kind=classify(m),title=String(m?.title||'').slice(0,200);
 if(kind!=='ok'){emit({type:'bindHotkeyResult',ok:false,kind,title,pick:m?.pick===true,message:message(kind,lang,'',reader.root)});return false;}
 if(!reader.gal){emit({type:'bindHotkeyResult',ok:false,kind:'busy',title,message:message('busy',lang,'',reader.root)});return false;}
 return bindWindow(reader,m,reader.gal.preferences,emit);
}
/* bridge messages after a hotkey bind: 'bound' for that window says done, an 'error' soon after says why not */
function follow(reader,m,emit,lang){
 const pending=reader.hotkeyBind;if(!pending)return;
 if(Date.now()-pending.at>8000){reader.hotkeyBind=null;return;}
 if(m.type==='bound'&&String(m.gameHwnd||'')===pending.hwnd){reader.hotkeyBind=null;const title=String(m.gameTitle||pending.title||'');const g=reader.gal;if(g&&pending.processName&&g.preferences?.gameProcess!==pending.processName)try{g.save({...g.preferences,gameProcess:pending.processName,gameExecutable:'',bindEnabled:true},false);}catch{}
  emit({type:'bindHotkeyResult',ok:true,kind:'bound',title,message:message('bound',lang,title)});}
 else if(m.type==='error'){reader.hotkeyBind=null;emit({type:'bindHotkeyResult',ok:false,kind:'failed',title:pending.title,message:message('failed',lang,m.message)});}
}
/* Startup (same request): a library game already running when MeguLit starts is named with a hint to press Alt+M. The game
   MeguLit binds again by itself (the remembered gameProcess) is left out, and nothing is said once a game is bound. */
const RUNNING={zh:t=>'检测到「'+t+'」正在运行：先点一下游戏窗口，再按 Alt+M 连接',ja:t=>'「'+t+'」が起動中です。ゲームのウィンドウをクリックしてから Alt+M で接続できます',en:t=>'“'+t+'” is running: click its window, then press Alt+M to connect'};
const base=exe=>String(exe||'').split(/[\\/]/).pop().replace(/\.exe$/i,'').toLowerCase();
function runningGames(windows,games,skipProcess=''){
 const byName=new Map();for(const g of games||[]){const b=base(g.executable);if(b&&!byName.has(b))byName.set(b,g);}
 const skip=String(skipProcess||'').replace(/\.exe$/i,'').toLowerCase(),seen=new Set(),out=[];
 for(const w of windows||[]){const name=String(w.processName||'').toLowerCase(),g=byName.get(name);if(!g||!name||name===skip||seen.has(g.id))continue;seen.add(g.id);out.push({id:g.id,title:String(g.title||name),hwnd:String(w.hwnd||''),processName:String(w.processName||'')});}
 return out;
}
function runningHint(found,lang,root){if(!found.length)return '';const titles=found.slice(0,3).map(f=>f.title).join(lang==='en'?', ':'、');return withKey((RUNNING[String(lang||'zh').slice(0,2)]||RUNNING.zh)(titles),lang,root);}
/* reader.event: 'ready' asks the bridge for the open windows once (a few seconds later, after its own auto-bind had a chance);
   the 'windows' answer to that request is checked against the library */
function startupScan(reader,m,emit,lang,games){
 if(m.type==='ready'){if(reader.runningScanDone)return;reader.runningScanDone=true;const t=setTimeout(()=>{if(reader.gamePid||!reader.gal)return;reader.runningScanWanted=Date.now();reader.gal.send({type:'windows'});},4000);t.unref?.();return;}
 if(!Array.isArray(m.windows)||!reader.runningScanWanted||Date.now()-reader.runningScanWanted>15000)return;reader.runningScanWanted=0;
 if(reader.gamePid)return;const p=reader.gal?.preferences||{},found=runningGames(m.windows,games(),p.bindEnabled===true?p.gameProcess:'');
 if(found.length)emit({type:'runningGameHint',games:found.map(f=>({id:f.id,title:f.title})),message:runningHint(found,lang,reader.root)});
}
module.exports={classify,message,request,bindWindow,follow,runningGames,runningHint,startupScan};
