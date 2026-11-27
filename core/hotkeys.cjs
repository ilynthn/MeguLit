// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The user's hotkeys (2026-11-27): data/config/hotkeys.json, read and written only here. Every function takes the config
   folder (data/config: layout.config, Settings.folder). What a binding is, how it is checked
   and shown belongs to web/hotkeys.js (shared with the pages). A save goes to GalWindowBridge at once ({type:'hotkeys'}) and
   to every page ('reader-event' {type:'hotkeys'}), so a changed key works and every hint shows it without a restart. */
const fs=require('node:fs'),path=require('node:path');
const keys=require('../web/hotkeys.js');
const file=folder=>path.join(folder,'hotkeys.json');
function stored(folder){try{const v=JSON.parse(fs.readFileSync(file(folder),'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
function read(folder){return keys.clean(stored(folder));}
function atomic(target,value){fs.mkdirSync(path.dirname(target),{recursive:true});const tmp=target+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,target);}
/* a change of one or more actions; refused as a whole (nothing written) when a value is not a binding, is kept by Windows,
   or lands on a key another action keeps. Error codes: HOTKEY_INVALID / HOTKEY_RESERVED / HOTKEY_MODIFIER / HOTKEY_CONFLICT:<other action> */
function save(folder,changes){
 if(!changes||typeof changes!=='object'||Array.isArray(changes))throw Error('HOTKEY_INVALID');
 const next={...read(folder)};
 for(const [action,value] of Object.entries(changes)){
  if(!keys.ACTIONS.includes(action))throw Error('HOTKEY_INVALID');
  if(value===null){next[action]=keys.DEFAULTS[action];continue;}
  const r=keys.check(value);if(!r.ok)throw Object.assign(Error(r.reason==='reserved'?'HOTKEY_RESERVED':r.reason==='modifier'?'HOTKEY_MODIFIER':'HOTKEY_INVALID'),{action});
  next[action]=r.value;
 }
 for(const action of [...Object.keys(changes),...keys.ACTIONS]){const other=keys.conflict(next,action,next[action]);if(other)throw Object.assign(Error('HOTKEY_CONFLICT:'+other),{action,other});}
 atomic(file(folder),next);return read(folder);
}
/* 2026-11-26 the log key was chosen in the log page and kept in the reader's own storage: taken over once, only while
   hotkeys.json has no log key of its own */
function adoptLog(folder,value){const s=stored(folder);if(Object.hasOwn(s,'log'))return null;const r=keys.check(value);if(!r.ok||keys.conflict(read(folder),'log',r.value))return null;return save(folder,{log:r.value});}
const state=folder=>({bindings:read(folder),defaults:{...keys.DEFAULTS}});
/* GalWindowBridge reads the same set from MEGULIT_HOTKEYS at start (no default key is taken first and given back later) */
const nativeEnv=folder=>JSON.stringify(keys.nativeSpec(read(folder)));
const nativeCommand=folder=>({type:'hotkeys',...keys.nativeSpec(read(folder))});
/* after a save: the bridge and the pages */
function publish(folder,runtime){const bindings=read(folder);try{runtime?.reader?.gal?.send?.(nativeCommand(folder));}catch{}try{runtime?.emit?.('reader-event',{type:'hotkeys',bindings});}catch{}return bindings;}
/* a text written with the default keys, with the chosen ones (bridge messages such as 「Alt+H 可隐藏」) */
const localize=(folder,text,lang='zh')=>keys.localizeWith(read(folder),text,lang);
module.exports={localize,file,read,save,adoptLog,state,nativeEnv,nativeCommand,publish};
