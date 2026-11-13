// SPDX-License-Identifier: GPL-3.0-or-later
import {modules,legacyStorageKeys} from './module-list.js';
import {hostRegionMessage,installHostRegions} from './host-regions.js';
import {installHostTransport} from './host-transport.js';
import {installLearningNotice} from './learning-notice.js';
import {installLookupDismiss} from './lookup-dismiss.js';
import {installGameUiScan} from './game-ui.js';
const internal=window.__TAURI_INTERNALS__,native=internal.invoke.bind(internal),api=(action,params={})=>native('service',{request:{action,...params}});
window.__megulitPickExecutable=()=>native('pick_executable');
const status=document.querySelector('#reader-status');let phase='bootstrap',loaded=false,uiState={};const queued=[];
const health=(stage,error='')=>api('reader_health',{phase:stage,error:String(error)}).catch(()=>{});
// The original modules retain their own names, classes, storage keys and public interfaces.
for(const suffix of ['Chinese','Invoke','NativeInvoke','NativePreferences','Engines','TranslateRequest','Mode'])Object.defineProperty(window,'__tome'+suffix,{configurable:true,get:()=>window['__tomoyo'+suffix],set:value=>window['__tomoyo'+suffix]=value});
function deliver(result){for(const reply of result?.replies||[]){const fn=window.__tomoyoChinese?.[reply.method];if(typeof fn==='function')fn(...reply.args);}}
const legacyKey=key=>legacyStorageKeys.some(base=>key===base||base.endsWith('-')&&key.startsWith(base));
function snapshot(){const values={...uiState};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(/^(?:tome|tomoyo)-/.test(key)&&!/key|token|secret|password/i.test(key)){values[key]=localStorage.getItem(key);if(key.startsWith('tomoyo-')&&legacyKey(key))values[key.replace(/^tomoyo-/,'tome-')]=values[key];}}return values;}
window.__tomoyoTranslateRequest=payload=>{let message;try{message=JSON.parse(payload);}catch{return;}
 if(message.type==='galLookup'&&window.__megulitLookupDismissing)message={...message,open:true};
 if(message.type==='uiState'){uiState=snapshot();api('preserve_ui',{values:uiState}).catch(()=>{});return;}
 api('reader_message',{message:hostRegionMessage(message)}).then(deliver).catch(error=>{status.textContent=String(error);});
};
// A lone Alt press would put the reader window into Windows menu mode and draw a frame at its top (user, E215.2).
addEventListener('keydown',e=>{if(e.key==='Alt'&&!e.ctrlKey&&!e.shiftKey)e.preventDefault();},true);addEventListener('keyup',e=>{if(e.key==='Alt')e.preventDefault();},true);
installLookupDismiss({bridge:()=>window.__tomoyoChinese,send:message=>window.__tomoyoTranslateRequest(JSON.stringify(message))});
addEventListener('megulit-reveal-progress',event=>{const text=window.__tomoyoChinese?.hookSourceText;if(typeof text==='string')window.__tomoyoTranslateRequest(JSON.stringify({type:'revealProgress',text,typing:event.detail.typing}));});
const invoke=(command,args={})=>{
 if(command==='plugin:dialog|open')return native('pick_image');
 if(command==='plugin:clipboard-manager|read_text')return window.__tomoyoChinese?.hookActive?Promise.resolve(window.__tomoyoChinese.hookSourceText||''):native('read_clipboard');
 if(command==='plugin:clipboard-manager|write_text')return navigator.clipboard.writeText(args.text||'');
 if(command.startsWith('plugin:sql|'))return api('reader_invoke',{command,args});
 // Window commands in the original overlay target its own surface, rather than the new homepage.
 if(command.startsWith('plugin:window|'))return native(command,{...args,label:args.label==='main'||!args.label?'reader':args.label,...(command==='plugin:window|set_skip_taskbar'?{value:true}:{})});
 if(command.startsWith('plugin:event|')||['service','reader_connect','window_action','pick_image'].includes(command))return native(command,args);
 return api('reader_invoke',{command,args});
};
window.__tomoyoInvoke=invoke;window.__tomoyoNativeInvoke=invoke;installHostTransport(invoke,window);
// Legacy /media paths address this reader, never the independent homepage.
window.__tomeOverlayRoute=path=>{const reader=path==='@reader'||/^\/media\/\d+\/?$/.test(path);native('window_action',{action:reader?'enter_overlay':'show_home'}).catch(()=>{});};
function appearance(p){const light=p.themeMode==='light',values={'--theme-primary':p.accent||'#ad1539','--theme-background':light?'#f5f5f7':p.themeMode==='black'?'#08090c':'#14161b','--theme-surface':light?'#ffffff':'#24272e','--theme-border':light?'#d5d6de':'#393e49','--theme-text':light?'#252832':'#f3f3f5','--theme-textSecondary':light?'#626878':'#adb1bc'};for(const[key,value]of Object.entries(values))document.documentElement.style.setProperty(key,value);document.documentElement.style.colorScheme=light?'light':'dark';if(p.fontFamily)document.documentElement.style.fontFamily='"'+String(p.fontFamily).replace(/["\\;{}]/g,'')+'",sans-serif';}
function event(message){if(!loaded){queued.push(message);return;}if(message.type==='activeGame'){localStorage.setItem('tomoyo-reader-path',message.legacyId==null?'':'/media/'+message.legacyId);return;}const b=window.__tomoyoChinese;if(!b)return;
 if(message.type==='word-status-changed'){dispatchEvent(new Event('tome-word-status-changed'));return;}if(message.type==='sentence-saved'){dispatchEvent(new Event('tome-sentences-changed'));return;}
 if(message.type==='appearance'){appearance(message.preferences);return;}
 if(message.type==='panelAppearance'){for(const[key,value]of Object.entries(message.values||{}))if(['tome-background','tome-menu-background'].includes(key))localStorage.setItem(key,value);b.hostRefreshAppearance?.().catch(error=>{status.textContent=String(error);});return;}
 if(message.type==='language'){window.__tomeI18n?.set?.(message.language);return;}
 if(message.type==='call'){deliver({replies:[message]});return;}
 const method={glassFrame:'glassFrame',gameStyleStatus:'gameStyleStatus',hookTextPos:'textPosition',artText:'artText',enginePreferences:'enginePreferences',hookPage:'hookPage',waitMarkerFrame:'waitMarkerFrame',maskFrame:'galMaskFrame'}[message.type];
 if(method){b[method]?.(message);return;}
 if(message.type==='workTranslationPrompt'){b.workTranslationPrompt?.(message.key,message.prompt);return;}
 if(typeof message.hookNativeLog==='boolean'){document.body.classList.toggle('megulit-native-log',message.hookNativeLog);window.__tomoyoHitRegionsRefresh?.(true);}
 if(message.type==='dialogVisibility'){document.body.classList.toggle('megulit-dialog-hidden',message.visible===false);/* 2026-11-13 choices on screen while the game hid its text box: the reader shows them, not the old line */document.body.classList.toggle('megulit-choice-only',message.choiceOnly===true);return;}
 if(message.type==='fonts'){b.gameFonts?.(message.fonts);return;}
 if(message.type==='hotkey')b.toggleGalMenu?.();else b.galStatus?.(message);
 b.learningStatus?.(message);b.hookReaderStatus?.();
 // interface-mode-host owns mode navigation, avoiding a duplicate home reveal/focus.
}
try{
 const home=await api('home'),saved=await api('ui_state'),bootstrap=await api('reader_bootstrap');uiState=saved;window.__tomoyoEngines=bootstrap.engines;window.__tomoyoNativePreferences=bootstrap.native;
 for(const[key,value]of Object.entries(saved))localStorage.setItem(key,value);
 for(const[key,value]of Object.entries(saved))if(key.startsWith('tome-')&&legacyKey(key.replace(/^tome-/,'tomoyo-')))localStorage.setItem(key.replace(/^tome-/,'tomoyo-'),value);
 window.__tomoyoUiState=snapshot();localStorage.setItem('tome-ui-language',home.preferences.language);localStorage.setItem('tomoyo-ui-language',home.preferences.language);appearance(home.preferences);
 const callback=internal.transformCallback(response=>event(response.payload));await native('plugin:event|listen',{event:'reader-event',target:{kind:'Any'},handler:callback});
 phase='native-attach';await native('reader_connect');
 for(const name of modules){await health('loading:'+name);await new Promise((resolve,reject)=>{phase='module:'+name;const script=document.createElement('script');script.src='modules/'+name+'.js';const failed=error=>{removeEventListener('error',failed);reject(Error(name+': '+(error.message||'Script load failed')));};addEventListener('error',failed);script.onload=()=>{removeEventListener('error',failed);resolve();};script.onerror=failed;document.head.append(script);});}
 // Record actual opened cards separately from the original lookup implementation.
 const viewed=new WeakSet();new MutationObserver(()=>{for(const card of document.querySelectorAll('.tomoyo-selection-card')){if(viewed.has(card))continue;const surface=card.querySelector('.tomoyo-word-heading strong')?.textContent?.trim();if(surface){viewed.add(card);api('reader_message',{message:{type:'lookupViewed',surface,operationId:crypto.randomUUID()}}).catch(()=>{});}}}).observe(document.body,{childList:true,subtree:true});
 await import('./word-status.js');installLearningNotice(window.__tomoyoChinese);loaded=true;for(const message of queued.splice(0))event(message);
 installHostRegions(message=>api('reader_message',{message}).catch(error=>{status.textContent=String(error);}));
 installGameUiScan(window.__tomoyoChinese);
 deliver(await api('reader_message',{message:{type:'loadGalPreferences'}}));window.__TOME_READER_READY__=true;document.documentElement?.classList?.add?.('megulit-ready');await health('ready');
 const set=Storage.prototype.setItem;let timer;Storage.prototype.setItem=function(key,value){set.call(this,key,value);if(this===localStorage&&/^(tome|tomoyo)-/.test(key)&&!/key|token|secret|password/i.test(key)){clearTimeout(timer);timer=setTimeout(()=>{uiState=snapshot();api('preserve_ui',{values:uiState}).catch(()=>{});},400);}};
}catch(error){status.textContent=String(error);await health(phase,error);}
